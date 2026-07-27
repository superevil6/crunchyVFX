#!/usr/bin/env python3
"""Vendor the CrunchySFX synthesis engine into this repo.

    python3 tools/pull-synth.py                 # regenerate upstream, then pull
    python3 tools/pull-synth.py --no-export     # pull whatever is already exported
    python3 tools/pull-synth.py --repo ../foo   # non-default sibling location
    python3 tools/pull-synth.py --check         # verify the vendored copy, change nothing

By default this RUNS the upstream export first, so `pull` always means "take what CrunchySFX
looks like right now" rather than "take whatever happened to be lying in its output folder".

What lands here is one generated file, crunchysfx-synth.js, exposing a single `CrunchySynth`
global. It is deliberately vendored rather than referenced: this app has to work from a plain
unzipped folder on file://, so a path into a sibling repo is not an option, and pinning a copy
means an upstream edit can never silently change the sounds this app ships.

synth-manifest.json records what was pulled. --check re-verifies the copy against it (and against
the export's own embedded sha256), which is what the regression suite calls.
"""

import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VENDORED = ROOT / "crunchysfx-synth.js"
MANIFEST = ROOT / "synth-manifest.json"
DEFAULT_REPO = ROOT.parent / "crunchyfx"
REL_EXPORT = pathlib.Path("synth-export") / "crunchysfx-synth.js"


def die(msg):
    sys.exit("pull-synth: " + msg)


def payload_digest(text):
    """sha256 of everything after the banner, with the SHA256 field blanked — the same recipe
    export-synth.py uses, so the file can vouch for itself."""
    end = text.find("*/")
    if end < 0:
        return None, None
    declared = (re.search(r"\*\s+sha256\s+([0-9a-f]{64})", text[:end]) or [None, None])[1]
    body = text[end + 3:]
    if declared:
        body = body.replace(declared, "")
    return declared, hashlib.sha256(body.encode()).hexdigest()


def read_field(text, name):
    m = re.search(r"%s:\s*\"([^\"]*)\"" % name, text)
    return m.group(1) if m else "?"


def check(verbose=True):
    if not VENDORED.exists():
        die("no vendored engine — run  python3 tools/pull-synth.py")
    text = VENDORED.read_text()
    declared, actual = payload_digest(text)
    if not declared:
        die("the vendored engine has no sha256 banner — it is not a real export.")
    if declared != actual:
        die("the vendored engine has been modified by hand (sha256 %s != %s).\n"
            "  It is a GENERATED file: change the CrunchySFX sources and re-pull instead."
            % (declared[:12], actual[:12]))
    if MANIFEST.exists():
        man = json.loads(MANIFEST.read_text())
        if man.get("sha256") != declared:
            die("synth-manifest.json records sha256 %s but the file is %s — one of them is stale. "
                "Re-run  python3 tools/pull-synth.py" % (str(man.get("sha256"))[:12], declared[:12]))
    if verbose:
        print("ok  crunchysfx-synth.js  v%s  from %s  sha256 %s…"
              % (read_field(text, "VERSION"), read_field(text, "BUILT"), declared[:12]))
    return declared


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=str(DEFAULT_REPO), help="path to the crunchysfx repo")
    ap.add_argument("--no-export", action="store_true", help="do not regenerate upstream first")
    ap.add_argument("--check", action="store_true", help="verify the vendored copy only")
    args = ap.parse_args()

    if args.check:
        check()
        return

    repo = pathlib.Path(args.repo).expanduser().resolve()
    if not (repo / "synth.js").exists():
        die("no CrunchySFX at %s (expected synth.js there). Pass --repo <path>." % repo)

    if not args.no_export:
        exporter = repo / "tools" / "export-synth.py"
        if not exporter.exists():
            die("no export script at %s — is that repo up to date?" % exporter)
        print("running the upstream export…")
        r = subprocess.run([sys.executable, str(exporter)], cwd=str(repo))
        if r.returncode != 0:
            die("the upstream export failed — nothing was changed here.")

    src = repo / REL_EXPORT
    if not src.exists():
        die("no export at %s" % src)

    text = src.read_text()
    declared, actual = payload_digest(text)
    if not declared or declared != actual:
        die("the upstream export failed its own sha256 check — refusing to vendor it.")

    old = payload_digest(VENDORED.read_text())[0] if VENDORED.exists() else None
    shutil.copyfile(src, VENDORED)
    version, built = read_field(text, "VERSION"), read_field(text, "BUILT")
    MANIFEST.write_text(json.dumps({
        "_comment": "Written by tools/pull-synth.py. crunchysfx-synth.js is a GENERATED vendored "
                    "file — edit the CrunchySFX sources and re-pull, never the copy.",
        "source": "crunchysfx",
        "version": version,
        "built": built,
        "sha256": declared,
        "bytes": len(text),
    }, indent=2) + "\n")

    if built.endswith("-dirty"):
        print("WARNING: exported from a DIRTY upstream tree — the sounds this app ships are not "
              "reproducible from any commit. Commit CrunchySFX and re-pull before releasing.")
    verb = "unchanged" if old == declared else ("updated from " + old[:12] + "…" if old else "vendored")
    print("%s  crunchysfx-synth.js  v%s  from %s  sha256 %s…  (%.0f KB)"
          % (verb, version, built, declared[:12], len(text) / 1024.0))


if __name__ == "__main__":
    main()

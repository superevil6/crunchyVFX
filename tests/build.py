#!/usr/bin/env python3
"""Generate the test pages.

The app is one big inline <script> in index.html, and fetch() is CORS-blocked on file://, so a
test page can't pull it in at run time. Instead we concatenate: index.html verbatim, then the
suite appended as another classic script — which shares the same global scope and can therefore
poke at `state`, `PARAMS`, `simulate`, the modals, everything, exactly as the app sees them.

  python3 tests/build.py              ->  tests/run.html, tests/run-async.html (the two original suites)
  python3 tests/build.py <suite>      ->  tests/run-<suite>.html, one of SUITES below

The named suites (VFX-DESIGN §18, the planted Library) are ASYNC and report through dump(): run them
with `node tests/run-ff.mjs <suite>` (a headless Firefox that prints the page's lines and stops at its
last one). Some inject scripts BEFORE the app's (a mocked window.__TAURI__, the browser store as HEAD
left it), so the page boots as the desktop app does.
"""
import pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
APP = (HERE.parent / "index.html").read_text()

# The app's APP_VERSION and the Tauri bundle version have to agree. They live in different files
# and nothing else connects them, so drift is silent until a bug report quotes a version that was
# never shipped. Cheapest possible place to catch it: the build every test run goes through.
import json, sys
_conf = HERE.parent / "src-tauri" / "tauri.conf.json"
if _conf.exists():
    _app = re.search(r'const APP_VERSION = "([^"]+)"', APP)
    _bundle = json.loads(_conf.read_text()).get("version")
    if not _app:
        sys.exit("build.py: index.html has no APP_VERSION constant")
    if _app.group(1) != _bundle:
        sys.exit("build.py: version drift — index.html says %s, tauri.conf.json says %s"
                 % (_app.group(1), _bundle))

# index.html loads its siblings by relative path, so rebase them to the parent directory. EVERY
# sibling (a new runtime file needs no edit here): any bare file name ending .js/.css/.png/.svg.
APP = re.sub(r'(src|href)="([A-Za-z0-9_.\-]+\.(?:js|css|svg|png))"', r'\1="../\2"', APP)

# suite: (its test script, the scripts injected BEFORE the app's)
SUITES = {
    "hash": ("frame-hash.js", []),                                                   # every preset's frames + export bytes
    "fixtures": ("make-fixtures.js", []),                                            # run ONCE on the build being protected
    "web": ("regression-web.js", ["fixtures/head.js", "seed-head.js"]),              # the web build over HEAD's saved state
    "desktop": ("regression-desktop.js", ["tauri-mock.js", "fixtures/head.js", "seed-head.js"]),
    "godot": ("godot-plant.js", ["tauri-mock.js", "fixtures/head.js", "seed-head.js"]),   # tests/godot-check.mjs runs it
    "scene": ("godot-scene.js", []),                                                 # tests/godot-scene.mjs runs it (§26, the web build)
    "show": ("show-desktop.js", ["tauri-mock.js", "fixtures/head.js", "seed-head.js"]),   # a look, for wkshot.py
}


def page(test, before):
    out = APP
    if before:
        pre = "".join("<script>\n" + (HERE / f).read_text() + "\n</script>\n" for f in before)
        out = out.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + pre, 1)
    # INLINE the suite rather than <script src>. Under file:// every file is its own origin, so an
    # error inside a linked script is reported as an opaque "Script error. @ 0" with no line number
    # — which turns a one-line typo into a hunt. Inlined, failures name themselves.
    return out + "\n<script>\n" + (HERE / test).read_text() + "\n</script>\n"


if len(sys.argv) > 1:
    name = sys.argv[1]
    if name not in SUITES:
        sys.exit("no such suite: %s (%s)" % (name, ", ".join(SUITES)))
    test, before = SUITES[name]
    (HERE / ("run-%s.html" % name)).write_text(page(test, before))
    print("wrote tests/run-%s.html  (%s)" % (name, test))
    sys.exit(0)

for suite, out in (("regression.js", "run.html"), ("regression-async.js", "run-async.html")):
    if not (HERE / suite).exists():
        continue
    (HERE / out).write_text(page(suite, []))
    print("wrote tests/%s  (%s, inlined)" % (out, suite))

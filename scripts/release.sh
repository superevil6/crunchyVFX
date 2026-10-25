#!/usr/bin/env bash
# CrunchyVFX release script: checks everything, bumps the version everywhere, commits, and pushes the tag that makes
# CI build both desktop builds and ship them to itch.io. Ported from CrunchySFX's scripts/release.sh. RELEASE.md is
# the runbook around it (the rules: never publish the GitHub draft; tags are immutable; never ship a local binary).
#
#   ./scripts/release.sh 1.0.1          # do it (asks before it commits or pushes anything)
#   ./scripts/release.sh 1.0.1 --dry    # the checks, and the diff it WOULD commit; writes nothing, pushes nothing
#
# Written in bash (runs fine from fish: just `./scripts/release.sh 1.0.1`).
#
# The 5 places the version lives, which must agree with the tag (tests/build.py and tests/worker.test.mjs check it):
#   src-tauri/tauri.conf.json                  "version": "x.y.z"
#   src-tauri/Cargo.toml                       version = "x.y.z"   (+ Cargo.lock)
#   flatpak/com.crunchyvfx.app.metainfo.xml    <release version="x.y.z" …/>  (newest first)
#   index.html                                 const APP_VERSION = "x.y.z"   (what the update check compares)
#   version.json                               served at crunchyvfx.com/version.json: what the DESKTOP app polls to
#                                              decide whether to show its "update available" banner.
#                                              Edit its "notes" by hand before releasing: users see that text.
#
# Asked for the version the files ALREADY carry (the first release: 1.0.0 was bumped by hand), it bumps nothing and
# goes straight to the tag, as long as that tag does not exist yet.
#
# Then: commit, push main (ships the WEB build via Cloudflare), push the tag (CI ships the Windows .exe and the Linux
# Flatpak to itch).

set -euo pipefail

die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '\033[32m✔\033[0m %s\n' "$*"; }
info(){ printf '\033[36m→\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m! %s\033[0m\n' "$*"; }

VERSION="${1:-}"
DRY=""
[[ "${2:-}" == "--dry" || "${2:-}" == "-n" ]] && DRY=1

[[ -n "$VERSION" ]] || die "usage: $0 <version> [--dry]   e.g. $0 1.0.1"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be x.y.z (got '$VERSION')"

cd "$(git rev-parse --show-toplevel)" || die "not inside a git repo"
TAG="v$VERSION"
META=flatpak/com.crunchyvfx.app.metainfo.xml
FILES=(src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json "$META" index.html version.json)

# Heavy suites run under a memory cap where systemd is there to give one (the suite's rule on this box).
cap() { local mem="$1"; shift; if command -v systemd-run >/dev/null 2>&1; then systemd-run --user --scope -q -p MemoryMax="$mem" "$@"; else "$@"; fi; }

# ---------------------------------------------------------------- pre-flight: the repo
BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo detached)"
[[ "$BRANCH" == "main" ]] || die "on branch '$BRANCH': releases are cut from main"

if ! git diff --quiet || ! git diff --cached --quiet; then
  if [[ -n "$DRY" ]]; then
    warn "working tree has uncommitted changes (a real run refuses: it makes its own commit). --dry carries on."
  else
    die "working tree has uncommitted changes: commit them first (this script makes its own commit)"
  fi
fi

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists locally: tags are immutable, use the next version"
if git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists on origin: it has already shipped; use the next version"
fi

CURRENT="$(grep -m1 -oP '^version = "\K[^"]+' src-tauri/Cargo.toml)"
BUMP=1
if [[ "$CURRENT" == "$VERSION" ]]; then
  BUMP=""
  info "the files already carry $VERSION: nothing to bump, straight to the tag"
else
  info "current version: $CURRENT  →  new version: $VERSION"
fi

# ---------------------------------------------------------------- pre-flight: the checks (CLAUDE.md "Verifying changes")
info "version agreement + test pages (tests/build.py)…"
python3 tests/build.py >/dev/null || die "tests/build.py failed (version drift?)"
ok "tests/build.py"
node tests/worker.test.mjs >/dev/null || die "node tests/worker.test.mjs failed (the edge handler, version.json, the search-engine pass)"
ok "worker.test.mjs (+ seo.test.mjs, version.json)"
node tests/plant.test.mjs >/dev/null || die "node tests/plant.test.mjs failed"
ok "plant.test.mjs"
node tools/pull-core.mjs --check --strict || die "pull-core --check --strict: every core copy must be pinned to a COMMITTED, current crunchyCore (commit the core, then node tools/pull-core.mjs)"
ok "core copies pinned and current"
python3 tools/pull-synth.py --check >/dev/null || die "python3 tools/pull-synth.py --check failed (the vendored synth was edited?)"
ok "vendored synth intact"

info "checking the Rust build…"
(cd src-tauri && cargo check --quiet --offline 2>/dev/null) \
  || (cd src-tauri && cargo check --quiet) \
  || die "cargo check failed: fix the build before releasing"
ok "cargo check passed"

if [[ -n "$DRY" ]]; then
  info "--dry: skipping the browser and Godot suites (a real run runs them): node tests/run-ff.mjs web|desktop|hash, node tests/godot-check.mjs, node tests/godot-scene.mjs"
else
  WIP="${XDG_CACHE_HOME:-$HOME/.cache}/crunchy-wip/vfx-release"; mkdir -p "$WIP"
  info "browser suites (headless Firefox, a few minutes)…"
  cap 8G node tests/run-ff.mjs web --quiet     || die "the web suite failed (node tests/run-ff.mjs web)"
  ok "web suite"
  cap 8G node tests/run-ff.mjs desktop --quiet || die "the desktop suite failed (node tests/run-ff.mjs desktop)"
  ok "desktop suite"
  cap 8G node tests/run-ff.mjs hash | grep -v '(console)' > "$WIP/hash.txt" || true
  diff -q tests/frame-hash.expected.txt "$WIP/hash.txt" >/dev/null || die "the frame hash moved: diff tests/frame-hash.expected.txt $WIP/hash.txt"
  ok "frame hash unchanged"
  cap 3G node tests/godot-check.mjs >/dev/null || die "node tests/godot-check.mjs failed"
  cap 3G node tests/godot-scene.mjs >/dev/null || die "node tests/godot-scene.mjs failed"
  ok "Godot checks (they skip without godot)"
  warn "the screenshot suite (tests/run.html) is judged by eye: run it and read the banner before you say yes below"
fi

# ---------------------------------------------------------------- bump versions
TODAY="$(date +%F)"

# Edits the file at $1 (a path, the real one or a scratch copy) — only the FIRST match in each file is touched
# (0,/…/), so dependency version strings in Cargo.toml are never rewritten.
apply_to() {
  local root="$1"
  sed -i -E "0,/^version = \"[^\"]*\"/s//version = \"$VERSION\"/" "$root/src-tauri/Cargo.toml"
  sed -i -E "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$VERSION\"/" "$root/src-tauri/tauri.conf.json"
  sed -i -E "0,/const APP_VERSION = \"[^\"]*\"/s//const APP_VERSION = \"$VERSION\"/" "$root/index.html"
  sed -i -E "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$VERSION\"/" "$root/version.json"
  # the Cargo.lock entry for this crate only
  sed -i -E "/^name = \"crunchyvfx\"$/{n;s/^version = \"[^\"]*\"/version = \"$VERSION\"/}" "$root/src-tauri/Cargo.lock"
  # AppStream: prepend a <release> entry (skip if this version is already listed)
  if ! grep -q "release version=\"$VERSION\"" "$root/$META"; then
    sed -i "s|<releases>|<releases>\n    <release version=\"$VERSION\" date=\"$TODAY\"/>|" "$root/$META"
  fi
}

if [[ -n "$DRY" ]]; then
  if [[ -n "$BUMP" ]]; then
    # A DRY run never writes the repo: the edits go to scratch copies, and the diff is against those.
    SCRATCH="$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/crunchyvfx-release-dry.XXXXXX")"
    trap 'rm -rf "$SCRATCH"' EXIT
    for f in "${FILES[@]}"; do mkdir -p "$SCRATCH/$(dirname "$f")"; cp "$f" "$SCRATCH/$f"; done
    apply_to "$SCRATCH"
    printf '\n\033[1m--- the diff that WOULD be committed (applied to scratch copies; the repo is untouched) ---\033[0m\n'
    for f in "${FILES[@]}"; do diff -u --label "a/$f" --label "b/$f" "$f" "$SCRATCH/$f" || true; done
  else
    info "--dry: nothing to bump"
  fi
  printf '\n\033[33m--dry: nothing was written, committed, tagged or pushed.\033[0m\n'
  printf 'version.json notes (shown in the desktop update banner):\n  %s\n' "$(grep -oP '"notes":\s*"\K[^"]*' version.json)"
  printf 'A real run would: run the browser and Godot suites, %spush main, then tag %s and push it.\n' "${BUMP:+bump + commit, }" "$TAG"
  exit 0
fi

if [[ -n "$BUMP" ]]; then
  apply_to "."
  for f in "${FILES[@]}"; do ok "bumped $f"; done
  python3 tests/build.py >/dev/null || die "tests/build.py: the bump left the versions disagreeing"
  printf '\n\033[1m--- changes to be committed ---\033[0m\n'
  git --no-pager diff --stat
fi

# ---------------------------------------------------------------- confirm
cat <<EOF

Reminder: version.json "notes" is shown verbatim in the desktop update banner. It says:
  $(grep -oP '"notes":\s*"\K[^"]*' version.json)

This will:
$( [[ -n "$BUMP" ]] && echo "  1. commit the version bump" || echo "  1. (nothing to commit: the files already carry $VERSION)")
  2. push main            → Cloudflare redeploys crunchyvfx.com (the free web build, and version.json)
  3. push tag $TAG        → CI builds a DRAFT GitHub release and pushes to itch.io:
                              windows-latest → .exe          → sevi66/crunchyvfx:windows
                              ubuntu-22.04   → .deb→Flatpak  → sevi66/crunchyvfx:linux-flatpak

EOF
# Drop anything typed during the long checks (CrunchyShader 1.0.0: a stray Enter answered "no" at once), then ask the terminal
while read -r -t 0.2 -n 10000 _ </dev/tty 2>/dev/null; do :; done
read -r -p "Proceed? [y/N] " reply </dev/tty
if [[ ! "$reply" =~ ^[Yy]$ ]]; then
  [[ -n "$BUMP" ]] && git checkout -- "${FILES[@]}"
  die "aborted${BUMP:+: version bump reverted}"
fi

# ---------------------------------------------------------------- ship
if [[ -n "$BUMP" ]]; then
  git add "${FILES[@]}"
  git commit -m "Release $TAG"
  ok "committed"
fi

git push origin main
ok "pushed main: crunchyvfx.com will redeploy"

git tag -a "$TAG" -m "CrunchyVFX $TAG"
git push origin "$TAG"
ok "pushed $TAG: CI is building the desktop releases"

cat <<EOF

$(printf '\033[32m✔ Released %s\033[0m' "$TAG")

Next (RELEASE.md):
  • Watch the build:   https://github.com/superevil6/crunchyVFX/actions
  • When green:        butler status sevi66/crunchyvfx
  • Install BOTH from itch (Flatpak on Linux, the installer on Windows) and run the install test.
  • REMINDER: the GitHub release is a DRAFT on purpose. Never publish it, or the paid installers
    become free public downloads.
EOF

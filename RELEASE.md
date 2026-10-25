# Releasing CrunchyVFX's desktop app

The pipeline is CrunchySFX's, which has shipped three times, and CrunchyTile's (`~/Code/crunchyfx/ITCH-RELEASE.md` and
`WINDOWS-RELEASE-PLAYBOOK.md` have the long versions and their war stories; `~/Code/crunchyTile/RELEASE.md` the short
one). VFX-DESIGN §30. **AJ runs every step that tags, pushes, publishes or charges.**

## The rules that bite if you forget

1. **Never click "Publish release" on the GitHub draft.** The draft holds the raw installers; publishing makes the paid
   desktop app a free public download. It is a private archive, nothing more.
2. **Tags are immutable.** If CI fails after a tag, fix it and ship the next version. (One exception, from SFX's
   playbook: a workflow/config failure where NOTHING reached itch may move the tag onto the fix and force-push it. A tag
   build runs the workflow AS IT WAS at the tagged commit, so re-running the failed job alone changes nothing.)
3. **Never ship a locally built binary.** A build on this box links CachyOS's glibc (needs GLIBC_2.39) and will not run
   on other distros or inside the Flatpak runtime. CI's ubuntu-22.04 build is the only one that ships. Don't
   "modernize" that runner to `ubuntu-latest` either.
4. **No AppImage.** The Flatpak (made from CI's .deb) is the Linux product: an AppImage's bundled GL blank-screens on new
   GPUs (`EGL_BAD_PARAMETER`) and its bundled GStreamer had no sound on rolling distros (SFX 1.2.1, 2026-10-16).
5. **The version lives in five places** and they must agree with the tag: `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` (+ `Cargo.lock`), `APP_VERSION` in index.html, the newest `<release>` in
   `flatpak/com.crunchyvfx.app.metainfo.xml`, and `version.json`. `tests/build.py` (also run by CI) and
   `tests/worker.test.mjs` fail on drift; `scripts/release.sh` bumps all five.
6. **Line endings are LF everywhere** (`.gitattributes`): a CRLF checkout on Windows changes every crunchyCore copy's
   bytes and the core check fails (CrunchyTile v1.0.0's first Windows build).

## Once, before the first release

1. **The itch.io page** `sevi66/crunchyvfx` (the slug must match `ITCH_TARGET` in
   `.github/workflows/desktop-build.yml` and the `url` in `version.json`; ASSUMED from SFX's pattern, confirm when the
   page exists). Kind: Downloadable (no HTML embed; link the free web build at https://crunchyvfx.com/ at the top of
   the description). Price: **$6** (AJ, 2026-10-16: the same as SFX; "consistency is key", an impulse price). Screenshots, a cover (crop `og.png`), and the Windows SmartScreen note
   (the installer is unsigned). AI disclosure as SFX did it: Yes, "AI Generated Code" only (the effects are drawn in
   code, no generative AI in the output). Leave it unpublished until the install tests pass.
2. **The `BUTLER_API_KEY` secret** in this GitHub repo's settings (Settings → Secrets and variables → Actions; the same
   itch key SFX and Tile use). Without it CI still builds, and skips the upload with a warning. `GITHUB_TOKEN` is
   automatic.
3. **A person clicks the native dialogs once** (VFX-DESIGN §18, still open): Plant in a folder (a real Godot game), save
   an effect, see it in `res://crunchy/vfx/` in the Godot editor, save again (updated in place), rename, delete.

## Each release

1. **Write `version.json`'s `notes`.** The desktop app shows that line in its "update available" banner, verbatim.
2. **Check, then tag.** From a clean `main`:
   ```sh
   ./scripts/release.sh 1.0.0 --dry   # the fast checks + the diff it would commit; writes nothing
   ./scripts/release.sh 1.0.0         # every suite (browser, frame hash, Godot), then asks; commits, pushes main, tags
   ```
   The real run also asks you to read the screenshot suite (`tests/run.html`, CLAUDE.md "Verifying changes") before you
   say yes. For the first release the files already carry 1.0.0, so it bumps nothing and goes straight to the tag. By
   hand it is: `git push origin main && git tag -a v1.0.0 -m "CrunchyVFX v1.0.0" && git push origin v1.0.0`.
3. **Watch CI** (https://github.com/superevil6/crunchyVFX/actions). It builds Windows (NSIS) and Linux (.deb, wrapped as
   the Flatpak), makes the **DRAFT** GitHub release, and pushes `:windows` and `:linux-flatpak` to itch. Then
   `butler status sevi66/crunchyvfx`: both channels at the new version.
4. **Install both from itch.io, on machines that are not the dev box:**
   - **Linux (Flatpak):** `flatpak install --user ./CrunchyVFX-X.Y.Z.flatpak && flatpak run com.crunchyvfx.app`. Open,
     load a preset, **play with a sound** (a CrunchySFX link: audio is what broke on SFX's AppImage), Export, plant an
     effect into a real Godot project and open it in Godot, quit, reopen: the Library is still there.
   - **Windows:** run the installer past SmartScreen ("More info" → "Run anyway"), then the same steps. The Windows
     build is the one that caught the CRLF problem in Tile; if it opens with a core-files warning, stop.
   - The update banner: a desktop build older than `version.json` shows it on launch (Settings → Updates → Check now
     says "You're up to date" otherwise).
5. **Only then** flip the itch page to Public (first release) or let the itch app's auto-update carry it (later ones).

## The day the store page goes live (a crunchyCore edit: AJ's commit order)

**Set VFX's `desktop` link in `~/Code/crunchyCore/suite.js`** (`https://sevi66.itch.io/crunchyvfx`, with the price
shown the way the other live apps show theirs), bump `SUITE_BUILD`, add a CHANGELOG line; AJ commits crunchyCore, then
`node tools/pull-core.mjs` here and in every app. That one edit:
- shows the web's "Get the desktop app" button in CrunchyVFX (desktop.js shows it only once the link exists), and
- adds "Desktop ↗" to CrunchyVFX's row in every app's Crunchy suite dialog.

Also then: index.html's SoftwareApplication JSON-LD says operatingSystem "Web" only while suite.js has no VFX store
page (VFX-DESIGN §29): add the desktop's operating systems and offer when the link lands (a VFX edit, after the pull). The desktop app already allows
`https://sevi66.itch.io/*` in its opener scope, so nothing else changes.

## Linux notes (from SFX)

- **Bundle a .deb built on ubuntu-22.04** (CI's). The manifest (`flatpak/com.crunchyvfx.app.yml`) has the commands for a
  hand build; a local .deb builds a Flatpak that will not RUN (glibc).
- The Flatpak runtime (GNOME 50 since 1.1.0; 46 is end of life) brokers the host's GPU drivers and PipeWire, which is why it works where the AppImage
  did not.

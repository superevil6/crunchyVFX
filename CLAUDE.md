# CrunchyVFX — working notes

A procedural 2D sprite-VFX generator. Sibling to CrunchySFX (`../crunchyfx`), same ethos:
**no build step, no dependencies, opens on `file://`.** Classic `<script src>` files sharing one
global scope — never ES modules, never `fetch` for local files (CORS-blocked on `file://`).

**`VFX-DESIGN.md` is the source of truth** for architecture and past decisions. Read the relevant
section before changing something structural; most "why is it like this" questions are answered
there with the measurement that settled them.

---

## The one rule about commits

**Never run `git commit`, `git push`, or `git tag`** unless told to in that same message. The
maintainer handles every commit personally. Make and stage edits; stop there.

---

## Invariants that break things silently if violated

**`SHAPES` is append-only.** `shape` is stored as an *index* in every preset, share link and saved
effect. Inserting or reordering turns every saved heart into a cross. Shapes live in `shapes.js` as
`SHAPE_DEFS` records; add at the end.

**`state.shape` is the PRIMARY shape, not the selection.** The picker is multi-select; the extras
live in `shapeMix` (comma-joined indices, a `PATCH_EXTRAS` string) and Layer B mirrors it with
`emit2ShapeMix`. Read `shapeSet(state.shape, state.shapeMix)` whenever you care about what actually
draws — `state.shape` alone silently ignores every shape after the first. It's split that way
because `shape` is a stored index in every preset and share link and had to keep its old meaning.

**Every `PARAMS` default must be neutral/off.** `applyPreset` resets to defaults then overlays, so
a non-neutral default silently changes every existing preset that doesn't mention that key.

**A new frontend file needs three registrations** or it half-works — the web build is fine while
the desktop build is blank, or the suite can't see it:
1. `<script src>` in `index.html`
2. `FRONTEND` in `src-tauri/build.rs` (bump the array length)
3. the rebase list in `tests/build.py`

**Anything not generated from `PARAMS` needs its own container.** Panels are built from PARAMS
groups. Three separate times a finished feature turned out to be unreachable because it needed a
*second* table to be visible (`custom`/`image` missing from `SHAPE_CATS`; the custom-sprite panel
never created; `randomize` frozen to a three-system list). The structural audit in
`tests/regression.js` now checks this — if you add UI that isn't a slider, make sure something
covers it.

**`BREED_SKIP` is derived, not listed.** Every categorical param (kind `enum`/`shape`/`shape2`) is
excluded from breeding automatically, because nudging an index by a fraction of its range gives you
an unrelated effect rather than a sibling. Add an enum and it's handled; an assertion checks it.

**Don't count `name:` lines in `shapes.js` to get a shape index** — that order is not `SHAPES`
order, and a wrong index is a plausible-looking preset that draws the wrong particle. Ask the
running app: `SHAPES.indexOf("smoke")`.

**A new structure layer needs a `stage()` wrapper** in `drawFrame`, plus its group name in
`TIMED_LAYERS`. Miss either and the layer works but can never be sequenced — and nothing fails,
because "starts at 0" looks exactly like "has no delay set".

**Preset values bypass the slider clamp.** A preset object is written straight into `state`, so an
out-of-range value doesn't error — it produces a quietly broken effect. There's an assertion for
it; keep it passing.

**`crunchysfx-synth.js` is GENERATED.** Never edit it. Change the CrunchySFX sources and run
`python3 tools/pull-synth.py`. See VFX-DESIGN §9.

**Nothing user-facing names a console or chip.** Era styles and palettes are named for what they
look like (`Woodgrain`, `Micro`, `Pocket`, `Handheld Green`, `Fantasy 16`), never the machine — the
app is sold and its output ships in games people sell. Comments in `index.html` count: the file is
served as-is and readable via view-source. Export *engines* (Godot, Unity, Aseprite, Phaser) are
exempt — naming the target is what makes the export usable. An assertion scans the STYLES/palette/
tour/preset/shape tables and every rendered label and tooltip.

**Artwork must be CC0.** Every particle shape is drawn in code. Nothing bundled unless it is public
domain — the art ends up in sprite sheets users ship commercially, so any licence propagates to
*them*. See VFX-DESIGN §12.

**`APP_VERSION` (index.html) must match `version` (src-tauri/tauri.conf.json).** `tests/build.py`
exits non-zero on drift.

**New system → at least one preset** (two is the standard). An assertion fails otherwise, because a
system no preset uses is undiscoverable. New shape → an entry in `SHAPE_CATS` *and* `RANDOM_SHAPES`.

**A new file the app loads at runtime needs a FOURTH registration**, on top of the three above: it
must not be matched by `.assetsignore`, or the web deploy 404s it while every local build works.
The published set is deliberately tiny — see DEPLOY.md.

---

## Verifying changes

**The browser is the test runner** for the app itself — it's all DOM and canvas, so there is nothing
useful to run it in headless. (Node *does* exist here, v24, despite what this file used to say. It
earns its keep for exactly one thing: `worker.js` is an ES module full of Cloudflare globals and
can't be inlined into the browser suite, so it has its own runner —
`node tests/worker.test.mjs`. Don't reach for it for anything else.)

```sh
python3 tests/build.py          # concatenates index.html + a suite into tests/run*.html
firefox --headless --profile $(mktemp -d) --window-size=1400,3600 \
        --screenshot /tmp/out.png file:///path/to/tests/run.html
```

Read the screenshot: green banner = all passed, red lists failures.

**Always pass a fresh `--profile`.** Firefox caches `file://` assets and will happily screenshot
stale code, which looks exactly like "my fix did nothing".

`tests/regression.js` is synchronous (read the screenshot). `tests/regression-async.js` needs
`await`, so it writes `results.txt` via a download — run it with a profile configured to auto-save
downloads and read the file.

**For anything visual, render a contact sheet and actually look at it.** Assertions prove an effect
draws; only your eyes prove it looks like the thing it's named after. Several presets passed every
assertion while being nearly invisible.

---

## Headless traps that will waste your afternoon

Each of these produced a convincing false result at least once:

- **`--screenshot` fires at `window.load`.** Anything behind an `await` finishes after the shot and
  silently never appears — that's why the async suite downloads a file instead.
- **`--screenshot` captures the FULL PAGE**, so `position: fixed` overlays (the tour, modals) don't
  land where a viewport layout puts them. Assert coordinates, don't eyeball.
- **CSS transitions get caught mid-flight.** The headless clock stops at load, so a button that just
  changed state screenshots in its *old* colour. Read `getComputedStyle` with the transition
  overridden instead. (Cost me a bug hunt on a button that was never broken.)
- **`[hidden]` loses to any author `display` rule.** `.foo { display: flex }` beats the UA's
  `[hidden] { display: none }`, so hiding does nothing. Add an explicit `[hidden]` companion, and
  assert on `getComputedStyle(...).display`, not on the `hidden` property.
- **`localStorage.setItem = fn` does NOT stub the method** — `Storage` treats unknown property
  assignment as *storing a key*. Stub `Storage.prototype.setItem`.
- **TDZ kills the whole script.** Parse-time code referencing a `const` declared later leaves the
  earlier UI built and everything after it missing — the page looks fine and does nothing. A
  `window.onerror` probe injected before the app script finds it in one run.
- **A cloned `<canvas>` is blank.** `cloneNode` doesn't copy the bitmap, so screenshotting a cloned
  panel shows an empty canvas.

## One rendering gotcha worth knowing

**Fit is on by default, and under Fit travel distance costs apparent size.** Fit scales to the
bounding box across *all* frames, so a fast or far-travelling effect shrinks itself into specks.
When a preset looks too small, the fix is almost always *less travel and bigger particles* — never
more particles.

---

## Layout

| | |
|---|---|
| `index.html` | markup + all app JS (PARAMS, UI generation, presets browser, export, tour) |
| `vfx.js` | pure sim + raster — `simulate`, `renderFrames`, `streamFrames`, layer systems, post chain |
| `shapes.js` | particle drawings only, one `SHAPE_DEFS` record each |
| `presets.js` | preset data + category layout |
| `crunchysfx-synth.js` | **generated** — vendored CrunchySFX audio engine |
| `styles.css` | all CSS |
| `tests/` | `build.py` + the two browser suites + `worker.test.mjs`; see `tests/README.md` |
| `tools/pull-synth.py` | re-vendors the synth engine from `../crunchyfx` |
| `src-tauri/` | desktop wrapper; `flatpak/` is the Linux distributable |
| `worker.js` + `wrangler.jsonc` | Cloudflare edge handler: version-stamps subresources, renders per-effect share cards. `DEPLOY.md` is the runbook |
| `.assetsignore` | what the web deploy does **not** publish — without it, the whole repo ships |

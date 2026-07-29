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

**Preset values bypass the slider clamp.** A preset object is written straight into `state`, so an
out-of-range value doesn't error — it produces a quietly broken effect. There's an assertion for
it; keep it passing.

**`crunchysfx-synth.js` is GENERATED.** Never edit it. Change the CrunchySFX sources and run
`python3 tools/pull-synth.py`. See VFX-DESIGN §9.

**Artwork must be CC0.** Every particle shape is drawn in code. Nothing bundled unless it is public
domain — the art ends up in sprite sheets users ship commercially, so any licence propagates to
*them*. See VFX-DESIGN §12.

**`APP_VERSION` (index.html) must match `version` (src-tauri/tauri.conf.json).** `tests/build.py`
exits non-zero on drift.

**New system → at least one preset** (two is the standard). An assertion fails otherwise, because a
system no preset uses is undiscoverable. New shape → an entry in `SHAPE_CATS` *and* `RANDOM_SHAPES`.

---

## Verifying changes

There is no JS runtime on this box — **the browser is the test runner.**

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
| `tests/` | `build.py` + the two suites; see `tests/README.md` |
| `tools/pull-synth.py` | re-vendors the synth engine from `../crunchyfx` |
| `src-tauri/` | desktop wrapper; `flatpak/` is the Linux distributable |

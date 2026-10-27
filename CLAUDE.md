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

**An empty shape selection means different things in different pickers.** For the emitter and
Layer B it would mean "draw nothing", so the last shape cannot be deselected. For Orbit it means
"follow the particles", so deselecting the last one is how you get back to inheriting. That
asymmetry is deliberate — it is what let Orbit gain a picker without changing any existing effect.

**Every `PARAMS` default must be neutral/off.** `applyPreset` resets to defaults then overlays, so
a non-neutral default silently changes every existing preset that doesn't mention that key.

**A new frontend file needs three registrations** or it half-works — the web build is fine while
the desktop build is blank, or the suite can't see it:
1. `<script src>` in `index.html`
2. `FRONTEND` in `src-tauri/build.rs` (bump the array length)
3. the subresource counts in the prose of `worker.js`, `DEPLOY.md` and `.assetsignore` (`tests/build.py` rebases every
   sibling by pattern, and since §30 the CI workflow has no copy line of its own: build.rs fills `dist/`)

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

**A tutorial step is a selector into a UI that moves.** An assertion runs each step's `before()`
and checks the target exists, which catches a RENAMED control (`#randomBtn` → `#rand`, caught
exactly this way). It cannot catch a MOVED feature: the step still points at something real while
describing the wrong place. Re-read the tutorial copy by hand whenever a feature moves.

**Preset values bypass the slider clamp.** A preset object is written straight into `state`, so an
out-of-range value doesn't error — it produces a quietly broken effect. There's an assertion for
it; keep it passing.

**`suite.js`, `crunchy-base.css` and `crunchy-icons.js` are GENERATED from crunchyCore** (VFX-DESIGN §17). Never
edit them; change `~/Code/crunchyCore`, then `node tools/pull-core.mjs` (`--check` verifies the copies). The base
owns the shared look (neutrals, square corners, the hard step, buttons, selects, sliders, checkboxes); `styles.css`
keeps VFX's layout and its violet `--accent` only. Square is for CHROME: no `border-radius`, no blurred shadows,
glows or decorative gradients; anything round by meaning sets `border-radius: 50%` itself. Chrome uses pixel icons
(`data-icon`, `iconsIn`, and `setIconLabel` for a label a script rewrites), not emoji.

**`plant.js`, `library.js`, `settings.js`, `desktop.js`, `feedback.js`, `glyphs.js` (and the game moment's and palette's files: `shader.js`, `hero.js`, `moments*.js`, `palette.js`, `palette-ui.js`, `colorsets.js`) are GENERATED from crunchyCore too** (§18, §20, §28, §32, §37), with the stamp
guard checking their builds. `project-app.js` is VFX's OWN (its `PROJECT_APP`: what a planted effect is) and loads
before plant.js. **The planted Library must write exactly what the Export dialog writes**: it calls `buildExportFiles`
with a context (`liveExportCtx()` is the default); a change to the export path is a change to planted files, and the
frame hash (below) is how you know the Export bytes did not move by accident. **Never rename or reshape a
`crunchyvfx.*` storage key**: people's My Effects live there; planting COPIES from it and never writes it.

**`crunchysfx-synth.js` is GENERATED.** Never edit it. Change the CrunchySFX sources and run
`python3 tools/pull-synth.py`. See VFX-DESIGN §9.

**Nothing user-facing names a console or chip.** Era styles and palettes are named for what they
look like (`Woodgrain`, `Micro`, `Pocket`, `Handheld Green`, `Fantasy 16`), never the machine — the
app is sold and its output ships in games people sell. Comments in `index.html` count: the file is
served as-is and readable via view-source. Export *engines* (Godot, Unity, Aseprite, Phaser) are
exempt — naming the target is what makes the export usable. An assertion scans the STYLES/palette/
tour/preset/shape tables and every rendered label and tooltip.

**Artwork must be CC0.** Every particle shape is drawn in code. Nothing bundled unless it is public
domain — the art ends up in sprite sheets users ship commercially, so any license propagates to
*them*. See VFX-DESIGN §12.

**`APP_VERSION` (index.html) must match `version` (src-tauri/tauri.conf.json)**, and so must Cargo.toml, the Flatpak
metainfo's newest `<release>` and `version.json` (§30). `tests/build.py` exits non-zero on drift (CI runs it too);
`scripts/release.sh` bumps all five. RELEASE.md is the release runbook.

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
`node tests/worker.test.mjs`. Don't reach for it for anything else. It also spawns `tests/seo.test.mjs`, the
suite's generic search-engine check (VFX-DESIGN §29), copied byte-identical from CrunchyTile: never edit it here.)

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

**Two preset faults are asserted now, because half of every batch had one.** A clip that outlives
its effect (dead frames at the end are blank cells in the exported sheet) and particles Fit has
shrunk below a pixel. Both loops apply presets with `applyPreset(…, exact)` — earlier suite blocks
leave a sound hold active, and it overlays `duration`, `life` and `size`, which is exactly what
they measure. They catch the mechanical half; the contact sheet is still the only thing that
catches "this doesn't look like its name".

**The planted Library (§18) has its own async suites**, run by `node tests/run-ff.mjs <suite>` (a headless Firefox
that prints the page's `VFX …` lines and kills its own process):

```sh
node tests/run-ff.mjs hash | grep -v '(console)' > /tmp/h.txt; diff tests/frame-hash.expected.txt /tmp/h.txt   # no frame moved
node tests/run-ff.mjs desktop --quiet    # the planted Library over a mocked Tauri disk + HEAD's saved state (72)
node tests/run-ff.mjs web --quiet        # the web build over HEAD's saved state (15)
node tests/plant.test.mjs                # project-app.js over plant.js, in Node
node tests/godot-check.mjs               # a REAL Godot 4 imports what the app planted (skips without godot)
node tests/godot-scene.mjs               # §26: the WEB Export's ready Godot scene plays, signals impact, frees itself (real Godot)
python3 tests/build.py show && python3 tests/wkshot.py "file://$PWD/tests/run-show.html" "$PWD/tests/show.png" 1600 1000 40
node tools/pull-core.mjs --check && sh .githooks/pre-commit && cargo build --manifest-path src-tauri/Cargo.toml
```

`tests/fixtures/` was made ONCE on HEAD 11e8d14 (before the planted Library) by `make-fixtures.js`; never regenerate it
on a later build — it is the proof that what people saved before keeps opening. Regenerate `frame-hash.expected.txt`
only when a render change is MEANT (and say so in VFX-DESIGN).

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
  changed state screenshots in its *old* color. Read `getComputedStyle` with the transition
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
bounding box across *all* frames, so a fast or far-traveling effect shrinks itself into specks.
When a preset looks too small, the fix is almost always *less travel and bigger particles* — never
more particles.

---

## Layout

| | |
|---|---|
| `index.html` | markup + all app JS (PARAMS, UI generation, the effect strip, export, tour) |
| `vfx.js` | pure sim + raster — `simulate`, `renderFrames`, `streamFrames`, layer systems, post chain |
| `shapes.js` | particle drawings only, one `SHAPE_DEFS` record each |
| `presets.js` | preset data + category layout |
| `crunchysfx-synth.js` | **generated** — vendored CrunchySFX audio engine |
| `styles.css` | VFX's CSS: layout and the accent (the shared look is `crunchy-base.css`) |
| `suite.js`, `crunchy-base.css`, `crunchy-icons.js` | **generated** from crunchyCore — the suite dialog, the shared look, the pixel icons |
| `plant.js`, `library.js`, `settings.js`, `desktop.js`, `feedback.js` | **generated** from crunchyCore — planting, the docked Library, ⚙ Settings, the desktop gate (§18), the Feedback dialog (§20) |
| `glyphs.js` | **generated** from crunchyCore — the suite's icon drawings (CrunchyUI's roster), the Icon particle's source (§28) |
| `project-app.js` | VFX's own `PROJECT_APP`: a planted effect's kind and sidecar fields (§18) |
| `tests/` | `build.py`, the browser suites, the frame hash, the planted Library's suites, the Godot check; see `tests/README.md` |
| `tools/pull-synth.py` | re-vendors the synth engine from `../crunchyfx` |
| `src-tauri/` | desktop wrapper; `flatpak/` is the Linux distributable |
| `worker.js` + `wrangler.jsonc` | Cloudflare edge handler: version-stamps subresources, renders per-effect share cards. `DEPLOY.md` is the runbook |
| `.assetsignore` | what the web deploy does **not** publish — without it, the whole repo ships |

---

## Status

- **Variety (§39, 2026-10-27)**: opt-in in the Export dialog (Godot only): the scene varies every play (flips, 90° turns
  or any angle, 1×/whole-step or free sizes, ±speed, a pixel nudge; `variety_seed` replays) and can pick from 3–5 BAKED
  siblings (the Variations engine, seeded; one stacked sheet, one animation each, each with its own impact frame). The
  effect's `variety` PATCH_EXTRA ("" = off = byte for byte). `tests/godot-scene.mjs` proves it in real Godot (moments too).
- **The game palette + following sets (§38, 2026-10-26, crunchyCore PALETTES.md 4b, palette.js 2)**: an effect made from a
  set (`colorSet`) or locked from a palette (new PATCH_EXTRA `lockFrom`) draws its CURRENT colors where known (`followInto`);
  a palette edit re-checks the planted effects ("update available", Update all). The Palettes tab's star ("Make it the
  game's palette" / Unmark); the game palette first in the lock row, the set picker and the tab; "Use the game palette
  (<name>)" locks NEW effects (preset, Randomize, Wizard, Breed/Variations load, Match). No game palette: byte for byte.
- **Shared palettes and color sets (§37, 2026-10-25, crunchyCore PALETTES.md 2b)**: `palette.js`, `palette-ui.js`,
  `colorsets.js` GENERATED from crunchyCore. "Color sets…" under the moods (the suite's 237 + your own; a pick is the
  ramp in steps, `colorSet` PATCH_EXTRA); the lock opens the suite's palette window; the Library's Palettes tab. The
  lock offers only the core's CC0 starters now (AJ: Sweetie 16 / Fantasy 16 removed; old locks keep their colors).
- **Release machinery for 1.0.0 (§30, 2026-10-16)**: version 1.0.0 in all five places; `scripts/release.sh` (SFX's, with
  VFX's checks; `--dry` writes nothing); RELEASE.md; `.gitattributes` (LF everywhere: Tile v1.0.0's CRLF core-copy
  failure); no AppImage (the Flatpak is the Linux product; the workflow is Tile's shape, with a wiring step); the
  desktop update check (SFX's notifier: `version.json`, a Settings switch, never on file://); the audio context wakes
  on play and sleeps when idle (SFX 1.2.1). `--css-build` 9.
- **The search-engine pass (§29, 2026-10-16)**: a real title/description and SoftwareApplication JSON-LD on index.html, whose
  layout is untouched except one `data-web` "About CrunchyVFX" link in the license footer; the words live on a static
  `about.html` (web only, NOT in build.rs; served at /about: h1, FAQ + FAQPage JSON-LD, the suite's links), plus robots.txt,
  sitemap.xml (/ and /about), the IndexNow key. `tests/seo.test.mjs` is generic and byte-identical across the suite (run by
  `node tests/worker.test.mjs`).
- **The Icon particle (§28, 2026-10-15)**: shape 97 `icon` draws any of crunchyCore glyphs.js's 193 offered icons (not the
  `ported` VFX shapes, not `hidden`), chosen by NAME in the PATCH_EXTRAS `icon` from a searchable picture picker; a `sized`
  shape is drawn AT the particle's pixel size (glyphMask, unsmoothed), pixel for pixel CrunchyUI's icon. `iconFill` (Fill
  holes, off) fills a skull's eyes or a coin's band darker. 8 presets (Heart Heal, Coin Burst, Gem Pickup, Skull Puff,
  Alert Pop, Talk Bubble, Prompt Pop, Trophy Win); old frame hashes identical. Also: an old `.crunchyvfx` missing a newer
  row now opens (`restoreEdit` defaults it). items.js not taken (full-color; see §28).
- **Moments (§27, 2026-10-15)**: the preset strip opens on GAME MOMENTS (Hit, Crit, Death, Spawn, Pickup, Heal, Power-up, Dash,
  Jump / Land, Projectile, Muzzle / Cast, Explosion, Shield, Status, Ambient, UI) from `PRESET_MOMENTS` + each preset's
  `moments`; Techniques and Tags one switch away. Every moment's effects read at 64 px (tested); 19 presets improved, 11
  added (projectile loops among them); the Wizard's types map onto moments.
- **The ready Godot scene (§26, 2026-10-15)**: every Godot export (web Export, packs, pipelines, Drag out, planted) ships
  `<base>.tscn` + `<base>.gd` + README.txt from one implementation (`buildExportBundle`): plays on ready, `impact` on the
  Impact frame (else the brightest frame), `finished`, frees itself; loops loop. `tests/godot-scene.mjs` proves it in Godot.
- **First-time-user round (§25, 2026-10-15)**: search by what people type (`SEARCH_ALIASES` + the Wizard's tags/types,
  "Best matches" first); the Variations pack is `buildExportFiles` per variation (Godot `.tres` proved in real Godot by
  `tests/godot-check.mjs`); a size change with Fit off turns Fit on, Fit says its state; hidden filters shown as pills;
  "Game palette"; Prep for GIF states its plan; dialogs scroll their middle; Hit Spark redrawn (meant hash change); zip
  DOS dates. `--css-build` 7.
- **Layout round 2 (§24, 2026-10-13)**: every editor panel folds (remembered in the existing `crunchyvfx.collapsed.v1`,
  `p:<group>`; Master and Crunch start folded); rows that do nothing hide (`PARAM_WHEN`, one table; values kept, links
  unchanged); Output/Master/Crunch head the panels, then the particles, then "Add a layer" and the layers that are on
  (`orderPanels`, two column-flowing blocks); the 58 layer chips grouped by kind with a line each (`LAYER_ABOUT`) and a
  filter; a Categories | Tags switch on the strip using the Wizard's own tags; Lock pixels says what it holds. `--css-build` 6.
- **Wizard tuning (§23.2)**: results must READ at display size (`wizardMeasure`/`WIZARD_READ`: coverage, sustained,
  spread; `wizardFatten` repairs with bigger particles and less travel), nine distinct names (`WIZARD_NOUNS`), the lead
  tag's palette visible (hue share ≥ 30%), palettes take turns. Composing nine: 87–150 ms cold in WebKitGTK.
- **The Wizard (§23, §23.1, 2026-10-13)**: first in the header's globals (wand icon). Three questions (what it's for: 8
  types; what it's made of: 12 mixable tags; which era), then nine ORIGINAL effects, all playing, at their real frame
  size. Each is composed (`wizardCompose`): a skeleton from one of the type's presets (motion, timing, structural
  layers only), the tags' ingredients (`WIZARD_INGREDIENTS`: particles, tuned layer systems, palettes), mixed so every
  result carries every tag (lead tag = main particle + palette, next = Layer B, further = systems); test-rendered in the
  era; deterministic per seed. A result is what a click loads (`presetOutcome`, Lock pixels note), an era is the Era
  button's write, one undo step. The 136-answer sweep is in the async suite. No new runtime file; `--css-build` 5.
- **The layout pass, round 1 (§22, 2026-10-13)**: one header row of globals (Crunchy suite · Library · Settings · Tour ·
  Tutorials · Feedback); the presets as a paged PICTURE STRIP under it (search by name or category, a chip per category,
  pictures from an idle queue, hover plays); the stage and the editor side by side from 900 px (the stage column
  sticks); the generators head the editor; Export, GIF, Share link and the desktop's project buttons sit under the
  preview. Presentation only: frame hash unchanged.
- **Round 1b (§22.1)**: the generators in their own row under the header; editor LEFT, stage RIGHT (Tile/UI); a NEW
  effect (Randomize, Match) starts at 192 px (`START_FRAME_SIZE`) while the PARAMS default stays 128, so
  presets and old links don't move; the three shape pickers are pictures (sprite over name), palettes show swatches.
- **The planted Library (§18, 2026-10-11)**: the suite's desktop Library planted in the game (`crunchy/vfx/<slug>/`, each
  effect's Export-dialog sheet + metadata beside a `.crunchy` sidecar), the core's Settings and desktop gate, zips with
  sidecars, "Plant my effects" (copies; the browser store is never written), VFX's own dialog renamed "Imports &
  history". project.js removed (never called). Waiting on: a person clicking the native dialogs; a live Unity import.

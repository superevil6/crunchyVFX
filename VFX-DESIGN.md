# CrunchyVFX — PARAMS schema + renderFrames() / export architecture

Draft 2026-07-26. Sibling to CrunchySFX: same no-build, no-deps, opens-on-`file://` ethos,
same four-file shape (`index.html` + `vfx.js` + `presets.js` + `styles.css`, classic scripts
sharing one global scope), same "everything is generated from `PARAMS`" rule.

---

## 1. The mapping (why this stays a sibling, not a rewrite)

The SFX architecture maps onto 2D VFX almost one-for-one. Keeping the names parallel is what
makes ~50–60% of the app reusable and what makes the two products feel like one suite.

| CrunchySFX | CrunchyVFX |
|---|---|
| `dsp.js` (pure DSP) | `vfx.js` (pure sim + raster, no DOM/app state) |
| `SR = 44100` | `FPS` + `frameSize` (px) |
| `render()` → `{L, R}` | `renderFrames()` → `{canvases[], bbox}` |
| `WAVES` (engine buttons + contextual panels) | `SHAPES` (particle sprite kind) |
| `custom` drawn wavetable | `custom` drawn particle sprite (same paint-canvas + base64-in-patch trick) |
| `sample` (imported WAV) | `image` (imported PNG sprite) |
| amp envelope (ADSHR) | per-particle life curves (fadeIn/fadeOut/grow) + emission window |
| `noise` / `subOsc` / `boom` layers (default 0) | `flash` / `wave` (shockwave) layers (default 0) |
| filter + `drive` | color ramp + `blend` |
| `bitcrush` | `posterize` (+ `dither`) |
| `downsample` | `pixelate` |
| `reverb` (spatial smear) | `glow` (bloom) |
| `delay` (feedback) | `echo` (frame feedback) + `trail` (per-particle streak) |
| loudness normalize | **Fit** — auto-scale so the effect fills the frame |
| `limiter` | overbright clamp / tone-map on additive |
| `reverse` | reverse (identical concept) |
| `repeat`/`rate` (burst) | `shots`/`shotDelay` (chained secondary bursts) |
| seeded LCG, fixed seed | seeded hash — **but `seed` is a PARAM here** (see §3.2) |

The `Crunch` group is the brand fit: `pixelate` + `posterize` + `dither` + `alphaCut` +
`outline` are exactly the knobs that turn a soft particle sim into pixel-art game juice.

---

## 2. `PARAMS` — paste-ready draft

> **Note (superseded in part):** this section is the original draft. The shipped schema has grown
> well past it — 19 shapes, 7 emitters, ~130 params, plus non-`PARAMS` patch fields (`glyph`,
> `customSprite`, `imageSprite`, `ramp`). **`index.html` is authoritative**; this remains as the
> record of the reasoning.

Same row format: `[key, label, min, max, step, default, unit, group, kind?, enumList?]`.
**Every entry defaults to neutral/off** so `applyPreset`'s reset-then-overlay never silently
changes an existing preset — the same backward-compat rule as SFX.

```js
const SHAPES   = ["glow", "spark", "ring", "star", "pixel", "smoke", "shard", "bolt", "custom", "image"];
const EMITTERS = ["burst", "cone", "ring", "disc", "line", "spiral", "stream", "box"];
const BLENDS   = ["additive", "alpha", "screen"];
const SIZES    = ["32", "48", "64", "96", "128", "192", "256"];

const PARAMS = [
  // Emitter — where particles are born
  ["shape",      "Particle",    0, SHAPES.length - 1, 1, 0, "", "Emitter", "shape"],
  ["emitter",    "Emitter",     0, EMITTERS.length - 1, 1, 0, "", "Emitter", "enum", EMITTERS],
  ["count",      "Count",       1, 3000, 1, 150, "",   "Emitter"],
  ["emitAngle",  "Direction",   0, 360, 1, 0, "°",     "Emitter"],
  ["emitSpread", "Spread",      0, 360, 1, 360, "°",   "Emitter"],
  ["emitRadius", "Emit radius", 0, 0.5, 0.01, 0, "",   "Emitter"],   // fraction of frame
  ["emitTime",   "Emit over",   0, 1, 0.01, 0, "",     "Emitter"],   // 0 = one burst; >0 = stream (fraction of duration)
  ["originX",    "Origin X",    0, 1, 0.01, 0.5, "",   "Emitter"],
  ["originY",    "Origin Y",    0, 1, 0.01, 0.5, "",   "Emitter"],

  // Motion — the integrator's forces
  ["speed",      "Speed",       0, 900, 1, 240, "px/s","Motion"],
  ["speedVar",   "Speed var",   0, 1, 0.01, 0.4, "",   "Motion"],
  ["gravity",    "Gravity",  -1500, 1500, 5, 0, "px/s²","Motion"],
  ["drag",       "Drag",        0, 1, 0.01, 0.2, "",   "Motion"],
  ["wind",       "Wind",     -600, 600, 5, 0, "px/s²", "Motion"],
  ["radial",     "Radial",   -900, 900, 5, 0, "px/s²", "Motion"],   // + outward, − implode
  ["swirl",      "Swirl",    -900, 900, 5, 0, "px/s²", "Motion"],   // tangential = vortex
  ["turb",       "Turbulence",  0, 1, 0.01, 0, "",     "Motion"],
  ["turbScale",  "Turb scale",  0.5, 8, 0.1, 2, "",    "Motion"],
  ["turbSpeed",  "Turb speed",  0, 4, 0.05, 1, "",     "Motion"],
  ["spin",       "Spin",     -720, 720, 5, 0, "°/s",   "Motion"],
  ["spinVar",    "Spin var",    0, 1, 0.01, 0, "",     "Motion"],

  // Life & size — the envelope analog
  ["life",       "Lifetime",    0.05, 3, 0.01, 0.5, "s","Life"],
  ["lifeVar",    "Life var",    0, 1, 0.01, 0.3, "",   "Life"],
  ["size",       "Size",        1, 96, 0.5, 16, "px",  "Life"],
  ["sizeVar",    "Size var",    0, 1, 0.01, 0.4, "",   "Life"],
  ["grow",       "Grow / shrink", -1, 1, 0.01, -0.6, "","Life"],   // − shrink, + grow over life
  ["fadeIn",     "Fade in",     0, 1, 0.01, 0.05, "",  "Life"],    // fraction of life
  ["fadeOut",    "Fade out",    0, 1, 0.01, 0.5, "",   "Life"],
  ["alphaCurve", "Fade curve",  0, 1, 0.01, 0, "",     "Life"],    // 0 linear → 1 exponential

  // Color
  ["hue",        "Hue",         0, 360, 1, 30, "°",    "Color"],
  ["hueLife",    "Hue shift", -180, 180, 1, -25, "°",  "Color"],   // drift across life (fire: yellow→red)
  ["hueVar",     "Hue var",     0, 1, 0.01, 0.08, "",  "Color"],
  ["sat",        "Saturation",  0, 1, 0.01, 0.9, "",   "Color"],
  ["bright",     "Brightness",  0, 1, 0.01, 1, "",     "Color"],
  ["coreWhite",  "Hot core",    0, 1, 0.01, 0.5, "",   "Color"],   // white-hot early in life
  ["opacity",    "Opacity",     0, 1, 0.01, 1, "",     "Color"],
  ["blend",      "Blend",       0, BLENDS.length - 1, 1, 0, "", "Color", "enum", BLENDS],

  // ---- Shape-specific groups (shown only for their shape — see PANEL_SHAPES) ----
  ["sparkLen",   "Spark length",0, 1, 0.01, 0.5, "",   "Spark"],
  ["sparkTaper", "Spark taper", 0, 1, 0.01, 0.7, "",   "Spark"],
  ["ringThick",  "Ring thickness",0.02, 1, 0.01, 0.25, "","Ring"],
  ["ringSoft",   "Ring softness",0, 1, 0.01, 0.5, "",  "Ring"],
  ["starPoints", "Star points",  3, 12, 1, 4, "",      "Star"],
  ["starInner",  "Star inner",  0.05, 0.9, 0.01, 0.3, "","Star"],
  ["smokeBillow","Billow",      0, 1, 0.01, 0.5, "",   "Smoke"],
  ["smokeSoft",  "Softness",    0, 1, 0.01, 0.8, "",   "Smoke"],
  ["shardSides", "Shard sides", 3, 8, 1, 3, "",        "Shard"],
  ["shardRatio", "Shard aspect",0.2, 2, 0.01, 1, "",   "Shard"],
  ["boltSegs",   "Bolt segments",3, 24, 1, 8, "",      "Bolt"],
  ["boltJitter", "Bolt jitter", 0, 1, 0.01, 0.4, "",   "Bolt"],
  ["boltBranch", "Bolt branch", 0, 1, 0.01, 0.2, "",   "Bolt"],
  ["imgTint",    "Tint amount", 0, 1, 0.01, 1, "",     "Image sprite"],
  // "pixel" and "custom" need no extra params (custom has the paint canvas instead).

  // ---- Extra layers (default 0 = off, exactly like noise/subOsc/boom) ----
  ["flash",      "Flash",       0, 1, 0.01, 0, "",     "Flash"],
  ["flashSize",  "Flash size",  0, 1, 0.01, 0.5, "",   "Flash"],
  ["flashLife",  "Flash life",  0.02, 1, 0.01, 0.12, "s","Flash"],
  ["flashRays",  "Flash rays",  0, 12, 1, 0, "",       "Flash"],
  ["wave",       "Shockwave",   0, 1, 0.01, 0, "",     "Shockwave"],
  ["waveSpeed",  "Wave speed",  0, 1, 0.01, 0.5, "",   "Shockwave"],
  ["waveWidth",  "Wave width",  0, 1, 0.01, 0.2, "",   "Shockwave"],
  ["waveLife",   "Wave life",   0.05, 2, 0.01, 0.4, "s","Shockwave"],
  ["waveSquash", "Wave squash", 0, 1, 0.01, 0, "",     "Shockwave"],   // 1 = flat ground ring

  // Trails (the delay analog)
  ["trail",      "Motion trail",0, 1, 0.01, 0, "",     "Trails"],
  ["echo",       "Frame echo",  0, 1, 0.01, 0, "",     "Trails"],
  ["echoDecay",  "Echo decay",  0, 1, 0.01, 0.6, "",   "Trails"],

  // Glow (the reverb analog)
  ["glow",       "Glow",        0, 1, 0.01, 0, "",     "Glow"],
  ["glowRadius", "Glow radius", 1, 32, 1, 8, "px",     "Glow"],
  ["glowThresh", "Glow thresh", 0, 1, 0.01, 0.5, "",   "Glow"],

  // Crunch — the pixel-art finishing stage
  ["pixelate",   "Pixelate",    1, 16, 1, 1, "px",     "Crunch"],
  ["posterize",  "Color steps", 2, 32, 1, 32, "",      "Crunch"],
  ["dither",     "Dither",      0, 1, 0.01, 0, "",     "Crunch"],
  ["alphaCut",   "Alpha cut",   0, 1, 0.01, 0, "",     "Crunch"],   // hard edges — kills GIF fringing
  ["outline",    "Outline",     0, 3, 1, 0, "px",      "Crunch"],
  ["outlineTone","Outline tone",0, 1, 0.01, 0, "",     "Crunch"],   // 0 black → 1 white

  // Burst — chained secondary explosions
  ["shots",      "Shots",       1, 8, 1, 1, "x",       "Burst"],
  ["shotDelay",  "Shot delay",  0.02, 1, 0.01, 0.12, "s","Burst"],
  ["shotScale",  "Shot scale",  0.2, 1.5, 0.01, 0.7, "","Burst"],
  ["shotSpread", "Shot offset", 0, 1, 0.01, 0.3, "",   "Burst"],

  // Master
  ["scale",      "Scale",       0.25, 3, 0.01, 1, "x", "Master"],
  ["shake",      "Shake",       0, 1, 0.01, 0, "",     "Master"],
  ["loopBlend",  "Seamless loop",0, 1, 0.01, 0, "",    "Master"],
  ["reverse",    "Reverse",     0, 1, 1, 0, "",        "Master"],

  // Output
  ["duration",   "Duration",    0.1, 3, 0.01, 0.7, "s","Output"],
  ["fps",        "FPS",         8, 60, 1, 24, "",      "Output"],
  ["frameSize",  "Frame size",  0, SIZES.length - 1, 1, 4, "px", "Output", "enum", SIZES],
  ["seed",       "Seed",        1, 9999, 1, 1, "",     "Output"],
];
```

~78 rows. Defaults render an orange additive spark burst — a usable effect on first load,
same as SFX's default beep.

Two non-`PARAMS` patch fields, threaded explicitly through
`withState`/snapshot/`applyPreset`/`encodePatch`/genome/`syncUI` exactly like `customWave`:

- `state.customSprite` — the drawn particle sprite (base64, empty = default glow)
- `state.imageSprite` — imported PNG as a data URI (the `sampleBuf` analog)

`PANEL_SHAPES` mirrors `PANEL_WAVES`: `{ Spark:[1], Ring:[2], Star:[3], Smoke:[5], Shard:[6],
Bolt:[7], "Custom sprite":[8], "Image sprite":[9] }` — contextual panels keep the editor
uncluttered as shapes proliferate.

**Palettes are buttons, not a param** (the `CONSOLES` pattern): Fire / Ember / Ice / Toxic /
Magic / Electric / Smoke / Gold / Blood / Rainbow write `hue`/`hueLife`/`sat`/`coreWhite`/
`blend`. The patch then carries real colors, so share links and breeding stay honest.

`MACROS` (plain-language sliders, the "Quick shape" panel) port over well: **Violence**
(count+speed+flash+shake), **Softness** (smokeSoft/fadeOut/glow/blur), **Chunkiness**
(pixelate+posterize+alphaCut+outline), **Weight** (gravity+drag+life), **Heat**
(hue+coreWhite+glow), **Swirl** (swirl+turb).

---

## 3. `renderFrames()` — the core

### 3.1 Split simulate from rasterize

The single most important structural decision, and it has no SFX counterpart:

```js
// vfx.js — pure, no DOM state
function simulate(st, opt)            // → { frames: [Float32Array], counts: Int32Array, bbox, meta }
function rasterizeFrame(sim, i, ctx, opt)
function renderFrames(st, opt)        // → { canvases: [HTMLCanvasElement], w, h, fps, bbox }
```

Simulation produces a **particle-state table**, not pixels. That buys three things cheaply:

- **Fit** (the loudness-normalize analog) needs the bounding box across *all* frames before
  any pixel is drawn. One sim pass, then rasterize at the right scale.
- Changing `frameSize`, `scale`, or any Crunch/Glow param re-rasterizes only — no re-sim.
- The preview can rasterize at 128px while export rasterizes at 256px from the same sim, so
  what you previewed is exactly what you exported.

Layout — one flat `Float32Array` per frame, no per-particle objects:

```js
const P_STRIDE = 10;   // x, y, size, angle, alpha, tint, kind, vx, vy, spare
```

Cost at the top end: 3000 particles × 90 frames × 10 floats ≈ 10 MB. Fine.

### 3.2 Determinism — hash-per-particle, not a running LCG

SFX walks one LCG through `render()`. That's wrong here: nudging `count` would reshuffle every
existing particle, so the count slider would scramble the effect instead of growing it.

Instead, **every random draw for particle `i` comes from `hash(seed, i, salt)`** (splitmix32
over `i * 2654435761 ^ seed ^ salt`). Particle `i` is the same particle regardless of how many
siblings exist. Turbulence is likewise stateless value-noise over a hashed lattice, sampled at
`(x/turbScale, y/turbScale, t*turbSpeed)`.

`seed` being a param (with a 🎲 reroll button next to it) is what makes "same look, different
arrangement" a one-click operation — the thing you actually want when placing four explosions
in one scene.

### 3.3 The sim loop

```js
const SUB = 2;                                  // substeps per frame — stable at low fps
const nFrames = Math.min(120, Math.round(st.duration * st.fps));
const dt = 1 / (st.fps * SUB);
// for each substep: spawn what's due → integrate → cull dead
// at each frame boundary: snapshot the alive set into frames[i]
```

Per-particle integration (order matters — matches how the params read):

```
a  = gravity + wind + radial·r̂ + swirl·t̂ + turbulence(x, y, t)·turb
v += a·dt ;  v *= (1 - drag·dt·6) ;  p += v·dt
age += dt ;  u = age/life
size  = size₀ · (1 + grow·u)
alpha = fadeCurve(u) · opacity
tint  = hue + hueLife·u  (+ hot-core white blend early in u)
```

`shots > 1` re-runs the spawn schedule `shots` times at `shotDelay` intervals, each offset by
`shotSpread` (hashed) and scaled by `shotScale^k` — one loop around the emitter, not a second
engine.

### 3.4 Rasterize pipeline (per frame)

```
1. echo        — carry the previous frame's buffer forward at echoDecay (skip when echo = 0)
2. draw        — flash layer → shockwave layer → particles (+ trail streaks), with
                 blend mode, fit/scale transform, and shake offset applied here
3. glow        — hand-rolled 3-pass box blur of the >glowThresh pixels, added back
4. pixelate    — nearest-neighbour down + up
5. alphaCut    — hard alpha threshold
6. posterize + dither  — quantize channels, optional 4×4 Bayer
7. outline     — trace the alpha edge, fill with the outlineTone colour (must run last)
```

**The `limiter` analog does not exist yet, and can't cheaply.** Canvas 2D clamps at 255 on every
additive composite, so the core of a dense burst (15–20 sprites deep) flattens to white and
loses its hue. Tried and reverted: draw at 1/N intensity to buy headroom in the 8-bit buffer,
then expand with a Reinhard curve. It fails — at 1/25 intensity a single particle only occupies
~5 bits, so expanding amplifies quantization and lifts the darks into grey mush. The measured
result was worse than no tone mapping at all.

The principled fix is a **float accumulation buffer**: blit cached sprites into a `Float32Array`
by hand instead of via canvas compositing, tone-map once, then `putImageData`. That means
hand-rolling the sprite blit (transform + bilinear sample), which is a real rewrite of
`drawFrame` — worth doing, but as its own feature, not as a slider. Until then, dense presets
manage headroom the boring way: a small `emitRadius` + a few frames of `emitTime` so 200 sprites
aren't born on one pixel.

Two implementation notes that matter for the Tauri/WebKitGTK target:

- **No `ctx.filter`** — blur is a hand-rolled box blur over `ImageData` (3 passes ≈ Gaussian).
  Guaranteed everywhere, and it fits the hand-rolled WAV/ZIP spirit. Offline rendering means
  cost is irrelevant.
- **Sprite cache, not per-particle gradients.** `createRadialGradient` per particle is the
  performance trap. Pre-render each shape once at 64px into an offscreen canvas, tint via
  `globalCompositeOperation = "source-in"`, and cache by `(shape, tintStep)` with 24 ramp
  steps. Every particle is then one `drawImage` with a transform.

### 3.5 Preview (`#scope` → `#stage`)

A `<canvas>` plus a rAF loop cycling the rendered frames at `fps`, with: play/pause, a frame
scrubber, a background toggle (checkerboard / dark / light — you must be able to see what the
alpha is doing), and a 1× / 2× / 4× zoom for pixel-art sizes. Re-render on param change,
debounced ~60 ms.

---

## 4. Export

### 4.1 PNG sprite sheet — the primary format

Pack frames into a grid, `toBlob("image/png")`, plus a JSON sidecar. Layout options at export:
**grid** (default, `cols = ceil(sqrt(n))`), **horizontal strip**, **vertical strip**.

```json
{ "name": "explosion-01", "frames": 24, "fps": 24,
  "frameW": 128, "frameH": 128, "cols": 5, "rows": 5, "loop": true }
```

Optionally also emit Aseprite's `frames`-hash JSON so it imports with timing intact.

### 4.2 PNG frame sequence — the Aseprite/engine path

N canvases → N PNG blobs → **`makeZip()` copied verbatim from CrunchySFX**. It's STORE-only,
which is exactly right: PNG is already deflated, so compression would buy nothing. Desktop
writes a real folder through the Tauri folder picker instead of a zip.

This is the full-alpha, lossless path — the one to recommend by default.

### 4.3 GIF — universal, lossy, hand-rolled ✅ implemented in `gif.js`

Hand-rolled GIF89a in the WAV/ZIP tradition: median-cut quantizer over sampled pixels of all
frames (≤255 colours, index 0 reserved for transparent), LZW encoder, `NETSCAPE2.0` loop
extension, one global palette.

Two honest caveats to surface **in the export dialog**, not just in a README:

- **1-bit alpha** — soft/additive edges fringe. The fix is already a param: nudge `alphaCut`
  (and usually `posterize`) up and the effect is built for GIF from the start. The dialog
  should say so and offer a one-click "prep for GIF".
- **Frame delay is in centiseconds**, so 24 fps is not representable (`4cs` = 25 fps). Snap or
  warn: 50 / 25 / 20 / 12.5 / 10 fps are exact. Default `fps` stays 24 for engines; the GIF
  path suggests 25.

### 4.4 Later tiers

- **APNG** ✅ **shipped** (`apng.js`) exactly as predicted: `toBlob` each frame, parse the chunks,
  re-emit as `acTL`/`fcTL`/`fdAT`. No encoder. It also turned out to fix the *timing* problem, not
  just the alpha one — `delay_num/delay_den` expresses 24 fps exactly where GIF cannot.
- **Drag-out to Aseprite / the engine** — the existing `tauri-plugin-drag` path with a sheet
  PNG instead of a WAV. Near-free; see the pointer-drag notes (HTML5 drag is broken in
  WebKitGTK).
- **Sheet packing for an existing atlas**, per-frame trim/pivot metadata, Godot `.tres` /
  Unity `.meta` sidecars.

---

## 5. What goes in the shared `core.js`

Hand-synced byte-identical between the two repos (per the agreed plan — copy, don't build):

`seeded RNG / hash helpers` · `makeZip` + `crc32` · share-link codec (`encodePatch`/
`decodePatch`) · genome / breed / variations · prefs + collapsible sections · Tauri IO (save
dialog, folder picker, temp files, drag-out) · update checker · the `PARAMS`→UI generator.

Everything domain-specific diverges: `PARAMS`, `vfx.js`, presets/categories, panels, macros.

---

## 6. Resolved (2026-07-26)

1. **Frame budget** — hard cap at 120 frames in `simulate()`. The *sheet* dimension is what
   actually hurts, so the export dialog suggests a lower fps rather than silently truncating.
2. **Second emitter layer** — **deferred.** A good MVP target, but not before the simpler /
   bigger-payoff work below. `shape:"smoke"` on the main emitter carries smoke until then.
3. **Collision / bounce** — deferred with it. It's the first param that implies a *scene*
   rather than a sprite, which is a bigger conceptual step than it looks.
4. **Preset categories** — mirror the SFX ones (Explosions, Impacts, Magic, Pickups, UI,
   Ambient, Weather) so the two browsers read as siblings.

`EMITTERS` dropped `"stream"` — `emitTime` already turns any emitter into a continuous stream,
so it was a redundant mode.

## 7. Build order (bigger payoff first)

1. ~~**`vfx.js` core + live preview**~~ — **done.** `simulate`/`drawFrame`/`renderFrames`, 8 shape
   sprites, the full post-FX chain, the `PARAMS`→UI generator, the looping stage, 15 presets.
2. **Export** — PNG sheet + JSON ✅, frame-sequence ZIP ✅, GIF89a ✅ (`gif.js`).
3. ~~**Ported machinery**~~ — **done.** Presets + categories, randomize, macros (6 Quick-shape
   sliders), undo/redo, My Effects library, share links, breed, variations pack, Foundry, custom
   categories. Only the pointer-based drag-to-organize is outstanding.
4. **Desktop** — Tauri wrapper ✅, drag-out, itch CI, update checker. See §8.
5. Then the deferred items above.

## 8. Desktop build (Tauri v2)

`src-tauri/` wraps the same buildless frontend — there is no bundler and no separate desktop
codebase. `build.rs` copies `index.html`, `presets.js`, `vfx.js`, `gif.js`, `apng.js` and
`styles.css` into `dist/` (gitignored) with a `cargo:rerun-if-changed` on each, so a normal
`cargo build` always embeds the current frontend and `cargo tauri dev` picks up edits.

```sh
cargo build --manifest-path src-tauri/Cargo.toml   # debug binary, no CLI needed
cargo tauri dev                                    # hot reload (needs tauri-cli ^2)
cargo tauri build                                  # nsis / deb / appimage
```

In VS Code: F5 → "Desktop app (Tauri)" (needs rust-analyzer + CodeLLDB; on Windows change
`"type"` to `"cppvsdbg"`), or the "Desktop: tauri dev" task for hot reload.

**The one frontend difference is `download()`.** Tauri has no download manager, so an
`<a download>` silently does nothing there. `download()` feature-detects `window.__TAURI__` and
routes to a native Save dialog + `fs.writeFile`, falling back to the browser path if that throws.
Every export in the app — sheet, frame ZIP, GIF, pack, batch, effects JSON — funnels through
that single function, so nothing else needs to know which build it is running in. The desktop
branch is covered by 7 assertions in `regression-async.js` (stubbed `__TAURI__`: saves, cancels,
and falls back), since the browser suites otherwise never reach it.

Icons in `src-tauri/icons/` were rendered by the app itself — 8 tapered `lines` spokes around a
white-hot `flash` core, ramp stop 0 set to the brand accent `#ff7a45`. Note that `drawLines`
samples the ramp at the *layer's lifetime* position, not along the spoke, so with a long
`lineLife` every spoke takes stop 0; that is why the icon's colour lives there.

Still outstanding for desktop: drag-out of a sheet into a file manager/engine (the
`tauri-plugin-drag` dep and `drag:default` capability are already wired, matching CrunchySFX's
proven `start_drag` invoke shape), itch.io CI, and the update checker.

## 9. The sound engine (vendored from CrunchySFX)

`crunchysfx-synth.js` is CrunchySFX's synthesis engine, **generated — never edit it here.** Change
the CrunchySFX sources and re-pull:

```sh
python3 tools/pull-synth.py            # regenerate upstream, verify, vendor, record the manifest
python3 tools/pull-synth.py --check    # verify the vendored copy only (what the suite calls)
```

One command does the whole chain because it runs the upstream exporter itself — "pull" always
means *what CrunchySFX looks like right now*, not *whatever was last left in its output folder*.

**Why vendored rather than referenced.** This app has to run from an unzipped folder on `file://`,
so a path into a sibling repo is not an option. Pinning a copy also means an upstream edit can
never silently change the sounds this app ships. `synth-manifest.json` records the version, the
upstream commit and a sha256; `--check` fails if the copy was hand-edited or the manifest is
stale, and the async suite asserts the app can actually drive the engine.

**Why it's namespaced.** The bundle exposes exactly one global, `CrunchySynth`. Both apps are
buildless classic scripts sharing one scope, and they genuinely collide — VFX ported SFX's undo
machinery, so both define `withState`, `undoEdit`, `EDIT_HIST_MAX` and others. A plain
concatenation would clobber undo/redo here.

What it gives us: a CrunchySFX share link already carries the whole patch, so "Match a sound" now
renders the actual audio in-app (`CrunchySynth.render(patch)` → an AudioBuffer on the existing
playback path) and writes it beside the sheet on export via `CrunchySynth.encodeWav` — the same
engine and encoder CrunchySFX itself uses, so it is the same WAV. It also supplies the canonical
`DEFAULTS`; the hand-copied `SFX_DEFAULTS_FALLBACK` covered 25 of 106 parameters and could only
ever drift, so it is now just a fallback for when the engine is absent.

Upstream (`crunchyfx/`) has the other half: `synth.js` (the extracted engine — pure, no DOM, no
app globals), `tools/export-synth.py` (which refuses to export if that stops being true), and
`tools/verify-synth.html`, which renders all 736 presets through both the app's engine and the
bundle and asserts they are identical.

## 10. Hold sound — the preset browser as a "change type" control

Matching a sound derives a whole effect from it. Then loading any preset reset everything, so you
lost the length and the punch the sound gave you purely to change what it looked like — and since
most matches land somewhere explosion-shaped, "change the type" was the first thing anyone wanted
to do and the one thing that destroyed the match.

The match's output is split three ways, in `SOUND_HOLD_KEYS`:

| group | keys | owned by |
|---|---|---|
| timing | `duration`, `life`, `lifeVar`, `fadeIn`, `fadeOut`, `shots`, `shotDelay`, `reverse` | the sound |
| intensity | `count`, `size`, `speed`, `radial`, `shake`, `turb`, `emitSpread` | the sound |
| look | `shape`, `hue`, `sat`, `glow`, `flash`, `wave`, the crunch chain… | the **preset** |

`applyPreset` already overlaid a `keep` map after the preset for the pixel lock; the held sound
values are simply a second overlay after that. So the mechanism is a few lines, and **every one of
the 59 presets becomes a "change type" button** — no separate curated list to maintain, and
browsing works exactly as it always did.

Deliberate calls:

- **The look is never held.** Holding `shape` or `hue` would mean "change type" could not change
  the type. That is the whole split.
- **A toolbar toggle beside Lock pixels**, not a new panel — same mental model as the lock the app
  already has, auto-enabled by a match, and it costs no UI surface until there is a sound to hold.
- **Not persisted**, unlike the pixel lock. A hold describes one specific loaded sound; one that
  outlived its sound would silently distort the next thing you made. Clearing or replacing the
  sound clears the hold.
- **Values are snapshotted at match time**, not read live from `state`, so later hand-edits don't
  quietly redefine what the sound "said".
- Undo/redo goes through `restoreEdit`, not `applyPreset`, so history restores exactly and is
  unaffected by the hold. There is a regression assertion pinning that.

## 11. Frame width x height

`frameW` / `frameH` default to **0**, meaning "square, at `frameSize`". That neutral default is
what lets every existing preset, share link and saved effect keep its exact framing without
carrying the new keys — the same backward-compat rule the whole schema runs on.

**Radii scale against the SMALLER side** (`frameRefPx`). Widening a 512 square to 512×900 leaves
the burst untouched and adds headroom, which is what a non-square frame is for; scaling by the
larger side would silently inflate every effect the moment the frame stopped being square, and
scaling per-axis would turn every shockwave into an ellipse. Fit is the one place that reads both
axes, taking the tighter of the two so a wide effect in a short frame doesn't spill out the sides.

`renderFrames` accepts `{ w, h }`; `{ size }` still means square and is what every thumbnail and
the multi-resolution export path uses.

The **Frame size** dropdown now zeroes `frameW`/`frameH`, so it reads as "back to square at this
size" rather than being a control that silently does nothing while custom dimensions are set.

### Why the editor caps at 512

Measured on this machine (19-frame Explosion, 220 particles):

| size | render | peak memory |
|---|---|---|
| 128² | 21 ms | 1 MB |
| 512² | 246 ms | 19 MB |
| 1024² | 990 ms | 76 MB |
| 2048² | 3.9 s | 304 MB |

Cleanly pixel-bound — 4× per doubling — so 4096² extrapolates to ~15 s and **~1.3 GB**. The
preview re-renders on every slider drag, so the editor stays at 512 and the big numbers live at
export, where the scale multipliers (now up to 8×) reach 4096. The export dialog estimates time
and peak memory from the *last real render*, which already accounts for this patch's particle
count, glow and frame count on this machine, and warns past ~700 MB.

**Memory is the real limit, not time.** `renderFrames` holds every frame as a live canvas
simultaneously, so a big export allocates the whole sequence before anything is encoded. Two
things would move that, both still open:

1. **Half-res glow.** At 2048² bare rasterising is 438 ms while glow alone is 3877 ms — roughly 9×
   everything else. Rendering the blur at half resolution is ~4× cheaper and would take a 4K
   export from ~15 s to ~4 s. Deferred because it shifts the look of all 59 presets slightly, so
   it belongs with the quality pass.
2. **Streaming export** — render, encode and release one frame at a time instead of holding all of
   them. That turns ~1.3 GB into roughly one frame's worth regardless of length, and is what would
   make 4K genuinely safe rather than merely slow. It works for the sheet, frame-sequence and GIF
   paths (Fit's bbox comes from the sim, not the canvases, so it is unaffected).

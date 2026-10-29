# CrunchyVFX — PARAMS schema + renderFrames() / export architecture

Draft 2026-07-26. Sibling to CrunchySFX: same no-build, no-deps, opens-on-`file://` ethos,
same flat-file shape (`index.html` + `vfx.js` + `shapes.js` + `presets.js` + `styles.css`, classic
scripts sharing one global scope), same "everything is generated from `PARAMS`" rule.

`shapes.js` split off once the shape roster outgrew the render core: it is the particle drawings
and nothing else — one `{ name, draw, key }` record per shape, which `vfx.js` caches and tints.
Adding a shape is one record there plus its two picker/randomize entries in `index.html`.

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
4. pixelate    — nearest-neighbor down + up
5. alphaCut    — hard alpha threshold
6. posterize + dither  — quantize channels, optional 4×4 Bayer
7. outline     — trace the alpha edge, fill with the outlineTone color (must run last)
```

**The `limiter` analog does not exist yet, and can't cheaply.** Canvas 2D clamps at 255 on every
additive composite, so the core of a dense burst (15–20 sprites deep) flattens to white and
loses its hue. Tried and reverted: draw at 1/N intensity to buy headroom in the 8-bit buffer,
then expand with a Reinhard curve. It fails — at 1/25 intensity a single particle only occupies
~5 bits, so expanding amplifies quantization and lifts the darks into gray mush. The measured
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
frames (≤255 colors, index 0 reserved for transparent), LZW encoder, `NETSCAPE2.0` loop
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
2. **Second emitter layer** — **done (2026-07-29).** Shipped as **Layer B**: a fully independent
   second population (`emit2*`), not children of Layer A the way the sub-emitter is. Its own count,
   shape, emitter, direction, timing, gravity, drag, color and **blend** — the last of those is
   what the feature actually turned on, because the headline case wants additive fire *and*
   alpha smoke in one effect, and a single global blend pushes dark smoke through `lighter` where
   it composites as a white blob. `emit2Delay` is what lets the smoke outlive the fire that caused
   it. Presets: *Campfire Smoke*, *Cannon Blast*.
2b. **Multi-shape selection** — **done (2026-07-29).** The picker is click-to-toggle: any number of
   shapes can be on at once, and each particle draws one of them, chosen from its stable `P_ID`
   through the usual hashed draw — so a particle keeps its shape for life and the assignment holds
   across re-renders, scrubbing and export. Resolved at DRAW time, not in the frame table: which
   sprite a particle wears doesn't affect its physics, so this cost no per-particle storage and no
   `P_STRIDE` bump. Stored as primary `shape` + `shapeMix` extras rather than one list, because
   `shape` is an index in every existing preset and share link. Preset: *Garden Burst*.
2c. **Shape-aware Orbit** — **done (2026-07-30).** The Orbit layer drew its own filled circles and
   ignored `shape` entirely, which quietly bounded what it could ever be: a ring of light or a
   shield, never the cartoon stars circling a stunned head. A preset could be *named* for a shape
   the layer had no way to draw — that is how "Stun Stars" first shipped as round beads. `orbitUseShape`
   switches the bodies to `shapeSet(shape, shapeMix)`, one shape per body by index, so a mixed
   selection rings alternating things. Opt-in, defaulting off, because the layer's existing presets
   (*Shield Orbit*, *Power Rings*) are beads on purpose and a silent change to shipped output is
   worse than a new switch. `layerColour()` now returns h/s/l alongside the CSS string, which is
   what any structure layer needs to reach the sprite cache.

   **Its own picker followed (2026-07-30).** Borrowing the emitter's selection made "stars circling a
   stunned head" possible but not "stars circling a GLOW burst" — one selection served both roles.
   `orbitShapes` is a standalone list in `PATCH_EXTRAS`, and **empty means FOLLOW rather than draw
   nothing**, which is the inverse of the main picker's rule and the reason adding it changed no
   existing effect. Deselecting the last shape therefore returns to inheriting instead of refusing,
   and the panel says which state it is in — an empty picker that silently means something is worse
   than one that tells you.
2d. **Library (desktop)** — **done (2026-07-30).** Ported from CrunchyBGM §101, and the useful part
   was its rule: split by **verb**, not by feature. Export and Share turn *this* effect into a file;
   the Library is the shelf you come back to. Two things were filed wrongly by that test — imported
   particles were reachable only by scrolling to the particle picker and noticing a strip beneath it,
   and exports were not recorded anywhere at all.

   Each entry stores the **patch**, not a filename. A list of names tells you what you once made; a
   list of patches lets you load one back, change a slider and export again — which is the whole
   request. Bounded at 40 because localStorage is a few megabytes and this grows silently.

   `applyPreset` gained an `exact` flag for it. The pixel lock and the sound hold exist to carry your
   current crunch and matched sound *across a change of effect*, which is right for picking a preset
   and wrong for reopening an artifact: `count` and `size` sit in the hold's intensity group, so a
   restore with a hold active handed back different numbers than the file that shipped and the
   re-export would not have matched. Caught by an assertion, not by eye.

   **My Effects deliberately stays in the left column** — it is a browsing surface used constantly
   while editing, not somewhere you go and open. BGM's own lesson is that moving a feature leaves the
   tour spotlighting the wrong control while every assertion passes; moving it is a separate call.
2e. **Layer timing** — **done (2026-07-30).** *"I know effects can be sequenced, but it's not
   immediately obvious how."* Investigating turned that from a clarity problem into a capability one:
   of ~43 systems exactly **three** params could stagger anything (`emit2Delay`, `shotDelay`,
   `chainLag`), in three unrelated panels, none of them saying "sequence". Every other layer began at
   frame 0 with no way to move it, so clearer UI would have advertised something that barely existed.

   Every structure layer already took `t` as an argument and was called from one place, so the delay
   is applied **at the call site** — a `stage(name, fn)` wrapper in `drawFrame`. None of the twenty-odd
   draw functions learned about timing, and a layer added later gets sequencing by being wrapped the
   same way. Before its delay a layer is *skipped*, never called with a negative time: they divide by
   their own life and would run backwards from nowhere. Flash and Shockwave are simulated rather than
   drawn, so they take the delay on the `t0` they already had for chained shots.

   Stored as one `PATCH_EXTRAS` string keyed by group name (`"Shockwave:0.05,Growth:0.2"`) rather than
   ~25 new PARAMS rows, which would have put a slider in every layer panel to express one idea. The
   Timing panel lists only the layers that are ON — showing all 43 would be a wall of zeroes — with
   particles as a disabled anchor row at 0, because everything else is staged against them.
2f. **Tutorials** — **done (2026-07-30).** Ported from CrunchyBGM §140. The welcome tour answers
   "what is this"; nothing answered "how do I use the thing I just found", and the app had grown
   Timing, Library, Layer B, multi-shape and the sound hand-off since the tour was written.

   **One runner, several lists.** `TOUR` stayed the welcome array and `tourSteps` became whichever
   list is playing, so `startTour(steps, marksSeen)` drives both. A second spotlight implementation
   would have drifted from this one in exactly the ways nobody notices until a card lands off-screen.
   `tourMarksSeen` is the only real difference: finishing the welcome tour records the preference,
   finishing a tutorial must not, or opening a tutorial first costs you the tour forever.

   **`before` per step**, not per tutorial, because stepping *backwards* re-runs them — a step that
   spotlights a closed dialog dims the page around nothing. Six tutorials, 20 steps; the Library one
   is pushed only on desktop rather than pointing at a hidden button.

   Asserted: every step's target exists *with its `before` run first* (this caught `#randomBtn`,
   which is `#rand`), no step spotlights the whole page, every card lands on screen, one row per
   entry, and the tutorial/welcome seen-marking split in both directions. BGM's §65 caveat carries
   over unchanged — a selector test catches a renamed control and never a moved feature.
2g. **Share as a posting GIF** — **done (2026-07-30).** Not a second export format; a different
   *job*. Export → GIF produces an asset: exact frame size, transparent, for an engine. This produces
   a POST: 320/256/200px depending on frame count, composited onto the app's own dark stage color,
   looping forever, with an optional site tag.

   The reason is distribution, not features. Effects do not travel the way sounds do — a sound is its
   own payoff in one second, a sprite sheet is a supply you only want mid-project. A looping GIF
   plays inline in Discord, Bluesky and Mastodon with no click and no context, so the effect can sell
   itself to someone who was not looking for a tool.

   Opaque on purpose: GIF carries 1-bit alpha and every effect here has soft edges, so a transparent
   version fringes hard against whatever background a client uses. Resolution yields to frame count
   because that is what actually blows up a GIF. The site tag defaults ON — it is the only reason the
   file does any work once it leaves — with the checkbox beside it, and Export untouched, so the
   "yours, unwatermarked" promise still describes the thing that promise is about.
2h. **matchSound, measured** — **done (2026-07-30).** Fuzzing 160 patches across CrunchySFX's real
   parameter ranges found **22% of matched sounds ending in dead frames** and **27% rendering their
   particles below a pixel**. Two causes, both structural:

   - **Length and envelope are independent inputs.** A two-second sound can have a tenth-second
     decay, and mapping each in isolation produced a two-second clip holding a tenth of a second of
     visuals. Stretching `life` would be the wrong reading — a snappy envelope should still look
     snappy — so instead a long sound with a short envelope now spreads its births over the clip.
     That is also the truer mapping: such a sound is *sustained*, and a stream of short-lived
     particles is what sustained looks like.
   - **Fit divides by the bounding box**, and that box depends on speed, radial, chained shots and
     drag together, with `grow` shrinking particles below nominal on the way. Two analytic estimates
     of "travel" were wrong (one by 3.6x), so the correction now **simulates the patch and measures**
     what a particle would actually land as, scaling size until it reads. It iterates, because the
     box *includes* the particle radius — growing them grows the box and cancels part of the fix.

   **Ordering was the whole bug at one point.** The correction first sat mid-function, where `shots`
   had not yet been derived from the sound's repeat count; it measured a one-shot bounding box,
   decided the particles were fine, and shipped specks anyway. It must run after every mapping.

   Result: sub-pixel 43 → 0, blank 9 → 1, dead-tail 36 → 3 of 160. The clamp added earlier never
   fires on real input — no mapping leaves its range across the whole domain — so it stands purely
   as defense against a hand-edited link.

   Asserted with corners **and combinations**: single extreme inputs never produced a speck, and an
   assertion built only from corners passed with the fix disabled. It took several extremes at once.
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
`lineLife` every spoke takes stop 0; that is why the icon's color lives there.

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

**Memory is the real limit, not time** — which is why exports stream. ✅ **Done 2026-07-27.**

`streamFrames()` renders one frame at a time, hands it to a callback and releases it, so peak
memory is a couple of frames rather than the whole sequence. Measured at 1024²: **76 MB → 8 MB
(9.5×) at identical speed**, or 28 MB (2.7×) when `loopBlend` is high. `renderFrames()` still
exists unchanged for the preview and thumbnails; both share `renderPrep`/`renderOneFrame` so they
cannot drift, and the suite asserts they are pixel-identical across plain / loopBlend / reverse /
echo and all three combined.

Two wrinkles it handles rather than punts:

- **`reverse`** only flips the OUTPUT order, and every consumer is index-addressed (cell *i* of a
  sheet, `frame_007.png`), so it costs nothing — emit with a flipped index.
- **`loopBlend`** dissolves the last *L* frames into the first *L*, so a head frame cannot be
  finalized until its partner exists. The head is held (at most 35% of the sequence) and each head
  frame is emitted the moment its partner renders. This is the whole reason the saving is 2.7×
  rather than 9.5× on looping effects.

**Trim needs a measuring pass.** The crop box is the union across every frame. The tempting
shortcut — scale the 1× preview's box by the export multiplier — is *wrong*, and the suite caught
it: glow radius and outline width are fixed-pixel, not frame-relative, so the export bbox is not a
clean multiple of the preview's. At 2× the estimate came out 8–18 px tight, i.e. it clipped the
effect. So trimming streams once to measure, then again to crop: time doubles, memory stays flat.
Running out of memory is a hard failure; taking longer is a soft one.

**Still buffered, deliberately:** APNG (one container with an inter-frame dependency chain) and the
emissive mask (built from the finished frames). The export dialog says so when either is selected.

Still open: **half-res glow.** At 2048² bare rasterizing is 438 ms while glow alone is 3877 ms —
roughly 9× everything else. Rendering the blur at half resolution is ~4× cheaper and would take a
4K export from ~15 s to ~4 s. Deferred because it shifts the look of every preset slightly, so it
belongs with the quality pass.

## 12. Artwork licensing — CC0 only

**No bundled asset enters this project unless it is CC0 / public domain.** Every particle shape is
drawn from scratch in `makeSprite`.

This is stricter than "use open source art", and deliberately so. The artwork is baked into the
sprite sheet a user exports and **ships in their commercial game**, so any obligation attached to
it propagates to *them*, not just to us:

| license | what it would cost a user shipping a game |
|---|---|
| CC0 | nothing — the only acceptable answer |
| MIT / Apache-2.0 | keep a notice file; tolerable but still an obligation we imposed |
| CC-BY | a credits-screen requirement they will never know they took on |
| CC-BY-SA | their sprite sheet is arguably share-alike — unusable commercially |

Checked 2026-07-27: **no major emoji set is CC0.** Twemoji is CC-BY-4.0, OpenMoji CC-BY-SA-4.0,
Fluent Emoji MIT, Noto Emoji Apache-2.0. Kenney's packs *are* genuinely CC0 but are game-UI icons,
not VFX primitives.

There is also a technical reason drawing wins. Shapes are rendered as white masks and tinted in a
single `source-in` pass, so a full-color bitmap can only be pasted, never tinted — it would fall
outside hue, hue-shift, saturation, hot core, the color ramp and palette lock. `glyphTint` exists
solely as that escape hatch for system emoji. A drawn shape is roughly fifteen lines, tints
correctly, and survives being crunched to 8px.

Users who want specific third-party art can still supply it through the `image` shape — that
license is theirs, and knowingly taken on.

## 13. Web vs desktop

> **Updated by §18 (2026-10-11):** the desktop adds the PLANTED Library (your effects inside your game's folder) and
> the core's Settings and desktop gate; VFX's own "Library" dialog is now "Imports & history"; the web's "Get the
> Desktop app" button is the core's (desktop.js), shown only once suite.js has VFX's store link (the ITCH_LIVE flag is
> gone). The table below is otherwise as it was.

Same split as CrunchySFX, and the same principle: **the library and bulk workflow are the desktop
app; making and exporting an effect is free forever on the web.** Nothing the free build produces
is withheld, watermarked or resolution-capped.

Desktop-only today:

| feature | why it's on that side |
|---|---|
| ★ My Effects library | persistence — on disk, not a browser store you can wipe by clearing cookies |
| 📁 Custom categories | organizes the library, so it follows it |
| 📦 Batch export | exists to render the library; meaningless without one |
| 📂 Native save dialogs | only possible in the Tauri build |

Free on the web, permanently: every shape, system and preset, every export format and size, GIF,
share links, Randomize, Breed, Variations, Foundry, Match a sound and the synthesized WAV.

**Mechanism.** `const isDesktop = !!window.__TAURI__`, and gated markup carries `data-desktop`; a
sweep at the end of boot hides all of it on the web. Controls built at runtime (the "＋ New
category" entry, rebuilt per context menu) are gated where they're created. Gated features are
**absent, not disabled** — a dead control you can click is a worse experience than one that isn't
there. The web build gets a "🖥 Get the Desktop app" CTA in its place.

The suite runs in a browser, so it *is* the web build — which makes it the right place to assert
the gate. It checks that every `data-desktop` element is hidden, and separately that export,
share, GIF, Randomize, Breed, Match-a-sound and Fit are **not** hidden, so the free tier can't be
hollowed out by accident later.

## 14. Packaging the desktop app

`cargo tauri build` works here and produces a **.deb**. Two things it will not give you on this
machine, both found by running it rather than assuming:

**1. The AppImage cannot be built locally.** linuxdeploy ships as an AppImage and self-mounts via
libfuse2, which Arch-based distros no longer provide:

```
dlopen(): error loading libfuse.so.2
```

`APPIMAGE_EXTRACT_AND_RUN=1` makes linuxdeploy itself run, and the CI workflow sets it, but it is
not worth chasing locally because of the second problem.

**2. A Linux build from this machine is unusable by most buyers.** The binary is linked against
whatever glibc built it:

| | glibc |
|---|---|
| this machine (CachyOS) | 2.43 — produces a binary needing **GLIBC_2.39** |
| Ubuntu 22.04 LTS | 2.35 — **will not start** |
| Debian 12 | 2.36 — **will not start** |

So **Linux distributables must be built in CI on `ubuntu-22.04`**, the oldest runner that still
carries webkit2gtk-4.1. This is exactly the risk CrunchySFX's release notes flag; the numbers above
are this project's, measured with `objdump -T`.

`.github/workflows/desktop-build.yml` builds Windows + Linux on a `v*` tag, attaches everything to
a **draft** release, and pushes only the Windows installer to itch. Never publish that draft — the
paid installers would become a free public download.

> **Note (superseded in part, §30, 2026-10-16):** the Flatpak manifest exists and CI ships it to itch; no AppImage is
> built at all; the version lives in five places. `.github/workflows/desktop-build.yml` and RELEASE.md are authoritative.

**Linux is not shipped to itch yet, on purpose.** CrunchySFX ships a **Flatpak** as its Linux
product rather than the AppImage, because the Flatpak runtime brokers host GPU drivers and works on
bleeding-edge distros where an AppImage's bundled GL libraries blank-screen. That needs a
`flatpak/` manifest this project doesn't have. Until then the `.deb`/`.AppImage` ride along on the
draft release for manual testing, and the AppImage has **never been verified on a non-bleeding-edge
host**.

**Version lives in two files.** `APP_VERSION` in `index.html` and `version` in
`src-tauri/tauri.conf.json` must agree; `tests/build.py` exits non-zero if they drift, so every
test run checks it. Nothing else connects them, and a mismatch is invisible until a bug report
quotes a version that never shipped.

**Settled (2026-07-29):** the name is registered, so the bundle identifier stays
`com.crunchyvfx.app` — matching the Flatpak id and CrunchySFX's convention. Tauri warns that a
`.app` suffix collides with the macOS bundle extension; SFX has already shipped with the same
suffix, and changing VFX's alone would break suite consistency for a cosmetic warning.

## 15. The web deploy

**Cloudflare Workers, not Pages** — the same shape as CrunchySFX and CrunchyBGM, with Workers Builds
connected to the repo and the repo root served as static assets behind a small Worker.
**[DEPLOY.md](DEPLOY.md) is the runbook and carries the reasoning**; the short version of why this
app's Worker does more than either sibling's:

- **It version-stamps subresources**, which SFX doesn't need and BGM does. SFX loads three files;
  VFX loads seven. Seven independent browser caches means a fresh `index.html` can pair with a stale
  `vfx.js` and die on a symbol that doesn't exist yet — which happened during development and cost
  an afternoon, presenting as `shapeSet is not defined` in a function unrelated to the cause. The
  `?v=` comes from the deploy id, injected at the edge, so it can't be forgotten.
- **It rewrites Open Graph tags for `?e=` share links**, which SFX does and BGM has only stubbed,
  so a shared effect unfurls by name instead of as a bare domain.

`.assetsignore` is what keeps the design doc, the notes, the suite and the Tauri/Flatpak sources off
the public site; `assets.directory: "."` would otherwise publish the whole repo.

Unlike both siblings — whose workers are commented "UNVERIFIED against a real Cloudflare runtime" —
this one has been run on `workerd` locally via `npx wrangler dev`, with the stamping, cache headers,
asset exclusions, share cards and a full app boot all confirmed. `node tests/worker.test.mjs` covers
the pure helpers, and caught a real UTF-8 bug that SFX's equivalent still has (see DEPLOY.md's
closing list).

## 16. The Crunchy suite button (2026-10-09)

> **Partly superseded by §17 (2026-10-11):** `suite.js` and its `suite-*` styles now come from **crunchyCore**
> (`node tools/pull-core.mjs`), not as a hand copy from CrunchyTile; the `suite-*` block left `styles.css` for
> `crunchy-base.css`. The mount and the opener scope below are unchanged.

A "✦ Crunchy suite" button sits at the end of the top bar's right-hand group (web and desktop both),
opening a dialog of all five Crunchy tools with a line each and their links. It is a port: **canonical
in CrunchyTile, TILE-DESIGN.md §80.** `suite.js` must stay **byte-identical** to Tile's — never edit it
here; change a link or a line in Tile and copy the file again. The `suite-*` CSS block at the end of
`styles.css` is Tile's verbatim too, plus one companion rule (`.suite-overlay[hidden]`) because this
app has no global `[hidden] { display: none !important }`. It is mounted with `suiteMount("vfx", …)`;
on desktop the links go through `tauri-plugin-opener`, scoped in `capabilities/default.json` to the
suite's hosts.

## 17. The suite's shared look: angular, pixel icons, a violet accent (2026-10-11)

**Why.** A friend, on CrunchyBGM: "too round, and was obviously AI generated, make it more angular". AJ agreed and
asked for one styling standard across the suite: chrome that belongs to pixel art. This follows crunchyTile's
TILE-DESIGN.md §105 (Tile first), CONSOLIDATION-PLAN.md §9 (the direction and the six accents) and CrunchyBGM's
BGM-DESIGN.md §614 (the closest worked example). Pass 1 of the consolidation: the LOOK only. No behavior, storage
key, share link or export changed; `project.js` (§13's half-done desktop project) is untouched, as are the core's
library/settings/desktop files, which are pass 2.

**What.**
- **crunchyCore adopted.** `tools/core-files.json` lists `tools/core-commit.mjs`, `suite.js`, `crunchy-base.css` and
  `crunchy-icons.js`; the three app files are GENERATED copies (header "GENERATED from crunchyCore"; never edit them
  here; `node tools/pull-core.mjs --check`). `suite.js` was a hand copy of Tile's and is now the core's (build 4: each
  tool in its own accent, with a pixel icon). The base-3 MIGRATION is done: VFX's `suite-*` block left `styles.css`.
  VFX's own `lib-*` rules STAY: they style VFX's own Library dialog (imported particles + exports, §13), not the core's
  `library.js`; only `.lib-title` shares a name with a core rule, and VFX's later rule sets what that dialog needs.
- **Registered.** `crunchy-base.css` is linked BEFORE `styles.css`; `crunchy-icons.js` loads after `suite.js`.
  `FRONTEND` in `src-tauri/build.rs` is 13; `tests/build.py` rebases both; the desktop workflow's copy line, the
  subresource counts in `worker.js`, `DEPLOY.md` and `.assetsignore` moved (eleven: nine scripts, two stylesheets);
  neither file is matched by `.assetsignore`.
- **A stamp guard (new; VFX had none).** A small script after the core files checks `SUITE_BUILD`,
  `CRUNCHY_ICONS_BUILD`, `--base-build` and VFX's own `--css-build` (new, 1, in `styles.css`; bump it and `CSS_BUILD`
  together). It is NOT fatal: a stale core file costs the look or an icon, never an effect, so it warns in the console
  and puts a one-line `#stalecore` bar at the top. Its rows keep the shape `pull-core` reads (`file:` then `want:`; the
  one-line `"crunchy-base.css is build "` check), so future pulls move the wants themselves.
- **styles.css keeps layout and the accent only.** `--accent #c77dff`, `--accent-dk #7a3fb0`; text on an accent fill is
  the base's `--on-accent` (every `#201005`/`#17131f`/`#05202a` went). The neutrals (`--bg --panel --panel2 --line
  --ink --muted`) and `--accent2` were removed from `:root`: the base's apply (`--accent2` is the base's alias of the
  neutral `--info`; the uses were renamed to `--info`). Buttons, selects, sliders and checkboxes are the base's: VFX's
  own button colors, hover, press and `.primary`, and its round accent slider thumb, are gone.
  - **106 `border-radius` declarations gone** (3 of them with the `suite-*` block); none is left. Nothing in VFX's
    chrome is round by meaning: the effect, the shapes, the ramp and every preview are drawn on canvases, which keep
    whatever they draw. **Checkerboards are content** and kept their exact colors (the stage, the dock, the breed /
    variation / foundry cells, My Effects thumbnails, the sprite editor).
  - **11 blurred shadows:** 9 floating things (menus, ghosts, the dock, the tour card and offer, the update banner)
    became the base's hard `--lift`; the switch knob's became a 1 px hard step. **Glows:** the switch's hover halo and
    its focus ring (now an outline), and the toolbar's `backdrop-filter: blur` (the bar is opaque now). **Gradients:**
    the body's radial wash and the hero boxes' (and the inherited keyboard keys') went; the tour's 100vmax dimming
    shadow stays, it is the spotlight, not decoration.
  - **The toggle switch** is square: a bordered slot with a square knob that slides over and turns the accent.
  - **Selects** are dark now (they were forced light against a GTK white-on-white popup): `background-color` and a
    pixel caret as a `background-image` set as longhands AFTER the base's `select { background }`, so WebKit keeps a
    caret; the option list keeps explicit colors so the platform menu can never go light-on-light.
  - **Toggles that are ON** (Fit, Lock pixels, Hold sound, the aspect lock) are a pale `--info` fill with dark ink,
    not the accent fill, which would make every switched-on toggle look like the primary Pause. **The generators**
    (Randomize, Breed, Variations, Foundry, Match a sound, Reroll seed) keep their own family look, outlined in the
    accent instead of the old cyan.
  - **Flat buttons** (no fill, or the borderless half of a chip) opt out of the step; a FUSED chip (custom-category
    chips, export pipelines) carries the step on the chip. Dialogs take the base's frame (2 px border, `--lift`);
    headings use `--head`. A few inputs needed `input.` on their selectors: the base's `input[type=number]` outranks a
    bare class, and turned the borderless slider values into boxes.
- **Content colors did not move.** The old accent appeared in content in exactly one place, the ramp editor's
  selected stop, drawn in JS as a literal `#ff7a45`: it never read `--accent`, so it stays orange. Effects, presets,
  palettes and every exported pixel are untouched (the export never reads CSS).
- **Pixel icons, not emoji**, in the whole toolbar, the stage controls, the Sound/Reference/My Effects heads, the
  palette, ramp and sprite-import rows, every dialog title, Close and footer button, the grid cells' ✎ ★, and the (not
  yet shown) desktop CTA. `iconsIn(document)` runs once before the app builds and once at the end (the dialogs are
  built at startup from strings); labels a script rewrites (Play/Pause, Lock pixels, Hold sound, Dock preview,
  Re-hold, Re-export My Effects) go through `setIconLabel`, because `textContent =` deletes the icon. Typographic
  marks stay: the small ✕ row buttons (an assertion counts the layer-remove ✕), ▾/▶ carets, ↑, the sprite-editor
  stamp names (● ◎ ■ ✚ ▲ ▦: they depict the stamp), the glyph and bubble quick picks (content), arrows in sentences.
  Emoji were dropped from the tour titles, the tutorial names and the desktop list's bullets.
- **No icon yet, so a word:** ⏱ Timing (a clock), 💾 Save project (a disk), ⬚ Safe (a safe frame), ⇄ Swap (a swap),
  ⚗ Take 8 / Take 16 (an alembic), 🔇 (Hold sound off: the speaker stays, the `.on` fill says the state).

**Proved.** The regression suite (480), the async suite (69), `tests/worker.test.mjs` (38), `tests/project.test.mjs`
(47), `pull-core --check`, the pre-commit hook, cargo; looked at in WebKitGTK 4.1 (the desktop engine, in an offscreen
view at 1400 x 900): the main window (web and with a stand-in `__TAURI__`), the parameter panels, the suite, Export,
GIF, Share, Breed, Tutorials and the tour, for carets, contrast, icons and unchanged content.

**Open.** `styles.css` still carries CrunchySFX rules VFX never renders (the keyboard, riff, scope, history rail,
sequence tray and more): squared with the rest, but a candidate for deletion in a later pass.


## 18. The planted Library, the core's Settings and desktop gate (2026-10-11)

**Why.** Pass 2 of the suite consolidation, step 4 of crunchyCore's DESKTOP-ROADMAP.md (AJ's decisions §6: planting
REPLACES separate project folders; one shared `crunchy/` with a child per app; `.crunchy` sidecars; zips carry
sidecars; a docked Library panel; the suite view). Copied from the three apps AJ has tested by hand in the real app
with a real Godot game: crunchyTile TILE-DESIGN.md §114 (and its "Card buttons" note), crunchyUI UI-DESIGN.md §18, and
CrunchySFX's DESKTOP.md ("The planted Library"). The rule is unchanged (§13): the desktop sells workflow, never effects.

**What a planted effect is.** Plant in a folder… (the Library: a panel docked on the right, Ctrl+L) picks a Godot
game, a Unity project or any folder. Each effect saved there is `crunchy/vfx/<slug>/` (Unity `Assets/Crunchy/VFX/<slug>/`):
EXACTLY what the Export dialog writes for it as a sprite sheet — `buildExportFiles` itself, so the bytes are the
button's (the desktop suite compares them) — beside `<slug>.crunchy` (`project-app.js` lists its fields): the share
string `s` that reopens it (the `?e=` encoding), `exp` (the export settings), `fit`, the synthesized `sound` as a
CrunchySFX patch, `info` and a 96 px `thumb` for the card.
- **The metadata follows the engine.** In a Godot project the sheet always gets its Godot 4 SpriteFrames `.tres` (that is
  what planting there is for). In Unity the dialog's choice, never a `.tres` (Generic JSON instead); in a plain folder
  the dialog's. Layout, trim, power-of-two, the emissive mask, the sizes and the sound come from the Export dialog; the
  panel's bar says what Save will write ("Saves as: sheet · Godot SpriteFrames · trimmed · 1×"), and opening a planted
  effect puts its settings back in the dialog. A planted effect is always a SHEET (frames zips and APNG are not engine
  assets).
- **Godot paths:** VFX's `.tres` already names its texture RELATIVELY (`path="<base>.png"`, PROJECTS-HANDOFF §2 bug 2,
  fixed before), so nothing names its own `res://` path: no `plantSlugFor` dance (UI needed one), the web zip unchanged.
  `exportName` and `base` are fixed at the first save, so a rename never moves or rewrites a file.
- **Unity: allowed, as plain files.** A Unity project imports the sheet PNG as a texture and the JSON as a TextAsset; the
  `.crunchy` becomes a harmless DefaultAsset with a `.meta`. Slicing is the person's (Sprite Mode Multiple, by cell size:
  the JSON has the numbers), exactly as the Export dialog has always said; the panel says it when a Unity project is
  planted. No `.meta` is written (still the §4 rule). Proved on the mock (files, bytes, `Assets/Crunchy/VFX/`); a live
  Unity import is unverified (no Unity here), as in Tile and SFX.
- **The export context.** To render a SAVED effect without loading it into the editor, the export functions take an
  optional context `{ st, r, fit, ref, synth }` (`liveExportCtx()` is the default, so the Export dialog is byte-for-byte
  what it was: the frame hash proves it). `plantedRender` builds one from a sidecar (the share string's state, its own Fit
  and sound, no reference image), with the effect's own imported particle swapped into vfx.js's one image global for the
  render (`withSpriteOf`) so a planted effect never borrows the editor's sprite.
- **Card buttons, as the other three apps** (library.js 3): open (the picture), Rename (the name only), **Replace** (two
  clicks: the editor's effect into that card, same name, same files), **Re-export** (only with "update available", via
  `when`), Duplicate, Delete (two clicks: its files, Godot's `.import`s, the folder once empty; a person's own file keeps
  the folder). Update all; recent planted folders; the suite view; Ctrl+S saves (Save over a DIFFERENT effect of the same
  name asks twice). "Update available" is `plantNeedsUpdate` over a fresh render of the sidecar, one effect at a time in
  the background; an effect saved with a reference image COMBINED in is never second-guessed (the sidecar can't keep the
  image, like SFX's impulse responses).
- **My Effects stays in the browser, untouched.** "Plant my effects" COPIES them in (each once: the sidecar's `from`),
  with their category names as filter chips; "Plant a project file…" does the same for a `.crunchyvfx` file. While a
  folder is planted, "Save current" in My Effects (and Ctrl+S) saves into it, and the head reads "My Effects (this
  browser)"; closed, it is the browser save it always was. No storage key was renamed or reshaped; the only new one is
  `crunchyvfx.recentPlanted.v1`.
- **Zips carry sidecars** (decision 4): the Export zip (files at its root) gets `<base>.crunchy` at the root, named for the
  zip; the batch pack one per effect folder (`<base>/<base>.crunchy`); the variations pack one per variation beside its two
  files. A single-file export is still just the PNG. Proved adoptable: the Export zip unpacked into a planted folder opens
  as a current asset.

**VFX's own "Library" is now "Imports & history".** There must not be two things called Library, and library.js has no
tabs. The least surprising option: the dialog (imported particles + export history, §13) keeps everything it does and
where it opens from (the toolbar, the same place), is renamed "Imports & history", and is also a command in the planted
panel. Its classes went from `lib-*` to `ih-*` (the core's `lib-*` rules would have styled it, and its own `.lib-title`
would have restyled the core's panel), its ids from `lib*` to `ih*`; the tutorial and the regression suite follow. A core
feature that would be better: **tabs (or "extra sections") in library.js**, so an app can show its own shelves (VFX's
imports and history, BGM's six libraries) inside the one panel — the roadmap's original plan.

**project.js is gone.** VFX's hand copy (§13's half-done desktop project, PROJECTS-HANDOFF.md) was loaded but never
called: nothing in VFX ever wrote a project folder, so there is nothing to move in and the core's project.js is not
needed. Removed with `tests/project.test.mjs`; `tests/plant.test.mjs` pins VFX's adapter over plant.js instead (and the
regression suite's one reference, `PROJECT_VERSION`, was a latent bug: the `.crunchyvfx` file's version is
`VFXFILE_VERSION`). `slugify`, which only project.js called, went with it (folders are plant.js's `plantSlug`, files
`sanitize`, as the Export dialog names them). PROJECTS-HANDOFF.md is marked
superseded. Its §2 bugs 1 and 2 had been fixed before; bug 3 (exports return files) was the shape this pass needed.

**Settings and the desktop button come from the core.** ⚙ Settings (`settingsMount`, web and desktop) has VFX's two
preferences as rows, each driving the control that owns it so the same keys are written the same way (`crunchyvfx.dock.v1`,
`crunchyvfx.lockpixels.v1`), plus Replay the tour and Tutorials. `desktopMount("vfx", …)` replaced VFX's own `ITCH_LIVE`
flag, dialog and `steam-*` styles: it hides `[data-desktop]` on the web and shows "Get the desktop app" ONLY once suite.js
carries CrunchyVFX's store link — today it has none, so nothing shows (both suites assert it; the web suite also proves
the button would appear with a link). No "pro", "premium" or "unlock" in the chrome (the suites scan it; a PRESET is
called "Treasure Unlock", which is content).

**Registered.** `tools/core-files.json` adds plant.js, library.js, settings.js, desktop.js (pulled from a COMMITTED core,
6a77157; crunchy-base.css 3 → 5, no migration crossed); the stamp guard checks their builds (3, 3, 2, 1); `project-app.js`
(VFX's own) loads before plant.js; `FRONTEND` in build.rs is 17; `tests/build.py` now rebases every sibling by pattern;
the CI copy line, worker.js, DEPLOY.md and `.assetsignore` prose count fifteen subresources (thirteen scripts). Desktop
permissions were already complete (read/write text, read-dir, exists, mkdir, remove; scope `$HOME/**`); the Flatpak gets
`--filesystem=home` (was `xdg-download:rw`), as Tile's and SFX's. `--css-build` is 2.

**Proved.**
- **No rendered frame changed:** `tests/frame-hash.js` (run on HEAD 11e8d14 before any edit: `frame-hash.expected.txt`)
  hashes every preset's frames (189, a third again with Fit off: 253), 21 Export-dialog outputs across every format,
  layout, metadata, trim, pow2, mask, size and a sound, and the two batch packs' contents: 276 hashes, identical after.
  (The batch lines hash what goes INTO the zip less `.crunchy` entries, the one intended difference.)
- **Everything saved keeps opening:** `tests/make-fixtures.js` ran on HEAD before any edit and wrote `tests/fixtures/`
  (the browser store under every `crunchyvfx.*` key, a `.crunchyvfx` file, a My Effects `.json`, five share links, and
  the frames each opens to). `tests/regression-web.js` (11) and `tests/regression-desktop.js` (46) boot over that store and
  prove it reads, renders and stays byte-identical, with "Plant my effects" leaving it so.
- **The desktop suite** (the Tauri mock, `remove` takes only an empty folder): the docked panel; planting in Godot,
  Unity and a plain folder; save files byte-equal to the Export dialog's (with emissive, two sizes and a sound too); a
  fresh save is up to date when rendered back from its sidecar (image-sprite effects included); in-place update;
  update available + Update all; Replace (two clicks) and Re-export (only with an update); rename keeps paths and bytes;
  duplicate; delete prunes (and keeps a folder holding a person's file); Plant my effects and a project file; the suite
  view; the zips' sidecars (and adopting one); Imports & history from both places; the Settings rows and their keys;
  recent folders; nothing written outside `crunchy/vfx/`; no page errors.
- **A real Godot** (`node tests/godot-check.mjs`, godot-mono 4.7): ten effects planted by the app (trimmed, a strip, two
  sizes, an emissive mask, a sound, pow2, HEAD's My Effects with an imported particle), imported headless; every one of
  the 11 SpriteFrames loads by `res://` with the exported frame count, fps, loop and frame size; every PNG is a texture;
  the `.crunchy` is no resource and gets no `.import`; plant.js reads them back from the real disk; a delete takes the
  `.import`s too, and after a re-import Godot no longer finds it.
- The regression suite (482), the async suite (69), `tests/worker.test.mjs` (38), `tests/plant.test.mjs` (14),
  `pull-core --check`, the pre-commit hook, cargo. Looked at in WebKitGTK (`tests/show.png`, `tests/show-desktop.js`).

**Not yet.** A person clicking the native dialogs (AJ did for Tile, UI and SFX); a live Unity import. A `.tscn`
(AnimatedSprite2D) per effect was proposed in PROJECTS-HANDOFF §4 but is not what the Export dialog writes, so it is not
planted either; adding it would be an export change (web too) and a decision for AJ. **Superseded by §26** (AJ decided
2026-10-15: every Godot export, web and desktop, ships the ready scene).

**The removal guard (crunchyCore plant.js 4, 2026-10-12; crunchyTile TILE-DESIGN §115):** a save of an existing asset
(Save, Replace, Re-export, Update all) or a Delete that would remove a file one of the game's scenes or resources uses
(Godot: its `res://` path in a .tscn/.tres/.gd/…; Unity: its GUID) stops and names the file and its users; the same press
again goes through. Found when AJ's player_test.tscn lost a Tile decoration a later save no longer made. The desktop
suite has a delete-guard row.

**Save never overwrites (crunchyCore plant.js 5, 2026-10-12; crunchyTile TILE-DESIGN §117).** AJ, testing CrunchyCharacter:
opening a planted asset, changing to another and saving replaced the first. Save now always plants a NEW asset; a taken
name gets the next number ("… 2", then "… 3"), and only a card's Replace (two clicks), Re-export and Update all write over a
planted one. The desktop suite's same-name rows prove it and make their update through Replace.

## 19. Suite links: a CrunchySFX sound, and the combined Godot scene (2026-10-12)

**Why:** crunchyCore SUITE-LINKS.md §4, the first pair. AJ: both apps pointed at the same planted game, so an effect can
use a sound CrunchySFX saved there, "for a combined export in an engine". On the scene: "Wait for play, that sounds like a
jumpscare waiting to happen. Lets do impact frame."

**What (desktop, planted; the web build and its exports are unchanged: all 278 frame and export hashes match):**
- **"Sounds in this game"** (a select in the Sound panel's head): the sounds CrunchySFX planted here (crunchyCore
  `plantPeek`). Picking one LINKS it (`soundLink`, a plant.js 7 "reference" link): its WAV is read from the game folder
  and heard in the preview; the row says "Boom (CrunchySFX)". A synthesized sound, a loaded file or ✕ drops the link.
- **Impact** (a frame number in the Sound panel, desktop only, `soundFrame`): the sound starts on that frame, in the
  planted scene when the game calls play() and in the preview too. 0 = with the first frame (the web's only value, a
  no-op there).
- **The combined scene** (**superseded in part by §26**: it is now every Godot export's, web too, and it PLAYS ON READY by
  default; play(), stop(), `finished` and `sound_frame` still work as written here), planted with every effect in a Godot game: `<base>.tscn` (a Node2D: an AnimatedSprite2D with
  the effect's SpriteFrames, and, when it has a sound, an AudioStreamPlayer2D) and `<base>.gd`. NOTHING PLAYS ON LOAD:
  `play()` starts the sprite from frame 0 and the sound on `sound_frame`; `stop()`; `finished` when a one-shot ends (a
  looping SpriteFrames loops, its sound again each time round). The sound is the LINKED WAV by its res:// path, else the
  effect's own synthesized `<base>.wav`, else none. Proved in a real Godot: nothing on load, silent from frame 0, the
  sound exactly on frame 3, `finished` emitted.
- **A Replace in CrunchySFX reaches the game with nothing re-exported** (the scene points at the file). If the sound is
  deleted there, the card says "linked sound missing" (hot), and the next save (Re-export shows) leaves it out.
- **Sidecar:** `links` (the one link) and `soundFrame`, both only when set, so a web zip's sidecar is byte for byte
  what it was. project-app.js 2. Reopening an effect brings its link and impact frame back.
- **"Update available"** compares only the files a sidecar lists: an effect planted before the scene existed, or a web
  zip adopted here, is not flagged for lacking one; its next save adds it.
- **Unity and plain folders:** the link is recorded and the guard sees it (SFX warns before deleting), but there is no
  combined scene and no other file naming the WAV yet.

**Found on the way:** Godot 4.4+ writes `<script>.gd.uid` beside every script, and plant.js removed only `.import`, so a
deleted effect's folder stayed (VFX's own Godot check). crunchyCore plant.js 7 removes `.uid` too.

**Proved:** the desktop suite 55 (8 new rows: the picker lists SFX's sounds, picking links and plays it, the saved scene
plays the SFX WAV by res:// on frame 3 with no WAV copied, a Replace in SFX reaches it with nothing re-exported,
reopening restores link and frame, a synth or ✕ drops the link, a sound gone shows missing and the next save leaves it
out); web 11; plant.test 14; worker 38; the Godot check 11 (10 effects, after the .uid fix); the frame and export hashes
278, identical (this suite needs more than a 3 GB cap: run it at 6 GB).

## 20. Feedback, by the person's own email (2026-10-12)

**Why:** the suite needs a feedback loop, and no telemetry (AJ: "no telemetry. I hate it myself"). Nothing here touches
the network and that stays true: a report goes only when the person sends it from their own mail app. The canonical
write-up is CrunchyTile's TILE-DESIGN.md §118; this is VFX's adoption of it.

**What:** crunchyCore `feedback.js` (build 1; `crunchy-base.css` 7 for its `fb-*` look, `crunchy-icons.js` 8 for `mail`),
GENERATED like the other core files, with a `want: 1` row in the core-file stamp guard. A **Feedback** button after
Crunchy suite in the controls' right group opens it. The lines it shows, each untickable: the app and version, web or
desktop, the effect (its label, particle, fps and pixelate), the core files' stamps, the planted folder and its effect
count, the browser, the last status lines (`feedback.note`, fed by `projStatus` and by `#msg`, memory only), and the
Share link's form `https://crunchyvfx.com/?e=…`, OFF unless ticked. The desktop's opener may open `mailto:*`
(capabilities). Registered in index.html, `src-tauri/build.rs` (18), the CI workflow's `cp`; the subresource prose is
now sixteen (fourteen scripts + two stylesheets) in worker.js, DEPLOY.md and .assetsignore.

**Proved:** the web suite 12/12 (`feedback/the-dialog-shows-what-would-be-sent-and-the-link-is-off`: the header button
opens it with its mail icon, the Effect line is ticked, the Files line names every stamp, the link is shown but unticked,
the earlier status line is under Recent, the subject is "[CrunchyVFX] <first line>", Close closes), the desktop suite 55,
plant 14, worker 38, cargo.

## 21. Loop or one-shot, the export name, and other quick wins (2026-10-13)

**The bug:** every sidecar said `"loop": true` (the Godot SpriteFrames .tres, the generic JSON, the Variations pack's JSON), so
an explosion replayed forever in Godot, and the planted scene's `finished` signal (§19) could never fire: Godot does not
emit `animation_finished` for a looping animation.

**The choice:** a **Playback** row in the Export dialog (sheet format): *Auto* (the default), *Loop*, *Play once*. `loopFor`
resolves it. **Auto loops exactly when the effect's Master "Seamless loop" is above 0.** Every looping preset has it (48:
Rain, Aura Loop, Torch Flicker, Fire Jet…), so those still export looping. Everything else exports as a one-shot. Some
continuous-looking presets without Seamless loop (Campfire Smoke, Spore Drift, Galaxy Spin, Poisoned, Magnetized,
Old Broadcast…) now export as one-shots under Auto. Pick *Loop* for those, or turn on Seamless loop (which also hides
the seam). `playback` rides in the export settings, so pipelines, the planted sidecar's `exp` and the batch sidecars
carry it. A sidecar planted before this has no `playback` and reads as Auto, so its next re-export fixes a one-shot's
.tres. `sidecarFor`'s new `loop` argument defaults to true, which was the old output.
APNG stays looping forever: it is a viewing format, and a one-shot APNG would freeze on its blank last frame.

**The frame hash moved, intentionally, in sidecar bytes only.** Ten EXPORT/BATCH lines changed: one-shot presets
exported with Godot or Generic metadata. No FRAME line changed. Proof: with `loopFor` forced to `true`, the run
matched the old expected file byte for byte. `frame-hash.expected.txt` was regenerated.

**Proved in real Godot** (`tests/godot-check.mjs`, 14 checks): every planted .tres's loop flag is the effect's resolved
Playback, and the planted combined scene, played in a running Godot (`--fixed-fps 60`, three times its length), emits
`finished` exactly once and stops on its last frame when it is a one-shot. A looping one keeps playing and never emits it.

**Also:**
- **The Export name.** A Name field names every file. It defaults to the effect's label; a randomized or unnamed effect
  gets `<shape>-<seed>` instead of "random". A typed name holds while the effect it was typed for is loaded.
- **Remembered export settings.** They are kept in `crunchyvfx.export.v1`, a new key; no legacy key was touched.
- **Randomize keeps Lock pixels and Hold sound**, as applyPreset does.
- **A/B Swap restores A exactly** (`applyPreset(…, exact)`), and so does batch export when it puts the editor back.
- **Escape closes the topmost `.modal`** through its own Close button. Every `.modal` has `role="dialog"`,
  `aria-modal` and its heading as `aria-label`.
- **Frame stepping:** `,` `.` and Left/Right step one frame and pause. Home/End jump to the first and last frames.
- **Fit is part of the effect.** `snapshotEffect()` (undo, A/B, My Effects, the project file) carries `fit`. A share
  string carries `fit: 0` only when Fit is off, so a fit-on string is unchanged. A planted sidecar keeps Fit in its own
  `fit` field and leaves it out of `s`, so planted `s` strings are unchanged. A patch without `fit` leaves Fit alone,
  which was the old behavior.
- **Copy and markup:** `<!DOCTYPE html>` and `<html lang="en">` (the page was in quirks mode; the layout screenshot is
  unchanged). The duplicate meta description is removed. The tour opens with the suite's mission line and counts
  `MACROS.length` sliders. The desktop pitch now says Save never overwrites (plant.js 5).

## 22. The layout pass, round 1: one header row, the effect strip, two columns (2026-10-13)

**Why:** AJ: "VFX is now behind in terms of usability… we need to expand its usability and polish." Measured before the
pass: a two-row header of 20 buttons (generators, exports, project buttons and the globals mixed together), the stage
with a tall column of settings beside it, then the 189 presets as a long text list, with the editor UNDER that list below
1500 px (at 1366 the first slider was two screens down). A dead 300 px right gutter (`body { padding-right: 300px }`,
CrunchySFX's history rail, which VFX never had) ran down every wide screen. This round is presentation only: every
control is still there, no element a test or the code uses was renamed, and **the frame hash is byte-identical** (276
hashes; no render changed).

**Where things went** (the suite's shape: CrunchyTile §90 and CONSOLIDATION-PLAN §3.4, §9):

| what | was | now |
|---|---|---|
| Crunchy suite, Library (desktop), Settings, Tour, Tutorials, Feedback | the toolbar's right cluster | the header, ONE row, in the suite's order (`#hdrGlobals`); Tutorials sits beside Tour (it is also a Settings row). The web's "Get the desktop app" mounts there too |
| Randomize, Breed, Variations, Foundry, Match a sound, Reroll seed | the toolbar | the top of the editor column (`#genbar`), a "Make" row |
| Undo/Redo, Fit, Lock pixels, Hold sound, Timing | the toolbar | the genbar's second row ("Edit and keep"); Timing is an editing tool, so it went with the editor |
| Play/Pause, the frame scrubber | toolbar / stage settings | a transport row under the stage |
| Export…, GIF, Share link, Drag out (desktop) | the toolbar | right under the preview (`#stageOut`), so Export is on the first screen at 1366 x 900 |
| Imports & history, Save project, Open project (desktop) | the toolbar | the row under them (`#stageProj`, `data-desktop`) |
| the status line `#msg` (and the desktop's `#plantMsg`) | the toolbar's end | under those buttons (`#stageStatus`, `aria-live`) |
| Size, FPS, Zoom, Backdrop, Guides, Compare, Dock | a labeled column beside the stage | under it: Size and FPS rows, then the toggles as small segmented groups that wrap as whole groups |
| the backdrop note | a hint line | the Backdrop group's tooltip |
| the presets: search, 14 collapsible text sections | between the stage and the editor | **the effect strip** under the header |
| My Effects and your categories (desktop) | above the preset list | the stage column, under Sound and Reference (`#wsMine`), so a picture can be dragged from the strip into a category |

**The two columns.** From 900 px up, `.workspace` is a grid: the stage column (5fr, at least 400 px) and the editor (7fr).
The stage column is `position: sticky` with `max-height: 100vh` and its own scroll, so the effect stays in view while the
editor scrolls; on a wide screen the Dock never needs to appear. Below 900 px the editor stacks under the stage and the
Dock does its old job (it now triggers when the stage nears the top of the window: no sticky bar covers it any more).
**Auto zoom** follows the stage column's width and leaves about 440 px of height for the header, the strip and the rows
under the preview (`autoZoom`), and a ResizeObserver re-zooms when the column changes width (the docked Library).

**The effect strip** (`buildPresetStrip`): one row of picture cells, PAGED by arrows (never a sideways scrollbar), the
page counted, the wheel stepping it; how many fit is measured from the strip's width (cells are 80 px, a category divider
22 px; a divider never ends a page). In "All", a narrow upright divider names each category. Search matches a name or a
category; the chips (All plus the 14 `PRESET_CATEGORIES`, each with its count under the current search; one line, paged
by arrows like Tile's `chipPager`) narrow to one category, and clicking the chosen chip again shows everything. A cell
keeps the old buttons' gestures: click loads, right-click files it in a category, drag drops it in one. The loaded effect
is marked (`presetStripMark`, called by `applyPreset`).
- **Pictures** are one frame ~40% in (`effectThumb`'s rule), rendered alone (`renderPrep` + `renderOneFrame` at 60 px,
  Fit on): an `<img>` of a data URL, cached by name. An `<img>` keeps its pixels while hidden, so WebKitGTK (which drops
  a hidden canvas's) never shows blank cells after paging back. They paint from an idle queue (`pumpPresetThumbs`, one
  per 15 ms), the visible page first and then the next, so the first screen is not held up by 189 renders.
- **Hover plays** the effect: after 220 ms on a cell its frames are rendered at the picture's size and a canvas plays
  them over the picture, driven by the Breed grid's mini-player loop; the last 8 are kept. Not on touch.
- The strip and the stage column are watched with a ResizeObserver: the desktop's docked Library narrows the page
  without a window resize, and a stale page cut its last picture in half.

**Decisions AJ should know about:**
- **The old focus mode is removed, not wired.** `.workspace.browser-hidden` and `.viewtoggle` had no button and no code;
  with the presets in a strip there is no browser column to hide.
- **No new storage key.** The chosen chip and page are not remembered (the planted-Library suite pins the set of keys).
- **My Effects stays a section** (in the stage column), not a strip mode, in this round.
- The tour's first step points at the strip (`#presetbar`) and says how it works.

**Tests:** the structural audit gained the layout (header globals in order and nothing else, one row; the generators
head the editor; every way out is in the stage column; the old browser, toolbar and focus mode are gone; every preset is
exactly one picture and the pages show each exactly once; a page fits its strip; each chip narrows to exactly its
category; search by name, by category and nothing; a click loads and marks; a picture is a real frame and leaves the
editor's state alone; hover plays and leaving stops). The dock test and the drag test follow the move; the desktop words
check reads the header, the genbar and the stage column instead of the toolbar. `--css-build` 3.

**Round 2 (proposed):** foldable editor sections remembered per person, the rarely used rows behind a "more" fold
(Guides, Compare and Dock on the stage; per-layer advanced rows), the layer chips grouped by kind with a line each,
picture buttons for shapes and palettes (the strip's thumbnail queue can draw them), and My Effects plus your categories
as strip modes on desktop.

### 22.1 Round 1b: the generators' row, editor left, a bigger starting size, shapes as pictures (2026-10-13)

AJ, on round 1: "I think it works well", with four changes.

- **The generators get their own full-width row** (`#genbar`) between the header and the effect strip. AJ: "not because
  it's better there, but for consistency with the other applications" (CrunchyUI's toolbar row). "Make" (Randomize,
  Breed, Variations, Foundry, Match a sound, Reroll seed), a rule, then "Edit and keep" (undo/redo, Fit, Lock pixels,
  Hold sound, Timing). It is one line from 1366 px and wraps as two groups when narrow.
- **The panes swapped:** the editor is on the LEFT and the stage on the RIGHT, as in Tile and UI (`grid-template-columns:
  6fr 5fr`, editor | stage; the stage keeps its sticky column). The DOM keeps the stage first, so a phone, in one
  column, still opens on the preview. Auto zoom leaves 490 px for the chrome above and below the stage now (the new row).
- **The starting frame size is 192 px** (`START_FRAME_SIZE`). WHERE THE SMALL SIZES CAME FROM: the `frameSize` PARAMS
  default is 128 (index 4), not 64. Of the 189 presets, 158 are authored at 192, 1 at 128, 6 at 96 and 24 inherit the
  128 default. 64 comes from the era styles (Woodgrain, Micro, 8-bit, Pocket: `frameSize: 2`), as buttons or as a
  Foundry style, and from **Lock pixels**, which pins a size you chose (a Size pick, an era style or a macro that moved
  it) and keeps it across every preset, roll and session. AJ's desktop store pins `frameSize: 4` (128) that way, so every
  preset there opens at 128, the 192 ones included.
  - **The rule:** a NEW effect starts at the starting size: Randomize, the Foundry (unless its style sets a size) and
    Match a sound. The PARAMS default does not move, because it is what a preset or share link WITHOUT a `frameSize` key
    means (`applyPreset` resets to defaults; links are diffs against them): moving it would re-size those 24 presets and
    every old link. A roll at 192 differs from the default, so its link carries `frameSize` explicitly. Lock pixels
    still wins over the starting size, as it does over a preset. Breed and Variations keep the parent's size (it is an
    enum, so never mutated). No frame hash moved.
  - **Why 192:** it is what 158 of 189 presets are authored at, so a roll and a preset look alike; it is a whole 2x of
    the stage at 1366 x 900 and 3x at 1920 x 1080, where 64 px was 6-7x and read as low resolution.
- **Shapes as pictures:** every button of the three shape pickers (main, Secondary's, Orbit's) shows the shape's own
  sprite over its name, drawn by `makeSprite` at its 64 px master size in a pale neutral tint (`shapePicButton`). Like
  the strip's pictures it is an `<img>` of a data URL (WebKitGTK drops a hidden canvas's pixels; a filtered tile is
  hidden), cached by shape and painted from an idle queue six at a time. It never touches the renderer's sprite cache.
  The button's text is still exactly the shape's name (the filters and the suite read it), which is also its tooltip and
  aria-label. `custom` and `image` draw from your artwork, so they show a pixel icon (edit, image) instead. The Soft /
  Sharp / Formed / Symbol / Yours rows, the filter and the selection fill are unchanged.
- **Palettes show a swatch:** three hard steps along a particle's life (the hue, drifted by `hueLife`; the core's
  whiteness lifts the first) before the name.

**Tests:** the layout audit now pins the generators' row (between the header and the strip, full width, one line at
1400) and the editor left of the stage; new: every button in all three pickers is a picture named by its shape, every
shape draws (without touching the sprite cache), the filter still hides tiles, every palette has a swatch, and the
starting size (Randomize, Foundry with and without a sized style, Match at 192; a preset without a size and its link
still 128; the lock still wins). `--css-build` 4.

## 23. The Wizard: three questions, nine finished effects, all playing (2026-10-13)

**Why:** CrunchyTile's Wizard (TILE-DESIGN §86) in VFX: a person with a game and no effect in mind answers in their own
words and picks from nine finished effects. CONSOLIDATION-PLAN §3.4 puts it FIRST in the header's globals (Wizard ·
Crunchy suite · Library · Settings · Tour · Tutorials · Feedback), with the core's `wand` icon. The tour's welcome now
says to start there, and a "Start here · the Wizard" step points at it. No new runtime file: the tables, the choosing
and the dialog are a section of index.html (after the Foundry), the look is a block at the end of styles.css
(`--css-build` 5).

**The questions** (AJ's design):
1. **What's it for?** one of `WIZARD_TYPES`: a hit or an impact, an explosion, a pickup or a reward, a spell or an
   ability, a status effect, a projectile or a trail, atmosphere or weather, a UI or HUD flourish.
2. **What's it made of?** any number of `WIZARD_TAGS`, mixed: fire, ice and frost, lightning, arcane, nature, poison and
   slime, water, tech and sci-fi, dark and shadow, holy and light, smoke and dust, cute and shiny.
3. **Which era?** "As drawn" (the default) or one of the Era style buttons (STYLES, the same table).

Each card carries a picture: a preset's strip picture for the first two, and for the eras the type's sample drawn IN
that era at the era's own frame size, so a person sees what 8-bit or Pocket does before choosing it.

**Type → where results come from:**

| type | preset categories | name words (examples) | Foundry archetypes | Randomize rolls carrying | loops? |
|---|---|---|---|---|---|
| hit | Impacts | hit, slash, strike, clash, parry | Impact | Impact, Slice, Fracture | no |
| explosion | Explosions | explosion, boom, blast, bomb, nova | Explosion | Burst, Shatter | no |
| pickup | Pickups & Charm | coin, level, treasure, crown | Pickup | Twinkle | no |
| spell | Magic, Ice & Frost, Sequences | summon, portal, teleport, rune, zap | Magic | Sigil, Vortex, Rift, Arc, Tunnel | no |
| status | Status & HUD | aura, shield, poison, curse, stun | Magic | Aura, Orbit, Sigil | yes |
| projectile | (none: Beam, Ribbon, Path trail or Smear makes a preset one) | bolt, laser, comet, trail, beam | (none) | Beam, Ribbon, Path trail, Smear | no |
| atmosphere | Weather, Atmosphere, Ambient | rain, snow, fog, motes | Weather, Smoke | Weather, Haze, Light shafts, Droplets, Bokeh | yes |
| ui | Emotes, Symmetry & Stylize, Camera & Light | level, target, alert, damage, pop | Pickup | Bubble, Lines, Zoom blur, Kaleidoscope | no |

Membership, not ownership: a preset may be two types. 177 of the 189 presets are of at least one type; the 12 left are
Structures oddities (Water Ripple, Sonar Ping, Glitch Out…), still reachable through the strip.

**Tags are DERIVED, never listed per preset.** A tag describes what a material LOOKS like in VFX's own terms: words in a
name, shapes and systems of its own (a snowflake is ice, the Merge system is slime), a COLOR test, and shapes and
systems it is likely to use (`maybe`). The color is read where a particle spends most of its life: the hue 40% along
Hue shift (or the color ramp's nearest stop), with saturation, Hot core and Blend. An effect carries a tag STRONGLY by a
word, an own shape or system, or the color plus a likely piece; the color or a likely piece alone is a WEAK carry.
`wizardTagsOf(patch, name)` is the strong set, so a preset added next year, or a roll, is tagged the moment it exists.
Tagged presets now: fire 16, ice 12, lightning 8, arcane 30, nature 10, poison 5, water 8, tech 22, dark 10, holy 10,
smoke 15, cute 20.

> **Superseded by §23.1** (AJ: the nine were mostly existing presets). Kept for the record.

**The nine (`wizardCandidates(answers, seed)`). It invents nothing.**
- First the type's PRESETS that carry a chosen tag strongly (all of them when none is chosen), best fitting first: six a
  page at most; "More like these" (the next seed) goes on through the list, then gives rolls only.
- Then ROLLS: the Foundry's (`foundryGenerate` for the type's archetypes, style "Anything", the era being question 3)
  and Randomize's (`rollRandomEffect`, the dice of `randomize()`, split out unchanged) that carry one of the type's
  systems, run under a seeded `Math.random` (`wizardSeeded`, mulberry32; the real one is put back however the roll ends).
  Same answers and seed, same nine. A roll may also be offered with one of a chosen tag's own PALETTES pressed
  (`wizardPaint`: exactly the Palette button's write), which is how "an icy hit" finds Impact rolls in ice colors; a
  roll so painted carries that tag strongly (`wizardCarry`). A preset is never repainted.
- Ranked by the tags carried (a strong carry counts twice), then by whether the effect loops as the type does, then
  order. Variety: never two that look alike (a preset: same particle, color band and systems; a roll: same particle,
  emitter and 60° color band), one seed once, at most three of one particle (two among the rolls).
- Everything offered draws: the Breed grid's `genomePixels` bar, read IN the chosen era (8-bit at 64 px can crush a
  spark to nothing; such a preset or roll is not offered in it).
- Rolls, looks and visibility are kept in a bounded cache (`wizardCache`): they are pure functions of their seed.

**Loop or one-shot is not a question, and the Wizard does not set Playback.** Playback (§21) is a dialog-wide export
setting, not a per-effect one, so writing it would change every later export; and making an effect loop for real means
Seamless loop, which changes its pixels. So the type's `loop` RANKS (a weather or status answer prefers effects made to
loop) and each result says what Playback will do with it ("loops" / "plays once", `loopFor` with the dialog's current
choice). Auto does its job: Campfire Smoke, an Ambient preset without Seamless loop, says "plays once" under Atmosphere.

**What you see is what a click loads.** `presetOutcome(obj, exact)` is what `applyPreset` sets, as a plain object (a
refactor: `applyPreset` writes it into `state`; the frame hash proves nothing moved). A result is
`presetOutcome(patch)` (Lock pixels and Hold sound included) plus the era as `styleInto` writes it, which is the Era style
button's own write (`applyEraStyle` = `styleInto` + `eraPinned` + the usual sync, render and commit). Each result is
drawn at its REAL frame size (what Export writes) and scaled into its cell, pixelated, so an era's pixels show. Clicking
does the same writes as clicking that preset and then the era's button, including the era's pins, as ONE undo step
(Ctrl+Z puts the previous effect back), and closes the Wizard. A roll is named for what it is ("Ice hit", "Fire weather
2"), which is also its export name.

**Lock pixels** (AJ found it pinning sizes surprising): the Wizard never hides it. When the lock would change the nine
(a pinned size or crunch), a line above them says so ("Lock pixels is on, so these keep your 128 px frame and crunch, as
any effect you load would") with a "Turn Lock pixels off" button (the lock button's own click: it also forgets the
pins) that redraws them at their own sizes. On the era question, with the lock on, a line says an era also pins its size
and crunch for later effects, exactly as its Era style button does.

> **Superseded by §23.5** (2026-10-28: stills with a Play button each). Kept for the record.

**All nine play** (AJ: "If it's not too intensive we can just have them all playing"). Measured, WebKitGTK (the desktop
engine) at 1440 x 900, cold, Atmosphere + Fire (nine of 192 px, 328 frames): choosing 201 ms (10 ms warm), the nine
stills 21 ms, every frame rendered and playing 577 ms after opening; 48 MB of frames; with all nine playing the frame
interval held at 17.0 ms median, 18.0 ms p95, 20 ms worst, and redrawing all nine cost under 0.1 ms a frame. Firefox,
Explosion + Fire: 51 ms to choose, 50 ms of stills, 19 to 110 ms per effect's frames, 29 MB. So no play button: each
cell shows its still at once, then its frames render on their own idle tick (the first first) and it joins the Breed
grid's mini-player loop (`miniPlayers`, `tickMinis`); closing the Wizard drops them. Escape closes it (the app's one
Escape handler, through `#wizClose`), as does a click outside; it is a `.modal` with `role="dialog"`, `aria-modal` and
`aria-label="Wizard"`.

**Also:** `genomePixels` frees its test frames' backing stores at once (no pixels change; the Breed grid and the Foundry
use it too).

> **Superseded by §23.1's tests.**

**Tests** (the sync suite, 592): the header order with the Wizard first; the dialog's role and label; the tour; every
table names only real shapes, systems, palettes, categories and archetypes; every tag's palette is that tag's color;
thirteen telling presets carry their tag (Torch Flicker fire, Frost Nova ice … Coin Pickup cute) and Frost Nova is not
fire; an effect nobody listed is tagged by what it is; every tag on at least three presets, every type at least five;
**all 104 type × tag answers** give nine, all different, all real, at least four particles, at least seven of nine
carrying the tag, every preset of the type (about 4 s); in 8-bit every result draws in 8-bit; a roll regenerates from
its seed and draws, a Foundry roll uses its archetype's shapes, the seeded random is restored after a throw;
deterministic per seed and a re-roll differs; the questions' flow (types, mixed tags, eras, nine); each result drawn at
its real frame size; all nine playing; loop or once on each; a click closes, loads exactly the preset's state as one
undo step, and undoes; an era load equals the preset plus that Era button, values and pins; a pinned 96 px shows in the
results with the note, the note's button unlocks and redraws; Escape and Close. The suite's peak memory is 11.8 GB under
its 12 GB cap (it was 11.2 GB before this section; the 104-answer sweep is most of the rise).
Frame hash byte-identical (278 lines); desktop 55, web 12, async 69, plant 14, worker 38, Godot 14, cargo build.

**Open for AJ:** whether the strip's chips should gain these tags (§22 round 2: "an icy explosion" as two chips); whether
Status should share the Magic archetype (the Foundry has no status archetype); and whether a Foundry roll in a tag's
palette is the right answer when no preset fits (it is a roll plus a Palette press, nothing more).

### 23.1 Nine ORIGINAL effects, composed from the tags' ingredients (2026-10-13)

AJ, on §23: "This is great, however it's running into an issue we ran into with Tile, most of the suggestions are just
already made presets. We should have 9 original VFX from the wizard, with mixed and matched elements from tags chosen.
So a sci-fi ice spell should have radar boops and snow flakes." So no result is a preset or a plain roll any more: each
is a NEW effect put together by the composer (`wizardCompose`), from VFX's own shapes, layer systems, palettes and
params only. The questions, the cards, the era, Lock pixels, one undo step and Escape are as in §23.

**Ingredients (`WIZARD_INGREDIENTS`, one entry per tag):** particle shapes (the first three are the most telling and
take turns as the main particle), layer systems, palettes, a few knobs when the tag leads, and the word each part is
called by in a name.

| tag | particles | systems | palettes |
|---|---|---|---|
| fire | flame, smoke, spark, boom | Haze, Crackle, Shockwave | Fire, Ember |
| ice | snowflake, shard, diamond, hexagon | Growth, Shatter, Twinkle | Ice, Frost |
| lightning | bolt, spark, plus | Arc, Crackle, Chain | Electric |
| arcane | rune, star, spiral, pentagram | Sigil, Orbit, Vortex | Magic, Plasma |
| nature | leaf, flower, clover, sprout, butterfly | Growth, Swarm, Tumble | Nature |
| poison | bubble, blob, skull, puddle | Drip, Haze, Merge | Toxic |
| water | teardrop, bubble, splash, wave | Ripples, Droplets | Water |
| tech | reticle, pixel, gear, atom, cube | Particle rings ("radar"), Scanlines, Grid, Sweep, Glitch | Electric, Steel |
| dark | skull, ghost, smoke, eye | Rift, Attractor, Dissolve | Void, Blood |
| holy | sun, star, cross, wing | Light shafts, Flare, Twinkle | Holy, Gold |
| smoke | smoke, cloud, rock, specks | Haze, Decal | Smoke, Steel |
| cute | heart, star, candy, coin, note | Twinkle, Tumble | Candy, Gold, Rainbow |

A system arrives TUNED: its group's params are copied from one of the presets that use it (`wizardSystemDonors`), then
switched on through its own `LAYER_GROUPS` entry if the copy left it off.

**Skeletons (the type).** A result moves like one of its type's presets: the composer copies that preset's Emitter,
Motion, Life and Glow rows, duration, fps, opacity and scale, and only the structural layers the type is made of
(`WIZARD_SKELETON_KEEP`: an explosion keeps Flash, Shockwave, Burst, Sub-emitter, Trails, Ground; a hit Flash, Shockwave,
Impact, Lines, Slice, Smear…; a spell Flash, Shockwave, Sigil, Orbit, Attractor; a projectile Beam, Ribbon, Path trail,
Trails, Smear, Arc, Flash; atmosphere Weather, Haze, Light shafts, Droplets, Bokeh, Twinkle, Swarm; UI Lines, Twinkle,
Flash, Zoom blur, Kaleidoscope, Particle rings, Orbit; status Orbit, Aura, Sigil, Ripples, Attractor), with their
layerDelay. Its particle, colors, Layer B and every other layer are dropped. The page's donors are put in an order of
the seed's and each slot takes the next, so the nine move nine different ways. Status and atmosphere results are made
to loop (Seamless loop 0.7 / 0.8, emitting over the whole clip), so Playback's Auto loops them; the rest are one-shots.
This was the Foundry's job in the brief; the type's own presets give better-tuned motion than the six archetypes, and
two of the eight types (projectile, status) have no archetype at all.

**Mixing.** The chosen tags are rotated so a different one LEADS in each slot:
- the lead gives the MAIN particle (its three most telling, by turns), its palette (the Palette button's write) and its
  knobs. A particle under 14 px grows to 14-20 px (a snowflake at 8 px is a dot), with fewer of them so the coverage
  stays the skeleton's; at most 220 particles and glow 0.45 so bright shapes don't wash out to white;
- the next tag gives LAYER B: its particle (a different partner each time the lead particle comes round), moving with
  the main particles, in that tag's palette color. Alone, a tag gives Layer B another of its own particles;
- with two palettes, half the time the main particles also hand over from the lead's palette to the second's late in
  life (a color ramp with a hard step at 55%: a blended ramp between orange and blue passes through every hue);
- layer systems: one from the lead or the second tag (alternating), one from every further tag, at most three. A tag's
  most telling system (radar rings for tech, a sigil for arcane) comes every other time.
So every result carries every chosen tag. With no tag, each slot picks its own one or two.

> **Superseded by §23.2** for the readability bar (now coverage, sustain and spread at display size, with repairs), the
> names (no " 2") and the palette pick (turns, not random). Kept for the record.

**Every result must read:** test-rendered (`genomePixels`, the Breed grid's test, with a bar of 220 lit pixels where the
Breed grid's is 40) in the chosen era, and a composition that does not draw, or repeats one already on the page, is
composed again (up to eight attempts). Deterministic: a seeded generator (no Math.random), so the same answers and seed
give the same nine; "More like these" is the next seed.

**Names and parts:** a result is named from the parts it is made of ("Snowflake target spell", "Flame bolt explosion",
"Gear crystal spell"), and its card lists them: "reticle · snowflake · particle rings · Steel palette · Frost palette".

**Polish:** a result's picture is SQUARE beside its name and parts (no dark side bars; nine fit at 1440 x 900). A
one-shot holds its last LIT frame for half a second and skips its empty tail before playing again (`hold` and `end` on
the mini-player, ignored by the Breed grid's players), so no cell sits blank. Closing the Wizard frees the nine's frames.

**Measured** (WebKitGTK, 1440 x 900, cold, a tech + ice spell): composing the nine 111 ms, their stills 42 ms, all nine
playing 730 ms after opening, 316 frames (47 MB); with all nine playing the frame interval held at 17.0 ms median, 17.0 ms
p95, 18 ms worst. Still all playing; no play button.

**Removed with the presets-as-results:** the seeded Foundry and Randomize rolls, `rollRandomEffect` (randomize() is as it
was before §23), the archetype column of `WIZARD_TYPES`, and the preset ranking. The derived tags (`WIZARD_TAGS`,
`wizardTagsOf`) stay: the question cards use them for their pictures, and they are still tested.

**Tests.** The sync suite (593) checks one answer through (a tech + ice spell: nine compositions, none a preset, every
one carrying BOTH tags by its particle, Layer B or a layer, snowflakes and radar rings among them, nine different
skeletons and several particles, every one draws, named from its parts, deterministic, a re-roll differs), that status
results loop and hits don't, 8-bit results draw in 8-bit, the ingredient table names only real shapes, systems,
palettes and params, the dialog (one-shots hold their last lit frame), and everything §23 checked (load as one undo
step, era like the button, Lock pixels note, Escape). The SWEEP moved to the async suite (75), where it yields to the GC:
136 answers (every type with no tag and with each tag, three pairs and a triple per type, some in an era) give nine
each, none a preset, every one carrying an ingredient of every chosen tag (read from its params), pairwise different,
varied (two or more main particles, four or more particle pairs), every one drawing in its era (about 17 s). The sync
suite's peak memory is 11.4 GB (11.8 GB with the sweep; 11.2 GB before §23). Frame hash identical; desktop 55, web 12,
cargo build.

**For AJ:** the ingredient table is the place to tune taste (which particles say "ice", which system says "radar");
palettes like Electric (blue drifting to violet) and Steel (near-gray) set much of a result's mood, and may want a
Wizard-only color tweak if they read wrong; a few sparse skeletons (thin sparks that travel far) still make small
pictures under Fit.

### 23.2 Wizard tuning: every result reads, nine names, each tag's color shows (2026-10-13)

AJ on §23.1: "exactly what's expected", with three weak spots seen in the screenshots. None of this touches a preset or
the renderer: the frame hash is byte-identical (278 lines).

**Sparse results.** The old bar was `genomePixels` ≥ 220: lit pixels (alpha > 8) summed over three 40 px frames. A few
thin sparks that travel far pass it, and Fit then shrinks the whole picture into specks (worst in Fire + Lightning
explosions). The new bar measures a result as it is SEEN (`wizardMeasure`): rendered at 48 px (about its cell's scale,
Fit on, in the chosen era), five frames from 15% to 75% of its life, counting pixels that are opaque (alpha > 48) and
light enough to see on the dark cell (luminance × alpha ≥ 45: deep blue does not count). `WIZARD_READ`: mean coverage
≥ 5%, peak ≥ 7%, SUSTAINED (the 30/45/60% frames each ≥ 3.5%: not one early flash) and SPREAD (the peak frame's lit box
≥ 40% of the frame). A composition that misses is REPAIRED before it is thrown away (`wizardFatten`, up to twice): bigger
(size ×1.4, Layer B ×1.3) and more (count ×1.3) particles, full opacity, a shorter fade; for the compact types (hit,
explosion, pickup, spell, UI) or a result that does not spread, LESS TRAVEL (speed, gravity and Layer B's speed ×0.6,
more drag), so Fit stops shrinking it; a result that fades out early lives 30% longer. Then the next attempt (six, was
eight); the best scoring one is kept if none passes (the sweep checks that never happens). A one-shot's cell also ends
its loop on the last frame still showing a quarter of its fullest one (was: the last frame with a dozen pixels), so the
frame a cell rests on is never a lone ember; the exported effect keeps its whole tail.

**Names.** Two results with the same parts were "… spell" and "… spell 2". `wizardWords` now keeps the page's names in a
set and tries, in order: another pair of the result's own part words (the particles AND the systems: "Flame heat burst"),
then a synonym for the type (`WIZARD_NOUNS`: explosion, blast, burst, nova, detonation…; spell, cast, conjuring,
invocation…; trail, bolt, shot, streak…), rotating the noun every three slots so a page mixes them. A part word that is
the noun is skipped ("Ember blast blast"). The " 2" fallback in the grid is now a safety net that never fires.

**Color honesty.** Fire + Lightning read purple: Electric (blue to violet, additive, a white-hot core) drowned the warm
results. The same measurement keeps a 12-bin hue histogram (plus gray/white). With tags chosen and an era that keeps
colors, the LEAD tag's palette colors (`wizardPalBins`: the hues its palettes pass through; a pale palette is gray)
must be at least 30% of what is seen (`wizardTagShare`); the repair for a drowned lead is a cooler core (Hot core ≤
0.35), Layer B halved and quieter, no hand-over ramp. And palettes take TURNS instead of a random pick (a cute page was
eight Gold results of nine; now Candy, Gold and Rainbow rotate; the second tag's palettes rotate too). Variety: a particle
pair the page has not shown is preferred until there are four.

**Measured.** Composing the nine, WebKitGTK cold at 1440 × 900: tech + ice spell 87 ms (stills 40 ms, all nine playing
after 751 ms); fire + lightning explosion 150 ms (stills 51 ms, playing after 856 ms). Firefox 45–200 ms across ten
answers. Under the ~300 ms budget.

**Tests** (async suite, now 77): across the 136-answer sweep every result READS by the new bar in its era (it replaces
"every one draws"); every page has nine distinct names, none ending in a number; 28 warm + cool answers (fire with
lightning, ice, water, tech, arcane; cute + tech; holy + dark, over every type) show BOTH tags' palettes, each in at least
two of the nine at 30% or more. The sync suite's Wizard checks call `wizardDraws`, which is now this bar.
Screenshots: `tune-*.png` (fire + lightning explosion, sci-fi + ice spell, dark + smoke atmosphere, cute pickup).

**For AJ:** `WIZARD_READ` is the dial (raise `mean` for chunkier results, at the cost of more retries); a single tag with
few particles (lightning: bolt, spark, plus) gives names that sound alike ("Static spark trail", "Spark static bolt");
more `say` words or particles in its ingredient row would fix it.

### 23.5 Stills with a Play button (AJ, 2026-10-28: "VFX gets pretty chuggy during the wizard")

The nine no longer all render and play. Each result shows its still (one frame ~40% in, as before). A **Play**
button over the picture's lower-left corner (a sibling of the card's button: a button cannot hold one) renders
that effect's frames on first press, keeps them, and plays it from the start in the Breed grid's mini-player loop.
Only one plays at a time: another Play pauses it, and Play again pauses it too. Play never loads the effect; the card
still does. A one-shot still holds its last lit frame half a second before replaying.

- **Measured** (Firefox headless, explosion + fire): 40 ms of stills to open, 57 ms to start one playing. Before, all
  nine rendered behind it and looped together.
- **Tests:** regression.js's wizard rows now check that nothing renders until Play, that Play plays that one and loads
  nothing, one at a time, Play again pauses, a replay reuses its frames, and each one-shot's hold. ALL PASS (713).

### 23.6 Wind and Healing tags (AJ, 2026-10-28: "we're missing a Wind option"; "a blunt Healing category would be good")

Two more answers to "What's it made of?", each a WIZARD_TAGS row (what it looks like) and a WIZARD_INGREDIENTS row (what
it brings), and a new palette each (appended to PALETTES, so a mood button too):

- **Wind** (palette Wind: pale cool white-green). Strong: the tornado shape, and words (wind, gust, breeze, whirlwind,
  swirl, dash...). Ingredients: tornado, comma (wisp), spiral, feather, cloud; Vortex, Streaks, Trails; leading, it sets
  the Wind and Swirl motion. Carried by Tornado Spin, Leaf Swirl, Summon Swirl, Speed Dash, Dash Trail.
- **Healing** (palette Heal: bright green, a white core). Strong: words only (heal, cure, regen, restore, health, potion,
  revive...); a bright green with a hint (plus, heart, sprout, cross, Twinkle, Light shafts) also counts. Ingredients:
  plus, heart, star, sprout; Twinkle, Shockwave, Light shafts; leading, particles rise (gravity -120). Carried by Heal
  Rise, Heal Pulse, Heart Heal, Potion Brew. (Plus, Glow and Shockwave alone were too common: they tagged Sonar Ping.)
- **The composer** now tries six more times when none of a slot's six READS (Atmosphere + Water + Holy, newly sampled
  by the sweep, had one; it failed on HEAD too). A slot that drew something is unchanged.
- **Tests:** ALL PASS, regression 713 and async 77 (152 wizard answers: every type x every tag, pairs, triples, eras).

### 23.7 The Power dial, 1 to 9 (AJ, 2026-10-28: "a 'scale' option that would determine how brutal an effect would be... Dial all the way to 9 baby!")

A row of nine buttons over the results: 1 Tame, 2 Faint, 3 Light, 4 Modest, 5 As composed, 6 Strong, 7 Fierce,
8 Brutal, 9 Devastating. A press redraws the nine at that power (they are stills since §23.5, so it is quick). It
starts at 5 and Start over puts it back.

- **wizardPower(st, level, type)**, applied in wizardState, so a card's still, its Play and its Load are one effect.
  - **5 is the composition exactly.**
  - **Below 5:** fewer (count x0.5 at 1), slightly smaller, slower, a cooler core. The flash, shockwave, glow, bursts
    and ground mark fade (a tenth at 1). The particles keep their life: a tame effect is lighter, not gone in a blink.
  - **Above 5:** denser (x2.3 at 9), bigger, faster, longer, hotter, glowing.
  - **Burst types only** (hit, explosion, spell, projectile, pickup): a flash from 7, a shockwave and rays from 8, bursts
    within the burst and a ground mark at 9. Weather, auras and UI cues power up by density alone, so no flash on rain.
  - **No bigger frame:** the Wizard fits every effect to its frame, so a bigger one only drew it smaller.
- **Every card reads** (wizardPowered, cached per result and level). A level that falls under the §23.2 bar gets the
  composer's own nudge (wizardFatten), up to three times. If that is still not enough, it steps one level toward 5 at a
  time; 5 always reads. A few healing compositions at the ends of the dial need it.
- **Measured** (Firefox headless): 20-80 ms a level. 3240 results (every type x five tag mixes x 1..9) all read.
  Explosion + fire, mean particles a result at 1 / 3 / 5 / 7 / 9: 70 / 94 / 128 / 194 / 294.
- **Tests:**
  - regression.js, 8 rows: the dial; 5 exact; denser, hotter and flashier up the dial; bursts at 9; weather never
    flashes; pressing 9 redraws; a load is the powered effect; both ends read.
  - regression-async: the 3240 sweep.
  - ALL PASS: regression 721, async 78.
- **Next** (AJ's other half): a motion question, "How does it move?" (splattering, spinning, cracking, rising, dripping,
  shattering, pulsing, swirling), from parts VFX has.

## 24. The layout pass, round 2: folding panels, rows that hide, panels in order, grouped layer chips, tag chips (2026-10-13)

The follow-up §22 proposed, AJ approved the direction. Presentation only: no control removed or renamed, the frame hash is
byte-identical, `--css-build` 6. No new runtime file and no new storage key.

1. **Every panel folds.** Each parameter panel's heading is a fold, as the four hero sections were (`makeCollapsible`, now
   with `role="button"`, `tabindex`, `aria-expanded`, Enter/Space). It is remembered per person in the SAME key the heroes
   used, `crunchyvfx.collapsed.v1` (a map section → folded; a panel is `p:<group>`), so the key keeps its shape and the
   desktop suite's pinned set of keys is unchanged. First time: everything open except Master and Crunch (`PANEL_FOLDED`:
   set-once, and Crunch carries the palette lock). The tutorial's Layer B steps open that panel if it is folded.
2. **Rows that do nothing are hidden** (Tile's PARAM_WHEN): ONE table, `PARAM_WHEN`, key → when it applies, each a fact
   about vfx.js: `turbScale`/`turbSpeed`/`turbCurl` when Turbulence > 0; `spinVar` when Spin ≠ 0; `emitAngle`/`emitSpread`
   only for the aimed emitters (cone, line, box: `emitPlace`), `emitRadius` for every emitter but the cone, and the same
   three for Layer B's emitter; `originX`/`originY` while Fit is off; `echoDecay` when Echo > 0; `dither` when Color steps
   < 32 or a palette is locked; `outlineTone` when Outline > 0; `imgLoops`/`imgStagger` when the sprite has more than one
   cell. A hidden row keeps its value (state is untouched: it renders, saves and rides in share links as before). Every
   governed row sits BELOW the row that governs it, so nothing moves under the pointer during a drag. The stage's Fit hint
   became a one-line note in the Emitter panel, where Origin X/Y disappear. Considered and left out: hiding Hue/Hue
   shift/Saturation under a color ramp (Silhouette, Rim light, Bubble and the glints still read them).
3. **Panel order.** Output (Duration), Master and Crunch head the panels, right after the heroes; then Emitter, Motion,
   Life, Color and the selected shapes' panels; then "Add a layer"; then the layers that are on. The panels flow in
   columns (`.panel-flow`, two blocks around the layer bar; `columns: 260px`, inline-block panels) instead of a grid,
   because a folded panel left a row-high hole beside a tall one. (One `column-span: all` version painted a ghost panel
   in WebKitGTK; two blocks avoid it.)
4. **"Add a layer", grouped.** `LAYER_ABOUT` gives each of the 58 layers a kind and one line: Light (10), Particles (10),
   Motion (6), Shapes & lines (22), Post & stylize (10) (`LAYER_KINDS`). Within a kind the LAYER_GROUPS order holds. The
   line is the chip's tooltip and shows under the chips while a chip is hovered or focused; a filter matches names, lines
   and kinds. The chip text is unchanged ("＋ Growth").
5. **Tags on the effect strip.** A Categories | Tags switch picks which chips show; the tag chips are the Wizard's own
   `WIZARD_TAGS`, derived per preset by `wizardTagsOf` (one source of truth, cached per preset), counted under the search,
   the category and the tags already on; several tags narrow to effects carrying all of them, and a tag holds with a
   category (Explosions + Fire). The switch shows how many filters of each kind are on ("Tags · 1"), so a filter in the
   other row is never a hidden surprise. Not remembered (no new key, as §22 decided for the chips).
6. **Lock pixels says what it holds:** "Lock pixels (64 px)", "(64 px + crunch)", "(crunch)" (`lockSummary`); it said
   "(1)" before.

**Tests** (sync suite 619, was 593): every panel folds (81) with the right first-time state, a click folds and is
remembered, Enter reopens, a layer heading folds; each PARAM_WHEN rule both ways (14 cases, all 17 keys), Origin X/Y with
Fit and the note, a hidden row's value in a share link; the panel order and where the layer bar sits; LAYER_ABOUT covers
LAYER_GROUPS exactly, chips grouped in a stable order, tooltip and hover line, the filter; tag chips are the Wizard's,
narrow to exactly the tagged effects, hold with a category, count, survive the switch, clear; the lock label's four
states. The suite's peak memory is 11.5 GB under its 12 GB cap (11.4 before). Frame hash identical (278); async 77,
desktop 55, web 12, plant 14, worker 38, Godot 14, pull-core --check, the pre-commit hook, cargo build.
Screenshots (WebKitGTK): `r2-1366-top.png` (tag chips), `r2-1366-panels.png`, `r2-1366-layers.png`, `r2-1920-*.png`,
`r2-tall-1366.png`.

**For AJ:** Motion starts open (it is long; fold it once and it stays folded); the tag chips' counts combine with tags
already on, so after one tag most others read 0 (AND, not OR); and whether My Effects should become a strip mode
(round 2's last proposal) is still open.

## 25. The first-time-user round: search words, the Variations pack's metadata, Fit on a size change (2026-10-15)

A usability test (a first-time Godot 4 action-RPG hobbyist; verdict "yes", the Wizard the high point) found twelve
things. What changed, in the report's order of priority:

1. **Search finds what people type.** "fireball", "spell", "flame", "burn" found nothing: search matched names and
   categories only, and the fireball-like effect is called Meteor Hit. Every word of a query must now hit by the name or
   category (a STRONG hit), by `SEARCH_ALIASES` (a game developer's word naming presets outright, strong, and/or tags,
   Wizard types and categories, related), or, failing an alias, by the Wizard's own vocabularies (a `WIZARD_TAGS` tag's
   key, name or `words`; a `WIZARD_TYPES` type's `words` or `noun`), so a new preset is found by what it looks like with
   no list to update. Prefix from three letters, a plural "s" dropped. Strong hits lead the strip under a "Best matches"
   divider, ordered names first and then as the alias lists them ("fireball" opens on Meteor Hit); related hits follow
   by category. The chip counts use the same test (`presetQueryHit`).
2. **The Variations "Export pack" is the Export dialog's output, once per variation** (`variationFiles`): it calls
   `buildExportFiles` with each variation's own context, so format, layout, metadata (a Godot SpriteFrames `.tres`),
   trim, sizes and Playback all hold. It used to write its own sheet + generic JSON whatever was chosen. The pack leaves
   the editor's sound out (it belongs to the editor, not a variation). **Proved in real Godot**: `tests/godot-check.mjs`
   now presses Export pack with Godot chosen (3 variations of Critical Hit, Play once), unzips what the button
   downloaded, and Godot 4.7.2 loads every `.tres` as a SpriteFrames with its frames, a frame size and loop off.
3. **A size change scales.** With Fit off an effect keeps its own pixel size, so 192 → 64 px cropped it. Choosing a size
   (or W/H) with Fit off now turns Fit on and says so, as its own undo step (`fitForSizeChange`). The Fit button says
   its state ("Fit: on" / "Fit: off", `aria-pressed`); the pale fill alone was missed, and the tester's "the Wizard turned
   Fit off" was, as far as we can reproduce, a click on a Fit that already looked off (the Wizard never wrote Fit). The
   tooltip lost its audio metaphor. Wizard results are now drawn fitted and load fitted (they clipped their frames with
   Fit off), saying so when that turned Fit back on.
4. **A filter the shown chip row cannot show stays in sight**: a tag chosen under Tags is a pill ("Fire ×") at the head
   of the Categories row, a category under Categories one at the head of the Tags row; one click drops it, and the counts
   are the whole set again.
5. **The palette lock has a visible home**: "Game palette" in the toolbar and "Match my game's colors…" under the
   Palette swatches open Crunch, bring the lock into view and put the cursor in its paste box (`showPaletteLock`).
6. **Prep for GIF says what it will change before it changes it** (`gifPrepPlan`: "FPS 15 → 10 (27 → 18 frames, same
   length in time)"), says what it changed, and is disabled when there is nothing to do. It still edits the effect (one
   undo step): a copy would have left the GIF and the effect disagreeing.
7. **A tall dialog scrolls its middle, never its buttons**: head and foot keep their height (the Export button is in view
   at 1366×682), and a successful export says "Saved <file>" in green, naming the zip's `.crunchy` sidecar.
8. **Hit Spark redrawn to read** (less speed, more drag, fatter sparks, a bigger flash; a MEANT frame-hash change, Hit
   Spark and the batch only), and "spark"/"hit" searches offer Critical Hit beside it.
9. **Heat is intensity, not temperature**: its ends are "dim" … "white-hot" and its row says so on hover (an ice spell
   can have a white-hot core; Hue is the color). Wizard clipping: item 3.
10. **The Variations name is the loaded effect's** export name, and the dialog says which files the pack will write.
11. **A locked palette with soft edges says so in one line and offers "Hard edges (Alpha cut 0.5)"**, never applied
   unasked (it changes the look).
12. Low: tour titles lost their numbers (the counter counts; Tile and UI did the same); zip entries carry a real DOS date
   (the export's own time; zero read as 1980-00-00, unzipped as 2114); the Unity note shows only for generic or no
   metadata; the frame counter is one-based of the real count and says "paused"; Wizard names never repeat two words in
   another order on a page; a tag card's picture is in the tag's colors (Smoke and dust showed a green poison cloud);
   Breed/Variations/Foundry cells say "Load" and "Keep", and loading one says so; Match a sound says what it needs and
   links CrunchySFX (the suite's own link, opened outside the desktop app); the first screen opens on one of
   `LAUNCH_EFFECTS` (strong ones), not any of 189; the loaded effect's strip card is a dark cell with a white label.

Not done: the Foundry's near-identical "Explosion" candidates (listed low in the report, not in this round's brief).
`--css-build` 7.

## 26. The ready Godot scene: every Godot export is drop-in (2026-10-15)

**Why.** AJ (2026-10-15), deciding what §18 parked: "do it, and make it the drop-in way to use an effect". Before, the web
gave a SpriteFrames `.tres` only and only the planted Library wrote §19's `.tscn` + `.gd`, which waited for play().

**What.** Every Godot export (the Export dialog with Godot chosen, a pipeline's folder, the batch and Variations packs,
Drag out, and the planted save) ships beside the sheet and its `.tres`: `<base>.tscn` and `<base>.gd`, from ONE
implementation (`godotSceneInfo` → `godotSceneFiles`, wrapped by `buildExportBundle`). The planted Library's `exportFor`
calls `buildExportBundle` too and adds only what it knows: the linked CrunchySFX WAV (res://, or left out when gone) and
the Impact frame. `buildExportFiles` stays the sheet + metadata, so the frame hash's EXPORT lines are what they were.
- **The scene:** a Node2D (texture filter Nearest) with an AnimatedSprite2D (the SpriteFrames; at several sizes the @1x
  one), offset so the NODE'S POSITION IS THE EMITTER (renderPrep's own transform; the frame center for most effects,
  Fit or not, trimmed or not: the AtlasTexture margin keeps the frame), and an AudioStreamPlayer2D when there is a sound
  (the export's own `<base>.wav`: the web's "Match a sound" with "Also export the sound"; the planted link). Written as
  Godot 4.7.2 writes it: `[gd_scene format=3]`, no load_steps, no uid, relative paths.
- **The script** (the same for every effect): `signal impact`, `signal finished`; `@export autoplay := true` (it starts
  one step after _ready, call_deferred, so a signal connected right after add_child is heard), `free_when_done := true`,
  `impact_frame`, `sound_frame`; `play()` (from frame 0, again if playing), `stop()`, `is_playing()`. Every frame passed
  is visited, so a slow game frame never skips the impact. A one-shot: `impact` once, `finished`, queue_free. A loop:
  `impact` every time round, never `finished`, never freed.
- **The impact frame:** the Impact frame set (desktop's Sound panel), else `impactFrameOf`: the frame with the most light
  (alpha × brightness summed over every other pixel; the first wins a tie), the flash or the fireball at its fullest.
  The sound keeps its own `sound_frame` (the Impact frame if set, else 0, where the preview starts it), so nothing that
  sounded right before moves. Both are clamped to the last frame.
- **README.txt** (the export zip's root; one at a pack's root; each planted effect's folder; NOT in a pipeline's folder
  or the batch written to a folder, which are the game's own and may hold a README): the one-line spawn
  `var fx = preload("res://hit_spark.tscn").instantiate(); fx.position = pos; add_child(fx)`, the signals, the options.
- **The Export dialog** lists "Godot 4: ready scene (.tscn) + SpriteFrames" first (Generic JSON stays the default
  selection) and says: "Godot 4: a ready scene. Instance the .tscn and it plays, signals its hit frame (impact on frame N,
  counting from 0) and frees itself when done", or for a loop "…plays and loops, signaling impact on frame N every time
  round, until you call stop() or free it", with the spawn line.

**Planted effects saved before** show "update available" (their `.gd`/`.tscn` differ); Re-export / Update all gives them
the ready scene. A planted scene already placed in a level now plays when the level loads (untick `autoplay`).

**Proved.** `tests/godot-scene.mjs` (31 checks): the WEB build exports a one-shot with a sound, a one-shot at two sizes and
a loop through the Export button; Godot 4.7.2 imports them with no error and, spawned the README's way with the signals
connected after add_child: each plays by itself; Boom (19 frames at 24 fps) `impact` once on frame 4 at tick 10 of 60 fps
(expected 10), sound on frame 0, `finished` once, freed at tick 49; Spark (7 at 30) impact on frame 1 at tick 3, freed at
tick 16; Rain (26 at 24) 3 cycles, `impact` 3 times on frame 24, never finished, alive, stop() stops it; with autoplay
unticked nothing plays until play(). `tests/godot-check.mjs` 19 (the planted scenes: the §19 play()-and-keep way, and
left to themselves they free themselves; no Godot error). Frame hash 276 IDENTICAL (its BATCH lines leave out the new
`.gd`/`.tscn`/README.txt as they leave out `.crunchy`); regression 647, async 77, desktop 55, web 12, plant 14, worker
38, cargo.

## 27. Moments: the presets by what a game needs, and a quality pass at game scale (2026-10-15)

**Why** (AJ agreed): a game developer thinks in moments ("I need a hit spark, a death puff, a pickup sparkle"), not in
techniques. And the docs kept finding presets "nearly invisible" at game size, Fit shrinking fast effects into specks, the
§25 tester's "Hit Spark didn't read", and twelve presets of no Wizard type while "projectile" had no category at all.

**The Moments view is the strip's default.** The switch is now Moments | Techniques | Tags (Techniques is the old
Categories row, unchanged; Tags as §24). `PRESET_MOMENTS` (presets.js) is the sixteen moments in order: Hit, Crit, Death,
Spawn / Appear, Pickup, Heal, Power-up / Level up, Dash, Jump / Land, Projectile, Muzzle / Cast, Explosion, Shield / Block,
Status, Environment / Ambient, UI / Emote; each with a line, its `words` and a `lead` (the effects shown first). Membership
is DATA ON THE PRESET: a `moments: [...]` field, appended to each preset that serves one (a preset may serve several; its
first is where it sits on the All page). `moments` is not a param: `presetOutcome` copies only keys that are in `state`,
so loading, share links, saved effects and every export are untouched, and the frame hash proves it (every preset given
only a `moments` field hashes byte-identical). The All page shows every effect once, by moment, then "Other effects"
(the 74 that serve no moment: techniques, scenes, showpieces), so nothing left the person's reach. A chosen moment holds
in the other two rows as a pill (§25's rule), the switch counts it ("Moments · 1"), and the chip counts follow the search,
category and tags. Search: a moment's key, name words and `words` reach every effect of it as a STRONG hit (alias or not:
"death", "pickup", "heal", "projectile", "landing", "block"…), ranked in the moment's own order, so "death" opens on Death
Poof; aliases gained the new presets. `--css-build` 8 (one rule: a hidden mode button hides).

**Moments → the Wizard's types** (`WIZARD_TYPES[].moments`, read by `wizardPresetIs`): hit ← hit, crit; explosion ←
explosion; pickup ← pickup, power-up; spell ← muzzle/cast, spawn, heal; status ← status, shield; projectile ← projectile,
dash; atmosphere ← ambient; UI ← UI. Death and Jump / Land map to no type. Projectile now has real donors (the four loops).

**New presets (11, APPENDED; nothing inserted or reordered):** four PROJECTILE BODIES made to loop (Seamless loop 0.8, a
Layer B core that lives the whole clip so the head is there from frame 0, the trail streaming left from a fixed point: the
game moves the node): Fireball, Energy Bolt, Arrow Trail, Frost Shot (a new "Projectiles" technique category); Death Poof
(a white smoke ring and a rising skull), Soul Rise (a ghost and wisps), Crit Burst (a big starburst, impact lines and
crosses), Dash Trail (speed streaks and dust), Jump Dust (puffs thrown out at the feet), Heal Pulse (green crosses rising
over a ring), Burning (a looping status flame). Every moment has at least four effects.

**The quality pass.** Every preset in a moment was rendered at 64 and 96 px (a 16-32 px character's frame) and LOOKED at as
frames over time (`moments-sheet.png` in the round's scratch). Improved, names kept (a MEANT frame-hash change):

| preset | wrong | done |
|---|---|---|
| Hit Spark | thin 1-px lines at 64 px; read late | one big starburst, whole on frame 0, shrinking out in five frames; ten short fat sparks as Layer B |
| Critical Hit | sparse crosses | fatter crosses, less travel, impact lines, a bigger flash |
| Muzzle Flash | a speck at the frame's edge (Fit fitted the forward sparks only) | slower, fatter sparks, a bigger flash, a small backward glow (Layer B) so Fit centers it |
| Blood Splat | specks (fast, far, tiny) | fewer, twice the size, less speed and gravity |
| Coin Pickup | tiny stars | bigger stars, less travel, brighter flash |
| Heal Rise, Level Up, Twinkle, Teleport Out, Hit Flash | small particles | bigger particles, less spread or speed |
| Speed Dash | a speck (smeared dots) | long horizontal streaks from a box emitter, no smear |
| Disintegrate | 4-px specks | 9-px grains; shorter (0.85 s) with a dissolve that leaves no dead tail |
| Pixel Burst | flew out of a 7-frame clip | half the speed, bigger pixels |
| Shockwave | a hairline ring | thicker ring |
| Magic Bolt, Comet Trail, Comet Path | thin at 64 px | wider beam / bigger heads, less travel |
| Sweat Drop | fell out of the frame, so Fit shrank it | half the gravity |
| Shield Orbit | small bodies | bigger bodies |

**Left out of the Moments view** (kept in their technique category, reachable as before): Rain (1-px drops: 0.5% of a
64 px frame; Downpour is the rain there), Fireflies, Leaf Fall, Steam, Ash Fall, Dust Motes, Heat Shimmer, Glint Field, Water
Splash, Water Ripple (too faint at game scale); Summon Circle, Comet Arc, Spirit Aura, Static Charge, Cursed Halo, Laser,
Chain Lightning, Neon Streaks, Spark Shower, Triple Tap, Warp Speed, Sonic Pulse, Meteor Hit (thin lines or a mostly empty
clip at 64 px; each moment has stronger ones). The rest of the 74 are techniques and scenes, not moments.

**Tests** (sync suite 666): the sixteen moments in order with names, lines and words; every `moments` value known, once
each; every moment ≥ 3 effects; leads belong and come first; `moments` never reaches `state`; every effect in a moment
READS at 64 px (lit = alpha > 48 and light enough on a dark game, over all frames: mean ≥ 1.8%, peak ≥ 2.4%; the old
Muzzle Flash was 0.7% / 1.7%); the projectile loops loop and the Wizard's projectile type takes them; the switch, a chip
per moment, each chip exactly its moment in order, a chosen moment lit and counted, a pill under Techniques that one click
drops; sixteen moment words find their moment as strong hits with the lead on the first page, "death" opens on Death Poof;
every preset exactly once on both All pages. Existing tests moved to the Techniques view where they test categories;
"fireball" now opens on the Fireball preset, then Meteor Hit; the invisible-genome check starts from Explosion (it used the
random launch effect, and a launch effect with a layer draws at opacity 0). Frame hash: 246 of 275 old lines identical;
the 29 that moved are exactly the 19 presets above (their frames, their three export cases, the sound case on Hit Spark)
and the Everything batch zip; 17 new lines for the new presets (293 in all). Async 77, desktop 55, web 12, worker 38,
plant 14, Godot 17, pull-core --check, the pre-commit hook, cargo build.

**For AJ:** the moment table (membership, leads, words) is taste and cheap to retune; Hit Flash, Punch In and Hit Blank
are close cousins (all kept: different colors); a projectile loop's seam is the engine's Seamless loop (the head is solid,
the trail's first frames are a half-strength blend); the Foundry's look-alike Explosion candidates (§25's open item) are
untouched by this round.

## 28. The Icon particle: the suite's shared icons as particles (2026-10-15)

**Why** (AJ: "UI has a massive set of icons … sharing through crunchyCore … usable as the particles here"): hearts on a
heal, coins and gems on a pickup, a skull on a death, a warning sign, a talk bubble, a button prompt. CrunchyUI's icon
DRAWINGS moved into crunchyCore as `glyphs.js` (GLYPHS_BUILD 1, core 6115463); VFX now takes it as a core file and
draws any of them as a particle.

**glyphs.js is a core file** (tools/core-files.json, `node tools/pull-core.mjs`; GENERATED here, never edited), loaded
before shapes.js, with a `want: 1` stamp row and a line in Feedback's Files detail, `FRONTEND` in build.rs (19), the
desktop-build.yml copy line, and the subresource prose in worker.js (seventeen), DEPLOY.md and .assetsignore (fifteen
scripts). Pure; no DOM.

**One appended shape, `icon` (97)**, in SHAPE_CATS' Symbol row and RANDOM_SHAPES. WHICH icon is the PATCH_EXTRAS string
`icon` (a glyph NAME, default "heart"; a name rather than the core's index because a share link should read as what it
draws, and the core never reuses a name). An unknown name draws the default. Only the icon shape reads it, so the
default moves nothing. **One PARAMS row**, `iconFill` ("Fill holes", group Icon, 0..1, default 0 = off): the icon's HOLES
(the empty pixels the outside cannot reach: a skull's eyes, a coin's band, the ! of a warning sign) filled in a darker
tone of the particle's own color (lightness x (1 - 0.8 x fill)), the two-tone read of a game pickup. 0 leaves them
see-through, as CrunchyUI's bare glyph is.

**Pixel-exact at the particle's size.** Every other shape draws a 64 px master that vfx.js scales per particle; a 12 px
heart scaled from 64 is a smudge. A shape record may now say `sized: true`: drawFrame asks for its sprite AT
round(particle size) px (`getSprite(..., px)`, the size appended to the cache key only then) and blits it with smoothing
off on whole pixels (a rotated one turns nearest-neighbor). The icon's draw is `glyphMask(name, n)` straight into the
sprite, so the particle is, pixel for pixel, the icon CrunchyUI draws at that size (tested at 9-40 px). Masks are cached
by name and size (`iconMaskCache`, with their holes). The tint pass is unchanged (one flat tone from the effect's color,
ramp or palette, like every shape); a record may also say `after(g, R, st, hue, sat, lum)`, run over the tinted sprite
(the filled holes). Every other shape takes exactly the old path: the frame hash proves it.

**What is offered:** `iconOffered()` = every core glyph except `ported` (the 45 that were VFX's own shapes, already in
the shape picker under their own names) and `hidden` (duplicates, drawings that do not read): 193 icons. Some share a
name with a VFX shape (heart, star, coin, skull, crown …); they are CrunchyUI's drawings, so an effect can match a game's
UI kit, and they stay. **The Icon panel** (generated from its row; shown while either layer draws the icon, PANEL_SHAPES)
leads with a picture picker in Secondary's look (b-shape classes, no new CSS: a filter, a scrolling grid of 24 px
glyphMask pictures from an idle queue, the chosen one lit), ordered shapes, then marks, then input legends; the filter
matches the name, its group and a few game words (`ICON_WORDS`: "death" finds skull, "money" coin, "!" warn). Randomize:
when it rolls the icon shape it draws from `ICON_PICKS` (twenty game icons, not the file/menu marks). The Wizard is
untouched (its ingredients name VFX shapes; there is no icon hook to append to).

**Presets (8, APPENDED; judged at 64 and 96 px on a game-green ground, frames over time).** Every icon upright and still
(angleVar 0, no spin: a tilted icon reads as a mistake). Main's lightness falls toward 0.5 as its hot core cools, so where
an icon must stay WHITE it is Layer B, whose brightness holds.

| preset | moment | what |
|---|---|---|
| Heart Heal | heal | pink hearts rising over a ring (normal blend: additive overlaps went white) |
| Coin Burst | pickup | gold coins thrown up and falling, Fill holes 0.55 (bare, the coin read as a ring) |
| Gem Pickup | pickup | one cut gem rising, sparkle stars round it |
| Skull Puff | death | a white skull (Layer B, Fill holes 0.9) rising out of a violet smoke puff |
| Alert Pop | ui | a red-orange warning sign popping up, outlined |
| Talk Bubble | ui | a white speech bubble (Layer B) with pop lines |
| Prompt Pop | ui | a button prompt: a green ring (Main) with the A legend (Layer B), a shockwave |
| Trophy Win | powerup | a gold trophy with sparkles |

Fixed while judging: the coin bare (a ring: Fill holes), the skull at a random start angle (upside down), the bubble and
the button letter on Main (they grayed: moved to Layer B), the trophy small at 64 (sparkles flew far, Fit shrank it).
Not made: "?" and "!" alone and a music note (the core has no bare ! or ? glyph; the note is VFX's own, `ported`, and
Music Notes exists). Categories: Heart Heal → Magic; Coin Burst, Gem Pickup, Trophy Win → Pickups & Charm; Skull Puff →
Impacts; Alert Pop, Talk Bubble, Prompt Pop → Emotes.

**A fix found on the way: old project files would not open.** `restoreEdit` wrote `snap[key]` for every PARAMS row and
PATCH_EXTRA, so a `.crunchyvfx` saved before a row existed put `undefined` into state and the open threw ("val is
undefined"; the desktop suite's legacy/a-head-crunchyvfx-file-opens-as-it-did). The uncommitted crescentTaper row had
already tripped it; iconFill and icon would have too. A missing key now takes its default (neutral by rule); undo history
always carries every key, so nothing else moves.

**Not taken: items.js** (the CrunchyItems engine). Its items are full-color shaded icons (three materials x six tones,
outlines, enchant motes), so as particles they would bypass hue, ramps and palettes (the `ownColour` escape hatch the
glyph and image shapes use), at 8,000 lines loaded on every page. The glyphs already carry the item SILHOUETTES (sword,
potion, coin, chest, gem, shield …) that a particle needs. Worth revisiting as an "Item" shape with a tint slider if AJ
wants loot drops in their real colors.

**Tests.** Sync suite 683 (+17): icon appended and glyphs.js loaded; in SHAPE_CATS and RANDOM_SHAPES; the offer excludes
ported and hidden; an unknown name falls back; pixel-exact sprites at 9/13/16/24/40 px (hard alpha, = glyphMask); Fill
holes 0 see-through, 1 dark; the panel hides and shows with the shape, a picture per icon, the preset's icon lit, the
filter's game words, a click chooses and redraws, the icon rides a share link and only when not the default; a snapshot
missing a newer key restores at its default; the Icon presets upright. The extras check sets `icon`, and the picture check
drains the Icon queue. Frame hash: every old line identical except the Everything batch zip (it holds every preset); 11
new FRAME lines and one EXPORT line (306 in all). tests/godot-scene.mjs exports a fourth effect, Heart Heal, and plays it
in real Godot (40 checks). Async 77, desktop 55, web 12, worker 38, plant 14, Godot 19, pull-core --check --strict, the
pre-commit hook, cargo build.

**For AJ:** whether same-named icons (heart, star, coin, skull …) should stay beside VFX's own shapes (kept: they are the
UI kit's drawings); a bare "!" and "?" would be worth adding to the core (GLYPH_LATE) for emote pops; the glyph KNOBS
(star points, arrow direction, dice face, cog teeth) are not exposed, every icon draws at its defaults; the Wizard does
not use icons yet; items.js as particles (above).

---

## 29. The search-engine pass: words a crawler can read (2026-10-16)

**Why.** The suite's sites were not being found on DuckDuckGo or Bing: a crawler saw a logo-only `<h1>`, button labels and
no sitemap, and the suite's cross-links lived only inside the JS suite dialog. The same pass in all five apps (CrunchyTile
§143 is the reference). A first cut put an About section and the suite footer under the app; AJ: "that scroll is pretty
ugly", so the words moved to their own page the same day.

**What.**
- **index.html (the app, its layout untouched):** `<title>` "CrunchyVFX: free CC0 pixel-art sprite VFX generator for games";
  one meta description (free, CC0, no generative AI) shared word for word by og:/twitter:; a `SoftwareApplication`
  JSON-LD before the stylesheets (one price-0 web offer, operatingSystem "Web" only while suite.js has no VFX store page,
  author superevil6, NO `license`: CC0 covers the OUTPUT, not the code); one `<a href="about.html" data-web>` at the end of
  the license footer's tool notice. `isDesktop` hides `[data-web]`. styles.css is unchanged.
- **about.html (web only, served at /about, canonical `https://crunchyvfx.com/about`):** a static page (no script but the
  FAQPage JSON-LD), `crunchy-base.css` plus a small inline style in the tokens with VFX's violet accent. "Open CrunchyVFX"
  back to the app, h1 "Free CC0 pixel-art sprite VFX generator", four paragraphs, "Things you can make", five questions
  (the FAQPage JSON-LD is them word for word) and `<footer class="suitelinks">`: exactly suite.js's other web links and
  every published desktop page. NOT in src-tauri/build.rs or the desktop CI copy list.
- **Files:** `robots.txt`, `sitemap.xml` (`/` and `/about`; bump `lastmod` when a page changes), the IndexNow key
  `44b30b0415e1540c853a5d3826a59855.txt`, `tools/indexnow.mjs` (run by hand after a deploy; the only file that touches
  the network, never published). The Worker serves them as plain unversioned assets (`no-cache`).
- **Tests:** `tests/seo.test.mjs` is the suite's generic checker, byte-identical in every app (never edit it here); VFX has
  no wiring test, so `tests/worker.test.mjs` spawns it, and also runs a request for `/about` through the Worker over a
  mocked ASSETS (47 assertions, was 38). Web suite row `seo/the-about-link-is-on-the-web-and-the-app-page-keeps-its-layout`,
  desktop row `gate/no-website-about-link`. Presentation only: frame hash unchanged.

---

## 30. The 1.0.0 release machinery (2026-10-16)

**Why.** The first desktop release, ported from what CrunchySFX (three releases) and CrunchyTile (1.0.0) already had,
with both of their latest lessons: Tile's Windows build failed because a CRLF checkout changed every crunchyCore copy's
bytes, and SFX 1.2.1 dropped the AppImage (its bundled GStreamer had no sound on rolling distros) and taught the audio
context to sleep when idle.

**What.**
- **Version 1.0.0 in five places:** tauri.conf.json, Cargo.toml (+ Cargo.lock), `APP_VERSION`, the Flatpak metainfo's
  newest `<release>`, `version.json`. `tests/build.py` (the version check every test run and CI go through) now checks
  all five; `tests/worker.test.mjs` too, and that `.assetsignore` publishes version.json (56 assertions, was 47).
- **`scripts/release.sh`** (SFX's): pre-flight (main, clean tree, the tag new locally and on origin), the checks
  (build.py, worker/plant tests, `pull-core --check --strict`, `pull-synth --check`, `cargo check`; a real run adds the
  web/desktop/hash Firefox suites and the Godot checks), the bump, a confirm, commit, push main, tag, push the tag.
  `--dry` applies the bump to scratch copies and prints the diff: it never writes the repo (SFX's reverted with git
  checkout, which would also discard uncommitted work). Asked for the version the files already carry, it bumps
  nothing and only tags (the first release). `scripts/` is in `.assetsignore`.
- **The workflow** is Tile's shape: no frontend copy step (build.rs fills `dist/`; CI only `mkdir -p dist`, since Tauri
  checks frontendDist before build.rs runs), a wiring step (build.py; `pull-core --check`, where exit 3 = intact but no
  crunchyCore beside the checkout), no AppImage anywhere, the Flatpak built from the .deb and pushed with the .exe.
  `.gitattributes`: `* text=auto eol=lf`.
- **The update check** (SFX's notifier, desktop only): on launch (2 s later; never on `file://`, so the test pages never
  touch the network) it reads `https://crunchyvfx.com/version.json` (worker.js already served it with CORS + no-cache)
  and, when this build is behind, shows a banner linking the itch page (`info.url`, accepted only on sevi66.itch.io).
  Settings gains "Check for updates on launch" (`crunchyvfx.checkUpdates.v1`, on unless "0") and "Check now". It never
  downloads anything. It is in 1.0.0 because a shipped binary can never gain it later.
- **Audio (SFX 1.2.1's lesson):** `playSound` wakes the context through `ensureAudio` (it used to assume a running one,
  so a context the OS suspended stayed silent until Pause/Play), starts the clip only once `resume()` has resolved
  (shifted by the wait, so it stays in step with the picture), and arms an idle suspend 3 s after the clip ends; a
  closed context is replaced. VFX never showed a "sound is blocked" warning, so there was nothing to reword. Sync
  suite rows `audio: …` and `update check: …`.


## 31. American spelling, everywhere a person reads (2026-10-18)

AJ: "no British spelling … wipe it out everywhere in all apps" (the suite rule). Labels (Center, Materialize, Color
over lifetime), tooltips, hints, the layer kinds and blurbs (Post & stylize), the preset category Symmetry & Stylize,
the tour, About, the flatpak metainfo, this document and the code comments now say color, gray, center, behavior,
license, -ize and so on. Frames and export bytes did not move (`frame-hash.expected.txt` identical).

- **Kept, on purpose:** search synonyms carry both spellings (the Teleport moment's `materialise`/`materialize`, the
  star icon's `favorite`/`favourite`). A glyph's NAME is crunchyCore's identifier and rides in links and saved effects
  as the `icon` extra, so `armour` keeps its name and the Icon picker SHOWS "armor" (`ICON_SHOWN`/`iconShown`; the
  filter finds either). The internal `WIZARD_TAGS[*].colour` predicate is now `color` (never saved or exported).
- **The row:** sync suite `copy: the text a person reads uses American spelling` scans every text node, title,
  placeholder, alt, aria-label and optgroup, plus PARAMS labels and sections, preset names and categories, layer kinds
  and blurbs, era hints and the tour, with the same word-boundary list as Tile's, SFX's and UI's rows.
- `crunchysfx-synth.js` is generated (CrunchySFX's `tools/export-synth.py`, then `tools/pull-synth.py` here) and was not
  hand-edited; its comments follow the next re-vendor. The crunchyCore copies follow the next pull.

## 32. Game moments: "Game moment" on a Library card (2026-10-24, crunchyCore MOMENTS.md)

A card's **Game moment** opens crunchyCore's moment modal (`moments-ui.js`) with this effect in the Effect slot: add a
CrunchySFX sound and a CrunchyShader hit look planted in the same game, a shake, a hit stop and delays, and Save plants
`crunchy/moments/<slug>/<slug>.tscn` (a CrunchyMoment node: `$Hit.play_at($Enemy)`), the node's script once, and suite
links to every piece. VFX now pulls `shader.js` (the real hit-look preview), `moments.js` and `moments-ui.js` from the
core (no name clashes, checked), registered in index.html's DEPS and build.rs. Godot only (hidden on a Unity project).
The desktop suite's `moments/` rows prove it (59/59); `safety/nothing-written-outside-crunchy-vfx` allows exactly
crunchy/moments/ (the suite's, by design). `tests/run-ff.mjs` takes `UNMASK=1` to show file:// script errors in full.
**Open, found on the way (NOT caused by this):** the frame hash differs from `frame-hash.expected.txt` for "Coin Burst"
and "Prompt Pop" (and so the pack and the total) with or without the new scripts loaded: look before the next release.

## 33. Crescents centered; the Quick shape knobs relative (2026-10-25, AJ)

**Crescents off center** (AJ: Twin Slash "very off center"). Fit centers the bounding box of every frame, and measured
each particle as a full circle round it; a crescent's pixels are an ARC a radius off its particle (shapes.js draws it at
the top of its circle), so the box centered empty space and the slashes hugged one side. A shape may now say where its
pixels are (`SHAPE_DEFS[i].extent(st)`: unit points before the particle's turn; the crescent's outer and inner arc) and
simulate() measures those, turned with the particle, when a layer wears that one shape alone. Measured by the arc's own
centroid against Fit's center: Twin Slash 28% → 14% off, Slash 32% → 17% (and both now fill the frame: no room kept
for the empty part of a circle); seen side by side with a crosshair. The frame hash moves for exactly Slash and Twin
Slash (the only crescent presets) and Slash's sheet export; planted crescent effects show "update available".
`frame-hash.expected.txt` is NOT regenerated: its totals would also swallow §32's unexplained Coin Burst / Prompt Pop drift.

**Relative Quick shape knobs** (AJ: Violence on Twin Slash "clicking anywhere spawns many slashes, and clicking back ...
doesn't return it"). A macro's to(v) set ABSOLUTE values (Violence: 20-600 particles) and from() read one back, so a
2-slash preset became 20+ on any touch with no way back. Now, like Busyness, a macro remembers the effect and the
slider's own position at its first touch (until syncUI: a preset, an undo) and moves each setting RELATIVE to where to()
puts it there: scaled when both are above zero, else shifted; snapped into the setting's range; at the starting position
exactly the effect again. Hue stays absolute (`absolute: true`: an angle). Twin Slash: Violence +0.3 → 8 slashes, the far
end 19, back → the preset byte for byte. Rows in regression.js; the round-trip row reads the slider. Suites: 694/694,
desktop 59/59, web 13/13. (The "randomize never produces an empty effect" row is FLAKY: random rolls, failed 1 in 3.)

## 34. The layer strip (2026-10-25, AJ: "a strip ... with preview images so the user knows what they're clicking")

"Add a layer" was a wall of 50+ word-chips ("Arc", "Sigil", "Rift" mean nothing until tried). It stays where it was
(above the layer panels, where they are tuned), but each off layer is now a PICTURE CELL along one scrolling strip, each
kind a run with its name upright, and kind chips (All + the kinds with an off layer) narrow it; the filter and the
one-line description under the strip stay. A cell's picture is that layer switched on over ONE plain base (the default
burst with 40 particles, `LAYER_BASE`), at the frame where it differs MOST from the base alone (so Flash shows its pop,
Decal its mark); pointing at a cell plays it. Pictures render lazily (a 10 ms queue) and are cached for the session
(the base never changes). The cells keep the `.layer-chip` / `data-layer` / `.layer-kind` hooks, so §24's rows hold;
four new rows: every cell has a picture, a layer's picture is not the base (Weather), a kind chip shows only that kind,
All brings them back. Suite 698/698. styles.css --css-build 11 (and its want).
- **Paged, and first (same day, AJ):** "chevron arrows on the sides for more consistency ... the scroll bar kind of hides"
  → the strip PAGES like the Effects strip (`.pbar-row` with ‹ › and "n / m", the wheel pages, how many fit is MEASURED:
  `layerPaginate`, a run's upright name counted where it starts a page; re-paged on a width change), painting the shown
  page and the next. And "this should be the very top box under the preset strip, since if someone is making one from
  scratch, they should be able to pick right away what kind of effect engines go into it" → `#layerBar` is the FIRST
  thing in the editor (above Quick shape); the active layers' panels keep their place after the panels every effect has,
  under "Layers in this effect" (`layersHead`, hidden with none on); adding a layer scrolls its new panel into view. The
  §24 order rows now say exactly that. 698/698.
- **Just the layer (same day, AJ: every picture "has a 'burst' effect as part of them ... which dilutes what the effect
  is at a glance"):** base and base + layer are rendered with Fit OFF (one shared framing) and a picture keeps only the
  pixels the layer CHANGED: a layer that stands alone (Bubble, Beam, Sigil, Tunnel) shows alone, one riding the particles
  (Trails, Web, Particle rings) shows what it adds, a post effect (Chromatic, Glitch) shows the burst as it changes it;
  a layer that changes nothing keeps the whole picture. Each picture is then ZOOMED to the layer's own pixels (one
  square over every frame, so it plays steady; crisp) and a faint one brought up to full opacity. Seen for all 59.

## 35. The Foundry removed (2026-10-25, AJ: "the Wizard can honestly do way more ... less clutter is a good thing")

The Foundry (6 kinds x an art style, candidates mutated from a kind's base) was a narrower, unguided copy of the Wizard:
the Wizard's nine are COMPOSED for its answers (wizardCompose), "More like these" gives nine fresh ones, and the era is
its third question. Gone: the toolbar button, its dialog and generator (ARCHETYPES, foundryGenerate), its tour step,
the "Invent, don't tweak" tutorial's step, the `.foundry-*` / `.fnd-*` styles (--css-build 12), and its mentions on the
itch page text, ITCH-DESCRIPTION.html, the Flatpak metainfo and CLAUDE.md. Kept: `styleByName` (the Wizard and the
Era buttons use it). The toolbar is Randomize · Breed · Variations · Match a sound · Reroll seed. Rows: the two that
drove the Foundry removed, "the 8-bit style clamps the look" kept on its own (styleInto); 696/696, desktop 59/59, web 13/13.
The itch page itself (on itch.io) still says "Foundry" until AJ pastes the new text.
- **The frame hash re-recorded (2026-10-25, for 1.1.0):** every moved line accounted for: Slash and Twin Slash (§33's
  crescent centering, intended), Coin Burst and Prompt Pop (they draw the suite's icons, the "coin" and "btn-a" glyphs;
  crunchyCore glyphs.js went build 1 → 4 since the hash was last recorded, a redraw in the core), Slash's sheet export,
  Prompt Pop's frames export, and the pack and total that sum them. Nothing else moved.

## 36. Game moments take share links (2026-10-25, AJ: "Make one in…" sends people to the web version, "where they don't have library access")

Before 1.1.0 ships: the moment's Sound and Hit look slots take a pasted share link (crunchyCore moments-ui.js 2). A
CrunchyShader link is rendered by the core's shader engine; a CrunchySFX link by VFX's vendored synth
(`momentLinkSound`: decodeSfxLink → CrunchySynth.render with the link's normalize → encodeWav, named by its title; a
link carrying settings this synth (SFX 1.1.0) does not know gets a note: "made with a newer CrunchySFX ... may sound a
little different here"). Save writes the WAV / shader + material INTO crunchy/moments/<slug>/ (the moment's own files)
and the scene points at them; the moment keeps both links. Row `moments/share-links-from-the-web-apps-render-into-the-
moment` (a non-link refused; both links shown, saved, pointed at, kept). 696 / desktop 60 / web 13; core 312, moments-godot 11.

## 37. Shared palettes and color sets (2026-10-25, crunchyCore PALETTES.md step 2b)

AJ: "being able to consolidate those across the apps and have your own may be a bigger lever than the actual palettes …
being able to add to those and actually have them consistent across each app would be beneficial." VFX pulls
crunchyCore's `palette.js` (the model, the planted kind), `palette-ui.js` (the suite's palette window) and `colorsets.js`
(237 named sets, light → dark, append-only ids like `theme:fire`): all four registrations, wants palette 1 / palette-ui
1 / colorsets 1, `--css-build` 13.

**Color sets.** Under the 18 mood buttons (untouched) a "Color sets…" row opens a picker: your own sets first (planted
in the game, `paletteSets(project)`: every planted set and every ramp of every planted palette; on the web, or with no
folder planted, kept in this browser under a NEW key `crunchyvfx.palettes.v1` as palette.js share strings), then the
suite's sets by `COLORSET_GROUPS`, with a search; "New color set…" opens `paletteOpen({ kind: "set" })`. A pick colors the
effect through the EXISTING ramp mode (`rampOfColors`): two stops per color, a band each, the lightest as a particle is
born and the darkest as it fades. STEPS, not blends: sampleRamp between two stops of one color is that color, so no
point of a life gives a color the set doesn't list (palette.js's rule: never invent a color). The stops are each color's
exact HSL (hue to 2 decimals, saturation and light to 4), which vfx.js's `hslParts` turns back into the very same hex
(all 237 sets tested; 200 000 random colors measured). A pick also sets Hue var 0, Brightness 1 and the NORMAL blend
(additive piles a set's colors into white where particles overlap). The renderer itself is unchanged, so its sprite
cache still rounds a particle's color to 24 hues × 5 × 6 steps and soft edges and a glow still mix: the pixel-exact
route is the picker's "Lock every pixel to the set too" (the palette lock with the set's colors). The set's id rides in
a new PATCH_EXTRAS `colorSet` ("" by default, read by nothing that draws), so the picker can mark it; the colors ride in
`ramp` (link, sidecar, undo). A link from someone else's set shows as "This effect's set", with Keep. A mood after a set
takes the set's ramp away (only when `colorSet` is set; a ramp drawn by hand is never touched, and editing the ramp
clears `colorSet`).

**The lock opens the palette window.** "Match my game's colors…" and the toolbar's "Game palette" (and "Palette
window…" in the Crunch box) open `paletteOpen` on the lock as it stands: a planted palette that IS the lock opens as
itself (Save updates it in place), a kept or starter palette as itself, any other lock grouped by `paletteFromColors`.
Its preview is the effect rendered once without lock or color steps, then snapped by VFX's own rule (dither bias, then
2/4/1). Save locks the effect (`paletteLock` still holds plain colors) and, without a folder, keeps the palette in the
browser. The Crunch box's Load and paste read through the core's `paletteParse` (JASC .pal and CSS pastes now too, and a
pasted "p1." string); vfx.js's quantize is as it was.

**Nothing bundled unless CC0 (AJ, 2026-10-25).** VFX's five built-in lock palettes are gone: the box offers the core's
`PALETTE_STARTERS` (our own CC0 palettes and hardware palettes), then yours. Sweetie 16 and Fantasy 16 were their
makers' designs; makers' palettes stay importable (Load, paste, the window), as the person's own files. No preset named
them. A lock stores colors, so every effect and link locked to any of the five renders byte for byte
(`tests/fixtures/locked-links.js`, made once on HEAD 04c23ea). `BUILTIN_PALETTES` is removed; the regression's
16-color lock check keeps its colors inline.

**The Library's Palettes tab** (every engine; Unity has no moments tab but has this one): cards for planted palettes and
color sets (swatches as the picture; badges "palette" / "color set", and "locks / colors this effect"), Lock the effect /
Color the effect, Edit (the window, Save in place), Rename (the sidecar, then saved again in place so the .gpl and the
share string carry the name), Delete (through plant.js's removal guard: a scene using its .tres stops the first press).
The tab's commands are New palette…, New color set… and Close. Everything lives in crunchy/palettes/ (the suite's
kind), so a palette or set saved here shows in every Crunchy app planted in the same game. No new Tauri permission: the
code calls only exists / read / write / mkdir / readDir / remove, all granted.

Rows: desktop `palettes/a-built-in-set-colors-the-effect-with-exactly-its-colors`, `…/a-set-saved-from-the-window-is-
planted-and-listed-with-edit-rename-delete`, `…/a-palette-from-the-shared-window-locks-the-effect`, `…/old-locked-links-
render-byte-for-byte` (each with a negative); web `palettes/a-web-color-set-is-kept-in-the-browser-and-rides-in-the-
share-link`. Frame hash unchanged (1f591c9eb230a807 over 306). Main 697 / async 77 / desktop 65 / web 14.

## 38. The game palette, and effects that follow their sets (2026-10-26, crunchyCore PALETTES.md step 4b)

AJ (2026-10-26, "I think yes too"): a design made FROM a color set follows later edits of that set, in every app; and a
game's palette is ON for new designs in that game, never flipped on for anything already saved. VFX pulls palette.js 2
(`paletteGame`, `paletteSetGame`, `paletteIsGame`: the mark is `game: true` in the palette's own sidecar, so every Crunchy
app planted in the game sees the same star). `--css-build` 14.

**Following.** §37 copied a set's colors at the pick. Now an effect with a `colorSet` draws with that set's CURRENT colors
wherever the set is known (the suite's 237, the planted sets and palette ramps, this browser's kept ones), through
`followInto(st)`: on every load (`applyPreset`: links, planted and My Effects opens, undo), on every planted render
(`plantedRender`, so the update check and Update all see it), and on every re-read of the game's palettes (`followEditor`).
A set this computer doesn't know keeps the colors the effect carried: they still ride inline in `ramp`, so a link opens
anywhere. **The lock follows too**: a new PATCH_EXTRAS `lockFrom` ("" by default, read by nothing that draws) records where
a lock came from: a planted palette `palette:<slug>`, a browser-kept one `mine-palette:<slug>`, or a set's id (the
picker's "lock every pixel to the set too"). Set by the lock row's own palettes, the palette window's Save, the Library
card's Lock the effect and the game palette; cleared by every plain lock (a file, a paste, Take 8/16, Clear, a starter)
and by an era that sets the lock (`styleInto`). An effect with neither id (every preset, every effect locked or colored
from plain colors, everything made before) never meets this code: frame hash 1f591c9eb230a807 over 306, unchanged.

**Update every asset.** `projPalettesRefresh` keeps a fingerprint of every planted palette's and set's colors (its `s`);
when it moves (an edit here, or another app's seen on re-read: opening, the window's focus, opening the Library; the first
read after opening counts, since the open's own check may run before the sets are read) every planted effect is checked
again. One made from a set or palette that changed renders differently, so it shows "update available"; Update all
re-exports it and writes the followed colors into its sidecar's share string (`followedFields`), so the sidecar reopens
anywhere as the files show it. A plain-color effect renders exactly as before, so it never shows an update. Only the
latest of overlapping reads lands (`projPalRead`).

**The star.** Each card on the Library's Palettes tab gets "Make it the game's palette", or a "The game's palette ★" badge
and "Unmark" (`palSetGame` → `paletteSetGame`). The game's palette is FIRST everywhere: the Palettes tab's cards, the lock
row ("The game's palette", then Starters, then yours), and the color set picker ("The game's palette: <name> ★", its ramps
as sets, or the set itself).

**"Use the game palette (<name>)"**, under "Match my game's colors…", shown only while the game has one. On by default,
remembered per game folder in a NEW key `crunchyvfx.gamepalette.v1` (only the games it is turned OFF in; never in a link).
On, a NEW effect is locked to the palette's flat set with `lockFrom` its id (`gameLockNew`): a preset picked in the strip,
Randomize, a Wizard pick, a Breed or Variations child loaded, Match a sound (`applyPreset`'s new `fresh`). Moods and color
sets still color the effect under the lock. A link, a planted effect, My Effects, undo and A/B never pass `fresh`, and the
switch changes nothing on screen when turned either way. With no game palette (and always on the web) `gameLockNew` returns
at once. ~~The Wizard's nine and the strip's pictures are drawn without the lock; a click loads them locked.~~ **Superseded
(2026-10-26, follow-up):** what you see is what you get. The strip's pictures and the Wizard's nine are drawn WITH the lock
(`gameLockInto`, the write `gameLockNew` makes, on any state; `wizardState` takes it, so a result's picture and its click
are one state). Strip pictures are cached by name + the lock's colors (`presetThumbKey`, `gamePalThumbKey`), and
`gamePalThumbsSync` redraws the strip when that key moves: the switch, a star, an edit here or another app's (seen on the
re-read, via `syncGamePalUI`). Off, or no game palette, the key is the name alone and a picture is HEAD's byte for byte.
Row: desktop `game-palette/strip-and-wizard-pictures-are-what-a-click-loads` (negative: switch off, every picture equals
HEAD's procedure inline, and the Wizard's result is unlocked). Desktop 73; main 698; frame hash unchanged (306).

Rows: desktop `game-palette/the-star-set-here-and-seen-set-by-another-app`, `…/listed-first-in-every-picker`,
`…/the-switch-on-locks-every-new-effect-as-a-reference`, `…/the-switch-off-and-existing-effects-untouched`,
`…/a-set-edit-flows-into-effects-made-from-it-and-update-all-takes-it`, `…/a-link-follows-a-known-set-and-keeps-an-unknown-ones-colors`,
`…/with-none-marked-a-new-effect-is-byte-for-byte-heads` (each with a negative; the follow and switch rows fail with
following or `gameLockNew` cut out, measured); web `palettes/a-kept-set-or-palette-edited-flows-into-the-effect-made-from-it`.
The §37 card row's action list gains the star's button; the main suite's extras row gains `lockFrom`. Main 698 / async 77 /
desktop 72 / web 15; frame hash unchanged; godot-check 19.

## 39. Variety: an exported Godot effect that varies every time it plays (2026-10-27)

**Why.** AJ: "a hit effect, with variations it might be at a random angle with a random size. Can we programmatically
recreate that variance in the premade Godot object?" CrunchySFX's packs (an AudioStreamRandomizer, a different take each
play) are the precedent.

**What.** A "Variety" section in the Export dialog, shown only for Godot 4 (sheet + Godot metadata). "Vary it every time
it plays" (off by default) writes the effect's own `variety` PATCH_EXTRA ("k:v,…", `varietyOf`/`varietyString`;
unknown keys ignored, so append-only), which the share link, undo, My Effects and the planted sidecar carry. Off writes
"" and every file is byte for byte what it was.
- **Tweaks each play** (the scene's script, on the SPRITE, so the node's position stays the emitter): flip left-right
  and/or top-bottom (each on a random half of plays, by a negative scale); turn: none / 90° steps (pixel-crisp,
  recommended) / any angle (noted as slightly jagged); size: 1× only, 1× or 2×, 1×–3× (whole steps), or a free
  0.75–1.25× / 0.5–1.5× (noted as uneven pixels); speed ±5/10/20/30% (`speed_scale`); a whole-pixel nudge 0–32.
- **Baked variations** (None / 3 / 4 / 5, the effect itself first, Reroll): siblings from the Variations engine
  (`mutateGenome` at the page's default Difference 0.14) under a SEEDED Math.random (the effect's seed and a bake seed),
  so the same effect always bakes the same family and a planted one never shows "update available" by chance. Two guards
  the page's human eye supplied before: frame size, duration, fps and seed are pinned (`VARIETY_PINNED`: mutateGenome
  moves frameW/frameH, and one bake came out a 128×1 frame, a speck), and each sibling's lit pixels must be within half
  to double the effect's own (12 tries, else the nearest). They are stacked in ONE sheet, ONE SpriteFrames with one
  animation each (`default`, `variation_2`, …), and the emissive mask stacks the same way.
- **The scene:** `EFFECT_SCENE_SCRIPT_VARIETY` is the plain script with the Variety exports and `_vary()` spliced in at
  fixed anchors (it throws at load if one moves; a main-suite row checks it is a superset). Inspector: `flip_h`,
  `flip_v`, `rotation_mode`, `scale_min`/`scale_max`/`scale_whole`, `speed_percent`, `jitter_px`, `animations` +
  `impact_frames` + `sound_frames` (each variation's own), `variety_seed` (0: random each run; any other number replays
  the same sequence), and `variation` (which one the latest play picked). README.txt gains a VARIETY section.
- Drag out (desktop) writes the plain sheet, so its scene gets the tweaks without the bake (`bake: false`).
- **Game moments need no change:** CrunchyMoment instantiates the effect scene, so a varied effect varies in a moment.
  (The Library's moment STAGE preview reads every region of the .tres as one strip, so a baked effect previews its
  variations back to back there; crunchyCore's `momentFrames`.)

**Proved.** `tests/godot-scene.mjs` 65 (was 31): a fifth export, set through the dialog's own controls (flips, 90°,
1–2×, ±10%, 2 px, 4 baked), in real Godot 4.7.2: 200 plays: both flips seen, turns only multiples of 90° (all four),
|scale| 1 or 2 in whole steps, speed within ±10%, whole-pixel nudges ≤ 2, all four animations picked, `impact` once per
play on that animation's own frame, every play finished and freed; a copy with distinct impact frames (1, 3, 5, 7)
fires each on its own; variety_seed 77 ×10 identical (seeds 1..10 not); a CrunchyMoment (crunchyCore `momentScene` +
`MOMENT_GD`) using it shows several variations over 30 plays. Negatives: the four plain exports' `.gd` equals HEAD's
script byte for byte, their scenes name no Variety and play at scale 1, no turn; the switch on then off gives the
untouched bundle byte for byte. Frame hash 1f591c9eb230a807 over 306 IDENTICAL; main 709 (9 new), desktop 75 (2 new),
web 15, godot-check 19.

## 40. The SFX engine catch-up (2026-10-28): the frame hash re-recorded on purpose

VFX's vendored CrunchySFX synth (`crunchysfx-synth.js`) had stayed pinned at SFX v1.1.0. It is now pulled from SFX
`a6296b6` (v1.2.1 plus SFX-1.3-PLAN's bugs-and-foundation pass, `tools/pull-synth.py --check` OK). That pass fixed a crash
(a custom-reverb link threw a ReferenceError in this copy) and changed no SFX sound (SFX's audio hash identical).
Exactly ONE frame-hash line moved: `EXPORT "sound:Hit Spark"` (8a6e12898e771aee → 16c59af5226c06c6), with the FRAMEHASH
total (1f591c9eb230a807 → c598150557e54c32). The cause is the 1.1 → 1.2 engine catch-up (e.g. its DC block), shown by
exporting SFX's earlier commit 32c21d8 into this repo, which moves the identical line. So VFX's effect sounds now match what
CrunchySFX exports today. Re-recorded as MEANT (AJ, 2026-10-28). No frame moved.

# CrunchyVFX — ideas & feature brainstorm

Shared scratchpad. Lines marked **— C** are Claude's; everything else is Alex's. Effort tags are
rough: **S** = an hour or two, **M** = a day, **L** = multi-day. **[port]** = the code already
exists and works in CrunchySFX, so it's mostly copy + adapt — the cheapest wins in the file.

---

## Alex's list
Generate visual effects based on sound effect works but can we import the sound to be played as well so it matches up?
Resize (visually) the animation in the editor based on available width, so ultra wide screens will automatically show it bigger. 

Let's dock the preview window, so if the user scrolls down to click on a slider, the preview itself is never out of view.

sliders and whatnots:


- Sliders similar to CrunchySFX that alter many properties. It allows the user to alter useful properties to make sweeping changes instantly.

- Lock pixel mode by default, if users are making assets here, they'll want to keep them consistent, so locking the pixel size is to help ease the annoyance of setting it each time.

- import a sprite sheet so the user can overlay the effect in browser, and then combine the two layer and export them as a single sprite sheet.

- Similar to CrunchySFX, let's hid irrelevant control panels. If possible.


### Status of the above — C

*(Covers every ask in this section, including the earlier list — ice, charm, spiral, emote, text
bubble — which has since been edited out above but is all built.)*

- **play the sound alongside the effect** ✅ **done (route a)** — a Sound panel beside the stage:
  load a `.wav`/`.mp3`, and it restarts in lockstep with the animation loop, with volume, an
  offset slider (±500ms) for nudging alignment, and a line telling you plainly whether the clip is
  longer or shorter than the loop and what to set Duration to so they match. Web Audio rather than
  an `<audio>` element, because restarting an element has tens of ms of slop and tens of ms is
  exactly what you're judging.
  **The transport was rebuilt for this**, as predicted: frame position now comes from elapsed time
  rather than a per-tick counter, and one restart drives picture and sound together. Without that
  the two drift apart over a loop.
  **Route (b) — synthesising the sound from the pasted link — is AGREED WORTH DOING, on hold.**
  (Alex, 2026-07-26.) Notes so it doesn't need re-deriving:

  - Linking `dsp.js` live from the sibling repo doesn't work. `<script src="../crunchyfx/dsp.js">`
    runs locally but is unshippable (Cloudflare deploy, Tauri bundle, anyone else's checkout);
    fetching it from crunchysfx.com needs network and breaks `file://`. More to the point, **it
    wouldn't help**: `dsp.js` is only the engines. The part that turns a patch into audio is
    `render()`, which lives inside CrunchySFX's `index.html` — **546 lines, reading `state.` 133
    times**, plus four module-level globals (`sampleBuf`, `customIR`, `customTable`,
    `normalizeOut`). A live `dsp.js` would still leave the hard part to hand-copy.
  - "Always up to date" is also the wrong target: if VFX tracked SFX's latest automatically, a
    change over there could silently break audio here with no signal. Pinned + a drift warning is
    better — you find out when you look, not when a user does.

  **Plan when it's picked up:**
  1. *In the CrunchySFX repo:* extract `render()` from `index.html` into `synth.js`, taking a patch
     object instead of the global `state`. Worth doing for SFX on its own — it makes the DSP core
     testable and matches the "pure functions, no app state" discipline `dsp.js` already follows.
     Verify it there, with SFX's own harness.
  2. *Then here:* vendor `dsp.js` + `synth.js` with a sync script that stamps the source commit and
     a checksum, plus a regression assertion that fails when they drift. Two files with a tripwire,
     rather than 1300 hand-copied lines and hope.

  Cost/benefit, plainly: route (a) already works — export a WAV from CrunchySFX, load it here.
  Route (b) removes two clicks and makes "paste a link, hear and see it" a demo you can show. That
  demo is the bundle pitch, which is why it's worth a 546-line port; it isn't worth starting before
  step 1 exists.
- **resize the preview to the available width** ✅ **done** — an **Auto** zoom (now the default)
  that picks the largest whole-number multiple fitting the column and re-picks on window resize.
  Whole numbers only, as argued: a fractional zoom resamples pixel art into mush and would quietly
  undo everything the Crunch panel is for. A 64px effect now shows at 4× instead of a postage stamp;
  1×/2×/4×/8× remain as manual overrides.
- **dock the preview so it's never out of view** ✅ **done** — a small copy pins itself under the
  toolbar the moment the real stage slips behind it, showing the animation, the frame counter and a
  ↑ to jump back; clicking the picture does the same. It appears when the stage passes *under the
  sticky toolbar*, not when it fully leaves the viewport — waiting for the latter would hand it to
  you too late to be useful. It deliberately omits the guides (a 1px grid scaled to 150px is noise,
  not information) and follows your backdrop choice so transparency reads the same in both. On a
  phone it parks bottom-left, out of the thumb's way. There's a 📌 toggle, persisted, because a
  floating panel you can't dismiss is a nuisance.
- **explosions** ✅ Explosion, Big Boom, Shockwave, Fire Jet, Ember Rise
- **fire** ✅ Fire Jet + Ember Rise (both loop)
- **ice** ✅ **snowflake** shape (arms + branches) → Ice Blast, Frost Nova, Snow
- **lightning** ✅ Lightning Zap. The bolt silhouette is still cached, so every bolt in one patch
  shares a shape — per-particle bolt geometry remains a real upgrade.
- **charm (heart particles)** ✅ **heart** shape → Charm Hearts
- **spiral particles** ✅ **spiral** shape (coiled tail) → Summon Swirl. Note there were already
  *two* other spiral things: a spiral **emitter** (golden-angle placement) and a `swirl` force.
- **emote / emoji, "!" above a head** ✅ **glyph** shape — renders any character or emoji as the
  particle, with a text box and quick picks (★ ♥ ✦ ! ? 💥 🔥 ❄ ⚡ …). `glyphTint` at 0 keeps an
  emoji's own colours; at 1 it tints like any other particle. → Emote Pop, Emoji Burst.
- **text bubble** ✅ **done** — and it stayed the odd one out: it's a **layer**, drawn once per
  frame from `t` with no simulation behind it. Rounded box, tail, easeOutBack pop-in, `|` for a
  line break, quick picks (!, ?, CRIT!, +10, z z z). Drawn *after* the glow so it isn't bloomed
  into a haze, but *before* pixelate/posterize/outline so it takes on the art style instead of
  sitting on top looking like a different program.
- **hue** ✅ Hue, Hue shift, Hue var + **18** palette buttons
- **pixel thickness** ✅ Pixelate (block size) and Outline (edge width)
- **macro sliders (CrunchySFX-style)** ✅ **done** — six: Violence, Softness, Chunkiness, Weight,
  Heat, Swirl. Each `to(v)` writes several params and moves the real sliders; each `from()` reads
  one param back so hand-editing a control drags its macro along instead of letting the two lie
  to each other.
- **lock pixel mode by default** ✅ **done** — 🔒 Lock pixels, default ON, persisted. The subtlety
  worth knowing: it only preserves keys you've actually **moved off their default**. A blunt lock
  would break the showcase presets on a fresh load (Pixel Burst would arrive un-pixelated), so
  it's "keep my settings" rather than "ignore the preset".
- **import a sprite sheet, overlay, composite, export as one** ✅ **done** — the Reference panel
  beside the stage. Load an image or sheet, set cols×rows (guessed from the aspect ratio),
  scale/offset/⤢fit it, put it behind or in front, and tick **Combine on export** to bake it into
  the sheet, the PNG sequence *and* the GIF. Sheet frames cycle in step with the effect and wrap,
  so a 4-frame character loop plays under a 20-frame explosion.

### Found while building the above — C

- **Hiding inert panels needed a different rule than CrunchySFX's.** SFX hides panels by ENGINE,
  which is safe because its engines are mutually exclusive. Nothing here is — any layer can be
  switched on at any moment — so that rule doesn't transfer (Alex spotted this before I built it).
  The rule that *does* hold: every layer group has a master switch, and at zero the rest of the
  group is inert. `growth: 0` makes nine sliders do nothing; across twelve groups that's ~54 dead
  controls. Off groups now hide entirely and become chips in an "Add a layer" strip, which turns
  them on **at a value that does something** — better discovery than a slider sitting at zero among
  145 others.
- **Panel visibility must not re-evaluate on a slider drag.** Dragging Growth down to 0 would make
  its panel vanish under the cursor with no way to drag it back up. Visibility is recomputed only
  in `syncUI()` — preset load, undo, randomize — so a panel you're editing stays put until you load
  something else. There's a test for it.

- **Where the render time actually goes** (measured, 1500 particles / 29 frames / 192px). Alex
  suspected the Pixelate slider; the profile said otherwise and was worth having:
  `simulate()` **1.3ms**, rasterising **60ms**, glow **+40ms**, `outline 3` **+33ms**, pixelate
  **0ms**. Two conclusions. (1) The simulate/rasterize split does *not* help interactivity — I'd
  been about to wire "reuse the sim for raster-only params" and it would have bought 1.3ms of
  100ms. It earns its keep for Fit and multi-resolution export, not for slider drags. (2) The cost
  is per-particle `drawImage` (~1.3µs each) plus the two full-image post passes.
- **The outline pass was O(w·h·r²)** — a (2r+1)² neighbourhood test per transparent pixel. A square
  structuring element decomposes into a horizontal then a vertical pass, so it's now two
  sliding-window counts: O(w·h), independent of radius. **33ms → 6ms**, and the output is verified
  *pixel-identical* to the naive version (it changes how every outlined preset looks, so "close
  enough" would not have been acceptable). Pinned by a test that recomputes the naive definition.
- **Off-screen particles were still being drawn.** `drawImage` clips them, but the call costs
  ~1.3µs and a fast burst spends its whole tail outside the frame. A bounds check first: **117ms →
  26ms** for 3000 fast particles. The cull box is 1.5× the sprite size, since a rotated sprite
  reaches past its nominal square.
- **Glow deliberately NOT optimised.** Blurring at half resolution is the standard bloom trick and
  would take ~40ms to ~12ms, but it shifts every glow slightly — and with 41 presets tuned and the
  quality pass still ahead, silently changing how they all look to save 30ms is a bad trade. Worth
  revisiting *with* the quality pass, not before it.
- **Slider debounce is now adaptive** — never schedule a render sooner than the last one took.
  Fixed at 50ms it queued a backlog on heavy patches that the main thread chewed through after you
  let go, which is precisely what "the slider feels laggy" is.

- **No fixed particle angle.** Every particle gets a random start rotation, so a one-off directional
  shape (the Slash crescent) points somewhere different per seed. Needs an `angle` + `angleVar`
  pair; `spin` only controls rotation *rate*. Small, and it unblocks slashes/arrows/directional
  glyphs.
- **`originX`/`originY` did nothing until now** — `renderFrames` centred the origin, exactly
  cancelling them. Fixed; that's what made Rain and Snow able to fall from the top of the frame
  rather than spawning in the middle.
- **Fixed particle angle** ✅ added while doing the above — `angle` + `angleVar`. `angleVar`
  defaults to 1 (fully random), which is byte-identical to the old behaviour, so no preset moved.
  Slash now sets `angleVar: 0` and points the same way every seed.
- **Beware parse-time calls into later declarations.** `renderMyEffects()` ran at parse time and
  I made it refresh the custom categories — whose DOM handles are declared 900 lines further down.
  That's a temporal-dead-zone ReferenceError that kills the *entire* script, and because the UI is
  built earlier in the file the page still *looked* fine: panels, presets and buttons all present,
  just nothing rendered and every later feature silently missing. All initial loading now happens
  in Boot. Worth a `window.onerror` probe whenever the app looks right but behaves oddly.
- **Generated effects need a visibility guard**, the exact analogue of CrunchySFX's
  `audiblePatch()`. A wide mutation trivially produces `opacity: 0` or a 2px particle — valid and
  completely invisible. `visibleGenome()` renders candidates at 40px, counts lit pixels and
  retries, which took the foundry from ~3 of 8 dead cells to ~1.
- **A locked palette is exact only where alpha is 255.** Canvas stores colour premultiplied, so
  writing an on-palette RGB at alpha 8 and reading it back returns something up to ~60/255 away —
  the precision isn't there at low alpha. Opaque pixels: exactly N colours. Soft edges: hundreds.
  This looked like a broken snap for a while; it isn't, and `alphaCut` removes it entirely. The
  palette panel now says so rather than quietly shipping a "16-colour" sprite with 200 colours in
  its edges.
- **Children are born hot.** A sub-emitter's children reset to `u = 0`, so `coreWhite` flashes them
  white at birth. It reads well for fireworks and embers but it does make children look
  disconnected from their parents when that isn't wanted — turn `Hot core` down. If it proves
  annoying, the fix is a "children inherit the parent's life fraction" toggle.
- **Two bugs Alex spotted from behaviour alone** ("importing a second sound keeps the first's
  length"), both confirmed by driving the real UI in a test rather than guessing:
  1. `decodeSfxLink` took the **first** `?s=` in the box. Paste a second link without clearing
     (click at the end, Ctrl+V) and the field holds both — so it silently re-imported the sound you
     already had. Now takes the last match, and the field selects-all on focus so a paste replaces.
  2. The pixel lock pinned anything merely **off-default**, which meant a *preset's own* crunch
     settings got captured and leaked into every effect loaded afterwards. Load Pixel Burst and
     everything after it stayed pixelated. The lock now pins only values the **user** changed by
     hand (slider, dropdown, or a macro that writes them); the button shows how many are pinned and
     turning it off forgets them.
- **An imported sprite decodes asynchronously.** Loading a patch that carries an imported PNG
  renders one frame without it, then corrects itself when `Image.onload` fires and triggers a
  re-render. Unavoidable with `Image`, harmless in practice, but it makes any *synchronous* test
  of that path fail misleadingly — prime the element first, or await the load.
- **An "only update on change" guard that was inverted.** The dock's visibility check read
  `if (dock.hidden === !show)` — which is true only when the state is *already correct*, so the
  dock never appeared. It looked right at a glance and the fix was to drop the cleverness: assign
  the state unconditionally and use the previous value only to decide whether to repaint. Caught by
  a test, not by reading.
- **Inline the test suite; don't `<script src>` it.** Under `file://` every file is its own
  origin, so an error inside a linked script surfaces as an opaque `Script error. @ 0` with no line
  number — a one-line typo becomes a hunt. `build.py` now inlines the suite into the generated
  page, and the very next failure named itself (`redeclaration of const z`, exact line).
- **The regression suites live in `tests/`, not a scratchpad.** They used to sit in a temp directory
  and a stray `rm -rf` with an unset shell variable deleted all ten of them. Verification that can
  be destroyed by accident isn't verification. `python3 tests/build.py` concatenates `index.html`
  with a suite (concatenation is required — the app is one inline `<script>` and `fetch` is
  CORS-blocked on `file://`), then Firefox headless runs it. 92 assertions across two files; the
  async one writes `results.txt` because `--screenshot` fires at `window.load` and would miss
  anything behind an `await`.
- **A refactor silently deleted `makeZip`** and every zip path broke at once — PNG frames,
  multi-resolution, variations pack, batch export. Nothing caught it because no suite had ever
  exercised an actual zip, only sheets and GIF. There are now assertions on all four paths plus the
  writer's local-header and end-of-central-directory signatures. The lesson isn't "be careful with
  refactors", it's that a whole category of output had no test at all.
- **A reference image must be loaded as a `data:` URL, never `URL.createObjectURL`.** A blob URL
  inherits the document's origin, which is *opaque* under `file://` — drawing it taints the
  canvas, and then `toBlob` and `getImageData` both throw `SecurityError`, killing every export
  path. Since running from a plain unzipped folder is a core promise of this app, that would have
  been a nasty one to find in the wild. There's a regression test pinning it.

---

## Export & pipeline — where the tool meets the engine — C

This is the category that decides whether someone *ships* with CrunchyVFX or just plays with it.

- ~~**GIF89a export**~~ ✅ **done** — `gif.js` (median cut + LZW), with an export dialog that
  states both caveats and a "Prep for GIF" button. Verified against Firefox's decoder *and*
  Pillow: 20 frames, 40ms delays, loops forever, transparent index 0, disposal 2.
- ~~**APNG export**~~ ✅ **done** — `apng.js`. No encoder at all: the browser already writes a
  perfect PNG per frame, so this re-files their image data under animation chunks. Verified with
  Pillow — 19 frames, **exactly 41.667ms (1/24s)** where GIF has to round to 40ms, and 1692
  partial-alpha pixels in frame 0, i.e. the soft edges GIF destroys are intact.
- ~~**Trim + pivot metadata**~~ ✅ **done** — one *shared* bounding box across all frames, not a
  per-frame crop: cropping each frame to its own box would make the sprite hop around inside its
  cell. Pivot records where the untrimmed centre went, so a trimmed sheet drops in exactly where
  the untrimmed one was.
- **Engine sidecars** — ✅ **partly done**: generic JSON, Aseprite JSON-hash, Phaser 3 atlas.
  **Deliberately not done:** Godot `.tres` and Unity `.meta` are editor-version-specific and I
  can't verify them without the editor — a sidecar that *almost* imports is worse than none.
  Worth adding once someone can test the output in the real tool.
- ~~**Multi-resolution export**~~ ✅ **done** — 1×/2×/3×/4× checkboxes, zipped together. Exactly
  as cheap as predicted: re-rasterises the same sim, so every size is the same effect rather than
  a similar one.
- ~~**Emissive / glow mask**~~ ✅ **done** — a checkbox in the export dialog writes a second
  `_emissive` sheet: the same >threshold pixels the glow pass already finds, exported **un-blurred**
  so the engine applies its own bloom. Built from the already-trimmed frames so the two sheets are
  pixel-aligned — a mask that doesn't line up with its colour sheet is worse than no mask — and
  non-emitting pixels go **black rather than transparent**, since most shaders multiply by this and
  black means "no contribution" where transparent is ambiguous.
- **Normal map from the sprite** — L, speculative, but a genuine differentiator: nobody generates
  normals for VFX sprites. Probably only meaningful for smoke/debris, not additive fire.
- **Drag-out to Aseprite / the engine** — S [port]. The tauri-plugin-drag path already works for
  WAVs; swap the payload for a sheet PNG.
- ~~**Copy sheet to clipboard as PNG**~~ ✅ **done**. Note: the async clipboard API needs a secure
  context, so it fails under `file://` — the dialog says so and points at the localhost launcher.
- ~~**Batch export the whole library**~~ ✅ **done** — every preset and/or saved effect as one zip
  of sheets + sidecars, with a manifest, duplicate-name disambiguation, and the editor restored
  afterwards. Yields between effects so the progress line actually updates.
- ~~**Power-of-two padding toggle**~~ ✅ **done**.

## Authoring & editing — C

- ~~**Color ramp editor**~~ ✅ **done** — a multi-stop gradient over particle lifetime with hue,
  sat, light and **alpha** per stop, six built-in ramps, click-to-add / drag-to-move stops.
  Opt-in: an empty ramp runs the classic hue/hueLife/coreWhite path, so nothing existing moved.
  Hue interpolates the *short* way round the wheel — otherwise every red→magenta ramp becomes a
  rainbow.
- ~~**Size over life**~~ ✅ **done** — a sixth channel on the ramp stops, drawn as a curve over the
  gradient so the shape is readable at a glance rather than hiding in a slider. It **multiplies**
  `grow` rather than replacing it, so turning the ramp on never silently discards a grow value you
  already set. Five-value ramps (every link and preset written before today) parse as size 1.
- ~~**Reference underlay**~~ ✅ **done** — see the sprite-sheet entry above; it does double duty as
  the scale reference and the compositing source.
- ~~**Pixel-grid overlay + safe-frame guides**~~ ✅ **done** — plus onion skin. The grid uses the
  current Pixelate block size, so it shows the grid your art will actually land on. Guides draw on
  the stage only and there's a test asserting they never reach a render.
- ~~**Custom drawn particle sprite**~~ ✅ **done** — a 16×16 alpha grid you paint, with shape
  helpers (dot/ring/square/cross/shard/speckle) and an eraser. Alpha-only, so a drawn sprite
  still responds to Hue and the palettes. ~344 base64 chars, small enough to ride in a share link.
- ~~**Import a PNG as the particle**~~ ✅ **done** — `SHAPES[9]`. `imgTint` defaults to 0 so your
  art arrives in its own colours; raise it to treat it as a particle like any other.
- ~~**Undo / redo**~~ ✅ **done** — Ctrl+Z / Ctrl+Shift+Z, one entry per gesture.
- ~~**My Presets + custom categories**~~ ✅ **done** — My Effects library (thumbnails, rename,
  delete, JSON export/import) plus custom categories holding built-ins and saved effects side by
  side, filed via right-click. **Still pending:** the pointer-based drag-to-organize (HTML5 drag
  is broken in WebKitGTK, so it has to be pointer events).
- ~~**Share links**~~ ✅ **done** — the whole effect in a `?e=` URL as a URL-safe base64 diff from
  the defaults. Diff, not dump: 23 keys instead of 97, and a link made today still loads after
  new params are added because anything absent falls back to its default.
- ~~**A/B compare**~~ ✅ **done** — Hold A, then Swap. It's a genuine swap rather than a one-way
  restore, so you can flip back and forth as many times as you like while tuning.

## Procedural & generative — C

- ~~**"Match the sound"**~~ ✅ **done** — paste a CrunchySFX `?s=` link and it derives a starting
  patch: length→length, engine→particle shape, pitch→size and hue, noise→count, boom→flash +
  shockwave, sweep→speed and in/out pull, envelope→lifetime, bitcrush→posterize,
  downsample→pixelate, reverb→glow, delay→echo + trail, repeats→chained bursts, reverse→reverse.
  It lists every mapping in the dialog before you apply it, because a sound has no single correct
  visual and pretending otherwise would be dishonest.
- **Console styles** — S [port]. The `CONSOLES` pattern: NES / GB / GBA / PS1 / Modern buttons
  that clamp resolution, framerate, palette size and dither in one click. This is the crunchy
  brand in a button, and it's just a patch per style.
- ~~**Import a palette**~~ ✅ **done** — Lospec `.hex`, GIMP/Aseprite `.gpl`, paint.net `.txt`, or
  pasted hex. Five built-ins (Sweetie 16, PICO-8, Game Boy, CGA, Grayscale 8) and **⚗ Take 8/16**
  to pull a palette out of the effect itself via the GIF encoder's median-cut. Posterize is
  bypassed while a palette is locked — both quantise colour, running both is meaningless.
- ~~**Foundry**~~ ✅ **done** — 6 archetypes (Explosion / Impact / Magic / Smoke / Pickup /
  Weather) × 4 art styles (Anything / NES / GBA / Modern). Generates 8 candidates; ✎ loads one,
  ★ keeps it in My Effects.
- ~~**Breed / variations**~~ ✅ **done** — Breed shows 9 children, you pick parents and breed
  again; Variations makes a family (hit_01…hit_08) and exports the lot as one zip of sheets +
  sidecars. All grid thumbnails animate — a still frame is a terrible way to judge a VFX.

## Simulation — C

- ~~**Sub-emitters**~~ ✅ **done** — each particle spawns `subCount` children as it dies, with
  their own speed/life/size/spread and an inherit-velocity knob. Children live in the same arrays
  after the parents, so the integrator handles them unchanged. **One generation only** — children
  never spawn grandchildren, which would be an unbounded population.
- ~~**Per-particle flipbook**~~ ✅ **done** — an imported strip animates per particle, with
  `imgLoops` (plays per lifetime) and `stagger` so a hundred sprites don't play in lockstep, which
  reads as one flickering object rather than a hundred separate ones. Strip size is guessed from
  the aspect ratio on load.
- ~~**Curl noise**~~ ✅ **done** — a `Curl` blend on the turbulence force, 0 = the old behaviour
  exactly. Curl of a scalar noise field is divergence-free, so particles swirl around each other
  instead of piling into the field's sources and sinks — which is precisely why plain value noise
  reads as "jittery" and this reads as "fluid".
- ~~**Attractors / repulsors**~~ ✅ **done** — a point with a force and a falloff. Distinct from
  `radial`, which always works from the emitter: this is an arbitrary point to fall into or be
  blown away from. Negative force repels.
- ~~**Ground collision + bounce**~~ ✅ **done** — `bounce` at 0 is the off switch, so no collision
  test runs for the mid-air majority. Friction scrubs horizontal speed *and* spin on contact, and
  a small velocity floor stops the micro-bouncing that otherwise buzzes forever on the last pixel.
- **Frost/crystal growth primitive** — M. Covers Alex's "ice": a shape that extends outward from a
  seed instead of travelling. Also gives cracks, vines, web, lightning-on-glass.

## Quality of life — C

- **Render in a Web Worker** — ❌ **ruled out, not deferred.** `new Worker()` is blocked under
  `file://`, so it would break the default launch config and the "runs from a plain unzipped
  folder" promise — the thing the whole no-build architecture exists to protect. If the stutter at
  3000 particles becomes a real complaint, the fix is chunking the render across animation frames
  with a progress bar, not a worker.
- **Ping-pong loop preview** — S.
- ~~**"Prep for GIF" button**~~ ✅ **done** — raises alphaCut and snaps fps to a rate GIF can
  actually represent. Deliberately doesn't touch colour: posterizing is a look, not a fix.
- **Sheet-size warning** — S. Tell people a 60fps × 3s × 256px effect is a 14×14 grid *before*
  they export it.

---

## If I had to pick five — C

1. ~~**GIF89a**~~ ✅ done
2. ~~**Share links**~~ ✅ done
3. ~~**Color ramp**~~ ✅ done (size-over-life curve still open)
4. ~~**"Match the sound"**~~ ✅ done
5. ~~**Import a PNG as the particle**~~ ✅ done

That list is done. Collision and sub-emitters — which I'd deliberately left *out* of the five —
have since been built too; the reasoning still holds, they just stopped being the expensive ones
once the cheap wins ran out.

**What I'd pick now:** (1) synthesise the matched sound in-app (route b above) — still the last
piece of "one product", and now the only large thing left on the list; (2) the Tauri desktop
wrapper, which is the whole of build-order step 4 and currently untouched; (3) pointer-based
drag-to-organize for the categories, the last outstanding piece of the ported machinery.

Worth saying out loud: the cheap wins are gone. Everything remaining is either a big port, a
platform, or speculative (normal maps, frost growth). A good moment to stop adding and start
sanding — the name red-flag pass, a CLAUDE.md, and a real pass over defaults and preset quality.

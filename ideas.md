# CrunchyVFX — ideas & feature brainstorm

Shared scratchpad. Lines marked **— C** are Claude's; everything else is Alex's. Effort tags are
rough: **S** = an hour or two, **M** = a day, **L** = multi-day. **[port]** = the code already
exists and works in CrunchySFX, so it's mostly copy + adapt — the cheapest wins in the file.

---

## Alex's list

Visual Effects to target:
charm (with heart particles)
ice
spiral particles
emote (potentially even emoji support), for example putting an ! above a characters head.
Text bubble perhaps?


sliders and whatnots:


- Sliders similar to CrunchySFX that alter many properties. It allows the user to alter useful properties to make sweeping changes instantly.

- Lock pixel mode by default, if users are making assets here, they'll want to keep them consistent, so locking the pixel size is to help ease the annoyance of setting it each time.

- import a sprite sheet so the user can overlay the effect in browser, and then combine the two layer and export them as a single sprite sheet.



### Status of the above — C

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
- **text bubble** ❌ not yet, and it's the odd one out: a bubble is a *stretched box with a tail*,
  not a particle — it needs a 9-slice primitive and a text layout pass. Doable, but it's a
  different kind of object than everything else in the tool. Worth talking about.
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
- **APNG export** — M. Full alpha *and* animated; the honest answer to GIF's fringing. Pure chunk
  surgery on `toBlob` output (acTL/fcTL/fdAT), no encoder needed.
- **Trim + pivot metadata** — M. Per-frame bounding boxes so engines can use a trimmed atlas, plus
  a pivot point. This is the single most requested thing in every sprite tool's issue tracker.
- **Engine sidecars** — S each, and they're what make a tool feel "for me": Godot `SpriteFrames`
  `.tres`, Aseprite JSON-hash, Phaser/PixiJS atlas JSON, Unity sheet `.meta`, GameMaker.
- **Multi-resolution export in one go** — S. Ship 32/64/128 variants of the same effect. Nearly
  free given simulate/rasterize are split — one sim, three rasterizes.
- **Emissive / glow mask as a second sheet** — M. Lit 2D games want the bloom channel separately
  instead of baked in. We already compute the >threshold mask inside the glow pass.
- **Normal map from the sprite** — L, speculative, but a genuine differentiator: nobody generates
  normals for VFX sprites. Probably only meaningful for smoke/debris, not additive fire.
- **Drag-out to Aseprite / the engine** — S [port]. The tauri-plugin-drag path already works for
  WAVs; swap the payload for a sheet PNG.
- **Copy sheet to clipboard as PNG** — S. Underrated: straight into Aseprite/Photoshop, no file.
- **Batch export the whole library** — S [port]. "Export all presets" exists in SFX.
- **Power-of-two padding toggle** — S. Old engines and some mobile pipelines still need it.

## Authoring & editing — C

- **Color ramp editor** — M. The strongest single upgrade to the tool's expressive range. `hue` +
  `hueLife` is a 2-stop ramp with no control over the middle; real VFX artists think in gradients
  (white → yellow → orange → dark red → smoke grey). A 3–5 stop ramp with alpha per stop would
  replace four params with one control that does more.
- **Curve editor for size/alpha over life** — M. Same argument: `grow`/`fadeIn`/`fadeOut`/
  `alphaCurve` are four sliders approximating one curve. Ties in with the ramp editor — one
  "over lifetime" panel.
- **Reference underlay** — S, high payoff per hour. Drop a character sprite behind the preview to
  judge scale and read. Artists eyeball this constantly and currently can't.
- **Pixel-grid overlay + safe-frame guides** — S. Matters the moment you're working at 32/48px.
- **Custom drawn particle sprite** — M [port]. `SHAPES[8]` is reserved for it. Reuses the
  CrunchySFX paint canvas + base64-in-patch trick wholesale.
- **Import a PNG as the particle** — S. `SHAPES[9]`, mirrors the WAV import. Instantly makes the
  tool work for someone's existing art — leaves, coins, runes, their own smoke puff.
- **Undo / redo** — S [port].
- **My Presets + custom categories** — M [port]. Includes the pointer-based drag-to-organize that
  was verified working in WebKitGTK.
- **Share links** — S [port]. Whole effect in a URL; the growth mechanism that worked for SFX.
- **A/B compare** — S. Hold a second patch and toggle between them in the preview.

## Procedural & generative — C

- **"Match the sound"** — M, and it's the *suite's* killer feature. Paste a CrunchySFX share link
  and derive a starting VFX patch from it: sound duration → effect duration, noise → particle
  count, boom → flash + shockwave, pitch sweep → speed, bitcrush/downsample → pixelate/posterize.
  It won't be perfect and it doesn't need to be — it's the thing that makes the bundle make sense,
  and no competitor can copy it without shipping both halves.
- **Console styles** — S [port]. The `CONSOLES` pattern: NES / GB / GBA / PS1 / Modern buttons
  that clamp resolution, framerate, palette size and dither in one click. This is the crunchy
  brand in a button, and it's just a patch per style.
- **Import a palette** (.hex / .gpl / Lospec) and quantize to it — M. Pixel artists work *inside*
  a fixed palette; "make this effect use my 16 colours" is a genuine unlock and the posterize
  machinery is already there.
- **Foundry** — M [port]. Generate original effects, keep the ones you like, export as a pack.
- **Breed / variations** — M [port]. "Give me 8 variations of this hit spark" is exactly how
  people use VFX — you want a family, not one sprite.

## Simulation — C

- **Sub-emitters** (particles spawn particles on death) — M. Fireworks, sparks off debris, smoke
  from embers. The single biggest expressive jump the sim could make.
- **Per-particle flipbook** — M. Each particle plays its own small animation. This is how real
  smoke/explosion sheets are made and would let imported sprite strips work as particles.
- **Curl noise** — S. Divergence-free turbulence looks dramatically more like fluid than the
  current value-noise force. Cheap swap in the same slot.
- **Attractors / repulsors** — S. Implosions, vortex pulls, magic gathering inward.
- **Ground collision + bounce** — M. Deferred once already; the first param implying a *scene*.
- **Frost/crystal growth primitive** — M. Covers Alex's "ice": a shape that extends outward from a
  seed instead of travelling. Also gives cracks, vines, web, lightning-on-glass.

## Quality of life — C

- **Render in a Web Worker** — M. At 3000 particles the UI stutters on a slider drag. The
  simulate/rasterize split makes this clean to move off-thread.
- **Ping-pong loop preview** — S.
- **"Prep for GIF" button** — S. Sets alphaCut/posterize/fps to GIF-friendly values in one click.
- **Sheet-size warning** — S. Tell people a 60fps × 3s × 256px effect is a 14×14 grid *before*
  they export it.

---

## If I had to pick five — C

1. **GIF89a** — the last thing standing between "neat" and "usable by anyone."
2. **Share links** [port] — nearly free, and it's how SFX found its audience.
3. **Color ramp + over-lifetime curves** — the biggest jump in what the tool can *express*, and it
   simplifies the param list rather than growing it.
4. **"Match the sound"** — the reason the two apps are one product.
5. **Import a PNG as the particle** — the cheapest possible route to "this tool works with my art."

Deliberately *not* in my five: normal maps, collision, sub-emitters. All good; none of them change
who can use the tool tomorrow.

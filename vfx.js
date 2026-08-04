"use strict";
// CrunchyVFX — the render core. Pure functions: no app state, no DOM lookups.
// The sibling of CrunchySFX's dsp.js — index.html holds `state` and the UI, this file turns a
// patch into frames.
//
// The one structural idea worth knowing before reading: SIMULATION IS SPLIT FROM RASTERIZATION.
// simulate() produces a table of particle states per frame; rasterize() turns one of those into
// pixels. That split is what makes "Fit" (measure the bounding box across every frame, then
// scale) possible, and it means changing the frame size or any Crunch/Glow knob re-rasterizes
// without re-simulating.

// ---------- domain enums ----------
// The render core owns these; index.html builds PARAMS from them (SHAPES is the WAVES analog).
// Indices are part of the patch format — APPEND ONLY, never reorder, or every saved preset and
// share link shifts under us.
//
// SHAPES itself lives in shapes.js, alongside the drawings — see the header there before adding
// one. It is a global from a sibling classic script loaded ahead of this file.
const EMITTERS = ["burst", "cone", "ring", "disc", "line", "spiral", "box"];
const BLENDS   = ["additive", "alpha", "screen"];
// Layer B's blend list is the same three with a "follow Layer A" default in front, so a preset that
// never touches it behaves exactly as it did before Layer B had its own blend.
const B_BLENDS = ["match Layer A"].concat(BLENDS);
const SIZES    = ["32", "48", "64", "96", "128", "192", "256"];

// ---------- constants ----------
const P_STRIDE = 14;       // one particle per stride in the per-frame Float32Array
const P_X = 0, P_Y = 1, P_SIZE = 2, P_ANG = 3, P_ALPHA = 4;
const P_HUE = 5, P_WHITE = 6, P_KIND = 7, P_VX = 8, P_VY = 9;
// Colour is resolved at SIMULATE time, not draw time: with a ramp, hue/sat/light are a function
// of the particle's own life fraction, which the frame table doesn't otherwise carry.
const P_SAT = 10, P_LIGHT = 11;
// Flipbook frame for the imported-sprite shape: which cell of the strip this particle is showing.
const P_FRAME = 12;
// Stable identity. The per-frame table packs only the ALIVE particles, so a given particle's index
// moves around between frames — without an id there's no way to ask "where was this same particle
// last frame", which is exactly what a path trail needs.
const P_ID = 13;
const K_PART = 0, K_FLASH = 1, K_WAVE = 2, K_PART2 = 3;   // P_KIND values

const SUB = 2;                 // simulation substeps per frame — keeps motion stable at 8 fps
const MAX_FRAMES = 120;        // hard cap (3 s @ 60 fps would be 180; the sheet gets silly first)
const MAX_PARTS = 6000;        // hard cap across all shots
const SPRITE_PX = 64;          // master sprite resolution; particles draw scaled from this
// Sprite-cache quantization. Every distinct (shape, hue, sat, light) is one cached 64px canvas,
// so these multiply — kept coarse enough that a patch builds a few dozen sprites, not hundreds.
const HUE_STEPS = 24;
const SAT_STEPS = 5;
const LIGHT_STEPS = 6;

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Custom drawn sprite (shape 8): a 16×16 ALPHA grid, base64'd into the patch so it travels in
// share links and saved effects — the 2D cousin of CrunchySFX's drawn wavetable. Alpha only: the
// tint pass colours it, so it responds to Hue/palettes like every other shape.
const CUSTOM_SPRITE_N = 16;
function decodeSpriteAlpha(b64) {
  if (!b64) return null;
  try {
    const s = atob(b64);
    if (s.length !== CUSTOM_SPRITE_N * CUSTOM_SPRITE_N) return null;
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  } catch (e) { return null; }
}
function encodeSpriteAlpha(arr) {
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
// Imported PNG particle (shape 9). Declared HERE rather than in index.html so it's initialized
// before any render can reach it; index.html assigns to it when the user loads a file.
let imageSpriteEl = null;
let imageSpriteVersion = 0;   // bumped on load so the sprite cache knows to rebuild

// ---------- determinism ----------
// Every random draw is a HASH of (seed, particle index, salt) rather than the next value from a
// running generator. That matters more than it looks: with a running LCG, nudging `count` would
// reshuffle every existing particle, so the count slider would scramble the effect instead of
// growing it. Hashed, particle i is the same particle no matter how many siblings it has.
function hash32(a) {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
  return t >>> 0;
}
// 0..1 for (particle i, salt) under `seed`
function rnd(seed, i, salt) {
  return hash32(hash32(Math.imul(i, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)) ^ Math.imul(salt, 0xc2b2ae35)) / 4294967296;
}
const rndS = (seed, i, salt) => rnd(seed, i, salt) * 2 - 1;   // -1..1

// Stateless value noise on an integer lattice, trilinear in (x, y, t) — used for turbulence.
// Stateless is the point: a particle's turbulence doesn't depend on how many substeps ran.
function lerp(a, b, k) { return a + (b - a) * k; }
function fade(t) { return t * t * (3 - 2 * t); }
function latt(seed, x, y, z) { return rnd(seed, Math.imul(x, 73856093) ^ Math.imul(y, 19349663), z) * 2 - 1; }
function vnoise(seed, x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c = (dx, dy, dz) => latt(seed, xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf), x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf), x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

// The particle-shape SET: the primary shape plus any extras the picker added, carried as a
// comma-joined index list in `shapeMix`. Derived rather than stored as a single list because
// `shape` is an index in every preset, share link and saved effect — the primary has to keep
// meaning exactly what it always meant, so a patch with no mix renders bit-identically to before.
//
// Entries are validated here rather than trusted: a patch is written straight into `state` without
// passing a slider, so junk, duplicates and out-of-range indices arrive at this function. Dropping
// them beats drawing the wrong particle, which is the failure that looks like a working preset.
function shapeSet(primary, mix) {
  let p = Math.round(primary);
  if (!isFinite(p)) p = 0;
  const out = [Math.max(0, Math.min(SHAPES.length - 1, p))];
  if (!mix) return out;
  for (const part of String(mix).split(",")) {
    const i = Math.round(parseFloat(part));
    if (!isFinite(i) || i < 0 || i >= SHAPES.length || out.indexOf(i) >= 0) continue;
    out.push(i);
  }
  return out;
}

// Per-layer start delays, keyed by the PARAMS group name so a row in the Timing panel and a panel
// header say the same word. Carried as one string ("Shockwave:0.05,Growth:0.2") rather than ~25 new
// PARAMS rows, which would have added a slider to every layer panel to express one idea.
//
// Empty is the neutral default: everything starts at 0, exactly as it did before this existed.
// Values are clamped to the duration ceiling — a delay longer than any clip means a layer that
// simply never appears, which looks like a broken effect rather than a setting.
function parseLayerDelays(str) {
  const out = {};
  if (!str) return out;
  for (const part of String(str).split(",")) {
    const i = part.lastIndexOf(":");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = parseFloat(part.slice(i + 1));
    if (!k || !isFinite(v) || v <= 0) continue;      // 0 is the default; storing it just bloats
    out[k] = Math.max(0, Math.min(MAX_DELAY, v));
  }
  return out;
}
const MAX_DELAY = 3;        // the duration ceiling — past this nothing could ever be seen

// A standalone shape list — no primary — for a layer that carries its OWN selection rather than
// borrowing the emitter's. Empty is the neutral default and means "inherit", which is what keeps
// adding one from changing any effect that never set it. Same validation as shapeSet's extras:
// junk and out-of-range entries are dropped rather than drawn.
function shapeList(str) {
  const out = [];
  if (!str) return out;
  for (const part of String(str).split(",")) {
    const i = Math.round(parseFloat(part));
    if (!isFinite(i) || i < 0 || i >= SHAPES.length || out.indexOf(i) >= 0) continue;
    out.push(i);
  }
  return out;
}

// ---------- simulation ----------
// Returns { frames: [Float32Array], counts: Int32Array, bbox, nFrames, fps, fs }.
// World units are pixels at the patch's NOMINAL frame size (st.frameSize); rasterize() scales.
// Where a particle is born and which way it is thrown. Extracted so the second emitter uses the
// SAME seven geometries as the first — two copies of this switch would drift the moment anyone
// added an emitter shape.
function emitPlace(kind, seed, g, i, n, cx, cy, emitR, baseDir, spreadR) {
  let ang, sx = cx, sy = cy;
  const u1 = rnd(seed, g, 7), u2 = rnd(seed, g, 8);
  switch (kind) {
    case 1:   // cone — a directed spray
      ang = baseDir + spreadR * (u1 - 0.5);
      break;
    case 2:   // ring — born on a circle, thrown outward
      ang = u1 * Math.PI * 2;
      sx += Math.cos(ang) * emitR; sy += Math.sin(ang) * emitR;
      break;
    case 3: { // disc — born anywhere inside a circle, thrown outward
      const a = u1 * Math.PI * 2, r = Math.sqrt(u2) * emitR;
      sx += Math.cos(a) * r; sy += Math.sin(a) * r;
      ang = a;
      break;
    }
    case 4:   // line — a horizontal bar (rain, ground dust)
      sx += (u1 - 0.5) * 2 * emitR;
      ang = baseDir + spreadR * (u2 - 0.5);
      break;
    case 5: { // spiral — golden-angle placement, outward. Reads as swirl even before `swirl`.
      const a = i * 2.39996323, r = (i / Math.max(1, n - 1)) * emitR;
      sx += Math.cos(a) * r; sy += Math.sin(a) * r;
      ang = a;
      break;
    }
    case 6:   // box — a square patch
      sx += (u1 - 0.5) * 2 * emitR; sy += (u2 - 0.5) * 2 * emitR;
      ang = baseDir + spreadR * (rnd(seed, g, 9) - 0.5);
      break;
    default:  // 0 burst — omnidirectional, optionally off a ring
      ang = u1 * Math.PI * 2;
      sx += Math.cos(ang) * emitR; sy += Math.sin(ang) * emitR;
  }
  return { x: sx, y: sy, ang: ang };
}

// Layer B's fade envelope. Mirrors lifeAlpha() but reads emit2* — kept separate rather than
// parameterising lifeAlpha, because that one is called for every particle of the main population
// on every frame and is worth leaving branch-free.
function layerBAlpha(st, u) {
  const fi = st.emit2FadeIn, fo = st.emit2FadeOut;
  let a = 1;
  if (fi > 0 && u < fi) a = u / fi;
  if (fo > 0 && u > 1 - fo) a = Math.min(a, (1 - u) / fo);
  return clamp01(a) * st.emit2Opacity;
}

function simulate(st) {
  const fs = frameSizePx(st);
  const fps = Math.max(1, Math.round(st.fps));
  const dur = st.duration;
  const nFrames = Math.max(1, Math.min(MAX_FRAMES, Math.round(dur * fps)));
  const dt = 1 / (fps * SUB);
  const seed = Math.max(1, Math.round(st.seed)) | 0;

  // Shots: the whole burst re-fires `shots` times, each smaller and nudged off-centre. One loop
  // around the emitter, not a second engine.
  const shots = Math.max(1, Math.round(st.shots));
  const perShot = Math.min(MAX_PARTS, Math.max(1, Math.round(st.count)));
  const parents = Math.min(MAX_PARTS, perShot * shots);
  // Sub-emitter: each parent spawns `subCount` children AS IT DIES — fireworks, sparks off
  // debris, smoke from embers. Children live in the same arrays after the parents, so the whole
  // integrator works on them unchanged; they're just born later. One generation only: children
  // never spawn grandchildren, which would be an unbounded population.
  const subN = Math.max(0, Math.round(st.subCount));
  // Layer B: a SECOND, INDEPENDENT population — its own shape, emitter, motion, colour and
  // timing. Not the sub-emitter, which spawns children FROM dying parents and inherits their
  // position and velocity. This is "fire AND smoke", where sub-emitter is "embers OFF the fire".
  //
  // They live in the same arrays after the parents and their children, so the integrator, the
  // frame-table writer and every downstream consumer work on them unchanged — the only thing that
  // distinguishes them is `pgen === 2`, and that drives a handful of branches rather than a
  // second copy of the loop.
  const bN = Math.max(0, Math.round(st.emit2Count || 0));
  const subTotal = parents * (1 + subN);
  const total = Math.min(MAX_PARTS, subTotal + bN);
  const bBase = Math.min(subTotal, total);            // where layer B starts, after any clamp
  const bCount = total - bBase;

  const ox = st.originX * fs, oy = st.originY * fs;
  const emitR = st.emitRadius * fs;
  const emitTime = st.emitTime * dur;
  const emitter = Math.round(st.emitter);
  const spreadR = st.emitSpread * DEG;
  const baseDir = (st.emitAngle - 90) * DEG;   // 0° = up, clockwise (what people expect)

  // per-particle mutable state
  const px = new Float32Array(total), py = new Float32Array(total);
  const vx = new Float32Array(total), vy = new Float32Array(total);
  const pang = new Float32Array(total), pspin = new Float32Array(total);
  const plife = new Float32Array(total), pbirth = new Float32Array(total);
  const psize = new Float32Array(total), phue = new Float32Array(total);
  const alive = new Uint8Array(total), born = new Uint8Array(total);
  const pgen = new Uint8Array(total);          // 0 = parent, 1 = child

  // birth schedule + per-particle constants (all hashed, so they never depend on order)
  // Children are born on a parent's death, so park their birth beyond the end of time — otherwise
  // the "spawn everything due by now" sweep would hatch them all at t = 0.
  if (subN > 0) {
    pbirth.fill(Infinity, parents, subTotal);
    for (let i = parents; i < subTotal; i++) pgen[i] = 1;
  }
  for (let i = bBase; i < total; i++) pgen[i] = 2;
  for (let g = 0; g < parents; g++) {
    const k = Math.floor(g / perShot);           // which shot
    const i = g % perShot;                       // index within the shot
    const shotScale = Math.pow(st.shotScale, k);
    const t0 = k * st.shotDelay;
    pbirth[g] = t0 + (emitTime > 0 ? rnd(seed, g, 1) * emitTime : 0);
    plife[g] = Math.max(0.02, st.life * (1 + st.lifeVar * rndS(seed, g, 2)));
    psize[g] = Math.max(0.5, st.size * shotScale * (1 + st.sizeVar * rndS(seed, g, 3)));
    phue[g] = st.hue + st.hueVar * 180 * rndS(seed, g, 4);
    pspin[g] = (st.spin * (1 + st.spinVar * rndS(seed, g, 5))) * DEG;
    pang[g] = st.angle * DEG + st.angleVar * rnd(seed, g, 6) * Math.PI * 2;

    // Shots after the first are nudged off-centre so a burst doesn't fire three times from the
    // exact same spot.
    const jx = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 21) : 0;
    const jy = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 22) : 0;
    const place = emitPlace(emitter, seed, g, i, perShot, ox + jx, oy + jy,
                            emitR, baseDir, spreadR);
    const ang = place.ang, sx = place.x, sy = place.y;
    const sp = st.speed * shotScale * (1 + st.speedVar * rndS(seed, g, 10));
    px[g] = sx; py[g] = sy;
    vx[g] = Math.cos(ang) * sp; vy[g] = Math.sin(ang) * sp;
  }

  // Layer B's own births. Same hashed-draw discipline as the main emitter (distinct salts so the
  // two populations don't correlate), its own geometry, and its own timing — `emit2Delay` is what
  // lets smoke start after the fire that caused it.
  if (bCount > 0) {
    const b2R = st.emit2Radius * fs;
    const b2Spread = st.emit2Spread * DEG;
    const b2Over = st.emit2Over * dur;
    const b2Emitter = Math.round(st.emit2Emitter);
    const b2Dir = (st.emit2Angle - 90) * DEG;    // its own aim — B is not a child of A
    for (let n2 = 0; n2 < bCount; n2++) {
      const g = bBase + n2;
      pbirth[g] = st.emit2Delay + (b2Over > 0 ? rnd(seed, g, 61) * b2Over : 0);
      plife[g] = Math.max(0.02, st.emit2Life * (1 + st.emit2LifeVar * rndS(seed, g, 62)));
      psize[g] = Math.max(0.5, st.emit2Size * (1 + st.emit2SizeVar * rndS(seed, g, 63)));
      phue[g] = st.emit2Hue + st.hueVar * 180 * rndS(seed, g, 64);
      pspin[g] = (st.spin * (1 + st.spinVar * rndS(seed, g, 65))) * DEG;
      pang[g] = st.angle * DEG + st.angleVar * rnd(seed, g, 66) * Math.PI * 2;
      const place = emitPlace(b2Emitter, seed, g, n2, bCount, ox, oy, b2R, b2Dir, b2Spread);
      const sp = st.emit2Speed * (1 + st.emit2SpeedVar * rndS(seed, g, 67));
      px[g] = place.x; py[g] = place.y;
      vx[g] = Math.cos(place.ang) * sp; vy[g] = Math.sin(place.ang) * sp;
    }
  }

  const frames = new Array(nFrames);
  const counts = new Int32Array(nFrames);
  const scratch = new Float32Array((total + 2 * shots) * P_STRIDE);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;

  const ramp = parseRamp(st.ramp);
  // The imported sprite can be one member of a mixed set rather than the primary shape, so ask the
  // whole set — keying off `shape` alone froze a mixed-in animated sprite on cell 0.
  const flipCells = shapeSet(st.shape, st.shapeMix).indexOf(9) >= 0
    ? Math.max(1, Math.round(st.imgCols)) * Math.max(1, Math.round(st.imgRows)) : 1;
  // Ground plane. `bounce` at 0 is the off switch — no collision test runs at all — so this costs
  // nothing for the 90% of effects that happen in mid-air.
  const bounceOn = st.bounce > 0;
  const groundPx = st.groundY * fs;
  const dragK = st.drag * 6;
  const turb = st.turb, turbScale = Math.max(0.01, st.turbScale), turbSpeed = st.turbSpeed;
  const nSteps = nFrames * SUB;

  for (let s = 0; s <= nSteps; s++) {
    const t = s * dt;
    // spawn everything due by now
    for (let g = 0; g < total; g++) {
      if (!born[g] && pbirth[g] <= t) { born[g] = 1; alive[g] = 1; }
    }

    // snapshot at each frame boundary (before integrating, so frame 0 is the birth instant)
    if (s % SUB === 0 && (s / SUB) < nFrames) {
      const f = s / SUB;
      let n = 0;
      for (let g = 0; g < total; g++) {
        if (!alive[g]) continue;
        const age = t - pbirth[g];
        const u = clamp01(age / plife[g]);
        const o = n * P_STRIDE;
        // `grow` stays the simple linear control; a ramp's size channel multiplies on top, so
        // turning the ramp on never silently discards the grow value you already set.
        const rampZ = ramp ? sampleRamp(ramp, u).z : 1;
        const bLayer = pgen[g] === 2;
        const size = Math.max(0.1, psize[g] * (1 + (bLayer ? st.emit2Grow : st.grow) * u) * rampZ);
        scratch[o + P_X] = px[g]; scratch[o + P_Y] = py[g];
        scratch[o + P_SIZE] = size;
        scratch[o + P_ANG] = pang[g];
        if (ramp) {
          // With a ramp the gradient owns hue/sat/light; hueVar still jitters per particle and
          // the fade envelope still multiplies, so the ramp is a colour curve, not a replacement
          // for the envelope.
          const c = sampleRamp(ramp, u);
          scratch[o + P_HUE] = c.h + (phue[g] - st.hue);
          scratch[o + P_SAT] = c.s;
          scratch[o + P_LIGHT] = clamp01(c.l * st.bright);
          scratch[o + P_ALPHA] = lifeAlpha(st, u) * c.a;
          scratch[o + P_WHITE] = 0;
        } else if (bLayer) {
          // Layer B is deliberately NOT given a hot core: it exists to sit behind or around the
          // main population (smoke, dust, mist), and a white-hot core would make it compete.
          scratch[o + P_HUE] = phue[g] + st.hueLife * u;
          scratch[o + P_WHITE] = 0;
          scratch[o + P_SAT] = st.emit2Sat;
          scratch[o + P_LIGHT] = clamp01(st.emit2Bright);
          scratch[o + P_ALPHA] = layerBAlpha(st, u);
        } else {
          const white = st.coreWhite * (1 - u) * (1 - u);
          scratch[o + P_HUE] = phue[g] + st.hueLife * u;
          scratch[o + P_WHITE] = white;
          scratch[o + P_SAT] = st.sat * (1 - white * 0.85);
          scratch[o + P_LIGHT] = clamp01(st.bright * (0.5 + 0.5 * white));
          scratch[o + P_ALPHA] = lifeAlpha(st, u);
        }
        scratch[o + P_KIND] = bLayer ? K_PART2 : K_PART;
        scratch[o + P_ID] = g;
        // Flipbook cell from the particle's own life fraction. `imgLoops` runs the strip more than
        // once per lifetime; `imgStagger` offsets each particle so a hundred sprites don't play in
        // lockstep, which reads as one flickering object rather than a hundred separate ones.
        scratch[o + P_FRAME] = flipCells > 1
          ? Math.floor(u * st.imgLoops * flipCells + rnd(seed, g, 47) * st.imgStagger * flipCells) % flipCells
          : 0;
        scratch[o + P_VX] = vx[g]; scratch[o + P_VY] = vy[g];
        n++;
        if (scratch[o + P_ALPHA] > 0.02) {
          const r = size * 0.5;
          if (px[g] - r < bx0) bx0 = px[g] - r;
          if (px[g] + r > bx1) bx1 = px[g] + r;
          if (py[g] - r < by0) by0 = py[g] - r;
          if (py[g] + r > by1) by1 = py[g] + r;
        }
      }
      // the two extra layers are analytic — no integration, just "what does it look like at t"
      for (let k = 0; k < shots; k++) {
        const simDelays = parseLayerDelays(st.layerDelay);
        const t0 = k * st.shotDelay, sc = Math.pow(st.shotScale, k);
        const jx = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 21) : 0;
        const jy = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 22) : 0;
        if (st.flash > 0) {
          const u = (t - t0 - (simDelays.Flash || 0)) / st.flashLife;
          if (u >= 0 && u < 1) {
            const o = n * P_STRIDE;
            scratch[o + P_X] = ox + jx; scratch[o + P_Y] = oy + jy;
            scratch[o + P_SIZE] = fs * st.flashSize * sc * (0.4 + 0.6 * Math.sqrt(u));
            scratch[o + P_ANG] = 0;
            scratch[o + P_ALPHA] = st.flash * (1 - u) * (1 - u);
            scratch[o + P_HUE] = st.hue + st.hueLife * u;
            scratch[o + P_WHITE] = 0.85;
            scratch[o + P_SAT] = st.sat * 0.15;
            scratch[o + P_LIGHT] = clamp01(st.bright * 0.93);
            scratch[o + P_KIND] = K_FLASH;
            scratch[o + P_ID] = -1;
            scratch[o + P_VX] = 0; scratch[o + P_VY] = 0;
            n++;
          }
        }
        if (st.wave > 0) {
          const u = (t - t0 - (simDelays.Shockwave || 0)) / st.waveLife;
          if (u >= 0 && u < 1) {
            const o = n * P_STRIDE;
            // half the frame at waveSpeed 1 → the ring exactly reaches the edge, never past it
            const r = fs * 0.5 * st.waveSpeed * sc * u;
            scratch[o + P_X] = ox + jx; scratch[o + P_Y] = oy + jy;
            scratch[o + P_SIZE] = r * 2;
            scratch[o + P_ANG] = 0;
            scratch[o + P_ALPHA] = st.wave * (1 - u);
            const ww = 0.4 * (1 - u);
            scratch[o + P_HUE] = st.hue + st.hueLife * u;
            scratch[o + P_WHITE] = ww;
            scratch[o + P_SAT] = st.sat * (1 - ww * 0.85);
            scratch[o + P_LIGHT] = clamp01(st.bright * (0.5 + 0.5 * ww));
            scratch[o + P_KIND] = K_WAVE;
            scratch[o + P_ID] = -1;
            scratch[o + P_VX] = 0; scratch[o + P_VY] = 0;
            n++;
            if (r > 1) {
              if (ox - r < bx0) bx0 = ox - r;
              if (ox + r > bx1) bx1 = ox + r;
              if (oy - r * (1 - st.waveSquash) < by0) by0 = oy - r * (1 - st.waveSquash);
              if (oy + r * (1 - st.waveSquash) > by1) by1 = oy + r * (1 - st.waveSquash);
            }
          }
        }
      }
      counts[f] = n;
      frames[f] = scratch.slice(0, n * P_STRIDE);
    }

    if (s === nSteps) break;

    // integrate
    for (let g = 0; g < total; g++) {
      if (!alive[g]) continue;
      const age = t - pbirth[g];
      if (age >= plife[g]) {
        alive[g] = 0;
        if (subN > 0 && pgen[g] === 0) {
          const spreadC = st.subSpread * DEG;
          for (let j = 0; j < subN; j++) {
            const c = parents + g * subN + j;
            if (c >= total) break;                       // hit the population cap
            const ang = rnd(seed, c, 41) * spreadC + (spreadC < Math.PI * 2 ? Math.atan2(vy[g], vx[g]) - spreadC / 2 : 0);
            const sp = st.subSpeed * (1 + st.speedVar * rndS(seed, c, 42));
            px[c] = px[g]; py[c] = py[g];
            vx[c] = vx[g] * st.subInherit + Math.cos(ang) * sp;
            vy[c] = vy[g] * st.subInherit + Math.sin(ang) * sp;
            plife[c] = Math.max(0.02, st.subLife * (1 + st.lifeVar * rndS(seed, c, 43)));
            psize[c] = Math.max(0.5, psize[g] * st.subSize * (1 + st.sizeVar * rndS(seed, c, 44)));
            phue[c] = phue[g] + st.hueVar * 90 * rndS(seed, c, 45);
            pspin[c] = pspin[g];
            pang[c] = st.angle * DEG + st.angleVar * rnd(seed, c, 46) * Math.PI * 2;
            pbirth[c] = t;
            born[c] = 1; alive[c] = 1;
          }
        }
        continue;
      }
      // Layer B has its own gravity and drag — smoke rising off a fire that falls is the whole
      // point. Everything else (wind, radial, swirl, turbulence) is shared, because those read as
      // properties of the SCENE rather than of one population.
      const isB = pgen[g] === 2;
      let ax = st.wind, ay = isB ? st.emit2Gravity : st.gravity;
      if (st.radial || st.swirl) {
        const dx = px[g] - ox, dy = py[g] - oy;
        const d = Math.hypot(dx, dy) || 1e-3;
        ax += (dx / d) * st.radial - (dy / d) * st.swirl;
        ay += (dy / d) * st.radial + (dx / d) * st.swirl;
      }
      if (turb > 0) {
        const nx = px[g] / (fs / turbScale), ny = py[g] / (fs / turbScale), nt = t * turbSpeed;
        if (st.turbCurl > 0) {
          // Curl of a scalar noise field: (∂N/∂y, −∂N/∂x). Divergence-free, so particles swirl
          // around each other instead of piling into the field's sources and sinks — the reason
          // plain value noise reads as "jittery" and curl reads as "fluid".
          const e = 0.35;
          const dNdy = (vnoise(seed, nx, ny + e, nt) - vnoise(seed, nx, ny - e, nt)) / (2 * e);
          const dNdx = (vnoise(seed, nx + e, ny, nt) - vnoise(seed, nx - e, ny, nt)) / (2 * e);
          const k = st.turbCurl;
          ax += (dNdy * k + vnoise(seed, nx, ny, nt) * (1 - k)) * turb * 900;
          ay += (-dNdx * k + vnoise(seed + 7717, nx, ny, nt) * (1 - k)) * turb * 900;
        } else {
          ax += vnoise(seed, nx, ny, nt) * turb * 900;
          ay += vnoise(seed + 7717, nx, ny, nt) * turb * 900;
        }
      }
      // Point attractor / repulsor. Unlike `radial`, which always works from the emitter, this is
      // an arbitrary point — a black hole to fall into, or a wind source to be blown away from.
      if (st.attract !== 0) {
        const dx = st.attractX * fs - px[g], dy = st.attractY * fs - py[g];
        const d = Math.hypot(dx, dy) || 1e-3;
        // falloff 0 = constant pull at any distance, 1 = inverse-square-ish (only bites up close)
        const near = fs * 0.5;
        const fall = 1 / (1 + st.attractFalloff * (d / near) * (d / near) * 8);
        ax += (dx / d) * st.attract * fall;
        ay += (dy / d) * st.attract * fall;
      }
      vx[g] += ax * dt; vy[g] += ay * dt;
      const damp = 1 - (isB ? st.emit2Drag * 6 : dragK) * dt;
      vx[g] *= damp; vy[g] *= damp;
      px[g] += vx[g] * dt; py[g] += vy[g] * dt;
      pang[g] += pspin[g] * dt;
      // Floor: reflect, lose energy, and scrub horizontal speed against the ground. Settling to a
      // stop matters as much as the bounce — debris that slides forever reads as ice.
      if (bounceOn && py[g] > groundPx && vy[g] > 0) {
        py[g] = groundPx;
        vy[g] = -vy[g] * st.bounce;
        vx[g] *= 1 - st.friction;
        pspin[g] *= 1 - st.friction;
        if (Math.abs(vy[g]) < 8) vy[g] = 0;          // stop micro-bouncing on the last few pixels
      }
    }
  }

  // The structure layers aren't in the particle table, so widen the box by their reach —
  // otherwise Fit scales to the particles alone and crops the beam or the frost clean off.
  if (st.growth > 0 || st.beam > 0 || st.ribbon > 0 || st.vortex > 0 || st.arc > 0 ||
      st.shatter > 0 || st.lines > 0 || st.ripple > 0) {
    const reach = Math.max(
      st.growth > 0 ? st.growLen * fs : 0,
      st.beam > 0 ? st.beamLen * fs : 0,
      st.ribbon > 0 ? (st.ribbonRadius * fs + st.ribbonWidth) : 0,
      st.vortex > 0 ? (st.vortexRadius * fs + st.vortexWidth) : 0,
      st.arc > 0 ? Math.hypot(st.arcToX - st.originX, st.arcToY - st.originY) * fs : 0,
      st.shatter > 0 ? (st.shatterRadius * fs + st.shatterSpeed * st.duration * 0.5) : 0,
      st.lines > 0 ? st.lineOuter * fs : 0,
      st.ripple > 0 ? st.rippleSpeed * fs * 0.5 : 0);
    bx0 = Math.min(bx0, ox - reach); bx1 = Math.max(bx1, ox + reach);
    by0 = Math.min(by0, oy - reach); by1 = Math.max(by1, oy + reach);
  }
  if (!isFinite(bx0)) { bx0 = by0 = 0; bx1 = by1 = fs; }
  return { frames, counts, nFrames, fps, fs, bbox: { x0: bx0, y0: by0, x1: bx1, y1: by1 } };
}

// ---------- colour ramp ----------
// An optional multi-stop gradient over particle lifetime, stored as "p,h,s,l,a|…" in the patch.
// Empty string = off, and the classic hue / hueLife / coreWhite path runs instead — so every
// existing preset and share link is untouched.
let rampCacheSrc = null, rampCacheStops = null;
function parseRamp(src) {
  if (!src) return null;
  if (rampCacheSrc === src) return rampCacheStops;
  const stops = src.split("|").map((s) => {
    const n = s.split(",").map(Number);
    // 6th value is the size multiplier; ramps written before it existed have five and mean 1.
    return { p: n[0], h: n[1], s: n[2], l: n[3], a: n[4], z: Number.isFinite(n[5]) ? n[5] : 1 };
  }).filter((s) => Number.isFinite(s.p) && Number.isFinite(s.h)).sort((x, y) => x.p - y.p);
  rampCacheSrc = src;
  rampCacheStops = stops.length ? stops : null;
  return rampCacheStops;
}
function sampleRamp(stops, u) {
  if (u <= stops[0].p) return stops[0];
  const last = stops[stops.length - 1];
  if (u >= last.p) return last;
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    if (u > b.p) continue;
    const a = stops[i - 1];
    const k = (u - a.p) / Math.max(1e-6, b.p - a.p);
    // Interpolate hue the SHORT way round the wheel — otherwise red→magenta sweeps through the
    // entire spectrum and every ramp turns into a rainbow.
    let dh = b.h - a.h;
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    return { h: a.h + dh * k, s: a.s + (b.s - a.s) * k, l: a.l + (b.l - a.l) * k,
             a: a.a + (b.a - a.a) * k, z: a.z + (b.z - a.z) * k };
  }
  return last;
}

// fade-in / fade-out with a linear→exponential curve knob (the envCurve analog)
function lifeAlpha(st, u) {
  const fi = st.fadeIn, fo = st.fadeOut;
  let a = 1;
  if (fi > 0 && u < fi) a = u / fi;
  if (fo > 0 && u > 1 - fo) a = Math.min(a, (1 - u) / fo);
  a = clamp01(a);
  if (st.alphaCurve > 0) a = lerp(a, a * a * a, st.alphaCurve);
  return a * st.opacity;
}

function frameSizePx(st) {
  return +SIZES[Math.max(0, Math.min(SIZES.length - 1, Math.round(st.frameSize)))];
}

// The frame can be any width x height. `frameW`/`frameH` default to 0 meaning "square, at
// frameSize" — the schema's neutral-default rule — so every existing preset, share link and
// saved effect keeps its exact square frame without carrying the new keys.
function frameDims(st) {
  const sq = frameSizePx(st);
  const w = Math.max(8, Math.round(st.frameW > 0 ? st.frameW : sq));
  const h = Math.max(8, Math.round(st.frameH > 0 ? st.frameH : sq));
  return { w, h };
}

// The dimension every radius, speed and size is measured against. It is the SMALLER side on
// purpose: that's what makes a wider frame mean "more room around the same effect" rather than
// "a bigger effect". Widen a 512 square to 512x900 and the burst is untouched, with headroom
// added — which is what a non-square frame is for. Scaling by the larger side would silently
// inflate every effect the moment the frame stopped being square.
function frameRefPx(w, h) { return Math.min(w, h); }

// ---------- sprite cache ----------
// createRadialGradient per particle is THE performance trap here. Each shape is drawn once into
// a small canvas, tinted with source-in, and cached by (shape, hue step, white step) — every
// particle then costs one drawImage.
const spriteCache = new Map();
function spriteKey(shape, hi, si, li, st, frame) {
  // Whatever params change the drawing have to be in the key or the cache goes stale — each
  // shape declares its own in shapes.js, next to the drawing that reads them.
  const def = SHAPE_DEFS[shape];
  const extra = def && def.key ? def.key(st) : "";
  return shape + "|" + hi + "|" + si + "|" + li + "|" + frame + "|" + extra;
}
function clearSpriteCache() { spriteCache.clear(); }

function hsl(h, s, l) { return "hsl(" + (((h % 360) + 360) % 360) + "," + Math.round(clamp01(s) * 100) + "%," + Math.round(clamp01(l) * 100) + "%)"; }

// The same colour as RGB components, for the passes that write pixels directly rather than setting
// a fillStyle. Kept beside hsl() so the two can never disagree about what a colour means.
function hslParts(h, s, l) {
  const hh = ((((h % 360) + 360) % 360)) / 360, ss = clamp01(s), ll = clamp01(l);
  if (ss <= 0) { const v = Math.round(ll * 255); return [v, v, v]; }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const pp = 2 * ll - q;
  const ch = (t) => {
    if (t < 0) t += 1; else if (t > 1) t -= 1;
    if (t < 1 / 6) return pp + (q - pp) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6;
    return pp;
  };
  return [Math.round(ch(hh + 1 / 3) * 255), Math.round(ch(hh) * 255), Math.round(ch(hh - 1 / 3) * 255)];
}

function makeSprite(shape, hue, sat, lum, st, frame) {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE_PX;
  const g = c.getContext("2d");
  const R = SPRITE_PX / 2;
  // draw the shape in white/alpha first, then tint it in one source-in pass
  g.fillStyle = "#fff"; g.strokeStyle = "#fff";
  const def = SHAPE_DEFS[shape] || SHAPE_DEFS[0];   // out of range falls back to glow, as ever
  def.draw(g, R, st, frame);
  // Tint: one pass over whatever alpha we just drew, in the colour simulate() already resolved
  // (classic hue/coreWhite path or a ramp sample — makeSprite doesn't need to know which).
  // Shapes drawn in white take source-in (a flat repaint). The glyph and the imported PNG carry
  // their own colours, so they get source-atop at partial alpha — letting their tint slider fade
  // between "keep 🔥 / my artwork as drawn" and "treat it as a particle like any other".
  const tintAmt = def.ownColour ? clamp01(def.ownColour(st)) : 1;
  if (tintAmt > 0) {
    g.globalCompositeOperation = def.ownColour ? "source-atop" : "source-in";
    g.globalAlpha = tintAmt;
    g.fillStyle = hsl(hue, sat, lum);
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    g.globalAlpha = 1;
  }
  return c;
}

function getSprite(shape, hue, sat, light, st, frame) {
  const hi = Math.round((((hue % 360) + 360) % 360) / 360 * HUE_STEPS) % HUE_STEPS;
  const si = Math.round(clamp01(sat) * (SAT_STEPS - 1));
  const li = Math.round(clamp01(light) * (LIGHT_STEPS - 1));
  const fr = shape === 9 ? (frame | 0) : 0;      // only the flipbook varies per frame
  const key = spriteKey(shape, hi, si, li, st, fr);
  let s = spriteCache.get(key);
  if (!s) {
    s = makeSprite(shape, hi / HUE_STEPS * 360, si / (SAT_STEPS - 1), li / (LIGHT_STEPS - 1), st, fr);
    spriteCache.set(key, s);
  }
  return s;
}

// ---------- rasterization ----------
// Draw one frame's particle table onto a context. `xf` carries the world→canvas transform that
// Fit / scale worked out, so preview and export share one code path.
function drawFrame(sim, f, g, st, xf) {
  const arr = sim.frames[f], n = sim.counts[f];
  // Layer B gets its own blend, because the headline use case needs both at once: fire wants to be
  // additive and the smoke it throws off wants to be alpha. One global blend forces dark smoke
  // through "lighter", where it composites as a white blob instead of an occluder.
  const blendOpA = st.blend === 1 ? "source-over" : (st.blend === 2 ? "screen" : "lighter");
  const b2b = Math.round(st.emit2Blend || 0) - 1;   // -1 = follow Layer A
  const blendOpB = b2b < 0 ? blendOpA
                 : (b2b === 1 ? "source-over" : (b2b === 2 ? "screen" : "lighter"));
  let curOp = blendOpA;
  g.globalCompositeOperation = blendOpA;
  const shape = Math.round(st.shape);
  const shapeB = Math.round(st.emit2Shape || 0);
  // Each layer's selected shape set. Resolved per particle below, at DRAW time rather than in the
  // frame table: which sprite a particle wears doesn't affect its physics, so this costs no
  // per-particle storage and no stride bump.
  const setA = shapeSet(shape, st.shapeMix);
  const setB = shapeSet(shapeB, st.emit2ShapeMix);
  const trail = st.trail;
  // Function-scoped because the optical passes at the bottom need them too.
  const t = f / sim.fps, fs = sim.fs, seed = Math.max(1, Math.round(st.seed)) | 0;
  const ox = st.originX * fs * xf.k + xf.dx, oy = st.originY * fs * xf.k + xf.dy;
  // Structure layers draw first, so sparks and debris land on top of the beam/growth rather than
  // behind it. They share the blend mode, so an additive patch gets an additive beam.
  //
  // Every one of them is staged rather than called directly. Each already took `t` as an argument,
  // so a start delay is a shift AT THE CALL SITE — none of the twenty-odd draw functions had to
  // learn about timing, and a layer added later gets sequencing by being wrapped the same way.
  // Before its delay a layer is skipped entirely rather than drawn with a negative time: these
  // functions divide by their own life, and t < 0 would run them backwards from nowhere.
  const delays = parseLayerDelays(st.layerDelay);
  const stage = (name, fn) => {
    const d = delays[name] || 0;
    if (t >= d) fn(t - d);
  };
  {
    stage("Bokeh", (tt) => drawBokeh(g, st, tt, xf, fs, ox, oy, seed));
    stage("Droplets", (tt) => drawDroplets(g, st, tt, xf, fs, ox, oy, seed));
    stage("Twinkle", (tt) => drawTwinkle(g, st, tt, xf, fs, ox, oy, seed));
    stage("Decal", (tt) => drawDecal(g, st, tt, xf, fs, ox, oy));
    stage("Sweep", (tt) => drawSweep(g, st, tt, xf, fs, ox, oy));
    stage("Fracture", (tt) => drawFracture(g, st, tt, xf, fs, ox, oy, seed));
    stage("Drip", (tt) => drawDrip(g, st, tt, xf, fs, ox, oy, seed));
    stage("Tunnel", (tt) => drawTunnel(g, st, tt, xf, fs, ox, oy));
    stage("Growth", (tt) => drawGrowth(g, st, tt, xf, fs, ox, oy, seed));
    stage("Vortex", (tt) => drawVortex(g, st, tt, xf, fs, ox, oy));
    stage("Weather", (tt) => drawWeather(g, st, tt, xf, fs, ox, oy, seed));
    stage("Sigil", (tt) => drawSigil(g, st, tt, xf, fs, ox, oy, seed));
    stage("Chain", (tt) => drawChain(g, st, tt, xf, fs, ox, oy, seed));
    stage("Light shafts", (tt) => drawShafts(g, st, tt, xf, fs, ox, oy, seed));
    stage("Grid", (tt) => drawGrid(g, st, tt, xf, fs, ox, oy, seed));
    stage("Arms", (tt) => drawArms(g, st, tt, xf, fs, ox, oy, seed));
    stage("Cone", (tt) => drawCone(g, st, tt, xf, fs, ox, oy, seed));
    stage("Beam", (tt) => drawBeam(g, st, tt, xf, fs, ox, oy, seed));
    stage("Ribbon", (tt) => drawRibbon(g, st, tt, xf, fs, ox, oy));
    stage("Arc", (tt) => drawArc(g, st, tt, xf, fs, ox, oy, seed));
    stage("Shatter", (tt) => drawShatter(g, st, tt, xf, fs, ox, oy, seed));
    stage("Lines", (tt) => drawLines(g, st, tt, xf, fs, ox, oy, seed));
    stage("Ripples", (tt) => drawRipples(g, st, tt, xf, fs, ox, oy));
    stage("Rift", (tt) => drawRift(g, st, tt, xf, fs, ox, oy, seed));
    stage("Tumble", (tt) => drawTumble(g, st, tt, xf, fs, ox, oy, seed));
    stage("Swarm", (tt) => drawSwarm(g, st, tt, xf, fs, ox, oy, seed));
    stage("Crackle", (tt) => drawCrackle(g, st, tt, xf, fs, ox, oy, seed));
    stage("Orbit", (tt) => drawOrbit(g, st, tt, xf, fs, ox, oy, seed));
    drawPRings(g, sim, f, st, xf);
    drawPathTrails(g, sim, f, st, xf);
    drawWeb(g, sim, f, st, xf);
  }
  for (let i = 0; i < n; i++) {
    const o = i * P_STRIDE;
    const a = arr[o + P_ALPHA];
    if (a <= 0.004) continue;
    const kind = arr[o + P_KIND];
    // Layer B is written to the table after Layer A, and copyAlive preserves order, so this flips
    // at most once per frame — no per-particle state churn.
    const wantOp = kind === K_PART2 ? blendOpB : blendOpA;
    if (wantOp !== curOp) { g.globalCompositeOperation = wantOp; curOp = wantOp; }
    const x = arr[o + P_X] * xf.k + xf.dx, y = arr[o + P_Y] * xf.k + xf.dy;
    const sz = arr[o + P_SIZE] * xf.k;
    const hue = arr[o + P_HUE], sat = arr[o + P_SAT], light = arr[o + P_LIGHT];

    if (kind === K_WAVE) {   // shockwave: an expanding (optionally squashed) ring
      g.save();
      g.globalAlpha = a;
      g.translate(x, y);
      g.scale(1, 1 - st.waveSquash * 0.85);
      g.strokeStyle = hsl(hue, sat, light);
      g.lineWidth = Math.max(1, sz * 0.5 * st.waveWidth);
      g.beginPath(); g.arc(0, 0, Math.max(0.5, sz / 2), 0, Math.PI * 2); g.stroke();
      g.restore();
      continue;
    }
    if (kind === K_FLASH) {
      const spr = getSprite(0, hue, sat, light, st, 0);
      g.globalAlpha = a;
      g.drawImage(spr, x - sz / 2, y - sz / 2, sz, sz);
      if (st.flashRays > 0) drawRays(g, x, y, sz, st, hue, a);
      continue;
    }

    // Cull particles that have flown off the canvas. drawImage clips them anyway, but the CALL
    // still costs ~1.3µs and a burst spends its whole tail off-screen — measurably cheaper to ask.
    const half = sz * 0.75;      // 0.75 not 0.5: rotated sprites reach past their nominal box
    if (x + half < 0 || x - half > g.canvas.width || y + half < 0 || y - half > g.canvas.height) continue;
    // Layer B draws its own shape. The kind is carried in the frame table rather than in a new
    // slot, so the two populations cost nothing extra to tell apart.
    // Which shape this particle wears. Picked from its layer's set by the particle's stable id
    // through the same hashed draw as everything else, so it holds still across re-renders,
    // scrubbing and export instead of reshuffling every frame.
    const set = kind === K_PART2 ? setB : setA;
    const shp = set.length === 1 ? set[0]
      : set[Math.min(set.length - 1, Math.floor(rnd(seed, arr[o + P_ID], 70) * set.length))];
    const spr = getSprite(shp, hue, sat, light, st, arr[o + P_FRAME]);
    // spark and teardrop are directional shapes — they point where they're going
    const rot = (shp === 1 || shp === 16) ? Math.atan2(arr[o + P_VY], arr[o + P_VX]) : arr[o + P_ANG];
    // motion trail: a few ghosts back along the velocity vector. Cheap, and it reads as speed.
    const ghosts = trail > 0 ? 4 : 0;
    for (let t = ghosts; t >= 0; t--) {
      const back = t / Math.max(1, ghosts) * trail * 0.06;
      const gx = x - arr[o + P_VX] * xf.k * back, gy = y - arr[o + P_VY] * xf.k * back;
      g.globalAlpha = a * (t === 0 ? 1 : 0.45 * (1 - t / (ghosts + 1)));
      if (rot) {
        g.save(); g.translate(gx, gy); g.rotate(rot);
        g.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
        g.restore();
      } else {
        g.drawImage(spr, gx - sz / 2, gy - sz / 2, sz, sz);
      }
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  // Optical passes run AFTER the particles, not with the structure layers. The impact flash uses
  // source-atop so it only brightens pixels that already exist — drawn before the particles it
  // composited onto an empty canvas and did nothing at all, silently. A flare is likewise a
  // property of the lens and belongs on top of everything it is reacting to.
  drawFlare(g, st, t, xf, fs, ox, oy, seed);
  drawImpact(g, st, t, xf);
}

function drawRays(g, x, y, sz, st, hue, a) {
  const rays = Math.round(st.flashRays);
  g.save();
  g.globalAlpha = a * 0.8;
  g.strokeStyle = hsl(hue, st.sat * 0.3, clamp01(st.bright * 0.95));
  g.lineWidth = Math.max(1, sz * 0.03);
  g.lineCap = "round";
  g.translate(x, y);
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2;
    g.beginPath(); g.moveTo(0, 0);
    g.lineTo(Math.cos(ang) * sz * 0.9, Math.sin(ang) * sz * 0.9);
    g.stroke();
  }
  g.restore();
}

// ============================================================================================
// Structure layers — growth, beam, ribbon.
//
// Everything else in this file is INDEPENDENT POINTS THAT TRAVEL. These three aren't: a frost
// crystal is a structure that persists and extends, a beam is a shape anchored at both ends, a
// ribbon is one connected strip. None of them can be expressed as particles, which is why they're
// layers with their own generators (the same conclusion the speech bubble reached).
//
// They draw in WORLD space through the same transform as the particles, so Fit / Scale / shake
// apply — which in turn means simulate() has to widen its bounding box for them, or Fit would
// measure only the particles and crop the structure.
// ============================================================================================

// Shared colour for the layers: honours the ramp when there is one, the classic hue/sat/bright
// path when there isn't, so a ramp'd patch doesn't have two colour systems fighting.
// Returns the CSS colour AND its components. The components are what getSprite() needs — structure
// layers that draw a real particle shape rather than a filled path have to key the sprite cache on
// h/s/l, and re-deriving them at the call site would be the same formula written twice.
function layerColour(st, u, whiteBias) {
  const ramp = parseRamp(st.ramp);
  if (ramp) {
    const c = sampleRamp(ramp, clamp01(u));
    const l = clamp01(c.l * st.bright);
    return { css: hsl(c.h, c.s, l), a: c.a, h: c.h, s: c.s, l: l };
  }
  const w = clamp01(whiteBias);
  const h = st.hue + st.hueLife * u;
  const s = st.sat * (1 - w * 0.85);
  const l = clamp01(st.bright * (0.45 + 0.55 * w));
  return { css: hsl(h, s, l), a: 1, h: h, s: s, l: l };
}

// ---------- growth ----------
// A branching structure generated ONCE from the seed and then revealed outward over time. Doing
// it that way (rather than growing it frame by frame) keeps it deterministic — reroll still means
// something — costs nothing per frame, and lets the reveal be smooth: the segment straddling the
// growth front is drawn partially, so tips creep rather than pop.
let growthKey = null, growthSegs = null;
function growthSegments(st, fs, seed) {
  const key = [seed, st.growSeeds, st.growBranch, st.growAngle, st.growLen, st.growSpread, st.growDir, fs].join(",");
  if (growthKey === key) return growthSegs;
  const segs = [];
  const total = Math.max(4, st.growLen * fs);
  const step = Math.max(2, total / 14);
  const spread = st.growSpread * DEG, ang0 = (st.growDir - 90) * DEG;
  const nSeeds = Math.max(1, Math.round(st.growSeeds));
  let idx = 0;
  // Explicit stack rather than recursion: a dense branch pattern nests deeper than is comfortable
  // and a blown stack in a render loop is a terrible way to find out.
  const stack = [];
  for (let i = 0; i < nSeeds; i++) {
    stack.push({ x: 0, y: 0, ang: ang0 + (rnd(seed, i, 21) - 0.5) * spread, dist: 0, depth: 0 });
  }
  while (stack.length && segs.length < 1400) {
    const n = stack.pop();
    if (n.dist >= total || n.depth > 6) continue;
    const wobble = rndS(seed, idx++, 3) * st.growAngle * DEG * 0.45;
    const a = n.ang + wobble;
    const nx = n.x + Math.cos(a) * step, ny = n.y + Math.sin(a) * step;
    segs.push({ x0: n.x, y0: n.y, x1: nx, y1: ny, a: n.dist / total, b: (n.dist + step) / total, depth: n.depth });
    stack.push({ x: nx, y: ny, ang: a, dist: n.dist + step, depth: n.depth });     // keep growing
    if (rnd(seed, idx++, 7) < st.growBranch * 0.45 && n.depth < 6) {               // …and split
      const side = rnd(seed, idx++, 11) < 0.5 ? 1 : -1;
      stack.push({ x: nx, y: ny, ang: a + side * st.growAngle * DEG, dist: n.dist + step, depth: n.depth + 1 });
    }
  }
  growthKey = key; growthSegs = segs;
  return segs;
}
function drawGrowth(g, st, t, xf, fs, ox, oy, seed) {
  if (st.growth <= 0) return;
  const segs = growthSegments(st, fs, seed);
  const u = clamp01(t / Math.max(0.01, st.duration * st.growTime));
  const base = Math.max(0.5, st.growWidth);
  g.save();
  g.lineCap = "round";
  for (const s of segs) {
    if (s.a > u) continue;
    // Partial draw for the segment the growth front is currently crossing.
    const k = s.b <= u ? 1 : (u - s.a) / Math.max(1e-6, s.b - s.a);
    const c = layerColour(st, s.a, 1 - s.a * 0.8);
    g.globalAlpha = st.growth * c.a;
    g.strokeStyle = c.css;
    g.lineWidth = Math.max(0.4, base * Math.pow(1 - st.growTaper, s.depth) * (1 - s.a * st.growTaper * 0.6));
    g.beginPath();
    g.moveTo(ox + s.x0 * xf.k, oy + s.y0 * xf.k);
    g.lineTo(ox + (s.x0 + (s.x1 - s.x0) * k) * xf.k, oy + (s.y0 + (s.y1 - s.y0) * k) * xf.k);
    g.stroke();
  }
  g.restore();
}

// ---------- beam ----------
// A laser / bolt / breath weapon: anchored at the origin, extending outward. Faking this with a
// cone of particles has always looked like a cone of particles.
function drawBeam(g, st, t, xf, fs, ox, oy, seed) {
  if (st.beam <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const grow = st.beamGrow > 0 ? clamp01(t / Math.max(0.01, st.duration * st.beamGrow)) : 1;
  const len = st.beamLen * fs * xf.k * grow;
  if (len < 1) return;
  const ang = (st.beamAngle - 90) * DEG;
  const w0 = st.beamWidth * xf.k;
  const flick = 1 - st.beamFlicker * 0.5 * (0.5 + 0.5 * Math.sin(t * 47 + rnd(seed, 1, 5) * 10));
  const c = layerColour(st, u, 0.35);
  const core = layerColour(st, u, 0.95);
  g.save();
  g.translate(ox, oy);
  g.rotate(ang);
  g.globalAlpha = st.beam * c.a * flick;
  // The beam is drawn as a strip of quads so its width can breathe along its length — a single
  // trapezoid reads as a shape, a noise-modulated strip reads as energy.
  const steps = 24;
  for (let pass = 0; pass < 2; pass++) {          // pass 0 = outer glow body, pass 1 = hot core
    const wide = pass === 0 ? 1 : st.beamCore * 0.55;
    g.fillStyle = pass === 0 ? c.css : core.css;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const n = st.beamScroll > 0 ? vnoise(seed, s * 6, t * st.beamScroll, 0) * 0.35 : 0;
      const w = w0 * wide * (1 - st.beamTaper * s) * (1 + n);
      g.lineTo(s * len, -w / 2);
    }
    for (let i = steps; i >= 0; i--) {
      const s = i / steps;
      const n = st.beamScroll > 0 ? vnoise(seed + 91, s * 6, t * st.beamScroll, 0) * 0.35 : 0;
      const w = w0 * wide * (1 - st.beamTaper * s) * (1 + n);
      g.lineTo(s * len, w / 2);
    }
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ---------- ribbon ----------
// One connected strip following an arc, with a head that sweeps and a tail that follows. The
// crescent SHAPE approximates this and can't curve along motion; this is the real thing.
function drawRibbon(g, st, t, xf, fs, ox, oy) {
  if (st.ribbon <= 0) return;
  const head = clamp01(t / Math.max(0.01, st.duration * st.ribbonSweep));
  if (head <= 0) return;
  const tail = Math.max(0.02, st.ribbonTrail);
  const from = Math.max(0, head - tail);
  const arc = st.ribbonArc * Math.PI * 2;
  const a0 = (st.ribbonSpin - 90) * DEG;
  const R = st.ribbonRadius * fs * xf.k;
  const w0 = st.ribbonWidth * xf.k;
  const c = layerColour(st, head, 0.6);
  const steps = 40;
  g.save();
  g.globalAlpha = st.ribbon * c.a;
  g.fillStyle = c.css;
  g.beginPath();
  const pt = (s, side) => {
    const ang = a0 + arc * s;
    // Width tapers toward the tail so the strip reads as motion with a direction, not a worm.
    const local = (s - from) / Math.max(1e-6, head - from);
    const w = w0 * (0.15 + 0.85 * Math.pow(local, st.ribbonTaper)) / 2;
    const r = R + side * w;
    return [ox + Math.cos(ang) * r, oy + Math.sin(ang) * r];
  };
  for (let i = 0; i <= steps; i++) { const p = pt(from + (head - from) * (i / steps), 1); g.lineTo(p[0], p[1]); }
  for (let i = steps; i >= 0; i--) { const p = pt(from + (head - from) * (i / steps), -1); g.lineTo(p[0], p[1]); }
  g.closePath();
  g.fill();
  g.restore();
}

// ---------- vortex ----------
// Concentric rotating rings: portals, summoning circles, drains, tractor beams. Distinct from the
// shockwave, which is ONE ring expanding once — these persist, spin, and drift.
function drawVortex(g, st, t, xf, fs, ox, oy) {
  if (st.vortex <= 0) return;
  const rings = Math.max(1, Math.round(st.vortexRings));
  const spin = st.vortexSpin * DEG * t;
  const squash = 1 - st.vortexSquash * 0.85;
  g.save();
  g.translate(ox, oy);
  g.scale(1, squash);                       // a ground-plane portal is an ellipse, not a circle
  g.lineCap = "butt";
  for (let i = 0; i < rings; i++) {
    // Rings drift inward or outward and wrap, so the thing reads as continuous motion rather than
    // a fixed set of circles rotating in place.
    const phase = (i / rings + t * st.vortexScroll) % 1;
    const p = phase < 0 ? phase + 1 : phase;
    const r = st.vortexRadius * fs * xf.k * (0.25 + 0.75 * p);
    if (r < 1) continue;
    // fade at both ends of the drift so rings appear and vanish instead of popping
    const edgeFade = Math.min(1, p / 0.15, (1 - p) / 0.2);
    const c = layerColour(st, p, 0.5);
    g.globalAlpha = st.vortex * c.a * clamp01(edgeFade);
    g.strokeStyle = c.css;
    g.lineWidth = Math.max(0.5, st.vortexWidth * xf.k * (0.4 + 0.6 * p));
    const off = spin + i * 2.4;
    if (st.vortexGap > 0) {                 // dashed rings read as rotation; solid ones don't
      const dashes = 3 + i;
      const span = (Math.PI * 2 / dashes) * (1 - st.vortexGap * 0.7);
      for (let d = 0; d < dashes; d++) {
        const a0 = off + (d / dashes) * Math.PI * 2;
        g.beginPath(); g.arc(0, 0, r, a0, a0 + span); g.stroke();
      }
    } else {
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    }
  }
  g.restore();
}

// ---------- arc ----------
// Lightning from the origin to a point, with branches. The `bolt` SHAPE is a particle that
// travels; this is an arc anchored at both ends, which is what chain lightning and tesla coils
// actually are. It re-randomises in discrete steps (arcRate) rather than every frame, because
// continuous jitter reads as noise while stepped jitter reads as electricity.
function drawArc(g, st, t, xf, fs, ox, oy, seed) {
  if (st.arc <= 0) return;
  const u = t / Math.max(0.01, st.arcLife);
  if (u >= 1) return;
  const step = Math.floor(t * Math.max(1, st.arcRate));   // which "flash" we're on
  const tx = ox + (st.arcToX - st.originX) * fs * xf.k;
  const ty = oy + (st.arcToY - st.originY) * fs * xf.k;
  const segs = Math.max(3, Math.round(st.arcSegs));
  const dx = tx - ox, dy = ty - oy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;                     // perpendicular, for the jitter
  // 0.9 white-bias crushed saturation to ~23% and lifted lightness to ~95%, so every bolt came
  // out white no matter what hue was set — purple lightning was simply not expressible. 0.55
  // keeps the hot-white read while letting the colour through. (Same call the sigil needed.)
  const c = layerColour(st, u, 0.55);
  const fade = 1 - u * u;

  const path = (jit, spread) => {
    g.beginPath();
    g.moveTo(ox, oy);
    for (let i = 1; i <= segs; i++) {
      const s = i / segs;
      // taper the jitter to zero at both ends so the arc actually meets its endpoints
      const amp = Math.sin(s * Math.PI) * spread * len * 0.18;
      const j = rndS(seed + step * 977, i, jit) * amp;
      g.lineTo(ox + dx * s + nx * j, oy + dy * s + ny * j);
    }
    g.stroke();
  };
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.globalAlpha = st.arc * c.a * fade;
  g.strokeStyle = c.css;
  g.lineWidth = Math.max(0.5, st.arcWidth * xf.k);
  path(3, st.arcJitter);
  if (st.arcBranch > 0) {
    g.globalAlpha = st.arc * c.a * fade * 0.6;
    g.lineWidth = Math.max(0.4, st.arcWidth * xf.k * 0.55);
    const n = Math.round(st.arcBranch * 4);
    for (let b = 0; b < n; b++) {
      const s = 0.2 + rnd(seed + step * 977, b, 31) * 0.6;
      const amp = Math.sin(s * Math.PI) * st.arcJitter * len * 0.18;
      const jx = ox + dx * s + nx * rndS(seed + step * 977, Math.round(s * segs), 3) * amp;
      const jy = oy + dy * s + ny * rndS(seed + step * 977, Math.round(s * segs), 3) * amp;
      const bl = len * (0.12 + rnd(seed + step * 977, b, 41) * 0.25);
      const ba = Math.atan2(dy, dx) + rndS(seed + step * 977, b, 51) * 1.2;
      g.beginPath();
      g.moveTo(jx, jy);
      g.lineTo(jx + Math.cos(ba) * bl, jy + Math.sin(ba) * bl);
      g.stroke();
    }
  }
  g.restore();
}

// ---------- path trails ----------
// A ribbon behind each particle that follows the path it ACTUALLY took. The existing `trail`
// stamps ghost copies backwards along the instantaneous velocity, which is a straight line — fine
// for a fast spark, wrong for anything that curves, because the ghosts leave the arc. This walks
// the frame table backwards by particle id and draws the real curve: firework tails, comet swarms,
// swirling embers.
//
// The id→row maps are built once per render and cached, since every frame queries several
// previous frames and rebuilding them per frame would be O(frames²).
let pathMapsKey = null, pathMaps = null;
function pathIndexMaps(sim) {
  if (pathMapsKey === sim) return pathMaps;
  const maps = new Array(sim.nFrames);
  for (let f = 0; f < sim.nFrames; f++) {
    const m = new Map();
    const arr = sim.frames[f], n = sim.counts[f];
    for (let i = 0; i < n; i++) {
      const id = arr[i * P_STRIDE + P_ID];
      if (id >= 0) m.set(id, i * P_STRIDE);
    }
    maps[f] = m;
  }
  pathMapsKey = sim; pathMaps = maps;
  return maps;
}
function drawPathTrails(g, sim, f, st, xf) {
  if (st.pathTrail <= 0) return;
  const maps = pathIndexMaps(sim);
  const back = Math.max(2, Math.round(st.pathLen));
  const arr = sim.frames[f], n = sim.counts[f];
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let i = 0; i < n; i++) {
    const o = i * P_STRIDE;
    if (arr[o + P_KIND] !== K_PART) continue;
    const id = arr[o + P_ID];
    const alpha = arr[o + P_ALPHA];
    if (alpha <= 0.01) continue;
    // Walk back frame by frame; stop as soon as this particle wasn't alive, so a trail never
    // jumps across a gap to some earlier life.
    const pts = [[arr[o + P_X], arr[o + P_Y]]];
    for (let k = 1; k <= back; k++) {
      const pf = f - k;
      if (pf < 0) break;
      const off = maps[pf].get(id);
      if (off === undefined) break;
      pts.push([sim.frames[pf][off + P_X], sim.frames[pf][off + P_Y]]);
    }
    if (pts.length < 2) continue;
    const c = hsl(arr[o + P_HUE], arr[o + P_SAT], arr[o + P_LIGHT]);
    g.strokeStyle = c;
    const w0 = Math.max(0.4, st.pathWidth * xf.k);
    // Draw as separate tapering segments rather than one polyline: a single stroke can't vary its
    // width along its length, and a trail of constant width reads as a wire.
    for (let k = 0; k < pts.length - 1; k++) {
      const s = k / (pts.length - 1);
      g.globalAlpha = alpha * st.pathTrail * Math.pow(1 - s, st.pathFade * 3 + 0.2);
      g.lineWidth = w0 * (1 - s * st.pathTaper);
      g.beginPath();
      g.moveTo(pts[k][0] * xf.k + xf.dx, pts[k][1] * xf.k + xf.dy);
      g.lineTo(pts[k + 1][0] * xf.k + xf.dx, pts[k + 1][1] * xf.k + xf.dy);
      g.stroke();
    }
  }
  g.restore();
}

// ---------- ripples ----------
// Repeating expanding rings: water, sonar, pulses, heartbeat auras. The shockwave is ONE ring
// fired once; this is a train of them, which is a different thing entirely and endlessly loopable.
function drawRipples(g, st, t, xf, fs, ox, oy) {
  if (st.ripple <= 0) return;
  const n = Math.max(1, Math.round(st.rippleCount));
  const life = Math.max(0.05, st.rippleLife);
  const squash = 1 - st.rippleSquash * 0.85;
  g.save();
  g.translate(ox, oy);
  g.scale(1, squash);
  for (let i = 0; i < n; i++) {
    // Rings are evenly phased through one lifetime and wrap, so the train is seamless — start it
    // mid-cycle and there are already rings in flight rather than an empty frame.
    const u = ((t / life) + i / n) % 1;
    const r = st.rippleSpeed * fs * 0.5 * xf.k * u;
    if (r < 1) continue;
    const c = layerColour(st, u, 0.4);
    g.globalAlpha = st.ripple * c.a * (1 - u) * Math.min(1, u * 6);
    g.strokeStyle = c.css;
    g.lineWidth = Math.max(0.4, st.rippleWidth * xf.k * (1 - u * 0.6));
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

// ---------- fracture ----------
// Cracks racing outward from a point, forking as they go. `growth` branches organically — vines,
// frost, lightning-as-plant; a fracture is ANGULAR and brittle: straight runs, sharp turns, forks
// that never rejoin. Breaking ground, splitting stone, spiderwebbed glass, a boss-arena floor
// giving way.
function drawFracture(g, st, t, xf, fs, ox, oy, seed) {
  if (st.fracture <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.fractureLife));
  if (u >= 1) return;
  const main = Math.max(1, Math.round(st.fractureCount));
  const reach = st.fractureReach * fs * xf.k;
  const segs = Math.max(2, Math.round(st.fractureSegs));
  const c = layerColour(st, u, 0.25);
  const fade = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
  g.save();
  g.globalAlpha = st.fracture * c.a * clamp01(fade);
  g.strokeStyle = c.css;
  g.lineCap = "round";
  g.lineJoin = "round";
  // One crack: walk outward in straight runs, turning by a hashed angle at each joint. `grow`
  // clips how far along it has got, so the whole network races outward rather than appearing.
  const crack = (a0, len, width, id, depth) => {
    let x = ox, y = oy, a = a0;
    const grow = clamp01(u / Math.max(0.05, st.fractureSpeed));
    g.lineWidth = Math.max(0.4, width);
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < segs; s++) {
      const f = (s + 1) / segs;
      if (f > grow) break;
      a += rndS(seed, id * 32 + s, 181) * st.fractureJitter * 1.1;
      const step = (len / segs) * (0.6 + rnd(seed, id * 32 + s, 182) * 0.8);
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      g.lineTo(x, y);
      // Forks: a second crack leaving at a sharp angle, thinner and shorter. One level only —
      // deeper recursion turns into a grey smear at sprite sizes.
      if (depth < 1 && st.fractureFork > 0 && rnd(seed, id * 32 + s, 183) < st.fractureFork) {
        const bx = x, by = y, ba = a + (rnd(seed, id * 32 + s, 184) < 0.5 ? -1 : 1) * (0.5 + rnd(seed, id, 185) * 0.7);
        g.stroke();
        const px = ox, py = oy;
        ox = bx; oy = by;                                  // fork starts where the parent was
        crack(ba, len * (1 - f) * 0.7, width * 0.6, id * 7 + s + 1, depth + 1);
        ox = px; oy = py;
        g.lineWidth = Math.max(0.4, width);
        g.beginPath();
        g.moveTo(x, y);
      }
    }
    g.stroke();
  };
  for (let i = 0; i < main; i++) {
    const a = (i / main) * Math.PI * 2 + rndS(seed, i, 186) * 0.5;
    crack(a, reach * (0.6 + rnd(seed, i, 187) * 0.7), st.fractureWidth * xf.k, i, 0);
  }
  g.restore();
}

// ---------- drip ----------
// Droplets that SWELL at a rim, release, and stretch as they fall. Particles are born already
// moving; a drip has a life cycle — it gathers, hangs, lets go. That pause before it falls is the
// whole read, and it's what says slime, blood, honey, molten metal, melting ice.
function drawDrip(g, st, t, xf, fs, ox, oy, seed) {
  if (st.drip <= 0) return;
  const n = Math.max(1, Math.round(st.dripCount));
  const span = st.dripSpread * fs * xf.k;
  const fall = st.dripFall * fs * xf.k;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.2);
  g.save();
  g.globalAlpha = st.drip * c.a;
  g.fillStyle = c.css;
  for (let i = 0; i < n; i++) {
    const x = ox + rndS(seed, i, 191) * span;
    const y0 = oy + rndS(seed, i, 192) * span * 0.12;
    // Each drop runs its own cycle, offset so they don't all let go together.
    const cyc = (t * st.dripRate * (0.6 + rnd(seed, i, 193) * 0.8) + rnd(seed, i, 194)) % 1;
    const r = st.dripSize * xf.k * (0.6 + rnd(seed, i, 195) * 0.8);
    if (cyc < st.dripHang) {
      // Swelling at the rim: grows in place, with a small neck holding it up.
      const s = cyc / Math.max(0.01, st.dripHang);
      const rr = r * (0.25 + 0.75 * s);
      g.beginPath(); g.arc(x, y0 + rr * 0.6, rr, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(x - rr * 0.3, y0); g.lineTo(x + rr * 0.3, y0);
      g.lineTo(x + rr * 0.12, y0 + rr * 0.7); g.lineTo(x - rr * 0.12, y0 + rr * 0.7);
      g.closePath(); g.fill();
    } else {
      // Falling: accelerates, and stretches along the direction of travel like a real droplet.
      const s = (cyc - st.dripHang) / Math.max(0.01, 1 - st.dripHang);
      const y = y0 + fall * s * s;
      const stretch = 1 + s * st.dripStretch * 3;
      g.save();
      g.translate(x, y);
      g.scale(1, stretch);
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  g.restore();
}

// ---------- sweep ----------
// A rotating wedge. `beam` fires in a fixed direction and `lines` radiate everywhere at once; a
// sweep is a sector that TURNS, trailing a fading wake behind its leading edge. Radar, sonar,
// searchlights, scanning, a boss winding up a spin attack.
function drawSweep(g, st, t, xf, fs, ox, oy) {
  if (st.sweep <= 0) return;
  const R = st.sweepRadius * fs * xf.k;
  if (R < 1) return;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const head = st.sweepAngle * DEG + t * st.sweepSpeed * Math.PI * 2;
  const wedge = Math.max(0.02, st.sweepWidth) * Math.PI * 2;
  const steps = Math.max(3, Math.round(st.sweepWidth * 40));
  const c = layerColour(st, u, 0.45);
  g.save();
  g.translate(ox, oy);
  g.scale(1, 1 - st.sweepSquash * 0.85);
  // Drawn as a stack of thin sectors so the wake can fade along its length; one filled arc can
  // only have one alpha, which reads as a spinning pie slice rather than a sweep.
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    const a0 = head - wedge * f, a1 = head - wedge * (f + 1 / steps);
    g.globalAlpha = st.sweep * c.a * Math.pow(1 - f, st.sweepFade * 3 + 0.4);
    g.fillStyle = c.css;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, a1, a0);
    g.closePath();
    g.fill();
  }
  if (st.sweepEdge > 0) {                        // a bright leading edge sells the direction
    g.globalAlpha = st.sweep * c.a * st.sweepEdge;
    g.strokeStyle = c.css;
    g.lineWidth = Math.max(0.5, st.sweepEdge * 3 * xf.k);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(head) * R, Math.sin(head) * R);
    g.stroke();
  }
  g.restore();
}

// ---------- decal ----------
// A ground mark under the effect: shadow, scorch, splat, impact ring. Every other system draws the
// EVENT; this draws what the event leaves on the floor, which is what makes an effect sit in a
// scene instead of floating in front of it. Draws first, under everything.
function drawDecal(g, st, t, xf, fs, ox, oy) {
  if (st.decal <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const grow = st.decalGrow > 0 ? Math.min(1, u / st.decalGrow) : 1;
  const fade = u > (1 - st.decalFade) && st.decalFade > 0
    ? 1 - (u - (1 - st.decalFade)) / st.decalFade : 1;
  const a = st.decal * clamp01(fade);
  if (a <= 0.002) return;
  const rx = st.decalSize * fs * xf.k * grow;
  const ry = rx * (1 - st.decalSquash * 0.9);
  if (rx < 0.5 || ry < 0.3) return;
  const y = oy + st.decalDrop * fs * xf.k;
  const c = layerColour(st, u, 0.05);
  g.save();
  g.globalAlpha = a * c.a;
  // A soft-edged ellipse: a hard one reads as a sticker, and a scorch mark never has a crisp edge.
  const grd = g.createRadialGradient(ox, y, 0, ox, y, rx);
  grd.addColorStop(0, c.css);
  grd.addColorStop(Math.max(0.01, 1 - st.decalSoft), c.css);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.save();
  g.translate(ox, y); g.scale(1, ry / rx); g.translate(-ox, -y);
  g.beginPath(); g.arc(ox, y, rx, 0, Math.PI * 2); g.fill();
  g.restore();
  g.restore();
}

// ---------- tunnel ----------
// Rings receding toward a vanishing point. Vortex draws rings on a flat plane; this one gives them
// PERSPECTIVE, so the eye reads depth going away from it rather than a disc lying in front of it.
// Wormholes, warp speed, portal interiors, dive-in transitions.
function drawTunnel(g, st, t, xf, fs, ox, oy) {
  if (st.tunnel <= 0) return;
  const rings = Math.max(2, Math.round(st.tunnelRings));
  const R = st.tunnelRadius * fs * xf.k;
  const vx = ox + (st.tunnelVanishX - 0.5) * fs * xf.k;
  const vy = oy + (st.tunnelVanishY - 0.5) * fs * xf.k;
  const u = clamp01(t / Math.max(0.01, st.duration));
  g.save();
  g.lineCap = "butt";
  for (let i = 0; i < rings; i++) {
    // z runs 0 (far, at the vanishing point) to 1 (near, full size) and scrolls with time.
    let z = (i / rings + t * st.tunnelSpeed) % 1;
    if (z < 0) z += 1;
    // Perspective, not linear: without the curve the rings space evenly and it reads as a target.
    const persp = Math.pow(z, st.tunnelDepth * 2 + 0.6);
    const rr = R * persp;
    if (rr < 0.6) continue;
    const c = layerColour(st, 1 - z, 0.4);
    // Fade at both ends so rings emerge from the vanishing point rather than popping.
    const edge = Math.min(1, z / 0.12, (1 - z) / 0.18);
    g.globalAlpha = st.tunnel * c.a * clamp01(edge) * (0.35 + 0.65 * persp);
    g.strokeStyle = c.css;
    g.lineWidth = Math.max(0.4, st.tunnelWidth * xf.k * persp);
    const cx = vx + (ox - vx) * persp, cy = vy + (oy - vy) * persp;
    g.beginPath();
    g.ellipse(cx, cy, rr, rr * (1 - st.tunnelSquash * 0.85), 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

// ---------- crackle ----------
// Small arcs jumping between scattered points — static electricity, an energy skin, a charging
// weapon. `arc` is ONE bolt between two chosen endpoints; this is a FIELD of tiny ones with no
// endpoints to aim, which is a different thing to author and a different thing to look at.
//
// Re-randomises in discrete steps like the arc layer does: continuous jitter reads as noise,
// stepped jitter reads as electricity.
function drawCrackle(g, st, t, xf, fs, ox, oy, seed) {
  if (st.crackle <= 0) return;
  const n = Math.max(1, Math.round(st.crackleCount));
  const R = st.crackleSpread * fs * xf.k;
  const step = Math.floor(t * Math.max(1, st.crackleRate));
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.55);   // see the arc note: 0.85 made every spark white
  const s = seed + step * 7919;
  g.save();
  g.globalAlpha = st.crackle * c.a;
  g.strokeStyle = c.css;
  g.lineCap = "round";
  g.lineWidth = Math.max(0.4, st.crackleWidth * xf.k);
  for (let i = 0; i < n; i++) {
    const a0 = rnd(s, i, 171) * Math.PI * 2;
    const r0 = R * Math.sqrt(rnd(s, i, 172));           // sqrt keeps them evenly spread, not clumped
    const x0 = ox + Math.cos(a0) * r0, y0 = oy + Math.sin(a0) * r0;
    const len = st.crackleLength * fs * xf.k * (0.4 + rnd(s, i, 173));
    const dir = rnd(s, i, 174) * Math.PI * 2;
    const segs = 3;
    g.beginPath();
    g.moveTo(x0, y0);
    for (let k = 1; k <= segs; k++) {
      const f = k / segs;
      const jit = rndS(s, i * 8 + k, 175) * len * 0.34;
      g.lineTo(x0 + Math.cos(dir) * len * f - Math.sin(dir) * jit,
               y0 + Math.sin(dir) * len * f + Math.cos(dir) * jit);
    }
    g.stroke();
  }
  g.restore();
}

// ---------- swarm ----------
// A cloud of agents that move together — bees, spirits, fish, drones. Every other layer either
// draws one object or draws particles that ignore each other; this reads as a GROUP with a shared
// intent, which is a motion model the set didn't have.
//
// Honest about what it is: not true boids. Boids need integration over time, and every generator
// here is a pure function of t so any frame can be drawn on its own (which is what makes Fit,
// scrubbing and streamed export work). Instead each agent orbits a shared wandering lead point at
// its own hashed radius, rate and phase. It reads as flocking because the members share a
// destination while never quite agreeing on the path — which is what flocking actually looks like.
function drawSwarm(g, st, t, xf, fs, ox, oy, seed) {
  if (st.swarm <= 0) return;
  const n = Math.max(2, Math.round(st.swarmCount));
  const R = st.swarmSpread * fs * xf.k;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.35);
  // The shared lead point: a slow lissajous, so the whole group drifts as one.
  const lead = st.swarmWander * fs * xf.k;
  const lx = ox + Math.sin(t * st.swarmSpeed * 0.7) * lead;
  const ly = oy + Math.cos(t * st.swarmSpeed * 0.53) * lead * 0.7;
  g.save();
  g.fillStyle = c.css;
  for (let i = 0; i < n; i++) {
    const rad = R * (0.25 + rnd(seed, i, 141) * 0.75);
    const rate = st.swarmSpeed * (1.4 + rnd(seed, i, 142) * 2.2);
    const ph = rnd(seed, i, 143) * Math.PI * 2;
    const tilt = 0.45 + rnd(seed, i, 144) * 0.55;
    const a = ph + t * rate;
    const x = lx + Math.cos(a) * rad;
    const y = ly + Math.sin(a * 1.3 + ph) * rad * tilt;
    const sz = Math.max(0.4, st.swarmSize * xf.k * (0.6 + rnd(seed, i, 145) * 0.8));
    // Flicker: insects and spirits blink out of view, and it hides the regularity of the orbits.
    const blink = st.swarmFlicker > 0
      ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (6 + rnd(seed, i, 146) * 14) + ph))
      : 1;
    g.globalAlpha = st.swarm * c.a * (1 - st.swarmFlicker + st.swarmFlicker * blink);
    g.beginPath(); g.arc(x, y, sz, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------- chain ----------
// An articulated body: segments that FOLLOW, each lagging the one ahead. Whips, tentacles, tails,
// energy tethers, chains. Nothing else here is articulated — beam and ribbon are rigid, path trail
// traces where a particle has been.
//
// Stateless the same way: segment i simply samples the anchor's path at (t - i*lag), so the tail
// is literally where the head was a moment ago. That's what rope physics converges to anyway, and
// it costs one function evaluation per segment instead of an integration.
function drawChain(g, st, t, xf, fs, ox, oy, seed) {
  if (st.chain <= 0) return;
  const segs = Math.max(2, Math.round(st.chainSegs));
  const reach = st.chainReach * fs * xf.k;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.4);
  const swing = st.chainSwing * DEG;
  // Where the head is at time tt — a swinging arc from the origin.
  const headAt = (tt) => {
    const a = st.chainAngle * DEG + Math.sin(tt * st.chainSpeed * 6.283) * swing;
    return [ox + Math.cos(a) * reach, oy + Math.sin(a) * reach];
  };
  g.save();
  g.strokeStyle = c.css;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.globalAlpha = st.chain * c.a;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const h = headAt(t - f * st.chainLag);
    // Blend from the anchor to the lagged head position, so the chain stays attached at one end.
    pts.push([ox + (h[0] - ox) * f, oy + (h[1] - oy) * f]);
  }
  // Taper by redrawing each span at its own width; one stroke can only have one lineWidth.
  for (let i = 0; i < segs; i++) {
    const f = i / segs;
    g.lineWidth = Math.max(0.5, st.chainWidth * xf.k * (1 - f * st.chainTaper));
    g.beginPath();
    g.moveTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[i + 1][0], pts[i + 1][1]);
    g.stroke();
  }
  if (st.chainBeads > 0) {
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const r = st.chainWidth * xf.k * st.chainBeads * (1 - f * st.chainTaper);
      if (r < 0.3) continue;
      g.beginPath(); g.arc(pts[i][0], pts[i][1], r, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

// ---------- impact ----------
// A whole-frame hit flash for the first frame or two. Every other system is spatial — it draws
// something somewhere. This one is TEMPORAL: it says "the hit lands NOW" by taking over the entire
// frame briefly. It's the cheapest game-juice there is and the thing hand-animated effects almost
// always have and procedural ones almost never do.
function drawImpact(g, st, t, xf) {
  if (st.impact <= 0) return;
  const life = Math.max(0.001, st.impactLife);
  if (t > life) return;
  const u = t / life;
  const w = g.canvas.width, h = g.canvas.height;
  const fade = st.impactHold > 0 ? (u < st.impactHold ? 1 : 1 - (u - st.impactHold) / (1 - st.impactHold))
                                 : 1 - u;
  const a = st.impact * clamp01(fade);
  if (a <= 0.002) return;
  const c = layerColour(st, 0, 0.95);
  const prev = g.globalCompositeOperation;
  g.save();
  // source-atop keeps the flash INSIDE the sprite's existing alpha — a full-frame rectangle would
  // fill the transparent background and ruin the sheet. This reads as the sprite itself blowing
  // out, which is what a hit frame is.
  g.globalCompositeOperation = st.impactFill > 0.5 ? "source-over" : "source-atop";
  g.globalAlpha = a;
  g.fillStyle = c.css;
  g.fillRect(0, 0, w, h);
  g.restore();
  g.globalCompositeOperation = prev;
}

// ---------- weather ----------
// A full-frame field: rain, snow, ash, embers, drifting motes. Particles can approximate this, but
// they're born at an emitter and die, so a downpour needs a huge count and still pops at the edges.
// A field layer has no origin — it fills the frame and WRAPS, so it loops seamlessly by
// construction, which is exactly what an ambient overlay needs.
function drawWeather(g, st, t, xf, fs, ox, oy, seed) {
  if (st.weather <= 0) return;
  const n = Math.max(1, Math.round(st.weatherCount));
  const w = g.canvas.width, h = g.canvas.height;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.45);
  const ang = st.weatherAngle * DEG;
  const vx = Math.cos(ang) * st.weatherSpeed * fs * xf.k;
  const vy = Math.sin(ang) * st.weatherSpeed * fs * xf.k;
  const len = st.weatherLength * fs * xf.k;
  g.save();
  g.globalAlpha = st.weather * c.a;
  g.strokeStyle = c.css;
  g.fillStyle = c.css;
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    // Wrap with a modulo over a margin-padded box so nothing pops in at an edge.
    const pad = Math.max(len, 8);
    const bw = w + pad * 2, bh = h + pad * 2;
    let x = (rnd(seed, i, 151) * bw + vx * t) % bw;
    let y = (rnd(seed, i, 152) * bh + vy * t) % bh;
    if (x < 0) x += bw;
    if (y < 0) y += bh;
    x -= pad; y -= pad;
    const sz = Math.max(0.4, st.weatherSize * xf.k * (0.55 + rnd(seed, i, 153) * 0.9));
    if (len > 1) {                                   // streaks (rain)
      g.lineWidth = sz;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
      g.stroke();
    } else {                                         // flakes / motes
      const sway = Math.sin(t * 2 + rnd(seed, i, 154) * 6.283) * st.weatherSway * fs * xf.k;
      g.beginPath(); g.arc(x + sway, y, sz, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

// ---------- flare ----------
// An anamorphic lens flare: a wide horizontal streak plus ghost discs marching along the axis
// through the frame centre. Flash's rays radiate from a point; a flare is a property of the
// LENS — it's what makes a bright effect read as filmed rather than drawn, and it's the look every
// modern game trailer leans on.
function drawFlare(g, st, t, xf, fs, ox, oy, seed) {
  if (st.flare <= 0) return;
  const life = Math.max(0.01, st.flareLife);
  const u = t / life;
  if (u >= 1) return;
  const fade = 1 - u * u;
  const w = g.canvas.width, h = g.canvas.height;
  const c = layerColour(st, u, 0.85);
  const len = st.flareLength * Math.max(w, h) * 0.5;
  g.save();
  g.globalAlpha = st.flare * c.a * fade;
  // The streak: a gradient bar, brightest at the source and falling off both ways.
  const grd = g.createLinearGradient(ox - len, oy, ox + len, oy);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.5, c.css);
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  const th = Math.max(1, st.flareWidth * xf.k);
  g.fillRect(ox - len, oy - th * 0.5, len * 2, th);
  // Ghosts: discs spaced along the line from the source THROUGH the frame centre, which is what
  // makes them track the source as it moves off-axis rather than sitting on it.
  const ghosts = Math.round(st.flareGhosts);
  if (ghosts > 0) {
    const cx = w / 2, cy = h / 2;
    for (let i = 1; i <= ghosts; i++) {
      const k = (i / (ghosts + 1)) * 2.1 - 0.35;
      const gx = ox + (cx - ox) * (1 + k);
      const gy = oy + (cy - oy) * (1 + k);
      const gr = Math.max(1, st.flareWidth * xf.k * (0.6 + rnd(seed, i, 161) * 1.9));
      g.globalAlpha = st.flare * c.a * fade * (0.12 + rnd(seed, i, 162) * 0.22);
      g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

// ---------- web ----------
// Lines between particles that are near each other. Every other layer draws a THING; this one
// draws the RELATIONSHIPS between things already on screen, which is why it can't be a shape or a
// preset — it needs the whole particle table, and what it looks like depends entirely on how the
// particles happen to be arranged that frame. Constellations, nanotech, spider web, energy nets,
// chain lightning between shards.
//
// O(n²) in the particle count, so it works on a capped prefix. 3000 particles would be 4.5M pairs
// per frame; the cap keeps it bounded and the effect reads the same, because a web of 5000 links
// is a solid fill anyway.
const WEB_MAX_NODES = 140;
function drawWeb(g, sim, f, st, xf) {
  if (st.web <= 0) return;
  const arr = sim.frames[f], n = Math.min(sim.counts[f], WEB_MAX_NODES);
  if (n < 2) return;
  const reach = st.webReach * frameRefPx(g.canvas.width, g.canvas.height);
  if (reach < 1) return;
  const reach2 = reach * reach;
  const u = clamp01((f / sim.fps) / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.3);
  g.save();
  g.lineCap = "round";
  g.strokeStyle = c.css;
  const xs = new Float32Array(n), ys = new Float32Array(n), as = new Float32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const o = i * P_STRIDE;
    if (arr[o + P_KIND] !== K_PART) continue;
    const a = arr[o + P_ALPHA];
    if (a <= 0.02) continue;
    xs[m] = arr[o + P_X] * xf.k + xf.dx;
    ys[m] = arr[o + P_Y] * xf.k + xf.dy;
    as[m] = a;
    m++;
  }
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
      const d2 = dx * dx + dy * dy;
      if (d2 > reach2) continue;
      // Fade with distance so links dissolve as they stretch instead of snapping off at the
      // radius — a hard cutoff makes the whole web flicker as particles drift.
      const fall = 1 - Math.sqrt(d2) / reach;
      g.globalAlpha = st.web * c.a * fall * fall * Math.min(as[i], as[j]);
      g.lineWidth = Math.max(0.3, st.webWidth * xf.k * fall);
      g.beginPath();
      g.moveTo(xs[i], ys[i]);
      g.lineTo(xs[j], ys[j]);
      g.stroke();
    }
  }
  g.restore();
}

// ---------- rift ----------
// A tear in space: a tall lens that opens, holds and closes, with a jagged edge and a bright
// inner core. The silhouette is the point — vortex and sigil are made of rings and read as flat
// discs, whereas a rift reads as an opening with something behind it. Teleports, portals,
// dimensional tears, sword-slash gashes.
function drawRift(g, st, t, xf, fs, ox, oy, seed) {
  if (st.rift <= 0) return;
  const life = Math.max(0.01, st.riftLife);
  const u = clamp01(t / life);
  if (u >= 1) return;
  // Open fast, hold, close fast. A symmetric sine would spend most of its time half-open, which
  // reads as a slow pulse rather than something being torn open.
  const open = u < st.riftOpen
    ? u / Math.max(0.001, st.riftOpen)
    : (u > 1 - st.riftClose ? (1 - u) / Math.max(0.001, st.riftClose) : 1);
  const w = st.riftWidth * fs * xf.k * clamp01(open);
  const h = st.riftHeight * fs * xf.k;
  if (w < 0.3 || h < 1) return;
  const segs = Math.max(4, Math.round(st.riftJagged > 0 ? 18 : 8));
  const c = layerColour(st, u, 0.25);
  const step = Math.floor(t * Math.max(1, st.riftFlicker));   // stepped, like the arc layer
  g.save();
  g.translate(ox, oy);
  g.rotate(st.riftAngle * DEG);
  g.globalAlpha = st.rift * c.a;
  g.fillStyle = c.css;
  // One closed lens: down the right edge, back up the left, each vertex pushed out by a hashed
  // jitter so the tear has a torn edge rather than a vector-perfect one.
  g.beginPath();
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= segs; i++) {
      const s = side === 0 ? i / segs : 1 - i / segs;
      const y = (s - 0.5) * h;
      const taper = Math.pow(Math.sin(s * Math.PI), 0.6);       // widest at the middle
      const j = 1 + rndS(seed + step * 17, i + side * 64, 41) * st.riftJagged * 0.6;
      const x = (side === 0 ? 1 : -1) * w * 0.5 * taper * j;
      if (side === 0 && i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
  g.closePath();
  g.fill();
  // A brighter core inside the tear sells "something is coming through" rather than "a hole".
  if (st.riftCore > 0) {
    const cc = layerColour(st, u * 0.4, 0.85);
    g.globalAlpha = st.rift * cc.a * st.riftCore;
    g.fillStyle = cc.css;
    g.beginPath();
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i <= segs; i++) {
        const s = side === 0 ? i / segs : 1 - i / segs;
        const y = (s - 0.5) * h * 0.9;
        const taper = Math.pow(Math.sin(s * Math.PI), 0.6);
        const x = (side === 0 ? 1 : -1) * w * 0.5 * taper * 0.35;
        if (side === 0 && i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    }
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ---------- sigil ----------
// A magic circle: concentric rings, a tick ring, and radial spokes, each ring counter-rotating
// against its neighbour. Rings alone read as a target; it's the OPPOSING rotation plus the tick
// marks that read as arcane machinery, which is why the spin alternates by index rather than
// giving every ring the same direction. Draws flat by default and squashes to a ground plane —
// summoning circles are almost always seen in perspective.
function drawSigil(g, st, t, xf, fs, ox, oy, seed) {
  if (st.sigil <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.sigilLife));
  if (u >= 1) return;
  const rings = Math.max(1, Math.round(st.sigilRings));
  const R = st.sigilRadius * fs * xf.k;
  // Scale in from nothing, hold, then fade — a sigil that simply appears at full size reads as a
  // static overlay rather than something being cast.
  const grow = st.sigilGrow > 0 ? Math.min(1, u / st.sigilGrow) : 1;
  const fade = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
  const scale = grow * (0.6 + 0.4 * grow);
  if (R * scale < 1) return;
  // Lower white-bias than the other ring layers on purpose: a summoning circle lives on its
  // colour, and at vortex's 0.55 it washes to lavender-white and loses the arcane read.
  const c = layerColour(st, u, 0.35);
  g.save();
  g.translate(ox, oy);
  g.scale(1, 1 - st.sigilSquash * 0.85);
  g.globalAlpha = st.sigil * c.a * clamp01(fade);
  g.strokeStyle = c.css;
  g.lineCap = "butt";
  for (let i = 0; i < rings; i++) {
    const rr = R * scale * (0.35 + 0.65 * ((i + 1) / rings));
    if (rr < 0.5) continue;
    const dir = i % 2 ? -1 : 1;                       // counter-rotation is the whole read
    const spin = dir * st.sigilSpin * DEG * t + i * 1.7;
    g.lineWidth = Math.max(0.5, st.sigilWidth * xf.k);
    if (st.sigilGap > 0) {
      const arcs = 2 + i * 2;
      const span = (Math.PI * 2 / arcs) * (1 - st.sigilGap * 0.8);
      for (let d = 0; d < arcs; d++) {
        const a0 = spin + (d / arcs) * Math.PI * 2;
        g.beginPath(); g.arc(0, 0, rr, a0, a0 + span); g.stroke();
      }
    } else {
      g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke();
    }
    // Tick marks on the outermost ring only — on every ring it turns to mush at small sizes.
    if (i === rings - 1 && st.sigilTicks > 0) {
      const ticks = Math.round(st.sigilTicks);
      const len = R * scale * 0.12;
      g.lineWidth = Math.max(0.5, st.sigilWidth * xf.k * 0.8);
      for (let d = 0; d < ticks; d++) {
        const a = spin + (d / ticks) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        // Vary tick length off a hashed draw so the ring reads as inscribed, not machined.
        const L = len * (0.5 + rnd(seed, d, 71));
        g.beginPath();
        g.moveTo(ca * rr, sa * rr);
        g.lineTo(ca * (rr + L), sa * (rr + L));
        g.stroke();
      }
    }
  }
  if (st.sigilSpokes > 0) {
    const sp = Math.round(st.sigilSpokes);
    const rOut = R * scale;
    const spin = st.sigilSpin * DEG * t * 0.5;
    g.lineWidth = Math.max(0.5, st.sigilWidth * xf.k * 0.7);
    for (let d = 0; d < sp; d++) {
      const a = spin + (d / sp) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * rOut * 0.3, Math.sin(a) * rOut * 0.3);
      g.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
      g.stroke();
    }
  }
  g.restore();
}

// ---------- orbit ----------
// Satellites on a tilted ellipse around the origin. The particle system can't express this: an
// orbit needs a body to keep returning to the same path, whereas a particle is born, flies and
// dies. The tilt is what sells it — a circle of dots reads as a ring, but an ellipse whose
// members shrink and dim on the far side reads as something going AROUND the subject. Shields,
// auras, buffs, orbiting sparks.
function drawOrbit(g, st, t, xf, fs, ox, oy, seed) {
  if (st.orbit <= 0) return;
  const n = Math.max(1, Math.round(st.orbitCount));
  const R = st.orbitRadius * fs * xf.k;
  if (R < 0.5) return;
  const squash = 1 - st.orbitTilt * 0.92;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.4);
  const tilt = st.orbitAngle * DEG;
  const ct = Math.cos(tilt), stt = Math.sin(tilt);
  // Orbit normally draws its own round beads, which is right for a shield or a ring of light but
  // makes the classic cartoon "stars circling a stunned head" impossible — the bodies ignored the
  // particle shape entirely, so a preset could be named for a shape it never drew. With the toggle
  // on they draw the emitter's selected shape SET instead, one shape per body by index, so a mixed
  // selection gives a ring of alternating things. Default off: every existing orbit preset (Shield
  // Orbit, Power Rings) keeps the exact beads it shipped with.
  // Orbit's own selection if it has one, otherwise the emitter's — so "stars circling a glow burst"
  // is expressible, while an effect that never touched the orbit picker keeps following the
  // particles exactly as it did before the picker existed.
  const orbitOwn = shapeList(st.orbitShapes);
  const orbitSet = st.orbitUseShape > 0.5
    ? (orbitOwn.length ? orbitOwn : shapeSet(st.shape, st.shapeMix))
    : null;
  g.save();
  g.globalAlpha = st.orbit * c.a;
  g.fillStyle = c.css;
  for (let i = 0; i < n; i++) {
    // Evenly spaced, plus a hashed wobble so they don't look mechanically placed.
    const phase = i / n + t * st.orbitSpeed + rnd(seed, i, 81) * st.orbitScatter;
    const a = phase * Math.PI * 2;
    const ex = Math.cos(a) * R;
    const ey = Math.sin(a) * R * squash;
    // depth: +1 near side (front, big/bright), -1 far side
    const depth = Math.sin(a);
    const scale = 1 + depth * st.orbitDepth * 0.6;
    const x = ox + ex * ct - ey * stt;
    const y = oy + ex * stt + ey * ct;
    const rr = Math.max(0.4, st.orbitSize * xf.k * 0.5 * scale);
    g.globalAlpha = st.orbit * c.a * clamp01(0.35 + 0.65 * (0.5 + depth * 0.5 * st.orbitDepth));
    if (orbitSet) {
      // Sized to the same diameter the bead would have had, so turning the toggle on doesn't also
      // change how big the ring reads. Drawn upright rather than tangent to the path: a star or a
      // heart pointing sideways looks like a mistake, not like motion.
      const spr = getSprite(orbitSet[i % orbitSet.length], c.h, c.s, c.l, st, 0);
      g.drawImage(spr, x - rr, y - rr, rr * 2, rr * 2);
    } else {
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
    if (st.orbitTrail > 0) {
      // A short arc swept BEHIND each body along its own path — a straight streak would betray
      // that these are dots being moved rather than things travelling a curve.
      const steps = 6;
      g.strokeStyle = c.css;
      g.lineWidth = rr * 1.1;
      g.lineCap = "round";
      g.beginPath();
      for (let s = 0; s <= steps; s++) {
        const back = a - (s / steps) * st.orbitTrail * 1.2;
        const bx = Math.cos(back) * R, by = Math.sin(back) * R * squash;
        const px = ox + bx * ct - by * stt, py = oy + bx * stt + by * ct;
        if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.globalAlpha *= 0.4;
      g.stroke();
    }
  }
  g.restore();
}

// ---------- bokeh ----------
// Soft out-of-focus discs drifting behind everything. Not particles: they never spawn, never die
// and ignore the emitter — they are the depth an effect sits in rather than part of the effect, so
// they are generated straight from the seed and moved by time alone. Ring-weighted rather than
// solid, because a defocused highlight is brightest at its edge; that is what separates bokeh from
// "blurry dots".
function drawBokeh(g, st, t, xf, fs, ox, oy, seed) {
  if (st.bokeh <= 0) return;
  const n = Math.max(1, Math.round(st.bokehCount));
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.35);
  const W = g.canvas.width, H = g.canvas.height;
  const drift = st.bokehDrift * Math.min(W, H) * 0.25;
  g.save();
  for (let i = 0; i < n; i++) {
    const bx = rnd(seed, i, 91), by = rnd(seed, i, 92), bs = rnd(seed, i, 93);
    const x = bx * W + Math.sin(t * 0.7 + i * 2.1) * drift;
    const y = by * H - t * drift * 0.6 + Math.cos(t * 0.5 + i * 1.3) * drift * 0.4;
    const r = Math.max(1, (0.35 + bs) * st.bokehSize * Math.min(W, H) * 0.06);
    const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    const edge = clamp01(st.bokehRing);
    grad.addColorStop(0, c.css);
    grad.addColorStop(Math.max(0.05, 1 - edge * 0.55), c.css);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = st.bokeh * c.a * (0.35 + 0.65 * bs);
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------- cone ----------
// A wedge of light from the origin: muzzle glow, headlight, a spell's line of sight. The Beam layer
// is a line of constant width, which cannot say "this spreads as it travels" — the whole point of a
// cone. Widening along its length is the entire shape, so the gradient runs along it rather than
// across, and the far edge fades rather than ending.
function drawCone(g, st, t, xf, fs, ox, oy, seed) {
  if (st.cone <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.coneLife));
  if (u >= 1) return;
  // Low white bias: a cone drawn near-white reads as grey paint on an empty canvas rather than
  // light, because additive over nothing just gives you the colour. Let its hue show.
  const c = layerColour(st, clamp01(t / Math.max(0.01, st.duration)), 0.3);
  const len = st.coneLength * fs * xf.k * (0.35 + 0.65 * Math.min(1, u * 2.2));
  const half = st.coneSpread * DEG * 0.5;
  const dir = (st.coneAngle - 90) * DEG;
  // Fades out over its life rather than vanishing — a light that switches off reads as a dropped
  // frame.
  const fade = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;
  g.save();
  g.globalAlpha = st.cone * c.a * clamp01(fade);
  g.translate(ox, oy);
  g.rotate(dir);
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, c.css);
  grad.addColorStop(clamp01(st.coneSoft), c.css);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(Math.cos(-half) * len, Math.sin(-half) * len);
  g.lineTo(Math.cos(half) * len, Math.sin(half) * len);
  g.closePath();
  g.fill();
  g.restore();
}

// ---------- arms ----------
// Logarithmic spiral arms sweeping out of the origin — a galaxy, a summoning, water going down a
// drain. The Vortex layer curls PARTICLES around a centre and the spiral SHAPE draws one coil per
// sprite; neither can draw the structure itself, which is what an arm is: a curve that exists
// whether or not anything is travelling along it.
function drawArms(g, st, t, xf, fs, ox, oy, seed) {
  if (st.arms <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.armLife));
  if (u >= 1) return;
  const n = Math.max(1, Math.round(st.armCount));
  const c = layerColour(st, clamp01(t / Math.max(0.01, st.duration)), 0.4);
  const reach = st.armReach * fs * xf.k * Math.min(1, 0.25 + u * 1.4);
  const spin = t * st.armSpin;
  const fade = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
  g.save();
  g.globalAlpha = st.arms * c.a * clamp01(fade);
  g.strokeStyle = c.css;
  g.lineCap = "round";
  const STEPS = 26;
  for (let a = 0; a < n; a++) {
    const base = (a / n) * Math.PI * 2 + spin;
    g.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const f = i / STEPS;
      // Logarithmic, so the arm opens out rather than coiling evenly — an even coil reads as a
      // spring, this reads as something thrown outward while turning.
      const r = reach * Math.pow(f, 0.75);
      const th = base + f * st.armTurns * Math.PI * 2;
      const x = ox + Math.cos(th) * r, y = oy + Math.sin(th) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineWidth = Math.max(0.5, st.armWidth * xf.k * 2);
    g.stroke();
  }
  g.restore();
}

// ---------- grid ----------
// An expanding wireframe: tech overlays, hologram tables, a portal's floor. Deliberately drawn in
// PERSPECTIVE rather than flat — a flat grid is wallpaper, a tilted one is a surface, and the whole
// value of a grid is telling you there is a plane there.
function drawGrid(g, st, t, xf, fs, ox, oy, seed) {
  if (st.grid <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.gridLife));
  if (u >= 1) return;
  const cells = Math.max(2, Math.round(st.gridCells));
  const c = layerColour(st, clamp01(t / Math.max(0.01, st.duration)), 0.45);
  const reach = st.gridReach * fs * xf.k * (0.3 + 0.7 * Math.min(1, u * 1.6));
  const squash = 1 - clamp01(st.gridTilt) * 0.88;
  const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
  g.save();
  g.globalAlpha = st.grid * c.a * clamp01(fade);
  g.strokeStyle = c.css;
  g.lineWidth = Math.max(0.4, st.gridWidth * xf.k);
  g.translate(ox, oy);
  g.scale(1, squash);
  // Concentric rings plus spokes: the polar form of a grid, which expands from a point the way an
  // effect does. A square lattice would have to come from an edge.
  for (let i = 1; i <= cells; i++) {
    const r = reach * (i / cells);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  }
  const spokes = Math.max(3, Math.round(st.gridSpokes));
  for (let i = 0; i < spokes; i++) {
    const th = (i / spokes) * Math.PI * 2 + t * st.gridSpin;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(th) * reach, Math.sin(th) * reach);
    g.stroke();
  }
  g.restore();
}

// ---------- light shafts ----------
// Volumetric shafts fanning from the origin — light through a window, a rift, a boss doorway. Cone
// is ONE solid wedge and Lines are hard-edged rays; a shaft is neither, it is a soft-edged beam
// with a bright root that fades to nothing, and the gaps between shafts are as much of the look as
// the shafts. Widths are hashed per shaft, because evenly-spaced identical beams read as a fan.
function drawShafts(g, st, t, xf, fs, ox, oy, seed) {
  if (st.shafts <= 0) return;
  const u = clamp01(t / Math.max(0.01, st.shaftLife));
  if (u >= 1) return;
  const n = Math.max(1, Math.round(st.shaftCount));
  const c = layerColour(st, clamp01(t / Math.max(0.01, st.duration)), 0.45);
  const len = st.shaftLength * fs * xf.k * (0.4 + 0.6 * Math.min(1, u * 2));
  const fade = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
  const spin = t * st.shaftSpin;
  g.save();
  g.translate(ox, oy);
  g.rotate(spin);
  for (let i = 0; i < n; i++) {
    const base = (i / n) * Math.PI * 2;
    const wob = 0.45 + rnd(seed, i, 96) * 1.1;             // uneven, or it reads as a paper fan
    const half = st.shaftWidth * DEG * 0.5 * wob;
    const grad = g.createLinearGradient(0, 0, Math.cos(base) * len, Math.sin(base) * len);
    grad.addColorStop(0, c.css);
    grad.addColorStop(0.25, c.css);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = st.shafts * c.a * clamp01(fade) * (0.5 + 0.5 * rnd(seed, i, 97));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(base - half) * len, Math.sin(base - half) * len);
    g.lineTo(Math.cos(base + half) * len, Math.sin(base + half) * len);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ---------- lens droplets ----------
// Water sitting ON the lens rather than falling through the scene. That is the whole distinction
// from the Weather layer: these do not move with the world, they cling, sag slowly and catch a
// highlight — which is what tells you there is a camera between you and the effect.
function drawDroplets(g, st, t, xf, fs, ox, oy, seed) {
  if (st.drops <= 0) return;
  const n = Math.max(1, Math.round(st.dropCount));
  const c = layerColour(st, clamp01(t / Math.max(0.01, st.duration)), 0.55);
  const W = g.canvas.width, H = g.canvas.height;
  g.save();
  for (let i = 0; i < n; i++) {
    const dx = rnd(seed, i, 98), dy = rnd(seed, i, 99), ds = rnd(seed, i, 100);
    // Sag, not fall: a droplet on glass creeps and stops, so the drift is small and eased.
    const sag = st.dropSag * H * 0.08 * (1 - Math.exp(-t * 1.5)) * (0.4 + ds);
    const x = dx * W, y = dy * H + sag;
    const r = Math.max(1.2, (0.4 + ds) * st.dropSize * Math.min(W, H) * 0.035);
    g.globalAlpha = st.drops * c.a * (0.4 + 0.6 * ds);
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    grad.addColorStop(0, c.css);
    grad.addColorStop(0.55, "rgba(0,0,0,0)");
    grad.addColorStop(0.85, c.css);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------- twinkle ----------
// Four-point stars popping on and off at fixed points. Not particles: they never travel, and their
// whole character is the POP — up and gone inside a few frames, on a hashed schedule so no two
// share a beat. Particles with a star shape would drift and fade together; this reads as glinting.
function drawTwinkle(g, st, t, xf, fs, ox, oy, seed) {
  if (st.twinkle <= 0) return;
  const n = Math.max(1, Math.round(st.twinkleCount));
  const c = layerColour(st, clamp01(t / Math.max(0.01, st.duration)), 0.75);
  const W = g.canvas.width, H = g.canvas.height;
  const period = 1 / Math.max(0.1, st.twinkleRate);
  g.save();
  g.strokeStyle = c.css;
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const tx = rnd(seed, i, 101), ty = rnd(seed, i, 102), ph = rnd(seed, i, 103);
    const local = ((t / period) + ph) % 1;
    if (local > 0.5) continue;                    // dark for half its cycle — the gap IS the twinkle
    const k = Math.sin(local * Math.PI * 2);      // up and back down inside the visible half
    if (k <= 0.01) continue;
    const x = tx * W, y = ty * H;
    const r = st.twinkleSize * Math.min(W, H) * 0.05 * k;
    g.globalAlpha = st.twinkle * c.a * k;
    g.lineWidth = Math.max(0.5, r * 0.18);
    g.beginPath();
    g.moveTo(x - r, y); g.lineTo(x + r, y);
    g.moveTo(x, y - r); g.lineTo(x, y + r);
    g.stroke();
  }
  g.restore();
}

// ---------- particle rings ----------
// A ring pulsing outward from EVERY particle, phase-offset by its id. The Ripples layer sends rings
// from the origin, which says "something happened here"; this says "every one of these things is
// pulsing" — sonar contacts, bubbles, charged motes. It reads the frame table for the same reason
// the web and path-trail layers do: it needs where the particles actually are.
function drawPRings(g, sim, f, st, xf) {
  if (st.prings <= 0) return;
  const arr = sim.frames[f], n = sim.counts[f];
  const t = f / sim.fps;
  const c = layerColour(st, clamp01(t / Math.max(0.01, st.duration)), 0.4);
  const maxR = st.pringSize * sim.fs * xf.k * 0.25;
  const period = 1 / Math.max(0.1, st.pringRate);
  g.save();
  g.strokeStyle = c.css;
  for (let i = 0; i < n; i++) {
    const o = i * P_STRIDE;
    if (arr[o + P_KIND] !== K_PART && arr[o + P_KIND] !== K_PART2) continue;
    const a = arr[o + P_ALPHA];
    if (a <= 0.02) continue;
    const id = arr[o + P_ID];
    const ph = ((t / period) + (id * 0.61803) % 1) % 1;    // golden-ratio stagger: no two in step
    const r = ph * maxR;
    if (r < 0.5) continue;
    const x = arr[o + P_X] * xf.k + xf.dx, y = arr[o + P_Y] * xf.k + xf.dy;
    g.globalAlpha = st.prings * c.a * a * (1 - ph) * (1 - ph);
    g.lineWidth = Math.max(0.4, st.pringWidth * xf.k);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

// ---------- tumble ----------
// Flat pieces falling and turning over in pseudo-3D: confetti, petals, leaves, paper, coins. The
// trick is that scaleY passes through zero — that instant of zero width IS the edge-on frame, and
// it's what separates "a card flipping" from "a sprite spinning". Everything else in the app is a
// billboard that always faces the viewer, so this is the one engine with a sense of facing.
function drawTumble(g, st, t, xf, fs, ox, oy, seed) {
  if (st.tumble <= 0) return;
  const n = Math.max(1, Math.round(st.tumbleCount));
  const spread = st.tumbleSpread * fs * xf.k;
  const u = clamp01(t / Math.max(0.01, st.duration));
  const c = layerColour(st, u, 0.25);
  const sz = st.tumbleSize * xf.k;
  g.save();
  for (let i = 0; i < n; i++) {
    const life = st.duration * (0.6 + rnd(seed, i, 91) * 0.4);
    const age = t - rnd(seed, i, 92) * st.tumbleStagger * st.duration;
    if (age <= 0) continue;
    const p = age / life;
    if (p >= 1) continue;
    // Ballistic fall with sideways drift; drift direction is hashed per piece so the cloud
    // spreads instead of moving as a block.
    const drift = rndS(seed, i, 93);
    const x = ox + rndS(seed, i, 94) * spread + drift * st.tumbleDrift * fs * xf.k * age;
    const y = oy + rndS(seed, i, 95) * spread * 0.3 +
              0.5 * st.tumbleFall * fs * xf.k * age * age;
    // Each piece turns at its own rate, about its own axis phase.
    const flip = (rnd(seed, i, 96) + age * st.tumbleFlip * (0.5 + rnd(seed, i, 97))) * Math.PI * 2;
    const roll = rndS(seed, i, 98) * st.tumbleRoll * DEG * age;
    const fade = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
    const w = sz * (0.6 + rnd(seed, i, 99) * 0.8);
    const h = w * st.tumbleAspect;
    g.save();
    g.translate(x, y);
    g.rotate(roll);
    g.scale(1, Math.cos(flip));            // through zero = edge-on
    // Dim the back face so a flip reads as a turn rather than a squash.
    const facing = Math.cos(flip) < 0 ? 0.55 : 1;
    g.globalAlpha = st.tumble * c.a * clamp01(fade) * facing;
    g.fillStyle = c.css;
    g.fillRect(-w * 0.5, -h * 0.5, w, h);
    g.restore();
  }
  g.restore();
}

// ---------- shatter ----------
// A shape that holds together, then breaks into fragments that fly apart. Glass, ice, stone,
// shields. Particles can't do this: the pieces have to START as one object and be a partition of
// it, or the "it was whole a moment ago" reading is lost. So it's a generator — a disc cut into
// wedges, each wedge given its own velocity, spin and centroid to rotate about.
function drawShatter(g, st, t, xf, fs, ox, oy, seed) {
  if (st.shatter <= 0) return;
  const hold = st.duration * st.shatterHold;
  const n = Math.max(3, Math.round(st.shatterPieces));
  const R = st.shatterRadius * fs * xf.k;
  const age = Math.max(0, t - hold);
  const u = clamp01(t / Math.max(0.01, st.duration));
  const fade = st.shatterFade > 0 ? clamp01(1 - (u - (1 - st.shatterFade)) / st.shatterFade) : 1;
  if (fade <= 0) return;
  const c = layerColour(st, u, 0.5);
  g.save();
  g.globalAlpha = st.shatter * c.a * clamp01(fade);
  g.fillStyle = c.css;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const rOut = R * (0.75 + rnd(seed, i, 61) * 0.25);
    const rIn = R * rnd(seed, i, 62) * 0.35;
    const mid = (a0 + a1) / 2;
    // Each piece flies along its own bearing, so the break radiates rather than scattering.
    const sp = st.shatterSpeed * (0.6 + rnd(seed, i, 63) * 0.8) * xf.k;
    const px2 = Math.cos(mid) * sp * age;
    const py2 = Math.sin(mid) * sp * age + 0.5 * st.shatterGravity * xf.k * age * age;
    const spin = rndS(seed, i, 64) * st.shatterSpin * DEG * age;
    // rotate about the piece's own centroid, not the origin — otherwise it orbits instead of tumbling
    const cx = Math.cos(mid) * (rIn + rOut) / 2, cy = Math.sin(mid) * (rIn + rOut) / 2;
    g.save();
    g.translate(ox + px2, oy + py2);
    g.translate(cx, cy);
    g.rotate(spin);
    g.translate(-cx, -cy);
    g.beginPath();
    g.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
    g.lineTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
    g.lineTo(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
    g.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
}

// ---------- impact lines ----------
// The anime hit-emphasis ring: tapered spokes radiating from a gap in the middle. `flashRays`
// gestures at this with uniform spokes from a point; this has an inner radius, per-spoke length
// jitter, taper and its own life, which is the difference between "a star" and "an impact".
function drawLines(g, st, t, xf, fs, ox, oy, seed) {
  if (st.lines <= 0) return;
  const u = t / Math.max(0.01, st.lineLife);
  if (u >= 1) return;
  const n = Math.max(3, Math.round(st.lineCount));
  const grow = st.lineDir ? 1 - u : u;                    // outward, or converging inward
  const inner = st.lineInner * fs * xf.k * (0.4 + 0.6 * grow);
  const outer = st.lineOuter * fs * xf.k * (0.4 + 0.6 * grow);
  const spin = st.lineSpin * DEG * t;
  const c = layerColour(st, u, 0.8);
  g.save();
  g.translate(ox, oy);
  g.globalAlpha = st.lines * c.a * (1 - u * u);
  g.fillStyle = c.css;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + spin;
    const jit = 1 - rnd(seed, i, 71) * st.lineJitter;
    const r0 = inner, r1 = inner + (outer - inner) * jit;
    if (r1 <= r0) continue;
    const wOut = st.lineWidth * xf.k * 0.5;
    const wIn = wOut * (1 - st.lineTaper);
    const ca = Math.cos(a), sa = Math.sin(a), px2 = -sa, py2 = ca;   // perpendicular
    g.beginPath();
    g.moveTo(ca * r0 + px2 * wIn, sa * r0 + py2 * wIn);
    g.lineTo(ca * r1 + px2 * wOut, sa * r1 + py2 * wOut);
    g.lineTo(ca * r1 - px2 * wOut, sa * r1 - py2 * wOut);
    g.lineTo(ca * r0 - px2 * wIn, sa * r0 - py2 * wIn);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ---------- dissolve ----------
// A noise threshold that erases (or reveals) the WHOLE frame over time — burn-away, materialise,
// teleport-out. Unlike everything else here it isn't a thing that draws, it's a post pass over
// whatever else drew, which is why it composes with every effect in the tool.
//
// The noise field is computed ONCE per render and reused for every frame: per-pixel value noise
// on 29 frames would be a million lattice lookups, and a dissolve pattern that changed per frame
// would sparkle instead of dissolve.
let dissolveKey = null, dissolveField = null;
function dissolveNoise(seed, scale, w, h) {
  const key = seed + "," + scale + "," + w + "," + h;
  if (dissolveKey === key) return dissolveField;
  const f = new Float32Array(w * h);
  const s = Math.max(0.5, scale);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      f[y * w + x] = clamp01((vnoise(seed, x / w * s, y / h * s, 0) + 1) / 2);
    }
  }
  dissolveKey = key; dissolveField = f;
  return f;
}

// ---------- palette lock ----------
// Pixel artists work INSIDE a palette, not around one. "Make this effect use my 16 colours" turns
// a generic particle sim into something that drops straight into their game. Stored in the patch
// as a comma-separated hex list, so it travels in share links and saved effects.
let palCacheSrc = null, palCacheArr = null;
function parsePalette(src) {
  if (!src) return null;
  if (palCacheSrc === src) return palCacheArr;
  const out = [];
  for (const tok of String(src).split(/[,\s]+/)) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(tok.trim());
    if (m) out.push([parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]);
  }
  palCacheSrc = src;
  palCacheArr = out.length ? out : null;
  return palCacheArr;
}

// ---------- speech bubble / emote frame ----------
// The odd one out in this tool: a bubble is a stretched box with a tail and text in it, not a
// particle. So it's a LAYER — drawn once per frame from `t`, with no simulation behind it.
//
// It's drawn after the glow (a bright box blooming into a haze looks like a mistake) but before
// pixelate/posterize/outline, so it still takes on the art style rather than sitting on top of it
// looking like a different program.
function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function drawBubble(g, st, t, out) {
  if (st.bubble <= 0 || !st.bubbleText) return;
  const u = t / st.bubbleLife;
  if (u < 0 || u >= 1) return;

  // Pop in with an over-shoot (easeOutBack), hold, then fade. The overshoot is what makes it feel
  // like a comic panel rather than a fading rectangle.
  const inT = 0.2, outT = 0.25;
  let scale = 1, alpha = 1;
  if (u < inT) {
    const k = u / inT, c1 = 1.70158 * st.bubblePop, c3 = c1 + 1;
    scale = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    alpha = Math.min(1, k * 2.5);
  } else if (u > 1 - outT) {
    alpha = (1 - u) / outT;
  }
  scale = Math.max(0.01, scale);
  alpha = clamp01(alpha) * st.bubble;

  const lines = String(st.bubbleText).split("|").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return;
  const fontPx = Math.max(6, out * st.bubbleSize * 0.19);
  g.save();
  g.globalCompositeOperation = "source-over";   // never additive — a bubble is opaque UI, not light
  g.globalAlpha = alpha;
  g.font = "600 " + fontPx.toFixed(1) + 'px system-ui, "Segoe UI", sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";

  let textW = 0;
  for (const ln of lines) textW = Math.max(textW, g.measureText(ln).width);
  const padX = fontPx * 0.7, padY = fontPx * 0.45;
  const boxW = textW + padX * 2, boxH = lines.length * fontPx * 1.2 + padY * 2;
  const cx = out / 2, cy = st.bubbleY * out;

  g.translate(cx, cy);
  g.scale(scale, scale);

  const fill = hsl(st.hue, st.sat * 0.12, clamp01(0.95 * st.bright));
  const ink = hsl(st.hue, st.sat * 0.45, 0.15);
  const x = -boxW / 2, y = -boxH / 2;
  roundRectPath(g, x, y, boxW, boxH, boxH * 0.5 * st.bubbleRound);
  g.fillStyle = fill;
  g.fill();
  if (st.bubbleTail > 0) {                       // a tail below, pointing at whoever is speaking
    const tw = boxH * 0.32 * st.bubbleTail, th = boxH * 0.45 * st.bubbleTail;
    g.beginPath();
    g.moveTo(-tw / 2, y + boxH - 1);
    g.lineTo(tw / 2, y + boxH - 1);
    g.lineTo(-tw * 0.1, y + boxH + th);
    g.closePath();
    g.fill();
  }
  if (st.bubbleOutline > 0) {
    g.lineWidth = st.bubbleOutline;
    g.strokeStyle = ink;
    g.lineJoin = "round";
    roundRectPath(g, x, y, boxW, boxH, boxH * 0.5 * st.bubbleRound);
    g.stroke();
    if (st.bubbleTail > 0) {
      const tw = boxH * 0.32 * st.bubbleTail, th = boxH * 0.45 * st.bubbleTail;
      g.beginPath();
      g.moveTo(-tw / 2, y + boxH - 1);
      g.lineTo(-tw * 0.1, y + boxH + th);
      g.lineTo(tw / 2, y + boxH - 1);
      g.stroke();
    }
  }
  g.fillStyle = ink;
  lines.forEach((ln, i) => {
    g.fillText(ln, 0, y + padY + fontPx * 0.6 + i * fontPx * 1.2);
  });
  g.restore();
}

// ---------- post-processing ----------
// All of it hand-rolled over ImageData. Deliberately NOT ctx.filter: blur via ctx.filter is
// unreliable in the Tauri WebKitGTK webview, and offline rendering means cost is irrelevant.

// 3-pass box blur ≈ Gaussian. Operates on premultiplied RGBA so soft edges don't halo.
function boxBlur(src, w, h, r) {
  if (r < 1) return src;
  let a = src, b = new Uint8ClampedArray(src.length);
  for (let pass = 0; pass < 3; pass++) {
    blurPass(a, b, w, h, r, true);
    blurPass(b, a, w, h, r, false);
  }
  return a;
}
function blurPass(src, dst, w, h, r, horiz) {
  const n = horiz ? w : h, m = horiz ? h : w;
  const stepIn = horiz ? 4 : w * 4, stepOut = horiz ? w * 4 : 4;
  for (let j = 0; j < m; j++) {
    const base = j * stepOut;
    let r0 = 0, g0 = 0, b0 = 0, a0 = 0;
    const win = r * 2 + 1;
    for (let i = -r; i <= r; i++) {
      const k = base + Math.min(n - 1, Math.max(0, i)) * stepIn;
      r0 += src[k]; g0 += src[k + 1]; b0 += src[k + 2]; a0 += src[k + 3];
    }
    for (let i = 0; i < n; i++) {
      const o = base + i * stepIn;
      dst[o] = r0 / win; dst[o + 1] = g0 / win; dst[o + 2] = b0 / win; dst[o + 3] = a0 / win;
      const add = base + Math.min(n - 1, i + r + 1) * stepIn;
      const sub = base + Math.max(0, i - r) * stepIn;
      r0 += src[add] - src[sub]; g0 += src[add + 1] - src[sub + 1];
      b0 += src[add + 2] - src[sub + 2]; a0 += src[add + 3] - src[sub + 3];
    }
  }
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// The finishing chain, in the order the params read top-to-bottom in the Crunch panel.
function postProcess(cv, st, overlay, t) {
  const w = cv.width, h = cv.height, g = cv.getContext("2d");

  // ---------- haze ----------
  // Heat shimmer: displace each pixel by a scrolling wave instead of changing its colour. Every
  // other post pass is a per-pixel COLOUR operation (blur, threshold, quantize); this one moves
  // pixels, which is a category the chain didn't have — and it's what makes fire, jets and
  // explosions read as hot rather than merely orange.
  //
  // Runs FIRST so everything after it (glow, crunch, outline) sees the displaced image; warping
  // an already-outlined sprite would tear the outline off its edge.
  if (st.haze > 0) {
    const src = g.getImageData(0, 0, w, h);
    const sd = src.data;
    const dst = g.createImageData(w, h);
    const dd = dst.data;
    const amp = st.haze * st.hazeAmount * frameRefPx(w, h) * 0.06;
    const scale = Math.max(0.5, st.hazeScale) * 0.06;
    const phase = t * st.hazeSpeed * 6.283;
    for (let y = 0; y < h; y++) {
      // Two waves at different frequencies per axis — a single sine reads as a rolling banner,
      // whereas beating frequencies read as turbulent air.
      const ox = (Math.sin(y * scale + phase) + Math.sin(y * scale * 2.3 + phase * 1.7) * 0.5) * amp;
      for (let x = 0; x < w; x++) {
        const oy = (Math.sin(x * scale * 1.3 + phase * 0.8) +
                    Math.sin(x * scale * 2.9 + phase * 1.3) * 0.5) * amp * 0.6;
        // Clamp rather than wrap: wrapping drags the opposite edge into frame, which on a
        // transparent sprite sheet shows up as stray pixels on the far side.
        let sx = Math.round(x + ox), sy = Math.round(y + oy);
        if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
        if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
        const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
        dd[di] = sd[si]; dd[di + 1] = sd[si + 1];
        dd[di + 2] = sd[si + 2]; dd[di + 3] = sd[si + 3];
      }
    }
    g.putImageData(dst, 0, 0);
  }

  // ---------- slice ----------
  // Cut the frame along a line and slide the two halves apart. Every other post pass filters or
  // displaces pixels smoothly; this one is a hard GEOMETRIC cut with a clean gap, which is the
  // single most-requested sword-slash effect and impossible to fake with particles — the sprite
  // itself has to come apart.
  if (st.slice > 0) {
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const out = new Uint8ClampedArray(src.length);
    const ref = frameRefPx(w, h);
    const ang = st.sliceAngle * DEG;
    const dx = Math.cos(ang), dy = Math.sin(ang);        // along the cut
    const nx = -dy, ny = dx;                             // across it
    const off = st.slice * st.sliceOffset * ref * 0.25;
    const gap = st.slice * st.sliceGap * ref * 0.06;
    const cx = w / 2 + (st.sliceX - 0.5) * w, cy = h / 2 + (st.sliceY - 0.5) * h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const perp = (x - cx) * nx + (y - cy) * ny;
        if (Math.abs(perp) < gap) continue;              // the kerf: left transparent
        const side = perp >= 0 ? 1 : -1;
        // Sample from where this pixel came FROM, so the halves slide in opposite directions
        // along the cut rather than the image being smeared.
        const sx = Math.round(x - side * dx * off), sy = Math.round(y - side * dy * off);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const so = (sy * w + sx) * 4;
        out[o] = src[so]; out[o + 1] = src[so + 1];
        out[o + 2] = src[so + 2]; out[o + 3] = src[so + 3];
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  // ---------- warp ----------
  // A ring of refraction travelling outward — the air-bending shell of a blast. Haze is also
  // displacement, and this is the same family, but the SHAPE is what matters: haze is a standing
  // shimmer over the whole frame, warp is a single travelling front with nothing behind it. One
  // says hot, the other says something just detonated.
  if (st.warp > 0) {
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const out = new Uint8ClampedArray(src.length);
    const ref = frameRefPx(w, h);
    const cx = w / 2, cy = h / 2;
    const u = clamp01(t / Math.max(0.01, st.warpLife));
    const radius = u * st.warpReach * ref;
    const band = Math.max(1, st.warpBand * ref * 0.2);
    const amp = st.warp * st.warpAmount * ref * 0.08 * (1 - u);   // decays as it expands
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const ddx = x - cx, ddy = y - cy;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const off = d - radius;
        let sx = x, sy = y;
        if (Math.abs(off) < band) {
          // A single sine across the band: pixels ahead of the front pull in, behind it push out.
          const push = Math.sin((off / band) * Math.PI) * amp;
          sx = Math.round(x + (ddx / d) * push);
          sy = Math.round(y + (ddy / d) * push);
          if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
          if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
        }
        const so = (sy * w + sx) * 4;
        out[o] = src[so]; out[o + 1] = src[so + 1];
        out[o + 2] = src[so + 2]; out[o + 3] = src[so + 3];
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  // ---------- aura ----------
  // A coloured halo that hugs the silhouette. This is NOT glow: glow blooms bright pixels outward
  // additively, so a dark sprite gets none and a white one washes out. Aura is derived from the
  // ALPHA — it traces whatever shape ended up on the frame, whatever colour it is — and sits
  // BEHIND it, so the sprite stays crisp and gains a rim. Rim light, spirit glow, holy/cursed
  // outlines, readability against a busy background.
  //
  // Runs before glow so the halo can bloom too.
  if (st.aura > 0) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const mask = new Uint8ClampedArray(d.length);
    for (let i = 3; i < d.length; i += 4) mask[i] = d[i];        // alpha only
    const spread = boxBlur(mask, w, h, Math.max(1, Math.round(st.auraRadius)));
    const col = layerColour(st, 0.5, 1 - st.auraTint);
    // Parse the layer colour once into components rather than per pixel.
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = col.css;
    probe.fillRect(0, 0, 1, 1);
    const rgb = probe.getImageData(0, 0, 1, 1).data;
    const amt = st.aura;
    for (let i = 0; i < d.length; i += 4) {
      const halo = spread[i + 3] * amt;
      if (halo <= 1) continue;
      const own = d[i + 3] / 255;
      // Behind the sprite: the halo only fills where the sprite isn't.
      const add = halo * (1 - own);
      if (add <= 1) continue;
      const k = add / 255;
      d[i]     = d[i]     * own + rgb[0] * k * (1 - own) + d[i]     * (1 - own) * (1 - k);
      d[i + 1] = d[i + 1] * own + rgb[1] * k * (1 - own) + d[i + 1] * (1 - own) * (1 - k);
      d[i + 2] = d[i + 2] * own + rgb[2] * k * (1 - own) + d[i + 2] * (1 - own) * (1 - k);
      d[i + 3] = Math.min(255, d[i + 3] + add);
    }
    g.putImageData(img, 0, 0);
  }

  // ---------- smear ----------
  // Directional blur: the frame is averaged along one axis. Glow is isotropic (it spreads equally
  // in every direction) and haze DISPLACES pixels; this convolves them along a line, which is what
  // motion actually does to a camera. Speed, dashes, whip-pans, the smear frames a hand animator
  // draws between two poses.
  if (st.smear > 0) {
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const out = new Uint8ClampedArray(src.length);
    const ang = st.smearAngle * DEG;
    const dist = st.smearAmount * frameRefPx(w, h) * 0.12;
    const taps = Math.max(2, Math.min(24, Math.round(dist)));
    const dx = Math.cos(ang) * dist / taps, dy = Math.sin(ang) * dist / taps;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // MAX along the trail, not the mean. A mean is a blur: it divides a lone bright particle
        // by the total tap weight, so sparse sprites (which is most of them here) come out dimmer
        // than they went in — the first version visibly ate the effect. Taking the brightest
        // sample with a falloff keeps the head at full strength and lays a fading tail behind it,
        // which is what a smear frame actually looks like.
        let r = 0, gg = 0, b = 0, a = 0;
        for (let k = 0; k < taps; k++) {
          // Trail BEHIND only (one direction), not symmetric — symmetric reads as out-of-focus
          // rather than moving.
          const sx = Math.round(x - dx * k), sy = Math.round(y - dy * k);
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const o = (sy * w + sx) * 4;
          const fall = 1 - k / taps;
          const av = src[o + 3] * fall;
          if (av > a) { a = av; r = src[o] * fall; gg = src[o + 1] * fall; b = src[o + 2] * fall; }
        }
        const o = (y * w + x) * 4;
        const m = st.smear;
        out[o]     = Math.max(src[o],     src[o]     * (1 - m) + r * m);
        out[o + 1] = Math.max(src[o + 1], src[o + 1] * (1 - m) + gg * m);
        out[o + 2] = Math.max(src[o + 2], src[o + 2] * (1 - m) + b * m);
        out[o + 3] = Math.max(src[o + 3], a * m);
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  if (st.kaleido > 0 && st.kalCount >= 2) {
    // Fold the frame into N mirrored wedges around the origin. This is the one system that changes
    // an effect's SYMMETRY rather than its colour or motion, which is why a burst put through it
    // stops being a burst and becomes a mandala — the source material is unchanged, the geometry is
    // not. Mirroring alternate wedges (rather than rotating copies) is what makes the seams meet:
    // rotation alone leaves a visible cut at every boundary.
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const out = new Uint8ClampedArray(src.length);
    const cx = st.originX * w, cy = st.originY * h;
    const seg = (Math.PI * 2) / Math.round(st.kalCount);
    const roll = st.kalSpin * DEG;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        let th = Math.atan2(dy, dx) - roll;
        th = ((th % seg) + seg) % seg;                    // into one wedge
        if (th > seg / 2) th = seg - th;                  // mirror the far half back
        th += roll;
        const sx = Math.round(cx + Math.cos(th) * r), sy = Math.round(cy + Math.sin(th) * r);
        const o = (y * w + x) * 4;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const s2 = (sy * w + sx) * 4;
        const m = st.kaleido;
        out[o]     = src[o]     + (src[s2]     - src[o])     * m;
        out[o + 1] = src[o + 1] + (src[s2 + 1] - src[o + 1]) * m;
        out[o + 2] = src[o + 2] + (src[s2 + 2] - src[o + 2]) * m;
        out[o + 3] = src[o + 3] + (src[s2 + 3] - src[o + 3]) * m;
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  if (st.zoom > 0) {
    // Radial blur — the frame smeared along lines radiating from the origin. Reads as rushing
    // toward the viewer, which is what an impact or a dash wants and what no per-particle setting
    // can produce: Smear moves every pixel the same way, this moves each one along its OWN ray.
    //
    // MAX with falloff, not a mean, for the same reason smear does it: averaging divides a lone
    // bright particle by the tap count and eats sparse effects, which is most of them here.
    // `zoomInner` keeps a sharp core — a fully smeared frame has nothing left to be smeared from.
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const out = new Uint8ClampedArray(src);
    const cx = st.originX * w, cy = st.originY * h;
    const ref = frameRefPx(w, h);
    const reach = st.zoomAmount * 0.25;
    const taps = Math.max(2, Math.min(20, Math.round(4 + st.zoomAmount * 14)));
    const inner = st.zoomInner * ref * 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ddx = x - cx, ddy = y - cy;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < inner || dist < 0.5) continue;
        let r = 0, gg = 0, b = 0, a = 0;
        for (let k = 0; k < taps; k++) {
          const f = 1 - (k / taps) * reach;            // sample back toward the centre
          const sx = Math.round(cx + ddx * f), sy = Math.round(cy + ddy * f);
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const o2 = (sy * w + sx) * 4;
          const fall = 1 - k / taps;
          const av = src[o2 + 3] * fall;
          if (av > a) { a = av; r = src[o2] * fall; gg = src[o2 + 1] * fall; b = src[o2 + 2] * fall; }
        }
        const o = (y * w + x) * 4, m = st.zoom;
        out[o]     = Math.max(src[o],     r * m);
        out[o + 1] = Math.max(src[o + 1], gg * m);
        out[o + 2] = Math.max(src[o + 2], b * m);
        out[o + 3] = Math.max(src[o + 3], a * m);
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  if (st.glow > 0) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const bright = new Uint8ClampedArray(d.length);
    const thr = st.glowThresh * 255;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) * (d[i + 3] / 255);
      if (lum >= thr) { bright[i] = d[i]; bright[i + 1] = d[i + 1]; bright[i + 2] = d[i + 2]; bright[i + 3] = d[i + 3]; }
    }
    const blurred = boxBlur(bright, w, h, Math.max(1, Math.round(st.glowRadius)));
    const amt = st.glow;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] + blurred[i] * amt);
      d[i + 1] = Math.min(255, d[i + 1] + blurred[i + 1] * amt);
      d[i + 2] = Math.min(255, d[i + 2] + blurred[i + 2] * amt);
      d[i + 3] = Math.min(255, Math.max(d[i + 3], blurred[i + 3] * amt));
    }
    g.putImageData(img, 0, 0);
  }

  // The overlay (speech bubble) lands here: past the glow so it isn't bloomed, ahead of the
  // pixel-art stages so it gets crunched with everything else.
  if (overlay) overlay(g);

  if (st.streak > 0) {
    // Anamorphic streaks: the bright cores drawn out into a cross, the way a lens flares a point of
    // light. Distinct from Glow, which spreads a halo equally in all directions and therefore can
    // never say "this is a LIGHT" rather than "this is bright" — direction is the whole signal.
    // Additive, and built only from pixels above the threshold, so it decorates highlights instead
    // of fogging the frame.
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const add = new Float32Array(w * h * 3);
    const thr = st.streakThresh * 255;
    const len = Math.max(2, Math.round(st.streakLength * frameRefPx(w, h) * 0.5));
    const ang = st.streakAngle * DEG;
    const arms = [[Math.cos(ang), Math.sin(ang)], [-Math.cos(ang), -Math.sin(ang)],
                  [-Math.sin(ang), Math.cos(ang)], [Math.sin(ang), -Math.cos(ang)]];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const lum = (src[o] * 0.3 + src[o + 1] * 0.6 + src[o + 2] * 0.1) * (src[o + 3] / 255);
        if (lum < thr) continue;
        for (const [ax, ay] of arms) {
          for (let k = 1; k <= len; k++) {
            const sx = Math.round(x + ax * k), sy = Math.round(y + ay * k);
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) break;
            const f = (1 - k / len) * (1 - k / len);
            const t2 = (sy * w + sx) * 3;
            add[t2]     = Math.max(add[t2],     src[o] * f);
            add[t2 + 1] = Math.max(add[t2 + 1], src[o + 1] * f);
            add[t2 + 2] = Math.max(add[t2 + 2], src[o + 2] * f);
          }
        }
      }
    }
    for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
      const m = st.streak;
      if (add[j] + add[j + 1] + add[j + 2] <= 0) continue;
      src[i]     = Math.min(255, src[i]     + add[j] * m);
      src[i + 1] = Math.min(255, src[i + 1] + add[j + 1] * m);
      src[i + 2] = Math.min(255, src[i + 2] + add[j + 2] * m);
      src[i + 3] = Math.max(src[i + 3], Math.min(255, (add[j] + add[j + 1] + add[j + 2]) / 3 * m));
    }
    g.putImageData(img, 0, 0);
  }

  if (st.merge > 0) {
    // Metaballs the cheap way: blur the field, then threshold it. Two soft particles whose halos
    // overlap sum above the threshold and fuse into one blob with a single smooth outline — which
    // is what separates slime, mercury and lava from "a pile of circles".
    //
    // Blurred RGB is carried alongside so newly-solid pixels BETWEEN particles have a colour to
    // take; without that the bridges between blobs come out black.
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const src = new Uint8ClampedArray(d);
    const blurred = boxBlur(src, w, h, Math.max(1, Math.round(st.mergeSmooth)));
    // A threshold above the field's peak classifies EVERY pixel as outside, and at mix = 1 that
    // takes the "lone wisp" branch for the whole frame and erases it — the effect vanishes with
    // nothing on screen to say Threshold is what did it. So clamp to just under the peak: the
    // densest part of the field always survives. Any threshold that already left something
    // standing is below the peak and passes through untouched, so existing presets are unchanged.
    // (peak === 0 means nothing was drawn at all; leave it alone rather than flood a blank frame.)
    let peak = 0;
    for (let i = 3; i < blurred.length; i += 4) if (blurred[i] > peak) peak = blurred[i];
    const thr = peak > 0 ? Math.min(st.mergeThreshold * 255, peak * 0.95) : st.mergeThreshold * 255;
    const mix = st.merge;
    for (let i = 0; i < d.length; i += 4) {
      const ba = blurred[i + 3];
      const inside = ba >= thr;
      const wasOpaque = d[i + 3] > 8;
      if (inside && !wasOpaque) {                    // a bridge between two blobs
        const k = blurred[i + 3] ? 255 / blurred[i + 3] : 0;   // un-premultiply the blurred colour
        d[i] = d[i] + (Math.min(255, blurred[i] * k) - d[i]) * mix;
        d[i + 1] = d[i + 1] + (Math.min(255, blurred[i + 1] * k) - d[i + 1]) * mix;
        d[i + 2] = d[i + 2] + (Math.min(255, blurred[i + 2] * k) - d[i + 2]) * mix;
        d[i + 3] = d[i + 3] + (255 - d[i + 3]) * mix;
      } else if (!inside && wasOpaque) {             // a lone wisp below the threshold
        d[i + 3] = d[i + 3] * (1 - mix);
      } else if (inside) {
        d[i + 3] = d[i + 3] + (255 - d[i + 3]) * mix;   // harden the body
      }
    }
    g.putImageData(img, 0, 0);
  }

  if (st.rim > 0) {
    // A soft coloured edge where the effect meets nothing — backlight, not an outline. The Crunch
    // outline traces the final alpha with a hard pixel border for pixel-art crispness; this is the
    // opposite intent, a glow that says the shape is lit from behind. Built from the alpha gradient
    // rather than a threshold, so it follows soft edges instead of quantising them.
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const out = new Uint8ClampedArray(src);
    const reach = Math.max(1, Math.round(st.rimWidth * frameRefPx(w, h) * 0.06));
    const hue = st.hue + st.rimHue;
    const col = hslParts(hue, st.sat, clamp01(0.5 + st.bright * 0.4));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const a = src[o + 3];
        if (a < 12) continue;
        // How much emptiness is nearby: that is what makes an edge an edge.
        let open = 0, n = 0;
        for (let dy = -reach; dy <= reach; dy += reach) {
          for (let dx = -reach; dx <= reach; dx += reach) {
            const sx = x + dx, sy = y + dy;
            n++;
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) { open++; continue; }
            open += 1 - src[(sy * w + sx) * 4 + 3] / 255;
          }
        }
        const edge = clamp01((open / n) * 1.8) * (a / 255);
        if (edge <= 0.02) continue;
        const m = st.rim * edge;
        out[o]     = Math.min(255, src[o]     + col[0] * m);
        out[o + 1] = Math.min(255, src[o + 1] + col[1] * m);
        out[o + 2] = Math.min(255, src[o + 2] + col[2] * m);
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  if (st.silhouette > 0) {
    // Flatten every colour to one tone — the hit-flash every action game uses, where a struck thing
    // goes solid white for two frames. Flash draws a NEW sprite at the origin; this recolours what
    // is already there, so the shape reads exactly as before and only its colour is gone. Alpha is
    // untouched: the silhouette is the effect's own outline, not a shape of its own.
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const tone = hslParts(st.hue, st.sat * (1 - clamp01(st.silWhite)), clamp01(0.5 + st.silWhite * 0.5));
    const m = st.silhouette;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 4) continue;
      d[i]     = d[i]     + (tone[0] - d[i])     * m;
      d[i + 1] = d[i + 1] + (tone[1] - d[i + 1]) * m;
      d[i + 2] = d[i + 2] + (tone[2] - d[i + 2]) * m;
    }
    g.putImageData(img, 0, 0);
  }

  if (st.scan > 0) {
    // CRT interlace: every other band dimmed, optionally rolling. Distinct from the Crunch group,
    // which reduces the IMAGE (fewer pixels, fewer colours) — this adds a display on top of it, so
    // the two stack rather than compete. Only ever darkens, and only where there is already alpha,
    // so on a transparent sprite it modulates the effect instead of laying bars across the frame.
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const gap = Math.max(2, Math.round(st.scanGap));
    // `t` is what this function gets — the post chain has no frame index, and reaching for one
    // is how the first version referenced a variable that does not exist here.
    const roll = Math.round(st.scanRoll * h * (t / Math.max(0.01, st.duration)));
    for (let y = 0; y < h; y++) {
      const band = ((y + roll) % gap) / gap;
      // A soft band rather than a hard on/off line: a hard one aliases badly once the sprite is
      // scaled, which is the first thing an engine does to it.
      const dim = 1 - st.scanDepth * (0.5 + 0.5 * Math.cos(band * Math.PI * 2)) * st.scan;
      if (dim >= 0.999) continue;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (d[o + 3] < 4) continue;
        d[o] *= dim; d[o + 1] *= dim; d[o + 2] *= dim;
      }
    }
    g.putImageData(img, 0, 0);
  }

  if (st.chroma > 0) {
    // Chromatic aberration: red and blue pulled apart along the ray from the centre, the way a real
    // lens fails to focus every wavelength on one plane. Deliberately radial rather than a flat
    // offset — a uniform shift reads as a printing error, a radial one reads as glass, and it
    // leaves the centre clean so the subject stays readable.
    //
    // Placed after the light has been shaped and before the pixel-art crunch: it is a lens
    // artefact, so it belongs on the image the lens formed, then gets crunched with everything else.
    const img = g.getImageData(0, 0, w, h), src = img.data;
    const out = new Uint8ClampedArray(src);
    const cx = w / 2, cy = h / 2;
    const amt = st.chromaAmount * frameRefPx(w, h) * 0.03;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const ddx = (x - cx) / Math.max(1, cx), ddy = (y - cy) / Math.max(1, cy);
        const ox2 = ddx * amt, oy2 = ddy * amt;
        const rx = Math.round(x + ox2), ry = Math.round(y + oy2);
        const bx = Math.round(x - ox2), by = Math.round(y - oy2);
        if (rx >= 0 && ry >= 0 && rx < w && ry < h) {
          const s2 = (ry * w + rx) * 4;
          out[o] = src[o] + (src[s2] - src[o]) * st.chroma;
          if (src[s2 + 3] > out[o + 3]) out[o + 3] = src[s2 + 3];
        }
        if (bx >= 0 && by >= 0 && bx < w && by < h) {
          const s3 = (by * w + bx) * 4;
          out[o + 2] = src[o + 2] + (src[s3 + 2] - src[o + 2]) * st.chroma;
          if (src[s3 + 3] > out[o + 3]) out[o + 3] = src[s3 + 3];
        }
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  if (st.glitch > 0) {
    // Digital corruption: horizontal bands slide sideways and the colour channels separate. Both
    // step in time (glitchRate) rather than changing every frame — a glitch that never repeats
    // reads as static, while one that holds for a few frames reads as a fault.
    const seed2 = Math.max(1, Math.round(st.seed)) | 0;
    const step = Math.floor((t || 0) * Math.max(1, st.glitchRate));
    const bands = Math.max(1, Math.round(st.glitchSlices));
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    tmp.getContext("2d").drawImage(cv, 0, 0);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < bands; i++) {
      const y0 = Math.floor(i * h / bands), y1 = Math.floor((i + 1) * h / bands);
      // Only some bands displace; shifting every one just looks like a wobble.
      const active = rnd(seed2 + step * 7919, i, 81) < 0.55;
      const dx = active ? Math.round(rndS(seed2 + step * 7919, i, 82) * st.glitchShift * w * st.glitch) : 0;
      g.drawImage(tmp, 0, y0, w, y1 - y0, dx, y0, w, y1 - y0);
    }
    if (st.glitchRGB > 0) {
      const off = Math.max(1, Math.round(st.glitchRGB * st.glitch * w * 0.02));
      const img = g.getImageData(0, 0, w, h), d = img.data;
      const src = new Uint8ClampedArray(d);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const rx = Math.min(w - 1, Math.max(0, x - off)), bx = Math.min(w - 1, Math.max(0, x + off));
          d[i] = src[(y * w + rx) * 4];              // red pulled one way…
          d[i + 2] = src[(y * w + bx) * 4 + 2];      // …blue the other
          // alpha takes the max of the three sample points, or the split shows as hard clipping
          d[i + 3] = Math.max(src[i + 3], src[(y * w + rx) * 4 + 3], src[(y * w + bx) * 4 + 3]);
        }
      }
      g.putImageData(img, 0, 0);
    }
  }

  if (st.dissolve > 0) {
    const u = clamp01(t / Math.max(0.01, st.duration * st.dissolveTime));
    // Direction: erase over time, or materialise. Threshold sweeps the noise field either way.
    const cut = st.dissolveDir ? 1 - u : u;
    const field = dissolveNoise(Math.max(1, Math.round(st.seed)) | 0, st.dissolveScale, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const edge = st.dissolveEdge * 0.35;
    const ec = layerColour(st, u, 1);
    // parse the edge colour once rather than per pixel
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = ec.css; probe.fillRect(0, 0, 1, 1);
    const px = probe.getImageData(0, 0, 1, 1).data;
    for (let i = 0, p = 0; p < field.length; i += 4, p++) {
      if (d[i + 3] === 0) continue;
      const n = field[p];
      if (n < cut * st.dissolve) { d[i + 3] = 0; continue; }          // gone
      if (edge > 0 && n < cut * st.dissolve + edge) {                  // burning edge
        const k = 1 - (n - cut * st.dissolve) / edge;
        d[i] = d[i] + (px[0] - d[i]) * k;
        d[i + 1] = d[i + 1] + (px[1] - d[i + 1]) * k;
        d[i + 2] = d[i + 2] + (px[2] - d[i + 2]) * k;
      }
    }
    g.putImageData(img, 0, 0);
  }

  if (st.pixelate > 1) {   // nearest-neighbour down + up
    const p = Math.round(st.pixelate);
    const sw = Math.max(1, Math.round(w / p)), sh = Math.max(1, Math.round(h / p));
    const tmp = document.createElement("canvas");
    tmp.width = sw; tmp.height = sh;
    const tg = tmp.getContext("2d");
    tg.imageSmoothingEnabled = false;
    tg.drawImage(cv, 0, 0, sw, sh);
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, w, h);
    g.imageSmoothingEnabled = true;
  }

  const pal = parsePalette(st.paletteLock);
  const needsPixelPass = st.alphaCut > 0 || st.posterize < 32 || st.outline > 0 || pal;
  if (!needsPixelPass) return cv;

  const img = g.getImageData(0, 0, w, h), d = img.data;
  if (st.alphaCut > 0) {           // hard alpha — what makes GIF and pixel-art export clean
    const cut = st.alphaCut * 255;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= cut ? 255 : 0;
  }
  if (pal) {
    // Snap every visible pixel to its nearest palette entry. A 15-bit cache makes this "one search
    // per distinct colour" instead of per pixel. Dither biases the colour BEFORE the lookup, which
    // keeps the cache valid — a biased colour is just another colour.
    //
    // KNOWN LIMIT: exact only where alpha is 255. Canvas stores colour premultiplied, so writing
    // an on-palette RGB at alpha 8 and reading it back returns something up to ~60/255 away — the
    // precision simply isn't there at low alpha. Soft edges therefore land between palette
    // colours. Raising `alphaCut` removes partial alpha entirely and the palette becomes exact,
    // which is what a pixel-art workflow wants anyway; the UI says so.
    const cache = new Int16Array(32768).fill(-1);
    const n = pal.length, dith = st.dither;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      let r = d[i], g2 = d[i + 1], b = d[i + 2];
      if (dith > 0) {
        const p = (i >> 2), bx = p % w, by = (p / w) | 0;
        const bias = (BAYER4[(by & 3) * 4 + (bx & 3)] / 16 - 0.5) * 40 * dith;
        r = Math.max(0, Math.min(255, r + bias));
        g2 = Math.max(0, Math.min(255, g2 + bias));
        b = Math.max(0, Math.min(255, b + bias));
      }
      const key = ((r >> 3) << 10) | ((g2 >> 3) << 5) | (b >> 3);
      let idx = cache[key];
      if (idx < 0) {
        let bd = Infinity, bi = 0;
        for (let c = 0; c < n; c++) {
          const pc = pal[c];
          const dr = r - pc[0], dg = g2 - pc[1], db = b - pc[2];
          const dist = dr * dr * 2 + dg * dg * 4 + db * db;
          if (dist < bd) { bd = dist; bi = c; }
        }
        idx = bi; cache[key] = idx;
      }
      const pc = pal[idx];
      d[i] = pc[0]; d[i + 1] = pc[1]; d[i + 2] = pc[2];
    }
  } else if (st.posterize < 32) {   // the bitcrush analog — skipped entirely when a palette is set,
    const lv = Math.max(2, Math.round(st.posterize)), q = 255 / (lv - 1);   // since both quantize colour
    const dith = st.dither;
    for (let i = 0; i < d.length; i += 4) {
      const p = (i >> 2), bx = p % w, by = (p / w) | 0;
      const bias = dith > 0 ? (BAYER4[(by & 3) * 4 + (bx & 3)] / 16 - 0.5) * q * dith : 0;
      d[i] = Math.round((d[i] + bias) / q) * q;
      d[i + 1] = Math.round((d[i + 1] + bias) / q) * q;
      d[i + 2] = Math.round((d[i + 2] + bias) / q) * q;
    }
  }
  if (st.outline > 0) {            // must be last: it traces the FINAL alpha edge
    // Outline = (alpha dilated by r) minus alpha. The neighbourhood is a SQUARE, and a square
    // structuring element decomposes into a horizontal pass followed by a vertical one — so this
    // is two sliding-window counts, O(w·h) and independent of r, rather than the (2r+1)² test per
    // pixel it used to be. Measured: 92ms → 4ms for r=3 over 29 frames at 192px, identical output.
    const r = Math.round(st.outline);
    const n = w * h;
    const alpha = new Uint8Array(n);
    for (let p = 0; p < n; p++) alpha[p] = d[p * 4 + 3] > 8 ? 1 : 0;
    const rowD = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let count = 0;
      for (let x = 0; x <= r && x < w; x++) count += alpha[row + x];
      for (let x = 0; x < w; x++) {
        rowD[row + x] = count > 0 ? 1 : 0;
        const add = x + r + 1, sub = x - r;
        if (add < w) count += alpha[row + add];
        if (sub >= 0) count -= alpha[row + sub];
      }
    }
    const tone = Math.round(st.outlineTone * 255);
    for (let x = 0; x < w; x++) {
      let count = 0;
      for (let y = 0; y <= r && y < h; y++) count += rowD[y * w + x];
      for (let y = 0; y < h; y++) {
        const p = y * w + x;
        if (count > 0 && !alpha[p]) {
          const o = p * 4;
          d[o] = d[o + 1] = d[o + 2] = tone;
          d[o + 3] = 255;
        }
        const add = y + r + 1, sub = y - r;
        if (add < h) count += rowD[add * w + x];
        if (sub >= 0) count -= rowD[sub * w + x];
      }
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------- the public entry point ----------
// renderFrames(state, { size, fit, sim }) -> { canvases, w, h, fps, sim }
// Pass an existing `sim` back in to re-rasterize (new size, new Crunch settings) without
// re-simulating — that's the whole point of the split.
// Setup shared by both render paths. Split out so streamFrames() and renderFrames() cannot
// drift: exactly one place decides dimensions, scale and offset.
function renderPrep(st, opt) {
  opt = opt || {};
  const sim = opt.sim || simulate(st);
  // opt.size keeps the square shorthand working for every existing caller (thumbnails, the
  // multi-resolution export); opt.w/opt.h are the explicit form.
  const dims = (opt.w || opt.h)
    ? { w: Math.max(8, Math.round(opt.w || opt.h)), h: Math.max(8, Math.round(opt.h || opt.w)) }
    : (opt.size ? { w: Math.max(8, Math.round(opt.size)), h: Math.max(8, Math.round(opt.size)) }
                : frameDims(st));
  const outW = dims.w, outH = dims.h;
  const ref = frameRefPx(outW, outH);          // radii scale against the smaller side
  const base = ref / sim.fs;

  // Fit — the loudness-normalize analog: scale the whole effect so its bounding box fills the
  // frame. Needs the bbox across EVERY frame, which is exactly why simulate() runs first.
  let k = base * st.scale, dx, dy;
  if (opt.fit) {
    const bw = sim.bbox.x1 - sim.bbox.x0, bh = sim.bbox.y1 - sim.bbox.y0;
    // Fit against BOTH axes independently and take the tighter one, so a wide effect in a tall
    // frame is limited by width rather than spilling out the sides.
    k = Math.min((outW * 0.94) / Math.max(bw, 1), (outH * 0.94) / Math.max(bh, 1));
    const cx = (sim.bbox.x0 + sim.bbox.x1) / 2, cy = (sim.bbox.y0 + sim.bbox.y1) / 2;
    dx = outW / 2 - cx * k; dy = outH / 2 - cy * k;
  } else {
    // Keep the emitter origin at ITS fractional position in the frame and scale around it.
    // (Mapping the origin to the centre instead would silently cancel originX/originY out — a
    // flame authored to sit at the bottom of the frame would render dead centre.)
    dx = st.originX * outW - (st.originX * sim.fs) * k;
    dy = st.originY * outH - (st.originY * sim.fs) * k;
  }
  return { st, sim, outW, outH, ref, k, dx, dy, n: sim.nFrames };
}

// One frame. `echoCv` is the previous frame (or null) — echo is a feedback delay on the
// framebuffer, which is what makes frames sequentially dependent and rules out rendering them
// out of order.
function renderOneFrame(prep, f, echoCv) {
  const st = prep.st, sim = prep.sim, ref = prep.ref;
  const cv = document.createElement("canvas");
  cv.width = prep.outW; cv.height = prep.outH;
  const g = cv.getContext("2d");

  if (st.echo > 0 && echoCv) {
    g.globalAlpha = st.echo * st.echoDecay;
    g.drawImage(echoCv, 0, 0);
    g.globalAlpha = 1;
  }

  const shake = st.shake > 0 ? st.shake * ref * 0.06 : 0;
  const xf = {
    k: prep.k,
    dx: prep.dx + (shake ? rndS(Math.round(st.seed) + 991, f, 31) * shake : 0),
    dy: prep.dy + (shake ? rndS(Math.round(st.seed) + 991, f, 32) * shake : 0),
  };
  drawFrame(sim, f, g, st, xf);
  postProcess(cv, st, (ctx) => drawBubble(ctx, st, f / sim.fps, ref), f / sim.fps);
  return cv;
}

// How many head frames the seamless loop cross-dissolves into. 0 when loopBlend is off.
function loopBlendCount(prep) {
  return (prep.st.loopBlend > 0 && prep.n > 3)
    ? Math.max(1, Math.round(prep.n * 0.35 * prep.st.loopBlend)) : 0;
}
function blendLoopFrame(head, tail, i, L) {
  const g = head.getContext("2d");
  g.globalAlpha = (1 - i / L) * 0.5;
  g.drawImage(tail, 0, 0);
  g.globalAlpha = 1;
}

// Free a canvas's backing store. Dropping the reference alone leaves it to the GC, which at 4K
// means 67 MB per frame sitting around until it feels like collecting; zeroing the size releases
// it immediately. This is what makes the streaming path actually stream.
function releaseCanvas(cv) { if (cv) { cv.width = 0; cv.height = 0; } }

function renderFrames(st, opt) {
  const prep = renderPrep(st, opt);
  const canvases = new Array(prep.n);
  let echoCv = null;
  for (let f = 0; f < prep.n; f++) {
    const cv = renderOneFrame(prep, f, echoCv);
    if (st.echo > 0) {
      echoCv = document.createElement("canvas");
      echoCv.width = prep.outW; echoCv.height = prep.outH;
      echoCv.getContext("2d").drawImage(cv, 0, 0);
    }
    canvases[f] = cv;
  }

  // seamless loop: cross-dissolve the tail back over the head (auras, flames, portals)
  const L = loopBlendCount(prep);
  for (let i = 0; i < L; i++) blendLoopFrame(canvases[i], canvases[prep.n - L + i], i, L);
  if (st.reverse) canvases.reverse();

  return { canvases, w: prep.outW, h: prep.outH, fps: prep.sim.fps, sim: prep.sim };
}

// The same pixels as renderFrames, one frame at a time: each is handed to `onFrame(cv, index, n)`
// and then released, so peak memory is a few frames rather than the whole sequence. At 4096² that
// is ~70 MB instead of ~1.3 GB — and memory, not time, is what actually kills a tab.
//
// Two wrinkles, both handled rather than punted:
//   * `reverse` only flips the OUTPUT order, and every consumer is index-addressed (cell i of a
//     sheet, frame_007.png), so it costs nothing — emit with a flipped index.
//   * `loopBlend` cross-dissolves the LAST L frames into the FIRST L, so a head frame can't be
//     finalised until its partner exists. Hold the head (at most 35% of the sequence) and emit
//     each head frame the moment its partner is rendered.
//
// onFrame may be async and is awaited, so a caller can encode to PNG without buffering canvases.
async function streamFrames(st, opt, onFrame) {
  const prep = renderPrep(st, opt);
  const L = loopBlendCount(prep);
  const head = [];
  let echoCv = null;
  const outIndex = (f) => (st.reverse ? prep.n - 1 - f : f);
  const emit = async (cv, f) => { await onFrame(cv, outIndex(f), prep.n); releaseCanvas(cv); };

  for (let f = 0; f < prep.n; f++) {
    const cv = renderOneFrame(prep, f, echoCv);
    if (st.echo > 0) {
      releaseCanvas(echoCv);
      echoCv = document.createElement("canvas");
      echoCv.width = prep.outW; echoCv.height = prep.outH;
      echoCv.getContext("2d").drawImage(cv, 0, 0);
    }
    if (f < L) {
      head.push(cv);                          // not final: its loop partner isn't drawn yet
      continue;
    }
    const i = f - (prep.n - L);               // >= 0 once we reach the tail
    if (i >= 0) {
      blendLoopFrame(head[i], cv, i, L);
      await emit(cv, f);
      await emit(head[i], i);
      head[i] = null;
    } else {
      await emit(cv, f);
    }
  }
  releaseCanvas(echoCv);
  return { w: prep.outW, h: prep.outH, fps: prep.sim.fps, n: prep.n, sim: prep.sim };
}

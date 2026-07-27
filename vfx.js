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
const SHAPES   = ["glow", "spark", "ring", "star", "pixel", "smoke", "shard", "bolt", "custom", "image",
                  "heart", "cross", "diamond", "crescent", "snowflake", "blob", "teardrop", "spiral", "glyph"];
const EMITTERS = ["burst", "cone", "ring", "disc", "line", "spiral", "box"];
const BLENDS   = ["additive", "alpha", "screen"];
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
const K_PART = 0, K_FLASH = 1, K_WAVE = 2;   // P_KIND values

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

// ---------- simulation ----------
// Returns { frames: [Float32Array], counts: Int32Array, bbox, nFrames, fps, fs }.
// World units are pixels at the patch's NOMINAL frame size (st.frameSize); rasterize() scales.
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
  const total = Math.min(MAX_PARTS, parents * (1 + subN));

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
  if (subN > 0) { pbirth.fill(Infinity, parents); for (let i = parents; i < total; i++) pgen[i] = 1; }
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

    // emitter geometry: where it starts and which way it goes
    let ang, sx = ox, sy = oy;
    const jx = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 21) : 0;
    const jy = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 22) : 0;
    sx += jx; sy += jy;
    const u1 = rnd(seed, g, 7), u2 = rnd(seed, g, 8);
    switch (emitter) {
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
        const a = i * 2.39996323, r = (i / Math.max(1, perShot - 1)) * emitR;
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
    const sp = st.speed * shotScale * (1 + st.speedVar * rndS(seed, g, 10));
    px[g] = sx; py[g] = sy;
    vx[g] = Math.cos(ang) * sp; vy[g] = Math.sin(ang) * sp;
  }

  const frames = new Array(nFrames);
  const counts = new Int32Array(nFrames);
  const scratch = new Float32Array((total + 2 * shots) * P_STRIDE);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;

  const ramp = parseRamp(st.ramp);
  const flipCells = Math.round(st.shape) === 9
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
        const size = Math.max(0.1, psize[g] * (1 + st.grow * u) * rampZ);
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
        } else {
          const white = st.coreWhite * (1 - u) * (1 - u);
          scratch[o + P_HUE] = phue[g] + st.hueLife * u;
          scratch[o + P_WHITE] = white;
          scratch[o + P_SAT] = st.sat * (1 - white * 0.85);
          scratch[o + P_LIGHT] = clamp01(st.bright * (0.5 + 0.5 * white));
          scratch[o + P_ALPHA] = lifeAlpha(st, u);
        }
        scratch[o + P_KIND] = K_PART;
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
        const t0 = k * st.shotDelay, sc = Math.pow(st.shotScale, k);
        const jx = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 21) : 0;
        const jy = k ? st.shotSpread * fs * 0.25 * rndS(seed, k, 22) : 0;
        if (st.flash > 0) {
          const u = (t - t0) / st.flashLife;
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
          const u = (t - t0) / st.waveLife;
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
      let ax = st.wind, ay = st.gravity;
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
      const damp = 1 - dragK * dt;
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

// ---------- sprite cache ----------
// createRadialGradient per particle is THE performance trap here. Each shape is drawn once into
// a small canvas, tinted with source-in, and cached by (shape, hue step, white step) — every
// particle then costs one drawImage.
const spriteCache = new Map();
function spriteKey(shape, hi, si, li, st, frame) {
  // shape params that change the drawing have to be in the key or the cache goes stale
  const extra = shape === 1 ? st.sparkLen + "," + st.sparkTaper
    : shape === 2 ? st.ringThick + "," + st.ringSoft
      : shape === 3 ? st.starPoints + "," + st.starInner
        : shape === 5 ? st.smokeSoft
          : shape === 6 ? st.shardSides + "," + st.shardRatio
            : shape === 7 ? st.boltSegs + "," + st.boltJitter + "," + st.boltBranch
              : shape === 11 ? st.crossArms + "," + st.crossThin
                : shape === 13 ? st.crescentArc + "," + st.crescentThick
                  : shape === 14 ? st.flakeArms + "," + st.flakeBranch
                    : shape === 15 ? st.blobLobes + "," + st.blobRough
                      : shape === 16 ? st.dropTail
                        : shape === 17 ? st.spiralTurns + "," + st.spiralThick
                          : shape === 18 ? st.glyph + "," + st.glyphTint
                            : shape === 8 ? st.customSprite
                              : shape === 9 ? imageSpriteVersion + "," + st.imgTint + "," + st.imgCols + "," + st.imgRows : "";
  return shape + "|" + hi + "|" + si + "|" + li + "|" + frame + "|" + extra;
}
function clearSpriteCache() { spriteCache.clear(); }

function hsl(h, s, l) { return "hsl(" + (((h % 360) + 360) % 360) + "," + Math.round(clamp01(s) * 100) + "%," + Math.round(clamp01(l) * 100) + "%)"; }

function makeSprite(shape, hue, sat, lum, st, frame) {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE_PX;
  const g = c.getContext("2d");
  const R = SPRITE_PX / 2;
  // draw the shape in white/alpha first, then tint it in one source-in pass
  g.fillStyle = "#fff"; g.strokeStyle = "#fff";
  switch (shape) {
    case 1: {   // spark — a tapered streak, drawn along +x and rotated per particle
      const len = SPRITE_PX * (0.15 + 0.85 * st.sparkLen);
      const grd = g.createLinearGradient(R - len / 2, 0, R + len / 2, 0);
      grd.addColorStop(0, "rgba(255,255,255,0)");
      grd.addColorStop(1 - st.sparkTaper * 0.6, "rgba(255,255,255,0.9)");
      grd.addColorStop(1, "#fff");
      g.fillStyle = grd;
      const h = SPRITE_PX * 0.16 * (1 - st.sparkTaper * 0.6);
      g.beginPath();
      g.moveTo(R - len / 2, R); g.lineTo(R + len / 2, R - h / 2);
      g.lineTo(R + len / 2, R + h / 2); g.closePath(); g.fill();
      break;
    }
    case 2: {   // ring
      const w = R * st.ringThick;
      g.lineWidth = Math.max(1, w);
      if (st.ringSoft > 0) {
        const grd = g.createRadialGradient(R, R, Math.max(0, R - w), R, R, R);
        grd.addColorStop(0, "rgba(255,255,255,0)");
        grd.addColorStop(0.5, "#fff");
        grd.addColorStop(1, "rgba(255,255,255," + (1 - st.ringSoft).toFixed(2) + ")");
        g.strokeStyle = grd;
      }
      g.beginPath(); g.arc(R, R, R - w / 2 - 1, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 3: {   // star
      const pts = Math.max(3, Math.round(st.starPoints)), inner = R * st.starInner;
      g.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? inner : R - 1;
        g[i ? "lineTo" : "moveTo"](R + Math.cos(a) * r, R + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      break;
    }
    case 4:     // pixel — a hard square, no softness at all (the pixel-art primitive)
      g.fillRect(R * 0.5, R * 0.5, R, R);
      break;
    case 5: {   // smoke — a big soft blob, deliberately fuzzier than glow
      const grd = g.createRadialGradient(R, R, 0, R, R, R);
      const soft = st.smokeSoft;
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(0.45 * (1 - soft * 0.5), "rgba(255,255,255,0.32)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
      break;
    }
    case 6: {   // shard — angular debris
      const sides = Math.max(3, Math.round(st.shardSides));
      g.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
        g[i ? "lineTo" : "moveTo"](R + Math.cos(a) * (R - 1), R + Math.sin(a) * (R - 1) * st.shardRatio);
      }
      g.closePath(); g.fill();
      break;
    }
    case 7: {   // bolt — a jagged polyline. Cached like the rest, so every bolt in a patch shares
      // one silhouette; per-particle rotation keeps that from reading as repetition.
      const segs = Math.max(3, Math.round(st.boltSegs));
      g.lineWidth = Math.max(1.5, SPRITE_PX * 0.05);
      g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i <= segs; i++) {
        const x = (i / segs) * (SPRITE_PX - 4) + 2;
        const y = R + (i && i < segs ? rndS(1337, i, Math.round(st.boltJitter * 100)) * R * st.boltJitter : 0);
        g[i ? "lineTo" : "moveTo"](x, y);
      }
      g.stroke();
      if (st.boltBranch > 0) {
        g.lineWidth *= 0.6; g.globalAlpha = st.boltBranch;
        for (let i = 1; i < segs; i += 2) {
          const x = (i / segs) * (SPRITE_PX - 4) + 2;
          const y = R + rndS(1337, i, 3) * R * st.boltJitter;
          g.beginPath(); g.moveTo(x, y);
          g.lineTo(x + R * 0.3, y + rndS(1337, i, 4) * R * 0.6);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      break;
    }
    case 10: {  // heart — two lobes and a point. Charms, pickups, healing, "likes".
      g.save(); g.translate(R, R * 0.86); g.scale(R / 16, R / 16);
      g.beginPath();
      g.moveTo(0, 13);
      g.bezierCurveTo(-14, 2, -14, -9, -6.5, -9);
      g.bezierCurveTo(-2, -9, 0, -5.5, 0, -5.5);
      g.bezierCurveTo(0, -5.5, 2, -9, 6.5, -9);
      g.bezierCurveTo(14, -9, 14, 2, 0, 13);
      g.closePath(); g.fill();
      g.restore();
      break;
    }
    case 11: {  // cross / twinkle — tapered spikes off a bright centre. The anime sparkle.
      const arms = Math.max(2, Math.round(st.crossArms)), w = R * st.crossThin;
      g.save(); g.translate(R, R);
      for (let i = 0; i < arms; i++) {
        g.save(); g.rotate((i / arms) * Math.PI * 2);
        g.beginPath(); g.moveTo(-w, 0); g.lineTo(w, 0); g.lineTo(0, -(R - 1));
        g.closePath(); g.fill();
        g.restore();
      }
      const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
      core.addColorStop(0, "#fff"); core.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = core;
      g.beginPath(); g.arc(0, 0, R * 0.3, 0, Math.PI * 2); g.fill();
      g.restore();
      break;
    }
    case 12:    // diamond — the pixel-art rhombus; reads cleanly at 8px where a circle doesn't
      g.beginPath();
      g.moveTo(R, 1); g.lineTo(R * 2 - 1, R); g.lineTo(R, R * 2 - 1); g.lineTo(1, R);
      g.closePath(); g.fill();
      break;
    case 13: {  // crescent — an arc segment. Sword slashes, swooshes, orbit trails.
      const th = Math.max(1, R * st.crescentThick), arc = st.crescentArc * Math.PI * 2;
      g.lineWidth = th; g.lineCap = "round";
      g.beginPath();
      g.arc(R, R, R - th / 2 - 1, -Math.PI / 2 - arc / 2, -Math.PI / 2 + arc / 2);
      g.stroke();
      break;
    }
    case 14: {  // snowflake — radial arms with side branches. The ice primitive.
      const arms = Math.max(3, Math.round(st.flakeArms)), br = st.flakeBranch;
      g.save(); g.translate(R, R);
      g.lineWidth = Math.max(1, R * 0.09); g.lineCap = "round";
      for (let i = 0; i < arms; i++) {
        g.save(); g.rotate((i / arms) * Math.PI * 2);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -(R - 2)); g.stroke();
        if (br > 0) {
          for (const f of [0.45, 0.72]) {
            const y = -(R - 2) * f, len = (R - 2) * 0.32 * br;
            g.beginPath();
            g.moveTo(0, y); g.lineTo(len * 0.75, y + len * 0.55);
            g.moveTo(0, y); g.lineTo(-len * 0.75, y + len * 0.55);
            g.stroke();
          }
        }
        g.restore();
      }
      g.restore();
      break;
    }
    case 15: {  // blob — an organic lumpy mass. Goo, slime, mud, splats.
      const lobes = Math.max(3, Math.round(st.blobLobes)), rough = st.blobRough;
      g.save(); g.translate(R, R);
      g.beginPath();
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        // two harmonics keep it lumpy rather than flower-shaped
        const wob = 0.5 + 0.5 * Math.sin(a * lobes) + 0.35 * Math.sin(a * (lobes + 2) + 2.1);
        const rr = (R - 1) * (1 - rough * 0.3 * wob);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        g[i ? "lineTo" : "moveTo"](x, y);
      }
      g.closePath(); g.fill();
      g.restore();
      break;
    }
    case 16: {  // teardrop — round head, tapered tail. Velocity-aligned like the spark.
      const hx = R + R * 0.3, hr = R * 0.5, tx = R - R * (0.1 + 0.85 * st.dropTail);
      g.beginPath();
      g.moveTo(tx, R);
      g.quadraticCurveTo(hx, R - hr, hx + hr * 0.9, R);
      g.quadraticCurveTo(hx, R + hr, tx, R);
      g.closePath(); g.fill();
      break;
    }
    case 17: {  // spiral — a coiled tail. Magic curls, whirlwinds, charm swirls.
      const turns = st.spiralTurns, N = Math.max(24, Math.round(turns * 48));
      g.save(); g.translate(R, R);
      g.lineWidth = Math.max(1, R * st.spiralThick); g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = i / N, a = t * turns * Math.PI * 2, rr = (R - 2) * t;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        g[i ? "lineTo" : "moveTo"](x, y);
      }
      g.stroke();
      g.restore();
      break;
    }
    case 18: {  // glyph — any character or emoji as the particle. Covers charms (♥), emotes
      // (! ? ★ ✦), damage numbers and full-colour emoji in one primitive, with no new asset
      // pipeline. `glyphTint` at 0 keeps the glyph's own colours, which is what emoji need.
      g.font = Math.round(SPRITE_PX * 0.74) + 'px system-ui, "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(st.glyph || "★", R, R + SPRITE_PX * 0.03);
      break;
    }
    case 8: {   // custom — the 16×16 grid you drew, blown up with hard edges
      const data = decodeSpriteAlpha(st.customSprite);
      if (!data) break;                       // nothing drawn yet → an empty sprite, not a crash
      const n = CUSTOM_SPRITE_N;
      const tmp = document.createElement("canvas");
      tmp.width = tmp.height = n;
      const tg = tmp.getContext("2d");
      const img = tg.createImageData(n, n);
      for (let i = 0; i < n * n; i++) {
        img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = data[i];
      }
      tg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;        // it's pixel art; keep the blocks crisp
      g.drawImage(tmp, 0, 0, SPRITE_PX, SPRITE_PX);
      break;
    }
    case 9: {   // image — your own PNG as the particle, optionally an animated strip
      if (!imageSpriteEl || !imageSpriteEl.complete || !imageSpriteEl.naturalWidth) break;
      const cols = Math.max(1, Math.round(st.imgCols)), rows = Math.max(1, Math.round(st.imgRows));
      const iw = imageSpriteEl.naturalWidth / cols, ih = imageSpriteEl.naturalHeight / rows;
      const n = cols * rows;
      const idx = ((Math.round(frame) % n) + n) % n;
      const sx = (idx % cols) * iw, sy = Math.floor(idx / cols) * ih;
      const k = Math.min(SPRITE_PX / iw, SPRITE_PX / ih);   // contain, preserving aspect
      const w = iw * k, h = ih * k;
      g.imageSmoothingEnabled = k < 1;        // downscale smoothly, upscale crisply
      g.drawImage(imageSpriteEl, sx, sy, iw, ih, (SPRITE_PX - w) / 2, (SPRITE_PX - h) / 2, w, h);
      break;
    }
    default: {  // 0 glow — the workhorse: hot centre, soft falloff
      const grd = g.createRadialGradient(R, R, 0, R, R, R);
      grd.addColorStop(0, "#fff");
      grd.addColorStop(0.25, "rgba(255,255,255,0.85)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
    }
  }
  // Tint: one pass over whatever alpha we just drew, in the colour simulate() already resolved
  // (classic hue/coreWhite path or a ramp sample — makeSprite doesn't need to know which).
  // Shapes drawn in white take source-in (a flat repaint). The glyph and the imported PNG carry
  // their own colours, so they get source-atop at partial alpha — letting their tint slider fade
  // between "keep 🔥 / my artwork as drawn" and "treat it as a particle like any other".
  const ownColour = shape === 18 || shape === 9;
  const tintAmt = shape === 18 ? clamp01(st.glyphTint) : shape === 9 ? clamp01(st.imgTint) : 1;
  if (tintAmt > 0) {
    g.globalCompositeOperation = ownColour ? "source-atop" : "source-in";
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
  g.globalCompositeOperation = st.blend === 1 ? "source-over" : (st.blend === 2 ? "screen" : "lighter");
  const shape = Math.round(st.shape);
  const trail = st.trail;
  // Structure layers draw first, so sparks and debris land on top of the beam/growth rather than
  // behind it. They share the blend mode, so an additive patch gets an additive beam.
  {
    const t = f / sim.fps, fs = sim.fs, seed = Math.max(1, Math.round(st.seed)) | 0;
    const ox = st.originX * fs * xf.k + xf.dx, oy = st.originY * fs * xf.k + xf.dy;
    drawGrowth(g, st, t, xf, fs, ox, oy, seed);
    drawVortex(g, st, t, xf, fs, ox, oy);
    drawSigil(g, st, t, xf, fs, ox, oy, seed);
    drawBeam(g, st, t, xf, fs, ox, oy, seed);
    drawRibbon(g, st, t, xf, fs, ox, oy);
    drawArc(g, st, t, xf, fs, ox, oy, seed);
    drawShatter(g, st, t, xf, fs, ox, oy, seed);
    drawLines(g, st, t, xf, fs, ox, oy, seed);
    drawRipples(g, st, t, xf, fs, ox, oy);
    drawTumble(g, st, t, xf, fs, ox, oy, seed);
    drawPathTrails(g, sim, f, st, xf);
    // Orbit draws LAST of the structure layers: its whole point is that things pass in front of
    // the subject, so it has to sit above the beam/growth it is orbiting.
    drawOrbit(g, st, t, xf, fs, ox, oy, seed);
  }
  for (let i = 0; i < n; i++) {
    const o = i * P_STRIDE;
    const a = arr[o + P_ALPHA];
    if (a <= 0.004) continue;
    const kind = arr[o + P_KIND];
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
    const spr = getSprite(shape, hue, sat, light, st, arr[o + P_FRAME]);
    // spark and teardrop are directional shapes — they point where they're going
    const rot = (shape === 1 || shape === 16) ? Math.atan2(arr[o + P_VY], arr[o + P_VX]) : arr[o + P_ANG];
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
function layerColour(st, u, whiteBias) {
  const ramp = parseRamp(st.ramp);
  if (ramp) {
    const c = sampleRamp(ramp, clamp01(u));
    return { css: hsl(c.h, c.s, clamp01(c.l * st.bright)), a: c.a };
  }
  const w = clamp01(whiteBias);
  return {
    css: hsl(st.hue + st.hueLife * u, st.sat * (1 - w * 0.85), clamp01(st.bright * (0.45 + 0.55 * w))),
    a: 1,
  };
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
  const c = layerColour(st, u, 0.9);
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
    g.beginPath();
    g.arc(x, y, rr, 0, Math.PI * 2);
    g.fill();
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
    const thr = st.mergeThreshold * 255;
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
function renderFrames(st, opt) {
  opt = opt || {};
  const sim = opt.sim || simulate(st);
  const out = Math.max(8, Math.round(opt.size || sim.fs));
  const base = out / sim.fs;

  // Fit — the loudness-normalize analog: scale the whole effect so its bounding box fills the
  // frame. Needs the bbox across EVERY frame, which is exactly why simulate() runs first.
  let k = base * st.scale, dx, dy;
  if (opt.fit) {
    const bw = sim.bbox.x1 - sim.bbox.x0, bh = sim.bbox.y1 - sim.bbox.y0;
    const span = Math.max(bw, bh, 1);
    k = (out * 0.94) / span;
    const cx = (sim.bbox.x0 + sim.bbox.x1) / 2, cy = (sim.bbox.y0 + sim.bbox.y1) / 2;
    dx = out / 2 - cx * k; dy = out / 2 - cy * k;
  } else {
    // Keep the emitter origin at ITS fractional position in the frame and scale around it.
    // (Mapping the origin to out/2 instead would silently cancel originX/originY out — a flame
    // authored to sit at the bottom of the frame would render dead centre.)
    dx = st.originX * out - (st.originX * sim.fs) * k;
    dy = st.originY * out - (st.originY * sim.fs) * k;
  }

  const canvases = new Array(sim.nFrames);
  let echoCv = null;
  for (let f = 0; f < sim.nFrames; f++) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = out;
    const g = cv.getContext("2d");

    // frame echo — carry the previous frame forward, faded. A feedback delay on the framebuffer.
    if (st.echo > 0 && echoCv) {
      g.globalAlpha = st.echo * st.echoDecay;
      g.drawImage(echoCv, 0, 0);
      g.globalAlpha = 1;
    }

    const shake = st.shake > 0 ? st.shake * out * 0.06 : 0;
    const xf = {
      k,
      dx: dx + (shake ? rndS(Math.round(st.seed) + 991, f, 31) * shake : 0),
      dy: dy + (shake ? rndS(Math.round(st.seed) + 991, f, 32) * shake : 0),
    };
    drawFrame(sim, f, g, st, xf);
    if (st.echo > 0) {
      echoCv = document.createElement("canvas");
      echoCv.width = echoCv.height = out;
      echoCv.getContext("2d").drawImage(cv, 0, 0);
    }
    postProcess(cv, st, (ctx) => drawBubble(ctx, st, f / sim.fps, out), f / sim.fps);
    canvases[f] = cv;
  }

  // seamless loop: cross-dissolve the tail back over the head (auras, flames, portals)
  if (st.loopBlend > 0 && canvases.length > 3) {
    const L = Math.max(1, Math.round(canvases.length * 0.35 * st.loopBlend));
    for (let i = 0; i < L; i++) {
      const g = canvases[i].getContext("2d");
      g.globalAlpha = (1 - i / L) * 0.5;
      g.drawImage(canvases[canvases.length - L + i], 0, 0);
      g.globalAlpha = 1;
    }
  }
  if (st.reverse) canvases.reverse();

  return { canvases, w: out, h: out, fps: sim.fps, sim };
}

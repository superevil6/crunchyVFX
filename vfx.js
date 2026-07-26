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
const P_STRIDE = 12;       // one particle per stride in the per-frame Float32Array
const P_X = 0, P_Y = 1, P_SIZE = 2, P_ANG = 3, P_ALPHA = 4;
const P_HUE = 5, P_WHITE = 6, P_KIND = 7, P_VX = 8, P_VY = 9;
// Colour is resolved at SIMULATE time, not draw time: with a ramp, hue/sat/light are a function
// of the particle's own life fraction, which the frame table doesn't otherwise carry.
const P_SAT = 10, P_LIGHT = 11;
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
        const size = Math.max(0.1, psize[g] * (1 + st.grow * u));
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
        ax += vnoise(seed, nx, ny, nt) * turb * 900;
        ay += vnoise(seed + 7717, nx, ny, nt) * turb * 900;
      }
      vx[g] += ax * dt; vy[g] += ay * dt;
      const damp = 1 - dragK * dt;
      vx[g] *= damp; vy[g] *= damp;
      px[g] += vx[g] * dt; py[g] += vy[g] * dt;
      pang[g] += pspin[g] * dt;
    }
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
    return { p: n[0], h: n[1], s: n[2], l: n[3], a: n[4] };
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
    return { h: a.h + dh * k, s: a.s + (b.s - a.s) * k, l: a.l + (b.l - a.l) * k, a: a.a + (b.a - a.a) * k };
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
function spriteKey(shape, hi, si, li, st) {
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
                              : shape === 9 ? imageSpriteVersion + "," + st.imgTint : "";
  return shape + "|" + hi + "|" + si + "|" + li + "|" + extra;
}
function clearSpriteCache() { spriteCache.clear(); }

function hsl(h, s, l) { return "hsl(" + (((h % 360) + 360) % 360) + "," + Math.round(clamp01(s) * 100) + "%," + Math.round(clamp01(l) * 100) + "%)"; }

function makeSprite(shape, hue, sat, lum, st) {
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
    case 9: {   // image — your own PNG as the particle
      if (!imageSpriteEl || !imageSpriteEl.complete || !imageSpriteEl.naturalWidth) break;
      const iw = imageSpriteEl.naturalWidth, ih = imageSpriteEl.naturalHeight;
      const k = Math.min(SPRITE_PX / iw, SPRITE_PX / ih);   // contain, preserving aspect
      const w = iw * k, h = ih * k;
      g.imageSmoothingEnabled = k < 1;        // downscale smoothly, upscale crisply
      g.drawImage(imageSpriteEl, (SPRITE_PX - w) / 2, (SPRITE_PX - h) / 2, w, h);
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

function getSprite(shape, hue, sat, light, st) {
  const hi = Math.round((((hue % 360) + 360) % 360) / 360 * HUE_STEPS) % HUE_STEPS;
  const si = Math.round(clamp01(sat) * (SAT_STEPS - 1));
  const li = Math.round(clamp01(light) * (LIGHT_STEPS - 1));
  const key = spriteKey(shape, hi, si, li, st);
  let s = spriteCache.get(key);
  if (!s) {
    s = makeSprite(shape, hi / HUE_STEPS * 360, si / (SAT_STEPS - 1), li / (LIGHT_STEPS - 1), st);
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
      const spr = getSprite(0, hue, sat, light, st);
      g.globalAlpha = a;
      g.drawImage(spr, x - sz / 2, y - sz / 2, sz, sz);
      if (st.flashRays > 0) drawRays(g, x, y, sz, st, hue, a);
      continue;
    }

    const spr = getSprite(shape, hue, sat, light, st);
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
function postProcess(cv, st) {
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

  const needsPixelPass = st.alphaCut > 0 || st.posterize < 32 || st.outline > 0;
  if (!needsPixelPass) return cv;

  const img = g.getImageData(0, 0, w, h), d = img.data;
  if (st.alphaCut > 0) {           // hard alpha — what makes GIF and pixel-art export clean
    const cut = st.alphaCut * 255;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= cut ? 255 : 0;
  }
  if (st.posterize < 32) {         // the bitcrush analog
    const lv = Math.max(2, Math.round(st.posterize)), q = 255 / (lv - 1);
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
    const r = Math.round(st.outline);
    const alpha = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) alpha[p] = d[p * 4 + 3] > 8 ? 1 : 0;
    const tone = Math.round(st.outlineTone * 255);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (alpha[p]) continue;
        let hit = false;
        for (let dy = -r; dy <= r && !hit; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (alpha[ny * w + nx]) { hit = true; break; }
          }
        }
        if (hit) { const o = p * 4; d[o] = d[o + 1] = d[o + 2] = tone; d[o + 3] = 255; }
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
    postProcess(cv, st);
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

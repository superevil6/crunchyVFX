"use strict";
// THE PIXEL FLUID (VFX 1.3, VFX-DESIGN.md §64). Pure: no DOM, no app state, so it can move to crunchyCore as fire.js did
// (§59): everything here would move; it needs crunchyCore pixart.js's pixPalette and PIX_BAYER (the Pixel art layer's
// colors and dither) at CALL time, nothing at load. vfx.js keeps only the canvas paint (drawFluid).
//
// A small grid fluid, stable-fluids style (Stam 1999): each step the sources push dye, heat and velocity in; buoyancy
// lifts what is hot (or light) and sinks what is heavy; wind leans what carries dye; VORTICITY CONFINEMENT puts back the
// curls a coarse grid smooths away (Fedkiw 2001); the velocity carries itself (semi-Lagrangian, bilinear), is damped
// (viscosity) and PROJECTED (Gauss-Seidel pressure, warm-started from the step before) so it neither gathers nor spreads;
// then the dye and heat ride it and fade. Open edges: what leaves the frame is gone, the air coming in is clean.
//
//   fluidSim(o) -> { dens: [Float32Array], heat: [Float32Array] | null, w, h, n }
//     o: { w, h        the grid, in cells
//          frames      how many frames the clip has (NL)
//          loop        true: a seamless loop (warmed up first, then the tail cross-faded into the head)
//          seed        a whole number
//          source      FLUID_SOURCES index: puff, column, jet, swirl, ink drop
//          ax, ay      the source's middle, in cells;  angle  its heading in degrees (-90 = up, 90 = down)
//          size        the source's radius, a share of the grid's short side
//          amount      the dye at the source (a puff or a drop: all of it at once), 0.1..2
//          push        how hard it pushes, frame heights per second
//          speed       time scale (1 = real time)
//          viscosity   0..1 (the velocity's damping); fade 0..1 (the dye's)
//          curl        0..2 (vorticity confinement); buoyancy -2..2 (negative sinks); wind -1..1; noise 0..1
//          heat        0..1 (heat put in with the dye: hot cores that cool to smoke); cool 0..1
//          crossfade   (tests) false: a loop without its seam's cross-fade (to measure what the fade hides) }
//     dens / heat: one grid per frame (w x h, row by row); heat is null with heat 0.
//   fluidFrame(st, t, W, H, seed) -> { rgba, Wa, Ha, k, pixel, n } | null
//     st      the effect's rows (fluid … fluidDither, plus originX, originY, duration, fps)
//     rgba    Wa x Ha RGBA bytes (Uint8ClampedArray); k screen pixels per cell (a whole number when pixel)
//     pixel   true: draw it unsmoothed at k (the cells ARE art pixels); false: draw it smoothed over the frame
//
// LOOPS: the forcing repeats every clip (the random draws are salted by the step within the clip, as fire.js does), and
// the sim is warmed up whole clips first, so the end of one clip and the start of the next are close; the last quarter
// of the clip is then CROSS-FADED (on the fields, before coloring, so a pixel look stays hard) into the head: frame i of
// the first quarter is the sim at i one clip later blended toward the sim at i, so the clip's last frame leads into its
// first exactly as one sim step leads into the next. A fluid is chaotic, so periodic forcing alone never repeats exactly;
// the fade alone would ghost two different clouds; together the two are close and the fade hides the rest.
const FLUID_BUILD = 1;
const FLUID_SOURCES = ["puff", "column", "jet", "swirl", "ink drop"];   // append-only (stored indices)
const FLUID_LOOKS = ["smooth", "pixel art"];                             // append-only
const FLUID_SPS = 50;                                                    // sim steps per second of clip (at least one a frame)

// the hash RNG (VFX's hash32 and rnd, under this file's prefix): 0..1 for (i, salt) under `seed`
function fluidHash32(a) {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
  return t >>> 0;
}
function fluidRnd(seed, i, salt) {
  return fluidHash32(fluidHash32(Math.imul(i, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)) ^ Math.imul(salt, 0xc2b2ae35)) / 4294967296;
}
const fluidClamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// smooth noise over the clip's steps, -1..1: knots every `gap` steps, wrapping at `per` (a loop's noise repeats)
function fluidWave(seed, n, per, gap, salt) {
  const K = Math.max(1, Math.round(per / gap)), f = (n % per) / per * K, i = Math.floor(f), u = f - i, s = u * u * (3 - 2 * u);
  const a = fluidRnd(seed, i % K, salt) * 2 - 1, b = fluidRnd(seed, (i + 1) % K, salt) * 2 - 1;
  return a + (b - a) * s;
}

// smooth value noise, 0..1, cells of size c: the dye goes in with this grain, so the folds it is rolled into show inside
function fluidNoise(seed, x, y, c, salt) {
  const fx = x / c, fy = y / c, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const L = (a, b) => fluidRnd(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663), salt);
  const a = L(ix, iy) + (L(ix + 1, iy) - L(ix, iy)) * tx, b = L(ix, iy + 1) + (L(ix + 1, iy + 1) - L(ix, iy + 1)) * tx;
  return a + (b - a) * ty;
}

// semi-Lagrangian advection of `src` into `dst` along (u, v) * dt. open: outside the grid is 0 (dye); else clamped (velocity)
function fluidAdvect(dst, src, u, v, w, h, dt, open) {
  const xm = w - 1, ym = h - 1;
  for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
    let px = x - dt * u[j], py = y - dt * v[j];
    if (open && (px < -0.5 || py < -0.5 || px > xm + 0.5 || py > ym + 0.5)) { dst[j] = 0; continue; }
    px = px < 0 ? 0 : px > xm ? xm : px;
    py = py < 0 ? 0 : py > ym ? ym : py;
    const x0 = px | 0, y0 = py | 0, x1 = x0 < xm ? x0 + 1 : xm, y1 = y0 < ym ? y0 + 1 : ym, fx = px - x0, fy = py - y0;
    const r0 = y0 * w, r1 = y1 * w;
    const a = src[r0 + x0] + (src[r0 + x1] - src[r0 + x0]) * fx, b = src[r1 + x0] + (src[r1 + x1] - src[r1 + x0]) * fx;
    dst[j] = a + (b - a) * fy;
  }
}

// MacCormack advection (Selle et al. 2008) for the dye and heat: one step forward, one back, half the round trip's error
// put back, clamped to the cells the step read (so it never rings). The plain step blurs a fold away in a few dozen steps;
// this keeps the curls the flow rolls the dye into, which is what makes it read as fluid rather than a soft blob.
function fluidAdvectMC(dst, src, u, v, w, h, dt, fw, bk) {
  fluidAdvect(fw, src, u, v, w, h, dt, true);
  fluidAdvect(bk, fw, u, v, w, h, -dt, true);
  const xm = w - 1, ym = h - 1;
  for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
    let px = x - dt * u[j], py = y - dt * v[j];
    if (px < -0.5 || py < -0.5 || px > xm + 0.5 || py > ym + 0.5) { dst[j] = 0; continue; }
    px = px < 0 ? 0 : px > xm ? xm : px;
    py = py < 0 ? 0 : py > ym ? ym : py;
    const x0 = px | 0, y0 = py | 0, x1 = x0 < xm ? x0 + 1 : xm, y1 = y0 < ym ? y0 + 1 : ym;
    const a = src[y0 * w + x0], b = src[y0 * w + x1], c = src[y1 * w + x0], e = src[y1 * w + x1];
    const lo = Math.min(Math.min(a, b), Math.min(c, e)), hi = Math.max(Math.max(a, b), Math.max(c, e));
    const r = fw[j] + 0.5 * (src[j] - bk[j]);
    dst[j] = r < lo ? lo : r > hi ? hi : r;
  }
}

function fluidSim(o) {
  const w = Math.max(4, o.w | 0), h = Math.max(4, o.h | 0), N = w * h, NL = Math.max(1, o.frames | 0), loop = !!o.loop, seed = o.seed | 0;
  const src = Math.max(0, Math.min(FLUID_SOURCES.length - 1, Math.round(o.source || 0)));
  const S = Math.min(w, h), per = Math.max(NL, Math.round((o.duration || 1) * FLUID_SPS));
  const spd = Math.max(0.05, o.speed == null ? 1 : o.speed), dt = spd * (o.duration || 1) * FLUID_SPS / per;   // steps of 1/50 s
  const cps = h / FLUID_SPS;                             // one frame height per second, in cells per step
  const ang = (o.angle == null ? -90 : o.angle) * Math.PI / 180, dirX = Math.cos(ang), dirY = Math.sin(ang);
  const R = Math.max(0.6, (o.size == null ? 0.12 : o.size) * S), amount = Math.max(0, o.amount == null ? 1 : o.amount);
  const push = (o.push == null ? 0.6 : o.push) * cps;
  const damp = 1 - 0.08 * fluidClamp01(o.viscosity == null ? 0.2 : o.viscosity) * dt;
  const fade = 1 - 0.06 * fluidClamp01(o.fade == null ? 0.3 : o.fade) * dt, erode = 0.003 * fluidClamp01(o.fade == null ? 0.3 : o.fade) * dt;
  const cool = 1 - 0.09 * fluidClamp01(o.cool == null ? 0.5 : o.cool) * dt, edgeCool = 0.02 * dt;
  const eps = 0.35 * Math.max(0, o.curl == null ? 0.6 : o.curl);
  const buoy = (o.buoyancy || 0) * cps * 0.09, wind = Math.max(-1, Math.min(1, o.wind || 0)) * cps * 0.05;
  const noise = fluidClamp01(o.noise == null ? 0.5 : o.noise), heat0 = fluidClamp01(o.heat || 0), hot = heat0 > 0;
  const ax = o.ax == null ? w / 2 : o.ax, ay = o.ay == null ? h / 2 : o.ay;
  let u = new Float32Array(N), v = new Float32Array(N), u2 = new Float32Array(N), v2 = new Float32Array(N);
  let d = new Float32Array(N), d2 = new Float32Array(N), T = hot ? new Float32Array(N) : null, T2 = hot ? new Float32Array(N) : null;
  const p = new Float32Array(N), div = new Float32Array(N), wv = new Float32Array(N), ws = new Float32Array(N), fw = new Float32Array(N), bk = new Float32Array(N);
  // the source's footprint: the cells within Rf + 1 of its middle (R its radius; a puff's lumps reach a little past it)
  const Rf = src === 0 ? R * 1.3 : R;
  const fx0 = Math.max(0, Math.floor(ax - Rf - 1)), fx1 = Math.min(w - 1, Math.ceil(ax + Rf + 1));
  const fy0 = Math.max(0, Math.floor(ay - Rf - 1)), fy1 = Math.min(h - 1, Math.ceil(ay + Rf + 1));
  const exA = new Float32Array(N);                                      // the expansion asked of each cell this step
  // the swirl's spinning field (tangential, with a slight pull in), worked out once: its strength falls off from the middle
  const Rs = R * 3.2, swirlW = src === 3 ? new Float32Array(N) : null, swirlU = src === 3 ? new Float32Array(N) : null, swirlV = src === 3 ? new Float32Array(N) : null;
  if (src === 3) for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
    const rx = x - ax, ry = y - ay, r = Math.hypot(rx, ry);
    if (r > Rs * 1.6 || r < 1e-3) continue;
    swirlW[j] = Math.exp(-(r * r) / (Rs * Rs)) * push * 0.22;
    swirlU[j] = -ry / r - 0.18 * rx / r; swirlV[j] = rx / r - 0.18 * ry / r;
  }
  // a puff and an ink drop are one-shots: all their dye goes in at the first step (frame 0 shows it whole)
  const oneShot = src === 0 || src === 4, burst = 1;
  const warm = loop ? per * Math.max(1, Math.ceil(Math.max(2.5 * h / Math.max(0.2, push + Math.abs(buoy) * 8), 60) / per)) : 0;
  const tail = loop ? Math.max(1, Math.round(NL * 0.25)) : 0;          // the cross-fade, in frames
  const stepOf = (f) => Math.round(f * per / NL);                       // the clip's frame f is the sim after this many steps
  const total = warm + stepOf(NL + tail) + 1;
  const keepD = new Array(NL + tail), keepT = hot ? new Array(NL + tail) : null;
  let nextF = 0;
  // a puff is a CLUSTER of lumps (6 to 10 by Noise), each its own little cloud, so it billows rather than swelling as a disc
  const lumps = [], nL = 6 + Math.round(noise * 4);
  for (let k = 0; k < nL; k++) {
    const a = fluidRnd(seed, k, 801) * 2 * Math.PI, r = R * 0.55 * Math.sqrt(fluidRnd(seed, k, 802)) * (k ? 1 : 0);
    lumps.push({ x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r, r: R * (0.42 + 0.3 * fluidRnd(seed, k, 803)) * (k ? 1 : 1.25),
      m: 0.75 + 0.5 * fluidRnd(seed, k, 804) });
  }
  for (let n = 0; n < total; n++) {
    const salt = loop ? n % per : n, ns = n - warm;                     // ns: steps since the clip's frame 0
    // ---- sources ----
    const since = loop ? salt : n, inkFor = src === 4 ? Math.max(2, Math.round(0.2 * per)) : burst;
    if (!oneShot || since < inkFor) {
      const wob = noise * fluidWave(seed, salt, per, 9, 802), wob2 = noise * fluidWave(seed, salt, per, 5, 803);
      // a column breathes: its dye comes in puffs (by Noise), so it rises as a chain of clouds, not a rod
      const pulse = src === 1 ? fluidClamp01(0.6 + 1.1 * noise * fluidWave(seed, salt, per, 8, 805)) : 1;
      const gK = Math.max(1, Math.round(per / 6)), gfk = (salt % per) / per * gK, gk0 = Math.floor(gfk) % gK, gk1 = (gk0 + 1) % gK, gkf = gfk - Math.floor(gfk);
      const turn = src === 3 ? 2 * Math.PI * Math.round(Math.max(1, spd)) * (salt / per) : 0;   // whole turns per clip
      for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
        const j = y * w + x, rx = x - ax, ry = y - ay, r = Math.hypot(rx, ry);
        if (src === 3) continue;                                        // the swirl's dye goes in below
        const fall = fluidClamp01(R + 0.5 - r);
        if (fall <= 0 && src !== 0) continue;
        // the grain: value noise about half the source wide; a column's blends from one field to the next every few steps
        // (wrapping round the clip), so its puffs differ and a loop's repeat
        const gc = Math.max(1.5, R * 0.45);
        const jit = 1 + noise * 0.9 * ((oneShot ? fluidNoise(seed, x, y, gc, 804)
          : fluidNoise(seed + gk0 * 131, x, y, gc, 804) * (1 - gkf) + fluidNoise(seed + gk1 * 131, x, y, gc, 804) * gkf) - 0.5);
        if (src === 0) {
          // a puff: its lumps of dye (and heat), kicked outward from the middle, unevenly, and a little along the heading
          let m = 0;
          for (let k = 0; k < nL; k++) { const L = lumps[k], e = Math.hypot(x - L.x, y - L.y) / (L.r + 0.5); if (e < 1) m += (1 - e * e) * L.m; }
          if (m <= 0) continue;
          m = Math.min(1.4, m);
          d[j] += amount / burst * m * jit;
          if (hot) T[j] = Math.min(heat0, T[j] + heat0 * Math.pow(Math.min(1, m), 1.5));   // hottest in the heart
          const out = push * 0.9 * Math.min(1, r / R) * jit, ux = (r > 1e-3 ? rx / r : 0) * out + dirX * push * 0.15, vy = (r > 1e-3 ? ry / r : 0) * out + dirY * push * 0.15;
          const q = Math.min(1, m);
          u[j] += (ux - u[j]) * q; v[j] += (vy - v[j]) * q;
        } else if (src === 4) {
          // an ink drop: a disc of dye moving along the heading at the first step, then a trickle behind it, thinning away
          const k = since === 0 ? 1 : 0.22 * Math.pow(1 - since / inkFor, 2), kr = since === 0 ? 1 : 0.45;
          const f2 = since === 0 ? fall : fluidClamp01(R * kr + 0.5 - r);
          if (f2 <= 0) continue;
          d[j] += amount * k * f2 * jit;
          if (hot) T[j] += heat0 * k * f2;
          u[j] += (dirX * push - u[j]) * f2; v[j] += (dirY * push - v[j]) * f2;
        } else {
          // a column or a jet: the source held near `amount` of dye (in puffs), the flow set toward the heading, swinging with the noise
          const th = ang + wob * (src === 2 ? 0.25 : 0.45), sp = push * (1 + 0.3 * wob2) * (src === 2 ? 1.8 : 1);
          d[j] += (amount * pulse * jit - d[j]) * 0.35 * fall;
          if (hot) T[j] += (heat0 - T[j]) * 0.5 * fall;
          const k2 = 0.6 * fall;
          u[j] += (Math.cos(th) * sp - u[j]) * k2; v[j] += (Math.sin(th) * sp - v[j]) * k2;
        }
      }
      if (src === 3) {
        // the swirl: a spinning field round the source (tangential, a slight pull in), with dye fed at three points on a
        // ring that turns with it, so the dye winds into arms
        for (let j = 0; j < N; j++) { const f = swirlW[j] * dt; if (f !== 0) { u[j] += swirlU[j] * f; v[j] += swirlV[j] * f; } }
        for (let q = 0; q < 3; q++) {
          const a = turn + q * 2 * Math.PI / 3 + wob * 0.3, cx = ax + Math.cos(a) * Rs * 0.8, cy = ay + Math.sin(a) * Rs * 0.8;
          const r0 = Math.max(0.8, R * 0.55);
          for (let y = Math.max(0, Math.floor(cy - r0 - 1)); y <= Math.min(h - 1, Math.ceil(cy + r0 + 1)); y++)
            for (let x = Math.max(0, Math.floor(cx - r0 - 1)); x <= Math.min(w - 1, Math.ceil(cx + r0 + 1)); x++) {
              const j = y * w + x, fall = fluidClamp01(r0 + 0.5 - Math.hypot(x - cx, y - cy));
              if (fall <= 0) continue;
              d[j] += (amount - d[j]) * 0.35 * fall;
              if (hot) T[j] += (heat0 - T[j]) * 0.5 * fall;
            }
        }
      }
    }
    // ---- forces: buoyancy (on heat and dye), wind (on what carries dye), vorticity confinement ----
    if (buoy !== 0 || wind !== 0) for (let j = 0; j < N; j++) {
      const m = d[j] < 1 ? d[j] : 1, b = hot ? T[j] + 0.25 * m : m;
      if (b > 0) v[j] -= buoy * b * dt;
      if (wind !== 0 && m > 0) u[j] += wind * m * dt;
    }
    if (eps > 0) {
      // the curl, smoothed over 3 x 3 cells first: confinement fed the raw curl amplifies the grid's own one-cell eddies into
      // fingers (a cloud grew icicles); smoothed, it keeps the curls the size of the cloud's lumps
      for (let y = 1; y < h - 1; y++) for (let x = 1, j = y * w + 1; x < w - 1; x++, j++)
        wv[j] = 0.5 * (v[j + 1] - v[j - 1] - u[j + w] + u[j - w]);
      for (let y = 2; y < h - 2; y++) for (let x = 2, j = y * w + 2; x < w - 2; x++, j++)
        ws[j] = (wv[j - w - 1] + wv[j - w] + wv[j - w + 1] + wv[j - 1] + wv[j] + wv[j + 1] + wv[j + w - 1] + wv[j + w] + wv[j + w + 1]) / 9;
      for (let y = 3; y < h - 3; y++) for (let x = 3, j = y * w + 3; x < w - 3; x++, j++) {
        const gx = 0.5 * (Math.abs(ws[j + 1]) - Math.abs(ws[j - 1])), gy = 0.5 * (Math.abs(ws[j + w]) - Math.abs(ws[j - w]));
        const len = Math.hypot(gx, gy) + 1e-5, c = ws[j] * eps * dt;
        u[j] += gy / len * c; v[j] -= gx / len * c;
      }
    }
    // ---- the velocity carries itself, is damped, and is projected ----
    fluidAdvect(u2, u, u, v, w, h, dt, false);
    fluidAdvect(v2, v, u, v, w, h, dt, false);
    let t0 = u; u = u2; u2 = t0; t0 = v; v = v2; v2 = t0;
    for (let j = 0; j < N; j++) { u[j] *= damp; v[j] *= damp; }
    // EXPANSION (divergence control): an incompressible flow cannot swell, so a burst's outward push would be projected
    // away. A puff's dye expands for a while after it goes in (fading out over a fifth of the clip), and hot gas always
    // does a little: the projection is asked for that much divergence where they are, not zero.
    const ex = src === 0 ? push * 0.25 * Math.exp(-(loop ? salt : n) / (0.08 * per)) : 0, exh = hot ? push * 0.03 : 0;
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
      const uR = x < w - 1 ? u[j + 1] : u[j], uL = x > 0 ? u[j - 1] : u[j], vD = y < h - 1 ? v[j + w] : v[j], vU = y > 0 ? v[j - w] : v[j];
      let dv = 0.5 * (uR - uL + vD - vU);
      if (ex > 0 || exh > 0) {
        const m = d[j] < 1 ? d[j] : 1, e = (ex * m + (hot ? exh * (T[j] < 1 ? T[j] : 1) : 0)) * dt;
        dv -= e; exA[j] = e < 0.5 ? e : 0.5;
      }
      div[j] = dv;
    }
    for (let it = 0; it < 14; it++) for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
      // open edges: the pressure outside is 0, so the flow may leave
      p[j] = ((x > 0 ? p[j - 1] : 0) + (x < w - 1 ? p[j + 1] : 0) + (y > 0 ? p[j - w] : 0) + (y < h - 1 ? p[j + w] : 0) - div[j]) * 0.25;
    }
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
      u[j] -= 0.5 * ((x < w - 1 ? p[j + 1] : 0) - (x > 0 ? p[j - 1] : 0));
      v[j] -= 0.5 * ((y < h - 1 ? p[j + w] : 0) - (y > 0 ? p[j - w] : 0));
    }
    // ---- the dye and heat ride it and fade ----
    fluidAdvectMC(d2, d, u, v, w, h, dt, fw, bk);
    t0 = d; d = d2; d2 = t0;
    // what expands thins out (the same dye over more room)
    // Fade both thins everything and wears the thinnest wisps away (they would trail as threads; clouds stay clouds)
    if (ex > 0 || exh > 0) for (let j = 0; j < N; j++) { const q = d[j] * fade * (1 - exA[j]) - erode; d[j] = q > 0 ? q : 0; exA[j] = 1 - exA[j]; }
    else for (let j = 0; j < N; j++) { const q = d[j] * fade - erode; d[j] = q > 0 ? q : 0; }
    if (hot) {
      fluidAdvectMC(T2, T, u, v, w, h, dt, fw, bk);
      t0 = T; T = T2; T2 = t0;
      // heat leaves the thin edges first (they mix with the cold air), so a hot cloud keeps a hot heart and a cooler rim
      for (let j = 0; j < N; j++) { const m = d[j] < 1 ? d[j] : 1; T[j] *= cool - edgeCool * (1 - m); }
    }
    if (ex > 0 || exh > 0) exA.fill(0);
    while (nextF < NL + tail && ns === stepOf(nextF)) {
      keepD[nextF] = d.slice(); if (hot) keepT[nextF] = T.slice();
      nextF++;
    }
  }
  // the loop's seam: the first `tail` frames are the sim one clip later, faded toward the sim at that frame
  const dens = keepD.slice(0, NL), heat = hot ? keepT.slice(0, NL) : null;
  for (let i = 0; i < tail && i < NL && o.crossfade !== false; i++) {
    const a = (i + 1) / (tail + 1), A = keepD[NL + i], B = keepD[i], out = new Float32Array(N);
    for (let j = 0; j < N; j++) out[j] = A[j] + (B[j] - A[j]) * a;
    dens[i] = out;
    if (hot) {
      const At = keepT[NL + i], Bt = keepT[i], ot = new Float32Array(N);
      for (let j = 0; j < N; j++) ot[j] = At[j] + (Bt[j] - At[j]) * a;
      heat[i] = ot;
    }
  }
  return { dens, heat, w, h, n: NL };
}

// the grid for a frame W x H: pixel art keeps the Pixel art layer's grid (a whole k, so the two line up); smooth keeps the
// same cells at ANY render size (k fractional), so an export at 4x draws the same cloud as the preview
function fluidGrid(st, W, H) {
  const det = Math.max(8, st.fluidDetail || 48), pixel = Math.round(st.fluidLook || 0) === 1;
  if (pixel) { const k = Math.max(1, Math.round(Math.min(W, H) / det)); return { Wa: Math.ceil(W / k), Ha: Math.ceil(H / k), k, pixel }; }
  const k = Math.min(W, H) / det;
  return { Wa: Math.max(4, Math.round(W / k)), Ha: Math.max(4, Math.round(H / k)), k, pixel };
}
// the last few sims, by everything they read (the preview, the strip and an export ask for the same one over and over)
const fluidCache = [];
function fluidSimFor(st, Wa, Ha, seed) {
  const NL = Math.max(1, Math.min(120, Math.round(Math.max(0.1, st.duration) * Math.max(1, st.fps || 24))));
  const o = { w: Wa, h: Ha, frames: NL, loop: st.fluidLoop > 0, seed, source: st.fluidSource, duration: Math.max(0.1, st.duration),
    ax: st.originX * Wa, ay: st.originY * Ha, angle: st.fluidAngle, size: st.fluidSize, amount: st.fluidAmount, push: st.fluidPush,
    speed: st.fluidSpeed, viscosity: st.fluidViscosity, fade: st.fluidFade, curl: st.fluidCurl, buoyancy: st.fluidBuoyancy,
    wind: st.fluidWind, noise: st.fluidNoise, heat: st.fluidHeat, cool: st.fluidCool };
  const key = JSON.stringify(o);
  for (let i = 0; i < fluidCache.length; i++) if (fluidCache[i].key === key) {
    const c = fluidCache[i]; if (i) { fluidCache.splice(i, 1); fluidCache.unshift(c); }
    return c.sim;
  }
  const sim = fluidSim(o);
  fluidCache.unshift({ key, sim });
  if (fluidCache.length > 3) fluidCache.length = 3;
  return sim;
}

// ONE FRAME, colored. The colors are the Pixel art layer's (pixPalette: fluidColors over PIX_RAMPS, Hue): a ladder of the
// smoke grays (when Smoke) then the ramp, darkest first. Where the fluid is hot (Heat) a cell climbs the ramp by its heat
// and turns to smoke as it cools; with no heat, by its density. Shade lights the side facing the light (up-left) a step
// and darkens the far side, from the density's slope, so a cloud has volume. Smooth: the ladder blended, alpha by density.
// Pixel art: the ladder in hard steps, ordered-dithered between them (Dither), cells under a threshold empty (dithered
// too, so the edge breaks up like the pixel layer's smoke), and an outline of the ramp's own outline color (Outline).
function fluidFrame(st, t, W, H, seed) {
  if (!(st.fluid > 0)) return null;
  const G = fluidGrid(st, W, H), Wa = G.Wa, Ha = G.Ha, N = Wa * Ha;
  const sim = fluidSimFor(st, Wa, Ha, seed), NL = sim.n;
  let f = Math.round(t * Math.max(1, st.fps || 24) + 1e-6);
  f = st.fluidLoop > 0 ? ((f % NL) + NL) % NL : Math.max(0, Math.min(NL - 1, f));
  const D = sim.dens[f], T = sim.heat ? sim.heat[f] : null;
  // a one-shot is gone by its last frame: over the last 30 % of the clip its coverage drains away (the color stays, so a
  // pixel cloud dissolves through the dither at its edge, a smooth one fades)
  const env = st.fluidLoop > 0 || NL < 2 ? 1 : fluidClamp01((1 - f / NL) / 0.3);
  const P = pixPalette(Object.assign({}, st, { pixColors: st.fluidColors == null ? 4 : st.fluidColors, pixHue: st.fluidHue || 0 }));
  const smoke = fluidClamp01(st.fluidSmoke || 0), nR = P.n;
  const ladder = (smoke > 0 && T ? P.pal.slice(1, 4) : []).concat(P.pal.slice(4)), L = ladder.length, s0 = L - nR;
  const out = P.pal[0], heat0 = Math.max(0.01, fluidClamp01(st.fluidHeat || 0));
  const shade = fluidClamp01(st.fluidShade == null ? 0.5 : st.fluidShade), dith = fluidClamp01(st.fluidDither == null ? 0.5 : st.fluidDither);
  const thick = Math.max(0.05, st.fluidThick == null ? 0.6 : st.fluidThick);     // the density drawn at full strength
  const pos = new Float32Array(N), cov = new Float32Array(N);
  // SELF-SHADOW: how much fluid lies between a cell and the light (up-left, along the diagonal: one pass), so the side
  // facing the light is lit, the belly and the folds behind it dark, as a sprite artist shades a cloud
  const depth = new Float32Array(N), kd = 0.38 * 48 / Math.max(8, Math.min(Wa, Ha)) / thick;
  for (let y = 1; y < Ha; y++) for (let x = 1, j = y * Wa + 1; x < Wa; x++, j++) depth[j] = depth[j - Wa - 1] + D[j - Wa - 1];
  for (let y = 0, j = 0; y < Ha; y++) for (let x = 0; x < Wa; x++, j++) {
    // and nothing is cut off square by the frame: the coverage thins out over the last few cells to every edge
    const eg = Math.min(x + 0.5, y + 0.5, Wa - x - 0.5, Ha - y - 0.5) / Math.max(2, Math.min(Wa, Ha) * 0.1);
    const dn = D[j] / thick;
    cov[j] = dn * env * (eg < 1 ? eg * eg : 1);
    if (cov[j] <= 0.004) { pos[j] = -1; continue; }
    // the slope of the density, toward the light (up-left): + lit, - in shadow
    const dl = x > 0 ? D[j - 1] : 0, dr = x < Wa - 1 ? D[j + 1] : 0, du = y > 0 ? D[j - Wa] : 0, dd = y < Ha - 1 ? D[j + Wa] : 0;
    const gx = (dr - dl) / thick, gy = (dd - du) / thick, gl = Math.hypot(gx, gy);
    const rim = gl > 1e-4 ? ((gx + gy) * 0.7071 / gl) * Math.min(1, gl * 3) : 0;
    const lit = 0.45 * rim + 1.5 * (Math.exp(-kd * depth[j]) - 0.45);
    let q, lo = 0, hi = L - 1;
    if (T) {
      const hn = Math.min(1, T[j] / heat0);
      const rq = s0 + hn * (nR - 1);                                    // hot: up the ramp by heat
      if (s0 > 0) {
        // cooled: the smoke grays by density; the band between (a fifth of the heat scale x Smoke) blends the two. Shade
        // keeps to the part a cell is in (smoke lit never turns to flame)
        const sq = Math.min(s0 - 0.01, Math.min(1, dn * 1.6) * (s0 - 0.01)), cut = 0.35 * smoke;
        const wq = fluidClamp01((hn - cut * 0.5) / Math.max(0.02, cut * 0.5));
        q = sq + (rq - sq) * wq;
        if (wq < 0.5) hi = s0 - 0.01; else lo = s0;
      } else q = rq;
    } else q = Math.min(1, dn) * (L - 1);
    q += shade * 1.3 * lit;
    pos[j] = q < lo ? lo : q > hi ? hi : q;
  }
  const rgba = new Uint8ClampedArray(N * 4);
  if (!G.pixel) {
    for (let j = 0; j < N; j++) {
      if (pos[j] < 0) continue;
      const q = pos[j], i0 = Math.floor(q), i1 = Math.min(L - 1, i0 + 1), fr = q - i0, c0 = ladder[i0], c1 = ladder[i1];
      const a = Math.pow(fluidClamp01((cov[j] - 0.02) / 0.5), 0.85);
      rgba[j * 4] = c0[0] + (c1[0] - c0[0]) * fr; rgba[j * 4 + 1] = c0[1] + (c1[1] - c0[1]) * fr;
      rgba[j * 4 + 2] = c0[2] + (c1[2] - c0[2]) * fr; rgba[j * 4 + 3] = a * 255;
    }
    return { rgba, Wa, Ha, k: G.k, pixel: false, n: L };
  }
  const col = new Int8Array(N).fill(-1);
  for (let y = 0, j = 0; y < Ha; y++) for (let x = 0; x < Wa; x++, j++) {
    if (pos[j] < 0) continue;
    const b = (PIX_BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16 - 0.5;   // -0.5..0.5
    if (cov[j] + b * dith * 0.24 < 0.16) continue;                    // the edge, broken up by the same dither
    col[j] = Math.max(0, Math.min(L - 1, Math.floor(pos[j] + 0.5 + b * dith)));
  }
  // no stray pixels: a lone cell (no filled neighbor on any side) is the dither's salt, not art
  for (let y = 0, j = 0; y < Ha; y++) for (let x = 0; x < Wa; x++, j++) {
    if (col[j] < 0) continue;
    if ((x > 0 && col[j - 1] >= 0) || (x < Wa - 1 && col[j + 1] >= 0) || (y > 0 && col[j - Wa] >= 0) || (y < Ha - 1 && col[j + Wa] >= 0)) continue;
    col[j] = -1;
  }
  const ol = st.fluidOutline > 0;
  for (let y = 0, j = 0; y < Ha; y++) for (let x = 0; x < Wa; x++, j++) {
    const c = col[j];
    let rgb = null;
    if (c >= 0) rgb = ladder[c];
    else if (ol && ((x > 0 && col[j - 1] >= 0) || (x < Wa - 1 && col[j + 1] >= 0) || (y > 0 && col[j - Wa] >= 0) || (y < Ha - 1 && col[j + Wa] >= 0))) rgb = out;
    if (!rgb) continue;
    rgba[j * 4] = rgb[0]; rgba[j * 4 + 1] = rgb[1]; rgba[j * 4 + 2] = rgb[2]; rgba[j * 4 + 3] = 255;
  }
  return { rgba, Wa, Ha, k: G.k, pixel: true, n: L };
}

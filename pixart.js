// GENERATED from crunchyCore/pixart.js @ 68bd26d by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 c2933f618d9bd0b79d219b5c72a81c0feebdc4df8cf8ee55ac77b75035997d6d
"use strict";
// PIXEL ART EFFECTS (moved from CrunchyVFX's vfx.js drawPixelArt, VFX-DESIGN.md §41-§58; 2026-11-24, for CrunchyTexture's ambient
// effects in its places: an orb's glint, motes, sparks). Pure: no DOM, no app state. Effects drawn the way a sprite artist draws
// them: on a coarse grid of ART pixels, each blob in a few hard color steps chosen by its heat, lit from one side with a darker
// rim, a dark outline round everything that touches, frames held. CrunchyVFX draws its Pixel art layer with this; another app
// bakes one of VFX's pixel presets (its rows over PIX_DEFAULTS) into a flipbook with the very same pixels.
//
//   pixArtFrame(st, t, W, H, seed) -> { col, Wa, Ha, k, pal, n, ramp0, tick, frames }
//     st      the effect's rows (VFX's PARAMS names: pix, pixDetail, pixStep … pixFireSpeed, plus originX, originY, duration);
//             pixArtState(preset) fills a preset's rows out with VFX's defaults (PIX_DEFAULTS)
//     t       seconds into the clip; W, H the frame in screen pixels; seed a whole number
//     col     an Int8Array, Wa x Ha art pixels row by row: -1 empty, else an index into pal (0 the outline, 1..3 smoke,
//             ramp0.. the ramp, darkest first); k screen pixels per art pixel (a whole number); n the ramp's length;
//             tick the art frame drawn; frames the art frames in a clip (a Loop's last leads straight into its first)
//   pixPalette(st) -> { pal: [[r, g, b] …], n }   the colors col indexes
//
// HOOKS (pixArtHooks; an app sets them, none needed for the built-in ramps):
//   effect(st) -> { out, ramp } or null   "effect colors" (PIX_RAMPS 4): the app's own colors ([r, g, b] each, the ramp
//                                         darkest first); without it, a gray ramp
//   part(shape, W, H, rot, st) -> { w, h, m, cells }   the "particle" blob shape's mask (VFX draws its smooth particle on a
//                                         canvas); without it, a "particle" blob draws nothing
//   parts() -> how many particle shapes there are (pixParticle is clamped to it)
//
// Needs crunchyCore fire.js (fireSim, fireIndex) for the fire automaton rows. Every number is VFX's to the bit (its frame hash
// proves it): the same hash, the same order of operations. Names: pix* / PIX_* (VFX's own, which this file now holds).
const PIXART_BUILD = 2;   // 2: a "particle" blob with no app hook draws nothing (1 drew a cross)
const pixArtHooks = { effect: null, part: null, parts: null };

// the hash RNG and value noise (VFX's hash32, rnd, lerp, fade, latt, under this file's prefix)
const PIX_DEG = Math.PI / 180;
const pixClamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function pixHash32(a) {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
  return t >>> 0;
}
function pixRnd(seed, i, salt) {
  return pixHash32(pixHash32(Math.imul(i, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)) ^ Math.imul(salt, 0xc2b2ae35)) / 4294967296;
}
function pixLerp(a, b, k) { return a + (b - a) * k; }
function pixFade(t) { return t * t * (3 - 2 * t); }
function pixLatt(seed, x, y, z) { return pixRnd(seed, Math.imul(x, 73856093) ^ Math.imul(y, 19349663), z) * 2 - 1; }

// VFX's defaults for the layer's rows (its PARAMS; crunchyCore's core.test checks them against VFX's index.html), so a preset's
// rows make a whole effect here: pixArtState({ pixShape: 2, … }) is that preset as VFX draws it
const PIX_DEFAULTS = {
  pix: 0, pixDetail: 64, pixStep: 15, pixSize: 1, pixColors: 0, pixHue: 0, pixEmit: 0, pixCount: 9, pixPulses: 1, pixSpan: 0.2,
  pixAreaW: 1, pixAreaH: 0.1, pixLoop: 0, pixAngle: -90, pixSpread: 360, pixSpeed: 0.4, pixSpeedVar: 0.5, pixScatter: 0.95,
  pixGravity: -7, pixDrag: 0, pixSway: 0, pixGather: 0, pixCurl: 0, pixStretch: 0, pixTrail: 0, pixTrailN: 6, pixFloor: 0,
  pixLandAs: 0, pixFlat: 0, pixSpin: 0, pixShape: 0, pixParticle: 30, pixHollow: 0, pixBlob: 0.95, pixSizeVar: 0.5, pixCore: 1,
  pixGrow: 0.18, pixSwell: 0.35, pixLife: 0.75, pixLumps: 0.32, pixBreak: 1, pixBreakAs: 0, pixBreakAt: 0.62, pixBreakIn: 0,
  pixBreakFrom: 0, pixHeat: 1, pixCool: 0.5, pixTone: 0, pixSmoke: 0.7, pixBits: 4, pixBitsAt: 0, pixBitSpeed: 4, pixBitGravity: 16,
  pixSparks: 7, pixSparkSpeed: 8, pixLight: 0.5, pixRim: 0.3, pixSoft: 0, pixLightAngle: 225,
  pixOutline: 1, pixSeeThrough: 0, pixFlash: 0, pixBlobs: 1, pixStroke: 0, pixStrokeSize: 1.2, pixStrokeW: 0.18, pixStrokeLife: 0.6,
  pixStrokeN: 1, pixStrokeWobble: 0, pixCycle: 0, pixCycleSpeed: 1, pixCycleBands: 6, pixWipe: 0, pixWipeAt: 0.35, pixWipeTime: 0.5,
  pixWipeEdge: 0.5, pixDust: 0.5, pixWobble: 0, pixWobbleAxis: 0, pixWobbleWave: 12, pixWobbleSpeed: 1, pixFire: 0, pixFireW: 0.4,
  pixFireH: 0.6, pixFireWind: 0, pixFireSpread: 0.5, pixFireSpeed: 3,
  originX: 0.5, originY: 0.5, duration: 0.7,
};
function pixArtState(preset) { return Object.assign({}, PIX_DEFAULTS, preset || {}); }

// ---- the layer (VFX-DESIGN.md §41) ---------------------------------------------------------------------------------------------
// So there are no kinds: two primitives and their knobs. BLOBS (emitted as a burst, a stream in pulses, or a ring; they
// fly, fall or rise, grow, swell, stretch along their flight, cool down a ramp and may turn to smoke, break up in clumps,
// splat on a floor) and BITS (debris chunks on arcs, and sparks: single flickering pixels). PIX_EMITS and PIX_RAMPS are
// append-only (stored indices).
// bolt (§44): a jagged line out along Direction, both ends pinned, re-struck every art frame (a zap, lightning)
const PIX_EMITS = ["burst", "stream", "ring", "arc", "line", "bolt", "area"];   // append-only (§51: area)
// a blob's silhouette (append-only): the distance a pixel is from the center, measured four ways
const PIX_STROKES = ["none", "ring", "beam", "swoosh", "rays"];          // §49, append-only
const PIX_WIPES2 = ["off", "left to right", "right to left", "top down", "bottom up", "center out", "edges in"];   // §54, append-only
const PIX_WOBBLE_AXES = ["rows", "columns"];                               // §54, append-only
const PIX_CYCLES = ["off", "flow", "rings", "spiral", "spin", "shimmer", "streaks"];  // §49, append-only (§56: streaks)
const PIX_SHAPES = ["round", "diamond", "star", "square", "cross", "heart", "coin", "drop",   // append-only (§48: heart, coin, drop)
  "comic burst", "skull", "exclaim (!)", "question (?)", "Z (sleep)", "music note", "anger mark", "text",   // §52: the stamps
  "particle"];   // §57: any smooth particle (shapes.js), picked by pixParticle
const PIX_PARTICLE = 16;
// §52 STAMPS: small bitmaps drawn here (CC0, by hand in code), stamped at a WHOLE scale so their pixels stay square: a blob
// of radius r draws its stamp at round(2.2 r / its larger side), at least 1, so growing pops it 1x, 2x, 3x. Shaded as a
// blob (an edge cell is rim, the rest body; the highlight by position), broken up, outlined and cycled as one.
const PIX_BITMAPS = {
  9: [".#####.", "#######", "#..#..#", "#######", ".##.##.", ".#####.", ".#.#.#."],                   // skull
  10: ["##", "##", "##", "##", "##", "..", "##"],                                                       // !
  11: [".###.", "##.##", "...##", "..##.", "..##.", ".....", "..##."],                                   // ?
  12: ["#####", "...##", "..##.", ".##..", "#####"],                                                   // Z
  13: ["...##.", "...#.#", "...#..", "...#..", ".###..", "####..", ".##..."],                           // a note
  14: [".##.##.", "##...##", "#.....#", ".......", "#.....#", "##...##", ".##.##."],                   // an anger mark
};
// the TEXT stamp's font: 5 rows, 3 wide (M, N, W and the heart wider), capitals only; a column between letters
const PIX_FONT = {
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", "..#", ".#.", ".#."], "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."], C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."], E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."], K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"], O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."], Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."], U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."], W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
  "+": ["...", ".#.", "###", ".#.", "..."], "-": ["...", "...", "###", "...", "..."], "!": ["#", "#", "#", ".", "#"],
  "?": ["###", "..#", ".#.", "...", ".#."], "%": ["#.#", "..#", ".#.", "#..", "#.#"], ".": [".", ".", ".", ".", "#"],
  ":": [".", "#", ".", "#", "."], "/": ["..#", "..#", ".#.", "#..", "#.."],
  "♥": [".#.#.", "#####", "#####", ".###.", "..#.."], " ": ["..", "..", "..", "..", ".."],
};
// §55 THE FIRE AUTOMATON, the demo-scene fire (heat fed along a source line, each step every cell taking the heat of the
// cells below it less a random cooling; a loop repeats exactly). Since 2026-11-23 the automaton itself is crunchyCore's
// fire.js (fireSim), so CrunchyTexture's torches burn exactly as CrunchyVFX's fires do; this keeps VFX's knobs and its cache:
// simulated once per look and size, kept for the frames that follow.
const pixFireCache = { key: "", steps: null };
function pixFireSim(st, Wa, Ha, ax, ay, NL, loop, seed) {
  const spd = Math.max(1, Math.round(st.pixFireSpeed || 3));
  const H0 = Math.max(0.05, st.pixFireH == null ? 0.6 : st.pixFireH), W0 = Math.max(0.02, st.pixFireW == null ? 0.4 : st.pixFireW);
  const key = [Wa, Ha, Math.round(ax), Math.round(ay), NL, loop ? 1 : 0, seed, spd, H0, W0, st.pixFireWind || 0, st.pixFireSpread == null ? 0.5 : st.pixFireSpread, st.pix > 0 ? st.pixFire : 0].join(",");
  if (pixFireCache.key === key) return pixFireCache;
  const F = fireSim({ w: Wa, h: Ha, ax, ay, frames: NL, loop, seed, speed: st.pixFireSpeed, height: st.pixFireH, width: st.pixFireW,
    wind: st.pixFireWind, spread: st.pixFireSpread, heat: st.pixFire });
  pixFireCache.key = key; pixFireCache.steps = F.steps; pixFireCache.max = F.max; pixFireCache.sy = F.sy;
  return pixFireCache;
}
// §52: the Godot text export reads each frame's stamp scale and center from here (set it to { cur: null }, draw, read)
var PIX_STAMP_PROBE = null;
const pixTextCache = new Map();
function pixTextBitmap(text) {
  const t = String(text || "").replace(/[−–—]/g, "-").toUpperCase().slice(0, 16);
  if (pixTextCache.has(t)) return pixTextCache.get(t);
  const gl = Array.from(t).map((c) => PIX_FONT[c] || PIX_FONT[c.toLowerCase()] || null).filter(Boolean);
  const rows = ["", "", "", "", ""];
  gl.forEach((g, k) => { for (let y = 0; y < 5; y++) rows[y] += (k ? "." : "") + g[y]; });
  const out = rows[0].length ? rows : PIX_BITMAPS[10];
  pixTextCache.set(t, out);
  return out;
}
// a bitmap's cells: 2 = an edge (rim), 1 = body, 0 = empty
const pixBmpCache = new Map();
function pixBmpCells(rows) {
  if (pixBmpCache.has(rows)) return pixBmpCache.get(rows);
  const h = rows.length, w = rows[0].length, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] === "#";
  const c = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) c[y * w + x] = on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1) ? 1 : 2;
  const o = { w, h, c };
  pixBmpCache.set(rows, o);
  return o;
}
// §48 the shapes that are not symmetric about both axes, as inside-tests on unit coordinates (Y up); their metric is the
// scale at which a pixel sits on the edge (found by halving: each is star-shaped round its center), squared, as the
// round blob's x² + y², so the rim, the highlight and Break from read them the same way
const PIX_SHAPE_IN = {
  5: (X, Y) => { const x = X * 1.14, y = Y * 1.15 + 0.14, q = x * x + y * y - 1; return q * q * q - x * x * y * y * y <= 0; },   // heart, point down
  8: (X, Y) => {                                                       // §52 a comic burst: eight spikes, long and short
    const t = (Math.atan2(Y, X) / (Math.PI * 2) + 1) * 8, k = Math.round(t), sp = 1 - Math.abs(t - k) * 2, len = k % 2 ? 0.72 : 1;
    return Math.hypot(X, Y) <= 0.4 + (len - 0.4) * Math.pow(sp, 1.6);
  },
  7: (X, Y) => (Y >= 0 ? X * X + Y * Y <= 1 : Y >= -2 && Math.abs(X) <= Math.sqrt(Math.max(0, 1 - Y * Y * 0.25)) * (1 + Y * 0.5)),   // drop: round head, pointed tail (Y = forward)
};
function pixShapeM(inside, X, Y) {
  if (!inside(X / 3, Y / 3)) return 9;
  let lo = 0.001, hi = 3;
  for (let k = 0; k < 10; k++) { const s = (lo + hi) / 2; if (inside(X / s, Y / s)) hi = s; else lo = s; }
  return hi * hi;
}
// §57 the particles that fly nose first (pure; the particle blob's MASK is the app's: pixArtHooks.part)
// the particles that fly nose first, at 16 headings: spark and teardrop (drawn pointing along +x, as the smooth engine turns
// them), the arrow (drawn pointing up), and the leaf and feather, which tip as they sway down. Else drawn upright.
function pixPartTurn(shape, ux, uy) {
  const off = shape === 1 || shape === 16 ? 0 : shape === 22 || shape === 20 || shape === 32 ? Math.PI / 2 : null;   // + leaf, feather (drawn upright)
  if (off === null || !(ux || uy)) return 0;
  return Math.round((Math.atan2(uy, ux) + off) / (Math.PI / 8)) * (Math.PI / 8);
}
const PIX_BREAKS = ["clumps", "dither"];
// §46 (append-only): where a break starts in a blob, and what a blob does on the Floor
const PIX_WIPES = ["everywhere", "top", "bottom", "center", "edge", "tail"];
const PIX_LANDS = ["splat", "stick"];
const PIX_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];   // the 4x4 ordered-dither thresholds, /16
// §45 appends four hand-picked ramps (darkness can't come from "effect colors": its lightest steps are 0.9 bright)
const PIX_RAMPS = ["fire", "blood", "cloud", "dust", "effect colors", "shadow", "holy", "ice", "electric", "ink"];   // append-only (§50: ink)
// darkest first. The outline is its own color; smoke is the cooled-blob ramp every kind shares.
const PIX_RAMP_RGB = [
  { out: [40, 18, 16], ramp: [[180, 34, 26], [232, 98, 28], [247, 170, 36], [255, 226, 80], [255, 251, 232]] },
  { out: [44, 4, 10], ramp: [[112, 8, 18], [168, 16, 28], [224, 50, 58], [255, 156, 156]] },
  { out: [58, 58, 84], ramp: [[150, 152, 176], [196, 198, 214], [232, 234, 244], [255, 255, 255]] },
  { out: [52, 36, 24], ramp: [[120, 92, 64], [160, 128, 90], [196, 166, 120], [228, 206, 160]] },
  // (index 4 is "effect colors", built in pixPalette) — these four follow it in PIX_RAMPS; a ramp may bring its own smoke
  { out: [10, 4, 18], ramp: [[34, 14, 52], [66, 24, 96], [112, 40, 140], [176, 72, 190], [232, 150, 240]],
    smoke: [[18, 8, 28], [36, 18, 52], [60, 34, 80]] },
  { out: [92, 52, 12], ramp: [[200, 132, 40], [240, 186, 64], [255, 226, 120], [255, 246, 196], [255, 255, 255]] },
  { out: [20, 40, 84], ramp: [[60, 110, 180], [100, 170, 226], [160, 214, 246], [214, 240, 255], [255, 255, 255]] },
  { out: [16, 20, 70], ramp: [[60, 70, 220], [90, 150, 255], [150, 220, 255], [220, 250, 255], [255, 255, 255]] },
  // §50 ink: almost black, its lit side a cold gray so it still reads on a dark ground; its own smoke, darker than the rest
  { out: [0, 0, 0], ramp: [[12, 11, 16], [24, 22, 30], [40, 38, 50], [64, 62, 80], [98, 96, 118]],
    smoke: [[8, 8, 10], [18, 17, 22], [30, 29, 36]] },
];
const PIX_SMOKE = [[56, 46, 46], [88, 74, 68], [128, 112, 100]];
function pixHsl(h, s, l) {     // -> [r, g, b] 0..255
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
// a luminance-keeping hue turn (the YIQ rotation), so green blood stays exactly as dark as red
function pixTurn(rgb, hue) {
  if (!hue) return rgb;
  const c = Math.cos(-hue * PIX_DEG), s = Math.sin(-hue * PIX_DEG), [r, g, b] = rgb;
  const y = 0.299 * r + 0.587 * g + 0.114 * b, i = 0.596 * r - 0.274 * g - 0.322 * b, q = 0.211 * r - 0.523 * g + 0.312 * b;
  const i2 = i * c - q * s, q2 = i * s + q * c;
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return [cl(y + 0.956 * i2 + 0.621 * q2), cl(y - 0.272 * i2 - 0.647 * q2), cl(y - 1.106 * i2 + 1.703 * q2)];
}
// the palette: [outline, smoke x3, ramp...]. "effect colors" builds the ramp from the effect's own color (so color sets
// and the game palette reach it): five lightness steps, hue-shifted warmer toward the light as a pixel artist does.
function pixPalette(st) {
  const which = Math.max(0, Math.min(PIX_RAMPS.length - 1, Math.round(st.pixColors || 0)));
  let out, ramp, smokeRgb = PIX_SMOKE;
  if (which === 4) {                                          // "effect colors": the app's own (pixArtHooks.effect), else gray
    const E = pixArtHooks.effect ? pixArtHooks.effect(st) : null;
    if (E) { out = E.out; ramp = E.ramp; }
    else { ramp = [0.3, 0.44, 0.58, 0.74, 0.9].map((l) => pixHsl(0, 0, l)); out = pixHsl(0, 0, 0.11); }
  } else { const R = PIX_RAMP_RGB[which < 4 ? which : which - 1]; out = R.out; ramp = R.ramp; if (R.smoke) smokeRgb = R.smoke.map((c) => pixTurn(c, st.pixHue || 0)); }
  const hue = st.pixHue || 0;
  return { pal: [pixTurn(out, hue)].concat(smokeRgb, ramp.map((c) => pixTurn(c, hue))), n: ramp.length };
}
// smooth value noise in 0..1 at cell size `c` art pixels: smoke breaks up in CLUMPS, never single-pixel salt
function pixNoise(seed, x, y, c, salt) {
  const fx = x / c, fy = y / c, ix = Math.floor(fx), iy = Math.floor(fy), tx = pixFade(fx - ix), ty = pixFade(fy - iy);
  const a = pixLerp(pixLatt(seed, ix, iy, salt), pixLatt(seed, ix + 1, iy, salt), tx);
  const b = pixLerp(pixLatt(seed, ix, iy + 1, salt), pixLatt(seed, ix + 1, iy + 1, salt), tx);
  return (pixLerp(a, b, ty) + 1) / 2;
}
// ONE FRAME of the pixel-art layer, as palette indices (see the top of the file). VFX's drawPixelArt, all but its last step
// (painting the indices onto its canvas, which stays VFX's).
function pixArtFrame(st, t, W, H, seed) {
  const k = Math.max(1, Math.round(Math.min(W, H) / Math.max(8, st.pixDetail))), kPx = k;   // frame px per art px, whole
  const Wa = Math.ceil(W / k), Ha = Math.ceil(H / k);
  const L = Math.max(0.1, st.duration);
  const step = Math.max(1, st.pixStep || 15);
  // held frames: the clock moves in whole art frames. A Loop (§44) fits a WHOLE number of them into the clip (1.5 s at 15
  // art fps would be 22.5: it plays 23, each as long as the next), counted round, so the last leads straight into the first
  const NL = Math.max(1, Math.round(L * step));
  const tick = st.pixLoop > 0 ? ((Math.floor(t * NL / L + 1e-6) % NL) + NL) % NL : Math.floor(t * step + 1e-6);
  const u = st.pixLoop > 0 ? tick / NL : tick / step / L;
  // Sized and placed by the FRAME and Origin X/Y, never by Fit: a pixel-art-only effect has one invisible particle, and
  // Fit would blow its tiny box up to the frame (xf.k in the hundreds).
  const R0 = 0.16 * Math.min(W, H) * st.pixSize / k;        // the layer's unit, art px: speeds are R0 per duration
  const ax = st.originX * W / k, ay = st.originY * H / k;
  const { pal, n: nR } = pixPalette(st);
  const RAMP0 = 4;                                            // pal index of the ramp's darkest step
  const col = new Int8Array(Wa * Ha).fill(-1), pri = new Float32Array(Wa * Ha).fill(-1e9);
  const put = (x, y, c, p) => {
    if (x < 0 || y < 0 || x >= Wa || y >= Ha) return;
    const j = y * Wa + x;
    if (p >= pri[j]) { pri[j] = p; col[j] = c; }
  };
  const loose = [];   // [x, y, pal index] drawn after the outline: sparks, shines, hot debris
  const emit = Math.round(st.pixEmit || 0), P = Math.max(1, Math.round(st.pixPulses || 1));
  const th0 = (st.pixAngle || 0) * PIX_DEG, spread = (st.pixSpread || 0) * PIX_DEG;
  const G = R0 * (st.pixGravity || 0), drag = Math.max(0, st.pixDrag || 0);
  const floorY = st.pixFloor > 0 ? ay + st.pixFloor * Ha : Infinity;
  const heat0 = pixClamp01(st.pixHeat), tone = pixClamp01(st.pixTone), smoke = pixClamp01(st.pixSmoke);
  const shp = Math.round(st.pixShape || 0), part = Math.max(0, Math.min((pixArtHooks.parts ? pixArtHooks.parts() : 1) - 1, Math.round(st.pixParticle || 0))), dith = Math.round(st.pixBreakAs || 0) === 1;
  const light = pixClamp01(st.pixLight), rim = pixClamp01(st.pixRim), la = (st.pixLightAngle || 0) * PIX_DEG;
  const lx = Math.cos(la) * 0.55, ly = Math.sin(la) * 0.55;  // where the highlight sits inside a blob
  // §44. LOOP: births wrap round the clip (a blob born late carries on into the start), so a torch, a campfire or an aura
  // repeats with no seam; the core stays lit and boils. FLATTEN: the layer laid on the ground, seen from the side
  // (launch and scatter squashed vertically, blobs by 0.65 of it; gravity stays upright, so dust still rises). HOLLOW:
  // a hole in every blob (bubbles, smoke rings, shockwaves); the outline rings it inside too.
  const loop = st.pixLoop > 0, flat = pixClamp01(st.pixFlat || 0), fl = 1 - flat, ys = 1 - 0.65 * flat;
  const hollow = Math.max(0, Math.min(0.95, st.pixHollow || 0));
  const wrap = (v) => v - Math.floor(v);
  // §45. GATHER: every blob's flight runs backwards (born where it would have landed, arriving home as it dies): a
  // charge-up, an implosion, a pull into an orb. SPIN: the blobs turn round the origin, Spin turns per clip (whole turns
  // loop), on the ground when flattened (a halo). BITS AT: debris and sparks start that far along Direction × Scatter
  // (1 = the tip of a bolt or a line: a strike's impact, a muzzle's mouth).
  const gather = st.pixGather > 0, spin = st.pixSpin || 0;
  const bAt = st.pixBitsAt > 0 ? st.pixBitsAt * st.pixScatter * R0 : 0;
  const bx0 = bAt ? ax + Math.cos(th0) * bAt : ax, by0 = bAt ? ay + Math.sin(th0) * bAt * fl : ay;
  // where a body launched at angle th, speed v, born at b is at u (drag eases its flight; gravity in R0 per duration²)
  const fly = (s, v, th, dr, w) => {
    if (w) {                                                  // curling (§46): the heading turns at w per clip as it slows
      const e = Math.exp(-dr * s), Nr = e * Math.cos(w * s) - 1, Ni = e * Math.sin(w * s), D = dr * dr + w * w;
      const Re = (-dr * Nr + w * Ni) / D, Im = (-dr * Ni - w * Nr) / D, c = Math.cos(th), sn = Math.sin(th);
      return [v * (c * Re - sn * Im), v * (sn * Re + c * Im) * fl + 0.5 * G * s * s, Math.cos(th + w * s) * v * e, Math.sin(th + w * s) * v * e * fl + G * s];
    }
    const go = dr > 0 ? (1 - Math.exp(-dr * s)) / dr : s;
    return [Math.cos(th) * v * go, Math.sin(th) * v * go * fl + 0.5 * G * s * s, Math.cos(th) * v * Math.exp(-dr * s), Math.sin(th) * v * Math.exp(-dr * s) * fl + G * s];
  };
  // ---- the blobs ----
  const nB = Math.max(1, Math.round(st.pixCount)), nS = smoke > 0 ? Math.round(nB * 0.78 * smoke) : 0;
  const span = Math.max(0, st.pixSpan), gap = span / P;
  // a bolt: a zigzag of joints (one per four blobs), struck afresh each art frame, pinned at both ends so it always
  // reaches its tip; the blobs are strung along it. Spread is how far a joint swings (90° = a segment's length).
  let bolt = null;
  if (emit === 5 && nB > 1) {
    const J = Math.max(2, Math.round(nB / 4)), seg = st.pixScatter * R0 / J, amp = (st.pixSpread || 0) / 90, o = [0];
    for (let j = 1; j < J; j++) o.push((pixRnd(seed + tick * 7919, j, 480) - 0.5) * 2 * seg * amp);
    o.push(0);
    bolt = new Float32Array(nB);
    for (let j = 0; j < nB; j++) { const q = j / (nB - 1) * J, k0 = Math.min(J - 1, Math.floor(q)); bolt[j] = pixLerp(o[k0], o[k0 + 1], q - k0); }
  }
  // §46. CURL: a blob's flight turns as it goes (Curl turns per clip, each blob a little more or less): a swoosh of wind,
  // a swirl. TRAIL: each blob also drawn where it was, Trail of its life back, in Trail copies, thinning and breaking up
  // toward the tail (a streak when the copies touch, afterimages when they don't). LAND AS stick: a blob that reaches the
  // Floor lies there, whole (a shard, a rock), where splat spreads it as a liquid. BREAK IN: blobs appear through the Break
  // up pattern over that much of their life (materialize). BREAK FROM: the break moves through a blob from one side (a
  // wipe, dithered at its front) instead of everywhere at once. SOFT STEPS: an ordered-dither band where two color steps
  // meet, the 16-bit way to shade (heat, the highlight and the rim).
  const curl = (st.pixCurl || 0) * Math.PI * 2;
  const trailL = pixClamp01(st.pixTrail || 0), trailN = Math.max(1, Math.round(st.pixTrailN || 6));
  const landStick = Math.round(st.pixLandAs || 0) === 1;
  const breakAt = st.pixBreakAt == null ? 0.62 : Math.max(0, Math.min(0.95, st.pixBreakAt));
  const breakIn = pixClamp01(st.pixBreakIn || 0), from = Math.round(st.pixBreakFrom || 0), soft = pixClamp01(st.pixSoft || 0);
  const lumps = st.pixLumps;
  const drawBlob = (i, cx, cy, vx, vy, r, a, hot, smoky, b, pr, erode, inv, tl) => {
    // stretch: a capsule from the tail to the head along the flight, fat at the head (a joined trail's piece: tl long)
    const sp = Math.hypot(vx, vy), ux = sp ? vx / sp : 0, uy = sp ? vy / sp : 1;
    const pm = shp === PIX_PARTICLE && pixArtHooks.part ? pixArtHooks.part(part, Math.max(2, Math.round(2.2 * r)), Math.max(2, Math.round(2.2 * r * ys)),
      sp > 0 ? pixPartTurn(part, ux, uy) : 0, st) : null;   // §57
    if (shp === PIX_PARTICLE && !pm) return;                  // (no particle hook: an app without VFX's canvas draws none)
    const bmp = shp >= 9 && shp <= 15 ? pixBmpCells(shp === 15 ? pixTextBitmap(st.pixText || "-12") : PIX_BITMAPS[shp]) : null;   // §52 a stamp
    // the TEXT scales by a fixed 7 cells, never its length, so every word and number is one size (and the Godot glyph
    // atlas, one glyph per row, lays out any string as the app draws it: godotTextFiles)
    const S = bmp ? Math.max(1, Math.round(2.2 * r / (shp === 15 ? 7 : Math.max(bmp.w, bmp.h)))) : 0;
    const bx0 = bmp ? Math.round(cx - bmp.w * S / 2) : 0, by0s = bmp ? Math.round(cy - bmp.h * S * ys / 2) : 0;
    const px0 = pm ? Math.round(cx - pm.w / 2) : 0, py0 = pm ? Math.round(cy - pm.h / 2) : 0;
    if (bmp && i === 0 && PIX_STAMP_PROBE) PIX_STAMP_PROBE.cur = { S: S, cx: cx, k: kPx };   // the head is drawn last
    const tail = bmp || pm ? 0 : tl >= 0 ? tl : st.pixStretch * Math.min(r * 5, sp * 0.035);
    const tx = cx - ux * tail, ty = cy - uy * tail;
    const x0 = pm ? px0 : bmp ? bx0 : Math.floor(Math.min(cx, tx) - r - 1), x1 = pm ? px0 + pm.w - 1 : bmp ? bx0 + bmp.w * S - 1 : Math.ceil(Math.max(cx, tx) + r + 1);
    const y0 = pm ? py0 : bmp ? by0s : Math.floor(Math.min(cy, ty) - r - 1), y1 = pm ? py0 + pm.h - 1 : bmp ? by0s + Math.ceil(bmp.h * S * ys) - 1 : Math.ceil(Math.max(cy, ty) + r + 1);
    const baseF = hot > 0 ? (tone + (1 - tone) * hot) * (nR - 2) : tone * (nR - 2), base = Math.round(baseF);
    const yTop = Math.min(cy, ty) - r * ys, yH = Math.max(1, Math.abs(cy - ty) + 2 * r * ys);
    const coinW = shp === 6 ? Math.max(0.14, Math.abs(Math.cos((a * 2.5 + i * 0.37) * Math.PI))) : 1;   // §48: two and a half turns a life
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const px = xx + 0.5, py = yy + 0.5;
      const q = tail > 0 ? Math.max(0, Math.min(1, ((px - tx) * ux + (py - ty) * uy) / tail)) : 1;
      const rr = r * (tail > 0 ? 0.55 + 0.45 * q : 1);
      const dx = (px - (tx + ux * tail * q)) / (rr * coinW), dy = (py - (ty + uy * tail * q)) / (rr * ys);   // §48: a coin turns edge-on and back
      // a lumpy edge, not a balloon: the radius wobbles with noise round the rim
      const ex = Math.abs(dx), ey = Math.abs(dy);
      let m;
      if (pm) m = pm.m[(yy - py0) * pm.w + (xx - px0)];
      else if (bmp) { const cl = bmp.c[Math.min(bmp.h - 1, Math.floor((yy - y0) / (S * ys))) * bmp.w + Math.floor((xx - x0) / S)]; m = cl === 2 ? 0.97 : cl === 1 ? 0.45 : 9; }
      else m = shp === 8 ? pixShapeM(PIX_SHAPE_IN[8], dx, -dy) : shp === 5 ? pixShapeM(PIX_SHAPE_IN[5], dx, -dy) : shp === 7 ? pixShapeM(PIX_SHAPE_IN[7], dx * uy - dy * ux, dx * ux + dy * uy)
              : shp === 6 ? ex * ex + ey * ey : shp === 0 ? ex * ex + ey * ey : shp === 1 ? (ex + ey) * (ex + ey) : shp === 2 ? Math.pow(Math.sqrt(ex) + Math.sqrt(ey), 4)
              : shp === 3 ? Math.max(ex, ey) * Math.max(ex, ey) : Math.pow(Math.max(Math.min(ex, ey) * 3, Math.max(ex, ey)), 2);
      const d2 = bmp || pm ? m : m * (lumps > 0 ? 1 + lumps * (pixNoise(seed, xx, yy, Math.max(1.5, r * 0.45), 470 + i + (loop && i === 0 && st.pixCore > 0 && emit < 3 && i < nB ? tick * 131 : 0)) - 0.5) : 1);
      if (d2 >= 1 || (hollow > 0 && d2 < hollow * hollow)) continue;
      if (erode > 0) {
        if (!from) {
          if (dith ? PIX_BAYER[(xx & 3) + (yy & 3) * 4] / 16 < erode * 1.05
                   : pixNoise(seed, xx, yy + a * R0, Math.max(2, R0 * 0.3), 420 + i) < erode * 1.1 + (d2 - 0.5) * 0.4 * erode) continue;
        } else {
          const rank = from === 1 ? (py - yTop) / yH : from === 2 ? 1 - (py - yTop) / yH : from === 3 ? d2 : from === 4 ? 1 - d2
                     : ((px - tx) * ux + (py - ty) * uy + r) / (tail + 2 * r);
          const pat = dith ? PIX_BAYER[(xx & 3) + (yy & 3) * 4] / 16 : pixNoise(seed, xx, yy + a * R0, Math.max(2, R0 * 0.3), 420 + i);
          const rk = pixClamp01(inv ? 1 - rank : rank);
          if (rk * 0.7 + pat * 0.3 < erode * 1.05) continue;
        }
      }
      // volume: one step lighter toward the light, one darker at the rim (a dithered band between them with Soft steps)
      const bay = soft > 0 ? (PIX_BAYER[(xx & 3) + (yy & 3) * 4] + 0.5) / 16 - 0.5 : 0;
      const hx = (px - cx) / r - lx, hy = (py - cy) / (r * ys) - ly;
      const shade = (light > 0 && hx * hx + hy * hy < light * light * (1 + 1.6 * soft * bay) ? 1 : 0) - (rim > 0 && d2 > 1 - rim * (1 + 1.6 * soft * bay) && (tail <= 0 || q < 0.6) ? 1 : 0);
      const bp = soft > 0 ? Math.floor(baseF + 0.5 + soft * bay) : base;
      if (smoky) put(xx, yy, 1 + Math.max(0, Math.min(2, 1 + shade)), pr);
      else put(xx, yy, RAMP0 + Math.max(0, Math.min(nR - 1, bp + shade)), pr);
    }
  };
  const areaW = Math.max(0, st.pixAreaW == null ? 1 : st.pixAreaW) * Wa, areaH = Math.max(0, st.pixAreaH == null ? 0.1 : st.pixAreaH) * Ha;
  const sway = pixClamp01(st.pixSway || 0);
  const nAll = st.pixBlobs == null || st.pixBlobs > 0 ? nB + nS : 0;   // §49: Blobs off leaves a stroke (and the bits) alone
  for (let i = 0; i < nAll; i++) {
    const isSmoke = i >= nB, r1 = pixRnd(seed, i, 400), r2 = pixRnd(seed, i, 401), r3 = pixRnd(seed, i, 402), r4 = pixRnd(seed, i, 403), r5 = pixRnd(seed, i, 404);
    const pulse = isSmoke ? 0 : i % P;
    const core = !isSmoke && i === 0 && st.pixCore > 0 && emit < 3;
    const f = nB > 1 ? i / (nB - 1) : 0;                      // an arc's blobs in order, tail (0) to head (1)
    // birth: a burst crowds the start, a stream spreads evenly through each pulse; the core is there at once
    // §51 AREA: born anywhere in a box round the origin (Area width x height, shares of the frame), at random times
    // over Emit time, smoke too: weather, dust fields, embers rising off the ground
    const b = core ? 0 : emit === 6 ? span * r1 : emit >= 3 && !isSmoke ? span * f : isSmoke ? span * 0.7 + 0.24 * r1 : pulse * gap + gap * (P > 1 ? 0.7 : 1) * (emit === 1 ? r1 : Math.pow(r1, 1.4));
    // every blob is done by the end of the clip: a late smoke puff squeezes its life rather than being cut off mid-frame
    // (Big Pixel Boom's last frame still held 5112 pixels, so its loop popped; AJ, 2026-11-02)
    const life0 = st.pixLife * (isSmoke ? 0.9 : 1) * (0.85 + 0.3 * r5);
    const life = loop ? Math.max(0.05, Math.min(1, life0)) : Math.max(0.05, Math.min(life0, 0.97 - b));
    const s = loop ? (core ? 0.35 * life : wrap(u - b)) : u - b, a = s / life;
    if (a < 0 || a >= 1) continue;
    let th, d;
    if (emit === 2) { th = th0 + (i / nB) * Math.PI * 2; d = st.pixScatter * R0; }
    else if (emit === 6) { th = th0 + (r2 - 0.5) * spread; d = 0; }   // §51: each flies along Direction, within Spread
    else if (emit === 4 && !isSmoke) { th = th0 + (r2 - 0.5) * spread * 0.15; d = st.pixScatter * R0 * f; }   // a line out along Direction: a muzzle flash, a thrust
    else if (emit === 5 && !isSmoke) { th = th0; d = st.pixScatter * R0 * f; }   // a bolt: along Direction, its walk added below
    else if (emit === 3 && !isSmoke) { th = th0 + (f - 0.5) * spread; d = st.pixScatter * R0 * (1 + 0.08 * (r3 - 0.5)); }   // a sweep: laid along the arc in order
    else { th = th0 + (r2 - 0.5) * spread * (P > 1 ? 1 + 0.6 * pulse / (P - 1) : 1); d = core ? 0 : st.pixScatter * R0 * Math.sqrt(r3); }
    const v = core ? 0 : R0 * st.pixSpeed * (1 - st.pixSpeedVar * r4) * (P > 1 ? 1 - 0.22 * pulse : 1) * (isSmoke ? 0.5 : 1);
    const jag = bolt && !isSmoke ? bolt[i] : 0;
    const x0b = emit === 6 ? ax + (r3 - 0.5) * areaW : ax + Math.cos(th) * d - Math.sin(th0) * jag;
    const y0b = emit === 6 ? ay + (pixRnd(seed, i, 406) - 0.5) * areaH : ay + (Math.sin(th) * d * (emit === 5 ? 1 : 0.85) + Math.cos(th0) * jag) * fl;
    const wC = curl ? curl * (0.7 + 0.6 * pixRnd(seed, i, 405)) : 0;
    // where this blob is at its own time sx (clip time uu, for Spin)
    const posAt = (sx, uu) => {
      const ss = gather ? Math.max(0, life - sx) : sx;
      let [fx, fy, vx, vy] = fly(ss, v, th, drag, wC);
      if (gather) { vx = -vx; vy = -vy; }                     // flying home: the stretch trails the other way
      let cx = x0b + fx, cy = y0b + fy - (isSmoke ? R0 * 0.5 : 0);
      if (sway) cx += sway * R0 * 0.4 * Math.sin((ss / life * 1.5 + r5) * Math.PI * 2);   // §51: a flutter (snow, leaves, ash)
      if (spin) {                                              // turned round the origin in the ground's plane; a rise or a
        const sa = spin * Math.PI * 2 * uu, c = Math.cos(sa), sn = Math.sin(sa), f2 = Math.max(0.05, fl);   // fall stays upright (§46: a twister)
        const up = 0.5 * G * ss * ss - (isSmoke ? R0 * 0.5 : 0), rx = cx - ax, ry = (cy - up - ay) / f2;
        cx = ax + rx * c - ry * sn; cy = ay + up + (rx * sn + ry * c) * f2;
      }
      return [cx, cy, vx, vy];
    };
    let [cx, cy, vx, vy] = posAt(s, u);
    const grow = st.pixGrow > 0 ? 1 - Math.pow(1 - Math.min(1, (a + 0.07) / st.pixGrow), 2) : 1;
    const big = (core ? 1 + 0.15 * st.pixCore : (isSmoke ? 0.6 + 0.3 * r4 : 1 - st.pixSizeVar * r5 * 0.9)) * (emit === 3 && !isSmoke ? 0.35 + 0.65 * f : emit === 4 && !isSmoke ? 1 - 0.65 * f : emit === 5 && !isSmoke ? 1 - 0.35 * f : 1);   // an arc grows to its head, a line thins to its tip
    // Swell above 0 keeps growing late in life; below 0 shrinks to nothing by the end (a glint, a dying spark)
    const sw = st.pixSwell < 0 ? 1 + st.pixSwell * Math.max(0, a - 0.4) / 0.6 : 1 + st.pixSwell * Math.max(0, a - 0.4);
    const r = R0 * st.pixBlob * big * grow * sw;
    if (r < 0.5) continue;
    // heat: starts at pixHeat, cools over pixCool of the blob's life to its Tone; a cooled blob turns to smoke if Smoke > 0
    const coolAt = Math.max(0.02, st.pixCool * (0.85 + 0.3 * r4));
    const hot = isSmoke ? 0 : heat0 * Math.max(0, 1 - a / coolAt);
    const smoky = isSmoke || (smoke > 0 && heat0 > 0 && hot <= 0);
    // landed: a splat that spreads, then stays (or, Land as stick, the blob itself lying on the floor)
    if (cy + r >= floorY && !smoky) {
      const age = (cy + r - floorY) / Math.max(1, vy);        // how long since it reached the floor, near enough
      const lx0 = cx - vx * age;
      if (landStick) { cx = lx0; cy = floorY - r * ys; vx = 0; vy = 0; }
      else {
        const w = r * (1.3 + 1.6 * Math.min(1, age * 9)), h = Math.max(0.8, r * 0.55), base = Math.round(tone * (nR - 2));
        for (let yy = Math.floor(floorY - h); yy <= Math.ceil(floorY); yy++) for (let xx = Math.floor(lx0 - w); xx <= Math.ceil(lx0 + w); xx++) {
          const dx = (xx + 0.5 - lx0) / w, dy = (yy + 0.5 - floorY) / h;
          if (dx * dx + dy * dy < 1) put(xx, yy, RAMP0 + Math.min(nR - 1, base + (dy < -0.45 && dx * lx > 0 ? 0 : dy < -0.45 ? 1 : 0)), 5);
        }
        continue;
      }
    }
    if (cy - r > Ha + 2 || cx < -r * 6 || cx > Wa + r * 6 || cy < -r * 6) continue;
    const erodeOut = st.pixBreak > 0 && a > breakAt ? st.pixBreak * (a - breakAt) / (1 - breakAt) : 0;   // from Break at (0.62) of its life
    const erodeIn = breakIn > 0 && a < breakIn ? 1 - a / breakIn : 0;
    const erode = Math.max(erodeOut, erodeIn);
    const pr = hot > 0 ? 10 + 10 * hot - b : smoky ? -b - a * 0.01 : 1 - b * 0.01;
    // the trail, under the head: with Stretch each piece reaches the next (one streak, curling with the flight), without
    // it the copies stand apart (afterimages)
    if (trailL > 0 && !smoky) {
      const joined = st.pixStretch > 0;
      let nx = cx, ny = cy;
      for (let j = 1; j <= trailN; j++) {
        const sj = s - j * trailL * life / trailN;
        if (sj < 0) break;
        const [qx, qy, qvx, qvy] = posAt(sj, u - (s - sj));
        const fj = j / (trailN + 1), rj = Math.max(joined ? 0.5 : 0, r * (1 - (joined ? 0.6 : 0.45) * fj));
        if (rj >= 0.5 && qy + rj < floorY) {
          if (joined) drawBlob(i, nx, ny, nx - qx, ny - qy, rj, a, hot, smoky, b, pr - 0.05 * j, Math.max(erode, fj * 0.85), false, Math.hypot(nx - qx, ny - qy));
          else drawBlob(i, qx, qy, qvx, qvy, rj, a, hot, smoky, b, pr - 0.05 * j, Math.max(erode, fj * 0.85), false, -1);
        }
        nx = qx; ny = qy;
      }
    }
    drawBlob(i, cx, cy, vx, vy, r, a, hot, smoky, b, pr, erode, erodeIn > erodeOut, -1);
    if (!smoky && hot <= 0 && light > 0 && r >= 2.2) loose.push([Math.round(cx + lx * r * 0.7), Math.round(cy + ly * r * 0.75), RAMP0 + nR - 1]);   // the shine
  }
  // ---- the bits ----
  const nD = Math.round(st.pixBits || 0), bth = Math.min(spread || Math.PI * 2, 160 * PIX_DEG);
  for (let i = 0; i < nD; i++) {                                  // debris: dark chunks on arcs, hot-lit early
    const th = th0 + (pixRnd(seed, i, 430) - 0.5) * bth, v = R0 * st.pixBitSpeed * (1 + pixRnd(seed, i, 431)), s = loop ? wrap(u - pixRnd(seed, i, 433)) : u - 0.02;
    if (s < 0 || s > 0.8) continue;
    const x = Math.round(bx0 + Math.cos(th) * v * s), y = Math.round(by0 + Math.sin(th) * v * s + 0.5 * R0 * st.pixBitGravity * s * s);
    const big = pixRnd(seed, i, 432) < 0.4;
    put(x, y, 0, 30); if (big) { put(x + 1, y, 0, 30); put(x, y + 1, 0, 30); put(x + 1, y + 1, 0, 30); }
    if (s < 0.35 && heat0 > 0) loose.push([x, y, RAMP0 + Math.min(nR - 1, 2)]);
  }
  const nE = Math.round(st.pixSparks || 0), eth = Math.min(Math.PI * 2, spread * 1.6 + 0.6);
  for (let i = 0; i < nE; i++) {                                  // sparks: single pixels that fly, flicker and go out
    const life = 0.12 + 0.4 * pixRnd(seed, i, 440), s = loop ? wrap(u - pixRnd(seed, i, 444)) : u - 0.03 * pixRnd(seed, i, 444);
    if (s < 0 || s > life || (heat0 > 0 && (tick + i) % 3 === 0)) continue;
    const th = th0 + (pixRnd(seed, i, 441) - 0.5) * eth, v = R0 * st.pixSparkSpeed * (0.6 + 0.6 * pixRnd(seed, i, 442));
    const [fx, fy] = fly(s, v, th, 3);
    const hi = heat0 > 0 ? (s < life * 0.5 ? nR - 2 : 1) : Math.round(tone * (nR - 2)) + (s < life * 0.5 ? 1 : 0);
    loose.push([Math.round(bx0 + fx), Math.round(by0 + fy), RAMP0 + Math.max(0, Math.min(nR - 1, hi))]);
  }
  // ---- §55 the fire automaton: heat mapped onto the ramp (the coolest fifth left empty: the flame's edge), under the
  // blobs and strokes; Color cycling, the Wipe, the outline and the wobble then treat it like everything else
  if (st.pixFire > 0) {
    const F = pixFireSim(st, Wa, Ha, ax, ay, NL, loop, seed), fr = F.steps[Math.max(0, Math.min(F.steps.length - 1, tick % Math.max(1, F.steps.length)))];
    if (fr) for (let j = 0; j < F.sy * Wa; j++) {            // above the source rows only (they are the fuel, not the flame)
      const c = fireIndex(fr[j], F.max, nR);                // (crunchyCore fire.js: the coolest fifth empty, then the ramp)
      if (c < 0) continue;
      put(j % Wa, (j / Wa) | 0, RAMP0 + c, 0.3 + fr[j] / F.max);
    }
  }
  // ---- §49 the strokes: hard banded lines in the ramp, a bright core to darker edges, cooling like a blob, breaking up
  // through the same pattern. RING: expands from the origin (Copies: staggered over Emit time). BEAM: shoots out along
  // Direction, holds, thins away (Copies: fanned over Spread; Wobble: its width shivers each art frame). SWOOSH: a smear
  // sweeping round the origin over Spread, fat in its middle (Copies: staggered). RAYS: lines out from the center, Copies
  // round Spread, leaving the center as they go. Size in layer units (as Scatter), Width a share of it.
  const sk = Math.round(st.pixStroke || 0);
  if (sk > 0) {
    const N = Math.max(1, Math.round(st.pixStrokeN || 1)), Ls = Math.max(0.05, st.pixStrokeLife || 0.6);
    const SZ = R0 * (st.pixStrokeSize == null ? 1.2 : st.pixStrokeSize), WD = Math.max(0.6, SZ * (st.pixStrokeW == null ? 0.18 : st.pixStrokeW));
    const wob = pixClamp01(st.pixStrokeWobble || 0), easeO = (x) => 1 - (1 - x) * (1 - x);
    const shade = (o, a, xx, yy) => {                           // o: 0 at the core, 1 at the edge; the pixel's ramp index
      if (st.pixBreak > 0 && a > breakAt) {
        const er = st.pixBreak * (a - breakAt) / (1 - breakAt);
        if ((dith ? PIX_BAYER[(xx & 3) + (yy & 3) * 4] / 16 : pixNoise(seed, xx, yy, 2.5, 490)) < er * 1.05) return -1;
      }
      const hot = heat0 * Math.max(0, 1 - a / Math.max(0.02, st.pixCool));
      const base = Math.round((tone + (1 - tone) * hot) * (nR - 2));
      if (hot > 0.5 && o < 0.3) return RAMP0 + nR - 1;
      return RAMP0 + Math.max(0, Math.min(nR - 1, base + (o < 0.4 ? 1 : 0) - (o > 0.8 ? 1 : 0)));
    };
    // behind the blobs (a CRIT's rays never cross its letters, a muzzle's core sits on its rays), over their smoke (§52)
    const plot = (xx, yy, o, a, hot) => { const c = shade(o, a, xx, yy); if (c >= 0) put(xx, yy, c, 0.5 + 9 * hot); };
    for (let c = 0; c < N; c++) {
      const b = sk === 1 || sk === 3 ? (N > 1 ? span * c / (N - 1) : 0) : 0;
      const s = loop ? wrap(u - b) : u - b, a = loop && Ls >= 0.99 && sk !== 1 ? 0.4 : s / Ls;   // a looped stroke of full life holds steady
      if (a < 0 || a >= 1) continue;
      const hot = heat0 * Math.max(0, 1 - a / Math.max(0.02, st.pixCool));
      if (sk === 1) {                                           // ring
        const rad = SZ * easeO(a), w = Math.max(0.6, WD * Math.pow(1 - a, 0.7)), R = rad + w;
        for (let yy = Math.floor(ay - R * ys) - 1; yy <= Math.ceil(ay + R * ys) + 1; yy++) for (let xx = Math.floor(ax - R) - 1; xx <= Math.ceil(ax + R) + 1; xx++) {
          const d = Math.hypot(xx + 0.5 - ax, (yy + 0.5 - ay) / ys), o = Math.abs(d - rad) / (w / 2);
          if (o < 1) plot(xx, yy, o, a, hot);
        }
      } else if (sk === 2 || sk === 4) {                        // beam (fanned copies) or rays (round the spread)
        const full = sk === 4 && spread >= Math.PI * 2 - 1e-3;
        const th = N > 1 ? th0 + (full ? c / N * Math.PI * 2 : (c / (N - 1) - 0.5) * spread) : th0;
        const ux = Math.cos(th), uy = Math.sin(th) * fl, jit = sk === 4 ? 0.75 + 0.5 * pixRnd(seed, c, 495) : 1;
        const r1 = sk === 2 ? SZ * Math.min(1, a / 0.15) : SZ * jit * easeO(a), r0 = sk === 2 ? 0 : SZ * jit * Math.max(0, (a - 0.3) / 0.7) * 0.9;
        const w0 = sk === 2 ? WD * (a < 0.7 ? 1 : 1 - (a - 0.7) / 0.3) : WD * (1 - a);
        if (w0 < 0.3) continue;
        const ex = ax + ux * r1, ey = ay + uy * r1, sx0 = ax + ux * r0, sy0 = ay + uy * r0, pad = w0 + 2;
        for (let yy = Math.floor(Math.min(sy0, ey) - pad); yy <= Math.ceil(Math.max(sy0, ey) + pad); yy++) for (let xx = Math.floor(Math.min(sx0, ex) - pad); xx <= Math.ceil(Math.max(sx0, ex) + pad); xx++) {
          const px = xx + 0.5 - sx0, py = yy + 0.5 - sy0, L2 = (ex - sx0) * (ex - sx0) + (ey - sy0) * (ey - sy0);
          const q = L2 > 0 ? Math.max(0, Math.min(1, (px * (ex - sx0) + py * (ey - sy0)) / L2)) : 0;
          const dx = px - q * (ex - sx0), dy = py - q * (ey - sy0), along = q * Math.sqrt(L2);
          let w = w0 * (sk === 4 ? 1 - 0.7 * q : 1);              // a ray tapers to its tip
          if (wob > 0) w *= 1 + wob * 0.45 * Math.sin(along * 0.7 + tick * 2.1 + c) * (0.6 + 0.4 * Math.sin(tick * 1.3 + along * 0.23));
          const o = Math.hypot(dx, dy) / Math.max(0.3, w / 2);
          if (o < 1) plot(xx, yy, o, a, hot);
        }
      } else if (sk === 3) {                                    // swoosh
        const sp = spread || Math.PI, start = th0 - sp / 2;
        const head = start + sp * easeO(Math.min(1, a / 0.4)), tail = start + sp * Math.pow(Math.max(0, (a - 0.3) / 0.7), 1.6);   // the head whips round, the tail catches up late: a long smear at its peak
        if (head - tail < 1e-3) continue;
        const rad = SZ * (1 + 0.12 * c), R = rad + WD;
        for (let yy = Math.floor(ay - R) - 1; yy <= Math.ceil(ay + R) + 1; yy++) for (let xx = Math.floor(ax - R) - 1; xx <= Math.ceil(ax + R) + 1; xx++) {
          const px = xx + 0.5 - ax, py = (yy + 0.5 - ay) / ys, d = Math.hypot(px, py);
          let an = Math.atan2(py, px);
          while (an < tail) an += Math.PI * 2;
          while (an > tail + Math.PI * 2) an -= Math.PI * 2;
          if (an > head) continue;
          const f = (an - tail) / (head - tail), thick = WD * Math.sin(Math.PI * Math.min(1, f * 1.15));   // fattest near the head
          if (thick < 0.4) continue;
          const o = Math.abs(d - (rad - thick * 0.25)) / (thick / 2);
          if (o < 1) plot(xx, yy, o, a, hot);
        }
      }
    }
  }
  // ---- §49 color cycling: the layer's colors roll through its own shape, the old palette-rotation trick (waterfalls,
  // portals, runes, shields, lasers). Each ramp pixel takes its step from a pattern value plus the clock, along a
  // triangle wave (dark, light, dark), so the bands roll smoothly; smoke and the outline keep theirs. FLOW: stripes along
  // Direction; RINGS: out from the origin; SPIRAL: rings that turn; SPIN: sectors round the origin; SHIMMER: clumps of
  // noise. Speed is cycles per clip (rounded to whole ones on a Loop, so it repeats), Bands how wide one is, in art px.
  const cyc = Math.round(st.pixCycle || 0);
  if (cyc > 0) {
    const bw = Math.max(1, st.pixCycleBands || 6), sp0 = st.pixCycleSpeed == null ? 1 : st.pixCycleSpeed;
    const spd = loop ? Math.round(sp0) : sp0, ph = u * spd, ca = Math.cos(th0), sa = Math.sin(th0);
    const tri = (x) => { const f = x - Math.floor(x); return f < 0.5 ? f * 2 : 2 - f * 2; };
    for (let y = 0; y < Ha; y++) for (let x = 0; x < Wa; x++) {
      const j = y * Wa + x;
      if (col[j] < RAMP0) continue;
      const dx = x + 0.5 - ax, dy = (y + 0.5 - ay) / ys;
      const v = cyc === 1 ? (dx * ca + dy * sa) / bw : cyc === 2 ? Math.hypot(dx, dy) / bw
              : cyc === 3 ? Math.hypot(dx, dy) / bw + Math.atan2(dy, dx) / (Math.PI * 2) * 2 : cyc === 4 ? Math.atan2(dy, dx) / (Math.PI * 2) * Math.max(1, Math.round(16 / bw) * 2)
              : cyc === 5 ? pixNoise(seed, x, y, Math.max(2, bw * 1.2), 497) * 2.5
              // §56 STREAKS: bands ALONG Direction, every lane across it at its own phase (a waterfall's falling streaks)
              : (dx * ca + dy * sa) / (bw * 5) + pixRnd(seed, Math.floor((-dx * sa + dy * ca) / 2 + 4096), 496) * 3;
      col[j] = RAMP0 + Math.min(nR - 1, Math.floor(tri(v - ph) * nR));
    }
  }
  // ---- §54 THE WIPE: a dissolve front sweeping the WHOLE layer (a disintegrate), not each blob on its own. Every drawn
  // pixel is gone from its time tw: Wipe at + Wipe time x its place along the sweep (over the layer's own box this frame),
  // jittered by the Break up pattern (dither or crumbs). Just ahead of the front it glows (Wipe edge); behind it a share of
  // the pixels taken fly off as Dust for a while, in their own colors, drawn loose (no outline), thinning as they go.
  const wk = Math.round(st.pixWipe || 0);
  if (wk > 0) {
    let bx0 = Wa, by0 = Ha, bx1 = -1, by1 = -1;
    for (let y = 0; y < Ha; y++) for (let x = 0; x < Wa; x++) if (col[y * Wa + x] > 0) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (bx1 >= 0) {
      const at = pixClamp01(st.pixWipeAt == null ? 0.35 : st.pixWipeAt), dur = Math.max(0.05, st.pixWipeTime == null ? 0.5 : st.pixWipeTime);
      const edge = pixClamp01(st.pixWipeEdge == null ? 0.5 : st.pixWipeEdge), dust = pixClamp01(st.pixDust == null ? 0.5 : st.pixDust);
      const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2, hw = Math.max(1, (bx1 - bx0) / 2), hh = Math.max(1, (by1 - by0) / 2);
      const dustLife = 0.3, band = dur * 0.07;
      const dir = wk === 1 ? [1, -0.5] : wk === 2 ? [-1, -0.5] : wk === 3 ? [0.35, -1] : wk === 4 ? [0.35, -1] : null;
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const j = y * Wa + x, c = col[j];
        if (c <= 0) continue;
        const nx = (x - mx) / hw, ny = (y - my) / hh, rad = Math.min(1, Math.hypot(nx, ny) / Math.SQRT2);
        const rank = wk === 1 ? (nx + 1) / 2 : wk === 2 ? (1 - nx) / 2 : wk === 3 ? (ny + 1) / 2 : wk === 4 ? (1 - ny) / 2 : wk === 5 ? rad : 1 - rad;
        const pat = dith ? PIX_BAYER[(x & 3) + (y & 3) * 4] / 16 : pixNoise(seed, x, y, 2.5, 498);
        const tw = at + dur * (rank * 0.82 + pat * 0.18);
        if (u < tw) { if (edge > 0 && tw - u < band && pixRnd(seed, j, 499) < edge) col[j] = RAMP0 + nR - 1; continue; }
        col[j] = -1;
        const age = u - tw;
        if (dust > 0 && age < dustLife && pixRnd(seed, j, 500) < dust * 0.45 && pixRnd(seed, j, 501) > age / dustLife) {
          const d = dir || (wk === 5 ? [nx, ny - 0.4] : [-nx, -ny - 0.4]), go = age * R0 * 7 * (0.6 + 0.8 * pixRnd(seed, j, 502));
          loose.push([Math.round(x + d[0] * go), Math.round(y + d[1] * go * fl), c]);
        }
      }
    }
  }
  // the outline: every empty pixel touching a colored one goes to the outline color (debris already is)
  if (st.pixOutline > 0) {
    const out = new Uint8Array(Wa * Ha);
    for (let y = 0; y < Ha; y++) for (let x = 0; x < Wa; x++) {
      const j = y * Wa + x;
      if (col[j] >= 0) continue;
      if ((x > 0 && col[j - 1] > 0) || (x < Wa - 1 && col[j + 1] > 0) || (y > 0 && col[j - Wa] > 0) || (y < Ha - 1 && col[j + Wa] > 0)) out[j] = 1;
    }
    for (let j = 0; j < out.length; j++) if (out[j]) col[j] = 0;
  }
  // §46. SEE-THROUGH: the layer drawn through a fixed ordered dither (0.5 = a checkerboard), the old way to fake
  // half-transparency (a ghost, a shield, haze), outline and all; sparks and shines stay solid. FLASH FRAMES: the first
  // art frames drawn as one white silhouette inside the outline, as a fighting game marks a hit.
  const see = pixClamp01(st.pixSeeThrough || 0);
  if (see > 0) for (let y = 0; y < Ha; y++) for (let x = 0; x < Wa; x++) if (PIX_BAYER[(x & 3) + (y & 3) * 4] / 16 < see) col[y * Wa + x] = -1;
  for (const [x, y, c] of loose) if (x >= 0 && y >= 0 && x < Wa && y < Ha) col[y * Wa + x] = c;
  const flashN = Math.round(st.pixFlash || 0);
  if (flashN > 0 && tick < flashN) for (let j = 0; j < col.length; j++) if (col[j] > 0) col[j] = RAMP0 + nR - 1;
  // §54 RASTER WOBBLE, last: each row (or column) shifted along a sine wave, the old scanline trick (heat haze, water,
  // a dream). Wobble x 6 art px at its widest, one wave every Wobble wave px, Wobble speed waves per clip (whole on a Loop).
  const wob = pixClamp01(st.pixWobble || 0);
  if (wob > 0) {
    const amp = wob * 6, wave = Math.max(2, st.pixWobbleWave || 12), sp0 = st.pixWobbleSpeed == null ? 1 : st.pixWobbleSpeed;
    const ph = u * (loop ? Math.round(sp0) : sp0), cols2 = Math.round(st.pixWobbleAxis || 0) === 1, src = col.slice();
    col.fill(-1);
    for (let y = 0; y < Ha; y++) for (let x = 0; x < Wa; x++) {
      const sh = Math.round(amp * Math.sin(((cols2 ? x : y) / wave - ph) * Math.PI * 2));
      const sx = cols2 ? x : x - sh, sy = cols2 ? y - sh : y;
      if (sx >= 0 && sy >= 0 && sx < Wa && sy < Ha) col[y * Wa + x] = src[sy * Wa + sx];
    }
  }
  return { col, Wa, Ha, k: kPx, pal, n: nR, ramp0: RAMP0, tick, frames: NL };
}

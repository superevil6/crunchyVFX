"use strict";
// CrunchyVFX — SEAMLESS LOOPING TEXTURES (VFX-DESIGN §66, VFX 1.3's content round). VFX's own file, loaded after vfx.js.
//
// The other kind of output: not a sprite centered in a frame but a MATERIAL TEXTURE, a tile whose left edge continues into
// its right and its top into its bottom (it repeats across a floor or a wall with no seam), and whose last frame flows into
// its first (it plays forever with no jump). An effect with Tile on is drawn on a TORUS:
//
//   SPACE, by folding, never by blending. The effect is drawn on the plane at its own scale (its frame centered on the tile),
//   onto a canvas one tile bigger on every wrapped side, and that canvas is FOLDED onto the tile: every tile-sized block of
//   it drawn onto the tile at the same spot. That is the periodic sum of the drawing, so whatever leaves one edge comes in
//   at the other, exactly, for every engine that draws in the frame's space (particles, strokes, rings, beams, the pixel
//   layer's grid). Particles are also WRAPPED (each drawn at its position modulo the tile), so a drifter never leaves the
//   folded window. Layers that draw over the whole canvas (Bokeh, Droplets, Twinkle, Weather, Flare) are drawn on the tile
//   itself once per neighbor offset (the same sum). The post chain (glow, outline, palette, dither) runs on a 3 x 3 repeat
//   of the folded tile and keeps the middle, so a blur or an outline crossing an edge is the wrapped one. The FIELD layer
//   (below) is periodic by construction (its noise lattices wrap at the tile).
//
//   TIME, by a loop that truly closes. Particles: births wrap (the clip is one period of a steady stream; the particles of
//   the cycles before still flying are drawn too: simulate runs `seamCycles` periods and overlays them), with turbulence
//   made periodic in time. The pixel layer: its own Loop (§44), whole art frames. Weather in a tile: its fall and sway
//   quantized to whole tiles per loop. The Field: whole cycles per loop. EVERY OTHER LAYER (a sigil turning, a beam, a
//   vortex: functions of time that do not repeat) is CROSS-FADED: drawn at t + L and at t and mixed by t / L (frame 0 is
//   the clip at L, the last frame is a step short of it), which closes the loop honestly at the price of a double
//   image mid-way. Which engines close natively and which cross-fade is `seamNative`, and the tests measure both.
//
//   seamPrep(st, opt)            renderPrep's tile twin (vfx.js calls it when st.tile > 0): the tile's size, the frame on it
//   seamFrame(prep, f, echoCv)   one tile frame (vfx.js renderOneFrame calls it)
//   seamCycles(st)               how many periods simulate overlays (vfx.js simulate)
//   seamTimeNoise(...)           turbulence noise periodic in time (vfx.js simulate)
//   drawField(g, st, t, sim)     THE FIELD layer: a seamless moving pattern (plasma, caustics, lava crust, static, hexes, runes)
//   seamMeasure(frames)          the seam and loop numbers the tests and the README quote
//   seamSheetLayout(n)           the flipbook's columns x rows
//
// No document access outside functions (canvases are made the way vfx.js makes them).

var SEAM_BUILD = 1;
// APPEND-ONLY (the index is stored in links and saved effects)
var SEAM_SIZES = ["Frame size", "32", "64", "128", "256"];
var SEAM_AXES = ["Both ways", "Across only", "Up and down only"];
var FIELD_KINDS = ["plasma", "caustics", "crust", "static", "hexes", "runes"];
// what each Field kind is, in a line (the panel's hint and the layer strip's tooltip read it)
var FIELD_SAY = {
  plasma: "rolling bands of color, the old demo plasma: energy, magic, a lava lamp",
  caustics: "the bright net of light under water",
  crust: "plates of cooled crust with glowing cracks: lava, a cracked magic floor",
  static: "thin crawling sparks: electricity, a broken screen",
  hexes: "a hex grid with a pulse running through it: a force field, a shield wall",
  runes: "rows of glyphs that light up in a wave: a rune wall, crawling magic text",
};
// the layers that draw over the whole canvas rather than in the frame's space (drawn once per neighbor offset in a tile)
// (Fluid, §64: its grid is sized by the canvas it is given, so it is drawn at the tile's size; its edges are OPEN, not
// toroidal, so smoke that reaches an edge is cut there rather than wrapped: a fluid tile is seamless only where it stays
// inside. Making fluid.js's grid toroidal is a change to its boundary step, not made here.)
var SEAM_CANVAS_LAYERS = ["Bokeh", "Droplets", "Twinkle", "Weather", "Flare", "Fluid"];

function seamOn(st) { return !!st && +st.tile > 0; }
// the loop's length in seconds: Loop length, or the clip's Duration when it is 0
function seamLoopLen(st) { return +st.tileLoop > 0 ? +st.tileLoop : +st.duration; }
function seamTileDims(st) {
  const s = Math.round(+st.tileSize || 0);
  if (s > 0 && s < SEAM_SIZES.length) { const n = +SEAM_SIZES[s]; return { w: n, h: n }; }
  return frameDims(st);
}
function seamAxes(st) { const a = Math.round(+st.tileAxes || 0); return { x: a !== 2, y: a !== 1 }; }
// what closes its loop by itself in a tile (the rest is cross-faded): particles (births wrap), the Field, Weather (quantized),
// the pixel layer when its own Loop is on, and the Fluid when its own Loop is on
function seamNative(name, st) {
  return name === "particles" || name === "Field" || name === "Weather" || name === "Impact" || (name === "Pixel art" && st.pix > 0 && st.pixLoop > 0) ||
    (name === "Fluid" && st.fluid > 0 && st.fluidLoop > 0);   // §64's Loop closes on its own (warmed up, its tail cross-faded into its head on the fields)
}

// HOW MANY PERIODS simulate overlays for births to wrap: enough that nothing born in the first is still alive after the last
// (the latest birth + the longest life, children and Layer B included, over the period, plus the one being shown)
function seamCycles(st) {
  const fps = Math.max(1, Math.round(st.fps)), dur = +st.duration;
  const N = Math.max(1, Math.min(MAX_FRAMES, Math.round(dur * fps))), T = N / fps;
  const lv = (v, k) => (+v || 0) * (1 + Math.abs(+k || 0));
  const shots = Math.max(1, Math.round(st.shots));
  const delays = parseLayerDelays(st.layerDelay);
  let maxDelay = 0;
  for (const k in delays) maxDelay = Math.max(maxDelay, +delays[k] || 0);
  const born = (shots - 1) * (+st.shotDelay || 0) + (+st.emitDelay || 0) + (+st.emitTime || 0) * dur;
  let life = lv(st.life, st.lifeVar);
  if (+st.subCount > 0) life += lv(st.subLife, st.lifeVar);
  let span = born + life;
  if (+st.emit2Count > 0) span = Math.max(span, (+st.emit2Delay || 0) + (+st.emit2Over || 0) * dur + lv(st.emit2Life, st.emit2LifeVar));
  if (+st.flash > 0) span = Math.max(span, (shots - 1) * (+st.shotDelay || 0) + maxDelay + (+st.flashLife || 0));
  if (+st.wave > 0) span = Math.max(span, (shots - 1) * (+st.shotDelay || 0) + maxDelay + (+st.waveLife || 0));
  return Math.max(2, Math.min(16, 1 + Math.ceil(span / T - 1e-9)));
}
// value noise periodic in its third axis with period P (turbulence's time in a tile): the field at s and at s - P, mixed by
// s / P, so it is continuous and repeats every P. P = 0: time stands still.
function seamTimeNoise(seed, x, y, z, P) {
  if (!(P > 0)) return vnoise(seed, x, y, 0);
  const s = ((z % P) + P) % P, w = s / P;
  return (1 - w) * vnoise(seed, x, y, s) + w * vnoise(seed, x, y, s - P);
}
// fold the frames of `cyc` periods (nSim = n x cyc snapshots) into n: each loop frame is every period's frame at that phase
function seamFoldFrames(frames, counts, n, cyc) {
  const out = new Array(n), cnt = new Int32Array(n);
  for (let f = 0; f < n; f++) {
    let len = 0;
    for (let m = 0; m < cyc; m++) len += frames[f + m * n].length;
    const a = new Float32Array(len);
    let at = 0, c = 0;
    for (let m = 0; m < cyc; m++) { a.set(frames[f + m * n], at); at += frames[f + m * n].length; c += counts[f + m * n]; }
    out[f] = a; cnt[f] = c;
  }
  return { frames: out, counts: cnt };
}

// renderPrep for a tile. The OUTPUT is the tile (or the size asked for: a thumbnail, an export scale, scaled alike); the
// effect is drawn at its own frame's scale with its frame centered on the tile, Fit never applies (a texture is the size it
// is drawn at). prep.dx/dy are in TILE pixels like renderPrep's; the big canvas adds `mx` tiles round it.
function seamPrep(st, opt) {
  opt = opt || {};
  const stE = +st.tileLoop > 0 ? Object.assign({}, st, { duration: seamLoopLen(st) }) : st;
  const sim = opt.sim || simulate(stE);
  const T = seamTileDims(stE), F = frameDims(stE);
  let ow = T.w, oh = T.h;
  if (opt.w || opt.h) { ow = Math.max(8, Math.round(opt.w || opt.h)); oh = Math.max(8, Math.round(opt.h || opt.w)); }
  else if (opt.size) { ow = oh = Math.max(8, Math.round(opt.size)); }
  const sg = Math.min(ow / T.w, oh / T.h), Fw = F.w * sg, Fh = F.h * sg;
  const ref = frameRefPx(Fw, Fh), k = (ref / sim.fs) * stE.scale;
  const ax = seamAxes(stE);
  const mx = ax.x ? 1 + Math.ceil(Math.max(0, Fw - ow) / (2 * ow)) : 0, my = ax.y ? 1 + Math.ceil(Math.max(0, Fh - oh) / (2 * oh)) : 0;
  const fx = (ow - Fw) / 2, fy = (oh - Fh) / 2;
  const dx = fx + stE.originX * Fw - stE.originX * sim.fs * k, dy = fy + stE.originY * Fh - stE.originY * sim.fs * k;
  return { st: stE, sim: sim, outW: ow, outH: oh, ref: ref, k: k, dx: dx, dy: dy, n: sim.nFrames,
           tile: { ax: ax, mx: mx, my: my, BW: ow * (1 + 2 * mx), BH: oh * (1 + 2 * my), fx: fx, fy: fy, Fw: Fw, Fh: Fh } };
}

function seamCanvas(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return cv;
}
// every tile-sized block of the big canvas onto the tile, at the same spot (the periodic sum), with the layer's own blend
function seamFold(big, P, W, H, op) {
  const out = seamCanvas(W, H), g = out.getContext("2d");
  g.globalCompositeOperation = op;
  for (let by = 0; by <= 2 * P.my; by++) for (let bx = 0; bx <= 2 * P.mx; bx++) g.drawImage(big, -bx * W, -by * H);
  g.globalCompositeOperation = "source-over";
  return out;
}
// two tile canvases mixed per pixel, premultiplied: (1 - w) a + w b
function seamMix(a, b, w) {
  const W = a.width, H = a.height, ga = a.getContext("2d"), gb = b.getContext("2d");
  const A = ga.getImageData(0, 0, W, H), B = gb.getImageData(0, 0, W, H), da = A.data, db = B.data;
  let any = false;
  for (let i = 0; i < da.length; i += 4) {
    const aa = da[i + 3] * (1 - w), ab = db[i + 3] * w, al = aa + ab;
    if (al <= 0) { da[i] = da[i + 1] = da[i + 2] = da[i + 3] = 0; continue; }
    any = true;
    da[i] = (da[i] * aa + db[i] * ab) / al;
    da[i + 1] = (da[i + 1] * aa + db[i + 1] * ab) / al;
    da[i + 2] = (da[i + 2] * aa + db[i + 2] * ab) / al;
    da[i + 3] = al;
  }
  if (!any) return null;
  ga.putImageData(A, 0, 0);
  return a;
}
function seamEmpty(cv) {
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
  return true;
}
// the pixel layer on the big canvas: its rows rescaled so its art pixels, its size and its origin are exactly what they are
// on the frame (pixArtFrame sizes itself from the canvas it is given)
function seamPixState(st, P) {
  const mn = Math.min(P.Fw, P.Fh), MN = Math.min(P.BW, P.BH), r = MN / mn;
  const X0 = P.mx * (P.BW / (1 + 2 * P.mx)) + P.fx, Y0 = P.my * (P.BH / (1 + 2 * P.my)) + P.fy;
  return Object.assign({}, st, {
    pixDetail: st.pixDetail * r, pixSize: st.pixSize / r,
    originX: (X0 + st.originX * P.Fw) / P.BW, originY: (Y0 + st.originY * P.Fh) / P.BH,
    pixAreaW: (st.pixAreaW == null ? 1 : st.pixAreaW) * P.Fw / P.BW, pixAreaH: (st.pixAreaH == null ? 0.1 : st.pixAreaH) * P.Fh / P.BH,
    pixFloor: (+st.pixFloor || 0) * P.Fh / P.BH,
    pixFireW: (st.pixFireW == null ? 0.4 : st.pixFireW) * P.Fw / P.BW, pixFireH: (st.pixFireH == null ? 0.6 : st.pixFireH) * P.Fh / P.BH,
  });
}
function seamBlendOp(st) { return st.blend === 1 ? "source-over" : (st.blend === 2 ? "screen" : "lighter"); }

// ONE TILE FRAME: the Field, the whole-canvas layers, the frame-space layers (cross-faded where they do not loop by
// themselves), the pixel layer, the particles, each folded onto the tile; then the post chain on the wrapped tile.
let seamPostRef = 0;          // vfx.js postProcess's frame reference while it runs on a 3 x 3 repeat (postRefPx)
function seamFrame(prep, f, echoCv) {
  const st = prep.st, sim = prep.sim, P = prep.tile, W = prep.outW, H = prep.outH, N = prep.n, L = N / sim.fps;
  const out = seamCanvas(W, H), g = out.getContext("2d");
  if (st.echo > 0 && echoCv) { g.globalAlpha = st.echo * st.echoDecay; g.drawImage(echoCv, 0, 0); g.globalAlpha = 1; }
  const delays = parseLayerDelays(st.layerDelay), t = f / sim.fps;
  if (st.field > 0 && t >= (delays.Field || 0)) drawField(g, st, t - (delays.Field || 0), sim);
  const ref = prep.ref, shake = st.shake > 0 ? st.shake * ref * 0.06 : 0;
  const sx = shake ? rndS(Math.round(st.seed) + 991, f, 31) * shake : 0, sy = shake ? rndS(Math.round(st.seed) + 991, f, 32) * shake : 0;
  const op = seamBlendOp(st), canvasSet = new Set(SEAM_CANVAS_LAYERS);
  const seam = { W: W, H: H, T: L };
  // a pass: drawFrame with only some of its parts, at frame f (+ fAdd frames: the cross-fade's second clock)
  const big = (only, fAdd, extra) => {
    const cv = seamCanvas(P.BW, P.BH), xf = Object.assign({ k: prep.k, dx: prep.dx + P.mx * W + sx, dy: prep.dy + P.my * H + sy,
      only: only, fAdd: fAdd, seam: seam }, extra || {});
    drawFrame(sim, f, cv.getContext("2d"), st, xf);
    return cv;
  };
  const onTile = (only, fAdd) => {        // the whole-canvas layers: on the tile, once per neighbor offset
    const cv = seamCanvas(W, H), gg = cv.getContext("2d");
    for (let j = -P.my; j <= P.my; j++) for (let i = -P.mx; i <= P.mx; i++) {
      gg.setTransform(1, 0, 0, 1, i * W, j * H);
      drawFrame(sim, f, gg, st, { k: prep.k, dx: prep.dx + sx, dy: prep.dy + sy, only: only, fAdd: fAdd, seam: seam });
    }
    gg.setTransform(1, 0, 0, 1, 0, 0);
    return cv;
  };
  const fade = (make) => {                 // (1 - w) x the clip at t + L, w x the clip at t: closes at w = 1
    const a = make(N), b = make(0);
    if (seamEmpty(a) && seamEmpty(b)) return null;
    return seamMix(a, b, f / N);
  };
  const put = (cv, o) => { if (cv) { g.globalCompositeOperation = o; g.drawImage(cv, 0, 0); g.globalCompositeOperation = "source-over"; } };
  const nat = (n) => seamNative(n, st);
  // 1. the whole-canvas layers (those that loop natively, then the cross-faded rest)
  put(onTile((n) => canvasSet.has(n) && nat(n), 0), op);
  put(fade((fa) => onTile((n) => canvasSet.has(n) && !nat(n), fa)), op);
  // 2. the frame-space layers that do not loop by themselves, the pixel layer among them when its Loop is off
  const frameLayer = (n) => !canvasSet.has(n) && n !== "particles" && n !== "Field" && n !== "Impact" && !nat(n);
  put(fade((fa) => seamFold(big(frameLayer, fa, n0PixSt(st, P)), P, W, H, op)), op);
  // 3. the pixel layer, looping by itself (source-over: smoke is dark, never added)
  if (nat("Pixel art") && st.pix > 0) put(seamFold(big((n) => n === "Pixel art", 0, { pixSt: seamPixState(st, P) }), P, W, H, "source-over"), "source-over");
  // 4. the particles, each wrapped into the middle tile, then folded
  put(seamFold(big((n) => n === "particles", 0, { wrap: { x0: P.ax.x ? P.mx * W : null, y0: P.ax.y ? P.my * H : null, w: W, h: H } }), P, W, H, op), op);
  // 5. the impact flash, over what is there (a per-pixel pass, periodic as it is)
  drawFrame(sim, f, g, st, { k: prep.k, dx: prep.dx, dy: prep.dy, only: (n) => n === "Impact", fAdd: 0, seam: seam });
  return seamPost(out, st, t, P, W, H);
}
// the pixel layer's rescaled rows ride along with the frame-space pass (when it is cross-faded) and only matter to it
function n0PixSt(st, P) { return st.pix > 0 ? { pixSt: seamPixState(st, P) } : null; }
// THE POST CHAIN ON THE TORUS: run on a 3 x 3 repeat of the tile (1 x 3 or 3 x 1 when one way only), keep the middle
function seamPost(cv, st, t, P, W, H) {
  const rx = P.ax.x ? 1 : 0, ry = P.ax.y ? 1 : 0;
  const R = seamCanvas(W * (1 + 2 * rx), H * (1 + 2 * ry)), gr = R.getContext("2d");
  for (let j = 0; j <= 2 * ry; j++) for (let i = 0; i <= 2 * rx; i++) gr.drawImage(cv, i * W, j * H);
  seamPostRef = frameRefPx(P.Fw, P.Fh);
  try { postProcess(R, st, null, t); } finally { seamPostRef = 0; }
  const out = seamCanvas(W, H);
  out.getContext("2d").drawImage(R, -rx * W, -ry * H);
  releaseCanvas(R);
  return out;
}

// ---------- THE FIELD: a seamless moving pattern ----------
// Drawn per pixel (or per Pixel size block) from value noise on lattices that WRAP at the canvas (the tile, or the frame),
// so it tiles by construction; time is a phase round the loop (whole cycles: Changes), and Drift scrolls whole tiles per
// loop, so it loops by construction too. Colors: the effect's ramp when it has one, else its hue / saturation / brightness
// from dark to a white-hot core (Core white), in Color steps (ordered dither between them) for pixel art.
const seamLatMemo = new Map();
function seamLattice(seed, px, py, pz, salt) {
  const key = seed + "," + px + "," + py + "," + pz + "," + salt;
  let L = seamLatMemo.get(key);
  if (L) return L;
  const a = new Float32Array(px * py * pz);
  for (let i = 0; i < a.length; i++) a[i] = rnd(seed, i, salt) * 2 - 1;
  L = { px: px, py: py, pz: pz, a: a };
  if (seamLatMemo.size > 64) seamLatMemo.clear();
  seamLatMemo.set(key, L);
  return L;
}
// trilinear value noise on a wrapped lattice: x in [0, px), y in [0, py), z in [0, pz) repeat; -1..1
function seamN3(L, x, y, z) {
  const px = L.px, py = L.py, pz = L.pz, a = L.a;
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, z0 = ((zi % pz) + pz) % pz;
  const x1 = x0 + 1 === px ? 0 : x0 + 1, y1 = y0 + 1 === py ? 0 : y0 + 1, z1 = z0 + 1 === pz ? 0 : z0 + 1;
  const r00 = (z0 * py + y0) * px, r10 = (z0 * py + y1) * px, r01 = (z1 * py + y0) * px, r11 = (z1 * py + y1) * px;
  const c00 = a[r00 + x0] + (a[r00 + x1] - a[r00 + x0]) * fx, c10 = a[r10 + x0] + (a[r10 + x1] - a[r10 + x0]) * fx;
  const c01 = a[r01 + x0] + (a[r01 + x1] - a[r01 + x0]) * fx, c11 = a[r11 + x0] + (a[r11 + x1] - a[r11 + x0]) * fx;
  const d0 = c00 + (c10 - c00) * fy, d1 = c01 + (c11 - c01) * fy;
  return d0 + (d1 - d0) * fz;
}
// a few octaves, each lattice twice as fine (still whole periods across the tile), the same time lattice
function seamFbm(Ls, x, y, z) {
  let s = 0, amp = 1, norm = 0, m = 1;
  for (let o = 0; o < Ls.length; o++) { s += amp * seamN3(Ls[o], x * m, y * m, z); norm += amp; amp *= 0.5; m *= 2; }
  return s / norm;
}
const seamSmooth = (e0, e1, x) => { const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0); return t * t * (3 - 2 * t); };
const seamFrac = (x) => x - Math.floor(x);
function seamHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s = clamp01(s); l = clamp01(l);
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (t) => { t = seamFrac(t); return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(ch(h + 1 / 3) * 255), Math.round(ch(h) * 255), Math.round(ch(h - 1 / 3) * 255)];
}
// the colors, value 0..1 -> [r, g, b, a] (256 entries)
function seamFieldLut(st) {
  const lut = new Uint8ClampedArray(256 * 4), ramp = parseRamp(st.ramp), fill = clamp01(st.fieldFill == null ? 1 : st.fieldFill);
  const op = clamp01(st.field);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let rgb, a;
    if (ramp) {
      const c = sampleRamp(ramp, v);
      rgb = seamHsl(c.h, c.s, clamp01(c.l * st.bright)); a = c.a;
    } else {
      const w = clamp01(+st.coreWhite || 0) * seamSmooth(0.72, 1, v);
      const l0 = clamp01(st.bright * (0.06 + 0.86 * v));
      rgb = seamHsl(st.hue + (+st.hueLife || 0) * v, st.sat * (1 - 0.85 * w), l0 + (0.97 - l0) * w); a = 1;
    }
    lut[i * 4] = rgb[0]; lut[i * 4 + 1] = rgb[1]; lut[i * 4 + 2] = rgb[2];
    lut[i * 4 + 3] = Math.round(255 * op * a * (fill + (1 - fill) * Math.pow(v, 0.85)));
  }
  return lut;
}
const SEAM_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SEAM_SQ3 = Math.sqrt(3);
// periodic Worley noise: a jittered point per cell of an S x Sy grid that wraps, each circling (radius r) whole turns per loop;
// the nearest two distances from (x, y) (in cells)
function seamWorley(x, y, S, Sy, seed, salt, ph, sp, r) {
  const ci = Math.floor(x), cj = Math.floor(y), TAU = Math.PI * 2;
  let f1 = 9, f2 = 9;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const cx = ci + di, cy = cj + dj, id = (((cy % Sy) + Sy) % Sy) * S + (((cx % S) + S) % S);
    const a = TAU * (ph * sp + rnd(seed, id, salt));
    const qx = cx + rnd(seed, id, salt + 1) + r * Math.cos(a), qy = cy + rnd(seed, id, salt + 2) + r * Math.sin(a);   // anywhere in its cell: a jitter short of that lines the cracks up on the cell grid
    const d = Math.hypot(qx - x, qy - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}
// the pattern at (u, v) in the tile (0..1), phase ph (0..1 round the loop): 0..1
function seamFieldFn(st, W, H, seed, N) {
  const kind = FIELD_KINDS[Math.max(0, Math.min(FIELD_KINDS.length - 1, Math.round(+st.fieldKind || 0)))];
  const S = Math.max(1, Math.round(+st.fieldScale || 4)), Sy = Math.max(1, Math.round(S * H / W));
  const sp = Math.max(0, Math.round(+st.fieldSpeed || 0)), pz = sp > 0 ? Math.max(2, 2 * sp) : 1;   // the time lattice: 2 slices a cycle (1 would be one slice: no change)
  const warp = clamp01(st.fieldWarp == null ? 0.4 : st.fieldWarp), sharp = clamp01(st.fieldSharp == null ? 0.5 : st.fieldSharp);
  const TAU = Math.PI * 2;
  const lat = (sx, sy, salt, oct) => { const Ls = []; for (let o = 0; o < oct; o++) Ls.push(seamLattice(seed, sx << o, sy << o, pz, salt)); return Ls; };
  if (kind === "plasma") {
    const Lw = lat(S, Sy, 171, 2);
    return (u, v, ph) => {
      const z = ph * pz, n = seamFbm(Lw, u * S, v * Sy, z) * warp * 5, p = ph * sp * TAU;
      const s = Math.sin(TAU * u * S + n * 3 + p) + Math.sin(TAU * v * Sy - n * 2 - p) +
                Math.sin(TAU * (u * S + v * Sy) + n + 2 * p) + Math.sin(TAU * (u * S - v * Sy) * 0.5 * 2 + n * 1.5 - p);
      return 0.5 + 0.5 * Math.sin(s * (0.9 + 1.6 * sharp) + p);
    };
  }
  if (kind === "caustics") {
    // the bright net under water: the borders of drifting cells (Worley F2 - F1), warped so they wobble, a finer net over it
    const Lw = lat(S, Sy, 172, 2), Lw2 = lat(S, Sy, 173, 2), w1 = 0.05 + 0.25 * (1 - sharp);
    return (u, v, ph) => {
      const z = ph * pz, x = u * S, y = v * Sy;
      const qx = x + warp * 0.55 * seamFbm(Lw, x, y, z), qy = y + warp * 0.55 * seamFbm(Lw2, x, y, z);
      const A = seamWorley(qx, qy, S, Sy, seed, 190, ph, sp, 0.22), B = seamWorley(qx * 2, qy * 2, S * 2, Sy * 2, seed, 194, ph, sp, 0.3);
      const c1 = Math.exp(-(A[1] - A[0]) / w1), c2 = Math.exp(-(B[1] - B[0]) / (w1 * 0.8));
      return clamp01(0.06 + 0.9 * c1 * c1 + 0.35 * c2 * c2 + 0.12 * (1 - Math.min(1, A[0])));
    };
  }
  if (kind === "crust") {
    const Ln = lat(S * 2, Sy * 2, 176, 2), Lp = lat(S, Sy, 177, 1), cw = 0.025 + 0.13 * (1 - sharp);
    return (u, v, ph) => {
      const x = u * S, y = v * Sy, F = seamWorley(x, y, S, Sy, seed, 178, ph, sp, warp * 0.2), f1 = F[0], e = F[1] - F[0], z = ph * pz;
      const pulse = 0.72 + 0.28 * seamN3(Lp[0], x, y, z);
      const crack = 1 - seamSmooth(0, cw, e), halo = 1 - seamSmooth(0, cw * 4.5, e);
      const plate = (0.1 + 0.11 * (0.5 + 0.5 * seamFbm(Ln, x * 2, y * 2, z))) * (1 - 0.45 * Math.min(1, f1));
      return clamp01(Math.max(plate, crack * pulse, halo * 0.5 * pulse));
    };
  }
  if (kind === "static") {
    const L1 = lat(S, Sy, 181, 3), L2 = lat(S, Sy, 182, 3), w = 0.03 + 0.12 * (1 - sharp);
    return (u, v, ph, bx, by) => {
      const z = ph * pz, x = u * S, y = v * Sy;
      const a = 1 - Math.abs(seamFbm(L1, x, y, z)), b = 1 - Math.abs(seamFbm(L2, x + 0.37, y + 0.71, z));
      const fi = Math.round(ph * N) % Math.max(1, N);
      const spark = rnd(seed + fi * 7919, by * 4099 + bx, 183) < 0.0012 * (0.5 + warp) ? 1 : 0;
      return clamp01(Math.max(seamSmooth(1 - w, 1, a), seamSmooth(1 - w * 0.6, 1, b) * 0.6, spark));
    };
  }
  if (kind === "hexes") {
    const M = Math.max(1, Math.round(S * (H / W) / SEAM_SQ3)), lw = 0.025 + 0.09 * (1 - sharp);
    return (u, v, ph) => {
      const qx = u * S, qy = v * M * SEAM_SQ3;
      const ax = seamFrac(qx) - 0.5, ay = (((qy % SEAM_SQ3) + SEAM_SQ3) % SEAM_SQ3) - SEAM_SQ3 / 2;
      const bx = seamFrac(qx - 0.5) - 0.5, by = ((((qy - SEAM_SQ3 / 2) % SEAM_SQ3) + SEAM_SQ3) % SEAM_SQ3) - SEAM_SQ3 / 2;
      const useA = ax * ax + ay * ay < bx * bx + by * by, gx = useA ? ax : bx, gy = useA ? ay : by;
      const hd = Math.max(Math.abs(gx), Math.abs(gx) * 0.5 + Math.abs(gy) * SEAM_SQ3 / 2);
      const edge = 0.5 - hd, cx = Math.round((qx - gx) * 2), cy = Math.round((qy - gy) * 2 / SEAM_SQ3);
      const id = (((cy % (2 * M)) + 2 * M) % (2 * M)) * 2 * S + (((cx % (2 * S)) + 2 * S) % (2 * S));
      const wave = 0.5 + 0.5 * Math.sin(TAU * (u + v - ph * sp));
      const flick = 0.5 + 0.5 * Math.sin(TAU * (ph * sp + rnd(seed, id, 184)));
      const line = 1 - seamSmooth(0, lw, edge);
      return clamp01(line * (0.4 + 0.6 * wave) + (1 - seamSmooth(0, 0.5, edge)) * 0.16 * (0.3 + 0.7 * flick) * (0.5 + warp) + seamSmooth(0.75, 1, wave) * 0.12);
    };
  }
  // runes: S x Sy cells, each an 8 x 8 grid holding a 5 x 5 glyph (mirrored, hashed per cell); a wave runs up the rows
  const dens = 0.35 + 0.6 * warp;
  return (u, v, ph) => {
    const x = u * S, y = v * Sy, ci = ((Math.floor(x) % S) + S) % S, cj = ((Math.floor(y) % Sy) + Sy) % Sy, id = cj * S + ci;
    if (rnd(seed, id, 185) > dens) return 0;
    const gx = Math.floor(seamFrac(x) * 8) - 1, gy = Math.floor(seamFrac(y) * 8) - 1;
    if (gx < 0 || gy < 0 || gx > 4 || gy > 4) return 0;
    const mx = gx > 2 ? 4 - gx : gx;
    const on = mx === 2 ? rnd(seed, id * 25 + gy, 186) < 0.7 : rnd(seed, id * 25 + gy * 3 + mx, 187) < 0.5;
    if (!on) return 0;
    const b = 0.5 + 0.5 * Math.sin(TAU * (ph * Math.max(1, sp) + v + rnd(seed, ci, 188)));
    return clamp01(0.28 + 0.72 * Math.pow(b, 1.6 + 2 * sharp));
  };
}
function drawField(g, st, t, sim) {
  if (!(st.field > 0)) return;
  const W = g.canvas.width, H = g.canvas.height, N = Math.max(1, sim.nFrames), Lp = N / sim.fps;
  const ph = seamFrac(t / Lp), seed = Math.max(1, Math.round(st.seed)) | 0;
  const pix = Math.max(1, Math.round(+st.fieldPixel || 1));
  const steps = Math.round(+st.fieldSteps || 0), dith = clamp01(+st.fieldDither || 0);
  const dxT = Math.round(+st.fieldDriftX || 0), dyT = Math.round(+st.fieldDriftY || 0);
  const fn = seamFieldFn(st, W, H, seed, N), lut = seamFieldLut(st);
  const cv = seamCanvas(W, H), gg = cv.getContext("2d"), img = gg.createImageData(W, H), d = img.data;
  const bw = Math.ceil(W / pix), bh = Math.ceil(H / pix);
  for (let by = 0; by < bh; by++) {
    const v = seamFrac(((by * pix + pix / 2) / H) - dyT * ph);
    for (let bx = 0; bx < bw; bx++) {
      const u = seamFrac(((bx * pix + pix / 2) / W) - dxT * ph);
      let val = fn(u, v, ph, bx, by);
      if (steps >= 2) {
        const q = val * (steps - 1) + (dith > 0 ? (SEAM_BAYER[(by & 3) * 4 + (bx & 3)] / 16 - 0.47) * dith : 0);
        val = clamp01(Math.round(q) / (steps - 1));
      }
      const li = Math.round(clamp01(val) * 255) * 4;
      if (!lut[li + 3]) continue;
      for (let yy = by * pix, y1 = Math.min(H, yy + pix); yy < y1; yy++) for (let xx = bx * pix, x1 = Math.min(W, xx + pix); xx < x1; xx++) {
        const o = (yy * W + xx) * 4;
        d[o] = lut[li]; d[o + 1] = lut[li + 1]; d[o + 2] = lut[li + 2]; d[o + 3] = lut[li + 3];
      }
    }
  }
  gg.putImageData(img, 0, 0);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.drawImage(cv, 0, 0);
  g.restore();
  releaseCanvas(cv);
}

// ---------- the numbers: is it seamless, does it loop ----------
// frames: [{ w, h, data }] (RGBA). For each frame, the mean channel difference ACROSS each seam (the last column against the
// first, the last row against the first: neighbors once tiled) next to the mean difference between ordinary neighbors
// inside the tile; and the difference from the last frame to the first next to the mean frame-to-frame step.
//   { seamX, stepX, seamY, stepY, worstX, worstY (the frame with the highest seam / step ratio), loop, step, frames }
function seamMeasure(frames) {
  let seamX = 0, stepX = 0, seamY = 0, stepY = 0, worstX = 0, worstY = 0, step = 0;
  const n = frames.length;
  for (const F of frames) {
    const w = F.w, h = F.h, d = F.data;
    let sx = 0, ix = 0, sy = 0, iy = 0;
    for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) sx += Math.abs(d[(y * w + w - 1) * 4 + c] - d[(y * w) * 4 + c]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) for (let c = 0; c < 4; c++) ix += Math.abs(d[(y * w + x + 1) * 4 + c] - d[(y * w + x) * 4 + c]);
    for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) sy += Math.abs(d[((h - 1) * w + x) * 4 + c] - d[x * 4 + c]);
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) iy += Math.abs(d[((y + 1) * w + x) * 4 + c] - d[(y * w + x) * 4 + c]);
    sx /= h * 4; ix /= h * (w - 1) * 4; sy /= w * 4; iy /= (h - 1) * w * 4;
    seamX += sx; stepX += ix; seamY += sy; stepY += iy;
    worstX = Math.max(worstX, sx / Math.max(1e-6, ix)); worstY = Math.max(worstY, sy / Math.max(1e-6, iy));
  }
  const diff = (A, B) => { let s = 0; for (let i = 0; i < A.data.length; i++) s += Math.abs(A.data[i] - B.data[i]); return s / A.data.length; };
  for (let f = 0; f + 1 < n; f++) step += diff(frames[f], frames[f + 1]);
  return { seamX: seamX / n, stepX: stepX / n, seamY: seamY / n, stepY: stepY / n, worstX: worstX, worstY: worstY,
           loop: n > 1 ? diff(frames[n - 1], frames[0]) : 0, step: n > 2 ? step / (n - 1) : 0, frames: n };
}
// the flipbook's grid: as square as it gets, columns first
function seamSheetLayout(n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return { cols: cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

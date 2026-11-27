// GENERATED from crunchyCore/texgen.js @ bfc9f4a by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 854e33c04e62e9c2542189313385961d25c5267e64f95ebcb06c060629b75043
"use strict";
// crunchyCore: THE TEXTURE GENERATOR (CrunchyTile §174, 2026-11-05; IDEAS.md "TEXTURE GENERATOR"). Textures built from
// RECIPES instead of picked from a list. Pure and self-contained: no DOM, no dependencies; every internal name is
// prefixed tg* / TG_*, the public ones texGen* / TEXGEN_*.
//
// CANONICAL IN crunchyCore. Edit it here; never edit an app's copy.
//
// THE MODEL is textures.js's: a texture gives a tonal LEVEL per pixel, 0 (the LIGHTEST, a ramp's first color) to
// levels-1, and the app maps levels onto a ramp, so one recipe recolors to any palette. No colors in this file.
//
// A RECIPE is three steps over one 32 x 32 period (so it divides every tile by construction):
//   LAYOUT  cuts the torus into PIECES and JOINTS: field (one piece), bricks (courses of cut lengths; planks, tiles and
//           crates are bricks too), stones (a weighted Voronoi: cobbles, flagstones, pebbles, rubble), scatter (small
//           marks: dots, pebbles, flowers, tufts, leaves, sparkles, with EMPTY space between them).
//   FILL    each piece's tone: its own shade, mottling, speckle, grain, and SHAPE (flat, bevel = lit top-left edge and a
//           dark bottom-right, dome = a rounded stone lit from the upper left).
//   FINISH  the joints' tone, chipped edges, cracks; then TONES (3-6) and an ordered DITHER between them.
// A TEXTURE is a STACK of up to four recipes (TEXGEN_LAYERS): the BASE, and layers over it, each with its own ramp and a
// rule for where it shows (texGenStack). The base takes the ramp of whatever uses the texture; the layers carry theirs.
//
// PLANTED (build 1, CrunchyTile §174.1): YOUR TEXTURES IN THE GAME, crunchy/textures/<slug>/ (Unity: Assets/Crunchy/
// Textures/), the suite's own folder as crunchy/palettes/ is (plant.js plantOpenAs with TEXGEN_APP): a sidecar holding
// the texture (its id inside, so a design that names the id finds it whatever the folder is called). Every app planted in
// the game lists them: texGenSave(P, tex), texGenList(P), texGenPlantedDelete(P, slug).
//
// THE API (public names, stable):
//   TEXGEN_ROWS                    a recipe's controls: [key, label, min, max, step, default, group, layouts|null]
//   TEXGEN_LAYOUTS, TEXGEN_MARKS, TEXGEN_SHAPES, TEXGEN_SHOWS   their enums, APPEND ONLY
//   texGenRecipe(r) -> r           every row filled in and clamped;  texGenCompact(r) -> only what differs from defaults
//   texGenStack(layers, x, y, seed) -> { layer, level, L }   which layer draws a pixel, and its level
//   YOUR TEXTURES: TEXGEN_USER (id -> { id, name, layers, rev }), texGenAdd(tex) -> the clean texture (kept), texGenOf(id),
//     texGenClean(tex), texGenNewId(), texGenIsId(v). A texture VALUE is its id ("tx" + letters) and, once an app has
//     put the layers' ramps in its palette, "id@lo-hi,lo-hi,..." (texGenBind): the palette range of each layer, the base
//     first ("-" when it has no ramp of its own). An unbound value draws every layer on the caller's range.
//   texGenIndexValue(v, x, y, r0, r1, seed), texGenLevelValue(v, x, y, seed), texGenLevelsValue(v)   what textures.js
//     calls for a value that is one of these (textureIndex and friends take them as they take a texture name)
//   TEXGEN_STARTERS               named textures to start from (their layers name the suite's ramps)
//   PICTURES (build 8): texGenFromImage(rgba, w, h, { mode: "palette" | "colors", levels, ramps, size }) -> { layers, size,
//     note }: a picture as image layers (a layer's `img`); a texture made so carries `imported: 1` (the person's art)
//   BOX BASES (build 6, CrunchyUI §44): a texture's `box` { kind, bands?, flip? } names a fill the APP draws across its box
//     (a gradient); texGenBox(v), texGenOverIndex(v, x, y, r0, r1, seed, t) (-1 where the base shows), texGenBaseRange(v,
//     r0, r1), texGenBoxPeriod(layers, seed) + texGenBoxPick(bp, layers, x, y, t); a layer's `fade`/`shrink` along it

const TEXGEN_BUILD = 8;   // 8 (2026-11-22, CrunchyTexture §56): IMPORTED PICTURES, a layer's `img` (texGenFromImage); nothing earlier moves. 7 7 (CrunchyCharacter §236): eighteen CLOTH AND HIDE built-ins appended (denim … stone skin), every layer in the caller's one ramp; nothing earlier moved. 6 (CrunchyUI §44): LAYOUTS checker, lines, waves, veins, MARKS heart, star, ring, diamond, dash, bar (all appended); a texture may name a BOX base its app draws (`box`: a gradient across the whole box, CrunchyUI only; texGenBox, texGenBoxPeriod, texGenBoxPick, texGenOverIndex, texGenBaseRange) and its layers may FADE along it (`fade`, `shrink`); nineteen pattern starters. 5 (CrunchyTile §198): LAYOUTS stripes, blobs, plaid, knit, MARKS blade, clover, frond, rosette, the SHOW "edges" (all appended); blobs and plaid drawn as a base show their joint tone; fifteen built-ins (worn grass … cracked ice). 4 (CrunchyTile §185): LAYOUTS herringbone, scales, hexes, weave (appended); six built-ins and ten starters for them. 3 (CrunchyTile §180): LAYERED BUILT-INS, their layers in ramps of their own (texGenBuiltinRamps, bound values). 2 (CrunchyTile §175-176): DETAIL (tgAtP, texGenIndexValueDetail); BUILT-INS (TEXGEN_BUILTINS)
// THE PERIOD: 32, or (DETAIL, CrunchyTile §175) 64 for a 64 px tile: the same texture drawn at twice the resolution.
// Sizes that are the texture's SHAPES (noise lattices, brick lengths, scatter marks, course heights) scale with it, so
// pieces keep their size in the world; pixel-sized ones (joints, bevels, flecks, grain lines) stay one pixel, so they
// get finer. Only tgAtP changes it; everything at 32 is exactly as before.
let TG_P = 32;
function tgAtP(P, fn) { const k = TG_P; TG_P = P; try { return fn(); } finally { TG_P = k; } }
const TEXGEN_LAYOUTS = ["field", "bricks", "stones", "scatter",                 // APPEND ONLY
  "herringbone", "scales", "hexes", "weave",                                   // build 4 (CrunchyTile §185)
  "stripes", "blobs", "plaid", "knit",                                         // build 5 (CrunchyTile §198)
  "checker", "lines", "waves", "veins"];                                       // build 6 (CrunchyUI §44)
const TEXGEN_MARKS = ["dot", "pebble", "flower", "tuft", "leaf", "sparkle",    // APPEND ONLY (scatter's shapes)
  "blade", "clover", "frond", "rosette", "tip",                                // build 5 (CrunchyTile §198)
  "heart", "star", "ring", "diamond", "dash", "bar"];                          // build 6 (CrunchyUI §44)
const TEXGEN_SHAPES = ["flat", "bevel", "dome"];                               // APPEND ONLY
const TEXGEN_LAYERS = 4;                                                      // the base and three (AJ, 2026-11-05)

// A recipe's controls. Every default is the neutral one; `layouts` lists where a row means something (null: all).
const TG_BR = ["bricks"], TG_ST = ["stones", "scatter", "blobs"], TG_PC = ["bricks", "stones", "scatter", "herringbone", "scales", "hexes", "weave",
  "stripes", "blobs", "plaid", "knit", "checker", "lines", "waves", "veins"];
// §44 (build 6): the four pattern layouts leave EMPTY space between their pieces, as scatter, blobs and plaid do
const TG_EMPTY = ["scatter", "blobs", "plaid", "checker", "lines", "waves", "veins"];
const TG_SOLID = ["bricks", "stones", "herringbone", "scales", "hexes", "stripes", "knit"];
// §185: the new layouts read Courses, Length and Bond in their own ways (texgen-ui.js names them for each); §198 too
const TG_ROWS = ["bricks", "herringbone", "scales", "weave", "stripes", "plaid", "knit", "checker", "lines", "waves"], TG_LEN = ["bricks", "herringbone", "scales", "hexes", "weave", "stripes", "plaid", "knit", "lines", "waves", "veins"];
const TG_BOND = ["bricks", "weave", "stripes", "plaid", "knit", "lines", "waves"];
const TG_UNEVEN = ["bricks", "stripes"], TG_STAG = ["stones", "scatter", "blobs", "plaid", "lines", "waves"];
const TEXGEN_ROWS = [
  ["layout",     "Layout",          0, 15, 1,   0,   "Layout", null],
  ["rows",       "Courses",         1, 16, 1,   8,   "Layout", TG_ROWS],
  ["courseVar",  "Uneven courses",  0, 1, 0.05, 0,   "Layout", TG_UNEVEN],
  ["len",        "Length",          2, 32, 1,   8,   "Layout", TG_LEN],
  ["lenVar",     "Uneven lengths",  0, 1, 0.05, 0,   "Layout", TG_UNEVEN],
  ["bond",       "Bond",            0, 1, 0.05, 0.5, "Layout", TG_BOND],
  ["bondVar",    "Shuffle",         0, 1, 0.05, 0,   "Layout", ["bricks", "blobs"]],
  ["axis",       "Run down",        0, 1, 1,    0,   "Layout", null],
  ["count",      "Count",           2, 64, 1,   16,  "Layout", TG_ST.concat(["veins"])],
  ["jitter",     "Jitter",          0, 1, 0.05, 0.5, "Layout", TG_ST.concat(["waves", "veins"])],
  ["sizeVar",    "Size mix",        0, 1, 0.05, 0,   "Layout", TG_ST],
  ["stagger",    "Stagger",         0, 1, 0.05, 0,   "Layout", TG_STAG],
  ["mark",       "Mark",            0, 16, 1,   0,   "Layout", ["scatter"]],
  ["markSize",   "Mark size",       1, 4, 0.1,  2,   "Layout", ["scatter", "blobs", "waves", "veins"]],
  ["mortar",     "Joints",          0, 3, 0.1,  1,   "Layout", TG_PC.filter(function (l) { return l !== "plaid" && TG_EMPTY.indexOf(l) < 3; })],   // (scatter and blobs outline)
  ["tone",       "Brightness",      0, 1, 0.02, 0.6, "Fill", null],
  ["pieceVar",   "Piece shades",    0, 1, 0.05, 0,   "Fill", TG_PC],
  ["mottle",     "Mottle",          0, 1, 0.05, 0,   "Fill", null],
  ["mottleSize", "Mottle size",     1, 4, 1,    2,   "Fill", null],
  ["speckle",    "Speckle",         0, 1, 0.05, 0,   "Fill", null],
  ["grain",      "Grain",           0, 1, 0.05, 0,   "Fill", null],
  ["shade",      "Shape",           0, 2, 1,    0,   "Fill", TG_PC],
  ["shadeAmt",   "Shape strength",  0, 1, 0.05, 0.5, "Fill", TG_PC],
  ["bevelW",     "Bevel width",     1, 3, 1,    1,   "Fill", TG_PC],
  ["jointTone",  "Joint shade",     0, 1, 0.05, 0,   "Finish", TG_PC],
  ["chip",       "Chips",           0, 1, 0.05, 0,   "Finish", TG_SOLID],
  ["crack",      "Cracks",          0, 1, 0.05, 0,   "Finish", TG_SOLID],
  ["levels",     "Tones",           3, 6, 1,    5,   "Finish", null],
  ["dither",     "Dither",          0, 1, 0.05, 0,   "Finish", null],
];
function texGenRecipe(r) {
  const o = {};
  for (const row of TEXGEN_ROWS) {
    const v = r && r[row[0]] != null ? +r[row[0]] : row[5];
    o[row[0]] = Math.min(row[3], Math.max(row[2], isFinite(v) ? v : row[5]));
  }
  return o;
}
function texGenCompact(r) {
  const c = texGenRecipe(r), o = {};
  for (const row of TEXGEN_ROWS) if (c[row[0]] !== row[5]) o[row[0]] = c[row[0]];
  return o;
}
function tgKey(r) { return TEXGEN_ROWS.map(function (row) { return r[row[0]]; }).join(","); }

function tgH(a, b, c) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function tgMod(a, n) { return ((a % n) + n) % n; }
function tgRand(a, b, seed, salt) { return tgH(a + Math.imul(salt, 1013), b - Math.imul(salt, 7919), seed * 131 + salt); }
// Wrapped value noise, lattice every L px (L divides 32), smoothstepped. 0..1.
function tgNoise(x, y, L, seed, salt) {
  L = L * TG_P / 32;                                    // features keep their world size at 64 (32: unchanged)
  const n = TG_P / L, gx = x / L, gy = y / L, ix = Math.floor(gx), iy = Math.floor(gy);
  let fx = gx - ix, fy = gy - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const v = function (i, j) { return tgRand(tgMod(i, n), tgMod(j, n), seed, salt); };
  const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * fx, b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * fx;
  return a + (b - a) * fy;
}
function tgFbm(x, y, L, seed, salt) {
  return tgNoise(x, y, L, seed, salt) * 0.65 + tgNoise(x, y, Math.max(1, L / 2), seed, salt + 1) * 0.35;
}
const TG_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---------------------------------------------------------------------------------------------------------------
// LAYOUTS: each fills id[] (P*P) with a piece number, or -1 for a joint.
function tgLayoutBricks(r, seed, id) {
  const P = TG_P, rows = Math.round(r.rows), ch = P / rows;
  // course boundaries; interior ones wander by courseVar (kept in order, at least 2 px apart)
  const b = [];
  for (let i = 0; i <= rows; i++) {
    let y = i * ch;
    if (i > 0 && i < rows) y += (tgRand(i, 0, seed, 11) - 0.5) * ch * 0.8 * r.courseVar;
    b.push(Math.round(y));
  }
  for (let i = 1; i < rows; i++) b[i] = Math.max(b[i], b[i - 1] + 2);
  const len = Math.round(r.len), minLen = Math.max(2, Math.round(len * 0.45));
  for (let i = 0; i < rows; i++) {
    const y0 = b[i], y1 = b[i + 1];
    if (y1 <= y0) continue;
    const off = tgMod(Math.round(i * r.bond * len + (tgRand(i, 1, seed, 12) - 0.5) * r.bondVar * len), P);
    const cuts = [];
    let total = 0, k = 0;
    while (total < P) {
      let step = Math.max(2, Math.round(len * (1 + r.lenVar * (tgRand(i, k, seed, 13) - 0.5) * 1.4)));
      if (P - total - step < minLen) step = P - total;
      cuts.push(total);
      total += step; k++;
    }
    for (let y = y0; y < y1; y++) for (let xx = 0; xx < P; xx++) {
      const u = tgMod(xx - off, P);
      let j = cuts.length - 1;
      while (cuts[j] > u) j--;
      const joint = y - y0 < r.mortar || u - cuts[j] < r.mortar;
      const x = tgMod(xx, P), yy = tgMod(y, P);
      const at = r.axis >= 0.5 ? x * P + yy : yy * P + x;               // axis 1: courses run down the texture
      id[at] = joint ? -1 : i * 64 + j;
    }
  }
}
function tgLayoutStones(r, seed, id) {
  const P = TG_P, g = Math.max(2, Math.round(Math.sqrt(r.count))), cs = P / g, pts = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const st = (j & 1) * r.stagger * 0.5;
    pts.push([(i + 0.5 + st + (tgRand(i, j, seed, 21) - 0.5) * r.jitter) * cs,
              (j + 0.5 + (tgRand(i, j, seed, 22) - 0.5) * r.jitter) * cs,
              (tgRand(i, j, seed, 23) - 0.5) * r.sizeVar * cs * 0.9]);   // a weight: bigger and smaller stones
  }
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    let d1 = 1e9, d2 = 1e9, k = 0;
    for (let i = 0; i < pts.length; i++) {
      const dx = tgMod(x + 0.5 - pts[i][0] + P / 2, P) - P / 2, dy = tgMod(y + 0.5 - pts[i][1] + P / 2, P) - P / 2;
      const d = Math.sqrt(dx * dx + dy * dy) - pts[i][2];
      if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
    }
    id[y * P + x] = d2 - d1 < r.mortar ? -1 : k;
  }
}

// SCATTER: small marks on a jittered grid, the space between them EMPTY (-1, transparent: the layer below shows), a
// dark outline (-2) round each when mortar > 0. A flower's middle is recorded so it can be lit.
function tgLayoutScatter(r, seed, id, mid) {
  const P = TG_P, g = Math.max(1, Math.round(Math.sqrt(r.count))), cs = P / g, mark = TEXGEN_MARKS[Math.round(r.mark)];
  const put = function (x, y, k) { id[tgMod(Math.round(y), P) * P + tgMod(Math.round(x), P)] = k; };
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const k = j * g + i, st = (j & 1) * r.stagger * 0.5;
    const cx = Math.floor((i + 0.5 + st + (tgRand(i, j, seed, 51) - 0.5) * r.jitter) * cs);
    const cy = Math.floor((j + 0.5 + (tgRand(i, j, seed, 52) - 0.5) * r.jitter) * cs);
    const s = Math.max(0.6, r.markSize * (1 + r.sizeVar * (tgRand(i, j, seed, 53) - 0.5) * 1.2));
    const a = tgRand(i, j, seed, 54) * Math.PI;
    if (mark === "dot" || mark === "pebble") {
      const rx = mark === "dot" ? s * 0.55 : s * 0.9, ry = mark === "dot" ? rx : s * 0.65, R = Math.ceil(Math.max(rx, ry)) + 1;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++)
        if ((dx * dx) / (rx * rx + 0.2) + (dy * dy) / (ry * ry + 0.2) <= 1) put(cx + dx, cy + dy, k);
    } else if (mark === "flower") {
      const d = Math.max(1, Math.round(s * 0.7)), pr = Math.max(0.5, s * 0.45);
      for (const [px, py] of [[d, 0], [-d, 0], [0, d], [0, -d]])
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
          if (dx * dx + dy * dy <= pr * pr + 0.3) put(cx + px + dx, cy + py + dy, k);
      put(cx, cy, k); mid[tgMod(cy, P) * P + tgMod(cx, P)] = 1;
    } else if (mark === "tuft") {
      const h = Math.max(2, Math.round(s * 1.6));
      for (let t = 0; t < h; t++) { put(cx, cy - t, k); put(cx - Math.round(t * 0.55), cy - Math.round(t * 0.8), k); put(cx + Math.round(t * 0.55), cy - Math.round(t * 0.8), k); }
    } else if (mark === "leaf") {
      const L = s * 1.4, W = Math.max(0.6, s * 0.55), ca = Math.cos(a), sa = Math.sin(a), R = Math.ceil(L) + 1;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if ((u * u) / (L * L) + (v * v) / (W * W) <= 1) put(cx + dx, cy + dy, k);
      }
    } else if (mark === "blade" || mark === "clover" || mark === "frond" || mark === "rosette" || mark === "tip") {
      tgMark2(mark, cx, cy, s, i, j, seed, k, put, mid);                   // §198 (build 5)
    } else if (mark !== "sparkle") {
      tgMark3(mark, cx, cy, s, i, j, seed, k, put);                        // §44 (build 6)
    } else {
      const arm = Math.max(1, Math.round(s));
      for (let t = -arm; t <= arm; t++) { put(cx + t, cy, k); put(cx, cy + t, k); }
    }
  }
  if (r.mortar > 0) for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const i = y * P + x;
    if (id[i] !== -1) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (id[tgMod(y + dy, P) * P + tgMod(x + dx, P)] >= 0) { id[i] = -2; break; }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// §185 (CrunchyTile, build 4): HERRINGBONE, SCALES, HEXES, WEAVE. Each paints a PIECE number on every pixel of the
// torus (pc) and, where pieces run one way, which way (po: 0 along x, 1 along y, so grain follows each piece); tgCut
// then lays the joints and turns the whole for Run down. Their sizes snap to the ones that divide the period, so every
// piece is whole and alike (the same picture at 32 and 64: the counts are the same, the pixels twice as many).
function tgPow2(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.pow(2, Math.round(Math.log2(Math.max(1, v)))))); }
// HERRINGBONE: bricks W wide and k W long (k = 2 or 4), a horizontal and a vertical one per step down a diagonal; the
// pattern repeats every 2 k W, so W = P / courses and k snap to powers of two.
function tgLayoutHerringbone(r, pc, po) {
  const P = TG_P, n = tgPow2(r.rows, 4, 16), W = P / n, k = tgPow2(r.len / W, 2, Math.min(4, n / 2)), m = n / (2 * k);
  const cell = new Int32Array(n * n).fill(-1), dir = new Uint8Array(n * n);
  const put = function (cx, cy, id, d) { const i = tgMod(cy, n) * n + tgMod(cx, n); cell[i] = id; dir[i] = d; };
  for (let t = 0; t < n; t++) for (let q = 0; q < m; q++) {
    const id = (t * m + q) * 2, x0 = t + 2 * k * q;
    for (let a = 0; a < k; a++) { put(x0 + a, t, id, 0); put(x0 + k, t + 1 - k + a, id + 1, 1); }
  }
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const c = Math.floor(y / W) * n + Math.floor(x / W);
    pc[y * P + x] = cell[c]; po[y * P + x] = dir[c];
  }
}
// SCALES: rows of round scales, each row half a scale over and LAPPED by the row above (a fish's side, a roof of
// scalloped shingles): a pixel belongs to the highest scale whose disk holds it. Width snaps to P / 2, 4 or 8; courses
// to an even count (the half-scale stagger meets itself across the wrap). Courses closer than the radius lap deeper.
function tgLayoutScales(r, pc) {
  const P = TG_P, n = tgPow2(P / r.len, 2, 8), w = P / n, R = w / 2, rows = Math.max(2, 2 * Math.round(r.rows / 2));
  const yc = [];
  for (let i = 0; i < rows; i++) yc.push(Math.round(i * P / rows));
  const R2 = R * R + 0.3;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    let best = -1, bestDy = -1e9, near = -1, nearD = 1e9;
    for (let i = 0; i < rows; i++) {
      const dy = tgMod(y + 0.5 - yc[i] + P / 2, P) - P / 2;
      for (let j = 0; j < n; j++) {
        const dx = tgMod(x + 0.5 - (j * w + (i & 1) * R) + P / 2, P) - P / 2, d = dx * dx + dy * dy;
        if (d <= R2 && dy > bestDy) { bestDy = dy; best = i * n + j; }
        if (d < nearD) { nearD = d; near = i * n + j; }
      }
    }
    pc[y * P + x] = best >= 0 ? best : near;
  }
}
// HEXES: pointy-topped hexagons (Run down: flat-topped), the cells of a centered lattice w apart in both directions, so
// the slanted sides step two pixels across for one down: the clean pixel-art diagonal. Width snaps to P / 2, 4 or 8.
function tgLayoutHexes(r, pc) {
  const P = TG_P, n = tgPow2(P / r.len, 2, 8), w = P / n;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    let best = 0, bd = 1e9;
    for (let j = 0; j < n; j++) {
      const dy = tgMod(y + 0.5 - j * w + P / 2, P) - P / 2;
      for (let i = 0; i < n; i++) {
        const dx = tgMod(x + 0.5 - i * w - (j & 1) * w / 2 + P / 2, P) - P / 2, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = j * n + i; }
      }
    }
    pc[y * P + x] = best;
  }
}
// WEAVE: strands across and down, each passing OVER k strands and under k. Bond picks how the rows line up: basket
// (strands in k x k blocks, < 1/3), plain over-and-under (each strand the opposite of the next), twill (each row one
// strand on: diagonal ribs, >= 2/3). Strands snap to an even count, k to one the count holds twice.
function tgLayoutWeave(r, pc, po) {
  const P = TG_P, N = Math.max(2, 2 * Math.round(r.rows / 2)), s = P / N;
  let k = Math.max(1, Math.min(N / 2, Math.round(r.len / s)));
  while (N % (2 * k)) k--;
  const mode = r.bond < 1 / 3 ? 0 : r.bond < 2 / 3 ? 1 : 2;
  const sig = function (i) { return mode === 0 ? Math.floor(i / k) * k : mode === 1 ? i * k : i; };
  const across = function (i, j) { return tgMod(j + sig(tgMod(i, N)), 2 * k) < k; };
  const cell = new Int32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const h = across(i, j);
    let a = 0;                                                   // walk back to where this run starts (left or up)
    if (h) { while (a < N && across(i, j - a - 1)) a++; cell[i * N + j] = (i * N + tgMod(j - a, N)) * 2; }
    else { while (a < N && !across(i - a - 1, j)) a++; cell[i * N + j] = (tgMod(i - a, N) * N + j) * 2 + 1; }
  }
  const b = [];
  for (let i = 0; i <= N; i++) b.push(Math.round(i * s));
  const band = new Int32Array(P);
  for (let i = 0; i < N; i++) for (let v = b[i]; v < b[i + 1]; v++) band[v] = i;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const c = cell[band[y] * N + band[x]];
    pc[y * P + x] = c; po[y * P + x] = c & 1;
  }
}
// The joints (a piece's top and left rows, as bricks lay them: up to `mortar` pixels where the piece above or to the
// left is another), then Run down turns the whole (and which way each piece runs).
function tgCut(r, pc, po, id) {
  const P = TG_P, m = Math.ceil(r.mortar - 1e-9), tr = r.axis >= 0.5;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const k = pc[y * P + x];
    let joint = false;
    for (let d = 1; d <= m && !joint; d++) joint = pc[tgMod(y - d, P) * P + x] !== k || pc[y * P + tgMod(x - d, P)] !== k;
    const at = tr ? x * P + y : y * P + x;
    id[at] = joint ? -1 : k;
  }
  if (!tr) return po;
  const o = new Uint8Array(P * P);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) o[x * P + y] = po[y * P + x] ^ 1;
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// §198 (CrunchyTile, build 5): FOUR MORE MARKS for scatter, and STRIPES, BLOBS, PLAID and KNIT. Marks and layouts are
// appended; nothing here runs for an older recipe, so every texture before them draws byte for byte.
//   blade    a long blade of grass (two or three, fanned), its tip lit: dry grass, frost-tipped grass
//   clover   a trefoil: three round leaflets about a middle
//   frond    a fern frond: a curling stem with leaflets either side, shortening to its tip; the stem lit
//   rosette  an ornament: a lit middle, four petals and four dots between them (carpets, tiles, embroidery)
//   tip      only the top two pixels of the same blades as "blade" (a layer paired with a blade layer: frost, dew)
function tgMark2(mark, cx, cy, s, i, j, seed, k, put, mid) {
  const P = TG_P, lit = function (x, y) { put(x, y, k); mid[tgMod(Math.round(y), P) * P + tgMod(Math.round(x), P)] = 1; };
  if (mark === "blade" || mark === "tip") {
    // one blade, or two from one root; mostly upright, the tip lit. TIP draws only the top two pixels of the very same
    // blades (the tip lit): on a layer that shares a blade layer's seed (`pair`) it frosts, dews or burns those blades' tips
    const n = tgRand(i, j, seed, 55) < 0.45 ? 2 : 1, h = Math.max(3, Math.round(s * 2.8)), tip = mark === "tip";
    for (let b = 0; b < n; b++) {
      const lean = (n === 2 ? (b ? 0.28 : -0.28) : 0) + (tgRand(i * 3 + b, j, seed, 56) - 0.5) * 0.4;
      const len = Math.max(2, Math.round(h * (b ? 0.7 + tgRand(i, j * 3 + b, seed, 57) * 0.25 : 1)));
      for (let t = tip ? len - 2 : 0; t < len; t++) (t === len - 1 ? lit : put)(cx + Math.round(lean * t * (1 + t / (len * 2))), cy - t, k);
    }
  } else if (mark === "clover") {
    const a = tgRand(i, j, seed, 54) * Math.PI * 2, d = Math.max(1, s * 0.6), pr = Math.max(0.7, s * 0.5);
    for (let q = 0; q < 3; q++) {
      const lx = cx + Math.cos(a + q * 2.094) * d, ly = cy + Math.sin(a + q * 2.094) * d, R = Math.ceil(pr) + 1;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= pr * pr + 0.25) put(Math.round(lx) + dx, Math.round(ly) + dy, k);
    }
    lit(cx, cy);
  } else if (mark === "frond") {
    // a stem curling a little from the root; leaflets either side sweeping toward the tip, longest a third of the way up
    let a = -Math.PI / 2 + (tgRand(i, j, seed, 54) - 0.5) * 3.2, x = cx, y = cy;
    const len = Math.max(5, Math.round(s * 4.2)), curl = (tgRand(i, j, seed, 58) < 0.5 ? -1 : 1) * (0.03 + tgRand(i, j, seed, 59) * 0.06);
    for (let t = 0; t < len; t++) {
      const f = (t + 1) / len, leaf = t === 0 || (t & 1) ? 0 : Math.max(1, Math.round(s * 1.25 * Math.min(1, f * 2.5) * (1.1 - f)));
      const nx = -Math.sin(a), ny = Math.cos(a), fx = Math.cos(a), fy = Math.sin(a);
      for (let q = 1; q <= leaf; q++) {
        const sw = q * 0.6;
        put(x + nx * q + fx * sw, y + ny * q + fy * sw, k);
        put(x - nx * q + fx * sw, y - ny * q + fy * sw, k);
      }
      lit(x, y);
      x += fx; y += fy; a += curl;
    }
  } else {
    const d = Math.max(1, Math.round(s * 0.9)), pr = Math.max(0.6, s * 0.42), e = Math.max(1, Math.round(s * 0.75));
    for (const [px, py] of [[d, 0], [-d, 0], [0, d], [0, -d]])
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        if (dx * dx + dy * dy <= pr * pr + 0.3) put(cx + px + dx, cy + py + dy, k);
    for (const [px, py] of [[e, e], [-e, e], [e, -e], [-e, -e]]) put(cx + px, cy + py, k);
    lit(cx, cy);
  }
}
// STRIPES: courses running the whole way across (no cut, unlike bricks): furrows, thatch, siding. Each boundary wobbles
// along the course (Uneven courses, a smooth wrapped noise Length long) and goes ragged (Uneven lengths: per column, the
// straw ends of thatch). Bond at a half or more turns the grain ACROSS the courses (thatch straw runs down the roof).
function tgLayoutStripes(r, seed, pc, po) {
  const P = TG_P, n = Math.max(1, Math.round(r.rows)), ch = P / n, L = tgPow2(r.len * 32 / P, 4, 32);
  const across = r.bond >= 0.5 ? 1 : 0, b = new Float32Array(n + 1);
  for (let x = 0; x < P; x++) {
    for (let i = 0; i <= n; i++) {
      const ii = i % n;
      let y = i * ch;
      if (r.courseVar > 0) y += (tgNoise(x, ii * (P / n), L, seed, 71) - 0.5) * ch * 0.9 * r.courseVar;
      if (r.lenVar > 0) y += (tgRand(x, ii, seed, 72) - 0.5) * ch * 0.45 * r.lenVar;
      b[i] = i === n ? b[0] + P : y;
    }
    for (let y = 0; y < P; y++) {
      let yy = y;
      if (yy < b[0]) yy += P;
      let i = 0;
      while (i < n - 1 && yy >= b[i + 1]) i++;
      if (yy >= b[n]) i = 0;
      pc[y * P + x] = i; po[y * P + x] = across;
    }
  }
}
// BLOBS: organic patches with EMPTY space between them (as scatter): bare earth in grass, frost, snow on ice, lichen. A
// jittered grid of blobs Mark size x 2 px across their middle, their edges bent by a wrapped noise; touching ones merge.
function tgLayoutBlobs(r, seed, id) {
  const P = TG_P, g = Math.max(1, Math.round(Math.sqrt(r.count))), cs = P / g, B = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const st = (j & 1) * r.stagger * 0.5;
    B.push([(i + 0.5 + st + (tgRand(i, j, seed, 81) - 0.5) * r.jitter) * cs, (j + 0.5 + (tgRand(i, j, seed, 82) - 0.5) * r.jitter) * cs,
      Math.max(0.8, r.markSize * 2 * (1 + r.sizeVar * (tgRand(i, j, seed, 83) - 0.5) * 1.4)), tgRand(i, j, seed, 84) * 0.6 + 0.7]);
  }
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const w = (tgFbm(x, y, 8, seed, 85) - 0.5) * (0.6 + r.jitter * 0.8);   // Jitter bends the edges too
    let best = -1, bd = 1e9;
    for (let k = 0; k < B.length; k++) {
      const dx = tgMod(x + 0.5 - B[k][0] + P / 2, P) - P / 2, dy = (tgMod(y + 0.5 - B[k][1] + P / 2, P) - P / 2) * B[k][3];
      const d = Math.sqrt(dx * dx + dy * dy) / B[k][2] + w;
      if (d < bd) { bd = d; best = k; }
    }
    // Shuffle (bondVar): a RAGGED edge, the outermost band of each blob on a checker (dithered, as pixel art fades an edge)
    if (bd < 1 - r.bondVar * 0.35 || (bd < 1 && ((x + y) & 1) === 0)) id[y * P + x] = best;
  }
  if (r.mortar > 0) for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const i = y * P + x;
    if (id[i] !== -1) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (id[tgMod(y + dy, P) * P + tgMod(x + dx, P)] >= 0) { id[i] = -2; break; }
  }
}
// PLAID: bands across AND down with EMPTY space between (a layer over a ground: tartan, gingham, a carpet's lattice).
// Courses: bands in a tile (1, 2, 4, 8 or 16); Length: each band's width; Stagger: where they sit. Where two bands cross
// the band is solid; where only one runs, Bond mixes it with what is below: solid (< 1/3), a checker, or a TWILL (>= 2/3,
// the diagonal of woven cloth). Run down: the bands run at 45 degrees, a diamond lattice.
function tgLayoutPlaid(r, id) {
  const P = TG_P, n = tgPow2(r.rows, 1, 16), S = P / n, w = Math.max(1, Math.min(S, Math.round(r.len))), off = Math.round(r.stagger * S);
  const diag = r.axis >= 0.5, mode = r.bond < 1 / 3 ? 0 : r.bond < 2 / 3 ? 1 : 2;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const u = diag ? x + y : y, v = diag ? x - y : x;
    const h = tgMod(u - off, S) < w, d = tgMod(v - off, S) < w;
    let k = -1;
    if (h && d) k = 0;
    else if (h || d) {
      const on = mode === 0 ? true : mode === 1 ? ((x + y) & 1) === 0 : tgMod(x + y, 4) < 2;
      if (on) k = h ? 1 : 2;
    }
    id[y * P + x] = k;
  }
}
// KNIT: stockinette, columns of V stitches. Each stitch is two legs (the left and right of the V), each its own piece,
// rows dropping toward each stitch's middle (Bond: how deep the V), so bevel and dome light every leg. Length: the
// stitch's width (a half to a sixteenth of the tile); Courses: rows down a tile.
function tgLayoutKnit(r, pc) {
  const P = TG_P, nc = tgPow2(P / r.len, 2, 16), w = P / nc, nr = Math.max(2, Math.round(r.rows)), h = P / nr, k = r.bond * 2;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const j = Math.floor(x / w), xl = x - j * w, leg = xl < w / 2 ? 0 : 1;
    const yy = tgMod(y + Math.floor(Math.abs(xl + 0.5 - w / 2) * k), P), i = Math.min(nr - 1, Math.floor(yy / h));
    pc[y * P + x] = (i * nc + j) * 2 + leg;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// §44 (CrunchyUI, build 6): PATTERNS for interfaces, as useful on a floor: CHECKER, LINES, WAVES, VEINS, and six marks.
// Each leaves EMPTY space between its pieces (as plaid), so as a layer it shows what is below (dots over a gradient,
// scanlines over a panel) and as a base it shows its joint tone there (a two-tone checker, candy stripes). Sizes snap so
// the pattern repeats in the period. Appended; nothing here runs for an older recipe.
//   checker  squares on a checkerboard, Courses across a tile (2-16); Run down: DIAMONDS (a harlequin)
//   lines    straight bands, Courses a tile (1-16), Length their width, Stagger where they sit; Run down: down the tile;
//            Bond at three quarters or more: DIAGONAL (candy stripes, hazard tape)
//   waves    bands that wave: Courses a tile, Length the wave's length (4-32), Jitter its height, Mark size its
//            thickness; Bond picks a ZIGZAG (chevrons), a WAVE, or SCALLOPS
//   veins    marble: thin lines wandering corner to corner, bent by a wrapped noise: Count how many (8 a vein), Jitter
//            how far they bend, Length the bends' scale, Mark size how thick
function tgLayoutChecker(r, id) {
  const P = TG_P, n = tgPow2(r.rows, 2, 16), S = P / n, diag = r.axis >= 0.5;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    let k = -1;
    if (!diag) {
      const cx = Math.floor(x / S), cy = Math.floor(y / S);
      if (((cx + cy) & 1) === 0) k = cy * n + cx;
    } else {
      // a diamond lattice: cells along x + y and x - y. Shifting x or y by the period moves both indices by n, so one
      // diamond cut by the wrap keeps one number (its index across mod n, the other turned with it)
      let ku = Math.floor((x + y) / S), kv = Math.floor((x - y + P) / S);
      if (((ku + kv) & 1) === 0) { if (ku >= n) { ku -= n; kv = tgMod(kv + n, 2 * n); } k = ku * 2 * n + kv; }
    }
    id[y * P + x] = k;
  }
}
function tgLayoutLines(r, id) {
  const P = TG_P, n = tgPow2(r.rows, 1, 16), S = P / n, w = Math.max(1, Math.min(S - 1, Math.round(r.len))), off = Math.round(r.stagger * S);
  const diag = r.bond >= 0.75, down = r.axis >= 0.5;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const u = diag ? (down ? x - y + P : x + y) : (down ? x : y);
    id[y * P + x] = tgMod(u - off, S) < w ? tgMod(Math.floor((u - off) / S), n) : -1;
  }
}
function tgLayoutWaves(r, id) {
  const P = TG_P, n = tgPow2(r.rows, 1, 16), S = P / n, Lw = tgPow2(r.len, 4, P), A = r.jitter * S * 0.5;
  const th = Math.max(1, Math.min(S - 1, Math.round(r.markSize * 32 / P / 4 * S))), off = Math.round(r.stagger * S);   // (a share of the band: unscaled at 64)
  const mode = r.bond < 1 / 3 ? 0 : r.bond < 2 / 3 ? 1 : 2, down = r.axis >= 0.5;
  for (let a = 0; a < P; a++) {
    const u = tgMod(a, Lw) / Lw;
    const sh = mode === 0 ? 2 * Math.abs(2 * u - 1) - 1 : mode === 1 ? Math.sin(2 * Math.PI * u) : 1 - 2 * Math.sin(Math.PI * u);
    const dy = Math.round(A * sh);
    for (let b = 0; b < P; b++) {
      const v = b - dy - off;
      id[down ? a * P + b : b * P + a] = tgMod(v, S) < th ? tgMod(Math.floor(v / S), n) : -1;
    }
  }
}
function tgLayoutVeins(r, seed, id) {
  // classic marble: bands running corner to corner (Count of them a tile, a whole number so they meet across the wrap),
  // bent by a wrapped noise (Jitter how far, Length its scale); a vein where a band's middle passes, Mark size thick
  const P = TG_P, L = tgPow2(r.len * 32 / P, 4, 32), m = Math.max(1, Math.round(r.count / 8)), w = 0.015 + r.markSize * 32 / P * 0.02;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const g = m * (x + y) / P + (tgFbm(x, y, L, seed, 91) - 0.5) * r.jitter * 3 + (tgNoise(x, y, Math.max(2, L / 2), seed, 92) - 0.5) * r.jitter;
    id[y * P + x] = Math.abs(g - Math.round(g)) < w ? tgMod(Math.round(g), 64) : -1;
  }
}
// The six marks, on scatter's grid: HEART, STAR (five points), RING (a bubble), DIAMOND, DASH (a short bar turned one of
// four ways: confetti), BAR (a bar on a diagonal that alternates with its neighbors: diamond plate, tread)
const TG_MARK_BITMAPS = {
  heart: [[".#.#.", "#####", ".###.", "..#.."],
          [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
          [".###.###.", "#########", "#########", "#########", ".#######.", "..#####..", "...###...", "....#...."]],
  star: [["..#..", ".###.", "#####", ".#.#."],
         ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", ".#...#."],
         ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", ".#.....#."]],
};
function tgMark3(mark, cx, cy, s, i, j, seed, k, put) {
  const R = Math.ceil(s * 1.6) + 1;
  if (mark === "heart" || (mark === "star" && s < 3)) {
    // small sizes as pixel-art bitmaps (a polygon this small rasterizes into a blob), the next size up at Mark size 1.6, 2.8
    const B = TG_MARK_BITMAPS[mark][s < 1.6 ? 0 : s < 2.8 ? 1 : 2], h = B.length, w = B[0].length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (B[y].charAt(x) === "#") put(cx + x - (w >> 1), cy + y - (h >> 1), k);
  } else if (mark === "star") {
    const Ro = s * 1.6, Ri = Ro * 0.42, v = [];
    for (let q = 0; q < 10; q++) { const a = -Math.PI / 2 + q * Math.PI / 5, rr = q & 1 ? Ri : Ro; v.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      let inside = false;
      for (let a = 0, b = 9; a < 10; b = a++) {
        const ya = v[a][1], yb = v[b][1];
        if ((ya > dy) !== (yb > dy) && dx < (v[b][0] - v[a][0]) * (dy - ya) / (yb - ya) + v[a][0]) inside = !inside;
      }
      if (inside) put(cx + dx, cy + dy, k);
    }
  } else if (mark === "ring") {
    const Rr = Math.max(1.5, s * 1.1);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (Math.abs(Math.sqrt(dx * dx + dy * dy) - Rr) <= 0.6) put(cx + dx, cy + dy, k);
  } else if (mark === "diamond") {
    const ax = Math.max(1.1, s * 1.1), ay = Math.max(1.5, s * 1.45);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (Math.abs(dx) / ax + Math.abs(dy) / ay <= 1) put(cx + dx, cy + dy, k);
  } else if (mark === "dash") {
    const d = [[1, 0], [0, 1], [1, 1], [1, -1]][Math.floor(tgRand(i, j, seed, 57) * 4)], h = Math.max(1, Math.round(s * 0.75));
    for (let t = -h; t <= h; t++) put(cx + t * d[0], cy + t * d[1], k);
  } else {
    const d = (i + j) & 1 ? [1, 1] : [1, -1], h = Math.max(1, Math.round(s * 1.1));
    for (let t = -h; t <= h; t++) { put(cx + t * d[0], cy + t * d[1], k); put(cx + t * d[0] + 1, cy + t * d[1], k); }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THE PERIOD: layout, distances, centers, then every pixel's tone and level.
const TG_CACHE = new Map();
function tgBuild(rIn, seed) {
  const r = texGenRecipe(rIn), key = (TG_P === 32 ? "" : TG_P + ":") + tgKey(r) + "|" + (seed | 0);
  let c = TG_CACHE.get(key);
  if (c) return c;
  if (TG_CACHE.size >= 256) TG_CACHE.clear();
  seed = seed | 0;
  if (TG_P !== 32) { r.len = r.len * TG_P / 32; r.markSize = r.markSize * TG_P / 32; }    // shapes keep their world size
  const P = TG_P, N = P * P, id = new Int32Array(N), mid = new Uint8Array(N);
  const layout = TEXGEN_LAYOUTS[Math.round(r.layout)], scatter = layout === "scatter";
  const empty = TG_EMPTY.indexOf(layout) >= 0, stripes = layout === "stripes";   // §198, §44: EMPTY space between pieces
  if (layout === "bricks") tgLayoutBricks(r, seed, id);
  else if (layout === "stones") tgLayoutStones(r, seed, id);
  else if (scatter) { id.fill(-1); tgLayoutScatter(r, seed, id, mid); }
  else if (layout === "blobs") { id.fill(-1); tgLayoutBlobs(r, seed, id); }
  else if (layout === "plaid") { id.fill(-1); tgLayoutPlaid(r, id); }
  else if (layout === "checker") tgLayoutChecker(r, id);                     // §44 (build 6)
  else if (layout === "lines") tgLayoutLines(r, id);
  else if (layout === "waves") tgLayoutWaves(r, id);
  else if (layout === "veins") tgLayoutVeins(r, seed, id);
  let pax = null;                                                         // §185: which way each pixel's piece runs
  if ((Math.round(r.layout) >= 4 && Math.round(r.layout) <= 7) || layout === "stripes" || layout === "knit") {
    const pc = new Int32Array(N), po = new Uint8Array(N);
    if (layout === "herringbone") tgLayoutHerringbone(r, pc, po);
    else if (layout === "scales") tgLayoutScales(r, pc);
    else if (layout === "hexes") tgLayoutHexes(r, pc);
    else if (layout === "stripes") tgLayoutStripes(r, seed, pc, po);
    else if (layout === "knit") tgLayoutKnit(r, pc);
    else tgLayoutWeave(r, pc, po);
    pax = tgCut(r, pc, po, id);
    if (layout === "scales" || layout === "hexes" || layout === "knit") pax = null;   // round pieces: grain follows Run down, as before
  }
  const at = function (x, y) { return tgMod(y, P) * P + tgMod(x, P); };

  // Toroidal chamfer distance to the nearest pixel of ANOTHER piece (or a joint): 1 on a piece's rim.
  const dist = new Float32Array(N).fill(99);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const i = at(x, y);
    if (id[i] < 0) { dist[i] = 0; continue; }
    if (id[at(x - 1, y)] !== id[i] || id[at(x + 1, y)] !== id[i] || id[at(x, y - 1)] !== id[i] || id[at(x, y + 1)] !== id[i]) dist[i] = 1;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const i = at(x, y);
      dist[i] = Math.min(dist[i], dist[at(x - 1, y)] + 1, dist[at(x, y - 1)] + 1, dist[at(x - 1, y - 1)] + 1.41, dist[at(x + 1, y - 1)] + 1.41);
    }
    for (let y = P - 1; y >= 0; y--) for (let x = P - 1; x >= 0; x--) {
      const i = at(x, y);
      dist[i] = Math.min(dist[i], dist[at(x + 1, y)] + 1, dist[at(x, y + 1)] + 1, dist[at(x + 1, y + 1)] + 1.41, dist[at(x - 1, y + 1)] + 1.41);
    }
  }
  // Each piece's center (unwrapped about its first pixel) and its deepest point.
  const cen = new Map();
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const k = id[y * P + x];
    if (k < 0) continue;
    let e = cen.get(k);
    if (!e) { e = { rx: x, ry: y, sx: 0, sy: 0, n: 0, R: 1 }; cen.set(k, e); }
    e.sx += tgMod(x - e.rx + P / 2, P) - P / 2; e.sy += tgMod(y - e.ry + P / 2, P) - P / 2; e.n++;
    e.R = Math.max(e.R, dist[y * P + x]);
  }
  cen.forEach(function (e) { e.cx = e.rx + e.sx / e.n; e.cy = e.ry + e.sy / e.n; });
  // §185 WEAVE: each strand's half-length and half-width (its reach from the center along and across the way it runs)
  const woven = layout === "weave" && r.shade > 0;
  if (woven) for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const i = y * P + x, k = id[i];
    if (k < 0) continue;
    const e = cen.get(k), ox = Math.abs(tgMod(x + 0.5 - e.cx + P / 2, P) - P / 2), oy = Math.abs(tgMod(y + 0.5 - e.cy + P / 2, P) - P / 2);
    e.ha = Math.max(e.ha || 0, pax[i] ? oy : ox); e.hc = Math.max(e.hc || 0, pax[i] ? ox : oy);
  }
  // CRACKS: a wandering 1 px line from a point on a piece's rim toward (and past) its middle, in a share of the pieces.
  const cracked = new Uint8Array(N);
  if (r.crack > 0) cen.forEach(function (e, k) {
    if (tgRand(k, 3, seed, 38) >= r.crack || e.R < 2) return;
    let a = tgRand(k, 4, seed, 39) * Math.PI * 2, x = e.cx - Math.cos(a) * e.R * 0.9, y = e.cy - Math.sin(a) * e.R * 0.9;
    const n = Math.round(e.R * 2.2) + 2;
    for (let s = 0; s < n; s++) {
      const i = at(Math.floor(x), Math.floor(y));
      if (id[i] === k && dist[i] >= 1.5) cracked[i] = 1;
      a += (tgRand(k, s, seed, 40) - 0.5) * 1.1;
      x += Math.cos(a); y += Math.sin(a);
    }
  });

  const L = Math.round(r.levels), lv = new Int8Array(N), ms = [2, 4, 8, 16][Math.round(r.mottleSize) - 1];
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const i = y * P + x, k = id[i], d = dist[i];
    let t;
    // chipped edges: the rim gives way to the joint where a noise field says so
    const chipped = k >= 0 && r.chip > 0 && d <= 1.5 && tgNoise(x, y, 4, seed, 31) < r.chip * 0.55;
    if (empty && k === -1) { lv[i] = -1; continue; }                        // empty: the layer below shows
    if (k < 0 || chipped) {
      t = r.jointTone + (tgNoise(x, y, 4, seed, 32) - 0.5) * 0.12;
    } else {
      const e = cen.get(k), hp = tgRand(k, 7, seed, 33);
      t = r.tone + r.pieceVar * (hp - 0.5) * 0.7;
      if (r.mottle > 0) t += r.mottle * (tgFbm(x, y, ms, seed, 34) - 0.5) * 0.9;
      if (r.grain > 0) {
        // streaks along the piece: across-coordinate wobbled by noise, a line every 3 px, each piece its own phase
        const ax = pax ? pax[i] : r.axis >= 0.5, along = ax ? y : x, across = ax ? x : y;
        const q = across + hp * 7 + (tgNoise(along, across, 8, seed, 35 + (k & 7)) - 0.5) * 3;
        if (tgMod(q, 3.2) < 0.9) t -= r.grain * 0.28;
        if (tgRand(x, y, seed, 36) < 0.03 * r.grain) t -= r.grain * 0.25;              // a knot of dark flecks
      }
      if (woven) {
        // a STRAND: round across (lit on its upper or left side, dark on the other), and dark at both ends where it
        // dives under the strands crossing it. Bevel: in hard steps; dome: smoothly.
        const ox = tgMod(x + 0.5 - e.cx + P / 2, P) - P / 2, oy = tgMod(y + 0.5 - e.cy + P / 2, P) - P / 2;
        const a = pax[i] ? oy : ox, c = pax[i] ? ox : oy, u = c / Math.max(0.5, e.hc), v = Math.abs(a) / Math.max(0.5, e.ha);
        let sh = r.shade === 1 ? (u < -0.34 ? 0.3 : u > 0.34 ? -0.3 : 0) : -u * 0.32;
        if (e.ha - Math.abs(a) < r.bevelW) sh -= 0.32;                    // the ends, under the crossing strands
        else if (r.shade === 2) sh -= v * v * 0.12;
        t += r.shadeAmt * sh;
      } else if (r.shade === 1) {
        // BEVEL: within bevelW of the rim, lit where the rim is up or left of us, dark where it is down or right
        if (d <= r.bevelW) {
          const ul = Math.min(dist[at(x - 1, y)], dist[at(x, y - 1)]), dr = Math.min(dist[at(x + 1, y)], dist[at(x, y + 1)]);
          if (ul < d || (ul === d && dr > d)) t += r.shadeAmt * 0.32;
          else if (dr < d) t -= r.shadeAmt * 0.32;
        }
      } else if (r.shade === 2) {
        // DOME: a rounded stone lit from the upper left. The slope follows the edge distance's gradient (inward), so a
        // big stone has rounded rims and a flat top instead of one hard diagonal split; a small one is all slope.
        const w = Math.max(1.5, Math.min(e.R, 2 + r.bevelW * 1.5));
        if (d < w) {
          const gx = dist[at(x + 1, y)] - dist[at(x - 1, y)], gy = dist[at(x, y + 1)] - dist[at(x, y - 1)];
          const gl = Math.sqrt(gx * gx + gy * gy) || 1;
          t += r.shadeAmt * 0.42 * ((gx + gy) / (gl * 1.414)) * (1 - (d - 1) / w);
        }
        let ox = tgMod(x + 0.5 - e.cx + P / 2, P) - P / 2, oy = tgMod(y + 0.5 - e.cy + P / 2, P) - P / 2;
        if (stripes) { if (r.axis >= 0.5) oy = 0; else ox = 0; }          // §198: a course runs all the way round: no middle along it
        else if (layout === "lines" && r.bond >= 0.75) { ox = 0; oy = 0; }        // §44: lines and waves run all the way round too
        else if (layout === "lines" || layout === "waves") { if (r.axis >= 0.5) oy = 0; else ox = 0; }
        t += r.shadeAmt * (-(ox + oy) / (Math.max(2, e.R) * 4)) * 0.2;
      }
      if (r.speckle > 0) {
        const h = tgRand(x, y, seed, 37);
        if (h < r.speckle * 0.07) t -= 0.3; else if (h > 1 - r.speckle * 0.05) t += 0.25;
      }
      if (mid[i]) t += 0.4;
      if (cracked[i]) t = r.jointTone + 0.1;
    }
    const q = t * (L - 1) + (r.dither > 0 ? (TG_BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * r.dither : 0);
    lv[i] = (L - 1) - Math.max(0, Math.min(L - 1, Math.round(q)));           // level 0 = the lightest
  }
  c = { L: L, lv: lv, id: id, dist: dist };
  if (empty && !scatter) {
    // §198: drawn as a BASE (nothing below), blobs and plaid show their joint tone in the empty space
    const bg = new Int8Array(N), patt = Math.round(r.layout) >= 12;          // §44: a pattern's ground is flat (a clean two-tone)
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const q = (r.jointTone + (patt ? 0 : (tgNoise(x, y, 4, seed, 32) - 0.5) * 0.12)) * (L - 1);
      bg[y * P + x] = (L - 1) - Math.max(0, Math.min(L - 1, Math.round(q)));
    }
    c.bg = bg;
  }
  TG_CACHE.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------------------------------------------
// LAYERS: a texture is a STACK. layers[0] is the base (opaque); each layer above is a recipe with its own ramp and a
// SHOW rule saying where it may draw over what is below:
//   0 "on top"            everywhere (a scatter layer's empty space still lets the stack show through)
//   1 "in the gaps"       only where the BASE has joints (moss or sand between stones, grout)
//   2 "in patches"        a noise field, `amount` of the area, creeping in from the base's gaps (moss, rust, snow)
//   3 "on some pieces"    `amount` of the base's pieces (mixed bricks, a checker of two tiles, darker boards)
// A layer may carry `pair` (§198): it is drawn with that layer's seed, so marks laid out alike land on its marks (the
// "tip" mark frosts the tips of a blade layer's very blades).
//   4 "on the edges"      §198: the rims of the base's pieces, `amount` deep (1 to 5 px): a glow along lava's cracks, moss
//                         creeping onto stones, frost on the edges of tiles
const TEXGEN_SHOWS = ["top", "gaps", "patches", "pieces", "edges"];  // APPEND ONLY
// IMPORTED PICTURES (build 8, 2026-11-22; AJ: "import to the library … people can draw their own in their own tools, then
// just import and keep it"). A layer may carry a PICTURE instead of drawing a recipe: `img` { L: its levels (2..32), p: the
// 32 x 32 period as 1024 characters, a level each in base 36 (0 the LIGHTEST) or "." where another layer of the picture
// draws, d: the same at 64 x 64 (4096 characters; optional: without it a 64 px tile doubles each pixel) }. Its `gen` is a
// flat field nobody draws. It shows wherever it has a level ("." lets the layers under it show), so its show rule is "top".
// texGenFromImage makes the layers from a picture's pixels; everything else (the stack, the values, the detail, a box base's
// layers) reads an image layer as it reads a recipe's.
const TG_IMG_RE = /^[0-9a-v.]+$/;
const TG_IMGS = new Map();
function tgImgBuild(img) {
  const P = TG_P, big = P > 32 && img.d, src = big ? img.d : img.p, S = big ? 64 : 32, key = P + "|" + src;
  let c = TG_IMGS.get(key);
  if (c) return c;
  if (TG_IMGS.size >= 64) TG_IMGS.clear();
  const N = P * P, lv = new Int8Array(N), id = new Int32Array(N), dist = new Float32Array(N);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const ch = src.charAt(Math.floor(y * S / P) * S + Math.floor(x * S / P)), i = y * P + x;
    if (ch === ".") { lv[i] = -1; id[i] = -1; } else { lv[i] = parseInt(ch, 36); id[i] = 0; }
  }
  c = { lv: lv, id: id, dist: dist, L: img.L | 0 };
  TG_IMGS.set(key, c);
  return c;
}
// one layer's period: its picture's, or its recipe's
function tgLayerBuild(ly, seed) { return ly.img ? tgImgBuild(ly.img) : tgBuild(ly.gen, seed); }
function tgLayerL(ly) { return ly.img ? ly.img.L | 0 : texGenRecipe(ly.gen).levels | 0; }
// whether layer li's SHOW rule lets it draw at pixel i of the base `base`
function tgShowAt(ly, li, base, i, x, y, seed) {
  const show = ly.show | 0, amt = ly.amount == null ? 0.5 : +ly.amount;
  if (show === 1 && base.id[i] >= 0) return false;
  if (show === 2 && tgFbm(tgMod(x | 0, TG_P), tgMod(y | 0, TG_P), 8, seed + li * 101, 61) - Math.min(base.dist[i], 4) * 0.07 <= 1 - amt * 0.8) return false;
  if (show === 3 && (base.id[i] < 0 || tgRand(base.id[i], li, seed, 62) >= amt)) return false;
  if (show === 4 && (base.id[i] < 0 || base.dist[i] > (0.6 + amt * 4) * TG_P / 32)) return false;
  return true;
}
function texGenStack(layers, x, y, seed) {
  seed = seed | 0;
  const i = tgMod(y | 0, TG_P) * TG_P + tgMod(x | 0, TG_P), base = tgLayerBuild(layers[0], seed);
  for (let li = layers.length - 1; li >= 1; li--) {
    const ly = layers[li];
    if (!ly.img && !tgShowAt(ly, li, base, i, x, y, seed)) continue;
    const c = tgLayerBuild(ly, seed + (ly.pair != null ? ly.pair : li) * 7919), lv = c.lv[i];
    if (lv >= 0) return { layer: li, level: lv, L: c.L };
  }
  const lv0 = base.lv[i];
  // a base with empty space (a Scatter base between its marks) and no ground of its own reads its first step there, never
  // -1 (2026-11-14: -1 made the window's preview read a color at a negative index and stall, and drew a stray index)
  return { layer: 0, level: lv0 < 0 ? (base.bg ? base.bg[i] : 0) : lv0, L: base.L };
}

// ---------------------------------------------------------------------------------------------------------------
// §44 (CrunchyUI, build 6): A BOX BASE. A gradient spans the BOX it fills (a panel, a button), not a period, so it cannot
// be a layout (in a tile it would restart every 32 px). An app that draws box-spanning fills of its own may let a texture
// name one as its base: `box` { kind, bands?, flip? } (the kind is the APP's word, e.g. CrunchyUI's "vramp", "radial";
// this file only keeps it). The app draws the base across its box and asks this file only for the LAYERS over it
// (texGenOverIndex: the index of the layer that draws at a pixel, or -1 where the base shows), so the pattern repeats
// over the gradient. An app that draws no box bases (CrunchyTile) never sees one in its window, and a texture with one
// draws there as its layers over the base layer's recipe (the window makes it a flat field), so it degrades to its
// pattern on a flat ground, never to nothing.
// FADE (a layer's `fade`, -1..1, and `shrink`): along the box base, a layer thins out (marks dropped whole, a field
// dithered away) toward the gradient's END (fade > 0) or its START (fade < 0), or with `shrink` its marks get smaller
// (a halftone). `t` is where the pixel sits along the app's gradient, 0 (its first color) to 1 (its last). Without a box
// base there is no t and a fade does nothing.
function tgFadeS(ly, t) {
  const f = +ly.fade || 0;
  if (!f || t == null) return 1;
  return f > 0 ? 1 - f * t : 1 + f * (1 - t);
}
// a drawn pixel's threshold for thinning: its whole mark's (layouts with empty space: a mark goes whole; an outline goes
// with the mark it rims) or, on a layout that fills the period, an ordered dither
function tgThin(ly, c, i, x, y, seed, li) {
  const lay = TEXGEN_LAYOUTS[Math.round(+ly.gen.layout || 0)];
  if (TG_EMPTY.indexOf(lay) < 0) return (TG_BAYER[(tgMod(y, 4)) * 4 + tgMod(x, 4)] + 0.5) / 16;
  let k = c.id[i];
  if (k < 0) {
    const P = TG_P, X = tgMod(x, P), Y = tgMod(y, P);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = c.id[tgMod(Y + dy, P) * P + tgMod(X + dx, P)]; if (n >= 0) { k = n; break; } }
  }
  return tgRand(k, li, seed, 66);
}
// how deep a pixel sits in its piece, 0 (an outline) to 1 (the piece's deepest point): what a shrinking mark keeps
function tgDepth(c, i) {
  if (!c.pr) {
    const R = new Map(), pr = new Float32Array(c.id.length);
    for (let j = 0; j < c.id.length; j++) if (c.id[j] >= 0) R.set(c.id[j], Math.max(R.get(c.id[j]) || 0, c.dist[j]));
    for (let j = 0; j < c.id.length; j++) pr[j] = c.id[j] >= 0 ? c.dist[j] / (R.get(c.id[j]) || 1) : 0;
    c.pr = pr;
  }
  return c.pr[i];
}
// One period of the LAYERS over a box base: per layer, the level each pixel would draw (-1: empty or not shown there)
// and what its fade reads. texGenBoxPick(bp, layers, x, y, t) then answers a pixel: { layer, level, L }, or null where the
// box base shows. (An app's window passes its working layers; texGenOverIndex keeps one per texture, rev and seed.)
function texGenBoxPeriod(layers, seed) {
  seed = seed | 0;
  const P = TG_P, N = P * P, base = tgLayerBuild(layers[0], seed), out = { L: [], lv: [], thin: [], dep: [] };
  for (let li = 1; li < layers.length; li++) {
    const ly = layers[li], c = tgLayerBuild(ly, seed + (ly.pair != null ? ly.pair : li) * 7919);
    const lv = new Int8Array(N).fill(-1), thin = ly.fade && !ly.shrink ? new Float32Array(N) : null, dep = ly.fade && ly.shrink ? new Float32Array(N) : null;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const i = y * P + x;
      if (c.lv[i] < 0 || (!ly.img && !tgShowAt(ly, li, base, i, x, y, seed))) continue;
      lv[i] = c.lv[i];
      if (thin) thin[i] = tgThin(ly, c, i, x, y, seed, li);
      if (dep) dep[i] = tgDepth(c, i);
    }
    out.L[li] = c.L; out.lv[li] = lv; out.thin[li] = thin; out.dep[li] = dep;
  }
  return out;
}
function texGenBoxPick(bp, layers, x, y, t) {
  const i = tgMod(Math.floor(y), TG_P) * TG_P + tgMod(Math.floor(x), TG_P);
  for (let li = layers.length - 1; li >= 1; li--) {
    const lv = bp.lv[li][i];
    if (lv < 0) continue;
    const ly = layers[li], s = tgFadeS(ly, t);
    if (s < 1 && (s <= 0 || (ly.shrink ? bp.dep[li][i] < 1 - s : bp.thin[li][i] >= s))) continue;
    return { layer: li, level: lv, L: bp.L[li] };
  }
  return null;
}
// a texture value's box base ({ kind, bands?, flip? }), or null (every texture made before build 6, every built-in)
function texGenBox(v) {
  if (typeof v !== "string" || v.charCodeAt(0) !== 116 || v.charCodeAt(1) !== 120) return null;
  const tex = TEXGEN_USER[tgValue(v).id];
  return tex && tex.box ? tex.box : null;
}
// the range the BASE draws on: its own bound range, or the caller's
function texGenBaseRange(v, r0, r1) {
  const rg = tgValue(v).ranges[0];
  return rg ? [rg[0], rg[1]] : [r0, r1];
}
const TG_BOXES = new Map();
function texGenOverIndex(v, x, y, r0, r1, seed, t) {
  const p = tgValue(v), tex = TEXGEN_USER[p.id];
  if (!tex || tex.layers.length < 2) return -1;
  const key = tex.id + "|" + tex.rev + "|" + (seed | 0) + (TG_P === 32 ? "" : "|" + TG_P);
  let bp = TG_BOXES.get(key);
  if (!bp) {
    if (TG_BOXES.size >= 128) TG_BOXES.clear();
    const layers = tex.layers.map(function (ly) { return Object.assign({}, ly, { gen: texGenRecipe(ly.gen) }); });
    bp = { at: texGenBoxPeriod(layers, seed), layers: layers };
    TG_BOXES.set(key, bp);
  }
  const h = texGenBoxPick(bp.at, bp.layers, x, y, t);
  if (!h) return -1;
  const rg = p.ranges[h.layer] || null, a = rg ? rg[0] : r0, b = rg ? rg[1] : r1;
  return h.L > 1 ? Math.round(a + (b - a) * (h.level / (h.L - 1))) : a;
}

// ---------------------------------------------------------------------------------------------------------------
// YOUR TEXTURES. An id is "tx" + 4-16 lowercase letters or digits; a texture keeps a REV that bumps on every change,
// so a drawing cache can never show an edited texture's old picture.
const TEXGEN_USER = {};
const TG_ID_RE = /^tx[0-9a-z]{4,16}$/;
const TEXGEN_NAME_MAX = 40;
function texGenIsId(v) { return typeof v === "string" && TG_ID_RE.test(v); }
function texGenNewId() {
  let s = "tx";
  for (let i = 0; i < 10; i++) s += "0123456789abcdefghijklmnopqrstuvwxyz".charAt(Math.floor(Math.random() * 36));
  return s;
}
// The BASE may carry a ramp too (AJ, 2026-11-05: "the base tile's color ramp as choosable from here"): with none it
// takes the ramp of whatever uses the texture (so it recolors with the design), with one it keeps its own colors.
function tgLayerClean(ly, isBase) {
  const o = { gen: texGenCompact(ly && ly.gen) };
  const im = ly && ly.img;                                                         // build 8: a picture's layer
  if (im && typeof im.p === "string" && im.p.length === 1024 && TG_IMG_RE.test(im.p) && (im.d == null || (typeof im.d === "string" && im.d.length === 4096 && TG_IMG_RE.test(im.d)))) {
    o.img = { L: Math.max(2, Math.min(32, im.L | 0)), p: im.p };
    if (im.d) o.img.d = im.d;
  }
  const ramp = ly && typeof ly.ramp === "string" && ly.ramp ? ly.ramp.slice(0, 80) : null;
  if (isBase && !ramp) return o;
  o.ramp = ramp;
  if (ly && ly.lo != null && isFinite(ly.lo)) o.lo = Math.max(0, Math.min(31, ly.lo | 0));
  if (ly && ly.hi != null && isFinite(ly.hi)) o.hi = Math.max(0, Math.min(31, ly.hi | 0));
  if (isBase) return o;
  o.show = o.img ? 0 : Math.max(0, Math.min(TEXGEN_SHOWS.length - 1, (ly && ly.show) | 0));
  o.amount = ly && ly.amount != null && isFinite(ly.amount) ? Math.max(0, Math.min(1, +ly.amount)) : 0.5;
  if (ly && ly.pair != null && isFinite(ly.pair)) o.pair = Math.max(0, Math.min(TEXGEN_LAYERS - 1, ly.pair | 0));   // §198
  if (ly && ly.fade != null && isFinite(ly.fade) && +ly.fade) {                                                    // §44, only when set
    o.fade = Math.max(-1, Math.min(1, Math.round(+ly.fade * 100) / 100));
    if (ly.shrink) o.shrink = 1;
  }
  return o;
}
// A texture as it may be kept: an id, a name, 1..TEXGEN_LAYERS layers. null when it is not one.
function texGenClean(tex) {
  if (!tex || !texGenIsId(tex.id) || !Array.isArray(tex.layers) || !tex.layers.length) return null;
  const name = String(tex.name == null ? "" : tex.name).trim().slice(0, TEXGEN_NAME_MAX) || "My texture";
  const o = { id: tex.id, name: name, layers: tex.layers.slice(0, TEXGEN_LAYERS).map(function (ly, k) { return tgLayerClean(ly, k === 0); }) };
  if (typeof tex.ramp === "string" && tex.ramp) o.ramp = tex.ramp.slice(0, 80);        // the ramp it was made in (pictures)
  if (tex.imported) o.imported = 1;                                                     // build 8: made from a picture (the person's art, not CC0)
  const bx = tex.box;                                                                   // §44: a box base, the app's word
  if (bx && typeof bx === "object" && typeof bx.kind === "string" && /^[a-z][a-z0-9-]{0,23}$/.test(bx.kind)) {
    o.box = { kind: bx.kind };
    if (bx.bands) o.box.bands = 1;
    if (bx.flip) o.box.flip = 1;
  }
  return o;
}
function texGenAdd(tex) {
  const c = texGenClean(tex);
  if (!c) return null;
  const old = TEXGEN_USER[c.id];
  c.rev = old ? (JSON.stringify([old.layers, old.box]) === JSON.stringify([c.layers, c.box]) ? old.rev : old.rev + 1) : 1;
  TEXGEN_USER[c.id] = c;
  return c;
}
function texGenOf(id) { return TEXGEN_USER[id] || null; }

// A VALUE: "id" or "id@lo-hi,lo-hi,…" (one range per layer, the BASE FIRST; "-" for a layer the app left unbound: the
// base with no ramp of its own, which then takes the caller's r0..r1).
function texGenBind(id, ranges) {
  return id + "@" + ranges.map(function (r) { return r ? (r[0] | 0) + "-" + (r[1] | 0) : "-"; }).join(",");
}
const TG_VALUES = new Map();
function tgValue(v) {
  let p = TG_VALUES.get(v);
  if (p) return p;
  if (TG_VALUES.size >= 512) TG_VALUES.clear();
  const at = v.indexOf("@"), id = at < 0 ? v : v.slice(0, at);
  const ranges = at < 0 ? [] : v.slice(at + 1).split(",").map(function (s) {
    const m = /^(\d+)-(\d+)$/.exec(s);
    return m ? [+m[1], +m[2]] : null;
  });
  p = { id: id, ranges: ranges };
  TG_VALUES.set(v, p);
  return p;
}
function texGenIsValue(v) { return typeof v === "string" && v.charCodeAt(0) === 116 && v.charCodeAt(1) === 120 && TG_ID_RE.test(tgValue(v).id); }
// One period of a texture's (layer, level) per pixel, kept per (value's id, rev, seed).
const TG_STACKS = new Map();
function tgPeriod(tex, seed) {
  const key = tex.id + "|" + tex.rev + "|" + (seed | 0) + (TG_P === 32 ? "" : "|" + TG_P);
  let c = TG_STACKS.get(key);
  if (c) return c;
  if (TG_STACKS.size >= 256) TG_STACKS.clear();
  const n = TG_P * TG_P, layer = new Int8Array(n), level = new Int8Array(n), Ls = [];
  for (let y = 0; y < TG_P; y++) for (let x = 0; x < TG_P; x++) {
    const h = texGenStack(tex.layers, x, y, seed);
    layer[y * TG_P + x] = h.layer; level[y * TG_P + x] = h.level; Ls[h.layer] = h.L;
  }
  c = { layer: layer, level: level, L: tex.layers.map(tgLayerL) };
  TG_STACKS.set(key, c);
  return c;
}
function texGenLevelsValue(v) {
  const tex = TEXGEN_USER[tgValue(v).id];
  return tex ? tgLayerL(tex.layers[0]) : 1;
}
function texGenIndexValue(v, x, y, r0, r1, seed) {
  const p = tgValue(v), tex = TEXGEN_USER[p.id];
  if (!tex) return r0;
  const c = tgPeriod(tex, seed), i = tgMod(Math.floor(y), TG_P) * TG_P + tgMod(Math.floor(x), TG_P);
  const li = c.layer[i], L = c.L[li], lv = c.level[i], rg = p.ranges[li] || null;
  const a = rg ? rg[0] : r0, b = rg ? rg[1] : r1;
  return L > 1 ? Math.round(a + (b - a) * (lv / (L - 1))) : a;
}
// The level on the BASE's scale (what a caller that has no ramps, like an object's surface, reads).
function texGenLevelValue(v, x, y, seed) {
  const tex = TEXGEN_USER[tgValue(v).id];
  if (!tex) return 0;
  const c = tgPeriod(tex, seed), i = tgMod(Math.floor(y), TG_P) * TG_P + tgMod(Math.floor(x), TG_P);
  const L = c.L[c.layer[i]], L0 = c.L[0];
  return L > 1 ? Math.round((c.level[i] / (L - 1)) * (L0 - 1)) : 0;
}

// A PICTURE AS A TEXTURE (build 8): rgba (w x h, 4 bytes a pixel) -> { layers, size, note }. The picture's middle square,
// taken pixel for pixel at 32 x 32 (a bigger picture at 64 x 64 too, its 32 x 32 the commonest of each 2 x 2), never
// smoothed; see-through pixels take its commonest color. opts.mode:
//   "palette" (default): ONE layer, its lights and darks in opts.levels (2..6) steps, lightest 0, with no ramp of its own:
//     it takes the palette of whatever uses it, as every texture's base does.
//   "colors": each pixel the NEAREST color of the app's ramps (opts.ramps: [{ value, colors: light to dark }]); the (at most
//     four) ramps that cover the most pixels become the layers, the commonest the base, the rest's pixels moved to the
//     nearest of those; each layer its ramp's every step (lo 0, hi n - 1), so the picture comes back in exactly those colors.
function texGenFromImage(rgba, w, h, opts) {
  opts = opts || {};
  const S0 = Math.min(w, h), S = S0 >= 64 && opts.size !== 32 ? 64 : 32, x0 = (w - S0) >> 1, y0 = (h - S0) >> 1, N = S * S;
  const rgb = new Array(N), seen = new Map();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = x0 + Math.floor((x + 0.5) * S0 / S), sy = y0 + Math.floor((y + 0.5) * S0 / S), q = (sy * w + sx) * 4;
    if (rgba[q + 3] < 128) { rgb[y * S + x] = null; continue; }
    const c = [rgba[q], rgba[q + 1], rgba[q + 2]], k = (c[0] << 16) | (c[1] << 8) | c[2];
    rgb[y * S + x] = c; seen.set(k, (seen.get(k) || 0) + 1);
  }
  let most = [128, 128, 128], mc = -1;
  seen.forEach(function (n, k) { if (n > mc) { mc = n; most = [(k >> 16) & 255, (k >> 8) & 255, k & 255]; } });
  for (let i = 0; i < N; i++) if (!rgb[i]) rgb[i] = most;
  const lum = function (c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; };
  const ch = function (v) { return v < 0 ? "." : v.toString(36); };
  // a per-pixel (layer, level) at S x S -> the layer's characters at 32 and (S = 64) at 64
  const encode = function (layerOf, levelOf, nLayers) {
    const out = [];
    for (let li = 0; li < nLayers; li++) {
      let p = "", d = null;
      if (S === 64) {
        d = "";
        for (let i = 0; i < N; i++) d += layerOf[i] === li ? ch(levelOf[i]) : ".";
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
          const votes = new Map();
          let best = null, bn = 0;
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const i = (y * 2 + dy) * 64 + x * 2 + dx, key = layerOf[i] + ":" + levelOf[i], n = (votes.get(key) || 0) + 1;
            votes.set(key, n);
            if (n > bn) { bn = n; best = i; }
          }
          p += layerOf[best] === li ? ch(levelOf[best]) : ".";
        }
      } else for (let i = 0; i < N; i++) p += layerOf[i] === li ? ch(levelOf[i]) : ".";
      out.push({ p: p, d: d });
    }
    return out;
  };
  const flat = function (L) { return texGenRecipe({ layout: 0, levels: Math.max(3, Math.min(6, L)), mottle: 0, tone: 0.5 }); };
  if (opts.mode === "colors" && opts.ramps && opts.ramps.length) {
    const R = opts.ramps.filter(function (r) { return r && r.colors && r.colors.length >= 2; }).map(function (r) {
      return { value: r.value, cols: r.colors.map(function (hx) { const n = parseInt(String(hx).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }) };
    });
    const dist = function (a, b) { return (a[0] - b[0]) * (a[0] - b[0]) * 3 + (a[1] - b[1]) * (a[1] - b[1]) * 4 + (a[2] - b[2]) * (a[2] - b[2]) * 2; };
    const nearest = function (c, among) {
      let best = [0, 0], bd = Infinity;
      for (const ri of among) R[ri].cols.forEach(function (rc, t) { const dd = dist(c, rc); if (dd < bd) { bd = dd; best = [ri, t]; } });
      return best;
    };
    const all = R.map(function (_, i) { return i; }), memo = new Map(), at = new Array(N), count = new Array(R.length).fill(0);
    for (let i = 0; i < N; i++) {
      const k = (rgb[i][0] << 16) | (rgb[i][1] << 8) | rgb[i][2];
      let m = memo.get(k);
      if (!m) { m = nearest(rgb[i], all); memo.set(k, m); }
      at[i] = m; count[m[0]]++;
    }
    const chosen = all.filter(function (i) { return count[i] > 0; }).sort(function (a, b) { return count[b] - count[a]; }).slice(0, TEXGEN_LAYERS);
    const memo2 = new Map(), layerOf = new Int8Array(N), levelOf = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      let m = at[i];
      if (chosen.indexOf(m[0]) < 0) {
        const k = (rgb[i][0] << 16) | (rgb[i][1] << 8) | rgb[i][2];
        m = memo2.get(k);
        if (!m) { m = nearest(rgb[i], chosen); memo2.set(k, m); }
      }
      layerOf[i] = chosen.indexOf(m[0]); levelOf[i] = m[1];
    }
    // the base must cover every pixel: under the other layers it reads the picture's light on its own ramp
    const b = R[chosen[0]], bl = b.cols.map(lum), baseLevel = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      if (layerOf[i] === 0) { baseLevel[i] = levelOf[i]; continue; }
      const l = lum(rgb[i]);
      let t = 0, bd = Infinity;
      bl.forEach(function (v, j) { if (Math.abs(v - l) < bd) { bd = Math.abs(v - l); t = j; } });
      baseLevel[i] = t;
    }
    const enc = encode(layerOf, levelOf, chosen.length), base = encode(new Int8Array(N), baseLevel, 1)[0];
    const layers = chosen.map(function (ri, li) {
      const e = li ? enc[li] : base, n = R[ri].cols.length, img = { L: n, p: e.p };
      if (e.d) img.d = e.d;
      const ly = { gen: flat(n), img: img, ramp: R[ri].value, lo: 0, hi: n - 1 };
      if (li) { ly.show = 0; ly.amount = 0.5; }
      return ly;
    });
    return { layers: layers, size: S, note: "In " + layers.length + (layers.length > 1 ? " of the palettes" : " palette") + ", each pixel its nearest color" };
  }
  const n = Math.max(2, Math.min(6, opts.levels | 0 || 5)), ls = rgb.map(lum);
  let lo = Infinity, hi = -Infinity;
  ls.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; });
  const levelOf = new Int8Array(N);
  for (let i = 0; i < N; i++) levelOf[i] = hi > lo ? Math.round((hi - ls[i]) / (hi - lo) * (n - 1)) : 0;
  const e = encode(new Int8Array(N), levelOf, 1)[0], img = { L: n, p: e.p };
  if (e.d) img.d = e.d;
  return { layers: [{ gen: flat(n), img: img }], size: S, note: "Its lights and darks in " + n + " steps of whatever palette uses it" };
}

// ---------------------------------------------------------------------------------------------------------------
// PLANTED: crunchy/textures/<slug>/<slug>.crunchy, { tex: { id, name, layers, ramp? } }. No other files (yet): the
// texture is a recipe; each app draws it in its own colors. A save finds the texture BY ID, so a rename keeps its folder.
const TEXGEN_APP = {
  id: "crunchytextures", name: "Textures", suite: "textures",
  kinds: { texture: { dir: "textures", label: "Textures" } },
  valid: function (kind, d) { return kind === "texture" && !!texGenClean(d.tex); },
};
async function texGenSave(P, tex) {
  const M = await plantOpenAs(P, TEXGEN_APP), t = texGenClean(tex);
  if (!t) throw new Error("That is not a texture.");
  const was = M.assets.find(function (a) { return a.data && a.data.tex && a.data.tex.id === t.id; });
  const other = plantFind(M, "texture", t.name);
  if (was && was.name !== t.name) {
    if (other && other !== was) throw new Error("Another texture is already called “" + t.name + "”.");
    await plantRename(M, was, t.name);
  } else if (!was && other) t.name = plantFreeName(M, "texture", t.name);      // a new one never takes another's folder
  return plantPut(M, { kind: "texture", name: t.name, fields: { tex: t }, files: [], appVersion: String(TEXGEN_BUILD) });
}
// Every texture planted in the game: [{ slug, name, tex, asset }], by name; damaged ones are left out.
async function texGenList(P) {
  const M = await plantOpenAs(P, TEXGEN_APP);
  return M.assets.map(function (a) {
    const t = texGenClean(a.data && a.data.tex);
    if (!t) return null;
    t.name = a.name;
    return { slug: a.slug, name: a.name, tex: t, asset: a };
  }).filter(Boolean).sort(function (a, b) { return a.name.localeCompare(b.name); });
}
async function texGenPlantedDelete(P, slug) {
  const M = await plantOpenAs(P, TEXGEN_APP), a = M.assets.find(function (x) { return x.slug === slug; });
  if (a) await plantDelete(M, a);
  return !!a;
}

// ---------------------------------------------------------------------------------------------------------------
// BUILT-IN TEXTURES FROM RECIPES (texgen.js 2, CrunchyTile §176, AJ 2026-11-06: show off the detailed textures, not
// "noise designed to represent something through imagination"). textures.js lists these NAMES in TEXTURES (appended) and
// draws them here, in ONE ramp (no layer has a ramp of its own: every layer is drawn on the caller's range), at 32 px
// or, through textureIndexDetail, at 64. APPEND ONLY; a recipe never changes once shipped (designs store the name).
const TEXGEN_BUILTINS = {
  grass: [
    { gen: { layout: 0, mottle: 0.7, mottleSize: 3, speckle: 0.2, tone: 0.5, levels: 5, dither: 0.35 } },
    { gen: { layout: 3, mark: 3, count: 25, jitter: 1, stagger: 1, markSize: 1.4, sizeVar: 0.6, mortar: 0, tone: 0.0, levels: 3 } },
    { gen: { layout: 3, mark: 3, count: 12, jitter: 1, markSize: 1.2, sizeVar: 0.5, mortar: 0, tone: 1, levels: 3 } },
  ],
  moss: [
    { gen: { layout: 2, count: 36, jitter: 1, sizeVar: 0.7, mortar: 0.7, jointTone: 0.2, shade: 2, shadeAmt: 0.8, pieceVar: 0.35, speckle: 0.35, tone: 0.55, levels: 5 } },
  ],
  soil: [
    { gen: { layout: 0, mottle: 0.8, mottleSize: 2, speckle: 0.45, tone: 0.45, levels: 5, dither: 0.4 } },
    { gen: { layout: 3, mark: 1, count: 9, jitter: 1, markSize: 1.3, sizeVar: 0.7, mortar: 1, jointTone: 0, shade: 2, shadeAmt: 1, tone: 0.75, levels: 4 } },
  ],
  "leaf litter": [
    { gen: { layout: 0, mottle: 0.7, mottleSize: 2, speckle: 0.3, tone: 0.3, levels: 4, dither: 0.4 } },
    { gen: { layout: 3, mark: 4, count: 25, jitter: 1, markSize: 2.2, sizeVar: 0.5, mortar: 1, jointTone: 0, pieceVar: 0.9, tone: 0.6, levels: 4 } },
    { gen: { layout: 3, mark: 4, count: 9, jitter: 1, markSize: 2, sizeVar: 0.5, mortar: 1, jointTone: 0, pieceVar: 0.6, tone: 0.85, levels: 4 } },
  ],
  flagstones: [
    { gen: { layout: 2, count: 9, jitter: 0.9, mortar: 1.4, shade: 1, shadeAmt: 0.6, mottle: 0.35, crack: 0.35, chip: 0.25, pieceVar: 0.35, tone: 0.6, levels: 5 } },
  ],
  blockwork: [
    { gen: { layout: 1, rows: 4, courseVar: 0.6, len: 12, lenVar: 0.8, bond: 0.5, bondVar: 0.6, mortar: 1, shade: 1, shadeAmt: 0.65, chip: 0.3, crack: 0.15, pieceVar: 0.4, mottle: 0.2, tone: 0.6, levels: 5 } },
  ],
  rockface: [
    { gen: { layout: 2, count: 12, jitter: 1, sizeVar: 0.9, mortar: 1, shade: 2, shadeAmt: 0.8, bevelW: 2, crack: 0.4, chip: 0.3, pieceVar: 0.45, mottle: 0.25, tone: 0.55, levels: 5 } },
  ],
  boards: [
    { gen: { layout: 1, rows: 4, len: 24, lenVar: 0.6, bond: 0.37, bondVar: 0.5, mortar: 1, grain: 0.7, pieceVar: 0.5, shade: 1, shadeAmt: 0.35, tone: 0.6, levels: 5 } },
  ],
  // §180 (CrunchyTile, AJ 2026-11-06: "some stone with grass peeking out, or flowers"): LAYERED, an upper layer in a ramp of
  // its own (flowers stay pink on any grass); the base in the caller's. An app binds those ramps into its palette
  // (CrunchyTile texBindResult); unbound, every layer draws on the caller's range.
  wildflowers: [
    { gen: { layout: 0, mottle: 0.7, mottleSize: 3, speckle: 0.2, tone: 0.5, levels: 5, dither: 0.35 } },
    { gen: { layout: 3, mark: 3, count: 25, jitter: 1, stagger: 1, markSize: 1.4, sizeVar: 0.6, mortar: 0, tone: 0.0, levels: 3 } },
    { gen: { layout: 3, mark: 2, count: 4, jitter: 1, markSize: 1.7, sizeVar: 0.4, mortar: 1, jointTone: 0.25, tone: 0.55, levels: 3 }, ramp: "Bubblegum", hi: 5 },
    { gen: { layout: 3, mark: 0, count: 6, jitter: 1, markSize: 1.1, mortar: 0, tone: 0.6, levels: 3 }, ramp: "Flower Power", hi: 4 },
  ],
  "mossy cobbles": [
    { gen: { layout: 2, count: 16, jitter: 0.7, mortar: 1.8, sizeVar: 0.3, shade: 2, shadeAmt: 0.8, pieceVar: 0.4, speckle: 0.2, tone: 0.55, levels: 5 } },
    { gen: { layout: 0, mottle: 1, mottleSize: 1, tone: 0.45, levels: 4 }, ramp: "Fernery", lo: 1, hi: 4, show: 1 },
  ],
  "grassy flagstones": [
    { gen: { layout: 2, count: 9, jitter: 0.9, mortar: 2, shade: 1, shadeAmt: 0.6, mottle: 0.35, crack: 0.35, chip: 0.25, pieceVar: 0.35, tone: 0.6, levels: 5 } },
    { gen: { layout: 0, mottle: 1, mottleSize: 1, speckle: 0.3, tone: 0.4, levels: 4, dither: 0.5 }, ramp: "Meadow", show: 1 },
    { gen: { layout: 3, mark: 3, count: 9, jitter: 1, markSize: 1.3, sizeVar: 0.5, mortar: 0, tone: 0.3, levels: 3 }, ramp: "Meadow", hi: 4, show: 0 },
  ],
  "snowy cobbles": [
    { gen: { layout: 2, count: 16, jitter: 0.7, mortar: 1.3, sizeVar: 0.3, shade: 2, shadeAmt: 0.8, pieceVar: 0.4, speckle: 0.2, tone: 0.55, levels: 5 } },
    { gen: { layout: 0, mottle: 0.5, mottleSize: 2, tone: 0.75, levels: 3, dither: 0.6 }, ramp: "Hoarfrost", hi: 4, show: 1 },
    { gen: { layout: 0, mottle: 0.6, mottleSize: 2, tone: 0.85, levels: 3, dither: 0.6, shade: 1, shadeAmt: 0.5 }, ramp: "Hoarfrost", hi: 3, show: 3, amount: 0.1 },
  ],
  "mossy blockwork": [
    { gen: { layout: 1, rows: 4, courseVar: 0.6, len: 12, lenVar: 0.8, bond: 0.5, bondVar: 0.6, mortar: 1.6, shade: 1, shadeAmt: 0.65, chip: 0.3, crack: 0.15, pieceVar: 0.4, mottle: 0.2, tone: 0.6, levels: 5 } },
    { gen: { layout: 0, mottle: 1, mottleSize: 1, speckle: 0.3, tone: 0.4, levels: 4 }, ramp: "Jungle", lo: 1, hi: 4, show: 1 },
    { gen: { layout: 3, mark: 3, count: 9, jitter: 1, markSize: 1.6, sizeVar: 0.5, mortar: 0, tone: 0.35, levels: 3 }, ramp: "Jungle", lo: 1, hi: 4, show: 0 },
  ],
  // §181 (AJ, 2026-11-06: "we should do a few more"): three more
  "autumn grass": [
    { gen: { layout: 0, mottle: 0.7, mottleSize: 3, speckle: 0.2, tone: 0.5, levels: 5, dither: 0.35 } },
    { gen: { layout: 3, mark: 3, count: 16, jitter: 1, stagger: 1, markSize: 1.4, sizeVar: 0.6, mortar: 0, tone: 0.0, levels: 3 } },
    { gen: { layout: 3, mark: 4, count: 4, jitter: 1, markSize: 2, sizeVar: 0.5, mortar: 1, jointTone: 0, pieceVar: 0.9, tone: 0.55, levels: 4 }, ramp: "Ember", hi: 2 },
    { gen: { layout: 3, mark: 4, count: 4, jitter: 1, markSize: 1.8, sizeVar: 0.5, mortar: 1, jointTone: 0, pieceVar: 0.6, tone: 0.5, levels: 4 }, ramp: "Gold", lo: 1, hi: 4 },
  ],
  daisies: [
    { gen: { layout: 0, mottle: 0.7, mottleSize: 3, speckle: 0.2, tone: 0.5, levels: 5, dither: 0.35 } },
    { gen: { layout: 3, mark: 3, count: 25, jitter: 1, stagger: 1, markSize: 1.4, sizeVar: 0.6, mortar: 0, tone: 0.0, levels: 3 } },
    { gen: { layout: 3, mark: 2, count: 6, jitter: 1, markSize: 1.6, sizeVar: 0.3, mortar: 1, jointTone: 0.35, tone: 0.2, levels: 3 }, ramp: "Ash", hi: 2 },
    { gen: { layout: 3, mark: 0, count: 4, jitter: 1, markSize: 1.1, mortar: 0, tone: 0.5, levels: 3 }, ramp: "Flower Power", hi: 4 },
  ],
  "pebbled sand": [
    { gen: { layout: 0, mottle: 0.6, mottleSize: 3, speckle: 0.5, tone: 0.6, dither: 0.8, levels: 4 } },
    { gen: { layout: 3, mark: 1, count: 4, jitter: 1, markSize: 1.7, sizeVar: 0.7, mortar: 1, jointTone: 0.1, shade: 2, shadeAmt: 1, tone: 0.55, levels: 4 }, ramp: "Ash", lo: 1, hi: 5 },
  ],
  "sand and shells": [
    { gen: { layout: 0, mottle: 0.6, mottleSize: 3, speckle: 0.5, tone: 0.6, dither: 0.8, levels: 4 } },
    { gen: { layout: 3, mark: 1, count: 4, jitter: 1, markSize: 1.8, mortar: 1, jointTone: 0.4, shade: 2, shadeAmt: 1, tone: 0.6, levels: 3 }, ramp: "Bubblegum", hi: 4 },
  ],
  // §185 (CrunchyTile, texgen.js 4): one for each new layout, in the caller's one ramp
  herringbone: [
    { gen: { layout: 4, rows: 4, len: 16, mortar: 1, jointTone: 0.1, shade: 1, shadeAmt: 0.6, pieceVar: 0.35, speckle: 0.25, chip: 0.25, tone: 0.5, levels: 5 } },
  ],
  "herringbone parquet": [
    { gen: { layout: 4, rows: 8, len: 16, mortar: 1, grain: 0.35, shade: 1, shadeAmt: 0.3, pieceVar: 0.3, tone: 0.6, levels: 5 } },
  ],
  "fish scales": [
    { gen: { layout: 5, rows: 4, len: 16, mortar: 1, shade: 2, shadeAmt: 0.7, pieceVar: 0.2, tone: 0.55, levels: 5 } },
  ],
  "hex tiles": [
    { gen: { layout: 6, len: 16, mortar: 1, jointTone: 0.1, shade: 1, shadeAmt: 0.6, pieceVar: 0.3, speckle: 0.2, crack: 0.25, chip: 0.15, tone: 0.52, levels: 5 } },
  ],
  wicker: [
    { gen: { layout: 7, rows: 4, len: 8, bond: 0.5, mortar: 1, jointTone: 0.05, shade: 1, shadeAmt: 0.8, pieceVar: 0.1, grain: 0.2, tone: 0.6, levels: 5 } },
  ],
  "woven mat": [
    { gen: { layout: 7, rows: 8, len: 8, bond: 0, mortar: 1, jointTone: 0.1, shade: 1, shadeAmt: 0.5, pieceVar: 0.2, tone: 0.65, levels: 5 } },
  ],
  // §198 (CrunchyTile 1.4, texgen.js 5; AJ, 2026-11-12: "more grass variety, maybe some fabric? … anything missing?"): five
  // grasses, five fabrics, five staples. Layered where it reads better, the upper layers in ramps of their own; the base in
  // the caller's. They use build 5's marks (blade, clover, frond, rosette), layouts (stripes, blobs, plaid, knit) and the
  // "edges" show rule.
  "worn grass": [
    { gen: { layout: 0, mottle: 0.45, mottleSize: 2, speckle: 0.15, tone: 0.5, levels: 5, dither: 0.5 } },
    { gen: { layout: 9, count: 9, jitter: 1, sizeVar: 0.8, markSize: 1.6, bondVar: 0.9, mortar: 0, speckle: 0.3, tone: 0.4, levels: 3 }, ramp: "Oak", lo: 1, hi: 3 },
    { gen: { layout: 3, mark: 3, count: 36, jitter: 1, markSize: 1.3, sizeVar: 0.6, mortar: 0, tone: 0, levels: 3 } },
  ],
  "dry grass": [
    { gen: { layout: 0, mottle: 0.6, mottleSize: 2, speckle: 0.3, tone: 0.55, levels: 5, dither: 0.5 } },
    { gen: { layout: 3, mark: 6, count: 36, jitter: 1, stagger: 1, markSize: 1.5, sizeVar: 0.6, mortar: 0, tone: 0.15, levels: 4 } },
    { gen: { layout: 3, mark: 6, count: 25, jitter: 1, markSize: 1.5, sizeVar: 0.5, mortar: 0, tone: 0.75, levels: 4 } },
    { gen: { layout: 3, mark: 6, count: 9, jitter: 1, markSize: 1.1, sizeVar: 0.5, mortar: 0, tone: 1, levels: 4 } },
  ],
  clover: [
    { gen: { layout: 0, mottle: 0.7, mottleSize: 3, speckle: 0.2, tone: 0.5, levels: 5, dither: 0.35 } },
    { gen: { layout: 3, mark: 7, count: 36, jitter: 1, stagger: 1, markSize: 1.6, sizeVar: 0.4, mortar: 1, jointTone: 0.05, pieceVar: 0.4, tone: 0.75, levels: 4 } },
    { gen: { layout: 3, mark: 0, count: 5, jitter: 1, markSize: 2, mortar: 1, jointTone: 0.3, shade: 2, shadeAmt: 1, tone: 0.75, levels: 3 }, ramp: "Bubblegum", lo: 0, hi: 2 },
  ],
  "frosty grass": [
    { gen: { layout: 0, mottle: 0.45, mottleSize: 2, speckle: 0.15, tone: 0.4, levels: 5, dither: 0.5 } },
    { gen: { layout: 3, mark: 3, count: 9, jitter: 1, markSize: 1.4, sizeVar: 0.6, mortar: 0, tone: 0.6, levels: 3 }, ramp: "Glacier", lo: 0, hi: 3 },
    { gen: { layout: 3, mark: 6, count: 49, jitter: 1, markSize: 1.1, sizeVar: 0.6, mortar: 0, tone: 0.15, levels: 4 } },
    { gen: { layout: 3, mark: 10, count: 49, jitter: 1, markSize: 1.1, sizeVar: 0.6, mortar: 0, tone: 0.5, levels: 3 }, ramp: "Glacier", lo: 0, hi: 3, pair: 2 },
  ],
  ferns: [
    { gen: { layout: 0, mottle: 0.8, mottleSize: 2, speckle: 0.4, tone: 0.25, levels: 4, dither: 0.4 } },
    { gen: { layout: 3, mark: 8, count: 9, jitter: 0.9, markSize: 2, sizeVar: 0.4, mortar: 1, jointTone: 0, pieceVar: 0.5, tone: 0.45, levels: 4 }, ramp: "Fernery", lo: 2, hi: 6 },
    { gen: { layout: 3, mark: 8, count: 4, jitter: 0.9, markSize: 2.6, sizeVar: 0.4, mortar: 1, jointTone: 0, pieceVar: 0.5, tone: 0.65, levels: 4 }, ramp: "Fernery", lo: 1, hi: 5 },
  ],
  tartan: [
    { gen: { layout: 0, mottle: 0.15, mottleSize: 1, tone: 0.55, levels: 4 } },
    { gen: { layout: 10, rows: 2, len: 5, bond: 1, stagger: 0, tone: 0.5, levels: 3 }, ramp: "Sapphire", lo: 4, hi: 5 },
    { gen: { layout: 10, rows: 2, len: 2, bond: 1, stagger: 0.5, tone: 0.5, levels: 3 }, ramp: "Emerald", lo: 3, hi: 5 },
    { gen: { layout: 10, rows: 2, len: 1, bond: 1, stagger: 0.75, tone: 0.5, levels: 3 }, ramp: "Gold", lo: 1, hi: 2 },
  ],
  patchwork: [
    { gen: { layout: 1, rows: 4, len: 8, bond: 0, mortar: 1, jointTone: 0.05, shade: 1, shadeAmt: 0.3, pieceVar: 0.6, mottle: 0.15, mottleSize: 1, tone: 0.55, levels: 5 } },
    { gen: { layout: 1, rows: 4, len: 8, bond: 0, mortar: 1, jointTone: 0.05, shade: 1, shadeAmt: 0.3, pieceVar: 0.4, mottle: 0.15, mottleSize: 1, tone: 0.55, levels: 4 }, ramp: "Sapphire", lo: 2, hi: 5, show: 3, amount: 0.35 },
    { gen: { layout: 10, rows: 8, len: 2, bond: 0.5, tone: 0.5, levels: 3 }, ramp: "Fernery", lo: 2, hi: 3, show: 3, amount: 0.3 },
    { gen: { layout: 10, rows: 4, len: 1, bond: 0.5, tone: 0.5, levels: 3 }, ramp: "Parchment", lo: 0, hi: 1, show: 1 },
  ],
  burlap: [
    { gen: { layout: 7, rows: 16, len: 2, bond: 0.5, mortar: 0, shade: 1, shadeAmt: 0.7, pieceVar: 0.5, mottle: 0.4, mottleSize: 2, speckle: 0.3, tone: 0.6, levels: 5 } },
  ],
  knit: [
    { gen: { layout: 11, rows: 8, len: 8, bond: 0.5, mortar: 1, jointTone: 0.05, shade: 1, shadeAmt: 0.8, pieceVar: 0.05, tone: 0.6, levels: 5 } },
  ],
  "ornate carpet": [
    { gen: { layout: 0, mottle: 0.25, mottleSize: 1, speckle: 0.2, tone: 0.5, levels: 4, dither: 0.5 } },
    { gen: { layout: 10, rows: 2, len: 1, axis: 1, bond: 0, stagger: 0.5, tone: 0.6, levels: 3 }, ramp: "Gold", lo: 1, hi: 4 },
    { gen: { layout: 3, mark: 9, count: 4, jitter: 0, markSize: 2.2, mortar: 1, jointTone: 0.1, tone: 0.6, levels: 3 }, ramp: "Gold", lo: 1, hi: 5 },
  ],
  farmland: [
    { gen: { layout: 8, rows: 4, len: 16, courseVar: 0.2, lenVar: 0.15, mortar: 2, jointTone: 0, shade: 2, shadeAmt: 1, bevelW: 2, mottle: 0.35, mottleSize: 1, speckle: 0.5, tone: 0.55, levels: 5, dither: 0.3 } },
    { gen: { layout: 3, mark: 3, count: 16, jitter: 0.2, markSize: 1.2, mortar: 0, tone: 0.4, levels: 3 }, ramp: "Meadow", lo: 2, hi: 5 },
  ],
  "cracked earth": [
    { gen: { layout: 2, count: 12, jitter: 1, sizeVar: 0.4, mortar: 1.3, jointTone: 0, shade: 1, shadeAmt: 0.5, mottle: 0.3, mottleSize: 2, speckle: 0.3, crack: 0.3, chip: 0.35, pieceVar: 0.3, tone: 0.6, levels: 5 } },
  ],
  "cooling lava": [
    { gen: { layout: 2, count: 9, jitter: 1, sizeVar: 0.7, mortar: 1.1, jointTone: 0, shade: 2, shadeAmt: 0.6, bevelW: 2, mottle: 0.35, speckle: 0.3, crack: 0.3, pieceVar: 0.25, tone: 0.35, levels: 5 } },
    { gen: { layout: 0, mottle: 0.6, mottleSize: 1, tone: 0.7, levels: 3 }, ramp: "Inferno", lo: 1, hi: 3, show: 1 },
    { gen: { layout: 0, mottle: 0.5, mottleSize: 1, tone: 0.5, levels: 2, dither: 0.6 }, ramp: "Inferno", lo: 4, hi: 5, show: 4, amount: 0.1 },
  ],
  thatch: [
    { gen: { layout: 8, rows: 4, len: 16, courseVar: 0.25, lenVar: 0.7, bond: 1, mortar: 1, jointTone: 0, shade: 1, shadeAmt: 0.7, bevelW: 2, grain: 0.8, pieceVar: 0.2, mottle: 0.2, tone: 0.6, levels: 5 } },
  ],
  "cracked ice": [
    { gen: { layout: 2, count: 5, jitter: 1, sizeVar: 0.6, mortar: 0.6, jointTone: 1, shade: 1, shadeAmt: 0.5, mottle: 0.2, mottleSize: 4, pieceVar: 0.25, tone: 0.5, levels: 5 } },
    { gen: { layout: 9, count: 4, jitter: 1, sizeVar: 0.8, markSize: 1.3, bondVar: 1, mortar: 0, tone: 0.9, levels: 3 }, ramp: "Hoarfrost", lo: 0, hi: 2 },
    { gen: { layout: 3, mark: 5, count: 4, jitter: 1, markSize: 1, mortar: 0, tone: 1, levels: 3 }, ramp: "Hoarfrost", lo: 0, hi: 1 },
  ],
  // build 7 (CrunchyCharacter §236, Grout's CLOTH-TEXTURES-HANDOFF.md §5): CLOTH AND HIDES, for a character's 3D surfaces
  // (crunchyCore texture-cloth.js wears them as LAB textures, in the slot's one ramp). EVERY LAYER IN THE CALLER'S RAMP (no
  // ramp of their own): a plaid top stays the top's red. Appended; no app lists them until it opts in.
  denim: [
    { gen: { layout: 7, rows: 16, len: 4, bond: 1, mortar: 0, shade: 1, shadeAmt: 0.6, pieceVar: 0.15, mottle: 0.3, mottleSize: 3, speckle: 0.2, tone: 0.55, levels: 5 } },
  ],
  canvas: [
    { gen: { layout: 7, rows: 16, len: 2, bond: 0.5, mortar: 0, shade: 1, shadeAmt: 0.5, pieceVar: 0.1, tone: 0.55, levels: 5 } },
  ],
  linen: [
    { gen: { layout: 0, grain: 0.5, speckle: 0.4, mottle: 0.3, mottleSize: 2, tone: 0.55, levels: 5 } },
  ],
  corduroy: [
    { gen: { layout: 8, rows: 8, axis: 1, mortar: 1, jointTone: 0.15, shade: 2, shadeAmt: 1, tone: 0.55, levels: 5 } },
  ],
  plaid: [
    { gen: { layout: 0, mottle: 0.15, mottleSize: 1, tone: 0.55, levels: 5 } },
    { gen: { layout: 10, rows: 2, len: 8, bond: 1, stagger: 0, tone: 0.15, levels: 5 } },
    { gen: { layout: 10, rows: 2, len: 2, bond: 1, stagger: 0.5, tone: 0.3, levels: 5 } },
    { gen: { layout: 10, rows: 2, len: 2, bond: 0, stagger: 0.75, tone: 0.95, levels: 5 } },
  ],
  gingham: [
    { gen: { layout: 10, rows: 4, len: 4, bond: 0.5, tone: 0.2, jointTone: 0.8, levels: 5 } },
  ],
  pinstripe: [
    { gen: { layout: 0, speckle: 0.4, tone: 0.45, levels: 5 } },
    { gen: { layout: 13, rows: 4, len: 2, axis: 1, tone: 0.9, levels: 5 } },
  ],
  quilted: [
    { gen: { layout: 10, rows: 2, len: 15, axis: 1, bond: 0, shade: 2, shadeAmt: 1, bevelW: 3, tone: 0.55, levels: 5 } },
    { gen: { layout: 10, rows: 2, len: 2, axis: 1, bond: 0, stagger: 0.95, tone: 0.15, levels: 5 } },
  ],
  suede: [
    { gen: { layout: 0, mottle: 0.5, mottleSize: 1, speckle: 0.3, tone: 0.5, levels: 5, dither: 0.3 } },
  ],
  "floral print": [
    { gen: { layout: 0, mottle: 0.2, mottleSize: 4, tone: 0.5, levels: 5 } },
    { gen: { layout: 3, mark: 2, count: 9, jitter: 0.5, stagger: 1, markSize: 2.2, mortar: 0, tone: 0.85, levels: 5 } },
    { gen: { layout: 3, mark: 0, count: 9, jitter: 0.5, stagger: 1, markSize: 1, mortar: 0, tone: 0.1, levels: 5 }, pair: 1 },
  ],
  freckles: [
    { gen: { layout: 0, mottle: 0.4, mottleSize: 3, tone: 0.5, levels: 5 } },
    { gen: { layout: 3, mark: 0, count: 49, jitter: 1, markSize: 1, mortar: 0, tone: 0.3, levels: 5 } },
  ],
  "weathered skin": [
    { gen: { layout: 0, mottle: 0.7, mottleSize: 2, tone: 0.5, levels: 5, dither: 0.4 } },
    { gen: { layout: 15, len: 16, count: 16, jitter: 1, markSize: 1, tone: 0.3, levels: 5 } },
  ],
  "small scales": [
    { gen: { layout: 5, rows: 8, len: 4, mortar: 1, jointTone: 0.15, shade: 1, shadeAmt: 0.6, pieceVar: 0.15, tone: 0.55, levels: 5 } },
  ],
  "dragon scales": [
    { gen: { layout: 5, rows: 4, len: 8, mortar: 1, jointTone: 0, shade: 2, shadeAmt: 0.9, bevelW: 2, pieceVar: 0.2, tone: 0.55, levels: 5 } },
  ],
  leopard: [
    { gen: { layout: 0, mottle: 0.3, mottleSize: 3, tone: 0.55, levels: 5 } },
    { gen: { layout: 3, mark: 13, count: 16, jitter: 0.6, sizeVar: 0.4, markSize: 1.6, mortar: 0, tone: 0.05, levels: 5 } },
    { gen: { layout: 3, mark: 0, count: 16, jitter: 0.6, sizeVar: 0.4, markSize: 1.3, mortar: 0, tone: 0.4, levels: 5 }, pair: 1 },
  ],
  "tiger stripes": [
    { gen: { layout: 0, mottle: 0.3, mottleSize: 3, tone: 0.55, levels: 5 } },
    { gen: { layout: 14, axis: 1, rows: 4, len: 16, jitter: 0.8, bond: 0.5, markSize: 1.2, tone: 0.05, levels: 5 } },
  ],
  "cow patches": [
    { gen: { layout: 0, mottle: 0.1, mottleSize: 4, tone: 0.75, levels: 5 } },
    { gen: { layout: 9, count: 4, jitter: 1, markSize: 2.6, sizeVar: 0.6, mortar: 0, tone: 0, levels: 5 } },
  ],
  "stone skin": [
    { gen: { layout: 2, count: 9, jitter: 0.9, mortar: 1, jointTone: 0, shade: 1, shadeAmt: 0.5, mottle: 0.35, crack: 0.3, pieceVar: 0.2, tone: 0.55, levels: 5 } },
  ],
};
const TG_BUILTIN_TEX = {};
function tgBuiltin(name) {
  const at = name.indexOf("@");
  if (at > 0) name = name.slice(0, at);                                            // §180: a bound value's texture
  let t = TG_BUILTIN_TEX[name];
  if (!t && TEXGEN_BUILTINS[name]) t = TG_BUILTIN_TEX[name] = { id: "builtin:" + name, rev: 0, layers: TEXGEN_BUILTINS[name].map(function (ly) {
    const o = { gen: texGenRecipe(ly.gen) };
    ["ramp", "lo", "hi", "show", "amount", "pair"].forEach(function (k) { if (ly[k] != null) o[k] = ly[k]; });
    return o;
  }) };
  return t || null;
}
// §180: a built-in's layers' own ramps, [{ ramp, lo, hi } or null per layer, the base first] (null: none has one)
function texGenBuiltinRamps(name) {
  const t = tgBuiltin(name);
  if (!t || !t.layers.some(function (ly) { return ly.ramp; })) return null;
  return t.layers.map(function (ly) { return ly.ramp ? { ramp: ly.ramp, lo: ly.lo, hi: ly.hi } : null; });
}
function texGenBuiltinLevels(name) { const t = tgBuiltin(name); return t ? t.layers[0].gen.levels | 0 : 1; }
// The level on the base's scale, and the index on r0..r1 (every layer on the caller's range), at s x (1 or 2)
function texGenBuiltinLevel(name, x, y, seed, s) {
  const t = tgBuiltin(name);
  if (!t) return 0;
  return tgAtP(32 * ((s | 0) || 1), function () {
    const c = tgPeriod(t, seed), i = tgMod(Math.floor(y), TG_P) * TG_P + tgMod(Math.floor(x), TG_P), L = c.L[c.layer[i]], L0 = c.L[0];
    return L > 1 ? Math.round((c.level[i] / (L - 1)) * (L0 - 1)) : 0;
  });
}
function texGenBuiltinIndex(name, x, y, r0, r1, seed, s) {
  const t = tgBuiltin(name);
  if (!t) return r0;
  const ranges = name.indexOf("@") > 0 ? tgValue(name).ranges : null;            // §180: bound, each layer its own range
  return tgAtP(32 * ((s | 0) || 1), function () {
    const c = tgPeriod(t, seed), i = tgMod(Math.floor(y), TG_P) * TG_P + tgMod(Math.floor(x), TG_P), li = c.layer[i], L = c.L[li];
    const rg = ranges ? ranges[li] : null, a = rg ? rg[0] : r0, b = rg ? rg[1] : r1;
    return L > 1 ? Math.round(a + (b - a) * (c.level[i] / (L - 1))) : a;
  });
}

// STARTERS: a texture to begin from. `ramp` is only the window's suggestion for previewing the base (the base takes the
// ramp of whatever uses it); each layer above names one of the suite's ramps.
const TG_GRASS = { layout: 0, mottle: 1, mottleSize: 3, speckle: 0.5, tone: 0.55, dither: 0.8 };
const TG_COBBLES = { layout: 2, count: 16, jitter: 0.7, mortar: 1.2, sizeVar: 0.3, shade: 2, shadeAmt: 0.8, pieceVar: 0.4, speckle: 0.2, tone: 0.55 };
const TG_BRICKS = { layout: 1, rows: 8, len: 8, bond: 0.5, mortar: 1, pieceVar: 0.5, mottle: 0.25, shade: 1, shadeAmt: 0.6, tone: 0.62 };
const TG_TILES = { layout: 1, rows: 4, len: 8, bond: 0, mortar: 1, pieceVar: 0.15, shade: 1, shadeAmt: 0.7, tone: 0.6 };
const TG_FLOWER = { layout: 3, mark: 2, count: 6, jitter: 1, markSize: 2.2, mortar: 1, jointTone: 0.25, tone: 0.55, levels: 3 };
const TEXGEN_STARTERS = [
  { name: "Cobbles", ramp: "Cairn", layers: [{ gen: TG_COBBLES }] },
  { name: "Mossy cobbles", ramp: "Cairn", layers: [{ gen: TG_COBBLES }, { gen: { layout: 0, mottle: 1, mottleSize: 1, tone: 0.5, levels: 4 }, ramp: "Jungle", lo: 1, show: 1 }] },
  { name: "Snowy cobbles", ramp: "Cairn", layers: [{ gen: TG_COBBLES }, { gen: { layout: 0, mottle: 0.5, mottleSize: 2, tone: 0.8, levels: 3, dither: 0.6 }, ramp: "Hoarfrost", hi: 4, show: 2, amount: 0.55 }] },
  { name: "Pebbles", ramp: "Slate", layers: [{ gen: { layout: 2, count: 25, stagger: 1, jitter: 0.5, mortar: 1.5, shade: 2, shadeAmt: 1, pieceVar: 0.5, tone: 0.6 } }] },
  { name: "Flagstones", ramp: "Slate", layers: [{ gen: { layout: 2, count: 9, jitter: 0.9, mortar: 1.4, shade: 1, shadeAmt: 0.5, mottle: 0.4, crack: 0.4, chip: 0.25, pieceVar: 0.35, tone: 0.6 } }] },
  { name: "Rubble", ramp: "Slate", layers: [{ gen: { layout: 2, count: 12, jitter: 1, sizeVar: 0.9, mortar: 1, shade: 2, shadeAmt: 0.7, crack: 0.3, pieceVar: 0.5, tone: 0.55 } }] },
  { name: "Bricks", ramp: "Rust", layers: [{ gen: TG_BRICKS }] },
  { name: "Mixed bricks", ramp: "Rust", layers: [{ gen: TG_BRICKS }, { gen: TG_BRICKS, ramp: "Ember", lo: 1, show: 3, amount: 0.25 }] },
  { name: "Ashlar", ramp: "Rust", layers: [{ gen: { layout: 1, rows: 4, courseVar: 0.7, len: 12, lenVar: 0.8, bond: 0.5, bondVar: 0.6, mortar: 1, shade: 1, shadeAmt: 0.6, chip: 0.3, crack: 0.15, pieceVar: 0.4, mottle: 0.2, tone: 0.6 } }] },
  { name: "Tiles", ramp: "Slate", layers: [{ gen: TG_TILES }] },
  { name: "Checker tiles", ramp: "Slate", layers: [{ gen: TG_TILES }, { gen: TG_TILES, ramp: "Sapphire", show: 3, amount: 0.5 }] },
  { name: "Floorboards", ramp: "Oak", layers: [{ gen: { layout: 1, rows: 4, len: 24, lenVar: 0.6, bond: 0.37, bondVar: 0.5, mortar: 1, grain: 0.7, pieceVar: 0.5, shade: 1, shadeAmt: 0.3, tone: 0.6 } }] },
  { name: "Wall planks", ramp: "Oak", layers: [{ gen: { layout: 1, rows: 5, len: 32, axis: 1, mortar: 1, grain: 0.8, pieceVar: 0.5, shade: 1, shadeAmt: 0.4, tone: 0.6 } }] },
  { name: "Crates", ramp: "Oak", layers: [{ gen: { layout: 1, rows: 2, len: 16, bond: 0, mortar: 1, grain: 0.6, shade: 1, shadeAmt: 0.8, bevelW: 2, pieceVar: 0.3, tone: 0.6 } }] },
  { name: "Grass", ramp: "Meadow", layers: [{ gen: TG_GRASS }] },
  { name: "Flower meadow", ramp: "Meadow", layers: [{ gen: TG_GRASS }, { gen: TG_FLOWER, ramp: "Bubblegum", hi: 5 },
    { gen: { layout: 3, mark: 0, count: 9, jitter: 1, markSize: 1.2, mortar: 0, tone: 0.6, levels: 3 }, ramp: "Flower Power", hi: 4 }] },
  { name: "Dry mud", ramp: "Parchment", layers: [{ gen: { layout: 2, count: 9, jitter: 1, mortar: 0.8, jointTone: 0.15, shade: 1, shadeAmt: 0.4, mottle: 0.3, pieceVar: 0.25, tone: 0.6 } }] },
  { name: "Plaster", ramp: "Parchment", layers: [{ gen: { layout: 0, mottle: 0.6, mottleSize: 2, speckle: 0.2, tone: 0.7, dither: 1, levels: 4 } }] },
  { name: "Sand and shells", ramp: "Beach", layers: [{ gen: { layout: 0, mottle: 0.6, mottleSize: 3, speckle: 0.5, tone: 0.6, dither: 0.8, levels: 3 } },
    { gen: { layout: 3, mark: 1, count: 4, jitter: 1, markSize: 1.8, mortar: 1, jointTone: 0.4, shade: 2, shadeAmt: 1, tone: 0.6, levels: 3 }, ramp: "Bubblegum", hi: 4 }] },
  // §185: the new layouts (APPENDED: the window's list and Randomize draw from these)
  { name: "Herringbone path", ramp: "Rust", layers: [{ gen: TEXGEN_BUILTINS.herringbone[0].gen }] },
  { name: "Mossy herringbone", ramp: "Rust", layers: [{ gen: Object.assign({}, TEXGEN_BUILTINS.herringbone[0].gen, { mortar: 1.6 }) },
    { gen: { layout: 0, mottle: 1, mottleSize: 1, speckle: 0.3, tone: 0.4, levels: 4 }, ramp: "Jungle", lo: 1, hi: 4, show: 1 }] },
  { name: "Herringbone parquet", ramp: "Oak", layers: [{ gen: TEXGEN_BUILTINS["herringbone parquet"][0].gen }] },
  { name: "Fish scales", ramp: "Lagoon", layers: [{ gen: TEXGEN_BUILTINS["fish scales"][0].gen }] },
  { name: "Roof scales", ramp: "Slate", layers: [{ gen: { layout: 5, rows: 4, len: 16, mortar: 1, jointTone: 0.05, shade: 1, shadeAmt: 0.7, bevelW: 2, pieceVar: 0.3, speckle: 0.15, tone: 0.52, levels: 5 } }] },
  { name: "Hex tiles", ramp: "Slate", layers: [{ gen: TEXGEN_BUILTINS["hex tiles"][0].gen }] },
  { name: "Honeycomb", ramp: "Honeycomb", layers: [{ gen: { layout: 6, len: 8, axis: 1, mortar: 1, jointTone: 0.05, shade: 2, shadeAmt: 0.6, pieceVar: 0.25, tone: 0.65, levels: 5 } }] },
  { name: "Wicker", ramp: "Parchment", layers: [{ gen: TEXGEN_BUILTINS.wicker[0].gen }] },
  { name: "Woven mat", ramp: "Parchment", layers: [{ gen: TEXGEN_BUILTINS["woven mat"][0].gen }] },
  { name: "Twill rug", ramp: "Ember", layers: [{ gen: { layout: 7, rows: 8, len: 8, bond: 1, mortar: 1, jointTone: 0.15, shade: 2, shadeAmt: 0.7, pieceVar: 0.15, tone: 0.6, levels: 4 } }] },
  // §198: the new layouts and marks (APPENDED), most from the built-ins
  { name: "Worn grass", ramp: "Meadow", layers: TEXGEN_BUILTINS["worn grass"] },
  { name: "Clover", ramp: "Meadow", layers: TEXGEN_BUILTINS.clover },
  { name: "Fern undergrowth", ramp: "Canopy", layers: TEXGEN_BUILTINS.ferns },
  { name: "Tartan", ramp: "Royal Court", layers: TEXGEN_BUILTINS.tartan },
  { name: "Gingham", ramp: "Parchment", layers: [{ gen: { layout: 0, mottle: 0.4, mottleSize: 1, tone: 0.8, levels: 4, dither: 0.5 } }, { gen: { layout: 10, rows: 4, len: 4, bond: 0.5, pieceVar: 0.6, tone: 0.5, levels: 4 }, ramp: "Torii", lo: 2, hi: 5 }] },
  { name: "Patchwork quilt", ramp: "Cottage", layers: TEXGEN_BUILTINS.patchwork },
  { name: "Knit", ramp: "Sapphire", layers: TEXGEN_BUILTINS.knit },
  { name: "Ornate carpet", ramp: "Royal Court", layers: TEXGEN_BUILTINS["ornate carpet"] },
  { name: "Farmland", ramp: "Oak", layers: TEXGEN_BUILTINS.farmland },
  { name: "Thatch", ramp: "Gold", layers: TEXGEN_BUILTINS.thatch },
  { name: "Cooling lava", ramp: "Obsidian", layers: TEXGEN_BUILTINS["cooling lava"] },
  { name: "Cracked ice", ramp: "Glacier", layers: TEXGEN_BUILTINS["cracked ice"] },
  // §44 (CrunchyUI): PATTERNS, for a panel as much as a floor (APPENDED)
  { name: "Polka dots", ramp: "Parchment", layers: [{ gen: { layout: 0, tone: 0.85, levels: 4 } },
    { gen: { layout: 3, mark: 0, count: 16, jitter: 0, stagger: 1, markSize: 4, mortar: 0, shade: 2, shadeAmt: 0.8, tone: 0.5, levels: 4 }, ramp: "Bubblegum", lo: 2, hi: 6 }] },
  { name: "Checkerboard", ramp: "Slate", layers: [{ gen: { layout: 12, rows: 4, tone: 0.85, jointTone: 0.25, shade: 1, shadeAmt: 0.5, levels: 5 } }] },
  { name: "Harlequin", ramp: "Harlequin", layers: [{ gen: { layout: 12, rows: 4, axis: 1, tone: 0.8, jointTone: 0.2, levels: 4 } },
    { gen: { layout: 13, rows: 4, len: 1, bond: 1, tone: 0.3, levels: 3 }, ramp: "Gold", lo: 1, hi: 3 },
    { gen: { layout: 13, rows: 4, len: 1, bond: 1, axis: 1, tone: 0.3, levels: 3 }, ramp: "Gold", lo: 1, hi: 3 }] },
  { name: "Chevrons", ramp: "Toybox", layers: [{ gen: { layout: 14, rows: 4, len: 16, jitter: 1, bond: 0, tone: 0.85, jointTone: 0.2, shade: 1, shadeAmt: 0.4, levels: 4 } }] },
  { name: "Ocean waves", ramp: "Lagoon", layers: [{ gen: { layout: 14, rows: 4, len: 16, jitter: 0.6, bond: 0.5, tone: 0.8, jointTone: 0.25, shade: 2, levels: 5 } },
    { gen: { layout: 3, mark: 5, count: 4, jitter: 1, markSize: 1, mortar: 0, tone: 1, levels: 3 }, ramp: "Hoarfrost", lo: 0, hi: 1 }] },
  { name: "Scallops", ramp: "Gold", layers: [{ gen: { layout: 14, rows: 4, len: 8, jitter: 0.5, bond: 1, tone: 0.75, jointTone: 0.15, shade: 1, shadeAmt: 0.6, levels: 5 } }] },
  { name: "Pinstripes", ramp: "Slate", layers: [{ gen: { layout: 0, mottle: 0.3, mottleSize: 4, tone: 0.65, levels: 4, dither: 0.5 } },
    { gen: { layout: 13, rows: 4, len: 1, axis: 1, tone: 0.15, levels: 3 } }] },
  { name: "Candy stripes", ramp: "Bubblegum", layers: [{ gen: { layout: 13, rows: 2, len: 8, bond: 1, tone: 0.85, jointTone: 0.15, shade: 2, levels: 5 } }] },
  { name: "Graph paper", ramp: "Blueprint", layers: [{ gen: { layout: 0, mottle: 0.15, tone: 0.75, levels: 4 } },
    { gen: { layout: 10, rows: 4, len: 1, bond: 0, tone: 0.45, levels: 4 } }, { gen: { layout: 10, rows: 1, len: 1, bond: 0, tone: 0.1, levels: 4 } }] },
  { name: "Carbon fiber", ramp: "Obsidian", layers: [{ gen: { layout: 7, rows: 8, len: 2, bond: 1, mortar: 0, shade: 2, shadeAmt: 1, tone: 0.5, levels: 5 } }] },
  { name: "Diamond plate", ramp: "Steel Plate", layers: [{ gen: { layout: 0, grain: 0.4, mottle: 0.2, tone: 0.55, levels: 5 } },
    { gen: { layout: 3, mark: 16, count: 16, jitter: 0, markSize: 1.4, mortar: 1, jointTone: 0.95, shade: 2, shadeAmt: 1, tone: 0.25, levels: 5 } }] },
  { name: "Brushed steel", ramp: "Steel Plate", layers: [{ gen: { layout: 8, rows: 16, len: 32, courseVar: 0.3, lenVar: 0.3, mortar: 0, pieceVar: 0.6, speckle: 0.2, tone: 0.55, levels: 5 } }] },
  { name: "Marble", ramp: "Ghost", layers: [{ gen: { layout: 0, mottle: 0.5, mottleSize: 4, tone: 0.85, levels: 4, dither: 0.5 } },
    { gen: { layout: 15, len: 16, count: 8, jitter: 0.25, markSize: 1, tone: 0.45, levels: 3 } }] },
  { name: "Leather", ramp: "Oak", layers: [{ gen: { layout: 2, count: 64, jitter: 0.8, sizeVar: 0.4, mortar: 0.4, jointTone: 0.2, shade: 2, shadeAmt: 0.7, mottle: 0.3, tone: 0.5, levels: 5 } }] },
  { name: "Confetti", ramp: "Parchment", layers: [{ gen: { layout: 0, mottle: 0.1, tone: 0.9, levels: 4 } },
    { gen: { layout: 3, mark: 15, count: 25, jitter: 1, markSize: 2, mortar: 0, pieceVar: 1, tone: 0.5, levels: 6 }, ramp: "Flower Power" }] },
  { name: "Hearts", ramp: "Bubblegum", layers: [{ gen: { layout: 0, mottle: 0.3, mottleSize: 4, tone: 0.85, levels: 4, dither: 0.5 } },
    { gen: { layout: 3, mark: 11, count: 16, jitter: 0, stagger: 1, markSize: 2, mortar: 0, tone: 0.3, levels: 3 }, ramp: "Bubblegum", lo: 2, hi: 5 }] },
  { name: "Starry sky", ramp: "Nebula", layers: [{ gen: { layout: 0, mottle: 0.4, mottleSize: 4, tone: 0.15, levels: 4, dither: 0.6 } },
    { gen: { layout: 3, mark: 12, count: 4, jitter: 1, markSize: 2, mortar: 0, tone: 1, levels: 3 }, ramp: "Gold", lo: 0, hi: 2 },
    { gen: { layout: 3, mark: 0, count: 16, jitter: 1, markSize: 1, mortar: 0, tone: 1, levels: 3 }, ramp: "Hoarfrost", lo: 0, hi: 1 }] },
  { name: "Bubbles", ramp: "Lagoon", layers: [{ gen: { layout: 0, mottle: 0.3, mottleSize: 4, tone: 0.5, levels: 4 } },
    { gen: { layout: 3, mark: 13, count: 9, jitter: 1, sizeVar: 0.8, markSize: 2, mortar: 0, tone: 0.95, levels: 3 }, ramp: "Hoarfrost", lo: 0, hi: 2 }] },
  { name: "Diamonds", ramp: "Velvet", layers: [{ gen: { layout: 0, mottle: 0.2, tone: 0.6, levels: 4 } },
    { gen: { layout: 3, mark: 14, count: 16, jitter: 0, stagger: 1, markSize: 2, mortar: 0, shade: 1, tone: 0.25, levels: 4 }, ramp: "Gold", lo: 1, hi: 5 }] },
];
// DETAIL (CrunchyTile §175): the index at fine pixel (X, Y) of a texture drawn at s x (a 64 px tile: s = 2), its period
// 32 s, so it still divides the tile.
function texGenIndexValueDetail(v, X, Y, r0, r1, seed, s) {
  return tgAtP(TG_P * (s | 0 || 1), function () { return texGenIndexValue(v, X, Y, r0, r1, seed); });
}

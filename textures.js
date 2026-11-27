// GENERATED from crunchyCore/textures.js @ bfc9f4a by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 92048c99ae4363a171a23570457463fdac17b9b6c53df2096f3d27bd5912753f
"use strict";
// Crunchy suite — THE SHARED TEXTURE LIBRARY (crunchyTile TILE-DESIGN.md §46). Pure; depends on NOTHING else, so
// every Crunchy app can carry it: each pulls it from crunchyCore with tools/pull-core.mjs, which checks its sha256.
//
// CANONICAL IN crunchyCore. Edit it there; never edit an app's copy.
//
// THE API (public names, stable):
//   TEXTURES                        every texture name, APPEND ONLY (stored by index in saved designs)
//   texturePeriod(t) -> [w, h]      the period; every texture's divides 32 (a tile must repeat)
//   textureLevels(t) -> n           how many tonal levels it uses
//   textureLevel(t, x, y, seed[, f, N]) -> 0..n-1   the level at a pixel (frame f of N when animating)
//   textureIndex(t, x, y, r0, r1, seed[, f, N])     the level mapped onto ramp indices r0..r1
//   textureAnimates(t), TEX_ANIM    which textures move, and how
//   isPatternTex(t), isNoiseTex(t), TILE_PATTERNS, TILE_NOISE_PERIOD
// Everything else is internal and PREFIXED (tex*, TEX_*) so it can never collide with a host app's
// globals — CrunchyUI has its own h32, mod, waveField and BAYER4.
//
// Ported from CrunchyUI's ui.js (noiseLevel / patternLevel) and grown here; see each texture's
// comment for its story.

const TEXTURES_BUILD = 20;
// 20 (2026-11-12, CrunchyTile §198): fifteen recipe textures appended (worn grass … cracked ice), drawn by texgen.js 5.
// 19 (2026-11-10, CrunchyTile §185): six recipe textures appended (herringbone … woven mat), one per new texgen.js 4 layout.
// 16 also (§176): eight textures BUILT FROM RECIPES appended (grass … boards), drawn by texgen.js in one ramp.
// 16 (2026-11-06, CrunchyTile §175): textureIndexDetail draws your textures at s x through texgen.js, and
// remembers a converted texture's s x period as textureLevel remembers the 32 px one (byte for byte the same pixels).
// 15 (2026-11-05, CrunchyTile §174): a texture VALUE may also be one of YOUR TEXTURES from crunchyCore texgen.js (an id
// "tx…", bound or not): textureIndex, textureLevel, textureLevels and texturePeriod hand it to texgen.js when that file
// is loaded, so everything that draws a texture takes generated ones as it takes a name. Every name draws as before.
function texIsGen(t) { return typeof t === "string" && t.charCodeAt(0) === 116 && t.charCodeAt(1) === 120 && typeof texGenIsValue === "function" && texGenIsValue(t); }

// Private copies of the host's hash and modulo — identical arithmetic to tile.js h32 / mod.
function texH32(a, b, c) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function texMod(a, n) { return ((a % n) + n) % n; }
// SEED VARIATION FOR THE STRUCTURED FILLS (§47): hexes, scales, plating, shingles and facade vary
// their LIGHT AND DARK EXTREMES with the seed — lit and dark panels, missing rivets, gaps — so they
// change on any ramp span (a seed that only moved middle shades collapsed on narrow ones, and CrunchyUI
// could not boil them). ONLY FOR SEEDS OF 256 AND UP: every seed below draws exactly what it always did,
// so no saved design or preset changes (all of them use small seeds), while rolled designs (seeds to
// 9999) and CrunchyUI (which passes 256 + its seed for these five) get the variety.
// A COUNTER, NOT A COIN: the seed picks WHICH panel is lit and which dark (which rivet is gone, which
// shingle missing), so consecutive seeds always draw different pictures — at least 12 in a row for
// every one of the five, which is what a boil needs (a hashed coin repeated pictures on hexes' four
// panels). texSeedPick(seed, n, k) is the k-th pick among n slots, never two picks on one slot.
function texSeedVary(seed) { return seed >= 256; }
function texSeedPick(seed, n, k) {
  const a = texMod(seed, n);
  return k === 0 ? a : texMod(a + 1 + texMod(Math.floor(seed / n), n - 1), n);
}
// A 4x4 Bayer matrix (stucco's dithered blotches).
const TEX_BAYER4 = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

// ============================================================================================
// TEXTURES — only the ones that are LEGAL INSIDE A TILE.
//
// Every texture sampled by the world function must have a period that DIVIDES TILE, or a tile placed
// in a different cell shows the wrong phase and the seam appears (§6). That rule excludes, measured
// 2026-10-07 against CrunchyUI's library: `planks` (1x10), `glint` (40x24), `ember` (32x44), `arc`
// (40x20) and `camo` (64). They are not ported, so they cannot be selected. The suite re-measures
// every entry here, so a later addition with the wrong period fails rather than seams.
//
// Coordinates are WORLD pixels; periodicity is what makes a tile-local and a world-local read agree.
// ============================================================================================

// `.` base, `#` partner. The picture in the source IS the data (ui.js). CrunchyUI also has `+` for
// a half step; none of the twelve that qualify use it, so it is not supported here — the suite
// fails on any character but `.` and `#` rather than guessing what one means.
const TILE_PATTERNS = {
  dither:   [".#",
             "#."],
  scanline: ["..",
             "##"],
  checker:  ["..##",
             "..##",
             "##..",
             "##.."],
  grid:     ["####",
             "#...",
             "#...",
             "#..."],
  hatch:    ["#...",
             ".#.#",
             "..#.",
             ".#.#"],
  weave:    ["###.",
             ".#..",
             ".###",
             "..#."],
  stripes:  ["##..",
             ".##.",
             "..##",
             "#..#"],
  fishnet:  ["#.......",
             ".#.....#",
             "..#...#.",
             "...#.#..",
             "....#...",
             "...#.#..",
             "..#...#.",
             ".#.....#"],
  bricks:   ["########",
             "...#....",
             "...#....",
             "...#....",
             "########",
             ".......#",
             ".......#",
             ".......#"],
  tiles:    ["########",
             "#.......",
             "#.......",
             "#.......",
             "#.......",
             "#.......",
             "#.......",
             "#......."],
  tread:    ["..##....",
             ".##.....",
             "##......",
             "........",
             "....##..",
             ".....##.",
             "......##",
             "........"],
  mesh:     ["....",
             ".#..",
             "....",
             "...#"],
};

// Noise fields and their periods. CrunchyUI's `vary` multiplier (a longer period for less repeat)
// is DROPPED: at 16 it would give 32 (legal), at 32 it gives 64 (not). Variety in a tileset comes
// from variant tiles instead (§6), which is the answer that survives a 32px period.
const TILE_NOISE_PERIOD = {
  noise: 16, grain: 16, brushed: 16,
  clouds: 32, caustic: 32, swell: 32, stars: 32, woodgrain: 32,
  fibres: 32, bands: 32, strata: 32, slant: 32, plating: 32, cells: 32, chrome: 32, hexes: 32,
  asphalt: 32, cobble: 32, shingles: 32, facade: 32, planks: 32, scales: 32, ripples: 32, circuit: 32,
  gravel: 32, speckle: 32, stucco: 32, metal: 32, turf: 32,
  rubble: 32, wallpaper: 16, bookshelf: 32, brushstroke: 32,
  wavelets: 32, "still water": 32, "deep water": 32, river: 32,
  leaves: 32,
  parquet: 32, tatami: 32, pebbles: 32, argyle: 32, basalt: 32,
};

// APPEND ONLY — stored as an index in presets and share links (§10). Inserting one re-textures
// every saved terrain.
const TEXTURES = ["flat",
                  "dither", "scanline", "checker", "grid", "hatch", "weave", "stripes", "fishnet",
                  "bricks", "tiles", "tread", "mesh",
                  "noise", "grain", "brushed", "clouds", "caustic", "swell", "stars", "woodgrain",
                  // Appended 2026-10-07: woodgrain turned on its side — lines running DOWN a wall,
                  // which is the grain a vertical wall wants (§15). Not a rotation flag on woodgrain,
                  // because a flag would change what every saved woodgrain draws.
                  "fibres",
                  // Appended 2026-10-07 for Jupiter (§21): turbulent horizontal gas bands.
                  "bands",
                  // Appended 2026-10-07 for Mars (§22): sandstone sediment layers.
                  "strata",
                  // Appended 2026-10-07 for Uranus (§27): layers knocked over onto a 45° slant.
                  "slant",
                  // Appended 2026-10-07 for Earth (§29): riveted machine plating.
                  "plating",
                  // Appended 2026-10-07 for the Sun (§30): solar granulation — convection cells.
                  "cells",
                  // Appended 2026-10-07 for Mercury (§31): liquid metal — hard reflection bands.
                  "chrome",
                  // Appended 2026-10-07 for Earth II (§32): engineered hex panels.
                  "hexes",
                  // Appended 2026-10-07 for a CITY tileset (§36): road, street, roof, building front,
                  // floorboards — then general extras: scales, sand ripples, a circuit board.
                  "asphalt", "cobble", "shingles", "facade", "planks",
                  "scales", "ripples", "circuit",
                  // Appended 2026-10-07 (§46): RICHER BASICS — AJ found grain, noise and brushed "fail to
                  // impress" (dots with no structure). These have form: stones, mottling, plaster,
                  // streaked metal, blades. The old three stay (saved designs) but sink in the picker.
                  "gravel", "speckle", "stucco", "metal", "turf",
                  // Appended 2026-10-08 for the Asteroid Belt (§53): packed boulders of mixed sizes.
                  "rubble",
                  // Appended 2026-10-08 (new areas, §57): damask wallpaper for museums and mansions.
                  "wallpaper",
                  // Appended 2026-10-08 (new areas, §58): library shelves; a painted canvas.
                  "bookshelf", "brushstroke",
                  // Appended 2026-10-21 (CrunchyTile §145, AJ on the forest wall's canopy: "the scales work, but I
                  // think we should make actual leaves"): overlapping pointed leaves, a midrib, lit from the upper left.
                  "leaves",
                  // Appended 2026-11-01 (CrunchyTile §173, from CrunchyTexture's lab): basket-weave parquet, tatami mats,
                  // rounded river pebbles, an argyle carpet, basalt columns.
                  "parquet", "tatami", "pebbles", "argyle", "basalt",
                  // Appended 2026-11-06 (CrunchyTile §176): BUILT FROM RECIPES in texgen.js (TEXGEN_BUILTINS), drawn there in
                  // the caller's one ramp, at 32 px or 64. With texgen.js not loaded they draw flat (their first step).
                  "grass", "moss", "soil", "leaf litter", "flagstones", "blockwork", "rockface", "boards",
                  // Appended 2026-11-06 (CrunchyTile §180, AJ: "some stone with grass peeking out, or flowers ... to add some
                  // color"): LAYERED recipe textures, their upper layers in colors of their own (texgen.js TEXGEN_BUILTINS).
                  "wildflowers", "mossy cobbles", "grassy flagstones", "snowy cobbles", "mossy blockwork", "sand and shells",
                  // Appended 2026-11-06 (CrunchyTile §181, AJ: "I like caustic as well, but I'm not sure it's the best choice for
                  // water"): WATER drawn the way pixel art draws it, flat with a few deliberate marks (texWaterLevel).
                  "wavelets", "still water", "deep water", "river",
                  // Appended 2026-11-06 (CrunchyTile §181): three more layered recipe textures (texgen.js TEXGEN_BUILTINS).
                  "autumn grass", "daisies", "pebbled sand",
                  // Appended 2026-11-10 (CrunchyTile §185): one recipe texture for each new texgen.js layout (herringbone,
                  // scales, hexes, weave), drawn by texgen.js in the caller's one ramp.
                  "herringbone", "herringbone parquet", "fish scales", "hex tiles", "wicker", "woven mat",
                  // Appended 2026-11-12 (CrunchyTile §198, Tile 1.4): fifteen recipe textures (texgen.js 5), most of them layered:
                  // five grasses, five fabrics and five staples.
                  "worn grass", "dry grass", "clover", "frosty grass", "ferns",
                  "tartan", "patchwork", "burlap", "knit", "ornate carpet",
                  "farmland", "cracked earth", "cooling lava", "thatch", "cracked ice"];
// The names texgen.js draws (§176, §180)
const TEX_GENERATED = { grass: 1, moss: 1, soil: 1, "leaf litter": 1, flagstones: 1, blockwork: 1, rockface: 1, boards: 1,
  wildflowers: 1, "mossy cobbles": 1, "grassy flagstones": 1, "snowy cobbles": 1, "mossy blockwork": 1, "sand and shells": 1,
  "autumn grass": 1, daisies: 1, "pebbled sand": 1,
  herringbone: 1, "herringbone parquet": 1, "fish scales": 1, "hex tiles": 1, wicker: 1, "woven mat": 1,
  "worn grass": 1, "dry grass": 1, clover: 1, "frosty grass": 1, ferns: 1, tartan: 1, patchwork: 1, burlap: 1, knit: 1, "ornate carpet": 1,
  farmland: 1, "cracked earth": 1, "cooling lava": 1, thatch: 1, "cracked ice": 1 };
// §180: a layered one BOUND to an app's palette ("wildflowers@-,40-46,47-51": its layers' ranges, as texgen.js values) is
// one too. Every other texture name answers 0 at once (TEX_GEN_KIND), so the hot path never parses a plain name.
const TEX_GEN_KIND = new Map();
TEXTURES.forEach(function (n) { TEX_GEN_KIND.set(n, TEX_GENERATED[n] === 1 ? 1 : 0); });
function texIsBuiltinGen(t) {
  let k = TEX_GEN_KIND.get(t);
  if (k === undefined) {
    const at = typeof t === "string" ? t.indexOf("@") : -1;
    k = at > 0 && TEX_GENERATED[t.slice(0, at)] === 1 ? 1 : 0;
    if (TEX_GEN_KIND.size < 4096) TEX_GEN_KIND.set(t, k);
  }
  return k === 1;
}

function isPatternTex(t) { return !!TILE_PATTERNS[t]; }
function isNoiseTex(t) { return TILE_NOISE_PERIOD[t] != null; }

// [w, h] of one period. `flat` is period 1 — trivially legal.
function texturePeriod(t) {
  if (texIsGen(t) || texIsBuiltinGen(t)) return [32, 32];
  if (isPatternTex(t)) return [TILE_PATTERNS[t][0].length, TILE_PATTERNS[t].length];
  if (isNoiseTex(t)) return [TILE_NOISE_PERIOD[t], TILE_NOISE_PERIOD[t]];
  return [1, 1];
}

// How many tonal steps a texture uses (ui.js noiseLevels). Water needs four; a stencil needs two.
function textureLevels(t) {
  if (texIsGen(t)) return texGenLevelsValue(t);
  if (texIsBuiltinGen(t)) return typeof texGenBuiltinLevels === "function" ? texGenBuiltinLevels(t) : 1;
  if (t === "caustic" || t === "swell") return 4;
  if (t === "woodgrain" || t === "stars" || t === "fibres") return 3;
  if (t === "bands" || t === "strata" || t === "slant" || t === "plating" || t === "cells" || t === "chrome" || t === "hexes") return 4;
  if (t === "asphalt" || t === "cobble" || t === "shingles" || t === "facade" || t === "planks" ||
      t === "scales" || t === "ripples" || t === "circuit") return 4;
  if (t === "gravel" || t === "speckle" || t === "stucco" || t === "metal" || t === "turf") return 4;
  if (t === "rubble" || t === "wallpaper" || t === "bookshelf" || t === "brushstroke") return 4;
  if (t === "leaves") return 4;
  if (TEX_WATER[t]) return 4;                                                      // §181
  if (TEX_LAB_PORTS[t]) return 5;
  if (t === "flat") return 1;
  return 2;
}

const TEX_CAUSTIC_WAVES = [[2, 1], [1, -2], [3, 2], [-2, 3]];
const TEX_SWELL_WAVES = [[0, 1], [1, 3]];

// A sum of sines with INTEGER wave vectors, so it completes whole cycles across T on both axes and
// wraps exactly. A fractional vector would look the same and seam. (ui.js texWaveField.)
function texWaveField(px, py, T, seed, waves) {
  const k = (2 * Math.PI) / T;
  const ph = seed * 0.6180339887;
  let v = 0;
  for (let i = 0; i < waves.length; i++) {
    v += Math.sin(k * (waves[i][0] * px + waves[i][1] * py) + ph * (i + 1));
  }
  return v / waves.length;
}

// ============================================================================================
// TIME — ANIMATED TEXTURES. A texture can be sampled at FRAME f OF N. Three promises, each measured:
//
//   1. FRAME 0 IS TODAY'S TEXTURE, TO THE BIT. `f mod N == 0` (and no f at all) takes the static code
//      path untouched, so every saved preset, sheet and contract run is byte-identical.
//   2. IT LOOPS. f is taken mod N, so frame N IS frame 0; and every motion below is a whole number of
//      cycles per loop (a phase of 2*pi*c*f/N with integer c, a drift of whole periods), so frame N-1
//      runs smoothly on into frame 0 rather than jumping.
//   3. EVERY FRAME STILL TILES ON 32. Time only ever adds a CONSTANT to a field's phase or a WHOLE-
//      PIXEL shift to where it is sampled — nothing that depends on the cell — so each frame keeps the
//      period that divides TILE, and the adjacency contract (§3) holds frame by frame: a frame of a
//      tile equals the same frame of the world.
//
// No blending: every frame is palette indices, like every still. What animates and how:
//
//   texture   motion                                                     why
//   caustic   PHASE: its waves turn against each other (+1,-1,0,+1)     water light shimmering
//   swell     PHASE: both waves roll (+1,+1)                             water swelling
//   chrome    PHASE: the bending waves flow down (0,-1,+1); glints flick  quicksilver running
//   clouds    DRIFT: one whole period (32 px) across x per loop          clouds, mist, fog drifting
//   bands     DRIFT: one whole period across x per loop                  gas belts flowing
//   cells     ORBIT: each cell center circles 0.8 px, either way         lava / plasma churning
//   stars     TWINKLE: each star dims on its own 1- or 2-beat cycle       glows flickering
//   facade    FLICKER: now and then a window switches on or off          a city at night
//   circuit   BLINK: via pads light up at random                         machine LEDs
//
//   STATIC, deliberately: the drawn patterns (bricks, tiles, weave...), woodgrain, fibers, strata, slant,
//   plating, hexes, asphalt, cobble, shingles, planks, scales, ripples (sand), noise, grain, brushed, leaves.
//   They are solid things; moving them reads as the ground sliding, and a phase on a drawn line cuts it.
//
// Small N reads best as 4 or 8; drifts move T/N px a frame, so N should divide 32 for even steps
// (any N still loops and tiles — the steps are just uneven).
// ============================================================================================
const TEX_ANIM = { caustic: "phase", swell: "phase", chrome: "phase", clouds: "drift", bands: "drift",
                   cells: "orbit", stars: "twinkle", facade: "flicker", circuit: "blink",
                   wavelets: "water", "still water": "water", "deep water": "water", river: "water" };     // §181
function textureAnimates(t) { return !!TEX_ANIM[t]; }

// WATER (CrunchyTile §181, 2026-11-06, AJ: caustic "not the best choice for water"): drawn the way pixel art draws it,
// one FLAT tone (1; deep water 3) with a few deliberate marks, never noise: rows of little crests (wavelets, the
// overworld sea), long faint streaks with glints (still water, a lake), dark water with long swells (deep water),
// flow lines (river). Level 0 lightest. Animated (TEX_ANIM "water"): crests sway, streaks breathe or swing, a river's
// lines slide east a whole period per loop; every motion a whole turn, so the loop closes, and frame 0 is the still.
const TEX_WATER = { wavelets: 1, "still water": 1, "deep water": 1, river: 1 };
// Per row py, up to two dashes (start and length hashed, present with chance d), each shifted by dx(py, k); 0 none,
// 1 a dash, 2 its middle.
function texWaterStreak(px, py, seed, d, l0, l1, dx) {
  for (let k = 0; k < 2; k++) {
    if (texH32(py, k, seed) >= d) continue;
    const x0 = Math.floor(texH32(py, k + 2, seed) * 32), len = l0 + Math.floor(texH32(py, k + 4, seed) * (l1 - l0 + 1));
    const u = texMod(px - x0 - dx(py, k), 32);
    if (u < len) return u >= len / 2 - 1 && u <= len / 2 ? 2 : 1;
  }
  return 0;
}
function texWaterLevel(t, px, py, seed, f, N) {
  const tw = (2 * Math.PI * f) / N;
  if (t === "wavelets") {
    // crests on an 8 x 8 lattice (odd rows half a cell over), a hump 6 wide: its middle lit, its ends a step down; most
    // cells have one; each row sways a pixel east and west
    const row = py >> 3, v = py & 7, sway = Math.round(Math.sin(tw + row * 1.7) * 1.2);
    const sh = (row & 1) * 4 + Math.floor(texH32(texMod(row, 4), seed, 7) * 4);
    const xx = texMod(px + sh + sway, 32), cx = xx >> 3, u = xx & 7;
    if (texH32(texMod(cx, 4), texMod(row, 4), seed + 11) < 0.75 && u < 6) {
      if (v === 3 && u >= 1 && u <= 4) return 0;                                    // the crest
      if (v === 4 && (u === 0 || u === 5)) return 0;
      if (v === 4 && u >= 1 && u <= 4) return 2;                                    // its shade
    }
    return texH32(px, py, seed + 17) < 0.003 ? 0 : 1;
  }
  if (t === "still water") {
    const breathe = function (y, k) { return Math.round(Math.sin(tw + texH32(y, k, seed + 5) * 6.283) * 1.5); };
    const a = texWaterStreak(px, py, seed + 21, 0.22, 4, 12, breathe);
    if (a) return 0;
    if (texWaterStreak(px, py, seed + 23, 0.14, 3, 8, breathe)) return 2;
    return texWaterStreak(px, py, seed + 25, 0.04, 2, 4, breathe) ? 3 : 1;
  }
  if (t === "deep water") {
    const swing = function (y, k) { return Math.round(Math.sin(tw + texH32(y, k, seed + 7) * 6.283) * 2); };
    if (texWaterStreak(px, py, seed + 31, 0.08, 2, 3, swing) === 2 && Math.cos(tw + py) > -0.3) return 1;
    return texWaterStreak(px, py, seed + 33, 0.18, 6, 16, swing) ? 2 : 3;
  }
  // river
  const flow = function () { return Math.round((f * 32) / N); };
  if (texWaterStreak(px, py, seed + 41, 0.4, 5, 14, flow)) return 0;
  if (texWaterStreak(px, py, seed + 43, 0.2, 4, 10, flow)) return 2;
  return texWaterStreak(px, py, seed + 45, 0.06, 3, 8, flow) ? 3 : 1;
}

// MIXED PARITY on purpose: with every spin odd, half a loop flips every sine's sign, and caustic (which
// folds the field about its middle) came back to frame 0 at frame N/2 — a loop half as long as promised.
const TEX_CAUSTIC_SPIN = [1, -1, 0, 1];
const TEX_SWELL_SPIN = [1, 1];

// texWaveField at time: wave i's phase advanced by 2*pi*spin[i]*f/N — whole turns per loop.
function texWaveFieldAt(px, py, T, seed, waves, spin, f, N) {
  const k = (2 * Math.PI) / T, ph = seed * 0.6180339887, tw = (2 * Math.PI * f) / N;
  let v = 0;
  for (let i = 0; i < waves.length; i++) {
    v += Math.sin(k * (waves[i][0] * px + waves[i][1] * py) + ph * (i + 1) + spin[i] * tw);
  }
  return v / waves.length;
}

// The level of an ANIMATED texture at frame f (1..N-1) — or -1 for a texture that does not move.
// Each branch mirrors its static twin below with time added; the suite measures frame 0 against the
// static path, every frame's period, and the loop.
function texAnimLevel(t, x, y, seed, f, N) {
  const mode = TEX_ANIM[t];
  if (!mode) return -1;
  const T = TILE_NOISE_PERIOD[t];
  if (mode === "drift") return textureLevel(t, x - Math.floor((f * T) / N), y, seed);
  const px = texMod(x, T), py = texMod(y, T), tw = (2 * Math.PI * f) / N;
  if (mode === "water") return texWaterLevel(t, px, py, seed | 0, f, N);
  if (t === "swell") {
    const n = (texWaveFieldAt(px, py, T, seed, TEX_SWELL_WAVES, TEX_SWELL_SPIN, f, N) + 1) / 2;
    return n < 0.41 ? 0 : n < 0.59 ? 1 : n < 0.83 ? 2 : 3;
  }
  if (t === "caustic") {
    const n = (texWaveFieldAt(px, py, T, seed, TEX_CAUSTIC_WAVES, TEX_CAUSTIC_SPIN, f, N) + 1) / 2;
    let r = 1 - Math.abs(2 * n - 1);
    r = r * r * r * r;
    return r < 0.425 ? 0 : r < 0.683 ? 1 : r < 0.94 ? 2 : 3;
  }
  if (t === "chrome") {
    const k = (2 * Math.PI) / T, ph = seed * 0.6180339887;
    const n = 0.5 + 0.5 * (0.68 * Math.sin(k * px + ph) + 0.22 * Math.sin(k * (2 * px + py) + ph * 2 - tw)
                           + 0.1 * Math.sin(k * (px - 2 * py) + ph * 3 + tw));
    if (texH32(px, py, seed + 139 + 7 * f) < 0.006) return 0;           // the glint moves frame to frame
    return n < 0.28 ? 3 : n < 0.5 ? 2 : n < 0.6 ? 1 : n < 0.68 ? 0 : n < 0.8 ? 1 : 2;
  }
  if (t === "cells") {
    // Each center circles its rest position (radius 0.8, one turn per loop, its own direction and
    // start): at f = 0 the offset is exactly zero. Distances still wrap on the torus.
    let d1 = 1e9, d2 = 1e9;
    for (let i = 0; i < 7; i++) {
      const a0 = texH32(seed, i, 401) * 6.283, s = texH32(seed, i, 403) < 0.5 ? 1 : -1, a = a0 + s * tw;
      // radius 0.8 (§43): at 1.5 a center swung up to 3 px and the lanes between cells whipped round —
      // dark flashes AJ's review called busy. Now the cells drift and the lanes sway.
      const cx = texH32(seed, i, 127) * T + 0.8 * (Math.cos(a) - Math.cos(a0));
      const cy = texH32(seed, i, 131) * T + 0.8 * (Math.sin(a) - Math.sin(a0));
      let dx = texMod(px + 0.5 - cx, T), dy = texMod(py + 0.5 - cy, T);
      dx = Math.min(dx, T - dx); dy = Math.min(dy, T - dy);
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 1.1) return 3;
    const q = d1 / ((d1 + d2) / 2);
    const lv = q < 0.5 ? 0 : q < 0.85 ? 1 : 2;
    return texH32(px, py, seed + 137) < 0.05 ? Math.min(3, lv + 1) : lv;
  }
  const lv = textureLevel(t, x, y, seed);
  if (t === "stars") {
    if (!lv) return 0;
    // Each star's own beat (1 or 2 per loop) and depth; (1 - cos) is 0 at f = 0, so the loop is smooth.
    const c = 1 + (texH32(px, py, seed + 409) < 0.5 ? 1 : 0), thr = 0.3 + 0.9 * texH32(px, py, seed + 419);
    return (1 - Math.cos(c * tw)) / 2 > thr ? lv - 1 : lv;
  }
  if (t === "circuit") return lv === 3 && texH32(px, py, seed + 421 + f) < 0.4 ? 0 : lv;
  // facade: a window's glass switches between lit and dark on a hashed ~1 frame in 7.
  const u = px & 15, v = py & 15;
  if (u < 5 || u > 10 || v < 3 || v > 11) return lv;
  const id = (px >> 4) + (py >> 4) * 2;
  if (texH32(id, f, seed + 431) >= 0.14) return lv;
  const on = (n) => texH32(n, seed, 251) < 0.5;
  const n = on(0) + on(1) + on(2) + on(3), flip = (n === 0 || n === 4) && id === texMod(seed, 4);
  const lit = on(id) === flip;                                       // the OTHER state from the still
  if (lit) return u === 7 || v === 6 || v === 3 ? 2 : 0;
  return u - v === 2 || u - v === 3 ? 2 : 3;
}

// SMOOTH WRAPPING VALUE NOISE (§46): hashed lattice values every L px (L divides 32), smooth-step
// interpolated, wrapping on the 32 period — soft patches that still tile. 0..1.
function texValueNoise(px, py, L, seed) {
  const n = 32 / L, gx = px / L, gy = py / L, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const v = function (i, j) { return texH32(texMod(i, n), texMod(j, n), seed + 457); };
  const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * sx, b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * sx;
  return a + (b - a) * sy;
}
// The same along one axis.
function texValueNoise1(px, L, seed) {
  const n = 32 / L, g = px / L, i = Math.floor(g), f = g - i, s = f * f * (3 - 2 * f);
  const a = texH32(texMod(i, n), 0, seed + 461), b = texH32(texMod(i + 1, n), 0, seed + 461);
  return a + (b - a) * s;
}

// The texture's LEVEL at world pixel (x, y): 0 .. textureLevels(t)-1. Ported from ui.js
// noiseLevel/patternLevel with `vary` removed; thresholds and fields are unchanged.
// (f, N): the frame, optional (TIME, above). Absent, or f a multiple of N: the still, untouched.
//
// ONE PERIOD, REMEMBERED (build 6, 2026-10-08). Every still texture repeats on texturePeriod(t) and
// reads nothing but the wrapped pixel and the seed, so its whole picture is at most 32 x 32 levels —
// yet a tile sheet asks for each of them tens of thousands of times (192 tiles, every layer, every
// variant). Profiled before the web beta: a sheet took 1–3 s, two thirds of it here and in texH32.
// So each (texture, seed) period is filled once, lazily, and read back after: byte-identical (every
// preset, thumbnail, animated sheet and kit zip hashed before and after), several times faster. The
// cache is bounded by clearing it whole; a period refills in well under a millisecond. Animated frames
// and non-integer pixels take the direct path below, untouched.
const TEX_PERIOD_CACHE = new Map();
function textureLevel(t, x, y, seed, f, N) {
  if (texIsGen(t)) return texGenLevelValue(t, x, y, seed);
  if (texIsBuiltinGen(t)) return typeof texGenBuiltinLevel === "function" ? texGenBuiltinLevel(t, x, y, seed, 1) : 0;
  if (N > 1 && (f = texMod(f | 0, N)) && TEX_ANIM[t]) return texAnimLevel(t, x, y, seed | 0, f, N);
  if ((x | 0) !== x || (y | 0) !== y) return texLevelStill(t, x, y, seed);
  seed = seed | 0;
  const key = t + "|" + seed;
  let c = TEX_PERIOD_CACHE.get(key);
  if (!c) {
    if (TEX_PERIOD_CACHE.size >= 512) TEX_PERIOD_CACHE.clear();
    const p = texturePeriod(t);
    c = { w: p[0], h: p[1], lv: new Int8Array(p[0] * p[1]).fill(-1) };
    TEX_PERIOD_CACHE.set(key, c);
  }
  const px = texMod(x, c.w), py = texMod(y, c.h), i = py * c.w + px;
  let lv = c.lv[i];
  if (lv < 0) lv = c.lv[i] = texLevelStill(t, px, py, seed);
  return lv;
}
// The still picture, computed directly (what the cache above is filled from).
function texLevelStill(t, x, y, seed) {
  if (t === "flat") return 0;
  if (texIsBuiltinGen(t)) return typeof texGenBuiltinLevel === "function" ? texGenBuiltinLevel(t, x, y, seed, 1) : 0;   // §176
  if (texIsGen(t)) return texGenLevelValue(t, x, y, seed);
  if (isPatternTex(t)) {
    const rows = TILE_PATTERNS[t];
    const c = rows[texMod(y, rows.length)].charAt(texMod(x, rows[0].length));
    return c === "#" ? 1 : 0;
  }
  const T = TILE_NOISE_PERIOD[t];
  if (T == null) return 0;
  const px = texMod(x, T), py = texMod(y, T);
  seed = seed | 0;
  if (TEX_WATER[t]) return texWaterLevel(t, px, py, seed, 0, 1);                  // §181: frame 0 IS the still
  if (t === "grain") return texH32(px, py, seed) < 0.12 ? 1 : 0;
  if (t === "stars") { const v = texH32(px, py, seed); return v < 0.010 ? 2 : (v < 0.046 ? 1 : 0); }
  if (t === "brushed") return texH32(py, px >> 2, seed) < 0.34 ? 1 : 0;
  if (t === "noise") return texH32(px, py, seed) < 0.32 ? 1 : 0;
  if (TEX_LAB_PORTS[t]) return 4 - TEX_LAB_PORTS[t](px, py, seed);              // §173: the lab counts dark-first
  if (t === "woodgrain") {
    const k = (2 * Math.PI) / T;
    const yy = py + 3.6 * Math.sin(k * px * 2 + seed) + 1.4 * Math.sin(k * px * 5 + seed * 1.7);
    const v = texMod(yy, 8);
    return v < 1 ? 2 : v < 2.2 ? 1 : 0;
  }
  if (t === "fibres") {
    // GRAIN RUNNING DOWN A WALL: four lines per 32 px column, each at its own hashed position, with its
    // own slow sway, BROKEN into segments so they read as strokes rather than corrugation. The first
    // version was woodgrain transposed — every line the same sine, every 8 px — and next to AJ's
    // hand-drawn walls it read as sheet metal (2026-10-07). Everything here repeats on T = 32: line
    // positions and phases are per line, the segment hash is taken mod T.
    const k = (2 * Math.PI) / T;
    for (let i = 0; i < 4; i++) {
      const x0 = i * 8 + Math.floor(texH32(i, seed, 41) * 6);
      const sway = 1.8 * Math.sin(k * py + texH32(i, seed, 43) * 6.283) + 0.6 * Math.sin(2 * k * py + texH32(i, seed, 47) * 6.283);
      const dx = texMod(px - x0 - Math.round(sway) + T / 2, T) - T / 2;
      if (dx !== 0 && dx !== 1) continue;
      // Segments 4 rows long, about two in three drawn; the second pixel of width only now and then.
      if (texH32(i, py >> 2, seed + 53) > 0.68) continue;
      if (dx === 1 && texH32(i, py >> 1, seed + 59) > 0.3) continue;
      return dx === 0 ? 2 : 1;
    }
    return 0;
  }
  if (t === "bands") {
    // GAS-GIANT BANDS: four bands per 32, of UNEVEN width (boundaries hashed from the seed — equal 8px
    // bands read as wallpaper stripes in the first Jupiter mock-up), with boundaries flowing on two slow
    // horizontal waves and a faint 4px-block wobble. ALTERNATING tones (light, dark, mid-light,
    // mid-dark) rather than a staircase, which would read as a gradient instead of belts and zones.
    const k = (2 * Math.PI) / T;
    const yy = texMod(py + 2.2 * Math.sin(k * px + seed) + 0.8 * Math.sin(2 * k * px + seed * 1.7)
                   + (texH32(px >> 2, py >> 2, seed + 61) - 0.5) * 0.8, 32);
    const b1 = 5 + Math.floor(texH32(seed, 1, 71) * 5), b2 = b1 + 5 + Math.floor(texH32(seed, 2, 71) * 6),
          b3 = b2 + 4 + Math.floor(texH32(seed, 3, 71) * 6);
    return yy < b1 ? 0 : yy < b2 ? 2 : yy < b3 ? 1 : 3;
  }
  if (t === "strata") {
    // SANDSTONE SEDIMENT: five layers per 32 of seeded, uneven thickness — NEARLY STRAIGHT (a faint
    // 0.6px wave), which is what separates rock strata from Jupiter's flowing gas belts — with sandy
    // GRAIN: about one pixel in seven nudged a tone up or down. Tones cycle so neighboring layers
    // always differ.
    const k = (2 * Math.PI) / T;
    const yy = texMod(py + 0.6 * Math.sin(k * px + seed), 32);
    let b = 0, edge = 0;
    for (let i = 0; i < 5; i++) {
      edge += 4 + Math.floor(texH32(seed, i, 83) * 5);
      if (yy < edge * 32 / 42.5 || i === 4) { b = i; break; }
    }
    let lv = [1, 3, 0, 2, 3][b];
    const g = texH32(px, py, seed + 89);
    if (g < 0.07) lv = Math.max(0, lv - 1); else if (g > 0.93) lv = Math.min(3, lv + 1);
    return lv;
  }
  if (t === "hexes") {
    // HEX PANELS (Earth II, §32): the humans' engineered surface, millions of years on — a lattice of
    // panel centers 16 apart across, 16 down, every other row offset by 8, so the nearest-center cells
    // are hexagons and the whole lattice repeats on 32. Seams where two cells meet (3); each panel lit
    // across its upper part (0), plain in the middle (1), shaded low (2).
    let d1 = 1e9, d2 = 1e9, cyy = 0, pi = 0, pj = 0;
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) {
      const cx = i * 16 + (texMod(j, 2) ? 8 : 0), cy = j * 16;
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (d < d1) { d2 = d1; d1 = d; cyy = cy; pi = texMod(i, 2); pj = texMod(j, 2); } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 1.2) return 3;
    const dy = py + 0.5 - cyy;
    const hl = dy < -4 ? 0 : dy > 5 ? 2 : 1, sv = texSeedVary(seed);
    if (sv) {
      // §47: one lit panel and one dark one of the four per period, picked by the seed
      const id = pi + pj * 2;
      if (id === texSeedPick(seed, 4, 0)) return hl === 2 ? 1 : 0;
      if (id === texSeedPick(seed, 4, 1)) return hl === 0 ? 1 : 2;
    }
    return hl;
  }
  if (t === "chrome") {
    // LIQUID METAL (Mercury, §31): long streaks running DOWN the surface (waves mostly across x), a
    // dark-to-mid body with a thin HARD highlight streak — chrome reflects in sharp lines, which is what
    // separates quicksilver from water (swell, caustic) shading smoothly. A first version folded the
    // field into repeating bands and drew closed ovals: leopard print, not liquid. A rare glint.
    // ONE DOMINANT wave across x (streaks along y) and two weak ones that only bend it: equal weights
    // close the contours into loops (it read as chain-link).
    const k = (2 * Math.PI) / T, ph = seed * 0.6180339887;
    const n = 0.5 + 0.5 * (0.68 * Math.sin(k * px + ph) + 0.22 * Math.sin(k * (2 * px + py) + ph * 2)
                           + 0.1 * Math.sin(k * (px - 2 * py) + ph * 3));
    if (texH32(px, py, seed + 139) < 0.006) return 0;
    return n < 0.28 ? 3 : n < 0.5 ? 2 : n < 0.6 ? 1 : n < 0.68 ? 0 : n < 0.8 ? 1 : 2;
  }
  if (t === "cells") {
    // GRANULATION (the Sun, §30): the boiling convection cells of a star's surface — a Voronoi pattern
    // on the 32 px TORUS (distances wrap both ways), so it repeats like every other texture. Bright cell
    // centers (level 0) cooling outward, dark lanes where cells meet (3).
    let d1 = 1e9, d2 = 1e9;
    for (let i = 0; i < 7; i++) {
      let dx = Math.abs(px + 0.5 - texH32(seed, i, 127) * T), dy = Math.abs(py + 0.5 - texH32(seed, i, 131) * T);
      dx = Math.min(dx, T - dx); dy = Math.min(dy, T - dy);
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 1.1) return 3;
    // Shaded RELATIVE TO THE CELL'S OWN SIZE (d1 against the half-way point to the next center): with
    // absolute radii most of every cell fell in the outer band and the pattern read as dark blobs.
    const t = d1 / ((d1 + d2) / 2);
    const lv = t < 0.5 ? 0 : t < 0.85 ? 1 : 2;
    return texH32(px, py, seed + 137) < 0.05 ? Math.min(3, lv + 1) : lv;
  }
  if (t === "plating") {
    // RIVETED PLATING (Earth, §29: the robots' home, all machine). 16 px panels in courses offset by half
    // a panel, so seams never line up into a grid. Level 3 is the seam and a rivet's shadow, level 0 the
    // bevel catching light and the rivet heads, 1 the plate, 2 grime: streaks running down from rivets
    // and the odd darker replacement panel. Two panels per 32 each way, so it all wraps.
    const row = py >> 4, pxo = texMod(px + (row & 1) * 8, T), col = pxo >> 4;
    const u = pxo & 15, v = py & 15;
    if (u === 0 || v === 0) return 3;
    const sv = texSeedVary(seed);
    // §47: a rivet gone (no head, no shadow) — hashed per rivet
    const gone = sv && (texMod(col, 2) * 4 + (u > 8 ? 1 : 0) + (v > 8 ? 2 : 0)) + texMod(row, 2) * 8 === texSeedPick(seed, 16, 0);
    const rv = (u === 2 || u === 13) && (v === 2 || v === 13);
    if (rv) return gone ? 1 : 0;
    if ((u === 3 || u === 14) && (v === 3 || v === 14)) return gone ? 1 : 3;
    if (u === 1 || v === 1) return 0;
    const patched = texH32(col, row, seed + 107) < 0.22;
    // grime: a streak down from a top rivet, its length hashed per panel and side
    const side = u < 8 ? 0 : 1, sx = side ? 13 : 2;
    if (u === sx && v > 3 && v < 4 + Math.floor(texH32(col * 2 + side, row, seed + 109) * 10)) {
      return sv && texMod(col, 2) * 2 + side + texMod(row, 2) * 4 === texSeedPick(seed, 8, 1) ? 3 : 2;   // §47: heavy grime
    }
    if (texH32(px, py, seed + 113) < 0.04) return 2;
    return patched ? 2 : 1;
  }
  if (t === "slant") {
    // TILTED LAYERS (Uranus, §27: a planet knocked onto its side). Five seeded layers per 32, as strata,
    // but measured along the DIAGONAL x + y. 45° is the only slant that wraps: a period-32 layering along
    // y + m·x repeats across 32 px of x only when 32·m is a multiple of 32, so m must be a whole number,
    // and m = 1 is the one that still reads as tilted rather than nearly vertical. The ripple runs along
    // the other diagonal (x − y), which also wraps. Less grain than sandstone: ice, not sand.
    const k = (2 * Math.PI) / T;
    const yy = texMod(py + px + 0.8 * Math.sin(k * (px - py) + seed), 32);
    let b = 0, edge = 0;
    for (let i = 0; i < 5; i++) {
      edge += 4 + Math.floor(texH32(seed, i, 97) * 5);
      if (yy < edge * 32 / 42.5 || i === 4) { b = i; break; }
    }
    let lv = [1, 3, 0, 2, 3][b];
    const g = texH32(px, py, seed + 103);
    if (g < 0.03) lv = Math.max(0, lv - 1); else if (g > 0.97) lv = Math.min(3, lv + 1);
    return lv;
  }
  if (t === "asphalt") {
    // ROAD SURFACE (city, §36): a dark binder (1) peppered with light aggregate (0) and darker grit (2),
    // a couple of squarish TAR PATCHES (2) where it was cut and mended — ragged by a hash on their
    // edges — and two hairline CRACKS (3) wandering a pixel at a time. A crack's wander is a running sum
    // of hashed steps along its own length, so it is drawn the same in every period.
    for (let i = 0; i < 2; i++) {
      const vert = texH32(i, seed, 151) < 0.5, len = 8 + Math.floor(texH32(i, seed, 157) * 9);
      const s0 = Math.floor(texH32(i, seed, 163) * T), p0 = Math.floor(texH32(i, seed, 167) * T);
      const a = texMod((vert ? py : px) - s0, T);
      if (a >= len) continue;
      let off = 0;
      for (let j = 0; j < a; j++) { const st = texH32(i, j, seed + 173); off += st < 0.32 ? -1 : st > 0.68 ? 1 : 0; }
      if (texMod((vert ? px : py) - p0 - off, T) === 0) return 3;
    }
    for (let i = 0; i < 2; i++) {
      const x0 = Math.floor(texH32(i, seed, 179) * T), y0 = Math.floor(texH32(i, seed, 181) * T);
      const w = 4 + Math.floor(texH32(i, seed, 191) * 6), hh = 3 + Math.floor(texH32(i, seed, 193) * 4);
      const dx = texMod(px - x0, T), dy = texMod(py - y0, T);
      if (dx >= w || dy >= hh) continue;
      const rim = dx === 0 || dy === 0 || dx === w - 1 || dy === hh - 1;
      if (rim && texH32(px, py, seed + 197) < 0.3) continue;
      return texH32(px, py, seed + 199) < 0.08 ? 3 : 2;
    }
    const g = texH32(px, py, seed + 211);
    return g < 0.06 ? 0 : g > 0.92 ? 2 : 1;
  }
  if (t === "cobble") {
    // COBBLESTONES (city, §36): rounded setts on a staggered 8 px lattice (four to a row, alternate rows
    // shifted by half a stone), each center jittered by a hashed pixel or two, cut into cells by
    // TORUS distance like `cells`. Dark mortar (3) where cells meet and wherever a cell reaches past
    // its stone's radius, which rounds the corners off; lit from the upper left (0), shaded low-right (2).
    let d1 = 1e9, d2 = 1e9, ox = 0, oy = 0, id = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const cx = i * 8 + (j & 1) * 4 + 4 + (texH32(i, j, seed + 211) - 0.5) * 3;
      const cy = j * 8 + 4 + (texH32(i, j, seed + 223) - 0.5) * 3;
      let dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      dx = texMod(dx + T / 2, T) - T / 2; dy = texMod(dy + T / 2, T) - T / 2;
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; ox = dx; oy = dy; id = j * 4 + i; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 1.4 || d1 > 5.2) return 3;
    const lit = ox + oy;
    if (lit < -2.6) return 0;
    if (lit > 2.2) return 2;
    return texH32(id, 0, seed + 227) < 0.25 && texH32(px, py, seed + 229) < 0.3 ? 2 : 1;
  }
  if (t === "shingles") {
    // ROOF SHINGLES (city, §36): courses 8 px deep, shingles 8 wide, alternate courses shifted by
    // half a shingle plus a hashed pixel or two, so the slots neither stack nor fall into a ruled brick
    // bond. Each shingle's butt — its LOWER edge — catches the light (0), its lower corners are clipped
    // round, and it throws a dark line (3) onto the course below, whose upper part sits in shade (2). A
    // hashed one in five is weathered: half its pixels a tone darker, DITHERED, so it reads as wear and
    // not as a missing shingle (solid dark ones did).
    const sh = (r) => (r & 1) * 4 + Math.floor(texH32(texMod(r, 4), seed, 233) * 3);
    const row = py >> 3, v = py & 7, xx = texMod(px + sh(row), T), cu = xx >> 3, u = xx & 7;
    if (v === 0) return 3;
    if (u === 0 && v < 7) return 3;
    if (v === 7) return u === 0 || u === 7 ? 3 : 0;
    if (v === 6 && (u === 1 || u === 7)) return 2;
    if (v <= 2) return 2;
    const sv = texSeedVary(seed);
    if (sv) {
      // §47: one missing shingle (a dark gap) and one new pale one of the sixteen per period
      const id = texMod(cu, 4) + texMod(row, 4) * 4;
      if (id === texSeedPick(seed, 16, 0)) return 3;
      if (id === texSeedPick(seed, 16, 1)) return 0;
    }
    return texH32(cu + texMod(row, 4) * 4, seed, 239) < 0.2 && ((px + py) & 1) ? 2 : 1;
  }
  if (t === "facade") {
    // BUILDING FRONT (city, §36): one window per 16 px bay, two bays and two floors per 32. Wall (1)
    // with a faint brick fleck; each window framed, with a lit sill (0) and its shadow (2) under it. A
    // hashed share of windows are LIT — glass at the lightest level (0) with dark mullions (2), so a
    // light palette end reads as glow — and the rest dark glass (3) with one diagonal glint (2).
    const u = px & 15, v = py & 15, bay = px >> 4, fl = py >> 4;
    if (v === 15) return 2;
    if (u >= 4 && u <= 11 && v === 12) return 0;
    if (u >= 5 && u <= 10 && v === 13) return 2;
    if (u >= 4 && u <= 11 && v >= 2 && v <= 11) {
      if (u === 4 || u === 11 || v === 2) return 2;
      // Four windows per period: a hashed half lit, but never all four the same (that reads as a
      // pattern fill, not as a building someone lives in) — if they agree, one is flipped.
      const id = bay + fl * 2, sv = texSeedVary(seed), on = (n) => texH32(n, seed, 251) < 0.5;
      const n = on(0) + on(1) + on(2) + on(3), flip = (n === 0 || n === 4) && id === texMod(seed, 4);
      // §47: from seed 256 the LIT PATTERN itself is a counter — one of the 14 patterns that are not
      // all alike, a different one for 14 seeds in a row — because lit-versus-dark glass is the one
      // difference every ramp span shows. (Picks that only drew a curtain or removed a glint moved
      // middle levels, which CrunchyUI's narrow spans merge: its boil test saw 5 pictures in 6.)
      const lit = sv ? ((texMod(seed, 14) + 1) >> id & 1) === 1 : on(id) !== flip;
      // ...and one window, picked by the seed, draws its curtain half (lit) or shows a lamp (dark).
      const pick = sv && id === texSeedPick(seed, 4, 0);
      if (lit) return u === 7 || v === 6 || v === 3 || (pick && v > 6) ? 2 : 0;
      if (pick && v > 7 && u > 5 && u < 10) return 0;
      return u - v === 2 || u - v === 3 ? 2 : 3;
    }
    return texH32(px, py, seed + 257) < 0.035 ? 2 : 1;
  }
  if (t === "planks") {
    // FLOORBOARDS (city, §36): boards 8 px wide running across, each row butted at one hashed joint (3),
    // now and then two, so joints never line up; a dark seam (3) under every board and its top edge lit
    // (0); one wavy, broken grain line (2) per board length, and a nail head (3) either side of a joint.
    const row = py >> 3, v = py & 7;
    if (v === 7) return 3;
    const j0 = Math.floor(texH32(row, seed, 263) * T), two = texH32(row, seed, 269) < 0.35;
    const j1 = j0 + 14 + Math.floor(texH32(row, seed, 271) * 5);
    const a = texMod(px - j0, T), b = two ? texMod(px - j1, T) : 99;
    if (a === 0 || b === 0) return 3;
    if ((a === 2 || a === T - 2 || b === 2 || b === T - 2) && v === 3) return 3;
    if (v === 0) return 0;
    const seg = two && b < a ? 1 : 0, k = (2 * Math.PI) / T;
    const ph = texH32(row, seg, seed + 277) * 6.283, c = 2.5 + texH32(row, seg, seed + 281) * 2;
    const yy = v + 1.1 * Math.sin(k * 2 * px + ph) + 0.5 * Math.sin(k * 5 * px + ph * 2);
    if (Math.abs(yy - c) < 0.5 && texH32(px >> 2, row, seed + 283) > 0.2) return 2;
    return 1;
  }
  if (t === "scales") {
    // OVERLAPPING SCALES (§36: fish, dragon, pangolin): round scales on a lattice 16 across and 8 down,
    // alternate rows offset by half, each UPPER row lying over the one beneath — so a pixel belongs to
    // the highest scale that covers it and what shows of each is its rounded lower part. Outline (3) on
    // that rounded edge, a lit band just inside it (0), and a shadow (2) cast just under the edges of
    // the row above. 8 across and 4 down was tried first: too small to read as anything but texture.
    const R = 9.2;
    for (let j = -2; j <= 5; j++) {
      const cy = j * 8, off = texMod(j, 2) * 8;
      const dy = py + 0.5 - cy;
      if (dy < -R || dy > R) continue;
      const dx = texMod(px + 0.5 - off + 8, 16) - 8;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      if (d > R - 1.2) return 3;
      if (dy > 1 && d > R - 2.6) return 0;
      // the cast shadow: a band just below the rounded edges of the two scales lying over this one
      const ux = texMod(px + 0.5 - (off + 8) + 8, 16) - 8, uy = dy + 8;
      const sl = Math.hypot(ux, uy) < R + 1.6 ? 2 : 1, sv = texSeedVary(seed);
      if (sv) {
        // §47: one scale of the eight per period catches the light, another is darker
        const id = texMod(Math.floor((px + 0.5 - off + 8) / 16), 2) + texMod(j, 4) * 2;
        if (id === texSeedPick(seed, 8, 0)) return sl === 2 ? 1 : 0;
        if (id === texSeedPick(seed, 8, 1)) return sl === 1 ? 2 : 3;
      }
      return sl;
    }
    return 3;
  }
  if (t === "ripples") {
    // WIND RIPPLES IN SAND (§36): four ripples per 32, bent by two slow integer waves so they wrap. Each
    // is ASYMMETRIC like a real dune ripple — a long gentle windward face (1) rising to a lit crest (0),
    // then a short steep lee face in shadow (3) easing into the trough (2). Sand grain flecks either way.
    const k = (2 * Math.PI) / T;
    const yy = py + 1.6 * Math.sin(k * px + seed) + 0.7 * Math.sin(k * (2 * px - py) + seed * 1.7);
    const w = texMod(yy, 8);
    let lv = w < 1.2 ? 0 : w < 2.4 ? 3 : w < 4 ? 2 : 1;
    const g = texH32(px, py, seed + 293);
    if (g < 0.05) lv = Math.max(0, lv - 1); else if (g > 0.95) lv = Math.min(3, lv + 1);
    return lv;
  }
  if (t === "circuit") {
    // CIRCUIT BOARD (§36; the robots' worlds): copper traces (0) on the board (1) along a 4 x 4 grid of
    // nodes 8 px apart, each link present by hash; a trace casts a pixel of shadow (2) below and to its
    // right; a node ending a single trace is a via pad — a lit ring around a drilled hole (3). Links wrap
    // node 3 back to node 0, so the net repeats on 32.
    const H = (i, j) => texH32(texMod(i, 4) + texMod(j, 4) * 4, seed, 307) < 0.55;   // node (i,j) — (i+1,j)
    const V = (i, j) => texH32(texMod(i, 4) + texMod(j, 4) * 4, seed, 311) < 0.5;    // node (i,j) — (i,j+1)
    const deg = (i, j) => H(i, j) + H(i - 1, j) + V(i, j) + V(i, j - 1);
    const on = (x, y) => {
      const i = texMod(x - 4, T) >> 3, j = texMod(y - 4, T) >> 3, u = texMod(x - 4, 8), w = texMod(y - 4, 8);
      if (u === 0 && w === 0) return deg(i, j) > 0;
      return (w === 0 && H(i, j)) || (u === 0 && V(i, j));
    };
    // the via: a 3 x 3 pad around any node with exactly one trace
    const ru = texMod(px - 3, 8) - 1, rw = texMod(py - 3, 8) - 1;
    if (ru <= 1 && rw <= 1 && deg(texMod(px - 4 - ru, T) >> 3, texMod(py - 4 - rw, T) >> 3) === 1) {
      return ru === 0 && rw === 0 ? 3 : 0;
    }
    if (on(px, py)) return 0;
    if (on(px, py - 1) || on(px - 1, py)) return 2;
    return texH32(px, py, seed + 313) < 0.04 ? 2 : 1;
  }
  if (t === "gravel") {
    // GRAVEL: packed small stones — a jittered point every 4 px (an 8 x 8 lattice per 32, wrapping),
    // nearest point = the stone. Dark where two stones meet; each stone lit at its upper left and shaded
    // at its lower right, so it reads as a pebble with form, not a dot.
    let d1 = 1e9, d2 = 1e9, cx = 0, cy = 0;
    const gx = px >> 2, gy = py >> 2;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ix = texMod(gx + i, 8), iy = texMod(gy + j, 8);
      const qx = (gx + i) * 4 + 0.6 + texH32(ix, iy, seed + 401) * 2.8, qy = (gy + j) * 4 + 0.6 + texH32(ix, iy, seed + 409) * 2.8;
      const d = Math.hypot(px + 0.5 - qx, py + 0.5 - qy);
      if (d < d1) { d2 = d1; d1 = d; cx = px + 0.5 - qx; cy = py + 0.5 - qy; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 0.9) return 3;
    const s2 = cx + cy;
    return s2 < -1.2 ? 0 : s2 > 1.3 ? 2 : 1;
  }
  if (t === "speckle") {
    // SPECKLE: granite — two octaves of smooth, wrapping value noise give soft patches (levels 1-2),
    // and sparse sharp flecks give it bite (0 light, 3 dark). Mottling with structure, not static.
    // fine lattices (4 and 2 px): at 8 and 4 it made camouflage blobs that visibly repeated
    const n = 0.6 * texValueNoise(px, py, 4, seed) + 0.4 * texValueNoise(px, py, 2, seed + 1);
    const f = texH32(px, py, seed + 419);
    if (f < 0.035) return 3;
    if (f > 0.975) return 0;
    return n < 0.5 ? 1 : 2;
  }
  if (t === "stucco") {
    // STUCCO: plaster — broad soft blotches, ordered-dithered between two tones so the transitions are
    // grainy rather than hard, and small pits (a dark pixel with a lit one above it) here and there.
    const n = 0.7 * texValueNoise(px, py, 16, seed) + 0.3 * texValueNoise(px, py, 8, seed + 2);
    const pit = texH32(px, py, seed + 421) < 0.025, under = texH32(px, texMod(py + 1, T), seed + 421) < 0.025;
    if (pit) return 3;
    if (under) return 0;
    return n * 16 > TEX_BAYER4[py & 3][px & 3] * 0.5 + 4 ? 1 : 2;
  }
  if (t === "metal") {
    // BRUSHED METAL: long horizontal streaks — each row a smooth wrapping tone along x, so streaks run
    // and fade instead of flickering per pixel — with bright highlight runs and the odd dark scratch.
    const row = texValueNoise1(px, 16, seed + py * 7) * 0.6 + texH32(py, 0, seed + 431) * 0.4;
    if (texH32(py, px >> 3, seed + 433) < 0.06 && texH32(px, py, seed + 437) < 0.8) return 0;          // a highlight run
    if (texMod(px - py * 2, T) === 0 && texH32(px >> 2, py >> 2, seed + 439) < 0.1) return 3;          // a scratch
    return row < 0.45 ? 1 : 2;
  }
  if (t === "bookshelf") {
    // BOOKSHELF (new areas, §58): shelves every 16 px — a dark board (3) with a lit lip (1) — holding books
    // of hashed widths (1-4 px) and heights; each book's spine in one of three tones, some with a lighter
    // title band, and the dark wall behind showing above the short ones. Widths are drawn per shelf from
    // the seed and wrap on 32.
    const row = py >> 4, v = py & 15;
    if (v === 15) return 3;
    if (v === 14) return 1;
    let x = 0, k = 0, w = 1;
    while (true) {
      w = 1 + Math.floor(texH32(row, k, seed + 577) * 4);
      if (x + w > 32) w = 32 - x;
      if (px < x + w) break;
      x += w; k++;
    }
    const top = 2 + Math.floor(texH32(row, k, seed + 587) * 5);
    if (v < top) return 3;
    if (px === x + w - 1 && w > 1) return 3;                                    // the gap between books
    const tone = Math.floor(texH32(row, k, seed + 593) * 3);
    if (w > 2 && (v === top + 3 || v === top + 4) && texH32(row, k, seed + 599) < 0.5) return tone === 0 ? 2 : 0;
    return tone;
  }
  if (t === "brushstroke") {
    // BRUSHSTROKE (new areas, §58): a painted canvas — short strokes on a jittered 8 px lattice, each a
    // line of hashed length and slant in one of three tones, laid over a softly mottled ground; strokes
    // overlap, later ones on top. Torus distances, so it wraps on 32.
    const g = texValueNoise(px, py, 32, seed);                                  // one soft patch per period
    let best = -1, lv = g < 0.4 ? 2 : 1;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const cx = i * 8 + 4 + (texH32(i, j, seed + 601) - 0.5) * 6, cy = j * 8 + 4 + (texH32(i, j, seed + 607) - 0.5) * 6;
      const a = 0.35 + (texH32(i, j, seed + 613) - 0.5) * 0.9, L = 3.5 + texH32(i, j, seed + 617) * 3;
      let dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      dx = texMod(dx + 16, 32) - 16; dy = texMod(dy + 16, 32) - 16;
      const along = dx * Math.cos(a) + dy * Math.sin(a), across = -dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(along) <= L && Math.abs(across) <= 1.15 - 0.4 * Math.abs(along) / L) { const order = j * 4 + i; if (order > best) { best = order; lv = Math.floor(texH32(i, j, seed + 619) * 4); } }
    }
    return lv;
  }
  if (t === "wallpaper") {
    // WALLPAPER (new areas, §57): a damask on a 16 px lattice — diamond trellis lines (1), a small motif in
    // each diamond (2) with a shadow under it (3), on the ground tone (0). The seed shifts the lattice and
    // picks the motif (a diamond or a cross), so a boil changes it.
    const off = texMod(seed, 4) * 4, u = texMod(px + off, 16) - 8, v = texMod(py + (seed >> 2 & 1) * 8, 16) - 8;
    if (Math.abs(Math.abs(u) + Math.abs(v) - 8) < 0.6) return 1;
    const motif = (seed >> 3 & 1) ? (Math.abs(u) <= 1 && Math.abs(v) <= 3) || (Math.abs(v) <= 1 && Math.abs(u) <= 3) : Math.abs(u) + Math.abs(v) <= 3;
    if (motif) return 2;
    const below = (seed >> 3 & 1) ? (Math.abs(u) <= 1 && v === 4) || (Math.abs(u - 1) <= 2 && v === 2 && u > 0) : Math.abs(u - 1) + Math.abs(v - 1) <= 3;
    return below ? 3 : 0;
  }
  if (t === "leaves") return texLeavesLevel(px, py, seed);
  if (t === "rubble") {
    // RUBBLE (the Asteroid Belt, §53): a rubble-pile asteroid's packed boulders, for any mine or ruin.
    // Not `cobble`: no lattice to read. A 4 x 4 grid of seeds per 32 with big jitter, a hashed one in four
    // LEFT OUT so its neighbors grow into it, and each seed weighted by its own radius (distance minus
    // radius), so stones come in mixed sizes. Dark matrix (3) where stones meet and past a stone's reach;
    // each stone lit from the upper left (0) and shaded low-right (2), with a fleck of grit in the middle.
    let d1 = 1e9, d2 = 1e9, ox = 0, oy = 0, rr = 0, id = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      if (texH32(i, j, seed + 541) < 0.2) continue;
      const cx = i * 8 + 4 + (texH32(i, j, seed + 547) - 0.5) * 5;
      const cy = j * 8 + 4 + (texH32(i, j, seed + 557) - 0.5) * 5;
      const r = 3.5 + texH32(i, j, seed + 563) * 4;
      let dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      dx = texMod(dx + T / 2, T) - T / 2; dy = texMod(dy + T / 2, T) - T / 2;
      const raw = Math.hypot(dx, dy), d = raw - r;
      if (d < d1) { d2 = d1; d1 = d; ox = dx; oy = dy; rr = r; id = j * 4 + i; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 1.3 || d1 > 2.6) return 3;
    const lit = (ox + oy) / Math.max(2, rr);
    if (lit < -0.7) return 0;
    if (lit > 0.55) return 2;
    return texH32(px, py, seed + 569) < 0.08 + 0.1 * texH32(id, 1, seed + 571) ? 2 : 1;
  }
  if (t === "turf") {
    // TURF: short grass, drawn the way pixel art draws it — a light vertical stroke 2-3 px tall with a
    // dark shadow pixel beside its root, one per 4 x 4 cell (cells staggered by 2 px row to row so they
    // never line up), over a two-tone mottled ground. (Two first versions — blades spilling across cells,
    // then 1 px blades in 2 x 4 cells — read as hatching and as rows of dots.)
    const cy = py >> 2, sx = texMod(px + (cy & 1) * 2, T), cx = sx >> 2, lx = sx & 3, ly = py & 3;
    const hx = texH32(texMod(cx, 8), texMod(cy, 8), seed + 443), hy = texH32(texMod(cx, 8), texMod(cy, 8), seed + 449);
    const bx = Math.floor(hx * 3), len = 2 + (hy < 0.5 ? 1 : 0), top = 3 - len + 1 > 0 ? 3 - len : 0;
    if (lx === bx && ly >= top && ly <= top + len - 1) return 0;                      // the blade
    if (lx === bx + 1 && ly === top + len - 1) return 3;                              // its shadow
    return texValueNoise(px, py, 8, seed + 3) < 0.5 ? 1 : 2;
  }
  if (t === "clouds") {
    const coarse = texH32(px >> 2, py >> 2, seed);
    const fine = texH32(px >> 1, py >> 1, seed + 101);
    return coarse * 0.65 + fine * 0.35 < 0.5 ? 1 : 0;
  }
  if (t === "swell") {
    const n = (texWaveField(px, py, T, seed, TEX_SWELL_WAVES) + 1) / 2;
    return n < 0.41 ? 0 : n < 0.59 ? 1 : n < 0.83 ? 2 : 3;
  }
  // caustic
  const n = (texWaveField(px, py, T, seed, TEX_CAUSTIC_WAVES) + 1) / 2;
  let r = 1 - Math.abs(2 * n - 1);
  r = r * r * r * r;
  return r < 0.425 ? 0 : r < 0.683 ? 1 : r < 0.94 ? 2 : 3;
}

// LEAVES (2026-10-21, CrunchyTile §145: a forest canopy seen from above, AJ: "actual leaves"). Pointed leaves hanging
// tip down (each turned up to 57 degrees either way), overlapping like shingles: 4 staggered rows of 6 per 32 (wrapping on
// the torus), every upper row lying over the one below so a pixel belongs to the topmost leaf over it. A leaf is a lens
// (pointed at both ends) split by its MIDRIB (2): the half facing the light (upper left) lit (1) with a bright band (0)
// along it, the other half in shade (2), a dark rim (3) round its shaded edge and its tip; a leaf lying over another
// casts a 1 px shadow down and right onto it; the gaps are the dark of the canopy (3). Seeded: every seed lays its own
// (sizes, turns and jitter); 4 x 6 a period, so the leaves are big enough to read at 32 px (8 x 8 read as texture).
const TEX_LEAF_ROWS = 4, TEX_LEAF_COLS = 6;
function texLeafList(seed) {
  const out = [];
  for (let j = 0; j < TEX_LEAF_ROWS; j++) for (let i = 0; i < TEX_LEAF_COLS; i++) {
    const k = j * TEX_LEAF_COLS + i, a = Math.PI / 2 + (texH32(k, seed, 701) - 0.5) * 2;
    out.push({ cx: (i + 0.5 + (j & 1) * 0.5) * 32 / TEX_LEAF_COLS + (texH32(k, seed, 703) - 0.5) * 2.5,
               cy: (j + 0.5) * 32 / TEX_LEAF_ROWS + (texH32(k, seed, 709) - 0.5) * 2.5,
               ux: Math.cos(a), uy: Math.sin(a), hl: 5 + texH32(k, seed, 719) * 1.4, hw: 2.7 + texH32(k, seed, 727) * 0.8,
               z: TEX_LEAF_ROWS - j + texH32(k, seed, 733) * 0.8 });
  }
  return out;
}
// The topmost leaf over point (x, y) of the 32 px torus: { k, u, v, w, hl } (u along the leaf from its middle, v across,
// w its half width there), or null.
function texLeafAt(list, x, y) {
  let best = null;
  for (let k = 0; k < list.length; k++) {
    const L = list[k];
    if (best && L.z <= best.z) continue;
    const dx = texMod(x - L.cx + 16, 32) - 16, dy = texMod(y - L.cy + 16, 32) - 16;
    const u = dx * L.ux + dy * L.uy, v = -dx * L.uy + dy * L.ux;
    if (u < -L.hl || u > L.hl) continue;
    const t = (u + L.hl) / (2 * L.hl), w = L.hw * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
    if (Math.abs(v) > w) continue;
    best = { k: k, z: L.z, u: u, v: v, w: w, hl: L.hl, L: L };
  }
  return best;
}
const TEX_LEAF_CACHE = new Map();
function texLeavesLevel(px, py, seed) {
  let list = TEX_LEAF_CACHE.get(seed);
  if (!list) { if (TEX_LEAF_CACHE.size >= 64) TEX_LEAF_CACHE.clear(); list = texLeafList(seed); TEX_LEAF_CACHE.set(seed, list); }
  const x = px + 0.5, y = py + 0.5, h = texLeafAt(list, x, y);
  if (!h) return 3;
  // which half faces the light: the side whose outward normal points up and left
  const nx = -h.L.uy, ny = h.L.ux, litSide = (nx + ny) < 0 ? 1 : -1, s = h.v * litSide;
  let lv;
  if (Math.abs(h.v) < 0.5 && h.u < h.hl - 1.2) lv = 2;                          // the midrib
  else if (s > 0) lv = s > 0.9 && s < h.w - 0.6 ? 0 : 1;                       // the lit half, a bright band along it
  else lv = -s > h.w - 1 || h.u > h.hl - 1.3 ? 3 : 2;                           // the shaded half, its dark rim
  // a leaf lying over this one casts its shadow down and right
  const up = texLeafAt(list, x - 1, y - 1);
  if (up && up.z > h.z && lv < 3) lv = Math.min(3, lv + 1);
  return lv;
}

// ============================================================================================
// FIVE FROM THE LAB (2026-11-01, CrunchyTile §173). CrunchyTexture's staging library (texture-lab.js) drew these for its
// dungeons; they tile on 32 and read as top-down tiles too: parquet (labParquet), tatami (labTatami), pebbles
// (labRiverstones), argyle (labBankfloor), basalt (labBasalt). Ported pixel for pixel (texH32 IS labH32, the same salts),
// each returning the lab's TONE, 0 darkest .. 4 lightest, which texLevelStill turns over (this file counts 0 lit). The one
// difference: basalt's ember, a fire material only the lab has, is its plain tone 3 here. core.test.mjs compares every
// pixel with the lab's over 12 seeds. Self-contained (textures.js depends on nothing): the helpers are copies.
function texLabRand(a, b, seed, salt) { return texH32(a + Math.imul(salt, 1013), b - Math.imul(salt, 7919), seed * 131 + salt); }
// Wrapped value noise on a cw x ch grid over a W x H period, smoothstepped (labNoise at 1x).
function texLabNoise(x, y, cw, ch, W, H, seed, salt) {
  const gw = W / cw, gh = H / ch, gx = Math.floor(x / cw), gy = Math.floor(y / ch);
  let fx = (x - gx * cw) / cw, fy = (y - gy * ch) / ch;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = texMod(gx, gw), x1 = texMod(gx + 1, gw), y0 = texMod(gy, gh), y1 = texMod(gy + 1, gh);
  const a = texLabRand(x0, y0, seed, salt), b = texLabRand(x1, y0, seed, salt);
  const c = texLabRand(x0, y1, seed, salt), d = texLabRand(x1, y1, seed, salt);
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}
// Which column of uneven widths x falls in: [index, x within it, its width] (labCourse).
function texLabCourse(x, starts, W) {
  const n = starts.length;
  let i = n - 1;
  for (let j = 0; j < n; j++) if (starts[j] <= x) i = j;
  const s0 = starts[i], s1 = i + 1 < n ? starts[i + 1] : starts[0] + W;
  return [i, texMod(x - s0, W), texMod(s1 - s0, W) || W];
}
// Nearest of fixed points on a W torus: [second minus first distance, the nearest's index, its offset] (labCells).
function texLabCells(x, y, pts, W) {
  let d1 = 1e9, d2 = 1e9, k = 0, ox = 0, oy = 0;
  for (let i = 0; i < pts.length; i++) {
    const dx = texMod(x - pts[i][0] + W / 2, W) - W / 2, dy = texMod(y - pts[i][1] + W / 2, W) - W / 2;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; k = i; ox = dx; oy = dy; } else if (d < d2) d2 = d;
  }
  return [d2 - d1, k, ox, oy];
}
const TEX_LAB_PEBBLES = [[3, 3], [11, 2], [19, 4], [27, 2], [7, 10], [15, 9], [23, 11], [31, 9],
                         [3, 18], [11, 17], [20, 19], [27, 17], [7, 26], [15, 25], [23, 27], [30, 25]];
const TEX_LAB_BASALT_COLS = [0, 7, 13, 20, 26];
const TEX_LAB_PORTS = {
  // 8 px squares of three boards each, every other square turned: the joints dark, a lit edge, a few stains
  parquet: function (x, y, s) {
    const cx = x >> 3, cy = y >> 3, across = (cx + cy) & 1, a = across ? x & 7 : y & 7;
    if ((a & 3) === 0) return 0;
    if ((a & 3) === 1) return 3;
    if (texLabNoise(x, y, 16, 16, 32, 32, s, 221) > 0.72) return 0;
    if (texMod(x - y, 32) === 0) return 4;
    const tone = texLabRand(cx * 2 + (across ? a >> 2 : 0), cy * 2 + (across ? 0 : a >> 2), s, 220) < 0.4 ? 1 : 2;
    return texLabRand(x, y, s, 222) < 0.05 ? tone - 1 : tone;
  },
  // mats 16 px wide with dark cloth borders, the woven rush in rows of 4, a few worn patches
  tatami: function (x, y, s) {
    const u = x & 15;
    if (y === 0 || u === 0 || u === 15) return 0;
    if (u === 1 || u === 14) return 1;
    if (texLabNoise(x, y, 8, 8, 32, 32, s, 244) > 0.72) return 2;
    if ((y & 3) === 0) return 2;
    return texLabRand(x, y, s, 245) < 0.04 ? 4 : 3;
  },
  // sixteen rounded stones, lit on the upper left, shaded on the lower right, dark between
  pebbles: function (x, y, s) {
    const c = texLabCells(x, y, TEX_LAB_PEBBLES, 32), edge = c[0], k = c[1], ox = c[2], oy = c[3];
    if (edge < 1.2) return 0;
    const tone = texLabRand(k, 0, s, 543) < 0.4 ? 1 : 0;
    if (ox + oy < -2.5) return 4 - tone;
    if (ox + oy > 2.5) return 1;
    return 3 - tone;
  },
  // diamonds on a 16 px lattice, alternate ones dark, a stitch where the lines cross
  argyle: function (x, y, s) {
    const a = texMod(x + y, 16), b = texMod(x - y, 16);
    if (a === 0 || b === 0) return 1;
    if (a === 8 && b === 8) return 4;
    const dark = (Math.floor(texMod(x + y, 32) / 16) + Math.floor(texMod(x - y, 32) / 16)) & 1;
    return texLabRand(x, y, s, 1243) < 0.03 || dark ? 2 : 3;
  },
  // columns of uneven widths, a lit right edge, broken by joints at their own heights
  basalt: function (x, y, s) {
    const c = texLabCourse(x, TEX_LAB_BASALT_COLS, 32), i = c[0], u = c[1], w = c[2];
    if (u === w - 1) return 4;
    if (u === w - 2) return texLabRand(i, y >> 2, s, 1) < 0.5 ? 3 : 0;
    if (texMod(y + Math.floor(texLabRand(i, 0, s, 2) * 8), 8) === 0) return texLabRand(i, y, s, 3) < 0.25 ? 3 : 0;
    if (u === 0) return 2;
    if (texLabRand(x, y, s, 4) < 0.03) return 3;                               // the lab's ember, as a plain light fleck
    return texLabNoise(x, y, 4, 8, 32, 32, s, 5) < 0.35 ? 0 : 1;
  },
};

// Level -> ramp index between r0 and r1 inclusive. A two-level texture is a stencil (r0 or r1);
// more levels step evenly across the span.
function textureIndex(t, x, y, r0, r1, seed, f, N) {
  if (texIsGen(t)) return texGenIndexValue(t, x, y, r0, r1, seed);
  if (texIsBuiltinGen(t)) return typeof texGenBuiltinIndex === "function" ? texGenBuiltinIndex(t, x, y, r0, r1, seed, 1) : r0;
  const L = textureLevels(t);
  if (L <= 1) return r0;
  const lv = textureLevel(t, x, y, seed, f, N);
  return L === 2 ? (lv ? r1 : r0) : Math.round(r0 + (r1 - r0) * (lv / (L - 1)));
}

// ============================================================================================
// DETAIL (TILE-DESIGN.md §83, a SPIKE, 2026-10-10): a texture drawn at s x the resolution with the SAME
// features, so a 64 px tile has finer pixels rather than bigger ones. (X, Y) are WHOLE pixels at the high
// resolution; the period becomes 32 * s, which still divides the tile.
//
// Two coordinate systems: the SMOOTH fields (value noise, the shapes of things) are read at X / s, so their
// features keep their size in the world; the PIXEL effects (dither, flecks, pits, a blade's 1 px stroke) are
// read at X itself, so they get finer. A texture not converted yet takes the exact 32 px texture at s x
// (chunky, never wrong): the spike converts the three that Side view uses most.
// ============================================================================================
const TEX_DETAIL = { speckle: true, stucco: true, turf: true,
  // Tile §179 (2026-11-06, AJ: "for consistency's sake"): the structured classics the presets lean on, so Interiors and
  // every tab gain from 64 px tiles. Each brick, board and stone the SAME SIZE in the world (the same hashes, the same
  // lattice); at s x its joints are one fine pixel, its outlines smooth, its grain and grit finer.
  bricks: true, tiles: true, planks: true, woodgrain: true, cobble: true, rubble: true, gravel: true, wallpaper: true, plating: true };
const TEX_DETAIL_CACHE = new Map();
function texDetailLevel(t, X, Y, seed, s) {
  const P = 32 * s, x = texMod(X, P), y = texMod(Y, P), u = x / s, v = y / s;    // u, v: the 32 px world
  seed = seed | 0;
  if (t === "speckle") {
    const n = 0.6 * texValueNoise(u, v, 4, seed) + 0.4 * texValueNoise(u, v, 2, seed + 1);
    const f = texH32(x, y, seed + 419);
    if (f < 0.035) return 3;
    if (f > 0.975) return 0;
    // the same crisp two-tone patches, their outlines now smooth curves instead of 2 px steps (a fine
    // dither was tried first: it read as noise, not detail)
    return n < 0.5 ? 1 : 2;
  }
  if (t === "stucco") {
    const n = 0.7 * texValueNoise(u, v, 16, seed) + 0.3 * texValueNoise(u, v, 8, seed + 2);
    const pit = texH32(x, y, seed + 421) < 0.02, under = texH32(x, texMod(y + 1, P), seed + 421) < 0.02;
    if (pit) return 3;
    if (under) return 0;
    return n * 16 > TEX_BAYER4[y & 3][x & 3] * 0.5 + 4 ? 1 : 2;
  }
  if (t === "turf") {
    // the same short grass, one blade per 4 x 4 cell of the 32 px world, but each blade a 1 px stroke
    // twice as tall, with a 1 px shadow, over the same mottled ground dithered at the fine resolution
    const cs = 4 * s, cy = Math.floor(y / cs), sx = texMod(x + (cy & 1) * 2 * s, P), cx = Math.floor(sx / cs);
    const lx = sx - cx * cs, ly = y - cy * cs;
    const hx = texH32(texMod(cx, 8), texMod(cy, 8), seed + 443), hy = texH32(texMod(cx, 8), texMod(cy, 8), seed + 449);
    const bx = Math.floor(hx * 3) * s + (texH32(cx, cy, seed + 457) < 0.5 ? 0 : 1), len = (2 + (hy < 0.5 ? 1 : 0)) * s, top = cs - len;
    if (lx === bx && ly >= top) return 0;                                           // the blade
    if (lx === bx + 1 && ly >= cs - 2) return 3;                                    // its shadow, at the root
    return texValueNoise(u, v, 8, seed + 3) < 0.5 ? 1 : 2;
  }
  const T = 32, fx = (x + 0.5) / s, fy = (y + 0.5) / s, px = Math.floor(u), py = Math.floor(v);   // fx, fy: a fine pixel's center
  if (t === "bricks") {
    // mortar one fine pixel: under each 4 px course, and the course's joint (col 3, then col 7 on the next)
    const course = Math.floor(texMod(y, 8 * s) / (4 * s));
    return texMod(y, 4 * s) === 0 || texMod(x, 8 * s) === (course ? 7 : 3) * s ? 1 : 0;
  }
  if (t === "tiles") return texMod(y, 8 * s) === 0 || texMod(x, 8 * s) === 0 ? 1 : 0;
  if (t === "woodgrain") {
    const k = (2 * Math.PI) / T, yy = fy + 3.6 * Math.sin(k * fx * 2 + seed) + 1.4 * Math.sin(k * fx * 5 + seed * 1.7), w = texMod(yy, 8);
    return w < 0.55 ? 2 : w < 1.4 ? 1 : 0;
  }
  if (t === "planks") {
    const B = 8 * s, row = Math.floor(y / B), vf = texMod(y, B);
    if (vf === B - 1) return 3;                                                     // the seam under the board
    const j0 = Math.floor(texH32(row, seed, 263) * T), two = texH32(row, seed, 269) < 0.35;
    const j1 = j0 + 14 + Math.floor(texH32(row, seed, 271) * 5);
    const a = texMod(x - j0 * s, P), b = two ? texMod(x - j1 * s, P) : 99 * s;
    if (a === 0 || b === 0) return 3;                                               // the butt joint
    if ((a === 2 * s || a === P - 2 * s || b === 2 * s || b === P - 2 * s) && vf === 3 * s) return 3;   // a nail head
    if ((a === 2 * s + 1 || a === P - 2 * s + 1 || b === 2 * s + 1 || b === P - 2 * s + 1) && vf === 3 * s + 1) return 2;
    if (vf === 0) return 0;                                                         // the lit top edge
    const seg = two && b < a ? 1 : 0, k = (2 * Math.PI) / T;
    const ph = texH32(row, seg, seed + 277) * 6.283, c = 2.5 + texH32(row, seg, seed + 281) * 2;
    const yy = fy - row * 8 + 1.1 * Math.sin(k * 2 * fx + ph) + 0.5 * Math.sin(k * 5 * fx + ph * 2);
    if (Math.abs(yy - c) < 0.3 && texH32(px >> 2, row, seed + 283) > 0.2) return 2;
    return texH32(x, y, seed + 287) < 0.025 ? 2 : 1;                                // a fleck of grain
  }
  if (t === "cobble" || t === "rubble") {
    let d1 = 1e9, d2 = 1e9, ox = 0, oy = 0, rr = 4, id = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      let cx, cy, r = 0;
      if (t === "cobble") {
        cx = i * 8 + (j & 1) * 4 + 4 + (texH32(i, j, seed + 211) - 0.5) * 3; cy = j * 8 + 4 + (texH32(i, j, seed + 223) - 0.5) * 3;
      } else {
        if (texH32(i, j, seed + 541) < 0.2) continue;
        cx = i * 8 + 4 + (texH32(i, j, seed + 547) - 0.5) * 5; cy = j * 8 + 4 + (texH32(i, j, seed + 557) - 0.5) * 5; r = 3.5 + texH32(i, j, seed + 563) * 4;
      }
      let dx = fx - cx, dy = fy - cy;
      dx = texMod(dx + T / 2, T) - T / 2; dy = texMod(dy + T / 2, T) - T / 2;
      const d = Math.hypot(dx, dy) - r;
      if (d < d1) { d2 = d1; d1 = d; ox = dx; oy = dy; rr = r; id = j * 4 + i; } else if (d < d2) d2 = d;
    }
    if (t === "cobble") {
      if (d2 - d1 < 0.9 || d1 > 5.3) return 3;
      const lit = ox + oy;
      if (lit < -2.8) return 0;
      if (lit > 2.3) return 2;
      return texH32(id, 0, seed + 227) < 0.25 && texH32(x, y, seed + 229) < 0.3 ? 2 : texH32(x, y, seed + 231) < 0.012 ? 2 : 1;
    }
    if (d2 - d1 < 0.85 || d1 > 2.8) return 3;
    const lit = (ox + oy) / Math.max(2, rr);
    if (lit < -0.72) return 0;
    if (lit > 0.58) return 2;
    return texH32(x, y, seed + 569) < 0.03 + 0.05 * texH32(id, 1, seed + 571) ? 2 : 1;
  }
  if (t === "gravel") {
    let d1 = 1e9, d2 = 1e9, cx = 0, cy = 0;
    const gx = px >> 2, gy = py >> 2;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ix = texMod(gx + i, 8), iy = texMod(gy + j, 8);
      const qx = (gx + i) * 4 + 0.6 + texH32(ix, iy, seed + 401) * 2.8, qy = (gy + j) * 4 + 0.6 + texH32(ix, iy, seed + 409) * 2.8;
      const d = Math.hypot(fx - qx, fy - qy);
      if (d < d1) { d2 = d1; d1 = d; cx = fx - qx; cy = fy - qy; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 0.55) return 3;
    const s2 = cx + cy;
    return s2 < -1.3 ? 0 : s2 > 1.4 ? 2 : 1;
  }
  if (t === "wallpaper") {
    const off = texMod(seed, 4) * 4, uu = texMod(fx - 0.5 + off, 16) - 8, vv = texMod(fy - 0.5 + (seed >> 2 & 1) * 8, 16) - 8;
    if (Math.abs(Math.abs(uu) + Math.abs(vv) - 8) < 0.3) return 1;
    const cross = (seed >> 3 & 1) === 1;
    if (cross ? (Math.abs(uu) <= 1.25 && Math.abs(vv) <= 3.25) || (Math.abs(vv) <= 1.25 && Math.abs(uu) <= 3.25) : Math.abs(uu) + Math.abs(vv) <= 3.25) return 2;
    const below = cross ? (Math.abs(uu) <= 1.25 && vv >= 3.5 && vv < 4.5) || (Math.abs(uu - 1) <= 2.25 && vv >= 1.5 && vv < 2.5 && uu > 0)
      : Math.abs(uu - 1) + Math.abs(vv - 1) <= 3.25;
    return below ? 3 : 0;
  }
  if (t === "plating") {
    // a seam and a bevel each one fine pixel; rivets, grime and patched panels as at 32 (their 32 px pixel, doubled)
    const row = Math.floor(y / (16 * s)), xo = texMod(x + (row & 1) * 8 * s, P), uf = texMod(xo, 16 * s), vf = texMod(y, 16 * s);
    if (uf === 0 || vf === 0) return 3;
    if (uf === 1 || vf === 1) return 0;
    const lv = textureLevel(t, px, py, seed), u32 = texMod(px + (row & 1) * 8, T) & 15, v32 = py & 15;
    if (u32 <= 1 || v32 <= 1) return texH32(Math.floor(xo / (16 * s)), row, seed + 107) < 0.22 ? 2 : 1;   // what was seam or bevel: plate
    return lv;
  }
  return textureLevel(t, Math.floor(X / s), Math.floor(Y / s), seed);
}
// The index, as textureIndex gives it. Animated textures take the 32 px frame at s x.
function textureIndexDetail(t, X, Y, r0, r1, seed, s, f, N) {
  if (!(s > 1)) return textureIndex(t, X, Y, r0, r1, seed, f, N);
  // §175: one of YOUR textures draws itself at s x (texgen.js), its pieces the same size in the world, its joints finer
  if (texIsGen(t) && typeof texGenIndexValueDetail === "function") return texGenIndexValueDetail(t, X, Y, r0, r1, seed, s);
  if (texIsBuiltinGen(t) && typeof texGenBuiltinIndex === "function") return texGenBuiltinIndex(t, X, Y, r0, r1, seed, s);
  if (!TEX_DETAIL[t] || (N > 1 && texMod(f | 0, N))) return textureIndex(t, Math.floor(X / s), Math.floor(Y / s), r0, r1, seed, f, N);
  const L = textureLevels(t);
  if (L <= 1) return r0;
  // §175: ONE PERIOD, REMEMBERED, as at 32 px (TEX_PERIOD_CACHE): a converted texture's 32 s period filled once, lazily
  let lv;
  if ((X | 0) === X && (Y | 0) === Y) {
    const key = t + "|" + (seed | 0) + "|" + s;
    let c = TEX_DETAIL_CACHE.get(key);
    if (!c) {
      if (TEX_DETAIL_CACHE.size >= 128) TEX_DETAIL_CACHE.clear();
      c = { P: 32 * s, lv: new Int8Array(32 * s * 32 * s).fill(-1) };
      TEX_DETAIL_CACHE.set(key, c);
    }
    const i = texMod(Y, c.P) * c.P + texMod(X, c.P);
    lv = c.lv[i];
    if (lv < 0) lv = c.lv[i] = texDetailLevel(t, X, Y, seed, s);
  } else lv = texDetailLevel(t, X, Y, seed, s);
  return L === 2 ? (lv ? r1 : r0) : Math.round(r0 + (r1 - r0) * (lv / (L - 1)));
}


// GENERATED from crunchyCore/fire.js @ b1ff26d by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 78c9998321dbb12cd0327b30072051a013f1196ced5f25f6880c624ff8cef790
"use strict";
// THE FIRE AUTOMATON (moved from CrunchyVFX's vfx.js pixFireSim, VFX-DESIGN.md §55; 2026-11-23, for CrunchyTexture's torches).
// Pure: no DOM, no app state. Every app that draws pixel fire draws it with this, so a torch in CrunchyTexture's places burns
// exactly as CrunchyVFX's Torch Flame does.
//
// The demo-scene fire: heat on a grid, fed along a source line at the origin, each step every cell taking the heat of a cell
// below it (a little to one side: the flicker; Wind leans it) less a random cooling. It GATHERS from the row below (every
// cell written once per step), so a cell's heat is a function of the last few dozen steps only; with its random draws
// repeating every clip (a loop), the fire itself repeats exactly after a warm-up, and the loop is seamless with no blending.
//
//   fireSim(o) -> { steps, max, sy, w, h }
//     o: { w, h        the grid, in pixels
//          ax, ay      the source line's middle (ay: its top row; rows ay and ay + 1 are fuel, never drawn)
//          frames      how many frames the clip has
//          loop        true: a seamless loop (warmed up first); false: a one-shot lit from cold at its first frame
//          seed        the fire's seed (a whole number)
//          speed       automaton steps per frame, 1.. (default 3)
//          height      how far up it reaches, a share of h (default 0.6)
//          width       how wide its source is, a share of w (default 0.4)
//          wind        -1..1, a gust leaning each step (default 0)
//          spread      0..1, how often a source cell flares (VFX's Flicker, default 0.5)
//          heat        0..1, the source's heat (0: no fire)
//          clips       (tests) how many clips to simulate after the warm-up (default 1): a loop's later clips repeat the first }
//     steps: one Float32Array (w x h, row by row) of heat per frame; max: the heat scale (36); sy: the source's top row.
//   fireIndex(heat, max, n) -> the ramp index (0 the coolest .. n - 1 the hottest) a cell's heat draws in, or -1 for none
//     (the coolest fifth is left empty: the flame's edge). Only rows above sy are flame; the source rows are the fuel.
//
// The math is VFX's to the bit (its frame hash proves it): same hash, same order of operations, Float32 grids.
const FIRE_BUILD = 1;
const FIRE_MAX = 36;

// the hash RNG (VFX's hash32 and rnd, under this file's prefix): 0..1 for (i, salt) under `seed`
function fireHash32(a) {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
  return t >>> 0;
}
function fireRnd(seed, i, salt) {
  return fireHash32(fireHash32(Math.imul(i, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)) ^ Math.imul(salt, 0xc2b2ae35)) / 4294967296;
}
const fireClamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function fireSim(o) {
  const Wa = o.w, Ha = o.h, ax = o.ax, ay = o.ay, NL = o.frames, loop = !!o.loop, seed = o.seed;
  const spd = Math.max(1, Math.round(o.speed || 3)), per = NL * spd;
  const H0 = Math.max(0.05, o.height == null ? 0.6 : o.height), W0 = Math.max(0.02, o.width == null ? 0.4 : o.width);
  const MAX = FIRE_MAX, rows = Math.max(4, H0 * Ha), cool = 1.7 * MAX / rows;
  const wind = Math.max(-1, Math.min(1, o.wind || 0)), spread = fireClamp01(o.spread == null ? 0.5 : o.spread);
  const x0 = Math.round(ax - W0 * Wa / 2), x1 = Math.round(ax + W0 * Wa / 2), sy = Math.min(Ha - 1, Math.max(0, Math.round(ay)));
  const heat0 = MAX * fireClamp01(o.heat);
  let cur = new Float32Array(Wa * Ha), nxt = new Float32Array(Wa * Ha);
  // a loop warms up a whole number of clips past the fire's memory (its height) and keeps the clip after; a one-shot
  // lights from cold at its first frame
  const warm = loop ? Math.ceil((rows + 4) / per + 1) * per : 0, total = warm + NL * spd * Math.max(1, o.clips | 0), steps = [];
  for (let n = 0; n < total; n++) {
    const salt = loop ? n % per : n, w = Math.round(wind * fireRnd(seed + salt * 13, 0, 512) * 1.6);   // a gust leans the whole step
    for (let y = 0; y < Ha; y++) for (let x = 0; x < Wa; x++) {
      const j = y * Wa + x;
      if (y >= sy) {                                          // the source rows: flickering heat along the line
        const inside = y <= sy + 1 && x >= x0 && x <= x1, e = Math.min(x - x0, x1 - x) / Math.max(1, (x1 - x0) * 0.2);
        nxt[j] = inside ? heat0 * Math.min(1, 0.4 + 0.6 * e) * (fireRnd(seed + salt * 31, x, 510) < 0.2 + 0.45 * spread ? 1.25 : 0.15) : 0;
        continue;
      }
      // the average of the three cells below and the one under them (the classic demo fire), less a random cooling
      const at = (xx, yy) => (xx < 0 || xx >= Wa || yy >= Ha ? 0 : cur[yy * Wa + xx]);
      const xs = x - w;
      nxt[j] = Math.max(0, (at(xs - 1, y + 1) + at(xs, y + 1) + at(xs + 1, y + 1) + at(xs, y + 2)) * 0.25 - cool * fireRnd(seed + salt * 389, j, 513));
    }
    const t2 = cur; cur = nxt; nxt = t2;
    if (n >= warm && (n - warm) % spd === spd - 1) steps.push(cur.slice());
  }
  return { steps, max: MAX, sy, w: Wa, h: Ha };
}

// a cell's heat on a ramp of n colors: -1 below a fifth of the scale (nothing drawn), else 0 (coolest) .. n - 1 (hottest)
function fireIndex(heat, max, n) {
  const h = heat / max;
  if (h < 0.2) return -1;
  return Math.max(0, Math.min(n - 1, Math.floor((h - 0.2) / 0.8 * n)));
}

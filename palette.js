// GENERATED from crunchyCore/palette.js @ 8dbe68a by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 f1ee7ed724204a504a8e6811e690d3e9dec1ae1741fc9e59b227ee5c2dfe1a72
"use strict";
// crunchyCore — SHARED PALETTES (PALETTES.md, AJ 2026-10-25: palettes are "used darn near everywhere"). One palette model
// for the whole suite, its file formats, and the planted palette kind, so a palette made in one app follows the person
// to every other app planted in the same game. The editor window is palette-ui.js; this file is the engine. Pure: no DOM.
//
// THE MODEL: a palette is RAMPS, and so also a flat set.
//   { kind: "palette", name: "Moonlit keep", ramps: [ { name: "Stone", colors: ["#e8e4f0", …, "#1e1828"] }, { name: "Moss", … } ] }
//   A COLOR SET is the same shape with kind "set" and exactly ONE ramp, its name the set's: { kind: "set", name: "Fire",
//   ramps: [{ name: "Fire", colors: [...] }] }. A set is first-class (AJ, 2026-10-25: one named set, "Fire", kept and
//   shared across the apps "may be a bigger lever than the actual palettes"): it is planted on its own (kind "colorset"),
//   and every ramp of every palette can be used as one (paletteSets). A set has a stable `id` apart from its name
//   (paletteSets), so a built-in list (UI's themes, Items' materials: the next step) can join later without renaming.
//   - A ramp runs LIGHT → DARK (the order Tile, UI, Character and Items use; Texture and Shader reverse at their door).
//   - The flat set (paletteFlat) is every ramp's colors in order, each once: VFX's lock and Shader's params read that.
//   - Colors are "#rrggbb", lowercase. No alpha: a palette is opaque colors (transparency is the art's, not the palette's).
//
// WHAT IS HERE
//   paletteParse(text)                    a palette FILE or a paste → { colors, name?, ramps? } | { error } (plain words)
//   paletteFromPixels(rgba, w, h, max)    a picture → at most `max` colors, light → dark (Tile's median cut, moved)
//   paletteGroup(colors)                  a flat list → ramps: hue families, grays their own ramp, each light → dark
//   paletteFit(ramp, k)                   a ramp → exactly k tones, NEVER a color that is not in the ramp
//   paletteNearest(c, colors)             redmean, era.js's eraNes / shader.js's "redmean" exactly
//   paletteHex / paletteGpl / paletteGodot   .hex (Lospec), .gpl (GIMP, Aseprite, Krita), .tres (Godot 4 ColorPalette)
//   paletteEncode / paletteDecode         a share-link string, versioned, exact
//   PALETTE_STARTERS                      starters we may ship: hardware palettes and our own (CC0), see below
//   PALETTE_APP, paletteSave              the planted kind: crunchy/palettes/<slug>/ (plant.js 17)
//
// MOVED HERE (credit where it came from): paletteParse is CrunchyVFX's parsePaletteFile (index.html "Palette lock",
// 2026-10) grown to .pal and CSS-style pastes; paletteFromPixels is CrunchyTile's rampFromPixels + medianCut (tile.js,
// TILE-DESIGN §18), byte for byte in what it picks. The apps keep their copies until they switch (PALETTES.md step 2).

const PALETTE_BUILD = 2;   // 2: the GAME PALETTE (paletteGame / paletteSetGame: one planted palette marked the game's)

const PALETTE_MAX = 256;               // colors in one palette, every ramp together (the .gpl / indexed-PNG ceiling)
const PALETTE_RAMPS_MAX = 64;          // ramps in one palette
const PALETTE_NAME_MAX = 40;           // characters in a palette's or a ramp's name
const PALETTE_MERGE = 10;              // paletteFromPixels: colors closer than this (RGB distance) are one (Tile's RAMP_MERGE)

// ---- colors -------------------------------------------------------------------------------------------------------
// "#rrggbb" from "#RGB", "#rrggbb", "rrggbb", "0xrrggbb" or [r, g, b]; null for anything else.
function paletteHexOf(c) {
  if (Array.isArray(c)) {
    if (c.length < 3 || !c.slice(0, 3).every(function (v) { return Number.isInteger(v) && v >= 0 && v <= 255; })) return null;
    return "#" + c.slice(0, 3).map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
  }
  const s = String(c == null ? "" : c).trim().toLowerCase();
  let m = /^(?:#|0x)?([0-9a-f]{6})$/.exec(s);
  if (m) return "#" + m[1];
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  return m ? "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3] : null;
}
function paletteRgb(hex) { const h = paletteHexOf(hex); return h ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : null; }
// Brightness as the eye sees it (Rec. 601 luma, the order Tile's ramps have always used).
function paletteLuma(hex) { const c = paletteRgb(hex); return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
// OKLab (Björn Ottosson, 2020; public domain): the grouping's idea of lightness, chroma and hue.
function paletteOklab(hex) {
  const lin = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const c = paletteRgb(hex), r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L: L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}

// ---- the model ----------------------------------------------------------------------------------------------------
function paletteCleanName(s, fallback) {
  const n = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, PALETTE_NAME_MAX).trim();
  return n || fallback;
}
// A palette with every field present and in range: names cleaned, colors "#rrggbb", empty ramps dropped, at most
// PALETTE_RAMPS_MAX ramps and PALETTE_MAX colors (a hand-edited sidecar or a link never reaches an app as nonsense).
// A color may sit in two ramps (a shared shadow is a real pixel-art habit); the flat set keeps it once.
// A SET keeps its first ramp only, and that ramp is named for the set.
function paletteClean(pal) {
  const p = pal && typeof pal === "object" ? pal : {}, set = p.kind === "set";
  const out = { kind: set ? "set" : "palette", name: paletteCleanName(p.name, set ? "Untitled set" : "Untitled palette"), ramps: [] };
  let total = 0;
  for (const r of Array.isArray(p.ramps) ? p.ramps : []) {
    if (out.ramps.length >= PALETTE_RAMPS_MAX || total >= PALETTE_MAX) break;
    const colors = (r && Array.isArray(r.colors) ? r.colors : []).map(paletteHexOf).filter(Boolean).slice(0, PALETTE_MAX - total);
    if (!colors.length) continue;
    total += colors.length;
    out.ramps.push({ name: paletteCleanName(r.name, "Ramp " + (out.ramps.length + 1)), colors: colors });
    if (set) { out.ramps[0].name = out.name; break; }
  }
  return out;
}
// A COLOR SET from ramp `i` of a palette (named for the ramp), and a set as a palette of its one ramp.
function paletteSetOf(pal, i) {
  const r = pal && pal.ramps && pal.ramps[i || 0];
  return r ? paletteClean({ kind: "set", name: r.name, ramps: [r] }) : null;
}
function paletteOfSet(set) { const p = paletteClean(Object.assign({}, set, { kind: "set" })); return paletteClean({ kind: "palette", name: p.name, ramps: p.ramps }); }
function paletteIsSet(p) { return !!p && p.kind === "set"; }
// Every ramp's colors in order, each color once.
function paletteFlat(pal) {
  const seen = {}, out = [];
  for (const r of (pal && pal.ramps) || []) for (const c of r.colors || []) { const h = paletteHexOf(c); if (h && !seen[h]) { seen[h] = 1; out.push(h); } }
  return out;
}
function paletteCount(pal) { return ((pal && pal.ramps) || []).reduce(function (n, r) { return n + ((r.colors || []).length); }, 0); }
// A flat list made a palette, its ramps found by paletteGroup.
function paletteFromColors(colors, name) { return paletteClean({ name: name, ramps: paletteGroup(colors) }); }

// ---- reading a palette file (CrunchyVFX's parsePaletteFile, moved and grown) ---------------------------------------------
// Every format a pixel artist brings, told apart by its first line:
//   GIMP .gpl      "GIMP Palette", then "Name:" / "Columns:" / "#" comments, then "R G B<tab>name" (Aseprite, Krita, Inkscape)
//   JASC .pal      "JASC-PAL", "0100", a count, then "R G B" (Paint Shop Pro, Pyxel Edit, many pixel tools)
//   paint.net .txt ";" comments, then AARRGGBB (alpha first); a color with alpha 00 is a blank slot and is skipped
//   Lospec .hex    one rrggbb per line
//   a paste        anything with colors in it: "#1a1c2c, #5d275d", "1a1c2c 5d275d", "#abc", "0x1a1c2c", "rgb(26, 28, 44)",
//                  "#rrggbbaa" (CSS order: alpha LAST); the words around them are ignored
// The first time a color appears it is kept; repeats go (paint.net pads its files with white). Windows line ends are fine.
// → { colors: ["#rrggbb" …], name? (a .gpl's Name:), ramps? (a .gpl this file wrote: its "<ramp> <n>" names, regrouped) }
//   | { error: what is wrong, in words a person can act on }
function paletteParse(text) {
  if (typeof text !== "string") return { error: "That isn't a palette: there is no text in it." };
  if (/[\u0000-\u0008\u000e-\u001a]/.test(text.slice(0, 4096)))
    return { error: "That file isn't text, so it isn't a palette this app reads. Palettes come as .hex, .gpl, .pal (JASC) or .txt (paint.net); a picture goes through Import image." };
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/), first = (lines.find(function (l) { return l.trim(); }) || "").trim();
  const cols = [], names = [], seen = {};
  const push = function (hex, nm) { if (!seen[hex]) { seen[hex] = 1; cols.push(hex); names.push(nm || ""); } };
  let name = "", bad = 0;
  const rgb3 = function (ln) {
    const m = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(.*))?$/.exec(ln);
    if (!m) return null;
    const c = [+m[1], +m[2], +m[3]];
    if (c.some(function (v) { return v > 255; })) { bad++; return null; }
    return { hex: paletteHexOf(c), name: (m[4] || "").trim() };
  };
  if (/^GIMP Palette/i.test(first)) {
    for (const raw of lines) {
      const ln = raw.trim();
      if (!ln || ln.charAt(0) === "#" || /^GIMP Palette/i.test(ln)) continue;
      const nm = /^name\s*:\s*(.*)$/i.exec(ln);
      if (nm) { name = nm[1].trim(); continue; }
      if (/^columns\s*:/i.test(ln)) continue;
      const c = rgb3(ln);
      if (c) push(c.hex, c.name); else bad++;
    }
  } else if (/^JASC-PAL/i.test(first)) {
    const body = lines.map(function (l) { return l.trim(); }).filter(Boolean);
    for (let i = 3; i < body.length; i++) { const c = rgb3(body[i]); if (c) push(c.hex); else bad++; }
  } else {
    for (const raw of lines) {
      const ln = raw.trim();
      if (!ln || ln.charAt(0) === ";" || ln.slice(0, 2) === "//") continue;
      // rgb(26, 28, 44) and rgba(…)
      const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)/gi;
      // (an rgb() becomes a hex token where it stands, so the colors keep the order they were written in)
      const rest = ln.replace(rgbRe, function (all, r, g, b) { const h = paletteHexOf([+r, +g, +b]); if (!h) bad++; return h ? " " + h + " " : " "; });
      for (const tok of rest.split(/[\s,;|]+/)) {
        const t = tok.replace(/^["'(\[]+|["')\].:]+$/g, "");
        if (!t) continue;
        let k;
        if ((k = /^([0-9a-f]{2})([0-9a-f]{6})$/i.exec(t))) { if (k[1] !== "00") push("#" + k[2].toLowerCase()); continue; }   // paint.net AARRGGBB
        if ((k = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(t))) { if (k[2] !== "00") push("#" + k[1].toLowerCase()); continue; }  // CSS #rrggbbaa
        const h = /^(#|0x)?[0-9a-f]{6}$/i.test(t) || /^#[0-9a-f]{3}$/i.test(t) ? paletteHexOf(t) : null;
        if (h) push(h);
      }
    }
  }
  if (!cols.length) return { error: bad ? "No colors could be read: the color lines have numbers past 255 or aren't “R G B”." :
    "No colors found. A palette is hex codes (#1a1c2c, one per line or separated by commas), or a .hex, .gpl, .pal or .txt file." };
  if (cols.length > PALETTE_MAX) return { error: "That has " + cols.length + " colors; a palette here holds at most " + PALETTE_MAX + "." };
  const out = { colors: cols };
  if (name) out.name = paletteCleanName(name, "");
  // a .gpl whose every color is named "<ramp> <n>" (paletteGpl writes them so) gets its ramps back as they were
  if (names.length && names.every(function (n) { return /^.+ \d+$/.test(n); })) {
    const ramps = [];
    names.forEach(function (n, i) {
      const r = n.replace(/ \d+$/, ""), last = ramps[ramps.length - 1];
      if (last && last.name === r) last.colors.push(cols[i]); else ramps.push({ name: r, colors: [cols[i]] });
    });
    out.ramps = ramps;
  }
  return out;
}

// ---- a picture → colors (CrunchyTile's rampFromPixels + medianCut, moved) ----------------------------------------------
// The opaque pixels' colors (alpha 128 and up), at most `max` of them (default 8): a weighted median cut when there are
// more, then near-duplicates merged (most-used first, so the survivor is the color the art actually uses), light → dark.
// The same picture always gives the same colors (ties broken by color value).
function paletteFromPixels(rgba, w, h, max) {
  max = Math.max(1, Math.min(PALETTE_MAX, Math.round(max) || 8));
  const n = Math.min(rgba ? rgba.length : 0, (w | 0) * (h | 0) * 4 || (rgba ? rgba.length : 0)), counts = {};
  for (let i = 0; i + 3 < n; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const k = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts[k] = (counts[k] || 0) + 1;
  }
  let cols = Object.keys(counts).map(function (k) { k = +k; return { c: [(k >> 16) & 255, (k >> 8) & 255, k & 255], n: counts[k] }; });
  if (!cols.length) return [];
  if (cols.length > max) cols = paletteMedianCut(cols, max);
  cols.sort(function (a, b) { return b.n - a.n || paletteKey(a.c) - paletteKey(b.c); });
  const kept = [];
  cols.forEach(function (e) {
    const near = kept.filter(function (k) { return Math.hypot(k.c[0] - e.c[0], k.c[1] - e.c[1], k.c[2] - e.c[2]) < PALETTE_MERGE; })[0];
    if (near) near.n += e.n; else kept.push({ c: e.c.slice(), n: e.n });
  });
  const luma = function (c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; };
  kept.sort(function (a, b) { return luma(b.c) - luma(a.c) || paletteKey(a.c) - paletteKey(b.c); });
  return kept.map(function (e) { return paletteHexOf(e.c); });
}
function paletteKey(c) { return (c[0] << 16) | (c[1] << 8) | c[2]; }
// Weighted median cut: split the box with the widest channel range at its weighted median until there are `max`
// boxes; each box becomes its weighted mean color.
function paletteMedianCut(cols, max) {
  let boxes = [cols.slice()];
  while (boxes.length < max) {
    let bi = -1, best = -1, ch = 0;
    boxes.forEach(function (b, i) {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        b.forEach(function (e) { lo = Math.min(lo, e.c[c]); hi = Math.max(hi, e.c[c]); });
        if (hi - lo > best) { best = hi - lo; bi = i; ch = c; }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].slice().sort(function (x, y) { return x.c[ch] - y.c[ch] || paletteKey(x.c) - paletteKey(y.c); });
    let total = 0;
    b.forEach(function (e) { total += e.n; });
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += b[i].n; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  return boxes.map(function (b) {
    let n = 0, r = 0, g = 0, bl = 0;
    b.forEach(function (e) { n += e.n; r += e.c[0] * e.n; g += e.c[1] * e.n; bl += e.c[2] * e.n; });
    return { c: [Math.round(r / n), Math.round(g / n), Math.round(bl / n)], n: n };
  });
}

// ---- grouping a flat list into ramps ------------------------------------------------------------------------------------
// HUE FAMILIES, each light → dark, with the GRAYS (blacks, whites and the barely tinted) as their own ramp first.
// Pixel-art ramps SHIFT hue as they darken (a yellow light, an orange middle, a red shadow), so a family is a stretch of
// the hue wheel, not one narrow hue:
//   1. five colors or fewer in all is ONE ramp (a 4-color palette is a ramp: Handheld greens, a CGA mode)
//   2. a color whose OKLab chroma is under PALETTE_GRAY_C (less near black and white, where any tint is small) is gray;
//      more than PALETTE_RAMP_LONG grays split into warm, neutral and cool grays
//   3. the rest are cut round the hue wheel into k families, where the cut is the one with the least hue spread inside
//      the families (weighted by chroma, so a dull color's shaky hue counts for less), found exactly by dynamic
//      programming; k is a family per ~PALETTE_RAMP_SIZE colors, and at least one per gap wider than PALETTE_HUE_GAP
// Every color comes out exactly once (tests/palette.test.mjs proves it). Names say the family ("Reds", "Grays").
const PALETTE_GRAY_C = 0.035, PALETTE_HUE_GAP = 50, PALETTE_RAMP_LONG = 8, PALETTE_RAMP_SIZE = 5;
function paletteGroup(colors) {
  const seen = {}, list = [];
  for (const c of colors || []) { const h = paletteHexOf(c); if (h && !seen[h]) { seen[h] = 1; list.push(h); } }
  if (!list.length) return [];
  const byLight = function (a, b) { return paletteLuma(b) - paletteLuma(a) || (a < b ? -1 : a > b ? 1 : 0); };
  if (list.length <= 5) return [{ name: "Colors", colors: list.slice().sort(byLight) }];
  const lab = {}, grays = [], hued = [];
  list.forEach(function (h) {
    const o = lab[h] = paletteOklab(h), edge = Math.min(1, Math.min(o.L, 1 - o.L) * 4 + 0.35);
    (o.C < PALETTE_GRAY_C * edge ? grays : hued).push(h);
  });
  const ramps = [];
  if (grays.length > PALETTE_RAMP_LONG) {
    const warm = [], plain = [], cool = [];
    grays.forEach(function (h) { const o = lab[h]; (o.C < 0.008 ? plain : o.h > 20 && o.h < 160 ? warm : cool).push(h); });
    [["Warm grays", warm], ["Grays", plain], ["Cool grays", cool]].forEach(function (g) { if (g[1].length) ramps.push({ name: g[0], colors: g[1].sort(byLight) }); });
  } else if (grays.length) ramps.push({ name: "Grays", colors: grays.sort(byLight) });
  if (hued.length) paletteHueFamilies(hued, lab).forEach(function (f) { ramps.push({ name: paletteHueName(f, lab), colors: f.slice().sort(byLight) }); });
  // two ramps of one name ("Blues", "Blues") are told apart
  const count = {}, at = {};
  ramps.forEach(function (r) { count[r.name] = (count[r.name] || 0) + 1; });
  ramps.forEach(function (r) { if (count[r.name] > 1) { at[r.name] = (at[r.name] || 0) + 1; r.name += " " + at[r.name]; } });
  return ramps;
}
// The hued colors cut into families round the wheel (step 3 above): [[hex …] …], in hue order.
function paletteHueFamilies(hued, lab) {
  const n = hued.length;
  hued = hued.slice().sort(function (a, b) { return lab[a].h - lab[b].h || (a < b ? -1 : 1); });
  if (n === 1) return [hued];
  // unroll the wheel at its widest gap, so no family straddles it
  let start = 0, widest = -1;
  for (let i = 0; i < n; i++) { const d = ((lab[hued[(i + 1) % n]].h - lab[hued[i]].h) + 360) % 360; if (d > widest) { widest = d; start = (i + 1) % n; } }
  const ring = hued.slice(start).concat(hued.slice(0, start)), x = [], w = [];
  ring.forEach(function (h, i) {
    const v = lab[h].h; x.push(i === 0 ? v : x[i - 1] + ((v - lab[ring[i - 1]].h + 360) % 360));
    w.push(0.15 + Math.min(lab[h].C, 0.15) / 0.15);
  });
  let forced = 1;
  for (let i = 1; i < n; i++) if (x[i] - x[i - 1] > PALETTE_HUE_GAP) forced++;
  let k = Math.min(n, Math.max(forced, Math.round(n / PALETTE_RAMP_SIZE), 1));
  // weighted within-family spread of ring[i..j], from prefix sums
  const W = [0], WX = [0], WXX = [0];
  for (let i = 0; i < n; i++) { W.push(W[i] + w[i]); WX.push(WX[i] + w[i] * x[i]); WXX.push(WXX[i] + w[i] * x[i] * x[i]); }
  const cost = function (i, j) { const sw = W[j + 1] - W[i], sx = WX[j + 1] - WX[i]; return (WXX[j + 1] - WXX[i]) - sx * sx / sw; };
  // best[m][j]: the least spread of ring[0..j] in m + 1 families; from[m][j]: where the last one starts
  // (one more family while any is longer than PALETTE_RAMP_LONG: the table for k is the table for k - 1 plus a row)
  const best = [], from = [];
  best[0] = []; from[0] = [];
  for (let j = 0; j < n; j++) { best[0][j] = cost(0, j); from[0][j] = 0; }
  const row = function (m) {
    best[m] = []; from[m] = [];
    for (let j = 0; j < n; j++) {
      best[m][j] = Infinity; from[m][j] = j;
      for (let i = m; i <= j; i++) { const c = best[m - 1][i - 1] + cost(i, j); if (c < best[m][j] - 1e-9) { best[m][j] = c; from[m][j] = i; } }
    }
  };
  const cutInto = function (k) {
    while (best.length < k) row(best.length);
    const fams = [];
    for (let m = k - 1, j = n - 1; m >= 0; m--) { const i = from[m][j]; fams.unshift(ring.slice(i, j + 1)); j = i - 1; }
    return fams;
  };
  let fams = cutInto(k);
  while (k < n && fams.some(function (f) { return f.length > PALETTE_RAMP_LONG; })) fams = cutInto(++k);
  return fams;
}
// A family's name from its middle hue (OKLab degrees: red sits near 29, orange 55, yellow 110, green 142, cyan 195,
// blue 264, magenta 328), the mean taken with each color's chroma as its weight.
function paletteHueName(f, lab) {
  let x = 0, y = 0;
  f.forEach(function (h) { const o = lab[h]; x += o.C * Math.cos(o.h * Math.PI / 180); y += o.C * Math.sin(o.h * Math.PI / 180); });
  const d = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const names = [[10, "Pinks"], [42, "Reds"], [70, "Oranges"], [95, "Golds"], [125, "Yellows"], [170, "Greens"], [200, "Teals"],
    [235, "Cyans"], [285, "Blues"], [310, "Violets"], [345, "Purples"], [361, "Pinks"]];
  return names.find(function (n) { return d < n[0]; })[1];
}

// ---- fitting a ramp into k tones ------------------------------------------------------------------------------------------
// Exactly k colors, each one OF THE RAMP, in the ramp's order (light → dark stays light → dark): a strict game palette
// stays strict. Tone i takes the ramp's step round(i (n-1) / (k-1)):
//   a LONGER ramp gives k tones spread evenly across it, its lightest and darkest kept;
//   a SHORTER one repeats steps, neighbors merging the way the 2-4-shade eras merge a ramp (Pocket: two steps, one shade);
//   k = 1 takes the middle step. An empty ramp or k < 1 gives [].
function paletteFit(ramp, k) {
  const colors = Array.isArray(ramp) ? ramp : ramp && Array.isArray(ramp.colors) ? ramp.colors : [];
  const n = colors.length;
  k = Math.floor(k);
  if (!n || !(k >= 1)) return [];
  if (k === 1) return [colors[(n - 1) >> 1]];
  const out = [];
  for (let i = 0; i < k; i++) out.push(colors[Math.round(i * (n - 1) / (k - 1))]);
  return out;
}

// ---- the nearest color ----------------------------------------------------------------------------------------------------
// REDMEAN, the suite's one rule for new code (PALETTES.md): era.js's eraNes distance (2 + rm/256) dr² + 4 dg² +
// (2 + (255 - rm)/256) db², rm the two reds' mean, here times 512 in whole numbers, which is shader.js's
// shaderNearestPacked "redmean" form term for term (1024 + r + pr, 2048, 1534 - r - pr): the same order, no rounding.
// The FIRST color wins a tie (strict <), as both do. tests/palette.test.mjs checks it against both on random colors.
function paletteDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (1024 + a[0] + b[0]) * dr * dr + 2048 * dg * dg + (1534 - a[0] - b[0]) * db * db;
}
// c: "#rrggbb" or [r, g, b]; colors: "#rrggbb" strings or [r, g, b]s. → its index (-1 for an empty list)
function paletteNearestIndex(c, colors) {
  const p = Array.isArray(c) ? c : paletteRgb(c);
  let best = -1, bd = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const q = Array.isArray(colors[i]) ? colors[i] : paletteRgb(colors[i]), d = paletteDistance(p, q);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function paletteNearest(c, colors) { const i = paletteNearestIndex(c, colors); return i < 0 ? null : colors[i]; }
// A picture snapped to the colors: a new RGBA array, every pixel with alpha kept as it is, its RGB the nearest color.
// (The editor's preview of the host app's picture.) Memoized per distinct color, so big pictures stay quick.
function paletteSnap(rgba, colors) {
  const list = colors.map(function (c) { return Array.isArray(c) ? c : paletteRgb(c); }), out = new Uint8ClampedArray(rgba.length), memo = new Map();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    out[i + 3] = rgba[i + 3];
    if (!list.length || rgba[i + 3] === 0) { out[i] = rgba[i]; out[i + 1] = rgba[i + 1]; out[i + 2] = rgba[i + 2]; continue; }
    const k = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    let q = memo.get(k);
    if (!q) { q = list[paletteNearestIndex([rgba[i], rgba[i + 1], rgba[i + 2]], list)]; memo.set(k, q); }
    out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2];
  }
  return out;
}

// ---- writers ---------------------------------------------------------------------------------------------------------------
// .hex (Lospec): one rrggbb per line, the flat set. Aseprite, Lospec and most web tools read it.
function paletteHex(pal) { return paletteFlat(pal).map(function (h) { return h.slice(1); }).join("\n") + "\n"; }
// .gpl (GIMP): every ramp's colors in order, named "<ramp> <n>", so paletteParse hands the ramps back. Columns: the
// longest ramp, so GIMP and Aseprite lay a palette of equal ramps out one ramp per row. A color in two ramps is listed
// in both (a .gpl may repeat; the flat set will not).
function paletteGpl(pal) {
  const p = paletteClean(pal), cols = Math.min(16, Math.max(1, ...p.ramps.map(function (r) { return r.colors.length; }), 1));
  const L = ["GIMP Palette", "Name: " + p.name, "Columns: " + cols, "# " + p.name + ": " + paletteCount(p) + " colors in " + p.ramps.length +
    " ramp" + (p.ramps.length === 1 ? "" : "s") + ", light to dark. Made with the Crunchy suite."];
  p.ramps.forEach(function (r) {
    const rn = r.name;                                                // ("Blues 2 1": the reader takes only the LAST number off)
    r.colors.forEach(function (h, i) {
      const c = paletteRgb(h);
      L.push(c.map(function (v) { return ("  " + v).slice(-3); }).join(" ") + "\t" + rn + " " + (i + 1));
    });
  });
  return L.join("\n") + "\n";
}
// A float as Godot's text resources print one: the SHORTEST decimal that reads back as the same 32-bit float (Godot's
// Color is four float32s), so our file and Godot's own ResourceSaver write the same digits for a color.
function paletteF32(v) {
  const f = Math.fround(v);
  for (let p = 1; p <= 9; p++) { const s = String(+f.toPrecision(p)); if (Math.fround(+s) === f) return s; }
  return String(f);
}
// .tres: a Godot 4 ColorPalette resource (Godot 4.3+), the flat set. Its color picker's palette menu loads it ("Load"),
// and `load("res://…/x.tres").colors` is a PackedColorArray in a script. tests/palette-godot.mjs loads one in REAL Godot.
function paletteGodot(pal) {
  const nums = [];
  paletteFlat(pal).forEach(function (h) { paletteRgb(h).forEach(function (v) { nums.push(paletteF32(v / 255)); }); nums.push("1"); });
  return "[gd_resource type=\"ColorPalette\" format=3]\n\n[resource]\ncolors = PackedColorArray(" + nums.join(", ") + ")\n";
}

// ---- share links ------------------------------------------------------------------------------------------------------------
// "p1." + base64url of: the name, a KIND byte (0 a palette, 1 a color set), then each ramp's name and colors (3 bytes each). A string is a byte count (0-255) and
// its UTF-8; a ramp's color count is one byte (1-255). Exact both ways (paletteDecode(paletteEncode(p)) equals
// paletteClean(p)); a junk string is refused in words, never half-read. A future format is "p2.", told apart by its prefix.
const PALETTE_LINK_V1 = "p1.";
function paletteUtf8(s, maxBytes) {
  // whole characters only: a name cut at maxBytes never ends in half a character
  const enc = new TextEncoder();
  let b = enc.encode(s);
  while (b.length > maxBytes) { s = Array.from(s).slice(0, -1).join(""); b = enc.encode(s); }
  return b;
}
function paletteEncode(pal) {
  const p = paletteClean(pal), bytes = [];
  const str = function (s) { const b = paletteUtf8(s, 255); bytes.push(b.length); for (const x of b) bytes.push(x); };
  str(p.name);
  bytes.push(p.kind === "set" ? 1 : 0);
  bytes.push(p.ramps.length);
  p.ramps.forEach(function (r) { str(r.name); bytes.push(r.colors.length); r.colors.forEach(function (h) { bytes.push.apply(bytes, paletteRgb(h)); }); });
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return PALETTE_LINK_V1 + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function paletteDecode(s) {
  s = String(s == null ? "" : s).trim();
  if (!s) return { error: "There is no palette in that (it's empty)." };
  if (/^p\d+\./.test(s) && s.indexOf(PALETTE_LINK_V1) !== 0) return { error: "That palette was made by a newer Crunchy app: update this one to open it." };
  if (s.indexOf(PALETTE_LINK_V1) !== 0) return { error: "That isn't a Crunchy palette (it should start with “" + PALETTE_LINK_V1 + "”)." };
  const body = s.slice(PALETTE_LINK_V1.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || body.length % 4 === 1) return { error: "That palette is damaged: it has characters a palette never has, or it was cut short." };
  let bin;
  try { bin = atob(body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4)); }
  catch (e) { return { error: "That palette is damaged and can't be read." }; }
  const b = [];
  for (let i = 0; i < bin.length; i++) b.push(bin.charCodeAt(i));
  let at = 0;
  const short = { error: "That palette was cut short (part of the link is missing)." };
  const str = function () {
    if (at >= b.length) return null;
    const n = b[at++];
    if (at + n > b.length) return null;
    let t;
    try { t = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(b.slice(at, at + n))); } catch (e) { return null; }
    at += n; return t;
  };
  const name = str();
  if (name == null) return short;
  if (at + 1 >= b.length) return short;
  const kind = b[at++];
  if (kind > 1) return { error: "That palette was made by a newer Crunchy app: update this one to open it." };
  const nr = b[at++], ramps = [];
  if (!nr) return { error: "That palette has no colors in it." };
  if (nr > PALETTE_RAMPS_MAX) return { error: "That palette has " + nr + " ramps; at most " + PALETTE_RAMPS_MAX + " are allowed." };
  let total = 0;
  for (let r = 0; r < nr; r++) {
    const rn = str();
    if (rn == null || at >= b.length) return short;
    const nc = b[at++];
    if (!nc) return { error: "That palette is damaged: one of its ramps is empty." };
    if (at + nc * 3 > b.length) return short;
    const colors = [];
    for (let i = 0; i < nc; i++, at += 3) colors.push(paletteHexOf([b[at], b[at + 1], b[at + 2]]));
    total += nc;
    ramps.push({ name: rn, colors: colors });
  }
  if (at !== b.length) return { error: "That palette is damaged: there is more in it than a palette holds." };
  if (total > PALETTE_MAX) return { error: "That palette has " + total + " colors; at most " + PALETTE_MAX + " are allowed." };
  if (kind === 1 && nr !== 1) return { error: "That color set is damaged: a set has one ramp." };
  const p = { kind: kind === 1 ? "set" : "palette", name: name, ramps: ramps }, c = paletteClean(p);
  // a string that only decodes into something paletteEncode would never write (control characters, a blank name) is junk
  if (JSON.stringify(c) !== JSON.stringify(p)) return { error: "That palette is damaged: its names aren't ones a Crunchy app writes." };
  return { palette: c };
}

// ---- STARTERS: only what we may ship (the suite's rule: nothing bundled unless it is CC0) ---------------------------------
// Two kinds, and NO palette a person designed (AJ, 2026-10-25: "are they CC0?"; Sweetie 16, PICO-8, Endesga, DawnBringer
// and the like are their makers' work under their own terms, and some names are trademarks). A person's OWN palette, any
// palette at all, comes in through Import (a file, a paste, a picture): that is theirs, not something we ship.
//   HARDWARE: a machine's colors are a fact about the machine, named for what they are, never a trademark.
//   OURS: designed for the suite in this file, CC0 (dedicated to the public domain by superevil6), credit "Crunchy suite (CC0)".
// Each is { name, credit, ramps } (EGA 64's ramps are grouped by paletteGroup when this file loads). Append-only.
const PALETTE_HARDWARE = "hardware palette", PALETTE_OURS = "Crunchy suite (CC0)";
const PALETTE_STARTERS = [
  // OURS. Ramps shift hue the pixel-art way: highlights warm toward yellow, shadows cool toward purple and blue.
  { name: "Ember dungeon", credit: PALETTE_OURS, ramps: [
    { name: "Torch", colors: ["#fff4c8", "#ffd36e", "#f29a3a", "#c4521f", "#7a2a1a"] },
    { name: "Stone", colors: ["#c9b8a6", "#8f7d74", "#5c4d4f", "#33292f", "#17121a"] },
    { name: "Moss", colors: ["#b4c25e", "#6c8a3c", "#344d31"] },
    { name: "Gem", colors: ["#7ee0d6", "#3a8fa8", "#264a6e"] }] },
  { name: "Moonlit night", credit: PALETTE_OURS, ramps: [
    { name: "Sky", colors: ["#e8eefc", "#a9bde8", "#6a82c4", "#3f4f94", "#252a5e", "#14142e"] },
    { name: "Lantern", colors: ["#fff1b0", "#f5b04a", "#b8622e", "#6e2e2a"] },
    { name: "Leaf", colors: ["#8fc29a", "#4f8a76", "#2c5459", "#1a3040"] }] },
  { name: "Soft pastel", credit: PALETTE_OURS, ramps: [
    { name: "Peach", colors: ["#fff3e8", "#ffd3bd", "#f5a5a0", "#c97b90"] },
    { name: "Mint", colors: ["#eafff2", "#b7efd2", "#7cc7b2", "#4d8b8f"] },
    { name: "Lilac", colors: ["#f3eaff", "#cbb8f2", "#9b8bd2", "#6b5f9e"] },
    { name: "Ink", colors: ["#fff9d6", "#a1a6c8", "#3d3550"] }] },
  { name: "Forest floor", credit: PALETTE_OURS, ramps: [
    { name: "Leaf", colors: ["#e4f08a", "#a8cc4e", "#5f9a3a", "#2f6234", "#183a2c"] },
    { name: "Soil", colors: ["#e8c9a0", "#b48a58", "#7c5538", "#4a3026", "#241615"] },
    { name: "Berry", colors: ["#ffb0a0", "#e0525a", "#8e2a46"] },
    { name: "Stream", colors: ["#bfeef0", "#5ab0c8", "#2f6a8a"] }] },
  // HARDWARE
  { name: "CGA", credit: PALETTE_HARDWARE, ramps: [            // the 16 RGBI colors of the color graphics adapter
    { name: "Grays", colors: ["#ffffff", "#aaaaaa", "#555555", "#000000"] },
    { name: "Reds", colors: ["#ff5555", "#aa0000"] },
    { name: "Yellows", colors: ["#ffff55", "#aa5500"] },
    { name: "Greens", colors: ["#55ff55", "#00aa00"] },
    { name: "Cyans", colors: ["#55ffff", "#00aaaa"] },
    { name: "Blues", colors: ["#5555ff", "#0000aa"] },
    { name: "Magentas", colors: ["#ff55ff", "#aa00aa"] }] },
  { name: "EGA 64", credit: PALETTE_HARDWARE, ramps: null },  // every mix of four levels per channel (00 55 aa ff); grouped below
  { name: "Handheld greens", credit: PALETTE_HARDWARE, ramps: [  // four shades of a green-screen handheld's display
    { name: "Greens", colors: ["#9bbc0f", "#8bac0f", "#306230", "#0f380f"] }] },
  { name: "Grayscale 8", credit: PALETTE_HARDWARE, ramps: [     // eight even steps, white to black
    { name: "Grays", colors: ["#ffffff", "#dadada", "#b6b6b6", "#919191", "#6d6d6d", "#484848", "#242424", "#000000"] }] },
];
(function () {
  const ega = [], lv = [0, 0x55, 0xaa, 0xff];
  for (const r of lv) for (const g of lv) for (const b of lv) ega.push(paletteHexOf([r, g, b]));
  PALETTE_STARTERS.find(function (s) { return s.name === "EGA 64"; }).ramps = paletteGroup(ega);
})();
// A starter as a palette of its own (a copy: the editor may change it freely).
function paletteStarter(name) {
  const s = PALETTE_STARTERS.find(function (x) { return x.name === name; });
  return s ? paletteClean({ name: s.name, ramps: s.ramps }) : null;
}

// ---- THE PLANTED PALETTE AND COLOR SET (PALETTES.md "Where palettes live") -------------------------------------------------
// They belong to no one tool: they are the suite's, in crunchy/palettes/<slug>/ (Unity: Assets/Crunchy/Palettes/), opened
// with plant.js's plantOpenAs(P, PALETTE_APP) as moments are. Two kinds in one folder: "palette" and "colorset" (a set,
// one ramp). Beside the sidecar: <slug>.hex and <slug>.gpl, so Aseprite, GIMP, Krita or any paint program uses the same
// colors, and in Godot (and a plain folder) <slug>.tres, a ColorPalette Godot's color picker loads. The sidecar's `s` is
// paletteEncode's string (the share link's) and `pal` the palette itself, readable. Every app planted in the game lists
// them; an edit in one shows in all the others.
const PALETTE_KIND_OF = { palette: "palette", set: "colorset" };
const PALETTE_APP = {
  id: "crunchypalettes", name: "Palettes", suite: "palettes",
  kinds: { palette: { dir: "palettes", label: "Palettes" }, colorset: { dir: "palettes", label: "Color sets" } },
  valid: function (kind, d) {
    if (typeof d.s !== "string") return false;
    const r = paletteDecode(d.s);
    return !r.error && PALETTE_KIND_OF[r.palette.kind] === kind;
  },
};
// The files a palette or set plants, by engine (pure: tests write them without plant.js).
function paletteFiles(slug, pal, engine) {
  const f = [{ path: slug + ".hex", data: paletteHex(pal) }, { path: slug + ".gpl", data: paletteGpl(pal) }];
  if (engine !== "unity") f.push({ path: slug + ".tres", data: paletteGodot(pal) });
  return f;
}
// The palette (or set) a planted asset holds (its `s`), or null when the sidecar's string is damaged.
function palettePlanted(a) { const r = paletteDecode(a && a.data && a.data.s); return r.error ? null : r.palette; }
// SAVE: plant the palette, or the set when pal.kind is "set", under `name` (the same name and kind UPDATES it in place:
// same folder, same paths). P: the app's own handle on the game. Returns the planted asset. (Save never overwrites
// ANOTHER one: the editor asks plantFreeName first.)
async function paletteSave(P, name, pal) {
  const M = await plantOpenAs(P, PALETTE_APP), p = paletteClean(Object.assign({}, pal, { name: name })), kind = PALETTE_KIND_OF[p.kind];
  if (!paletteCount(p)) throw new Error("A " + (p.kind === "set" ? "color set" : "palette") + " needs at least one color.");
  const slug = await plantSlugFor(M, kind, p.name), was = M.assets.find(function (a) { return a.slug === slug; });
  const fields = { s: paletteEncode(p), pal: p };
  if (paletteIsGame(was)) fields.game = true;                     // editing the game palette keeps it the game's (build 2)
  return plantPut(M, { kind: kind, name: p.name, fields: fields, files: paletteFiles(slug, p, P.engine), appVersion: String(PALETTE_BUILD) });
}
// Every palette AND set planted in this game: [{ slug, kind ("palette" | "colorset"), name, palette, asset }], by name.
// Damaged ones are left out.
async function paletteList(P) {
  const M = await plantOpenAs(P, PALETTE_APP);
  return M.assets.map(function (a) { return { slug: a.slug, kind: a.kind, name: a.name, palette: palettePlanted(a), asset: a }; }).filter(function (x) { return x.palette; });
}
// EVERY COLOR SET this game offers: each planted set, then every ramp of every planted palette as a set named
// "<palette> · <ramp>". [{ id, name, colors, from: "set" | "palette", slug, palette (its name, for a ramp) }].
// THE ID is stable apart from the name: "set:<slug>" (a slug never changes, even on a rename) and
// "palette:<slug>/<ramp's slug>"; a built-in list joins later as "builtin:<app>/<key>" (PALETTES.md).
async function paletteSets(P) {
  const all = await paletteList(P), out = [];
  all.filter(function (x) { return x.kind === "colorset"; }).forEach(function (x) {
    out.push({ id: "set:" + x.slug, name: x.name, colors: x.palette.ramps[0].colors.slice(), from: "set", slug: x.slug });
  });
  all.filter(function (x) { return x.kind === "palette"; }).forEach(function (x) {
    const used = {};
    x.palette.ramps.forEach(function (r) {
      let k = plantSlug(r.name), n = 2;
      while (used[k]) k = plantSlug(r.name) + "-" + n++;
      used[k] = 1;
      out.push({ id: "palette:" + x.slug + "/" + k, name: x.name + " · " + r.name, colors: r.colors.slice(), from: "palette", slug: x.slug, palette: x.name });
    });
  });
  return out;
}

// ---- THE GAME PALETTE (PALETTES.md step 4; AJ, 2026-10-26) ----------------------------------------------------------------
// One planted palette (or color set) can be marked THE GAME'S: `game: true` in its own sidecar, so every app planted in
// the game finds it with nothing else to keep in step. Only the sidecar is rewritten (its files, and so its hash, stay);
// marking one clears the mark from every other, so at most one is ever the game's. Each app then lists it FIRST and offers
// "Use the game palette": on for NEW designs in that game, never flipped on for existing ones (PALETTES.md, Decided 1).
function paletteIsGame(a) { return !!(a && a.data && a.data.game === true); }
// The game's palette: { slug, kind, name, palette, asset }, or null. Two marked (two apps racing) reads as the first by name.
async function paletteGame(P) {
  const all = await paletteList(P);
  return all.find(function (x) { return paletteIsGame(x.asset); }) || null;
}
// Mark the planted palette or set `slug` as the game's (null: no game palette). → the game palette now, or null.
async function paletteSetGame(P, slug) {
  const M = await plantOpenAs(P, PALETTE_APP);
  if (slug != null && !M.assets.some(function (a) { return a.slug === slug; })) throw new Error("There is no palette “" + slug + "” planted in this game.");
  for (const a of M.assets) {
    const want = a.slug === slug;
    if (paletteIsGame(a) === want) continue;
    a.data = Object.assign({}, a.data, { modified: new Date().toISOString() });
    if (want) a.data.game = true; else delete a.data.game;
    const sf = plantSidecarFile(a.slug, a.data);
    await P.fs.writeTextFile(plantJoin(plantAssetDir(M, a), sf.path), sf.data);
  }
  return paletteGame(P);
}

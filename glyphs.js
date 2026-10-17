// GENERATED from crunchyCore/glyphs.js @ e8113c2 by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 989a8535e2e73d18a60563cd586778766ec1fbd9e389c7ec3c56ce5ddf553926
"use strict";
// Crunchy suite: GLYPHS. The icon DRAWINGS CrunchyUI's icon roster is made of (close, check, cog, sword, flame, the
// button letters, START …), shared so any app can draw the same icon: CrunchyUI wraps them in its treatment (styles,
// backings, tints, inks, textures, emblems, the kit's theme), CrunchyVFX can emit them as particles, others later.
// Moved out of CrunchyUI's icons.js on 2026-10-15, byte for byte (UI-DESIGN.md §11.17 there): every picture UI draws
// with them is unchanged, proved by fingerprinting all of them before and after.
//
// PURE and SELF-CONTAINED (like textures.js and items.js): no DOM, no app state, every name its own (prefixed
// `glyph` / `GLYPH_`). It holds ONLY drawings. How an icon is coloured, outlined, backed or textured is the app's.
//
// ---- WHAT A GLYPH IS ---------------------------------------------------------------------------------------------
// A list of LAYERS, each a path in the -1..1 box centred on the origin (y runs DOWN), spelled as segments:
//   ["M", x, y]  ["L", x, y]  ["Q", cx, cy, x, y]  ["C", c1x, c1y, c2x, c2y, x, y]  ["Z"]
// Each layer is filled EVEN-ODD on its own (a second loop inside it is a HOLE), and the layers are painted in order,
// one over the other (a later layer UNIONS; it never erases). Most glyphs are one layer; a coin's boss, a flask's lip
// and Q's tail are a second (`over`), and a shape ported from CrunchyVFX can be several. The paths are authored at
// GLYPH_GRID (64 px); they rasterize at any size, chunkier when small (a pixel-art icon is authored at its size).
// Some glyphs take SLOTS (a cog's teeth, an arrow's direction, a die's face): `glyphInfo(name).knobs` lists them as
// [key, label, min, max] or [key, label, [values]], with defaults in `.slots`.
//
// ---- THE API -----------------------------------------------------------------------------------------------------
//   glyphNames()                     every glyph's name, in the ONE stable order (append-only; apps store indices)
//   glyphInfo(name)                  { name, index, group, ported, hidden, slots, knobs } or null
//                                      group  "mark" (system/commodity marks: close, menu, trash …), "input"
//                                             (controller button legends, the d-pad) or "shape" (everything else:
//                                             items, nature, symbols). GLYPH_GROUPS lists them with labels.
//                                      ported true for a shape that is CrunchyVFX's own particle shape, recorded
//                                             unchanged (VFX has these natively; a redrawn one is not `ported`)
//                                      hidden kept so old links still mean the same glyph, but not offered: a
//                                             duplicate of another glyph, or a drawing that does not read
//   glyphLayers(name, slots)         the layers (above), slots over the glyph's defaults; null for an unknown name
//   glyphMask(name, size, opts)      { w, h, a: Uint8Array } (a = 1 inside, 0 outside; size x size, row-major), the
//                                      glyph filled into the whole box exactly as CrunchyUI's renderer fills a path
//                                      (pixel centres, even-odd per layer, layers unioned, no antialiasing).
//                                      opts: { slots, angle (degrees, clockwise), layers: false for the first only }
//   glyphTrace(ctx, segs, x, y, size)  issues one layer as moveTo/lineTo/quadraticCurveTo/bezierCurveTo/closePath on
//                                      a Canvas2D-shaped `ctx`, the -1..1 box mapped onto [x, x+size] x [y, y+size].
//                                      The caller begins the path and fills it ("evenodd"), once per layer.
//
// ---- APPEND ONLY -------------------------------------------------------------------------------------------------
// CrunchyUI stores a glyph by its INDEX in presets and share links, so a new glyph goes at the END of GLYPH_LATE
// (or replaces a drawing IN PLACE by reusing its name, which keeps its index), and a name is never removed or reused
// for a different thing. The order is built by `glyphRoster` at the bottom: the marks, the input legends, the
// hand-drawn shapes, the ported VFX shapes (each redraw taking its port's slot), then the later additions.
// Changing a drawing changes every app's output: bump GLYPHS_BUILD and say which glyphs in CHANGELOG.md.
//
// The long notes below are the drawings' own history, written while CrunchyUI authored them; a § number in them is
// CrunchyUI's UI-DESIGN.md, and "the treatment", "pathOps", "ELEMENT_DEFS" and "the sheet" are CrunchyUI's.

const GLYPHS_BUILD = 1;

// CLOCKWISE, because screen y runs DOWN: `glyphRotPt` is the ordinary rotation matrix, and under a
// flipped y a positive angle turns the way a clock does. Worth stating rather than leaving as an
// accident of the coordinate system — the next person to add an angle will want to know.
//
// A ROTATED GLYPH CAN OVERRUN ITS BOX, and round ones cannot. The mask is the unit square mapped to
// n x n, so a shape reaching the corners loses them at 45 degrees; anything inscribed in the circle
// — a cog, a star, a gem — is unaffected. That is the class this is for.
function glyphRotSegs(groups, deg) {
  if (!deg) return groups;
  const a = deg * Math.PI / 180;
  return groups.map(function (g) {
    return g.map(function (c) {
      if (c[0] === "Z") return c;
      const out = [c[0]];
      for (let i = 1; i + 1 < c.length + 1 && i + 1 <= c.length; i += 2) {
        const q = glyphRotPt(c[i], c[i + 1], a);
        out.push(q[0], q[1]);
      }
      return out;
    });
  });
}

// The path roster's default. 64 because that is what VFX's shapes were authored against, and what
// their curves need to rasterize cleanly (§11.5).
const GLYPH_GRID = 64;

// ...BUT NOT ALL OF THEM, AND THE FLAG WAS THE WRONG GRANULARITY. Unhiding the roster wholesale and
// then looking at all 68 side by side (which nobody had done — they went behind the flag before the
// contact sheet existed) turns up two problems that have nothing to do with §11.6's argument:
//
//   DUPLICATES OF GLYPHS THAT ALREADY SHIP. `gear` is `cog`, `plusbold` is `plus`, `padlock` is
//   `lock`, `shard` is `triangle`. Four pairs where the GLYPH_MARKS original is the parametric one —
//   `cog` has 4 or 8 teeth and an optional hole; `gear` is a fixed outline. Showing both says the
//   roster is padded, and picks the worse of the two half the time.
//
// The goal is "enough good ones that nobody has to go hunting", not a count. A shop window with
// four visible duplicates in it argues against itself.
//
// HIDDEN, NOT DELETED, for §11.7's reasons unchanged: `shareSchema` walks ELEMENT_DEFS, so removing
// a def would change the share format and re-point every link written today. They stay registered,
// buildable and swept.
const GLYPH_SET_ASIDE = {
  gear: "cog is the same shape and is parametric (teeth, hole)",
  plusbold: "plus, at a weight the icon treatment already controls",
  padlock: "lock, which also has an open/closed state",
  shard: "triangle",
  // NOT A DUPLICATE — A SHAPE WITH NO SILHOUETTE. `splash` was redrawn three times and read as
  // grass (a row of arches on a baseline), then as a FACE (an oval under three circles), then as a
  // STAR (alternating radii, which is the definition of one). Each attempt collided with something
  // the roster already has, and the reason is that a splash has no agreed outline the way a drop or
  // a leaf does — it is a texture, and a texture at 30px is a smudge.
  //
  // Hidden rather than kept in on a fourth try: `drop` covers liquid, the goal is a set of good
  // ones rather than a complete one, and the honest signal that a shape is not working is three
  // redraws that each land on a DIFFERENT wrong thing.
  splash: "no agreed silhouette at icon size; drop covers the same ground",
  // FOUND BY THE COLLISION SWEEP, not by eye — `heart` and `bigheart` never sat next to each other
  // on a contact sheet, which is exactly the blind spot a pairwise check exists to cover. They are
  // the same heart at 0.97 normalised overlap, and `heart` is the commodity mark (§11.6).
  bigheart: "heart, at 0.97 silhouette overlap",
};

// ---- path helpers for the system glyphs ---------------------------------------------------------
//
// OVERLAPPING SUBPATHS CANCEL. The path op fills even-odd (§11.3), so two crossing bars in one path
// leave a HOLE where they cross — an X drawn as two rectangles comes out with a diamond punched out
// of its middle. Everything here therefore emits the shape's TRUE OUTLINE as one loop, rather than
// the pieces it is conceptually made of.
//
// Disjoint subpaths are fine and stay separate (three menu bars, a keyhole in a lock body); it is
// only overlap that has to be resolved by the author. That is the same constructive discipline the
// corners follow in elements.js, arriving from the other direction.

function glyphPolySegs(pts) {
  const out = [["M", pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) out.push(["L", pts[i][0], pts[i][1]]);
  out.push(["Z"]);
  return out;
}

function glyphRotPt(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

// A thick segment as a quad. Butt caps, because every joint in this roster is either resolved into
// the outline or genuinely disjoint.
function glyphBarSegs(x0, y0, x1, y1, t) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / L * t, ny = dx / L * t;
  return glyphPolySegs([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
}

// The twelve-point cross, which is `plus` and — rotated an eighth — `close`. One generator for both,
// because they ARE the same shape and keeping them apart is how two icons drift out of a set.
function glyphCrossSegs(reach, t, rot) {
  const p = [];
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2;
    p.push(glyphRotPt(t, t, a), glyphRotPt(t, reach, a), glyphRotPt(-t, reach, a));
  }
  return glyphPolySegs(p.map(function (v) { return rot ? glyphRotPt(v[0], v[1], rot) : v; }));
}

// n-point star. Same construction the hidden `gemstar` used, kept because a star IS its angles and
// generating it is what keeps five and six points consistent with each other.
//
// THE TURN IS A POLAR OFFSET RATHER THAN A ROTATED DRAWING, which is what keeps it exact. Every
// vertex already sits on one of two circles, so adding `deg` to the angle moves each point ALONG
// its own circle: the star cannot grow, and nothing has to be refitted the way `glyphRotFitSegs` refits
// a blade (a tall shape turned 45 degrees has a bounding box the length of its own DIAGONAL). A
// star is round, so it has no diagonal to pay for.
function glyphStarPoly(n, rOut, rIn, deg) {
  const p = [], rot = (deg || 0) * Math.PI / 180;
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + rot + i * Math.PI / n, r = i % 2 ? rIn : rOut;
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // AND THE EXTENT IS HELD, OR TURNING THE STAR SHRINKS IT. A star's box is set by its POINTS, and
  // with only four of them there is nothing left on the axes once they turn: measured, a four-point
  // star fills 91% of its box upright and 66% at 45 degrees, against a roster median of 89% — it
  // would have drawn a quarter smaller than every icon beside it, which reads as a mistake rather
  // than as a smaller star. Five points and up barely move (88% to 88%), because there is always a
  // point near an axis.
  //
  // THE BOX IS A SQUARE AND THAT IS WHAT MAKES THIS POSSIBLE: the turned points land in its CORNERS
  // (0.94, 0.94) rather than outside it, so the X reaches as far as `close`'s arms do. It is also a
  // no-op at rest — some point sits exactly on an axis at angle 0 for every count, so the scale is
  // exactly 1 and every kit, ornament and emblem drawing a star today is byte-identical.
  let m = 0;
  for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[i][0]), Math.abs(p[i][1]));
  const k = m ? rOut / m : 1;
  return glyphPolySegs(k === 1 ? p : p.map(function (v) { return [v[0] * k, v[1] * k]; }));
}

// A gear as ONE outline: alternating between the tooth radius and the root radius, with flat tops.
// Drawing a disc and adding teeth on top would overlap and punch holes in itself.
function glyphGearPoly(n, rRoot, rTip, tooth) {
  const p = [], step = Math.PI * 2 / n, half = step * tooth / 2;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * step;
    p.push([Math.cos(a - half * 1.6) * rRoot, Math.sin(a - half * 1.6) * rRoot]);
    p.push([Math.cos(a - half) * rTip, Math.sin(a - half) * rTip]);
    p.push([Math.cos(a + half) * rTip, Math.sin(a + half) * rTip]);
    p.push([Math.cos(a + half * 1.6) * rRoot, Math.sin(a + half * 1.6) * rRoot]);
  }
  return glyphPolySegs(p);
}

// A band between two radii over an angular span — the lock's shackle and the speaker's waves. Both
// edges are sampled rather than drawn as arcs, for the same reason `glyphCircleSegs` exists: the op has
// no arc segment, on purpose.
function glyphArcBand(cx, cy, rIn, rOut, a0, a1) {
  // Sampled at 16 per half-turn, not 8: an arch is read edge-on and a coarse polygon bulges at the
  // apex, which on a padlock reads as a lumpy shackle rather than as a curve.
  const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 16)));
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    p.push([cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + (a1 - a0) * i / n;
    p.push([cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn]);
  }
  return glyphPolySegs(p);
}

// ---- the system roster --------------------------------------------------------------------------
//
// RE-AUTHORED AS PATHS AT 64 (§11.8). They were 16x16 masks, which was right when 16 was the only
// size an icon came in — and wrong once the app could be asked for any size, because a mask cannot
// answer that question and a path can.
//
// These are the shapes that SURVIVE the change, which is not a coincidence: a close box is two
// straight bars, a play button is a triangle, a menu is three rectangles. §11.6's line between
// COMMODITY and AUTHORIAL shapes is the same line as "expressible exactly" versus "a drawing" —
// the icons nobody wants a bespoke version of are the icons made of geometry.
//
// Every slot survives the move. A roster that lost its parameters on the way to being scalable
// would be trading the thing that made it a generator for the thing that made it a picture.

const GLYPH_MARKS = [
  {
    name: "close", slots: { weight: 2 },
    controls: [["weight", "Weight", 1, 3]],
    segs: function (rp) { return glyphCrossSegs(0.92, 0.11 * rp.weight, Math.PI / 4); },
  },
  {
    name: "check", slots: { weight: 2 },
    controls: [["weight", "Weight", 1, 3]],
    segs: function (rp) {
      // One outline, not two bars: the elbow is where two bars would punch a hole in themselves.
      const t = 0.13 * rp.weight;
      const a = [-0.72, 0.06], b = [-0.24, 0.56], c = [0.74, -0.54];
      // inner and outer offsets of the elbow, walked as one loop
      return glyphPolySegs([
        [a[0], a[1] - t * 1.15], [b[0], b[1] - t * 1.15], [c[0] - t * 0.55, c[1] - t * 1.3],
        [c[0] + t * 0.75, c[1] + t * 0.5], [b[0] + t * 0.15, b[1] + t * 1.25],
        [a[0] + t * 0.2, a[1] + t * 1.2],
      ]);
    },
  },
  {
    name: "plus", slots: { weight: 3 },
    controls: [["weight", "Weight", 1, 5]],
    segs: function (rp) { return glyphCrossSegs(0.88, 0.09 * rp.weight, 0); },
  },
  {
    name: "minus", slots: { weight: 3 },
    controls: [["weight", "Weight", 1, 5]],
    segs: function (rp) { return glyphBoxSegs(-0.88, -0.09 * rp.weight, 1.76, 0.18 * rp.weight); },
  },
  {
    name: "arrow", slots: { dir: "right", arrowStyle: "solid" },
    controls: [["dir", "Direction", ["right", "down", "left", "up"]],
               ["arrowStyle", "Style", ["solid", "chevron", "triangle"]]],
    segs: function (rp) {
      let p;
      if (rp.arrowStyle === "triangle") {
        p = [[-0.72, -0.86], [0.86, 0], [-0.72, 0.86]];
      } else if (rp.arrowStyle === "chevron") {
        // A chevron outline, walked out and back — two bars would hole themselves at the point.
        const t = 0.2;
        p = [[-0.5, -0.78], [0.62, 0], [-0.5, 0.78], [-0.5 + t * 1.4, 0.78],
             [0.62 + t * 1.4, 0], [-0.5 + t * 1.4, -0.78]];
      } else {
        // stem + head as ONE outline
        p = [[-0.9, -0.22], [0.04, -0.22], [0.04, -0.62], [0.9, 0],
             [0.04, 0.62], [0.04, 0.22], [-0.9, 0.22]];
      }
      const turn = { right: 0, down: 1, left: 2, up: 3 }[rp.dir] || 0;
      return glyphPolySegs(p.map(function (v) { return glyphRotPt(v[0], v[1], turn * Math.PI / 2); }));
    },
  },
  {
    name: "menu", slots: { bars: 3, weight: 2 },
    controls: [["bars", "Bars", 2, 4], ["weight", "Weight", 1, 3]],
    segs: function (rp) {
      const n = rp.bars, t = 0.09 * rp.weight;
      const span = 1.5, step = n > 1 ? span / (n - 1) : 0;
      let out = [];
      for (let i = 0; i < n; i++) {
        const y = n > 1 ? -span / 2 + i * step : 0;
        out = out.concat(glyphBoxSegs(-0.88, y - t, 1.76, t * 2));   // disjoint: no cancellation
      }
      return out;
    },
  },
  {
    name: "play", slots: {},
    controls: [],
    segs: function () { return glyphPolySegs([[-0.6, -0.84], [0.84, 0], [-0.6, 0.84]]); },
  },
  {
    name: "pause", slots: { gap: 2 },
    controls: [["gap", "Gap", 1, 4]],
    segs: function (rp) {
      const g = 0.07 * rp.gap, w = (1.6 - 2 * g) / 2;
      return glyphBoxSegs(-0.8, -0.82, w, 1.64).concat(glyphBoxSegs(g, -0.82, w, 1.64));
    },
  },
  {
    name: "stop", slots: {},
    controls: [],
    segs: function () { return glyphBoxSegs(-0.74, -0.74, 1.48, 1.48); },
  },
  {
    name: "sound", slots: { level: 2 },
    controls: [["level", "Level", 0, 3]],
    segs: function (rp) {
      // Speaker: body and cone as one outline, because they meet rather than overlap.
      let out = glyphPolySegs([[-0.92, -0.26], [-0.5, -0.26], [-0.06, -0.84], [-0.06, 0.84],
                          [-0.5, 0.26], [-0.92, 0.26]]);
      if (rp.level === 0) {
        return out.concat(glyphCrossSegs(0.42, 0.1, Math.PI / 4).map(function (g) {
          const o = [g[0]];
          for (let i = 1; i < g.length; i += 2) o.push(g[i] + 0.52, g[i + 1]);
          return o;
        }));
      }
      for (let i = 0; i < rp.level; i++) {
        const r = 0.3 + i * 0.26;
        out = out.concat(glyphArcBand(0.02, 0, r, r + 0.11, -0.85, 0.85));
      }
      return out;
    },
  },
  {
    name: "cog", slots: { teeth: 8, hole: 1 },
    controls: [["teeth", "Teeth", ["4", "8"]], ["hole", "Hole", 0, 1]],
    segs: function (rp) {
      const n = rp.teeth === "4" ? 4 : 8;
      const out = glyphGearPoly(n, 0.6, 0.92, 0.5);
      // The hole is a second loop INSIDE the outline — even-odd, so it clears (§11.3).
      return rp.hole ? out.concat(glyphCircleSegs(0, 0, 0.3)) : out;
    },
  },
  {
    name: "lock", slots: { open: 0 },
    controls: [["open", "Open", 0, 1]],
    segs: function (rp) {
      const body = glyphBoxSegs(-0.66, -0.06, 1.32, 0.94);
      const key = glyphCircleSegs(0, 0.3, 0.15);
      // A HALF-ANNULUS FROM pi TO 2pi ALREADY ENDS ON THE BODY'S TOP EDGE — both its ends sit at
      // y = -0.06, which is exactly where the body starts. The first version added "legs" below
      // them and they came out as stubs floating ABOVE the arch, because y grows downward and I
      // had reasoned about it as though it grew up. Touching is what was wanted; nothing to add.
      const sx = rp.open ? 0.34 : 0;
      return body.concat(key, glyphArcBand(sx, -0.06, 0.3, 0.52, Math.PI, Math.PI * 2));
    },
  },
  {
    name: "home", slots: { door: 1 },
    controls: [["door", "Door", 0, 1]],
    segs: function (rp) {
      // Roof and walls as ONE outline; the door is a disjoint loop inside it.
      const house = glyphPolySegs([[0, -0.92], [0.96, 0.04], [0.7, 0.04], [0.7, 0.9],
                              [-0.7, 0.9], [-0.7, 0.04], [-0.96, 0.04]]);
      return rp.door ? house.concat(glyphBoxSegs(-0.24, 0.3, 0.48, 0.6)) : house;
    },
  },
  {
    // THE ANGLE IS WHAT MAKES A FOUR-POINT STAR AN X (maintainer's, 2026-10-07), and a CONTROL is
    // the right shape for it rather than a 235th icon: this def is already parametric, so the X was
    // one number away from being spellable. `arrow`'s `dir` and `dice`'s `face` are the house style.
    //
    // 0-45 BECAUSE A STAR REPEATS ITSELF SOONER THAN A SLIDER WOULD. An n-point star is unchanged
    // by a turn of 360/n and MIRRORED at half of that, so the whole of its distinct range is 180/n
    // degrees — which is 45 at four points, and is exactly the X. A 0-90 slider would have drawn an
    // eight-point star's entire cycle twice and landed back on the upright four-point star at its
    // own end: `patternSpin`'s symmetry trap (an eight-tooth cog at eight steps gives eight
    // identical frames) arriving on a numeric control.
    //
    // AND THE TURN IMPROVES THE SEPARATION RATHER THAN COSTING IT, which is not what a tilt usually
    // does. Scored against the roster, the UPRIGHT four-point star is the tighter case at 0.778
    // against `plus`; at 45 degrees it falls to 0.726 (`close`), and to 0.595 at a spikier inner 25.
    // What an X shares with a PLUS is more than what it shares with a cross of thin bars.
    name: "star", slots: { points: 5, inner: 40, angle: 0 },
    controls: [["points", "Points", 4, 8], ["inner", "Inner", 20, 70], ["angle", "Angle", 0, 45]],
    segs: function (rp) { return glyphStarPoly(rp.points, 0.94, 0.94 * (rp.inner / 100), rp.angle); },
  },
  {
    // A BUST, not a smiley. Both say "person", but a portrait FRAME wants the silhouette a portrait
    // would hold — head and shoulders, cropped by the frame the way a real one is — whereas a face
    // reads as an emotion, which is a different control entirely. Two closed loops in unit
    // coordinates: the head, and the shoulders running off the bottom edge so the crop is the
    // drawing rather than an accident of the sprite.
    name: "bust", slots: {},
    controls: [],
    segs: function () {
      return [["M", 0, -0.72],
              ["C", 0.30, -0.72, 0.30, -0.20, 0, -0.20],
              ["C", -0.30, -0.20, -0.30, -0.72, 0, -0.72], ["Z"],
              ["M", -0.72, 0.92],
              ["C", -0.72, 0.10, -0.34, -0.06, 0, -0.06],
              ["C", 0.34, -0.06, 0.72, 0.10, 0.72, 0.92], ["Z"]];
    },
  },

  {
    name: "heart", slots: {},
    controls: [],
    segs: function () {
      return [["M", 0, 0.82],
              ["C", -0.9, 0.12, -0.9, -0.6, -0.42, -0.6],
              ["C", -0.13, -0.6, 0, -0.35, 0, -0.35],
              ["C", 0, -0.35, 0.13, -0.6, 0.42, -0.6],
              ["C", 0.9, -0.6, 0.9, 0.12, 0, 0.82], ["Z"]];
    },
  },
];

// ---- input glyphs (§11.9) -----------------------------------------------------------------------
//
// Face and shoulder button marks: eight letterforms and three shapes. They are the piece that makes
// a UI kit usable for a game rather than for a menu — a prompt has to say WHICH button, and every
// project needs the same eleven.
//
// WHAT IS AND IS NOT SAFE HERE, stated once so it does not have to be rediscovered:
//
//   * A LETTER IS NOT A TRADEMARK, and neither is a triangle. What is protectable is a specific
//     brand's COLOURS, its logo, and the particular arrangement it puts these in. So: the names in
//     this file describe the mark and never a console; nothing is drawn in a brand's palette,
//     because every icon takes the KIT'S ramp by construction; and nothing here arranges them into
//     anyone's layout — the app hands over eleven separate sprites.
//   * That is the same reasoning the palettes already follow (themes.js): colour VALUES carry no
//     licence and names would, so VFX renamed them and so did we. The suite's no-brand-names rule
//     covers this file too.
//
// A LETTERFORM DRAWN AS A PATH IS A DRAWING, NOT TEXT (§13). The rule that no export contains text
// is about UI LABELS — the user's engine supplies the font for those, and a bundled one would drag
// its licence into their game. A button mark shaped like an A is a symbol the way an arrow is; it
// carries no font, no glyph table and no `<text>` element, and the assertion added alongside these
// checks exactly that rather than taking anyone's word for it.
//
// EVERY STROKE IS PLACED TO TOUCH, NEVER TO OVERLAP. Even-odd (§11.3) turns an overlap into a hole,
// so the letters that can be built from rectangles are built from rectangles sharing edges, and the
// four that genuinely cross — A, X, Y, Z — are authored as one outline. That is the same discipline
// §11.8 records, and letters are where it bites hardest.

const GLYPH_CAP_T = -0.58, GLYPH_CAP_B = 0.58;      // cap height: all 28 letterforms share one baseline

function glyphLetterA() {
  // Outer walks the two legs and the crossbar's top edge; the counter is a second loop, so the
  // triangle above the bar clears and the gap below it is simply outside the outline.
  return glyphPolySegs([[0, GLYPH_CAP_T], [0.42, GLYPH_CAP_B], [0.25, GLYPH_CAP_B], [0.19, 0.18],
                   [-0.19, 0.18], [-0.25, GLYPH_CAP_B], [-0.42, GLYPH_CAP_B]])
    .concat(glyphPolySegs([[0, GLYPH_CAP_T + 0.24], [0.12, 0.02], [-0.12, 0.02]]));
}

// Bars that share edges. A stencil B rather than a bowled one: straight edges are exact at every
// size, and a curve that has to be flattened is a curve that can wobble.
// B AND C WERE RE-AUTHORED, and the reason is the set rather than either letter. Both shipped as
// stencil forms — square bowls, a bracket for the C — which was coherent when the roster was eight
// marks that were all built from `glyphBoxSegs`. It stopped being coherent the moment D, G, O, P, Q, S
// and U arrived with cubic bowls: side by side, B and C read as a different typeface. Coherence is
// a property of the SET (§8.2), so the two that no longer matched had to move, not the twenty-four
// that agreed with each other.
//
// Re-drawing a glyph is NOT the same class of change as reordering the roster. The name and the
// index are what presets and share links store (§7); the drawing behind them is free to improve.
//
// The lower bowl is wider than the upper and the waist is where they pinch. Equal bowls read as an
// 8 — which now matters literally, because the roster contains one.
function glyphLetterB() {
  return [["M", -0.40, GLYPH_CAP_T], ["L", 0.00, GLYPH_CAP_T],
          ["C", 0.24, GLYPH_CAP_T, 0.34, -0.46, 0.34, -0.30],
          ["C", 0.34, -0.18, 0.24, -0.10, 0.00, -0.10],
          ["C", 0.28, -0.10, 0.42, 0.00, 0.42, 0.20],
          ["C", 0.42, 0.40, 0.28, GLYPH_CAP_B, 0.02, GLYPH_CAP_B],
          ["L", -0.40, GLYPH_CAP_B], ["Z"],
          // Two counters, each its own loop — even-odd clears them (§11.8). Their straight left
          // edges are what keep the bowls attached to the stem rather than reading as two Ds.
          //
          // THE BOWLS BULGE FURTHER RIGHT THAN THE FIRST DRAFT'S, and that is a small-size fix
          // rather than a drawing preference: B is the only mark in the roster with TWO counters,
          // so it is the first to lose them. At 16px the original pair closed up and the letter
          // read as a filled blob — the size where D, O and even 8 were all still holding. Width
          // is the only thing that buys a counter another row.
          ["M", -0.24, GLYPH_CAP_T + GLYPH_STEM], ["L", 0.00, GLYPH_CAP_T + GLYPH_STEM],
          ["C", 0.14, GLYPH_CAP_T + GLYPH_STEM, 0.20, -0.38, 0.20, -0.30],
          ["C", 0.20, -0.23, 0.14, -0.10, 0.00, -0.10],
          ["L", -0.24, -0.10], ["Z"],
          ["M", -0.24, 0.06], ["L", 0.02, 0.06],
          ["C", 0.18, 0.06, 0.26, 0.12, 0.26, 0.20],
          ["C", 0.26, 0.30, 0.18, GLYPH_CAP_B - GLYPH_STEM, 0.02, GLYPH_CAP_B - GLYPH_STEM],
          ["L", -0.24, GLYPH_CAP_B - GLYPH_STEM], ["Z"]];
}

// C is G WITHOUT THE SPUR, walked identically — same terminals, same bowl, same counter — so the
// two cannot drift apart. That relationship is the whole point of the pairing: the spur is the only
// thing that distinguishes them, and it can only stay the only thing if everything else is shared
// geometry rather than two drawings that happen to resemble each other today.
function glyphLetterC() {
  return [["M", 0.38, -0.30],
          ["C", 0.34, -0.48, 0.18, -0.60, -0.02, -0.60],
          ["C", -0.26, -0.60, -0.40, -0.42, -0.40, 0],
          ["C", -0.40, 0.42, -0.26, 0.60, -0.02, 0.60],
          ["C", 0.18, 0.60, 0.38, 0.48, 0.38, 0.26],
          ["L", 0.22, 0.26],
          ["C", 0.22, 0.36, 0.12, 0.44, -0.02, 0.44],
          ["C", -0.16, 0.44, -0.24, 0.30, -0.24, 0],
          ["C", -0.24, -0.30, -0.16, -0.44, -0.02, -0.44],
          ["C", 0.10, -0.44, 0.20, -0.38, 0.24, -0.26], ["Z"]];
}

function glyphLetterL() {
  return glyphBoxSegs(-0.34, GLYPH_CAP_T, 0.16, 1.00)
    .concat(glyphBoxSegs(-0.34, GLYPH_CAP_B - 0.16, 0.64, 0.16));
}

function glyphLetterR() {
  return glyphBoxSegs(-0.40, GLYPH_CAP_T, 0.16, 1.16)
    .concat(glyphBoxSegs(-0.24, GLYPH_CAP_T, 0.44, 0.16),
            glyphBoxSegs(0.20, GLYPH_CAP_T + 0.16, 0.16, 0.30),
            glyphBoxSegs(-0.24, -0.10, 0.44, 0.16),
            // the leg, a quad that meets the middle bar's underside without crossing it
            glyphPolySegs([[0.04, 0.06], [0.22, 0.06], [0.42, GLYPH_CAP_B], [0.22, GLYPH_CAP_B]]));
}

// A LETTER X IS NOT THE CROSS MARK, and conflating them was a real error: two different controllers
// put two different symbols on that face button, and a kit needs both. `glyphCrossSegs` turned an eighth
// is SYMMETRIC — the same reach on every arm — which reads as the ✕ mark beside `close`. A letter X
// is taller than it is wide, its arms land on the cap box's corners, and its stroke matches the
// bars every other letter is built from. Same topology, different proportions, different meaning.
//
// Twelve points, like every cross: four arm tips in pairs, four notches where the strokes meet.
// Built from hw/hh/t rather than from a rotation, because a rotation cannot give it an aspect.
function glyphLetterXPoly(hw, hh, t) {
  const L = Math.sqrt(hw * hw + hh * hh);
  const ax = t * hh / L, ay = t * hw / L;     // half-stroke, split along the arm's normal
  const nx = t * L / hh, ny = t * L / hw;     // where two inner edges cross, on each axis
  return glyphPolySegs([
    [-hw + ax, -hh - ay], [0, -ny], [hw - ax, -hh - ay],
    [hw + ax, -hh + ay], [nx, 0], [hw + ax, hh - ay],
    [hw - ax, hh + ay], [0, ny], [-hw + ax, hh + ay],
    [-hw - ax, hh - ay], [-nx, 0], [-hw - ax, -hh + ay],
  ]);
}
// 0.095, not the 0.085 that would match the bars arithmetically. A DIAGONAL AT THE SAME WIDTH
// READS LIGHTER than a vertical — the eye measures the horizontal span it cuts, which is shorter
// on a slope — so it wants about a tenth more to sit level beside B and L. Optical, not measured,
// and the contact sheet is the only place to judge it.
function glyphLetterX() { return glyphLetterXPoly(0.40, GLYPH_CAP_B, 0.095); }

function glyphLetterY() {
  return glyphPolySegs([[-0.42, GLYPH_CAP_T], [-0.22, GLYPH_CAP_T], [0, -0.12], [0.22, GLYPH_CAP_T], [0.42, GLYPH_CAP_T],
                   [0.10, 0.06], [0.10, GLYPH_CAP_B], [-0.10, GLYPH_CAP_B], [-0.10, 0.06]]);
}

function glyphLetterZ() {
  return glyphPolySegs([[-0.36, GLYPH_CAP_T], [0.36, GLYPH_CAP_T], [0.36, GLYPH_CAP_T + 0.14], [-0.08, GLYPH_CAP_B - 0.14],
                   [0.36, GLYPH_CAP_B - 0.14], [0.36, GLYPH_CAP_B], [-0.36, GLYPH_CAP_B], [-0.36, GLYPH_CAP_B - 0.14],
                   [0.08, GLYPH_CAP_T + 0.14], [-0.36, GLYPH_CAP_T + 0.14]]);
}

// ---- the rest of the alphabet, and the digits (§11.9) --------------------------------------------
//
// APPENDED, NEVER INSERTED. `btn-a`..`btn-z` are not in alphabetical order in the roster and must
// not be sorted into it: ELEMENT_DEFS' index is what a preset and a share link store (§7), so
// putting `btn-d` after `btn-c` would turn every saved kit's marks into different marks. The first
// eight letters keep their positions; everything below is bolted on the end.
//
// A BOWL IS FOUR CUBICS, NOT A STENCIL — and this is a considered break from `glyphLetterB`'s note.
// B and C were stenciled because a *flattened* curve can wobble; a cubic is not flattened. It is
// snapped in raster and emitted verbatim in SVG (§1.2), so the wobble the note guards against never
// happens. Measured on the contact sheet rather than argued: the stencil S is the case that decides
// it, because a flat-barred S reads as a 5 at every size, and D/O/P/U/S with real bowls read as
// themselves. B and C are left exactly as they were — changing a shipped glyph is the same class of
// break as reordering the roster.
//
// STROKE IS 0.16 EVERYWHERE, matching the bars `glyphLetterB` is built from, EXCEPT on diagonals, which
// carry about 0.19 for the reason recorded at `glyphLetterX`: the eye measures a slope by the horizontal
// span it cuts, and an equal-width diagonal reads lighter than a stem beside it.

// The two stems and the space between them, shared so H, N, U and friends cannot drift apart.
const GLYPH_STEM = 0.16;

function glyphLetterD() {
  // Flat left stem, cubic bowl, counter as a second loop. The counter's straight left edge is what
  // keeps the D from reading as an O with a bite out of it.
  return [["M", -0.40, GLYPH_CAP_T], ["L", 0.02, GLYPH_CAP_T],
          ["C", 0.26, GLYPH_CAP_T, 0.38, -0.36, 0.38, 0],
          ["C", 0.38, 0.36, 0.26, GLYPH_CAP_B, 0.02, GLYPH_CAP_B],
          ["L", -0.40, GLYPH_CAP_B], ["Z"],
          ["M", -0.24, GLYPH_CAP_T + GLYPH_STEM], ["L", 0.02, GLYPH_CAP_T + GLYPH_STEM],
          ["C", 0.16, GLYPH_CAP_T + GLYPH_STEM, 0.22, -0.26, 0.22, 0],
          ["C", 0.22, 0.26, 0.16, GLYPH_CAP_B - GLYPH_STEM, 0.02, GLYPH_CAP_B - GLYPH_STEM],
          ["L", -0.24, GLYPH_CAP_B - GLYPH_STEM], ["Z"]];
}

// E and F share a stem and a top arm; the middle arm is shorter on both, which is what stops an E
// reading as three identical bars stacked on a post.
function glyphLetterE() {
  return glyphBoxSegs(-0.40, GLYPH_CAP_T, GLYPH_STEM, 1.16)
    .concat(glyphBoxSegs(-0.24, GLYPH_CAP_T, 0.62, GLYPH_STEM),
            glyphBoxSegs(-0.24, -0.08, 0.52, GLYPH_STEM),
            glyphBoxSegs(-0.24, GLYPH_CAP_B - GLYPH_STEM, 0.62, GLYPH_STEM));
}

function glyphLetterF() {
  return glyphBoxSegs(-0.40, GLYPH_CAP_T, GLYPH_STEM, 1.16)
    .concat(glyphBoxSegs(-0.24, GLYPH_CAP_T, 0.62, GLYPH_STEM),
            glyphBoxSegs(-0.24, -0.08, 0.52, GLYPH_STEM));
}

function glyphLetterG() {
  // A C with a spur. THE RIGHT SIDE GOES FLAT below the middle so the spur can be rectangles that
  // SHARE EDGES with it — against a curved right side the bar would have to overlap, and even-odd
  // would punch the join out (§11.3). Walked as one loop: outer terminal, round the left, up the
  // flat right edge, in along the spur, then the counter back round to the top terminal.
  return [["M", 0.38, -0.30],
          ["C", 0.34, -0.48, 0.18, -0.60, -0.02, -0.60],
          ["C", -0.26, -0.60, -0.40, -0.42, -0.40, 0],
          ["C", -0.40, 0.42, -0.26, 0.60, -0.02, 0.60],
          ["C", 0.18, 0.60, 0.38, 0.48, 0.38, 0.26],
          // THE SPUR REACHES PAST CENTRE. At half this length it read as a nub on a C rather than
          // as a G — the bar is the whole difference between the two letters and has to be the
          // longest thing on the right-hand side.
          ["L", 0.38, -0.08], ["L", -0.04, -0.08], ["L", -0.04, 0.08], ["L", 0.22, 0.08],
          ["L", 0.22, 0.26],
          ["C", 0.22, 0.36, 0.12, 0.44, -0.02, 0.44],
          ["C", -0.16, 0.44, -0.24, 0.30, -0.24, 0],
          ["C", -0.24, -0.30, -0.16, -0.44, -0.02, -0.44],
          ["C", 0.10, -0.44, 0.20, -0.38, 0.24, -0.26], ["Z"]];
}

function glyphLetterH() {
  return glyphBoxSegs(-0.40, GLYPH_CAP_T, GLYPH_STEM, 1.16)
    .concat(glyphBoxSegs(0.24, GLYPH_CAP_T, GLYPH_STEM, 1.16),
            glyphBoxSegs(-0.24, -0.08, 0.48, GLYPH_STEM));
}

// SERIFED ON PURPOSE, and it is the whole reason I and the digit 1 stay apart. A bare post is
// either letter; the pair only works if one of them commits. The stem STOPS at the arms rather
// than running through them — an overlap here would clear both serifs (§11.3).
function glyphLetterI() {
  return glyphBoxSegs(-0.30, GLYPH_CAP_T, 0.60, GLYPH_STEM)
    .concat(glyphBoxSegs(-0.30, GLYPH_CAP_B - GLYPH_STEM, 0.60, GLYPH_STEM),
            glyphBoxSegs(-0.08, GLYPH_CAP_T + GLYPH_STEM, GLYPH_STEM, 1.16 - 2 * GLYPH_STEM));
}

function glyphLetterJ() {
  return glyphBoxSegs(0.16, GLYPH_CAP_T, GLYPH_STEM, 1.00)
    .concat(glyphBoxSegs(-0.30, GLYPH_CAP_B - GLYPH_STEM, 0.62, GLYPH_STEM),
            glyphBoxSegs(-0.30, 0.14, GLYPH_STEM, 0.28));
}

// One outline. Two arm quads would overlap where they meet the stem, and the hole would land dead
// centre of the letter — the exact failure §11.3 opens with.
function glyphLetterK() {
  return glyphPolySegs([[-0.40, GLYPH_CAP_T], [-0.24, GLYPH_CAP_T], [-0.24, -0.10], [0.12, GLYPH_CAP_T], [0.38, GLYPH_CAP_T],
                   [-0.02, 0], [0.38, GLYPH_CAP_B], [0.12, GLYPH_CAP_B], [-0.24, 0.10], [-0.24, GLYPH_CAP_B],
                   [-0.40, GLYPH_CAP_B]]);
}

// M and W are one shape and its half-turn, which is `glyphScaleSegs(-1)` — a 180 degree rotation is a
// pure sign flip and lands exactly on the grid, unlike the 45 degree turns `mRot` refuses.
function glyphLetterM() {
  return glyphPolySegs([[-0.46, GLYPH_CAP_B], [-0.46, GLYPH_CAP_T], [-0.28, GLYPH_CAP_T], [0, -0.06], [0.28, GLYPH_CAP_T],
                   [0.46, GLYPH_CAP_T], [0.46, GLYPH_CAP_B], [0.30, GLYPH_CAP_B], [0.30, -0.22], [0.08, 0.12],
                   [-0.08, 0.12], [-0.30, -0.22], [-0.30, GLYPH_CAP_B]]);
}
function glyphLetterW() { return glyphScaleSegs(glyphLetterM(), -1); }

function glyphLetterN() {
  return glyphPolySegs([[-0.40, GLYPH_CAP_B], [-0.40, GLYPH_CAP_T], [-0.22, GLYPH_CAP_T], [0.20, 0.18], [0.20, GLYPH_CAP_T],
                   [0.38, GLYPH_CAP_T], [0.38, GLYPH_CAP_B], [0.20, GLYPH_CAP_B], [-0.22, -0.18], [-0.22, GLYPH_CAP_B]]);
}

// WIDER THAN THE DIGIT ZERO, which is the whole of the 0/O distinction and is worth stating: at
// cap height an oval narrow enough to look like a letter O looks like a zero instead. O gets the
// full 0.84 of width; `glyphDigit0` gets 0.64 and a centre dot on top of that.
function glyphLetterO() { return glyphOvalSegs(0, 0, 0.42, GLYPH_CAP_B).concat(glyphOvalSegs(0, 0, 0.26, 0.42)); }

function glyphLetterP() {
  return [["M", -0.40, GLYPH_CAP_T], ["L", 0.02, GLYPH_CAP_T],
          ["C", 0.26, GLYPH_CAP_T, 0.38, -0.44, 0.38, -0.21],
          ["C", 0.38, 0.02, 0.26, 0.16, 0.02, 0.16],
          ["L", -0.24, 0.16], ["L", -0.24, GLYPH_CAP_B], ["L", -0.40, GLYPH_CAP_B], ["Z"],
          ["M", -0.24, GLYPH_CAP_T + GLYPH_STEM], ["L", 0.02, GLYPH_CAP_T + GLYPH_STEM],
          ["C", 0.14, GLYPH_CAP_T + GLYPH_STEM, 0.22, -0.34, 0.22, -0.21],
          ["C", 0.22, -0.08, 0.14, 0, 0.02, 0], ["L", -0.24, 0], ["Z"]];
}

// THE TAIL IS A SECOND OP, NOT A SECOND LOOP. It crosses the ring, and even-odd would punch the
// crossing out and leave a Q with a gap in its bowl. Same call the flask's lip makes for the same
// reason — a shape drawn back ON TOP is an op, a hole is a loop (§1.3).
function glyphLetterQ() { return glyphLetterO(); }
function glyphLetterQTail() {
  return glyphBarSegs(0.06, 0.22, 0.46, 0.64, 0.105);
}

function glyphLetterS() {
  return [["M", 0.36, -0.40],
          ["C", 0.30, -0.54, 0.14, -0.60, -0.02, -0.60],
          ["C", -0.24, -0.60, -0.40, -0.48, -0.40, -0.28],
          ["C", -0.40, -0.08, -0.24, 0, -0.02, 0.04],
          ["C", 0.12, 0.07, 0.22, 0.11, 0.22, 0.22],
          ["C", 0.22, 0.34, 0.10, 0.42, -0.04, 0.42],
          ["C", -0.18, 0.42, -0.30, 0.36, -0.36, 0.26],
          ["L", -0.40, 0.44],
          ["C", -0.30, 0.55, -0.16, 0.60, -0.02, 0.60],
          ["C", 0.22, 0.60, 0.40, 0.46, 0.40, 0.22],
          ["C", 0.40, -0.02, 0.22, -0.10, 0.02, -0.14],
          ["C", -0.12, -0.17, -0.24, -0.20, -0.24, -0.30],
          ["C", -0.24, -0.38, -0.16, -0.44, -0.02, -0.44],
          ["C", 0.10, -0.44, 0.20, -0.40, 0.26, -0.32], ["Z"]];
}

function glyphLetterT() {
  return glyphBoxSegs(-0.40, GLYPH_CAP_T, 0.80, GLYPH_STEM)
    .concat(glyphBoxSegs(-0.08, GLYPH_CAP_T + GLYPH_STEM, GLYPH_STEM, 1.16 - GLYPH_STEM));
}

function glyphLetterU() {
  return [["M", -0.40, GLYPH_CAP_T], ["L", -0.40, 0.16],
          ["C", -0.40, 0.44, -0.24, GLYPH_CAP_B, 0, GLYPH_CAP_B],
          ["C", 0.24, GLYPH_CAP_B, 0.40, 0.44, 0.40, 0.16],
          ["L", 0.40, GLYPH_CAP_T], ["L", 0.24, GLYPH_CAP_T], ["L", 0.24, 0.16],
          ["C", 0.24, 0.32, 0.14, 0.42, 0, 0.42],
          ["C", -0.14, 0.42, -0.24, 0.32, -0.24, 0.16],
          ["L", -0.24, GLYPH_CAP_T], ["Z"]];
}

function glyphLetterV() {
  return glyphPolySegs([[-0.42, GLYPH_CAP_T], [-0.24, GLYPH_CAP_T], [0, 0.24], [0.24, GLYPH_CAP_T], [0.42, GLYPH_CAP_T],
                   [0.10, GLYPH_CAP_B], [-0.10, GLYPH_CAP_B]]);
}

// ---- digits -------------------------------------------------------------------------------------
//
// Named `glyphDigit0`..`glyphDigit9` and registered as `btn-0`..`btn-9`, so the roster reads as one family
// with the letters rather than as a second vocabulary. Same cap box, same 0.16 stroke; a prompt
// that says "press 4" has to sit beside one that says "press A".
//
// 0 IS NOT O AND 1 IS NOT I, and neither is left to luck. The zero is narrow AND dotted, and the
// dot is a THIRD nested loop — even-odd counts crossings, so outer fills, counter clears, dot fills
// again. That is the same mechanic the cog's hole uses, one level deeper. The one is a flagged post
// with NO foot, against a serifed I.

function glyphDigit0() {
  // 0.34 against O's 0.42, and the counter has to stay WIDE ENOUGH TO SHOW THE DOT — at 0.16 the
  // dot touched both sides of the counter and the zero came out looking barred rather than dotted.
  return glyphOvalSegs(0, 0, 0.34, GLYPH_CAP_B)
    .concat(glyphOvalSegs(0, 0, 0.18, 0.42), glyphBoxSegs(-0.045, -0.09, 0.09, 0.18));
}

function glyphDigit1() {
  return glyphBoxSegs(-0.06, GLYPH_CAP_T, GLYPH_STEM, 1.16)
    .concat(glyphPolySegs([[-0.06, GLYPH_CAP_T], [-0.06, -0.38], [-0.28, -0.24], [-0.28, -0.42]]));
}

function glyphDigit2() {
  return [["M", -0.38, -0.34],
          ["C", -0.36, -0.52, -0.20, -0.60, 0, -0.60],
          ["C", 0.22, -0.60, 0.40, -0.49, 0.40, -0.28],
          ["C", 0.40, -0.10, 0.28, 0.04, 0.10, 0.20],
          ["L", -0.12, 0.42], ["L", 0.42, 0.42], ["L", 0.42, GLYPH_CAP_B], ["L", -0.40, GLYPH_CAP_B],
          ["L", -0.40, 0.42], ["L", -0.02, 0.06],
          ["C", 0.14, -0.08, 0.24, -0.17, 0.24, -0.28],
          ["C", 0.24, -0.38, 0.14, -0.44, 0, -0.44],
          ["C", -0.14, -0.44, -0.23, -0.37, -0.24, -0.28], ["Z"]];
}

function glyphDigit3() {
  return [["M", -0.34, -0.42],
          ["C", -0.28, -0.56, -0.14, -0.60, 0.02, -0.60],
          ["C", 0.24, -0.60, 0.40, -0.50, 0.40, -0.30],
          ["C", 0.40, -0.16, 0.32, -0.06, 0.18, -0.02],
          ["C", 0.34, 0.02, 0.42, 0.12, 0.42, 0.26],
          ["C", 0.42, 0.48, 0.26, 0.60, 0.02, 0.60],
          ["C", -0.16, 0.60, -0.30, 0.54, -0.36, 0.42],
          ["L", -0.24, 0.32],
          ["C", -0.18, 0.40, -0.08, 0.44, 0.02, 0.44],
          ["C", 0.18, 0.44, 0.26, 0.37, 0.26, 0.26],
          ["C", 0.26, 0.14, 0.16, 0.08, 0, 0.08],
          ["L", -0.10, 0.08], ["L", -0.10, -0.08], ["L", 0, -0.08],
          ["C", 0.14, -0.08, 0.24, -0.15, 0.24, -0.28],
          ["C", 0.24, -0.38, 0.16, -0.44, 0.02, -0.44],
          ["C", -0.08, -0.44, -0.16, -0.40, -0.22, -0.34], ["Z"]];
}

// Three pieces that SHARE edges — the diagonal's right edge is the stem's left, and its foot is the
// crossbar's top. Nothing overlaps, so nothing cancels.
function glyphDigit4() {
  return glyphBoxSegs(0.10, GLYPH_CAP_T, GLYPH_STEM, 1.16)
    .concat(glyphBoxSegs(-0.40, 0.06, 0.50, GLYPH_STEM),
            glyphPolySegs([[0.10, GLYPH_CAP_T], [0.10, -0.30], [-0.22, 0.06], [-0.40, 0.06]]));
}

function glyphDigit5() {
  return [["M", -0.36, GLYPH_CAP_T], ["L", 0.36, GLYPH_CAP_T], ["L", 0.36, -0.42], ["L", -0.20, -0.42],
          ["L", -0.20, -0.14],
          ["C", -0.12, -0.18, -0.02, -0.20, 0.06, -0.20],
          ["C", 0.28, -0.20, 0.42, -0.04, 0.42, 0.18],
          ["C", 0.42, 0.42, 0.26, 0.60, 0, 0.60],
          ["C", -0.18, 0.60, -0.32, 0.54, -0.38, 0.42],
          ["L", -0.26, 0.32],
          ["C", -0.20, 0.40, -0.10, 0.44, 0, 0.44],
          ["C", 0.16, 0.44, 0.26, 0.34, 0.26, 0.19],
          ["C", 0.26, 0.04, 0.16, -0.04, 0.02, -0.04],
          ["C", -0.10, -0.04, -0.22, 0.02, -0.28, 0.10],
          ["L", -0.36, 0.06], ["Z"]];
}

// 6 and 9 are one drawing and its half-turn, the same trick M and W use. A hand-drawn pair drifts;
// this one cannot.
function glyphDigit6() {
  return [["M", 0.34, -0.44],
          ["C", 0.28, -0.55, 0.16, -0.60, 0, -0.60],
          ["C", -0.26, -0.60, -0.42, -0.38, -0.42, 0.10],
          ["C", -0.42, 0.40, -0.26, 0.60, 0.02, 0.60],
          ["C", 0.28, 0.60, 0.42, 0.42, 0.42, 0.20],
          ["C", 0.42, -0.02, 0.26, -0.18, 0.02, -0.18],
          ["C", -0.12, -0.18, -0.22, -0.12, -0.26, -0.04],
          ["C", -0.24, -0.34, -0.16, -0.44, 0, -0.44],
          ["C", 0.08, -0.44, 0.16, -0.41, 0.20, -0.36], ["Z"]]
    .concat(glyphOvalSegs(0, 0.21, 0.26, 0.23));
}
function glyphDigit9() { return glyphScaleSegs(glyphDigit6(), -1); }

function glyphDigit7() {
  return glyphBoxSegs(-0.38, GLYPH_CAP_T, 0.76, GLYPH_STEM)
    .concat(glyphPolySegs([[0.38, GLYPH_CAP_T + GLYPH_STEM], [0.02, GLYPH_CAP_B], [-0.16, GLYPH_CAP_B], [0.20, GLYPH_CAP_T + GLYPH_STEM]]));
}

// The waist is drawn, not implied. Two ovals stacked would touch at a single point and rasterize as
// two separate rings; the outline pinches to 0.32 of solid ink instead, so the 8 stays one glyph.
function glyphDigit8() {
  return [["M", 0, -0.60],
          ["C", 0.24, -0.60, 0.34, -0.48, 0.34, -0.32],
          ["C", 0.34, -0.20, 0.28, -0.10, 0.16, -0.04],
          ["C", 0.32, 0.02, 0.42, 0.12, 0.42, 0.28],
          ["C", 0.42, 0.48, 0.24, 0.60, 0, 0.60],
          ["C", -0.24, 0.60, -0.42, 0.48, -0.42, 0.28],
          ["C", -0.42, 0.12, -0.32, 0.02, -0.16, -0.04],
          ["C", -0.28, -0.10, -0.34, -0.20, -0.34, -0.32],
          ["C", -0.34, -0.48, -0.24, -0.60, 0, -0.60], ["Z"]]
    .concat(glyphOvalSegs(0, -0.31, 0.17, 0.13), glyphOvalSegs(0, 0.27, 0.24, 0.17));
}

// The three shape marks default to RINGS, which is how they appear on a controller and what keeps
// them readable over a coloured button. `solid` fills them for anyone who wants the other reading.
const GLYPH_LETTER_SEGS = { a: glyphLetterA, b: glyphLetterB, c: glyphLetterC, l: glyphLetterL,
                      r: glyphLetterR, x: glyphLetterX, y: glyphLetterY, z: glyphLetterZ,
                      d: glyphLetterD, e: glyphLetterE, f: glyphLetterF, g: glyphLetterG, h: glyphLetterH, i: glyphLetterI,
                      j: glyphLetterJ, k: glyphLetterK, m: glyphLetterM, n: glyphLetterN, o: glyphLetterO, p: glyphLetterP,
                      q: glyphLetterQ, s: glyphLetterS, t: glyphLetterT, u: glyphLetterU, v: glyphLetterV, w: glyphLetterW,
                      "0": glyphDigit0, "1": glyphDigit1, "2": glyphDigit2, "3": glyphDigit3, "4": glyphDigit4,
                      "5": glyphDigit5, "6": glyphDigit6, "7": glyphDigit7, "8": glyphDigit8, "9": glyphDigit9 };

// Appended after the eight originals and the four shape marks, in that order, and never sorted.
const GLYPH_LETTERS_ADDED = ["d", "e", "f", "g", "h", "i", "j", "k", "m", "n", "o", "p", "q", "s",
                       "t", "u", "v", "w"];
const GLYPH_DIGITS_ADDED = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

// ---- composite marks (§11.10) --------------------------------------------------------------
//
// A shoulder-button legend and a system-button legend are TWO OR MORE OF THE MARKS ABOVE sharing
// one box. They are appended after the digits and never sorted, for the same reason the digits are
// (§7): the index is what a preset and a share link store.
//
// Every one of these is `glyphWordSegs` and nothing else. That is the test of the helper, not a saving
// of typing — the maintainer's roster of fourteen is the first customer of a composer that any
// string can drive, so a mark that needed its own geometry would be a bug report against
// `glyphWordSegs` rather than a special case to write here.
const GLYPH_COMPOSITE_MARKS = [
  "RB", "RT", "LB", "LT",
  "R1", "R2", "R3", "L1", "L2", "L3",
  "ZR", "ZL",
  // 48px IS THE FLOOR FOR THESE TWO, MEASURED — rendered through the real pipeline at 24/32/48/64
  // they are mush at 24 and 32, readable at 48 and clean at 64. Five and six glyphs each get about
  // a fifth of a SQUARE box, and the box is square by construction (`natural` returns {w:g,h:g}).
  // The fix is a WIDE mark, not condensed letters or tighter tracking — condensing is the two-
  // typefaces failure again, and tightening only trades legibility for a different kind of mush.
  "START", "SELECT",
];

const GLYPH_INPUTS = ["a", "b", "c", "l", "r", "x", "y", "z"].map(function (ch) {
  return { name: "btn-" + ch, slots: {}, controls: [],
           segs: function () { return GLYPH_LETTER_SEGS[ch](); } };
}).concat([
  {
    // The ✕ mark, which is what `btn-x` used to be. Symmetric arms, so it reads as a symbol rather
    // than as a letter — the same shape `close` uses, at button scale.
    name: "btn-cross", slots: {}, controls: [],
    segs: function () { return glyphCrossSegs(0.62, 0.135, Math.PI / 4); },
  },
  {
    name: "btn-triangle", slots: { solid: 0 }, controls: [["solid", "Solid", 0, 1]],
    segs: function (rp) {
      const o = glyphPolySegs([[0, -0.66], [0.62, 0.46], [-0.62, 0.46]]);
      return rp.solid ? o : o.concat(glyphPolySegs([[0, -0.30], [0.38, 0.32], [-0.38, 0.32]]));
    },
  },
  {
    name: "btn-circle", slots: { solid: 0 }, controls: [["solid", "Solid", 0, 1]],
    segs: function (rp) {
      const o = glyphCircleSegs(0, 0, 0.60);
      return rp.solid ? o : o.concat(glyphCircleSegs(0, 0, 0.42));
    },
  },
  {
    name: "btn-square", slots: { solid: 0 }, controls: [["solid", "Solid", 0, 1]],
    segs: function (rp) {
      const o = glyphBoxSegs(-0.56, -0.56, 1.12, 1.12);
      return rp.solid ? o : o.concat(glyphBoxSegs(-0.38, -0.38, 0.76, 0.76));
    },
  },
]).concat(GLYPH_LETTERS_ADDED.map(function (ch) {
  return { name: "btn-" + ch, slots: {}, controls: [],
           segs: function () { return GLYPH_LETTER_SEGS[ch](); },
           over: ch === "q" ? glyphLetterQTail : null };
})).concat(GLYPH_DIGITS_ADDED.map(function (ch) {
  return { name: "btn-" + ch, slots: {}, controls: [],
           segs: function () { return GLYPH_LETTER_SEGS[ch](); } };
})).concat(GLYPH_COMPOSITE_MARKS.map(function (w) {
  return { name: "btn-" + w.toLowerCase(), slots: {}, controls: [],
           segs: function () { return glyphWordSegs(w); } };
}));

// ============================================================================================
// §11.3 — THE SCALABLE ROSTER. Ported from CrunchyVFX's GLYPH_SHAPES, and this is the half of §11
// the first pass got wrong.
//
// The correction: VFX's records do not port as 16x16 MASKS — a bezier evaluated into a 16-grid is
// mush, and that much was right. But they are vector paths spelled in Canvas2D, and §1.2's op
// table has promised `path(…)` -> snapped in raster, `<path d>` in SVG since the day it was
// written. Ported onto that op they are honest at BOTH ends: a stair-stepped small sprite and a
// true curve at any size, which is the whole reason SVG is a first-class target (§0.1.5).
//
// Of VFX's 88: 26 are pure path, 47 more add a stroke or a cut, and 15 cannot come at all — glow,
// spark, smoke and friends are radial gradients and per-pixel noise, which is particle machinery
// rather than a drawing.
//
// COORDINATES ARE VFX'S OWN, in the -1..1 space its `R` scaling produces, so a record here can be
// read against the record it came from. `glyphToUnit` maps that to the unit space the op wants.
//
// A HOLE IS A SECOND LOOP IN THE SAME OP (even-odd). Anything drawn back ON TOP is a separate op.
// VFX used `destination-out` for both, which it can afford because it composites a white mask;
// here the painter's model is the contract both renderers share, so the two cases split (§1.3).
//
// DEFAULT GRID 64, NOT 32 AND NOT 16. Measured rather than assumed: at 32 a coin's rim rasterizes
// to an OCTAGON, a keyring's bow is a jagged blob, and an atom's orbits are lumpy — these were
// authored against VFX's 64px sprite and were being sampled at half of it. Straight-edged shapes
// gain nothing; the curved ones gain a lot, and one number for the roster beats two.

function glyphToUnit(segs) {
  // -1..1 -> 0..1, in place per segment: ["Q",-0.8,0.4,0,0.97] reads as VFX wrote it.
  return segs.map(function (g) {
    const out = [g[0]];
    for (let i = 1; i < g.length; i++) out.push(0.5 + g[i] * 0.5);
    return out;
  });
}

// A circle as four cubics — 0.5523 is the standard control-point ratio. No arc segment exists in
// the op on purpose: SVG's elliptical-arc parameters are one more thing to convert wrongly.
const GLYPH_KAPPA = 0.5522847498;

// ROTATE A SEG LIST AND FIT IT BACK INTO THE UNIT BOX. Written for the three blades, which were
// authored upright and asked to lie diagonally (maintainer's, 2026-08-27, with a reference).
//
// ROTATING BEATS REDRAWING HERE, and that is the whole reason this helper exists rather than three
// new point lists. What separates a dagger from a sword from a greatsword is PROPORTION — a short
// broad blade over a big guard against a thin line against a wide blade with a fuller — and every
// one of those numbers was tuned against the collision sweep. Re-plotting them by hand at an angle
// throws that work away and re-opens a question already answered; a rotation preserves it exactly.
//
// THE FIT IS NOT OPTIONAL. A tall shape turned 45 degrees has a bounding box the length of its own
// diagonal, so without renormalising every blade would hang out of its box and be clipped.
function glyphRotFitSegs(segs, deg, slim, span) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  // ACROSS THE BLADE FIRST, and this is the part the first attempt got wrong. Turning a tall shape
  // 45 degrees and refitting scales it by root two, so the drawing keeps its proportions and grows
  // to fill the box — which on a blade reads as CHUNKY, because the empty space beside an upright
  // sword was doing work the diagonal one has lost. Squeezing x before the turn takes the width
  // back out without touching the length, and the guard's span narrows with it, which is right:
  // a guard is a fraction of the blade, not an absolute.
  if (slim && slim !== 1) {
    segs = segs.map(function (g) {
      const o = [g[0]];
      for (let i = 1; i < g.length; i += 2) o.push(g[i] * slim, g[i + 1]);
      return o;
    });
  }
  // Every seg is [cmd, ...numbers] and the numbers are coordinate PAIRS — one for M and L, two for
  // Q, none for Z — so walking them two at a time handles the whole vocabulary without a table.
  const turn = segs.map(function (g) {
    const o = [g[0]];
    for (let i = 1; i < g.length; i += 2) o.push(g[i] * c - g[i + 1] * s, g[i] * s + g[i + 1] * c);
    return o;
  });
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  turn.forEach(function (g) {
    for (let i = 1; i < g.length; i += 2) {
      x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]);
      y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]);
    }
  });
  const k = (span || 1.94) / Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return turn.map(function (g) {
    const o = [g[0]];
    for (let i = 1; i < g.length; i += 2) o.push((g[i] - cx) * k, (g[i + 1] - cy) * k);
    return o;
  });
}

// SCREEN Y RUNS DOWN, so a POSITIVE angle turns clockwise and a blade drawn along -y comes to rest
// pointing up and to the RIGHT — which is the way every reference draws one, and the way the
// maintainer's is drawn. 45 exactly: at 40 or 50 it reads as a sword that has slipped.
const GLYPH_BLADE_TILT = 45;
// Tuned by rendering, not derived: see the note in `glyphRotFitSegs` about root two.
const GLYPH_BLADE_SLIM = 0.74;

function glyphCircleSegs(cx, cy, r) {
  const k = r * GLYPH_KAPPA;
  return [["M", cx, cy - r],
          ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy],
          ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r],
          ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy],
          ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r],
          ["Z"]];
}
// The same four cubics with two radii. A LETTER'S BOWL IS NEVER CIRCULAR — an O at cap height is
// taller than it is wide, and forcing `glyphCircleSegs` would either squash the letter or make it as
// wide as it is tall, which is how a capital O turns into a zero. Kept beside `glyphCircleSegs` rather
// than in §11.9 because it is the same primitive, not a lettering trick.
function glyphOvalSegs(cx, cy, rx, ry) {
  const kx = rx * GLYPH_KAPPA, ky = ry * GLYPH_KAPPA;
  return [["M", cx, cy - ry],
          ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
          ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
          ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
          ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
          ["Z"]];
}
function glyphBoxSegs(x, y, w, h) {
  return [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
}

// A GLYPH IS SCALED IN UNIT SPACE, BEFORE `glyphToUnit`. Every roster authors in the same -1..1 box centred
// on zero — hand-written, ported, and imported alike (importer.js fits to it) — so multiplying the
// coordinates shrinks the drawing about its own centre and needs nothing from the op.
function glyphScaleSegs(segs, k) {
  if (k === 1) return segs;
  return segs.map(function (g) {
    const out = [g[0]];
    for (let i = 1; i < g.length; i++) out.push(g[i] * k);
    return out;
  });
}

// A COMPOSITE MARK IS PLACED, NEVER REDRAWN (§11.10). `glyphScaleSegs` scales about the origin, which is
// all a single glyph ever needs; a row of glyphs needs the same scale plus somewhere to sit. So
// `glyphPlaceSegs` is `glyphScaleSegs` with an x-offset — uniform k, then a translate — and it steps by PAIRS
// because only the x of each pair moves. `glyphScaleSegs` can walk the values blindly precisely because
// it does not translate; the moment one axis is special the walk has to know which axis it is on.
function glyphPlaceSegs(segs, k, dx) {
  return segs.map(function (g) {
    const out = [g[0]];
    for (let i = 1; i < g.length; i += 2) out.push(g[i] * k + dx, g[i + 1] * k);
    return out;
  });
}

// The authored x-extent of a path, control points included. THE OVERSHOOT IS DELIBERATE: a cubic
// never reaches its control points, so a round letter measures a little wider than its ink. That
// errs toward MORE space between glyphs, which is the direction a spacing bug is allowed to go.
function glyphSegsSpanX(segs) {
  let lo = Infinity, hi = -Infinity;
  segs.forEach(function (g) {
    for (let i = 1; i < g.length; i += 2) { if (g[i] < lo) lo = g[i]; if (g[i] > hi) hi = g[i]; }
  });
  return lo > hi ? [0, 0] : [lo, hi];
}

// TRACKING IS AUTHORED SPACE, NOT A FRACTION OF THE CELL — it is the gap between two glyphs and has
// to stay proportional to the 0.16 stroke they are built from, or a long mark closes up while a
// short one falls apart. 0.14 is just under one stroke: measured on the contact sheet at 24px,
// where the tightest pair in the roster (R against 1) still shows daylight.
const GLYPH_WORD_TRACK = 0.14;
// The half-width a packed row is fitted into. Matches the room a single glyph already takes plus a
// little, so a composite does not crowd the plate's rim.
const GLYPH_WORD_SPAN = 0.86;

// ONE CALL COMPOSES ANY STRING THE ROSTER CAN SPELL, and that is the feature — the fourteen
// composite marks below are its first customers, not its definition. A def that needed bespoke
// geometry would mean this helper is wrong.
//
// EACH GLYPH KEEPS ITS OWN WIDTH AND THEY SHARE ONE SCALE. Packing N glyphs into N equal cells is
// the obvious version and it is wrong twice: the digit 1 is 0.38 wide against R's 0.82, so a fixed
// cell leaves it swimming, and `glyphDigit1` is not centred on its own origin (its flag hangs left), so
// centring by ORIGIN rather than by INK visibly shunts it. Measuring instead gives proportional
// advances for free.
//
// UNIFORM SCALE ONLY. Condensing a glyph to make it fit is what makes a pair read as two typefaces,
// which is the exact failure B and C were re-authored to undo — so the row is fitted by shrinking
// EVERYTHING together, and `k` is capped at 1 so a short mark sits at the same cap height as the
// single-glyph marks beside it rather than inflating to fill the span.
//
// Q IS BLOCKED FROM COMPOSITION, so `glyphWordSegs("Q")` THROWS. Its tail is a second op
// (`glyphLetterQTail`) because it crosses its own bowl, and `segs` returns one path — so a composable Q
// hands back the bowl alone, which is not a damaged Q, it is a correct O. Verified: with the letter
// present, `glyphWordSegs("Q")` returned geometry byte-identical to `glyphWordSegs("O")`.
//
// THAT IS THE WORST SHAPE A BUG CAN HAVE — a silent substitution of one valid glyph for another
// valid glyph, which no render, no crash and no eyeball on a contact sheet catches, because the
// output looks exactly like something you might have asked for. Leaving it composable behind a
// comment would have made the eventual composer's first bug report "why does Q draw an O".
//
// So it is unspellable instead. NOT by dropping it from `GLYPH_LETTER_SEGS` — that was the first attempt
// and it broke `btn-q`, because the single-letter def resolves its own shape through the same table;
// the table is the glyph SHAPES, and "needs a second op" is a different fact about a letter. Hence
// a separate `GLYPH_COMPOSE_BLOCKED`, derived from the same condition the def uses.
//
// `icons/a-composable-letter-is-the-whole-letter` holds the rule rather than this paragraph: any
// mark carrying an `extra` must be blocked. Making Q composable means teaching `glyphWordSegs` to place
// tails, at which point the assertion tells you to unblock it.
// Letters whose drawing is not entirely in their `segs`. Keyed off the same fact the roster uses to
// hand them an `extra`, so the two cannot drift apart.
const GLYPH_COMPOSE_BLOCKED = { q: true };

function glyphWordSegs(str, span) {
  const half = (span == null ? GLYPH_WORD_SPAN : span);
  const gs = str.split("").map(function (ch) {
    const key = ch.toLowerCase();
    if (GLYPH_COMPOSE_BLOCKED[key]) {
      throw new Error("glyphWordSegs: " + JSON.stringify(ch) + " needs a second op and would compose as "
                      + "a different letter — see GLYPH_COMPOSE_BLOCKED");
    }
    const f = GLYPH_LETTER_SEGS[key];
    if (!f) throw new Error("glyphWordSegs: no glyph for " + JSON.stringify(ch));
    const segs = f();
    const sp = glyphSegsSpanX(segs);
    return { segs: segs, lo: sp[0], w: sp[1] - sp[0] };
  });
  let total = GLYPH_WORD_TRACK * (gs.length - 1);
  gs.forEach(function (g) { total += g.w; });
  const k = Math.min(1, (2 * half) / total);
  let pen = -total * k / 2;
  let out = [];
  gs.forEach(function (g) {
    out = out.concat(glyphPlaceSegs(g.segs, k, pen - g.lo * k));
    pen += (g.w + GLYPH_WORD_TRACK) * k;
  });
  return out;
}

// `segs(rp)` returns ONE path. `over(rp)` returns a SECOND path drawn back on top (its own even-odd fill, unioned over
// the first), which is how a coin gets its centre boss and a flask its lip without an erase.
const GLYPH_SHAPES = [
  { name: "shield", segs: function () {
      return [["M", 0, -0.97], ["L", 0.82, -0.6], ["Q", 0.82, 0.44, 0, 0.97],
              ["Q", -0.82, 0.44, -0.82, -0.6], ["Z"]];
    } },
  // WIDENED AT THE BASE, 2026-08-14. The notch below was already cut deeper than VFX's because the
  // particle-scale version read as a leaf — and it still did, because the notch was not the problem:
  // the SILHOUETTE was a narrow pointed oval, which is also what `leaf`, `feather`, `drop`, `spike`
  // and `wing` were. Six shapes with one outline between them. A flame is bulbous low and tapers
  // hard, so the fix is mass at the bottom rather than more detail at the top.
  { name: "flame", segs: function () {
      // A LEANING TIP AND A WAVY EDGE. The deep centred notch that was here made a spade, because a
      // symmetric two-lobed bottom IS one. Fire is asymmetric: the tip curls off to one side and the
      // sides ripple. That also separates it from `drop`, which is now a clean symmetric teardrop.
      // THREE TONGUES OF UNEQUAL HEIGHT over a round base. The S-curl attempt before this came out
      // a paisley, and the symmetric two-lobed one before that a spade — both because the detail was
      // at the BOTTOM. Fire is read from its top edge: several peaks, none matching, rising from a
      // body that is otherwise plain. Putting the whole signal up there also keeps it clear of
      // `drop`, which is a smooth teardrop and now the only other thing in this family.
      return [["M", -0.08, -0.96],                       // the tall tongue
              ["Q", 0.14, -0.52, 0.22, -0.34],
              ["Q", 0.34, -0.46, 0.46, -0.66],           // a shorter one, right
              ["Q", 0.56, -0.30, 0.64, 0.06],
              ["Q", 0.72, 0.62, 0, 0.95],                // round base
              ["Q", -0.72, 0.62, -0.64, 0.06],
              ["Q", -0.58, -0.24, -0.50, -0.50],         // the shortest, left
              ["Q", -0.36, -0.30, -0.26, -0.40],
              ["Q", -0.20, -0.66, -0.08, -0.96], ["Z"]];
    } },
  { name: "gemcut", slots: { facets: 1 }, controls: [["facets", "Facets", 0, 1]],
    segs: function (rp) {
      const tw = 0.52, ty = -0.34;
      const body = [["M", -tw, ty], ["L", tw, ty], ["L", 0.86, -0.04], ["L", 0, 0.97],
                    ["L", -0.86, -0.04], ["Z"]];
      if (!rp.facets) return body;
      // The facets are CUT, as loops, not stroked over: VFX could stroke them out of a white mask
      // and we cannot, so each becomes a thin quad in the same even-odd path.
      return body.concat(
        [["M", -tw, ty], ["L", 0, 0.97], ["L", 0.06, 0.97], ["L", -tw + 0.06, ty], ["Z"]],
        [["M", tw, ty], ["L", 0, 0.97], ["L", -0.06, 0.97], ["L", tw - 0.06, ty], ["Z"]],
        glyphBoxSegs(-0.86, -0.08, 1.72, 0.07));
    } },
  { name: "flask", segs: function () {
      return [["M", -0.2, -0.86], ["L", -0.2, -0.28],
              ["Q", -0.86, 0.42, -0.62, 0.7],
              ["Q", 0, 0.95, 0.62, 0.7],
              ["Q", 0.86, 0.42, 0.2, -0.28],
              ["L", 0.2, -0.86], ["Z"]];
    },
    // The lip is a rectangle drawn ON TOP, not a loop in the same path: it overlaps the neck, and
    // even-odd would punch the overlap out instead of joining it.
    over: function () { return glyphBoxSegs(-0.34, -0.98, 0.68, 0.14); } },
  { name: "crown", segs: function () {
      return [["M", -0.9, 0.65], ["L", -0.9, -0.72], ["L", -0.45, -0.06], ["L", 0, -0.98],
              ["L", 0.45, -0.06], ["L", 0.9, -0.72], ["L", 0.9, 0.65], ["Z"]]
        .concat(glyphBoxSegs(-0.9, 0.16, 1.8, 0.1));       // the band, cut
    } },
  // DIAGONAL SINCE 2026-08-27, and authored upright because that is how the proportions were tuned.
  // See `glyphRotFitSegs`: the tilt is applied to the finished drawing rather than plotted into it.
  { name: "sword", segs: function () {
      return glyphRotFitSegs([["M", 0, -0.97], ["L", 0.17, -0.58], ["L", 0.17, 0.2], ["L", -0.17, 0.2],
                         ["L", -0.17, -0.58], ["Z"]]
        .concat(glyphBoxSegs(-0.6, 0.2, 1.2, 0.18))         // crossguard
        .concat(glyphBoxSegs(-0.1, 0.38, 0.2, 0.42))        // grip
        .concat(glyphCircleSegs(0, 0.8, 0.15)),             // pommel
        GLYPH_BLADE_TILT, GLYPH_BLADE_SLIM);
    } },
  { name: "keyring", segs: function () {
      return glyphCircleSegs(0, -0.5, 0.4)
        .concat(glyphCircleSegs(0, -0.5, 0.17))             // the bow's hole, as a second loop
        .concat(glyphBoxSegs(-0.11, -0.5, 0.22, 1.32))      // shaft
        .concat(glyphBoxSegs(0.09, 0.38, 0.32, 0.15))       // teeth
        .concat(glyphBoxSegs(0.09, 0.66, 0.26, 0.15));
    } },
  { name: "coin", segs: function () {
      return glyphCircleSegs(0, 0, 0.97).concat(glyphCircleSegs(0, 0, 0.7));
    },
    over: function () { return glyphCircleSegs(0, 0, 0.34); } },
  // THE JAW WAS A SEPARATE BOX OVERLAPPING THE CRANIUM, and the overlap cancelled (§11.3): it bit a
  // notch out of the skull's underside and left the teeth floating below a gap. Cranium and jaw are
  // ONE outline now — an arc from where the jaw meets the circle, over the top, back down to the
  // other corner, then round the jaw. The sockets, nose and tooth gaps stay cuts, because those
  // really are holes and are entirely inside the shape.
  { name: "skull", segs: function () {
      const cx = 0, cy = -0.18, r = 0.72, jx = 0.34, jy = 0.78;
      const ay = cy + Math.sqrt(r * r - jx * jx);      // where the jaw's corners meet the cranium
      const a0 = Math.atan2(ay - cy, jx);              // right corner
      const a1 = Math.atan2(ay - cy, -jx) - Math.PI * 2;  // left corner, the long way over the top
      const pts = [];
      for (let i = 0; i <= 44; i++) {
        const a = a0 + (a1 - a0) * i / 44;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      pts.push([-jx, jy], [jx, jy]);
      return glyphPolySegs(pts)
        .concat(glyphCircleSegs(-0.30, -0.24, 0.21))        // sockets, cut
        .concat(glyphCircleSegs(0.30, -0.24, 0.21))
        .concat([["M", 0, 0.00], ["L", 0.13, 0.26], ["L", -0.13, 0.26], ["Z"]])   // nose, cut
        .concat(glyphBoxSegs(-0.13, 0.44, 0.09, 0.34))      // tooth gaps, cut
        .concat(glyphBoxSegs(0.04, 0.44, 0.09, 0.34));
    } },
  // TILTED, AND GIVEN A STEM, 2026-08-14. Upright and symmetric it was a lens — the same outline as
  // flame, feather and drop. The DIAGONAL is what makes a leaf read instantly, because nothing else
  // in the roster lies on one, and the stem says which end is which. The midrib is still a cut
  // (even-odd, §11.3) and now runs along the tilt so it reinforces the axis rather than fighting it.
  { name: "leaf", segs: function () {
      // The control points bulge PERPENDICULAR to the tilt axis — a Q control on the axis itself just
      // makes a sliver, which is what the first attempt drew.
      return [["M", -0.52, 0.52],
              ["Q", -0.51, -0.77, 0.78, -0.78],        // upper edge, base to tip
              ["Q", 0.77, 0.51, -0.52, 0.52],          // lower edge, tip back to base
              ["Z"]]
        .concat(glyphPolySegs([[-0.50, 0.38], [-0.38, 0.50], [-0.88, 0.94], [-0.96, 0.86]]))  // stem
        .concat(glyphPolySegs([[-0.44, 0.48], [0.66, -0.66], [0.72, -0.60], [-0.38, 0.54]])); // midrib, cut
    } },
  // TURNED UPRIGHT, which is the one place a ported shape is deliberately not VFX's. Its teardrop
  // lies along +x because a particle travels; an icon of a drop points down, and rotated 90° the
  // same curve reads immediately. `tail` moves the tip rather than the whole shape.
  { name: "drop", slots: { tail: 60 }, controls: [["tail", "Tail", 0, 100]],
    segs: function (rp) {
      // A BULB, THEN A TIP. The old curve ran tip-to-tip through a shoulder and came out as a
      // pointed oval at both ends — a lens, which is what five other shapes also were. A drop is
      // very nearly a CIRCLE with a spike pulled off the top, so the bottom half is drawn as one,
      // and the taper happens entirely above the shoulder.
      const ty = -(0.25 + 0.7 * (rp.tail / 100));
      const r = 0.60, cy = 0.36, k = r * GLYPH_KAPPA;
      return [["M", 0, ty],
              ["C", 0.26, ty * 0.42, r, cy - k, r, cy],           // tip to the right shoulder
              ["C", r, cy + k, k, cy + r, 0, cy + r],             // round the bottom
              ["C", -k, cy + r, -r, cy + k, -r, cy],
              ["C", -r, cy - k, -0.26, ty * 0.42, 0, ty], ["Z"]]; // back up to the tip
    } },
  // ---- two more the port got wrong (2026-08-14) -------------------------------------------------
  // Both are §11.3 failures rather than drawing ones: VFX composed them with `destination-out` and
  // the extraction turned that into extra loops, which under even-odd cancel instead of erasing.

  // A STRAY `Z` MID-PATH. The port closed the dome as its own subpath and then started the wavy
  // skirt as a second one — so the skirt overlapped the dome and cancelled, leaving a semicircle
  // with a diagonal bite out of it. It is one loop: up the left, over the crown, down the right,
  // and three scallops back along the bottom.
  { name: "ghost", segs: function () {
      return [["M", -0.74, 0.34],
              ["L", -0.74, -0.12],
              ["C", -0.74, -0.507, -0.387, -0.86, 0, -0.86],
              ["C", 0.387, -0.86, 0.74, -0.507, 0.74, -0.12],
              ["L", 0.74, 0.34],
              ["Q", 0.493, 1.20, 0.247, 0.34],
              ["Q", 0, 1.20, -0.247, 0.34],
              ["Q", -0.493, 1.20, -0.74, 0.34], ["Z"]]
        .concat(glyphOvalSegs(-0.30, -0.22, 0.15, 0.20))    // eyes, cut
        .concat(glyphOvalSegs(0.30, -0.22, 0.15, 0.20));
    } },

  // FOUR STEM BARS RADIATING FROM THE CENTRE, drawn twice and all crossing each other — which under
  // even-odd is a hole at every intersection, so the leaves fused into one blob and the bars became
  // the four spikes sticking out of it. Redrawn as four TANGENT lobes and one stem: tangent because
  // overlapping lobes would cancel exactly the way the bars did.
  { name: "clover", segs: function () {
      // FOUR TANGENT CIRCLES ENCLOSE NOTHING. The first redraw placed them touching, which left a
      // diamond of daylight where all four meet — tangency is a single POINT, not a join — and a
      // stem that could not reach the body without overlapping a lobe and cancelling it.
      //
      // ONE OUTLINE FIXES BOTH. Trace 270 degrees of each lobe, hand off at the tangent point to
      // the next, and the centre is interior by construction. The stem is a spur inserted at the
      // BOTTOM cusp: a triangle tapering from the point where the two lower lobes meet, which is
      // the one place a stem can attach without crossing anything.
      const r = 0.40, d = 0.40, SEG = 14;
      // Each lobe, and the angle its arc starts at — chosen so every arc ends where the next begins.
      const LOBE = [[d, -d, Math.PI], [d, d, Math.PI * 1.5], [-d, d, 0], [-d, -d, Math.PI * 0.5]];
      const pts = [];
      LOBE.forEach(function (L, i) {
        for (let k = 0; k <= SEG; k++) {
          const a = L[2] + (Math.PI * 1.5) * k / SEG;
          pts.push([L[0] + Math.cos(a) * r, L[1] + Math.sin(a) * r]);
        }
        // ...and after the bottom-right lobe the path is at the bottom cusp (0, d), which is where
        // the stem hangs from.
        if (i === 1) pts.push([0.07, 0.99], [-0.05, 0.99]);
      });
      return glyphPolySegs(pts);
    } },

  // ---- six redrawn from the ported roster (2026-08-14) ------------------------------------------
  // These override the icons-vfx.js versions of the same name (see the skip in the GLYPH_PORTED loop).
  // The port is left alone there: it is VFX's data, and editing it would make the two repos disagree
  // about a shape neither of them would then own.

  // A CRESCENT WAS TWO CONCENTRIC ARCS, so it rendered as an ARCH. The obvious fix — a big circle
  // with a smaller one over it — does NOT work under even-odd (§11.3): a cutter placed where a
  // crescent needs it pokes outside the disc, and the part sticking out is covered once, so it
  // FILLS. It has to be a single outline: two arcs meeting at the horns.
  { name: "crescent", segs: function () {
      return [["M", -0.30, -0.87],
              ["Q", 0.98, -0.92, 0.92, 0],        // outer edge, sweeping right
              ["Q", 0.98, 0.92, -0.30, 0.87],
              ["Q", 0.56, 0.42, 0.44, 0],         // inner edge, coming back shallower
              ["Q", 0.56, -0.42, -0.30, -0.87], ["Z"]];
    } },

  // A SCALLOPED TRAILING EDGE is what says feather rather than blade. The vane is wider too — the
  // ported outline was 0.62 across and read as the same lens as flame and leaf. The shaft stays a
  // CUT so it reads as a quill rather than a painted line.
  { name: "feather", segs: function () {
      // UPRIGHT, so the diagonal belongs to `leaf` and nothing else. The barbs are on one side only:
      // a feather scalloped on both edges has no front, which is what made `wing` read as a fish.
      return [["M", 0.04, -0.95],
              ["Q", 0.46, -0.62, 0.36, -0.40],    // three barbs down the trailing edge
              ["Q", 0.58, -0.20, 0.40, 0.04],
              ["Q", 0.60, 0.22, 0.30, 0.44],
              ["Q", 0.14, 0.64, -0.06, 0.70],
              ["Q", -0.16, 0.96, -0.24, 0.66],    // the quill tip
              ["Q", -0.44, 0.04, 0.04, -0.95], ["Z"]]
        .concat(glyphPolySegs([[-0.02, -0.82], [-0.12, 0.72], [-0.03, 0.74], [0.07, -0.80]]));  // shaft, cut
    } },

  // A PUDDLE AND WHAT CAME OFF IT. The ported splash was a row of arches on one baseline, which
  // reads as grass — a splash is one mass plus SEPARATE droplets, and disjoint subpaths stay
  // separate under even-odd (only overlap cancels), so this is four loops and no arithmetic.
  { name: "splash", segs: function () {
      // AN IRREGULAR SPLAT. The first attempt was an oval with three circles over it, which is a
      // FACE — two eyes and a mouth, unmistakably, and impossible to unsee once noticed. Symmetry
      // was the whole problem: a splat is a blob whose lobes are all different lengths, so the radii
      // here are deliberately uneven and no two opposite each other match.
      // ROUNDED LOBES, NOT POINTS. Alternating long and short radii joined by straight lines is
      // the definition of a STAR, which is what the previous attempt drew and what `gemstar` and
      // `starburst` already are. Smoothing the same radii — anchors at the midpoints, the radial
      // points as Q controls — turns the identical data into a splat, and the unevenness that made
      // a lumpy star makes a convincing blob.
      const R = [0.95, 0.55, 0.78, 0.42, 0.92, 0.50, 0.66, 0.58];
      const n = R.length, P = [];
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n - Math.PI / 2;
        P.push([Math.cos(a) * R[i] * 0.94, Math.sin(a) * R[i] * 0.94]);
      }
      const mid = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      const m0 = mid(P[n - 1], P[0]);
      const out = [["M", m0[0], m0[1]]];
      for (let i = 0; i < n; i++) {
        const m = mid(P[i], P[(i + 1) % n]);
        out.push(["Q", P[i][0], P[i][1], m[0], m[1]]);
      }
      // ...and one drop that has left the mass, placed where the blob is shortest so it cannot
      // overlap it — overlap would cancel under even-odd (§11.3) and bite a hole in the splat.
      return out.concat([["Z"]]).concat(glyphCircleSegs(0.60, 0.60, 0.13));
    } },

  // A HOOK, NOT A CONE. The ported spike was a narrow symmetric triangle, which is `triangle` and
  // `arrowhead` already — and a straight cone is the one silhouette this roster has too many of.
  // Curving it and widening the base makes it a THORN, which is a different object.
  { name: "spike", segs: function () {
      // A ROW, NOT A CONE. One spike is `triangle` and `arrowhead` over again — and in a game the
      // word means a floor trap, which is several. Three teeth on a bar reads at 16px and collides
      // with nothing.
      return glyphPolySegs([[-0.96, 0.86], [-0.64, -0.72], [-0.32, 0.86],
                       [-0.32, 0.86], [0, -0.86], [0.32, 0.86],
                       [0.32, 0.86], [0.64, -0.72], [0.96, 0.86]]);
    } },

  // A PENNANT. The ported ribbon was a long zigzag band that read as a lightning bolt or a scribble
  // at any size that fits an inventory slot. A bookmark ribbon is one outline with a V cut out of
  // the bottom, which survives to 16px — and it is what "ribbon" means in a UI, where the thing
  // being marked is a menu entry rather than a present.
  { name: "ribbon", segs: function () {
      return glyphPolySegs([[-0.46, -0.92], [0.46, -0.92], [0.46, 0.94], [0, 0.42], [-0.46, 0.94]]);
    } },

  // A LEADING EDGE AND THREE PRIMARIES. The ported wing was scalloped on both sides, so it had no
  // front and read as a fish. A wing is asymmetric: one smooth swept edge, one feathered.
  { name: "wing", segs: function () {
      // LONG AND LOW. The first attempt was as tall as it was wide and came out a fan; a wing is a
      // swept shape whose whole read is the ASPECT — one smooth leading edge, three primaries
      // trailing, and far more span than depth.
      // THE NOTCHES HAVE TO BE DEEP. Shallow scallops read as a rippled edge, which is a leaf lying
      // down — and that is what the last two attempts drew. Real primaries separate: the notch cuts
      // most of the way back toward the leading edge, so the eye sees FINGERS rather than a wobble.
      return [["M", -0.95, 0.34],
              ["Q", -0.68, -0.62, 0.14, -0.74],   // leading edge, shoulder to tip
              ["Q", 0.72, -0.82, 0.96, -0.44],
              ["L", 0.50, -0.18], ["L", 0.80, -0.04],   // primary 1
              ["L", 0.30, 0.14], ["L", 0.56, 0.30],     // primary 2
              ["L", 0.06, 0.44],                        // primary 3
              ["Q", -0.48, 0.54, -0.95, 0.34], ["Z"]];
    } },

  { name: "hexagon", segs: function () {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + Math.PI / 6;
        pts.push([i ? "L" : "M", Math.cos(a) * 0.97, Math.sin(a) * 0.97]);
      }
      return pts.concat([["Z"]]);
    } },
  { name: "gemstar", slots: { points: 5, inner: 40 },
    controls: [["points", "Points", 3, 9], ["inner", "Inner", 10, 80]],
    segs: function (rp) {
      const n = rp.points, ri = rp.inner / 100, out = [];
      for (let i = 0; i < n * 2; i++) {
        const a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? ri : 0.97;
        out.push([i ? "L" : "M", Math.cos(a) * r, Math.sin(a) * r]);
      }
      return out.concat([["Z"]]);
    } },
  { name: "bigheart", segs: function () {
      return [["M", 0, 0.81],
              ["C", -0.88, 0.13, -0.88, -0.56, -0.41, -0.56],
              ["C", -0.13, -0.56, 0, -0.34, 0, -0.34],
              ["C", 0, -0.34, 0.13, -0.56, 0.41, -0.56],
              ["C", 0.88, -0.56, 0.88, 0.13, 0, 0.81], ["Z"]];
    } },
];

// ---- LATER ADDITIONS (2026-08-14) ---------------------------------------------------------------
//
// PUSHED AFTER THE PORTED ROSTER, and that is not a style choice. `ELEMENT_NAMES` is the `element`
// enum and enums are stored as INDICES in presets and share links (§7), so a name inserted anywhere
// but the END re-points every link written before it. Appending is the only safe direction.
//
// WHAT THESE ARE: the gaps a real roster review turned up, not a target number. Two kinds, and the
// split is §11.6's own line rather than a new one.
//
//   COMMODITY MARKS — `trash`, `search`, `info`, `warn`, `speech`. §11.6 blesses these explicitly:
//   nobody has an opinion about the silhouette of a magnifier, they converged industry-wide, and a
//   UI kit without them sends people hunting for exactly the thing this app exists to stop them
//   hunting for. They carry `system: true` so the sheet files them with the other marks.
//
//   CONVERGENT GAME SHAPES — `bolt`, `bag`, `chest`, `helm`, `bow`, `wand`. Not commodity in the
//   close-button sense, but each has one silhouette everybody draws, and each fills a hole the
//   review found: the roster had `sword`, `axe` and `hammer` but no RANGED weapon and no MAGIC one;
//   `coin` and `gemcut` but nothing to put them IN; a `crown` but no armour.
//
// WHAT IS DELIBERATELY ABSENT: crossed swords, a mute speaker and a refresh arrow, all wanted and
// all blocked by the same thing — they are defined by strokes that CROSS, and the path op fills
// even-odd (§11.3), so a crossing cancels and punches a hole at the intersection. Each needs its
// true outline solved rather than its pieces drawn, which is a different afternoon.
// REWIND AND FAST-FORWARD — two triangles, the trailing one's apex sunk into the leading one's base
// (maintainer's, 2026-09-11: *"a rewind and fastforward icon for the system category"*).
//
// TRACED AS ONE OUTLINE, BECAUSE THE OBVIOUS DRAWING CANCELS. Two overlapping triangles as two
// subpaths is §11.3 exactly: even-odd empties the overlap and the pair comes back as two triangles
// with a diamond of daylight between them. Butted apex-to-base instead they meet at a POINT, and a
// point is not a join — the `clover` finding. So the union is walked once: along the trailing
// triangle's top edge to the shared base, up the leading one's back, round its tip and back.
// `OV` is how far the trailing apex sinks in, and it is what makes a solid waist at 16px.
//
// ONE FUNCTION, TWO DEFS, rather than one def with a direction control. `play`, `pause` and `stop`
// are separate marks, freedesktop names the two separately (`media-seek-forward` /
// `media-seek-backward`), and a searcher types the word, not a control value. Rewind is the SAME
// points mirrored, so the two cannot drift apart. Worst neighbour `diamond` at 0.60 — `play` and
// `boost` were the ones worth checking and neither is close.
function glyphSeekSegs(back) {
  const H = 0.78, W = 0.94, OV = 0.14;
  const yAt = H * (1 - W / (W + OV));            // the trailing top edge where it meets x = 0
  let P = [[-W, -H], [0, -yAt], [0, -H], [W, 0], [0, H], [0, yAt], [-W, H]];
  if (back) P = P.map(function (p) { return [-p[0], p[1]]; });
  return glyphPolySegs(P);
}

const GLYPH_LATE = [
  // A bin: body, lid, handle, and two slots CUT through the body. The three solids are stacked
  // edge-to-edge rather than overlapped — abutting is safe, overlapping would cancel.
  { name: "trash", system: true, segs: function () {
      return glyphPolySegs([[-0.56, -0.34], [0.56, -0.34], [0.44, 0.90], [-0.44, 0.90]])
        .concat(glyphBoxSegs(-0.72, -0.56, 1.44, 0.22))
        .concat(glyphBoxSegs(-0.22, -0.78, 0.44, 0.22))
        .concat(glyphBoxSegs(-0.22, -0.10, 0.12, 0.66))
        .concat(glyphBoxSegs(0.10, -0.10, 0.12, 0.66));
    } },

  // A magnifier. The handle starts EXACTLY on the ring's outer edge at 45 degrees: a hair further
  // out leaves a gap, a hair further in crosses the annulus and cancels a notch out of it.
  { name: "search", system: true, segs: function () {
      const cx = -0.18, cy = -0.24, ro = 0.58, k = Math.SQRT1_2;
      return glyphCircleSegs(cx, cy, ro)
        .concat(glyphCircleSegs(cx, cy, 0.34))
        .concat(glyphBarSegs(cx + ro * k, cy + ro * k, 0.80, 0.74, 0.15));
    } },

  // The letter is a HOLE, which is the whole reason these read at 16px: a drawn glyph would need a
  // stroke weight the icon treatment is already deciding, and the two would fight.
  { name: "info", system: true, segs: function () {
      return glyphCircleSegs(0, 0, 0.94)
        .concat(glyphCircleSegs(0, -0.44, 0.14))
        .concat(glyphBoxSegs(-0.14, -0.18, 0.28, 0.64));
    } },

  { name: "warn", system: true, segs: function () {
      return glyphPolySegs([[0, -0.94], [0.97, 0.82], [-0.97, 0.82]])
        .concat(glyphBoxSegs(-0.12, -0.34, 0.24, 0.62))
        .concat(glyphCircleSegs(0, 0.56, 0.14));
    } },

  // One outline, tail included — a bubble plus a separate triangle would leave a seam at the join
  // and cancel where they overlapped.
  { name: "speech", system: true, segs: function () {
      return [["M", -0.68, -0.82], ["L", 0.68, -0.82], ["Q", 0.92, -0.82, 0.92, -0.58],
              ["L", 0.92, 0.10], ["Q", 0.92, 0.34, 0.68, 0.34],
              ["L", -0.02, 0.34], ["L", -0.40, 0.94], ["L", -0.44, 0.34],
              ["L", -0.68, 0.34], ["Q", -0.92, 0.34, -0.92, 0.10],
              ["L", -0.92, -0.58], ["Q", -0.92, -0.82, -0.68, -0.82], ["Z"]];
    } },

  // Energy, stamina, speed, mana — the most-reached-for icon the roster did not have.
  { name: "bolt", segs: function () {
      return glyphPolySegs([[0.30, -0.96], [-0.56, 0.10], [-0.06, 0.10],
                       [-0.30, 0.96], [0.56, -0.14], [0.06, -0.14]]);
    } },

  // A pouch with a handle. The handle is an arc band whose ends land on the body's top edge, so the
  // two abut without overlapping.
  { name: "bag", segs: function () {
      return [["M", -0.46, -0.30], ["Q", -0.88, 0.12, -0.74, 0.56],
              ["Q", -0.58, 0.94, 0, 0.94], ["Q", 0.58, 0.94, 0.74, 0.56],
              ["Q", 0.88, 0.12, 0.46, -0.30], ["Z"]]
        .concat(glyphArcBand(0, -0.30, 0.26, 0.44, Math.PI, Math.PI * 2));
    } },

  // Body, domed lid, and two cuts: the lid seam and the latch. The cuts do not touch each other —
  // two overlapping cuts cancel back to SOLID, which is the even-odd trap in its second form.
  { name: "chest", segs: function () {
      return glyphBoxSegs(-0.90, -0.02, 1.80, 0.86)
        .concat([["M", -0.90, -0.02], ["Q", -0.90, -0.88, 0, -0.88],
                 ["Q", 0.90, -0.88, 0.90, -0.02], ["Z"]])
        .concat(glyphBoxSegs(-0.90, 0.02, 1.80, 0.10))
        .concat(glyphBoxSegs(-0.13, 0.18, 0.26, 0.32));
    } },

  // A great helm. The T-shaped notch at the bottom is part of the OUTLINE rather than a cut, so the
  // silhouette itself reads as a helmet; the visor slit is the only hole.
  { name: "helm", segs: function () {
      // THE NOTCH WAS DOING TOO MUCH. A wide, deep opening at the bottom leaves two legs and an
      // arch, which is a GATE — and that is what the first version read as. Narrowing it keeps the
      // mass of the helmet, and the breath holes below the visor are what settle the reading: an
      // archway does not have them.
      return [["M", -0.72, 0.88], ["L", -0.72, -0.16], ["Q", -0.72, -0.92, 0, -0.92],
              ["Q", 0.72, -0.92, 0.72, -0.16], ["L", 0.72, 0.88], ["L", 0.24, 0.88],
              ["L", 0.24, 0.58], ["L", -0.24, 0.58], ["L", -0.24, 0.88], ["Z"]]
        .concat(glyphBoxSegs(-0.52, -0.32, 1.04, 0.20))        // visor slit, cut
        .concat(glyphBoxSegs(-0.34, 0.06, 0.11, 0.32))         // breath holes, cut
        .concat(glyphBoxSegs(-0.055, 0.06, 0.11, 0.32))
        .concat(glyphBoxSegs(0.23, 0.06, 0.11, 0.32));
    } },

  // The ranged weapon the roster was missing. The string stops just short of the limb tips: run it
  // the full span and it crosses them, and a bow with two notches bitten out of its tips is worse
  // than one with a hairline gap nobody sees at 16px.
  { name: "bow", segs: function () {
      // THICKER THAN IT LOOKS IT SHOULD BE. At 54px the first version read as a bow; at 30px the
      // limb had thinned to a hairline and the whole thing collapsed into a filled D. An icon is
      // authored at the size it SHIPS (§8.3), and a curve that survives a 2x preview is not
      // evidence about the 1x export.
      return [["M", 0.16, -0.90], ["Q", -0.94, -0.44, -0.94, 0], ["Q", -0.94, 0.44, 0.16, 0.90],
              ["L", 0.16, 0.68], ["Q", -0.52, 0.32, -0.52, 0], ["Q", -0.52, -0.32, 0.16, -0.68],
              ["Z"]]
        .concat(glyphBarSegs(0.16, -0.82, 0.16, 0.82, 0.05));
    } },

  // ...and the magic one. The sparkle is deliberately NOT touching the shaft — a star and a bar that
  // overlap cancel where they meet, and a gap here reads as light coming off the tip anyway.
  { name: "wand", segs: function () {
      const cx = 0.52, cy = -0.52, rO = 0.44, rI = 0.13, p = [];
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, r = i % 2 ? rI : rO;
        p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return glyphBarSegs(-0.80, 0.84, 0.10, -0.06, 0.11).concat(glyphPolySegs(p));
    } },

  // ---- a second pass (2026-08-14) ---------------------------------------------------------------
  // THE EQUIPMENT SLOTS ARE A SET, AND A SET IS ALL-OR-NOTHING. An inventory screen draws one ghost
  // icon per slot; with head, shield and three weapons but no body, hands, feet, neck or finger,
  // none of them is usable — you cannot ship half a paper-doll. That is a better reason to add six
  // icons than "six more icons", and it is the shape of gap worth looking for: not what is missing
  // from a list, but what is missing from a JOB.
  { name: "armour", segs: function () {
      return [["M", -0.28, -0.84], ["L", -0.70, -0.60],
              ["Q", -0.92, -0.36, -0.84, 0.04], ["L", -0.60, 0.20],
              ["Q", -0.56, 0.64, -0.38, 0.90], ["L", 0.38, 0.90],
              ["Q", 0.56, 0.64, 0.60, 0.20], ["L", 0.84, 0.04],
              ["Q", 0.92, -0.36, 0.70, -0.60], ["L", 0.28, -0.84],
              ["Q", 0, -0.56, -0.28, -0.84], ["Z"]]
        .concat(glyphBoxSegs(-0.05, -0.44, 0.10, 1.26));          // centre seam, cut
    } },

  { name: "boot", segs: function () {
      return glyphPolySegs([[-0.44, -0.90], [0.12, -0.90], [0.16, 0.18], [0.74, 0.32],
                       [0.92, 0.46], [0.92, 0.90], [-0.44, 0.90]])
        .concat(glyphBoxSegs(-0.44, 0.60, 1.36, 0.12));           // sole, cut
    } },

  // A GAUNTLET, NOT A FIVE-FINGER GLOVE. Four fingers at 30px is four grey pixels; the mitten
  // silhouette plus a thumb is what actually survives, and it is what every inventory draws.
  { name: "glove", segs: function () {
      return [["M", -0.46, 0.88], ["L", -0.46, -0.20],
              ["Q", -0.46, -0.88, 0.04, -0.88], ["Q", 0.44, -0.88, 0.46, -0.32],
              ["L", 0.46, -0.06], ["Q", 0.88, -0.10, 0.88, 0.22],
              ["Q", 0.88, 0.44, 0.56, 0.46], ["L", 0.46, 0.46], ["L", 0.46, 0.88], ["Z"]]
        .concat(glyphBoxSegs(-0.46, 0.56, 0.92, 0.14));           // cuff, cut
    } },

  // Band and stone. The stone's base sits EXACTLY on the band's outer edge — through it and the
  // annulus cancels a bite out of the ring (§11.3), short of it and the stone floats.
  { name: "ring", segs: function () {
      return glyphCircleSegs(0, 0.24, 0.60)
        .concat(glyphCircleSegs(0, 0.24, 0.36))
        .concat(glyphPolySegs([[0, -0.94], [0.32, -0.66], [0, -0.36], [-0.32, -0.66]]));
    } },

  // The cord is ONE V-shaped band rather than two bars meeting: two bars would overlap at the
  // junction and cancel a diamond out of the very point they join.
  { name: "amulet", segs: function () {
      return glyphPolySegs([[-0.74, -0.92], [-0.62, -0.86], [0, -0.24],
                       [0.62, -0.86], [0.74, -0.92], [0, -0.10]])
        .concat(glyphCircleSegs(0, 0.34, 0.44));
    } },

  // ---- crafting and the world -------------------------------------------------------------------
  { name: "anvil", segs: function () {
      return [["M", -0.94, -0.16], ["Q", -0.80, -0.42, -0.50, -0.44], ["L", 0.78, -0.44],
              ["L", 0.78, -0.02], ["L", 0.26, -0.02], ["L", 0.30, 0.40], ["L", 0.70, 0.60],
              ["L", 0.70, 0.92], ["L", -0.70, 0.92], ["L", -0.70, 0.60], ["L", -0.30, 0.40],
              ["L", -0.26, -0.02], ["L", -0.62, -0.02], ["Q", -0.88, -0.02, -0.94, -0.16],
              ["Z"]];
    } },

  { name: "ingot", segs: function () {
      return glyphPolySegs([[-0.40, -0.62], [0.40, -0.62], [0.56, -0.16], [-0.56, -0.16]])
        .concat(glyphPolySegs([[-0.66, -0.10], [0.66, -0.10], [0.88, 0.44], [-0.88, 0.44]]));
    } },

  // The growth rings are two NESTED cuts: the outer one holes the end, the inner one fills it back
  // in. Even-odd counting the same way it bites is also the way it draws a ring.
  { name: "log", segs: function () {
      return [["M", -0.58, -0.46], ["L", 0.62, -0.46], ["Q", 0.92, -0.46, 0.92, 0],
              ["Q", 0.92, 0.46, 0.62, 0.46], ["L", -0.58, 0.46],
              ["Q", -0.90, 0.46, -0.90, 0], ["Q", -0.90, -0.46, -0.58, -0.46], ["Z"]]
        .concat(glyphOvalSegs(-0.58, 0, 0.22, 0.44))
        .concat(glyphOvalSegs(-0.58, 0, 0.09, 0.18));
    } },

  { name: "meat", segs: function () {
      // DRAWN FROM THE MAINTAINER'S MOCKUP. Three things it does that the previous version did not,
      // and the third is the one that matters:
      //
      //   THE MEAT DOMINATES — roughly two thirds of the area, and a fat WEDGE rather than a disc,
      //   widest at the top-right and tapering toward the joint. A circle reads as a balloon
      //   whatever is attached to it.
      //   THE BONE IS THIN and ends in a knuckle, on the diagonal.
      //   THERE IS A HOLE where the two meet. That is what makes it a bone emerging FROM meat
      //   rather than a mass on a stick — the eye needs to see daylight past the joint, and no
      //   amount of outline does the job that one piece of negative space does.
      //
      // The hole is a separate closed loop and cancels under even-odd (§11.3) — the same idiom the
      // `log` rings and the `info` letter use, put to work on a silhouette rather than a detail.
      // BUILT OUTWARD FROM THE NECK, which is the joint and the only part whose exact size matters.
      // Every earlier attempt drew the meat and the bone and hoped the junction would work itself
      // out; it never did, because the two masses simply merged and the result read as one blob
      // with a lump. Fixing the neck at 0.22 and expanding in both directions from it is what
      // finally put daylight between them.
      return [["M", -0.30, 0.11],                     // the neck, upper lip
              ["Q", -0.16, -0.30, 0.10, -0.62],       // concave out of the neck, up into the meat
              ["Q", 0.44, -1.00, 0.86, -0.66],        // the meat: broad across the top-right
              ["Q", 1.06, -0.30, 0.94, 0.10],
              ["Q", 0.80, 0.56, 0.36, 0.62],
              ["Q", 0.02, 0.66, -0.14, 0.44],         // underside, concave back down to the neck
              ["L", -0.30, 0.29],                     // the neck, lower lip
              // THE SHAFT HAS TO BE THINNER THAN THE KNUCKLE, or the bone is just a second blob and
              // the whole thing reads as a gourd — which is what it did while the two were the same
              // width. The lobes stand PROUD of the stick, perpendicular to it; that contrast is
              // what makes a bone a bone.
              ["L", -0.72, 0.40],                     // shaft, lower edge
              ["Q", -0.76, 0.62, -0.90, 0.62],        // knuckle, lower lobe
              ["Q", -1.02, 0.60, -1.00, 0.44],
              ["Q", -0.98, 0.32, -0.84, 0.33],        // the notch between the lobes
              ["Q", -0.98, 0.26, -0.98, 0.14],        // knuckle, upper lobe
              ["Q", -0.98, 0.00, -0.84, 0.02],
              ["Q", -0.72, 0.04, -0.74, 0.20],
              ["L", -0.30, 0.11], ["Z"]];             // shaft, upper edge back to the neck
    } },

  { name: "map", segs: function () {
      return glyphPolySegs([[-0.92, -0.52], [-0.32, -0.74], [0.32, -0.52], [0.92, -0.74],
                       [0.92, 0.56], [0.32, 0.78], [-0.32, 0.56], [-0.92, 0.78]])
        .concat(glyphBoxSegs(-0.35, -0.48, 0.06, 1.10))           // folds, cut
        .concat(glyphBoxSegs(0.29, -0.44, 0.06, 1.06));
    } },

  // A BAND WITH THE NEEDLE INSIDE IT, not a disc with the needle cut out. Inside the ring's hole the
  // needle is the only thing covering those pixels, so it counts ODD and fills — a solid needle in a
  // hollow ring, which is the compass everybody draws.
  { name: "compass", segs: function () {
      return glyphCircleSegs(0, 0, 0.94)
        .concat(glyphCircleSegs(0, 0, 0.74))
        .concat(glyphPolySegs([[0, -0.60], [0.22, 0.08], [0, 0.60], [-0.22, 0.08]]));
    } },

  { name: "flag", segs: function () {
      return glyphBarSegs(-0.62, -0.92, -0.62, 0.92, 0.08)
        .concat(glyphPolySegs([[-0.54, -0.86], [0.88, -0.50], [-0.54, -0.14]]));
    } },

  // ---- a third pass (2026-08-14) ----------------------------------------------------------------
  // Four more system marks and seven world/dungeon shapes. Two of the marks are here because the
  // second pass added `map` and left it stranded: a map with no PIN and no COMPASS is half a
  // navigation set, the same all-or-nothing argument the equipment slots made.
  { name: "pin", system: true, segs: function () {
      return [["M", 0, 0.96], ["Q", -0.72, 0.10, -0.72, -0.24], ["Q", -0.72, -0.94, 0, -0.94],
              ["Q", 0.72, -0.94, 0.72, -0.24], ["Q", 0.72, 0.10, 0, 0.96], ["Z"]]
        .concat(glyphCircleSegs(0, -0.28, 0.26));                 // the hole
    } },

  // Four corner brackets, generated by sign-flipping ONE corner. Mirroring reverses a polygon's
  // winding and even-odd does not care, which is the one place that rule is a convenience.
  { name: "expand", system: true, segs: function () {
      const c = [[-0.92, -0.92], [-0.22, -0.92], [-0.22, -0.66],
                 [-0.66, -0.66], [-0.66, -0.22], [-0.92, -0.22]];
      let out = [];
      [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (s) {
        out = out.concat(glyphPolySegs(c.map(function (p) { return [p[0] * s[0], p[1] * s[1]]; })));
      });
      return out;
    } },

  { name: "layers", system: true, segs: function () {
      // TALL ENOUGH TO BE PLATES. At a half-height of 0.18 against a half-width of 0.86 each diamond
      // is three pixels deep at ship size and tapers to one at the points, so the set read as three
      // slider tracks. Stacked plates need visible THICKNESS more than they need width.
      let out = [];
      [-0.54, 0, 0.54].forEach(function (cy) {
        out = out.concat(glyphPolySegs([[0, cy - 0.26], [0.72, cy], [0, cy + 0.26], [-0.72, cy]]));
      });
      return out;
    } },

  // THE HANDS ARE ONE L-SHAPED POLYGON, not two bars. Two bars from the centre overlap AT the centre
  // and cancel a square out of the middle of the clock — the same trap crossed swords fell into,
  // and the same fix: draw the outline the pieces would have made. Inside the ring's hole it counts
  // odd, so it fills solid (the `compass` trick, §11.12).
  { name: "clock", system: true, segs: function () {
      return glyphCircleSegs(0, 0, 0.94)
        .concat(glyphCircleSegs(0, 0, 0.74))
        .concat(glyphPolySegs([[-0.07, -0.60], [0.07, -0.60], [0.07, -0.07],
                          [0.52, -0.07], [0.52, 0.07], [-0.07, 0.07]]));
    } },

  { name: "tree", segs: function () {
      return [["M", 0, -0.94], ["Q", 0.74, -0.80, 0.72, -0.30], ["Q", 0.86, 0.06, 0.40, 0.16],
              ["L", -0.40, 0.16], ["Q", -0.86, 0.06, -0.72, -0.30], ["Q", -0.74, -0.80, 0, -0.94],
              ["Z"]]
        .concat(glyphBoxSegs(-0.16, 0.16, 0.32, 0.78));           // trunk, abutting the canopy
    } },

  // The hoops are cuts kept NARROWER than the stave line they cross, because a cut that runs past
  // the barrel's edge leaves the overhang filled — a tab sticking out of each side.
  { name: "barrel", segs: function () {
      return [["M", -0.52, -0.84], ["Q", -0.86, 0, -0.52, 0.84], ["L", 0.52, 0.84],
              ["Q", 0.86, 0, 0.52, -0.84], ["Z"]]
        .concat(glyphBoxSegs(-0.70, -0.44, 1.40, 0.13))
        .concat(glyphBoxSegs(-0.70, 0.30, 1.40, 0.13));
    } },

  { name: "spear", segs: function () {
      return [["M", 0, -0.96], ["Q", 0.34, -0.62, 0.30, -0.26], ["Q", 0.16, -0.10, 0, -0.10],
              ["Q", -0.16, -0.10, -0.30, -0.26], ["Q", -0.34, -0.62, 0, -0.96], ["Z"]]
        .concat(glyphBoxSegs(-0.09, -0.10, 0.18, 1.06));
    } },

  { name: "portal", segs: function () {
      return [["M", -0.72, 0.92], ["L", -0.72, -0.18], ["Q", -0.72, -0.92, 0, -0.92],
              ["Q", 0.72, -0.92, 0.72, -0.18], ["L", 0.72, 0.92], ["Z"]]
        .concat([["M", -0.42, 0.92], ["L", -0.42, -0.16], ["Q", -0.42, -0.62, 0, -0.62],
                 ["Q", 0.42, -0.62, 0.42, -0.16], ["L", 0.42, 0.92], ["Z"]]);
    } },

  { name: "torch", segs: function () {
      return [["M", 0, -0.94], ["Q", 0.30, -0.62, 0.26, -0.34], ["Q", 0.22, -0.10, 0, -0.06],
              ["Q", -0.22, -0.10, -0.26, -0.34], ["Q", -0.30, -0.62, 0, -0.94], ["Z"]]
        .concat(glyphPolySegs([[-0.30, -0.06], [0.30, -0.06], [0.21, 0.12], [-0.21, 0.12]]))  // cup
        .concat(glyphBoxSegs(-0.13, 0.12, 0.26, 0.84));                                       // handle
    } },

  // The neck stops EXACTLY on the body's top, at 0.36 - 0.56. A pixel further down and the two
  // overlap, and the overlap cancels a notch straight through the bottle's shoulder.
  { name: "potion", segs: function () {
      return glyphCircleSegs(0, 0.36, 0.56)
        .concat(glyphBoxSegs(-0.18, -0.44, 0.36, 0.24))           // neck
        .concat(glyphBoxSegs(-0.26, -0.72, 0.52, 0.28))           // cork
        .concat(glyphBoxSegs(-0.50, 0.16, 1.00, 0.10));           // liquid line, cut
    } },

  { name: "fish", segs: function () {
      return [["M", -0.30, 0], ["Q", 0.10, -0.62, 0.62, -0.34], ["Q", 0.92, -0.14, 0.92, 0],
              ["Q", 0.92, 0.14, 0.62, 0.34], ["Q", 0.10, 0.62, -0.30, 0], ["Z"]]
        .concat(glyphPolySegs([[-0.30, 0], [-0.90, -0.48], [-0.72, 0], [-0.90, 0.48]]))  // tail
        .concat(glyphCircleSegs(0.50, -0.12, 0.10));                                     // eye, cut
    } },

  // ---- a fourth pass (2026-08-14) ---------------------------------------------------------------

  // A ROSETTE OF TANGENT LOBES, generalised out of `clover`'s fix (§11.14). Lobes touch rather than
  // overlap — overlap cancels — and the outline hands off at each tangent point, which is what makes
  // the CENTRE interior instead of a hole. Tangency needs r = d*sin(pi/n); anything else either
  // gaps or cancels, so the caller gives the ring radius and the lobe radius follows.
  //
  // The arc for each lobe runs between its two tangent points THE LONG WAY, out past the lobe's own
  // outward direction. Picking the short way traces the inside of the flower and fills nothing.
  //
  // Not retro-fitted to `clover`: that one is hand-tuned around its stem spur, and a shared helper
  // that has to carry one caller's special case is two functions wearing a trenchcoat.
  { name: "flower", segs: function () {
      const n = 6, d = 0.60, r = d * Math.sin(Math.PI / n), SEG = 10;
      const C = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / n;
        C.push([Math.cos(a) * d, Math.sin(a) * d]);
      }
      const pts = [];
      for (let i = 0; i < n; i++) {
        const prev = C[(i + n - 1) % n], next = C[(i + 1) % n], c = C[i];
        const aIn = Math.atan2(prev[1] - c[1], prev[0] - c[0]);
        const aOut = Math.atan2(next[1] - c[1], next[0] - c[0]);
        const aMid = Math.atan2(c[1], c[0]);                 // the lobe's outward direction
        // Sweep from aIn to aOut the way that passes aMid.
        let sweep = aOut - aIn;
        while (sweep <= 0) sweep += Math.PI * 2;
        const norm = function (x) { let v = x - aIn; while (v < 0) v += Math.PI * 2; return v; };
        if (norm(aMid) > sweep) sweep -= Math.PI * 2;
        for (let k = 0; k <= SEG; k++) {
          const a = aIn + sweep * k / SEG;
          pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
        }
      }
      return glyphPolySegs(pts)
        .concat(glyphCircleSegs(0, 0, 0.22))                       // the eye, cut — this is what keeps
                                                              // it clear of `clover`, which is solid
        .concat(glyphBarSegs(0.02, 0.62, 0.10, 0.99, 0.05));
    } },

  // THREE ARMS, NOT A LINE. `spiral` is one thin curl and `tornado` is a funnel; a vortex is
  // rotational SYMMETRY, which neither has. Each arm is a curved wedge, tapered to nothing at the
  // hub so the three can meet there without overlapping — overlapping arms would cancel and punch
  // a hole through the middle of the swirl.
  { name: "vortex", segs: function () {
      // ONE OUTLINE THROUGH THE HUB. Three separate arms left the middle empty — they tapered to
      // nothing and never met, so it read as three loose blades rather than a swirl. Chaining them
      // into a single loop closes the hub by construction, which is the same fix `clover` needed
      // and for the same reason: separate pieces that only ALMOST touch enclose nothing.
      const qp = function (p0, c, p1, n) {
        const o = [];
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          o.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
                  u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
        }
        return o;
      };
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3;
        const arm = [[0.09, 0.07]]
          .concat(qp([0.09, 0.07], [0.52, 0.20], [0.92, -0.18], 7))
          .concat([[0.84, -0.46]])
          .concat(qp([0.84, -0.46], [0.42, -0.16], [0.09, -0.07], 7));
        arm.forEach(function (v) { const r = glyphRotPt(v[0], v[1], a); pts.push(r); });
      }
      return glyphPolySegs(pts);
    } },

  // THREE TANGENT BALLS. Tangency is right here for the reason it was wrong in `clover`: a snowman
  // IS pinched at the joins, and stacked circles enclose no interior gap the way a ring of four
  // does. Overlapping them would cancel a lens out of each waist.
  { name: "snowman", segs: function () {
      // TANGENT WAS NOT ENOUGH. Three touching circles are mathematically joined and visually are
      // not: a tangent point is under a pixel wide, so at ship size the snowman came apart into
      // three separate balls. Drawn as ONE pinched outline instead — the waists are narrow but they
      // are several pixels of actual ink, which is the difference between joined and adjacent.
      return [["M", 0, -0.88],
              ["Q", 0.24, -0.88, 0.24, -0.66], ["Q", 0.24, -0.46, 0.13, -0.42],   // head, right
              ["Q", 0.31, -0.39, 0.32, -0.16], ["Q", 0.33, 0.09, 0.17, 0.16],     // middle, right
              ["Q", 0.41, 0.20, 0.41, 0.54], ["Q", 0.41, 0.92, 0, 0.92],          // base, right
              ["Q", -0.41, 0.92, -0.41, 0.54], ["Q", -0.41, 0.20, -0.17, 0.16],   // base, left
              ["Q", -0.33, 0.09, -0.32, -0.16], ["Q", -0.31, -0.39, -0.13, -0.42],// middle, left
              ["Q", -0.24, -0.46, -0.24, -0.66], ["Q", -0.24, -0.88, 0, -0.88], ["Z"]]
        .concat(glyphCircleSegs(-0.09, -0.70, 0.05))               // eyes, cut
        .concat(glyphCircleSegs(0.09, -0.70, 0.05))
        .concat(glyphCircleSegs(0, -0.16, 0.06))                   // buttons, cut
        .concat(glyphCircleSegs(0, 0.50, 0.07));
    } },

  // LATITUDES, NOT A HIGHLIGHT. A disc with one offset dot is `coin`, and a disc with a corner
  // gleam is `bubble`; two curved bands across it are what say the thing is round in three
  // dimensions. They do not touch each other, so nothing cancels.
  { name: "sphere", segs: function () {
      // A WIREFRAME, NOT A BALL — and the collision sweep (§8.12) is why. The first version was a
      // filled disc with two thin bands cut across it, which scored 0.86 against `info`: a disc
      // with a small cut in it is a disc, whatever the cut says. Hollowing it out changes the
      // silhouette rather than decorating it, which is the only thing that separates icons at size.
      //
      // Four nested loops, and even-odd does the counting: ring, hollow, ellipse band, hollow. The
      // ellipse stays clear of the ring's inner edge so nothing touches and nothing cancels.
      return glyphCircleSegs(0, 0, 0.94)
        .concat(glyphCircleSegs(0, 0, 0.74))
        .concat(glyphOvalSegs(0, 0, 0.60, 0.27))
        .concat(glyphOvalSegs(0, 0, 0.46, 0.13));
    } },

  // A GUARD CROSSES ITS OWN BLADE, so both blades here are ONE outline that goes out along the
  // quillon and back — the same discipline crossed swords still need (§11.12). Drawn as polygons
  // because a blade is straight lines and a curve would only soften what should be sharp.
  { name: "dagger", segs: function () {
      // WIDER AND SHORTER THAN THE FIRST TRY, which came out a needle. A dagger is read against a
      // sword by PROPORTION — a short broad blade over a big guard — so both of those had to move.
      // REBALANCED 2026-08-27: "the hilt shorter and the blade longer". It was 50:50 blade-to-hilt
      // against the sword's 67:33 and that is exactly what looked wrong. 71:29 now, and the length
      // came from SHORTENING THE HILT rather than only extending the blade — `glyphRotFitSegs` refits to
      // the box, so pulling the pommel in lengthens the blade for free and does it without pushing
      // the tip past where the guard can still read.
      //
      // AND BROADENING THE BLADE WAS THE WRONG LEVER, measured rather than assumed. The first
      // attempt widened it to 0.25 to keep the dagger distinct and moved it TOWARD the greatsword
      // (0.554 -> 0.667), which is the neighbour it shares a broad blade with. What is free is the
      // SMALL GUARD: the sword is a narrow blade in a wide guard and the greatsword a broad blade
      // in a wider one, so nothing else in the roster is a blade in a SHORT guard.
      return glyphRotFitSegs(glyphPolySegs([[0, -0.95], [0.20, -0.34], [0.20, 0.06], [0.34, 0.06], [0.34, 0.21],
                       [0.13, 0.21], [0.115, 0.40], [0.20, 0.44], [0.20, 0.62], [-0.20, 0.62],
                       [-0.20, 0.44], [-0.115, 0.40], [-0.13, 0.21], [-0.34, 0.21], [-0.34, 0.06],
                       [-0.20, 0.06], [-0.20, -0.34]]), GLYPH_BLADE_TILT, GLYPH_BLADE_SLIM);
    } },

  // ...and the same shape at greatsword proportions: a blade twice as wide with a fuller cut down
  // it, and a quillon that reaches past the grip. `sword` is a thin line by comparison, which is
  // the whole distinction — the collision sweep (§8.12) is what will hold me to it.
  { name: "greatsword", segs: function () {
      return glyphRotFitSegs(glyphPolySegs([[0, -0.98], [0.23, -0.58], [0.23, 0.12], [0.64, 0.12], [0.64, 0.29],
                       [0.17, 0.29], [0.17, 0.72], [0.27, 0.76], [0.27, 0.97], [-0.27, 0.97],
                       [-0.27, 0.76], [-0.17, 0.72], [-0.17, 0.29], [-0.64, 0.29], [-0.64, 0.12],
                       [-0.23, 0.12], [-0.23, -0.58]])
        .concat(glyphBoxSegs(-0.055, -0.50, 0.11, 0.52)),          // the fuller, cut
        GLYPH_BLADE_TILT, GLYPH_BLADE_SLIM);
    } },

  // ---- a fifth pass (2026-08-14) ----------------------------------------------------------------

  // CROSSED SWORDS, FINALLY. Ruled out twice (§11.12) because two crossing bars cancel where they
  // meet and punch a hole through the join. `clock` found the general answer — draw the outline the
  // pieces WOULD have made — and there is a second one, used here because two rotated blades have
  // no tidy combined outline: DOUBLE-CANCEL. Lay a patch over exactly the intersection and the
  // count there goes 2 -> 3, which is odd, which fills. The patch must be EXACT: too small leaves a
  // notch, too large cancels a new hole around the edge of it.
  //
  // For two perpendicular bars of half-width w crossing at the origin, the intersection is a square
  // with corners at w*(±n1 ±n2) — computed, not eyeballed, which is the only way it can be exact.
  //
  // The guards are pushed down the hilt far enough that only the BLADES overlap; two guards crossing
  // as well would need a second patch and there is no reason to earn one.
  { name: "swords", segs: function () {
      const W = 0.075;
      // One sword in its own frame: s runs tip to pommel, d across. Mapped onto each axis below.
      const BLADE = [[1.00, 0], [0.75, W], [-0.34, W], [-0.34, 0.18], [-0.46, 0.18],
                     [-0.46, 0.05], [-0.72, 0.05], [-0.72, 0.13], [-0.90, 0.13],
                     [-0.90, -0.13], [-0.72, -0.13], [-0.72, -0.05], [-0.46, -0.05],
                     [-0.46, -0.18], [-0.34, -0.18], [-0.34, -W], [0.75, -W]];
      const K = Math.SQRT1_2;
      const AX = [[[K, -K], [K, K]], [[-K, -K], [K, -K]]];   // [unit along, unit across] per sword
      let out = [];
      AX.forEach(function (f) {
        const u = f[0], n = f[1];
        out = out.concat(glyphPolySegs(BLADE.map(function (p) {
          return [p[0] * u[0] + p[1] * n[0], p[0] * u[1] + p[1] * n[1]];
        })));
      });
      // The patch: w*(n1+n2) and w*(n1-n2) are the diagonals of the overlap square.
      const n1 = AX[0][1], n2 = AX[1][1];
      return out.concat(glyphPolySegs([
        [W * (n1[0] + n2[0]), W * (n1[1] + n2[1])],
        [W * (n1[0] - n2[0]), W * (n1[1] - n2[1])],
        [-W * (n1[0] + n2[0]), -W * (n1[1] + n2[1])],
        [-W * (n1[0] - n2[0]), -W * (n1[1] - n2[1])],
      ]));
    } },

  // AN OVOID, NOT A LENS. The ported `egg` was pointed at BOTH ends — two mirrored C curves meeting
  // at cusps — which is a seed or a leaf and never an egg. An egg is round at the base and merely
  // NARROWER at the top, so the fix is that the top has to stay curved.
  { name: "egg", segs: function () {
      // The FIRST control point is what keeps the apex round: pulled sideways from the top rather
      // than down the flank, so the tangent there is horizontal. Angled inward it makes a cusp,
      // which is how the port ended up pointed at both ends.
      return [["M", 0, -0.95],
              ["C", 0.32, -0.95, 0.62, -0.40, 0.64, 0.18],
              ["C", 0.66, 0.68, 0.38, 0.95, 0, 0.95],
              ["C", -0.38, 0.95, -0.66, 0.68, -0.64, 0.18],
              ["C", -0.62, -0.40, -0.32, -0.95, 0, -0.95], ["Z"]];
    } },

  // A CAPSULE ON THE DIAGONAL, with the seam across it. Diagonal because upright it is a rounded
  // rectangle and the roster has several of those; the seam is what makes it a pill rather than a
  // lozenge, and it is a cut so it cannot be mistaken for a join.
  { name: "pill", segs: function () {
      const K = Math.SQRT1_2, u = [K, -K], n = [K, K], w = 0.30, L = 0.60, C = 0.30;
      const to = function (s, d) { return [s * u[0] + d * n[0], s * u[1] + d * n[1]]; };
      const P = function (s, d) { const p = to(s, d); return [p[0], p[1]]; };
      const a = P(-L, -w), b = P(L, -w), c1 = P(L + C, -w), c2 = P(L + C, 0), c3 = P(L + C, w);
      const d1 = P(L, w), e = P(-L, w), f1 = P(-L - C, w), f2 = P(-L - C, 0), f3 = P(-L - C, -w);
      return [["M", a[0], a[1]], ["L", b[0], b[1]],
              ["Q", c1[0], c1[1], c2[0], c2[1]], ["Q", c3[0], c3[1], d1[0], d1[1]],
              ["L", e[0], e[1]],
              ["Q", f1[0], f1[1], f2[0], f2[1]], ["Q", f3[0], f3[1], a[0], a[1]], ["Z"]]
        .concat(glyphPolySegs([P(-0.05, -w), P(0.05, -w), P(0.05, w), P(-0.05, w)]));   // the seam, cut
    } },

  // A RING, A CROWN AND A STEM. `clock` is a bare ring; the crown on top is the whole difference,
  // and it abuts the ring's outer edge exactly rather than overlapping it — a pixel further in and
  // it would cancel a bite out of the case.
  { name: "stopwatch", segs: function () {
      const cy = 0.12, R = 0.78;
      return glyphCircleSegs(0, cy, R)
        .concat(glyphCircleSegs(0, cy, 0.60))
        .concat(glyphBoxSegs(-0.15, -0.94, 0.30, R * 0 + (cy - R) + 0.94))   // crown, up to the case
        .concat(glyphPolySegs([[-0.06, -0.40], [0.06, -0.40], [0.06, 0.06],
                          [0.40, 0.06], [0.40, 0.18], [-0.06, 0.18]])); // hands, one L (§11.13)
    } },

  // A TEST TUBE. `flask` is a cone and `potion` is a round bottle; the third shape a game needs is
  // the THIN one, and thin is the entire read — narrow parallel sides, round bottom, a lip.
  { name: "vial", segs: function () {
      // WIDER THAN "THIN" SUGGESTS. At a 0.34 body the rounded bottom is three pixels of curve at
      // ship size and reads as a POINT — the tube came out a pen. Thin is relative to `flask` and
      // `potion`, not absolute, and the curve needs enough width to still be a curve.
      return [["M", -0.25, -0.56], ["L", 0.25, -0.56], ["L", 0.25, 0.56],
              ["Q", 0.25, 0.93, 0, 0.93], ["Q", -0.25, 0.93, -0.25, 0.56], ["Z"]]
        .concat(glyphBoxSegs(-0.34, -0.74, 0.68, 0.18))     // lip
        .concat(glyphBoxSegs(-0.19, -0.95, 0.38, 0.21))     // stopper
        // BUBBLES, NOT A FILL LINE. The line was the body's FULL width, so it did not mark a level,
        // it severed the tube — which is why this read as a pen with a nib. A cut that spans a
        // shape edge to edge cuts it in two; `potion` gets away with the same idea only because its
        // round body is wider than the cut and leaves a sliver either side.
        // Two, not three: at ship size the third was a single pixel and read as dirt.
        .concat(glyphCircleSegs(-0.08, 0.48, 0.095))
        .concat(glyphCircleSegs(0.09, 0.71, 0.07));
    } },

  // AN OPEN-ENDED SPANNER, one outline: up the handle, out around the jaw, back down the mouth and
  // out the other side. The mouth is part of the OUTLINE rather than a cut, because a cut that
  // reaches the edge is a notch by luck and this one has to be exact.
  { name: "wrench", segs: function () {
      // THE SLOT MUST BE DEEPER THAN IT IS WIDE, and that is a fact about the HEAD, not the notch.
      // The first two attempts made the head wider ACROSS the handle than it was long ALONG it, so
      // the head was a crossbar and the mouth a nick in its far edge — which reads as a claw hammer.
      // Prongs only read as prongs when they are longer than the gap between them.
      const u = [0.64, -0.77], n = [0.77, 0.64];
      const P = function (s, d) { return [s * u[0] + d * n[0], s * u[1] + d * n[1]]; };
      return glyphPolySegs([
        P(-0.92, 0.11), P(0.12, 0.11), P(0.12, 0.38), P(0.92, 0.38), P(0.92, 0.16),
        P(0.42, 0.16), P(0.42, -0.16), P(0.92, -0.16), P(0.92, -0.38), P(0.12, -0.38),
        P(0.12, -0.11), P(-0.92, -0.11),
      ]);
    } },

  // ── ORDNANCE AND TERRAIN ──────────────────────────────────────────────────────────────────────
  // `sun` and `wave` were asked for and already ship — `sun` as drawn, and `wave` as a sine ribbon,
  // which is why `tidalwave` below is a separate shape rather than a duplicate: a swell and a
  // BREAKER are different silhouettes even though both are "a wave".

  // A PISTOL, and the L is the whole icon: barrel out, grip down, trigger guard between them. One
  // outline — a guard drawn as a separate ring would overlap the frame and cancel (§11.3).
  // RENAMED FROM `gun` (maintainer's, 2026-08-17: "that looks like an SMG. Which is fine, we can
  // relabel it that way"). IN PLACE, so the index is untouched and every share link that named it
  // still resolves to this same drawing under its better name — a rename is safe when the slot and
  // the picture both stay put.
  //
  // WHAT WOULD NOT BE SAFE is reusing the freed word, which is why the new sidearm below is
  // `pistol` and not `gun`. §7's objection to renaming is never the rename itself; it is that a
  // stored string quietly starts meaning a different drawing. Grepped first: nothing anywhere held
  // the string.
  { name: "smg", segs: function () {
      // TWO THINGS WERE WRONG AND THE SECOND ONE IS A DECISION ABOUT SIZE.
      //
      // THE GRIP RAKED THE WRONG WAY — "the handle looks a little awkward" (maintainer's,
      // 2026-08-17). Its rear edge ran from (-0.90, 0.04) DOWN-RIGHT to (-0.66, 0.96), so the heel
      // sat FORWARD of the top, which no pistol has; and with the frame's rear also at -0.90 the
      // two were one wedge, fat at the top and tapering to a point — a doorstop with a hole in it.
      // The frame's rear moves in to -0.64 so there is somewhere to rake INTO, the slide overhangs
      // it at the back (which is what a slide does), and both grip edges now travel LEFT on the way
      // down, the heel wider than the top.
      //
      // AND THE TRIGGER GUARD IS AN OPEN HOOK, NOT AN ENCLOSED RING. The old note here said a guard
      // "is defined by the gap inside it" — true of a guard, and unaffordable on this grid. The
      // icon ships at 30px, so ONE UNIT IS 15px: a legible ring needs a 4px hole plus two ~2px
      // bars, which is 8 of the 15 available with the front strap and the grip still to fit either
      // side. Three attempts measured 1px of material, and each one broke open on the right and
      // shed a detached two-pixel crumb below it — read off the MASK, not by eye.
      //
      // So the front strap runs down, turns back along the bottom, and stops. The trigger sits in
      // the opening between it and the grip. It costs the closed loop and buys a guard you can see,
      // which is the same trade `splash` refused and got hidden for.
      return glyphPolySegs([
        [-0.92, -0.74], [0.94, -0.74], [0.94, -0.36], [0.24, -0.36],    // slide, muzzle right
        [0.24, 0.34], [0.02, 0.34], [0.02, 0.02],                       // guard, an open hook
        [-0.26, 0.02], [-0.46, 0.96], [-0.90, 0.96], [-0.64, 0.02],     // grip, raked BACK
        [-0.64, -0.36], [-0.92, -0.36],                                 // frame rear under the slide
      ]);
    } },

  // A CARTRIDGE — ogive nose, straight case, rimmed base. Standing UPRIGHT and slim on purpose:
  // `pill` is the same family of form but lies on the diagonal, and the collision sweep measures
  // aspect, so orientation is doing real work here rather than being a style choice.
  { name: "bullet", segs: function () {
      // A LONG NOSE ON A NARROW CASE IS A SKITTLE. Widened and the ogive cut to a third of the
      // height; the base is now wide enough to read as a separate head rather than a foot.
      return [["M", -0.30, -0.30], ["Q", -0.30, -0.80, 0, -0.94], ["Q", 0.30, -0.80, 0.30, -0.30],
              ["L", 0.30, 0.44], ["L", 0.42, 0.44], ["L", 0.42, 0.90], ["L", -0.42, 0.90],
              ["L", -0.42, 0.44], ["L", -0.30, 0.44], ["Z"]]
        // The cannelure, as two NOTCHES rather than one groove. A groove across the case would span
        // it edge to edge and cut the round in half — the mistake `vial` shipped with.
        .concat(glyphBoxSegs(-0.30, 0.22, 0.12, 0.13))
        .concat(glyphBoxSegs(0.18, 0.22, 0.12, 0.13));
    } },

  // A GRENADE, and it has to beat `bomb` in the sweep — both are "round thing with something on
  // top". It does so on the SILHOUETTE: straight sides and a flat shouldered cap, versus bomb's
  // full circle and curling fuse, plus the lever standing off one side.
  { name: "grenade", segs: function () {
      return [["M", -0.46, 0.02], ["Q", -0.46, -0.36, -0.30, -0.44],
              ["L", -0.30, -0.62], ["L", -0.13, -0.62], ["L", -0.13, -0.86],
              ["L", 0.13, -0.86], ["L", 0.13, -0.62], ["L", 0.30, -0.62], ["L", 0.30, -0.44],
              ["Q", 0.46, -0.36, 0.46, 0.02],
              ["Q", 0.46, 0.92, 0, 0.92], ["Q", -0.46, 0.92, -0.46, 0.02], ["Z"]]
        .concat(glyphPolySegs([[0.30, -0.80], [0.62, -0.80], [0.62, -0.06], [0.44, -0.06], [0.44, -0.64], [0.30, -0.64]]))
        .concat(glyphCircleSegs(0, -0.73, 0.105));   // the pin ring, a cut — 0.075 was under a pixel
    } },

  // A SHOTGUN SHELL. Deliberately SHORT AND FAT where `bullet` is tall and slim, with a crimped
  // top instead of a nose and a brass base a third of its height. Two rounds in one roster only
  // work if they disagree about proportion; detail alone would not have separated them.
  { name: "shell", segs: function () {
      // THE RIM IS A STEP IN THE OUTLINE, NOT A LINE ACROSS. The first version drew it as a cut the
      // full width of the base, which severed the brass from the hull — the `vial` mistake, made
      // again three icons later, which is why it is now stated as a rule and not a note.
      // Three widths stacked (hull, brass, rim) say "shotgun shell" on silhouette alone.
      // ONE BIG STEP, NOT THREE SMALL ONES. Hull, brass and rim as three widths put two 1px ledges
      // at ship size and the whole thing read as a plinth — a tombstone. A shotgun shell is TWO
      // materials, so it gets two widths and the step between them is worth three pixels a side.
      return glyphPolySegs([
        [-0.34, -0.74], [-0.20, -0.88], [0.20, -0.88], [0.34, -0.74],   // crimp, chamfered
        [0.34, 0.10], [0.58, 0.10], [0.58, 0.90], [-0.58, 0.90], [-0.58, 0.10], [-0.34, 0.10],
      ]);
      // No notch in the crimp either: with a step already in the outline, a castellated top read
      // as a chess rook. The chamfer alone carries it.
    } },

  // A VOLCANO — a truncated cone with a crater bitten out of the top and a plume above it. The
  // plume is a SEPARATE subpath sitting clear of the cone, which is what stops it from cancelling
  // and also what makes it read as smoke rather than a peak.
  { name: "volcano", segs: function () {
      // A ONE-LOBE PLUME IS A BALL. It came out as a cone with a dot floating over it — the plume
      // has to BILLOW to read as smoke, so it is three lobes, and it sits close enough to the
      // crater to belong to it without overlapping (an overlap would cancel, §11.3).
      return glyphPolySegs([
        [-0.94, 0.88], [-0.36, -0.24], [-0.13, -0.24], [-0.05, -0.08],
        [0.05, -0.08], [0.13, -0.24], [0.36, -0.24], [0.94, 0.88],
      ])
        .concat([["M", -0.14, -0.32], ["Q", -0.38, -0.38, -0.34, -0.54],
                 ["Q", -0.30, -0.70, -0.11, -0.66],
                 ["Q", -0.05, -0.86, 0.14, -0.82], ["Q", 0.34, -0.80, 0.34, -0.62],
                 ["Q", 0.50, -0.56, 0.42, -0.42], ["Q", 0.34, -0.30, 0.16, -0.36],
                 ["Q", 0.01, -0.28, -0.14, -0.32], ["Z"]]);
      // The plume sits one pixel clear of the crater rim. Any closer and it merges into the cone;
      // any further and it is weather. Ejecta specks were tried and read as dirt, like `vial`'s
      // third bubble.
    } },

  // A BREAKER. The curl is the read — a crest that overhangs its own base — so the barrel is a
  // HOLE in the wave rather than empty space beside it, which is the only way the overhang survives
  // at 30px. `wave` is the sine ribbon; this is the one that is about to land on you.
  { name: "tidalwave", segs: function () {
      return [["M", -0.94, 0.78], ["Q", -0.94, -0.20, -0.30, -0.62],
              ["Q", 0.30, -0.98, 0.86, -0.72], ["Q", 0.96, -0.66, 0.94, -0.52],
              ["Q", 0.60, -0.72, 0.26, -0.52], ["Q", 0.72, -0.44, 0.80, 0.02],
              ["Q", 0.88, 0.52, 0.60, 0.78], ["Z"]]
        // The barrel. It sits wholly inside the crest, so it cannot reach an edge and split it.
        .concat([["M", 0.20, -0.20], ["Q", 0.56, -0.10, 0.52, 0.26],
                 ["Q", 0.48, 0.56, 0.16, 0.56], ["Q", 0.34, 0.16, 0.20, -0.20], ["Z"]]);
    } },

  // A FISSURE. It BRANCHES, and that is the whole separation from `bolt`: a zigzag with no forks is
  // lightning whichever way it is turned. Three limbs off one trunk, tapering downward, so the
  // widest part is at the surface.
  { name: "crack", segs: function () {
      // THICKNESS IS THE WHOLE PROBLEM. At the first widths every spur was one pixel at ship size
      // and the icon read as a bare tree. Traversed as ONE loop — down the left side of the trunk
      // taking the left spur as a detour, back up the right taking the other two — because separate
      // bars for the branches would cross the trunk and cancel, which is how `clover` broke.
      // SPUR ANGLE MATTERS AS MUCH AS THICKNESS. At near-horizontal the three limbs radiated and
      // the icon read as a splat; a fissure runs mostly ALONG one direction and its branches peel
      // away shallowly. Both spurs now head downward, roughly with the trunk.
      return glyphPolySegs([
        [-0.10, -0.94],
        [-0.20, -0.36],
        [-0.36, -0.24], [-0.70, 0.50], [-0.46, 0.30], [-0.08, -0.10],   // left spur, tapered
        [-0.12, 0.34],
        [-0.06, 0.94], [0.14, 0.94], [0.06, 0.30],
        [0.26, 0.40], [0.56, 0.94], [0.44, 0.52], [0.14, 0.06],         // right spur
        [0.20, -0.34],
        [0.12, -0.94],
      ]);
    } },

  // A RANGE, not a triangle. TWO peaks of unequal height with a valley between them, plus a snowcap
  // that is a cut following the summit — a single triangle scores against `triangle` and `shard`
  // and deserves to, because it IS one.
  { name: "mountain", segs: function () {
      return glyphPolySegs([
        [-0.96, 0.72], [-0.34, -0.66], [-0.06, -0.10], [0.16, -0.44],
        [0.34, -0.16], [0.44, -0.30], [0.96, 0.72],
      ])
        .concat(glyphPolySegs([[-0.34, -0.66], [-0.13, -0.20], [-0.24, -0.14],
                          [-0.34, -0.30], [-0.44, -0.14], [-0.55, -0.20]]));   // snowcap, a cut
    } },

  // ── HARDWARE, SIGNAGE AND A BAND ──────────────────────────────────────────────────────────────
  // THREE OF THESE COULD NOT TAKE THE OBVIOUS NAME. `bow` is the archery weapon, `ribbon` is the
  // banner overlay and `reticle` is the bracketed focus frame — so the hair bow is `hairbow` and
  // the plain scope is `crosshair`. §7 forbids renaming any of the three to free the word up.

  // A BRIMMED HAT. NO BAND: a band across the crown spans it edge to edge and would cut the crown
  // off the brim (the `vial` rule). The fedora DENT does the same job of saying "hat not mushroom",
  // and it lives in the outline where nothing can sever anything.
  { name: "hat", segs: function () {
      // A ROUND CROWN ON A SHORT BRIM IS A MUSHROOM, which is what the first attempt was. The hat
      // is in the RATIO: a crown with straight sides, and a brim wide enough and thin enough to
      // read as a separate flat disc the crown is standing on.
      return [["M", -0.40, 0.16],
              ["L", -0.40, -0.40], ["Q", -0.40, -0.68, -0.14, -0.68],
              ["L", 0.14, -0.68], ["Q", 0.40, -0.68, 0.40, -0.40],
              ["L", 0.40, 0.16],
              ["L", 0.92, 0.22], ["Q", 0.99, 0.42, 0.66, 0.50],
              ["Q", 0, 0.60, -0.66, 0.50], ["Q", -0.99, 0.42, -0.92, 0.22], ["Z"]];
    } },

  // A HANGING INN SIGN. The letters are CUT from the board, which is the same machinery the 54
  // input glyphs use — §13 forbids TEXT in an export, not letterforms drawn as outlines, and these
  // are outlines. Board, straps and hanging bar all ABUT rather than overlap (§11.3).
  { name: "inn", segs: function () {
      return glyphBoxSegs(-0.92, -0.48, 1.84, 0.96)
        .concat(glyphBoxSegs(-0.52, -0.86, 0.16, 0.38))
        .concat(glyphBoxSegs(0.36, -0.86, 0.16, 0.38))
        .concat(glyphBoxSegs(-0.86, -0.98, 1.72, 0.12))
        .concat(glyphWordSegs("INN", 0.74));
    } },

  // A HAIR BOW, as ONE outline: out around the left loop, down the left tail, up the right tail,
  // round the right loop. A knot drawn as its own blob over the middle would overlap both loops and
  // cancel a hole exactly where the bow is tied — so the knot is the WAIST instead, and it is kept
  // wide enough to survive at ship size rather than pinching to nothing.
  { name: "hairbow", segs: function () {
      return [["M", 0, -0.14],
              ["Q", -0.34, -0.68, -0.72, -0.56], ["Q", -0.98, -0.46, -0.90, -0.20],
              ["Q", -0.84, 0.04, -0.50, 0.08], ["Q", -0.30, 0.10, -0.14, 0.04],
              ["L", -0.44, 0.94], ["L", -0.18, 0.86], ["L", -0.05, 0.30],
              ["L", 0.05, 0.30], ["L", 0.18, 0.86], ["L", 0.44, 0.94], ["L", 0.14, 0.04],
              ["Q", 0.30, 0.10, 0.50, 0.08], ["Q", 0.84, 0.04, 0.90, -0.20],
              ["Q", 0.98, -0.46, 0.72, -0.56], ["Q", 0.34, -0.68, 0, -0.14], ["Z"]];
    } },

  // A GAMEPAD — body with two grips, a d-pad and two face buttons, all cuts well inside the shell.
  { name: "controller", segs: function () {
      return [["M", -0.94, -0.14], ["Q", -0.94, -0.46, -0.62, -0.46], ["L", 0.62, -0.46],
              ["Q", 0.94, -0.46, 0.94, -0.14], ["Q", 0.94, 0.28, 0.70, 0.44],
              ["Q", 0.50, 0.56, 0.40, 0.32], ["Q", 0.28, 0.08, 0, 0.08],
              ["Q", -0.28, 0.08, -0.40, 0.32], ["Q", -0.50, 0.56, -0.70, 0.44],
              ["Q", -0.94, 0.28, -0.94, -0.14], ["Z"]]
        .concat(glyphPolySegs([[-0.56, -0.24], [-0.40, -0.24], [-0.40, -0.08], [-0.24, -0.08],
                          [-0.24, 0.08], [-0.40, 0.08], [-0.40, 0.24], [-0.56, 0.24],
                          [-0.56, 0.08], [-0.72, 0.08], [-0.72, -0.08], [-0.56, -0.08]]))
        .concat(glyphCircleSegs(0.38, 0.04, 0.11))
        .concat(glyphCircleSegs(0.66, -0.18, 0.11));
    } },

  // A MOUSE, AND THE CABLE IS NOT DECORATION. Body alone it is an oval, and §8.12's lesson from
  // `sphere` is that an oval with a small cut in it is an oval — it would have landed on `egg`.
  // The lead breaks the silhouette out of the blob class, which no amount of interior detail does.
  { name: "mouse", segs: function () {
      return [["M", 0, -0.68], ["Q", 0.50, -0.68, 0.50, -0.06],
              ["Q", 0.50, 0.86, 0, 0.86], ["Q", -0.50, 0.86, -0.50, -0.06],
              ["Q", -0.50, -0.68, 0, -0.68], ["Z"]]
        .concat(glyphBoxSegs(-0.05, -0.70, 0.10, 0.28))    // the button split, a notch from the top edge
        .concat(glyphBoxSegs(-0.07, -0.34, 0.14, 0.22))    // the wheel, clear of the split
        .concat(glyphBoxSegs(-0.05, -0.98, 0.10, 0.32));   // the lead
    } },

  // A KEYBOARD. It is read as a GRID rather than as a shape, so the keys are few and large — a
  // realistic count would be one pixel per key at ship size, which is texture, not keys.
  { name: "keyboard", segs: function () {
      let out = glyphBoxSegs(-0.94, -0.44, 1.88, 0.88);
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 6; i++) {
          out = out.concat(glyphBoxSegs(-0.80 + i * 0.27, -0.30 + r * 0.26, 0.19, 0.17));
        }
      }
      return out.concat(glyphBoxSegs(-0.44, 0.22, 0.88, 0.14));   // spacebar
    } },

  // A CRT SET. The aerials are part of the BODY OUTLINE, not two rods laid on top — laid on top
  // they would overlap the case and cancel two notches out of it. The screen is a wide oval, which
  // is the single most CRT thing about a CRT.
  { name: "crt", segs: function () {
      return glyphPolySegs([
        [-0.86, -0.30], [-0.20, -0.30], [-0.68, -0.90], [-0.54, -0.98], [-0.06, -0.34],
        [0.06, -0.34], [0.54, -0.98], [0.68, -0.90], [0.20, -0.30], [0.86, -0.30],
        [0.86, 0.62], [0.72, 0.62], [0.72, 0.82], [0.46, 0.82], [0.46, 0.62],
        [-0.46, 0.62], [-0.46, 0.82], [-0.72, 0.82], [-0.72, 0.62], [-0.86, 0.62],
      ])
        .concat(glyphOvalSegs(-0.20, 0.16, 0.50, 0.32))
        .concat(glyphCircleSegs(0.58, 0.00, 0.10))
        .concat(glyphCircleSegs(0.58, 0.30, 0.10));
    } },

  // A FLATSCREEN — bezel, neck and foot in one outline, screen as a single cut. Deliberately the
  // OPPOSITE proportions to `crt`: wide and thin against tall and boxy, which is the whole reason
  // both can be in the roster.
  { name: "flatscreen", segs: function () {
      return glyphPolySegs([
        [-0.94, -0.72], [0.94, -0.72], [0.94, 0.32], [0.13, 0.32], [0.13, 0.62],
        [0.46, 0.62], [0.46, 0.82], [-0.46, 0.82], [-0.46, 0.62], [-0.13, 0.62],
        [-0.13, 0.32], [-0.94, 0.32],
      ]).concat(glyphBoxSegs(-0.80, -0.58, 1.60, 0.76));
    } },

  // THE SAVE ICON, which is a floppy disk whatever anyone calls it. The slot in the shutter is
  // DOUBLE-CANCEL (§11.15): the shutter is a hole in the body, and the slot is a third subpath
  // inside the hole, so its winding count reaches three and it fills solid again.
  { name: "save", segs: function () {
      return glyphPolySegs([[-0.88, -0.88], [0.58, -0.88], [0.88, -0.58], [0.88, 0.88], [-0.88, 0.88]])
        .concat(glyphBoxSegs(-0.34, -0.74, 0.76, 0.56))    // shutter, a hole
        .concat(glyphBoxSegs(-0.20, -0.68, 0.16, 0.38))    // its slot, solid again
        .concat(glyphBoxSegs(-0.54, 0.10, 1.08, 0.64));    // label, a hole
    } },

  // A PLAIN SCOPE CROSSHAIR. `reticle` is the bracketed focus frame; this is the ring with arms.
  // The arms NEVER cross the ring — outside it they are ordinary ink, and inside it they land in
  // the annulus's hole where their winding count reaches three and they fill (§11.15 again).
  // Drawn any other way the four intersections punch holes and the whole thing falls apart.
  { name: "crosshair", segs: function () {
      let out = glyphCircleSegs(0, 0, 0.70).concat(glyphCircleSegs(0, 0, 0.50));
      for (let i = 0; i < 4; i++) {
        const dx = i === 0 ? 1 : i === 2 ? -1 : 0, dy = i === 1 ? 1 : i === 3 ? -1 : 0;
        const put = function (r0, r1, t) {
          return glyphPolySegs([
            [dx * r0 - dy * t, dy * r0 + dx * t], [dx * r1 - dy * t, dy * r1 + dx * t],
            [dx * r1 + dy * t, dy * r1 - dx * t], [dx * r0 + dy * t, dy * r0 - dx * t],
          ]);
        };
        out = out.concat(put(0.72, 0.98, 0.07)).concat(put(0.16, 0.44, 0.05));
      }
      return out;
    } },

  // A GUITAR. The body is ONE curve with a real waist — two bouts drawn as overlapping circles is
  // the classic §11.3 trap and would clear a lens-shaped hole right through the middle. Neck and
  // headstock ABUT the body and each other exactly.
  { name: "guitar", segs: function () {
      // THE WAIST HAS TO BE WORTH PIXELS. At 0.30 against a 0.40 upper bout the pinch was two
      // pixels and the body read as a gourd. Three widths that actually differ — 0.60 / 0.26 / 0.44
      // — are what make it a guitar rather than a bulb on a stick.
      return [["M", 0, 0.94],
              ["Q", -0.50, 0.94, -0.58, 0.58], ["Q", -0.64, 0.32, -0.26, 0.24],
              ["Q", -0.48, 0.14, -0.44, -0.06], ["Q", -0.40, -0.30, -0.12, -0.32],
              ["L", 0.12, -0.32],
              ["Q", 0.40, -0.30, 0.44, -0.06], ["Q", 0.48, 0.14, 0.26, 0.24],
              ["Q", 0.64, 0.32, 0.58, 0.58], ["Q", 0.50, 0.94, 0, 0.94], ["Z"]]
        .concat(glyphBoxSegs(-0.09, -0.80, 0.18, 0.48))    // neck
        .concat(glyphBoxSegs(-0.17, -0.96, 0.34, 0.16))    // headstock
        .concat(glyphCircleSegs(0, 0.44, 0.17));           // soundhole
    } },

  // A DRUM WITH STICKS, and the sticks make a V rather than a cross. Crossed is the iconic pose and
  // is now buildable (§11.15), but the patch that works for two straight blades is not the same
  // parallelogram for two TAPERED sticks, and a V reads as sticks perfectly well.
  { name: "drums", segs: function () {
      return [["M", -0.56, 0.02], ["Q", -0.56, -0.26, 0, -0.26], ["Q", 0.56, -0.26, 0.56, 0.02],
              ["L", 0.56, 0.56], ["Q", 0.56, 0.88, 0, 0.88], ["Q", -0.56, 0.88, -0.56, 0.56], ["Z"]]
        .concat(glyphOvalSegs(0, 0.02, 0.40, 0.16))        // the head, a cut
        .concat(glyphPolySegs([[-0.88, -0.94], [-0.76, -0.98], [-0.18, -0.28], [-0.30, -0.24]]))
        .concat(glyphPolySegs([[0.88, -0.94], [0.76, -0.98], [0.18, -0.28], [0.30, -0.24]]));
    } },

  // ── CLOTHING, FOOD AND DRINK ──────────────────────────────────────────────────────────────────
  // FOUR MORE NAMES WERE ALREADY SPOKEN FOR: `bag` is the satchel, `candy` the wrapped sweet,
  // `feather` the plume and `ingot` the bar of metal. So: `moneybag`, `candybar`, `quill` — and
  // each of those three has to beat its namesake in the §8.12 sweep, not merely avoid the word.

  // A TEE. `armour` is the other torso in the roster and the split is the SLEEVES: a breastplate is
  // a tapering slab, a shirt is a T. The collar is a dip in the outline, never a cut across it.
  { name: "shirt", segs: function () {
      return glyphPolySegs([
        [-0.46, -0.58], [-0.22, -0.64], [-0.12, -0.42], [0.12, -0.42], [0.22, -0.64], [0.46, -0.58],
        [0.94, -0.18], [0.78, 0.18], [0.54, 0.06], [0.54, 0.88],
        [-0.54, 0.88], [-0.54, 0.06], [-0.78, 0.18], [-0.94, -0.18],
      ]);
    } },

  // TROUSERS. The crotch notch runs nearly the full height, because two legs joined by a short slit
  // read as a tunic — the legs have to be longer than the body they hang off.
  { name: "pants", segs: function () {
      return glyphPolySegs([
        [-0.56, -0.90], [0.56, -0.90], [0.58, 0.92], [0.20, 0.92],
        [0.02, 0.16], [-0.20, 0.92], [-0.58, 0.92],
      ])
        .concat(glyphBoxSegs(-0.05, -0.90, 0.10, 0.26));   // the fly, a notch from the waist
    } },

  // A CINCHED SACK. `bag` is a rigid satchel with a handle ARC over a flat top; this is soft — it
  // pinches at the neck and ruffles above it, and the ruffle is what a handle can never be.
  { name: "moneybag", segs: function () {
      // FIRST DRAW SCORED 0.875 AGAINST `drop` and would have failed the sweep. A sack that narrows
      // smoothly to a small tie IS a teardrop, whatever the tie is made of. The fix is the same one
      // `sphere` needed: change the SILHOUETTE, not the detail — the ruffle now FLARES wider than
      // the neck by three times, so the outline goes wide-pinch-wide instead of point-to-round.
      return [["M", -0.20, -0.34],
              ["L", -0.64, -0.74], ["L", -0.26, -0.60], ["L", 0, -0.86], ["L", 0.26, -0.60],
              ["L", 0.64, -0.74], ["L", 0.20, -0.34],
              ["Q", 0.40, -0.28, 0.52, -0.12],
              ["Q", 0.88, 0.12, 0.82, 0.48], ["Q", 0.76, 0.92, 0, 0.92],
              ["Q", -0.76, 0.92, -0.82, 0.48], ["Q", -0.88, 0.12, -0.52, -0.12],
              ["Q", -0.40, -0.28, -0.20, -0.34], ["Z"]];
    } },

  // AN APPLE, and the STEM IS IN THE OUTLINE. Laid on as its own bar it either overlaps the dimple
  // and cancels a notch, or clears it by half a pixel and floats — the two ways a stem can go wrong
  // and both invisible until ship size. Up the stem, out the leaf, back down, then round the fruit.
  { name: "apple", segs: function () {
      return [["M", -0.04, -0.42],
              ["L", -0.05, -0.80], ["L", 0.05, -0.80],
              ["Q", 0.30, -1.02, 0.60, -0.76], ["Q", 0.38, -0.44, 0.05, -0.54],
              ["L", 0.04, -0.42],
              ["Q", 0.16, -0.66, 0.44, -0.62], ["Q", 0.88, -0.54, 0.88, 0.12],
              ["Q", 0.88, 0.90, 0.30, 0.90], ["Q", 0.10, 0.90, 0, 0.82],
              ["Q", -0.10, 0.90, -0.30, 0.90], ["Q", -0.88, 0.90, -0.88, 0.12],
              ["Q", -0.88, -0.54, -0.44, -0.62], ["Q", -0.16, -0.66, -0.04, -0.42], ["Z"]];
    } },

  // A CELL. The charge bars stop well short of the casing on both sides — at full width they would
  // slice the battery into four floating blocks, which is the `vial` rule in its plainest form.
  { name: "battery", segs: function () {
      return glyphPolySegs([
        [-0.52, -0.72], [-0.20, -0.72], [-0.20, -0.92], [0.20, -0.92], [0.20, -0.72],
        [0.52, -0.72], [0.52, 0.90], [-0.52, 0.90],
      ])
        .concat(glyphBoxSegs(-0.34, -0.48, 0.68, 0.16))
        .concat(glyphBoxSegs(-0.34, -0.16, 0.68, 0.16))
        .concat(glyphBoxSegs(-0.34, 0.16, 0.68, 0.16));
    } },

  // A TALL BOTTLE. Three bottles in the roster now and they are separated by PROPORTION, not by
  // decoration: `potion` is round, `vial` is a short tube with a lip, this one is a long neck on a
  // straight body. No label band — it would span the body edge to edge.
  { name: "bottle", segs: function () {
      return [["M", -0.16, -0.94], ["L", 0.16, -0.94], ["L", 0.16, -0.76], ["L", 0.11, -0.76],
              ["L", 0.11, -0.40], ["Q", 0.11, -0.24, 0.28, -0.12], ["Q", 0.42, -0.02, 0.42, 0.24],
              ["L", 0.42, 0.70], ["Q", 0.42, 0.90, 0.22, 0.90],
              ["L", -0.22, 0.90], ["Q", -0.42, 0.90, -0.42, 0.70],
              ["L", -0.42, 0.24], ["Q", -0.42, -0.02, -0.28, -0.12], ["Q", -0.11, -0.24, -0.11, -0.40],
              ["L", -0.11, -0.76], ["L", -0.16, -0.76], ["Z"]];
    } },

  // A WINE GLASS — bowl, stem, splayed foot, one outline. The stem is the whole icon and it is two
  // pixels wide at ship size, so nothing else may compete with it: no wine level, no rim line.
  { name: "wineglass", segs: function () {
      return [["M", -0.46, -0.84], ["L", 0.46, -0.84],
              ["Q", 0.46, -0.06, 0.11, 0.08],
              ["L", 0.11, 0.66], ["L", 0.52, 0.88], ["L", -0.52, 0.88], ["L", -0.11, 0.66],
              ["L", -0.11, 0.08],
              ["Q", -0.46, -0.06, -0.46, -0.84], ["Z"]];
    } },

  // A WEDGE OF CHEESE, and the holes have to be in the OUTLINE or this is `triangle` with freckles
  // (§8.12 — interior detail never separates two icons). So the bottom edge is scalloped and the
  // back has a rind dome; the two round holes inside are then decoration rather than the argument.
  { name: "cheese", segs: function () {
      return [["M", -0.92, 0.42], ["L", 0.30, -0.66],
              ["Q", 0.60, -0.86, 0.88, -0.56], ["L", 0.88, 0.42],
              ["Q", 0.52, 0.14, 0.22, 0.42], ["Q", -0.10, 0.14, -0.38, 0.42], ["Z"]]
        .concat(glyphCircleSegs(0.34, -0.06, 0.17))
        .concat(glyphCircleSegs(-0.14, 0.10, 0.11));
    } },

  // A CHOCOLATE BAR. `ingot` is the other rectangle-of-stuff and it is a stepped trapezoid; this is
  // square-ended with a WRAPPER standing proud at one end, which is a step in the silhouette rather
  // than a texture. Score lines stop short of both long edges.
  { name: "candybar", segs: function () {
      // A BITE, NOT A WRAPPER. Two wrapper treatments were tried — a slab end, then a twist — and
      // both read as hardware bolted to a bar. The bite does two jobs at once: it says food, and it
      // is a change to the SILHOUETTE, which is the only thing that separates this from `ingot`.
      let out = glyphPolySegs([
        [-0.90, -0.46], [0.34, -0.46], [0.42, -0.22], [0.58, -0.44], [0.74, -0.18], [0.90, -0.36],
        [0.90, 0.46], [-0.90, 0.46],
      ]);
      // ONE ROW OF TWO, and the count went 2x3 -> 2x2 -> 1x2 on the way here. At the 24px an
      // inventory slot actually uses, every rib under a pixel either vanishes or aliases, and the
      // bar read first as a window and then as a bar with one fat cell. Cell COUNT is not what says
      // chocolate — the ribs are — so there are as few cells as it takes to make the ribs real.
      for (let i = 0; i < 2; i++) out = out.concat(glyphBoxSegs(-0.82 + i * 0.60, -0.30, 0.50, 0.60));
      return out;
    } },

  // A STEIN. The HANDLE is the separator from `barrel` and every other cylinder — and it is a ring,
  // so the hole in it is a second subpath inside the arm, not a gap between two bars.
  { name: "beermug", segs: function () {
      return [["M", -0.66, -0.34],
              ["Q", -0.72, -0.78, -0.44, -0.72], ["Q", -0.36, -0.98, -0.10, -0.86],
              ["Q", 0.14, -1.00, 0.26, -0.72], ["Q", 0.50, -0.70, 0.36, -0.34],
              ["L", 0.34, -0.16],
              ["L", 0.66, -0.16], ["Q", 0.92, -0.16, 0.92, 0.14], ["Q", 0.92, 0.44, 0.66, 0.44],
              ["L", 0.34, 0.44],
              ["L", 0.30, 0.86], ["L", -0.60, 0.86], ["Z"]]
        .concat(glyphBoxSegs(0.48, -0.02, 0.26, 0.30));   // the handle's eye
    } },

  // A QUILL. `feather` is the same object and ships already, so this one is separated on POSE and
  // on the nib: a feather stands upright and ends in a plume, a quill lies on the diagonal and ends
  // in a POINT. The barbs are on one edge only, because a symmetric plume is just a leaf.
  { name: "quill", segs: function () {
      const u = [0.66, -0.75], n = [0.75, 0.66];
      const P = function (s, d) { return [s * u[0] + d * n[0], s * u[1] + d * n[1]]; };
      const p = function (s, d) { const q = P(s, d); return ["L", q[0], q[1]]; };
      const q0 = P(-0.98, 0);
      // FIRST PASS CAME OUT A SLUG. The plume was as wide on the smooth side as the barbed one, so
      // the sawtooth read as lumps on a blob. A feather is ASYMMETRIC: nearly straight along the
      // back, deeply cut along the front, and the cuts have to be a third of the width to survive.
      return [["M", q0[0], q0[1]],
              p(-0.40, 0.04),
              p(-0.26, 0.14), p(-0.10, 0.44), p(0.04, 0.16), p(0.20, 0.46),
              p(0.34, 0.18), p(0.50, 0.46), p(0.64, 0.20), p(0.80, 0.40), p(0.96, 0.02)]
        .concat([(function () { const a = P(0.60, -0.20), b = P(0.20, -0.24);
                                return ["Q", a[0], a[1], b[0], b[1]]; })(),
                 (function () { const a = P(-0.14, -0.22), b = P(-0.40, -0.04);
                                return ["Q", a[0], a[1], b[0], b[1]]; })(),
                 ["Z"]]);
    } },

  // A SIDEARM, drawn from the maintainer's reference: compact slide, an ENCLOSED trigger guard, and
  // a grip raked back under a beavertail. It is the counterpart to `smg` above rather than a
  // replacement — that one is a long slide, an open hook and a long grip, and this is the short,
  // deep-framed shape a pistol actually has.
  //
  // AND THE GUARD FITS HERE BECAUSE THE FRAME IS DEEP, which is the whole reason the same detail
  // was unaffordable one icon up. The slide stops short of the muzzle end, so the frame gets 8px of
  // the 30 to itself: hole 5px across with ~2.3px of ring on every side, measured against the ship
  // grid rather than chosen in unit space.
  // HIDDEN, AND THE THIRD MISS IS THE REASON (maintainer's, 2026-08-17: "pistol is still pretty
  // bad, the shape is very awkward. Should we make note of this and come back later?").
  //
  // That is `splash`'s rule and `splash` was hidden for it: three attempts landing on three
  // DIFFERENT wrong things is the signal that a shape has no agreed silhouette at this size, and a
  // bad icon in the window is a claim that the shape exists. The slot and the index stay, so
  // unhiding is one word and costs no share link.
  //
  // WHAT THE THREE ATTEMPTS ACTUALLY MEASURED, so the next one starts ahead rather than repeating
  // them:
  //   1. A FULL-WIDTH SLIDE MAKES A "T". The bar runs the whole 30px and the grip hangs off the
  //      left, so the silhouette is a tee with a dot in it. The reference's slide STOPS before the
  //      grip's rear and steps down to a beavertail — the rear profile is a big part of what says
  //      "pistol", and this drawing has none.
  //   2. IT IS TOO THIN EVERYWHERE. 6px slide, 5px frame, 6px grip on a 30px field leaves two large
  //      empty quadrants; the reference is a DENSE silhouette that fills its box. Chunk before
  //      detail.
  //   3. THE GUARD HOLE IS AT ITS FLOOR. 4x3px reads as a dot rather than a ring — it satisfies the
  //      ~2px bar rule and still does not say "guard". Either the frame gets deeper or the guard
  //      goes back to being an open hook, as on `smg`.
  //
  // The measurement that governs all three: at 30px ONE UNIT IS 15px, and the mask has to be read
  // as characters rather than squinted at, which is how the last two faults were found.
  { name: "pistol", segs: function () {
      // FIFTH ATTEMPT, AND IT IS THE ONE THE MEASUREMENTS ASKED FOR rather than another guess. The
      // note left when this went behind the flag said three things, and each is answered here:
      //
      //   1. A FULL-WIDTH SLIDE MADE A "T". The slide starts at -0.42 while the frame's rear is at
      //      -0.60, so the FRAME juts out behind the SLIDE — which is the way round a pistol
      //      actually is: the beavertail belongs to the frame and the slide sits forward of it. The
      //      first fix had the slide overhanging instead, and the maintainer read that immediately
      //      as "the top part needs to be moved over to the right". Four rear positions were
      //      rendered at ship size and compared rather than reasoned about.
      //
      //      AND THE REAR NEEDS ITS CORNER SPELLED OUT. Without a second point at the slide's own
      //      x, the outline closes STRAIGHT from the frame's rear to the slide's start — a diagonal,
      //      so the slide's back edge LEANS instead of standing. Three pixels over seven, which
      //      reads as a chamfer nobody asked for; two passes shipped it before the mask was read
      //      closely enough to catch it.
      //   2. IT WAS TOO THIN — a 5px frame and a 6px grip on a 30px field, leaving two empty
      //      quadrants where the reference is DENSE. The frame is 9px deep now and the grip 7-9px,
      //      flaring to the heel.
      //   3. THE GUARD HOLE WAS AT ITS FLOOR. The deeper frame is what buys it room.
      //
      // AND THE HOLE HAD BEEN SIZED FAR UNDER BUDGET ALL ALONG, which is the actual reason it kept
      // reading as a dot. Every pass assumed the width was the constraint and drew a ~4.5px hole;
      // MEASURED, the span between the grip's front diagonal and the frame's front is 13px at the
      // guard's height, so there is room for 7px of hole with 2.4px of bar in front and 3px behind.
      // A dust-cover step was tried first and made it worse — a bite out of the right side rather
      // than a barrel. **The fix was never the outline; it was believing a number instead of
      // checking it.**
      //
      // AND THE GUARD'S UNDERSIDE IS A STRAIGHT BAR THAT RUNS INTO THE GRIP, which is the shape the
      // reference actually has and the thing three earlier passes got wrong. Drawn as a rounded
      // LOBE it hangs below the hole as a droop, and the gap between that droop and the grip's
      // front pinches to one pixel — a hairline crack rather than a trigger opening. A pistol has
      // no notch there: the guard's floor IS the front of the grip, so the outline never leaves the
      // material and the hole is the only opening.
      //
      // THE WIDTH IS THE WHOLE BUDGET, measured rather than felt: at 30px one unit is 15px, and
      // between the grip's front and the muzzle end there is room for [2px bar][~4.5px hole][2px
      // bar] and nothing more. That ceiling is why `smg` — a longer slide and a shallower frame —
      // gets an open hook instead, and why these are two drawings rather than one done twice.
      // AND THE GUARD WAS STILL HALF THE SIZE IT COULD BE, because the paragraph above does its
      // arithmetic at 15px to the unit — a 30px box — and `GLYPH_GRID` is 64. Re-measured at
      // the real grid, the opening has ~21x20px of frame to sit in and was using 11x10. It is
      // 14x13 now, with a 5px bar in front and a 5px floor under it.
      //
      // A TRIGGER WAS DRAWN INTO IT AND LOST. Cut as a tongue in the HOLE's own outline (the only
      // way to hang one off the frame without cancelling), it turns a clean guard opening into a
      // ragged bite — the hole stops reading as a guard and starts reading as damage. Rendered
      // both ways side by side; the plain oval wins and the measurement is here so it is not
      // re-proposed. The SIGHTS are the cheap half and they stayed: both are outline bumps.
      // AND THE REAR IS FLUSH NOW, which is the maintainer's own correction (2026-08-26, with a
      // marked-up crop: *"the top part shouldn't be so separated from the bottom part"*). Point 1
      // above is right that the beavertail belongs to the frame — and standing the slide 0.18
      // FORWARD of the frame's rear left a 6x13px wedge of BACKGROUND between them, so the slide
      // read as a separate bar resting on the frame rather than as one body. The two share a rear
      // edge; the beavertail is now expressed by the grip's rake below it, where it actually is.
      return glyphPolySegs([
        [-0.73, -0.73], [-0.63, -0.73], [-0.63, -0.85], [-0.49, -0.85], [-0.49, -0.73],
        [0.78, -0.73], [0.78, -0.85], [0.89, -0.85], [0.89, -0.73],     // front and rear sights
        [0.95, -0.73], [0.95, -0.33], [0.13, -0.33],                    // slide, muzzle right
        [0.13, 0.46], [-0.30, 0.46],                                    // guard: front bar, floor
        [-0.44, 0.90], [-0.95, 0.90], [-0.73, 0.02],                    // grip, raked back
        [-0.73, -0.33],                                                 // frame rear, one edge
      ]).concat(glyphOvalSegs(-0.24, 0.10, 0.22, 0.21));                     // the trigger gap, a cut
    } },

  // A SCALLOP SHELL — and the reason it exists is a good one (maintainer's, 2026-08-17: "I think
  // it's funny you chose shell for the beach theme. Those are shotgun shells, not beach shells.
  // Clear icon we're missing though.")
  //
  // `shell` IS ORDNANCE. It came in with `gun` `bullet` `grenade`, and I wallpapered a beach with
  // it. The mistake found a real hole: 208 icons and not one thing you pick up on a shore.
  //
  // THE FAN IS THE SILHOUETTE AND THE LOBES ARE WHAT MAKE IT A SHELL. A plain fan is a fan; the
  // scalloped top edge is the only part that says which one — three big lobes rather than five,
  // because at 30px five are 5px each and the notches close up. The two little EARS at the hinge do
  // the same job from the other end: they are what a bivalve has and a leaf does not.
  // A SPADE — three of the four suits already ship (`heart`, `diamond`, `clover` is the club) and
  // this was the hole, which only showed up when a deck-of-cards theme wanted all four.
  //
  // IT IS NOT AN UPSIDE-DOWN HEART, though that is the usual shorthand. A heart's two lobes meet in
  // a CLEFT at the top and its point is at the bottom; a spade's point is at the top and the lobes
  // swing out and BACK IN at the bottom to meet a stem. Drawing it as a flipped heart gives a shape
  // with a notch where the stem should be, which reads as a broken heart rather than a spade.
  //
  // THE STEM IS A TRAPEZOID, not a taper to a point. At 16px a pointed stem is one pixel wide at the
  // base and drops off; a flared foot survives, and it is what the printed suit actually has.
  { name: "spade", segs: function () {
      return [
        ["M", 0, -0.88],
        ["Q", 0.30, -0.46, 0.66, -0.16],
        ["Q", 0.96, 0.10, 0.72, 0.34],
        ["Q", 0.44, 0.52, 0.16, 0.30],
        ["L", 0.32, 0.88],
        ["L", -0.32, 0.88],
        ["L", -0.16, 0.30],
        ["Q", -0.44, 0.52, -0.72, 0.34],
        ["Q", -0.96, 0.10, -0.66, -0.16],
        ["Q", -0.30, -0.46, 0, -0.88],
        ["Z"],
      ];
    } },
  // A TORII — the theme's namesake, and the thing that was actually asked for once the ofuda
  // pattern came back looking like a picnic blanket (maintainer's, 2026-08-19).
  //
  // THE GAP IS A HOLE, NOT A SEAM. A torii is a kasagi (the top beam, overhanging and turned up at
  // the ends), a nuki (the second beam, overhanging less) and two posts — and between the two beams
  // there is an enclosed opening. A single outline cannot have one, so the mass is traced solid and
  // a SECOND closed subpath cuts the gap: even-odd gives a hole for free, which is the same trick
  // `inn` uses to cut letters out of its sign board. Union would need `segsAll`; a hole needs this.
  //
  // AND THE HOLE IS 0.22 UNITS BECAUSE OF THE SHIP SIZE, not because a real one is that deep. At
  // 30px a unit is 15px, so the gap is a bit over three pixels; the first proportions gave 1.8 and
  // it fragmented, which is the same note `vial`, `crack` and the pistol's trigger guard all carry.
  // The posts were shortened to buy it rather than the beams thinned.
  //
  // THE OPENING BETWEEN THE POSTS IS OPEN AT THE BOTTOM, so it costs nothing — it is a notch in the
  // silhouette rather than a second hole, and that is what makes the whole shape one trace.
  { name: "torii", segs: function () {
      return glyphPolySegs([
        [-0.98, -0.92], [0.98, -0.92], [0.98, -0.68], [0.58, -0.68],
        [0.58, -0.38], [0.80, -0.38], [0.80, -0.22], [0.58, -0.22],
        [0.58, 0.90], [0.34, 0.90], [0.34, -0.22],
        [-0.34, -0.22], [-0.34, 0.90], [-0.58, 0.90], [-0.58, -0.22],
        [-0.80, -0.22], [-0.80, -0.38], [-0.58, -0.38], [-0.58, -0.68], [-0.98, -0.68],
      ]).concat(glyphPolySegs([
        [-0.34, -0.64], [0.34, -0.64], [0.34, -0.42], [-0.34, -0.42],
      ]));
    } },
  { name: "seashell", segs: function () {
      // A SCALLOP SHELL — and the reason it exists is a good one (maintainer's, 2026-08-17: "I
      // think it's funny you chose shell for the beach theme. Those are shotgun shells, not beach
      // shells. Clear icon we're missing though.")
      //
      // `shell` IS ORDNANCE. It came in with `gun` `bullet` `grenade`, and I wallpapered a beach
      // with it. The mistake found a real hole: 209 icons and not one thing you pick up on a shore.
      //
      // THE WIDEST POINT IS THE TOP, and getting that wrong made the first draft a SHIELD: flanks
      // bulging at mid-height and converging both ways give a diamond, whatever the top edge does.
      // A scallop is a FAN — widest and highest at the same corners — so the outline only ever gets
      // narrower on the way down, and the hinge is 0.16 across rather than 0.44.
      //
      // AND THE NOTCHES HAVE TO BE DEEP. At 0.14 they are a bumpy edge and it still reads as a
      // shield; at 0.32-0.48 they are lobes, which is the only part of the drawing that says WHICH
      // fan this is. Three of them rather than five: at 30px five lobes are 5px each and the
      // notches close up.
      //
      // NO RIBS. The classic scallop has grooves radiating from the hinge and they are unaffordable
      // here — a groove is 1px at ship size and fragments, and one reaching both edges would SEVER
      // the shape, the rule `vial` and `shell` each paid for. The lobed edge is what the ribs are
      // FOR, so drawing the edge draws them.
      return glyphPolySegs([
        [-0.16, 0.86], [-0.94, -0.36],                                  // hinge, left flank out
        [-0.64, -0.72], [-0.34, -0.40], [0, -0.88], [0.34, -0.40], [0.64, -0.72],   // scalloped top
        [0.94, -0.36], [0.16, 0.86],                                    // right flank, hinge
      ]);
    } },

  // A PANDA, AND EVERY DIFFICULTY IN IT IS THAT THE ANIMAL IS DEFINED BY BEING TWO-TONE. An icon
  // here is one ink, so the obvious drawing — a white face with black ears and patches — has no
  // white to draw with. What it does have is EVEN-ODD (§11.3), and a hole is white.
  //
  // FIVE SUBPATHS, THREE PARITIES. The head is the outer loop, the face is a hole inside it, and
  // the two eye patches and the nose sit inside the hole at winding 3 — which is odd, so they fill.
  // That is `torii`'s trick used twice over and `crosshair`'s double-cancel arrived at from the
  // other side: the patches are ink surrounded by white surrounded by ink.
  //
  // THE EARS ARE PART OF THE OUTER LOOP, NOT DISCS ON TOP OF IT, and this is the part that had to
  // be got right rather than tried. An ear drawn as its own subpath overlapping the head cancels
  // where the two meet, so it arrives as a crescent with a notch bitten out of the ring beneath it.
  // Tangency is no better — a tangent point is under a pixel wide (`clover`, `snowman`). The union
  // of the three discs is traced as ONE outline by taking, for each ray from the head's centre, the
  // furthest point any of them reaches; the ear is then simply where that outline bulges.
  //
  // THE PATCHES MUST STAY INSIDE THE FACE, which is a hard bound rather than a preference: a patch
  // crossing the inner circle is at winding 2 outside it and punches a hole through the ring. That
  // caps them at the face's radius and is why the ring is 0.18 rather than the 0.24 a first draft
  // wanted — the ring gave up its thickness so the patches could have their size.
  //
  // AND THE PATCHES ARE THE ANIMAL. Round dots at 0.17 read as a SKULL: two sockets and a nose in a
  // bone-coloured face is exactly what a skull is. Slanting them 45 degrees and taking them out to
  // 0.24 x 0.19 is what makes them patches — the slant is the only thing separating the two
  // subjects, and it was worth four renders to find. Reads down to about 24px; below that the
  // patches close on the ring and it becomes a bear, which is still not another icon in the roster.
  { name: "panda", segs: function () {
      const HY = 0.06, HR = 0.76, EX = 0.52, EY = -0.62, ER = 0.30, IR = 0.58;
      const discs = [[0, HY, HR], [EX, EY, ER], [-EX, EY, ER]];
      const ring = [];
      for (let i = 0; i < 72; i++) {
        const a = i * Math.PI / 36, cs = Math.cos(a), sn = Math.sin(a);
        let far = 0;
        for (let d = 0; d < 3; d++) {
          const px = discs[d][0] - 0, py = discs[d][1] - HY;
          const t = px * cs + py * sn;
          const h2 = discs[d][2] * discs[d][2] - (px * px + py * py - t * t);
          if (h2 >= 0 && t + Math.sqrt(h2) > far) far = t + Math.sqrt(h2);
        }
        ring.push([far * cs, HY + far * sn]);
      }
      // A patch is an oval turned about its own centre; `glyphRotPt` is the ordinary rotation matrix and
      // under a flipped y a positive angle turns clockwise, which is the way a panda's mask slants.
      const patch = function (cx, cy, rx, ry, deg) {
        const pts = [];
        for (let i = 0; i < 28; i++) {
          const t = i * Math.PI / 14;
          const r = glyphRotPt(rx * Math.cos(t), ry * Math.sin(t), deg * Math.PI / 180);
          pts.push([cx + r[0], cy + r[1]]);
        }
        return glyphPolySegs(pts);
      };
      return glyphPolySegs(ring)
        .concat(glyphCircleSegs(0, HY, IR))                    // the face: a hole
        .concat(patch(-0.30, HY - 0.08, 0.24, 0.19, -45))  // eye patches, at winding 3
        .concat(patch(0.30, HY - 0.08, 0.24, 0.19, 45))
        .concat(patch(0, HY + 0.30, 0.15, 0.11, 0));       // nose
    } },

  // ---------------------------------------------------------------------------------------------
  // THREE GLYPHS THREE SHIPPED THEMES WERE FAKING (2026-08-20). `Aloha` wore a `wave` where a
  // surfboard belongs, `Torii` scattered `scroll` for want of an ofuda, and `Barnyard` grew
  // `sprout` instead of corn. All three substitutions were recorded in CLAUDE.md as real gaps
  // rather than left silent, which is the only reason they were still findable.
  //
  // EACH WAS SCORED AGAINST THE WHOLE ROSTER WHILE BEING DRAWN, using the same uniform-scale IoU
  // the sweep uses (§8.12), instead of drawing first and discovering the collision afterwards.
  // That is what killed four of the candidates below, and it is worth doing again.

  // A SURFBOARD, AND IT IS DIAGONAL FOR A MEASURED REASON. Upright it is a thin vertical lens,
  // which is the `feather`/`drop` cluster this roster has already redrawn six times: at 30px a
  // correctly-proportioned board is 8px wide and 80% of its own bounding box — the `vial` rule
  // exactly, a glyph shrinking along the dimension that carries its shape.
  //
  // THE STRINGER IS THE IDENTITY AND IT NEEDS THE DIAGONAL TO EXIST. Upright, the centre line is
  // sub-pixel and vanishes, leaving a plain lens that measured 0.817 against `mouse` and 0.796
  // against `bullet`. On the diagonal the same board is 18px across its own bounding box, the line
  // renders, and it drops to 0.573. Turning the glyph bought the space the detail needed.
  //
  // AND A FIN WAS TRIED FIRST AND READS AS A STEM. A triangle projecting past the tail is exactly
  // a leaf's petiole; twin fins came out as legs. A surfboard cannot show a fin honestly anyway —
  // deck-on it is hidden and in profile the board is a sliver — so the fin is the wrong detail to
  // reach for, however much it says "surfboard" in the head.
  //
  // The stringer is a second closed subpath INSIDE the outline, so even-odd makes it a hole (the
  // `torii` trick). It stops short of both ends: a cut that spans a shape edge to edge SEVERS it,
  // which `vial`, `shell` and `seashell` each paid for in turn.
  { name: "surfboard", segs: function () {
      const hw = 0.34, tail = 0.26, sw = 0.032, len = 0.68;
      const board = [["M", 0, -0.97],
                     ["Q", hw, -0.46, hw, 0.14], ["Q", hw * 0.97, 0.56, tail, 0.86],
                     ["L", -tail, 0.86],
                     ["Q", -hw * 0.97, 0.56, -hw, 0.14], ["Q", -hw, -0.46, 0, -0.97], ["Z"]]
        .concat([["M", -sw, -len], ["L", sw, -len], ["L", sw, len], ["L", -sw, len], ["Z"]]);
      // 35 degrees, measured: 30 gives 0.598 against `grenade` and 40 gives 0.647 against `pill`.
      return glyphRotSegs([board], 35)[0];
    } },

  // AN OFUDA — the roofed shrine tablet, not the paper slip. Both are real; the slip is a plain
  // rectangle, which is `nameplate` with nothing to say, so the plaque is the one that can be an
  // icon at all. It also echoes the torii it ships beside, which is the right accident.
  //
  // THE ROOF HAD TO BE WIDE AND SHALLOW OR IT IS A BULLET. A tall gable over a narrow strip is a
  // nose cone on a cylinder — measured at 0.831 against `bullet`, and a chamfered crown was no
  // better at 0.817. What fixes it is the EAVE: the cap overhangs the body and stops on a flat
  // ledge, so there is a shoulder rather than a taper. 0.714.
  //
  // AND THE BAND IS A STEP OUT, NEVER A CUT. A horizontal slot across the strip would sever it —
  // the same rule the surfboard's stringer obeys from the other side. A binding that stands PROUD
  // of the body says the same thing and costs the outline nothing.
  { name: "ofuda", segs: function () {
      return glyphPolySegs([[0, -0.92], [0.58, -0.62], [0.58, -0.46], [0.28, -0.46],
                       [0.28, 0.14], [0.40, 0.14], [0.40, 0.36], [0.28, 0.36],
                       [0.28, 0.93], [-0.28, 0.93], [-0.28, 0.36], [-0.40, 0.36],
                       [-0.40, 0.14], [-0.28, 0.14], [-0.28, -0.46], [-0.58, -0.46],
                       [-0.58, -0.62]]);
    } },

  // AN EAR OF CORN, and the kernels are NOT drawn — which took four attempts to accept. A grid of
  // holes is the obvious answer and the cob is 12px wide at ship size, so the grid eats it: the
  // glyph came back as a lattice with a husk, and tilting it made mush. Interior detail never
  // separates an icon at this size; the outline does, and that rule now has a fifth witness.
  //
  // SO THE HUSKS CARRY IT, AND THEY HAVE TO HANG. Leaves that widen smoothly out of the cob are a
  // SKIRT and measured 0.765 against `bullet`; leaves swept horizontal made a mushroom. What reads
  // is a V — the tips are the lowest thing in the glyph and the notch between them sits well above,
  // so the bottom of the silhouette says "two of something" rather than "hem".
  //
  // AND A HUSK NEEDS A BULGE. Drawn as waist-tip-notch each one is a 1px sliver and the glyph is a
  // cob on insect legs; an outer bulge and an inner return make it a blade. 0.597.
  //
  // THE RAIL IS GENTLY SCALLOPED — eight lobes at 0.032, which is about a pixel of wobble at 30px.
  // It suggests rows without becoming lumps; at 0.085 the cob is a pine cone. The sweep cannot see
  // it (24x24 downsampling swallows +/-1px, and the score is identical either way), so it is a
  // judgement made on the mask and recorded as one.
  { name: "corn", segs: function () {
      // THE HUSKS REACH UP, and getting there cost five wrong drawings. Every version with the
      // leaves BELOW the ear read as a rocket — a capsule over two symmetric fins is an
      // overwhelming silhouette, and no amount of asymmetry, hanging, or blade width dislodged it.
      // Real corn puts the husks ALONGSIDE the ear at roughly its own visual mass, so the glyph is
      // three vertical parts sharing a base rather than a body with feet.
      //
      // AND THE KERNELS ARE NOT DRAWN. A grid of holes is the obvious identity and the cob is 12px
      // wide at ship size, so the grid eats it — the glyph came back as a lattice, and tilting it
      // made mush. Interior detail never separates an icon at this size; the outline does.
      //
      // ONE TRACED LOOP: down the cob's rail, up the husk's inner edge to its tip, down its outer
      // edge, across the base, mirror. Separate subpaths would CANCEL where a husk crosses the cob
      // (§11.3), and butting them to a tangent is not a join either (the `clover` lesson).
      const cw = 0.30;
      return glyphPolySegs([
        [0, -0.97], [cw * 0.9, -0.55], [cw, -0.05], [cw * 0.93, 0.46],
        [0.24, 0.60], [0.60, -0.46], [0.72, 0.04], [0.50, 0.80],
        [0.13, 0.96], [-0.13, 0.96],
        [-0.50, 0.80], [-0.72, 0.04], [-0.60, -0.46], [-0.24, 0.60],
        [-cw * 0.93, 0.46], [-cw, -0.05], [-cw * 0.9, -0.55],
      ]);
    } },

  // ---- THE DESKTOP TRIO (maintainer's, 2026-08-21: "we should have some more of the basic icons
  // covered such as folders, documents, and application"). Exactly right, and the gap was total:
  // the KDE icon theme was mapping `folder` onto `chest`, which is a fudge that reads as a treasure
  // chest in a file manager.
  //
  // `system: true` ON ALL THREE, which is the sheet's family label and nothing else
  // (maintainer's, 2026-08-21). They are commodity UI marks in exactly the sense `trash`, `search`,
  // `expand` and `layers` are — a person hunting for a folder is looking in the same place they
  // looked for a bin — and without the flag they land in "Shapes", filed with the swords and the
  // potions where nobody would think to look.
  //
  // ALL THREE ARE OUTLINES, and the first folder was not — solid, it measured **90% of its own
  // bounding box**, which is the `vial` rule exactly: a glyph that fills its box is a block, and a
  // solid folder is a rectangle with a bump. Hollowed it is 38% and the tab reads.
  { name: "folder", system: true, segs: function () {
      // The tab is the entire identity. Everything else here is a rectangle, so the step up on the
      // LEFT of the top edge is what stops this being `stop` with a lid.
      const t = 0.14;
      return [["M", -0.84, -0.50], ["L", -0.22, -0.50], ["L", -0.08, -0.28], ["L", 0.84, -0.28],
              ["L", 0.84, 0.60], ["L", -0.84, 0.60], ["Z"],
              ["M", -0.84 + t, -0.50 + t], ["L", -0.22 - t * 0.2, -0.50 + t],
              ["L", -0.08 - t * 0.2, -0.28 + t], ["L", 0.84 - t, -0.28 + t],
              ["L", 0.84 - t, 0.60 - t], ["L", -0.84 + t, 0.60 - t], ["Z"]];
    } },

  // ONE FLAT `segs` WITH EVEN-ODD PARITIES, not `segsAll` — `pathIconDef` reads `d.segs` and
  // nothing else, so a def with only `segsAll` throws at BUILD time with "d.segs is not a
  // function". `segsAll` belongs to the ported VFX shapes, which need UNION; everything authored
  // here is one traced outline with holes, which is what even-odd gives for free (the `panda`
  // trick: outer at winding 1, the hole at 2, the detail inside it at 3).
  { name: "document", system: true, segs: function () {
      // THE FOLDED CORNER IS THE WHOLE IDENTITY. Without it this is `stop` — a rectangle — at every
      // size, and the fold has to be a NOTCH IN THE SILHOUETTE rather than a line drawn inside it,
      // because interior detail never separates an icon at 16px (sixth witness).
      const t = 0.14, f = 0.34;
      return [
        ["M", -0.60, -0.80], ["L", 0.60 - f, -0.80], ["L", 0.60, -0.80 + f], ["L", 0.60, 0.80],
        ["L", -0.60, 0.80], ["Z"],
        ["M", -0.60 + t, -0.80 + t], ["L", 0.60 - f - t * 0.4, -0.80 + t],
        ["L", 0.60 - t, -0.80 + f + t * 0.4], ["L", 0.60 - t, 0.80 - t],
        ["L", -0.60 + t, 0.80 - t], ["Z"],
        // The fold, filled: it sits in the NOTCH, which is outside the outer loop, so its parity is
        // 1 and it fills. That is what makes the corner read as turned paper rather than cut off.
        ["M", 0.60 - f, -0.80], ["L", 0.60 - f, -0.80 + f], ["L", 0.60, -0.80 + f], ["Z"],
      ];
    } },

  { name: "app", system: true, segs: function () {
      // A WINDOW, AND WHAT KEEPS IT CLEAR OF `flatscreen` AND `crt` IS THE ABSENCE OF A FOOT. Those
      // two are the same rectangle with a STAND under it; this one has a title bar and three
      // buttons instead, and measures 0.367 against the nearer of them.
      const t = 0.13, bar = 0.30;
      const dot = function (cx) {
        const r = 0.075, y = -0.62 + bar * 0.5;
        return [["M", cx - r, y - r], ["L", cx + r, y - r], ["L", cx + r, y + r],
                ["L", cx - r, y + r], ["Z"]];
      };
      // The bar and the dots sit INSIDE the hole, so their parity is 3 and they fill — the same
      // three-level winding the panda's eye patches use.
      return [].concat(
        [["M", -0.82, -0.62], ["L", 0.82, -0.62], ["L", 0.82, 0.62], ["L", -0.82, 0.62], ["Z"],
         ["M", -0.82 + t, -0.62 + t], ["L", 0.82 - t, -0.62 + t], ["L", 0.82 - t, 0.62 - t],
         ["L", -0.82 + t, 0.62 - t], ["Z"],
         ["M", -0.82, -0.62 + bar], ["L", 0.82, -0.62 + bar], ["L", 0.82, -0.62 + bar + t * 0.8],
         ["L", -0.82, -0.62 + bar + t * 0.8], ["Z"]],
        dot(-0.55), dot(-0.30), dot(-0.05));
    } },

  // A FRAMED LANDSCAPE — `folder-pictures`, which Dolphin's places panel asks for and which fell
  // back to Breeze in the middle of a column of ours.
  //
  // THE SILHOUETTE IS CROWDED HERE AND THE INTERIOR IS THE IDENTITY, which is the one case that
  // inverts this roster's usual rule. `app`, `flatscreen`, `crt`, `inn` and `stop` are all the same
  // rectangle, so what had to be measured was whether a frame plus a sun plus a peak lands clear of
  // them — it does, at 0.522 against `map`, because an OUTLINE glyph's ink is mostly its interior
  // and two interiors this different do not overlap.
  //
  // ONE PEAK, NOT TWO. A shoulder beside the main peak is what a landscape actually looks like and
  // at 22px — the size the places panel asks for — its tip breaks off as a DETACHED PIXEL one row
  // before it merges. Read off the printed mask, not the render (§8.3): three candidates looked
  // equally fine at 6x and only one of them is clean.
  { name: "picture", system: true, segs: function () {
      const t = 0.14, L = -0.84, R = 0.84, T = -0.64, B = 0.64;
      const disc = function (cx, cy, r) {
        const out = [], n = 12;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          out.push([i ? "L" : "M", cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        out.push(["Z"]);
        return out;
      };
      // The peak and the sun sit INSIDE the hole, so their parity is 3 and they fill — the same
      // three-level winding `app`'s title bar and the panda's eye patches use.
      return [].concat(
        [["M", L, T], ["L", R, T], ["L", R, B], ["L", L, B], ["Z"],
         ["M", L + t, T + t], ["L", R - t, T + t], ["L", R - t, B - t], ["L", L + t, B - t], ["Z"]],
        [["M", L + t, B - t], ["L", -0.06, -0.24], ["L", R - t, B - t], ["Z"]],
        disc(-0.44, -0.30, 0.18));
    } },
  // ---- REFRESH (2026-08-23). Flagged as undrawable since the roster was built — "defined by
  // strokes that CROSS, and even-odd cancels at the intersection (§11.3)" — and it turns out not to
  // need the crossing at all. Traced as ONE outline (out along the arc's outer edge, round the
  // head, back along the inner) there is no overlap to cancel and no shared edge to seam.
  //
  // THE HEAD IS A SWELLING OF THE BAND, NOT A TRIANGLE BUTTED ONTO IT, and that was the fourth
  // attempt. Abutting a separate triangle at the arc's end seams along the shared edge; flaring its
  // base INWARD past the ring's inner radius leaves a sub-pixel wedge that rasterizes as a hole two
  // pixels from the join. Letting the band thicken over its last stretch has neither problem and is
  // also what an arrow drawn with one stroke actually looks like. Worst neighbour `info` at 0.477.
  { name: "refresh", system: true, segs: function () {
      const gap = 1.4, rIn = 0.44, rOut = 0.62, flare = 0.22, len = 0.40, ramp = 0.14;
      const a1 = -Math.PI / 2 - gap / 2, a0 = a1 - (2 * Math.PI - gap);
      const n = 48, pts = [];
      // How far into the swell we are: 0 for most of the arc, running to 1 at the head.
      const sw = function (i) { const t = i / n; return t < 1 - ramp ? 0 : (t - (1 - ramp)) / ramp; };
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, r = rOut + flare * sw(i);
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      // The point, one step PAST the arc's end along the tangent — the direction of travel.
      const c = Math.cos(a1), s2 = Math.sin(a1), m = (rIn + rOut) / 2;
      pts.push([c * m - s2 * len, s2 * m + c * len]);
      for (let i = n; i >= 0; i--) {
        const a = a0 + (a1 - a0) * i / n, r = rIn - flare * sw(i);
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return glyphPolySegs(pts);
    } },

  // ---- TROPHY (2026-08-23). The handles are SLOTS cut beside the bowl, not arcs laid over it:
  // drawn as their own shapes they would overlap the cup and even-odd would cancel the overlap
  // (§11.3), and drawn floating clear they read as two detached bars. As holes they cost nothing
  // and the counter is what makes an ear read as a handle — `torii`'s trick.
  //
  // THE CUP HAS TO TAPER FROM THE RIM. Straight-sided it measured 0.674 against `mushroom` and
  // looked like a box with ears — a cap on a stem is structurally the same object. Narrowing it to
  // the stem is both the better trophy and the thing that separates them: 0.661, and every other
  // neighbour under 0.62.
  //
  // AND THE HANDLE BAR IS SIZED IN UNITS, NOT INSET FROM THE EDGE. Specified as an inset it came
  // out ONE pixel wide and vanished by 15px, which is the `vial` floor arriving at a detail rather
  // than at a whole glyph.
  { name: "trophy", system: true, segs: function () {
      const bar = 0.17, slot = 0.13, sT = -0.54, sB = -0.22, E = 0.40 + slot + bar;
      return glyphPolySegs([
        [-0.40, -0.72], [0.40, -0.72],
        [0.40, -0.60], [E, -0.54], [E, -0.20], [0.30, -0.02],
        [0.13, 0.12], [0.12, 0.12],
        [0.12, 0.34], [0.42, 0.34], [0.42, 0.58], [-0.42, 0.58], [-0.42, 0.34], [-0.12, 0.34],
        [-0.12, 0.12], [-0.13, 0.12],
        [-0.30, -0.02], [-E, -0.20], [-E, -0.54], [-0.40, -0.60],
      ]).concat(glyphBoxSegs(-0.40 - slot, sT, slot, sB - sT),
                glyphBoxSegs(0.40, sT, slot, sB - sT));
    } },

  // ---- FIVE FOR A GAME (maintainer's, 2026-08-26). All five are SHAPES rather than system marks:
  //      the System family is the commodity UI vocabulary re-authored as paths (§11.8) — close,
  //      check, arrow, menu — and a rose or a saxophone is a world object, which is what Shapes is
  //      for. They shipped under `system: true` by mistake and were re-filed the same day.

  // HANDCUFFS. Two rings and a chain — and the first version put them side by side with a single
  // bridge, which rendered as a pair of SPECTACLES. No amount of ring thickness fixes that while
  // the two sit level, because level-and-joined IS glasses. The diagonal offset is what kills it:
  // spectacles are never staggered. Two chain links rather than one bar, for the same reason.
  //
  // The link is a separate subpath and does NOT overlap either ring — an overlap cancels under
  // even-odd and would bite a notch out of the cuff exactly where the chain meets it.
  { name: "handcuffs", segs: function () {
      // THE BAND IS ECCENTRIC: the hole is pushed AWAY from the chain, so each ring thickens on the
      // chain side into the lock housing a real cuff has. Drawn as its own shape a housing would
      // overlap the ring and CANCEL under even-odd (§11.3); offsetting the hole cannot.
      const R = 0.330, r = 0.172, t = 0.072, e = 0.052;
      const L = [-0.47, -0.305], Rt = [0.47, 0.305];
      const m = Math.hypot(Rt[0] - L[0], Rt[1] - L[1]);
      const ux = (Rt[0] - L[0]) / m, uy = (Rt[1] - L[1]) / m;
      const ring = function (c, s) {
        return glyphCircleSegs(c[0], c[1], R)
          .concat(glyphCircleSegs(c[0] - ux * e * s, c[1] - uy * e * s, r));
      };
      // Two links, and the gap between the rings has to be wide enough to hold both — at the
      // earlier spacing they were 4px each and read as a single scratch.
      const link = function (o, half) {
        return glyphBarSegs(ux * (o - half), uy * (o - half), ux * (o + half), uy * (o + half), t);
      };
      return ring(L, -1).concat(ring(Rt, 1), link(-0.135, 0.098), link(0.135, 0.098));
    } },

  // PAINTBRUSH. Traced with square corners, because every version built by offsetting a centreline
  // came back a BOTTLE: perpendicular offsets round the shoulders off, and what survives at 30px is
  // the profile — thin at one end, fat at the other — which is a skittle. A brush is a long thin
  // handle and a SHORT wide head with corners on it, and the ferrule has to step OUT rather than
  // swell. Upright rather than diagonal: on a 45 degree axis the square end of the head rasterises
  // as a staircase and reads as a taper, which is a knife.
  { name: "paintbrush", segs: function () {
      // DIAGONAL, WHICH THE FIRST PASS REJECTED AT THE WRONG SIZE. Upright, a handle-ferrule-head
      // stack is a symmetric stepped tower and reads as a ROCKET; every real icon set draws this
      // one at an angle, and the reason it was refused here — that a square head end rasterises as
      // a staircase and reads as a taper — was measured at 30px. At 64 the step is fine.
      const P = [
        [-0.055, -0.95], [0.055, -0.95], [0.082, 0.06],   // handle, widening to the ferrule
        [ 0.160,  0.06], [0.160,  0.42],                  // the ferrule steps OUT and steps again
        [ 0.270,  0.42], [0.286,  0.92],                  // bristles, a shade flared, flat end
        [-0.286,  0.92], [-0.270, 0.42],
        [-0.160,  0.42], [-0.160, 0.06], [-0.082, 0.06],
      ];
      // Rotated and then FITTED, so the angle can be tuned without walking the glyph off its box.
      const a = 38 * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      const R = P.map(function (q) { return [q[0] * c - q[1] * sn, q[0] * sn + q[1] * c]; });
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      R.forEach(function (q) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
        y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      });
      const k = 1.80 / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      return glyphPolySegs(R.map(function (q) { return [(q[0] - cx) * k, (q[1] - cy) * k]; }));
    } },

  // ROSE. What separates it from `flower` is the SILHOUETTE, not the detail: `flower` is radial and
  // symmetric and fills its box at 63%, this is vertical and top-heavy with a stem and two leaves.
  // Measured, they do not come near each other.
  //
  // AND THE FURL IS NOT DRAWN. A spiral inside a bloom sixteen pixels across is sub-pixel, and the
  // one crescent that did fit turned the bloom into a maze — the roster's oldest finding, that
  // interior detail never separates an icon at this size and the outline does.
  //
  // TRACED AS ONE OUTLINE, bloom and stem and both leaves together. As separate subpaths the stem
  // overlapped the bloom and cancelled it, leaving a gap exactly where the flower meets its stalk;
  // butting them instead only moves the fault, because tangency is not a join at this size.
  { name: "rose", segs: function () {
      // THE FURL IS A SPIRAL SLOT CUT OUT OF THE BLOOM, which the first pass called sub-pixel and
      // is not: it was measured at 30px, and at the authoring grid of 64 a unit is 32px, so the
      // band is ~3px with ~4px between turns. ONE turn rather than two — at 1.25 turns the bloom
      // is better at 64 and dissolves into noise by 22px, where a single bold swirl still reads.
      const BX = 0, BY = -0.36, BR = 0.44, SW = 0.068;
      const quad = function (p0, cp, p1, n) {
        const o = [];
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          o.push([u * u * p0[0] + 2 * u * t * cp[0] + t * t * p1[0],
                  u * u * p0[1] + 2 * u * t * cp[1] + t * t * p1[1]]);
        }
        return o;
      };
      const lobe = function (a) { return BR * (1 + 0.070 * Math.cos(5 * a + 1.2)); };
      const P = [];
      const a0 = 78 * Math.PI / 180, a1 = a0 - (324 * Math.PI / 180);
      for (let i = 0; i <= 96; i++) {
        const a = a0 + (a1 - a0) * (i / 96), r = lobe(a);
        P.push([BX + r * Math.cos(a), BY + r * Math.sin(a)]);
      }
      // A LEAF IS AN ALMOND ON A NARROW PETIOLE, traced out along one edge and back along the
      // OTHER. Both earlier versions swept out and back along the SAME curve, which encloses
      // nothing and came out as a flat blade — two of them read as a crossbar through the stem.
      // Staggered, or they meet at one height and make a T.
      P.push([-SW, 0.24]);
      P.push.apply(P, quad([-SW, 0.24], [-0.26, 0.10], [-0.50, 0.30], 14));
      P.push.apply(P, quad([-0.50, 0.30], [-0.26, 0.56], [-SW, 0.34], 14));
      P.push([-SW, 0.90], [SW, 0.90]);
      P.push([SW, 0.76]);
      P.push.apply(P, quad([SW, 0.76], [0.26, 0.98], [0.50, 0.72], 14));
      P.push.apply(P, quad([0.50, 0.72], [0.26, 0.52], [SW, 0.66], 14));
      P.push([SW, -0.02]);

      const r0 = 0.095, r1 = 0.325, turns = 1.00, hw = 0.052, N = 80;
      const A = [], B = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, r = r0 + (r1 - r0) * t, th = -1.9 + turns * 2 * Math.PI * t;
        const cx = BX + r * Math.cos(th), cy = BY + r * Math.sin(th), dth = turns * 2 * Math.PI;
        let tx = (r1 - r0) * Math.cos(th) - r * Math.sin(th) * dth;
        let ty = (r1 - r0) * Math.sin(th) + r * Math.cos(th) * dth;
        const m = Math.hypot(tx, ty) || 1;
        tx /= m; ty /= m;
        A.push([cx - ty * hw, cy + tx * hw]);
        B.push([cx + ty * hw, cy - tx * hw]);
      }
      return glyphPolySegs(P).concat(glyphPolySegs(A.concat(B.reverse())));
    } },

  // PEACE. A ring with four voids, and drawing it that way rather than as a ring PLUS bars is what
  // makes it safe: bars laid over the ring would CANCEL where they cross it (§11.3) and bite a
  // notch out of the band at every junction, and ending them exactly at the inner radius leaves
  // the bar's own corners poking through. The sectors between the bars ARE the void, so the bars
  // are simply what is left and they meet the ring by construction.
  //
  // THE VERTICAL RUNS THE WHOLE DIAMETER, so there are THREE lines below the centre, not two.
  // The first drawing stopped it at the hub and cut one void between the legs, which is an
  // inverted Y in a circle — close enough to pass every sweep and wrong to anyone who has seen
  // the symbol (maintainer's, 2026-09-14, with a reference). Four sectors, not three: two wide
  // ones above the legs and two narrow wedges between each leg and the lower half of the bar.
  { name: "peace", segs: function () {
      const R = 0.85, r = 0.665, hw = 0.09;
      const s = Math.SQRT1_2, q = Math.sqrt(r * r - hw * hw), a = hw * s;
      const arc = function (t0, t1) {
        const out = [];
        for (let i = 0; i <= 28; i++) {
          const t = t0 + (t1 - t0) * (i / 28);
          out.push([r * Math.cos(t), r * Math.sin(t)]);
        }
        return out;
      };
      // Where each bar edge leaves the inner circle. Both legs give the same `q` by symmetry,
      // and so does the vertical, top and bottom.
      const barL = Math.atan2(-q, -hw), barR = Math.atan2(-q, hw);
      const botL = Math.atan2(q, -hw), botR = Math.atan2(q, hw);
      const upL = Math.atan2(-a + q * s, -a - q * s), upR = Math.atan2(-a + q * s, a + q * s);
      const loL = Math.atan2(a + q * s, a - q * s), loR = Math.atan2(a + q * s, -(a - q * s));
      // The inner corners: where the bar's edge meets each leg's upper and lower edge.
      const inner = hw * (1 - 2 * s), under = hw * (1 + 2 * s);
      return glyphCircleSegs(0, 0, R).concat(
        glyphPolySegs([[-hw, inner]].concat(arc(barL, upL - 2 * Math.PI))),
        glyphPolySegs([[hw, inner]].concat(arc(upR, barR))),
        glyphPolySegs([[-hw, under]].concat(arc(loL, botL))),
        glyphPolySegs([[hw, under]].concat(arc(botR, loR))));
    } },

  // SAXOPHONE. Drawn as a CENTRELINE with a growing half-width and offset to both sides, because a
  // sax IS a bent tube of growing bore — placing the two edges by hand let the width drift and the
  // first attempt came out a fat hook wired to a blob. The bow's turn radius stays above the
  // half-width there, or the band crosses itself and even-odd detaches the bell.
  //
  // THE KEYWORK IS HOLES, and that is the whole icon. Five earlier attempts drew a solid silhouette
  // and each read as something else, because a filled bell on a tube is a boot; a hole is the one
  // interior detail that is really a change to the OUTLINE, so even-odd gives it for free. They sit
  // ON the spine so they are centred in the bore rather than hand-placed — a hand-placed hole ate
  // one wall of a six-pixel tube on the pass before this.
  { name: "saxophone", segs: function () {
      const SPINE = [
        [ -0.740,  -0.340,   0.105], [ -0.660,  -0.520,   0.107], [ -0.530,  -0.690,   0.110],
        [ -0.370,  -0.790,   0.114], [ -0.240,  -0.710,   0.118], [ -0.190,  -0.540,   0.122],
        [ -0.120,  -0.300,   0.127], [ -0.050,  -0.040,   0.133], [  0.030,   0.220,   0.140],
        [  0.120,   0.470,   0.150], [  0.240,   0.680,   0.162], [  0.440,   0.780,   0.178],
        [  0.600,   0.700,   0.200], [  0.680,   0.500,   0.235], [  0.720,   0.260,   0.285],
        [  0.745,   0.000,   0.345], [  0.755,  -0.280,   0.410],
      ];
      const HOLE_AT = [
        [  0.330,   0.060,   0.000], [  0.420,   0.062,   0.000], [  0.510,   0.064,   0.000],
        [  0.800,   0.082,  -0.100], [  0.900,   0.078,  -0.140],
      ];
      // The mouthpiece is DETACHED, as the reference has it, and it runs along the neck's own
      // axis at its free end rather than being parked nearby. It does not touch the outline,
      // so it unions instead of cancelling.
      const MOUTH = [[-0.859, -0.283], [-0.703, -0.214], [-0.809, -0.042], [-0.915, -0.089]];
      const at = function (a, i) { return a[Math.max(0, Math.min(a.length - 1, i))]; };
      const cr = function (pts) {
        const out = [];
        const f = function (p0, p1, p2, p3, t) {
          const t2 = t * t, t3 = t2 * t;
          return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        };
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = at(pts, i - 1), p1 = at(pts, i), p2 = at(pts, i + 1), p3 = at(pts, i + 2);
          for (let k = 0; k < 8; k++) {
            const t = k / 8;
            out.push([f(p0[0], p1[0], p2[0], p3[0], t), f(p0[1], p1[1], p2[1], p3[1], t),
                      f(p0[2], p1[2], p2[2], p3[2], t)]);
          }
        }
        return out.concat([pts[pts.length - 1]]);
      };
      const P = cr(SPINE), L = [], Rr = [];
      for (let i = 0; i < P.length; i++) {
        const a = at(P, i - 1), b = at(P, i + 1);
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const m = Math.hypot(tx, ty) || 1;
        tx /= m; ty /= m;
        L.push([P[i][0] - ty * P[i][2], P[i][1] + tx * P[i][2]]);
        Rr.push([P[i][0] + ty * P[i][2], P[i][1] - tx * P[i][2]]);
      }
      const edge = L.concat(Rr.reverse());
      // Fitted rather than hand-placed, so tuning the spine cannot walk the glyph off its box.
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      edge.concat(MOUTH).forEach(function (p) {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      });
      const k = 1.76 / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const T = function (p) { return [(p[0] - cx) * k, (p[1] - cy) * k]; };
      let segs = glyphPolySegs(edge.map(T)).concat(glyphPolySegs(MOUTH.map(T)));
      // [along the spine, radius, sideways offset]. The bell's keys sit toward the BODY rather
      // than up the bell's axis, which is where they are on the instrument and what stops them
      // reading as a row of portholes.
      HOLE_AT.forEach(function (h) {
        const i = Math.round(h[0] * (P.length - 1)), a = at(P, i - 1), b = at(P, i + 1);
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const m = Math.hypot(tx, ty) || 1;
        tx /= m; ty /= m;
        const c = T([P[i][0] - ty * (h[2] || 0), P[i][1] + tx * (h[2] || 0)]);
        segs = segs.concat(glyphCircleSegs(c[0], c[1], h[1] * k));
      });
      return segs;
    } },

  // DICE. A face-on die is a SQUARE and the pips are far too small to change that: measured, a
  // rounded square with five pip holes scores **0.931 against `stop`**, well over the 0.85 flag,
  // because IoU is computed on the filled mask and five little holes are about 5% of it. The
  // isometric route is taken too — `cube` already ships as an iso cube with its Y edges cut, so a
  // die drawn that way would collide with that instead. Both obvious drawings were built and
  // scored before either was believed.
  //
  // A TILT IS WHAT SEPARATES IT, AND IT HAS TO KEEP ITS CORNERS. At a generous corner radius the
  // tilted square rounds off into a blob and drifts toward `hexagon` (0.743); sharp corners at 15
  // degrees read unmistakably as a square off its axis and the worst neighbour falls to 0.697.
  //
  // THE FACE IS A CONTROL, which is what the parametric roster is for: a die showing the value
  // that was actually rolled is the thing a game UI wants, and `star`'s points and `cog`'s teeth
  // are the precedent. The pips are HOLES, so they cost nothing but even-odd.
  { name: "dice", slots: { face: 5 }, controls: [["face", "Face", 1, 6]],
    segs: function (rp) {
      const h = 0.74, r = 0.115, t = 0.26, pr = 0.118;
      const c = Math.cos(t), sn = Math.sin(t);
      const put = function (x, y) { return [x * c - y * sn, x * sn + y * c]; };
      const pts = [];
      [[h - r, h - r, 0], [-h + r, h - r, 1], [-h + r, -h + r, 2], [h - r, -h + r, 3]]
        .forEach(function (A) {
          for (let i = 0; i <= 7; i++) {
            const ang = (A[2] * Math.PI / 2) + (Math.PI / 2) * (i / 7);
            pts.push(put(A[0] + r * Math.cos(ang), A[1] + r * Math.sin(ang)));
          }
        });
      const LAY = {
        1: [[0, 0]],
        2: [[-1, -1], [1, 1]],
        3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
      };
      const n = Math.max(1, Math.min(6, Math.round(rp && rp.face != null ? rp.face : 5)));
      const d = h * 0.50;
      let segs = glyphPolySegs(pts);
      LAY[n].forEach(function (q) {
        const q2 = put(q[0] * d, q[1] * d);
        segs = segs.concat(glyphCircleSegs(q2[0], q2[1], n === 6 ? pr * 0.95 : pr));
      });
      return segs;
    } },

  // LIGHT BULB. The glass is the easy half and is also the half that collides — a disc on a stem is
  // `mushroom`, `trophy` or `balloon` depending on how the stem is drawn. What makes a bulb is the
  // SCREW BASE: a stepped cylinder with its thread cut as NOTCHES IN THE OUTLINE, which is the one
  // kind of interior detail that survives (the saxophone's finding, and `torii`'s before it).
  //
  // TRACED AS ONE OUTLINE, bulb and neck and base together. As separate subpaths the neck cancels
  // against the glass under even-odd and leaves a gap exactly where the bulb meets its collar —
  // the fault the rose's stem had.
  { name: "bulb", segs: function () {
      const R = 0.50, GY = -0.34, NW = 0.24, BW = 0.27;
      // The collar is where the glass meets the neck, so it is derived from the neck's width rather
      // than guessed: cos(theta) = NW / R gives the two points the envelope has to stop at.
      const th = Math.acos(NW / R);
      const yC = GY + R * Math.sin(th);
      const pts = [];
      // FROM THE LEFT COLLAR, OVER THE TOP, TO THE RIGHT COLLAR. Screen y runs DOWN, so increasing
      // angle from the left collar goes left, up, right — and sweeping the other way takes the arc
      // through the BOTTOM, which is where the neck is: the first build did exactly that and came
      // out as a bulb with a wedge sheared off its side.
      const a0 = Math.PI - th, a1 = th + 2 * Math.PI;
      for (let i = 0; i <= 60; i++) {
        const a = a0 + (a1 - a0) * (i / 60);
        pts.push([R * Math.cos(a), GY + R * Math.sin(a)]);
      }
      // ...then down the RIGHT of the neck and base, across the contact, and back up the LEFT, so
      // the walk continues where the arc left off. Each thread is a step IN and a step OUT — an
      // outline change, which is the one kind of interior detail that survives at size.
      const g = BW * 0.72;
      pts.push([NW, 0.16], [BW, 0.22],
               [BW, 0.30], [g, 0.34], [g, 0.40], [BW, 0.44],
               [BW, 0.52], [g, 0.56], [g, 0.62], [BW, 0.66],
               [BW, 0.70], [BW * 0.60, 0.80], [-BW * 0.60, 0.80], [-BW, 0.70],
               [-BW, 0.66], [-g, 0.62], [-g, 0.56], [-BW, 0.52],
               [-BW, 0.44], [-g, 0.40], [-g, 0.34], [-BW, 0.30],
               [-BW, 0.22], [-NW, 0.16]);
      return glyphPolySegs(pts);
    } },


  // JIGSAW PIECE. A square with pips collides with `stop` (the dice measured 0.931 there), and the
  // question was whether a square with KNOBS would do the same. It does not: a tab adds area
  // OUTSIDE the square and a socket removes it from inside, so the union grows while the
  // intersection shrinks and the worst neighbour is `speech` at 0.674. Built and scored before it
  // was believed, which is now the habit for anything rectangular.
  //
  // A KNOB IS A CIRCLE WHOSE CENTRE SITS OFF THE EDGE, and `d / r` IS the neck ratio: the neck is
  // 2*sqrt(r^2 - d^2) against a bulb of 2r, so at d = 0.6r the neck is 0.8 of the bulb and reads as
  // a BUMP rather than a tab. At 0.75r it is a jigsaw.
  //
  // TAB RIGHT, TAB BOTTOM, SOCKET TOP — three rather than four, and the aspect is why. A tab adds
  // its protrusion to one axis and a socket adds nothing, so a piece with one tab is half again as
  // wide as it is tall; one tab per axis squares it up. Four knobs was drawn and is busier at 30px
  // than it is convincing: its left socket bites the body back to a third of its width.
  { name: "puzzle", segs: function () {
      const B = 0.56, d = 0.15, r = 0.20, N = 22;
      const nk = Math.sqrt(r * r - d * d);
      const P = [[-B, -B]];
      // THE ARC IS CHOSEN BY WHERE IT MUST BULGE, never by a sign. Picking the sweep by adding or
      // subtracting a turn got the sockets backwards on the first build — one came out as a
      // hairline crack, because the arc went the long way round instead of into the body.
      const arc = function (cx, cy, s, e, through) {
        const norm = function (x) { return Math.atan2(Math.sin(x), Math.cos(x)); };
        let up = e - s;
        while (up < 0) up += 2 * Math.PI;
        const dn = up - 2 * Math.PI;
        const off = function (w) { return Math.abs(norm(s + w / 2 - through)); };
        const sweep = off(up) < off(dn) ? up : dn;
        for (let i = 0; i <= N; i++) {
          const t = s + sweep * (i / N);
          P.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
        }
      };
      const side = function (want, fixed, sgn, horiz) {
        if (!want) return;
        const out = want > 0;
        const c = fixed + sgn * (out ? d : -d);       // centre out of the body for a tab, in for a socket
        const ax = horiz ? c : 0, ay = horiz ? 0 : c;
        const p0 = horiz ? [fixed, -sgn * nk] : [sgn * nk, fixed];
        const p1 = horiz ? [fixed, sgn * nk] : [-sgn * nk, fixed];
        P.push(p0);
        const outward = horiz ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
        arc(ax, ay, Math.atan2(p0[1] - ay, p0[0] - ax), Math.atan2(p1[1] - ay, p1[0] - ax),
            out ? outward : outward + Math.PI);
        P.push(p1);
      };
      side(-1, -B, -1, false);                        // socket, top
      P.push([B, -B]);
      side(1, B, 1, true);                            // tab, right
      P.push([B, B]);
      side(1, B, 1, false);                           // tab, bottom
      P.push([-B, B]);
      // Fitted, so tuning a knob cannot walk the piece off its own box.
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      P.forEach(function (q) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
        y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      });
      const k = 1.74 / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      return glyphPolySegs(P.map(function (q) { return [(q[0] - cx) * k, (q[1] - cy) * k]; }));
    } },

  // PAINTER'S PALETTE. The board is an ellipse whose radius is pulled IN by a gaussian at one
  // angle, which is how the arm scoop is cut without hand-placing a concave run — a hand-placed
  // one kept meeting the thumb hole and opening it to the edge.
  //
  // THE THUMB HOLE IS THE WHOLE IDENTITY AND THE DABS ARE HOLES TOO. A board with no hole is
  // `blob`; the interior detail that survives at this size is the kind that changes the OUTLINE,
  // which is the saxophone's finding reused. Filled dabs are not available — an icon has one ink.
  //
  // TUNED AGAINST THE MASK RATHER THAN THE RENDER. At a gentle scoop (0.28) the outline came back
  // a plain oval and the notch was simply absent; at a scoop centred on the BOTTOM it read as a
  // kidney bean. Beside the thumb hole at 0.70pi it is a palette, which is also where a real one
  // has it. Worst neighbour 0.686 against a flag of 0.85.
  // A D-PAD, AND THE ROSTER HAD NOTHING DIRECTIONAL IN 54 INPUT GLYPHS (maintainer's, 2026-08-27).
  // Every `btn-*` is a face button, a shoulder or a label; "press up" had no mark at all.
  //
  // ONE PARAMETRIC DEF, NOT FIVE, which is the house style `arrow`, `dice` and `star` already set —
  // and it is what stops the set being five names to keep in step. It earns the `\u00b1` badge for
  // free, and `dir: "none"` is the neutral pad rather than a sixth drawing.
  //
  // THE INDICATED ARM IS SOLID AND THE REST ARE HOLLOW, which is how a real d-pad legend reads and
  // the only version an icon with ONE INK can say. It costs no second mechanism: the hole is the
  // same plus as the shell with that arm's reach collapsed into the hub, so the arm is simply what
  // even-odd does not cut. Worst neighbour `plusbold` at 0.650 — expected, since a d-pad IS a plus,
  // and the HOLLOW is what separates them.
  {
    name: "dpad", input: true, slots: { dir: "none" },
    controls: [["dir", "Direction", ["none", "right", "down", "left", "up"]]],
    segs: function (rp) {
      const W = 0.30, R = 0.90, T = 0.17, wi = W - T, Ri = R - T;
      // Clockwise from the up arm's top-left. `a` is the four reaches in [up, right, down, left].
      const plus = function (w, a) {
        return glyphPolySegs([[-w, -a[0]], [w, -a[0]], [w, -w], [a[1], -w], [a[1], w], [w, w],
                         [w, a[2]], [-w, a[2]], [-w, w], [-a[3], w], [-a[3], -w], [-w, -w]]);
      };
      const k = { up: 0, right: 1, down: 2, left: 3 }[rp.dir];
      const inner = [Ri, Ri, Ri, Ri];
      if (k !== undefined) inner[k] = wi;
      return plus(W, [R, R, R, R]).concat(plus(wi, inner));
    },
  },

  { name: "palette", segs: function () {
      const A = 0.92, B = 0.68, CY = -0.02;
      const BITE = 0.44, BANG = Math.PI * 0.70, BW = 0.40, N = 96;
      const P = [];
      for (let i = 0; i < N; i++) {
        const t = 2 * Math.PI * i / N;
        const d = Math.atan2(Math.sin(t - BANG), Math.cos(t - BANG));
        const k = 1 - BITE * Math.exp(-(d * d) / (2 * BW * BW));
        P.push([A * Math.cos(t) * k, CY + B * Math.sin(t) * k]);
      }
      // Thumb hole first, then the dabs — every one a separate subpath, so even-odd cuts them.
      return glyphPolySegs(P)
        .concat(glyphCircleSegs(-0.40, -0.16, 0.17))
        .concat(glyphCircleSegs(0.18, -0.32, 0.105))
        .concat(glyphCircleSegs(0.56, -0.04, 0.105))
        .concat(glyphCircleSegs(0.34, 0.32, 0.10));
    } },

  // Media transport, beside `play`/`pause`/`stop` in the System family (§11.8). See `glyphSeekSegs`.
  { name: "fastforward", system: true, segs: function () { return glyphSeekSegs(false); } },
  { name: "rewind", system: true, segs: function () { return glyphSeekSegs(true); } },

];

// THE SAXOPHONE WAS REJECTED ONCE AND THE REJECTION WAS MEASURED AT THE WRONG SIZE (2026-08-26).
// Five drawings each read as a different wrong thing — a cane, a hook with a wedge, a U with a
// flag, a U with a leaf, a boot — and the note written here concluded the shape had no agreed
// silhouette. It was judged at 30px, which is not a size anything ships at: `GLYPH_GRID` is 64,
// so every one of those attempts had less than half the room the icon actually gets. `tests/draw.js`
// defaulted to 30 and I took the tool's default for the ship size. A broken instrument, and it
// talked me out of a drawable glyph five times — the same shape of error as the `encodePNG` audit.

// ---- THE PORTED SHAPES: CrunchyVFX's particle shapes, as paths ------------------------------------------------------
//
// RECORDED, NOT TRANSCRIBED: CrunchyUI's tools/port-vfx-shapes.mjs called each of CrunchyVFX's `draw()` functions
// with a recording context (R = 1, so the coordinates are already the -1..1 box) and wrote the calls out as data,
// once (2026-08). VFX's `destination-out` cuts became extra loops in the same even-odd layer; a fill after a cut
// starts a new layer. VFX itself draws these natively and never needs this table; it is here so the roster is ONE
// list in ONE order, which is what makes an index mean the same glyph everywhere. Redraws in GLYPH_SHAPES and
// GLYPH_LATE take over a port's slot by reusing its name (`glyphRoster`); this data is never edited.
//
// APPEND ONLY, like every table here.
const GLYPH_PORTED = [
  { name: "shard", ops: [
    [["M",0,-0.969],["L",0.839,0.484],["L",-0.839,0.484],["Z"]],
  ] },
  { name: "diamond", ops: [
    [["M",0,-0.969],["L",0.969,0],["L",0,0.969],["L",-0.969,0],["Z"]],
  ] },
  { name: "crescent", ops: [
    [["M",-0.739,0.124],["L",-0.748,0.032],["L",-0.745,-0.053],["L",-0.733,-0.138],["L",-0.711,-0.222],["L",-0.68,-0.303],["L",-0.641,-0.38],["L",-0.593,-0.452],["L",-0.538,-0.518],["L",-0.476,-0.577],["L",-0.408,-0.628],["L",-0.334,-0.67],["L",-0.255,-0.703],["L",-0.172,-0.726],["L",-0.087,-0.74],["L",0,-0.745],["L",0.087,-0.74],["L",0.172,-0.726],["L",0.255,-0.703],["L",0.334,-0.67],["L",0.408,-0.628],["L",0.476,-0.577],["L",0.538,-0.518],["L",0.593,-0.452],["L",0.641,-0.38],["L",0.68,-0.303],["L",0.711,-0.222],["L",0.733,-0.138],["L",0.745,-0.053],["L",0.748,0.032],["L",0.739,0.124],["Z"],["M",0.958,0.145],["L",0.967,0.04],["L",0.965,-0.072],["L",0.949,-0.182],["L",0.921,-0.289],["L",0.881,-0.392],["L",0.831,-0.491],["L",0.77,-0.584],["L",0.699,-0.669],["L",0.618,-0.746],["L",0.528,-0.812],["L",0.43,-0.868],["L",0.327,-0.91],["L",0.22,-0.941],["L",0.111,-0.959],["L",0,-0.965],["L",-0.111,-0.959],["L",-0.22,-0.941],["L",-0.327,-0.91],["L",-0.43,-0.868],["L",-0.528,-0.812],["L",-0.618,-0.746],["L",-0.699,-0.669],["L",-0.77,-0.584],["L",-0.831,-0.491],["L",-0.881,-0.392],["L",-0.921,-0.289],["L",-0.949,-0.182],["L",-0.965,-0.072],["L",-0.967,0.04],["L",-0.958,0.145],["Z"]],
  ] },
  { name: "snowflake", ops: [
    [["M",0.045,0],["L",0.045,-0.937],["L",-0.045,-0.937],["L",-0.045,0],["Z"]],
    [["M",-0.027,-0.386],["L",0.086,-0.303],["L",0.139,-0.376],["L",0.027,-0.458],["Z"],["M",-0.027,-0.458],["L",-0.139,-0.376],["L",-0.086,-0.303],["L",0.027,-0.386],["Z"]],
    [["M",-0.027,-0.639],["L",0.086,-0.556],["L",0.139,-0.629],["L",0.027,-0.711],["Z"],["M",-0.027,-0.711],["L",-0.139,-0.629],["L",-0.086,-0.556],["L",0.027,-0.639],["Z"]],
    [["M",0.022,0.039],["L",0.834,-0.43],["L",0.789,-0.508],["L",-0.022,-0.039],["Z"]],
    [["M",0.321,-0.216],["L",0.305,-0.077],["L",0.395,-0.067],["L",0.41,-0.206],["Z"],["M",0.383,-0.252],["L",0.256,-0.308],["L",0.22,-0.226],["L",0.347,-0.17],["Z"]],
    [["M",0.54,-0.342],["L",0.525,-0.204],["L",0.614,-0.194],["L",0.629,-0.333],["Z"],["M",0.603,-0.379],["L",0.475,-0.435],["L",0.439,-0.352],["L",0.566,-0.296],["Z"]],
    [["M",-0.022,0.039],["L",0.789,0.508],["L",0.834,0.43],["L",0.022,-0.039],["Z"]],
    [["M",0.347,0.17],["L",0.22,0.226],["L",0.256,0.308],["L",0.383,0.252],["Z"],["M",0.41,0.206],["L",0.395,0.067],["L",0.305,0.077],["L",0.321,0.216],["Z"]],
    [["M",0.566,0.296],["L",0.439,0.352],["L",0.475,0.435],["L",0.603,0.379],["Z"],["M",0.629,0.333],["L",0.614,0.194],["L",0.525,0.204],["L",0.54,0.342],["Z"]],
    [["M",-0.045,0],["L",-0.045,0.938],["L",0.045,0.938],["L",0.045,0],["Z"]],
    [["M",0.027,0.386],["L",-0.086,0.303],["L",-0.139,0.376],["L",-0.027,0.458],["Z"],["M",0.027,0.458],["L",0.139,0.376],["L",0.086,0.303],["L",-0.027,0.386],["Z"]],
    [["M",0.027,0.639],["L",-0.086,0.556],["L",-0.139,0.629],["L",-0.027,0.711],["Z"],["M",0.027,0.711],["L",0.139,0.629],["L",0.086,0.556],["L",-0.027,0.639],["Z"]],
    [["M",-0.022,-0.039],["L",-0.834,0.43],["L",-0.789,0.508],["L",0.022,0.039],["Z"]],
    [["M",-0.321,0.216],["L",-0.305,0.077],["L",-0.395,0.067],["L",-0.41,0.206],["Z"],["M",-0.383,0.252],["L",-0.256,0.308],["L",-0.22,0.226],["L",-0.347,0.17],["Z"]],
    [["M",-0.54,0.342],["L",-0.525,0.204],["L",-0.614,0.194],["L",-0.629,0.333],["Z"],["M",-0.603,0.379],["L",-0.475,0.435],["L",-0.439,0.352],["L",-0.566,0.296],["Z"]],
    [["M",0.022,-0.039],["L",-0.789,-0.508],["L",-0.834,-0.43],["L",-0.022,0.039],["Z"]],
    [["M",-0.347,-0.17],["L",-0.22,-0.226],["L",-0.256,-0.308],["L",-0.383,-0.252],["Z"],["M",-0.41,-0.206],["L",-0.395,-0.067],["L",-0.305,-0.077],["L",-0.321,-0.216],["Z"]],
    [["M",-0.566,-0.296],["L",-0.439,-0.352],["L",-0.475,-0.435],["L",-0.603,-0.379],["Z"],["M",-0.629,-0.333],["L",-0.614,-0.194],["L",-0.525,-0.204],["L",-0.54,-0.342],["Z"]],
  ] },
  { name: "blob", ops: [
    [["M",0.852,0],["L",0.84,0.083],["L",0.836,0.166],["L",0.83,0.252],["L",0.812,0.337],["L",0.78,0.417],["L",0.736,0.492],["L",0.686,0.563],["L",0.635,0.635],["L",0.583,0.711],["L",0.525,0.786],["L",0.454,0.85],["L",0.369,0.891],["L",0.273,0.899],["L",0.174,0.877],["L",0.082,0.836],["L",0,0.798],["L",-0.077,0.781],["L",-0.158,0.792],["L",-0.25,0.825],["L",-0.356,0.86],["L",-0.466,0.873],["L",-0.566,0.847],["L",-0.639,0.778],["L",-0.679,0.679],["L",-0.693,0.568],["L",-0.695,0.465],["L",-0.706,0.377],["L",-0.737,0.305],["L",-0.79,0.24],["L",-0.853,0.17],["L",-0.908,0.089],["L",-0.94,0],["L",-0.943,-0.093],["L",-0.922,-0.183],["L",-0.885,-0.269],["L",-0.843,-0.349],["L",-0.8,-0.428],["L",-0.754,-0.504],["L",-0.699,-0.574],["L",-0.632,-0.632],["L",-0.554,-0.675],["L",-0.471,-0.704],["L",-0.39,-0.73],["L",-0.317,-0.765],["L",-0.247,-0.816],["L",-0.175,-0.881],["L",-0.093,-0.948],["L",0,-0.994],["L",0.099,-1.003],["L",0.192,-0.966],["L",0.27,-0.89],["L",0.33,-0.796],["L",0.378,-0.708],["L",0.43,-0.644],["L",0.498,-0.607],["L",0.588,-0.588],["L",0.693,-0.569],["L",0.795,-0.531],["L",0.875,-0.467],["L",0.918,-0.38],["L",0.925,-0.281],["L",0.905,-0.18],["L",0.876,-0.086],["L",0.852,0],["Z"]],
  ] },
  { name: "spiral", ops: [
    [["M",-0.008,0.059],["L",-0.003,0.06],["L",-0.005,0.059],["L",-0.006,0.058],["L",-0.006,0.058],["L",-0.005,0.059],["L",-0.004,0.062],["L",-0.004,0.067],["L",-0.005,0.073],["L",-0.008,0.081],["L",-0.014,0.089],["L",-0.022,0.098],["L",-0.032,0.106],["L",-0.045,0.113],["L",-0.061,0.118],["L",-0.079,0.121],["L",-0.099,0.121],["L",-0.121,0.117],["L",-0.143,0.11],["L",-0.166,0.099],["L",-0.188,0.084],["L",-0.208,0.064],["L",-0.227,0.041],["L",-0.243,0.013],["L",-0.255,-0.018],["L",-0.264,-0.052],["L",-0.267,-0.089],["L",-0.265,-0.127],["L",-0.258,-0.167],["L",-0.244,-0.207],["L",-0.225,-0.245],["L",-0.199,-0.283],["L",-0.167,-0.317],["L",-0.13,-0.348],["L",-0.087,-0.374],["L",-0.039,-0.395],["L",0.012,-0.41],["L",0.067,-0.418],["L",0.124,-0.418],["L",0.182,-0.41],["L",0.241,-0.394],["L",0.298,-0.37],["L",0.353,-0.337],["L",0.404,-0.297],["L",0.45,-0.248],["L",0.49,-0.192],["L",0.524,-0.13],["L",0.549,-0.063],["L",0.566,0.009],["L",0.573,0.085],["L",0.569,0.162],["L",0.555,0.24],["L",0.531,0.316],["L",0.495,0.391],["L",0.449,0.461],["L",0.393,0.526],["L",0.328,0.584],["L",0.254,0.634],["L",0.173,0.674],["L",0.085,0.704],["L",-0.008,0.722],["L",-0.103,0.727],["L",-0.201,0.72],["L",-0.298,0.7],["L",-0.393,0.667],["L",-0.484,0.62],["L",-0.57,0.561],["L",-0.649,0.489],["L",-0.718,0.407],["L",-0.777,0.315],["L",-0.824,0.214],["L",-0.858,0.107],["L",-0.878,-0.01],["L",-0.997,0.01],["L",-0.975,0.135],["L",-0.936,0.258],["L",-0.883,0.373],["L",-0.815,0.478],["L",-0.735,0.573],["L",-0.645,0.655],["L",-0.546,0.723],["L",-0.44,0.777],["L",-0.33,0.816],["L",-0.217,0.839],["L",-0.104,0.847],["L",0.008,0.841],["L",0.116,0.82],["L",0.218,0.785],["L",0.314,0.738],["L",0.401,0.679],["L",0.479,0.61],["L",0.545,0.533],["L",0.6,0.45],["L",0.642,0.361],["L",0.672,0.269],["L",0.688,0.175],["L",0.693,0.082],["L",0.684,-0.009],["L",0.664,-0.097],["L",0.633,-0.18],["L",0.592,-0.256],["L",0.542,-0.325],["L",0.485,-0.385],["L",0.421,-0.436],["L",0.352,-0.477],["L",0.28,-0.508],["L",0.206,-0.528],["L",0.132,-0.538],["L",0.059,-0.537],["L",-0.012,-0.527],["L",-0.08,-0.508],["L",-0.142,-0.481],["L",-0.199,-0.446],["L",-0.25,-0.404],["L",-0.293,-0.358],["L",-0.328,-0.307],["L",-0.355,-0.253],["L",-0.374,-0.198],["L",-0.384,-0.142],["L",-0.387,-0.086],["L",-0.382,-0.033],["L",-0.37,0.018],["L",-0.351,0.065],["L",-0.326,0.108],["L",-0.297,0.145],["L",-0.263,0.177],["L",-0.227,0.202],["L",-0.188,0.221],["L",-0.149,0.234],["L",-0.109,0.24],["L",-0.07,0.24],["L",-0.033,0.234],["L",0.001,0.223],["L",0.032,0.207],["L",0.059,0.187],["L",0.081,0.163],["L",0.098,0.136],["L",0.11,0.107],["L",0.115,0.078],["L",0.115,0.048],["L",0.108,0.02],["L",0.096,-0.006],["L",0.078,-0.028],["L",0.055,-0.045],["L",0.028,-0.056],["L",0.008,-0.059],["Z"]],
  ] },
  { name: "arrowhead", ops: [
    [["M",0,-0.969],["L",0.969,0.15],["L",0.34,0.15],["L",0.34,0.969],["L",-0.34,0.969],["L",-0.34,0.15],["L",-0.969,0.15],["Z"]],
  ] },
  { name: "gear", ops: [
    [["M",0.969,0],["L",0.665,0.276],["L",0.685,0.685],["L",0.276,0.665],["L",0,0.969],["L",-0.276,0.665],["L",-0.685,0.685],["L",-0.665,0.276],["L",-0.969,0],["L",-0.665,-0.276],["L",-0.685,-0.685],["L",-0.276,-0.665],["L",0,-0.969],["L",0.276,-0.665],["L",0.685,-0.685],["L",0.665,-0.276],["Z"],["M",0.28,0],["C",0.28,0.147,0.147,0.28,0,0.28],["C",-0.147,0.28,-0.28,0.147,-0.28,0],["C",-0.28,-0.147,-0.147,-0.28,0,-0.28],["C",0.147,-0.28,0.28,-0.147,0.28,0],["Z"]],
  ] },
  { name: "note", ops: [
    [["M",0.028,-0.88],["L",0.158,-0.88],["L",0.158,0.46],["L",0.028,0.46],["Z"]],
    [["M",0.158,-0.88],["Q",0.82,-0.5,0.34,-0.02],["Q",0.62,-0.46,0.158,-0.44],["Z"]],
    [["M",0.077,0.327],["C",0.127,0.469,-0.007,0.662,-0.204,0.732],["C",-0.401,0.801,-0.627,0.736,-0.677,0.593],["C",-0.727,0.451,-0.593,0.258,-0.396,0.188],["C",-0.199,0.119,0.027,0.184,0.077,0.327],["Z"]],
  ] },
  { name: "triangle", ops: [
    [["M",0,-0.969],["L",0.969,0.969],["L",-0.969,0.969],["Z"]],
  ] },
  { name: "plusbold", ops: [
    [["M",-0.32,-0.969],["L",0.32,-0.969],["L",0.32,0.969],["L",-0.32,0.969],["Z"]],
    [["M",-0.969,-0.32],["L",0.969,-0.32],["L",0.969,0.32],["L",-0.969,0.32],["Z"]],
  ] },
  { name: "bubble", ops: [
    [["M",0.824,-0.007],["L",0.813,0.126],["L",0.78,0.249],["L",0.728,0.366],["L",0.658,0.475],["L",0.573,0.573],["L",0.475,0.658],["L",0.366,0.728],["L",0.249,0.78],["L",0.126,0.813],["L",0,0.824],["L",-0.126,0.813],["L",-0.249,0.78],["L",-0.366,0.728],["L",-0.475,0.658],["L",-0.573,0.573],["L",-0.658,0.475],["L",-0.728,0.366],["L",-0.78,0.249],["L",-0.813,0.126],["L",-0.824,0],["L",-0.813,-0.126],["L",-0.78,-0.249],["L",-0.728,-0.366],["L",-0.658,-0.475],["L",-0.573,-0.573],["L",-0.475,-0.658],["L",-0.366,-0.728],["L",-0.249,-0.78],["L",-0.126,-0.813],["L",0,-0.824],["L",0.126,-0.813],["L",0.249,-0.78],["L",0.366,-0.728],["L",0.475,-0.658],["L",0.573,-0.573],["L",0.658,-0.475],["L",0.728,-0.366],["L",0.78,-0.249],["L",0.813,-0.126],["L",0.824,0.007],["Z"],["M",0.984,-0.007],["L",0.97,-0.154],["L",0.931,-0.302],["L",0.869,-0.442],["L",0.786,-0.571],["L",0.686,-0.686],["L",0.571,-0.786],["L",0.442,-0.869],["L",0.302,-0.931],["L",0.154,-0.97],["L",0,-0.984],["L",-0.154,-0.97],["L",-0.302,-0.931],["L",-0.442,-0.869],["L",-0.571,-0.786],["L",-0.686,-0.686],["L",-0.786,-0.571],["L",-0.869,-0.442],["L",-0.931,-0.302],["L",-0.97,-0.154],["L",-0.984,0],["L",-0.97,0.154],["L",-0.931,0.302],["L",-0.869,0.442],["L",-0.786,0.571],["L",-0.686,0.686],["L",-0.571,0.786],["L",-0.442,0.869],["L",-0.302,0.931],["L",-0.154,0.97],["L",0,0.984],["L",0.154,0.97],["L",0.302,0.931],["L",0.442,0.869],["L",0.571,0.786],["L",0.686,0.686],["L",0.786,0.571],["L",0.869,0.442],["L",0.931,0.302],["L",0.97,0.154],["L",0.984,0.007],["Z"]],
    [["M",-0.187,-0.509],["C",-0.143,-0.457,-0.176,-0.348,-0.256,-0.281],["C",-0.336,-0.213,-0.449,-0.199,-0.493,-0.251],["C",-0.537,-0.303,-0.504,-0.412,-0.424,-0.479],["C",-0.344,-0.547,-0.231,-0.561,-0.187,-0.509],["Z"]],
  ] },
  { name: "claw", ops: [
    [["M",-0.783,-0.772],["Q",-0.172,0.053,-0.096,1.044],["Q",-0.401,0.124,-0.783,-0.772],["Z"]],
    [["M",-0.286,-0.925],["Q",0.325,-0.1,0.401,0.89],["Q",0.096,-0.03,-0.286,-0.925],["Z"]],
    [["M",0.21,-1.079],["Q",0.822,-0.254,0.898,0.736],["Q",0.592,-0.183,0.21,-1.079],["Z"]],
  ] },
  { name: "feather", ops: [
    [["M",0.286,-0.925],["Q",0.622,0.088,-0.117,0.717],["Q",-0.334,0.911,-0.322,0.633],["Q",-0.55,-0.254,0.286,-0.925],["Z"],["M",0.204,-0.796],["L",-0.311,0.803],["L",-0.235,0.828],["L",0.28,-0.771],["Z"]],
  ] },
  { name: "rune", ops: [
    [["M",-0.095,-0.86],["L",-0.095,0.86],["L",0.095,0.86],["L",0.095,-0.86],["Z"],["M",0.049,-0.359],["L",0.649,-0.719],["L",0.551,-0.881],["L",-0.049,-0.521],["Z"],["M",0.049,0.019],["L",-0.551,-0.341],["L",-0.649,-0.179],["L",-0.049,0.181],["Z"],["M",-0.052,0.58],["L",0.468,0.92],["L",0.572,0.76],["L",0.052,0.42],["Z"]],
  ] },
  { name: "splash", ops: [
    [["M",-0.92,0.35],["Q",-0.69,-0.45,-0.46,0.35],["Q",-0.67,0.07,-0.46,0.35],["Q",-0.23,-0.87,0,0.35],["Q",-0.21,0.07,0,0.35],["Q",0.23,-0.45,0.46,0.35],["Q",0.25,0.07,0.46,0.35],["Q",0.69,-0.87,0.92,0.35],["Q",0.71,0.07,0.92,0.35],["L",-0.92,0.35],["Q",0,0.95,0.92,0.35],["Z"]],
  ] },
  { name: "comma", ops: [
    [["M",0.6,0.28],["C",0.6,0.594,0.314,0.88,0,0.88],["C",-0.314,0.88,-0.6,0.594,-0.6,0.28],["C",-0.6,-0.034,-0.314,-0.32,0,-0.32],["C",0.314,-0.32,0.6,-0.034,0.6,0.28],["Z"]],
    [["M",0.56,0.3],["Q",0.78,-0.66,-0.34,-0.9],["Q",0.26,-0.34,0.08,0.3],["Z"]],
  ] },
  { name: "starburst", ops: [
    [["M",-0.07,0],["L",0.07,0],["L",0,-0.969],["Z"]],
    [["M",-0.061,-0.035],["L",0.061,0.035],["L",0.252,-0.436],["Z"]],
    [["M",-0.035,-0.061],["L",0.035,0.061],["L",0.839,-0.484],["Z"]],
    [["M",0,-0.07],["L",0,0.07],["L",0.504,0],["Z"]],
    [["M",0.035,-0.061],["L",-0.035,0.061],["L",0.839,0.484],["Z"]],
    [["M",0.061,-0.035],["L",-0.061,0.035],["L",0.252,0.436],["Z"]],
    [["M",0.07,0],["L",-0.07,0],["L",0,0.969],["Z"]],
    [["M",0.061,0.035],["L",-0.061,-0.035],["L",-0.252,0.436],["Z"]],
    [["M",0.035,0.061],["L",-0.035,-0.061],["L",-0.839,0.484],["Z"]],
    [["M",0,0.07],["L",0,-0.07],["L",-0.504,0],["Z"]],
    [["M",-0.035,0.061],["L",0.035,-0.061],["L",-0.839,-0.484],["Z"]],
    [["M",-0.061,0.035],["L",0.061,-0.035],["L",-0.252,-0.436],["Z"]],
  ] },
  { name: "cloud", ops: [
    [["M",-0.24,0.22],["C",-0.24,0.398,-0.402,0.56,-0.58,0.56],["C",-0.758,0.56,-0.92,0.398,-0.92,0.22],["C",-0.92,0.042,-0.758,-0.12,-0.58,-0.12],["C",-0.402,-0.12,-0.24,0.042,-0.24,0.22],["Z"]],
    [["M",0.32,-0.3],["C",0.32,-0.049,0.091,0.18,-0.16,0.18],["C",-0.411,0.18,-0.64,-0.049,-0.64,-0.3],["C",-0.64,-0.551,-0.411,-0.78,-0.16,-0.78],["C",0.091,-0.78,0.32,-0.551,0.32,-0.3],["Z"]],
    [["M",0.74,0],["C",0.74,0.209,0.549,0.4,0.34,0.4],["C",0.131,0.4,-0.06,0.209,-0.06,0],["C",-0.06,-0.209,0.131,-0.4,0.34,-0.4],["C",0.549,-0.4,0.74,-0.209,0.74,0],["Z"]],
    [["M",1,0.26],["C",1,0.396,0.876,0.52,0.74,0.52],["C",0.604,0.52,0.48,0.396,0.48,0.26],["C",0.48,0.124,0.604,0,0.74,0],["C",0.876,0,1,0.124,1,0.26],["Z"]],
    [["M",-0.92,0.18],["L",0.92,0.18],["L",0.92,0.48],["L",-0.92,0.48],["Z"]],
  ] },
  { name: "butterfly", ops: [
    [["M",-0.071,-0.501],["C",0.064,-0.253,0.012,0.068,-0.181,0.174],["C",-0.374,0.279,-0.673,0.149,-0.809,-0.099],["C",-0.944,-0.347,-0.892,-0.668,-0.699,-0.774],["C",-0.506,-0.879,-0.207,-0.749,-0.071,-0.501],["Z"]],
    [["M",-0.084,0.537],["C",-0.161,0.72,-0.363,0.831,-0.508,0.77],["C",-0.653,0.709,-0.714,0.486,-0.636,0.303],["C",-0.559,0.12,-0.357,0.009,-0.212,0.07],["C",-0.067,0.131,-0.006,0.354,-0.084,0.537],["Z"]],
    [["M",0.809,-0.099],["C",0.673,0.149,0.374,0.279,0.181,0.174],["C",-0.012,0.068,-0.064,-0.253,0.071,-0.501],["C",0.207,-0.749,0.506,-0.879,0.699,-0.774],["C",0.892,-0.668,0.944,-0.347,0.809,-0.099],["Z"]],
    [["M",0.636,0.303],["C",0.714,0.486,0.653,0.709,0.508,0.77],["C",0.363,0.831,0.161,0.72,0.084,0.537],["C",0.006,0.354,0.067,0.131,0.212,0.07],["C",0.357,0.009,0.559,0.12,0.636,0.303],["Z"]],
    [["M",0.09,0],["C",0.09,0.346,0.047,0.66,0,0.66],["C",-0.047,0.66,-0.09,0.346,-0.09,0],["C",-0.09,-0.346,-0.047,-0.66,0,-0.66],["C",0.047,-0.66,0.09,-0.346,0.09,0],["Z"]],
  ] },
  { name: "shuriken", ops: [
    [["M",0.969,0],["Q",0.176,0.096,0,0.969],["L",0,0.969],["Q",-0.096,0.176,-0.969,0],["L",-0.969,0],["Q",-0.176,-0.096,0,-0.969],["L",0,-0.969],["Q",0.096,-0.176,0.969,0],["Z"],["M",0.16,0],["C",0.16,0.084,0.084,0.16,0,0.16],["C",-0.084,0.16,-0.16,0.084,-0.16,0],["C",-0.16,-0.084,-0.084,-0.16,0,-0.16],["C",0.084,-0.16,0.16,-0.084,0.16,0],["Z"]],
  ] },
  { name: "spike", ops: [
    [["M",0,-0.969],["Q",0.3,0.2,0.26,0.969],["L",-0.26,0.969],["Q",-0.3,0.2,0,-0.969],["Z"]],
  ] },
  { name: "wave", ops: [
    [["M",-0.864,0.207],["L",-0.712,0.054],["L",-0.592,0.019],["L",-0.449,0.043],["L",-0.271,0.119],["L",-0.074,0.231],["L",0.138,0.35],["L",0.365,0.446],["L",0.615,0.48],["L",0.872,0.4],["L",1.074,0.207],["L",0.864,-0.007],["L",0.712,0.146],["L",0.592,0.181],["L",0.449,0.157],["L",0.271,0.081],["L",0.074,-0.031],["L",-0.138,-0.15],["L",-0.365,-0.246],["L",-0.615,-0.28],["L",-0.872,-0.2],["L",-1.074,-0.007],["Z"]],
  ] },
  { name: "eye", ops: [
    [["M",-0.969,0],["Q",0,-0.9,0.969,0],["Q",0,0.9,-0.969,0],["Z"],["M",0.34,0],["C",0.34,0.178,0.178,0.34,0,0.34],["C",-0.178,0.34,-0.34,0.178,-0.34,0],["C",-0.34,-0.178,-0.178,-0.34,0,-0.34],["C",0.178,-0.34,0.34,-0.178,0.34,0],["Z"]],
    [["M",0.17,0],["C",0.17,0.089,0.089,0.17,0,0.17],["C",-0.089,0.17,-0.17,0.089,-0.17,0],["C",-0.17,-0.089,-0.089,-0.17,0,-0.17],["C",0.089,-0.17,0.17,-0.089,0.17,0],["Z"]],
  ] },
  { name: "mushroom", ops: [
    [["M",-0.969,0.1],["Q",-0.86,-0.9,0,-0.84],["Q",0.86,-0.9,0.969,0.1],["Z"]],
    [["M",-0.28,0.08],["Q",-0.22,0.82,-0.3,0.92],["L",0.3,0.92],["Q",0.22,0.82,0.28,0.08],["Z"]],
  ] },
  { name: "ribbon", ops: [
    [["M",0.39,-0.937],["L",0.495,-0.82],["L",0.478,-0.703],["L",0.357,-0.586],["L",0.483,-0.469],["L",0.491,-0.352],["L",0.378,-0.234],["L",0.175,-0.117],["L",-0.063,0],["L",-0.229,0.117],["L",-0.011,0.234],["L",0.225,0.352],["L",0.412,0.469],["L",0.5,0.586],["L",0.465,0.703],["L",0.382,0.82],["L",0.493,0.938],["L",-0.007,0.938],["L",0.215,0.82],["L",0.08,0.703],["L",-0.157,0.586],["L",-0.365,0.469],["L",-0.487,0.352],["L",-0.488,0.234],["L",-0.369,0.117],["L",-0.472,0],["L",-0.498,-0.117],["L",-0.402,-0.234],["L",-0.208,-0.352],["L",0.028,-0.469],["L",0.243,-0.586],["L",0.046,-0.703],["L",-0.192,-0.82],["L",-0.39,-0.937],["Z"]],
  ] },
  { name: "bone", ops: [
    [["M",-0.592,0.167],["L",0.461,-0.408],["L",0.592,-0.167],["L",-0.461,0.408],["Z"]],
    [["M",-0.381,0.032],["C",-0.319,0.147,-0.366,0.308,-0.481,0.371],["C",-0.596,0.434,-0.757,0.386,-0.82,0.271],["C",-0.883,0.157,-0.836,-0.005,-0.721,-0.068],["C",-0.606,-0.131,-0.444,-0.083,-0.381,0.032],["Z"]],
    [["M",-0.233,0.304],["C",-0.17,0.419,-0.218,0.58,-0.332,0.643],["C",-0.447,0.706,-0.609,0.658,-0.672,0.544],["C",-0.734,0.429,-0.687,0.267,-0.572,0.204],["C",-0.457,0.142,-0.296,0.189,-0.233,0.304],["Z"]],
    [["M",0.672,-0.544],["C",0.734,-0.429,0.687,-0.267,0.572,-0.204],["C",0.457,-0.142,0.296,-0.189,0.233,-0.304],["C",0.17,-0.419,0.218,-0.58,0.332,-0.643],["C",0.447,-0.706,0.609,-0.658,0.672,-0.544],["Z"]],
    [["M",0.82,-0.271],["C",0.883,-0.157,0.836,0.005,0.721,0.068],["C",0.606,0.131,0.444,0.083,0.381,-0.032],["C",0.319,-0.147,0.366,-0.308,0.481,-0.371],["C",0.596,-0.434,0.757,-0.386,0.82,-0.271],["Z"]],
  ] },
  { name: "paw", ops: [
    [["M",0.54,0.34],["C",0.54,0.57,0.283,0.78,0,0.78],["C",-0.283,0.78,-0.54,0.57,-0.54,0.34],["C",-0.54,0.11,-0.283,-0.1,0,-0.1],["C",0.283,-0.1,0.54,0.11,0.54,0.34],["Z"]],
    [["M",-0.424,-0.26],["C",-0.451,-0.127,-0.569,-0.024,-0.672,-0.045],["C",-0.774,-0.066,-0.843,-0.206,-0.816,-0.34],["C",-0.789,-0.473,-0.671,-0.576,-0.568,-0.555],["C",-0.466,-0.534,-0.397,-0.394,-0.424,-0.26],["Z"]],
    [["M",-0.04,-0.61],["C",-0.047,-0.474,-0.148,-0.355,-0.253,-0.36],["C",-0.358,-0.366,-0.447,-0.494,-0.44,-0.63],["C",-0.433,-0.766,-0.332,-0.885,-0.227,-0.88],["C",-0.122,-0.874,-0.033,-0.746,-0.04,-0.61],["Z"]],
    [["M",0.44,-0.63],["C",0.447,-0.494,0.358,-0.366,0.253,-0.36],["C",0.148,-0.355,0.047,-0.474,0.04,-0.61],["C",0.033,-0.746,0.122,-0.874,0.227,-0.88],["C",0.332,-0.885,0.433,-0.766,0.44,-0.63],["Z"]],
    [["M",0.816,-0.34],["C",0.843,-0.206,0.774,-0.066,0.672,-0.045],["C",0.569,-0.024,0.451,-0.127,0.424,-0.26],["C",0.397,-0.394,0.466,-0.534,0.568,-0.555],["C",0.671,-0.576,0.789,-0.473,0.816,-0.34],["Z"]],
  ] },
  { name: "ghost", ops: [
    [["M",-0.74,0.34],["L",-0.74,-0.12],["L",-0.74,-0.12],["C",-0.74,-0.507,-0.387,-0.86,0,-0.86],["C",0.387,-0.86,0.74,-0.507,0.74,-0.12],["Z"],["L",0.74,0.34],["Q",0.493,1.34,0.247,0.34],["Q",0,1.34,-0.247,0.34],["Q",-0.493,1.34,-0.74,0.34],["Z"],["M",-0.14,-0.2],["C",-0.14,-0.101,-0.207,-0.01,-0.28,-0.01],["C",-0.353,-0.01,-0.42,-0.101,-0.42,-0.2],["C",-0.42,-0.299,-0.353,-0.39,-0.28,-0.39],["C",-0.207,-0.39,-0.14,-0.299,-0.14,-0.2],["Z"],["M",0.42,-0.2],["C",0.42,-0.101,0.353,-0.01,0.28,-0.01],["C",0.207,-0.01,0.14,-0.101,0.14,-0.2],["C",0.14,-0.299,0.207,-0.39,0.28,-0.39],["C",0.353,-0.39,0.42,-0.299,0.42,-0.2],["Z"]],
  ] },
  { name: "wing", ops: [
    [["M",0.85,-0.18],["Q",-0.05,-0.98,-0.9,-0.13],["Q",-0.65,-0.165,-0.4,0.44],["Q",-0.135,0.17,0.13,0.54],["Q",0.365,0.16,0.6,0.42],["Q",0.725,-0.2,0.85,-0.18],["Z"]],
  ] },
  { name: "hourglass", ops: [
    [["M",-0.8,-0.94],["L",0.8,-0.94],["L",0.8,-0.78],["L",-0.8,-0.78],["Z"]],
    [["M",-0.8,0.78],["L",0.8,0.78],["L",0.8,0.94],["L",-0.8,0.94],["Z"]],
    [["M",-0.62,-0.78],["L",0.62,-0.78],["L",0.1,0],["L",0.62,0.78],["L",-0.62,0.78],["L",-0.1,0],["Z"]],
  ] },
  { name: "atom", ops: [
    [["M",0.86,-0.012],["L",0.851,0.033],["L",0.824,0.073],["L",0.774,0.116],["L",0.704,0.159],["L",0.616,0.2],["L",0.513,0.235],["L",0.397,0.264],["L",0.271,0.286],["L",0.138,0.3],["L",0,0.305],["L",-0.138,0.3],["L",-0.271,0.286],["L",-0.397,0.264],["L",-0.513,0.235],["L",-0.616,0.2],["L",-0.704,0.159],["L",-0.774,0.116],["L",-0.824,0.073],["L",-0.851,0.033],["L",-0.859,0],["L",-0.851,-0.033],["L",-0.824,-0.073],["L",-0.774,-0.116],["L",-0.704,-0.159],["L",-0.616,-0.2],["L",-0.513,-0.235],["L",-0.397,-0.264],["L",-0.271,-0.286],["L",-0.138,-0.3],["L",0,-0.305],["L",0.138,-0.3],["L",0.271,-0.286],["L",0.397,-0.264],["L",0.513,-0.235],["L",0.616,-0.2],["L",0.704,-0.159],["L",0.774,-0.116],["L",0.824,-0.073],["L",0.851,-0.033],["L",0.86,0.012],["Z"],["M",0.967,-0.012],["L",0.951,-0.078],["L",0.906,-0.147],["L",0.839,-0.205],["L",0.756,-0.257],["L",0.656,-0.302],["L",0.544,-0.34],["L",0.42,-0.372],["L",0.286,-0.395],["L",0.146,-0.41],["L",0,-0.415],["L",-0.146,-0.41],["L",-0.286,-0.395],["L",-0.42,-0.372],["L",-0.544,-0.34],["L",-0.656,-0.302],["L",-0.756,-0.257],["L",-0.839,-0.205],["L",-0.906,-0.147],["L",-0.951,-0.078],["L",-0.969,0],["L",-0.951,0.078],["L",-0.906,0.147],["L",-0.839,0.205],["L",-0.756,0.257],["L",-0.656,0.302],["L",-0.544,0.34],["L",-0.42,0.372],["L",-0.286,0.395],["L",-0.146,0.41],["L",0,0.415],["L",0.146,0.41],["L",0.286,0.395],["L",0.42,0.372],["L",0.544,0.34],["L",0.656,0.302],["L",0.756,0.257],["L",0.839,0.205],["L",0.906,0.147],["L",0.951,0.078],["L",0.967,0.012],["Z"]],
    [["M",0.441,0.739],["L",0.396,0.754],["L",0.349,0.75],["L",0.286,0.729],["L",0.214,0.69],["L",0.135,0.633],["L",0.053,0.561],["L",-0.03,0.476],["L",-0.112,0.378],["L",-0.191,0.27],["L",-0.264,0.153],["L",-0.329,0.031],["L",-0.383,-0.092],["L",-0.427,-0.212],["L",-0.46,-0.327],["L",-0.481,-0.434],["L",-0.49,-0.53],["L",-0.488,-0.612],["L",-0.475,-0.677],["L",-0.454,-0.72],["L",-0.429,-0.744],["L",-0.396,-0.754],["L",-0.349,-0.75],["L",-0.286,-0.729],["L",-0.214,-0.69],["L",-0.135,-0.633],["L",-0.053,-0.561],["L",0.03,-0.476],["L",0.112,-0.378],["L",0.191,-0.27],["L",0.264,-0.153],["L",0.329,-0.031],["L",0.383,0.092],["L",0.427,0.212],["L",0.46,0.327],["L",0.481,0.434],["L",0.49,0.53],["L",0.488,0.612],["L",0.475,0.677],["L",0.454,0.72],["L",0.42,0.751],["Z"],["M",0.494,0.832],["L",0.543,0.785],["L",0.58,0.711],["L",0.597,0.624],["L",0.6,0.526],["L",0.59,0.418],["L",0.567,0.301],["L",0.532,0.178],["L",0.485,0.05],["L",0.428,-0.079],["L",0.359,-0.208],["L",0.282,-0.331],["L",0.199,-0.446],["L",0.112,-0.549],["L",0.023,-0.641],["L",-0.067,-0.719],["L",-0.155,-0.783],["L",-0.242,-0.829],["L",-0.326,-0.858],["L",-0.408,-0.863],["L",-0.484,-0.839],["L",-0.543,-0.785],["L",-0.58,-0.711],["L",-0.597,-0.624],["L",-0.6,-0.526],["L",-0.59,-0.418],["L",-0.567,-0.301],["L",-0.532,-0.178],["L",-0.485,-0.05],["L",-0.428,0.079],["L",-0.359,0.208],["L",-0.282,0.331],["L",-0.199,0.446],["L",-0.112,0.549],["L",-0.023,0.641],["L",0.067,0.719],["L",0.155,0.783],["L",0.242,0.829],["L",0.326,0.858],["L",0.408,0.863],["L",0.473,0.844],["Z"]],
    [["M",-0.42,0.751],["L",-0.454,0.72],["L",-0.475,0.677],["L",-0.488,0.612],["L",-0.49,0.53],["L",-0.481,0.434],["L",-0.46,0.327],["L",-0.427,0.212],["L",-0.383,0.092],["L",-0.329,-0.031],["L",-0.264,-0.152],["L",-0.191,-0.27],["L",-0.112,-0.378],["L",-0.03,-0.476],["L",0.053,-0.561],["L",0.135,-0.633],["L",0.214,-0.69],["L",0.286,-0.729],["L",0.349,-0.75],["L",0.396,-0.754],["L",0.429,-0.744],["L",0.454,-0.72],["L",0.475,-0.677],["L",0.488,-0.612],["L",0.49,-0.53],["L",0.481,-0.434],["L",0.46,-0.327],["L",0.427,-0.212],["L",0.383,-0.092],["L",0.329,0.031],["L",0.264,0.152],["L",0.191,0.27],["L",0.112,0.378],["L",0.03,0.476],["L",-0.053,0.561],["L",-0.135,0.633],["L",-0.214,0.69],["L",-0.286,0.729],["L",-0.349,0.75],["L",-0.396,0.754],["L",-0.441,0.739],["Z"],["M",-0.473,0.844],["L",-0.408,0.863],["L",-0.326,0.858],["L",-0.242,0.829],["L",-0.155,0.783],["L",-0.067,0.719],["L",0.023,0.641],["L",0.112,0.549],["L",0.199,0.446],["L",0.282,0.331],["L",0.359,0.207],["L",0.428,0.079],["L",0.485,-0.05],["L",0.532,-0.178],["L",0.567,-0.301],["L",0.59,-0.418],["L",0.6,-0.526],["L",0.597,-0.624],["L",0.58,-0.711],["L",0.543,-0.785],["L",0.484,-0.839],["L",0.408,-0.863],["L",0.326,-0.858],["L",0.242,-0.829],["L",0.155,-0.783],["L",0.067,-0.719],["L",-0.023,-0.641],["L",-0.112,-0.549],["L",-0.199,-0.446],["L",-0.282,-0.331],["L",-0.359,-0.207],["L",-0.428,-0.079],["L",-0.485,0.05],["L",-0.532,0.178],["L",-0.567,0.301],["L",-0.59,0.418],["L",-0.6,0.526],["L",-0.597,0.624],["L",-0.58,0.711],["L",-0.543,0.785],["L",-0.494,0.832],["Z"]],
    [["M",0.24,0],["C",0.24,0.126,0.126,0.24,0,0.24],["C",-0.126,0.24,-0.24,0.126,-0.24,0],["C",-0.24,-0.126,-0.126,-0.24,0,-0.24],["C",0.126,-0.24,0.24,-0.126,0.24,0],["Z"]],
  ] },
  { name: "reticle", ops: [
    [["M",0.435,-0.006],["L",0.429,0.066],["L",0.412,0.131],["L",0.384,0.193],["L",0.347,0.25],["L",0.302,0.302],["L",0.25,0.347],["L",0.193,0.384],["L",0.131,0.412],["L",0.066,0.429],["L",0,0.435],["L",-0.066,0.429],["L",-0.131,0.412],["L",-0.193,0.384],["L",-0.25,0.347],["L",-0.302,0.302],["L",-0.347,0.25],["L",-0.384,0.193],["L",-0.412,0.131],["L",-0.429,0.066],["L",-0.435,0],["L",-0.429,-0.066],["L",-0.412,-0.131],["L",-0.384,-0.193],["L",-0.347,-0.25],["L",-0.302,-0.302],["L",-0.25,-0.347],["L",-0.193,-0.384],["L",-0.131,-0.412],["L",-0.066,-0.429],["L",0,-0.435],["L",0.066,-0.429],["L",0.131,-0.412],["L",0.193,-0.384],["L",0.25,-0.347],["L",0.302,-0.302],["L",0.347,-0.25],["L",0.384,-0.193],["L",0.412,-0.131],["L",0.429,-0.066],["L",0.435,0.006],["Z"],["M",0.565,-0.006],["L",0.557,-0.089],["L",0.534,-0.174],["L",0.499,-0.254],["L",0.451,-0.328],["L",0.394,-0.394],["L",0.328,-0.451],["L",0.254,-0.499],["L",0.174,-0.534],["L",0.089,-0.557],["L",0,-0.565],["L",-0.089,-0.557],["L",-0.174,-0.534],["L",-0.254,-0.499],["L",-0.328,-0.451],["L",-0.394,-0.394],["L",-0.451,-0.328],["L",-0.499,-0.254],["L",-0.534,-0.174],["L",-0.557,-0.089],["L",-0.565,0],["L",-0.557,0.089],["L",-0.534,0.174],["L",-0.499,0.254],["L",-0.451,0.328],["L",-0.394,0.394],["L",-0.328,0.451],["L",-0.254,0.499],["L",-0.174,0.534],["L",-0.089,0.557],["L",0,0.565],["L",0.089,0.557],["L",0.174,0.534],["L",0.254,0.499],["L",0.328,0.451],["L",0.394,0.394],["L",0.451,0.328],["L",0.499,0.254],["L",0.534,0.174],["L",0.557,0.089],["L",0.565,0.006],["Z"]],
    [["M",-0.904,0.065],["L",-0.66,0.065],["L",-0.66,-0.065],["L",-0.904,-0.065],["Z"],["M",-0.065,-0.904],["L",-0.065,-0.66],["L",0.065,-0.66],["L",0.065,-0.904],["Z"]],
    [["M",0.904,-0.065],["L",0.66,-0.065],["L",0.66,0.065],["L",0.904,0.065],["Z"],["M",0.065,0.904],["L",0.065,0.66],["L",-0.065,0.66],["L",-0.065,0.904],["Z"]],
    [["M",-0.839,-0.5],["L",-0.858,-0.858],["L",-0.5,-0.839],["L",-0.5,-0.969],["L",-0.95,-0.95],["L",-0.969,-0.5],["Z"]],
    [["M",-0.969,0.5],["L",-0.95,0.95],["L",-0.5,0.969],["L",-0.5,0.839],["L",-0.858,0.858],["L",-0.839,0.5],["Z"]],
    [["M",0.969,-0.5],["L",0.95,-0.95],["L",0.5,-0.969],["L",0.5,-0.839],["L",0.858,-0.858],["L",0.839,-0.5],["Z"]],
    [["M",0.839,0.5],["L",0.858,0.858],["L",0.5,0.839],["L",0.5,0.969],["L",0.95,0.95],["L",0.969,0.5],["Z"]],
    [["M",0.12,0],["C",0.12,0.063,0.063,0.12,0,0.12],["C",-0.063,0.12,-0.12,0.063,-0.12,0],["C",-0.12,-0.063,-0.063,-0.12,0,-0.12],["C",0.063,-0.12,0.12,-0.063,0.12,0],["Z"]],
  ] },
  { name: "cube", ops: [
    [["M",0,-0.95],["L",0.86,-0.48],["L",0.86,0.48],["L",0,0.95],["L",-0.86,0.48],["L",-0.86,-0.48],["Z"],["M",-0.877,-0.449],["L",0,0.035],["L",0.877,-0.449],["L",0.843,-0.511],["L",0,-0.035],["L",-0.843,-0.511],["Z"],["M",-0.035,0],["L",-0.035,0.95],["L",0.035,0.95],["L",0.035,0],["Z"]],
  ] },
  { name: "chain", ops: [
    [["M",-0.039,-0.465],["L",-0.005,-0.408],["L",0.019,-0.354],["L",0.036,-0.299],["L",0.046,-0.244],["L",0.049,-0.192],["L",0.045,-0.145],["L",0.036,-0.103],["L",0.022,-0.069],["L",0.004,-0.043],["L",-0.017,-0.025],["L",-0.042,-0.012],["L",-0.072,-0.005],["L",-0.109,-0.004],["L",-0.151,-0.01],["L",-0.197,-0.024],["L",-0.244,-0.046],["L",-0.291,-0.075],["L",-0.337,-0.11],["L",-0.378,-0.152],["L",-0.416,-0.2],["L",-0.447,-0.252],["L",-0.471,-0.307],["L",-0.488,-0.362],["L",-0.498,-0.416],["L",-0.501,-0.468],["L",-0.497,-0.516],["L",-0.488,-0.557],["L",-0.473,-0.591],["L",-0.455,-0.617],["L",-0.435,-0.636],["L",-0.41,-0.648],["L",-0.379,-0.655],["L",-0.343,-0.656],["L",-0.3,-0.65],["L",-0.255,-0.636],["L",-0.207,-0.615],["L",-0.16,-0.586],["L",-0.115,-0.55],["L",-0.073,-0.508],["L",-0.033,-0.455],["Z"],["M",0.109,-0.566],["L",0.062,-0.627],["L",0.005,-0.684],["L",-0.057,-0.733],["L",-0.123,-0.773],["L",-0.191,-0.804],["L",-0.261,-0.826],["L",-0.332,-0.836],["L",-0.403,-0.834],["L",-0.472,-0.817],["L",-0.536,-0.784],["L",-0.59,-0.736],["L",-0.631,-0.677],["L",-0.659,-0.612],["L",-0.675,-0.542],["L",-0.681,-0.469],["L",-0.676,-0.395],["L",-0.663,-0.319],["L",-0.639,-0.243],["L",-0.607,-0.169],["L",-0.564,-0.099],["L",-0.514,-0.034],["L",-0.457,0.024],["L",-0.395,0.073],["L",-0.329,0.113],["L",-0.261,0.144],["L",-0.191,0.165],["L",-0.12,0.176],["L",-0.049,0.173],["L",0.02,0.157],["L",0.085,0.124],["L",0.139,0.076],["L",0.179,0.017],["L",0.207,-0.048],["L",0.223,-0.118],["L",0.229,-0.191],["L",0.225,-0.266],["L",0.211,-0.341],["L",0.188,-0.417],["L",0.155,-0.491],["L",0.116,-0.557],["Z"]],
    [["M",0.413,0.196],["L",0.447,0.252],["L",0.471,0.307],["L",0.488,0.362],["L",0.498,0.416],["L",0.501,0.468],["L",0.497,0.516],["L",0.488,0.557],["L",0.473,0.591],["L",0.455,0.617],["L",0.435,0.636],["L",0.41,0.648],["L",0.379,0.655],["L",0.343,0.656],["L",0.3,0.65],["L",0.255,0.636],["L",0.207,0.615],["L",0.16,0.586],["L",0.115,0.55],["L",0.073,0.508],["L",0.036,0.46],["L",0.005,0.408],["L",-0.019,0.354],["L",-0.036,0.299],["L",-0.046,0.244],["L",-0.049,0.192],["L",-0.045,0.145],["L",-0.036,0.103],["L",-0.022,0.069],["L",-0.004,0.043],["L",0.017,0.025],["L",0.042,0.012],["L",0.072,0.005],["L",0.109,0.004],["L",0.151,0.01],["L",0.197,0.024],["L",0.244,0.046],["L",0.291,0.075],["L",0.337,0.11],["L",0.378,0.152],["L",0.419,0.205],["Z"],["M",0.561,0.094],["L",0.514,0.034],["L",0.457,-0.024],["L",0.395,-0.073],["L",0.329,-0.113],["L",0.261,-0.144],["L",0.191,-0.165],["L",0.12,-0.176],["L",0.049,-0.173],["L",-0.02,-0.157],["L",-0.085,-0.124],["L",-0.139,-0.076],["L",-0.179,-0.017],["L",-0.207,0.048],["L",-0.223,0.118],["L",-0.229,0.191],["L",-0.225,0.266],["L",-0.211,0.341],["L",-0.188,0.417],["L",-0.155,0.491],["L",-0.113,0.562],["L",-0.062,0.627],["L",-0.005,0.684],["L",0.057,0.733],["L",0.123,0.773],["L",0.191,0.804],["L",0.261,0.826],["L",0.332,0.836],["L",0.403,0.834],["L",0.472,0.817],["L",0.536,0.784],["L",0.59,0.736],["L",0.631,0.677],["L",0.659,0.612],["L",0.675,0.542],["L",0.681,0.469],["L",0.676,0.395],["L",0.663,0.319],["L",0.639,0.243],["L",0.607,0.169],["L",0.567,0.103],["Z"]],
  ] },
  { name: "sun", ops: [
    [["M",-0.13,-0.55],["L",0.13,-0.55],["L",0,-0.969],["Z"]],
    [["M",0.297,-0.481],["L",0.481,-0.297],["L",0.685,-0.685],["Z"]],
    [["M",0.55,-0.13],["L",0.55,0.13],["L",0.969,0],["Z"]],
    [["M",0.481,0.297],["L",0.297,0.481],["L",0.685,0.685],["Z"]],
    [["M",0.13,0.55],["L",-0.13,0.55],["L",0,0.969],["Z"]],
    [["M",-0.297,0.481],["L",-0.481,0.297],["L",-0.685,0.685],["Z"]],
    [["M",-0.55,0.13],["L",-0.55,-0.13],["L",-0.969,0],["Z"]],
    [["M",-0.481,-0.297],["L",-0.297,-0.481],["L",-0.685,-0.685],["Z"]],
    [["M",0.5,0],["C",0.5,0.262,0.262,0.5,0,0.5],["C",-0.262,0.5,-0.5,0.262,-0.5,0],["C",-0.5,-0.262,-0.262,-0.5,0,-0.5],["C",0.262,-0.5,0.5,-0.262,0.5,0],["Z"]],
  ] },
  { name: "clover", ops: [
    [["M",0.552,0.452],["C",0.396,0.607,0.133,0.627,0,0.494],["C",-0.133,0.361,-0.113,0.098,0.042,-0.058],["C",0.198,-0.213,0.461,-0.233,0.594,-0.1],["C",0.727,0.033,0.707,0.296,0.552,0.452],["Z"],["M",0,-0.06],["L",0.95,-0.06],["L",0.95,-0.14],["L",0,-0.14],["Z"],["M",-0.04,-0.1],["L",-0.04,0.85],["L",0.04,0.85],["L",0.04,-0.1],["Z"],["M",0,-0.14],["L",-0.95,-0.14],["L",-0.95,-0.06],["L",0,-0.06],["Z"],["M",0.04,-0.1],["L",0.04,-1.05],["L",-0.04,-1.05],["L",-0.04,-0.1],["Z"]],
    [["M",-0.552,0.452],["C",-0.707,0.296,-0.727,0.033,-0.594,-0.1],["C",-0.461,-0.233,-0.198,-0.213,-0.042,-0.058],["C",0.113,0.098,0.133,0.361,0,0.494],["C",-0.133,0.627,-0.396,0.607,-0.552,0.452],["Z"],["M",0,-0.06],["L",0.95,-0.06],["L",0.95,-0.14],["L",0,-0.14],["Z"],["M",-0.04,-0.1],["L",-0.04,0.85],["L",0.04,0.85],["L",0.04,-0.1],["Z"],["M",0,-0.14],["L",-0.95,-0.14],["L",-0.95,-0.06],["L",0,-0.06],["Z"],["M",0.04,-0.1],["L",0.04,-1.05],["L",-0.04,-1.05],["L",-0.04,-0.1],["Z"]],
    [["M",-0.552,-0.652],["C",-0.396,-0.807,-0.133,-0.827,0,-0.694],["C",0.133,-0.561,0.113,-0.298,-0.042,-0.142],["C",-0.198,0.013,-0.461,0.033,-0.594,-0.1],["C",-0.727,-0.233,-0.707,-0.496,-0.552,-0.652],["Z"],["M",0,-0.06],["L",0.95,-0.06],["L",0.95,-0.14],["L",0,-0.14],["Z"],["M",-0.04,-0.1],["L",-0.04,0.85],["L",0.04,0.85],["L",0.04,-0.1],["Z"],["M",0,-0.14],["L",-0.95,-0.14],["L",-0.95,-0.06],["L",0,-0.06],["Z"],["M",0.04,-0.1],["L",0.04,-1.05],["L",-0.04,-1.05],["L",-0.04,-0.1],["Z"]],
    [["M",0.552,-0.652],["C",0.707,-0.496,0.727,-0.233,0.594,-0.1],["C",0.461,0.033,0.198,0.013,0.042,-0.142],["C",-0.113,-0.298,-0.133,-0.561,0,-0.694],["C",0.133,-0.827,0.396,-0.807,0.552,-0.652],["Z"],["M",0,-0.06],["L",0.95,-0.06],["L",0.95,-0.14],["L",0,-0.14],["Z"],["M",-0.04,-0.1],["L",-0.04,0.85],["L",0.04,0.85],["L",0.04,-0.1],["Z"],["M",0,-0.14],["L",-0.95,-0.14],["L",-0.95,-0.06],["L",0,-0.06],["Z"],["M",0.04,-0.1],["L",0.04,-1.05],["L",-0.04,-1.05],["L",-0.04,-0.1],["Z"]],
    [["M",-0.045,0.422],["L",-0.016,0.48],["L",0.007,0.532],["L",0.024,0.581],["L",0.036,0.627],["L",0.043,0.668],["L",0.045,0.706],["L",0.042,0.739],["L",0.035,0.769],["L",0.025,0.796],["L",0.007,0.824],["L",0.093,0.876],["L",0.114,0.841],["L",0.131,0.799],["L",0.141,0.754],["L",0.145,0.706],["L",0.142,0.657],["L",0.134,0.605],["L",0.119,0.552],["L",0.1,0.496],["L",0.075,0.437],["L",0.045,0.378],["Z"]],
  ] },
  { name: "bird", ops: [
    [["M",-0.867,0.318],["L",-0.781,0.157],["L",-0.697,0.032],["L",-0.615,-0.06],["L",-0.537,-0.12],["L",-0.465,-0.15],["L",-0.397,-0.155],["L",-0.325,-0.137],["L",-0.245,-0.091],["L",-0.157,-0.013],["L",0,0.13],["L",0.157,-0.013],["L",0.245,-0.091],["L",0.325,-0.137],["L",0.397,-0.155],["L",0.465,-0.15],["L",0.537,-0.12],["L",0.615,-0.06],["L",0.697,0.032],["L",0.781,0.157],["L",0.867,0.318],["L",1.008,0.242],["L",0.918,0.075],["L",0.823,-0.066],["L",0.724,-0.177],["L",0.618,-0.258],["L",0.503,-0.305],["L",0.383,-0.314],["L",0.264,-0.285],["L",0.15,-0.22],["L",0.042,-0.124],["L",0,-0.03],["L",-0.042,-0.124],["L",-0.15,-0.22],["L",-0.264,-0.285],["L",-0.383,-0.314],["L",-0.503,-0.305],["L",-0.618,-0.258],["L",-0.724,-0.177],["L",-0.823,-0.066],["L",-0.918,0.075],["L",-1.008,0.242],["Z"]],
  ] },
  { name: "bomb", ops: [
    [["M",0.62,0.33],["C",0.62,0.655,0.325,0.95,0,0.95],["C",-0.325,0.95,-0.62,0.655,-0.62,0.33],["C",-0.62,0.005,-0.325,-0.29,0,-0.29],["C",0.325,-0.29,0.62,0.005,0.62,0.33],["Z"]],
    [["M",-0.18,-0.5],["L",0.18,-0.5],["L",0.18,-0.26],["L",-0.18,-0.26],["Z"]],
    [["M",0.01,-0.451],["L",0.114,-0.472],["L",0.206,-0.495],["L",0.284,-0.52],["L",0.35,-0.548],["L",0.404,-0.579],["L",0.446,-0.616],["L",0.474,-0.661],["L",0.482,-0.714],["L",0.468,-0.766],["L",0.442,-0.807],["L",0.358,-0.753],["L",0.378,-0.724],["L",0.382,-0.708],["L",0.38,-0.697],["L",0.37,-0.682],["L",0.346,-0.661],["L",0.306,-0.638],["L",0.25,-0.614],["L",0.178,-0.591],["L",0.092,-0.57],["L",-0.01,-0.549],["Z"]],
    [["M",0.53,-0.78],["C",0.53,-0.712,0.468,-0.65,0.4,-0.65],["C",0.332,-0.65,0.27,-0.712,0.27,-0.78],["C",0.27,-0.848,0.332,-0.91,0.4,-0.91],["C",0.468,-0.91,0.53,-0.848,0.53,-0.78],["Z"]],
  ] },
  { name: "magnet", ops: [
    [["M",-0.421,-0.026],["L",-0.414,-0.102],["L",-0.398,-0.164],["L",-0.371,-0.223],["L",-0.335,-0.28],["L",-0.291,-0.331],["L",-0.24,-0.375],["L",-0.183,-0.411],["L",-0.124,-0.438],["L",-0.062,-0.454],["L",0,-0.46],["L",0.062,-0.454],["L",0.124,-0.438],["L",0.183,-0.411],["L",0.24,-0.375],["L",0.291,-0.331],["L",0.335,-0.28],["L",0.371,-0.223],["L",0.398,-0.164],["L",0.414,-0.102],["L",0.421,-0.026],["Z"],["M",0.739,-0.054],["L",0.73,-0.158],["L",0.7,-0.27],["L",0.653,-0.375],["L",0.591,-0.471],["L",0.517,-0.557],["L",0.431,-0.631],["L",0.335,-0.693],["L",0.23,-0.74],["L",0.118,-0.77],["L",0,-0.78],["L",-0.118,-0.77],["L",-0.23,-0.74],["L",-0.335,-0.693],["L",-0.431,-0.631],["L",-0.517,-0.557],["L",-0.591,-0.471],["L",-0.653,-0.375],["L",-0.7,-0.27],["L",-0.73,-0.158],["L",-0.739,-0.054],["Z"]],
    [["M",-0.74,-0.04],["L",-0.42,-0.04],["L",-0.42,0.76],["L",-0.74,0.76],["Z"],["M",-0.74,0.48],["L",-0.42,0.48],["L",-0.42,0.57],["L",-0.74,0.57],["Z"]],
    [["M",0.42,-0.04],["L",0.74,-0.04],["L",0.74,0.76],["L",0.42,0.76],["Z"],["M",0.42,0.48],["L",0.74,0.48],["L",0.74,0.57],["L",0.42,0.57],["Z"]],
  ] },
  { name: "hazard", ops: [
    [["M",0,0],["L",-0.481,-0.841],["C",-0.19,-1.008,0.19,-1.008,0.481,-0.841],["Z"],["Z"],["M",0.3,0],["C",0.3,0.157,0.157,0.3,0,0.3],["C",-0.157,0.3,-0.3,0.157,-0.3,0],["C",-0.3,-0.157,-0.157,-0.3,0,-0.3],["C",0.157,-0.3,0.3,-0.157,0.3,0],["Z"]],
    [["M",0,0],["L",0.969,0.003],["C",0.968,0.339,0.778,0.668,0.487,0.837],["Z"],["Z"],["M",0.3,0],["C",0.3,0.157,0.157,0.3,0,0.3],["C",-0.157,0.3,-0.3,0.157,-0.3,0],["C",-0.3,-0.157,-0.157,-0.3,0,-0.3],["C",0.157,-0.3,0.3,-0.157,0.3,0],["Z"]],
    [["M",0,0],["L",-0.487,0.837],["C",-0.778,0.668,-0.968,0.339,-0.969,0.003],["Z"],["Z"],["M",0.3,0],["C",0.3,0.157,0.157,0.3,0,0.3],["C",-0.157,0.3,-0.3,0.157,-0.3,0],["C",-0.3,-0.157,-0.157,-0.3,0,-0.3],["C",0.157,-0.3,0.3,-0.157,0.3,0],["Z"]],
    [["M",0.17,0],["C",0.17,0.089,0.089,0.17,0,0.17],["C",-0.089,0.17,-0.17,0.089,-0.17,0],["C",-0.17,-0.089,-0.089,-0.17,0,-0.17],["C",0.089,-0.17,0.17,-0.089,0.17,0],["Z"]],
  ] },
  { name: "pentagram", ops: [
    [["M",-0.048,-0.701],["L",0.392,0.539],["L",-0.634,-0.206],["L",0.634,-0.206],["L",-0.392,0.539],["L",0.048,-0.701],["Z"],["M",-0.048,-0.732],["L",-0.451,0.62],["L",0.729,-0.237],["L",-0.729,-0.237],["L",0.451,0.62],["L",0.048,-0.732],["Z"]],
    [["M",0.869,-0.004],["L",0.857,0.134],["L",0.822,0.264],["L",0.767,0.387],["L",0.694,0.501],["L",0.604,0.604],["L",0.501,0.694],["L",0.387,0.767],["L",0.264,0.822],["L",0.134,0.857],["L",0,0.869],["L",-0.134,0.857],["L",-0.264,0.822],["L",-0.387,0.767],["L",-0.501,0.694],["L",-0.604,0.604],["L",-0.694,0.501],["L",-0.767,0.387],["L",-0.822,0.264],["L",-0.857,0.134],["L",-0.869,0],["L",-0.857,-0.134],["L",-0.822,-0.264],["L",-0.767,-0.387],["L",-0.694,-0.501],["L",-0.604,-0.604],["L",-0.501,-0.694],["L",-0.387,-0.767],["L",-0.264,-0.822],["L",-0.134,-0.857],["L",0,-0.869],["L",0.134,-0.857],["L",0.264,-0.822],["L",0.387,-0.767],["L",0.501,-0.694],["L",0.604,-0.604],["L",0.694,-0.501],["L",0.767,-0.387],["L",0.822,-0.264],["L",0.857,-0.134],["L",0.869,0.004],["Z"],["M",0.969,-0.004],["L",0.955,-0.151],["L",0.917,-0.297],["L",0.855,-0.434],["L",0.774,-0.561],["L",0.675,-0.675],["L",0.561,-0.774],["L",0.434,-0.855],["L",0.297,-0.917],["L",0.151,-0.955],["L",0,-0.969],["L",-0.151,-0.955],["L",-0.297,-0.917],["L",-0.434,-0.855],["L",-0.561,-0.774],["L",-0.675,-0.675],["L",-0.774,-0.561],["L",-0.855,-0.434],["L",-0.917,-0.297],["L",-0.955,-0.151],["L",-0.969,0],["L",-0.955,0.151],["L",-0.917,0.297],["L",-0.855,0.434],["L",-0.774,0.561],["L",-0.675,0.675],["L",-0.561,0.774],["L",-0.434,0.855],["L",-0.297,0.917],["L",-0.151,0.955],["L",0,0.969],["L",0.151,0.955],["L",0.297,0.917],["L",0.434,0.855],["L",0.561,0.774],["L",0.675,0.675],["L",0.774,0.561],["L",0.855,0.434],["L",0.917,0.297],["L",0.955,0.151],["L",0.969,0.004],["Z"]],
  ] },
  { name: "planet", ops: [
    [["M",0.532,-0.176],["C",0.624,0.102,0.454,0.439,0.176,0.532],["C",-0.102,0.624,-0.439,0.454,-0.532,0.176],["C",-0.624,-0.102,-0.454,-0.439,-0.176,-0.532],["C",0.102,-0.624,0.439,-0.454,0.532,-0.176],["Z"]],
    [["M",0.79,-0.277],["L",0.795,-0.237],["L",0.782,-0.197],["L",0.75,-0.145],["L",0.698,-0.085],["L",0.628,-0.023],["L",0.543,0.04],["L",0.444,0.102],["L",0.333,0.161],["L",0.214,0.214],["L",0.087,0.261],["L",-0.043,0.299],["L",-0.172,0.328],["L",-0.295,0.347],["L",-0.411,0.357],["L",-0.518,0.357],["L",-0.611,0.348],["L",-0.688,0.332],["L",-0.745,0.309],["L",-0.779,0.285],["L",-0.793,0.263],["L",-0.795,0.237],["L",-0.782,0.197],["L",-0.75,0.145],["L",-0.698,0.085],["L",-0.628,0.023],["L",-0.543,-0.04],["L",-0.444,-0.102],["L",-0.333,-0.161],["L",-0.214,-0.214],["L",-0.087,-0.261],["L",0.043,-0.299],["L",0.172,-0.328],["L",0.295,-0.347],["L",0.411,-0.357],["L",0.518,-0.357],["L",0.611,-0.348],["L",0.688,-0.332],["L",0.745,-0.309],["L",0.779,-0.285],["L",0.799,-0.249],["Z"],["M",0.91,-0.317],["L",0.873,-0.374],["L",0.807,-0.423],["L",0.725,-0.456],["L",0.63,-0.477],["L",0.523,-0.487],["L",0.406,-0.486],["L",0.28,-0.476],["L",0.147,-0.456],["L",0.011,-0.425],["L",-0.127,-0.384],["L",-0.263,-0.335],["L",-0.39,-0.277],["L",-0.509,-0.215],["L",-0.616,-0.148],["L",-0.71,-0.078],["L",-0.79,-0.006],["L",-0.854,0.067],["L",-0.9,0.142],["L",-0.924,0.222],["L",-0.916,0.304],["L",-0.873,0.374],["L",-0.807,0.423],["L",-0.725,0.456],["L",-0.63,0.477],["L",-0.523,0.487],["L",-0.406,0.486],["L",-0.28,0.476],["L",-0.147,0.456],["L",-0.011,0.425],["L",0.127,0.384],["L",0.263,0.335],["L",0.39,0.277],["L",0.509,0.215],["L",0.616,0.148],["L",0.71,0.078],["L",0.79,0.006],["L",0.854,-0.067],["L",0.9,-0.142],["L",0.924,-0.222],["L",0.919,-0.289],["Z"]],
  ] },
  { name: "tornado", ops: [
    [["M",-0.969,-0.86],["Q",-0.2,-0.2,-0.2,0.9],["L",0.12,0.9],["Q",0.2,-0.3,0.969,-0.86],["Z"],["M",-0.732,-0.457],["L",-0.587,-0.417],["L",-0.44,-0.385],["L",-0.293,-0.363],["L",-0.147,-0.349],["L",0,-0.345],["L",0.147,-0.349],["L",0.293,-0.363],["L",0.44,-0.385],["L",0.587,-0.417],["L",0.732,-0.457],["L",0.708,-0.543],["L",0.565,-0.504],["L",0.424,-0.474],["L",0.283,-0.452],["L",0.141,-0.439],["L",0,-0.435],["L",-0.141,-0.439],["L",-0.283,-0.452],["L",-0.424,-0.474],["L",-0.565,-0.504],["L",-0.708,-0.543],["Z"],["M",-0.517,-0.008],["L",-0.415,0.032],["L",-0.311,0.064],["L",-0.208,0.087],["L",-0.104,0.1],["L",0,0.105],["L",0.104,0.1],["L",0.208,0.087],["L",0.311,0.064],["L",0.415,0.032],["L",0.517,-0.008],["L",0.483,-0.092],["L",0.385,-0.053],["L",0.289,-0.023],["L",0.192,-0.002],["L",0.096,0.011],["L",0,0.015],["L",-0.096,0.011],["L",-0.192,-0.002],["L",-0.289,-0.023],["L",-0.385,-0.053],["L",-0.483,-0.092],["Z"],["M",-0.306,0.437],["L",-0.248,0.478],["L",-0.187,0.511],["L",-0.125,0.535],["L",-0.063,0.55],["L",0,0.555],["L",0.063,0.55],["L",0.125,0.535],["L",0.187,0.511],["L",0.248,0.478],["L",0.306,0.437],["L",0.254,0.363],["L",0.2,0.402],["L",0.149,0.43],["L",0.099,0.449],["L",0.049,0.461],["L",0,0.465],["L",-0.049,0.461],["L",-0.099,0.449],["L",-0.149,0.43],["L",-0.2,0.402],["L",-0.254,0.363],["Z"]],
  ] },
  { name: "scroll", ops: [
    [["M",-0.62,-0.72],["L",0.62,-0.72],["L",0.62,0.72],["L",-0.62,0.72],["Z"],["M",-0.34,-0.295],["L",0.34,-0.295],["L",0.34,-0.385],["L",-0.34,-0.385],["Z"],["M",-0.34,0.045],["L",0.34,0.045],["L",0.34,-0.045],["L",-0.34,-0.045],["Z"],["M",-0.34,0.385],["L",0.34,0.385],["L",0.34,0.295],["L",-0.34,0.295],["Z"]],
    [["M",-0.36,0],["C",-0.36,0.471,-0.484,0.9,-0.62,0.9],["C",-0.756,0.9,-0.88,0.471,-0.88,0],["C",-0.88,-0.471,-0.756,-0.9,-0.62,-0.9],["C",-0.484,-0.9,-0.36,-0.471,-0.36,0],["Z"]],
    [["M",0.88,0],["C",0.88,0.471,0.756,0.9,0.62,0.9],["C",0.484,0.9,0.36,0.471,0.36,0],["C",0.36,-0.471,0.484,-0.9,0.62,-0.9],["C",0.756,-0.9,0.88,-0.471,0.88,0],["Z"]],
  ] },
  { name: "sprout", ops: [
    [["M",0.065,0.95],["L",0.065,-0.4],["L",-0.065,-0.4],["L",-0.065,0.95],["Z"]],
    [["M",0,-0.02],["Q",-0.98,-0.34,-0.58,-0.9],["Q",-0.34,-0.42,0,-0.02],["Z"]],
    [["M",0,-0.02],["Q",0.98,-0.34,0.58,-0.9],["Q",0.34,-0.42,0,-0.02],["Z"]],
  ] },
  { name: "padlock", ops: [
    [["M",-0.32,-0.271],["L",-0.316,-0.328],["L",-0.303,-0.375],["L",-0.283,-0.42],["L",-0.255,-0.463],["L",-0.222,-0.502],["L",-0.183,-0.535],["L",-0.14,-0.563],["L",-0.095,-0.583],["L",-0.048,-0.596],["L",0,-0.6],["L",0.048,-0.596],["L",0.095,-0.583],["L",0.14,-0.563],["L",0.183,-0.535],["L",0.222,-0.502],["L",0.255,-0.463],["L",0.283,-0.42],["L",0.303,-0.375],["L",0.316,-0.328],["L",0.32,-0.271],["Z"],["M",0.52,-0.289],["L",0.513,-0.363],["L",0.492,-0.441],["L",0.459,-0.515],["L",0.416,-0.583],["L",0.363,-0.643],["L",0.303,-0.696],["L",0.235,-0.739],["L",0.161,-0.772],["L",0.083,-0.793],["L",0,-0.8],["L",-0.083,-0.793],["L",-0.161,-0.772],["L",-0.235,-0.739],["L",-0.303,-0.696],["L",-0.363,-0.643],["L",-0.416,-0.583],["L",-0.459,-0.515],["L",-0.492,-0.441],["L",-0.513,-0.363],["L",-0.52,-0.289],["Z"]],
    [["M",-0.7,-0.28],["L",0.7,-0.28],["L",0.7,0.78],["L",-0.7,0.78],["Z"],["M",0.16,0.18],["C",0.16,0.264,0.084,0.34,0,0.34],["C",-0.084,0.34,-0.16,0.264,-0.16,0.18],["C",-0.16,0.096,-0.084,0.02,0,0.02],["C",0.084,0.02,0.16,0.096,0.16,0.18],["Z"],["M",-0.07,0.18],["L",0.07,0.18],["L",0.07,0.52],["L",-0.07,0.52],["Z"]],
  ] },
  { name: "egg", ops: [
    [["M",0,-0.969],["C",0.72,-0.72,0.78,0.34,0,0.969],["C",-0.78,0.34,-0.72,-0.72,0,-0.969],["Z"]],
  ] },
  { name: "heartbreak", ops: [
    [["M",0,0.672],["C",-0.875,-0.015,-0.875,-0.702,-0.406,-0.702],["C",-0.125,-0.702,0,-0.484,0,-0.484],["C",0,-0.484,0.125,-0.702,0.406,-0.702],["C",0.875,-0.702,0.875,-0.015,0,0.672],["Z"],["M",-0.044,-0.486],["L",0.098,-0.301],["L",-0.165,-0.007],["L",0.048,0.269],["L",-0.09,0.44],["L",-0.013,0.713],["L",0.088,0.682],["L",0.015,0.455],["L",0.152,0.251],["L",-0.06,0.002],["L",0.202,-0.279],["L",0.044,-0.544],["Z"]],
  ] },
  { name: "candy", ops: [
    [["M",0.395,-0.144],["C",0.463,0.043,0.337,0.282,0.13,0.357],["C",-0.076,0.432,-0.326,0.331,-0.395,0.144],["C",-0.463,-0.043,-0.337,-0.282,-0.13,-0.357],["C",0.076,-0.432,0.326,-0.331,0.395,-0.144],["Z"]],
    [["M",-0.338,0.123],["L",-0.957,-0.055],["L",-0.714,0.261],["L",-0.696,0.659],["Z"]],
    [["M",0.338,-0.123],["L",0.696,-0.659],["L",0.714,-0.261],["L",0.957,0.055],["Z"]],
  ] },
  { name: "boost", ops: [
    [["M",-0.8,-0.16],["L",0,-0.8],["L",0.8,-0.16],["L",0.8,0.12],["L",0,-0.5],["L",-0.8,0.12],["Z"]],
    [["M",-0.8,0.46],["L",0,-0.18],["L",0.8,0.46],["L",0.8,0.74],["L",0,0.12],["L",-0.8,0.74],["Z"]],
  ] },
  { name: "axe", ops: [
    [["M",0.078,-0.504],["L",0.265,-0.435],["L",-0.215,0.88],["L",-0.403,0.811],["Z"]],
    [["M",0.213,-0.817],["Q",0.859,-0.602,0.511,0.059],["Q",0.349,-0.256,0.028,-0.309],["Z"]],
  ] },
  { name: "jaws", ops: [
    [["M",0.832,-0.392],["L",0.69,-0.608],["L",0.493,-0.777],["L",0.257,-0.883],["L",0,-0.92],["L",-0.257,-0.883],["L",-0.493,-0.777],["L",-0.69,-0.608],["L",-0.832,-0.392],["L",-0.597,-0.281],["L",-0.3,-0.265],["L",-0.354,-0.557],["L",-0.112,-0.384],["L",0,-0.66],["L",0.112,-0.384],["L",0.354,-0.557],["L",0.3,-0.265],["L",0.597,-0.281],["Z"]],
    [["M",0.832,0.392],["L",0.69,0.608],["L",0.493,0.777],["L",0.257,0.883],["L",0,0.92],["L",-0.257,0.883],["L",-0.493,0.777],["L",-0.69,0.608],["L",-0.832,0.392],["L",-0.597,0.281],["L",-0.3,0.265],["L",-0.354,0.557],["L",-0.112,0.384],["L",0,0.66],["L",0.112,0.384],["L",0.354,0.557],["L",0.3,0.265],["L",0.597,0.281],["Z"]],
  ] },
  { name: "hammer", ops: [
    [["M",-0.194,-0.929],["L",0.801,-0.508],["L",0.614,-0.066],["L",-0.381,-0.487],["Z"]],
    [["M",0.03,-0.378],["L",0.251,-0.285],["L",-0.24,0.876],["L",-0.461,0.782],["Z"]],
  ] },
];

// ---- THE ROSTER, IN ITS ONE ORDER ----------------------------------------------------------------------------------
//
// The order CrunchyUI has always registered its icons in, and so the order its presets and links store: the marks,
// the input legends, the hand-drawn shapes that are NOT redraws of a port, every ported shape (a redraw in
// GLYPH_SHAPES then takes its port's slot), and the later additions (one reusing a name REPLACES that entry in place,
// anything new APPENDS). Built once, here, so no app has to repeat the dance.
const GLYPH_GROUPS = [["mark", "Marks"], ["input", "Input glyphs"], ["shape", "Shapes"]];

function glyphRoster() {
  const out = [];
  const portNames = GLYPH_PORTED.map(function (s) { return s.name; });
  const at = function (name) {
    for (let i = 0; i < out.length; i++) if (out[i].name === name) return i;
    return -1;
  };
  // A drawn glyph: its main path, then whatever it draws back on top.
  const drawn = function (d, group, hidden) {
    return {
      name: d.name, group: group, ported: false, hidden: !!hidden,
      slots: d.slots || {}, knobs: d.controls || [],
      layers: function (rp) {
        const L = [d.segs(rp)];
        if (d.over) L.push(d.over(rp));
        return L;
      },
    };
  };
  GLYPH_MARKS.forEach(function (d) { out.push(drawn(d, "mark", false)); });
  GLYPH_INPUTS.forEach(function (d) { out.push(drawn(d, "input", false)); });
  GLYPH_SHAPES.forEach(function (d) {
    if (portNames.indexOf(d.name) < 0) out.push(drawn(d, "shape", !!GLYPH_SET_ASIDE[d.name]));
  });
  GLYPH_PORTED.forEach(function (s) {
    out.push({ name: s.name, group: "shape", ported: true, hidden: !!GLYPH_SET_ASIDE[s.name], slots: {}, knobs: [],
               layers: function () { return s.ops; } });
  });
  GLYPH_SHAPES.forEach(function (d) {
    if (portNames.indexOf(d.name) < 0) return;
    const i = at(d.name);
    if (i >= 0) out[i] = drawn(d, "shape", !!GLYPH_SET_ASIDE[d.name]);
  });
  GLYPH_LATE.forEach(function (d) {
    const group = d.system ? "mark" : d.input ? "input" : "shape";
    const i = at(d.name);
    if (i >= 0) out[i] = drawn(d, group, out[i].hidden || !!d.hidden);
    else out.push(drawn(d, group, !!d.hidden));
  });
  out.forEach(function (g, i) { g.index = i; });
  return out;
}
const GLYPH_DEFS = glyphRoster();
const GLYPH_INDEX = {};
GLYPH_DEFS.forEach(function (g) { GLYPH_INDEX[g.name] = g.index; });

function glyphDef(name) {
  return Object.prototype.hasOwnProperty.call(GLYPH_INDEX, name) ? GLYPH_DEFS[GLYPH_INDEX[name]] : null;
}

function glyphNames() { return GLYPH_DEFS.map(function (g) { return g.name; }); }

function glyphInfo(name) {
  const g = glyphDef(name);
  if (!g) return null;
  return { name: g.name, index: g.index, group: g.group, ported: g.ported, hidden: g.hidden,
           slots: Object.assign({}, g.slots), knobs: g.knobs.map(function (k) { return k.slice(); }) };
}

function glyphLayers(name, slots) {
  const g = glyphDef(name);
  if (!g) return null;
  return g.layers(Object.assign({}, g.slots, slots || {}));
}

// ---- A GLYPH AS PIXELS ---------------------------------------------------------------------------------------------
//
// The same fill CrunchyUI's renderer gives a path op (its ui.js `flattenPath` + `fillLoopsIdx`, written out again
// here so this file needs nothing from an app): curves flattened to GLYPH_PATH_STEPS lines each, every row sampled
// at its pixel CENTRE, even-odd across a layer's loops, spans rounded to whole pixels, and a sliver thinner than one
// row still kept by its middle. UI's engine suite checks the two agree for every glyph.
const GLYPH_PATH_STEPS = 12;

function glyphFlatten(d, n) {
  const loops = [];
  let cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
  const push = function (x, y) { if (cur) cur.push([x * n, y * n]); };
  for (let i = 0; i < d.length; i++) {
    const g = d[i];
    if (g[0] === "M") {
      if (cur && cur.length >= 3) loops.push(cur);
      cur = [];
      cx = sx = g[1]; cy = sy = g[2];
      push(cx, cy);
    } else if (g[0] === "L") {
      push(g[1], g[2]); cx = g[1]; cy = g[2];
    } else if (g[0] === "Q") {
      for (let k = 1; k <= GLYPH_PATH_STEPS; k++) {
        const t = k / GLYPH_PATH_STEPS, m = 1 - t;
        push(m * m * cx + 2 * m * t * g[1] + t * t * g[3],
             m * m * cy + 2 * m * t * g[2] + t * t * g[4]);
      }
      cx = g[3]; cy = g[4];
    } else if (g[0] === "C") {
      for (let k = 1; k <= GLYPH_PATH_STEPS; k++) {
        const t = k / GLYPH_PATH_STEPS, m = 1 - t;
        push(m*m*m*cx + 3*m*m*t*g[1] + 3*m*t*t*g[3] + t*t*t*g[5],
             m*m*m*cy + 3*m*m*t*g[2] + 3*m*t*t*g[4] + t*t*t*g[6]);
      }
      cx = g[5]; cy = g[6];
    } else if (g[0] === "Z") {
      if (cur && cur.length >= 3) loops.push(cur);
      cur = null; cx = sx; cy = sy;
    }
  }
  if (cur && cur.length >= 3) loops.push(cur);
  return loops;
}

function glyphFillLoops(a, n, loops) {
  let lo = Infinity, hi = -Infinity;
  loops.forEach(function (L) {
    for (let i = 0; i < L.length; i++) {
      if (L[i][1] < lo) lo = L[i][1];
      if (L[i][1] > hi) hi = L[i][1];
    }
  });
  if (!isFinite(lo)) return;
  const yA = Math.max(0, Math.floor(lo)), yB = Math.min(n - 1, Math.ceil(hi));
  const rowAt = function (y, cy) {
    let painted = 0;
    const xs = [];
    loops.forEach(function (L) {
      for (let i = 0; i < L.length; i++) {
        const p = L[i], q = L[(i + 1) % L.length];
        if ((p[1] <= cy && q[1] > cy) || (q[1] <= cy && p[1] > cy)) {
          xs.push(p[0] + ((cy - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
        }
      }
    });
    xs.sort(function (p, q) { return p - q; });
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xA = Math.max(0, Math.round(xs[k])), xB = Math.min(n - 1, Math.round(xs[k + 1]) - 1);
      if (y < 0 || y >= n) continue;
      for (let x = xA; x <= xB; x++) { a[y * n + x] = 1; painted++; }
    }
    return painted;
  };
  let painted = 0;
  for (let y = yA; y <= yB; y++) painted += rowAt(y, y + 0.5);
  if (!painted) {
    const ys = [];
    loops.forEach(function (L) { for (let i = 0; i < L.length; i++) ys.push(L[i][1]); });
    ys.sort(function (p, q) { return p - q; });
    for (let i = 0; i + 1 < ys.length; i++) {
      const p = ys[i], q = ys[i + 1];
      if (q - p < 0.5) continue;
      if (Math.ceil(p - 0.5) <= Math.floor(q - 0.5)) continue;
      const mid = (p + q) / 2, y = Math.floor(mid);
      if (y >= 0 && y <= n - 1) rowAt(y, mid);
    }
  }
}

function glyphMask(name, size, opts) {
  const o = opts || {};
  const n = Math.max(1, Math.round(size || GLYPH_GRID));
  const out = { w: n, h: n, a: new Uint8Array(n * n) };
  let layers = glyphLayers(name, o.slots);
  if (!layers) return null;
  if (o.layers === false) layers = layers.slice(0, 1);
  const deg = ((Math.round(o.angle || 0) % 360) + 360) % 360;
  glyphRotSegs(layers, deg).forEach(function (segs) {
    glyphFillLoops(out.a, n, glyphFlatten(glyphToUnit(segs), n));
  });
  return out;
}

// One layer onto a Canvas2D-shaped context, for an app that draws with real curves (a particle at any size).
function glyphTrace(ctx, segs, x, y, size) {
  const X = function (u) { return x + (u * 0.5 + 0.5) * size; };
  const Y = function (u) { return y + (u * 0.5 + 0.5) * size; };
  segs.forEach(function (g) {
    if (g[0] === "M") ctx.moveTo(X(g[1]), Y(g[2]));
    else if (g[0] === "L") ctx.lineTo(X(g[1]), Y(g[2]));
    else if (g[0] === "Q") ctx.quadraticCurveTo(X(g[1]), Y(g[2]), X(g[3]), Y(g[4]));
    else if (g[0] === "C") ctx.bezierCurveTo(X(g[1]), Y(g[2]), X(g[3]), Y(g[4]), X(g[5]), Y(g[6]));
    else if (g[0] === "Z") ctx.closePath();
  });
}

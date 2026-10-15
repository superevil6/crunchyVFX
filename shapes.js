"use strict";
// CrunchyVFX — the shape roster. One record per particle sprite; vfx.js owns the cache,
// the tint pass and everything that moves, and reaches in here only to draw a white mask.
//
// Loaded BEFORE vfx.js as a classic script, so `SHAPE_DEFS` and `SHAPES` are plain globals.
//
// A record is:
//   name       the patch-format name, and the label on the picker button
//   draw       paint a WHITE/alpha mask into a SPRITE_PX canvas; vfx.js tints it after
//   key        optional — the params this drawing reads, for the sprite cache key. Omit it
//              and a slider can leave a stale sprite cached. Keeping it beside the drawing
//              is the point of the record: the two can no longer drift apart.
//   ownColour  optional — for shapes that arrive already coloured (the glyph, an imported
//              PNG). Returns how far to tint them; everything else is a flat repaint.
//   sized      optional — true for a pixel-exact drawing (the Icon, §28): draw() fills a canvas of the
//              particle's own pixel size (R = size / 2) and vfx.js blits it unsmoothed.
//   after      optional — after(g, R, st, hue, sat, lum) paints over the TINTED sprite (the Icon's filled holes).
//
// ADDING A SHAPE: append a record here. That is the whole job — SHAPES, the cache key and
// the draw call all come off this one list. Then add the name to SHAPE_CATS in index.html
// so the picker grows a button for it, and to RANDOM_SHAPES so Randomize can reach it.

// ============================================================================================
// ARTWORK RULE: everything here is drawn from scratch, in code. No bundled asset may enter this
// project unless it is CC0 / public domain.
//
// The reason is specific to what this tool DOES: the artwork ends up baked into the sprite sheet
// a user exports and ships in their commercial game. Any obligation attached to it propagates to
// THEM, not just to us. CC-BY would hand every user a credits-screen requirement they'll never
// know about; CC-BY-SA (OpenMoji) would arguably make their sprite sheet share-alike, which is
// poison for a commercial release. No major emoji set is CC0 — checked 2026-07-27: Twemoji is
// CC-BY-4.0, OpenMoji CC-BY-SA-4.0, Fluent MIT, Noto Apache-2.0.
//
// Drawing them also sidesteps a technical problem: shapes here are white masks tinted in one
// source-in pass, so a full-colour bitmap can only be pasted, never tinted — it would sit outside
// hue, hue-shift, saturation, hot-core, the ramp and palette lock. `glyphTint` exists precisely
// as that escape hatch. A drawn shape is ~15 lines, CC0 by construction, tints properly and
// survives being crunched to 8px.
//
// Users can still bring their own art via the `image` shape; that licence is theirs and knowing.
// ============================================================================================
//
// APPEND ONLY. `shape` is stored as an index in every preset, share link and saved effect, so
// inserting in the middle would silently turn every saved heart into a cross.
// ---- ported shapes ----------------------------------------------------------------------------
// CrunchyUI (the sibling app) authors its icons as path ops in the SAME -1..1 space this file draws
// in, so a ported shape is DATA rather than drawing code and is stored that way — one record per
// icon would otherwise be a hundred lines of transcribed coordinates, and a transcription slip
// looks exactly like an authored decision.
//
// EVEN-ODD IS NOT OPTIONAL HERE. CrunchyUI cuts holes by winding, and this file's `g.fill()`
// default is nonzero, which fills every one of them back in — a compass becomes a plain disc and a
// die loses its pips. It reads as a drawing choice rather than as a bug, which is why it is
// spelled out here instead of being left to the reader.
//
// The op alphabet is CrunchyUI's, unchanged, so these entries can lift out into a shared roster
// later without being rewritten: M, L, Q, C, Z.
function pathShape(name, ops) {
  return {
    name,
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      for (const o of ops) {
        const k = o[0];
        if (k === "M") g.moveTo(o[1] * R, o[2] * R);
        else if (k === "L") g.lineTo(o[1] * R, o[2] * R);
        else if (k === "Q") g.quadraticCurveTo(o[1] * R, o[2] * R, o[3] * R, o[4] * R);
        else if (k === "C") g.bezierCurveTo(o[1] * R, o[2] * R, o[3] * R, o[4] * R, o[5] * R, o[6] * R);
        else if (k === "Z") g.closePath();
      }
      g.fill("evenodd");
      g.restore();
    },
  };
}

const SHAPE_DEFS = [
  // ---- 0 glow — the workhorse: hot centre, soft falloff
  {
    name: "glow",
    draw(g, R, st, frame) {
      const grd = g.createRadialGradient(R, R, 0, R, R, R);
      grd.addColorStop(0, "#fff");
      grd.addColorStop(0.25, "rgba(255,255,255,0.85)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
    },
  },
  // ---- 1 spark — a tapered streak, drawn along +x and rotated per particle
  {
    name: "spark",
    key: (st) => st.sparkLen + "," + st.sparkTaper,
    draw(g, R, st, frame) {
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
    },
  },
  // ---- 2 ring
  {
    name: "ring",
    key: (st) => st.ringThick + "," + st.ringSoft,
    draw(g, R, st, frame) {
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
    },
  },
  // ---- 3 star
  {
    name: "star",
    key: (st) => st.starPoints + "," + st.starInner,
    draw(g, R, st, frame) {
      const pts = Math.max(3, Math.round(st.starPoints)), inner = R * st.starInner;
      g.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? inner : R - 1;
        g[i ? "lineTo" : "moveTo"](R + Math.cos(a) * r, R + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
    },
  },
  // ---- 4 pixel — a hard square, no softness at all (the pixel-art primitive)
  {
    name: "pixel",
    draw(g, R, st, frame) {
      g.fillRect(R * 0.5, R * 0.5, R, R);
    },
  },
  // ---- 5 smoke — a big soft blob, deliberately fuzzier than glow
  {
    name: "smoke",
    key: (st) => st.smokeSoft,
    draw(g, R, st, frame) {
      const grd = g.createRadialGradient(R, R, 0, R, R, R);
      const soft = st.smokeSoft;
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(0.45 * (1 - soft * 0.5), "rgba(255,255,255,0.32)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
    },
  },
  // ---- 6 shard — angular debris
  {
    name: "shard",
    key: (st) => st.shardSides + "," + st.shardRatio,
    draw(g, R, st, frame) {
      const sides = Math.max(3, Math.round(st.shardSides));
      g.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
        g[i ? "lineTo" : "moveTo"](R + Math.cos(a) * (R - 1), R + Math.sin(a) * (R - 1) * st.shardRatio);
      }
      g.closePath(); g.fill();
    },
  },
  // ---- 7 bolt — a jagged polyline. Cached like the rest, so every bolt in a patch shares
  // one silhouette; per-particle rotation keeps that from reading as repetition.
  {
    name: "bolt",
    key: (st) => st.boltSegs + "," + st.boltJitter + "," + st.boltBranch,
    draw(g, R, st, frame) {
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
    },
  },
  // ---- 8 custom — the 16×16 grid you drew, blown up with hard edges
  {
    name: "custom",
    key: (st) => st.customSprite,
    draw(g, R, st, frame) {
      const data = decodeSpriteAlpha(st.customSprite);
      if (!data) return;                       // nothing drawn yet → an empty sprite, not a crash
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
    },
  },
  // ---- 9 image — your own PNG as the particle, optionally an animated strip
  {
    name: "image",
    key: (st) => imageSpriteVersion + "," + st.imgTint + "," + st.imgCols + "," + st.imgRows,
    ownColour: (st) => st.imgTint,
    draw(g, R, st, frame) {
      if (!imageSpriteEl || !imageSpriteEl.complete || !imageSpriteEl.naturalWidth) return;
      const cols = Math.max(1, Math.round(st.imgCols)), rows = Math.max(1, Math.round(st.imgRows));
      const iw = imageSpriteEl.naturalWidth / cols, ih = imageSpriteEl.naturalHeight / rows;
      const n = cols * rows;
      const idx = ((Math.round(frame) % n) + n) % n;
      const sx = (idx % cols) * iw, sy = Math.floor(idx / cols) * ih;
      const k = Math.min(SPRITE_PX / iw, SPRITE_PX / ih);   // contain, preserving aspect
      const w = iw * k, h = ih * k;
      g.imageSmoothingEnabled = k < 1;        // downscale smoothly, upscale crisply
      g.drawImage(imageSpriteEl, sx, sy, iw, ih, (SPRITE_PX - w) / 2, (SPRITE_PX - h) / 2, w, h);
    },
  },
  // ---- 10 heart — two lobes and a point. Charms, pickups, healing, "likes".
  {
    name: "heart",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 0.86); g.scale(R / 16, R / 16);
      g.beginPath();
      g.moveTo(0, 13);
      g.bezierCurveTo(-14, 2, -14, -9, -6.5, -9);
      g.bezierCurveTo(-2, -9, 0, -5.5, 0, -5.5);
      g.bezierCurveTo(0, -5.5, 2, -9, 6.5, -9);
      g.bezierCurveTo(14, -9, 14, 2, 0, 13);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 11 cross — tapered spikes off a bright centre. The anime sparkle.
  {
    name: "cross",
    key: (st) => st.crossArms + "," + st.crossThin,
    draw(g, R, st, frame) {
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
    },
  },
  // ---- 12 diamond — the pixel-art rhombus; reads cleanly at 8px where a circle doesn't
  {
    name: "diamond",
    draw(g, R, st, frame) {
      g.beginPath();
      g.moveTo(R, 1); g.lineTo(R * 2 - 1, R); g.lineTo(R, R * 2 - 1); g.lineTo(1, R);
      g.closePath(); g.fill();
    },
  },
  // ---- 13 crescent — an arc segment. Sword slashes, swooshes, orbit trails.
  {
    name: "crescent",
    key: (st) => st.crescentArc + "," + st.crescentThick + "," + (st.crescentTaper || 0),
    draw(g, R, st, frame) {
      const th = Math.max(1, R * st.crescentThick), arc = st.crescentArc * Math.PI * 2;
      const taper = Math.max(0, Math.min(1, st.crescentTaper || 0));
      if (!taper) {                                   // the original round-ended stroke, unchanged
        g.lineWidth = th; g.lineCap = "round";
        g.beginPath();
        g.arc(R, R, R - th / 2 - 1, -Math.PI / 2 - arc / 2, -Math.PI / 2 + arc / 2);
        g.stroke();
        return;
      }
      // TAPERED (AJ, 2026-10-16: "taper the edges off to look more triangular"): a blade's arc, full thickness at the
      // middle, thinning toward both tips (to a point at taper 1). The outer edge is the arc; the inner edge comes in
      // by the thickness at each point along it.
      const ro = R - 1, a0 = -Math.PI / 2 - arc / 2, N = 48;
      g.beginPath();
      for (let i = 0; i <= N; i++) { const a = a0 + arc * i / N; g.lineTo(R + ro * Math.cos(a), R + ro * Math.sin(a)); }
      for (let i = N; i >= 0; i--) {
        const s = i / N, t = th * ((1 - taper) + taper * Math.sin(Math.PI * s)), a = a0 + arc * s, ri = ro - t;
        g.lineTo(R + ri * Math.cos(a), R + ri * Math.sin(a));
      }
      g.closePath(); g.fill();
    },
  },
  // ---- 14 snowflake — radial arms with side branches. The ice primitive.
  {
    name: "snowflake",
    key: (st) => st.flakeArms + "," + st.flakeBranch,
    draw(g, R, st, frame) {
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
    },
  },
  // ---- 15 blob — an organic lumpy mass. Goo, slime, mud, splats.
  {
    name: "blob",
    key: (st) => st.blobLobes + "," + st.blobRough,
    draw(g, R, st, frame) {
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
    },
  },
  // ---- 16 teardrop — round head, tapered tail. Velocity-aligned like the spark.
  {
    name: "teardrop",
    key: (st) => st.dropTail,
    draw(g, R, st, frame) {
      const hx = R + R * 0.3, hr = R * 0.5, tx = R - R * (0.1 + 0.85 * st.dropTail);
      g.beginPath();
      g.moveTo(tx, R);
      g.quadraticCurveTo(hx, R - hr, hx + hr * 0.9, R);
      g.quadraticCurveTo(hx, R + hr, tx, R);
      g.closePath(); g.fill();
    },
  },
  // ---- 17 spiral — a coiled tail. Magic curls, whirlwinds, charm swirls.
  {
    name: "spiral",
    key: (st) => st.spiralTurns + "," + st.spiralThick,
    draw(g, R, st, frame) {
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
    },
  },
  // ---- 18 glyph — any character or emoji as the particle. Covers charms (♥), emotes
  // (! ? ★ ✦), damage numbers and full-colour emoji in one primitive, with no new asset
  // pipeline. `glyphTint` at 0 keeps the glyph's own colours, which is what emoji need.
  {
    name: "glyph",
    key: (st) => st.glyph + "," + st.glyphTint,
    ownColour: (st) => st.glyphTint,
    draw(g, R, st, frame) {
      g.font = Math.round(SPRITE_PX * 0.74) + 'px system-ui, "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(st.glyph || "★", R, R + SPRITE_PX * 0.03);
    },
  },
  // ---- 19 flower — petals round a bright centre. Nature, spring, healing, charm pickups.
  {
    name: "flower",
    key: (st) => st.flowerPetals + "," + st.flowerWidth + "," + st.flowerCore,
    draw(g, R, st, frame) {
      const petals = Math.max(3, Math.round(st.flowerPetals));
      const reach = R * 0.94, wide = R * st.flowerWidth;
      g.save(); g.translate(R, R);
      for (let i = 0; i < petals; i++) {
        g.save();
        g.rotate((i / petals) * Math.PI * 2);
        // Each petal is an ellipse pushed out from the centre, so they overlap into a rosette
        // rather than sitting as separate blobs.
        g.beginPath();
        g.ellipse(0, -reach * 0.5, wide, reach * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // A brighter core, the same trick the cross uses — it stops the middle reading as a hole
      // where all the petals overlap.
      const fc = R * Math.max(0.05, st.flowerCore);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, fc);
      grd.addColorStop(0, "#fff");
      grd.addColorStop(1, "rgba(255,255,255,0.35)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(0, 0, fc, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 20 leaf — a pointed oval with a cut midrib. Falls, nature, poison, forest.
  {
    name: "leaf",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(0, -R + 1);
      g.quadraticCurveTo(R * 0.9, 0, 0, R - 1);
      g.quadraticCurveTo(-R * 0.9, 0, 0, -R + 1);
      g.closePath(); g.fill();
      // Cut the vein out rather than drawing it: the sprite is a white mask that gets tinted in
      // one pass later, so a "darker" line isn't available — a hole is.
      g.globalCompositeOperation = "destination-out";
      g.lineWidth = Math.max(1, R * 0.09);
      g.beginPath(); g.moveTo(0, -R * 0.8); g.lineTo(0, R * 0.8); g.stroke();
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 21 hexagon — shields, honeycomb, tech, energy cells. Reads clean at small sizes.
  {
    name: "hexagon",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(Math.PI / 6);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * (R - 1), y = Math.sin(a) * (R - 1);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 22 arrow — a chevron with a tail. Directional: buffs, boosts, speed, UI juice.
  {
    name: "arrow",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(0, -R + 1);
      g.lineTo(R - 1, R * 0.15);
      g.lineTo(R * 0.34, R * 0.15);
      g.lineTo(R * 0.34, R - 1);
      g.lineTo(-R * 0.34, R - 1);
      g.lineTo(-R * 0.34, R * 0.15);
      g.lineTo(-R + 1, R * 0.15);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 23 gear — teeth round a hub with a bored centre. Machines, steampunk, clockwork.
  {
    name: "gear",
    draw(g, R, st, frame) {
      const teeth = 8, rOut = R - 1, rIn = R * 0.72;
      g.save(); g.translate(R, R);
      g.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 ? rIn : rOut;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(0, 0, R * 0.28, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 24 note — a musical eighth note. `glyph` can already render ♪, but that depends on
  // whichever font the machine has and lands at a different weight and size on every OS; this
  // is drawn, so it's identical everywhere and survives being crunched down to 8px.
  {
    name: "note",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      const hr = R * 0.4;                       // head radius
      const hx = -R * 0.3, hy = R * 0.46;       // head centre
      const stemX = hx + hr * 0.82, stemW = Math.max(1, R * 0.13);
      g.fillRect(stemX, -R * 0.88, stemW, hy + R * 0.88);
      // Flag: two curves back to the stem, so it fills as one solid shape.
      g.beginPath();
      g.moveTo(stemX + stemW, -R * 0.88);
      g.quadraticCurveTo(R * 0.82, -R * 0.5, R * 0.34, -R * 0.02);
      g.quadraticCurveTo(R * 0.62, -R * 0.46, stemX + stemW, -R * 0.44);
      g.closePath(); g.fill();
      // Head last, tilted like real notation.
      g.save(); g.translate(hx, hy); g.rotate(-0.34);
      g.beginPath(); g.ellipse(0, 0, hr, hr * 0.72, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      g.restore();
    },
  },
  // ---- 25 flame — a fire tongue, and the fiddliest shape in the set: get it merely
  // pointed-and-round and you have drawn `teardrop` upside down. Three things separate the
  // two. The tip is SHARP (both edges leave it near-vertically; splayed control points round
  // it into a blob). The trailing edge is CONCAVE. And the base is NOTCHED into two lobes —
  // that notch is what the eye actually reads as fire rather than liquid.
  {
    name: "flame",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(0, -R + 1);
      g.bezierCurveTo(R * 0.16, -R * 0.64, R * 0.72, -R * 0.02, R * 0.4, R * 0.6);   // right edge
      g.quadraticCurveTo(R * 0.26, R * 0.94, R * 0.06, R * 0.86);                    // right lobe
      g.quadraticCurveTo(-R * 0.06, R * 0.44, -R * 0.2, R * 0.72);                   // the notch
      g.quadraticCurveTo(-R * 0.36, R * 0.94, -R * 0.46, R * 0.5);                   // left lobe
      g.bezierCurveTo(-R * 0.62, R * 0.06, -R * 0.34, -R * 0.14, -R * 0.22, -R * 0.5);
      g.quadraticCurveTo(-R * 0.1, -R * 0.8, 0, -R + 1);                             // into the tip
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 26 triangle — the primitive the set was missing. Directional, and the cheapest
  // shape that still reads at 4px.
  {
    name: "triangle",
    draw(g, R, st, frame) {
      g.beginPath();
      g.moveTo(R, 1); g.lineTo(R * 2 - 1, R * 2 - 1); g.lineTo(1, R * 2 - 1);
      g.closePath(); g.fill();
    },
  },
  // ---- 27 plus — heals, buffs, medkits. Distinct from `cross`, which is a twinkle/star.
  {
    name: "plus",
    draw(g, R, st, frame) {
      const arm = R * 0.32;
      g.save(); g.translate(R, R);
      g.fillRect(-arm, -(R - 1), arm * 2, (R - 1) * 2);
      g.fillRect(-(R - 1), -arm, (R - 1) * 2, arm * 2);
      g.restore();
    },
  },
  // ---- 28 bubble — a ring with a specular highlight. Water, potions, underwater, soap.
  // The highlight is what separates it from `ring`: without it a circle outline reads as a
  // shockwave, with it the eye reads a sphere.
  {
    name: "bubble",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.lineWidth = Math.max(1, R * 0.16);
      g.beginPath(); g.arc(0, 0, R - g.lineWidth * 0.6, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      g.ellipse(-R * 0.34, -R * 0.38, R * 0.2, R * 0.13, -0.7, 0, Math.PI * 2);
      g.fill();
      g.restore();
    },
  },
  // ---- 29 claw — three tapered gashes. Melee hits, monster attacks, rends.
  {
    name: "claw",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(-0.3);
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * R * 0.52;
        // Each gash is a lens: two curves meeting at points, so it tapers at both ends the way a
        // cut does rather than being a rounded stroke.
        g.beginPath();
        g.moveTo(off, -R + 1);
        g.quadraticCurveTo(off + R * 0.34, 0, off + R * 0.12, R - 1);
        g.quadraticCurveTo(off + R * 0.1, 0, off, -R + 1);
        g.closePath(); g.fill();
      }
      g.restore();
    },
  },
  // ---- 30 gem — a faceted crystal. Loot, ice, mana, shards of magic.
  {
    name: "gem",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      const tw = R * 0.52, ty = -R * 0.34;
      g.beginPath();
      g.moveTo(-tw, ty); g.lineTo(tw, ty);
      g.lineTo(R * 0.86, -R * 0.04); g.lineTo(0, R - 1); g.lineTo(-R * 0.86, -R * 0.04);
      g.closePath(); g.fill();
      // Facet lines cut out, same reason the leaf's vein is: the sprite is a white mask, so a
      // darker line isn't available — only a hole.
      g.globalCompositeOperation = "destination-out";
      g.lineWidth = Math.max(1, R * 0.07);
      g.beginPath();
      g.moveTo(-tw, ty); g.lineTo(0, R - 1); g.lineTo(tw, ty);
      g.moveTo(-R * 0.86, -R * 0.04); g.lineTo(R * 0.86, -R * 0.04);
      g.stroke();
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 31 skull — poison clouds, death, danger.
  {
    name: "skull",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 0.92);
      g.beginPath(); g.ellipse(0, -R * 0.12, R * 0.72, R * 0.66, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(-R * 0.34, R * 0.34, R * 0.68, R * 0.42);                       // jaw
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.ellipse(-R * 0.3, -R * 0.14, R * 0.2, R * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(R * 0.3, -R * 0.14, R * 0.2, R * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.beginPath();                                                              // nose
      g.moveTo(0, R * 0.06); g.lineTo(R * 0.12, R * 0.3); g.lineTo(-R * 0.12, R * 0.3);
      g.closePath(); g.fill();
      g.fillRect(-R * 0.1, R * 0.34, R * 0.2, R * 0.42);                          // tooth gap
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 32 feather — floaty, angelic, bird hits.
  {
    name: "feather",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(0.3);
      g.beginPath();
      g.moveTo(0, -R + 1);
      g.quadraticCurveTo(R * 0.62, -R * 0.1, R * 0.1, R * 0.72);
      g.quadraticCurveTo(-R * 0.05, R - 1, -R * 0.12, R * 0.7);
      g.quadraticCurveTo(-R * 0.6, -R * 0.08, 0, -R + 1);
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";               // quill
      g.lineWidth = Math.max(1, R * 0.08);
      g.beginPath(); g.moveTo(0, -R * 0.82); g.lineTo(-R * 0.02, R * 0.86); g.stroke();
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 33 rune — an angular carved mark. Magic that isn't a circle.
  {
    name: "rune",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.lineWidth = Math.max(1.5, R * 0.19); g.lineCap = "square";
      g.beginPath();
      g.moveTo(0, -R * 0.86); g.lineTo(0, R * 0.86);
      g.moveTo(0, -R * 0.44); g.lineTo(R * 0.6, -R * 0.8);
      g.moveTo(0, R * 0.1); g.lineTo(-R * 0.6, -R * 0.26);
      g.moveTo(0, R * 0.5); g.lineTo(R * 0.52, R * 0.84);
      g.stroke();
      g.restore();
    },
  },
  // ---- 34 coin — the pickup primitive. A disc with a struck rim reads as currency where a
  // plain circle just reads as `glow`.
  {
    name: "coin",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath(); g.arc(0, 0, R - 1, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.lineWidth = Math.max(1, R * 0.1);
      g.beginPath(); g.arc(0, 0, R * 0.7, 0, Math.PI * 2); g.stroke();
      g.globalCompositeOperation = "source-over";
      g.beginPath(); g.arc(0, 0, R * 0.34, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 35 splash — the crown a droplet throws up on impact. Liquid, blood, mud.
  {
    name: "splash",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.05);
      g.beginPath();
      g.moveTo(-R * 0.92, R * 0.3);
      for (let i = 0; i < 4; i++) {                                  // spikes of the coronet
        const x0 = -R * 0.92 + (i / 4) * R * 1.84;
        const x1 = -R * 0.92 + ((i + 0.5) / 4) * R * 1.84;
        const x2 = -R * 0.92 + ((i + 1) / 4) * R * 1.84;
        g.quadraticCurveTo(x1, -R * (0.5 + (i % 2) * 0.42), x2, R * 0.3);
        g.quadraticCurveTo(x1 + R * 0.02, R * 0.02, x0 + R * 0.46, R * 0.3);
      }
      g.lineTo(-R * 0.92, R * 0.3);
      g.quadraticCurveTo(0, R * 0.9, R * 0.92, R * 0.3);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 36 comma — a magatama swirl. Wind, chi, energy curls; solid where `spiral` is a
  // line. Drawn as head + hooked tail rather than one closed path: a single sweep kept
  // resolving into a pear, and it is the separate hook that reads as a curl.
  {
    name: "comma",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath(); g.arc(0, R * 0.28, R * 0.6, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(R * 0.56, R * 0.3);
      g.quadraticCurveTo(R * 0.78, -R * 0.66, -R * 0.34, -R * 0.9);
      g.quadraticCurveTo(R * 0.26, -R * 0.34, R * 0.08, R * 0.3);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 37 frame — a hollow square. Tech, targeting, glitch blocks, UI hits.
  {
    name: "frame",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.fillRect(-(R - 1), -(R - 1), (R - 1) * 2, (R - 1) * 2);
      g.globalCompositeOperation = "destination-out";
      g.fillRect(-R * 0.66, -R * 0.66, R * 1.32, R * 1.32);
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 38 starburst — many thin rays. The camera-flare sparkle; `cross` has 4 fat arms.
  {
    name: "starburst",
    draw(g, R, st, frame) {
      const rays = 12;
      g.save(); g.translate(R, R);
      for (let i = 0; i < rays; i++) {
        const len = (R - 1) * (i % 2 ? 0.52 : 1);
        g.save(); g.rotate((i / rays) * Math.PI * 2);
        g.beginPath();
        g.moveTo(-R * 0.07, 0); g.lineTo(R * 0.07, 0); g.lineTo(0, -len);
        g.closePath(); g.fill();
        g.restore();
      }
      g.restore();
    },
  },
  // ---- 39 cloud — overlapping lobes on a flat base. Smoke puffs with a silhouette, where
  // `smoke` is a soft blur. The lobes need real height variation or they merge into one hill.
  {
    name: "cloud",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.06);
      const lobes = [[-R * 0.58, R * 0.16, R * 0.34], [-R * 0.16, -R * 0.36, R * 0.48],
                     [R * 0.34, -R * 0.06, R * 0.4], [R * 0.74, R * 0.2, R * 0.26]];
      for (const lb of lobes) { g.beginPath(); g.arc(lb[0], lb[1], lb[2], 0, Math.PI * 2); g.fill(); }
      g.fillRect(-R * 0.92, R * 0.12, R * 1.84, R * 0.3);
      g.restore();
    },
  },
  // ---- 40 butterfly — nature, charm, transformation.
  {
    name: "butterfly",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      for (const s of [-1, 1]) {
        g.beginPath();                                              // upper wing
        g.ellipse(s * R * 0.44, -R * 0.3, R * 0.42, R * 0.54, s * 0.5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();                                              // lower wing
        g.ellipse(s * R * 0.36, R * 0.42, R * 0.3, R * 0.38, -s * 0.4, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();                                                // body
      g.ellipse(0, 0, R * 0.09, R * 0.66, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 41 shuriken — four concave blades. Ninja, slashes, spinning debris.
  {
    name: "shuriken",
    draw(g, R, st, frame) {
      const pts = 4;
      g.save(); g.translate(R, R);
      g.beginPath();
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const b = ((i + 1) / pts) * Math.PI * 2;
        const tip = [Math.cos(a) * (R - 1), Math.sin(a) * (R - 1)];
        if (i === 0) g.moveTo(tip[0], tip[1]); else g.lineTo(tip[0], tip[1]);
        // Curve in toward the hub, which is what makes the blades look swept rather than starry.
        g.quadraticCurveTo(Math.cos(a + 0.5) * R * 0.2, Math.sin(a + 0.5) * R * 0.2,
                           Math.cos(b) * (R - 1), Math.sin(b) * (R - 1));
      }
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(0, 0, R * 0.16, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 42 spike — a thorn. Ice shards, danger, spiky impacts.
  {
    name: "spike",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(0, -R + 1);
      g.quadraticCurveTo(R * 0.3, R * 0.2, R * 0.26, R - 1);
      g.lineTo(-R * 0.26, R - 1);
      g.quadraticCurveTo(-R * 0.3, R * 0.2, 0, -R + 1);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 43 wave — a band of water. Ripples, splashes, sea.
  {
    name: "wave",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.lineWidth = Math.max(1.5, R * 0.3); g.lineCap = "round";
      g.beginPath();
      g.moveTo(-(R - 1), R * 0.1);
      g.bezierCurveTo(-R * 0.4, -R * 0.7, R * 0.4, R * 0.9, R - 1, R * 0.1);
      g.stroke();
      g.restore();
    },
  },
  // ---- 44 eye — curses, watchers, scrying. An almond with a pupil.
  {
    name: "eye",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(-(R - 1), 0);
      g.quadraticCurveTo(0, -R * 0.9, R - 1, 0);
      g.quadraticCurveTo(0, R * 0.9, -(R - 1), 0);
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(0, 0, R * 0.34, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "source-over";
      g.beginPath(); g.arc(0, 0, R * 0.17, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 45 mushroom — spores, poison, forest.
  {
    name: "mushroom",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.02);
      g.beginPath();
      g.moveTo(-(R - 1), R * 0.08);
      g.quadraticCurveTo(-R * 0.86, -R * 0.92, 0, -R * 0.86);
      g.quadraticCurveTo(R * 0.86, -R * 0.92, R - 1, R * 0.08);
      g.closePath(); g.fill();
      g.beginPath();                                                // stem
      g.moveTo(-R * 0.28, R * 0.06);
      g.quadraticCurveTo(-R * 0.22, R * 0.8, -R * 0.3, R * 0.9);
      g.lineTo(R * 0.3, R * 0.9);
      g.quadraticCurveTo(R * 0.22, R * 0.8, R * 0.28, R * 0.06);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 46 shield — blocks, buffs, guard breaks.
  {
    name: "shield",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(0, -(R - 1));
      g.lineTo(R * 0.82, -R * 0.6);
      g.quadraticCurveTo(R * 0.82, R * 0.44, 0, R - 1);
      g.quadraticCurveTo(-R * 0.82, R * 0.44, -R * 0.82, -R * 0.6);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 47 crack — a radial fracture. Impacts, ground breaks, shattering glass. Drawn as
  // wedges that narrow outward, not strokes: a constant-width stroke reads as a spider, and
  // it is the taper plus the off-axis elbow that reads as something that split.
  {
    name: "crack",
    draw(g, R, st, frame) {
      const arms = 5;
      g.save(); g.translate(R, R);
      for (let i = 0; i < arms; i++) {
        const a = (i / arms) * Math.PI * 2 + rndS(4711, i, 1) * 0.35;
        const len = (R - 1) * (0.62 + rnd(4711, i, 2) * 0.38);
        const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
        const ex = dx * len * 0.45 + px * R * 0.14, ey = dy * len * 0.45 + py * R * 0.14;
        const w = R * 0.15;
        g.beginPath();
        g.moveTo(px * w, py * w);
        g.lineTo(ex + px * w * 0.45, ey + py * w * 0.45);
        g.lineTo(dx * len, dy * len);
        g.lineTo(ex - px * w * 0.45, ey - py * w * 0.45);
        g.lineTo(-px * w, -py * w);
        g.closePath(); g.fill();
      }
      g.restore();
    },
  },
  // ---- 48 ribbon — a twisted streamer. Confetti, celebration, cloth. The width pinching to
  // almost nothing where the twist turns edge-on is the whole trick; a constant-width band
  // reads as a flat noodle.
  {
    name: "ribbon",
    draw(g, R, st, frame) {
      const N = 16, turns = 1.35, half = SPRITE_PX / 2 - 2;
      const lx = [], ly = [], rx = [], ry = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, ph = t * Math.PI * 2 * turns;
        const y = (t - 0.5) * half * 2;
        const x = Math.sin(ph) * R * 0.3;
        const w = R * 0.05 + R * 0.34 * Math.abs(Math.cos(ph));
        lx.push(x - w); ly.push(y); rx.push(x + w); ry.push(y);
      }
      g.save(); g.translate(R, R);
      g.beginPath();
      for (let i = 0; i <= N; i++) g[i ? "lineTo" : "moveTo"](rx[i], ry[i]);
      for (let i = N; i >= 0; i--) g.lineTo(lx[i], ly[i]);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 49 bone — the other half of `skull`: death, debris, dog treats.
  {
    name: "bone",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(-0.5);
      const half = R * 0.6, k = R * 0.25;
      g.fillRect(-half, -k * 0.55, half * 2, k * 1.1);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        g.beginPath(); g.arc(sx * half, sy * k * 0.62, k, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    },
  },
  // ---- 50 paw — beast hits, tracks, cute pickups.
  {
    name: "paw",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();                                                  // pad
      g.ellipse(0, R * 0.34, R * 0.54, R * 0.44, 0, 0, Math.PI * 2); g.fill();
      const toes = [[-R * 0.62, -R * 0.3, 0.2], [-R * 0.24, -R * 0.62, 0.05],
                    [R * 0.24, -R * 0.62, -0.05], [R * 0.62, -R * 0.3, -0.2]];
      for (const t of toes) {
        g.beginPath(); g.ellipse(t[0], t[1], R * 0.2, R * 0.26, t[2], 0, Math.PI * 2); g.fill();
      }
      g.restore();
    },
  },
  // ---- 51 ghost — souls, spirits, spooky pickups. The scalloped hem is what separates it
  // from a plain blob, and the eye holes are cut out so they stay transparent through the tint.
  {
    name: "ghost",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.04);
      g.beginPath();
      g.moveTo(-R * 0.74, R * 0.3);
      g.lineTo(-R * 0.74, -R * 0.16);
      g.arc(0, -R * 0.16, R * 0.74, Math.PI, 0);                      // dome
      g.lineTo(R * 0.74, R * 0.3);
      for (let i = 0; i < 3; i++) {                                   // hem, right to left
        const x1 = R * 0.74 - ((i + 0.5) / 3) * R * 1.48;
        const x2 = R * 0.74 - ((i + 1) / 3) * R * 1.48;
        g.quadraticCurveTo(x1, R * 1.3, x2, R * 0.3);                 // lobes hang, notches cut up
      }
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(sx * R * 0.28, -R * 0.24, R * 0.14, R * 0.19, 0, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 52 wing — a swept plume with feather tips. Dashes, angel buffs, bird strikes.
  // `feather` is one floating plume; this is the whole wing, and it reads as motion. The
  // trailing-edge curves have to scoop INWARD between the tips — bulged outward, the feathers
  // merge and the whole thing resolves into a potato.
  {
    name: "wing",
    draw(g, R, st, frame) {
      g.save(); g.translate(R * 1.85, R * 0.82);
      const tips = [[-R * 1.75, R * 0.05], [-R * 1.25, R * 0.62], [-R * 0.72, R * 0.72],
                    [-R * 0.25, R * 0.6], [0, 0]];
      g.beginPath();
      g.moveTo(0, 0);                                                 // shoulder
      g.quadraticCurveTo(-R * 0.9, -R * 0.8, tips[0][0], tips[0][1]); // leading edge out to the tip
      for (let i = 1; i < tips.length; i++) {
        const a = tips[i - 1], b = tips[i];
        g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - R * 0.32, b[0], b[1]);
      }
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 53 hourglass — time stops, slows, buff timers. The waist keeps a little width on
  // purpose: pinched to a true point it snaps in half once the sheet is crunched to 8px.
  {
    name: "hourglass",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      const w = R * 0.62, h = R * 0.78, cap = R * 0.16;
      g.fillRect(-R * 0.8, -h - cap, R * 1.6, cap);
      g.fillRect(-R * 0.8, h, R * 1.6, cap);
      g.beginPath();
      g.moveTo(-w, -h); g.lineTo(w, -h); g.lineTo(R * 0.1, 0); g.lineTo(w, h);
      g.lineTo(-w, h); g.lineTo(-R * 0.1, 0);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 54 key — unlocks, loot, quest pickups.
  {
    name: "key",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(-0.5);
      g.beginPath(); g.arc(0, -R * 0.5, R * 0.4, 0, Math.PI * 2); g.fill();     // bow
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(0, -R * 0.5, R * 0.17, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "source-over";
      g.fillRect(-R * 0.11, -R * 0.5, R * 0.22, R * 1.32);                      // shaft
      g.fillRect(R * 0.09, R * 0.38, R * 0.32, R * 0.15);                       // teeth
      g.fillRect(R * 0.09, R * 0.66, R * 0.26, R * 0.15);
      g.restore();
    },
  },
  // ---- 55 flask — potions, alchemy, poison. A conical body under a stubby neck.
  {
    name: "flask",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.02);
      g.beginPath();
      g.moveTo(-R * 0.2, -R * 0.86);
      g.lineTo(-R * 0.2, -R * 0.28);
      g.quadraticCurveTo(-R * 0.86, R * 0.42, -R * 0.62, R * 0.7);
      g.quadraticCurveTo(0, R * 0.95, R * 0.62, R * 0.7);
      g.quadraticCurveTo(R * 0.86, R * 0.42, R * 0.2, -R * 0.28);
      g.lineTo(R * 0.2, -R * 0.86);
      g.closePath(); g.fill();
      g.fillRect(-R * 0.34, -R * 0.92, R * 0.68, R * 0.18);                     // lip
      g.restore();
    },
  },
  // ---- 56 atom — three orbits round a nucleus. Sci-fi, energy cells, tech buffs.
  {
    name: "atom",
    draw(g, R, st, frame) {
      const lw = Math.max(1.2, R * 0.11);
      g.save(); g.translate(R, R);
      g.lineWidth = lw;
      for (let i = 0; i < 3; i++) {
        g.save(); g.rotate((i / 3) * Math.PI);
        g.beginPath();
        g.ellipse(0, 0, R - 1 - lw / 2, R * 0.36, 0, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
      g.beginPath(); g.arc(0, 0, R * 0.24, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 57 reticle — lock-on, targeting, UI hits. `frame` is the solid box; this is the
  // aiming furniture, which survives crunching because nothing here is filled.
  {
    name: "reticle",
    draw(g, R, st, frame) {
      const lw = Math.max(1.5, R * 0.13), E = R - 1 - lw / 2;
      g.save(); g.translate(R, R);
      g.lineWidth = lw; g.lineCap = "butt";
      g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.stroke();
      for (const s of [-1, 1]) {                                                // cross ticks
        g.beginPath();
        g.moveTo(s * E, 0); g.lineTo(s * R * 0.66, 0);
        g.moveTo(0, s * E); g.lineTo(0, s * R * 0.66);
        g.stroke();
      }
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {                     // corner brackets
        g.beginPath();
        g.moveTo(sx * E, sy * R * 0.5); g.lineTo(sx * E, sy * E); g.lineTo(sx * R * 0.5, sy * E);
        g.stroke();
      }
      g.beginPath(); g.arc(0, 0, R * 0.12, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 58 cube — an isometric block. Voxel debris, crates, blocky worlds. The three-face
  // seams are cut out rather than drawn, so they stay transparent instead of tinting.
  {
    name: "cube",
    draw(g, R, st, frame) {
      const w = R * 0.86, hy = R * 0.95, my = R * 0.48;
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(0, -hy); g.lineTo(w, -my); g.lineTo(w, my);
      g.lineTo(0, hy); g.lineTo(-w, my); g.lineTo(-w, -my);
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.lineWidth = Math.max(1, R * 0.07);
      g.beginPath();
      g.moveTo(-w, -my); g.lineTo(0, 0); g.lineTo(w, -my);
      g.moveTo(0, 0); g.lineTo(0, hy);
      g.stroke();
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 59 sword — melee hits, weapon drops, crit flashes. Angled on purpose: drawn upright it
  // reads as a `plus` with a long arm, and the tilt is what says "blade".
  {
    name: "sword",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(0.6);
      g.beginPath();                                                  // blade, tapered to a point
      g.moveTo(0, -(R - 1));
      g.lineTo(R * 0.17, -R * 0.58);
      g.lineTo(R * 0.17, R * 0.2);
      g.lineTo(-R * 0.17, R * 0.2);
      g.lineTo(-R * 0.17, -R * 0.58);
      g.closePath(); g.fill();
      g.fillRect(-R * 0.6, R * 0.2, R * 1.2, R * 0.18);               // crossguard
      g.fillRect(-R * 0.1, R * 0.38, R * 0.2, R * 0.42);              // grip
      g.beginPath(); g.arc(0, R * 0.8, R * 0.15, 0, Math.PI * 2); g.fill();   // pommel
      g.restore();
    },
  },
  // ---- 60 crown — victory, level-up, royalty, boss kills.
  {
    name: "crown",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.16);
      g.beginPath();
      g.moveTo(-R * 0.9, R * 0.65);
      g.lineTo(-R * 0.9, -R * 0.72);
      g.lineTo(-R * 0.45, -R * 0.06);                                 // valley
      g.lineTo(0, -R * 0.98);                                         // centre point
      g.lineTo(R * 0.45, -R * 0.06);
      g.lineTo(R * 0.9, -R * 0.72);
      g.lineTo(R * 0.9, R * 0.65);
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";                 // band, cut not drawn
      g.fillRect(-R * 0.9, R * 0.2, R * 1.8, R * 0.11);
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 61 chain — binds, roots, tethers, broken shackles.
  {
    name: "chain",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(-0.6);
      g.lineWidth = Math.max(1.5, R * 0.18);
      for (const s of [-1, 1]) {                                      // two interlocking links
        g.beginPath();
        g.ellipse(0, s * R * 0.4, R * 0.32, R * 0.46, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    },
  },
  // ---- 62 sun — holy, light, heat, daybreak. `starburst` is rays alone; the disc is what makes
  // this read as a sun rather than a flare.
  {
    name: "sun",
    draw(g, R, st, frame) {
      const rays = 8;
      g.save(); g.translate(R, R);
      for (let i = 0; i < rays; i++) {
        g.save(); g.rotate((i / rays) * Math.PI * 2);
        g.beginPath();
        g.moveTo(-R * 0.13, -R * 0.55); g.lineTo(R * 0.13, -R * 0.55); g.lineTo(0, -(R - 1));
        g.closePath(); g.fill();
        g.restore();
      }
      g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 63 clover — luck, nature pickups, crit fortune.
  {
    name: "clover",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 0.9);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.beginPath();
        g.ellipse(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.36, R * 0.42, a, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = "destination-out";                 // gaps between the leaves —
      g.lineWidth = Math.max(1, R * 0.08);                            // without them it is a blob
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.beginPath();
        g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
        g.stroke();
      }
      g.globalCompositeOperation = "source-over";
      g.lineWidth = Math.max(1, R * 0.1); g.lineCap = "round";        // stem
      g.beginPath();
      g.moveTo(0, R * 0.5); g.quadraticCurveTo(R * 0.16, R * 0.8, R * 0.05, R * 0.95);
      g.stroke();
      g.restore();
    },
  },
  // ---- 64 bird — flocks, distant wings, wind. Two strokes, and it still reads at 6px, which is
  // more than the detailed birds managed.
  {
    name: "bird",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.lineWidth = Math.max(1.5, R * 0.16); g.lineCap = "round";
      g.beginPath();
      g.moveTo(-(R - 2), R * 0.28);
      g.quadraticCurveTo(-R * 0.5, -R * 0.62, 0, R * 0.05);
      g.quadraticCurveTo(R * 0.5, -R * 0.62, R - 2, R * 0.28);
      g.stroke();
      g.restore();
    },
  },
  // ---- 65 bomb — explosives, fuses, countdowns.
  {
    name: "bomb",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath(); g.arc(0, R * 0.33, R * 0.62, 0, Math.PI * 2); g.fill();   // body
      g.fillRect(-R * 0.18, -R * 0.5, R * 0.36, R * 0.24);                     // neck
      g.lineWidth = Math.max(1.2, R * 0.1); g.lineCap = "round";
      g.beginPath();                                                            // fuse
      g.moveTo(0, -R * 0.5);
      g.quadraticCurveTo(R * 0.55, -R * 0.6, R * 0.4, -R * 0.78);
      g.stroke();
      g.beginPath(); g.arc(R * 0.4, -R * 0.78, R * 0.13, 0, Math.PI * 2); g.fill();   // lit spark
      g.restore();
    },
  },
  // ---- 66 boom — the comic-book bang. Irregular on purpose: `star` is regular and reads as a
  // symbol, and it is the uneven spikes that read as an explosion.
  {
    name: "boom",
    draw(g, R, st, frame) {
      const pts = 11;
      g.save(); g.translate(R, R);
      g.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = (i % 2 ? 0.42 + rnd(918, i, 1) * 0.16 : 0.82 + rnd(918, i, 2) * 0.16) * R;
        g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 67 rock — rubble, debris, ground breaks. `shard` is a regular polygon; this one has
  // uneven radii and a squashed base, so it sits rather than floats.
  {
    name: "rock",
    draw(g, R, st, frame) {
      const sides = 9;
      g.save(); g.translate(R, R);
      g.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const flat = Math.sin(a) > 0.5 ? 0.74 : 1;
        const r = (0.74 + rnd(2255, i, 1) * 0.24) * R * flat;
        g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r * 0.9);
      }
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 68 magnet — pulls, vacuums, tractor beams. The notch across each leg is what turns a
  // plain horseshoe into poles.
  {
    name: "magnet",
    draw(g, R, st, frame) {
      const lw = R * 0.32, arm = R * 0.58;
      g.save(); g.translate(R, R * 0.96);
      g.lineWidth = lw; g.lineCap = "butt";
      g.beginPath(); g.arc(0, 0, arm, Math.PI, 0); g.stroke();        // the arch, opening down
      g.fillRect(-arm - lw / 2, 0, lw, R * 0.8);                      // legs
      g.fillRect(arm - lw / 2, 0, lw, R * 0.8);
      g.globalCompositeOperation = "destination-out";
      g.fillRect(-arm - lw / 2, R * 0.52, lw, R * 0.09);
      g.fillRect(arm - lw / 2, R * 0.52, lw, R * 0.09);
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 69 hazard — toxic, radiation, contamination. Three wedges round a bored hub.
  {
    name: "hazard",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      for (let i = 0; i < 3; i++) {
        g.save(); g.rotate((i / 3) * Math.PI * 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, R - 1, -Math.PI / 2 - 0.52, -Math.PI / 2 + 0.52);
        g.closePath(); g.fill();
        g.restore();
      }
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.arc(0, 0, R * 0.3, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "source-over";
      g.beginPath(); g.arc(0, 0, R * 0.17, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  },
  // ---- 70 pentagram — summoning seals, curses, ritual magic. `rune` is a carved mark; this is
  // the circle it gets carved into.
  {
    name: "pentagram",
    draw(g, R, st, frame) {
      const lw = Math.max(1.2, R * 0.1), rr = R - 1 - lw / 2;
      g.save(); g.translate(R, R);
      g.lineWidth = lw; g.lineJoin = "round";
      g.beginPath();
      for (let i = 0; i <= 5; i++) {                                  // every 2nd vertex — a star
        const a = (((i * 2) % 5) / 5) * Math.PI * 2 - Math.PI / 2;
        g[i ? "lineTo" : "moveTo"](Math.cos(a) * rr * 0.78, Math.sin(a) * rr * 0.78);
      }
      g.closePath(); g.stroke();
      g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke();
      g.restore();
    },
  },
  // ---- 71 planet — space, sci-fi, orbital drops.
  {
    name: "planet",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(-0.32);
      g.beginPath(); g.arc(0, 0, R * 0.56, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(1.2, R * 0.13);
      g.beginPath(); g.ellipse(0, 0, R * 0.9, R * 0.34, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
    },
  },
  // ---- 72 tornado — wind, vortexes, whirlwinds. The cut bands are what give a plain funnel its
  // spin; without them it is just a wedge.
  {
    name: "tornado",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(-(R - 1), -R * 0.86);
      g.quadraticCurveTo(-R * 0.2, -R * 0.2, -R * 0.2, R * 0.9);
      g.lineTo(R * 0.12, R * 0.9);
      g.quadraticCurveTo(R * 0.2, -R * 0.3, R - 1, -R * 0.86);
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.lineWidth = Math.max(1, R * 0.09);
      for (let i = 0; i < 3; i++) {
        const y = -R * 0.5 + i * R * 0.45, w = R * (0.72 - i * 0.22);
        g.beginPath();
        g.moveTo(-w, y); g.quadraticCurveTo(0, y + R * 0.22, w, y);
        g.stroke();
      }
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 73 scroll — quests, loot, spell learns.
  {
    name: "scroll",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.fillRect(-R * 0.62, -R * 0.72, R * 1.24, R * 1.44);           // the sheet
      for (const s of [-1, 1]) {                                      // rolled ends
        g.beginPath();
        g.ellipse(s * R * 0.62, 0, R * 0.26, R * 0.9, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = "destination-out";                 // ruled lines
      g.lineWidth = Math.max(1, R * 0.09);
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(-R * 0.34, i * R * 0.34); g.lineTo(R * 0.34, i * R * 0.34);
        g.stroke();
      }
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 74 sprout — growth, healing, spring. `leaf` is one leaf falling; this one is planted.
  {
    name: "sprout",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.1);
      g.lineWidth = Math.max(1.2, R * 0.13); g.lineCap = "round";
      g.beginPath(); g.moveTo(0, R * 0.85); g.lineTo(0, -R * 0.5); g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -R * 0.12);
        g.quadraticCurveTo(s * R * 0.98, -R * 0.44, s * R * 0.58, -R);
        g.quadraticCurveTo(s * R * 0.34, -R * 0.52, 0, -R * 0.12);
        g.closePath(); g.fill();
      }
      g.restore();
    },
  },
  // ---- 75 specks — dust, motes, grit. One particle that is already a cluster, which is how you
  // get a dense scatter without paying for ten times the particles.
  {
    name: "specks",
    draw(g, R, st, frame) {
      const n = 9;
      g.save(); g.translate(R, R);
      for (let i = 0; i < n; i++) {
        const a = rnd(7714, i, 1) * Math.PI * 2;
        const d = Math.sqrt(rnd(7714, i, 2)) * R * 0.78;   // sqrt spreads them evenly over the disc
        const r = R * (0.08 + rnd(7714, i, 3) * 0.11);
        g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    },
  },
  // ---- 76 casing — spent brass. Shooters throw a lot of these, and nothing else in the set
  // ejects like one: `pixel` is too plain and `gem` too precious.
  {
    name: "casing",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(0.5);
      g.beginPath();
      g.moveTo(-R * 0.22, -R * 0.82);
      g.quadraticCurveTo(0, -R * 0.94, R * 0.22, -R * 0.82);          // rounded mouth
      g.lineTo(R * 0.22, R * 0.66);
      g.lineTo(-R * 0.22, R * 0.66);
      g.closePath(); g.fill();
      g.fillRect(-R * 0.29, R * 0.6, R * 0.58, R * 0.24);             // rim
      g.globalCompositeOperation = "destination-out";                 // extractor groove
      g.fillRect(-R * 0.29, R * 0.54, R * 0.58, R * 0.06);
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 77 web — snares, nets, spider hits. Anchored at a corner rather than centred: a web
  // reads as something strung ACROSS a space, and a centred one just looks like a wheel.
  {
    name: "web",
    draw(g, R, st, frame) {
      g.save(); g.translate(R * 0.12, R * 0.12);
      g.lineWidth = Math.max(1, R * 0.08);
      for (let i = 0; i <= 4; i++) {                                  // radial spokes
        const a = (i / 4) * (Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 1.82, Math.sin(a) * R * 1.82);
        g.stroke();
      }
      for (let r = 1; r <= 3; r++) {                                  // strands
        g.beginPath(); g.arc(0, 0, r * R * 0.58, 0, Math.PI / 2); g.stroke();
      }
      g.restore();
    },
  },
  // ---- 78 rift — teleports, portals, dimensional tears. The edges are jagged on purpose: a
  // smooth lens is `eye` without its pupil, and it is the raggedness that reads as torn.
  {
    name: "rift",
    draw(g, R, st, frame) {
      // Every other vertex pulls hard back toward the centreline. Random widths alone came out
      // smooth and read as `egg`; it is the alternation that makes an edge look torn.
      const N = 9;
      g.save(); g.translate(R, R);
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const w = Math.sin(t * Math.PI) * R * 0.5 * (i % 2 ? 0.3 : 1) * (0.7 + rnd(3312, i, 1) * 0.5);
        g[i ? "lineTo" : "moveTo"](w, (t - 0.5) * 2 * (R - 1));
      }
      for (let i = N; i >= 0; i--) {
        const t = i / N;
        const w = Math.sin(t * Math.PI) * R * 0.5 * (i % 2 ? 1 : 0.3) * (0.7 + rnd(3312, i, 2) * 0.5);
        g.lineTo(-w, (t - 0.5) * 2 * (R - 1));
      }
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 79 lock — sealed doors, locked chests. The other half of `key`.
  {
    name: "lock",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 1.08);
      g.lineWidth = Math.max(1.5, R * 0.2);
      g.beginPath(); g.arc(0, -R * 0.36, R * 0.42, Math.PI, 0); g.stroke();   // shackle
      g.fillRect(-R * 0.7, -R * 0.36, R * 1.4, R * 1.06);                     // body
      g.globalCompositeOperation = "destination-out";                         // keyhole
      g.beginPath(); g.arc(0, R * 0.1, R * 0.16, 0, Math.PI * 2); g.fill();
      g.fillRect(-R * 0.07, R * 0.1, R * 0.14, R * 0.34);
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 80 egg — spawns, hatches, nests. Narrow at the top and fat at the bottom, which is the
  // only thing separating it from `bubble` once both are white masks.
  {
    name: "egg",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      g.beginPath();
      g.moveTo(0, -(R - 1));
      g.bezierCurveTo(R * 0.72, -R * 0.72, R * 0.78, R * 0.34, 0, R - 1);
      g.bezierCurveTo(-R * 0.78, R * 0.34, -R * 0.72, -R * 0.72, 0, -(R - 1));
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 81 heartbreak — damage taken, lost lives, lost love. `heart`'s own path, split down the
  // middle by a jagged cut rather than drawn twice, so the two halves always match.
  {
    name: "heartbreak",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R * 0.86); g.scale(R / 16, R / 16);
      g.beginPath();
      g.moveTo(0, 13);
      g.bezierCurveTo(-14, 2, -14, -9, -6.5, -9);
      g.bezierCurveTo(-2, -9, 0, -5.5, 0, -5.5);
      g.bezierCurveTo(0, -5.5, 2, -9, 6.5, -9);
      g.bezierCurveTo(14, -9, 14, 2, 0, 13);
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out";
      g.lineWidth = 1.7;
      g.beginPath();
      g.moveTo(0, -6); g.lineTo(2.4, -2.4); g.lineTo(-1.8, 2.2); g.lineTo(1.6, 6.4);
      g.lineTo(-0.6, 9.4); g.lineTo(0.6, 13.4);
      g.stroke();
      g.globalCompositeOperation = "source-over";
      g.restore();
    },
  },
  // ---- 82 candy — sweets, cute pickups, party effects.
  {
    name: "candy",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(-0.35);
      g.beginPath(); g.ellipse(0, 0, R * 0.42, R * 0.38, 0, 0, Math.PI * 2); g.fill();
      for (const s of [-1, 1]) {                                      // wrapper twists
        g.beginPath();
        g.moveTo(s * R * 0.36, 0);
        g.lineTo(s * R * 0.88, -R * 0.38);
        g.lineTo(s * R * 0.76, 0);
        g.lineTo(s * R * 0.88, R * 0.38);
        g.closePath(); g.fill();
      }
      g.restore();
    },
  },
  // ---- 83 boost — speed lines, dashes, buff arrows. A double chevron, which reads as motion
  // where the single `arrow` reads as a direction.
  {
    name: "boost",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R);
      for (let i = 0; i < 2; i++) {
        const y = -R * 0.5 + i * R * 0.62;
        g.beginPath();
        g.moveTo(-R * 0.8, y + R * 0.34);
        g.lineTo(0, y - R * 0.3);
        g.lineTo(R * 0.8, y + R * 0.34);
        g.lineTo(R * 0.8, y + R * 0.62);
        g.lineTo(0, y);
        g.lineTo(-R * 0.8, y + R * 0.62);
        g.closePath(); g.fill();
      }
      g.restore();
    },
  },
  // ---- 84 axe — heavy melee, chops, lumber. The bit is concave where `sword`'s edge is straight.
  {
    name: "axe",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(0.35);
      g.fillRect(-R * 0.1, -R * 0.5, R * 0.2, R * 1.4);               // haft
      g.beginPath();                                                  // head
      g.moveTo(-R * 0.08, -R * 0.84);
      g.quadraticCurveTo(R * 0.6, -R * 0.86, R * 0.5, -R * 0.12);
      g.quadraticCurveTo(R * 0.24, -R * 0.36, -R * 0.08, -R * 0.3);
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 85 jaws — bites, maws, monster hits. Two toothed arcs facing each other; the gap between
  // them is what reads as a bite rather than a gear.
  {
    name: "jaws",
    draw(g, R, st, frame) {
      const a0 = Math.PI * 0.14, a1 = Math.PI * 0.86, N = 8;
      g.save(); g.translate(R, R);
      for (const s of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= N; i++) {                                // outer arc
          const a = a0 + (i / N) * (a1 - a0);
          g[i ? "lineTo" : "moveTo"](Math.cos(a) * R * 0.92, s * Math.sin(a) * R * 0.92);
        }
        for (let i = N; i >= 0; i--) {                                // back along the teeth
          const a = a0 + (i / N) * (a1 - a0);
          const rr = (i % 2 ? 0.4 : 0.66) * R;
          g.lineTo(Math.cos(a) * rr, s * Math.sin(a) * rr);
        }
        g.closePath(); g.fill();
      }
      g.restore();
    },
  },
  // ---- 86 puddle — ground decals, spills, blood pools. `splash` is the crown going up; this is
  // what it leaves behind, squashed flat so it sits on the floor plane.
  {
    name: "puddle",
    draw(g, R, st, frame) {
      const n = 11;
      g.save(); g.translate(R, R * 1.05);
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = (0.78 + rnd(5150, i, 1) * 0.2) * R;
        g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r * 0.42);
      }
      g.closePath(); g.fill();
      g.restore();
    },
  },
  // ---- 87 hammer — smithing, blunt impacts, ground pounds.
  {
    name: "hammer",
    draw(g, R, st, frame) {
      g.save(); g.translate(R, R); g.rotate(0.4);
      g.fillRect(-R * 0.54, -R * 0.78, R * 1.08, R * 0.48);           // head
      g.fillRect(-R * 0.12, -R * 0.36, R * 0.24, R * 1.26);           // handle
      g.restore();
    },
  },
  // ---- 88 grenade — explosions at the source, thrown objects, debris with intent.  (26 ops, 3 subpaths)
  pathShape("grenade", [
    ["M",-0.46,0.02],["Q",-0.46,-0.36,-0.3,-0.44],["L",-0.3,-0.62],["L",-0.13,-0.62],["L",-0.13,-0.86],
    ["L",0.13,-0.86],["L",0.13,-0.62],["L",0.3,-0.62],["L",0.3,-0.44],["Q",0.46,-0.36,0.46,0.02],
    ["Q",0.46,0.92,0,0.92],["Q",-0.46,0.92,-0.46,0.02],["Z"],["M",0.3,-0.8],["L",0.62,-0.8],
    ["L",0.62,-0.06],["L",0.44,-0.06],["L",0.44,-0.64],["L",0.3,-0.64],["Z"],["M",0,-0.835],
    ["C",0.058,-0.835,0.105,-0.788,0.105,-0.73],["C",0.105,-0.672,0.058,-0.625,0,-0.625],
    ["C",-0.058,-0.625,-0.105,-0.672,-0.105,-0.73],["C",-0.105,-0.788,-0.058,-0.835,0,-0.835],["Z"]
  ]),
  // ---- 89 bulb — ideas, power-ups, the lights coming on. One closed outline, so it stays legible small.  (86 ops, 1 subpath)
  pathShape("bulb", [
    ["M",-0.24,0.099],["L",-0.278,0.076],["L",-0.313,0.05],["L",-0.346,0.021],["L",-0.377,-0.011],
    ["L",-0.404,-0.045],["L",-0.428,-0.082],["L",-0.449,-0.121],["L",-0.467,-0.161],["L",-0.481,-0.203],
    ["L",-0.491,-0.246],["L",-0.497,-0.289],["L",-0.5,-0.333],["L",-0.499,-0.377],["L",-0.493,-0.421],
    ["L",-0.484,-0.464],["L",-0.472,-0.506],["L",-0.455,-0.547],["L",-0.435,-0.586],["L",-0.412,-0.623],
    ["L",-0.385,-0.658],["L",-0.356,-0.691],["L",-0.324,-0.721],["L",-0.289,-0.748],["L",-0.252,-0.772],
    ["L",-0.213,-0.792],["L",-0.172,-0.809],["L",-0.131,-0.823],["L",-0.088,-0.832],["L",-0.044,-0.838],
    ["L",0,-0.84],["L",0.044,-0.838],["L",0.088,-0.832],["L",0.131,-0.823],["L",0.172,-0.809],
    ["L",0.213,-0.792],["L",0.252,-0.772],["L",0.289,-0.748],["L",0.324,-0.721],["L",0.356,-0.691],
    ["L",0.385,-0.658],["L",0.412,-0.623],["L",0.435,-0.586],["L",0.455,-0.547],["L",0.472,-0.506],
    ["L",0.484,-0.464],["L",0.493,-0.421],["L",0.499,-0.377],["L",0.5,-0.333],["L",0.497,-0.289],
    ["L",0.491,-0.246],["L",0.481,-0.203],["L",0.467,-0.161],["L",0.449,-0.121],["L",0.428,-0.082],
    ["L",0.404,-0.045],["L",0.377,-0.011],["L",0.346,0.021],["L",0.313,0.05],["L",0.278,0.076],
    ["L",0.24,0.099],["L",0.24,0.16],["L",0.27,0.22],["L",0.27,0.3],["L",0.194,0.34],["L",0.194,0.4],
    ["L",0.27,0.44],["L",0.27,0.52],["L",0.194,0.56],["L",0.194,0.62],["L",0.27,0.66],["L",0.27,0.7],
    ["L",0.162,0.8],["L",-0.162,0.8],["L",-0.27,0.7],["L",-0.27,0.66],["L",-0.194,0.62],
    ["L",-0.194,0.56],["L",-0.27,0.52],["L",-0.27,0.44],["L",-0.194,0.4],["L",-0.194,0.34],
    ["L",-0.27,0.3],["L",-0.27,0.22],["L",-0.24,0.16],["Z"]
  ]),
  // ---- 90 dice — luck, crits, random rolls. The five pips are HOLES, not dots.  (63 ops, 6 subpaths)
  pathShape("dice", [
    ["M",0.554,0.794],["L",0.545,0.818],["L",0.531,0.84],["L",0.512,0.857],["L",0.489,0.87],
    ["L",0.465,0.878],["L",0.439,0.88],["L",0.414,0.876],["L",-0.794,0.554],["L",-0.818,0.545],
    ["L",-0.84,0.531],["L",-0.857,0.512],["L",-0.87,0.489],["L",-0.878,0.465],["L",-0.88,0.439],
    ["L",-0.876,0.414],["L",-0.554,-0.794],["L",-0.545,-0.818],["L",-0.531,-0.84],["L",-0.512,-0.857],
    ["L",-0.489,-0.87],["L",-0.465,-0.878],["L",-0.439,-0.88],["L",-0.414,-0.876],["L",0.794,-0.554],
    ["L",0.818,-0.545],["L",0.84,-0.531],["L",0.857,-0.512],["L",0.87,-0.489],["L",0.878,-0.465],
    ["L",0.88,-0.439],["L",0.876,-0.414],["Z"],["M",-0.262,-0.571],
    ["C",-0.197,-0.571,-0.144,-0.518,-0.144,-0.453],["C",-0.144,-0.388,-0.197,-0.335,-0.262,-0.335],
    ["C",-0.328,-0.335,-0.38,-0.388,-0.38,-0.453],["C",-0.38,-0.518,-0.328,-0.571,-0.262,-0.571],["Z"],
    ["M",0.453,-0.38],["C",0.518,-0.38,0.571,-0.328,0.571,-0.262],
    ["C",0.571,-0.197,0.518,-0.144,0.453,-0.144],["C",0.388,-0.144,0.335,-0.197,0.335,-0.262],
    ["C",0.335,-0.328,0.388,-0.38,0.453,-0.38],["Z"],["M",0,-0.118],
    ["C",0.065,-0.118,0.118,-0.065,0.118,0],["C",0.118,0.065,0.065,0.118,0,0.118],
    ["C",-0.065,0.118,-0.118,0.065,-0.118,0],["C",-0.118,-0.065,-0.065,-0.118,0,-0.118],["Z"],
    ["M",-0.453,0.144],["C",-0.388,0.144,-0.335,0.197,-0.335,0.262],
    ["C",-0.335,0.328,-0.388,0.38,-0.453,0.38],["C",-0.518,0.38,-0.571,0.328,-0.571,0.262],
    ["C",-0.571,0.197,-0.518,0.144,-0.453,0.144],["Z"],["M",0.262,0.335],
    ["C",0.328,0.335,0.38,0.388,0.38,0.453],["C",0.38,0.518,0.328,0.571,0.262,0.571],
    ["C",0.197,0.571,0.144,0.518,0.144,0.453],["C",0.144,0.388,0.197,0.335,0.262,0.335],["Z"]
  ]),
  // ---- 91 handcuffs — capture, stun, arrest. Thin by nature — see the size note below.  (34 ops, 6 subpaths)
  pathShape("handcuffs", [
    ["M",-0.47,-0.635],["C",-0.288,-0.635,-0.14,-0.487,-0.14,-0.305],
    ["C",-0.14,-0.123,-0.288,0.025,-0.47,0.025],["C",-0.652,0.025,-0.8,-0.123,-0.8,-0.305],
    ["C",-0.8,-0.487,-0.652,-0.635,-0.47,-0.635],["Z"],["M",-0.426,-0.449],
    ["C",-0.331,-0.449,-0.254,-0.372,-0.254,-0.277],["C",-0.254,-0.182,-0.331,-0.105,-0.426,-0.105],
    ["C",-0.521,-0.105,-0.598,-0.182,-0.598,-0.277],["C",-0.598,-0.372,-0.521,-0.449,-0.426,-0.449],
    ["Z"],["M",0.47,-0.025],["C",0.652,-0.025,0.8,0.123,0.8,0.305],
    ["C",0.8,0.487,0.652,0.635,0.47,0.635],["C",0.288,0.635,0.14,0.487,0.14,0.305],
    ["C",0.14,0.123,0.288,-0.025,0.47,-0.025],["Z"],["M",0.426,0.105],
    ["C",0.521,0.105,0.598,0.182,0.598,0.277],["C",0.598,0.372,0.521,0.449,0.426,0.449],
    ["C",0.331,0.449,0.254,0.372,0.254,0.277],["C",0.254,0.182,0.331,0.105,0.426,0.105],["Z"],
    ["M",-0.235,-0.066],["L",-0.07,0.04],["L",0.008,-0.081],["L",-0.156,-0.187],["Z"],
    ["M",-0.008,0.081],["L",0.156,0.187],["L",0.235,0.066],["L",0.07,-0.04],["Z"]
  ]),
  // ---- 92 paintbrush — painting, art tools, colour splats. A wedge, which is why it reads tiny.  (13 ops, 1 subpath)
  pathShape("paintbrush", [
    ["M",0.666,-0.9],["L",0.759,-0.828],["L",0.117,0.041],["L",0.183,0.092],["L",-0.054,0.396],
    ["L",0.038,0.468],["L",-0.277,0.9],["L",-0.759,0.523],["L",-0.417,0.113],["L",-0.324,0.185],
    ["L",-0.087,-0.118],["L",-0.021,-0.067],["Z"]
  ]),
  // ---- 93 peace — ceasefire, calm, pacifist runs. A band with its spokes inside the hole.  (99 ops, 4 subpaths)
  pathShape("peace", [
    ["M",0,-0.85],["C",0.469,-0.85,0.85,-0.469,0.85,0],["C",0.85,0.469,0.469,0.85,0,0.85],
    ["C",-0.469,0.85,-0.85,0.469,-0.85,0],["C",-0.85,-0.469,-0.469,-0.85,0,-0.85],["Z"],
    ["M",-0.09,-0.037],["L",-0.09,-0.659],["L",-0.139,-0.65],["L",-0.187,-0.638],["L",-0.234,-0.623],
    ["L",-0.279,-0.603],["L",-0.323,-0.581],["L",-0.366,-0.555],["L",-0.406,-0.527],["L",-0.444,-0.495],
    ["L",-0.48,-0.461],["L",-0.513,-0.424],["L",-0.543,-0.384],["L",-0.57,-0.343],["L",-0.594,-0.299],
    ["L",-0.614,-0.254],["L",-0.632,-0.208],["L",-0.645,-0.161],["L",-0.655,-0.112],["L",-0.662,-0.063],
    ["L",-0.665,-0.014],["L",-0.664,0.036],["L",-0.66,0.085],["L",-0.651,0.134],["L",-0.64,0.182],
    ["L",-0.624,0.229],["L",-0.605,0.275],["L",-0.583,0.319],["L",-0.558,0.362],["L",-0.53,0.402],["Z"],
    ["M",0.09,-0.037],["L",0.53,0.402],["L",0.558,0.362],["L",0.583,0.319],["L",0.605,0.275],
    ["L",0.624,0.229],["L",0.64,0.182],["L",0.651,0.134],["L",0.66,0.085],["L",0.664,0.036],
    ["L",0.665,-0.014],["L",0.662,-0.063],["L",0.655,-0.112],["L",0.645,-0.161],["L",0.632,-0.208],
    ["L",0.614,-0.254],["L",0.594,-0.299],["L",0.57,-0.343],["L",0.543,-0.384],["L",0.513,-0.424],
    ["L",0.48,-0.461],["L",0.444,-0.495],["L",0.406,-0.527],["L",0.366,-0.555],["L",0.323,-0.581],
    ["L",0.279,-0.603],["L",0.234,-0.623],["L",0.187,-0.638],["L",0.139,-0.65],["L",0.09,-0.659],["Z"],
    ["M",0,0.127],["L",0.402,0.53],["L",0.377,0.548],["L",0.351,0.565],["L",0.325,0.58],
    ["L",0.298,0.595],["L",0.27,0.608],["L",0.241,0.62],["L",0.212,0.63],["L",0.183,0.639],
    ["L",0.153,0.647],["L",0.123,0.654],["L",0.092,0.659],["L",0.062,0.662],["L",0.031,0.664],
    ["L",0,0.665],["L",-0.031,0.664],["L",-0.062,0.662],["L",-0.092,0.659],["L",-0.123,0.654],
    ["L",-0.153,0.647],["L",-0.183,0.639],["L",-0.212,0.63],["L",-0.241,0.62],["L",-0.27,0.608],
    ["L",-0.298,0.595],["L",-0.325,0.58],["L",-0.351,0.565],["L",-0.377,0.548],["L",-0.402,0.53],["Z"]
  ]),
  // ---- 94 puzzle — collectibles, fragments, the last piece. Best silhouette of the batch.  (80 ops, 1 subpath)
  pathShape("puzzle", [
    ["M",-0.87,-0.87],["L",-0.364,-0.87],["L",-0.364,-0.87],["L",-0.399,-0.832],["L",-0.424,-0.786],
    ["L",-0.44,-0.737],["L",-0.444,-0.685],["L",-0.436,-0.634],["L",-0.418,-0.585],["L",-0.39,-0.542],
    ["L",-0.352,-0.505],["L",-0.308,-0.478],["L",-0.259,-0.461],["L",-0.207,-0.456],["L",-0.156,-0.461],
    ["L",-0.106,-0.478],["L",-0.062,-0.505],["L",-0.025,-0.542],["L",0.004,-0.585],["L",0.022,-0.634],
    ["L",0.029,-0.685],["L",0.025,-0.737],["L",0.01,-0.786],["L",-0.016,-0.832],["L",-0.051,-0.87],
    ["L",-0.051,-0.87],["L",0.456,-0.87],["L",0.456,-0.364],["L",0.456,-0.364],["L",0.494,-0.399],
    ["L",0.539,-0.424],["L",0.589,-0.44],["L",0.641,-0.444],["L",0.692,-0.436],["L",0.741,-0.418],
    ["L",0.784,-0.39],["L",0.82,-0.352],["L",0.847,-0.308],["L",0.864,-0.259],["L",0.87,-0.207],
    ["L",0.864,-0.156],["L",0.847,-0.106],["L",0.82,-0.062],["L",0.784,-0.025],["L",0.741,0.004],
    ["L",0.692,0.022],["L",0.641,0.029],["L",0.589,0.025],["L",0.539,0.01],["L",0.494,-0.016],
    ["L",0.456,-0.051],["L",0.456,-0.051],["L",0.456,0.456],["L",-0.051,0.456],["L",-0.051,0.456],
    ["L",-0.016,0.494],["L",0.01,0.539],["L",0.025,0.589],["L",0.029,0.641],["L",0.022,0.692],
    ["L",0.004,0.741],["L",-0.025,0.784],["L",-0.062,0.82],["L",-0.106,0.847],["L",-0.156,0.864],
    ["L",-0.207,0.87],["L",-0.259,0.864],["L",-0.308,0.847],["L",-0.352,0.82],["L",-0.39,0.784],
    ["L",-0.418,0.741],["L",-0.436,0.692],["L",-0.444,0.641],["L",-0.44,0.589],["L",-0.424,0.539],
    ["L",-0.399,0.494],["L",-0.364,0.456],["L",-0.364,0.456],["L",-0.87,0.456],["Z"]
  ]),
  // ---- 95 rose — romance, gardens, pickups. Wants size; the bloom closes up below ~24px.  (322 ops, 2 subpaths)
  pathShape("rose", [
    ["M",0.091,0.066],["L",0.118,0.068],["L",0.146,0.069],["L",0.173,0.067],["L",0.201,0.061],
    ["L",0.227,0.051],["L",0.251,0.038],["L",0.273,0.021],["L",0.293,0.001],["L",0.309,-0.021],
    ["L",0.323,-0.046],["L",0.334,-0.071],["L",0.343,-0.097],["L",0.351,-0.122],["L",0.359,-0.147],
    ["L",0.366,-0.17],["L",0.374,-0.193],["L",0.383,-0.216],["L",0.394,-0.238],["L",0.405,-0.26],
    ["L",0.417,-0.283],["L",0.429,-0.306],["L",0.44,-0.331],["L",0.45,-0.357],["L",0.458,-0.384],
    ["L",0.462,-0.412],["L",0.462,-0.439],["L",0.458,-0.467],["L",0.451,-0.493],["L",0.439,-0.519],
    ["L",0.423,-0.542],["L",0.405,-0.563],["L",0.385,-0.582],["L",0.364,-0.6],["L",0.342,-0.615],
    ["L",0.321,-0.63],["L",0.3,-0.645],["L",0.28,-0.659],["L",0.262,-0.675],["L",0.244,-0.691],
    ["L",0.226,-0.708],["L",0.208,-0.726],["L",0.19,-0.745],["L",0.17,-0.764],["L",0.149,-0.782],
    ["L",0.127,-0.798],["L",0.102,-0.811],["L",0.076,-0.822],["L",0.049,-0.828],["L",0.022,-0.83],
    ["L",-0.006,-0.828],["L",-0.033,-0.822],["L",-0.06,-0.812],["L",-0.084,-0.8],["L",-0.108,-0.785],
    ["L",-0.13,-0.77],["L",-0.151,-0.754],["L",-0.171,-0.738],["L",-0.191,-0.724],["L",-0.212,-0.71],
    ["L",-0.232,-0.698],["L",-0.254,-0.686],["L",-0.276,-0.675],["L",-0.3,-0.664],["L",-0.323,-0.651],
    ["L",-0.347,-0.637],["L",-0.37,-0.621],["L",-0.391,-0.603],["L",-0.41,-0.583],["L",-0.425,-0.559],
    ["L",-0.437,-0.534],["L",-0.445,-0.508],["L",-0.449,-0.48],["L",-0.449,-0.452],["L",-0.446,-0.425],
    ["L",-0.44,-0.398],["L",-0.433,-0.371],["L",-0.424,-0.346],["L",-0.416,-0.322],["L",-0.408,-0.298],
    ["L",-0.401,-0.275],["L",-0.395,-0.251],["L",-0.39,-0.228],["L",-0.386,-0.203],["L",-0.383,-0.177],
    ["L",-0.379,-0.151],["L",-0.373,-0.124],["L",-0.366,-0.098],["L",-0.356,-0.072],["L",-0.343,-0.047],
    ["L",-0.327,-0.024],["L",-0.308,-0.004],["L",-0.286,0.013],["L",-0.262,0.026],["L",-0.236,0.036],
    ["L",-0.208,0.043],["L",-0.181,0.046],["L",-0.068,0.24],["L",-0.096,0.222],["L",-0.124,0.207],
    ["L",-0.152,0.196],["L",-0.182,0.188],["L",-0.211,0.183],["L",-0.241,0.182],["L",-0.272,0.185],
    ["L",-0.303,0.191],["L",-0.335,0.201],["L",-0.367,0.213],["L",-0.399,0.23],["L",-0.432,0.25],
    ["L",-0.466,0.273],["L",-0.5,0.3],["L",-0.466,0.335],["L",-0.432,0.364],["L",-0.399,0.389],
    ["L",-0.367,0.409],["L",-0.335,0.424],["L",-0.303,0.435],["L",-0.272,0.44],["L",-0.241,0.44],
    ["L",-0.211,0.436],["L",-0.182,0.427],["L",-0.152,0.412],["L",-0.124,0.393],["L",-0.096,0.369],
    ["L",-0.068,0.34],["L",-0.068,0.9],["L",0.068,0.9],["L",0.068,0.76],["L",0.096,0.789],
    ["L",0.124,0.813],["L",0.152,0.832],["L",0.182,0.847],["L",0.211,0.856],["L",0.241,0.86],
    ["L",0.272,0.86],["L",0.303,0.855],["L",0.335,0.844],["L",0.367,0.829],["L",0.399,0.809],
    ["L",0.432,0.784],["L",0.466,0.755],["L",0.5,0.72],["L",0.466,0.693],["L",0.432,0.67],
    ["L",0.399,0.65],["L",0.367,0.633],["L",0.335,0.621],["L",0.303,0.611],["L",0.272,0.605],
    ["L",0.241,0.602],["L",0.211,0.603],["L",0.182,0.608],["L",0.152,0.616],["L",0.124,0.627],
    ["L",0.096,0.642],["L",0.068,0.66],["L",0.068,-0.02],["Z"],["M",0.003,-0.41],["L",0.005,-0.412],
    ["L",0.009,-0.414],["L",0.012,-0.416],["L",0.016,-0.418],["L",0.02,-0.419],["L",0.025,-0.42],
    ["L",0.03,-0.421],["L",0.035,-0.421],["L",0.04,-0.421],["L",0.046,-0.42],["L",0.051,-0.419],
    ["L",0.057,-0.417],["L",0.063,-0.415],["L",0.069,-0.412],["L",0.075,-0.408],["L",0.08,-0.404],
    ["L",0.086,-0.399],["L",0.091,-0.394],["L",0.096,-0.388],["L",0.1,-0.381],["L",0.104,-0.374],
    ["L",0.108,-0.367],["L",0.111,-0.359],["L",0.113,-0.35],["L",0.115,-0.342],["L",0.116,-0.332],
    ["L",0.116,-0.323],["L",0.116,-0.313],["L",0.115,-0.303],["L",0.112,-0.293],["L",0.109,-0.283],
    ["L",0.105,-0.274],["L",0.101,-0.264],["L",0.095,-0.254],["L",0.088,-0.245],["L",0.081,-0.236],
    ["L",0.073,-0.228],["L",0.063,-0.22],["L",0.054,-0.213],["L",0.043,-0.207],["L",0.032,-0.201],
    ["L",0.02,-0.196],["L",0.007,-0.193],["L",-0.006,-0.19],["L",-0.019,-0.188],["L",-0.033,-0.187],
    ["L",-0.047,-0.187],["L",-0.061,-0.189],["L",-0.075,-0.191],["L",-0.09,-0.195],["L",-0.104,-0.2],
    ["L",-0.117,-0.207],["L",-0.131,-0.214],["L",-0.144,-0.223],["L",-0.156,-0.232],["L",-0.168,-0.243],
    ["L",-0.179,-0.255],["L",-0.189,-0.268],["L",-0.198,-0.282],["L",-0.207,-0.297],["L",-0.214,-0.312],
    ["L",-0.22,-0.329],["L",-0.224,-0.346],["L",-0.228,-0.363],["L",-0.229,-0.381],["L",-0.23,-0.4],
    ["L",-0.229,-0.418],["L",-0.226,-0.437],["L",-0.222,-0.455],["L",-0.217,-0.473],["L",-0.21,-0.492],
    ["L",-0.201,-0.509],["L",-0.191,-0.526],["L",-0.18,-0.543],["L",-0.167,-0.558],["L",-0.152,-0.573],
    ["L",-0.137,-0.587],["L",-0.12,-0.599],["L",-0.102,-0.611],["L",-0.083,-0.621],["L",-0.127,-0.715],
    ["L",-0.154,-0.701],["L",-0.179,-0.685],["L",-0.202,-0.668],["L",-0.224,-0.649],["L",-0.244,-0.628],
    ["L",-0.262,-0.606],["L",-0.278,-0.583],["L",-0.293,-0.558],["L",-0.305,-0.533],["L",-0.315,-0.508],
    ["L",-0.323,-0.481],["L",-0.329,-0.455],["L",-0.332,-0.428],["L",-0.334,-0.401],["L",-0.333,-0.374],
    ["L",-0.33,-0.348],["L",-0.326,-0.323],["L",-0.319,-0.298],["L",-0.31,-0.273],["L",-0.3,-0.25],
    ["L",-0.287,-0.228],["L",-0.274,-0.207],["L",-0.258,-0.188],["L",-0.242,-0.17],["L",-0.224,-0.153],
    ["L",-0.205,-0.138],["L",-0.185,-0.125],["L",-0.164,-0.114],["L",-0.143,-0.104],["L",-0.121,-0.096],
    ["L",-0.099,-0.09],["L",-0.076,-0.086],["L",-0.054,-0.084],["L",-0.031,-0.083],["L",-0.009,-0.084],
    ["L",0.013,-0.087],["L",0.034,-0.092],["L",0.054,-0.098],["L",0.074,-0.106],["L",0.093,-0.116],
    ["L",0.111,-0.126],["L",0.127,-0.138],["L",0.143,-0.152],["L",0.157,-0.166],["L",0.17,-0.181],
    ["L",0.182,-0.197],["L",0.192,-0.214],["L",0.2,-0.231],["L",0.207,-0.249],["L",0.213,-0.267],
    ["L",0.217,-0.285],["L",0.219,-0.303],["L",0.22,-0.322],["L",0.22,-0.34],["L",0.218,-0.357],
    ["L",0.215,-0.375],["L",0.21,-0.391],["L",0.204,-0.407],["L",0.197,-0.423],["L",0.188,-0.437],
    ["L",0.179,-0.451],["L",0.168,-0.463],["L",0.157,-0.475],["L",0.145,-0.485],["L",0.133,-0.494],
    ["L",0.119,-0.503],["L",0.106,-0.509],["L",0.092,-0.515],["L",0.078,-0.519],["L",0.063,-0.522],
    ["L",0.049,-0.524],["L",0.035,-0.525],["L",0.021,-0.524],["L",0.007,-0.522],["L",-0.006,-0.519],
    ["L",-0.019,-0.515],["L",-0.032,-0.51],["L",-0.043,-0.504],["L",-0.054,-0.497],["L",-0.064,-0.49],
    ["Z"]
  ]),
  // ---- 96 saxophone — music cues, jazz, sound made visible. The busiest drawing in the roster.  (294 ops, 7 subpaths)
  pathShape("saxophone", [
    ["M",-0.65,-0.277],["L",-0.645,-0.289],["L",-0.638,-0.306],["L",-0.63,-0.324],["L",-0.622,-0.344],
    ["L",-0.613,-0.364],["L",-0.604,-0.384],["L",-0.595,-0.402],["L",-0.586,-0.418],["L",-0.576,-0.434],
    ["L",-0.564,-0.451],["L",-0.552,-0.468],["L",-0.54,-0.485],["L",-0.527,-0.5],["L",-0.515,-0.515],
    ["L",-0.503,-0.528],["L",-0.49,-0.54],["L",-0.476,-0.552],["L",-0.462,-0.564],["L",-0.447,-0.575],
    ["L",-0.433,-0.584],["L",-0.422,-0.591],["L",-0.413,-0.595],["L",-0.409,-0.596],["L",-0.412,-0.596],
    ["L",-0.417,-0.595],["L",-0.419,-0.595],["L",-0.417,-0.594],["L",-0.412,-0.591],["L",-0.407,-0.586],
    ["L",-0.4,-0.58],["L",-0.395,-0.573],["L",-0.391,-0.567],["L",-0.39,-0.565],["L",-0.388,-0.56],
    ["L",-0.386,-0.552],["L",-0.384,-0.539],["L",-0.38,-0.522],["L",-0.377,-0.501],["L",-0.372,-0.477],
    ["L",-0.366,-0.453],["L",-0.359,-0.429],["L",-0.353,-0.405],["L",-0.346,-0.38],["L",-0.339,-0.354],
    ["L",-0.332,-0.328],["L",-0.325,-0.301],["L",-0.318,-0.275],["L",-0.311,-0.248],["L",-0.304,-0.222],
    ["L",-0.298,-0.196],["L",-0.291,-0.168],["L",-0.284,-0.14],["L",-0.278,-0.112],["L",-0.271,-0.084],
    ["L",-0.264,-0.055],["L",-0.256,-0.026],["L",-0.249,0.002],["L",-0.241,0.03],["L",-0.233,0.059],
    ["L",-0.225,0.087],["L",-0.217,0.116],["L",-0.209,0.144],["L",-0.201,0.172],["L",-0.193,0.2],
    ["L",-0.185,0.227],["L",-0.177,0.255],["L",-0.169,0.283],["L",-0.16,0.311],["L",-0.151,0.34],
    ["L",-0.141,0.369],["L",-0.131,0.398],["L",-0.12,0.426],["L",-0.11,0.451],["L",-0.1,0.477],
    ["L",-0.089,0.504],["L",-0.076,0.532],["L",-0.061,0.561],["L",-0.044,0.591],["L",-0.023,0.621],
    ["L",0.001,0.65],["L",0.028,0.676],["L",0.056,0.698],["L",0.085,0.719],["L",0.115,0.738],
    ["L",0.147,0.754],["L",0.181,0.768],["L",0.218,0.78],["L",0.258,0.787],["L",0.301,0.788],
    ["L",0.342,0.783],["L",0.38,0.773],["L",0.415,0.759],["L",0.447,0.743],["L",0.477,0.724],
    ["L",0.505,0.702],["L",0.532,0.677],["L",0.558,0.647],["L",0.58,0.615],["L",0.599,0.584],
    ["L",0.614,0.555],["L",0.627,0.526],["L",0.64,0.5],["L",0.651,0.475],["L",0.662,0.45],
    ["L",0.674,0.422],["L",0.685,0.392],["L",0.696,0.363],["L",0.706,0.334],["L",0.715,0.306],
    ["L",0.725,0.279],["L",0.734,0.253],["L",0.743,0.227],["L",0.752,0.2],["L",0.762,0.172],
    ["L",0.771,0.143],["L",0.78,0.114],["L",0.789,0.085],["L",0.799,0.056],["L",0.807,0.026],
    ["L",0.816,-0.005],["L",0.825,-0.039],["L",0.834,-0.074],["L",0.844,-0.111],["L",0.853,-0.146],
    ["L",0.861,-0.179],["L",0.869,-0.208],["L",0.875,-0.232],["L",0.88,-0.25],["L",0.186,-0.271],
    ["L",0.19,-0.252],["L",0.195,-0.226],["L",0.201,-0.197],["L",0.208,-0.165],["L",0.215,-0.132],
    ["L",0.222,-0.099],["L",0.228,-0.069],["L",0.233,-0.042],["L",0.238,-0.016],["L",0.243,0.011],
    ["L",0.247,0.037],["L",0.251,0.063],["L",0.255,0.089],["L",0.258,0.115],["L",0.262,0.14],
    ["L",0.264,0.166],["L",0.267,0.193],["L",0.269,0.22],["L",0.271,0.245],["L",0.273,0.268],
    ["L",0.275,0.291],["L",0.277,0.311],["L",0.277,0.33],["L",0.277,0.349],["L",0.276,0.372],
    ["L",0.274,0.394],["L",0.272,0.414],["L",0.27,0.431],["L",0.269,0.445],["L",0.269,0.454],
    ["L",0.27,0.459],["L",0.272,0.461],["L",0.272,0.464],["L",0.27,0.47],["L",0.268,0.474],
    ["L",0.266,0.478],["L",0.266,0.481],["L",0.267,0.483],["L",0.27,0.484],["L",0.275,0.486],
    ["L",0.276,0.488],["L",0.269,0.488],["L",0.258,0.486],["L",0.245,0.482],["L",0.23,0.476],
    ["L",0.216,0.468],["L",0.203,0.461],["L",0.193,0.454],["L",0.186,0.448],["L",0.177,0.439],
    ["L",0.168,0.426],["L",0.158,0.41],["L",0.147,0.391],["L",0.135,0.37],["L",0.124,0.346],
    ["L",0.112,0.323],["L",0.101,0.301],["L",0.091,0.279],["L",0.081,0.256],["L",0.071,0.231],
    ["L",0.062,0.206],["L",0.052,0.179],["L",0.042,0.153],["L",0.032,0.126],["L",0.023,0.099],
    ["L",0.013,0.073],["L",0.004,0.046],["L",-0.005,0.02],["L",-0.014,-0.007],["L",-0.023,-0.034],
    ["L",-0.031,-0.061],["L",-0.04,-0.088],["L",-0.048,-0.115],["L",-0.056,-0.142],["L",-0.064,-0.169],
    ["L",-0.072,-0.196],["L",-0.08,-0.224],["L",-0.088,-0.251],["L",-0.096,-0.279],["L",-0.104,-0.306],
    ["L",-0.112,-0.333],["L",-0.12,-0.36],["L",-0.129,-0.387],["L",-0.137,-0.413],["L",-0.145,-0.439],
    ["L",-0.153,-0.464],["L",-0.16,-0.487],["L",-0.167,-0.508],["L",-0.172,-0.526],["L",-0.177,-0.543],
    ["L",-0.181,-0.562],["L",-0.185,-0.583],["L",-0.191,-0.605],["L",-0.199,-0.63],["L",-0.211,-0.656],
    ["L",-0.227,-0.681],["L",-0.244,-0.702],["L",-0.261,-0.72],["L",-0.281,-0.738],["L",-0.304,-0.754],
    ["L",-0.329,-0.768],["L",-0.357,-0.78],["L",-0.39,-0.787],["L",-0.426,-0.788],["L",-0.46,-0.782],
    ["L",-0.49,-0.77],["L",-0.516,-0.757],["L",-0.54,-0.741],["L",-0.561,-0.725],["L",-0.581,-0.708],
    ["L",-0.6,-0.692],["L",-0.618,-0.675],["L",-0.636,-0.656],["L",-0.654,-0.636],["L",-0.671,-0.616],
    ["L",-0.687,-0.594],["L",-0.702,-0.573],["L",-0.716,-0.552],["L",-0.729,-0.531],["L",-0.742,-0.509],
    ["L",-0.755,-0.486],["L",-0.767,-0.461],["L",-0.778,-0.436],["L",-0.788,-0.412],["L",-0.796,-0.391],
    ["L",-0.804,-0.371],["L",-0.809,-0.356],["L",-0.814,-0.345],["Z"],["M",-0.833,-0.263],
    ["L",-0.701,-0.204],["L",-0.79,-0.059],["L",-0.88,-0.099],["Z"],["M",-0.253,-0.485],
    ["C",-0.225,-0.485,-0.202,-0.462,-0.202,-0.434],["C",-0.202,-0.406,-0.225,-0.383,-0.253,-0.383],
    ["C",-0.281,-0.383,-0.304,-0.406,-0.304,-0.434],["C",-0.304,-0.462,-0.281,-0.485,-0.253,-0.485],
    ["Z"],["M",-0.163,-0.165],["C",-0.134,-0.165,-0.111,-0.142,-0.111,-0.113],
    ["C",-0.111,-0.084,-0.134,-0.06,-0.163,-0.06],["C",-0.192,-0.06,-0.216,-0.084,-0.216,-0.113],
    ["C",-0.216,-0.142,-0.192,-0.165,-0.163,-0.165],["Z"],["M",-0.071,0.136],
    ["C",-0.041,0.136,-0.017,0.16,-0.017,0.19],["C",-0.017,0.22,-0.041,0.244,-0.071,0.244],
    ["C",-0.101,0.244,-0.126,0.22,-0.126,0.19],["C",-0.126,0.16,-0.101,0.136,-0.071,0.136],["Z"],
    ["M",0.375,0.354],["C",0.414,0.354,0.445,0.385,0.445,0.423],
    ["C",0.445,0.462,0.414,0.493,0.375,0.493],["C",0.337,0.493,0.306,0.462,0.306,0.423],
    ["C",0.306,0.385,0.337,0.354,0.375,0.354],["Z"],["M",0.395,0.038],
    ["C",0.432,0.038,0.461,0.067,0.461,0.104],["C",0.461,0.14,0.432,0.17,0.395,0.17],
    ["C",0.359,0.17,0.329,0.14,0.329,0.104],["C",0.329,0.067,0.359,0.038,0.395,0.038],["Z"]
  ]),
  // ---- 97 icon — any of the suite's shared icon drawings (crunchyCore glyphs.js, VFX-DESIGN §28): the hearts, coins,
  // skulls, warning signs, button prompts and items CrunchyUI's icons are made of, as a particle. WHICH icon is the
  // patch's `icon` (a glyph NAME, a PATCH_EXTRAS string), not a slider. `sized`: vfx.js asks for this sprite AT THE
  // PARTICLE'S PIXEL SIZE and blits it unsmoothed, so a 12 px heart is the 12 px heart CrunchyUI would draw (glyphMask
  // fills pixel centres, no antialiasing), not a 64 px drawing blurred down to a smudge. Coloured like every shape: a
  // white mask, tinted flat by the tint pass (so hue, ramps, palettes and eras all reach it).
  {
    name: "icon",
    key: (st) => iconName(st.icon) + "," + (st.iconFill || 0),
    sized: true,
    draw(g, R, st, frame) {
      const n = Math.max(1, Math.round(R * 2));
      const m = iconMask(iconName(st.icon), n);
      if (!m) return;
      const img = g.createImageData(n, n), d = img.data;
      for (let i = 0; i < n * n; i++) if (m.a[i]) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
    },
    // AFTER the tint (vfx.js makeSprite): `iconFill` > 0 fills the icon's HOLES (a skull's eyes, a coin's band, the !
    // on a warning sign) in a darker tone of the particle's own colour, so a flat icon gets the two-tone read of a
    // game pickup. 0 (the default) leaves them see-through, as CrunchyUI's bare glyph is.
    after(g, R, st, hue, sat, lum) {
      const fill = Math.max(0, Math.min(1, st.iconFill || 0));
      if (!fill) return;
      const n = Math.max(1, Math.round(R * 2));
      const m = iconMask(iconName(st.icon), n);
      if (!m || !m.holes) return;
      g.globalCompositeOperation = "source-over";
      g.fillStyle = hsl(hue, sat, lum * (1 - 0.8 * fill));
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.holes[y * n + x]) g.fillRect(x, y, 1, 1);
    },
  },
];

// ---- the Icon particle's helpers (§28) -----------------------------------------------------------------------------
// The default icon, and the one an unknown name falls back to (a link from a later core, a typo in a hand-made patch).
const ICON_DEFAULT = "heart";
// The glyphs the Icon picker OFFERS: every core glyph except the `ported` ones (VFX's own shapes, already in the shape
// picker under their own names) and the `hidden` ones (duplicates, or drawings that do not read). A patch may still
// NAME any glyph and it draws; the list only decides what is shown.
function iconOffered() {
  if (typeof glyphNames !== "function") return [];
  return glyphNames().filter((n) => { const i = glyphInfo(n); return i && !i.ported && !i.hidden; });
}
function iconName(name) {
  return (typeof glyphInfo === "function" && name && glyphInfo(name)) ? name : ICON_DEFAULT;
}
// Masks by name and size. A particle that grows asks for every size on its way, so this is a cache, not a nicety.
const iconMaskCache = new Map();
function iconMask(name, n) {
  if (typeof glyphMask !== "function") return null;
  const k = name + "|" + n;
  let m = iconMaskCache.get(k);
  if (m === undefined) {
    m = glyphMask(name, n) || null;
    if (m) m.holes = iconHoles(m.a, n);
    if (iconMaskCache.size > 4000) iconMaskCache.clear();
    iconMaskCache.set(k, m);
  }
  return m;
}
// The HOLES of a mask: the empty pixels the outside cannot reach (4-connected flood from the border). null if none.
function iconHoles(a, n) {
  const out = new Uint8Array(n * n), seen = new Uint8Array(n * n), stack = [];
  for (let i = 0; i < n; i++) stack.push(i, (n - 1) * n + i, i * n, i * n + n - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || a[p]) continue;
    seen[p] = 1;
    const x = p % n, y = (p / n) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < n - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - n);
    if (y < n - 1) stack.push(p + n);
  }
  let any = false;
  for (let p = 0; p < n * n; p++) if (!a[p] && !seen[p]) { out[p] = 1; any = true; }
  return any ? out : null;
}

// The patch format stores `shape` as an index into this list — see the APPEND ONLY note.
const SHAPES = SHAPE_DEFS.map((d) => d.name);

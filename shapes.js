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
    key: (st) => st.crescentArc + "," + st.crescentThick,
    draw(g, R, st, frame) {
      const th = Math.max(1, R * st.crescentThick), arc = st.crescentArc * Math.PI * 2;
      g.lineWidth = th; g.lineCap = "round";
      g.beginPath();
      g.arc(R, R, R - th / 2 - 1, -Math.PI / 2 - arc / 2, -Math.PI / 2 + arc / 2);
      g.stroke();
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
];

// The patch format stores `shape` as an index into this list — see the APPEND ONLY note.
const SHAPES = SHAPE_DEFS.map((d) => d.name);

"use strict";
// CrunchyVFX — SEAMLESS TEXTURES (VFX-DESIGN §66), the PAGE half of tests/seam.mjs. Inside the real index.html it
//   1. measures every Textures preset: the seams (each frame's last column against its first, last row against first, next
//      to the ordinary neighbor steps NEAR them) and the loop (the last frame to the first, next to an ordinary step);
//   2. proves the fold exactly: an effect drawn half a tile over IS the tile rolled by half (so the seam is an ordinary
//      interior line), for particles, the pixel layer and a cross-faded layer; and the Field's patterns are periodic in
//      space and in time to the last bit;
//   3. proves Tile OFF is byte for byte (no tile files; the same frames with tile: 0 written out), the Tiled view, the
//      texture stand (room and export);
//   4. hands each preset's Export files (Godot 4 + "3D scene too") to Node: "VFX SEAM {meta}" then "VFX FILE <i> <name> <b64>".
(async function () {
  const say = (l) => { try { dump("VFX " + l + "\n"); } catch (e) { /* dump off */ } };
  let fails = 0;
  const t = (name, pass, why) => { say((pass ? "PASS " : "FAIL ") + name + (pass || !why ? "" : " — " + why)); if (!pass) fails++; };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const data = (cv) => { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height); return { w: d.width, h: d.height, data: d.data }; };
  const f3 = (v) => +(+v).toFixed(3);
  // (1.3: every preset that tiles, whatever its category: the Textures category AND the Dungeon pack's surfaces)
  const TEX = Object.keys(PRESETS).filter((n) => PRESETS[n].tile === 1);
  // the seam next to its own neighborhood: the mean difference across the seam's pair of columns (axis 0) or rows (1),
  // next to the mean of the ordinary pairs within 3 art pixels of it that are not inside one art pixel (P: its size)
  const local = (F, P, axis) => {
    const w = F.w, h = F.h, d = F.data, n = axis ? h : w, m = axis ? w : h;
    const at = (a, b) => (axis ? (a * w + b) : (b * w + a)) * 4;
    const pair = (a) => { let s = 0; const a2 = (a + 1) % n; for (let b = 0; b < m; b++) for (let c = 0; c < 4; c++) s += Math.abs(d[at(a2, b) + c] - d[at(a, b) + c]); return s / m / 4; };
    const seam = pair(n - 1);
    let s = 0, k = 0;
    for (let o = -3 * P; o <= 3 * P; o++) { const a = ((n - 1 + o) % n + n) % n; if (o === 0 || (a + 1) % P !== 0) continue; s += pair(a); k++; }
    return { seam: seam, near: k ? s / k : 0 };
  };
  try {
    if (typeof endTour === "function") endTour(false);
    t(TEX.length + " presets tile (the Textures category and the Dungeon surfaces), every one standing as a surface in 3D",
      TEX.length >= 4 && TEX.every((n) => PRESETS[n] && PRESETS[n].tile === 1 && fx3dAutoOf(n) === "texture" && fx3dStand(presetOutcome(PRESETS[n], true), n) === "texture"), TEX.join(", "));
    // ---- 1. every texture: seams and the loop ----
    const metas = [];
    for (const name of TEX) {
      applyPreset(PRESETS[name], name, true);
      const fr = rendered.canvases.map(data), n = fr.length, P = Math.max(1, Math.round(state.fieldPixel || 1));
      const m = seamMeasure(fr);
      let worst = 0, worstAt = "", sumR = 0, cntR = 0;
      fr.forEach((F, i) => {
        for (const ax of [0, 1]) {
          const L = local(F, P, ax), r = L.seam / Math.max(1, L.near);
          sumR += r; cntR++;
          if (r > worst) { worst = r; worstAt = "frame " + i + (ax ? " rows" : " columns") + ": seam " + f3(L.seam) + " vs near " + f3(L.near); }
        }
      });
      const loopR = m.loop / Math.max(0.5, m.step);
      say("INFO " + name + ": " + rendered.w + "x" + rendered.h + ", " + n + " frames at " + rendered.fps + " fps; seam/near mean " + f3(sumR / cntR) + ", worst " + f3(worst) + " (" + worstAt +
        "); mean seam X " + f3(m.seamX) + " vs step " + f3(m.stepX) + ", Y " + f3(m.seamY) + " vs " + f3(m.stepY) + "; loop " + f3(m.loop) + " vs step " + f3(m.step));
      t(name + ": no seam (across each edge, on average no more than the ordinary steps beside it: " + f3(sumR / cntR) + "x)", sumR / cntR <= 1.25, worstAt);
      t(name + ": the loop closes (last frame to first " + f3(m.loop) + " vs an ordinary step " + f3(m.step) + ")", loopR <= 1.25, f3(loopR));
      metas.push({ name: name, w: rendered.w, h: rendered.h, frames: n, fps: rendered.fps, fieldPixel: P, seamMean: f3(sumR / cntR), seamWorst: f3(worst), loopDiff: f3(m.loop), stepDiff: f3(m.step),
                   opaque: fr.every((F) => { for (let i = 3; i < F.data.length; i += 4) if (F.data[i] !== 255) return false; return true; }) });
    }
    // ---- 2. exact proofs ----
    // the Field: every pattern periodic in u, v (whole tiles) and in time (whole loops), to the bit, and continuous through the edge
    {
      const bad = [];
      for (let k = 0; k < FIELD_KINDS.length; k++) {
        const st = presetOutcome({ field: 1, fieldKind: k, fieldScale: 3, fieldSpeed: 2, fieldWarp: 0.6, tile: 1 }, true);
        const fn = seamFieldFn(st, 96, 96, 7, 24);
        for (let i = 0; i < 300; i++) {
          const u = Math.random(), v = Math.random(), ph = Math.random(), e = 1e-7;
          const a = fn(u, v, ph, 3, 4);
          if (Math.abs(a - fn(u + 1, v, ph, 3, 4)) > 1e-9 || Math.abs(a - fn(u, v + 1, ph, 3, 4)) > 1e-9 || Math.abs(fn(u, v, 0, 3, 4) - fn(u, v, 1, 3, 4)) > 1e-9) { bad.push(FIELD_KINDS[k] + " at " + u.toFixed(3)); break; }
          if (FIELD_KINDS[k] !== "runes" && FIELD_KINDS[k] !== "static" && Math.abs(fn(1 - e, v, ph, 3, 4) - fn(-e, v, ph, 3, 4)) > 1e-9) { bad.push(FIELD_KINDS[k] + " across the edge"); break; }
        }
      }
      t("the Field: all " + FIELD_KINDS.length + " patterns are periodic across the tile (u + 1, v + 1) and round the loop (phase 0 = phase 1), to the bit", !bad.length, bad.join("; "));
    }
    // the fold: drawn half a tile over = the tile rolled by half (particles; the pixel layer; a cross-faded layer)
    const roll = (F, dx, dy) => { const o = new Uint8ClampedArray(F.data.length); for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) { const s = (y * F.w + x) * 4, d = (((y + dy) % F.h) * F.w + ((x + dx) % F.w)) * 4; for (let c = 0; c < 4; c++) o[d + c] = F.data[s + c]; } return o; };
    for (const [label, patch] of [
      ["particles (wrapped and folded, with glow)", { tile: 1, frameSize: 2, count: 60, emitter: 6, emitRadius: 0.5, emitTime: 1, speed: 30, speedVar: 0.5, wind: 40, gravity: -40, drag: 0,
        life: 1.4, lifeVar: 0.3, size: 6, sizeVar: 0.4, hue: 190, sat: 0.8, coreWhite: 0.7, fadeIn: 0.2, fadeOut: 0.5, duration: 2, fps: 12, glow: 0.4, glowRadius: 4 }],
      ["the pixel layer (Pixel Embers: its grid on the big canvas)", Object.assign({}, PRESETS["Pixel Embers"], { tile: 1 })],
      ["a cross-faded layer (Rune Circle's sigil)", Object.assign({}, PRESETS["Rune Circle"], { tile: 1 })],
    ]) {
      applyPreset(patch, "shift", true);
      const A = rendered.canvases.map(data), W = rendered.w, H = rendered.h;
      const Fw = frameDims(state).w, Fh = frameDims(state).h;
      state.originX = +state.originX + (W / 2) / Fw; state.originY = +state.originY + (H / 2) / Fh; rerender();
      const B = rendered.canvases.map(data);
      let worst = 0, sum = 0, cnt = 0;
      A.forEach((F, i) => { const R = roll(F, W / 2, H / 2), D = B[i].data; for (let j = 0; j < R.length; j++) { const d = Math.abs(R[j] - D[j]); worst = Math.max(worst, d); sum += d; cnt++; } });
      let drawn = 0; A.forEach((F) => { for (let j = 3; j < F.data.length; j += 4) if (F.data[j]) drawn++; });
      say("INFO shift test, " + label + ": " + (100 * drawn / (A.length * W * H)).toFixed(1) + " % of the pixels drawn; mean " + f3(sum / cnt) + ", worst " + worst + " (of 255), " + A.length + " frames of " + W + "x" + H);
      t("the fold is exact for " + label + ": drawn half a tile over, every frame is the tile rolled by half (mean difference " + f3(sum / cnt) + " of 255)", sum / cnt < 0.6, "worst " + worst);
    }
    // ---- 3. off is byte for byte; the view; the stand ----
    {
      const SET = { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emissive: false, sound: false, scales: [1], playback: "auto" };
      const bytesEq = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
      for (const n of ["Explosion", "Pixel Torch", "Rain"]) {
        applyPreset(PRESETS[n], n, true);
        const A = rendered.canvases.map((c) => c.toDataURL());
        const f1 = (await buildExportBundle(null, SET)).files;
        applyPreset(Object.assign({}, PRESETS[n], { tile: 0, field: 0, tileSize: 0, tileLoop: 0 }), n, true);
        const B = rendered.canvases.map((c) => c.toDataURL());
        const f2 = (await buildExportBundle(null, SET)).files;
        t(n + ": Tile off (and the Field off) draws every frame and writes every file exactly as with no tile rows; no tile files",
          A.length === B.length && A.every((x, i) => x === B[i]) && f1.length === f2.length && f1.every((f, i) => f.name === f2[i].name && bytesEq(f.data, f2[i].data)) &&
          !f1.some((f) => /_tile/.test(f.name)), f1.map((f) => f.name).join(" "));
      }
      const iT = PARAMS.findIndex((p) => p[0] === "tile"), iD = PARAMS.findIndex((p) => p[0] === "d3LightPower");
      t("Tile and the Field default off (0); their rows are appended after the 3D rows", PARAM_BY_KEY.tile[5] === 0 && PARAM_BY_KEY.field[5] === 0 && iT > iD, iT + " " + iD);
    }
    {
      applyPreset(PRESETS["Explosion"], "Explosion", true);
      const hidden0 = document.getElementById("tabTiled").hidden, k0 = seamViewK();
      applyPreset(PRESETS["Water Caustics"], "Water Caustics", true);
      const shown = !document.getElementById("tabTiled").hidden, k1 = seamViewK(), sw = stage.width, rw = rendered.w;
      applyPreset(PRESETS["Explosion"], "Explosion", true);
      const back = document.getElementById("tabTiled").hidden && seamViewK() === 1 && stage.width === rendered.w;
      t("the Tiled view: hidden for a sprite; opens with Tile on and draws the tile 3 x 3 (stage " + sw + " px for a " + rw + " px tile); goes with Tile off",
        hidden0 && k0 === 1 && shown && k1 === 3 && sw === 3 * rw && back, JSON.stringify({ hidden0, k0, shown, k1, sw, rw, back }));
    }
    {
      applyPreset(PRESETS["Lava Crust"], "Lava Crust", true);
      const fr = rendered.canvases.map(data), masks = fx3dMasksOf(rendered.canvases, state), mpp = fx3dMetersPerPixel(state, fx3dBounds(masks), "Lava Crust");
      let ok = false, P = null;
      try { await r3vLoad(); P = room3dPlace(fr, "texture", mpp, null, {}); const pic = room3dRender({ room: "dungeon", place: P, frame: fr[0] }); ok = pic.data.length === pic.w * pic.h * 4; } catch (e) { ok = false; say("INFO room: " + e.message); }
      // pictures of the room, to look at (tests/seam.mjs saves them)
      for (const nm of ["Lava Crust", "Water Caustics", "Force Field"]) {
        applyPreset(PRESETS[nm], nm, true);
        const fr2 = rendered.canvases.map(data), mk = fx3dMasksOf(rendered.canvases, state);
        const P2 = room3dPlace(fr2, "texture", fx3dMetersPerPixel(state, fx3dBounds(mk), nm), null, {}), V = room3dView(P2);
        const pic = room3dRender({ room: "dungeon", place: P2, frame: fr2[0], yaw: V.yaw, pitch: V.pitch, dist: V.dist, ty: V.ty });
        const cv = document.createElement("canvas"); cv.width = pic.w; cv.height = pic.h; cv.getContext("2d").putImageData(new ImageData(pic.data, pic.w, pic.h), 0, 0);
        say("PNG room-" + sanitize(nm) + ".png " + cv.toDataURL("image/png").split(",")[1]);
      }
      t("the room: a texture covers its floor (room3dRender draws it), " + (mpp * rendered.w).toFixed(2) + " m a tile", ok && P && P.stand === "texture", "");
    }
    // ---- 4. the exports, for Godot ----
    const SET = { format: "sheet", layout: "grid", meta: "godot", trim: false, pot: false, emissive: false, sound: false, scales: [1], playback: "auto", d3: true };
    let i = 0;
    for (const name of TEX) {
      applyPreset(PRESETS[name], name, true);
      const base = sanitize(name), out = await buildExportBundle(null, Object.assign({ base: base, label: name }, SET));
      const names = out.files.map((f) => f.name);
      const want = [base + "_tile.png", base + "_tile.png.import", base + "_tile.json", base + "_tile_3d.gdshader", base + "_tile_2d.gdshader", base + "_tile_3d.tres",
        base + "_tile_2d.tres", base + "_tile_3d.tscn", base + "_tile_2d.tscn", base + "_tile_README.txt", base + "_3d.tscn", base + "_3d.json"];
      const frames = names.filter((x) => x.indexOf(base + "_tile_frames/") === 0).length;
      t(name + ": the export carries the tile's files (" + want.length + " + " + frames + " frame PNGs)", want.every((w) => names.indexOf(w) >= 0) && frames === rendered.canvases.length,
        want.filter((w) => names.indexOf(w) < 0).join(" "));
      const meta = Object.assign({ base: base, i: i }, metas.find((m) => m.name === name), JSON.parse(new TextDecoder().decode(out.files.find((f) => f.name === base + "_tile.json").data)));
      say("SEAM " + JSON.stringify(meta));
      for (const f of out.files) if (!/_tile_frames\//.test(f.name) || /_000\.png$/.test(f.name)) say("FILE " + i + " " + f.name + " " + b64(f.data));
      i++;
    }
  } catch (e) {
    t("threw", false, e.message + " " + (e.stack || "").split("\n").slice(0, 4).join(" | "));
  }
  say("END " + (fails ? "FAIL " + fails : "PASS"));
})();

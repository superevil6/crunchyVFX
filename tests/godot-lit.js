"use strict";
// CrunchyVFX: the PAGE half of tests/godot-lit.mjs (VFX-DESIGN §65, lit effects): inside the real index.html, it
//   1. proves Lit OFF changes nothing: an effect with every Lit row moved but `lit` 0 exports exactly the bytes it did with
//      the rows at their defaults (2D and 3D), and Lit ON leaves every color file alone (the sheet, the .tres, the 3D
//      .json's other keys), adding <base>_n.png (as large as the sheet) and the scenes' lit parts;
//   2. checks the normal maps: opaque, flat (128,128,255) where nothing is drawn and on glowing pixels, tilted toward the
//      outside at a puff's edges (left edge points left, top edge points up), crisp blocks on a pixel effect's art grid;
//   3. draws the pictures to look at (the stage's test light from the left and from the right; the room lit by a torch
//      on the left and on the right) and hands them to Node as "VFX PIC <name> <base64 png>";
//   4. exports the lit presets (and a lit Pixel Explosion: fire that glows over smoke that shades) for Godot, 2D and 3D:
//      "VFX LIT {meta}" then "VFX FILE <i> <name> <base64>".
(async function () {
  const say = (l) => { try { dump("VFX " + l + "\n"); } catch (e) { /* dump off */ } };
  let fails = 0;
  const t = (name, pass, why) => { say((pass ? "PASS " : "FAIL ") + name + (pass || !why ? "" : " — " + why)); if (!pass) fails++; };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const bytes = (d) => (typeof d === "string" ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
  const eq = (a, b) => { a = bytes(a); b = bytes(b); if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  const txt = (f) => new TextDecoder().decode(bytes(f.data));
  const pngOf = async (cv) => new Uint8Array(await (await canvasBlob(cv)).arrayBuffer());
  const canvasOf = (pic, k) => {
    const cv = document.createElement("canvas"); cv.width = pic.w * k; cv.height = pic.h * k;
    const tmp = document.createElement("canvas"); tmp.width = pic.w; tmp.height = pic.h;
    tmp.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pic.data), pic.w, pic.h), 0, 0);
    const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, cv.width, cv.height);
    return cv;
  };
  const LIT = ["Lit Dust Cloud", "Lit Pixel Dust", "Lit Rock Burst", "Lit Smoke Column"];
  try {
    if (typeof endTour === "function") endTour(false);
    const SET = { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emissive: false, sound: false, scales: [1], playback: "auto" };

    // 1. OFF changes nothing; ON adds files and leaves the color files alone
    for (const n of ["Smoke Puff", "Pixel Explosion", "Pixel Rock Burst"]) {
      applyPreset(PRESETS[n], n, true);
      const plain = (await buildExportBundle(null, Object.assign({}, SET, { d3: true }))).files;
      Object.assign(state, { litRound: 0.2, litBump: 0.9, litParts: 1 }); rerender();
      const moved = (await buildExportBundle(null, Object.assign({}, SET, { d3: true }))).files;
      t(n + ": Lit off with every other Lit row moved exports exactly the same files, byte for byte (2D and 3D)",
        plain.length === moved.length && plain.every((f, i) => f.name === moved[i].name && eq(f.data, moved[i].data)), plain.map((f) => f.name).join(" "));
      Object.assign(state, { lit: 1, litRound: 0.6, litBump: 0.4, litParts: 0 }); rerender();
      const on = (await buildExportBundle(null, Object.assign({}, SET, { d3: true }))).files;
      const base = on.find((f) => /\.tres$/.test(f.name)).name.replace(/\.tres$/, "");
      const same = plain.filter((f) => /\.(png|tres|wav)$/.test(f.name) || f.name === base + ".gd" || f.name === base + "_3d.gd");
      t(n + ": Lit on leaves the sheet, the SpriteFrames and both scripts byte for byte, and adds " + base + "_n.png",
        same.every((f) => { const g = on.find((x) => x.name === f.name); return g && eq(f.data, g.data); }) && on.some((f) => f.name === base + "_n.png") &&
        on.length === plain.length + 1, on.map((f) => f.name).join(" "));
      const t2 = txt(on.find((f) => f.name === base + ".tscn")), t3 = txt(on.find((f) => f.name === base + "_3d.tscn"));
      t(n + ": the 2D scene's Sprite wears the lit material over " + base + "_n.png; the 3D sprite a material_override with the sheet and its normals",
        t2.indexOf('path="' + base + '_n.png"') >= 0 && /\[node name="Sprite" type="AnimatedSprite2D" parent="\."\]\nmaterial = SubResource\("Lit"\)/.test(t2) &&
        /material_override = SubResource\("Lit"\)/.test(t3) && t3.indexOf('path="' + base + '.png"') >= 0 && t3.indexOf('path="' + base + '_n.png"') >= 0,
        t2.slice(0, 300));
      const j0 = JSON.parse(txt(plain.find((f) => f.name === base + "_3d.json"))), j1 = JSON.parse(txt(on.find((f) => f.name === base + "_3d.json")));
      t(n + ": the 3D .json gains only normalSheet", j1.normalSheet === base + "_n.png" && JSON.stringify(Object.assign({}, j1, { normalSheet: undefined })) === JSON.stringify(j0));
      // the normal sheet lines up with the color sheet
      const sheetImg = async (name) => { const f = on.find((x) => x.name === name); const bm = await createImageBitmap(new Blob([f.data], { type: "image/png" })); return { w: bm.width, h: bm.height }; };
      const a = await sheetImg(base + ".png"), b = await sheetImg(base + "_n.png");
      t(n + ": <base>_n.png is exactly the sheet's size (" + a.w + "x" + a.h + ")", a.w === b.w && a.h === b.h, b.w + "x" + b.h);
      if (n === "Pixel Explosion") t(n + ": it glows, so the 2D scene has the Glow child (unshaded, synced) and the README says so",
        /\[node name="Glow" type="AnimatedSprite2D" parent="Sprite"\]/.test(t2) && /render_mode unshaded/.test(t2) && /What GLOWS stays as drawn/.test(txt(on.find((f) => f.name === "README.txt"))));
      if (n === "Smoke Puff") t(n + ": nothing glows, so no Glow child", !/name="Glow"/.test(t2));
    }
    // Variety's baked sheets: one stacked normal sheet beside the stacked sheet
    {
      applyPreset(PRESETS["Lit Pixel Dust"], "Lit Pixel Dust", true);
      state.variety = "fh:1,b:3"; rerender();
      const on = (await buildExportBundle(null, SET)).files;
      const base = on.find((f) => /\.tres$/.test(f.name)).name.replace(/\.tres$/, "");
      const dim = async (name) => { const bm = await createImageBitmap(new Blob([on.find((x) => x.name === name).data], { type: "image/png" })); return bm.width + "x" + bm.height; };
      t("a varied lit effect's baked variations: one stacked _n.png the size of the stacked sheet",
        on.some((f) => f.name === base + "_n.png") && (await dim(base + ".png")) === (await dim(base + "_n.png")));
      state.variety = ""; rerender();
    }

    // 2. the normal maps themselves
    {
      applyPreset(PRESETS["Lit Dust Cloud"], "Lit Dust Cloud", true);
      const i = Math.floor(rendered.canvases.length * 0.4), cv = rendered.canvases[i];
      const img = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height), f = { w: img.width, h: img.height, data: img.data };
      const n = litNormals(f, state, { cell: 1 });
      let opaque = true, flatEmpty = true, left = 0, right = 0, up = 0, down = 0;
      let x0 = f.w, x1 = 0, y0 = f.h, y1 = 0;
      for (let p = 0; p < f.w * f.h; p++) {
        if (n.data[p * 4 + 3] !== 255) opaque = false;
        if (!f.data[p * 4 + 3]) { if (n.data[p * 4] !== 128 || n.data[p * 4 + 1] !== 128 || n.data[p * 4 + 2] !== 255) flatEmpty = false; continue; }
        const x = p % f.w, y = (p / f.w) | 0;
        if (f.data[p * 4 + 3] > 60) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      // the drawn box's left and right thirds, top and bottom thirds: the mean normal x / y there
      const mean = (xa, xb, ya, yb, c) => { let s = 0, k = 0; for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const p = (y * f.w + x) * 4; if (f.data[p + 3] > 60) { s += n.data[p + c] - 128; k++; } } return k ? s / k : 0; };
      const w3 = Math.max(1, ((x1 - x0) / 4) | 0), h3 = Math.max(1, ((y1 - y0) / 4) | 0);
      left = mean(x0, x0 + w3, y0, y1, 0); right = mean(x1 - w3, x1, y0, y1, 0); up = mean(x0, x1, y0, y0 + h3, 1); down = mean(x0, x1, y1 - h3, y1, 1);
      t("a dust cloud's normals: opaque, flat where nothing is drawn, its left side faces left, its right side right, its top up, its bottom down",
        opaque && flatEmpty && left < -8 && right > 8 && up > 8 && down < -8, [opaque, flatEmpty, left.toFixed(1), right.toFixed(1), up.toFixed(1), down.toFixed(1)].join(" "));
      // glowing pixels are flat; with Lit parts "Everything" they are shaded too
      applyPreset(PRESETS["Pixel Explosion"], "Pixel Explosion", true);
      state.lit = 1; rerender();
      const g = rendered.canvases[4], gi = g.getContext("2d").getImageData(0, 0, g.width, g.height), gf = { w: gi.width, h: gi.height, data: gi.data };
      const cell = litCell(state, rendered.w, rendered.h, 1), n0 = litNormals(gf, state, { cell: cell });
      state.litParts = 1;
      const n1 = litNormals(gf, state, { cell: cell });
      let glowFlat = true, glowN = 0, tilted = 0;
      const thr = state.glowThresh * 255;
      for (let p = 0; p < gf.w * gf.h; p++) {
        const d = gf.data, q = p * 4;
        if (!d[q + 3] || (d[q] * 0.3 + d[q + 1] * 0.6 + d[q + 2] * 0.1) * (d[q + 3] / 255) < thr) continue;
        glowN++;
        if (n0.data[q] !== 128 || n0.data[q + 1] !== 128 || n0.data[q + 2] !== 255) glowFlat = false;
        if (n1.data[q] !== 128 || n1.data[q + 1] !== 128) tilted++;
      }
      t("glowing pixels keep the flat normal (" + glowN + " of them); with Lit parts Everything they tilt too (" + tilted + ")", glowN > 20 && glowFlat && tilted > glowN / 4);
      // a pixel effect's normals are whole art pixels: every cell one normal
      let blocks = true;
      for (let y = 0; y + cell <= gf.h && blocks; y += cell) for (let x = 0; x + cell <= gf.w && blocks; x += cell) {
        const q0 = (y * gf.w + x) * 4;
        for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
          const q = ((y + yy) * gf.w + x + xx) * 4;
          const glowQ = (gf.data[q] * 0.3 + gf.data[q + 1] * 0.6 + gf.data[q + 2] * 0.1) * (gf.data[q + 3] / 255) >= thr;
          if (gf.data[q + 3] && !glowQ && (n1.data[q] !== n1.data[q0] || n1.data[q + 1] !== n1.data[q0 + 1])) blocks = false;
        }
      }
      t("a pixel effect's normals are crisp: one normal per art pixel (" + cell + " x " + cell + " frame pixels)", cell >= 2 && blocks);
    }

    // 3. pictures: the stage's test light from the left and from the right, and the room's torch on each side
    await r3vLoad();
    // the torch at the camera's left or right (the camera at yaw 0.55: right = (cos, 0, -sin), toward it = (sin, 0, cos)), a little toward it
    const torchRoom = (side) => { const c = Math.cos(0.55), sn = Math.sin(0.55), R = room3dRoom("cellar");
      return Object.assign({}, R, { torch: Object.assign({}, R.torch, { pos: [side * 1.8 * c + 0.9 * sn, 1.4, -side * 1.8 * sn + 0.9 * c] }) }); };
    const EMPTY = (f) => ({ w: f.w, h: f.h, data: new Uint8ClampedArray(f.data.length) });
    for (const n of LIT.concat(["Pixel Explosion"])) {
      applyPreset(PRESETS[n], n, true);
      if (n === "Pixel Explosion") { state.lit = 1; rerender(); }
      const N = rendered.canvases.length, picks = [0.25, 0.45, 0.7].map((k) => Math.min(N - 1, Math.floor(N * k)));
      const cell = litCell(state, rendered.w, rendered.h, 1), W = rendered.w, H = rendered.h, K = W <= 96 ? 3 : 2;
      const sheet = document.createElement("canvas"); sheet.width = W * K * 4; sheet.height = H * K * picks.length;
      const g = sheet.getContext("2d"); g.fillStyle = "#16141c"; g.fillRect(0, 0, sheet.width, sheet.height); g.imageSmoothingEnabled = false;
      picks.forEach((fi, row) => {
        const cv = rendered.canvases[fi], im = cv.getContext("2d").getImageData(0, 0, W, H), f = { w: W, h: H, data: im.data };
        const nm = litNormals(f, state, { cell: cell });
        const L = (x) => litShade(f, nm, state, { x: x, y: H * 0.35, z: Math.min(W, H) * 0.3, color: [1, 0.8, 0.55], energy: 1.1, ambient: 0.16 });
        [f, nm, L(W * 0.05), L(W * 0.95)].forEach((pic, col) => g.drawImage(canvasOf(pic, K), col * W * K, row * H * K));
      });
      say("PIC stage-" + n.replace(/\W+/g, "-").toLowerCase() + " " + b64(await pngOf(sheet)));
      // the room: the 3D view's own preparation, then the torch on the left and on the right
      r3v.key = null; r3v.open = true; r3vPrep();
      const fi = picks[1], cam = r3vCam();
      const pics = [-1, 1].map((side) => room3dRender(Object.assign({ room: torchRoom(side), place: r3v.place, frame: r3v.frames[fi], light: null,
        lit: { normal: r3v.normals[fi].data, glow: litGlow(state), steps: litSteps(state) } }, cam, { yaw: 0.55 })));
      const unlit = room3dRender(Object.assign({ room: torchRoom(-1), place: r3v.place, frame: r3v.frames[fi], light: null }, cam, { yaw: 0.55 }));
      const rs = document.createElement("canvas"); rs.width = 320 * 3 * 2; rs.height = 200 * 2;
      const rg = rs.getContext("2d"); rg.imageSmoothingEnabled = false;
      [unlit, pics[0], pics[1]].forEach((p, i) => rg.drawImage(canvasOf(p, 2), i * 640, 0));
      say("PIC room-" + n.replace(/\W+/g, "-").toLowerCase() + " " + b64(await pngOf(rs)));
      // the rooms as the 3D view shows them (its own camera): the Torchlit cellar and the Dungeon, lit
      const as = ["cellar", "dungeon"].map((id) => room3dRender(Object.assign({ room: id, place: r3v.place, frame: r3v.frames[fi], light: r3v.light && r3v.light.on ? { color: r3v.light.color, energy: r3v.light.energies[fi] || 0, range: r3v.light.range } : null,
        lit: { normal: r3v.normals[fi].data, glow: litGlow(state), steps: litSteps(state) } }, cam)));
      const vs = document.createElement("canvas"); vs.width = 1280; vs.height = 400;
      const vg = vs.getContext("2d"); vg.imageSmoothingEnabled = false;
      as.forEach((p, i) => vg.drawImage(canvasOf(p, 2), i * 640, 0));
      say("PIC view-" + n.replace(/\W+/g, "-").toLowerCase() + " " + b64(await pngOf(vs)));
      // in the room, the torch's side of the sprite is the brighter side
      if (LIT.indexOf(n) >= 0) {
        // the sprite's pixels: where the room with the frame differs from the room with an empty one (same torch, same camera)
        const bare = room3dRender(Object.assign({ room: torchRoom(-1), place: r3v.place, frame: EMPTY(r3v.frames[fi]), light: null }, cam, { yaw: 0.55 }));
        const mask = new Uint8Array(320 * 200);
        let a = 320, b = 0;
        for (let p = 0; p < 320 * 200; p++) { const q = p * 4; if (unlit.data[q] !== bare.data[q] || unlit.data[q + 1] !== bare.data[q + 1] || unlit.data[q + 2] !== bare.data[q + 2]) { mask[p] = 1; a = Math.min(a, p % 320); b = Math.max(b, p % 320); } }
        const mid = (a + b) >> 1;
        const sideLum = (pic, x0, x1) => { let s = 0, k = 0; for (let y = 0; y < 200; y++) for (let x = x0; x < x1; x++) { const p = y * 320 + x; if (!mask[p]) continue; const q = p * 4; s += pic.data[q] * 0.3 + pic.data[q + 1] * 0.6 + pic.data[q + 2] * 0.1; k++; } return k ? s / k : 0; };
        const lL = sideLum(pics[0], a, mid) - sideLum(pics[0], mid, b + 1), lR = sideLum(pics[1], mid, b + 1) - sideLum(pics[1], a, mid);
        t(n + " in the room: lit from the left its left half is brighter, from the right its right half", lL > 0 && lR > 0, lL.toFixed(2) + " " + lR.toFixed(2));
      }
    }
    r3v.open = false;

    // 4. the Godot files: the lit presets and a lit Pixel Explosion, 2D + 3D scenes
    const jobs = LIT.map((n) => ({ n: n })).concat([{ n: "Pixel Explosion", patch: { lit: 1 } },
      { n: "Lit Pixel Dust", id: "Lit Pixel Dust varied", patch: { variety: "fh:1,fv:1,v:5" } }]);
    let k = 0;
    for (const j of jobs) {
      applyPreset(PRESETS[j.n], j.n, true);
      if (j.patch) { Object.assign(state, j.patch); rerender(); }
      const out = await buildExportBundle(null, Object.assign({}, SET, { d3: true, base: (j.id || j.n).toLowerCase().replace(/\W+/g, "_") }));
      const base = out.base, info = out.scene;
      say("LIT " + JSON.stringify({ name: j.id || j.n, varied: !!j.patch && !!j.patch.variety, base: base, stand: fx3dStand(state, j.n), frames: rendered.canvases.length, fps: rendered.fps, loop: !!info.loop,
        glows: !!(info.lit && info.lit.glows), w: rendered.w, h: rendered.h }));
      for (const f of out.files) say("FILE " + k + " " + f.name + " " + b64(bytes(f.data)));
      k++;
    }
    say("END " + (fails ? "FAIL " + fails : "PASS"));
  } catch (e) {
    say("FAIL threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e));
    say("END FAIL threw");
  }
})();

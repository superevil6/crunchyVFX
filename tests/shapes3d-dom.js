"use strict";
// <vfx13-shapes> CrunchyVFX: THE 3D-NATIVE FORMS (VFX-DESIGN §61.8) in the real index.html, run by tests/shapes3d.mjs.
(async function () {
  const say = (l) => { try { dump("VFX " + l + "\n"); } catch (e) { /* dump off */ } };
  let fails = 0;
  const t = (name, pass, why) => { say((pass ? "PASS " : "FAIL ") + name + (pass || !why ? "" : " — " + why)); if (!pass) fails++; };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const pic = async (name, img) => say("PIC " + name + " " + img.w + " " + img.h + " " + b64(await d3sPng(img)));
  try {
    if (typeof endTour === "function") endTour(false);
    await r3vLoad(); r3vLoaded();
    const bytes = (d) => (typeof d === "string" ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
    const eq = (a, b) => { a = bytes(a); b = bytes(b); if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const same = (A, B) => A.length === B.length && A.every((f, i) => f.name === B[i].name && eq(f.data, B[i].data));
    const names = (L) => L.map((f) => f.name).join(" ");
    const txt = (L, n) => { const f = L.find((x) => x.name === n); return f ? new TextDecoder().decode(bytes(f.data)) : ""; };
    // 1. the room's "As" row: the forms, auto saying what it chose; choosing "A card" is the 3D panel's own row
    {
      applyPreset(PRESETS["Pixel Level Up"], "Pixel Level Up", true);
      r3vSet("3d"); r3v.key = null; r3vPrep(); r3vSync();
      const fo = document.getElementById("r3vForm"), auto = fo ? fo.options[0].textContent : "", had = r3v.shapes && r3v.shapes.form;
      fo.value = "1"; fo.dispatchEvent(new Event("change"));
      r3v.key = null; r3vPrep();
      const asCard = state.d3Form === 1 && inputs.d3Form.value === "1" && r3v.shapes === null;
      fo.value = "0"; fo.dispatchEvent(new Event("change")); r3v.key = null; r3vPrep();
      t("the room's \u201cAs\u201d row lists the forms (auto: \u201c" + auto + "\u201d); choosing a card sets d3Form through the 3D panel and the room draws the card",
        fo.options.length === FX3D_FORMS.length && /particles/i.test(auto) && had === "particles" && asCard && state.d3Form === 0 && r3v.shapes && r3v.shapes.form === "particles",
        JSON.stringify({ n: fo.options.length, auto, had, asCard, back: state.d3Form }));
      const info = document.getElementById("r3vInfo").textContent;
      t("the room's line says the form", /real 3D particles/.test(info), info);
    }
    // 2. the room draws them: particles (and a mesh), tested against its depth, the same every time
    {
      const S = r3v.shapes, P = r3v.place, F = { w: 96, h: 96, data: new Uint8ClampedArray(96 * 96 * 4) };
      const plain = room3dRender({ room: "dungeon", place: P, frame: null }), draw = (geom) => room3dRender({ room: "dungeon", place: P, frame: null, geom: geom });
      const a = draw((cam) => fx3dRoomDraws(S, 6, 0.2, cam)), b = draw((cam) => fx3dRoomDraws(S, 6, 0.2, cam));
      let diff = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== plain.data[i] || a.data[i + 2] !== plain.data[i + 2]) diff++;
      // a quad under the floor and one behind the back wall: hidden; the same quad in the open: drawn
      const img = { w: 4, h: 4, data: new Uint8ClampedArray(64).fill(255) }, q = (p) => ({ parts: [{ p: p, s: 0.6, a: 0, img: img, cell: [0, 0, 4, 4], mode: "cut" }], tris: [] });
      const count = (pic) => { let n = 0; for (let i = 0; i < pic.data.length; i += 4) if (pic.data[i] === 255 && pic.data[i + 1] === 255 && pic.data[i + 2] === 255) n++; return n; };
      const open = count(draw(() => q([0, 1, 0]))), under = count(draw(() => q([0, -1, 0]))), behind = count(draw(() => q([0, 1.5, -5]))), base0 = count(plain);
      t("the room draws the 3D particles (" + diff + " pixels), the same every time; what is under the floor or behind a wall stays hidden",
        diff > 20 && a.data.every((v, i) => v === b.data[i]) && open > base0 + 50 && under === base0 && behind === base0, JSON.stringify({ diff, open, under, behind, base0 }));
    }
    // 3. the export, per form: the 2D files untouched; a particle effect's strips (and its card's own sheet when it has one); a
    // mesh's shader; a card's 3D files byte for byte what base's fx3d.js writes (its functions swapped in)
    {
      const SET = { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emissive: false, sound: false, scales: [1], playback: "auto" };
      const BASE = typeof SHAPES3D_BASE_FX3D === "string" ? new Function(SHAPES3D_BASE_FX3D + "\nreturn { fx3dTscn, fx3dScript, fx3dJson, fx3dReadme, fx3dTextScript, fx3dScreenScript };")() : null;
      const withBase = async (fn) => {
        const keep = {};
        for (const k in BASE) { keep[k] = window[k]; window[k] = BASE[k]; }
        try { return await fn(); } finally { for (const k in keep) window[k] = keep[k]; }
      };
      const JOBS = [
        ["Pixel Level Up", "particles", /_3d_p0\.png .*_3d_p2\.png/, null], ["Coin Burst", "particles", /_3d_p0\.png.*_3d_card\.png.*_3d_card\.tres/, "CPUParticles3D"],
        ["Pixel Slash", "arc", /_3d\.gdshader/, "MeshInstance3D"], ["Laser", "beam", /_3d\.gdshader/, "func aim"], ["Shockwave", "ring", /_3d\.gdshader/, "ring_out"],
        ["Explosion", "card", null, null], ["Pixel Torch", "card", null, null], ["Summon Circle", "card", null, null], ["Pixel Damage Number", "card", null, null],
        ["Pixel Level Up", "card", null, null, { d3Form: 1 }], ["Hit Spark", "card", null, null, { variety: "fh:1,fv:1,r:1,s:1-2,v:10,j:2,b:3,bs:1" }],
      ];
      for (const [n, form, files, inText, set] of JOBS) {
        applyPreset(PRESETS[n], n, true);
        if (set) { Object.assign(state, set); rerender(); }
        const off = (await buildExportBundle(null, Object.assign({}, SET, { d3: false }))).files;
        const on = (await buildExportBundle(null, Object.assign({}, SET, { d3: true }))).files;
        const base = sanitize(exportNameNow()), on2d = on.filter((f) => !/_3d[._]|_text_3d\.gd$/.test(f.name) && f.name !== "README.txt");
        const tscn = txt(on, base + "_3d.tscn"), js = JSON.parse(txt(on, base + "_3d.json") || "{}");
        t(n + (set ? " (" + Object.keys(set).join() + " set)" : "") + ": in 3D as " + form + "; the 2D files byte for byte as with 3D off",
          same(off.filter((f) => f.name !== "README.txt"), on2d) && (js.form ? js.form.kind : "card") === form && (!files || files.test(names(on))) && (!inText || (tscn + txt(on, base + "_3d.gd")).indexOf(inText) >= 0),
          names(on) + " · " + (js.form ? js.form.kind : "card"));
        if (form === "card" && BASE) {
          const old = (await withBase(() => buildExportBundle(null, Object.assign({}, SET, { d3: true })))).files;
          t(n + (set ? " (" + Object.keys(set).join() + " set)" : "") + ": as a card, every 3D file byte for byte what base's fx3d.js writes (" + old.length + " files)", same(on, old),
            names(on) + " vs " + names(old));
        }
      }
      applyPreset(PRESETS["Explosion"], "Explosion", true);
    }
    const LOOK = (typeof SHAPES3D_LOOK !== "undefined" && SHAPES3D_LOOK) || [];
    for (const n of LOOK) {
      applyPreset(PRESETS[n], n, true);
      r3v.key = null; r3vSet("3d"); r3vPrep();
      const S = r3v.shapes, nf = rendered.canvases.length;
      say("INFO " + n + ": form " + (S ? S.form : "card") + " stand " + r3v.stand + (S && S.systems ? " systems " + S.systems.map((y) => y.src + "x" + y.nodes.reduce((a, b) => a + b.amount, 0)).join(",") : "") +
        (S && S.spec ? " spec " + JSON.stringify(S.spec).slice(0, 160) + " mpp " + S.mpp : ""));
      const V = room3dView(r3v.place), L = r3v.light;
      const shots = [];
      for (const cam of ["orbit", "high", "eye"]) for (const q of [0.2, 0.45, 0.75]) {
        const i = Math.min(nf - 1, Math.round(q * (nf - 1)));
        if (S) S.eye = cam === "eye";
        const E = cam === "eye" ? room3dEye(r3v.place, 1) : null;
        const c = cam === "eye" ? { yaw: 0.55, pitch: E.pitch, dist: E.dist, ty: E.ty } : cam === "high" ? { yaw: 1.2, pitch: 0.95, dist: V.dist, ty: V.ty } : { yaw: 0.55, pitch: V.pitch, dist: V.dist, ty: V.ty };
        shots.push(room3dRender(Object.assign({ room: "dungeon", place: r3v.place, frame: S ? (S.cardHidden ? null : S.cardFrames[i]) : r3v.frames[i],
          geom: S ? (cm) => fx3dRoomDraws(S, i, i / rendered.fps, cm) : undefined, light: L && L.on ? { color: L.color, energy: L.energies[i] || 0, range: L.range } : null }, c)));
      }
      // one sheet: 3 moments across, orbit / high / eye down
      const W = 320, H = 200, sh = { w: W * 3, h: H * 3, data: new Uint8ClampedArray(W * 3 * H * 3 * 4) };
      shots.forEach((p, k) => { const ox = (k % 3) * W, oy = Math.floor(k / 3) * H; for (let y = 0; y < H; y++) sh.data.set(p.data.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * W * 3 + ox) * 4); });
      await pic("room " + n, sh);
    }
    say("END " + (fails ? "FAIL " + fails : "PASS"));
  } catch (e) { say("END FAIL threw: " + e.message + " " + (e.stack || "").split("\n").slice(0, 5).join(" | ")); }
})();

"use strict";
// CrunchyVFX — the PAGE half of tests/godot-3d.mjs (VFX-DESIGN §61.4): inside the real index.html, it
//   1. proves "3D scene too" OFF is byte for byte: buildExportBundle with d3 false (and with no d3 at all) writes exactly
//      the same files, and with it ON the 2D files are untouched (only <base>_3d.* and README.txt are new or moved);
//   2. proves PLANTING carries it: plantedRender (the desktop Library's and the CLI's call) of an effect whose saved export
//      settings say d3 writes exactly what the Export path (buildExportBundle) writes, 3D files included;
//   3. makes one effect per stand (and the light, Variety, runtime text, a sound, 2x sheets, a loop) through
//      plantedRender, and hands every file to Node: "VFX FX3D {meta}" then "VFX FILE <i> <name> <base64>".
(async function () {
  const say = (l) => { try { dump("VFX " + l + "\n"); } catch (e) { /* dump off */ } };
  let fails = 0;
  const t = (name, pass, why) => { say((pass ? "PASS " : "FAIL ") + name + (pass || !why ? "" : " — " + why)); if (!pass) fails++; };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const bytes = (d) => (typeof d === "string" ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
  const eq = (a, b) => { a = bytes(a); b = bytes(b); if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  const same = (A, B) => A.length === B.length && A.every((f, i) => f.name === B[i].name && eq(f.data, B[i].data));
  const names = (L) => L.map((f) => f.name || f.path).join(" ");
  try {
    if (typeof endTour === "function") endTour(false);
    // what auto says about a few, for the person reading the run
    for (const n of ["Explosion", "Smoke Puff", "Blood Splat", "Pixel Torch", "Scorch Mark", "Rain", "Pixel Lava Pool", "Gem Pickup", "Pixel Lightning", "Portal"]) {
      applyPreset(PRESETS[n], n, true);
      const m = fx3dMasksOf(rendered.canvases, state), L = fx3dLight(state, m, rendered.fps);
      say("INFO " + n + ": stand " + fx3dStand(state, n) + " (rule " + fx3dStandRule(state) + "), alpha " + fx3dAlphaMode(m) + ", " + rendered.w + "x" + rendered.h +
        ", light " + (L.on ? "peak " + L.peak + " range " + L.range + " color " + L.color : "off") + ", bounds " + JSON.stringify(fx3dBounds(m)));
    }
    {
      let agree = 0;
      const all = Object.keys(PRESETS);
      for (const n of all) if (fx3dStandRule(presetOutcome(PRESETS[n], true)) === fx3dAutoOf(n)) agree++;
      say("INFO the custom-effect rule alone agrees with the table on " + agree + " of " + all.length + " presets");
    }
    const SET = { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emissive: false, sound: false, scales: [1], playback: "auto" };
    // 1. OFF is byte for byte (and ON leaves the 2D files alone)
    for (const [n, extra] of [["Explosion", {}], ["Pixel Damage Number", {}], ["Hit Spark", { variety: "fh:1,fv:1,r:1,s:1-2,v:10,j:2,b:3,bs:1" }], ["Rain", {}], ["Pixel Torch", { scales: [1, 2] }]]) {
      applyPreset(PRESETS[n], n, true);
      if (extra.variety) { state.variety = extra.variety; rerender(); }
      const o = Object.assign({}, SET, extra.scales ? { scales: extra.scales } : {});
      const plain = (await buildExportBundle(null, o)).files;
      const off = (await buildExportBundle(null, Object.assign({}, o, { d3: false }))).files;
      const on = (await buildExportBundle(null, Object.assign({}, o, { d3: true }))).files;
      const on2d = on.filter((f) => !/_3d\.|_text_3d\.gd$/.test(f.name) && f.name !== "README.txt");
      const plain2d = plain.filter((f) => f.name !== "README.txt");
      t(n + ": 3D scene off writes every file byte for byte as with no option (" + plain.length + " files)", same(plain, off), names(off));
      t(n + ": 3D scene on adds only <base>_3d.* (and its README part); the 2D files are byte for byte the same", same(plain2d, on2d) &&
        on.some((f) => /_3d\.tscn$/.test(f.name)) && on.some((f) => /_3d\.json$/.test(f.name)), names(on));
    }
    // the dialog: the option shows for Godot only, is off by default, and is written to the settings only when on
    {
      const keep = currentPipelineSettings();
      expFormat.value = "sheet"; expMetaSel.value = "godot"; exp3d.checked = false; refreshExpInfo();
      const shown = !expModal.querySelector("#exp3dRow").hidden, offSet = JSON.stringify(exportSettingsNow());
      exp3d.checked = true; refreshExpInfo();
      const onSet = exportSettingsNow(), plantOn = plantExpNow(), pipeOn = currentPipelineSettings(), note = expNote.textContent;
      expMetaSel.value = "generic"; refreshExpInfo();
      const hidden = expModal.querySelector("#exp3dRow").hidden, generic = exportSettingsNow();
      applyPipelineSettings(keep);
      t("the Export dialog: \"3D scene too\" shows for Godot 4, off by default (no d3 in the settings), on writes d3 to the export, a planted effect's and a pipeline's settings; hidden for other metadata",
        shown && !/d3/.test(offSet) && onSet.d3 === true && plantOn.d3 === true && pipeOn.d3 === true && hidden && !generic.d3 && /3D scene too/.test(note) && exp3d.checked === !!keep.d3,
        JSON.stringify({ shown, offSet, onSet, plantOn, hidden, note: note.slice(0, 120) }));
      // 1.3.1: with 3D in play (a 3D row set) and other metadata, the row shows greyed with "Use Godot 4", which switches
      applyPreset(PRESETS["Explosion"], "Explosion", true);
      state.d3Stand = 3; rerender();
      expMetaSel.value = "generic"; exp3d.checked = false; refreshExpInfo();
      const rowG = !expModal.querySelector("#exp3dRow").hidden && exp3d.disabled && !exp3dGodot.hidden;
      try { localStorage.removeItem(FX3D_EXP_SET); } catch (e) { /* none */ }
      exp3dGodot.click();
      const switched = expMetaSel.value === "godot" && !exp3d.disabled && exp3dGodot.hidden && exp3d.checked;
      // the copy says what will be exported: an Explosion's light, a smoke's "no light"
      const lit = /with a light that follows its glow/.test(expNote.textContent);
      applyPreset(PRESETS["Smoke Puff"], "Smoke Puff", true); refreshExpInfo();
      const unlit = /no light \(nothing in it glows\)/.test(expNote.textContent) && !/follows its glow/.test(expNote.textContent);
      // never set + opened from the 3D view: ticked; once set, the remembered choice holds
      const keepOpen = r3v.open;
      try { localStorage.removeItem(FX3D_EXP_SET); } catch (e) { /* none */ }
      exp3d.checked = false; r3v.open = true; document.getElementById("expOpen").click();
      const ticked = exp3d.checked;
      fx3dExpSet(); exp3d.checked = false; document.getElementById("expOpen").click();
      const held = !exp3d.checked;
      r3v.open = keepOpen; expModal.hidden = true;
      applyPipelineSettings(keep);
      try { localStorage.removeItem(FX3D_EXP_SET); } catch (e) { /* none */ }
      t("1.3.1 the dialog: with 3D in play and other metadata the 3D row shows greyed with \u201cUse Godot 4\u201d, which switches; the copy says light or no light; opened from the 3D view before ever set it starts ticked, after that the choice holds",
        rowG && switched && lit && unlit && ticked && held, JSON.stringify({ rowG, switched, lit, unlit, ticked, held }));
      t("a planted effect's summary says it carries a 3D scene", /3D scene/.test(expSummary(expOf({ exp: { d3: true } }))) && !/3D/.test(expSummary(expOf({}))));
    }
    // the 3D panel's note says what auto decided
    {
      applyPreset(PRESETS["Summon Circle"], "Summon Circle", true);
      await new Promise((r) => setTimeout(r, 400));
      const n = document.getElementById("fx3dNote");
      t("the 3D panel's note says how it stands and how big it is", !!n && /lies flat on the ground/.test(n.textContent) && /m\b/.test(n.textContent), n ? n.textContent : "no note");
    }
    // 2 + 3. the effects, planted (the Library's and the CLI's path), each compared with the Export path
    const JOBS = [
      { name: "Pixel Explosion", want: "face" },
      { name: "Explosion", want: "face", sound: true },
      { name: "Pixel Torch", want: "upright" },
      { name: "Pixel Portal", want: "upright" },
      { name: "Scorch Mark", want: "upright", light: false },
      { name: "Summon Circle", want: "flat" },
      { name: "Rain", want: "screen" },
      { name: "Smoke Puff", want: "face", light: false },
      { name: "Smoke Puff", label: "Smoke Puff, Light Always", base: "smoke-lit", want: "face", light: true, set: { d3Light: 2 } },
      { name: "Pixel Damage Number", want: "face" },
      { name: "Pixel Lightning", want: "upright", scales: [2] },
      { name: "Hit Spark", base: "varied-hit", want: "face", variety: "fh:1,fv:1,r:1,s:1-2,v:10,j:2,b:3,bs:1" },
      { name: "Pixel Gem Sparkle", want: "face" },
      { name: "Pixel Heal", want: "upright" },
      { name: "Pixel Bonfire", want: "upright" },
      // the ground marks, to look at lying down
      { name: "Summon Seal", ground: true, want: "flat" },
      { name: "Summon Grid", ground: true, want: "flat" },
      { name: "Water Ripple", ground: true, want: "flat" },
      { name: "Rune Circle", ground: true, want: "flat" },
      { name: "Pixel Summon", ground: true, want: "flat" },
      { name: "Pixel Lava Pool", ground: true, want: "flat" },
      { name: "Pixel Slam", ground: true, want: "flat" },
      { name: "Ground Crack", ground: true, want: "flat" },
    ];
    let k = 0;
    for (const j of JOBS) {
      if (!PRESETS[j.name]) { t(j.name + " is a preset", false); continue; }
      applyPreset(PRESETS[j.name], j.name, true);
      if (j.variety) { state.variety = j.variety; rerender(); }
      if (j.set) { Object.assign(state, j.set); rerender(); }
      const base = j.base || sanitize(j.name);
      const exp = Object.assign({}, EXP_DEFAULT, { trim: true, scales: j.scales || [1], d3: true });
      const f = { s: encodePatch(j.name, true), exp: exp, fit: true, base: base, exportName: j.name };
      if (j.sound) { f.sound = { patch: {}, name: "Boom" }; exp.sound = true; }
      const made = await plantedRender(f);
      const files = made.files.map((x) => ({ name: x.path, data: bytes(x.data) }));
      // the Export path for the same effect, settings and sound: the same files
      const st = stateOfShare(f.s);
      let synth = null;
      if (f.sound) { const full = Object.assign({}, CrunchySynth.DEFAULTS, f.sound.patch), a = CrunchySynth.render(full); synth = { patch: full, name: f.sound.name, L: a.L, R: a.R, rate: CrunchySynth.SR }; }
      const C = { st: st, r: renderFrames(st, { fit: true }), fit: true, ref: NO_REF, synth: synth, link: null, soundFrame: 0 };
      const ex = (await buildExportBundle(null, Object.assign({ format: "sheet" }, exp, { base: base, ctx: C, label: j.name }))).files.map((x) => ({ name: x.name, data: bytes(x.data) }));
      t(j.name + ": planted (the Library, the CLI) writes exactly what Export writes, 3D files included", same(files, ex), names(files) + " vs " + names(ex));
      const tscn = new TextDecoder().decode((files.find((x) => x.name === base + "_3d.tscn") || { data: new Uint8Array() }).data);
      const js = files.find((x) => x.name === base + "_3d.json");
      const meta = js ? JSON.parse(new TextDecoder().decode(js.data)) : {};
      t(j.name + ": stands " + j.want, meta.stand === j.want, meta.stand);
      const info = { name: j.label || j.name, base: base, want: j.want, wantLight: j.light !== undefined ? j.light : j.want === "screen" ? false : j.ground ? undefined : true, meta: meta, frames: C.r.canvases.length, fps: C.r.fps, loop: loopFor("auto", st),
        sound: !!f.sound, variety: !!j.variety, text: textStampOf(st), scales: exp.scales, files: files.map((x) => x.name),
        impact: (/\nimpact_frame = (\d+)/.exec(tscn) || [])[1] | 0 };
      say("FX3D " + JSON.stringify(info));
      for (const x of files) say("FILE " + k + " " + x.name + " " + b64(x.data));
      k++;
      for (const cv of C.r.canvases) releaseCanvas(cv);
    }
    say("END " + (fails ? "FAIL " + fails : "PASS " + k));
  } catch (e) { say("END FAIL threw: " + e.message + " " + (e.stack || "").split("\n").slice(0, 4).join(" | ")); }
})();

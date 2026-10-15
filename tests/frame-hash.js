"use strict";
// CrunchyVFX — THE FRAME HASH (the "no rendered frame changes" proof; CrunchySFX's tests/audio-hash.js is the model).
// Runs INSIDE the real index.html (the app's own applyPreset → renderFrames, the app's own export path) and
// fingerprints:
//   FRAME  every built-in preset's rendered frames (the RGBA pixels of each canvas), with Fit on, and a third of them
//          with Fit off too;
//   EXPORT the exact bytes the Export dialog's buildExportFiles makes, for a spread of presets in every format,
//          layout, metadata kind, trim, power-of-two, emissive mask, several sizes and a synthesised sound;
//   BATCH  the zip the batch export (My Effects and Everything) hands download().
// Run it before a change and after: every line must match.
//
//   node tests/run-ff.mjs hash --quiet > /tmp/after.txt; diff tests/frame-hash.expected.txt /tmp/after.txt
//
// Lines: "VFX FRAME <name> <hash>", "VFX EXPORT <case> <hash>", …, then "VFX FRAMEHASH <total> over <n>" and
// "VFX END PASS". (The total is what to compare at a glance; the per-line hashes name what moved.)
(async function () {
  const say = function (line) { try { dump("VFX " + line + "\n"); } catch (e) { /* dump disabled */ } };
  function fnv(bytes, h) {
    let a = h ? h[0] : 0x811c9dc5, b = h ? h[1] : 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < bytes.length; i++) {
      a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0;
      b = Math.imul(b ^ bytes[i], 0x5bd1e995) >>> 0;
    }
    return [a, b];
  }
  const hex = function (h) { return ("00000000" + h[0].toString(16)).slice(-8) + ("00000000" + h[1].toString(16)).slice(-8); };
  const enc = new TextEncoder();
  let total = null, n = 0;
  const record = function (kind, name, h) { say(kind + " " + name + " " + hex(h)); total = fnv(enc.encode(hex(h)), total); n++; };
  const pixels = function (cvs, h) {
    for (const cv of cvs) {
      h = fnv(enc.encode(cv.width + "x" + cv.height), h);
      h = fnv(new Uint8Array(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.buffer), h);
    }
    return h;
  };
  const files = function (list, h) {
    for (const f of list) { h = fnv(enc.encode(f.name), h); h = fnv(f.data, h); }
    return h;
  };
  try {
    if (typeof endTour === "function") endTour(false);
    const names = Object.keys(PRESETS);
    const keepFit = fitOn;
    // ---- every preset's frames
    for (let i = 0; i < names.length; i++) {
      fitOn = true;
      applyPreset(PRESETS[names[i]], names[i], true);
      record("FRAME", JSON.stringify(names[i]), pixels(rendered.canvases));
      if (i % 3 === 0) {
        fitOn = false; rerender();
        record("FRAME", JSON.stringify("nofit:" + names[i]), pixels(rendered.canvases));
      }
    }
    fitOn = keepFit;

    // ---- the Export dialog's bytes
    const CASES = [
      { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emis: false, scales: [1] },
      { format: "sheet", layout: "row", meta: "generic", trim: false, pot: true, emis: true, scales: [1, 2] },
      { format: "sheet", layout: "col", meta: "aseprite", trim: true, pot: false, emis: false, scales: [1] },
      { format: "sheet", layout: "grid", meta: "phaser", trim: true, pot: true, emis: true, scales: [1] },
      { format: "sheet", layout: "grid", meta: "none", trim: false, pot: false, emis: false, scales: [2, 3] },
      { format: "frames", layout: "grid", meta: "godot", trim: true, pot: false, emis: false, scales: [1] },
      { format: "frames", layout: "grid", meta: "generic", trim: false, pot: false, emis: false, scales: [1, 2] },
      { format: "apng", layout: "grid", meta: "generic", trim: true, pot: false, emis: false, scales: [1] },
      { format: "sheet", layout: "grid", meta: "godot", trim: false, pot: false, emis: true, scales: [1] },
    ];
    const set = function (c) {
      expFormat.value = c.format; expLayout.value = c.layout; expMetaSel.value = c.meta;
      expTrim.checked = c.trim; expPot.checked = c.pot; expEmis.checked = c.emis;
      for (const s of EXPORT_SCALES) expScaleBoxes[s].checked = c.scales.indexOf(s) >= 0;
      expSound.checked = true;
    };
    const pick = names.filter(function (x, i) { return i % 9 === 0; });
    for (let i = 0; i < pick.length; i++) {
      const c = CASES[i % CASES.length];
      applyPreset(PRESETS[pick[i]], pick[i], true);
      set(c);
      const out = await buildExportFiles();
      record("EXPORT", JSON.stringify(pick[i] + "|" + JSON.stringify(c)), files(out.files));
    }
    // the same godot sheet with a synthesised sound beside it
    if (typeof synthesizePatch === "function" && synthAvailable()) {
      applyPreset(PRESETS[names[4]], names[4], true);
      synthesizePatch({}, "A sound");
      set(CASES[0]);
      const out = await buildExportFiles();
      record("EXPORT", JSON.stringify("sound:" + names[4]), files(out.files));
      synthSound = null;
    }

    // ---- the batch export's zip (My Effects, then Everything), through download()
    // Hashed from what goes INTO the zip (makeZip's list), less any `.crunchy` sidecar: zips carry sidecars since the
    // planted Library (VFX-DESIGN §18, DESKTOP-ROADMAP.md decision 4), and that is the one intended difference. So is a
    // Godot pack's ready scene (§26: each folder's <base>.gd and <base>.tscn, the root README.txt), proved in real
    // Godot by tests/godot-scene.mjs; what is left is byte for byte the pack as it was.
    const keepDl = download, keepZip = makeZip, keepUser = userEffects, got = [];
    let lastZip = null;
    makeZip = function (list) { lastZip = list.filter(function (f) { return !/\.(crunchy|gd|tscn)$|(^|\/)README\.txt$/.test(f.name); }); return keepZip(list); };
    download = function (blob, name) { got.push({ files: lastZip, name: name }); };
    try {
      userEffects = [{ id: 1, name: "One", state: withState(PRESETS[names[2]], snapshotState) },
                     { id: 2, name: "Two ✨", state: withState(PRESETS[names[7]], snapshotState) }];
      set(CASES[0]);
      await batchExport("mine");
      set(CASES[2]);
      await batchExport("all");
      for (const g of got) record("BATCH", JSON.stringify(g.name), files(g.files));
    } finally { download = keepDl; makeZip = keepZip; userEffects = keepUser; }
    say("FRAMEHASH " + hex(total) + " over " + n);
    say("END PASS " + n + " hashes");
  } catch (e) { say("END FAIL threw: " + e + " " + (e.stack || "").split("\n").slice(0, 3).join(" | ")); }
})();

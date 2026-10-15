"use strict";
// CrunchyVFX — the page half of tests/godot-scene.mjs (VFX-DESIGN §26): inside the real index.html, the WEB build (no
// Tauri), export effects the way a person does — the Export dialog, Godot 4 chosen, the Export button — and hand over the
// zips the button downloaded, with what each scene should say (its impact frame, frame count, fps, loop), so the Node half
// can put them into a REAL Godot and play them.
//   one-shot  Explosion, Play once, trimmed, with a synthesised sound ("Match a sound"'s WAV in the export)
//   one-shot  Hit Spark, Auto (no Seamless loop: a one-shot), two sizes (the scene points at the @1x .tres)
//   loop      Rain, Auto (Seamless loop on: it loops)
//   one-shot  Heart Heal, Play once, trimmed (§28: an Icon particle effect)
(async function () {
  const say = function (l) { dump("VFX " + l + "\n"); };
  const b64 = function (b) {
    let bin = "";
    for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(bin);
  };
  try {
    if (typeof endTour === "function") endTour(false);
    if (window.__TAURI__) throw new Error("this must be the web build");
    const plan = [
      { preset: "Explosion", name: "Boom Once", play: "once", trim: true, scales: [1], sound: true },
      { preset: "Hit Spark", name: "Spark Two Sizes", play: "auto", trim: true, scales: [1, 2], sound: false },
      { preset: "Rain", name: "Rain Loop", play: "auto", trim: false, scales: [1], sound: false },
      // §28: an Icon effect (the suite's glyphs, drawn at the particle's pixel size) is a scene like any other
      { preset: "Heart Heal", name: "Heart Heal Icons", play: "once", trim: true, scales: [1], sound: false },
    ];
    const keepDl = window.download;
    for (const p of plan) {
      applyPreset(PRESETS[p.preset], p.name, true);
      if (p.sound) synthesizePatch({}, "Thud"); else synthSound = null;
      document.getElementById("expOpen").click();
      expFormat.value = "sheet"; expLayout.value = "grid"; expMetaSel.value = "godot"; expPlay.value = p.play;
      expTrim.checked = p.trim; expPot.checked = false; expEmis.checked = false; expSound.checked = true;
      for (const s of EXPORT_SCALES) expScaleBoxes[s].checked = p.scales.indexOf(s) >= 0;
      expName.value = p.name; expNameFor = exportDefaultName();
      refreshExpInfo();
      const note = expNote.textContent;
      let got = null;
      window.download = function (blob, name) { got = { blob: blob, name: name }; };
      expModal.querySelector("#expGo").click();
      for (let i = 0; i < 400 && !got; i++) await new Promise(function (r) { setTimeout(r, 50); });
      window.download = keepDl;
      expModal.hidden = true;
      if (!got) throw new Error(p.name + ": the Export button never downloaded");
      const n = rendered.canvases.length;
      say("SCENEZIP " + JSON.stringify({
        name: got.name, base: sanitize(p.name), loop: loopFor(p.play), impact: impactFrameOf(rendered), frames: n, fps: rendered.fps,
        sound: !!p.sound, scales: p.scales, note: note,
      }) + " " + b64(new Uint8Array(await got.blob.arrayBuffer())));
    }
    synthSound = null;
    say("END PASS " + plan.length);
  } catch (e) { say("END FAIL " + e + " " + e.stack); }
})();

"use strict";
// CrunchyVFX — the page half of tests/godot-scene.mjs (VFX-DESIGN §26): inside the real index.html, the WEB build (no
// Tauri), export effects the way a person does — the Export dialog, Godot 4 chosen, the Export button — and hand over the
// zips the button downloaded, with what each scene should say (its impact frame, frame count, fps, loop), so the Node half
// can put them into a REAL Godot and play them.
//   one-shot  Explosion, Play once, trimmed, with a synthesized sound ("Match a sound"'s WAV in the export)
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
      // §39: VARIETY, set through the Export dialog's own controls: flips both ways, quarter turns, 1x or 2x, ±10%,
      // a 2 px nudge and 4 baked variations
      { preset: "Explosion", name: "Varied Boom", play: "once", trim: true, scales: [1], sound: false,
        vy: { vyFh: true, vyFv: true, vyRot: "1", vyScale: "1-2", vySpeed: "10", vyJit: "2", vyBake: "4" } },
    ];
    // §39: Variety OFF leaves every file byte for byte: the bundle of an effect never touched, and the same effect after
    // the switch went on and off again in the dialog
    const bundleBytes = async function () {
      const o = await buildExportBundle(null, { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emissive: false, sound: false, scales: [1], playback: "once", base: "same" });
      return o.files.map(function (f) { return f.name + ":" + b64(f.data); }).join("|");
    };
    applyPreset(PRESETS["Hit Spark"], "Hit Spark", true);
    const before = await bundleBytes();
    document.getElementById("expOpen").click();
    expFormat.value = "sheet"; expMetaSel.value = "godot"; refreshExpInfo();
    vyEl.vyOn.checked = true; vyEl.vyOn.dispatchEvent(new Event("change"));
    vyEl.vyBake.value = "3"; vyEl.vyBake.dispatchEvent(new Event("change"));
    const during = await bundleBytes();
    vyEl.vyOn.checked = false; vyEl.vyOn.dispatchEvent(new Event("change"));
    expModal.hidden = true;
    const after = await bundleBytes();
    say("VARIETYOFF " + JSON.stringify({ same: before === after, changedWhileOn: before !== during, variety: state.variety }));
    // the game moment's node and a moment scene whose effect is the varied one (crunchyCore moments.js, as planted)
    say("MOMENTGD " + b64(new TextEncoder().encode(MOMENT_GD)));
    say("MOMENTTSCN " + b64(new TextEncoder().encode(momentScene({ name: "Varied hit", script: "crunchy_moment.gd", effect: "fx/varied-boom/varied-boom.tscn",
      shake_px: 0, hit_stop_frames: 0, look_seconds: 0.2 }))));
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
      if (p.vy) {
        vyEl.vyOn.checked = true; vyEl.vyOn.dispatchEvent(new Event("change"));
        for (const k in p.vy) {
          if (typeof p.vy[k] === "boolean") vyEl[k].checked = p.vy[k]; else vyEl[k].value = p.vy[k];
          vyEl[k].dispatchEvent(new Event("change"));
        }
      }
      const note = expNote.textContent;
      let got = null;
      window.download = function (blob, name) { got = { blob: blob, name: name }; };
      expModal.querySelector("#expGo").click();
      for (let i = 0; i < 400 && !got; i++) await new Promise(function (r) { setTimeout(r, 50); });
      window.download = keepDl;
      expModal.hidden = true;
      if (!got) throw new Error(p.name + ": the Export button never downloaded");
      const n = rendered.canvases.length;
      const VC = p.vy ? varietyCtxs(liveExportCtx()) : null;
      say("SCENEZIP " + JSON.stringify({
        variety: p.vy ? state.variety : "", anims: VC ? VC.map(function (c, i) { return VARIETY_ANIM(i); }) : null,
        impacts: VC ? VC.map(function (c) { return impactFrameOf(c.r); }) : null, animFrames: VC ? VC.map(function (c) { return c.r.canvases.length; }) : null,
        name: got.name, base: sanitize(p.name), loop: loopFor(p.play), impact: impactFrameOf(rendered), frames: n, fps: rendered.fps,
        sound: !!p.sound, scales: p.scales, note: note,
      }) + " " + b64(new Uint8Array(await got.blob.arrayBuffer())));
    }
    synthSound = null;
    say("END PASS " + plan.length);
  } catch (e) { say("END FAIL " + e + " " + e.stack); }
})();

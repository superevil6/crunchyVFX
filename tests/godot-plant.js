"use strict";
// CrunchyVFX — the page half of tests/godot-check.mjs: inside the real index.html with the mocked Tauri disk, plant a
// few effects the way a person does (Plant in a folder…, Save) with different export settings (trimmed and not, a
// strip, two sizes, an emissive mask, a sound), plus HEAD's My Effects through "Plant my effects" (one draws an
// imported particle), then dump every file the planted Library wrote, so the Node half can put them into a REAL Godot.
(async function () {
  const M = window.__TAURI__.__mock, GODOT = "/home/aj/godot-game";
  const say = function (l) { dump("VFX " + l + "\n"); };
  const settle = async function () { for (let i = 0; i < 8; i++) { await null; await projQueue; } };
  const setExp = function (c) {
    expLayout.value = c.layout || "grid"; expPlay.value = c.play || "auto"; expTrim.checked = !!c.trim; expPot.checked = !!c.pot; expEmis.checked = !!c.emis; expSound.checked = true;
    for (const s of EXPORT_SCALES) expScaleBoxes[s].checked = (c.scales || [1]).indexOf(s) >= 0;
  };
  try {
    if (typeof endTour === "function") endTour(false);
    await settle();
    M.answer(GODOT);
    await projDo(projPlantPick);
    // Playback (VFX-DESIGN §21): Explosion and "Untrimmed" are one-shots by Auto (no Seamless loop), Rain loops by Auto,
    // the spark strip is a one-shot told to Loop, "With sound" a one-shot told to play Once.
    const plan = [["Explosion", "Big boom", { trim: true }], ["Hit Spark", "Spark strip", { layout: "row", scales: [1, 2], emis: true, play: "loop" }],
                  [Object.keys(PRESETS)[60], "Untrimmed", { trim: false, pot: true }], [Object.keys(PRESETS)[120], "With sound", { trim: true, layout: "col", play: "once" }],
                  ["Rain", "Rain loop", { trim: true }]];
    for (const p of plan) {
      setExp(p[2]);
      applyPreset(PRESETS[p[0]], p[1], true);
      if (p[1] === "With sound") synthesizePatch({}, "Thud"); else synthSound = null;
      projSave();
      await settle();
    }
    synthSound = null;
    setExp({ trim: true });
    await projDo(projPlantEffects);
    await settle();
    M.list(GODOT + "/crunchy/").forEach(function (path) {
      const b = M.bytes(path);
      let bin = "";
      for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
      say("PLANTFILE " + path.slice(GODOT.length + 1) + " " + btoa(bin));
    });
    // what each planted effect's metadata should tell the engine: its saved Playback, resolved against its own effect
    project.assets.forEach(function (a) { say("LOOP " + a.slug + " " + loopFor(expOf(a.data).playback, stateOfShare(a.data.s))); });
    say("END PASS " + project.assets.length);
  } catch (e) { say("END FAIL " + e + " " + e.stack); }
})();

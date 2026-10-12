"use strict";
// CrunchyVFX — a LOOK at the planted Library, for a screenshot in WebKit (the desktop engine): the mocked disk, a Godot
// game with a few effects planted, HEAD's My Effects planted, one "update available", and CrunchyTile's and
// CrunchySFX's assets in the suite view. No assertions (the desktop suite has those). The title says SHOWN when done.
//   python3 tests/build.py show && python3 tests/wkshot.py "file://$PWD/tests/run-show.html" "$PWD/tests/show.png" 1600 1000 30
(async function () {
  const M = window.__TAURI__.__mock, GODOT = "/home/aj/godot-game";
  const settle = async function () { for (let i = 0; i < 8; i++) { await null; await projQueue; } };
  try {
    if (typeof endTour === "function") endTour(false);
    M.put(GODOT + "/crunchy/tile/meadow/meadow.crunchy", JSON.stringify({ format: "crunchy-asset", kind: "design", name: "Meadow", files: ["meadow.png"] }));
    M.put(GODOT + "/crunchy/tile/cave/cave.crunchy", JSON.stringify({ format: "crunchy-asset", kind: "design", name: "Cave", files: ["cave.png"] }));
    M.put(GODOT + "/crunchy/sfx/coin/coin.crunchy", JSON.stringify({ format: "crunchy-asset", kind: "sound", name: "Coin", files: ["coin.wav"] }));
    M.answer(GODOT);
    await projDo(projPlantPick);
    for (const p of [["Explosion", "Big boom"], ["Hit Spark", "Hit spark"], [Object.keys(PRESETS)[40], "Portal"], [Object.keys(PRESETS)[90], "Heal"]]) {
      applyPreset(PRESETS[p[0]], p[1], true);
      projSave();
      await settle();
    }
    await projDo(projPlantEffects);
    await settle();
    const path = GODOT + "/crunchy/vfx/big-boom/big-boom.crunchy", d = JSON.parse(M.text(path));
    d.hash = "2:0";
    M.put(path, JSON.stringify(d));
    await projDo(function () { return projOpen(GODOT); });
    await settle();
    await projCheckUpdates();
    applyPreset(PRESETS["Explosion"], "Big boom", true);
    library.open();
    await projRefreshSuite();
    await settle();
    scrollTo(0, 0);
    document.title = "SHOWN";
  } catch (e) { document.title = "ERR " + e; }
})();

"use strict";
// CrunchyVFX — SAVED THINGS FROM HEAD (the "everything keeps opening" proof; CrunchySFX's make-fixtures.js is the model).
// Run ONCE against the build being protected: it was run on HEAD 11e8d14 (2026-10-11), BEFORE the planted Library
// (VFX-DESIGN §18). It makes, with THAT build's own functions, the browser store under every crunchyvfx.* key (My
// Effects, categories, imported sprites, export history, pipelines, the lock and dock preferences, folds, the tour),
// a .crunchyvfx project file, a My Effects .json, and share links, and records the frames each one opens to.
// tests/fixtures/ holds the result; regression-web.js and regression-desktop.js open them with the current build.
//
//   node tests/run-ff.mjs fixtures | python3 tests/save-fixtures.py
//
// Every record is one dumped line: "VFX FIXTURE <name> <json>", then "VFX END PASS".
(async function () {
  const say = function (line) { dump("VFX " + line + "\n"); };
  const put = function (name, value) { say("FIXTURE " + name + " " + JSON.stringify(value)); };
  // the frame fingerprint (the same as frame-hash.js and the suites)
  const frames = function (cvs) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    const enc = new TextEncoder();
    const eat = function (bytes) { for (let i = 0; i < bytes.length; i++) { a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0; b = Math.imul(b ^ bytes[i], 0x5bd1e995) >>> 0; } };
    for (const cv of cvs) { eat(enc.encode(cv.width + "x" + cv.height)); eat(new Uint8Array(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.buffer)); }
    return ("00000000" + a.toString(16)).slice(-8) + ("00000000" + b.toString(16)).slice(-8);
  };
  const tick = function () { return new Promise(function (r) { setTimeout(r, 20); }); };
  async function spriteReady(url) {
    for (let i = 0; i < 200; i++) { if (imageSpriteEl && imageSpriteEl.src === url && imageSpriteEl.complete) return; await tick(); }
    throw new Error("the image sprite never loaded");
  }
  try {
    if (typeof endTour === "function") endTour(false);
    const names = Object.keys(PRESETS);
    const snapOf = function (patch) { return withState(patch, snapshotState); };
    // a 4-frame strip, drawn here, for an imported-particle effect and the sprite library
    const c = document.createElement("canvas");
    c.width = 64; c.height = 16;
    const g = c.getContext("2d");
    for (let i = 0; i < 4; i++) { g.fillStyle = ["#ff6a3d", "#ffd23d", "#3dff9b", "#3d8bff"][i]; g.fillRect(i * 16 + 3, 3 + i, 10, 10 - i); }
    const strip = c.toDataURL("image/png");
    const glyphPreset = names.find(function (n) { return PRESETS[n].glyph; }) || names[3];
    const mixPreset = names.find(function (n) { return PRESETS[n].shapeMix; }) || names[5];
    const custom = new Uint8Array(CUSTOM_SPRITE_N * CUSTOM_SPRITE_N);
    for (let i = 0; i < custom.length; i++) custom[i] = ((i * 7) % 13) > 6 ? 255 : 0;
    const effects = [
      { name: "Boom keep", patch: PRESETS[names[0]] },
      { name: "Feu ✨ 日本", patch: PRESETS[glyphPreset] },
      { name: "Mixed shapes", patch: PRESETS[mixPreset] },
      { name: "Drawn particle", patch: Object.assign({}, PRESETS[names[12]], { shape: 8, shapeMix: "", customSprite: encodeSpriteAlpha(custom) }) },
      { name: "My strip", patch: { shape: SHAPES.indexOf("image"), imageSprite: strip, imgCols: 4, imgRows: 1, imgTint: 0, count: 6, size: 18, duration: 0.6 } },
      { name: "Boom keep", patch: PRESETS[names[40]] },                       // My Effects allows a repeated name
    ];
    // ---- My Effects, as HEAD's own functions save them; and the frames each opens to (exact: no lock, no hold)
    userEffects = effects.map(function (e, i) { return { id: i + 1, name: e.name, state: snapOf(e.patch) }; }).reverse();
    upSeq = effects.length;
    saveUserEffects();
    const upFrames = {};
    for (const it of userEffects) {
      applyPreset(it.state, it.name, true);
      if (it.state.imageSprite) { await spriteReady(it.state.imageSprite); rerender(); }
      upFrames[it.id] = frames(rendered.canvases);
    }
    applyImageSprite("");
    // categories (built-in and saved references), an imported sprite, export history, pipelines
    userCats = [{ id: 1, name: "Hits", items: [{ t: "b", n: names[1] }, { t: "u", id: 1 }, { t: "u", id: 5 }] },
                { id: 2, name: "Empty", items: [] }];
    ucSeq = 2; saveUserCats();
    userSprites = [{ id: 1, name: "strip.png", data: strip, cols: 4, rows: 1 }]; usSeq = 1; saveUserSprites();
    applyPreset(PRESETS[names[9]], "Shipped once");
    exportLog = [{ id: 1, name: "Shipped once", kind: "sheet", detail: "2 files · 14 KB", when: 1760000000000, patch: encodePatch("Shipped once") },
                 { id: 2, name: "Old gif", kind: "gif", detail: "1 file · 30 KB", when: 1750000000000, patch: encodePatch("Old gif") }];
    exSeq = 2; saveExportLog();
    pipelines = [{ name: "Godot 2x", settings: { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emissive: false, sound: true, scales: [1, 2] }, folder: "/home/aj/game/vfx" },
                 { name: "Web", settings: { format: "apng", layout: "grid", meta: "generic", trim: false, pot: false, emissive: false, sound: false, scales: [1] }, folder: null }];
    savePipelines();
    pixelLock = false; lockedValues = { pixelate: 2 }; saveLockPref();
    localStorage.setItem("crunchyvfx.dock.v1", "0");
    foldState = { shapes: true, palette: false }; saveFolds();
    localStorage.setItem("crunchyvfx.tourseen.v1", "1");
    const store = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^crunchyvfx\./.test(k)) store[k] = localStorage.getItem(k); }
    put("localStorage", { store: store, upFrames: upFrames, exportFrames: exportLog.map(function (en) { applyPreset(decodePatch(en.patch), en.name, true); return frames(rendered.canvases); }) });

    // ---- a .crunchyvfx project file, as Save project writes it
    applyPreset(PRESETS[names[20]], "Editor effect");
    const proj = JSON.stringify(buildProject(), null, 2);
    put("project", { file: proj, editorFrames: frames(rendered.canvases), label: effectLabel, effects: userEffects.length });

    // ---- the My Effects .json (⬇ in My Effects)
    put("effectsFile", { file: JSON.stringify({ app: "crunchyvfx", version: 1, effects: userEffects.map(function (e) { return { name: e.name, state: e.state }; }) }, null, 2) });

    // ---- share links: encodePatch, and the frames ?e= opens to (loadSharedEffect: applyPreset with the name)
    const links = [];
    const linkOf = function (patch, label, nameArg) {
      applyPreset(patch, label, true);
      const e = encodePatch(nameArg);
      links.push({ enc: e, label: label, name: nameArg || "", frames: frames(rendered.canvases) });
    };
    linkOf(PRESETS[names[2]], "Plain");
    linkOf(PRESETS[names[30]], "Named", "Feu ✨ 日本");
    linkOf(PRESETS[glyphPreset], "Glyph", "Glyph one");
    linkOf(PRESETS[mixPreset], "Mix", "Mix");
    linkOf(Object.assign({}, PRESETS[names[50]], { layerDelay: "Glow:0.1" }), "Timed", "Timed");
    put("links", links);
    put("done", { build: "HEAD 11e8d14", presets: names.length });
    say("END PASS fixtures");
  } catch (e) { say("END FAIL " + e + " " + (e.stack || "").split("\n").slice(0, 3).join(" | ")); }
})();

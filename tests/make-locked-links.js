"use strict";
// CrunchyVFX — RECONSTRUCTED maker for tests/fixtures/locked-links.js (no maker was ever committed; this one is checked
// by reproducing every stored `enc` and `lock` byte for byte). Run ONCE on HEAD 04c23ea, the last build with VFX's five
// built-in lock palettes (BUILTIN_PALETTES): for each, a preset with a spread of Crunch settings (the panel's "Hard edges
// (Alpha cut 0.5)" fix, a dither, both, neither), locked to it through the Crunch box's own setPalette, its share link
// (encodePatch "<preset> locked") and the frames HEAD rendered for it.
//
//   node tests/run-ff.mjs locked | python3 save-locked-links.py
(async function () {
  const say = function (line) { dump("VFX " + line + "\n"); };
  const frames = function (cvs) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    const enc = new TextEncoder();
    const eat = function (bytes) { for (let i = 0; i < bytes.length; i++) { a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0; b = Math.imul(b ^ bytes[i], 0x5bd1e995) >>> 0; } };
    for (const cv of cvs) { eat(enc.encode(cv.width + "x" + cv.height)); eat(new Uint8Array(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.buffer)); }
    return ("00000000" + a.toString(16)).slice(-8) + ("00000000" + b.toString(16)).slice(-8);
  };
  try {
    if (typeof endTour === "function") endTour(false);
    const PAIRS = [["Explosion", "Sweetie 16", { alphaCut: 0.5 }], ["Fireball", "Fantasy 16", {}],
                   ["Heal Pulse", "Handheld Green", { dither: 0.6, alphaCut: 0.5 }], ["Magic Sparkle", "CGA", { dither: 0.3 }],
                   ["Frost Shot", "Grayscale 8", { alphaCut: 0.5 }]];
    const out = [];
    for (const [p, pal, crunch] of PAIRS) {
      applyPreset(PRESETS[p], p, true);
      Object.assign(state, crunch);
      setPalette(BUILTIN_PALETTES[pal].split(","), pal);
      out.push({ label: p + " · " + pal, enc: encodePatch(p + " locked"), frames: frames(rendered.canvases), lock: state.paletteLock });
    }
    say("FIXTURE lockedLinks " + JSON.stringify(out));
    say("END PASS locked");
  } catch (e) { say("END FAIL " + e + " " + (e.stack || "").split("\n").slice(0, 3).join(" | ")); }
})();

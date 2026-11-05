"use strict";
// CrunchyVFX — the page half of tests/godot-text.mjs (VFX-DESIGN §53): a TEXT effect's Godot export, and proof that its
// glyph atlas, laid out the way <base>_text.gd lays it out, IS the app's own drawing of any words (here "-237", never
// the words the effect was made with), pixel for pixel on every frame before the break-up starts.
(async function () {
  const say = function (l) { dump("VFX " + l + "\n"); };
  const b64 = function (b) { let bin = ""; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(bin); };
  try {
    if (typeof endTour === "function") endTour(false);
    applyPreset(PRESETS["Pixel Damage Number"], "Damage Number", true);
    const C = liveExportCtx();
    const out = await buildExportBundle(null, { format: "sheet", layout: "grid", meta: "godot", trim: true, pot: false, emissive: false, sound: false, scales: [1], playback: "once", base: "damage-number" });
    const info = out.scene, T = info && info.text;
    if (!T) throw new Error("no text in the scene info");
    const file = (n) => out.files.find((f) => f.name === n);
    const glyphPng = file(info.base + "_glyphs.png");
    const atlas = await createImageBitmap(new Blob([glyphPng.data], { type: "image/png" }));
    // the reference: the app's own frames of "-237", with only the pixel blobs (as the atlas was made)
    const WORD = "-237";
    const ref = renderFrames(Object.assign(textOnlyGenome(C.st), { pixText: WORD }), { fit: C.fit });
    const W = ref.w, H = ref.h, tl = { x: info.offset.x - W / 2, y: info.offset.y - H / 2 };   // the frame's corner from the node
    // <base>_text.gd's layout, in JS (the same rounding: floor(v + 0.5))
    const rows = Array.from(WORD.toUpperCase()).map((c) => T.chars.indexOf(c)).filter((r) => r >= 0);
    const layout = (f) => {
      const S = T.scales[f] || 0;
      if (S <= 0) return [];
      const cx = T.centers[f];
      let w = 0; rows.forEach((r, i) => { w += T.widths[r] + (i ? 1 : 0); });
      const x0s = Math.floor(cx - w * S / 2 + 0.5);
      let off = 0;
      return rows.map((r) => { const gw = T.widths[r], x0g = Math.floor(cx - gw * S / 2 + 0.5), x = T.origin[0] + (x0s + off * S - x0g) * T.px; off += gw + 1; return { row: r, x: x, y: T.origin[1] }; });
    };
    const life = C.st.pixLife, breakAt = C.st.pixBreakAt, n = ref.canvases.length;
    let compared = 0, diffs = 0, worst = "";
    for (let f = 0; f < n; f++) {
      if (f / C.r.fps / C.st.duration > life * breakAt * 0.97) break;      // before the break-up (its dither is placed by position)
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const g = cv.getContext("2d");
      for (const L of layout(f)) g.drawImage(atlas, f * T.cell[0], L.row * T.cell[1], T.cell[0], T.cell[1], L.x - tl.x, L.y - tl.y, T.cell[0], T.cell[1]);
      const a = g.getImageData(0, 0, W, H).data, b = ref.canvases[f].getContext("2d").getImageData(0, 0, W, H).data;
      let d = 0, lit = 0;
      for (let p = 0; p < a.length; p += 4) { if (b[p + 3]) lit++; if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2] || a[p + 3] !== b[p + 3]) d++; }
      if (lit) { compared++; diffs += d; if (d && !worst) worst = "frame " + f + ": " + d + " px"; }
    }
    say("TEXTCOMPOSE " + JSON.stringify({ compared: compared, diffs: diffs, worst: worst }));
    // what the Godot half should find on frame F for the same words
    const F = T.scales.findIndex((s) => s > 0) + 2;
    say("TEXTEXPECT " + JSON.stringify({ word: WORD, frame: F, letters: layout(F).map((L) => ({ x: L.x, y: L.y, rx: F * T.cell[0], ry: L.row * T.cell[1] })) }));
    const files = out.files.map((f) => f.name + ":" + b64(f.data)).join("|");
    say("TEXTZIP " + JSON.stringify({ base: info.base, names: out.files.map((f) => f.name) }) + " " + btoa(files));
    // a game moment playing this effect (crunchyCore moments.js 6: play_at(target, text) sets the words)
    say("MOMENTGD " + b64(new TextEncoder().encode(MOMENT_GD)));
    say("MOMENTTSCN " + b64(new TextEncoder().encode(momentScene({ name: "Damage hit", script: "crunchy_moment.gd", effect: "fx/" + info.base + "/" + info.base + ".tscn",
      shake_px: 0, hit_stop_frames: 0, look_seconds: 0.2 }))));
    say("END PASS 1");
  } catch (e) {
    say("ERR " + (e && e.stack || e));
    say("END FAIL");
  }
})();

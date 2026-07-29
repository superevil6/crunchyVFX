"use strict";
// CrunchyVFX regression suite — the assertions that need `await`.
//
// These live apart from regression.js because --screenshot fires at window.load: anything behind
// an await finishes AFTER the shot and would silently never appear, which looks exactly like a
// suite that passed. So this one writes results.txt via a download instead. Run it with a profile
// configured to auto-save downloads (see README) and read the file.
(function () {
  const lines = [], NL = String.fromCharCode(10);
  let fails = 0;
  const ok = (c, label, extra) => {
    lines.push((c ? "PASS " : "FAIL ") + label + (extra ? " — " + extra : ""));
    if (!c) fails++;
  };
  const lit = (cv) => {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  };
  const litAll = (r) => r.canvases.reduce((a, cv) => a + lit(cv), 0);
  const report = () => {
    const txt = (fails ? "FAILURES: " + fails : "ALL PASS (" + lines.length + ")") + NL + lines.join(NL) + NL;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
    a.download = "results.txt";
    document.body.appendChild(a);
    a.click();
  };

  // A 4-frame character strip, generated here so the suite needs no asset files.
  function makeStrip() {
    const c = document.createElement("canvas");
    c.width = 192; c.height = 48;
    const g = c.getContext("2d");
    for (let i = 0; i < 4; i++) {
      const ox = i * 48, bob = [0, -2, 0, 2][i];
      g.fillStyle = "#e6c8aa"; g.beginPath(); g.arc(ox + 24, 16 + bob, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#466ec8"; g.fillRect(ox + 18, 24 + bob, 12, 16);
    }
    return c.toDataURL("image/png");
  }

  const img = new Image();
  img.style.cssText = "position:fixed;left:-9999px";
  document.body.appendChild(img);

  img.onload = async () => {
    try {
      // -------------------------------------------------------------- flipbook
      imageSpriteEl = img; imageSpriteVersion++; clearSpriteCache();
      applyPreset({ shape: 9, imageSprite: img.src, imgCols: 4, imgRows: 1, imgTint: 0,
                    count: 1, size: 40, speed: 0, life: 1.0, lifeVar: 0, duration: 1.0,
                    fadeIn: 0, fadeOut: 0, angleVar: 0, frameSize: 4 }, "flip");
      let sim = simulate(state);
      const cellAt = (f) => sim.frames[f][P_FRAME];
      const cells = new Set();
      for (let f = 0; f < sim.nFrames; f++) if (sim.counts[f]) cells.add(cellAt(f));
      ok(cellAt(0) === 0, "flipbook starts on cell 0");
      ok(cells.size === 4 && Math.max(...cells) === 3, "one particle plays all 4 cells, no overrun",
         [...cells].join(","));
      const r0 = renderFrames(state, { size: 64 });
      const sig = (cv) => {
        const d = cv.getContext("2d").getImageData(0, 0, 64, 64).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += d[i + 3] ? (i * 31 + d[i] + d[i + 1] + d[i + 2]) % 9973 : 0;
        return s;
      };
      ok(sig(r0.canvases[1]) !== sig(r0.canvases[Math.floor(r0.canvases.length * 0.7)]),
         "different cells draw different art");
      ok(litAll(r0) > 200, "the imported sprite actually renders", litAll(r0) + " px");
      // a data: URL keeps the canvas readable; a blob: URL would taint it under file://
      let tainted = "";
      try { r0.canvases[2].getContext("2d").getImageData(0, 0, 64, 64); } catch (e) { tainted = e.name; }
      ok(!tainted, "frames stay readable with an imported sprite", tainted || "clean");
      applyPreset({ shape: 9, imageSprite: img.src, imgCols: 4, imgRows: 1, imgStagger: 1,
                    count: 40, size: 20, speed: 80, life: 1.0, lifeVar: 0, duration: 1.0, frameSize: 4 }, "stag");
      sim = simulate(state);
      const atOnce = new Set();
      for (let i = 0; i < sim.counts[3]; i++) atOnce.add(sim.frames[3][i * P_STRIDE + P_FRAME]);
      ok(atOnce.size > 1, "stagger desynchronises particles", atOnce.size + " cells at once");
      applyPreset(PRESETS["Explosion"], "Explosion");
      ok(state.imageSprite === "", "imageSprite resets between presets");

      // -------------------------------------------------------------- APNG
      const bytes = await encodeApng(rendered.canvases, rendered.fps);
      const head = Array.from(bytes.subarray(0, 200)).map((c) => String.fromCharCode(c)).join("");
      ok([0x89, 0x50, 0x4E, 0x47].every((b, i) => bytes[i] === b), "PNG signature");
      ok(head.indexOf("acTL") > 0 && head.indexOf("acTL") < head.indexOf("IDAT"),
         "acTL precedes the first IDAT (required)");
      const dv = new DataView(bytes.buffer, bytes.byteOffset);
      ok(dv.getUint32(head.indexOf("acTL") + 4) === rendered.canvases.length, "acTL frame count");
      ok(dv.getUint32(head.indexOf("acTL") + 8) === 0, "acTL loops forever");
      const apngImg = new Image();
      await new Promise((res) => {
        apngImg.onload = res; apngImg.onerror = res;
        apngImg.src = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      });
      ok(apngImg.naturalWidth === rendered.w, "the browser decodes the APNG", apngImg.naturalWidth + "px");

      // -------------------------------------------------------------- zip paths
      // makeZip vanished once in a refactor and every zip export broke silently. Exercise them all.
      const grab = async (fn) => {
        let got = null;
        const real = window.download;
        window.download = (b) => { got = b; };
        await fn();
        window.download = real;
        return got;
      };
      applyPreset(PRESETS["Hit Spark"], "Hit Spark");
      expScaleBoxes[2].checked = true;
      const multi = await grab(async () => {
        expModal.querySelector("#expGo").click();
        await new Promise((r) => setTimeout(r, 1500));
      });
      expScaleBoxes[2].checked = false;
      ok(multi && multi.size > 1000, "multi-resolution export writes a zip",
         multi && Math.round(multi.size / 1024) + " KB");

      expFormat.value = "frames";
      const framesZip = await grab(async () => {
        expModal.querySelector("#expGo").click();
        await new Promise((r) => setTimeout(r, 1800));
      });
      expFormat.value = "sheet";
      ok(framesZip && framesZip.size > 1000, "PNG-frames export writes a zip",
         framesZip && Math.round(framesZip.size / 1024) + " KB");

      varCountEl.value = 3; seedVariations();
      const pack = await grab(async () => {
        varModal.querySelector("#varExport").click();
        await new Promise((r) => setTimeout(r, 2500));
      });
      ok(pack && pack.size > 1000, "variations pack writes a zip", pack && Math.round(pack.size / 1024) + " KB");

      // -------------------------------------------------------------- batch export
      userEffects = [
        { id: 1, name: "Alpha", state: snapshotState() },
        { id: 2, name: "Alpha", state: snapshotState() },   // deliberate duplicate name
      ];
      const editorBefore = snapshotState();
      const batch = await grab(() => batchExport("mine"));
      ok(batch && batch.size > 2000, "batch export writes a zip", batch && Math.round(batch.size / 1024) + " KB");
      ok(sameSnapshot(snapshotState(), editorBefore), "the editor is left exactly as it was");
      const zb = new Uint8Array(await batch.arrayBuffer());
      const zdv = new DataView(zb.buffer);
      const names = [];
      for (let i = 0; i + 30 < zb.length && zdv.getUint32(i, true) === 0x04034b50;) {
        const nlen = zdv.getUint16(i + 26, true), sz = zdv.getUint32(i + 18, true);
        names.push(String.fromCharCode.apply(null, zb.subarray(i + 30, i + 30 + nlen)));
        i += 30 + nlen + sz;
      }
      ok(new Set(names).size === names.length, "no duplicate paths in the zip", names.length + " entries");
      ok(names.some((n) => n.indexOf("alpha-2/") === 0), "the duplicate name was disambiguated");
      ok(names.indexOf("index.json") >= 0, "the pack has a manifest");

      // ------------------------------------------------------- streaming render
      // streamFrames() exists so a big export doesn't hold every frame as a live canvas at once.
      // It is only worth having if it is pixel-identical to renderFrames(), so compare them frame
      // by frame — including the two cases that make streaming hard: loopBlend (the last frames
      // are dissolved into the first, so the head can't be finalised until the tail exists) and
      // reverse (the output order is flipped).
      {
        const hashCv = (cv) => {
          const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
          let h = 0x811c9dc5;
          for (let i = 0; i < d.length; i += 4) {
            h ^= d[i] ^ (d[i + 1] << 1) ^ (d[i + 2] << 2) ^ (d[i + 3] << 3);
            h = Math.imul(h, 0x01000193) >>> 0;
          }
          return ("00000000" + h.toString(16)).slice(-8);
        };
        const CASES = [
          ["plain",             { loopBlend: 0, reverse: 0, echo: 0 }],
          ["loopBlend",         { loopBlend: 0.8, reverse: 0, echo: 0 }],
          ["reverse",           { loopBlend: 0, reverse: 1, echo: 0 }],
          ["loopBlend+reverse", { loopBlend: 0.8, reverse: 1, echo: 0 }],
          ["echo",              { loopBlend: 0, reverse: 0, echo: 0.7, echoDecay: 0.6 }],
          ["all three",         { loopBlend: 0.6, reverse: 1, echo: 0.6, echoDecay: 0.5 }],
        ];
        const bad = [];
        for (const [label, patch] of CASES) {
          applyPreset(Object.assign({}, PRESETS["Explosion"],
                                    { duration: 0.5, fps: 24, frameSize: 3 }, patch), "sf");
          const want = renderFrames(state, { size: 96 }).canvases.map(hashCv);
          const got = new Array(want.length);
          await streamFrames(state, { size: 96 }, (cv, idx) => { got[idx] = hashCv(cv); });
          if (got.length !== want.length || got.some((h, i) => h !== want[i])) {
            const at = got.findIndex((h, i) => h !== want[i]);
            bad.push(label + " (frame " + at + ")");
          }
        }
        ok(bad.length === 0, "streaming renders pixel-identically to the buffered path across " +
           CASES.length + " cases", bad.join(", "));

        // The point of the exercise: frames must not still be alive after they're handed over.
        applyPreset(Object.assign({}, PRESETS["Explosion"],
                                  { duration: 0.5, fps: 24, loopBlend: 0, reverse: 0 }), "sf2");
        const seen = [];
        await streamFrames(state, { size: 64 }, (cv) => { seen.push(cv); });
        const live = seen.filter((cv) => cv.width > 0).length;
        ok(live === 0, "every streamed frame is released after use", live + " still held");

        // The sheet is what most people export, so the streamed sheet has to be the same sheet.
        // Compare against the buffered builder directly rather than trusting the frame-level
        // check to cover the assembly.
        for (const [label, patch] of [["plain", {}], ["loop+reverse", { loopBlend: 0.7, reverse: 1 }]]) {
          applyPreset(Object.assign({}, PRESETS["Hit Spark"],
                                    { duration: 0.5, fps: 24, frameSize: 3 }, patch), "sheet");
          rerender();
          for (const trimOn of [false, true]) {
            const want = buildSheet({ frames: framesAtScale(2), trim: trimOn, layout: "grid" });
            const got = await buildSheetStreaming(2, { trim: trimOn, layout: "grid" });
            ok(got.cv.width === want.cv.width && got.cv.height === want.cv.height,
               "streamed sheet matches size (" + label + ", trim " + trimOn + ")",
               want.cv.width + "×" + want.cv.height + " vs " + got.cv.width + "×" + got.cv.height);
            if (got.cv.width === want.cv.width && got.cv.height === want.cv.height) {
              ok(hashCv(got.cv) === hashCv(want.cv),
                 "…and matches pixel for pixel (" + label + ", trim " + trimOn + ")");
            }
            ok(got.n === want.n && got.cols === want.cols,
               "…with the same cell layout (" + label + ", trim " + trimOn + ")",
               want.cols + " cols / " + want.n + " cells");
          }
        }
        applyPreset(PRESETS["Explosion"], "Explosion");
        rerender();
      }

      // ------------------------------------------------- vendored CrunchySFX synth engine
      // The engine is a generated file pulled in by tools/pull-synth.py. These assertions are the
      // in-app half of the tripwire: pull-synth.py --check proves the BYTES are an unmodified
      // export, and this proves the app can actually drive it. A silently-missing engine would
      // otherwise just mean "Match a sound quietly stopped making sound".
      ok(typeof CrunchySynth !== "undefined", "the vendored synth engine is loaded");
      if (typeof CrunchySynth !== "undefined") {
        ok(/^\d+\.\d+\.\d+$/.test(CrunchySynth.VERSION), "it reports an upstream version",
           CrunchySynth.VERSION + " @ " + CrunchySynth.BUILT);
        ok(SFX_DEFAULTS === CrunchySynth.DEFAULTS,
           "the app reads the engine's canonical defaults, not its own stale copy");
        ok(Object.keys(SFX_DEFAULTS).length > Object.keys(SFX_DEFAULTS_FALLBACK).length,
           "the canonical table is the fuller one",
           Object.keys(SFX_DEFAULTS).length + " vs " + Object.keys(SFX_DEFAULTS_FALLBACK).length);

        // A patch in, audible stereo audio out — the whole point of vendoring it.
        const s = synthesizePatch({ wave: 0, freq: 220, duration: 0.4, decay: 0.2, release: 0.1 }, "T");
        ok(s && s.L.length === Math.floor(0.4 * CrunchySynth.SR),
           "rendering a patch yields the requested duration", s ? s.L.length + " samples" : "null");
        let peak = 0;
        for (let i = 0; i < s.L.length; i++) peak = Math.max(peak, Math.abs(s.L[i]));
        ok(peak > 0.01, "the rendered audio is not silence", "peak " + peak.toFixed(3));

        // Same engine as CrunchySFX means the WAV is the one that app would have written.
        const wav = new Uint8Array(CrunchySynth.encodeWav(s.L, s.R, { rate: s.rate, depth: 16, channels: 2 }));
        const tag = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]) +
                    String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
        ok(tag === "RIFFWAVE", "it encodes a real WAV", tag + ", " + wav.length + " bytes");

        // The real user path: a share link decodes to a patch that the engine can render, so
        // "Match a sound" produces the actual sound and not just the visual mapping.
        const payload = { v: 1, t: "Link Test", s: { wave: 2, freq: 660, duration: 0.3, decay: 0.15 } };
        const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const decoded = decodeSfxLink("https://crunchysfx.com/?s=" + b64);
        ok(decoded !== null, "a share link still decodes");
        const m = decoded && matchSound(decoded);
        ok(m && m.sfx && m.sfx.freq === 660, "the raw sound patch is carried through the match");
        const s2 = m && synthesizePatch(m.sfx, m.name);
        ok(s2 && s2.L.length === Math.floor(0.3 * CrunchySynth.SR),
           "the matched link synthesises at its own duration");

        // …and it reaches the export: a sheet plus the WAV you actually heard, in one zip.
        synthesizePatch({ wave: 2, freq: 440, duration: 0.25, decay: 0.1 }, "Export Test");
        refreshExpInfo();
        ok(!expSoundRow.hidden, "the export dialog offers the sound once one exists");
        const withWav = await grab(async () => {
          expModal.querySelector("#expGo").click();
          await new Promise((r) => setTimeout(r, 1500));
        });
        let names = [];
        if (withWav) {
          const zb = new Uint8Array(await withWav.arrayBuffer());
          const zdv = new DataView(zb.buffer);
          for (let i = 0; i + 30 < zb.length && zdv.getUint32(i, true) === 0x04034b50;) {
            const nlen = zdv.getUint16(i + 26, true), sz = zdv.getUint32(i + 18, true);
            names.push(String.fromCharCode.apply(null, zb.subarray(i + 30, i + 30 + nlen)));
            i += 30 + nlen + sz;
          }
        }
        ok(names.some((n) => /\.wav$/.test(n)), "the synthesised sound ships beside the sheet",
           names.join(", "));

        synthSound = null;   // leave the editor as we found it
        refreshExpInfo();
        ok(expSoundRow.hidden, "and the option hides again when there is no sound");
      }

      // ------------------------------------------------- export pipelines + pack re-export
      {
        const realPipes = pipelines.slice();
        pipelines = []; activePipe = -1; renderPipelines();

        // A pipeline captures EXPORT settings and nothing about the effect itself — saving one
        // while editing a fire effect must not make it a fire pipeline.
        expFormat.value = "sheet"; expLayout.value = "row"; expMetaSel.value = "godot";
        expTrim.checked = true; expPot.checked = true;
        expScaleBoxes[2].checked = true;
        const snap = currentPipelineSettings();
        ok(snap.layout === "row" && snap.meta === "godot" && snap.trim === true,
           "a pipeline captures the current export settings");
        ok(snap.scales.length === 2 && snap.scales.indexOf(2) >= 0,
           "…including the chosen sizes", snap.scales.join("×, ") + "×");
        ok(!("hue" in snap) && !("shape" in snap),
           "…and nothing about the effect being edited");

        // Round-trip: change everything, then apply it back.
        expFormat.value = "apng"; expLayout.value = "grid"; expMetaSel.value = "none";
        expTrim.checked = false; expPot.checked = false; expScaleBoxes[2].checked = false;
        applyPipelineSettings(snap);
        ok(expFormat.value === "sheet" && expLayout.value === "row" &&
           expMetaSel.value === "godot" && expTrim.checked && expPot.checked,
           "running a pipeline restores those settings");
        ok(expScaleBoxes[2].checked === true, "…including the sizes");
        expScaleBoxes[2].checked = false; expTrim.checked = false; expPot.checked = false;
        expMetaSel.value = "generic";

        // The pack re-export is a STYLE PASS: overrides must reach every effect, and the editor
        // must be put back exactly as it was afterwards.
        userEffects = [
          { id: 1, name: "PackA", state: withState(PRESETS["Explosion"], () => snapshotState()) },
          { id: 2, name: "PackB", state: withState(PRESETS["Ice Blast"], () => snapshotState()) },
        ];
        applyPreset(PRESETS["Explosion"], "Explosion");
        state.pixelate = 5; state.posterize = 6;
        const editorBefore2 = snapshotState();
        const zip = await grab(() => batchExport("mine", { overrides: { pixelate: 5, posterize: 6 } }));
        ok(zip && zip.size > 1000, "the pack re-export writes a zip",
           zip && Math.round(zip.size / 1024) + " KB");
        ok(sameSnapshot(snapshotState(), editorBefore2),
           "…and puts the editor back exactly as it was");

        // Prove the override actually landed: the same effect exported with and without a heavy
        // pixelate must differ. Without this the feature could silently do nothing.
        const plainZip = await grab(() => batchExport("mine", {}));
        ok(plainZip && Math.abs(plainZip.size - zip.size) > 200,
           "the overrides really change what is exported",
           Math.round(plainZip.size / 1024) + " KB vs " + Math.round(zip.size / 1024) + " KB");

        pipelines = realPipes; activePipe = -1; savePipelines(); renderPipelines();
        userEffects = [];
        applyPreset(PRESETS["Explosion"], "Explosion");
      }

      // ------------------------------------------------- exporting must not damage the preview
      // The streaming work added a cleanup pass that released the frames an export had rendered.
      // At 1x with no reference image, framesAtScale() returns the LIVE preview canvases rather
      // than copies, so that cleanup blanked the stage — and nothing failed at the time. Every
      // later buildSheet() just produced an empty sheet, which surfaced as "drag-out worked once
      // and then silently stopped". Export every format and check the preview survives each.
      {
        applyPreset(PRESETS["Explosion"], "Explosion");
        rerender();
        const before = rendered.canvases.length;
        const damaged = [];
        for (const [fmt, emis] of [["sheet", false], ["sheet", true], ["apng", false], ["frames", false]]) {
          expFormat.value = fmt;
          expEmis.checked = emis;
          await grab(async () => {
            expModal.querySelector("#expGo").click();
            await new Promise((r) => setTimeout(r, 1200));
          });
          const dead = rendered.canvases.filter((cv) => !cv.width || !cv.height).length;
          if (dead) damaged.push(fmt + (emis ? "+emissive" : "") + " killed " + dead);
          // A sheet built afterwards must still have pixels in it.
          const sh = buildSheet({ layout: "grid" });
          if (lit(sh.cv) === 0) damaged.push(fmt + (emis ? "+emissive" : "") + " left an empty sheet");
        }
        expEmis.checked = false;
        expFormat.value = "sheet";
        ok(damaged.length === 0,
           "no export format damages the live preview", damaged.join("; ") || before + " frames intact");
      }

      // ------------------------------------------------------- desktop (Tauri) save path
      // download() is the single choke point every export funnels through, and on desktop it
      // must route to the native Save dialog rather than an <a download> (Tauri has no download
      // manager, so the browser path silently does nothing there). Stub __TAURI__ and check all
      // three branches: save, cancel, and failure-falls-back. Only reachable in the desktop
      // build, so nothing else in either suite would notice if it broke.
      {
        const realTauri = window.__TAURI__, realClick = HTMLAnchorElement.prototype.click;
        let asked = null, wrote = null, clicked = 0, mode = "save";
        HTMLAnchorElement.prototype.click = function () { clicked++; };
        window.__TAURI__ = {
          dialog: { save: async (o) => {
            asked = o;
            if (mode === "throw") throw new Error("dialog unavailable");
            return mode === "cancel" ? null : "/tmp/out/" + o.defaultPath;
          } },
          fs: { writeFile: async (p, b) => { wrote = { p: p, b: b }; } },
        };
        const settle = () => new Promise((r) => setTimeout(r, 20));
        try {
          download(new Blob([new Uint8Array([1, 2, 3])], { type: "image/gif" }), "boom.gif");
          await settle();
          ok(asked && asked.defaultPath === "boom.gif", "desktop export opens the native Save dialog");
          ok(asked && asked.filters[0].extensions[0] === "gif",
             "the file-type filter follows the extension", asked && asked.filters[0].name);
          ok(clicked === 0, "no browser download is triggered on desktop");
          ok(wrote && /boom\.gif$/.test(wrote.p), "it writes to the path the dialog returned");
          ok(wrote && wrote.b.length === 3 && wrote.b[0] === 1 && wrote.b[2] === 3,
             "the bytes written are the blob's, intact");

          mode = "cancel"; wrote = null;
          download(new Blob([new Uint8Array([9])]), "cancelled.zip");
          await settle();
          ok(wrote === null && clicked === 0, "cancelling the dialog writes nothing");

          mode = "throw"; wrote = null;
          download(new Blob([new Uint8Array([9])]), "broken.png");
          await settle();
          ok(clicked === 1, "if the native path fails it falls back to a browser download");
        } finally {
          window.__TAURI__ = realTauri;
          HTMLAnchorElement.prototype.click = realClick;
        }
      }

      // -------------------------------------------------------------- A/B compare
      applyPreset(PRESETS["Explosion"], "Explosion");
      const hueA = state.hue;
      document.getElementById("abHold").click();     // via the button: Swap starts disabled
      state.hue = (hueA + 120) % 360; rerender();
      const hueB = state.hue;
      document.getElementById("abSwap").click();
      ok(state.hue === hueA, "swap returns to the held effect");
      document.getElementById("abSwap").click();
      ok(state.hue === hueB, "swapping again goes back — it's a swap, not a restore");
    } catch (e) {
      fails++;
      lines.push("FAIL threw: " + e.message);
    }
    report();
  };
  img.onerror = () => { fails++; lines.push("FAIL test strip failed to load"); report(); };
  img.src = makeStrip();
})();

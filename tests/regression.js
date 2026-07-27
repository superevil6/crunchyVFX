"use strict";
// CrunchyVFX regression suite — synchronous assertions.
// Appended to a copy of index.html by build.py, so everything below talks to the real app.
// Anything needing `await` lives in regression-async.js (see README for why).
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
  const peak = (sim) => { let m = 0; for (let i = 0; i < sim.counts.length; i++) m = Math.max(m, sim.counts[i]); return m; };
  const colours = (cv, onlyOpaque) => {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, s = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (onlyOpaque ? d[i + 3] !== 255 : d[i + 3] <= 8) continue;
      s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    return s;
  };

  try {
    // ---------------------------------------------------------------- render core
    pixelLock = false;                     // this suite pokes crunch params then loads presets
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(!!rendered && rendered.canvases.length > 1, "boot renders", rendered.canvases.length + " frames");
    let lit0 = 0;
    for (const cv of rendered.canvases) if (lit(cv)) lit0++;
    ok(lit0 >= rendered.canvases.length * 0.5, "most frames have pixels", lit0 + "/" + rendered.canvases.length);

    const a = simulate(state).bbox, b = simulate(state).bbox;
    ok(a.x0 === b.x0 && a.x1 === b.x1 && a.y0 === b.y0 && a.y1 === b.y1, "simulate is deterministic");

    // hashed randomness: growing `count` must not reshuffle the particles already there
    const s1 = simulate(state), n0 = state.count;
    state.count = n0 + 50;
    const s2 = simulate(state);
    state.count = n0;
    let stable = true;
    for (let i = 0; i < Math.min(20, s1.counts[2]); i++) {
      if (Math.abs(s1.frames[2][i * P_STRIDE] - s2.frames[2][i * P_STRIDE]) > 1e-4) { stable = false; break; }
    }
    ok(stable, "the count slider grows the effect instead of scrambling it");

    // every preset must render
    const dead = [];
    for (const name of Object.keys(PRESETS)) {
      applyPreset(PRESETS[name], name);
      if (!litAll(rendered) || rendered.canvases.length < 2) dead.push(name);
    }
    ok(!dead.length, "all " + Object.keys(PRESETS).length + " presets render", dead.join(" ") || "clean");
    const catCount = PRESET_CATEGORIES.reduce((n, c) => n + c[1].length, 0);
    ok(catCount === Object.keys(PRESETS).length, "every preset is in exactly one category");

    // every implemented shape draws something
    const blank = [];
    for (const s of RANDOM_SHAPES) {
      applyPreset({ shape: s, count: 40, size: 26, speed: 120, life: 0.6, duration: 0.4, coreWhite: 0.4 }, "shape");
      if (litAll(rendered) < 50) blank.push(SHAPES[s]);
    }
    ok(!blank.length, "all " + RANDOM_SHAPES.length + " shapes draw", blank.join(" ") || "clean");

    // origin actually positions the emitter (it silently didn't, once)
    const centroidY = (originY) => {
      applyPreset({ shape: 0, count: 60, speed: 0, size: 14, life: 0.5, duration: 0.3, originY }, "o");
      const r = renderFrames(state, { size: 128 });
      const d = r.canvases[1].getContext("2d").getImageData(0, 0, 128, 128).data;
      let sum = 0, n = 0;
      for (let p = 0; p < 128 * 128; p++) if (d[p * 4 + 3] > 40) { sum += (p / 128) | 0; n++; }
      return n ? sum / n : -1;
    };
    const top = centroidY(0.1), bottom = centroidY(0.9);
    ok(top > 0 && bottom - top > 60, "originY places the emitter in the frame",
       "y " + Math.round(top) + " vs " + Math.round(bottom));

    // Fit scales the effect up to fill the frame
    applyPreset(PRESETS["Hit Spark"], "Hit Spark");
    const fitR = renderFrames(state, { size: 128, fit: true });
    let minx = 999, maxx = -1;
    for (const cv of fitR.canvases) {
      const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
      for (let p = 0; p < 128 * 128; p++) if (d[p * 4 + 3] > 8) { const x = p % 128; if (x < minx) minx = x; if (x > maxx) maxx = x; }
    }
    ok(maxx - minx > 128 * 0.7, "Fit fills the frame", "span " + (maxx - minx) + "/128");

    // the whole finishing chain survives being turned on at once
    applyPreset(PRESETS["Explosion"], "Explosion");
    Object.assign(state, { pixelate: 4, posterize: 6, dither: 0.8, alphaCut: 0.5, outline: 2,
                           glow: 0.6, echo: 0.5, trail: 0.6, shake: 0.3, loopBlend: 0.5 });
    const crunch = renderFrames(state, { size: 96 });
    ok(lit(crunch.canvases[2]) > 0, "full crunch + glow + echo chain renders", lit(crunch.canvases[2]) + " px");
    const cd = crunch.canvases[2].getContext("2d").getImageData(0, 0, 96, 96).data;
    let hard = 0;
    for (let i = 3; i < cd.length; i += 4) if (cd[i] === 255) hard++;
    ok(hard > 0, "alphaCut + outline produce hard alpha", hard + " opaque px");

    // ---------------------------------------------------------------- patch model
    // Non-PARAMS fields are the ones that leak if mishandled — check every one round-trips AND resets.
    applyPreset({ shape: 18, glyph: "🔥", customSprite: "", ramp: "0,10,1,0.5,1|1,60,1,0.5,0",
                  bubbleText: "Hi", paletteLock: "ff0000,00ff00", duration: 0.4 }, "extras");
    for (const k in PATCH_EXTRAS) {
      if (k === "imageSprite" || k === "customSprite") continue;
      ok(state[k] !== PATCH_EXTRAS[k], "extra travels: " + k, JSON.stringify(state[k]).slice(0, 24));
    }
    applyPreset(PRESETS["Explosion"], "Explosion");
    const leaked = Object.keys(PATCH_EXTRAS).filter((k) => state[k] !== PATCH_EXTRAS[k]);
    ok(!leaked.length, "no extra leaks between presets", leaked.join(",") || "clean");

    // ---------------------------------------------------------------- share codec
    applyPreset(PRESETS["Emote Pop"], "Emote Pop");
    state.glyph = "💥"; state.count = 7;
    const enc = encodePatch("My Effect");
    ok(!/[+/=]/.test(enc), "share code is URL-safe base64");
    const dec = decodePatch(enc);
    ok(dec && dec.n === "My Effect" && dec.glyph === "💥" && dec.count === 7, "patch round-trips including emoji");
    ok(Object.keys(dec).length < PARAMS.length / 2, "it's a diff, not a dump", Object.keys(dec).length + " keys");
    ok(decodePatch("not!base64") === null, "garbage decodes to null");
    const partial = decodePatch(enc); delete partial.count;
    applyPreset(partial, "partial");
    ok(state.count === PARAM_BY_KEY.count[5], "a missing key falls back to its default");
    ok(buildShareUrl(enc).indexOf("?e=") > 0, "share URL carries the patch");

    // ---------------------------------------------------------------- genomes
    applyPreset(PRESETS["Hit Spark"], "Hit Spark");
    const base = snapshotState(), kid = mutateGenome(base, 0.25);
    ok(kid.shape === base.shape && kid.duration === base.duration, "breeding never mutates identity params");
    ok(PARAMS.every((p) => kid[p[0]] >= p[2] && kid[p[0]] <= p[3]), "mutations stay inside slider ranges");
    seedBreedGrid();
    ok(breedGenomes.length === 9 && breedGrid.children.length === 9, "breed grid builds 9 cells");
    ok(sameSnapshot(breedGenomes[0], snapshotState()), "cell 1 is the current effect");
    const made = Array.from({ length: 8 }, () => foundryGenerate("Impact", "NES"));
    ok(made.every((m) => archByName("Impact").shapes.indexOf(m.shape) >= 0), "foundry respects its archetype");
    ok(made.every((m) => m.pixelate === 3 && m.fps === 12), "the NES style clamps the look");
    ok(genomePixels(Object.assign(snapshotState(), { opacity: 0, flash: 0, wave: 0 })) === 0,
       "an invisible genome scores 0 (the visibility guard's basis)");

    // ---------------------------------------------------------------- pixel lock
    pixelLock = true; lockedValues = {};
    applyPreset(PRESETS["Pixel Burst"], "Pixel Burst");
    ok(!Object.keys(lockedValues).length, "loading a preset pins nothing");
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(state.pixelate === PARAM_BY_KEY.pixelate[5], "…so the next preset isn't stuck pixelated");
    state.pixelate = 5; noteLockEdit("pixelate");
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(state.pixelate === 5, "a hand edit is pinned and survives loading an effect");
    lockedValues = {}; pixelLock = false;

    // ---------------------------------------------------------------- undo
    applyPreset(PRESETS["Explosion"], "Explosion");
    const c0 = state.count, h0 = histPos;
    state.count = 999; commitHistory();
    ok(histPos === h0 + 1, "commit adds one entry");
    undoEdit(); ok(state.count === c0, "undo restores");
    redoEdit(); ok(state.count === 999, "redo re-applies");
    const before = histPos; commitHistory();
    ok(histPos === before, "committing an unchanged state is a no-op");

    // ---------------------------------------------------------------- sub-emitters
    const SUB = { shape: 0, count: 20, size: 16, speed: 200, drag: 0.3, life: 0.3, lifeVar: 0,
                  duration: 1.0, fadeIn: 0, fadeOut: 0.2 };
    applyPreset(Object.assign({}, SUB), "nosub");
    const plain = simulate(state);
    applyPreset(Object.assign({}, SUB, { subCount: 4, subLife: 0.4, subSize: 0.5 }), "sub");
    const subbed = simulate(state);
    ok(peak(subbed) > peak(plain), "children add particles", peak(plain) + " → " + peak(subbed));
    ok(plain.counts[12] === 0 && subbed.counts[12] > 0, "the effect lives on past its parents");
    applyPreset(Object.assign({}, SUB, { count: 50, subCount: 6, subLife: 1.5 }), "bounded");
    ok(peak(simulate(state)) <= 50 * 7, "children never spawn grandchildren");

    // ---------------------------------------------------------------- ground
    const FALL = { shape: 4, count: 40, size: 10, speed: 60, emitSpread: 60, gravity: 900, drag: 0,
                   life: 2.5, lifeVar: 0, duration: 1.6, fadeOut: 0, originY: 0.15, frameSize: 4 };
    applyPreset(Object.assign({}, FALL, { bounce: 0.6, groundY: 0.8, friction: 0.2 }), "floor");
    const fsim = simulate(state);
    let through = 0, lowest = 0;
    for (let f = 0; f < fsim.nFrames; f++) {
      for (let i = 0; i < fsim.counts[f]; i++) {
        const y = fsim.frames[f][i * P_STRIDE + P_Y];
        lowest = Math.max(lowest, y);
        if (y > 0.8 * 128 + 1.5) through++;
      }
    }
    ok(through === 0, "nothing passes through the ground line");
    ok(Math.abs(lowest - 0.8 * 128) < 2, "particles come to rest on the line", lowest.toFixed(1));

    // ---------------------------------------------------------------- bubble
    applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, frameSize: 4,
                  bubble: 1, bubbleText: "Hey!", bubbleLife: 0.9 }, "bub");
    let r = renderFrames(state, { size: 128 });
    const mid = Math.floor(r.canvases.length * 0.5);
    ok(lit(r.canvases[mid]) > 400, "the bubble draws", lit(r.canvases[mid]) + " px");
    ok(lit(r.canvases[0]) < lit(r.canvases[mid]), "it pops in rather than appearing full size");
    applyPreset({ shape: 0, count: 1, opacity: 0, duration: 0.5, bubble: 1, bubbleText: "" }, "notext");
    ok(lit(renderFrames(state, { size: 128 }).canvases[2]) === 0, "no text = no empty box");

    // ---------------------------------------------------------------- palette
    const P16 = BUILTIN_PALETTES["Sweetie 16"];
    ok(parsePalette(P16).length === 16, "palette parses");
    ok(parsePalette("") === null && parsePalette("zzz") === null, "bad palette = off, not a crash");
    ok(parsePaletteFile("1a1c2c\n5d275d").length === 2, "Lospec .hex parses");
    ok(parsePaletteFile("GIMP Palette\nName: x\n26 28 44 dark\n93 39 93 p").length === 2, "GIMP .gpl parses");
    ok(parsePaletteFile("; c\nFF1A1C2C\nFF5D275D").length === 2, "paint.net .txt parses");
    applyPreset(PRESETS["Explosion"], "Explosion");
    state.paletteLock = P16; state.alphaCut = 0.5; rerender();
    const allowed = new Set(P16.split(",").map((h) => parseInt(h, 16)));
    const used = colours(rendered.canvases[3]);
    // exact only where alpha is 255 — canvas stores colour premultiplied, so alphaCut is the
    // difference between "about 16 colours" and exactly 16.
    ok(used.size <= 16 && [...used].every((c) => allowed.has(c)),
       "with hard alpha every pixel is a palette colour", used.size + " distinct");
    state.posterize = 2; rerender();
    ok([...colours(rendered.canvases[3])].every((c) => allowed.has(c)), "posterize is bypassed under a palette");

    // ---------------------------------------------------------------- export shaping
    applyPreset(PRESETS["Hit Spark"], "Hit Spark");
    state.frameSize = 4; rerender();
    const full = buildSheet({ trim: false }), trimmed = buildSheet({ trim: true });
    ok(trimmed.trim && trimmed.w < full.w, "trim shrinks the cells", full.w + " → " + trimmed.w);
    ok(trimmed.frames.every((c) => c.width === trimmed.w), "one shared crop box (no jitter)");
    ok(trimmed.pivot.x > 0 && trimmed.pivot.x < 1, "pivot lands inside the cell");
    const row = buildSheet({ layout: "row" }), pot = buildSheet({ pot: true });
    ok(row.rows === 1 && row.cols === row.n, "strip layout");
    ok((pot.cv.width & (pot.cv.width - 1)) === 0, "power-of-two padding", pot.cv.width + "px");
    const sh = buildSheet({ trim: true });
    const gen = JSON.parse(sidecarFor("generic", sh, "fx", 24));
    ok(gen.frames === sh.n && gen.trimmed && gen.trimOffset.x === sh.trim.x, "generic sidecar");
    const ase = JSON.parse(sidecarFor("aseprite", sh, "fx", 24));
    ok(Object.keys(ase.frames).length === sh.n && ase.frames["fx 0.png"].duration === Math.round(1000 / 24),
       "Aseprite sidecar");
    const ph = JSON.parse(sidecarFor("phaser", sh, "fx", 24));
    ok(Array.isArray(ph.frames) && ph.frames[1].filename === "fx_001", "Phaser sidecar");
    ok(framesAtScale(2)[0].width === framesAtScale(1)[0].width * 2, "2× re-rasterises the same sim");

    // the zip writer — this went missing once and every zip path broke silently
    ok(typeof makeZip === "function" && typeof crc32 === "function", "the zip writer exists");
    const z = makeZip([{ name: "a.txt", data: new TextEncoder().encode("hello") }]);
    const zv = new DataView(z.buffer);
    ok(zv.getUint32(0, true) === 0x04034b50, "zip local header signature");
    ok(zv.getUint32(z.length - 22, true) === 0x06054b50, "zip end-of-central-directory signature");

    // ---------------------------------------------------------------- GIF
    applyPreset(PRESETS["Explosion"], "Explosion");
    const d24 = gifDelayCs(24), d25 = gifDelayCs(25);
    ok(d24.cs === 4 && !d24.exact, "24fps is flagged as inexact for GIF");
    ok(d25.cs === 4 && d25.exact, "25fps is exact");
    const gif = encodeGif(rendered.canvases, state.fps);
    ok(String.fromCharCode.apply(null, gif.subarray(0, 6)) === "GIF89a", "GIF header");
    ok(gif[gif.length - 1] === 0x3B, "GIF trailer");
    ok(gif[10] === 0xF7, "GIF global colour table flags");

    // ---------------------------------------------------------------- preview guides
    guides.grid = guides.safe = guides.onion = false;
    drawStage();
    const clean = lit(stage);
    guides.safe = true; drawStage();
    ok(lit(stage) > clean, "safe frame draws on the stage");
    guides.safe = false;
    const beforeGuides = lit(rendered.canvases[3]);
    guides.grid = guides.safe = guides.onion = true;
    rerender();
    ok(lit(rendered.canvases[3]) === beforeGuides, "guides never leak into a render");
    guides.grid = guides.safe = guides.onion = false;

    // ---------------------------------------------------------------- transport + auto zoom
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(Math.abs(loopSeconds() - rendered.canvases.length / rendered.fps) < 1e-9,
       "loop length is frames / fps", loopSeconds().toFixed(3) + "s");
    // The transport must derive the frame from elapsed time, not a per-tick counter — that's what
    // keeps picture and sound from drifting apart over a loop.
    playing = true;
    restartLoop(0);
    // Aim at the MIDDLE of frame 5, not its boundary: `now - x` then re-adding loses enough
    // precision that an exact boundary lands a hair either side and floor() flips.
    loopStart = performance.now() / 1000 - (5.5 / rendered.fps);
    tick();
    ok(frameIdx === 5, "frame position comes from elapsed time", "frame " + frameIdx);
    loopStart = performance.now() / 1000 - loopSeconds() - 0.01; // past the end
    tick();
    ok(frameIdx === 0, "passing the end restarts the loop (picture and sound together)");
    playing = false;

    // auto zoom picks whole multiples only — a fractional zoom resamples pixel art into mush
    zoomMode = "auto";
    const zoomLevel = autoZoom();
    ok(zoomLevel === Math.floor(zoomLevel) && zoomLevel >= 1, "auto zoom is a whole number", zoomLevel + "×");
    applyZoom();
    ok(parseFloat(stage.style.width) === rendered.w * zoomLevel, "the stage is sized to that multiple",
       stage.style.width);
    zoomMode = 3; applyZoom();
    ok(parseFloat(stage.style.width) === rendered.w * 3, "an explicit zoom overrides auto");
    zoomMode = "auto";

    // sound: no clip loaded must be entirely inert (this runs headless with no audio device)
    ok(!snd.buf, "no sound loaded by default");
    stopSound(); playSound(0);
    ok(!snd.src, "playSound with no clip is a no-op, not a crash");

    // ---------------------------------------------------------------- docked preview
    applyPreset(PRESETS["Explosion"], "Explosion");
    dockOn = true;
    // stage in view -> no dock
    stageBox.getBoundingClientRect = () => ({ bottom: 9999, top: 0 });
    updateDock();
    ok(dock.hidden, "no dock while the stage is in view");
    // scrolled past -> dock appears, and appears BEFORE the stage is fully gone (it must clear the
    // sticky toolbar, or it arrives too late to be useful)
    const barH = controlsEl.offsetHeight;
    stageBox.getBoundingClientRect = () => ({ bottom: barH + 5, top: -300 });
    updateDock();
    ok(!dock.hidden, "dock appears once the stage slips under the toolbar", "bar " + barH + "px");
    ok(parseInt(dock.style.top, 10) >= barH, "dock sits below the toolbar, not behind it", dock.style.top);
    sizeDock(); paintDock();
    ok(dockCv.width === rendered.w && dockCv.height === rendered.h, "dock canvas matches the render size");
    const dz = parseFloat(dockCv.style.width) / rendered.w;
    ok(dz === Math.floor(dz) || rendered.w >= 150, "dock scale is a whole multiple", dz + "×");
    let dockLit = 0;
    const dd = dockCtx.getImageData(0, 0, dockCv.width, dockCv.height).data;
    for (let i = 3; i < dd.length; i += 4) if (dd[i] > 8) dockLit++;
    ok(dockLit > 0, "the dock actually paints the current frame", dockLit + " px");
    // guides are deliberately NOT mirrored into the dock (a 1px grid at 150px is noise)
    guides.grid = true;
    drawStage();
    const withGrid = dockCtx.getImageData(0, 0, dockCv.width, dockCv.height).data;
    let n2 = 0;
    for (let i = 3; i < withGrid.length; i += 4) if (withGrid[i] > 8) n2++;
    ok(n2 === dockLit, "guides are not mirrored into the dock", dockLit + " vs " + n2);
    guides.grid = false;
    dockOn = false; updateDock();
    ok(dock.hidden, "turning the dock off hides it");
    dockOn = true;
    delete stageBox.getBoundingClientRect;      // restore the real one
  } catch (e) {
    fails++;
    lines.push("FAIL threw: " + e.message);
  }

  const box = document.createElement("div");
  box.style.cssText = "position:fixed;inset:0;z-index:99999;overflow:auto;background:" +
    (fails ? "#7a1020" : "#0d3a1e") + ";color:#fff;font:12px ui-monospace,monospace;padding:12px;white-space:pre-line";
  // Failures first: the box scrolls, and a failure 60 lines down is a failure you won't see in a
  // screenshot.
  const bad = lines.filter((l) => l.indexOf("FAIL") === 0);
  const good = lines.filter((l) => l.indexOf("FAIL") !== 0);
  box.textContent = (fails ? "✗ " + fails + " FAILURES" : "✓ ALL PASS (" + lines.length + ")") +
    NL + bad.concat(good).join(NL);
  document.body.appendChild(box);
})();

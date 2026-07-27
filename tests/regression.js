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
    const made = Array.from({ length: 8 }, () => foundryGenerate("Impact", "8-bit"));
    ok(made.every((m) => archByName("Impact").shapes.indexOf(m.shape) >= 0), "foundry respects its archetype");
    ok(made.every((m) => m.pixelate === 3 && m.fps === 12), "the 8-bit style clamps the look");
    // every era style must be a complete overlay: one that omits paletteLock would leave the
    // previous style's palette locked on, so switching Pocket -> Super would still look green.
    const missing = STYLES.filter((st2) => st2.name !== "Anything" && !("paletteLock" in st2.patch));
    ok(!missing.length, "every era style sets paletteLock explicitly",
       missing.map((m2) => m2.name).join(",") || "clean");
    ok(STYLES.every((st2) => Object.keys(st2.patch).every((k) => k in state)),
       "every era style only writes real params");
    // the Godot sidecar at least has to be structurally a .tres referencing every cell
    applyPreset(PRESETS["Hit Spark"], "Hit Spark");
    const gsh = buildSheet({});
    const tres = sidecarFor("godot", gsh, "fx", 24);
    ok(tres.indexOf('[gd_resource type="SpriteFrames"') === 0, "Godot sidecar declares its type");
    ok((tres.match(/sub_resource type="AtlasTexture"/g) || []).length === gsh.n,
       "one AtlasTexture per frame", gsh.n + " cells");
    ok(tres.indexOf('path="res://fx.png"') > 0 && tres.indexOf('"speed": 24.0') > 0,
       "…and points at the sheet with the right frame rate");
    // Trimmed cells must carry an AtlasTexture margin, or a trimmed sheet sits offset in-engine.
    // Verified in Godot 4.7: with the margin, get_size() reports the UNTRIMMED size.
    const gtrim = buildSheet({ trim: true });
    const ttres = sidecarFor("godot", gtrim, "fx", 24);
    ok(!gtrim.trim || ttres.indexOf("margin = Rect2(") > 0,
       "a trimmed Godot sheet carries the AtlasTexture margin");
    ok(sidecarFor("godot", buildSheet({ trim: false }), "fx", 24).indexOf("margin") < 0,
       "…and an untrimmed one doesn't");
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
    const c0 = state.count;
    state.count = 999; commitHistory();
    // NB: not "histPos advanced" — the history caps at EDIT_HIST_MAX and by this point in the
    // suite it's full, so the index legitimately stops moving while entries shift off the front.
    ok(sameSnapshot(editHistory[histPos], snapshotState()), "commit records the current state");
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

    // ---------------------------------------------------------------- size over lifetime
    // 5-value stops predate the size channel and must still mean "no size change"
    const old5 = parseRamp("0,30,1,0.5,1|1,30,1,0.5,1");
    ok(old5[0].z === 1 && old5[1].z === 1, "a 5-value ramp defaults to size 1 (old links still work)");
    const withZ = parseRamp("0,30,1,0.5,1,0.2|1,30,1,0.5,1,2");
    ok(withZ[0].z === 0.2 && withZ[1].z === 2, "a 6-value ramp carries the size channel");
    ok(Math.abs(sampleRamp(withZ, 0.5).z - 1.1) < 0.01, "size interpolates between stops",
       sampleRamp(withZ, 0.5).z.toFixed(2));
    const sizeAt = (rampStr, frame) => {
      applyPreset({ shape: 0, count: 20, size: 20, speed: 0, life: 1.0, lifeVar: 0, grow: 0,
                    duration: 1.0, fps: 24, sizeVar: 0, ramp: rampStr }, "z");
      const sm = simulate(state);
      return sm.counts[frame] ? sm.frames[frame][P_SIZE] : -1;
    };
    const zSmall = sizeAt("0,30,1,0.5,1,0.25|1,30,1,0.5,1,0.25", 3);
    const zBig = sizeAt("0,30,1,0.5,1,2|1,30,1,0.5,1,2", 3);
    ok(zBig > zSmall * 3, "the size channel actually scales particles",
       zSmall.toFixed(1) + "px vs " + zBig.toFixed(1) + "px");
    // grow must still apply on top rather than being replaced
    applyPreset({ shape: 0, count: 20, size: 20, speed: 0, life: 1.0, lifeVar: 0, grow: -0.5,
                  duration: 1.0, fps: 24, sizeVar: 0, ramp: "0,30,1,0.5,1,1|1,30,1,0.5,1,1" }, "g");
    const gs = simulate(state);
    ok(gs.frames[1][P_SIZE] > gs.frames[18][P_SIZE], "grow still shrinks over life alongside a ramp",
       gs.frames[1][P_SIZE].toFixed(1) + " → " + gs.frames[18][P_SIZE].toFixed(1));

    // ---------------------------------------------------------------- curl + attractor
    const spread = (patch) => {
      applyPreset(Object.assign({ shape: 0, count: 120, size: 8, speed: 40, drag: 0.2, life: 1.2,
                                  lifeVar: 0, duration: 1.0, fps: 24, turb: 0.8, turbScale: 2,
                                  frameSize: 4 }, patch), "m");
      const sm = simulate(state);
      const f = sm.nFrames - 2;
      let sx = 0, sy = 0, n = sm.counts[f];
      for (let i = 0; i < n; i++) { sx += sm.frames[f][i * P_STRIDE]; sy += sm.frames[f][i * P_STRIDE + 1]; }
      const cx = sx / n, cy = sy / n;
      let v = 0;
      for (let i = 0; i < n; i++) {
        v += Math.hypot(sm.frames[f][i * P_STRIDE] - cx, sm.frames[f][i * P_STRIDE + 1] - cy);
      }
      return { spread: v / n, cx, cy };
    };
    const plainTurb = spread({ turbCurl: 0 }), curlTurb = spread({ turbCurl: 1 });
    ok(Math.abs(plainTurb.spread - curlTurb.spread) > 0.5, "curl produces different motion to plain noise",
       plainTurb.spread.toFixed(1) + " vs " + curlTurb.spread.toFixed(1));
    ok(PARAM_BY_KEY.turbCurl[5] === 0, "curl defaults to off (no preset moves)");
    // an attractor at a corner must actually drag the cloud toward it
    const free = spread({ turb: 0, attract: 0 });
    const pulled = spread({ turb: 0, attract: 600, attractX: 0.9, attractY: 0.9, attractFalloff: 0 });
    ok(pulled.cx > free.cx + 4 && pulled.cy > free.cy + 4, "an attractor pulls the cloud toward its point",
       "(" + free.cx.toFixed(0) + "," + free.cy.toFixed(0) + ") → (" + pulled.cx.toFixed(0) + "," + pulled.cy.toFixed(0) + ")");
    const pushed = spread({ turb: 0, attract: -600, attractX: 0.9, attractY: 0.9, attractFalloff: 0 });
    ok(pushed.cx < free.cx - 2 && pushed.cy < free.cy - 2, "a negative value repels instead",
       "(" + pushed.cx.toFixed(0) + "," + pushed.cy.toFixed(0) + ")");
    ok(PARAM_BY_KEY.attract[5] === 0, "the attractor defaults to off");

    // ---------------------------------------------------------------- emissive mask
    applyPreset(PRESETS["Explosion"], "Explosion");
    state.glowThresh = 0.5; rerender();
    const em = emissiveFrames(rendered.canvases, state);
    ok(em.length === rendered.canvases.length, "one mask frame per source frame");
    const srcD = rendered.canvases[3].getContext("2d").getImageData(0, 0, rendered.w, rendered.h).data;
    const emD = em[3].getContext("2d").getImageData(0, 0, rendered.w, rendered.h).data;
    let alphaSame = true, brightKept = 0, dimZeroed = 0, dimLeaked = 0;
    for (let i = 0; i < srcD.length; i += 4) {
      if (srcD[i + 3] !== emD[i + 3]) { alphaSame = false; break; }
      const lum = (srcD[i] * 0.3 + srcD[i + 1] * 0.6 + srcD[i + 2] * 0.1) * (srcD[i + 3] / 255);
      if (lum >= 0.5 * 255) { if (emD[i] === srcD[i]) brightKept++; }
      else if (srcD[i + 3] > 8) { if (emD[i] === 0 && emD[i + 1] === 0 && emD[i + 2] === 0) dimZeroed++; else dimLeaked++; }
    }
    ok(alphaSame, "the mask keeps the source alpha (so the two sheets line up)");
    ok(brightKept > 50, "emitting pixels keep their colour", brightKept + " px");
    ok(dimZeroed > 50 && dimLeaked === 0, "non-emitting pixels go black, not transparent",
       dimZeroed + " zeroed, " + dimLeaked + " leaked");

    // ---------------------------------------------------------------- structure layers
    const layerLit = (patch, frac) => {
      applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24,
                                  frameSize: 4 }, patch), "layer");
      const r = renderFrames(state, { size: 128 });
      const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
      return lit(cv);
    };
    // growth: nothing at the start, more as it grows, and it must GROW rather than appear
    const gEarly = layerLit({ growth: 1, growLen: 0.4, growTime: 0.9 }, 0.1);
    const gLate = layerLit({ growth: 1, growLen: 0.4, growTime: 0.9 }, 0.9);
    ok(gLate > gEarly * 3, "growth accumulates over time", gEarly + " → " + gLate + " px");
    ok(layerLit({ growth: 0 }, 0.5) === 0, "growth at 0 draws nothing");
    // deterministic structure: same seed, same tree
    applyPreset({ shape: 0, count: 1, opacity: 0, growth: 1, duration: 0.8, seed: 42 }, "g1");
    const r1 = renderFrames(state, { size: 96 });
    const r2 = renderFrames(state, { size: 96 });
    ok(lit(r1.canvases[6]) === lit(r2.canvases[6]), "the same seed grows the same structure");
    state.seed = 7; const r3 = renderFrames(state, { size: 96 });
    ok(lit(r3.canvases[6]) !== lit(r1.canvases[6]), "a different seed grows a different one");
    // more branching = more structure
    const gPlain = layerLit({ growth: 1, growBranch: 0, growSeeds: 1, growTime: 0.5 }, 0.9);
    const gBushy = layerLit({ growth: 1, growBranch: 1, growSeeds: 1, growTime: 0.5 }, 0.9);
    ok(gBushy > gPlain, "branching adds structure", gPlain + " → " + gBushy + " px");

    // beam: extends over time, and its angle actually points somewhere
    ok(layerLit({ beam: 1, beamGrow: 0.9 }, 0.15) < layerLit({ beam: 1, beamGrow: 0.9 }, 0.95),
       "the beam extends over time");
    ok(layerLit({ beam: 0 }, 0.5) === 0, "beam at 0 draws nothing");
    const beamSide = (deg) => {
      applyPreset({ shape: 0, count: 1, opacity: 0, beam: 1, beamAngle: deg, beamLen: 0.9,
                    beamGrow: 0, duration: 0.5, frameSize: 4 }, "b");
      const r = renderFrames(state, { size: 128 });
      const d = r.canvases[2].getContext("2d").getImageData(0, 0, 128, 128).data;
      let sx = 0, n = 0;
      for (let p = 0; p < 128 * 128; p++) if (d[p * 4 + 3] > 20) { sx += p % 128; n++; }
      return n ? sx / n : 64;
    };
    ok(beamSide(90) > 70 && beamSide(270) < 58, "beam angle aims it (90° right, 270° left)",
       beamSide(90).toFixed(0) + " vs " + beamSide(270).toFixed(0));

    // ribbon: sweeps, and the trail bounds how much is on screen at once
    ok(layerLit({ ribbon: 1, ribbonSweep: 0.9 }, 0.1) < layerLit({ ribbon: 1, ribbonSweep: 0.9 }, 0.85),
       "the ribbon sweeps out over time");
    ok(layerLit({ ribbon: 0 }, 0.5) === 0, "ribbon at 0 draws nothing");
    ok(layerLit({ ribbon: 1, ribbonTrail: 1, ribbonSweep: 0.5 }, 0.9) >
       layerLit({ ribbon: 1, ribbonTrail: 0.1, ribbonSweep: 0.5 }, 0.9), "a longer trail shows more of the path");

    // Fit has to see the layers, or it scales to the particles and crops them
    applyPreset({ shape: 0, count: 1, opacity: 0, beam: 1, beamLen: 1.2, beamAngle: 90,
                  beamGrow: 0, duration: 0.5, frameSize: 4 }, "fitbeam");
    const bsim = simulate(state);
    ok(bsim.bbox.x1 - bsim.bbox.x0 > 100, "the bounding box includes the structure layers",
       Math.round(bsim.bbox.x1 - bsim.bbox.x0) + "px wide");

    // ---------------------------------------------------------------- outline & culling
    // The outline pass was rewritten from a (2r+1)² neighbourhood test to a separable dilation
    // (92ms -> 6ms). It must produce EXACTLY the same pixels — it changes how every outlined
    // preset looks, so "close enough" isn't good enough. Compare against the naive definition.
    const R = 2, W = 96;
    applyPreset({ shape: 0, count: 60, size: 20, speed: 160, life: 0.5, duration: 0.3,
                  frameSize: 3, outline: R, outlineTone: 0, glow: 0 }, "outline");
    const withOutline = renderFrames(state, { size: W }).canvases[2]
      .getContext("2d").getImageData(0, 0, W, W).data;
    state.outline = 0;
    const noOutline = renderFrames(state, { size: W }).canvases[2]
      .getContext("2d").getImageData(0, 0, W, W).data;
    const A = new Uint8Array(W * W);
    for (let i = 0; i < W * W; i++) A[i] = noOutline[i * 4 + 3] > 8 ? 1 : 0;
    let mismatches = 0, edgePx = 0;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let hit = false;
        for (let dy = -R; dy <= R && !hit; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
            if (A[ny * W + nx]) { hit = true; break; }
          }
        }
        const want = hit && !A[i];
        const got = !A[i] && withOutline[i * 4 + 3] === 255 && withOutline[i * 4] === 0;
        if (want) edgePx++;
        if (want !== got) mismatches++;
      }
    }
    ok(edgePx > 100 && mismatches === 0, "the fast outline matches the naive definition exactly",
       edgePx + " edge px, " + mismatches + " mismatches");

    // Off-screen culling must only skip particles that would draw nothing. A big particle whose
    // CENTRE is outside the frame but whose body overlaps it still has to be drawn.
    applyPreset({ shape: 0, count: 1, size: 60, speed: 0, life: 1, duration: 0.3, frameSize: 3,
                  originX: 1.02, originY: 0.5, fadeIn: 0, fadeOut: 0, coreWhite: 0.5 }, "edge");
    const edgeR = renderFrames(state, { size: 96 });
    ok(lit(edgeR.canvases[1]) > 0, "a particle straddling the frame edge is still drawn",
       lit(edgeR.canvases[1]) + " px");

    // ---------------------------------------------------------------- inert layer panels
    const panelOf = (g) => panels.querySelector('[data-group="' + g + '"]');
    applyPreset(PRESETS["Explosion"], "Explosion");      // flash + shockwave on, growth/beam off
    ok(panelOf("Growth").hidden && panelOf("Beam").hidden, "inert layer panels are hidden");
    ok(!panelOf("Flash").hidden, "an active layer keeps its panel", "flash=" + state.flash);
    ok(!panelOf("Emitter").hidden && !panelOf("Crunch").hidden,
       "always-relevant panels are never hidden");
    const chips = [...layerBar.querySelectorAll(".layer-chip")].map((b) => b.textContent);
    ok(chips.length > 4, "off layers become chips", chips.length + " chips");
    ok(chips.some((c) => c.indexOf("Growth") >= 0), "…including Growth", chips.join(" "));
    ok(!chips.some((c) => c.indexOf("Flash") >= 0), "…but not the active ones");
    // a chip must turn the layer on AT A VALUE THAT DOES SOMETHING, not just reveal zeroes
    const growChip = [...layerBar.querySelectorAll(".layer-chip")]
      .find((b) => b.textContent.indexOf("Growth") >= 0);
    growChip.click();
    ok(state.growth > 0, "the chip turns the layer on", "growth=" + state.growth);
    ok(!panelOf("Growth").hidden, "…and reveals its panel");
    ok(litAll(rendered) > 0, "…and the effect actually renders something");
    // Visibility must NOT re-evaluate on a slider drag: dragging Growth to 0 mid-edit would make
    // the panel vanish under the cursor with no way to drag it back up.
    state.growth = 0;
    inputs.growth.value = 0;
    inputs.growth.dispatchEvent(new Event("input", { bubbles: true }));
    ok(!panelOf("Growth").hidden, "a panel does not vanish mid-drag when its master hits 0");
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(panelOf("Growth").hidden, "…it hides on the next preset load instead");

    // ---------------------------------------------------------------- vortex / arc / dissolve
    const lay = (patch, frac) => {
      applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24,
                                  frameSize: 4 }, patch), "l");
      const r = renderFrames(state, { size: 128 });
      return lit(r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))]);
    };
    ok(lay({ vortex: 0 }, 0.5) === 0, "vortex at 0 draws nothing");
    ok(lay({ vortex: 1 }, 0.5) > 100, "the vortex draws", lay({ vortex: 1 }, 0.5) + " px");
    // squash makes it an ellipse — measure the drawn extent, not the parameter
    const extent = (patch) => {
      applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 0.5, frameSize: 4,
                                  vortex: 1, vortexSpin: 0, vortexScroll: 0 }, patch), "e");
      const r = renderFrames(state, { size: 128 });
      const d = r.canvases[3].getContext("2d").getImageData(0, 0, 128, 128).data;
      let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
      for (let p2 = 0; p2 < 128 * 128; p2++) {
        if (d[p2 * 4 + 3] <= 8) continue;
        const x = p2 % 128, y = (p2 / 128) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { w: x1 - x0, h: y1 - y0 };
    };
    const round0 = extent({ vortexSquash: 0 }), flat = extent({ vortexSquash: 1 });
    ok(Math.abs(round0.w - round0.h) < 6, "squash 0 is a circle", round0.w + "×" + round0.h);
    ok(flat.h < round0.h * 0.5, "squash 1 flattens it to a ground-plane ellipse",
       flat.w + "×" + flat.h);

    ok(lay({ arc: 0 }, 0.3) === 0, "arc at 0 draws nothing");
    ok(lay({ arc: 1, arcLife: 0.9 }, 0.3) > 20, "the arc draws");
    ok(lay({ arc: 1, arcLife: 0.3 }, 0.9) === 0, "the arc stops after arcLife");
    // it must re-randomise in STEPS, not per frame: same flicker window = same shape
    applyPreset({ shape: 0, count: 1, opacity: 0, arc: 1, arcRate: 2, arcJitter: 0.9,
                  arcLife: 2, duration: 1.0, fps: 24, frameSize: 4 }, "arcstep");
    const ar = renderFrames(state, { size: 128 });
    const sig = (cv) => { const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
      let s2 = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) s2 += i; return s2; };
    ok(sig(ar.canvases[1]) === sig(ar.canvases[2]),
       "the arc holds its shape within a flicker step (electricity, not noise)");
    ok(sig(ar.canvases[1]) !== sig(ar.canvases[14]), "…and changes on the next step");

    // dissolve erases over time, and materialise runs the other way
    applyPreset(PRESETS["Explosion"], "Explosion");
    const solidMid = lit(rendered.canvases[Math.floor(rendered.canvases.length * 0.55)]);
    state.dissolve = 1; state.dissolveTime = 1; state.dissolveEdge = 0; rerender();
    const dissolvedMid = lit(rendered.canvases[Math.floor(rendered.canvases.length * 0.55)]);
    ok(dissolvedMid < solidMid * 0.85, "dissolve erases the frame over time",
       solidMid + " → " + dissolvedMid + " px");
    state.dissolveDir = 1; rerender();
    const early = lit(rendered.canvases[1]);
    state.dissolveDir = 0; rerender();
    const earlySolid = lit(rendered.canvases[1]);
    ok(early < earlySolid, "materialise hides it early instead", earlySolid + " → " + early + " px");
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(state.dissolve === 0, "dissolve is off by default");

    // ---------------------------------------------------------------- Fit default
    // Fit ships on, so a fresh load and every preset arrive framed rather than arbitrarily small.
    // Assert the state and the button/hint agree with it — a default that the UI doesn't reflect
    // is worse than no default, because the button then lies about what you're looking at.
    ok(fitOn === true, "Fit is on by default");
    ok(fitBtn.classList.contains("on"), "…and the button shows it at boot, not just after a click");
    ok(!document.getElementById("fitHint").hidden,
       "…and the hint explaining that Origin X/Y are overridden is visible");
    fitBtn.click();
    ok(fitOn === false && !fitBtn.classList.contains("on") &&
       document.getElementById("fitHint").hidden, "turning Fit off clears the button and the hint");
    fitBtn.click();   // back to the default

    // ---------------------------------------------------------------- stage-hosted params
    // Frame size and FPS are built by the normal PARAMS generator into the stage controls rather
    // than a panel. The risk in moving a control is that it quietly loses the wiring the
    // generator gives it — lock tracking, macro sync, syncUI. Pin that it kept all of it.
    {
      applyPreset(PRESETS["Explosion"], "Explosion");
      const side = document.querySelector(".stage-side");
      for (const k of ["frameSize", "fps"]) {
        ok(!!inputs[k], k + " still has a registered input");
        ok(inputs[k] && side.contains(inputs[k]), k + " lives in the stage controls");
        ok(!panels.contains(inputs[k]), "…and no longer in a panel below the fold");
      }
      // syncUI must drive them like any other param.
      state.fps = 17; syncUI();
      ok(+inputs.fps.value === 17, "syncUI updates the relocated FPS control", inputs.fps.value);
      // Chunkiness drops the frame rate — the macro has to move the relocated slider too.
      const chunk = MACROS.find((m) => m.name === "Chunkiness");
      applyMacro(chunk, 1);
      ok(+inputs.fps.value === state.fps && state.fps < 24,
         "a macro still moves it", "fps " + state.fps);
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- frame W x H
    {
      applyPreset(PRESETS["Explosion"], "Explosion");
      // Neutral default: untouched patches are square at frameSize, exactly as before W/H existed.
      ok(state.frameW === 0 && state.frameH === 0, "frame W/H default to 0 (follow Frame size)");
      const d0 = frameDims(state);
      ok(d0.w === frameSizePx(state) && d0.h === d0.w, "…which means a square frame",
         d0.w + "x" + d0.h);

      const drawn = (patch) => {
        applyPreset(Object.assign({}, PRESETS["Explosion"], patch), "fr");
        const r = renderFrames(state);
        const cv = r.canvases[Math.floor(r.canvases.length * 0.35)];
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
          if (d[(y * cv.width + x) * 4 + 3] > 10) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        return { w: cv.width, h: cv.height, bw: x1 - x0, bh: y1 - y0 };
      };

      const sq = drawn({ frameSize: 4, frameW: 0, frameH: 0, scale: 0.5, shake: 0 });
      ok(sq.w === 128 && sq.h === 128, "square renders 128x128", sq.w + "x" + sq.h);

      const wide = drawn({ frameSize: 4, frameW: 320, frameH: 128, scale: 0.5, shake: 0 });
      ok(wide.w === 320 && wide.h === 128, "a wide frame renders at the asked size",
         wide.w + "x" + wide.h);
      // The whole point of referencing the SMALLER side: widening adds room, it doesn't inflate
      // or stretch the effect.
      ok(Math.abs(wide.bw - sq.bw) <= 2 && Math.abs(wide.bh - sq.bh) <= 2,
         "widening the frame leaves the effect the same size",
         sq.bw + "x" + sq.bh + " → " + wide.bw + "x" + wide.bh);

      const tall = drawn({ frameSize: 4, frameW: 128, frameH: 320, scale: 0.5, shake: 0 });
      ok(tall.w === 128 && tall.h === 320, "a tall frame renders at the asked size",
         tall.w + "x" + tall.h);
      ok(Math.abs(tall.bw - sq.bw) <= 2, "…and is equally unstretched", sq.bw + " → " + tall.bw);

      // Fit in a non-square frame must respect BOTH axes, not spill out the narrow one.
      applyPreset(Object.assign({}, PRESETS["Explosion"],
                                { frameW: 320, frameH: 96, shake: 0 }), "fit");
      const rf = renderFrames(state, { fit: true });
      const cvf = rf.canvases[Math.floor(rf.canvases.length * 0.4)];
      const df = cvf.getContext("2d").getImageData(0, 0, cvf.width, cvf.height).data;
      let top = 0, bottom = 0;
      for (let x = 0; x < cvf.width; x++) {
        if (df[x * 4 + 3] > 10) top++;
        if (df[((cvf.height - 1) * cvf.width + x) * 4 + 3] > 10) bottom++;
      }
      ok(top === 0 && bottom === 0, "Fit stays inside a short frame rather than spilling out",
         "edge pixels " + top + "/" + bottom);

      // The square shorthand every thumbnail/export path uses still works.
      const thumb = renderFrames(state, { size: 64, fit: true });
      ok(thumb.w === 64 && thumb.h === 64, "the { size } shorthand still gives a square");
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- quick-shape macros
    // Each macro is a to()/from() pair, and from() has to invert to() or the slider jumps away
    // from where you dropped it the moment anything calls updateMacros(). Nothing covered these
    // before, so this pins the round trip for all of them at once.
    {
      applyPreset(PRESETS["Explosion"], "Explosion");
      const missing = MACROS.filter((m) => !macroInputs[m.id]).map((m) => m.name);
      ok(missing.length === 0, "every macro has a slider", missing.join(", "));

      const bad = [];
      for (const m of MACROS) {
        for (const v of [0, 0.25, 0.75, 1]) {
          applyMacro(m, v);
          const got = clamp01(m.from());
          // Loose: several macros round to ints (pixelate 1..8 is especially coarse), so exact
          // equality would be testing the rounding rather than the inversion.
          if (Math.abs(got - v) > 0.06) bad.push(m.name + " " + v + "→" + got.toFixed(3));
        }
      }
      ok(bad.length === 0, "every macro's slider returns to where you put it", bad.join(", "));

      // Hue specifically: it drives the base hue and nothing else, so it can't fight Heat (which
      // owns saturation, brightness and the over-life drift).
      const hue = MACROS.find((m) => m.name === "Hue");
      ok(!!hue, "there is a Hue macro");
      const heat = MACROS.find((m) => m.name === "Heat");
      applyMacro(heat, 0.9);
      const satBefore = state.sat, brightBefore = state.bright, lifeBefore = state.hueLife;
      applyMacro(hue, 0.5);
      ok(state.sat === satBefore && state.bright === brightBefore && state.hueLife === lifeBefore,
         "Hue leaves Heat's controls alone");
      ok(state.hue > 100 && state.hue < 250, "…and moves the base hue", state.hue + "°");
      // Both ends must be visibly different hues — a full 0–360 range would land on red twice.
      applyMacro(hue, 0);
      const lo = state.hue;
      applyMacro(hue, 1);
      ok(Math.abs(state.hue - lo) > 180, "its ends are different colours, not both red",
         lo + "° → " + state.hue + "°");
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- shape picker coverage
    // The picker only builds a button for shapes listed in SHAPE_CATS, so a shape missing from it
    // is unreachable no matter how well it's implemented. `custom` and `image` sat like that —
    // the drawing grid and the PNG import both worked and were covered by this very suite, but
    // nothing in the UI could select them and no preset did either. Assert every shape has a way
    // in, so that can't happen again silently.
    {
      const noButton = [];
      for (let s = 0; s < SHAPES.length; s++) if (!shapeBtns[s]) noButton.push(s + " " + SHAPES[s]);
      ok(noButton.length === 0, "every shape has a button in the picker", noButton.join(", "));
      const listed = SHAPE_CATS.reduce((n, c) => n + c[1].length, 0);
      ok(listed === SHAPES.length, "SHAPE_CATS covers the whole SHAPES list",
         listed + " of " + SHAPES.length);
      // Clicking a picker button must actually select that shape.
      shapeBtns[19].click();
      ok(Math.round(state.shape) === 19, "clicking a shape button selects it", SHAPES[Math.round(state.shape)]);
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- preset coverage
    // Presets are how people actually discover the systems: load one and that layer's panel
    // appears WITH the effect on screen, which teaches far better than a tooltip. That only holds
    // if every system is reachable that way — a system no preset uses is discoverable only by
    // guessing at a chip in the "Add a layer" bar. Five had fallen through exactly that gap
    // (Trails, Bubble, Sub-emitter, Ground, Attractor), so this is the check that stops a new
    // engine shipping without one.
    {
      const uses = {};
      for (const L of LAYER_GROUPS) uses[L.g] = 0;
      for (const name of Object.keys(PRESETS)) {
        applyPreset(PRESETS[name], name);
        for (const L of LAYER_GROUPS) if (L.is()) uses[L.g]++;
      }
      const orphans = Object.keys(uses).filter((g) => uses[g] === 0);
      ok(orphans.length === 0, "every system is reachable through at least one preset",
         orphans.join(", "));
      const thin = Object.keys(uses).filter((g) => uses[g] === 1);
      // Not a failure — one preset is enough to be discoverable — but worth surfacing, because a
      // single showcase is one rename away from none.
      ok(true, "systems carried by a single preset: " + (thin.length || "none"), thin.join(", "));
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- remove a layer
    // removeLayer() is derived from PARAMS (reset the group to its defaults) rather than a
    // hand-written off() per group, so the thing worth pinning is that the derivation actually
    // holds for EVERY group — including any added later. If someone adds a layer whose is() reads
    // a param filed under a different group, this is what catches it.
    {
      const stuck = [], noButton = [], noParams = [];
      for (const L of LAYER_GROUPS) {
        const panel = panels.querySelector('[data-group="' + L.g + '"]');
        if (!panel || !panel.querySelector(".layer-remove")) noButton.push(L.g);
        if (!PARAMS.some((p) => p[7] === L.g)) noParams.push(L.g);
        L.on();                       // turn it on the way the ＋ chip does
        removeLayer(L);
        if (L.is()) stuck.push(L.g);  // …and it must actually be off again
      }
      ok(noParams.length === 0, "every layer group owns at least one param", noParams.join(", "));
      ok(noButton.length === 0, "every removable panel has a ✕", noButton.join(", "));
      ok(stuck.length === 0, "removing any of the " + LAYER_GROUPS.length +
         " layers turns it off", stuck.join(", "));

      // Removal is a full reset of the group, not just the master — add it back and you get a
      // clean layer rather than your old tuning.
      applyPreset(PRESETS["Explosion"], "Explosion");
      const sig = LAYER_GROUPS.find((L) => L.g === "Sigil");
      sig.on();
      state.sigilRings = 5; state.sigilRadius = 0.55;
      removeLayer(sig);
      const dRings = PARAMS.find((p) => p[0] === "sigilRings")[5];
      ok(state.sigilRings === dRings && state.sigil === 0,
         "removing a layer resets the whole group, not just its master",
         "rings " + state.sigilRings + " (default " + dRings + ")");
      ok(!sig.is() && panels.querySelector('[data-group="Sigil"]').hidden,
         "…and its panel goes away");

      // Undoable like any other edit.
      sig.on(); rerender(); commitHistory();
      ok(state.sigil > 0, "layer back on");
      removeLayer(sig);
      undoEdit();
      ok(state.sigil > 0, "removing a layer can be undone");

      // Essential panels must NOT be removable — there is no sensible "off" for Colour.
      for (const g of ["Color", "Motion", "Output"]) {
        const el = panels.querySelector('[data-group="' + g + '"]');
        if (el) ok(!el.querySelector(".layer-remove"), g + " has no remove button");
      }
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- hold sound
    // Matching a sound and then picking a preset used to throw away everything the sound gave
    // you. The hold is what makes the preset browser a "change type" control, so the assertions
    // are about the SPLIT: the sound keeps timing + intensity, the preset takes the look.
    {
      clearSoundHold();
      ok(Object.keys(heldSoundValues()).length === 0, "nothing is held before a match");

      const matched = { duration: 1.7, life: 1.1, count: 400, speed: 520, shake: 0.4,
                        shape: 0, hue: 20, glow: 0.6 };
      captureSoundHold(matched, "boom.wav");
      ok(soundHold.on, "matching a sound turns the hold on by itself");
      // The look is emphatically NOT held — otherwise "change type" could never change the type.
      const held = heldSoundValues();
      ok(!("shape" in held) && !("hue" in held) && !("glow" in held),
         "the look is not held — the preset still owns it", Object.keys(held).join(", "));

      applyPreset(PRESETS["Ice Blast"], "Ice Blast");
      ok(state.duration === 1.7 && state.life === 1.1,
         "loading a preset keeps the sound's length", state.duration + "s / life " + state.life);
      ok(state.count === 400 && state.speed === 520 && state.shake === 0.4,
         "…and its intensity", state.count + " @ " + state.speed);
      ok(state.shape === PRESETS["Ice Blast"].shape && state.hue === PRESETS["Ice Blast"].hue,
         "…while the preset still changes the look", "shape " + state.shape + ", hue " + state.hue);

      // Each group can be dropped on its own.
      soundHold.intensity = false;
      applyPreset(PRESETS["Ice Blast"], "Ice Blast");
      ok(state.duration === 1.7, "length alone can be held");
      ok(state.count === PRESETS["Ice Blast"].count,
         "…with the preset's own intensity back", "count " + state.count);
      soundHold.intensity = true;

      // Turning it off, and clearing the sound, both stop it completely.
      soundHold.on = false;
      applyPreset(PRESETS["Ice Blast"], "Ice Blast");
      ok(state.duration === PRESETS["Ice Blast"].duration, "turning the hold off releases it");
      soundHold.on = true;
      clearSoundHold();
      applyPreset(PRESETS["Ice Blast"], "Ice Blast");
      ok(state.duration === PRESETS["Ice Blast"].duration && !soundHold.on,
         "clearing the sound clears the hold — it can't outlive what it describes");

      // Undo must restore exactly; the hold is applied by applyPreset, not by history.
      captureSoundHold(matched, "boom.wav");
      applyPreset(PRESETS["Explosion"], "Explosion");
      const beforeUndo = state.duration;
      state.duration = 0.3; commitHistory();
      undoEdit();
      ok(state.duration === beforeUndo, "undo is not distorted by the hold",
         beforeUndo + " vs " + state.duration);
      clearSoundHold();
    }

    // ---------------------------------------------------------------- sigil / orbit / tumble
    // Each of the three must draw, must be off by default, and must actually do the thing that
    // justifies it being its own engine rather than a preset of an existing one.
    ok(state.sigil === 0 && state.orbit === 0 && state.tumble === 0,
       "the three new engines default to off");
    ok(lay({ sigil: 0 }, 0.5) === 0, "sigil at 0 draws nothing");
    ok(lay({ sigil: 1, sigilLife: 2 }, 0.4) > 100, "the sigil draws",
       lay({ sigil: 1, sigilLife: 2 }, 0.4) + " px");
    // Draw-on: it scales up rather than appearing at full size.
    {
      const box = (patch, frac) => {
        applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24,
                                    frameSize: 4 }, patch), "sg");
        const r = renderFrames(state, { size: 128 });
        const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
        const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        let x0 = 999, x1 = -1;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
        }
        return x1 < 0 ? 0 : x1 - x0;
      };
      const early = box({ sigil: 1, sigilGrow: 0.6, sigilLife: 2, sigilSpin: 0 }, 0.08);
      const late = box({ sigil: 1, sigilGrow: 0.6, sigilLife: 2, sigilSpin: 0 }, 0.5);
      ok(late > early * 1.3, "the sigil draws on rather than popping in at full size",
         early + "px → " + late + "px");
      // Squash turns the circle into a ground-plane ellipse: width holds, height collapses.
      const hgt = (patch) => {
        applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 1.0, frameSize: 4,
                                    sigil: 1, sigilGrow: 0, sigilSpin: 0, sigilLife: 2 }, patch), "sq");
        const r = renderFrames(state, { size: 128 });
        const d = r.canvases[3].getContext("2d").getImageData(0, 0, 128, 128).data;
        let y0 = 999, y1 = -1;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 8) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        return y1 < 0 ? 0 : y1 - y0;
      };
      ok(hgt({ sigilSquash: 0.9 }) < hgt({ sigilSquash: 0 }) * 0.5,
         "squash flattens the sigil to a ground plane",
         hgt({ sigilSquash: 0 }) + "px → " + hgt({ sigilSquash: 0.9 }) + "px");
    }

    ok(lay({ orbit: 0 }, 0.5) === 0, "orbit at 0 draws nothing");
    ok(lay({ orbit: 1 }, 0.5) > 20, "the orbit draws", lay({ orbit: 1 }, 0.5) + " px");
    // The bodies must MOVE along the path — a static ring would satisfy "it draws" just as well.
    {
      const at = (frac) => {
        applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                      orbit: 1, orbitCount: 3, orbitSpeed: 1, orbitTilt: 0, orbitSize: 12 }, "or");
        const r = renderFrames(state, { size: 128 });
        const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
        return cv.getContext("2d").getImageData(0, 0, 128, 128).data;
      };
      const a = at(0), b = at(0.3);
      let diff = 0;
      for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) diff++;
      ok(diff > 50, "the bodies travel around the path", diff + " px changed");
    }

    ok(lay({ tumble: 0 }, 0.5) === 0, "tumble at 0 draws nothing");
    ok(lay({ tumble: 1, tumbleStagger: 0 }, 0.3) > 50, "the tumble draws",
       lay({ tumble: 1, tumbleStagger: 0 }, 0.3) + " px");
    // Falling is the point: the cloud's centre of mass must descend over time.
    {
      const cy = (frac) => {
        applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.2, fps: 24, frameSize: 4,
                      tumble: 1, tumbleCount: 60, tumbleStagger: 0, tumbleFall: 1.2,
                      tumbleSpread: 0.15, tumbleDrift: 0 }, "tu");
        const r = renderFrames(state, { size: 128 });
        const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
        const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        let sum = 0, n = 0;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 8) { sum += y; n++; }
        }
        return n ? sum / n : -1;
      };
      const top = cy(0.1), bottom = cy(0.6);
      ok(top >= 0 && bottom > top + 5, "the pieces fall", top.toFixed(0) + " → " + bottom.toFixed(0) + " px");
    }

    // ---------------------------------------------------------------- web / rift / haze
    {
      ok(state.web === 0 && state.rift === 0 && state.haze === 0,
         "web, rift and haze default to off");

      // Web is RELATIONAL — it draws links between particles, so it needs particles that are
      // near each other. One particle can never produce a link, and that's the property that
      // separates it from every other layer.
      const webbed = (patch) => {
        applyPreset(Object.assign({ shape: 0, count: 40, opacity: 1, emitter: 3,
                                    emitRadius: 0.3, speed: 5, duration: 1.0, fps: 24,
                                    frameSize: 4, glow: 0, size: 2 }, patch), "w");
        const r = renderFrames(state, { size: 128 });
        return lit(r.canvases[Math.floor(r.canvases.length * 0.4)]);
      };
      const noWeb = webbed({ web: 0 });
      const withWeb = webbed({ web: 1, webReach: 0.3 });
      ok(withWeb > noWeb * 1.2, "the web adds links between particles",
         noWeb + " → " + withWeb + " px");
      const lonely = webbed({ web: 1, webReach: 0.3, count: 1 });
      const lonelyOff = webbed({ web: 0, count: 1 });
      ok(lonely === lonelyOff, "a single particle has nothing to link to", lonely + " px");
      // Reach controls how far a link can stretch, so a tiny reach should link almost nothing.
      ok(webbed({ web: 1, webReach: 0.02 }) < withWeb,
         "shrinking the reach removes links");

      // Rift opens, holds, then closes — a tear that just sat there would be a static shape.
      const riftW = (frac) => {
        applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                      rift: 1, riftOpen: 0.3, riftClose: 0.3, riftLife: 1, riftJagged: 0,
                      riftFlicker: 0, glow: 0 }, "rf");
        const r = renderFrames(state, { size: 128 });
        const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
        const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        let x0 = 999, x1 = -1;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
        }
        return x1 < 0 ? 0 : x1 - x0 + 1;
      };
      const early = riftW(0.05), mid = riftW(0.5), late = riftW(0.95);
      ok(mid > early && mid > late, "the rift opens, holds, then closes",
         early + " → " + mid + " → " + late + " px");
      ok(lay({ rift: 0 }, 0.5) === 0, "rift at 0 draws nothing");

      // Haze displaces pixels rather than recolouring them: the image changes, but it neither
      // brightens nor erases the sprite the way a colour pass would.
      const hazeShot = (patch) => {
        applyPreset(Object.assign({ shape: 5, count: 40, opacity: 0.8, emitter: 3,
                                    emitRadius: 0.2, speed: 40, size: 18, duration: 1.0,
                                    fps: 24, frameSize: 4, glow: 0 }, patch), "hz");
        const r = renderFrames(state, { size: 128 });
        const cv = r.canvases[Math.floor(r.canvases.length * 0.5)];
        const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
        return { data: d, n: n };
      };
      const flat = hazeShot({ haze: 0 });
      const weak = hazeShot({ haze: 1, hazeAmount: 0.2, hazeScale: 3 });
      const strong = hazeShot({ haze: 1, hazeAmount: 1.6, hazeScale: 3 });
      // Total alpha difference rather than a count over some threshold: the test sprite is soft
      // smoke, so displacing it moves a lot of pixels a little rather than a few pixels a lot,
      // and a fixed per-pixel threshold measures the sprite's softness more than the effect.
      const drift = (a, b) => {
        let s = 0;
        for (let i = 3; i < a.length; i += 4) s += Math.abs(a[i] - b[i]);
        return s;
      };
      const dWeak = drift(flat.data, weak.data), dStrong = drift(flat.data, strong.data);
      ok(dWeak > 0, "haze displaces the image", "Σ|Δalpha| " + dWeak);
      // The property worth pinning is that the knob drives it — a hard-coded warp would pass a
      // "something changed" check just as well.
      ok(dStrong > dWeak * 2, "…and Strength controls how far", dWeak + " → " + dStrong);
      const hazed = strong;
      // Displacement preserves roughly how much is drawn — if this collapsed, the pass would be
      // eating the sprite rather than warping it.
      ok(Math.abs(hazed.n - flat.n) < flat.n * 0.5,
         "…without destroying it", flat.n + " → " + hazed.n + " lit px");
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- shatter / lines / merge
    const lay2 = (patch, frac) => {
      applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24,
                                  frameSize: 4 }, patch), "l2");
      const r = renderFrames(state, { size: 128 });
      return r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
    };
    ok(lit(lay2({ shatter: 0 }, 0.5)) === 0, "shatter at 0 draws nothing");
    // it must HOLD, then break — the "it was whole a moment ago" reading is the whole point
    const spanOf = (cv) => {
      const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
      let x0 = 999, x1 = -1;
      for (let p2 = 0; p2 < 128 * 128; p2++) if (d[p2 * 4 + 3] > 8) { const x = p2 % 128; if (x < x0) x0 = x; if (x > x1) x1 = x; }
      return x1 - x0;
    };
    const held = spanOf(lay2({ shatter: 1, shatterHold: 0.5, shatterSpeed: 300, shatterFade: 0.2 }, 0.2));
    const flung = spanOf(lay2({ shatter: 1, shatterHold: 0.5, shatterSpeed: 300, shatterFade: 0.2 }, 0.75));
    ok(flung > held * 1.4, "shatter holds, then the pieces fly apart", held + "px → " + flung + "px");
    ok(lit(lay2({ shatter: 1, shatterPieces: 20 }, 0.1)) > lit(lay2({ shatter: 1, shatterPieces: 20 }, 0.95)),
       "the pieces fade out");

    ok(lit(lay2({ lines: 0 }, 0.3)) === 0, "impact lines at 0 draw nothing");
    ok(lit(lay2({ lines: 1, lineLife: 0.9 }, 0.3)) > 50, "impact lines draw");
    ok(lit(lay2({ lines: 1, lineLife: 0.25 }, 0.9)) === 0, "…and stop after lineLife");
    // the inner radius must leave an actual hole in the middle
    const holeCv = lay2({ lines: 1, lineInner: 0.3, lineOuter: 0.6, lineLife: 0.9, lineJitter: 0 }, 0.6);
    const hd = holeCv.getContext("2d").getImageData(0, 0, 128, 128).data;
    let centreLit = 0;
    for (let y = 58; y < 70; y++) for (let x = 58; x < 70; x++) if (hd[(y * 128 + x) * 4 + 3] > 8) centreLit++;
    ok(centreLit === 0, "the inner radius leaves a gap in the middle", centreLit + " px in the centre");

    // merge: overlapping soft particles must FUSE, not stay separate blobs
    const gooPatch = { shape: 0, count: 20, size: 34, speed: 60, drag: 0.6, life: 1.0,
                       duration: 0.8, blend: 1, opacity: 0.9, coreWhite: 0, frameSize: 4 };
    applyPreset(Object.assign({}, gooPatch), "goo0");
    const loose = renderFrames(state, { size: 128 }).canvases[3];
    applyPreset(Object.assign({}, gooPatch, { merge: 1, mergeThreshold: 0.4, mergeSmooth: 6 }), "goo1");
    const fused = renderFrames(state, { size: 128 }).canvases[3];
    // count fully-opaque pixels: merging hardens the body, soft overlapping circles never reach 255
    const solid = (cv) => { const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
      let n2 = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n2++; return n2; };
    ok(solid(fused) > solid(loose) * 3, "merge hardens overlapping particles into a solid body",
       solid(loose) + " → " + solid(fused) + " opaque px");
    // and the bridges between blobs must be coloured, not black
    const fd = fused.getContext("2d").getImageData(0, 0, 128, 128).data;
    let black = 0, coloured = 0;
    for (let i = 0; i < fd.length; i += 4) {
      if (fd[i + 3] !== 255) continue;
      if (fd[i] + fd[i + 1] + fd[i + 2] < 12) black++; else coloured++;
    }
    ok(coloured > 100 && black === 0, "merged bridges take a colour, not black",
       coloured + " coloured, " + black + " black");
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(state.merge === 0 && state.shatter === 0 && state.lines === 0, "all three default to off");

    // ---------------------------------------------------------------- path trails / ripples / glitch
    // A path trail must follow the CURVE the particle took. With a strong swirl, ghost-trails stay
    // near the particle (they're stamped along the instantaneous velocity) while a path trail
    // sweeps the whole arc — so it should cover far more of the frame.
    const swirly = { shape: 0, count: 14, size: 9, speed: 240, drag: 0.25, swirl: 420, life: 1.0,
                     lifeVar: 0, duration: 1.0, fps: 24, frameSize: 4, coreWhite: 0.6 };
    applyPreset(Object.assign({}, swirly), "plainpath");
    const bare = lit(renderFrames(state, { size: 128 }).canvases[14]);
    applyPreset(Object.assign({}, swirly, { pathTrail: 1, pathLen: 16, pathWidth: 3 }), "path");
    const trailed = lit(renderFrames(state, { size: 128 }).canvases[14]);
    ok(trailed > bare * 2, "a path trail draws the whole arc behind each particle",
       bare + " → " + trailed + " px");
    // it must not attach to the flash/shockwave layers, which have no motion history
    applyPreset({ shape: 0, count: 1, opacity: 0, flash: 1, flashLife: 0.5, wave: 1,
                  pathTrail: 1, pathLen: 10, duration: 0.6, fps: 24, frameSize: 4 }, "nolayer");
    const layerSim = simulate(state);
    let layerIds = 0;
    for (let i = 0; i < layerSim.counts[3]; i++) {
      if (layerSim.frames[3][i * P_STRIDE + P_ID] === -1) layerIds++;
    }
    ok(layerIds > 0, "the analytic layers are marked with id -1 so trails skip them", layerIds + " marked");
    // particle identity must be stable across frames — that's what the whole feature rests on
    applyPreset(Object.assign({}, swirly), "ids");
    const idSim = simulate(state);
    const idsAt = (f) => new Set(Array.from({ length: idSim.counts[f] },
      (_, i) => idSim.frames[f][i * P_STRIDE + P_ID]));
    const setA = idsAt(3), setB = idsAt(6);
    let shared = 0;
    setA.forEach((id) => { if (setB.has(id)) shared++; });
    ok(shared > setA.size * 0.8, "particle ids are stable between frames", shared + "/" + setA.size);

    ok(lit(lay2({ ripple: 0 }, 0.5)) === 0, "ripples at 0 draw nothing");
    ok(lit(lay2({ ripple: 1, rippleLife: 1 }, 0.5)) > 50, "ripples draw");
    // more rings = more ink, and the train is continuous rather than one-shot
    const r1c = lit(lay2({ ripple: 1, rippleCount: 1, rippleLife: 1 }, 0.6));
    const r4c = lit(lay2({ ripple: 1, rippleCount: 4, rippleLife: 1 }, 0.6));
    ok(r4c > r1c, "more rings draw more", r1c + " → " + r4c + " px");
    ok(lit(lay2({ ripple: 1, rippleLife: 0.3 }, 0.95)) > 0,
       "the ripple train keeps going (it cycles, unlike the one-shot shockwave)");

    // glitch changes the image, and holds its pattern within a step
    // A STATIC source: every frame is identical without the glitch, so any difference between
    // frames is the glitch pattern and nothing else.
    // Truly static needs more pinning than it looks: grow, hueLife and coreWhite all drift with
    // particle AGE by default, so a motionless particle still changes size and colour every frame.
    const staticPatch = { shape: 4, count: 40, size: 16, sizeVar: 0, speed: 0, life: 9, lifeVar: 0,
                          fadeIn: 0, fadeOut: 0, grow: 0, hueLife: 0, coreWhite: 0,
                          duration: 1.0, fps: 24, frameSize: 4, emitter: 6, emitRadius: 0.3 };
    const sigOf = (cv) => { const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
      let s2 = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) s2 += i; return s2; };
    applyPreset(Object.assign({}, staticPatch), "static");
    const stillFrames = renderFrames(state, { size: 128 });
    ok(sigOf(stillFrames.canvases[1]) === sigOf(stillFrames.canvases[6]),
       "the control source really is static");
    const preGlitch = sigOf(stillFrames.canvases[4]);
    applyPreset(Object.assign({}, staticPatch, { glitch: 1, glitchSlices: 8, glitchShift: 0.12,
                                                 glitchRGB: 0, glitchRate: 3 }), "glitchy");
    const glitched = renderFrames(state, { size: 128 });
    ok(sigOf(glitched.canvases[4]) !== preGlitch, "glitch displaces the image");
    // rate 3/s at 24fps = one pattern per 8 frames, so 1 and 2 share a step and 1 and 14 don't
    ok(sigOf(glitched.canvases[1]) === sigOf(glitched.canvases[2]),
       "the pattern holds within a step (a fault, not static)");
    ok(sigOf(glitched.canvases[1]) !== sigOf(glitched.canvases[14]), "…and changes on the next step");
    applyPreset(PRESETS["Explosion"], "Explosion");
    ok(state.glitch === 0 && state.ripple === 0 && state.pathTrail === 0, "all three default to off");

    // ---------------------------------------------------------------- drag to organise
    // Driven through the real pointer handlers. elementFromPoint is stubbed because headless
    // layout can't be relied on to put a category under a synthetic coordinate.
    userCats = []; ucSeq = 0;
    const cat = ucNewCategory(null);
    renderUserCats();
    const catEl = userCatsBox.querySelector(".uc-cat");
    const realEFP = document.elementFromPoint.bind(document);
    const pe = (type, x, y) => new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
    const presetBtn = [...document.querySelectorAll(".presetbar button")]
      .find((b2) => b2.textContent === "Explosion");
    ok(!!presetBtn && !!catEl, "a preset button and a category exist to drag between");

    // a short movement is a CLICK, not a drag — otherwise every preset click files the preset
    document.elementFromPoint = () => catEl;
    presetBtn.dispatchEvent(pe("pointerdown", 100, 100));
    dispatchEvent(pe("pointermove", 103, 102));
    dispatchEvent(pe("pointerup", 103, 102));
    ok(cat.items.length === 0, "a 3px wobble stays a click, not a drag");

    // past the threshold it becomes a drag, and dropping on a category files it
    presetBtn.dispatchEvent(pe("pointerdown", 100, 100));
    dispatchEvent(pe("pointermove", 140, 130));
    ok(document.querySelector(".uc-ghost") !== null, "a ghost follows the pointer once dragging");
    ok(document.body.classList.contains("uc-dragging"), "the new-category drop zone is revealed");
    ok(catEl.classList.contains("uc-hot"), "the category under the pointer highlights");
    dispatchEvent(pe("pointerup", 140, 130));
    ok(cat.items.length === 1 && cat.items[0].n === "Explosion", "dropping files the preset",
       JSON.stringify(cat.items));
    ok(document.querySelector(".uc-ghost") === null, "the ghost is cleaned up");
    ok(!document.body.classList.contains("uc-dragging"), "…and the drag class with it");

    // dropping on empty space creates a category, so this works with none set up yet
    userCats = []; renderUserCats();
    document.elementFromPoint = () => userCatsBox.querySelector(".uc-newdrop");
    presetBtn.dispatchEvent(pe("pointerdown", 100, 100));
    dispatchEvent(pe("pointermove", 200, 200));
    dispatchEvent(pe("pointerup", 200, 200));
    ok(userCats.length === 1 && userCats[0].items.length === 1,
       "dropping on empty space makes a new category with the item in it");

    // dropping on nothing is a no-op rather than an error
    const before2 = userCats.length;
    document.elementFromPoint = () => document.body;
    presetBtn.dispatchEvent(pe("pointerdown", 100, 100));
    dispatchEvent(pe("pointermove", 300, 300));
    dispatchEvent(pe("pointerup", 300, 300));
    ok(userCats.length === before2, "dropping on nothing changes nothing");
    document.elementFromPoint = realEFP;
    userCats = []; renderUserCats();
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

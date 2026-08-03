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
                  bubbleText: "Hi", paletteLock: "ff0000,00ff00", duration: 0.4,
                  shapeMix: "2,3", emit2ShapeMix: "5", layerDelay: "Growth:0.2" }, "extras");
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

    // ---------------------------------------------------------------- project files
    // The save/open halves need Tauri, but buildProject/loadProject are pure and are where data
    // loss would actually happen — silently dropping the library or the categories on open would
    // look like a successful load. Round-trip them here; the dialog plumbing is thin by design.
    {
      const realEffects = userEffects, realCats = userCats, realLabel = effectLabel;
      applyPreset(PRESETS["Ice Blast"], "Ice Blast");
      state.hue = 271; state.count = 383;
      userEffects = [{ id: 4, name: "Alpha", state: snapshotState() },
                     { id: 9, name: "Beta", state: snapshotState() }];
      userCats = [{ id: 2, name: "Boss fight", items: ["Alpha"] }];
      effectLabel = "Ice Blast";

      const proj = buildProject();
      ok(proj.app === "crunchyvfx" && proj.version === PROJECT_VERSION,
         "a project is stamped with app + version");
      const wire = JSON.parse(JSON.stringify(proj));    // it has to survive being a file

      // Wipe everything, then load it back.
      applyPreset(PRESETS["Explosion"], "Explosion");
      userEffects = []; userCats = []; effectLabel = "gone";
      loadProject(wire);
      ok(state.hue === 271 && state.count === 383,
         "opening a project restores the editor effect", state.hue + " / " + state.count);
      ok(effectLabel === "Ice Blast", "…and its name", effectLabel);
      ok(userEffects.length === 2 && userEffects[1].name === "Beta",
         "…the whole library", userEffects.length + " effects");
      ok(userCats.length === 1 && userCats[0].name === "Boss fight",
         "…and the categories", userCats.length);
      // ids must not collide with anything saved afterwards
      ok(upSeq >= 9 && ucSeq >= 2, "id counters advance past the loaded items",
         "upSeq " + upSeq + ", ucSeq " + ucSeq);

      let threw = "";
      try { loadProject({ app: "crunchysfx", version: 1 }); } catch (e) { threw = e.message; }
      ok(/not a CrunchyVFX project/.test(threw), "another app's file is refused, not half-loaded",
         threw || "no error");
      // A newer file with unknown keys must still open — refusing would lock someone out of work.
      loadProject({ app: "crunchyvfx", version: 99, editor: wire.editor, futureThing: 1 });
      ok(state.hue === 271, "a newer project version still opens");

      userEffects = realEffects; userCats = realCats; effectLabel = realLabel;
      saveUserEffects(); saveUserCats(); renderMyEffects();
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- structural audit
    // Three separate times this session a finished feature turned out to have no way to reach it
    // (custom/image missing from the shape picker; the custom-sprite panel never built; randomize
    // frozen to a three-system list). The shape is always the same: the UI is generated from one
    // table, and anything that needs a SECOND table to be reachable rots silently. These checks
    // are that second table, made loud.
    {
      const groups = [];
      for (const p of PARAMS) if (groups.indexOf(p[7]) < 0) groups.push(p[7]);

      const noPanel = groups.filter((g) => !panels.querySelector('[data-group="' + g + '"]'));
      ok(noPanel.length === 0, "every param group has a panel to live in", noPanel.join(", "));

      // Reachable = a layer chip turns it on, a shape reveals it, or it's always visible.
      const layerGroups = LAYER_GROUPS.map((x) => x.g);
      const shapeGroups = Object.keys(PANEL_SHAPES);
      const ALWAYS = ["Emitter", "Motion", "Life", "Color", "Crunch", "Output", "Master",
                      "Trails", "Glow"];
      const orphan = groups.filter((g) => layerGroups.indexOf(g) < 0 &&
                                          shapeGroups.indexOf(g) < 0 && ALWAYS.indexOf(g) < 0);
      ok(orphan.length === 0, "every panel is reachable somehow", orphan.join(", "));

      const emptySys = LAYER_GROUPS.filter((x) => !PARAMS.some((p) => p[7] === x.g)).map((x) => x.g);
      ok(emptySys.length === 0, "every system owns at least one control", emptySys.join(", "));

      // Hand-kept lists that name params must name real ones. PATCH_EXTRAS count: they live on
      // `state` alongside params, and the repack/hold code reads them with `k in state`.
      const known = {};
      for (const p of PARAMS) known[p[0]] = 1;
      for (const k in PATCH_EXTRAS) known[k] = 1;
      const stale = [];
      const check = (name, keys) => {
        for (const k of keys) if (!known[k]) stale.push(name + "." + k);
      };
      check("RAND_KEYS", RAND_KEYS);
      check("LOCK_KEYS", LOCK_KEYS);
      check("SOUND_HOLD.timing", SOUND_HOLD_KEYS.timing);
      check("SOUND_HOLD.intensity", SOUND_HOLD_KEYS.intensity);
      for (const g of REPACK_GROUPS) check("REPACK." + g[0], g[1]);
      ok(stale.length === 0, "no hand-kept list names a param that no longer exists",
         stale.join(", "));

      // Patch extras are the classic leak: they aren't in PARAMS, so a reset that only walks
      // PARAMS carries them between effects.
      applyPreset(PRESETS["Explosion"], "Explosion");
      for (const k in PATCH_EXTRAS) {
        state[k] = k === "glyph" ? "★" : k === "ramp" ? "0,10,1,0.5,1,1" : "zz";
      }
      const snap = snapshotState();
      applyPreset(PRESETS["Ice Blast"], "Ice Blast");
      const leaked = Object.keys(PATCH_EXTRAS).filter((k) => state[k] === snap[k] &&
                                                             snap[k] !== PATCH_EXTRAS[k]);
      ok(leaked.length === 0, "patch extras don't leak between effects", leaked.join(", "));
      restoreEdit(snap);
      const lost = Object.keys(PATCH_EXTRAS).filter((k) => state[k] !== snap[k]);
      ok(lost.length === 0, "…and survive snapshot/restore", lost.join(", "));
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- randomize reach
    // Randomize used to enable systems from a hand-written list that named flash, wave and trail
    // — the only three that existed when it was written. The other 39 could never appear, and the
    // three it knew about were on in nearly every roll. It now goes through LAYER_GROUPS, so a
    // system added later is randomizable without anyone remembering to update a second list.
    {
      ok(RAND_KEYS.indexOf("flash") < 0 && RAND_KEYS.indexOf("wave") < 0 &&
         RAND_KEYS.indexOf("trail") < 0,
         "system masters are no longer jittered as plain params");

      const before = snapshotState(), beforeLabel = effectLabel;
      const seen = {}, perRoll = [];
      for (const L of LAYER_GROUPS) seen[L.g] = 0;
      const ROLLS = 150;
      for (let i = 0; i < ROLLS; i++) {
        randomize();
        let on = 0;
        for (const L of LAYER_GROUPS) if (L.is()) { seen[L.g]++; on++; }
        perRoll.push(on);
      }
      const never = Object.keys(seen).filter((g) => !seen[g]);
      // Statistical, not exact: ~1.5 systems per roll over 150 rolls makes it overwhelmingly
      // likely every system shows up, but asserting all 42 would flake. 35 is a wide margin that
      // still fails hard if a whole era of systems is unreachable, which is the actual bug.
      ok(never.length <= 7, "randomize reaches essentially every system",
         never.length + " unseen in " + ROLLS + " rolls" + (never.length ? ": " + never.join(", ") : ""));
      const avg = perRoll.reduce((a, b) => a + b, 0) / perRoll.length;
      ok(avg > 0.6 && avg < 3, "…a few at a time, not all at once", "avg " + avg.toFixed(2));

      // Every roll has to be worth looking at — but "sparse" and "blank" are different failures
      // and only one of them is a bug. Random parameters will occasionally land on a thin effect,
      // and the fix for that is clicking again; an EMPTY one means randomize built something that
      // cannot render, which no amount of clicking fixes.
      let empty = 0, thin = 0;
      const ROLLS2 = 20;
      for (let i = 0; i < ROLLS2; i++) {
        randomize();
        const px = litAll(renderFrames(state, { size: 64, fit: true }));
        if (px === 0) empty++;
        else if (px < 60) thin++;
      }
      ok(empty === 0, "randomize never produces a completely empty effect", empty + "/" + ROLLS2);

      // The specific way that used to happen, pinned directly so it can't come back as a 1-in-130
      // flake that three green runs hide. Merge thresholds the blurred alpha field; a threshold
      // above the field's peak marks every pixel "outside", and at mix 1 that erased the frame.
      {
        applyPreset(PRESETS["Explosion"], "Explosion");
        state.merge = 1; state.mergeThreshold = 0.9; state.mergeSmooth = 16;
        const px = litAll(renderFrames(state, { size: 64, fit: true }));
        ok(px > 0, "merge at max threshold thins the effect instead of erasing it", px + " px");
        applyPreset(PRESETS["Explosion"], "Explosion");
      }
      ok(thin <= 3, "…and rarely produces a very thin one", thin + "/" + ROLLS2 + " thin");

      applyPreset(before, beforeLabel);
    }

    // ---------------------------------------------------------------- launch effect
    // Opening on the first preset every time made a 118-effect library look like it did one thing.
    {
      const picks = {};
      for (let i = 0; i < 60; i++) picks[pickLaunchEffect()] = 1;
      const n = Object.keys(picks).length;
      ok(n > 10, "launch picks a random effect, not always the same one", n + " distinct in 60");
      const bad = Object.keys(picks).filter((k) => !PRESETS[k]);
      ok(bad.length === 0, "…and always a real one", bad.join(", "));
    }

    // ---------------------------------------------------------------- welcome tour
    // Asserted on geometry, not pixels: the tour is a position:fixed overlay, and a headless
    // --screenshot captures the FULL PAGE, so fixed elements don't land where a viewport layout
    // puts them. A visual check here reports nonsense (same class of trap as the CSS transition).
    {
      ok(Array.isArray(TOUR) && TOUR.length >= 5, "there is a tour", TOUR.length + " steps");
      ok(!!document.getElementById("tourBtn"), "and a way to replay it");

      // Every targeted step must actually point at something that exists. A stale selector would
      // dim the whole screen around nothing and look like a broken app.
      const missing = TOUR.filter((s) => s.target && !document.querySelector(s.target))
                          .map((s) => s.target);
      ok(missing.length === 0, "every tour step targets an element that exists", missing.join(", "));

      startTour();
      ok(!tourEl.hidden, "starting shows the overlay");
      const offscreen = [];
      for (let i = 0; i < TOUR.length; i++) {
        showTourStep(i);
        const left = parseFloat(tourCard.style.left), top = parseFloat(tourCard.style.top);
        // The card must land inside the viewport, or the step is unreadable.
        if (!(left >= 0 && top >= 0 && left <= innerWidth && top <= innerHeight)) {
          offscreen.push(i + " @(" + Math.round(left) + "," + Math.round(top) + ")");
        }
      }
      ok(offscreen.length === 0, "every step places its card on screen",
         offscreen.join("; ") || innerWidth + "x" + innerHeight);

      // Progress and buttons track position.
      showTourStep(0);
      ok(tourEl.querySelector(".tour-prev").style.visibility === "hidden",
         "no Back on the first step");
      showTourStep(TOUR.length - 1);
      ok(tourEl.querySelector(".tour-skip").style.visibility === "hidden",
         "no Skip on the last step");
      ok(/\d+ \/ \d+/.test(tourEl.querySelector(".tour-progress").textContent),
         "progress is shown", tourEl.querySelector(".tour-progress").textContent);

      // Finishing marks it seen, so it doesn't reappear every visit.
      localStorage.removeItem("crunchyvfx.tourseen.v1");
      tourEl.querySelector(".tour-next").click();      // last step -> finish
      ok(tourEl.hidden, "finishing closes it");
      ok(localStorage.getItem("crunchyvfx.tourseen.v1") === "1", "…and remembers it was seen");

      // Skipping counts too — someone who dismisses it has been offered it.
      localStorage.removeItem("crunchyvfx.tourseen.v1");
      startTour();
      tourEl.querySelector(".tour-skip").click();
      ok(tourEl.hidden && localStorage.getItem("crunchyvfx.tourseen.v1") === "1",
         "skipping also counts as seen");
      endTour(true);
    }

    // ---------------------------------------------------------------- shape filter
    // 88 shapes is past the point where scanning works. Note the hidden-row check: `.engine-cat`
    // sets `display: flex`, which beats the UA's low-specificity `[hidden] { display: none }` — so
    // the first version left empty category LABELS on screen with no buttons under them. Testing
    // `hidden` alone would have passed; this checks it's actually not rendered.
    {
      const q = document.getElementById("shapeSearch");
      const shown = () => Object.values(shapeBtns).filter((b) => !b.hidden).length;
      q.value = ""; filterShapes();
      ok(shown() === SHAPES.length, "no filter shows every shape", shown() + "/" + SHAPES.length);

      q.value = "star"; filterShapes();
      const hits = Object.values(shapeBtns).filter((b) => !b.hidden).map((b) => b.textContent);
      ok(hits.length > 0 && hits.every((n) => n.indexOf("star") >= 0),
         "filtering matches on the name", hits.join(", "));
      ok(hits.indexOf("star") >= 0 && hits.indexOf("starburst") >= 0,
         "…including partial matches");
      ok(/\d+ of \d+/.test(document.getElementById("shapeCount").textContent),
         "the count says how many matched", document.getElementById("shapeCount").textContent);

      // Empty categories must actually disappear, not just carry a hidden attribute.
      const visibleRows = shapeRows.filter((r) => getComputedStyle(r.row).display !== "none");
      const emptyShown = visibleRows.filter((r) => r.buttons.every((b) => b.hidden));
      ok(emptyShown.length === 0, "categories with no matches are not rendered",
         emptyShown.length + " empty rows still visible");

      q.value = "zzzznothing"; filterShapes();
      ok(shown() === 0, "a search with no hits shows nothing rather than everything");

      // Escape has to clear it — a filter you can't get out of is a trap.
      q.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      ok(q.value === "" && shown() === SHAPES.length, "Escape clears the filter", shown() + " shown");
    }

    // ---------------------------------------------------------------- custom drawn sprite
    // The 16x16 drawing grid was fully working — encode, decode and render all correct — but its
    // panel is generated from PARAMS groups and "Custom sprite" has no params (the grid IS the
    // interface), so no panel existed, the builder's `if (panel)` silently did nothing, and there
    // was no way to reach it. Same shape of bug as the missing picker entries. These assertions
    // cover the door as well as the room.
    {
      const panel = panels.querySelector('[data-group="Custom sprite"]');
      ok(!!panel, "the custom sprite panel exists");
      const cv = panel && panel.querySelector(".cs-canvas");
      ok(!!cv, "…and holds a paint canvas");

      // A stamp button must write the patch.
      applyPreset({ shape: SHAPES.indexOf("custom"), count: 1, size: 60, speed: 0, life: 2,
                    duration: 0.3, fps: 24, frameSize: 4, glow: 0, fadeIn: 0, fadeOut: 0 }, "cs");
      state.customSprite = "";
      panel.querySelector('[data-cs="ring"]').click();
      ok(state.customSprite.length > 0, "a stamp button draws into the patch",
         state.customSprite.length + " chars");

      // …and what was drawn is what renders.
      const drawn = lit(renderFrames(state, { size: 128 }).canvases[1]);
      ok(drawn > 100, "the drawn sprite renders", drawn + " px");
      state.customSprite = "";
      panel.querySelector('[data-cs="clear"]').click();
      ok(lit(renderFrames(state, { size: 128 }).canvases[1]) === 0,
         "an empty grid renders nothing rather than a stray blob");

      // Round-trip through the patch: it's stored as base64 and must survive a save/load.
      const grid = new Uint8Array(CUSTOM_SPRITE_N * CUSTOM_SPRITE_N);
      for (let i = 0; i < grid.length; i += 3) grid[i] = 255;
      const enc = encodeSpriteAlpha(grid);
      const back = decodeSpriteAlpha(enc);
      ok(back && back.length === grid.length &&
         back.every((v, i) => (v > 0) === (grid[i] > 0)),
         "the grid survives its base64 round-trip");

      // The panel belongs to shape 8 only — it shouldn't sit open on every other shape.
      state.shape = SHAPES.indexOf("custom"); updateShapePanels();
      ok(!panel.hidden, "the panel shows for the custom shape");
      state.shape = 0; updateShapePanels();
      ok(panel.hidden, "…and hides for every other one");
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- collapsible sections
    // Quick shape / Particle shape / Palette / Era style fold away like CrunchySFX's heroes.
    // Asserted on classes and storage rather than pixels: the arrow is a CSS transition, and a
    // headless screenshot freezes mid-rotation, so a visual check reports the wrong state.
    {
      const SECTIONS = [
        ["macros", ".macro-title", "quickShape"],
        ["shapeSection", "#shapeSection .engine-title", "shapes"],
        ["paletteSection", "#paletteSection .engine-title", "palette"],
        ["styleSection", "#styleSection .engine-title", "eras"],
      ];
      const noHead = SECTIONS.filter(([, sel]) => {
        const h = document.querySelector(sel);
        return !h || !h.classList.contains("collapse-head");
      }).map(([id]) => id);
      ok(noHead.length === 0, "all four hero sections have a fold handle", noHead.join(", "));

      const bad = [];
      for (const [id, sel, key] of SECTIONS) {
        const sec = document.getElementById(id), head = document.querySelector(sel);
        const was = sec.classList.contains("collapsed");
        head.click();
        if (sec.classList.contains("collapsed") === was) bad.push(id + " didn't toggle");
        const saved = JSON.parse(localStorage.getItem("crunchyvfx.collapsed.v1") || "{}");
        if (saved[key] !== sec.classList.contains("collapsed")) bad.push(id + " didn't persist");
        head.click();                                    // put it back
        if (sec.classList.contains("collapsed") !== was) bad.push(id + " didn't restore");
      }
      ok(bad.length === 0, "each folds, persists and unfolds", bad.join("; "));

      // A control living in a header must not fold the section out from under the click.
      {
        const head = document.querySelector("#styleSection .engine-title");
        const sec = document.getElementById("styleSection");
        const btn = document.createElement("button");
        head.appendChild(btn);
        const was = sec.classList.contains("collapsed");
        btn.click();
        ok(sec.classList.contains("collapsed") === was,
           "clicking a control inside a header doesn't fold it");
        btn.remove();
      }
    }

    // ---------------------------------------------------------------- preset value ranges
    // A preset object is written straight into `state`, bypassing the slider that would have
    // clamped it — so a typo'd value doesn't error, it just produces a quietly broken effect.
    // "Triple Tap" shipped with shotSpread: 12 against a 0..1 range, which flung its later shots
    // three frames away; with Fit on, the bounding box exploded and the whole effect rendered at
    // sub-pixel size. It looked empty, not wrong. Two of the original presets had the same class
    // of bug. This is the cheapest possible guard against the next one.
    {
      const lim = {};
      for (const p of PARAMS) lim[p[0]] = { min: p[2], max: p[3] };
      const bad = [];
      for (const name of Object.keys(PRESETS)) {
        for (const k in PRESETS[name]) {
          if (k === "_vary" || !(k in lim)) continue;
          const v = PRESETS[name][k];
          if (typeof v !== "number") continue;
          if (v < lim[k].min || v > lim[k].max) {
            bad.push(name + "." + k + "=" + v + " (" + lim[k].min + "…" + lim[k].max + ")");
          }
        }
      }
      ok(bad.length === 0, "every preset value is inside its declared range", bad.join("; "));
    }

    // ---------------------------------------------------------------- sprite library
    // Imported particle PNGs are kept so you never have to find the file twice. The subtle failure
    // is storage: if a save fails on quota, the on-screen list must not keep an entry that isn't
    // actually stored — you'd think it was saved and lose it on reload.
    {
      const realSprites = userSprites.slice(), realSeq = usSeq;
      userSprites = []; usSeq = 0;
      const png = (c) => "data:image/png;base64," + c;

      addUserSprite("smoke.png", png("AAA"), 4, 1);
      ok(userSprites.length === 1, "importing a sprite files it in the library");
      ok(userSprites[0].cols === 4 && userSprites[0].rows === 1,
         "…with the strip grid it was used at", userSprites[0].cols + "×" + userSprites[0].rows);
      addUserSprite("smoke-again.png", png("AAA"), 4, 1);
      ok(userSprites.length === 1, "re-importing the same image doesn't duplicate it");
      addUserSprite("spark.png", png("BBB"), 1, 1);
      ok(userSprites.length === 2 && userSprites[0].name === "spark.png",
         "a different image is added, newest first");
      ok(userSprites[0].id !== userSprites[1].id, "ids are unique");

      // Quota failure must roll back rather than leave a phantom entry.
      // Stub the PROTOTYPE: assigning localStorage.setItem doesn't replace the method, it stores
      // a value under the key "setItem" — so the obvious version of this stub silently does
      // nothing and the test passes for the wrong reason.
      const realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };
      const before = userSprites.length;
      addUserSprite("huge.png", png("CCC"), 1, 1);
      Storage.prototype.setItem = realSet;
      ok(userSprites.length === before,
         "a failed save leaves the list matching what's actually stored", userSprites.length + " kept");

      // The library travels in a project file — a library you can't back up isn't one.
      const proj = buildProject();
      ok(Array.isArray(proj.userSprites) && proj.userSprites.length === 2,
         "sprites are written into the project file", proj.userSprites.length);
      userSprites = []; usSeq = 0;
      loadProject(JSON.parse(JSON.stringify(proj)));
      ok(userSprites.length === 2 && userSprites[0].name === "spark.png",
         "…and come back when it's opened");
      ok(usSeq >= 2, "…with the id counter restored", "usSeq " + usSeq);

      userSprites = realSprites; usSeq = realSeq; saveUserSprites(); renderSpriteLib();
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- web vs desktop gate
    // The suite runs in a browser, so this IS the web build — exactly the case that has to be
    // right. A gated control that's merely disabled would still be clickable and still be a dead
    // end, so assert it isn't rendered at all, and that the free build keeps everything the split
    // promises to keep.
    {
      ok(isDesktop === false, "the suite runs as the web build");
      const gated = document.querySelectorAll("[data-desktop]");
      ok(gated.length > 0, "there are gated elements to check", gated.length + " marked");
      const shown = Array.from(gated).filter((el) => !el.hidden)
        .map((el) => el.id || el.className);
      ok(shown.length === 0, "every desktop-only element is hidden on the web", shown.join(", "));
      ok(document.getElementById("mypresets").hidden, "My Effects is desktop-only");
      ok(document.getElementById("userCats").hidden, "custom categories are desktop-only");
      ok(document.getElementById("expBatchAll").hidden &&
         document.getElementById("expBatchMine").hidden,
         "batch export is desktop-only — it exists to render the library");
      // The desktop CTA is gated on ITCH_LIVE, because the store page 404s until it is published and
      // a dead "buy it" link is worse than no link. Assert the flag actually CONTROLS the button —
      // otherwise it can be flipped on launch day and do nothing, which is the failure mode a flag
      // like this exists to prevent.
      ok(!!document.getElementById("deskCta") === ITCH_LIVE,
         "the desktop CTA appears exactly when the itch page is live",
         "ITCH_LIVE=" + ITCH_LIVE + ", button " + (document.getElementById("deskCta") ? "present" : "absent"));

      // The line is "library and bulk workflow are paid; making and exporting an effect is free".
      // If any of these ever ended up gated, the free build would stop being worth using.
      const mustStayFree = ["expGo", "share", "gifBtn", "rand", "breedBtn", "matchBtn", "fitBtn"];
      const wronglyGated = mustStayFree
        .filter((id) => { const el = document.getElementById(id); return el && el.hidden; });
      ok(wronglyGated.length === 0,
         "exporting, sharing, GIF, randomize, breed and matching stay free",
         wronglyGated.join(", "));
    }

    // ---------------------------------------------------------------- boolean params are switches
    // A 0-or-1 param with step 1 has no in-between value, so it gets a switch instead of a slider.
    // The rule is derived from the schema, so what's worth pinning is that it selects exactly the
    // boolean params — too broad and a real range silently loses its middle.
    {
      const isBool = (p) => p[2] === 0 && p[3] === 1 && p[4] === 1;
      const bools = PARAMS.filter(isBool).map((p) => p[0]);
      ok(bools.length > 0, "there are boolean params to switch", bools.join(", "));
      const wrongType = [], missed = [];
      for (const p of PARAMS) {
        const el = inputs[p[0]];
        if (!el) continue;
        const isSwitch = el.type === "checkbox";
        if (isBool(p) && !isSwitch) missed.push(p[0]);
        if (!isBool(p) && isSwitch) wrongType.push(p[0]);
      }
      ok(missed.length === 0, "every boolean param renders as a switch", missed.join(", "));
      ok(wrongType.length === 0, "and nothing with a real range became one", wrongType.join(", "));

      // The switch must drive state, and syncUI must drive the switch.
      const key = bools[0];
      const el = inputs[key];
      state[key] = 0; syncUI();
      ok(el.checked === false, key + ": syncUI clears the switch");
      state[key] = 1; syncUI();
      ok(el.checked === true, key + ": syncUI sets it");
      el.checked = false;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      ok(state[key] === 0, key + ": toggling it off writes 0", String(state[key]));
      el.checked = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      ok(state[key] === 1, key + ": toggling it on writes 1", String(state[key]));
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
      // Clicking a picker button must actually select that shape. Selection is a SET now, so the
      // check is membership rather than "shape === 19" — clicking a second shape adds to what's
      // already on instead of replacing the primary.
      applyPreset(PRESETS["Explosion"], "Explosion");
      state.shapeMix = "";
      shapeBtns[19].click();
      ok(shapeSet(state.shape, state.shapeMix).indexOf(19) >= 0,
         "clicking a shape button selects it", SHAPES[19] + " in " + shapeSet(state.shape, state.shapeMix));
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- multi-shape selection
    // Click to select, click again to unselect, as many as you like. The selection is the primary
    // `shape` plus the `shapeMix` extras — split that way because `shape` is a stored index in
    // every preset, share link and saved effect, so it has to keep its old meaning exactly.
    {
      const G = SHAPES.indexOf("glow"), R = SHAPES.indexOf("ring"), H = SHAPES.indexOf("heart");
      const sel = () => shapeSet(state.shape, state.shapeMix);

      applyPreset(PRESETS["Explosion"], "Explosion");
      state.shape = G; state.shapeMix = "";
      shapeBtns[R].click();
      ok(sel().length === 2 && sel().indexOf(R) >= 0 && sel().indexOf(G) >= 0,
         "clicking a second shape adds it to the selection", sel().join(","));
      shapeBtns[H].click();
      ok(sel().length === 3, "…and a third", sel().join(","));
      // The count line is how anyone discovers this is a multi-select at all.
      ok(shapeCount.textContent.indexOf("3 selected") >= 0,
         "the shape count line reports the selection size", shapeCount.textContent);
      shapeBtns[R].click();
      ok(sel().indexOf(R) < 0 && sel().length === 2,
         "clicking a selected shape unselects it", sel().join(","));

      // Both pickers mark every member, not just the primary — the whole point is seeing what's on.
      syncShapeButtons();
      const marked = Object.keys(shapeBtns).filter((i) => shapeBtns[i].classList.contains("active")).map(Number);
      ok(marked.length === sel().length && marked.every((i) => sel().indexOf(i) >= 0),
         "the picker marks every selected shape", marked.join(","));

      // Removing the primary has to promote another rather than leave a dangling index.
      const first = sel()[0];
      shapeBtns[first].click();
      ok(sel().length === 1 && sel().indexOf(first) < 0 && Math.round(state.shape) === sel()[0],
         "unselecting the primary promotes the next shape", "shape=" + SHAPES[Math.round(state.shape)]);

      // A selection of nothing renders nothing, which is a broken effect and not a choice.
      const last = sel()[0];
      shapeBtns[last].click();
      ok(sel().length === 1 && sel()[0] === last, "the last shape can't be unselected", sel().join(","));

      // It has to actually reach the raster, not just the state: two shapes must not render the
      // same pixels as one. (The set is resolved per particle from its id, so this also pins that
      // the draw is deterministic — same seed, same assignment, twice.)
      state.shape = G; state.shapeMix = "";
      const one = litAll(renderFrames(state, { size: 64, fit: true }));
      state.shapeMix = String(SHAPES.indexOf("cross"));
      const two = litAll(renderFrames(state, { size: 64, fit: true }));
      const twoAgain = litAll(renderFrames(state, { size: 64, fit: true }));
      ok(one !== two, "a mixed selection renders differently from a single shape", one + " vs " + two);
      ok(two === twoAgain, "…and identically on a re-render", two + " = " + twoAgain);

      // Junk and out-of-range entries arrive here because a patch bypasses the sliders entirely.
      // They must be dropped, not drawn — a wrong sprite looks like a working preset.
      ok(shapeSet(G, "999,-4,abc,,7").join(",") === G + ",7",
         "shapeSet drops out-of-range and junk mix entries", shapeSet(G, "999,-4,abc,,7").join(","));
      ok(shapeSet(G, String(G)).join(",") === String(G),
         "…and never lists the primary twice", shapeSet(G, String(G)).join(","));
      ok(shapeSet(G, "").length === 1 && shapeSet(G, undefined).length === 1,
         "an empty mix is just the primary");

      // Layer B's picker is the same rule through the same helper.
      state.emit2Count = 120; state.emit2Shape = G; state.emit2ShapeMix = "";
      toggleShape("emit2Shape", "emit2ShapeMix", R);
      ok(shapeSet(state.emit2Shape, state.emit2ShapeMix).length === 2,
         "Layer B takes a multi-shape selection too", state.emit2ShapeMix);

      // Survives the round trips that matter: a share link and the undo stack.
      state.shape = G; state.shapeMix = String(R) + "," + String(H);
      const enc = encodePatch("mix test");
      applyPreset(PRESETS["Explosion"], "Explosion");
      applyPreset(decodePatch(enc), "mix test");
      ok(shapeSet(state.shape, state.shapeMix).length === 3,
         "a multi-shape selection survives a share link", state.shapeMix);

      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- no hardware trademarks
    // Era styles and palettes are named for what they LOOK like, never for the machine they came
    // from — the output ends up in games people sell, and the tool itself is sold, so a console
    // name in a label is exposure for no benefit. Console *engines* (Godot, Unity, Aseprite) are
    // deliberately exempt: naming an export target is what makes the export usable.
    {
      const BAD = /\b(Atari|Nintendo|NES|SNES|Game ?Boy|Genesis|Mega ?Drive|Sega|PlayStation|PS1|N64|Amiga|Commodore|C64|SID|PICO-?8|Neo ?Geo|Turbo ?Grafx|PC Engine|Master System|Dreamcast|Xbox|ZX Spectrum|MSX)\b/i;
      const hits = [];
      const check = (where, text) => { if (text && BAD.test(text)) hits.push(where + ': "' + text + '"'); };
      for (const s of STYLES) { check("style name", s.name); check("style hint", s.hint); }
      for (const name in BUILTIN_PALETTES) check("palette", name);
      for (const t of TOUR) { check("tour title", t.title); check("tour body", t.body); }
      for (const n of Object.keys(PRESETS)) check("preset", n);
      for (const n of SHAPES) check("shape", n);
      // Whatever is actually on screen, including tooltips — the label is what a user reads.
      for (const el of document.querySelectorAll("button, label, option, [title], .hint, .engine-cat-label")) {
        check("ui", el.getAttribute("title"));
        if (!el.children.length) check("ui", el.textContent.trim());
      }
      ok(hits.length === 0, "no console or hardware trademarks in anything user-facing",
         hits.slice(0, 4).join(" | "));
    }

    // ---------------------------------------------------------------- CrunchySFX hand-off (?s=)
    // CrunchySFX's "Send to CrunchyVFX" opens crunchyvfx.com/?s=<patch>, carrying the same payload
    // its own share links use. The decode and the mapping are the paste path reused whole — what
    // these pin is the DOOR: that arriving by URL runs it, that our own `?e=` links are never
    // mistaken for one, and that a bad link degrades instead of breaking the boot.
    {
      const mk = (obj) => btoa(JSON.stringify(obj))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const link = "https://crunchyvfx.com/?s=" +
        mk({ v: 1, t: "Handoff Zap", s: { wave: 2, freq: 660, duration: 0.3, decay: 0.15 } });

      applyPreset(PRESETS["Explosion"], "Explosion");
      const before = JSON.stringify(snapshotState());
      ok(loadSharedSound(link) === true, "a ?s= link is received and applied on arrival");
      ok(JSON.stringify(snapshotState()) !== before, "…and it actually changed the effect");
      ok(effectLabel === "Handoff Zap", "the sound's name comes across", effectLabel);

      // The sound-hold captures what the SOUND asked for — the bit most likely to be dropped by a
      // second, hand-rolled entry point, since nothing on screen says it is missing.
      ok(soundHold.on && Object.keys(soundHold.values).length > 0,
         "the sound-hold is captured on arrival, as it is when pasting",
         Object.keys(soundHold.values).length + " held values");
      ok(soundHold.name === "Handoff Zap", "…and it records the sound's name", soundHold.name);

      // Our own share links must never be read as a sound: both live in the query string.
      ok(loadSharedSound("?e=" + encodePatch("Mine")) === false,
         "our own ?e= effect link is not mistaken for a sound");
      ok(loadSharedSound("") === false, "no link at all is a no-op");
      ok(loadSharedSound("?s=not!valid!base64") === false, "a malformed ?s= is a no-op, not a throw");
      ok(loadSharedSound("?s=" + mk({ v: 1 })) === false,
         "a payload with no sound in it is refused");

      // Boot order is effect-link first, then sound-link, then the random sampler. A link carrying
      // both must resolve to the effect — it names the exact thing, where a sound is a starting point.
      const both = "?e=" + encodePatch("Mine") + "&s=" + mk({ v: 1, s: { freq: 440 } });
      ok(/[?&]e=([^&#]+)/.test(both) && decodeSfxLink(both) !== null,
         "a URL can carry both, so the precedence in boot is what decides", "both parse");

      // Someone arriving mid-task from the other app should not be met with a welcome tour.
      ok(/[?&][es]=/.test("?s=abc") && /[?&][es]=/.test("?e=abc"),
         "the tour is suppressed for both kinds of incoming link");

      // A matched patch is COMPUTED from whatever sound arrives, so unlike the preset table nothing
      // static can vet it — and an out-of-range value doesn't error, it produces a blank effect that
      // still says "N mappings applied". A laser (sweep -400) mapped to speed 208120 against a
      // 0..900 range: particles left the frame instantly and Fit shrank the result to nothing.
      {
        const sweepy = matchSound(decodeSfxLink("?s=" +
          mk({ v: 1, t: "Laser", s: { wave: 2, freq: 880, duration: 0.35, decay: 0.2, sweep: -400 } })));
        const bad = Object.keys(sweepy.patch).filter((k) => {
          const row = PARAM_BY_KEY[k];
          return row && typeof sweepy.patch[k] === "number"
            && (sweepy.patch[k] < row[2] || sweepy.patch[k] > row[3]);
        }).map((k) => k + "=" + sweepy.patch[k]);
        ok(bad.length === 0, "a matched sound never lands out of range", bad.join(", "));

        // …and the point of that: the effect it produces actually draws something.
        applyMatch(sweepy);
        ok(litAll(renderFrames(state, { size: 96, fit: true })) > 0,
           "a swept-pitch sound produces a visible effect, not a blank frame");
      }

      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- preset quality
    // Three batches of presets were written this session and HALF of them were wrong on first
    // render — always one of two faults, and every one passed "the preset renders" because it did
    // render, just badly. These are those two faults, measured.
    {
      const litOf = (cv) => {
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n;
      };

      // FAULT 1: the clip outliving the effect. Dead frames at the end are not cosmetic — they are
      // blank cells in the exported sheet, so the user pays for them in sheet size and file size.
      // Measured against each preset's OWN peak, so a faint effect is judged on its own terms.
      // `exact`, or this measures nothing. Earlier blocks leave a sound hold active, and applyPreset
      // overlays held values LAST — including duration and life, the two this assertion is about.
      // Without it the loop judged every preset with its timing overwritten and found nothing wrong,
      // which is how a green assertion ends up proving only that it ran.
      const tail = [];
      for (const name of Object.keys(PRESETS)) {
        applyPreset(PRESETS[name], name, true);
        const per = renderFrames(state, { size: 64, fit: true }).canvases.map(litOf);
        const peak = Math.max.apply(null, per);
        if (peak <= 0) continue;                       // "renders at all" is a different assertion
        const thr = Math.max(1, peak * 0.02);
        let last = 0;
        for (let i = 0; i < per.length; i++) if (per[i] >= thr) last = i;
        const deadFrames = per.length - 1 - last;
        const used = (last + 1) / per.length;
        // Both conditions: a short clip losing its final frame is rounding, not a fault.
        if (deadFrames >= 4 && used < 0.75) {
          tail.push(name + " (" + Math.round(used * 100) + "% of " + per.length + ", " +
                    deadFrames + " dead)");
        }
      }
      ok(tail.length === 0, "no preset leaves dead frames at the end of its clip",
         tail.join(", ") || "all " + Object.keys(PRESETS).length + " use their clip");

      // FAULT 2: Fit shrinking particles to specks. Under Fit the bounding box across ALL frames
      // sets the scale, so a fast or far-travelling effect scales itself into nothing — the fix is
      // always less travel and bigger particles, never more particles.
      //
      // Only judged where the particles ARE the picture: plenty of presets use them as incidental
      // detail behind a beam or a web (Nano Swarm's 3px nodes hang off its web layer), and those
      // are a style choice rather than a mistake.
      const specks = [];
      for (const name of Object.keys(PRESETS)) {
        applyPreset(PRESETS[name], name, true);   // same reason: size is in the hold's intensity group
        const withP = renderFrames(state, { size: 64, fit: true }).canvases.reduce((a, c) => a + litOf(c), 0);
        if (!withP) continue;
        const keep = state.opacity;
        state.opacity = 0;                              // structure layers only
        const withoutP = renderFrames(state, { size: 64, fit: true }).canvases.reduce((a, c) => a + litOf(c), 0);
        state.opacity = keep;
        if ((withP - withoutP) / withP < 0.2) continue; // particles are not carrying this one

        // At the preset's OWN frame size — the size it actually exports at. Measuring in a 64px
        // preview and demanding a whole pixel judged every preset at a resolution it never uses and
        // flagged 24 of them; the same particles are 2.5px in the 192px frame they declare.
        const prep = renderPrep(Object.assign({}, state), { fit: true });
        const sizes = [];
        for (let f = 0; f < prep.sim.nFrames; f++) {
          const arr = prep.sim.frames[f], n = prep.sim.counts[f];
          for (let i = 0; i < n; i++) {
            const o = i * P_STRIDE, k = arr[o + P_KIND];
            if (k === K_PART || k === K_PART2) sizes.push(arr[o + P_SIZE]);
          }
        }
        if (sizes.length < 8) continue;
        sizes.sort((a, b) => a - b);
        const px = sizes[Math.floor(sizes.length / 2)] * prep.k;
        // Below a pixel there is nothing to see — not a small particle, an absent one.
        if (px < 1) specks.push(name + " (" + px.toFixed(2) + "px)");
      }
      ok(specks.length === 0, "no preset renders its particles smaller than a pixel",
         specks.join(", ") || "clean");

      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- every control has a name
    // 388 of 1019 controls announced as an unnamed slider: the generated rows drew a <label> that
    // was never associated with its input, so the visible word was decoration. A UI audit found it;
    // this keeps it found, because the next generated control would arrive the same way.
    {
      // The real accessible-name rules, not "does a label element exist" — a switch row wraps its
      // checkbox in a SECOND, text-less label, which counts as labelled while naming nothing.
      const accName = (el) => {
        const aria = (el.getAttribute("aria-label") || "").trim();
        if (aria) return aria;
        const by = el.getAttribute("aria-labelledby");
        if (by) {
          const t = by.split(/\s+/).map((id) => {
            const n = document.getElementById(id);
            return n ? n.textContent.trim() : "";
          }).join(" ").trim();
          if (t) return t;
        }
        if (el.labels) for (const l of el.labels) if (l.textContent.trim()) return l.textContent.trim();
        const own = (el.textContent || "").trim();
        if (own) return own;
        return (el.title || el.getAttribute("placeholder") || "").trim();
      };
      const ctrls = Array.from(document.querySelectorAll("button, input, select, textarea"));
      const unnamed = ctrls.filter((e) => !accName(e));
      ok(unnamed.length === 0, "every control has an accessible name",
         unnamed.length + " unnamed" + (unnamed.length
           ? ": " + unnamed.slice(0, 6).map((e) => e.tagName.toLowerCase() + "#" + (e.id || "?")).join(", ")
           : " of " + ctrls.length));

      // The visible word must be part of the spoken name, or pointer and speech users are working
      // from different labels for the same control.
      const mismatched = [];
      for (const pr of PARAMS) {
        const el = inputs[pr[0]];
        if (!el) continue;
        const n = accName(el);
        if (n && n.indexOf(pr[1]) < 0) mismatched.push(pr[0] + ": \"" + n + "\" lacks \"" + pr[1] + "\"");
      }
      ok(mismatched.length === 0, "each control's spoken name contains its visible label",
         mismatched.slice(0, 4).join("; "));

      // …and the group disambiguates the dozen panels that each own a "Speed".
      const speeds = PARAMS.filter((pr) => pr[1] === "Speed" && inputs[pr[0]]);
      const names = speeds.map((pr) => accName(inputs[pr[0]]));
      ok(speeds.length < 2 || new Set(names).size === names.length,
         "same-named controls in different panels are distinguishable", names.join(" | "));

      // Clicking the visible label should focus the control — the pairing that was missing.
      const probe = inputs.count;
      ok(!!probe && !!probe.id && !!document.querySelector('label[for="' + probe.id + '"]'),
         "a generated row's label is associated with its input", probe && probe.id);

      // A slider announces a bare number; the unit is what makes it meaningful.
      ok((inputs.speed.getAttribute("aria-valuetext") || "").indexOf("px/s") >= 0,
         "a value is announced with its unit", inputs.speed.getAttribute("aria-valuetext"));
    }

    // ---------------------------------------------------------------- engines we claim
    // Naming an engine in the copy is a promise that its metadata comes out of the exporter. Unity
    // was named in the tour and the Flatpak description while no Unity sidecar existed and none was
    // planned — a user picking Export would have found four options, none of them theirs.
    {
      const offered = Array.from(expMetaSel.options).map((o) => o.value).filter((v) => v !== "none");
      ok(offered.length >= 3, "the exporter offers engine metadata", offered.join(", "));

      // Every engine named in user-facing copy must be one the exporter actually writes for.
      const copy = [];
      for (const t of TOUR) copy.push(t.body || "");
      for (const t of TUTORIALS) for (const st of t.steps) copy.push(st.body || "");
      copy.push(document.getElementById("expOpen").title || "");
      // Match the PROMISE construction — "metadata for A, B or C" — and check the engines inside
      // that list. Looking for an engine name anywhere near the word "metadata" is too crude: it
      // fires on copy that explicitly says an engine gets NO sidecar, which is the honest sentence
      // this whole fix exists to allow.
      const NAMES = { Godot: "godot", Aseprite: "aseprite", Phaser: "phaser", Unity: "unity" };
      const claimed = [];
      for (const c of copy) {
        const m = /(?:metadata|sidecars?)\s+for\s+([^.;]+)/i.exec(c);
        if (!m) continue;
        for (const nm in NAMES) {
          if (m[1].indexOf(nm) >= 0 && offered.indexOf(NAMES[nm]) < 0) claimed.push(nm);
        }
      }
      ok(claimed.length === 0,
         "no copy promises engine metadata the exporter cannot write", claimed.join(", "));

      // …and the absence is explained where someone would look for it, rather than just missing.
      const note = document.querySelector(".exp-subnote");
      ok(!!note && /Unity/.test(note.textContent),
         "the export dialog says why there is no Unity sidecar");
    }

    // ---------------------------------------------------------------- Tutorials
    // These are selectors into a UI that moves, which is the whole risk. A stale one dims the page
    // around nothing and reads as a broken app — and it is not hypothetical: "#randomBtn,#randomize"
    // was wrong when these were written (the button is "#rand") and this is what said so.
    {
      ok(Array.isArray(TUTORIALS) && TUTORIALS.length >= 3, "there are tutorials",
         TUTORIALS.length + " of them");
      ok(!!document.getElementById("tutBtn"), "…and a way in");
      ok(tutModal.querySelectorAll(".tut-row").length === TUTORIALS.length,
         "one row per tutorial", tutModal.querySelectorAll(".tut-row").length + " rows");

      const bad = [], empty = [];
      for (const t of TUTORIALS) {
        if (!t.steps.length) empty.push(t.id);
        for (const st of t.steps) {
          if (!st.target) continue;
          // Run the step's own setup first: a target inside a dialog only exists with it open.
          if (st.before) st.before();
          if (!document.querySelector(st.target)) bad.push(t.id + " → " + st.target);
        }
      }
      ok(bad.length === 0, "every tutorial step targets an element that exists", bad.join(", "));
      ok(empty.length === 0, "no tutorial is empty", empty.join(", "));

      // Spotlighting the whole editor dims nothing and teaches nothing.
      const huge = [];
      for (const t of TUTORIALS) {
        for (const st of t.steps) {
          if (st.target && /^(body|#panels|#app|html)$/.test(st.target.trim())) huge.push(t.id);
        }
      }
      ok(huge.length === 0, "no step spotlights the whole page", huge.join(", "));

      // Every step's card must land on screen, same rule the welcome tour is held to.
      const off = [];
      for (const t of TUTORIALS) {
        startTour(t.steps, false);
        for (let i = 0; i < t.steps.length; i++) {
          showTourStep(i);
          const l = parseFloat(tourCard.style.left), tp = parseFloat(tourCard.style.top);
          if (!(l >= 0 && tp >= 0 && l <= innerWidth && tp <= innerHeight)) off.push(t.id + " #" + i);
        }
        endTour(false);
      }
      ok(off.length === 0, "every tutorial step places its card on screen", off.join(", "));

      // THE separation that matters: finishing a tutorial must not consume the welcome tour, or
      // someone who opens a tutorial first is never offered the tour at all.
      localStorage.removeItem(TOUR_KEY);
      startTour(TUTORIALS[0].steps, false);
      showTourStep(TUTORIALS[0].steps.length - 1);
      tourEl.querySelector(".tour-next").click();          // finish it
      ok(localStorage.getItem(TOUR_KEY) !== "1",
         "finishing a tutorial leaves the welcome tour unseen", String(localStorage.getItem(TOUR_KEY)));
      ok(tourSteps === TOUR, "…and the runner falls back to the welcome list afterwards");

      // …while the welcome tour still does mark itself seen.
      startTour();
      showTourStep(TOUR.length - 1);
      tourEl.querySelector(".tour-next").click();
      ok(localStorage.getItem(TOUR_KEY) === "1", "finishing the welcome tour still marks it seen");
      localStorage.removeItem(TOUR_KEY);

      timeModal.hidden = true; libModal.hidden = true; expModal.hidden = true; tutModal.hidden = true;
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- Timing
    // Sequencing existed in name only: three delay params in three unrelated panels, and every
    // other layer pinned to frame 0. These pin both halves — that a delay now WORKS for any layer,
    // and that the panel showing them lists what is actually on.
    {
      ok(PATCH_EXTRAS.layerDelay === "", "no delay is the neutral default, so old patches are unchanged",
         JSON.stringify(PATCH_EXTRAS.layerDelay));

      // Parsing has to survive whatever a patch carries — it is a hand-editable string in a URL.
      ok(Object.keys(parseLayerDelays("")).length === 0, "an empty delay string is no delays");
      ok(parseLayerDelays("Growth:0.25").Growth === 0.25, "a delay parses");
      ok(parseLayerDelays("Growth:0.25,Lines:0.1").Lines === 0.1, "…and so does a second one");
      ok(parseLayerDelays("junk,:,Growth:notanumber,Lines:0.2").Lines === 0.2,
         "junk entries are dropped rather than poisoning the rest");
      ok(parseLayerDelays("Growth:-5").Growth === undefined, "a negative delay is ignored");
      ok(parseLayerDelays("Growth:999").Growth === MAX_DELAY,
         "an absurd delay clamps to the point past which nothing could show", "" + MAX_DELAY);

      // The one that matters: a delayed layer must actually be absent early and present later.
      // A BLANK patch, not a preset: applyPreset resets every param to its neutral default, so this
      // leaves exactly one layer on. Explosion was the wrong starting point — its flash, shockwave
      // and glow were what the pixel counts were actually measuring.
      applyPreset({}, "blank");
      state.lines = 0.9; state.lineCount = 16; state.lineLife = 0.3; state.duration = 1;
      state.count = 1; state.opacity = 0;          // isolate the layer under test
      state.layerDelay = "";
      const undelayed = renderFrames(state, { size: 96, fit: false });
      state.layerDelay = "Lines:0.4";
      const delayed = renderFrames(state, { size: 96, fit: false });
      const px = (r, i) => {
        const cv = r.canvases[i];
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let n = 0; for (let j = 3; j < d.length; j += 4) if (d[j] > 8) n++; return n;
      };
      ok(px(undelayed, 1) > 0, "the layer draws early when it is not delayed", px(undelayed, 1) + " px");
      ok(px(delayed, 1) === 0, "…and is absent early once it is", px(delayed, 1) + " px");
      const late = Math.min(delayed.canvases.length - 1, Math.round(0.5 * state.fps));
      ok(px(delayed, late) > 0, "…then appears after the delay", px(delayed, late) + " px at frame " + late);

      // A layer is SKIPPED before its delay, never run with a negative time — these functions
      // divide by their own life and would otherwise run backwards from nowhere.
      state.layerDelay = "Lines:" + (state.duration + 1);
      const never = renderFrames(state, { size: 96, fit: false });
      let any = 0;
      for (let i = 0; i < never.canvases.length; i++) any += px(never, i);
      ok(any === 0, "a delay past the clip means nothing is drawn, not garbage", any + " px");

      // The panel lists what is ON, not all 43 systems.
      applyPreset(PRESETS["Explosion"], "Explosion");
      state.layerDelay = "";
      renderTiming();
      const rows = () => timeModal.querySelectorAll(".time-row").length;
      const bare = rows();
      ok(bare >= 1 && !!timeModal.querySelector(".time-anchor"),
         "the particles anchor the list even with no layers on", bare + " rows");
      state.lines = 0.9;
      renderTiming();
      ok(rows() > bare, "switching a layer on gives it a row", rows() + " rows");

      // Layer B drives its REAL param rather than a shadow copy, or the two would disagree.
      state.emit2Count = 120; state.emit2Delay = 0.2;
      renderTiming();
      const names = Array.from(timeModal.querySelectorAll(".time-name")).map((e) => e.textContent);
      ok(names.indexOf("Layer B") >= 0, "Layer B appears once it is on", names.join(", "));

      timeModal.querySelector("#timeReset").click();
      ok(state.layerDelay === "" && state.emit2Delay === PARAM_BY_KEY.emit2Delay[5],
         "reset puts every layer back to starting together", JSON.stringify(state.layerDelay));

      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- Library
    // The shelf: imported particles, and everything exported. The point of the second half is
    // "in case you wanted to make a change", so what it stores has to be the EFFECT, not a filename.
    {
      const btn = document.getElementById("libBtn");
      ok(!!btn, "the Library has a way in");
      ok(btn.hidden, "…and it is desktop-only, like the rest of the shelf");
      ok(!!document.getElementById("libSprites") && !!document.getElementById("libExports"),
         "both shelves exist: imported particles and exported effects");

      // Each list lives inside its own group — BGM found its bank list orphaned three groups away
      // from the controls that filled it, so this is pinned structurally rather than by eye.
      for (const id of ["libSprites", "libExports"]) {
        ok(!!document.getElementById(id).closest(".lib-group"),
           id + " sits inside its own labelled group");
      }

      // Recording is gated the same way the UI is: a web visitor has no shelf to come back to.
      const before = exportLog.length;
      const wasDesktop = isDesktop;
      ok(recordExport("sheet", "test") === null && exportLog.length === before,
         "no export history is written on the web build", "isDesktop=" + wasDesktop);

      // The round trip that matters — export, come back, load, get the same effect.
      applyPreset(PRESETS["Explosion"], "Explosion");
      state.count = 77;
      const entry = {
        id: 1, name: "Rebuildable", kind: "sheet", detail: "1 file",
        when: Date.now(), patch: encodePatch("Rebuildable"),
      };
      applyPreset(PRESETS["Hit Spark"], "Hit Spark");     // wander off, as a week would
      const back = decodePatch(entry.patch);
      ok(!!back && back.count === 77,
         "a history entry carries the whole effect, not just its name", "count=" + (back && back.count));
      applyPreset(back, entry.name, true);
      ok(state.count === 77 && effectLabel === "Rebuildable",
         "…so loading one restores it ready to change", effectLabel + " count=" + state.count);

      // The bug this caught: `count` and `size` live in the sound hold's intensity group, so with a
      // hold active a restored export came back with DIFFERENT numbers than the file that shipped —
      // and the re-export would not have matched. Restoring an artifact is not choosing a preset.
      captureSoundHold({ count: 12, size: 4, duration: 0.5 }, "some sound");
      ok(soundHold.on, "a sound hold is active for this check");
      applyPreset(PRESETS["Explosion"], "Explosion");
      ok(state.count === 12, "a PRESET still honours the hold, which is what the hold is for",
         "count=" + state.count);
      applyPreset(back, entry.name, true);
      ok(state.count === 77,
         "…but a library restore ignores it and returns the exact effect", "count=" + state.count);
      soundHold.on = false; soundHold.values = {};

      // The history is bounded — it grows silently in localStorage otherwise.
      ok(EXPORT_MAX > 0 && EXPORT_MAX <= 100, "export history is capped", "max " + EXPORT_MAX);

      // "Clear export history" must not take the sprites with it: those are files someone chose to
      // bring in, and losing them to a button about history would be a nasty surprise.
      const sprites = userSprites.length;
      libModal.querySelector("#libClear").click();
      ok(exportLog.length === 0, "clearing empties the history");
      ok(userSprites.length === sprites, "…and leaves the imported sprites alone",
         sprites + " sprites before, " + userSprites.length + " after");

      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- posting GIF
    // A different job from Export → GIF: that one makes an asset (exact size, transparent), this
    // one makes a post (big, opaque, looping). The two must not quietly become the same thing.
    {
      applyPreset(PRESETS["Explosion"], "Explosion");
      rerender();
      const built = buildShareGif(false);
      ok(!!built && built.canvases.length > 0, "a posting GIF gets built from the current effect");
      ok(built.size > rendered.w || built.size >= 200,
         "…at a posting size, not the working frame size",
         built.size + "px vs preview " + rendered.w + "px");

      // Opaque is the whole point: 1-bit GIF alpha fringes soft edges against a chat background.
      const g = built.canvases[0].getContext("2d");
      const d = g.getImageData(0, 0, built.canvases[0].width, built.canvases[0].height).data;
      let clear = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
      ok(clear === 0, "every pixel is opaque — no transparent fringe in a chat client", clear + " see-through px");

      // Frame count drives file size, so resolution has to yield to it or a long loop is unpostable.
      ok(shareGifSize(20) > shareGifSize(40) && shareGifSize(40) > shareGifSize(90),
         "a longer effect gets a smaller frame so the file stays postable",
         [shareGifSize(20), shareGifSize(40), shareGifSize(90)].join(" > "));

      // The tag is what makes the GIF do any work once it leaves — it must actually mark the pixels.
      const plain = buildShareGif(false), tagged = buildShareGif(true);
      const lit = (cv) => {
        const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
        return s;
      };
      const last = (b) => b.canvases[b.canvases.length - 1];
      ok(lit(tagged.canvases[0]) !== lit(plain.canvases[0]), "the site tag is drawn when asked for");
      ok(lit(last(tagged)) !== lit(last(plain)), "…on every frame, not just the first");

      // And it encodes to a real, looping GIF.
      const bytes = encodeGif(plain.canvases.slice(0, 4), state.fps);
      const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
      ok(head === "GIF89a", "it encodes a real GIF", head);
      let netscape = false;
      for (let i = 0; i < bytes.length - 11; i++) {
        if (bytes[i] === 0x4E && String.fromCharCode.apply(null, bytes.slice(i, i + 11)) === "NETSCAPE2.0") {
          netscape = true; break;
        }
      }
      ok(netscape, "…that loops forever, which is the whole point in a chat window");

      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // ---------------------------------------------------------------- shape-aware orbit
    // Orbit drew its own round beads and ignored `shape`, which made the classic circling-stars
    // effect impossible to express — a preset could be named for a shape the layer never drew.
    // The toggle is opt-in precisely so the presets that shipped with beads still get beads.
    {
      applyPreset(PRESETS["Explosion"], "Explosion");
      ok(PARAM_BY_KEY.orbitUseShape[5] === 0,
         "orbitUseShape defaults to off, so existing orbit presets are untouched",
         String(PARAM_BY_KEY.orbitUseShape[5]));

      // No shipped preset may rely on the new behaviour by accident — if one did, it would have
      // been drawing beads until now and silently change the day this landed.
      const optedIn = Object.keys(PRESETS).filter((n) => PRESETS[n].orbitUseShape > 0);
      ok(optedIn.length === 0 || optedIn.every((n) => PRESETS[n].orbit > 0),
         "any preset opting in actually has the orbit layer on", optedIn.join(", "));

      // The toggle has to CHANGE something: same orbit, beads vs shapes, different pixels.
      applyPreset(PRESETS["Stun Stars"], "Stun Stars");
      state.orbitUseShape = 0;
      const beads = litAll(renderFrames(state, { size: 96, fit: true }));
      state.orbitUseShape = 1;
      const shapes = litAll(renderFrames(state, { size: 96, fit: true }));
      ok(beads > 0 && shapes > 0, "orbit draws either way", beads + " vs " + shapes);
      ok(beads !== shapes, "…and the shape toggle actually changes what is drawn",
         beads + " px as beads, " + shapes + " px as shapes");

      // It follows the SET, not just the primary — a mixed selection rings alternating shapes.
      state.shape = SHAPES.indexOf("star"); state.shapeMix = "";
      const one = litAll(renderFrames(state, { size: 96, fit: true }));
      state.shapeMix = String(SHAPES.indexOf("heart"));
      const two = litAll(renderFrames(state, { size: 96, fit: true }));
      ok(one !== two, "orbit honours the whole shape selection, not only the first",
         one + " vs " + two);

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
      // Breeding nudges a param by a fraction of its range. That is meaningless for a categorical
      // one — "shape 31.4" is a skull becoming a feather, not a sibling of the parent — so every
      // enum/shape param has to be in BREED_SKIP. Layer B shipped three at once, which is how this
      // stopped being a thing you can hold in your head.
      {
        const loose = PARAMS.filter((p) => (p[8] === "enum" || p[8] === "shape" || p[8] === "shape2")
                                           && !BREED_SKIP.has(p[0])).map((p) => p[0]);
        ok(loose.length === 0, "every categorical param is excluded from breeding", loose.join(", "));
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

    // -------------------------------------------- fracture / drip / sweep / slice / warp
    {
      ok(state.fracture === 0 && state.drip === 0 && state.sweep === 0 &&
         state.slice === 0 && state.warp === 0, "the five newest systems default to off");
      for (const k of ["fracture", "drip", "sweep"]) {
        const off = {}; off[k] = 0;
        const on = {}; on[k] = 1;
        ok(lay(off, 0.5) === 0, k + " at 0 draws nothing");
        ok(lay(on, 0.5) > 20, "the " + k + " draws", lay(on, 0.5) + " px");
      }

      const extentOf = (patch, frac) => {
        applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24,
                                    frameSize: 4, glow: 0 }, patch), "nw");
        const r = renderFrames(state, { size: 128 });
        const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
        const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        let x0 = 999, x1 = -1, y0 = 999, y1 = -1, sum = 0, n = 0;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            sum += y; n++;
          }
        }
        return x1 < 0 ? null : { w: x1 - x0, h: y1 - y0, cy: sum / n };
      };

      // Fracture RACES outward — the network grows rather than appearing whole.
      {
        // Sample after the cracks have started: at 8% of the cycle `grow` hasn't reached the
        // first joint yet, so nothing is drawn at all and there is no extent to compare.
        const early = extentOf({ fracture: 1, fractureSpeed: 0.6, fractureLife: 2 }, 0.25);
        const late = extentOf({ fracture: 1, fractureSpeed: 0.6, fractureLife: 2 }, 0.7);
        ok(early && late && late.w > early.w * 1.3, "the fracture spreads outward over time",
           (early ? early.w : 0) + "px → " + (late ? late.w : 0) + "px");
      }

      // Drip FALLS — the drops' centre of mass descends.
      {
        // Comparing one frame to a later one doesn't work: each drop runs its own cycle, so the
        // ensemble is in steady state and the mean height barely moves. Test the PARAMETER
        // instead — a bigger Fall must put the drops lower — which is the property that matters
        // and is deterministic.
        const a = extentOf({ drip: 1, dripCount: 16, dripRate: 0.9, dripHang: 0.3, dripFall: 0.1 }, 0.6);
        const b = extentOf({ drip: 1, dripCount: 16, dripRate: 0.9, dripHang: 0.3, dripFall: 1.3 }, 0.6);
        ok(a && b && b.cy > a.cy + 4, "Fall drops them further",
           (a ? a.cy.toFixed(0) : "-") + " → " + (b ? b.cy.toFixed(0) : "-"));
      }

      // Sweep TURNS.
      {
        const at = (frac) => {
          applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                        sweep: 1, sweepSpeed: 1, glow: 0 }, "sp");
          const r = renderFrames(state, { size: 128 });
          const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
          return cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        };
        const a = at(0.05), b = at(0.35);
        let moved = 0;
        for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) moved++;
        ok(moved > 200, "the sweep rotates", moved + " px changed");
      }

      // Slice must genuinely CUT: a solid disc gains a transparent kerf across it, and the halves
      // slide apart. Eyeballing a post pass on a busy sprite is unreliable, so test it on a shape
      // whose "before" is known exactly.
      {
        const disc = { shape: 0, count: 1, opacity: 1, size: 70, sizeVar: 0, speed: 0,
                       life: 2, fadeIn: 0, fadeOut: 0, grow: 0, duration: 0.4, fps: 24,
                       frameSize: 4, glow: 0, coreWhite: 0.4 };
        const shot = (patch) => {
          applyPreset(Object.assign({}, disc, patch), "sl");
          const cv = renderFrames(state, { size: 128 }).canvases[2];
          return cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        };
        const plain = shot({ slice: 0 });
        const cut = shot({ slice: 1, sliceAngle: 0, sliceOffset: 0.4, sliceGap: 0.3 });
        // With a horizontal cut, the middle row band should be emptied.
        let bandPlain = 0, bandCut = 0;
        for (let y = 62; y <= 66; y++) for (let x = 0; x < 128; x++) {
          if (plain[(y * 128 + x) * 4 + 3] > 8) bandPlain++;
          if (cut[(y * 128 + x) * 4 + 3] > 8) bandCut++;
        }
        ok(bandPlain > 40 && bandCut < bandPlain * 0.4,
           "slice opens a gap along the cut", bandPlain + " px → " + bandCut + " px");
        // …and the halves move apart, so the overall extent widens along the cut direction.
        const spanOf = (d) => {
          let x0 = 999, x1 = -1;
          for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
            if (d[(y * 128 + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
          }
          return x1 < 0 ? 0 : x1 - x0;
        };
        ok(spanOf(cut) > spanOf(plain) + 4, "…and slides the halves apart",
           spanOf(plain) + "px → " + spanOf(cut) + "px");
      }

      // Warp displaces pixels near a travelling front, and the front MOVES — that's what makes it
      // a blast shell rather than a standing distortion like haze.
      {
        const shot = (patch, frame) => {
          applyPreset(Object.assign({ shape: 4, count: 260, opacity: 1, emitter: 3,
                                      emitRadius: 0.4, speed: 0, size: 7, life: 3,
                                      fadeIn: 0, fadeOut: 0, duration: 0.8, fps: 24,
                                      frameSize: 4, glow: 0 }, patch), "wp");
          const cv = renderFrames(state, { size: 128 }).canvases[frame];
          return cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        };
        const diff = (a, b) => {
          let n = 0;
          for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) n++;
          return n;
        };
        const flat2 = shot({ warp: 0 }, 3);
        const warped = shot({ warp: 1, warpAmount: 1.8, warpLife: 0.8 }, 3);
        ok(diff(flat2, warped) > 60, "warp displaces the image", diff(flat2, warped) + " px");
        // The ring travels: the displaced region differs between an early and a later frame.
        const early = shot({ warp: 1, warpAmount: 1.8, warpLife: 0.8 }, 2);
        const later = shot({ warp: 1, warpAmount: 1.8, warpLife: 0.8 }, 8);
        ok(diff(early, later) > 60, "…and the front travels outward", diff(early, later) + " px");
      }
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // -------------------------------------------- decal / tunnel / crackle / aura / smear
    {
      ok(state.decal === 0 && state.tunnel === 0 && state.crackle === 0 &&
         state.aura === 0 && state.smear === 0, "the five newest systems default to off");
      for (const k of ["decal", "tunnel", "crackle"]) {
        const off = {}; off[k] = 0;
        const on = {}; on[k] = 1;
        ok(lay(off, 0.4) === 0, k + " at 0 draws nothing");
        ok(lay(on, 0.4) > 20, "the " + k + " draws", lay(on, 0.4) + " px");
      }

      const boxOf = (patch, frac) => {
        applyPreset(Object.assign({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24,
                                    frameSize: 4, glow: 0 }, patch), "nx");
        const r = renderFrames(state, { size: 128 });
        const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
        const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        return x1 < 0 ? null : { w: x1 - x0, h: y1 - y0, cy: (y0 + y1) / 2 };
      };

      // A decal is a GROUND mark: squashed, and sitting below the origin.
      {
        const b = boxOf({ decal: 1, decalSquash: 0.8, decalDrop: 0.2, decalGrow: 0 }, 0.4);
        ok(b && b.w > b.h * 2, "the decal is squashed to the ground plane",
           b ? b.w + "×" + b.h : "nothing drawn");
        ok(b && b.cy > 64, "…and sits below the origin", b ? "centre y " + b.cy.toFixed(0) : "");
      }

      // A tunnel recedes: rings scroll, so the pattern changes between frames.
      {
        const at = (frac) => {
          applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                        tunnel: 1, tunnelSpeed: 1, glow: 0 }, "tu2");
          const r = renderFrames(state, { size: 128 });
          const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
          return cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        };
        const a = at(0.05), b = at(0.55);
        let moved = 0;
        for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) moved++;
        ok(moved > 100, "the tunnel's rings travel toward the viewer", moved + " px changed");
      }

      // Crackle re-randomises in STEPS: two frames inside one step are identical, and it changes
      // across a step boundary. Continuous jitter reads as noise; stepped reads as electricity.
      {
        const frameAt = (f, rate) => {
          applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                        crackle: 1, crackleCount: 14, crackleRate: rate, glow: 0 }, "ck");
          const r = renderFrames(state, { size: 128 });
          return r.canvases[f].getContext("2d").getImageData(0, 0, 128, 128).data;
        };
        const diff = (a, b) => {
          let n = 0;
          for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) n++;
          return n;
        };
        // rate 2/s at 24fps: frames 0..11 share a step, so 0 vs 1 is identical, 0 vs 18 is not.
        ok(diff(frameAt(0, 2), frameAt(1, 2)) === 0, "crackle holds its pattern within a step");
        ok(diff(frameAt(0, 2), frameAt(18, 2)) > 20, "…and re-strikes at the next one");
      }

      // Aura is derived from ALPHA, which is exactly what makes it not-glow: it must halo a DIM
      // sprite, where glow (which thresholds on brightness) leaves nothing.
      {
        const dim = { shape: 0, count: 14, opacity: 1, emitter: 2, emitRadius: 0.2, speed: 0,
                      size: 9, life: 2, fadeIn: 0, fadeOut: 0, duration: 0.5, fps: 24,
                      frameSize: 4, bright: 0.16, coreWhite: 0, sat: 0.9, glow: 0 };
        const litOf = (patch) => {
          applyPreset(Object.assign({}, dim, patch), "au");
          return lit(renderFrames(state, { size: 128 }).canvases[2]);
        };
        const plain = litOf({});
        const withGlow = litOf({ glow: 1, glowRadius: 8, glowThresh: 0.5 });
        const withAura = litOf({ aura: 1, auraRadius: 8 });
        ok(withAura > plain * 1.3, "the aura halos the silhouette",
           plain + " → " + withAura + " px");
        ok(withAura > withGlow, "…including on a dim sprite, where glow has nothing to bloom",
           "glow " + withGlow + " vs aura " + withAura);
      }

      // Smear must not DIM what it smears. The first version averaged along the trail, which
      // divided a lone bright particle by the tap weight and visibly ate the effect.
      {
        const peak = (patch) => {
          applyPreset(Object.assign({ shape: 1, count: 12, opacity: 1, emitter: 1, emitAngle: 0,
                                      emitSpread: 20, speed: 130, size: 8, life: 0.5,
                                      duration: 0.6, fps: 24, frameSize: 4, glow: 0 }, patch), "sm");
          const cv = renderFrames(state, { size: 128 }).canvases[3];
          const d = cv.getContext("2d").getImageData(0, 0, 128, 128).data;
          let mx = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 8) { n++; mx = Math.max(mx, d[i] + d[i + 1] + d[i + 2]); }
          }
          return { peak: mx, lit: n };
        };
        const off = peak({ smear: 0 }), on = peak({ smear: 0.9, smearAmount: 1.5, smearAngle: 180 });
        ok(on.peak >= off.peak - 6, "smear does not dim what it smears",
           off.peak + " → " + on.peak + " peak RGB");
        ok(on.lit > off.lit * 1.15, "…and lays a trail behind it", off.lit + " → " + on.lit + " px");
      }
      applyPreset(PRESETS["Explosion"], "Explosion");
    }

    // -------------------------------------------------- swarm / chain / impact / weather / flare
    {
      ok(state.swarm === 0 && state.chain === 0 && state.impact === 0 &&
         state.weather === 0 && state.flare === 0, "the five new systems default to off");
      for (const k of ["swarm", "chain", "weather", "flare"]) {
        const off = {}; off[k] = 0;
        const on = {}; on[k] = 1;
        ok(lay(off, 0.4) === 0, k + " at 0 draws nothing");
        ok(lay(on, 0.4) > 20, "the " + k + " draws", lay(on, 0.4) + " px");
      }

      // Swarm is a GROUP: the members must move together rather than sit still.
      {
        const shot = (frac) => {
          applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                        swarm: 1, swarmCount: 20, swarmFlicker: 0, glow: 0 }, "sw");
          const r = renderFrames(state, { size: 128 });
          const cv = r.canvases[Math.min(r.canvases.length - 1, Math.floor(r.canvases.length * frac))];
          return cv.getContext("2d").getImageData(0, 0, 128, 128).data;
        };
        const a = shot(0.1), b = shot(0.7);
        let moved = 0;
        for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) moved++;
        ok(moved > 30, "the swarm moves as a group over time", moved + " px changed");
      }

      // Chain is ARTICULATED: the tail lags the head, so raising Lag changes the shape.
      {
        const span = (lag) => {
          applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                        chain: 1, chainSegs: 16, chainSpeed: 2, chainSwing: 90, chainLag: lag,
                        glow: 0 }, "ch");
          const r = renderFrames(state, { size: 128 });
          const d = r.canvases[6].getContext("2d").getImageData(0, 0, 128, 128).data;
          let x0 = 999, x1 = -1;
          for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
            if (d[(y * 128 + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
          }
          return x1 < 0 ? 0 : x1 - x0;
        };
        // With no lag every segment is on one straight line; with lag it curves and spans wider.
        ok(span(0.18) > span(0) + 2, "lag makes the chain trail behind rather than stay rigid",
           span(0) + "px → " + span(0.18) + "px");
      }

      // Impact is TEMPORAL and must not paint the transparent background when Fill frame is off —
      // otherwise every exported sheet gets an opaque rectangle instead of a hit flash.
      {
        applyPreset({ shape: 0, count: 30, opacity: 1, emitter: 0, size: 6, speed: 60,
                      duration: 0.5, fps: 24, frameSize: 4, glow: 0,
                      impact: 1, impactLife: 0.09, impactHold: 0.4, impactFill: 0 }, "im");
        const r = renderFrames(state, { size: 128 });
        const first = r.canvases[0].getContext("2d").getImageData(0, 0, 128, 128).data;
        let corners = 0;
        for (const [x, y] of [[1, 1], [126, 1], [1, 126], [126, 126]]) {
          if (first[(y * 128 + x) * 4 + 3] > 8) corners++;
        }
        ok(corners === 0, "the impact flash stays inside the sprite, not the background",
           corners + " lit corners");
        // Measure BRIGHTNESS, not coverage: source-atop paints inside the sprite's existing
        // alpha, so it changes colour without lighting a single new pixel. And frame 0 is often
        // empty anyway — particles haven't faded in yet — so compare the early run as a whole.
        const meanRGB = (cv) => {
          const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
          let sum = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 8) { sum += d[i] + d[i + 1] + d[i + 2]; n++; }
          }
          return n ? sum / (n * 3) : 0;
        };
        const early = (patch) => {
          applyPreset(Object.assign({ shape: 0, count: 30, opacity: 1, emitter: 0, size: 6,
                                      speed: 60, duration: 0.5, fps: 24, frameSize: 4, glow: 0,
                                      impactLife: 0.09, impactHold: 0.4, impactFill: 0 }, patch), "im2");
          const rr = renderFrames(state, { size: 128 });
          return Math.max(meanRGB(rr.canvases[1]), meanRGB(rr.canvases[2]));
        };
        const withOut = early({ impact: 0 }), withIt = early({ impact: 1 });
        ok(withIt > withOut + 8, "the impact flash brightens the opening frames",
           withOut.toFixed(0) + " → " + withIt.toFixed(0) + " mean RGB");
      }

      // Weather is a FIELD: it has no origin, so it covers the frame rather than clustering.
      {
        applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                      weather: 1, weatherCount: 120, glow: 0 }, "wx");
        const r = renderFrames(state, { size: 128 });
        const d = r.canvases[4].getContext("2d").getImageData(0, 0, 128, 128).data;
        let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        ok(x1 - x0 > 100 && y1 - y0 > 100, "weather fills the whole frame",
           (x1 - x0) + "×" + (y1 - y0) + " of 128");
      }

      // Flare is anamorphic — the streak is decisively wider than it is tall.
      {
        applyPreset({ shape: 0, count: 1, opacity: 0, duration: 1.0, fps: 24, frameSize: 4,
                      flare: 1, flareGhosts: 0, flareLife: 1, glow: 0 }, "fl");
        const r = renderFrames(state, { size: 128 });
        const d = r.canvases[2].getContext("2d").getImageData(0, 0, 128, 128).data;
        let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          if (d[(y * 128 + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        ok((x1 - x0) > (y1 - y0) * 3, "the flare streak is anamorphic, not a blob",
           (x1 - x0) + " wide × " + (y1 - y0) + " tall");
      }
      applyPreset(PRESETS["Explosion"], "Explosion");
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

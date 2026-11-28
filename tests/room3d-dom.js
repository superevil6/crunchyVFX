"use strict";
// CrunchyVFX: THE ROOM's DOM suite (VFX-DESIGN §61.3, §61.4): the stage's 2D | 3D switch, the lazy load (nothing of the
// room is loaded before 3D first opens), the picture following the playing frame, orbit by real pointer events, the room
// picker, the quiet CrunchyTexture line, reduced motion, and repainting when the view is shown again (WebKitGTK drops a
// hidden canvas's pixels).
//
//   node tests/run-ff.mjs room3d
(async function () {
  const rows = [];
  const say = function (line) { try { dump("VFX " + line + "\n"); } catch (e) { /* dump off */ } };
  async function t(name, fn) {
    let pass = false, detail = "";
    try { const r = await fn(); pass = r === true || r === undefined || !!(r && r.pass); detail = r && r.detail || ""; }
    catch (e) { detail = "threw: " + (e && e.message ? e.message : e); }
    rows.push({ name: name, pass: pass, detail: detail });
    say((pass ? "ok   " : "FAIL ") + name + (detail ? " — " + detail : ""));
  }
  const ok = function (p, d) { return { pass: !!p, detail: p ? "" : (d || "") }; };
  const shown = function (el) { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none"; };
  const wait = async function (cond, ms) { for (let i = 0; i < (ms || 8000) / 20; i++) { if (cond()) return true; await new Promise(function (r) { setTimeout(r, 20); }); } return false; };
  const cv = document.getElementById("r3vCv");
  const pix = function () { return cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; };
  const hash = function (d) { let a = 0x811c9dc5; for (let i = 0; i < d.length; i++) a = Math.imul(a ^ d[i], 0x01000193) >>> 0; return a.toString(16); };
  const lit = function (d) { let c = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) c++; return c; };
  if (typeof endTour === "function") endTour(false);

  await t("lazy/nothing-of-the-room-loads-at-start", function () {
    return ok(!document.querySelector("script[data-lazy]") && typeof room3dRender === "undefined" && typeof textureIndex === "undefined" &&
              typeof CT_RAMPS === "undefined" && typeof texGenRecipe === "undefined" &&
              !Array.from(document.scripts).some(function (s) { return /(room3d|textures|texgen|ramps)\.js/.test(s.src); }));
  });
  await t("switch/2d-first-3d-beside-it", function () {
    const a = document.getElementById("tab2d"), b = document.getElementById("tab3d");
    return ok(shown(a) && shown(b) && a.getAttribute("aria-selected") === "true" && b.getAttribute("aria-selected") === "false" &&
              a.closest("[role=tablist]") === b.closest("[role=tablist]") && shown(document.getElementById("stage")) &&
              !shown(document.getElementById("r3vView")) && /3D/.test(b.textContent));
  });
  applyPreset(PRESETS["Pixel Explosion"], "Pixel Explosion", true);
  playing = false; frameIdx = 0; drawStage();
  await t("switch/3d-loads-the-room-once", async function () {
    document.getElementById("tab3d").click();
    const loaded = await wait(function () { return r3vReady() && !document.getElementById("r3vRoom").disabled; });
    const lazy = Array.from(document.querySelectorAll("script[data-lazy=\"3d\"]")).map(function (s) { return s.src.replace(/^.*\//, ""); });
    return ok(loaded && lazy.join() === "textures.js,texgen.js,ramps.js,room3d.js" && R3V_DEPS.every(function (d) { return d.got() === d.want; }),
              lazy.join() + " " + R3V_DEPS.map(function (d) { return d.file + ":" + d.got(); }).join(" "));
  });
  await t("switch/3d-shows-the-room-and-hides-the-flat-stage", function () {
    const b = document.getElementById("tab3d");
    return ok(shown(document.getElementById("r3vView")) && !shown(document.getElementById("stageWrap")) && b.getAttribute("aria-selected") === "true" &&
              b.classList.contains("active") && lit(pix()) > 4000, "lit " + lit(pix()));
  });
  await t("switch/says-how-it-stands-and-whether-it-lights", function () {
    const s = document.getElementById("r3vInfo").textContent;
    return ok(/^Stand: auto, it (faces you|stands upright|lies on the floor|on the screen)\./.test(s) && /Light: it lights the room from its glow/.test(s), s);
  });
  await t("picture/is-320x200-shown-with-square-pixels", function () {
    const w = parseFloat(cv.style.width);
    return ok(cv.width === 320 && cv.height === 200 && getComputedStyle(cv).imageRendering === "pixelated" && w >= 160, cv.style.width);
  });
  await t("picture/follows-the-playing-frame-and-its-light", function () {
    const L = r3v.light, n = rendered.canvases.length;
    let peak = 0; L.energies.forEach(function (e, i) { if (e > L.energies[peak]) peak = i; });
    const last = n - 1;
    frameIdx = peak; drawStage(); const a = pix(), la = lit(a), ha = hash(a);
    frameIdx = last; drawStage(); const b = pix(), hb = hash(b);
    return ok(L.on && ha !== hb && la > lit(b), "peak " + peak + " lit " + la + " vs last " + lit(b));
  });
  await t("orbit/drag-turns-the-camera", function () {
    const before = hash(pix()), yaw0 = r3v.yaw, pitch0 = r3v.pitch, r = cv.getBoundingClientRect();
    const ev = function (type, x, y) { cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, isPrimary: true, pointerType: "mouse" })); };
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    ev("pointerdown", x0, y0); ev("pointermove", x0 + 60, y0 + 20); ev("pointermove", x0 + 120, y0 + 40); ev("pointerup", x0 + 120, y0 + 40);
    // a long drag stops where the walls would leave the view: the yaw is kept in range
    return ok(r3v.yaw < yaw0 && r3v.yaw === ROOM3D_YAW_MIN && r3v.pitch > pitch0 && r3v.user && !r3v.drag && hash(pix()) !== before, [yaw0, r3v.yaw, pitch0, r3v.pitch].join(" "));
  });
  await t("orbit/reset-view-goes-back", function () {
    document.getElementById("r3vReset").click();
    const V = room3dView(r3v.place);
    return ok(!r3v.user && r3v.yaw === V.yaw && r3v.pitch === V.pitch);
  });
  await t("orbit/keys-turn-it-too", function () {
    const y = r3v.yaw;
    cv.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    return ok(Math.abs(r3v.yaw - y - 0.15) < 0.5 && r3v.yaw > y);
  });
  await t("rooms/five-to-pick-each-its-own-picture", function () {
    const sel = document.getElementById("r3vRoom"), seen = {};
    for (const o of Array.from(sel.options)) { sel.value = o.value; sel.dispatchEvent(new Event("change")); seen[o.value] = hash(pix()); }
    let kept = null; try { kept = localStorage.getItem("crunchyvfx.room3d.v1"); } catch (e) { /* none */ }
    const names = Array.from(sel.options).map(function (o) { return o.textContent; });
    sel.value = "dungeon"; sel.dispatchEvent(new Event("change"));
    return ok(sel.options.length === 5 && new Set(Object.values(seen)).size === 5 && (JSON.parse(kept || "{}").room === "cellar") && r3v.room === "dungeon" &&
              names.join() === "Dungeon,Night meadow,Sci-fi deck,Wooden hall,Torchlit cellar", names.join() + " " + kept);
  });
  await t("orbit/wheel-and-pinch-zoom", function () {
    document.getElementById("r3vReset").click();
    const r = cv.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2, h0 = hash(pix());
    cv.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -300, clientX: x0, clientY: y0 }));
    const zin = r3v.zoom, h1 = hash(pix());
    const pe = function (type, id, x) { cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y0, pointerType: "touch" })); };
    pe("pointerdown", 11, x0 - 20); pe("pointerdown", 12, x0 + 20); pe("pointermove", 12, x0 + 30); pe("pointerup", 11, x0 - 20); pe("pointerup", 12, x0 + 30);
    const zp = r3v.zoom;
    for (let i = 0; i < 40; i++) cv.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 400 }));
    const zmax = r3v.zoom;
    cv.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }));
    return ok(zin < 1 && h1 !== h0 && Math.abs(zp - zin * 40 / 50) < 1e-9 && zmax === R3V_ZOOM[1] && r3v.zoom < zmax && Object.keys(r3v.pts).length === 0,
              [zin, zp, zmax, r3v.zoom].join(" "));
  });
  await t("orbit/eye-height-is-a-first-person-look", function () {
    document.getElementById("r3vReset").click();
    const orbit = hash(pix());
    document.getElementById("r3vEye").click();
    const c = r3vCam(), eyeY = c.ty + Math.sin(c.pitch) * c.dist, eye = hash(pix());
    let saved = null; try { saved = JSON.parse(localStorage.getItem(R3V_PREF)); } catch (e) { /* none */ }
    const pressed = document.getElementById("r3vEye").getAttribute("aria-pressed") === "true" && document.getElementById("r3vOrbit").getAttribute("aria-pressed") === "false";
    document.getElementById("r3vOrbit").click();
    return ok(Math.abs(eyeY - 1.6) < 1e-9 && eye !== orbit && pressed && saved && saved.eye === true && !r3v.eye, eyeY + " " + JSON.stringify(saved));
  });
  await t("rows/the-3d-rows-under-the-room-drive-the-panel", async function () {
    applyPreset(PRESETS["Pixel Explosion"], "Pixel Explosion", true); playing = false; frameIdx = 6; drawStage();
    const set = document.getElementById("r3vSet"), stand = document.getElementById("r3vStand"), size = document.getElementById("r3vSize");
    const light = document.getElementById("r3vLight"), power = document.getElementById("r3vPower");
    const under = set.compareDocumentPosition(document.getElementById("r3vReset")) & Node.DOCUMENT_POSITION_PRECEDING && shown(set);
    const histBefore = histPos;
    stand.value = "3"; stand.dispatchEvent(new Event("change"));                  // flat on the ground
    const flatNow = state.d3Stand === 3 && inputs.d3Stand.value === "3" && r3v.stand === "flat" && histPos === histBefore + 1;
    size.value = "4"; size.dispatchEvent(new Event("input")); size.dispatchEvent(new Event("change"));
    rerender();
    const sized = state.d3Size === 4 && inputs.d3Size.value === "4" && /4\.00 m/.test(document.getElementById("r3vSizeV").textContent);
    power.value = "0.5"; power.dispatchEvent(new Event("input")); power.dispatchEvent(new Event("change"));
    const off = Array.from(light.options).findIndex(function (o) { return /^off/i.test(o.textContent); });
    light.value = String(off); light.dispatchEvent(new Event("change"));
    rerender();
    const lightOff = state.d3Light === off && !r3v.light.on && /Light: off/.test(document.getElementById("r3vInfo").textContent);
    // undo walks it back, and the rows under the room follow state
    undoEdit(); undoEdit(); undoEdit(); undoEdit(); rerender();
    const back = state.d3Stand === 0 && state.d3Size === 0 && state.d3Light === 0 && state.d3LightPower === 1 && stand.value === "0" && size.value === "0" && light.value === "0";
    const autoWord = /^Auto/.test(stand.options[0].textContent) && /faces you/.test(stand.options[0].textContent);
    return ok(under && flatNow && sized && lightOff && back && autoWord && power.max === "2",
              [under, flatNow, sized, lightOff, back, autoWord, stand.options[0].textContent].join(" "));
  });
  await t("rows/more-3d-settings-opens-the-panel", async function () {
    const panel = document.querySelector('.panel[data-group="3D"]');
    if (!panel.classList.contains("collapsed")) panel.querySelector("h2").click();
    document.getElementById("r3vMore").click();
    await wait(function () { const r = panel.getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight; }, 3000);
    const r = panel.getBoundingClientRect();
    const ok1 = !panel.classList.contains("collapsed") && r.top < innerHeight && document.activeElement === panel.querySelector("h2");
    window.scrollTo(0, 0);
    return ok(ok1, r.top + " " + panel.className);
  });
  await t("rows/the-screen-note-says-it-covers-the-camera", function () {
    applyPreset(PRESETS["Rain"], "Rain", true); playing = false; frameIdx = 3; drawStage();
    const s = document.getElementById("r3vInfo").textContent;
    return ok(r3v.stand === "screen" && /covers the camera/.test(s) && /Downpour/.test(s) && /Count/.test(s), s);
  });
  await t("a11y/tabs-and-canvas-focus", function () {
    const a = document.getElementById("tab2d"), b = document.getElementById("tab3d");
    const roving = b.getAttribute("aria-selected") === "true" && b.tabIndex === 0 && a.getAttribute("aria-selected") === "false" && a.tabIndex === -1;
    cv.focus();
    const named = /3D room/.test(cv.getAttribute("aria-label") || "");
    return ok(roving && cv.tabIndex === 0 && document.activeElement === cv && named, [roving, cv.tabIndex, named].join(" "));
  });
  await t("search/word-starts-rank-first", function () {
    const keep = presetQuery;
    presetQuery = "rain"; buildPresetStrip();
    const names = Array.from(document.querySelectorAll("#presets .pcell .pname")).map(function (e) { return e.textContent; });
    presetQuery = keep; buildPresetStrip();
    const iRain = names.indexOf("Rain"), iSoul = names.indexOf("Soul Drain");
    return ok(iRain >= 0 && (iSoul < 0 || iRain < iSoul), names.slice(0, 8).join(", "));
  });
  await t("line/one-quiet-line-to-crunchytexture", function () {
    const line = document.getElementById("r3vLine"), a = document.getElementById("r3vLink");
    const tex = CRUNCHY_SUITE.find(function (x) { return x.id === "texture"; });
    return ok(shown(line) && /CrunchyTexture/.test(line.textContent) && a.href === tex.web && a.target === "_blank" &&
              line.querySelectorAll("a").length === 1 && document.querySelectorAll("#r3vView .r3v-line").length === 1, a.href);
  });
  await t("stands/flat-upright-screen-from-the-presets", async function () {
    // the export's table (fx3d.js FX3D_AUTO_STAND, §61.6): the room stands each as its Godot 3D scene does
    const got = {};
    for (const n of ["Summon Circle", "Scorch Mark", "Pixel Portal", "Rain", "Pixel Lightning"]) {
      applyPreset(PRESETS[n], n, true); playing = false; frameIdx = Math.floor(rendered.canvases.length / 2); drawStage();
      got[n] = r3v.stand + ":" + r3v.place.alpha + ":" + lit(pix());
      if (r3v.stand !== fx3dStand(state, n)) got[n] += ":DISAGREES";
    }
    return ok(/^flat:/.test(got["Summon Circle"]) && /^upright:/.test(got["Scorch Mark"]) && /^upright:cut:/.test(got["Pixel Portal"]) &&
              /^screen:/.test(got.Rain) && /^upright:cut:/.test(got["Pixel Lightning"]) && !/DISAGREES/.test(JSON.stringify(got)), JSON.stringify(got));
  });
  await t("stands/what-the-export-decided", async function () {
    // the room's placement is made of fx3d.js's own answers: alpha mode, flat depth, the light's position from the node
    const out = {};
    for (const n of ["Explosion", "Pixel Explosion", "Summon Circle"]) {
      applyPreset(PRESETS[n], n, true); playing = false; frameIdx = 0; drawStage();
      const masks = fx3dMasksOf(rendered.canvases, state), P = r3v.place;
      out[n] = { alpha: P.alpha === fx3dAlphaMode(masks) ? P.alpha : "DISAGREES", depth: P.depth, lightOn: !!(r3v.light && r3v.light.on) };
    }
    return ok(out.Explosion.alpha === "blend" && out["Pixel Explosion"].alpha === "cut" && out["Summon Circle"].depth > 1.5 &&
              out["Summon Circle"].alpha !== "DISAGREES", JSON.stringify(out));
  });
  await t("motion/sways-while-playing-never-under-reduced-motion", async function () {
    const keep = window.matchMedia;
    r3v.sway = 0; r3v.user = false; playing = true; r3v.swayAt = performance.now() - 150; r3vPaint();
    const moved = r3v.sway > 0;
    window.matchMedia = function (q) { return { matches: /reduce/.test(q), media: q, addEventListener: function () {}, removeEventListener: function () {} }; };
    try {
      r3v.sway = 1.2;
      const y = r3vYaw();
      r3v.swayAt = performance.now() - 150; r3vPaint();
      return ok(moved && y === r3v.yaw && r3v.sway === 1.2, moved + " " + y + " " + r3v.yaw);
    } finally { window.matchMedia = keep; playing = false; }
  });
  await t("rehide/2d-again-then-3d-repaints", function () {
    document.getElementById("tab2d").click();
    const back = shown(document.getElementById("stageWrap")) && !shown(document.getElementById("r3vView"));
    cv.getContext("2d").clearRect(0, 0, 320, 200);                  // what WebKitGTK does to a hidden canvas
    document.getElementById("tab3d").click();
    return ok(back && lit(pix()) > 2000, "lit " + lit(pix()));
  });
  await t("rehide/keys-switch-the-view", function () {
    const b = document.getElementById("tab3d");
    b.focus(); b.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    const r = !r3v.open && document.activeElement === document.getElementById("tab2d");
    document.getElementById("tab2d").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    return ok(r && r3v.open);
  });
  await t("stage/the-2d-frames-are-untouched", function () {
    // the room reads the frames; it never draws on them
    applyPreset(PRESETS["Pixel Explosion"], "Pixel Explosion", true);
    const a = rendered.canvases.map(function (c) { return hash(c.getContext("2d").getImageData(0, 0, c.width, c.height).data); }).join();
    r3vSet("3d"); frameIdx = 3; drawStage(); r3vSet("2d");
    const b = rendered.canvases.map(function (c) { return hash(c.getContext("2d").getImageData(0, 0, c.width, c.height).data); }).join();
    return ok(a === b);
  });

  const bad = rows.filter(function (r) { return !r.pass; });
  say("END " + (bad.length ? "FAIL " + bad.length + " of " + rows.length : "PASS " + rows.length + "/" + rows.length));
})();

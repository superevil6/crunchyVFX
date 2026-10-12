"use strict";
// CrunchyVFX — THE WEB SUITE for the planted Library's pass (VFX-DESIGN §18): the free web build, booted over the
// browser store exactly as HEAD 11e8d14 left it (tests/fixtures/head.js). It proves the web build is untouched by the
// desktop work (no planted entry point, the core's Settings, no desktop button while CrunchyVFX has no store link),
// that HEAD's saved state and share links still open to the same frames, and that the Export zip carries a sidecar.
//
//   node tests/run-ff.mjs web
(async function () {
  const rows = [], V = window.VFX_HEAD;
  const say = function (line) { try { dump("VFX " + line + "\n"); } catch (e) { /* dump off */ } };
  async function t(name, fn) {
    let pass = false, detail = "";
    try { const r = await fn(); pass = r === true || r === undefined || !!(r && r.pass); detail = r && r.detail || ""; }
    catch (e) { detail = "threw: " + (e && e.message ? e.message : e); }
    rows.push({ name: name, pass: pass, detail: detail });
    say((pass ? "ok   " : "FAIL ") + name + (detail ? " — " + detail : ""));
  }
  const ok = function (p, d) { return { pass: !!p, detail: p ? "" : (d || "") }; };
  const shown = function (el) { return !!el && el.getClientRects().length > 0; };
  const wait = async function (cond, ms) { for (let i = 0; i < (ms || 4000) / 20; i++) { if (cond()) return true; await new Promise(function (r) { setTimeout(r, 20); }); } return false; };
  const frames = function (cvs) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    const enc = new TextEncoder();
    const eat = function (bytes) { for (let i = 0; i < bytes.length; i++) { a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0; b = Math.imul(b ^ bytes[i], 0x5bd1e995) >>> 0; } };
    for (const cv of cvs) { eat(enc.encode(cv.width + "x" + cv.height)); eat(new Uint8Array(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.buffer)); }
    return ("00000000" + a.toString(16)).slice(-8) + ("00000000" + b.toString(16)).slice(-8);
  };
  const store = function () {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^crunchyvfx\./.test(k)) o[k] = localStorage.getItem(k); }
    return o;
  };
  if (typeof endTour === "function") endTour(false);
  const atBoot = JSON.stringify(store());

  await t("gate/the-web-build-has-no-planted-entry-point", function () {
    return ok(!isDesktop && !document.getElementById("libraryBtn") && !document.getElementById("libDock") && !document.getElementById("plantMsg") &&
              !shown(document.getElementById("ihBtn")) && !shown(document.getElementById("mypresets")) && project === null &&
              Array.from(document.querySelectorAll("[data-desktop]")).every(function (e) { return e.hidden; }));
  });
  await t("gate/no-desktop-button-while-vfx-has-no-store-link", function () {
    return ok(desktopStoreUrl("vfx") === "" && !document.querySelector(".desk-cta") && !document.querySelector(".desk-overlay") &&
              !document.getElementById("deskCta") && desktopGate.cta === null && typeof ITCH_LIVE === "undefined");
  });
  await t("gate/the-button-would-appear-with-a-link", function () {
    const tool = CRUNCHY_SUITE.find(function (x) { return x.id === "vfx"; }), keep = tool.desktop, host = document.createElement("div");
    tool.desktop = "https://example.invalid/crunchyvfx";
    let g;
    try { g = desktopMount("vfx", { place: host, adds: [["A", "b"]] }); } finally { tool.desktop = keep; }
    const r = g.cta && host.contains(g.cta) && /Get the desktop app/.test(g.cta.textContent);
    document.querySelectorAll(".desk-overlay").forEach(function (e) { e.remove(); });
    return ok(r);
  });
  await t("settings/the-core-dialog-on-the-web-too", function () {
    document.getElementById("setBtn").click();
    const m = document.getElementById("setModal");
    const r = shown(m) && m.querySelector("#setDock").checked === false && m.querySelector("#setLock").checked === false;
    settingsDialog.close();
    return ok(r && pixelLock === false && dockOn === false);
  });
  await t("legacy/heads-share-links-open-to-the-same-frames", function () {
    const got = [];
    for (const l of V.links) {
      history.replaceState(null, "", location.pathname + "?e=" + l.enc);
      loadSharedEffect();
      got.push(frames(rendered.canvases) === l.frames && effectLabel === (l.name || "Shared effect"));
    }
    history.replaceState(null, "", location.pathname);
    return ok(got.every(Boolean), got.join(","));
  });
  await t("legacy/heads-my-effects-still-load-and-render-the-same", async function () {
    const bad = [];
    for (const it of userEffects) {
      applyPreset(it.state, it.name, true);
      if (it.state.imageSprite) { await wait(function () { return imageSpriteEl && imageSpriteEl.src === it.state.imageSprite && imageSpriteEl.complete; }); rerender(); }
      if (frames(rendered.canvases) !== V.localStorage.upFrames[it.id]) bad.push(it.name);
    }
    return ok(userEffects.length === 6 && !bad.length, bad.join(","));
  });
  await t("web-zip/the-export-zip-carries-a-sidecar-that-reopens-it", async function () {
    applyPreset(PRESETS["Explosion"], "Zip one", true);
    expFormat.value = "sheet"; expMetaSel.value = "godot"; expTrim.checked = true; expEmis.checked = false;
    for (const s of EXPORT_SCALES) expScaleBoxes[s].checked = s === 1;
    const keepDl = download, keepZip = makeZip;
    let list = null, name = "";
    makeZip = function (l) { list = l; return keepZip(l); };
    download = function (b, n) { name = n; };
    try { expModal.querySelector("#expGo").click(); await wait(function () { return !!name; }, 8000); } finally { download = keepDl; makeZip = keepZip; }
    const sc = list.find(function (f) { return f.name === "zip-one.crunchy"; });
    const d = JSON.parse(new TextDecoder().decode(sc.data));
    const want = frames(rendered.canvases);
    applyPreset(PRESETS["Hit Spark"], "x", true);
    applyPreset(decodePatch(d.s), d.name, true);
    return ok(name === "zip-one.zip" && d.format === "crunchy-asset" && d.app === "crunchyvfx" && d.kind === "effect" && d.files.join() === "zip-one.png,zip-one.tres" &&
              d.exp.meta === "godot" && d.exp.format === "sheet" && plantHash(list.filter(function (f) { return f !== sc; }).map(function (f) { return { path: f.name, data: f.data }; })) === d.hash &&
              frames(rendered.canvases) === want, list.map(function (f) { return f.name; }).join(","));
  });
  await t("web-zip/a-single-file-export-is-still-just-the-png", async function () {
    expMetaSel.value = "none";
    const keepDl = download;
    let name = "";
    download = function (b, n) { name = n; };
    try { expModal.querySelector("#expGo").click(); await wait(function () { return !!name; }, 8000); } finally { download = keepDl; expMetaSel.value = "generic"; }
    return ok(name === "zip-one.png", name);
  });
  await t("safety/the-web-build-wrote-nothing-to-the-browser-store", function () {
    return ok(JSON.stringify(store()) === atBoot, Object.keys(store()).join(","));
  });
  await t("words/no-pro-premium-or-unlock-anywhere-visible", function () {
    // the chrome, not the content: a preset is called "Treasure Unlock" (a chest opening), which is an effect's name
    const presets = document.getElementById("presets"), keep = presets.style.display;
    presets.style.display = "none";
    const text = document.body.innerText + " " + Array.from(document.querySelectorAll("[title], [placeholder], [aria-label]"))
      .filter(function (x) { return !presets.contains(x); })
      .map(function (x) { return (x.title || "") + " " + (x.placeholder || "") + " " + (x.getAttribute("aria-label") || ""); }).join(" ");
    presets.style.display = keep;
    const bad = text.match(/\b(pro|premium|unlock(ed|s)?)\b/gi);
    return ok(!bad, bad ? bad.join(",") : "");
  });
  await t("safety/no-page-errors", function () { return ok(!window.__pageErrors.length, window.__pageErrors.slice(0, 3).join(" | ")); });

  const failed = rows.filter(function (r) { return !r.pass; });
  say("END " + (failed.length ? "FAIL" : "PASS") + " " + (rows.length - failed.length) + "/" + rows.length);
})();

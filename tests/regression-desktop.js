"use strict";
// CrunchyVFX — THE DESKTOP SUITE (the planted Library, VFX-DESIGN §18; crunchyTile's and CrunchySFX's
// tests/regression-desktop.js are the models). Runs INSIDE the real index.html with window.__TAURI__ mocked
// (tests/tauri-mock.js, an in-memory disk whose `remove` takes only a file or an EMPTY folder) and the browser store
// seeded EXACTLY as CrunchyVFX HEAD 11e8d14 left it (tests/fixtures/head.js, seed-head.js).
//
//   node tests/run-ff.mjs desktop            # every line; --quiet for the failures and the end
//   python3 tests/build.py desktop && python3 tests/wkshot.py "file://$PWD/tests/run-desktop.html?show" out.png 1600 1000 25
//
// ASYNC (canvas.toBlob, the planted Library's queue): it reports through dump() ("VFX ok …", "VFX FAIL …", then
// "VFX END PASS|FAIL n/m") and draws a banner at the end.
(async function () {
  const rows = [], M = window.__TAURI__.__mock, V = window.VFX_HEAD;
  const GODOT = "/home/aj/godot-game", UNITY = "/home/aj/unity-game", PLAIN = "/home/aj/plain";
  const ROOT = GODOT + "/crunchy/vfx";
  const say = function (line) { try { dump("VFX " + line + "\n"); } catch (e) { /* dump off */ } };
  async function t(name, fn) {
    let pass = false, detail = "";
    try {
      const r = await fn();
      if (r === true || r === undefined) pass = true;
      else if (typeof r === "string") detail = r;
      else { pass = !!r.pass; detail = r.detail || ""; }
    } catch (e) { detail = "threw: " + (e && e.message ? e.message : e) + " " + String(e && e.stack || "").split("\n")[1]; }
    rows.push({ name: name, pass: pass, detail: detail });
    say((pass ? "ok   " : "FAIL ") + name + (detail ? " — " + detail : ""));
  }
  const ok = function (p, d) { return { pass: !!p, detail: p ? "" : (d || "") }; };
  const shown = function (el) { return !!el && el.getClientRects().length > 0; };
  async function settle() { for (let i = 0; i < 8; i++) { await null; await projQueue; } }
  const wait = async function (cond, ms) { for (let i = 0; i < (ms || 4000) / 20; i++) { if (cond()) return true; await new Promise(function (r) { setTimeout(r, 20); }); } return false; };
  const lib = function () { return library.root(); };
  const libButton = function (re) {
    return Array.from(lib().querySelectorAll("button")).find(function (b) { return typeof re === "string" ? b.textContent === re : re.test(b.textContent); });
  };
  const card = function (name) {
    return Array.from(lib().querySelectorAll(".lib-card")).find(function (c) { return c.querySelector(".lib-name") && c.querySelector(".lib-name").textContent === name; });
  };
  const cardButton = function (name, text) {
    const c = card(name);
    return c && Array.from(c.querySelectorAll(".lib-acts button")).find(function (b) { return b.textContent === text || (text !== "Rename" && b.textContent === "Really?" && b.dataset.was === text); });
  };
  const status = function () { return document.getElementById("plantMsg").textContent; };
  const side = function (root, slug) { return JSON.parse(M.text(root + "/" + slug + "/" + slug + ".crunchy") || "null"); };
  const sidecar = function (slug) { return side(ROOT, slug); };
  const same = function (a, b) { return !!a && !!b && a.length === b.length && a.every(function (x, i) { return x === b[i]; }); };
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
  const LEGACY = ["crunchyvfx.userpresets.v1", "crunchyvfx.usercats.v1", "crunchyvfx.sprites.v1", "crunchyvfx.exports.v1", "crunchyvfx.pipelines.v1"];
  const legacyNow = function () { return LEGACY.map(function (k) { return localStorage.getItem(k); }).join("\u0000"); };
  const setExp = function (c) {
    expFormat.value = c.format || "sheet"; expLayout.value = c.layout || "grid"; expMetaSel.value = c.meta || "generic";
    expTrim.checked = !!c.trim; expPot.checked = !!c.pot; expEmis.checked = !!c.emis; expSound.checked = c.sound !== false;
    for (const s of EXPORT_SCALES) expScaleBoxes[s].checked = (c.scales || [1]).indexOf(s) >= 0;
    [expLayout, expMetaSel, expTrim].forEach(function (e) { e.dispatchEvent(new Event("change")); });
  };
  const exportNow = async function (base) {                       // what the Export dialog makes, for the effect on screen
    const o = await buildExportBundle(null, Object.assign({ format: "sheet" }, plantExpNow(), { base: base }));
    return o.files;
  };
  const spriteReady = function (url) { return wait(function () { return imageSpriteEl && imageSpriteEl.src === url && imageSpriteEl.complete; }); };
  const press = async function (btn) { btn.click(); await settle(); };
  const twice = async function (name, text) {
    const b = cardButton(name, text);
    if (!b) return false;
    b.dataset.was = text;
    b.click();                                                     // the first press arms it ("Really?")
    const armed = b.textContent === "Really?";
    b.click();
    await settle();
    return armed;
  };
  const writes = function () { return M.log.filter(function (l) { return /^(w|rm|rmdir) /.test(l); }); };

  if (typeof endTour === "function") endTour(false);
  await settle();
  const atBoot = legacyNow();
  const storeAtBoot = JSON.stringify(store());

  // ---- the gate, and HEAD's saved things as this build boots with them ----
  await t("gate/desktop-controls-and-no-web-button", function () {
    const ih = document.getElementById("ihBtn");
    return ok(isDesktop && shown(document.getElementById("libraryBtn")) && shown(document.getElementById("mypresets")) && shown(ih) &&
              /Imports & history/.test(ih.textContent) && !/^Library$/.test(ih.textContent.trim()) && shown(document.getElementById("setBtn")) &&
              !document.querySelector(".desk-cta") && !document.querySelector(".desk-overlay") && !document.getElementById("deskCta"));
  });
  // §29: the website's About link (about.html) is web only
  await t("gate/no-website-about-link", function () {
    const a = document.querySelector('a[href="about.html"]');
    return ok(!!a && !shown(a));
  });
  await t("legacy/the-head-store-is-read-as-it-was", function () {
    const up = JSON.parse(V.localStorage.store["crunchyvfx.userpresets.v1"]);
    return ok(userEffects.length === 6 && JSON.stringify(userEffects) === JSON.stringify(up.items) && upSeq === up.seq &&
              userCats.length === 2 && userCats[0].name === "Hits" && userSprites.length === 1 && exportLog.length === 2 &&
              pipelines.length === 2 && pipelines[0].folder === "/home/aj/game/vfx" && pixelLock === false && lockedValues.pixelate === 2 &&
              dockOn === false && foldState.shapes === true, userEffects.length + " " + userCats.length);
  });
  await t("legacy/my-effects-open-to-heads-frames", async function () {
    const bad = [];
    for (const it of userEffects) {
      applyPreset(it.state, it.name, true);
      if (it.state.imageSprite) { await spriteReady(it.state.imageSprite); rerender(); }
      if (frames(rendered.canvases) !== V.localStorage.upFrames[it.id]) bad.push(it.name);
    }
    return ok(!bad.length, bad.join(", "));
  });

  // ---- Settings (core settings.js) ----
  await t("settings/the-core-dialog-with-every-row", function () {
    document.getElementById("setBtn").click();
    const m = document.getElementById("setModal");
    const r = shown(m) && m.querySelector("#setDock") && m.querySelector("#setLock") && m.querySelector("#setDock").checked === false &&
      m.querySelector("#setLock").checked === false && /Replay the tour/.test(m.textContent) && /Open tutorials/.test(m.textContent);
    settingsDialog.close();
    return ok(r);
  });
  await t("settings/each-preference-still-works-and-keeps-its-key", function () {
    settingsDialog.open();
    const m = document.getElementById("setModal"), d = m.querySelector("#setDock"), l = m.querySelector("#setLock");
    d.click(); l.click();
    const on = localStorage.getItem("crunchyvfx.dock.v1") === "1" && dockOn && pixelLock && JSON.parse(localStorage.getItem("crunchyvfx.lockpixels.v1")).on === true &&
      document.getElementById("dockToggle").classList.contains("active") && document.getElementById("lockBtn").classList.contains("on");
    d.click(); l.click();
    const off = localStorage.getItem("crunchyvfx.dock.v1") === "0" && !dockOn && !pixelLock && JSON.parse(localStorage.getItem("crunchyvfx.lockpixels.v1")).on === false;
    document.getElementById("lockBtn").click();                       // the toolbar and the dialog agree
    settingsDialog.refresh();
    const agree = l.checked === true;
    document.getElementById("lockBtn").click();
    settingsDialog.close();
    // turning the lock off FORGETS what it pinned (the app's own rule): put HEAD's pinned value back for the later checks
    lockedValues = { pixelate: 2 }; saveLockPref(); updateLockBtn();
    return ok(on && off && agree && localStorage.getItem("crunchyvfx.lockpixels.v1") === V.localStorage.store["crunchyvfx.lockpixels.v1"]);
  });
  // §30: the update check's two rows (desktop only), its switch kept in its own key, and the banner it shows when behind
  await t("settings/update-check-switch-and-banner", function () {
    settingsDialog.open();
    const m = document.getElementById("setModal"), u = m.querySelector("#setUpdates");
    const rows = !!u && u.checked === true && !!m.querySelector("#updMsg") && /Check now/.test(m.textContent);
    u.click();
    const off = localStorage.getItem("crunchyvfx.checkUpdates.v1") === "0" && !updateChecksOn();
    u.click();
    const on = localStorage.getItem("crunchyvfx.checkUpdates.v1") === "1" && updateChecksOn();
    settingsDialog.close();
    const none = !document.getElementById("updBanner");              // file:// never checked on launch
    showUpdateBanner({ version: "9.9.9", url: "https://example.com/x", notes: "Test notes." });
    const b = document.getElementById("updBanner");
    const shownOk = !!b && /9\.9\.9 is available: Test notes\./.test(b.textContent) && getComputedStyle(b).position === "fixed";
    if (b) b.remove();
    localStorage.removeItem("crunchyvfx.checkUpdates.v1");
    return ok(rows && off && on && none && shownOk, JSON.stringify({ rows, off, on, none, shownOk }));
  });

  // ---- the docked panel, planting into Godot ----
  await t("dock/a-docked-panel-with-the-start-screen", function () {
    document.getElementById("libraryBtn").click();
    const r = lib();
    return ok(library.isOpen() && r.classList.contains("lib-dock") && r.parentElement.id === "libDock" && shown(document.getElementById("libDock")) &&
              /Plant CrunchyVFX in your game/.test(r.textContent) && libButton("Plant in a folder…") && !document.querySelector(".lib-overlay") &&
              parseInt(getComputedStyle(document.body).paddingRight, 10) >= 400);
  });
  await t("plant/a-godot-project-writes-nothing-yet-and-offers-my-effects", async function () {
    const before = writes().length;
    M.answer(GODOT);
    await press(libButton("Plant in a folder…"));
    return ok(project && project.engine === "godot" && project.rel === "crunchy/vfx" && writes().length === before &&
              libButton("Plant my effects (6)") && /a Godot project/.test(status()) && /Plant my effects/.test(status()), status());
  });
  await t("save/an-effect-is-its-godot-export-and-a-sidecar", async function () {
    applyPreset(PRESETS["Explosion"], "Explosion", true);
    setExp({ meta: "generic", trim: true });                         // a Godot project plants SpriteFrames whatever the dialog says
    await press(document.getElementById("plantSave"));
    const d = sidecar("explosion");
    const files = M.list(ROOT + "/explosion/");
    // SUITE-LINKS.md §4: in a Godot game the combined scene and its script ride along; with no sound, no Sound node
    const tscn = M.text(ROOT + "/explosion/explosion.tscn") || "";
    // §26: the ready scene (plays on ready, `impact` on its brightest frame, frees itself) and the export's README.txt
    return ok(files.join(",") === [ROOT + "/explosion/README.txt"].concat(["crunchy", "gd", "png", "tres", "tscn"].map(function (e) { return ROOT + "/explosion/explosion." + e; })).join(",") &&
              /path="explosion\.tres"/.test(tscn) && /path="explosion\.gd"/.test(tscn) && /sound_frame = 0/.test(tscn) && !/AudioStreamPlayer2D/.test(tscn) &&
              new RegExp("impact_frame = " + impactFrameOf(rendered) + "\n").test(tscn) && /texture_filter = 1/.test(tscn) &&
              /func play\(\)/.test(M.text(ROOT + "/explosion/explosion.gd")) && /signal impact/.test(M.text(ROOT + "/explosion/explosion.gd")) &&
              /@export var autoplay := true/.test(M.text(ROOT + "/explosion/explosion.gd")) && /explosion\.tscn/.test(M.text(ROOT + "/explosion/README.txt")) &&
              d && d.format === "crunchy-asset" && d.app === "crunchyvfx" && d.suite === "vfx" && d.kind === "effect" && d.name === "Explosion" &&
              d.exp.meta === "godot" && d.exp.trim === true && d.base === "explosion" && d.exportName === "Explosion" &&
              JSON.stringify(d.files) === '["explosion.png","explosion.tres","explosion.gd","explosion.tscn","README.txt"]' && d.info.frames === rendered.canvases.length &&
              /^data:image\/png;base64,/.test(d.thumb) && /^2:/.test(d.hash) && decodePatch(d.s).n === "Explosion" &&
              /path="explosion\.png"/.test(M.text(ROOT + "/explosion/explosion.tres")), files.join(",") + " " + status());
  });
  await t("save/the-files-are-byte-equal-to-the-export-dialogs", async function () {
    const ex = await exportNow("explosion");
    return ok(ex.length === 5 && ex.every(function (f) { return same(M.bytes(ROOT + "/explosion/" + f.name), f.data); }), ex.map(function (f) { return f.name; }).join(","));
  });
  await t("save/emissive-two-sizes-and-a-sound-byte-equal", async function () {
    applyPreset(PRESETS["Hit Spark"], "Sparks", true);
    synthesizePatch({}, "Spark sound");
    setExp({ meta: "aseprite", trim: false, emis: true, scales: [1, 2], layout: "row" });
    await press(document.getElementById("plantSave"));
    const d = sidecar("sparks"), ex = await exportNow("sparks");
    const names = ex.map(function (f) { return f.name; }).sort().join(",");
    // the planted files are the Export dialog's, its ready scene (§26) among them, which plays the effect's own synthesized WAV
    const tscn = M.text(ROOT + "/sparks/sparks.tscn") || "";
    const r = d && JSON.stringify(d.files.slice().sort()) === JSON.stringify(ex.map(function (f) { return f.name; }).sort()) && /sparks\.tscn/.test(names) &&
      /path="sparks@1x\.tres"/.test(tscn) && /type="AudioStream" path="sparks\.wav"/.test(tscn) &&
      ex.every(function (f) { return same(M.bytes(ROOT + "/sparks/" + f.name), f.data); }) && /sparks\.wav/.test(names) && /sparks@2x_emissive\.png/.test(names) &&
      /sparks@2x\.tres/.test(names) && d.sound && d.sound.name === "Spark sound" && d.exp.layout === "row";
    stopSound(); snd.buf = null; synthSound = null; syncSoundUI();
    return ok(r, names + " " + status());
  });
  await t("save/a-fresh-save-is-up-to-date-when-rendered-from-its-sidecar", async function () {
    await projCheckUpdates();
    return ok(!Object.keys(projUpdates).length && !card("Explosion").querySelector(".lib-badge.hot"), Object.keys(projUpdates).join(","));
  });
  // SAVE NEVER OVERWRITES (crunchyCore plant.js 5; AJ, 2026-10-12): a taken name gets the next number, and only a card's
  // Replace updates an effect. Each row removes its extra effect and makes the update the old row made, by Replace, so
  // the rows after see the same folder as before.
  const dropEffect = async function (name) {
    await projDo(async function () { await plantDelete(project, plantFind(project, "effect", name)); });
    projAfter(); await settle();
  };
  await t("save/the-effect-opened-from-saves-as-a-new-one", async function () {
    projOpenAsset(plantFind(project, "effect", "Explosion"));
    const was = sidecar("explosion"), png = M.bytes(ROOT + "/explosion/explosion.png");
    state.count = Math.max(2, Math.round(state.count / 2)); rerender();
    await press(document.getElementById("plantSave"));
    await wait(function () { return !!sidecar("explosion-2"); }, 3000);
    const now = sidecar("explosion"), two = sidecar("explosion-2");
    const pass = now.modified === was.modified && same(M.bytes(ROOT + "/explosion/explosion.png"), png) && two && two.name === "Explosion 2" &&
                 /“Explosion” was taken/.test(status());
    const msg = status();
    await dropEffect("Explosion 2");
    document.getElementById("plantName").value = "Explosion";
    await twice("Explosion", "Replace");                       // the update, the way it is made now
    await wait(function () { return /Replaced Explosion/.test(status()); }, 3000);
    const r = sidecar("explosion");
    return ok(pass && r.created === was.created && JSON.stringify(r.files) === JSON.stringify(was.files) &&
              !same(M.bytes(ROOT + "/explosion/explosion.png"), png) && project.assets.filter(function (a) { return a.name === "Explosion"; }).length === 1, msg + " / " + status());
  });
  await t("save/a-taken-name-gets-the-next-number", async function () {
    applyPreset(PRESETS["Hit Spark"], "Explosion", true);
    const png = M.bytes(ROOT + "/explosion/explosion.png");
    await press(document.getElementById("plantSave"));
    await wait(function () { return !!sidecar("explosion-2"); }, 3000);
    const pass = same(M.bytes(ROOT + "/explosion/explosion.png"), png) && !!sidecar("explosion-2");
    const msg = status();
    await dropEffect("Explosion 2");
    document.getElementById("plantName").value = "Explosion";
    await twice("Explosion", "Replace");
    await wait(function () { return /Replaced Explosion/.test(status()); }, 3000);
    return ok(pass && !same(M.bytes(ROOT + "/explosion/explosion.png"), png) && /Replaced Explosion/.test(status()), msg + " / " + status());
  });
  await t("save/ctrl-s-and-save-current-go-to-the-folder-not-the-browser", async function () {
    applyPreset(PRESETS["Magic Sparkle"] || PRESETS[Object.keys(PRESETS)[1]], "Twinkle star", true);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
    await settle();
    const a = !!sidecar("twinkle-star");
    applyPreset(PRESETS[Object.keys(PRESETS)[3]], "Saved current", true);
    document.getElementById("mpSave").click();
    await settle();
    return ok(a && !!sidecar("saved-current") && legacyNow() === atBoot && userEffects.length === 6, status());
  });

  // ---- the cards ----
  await t("library/cards-with-a-picture-badges-and-buttons", async function () {
    library.refresh();
    await wait(function () { const c = card("Explosion"); return c && c.querySelector("canvas").getContext("2d").getImageData(0, 0, 96, 96).data.some(function (v, i) { return i % 4 === 3 && v > 0; }); });
    const c = card("Explosion");
    const lit = c.querySelector("canvas").getContext("2d").getImageData(0, 0, 96, 96).data.some(function (v, i) { return i % 4 === 3 && v > 0; });
    const acts = Array.from(c.querySelectorAll(".lib-acts button")).map(function (b) { return b.textContent; }).join(",");
    return ok(lit && /fps/.test(c.textContent) && acts === "Rename,Replace,Game moment,Duplicate,Delete" && card("Sparks") && /♪ sound/.test(card("Sparks").textContent), acts);
  });
  // GAME MOMENTS (crunchyCore MOMENTS.md step 2): a card's "Game moment" opens the core's modal with this effect in its
  // slot; another app's planted sound and hit look (put on the disk as CrunchySFX and CrunchyShader would) appear after
  // "Look again"; Save plants crunchy/moments/<slug>/<slug>.tscn with res:// paths to all three, the node's script once
  // as a support file, and suite links; a second "Hit" never overwrites the first; deleting the effect is stopped by the
  // removal guard, which names the moment's scene.
  const momWav = function () {
    const n = 2205, b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer), w = function (o, t) { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 6000), true);
    return b;
  };
  const momSide = function (dir, slug, d) { M.put(dir + "/" + slug + "/" + slug + ".crunchy", JSON.stringify(Object.assign({ format: "crunchy-asset", version: 1, appVersion: "", hash: "2:1111111111111111", created: "2026-10-24T00:00:00.000Z", modified: "2026-10-24T00:00:00.000Z" }, d))); };
  await t("moments/a-card-opens-the-modal-and-save-plants-the-moment", async function () {
    momSide(GODOT + "/crunchy/sfx", "boom", { app: "crunchysfx", suite: "sfx", kind: "sound", name: "Boom", s: "x", wav: "boom.wav", files: ["boom.wav"] });
    M.put(GODOT + "/crunchy/sfx/boom/boom.wav", momWav());
    momSide(GODOT + "/crunchy/shader", "hit-flash", { app: "crunchyshader", suite: "shader", kind: "effect", name: "Hit flash", e: "hitflash", p: {}, files: ["hitflash.gdshader", "hitflash.tres"] });
    M.put(GODOT + "/crunchy/shader/hit-flash/hitflash.gdshader", "shader_type canvas_item;\n");
    M.put(GODOT + "/crunchy/shader/hit-flash/hitflash.tres", "[gd_resource type=\"ShaderMaterial\" format=3]\n");
    cardButton("Explosion", "Game moment").click();
    const ov = function () { return document.querySelector(".mom-overlay"); };
    await wait(function () { return ov() && ov().querySelector("select[data-slot=effect]") && ov().querySelector("select[data-slot=sound]").options.length > 1; });
    const sel = function (slot) { return ov().querySelector("select[data-slot=" + slot + "]"); };
    const fx0 = sel("effect").value;
    const pick = function (slot, v) { const s2 = sel(slot); s2.value = v; s2.dispatchEvent(new Event("change")); };
    pick("sound", "sfx/boom"); pick("look", "shader/hit-flash");
    const btn = function (text) { return Array.from(ov().querySelectorAll("button")).find(function (b) { return b.textContent === text; }); };
    btn("Save to my game").click();
    const scene = GODOT + "/crunchy/moments/hit/hit.tscn";
    await wait(function () { return !!M.text(scene); });
    const tscn = M.text(scene) || "", side2 = JSON.parse(M.text(GODOT + "/crunchy/moments/hit/hit.crunchy") || "null");
    const script = M.text(GODOT + "/crunchy/moments/scripts/crunchy_moment.gd") || "";
    const fxFile = (sidecar("explosion").files.find(function (f) { return /\.tscn$/.test(f); }) || "");
    const want = ['path="res://crunchy/vfx/explosion/' + fxFile + '"', 'path="res://crunchy/sfx/boom/boom.wav"', 'path="res://crunchy/shader/hit-flash/hitflash.tres"',
                  'path="res://crunchy/moments/scripts/crunchy_moment.gd"'];
    const said = Array.from(ov().querySelectorAll(".mom-say")).map(function (e) { return e.textContent; }).join(" | ");
    // a SECOND moment named Hit: a new modal, the same name, saves as "Hit 2"
    btn("Cancel").click();
    cardButton("Explosion", "Game moment").click();
    await wait(function () { return ov() && sel("sound") && sel("sound").options.length > 1; });
    Array.from(ov().querySelectorAll("button")).find(function (b) { return b.textContent === "Save to my game"; }).click();
    await wait(function () { return !!M.text(GODOT + "/crunchy/moments/hit-2/hit-2.tscn"); });
    const second = !!M.text(GODOT + "/crunchy/moments/hit-2/hit-2.tscn") && M.text(scene) === tscn;
    Array.from(ov().querySelectorAll("button")).find(function (b) { return b.textContent === "Cancel"; }).click();
    return ok(fx0 === "vfx/explosion" && fxFile && want.every(function (w) { return tscn.indexOf(w) >= 0; }) && /class_name CrunchyMoment/.test(script) &&
              side2 && side2.app === "crunchymoments" && side2.kind === "moment" && side2.links.length === 3 && side2.links.every(function (l) { return l.mode === "reference"; }) &&
              /play_at/.test(said) && !/Couldn't read|No effect/.test(said) && second && !ov(),
      "effect " + fx0 + " · " + want.filter(function (w) { return tscn.indexOf(w) < 0; }).join(" ") + " · links " + (side2 && side2.links.length) + " · " + said + " · second " + second);
  });
  // STEP 3 (AJ, 2026-10-25: "Make one in…" opens the free web app, which has no Library): a CrunchySFX link and a
  // CrunchyShader link pasted into the slots are rendered here and written INTO the moment's own folder; the scene points
  // at them; the moment keeps both links; a paste that is not a link is refused and changes nothing.
  await t("moments/share-links-from-the-web-apps-render-into-the-moment", async function () {
    const sfx = "https://crunchysfx.com/?s=" + btoa(JSON.stringify({ v: 1, s: { duration: 0.25 }, t: "Zap" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const shd = "https://crunchyshader.com/?e=hitflash&n=Bright%20flash";
    cardButton("Explosion", "Game moment").click();
    const ov = function () { return document.querySelector(".mom-overlay"); };
    await wait(function () { return ov() && ov().querySelector('[data-link="sound"]'); });
    const paste = async function (slot, v) { const li = ov().querySelector('[data-link="' + slot + '"]'); li.value = v; ov().querySelector('[data-use="' + slot + '"]').click(); await settle(); await wait(function () { return true; }, 60); };
    await paste("sound", "not a link at all");
    const refused = /Sound: /.test(ov().querySelector(".mom-say:last-child").textContent) && ov().querySelector('select[data-slot="sound"]').value !== "link";
    await paste("sound", sfx);
    await paste("look", shd);
    const snd = ov().querySelector('select[data-slot="sound"]'), lk = ov().querySelector('select[data-slot="look"]');
    const shown = snd.value === "link" && /Zap/.test(snd.selectedOptions[0].textContent) && lk.value === "link" && /Bright flash/.test(lk.selectedOptions[0].textContent);
    const nm = ov().querySelector(".mom-top input[type=text]"); nm.value = "Linked"; nm.dispatchEvent(new Event("input"));
    Array.from(ov().querySelectorAll("button")).find(function (b) { return b.textContent === "Save to my game"; }).click();
    const dir = GODOT + "/crunchy/moments/linked/";
    await wait(function () { return !!M.text(dir + "linked.tscn"); });
    const tscn = M.text(dir + "linked.tscn") || "", tres = M.text(dir + "hitflash.tres") || "", side3 = JSON.parse(M.text(dir + "linked.crunchy") || "null");
    const wav = M.bytes(dir + "linked_sound.wav"), readme = M.text(dir + "README.txt") || "";
    Array.from(ov().querySelectorAll("button")).find(function (b) { return b.textContent === "Cancel"; }).click();
    return ok(refused && shown && wav && wav.length > 1000 && String.fromCharCode(wav[0], wav[1], wav[2], wav[3]) === "RIFF" &&
              tscn.indexOf('path="res://crunchy/moments/linked/linked_sound.wav"') >= 0 && tscn.indexOf('path="res://crunchy/moments/linked/hitflash.tres"') >= 0 &&
              tres.indexOf('path="res://crunchy/moments/linked/hitflash.gdshader"') >= 0 && !!M.text(dir + "hitflash.gdshader") &&
              side3 && side3.m.sound_link === sfx && side3.m.look_link === shd && side3.files.indexOf("linked_sound.wav") >= 0 &&
              // moments.js 3: a README for THIS moment (its node, its parts, what the target needs) and a PascalCase node
              readme.indexOf("$Linked.play_at(enemy)") >= 0 && /Zap \(from a share link\)/.test(readme) && /Camera2D/.test(readme) &&
              side3.files.indexOf("README.txt") >= 0 && tscn.indexOf('[node name="Linked"') >= 0,
      "refused " + refused + " · shown " + shown + " · wav " + (wav && wav.length) + " · " + tscn.split("\n").filter(function (l) { return /ext_resource/.test(l); }).join(" | "));
  });
  // AJ, 2026-10-25: "a tab for effects and exported game moments ... so the user can go back and tweak their game moment"
  await t("moments/the-library-has-a-game-moments-tab-whose-cards-reopen-and-delete-them", async function () {
    library.refresh();
    await wait(function () { return !!lib().querySelector('.lib-tab[data-tab="moments"]'); });
    const tabs = Array.from(lib().querySelectorAll(".lib-tab")).map(function (b) { return b.textContent; }).join(" | ");
    lib().querySelector('.lib-tab[data-tab="moments"]').click();
    await wait(function () { return !!card("Linked"); });
    const onlyMoments = !card("Explosion") && !!card("Hit") && !!card("Linked");
    const badges = Array.from(card("Linked").querySelectorAll(".lib-badge")).map(function (b) { return b.textContent; }).join(" ");
    const noEffectButtons = !cardButton("Linked", "Replace") && !cardButton("Linked", "Duplicate") && !cardButton("Linked", "Game moment");
    cardButton("Linked", "Edit").click();
    const ov = function () { return document.querySelector(".mom-overlay"); };
    await wait(function () { return ov() && ov().querySelector('select[data-slot="look"]') && ov().querySelector('select[data-slot="look"]').value === "link"; });
    const reopened = !!ov() && /Game moment: Linked/.test(ov().querySelector(".set-title").textContent) && ov().querySelector('select[data-slot="sound"]').value === "link";
    Array.from(ov().querySelectorAll("button")).find(function (b) { return b.textContent === "Cancel"; }).click();
    await twice("Linked", "Delete");
    await settle(); await wait(function () { return !card("Linked"); });
    const gone = !card("Linked") && !M.text(GODOT + "/crunchy/moments/linked/linked.tscn") && !!M.text(GODOT + "/crunchy/moments/scripts/crunchy_moment.gd");
    lib().querySelector('.lib-tab[data-tab="effects"]').click();
    await wait(function () { return !!card("Explosion"); });
    return ok(/Effects/.test(tabs) && /Game moments/.test(tabs) && onlyMoments && /Explosion/.test(badges) && /hit look/.test(badges) && noEffectButtons && reopened && gone && !!card("Explosion"),
      tabs + " · only " + onlyMoments + " · " + badges + " · reopened " + reopened + " · gone " + gone + " · " + status());
  });
  await t("moments/deleting-a-piece-a-moment-uses-is-stopped-and-names-it", async function () {
    library.refresh();
    await wait(function () { return !!cardButton("Explosion", "Delete"); });
    await twice("Explosion", "Delete");
    await wait(function () { return /hit\.tscn|moments/.test(status()) || !!document.querySelector(".lib-ask"); });
    const ask = document.querySelector(".lib-ask"), text = (ask ? ask.textContent : "") + " " + status();
    if (ask) { const no = ask.querySelector("[data-act=no]"); if (no) no.click(); }
    await settle();
    return ok(/the game moment “Hit”/.test(text) && !!M.text(ROOT + "/explosion/explosion.crunchy"), text.slice(0, 200));
  });
  await t("update/a-changed-export-is-marked-and-update-all-fixes-it", async function () {
    const d = sidecar("explosion"), png = M.bytes(ROOT + "/explosion/explosion.png");
    d.hash = "2:0000000000000000";                                   // as if an older CrunchyVFX had exported it
    M.put(ROOT + "/explosion/explosion.crunchy", JSON.stringify(d));
    await projDo(function () { return projOpen(GODOT); });
    await settle();
    await projCheckUpdates();
    const badge = Array.from(card("Explosion").querySelectorAll(".lib-badge.hot")).some(function (b) { return /update available/.test(b.textContent); });
    const others = lib().querySelectorAll(".lib-badge.hot").length === 1;
    const btn = libButton("Update all (1)");
    const screen = encodePatch("x");
    await press(btn);
    await projCheckUpdates();
    const fixed = sidecar("explosion").hash === plantHash(sidecar("explosion").files.map(function (p) { return { path: p, data: M.bytes(ROOT + "/explosion/" + p) }; })) &&
      !card("Explosion").querySelector(".lib-badge.hot") && !libButton("Update all (1)");
    return ok(badge && others && btn && fixed && same(M.bytes(ROOT + "/explosion/explosion.png"), png) && encodePatch("x") === screen, status());
  });
  await t("card/re-export-shows-only-with-an-update", async function () {
    const before = !cardButton("Explosion", "Re-export");
    const d = sidecar("explosion");
    d.hash = "2:0000000000000000";
    M.put(ROOT + "/explosion/explosion.crunchy", JSON.stringify(d));
    await projDo(function () { return projOpen(GODOT); });
    await settle();
    await projCheckUpdates();
    const shownNow = !!cardButton("Explosion", "Re-export");
    M.put(ROOT + "/explosion/explosion.png", new Uint8Array([1, 2, 3]));     // a file someone broke by hand, too
    await press(cardButton("Explosion", "Re-export"));
    await projCheckUpdates();
    return ok(before && shownNow && M.bytes(ROOT + "/explosion/explosion.png").length > 100 && /Re-exported Explosion in place/.test(status()) &&
              !cardButton("Explosion", "Re-export"), status());
  });
  await t("card/replace-puts-the-editor-effect-into-the-card", async function () {
    applyPreset(PRESETS["Frost Growth"] || PRESETS[Object.keys(PRESETS)[20]], "Something else", true);
    setExp({ meta: "godot", trim: true });
    const was = sidecar("explosion"), ex = await exportNow("explosion");
    const armed = await twice("Explosion", "Replace");
    const now = sidecar("explosion");
    return ok(armed && now.name === "Explosion" && now.created === was.created && JSON.stringify(now.files) === JSON.stringify(was.files) &&
              ex.every(function (f) { return same(M.bytes(ROOT + "/explosion/" + f.name), f.data); }) && decodePatch(now.s).n === "Explosion" &&
              projOpened === "explosion" && /Replaced Explosion/.test(status()), status());
  });
  await t("open/a-card-reopens-the-effect-exactly", async function () {
    applyPreset(PRESETS[Object.keys(PRESETS)[7]], "Elsewhere", true);
    fitOn = false; updateFitBtn();
    setExp({ meta: "phaser", trim: false, scales: [2] });
    card("Sparks").querySelector(".lib-pic").click();
    await settle();
    const d = sidecar("sparks");
    return ok(encodePatch("Sparks") === d.s && effectLabel === "Sparks" && fitOn === true && expLayout.value === "row" && expEmis.checked &&
              chosenScales().join() === "1,2" && synthSound && synthSound.name === "Spark sound" && document.getElementById("plantName").value === "Sparks" &&
              projOpened === "sparks", status());
  });
  await t("open/save-again-keeps-the-same-files-byte-for-byte", async function () {
    const before = {};
    sidecar("sparks").files.forEach(function (f) { before[f] = M.bytes(ROOT + "/sparks/" + f); });
    await press(document.getElementById("plantSave"));
    const d = sidecar("sparks");
    stopSound(); snd.buf = null; synthSound = null; syncSoundUI();
    return ok(Object.keys(before).every(function (f) { return same(before[f], M.bytes(ROOT + "/sparks/" + f)); }) && d.files.length === Object.keys(before).length, status());
  });
  await t("rename/the-name-only-the-paths-and-bytes-stay", async function () {
    const png = M.bytes(ROOT + "/explosion/explosion.png"), tres = M.text(ROOT + "/explosion/explosion.tres");
    const c = card("Explosion");
    c.querySelector(".lib-name").dispatchEvent(new MouseEvent("dblclick"));
    const input = c.querySelector(".lib-rename");
    input.value = "Big boom";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await settle();
    const d = sidecar("explosion");
    return ok(d.name === "Big boom" && d.exportName === "Explosion" && d.base === "explosion" && same(M.bytes(ROOT + "/explosion/explosion.png"), png) &&
              M.text(ROOT + "/explosion/explosion.tres") === tres && card("Big boom") && !card("Explosion") && !M.list(ROOT + "/big-boom").length, status());
  });
  await t("duplicate/a-copy-in-its-own-folder", async function () {
    await press(cardButton("Big boom", "Duplicate"));
    const d = sidecar("big-boom-copy");
    return ok(d && d.name === "Big boom copy" && d.base === "big-boom-copy" && M.bytes(ROOT + "/big-boom-copy/big-boom-copy.png") &&
              /path="big-boom-copy\.png"/.test(M.text(ROOT + "/big-boom-copy/big-boom-copy.tres")) && sidecar("explosion").name === "Big boom", status());
  });
  await t("delete/two-clicks-remove-its-files-godot-import-and-folder-nothing-else", async function () {
    M.put(ROOT + "/big-boom-copy/big-boom-copy.png.import", "[remap]\n");     // Godot's own, made on import
    M.put(ROOT + "/sparks/notes.txt", "mine");                               // a person's file in ANOTHER effect's folder
    const armed = await twice("Big boom copy", "Delete");
    return ok(armed && !M.list(ROOT + "/big-boom-copy").length && !M.dirs.has(ROOT + "/big-boom-copy") && !card("Big boom copy") &&
              M.text(ROOT + "/sparks/notes.txt") === "mine" && sidecar("explosion"), M.list(ROOT + "/big-boom-copy").join(","));
  });
  await t("delete/a-person's-file-keeps-the-folder", async function () {
    const armed = await twice("Sparks", "Delete");
    const left = M.list(ROOT + "/sparks/");
    M.files.delete(ROOT + "/sparks/notes.txt");
    return ok(armed && left.join(",") === ROOT + "/sparks/notes.txt" && !card("Sparks"), left.join(","));
  });

  // ---- My Effects: copied in, never moved ----
  await t("my-effects/plant-my-effects-copies-them-and-the-browser-store-is-byte-identical", async function () {
    const before = JSON.stringify(store());
    await press(libButton("Plant my effects (6)"));
    const mine = project.assets.filter(function (a) { return /^my-effects:/.test(a.data.from || ""); });
    const after = store();
    delete after[PLANT_RECENT_KEY];
    const was = JSON.parse(before); delete was[PLANT_RECENT_KEY];
    return ok(mine.length === 6 && JSON.stringify(after) === JSON.stringify(was) && legacyNow() === atBoot && userEffects.length === 6 &&
              plantFind(project, "effect", "Boom keep 2") && plantFind(project, "effect", "Feu ✨ 日本") && /exactly as it was/.test(status()), status());
  });
  await t("my-effects/a-planted-effect-renders-what-my-effects-does-image-sprite-and-all", async function () {
    const bad = [];
    for (const it of userEffects) {
      const a = project.assets.find(function (x) { return x.data.from === "my-effects:" + it.id; });
      applyPreset(it.state, it.name, true);
      if (it.state.imageSprite) { await spriteReady(it.state.imageSprite); rerender(); }
      const ex = await exportNow(a.data.base);
      if (!ex.every(function (f) { return same(M.bytes(ROOT + "/" + a.slug + "/" + f.name), f.data); })) bad.push(it.name);
    }
    applyPreset(PRESETS["Explosion"], "Explosion", true);
    await projCheckUpdates();
    return ok(!bad.length && !Object.keys(projUpdates).length, bad.join(", ") + " | " + Object.keys(projUpdates).join(","));
  });
  await t("my-effects/the-categories-make-chips-and-headings", function () {
    return ok(lib().querySelector('.lib-chip[data-kind="Hits"]') && /Hits \(2\)/.test(lib().textContent));
  });
  await t("my-effects/a-second-plant-adds-nothing", function () {
    return ok(!libButton(/^Plant my effects/) && projFromBrowser().length === 0);
  });
  await t("project-file/plant-a-crunchyvfx-file-untouched", async function () {
    M.put("/home/aj/old.crunchyvfx", V.project.file);
    M.answer("/home/aj/old.crunchyvfx");
    const n = project.assets.length;
    await press(libButton("Plant a project file…"));
    const from = project.assets.filter(function (a) { return /^file:old\.crunchyvfx#/.test(a.data.from || ""); });
    return ok(from.length === V.project.effects && project.assets.length === n + V.project.effects && M.text("/home/aj/old.crunchyvfx") === V.project.file &&
              legacyNow() === atBoot, status());
  });

  // ---- VFX's own "Imports & history" (was its Library) ----
  await t("imports-history/opens-from-the-toolbar-and-the-panel-and-still-works", async function () {
    await press(libButton("Imports & history…"));
    const m = ihModal, fromPanel = shown(m) && /Imports & history/.test(m.querySelector("h2").textContent);
    ihModal.hidden = true;
    document.getElementById("ihBtn").click();
    const sprites = m.querySelectorAll("#ihSprites .ih-sprite").length, exps = m.querySelectorAll("#ihExports .ih-exp").length;
    m.querySelector(".ih-exp-load").click();
    const back = frames(rendered.canvases) === V.localStorage.exportFrames[0] && effectLabel === "Shipped once" && m.hidden;
    return ok(fromPanel && sprites === 1 && exps === 2 && back && !m.querySelector(".lib-title"), sprites + " " + exps);
  });

  // ---- the suite view, an adopted web zip, other engines ----
  await t("suite/no-suite-section-in-the-library", async function () {
    M.put(GODOT + "/crunchy/tile/meadow/meadow.crunchy", JSON.stringify({ format: "crunchy-asset", kind: "design", name: "Meadow", files: ["meadow.png"] }));
    M.put(GODOT + "/crunchy/sfx/coin/coin.crunchy", JSON.stringify({ format: "crunchy-asset", kind: "sound", name: "Coin", files: ["coin.wav"] }));
    M.put(GODOT + "/crunchy/sfx/zap/zap.crunchy", JSON.stringify({ format: "crunchy-asset", kind: "sound", name: "Zap", files: ["zap.wav"] }));
    await projRefreshSuite();
    await settle();
    // library.js 5 (AJ, 2026-10-22: it "takes up half the panel, and I don't think it's necessary"): the section that
    // listed the other Crunchy tools' assets here is gone. The assets above stay seeded: later rows check they're untouched.
    return ok(!lib().querySelector(".lib-suite, .lib-suite-row") && !/Also in this game/.test(lib().textContent), "the suite section is still drawn");
  });
  await t("web-zip/the-export-zip-carries-a-sidecar-and-adopts-as-current", async function () {
    applyPreset(PRESETS["Hit Spark"], "Zip spark", true);
    setExp({ meta: "godot", trim: true });
    const keepDl = download, keepZip = makeZip;
    let list = null, name = "";
    makeZip = function (l) { list = l; return keepZip(l); };
    download = function (b, n) { name = n; };
    const keepLog = localStorage.getItem("crunchyvfx.exports.v1"), keepEx = exportLog.slice(), keepSeq = exSeq;
    try { expModal.querySelector("#expGo").click(); await wait(function () { return !!name; }, 8000); } finally { download = keepDl; makeZip = keepZip; }
    const recorded = exportLog.length === keepEx.length + 1 && exportLog[0].name === "Zip spark";     // Imports & history noted it, as before
    exportLog = keepEx; exSeq = keepSeq; localStorage.setItem("crunchyvfx.exports.v1", keepLog);
    const sc = list && list.find(function (f) { return /\.crunchy$/.test(f.name); });
    const d = sc && JSON.parse(new TextDecoder().decode(sc.data));
    // adopt it: the zip's files dropped into crunchy/vfx/zip-spark/, the sidecar renamed for the folder
    list.forEach(function (f) { M.put(ROOT + "/zip-spark/" + (/\.crunchy$/.test(f.name) ? "zip-spark.crunchy" : f.name), f.data); });
    await projDo(function () { return projOpen(GODOT); });
    await settle();
    await projCheckUpdates();
    return ok(recorded && name === "zip-spark.zip" && sc.name === "zip-spark.crunchy" && d.s === encodePatch("Zip spark") && d.files.join() === "zip-spark.png,zip-spark.tres,zip-spark.gd,zip-spark.tscn,README.txt" &&   // §26: the ready scene rides in the zip
              card("Zip spark") && !projUpdates["zip-spark"] && !project.skipped.length, (list || []).map(function (f) { return f.name; }).join(","));
  });
  await t("web-zip/the-batch-and-variation-packs-carry-sidecars", async function () {
    const keepDl = download, keepZip = makeZip, got = [];
    makeZip = function (l) { got.push(l); return keepZip(l); };
    download = function () {};
    const keepUser = userEffects;
    try {
      userEffects = userEffects.slice(0, 2);
      await batchExport("mine");
      document.getElementById("variations").click();
      await wait(function () { return varGenomes && varGenomes.length; });
      varModal.querySelector("#varExport").click();
      await wait(function () { return got.length === 2; }, 15000);
      varModal.hidden = true; clearMinis(varGrid);
    } finally { download = keepDl; makeZip = keepZip; userEffects = keepUser; }
    const batch = got[0].map(function (f) { return f.name; }), vars = got[1] ? got[1].map(function (f) { return f.name; }) : [];
    const bs = batch.filter(function (n) { return /\.crunchy$/.test(n); }), vs = vars.filter(function (n) { return /\.crunchy$/.test(n); });
    return ok(bs.length === 2 && bs.every(function (n) { const p = n.split("/"); return p.length === 2 && p[1] === p[0] + ".crunchy"; }) &&
              vs.length === varGenomes.length && vs.every(function (n) { return vars.indexOf(n.replace(/\.crunchy$/, ".png")) >= 0; }) &&
              legacyNow() === atBoot, bs.join(",") + " | " + vs.slice(0, 2).join(","));
  });
  await t("unity/plants-into-assets-crunchy-vfx-with-plain-files", async function () {
    await press(libButton("Close"));
    M.answer(UNITY);
    await press(libButton("Plant in a folder…"));
    applyPreset(PRESETS["Explosion"], "Explosion", true);
    setExp({ meta: "godot", trim: true });                          // a .tres means nothing to Unity: Generic JSON instead
    await press(document.getElementById("plantSave"));
    const d = side(UNITY + "/Assets/Crunchy/VFX", "explosion"), ex = await exportNow("explosion");
    const files = M.list(UNITY + "/Assets/Crunchy/VFX/explosion/");
    return ok(project.engine === "unity" && project.rel === "Assets/Crunchy/VFX" && d && d.exp.meta === "generic" &&
              files.join(",") === [UNITY + "/Assets/Crunchy/VFX/explosion/explosion.crunchy", UNITY + "/Assets/Crunchy/VFX/explosion/explosion.json", UNITY + "/Assets/Crunchy/VFX/explosion/explosion.png"].join(",") &&
              ex.every(function (f) { return same(M.bytes(UNITY + "/Assets/Crunchy/VFX/explosion/" + f.name), f.data); }) &&
              !M.list(UNITY + "/crunchy").length, files.join(","));
  });
  await t("unity/the-panel-says-how-to-slice-it", async function () {
    await projDo(function () { return projOpen(UNITY); });
    return ok(/Sprite Mode to Multiple/.test(status()), status());
  });
  await t("plain/any-folder-works-with-the-dialogs-metadata", async function () {
    await press(libButton("Close"));
    M.answer(PLAIN);
    await press(libButton("Plant in a folder…"));
    applyPreset(PRESETS["Explosion"], "Explosion", true);
    setExp({ meta: "aseprite", trim: false });
    await press(document.getElementById("plantSave"));
    const d = side(PLAIN + "/crunchy/vfx", "explosion");
    return ok(project.engine === "plain" && d && d.exp.meta === "aseprite" && M.bytes(PLAIN + "/crunchy/vfx/explosion/explosion.json"), status());
  });
  await t("recent/reopens-and-a-gone-one-is-forgotten", async function () {
    await press(libButton("Close"));
    const rec = Array.from(lib().querySelectorAll(".lib-recent")).map(function (b) { return b.querySelector(".lib-path").textContent; });
    const r = JSON.parse(localStorage.getItem(PLANT_RECENT_KEY));
    r.push({ name: "gone", dir: "/home/aj/gone" });
    localStorage.setItem(PLANT_RECENT_KEY, JSON.stringify(r));
    library.refresh();
    const goneBtn = Array.from(lib().querySelectorAll(".lib-recent")).find(function (b) { return /gone/.test(b.textContent); });
    await press(goneBtn);
    const forgot = !projRecent().some(function (e) { return e.dir === "/home/aj/gone"; }) && /gone/.test(status());
    const g = Array.from(lib().querySelectorAll(".lib-recent")).find(function (b) { return b.querySelector(".lib-path").textContent === GODOT; });
    await press(g);
    return ok(rec[0] === PLAIN && rec.indexOf(GODOT) >= 0 && forgot && project && project.dir === GODOT, rec.join(","));
  });
  await t("close/save-current-is-my-effects-again", async function () {
    await press(libButton("Close"));
    const keep = localStorage.getItem("crunchyvfx.userpresets.v1"), n = userEffects.length;
    applyPreset(PRESETS["Explosion"], "After close", true);
    document.getElementById("mpSave").click();
    const r = userEffects.length === n + 1 && userEffects[0].name === "After close";
    userEffects.shift(); upSeq--; localStorage.setItem("crunchyvfx.userpresets.v1", keep); renderMyEffects();   // put the store back
    return ok(r && legacyNow() === atBoot);
  });

  // ---- HEAD's other saved things still open ----
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
  await t("legacy/a-head-crunchyvfx-file-opens-as-it-did", async function () {
    const keepE = localStorage.getItem("crunchyvfx.userpresets.v1"), keepC = localStorage.getItem("crunchyvfx.usercats.v1"), keepS = localStorage.getItem("crunchyvfx.sprites.v1");
    const keepU = userEffects, keepCats = userCats, keepSp = userSprites;
    M.put("/home/aj/old.crunchyvfx", V.project.file);
    M.answer("/home/aj/old.crunchyvfx");
    document.getElementById("projOpen").click();
    await wait(function () { return effectLabel === V.project.label; }, 6000);
    const r = frames(rendered.canvases) === V.project.editorFrames && userEffects.length === V.project.effects;
    localStorage.setItem("crunchyvfx.userpresets.v1", keepE); localStorage.setItem("crunchyvfx.usercats.v1", keepC); localStorage.setItem("crunchyvfx.sprites.v1", keepS);
    userEffects = keepU; userCats = keepCats; userSprites = keepSp; renderMyEffects();
    return ok(r && legacyNow() === atBoot, effectLabel);
  });
  await t("legacy/a-head-my-effects-json-imports", async function () {
    const keepE = localStorage.getItem("crunchyvfx.userpresets.v1"), keepU = userEffects.slice(), keepSeq = upSeq;   // a copy: the import unshifts in place
    const dt = new DataTransfer();
    dt.items.add(new File([V.effectsFile.file], "crunchyvfx-effects.json", { type: "application/json" }));
    mpFile.files = dt.files;
    mpFile.dispatchEvent(new Event("change"));
    await wait(function () { return userEffects.length === keepU.length + 6; });
    const r = userEffects.length === keepU.length + 6 && /Imported 6 effects/.test(msg.textContent);
    localStorage.setItem("crunchyvfx.userpresets.v1", keepE); userEffects = keepU; upSeq = keepSeq; renderMyEffects();
    return ok(r && legacyNow() === atBoot, msg.textContent);
  });

  // ---- SUITE LINKS (SUITE-LINKS.md §4): a sound CrunchySFX planted in the same game ----
  // A real 16-bit mono WAV of n samples, as CrunchySFX would plant one (its sidecar too), written straight to the disk
  const wavBytes = function (n) {
    const b = new DataView(new ArrayBuffer(44 + n * 2)), w = function (o, t) { for (let i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); };
    w(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, 22050, true); b.setUint32(28, 44100, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, "data"); b.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.round(8000 * Math.sin(i / 8)), true);
    return new Uint8Array(b.buffer);
  };
  const SFX = GODOT + "/crunchy/sfx/boom";
  const plantSfx = function (n) {
    const wv = wavBytes(n);
    M.put(SFX + "/boom.wav", wv);
    M.put(SFX + "/boom.crunchy", JSON.stringify({ format: "crunchy-asset", version: 1, app: "crunchysfx", suite: "sfx", kind: "sound", name: "Boom", s: "boom",
      files: ["boom.wav"], hash: plantHash([{ path: "boom.wav", data: wv }]), created: "2026-10-12T00:00:00Z", modified: "2026-10-12T00:00:00Z" }));
  };
  await t("link/the-picker-lists-the-sounds-crunchysfx-planted-here", async function () {
    if (!project || project.dir !== GODOT) await projDo(function () { return projOpen(GODOT); });
    plantSfx(11025);
    await projSoundsRefresh();
    const sel = document.getElementById("sndGame");
    return ok(!sel.hidden && !sel.disabled && Array.from(sel.options).some(function (o) { return o.value === "boom" && o.textContent === "Boom"; }), sel.outerHTML.slice(0, 200));
  });
  await t("link/picking-one-links-it-and-the-preview-plays-it", async function () {
    applyPreset(PRESETS["Explosion"], "Fireball", true);
    const sel = document.getElementById("sndGame");
    sel.value = "boom"; sel.dispatchEvent(new Event("change"));
    await settle(); await wait(function () { return !!soundLink; }, 4000);
    return ok(soundLink && soundLink.suite === "sfx" && soundLink.slug === "boom" && soundLink.file === "boom.wav" && soundLink.mode === "reference" &&
              snd.buf && Math.abs(snd.buf.duration - 0.5) < 0.02 && /Boom \(CrunchySFX\)/.test(snd.name) && !synthSound, status());
  });
  await t("link/saved-the-scene-plays-the-sfx-wav-on-the-impact-frame-and-nothing-is-copied", async function () {
    const f = document.getElementById("sndFrame");
    f.value = "3"; f.dispatchEvent(new Event("change"));
    document.getElementById("plantName").value = "Fireball";
    await press(document.getElementById("plantSave"));
    await wait(function () { return !!sidecar("fireball"); }, 4000);
    const d = sidecar("fireball"), tscn = M.text(ROOT + "/fireball/fireball.tscn") || "";
    return ok(d && d.links && d.links[0].slug === "boom" && d.soundFrame === 3 && soundFrame === 3 &&
              /\[ext_resource type="AudioStream" path="res:\/\/crunchy\/sfx\/boom\/boom\.wav" id="3"\]/.test(tscn) && /sound_frame = 3/.test(tscn) &&
              /impact_frame = 3\n/.test(tscn) &&                       // §26: a set Impact frame is the scene's impact signal too
              /type="AudioStreamPlayer2D"/.test(tscn) && !M.list(ROOT + "/fireball/").some(function (p) { return /\.wav$/.test(p); }) &&
              Array.from(card("Fireball").querySelectorAll(".lib-badge")).some(function (b) { return /♪ Boom/.test(b.textContent); }), tscn.slice(0, 300) + " " + status());
  });
  await t("link/a-replace-in-sfx-reaches-the-game-with-nothing-re-exported", async function () {
    const scene = M.text(ROOT + "/fireball/fireball.tscn");
    plantSfx(22050);                                                 // CrunchySFX replaced "Boom" in place
    const a = project.assets.find(function (x) { return x.slug === "fireball"; });
    await projCheckOne(a);
    return ok(M.text(ROOT + "/fireball/fireball.tscn") === scene && !projUpdates.fireball && projLinkStates.fireball === "ok");
  });
  await t("link/reopening-the-effect-brings-its-linked-sound-and-impact-frame-back", async function () {
    applyPreset(PRESETS["Hit Spark"], "Other", true);
    stopSound(); snd.buf = null; synthSound = null; soundLink = null; soundFrame = 0; syncSoundUI();
    projOpenAsset(plantFind(project, "effect", "Fireball"));
    await settle(); await wait(function () { return !!soundLink; }, 4000);
    return ok(soundLink && soundLink.slug === "boom" && soundFrame === 3 && document.getElementById("sndFrame").value === "3" &&
              snd.buf && Math.abs(snd.buf.duration - 1) < 0.02, status());
  });
  await t("link/a-synthesized-or-cleared-sound-drops-the-link", function () {
    synthesizePatch({}, "Own");
    const synthDrops = soundLink === null;
    soundLink = plantLinks(plantFind(project, "effect", "Fireball"))[0];
    document.getElementById("sndClear").click();
    return ok(synthDrops && soundLink === null);
  });
  await t("link/the-sound-gone-from-sfx-shows-missing-and-the-next-save-leaves-it-out", async function () {
    M.files.delete(SFX + "/boom.wav"); M.files.delete(SFX + "/boom.crunchy");
    const a = project.assets.find(function (x) { return x.slug === "fireball"; });
    await projCheckOne(a); library.refresh();
    const missing = projLinkStates.fireball === "missing" &&
      Array.from(card("Fireball").querySelectorAll(".lib-badge.hot")).some(function (b) { return /linked sound missing/.test(b.textContent); });
    await twice("Fireball", "Re-export");
    await wait(function () { return !/AudioStreamPlayer2D/.test(M.text(ROOT + "/fireball/fireball.tscn") || "x"); }, 4000);
    return ok(missing && !/AudioStreamPlayer2D/.test(M.text(ROOT + "/fireball/fireball.tscn")) && /sprite_frames/.test(M.text(ROOT + "/fireball/fireball.tscn")), status());
  });
  await t("link/cleanup", async function () {
    await projDo(async function () { await plantDelete(project, plantFind(project, "effect", "Fireball")); });
    soundFrame = 0; document.getElementById("sndFrame").value = "0";
    projAfter(); await settle();
    return ok(!sidecar("fireball"));
  });

  // ---- safety ----
  // crunchyCore plant.js 4 (the guard): a delete whose files a SCENE uses says so by name, and deletes on the next press
  await t("guard/a-delete-whose-files-a-scene-uses-asks-first", async function () {
    if (!project) await projDo(function () { return projOpen(GODOT); });
    if (!library.isOpen()) library.open();
    const s0 = lib().querySelector(".lib-search"); if (s0 && s0.value) { s0.value = ""; s0.dispatchEvent(new Event("input")); }
    const a = project.assets.find(function (x) { return x.data.files.length > 0 && card(x.name); });
    if (!a) return ok(false, "no planted asset with files on screen");
    const scene = GODOT + "/scenes/uses-" + a.slug + ".tscn";
    M.put(scene, 'path="res://' + project.rel + "/" + a.slug + "/" + a.data.files[0] + '"');
    const msg = function () { const s = lib().querySelector(".lib-status"); return (s ? s.textContent : "") + " " + status(); };
    const press = async function () { await twice(a.name, "Delete"); await settle(); };
    await press(); await wait(function () { return /Press again to delete/.test(msg()); }, 3000);
    const held = !!sidecar(a.slug) && /Press again to delete/.test(msg()) && msg().indexOf("uses-" + a.slug + ".tscn") >= 0;
    await press(); await wait(function () { return !sidecar(a.slug) && !card(a.name); }, 3000);
    M.files.delete(scene);
    return ok(held && !sidecar(a.slug) && !card(a.name), msg());
  });
  await t("safety/nothing-written-outside-crunchy-vfx", function () {
    // (+ crunchy/moments/: a GAME MOMENT is the suite's, not VFX's, and lives there by design: crunchyCore MOMENTS.md)
    const allowed = [ROOT + "/", GODOT + "/crunchy/moments/", UNITY + "/Assets/Crunchy/VFX/", PLAIN + "/crunchy/vfx/", "/home/aj/old.crunchyvfx"];
    const bad = writes().map(function (l) { return l.replace(/^(w|rm|rmdir) /, ""); })
      .filter(function (p) { return !allowed.some(function (a) { return p.indexOf(a) === 0 || p === a.replace(/\/$/, ""); }); });
    return ok(!bad.length, bad.slice(0, 4).join(" "));
  });
  await t("safety/the-game-and-the-other-tools-untouched", function () {
    return ok(M.text(GODOT + "/project.godot") === "config_version=5\n" &&
              !writes().some(function (l) { return /\/crunchy\/(tile|sfx)\//.test(l); }));
  });
  await t("safety/the-legacy-keys-are-all-there-unchanged", function () {
    const now = store(), was = JSON.parse(storeAtBoot);
    const changed = Object.keys(was).filter(function (k) { return now[k] !== was[k]; });
    // the two preferences the Settings test toggled and put back, written again by the app in its own shape
    return ok(legacyNow() === atBoot && changed.every(function (k) { return k === "crunchyvfx.lockpixels.v1" || k === "crunchyvfx.dock.v1"; }) &&
              // the export dialog's remembered settings (2026-10-13) are a new key of their own, never a legacy one rewritten
              Object.keys(now).every(function (k) { return k in was || k === PLANT_RECENT_KEY || k === EXP_PREF; }), changed.join(",") + " | " + Object.keys(now).join(","));
  });
  await t("words/no-pro-premium-or-unlock-in-the-library-or-settings", function () {
    library.open();
    settingsDialog.open();
    const text = [lib(), document.getElementById("libDock"), document.getElementById("setModal"),
      // §22: the old toolbar's buttons are the header's globals, the editor's generators and the stage column's ways out
      document.querySelector("header"), document.getElementById("genbar"), document.getElementById("stageCol")].map(function (e) {
      return e.innerText + " " + Array.from(e.querySelectorAll("[title], [placeholder]")).map(function (x) { return (x.title || "") + " " + (x.placeholder || ""); }).join(" ");
    }).join(" ");
    settingsDialog.close();
    const bad = text.match(/\b(pro|premium|unlock(ed|s)?)\b/gi);
    return ok(!bad, bad ? bad.join(",") : "");
  });
  await t("safety/no-page-errors", function () { return ok(!M.errors.length, M.errors.slice(0, 3).join(" | ")); });

  // ?show: end with the docked Library open over the planted Godot folder, to LOOK at it
  const showIt = /show/.test(location.search);
  if (showIt) {
    await projDo(function () { return projOpen(GODOT); });
    applyPreset(PRESETS["Explosion"], "Big boom", true);
    library.open();
    await projRefreshSuite();
    const d = sidecar("explosion");
    M.put(ROOT + "/explosion/explosion.crunchy", JSON.stringify(Object.assign(d, { hash: "2:0" })));
    await projDo(function () { return projOpen(GODOT); });
    await settle();
    await projCheckUpdates();
    await projRefreshSuite();
  } else library.close();

  // ---- report ----
  scrollTo(0, 0);
  const failed = rows.filter(function (r) { return !r.pass; });
  const b = document.createElement("div");
  b.id = "dombanner";
  b.style.cssText = "position:fixed;left:0;top:0;z-index:99999;max-height:100vh;overflow:auto;padding:8px 12px;font:12px ui-monospace,monospace;white-space:pre-wrap;" +
    (showIt && !failed.length ? "right:auto;" : "right:0;") + "background:" + (failed.length ? "#4d1418;color:#ffb3b8" : "#12441f;color:#9ff5b6");
  b.textContent = (failed.length ? "FAIL" : "PASS") + " · desktop suite · " + (rows.length - failed.length) + "/" + rows.length +
    (showIt && !failed.length ? "" : "\n" + (failed.length ? failed : rows).map(function (r) { return (r.pass ? "ok   " : "FAIL ") + r.name + (r.detail ? " — " + r.detail : ""); }).join("\n"));
  document.body.appendChild(b);
  document.title = "SHOWN";
  say("END " + (failed.length ? "FAIL" : "PASS") + " " + (rows.length - failed.length) + "/" + rows.length);
})();

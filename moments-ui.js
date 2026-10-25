// GENERATED from crunchyCore/moments-ui.js @ 093dad2 by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 9c3610cd69fa1a44e0183589993e71ae78a8cc6fa7aca6f161107000a2905fa6
"use strict";
// crunchyCore — THE GAME MOMENT MODAL (MOMENTS.md step 2; AJ 2026-10-24: "we'd need a modal ... the library panel is
// pretty small"). Opened from an app's Library ("Game moment" on a card): a STAGE with a target and the moment played
// over it, SLOTS for the effect (CrunchyVFX), the sound (CrunchySFX) and the hit look (CrunchyShader) filled from what
// is planted in this game, the feel (shake, hit stop, delays, wait for the impact) and Save, which plants the moment
// (moments.js momentSave). The preview is drawn FROM THE EXPORTED FILES (the effect's PNG and SpriteFrames, the WAV, the
// shader run by crunchyCore's own engine when it is loaded), so what you see is what ships.
//   momentOpen({ P, from: { slot, suite, slug }, name, existing: <a planted moment>, onSaved(asset), openApp(key) })
// DOM only inside functions (a DOM component like library.js). Styles: the `.mom-*` block in crunchy-base.css.

const MOMENTS_UI_BUILD = 1;

function momentOpen(o) {
  o = o || {};
  const P = o.P, el = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let m = momentClean(Object.assign({}, MOMENT_TEMPLATES.hit, o.existing ? o.existing.data.m : {}));
  if (o.from && MOMENT_SLOTS[o.from.slot]) m[o.from.slot] = { suite: o.from.suite, slug: o.from.slug };
  let pieces = { effect: [], sound: [], look: [] }, stage = null, raf = 0, audio = null, closed = false;
  const cache = {};                                                   // what the stage loaded, by suite/slug
  let loadErr = "";                                                   // why a piece could not be read (said under the stage)

  // ---- the frame ----------------------------------------------------------------------------------------------------
  const root = el("div", "set-overlay mom-overlay"), panel = el("div", "set-panel mom-panel");
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
  const head = el("div", "mom-head"), title = el("h2", "set-title", o.existing ? "Game moment: " + o.existing.name : "New game moment");
  const close = el("button", "set-close", "×");
  close.type = "button"; close.title = "Close (nothing is saved)";
  head.append(title, close);
  const top = el("div", "mom-top"), tplSel = el("select"), nameIn = el("input");
  for (const k of Object.keys(MOMENT_TEMPLATES)) { const op = el("option", "", MOMENT_TEMPLATES[k].label); op.value = k; tplSel.append(op); }
  tplSel.value = m.template;
  nameIn.type = "text"; nameIn.value = o.existing ? o.existing.name : o.name || "Hit"; nameIn.maxLength = 60;
  const lab = (t, c, tip) => { const l = el("label", "mom-lab"); l.append(t + " ", c); if (tip) l.title = tip; return l; };
  top.append(lab("Template", tplSel, "Starts the feel from a kind of moment (the slots stay yours)"), lab("Name", nameIn, "What it is called in your game: crunchy/moments/<name>/"));
  const body = el("div", "mom-body"), left = el("div", "mom-stage"), right = el("div", "mom-slots");
  const canvas = el("canvas", "mom-canvas"), ctl = el("div", "mom-ctl"), play = el("button", "primary", "Play"), loop = el("label", "mom-lab");
  const loopBox = el("input"); loopBox.type = "checkbox"; loop.append(loopBox, " Loop");
  const say = el("div", "mom-say"), note = el("div", "mom-say");     // say: what happened (saved, errors); note: about the preview
  canvas.width = 160; canvas.height = 112;
  ctl.append(play, loop);
  left.append(canvas, ctl, note, say);
  body.append(left, right);
  const feel = el("div", "mom-feel");
  const acts = el("div", "mom-acts"), cancel = el("button", "", "Cancel"), save = el("button", "primary", "Save to my game");
  cancel.type = save.type = play.type = "button";
  acts.append(cancel, save);
  panel.append(head, top, body, feel, acts);
  root.append(panel);
  document.body.append(root);

  // ---- the slots ----------------------------------------------------------------------------------------------------
  const web = (key) => { const t = typeof CRUNCHY_SUITE !== "undefined" ? CRUNCHY_SUITE.find((x) => x.id === key) : null; return t ? t.web : ""; };
  function fillSlots() {
    right.textContent = "";
    for (const slot of Object.keys(MOMENT_SLOTS)) {
      const S = MOMENT_SLOTS[slot], box = el("div", "mom-slot"), h = el("h3", "", S.label), sel = el("select");
      sel.dataset.slot = slot;
      const none = el("option", "", "None"); none.value = ""; sel.append(none);
      for (const p of pieces[slot]) { const op = el("option", "", p.name); op.value = p.suite + "/" + p.slug; sel.append(op); }
      sel.value = m[slot] ? m[slot].suite + "/" + m[slot].slug : "";
      if (m[slot] && sel.value === "") { const gone = el("option", "", "(missing: " + m[slot].slug + ")"); gone.value = m[slot].suite + "/" + m[slot].slug; sel.append(gone); sel.value = gone.value; }
      sel.addEventListener("change", () => { const v = sel.value.split("/"); m[slot] = v[0] ? { suite: v[0], slug: v[1] } : null; replay(); });
      box.append(h, sel);
      const more = el("div", "mom-more");
      if (!pieces[slot].length) more.append(el("span", "", "Nothing from " + S.app + " in this game yet. "));
      const make = el("button", "", "Make one in " + S.app);
      make.type = "button";
      make.title = "Open " + S.app + " (the desktop app if you have it, else its free website); save into this same game and it shows up here";
      make.addEventListener("click", () => { if (o.openApp) o.openApp(S.suite === "items" ? "items" : S.suite); else if (web(S.suite)) window.open(web(S.suite), "_blank", "noopener"); });
      more.append(make);
      if (slot === "look") {
        const st = el("input"); st.type = "text"; st.placeholder = "or a States name (hit)"; st.value = m.look_state; st.maxLength = 40;
        st.title = "A target wearing a CrunchyShader combo with states: flash this state instead of wearing a material";
        st.addEventListener("change", () => { m.look_state = st.value.trim(); replay(); });
        more.append(st);
      }
      box.append(more);
      right.append(box);
    }
    const again = el("button", "mom-rescan", "Look again");
    again.type = "button"; again.title = "Read what this game holds again (after saving something in another app)";
    again.addEventListener("click", rescan);
    right.append(again);
  }
  // ---- the feel -----------------------------------------------------------------------------------------------------
  function fillFeel() {
    feel.textContent = "";
    const num = (k, label, step, max, tip, unit) => {
      const i = el("input"); i.type = "number"; i.min = "0"; i.max = String(max); i.step = String(step); i.value = String(m[k]);
      i.addEventListener("change", () => { m = momentClean(Object.assign(m, { [k]: +i.value })); i.value = String(m[k]); replay(); });
      const l = lab(label, i, tip); if (unit) l.append(" " + unit); feel.append(l);
    };
    num("shake_px", "Shake", 1, 32, "How far the camera shakes", "px");
    num("shake_seconds", "for", 0.05, 3, "How long it shakes", "s");
    num("hit_stop_frames", "Hit stop", 1, 60, "How many frames the game freezes for (at 60 a second)", "frames");
    num("look_seconds", "Hit look", 0.05, 3, "How long the target wears its hit look", "s");
    const imp = el("input"); imp.type = "checkbox"; imp.checked = m.on_impact;
    imp.addEventListener("change", () => { m.on_impact = imp.checked; replay(); });
    const il = lab("", imp, "Everything else waits for the effect's impact frame (its brightest), so it lands with the hit");
    il.append("Wait for the impact"); feel.append(il);
    const dl = el("div", "mom-delays");
    dl.append(el("span", "mom-dl", "Delays after it:"));
    for (const [k, t] of [["sound_delay", "sound"], ["look_delay", "look"], ["shake_delay", "shake"], ["stop_delay", "stop"]]) {
      const i = el("input"); i.type = "number"; i.min = "0"; i.max = "5"; i.step = "0.05"; i.value = String(m[k]);
      i.addEventListener("change", () => { m = momentClean(Object.assign(m, { [k]: +i.value })); i.value = String(m[k]); replay(); });
      dl.append(lab(t, i));
    }
    feel.append(dl);
  }
  tplSel.addEventListener("change", () => {
    const t = MOMENT_TEMPLATES[tplSel.value];
    m = momentClean(Object.assign(m, t, { template: tplSel.value }));
    if (!o.existing && (!nameIn.value || Object.keys(MOMENT_TEMPLATES).some((k) => MOMENT_TEMPLATES[k].label === nameIn.value))) nameIn.value = t.label;
    fillFeel(); replay();
  });

  // ---- loading what the stage plays, from the exported files --------------------------------------------------------
  const piece = (slot) => m[slot] && pieces[slot].find((p) => p.suite === m[slot].suite && p.slug === m[slot].slug);
  const bytes = async (path) => {
    const at = plantJoin(P.dir, path);
    return P.fs.readFile ? new Uint8Array(await P.fs.readFile(at)) : null;
  };
  // (each load is cached as its PROMISE: a second replay while the first is still loading waits for the same load)
  function loadEffect(p) {
    const key = "fx:" + p.slug + ":" + p.hash;
    if (!cache[key]) cache[key] = readEffect(p);
    return cache[key];
  }
  async function readEffect(p) {
    try {
      const dir = p.path.slice(0, p.path.lastIndexOf("/")), tres = p.files.find((f) => /\.tres$/i.test(f)), png = p.files.find((f) => /\.png$/i.test(f) && !/emissive/i.test(f));
      const fr = momentFrames(await P.fs.readTextFile(plantJoin(P.dir, dir, tres)));
      const impact = momentImpactFrame(await P.fs.readTextFile(plantJoin(P.dir, p.path)));
      const b = await bytes(plantJoin(dir, png));
      const img = b ? await createImageBitmap(new Blob([b], { type: "image/png" })) : null;
      if (img && fr.regions.length) return { img: img, regions: fr.regions, fps: fr.fps || 12, impact: Math.min(impact, fr.regions.length - 1) };
      loadErr = "Couldn't read " + p.name + "'s frames (" + (img ? "no regions in " + tres : "no picture") + ").";
    } catch (e) { loadErr = "Couldn't read " + p.name + ": " + (e && e.message || e); }
    return null;
  }
  function loadSound(p) {
    const key = "snd:" + p.slug + ":" + p.hash;
    if (!cache[key]) cache[key] = (async function () {
      try {
        const b = await bytes(p.path), AC = window.AudioContext || window.webkitAudioContext;
        if (b && AC) { audio = audio || new AC(); return await audio.decodeAudioData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
      } catch (e) { /* no sound in the preview; the game still gets it */ }
      return null;
    })();
    return cache[key];
  }
  // the hit look: the target run through the shader engine, frame by frame (or, without the engine, a plain white flash)
  function lookFrames(p, target) {
    const key = "look:" + p.slug + ":" + p.hash;
    if (cache[key] !== undefined) return cache[key];
    cache[key] = null;
    try {
      if (typeof shaderRun === "function" && typeof SHADER_DEFS !== "undefined" && SHADER_DEFS[p.d.e]) {
        const def = shaderDef(p.d.e), prm = shaderParams(def, p.d.p || {}), img = typeof shaderPad === "function" ? shaderPad(target, def.pad || [0, 0, 0, 0]) : target;
        const n = Math.max(1, Math.min(def.frames || 1, 16)), frames = [];
        for (let f = 0; f < n; f++) { const r = shaderRun(p.d.e, img, f, prm); frames.push(toCanvas(r.rgba ? r : { w: img.w, h: img.h, rgba: r }, img.w, img.h)); }
        cache[key] = { frames: frames, fps: prm.fps || 12, pad: def.pad || [0, 0, 0, 0], real: true };
      }
    } catch (e) { cache[key] = null; }
    return cache[key];
  }
  function toCanvas(r, w, h) {
    const c = document.createElement("canvas"); c.width = r.w || w; c.height = r.h || h;
    const id = new ImageData(new Uint8ClampedArray(r.rgba), c.width, c.height); c.getContext("2d").putImageData(id, 0, 0); return c;
  }
  const target = momentTargetImage(), targetCanvas = toCanvas(target, target.w, target.h);
  const flash = (function () { const c = toCanvas(target, target.w, target.h), g = c.getContext("2d"); g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); return c; })();

  // ---- the stage: the moment on a game clock that a hit stop really stops ----------------------------------------------
  async function replay() {
    if (closed) return;
    cancelAnimationFrame(raf);
    const fxP = piece("effect"), sndP = piece("sound"), lookP = piece("look");
    const fx = fxP ? await loadEffect(fxP) : null, snd = sndP ? await loadSound(sndP) : null, look = lookP ? lookFrames(lookP, target) : null;
    const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, tx = Math.round(W / 2 - target.w / 2), ty = H - 20 - target.h;
    const impactT = m.on_impact && fx ? fx.impact / fx.fps : 0, fxDur = fx ? fx.regions.length / fx.fps : 0;
    const stopT = impactT + m.stop_delay, stopDur = m.hit_stop_frames / 60, lookT = impactT + m.look_delay, shakeT = impactT + m.shake_delay;
    const end = Math.max(fxDur, (m.look || m.look_state ? lookT + m.look_seconds : 0), shakeT + (m.shake_px ? m.shake_seconds : 0), snd ? impactT + m.sound_delay + snd.duration : 0, stopT + stopDur) + 0.25;
    let soundStarted = false, last = performance.now(), game = 0, real = 0, stopAt = -1;
    note.textContent = (fx ? "" : fxP ? (loadErr || "Couldn't read " + fxP.name + ". ") + " " : "No effect: pick one. ") + (lookP && !(look && look.real) ? "The hit look previews as a plain flash here (this app does not carry CrunchyShader's engine); your game shows the real one." : "");
    const frame = (now) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now; real += dt;   // (a frame's stamp can precede the start)
      // the game clock: when it reaches the hit stop it stands still for the stop's length in REAL time, then goes on
      if (m.hit_stop_frames > 0 && stopAt < 0 && game >= stopT) stopAt = real;
      if (!(stopAt >= 0 && real - stopAt < stopDur)) game += dt;
      if (snd && !soundStarted && game >= impactT + m.sound_delay) { soundStarted = true; try { const s = audio.createBufferSource(); s.buffer = snd; s.connect(audio.destination); s.start(); } catch (e) { /* no audio here */ } }
      g.fillStyle = "#16141c"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#24212c"; g.fillRect(0, H - 20, W, 20);
      let sx = 0, sy = 0;
      if (m.shake_px && game >= shakeT && game < shakeT + m.shake_seconds) {
        const k = 1 - (game - shakeT) / m.shake_seconds;
        sx = Math.round((Math.random() * 2 - 1) * m.shake_px * k); sy = Math.round((Math.random() * 2 - 1) * m.shake_px * k);
      }
      g.save(); g.translate(sx, sy); g.imageSmoothingEnabled = false;
      const inLook = (m.look || m.look_state) && game >= lookT && game < lookT + m.look_seconds;
      if (inLook && look && look.real) {
        const f = Math.min(look.frames.length - 1, Math.floor(((game - lookT) / m.look_seconds) * look.frames.length));
        g.drawImage(look.frames[f], tx - look.pad[3], ty - look.pad[0]);
      } else g.drawImage(inLook ? flash : targetCanvas, tx, ty);
      if (fx && game < fxDur) {
        const r = fx.regions[Math.min(fx.regions.length - 1, Math.floor(game * fx.fps))];
        g.drawImage(fx.img, r.x, r.y, r.w, r.h, Math.round(W / 2 - r.w / 2), Math.round(ty + target.h / 2 - r.h / 2), r.w, r.h);
      }
      g.restore();
      if (game < end) raf = requestAnimationFrame(frame);
      else if (loopBox.checked && !closed) setTimeout(replay, 300);
    };
    raf = requestAnimationFrame(frame);
  }
  play.addEventListener("click", replay);

  // ---- open, look again, save, close ---------------------------------------------------------------------------------
  async function rescan() {
    try { pieces = await momentPieces(P); }
    catch (e) { pieces = { effect: [], sound: [], look: [] }; say.textContent = "Couldn't read what this game holds: " + (e && e.message || e); }
    fillSlots(); replay();
  }
  const onFocus = () => { if (!closed) rescan(); };
  window.addEventListener("focus", onFocus);
  function done() { closed = true; cancelAnimationFrame(raf); window.removeEventListener("focus", onFocus); root.remove(); }
  close.addEventListener("click", done); cancel.addEventListener("click", done);
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(); } });
  save.addEventListener("click", async () => {
    const name = nameIn.value.trim();
    if (!name) { say.textContent = "A moment needs a name."; nameIn.focus(); return; }
    save.disabled = true;
    try {
      const M = await plantOpenAs(P, MOMENT_APP);
      // SAVE NEVER OVERWRITES: a new moment takes a free name; only the one being edited is written over
      const nm = o.existing && o.existing.name.toLowerCase() === name.toLowerCase() ? o.existing.name : plantFreeName(M, "moment", name);
      const a = await momentSave(P, nm, m, pieces);
      say.textContent = "Saved: crunchy/moments/" + a.slug + "/" + a.slug + ".tscn. In your game: $" + nm.replace(/[^A-Za-z0-9_]/g, "") + ".play_at($Enemy)";
      if (o.onSaved) o.onSaved(a);
      o.existing = a; title.textContent = "Game moment: " + a.name; nameIn.value = a.name;
    } catch (e) { say.textContent = String(e && e.message || e); }
    save.disabled = false;
  });
  if (P && P.engine === "unity") { save.disabled = true; say.textContent = MOMENT_GODOT_ONLY; }
  fillFeel();
  rescan();
  nameIn.focus();
  return { close: done, root: root, state: () => m };
}

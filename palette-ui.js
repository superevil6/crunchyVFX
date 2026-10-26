// GENERATED from crunchyCore/palette-ui.js @ d44feaf by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 8acad1be450a8b23c3a1fc10f7bbf5d6b3b33b04758d3f44dcd9c4335c475610
"use strict";
// crunchyCore — THE PALETTE EDITOR (PALETTES.md step 1; the moment window's shape). One window for the whole suite:
// each RAMP a row of swatches (light → dark), a click opens the SYSTEM'S OWN color picker (a real <input type="color">,
// with the OS eyedropper where it has one), a hex box for the chosen color; add, remove, drag to reorder within a ramp
// or into another (or the move buttons and Alt + arrow keys, for a keyboard); add, rename, reverse or delete a ramp;
// import a file, a paste or a picture (each grouped into ramps by palette.js); the starters; a preview (each ramp
// shading a ball, and the host app's own picture snapped to the palette); Save. Every ramp can be saved as a COLOR SET
// of its own, and the window opens on a single set (one row: kind "set") to make or edit one (AJ, 2026-10-25).
//   paletteOpen({ P, existing, palette, kind, name, onSaved(palette, asset), preview(palette) → ImageData | null })
//     P          the app's handle on a planted game (desktop): Save PLANTS the palette (palette.js paletteSave) and the
//                files land beside it; none (the web): Save hands the palette to onSaved, and the app keeps it
//     existing   a planted palette or color set to edit (Save updates it in place; a new name renames it, never moving files)
//     palette    a palette (or a set: kind "set") to start from (else the first starter, or its first ramp for a set)
//     kind       "set": open on a new color set (one row) when no palette or existing is given
//     onSaved    also gets each ramp saved as a color set (its palette.kind is "set")
//     preview    the host app's picture in this palette, redrawn as the palette changes (null: none)
//   → { close(), root, state() → the palette as it stands }
// DOM only inside functions (a DOM component like moments-ui.js). Styles: the `.pal-*` block in crunchy-base.css.

const PALETTE_UI_BUILD = 2;   // 2: on the web the set editor no longer says "every app planted in this game" (there is no game)

function paletteOpen(o) {
  o = o || {};
  const P = o.P || null, el = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = function (label, icon, tip, cls) { const b = el("button", cls || "", label); b.type = "button"; if (icon) b.dataset.icon = icon; if (tip) b.title = tip; return b; };
  // THE WORKING PALETTE: like the model, but a ramp may be empty while you work (Save drops it)
  const copy = function (p) { return { kind: p.kind, name: p.name, ramps: p.ramps.map(function (r) { return { name: r.name, colors: r.colors.slice() }; }) }; };
  const first = paletteStarter(PALETTE_STARTERS[0].name);
  const start = (o.existing && palettePlanted(o.existing)) || (o.palette && paletteClean(o.palette)) || (o.kind === "set" ? paletteSetOf(first, 0) : first);
  // SET MODE: one row, named by the Name box; no ramps to add, group or delete
  const setMode = start.kind === "set", noun = setMode ? "color set" : "palette", plantKind = setMode ? "colorset" : "palette";
  let pal = copy(start), sel = paletteCount(pal) ? { r: 0, i: 0 } : null, closed = false, drag = null;
  pal.kind = start.kind;
  const undo = [];
  const snap = function () { undo.push(JSON.stringify({ pal: pal, sel: sel })); if (undo.length > 60) undo.shift(); };

  // ---- the frame ----------------------------------------------------------------------------------------------------
  const root = el("div", "set-overlay pal-overlay"), panel = el("div", "set-panel pal-panel");
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", setMode ? "Color set editor" : "Palette editor");
  if (setMode) root.classList.add("pal-setmode");
  const head = el("div", "pal-head"), title = el("h2", "set-title", (setMode ? "Color set" : "Palette") + (o.existing ? ": " + o.existing.name : ""));
  const close = el("button", "set-close", "×");
  close.type = "button"; close.title = "Close (nothing is saved)";
  head.append(title, close);
  // the top row: the name, a starter, the imports
  const top = el("div", "pal-top"), nameIn = el("input"), starter = el("select");
  nameIn.type = "text"; nameIn.maxLength = PALETTE_NAME_MAX; nameIn.value = o.existing ? o.existing.name : o.name || pal.name;
  const lab = function (t, c, tip) { const l = el("label", "pal-lab"); l.append(t + " ", c); if (tip) l.title = tip; return l; };
  const none = el("option", "", "Start from…"); none.value = ""; starter.append(none);
  // (a set starts from any starter's ramp: "Ember dungeon · Torch")
  if (setMode) PALETTE_STARTERS.forEach(function (s) {
    const og = el("optgroup"); og.label = s.name + " (" + (s.credit === PALETTE_OURS ? "ours, CC0" : "hardware") + ")";
    s.ramps.forEach(function (r, k) { const op = el("option", "", r.name + " (" + r.colors.length + ")"); op.value = s.name + "\n" + k; og.append(op); });
    starter.append(og);
  });
  else [["Ours (CC0)", PALETTE_OURS], ["Hardware", PALETTE_HARDWARE]].forEach(function (g) {
    const og = el("optgroup"); og.label = g[0];
    PALETTE_STARTERS.filter(function (s) { return s.credit === g[1]; }).forEach(function (s) { const op = el("option", "", s.name + " (" + paletteCount(s) + ")"); op.value = s.name; og.append(op); });
    starter.append(og);
  });
  starter.title = "Start again from one of these (Undo brings yours back). Ours are the Crunchy suite's own, CC0; hardware palettes are the colors a machine had";
  const fileIn = el("input"), imgIn = el("input"), imgN = el("input"), addBox = el("input");
  fileIn.type = imgIn.type = "file"; fileIn.hidden = imgIn.hidden = true;
  fileIn.accept = ".hex,.gpl,.txt,.pal,text/plain"; imgIn.accept = "image/*";
  imgN.type = "number"; imgN.min = "2"; imgN.max = "64"; imgN.value = "16"; imgN.className = "pal-n";
  addBox.type = "checkbox";
  const openFile = btn("Open file", "upload", "A palette file: .hex (Lospec), .gpl (GIMP, Aseprite, Krita), .pal (JASC) or .txt (paint.net)");
  const fromImg = btn("From a picture", "image", "The colors a picture uses (up to the number beside it)" + (setMode ? ", light to dark" : ", grouped into ramps"));
  const pasteB = btn("Paste", "copy", "Paste hex codes (#1a1c2c, …), a palette file's text, or a Crunchy palette string");
  const addLab = lab("", addBox, "Imports ADD to the colors here instead of replacing them"); addLab.append("Add to these");
  const nLab = lab("", imgN, "How many colors to take from a picture"); nLab.append("colors");
  imgN.value = setMode ? "6" : "16";
  top.append(lab("Name", nameIn, "What the " + noun + " is called" + (P ? ": crunchy/palettes/<name>/ in your game" : "")), lab("", starter), openFile, fromImg, nLab, pasteB, addLab, fileIn, imgIn);
  // the paste box (shown on Paste)
  const pasteBox = el("div", "pal-paste"), pasteText = el("textarea"), pasteUse = btn("Use these", "", "", "primary"), pasteNo = btn("Cancel");
  pasteText.rows = 3; pasteText.placeholder = "#1a1c2c #5d275d #b13e53 … or a .gpl / .hex file's text";
  pasteBox.hidden = true; pasteBox.append(pasteText, pasteUse, pasteNo);
  // the body: the ramps (left) and the chosen color + preview (right), each column in its own box, scrolling on its own
  const body = el("div", "pal-body"), left = el("div", "pal-ramps"), right = el("div", "pal-side");
  body.append(left, right);
  const say = el("div", "pal-say");
  const acts = el("div", "pal-acts"), exHex = btn(".hex", "download", "Download the palette as a .hex file (one color a line: Lospec, Aseprite)"),
    exGpl = btn(".gpl", "download", "Download the palette as a .gpl file (GIMP, Aseprite, Krita), its ramps kept"), gap = el("span", "pal-gap"),
    cancel = btn("Cancel"), save = btn(P ? "Save to my game" : "Save", "save", P ? "Plants it in your game: crunchy/palettes/<name>/ with .hex, .gpl and a Godot .tres beside it" : "Keeps the " + noun, "primary");
  if (P) acts.append(el("span", "pal-note", "Saving writes .hex, .gpl" + (P.engine === "unity" ? "" : " and a Godot .tres") + " beside it."));
  else acts.append(exHex, exGpl);
  acts.append(gap, cancel, save);
  panel.append(head, top, pasteBox, body, say, acts);
  root.append(panel);
  document.body.append(root);

  // ---- the ramps ----------------------------------------------------------------------------------------------------------
  const at = function (s) { return s && pal.ramps[s.r] && pal.ramps[s.r].colors[s.i]; };
  function changed(keepSay) { if (!keepSay) say.textContent = ""; render(); }
  function render() {
    const focused = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("pal-sw");
    if (sel && !at(sel)) sel = null;
    left.textContent = "";
    const info = el("div", "pal-info", setMode ? "A color set: " + paletteCount(pal) + " colors, light to dark." + (o.P ? " Every app planted in this game can use it." : " Kept in this app; your share links carry it.")
      : paletteCount(pal) + " colors in " + pal.ramps.length + " ramp" + (pal.ramps.length === 1 ? "" : "s") + ", each light to dark");
    left.append(info);
    pal.ramps.forEach(function (r, ri) {
      const box = el("div", "pal-ramp"), rh = el("div", "pal-rhead"), rn = el("input"), row = el("div", "pal-row");
      box.dataset.r = String(ri);
      rn.type = "text"; rn.value = r.name; rn.maxLength = PALETTE_NAME_MAX; rn.className = "pal-rname"; rn.setAttribute("aria-label", "Ramp name");
      rn.addEventListener("change", function () { snap(); r.name = paletteCleanName(rn.value, "Ramp " + (ri + 1)); rn.value = r.name; });
      const rev = btn("", "swap", "Reverse this ramp (light → dark becomes dark → light)", "pal-icon"), del = btn("", "trash", "Delete this ramp and its colors", "pal-icon");
      rev.setAttribute("aria-label", "Reverse " + r.name); del.setAttribute("aria-label", "Delete " + r.name);
      rev.addEventListener("click", function () { snap(); r.colors.reverse(); if (sel && sel.r === ri) sel.i = r.colors.length - 1 - sel.i; changed(); });
      del.addEventListener("click", function () { snap(); pal.ramps.splice(ri, 1); if (sel && sel.r === ri) sel = null; else if (sel && sel.r > ri) sel.r--; changed(); say.textContent = "Deleted the ramp “" + r.name + "” (Undo brings it back)."; });
      // SAVE AS A COLOR SET: this ramp on its own, named for it (a set is first-class: every app can pick it)
      const asSet = btn("Save as a color set", "save", "Keep this ramp as a color set of its own" + (P ? ", planted in your game beside the palettes" : ""), "pal-asset");
      asSet.addEventListener("click", function () { saveSet(ri, asSet); });
      if (setMode) rh.append(el("span", "pal-rcount", r.colors.length + " colors"), rev);
      else rh.append(rn, el("span", "pal-rcount", String(r.colors.length)), asSet, rev, del);
      r.colors.forEach(function (c, i) {
        const sw = el("button", "pal-sw" + (sel && sel.r === ri && sel.i === i ? " on" : ""));
        sw.type = "button"; sw.style.background = c; sw.draggable = true; sw.dataset.r = String(ri); sw.dataset.i = String(i);
        sw.title = c + " (click: pick a color; drag to move; Alt + arrows move it)";
        sw.setAttribute("aria-label", "Color " + c + ", " + (i + 1) + " of " + r.colors.length + " in " + r.name);
        sw.addEventListener("click", function () { sel = { r: ri, i: i }; render(); pickNow(); });
        sw.addEventListener("keydown", function (e) { swKey(e, ri, i); });
        sw.addEventListener("dragstart", function (e) { drag = { r: ri, i: i }; sw.classList.add("drag"); try { e.dataTransfer.setData("text/plain", c); e.dataTransfer.effectAllowed = "move"; } catch (err) { /* old engines */ } });
        sw.addEventListener("dragend", function () { drag = null; clearMarks(); render(); });
        row.append(sw);
      });
      const add = btn("", "plus", "Add a color to this ramp (a copy of its last, then pick)", "pal-add");
      add.setAttribute("aria-label", "Add a color to " + r.name);
      add.addEventListener("click", function () {
        snap(); const c = r.colors.length ? r.colors[r.colors.length - 1] : "#808080";
        r.colors.push(c); sel = { r: ri, i: r.colors.length - 1 }; changed(); pickNow();
      });
      row.append(add);
      if (!r.colors.length) row.append(el("span", "pal-empty", "Empty: drag colors here or press +"));
      // DROPPING: before the swatch under the pointer, or at the end of the row
      row.addEventListener("dragover", function (e) { if (!drag) return; e.preventDefault(); mark(row, dropIndex(row, e.clientX)); });
      row.addEventListener("dragleave", function (e) { if (!row.contains(e.relatedTarget)) clearMarks(); });
      row.addEventListener("drop", function (e) { if (!drag) return; e.preventDefault(); const to = dropIndex(row, e.clientX); clearMarks(); moveTo(drag, ri, to); drag = null; });
      box.append(rh, row);
      left.append(box);
    });
    const tools = el("div", "pal-tools"), addR = btn("Add a ramp", "plus"), regroup = btn("Group again", "layers", "Sort every color into ramps again by hue: families, grays their own ramp, light to dark"),
      und = btn("Undo", "undo", "Undo the last change (Ctrl+Z)");
    und.disabled = !undo.length;
    addR.addEventListener("click", function () { snap(); pal.ramps.push({ name: "Ramp " + (pal.ramps.length + 1), colors: [] }); changed(); });
    regroup.addEventListener("click", function () { snap(); pal.ramps = paletteGroup(paletteFlat(pal)); sel = null; changed(); });
    und.addEventListener("click", doUndo);
    if (setMode) tools.append(und); else tools.append(addR, regroup, und);
    left.append(tools);
    renderSide();
    if (typeof crunchyIconsApply === "function") crunchyIconsApply(panel);
    if (focused && sel) { const f = left.querySelector('.pal-sw[data-r="' + sel.r + '"][data-i="' + sel.i + '"]'); if (f) f.focus(); }
    schedulePreview();
  }
  function dropIndex(row, x) {
    const sws = Array.prototype.slice.call(row.querySelectorAll(".pal-sw"));
    for (let k = 0; k < sws.length; k++) { const b = sws[k].getBoundingClientRect(); if (x < b.left + b.width / 2) return k; }
    return sws.length;
  }
  function mark(row, k) {
    clearMarks();
    const sws = row.querySelectorAll(".pal-sw");
    if (k < sws.length) sws[k].classList.add("before"); else row.querySelector(".pal-add").classList.add("before");
  }
  function clearMarks() { Array.prototype.forEach.call(left.querySelectorAll(".before"), function (b) { b.classList.remove("before"); }); }
  // MOVE a color from `from` to ramp `r` at index `k` (an index in that ramp as it is BEFORE the move)
  function moveTo(from, r, k) {
    const src = pal.ramps[from.r];
    if (!src || !pal.ramps[r]) return;
    if (from.r === r && (k === from.i || k === from.i + 1)) { sel = { r: from.r, i: from.i }; render(); return; }
    snap();
    const c = src.colors.splice(from.i, 1)[0];
    if (from.r === r && k > from.i) k--;
    pal.ramps[r].colors.splice(k, 0, c);
    sel = { r: r, i: k };
    changed();
    say.textContent = "Moved " + c + (from.r === r ? "." : " to “" + pal.ramps[r].name + "”.");
  }
  // THE KEYBOARD: arrows walk, Alt + arrows move (left/right within the ramp, up/down to the ramp above or below),
  // Delete removes; Enter / Space opens the picker (the button's own click).
  function swKey(e, r, i) {
    const k = e.key, ramp = pal.ramps[r];
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); sel = { r: r, i: i }; removeSel(); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(k) < 0) return;
    e.preventDefault();
    if (e.altKey) {
      if (k === "ArrowLeft" && i > 0) moveTo({ r: r, i: i }, r, i - 1);
      else if (k === "ArrowRight" && i < ramp.colors.length - 1) moveTo({ r: r, i: i }, r, i + 2);
      else if (k === "ArrowUp" && r > 0) moveTo({ r: r, i: i }, r - 1, Math.min(i, pal.ramps[r - 1].colors.length));
      else if (k === "ArrowDown" && r < pal.ramps.length - 1) moveTo({ r: r, i: i }, r + 1, Math.min(i, pal.ramps[r + 1].colors.length));
      focusSel();
      return;
    }
    let t = { r: r, i: i };
    if (k === "ArrowLeft") t.i = Math.max(0, i - 1);
    else if (k === "ArrowRight") t.i = Math.min(ramp.colors.length - 1, i + 1);
    else {
      let rr = r + (k === "ArrowUp" ? -1 : 1);
      while (pal.ramps[rr] && !pal.ramps[rr].colors.length) rr += k === "ArrowUp" ? -1 : 1;
      if (pal.ramps[rr]) t = { r: rr, i: Math.min(i, pal.ramps[rr].colors.length - 1) };
    }
    sel = t; render(); focusSel();
  }
  function focusSel() { if (!sel) return; const f = left.querySelector('.pal-sw[data-r="' + sel.r + '"][data-i="' + sel.i + '"]'); if (f) f.focus(); }
  function removeSel() {
    if (!at(sel)) return;
    snap();
    const c = pal.ramps[sel.r].colors.splice(sel.i, 1)[0], r = pal.ramps[sel.r];
    sel = r.colors.length ? { r: sel.r, i: Math.min(sel.i, r.colors.length - 1) } : null;
    changed(); focusSel();
    say.textContent = "Removed " + c + " (Undo brings it back).";
  }
  function doUndo() {
    const u = undo.pop();
    if (!u) return;
    const s = JSON.parse(u); pal = s.pal; sel = s.sel;
    changed(); say.textContent = "Undone.";
  }

  // ---- the chosen color (right, top) -----------------------------------------------------------------------------------------
  const pickBox = el("div", "pal-pick"), pick = el("input"), hexIn = el("input"), pickHead = el("h3", "", "Color");
  pick.type = "color"; pick.className = "pal-picker"; pick.title = "Pick a color (your system's own picker)";
  hexIn.type = "text"; hexIn.className = "pal-hex"; hexIn.maxLength = 9; hexIn.spellcheck = false; hexIn.setAttribute("aria-label", "Hex color");
  const mvL = btn("←", "", "Move left in its ramp (Alt + Left)", "pal-mv"), mvR = btn("→", "", "Move right in its ramp (Alt + Right)", "pal-mv"),
    mvU = btn("↑", "", "Move to the ramp above (Alt + Up)", "pal-mv"), mvD = btn("↓", "", "Move to the ramp below (Alt + Down)", "pal-mv"),
    rm = btn("Remove", "trash", "Remove this color (Delete)");
  mvL.setAttribute("aria-label", "Move left"); mvR.setAttribute("aria-label", "Move right"); mvU.setAttribute("aria-label", "Move to the ramp above"); mvD.setAttribute("aria-label", "Move to the ramp below");
  const pickRow = el("div", "pal-pickrow"), mvRow = el("div", "pal-mvrow");
  pickRow.append(pick, hexIn);
  if (setMode) mvRow.append(mvL, mvR, rm); else mvRow.append(mvL, mvR, mvU, mvD, rm);
  const pickNote = el("div", "pal-say");
  pickBox.append(pickHead, pickRow, mvRow, pickNote);
  let pickSnapped = false;
  pick.addEventListener("click", function () { pickSnapped = false; });
  pick.addEventListener("input", function () {
    if (!at(sel)) return;
    if (!pickSnapped) { snap(); pickSnapped = true; }
    pal.ramps[sel.r].colors[sel.i] = pick.value.toLowerCase();
    const sw = left.querySelector('.pal-sw[data-r="' + sel.r + '"][data-i="' + sel.i + '"]');
    if (sw) { sw.style.background = pick.value; sw.title = pick.value; }
    hexIn.value = pick.value.toLowerCase(); schedulePreview();
  });
  pick.addEventListener("change", function () { pickSnapped = false; render(); });
  const setHex = function () {
    if (!at(sel)) return;
    const h = paletteHexOf(hexIn.value);
    if (!h) { pickNote.textContent = "“" + hexIn.value + "” isn't a color: type six hex digits, like #3b5dc9."; hexIn.value = at(sel); return; }
    pickNote.textContent = "";
    if (h !== at(sel)) { snap(); pal.ramps[sel.r].colors[sel.i] = h; render(); }
  };
  hexIn.addEventListener("change", setHex);
  hexIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); setHex(); } });
  mvL.addEventListener("click", function () { if (at(sel) && sel.i > 0) moveTo(sel, sel.r, sel.i - 1); });
  mvR.addEventListener("click", function () { if (at(sel) && sel.i < pal.ramps[sel.r].colors.length - 1) moveTo(sel, sel.r, sel.i + 2); });
  mvU.addEventListener("click", function () { if (at(sel) && sel.r > 0) moveTo(sel, sel.r - 1, Math.min(sel.i, pal.ramps[sel.r - 1].colors.length)); });
  mvD.addEventListener("click", function () { if (at(sel) && sel.r < pal.ramps.length - 1) moveTo(sel, sel.r + 1, Math.min(sel.i, pal.ramps[sel.r + 1].colors.length)); });
  rm.addEventListener("click", removeSel);
  // the system picker opens on the swatch's own click (a user gesture, which it needs)
  function pickNow() { if (!at(sel)) return; pick.value = at(sel); pickSnapped = false; try { if (pick.showPicker) pick.showPicker(); else pick.click(); } catch (e) { pick.click(); } }

  // ---- the preview (right, under the color) ------------------------------------------------------------------------------------
  const prevBox = el("div", "pal-prev"), prevHead = el("h3", "", "Preview"), balls = el("canvas", "pal-balls"), host = el("canvas", "pal-host");
  const hostSay = el("div", "pal-info", "Your picture in this palette");
  host.hidden = hostSay.hidden = true;
  prevBox.append(prevHead, balls, hostSay, host);
  function renderSide() {
    right.textContent = "";
    const c = at(sel);
    pick.disabled = hexIn.disabled = rm.disabled = !c;
    mvL.disabled = !c || sel.i === 0; mvR.disabled = !c || sel.i >= pal.ramps[sel.r].colors.length - 1;
    mvU.disabled = !c || sel.r === 0; mvD.disabled = !c || sel.r >= pal.ramps.length - 1;
    pickHead.textContent = c ? "Color " + (sel.i + 1) + " of “" + (setMode ? nameIn.value || "the set" : pal.ramps[sel.r].name) + "”" : "Color";
    if (c) { pick.value = c; hexIn.value = c; } else { hexIn.value = ""; }
    pickNote.textContent = c ? "" : "Click a swatch to change it.";
    right.append(pickBox, prevBox);
  }
  // each ramp shades a ball (fitted to 5 tones, so a 2-color ramp shows its merge and a 12-color one its spread) beside
  // its steps; the host's picture under them. Drawn small and scaled up by CSS, pixels kept square.
  let prevRaf = 0;
  function schedulePreview() { if (prevRaf) return; prevRaf = requestAnimationFrame(function () { prevRaf = 0; drawPreview(); }); }
  const BALL = 14;
  function drawPreview() {
    if (closed) return;
    const ramps = pal.ramps.filter(function (r) { return r.colors.length; }), maxLen = Math.max(1, ...ramps.map(function (r) { return r.colors.length; }));
    const W = BALL + 4 + maxLen * 6, H = Math.max(1, ramps.length) * (BALL + 2);
    balls.width = W; balls.height = H;
    const g = balls.getContext("2d");
    g.fillStyle = "#16141c"; g.fillRect(0, 0, W, H);
    ramps.forEach(function (r, k) {
      const y0 = k * (BALL + 2) + 1, tones = paletteFit(r.colors, 5), R = BALL / 2 - 0.5;
      for (let y = 0; y < BALL; y++) for (let x = 0; x < BALL; x++) {
        const dx = (x + 0.5 - BALL / 2) / R, dy = (y + 0.5 - BALL / 2) / R, d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2), lit = Math.max(0, -0.55 * dx - 0.6 * dy + 0.58 * nz);       // light from the top left
        const t = Math.max(0, Math.min(4, Math.round((1 - lit) * 4.2 - 0.3)));
        g.fillStyle = tones[t]; g.fillRect(x + 1, y0 + y, 1, 1);
      }
      r.colors.forEach(function (c, i) { g.fillStyle = c; g.fillRect(BALL + 4 + i * 6, y0 + 3, 6, BALL - 6); });
    });
    let img = null;
    if (o.preview) { try { img = o.preview(paletteClean(pal)); } catch (e) { img = null; } }
    host.hidden = hostSay.hidden = !img;
    if (img) { host.width = img.width; host.height = img.height; host.getContext("2d").putImageData(img, 0, 0); }
    // whole-number scales (square pixels), as big as the column allows (at most 4x for the balls)
    const avail = Math.max(100, prevBox.clientWidth - 24);
    balls.style.width = W * Math.max(1, Math.min(4, Math.floor(avail / W))) + "px";
    if (img) host.style.width = img.width * Math.max(1, Math.min(8, Math.floor(avail / img.width))) + "px";
  }

  // ---- imports -------------------------------------------------------------------------------------------------------------------
  // a list of colors (or ramps a .gpl of ours carried) in place of the palette, or added to it ("Add to these")
  function take(colors, ramps, name, what) {
    snap();
    if (setMode) {                                                    // a set: every color in one row, in the file's order
      const list = (colors || paletteFlat({ ramps: ramps })).slice(), have = {};
      const all = (addBox.checked ? pal.ramps[0].colors : []).concat(list).filter(function (h) { if (have[h]) return false; have[h] = 1; return true; });
      if (all.length > PALETTE_MAX) { doUndo(); say.textContent = "That would make " + all.length + " colors; a set holds at most " + PALETTE_MAX + "."; return; }
      pal.ramps = [{ name: pal.ramps[0] ? pal.ramps[0].name : name || "Set", colors: all }];
      if (name && !o.existing && !addBox.checked) nameIn.value = name;
      say.textContent = what + ": " + all.length + " colors in the set." + (all.length > 12 ? " A set is usually a few tones of one color: remove the ones you don't need." : "");
      sel = all.length ? { r: 0, i: 0 } : null; starter.value = ""; render();
      return;
    }
    const add = addBox.checked && paletteCount(pal);
    const got = ramps && ramps.length ? ramps : paletteGroup(colors);
    if (add) {
      const have = {};
      paletteFlat(pal).forEach(function (h) { have[h] = 1; });
      const fresh = paletteGroup((ramps ? paletteFlat({ ramps: ramps }) : colors).filter(function (h) { return !have[h]; }));
      pal.ramps = pal.ramps.concat(fresh);
      if (paletteCount(pal) > PALETTE_MAX) { doUndo(); say.textContent = "That would make " + paletteCount(pal) + " colors; a palette holds at most " + PALETTE_MAX + "."; return; }
      say.textContent = what + ": added " + paletteCount({ ramps: fresh }) + " new color" + (paletteCount({ ramps: fresh }) === 1 ? "" : "s") + " in " + fresh.length + " ramp" + (fresh.length === 1 ? "" : "s") + ".";
    } else {
      pal = { kind: "palette", name: name || pal.name, ramps: got.map(function (r) { return { name: r.name, colors: r.colors.slice() }; }) };
      if (name && !o.existing) nameIn.value = name;
      say.textContent = what + ": " + paletteCount(pal) + " colors in " + pal.ramps.length + " ramp" + (pal.ramps.length === 1 ? "" : "s") + (ramps ? " (its own ramps)." : ", grouped by hue. Drag colors between ramps to regroup them.");
    }
    sel = paletteCount(pal) ? { r: 0, i: 0 } : null;
    starter.value = "";
    render();
  }
  const baseName = function (f) { return paletteCleanName(String(f.name || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), ""); };
  openFile.addEventListener("click", function () { fileIn.value = ""; fileIn.click(); });
  fileIn.addEventListener("change", async function () {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    let text = "";
    try { text = await f.text(); } catch (e) { say.textContent = "Couldn't read " + f.name + "."; return; }
    const r = paletteParse(text);
    if (r.error) { say.textContent = f.name + ": " + r.error; return; }
    take(r.colors, r.ramps, r.name || baseName(f), f.name);
  });
  fromImg.addEventListener("click", function () { imgIn.value = ""; imgIn.click(); });
  imgIn.addEventListener("change", async function () {
    const f = imgIn.files && imgIn.files[0];
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f), s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
      const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(bmp, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height), cols = paletteFromPixels(d.data, c.width, c.height, Math.max(2, Math.min(64, +imgN.value || 16)));
      if (!cols.length) { say.textContent = f.name + ": the picture has no opaque pixels to take colors from."; return; }
      take(cols, null, baseName(f), f.name);
    } catch (e) { say.textContent = "Couldn't read " + f.name + " as a picture."; }
  });
  pasteB.addEventListener("click", function () { pasteBox.hidden = !pasteBox.hidden; if (!pasteBox.hidden) pasteText.focus(); });
  pasteNo.addEventListener("click", function () { pasteBox.hidden = true; });
  pasteUse.addEventListener("click", function () {
    const t = pasteText.value.trim();
    if (/^p\d+\./.test(t)) {
      const d = paletteDecode(t);
      if (d.error) { say.textContent = d.error; return; }
      take(null, d.palette.ramps, d.palette.name, "The pasted palette");
    } else {
      const r = paletteParse(t);
      if (r.error) { say.textContent = r.error; return; }
      take(r.colors, r.ramps, r.name || "", "The pasted colors");
    }
    pasteBox.hidden = true; pasteText.value = "";
  });
  starter.addEventListener("change", function () {
    const v = starter.value.split("\n"), s = PALETTE_STARTERS.find(function (x) { return x.name === v[0]; });
    if (!s) return;
    snap();
    pal = copy(setMode ? paletteSetOf(paletteStarter(s.name), +v[1] || 0) : paletteStarter(s.name));
    if (!o.existing) nameIn.value = pal.name;
    sel = { r: 0, i: 0 };
    render();
    say.textContent = s.name + ": " + s.credit + ". Undo brings yours back.";
  });

  // ---- export (the web: downloads), save, close ------------------------------------------------------------------------------------
  function download(text, ext) {
    const p = paletteClean(Object.assign({}, pal, { name: nameIn.value })), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text(p)], { type: "text/plain" }));
    a.download = plantSlugOr(p.name) + ext;
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  const plantSlugOr = function (n) { return typeof plantSlug === "function" ? plantSlug(n) : String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "palette"; };
  // a ramp saved as a COLOR SET of its own (the desktop: planted beside the palettes, under a free name; the web: onSaved)
  async function saveSet(ri, b) {
    const set = paletteSetOf(paletteClean({ ramps: [pal.ramps[ri]] }), 0);
    if (!set) { say.textContent = "That ramp is empty: add a color first."; return; }
    if (!P) { if (o.onSaved) o.onSaved(set, null); say.textContent = "Saved the color set “" + set.name + "”."; return; }
    b.disabled = true;
    try {
      const M = await plantOpenAs(P, PALETTE_APP), nm = plantFreeName(M, "colorset", set.name), a = await paletteSave(P, nm, set);
      say.textContent = "Saved the color set “" + a.name + "”: " + plantJoin(M.rel, a.slug) + "/. Every app planted in this game can use it.";
      if (o.onSaved) o.onSaved(palettePlanted(a), a);
    } catch (e) { say.textContent = String(e && e.message || e); }
    b.disabled = false;
  }
  exHex.addEventListener("click", function () { download(paletteHex, ".hex"); });
  exGpl.addEventListener("click", function () { download(paletteGpl, ".gpl"); });
  function done() { closed = true; cancelAnimationFrame(prevRaf); root.remove(); }
  close.addEventListener("click", done); cancel.addEventListener("click", done);
  root.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!pasteBox.hidden) pasteBox.hidden = true; else done(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); doUndo(); }
  });
  save.addEventListener("click", async function () {
    const name = paletteCleanName(nameIn.value, "");
    if (!name) { say.textContent = "A " + noun + " needs a name."; nameIn.focus(); return; }
    const p = paletteClean(Object.assign({}, pal, { name: name }));
    if (!paletteCount(p)) { say.textContent = "A " + noun + " needs at least one color."; return; }
    if (!P) {                                                         // the web: the app keeps it
      if (o.onSaved) o.onSaved(p, null);
      say.textContent = "Saved “" + p.name + "”.";
      cancel.textContent = "Close";
      return;
    }
    save.disabled = true;
    try {
      const M = await plantOpenAs(P, PALETTE_APP);
      let nm = name;
      const mine = o.existing && M.assets.find(function (a) { return a.slug === o.existing.slug; });
      if (mine && mine.name.toLowerCase() !== name.toLowerCase()) {
        // a NEW NAME for the palette being edited renames it (its folder and files stay, so nothing in the game breaks)
        if (plantFind(M, plantKind, name)) throw new Error("Another " + noun + " is already called “" + name + "”.");
        await plantRename(M, mine, name);
      } else if (!mine) nm = plantFreeName(M, plantKind, name);       // SAVE NEVER OVERWRITES another palette or set
      else nm = mine.name;
      const a = await paletteSave(P, nm, p);
      o.existing = a; nameIn.value = a.name; title.textContent = (setMode ? "Color set: " : "Palette: ") + a.name;
      say.textContent = "Saved: " + plantJoin(M.rel, a.slug) + "/ (" + a.data.files.map(function (f) { return f.slice(f.lastIndexOf(".")); }).join(", ") + ")" + (nm !== name ? ". “" + name + "” was taken, so it is “" + nm + "”." : ".");
      cancel.textContent = "Close";
      if (o.onSaved) o.onSaved(palettePlanted(a), a);
    } catch (e) { say.textContent = String(e && e.message || e); }
    save.disabled = false;
  });
  if (setMode) nameIn.addEventListener("input", function () { if (pal.ramps[0]) pal.ramps[0].name = nameIn.value; renderSide(); });
  render();
  nameIn.focus();
  return { close: done, root: root, state: function () { return paletteClean(Object.assign({}, pal, { name: nameIn.value })); } };
}

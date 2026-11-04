"use strict";
// CrunchyVFX — the PAGE half of tools/vfx-cli.mjs (VFX-DESIGN §42). The Node half loads the real index.html in a headless
// Firefox and evaluates this file in it; every effect is then made by the app's OWN code, the same calls the desktop
// Library makes when it saves one: a share string (encodePatch), plantedRender (the render, the sound, the Export
// dialog's files with the ready Godot scene), and plantSidecar (the `.crunchy` beside them). Nothing here draws, encodes
// or names a file by itself, so the CLI's output is what the app writes, and stays so as the app changes.
//
//   vfxCli.list()       what exists: presets, the Wizard's types / tags / moves, the eras, frame sizes, the rows
//   vfxCli.run(job)     one effect -> { name, slug, files: [{ path, size }], info, label } (bytes kept for vfxCli.chunk)
//   vfxCli.chunk(i, at, n)   base64 of file i's bytes [at, at + n): Node fetches big sheets in pieces
window.vfxCli = (function () {
  let out = [];
  const fail = (msg) => { throw new Error(msg); };
  const bytesOf = (d) => (typeof d === "string" ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
  function list() {
    return {
      version: APP_VERSION,
      presets: Object.keys(PRESETS),
      categories: PRESET_CATEGORIES.map((c) => ({ name: c[0], presets: c[1] })),
      types: WIZARD_TYPES.map((t) => t.key), tags: WIZARD_TAGS.map((t) => t.key), moves: WIZARD_MOVES.map((m) => m.key),
      eras: STYLES.map((s) => s.name), sizes: SIZES.map(Number),
      power: WIZARD_POWER.words.slice(1).map((w, i) => (i + 1) + " " + w),
      params: PARAMS.map((p) => ({ key: p[0], label: p[1], min: p[2], max: p[3], def: p[5], group: p[7], values: p[8] === "enum" ? p[9] : undefined })),
    };
  }
  // A job's source as a full state, before strength and overrides: { st, fit, sound, type, label, exp, wizard }
  function source(j) {
    const n = ["preset", "crunchy", "link", "wizard"].filter((k) => j[k]);
    if (n.length !== 1) fail("give exactly one of preset, crunchy, link or wizard" + (n.length ? " (got " + n.join(", ") + ")" : ""));
    if (j.preset) {
      const P = PRESETS[j.preset] || fail('no preset "' + j.preset + '" (see --list presets)');
      // the preset's own moment decides whether the top of the Power dial adds a flash and shockwave (bursts only)
      const ms = P.moments || [], type = ms.find((k) => WIZARD_POWER_BURSTS[k]) || ms[0] || "";
      return { st: presetOutcome(P, true), fit: !("fit" in P) || (P.fit !== false && P.fit !== 0), type: type, label: j.preset };
    }
    if (j.crunchy) {
      const d = j.crunchy;
      if (!d || d.app !== "crunchyvfx" || typeof d.s !== "string") fail("that .crunchy file is not a CrunchyVFX effect");
      return { st: stateOfShare(d.s), fit: d.fit !== false, sound: d.sound || null, exp: d.exp || null, label: d.exportName || d.name || "" };
    }
    if (j.link) {
      const m = /[?&#]e=([^&#\s]+)/.exec(j.link), d = m ? decodePatch(decodeURIComponent(m[1])) : null;
      if (!d) fail("that link carries no effect (a CrunchyVFX share link has ?e=…)");
      return { st: stateOfShare(decodeURIComponent(m[1])), fit: d.fit !== 0 && d.fit !== false, label: d.n || "" };
    }
    // THE WIZARD, exactly: the same answers and seed give the same nine (wizardCandidates), and a pick loads as the
    // Wizard loads it (wizardState: the Power dial, then the era), fitted
    const w = j.wizard;
    if (!wizardType(w.type)) fail('no Wizard type "' + w.type + '" (see --list types)');
    for (const t of w.tags || []) if (!wizardTag(t)) fail('no Wizard tag "' + t + '" (see --list tags)');
    for (const m of w.moves || []) if (!wizardMoveOf(m)) fail('no Wizard move "' + m + '" (see --list moves)');
    if (w.era && !STYLES.some((s) => s.name === w.era)) fail('no era "' + w.era + '" (see --list eras)');
    const answers = { type: w.type, tags: w.tags || [], moves: w.moves || [], era: w.era || "", power: j.strength || WIZARD_POWER.neutral };
    const nine = wizardCandidates(answers, w.seed || 1), pick = Math.round(w.pick || 1);
    const c = nine[pick - 1] || fail("the Wizard made " + nine.length + " effects for those answers; pick 1 to " + nine.length);
    return { st: wizardState(c, answers), fit: true, type: w.type, label: c.name, wizard: true };
  }
  // A job's full state and fit: the source, then its era, strength and overrides (one job at one strength)
  function build(j) {
    const src = source(j), st = src.st;
    const name = String(j.name || src.label || "effect").trim();
    if (j.era) {
      if (src.wizard) fail("a Wizard job takes its era inside \"wizard\"");
      if (!STYLES.some((s) => s.name === j.era)) fail('no era "' + j.era + '" (see --list eras)');
      styleInto(st, styleByName(j.era));
    }
    if (j.strength != null && !src.wizard) {
      const lv = Math.round(j.strength);
      if (!(lv >= WIZARD_POWER.min && lv <= WIZARD_POWER.max)) fail("strength is 1 to 9 (5 = as made)");
      wizardPower(st, lv, j.type != null ? j.type : src.type);
    }
    if (j.size != null) {
      const i = SIZES.indexOf(String(j.size));
      if (i < 0) fail("size is one of " + SIZES.join(", "));
      st.frameSize = i;
    }
    if (j.palette) {
      const hex = j.palette.map((c) => String(c).replace(/^#/, "").toLowerCase());
      if (!hex.length || hex.some((h) => !/^[0-9a-f]{6}$/.test(h))) fail("a palette is a list of #rrggbb colors");
      st.paletteLock = hex.join(",");
    }
    for (const k in j.set || {}) {                       // any row, clamped to its range as the slider would
      const p = PARAM_BY_KEY[k], v = j.set[k];
      if (p) st[k] = typeof v === "number" ? Math.max(p[2], Math.min(p[3], v)) : v;
      else if (k in PATCH_EXTRAS) st[k] = v;
      else fail('no setting "' + k + '" (see --list params)');
    }
    const fit = j.fit != null ? !!j.fit : src.fit;
    return { src: src, st: st, fit: fit, name: name };
  }
  async function run(j) {
    out = [];
    if (typeof endTour === "function") try { endTour(false); } catch (e) { /* no tour */ }
    const { src, st, fit, name } = build(j);
    // ONE BOX FOR A SET OF STRENGTHS: every strength's motion, unioned, so Fit scales them all alike (weak = smaller)
    if (fit && Array.isArray(j.group) && j.group.length > 1) {
      let b = null;
      for (const n of j.group) {
        const g = build(Object.assign({}, j, { strength: n })), sim = simulate(g.st), fs = sim.fs, q = sim.bbox;
        b = b ? [Math.min(b[0], q.x0 / fs), Math.min(b[1], q.y0 / fs), Math.max(b[2], q.x1 / fs), Math.max(b[3], q.y1 / fs)]
              : [q.x0 / fs, q.y0 / fs, q.x1 / fs, q.y1 / fs];
      }
      st.fitBox = b.map((v) => +v.toFixed(4)).join(",");
    }
    const exp = Object.assign({}, EXP_DEFAULT, src.exp || {});
    for (const k of ["layout", "meta", "trim", "playback", "scales"]) if (j[k] != null) exp[k] = j[k];
    exp.sound = !!src.sound && j.sound !== false;
    const f = { s: withState(st, () => encodePatch(name, fit)), exp: exp, fit: fit, base: sanitize(name) };
    if (exp.sound) f.sound = src.sound;
    clearSpriteCache();
    const made = await plantedRender(f);
    const files = made.files.map((x) => ({ path: x.path, data: bytesOf(x.data) }));
    const fields = Object.assign({}, f, { exportName: name, info: made.info, thumb: made.thumb });
    const sc = plantSidecarFile(plantSlug(name), plantSidecar("effect", name, fields, files, APP_VERSION, j.created || undefined));
    files.push({ path: sc.path, data: bytesOf(sc.data) });
    out = files;
    return { name: name, slug: plantSlug(name), label: src.label, info: made.info,
             files: files.map((x) => ({ path: x.path, size: x.data.length })) };
  }
  function chunk(i, at, n) {
    const b = out[i].data.subarray(at, at + n);
    let bin = "";
    for (let k = 0; k < b.length; k += 8192) bin += String.fromCharCode.apply(null, b.subarray(k, k + 8192));
    return btoa(bin);
  }
  return { list: list, run: run, chunk: chunk };
})();

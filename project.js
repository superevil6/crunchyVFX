"use strict";
// CrunchyVFX — PROJECTS: the desktop tier's project folder.
//
// VENDORED FROM CRUNCHYTILE, WHICH IS CANONICAL (see PROJECTS-HANDOFF.md §6). Everything here except
// PROJECT_APP, projectAssetValid and projectReadme is byte-for-byte Tile's, on purpose: a fix made in
// one tool's copy belongs in all of them, and the moment the cores drift the suite has four subtly
// different project formats instead of one. Change it there, pull it here.
//
// A project is A FOLDER OF REAL FILES, not one opaque blob:
//
//   My Game VFX/                      any folder the user picks
//     crunchyvfx-project.json         the manifest: name, engine links, auto re-export, what was exported
//     effects/<slug>.json             one effect each: its name and its PARAMS snapshot
//     effects/<slug>.png              its thumbnail, so a file manager shows what it is
//     README.txt                      what this folder is
//
// Files are the truth. The manifest does NOT list the assets: they are found by reading the folders, so
// an effect copied in from another project simply appears, and one deleted in a file manager simply goes.
//
// LINKS AND RE-EXPORT. A project may link a Godot project (the folder holding project.godot) and a Unity
// project (the folder holding Assets/ and ProjectSettings/). Exporting an asset writes exactly what its
// zip would hold, unzipped, under STABLE paths named for the asset: Godot under res://crunchyvfx/<slug>/,
// Unity under Assets/CrunchyVFX/<slug>/. Every file written is recorded in the manifest, so the next
// export of that asset removes what it no longer makes, and NEVER TOUCHES A FILE IT DID NOT WRITE. A file
// another asset also wrote is kept while anything still claims it.
//
// THE GAME FOLDER IS NOT THE PROJECT FOLDER, and that is the one thing people ask for and should not get:
// a project writes effects/ and a manifest and a README, and putting those at the root of a Godot project
// scatters them through the game. The game is LINKED instead. A project folder INSIDE the game repo is
// fine — just not the folder that holds project.godot.
//
// PURE: no DOM, no app state. The file system is PASSED IN as `fs`, an object of async functions (the
// Tauri fs plugin fits as is, see projectTauriFs; the tests pass an in-memory one):
//
//   exists(path) → bool        readTextFile(path) → string     readDir(path) → [{ name, isDirectory }]
//   mkdir(path, { recursive }) writeTextFile(path, text)       writeFile(path, Uint8Array)
//   remove(path)
//
// UNUSED HERE, DELIBERATELY: projectTileIds / projectLostTiles guard a Godot TileSet against dropping
// tiles a level is already painted with. CrunchyVFX has no TileMap and no analogue, but they are kept so
// this file can be pulled from Tile unchanged — a local deletion is what makes the next pull a manual
// diff instead of a copy.
//
// Uses `slugify` from the app (index.html), and only inside a function, so load order cannot bite.
// (Tile's header claims utf8Bytes too; neither copy actually calls it.)

const PROJECT_BUILD = 2;
const PROJECT_APP = {
  id: "crunchyvfx",                                    // the manifest is <id>-project.json
  name: "CrunchyVFX",
  // Each kind of asset is a folder of <slug>.json files. `valid` checks a parsed file; a file that fails
  // is SKIPPED and reported, never allowed to stop the project opening.
  kinds: {
    effect: { dir: "effects", label: "Effects" },
  },
  godotDir: "crunchyvfx",                              // res://crunchyvfx/<asset>/…
  unityDir: "CrunchyVFX",                              // Assets/CrunchyVFX/<asset>/…
};
const PROJECT_VERSION = 1;
const PROJECT_FILE = PROJECT_APP.id + "-project.json";

// ---- paths ----------------------------------------------------------------------------------------
// Forward slashes throughout: Rust's std (behind the Tauri fs plugin) takes them on Windows too, and a
// dialog's backslashes are kept as they came.
function projJoin() {
  const parts = Array.prototype.filter.call(arguments, function (p) { return p != null && p !== ""; });
  return parts.map(function (p, i) {
    p = String(p);
    if (i > 0) p = p.replace(/^[\/\\]+/, "");
    if (i < parts.length - 1) p = p.replace(/[\/\\]+$/, "");
    return p;
  }).join("/");
}
function projBase(path) { return String(path).replace(/[\/\\]+$/, "").split(/[\/\\]/).pop(); }
// A relative path an export may write: no absolute paths, no "..", no empty segments. The ONE gate
// between generated file names and the user's disk.
function projSafeRel(rel) {
  if (typeof rel !== "string" || !rel || /^[\/\\]|^[a-zA-Z]:/.test(rel)) return false;
  return rel.split(/[\/\\]/).every(function (seg) { return seg && seg !== "." && seg !== ".."; });
}

// ---- the manifest ---------------------------------------------------------------------------------
function projectNew(name) {
  return {
    format: PROJECT_APP.id + "-project", version: PROJECT_VERSION, app: PROJECT_APP.name,
    name: String(name || "My project").trim().slice(0, 60) || "My project",
    links: { godot: "", unity: "" },
    autoExport: true,
    exported: {},                                      // "<kind>/<slug>" → { godot: [rel…], unity: [rel…] }
  };
}
// A damaged manifest is MENDED to the defaults field by field, not refused: losing a link setting is
// better than refusing to open someone's work.
function projectMend(m) {
  const out = projectNew(m && typeof m.name === "string" ? m.name : "");
  if (!m || typeof m !== "object") return out;
  if (m.links && typeof m.links === "object") ["godot", "unity"].forEach(function (k) { if (typeof m.links[k] === "string") out.links[k] = m.links[k]; });
  if (typeof m.autoExport === "boolean") out.autoExport = m.autoExport;
  if (m.exported && typeof m.exported === "object") Object.keys(m.exported).forEach(function (k) {
    const e = m.exported[k], keep = {};
    if (!e || typeof e !== "object") return;
    ["godot", "unity"].forEach(function (g) { if (Array.isArray(e[g])) keep[g] = e[g].filter(projSafeRel); });
    out.exported[k] = keep;
  });
  return out;
}
function projectReadme(m) {
  return [
    m.name + " — a " + PROJECT_APP.name + " project",
    "",
    "This folder is a " + PROJECT_APP.name + " project. Open it from the desktop app's Library.",
    "",
    "  " + PROJECT_FILE + "    the project: its name, linked game projects, export settings",
    "  effects/                each effect: <name>.json (reopens it exactly) and <name>.png (a thumbnail)",
    "",
    "The .json files are small and safe to copy between projects; an effect copied into effects/ appears",
    "in the Library the next time the project opens.",
    "",
    "Everything " + PROJECT_APP.name + " draws is generated by deterministic code (no generative AI, no samples)",
    "and is CC0 1.0: yours for any use, commercial included, no attribution required.",
    "",
  ].join("\n");
}

// ---- assets ---------------------------------------------------------------------------------------
// An asset in memory: { kind, slug, key, name, data } where data is the parsed file.
function projectAssetValid(kind, d) {
  if (!d || typeof d !== "object" || typeof d.name !== "string" || !d.name.trim()) return false;
  // An effect is its PARAMS snapshot. `state` is checked as a non-null object rather than key by key:
  // a patch is a diff against the defaults, so an effect saved before a param existed is still valid
  // and must still open — applyPreset fills the gap with that param's default.
  if (kind === "effect") return !!d.state && typeof d.state === "object" && !Array.isArray(d.state);
  return false;
}
function projectSlug(name) { return slugify(name).slice(0, 48).replace(/-+$/, "") || "untitled"; }
function projectUniqueSlug(taken, name) {
  const base = projectSlug(name);
  let s = base, n = 2;
  while (taken.indexOf(s) >= 0) s = base + "-" + n++;
  return s;
}
function projectAssetKey(kind, slug) { return kind + "/" + slug; }
function projectFind(P, kind, name) {
  const low = String(name).trim().toLowerCase();
  return P.assets.find(function (a) { return a.kind === kind && a.name.toLowerCase() === low; }) || null;
}
// For a viewer: assets matching a query (name or tab), newest first within each kind's order.
function projectSearch(P, q, kind) {
  const low = String(q || "").trim().toLowerCase();
  return P.assets.filter(function (a) {
    if (kind && a.kind !== kind) return false;
    if (!low) return true;
    return a.name.toLowerCase().indexOf(low) >= 0 || String(a.data.view || "").indexOf(low) >= 0;
  }).sort(function (a, b) { return String(b.data.modified || "").localeCompare(String(a.data.modified || "")) || a.name.localeCompare(b.name); });
}

// ---- reading and writing a project ----------------------------------------------------------------
async function projectIsOne(fs, dir) { return fs.exists(projJoin(dir, PROJECT_FILE)); }

// CREATE in `dir` (made if missing). A folder that already holds a project is OPENED instead, unchanged.
async function projectCreate(fs, dir, name) {
  if (await projectIsOne(fs, dir)) return projectLoad(fs, dir);
  await fs.mkdir(dir, { recursive: true });
  const m = projectNew(name || projBase(dir));
  for (const k of Object.keys(PROJECT_APP.kinds)) await fs.mkdir(projJoin(dir, PROJECT_APP.kinds[k].dir), { recursive: true });
  await fs.writeTextFile(projJoin(dir, "README.txt"), projectReadme(m));
  const P = { dir: dir, manifest: m, assets: [], skipped: [] };
  await projectSaveManifest(fs, P);
  return P;
}
async function projectLoad(fs, dir) {
  const raw = await fs.readTextFile(projJoin(dir, PROJECT_FILE));
  let m = null;
  try { m = JSON.parse(raw); } catch (e) { m = null; }
  const P = { dir: dir, manifest: projectMend(m), assets: [], skipped: m ? [] : [PROJECT_FILE + " (damaged: opened with default settings)"] };
  for (const kind of Object.keys(PROJECT_APP.kinds)) {
    const sub = projJoin(dir, PROJECT_APP.kinds[kind].dir);
    if (!(await fs.exists(sub))) continue;
    const entries = (await fs.readDir(sub)).filter(function (e) { return !e.isDirectory && /\.json$/i.test(e.name); })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    for (const e of entries) {
      const slug = e.name.replace(/\.json$/i, "");
      let d = null;
      try { d = JSON.parse(await fs.readTextFile(projJoin(sub, e.name))); } catch (err) { d = null; }
      if (!projectAssetValid(kind, d) || !projSafeRel(slug)) { P.skipped.push(PROJECT_APP.kinds[kind].dir + "/" + e.name); continue; }
      P.assets.push({ kind: kind, slug: slug, key: projectAssetKey(kind, slug), name: d.name.trim().slice(0, 60), data: d });
    }
  }
  return P;
}
async function projectSaveManifest(fs, P) {
  await fs.writeTextFile(projJoin(P.dir, PROJECT_FILE), JSON.stringify(P.manifest, null, 1) + "\n");
}
function projectAssetPath(P, a, ext) { return projJoin(P.dir, PROJECT_APP.kinds[a.kind].dir, a.slug + (ext || ".json")); }

// PUT: a new asset, or — when one of that kind already has this name (any case) — an update of it, as
// "Save to my objects" has always behaved. `thumb` (PNG bytes) is optional. Returns the asset.
async function projectPut(fs, P, kind, data, thumb) {
  const d = Object.assign({ format: PROJECT_APP.id + "-" + kind, version: PROJECT_VERSION }, data, { modified: new Date().toISOString() });
  d.name = String(d.name).trim().slice(0, 60);
  if (!projectAssetValid(kind, d)) throw new Error("projectPut: not a valid " + kind);
  let a = projectFind(P, kind, d.name);
  if (a) a.data = d;
  else {
    const taken = P.assets.filter(function (x) { return x.kind === kind; }).map(function (x) { return x.slug; });
    const slug = projectUniqueSlug(taken, d.name);
    a = { kind: kind, slug: slug, key: projectAssetKey(kind, slug), name: d.name, data: d };
    P.assets.push(a);
  }
  a.name = d.name;
  await fs.mkdir(projJoin(P.dir, PROJECT_APP.kinds[kind].dir), { recursive: true });
  await fs.writeTextFile(projectAssetPath(P, a), JSON.stringify(d, null, 1) + "\n");
  if (thumb) await fs.writeFile(projectAssetPath(P, a, ".png"), thumb);
  return a;
}
async function projectRemoveFile(fs, path) { if (await fs.exists(path)) await fs.remove(path); }
// REMOVE an asset's own files. Its exports in the game project are removed by projectUnexport, which the
// caller runs first (it needs the linked folders, which may be gone).
async function projectRemove(fs, P, a) {
  await projectRemoveFile(fs, projectAssetPath(P, a));
  await projectRemoveFile(fs, projectAssetPath(P, a, ".png"));
  P.assets.splice(P.assets.indexOf(a), 1);
}
// RENAME: the name is the file name, so the asset moves to a new slug. Returns the OLD key, whose exports
// the caller removes (the renamed asset is then exported fresh under its new name).
async function projectRename(fs, P, a, name, thumb) {
  const clash = projectFind(P, a.kind, name);
  if (clash && clash !== a) throw new Error("There is already a " + a.kind + " called " + clash.name + ".");
  const oldKey = a.key, data = Object.assign({}, a.data, { name: String(name).trim().slice(0, 60) });
  await projectRemove(fs, P, a);
  const b = await projectPut(fs, P, a.kind, data, thumb);
  if (P.manifest.exported[oldKey]) { P.manifest.exported[b.key] = P.manifest.exported[oldKey]; delete P.manifest.exported[oldKey]; }
  return { asset: b, oldKey: oldKey };
}
async function projectDuplicate(fs, P, a, thumb) {
  const names = P.assets.filter(function (x) { return x.kind === a.kind; }).map(function (x) { return x.name.toLowerCase(); });
  let name = a.name + " copy", n = 2;
  while (names.indexOf(name.toLowerCase()) >= 0) name = a.name + " copy " + n++;
  return projectPut(fs, P, a.kind, Object.assign({}, a.data, { name: name }), thumb);
}

// ---- engine links ---------------------------------------------------------------------------------
// What a folder is, from its entries: a Godot project holds project.godot; a Unity project holds Assets/
// and ProjectSettings/. Anything else is refused rather than written into.
function projectEngineOf(entries) {
  const has = function (n, dir) { return entries.some(function (e) { return e.name === n && !!e.isDirectory === dir; }); };
  if (has("project.godot", false)) return "godot";
  if (has("Assets", true) && has("ProjectSettings", true)) return "unity";
  return null;
}
async function projectDetectEngine(fs, dir) {
  try { return projectEngineOf(await fs.readDir(dir)); } catch (e) { return null; }
}
// Where an engine's files go, relative to the linked folder.
function projectEngineRoot(engine) { return engine === "unity" ? projJoin("Assets", PROJECT_APP.unityDir) : PROJECT_APP.godotDir; }

// EXPORT one asset's files (the [{ name, data }] its zip would hold) into one linked engine. Writes them,
// records them, and removes what this asset wrote last time and no longer makes, unless another asset still
// claims it. Returns { written, removed }. Never writes outside the linked folder (projSafeRel).
async function projectExport(fs, P, key, engine, files) {
  const linkDir = P.manifest.links[engine];
  if (!linkDir) return { written: [], removed: [] };
  const root = projectEngineRoot(engine), rels = [];
  for (const f of files) {
    const rel = projJoin(root, f.name);
    if (!projSafeRel(f.name) || !projSafeRel(rel)) throw new Error("refusing to write outside the game project: " + f.name);
    const path = projJoin(linkDir, rel);
    await fs.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    if (f.data instanceof Uint8Array) await fs.writeFile(path, f.data); else await fs.writeTextFile(path, String(f.data));
    rels.push(rel);
  }
  const removed = await projectDropStale(fs, P, key, engine, rels);
  const rec = P.manifest.exported[key] || (P.manifest.exported[key] = {});
  rec[engine] = rels;
  await projectSaveManifest(fs, P);
  return { written: rels, removed: removed };
}
// The files `key` wrote to `engine` before that are not in `keep` and that no other asset claims.
function projectStale(P, key, engine, keep) {
  const before = (P.manifest.exported[key] || {})[engine] || [];
  const claimed = {};
  Object.keys(P.manifest.exported).forEach(function (k) {
    if (k !== key) ((P.manifest.exported[k] || {})[engine] || []).forEach(function (r) { claimed[r] = true; });
  });
  return before.filter(function (r) { return keep.indexOf(r) < 0 && !claimed[r]; });
}
async function projectDropStale(fs, P, key, engine, keep) {
  const linkDir = P.manifest.links[engine], gone = projectStale(P, key, engine, keep);
  if (linkDir) for (const r of gone) await projectRemoveFile(fs, projJoin(linkDir, r));
  return gone;
}
// UNEXPORT: remove everything `key` wrote to every linked engine (deleting or renaming an asset).
async function projectUnexport(fs, P, key) {
  const removed = [];
  for (const engine of ["godot", "unity"]) {
    if (!P.manifest.links[engine]) continue;
    Array.prototype.push.apply(removed, await projectDropStale(fs, P, key, engine, []));
  }
  delete P.manifest.exported[key];
  await projectSaveManifest(fs, P);
  return removed;
}

// ---- the Tauri adapter ----------------------------------------------------------------------------
// The fs object for the desktop app, from the global Tauri API (`withGlobalTauri`). The caller hands in
// window.__TAURI__ — this file never reads a global it does not own.
function projectTauriFs(T) {
  return {
    exists: function (p) { return T.fs.exists(p); },
    readTextFile: function (p) { return T.fs.readTextFile(p); },
    readDir: function (p) { return T.fs.readDir(p); },
    mkdir: function (p, o) { return T.fs.mkdir(p, o); },
    writeTextFile: function (p, s) { return T.fs.writeTextFile(p, s); },
    writeFile: function (p, b) { return T.fs.writeFile(p, b); },
    remove: function (p) { return T.fs.remove(p); },
  };
}

// RELINK an engine (or unlink with ""). What was exported into the OLD folder is forgotten, not deleted:
// it belongs to that game project now, and this one may never see that folder again.
function projectLink(P, engine, dir) {
  if ((dir || "") === P.manifest.links[engine]) return;                // the same folder again: nothing forgotten
  P.manifest.links[engine] = dir || "";
  Object.keys(P.manifest.exported).forEach(function (k) { if (P.manifest.exported[k]) delete P.manifest.exported[k][engine]; });
}

// A RE-EXPORT MUST NOT BREAK A PAINTED LEVEL (AJ's first Godot test, 2026-10-09). A TileMapLayer stores each
// cell as a tile's atlas coordinates, not a picture. A palette, texture or variant change keeps every tile
// where it was, but some changes drop tiles (turning off a baked base removes its terrain and tiles), and
// every cell painted with them would silently point at nothing. Before overwriting a Godot TileSet, compare
// the tiles it declares (the `x:y/0 = 0` lines) with the new one's. Returns [{ name, lost: ["x:y", …] }] for
// each .tres in `files` that would lose tiles; [] when nothing is lost or nothing was exported before.
function projectTileIds(tres) {
  const out = {};
  String(tres).split("\n").forEach(function (line) { const m = /^(\d+):(\d+)\/0 = 0$/.exec(line.trim()); if (m) out[m[1] + ":" + m[2]] = true; });
  return out;
}
async function projectLostTiles(fs, P, engine, files) {
  const linkDir = P.manifest.links[engine], out = [];
  if (!linkDir || engine !== "godot") return out;
  for (const f of files) {
    if (!/\.tres$/.test(f.name) || !projSafeRel(f.name)) continue;
    const path = projJoin(linkDir, projectEngineRoot(engine), f.name);
    if (!(await fs.exists(path))) continue;
    const before = projectTileIds(await fs.readTextFile(path));
    const after = projectTileIds(typeof f.data === "string" ? f.data : new TextDecoder().decode(f.data));
    const lost = Object.keys(before).filter(function (k) { return !after[k]; });
    if (lost.length) out.push({ name: f.name, lost: lost });
  }
  return out;
}


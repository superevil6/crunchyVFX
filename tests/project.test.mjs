/* The desktop tier's project core (project.js), against an IN-MEMORY file system.
 *
 * Run: node tests/project.test.mjs
 *
 * A second Node runner, for the same reason as worker.test.mjs: project.js is all async file work and
 * both browser suites are synchronous, so nothing there can await a write. Ported from CrunchyTile's
 * tests/project.test.mjs, which is canonical for the core itself.
 *
 * It loads project.js plus THE REAL `slugify`, lifted out of index.html's inline script rather than
 * redefined here. A copy would pass while the app's own version disagreed, and slug rules decide file
 * names on someone's disk and folder names inside their game.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");

const ctx = { console, TextEncoder, TextDecoder, Uint8Array, JSON, Math, Object, Array, String };
vm.createContext(ctx);

const slug = /^function slugify\(s\) \{[\s\S]*?^\}/m.exec(html);
if (!slug) { console.log("FAIL: no `function slugify` found in index.html — project.js needs it"); process.exit(1); }
vm.runInContext(slug[0], ctx, { filename: "index.html:slugify" });
vm.runInContext(readFileSync(join(root, "project.js"), "utf8").replace(/^\s*"use strict";/, ""),
                ctx, { filename: "project.js" });
const g = (src) => vm.runInContext(src, ctx);

// ---- the in-memory fs: files and dirs keyed by path, the same calls as the Tauri plugin ----
function memFs() {
  const files = new Map(), dirs = new Set(["/"]);
  const norm = (p) => p.replace(/\/+$/, "") || "/";
  const parent = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
  const needDir = (p) => { if (!dirs.has(norm(p))) throw new Error("no such directory: " + p); };
  const fs = {
    files, dirs, calls: [],
    async exists(p) { p = norm(p); return files.has(p) || dirs.has(p); },
    async mkdir(p, o) {
      p = norm(p);
      const chain = [];
      for (let q = p; q !== "/" && !dirs.has(q); q = parent(q)) chain.unshift(q);
      if (chain.length > 1 && !(o && o.recursive)) throw new Error("mkdir without recursive: " + p);
      chain.forEach((q) => dirs.add(q));
    },
    async readTextFile(p) {
      p = norm(p);
      if (!files.has(p)) throw new Error("no such file: " + p);
      return new TextDecoder().decode(files.get(p));
    },
    async writeTextFile(p, s) { p = norm(p); needDir(parent(p)); files.set(p, new TextEncoder().encode(s)); fs.calls.push("w " + p); },
    async writeFile(p, b) {
      p = norm(p); needDir(parent(p));
      if (!(b instanceof Uint8Array) && !(b instanceof ctx.Uint8Array)) throw new Error("writeFile wants bytes");
      files.set(p, b); fs.calls.push("w " + p);
    },
    async readDir(p) {
      p = norm(p); needDir(p);
      const out = new Map();
      for (const q of [...files.keys(), ...dirs]) if (q !== p && parent(q) === p) out.set(q.slice(p.length + 1), dirs.has(q));
      return [...out].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory }));
    },
    async remove(p) { p = norm(p); if (!files.delete(p)) throw new Error("remove: no such file " + p); fs.calls.push("rm " + p); },
  };
  return fs;
}

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fail++; console.log("FAIL " + name + (detail ? " — " + detail : ""));
};
const PNG = () => new Uint8Array([137, 80, 78, 71]);
// An effect as the app saves it: a name and a PARAMS snapshot. The core never looks inside `state`.
const effect = (name, over) => ({ name, state: Object.assign({ hue: 32, count: 220, shape: 0 }, over || {}) });
const text = (fs, p) => new TextDecoder().decode(fs.files.get(p));

const fs = memFs();
const P = await g("projectCreate")(fs, "/home/aj/My Game VFX", "");

// ---- create ----
ok("create/manifest-written", fs.files.has("/home/aj/My Game VFX/crunchyvfx-project.json"));
ok("create/named-for-folder", P.manifest.name === "My Game VFX", P.manifest.name);
ok("create/kind-folder", fs.dirs.has("/home/aj/My Game VFX/effects"));
ok("create/readme-cc0", text(fs, "/home/aj/My Game VFX/README.txt").includes("CC0"));
ok("create/auto-export-on", P.manifest.autoExport === true);
const again = await g("projectCreate")(fs, "/home/aj/My Game VFX", "Other name");
ok("create/existing-project-opens-unchanged", again.manifest.name === "My Game VFX", again.manifest.name);

// ---- put / load ----
const a1 = await g("projectPut")(fs, P, "effect", effect("Fire Burst"), PNG());
ok("put/json-written", fs.files.has("/home/aj/My Game VFX/effects/fire-burst.json"));
ok("put/thumb-written", fs.files.has("/home/aj/My Game VFX/effects/fire-burst.png"));
ok("put/key", a1.key === "effect/fire-burst", a1.key);
const a1b = await g("projectPut")(fs, P, "effect", effect("FIRE BURST"));
ok("put/same-name-any-case-updates", a1b === a1 && P.assets.length === 1 && a1.name === "FIRE BURST");
await g("projectPut")(fs, P, "effect", effect("Fire!Burst"));
ok("put/slug-clash-gets-suffix", P.assets.some((a) => a.slug === "fire-burst-2"), P.assets.map((a) => a.slug).join());
let threw = false;
try { await g("projectPut")(fs, P, "effect", { name: "no state" }); } catch (e) { threw = true; }
ok("put/invalid-refused", threw);
threw = false;
try { await g("projectPut")(fs, P, "effect", { name: "array state", state: [] }); } catch (e) { threw = true; }
ok("put/array-state-refused", threw);

// An effect saved before a param existed is still valid: a patch is a diff, applyPreset fills the rest.
ok("valid/sparse-state-still-opens", g("projectAssetValid")("effect", { name: "old", state: {} }) === true);

fs.files.set("/home/aj/My Game VFX/effects/broken.json", new TextEncoder().encode("{not json"));
fs.files.set("/home/aj/My Game VFX/effects/copied-in.json",
             new TextEncoder().encode(JSON.stringify(effect("Copied in"))));
const L = await g("projectLoad")(fs, "/home/aj/My Game VFX");
ok("load/finds-files-not-a-list", L.assets.length === 3 && L.assets.some((a) => a.name === "Copied in"),
   L.assets.map((a) => a.name).join());
ok("load/damaged-file-skipped-and-reported", L.skipped.length === 1 && L.skipped[0] === "effects/broken.json",
   L.skipped.join());
fs.files.delete("/home/aj/My Game VFX/effects/broken.json");
fs.files.set("/home/aj/My Game VFX/crunchyvfx-project.json", new TextEncoder().encode("garbage"));
const L2 = await g("projectLoad")(fs, "/home/aj/My Game VFX");
ok("load/damaged-manifest-mended", !!L2.manifest.name && L2.manifest.autoExport === true && L2.skipped.length === 1,
   JSON.stringify(L2.skipped));

// ---- engine detection ----
const game = "/home/aj/MyGame";
await fs.mkdir(game, { recursive: true });
await fs.writeTextFile(game + "/project.godot", "config_version=5");
ok("detect/godot", (await g("projectDetectEngine")(fs, game)) === "godot");
const uni = "/home/aj/UnityGame";
await fs.mkdir(uni + "/Assets", { recursive: true });
await fs.mkdir(uni + "/ProjectSettings", { recursive: true });
ok("detect/unity", (await g("projectDetectEngine")(fs, uni)) === "unity");
await fs.mkdir("/home/aj/Nothing", { recursive: true });
ok("detect/neither", (await g("projectDetectEngine")(fs, "/home/aj/Nothing")) === null);
ok("detect/missing-folder-is-null", (await g("projectDetectEngine")(fs, "/nope")) === null);

// ---- link + export ----
const Q = await g("projectLoad")(fs, "/home/aj/My Game VFX");
g("projectLink")(Q, "godot", game);
ok("link/recorded", Q.manifest.links.godot === game);

const fx = Q.assets.find((a) => a.slug === "fire-burst");
const sheet = [{ name: "fire-burst/fire-burst.png", data: PNG() },
               { name: "fire-burst/fire-burst.tres", data: "[gd_resource]" }];
const r1 = await g("projectExport")(fs, Q, fx.key, "godot", sheet);
ok("export/under-godot-dir", fs.files.has(game + "/crunchyvfx/fire-burst/fire-burst.png") &&
   fs.files.has(game + "/crunchyvfx/fire-burst/fire-burst.tres"), r1.written.join());
ok("export/recorded-in-manifest", (Q.manifest.exported[fx.key].godot || []).length === 2,
   JSON.stringify(Q.manifest.exported[fx.key]));
ok("export/nothing-outside-the-game-folder",
   [...fs.files.keys()].every((p) => p.startsWith("/home/aj/My Game VFX/") || p.startsWith(game + "/") ||
                                     p.startsWith(uni + "/")));

// a re-export that makes FEWER files removes only what it no longer writes
const r2 = await g("projectExport")(fs, Q, fx.key, "godot", [sheet[0]]);
ok("export/stale-removed", !fs.files.has(game + "/crunchyvfx/fire-burst/fire-burst.tres") &&
   fs.files.has(game + "/crunchyvfx/fire-burst/fire-burst.png"), r2.removed.join());

// a file ANOTHER asset still claims survives the first asset dropping it
const other = Q.assets.find((a) => a.slug === "fire-burst-2");
const shared = { name: "Editor/Shared.cs", data: "// shared" };
await g("projectExport")(fs, Q, fx.key, "godot", [sheet[0], shared]);
await g("projectExport")(fs, Q, other.key, "godot", [{ name: "fire-burst-2/f.png", data: PNG() }, shared]);
await g("projectExport")(fs, Q, fx.key, "godot", [sheet[0]]);
ok("export/shared-file-kept-while-claimed", fs.files.has(game + "/crunchyvfx/Editor/Shared.cs"));
await g("projectExport")(fs, Q, other.key, "godot", [{ name: "fire-burst-2/f.png", data: PNG() }]);
ok("export/shared-file-goes-when-last-claim-drops", !fs.files.has(game + "/crunchyvfx/Editor/Shared.cs"));

// ---- never write outside the linked folder ----
for (const bad of ["../escape.png", "/etc/passwd", "a/../../b.png"]) {
  let t = false;
  try { await g("projectExport")(fs, Q, fx.key, "godot", [{ name: bad, data: PNG() }]); } catch (e) { t = true; }
  ok("safety/refuses " + bad, t);
}
ok("safe/plain", g('projSafeRel("crunchyvfx/a/b.png")') === true);
ok("safe/drive", g('projSafeRel("C:/x")') === false);
ok("safe/dotdot", g('projSafeRel("../x")') === false);

// ---- relink ----
g("projectLink")(Q, "godot", game);
ok("link/same-folder-forgets-nothing", (Q.manifest.exported[fx.key].godot || []).length > 0);
g("projectLink")(Q, "godot", "/home/aj/OtherGame");
ok("link/new-folder-forgets-old-records", !(Q.manifest.exported[fx.key] || {}).godot);
g("projectLink")(Q, "godot", game);

// ---- rename / duplicate / remove ----
await g("projectExport")(fs, Q, fx.key, "godot", sheet);
const ren = await g("projectRename")(fs, Q, fx, "Ice Blast", PNG());
ok("rename/file-moved", fs.files.has("/home/aj/My Game VFX/effects/ice-blast.json") &&
   !fs.files.has("/home/aj/My Game VFX/effects/fire-burst.json"));
ok("rename/old-key-returned", ren.oldKey === "effect/fire-burst", ren.oldKey);
// The export RECORD follows the asset to its new key, but the files in the game are the CALLER's to
// clear: rename cannot know whether the linked folder is still reachable, and refusing to rename
// because a game drive is unplugged would be the wrong trade. Tile's UI unexports straight after.
ok("rename/export-record-follows-the-new-key",
   ((Q.manifest.exported[ren.asset.key] || {}).godot || []).length === 2 && !Q.manifest.exported[ren.oldKey],
   JSON.stringify(Q.manifest.exported[ren.asset.key]));
const cleared = await g("projectUnexport")(fs, Q, ren.asset.key);
ok("rename/caller-unexport-clears-the-old-files",
   !fs.files.has(game + "/crunchyvfx/fire-burst/fire-burst.png"), cleared.join());

const dup = await g("projectDuplicate")(fs, Q, ren.asset, PNG());
ok("duplicate/new-slug", dup.slug !== ren.asset.slug &&
   fs.files.has("/home/aj/My Game VFX/effects/" + dup.slug + ".json"), dup.slug);
await g("projectRemove")(fs, Q, dup);
ok("remove/file-gone", !fs.files.has("/home/aj/My Game VFX/effects/" + dup.slug + ".json"));

await g("projectExport")(fs, Q, ren.asset.key, "godot", [{ name: "ice-blast/ice-blast.png", data: PNG() }]);
await g("projectUnexport")(fs, Q, ren.asset.key);
ok("unexport/removes-everything-it-wrote", !fs.files.has(game + "/crunchyvfx/ice-blast/ice-blast.png") &&
   !Q.manifest.exported[ren.asset.key]);

// ---- paths ----
ok("join/collapses-slashes", g('projJoin("/a/", "/b", "c")') === "/a/b/c", g('projJoin("/a/", "/b", "c")'));
ok("join/windows-root-kept", g('projJoin("C:\\\\Games\\\\Proj", "effects")') === "C:\\Games\\Proj/effects",
   g('projJoin("C:\\\\Games\\\\Proj", "effects")'));
ok("slug/uses-the-app-s-own", g('projectSlug("Fire — Burst!!")') === "fire-burst", g('projectSlug("Fire — Burst!!")'));

// ---- no global collides with the app ----
// project.js and index.html's inline script are CLASSIC SCRIPTS SHARING ONE GLOBAL SCOPE, so two
// `const` declarations of the same name are a parse-time SyntaxError that kills whichever loads
// second. That blanked the whole app the first time this file was added (`PROJECT_VERSION` existed
// in both) and reported only a bare cross-origin "Script error." with no line and no name.
// Cheap to check from the source, and the next vendored sibling gets it for free.
{
  const decl = (src) => {
    const out = new Set();
    for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    return out;
  };
  const pj = readFileSync(join(root, "project.js"), "utf8");
  const inline = html.slice(html.indexOf('<script src="project.js"></script>'));
  const mine = decl(pj), theirs = decl(inline);
  const clash = [...mine].filter((n) => theirs.has(n)).sort();
  ok("globals/no-collision-with-the-app", clash.length === 0, clash.join(", "));
}

console.log(`project.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

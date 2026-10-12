// CrunchyVFX — project-app.js (VFX's PROJECT_APP) over crunchyCore's plant.js, on an in-memory disk.
//   node tests/plant.test.mjs
// Replaces tests/project.test.mjs, which tested the hand-copied project.js that VFX loaded and never called (VFX-DESIGN
// §18: planting superseded it). The browser suites prove the app's use of planting; this pins the adapter itself:
// what counts as a valid effect sidecar, and that plant.js with it plants, updates, renames, deletes and skips.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console, TextEncoder, TextDecoder };
vm.createContext(ctx);
for (const f of ["project-app.js", "plant.js"]) vm.runInContext(readFileSync(join(root, f), "utf8"), ctx, { filename: f });
const G = (n) => vm.runInContext(n, ctx);

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + name + (extra ? " — " + extra : "")); } };

// an in-memory disk with the plugin's shape (remove: a file or an EMPTY folder)
function memFs() {
  const files = new Map(), dirs = new Set(["/"]);
  const parent = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
  const mk = (p) => { for (let q = p; q !== "/" && !dirs.has(q); q = parent(q)) dirs.add(q); };
  return {
    files, dirs, mk,
    async exists(p) { return files.has(p) || dirs.has(p); },
    async readTextFile(p) { if (!files.has(p)) throw new Error("no file " + p); return new TextDecoder().decode(files.get(p)); },
    async readDir(p) {
      const out = new Map();
      files.forEach((_, q) => { if (parent(q) === p) out.set(q.slice(p.length + 1), false); });
      dirs.forEach((q) => { if (q !== p && parent(q) === p) out.set(q.slice(p.length + 1), true); });
      return [...out].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    async mkdir(p) { mk(p); },
    async writeTextFile(p, t) { if (!dirs.has(parent(p))) throw new Error("no dir " + p); files.set(p, new TextEncoder().encode(t)); },
    async writeFile(p, b) { if (!dirs.has(parent(p))) throw new Error("no dir " + p); files.set(p, b); },
    async remove(p) {
      if (files.delete(p)) return;
      if ([...files.keys(), ...dirs].some((q) => q !== p && q.startsWith(p + "/"))) throw new Error("not empty " + p);
      if (!dirs.delete(p)) throw new Error("no such " + p);
    },
  };
}

const APP = G("PROJECT_APP");
ok(APP.id === "crunchyvfx" && APP.suite === "vfx" && APP.kinds.effect, "PROJECT_APP names CrunchyVFX, its suite key and one kind");
const valid = (d) => APP.valid("effect", d);
ok(valid({ s: "eyJuIjoiQSJ9" }), "an effect needs only its share string");
ok(!valid({ s: "" }) && !valid({}) && !APP.valid("design", { s: "x" }), "no share string, or another kind, is not an effect");
ok(valid({ s: "x", base: "big-boom", exp: { meta: "godot" }, sound: { patch: {}, name: "Hit" } }), "the full set of fields is valid");
ok(!valid({ s: "x", base: "../up" }) && !valid({ s: "x", base: "a/b" }), "a base that would leave the folder is refused");
ok(!valid({ s: "x", exp: [1] }) && !valid({ s: "x", sound: { name: "no patch" } }), "a malformed exp or sound is refused");

const fs = memFs();
fs.mk("/game"); fs.files.set("/game/project.godot", new TextEncoder().encode("config_version=5\n"));
const P = await G("plantOpen")(fs, "/game");
ok(P.engine === "godot" && P.rel === "crunchy/vfx" && P.assets.length === 0, "a Godot folder plants under crunchy/vfx/");
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const a = await G("plantPut")(P, { kind: "effect", name: "Big boom", appVersion: "0.1.0",
  fields: { s: "eyJuIjoiQmlnIGJvb20ifQ", base: "big-boom", exp: { meta: "godot" } },
  files: [{ path: "big-boom.png", data: png }, { path: "big-boom.tres", data: '[ext_resource path="big-boom.png"]' }] });
ok(a.slug === "big-boom" && fs.files.has("/game/crunchy/vfx/big-boom/big-boom.crunchy") && fs.files.has("/game/crunchy/vfx/big-boom/big-boom.tres"),
   "a save writes the files and the sidecar in crunchy/vfx/<slug>/");
const side = JSON.parse(await fs.readTextFile("/game/crunchy/vfx/big-boom/big-boom.crunchy"));
ok(side.app === "crunchyvfx" && side.suite === "vfx" && side.kind === "effect" && side.base === "big-boom" && /^2:/.test(side.hash), "the sidecar carries the app, kind, fields and a v2 fingerprint");
ok(!G("plantNeedsUpdate")(a, [{ path: "big-boom.png", data: png }, { path: "big-boom.tres", data: '[ext_resource path="big-boom.png"]' }]), "the same bytes: no update");
ok(G("plantNeedsUpdate")(a, [{ path: "big-boom.png", data: new Uint8Array([9]) }, { path: "big-boom.tres", data: "x" }]), "different bytes: update available");
await G("plantRename")(P, a, "Huge boom");
ok(fs.files.has("/game/crunchy/vfx/big-boom/big-boom.png") && JSON.parse(await fs.readTextFile("/game/crunchy/vfx/big-boom/big-boom.crunchy")).name === "Huge boom",
   "a rename changes the name only");
fs.mk("/game/crunchy/vfx/broken"); fs.files.set("/game/crunchy/vfx/broken/broken.crunchy", new TextEncoder().encode("{not json"));
fs.mk("/game/crunchy/vfx/alien"); fs.files.set("/game/crunchy/vfx/alien/alien.crunchy", new TextEncoder().encode(JSON.stringify({ format: "crunchy-asset", kind: "sound", name: "Zap", files: [], s: "x" })));
const Q = await G("plantOpen")(fs, "/game");
ok(Q.assets.length === 1 && Q.skipped.length === 2, "a damaged sidecar and another kind are skipped and named, never fatal", Q.skipped.join(","));
fs.files.set("/game/crunchy/vfx/big-boom/big-boom.png.import", new TextEncoder().encode("[remap]"));
await G("plantDelete")(Q, Q.assets[0]);
ok(![...fs.files.keys()].some((k) => k.startsWith("/game/crunchy/vfx/big-boom")) && !fs.dirs.has("/game/crunchy/vfx/big-boom") && fs.files.has("/game/project.godot"),
   "a delete removes its files, Godot's .import and the folder, nothing else");

console.log(`plant.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

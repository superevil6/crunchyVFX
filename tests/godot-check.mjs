// CrunchyVFX — do PLANTED effects work inside a real Godot project?        node tests/godot-check.mjs
//
// The desktop suite proves planting over a mocked disk. This asks the CONSUMER (crunchyCore's tests/godot-plant.mjs and
// CrunchySFX's tests/godot-check.mjs are the models):
//   1. the real app plants effects (tests/godot-plant.js inside the real index.html, headless Firefox, the Tauri mock)
//      with different export settings, plus HEAD's My Effects through "Plant my effects", and hands over the files;
//   2. they go into a scratch Godot 4 project at res://crunchy/vfx/, and Godot's own importer runs (--import);
//   3. the game loads every planted .tres as a SpriteFrames by its res:// path, and its "default" animation has the
//      frame count, the animation speed (fps) and the frame size (the untrimmed size: the AtlasTexture margin) that
//      CrunchyVFX exported, at every size (@2x is twice); every sheet PNG loads as a texture;
//      and its loop flag is the effect's Playback (VFX-DESIGN §21): a one-shot does not loop, a looping effect does;
//   4. the .crunchy sidecar is not a resource and gets no .import;
//   4b. the planted combined SCENE, played in a running Godot: a one-shot emits `finished` once and stops on its last frame;
//      a looping effect keeps playing and never emits it;
//   5. plant.js + VFX's project-app.js, on the REAL disk, read every sidecar back (none skipped), and a delete removes the
//      files with their .import, after which Godot no longer finds that effect.
// Needs a Godot 4 binary ($GODOT, else godot / godot4 / godot-mono on PATH) and Firefox; skips (exit 0) without Godot.
import { readFileSync, writeFileSync, mkdtempSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const godot = [process.env.GODOT, "godot", "godot4", "godot-mono"].filter(Boolean).find((b) => {
  const r = spawnSync(b, ["--version"], { encoding: "utf8" });
  return r.status === 0 && /^4\./.test(r.stdout.trim());
});
if (!godot) { console.log("SKIP · no Godot 4 binary found (set $GODOT)"); process.exit(0); }

const ok = [], fail = [];
const t = (name, pass, why) => (pass ? ok : fail).push(name + (pass || !why ? "" : " — " + why));

// 1. the app plants, in Firefox (tests/run-ff.mjs prints the page's lines)
const ff = spawnSync("node", [join(root, "tests/run-ff.mjs"), "godot"], { encoding: "utf8", timeout: 600000, maxBuffer: 1 << 29 });
const planted = [], loops = {};
for (const line of (ff.stdout || "").split("\n")) {
  const m = /^VFX PLANTFILE (\S+) (\S*)$/.exec(line);
  if (m) planted.push({ rel: m[1], data: Buffer.from(m[2], "base64") });
  const l = /^VFX LOOP (\S+) (true|false)$/.exec(line);
  if (l) loops[l[1]] = l[2] === "true";
}
const done = /VFX END PASS (\d+)/.exec(ff.stdout || "");
t("the app planted effects through the planted Library", done && planted.length > 0, (ff.stdout || "").split("\n").filter((l) => /END FAIL/.test(l)).join(" ") || "no output");

// 2. a scratch Godot project with the planted folder in it
const proj = mkdtempSync(join(tmpdir(), "vfx-godot-"));
writeFileSync(join(proj, "project.godot"), 'config_version=5\n\n[application]\nconfig/name="crunchyvfx-plant-check"\n');
for (const f of planted) { mkdirSync(dirname(join(proj, f.rel)), { recursive: true }); writeFileSync(join(proj, f.rel), f.data); }
const sides = planted.filter((f) => /\.crunchy$/.test(f.rel)), tres = planted.filter((f) => /\.tres$/.test(f.rel));
const pngs = planted.filter((f) => /\.png$/.test(f.rel));
t("every planted effect is its folder in crunchy/vfx/<slug>/ with its sidecar", sides.length >= 9 &&
  sides.every((s) => { const slug = s.rel.split("/")[2]; return s.rel === "crunchy/vfx/" + slug + "/" + slug + ".crunchy"; }), sides.length + " sidecars");

// what CrunchyVFX says each .tres should be: from its sidecar (info at 1x, the sizes it was exported at)
const expect = {};
for (const s of sides) {
  const d = JSON.parse(s.data.toString("utf8")), dir = s.rel.slice(0, s.rel.lastIndexOf("/"));
  const scales = d.exp.scales;
  for (const k of scales) {
    const file = dir + "/" + d.base + (scales.length > 1 ? "@" + k + "x" : "") + ".tres";
    expect["res://" + file] = { frames: d.info.frames, fps: d.info.fps, w: Math.round(d.info.w * k), h: Math.round(d.info.h * k),
                                loop: loops[s.rel.split("/")[2]] };
  }
}
t("every planted .tres is one CrunchyVFX meant to write, and the other way round", tres.length === Object.keys(expect).length &&
  tres.every((f) => expect["res://" + f.rel]), tres.length + " vs " + Object.keys(expect).length);
t("several shapes of export are covered: two sizes, an emissive mask, a sound", planted.some((f) => /@2x\.tres$/.test(f.rel)) &&
  planted.some((f) => /_emissive\.png$/.test(f.rel)) && planted.some((f) => /\.wav$/.test(f.rel)));

writeFileSync(join(proj, "check.gd"), `extends SceneTree
func _init():
	var out = {}
	for p in ${JSON.stringify(Object.keys(expect))}:
		var s = load(p)
		if s == null:
			out[p] = null
			continue
		var tex = s.get_frame_texture("default", 0)
		out[p] = { "cls": s.get_class(), "n": s.get_frame_count("default"), "fps": s.get_animation_speed("default"), "loop": s.get_animation_loop("default"),
			"w": tex.get_width() if tex else -1, "h": tex.get_height() if tex else -1 }
	for p in ${JSON.stringify(pngs.map((f) => "res://" + f.rel))}:
		var im = load(p)
		out[p] = { "tex": im != null and im is Texture2D }
	for p in ${JSON.stringify(sides.map((s) => "res://" + s.rel))}:
		out[p] = { "resource": ResourceLoader.exists(p) }
	print("CHECK " + JSON.stringify(out))
	quit()
`);
const check = () => {
  spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 240000 });
  const r = spawnSync(godot, ["--headless", "--path", proj, "--script", "res://check.gd"], { encoding: "utf8", timeout: 120000 });
  const m = /CHECK (\{.*\})/.exec(r.stdout || "");
  return m ? JSON.parse(m[1]) : { error: (r.stdout + r.stderr).slice(-800) };
};
const first = check();
if (process.env.VERBOSE) console.log(JSON.stringify(first, null, 1), JSON.stringify(expect, null, 1));
const bad = Object.keys(expect).filter((p) => {
  const g = first[p], e = expect[p];
  return !g || g.cls !== "SpriteFrames" || g.n !== e.frames || Math.abs(g.fps - e.fps) > 1e-6 || g.w !== e.w || g.h !== e.h ||
    typeof e.loop !== "boolean" || g.loop !== e.loop;
});
t("Godot imports every planted SpriteFrames and the game loads it by res:// path: frame count, fps, frame size and loop as exported",
  !first.error && bad.length === 0, first.error || bad.map((p) => p + " " + JSON.stringify(first[p]) + " vs " + JSON.stringify(expect[p])).join(" | "));
t("every planted sheet PNG (and mask) loads as a texture", pngs.every((f) => first["res://" + f.rel] && first["res://" + f.rel].tex === true));
t("Godot leaves the .crunchy sidecars alone: no resource, no .import",
  sides.every((s) => first["res://" + s.rel] && first["res://" + s.rel].resource === false && !existsSync(join(proj, s.rel + ".import"))));
t("Godot made its own .import beside each PNG", pngs.every((f) => existsSync(join(proj, f.rel + ".import"))));
const lv = Object.keys(expect).map((p) => expect[p].loop);
t("the planted set has both a one-shot and a looping effect (Playback: Auto, Loop and Once)", lv.indexOf(true) >= 0 && lv.indexOf(false) >= 0, JSON.stringify(loops));

// 4b. the combined scene in a RUNNING Godot: play() it and watch for `finished` over three times its length
const scenes = planted.filter((f) => /\.tscn$/.test(f.rel)).map((f) => {
  const slug = f.rel.split("/")[2], side = sides.find((s) => s.rel.split("/")[2] === slug), d = JSON.parse(side.data.toString("utf8"));
  return { path: "res://" + f.rel, loop: loops[slug], secs: d.info.frames / d.info.fps };
});
writeFileSync(join(proj, "finished.gd"), `extends SceneTree
var runs = []
var t = 0.0
var limit = 0.0
func _initialize():
	for c in ${JSON.stringify(scenes.map((c) => [c.path, c.secs]))}:
		var fx = load(c[0]).instantiate()
		root.add_child(fx)
		var run = { "path": c[0], "finished": 0, "playing": false, "frame": -1, "last": -1 }
		fx.finished.connect(func(): run["finished"] += 1)
		run["node"] = fx
		runs.append(run)
		limit = max(limit, c[1] * 3.0 + 0.5)
func _process(delta):
	if t == 0.0:
		for r in runs:
			r["node"].play()    # after the scene's own _ready (which stops the sprite: nothing plays on load)
	t += delta
	if t < limit:
		return false
	var out = {}
	for r in runs:
		var sp = r["node"].get_node("Sprite")
		out[r["path"]] = { "finished": r["finished"], "playing": sp.is_playing(), "frame": sp.frame,
			"last": sp.sprite_frames.get_frame_count("default") - 1 }
	print("FINISHED " + JSON.stringify(out))
	return true
`);
const fr = spawnSync(godot, ["--headless", "--fixed-fps", "60", "--path", proj, "--script", "res://finished.gd"], { encoding: "utf8", timeout: 120000 });
const fm = /FINISHED (\{.*\})/.exec(fr.stdout || "");
const fin = fm ? JSON.parse(fm[1]) : null;
const once = scenes.filter((c) => c.loop === false), rep = scenes.filter((c) => c.loop === true);
t("a planted ONE-SHOT scene, played in Godot, emits `finished` exactly once and stops on its last frame", fin && once.length > 0 &&
  once.every((c) => { const g = fin[c.path]; return g && g.finished === 1 && !g.playing && g.frame === g.last; }),
  fin ? once.map((c) => c.path + " " + JSON.stringify(fin[c.path])).join(" | ") || "no one-shot scene planted" : (fr.stdout + fr.stderr).slice(-800));
t("a planted LOOPING scene keeps playing and never emits `finished`", fin && rep.length > 0 &&
  rep.every((c) => { const g = fin[c.path]; return g && g.finished === 0 && g.playing; }),
  fin ? rep.map((c) => c.path + " " + JSON.stringify(fin[c.path])).join(" | ") || "no looping scene planted" : "no output");

// 5. plant.js and VFX's adapter on the real disk
const nodeFs = {
  async exists(p) { return existsSync(p); },
  async readTextFile(p) { return readFileSync(p, "utf8"); },
  async readDir(p) { return readdirSync(p).map((name) => ({ name, isDirectory: statSync(join(p, name)).isDirectory() })); },
  async mkdir(p) { mkdirSync(p, { recursive: true }); },
  async writeTextFile(p, s) { writeFileSync(p, s); },
  async writeFile(p, b) { writeFileSync(p, b); },
  async remove(p) { if (existsSync(p) && statSync(p).isDirectory()) rmdirSync(p); else rmSync(p, { force: true }); },
};
const ctx = { console, TextEncoder, TextDecoder };
vm.createContext(ctx);
for (const f of ["project-app.js", "plant.js"]) vm.runInContext(readFileSync(join(root, f), "utf8"), ctx, { filename: f });
const P = await vm.runInContext("plantOpen", ctx)(nodeFs, proj);
t("plant.js with VFX's PROJECT_APP reads every sidecar back from the real disk", P.engine === "godot" && P.rel === "crunchy/vfx" &&
  P.assets.length === sides.length && P.skipped.length === 0, P.assets.length + " assets, skipped " + P.skipped.join(","));
const victim = P.assets.find((a) => a.data.files.length >= 3) || P.assets[0], vdir = join(proj, "crunchy/vfx", victim.slug);
const vtres = "res://crunchy/vfx/" + victim.slug + "/" + victim.data.files.find((f) => /\.tres$/.test(f));
await vm.runInContext("plantDelete", ctx)(P, victim);
t("a delete removes its files, their .import and the sidecar, then the folder",
  victim.data.files.every((f) => !existsSync(join(vdir, f)) && !existsSync(join(vdir, f + ".import"))) && !existsSync(vdir));
const second = check();
t("after a delete and a re-import, the game no longer finds that effect", second[vtres] === null &&
  Object.keys(expect).filter((p) => p.indexOf("/" + victim.slug + "/") < 0).every((p) => second[p]), vtres + " " + JSON.stringify(second[vtres]));

rmSync(proj, { recursive: true, force: true });
for (const l of ok) console.log("ok   " + l);
for (const l of fail) console.log("FAIL " + l);
console.log(fail.length ? `\nFAIL · ${fail.length} of ${ok.length + fail.length}` : `\nPASS · ${ok.length} checks · ${sides.length} planted effects, ${tres.length} SpriteFrames (${godot})`);
process.exit(fail.length ? 1 : 0);

// CrunchyVFX — effects in 3D in a REAL Godot (VFX-DESIGN §61.4).                       node tests/godot-3d.mjs
//
// The export half of VFX 1.3, end to end:
//   1. the real index.html (headless Firefox, tests/godot-3d.js): "3D scene too" OFF is byte for byte; ON leaves every 2D
//      file alone; the planted Library (plantedRender, which the CLI calls too) writes exactly what Export writes; one
//      effect per stand (faces you, upright, flat, on the screen), with a sound, Variety, runtime text, a 2x sheet, loops;
//   2. the CLI's --3d (tools/vfx-cli.mjs) writes the 3D scene into an effect folder, and its .crunchy keeps it;
//   3. every file imports into a scratch Godot 4 project with no error, and in a RUNNING SceneTree each <base>_3d.tscn
//      loads with the right nodes: an AnimatedSprite3D on the 2D scene's OWN .tres (nearest, unshaded, billboard by stand:
//      on / fixed Y / none lying on Y), an OmniLight3D (shadows off) whose energy follows `energies` frame by frame, an
//      AudioStreamPlayer3D when there is a sound; spawned the README's way it plays by itself, `impact` fires on its
//      frame, `finished` fires, a one-shot frees itself, a loop keeps going; the screen kind is a CanvasLayer holding the
//      2D scene, scaled to cover the view, with the same API; a varied scene picks per play and its light follows the
//      picked animation's curve; a text scene's Text node lays out new words;
//   4. with a display (and not NO_RENDER=1): frames RENDERED to look at, each effect on a plain floor before a wall (a low
//      camera, then a high one), and, when the kept CrunchyTexture place exists, several standing in a dungeon. They are
//      written to $VFX3D_RENDERS (default ~/.cache/crunchy-wip/vfx-1.3/export-scratch/renders) as contact sheets.
// Needs a Godot 4 binary ($GODOT, else godot / godot4 / godot-mono on PATH) and Firefox; skips (exit 0) without Godot.
// Run it under the shared lock: flock ~/.cache/crunchy-wip/vfx-1.3/heavy.lock node tests/godot-3d.mjs
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.HOME, WIP = join(HOME, ".cache/crunchy-wip");
const godot = [process.env.GODOT, "godot", "godot4", "godot-mono"].filter(Boolean).find((b) => {
  const r = spawnSync(b, ["--version"], { encoding: "utf8" });
  return r.status === 0 && /^4\./.test(r.stdout.trim());
});
if (!godot) { console.log("SKIP · no Godot 4 binary found (set $GODOT)"); process.exit(0); }
const ok = [], fail = [];
const t = (name, pass, why) => (pass ? ok : fail).push(name + (pass || !why ? "" : " — " + why));
function report() {
  for (const l of ok) console.log("PASS " + l);
  for (const l of fail) console.log("FAIL " + l);
  console.log((fail.length ? "FAIL" : "PASS") + " · " + ok.length + " passed, " + fail.length + " failed");
  process.exit(fail.length ? 1 : 0);
}

// 1. the web app, in Firefox
const ff = spawnSync("node", [join(root, "tests/run-ff.mjs"), "3d", "--timeout=900"], { encoding: "utf8", timeout: 960000, maxBuffer: 1 << 29 });
const fx = [], files = {};
for (const line of (ff.stdout || "").split("\n")) {
  let m = /^VFX (PASS|FAIL) (.*)$/.exec(line);
  if (m) t("page: " + m[2], m[1] === "PASS", m[2]);
  m = /^VFX INFO (.*)$/.exec(line);
  if (m) console.log("  " + m[1]);
  m = /^VFX FX3D (\{.*\})$/.exec(line);
  if (m) fx.push(JSON.parse(m[1]));
  m = /^VFX FILE (\d+) (\S+) (\S*)$/.exec(line);
  if (m) (files[m[1]] = files[m[1]] || []).push({ name: m[2], data: Buffer.from(m[3], "base64") });
}
t("the page made " + fx.length + " effects with the 3D scene and ended PASS", /VFX END PASS/.test(ff.stdout || "") && fx.length >= 12,
  (ff.stdout || "").split("\n").filter((l) => /END|threw/.test(l)).join(" ") || (ff.stderr || "").slice(-400));
if (!fx.length) report();

// 2. the CLI's --3d
const scratch = mkdtempSync(join(WIP, "vfx3d-check-"));
const proj = join(scratch, "proj");
mkdirSync(proj, { recursive: true });
{
  const cli = spawnSync("node", [join(root, "tools/vfx-cli.mjs"), "--preset", "Pixel Explosion", "--name", "cli boom", "--3d", "--out", join(proj, "cli"), "--json"],
    { encoding: "utf8", timeout: 600000 });
  const dir = join(proj, "cli", "cli-boom"), have = existsSync(dir) ? readdirSync(dir) : [];
  let sc = null;
  try { sc = JSON.parse(readFileSync(join(dir, "cli-boom.crunchy"), "utf8")); } catch (e) { /* none */ }
  t("the CLI's --3d writes the 3D scene beside the 2D one (and the .crunchy keeps the option, so the Library re-exports it)",
    cli.status === 0 && ["cli-boom.tscn", "cli-boom_3d.tscn", "cli-boom_3d.gd", "cli-boom_3d.json"].every((n) => have.indexOf(n) >= 0) && sc && sc.exp && sc.exp.d3 === true,
    (cli.stderr || "").slice(-300) + " " + have.join(" "));
  const b = spawnSync("node", [join(root, "tools/vfx-cli.mjs"), "--preset", "Pixel Explosion", "--name", "cli flat", "--out", join(proj, "cli")], { encoding: "utf8", timeout: 600000 });
  const flat = existsSync(join(proj, "cli", "cli-flat")) ? readdirSync(join(proj, "cli", "cli-flat")) : [];
  t("without --3d the CLI writes no 3D file", b.status === 0 && flat.length > 0 && !flat.some((n) => /_3d/.test(n)), flat.join(" "));
}

// 3. the files into res://fx/<base>/, imported
writeFileSync(join(proj, "project.godot"), 'config_version=5\n\n[application]\nconfig/name="crunchyvfx-3d-check"\n\n[display]\nwindow/size/viewport_width=960\nwindow/size/viewport_height=540\n');
fx.forEach((e, i) => {
  e.dir = "fx/" + e.base;
  e.scene = "res://" + e.dir + "/" + e.base + "_3d.tscn";
  e.scene2d = "res://" + e.dir + "/" + e.base + ".tscn";
  mkdirSync(join(proj, e.dir), { recursive: true });
  for (const f of files[i] || []) writeFileSync(join(proj, e.dir, f.name), f.data);
  e.tres = e.text ? "res://" + e.dir + "/" + e.base + "_fx.tres" : "res://" + e.dir + "/" + e.base + (e.scales.length > 1 ? "@1x" : "") + ".tres";
  if (e.cardTres) e.tres = "res://" + e.dir + "/" + e.cardTres;   // <vfx13-shapes> particles: the card is the effect without them, its own sheet
  e.light = !!(e.meta.light);
  e.energies = e.light ? e.meta.light.energies : [];
  e.starts = e.light && e.meta.light.energyStarts ? e.meta.light.energyStarts : [0];
  e.readme = (files[i] || []).find((f) => f.name === "README.txt");
  e.readme = e.readme ? e.readme.data.toString("utf8") : "";
});
for (const e of fx) {
  t(e.name + ": the README has a 3D part with the 3D spawn line and says how it stands",
    /^3D \(the "3D scene too" option\)/m.test(e.readme) && e.readme.indexOf('preload("res://' + e.base + '_3d.tscn")') >= 0 && e.readme.indexOf(e.base + "_3d.tscn) it ") >= 0, e.readme.slice(0, 200));
  {
    const gd = (files[fx.indexOf(e)] || []).find((f) => f.name === e.base + "_3d.gd");
    const g = gd ? gd.data.toString("utf8") : "";
    t(e.name + ": the 3D script's example spawns its OWN scene; the README's spawn line suits how it stands" + (e.want === "screen" ? " (no position)" : ""),
      g.indexOf('preload("res://' + e.base + '_3d.tscn")') >= 0 &&
      (e.want === "screen" ? e.readme.indexOf('_3d.tscn").instantiate(); add_child(fx)') >= 0 && /no position/.test(e.readme)
        : e.readme.indexOf('_3d.tscn").instantiate(); fx.position = ') >= 0), g.split("\n")[3] + " | " + e.readme.split("\n").filter((l) => /_3d\.tscn/.test(l)).join(" | "));
  }
  if (e.wantLight !== undefined) t(e.name + ": the light is " + (e.wantLight ? "on (it glows), one energy per frame" : "off (nothing glows, or on the screen)"),
    e.wantLight ? e.light && e.energies.length === e.frames * e.starts.length : !e.light, JSON.stringify(e.meta.light).slice(0, 200));
}
const imp = spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 300000 });
const errs = (s) => (s || "").split("\n").filter((l) => /^(SCRIPT )?ERROR|^\s*Parse Error|WARNING: .*(failed|error)/i.test(l) && !/resources still in use at exit/.test(l));
const impErr = errs(imp.stdout).concat(errs(imp.stderr));
t("Godot imports every exported file with no error", impErr.length === 0, impErr.slice(0, 6).join(" | "));

// 3b. in a running SceneTree
const jobs = fx.map((e) => ({ name: e.name, scene: e.scene, scene2d: e.scene2d, tres: e.tres, stand: e.want, light: e.light, energies: e.energies,
  starts: e.starts, loop: !!e.loop, impact: e.impact, frames: e.frames, fps: e.fps, sound: e.sound, text: !!e.text, variety: !!e.variety,
  form: e.form || "card" }));   // vfx13-shapes
writeFileSync(join(proj, "check.gd"), `extends SceneTree
var jobs = ${JSON.stringify(jobs)}
var runs = []
var tick = 0
var out = {}
const BB = { "face": 1, "upright": 2, "flat": 0 }
func spawn(j, seed):
	var ps = load(j.scene)
	var fx = ps.instantiate()
	var r = { "name": j.name, "j": j, "node": fx, "impacts": [], "finished": 0, "freed_at": -1, "bad_light": [], "lit": {}, "class": fx.get_class(),
		"seen": [], "picks": [], "seed": seed }
	if seed != 0:
		fx.variety_seed = seed
	if j.stand == "screen":
		var ch = fx.get_node_or_null("Effect")
		r["child"] = ch.get_class() if ch else ""
		r["child_scene"] = ch.scene_file_path if ch else ""
		r["child_autoplay"] = ch.autoplay if ch else null
	else:
		var sp = fx.get_node("Sprite")
		var li = fx.get_node_or_null("Light")
		var so = fx.get_node_or_null("Sound")
		r["sprite"] = sp.get_class()
		r["billboard"] = sp.billboard
		r["axis"] = sp.axis
		r["filter"] = sp.texture_filter
		r["shaded"] = sp.shaded
		r["alpha_cut"] = sp.alpha_cut
		r["pixel_size"] = sp.pixel_size
		r["tres"] = sp.sprite_frames.resource_path
		r["light"] = li.get_class() if li else ""
		r["shadow"] = li.shadow_enabled if li else false
		r["energy0"] = li.light_energy if li else -1.0
		r["sound"] = so.get_class() if so else ""
		r["n_energies"] = fx.energies.size()
		# <vfx13-shapes> §61.8: the 3D-native parts
		r["sprite_visible"] = sp.visible
		if j.form == "particles":
			var pn = []
			_parts_of(fx, pn)
			r["parts"] = []
			r["parts_done"] = 0
			r["emitting_ticks"] = 0
			r["part_nodes"] = pn
			for p in pn:
				var mat = p.mesh.material if p.mesh else null
				r["parts"].append({ "amount": p.amount, "lifetime": p.lifetime, "gravity": [p.gravity.x, p.gravity.y, p.gravity.z], "one_shot": p.one_shot,
					"shape": p.emission_shape, "points": p.emission_points.size(), "normals": p.emission_normals.size(), "mesh": p.mesh.get_class() if p.mesh else "",
					"cells": mat.particles_anim_h_frames if mat else 0, "billboard": mat.billboard_mode if mat else -1, "filter": mat.texture_filter if mat else -1,
					"unshaded": mat.shading_mode == 0 if mat else false, "tex": mat.albedo_texture.resource_path if mat and mat.albedo_texture else "" })
				p.finished.connect(func(): r["parts_done"] += 1)
		elif j.form != "card":
			var sh = fx.get_node_or_null("Shape")
			r["shape"] = sh.get_class() if sh else ""
			r["shape_mesh"] = sh.mesh.get_class() if sh and sh.mesh else ""
			r["shape_mat"] = sh.material_override.get_class() if sh and sh.material_override else ""
			r["shape_shader"] = sh.material_override.shader.resource_path if sh and sh.material_override else ""
			r["regions"] = {}
			r["shape_vis"] = 0
			r["r_out"] = []
		# </vfx13-shapes>
	if j.stand != "screen":
		fx.position = Vector3(runs.size() * 10, 0, 0)
	root.add_child(fx)
	fx.impact.connect(func(): r["impacts"].append([(fx.get_node("Sprite").frame if j.stand != "screen" else fx.get_node("Effect/Sprite").frame), tick]))
	fx.finished.connect(func(): r["finished"] += 1)
	runs.append(r)
	return r
func _parts_of(n, out):   # vfx13-shapes: every CPUParticles3D below n, in tree order
	for c in n.get_children():
		if c is CPUParticles3D:
			out.append(c)
		_parts_of(c, out)
func _initialize():
	for j in jobs:
		spawn(j, 0)
	for i in 6:
		for j in jobs:
			if j.variety:
				spawn(j, i + 3)
	# the 2D scene and the 3D one share ONE SpriteFrames resource when both are loaded
	for j in jobs:
		if j.stand != "screen":
			var a = load(j.scene).instantiate()
			var b = load(j.scene2d).instantiate()
			out[j.name + ":shared"] = a.get_node("Sprite").sprite_frames == b.get_node("Sprite").sprite_frames
			a.free()
			b.free()
func _process(_delta):
	tick += 1
	for r in runs:
		var fx = r["node"]
		if not is_instance_valid(fx):
			if r["freed_at"] < 0:
				r["freed_at"] = tick
			continue
		var j = r["j"]
		if tick == 3 and j.text and fx.has_node("Text"):
			fx.get_node("Text").text = "-99"
		if tick == 6 and j.text and fx.has_node("Text"):
			r["letters"] = fx.get_node("Text").get_child_count()
		if j.stand == "screen":
			if tick == 4:
				var ch = fx.get_node("Effect")
				var vs = fx.get_viewport().get_visible_rect().size
				r["cover"] = ch.scale.x * fx.frame_size.x >= vs.x - 0.5 and ch.scale.y * fx.frame_size.y >= vs.y - 0.5 and ch.scale.x == ch.scale.y
				r["playing"] = fx.is_playing()
			continue
		var sp = fx.get_node("Sprite")
		var li = fx.get_node_or_null("Light")
		if tick == 2:
			r["playing_at_2"] = sp.is_playing()
			r["picks"].append([fx.get("variation"), String(sp.animation)])
		if li and sp.is_playing():
			var i = fx._e0 + sp.frame
			var want = fx.energies[i] * fx.light_power if i < fx.energies.size() else 0.0
			if absf(li.light_energy - want) > 0.0001:
				r["bad_light"].append([sp.frame, li.light_energy, want])
			r["lit"][str(fx._e0) + ":" + str(sp.frame)] = li.light_energy
		if r["seen"].size() == 0 or r["seen"][r["seen"].size() - 1] != sp.frame:
			r["seen"].append(sp.frame)
		# <vfx13-shapes> the particles emit; the mesh shows frame after frame (a ring grows); a beam can be aimed
		if j.form == "particles":
			var any = false
			for p in r["part_nodes"]:
				if is_instance_valid(p) and p.emitting:
					any = true
			if any:
				r["emitting_ticks"] += 1
		elif j.form != "card":
			var sh = fx.get_node_or_null("Shape")
			if sh and sh.visible:
				r["shape_vis"] += 1
				var m = sh.material_override
				r["regions"][str(m.get_shader_parameter("region"))] = 1
				if j.form == "ring":
					r["r_out"].append(m.get_shader_parameter("r_out"))
			if j.form == "beam" and tick == 4:
				fx.aim(fx.global_position + Vector3(0, 0, -4))
				var ax = fx.get_node("Shape").material_override.get_shader_parameter("axis")
				r["aim"] = [ax.x, ax.y, ax.z, fx.get_node("Shape").material_override.get_shader_parameter("stretch")]
		# </vfx13-shapes>
	if tick == 400:
		for r in runs:
			if is_instance_valid(r["node"]) and r["j"].loop:
				r["node"].stop()
				r["stopped_light"] = r["node"].get_node("Light").light_energy if r["node"].has_node("Light") else 0.0
				r["playing_after_stop"] = r["node"].is_playing()
	if tick >= 420:
		var res = []
		for r in runs:
			var o = r.duplicate()
			o.erase("node")
			o.erase("j")
			o.erase("part_nodes")   # vfx13-shapes
			res.append(o)
		out["runs"] = res
		var f = FileAccess.open("res://check.json", FileAccess.WRITE)
		f.store_string(JSON.stringify(out))
		f.close()
		quit()
	return false
`);
const run = spawnSync(godot, ["--headless", "--path", proj, "--fixed-fps", "30", "-s", "check.gd"], { encoding: "utf8", timeout: 300000 });
const runErr = errs(run.stdout).concat(errs(run.stderr));
t("the 3D scenes play in Godot with no error", runErr.length === 0, runErr.slice(0, 6).join(" | "));
let res = null;
try { res = JSON.parse(readFileSync(join(proj, "check.json"), "utf8")); } catch (e) { t("the SceneTree check wrote its results", false, (run.stdout || "").slice(-600)); report(); }
const BB = { face: 1, upright: 2, flat: 0 };
for (const e of fx) {
  const rs = res.runs.filter((r) => r.name === e.name), r = rs[0];
  if (!r) { t(e.name + ": ran", false); continue; }
  if (e.want === "screen") {
    t(e.name + ": the screen kind is a CanvasLayer holding the 2D scene (its own autoplay off: the layer plays it), scaled to cover the view",
      r.class === "CanvasLayer" && r.child === "Node2D" && /\/[^/]+\.tscn$/.test(r.child_scene) && r.child_scene.indexOf(e.base + ".tscn") > 0 && r.child_autoplay === false && r.cover === true,
      JSON.stringify({ c: r.class, ch: r.child, s: r.child_scene, a: r.child_autoplay, cover: r.cover }));
  } else {
    t(e.name + ": a Node3D > AnimatedSprite3D on the 2D scene's own SpriteFrames" + (e.cardTres ? " (particles: the card's own, the effect without them)" : "") + ", nearest, unshaded, billboard " + e.want +
      (e.want === "flat" ? " (none, lying on Y)" : ""), r.class === "Node3D" && r.sprite === "AnimatedSprite3D" && r.tres === e.tres && res[e.name + ":shared"] === !e.cardTres &&
      r.filter === 0 && r.shaded === false && r.billboard === BB[e.want] && (e.want !== "flat" || r.axis === 1) && r.pixel_size > 0,
      JSON.stringify({ c: r.class, s: r.sprite, tres: r.tres, want: e.tres, shared: res[e.name + ":shared"], f: r.filter, b: r.billboard, a: r.axis }));
    t(e.name + ": " + (e.light ? "an OmniLight3D (shadows off, dark before it plays)" : "no light") + (e.sound ? ", an AudioStreamPlayer3D" : ""),
      (e.light ? r.light === "OmniLight3D" && r.shadow === false && r.n_energies === e.energies.length : r.light === "") && (e.sound ? r.sound === "AudioStreamPlayer3D" : r.sound === ""),
      JSON.stringify({ l: r.light, sh: r.shadow, n: r.n_energies, so: r.sound }));
    if (e.light) {
      const lit = Object.keys(r.lit).length;
      t(e.name + ": the light's energy follows energies frame by frame (" + lit + " frames checked against the baked curve)", r.bad_light.length === 0 && lit >= Math.min(4, e.frames),
        JSON.stringify(r.bad_light.slice(0, 4)));
    }
  }
  t(e.name + ": plays by itself (never told to)", e.want === "screen" ? r.playing === true : r.playing_at_2 === true, JSON.stringify(r).slice(0, 200));
  if (e.loop) {
    t(e.name + ": a loop: impact every time round, never finished, never freed; stop() stops it" + (e.light ? " and darkens it" : ""),
      r.impacts.length >= 2 && r.finished === 0 && r.freed_at < 0 && r.playing_after_stop === false && (!e.light || r.stopped_light === 0), JSON.stringify({ i: r.impacts.length, f: r.finished, fr: r.freed_at, p: r.playing_after_stop, l: r.stopped_light }));
  } else {
    t(e.name + ": a one-shot: impact once" + (e.want === "screen" ? "" : " on frame " + e.impact) + ", finished once, then freed",
      r.impacts.length === 1 && (e.want === "screen" || r.impacts[0][0] === e.impact) && r.finished === 1 && r.freed_at > 0, JSON.stringify({ i: r.impacts, f: r.finished, fr: r.freed_at }));
  }
  if (e.text) t(e.name + ": its 3D Text node lays out new words (\"-99\": three glyphs)", r.letters === 3, String(r.letters));
  // <vfx13-shapes> §61.8 the 3D-native forms, against what the .json says
  if (e.form === "particles" && e.meta.form) {
    const want = [].concat(...e.meta.form.systems.map((y) => y.nodes.map((nd) => ({ amount: nd.amount, lifetime: nd.lifetime, gravity: y.gravity, cells: y.cells }))));
    const got = r.parts || [];
    const same = got.length === want.length && got.every((p, i) => p.amount === want[i].amount && Math.abs(p.lifetime - want[i].lifetime) < 1e-3 &&
      p.gravity.every((g, k) => Math.abs(g - want[i].gravity[k]) < 1e-3) && p.cells === want[i].cells);
    t(e.name + ": " + got.length + " CPUParticles3D below the node, amounts, lifetimes, gravity and strip cells as the .json says (" + got.reduce((a, p) => a + p.amount, 0) + " particles)",
      same, JSON.stringify({ got: got.map((p) => [p.amount, p.lifetime, p.gravity, p.cells]).slice(0, 4), want: want.map((p) => [p.amount, p.lifetime, p.gravity, p.cells]).slice(0, 4) }));
    t(e.name + ": each emits from its own points along their normals (directed points), a QuadMesh billboarded as particles, unshaded, nearest, wearing its strip",
      got.length > 0 && got.every((p) => p.shape === 5 && p.points > 0 && p.points === p.normals && p.mesh === "QuadMesh" && p.billboard === 3 && p.filter === 0 && p.unshaded && /_3d_p\d+\.png$/.test(p.tex)),
      JSON.stringify(got[0] || {}));
    // a one-shot's emitters that are done before the clip ends say so (finished); the rest end with the clip, as in 2D
    const clip = e.frames / e.fps, early = e.meta.form.systems.filter((y) => y.busyUntil !== undefined && y.busyUntil < clip - 0.1).length;
    t(e.name + ": the particles emit while it plays" + (e.loop ? "" : ", " + (early ? "finish (" + r.parts_done + " emitters)" : "end with the clip") + " and the scene frees itself"),
      r.emitting_ticks > 0 && (e.loop || ((!early || r.parts_done >= 1) && r.freed_at > 0)), JSON.stringify({ em: r.emitting_ticks, done: r.parts_done, fr: r.freed_at, early }));
    t(e.name + ": its card " + (e.cardTres ? "shows what is not a particle" : "is empty, so the sprite is hidden (it stays the clock)"), r.sprite_visible === !!e.cardTres, String(r.sprite_visible));
  }
  if (e.form === "arc" || e.form === "beam" || e.form === "ring") {
    const regions = Object.keys(r.regions || {}).length;
    t(e.name + ": a MeshInstance3D \"Shape\" (a PlaneMesh, its own " + e.base + "_3d.gdshader) shows the frames, " + regions + " regions of the sheet in turn; the sprite hidden (the clock)",
      r.shape === "MeshInstance3D" && r.shape_mesh === "PlaneMesh" && r.shape_mat === "ShaderMaterial" && /_3d\.gdshader$/.test(r.shape_shader) && r.sprite_visible === false && r.shape_vis > 2 && regions >= 2,
      JSON.stringify({ s: r.shape, m: r.shape_mesh, mat: r.shape_mat, sh: r.shape_shader, v: r.sprite_visible, vis: r.shape_vis, regions }));
    if (e.form === "ring") {
      const ro = r.r_out || [];
      t(e.name + ": the ring grows on the floor (its outer radius " + (ro.length ? ro[0].toFixed(1) + " to " + Math.max.apply(null, ro).toFixed(1) : "?") + " px)", ro.length > 2 && Math.max.apply(null, ro) > ro[0] + 4, JSON.stringify(ro.slice(0, 8)));
    }
    if (e.form === "beam") t(e.name + ": aim() points the beam at a place and stretches it to reach", r.aim && Math.abs(r.aim[2] + 1) < 0.01 && r.aim[3] > 0, JSON.stringify(r.aim));
  }
  // </vfx13-shapes>
  if (e.variety) {
    const picks = rs.slice(1).map((x) => x.picks[0] ? x.picks[0][1] : "?");
    const curves = new Set(rs.flatMap((x) => Object.keys(x.lit).map((k) => k.split(":")[0])));
    t(e.name + ": Variety in 3D: the plays pick baked animations, and the light follows the picked one's own curve (" + [...new Set(picks)].join(", ") + ")",
      new Set(picks).size >= 2 && rs.every((x) => x.bad_light.length === 0) && curves.size >= 2, JSON.stringify({ picks, curves: [...curves] }));
  }
}

// 4. renders, to LOOK at
const display = (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) && process.env.NO_RENDER !== "1";
const RENDERS = process.env.VFX3D_RENDERS || join(WIP, "vfx-1.3/export-scratch/renders");
if (display) {
  mkdirSync(RENDERS, { recursive: true });
  const PER = 48;
  const shots = fx.map((e) => ({ name: e.name, scene: e.scene, stand: e.want, frameM: Math.max(e.meta.frame.w, e.meta.frame.h) * (e.meta.pixelSize || 0.025), loop: !!e.loop }));
  writeFileSync(join(proj, "floor.gd"), `extends Node3D
# Each effect on a plain floor before a wall: ${PER} frames each, a low camera for the first half, a high one for the second.
var shots = ${JSON.stringify(shots)}
var tick = 0
var cur = null
var cam: Camera3D
func _ready():
	var env = WorldEnvironment.new()
	var e = Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.05, 0.05, 0.07)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.32, 0.32, 0.36)
	e.ambient_light_energy = 1.0
	env.environment = e
	add_child(env)
	var img = Image.create(64, 64, false, Image.FORMAT_RGB8)
	for y in 64:
		for x in 64:
			var c = 0.42 if ((x / 8) + (y / 8)) % 2 == 0 else 0.36
			img.set_pixel(x, y, Color(c, c, c * 1.04))
	var tex = ImageTexture.create_from_image(img)
	var m = StandardMaterial3D.new()
	m.albedo_texture = tex
	m.uv1_scale = Vector3(40, 40, 1)
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	var fl = MeshInstance3D.new()
	var pm = PlaneMesh.new()
	pm.size = Vector2(80, 80)
	fl.mesh = pm
	fl.material_override = m
	add_child(fl)
	var wall = MeshInstance3D.new()
	var bm = BoxMesh.new()
	bm.size = Vector3(80, 12, 0.4)
	wall.mesh = bm
	var wm = StandardMaterial3D.new()
	wm.albedo_texture = tex
	wm.uv1_scale = Vector3(30, 6, 1)
	wm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	wall.material_override = wm
	wall.position = Vector3(0, 6, -3.5)
	add_child(wall)
	# a person-sized post for scale (1.8 m)
	var post = MeshInstance3D.new()
	var cm = BoxMesh.new()
	cm.size = Vector3(0.4, 1.8, 0.4)
	post.mesh = cm
	var pmat = StandardMaterial3D.new()
	pmat.albedo_color = Color(0.25, 0.3, 0.45)
	post.material_override = pmat
	post.position = Vector3(-2.2, 0.9, -0.6)
	add_child(post)
	cam = Camera3D.new()
	cam.fov = 60
	add_child(cam)
	cam.current = true
func _process(_d):
	var i = tick / ${PER}
	var k = tick % ${PER}
	if i >= shots.size():
		get_tree().quit()
		return
	var s = shots[i]
	if k == 0:
		if cur and is_instance_valid(cur):
			cur.queue_free()
		cur = load(s.scene).instantiate()
		cur.free_when_done = false
		if s.stand == "face":
			cur.position = Vector3(0, 1.0, 0)
		add_child(cur)
	if k == ${PER / 2} and not s.loop and is_instance_valid(cur):
		cur.play()
	var d = maxf(3.0, s.frameM * 1.5)
	if k < ${PER / 2}:
		cam.position = Vector3(0.6, 1.3, d)
	else:
		cam.position = Vector3(0.4, d * 0.9, d * 0.65)
	cam.look_at(Vector3(0, minf(1.0, s.frameM * 0.3), 0))
	tick += 1
`);
  writeFileSync(join(proj, "floor.tscn"), '[gd_scene format=3]\n\n[ext_resource type="Script" path="res://floor.gd" id="1"]\n\n[node name="Floor" type="Node3D"]\nscript = ExtResource("1")\n');
  const fdir = join(scratch, "floor-frames");
  mkdirSync(fdir, { recursive: true });
  const mv = spawnSync(godot, ["--path", proj, "--resolution", "640x360", "--fixed-fps", "30", "--write-movie", join(fdir, "f.png"), "res://floor.tscn"],
    { encoding: "utf8", timeout: 600000 });
  const frames = existsSync(fdir) ? readdirSync(fdir).filter((n) => /\.png$/.test(n)).sort() : [];
  t("rendered " + frames.length + " frames of the effects on a floor (a display: " + (process.env.WAYLAND_DISPLAY || process.env.DISPLAY) + ")", frames.length >= PER * fx.length - 2,
    (mv.stderr || "").split("\n").filter((l) => /ERROR/.test(l)).slice(0, 3).join(" | "));
  // one contact sheet per effect: low camera at 4 moments, high camera at 4
  const sheets = [];
  fx.forEach((e, i) => {
    const pick = [3, 7, 12, 18, PER / 2 + 3, PER / 2 + 7, PER / 2 + 12, PER / 2 + 18].map((k) => frames[i * PER + k]).filter(Boolean).map((n) => join(fdir, n));
    if (!pick.length) return;
    const outp = join(RENDERS, "floor-" + e.base + ".png");
    spawnSync("montage", pick.concat(["-tile", "4x2", "-geometry", "+2+2", "-background", "#111", "-title", e.name + " (" + e.want + ")", "-fill", "#ddd", outp]), { encoding: "utf8" });
    if (existsSync(outp)) sheets.push(outp);
  });
  t("contact sheets written for every effect (" + RENDERS + ")", sheets.length === fx.length, sheets.length + " of " + fx.length);

  // in a CrunchyTexture place (a COPY of the kept project; the original is never written)
  const KEPT = process.env.VFX3D_PLACE || join(WIP, "vfx-1.3/export-scratch/place");
  if (existsSync(join(KEPT, "crunchytexture/places/flames/place.tscn"))) {
    const pick = ["Pixel Explosion", "Pixel Torch", "Pixel Portal", "Scorch Mark", "Pixel Lightning", "Pixel Gem Sparkle", "Pixel Heal", "Pixel Damage Number", "Pixel Bonfire"];
    rmSync(join(KEPT, "fx3d"), { recursive: true, force: true });
    for (const e of fx) if (pick.indexOf(e.name) >= 0) cpSync(join(proj, e.dir), join(KEPT, "fx3d", e.base), { recursive: true });
    const placed = [
      // name, x, z, lift above the floor (a face effect's emitter), start frame
      ["Pixel Portal", -15.3, 8.8, 0, 0], ["Pixel Gem Sparkle", -16.1, 5.6, 0.9, 6], ["Pixel Heal", -19.2, 7.0, 0, 8],
      ["Pixel Explosion", -17.2, 9.8, 0.7, 30], ["Pixel Damage Number", -17.2, 9.8, 1.9, 36], ["Pixel Lightning", -19.4, 10.6, 0, 60],
      ["Scorch Mark", -18.4, 6.4, 0, 14], ["Pixel Torch", -14.6, 6.2, 0, 0], ["Pixel Bonfire", -20.4, 8.6, 0, 0],
    ].filter((p) => fx.some((e) => e.name === p[0])).map((p) => { const e = fx.find((x) => x.name === p[0]); return { scene: "res://fx3d/" + e.base + "/" + e.base + "_3d.tscn", x: p[1], z: p[2], lift: p[3], at: p[4], loop: !!e.loop }; });
    writeFileSync(join(KEPT, "vfx3d.gd"), `extends Node3D
# CrunchyVFX 1.3's 3D scenes standing in a CrunchyTexture place (the spike's room), each as exported: no per-effect tweaks.
const LOOP := 90
var FX = ${JSON.stringify(placed)}
var nodes := []
var tick := 0
var walker: CharacterBody3D
func floor_at(x: float, z: float) -> float:
	var q := PhysicsRayQueryParameters3D.create(Vector3(x, 6, z), Vector3(x, -4, z))
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	return hit.position.y if hit else 1.0
func _ready() -> void:
	var p: Node3D = load("res://crunchytexture/places/flames/place.tscn").instantiate()
	add_child(p)
	walker = p.get_node("Walker")
	walker.take_input = false
	walker.set_physics_process(false)
	walker.global_transform = Transform3D(Basis(Vector3.UP, PI), Vector3(-17, 0.9557, 3))
	(walker.get_node("Camera") as Camera3D).rotation.x = -0.06
	await get_tree().physics_frame
	for f in FX:
		var n = load(f.scene).instantiate()
		n.autoplay = false
		n.free_when_done = false
		n.position = Vector3(f.x, floor_at(f.x, f.z) + f.lift, f.z)
		add_child(n)
		n.visible = false
		nodes.append(n)
func _process(_d: float) -> void:
	if nodes.is_empty(): return
	var t: int = tick % LOOP
	for i in FX.size():
		var f = FX[i]
		var n = nodes[i]
		if f.loop:
			if not n.visible:
				n.visible = true
				n.play()
		elif t == f.at:
			n.visible = true
			n.play()
	var ph := TAU * float(t) / LOOP
	walker.global_transform = Transform3D(Basis(Vector3.UP, PI - 0.12 * sin(ph)), Vector3(-17 + 1.3 * sin(ph), 0.9557, 3.4))
	tick += 1
	if tick >= LOOP * 2:
		get_tree().quit()
`);
    writeFileSync(join(KEPT, "vfx3d.tscn"), '[gd_scene format=3]\n\n[ext_resource type="Script" path="res://vfx3d.gd" id="1"]\n\n[node name="VFX3D" type="Node3D"]\nscript = ExtResource("1")\n');
    spawnSync(godot, ["--headless", "--path", KEPT, "--import"], { encoding: "utf8", timeout: 900000 });
    const pdir = join(scratch, "place-frames");
    mkdirSync(pdir, { recursive: true });
    spawnSync(godot, ["--path", KEPT, "--resolution", "960x720", "--fixed-fps", "30", "--write-movie", join(pdir, "p.png"), "res://vfx3d.tscn"], { encoding: "utf8", timeout: 900000 });
    const pf = existsSync(pdir) ? readdirSync(pdir).filter((n) => /\.png$/.test(n)).sort() : [];
    t("rendered " + pf.length + " frames of the effects standing in a CrunchyTexture place", pf.length >= 170);
    if (pf.length >= 170) {
      const sel = [96, 100, 104, 108, 112, 118, 124, 130, 136, 150, 156, 162].map((k) => join(pdir, pf[k])).filter((p) => existsSync(p));
      spawnSync("montage", sel.concat(["-tile", "4x3", "-geometry", "480x360+2+2", "-background", "#111", join(RENDERS, "place-sheet.png")]), { encoding: "utf8" });
      spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-start_number", "90", "-i", join(pdir, "p%08d.png"), "-frames:v", "90", "-pix_fmt", "yuv420p", join(RENDERS, "place.mp4")], { encoding: "utf8" });
      t("the place's contact sheet and a loop video written", existsSync(join(RENDERS, "place-sheet.png")));
    }
  } else console.log("  (no kept CrunchyTexture place at " + KEPT + ": the dungeon render is skipped)");
  // <vfx13-shapes> §61.8: the 3D-native forms RENDERED by Godot, to look at: Pixel Level Up bursting round a point from a low
  // and a high camera (the volume), a slash from a first-person camera (the scene spawned on the camera's basis) and from
  // behind, rings on the floor, a beam aimed with aim(), Confetti; contact sheets shapes-<name>.png
  {
    const by = (n) => fx.find((e) => e.name === n);
    const segs = [
      ["Pixel Level Up", "low", [0.4, 0.9, 2.4], [0, 0.55, 0], "floor"], ["Pixel Level Up", "high", [1.7, 2.6, 1.7], [0, 0.35, 0], "floor"],
      ["Confetti", "low", [0.4, 1.2, 3.4], [0, 1.0, 0], "air"], ["Confetti", "high", [2.2, 3.0, 2.2], [0, 0.8, 0], "air"],
      ["Pixel Slash", "first-person", [0, 1.6, 2.6], [0, 1.45, -2], "fp"], ["Pixel Slash", "behind", [0.9, 2.1, 3.0], [0, 1.0, -0.6], "air"],
      ["Shockwave", "floor", [0.3, 2.2, 3.4], [0, 0, 0], "floor"], ["Pixel Ring Blast", "floor", [0.3, 2.2, 3.4], [0, 0, 0], "floor"],
      ["Laser", "aimed", [0.6, 1.7, 3.6], [0.4, 1.1, -1], "aim"],
    ].filter((g) => by(g[0])).map((g) => { const e = by(g[0]); return { name: g[0], view: g[1], scene: e.scene, cam: g[2], look: g[3], spawn: g[4], n: Math.max(12, Math.round(e.frames / e.fps * 30) + 8) }; });
    writeFileSync(join(proj, "shapes.gd"), `extends Node3D
# CrunchyVFX 1.3 §61.8: the 3D-native forms, each as exported, in front of a camera.
var segs = ${JSON.stringify(segs)}
var seg := 0
var k := 0
var cur = null
var cam: Camera3D
func _ready():
	var env = WorldEnvironment.new()
	var e = Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.04, 0.04, 0.06)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.22, 0.22, 0.26)
	env.environment = e
	add_child(env)
	var img = Image.create(64, 64, false, Image.FORMAT_RGB8)
	for y in 64:
		for x in 64:
			var c = 0.40 if ((x / 8) + (y / 8)) % 2 == 0 else 0.33
			img.set_pixel(x, y, Color(c, c, c * 1.05))
	var tex = ImageTexture.create_from_image(img)
	var m = StandardMaterial3D.new()
	m.albedo_texture = tex
	m.uv1_scale = Vector3(40, 40, 1)
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	var fl = MeshInstance3D.new()
	var pm = PlaneMesh.new()
	pm.size = Vector2(80, 80)
	fl.mesh = pm
	fl.material_override = m
	add_child(fl)
	var wall = MeshInstance3D.new()
	var bm = BoxMesh.new()
	bm.size = Vector3(80, 12, 0.4)
	wall.mesh = bm
	wall.material_override = m
	wall.position = Vector3(0, 6, -4.5)
	add_child(wall)
	var post = MeshInstance3D.new()
	var cm = BoxMesh.new()
	cm.size = Vector3(0.4, 1.8, 0.4)
	post.mesh = cm
	var pmat = StandardMaterial3D.new()
	pmat.albedo_color = Color(0.25, 0.3, 0.45)
	post.material_override = pmat
	post.position = Vector3(-1.6, 0.9, -1.2)
	add_child(post)
	cam = Camera3D.new()
	cam.fov = 62
	add_child(cam)
	cam.current = true
func _process(_d):
	if seg >= segs.size():
		get_tree().quit()
		return
	var S = segs[seg]
	cam.position = Vector3(S.cam[0], S.cam[1], S.cam[2])
	cam.look_at(Vector3(S.look[0], S.look[1], S.look[2]))
	if k == 0:
		if cur and is_instance_valid(cur):
			cur.queue_free()
		cur = load(S.scene).instantiate()
		cur.autoplay = false
		cur.free_when_done = false
		add_child(cur)
		if S.spawn == "fp":
			# the README's first-person spawn: on the camera's basis, at the hand
			var t = cam.global_transform
			t.origin += t.basis * Vector3(0.1, -0.45, -0.1)
			cur.global_transform = t
		elif S.spawn == "air":
			cur.position = Vector3(0, 1.0, 0)
		elif S.spawn == "aim":
			cur.position = Vector3(-1.6, 1.0, 0.2)
		cur.play()
		if S.spawn == "aim":
			cur.aim(Vector3(2.6, 1.3, -2.6))
	k += 1
	if k >= S.n:
		k = 0
		seg += 1
`);
    writeFileSync(join(proj, "shapes.tscn"), '[gd_scene format=3]\n\n[ext_resource type="Script" path="res://shapes.gd" id="1"]\n\n[node name="Shapes" type="Node3D"]\nscript = ExtResource("1")\n');
    const sdir = join(scratch, "shape-frames");
    mkdirSync(sdir, { recursive: true });
    const mv2 = spawnSync(godot, ["--path", proj, "--resolution", "640x400", "--fixed-fps", "30", "--write-movie", join(sdir, "s.png"), "res://shapes.tscn"], { encoding: "utf8", timeout: 600000 });
    const sf = existsSync(sdir) ? readdirSync(sdir).filter((n) => /\.png$/.test(n)).sort() : [];
    const total = segs.reduce((a, g) => a + g.n, 0);
    t("rendered " + sf.length + " frames of the 3D-native forms in Godot (" + segs.length + " shots)", sf.length >= total - 2,
      (mv2.stderr || "").split("\n").filter((l) => /ERROR/.test(l)).slice(0, 3).join(" | "));
    let at = 0, made = 0;
    for (const g of segs) {
      const pick = [0.12, 0.25, 0.38, 0.5, 0.62, 0.78].map((q) => sf[at + 1 + Math.round(q * (g.n - 2))]).filter(Boolean).map((n) => join(sdir, n));
      const outp = join(RENDERS, "shapes-" + g.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() + "-" + g.view + ".png");
      spawnSync("montage", pick.concat(["-tile", "3x2", "-geometry", "+2+2", "-background", "#111", "-title", g.name + " (" + g.view + ")", "-fill", "#ddd", outp]), { encoding: "utf8" });
      if (existsSync(outp)) made++;
      at += g.n;
    }
    t("contact sheets of the forms written (" + made + ", " + RENDERS + "/shapes-*.png)", made === segs.length, made + " of " + segs.length);
  }
  // </vfx13-shapes>
} else console.log("  (no display, or NO_RENDER=1: renders skipped)");
if (!process.env.KEEP) rmSync(scratch, { recursive: true, force: true });
else console.log("  kept " + scratch);
report();

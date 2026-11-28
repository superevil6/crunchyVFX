// CrunchyVFX: LIT EFFECTS in a REAL Godot (VFX-DESIGN §65).                                node tests/godot-lit.mjs
//
//   1. the real index.html (headless Firefox, tests/godot-lit.js): Lit off is byte for byte, Lit on adds <base>_n.png and
//      the scenes' lit parts and leaves every color file alone; the normal maps face the right way; pictures of the stage's
//      test light and the room's torch, each from the left and from the right (written to $VFXLIT_RENDERS);
//   2. every exported file imports into a scratch Godot 4 project with no error; in a running SceneTree the 2D scene's
//      Sprite wears a ShaderMaterial with the normal sheet (and a Glow child exactly when something glows), the 3D
//      scene's AnimatedSprite3D a material_override with the sheet and the normal sheet;
//   3. with a display (and not NO_RENDER=1): each effect RENDERED, held on one frame, under a dark CanvasModulate with a
//      PointLight2D on its left and then on its right (2D), and in the dark beside an OmniLight3D on the camera's left and
//      then its right (3D). The lit side must be the brighter one, both ways round, in both. A lit Pixel Explosion with
//      NO light must still show its fire (the Glow child: what glows is never dimmed). Contact sheets go to $VFXLIT_RENDERS.
// Needs Godot 4 ($GODOT, else godot / godot4 / godot-mono), Firefox, python3 with Pillow and ImageMagick's montage.
// Run it under the shared lock: flock ~/.cache/crunchy-wip/vfx-1.3/heavy.lock node tests/godot-lit.mjs
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.HOME, WIP = join(HOME, ".cache/crunchy-wip");
const RENDERS = process.env.VFXLIT_RENDERS || join(WIP, "vfx-1.3c/lit-scratch/renders");
mkdirSync(RENDERS, { recursive: true });
const godot = [process.env.GODOT, "godot", "godot4", "godot-mono"].filter(Boolean).find((b) => {
  const r = spawnSync(b, ["--version"], { encoding: "utf8" });
  return r.status === 0 && /^4\./.test(r.stdout.trim());
});
const ok = [], fail = [];
const t = (name, pass, why) => (pass ? ok : fail).push(name + (pass || !why ? "" : " — " + why));
function report() {
  for (const l of ok) console.log("PASS " + l);
  for (const l of fail) console.log("FAIL " + l);
  console.log((fail.length ? "FAIL" : "PASS") + " · " + ok.length + " passed, " + fail.length + " failed");
  process.exit(fail.length ? 1 : 0);
}

// 1. the page
const ff = spawnSync("node", [join(root, "tests/run-ff.mjs"), "lit", "--timeout=900"], { encoding: "utf8", timeout: 960000, maxBuffer: 1 << 29 });
const fx = [], files = {};
for (const line of (ff.stdout || "").split("\n")) {
  let m = /^VFX (PASS|FAIL) (.*)$/.exec(line);
  if (m) t("page: " + m[2], m[1] === "PASS", m[2]);
  m = /^VFX LIT (\{.*\})$/.exec(line);
  if (m) fx.push(JSON.parse(m[1]));
  m = /^VFX FILE (\d+) (\S+) (\S*)$/.exec(line);
  if (m) (files[m[1]] = files[m[1]] || []).push({ name: m[2], data: Buffer.from(m[3], "base64") });
  m = /^VFX PIC (\S+) (\S+)$/.exec(line);
  if (m) writeFileSync(join(RENDERS, m[1] + ".png"), Buffer.from(m[2], "base64"));
}
t("the page exported " + fx.length + " lit effects and ended PASS", /VFX END PASS/.test(ff.stdout || "") && fx.length >= 5,
  (ff.stdout || "").split("\n").filter((l) => /END|threw/.test(l)).join(" ") || (ff.stderr || "").slice(-400));
if (!godot) { console.log("  (no Godot 4 binary: the Godot half is skipped)"); report(); }
if (!fx.length) report();

// 2. into a Godot project
const scratch = mkdtempSync(join(WIP, "vfx-lit-check-"));
const proj = join(scratch, "proj");
mkdirSync(proj, { recursive: true });
writeFileSync(join(proj, "project.godot"), 'config_version=5\n\n[application]\nconfig/name="crunchyvfx-lit-check"\n\n[display]\nwindow/size/viewport_width=960\nwindow/size/viewport_height=540\n');
fx.forEach((e, i) => {
  e.dir = "fx/" + e.base;
  mkdirSync(join(proj, e.dir), { recursive: true });
  for (const f of files[i] || []) writeFileSync(join(proj, e.dir, f.name), f.data);
  e.scene2d = "res://" + e.dir + "/" + e.base + ".tscn";
  e.scene3d = "res://" + e.dir + "/" + e.base + "_3d.tscn";
  t(e.name + ": the export has the sheet, its normal map, both scenes", ["", "_n"].every((s) => (files[i] || []).some((f) => f.name === e.base + s + ".png")) &&
    (files[i] || []).some((f) => f.name === e.base + "_3d.tscn"));
});
const imp = spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 300000 });
const errs = (s) => (s || "").split("\n").filter((l) => /^(SCRIPT )?ERROR|^\s*Parse Error|WARNING: .*(failed|error)/i.test(l) && !/resources still in use at exit/.test(l));
const impErr = errs(imp.stdout).concat(errs(imp.stderr));
t("Godot imports every exported file with no error", impErr.length === 0, impErr.slice(0, 6).join(" | "));

const jobs = fx.map((e) => ({ name: e.name, s2: e.scene2d, s3: e.scene3d, glows: e.glows, stand: e.stand, frames: e.frames, varied: !!e.varied }));
writeFileSync(join(proj, "check.gd"), `extends SceneTree
var jobs = ${JSON.stringify(jobs)}
func _initialize():
	for j in jobs:
		var n2 = load(j.s2).instantiate()
		n2.autoplay = false
		var sp: AnimatedSprite2D = n2.get_node("Sprite")
		var m = sp.material
		var nt = m.get_shader_parameter("normal_sheet") if m is ShaderMaterial else null
		var glow = n2.get_node_or_null("Sprite/Glow")
		print("CHECK2D ", j.name, " | ", m is ShaderMaterial, " | ", nt is Texture2D, " | ", glow != null, " | ", (glow.material is ShaderMaterial) if glow else false)
		var n3 = load(j.s3).instantiate()
		n3.autoplay = false
		var s3: AnimatedSprite3D = n3.get_node("Sprite")
		var mo = s3.material_override
		var ok3 = mo is ShaderMaterial and mo.get_shader_parameter("sheet") is Texture2D and mo.get_shader_parameter("normal_sheet") is Texture2D
		print("CHECK3D ", j.name, " | ", ok3, " | ", mo.get_shader_parameter("glow_threshold") if mo is ShaderMaterial else -1.0)
		n2.free()
		n3.free()
	_later()
# Variety's flips flip the normal map too: over many plays the material's flip follows the sprite's flips (in the tree)
func _later():
	await process_frame
	for j in jobs:
		if not j.varied:
			continue
		var n3 = load(j.s3).instantiate()
		n3.autoplay = false
		n3.free_when_done = false
		n3.variety_seed = 7
		root.add_child(n3)
		await process_frame
		var s3: AnimatedSprite3D = n3.get_node("Sprite")
		var agree := 0
		var flipped := 0
		for k in 24:
			n3.play()
			var fv = s3.material_override.get_shader_parameter("flip")
			var f: Vector2 = fv if fv != null else Vector2.ONE
			if (f.x < 0.0) == s3.flip_h and (f.y < 0.0) == s3.flip_v:
				agree += 1
			if s3.flip_h:
				flipped += 1
		print("FLIP3D ", j.name, " | ", agree, " | ", flipped)
		n3.queue_free()
	quit()
`);
const chk = spawnSync(godot, ["--headless", "--path", proj, "-s", "res://check.gd"], { encoding: "utf8", timeout: 300000 });
const out = (chk.stdout || "") + (chk.stderr || "");
for (const e of fx) {
  const m2 = new RegExp("CHECK2D " + e.name + " \\| (\\w+) \\| (\\w+) \\| (\\w+) \\| (\\w+)").exec(out);
  t(e.name + ": the 2D scene's Sprite wears the lit ShaderMaterial with its normal sheet" + (e.glows ? ", and a Glow child (unshaded)" : ", and no Glow child (nothing glows)"),
    m2 && m2[1] === "true" && m2[2] === "true" && m2[3] === String(!!e.glows) && m2[4] === String(!!e.glows), m2 ? m2[0] : out.slice(-300));
  const m3 = new RegExp("CHECK3D " + e.name + " \\| (\\w+) \\| ([\\d.]+)").exec(out);
  t(e.name + ": the 3D sprite's material_override has the sheet and the normal sheet", m3 && m3[1] === "true", m3 ? m3[0] : "");
}
for (const e of fx.filter((x) => x.varied)) {
  const m = new RegExp("FLIP3D " + e.name + " \\| (\\d+) \\| (\\d+)").exec(out);
  t(e.name + ": in 3D, Variety's flips flip the normal map with the picture (24 plays, every one agrees, some flipped)", m && +m[1] === 24 && +m[2] > 0 && +m[2] < 24, m ? m[0] : out.slice(-300));
}
t("the scene checks ran with no script error", errs(chk.stdout).concat(errs(chk.stderr)).length === 0, errs(chk.stderr).slice(0, 3).join(" | "));

// 3. renders: each effect held on one frame, the light on its left, then its right (and, 2D, no light at all)
const DISPLAY = (process.env.WAYLAND_DISPLAY || process.env.DISPLAY) && !process.env.NO_RENDER;
if (DISPLAY) {
  const PER = 12;   // ticks per phase: 4 to settle, the rest held
  const rfx = fx.filter((e) => !e.varied);
  const shots = rfx.map((e) => ({ s2: e.scene2d, s3: e.scene3d, hold: Math.floor(e.frames * (e.name === "Pixel Explosion" ? 0.3 : 0.45)), stand: e.stand }));
  writeFileSync(join(proj, "lit2d.gd"), `extends Node2D
# Each effect held on one frame under a dark CanvasModulate: a PointLight2D on its left, then its right, then none.
var shots = ${JSON.stringify(shots)}
var tick := 0
var cur: Node2D
var light: PointLight2D
func _ready() -> void:
	RenderingServer.set_default_clear_color(Color(0.086, 0.078, 0.11))
	var cm := CanvasModulate.new()
	cm.color = Color(0.22, 0.22, 0.27)
	add_child(cm)
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1, 0.5)
	gt.width = 512
	gt.height = 512
	light = PointLight2D.new()
	light.texture = gt
	light.texture_scale = 2.4
	light.color = Color(1.0, 0.78, 0.5)
	light.energy = 1.6
	light.height = 70.0
	add_child(light)
func _process(_d: float) -> void:
	var i := tick / (${PER} * 3)
	var ph := (tick / ${PER}) % 3
	if i >= shots.size():
		get_tree().quit()
		return
	if tick % (${PER} * 3) == 0:
		if cur:
			cur.queue_free()
		cur = load(shots[i].s2).instantiate()
		cur.autoplay = false
		cur.free_when_done = false
		cur.position = Vector2(480, 290)
		cur.scale = Vector2(3, 3)
		add_child(cur)
	var sp: AnimatedSprite2D = cur.get_node("Sprite")
	sp.frame = shots[i].hold
	sp.pause()
	light.visible = ph < 2
	light.position = Vector2(150 if ph == 0 else 810, 230)
	tick += 1
`);
  writeFileSync(join(proj, "lit2d.tscn"), '[gd_scene format=3]\n\n[ext_resource type="Script" path="res://lit2d.gd" id="1"]\n\n[node name="Lit2D" type="Node2D"]\nscript = ExtResource("1")\n');
  writeFileSync(join(proj, "lit3d.gd"), `extends Node3D
# Each 3D scene held on one frame in the dark: an OmniLight3D on the camera's left, then its right, then none.
var shots = ${JSON.stringify(shots)}
var tick := 0
var cur: Node3D
var light: OmniLight3D
var cam: Camera3D
func _ready() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.086, 0.078, 0.11)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.09, 0.08, 0.1)
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	light = OmniLight3D.new()
	light.light_color = Color(1.0, 0.62, 0.3)
	light.light_energy = 3.0
	light.omni_range = 9.0
	add_child(light)
	cam = Camera3D.new()
	cam.fov = 50
	add_child(cam)
	cam.current = true
func _process(_d: float) -> void:
	var i := tick / (${PER} * 3)
	var ph := (tick / ${PER}) % 3
	if i >= shots.size():
		get_tree().quit()
		return
	if tick % (${PER} * 3) == 0:
		if cur:
			cur.queue_free()
		cur = load(shots[i].s3).instantiate()
		cur.autoplay = false
		cur.free_when_done = false
		cur.position = Vector3(0, 0 if shots[i].stand == "upright" else 1.0, 0)
		add_child(cur)
	var sp: AnimatedSprite3D = cur.get_node("Sprite")
	sp.frame = shots[i].hold
	sp.pause()
	var target := Vector3(0, 1.0, 0)
	cam.position = Vector3(0, 1.2, 3.6)
	cam.look_at(target)
	light.visible = ph < 2
	light.position = Vector3(-2.4 if ph == 0 else 2.4, 1.4, 1.4)
	tick += 1
`);
  writeFileSync(join(proj, "lit3d.tscn"), '[gd_scene format=3]\n\n[ext_resource type="Script" path="res://lit3d.gd" id="1"]\n\n[node name="Lit3D" type="Node3D"]\nscript = ExtResource("1")\n');
  const n = shots.length * PER * 3;
  for (const mode of ["2d", "3d"]) {
    const dir = join(scratch, "frames-" + mode);
    mkdirSync(dir, { recursive: true });
    const mv = spawnSync(godot, ["--path", proj, "--resolution", "960x540", "--fixed-fps", "30", "--write-movie", join(dir, "f.png"), "res://lit" + mode + ".tscn"],
      { encoding: "utf8", timeout: 600000 });
    const frames = existsSync(dir) ? readdirSync(dir).filter((x) => /\.png$/.test(x)).sort() : [];
    t("rendered " + frames.length + " " + mode.toUpperCase() + " frames (a display: " + (process.env.WAYLAND_DISPLAY || process.env.DISPLAY) + ")", frames.length >= n - 2,
      (mv.stderr || "").split("\n").filter((l) => /ERROR/.test(l)).slice(0, 3).join(" | "));
    // per effect: the held frame lit from the left, from the right, and (2D) unlit
    const per = rfx.map((e, i) => [0, 1, 2].map((ph) => join(dir, frames[i * PER * 3 + ph * PER + PER - 2])));
    const py = spawnSync("python3", ["-I", "-c", `
import sys, json
from PIL import Image
bg = (22, 20, 28)
out = []
for trio in json.loads(sys.argv[1]):
    L, R, N = [Image.open(p).convert("RGB") for p in trio]
    w, h = L.size
    a, b = L.load(), R.load()
    n = N.load()
    near = lambda c: abs(c[0]-bg[0]) + abs(c[1]-bg[1]) + abs(c[2]-bg[2]) <= 6
    xs = [x for y in range(0, h, 2) for x in range(0, w, 2) if not near(a[x, y]) or not near(b[x, y])]
    if not xs:
        out.append(None); continue
    x0, x1 = min(xs), max(xs); mid = (x0 + x1) // 2
    def side(px, xa, xb):
        s = k = 0
        for y in range(0, h, 2):
            for x in range(xa - xa % 2, xb, 2):
                c = px[x, y]
                if near(a[x, y]) and near(b[x, y]): continue
                s += c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1; k += 1
        return s / k if k else 0
    bright = sum(1 for y in range(0, h, 2) for x in range(0, w, 2) if n[x, y][0] * 0.3 + n[x, y][1] * 0.6 + n[x, y][2] * 0.1 > 150)
    out.append([side(a, x0, mid) - side(a, mid, x1 + 1), side(b, mid, x1 + 1) - side(b, x0, mid), bright])
print(json.dumps(out))
`, JSON.stringify(per.filter((p) => p.every((f) => existsSync(f))))], { encoding: "utf8" });
    let stats = [];
    try { stats = JSON.parse(py.stdout.trim().split("\n").pop()); } catch (e) { /* none */ }
    rfx.forEach((e, i) => {
      const s = stats[i];
      t(e.name + " in Godot " + mode.toUpperCase() + ": lit from the left its left half is brighter, from the right its right half",
        s && s[0] > 1 && s[1] > 1, s ? s.slice(0, 2).map((v) => v.toFixed(1)).join(" ") : (py.stderr || "").slice(-200));
      if (mode === "2d" && e.glows) t(e.name + " in Godot 2D with NO light, under the dark CanvasModulate: its glowing pixels still show bright (the Glow child)",
        s && s[2] > 40, s ? String(s[2]) : "");
      const sheet = join(RENDERS, "godot" + mode + "-" + e.base + ".png");
      spawnSync("montage", per[i].slice(0, mode === "2d" && e.glows ? 3 : 2).concat(["-tile", "x1", "-geometry", "480x270+2+2", "-background", "#111",
        "-title", e.name + " (Godot " + mode.toUpperCase() + "): light on the left | on the right" + (mode === "2d" && e.glows ? " | no light" : ""), "-fill", "#ddd", sheet]), { encoding: "utf8" });
    });
  }
  t("contact sheets written (" + RENDERS + ")", rfx.every((e) => existsSync(join(RENDERS, "godot2d-" + e.base + ".png")) && existsSync(join(RENDERS, "godot3d-" + e.base + ".png"))));
} else console.log("  (no display, or NO_RENDER=1: renders skipped)");
if (!process.env.KEEP) rmSync(scratch, { recursive: true, force: true });
else console.log("  kept " + scratch);
report();

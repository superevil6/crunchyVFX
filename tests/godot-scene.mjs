// CrunchyVFX — is every Godot export a DROP-IN scene in a real Godot?                 node tests/godot-scene.mjs
//
// VFX-DESIGN §26 (AJ, 2026-10-15: the ready scene is the drop-in way to use an effect). The WEB path, end to end:
//   1. the real index.html (no Tauri) exports four effects through the Export dialog with Godot 4 chosen, pressing
//      Export (tests/godot-scene.js, headless Firefox): a one-shot with a synthesized sound, a one-shot at two sizes,
//      a loop, and (§28) an Icon effect; the zips the button downloaded come back here, with what each scene should say;
//   2. each zip unpacks into its own folder of a scratch Godot 4 project, and Godot's importer runs;
//   3. in a RUNNING SceneTree (--fixed-fps 60), each scene is spawned the README's way (instantiate, position, add_child),
//      with its signals connected AFTER add_child, and never told to play:
//        one-shot: it plays by itself; `impact` fires once, on the expected frame (the sprite's frame at the signal, and
//                  the tick it came on); its sound starts on sound_frame; `finished` fires once; the node is freed;
//        loop:     still playing after more than two cycles, `impact` once per cycle, never `finished`, never freed;
//                  stop() stops it;
//        autoplay unticked: nothing plays until play(), which then plays it through (the desktop's §19 API);
//   4. no Godot errors (stderr and stdout) while importing or playing.
// Needs a Godot 4 binary ($GODOT, else godot / godot4 / godot-mono on PATH) and Firefox; skips (exit 0) without Godot.
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const godot = [process.env.GODOT, "godot", "godot4", "godot-mono"].filter(Boolean).find((b) => {
  const r = spawnSync(b, ["--version"], { encoding: "utf8" });
  return r.status === 0 && /^4\./.test(r.stdout.trim());
});
if (!godot) { console.log("SKIP · no Godot 4 binary found (set $GODOT)"); process.exit(0); }

const ok = [], fail = [], nums = [];
const t = (name, pass, why) => (pass ? ok : fail).push(name + (pass || !why ? "" : " — " + why));

// 1. the web app exports, in Firefox
const ff = spawnSync("node", [join(root, "tests/run-ff.mjs"), "scene"], { encoding: "utf8", timeout: 600000, maxBuffer: 1 << 28 });
const fx = [];
let vyOff = null, momentGd = "", momentTscn = "";
for (const line of (ff.stdout || "").split("\n")) {
  const m = /^VFX SCENEZIP (\{.*\}) (\S+)$/.exec(line);
  if (m) fx.push(Object.assign(JSON.parse(m[1]), { zip: Buffer.from(m[2], "base64") }));
  const o = /^VFX VARIETYOFF (\{.*\})$/.exec(line);
  if (o) vyOff = JSON.parse(o[1]);
  const g = /^VFX MOMENTGD (\S+)$/.exec(line);
  if (g) momentGd = Buffer.from(g[1], "base64").toString("utf8");
  const k = /^VFX MOMENTTSCN (\S+)$/.exec(line);
  if (k) momentTscn = Buffer.from(k[1], "base64").toString("utf8");
}
t("the web build exported five effects with the Export button, Godot 4 chosen (one with Variety)", /VFX END PASS 5/.test(ff.stdout || "") && fx.length === 5,
  (ff.stdout || "").split("\n").filter((l) => /END|ERR/.test(l)).join(" ") || (ff.stderr || "").slice(-400));
if (fx.length !== 5) { report(); }
// §39: Variety OFF is byte for byte: switched on and off again in the dialog, the bundle is the untouched one's
t("§39 Variety off: on then off again in the dialog, every exported file is byte for byte the untouched effect's (negative: while on, they differ)",
  vyOff && vyOff.same === true && vyOff.changedWhileOn === true && vyOff.variety === "", JSON.stringify(vyOff));
// …and the plain scene script is HEAD's, byte for byte (an effect without Variety gets exactly the script it got before)
let headGd = null;
{
  const h = spawnSync("git", ["-C", root, "show", "HEAD:index.html"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const m = /const EFFECT_SCENE_SCRIPT = (\[[\s\S]*?\])\.join\("\\n"\);/.exec(h.stdout || "");
  if (m) headGd = eval(m[1]).join("\n");
}

// 2. unzip (STORE-only, as makeZip writes) into res://fx/<base>/
const unzip = (z) => {
  const out = [];
  for (let o = 0; z.readUInt32LE(o) === 0x04034b50;) {
    const sz = z.readUInt32LE(o + 18), nl = z.readUInt16LE(o + 26), xl = z.readUInt16LE(o + 28);
    const name = z.toString("utf8", o + 30, o + 30 + nl), at = o + 30 + nl + xl;
    out.push({ name: name, data: z.subarray(at, at + sz) });
    o = at + sz;
  }
  return out;
};
const proj = mkdtempSync(join(tmpdir(), "vfx-scene-"));
writeFileSync(join(proj, "project.godot"), 'config_version=5\n\n[application]\nconfig/name="crunchyvfx-scene-check"\n');
for (const e of fx) {
  e.files = unzip(e.zip);
  e.dir = "fx/" + e.base;
  e.scene = "res://" + e.dir + "/" + e.base + ".tscn";
  mkdirSync(join(proj, e.dir), { recursive: true });
  for (const f of e.files) writeFileSync(join(proj, e.dir, f.name), f.data);
  e.tscn = (e.files.find((f) => f.name === e.base + ".tscn") || { data: Buffer.from("") }).data.toString("utf8");
  e.readme = (e.files.find((f) => f.name === "README.txt") || { data: Buffer.from("") }).data.toString("utf8");
  const want = [e.base + ".tscn", e.base + ".gd", "README.txt", e.base + ".crunchy"].concat(e.scales.length > 1
    ? e.scales.flatMap((k) => [e.base + "@" + k + "x.png", e.base + "@" + k + "x.tres"]) : [e.base + ".png", e.base + ".tres"]).concat(e.sound ? [e.base + ".wav"] : []);
  t(e.name + ": the zip holds the sheet, its .tres, the scene, its script, the README (and the WAV when it has a sound)",
    want.every((w) => e.files.some((f) => f.name === w)) && e.files.length === want.length, e.files.map((f) => f.name).join(" "));
  const tres = e.base + (e.scales.length > 1 ? "@1x" : "") + ".tres";
  t(e.name + ": the scene names its .tres (and WAV) relatively, filters Nearest, and carries its impact frame",
    e.tscn.startsWith("[gd_scene format=3]\n") && e.tscn.indexOf('path="' + tres + '"') > 0 && /texture_filter = 1\n/.test(e.tscn) &&
    new RegExp("\\nimpact_frame = " + e.impact + "\\n").test(e.tscn) && (e.sound ? /type="AudioStream" path="[^"]+\.wav"/.test(e.tscn) : !/AudioStream/.test(e.tscn)) &&
    !/res:\/\//.test(e.tscn), e.tscn.slice(0, 600));
  t(e.name + ": the README has the one-line spawn, the impact signal and the options",
    e.readme.indexOf('var fx = preload("res://' + e.base + '.tscn").instantiate(); fx.position = pos; add_child(fx)') >= 0 &&
    /impact/.test(e.readme) && /autoplay/.test(e.readme) && /free_when_done/.test(e.readme) && /impact_frame/.test(e.readme), e.readme.slice(0, 400));
  const gd = (e.files.find((f) => f.name === e.base + ".gd") || { data: Buffer.from("") }).data.toString("utf8");
  if (!e.variety) {
    t(e.name + ": no Variety: its script is HEAD's byte for byte and its scene names no Variety setting", headGd !== null && gd === headGd &&
      !/flip_h|animations|variety/.test(e.tscn), headGd === null ? "HEAD's script not found" : "differs");
  } else {
    const tres = (e.files.find((f) => f.name === e.base + ".tres") || { data: Buffer.from("") }).data.toString("utf8");
    const pngs = e.files.filter((f) => /\.png$/.test(f.name)).length;
    t(e.name + ": Variety: the varied script (negative: not HEAD's), ONE sheet, one SpriteFrames animation per baked variation, each named with its own impact frame in the scene",
      gd !== headGd && /func _vary\(\)/.test(gd) && pngs === 1 && e.anims.length === 4 && e.anims.every((a) => tres.indexOf('"name": &"' + a + '"') > 0) &&
      e.tscn.indexOf("impact_frames = PackedInt32Array(" + e.impacts.join(", ") + ")") > 0 && /rotation_mode = 1\n/.test(e.tscn) && /flip_h = true\nflip_v = true\n/.test(e.tscn) &&
      /VARIETY/.test(e.readme), JSON.stringify({ anims: e.anims, impacts: e.impacts, pngs: pngs }) + " " + e.tscn.slice(200, 700));
  }
  t(e.name + ": the Export dialog said it in plain words", /Godot 4: a ready scene/.test(e.note) &&
    (e.loop ? /loops/.test(e.note) : /frees itself/.test(e.note)), e.note.slice(0, 300));
}
writeFileSync(join(proj, "crunchy_moment.gd"), momentGd);
// the baked family may share one impact frame; a copy of the varied scene with DISTINCT ones (1, 3, 5, 7) proves each
// animation fires on its own (a mixed-up index would fire on another's)
const ALT = [1, 3, 5, 7], vfx = fx.find((x) => x.variety);
if (vfx) writeFileSync(join(proj, vfx.dir, vfx.base + "-alt.tscn"), vfx.tscn.replace(/impact_frames = PackedInt32Array\([^)]*\)/, "impact_frames = PackedInt32Array(" + ALT.join(", ") + ")"));
writeFileSync(join(proj, "varied_hit.tscn"), momentTscn);
const imp = spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 240000 });
// (A WAV still sounding when the script quits, because --fixed-fps outruns real time, would say "resources still in use
// at exit": the harness's, not the scene's, so that one line is not counted.)
const errs = (s) => (s || "").split("\n").filter((l) => /^(SCRIPT )?ERROR|^\s*Parse Error|WARNING: .*(failed|error)/i.test(l) && !/resources still in use at exit/.test(l));
const impErr = errs(imp.stdout).concat(errs(imp.stderr));
t("Godot imports every exported file with no error", impErr.length === 0, impErr.slice(0, 6).join(" | "));

// 3. play them in a running Godot: spawned as the README says, signals connected after add_child, never told to play
const LIMIT = Math.max.apply(null, fx.map((e) => (e.variety ? Math.max.apply(null, e.animFrames) / 0.9 : e.frames) / e.fps)) * 3 + 2.5;
writeFileSync(join(proj, "play.gd"), `extends SceneTree
var runs = []
var tick = 0
var t = 0.0
func spawn(path, loop, autoplay):
	var fx = load(path).instantiate()
	if not autoplay:
		fx.autoplay = false
	fx.position = Vector2(100, 80)
	root.add_child(fx)
	var sp = fx.get_node("Sprite")
	var snd = fx.get_node_or_null("Sound")
	var run = { "path": path, "loop": loop, "autoplay": autoplay, "node": fx, "sp": sp, "snd": snd, "impacts": [], "finished": 0,
		"playing_at_first_tick": false, "played_frames": [], "sound_frame": -1, "freed_at": -1, "stopped": false, "playing_after_stop": null,
		"impact_frame": fx.impact_frame, "sound_frame_set": fx.sound_frame, "frames": sp.sprite_frames.get_frame_count("default"),
		"fps": sp.sprite_frames.get_animation_speed("default"), "anim_loop": sp.sprite_frames.get_animation_loop("default"),
		"filter": fx.texture_filter, "pos": fx.position, "playing_before_play": null, "scale": null, "rot": null, "anim": "" }
	fx.impact.connect(func(): run["impacts"].append([sp.frame, tick]))
	fx.finished.connect(func(): run["finished"] += 1)
	runs.append(run)
var varied = []
var moment_picks = []
var moment
var target
func spawn_varied(path, seed, group):
	var fx = load(path).instantiate()
	if seed != 0:
		fx.variety_seed = seed
	fx.position = Vector2(100, 80)
	root.add_child(fx)
	var sp = fx.get_node("Sprite")
	var v = { "group": group, "seed": seed, "node": fx, "sp": sp, "impacts": [], "finished": 0, "freed_at": -1, "pick": null }
	fx.impact.connect(func(): v["impacts"].append([sp.frame, String(sp.animation), fx.impact_frame]))
	fx.finished.connect(func(): v["finished"] += 1)
	varied.append(v)
func _initialize():
	for c in ${JSON.stringify(fx.filter((e) => !e.variety).map((e) => [e.scene, e.loop]))}:
		spawn(c[0], c[1], true)
	spawn(${JSON.stringify(fx[0] ? fx[0].scene : "")}, false, false)
	var vp = ${JSON.stringify((fx.find((e) => e.variety) || {}).scene || "")}
	for i in 200:
		spawn_varied(vp, 0, "random")
	for i in 100:
		spawn_varied(vp.replace(".tscn", "-alt.tscn"), 0, "alt")
	for i in 10:
		spawn_varied(vp, 77, "same")
	for i in 10:
		spawn_varied(vp, i + 1, "seeds")
	target = Node2D.new()
	target.position = Vector2(200, 120)
	root.add_child(target)
	moment = load("res://varied_hit.tscn").instantiate()
	root.add_child(moment)
	root.child_entered_tree.connect(_on_child)
func _on_child(n):
	if n.has_method("_vary") and n.get_parent() == root and not varied.any(func(v): return v["node"] == n):
		n.impact.connect(_on_moment_impact.bind(n))
func _on_moment_impact(n):
	moment_picks.append(n.variation)
func _process(delta):
	tick += 1
	t += delta
	if tick % 4 == 0 and tick <= 120:
		moment.play_at(target)
	for v in varied:
		if not is_instance_valid(v["node"]):
			if v["freed_at"] < 0:
				v["freed_at"] = tick
			continue
		if tick == 2:
			var sp = v["sp"]
			var n = v["node"]
			v["pick"] = { "variation": n.variation, "anim": String(sp.animation), "sx": sp.scale.x, "sy": sp.scale.y, "rot": sp.rotation,
				"px": sp.position.x, "py": sp.position.y, "speed": sp.speed_scale, "impact_frame": n.impact_frame, "playing": sp.is_playing() }
	for r in runs:
		var alive = is_instance_valid(r["node"])
		if not alive:
			if r["freed_at"] < 0:
				r["freed_at"] = tick
			continue
		var sp = r["sp"]
		if tick == 2:
			r["playing_at_first_tick"] = sp.is_playing()
			r["scale"] = [sp.scale.x, sp.scale.y]
			r["rot"] = sp.rotation
			r["anim"] = String(sp.animation)
		if sp.is_playing() and (r["played_frames"].is_empty() or r["played_frames"][-1] != sp.frame):
			r["played_frames"].append(sp.frame)
		if r["snd"] and r["sound_frame"] < 0 and r["snd"].playing:
			r["sound_frame"] = sp.frame
		if not r["autoplay"] and tick == 10:
			r["playing_before_play"] = r["node"].is_playing()
			r["node"].play()
		if r["loop"] and not r["stopped"] and t >= ${LIMIT.toFixed(3)} - 0.2:
			r["playing_before_stop"] = sp.is_playing()
			r["node"].stop()
			r["stopped"] = true
			r["playing_after_stop"] = sp.is_playing()
	if t < ${LIMIT.toFixed(3)}:
		return false
	var out = []
	for r in runs:
		var o = {}
		for k in r:
			if k != "node" and k != "sp" and k != "snd":
				o[k] = r[k]
		o["valid"] = is_instance_valid(r["node"])
		o["pos"] = [r["pos"].x, r["pos"].y]
		out.append(o)
	var vout = []
	for v in varied:
		vout.append({ "group": v["group"], "seed": v["seed"], "impacts": v["impacts"], "finished": v["finished"], "freed_at": v["freed_at"],
			"valid": is_instance_valid(v["node"]), "pick": v["pick"] })
	print("PLAYED " + JSON.stringify({ "ticks": tick, "runs": out, "varied": vout, "moment_picks": moment_picks }))
	return true
`);
const pr = spawnSync(godot, ["--headless", "--fixed-fps", "60", "--path", proj, "--script", "res://play.gd"], { encoding: "utf8", timeout: 180000 });
const pm = /PLAYED (\{.*\})/.exec(pr.stdout || "");
const played = pm ? JSON.parse(pm[1]) : null;
if (process.env.VERBOSE) console.log(JSON.stringify(played, null, 1));
const playErr = errs(pr.stdout).concat(errs(pr.stderr));
t("the scenes ran in a real Godot with no error", played && playErr.length === 0, playErr.slice(0, 6).join(" | ") || (pr.stdout + pr.stderr).slice(-600));
const runOf = (e, auto) => played && played.runs.find((r) => r.path === e.scene && r.autoplay === auto);
const tickOf = (frame, fps) => frame / fps * 60;
for (const e of fx.filter((x) => !x.variety)) {
  const r = runOf(e, true);
  t(e.name + ": no Variety: it plays as drawn every time (scale 1, no turn, the default animation)",
    r && r.scale && r.scale[0] === 1 && r.scale[1] === 1 && r.rot === 0 && r.anim === "default", JSON.stringify(r && { scale: r.scale, rot: r.rot, anim: r.anim }));
  if (!r) { t(e.name + ": played", false, "no run"); continue; }
  t(e.name + ": Godot loads it with the exported frames, fps, loop and Nearest filter", r.frames === e.frames && Math.abs(r.fps - e.fps) < 1e-6 &&
    r.anim_loop === e.loop && r.filter === 1 && r.impact_frame === e.impact, JSON.stringify({ frames: r.frames, fps: r.fps, loop: r.anim_loop, filter: r.filter, impact: r.impact_frame }) + " vs " + JSON.stringify(e));
  t(e.name + ": it plays by itself (nobody called play())", r.playing_at_first_tick && r.played_frames.length > 2, JSON.stringify(r.played_frames.slice(0, 8)));
  const first = r.impacts[0];
  // the tick the impact frame is reached: frame / fps seconds after the start at 60 ticks a second (the start is one tick
  // after add_child: the scene defers its autoplay so a signal connected after add_child is heard)
  const want = tickOf(e.impact, e.fps);
  if (e.loop) {
    const cycles = (r.played_frames.filter((f, i, a) => i > 0 && f < a[i - 1]).length);
    t(e.name + ": LOOP — still playing after more than two cycles, `impact` on frame " + e.impact + " every time round, never `finished`, never freed",
      r.valid && r.playing_before_stop === true && cycles >= 2 && r.finished === 0 && r.impacts.length >= cycles && r.impacts.length <= cycles + 1 &&
      r.impacts.every((x) => x[0] === e.impact), JSON.stringify({ valid: r.valid, cycles: cycles, impacts: r.impacts, finished: r.finished }));
    t(e.name + ": stop() stops a loop", r.stopped && r.playing_after_stop === false, JSON.stringify({ stopped: r.stopped, after: r.playing_after_stop }));
    nums.push(e.name + ": " + e.frames + " frames at " + e.fps + " fps, " + cycles + " cycles, impact x" + r.impacts.length + " on frame " + e.impact + ", finished 0, alive");
  } else {
    t(e.name + ": ONE-SHOT — `impact` fires once, on frame " + e.impact + " (tick " + (first ? first[1] : "?") + ", expected ~" + Math.round(want) + ")",
      r.impacts.length === 1 && first[0] === e.impact && Math.abs(first[1] - want) <= 3, JSON.stringify(r.impacts));
    t(e.name + ": `finished` fires once and the node frees itself (is_instance_valid false)", r.finished === 1 && !r.valid && r.freed_at > 0 &&
      Math.abs(r.freed_at - tickOf(e.frames, e.fps)) <= 4, JSON.stringify({ finished: r.finished, valid: r.valid, freed_at: r.freed_at, expect: Math.round(tickOf(e.frames, e.fps)) }));
    t(e.name + ": every frame was shown, in order", r.played_frames.length === e.frames && r.played_frames.every((f, i) => f === i), JSON.stringify(r.played_frames));
    if (e.sound) t(e.name + ": its sound starts on sound_frame (" + r.sound_frame_set + ")", r.sound_frame === r.sound_frame_set, "started on " + r.sound_frame);
    nums.push(e.name + ": " + e.frames + " frames at " + e.fps + " fps, impact on frame " + first[0] + " at tick " + first[1] + " (expected ~" + Math.round(want) +
      "), finished x" + r.finished + ", freed at tick " + r.freed_at + (e.sound ? ", sound on frame " + r.sound_frame : ""));
  }
}
const manual = played && played.runs.find((r) => r.autoplay === false);
t("autoplay unticked: nothing plays until play(), which plays it through, `impact` and `finished` once, then frees it",
  manual && manual.playing_before_play === false && manual.impacts.length === 1 && manual.finished === 1 && !manual.valid,
  JSON.stringify(manual && { before: manual.playing_before_play, impacts: manual.impacts, finished: manual.finished, valid: manual.valid }));

// §39: VARIETY in a real Godot: 200 plays of the varied effect, seeded runs, and a game moment using it
{
  const e = fx.find((x) => x.variety);
  const vs = played ? played.varied : [];
  const rnd = vs.filter((v) => v.group === "random"), picks = rnd.map((v) => v.pick).filter(Boolean);
  const q = Math.PI / 2, near = (a, b) => Math.abs(a - b) < 1e-4;
  const rots = picks.map((p) => p.rot), turns = new Set(rots.map((r) => Math.round(r / q)));
  t("§39 200 plays: every play started on its own, each picked again", rnd.length === 200 && picks.length === 200 && picks.every((p) => p.playing), rnd.length + " " + picks.length);
  t("§39 flips occur both ways (and plays without them)", picks.some((p) => p.sx < 0) && picks.some((p) => p.sx > 0) && picks.some((p) => p.sy < 0) && picks.some((p) => p.sy > 0),
    JSON.stringify(picks.slice(0, 5)));
  t("§39 turns are only ever quarter turns (multiples of 90°), all four seen", rots.every((r) => near(r, Math.round(r / q) * q)) && turns.size === 4,
    JSON.stringify([...turns]) + " " + rots.filter((r) => !near(r, Math.round(r / q) * q)).slice(0, 4));
  t("§39 scales stay in range in whole steps (|scale| 1 or 2, both seen; x and y alike)", picks.every((p) => (Math.abs(p.sx) === 1 || Math.abs(p.sx) === 2) && Math.abs(p.sx) === Math.abs(p.sy)) &&
    picks.some((p) => Math.abs(p.sx) === 1) && picks.some((p) => Math.abs(p.sx) === 2), JSON.stringify(picks.map((p) => p.sx).slice(0, 12)));
  t("§39 speed within ±10% and varied; the nudge whole pixels within 2", picks.every((p) => p.speed >= 0.9 - 1e-6 && p.speed <= 1.1 + 1e-6) && new Set(picks.map((p) => p.speed.toFixed(3))).size > 10 &&
    picks.every((p) => Number.isInteger(p.px) && Number.isInteger(p.py) && Math.abs(p.px) <= 2 && Math.abs(p.py) <= 2) && picks.some((p) => p.px !== 0), "");
  const seen = new Set(picks.map((p) => p.anim));
  t("§39 every baked variation gets picked (" + (e ? e.anims.length : 0) + ")", e && e.anims.every((a) => seen.has(a)) && picks.every((p) => e.anims[p.variation] === p.anim),
    JSON.stringify([...seen]));
  t("§39 `impact` fires once per play, on EACH variation's own frame (" + (e ? e.impacts.join(",") : "") + ")",
    e && rnd.every((v) => v.impacts.length === 1 && v.impacts[0][0] === e.impacts[e.anims.indexOf(v.impacts[0][1])] && v.impacts[0][2] === v.impacts[0][0]),
    JSON.stringify(rnd.filter((v) => !(v.impacts.length === 1 && e && v.impacts[0][0] === e.impacts[e.anims.indexOf(v.impacts[0][1])])).slice(0, 3)));
  const alt = vs.filter((v) => v.group === "alt");
  t("§39 with distinct impact frames (1, 3, 5, 7), each of 100 plays fires on ITS animation's frame, and all four fire",
    e && alt.length === 100 && alt.every((v) => v.impacts.length === 1 && v.impacts[0][0] === ALT[e.anims.indexOf(v.impacts[0][1])]) &&
    new Set(alt.map((v) => v.impacts[0] && v.impacts[0][0])).size === 4, JSON.stringify(alt.filter((v) => !(v.impacts.length === 1 && v.impacts[0][0] === ALT[e.anims.indexOf(v.impacts[0][1])])).slice(0, 3)));
  t("§39 every varied play finishes once and frees itself", rnd.every((v) => v.finished === 1 && !v.valid && v.freed_at > 0), JSON.stringify(rnd.filter((v) => v.finished !== 1 || v.valid).slice(0, 2)));
  const same = vs.filter((v) => v.group === "same").map((v) => JSON.stringify(v.pick)), seeds = vs.filter((v) => v.group === "seeds").map((v) => JSON.stringify(v.pick));
  t("§39 seeded: ten plays with variety_seed 77 pick identically (negative: seeds 1..10 do not)", same.length === 10 && new Set(same).size === 1 && new Set(seeds).size > 3,
    new Set(same).size + " vs " + new Set(seeds).size);
  const mp = played ? played.moment_picks : [];
  t("§39 a game moment (CrunchyMoment) using the varied effect shows more than one variation over repeated plays", mp.length >= 20 && new Set(mp).size > 1,
    JSON.stringify(mp));
  nums.push("Variety: 200 plays, turns " + JSON.stringify([...turns].sort()) + ", animations " + [...seen].length + ", moment picks " + JSON.stringify(mp.slice(0, 16)));
}

rmSync(proj, { recursive: true, force: true });
report();

function report() {
  for (const l of ok) console.log("ok   " + l);
  for (const l of fail) console.log("FAIL " + l);
  for (const n of nums || []) console.log("     " + n);
  console.log(fail.length ? `\nFAIL · ${fail.length} of ${ok.length + fail.length}` : `\nPASS · ${ok.length} checks (${godot})`);
  process.exit(fail.length ? 1 : 0);
}

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
for (const line of (ff.stdout || "").split("\n")) {
  const m = /^VFX SCENEZIP (\{.*\}) (\S+)$/.exec(line);
  if (m) fx.push(Object.assign(JSON.parse(m[1]), { zip: Buffer.from(m[2], "base64") }));
}
t("the web build exported four effects with the Export button, Godot 4 chosen", /VFX END PASS 4/.test(ff.stdout || "") && fx.length === 4,
  (ff.stdout || "").split("\n").filter((l) => /END|ERR/.test(l)).join(" ") || (ff.stderr || "").slice(-400));
if (fx.length !== 4) { report(); }

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
  t(e.name + ": the Export dialog said it in plain words", /Godot 4: a ready scene/.test(e.note) &&
    (e.loop ? /loops/.test(e.note) : /frees itself/.test(e.note)), e.note.slice(0, 300));
}
const imp = spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 240000 });
// (A WAV still sounding when the script quits, because --fixed-fps outruns real time, would say "resources still in use
// at exit": the harness's, not the scene's, so that one line is not counted.)
const errs = (s) => (s || "").split("\n").filter((l) => /^(SCRIPT )?ERROR|^\s*Parse Error|WARNING: .*(failed|error)/i.test(l) && !/resources still in use at exit/.test(l));
const impErr = errs(imp.stdout).concat(errs(imp.stderr));
t("Godot imports every exported file with no error", impErr.length === 0, impErr.slice(0, 6).join(" | "));

// 3. play them in a running Godot: spawned as the README says, signals connected after add_child, never told to play
const LIMIT = Math.max.apply(null, fx.map((e) => e.frames / e.fps)) * 3 + 0.5;
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
		"filter": fx.texture_filter, "pos": fx.position, "playing_before_play": null }
	fx.impact.connect(func(): run["impacts"].append([sp.frame, tick]))
	fx.finished.connect(func(): run["finished"] += 1)
	runs.append(run)
func _initialize():
	for c in ${JSON.stringify(fx.map((e) => [e.scene, e.loop]))}:
		spawn(c[0], c[1], true)
	spawn(${JSON.stringify(fx[0] ? fx[0].scene : "")}, false, false)
func _process(delta):
	tick += 1
	t += delta
	for r in runs:
		var alive = is_instance_valid(r["node"])
		if not alive:
			if r["freed_at"] < 0:
				r["freed_at"] = tick
			continue
		var sp = r["sp"]
		if tick == 2:
			r["playing_at_first_tick"] = sp.is_playing()
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
	print("PLAYED " + JSON.stringify({ "ticks": tick, "runs": out }))
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
for (const e of fx) {
  const r = runOf(e, true);
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

rmSync(proj, { recursive: true, force: true });
report();

function report() {
  for (const l of ok) console.log("ok   " + l);
  for (const l of fail) console.log("FAIL " + l);
  for (const n of nums || []) console.log("     " + n);
  console.log(fail.length ? `\nFAIL · ${fail.length} of ${ok.length + fail.length}` : `\nPASS · ${ok.length} checks (${godot})`);
  process.exit(fail.length ? 1 : 0);
}

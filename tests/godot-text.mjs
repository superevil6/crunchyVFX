// CrunchyVFX — runtime TEXT in a real Godot (VFX-DESIGN §53, AJ 2026-11-05: a damage number the game sets itself).
//                                                                                     node tests/godot-text.mjs
//   1. the web app exports Pixel Damage Number as a Godot scene (tests/godot-text.js, headless Firefox) and proves there
//      that its glyph atlas, laid out as the Text node lays it out, is the app's own drawing of "-237", pixel for pixel;
//   2. a scratch Godot 4 project imports the files with no error;
//   3. in a running SceneTree the scene is spawned, its Text set to "-237" BEFORE add_child: the Sprite plays the
//      text-free frames (<base>_fx.tres), the Text node holds four letters, each at the position and atlas cell the
//      page computed for that frame; show_text(-5) rebuilds it as two; the one-shot still plays through and frees itself.
// Needs Godot 4 ($GODOT, else godot / godot4 / godot-mono) and Firefox; skips (exit 0) without Godot.
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
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
const ok = [], fail = [];
const t = (name, pass, why) => (pass ? ok : fail).push(name + (pass || !why ? "" : " — " + why));
const report = () => {
  for (const o of ok) console.log("ok   " + o);
  for (const f of fail) console.log("FAIL " + f);
  console.log("\n" + (fail.length ? "FAIL · " + fail.length + " of " + (ok.length + fail.length) : "PASS · " + ok.length + " checks") + " (" + godot + ")");
  process.exit(fail.length ? 1 : 0);
};

const ff = spawnSync("node", [join(root, "tests/run-ff.mjs"), "text"], { encoding: "utf8", timeout: 600000, maxBuffer: 1 << 28 });
let compose = null, expect = null, zip = null, momentGd = "", momentTscn = "";
for (const line of (ff.stdout || "").split("\n")) {
  let m = /^VFX TEXTCOMPOSE (\{.*\})$/.exec(line); if (m) compose = JSON.parse(m[1]);
  m = /^VFX TEXTEXPECT (\{.*\})$/.exec(line); if (m) expect = JSON.parse(m[1]);
  m = /^VFX MOMENTGD (\S+)$/.exec(line); if (m) momentGd = Buffer.from(m[1], "base64").toString("utf8");
  m = /^VFX MOMENTTSCN (\S+)$/.exec(line); if (m) momentTscn = Buffer.from(m[1], "base64").toString("utf8");
  m = /^VFX TEXTZIP (\{.*\}) (\S+)$/.exec(line); if (m) zip = Object.assign(JSON.parse(m[1]), { blob: Buffer.from(m[2], "base64").toString("latin1") });
}
t("the web build exported Pixel Damage Number as a Godot scene", /VFX END PASS 1/.test(ff.stdout || "") && zip && expect,
  (ff.stdout || "").split("\n").filter((l) => /END|ERR/.test(l)).join(" ") || (ff.stderr || "").slice(-300));
if (!zip || !expect) report();
t("its glyph atlas, laid out as the Text node does, is the app's own drawing of \"-237\" pixel for pixel (every frame before the break-up)",
  compose && compose.compared >= 6 && compose.diffs === 0, JSON.stringify(compose));
const want = ["", ".png", ".tres", ".tscn", ".gd", "_fx.png", "_fx.tres", "_glyphs.png", "_text.gd"].filter(Boolean).map((x) => zip.base + x);
t("the export carries the text-free frames, the glyph atlas and the text script beside the sheet and scene", want.every((w) => zip.names.includes(w)), zip.names.join(" "));

const proj = mkdtempSync(join(tmpdir(), "vfx-text-"));
writeFileSync(join(proj, "project.godot"), 'config_version=5\n\n[application]\nconfig/name="crunchyvfx-text-check"\n');
const dir = join(proj, "fx", zip.base);
mkdirSync(dir, { recursive: true });
for (const part of zip.blob.split("|")) {
  const i = part.indexOf(":");
  writeFileSync(join(dir, part.slice(0, i)), Buffer.from(part.slice(i + 1), "base64"));
}
writeFileSync(join(proj, "crunchy_moment.gd"), momentGd);
writeFileSync(join(proj, "damage_hit.tscn"), momentTscn);
const errs = (s) => (s || "").split("\n").filter((l) => /^(SCRIPT )?ERROR|^\s*Parse Error|WARNING: .*(failed|error)/i.test(l));
const imp = spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 240000 });
const impErr = errs(imp.stdout).concat(errs(imp.stderr));
t("Godot imports the text scene's files with no error", impErr.length === 0, impErr.slice(0, 5).join(" | "));

const scene = "res://fx/" + zip.base + "/" + zip.base + ".tscn";
writeFileSync(join(proj, "check.gd"), `extends SceneTree
var fx
var mfx
var tick = 0
var out = {}
func letters(tx):
	var a = []
	for c in tx.get_children():
		if c is Sprite2D:
			a.append({ "x": c.position.x, "y": c.position.y, "rx": c.region_rect.position.x, "ry": c.region_rect.position.y, "w": c.region_rect.size.x })
	return a
func _initialize():
	fx = load("${scene}").instantiate()
	fx.get_node("Text").text = "-237"
	fx.position = Vector2(100, 80)
	root.add_child(fx)
	out["frames_res"] = fx.get_node("Sprite").sprite_frames.resource_path
	var moment = load("res://damage_hit.tscn").instantiate()
	root.add_child(moment)
	var target = Node2D.new()
	target.position = Vector2(200, 120)
	root.add_child(target)
	mfx = moment.play_at(target, -99)
	out["moment_fx"] = mfx != null
func _process(_d) -> bool:
	tick += 1
	if not is_instance_valid(fx):
		out["freed_at"] = tick
		print("CHECK " + JSON.stringify(out))
		quit()
		return false
	var tx = fx.get_node("Text")
	if tick == 3:
		tx._show(${expect.frame})
		out["letters"] = letters(tx)
		out["visible"] = tx.visible
		tx.show_text(-5)
		out["after"] = letters(tx).size()
		tx.text = "-237"
	if tick == 3 and is_instance_valid(mfx):
		out["moment_word"] = mfx.get_node("Text").text
		out["moment_letters"] = mfx.get_node("Text")._letters.size()
	if tick > 1 and tx.visible:
		out["seen"] = true
	if tick > 600:
		print("CHECK " + JSON.stringify(out))
		quit()
	return false
`);
const run = spawnSync(godot, ["--headless", "--path", proj, "--fixed-fps", "60", "--script", "res://check.gd"], { encoding: "utf8", timeout: 120000 });
const m = /CHECK (\{.*\})/.exec(run.stdout || "");
const got = m ? JSON.parse(m[1]) : {};
const runErr = errs(run.stdout).concat(errs(run.stderr));
t("in a running Godot the scene plays with no error", m && runErr.length === 0, runErr.slice(0, 5).join(" | ") || (run.stdout || "").slice(-300));
t("its Sprite plays the text-free frames (" + zip.base + "_fx.tres), so the words are only the Text node's", /_fx\.tres$/.test(got.frames_res || ""), got.frames_res);
const L = got.letters || [];
t("Text set to \"-237\" before add_child holds four letters, each at the page's position and atlas cell for frame " + expect.frame,
  L.length === 4 && L.every((l, i) => l.x === expect.letters[i].x && l.y === expect.letters[i].y && l.rx === expect.letters[i].rx && l.ry === expect.letters[i].ry) && got.visible === true,
  JSON.stringify(L) + " vs " + JSON.stringify(expect.letters));
t("show_text(-5) rebuilds it as two letters", got.after === 2, String(got.after));
t("the words show while it plays, and the one-shot frees itself at its end", got.seen === true && got.freed_at > 0, JSON.stringify({ seen: got.seen, freed: got.freed_at }));
t("a game moment's play_at(target, -99) returns the effect it spawned, showing -99 (crunchyCore moments.js 6)",
  got.moment_fx === true && got.moment_word === "-99" && got.moment_letters === 3, JSON.stringify({ fx: got.moment_fx, word: got.moment_word, letters: got.moment_letters }));
try { rmSync(proj, { recursive: true, force: true }); } catch (e) { /* busy */ }
report();

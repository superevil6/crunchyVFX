// tests/vfx-cli.test.mjs — the VFX CLI (tools/vfx-cli.mjs, VFX-DESIGN §42) end to end:
//   1. a batch of every source (a preset, a Wizard pick at three strengths, a .crunchy, a share link) is made
//   2. every folder is a planted effect: the Godot files and a valid .crunchy listing exactly them
//   3. strengths share one Fit box: strength 2's frames hold fewer drawn pixels than 8's
//   4. bad input fails with a message, and makes nothing
//   5. a REAL Godot imports the folders and plays every scene: impact, finished, freed (skipped without Godot)
//
//   node tests/vfx-cli.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "tools/vfx-cli.mjs");
const work = mkdtempSync(join(tmpdir(), "vfx-cli-test-"));
let bad = 0;
const ok = (c, name, info) => { console.log((c ? "PASS " : "FAIL ") + name + (info ? " — " + info : "")); if (!c) bad++; };
const run = (args) => spawnSync("node", [cli].concat(args), { encoding: "utf8", timeout: 600000 });

// a share link for a preset, made by the app's own encoder: the CLI's --json list carries nothing to make one, so the
// link comes from a .crunchy's `s` (the same ?e= string) after the first run
const batch = { out: "fx", effects: [
  { name: "boom", preset: "Pixel Explosion" },
  { name: "hearts", wizard: { type: "hit", tags: ["cute"], moves: ["spin"], seed: 1, pick: 1 }, strengths: [2, 8] },
  { name: "green", preset: "Hit Spark", palette: ["#0b3d20", "#7fd44c", "#e8ff9a"], size: 96, playback: "once" },
] };
writeFileSync(join(work, "batch.json"), JSON.stringify(batch));
const r1 = run(["--batch", join(work, "batch.json"), "--json"]);
let rep = null;
try { rep = JSON.parse(r1.stdout); } catch (e) { /* below */ }
ok(r1.status === 0 && rep && rep.ok && rep.effects.length === 4, "a batch makes every entry (strengths expand)", rep ? rep.effects.map((e) => e.name).join(", ") : r1.stderr.slice(0, 300));

// a .crunchy and a share link, from the folder just made
const fx = join(work, "fx");
const side = JSON.parse(readFileSync(join(fx, "boom", "boom.crunchy"), "utf8"));
const r2 = run(["--crunchy", join(fx, "boom", "boom.crunchy"), "--name", "boom-again", "--out", fx]);
const r3 = run(["--link", "https://crunchyvfx.com/?e=" + side.s, "--name", "boom-link", "--out", fx]);
ok(r2.status === 0 && r3.status === 0, "a .crunchy and a share link make effects", (r2.stderr + r3.stderr).slice(0, 300));
ok(existsSync(join(fx, "boom-again")) && readFileSync(join(fx, "boom-again", "boom-again.png")).equals(readFileSync(join(fx, "boom", "boom.png"))),
   "…and a .crunchy reopens the effect exactly (its sheet byte for byte)");
ok(existsSync(join(fx, "boom-link")) && readFileSync(join(fx, "boom-link", "boom-link.png")).equals(readFileSync(join(fx, "boom", "boom.png"))),
   "…and so does its share link");

// every folder is a planted effect
const dirs = readdirSync(fx);
const shapeBad = dirs.filter((d) => {
  const s = JSON.parse(readFileSync(join(fx, d, d + ".crunchy"), "utf8"));
  const want = [d + ".png", d + ".tres", d + ".tscn", d + ".gd", "README.txt"];
  return s.format !== "crunchy-asset" || s.app !== "crunchyvfx" || s.kind !== "effect" || !s.s || !s.info ||
    want.some((f) => !s.files.includes(f) || !existsSync(join(fx, d, f))) || s.files.length !== readdirSync(join(fx, d)).length - 1;
});
ok(!shapeBad.length, "every folder is a planted effect: the Godot files and a .crunchy listing exactly them", shapeBad.join(", ") || dirs.length + " folders");
const green = JSON.parse(readFileSync(join(fx, "green", "green.crunchy"), "utf8"));
ok(green.info.w === 96 && green.exp.playback === "once", "size and playback reach the export", green.info.w + " px, " + green.exp.playback);

// strengths share one Fit box: the weak one draws fewer pixels than the strong one
const opaque = (png) => {   // count non-transparent pixels in an 8-bit RGBA PNG (no filters needed for a count of nonzero alpha? they are: unfilter)
  const d = readFileSync(png); let i = 8, w = 0, h = 0; const idat = [];
  while (i < d.length) { const n = d.readUInt32BE(i), t = d.toString("latin1", i + 4, i + 8); if (t === "IHDR") { w = d.readUInt32BE(i + 8); h = d.readUInt32BE(i + 12); } if (t === "IDAT") idat.push(d.subarray(i + 8, i + 8 + n)); i += 12 + n; }
  const raw = inflateSync(Buffer.concat(idat)), bpr = w * 4, cur = Buffer.alloc(bpr), prev = Buffer.alloc(bpr); let n = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (bpr + 1)], row = raw.subarray(y * (bpr + 1) + 1, (y + 1) * (bpr + 1));
    for (let x = 0; x < bpr; x++) {
      const a = x >= 4 ? cur[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0, p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      cur[x] = (row[x] + [0, a, b, (a + b) >> 1, pr][f]) & 255;
    }
    for (let x = 3; x < bpr; x += 4) if (cur[x]) n++;
    cur.copy(prev);
  }
  return n;
};
const s2 = opaque(join(fx, "hearts-s2", "hearts-s2.png")), s8 = opaque(join(fx, "hearts-s8", "hearts-s8.png"));
ok(s2 * 1.5 < s8, "strengths share one Fit box: strength 2 draws far less than 8", s2 + " vs " + s8 + " px");

// bad input
const r4 = run(["--preset", "No Such Effect", "--out", join(work, "nothing")]);
const r5 = run(["--wizard", "hit", "--tags", "nonsense", "--out", join(work, "nothing")]);
const r6 = run(["--preset", "Explosion", "--strength", "12", "--out", join(work, "nothing")]);
ok(r4.status !== 0 && /no preset/.test(r4.stderr) && r5.status !== 0 && /no Wizard tag/.test(r5.stderr) && r6.status !== 0 && /1 to 9/.test(r6.stderr) &&
   !existsSync(join(work, "nothing")), "bad input fails with a message and makes nothing", [r4.stderr, r5.stderr, r6.stderr].map((s) => s.trim()).join(" | "));

// a REAL Godot plays them
const godot = [process.env.GODOT, "godot", "godot4", "godot-mono"].filter(Boolean).find((b) => spawnSync(b, ["--version"], { encoding: "utf8" }).status === 0);
if (!godot) console.log("SKIP Godot · no Godot 4 binary found (set $GODOT)");
else {
  const proj = join(work, "godot");
  mkdirSync(proj);
  writeFileSync(join(proj, "project.godot"), 'config_version=5\n[application]\nconfig/name="cli"\n');
  cpSync(fx, join(proj, "fx"), { recursive: true });
  const names = readdirSync(fx);
  writeFileSync(join(proj, "play.gd"), `extends SceneTree
var seen := {}
var frames := 0
func _initialize() -> void:
	for n in ${JSON.stringify(names)}:
		var fx = load("res://fx/%s/%s.tscn" % [n, n]).instantiate()
		seen[n] = {"impact": false, "finished": false, "freed": false}
		fx.impact.connect(func(): seen[n]["impact"] = true)
		fx.finished.connect(func(): seen[n]["finished"] = true)
		fx.tree_exited.connect(func(): seen[n]["freed"] = true)
		root.add_child(fx)
func _process(_d: float) -> bool:
	frames += 1
	if frames > 900 or seen.values().all(func(v): return v["freed"]):
		for n in seen: print("CLI ", n, " ", JSON.stringify(seen[n]))
		quit()
	return false
`);
  spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 240000 });
  const p = spawnSync(godot, ["--headless", "--fixed-fps", "60", "--path", proj, "--script", "res://play.gd"], { encoding: "utf8", timeout: 180000 });
  const lines = (p.stdout || "").split("\n").filter((l) => l.startsWith("CLI "));
  const played = lines.filter((l) => /"impact":true/.test(l) && /"finished":true/.test(l) && /"freed":true/.test(l));
  ok(lines.length === names.length && played.length === names.length, "real Godot plays every CLI scene: impact, finished, freed",
     played.length + " of " + names.length + (played.length < names.length ? " · " + (lines.join(" ; ") || p.stderr.slice(-400)) : ""));
}

rmSync(work, { recursive: true, force: true });
console.log(bad ? "✗ " + bad + " FAILED" : "✓ ALL PASS");
process.exit(bad ? 1 : 0);

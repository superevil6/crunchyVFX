#!/usr/bin/env node
// CrunchyVFX from the command line (VFX-DESIGN §42; asked for by Painter Panic, crunchyCore VFX-CLI-HANDOFF.md).
//
// VFX draws on a 2D canvas, so this does not reimplement it in Node: it opens the app itself (index.html) in a headless
// Firefox, makes each effect with the app's own code (tools/vfx-cli-page.js: the calls the desktop Library makes when
// it saves an effect), and writes what comes back. So an effect here is the app's effect, Godot scene and all.
// Run `node tools/vfx-cli.mjs --help` for the options.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HELP = `CrunchyVFX CLI: make effects without opening the app.

  node tools/vfx-cli.mjs <one source> [options] [--out DIR]
  node tools/vfx-cli.mjs --batch effects.json
  node tools/vfx-cli.mjs --list [presets|categories|types|tags|moves|eras|sizes|power|params]

One source:
  --preset "Name"            a shipped preset (--list presets)
  --crunchy file.crunchy     an effect saved by the desktop Library (its own settings, sound and export options)
  --link "https://…?e=…"     a share link copied from the app
  --wizard TYPE              the Wizard: --tags a,b  --moves a,b  --era "Super"  --seed N  --pick 1..9
                             (the same answers and seed always give the same nine; --pick takes one of them)

Options:
  --strength N               the Wizard's Power dial, 1 (tame) to 9 (devastating); 5 = as made
  --strengths 2,5,8          one effect at several strengths, each named <name>-s<N>
                             (all fitted in one box, so a weak one draws smaller; --fit-apart fits each to its frame)
  --type KEY                 what kind of moment it is, for the top of the dial (hit, explosion, spell, projectile and
                             pickup gain a flash, shockwave and bursts; others only get denser); presets know their own
  --name "Name"              the effect's name (its folder is the name as a slug)
  --era "Name"               an era style (--list eras)
  --size PX                  the frame size (--list sizes)
  --palette "#hex,#hex"      lock the effect to these colors
  --set key=value            any row (--list params); repeat for more
  --play auto|loop|once      --trim / --no-trim   --scales 1,2   --meta godot|generic|aseprite|phaser|none
  --no-sound                 leave out the synthesized sound a .crunchy effect carries
  --out DIR                  where the effect folders go (default .)
  --godot-import             afterwards, run Godot's import on the project the folders are in (else an open editor
                             does not see the new files until it is focused)
  --json                     print a machine-readable report
  --timeout S                give up after S seconds (default 600)

Each effect is written as DIR/<slug>/: the Export dialog's files (Godot: <base>.png, <base>.tres, <base>.tscn, <base>.gd,
README.txt, and <base>.wav when it has a sound) and <slug>.crunchy, exactly what the desktop Library plants, so a game's
crunchy/vfx/ folder shows them in the Library too. Writing over an effect replaces only the files its old .crunchy lists.

A batch file: { "out": "crunchy/vfx", "effects": [ { "name": "attack-ameko", "wizard": { "type": "hit", "tags": ["cute"],
"seed": 1, "pick": 3 }, "strengths": [2, 5, 8] }, { "name": "boom", "preset": "Pixel Explosion", "palette": ["#f6d743"] } ] }
Every option above is a key there (crunchy: a path, relative to the batch file; set: an object).

Pixels: rendered by Firefox, as the web app is. The desktop app renders with WebKit; the same effect, though an
anti-aliased edge can differ by a shade.`;

const here = dirname(fileURLToPath(import.meta.url)), app = resolve(here, "..");
const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) { console.log(HELP); process.exit(argv.length ? 0 : 2); }
const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const nums = (s) => String(s).split(",").map((x) => +x.trim()).filter((x) => !isNaN(x));
const words = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean);
const die = (m) => { console.error("vfx-cli: " + m); process.exit(2); };
const json = has("--json"), timeout = (+val("--timeout") || 600) * 1000;

// ---- the jobs ----
let outDir = resolve(val("--out") || "."), jobs = [], listing = null;
const readCrunchy = (p, base) => { const f = resolve(base, p); try { return JSON.parse(readFileSync(f, "utf8")); } catch (e) { die("could not read " + f + ": " + e.message); } };
function expand(e, base) {
  const j = Object.assign({}, e);
  if (typeof j.crunchy === "string") j.crunchy = readCrunchy(j.crunchy, base);
  const ss = j.strengths;
  delete j.strengths;
  if (!ss) return [j];
  const nm = j.name || j.preset || (j.crunchy && j.crunchy.exportName);
  if (!nm) die("an entry with strengths needs a name");
  // one Fit box for the set (unless "fitApart"), so strength 2 draws smaller than 8 rather than being blown up to fill
  const group = j.fitApart ? undefined : ss.slice();
  delete j.fitApart;
  return ss.map((n) => Object.assign({}, j, { strength: n, name: nm + "-s" + n, group }));
}
if (has("--list")) listing = val("--list") && !val("--list").startsWith("--") ? val("--list") : "all";
else if (val("--batch")) {
  const bf = resolve(val("--batch"));
  let b; try { b = JSON.parse(readFileSync(bf, "utf8")); } catch (e) { die("could not read " + bf + ": " + e.message); }
  if (!Array.isArray(b.effects)) die("a batch file has an \"effects\" list");
  if (b.out && !val("--out")) outDir = resolve(dirname(bf), b.out);
  for (const e of b.effects) jobs.push(...expand(e, dirname(bf)));
} else {
  const e = {};
  if (val("--preset")) e.preset = val("--preset");
  if (val("--crunchy")) e.crunchy = val("--crunchy");
  if (val("--link")) e.link = val("--link");
  if (val("--wizard")) e.wizard = { type: val("--wizard"), tags: val("--tags") ? words(val("--tags")) : [], moves: val("--moves") ? words(val("--moves")) : [],
                                    era: val("--era") || "", seed: +val("--seed") || 1, pick: +val("--pick") || 1 };
  else if (val("--era")) e.era = val("--era");
  if (val("--name")) e.name = val("--name");
  if (val("--strength")) e.strength = +val("--strength");
  if (val("--strengths")) e.strengths = nums(val("--strengths"));
  if (val("--type")) e.type = val("--type");
  if (val("--size")) e.size = +val("--size");
  if (val("--palette")) e.palette = words(val("--palette"));
  if (val("--play")) e.playback = val("--play");
  if (val("--meta")) e.meta = val("--meta");
  if (val("--scales")) e.scales = nums(val("--scales"));
  if (has("--trim")) e.trim = true;
  if (has("--no-trim")) e.trim = false;
  if (has("--no-sound")) e.sound = false;
  if (has("--fit-apart")) e.fitApart = true;
  argv.forEach((a, i) => {
    if (a !== "--set") return;
    const kv = argv[i + 1] || "", at = kv.indexOf("=");
    if (at < 1) die("--set takes key=value");
    const v = kv.slice(at + 1);
    (e.set = e.set || {})[kv.slice(0, at)] = v === "" || isNaN(+v) ? v : +v;
  });
  jobs = expand(e, process.cwd());
}

// ---- a headless Firefox with the app, driven over WebDriver BiDi ----
const prof = mkdtempSync(join(tmpdir(), "vfx-cli-"));
const port = 9300 + Math.floor(Math.random() * 600);
const ff = spawn("firefox", ["--headless", "--new-instance", "-no-remote", "--profile", prof, "--remote-debugging-port", String(port),
  "--window-size=1400,900"], { stdio: "ignore" });
let gone = false;
ff.on("exit", () => { gone = true; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quit = (code) => {
  try { ff.kill("SIGTERM"); } catch (e) { /* already gone */ }
  setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch (e) { /* busy */ } process.exit(code); }, 600);
};
setTimeout(() => { console.error("vfx-cli: gave up after " + timeout / 1000 + " s"); quit(1); }, timeout);

let ws = null;
for (let i = 0; i < 120 && !ws && !gone; i++) {
  await sleep(500);
  try { ws = await new Promise((res, rej) => { const w = new WebSocket(`ws://127.0.0.1:${port}/session`); w.onopen = () => res(w); w.onerror = rej; }); } catch (e) { ws = null; }
}
if (!ws) { console.error("vfx-cli: Firefox did not start (is firefox installed?)"); quit(1); }
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
let context;
const evalJs = async (expression) => {
  const r = await send("script.evaluate", { expression, target: { context }, awaitPromise: true, serializationOptions: { maxObjectDepth: 1 } });
  if (r.error) throw new Error(r.message || r.error);
  if (r.result.type === "exception") throw new Error(((r.result.exceptionDetails && r.result.exceptionDetails.text) || "the page threw").replace(/^Error: /, ""));
  return r.result.result.value;
};
// everything crosses as one JSON string: BiDi's own serialization of nested objects is verbose and depth-limited
const call = async (expr) => JSON.parse(await evalJs(`(async () => JSON.stringify(await (${expr})))()`));

try {
  await send("session.new", { capabilities: {} });
  context = (await send("browsingContext.getTree", {})).result.contexts[0].context;
  await send("browsingContext.navigate", { context, url: "file://" + join(app, "index.html"), wait: "complete" });
  for (let i = 0; i < 120; i++) {
    if (await evalJs("typeof plantedRender === 'function' && typeof wizardCandidates === 'function' && typeof PRESETS === 'object'")) break;
    await sleep(250);
  }
  await evalJs(readFileSync(join(here, "vfx-cli-page.js"), "utf8") + "\n;true");

  if (listing) {
    const L = await call("vfxCli.list()");
    if (json) console.log(JSON.stringify(listing === "all" ? L : L[listing], null, 2));
    else {
      const show = (k) => {
        const v = L[k];
        if (v === undefined) die("--list takes presets, categories, types, tags, moves, eras, sizes, power or params");
        console.log(k + ":");
        if (k === "categories") v.forEach((c) => console.log("  " + c.name + ": " + c.presets.join(", ")));
        else if (k === "params") v.forEach((p) => console.log("  " + p.key.padEnd(15) + " " + (p.group + " / " + p.label).padEnd(34) + " " +
          (p.values ? p.values.map((x, i) => i + "=" + x).join(" ") : p.min + " to " + p.max) + "  (default " + p.def + ")"));
        else console.log("  " + v.join(k === "power" ? "\n  " : ", "));
      };
      if (listing === "all") { console.log("CrunchyVFX " + L.version); ["presets", "types", "tags", "moves", "eras", "sizes", "power"].forEach(show); console.log("(--list params for every row)"); }
      else show(listing);
    }
    quit(0);
  } else {
    const report = [];
    let bad = 0;
    for (const j of jobs) {
      const name = j.name || j.preset || "effect";
      try {
        // writing over an effect: keep its created date, and remove only the files ITS sidecar listed that are gone now
        const slugGuess = await call("plantSlug(" + JSON.stringify(String(j.name || "")) + ")");
        const prevPath = j.name ? join(outDir, slugGuess, slugGuess + ".crunchy") : null;
        let prev = null;
        if (prevPath && existsSync(prevPath)) try { prev = JSON.parse(readFileSync(prevPath, "utf8")); } catch (e) { prev = null; }
        if (prev && prev.created) j.created = prev.created;
        const t0 = Date.now(), r = await call("vfxCli.run(" + JSON.stringify(j) + ")");
        const dir = join(outDir, r.slug);
        mkdirSync(dir, { recursive: true });
        for (let i = 0; i < r.files.length; i++) {
          const parts = [];
          for (let at = 0; at < r.files[i].size || at === 0; at += 4 << 20) {
            parts.push(Buffer.from(await evalJs(`vfxCli.chunk(${i}, ${at}, ${4 << 20})`), "base64"));
            if (r.files[i].size === 0) break;
          }
          writeFileSync(join(dir, r.files[i].path), Buffer.concat(parts));
        }
        if (prev && Array.isArray(prev.files)) {
          const now = new Set(r.files.map((f) => f.path));
          for (const old of prev.files) if (!now.has(old) && !old.includes("/") && !old.includes("..")) {
            for (const p of [join(dir, old), join(dir, old + ".import")]) if (existsSync(p)) unlinkSync(p);
          }
        }
        report.push({ name: r.name, dir, frames: r.info.frames, size: r.info.w + "x" + r.info.h, fps: r.info.fps,
                      files: r.files.map((f) => f.path), ms: Date.now() - t0, from: r.label });
        if (!json) console.log("  " + r.name + "  ->  " + dir + "  (" + r.info.frames + " frames, " + r.info.w + "x" + r.info.h + ", " + r.info.fps + " fps; " +
                               r.files.length + " files)");
      } catch (e) {
        bad++;
        report.push({ name, error: e.message });
        if (!json) console.error("  " + name + ": " + e.message);
      }
    }
    // --godot-import: a new drop is invisible to an open Godot until it is imported, so import it now
    let imported = null;
    if (has("--godot-import") && report.some((r) => !r.error)) {
      let d = outDir;
      while (d !== dirname(d) && !existsSync(join(d, "project.godot"))) d = dirname(d);
      const gd = [process.env.GODOT, "godot", "godot4", "godot-mono"].filter(Boolean).find((b) => spawnSync(b, ["--version"], { encoding: "utf8" }).status === 0);
      if (!existsSync(join(d, "project.godot"))) imported = "no project.godot above " + outDir;
      else if (!gd) imported = "no Godot binary found (set $GODOT)";
      else {
        const g = spawnSync(gd, ["--headless", "--path", d, "--import"], { encoding: "utf8", timeout: 300000 });
        imported = g.status === 0 ? "imported in " + d : "Godot's import failed: " + (g.stderr || "").slice(-300);
        if (g.status !== 0) bad++;
      }
    }
    if (json) console.log(JSON.stringify({ ok: !bad, effects: report, godotImport: imported }, null, 2));
    else console.log(jobs.length - bad + " of " + jobs.length + " made" + (imported ? "; " + imported : ""));
    quit(bad ? 1 : 0);
  }
} catch (e) {
  console.error("vfx-cli: " + e.message);
  quit(1);
}

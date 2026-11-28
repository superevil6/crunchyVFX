// <vfx13-shapes> CrunchyVFX: the 3D-native forms (VFX-DESIGN §61.8) in the real app (tests/shapes3d-dom.js in headless
// Firefox): checks, and the room's pictures saved as PNGs to $SHAPES3D_PICS (default ~/.cache/crunchy-wip/vfx-1.3c/shapes-scratch/pics).
//   node tests/shapes3d.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.SHAPES3D_PICS || join(process.env.HOME, ".cache/crunchy-wip/vfx-1.3c/shapes-scratch/pics");
mkdirSync(OUT, { recursive: true });
// LOOK="A,B" (preset names): the rooms to render (default: every preset the auto table makes 3D-native), handed to the page
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(join(root, "fx3d.js"), "utf8"), ctx);
const look = process.env.LOOK ? process.env.LOOK.split(",") : [].concat(...Object.values(vm.runInContext("FX3D_AUTO_FORM", ctx)));
// and base's fx3d.js (the untouched snapshot), so the page can prove a card writes exactly what it wrote
const baseFx = join(root, "../base/fx3d.js");
let baseSrc = null; try { baseSrc = readFileSync(baseFx, "utf8"); } catch (e) { console.log("  (no " + baseFx + ": the byte proof against base is skipped)"); }
writeFileSync(join(root, "tests/shapes3d-look.js"), "var SHAPES3D_LOOK = " + JSON.stringify(look) + ";\nvar SHAPES3D_BASE_FX3D = " + JSON.stringify(baseSrc) + ";\n");
const ff = spawnSync("node", [join(root, "tests/run-ff.mjs"), "shapes3d", "--timeout=900"], { encoding: "utf8", timeout: 960000, maxBuffer: 1 << 29 });
let pass = 0, fail = 0, end = "";
for (const line of (ff.stdout || "").split("\n")) {
  let m = /^VFX PIC (.+) (\d+) (\d+) (\S+)$/.exec(line);
  if (m) { writeFileSync(join(OUT, m[1].replace(/[^A-Za-z0-9.]+/g, "_") + ".png"), Buffer.from(m[4], "base64")); continue; }
  if (/^VFX PASS/.test(line)) pass++;
  if (/^VFX FAIL/.test(line)) fail++;
  if (/^VFX (PASS|FAIL|INFO|END)/.test(line) || /\(console\)/.test(line)) console.log(line.slice(0, 400));
  if (/^VFX END/.test(line)) end = line;
}
console.log((fail || !/END PASS/.test(end) ? "FAIL" : "PASS") + " · " + pass + " passed, " + fail + " failed · pictures in " + OUT);
process.exit(fail || !/END PASS/.test(end) ? 1 : 0);

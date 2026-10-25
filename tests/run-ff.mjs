// Run one of tests/build.py's named suites in a headless Firefox and print what it says.
//
//   node tests/run-ff.mjs <suite> [--quiet] [--timeout=<s>]
//
// The suites are ASYNC (canvas.toBlob, the planted Library's file work), and Firefox's --screenshot
// fires at window.load, long before they finish. So the page reports through dump() instead (the pref
// is set in a FRESH profile, so no stale file:// cache either): every line it wants seen starts with
// "VFX ", and its last line is "VFX END <PASS|FAIL> …". This prints those lines (all of them, or with
// --quiet only the failures and the end), kills ITS OWN Firefox by PID, and exits 0 only on PASS.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const suite = process.argv[2];
if (!suite) { console.error("usage: node tests/run-ff.mjs <suite> [--quiet] [--timeout=<s>]"); process.exit(2); }
const quiet = process.argv.includes("--quiet");
const tArg = process.argv.find((a) => a.startsWith("--timeout="));
const timeout = (tArg ? +tArg.split("=")[1] : 600) * 1000;

const b = spawnSync("python3", [join(here, "build.py"), suite], { encoding: "utf8" });
if (b.status !== 0) { console.error(b.stdout + b.stderr); process.exit(2); }
const prof = mkdtempSync(join(tmpdir(), "vfx-ff-"));
writeFileSync(join(prof, "user.js"), 'user_pref("browser.dom.window.dump.enabled", true);\n' +
  'user_pref("devtools.console.stdout.content", true);\n' + (process.env.UNMASK ? 'user_pref("security.fileuri.strict_origin_policy", false);\n' : ""));
const ff = spawn("firefox", ["--headless", "--profile", prof, "--window-size=1400,900", "file://" + join(here, "run-" + suite + ".html")],
  { stdio: ["ignore", "pipe", "pipe"] });
const lines = [];
let buf = "", end = null;
const finish = (code) => {
  try { ff.kill("SIGTERM"); } catch (e) { /* gone */ }
  setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch (e) { /* busy */ } process.exit(code); }, 500);
};
const timer = setTimeout(() => { console.log("VFX END FAIL timed out after " + timeout / 1000 + " s"); finish(1); }, timeout);
const onData = (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.startsWith("VFX ")) {
      if (/JavaScript error|uncaught exception/i.test(line) && !quiet) console.log("  (console) " + line);
      continue;
    }
    lines.push(line);
    if (!quiet || /^VFX (FAIL|END|ERR)/.test(line)) console.log(line);
    if (line.startsWith("VFX END ")) {
      end = line;
      clearTimeout(timer);
      finish(/^VFX END PASS/.test(line) ? 0 : 1);
    }
  }
};
ff.stdout.setEncoding("utf8"); ff.stdout.on("data", onData);
ff.stderr.setEncoding("utf8"); ff.stderr.on("data", onData);
ff.on("exit", () => { if (!end) { clearTimeout(timer); console.log("VFX END FAIL firefox exited before the suite ended"); finish(1); } });

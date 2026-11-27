#!/usr/bin/env node
// BAKE THE STRIP'S PICTURES (VFX 1.3; AJ, 2026-11-27: at launch "the previews slowly pour in for the presets while the
// application is virtually unusable").
//
//   node tools/bake-thumbs.mjs           draw every preset's and layer's strip picture, write preset-thumbs.png + .js
//   node tools/bake-thumbs.mjs --check   draw them and compare with the files on disk; exit 1 if any is stale
//
// VFX draws on a 2D canvas, so this does not redraw anything in Node: it opens the app itself (index.html) in a headless
// Firefox over WebDriver BiDi (as tools/vfx-cli.mjs does) and draws each picture with the app's OWN code, the functions
// the strip itself uses (presetStillCanvas: a preset's frame ~40% in at 60 px, Fit on, no game palette; layerStillCanvas:
// a layer over its plain base at its most different frame). They go into ONE sheet, preset-thumbs.png (20 cells a row,
// presets in PRESETS order, then the layers in LAYER_GROUPS order), indexed by preset-thumbs.js: per picture its cell,
// the FINGERPRINT of what draws it (the app's thumbPrint) and the hash of its pixels (thumbPixelHash). Both files are
// GENERATED engine output (CC0, nothing drawn by hand): never edit them, run this again.
//
// Honesty, checked three ways: here, every cell of the PNG written is decoded again and must hash to the pixels the page
// drew; tests/worker.test.mjs decodes the committed PNG the same way against the committed index; and the sync suite
// (tests/regression.js) redraws every picture live and fails on any stale fingerprint or pixel ("run node
// tools/bake-thumbs.mjs"). At run time a picture is shown from the sheet only while its fingerprint matches.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { inflateSync, deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url)), app = resolve(here, "..");
const check = process.argv.includes("--check");
const PNG_OUT = join(app, "preset-thumbs.png"), JS_OUT = join(app, "preset-thumbs.js"), COLS = 20;

// ---- the same 53-bit hash as index.html's thumbHash (cyrb53), over bytes ----
export function thumbHash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const bytes = typeof s !== "string", n = s.length;
  for (let i = 0; i < n; i++) {
    const c = bytes ? s[i] : s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// ---- PNG: 8-bit RGBA, non-interlaced (what a canvas writes and what this writes) ----
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
export function decodePng(buf) {
  if (buf.toString("latin1", 1, 4) !== "PNG") throw new Error("not a PNG");
  let at = 8, w = 0, h = 0, idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString("latin1", at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("PNG is not 8-bit RGBA non-interlaced");
    } else if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * 4), stride = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[dst + x - 4] : 0, b = y ? px[dst - stride + x] : 0, c = x >= 4 && y ? px[dst - stride + x - 4] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, px };
}
function encodePng(w, h, px) {
  // each row filtered the way that leaves the smallest sum (the usual heuristic), then zlib at its best: deterministic, so
  // the same pictures always write the same bytes
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1)), row = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    let best = null, bestSum = Infinity, bestF = 0;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const i = y * stride + x, v = px[i], a = x >= 4 ? px[i - 4] : 0, b = y ? px[i - stride] : 0, c = x >= 4 && y ? px[i - stride - 4] : 0;
        let p = v;
        if (f === 1) p = v - a; else if (f === 2) p = v - b; else if (f === 3) p = v - ((a + b) >> 1);
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        row[x] = p & 255; sum += row[x] < 128 ? row[x] : 256 - row[x];
      }
      if (sum < bestSum) { bestSum = sum; bestF = f; best = Buffer.from(row); }
    }
    raw[y * (stride + 1)] = bestF; best.copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, "latin1"); data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9, memLevel: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
// one cell's pixels, row by row (getImageData's order), hashed
export function cellHash(img, cell, size, cols) {
  const x0 = (cell % cols) * size, y0 = Math.floor(cell / cols) * size, out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) img.px.copy(out, y * size * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + size) * 4);
  return thumbHash(out);
}
// the generated index: one picture a line, so a re-bake diffs as the pictures that changed
function indexJs(r) {
  const list = (o) => Object.keys(o).map((k) => JSON.stringify(k) + ":" + JSON.stringify(o[k])).join(",\n");
  return "// GENERATED by tools/bake-thumbs.mjs: never edit it. Run `node tools/bake-thumbs.mjs` (VFX 1.3, the baked strip pictures).\n" +
    "// The index of preset-thumbs.png: every preset's and layer's strip picture, drawn by CrunchyVFX's own code (index.html's\n" +
    "// presetStillCanvas and layerStillCanvas) in a headless Firefox. CC0 engine output; nothing in it is drawn by hand.\n" +
    "// Per picture: [its cell in the sheet (-1: it did not draw), the FINGERPRINT of what draws it (thumbPrint), the hash of\n" +
    "// its pixels (thumbPixelHash)]. The app shows a cell only while the fingerprint still matches; the sync suite redraws\n" +
    "// every picture and fails on a stale one.\n" +
    "const PRESET_THUMBS_BUILD = 1;\n" +
    "const PRESET_THUMBS = {\"file\":\"preset-thumbs.png\",\"size\":" + r.size + ",\"cols\":" + r.cols + ",\"rule\":" + r.rule +
    ",\"stamps\":" + JSON.stringify(r.stamps) + ",\n\"presets\":{\n" + list(r.presets) + "},\n\"layers\":{\n" + list(r.layers) + "}};\n";
}

// ---- the page: every picture drawn with the app's own code, into one sheet ----
const PAGE = `(() => {
  const S = PTHUMB, cols = ${COLS};
  if (LTHUMB !== S) throw new Error("the layer pictures (LTHUMB " + LTHUMB + ") are not the preset pictures' size (" + S + ")");
  const jobs = Object.keys(PRESETS).map((n) => ["presets", n]).concat(LAYER_GROUPS.map((L) => ["layers", L.g]));
  const sheet = document.createElement("canvas");
  sheet.width = cols * S; sheet.height = Math.ceil(jobs.length / cols) * S;
  const g = sheet.getContext("2d"), out = { presets: {}, layers: {} }, bad = [];
  let cell = 0;
  for (const [kind, key] of jobs) {
    let cv = null;
    try { cv = kind === "presets" ? presetStillCanvas(Object.assign({}, PRESETS[key])) : layerStillCanvas(LAYER_GROUPS.find((L) => L.g === key)); }
    catch (e) { cv = null; }
    if (!cv || cv.width !== S || cv.height !== S) { out[kind][key] = [-1, thumbPrint(kind, key), ""]; bad.push(key); continue; }
    g.drawImage(cv, (cell % cols) * S, Math.floor(cell / cols) * S);
    out[kind][key] = [cell, thumbPrint(kind, key), thumbPixelHash(cv)];
    cell++;
  }
  // the sheet's rows are only as many as the pictures that drew
  const used = document.createElement("canvas");
  used.width = sheet.width; used.height = Math.ceil(cell / cols) * S;
  used.getContext("2d").drawImage(sheet, 0, 0);
  return JSON.stringify({ size: S, cols, rule: PTHUMB_RULE, stamps: thumbStamps(), presets: out.presets, layers: out.layers, bad,
    png: used.toDataURL("image/png").split(",")[1] });
})()`;

// imported (tests/worker.test.mjs takes the PNG decoder and the hashes), it only exports; run, it bakes
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
async function main() {
  const wip = join(homedir(), ".cache", "crunchy-wip");
  mkdirSync(wip, { recursive: true });
  const prof = mkdtempSync(join(wip, "ff-bake-"));
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
  setTimeout(() => { console.error("bake-thumbs: gave up after 600 s"); quit(1); }, 600000);
  let ws = null;
  for (let i = 0; i < 120 && !ws && !gone; i++) {
    await sleep(500);
    try { ws = await new Promise((res, rej) => { const w = new WebSocket(`ws://127.0.0.1:${port}/session`); w.onopen = () => res(w); w.onerror = rej; }); } catch (e) { ws = null; }
  }
  if (!ws) { console.error("bake-thumbs: Firefox did not start (is firefox installed? another headless Firefox on its profile?)"); quit(1); }
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  const send = (method, params) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  let context;
  const evalJs = async (expression) => {
    const r = await send("script.evaluate", { expression, target: { context }, awaitPromise: true });
    if (r.error) throw new Error(r.message || r.error);
    if (r.result.type === "exception") throw new Error(((r.result.exceptionDetails && r.result.exceptionDetails.text) || "the page threw").replace(/^Error: /, ""));
    return r.result.result.value;
  };

  try {
    await send("session.new", { capabilities: {} });
    context = (await send("browsingContext.getTree", {})).result.contexts[0].context;
    await send("browsingContext.navigate", { context, url: "file://" + join(app, "index.html"), wait: "complete" });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      ready = await evalJs("typeof presetStillCanvas === 'function' && typeof layerStillCanvas === 'function' && typeof PRESETS === 'object'");
      if (!ready) await sleep(250);
    }
    if (!ready) throw new Error("the app did not start (presetStillCanvas missing)");
    const t0 = Date.now(), r = JSON.parse(await evalJs(PAGE));
    const png = Buffer.from(r.png, "base64"), drawn = decodePng(png);
    // the page's own PNG must hold exactly the pixels it hashed (canvas readback and canvas encoding agree) ...
    const all = Object.values(r.presets).concat(Object.values(r.layers)).filter((e) => e[0] >= 0);
    const off = all.filter((e) => cellHash(drawn, e[0], r.size, r.cols) !== e[2]);
    if (off.length) throw new Error(off.length + " cells of the page's PNG do not hash to the pixels it drew (" + off.slice(0, 3).map((e) => e[0]).join(", ") + "…)");
    // ... and so must the one written here (re-encoded: smaller, and the same bytes every run)
    const out = encodePng(drawn.w, drawn.h, drawn.px), again = decodePng(out);
    if (Buffer.compare(again.px, drawn.px) !== 0) throw new Error("the re-encoded PNG does not decode to the same pixels");
    const js = indexJs(r), n = all.length;
    console.log("bake-thumbs: " + Object.keys(r.presets).length + " presets + " + Object.keys(r.layers).length + " layers, " + n + " drawn in " +
      (Date.now() - t0) + " ms; sheet " + drawn.w + "x" + drawn.h + ", " + (out.length / 1024).toFixed(1) + " KB" + (r.bad.length ? "; did not draw: " + r.bad.join(", ") : ""));
    if (check) {
      const stale = [];
      if (!existsSync(JS_OUT) || !existsSync(PNG_OUT)) stale.push("preset-thumbs.js / preset-thumbs.png missing");
      else {
        if (readFileSync(JS_OUT, "utf8") !== js) stale.push("preset-thumbs.js differs");
        const disk = decodePng(readFileSync(PNG_OUT));
        if (disk.w !== drawn.w || disk.h !== drawn.h || Buffer.compare(disk.px, drawn.px) !== 0) stale.push("preset-thumbs.png's pixels differ");
      }
      if (stale.length) { console.log("STALE: " + stale.join("; ") + ". Run node tools/bake-thumbs.mjs"); quit(1); }
      else { console.log("current: preset-thumbs.js and preset-thumbs.png are what this code draws"); quit(0); }
    } else {
      writeFileSync(PNG_OUT, out);
      writeFileSync(JS_OUT, js);
      console.log("wrote preset-thumbs.png and preset-thumbs.js");
      quit(0);
    }
  } catch (e) {
    console.error("bake-thumbs: " + e.message);
    quit(1);
  }
}

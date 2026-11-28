// CrunchyVFX — SEAMLESS TEXTURES in a REAL Godot (VFX-DESIGN §66).                          node tests/seam.mjs
//
//   1. the real index.html (headless Firefox, tests/seam.js): every Textures preset measured (seams, loop), the fold proved
//      exact, Tile off byte for byte, the Tiled view, the room; each preset's Export files (Godot 4 + 3D scene) handed over;
//   2. a Godot project of those files: --import, then a headless check that every material, shader and scene loads (the
//      .tres are ShaderMaterials on our shaders, the flipbook a Texture2D the size of the sheet, the scenes instance);
//   3. with a display: each texture's 3D plane seen from straight above by an orthographic camera (2 x 2 tiles filling the
//      view, 2 screen pixels a texel) and its 2D ColorRect (2 x 2 tiles, 1 pixel a texel), both frozen on frame 0 (speed 0):
//      the render must BE the frame tiled 2 x 2 (mean difference to the expected picture), and the columns and rows where
//      the copies meet must differ no more than ordinary neighbors; plus a perspective view of each plane, playing, kept as
//      pictures to look at (~/.cache/crunchy-wip/vfx-1.3c/tile-scratch/godot/, or $SEAM_RENDERS).
// Needs a Godot 4 binary ($GODOT, else godot / godot4 / godot-mono on PATH) and Firefox; skips (exit 0) without Godot.
// Run it under the shared lock: flock ~/.cache/crunchy-wip/vfx-1.3/heavy.lock node tests/seam.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIP = join(process.env.HOME, ".cache/crunchy-wip");
const godot = [process.env.GODOT, "godot", "godot4", "godot-mono"].filter(Boolean).find((b) => {
  const r = spawnSync(b, ["--version"], { encoding: "utf8" });
  return r.status === 0 && /^4\./.test(r.stdout || "");
});
const ok = [], fail = [];
const t = (name, pass, why) => { (pass ? ok : fail).push(name + (pass || !why ? "" : " — " + why)); console.log((pass ? "PASS " : "FAIL ") + name + (pass || !why ? "" : " — " + why)); };
const report = () => { console.log((fail.length ? "FAIL" : "PASS") + " · " + ok.length + " passed, " + fail.length + " failed"); process.exit(fail.length ? 1 : 0); };

// a PNG decoder (8-bit RGB / RGBA, non-interlaced: what Firefox and Godot write)
function readPng(buf) {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1, raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ch >= 3) { out[o] = cur[x * ch]; out[o + 1] = cur[x * ch + 1]; out[o + 2] = cur[x * ch + 2]; out[o + 3] = ch === 4 ? cur[x * ch + 3] : 255; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[x * ch]; out[o + 3] = ch === 2 ? cur[x * ch + 1] : 255; }
    }
    prev = cur;
  }
  return { w, h, data: out };
}

// 1. the page
const ff = spawnSync("node", [join(root, "tests/run-ff.mjs"), "seam", "--timeout=900"], { encoding: "utf8", timeout: 960000, maxBuffer: 1 << 29 });
const metas = [], files = {}, pngs = [];
for (const line of (ff.stdout || "").split("\n")) {
  let m = /^VFX (PASS|FAIL) (.*)$/.exec(line);
  if (m) t("page: " + m[2], m[1] === "PASS", m[2]);
  m = /^VFX INFO (.*)$/.exec(line);
  if (m) console.log("  " + m[1]);
  m = /^VFX SEAM (\{.*\})$/.exec(line);
  if (m) metas.push(JSON.parse(m[1]));
  m = /^VFX PNG (\S+) (\S+)$/.exec(line);
  if (m) pngs.push({ name: m[1], data: Buffer.from(m[2], "base64") });
  m = /^VFX FILE (\d+) (\S+) (\S*)$/.exec(line);
  if (m) (files[m[1]] = files[m[1]] || []).push({ name: m[2], data: Buffer.from(m[3], "base64") });
}
t("the page ended PASS with " + metas.length + " textures exported", /VFX END PASS/.test(ff.stdout || "") && metas.length >= 4,
  (ff.stdout || "").split("\n").filter((l) => /END|threw/.test(l)).join(" ") || (ff.stderr || "").slice(-400));
if (!godot) { console.log("SKIP · the Godot half: no Godot 4 binary found (set $GODOT)"); report(); }
if (!metas.length) report();

// 2. the project, imported and loaded
const scratch = mkdtempSync(join(WIP, "seam-check-")), proj = join(scratch, "proj");
mkdirSync(proj, { recursive: true });
writeFileSync(join(proj, "project.godot"), 'config_version=5\n\n[application]\nconfig/name="crunchyvfx-seam-check"\n\n[rendering]\ntextures/canvas_textures/default_texture_filter=0\n');
for (const M of metas) {
  const dir = join(proj, M.base);
  for (const f of files[M.i] || []) { mkdirSync(dirname(join(dir, f.name)), { recursive: true }); writeFileSync(join(dir, f.name), f.data); }
}
const imp = spawnSync(godot, ["--headless", "--path", proj, "--import"], { encoding: "utf8", timeout: 300000 });
t("Godot imported the project", imp.status === 0, (imp.stderr || "").slice(-400));
{
  const imports = metas.map((M) => { const p = join(proj, M.base, M.base + "_tile.png.import"); return existsSync(p) ? readFileSync(p, "utf8") : ""; });
  t("Godot kept our import settings for every flipbook (lossless, no mipmaps, never recompressed for 3D)",
    imports.every((s) => /compress\/mode=0/.test(s) && /mipmaps\/generate=false/.test(s) && /detect_3d\/compress_to=0/.test(s) && /dest_files=/.test(s)), imports.map((s) => s.slice(0, 80)).join(" | "));
}
writeFileSync(join(proj, "check.gd"), `extends SceneTree
var metas = ${JSON.stringify(metas.map((M) => ({ base: M.base, w: M.w, h: M.h, cols: M.columns, rows: M.rows })))}
func _init():
	for m in metas:
		var d = "res://" + m.base + "/" + m.base
		for k in ["_tile_3d.tres", "_tile_2d.tres"]:
			var mat = load(d + k)
			print("CHECK %s%s material %s shader %s flipbook %s" % [m.base, k, mat is ShaderMaterial, mat.shader != null and mat.shader.code.find("tile_at") >= 0, mat.get_shader_parameter("flipbook") is Texture2D])
			var tex = mat.get_shader_parameter("flipbook")
			print("CHECK %s%s size %s want %s" % [m.base, k, tex.get_size() if tex else Vector2.ZERO, Vector2(m.w * m.cols, m.h * m.rows)])
		for k in ["_tile_3d.tscn", "_tile_2d.tscn", "_3d.tscn"]:
			var s = load(d + k)
			var n = s.instantiate() if s else null
			print("CHECK %s%s scene %s %s" % [m.base, k, n != null, n.get_class() if n else "none"])
			if n: n.free()
	quit()
`);
const chk = spawnSync(godot, ["--headless", "--path", proj, "-s", "check.gd"], { encoding: "utf8", timeout: 300000 });
{
  const L = (chk.stdout || "").split("\n").filter((l) => l.startsWith("CHECK "));
  const mats = L.filter((l) => / material /.test(l)), sizes = L.filter((l) => / size /.test(l)), scenes = L.filter((l) => / scene /.test(l));
  t("every material loads in Godot as a ShaderMaterial on our flipbook shader, with its sheet (" + mats.length + ")", mats.length === metas.length * 2 && mats.every((l) => /material true shader true flipbook true/.test(l)), mats.filter((l) => /false/.test(l)).join(" | "));
  t("every flipbook is the sheet's size in Godot", sizes.length === metas.length * 2 && sizes.every((l) => { const m = /size \(([\d.]+), ([\d.]+)\) want \(([\d.]+), ([\d.]+)\)/.exec(l); return m && +m[1] === +m[3] && +m[2] === +m[4]; }), sizes.join(" | "));
  t("every scene instances (the 3D plane, the 2D rect, <base>_3d.tscn) (" + scenes.length + ")", scenes.length === metas.length * 3 && scenes.every((l) => / scene true (MeshInstance3D|ColorRect)/.test(l)), scenes.join(" | "));
  if (/ERROR|SCRIPT ERROR/.test(chk.stderr || "")) console.log("  godot said: " + (chk.stderr || "").split("\n").filter((l) => /ERROR/.test(l)).slice(0, 6).join(" | "));
}

// 3. renders
const display = (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) && process.env.NO_RENDER !== "1";
const RENDERS = process.env.SEAM_RENDERS || join(WIP, "vfx-1.3c/tile-scratch/godot");
if (!display) { console.log("SKIP · the renders: no display"); report(); }
mkdirSync(RENDERS, { recursive: true });
for (const f of readdirSync(RENDERS)) if (/\.png$/.test(f)) rmSync(join(RENDERS, f));
for (const p of pngs) writeFileSync(join(RENDERS, p.name), p.data);   // the app's own room, to look at
const Z = 2;   // screen pixels per texel in the 3D view
writeFileSync(join(proj, "render.gd"), `extends SceneTree
# Each texture, frozen on frame 0 (speed 0): its 3D plane from straight above (orthographic, 2 x 2 tiles filling the view at
# ${Z} px a texel), its 2D ColorRect (2 x 2 tiles at 1 px a texel), and a perspective view, playing; saved as PNGs.
var metas = ${JSON.stringify(metas.map((M) => ({ base: M.base, w: M.w, h: M.h })))}
var out = "${RENDERS.replace(/"/g, "")}"
func grab(vp: SubViewport, path: String):
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	vp.get_texture().get_image().save_png(path)
func _init():
	await process_frame
	for m in metas:
		var d = "res://" + m.base + "/" + m.base
		# 3D, from above
		var vp = SubViewport.new()
		vp.size = Vector2i(m.w * 2 * ${Z}, m.h * 2 * ${Z})
		vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		vp.transparent_bg = false
		root.add_child(vp)
		var env = WorldEnvironment.new()
		var e = Environment.new()
		e.background_mode = Environment.BG_COLOR
		e.background_color = Color(0, 0, 0)
		e.tonemap_mode = Environment.TONE_MAPPER_LINEAR
		env.environment = e
		vp.add_child(env)
		var plane = load(d + "_tile_3d.tscn").instantiate()
		var mat = (plane.get_surface_override_material(0) as ShaderMaterial).duplicate()
		mat.set_shader_parameter("speed", 0.0)
		plane.set_surface_override_material(0, mat)
		vp.add_child(plane)
		var cam = Camera3D.new()
		cam.projection = Camera3D.PROJECTION_ORTHOGONAL
		cam.size = 2.0
		cam.position = Vector3(0, 3, 0)
		cam.rotation_degrees = Vector3(-90, 0, 0)
		vp.add_child(cam)
		cam.current = true
		await grab(vp, out + "/" + m.base + "_3d_top.png")
		vp.queue_free()
		# 2D
		var vp2 = SubViewport.new()
		vp2.size = Vector2i(m.w * 2, m.h * 2)
		vp2.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		vp2.transparent_bg = false
		root.add_child(vp2)
		var bg = ColorRect.new()
		bg.color = Color(0, 0, 0)
		bg.size = Vector2(m.w * 2, m.h * 2)
		vp2.add_child(bg)
		var rect = load(d + "_tile_2d.tscn").instantiate()
		var mat2 = (rect.material as ShaderMaterial).duplicate()
		mat2.set_shader_parameter("speed", 0.0)
		rect.material = mat2
		vp2.add_child(rect)
		await grab(vp2, out + "/" + m.base + "_2d.png")
		vp2.queue_free()
		# a perspective look, playing (frames over a second)
		var vp3 = SubViewport.new()
		vp3.size = Vector2i(480, 300)
		vp3.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		root.add_child(vp3)
		var env3 = WorldEnvironment.new()
		var e3 = Environment.new()
		e3.background_mode = Environment.BG_COLOR
		e3.background_color = Color(0.05, 0.05, 0.07)
		env3.environment = e3
		vp3.add_child(env3)
		var p3 = load(d + "_tile_3d.tscn").instantiate()
		p3.scale = Vector3(2, 1, 2)
		var m3 = (p3.get_surface_override_material(0) as ShaderMaterial).duplicate()
		m3.set_shader_parameter("repeats", Vector2(4, 4))
		p3.set_surface_override_material(0, m3)
		vp3.add_child(p3)
		var c3 = Camera3D.new()
		c3.position = Vector3(0, 1.6, 2.6)
		c3.rotation_degrees = Vector3(-38, 0, 0)
		vp3.add_child(c3)
		c3.current = true
		for k in 3:
			await grab(vp3, out + "/" + m.base + "_look_" + str(k) + ".png")
			for j in 10:
				await process_frame
		vp3.queue_free()
	print("RENDERED")
	quit()
`);
const rr = spawnSync(godot, ["--path", proj, "--resolution", "320x240", "-s", "render.gd"], { encoding: "utf8", timeout: 600000 });
t("Godot rendered every texture (a display: " + (process.env.WAYLAND_DISPLAY || process.env.DISPLAY) + ")", /RENDERED/.test(rr.stdout || ""), (rr.stderr || "").slice(-600));

// compare: the expected 2 x 2 tiling of frame 0 (scaled z), drawn over black as Godot draws it
for (const M of metas) {
  const f0 = (files[M.i] || []).find((f) => /_tile_000\.png$/.test(f.name));
  if (!f0) { t(M.name + ": frame 0 in the export", false, "missing"); continue; }
  const F = readPng(f0.data);
  for (const [kind, z] of [["3d_top", Z], ["2d", 1]]) {
    const p = join(RENDERS, M.base + "_" + kind + ".png");
    if (!existsSync(p)) { t(M.name + " " + kind + ": rendered", false, "no picture"); continue; }
    const R = readPng(readFileSync(p));
    const W2 = F.w * 2 * z, H2 = F.h * 2 * z;
    if (R.w !== W2 || R.h !== H2) { t(M.name + " " + kind + ": the render is " + W2 + "x" + H2, false, R.w + "x" + R.h); continue; }
    // over black: the 2D canvas blends in sRGB (c x a); a 3D surface blends in LINEAR light and is written back as sRGB
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const srgb = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    let sum = 0, n = 0;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const s = ((Math.floor(y / z) % F.h) * F.w + (Math.floor(x / z) % F.w)) * 4, a = F.data[s + 3] / 255, o = (y * W2 + x) * 4;
      for (let c = 0; c < 3; c++) { sum += Math.abs(R.data[o + c] - (kind === "2d" ? F.data[s + c] * a : srgb(lin(F.data[s + c]) * a))); n++; }
    }
    // the seams: where the copies meet (the middle column and row, and the wrap at the edges) against ordinary pairs
    const pairX = (x) => { let s = 0; for (let y = 0; y < H2; y++) for (let c = 0; c < 3; c++) s += Math.abs(R.data[(y * W2 + (x + 1) % W2) * 4 + c] - R.data[(y * W2 + x) * 4 + c]); return s / H2 / 3; };
    const pairY = (y) => { let s = 0; for (let x = 0; x < W2; x++) for (let c = 0; c < 3; c++) s += Math.abs(R.data[(((y + 1) % H2) * W2 + x) * 4 + c] - R.data[(y * W2 + x) * 4 + c]); return s / W2 / 3; };
    const P = z * (M.fieldPixel || 1), seamX = pairX(F.w * z - 1), seamY = pairY(F.h * z - 1);
    let sx = 0, kx = 0, sy = 0, ky = 0;
    for (let x = 0; x < W2; x++) if ((x + 1) % P === 0 && x !== F.w * z - 1) { sx += pairX(x); kx++; }
    for (let y = 0; y < H2; y++) if ((y + 1) % P === 0 && y !== F.h * z - 1) { sy += pairY(y); ky++; }
    const mean = sum / n, rx = seamX / Math.max(1, sx / kx), ry = seamY / Math.max(1, sy / ky);
    console.log("  " + M.name + " " + kind + ": mean difference to frame 0 tiled 2 x 2 " + mean.toFixed(2) + " of 255; middle seam " + seamX.toFixed(2) + " vs ordinary " + (sx / kx).toFixed(2) +
      " across, " + seamY.toFixed(2) + " vs " + (sy / ky).toFixed(2) + " down");
    t(M.name + " in Godot (" + kind + "): the surface shows frame 0 tiled 2 x 2 (mean difference " + mean.toFixed(2) + " of 255)", mean < 3, "");
    t(M.name + " in Godot (" + kind + "): no seam where the copies meet (" + rx.toFixed(2) + "x across, " + ry.toFixed(2) + "x down, of ordinary neighbors)", rx < 2 && ry < 2, "");
  }
}
// a contact sheet to look at
{
  const pics = metas.flatMap((M) => [M.base + "_3d_top.png", M.base + "_2d.png", M.base + "_look_0.png", M.base + "_look_2.png"]).map((f) => join(RENDERS, f)).filter(existsSync);
  const r = spawnSync("montage", pics.concat(["-tile", "4x", "-geometry", "300x200+3+3", "-background", "#111", join(RENDERS, "sheet.png")]), { encoding: "utf8" });
  if (r.status === 0) console.log("  pictures: " + join(RENDERS, "sheet.png"));
}
if (!process.env.KEEP_PROJ) rmSync(scratch, { recursive: true, force: true }); else console.log("  project kept: " + proj);
report();

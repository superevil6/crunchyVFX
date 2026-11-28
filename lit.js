"use strict";
// CrunchyVFX: LIT EFFECTS (VFX-DESIGN §65, VFX 1.3). PURE: no document, no window, no storage; every top-level name is
// lit* / LIT_*. Until now every effect was unlit: it glows, or it sits flat on whatever is behind it. A LIT effect takes
// the game's lights: smoke, dust, debris and blood get a NORMAL MAP per frame, worked out from the effect's own drawing.
//
//   THE HEIGHT is how much is drawn there (alpha), blurred by Roundness (a puff is a dome, its edges slope away), plus
//   Bumps: the drawing's own light and dark as small hills and dents (a cloud's lumps, a rock's facets). Sobel on that
//   gives the slope, the slope gives the normal. A PIXEL effect (pixel art, or Pixelate) is worked out on its ART-PIXEL
//   grid, so every art pixel has ONE normal and the shading stays crisp blocks; a smooth one is worked out per pixel.
//   THE GLOW stays emissive: a pixel the glow mask counts (index.html emissiveFrames: luminance x alpha at or over Glow
//   thresh) gets the flat normal and every shader leaves it as drawn (Lit parts "Everything" shades those too).
//   THE LIGHT MODEL is one formula everywhere (the 2D stage, the room, the Godot 2D and 3D shaders): a WRAPPED Lambert,
//   clamp((N.L + w) / (1 + w)), w = LIT_WRAP, so a puff's far side fades out softly, the way light goes through dust.
//
//   litOn(st)                          the effect is lit
//   litGlow(st)                        the glow threshold the shaders use (0..1), or 2 (nothing stays emissive)
//   litCell(st, w, h, mult)            frame pixels per normal cell: the art pixel (pixel art), Pixelate, else 1
//   litNormals(frame, st, opt?)        { w, h, data }: the frame's normal map, RGBA (x right, y UP, z out; 128,128,255 flat,
//                                      opaque everywhere). opt { cell, ox, oy } (the grid's offset: a trimmed frame)
//   litNormalFrames(frames, st, opt?)  every frame's
//   litShade(frame, normal, st, light) { w, h, data }: the frame as a light at light { x, y, z (frame px, z toward you),
//                                      color [r,g,b] 0..1, energy, ambient } shows it (the 2D stage's test light)
//   litSteps(st)                       a pixel effect's light bands (LIT_STEPS), a smooth one's 0
//   litShader2d(steps) / litGlowShader2d() / LIT_GLOW_SYNC / litShader3d(stand, alpha, steps)   the Godot shaders' text

var LIT_BUILD = 1;
// Lit parts (APPEND-ONLY: the index is stored in links and saved effects)
var LIT_PARTS = ["All but the glow", "Everything"];
var LIT_WRAP = 0.4;
// A PIXEL effect's light comes in LIT_STEPS hard bands (pixel art shades in a few tones, never a smooth ramp); a smooth one
// is shaded smoothly (0). Every shader quantizes the same way: round(w x steps) / steps, per light.
var LIT_STEPS = 3;
function litSteps(st) { return +st.pix > 0 || +st.pixelate > 1 ? LIT_STEPS : 0; }
function litBand(w, steps) { return steps > 0 ? Math.round(w * steps) / steps : w; }

function litOn(st) { return !!st && +st.lit > 0; }
function litGlow(st) { return Math.round(+st.litParts || 0) === 1 ? 2 : Math.max(0, Math.min(1, +st.glowThresh)); }
// an effect of MATTER only (fx3d.js fx3dGlowMode "hot": alpha smoke, dust, ink) keeps only its FIRE-colored bright pixels
// glowing (embers in the smoke); white smoke shades like the rest. The same rule decides its 3D light.
function litHotOnly(st) { return typeof fx3dGlowMode === "function" && fx3dGlowMode(st) === "hot"; }
function litIsGlow(d, i, thr, hot) {
  if (!d[i + 3] || (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) * (d[i + 3] / 255) < thr) return false;
  return !hot || (typeof fx3dHot === "function" && fx3dHot(d[i], d[i + 1], d[i + 2]));
}

// FRAME PIXELS PER NORMAL CELL. Pixel art draws on a grid of whole art pixels (pixart.js: k = round(short side /
// pixDetail)); Pixelate draws blocks of its own size. `w`, `h`: the 1x frame; `mult`: the frames' scale (2 at 2x).
function litCell(st, w, h, mult) {
  const m = mult > 0 ? mult : 1;
  if (+st.pix > 0) return Math.max(1, Math.round(Math.min(w, h) / Math.max(8, +st.pixDetail || 64))) * m;
  if (+st.pixelate > 1) return Math.round(+st.pixelate) * m;
  return m > 1 ? Math.round(m) : 1;
}

// a box blur of radius r, twice (close to a Gaussian), in place on a w x h float grid, edges clamped
function litBlur(src, w, h, r) {
  if (r < 1) return src;
  let a = src, b = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {          // rows
      let acc = 0;
      const o = y * w;
      for (let i = -r; i <= r; i++) acc += a[o + Math.max(0, Math.min(w - 1, i))];
      for (let x = 0; x < w; x++) {
        b[o + x] = acc / (2 * r + 1);
        acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {          // columns
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += b[Math.max(0, Math.min(h - 1, i)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);    // a is free to write after the first pass (src is copied below)
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

// THE NORMAL MAP of one frame. Glow test exactly as emissiveFrames: (r .3 + g .6 + b .1) x alpha / 255 >= Glow thresh x 255.
function litNormals(f, st, opt) {
  opt = opt || {};
  const W = f.w, H = f.h, d = f.data, out = new Uint8ClampedArray(W * H * 4);
  const c = Math.max(1, Math.round(opt.cell || 1));
  const ox = ((Math.round(opt.ox || 0) % c) + c) % c, oy = ((Math.round(opt.oy || 0) % c) + c) % c;
  const gw = Math.ceil((W + ox) / c), gh = Math.ceil((H + oy) / c), N = gw * gh;
  const A = new Float32Array(N), Lm = new Float32Array(N), cnt = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const gy = ((y + oy) / c) | 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, g = gy * gw + (((x + ox) / c) | 0), a = d[i + 3] / 255;
      A[g] += a; cnt[g]++;
      Lm[g] += (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255 * a;
    }
  }
  for (let g = 0; g < N; g++) { if (A[g] > 0) Lm[g] /= A[g]; if (cnt[g]) A[g] /= cnt[g]; }
  // ROUNDNESS: the blur's reach, a share of the grid's short side (a twelfth at most), at least one cell
  const round = Math.max(0, Math.min(1, isFinite(+st.litRound) ? +st.litRound : 0.6));
  const bump = Math.max(0, Math.min(1, isFinite(+st.litBump) ? +st.litBump : 0.4));
  const r = Math.max(1, Math.round(round * Math.max(2, Math.min(gw, gh) / 12)));
  // two reaches: the whole puff's dome, and a third of it for the lumps where puffs and blobs overlap
  const Hh = litBlur(Float32Array.from(A), gw, gh, r);
  if (r >= 3) {
    const Hs = litBlur(Float32Array.from(A), gw, gh, Math.max(1, Math.round(r / 3)));
    for (let g = 0; g < N; g++) Hh[g] = Hh[g] * 0.6 + Hs[g] * 0.4;
  }
  // BUMPS: the drawing's own light and dark, against its neighborhood, where something is drawn
  if (bump > 0) {
    const Ls = litBlur(Float32Array.from(Lm), gw, gh, 1);
    const k = bump * 1.2 / r;             // over the slope's K (2.2 r) below: the same bumps whatever Roundness is
    for (let g = 0; g < N; g++) if (A[g] > 0) Hh[g] += (Lm[g] - Ls[g]) * A[g] * k;
  }
  // SOBEL, then the normal (OpenGL convention, the one Godot reads: green is UP in the picture)
  const K = 3.2 * r, nrm = new Float32Array(N * 3);
  const at = (x, y) => Hh[Math.max(0, Math.min(gh - 1, y)) * gw + Math.max(0, Math.min(gw - 1, x))];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
    let nx = -gx * K, ny = gy * K, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const o = (y * gw + x) * 3;
    nrm[o] = nx / l; nrm[o + 1] = ny / l; nrm[o + 2] = nz / l;
  }
  const thr = litGlow(st) * 255, hot = litHotOnly(st);
  for (let y = 0; y < H; y++) {
    const gy = ((y + oy) / c) | 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      out[i + 3] = 255;
      if (!d[i + 3] || litIsGlow(d, i, thr, hot)) { out[i] = 128; out[i + 1] = 128; out[i + 2] = 255; continue; }
      const o = (gy * gw + (((x + ox) / c) | 0)) * 3;
      out[i] = Math.round((nrm[o] * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((nrm[o + 1] * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nrm[o + 2] * 0.5 + 0.5) * 255);
    }
  }
  return { w: W, h: H, data: out };
}
function litNormalFrames(frames, st, opt) { return frames.map((f) => litNormals(f, st, opt)); }

// THE TEST LIGHT on a 2D frame (the stage): what a PointLight2D at that place and height shows, with the scene's
// darkness as `ambient` (a CanvasModulate), in the wrapped Lambert every shader uses. Glowing pixels stay as drawn.
function litShade(f, n, st, L) {
  const W = f.w, H = f.h, d = f.data, nd = n.data, out = new Uint8ClampedArray(W * H * 4), thr = litGlow(st) * 255, hot = litHotOnly(st);
  const amb = L.ambient != null ? L.ambient : 0.3, e = L.energy != null ? L.energy : 1, col = L.color || [1, 1, 1];
  const z = L.z != null ? L.z : Math.min(W, H) * 0.4, steps = litSteps(st);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = d[i + 3];
    if (!a) continue;
    out[i + 3] = a;
    if (litIsGlow(d, i, thr, hot)) { out[i] = d[i]; out[i + 1] = d[i + 1]; out[i + 2] = d[i + 2]; continue; }
    const nx = nd[i] / 127.5 - 1, ny = nd[i + 1] / 127.5 - 1, nz = nd[i + 2] / 127.5 - 1;
    const lx = L.x - (x + 0.5), ly = -(L.y - (y + 0.5)), ll = Math.hypot(lx, ly, z) || 1;
    const ndl = (nx * lx + ny * ly + nz * z) / ll / (Math.hypot(nx, ny, nz) || 1);
    const w = litBand(Math.max(0, Math.min(1, (ndl + LIT_WRAP) / (1 + LIT_WRAP))), steps);
    for (let k = 0; k < 3; k++) out[i + k] = d[i + k] * (amb + e * col[k] * w);
  }
  return { w: W, h: H, data: out };
}

// ---------- THE GODOT SHADERS (text; index.html and fx3d.js put them into the scenes) ----------
// 2D: the Sprite's material. NORMAL_MAP from the aligned <base>_n.png (the frame's UV is the sheet's: AtlasTexture
// regions), the wrapped Lambert in light(). Glowing pixels: flat, and the Glow child draws them over it unshaded.
function litShader2d(steps) {
  return [
    "shader_type canvas_item;",
    "// CrunchyVFX Lit: the effect takes 2D lights (PointLight2D, DirectionalLight2D) through its normal map.",
    "uniform sampler2D normal_sheet : filter_nearest;",
    "// how far light wraps round the far side (0: a hard Lambert)",
    "uniform float wrap = " + LIT_WRAP.toFixed(2) + ";",
    "// pixel art: the light in this many hard bands (0: smooth)",
    "uniform float steps = " + (steps || 0).toFixed(1) + ";",
    "void fragment() {",
    "\tNORMAL_MAP = texture(normal_sheet, UV).rgb;",
    "}",
    "void light() {",
    "\tfloat w = clamp((dot(NORMAL, LIGHT_DIRECTION) + wrap) / (1.0 + wrap), 0.0, 1.0);",
    "\tif (steps > 0.0) {",
    "\t\tw = floor(w * steps + 0.5) / steps;",
    "\t}",
    "\tLIGHT = vec4(COLOR.rgb * LIGHT_COLOR.rgb * LIGHT_ENERGY * w, LIGHT_COLOR.a);",
    "}",
    ""].join("\n");
}
// the Glow child's material: only the glowing pixels (the export's emissive test), unshaded, so no CanvasModulate dims them
function litGlowShader2d() {
  return [
    "shader_type canvas_item;",
    "render_mode unshaded;",
    "// CrunchyVFX Lit: the glowing pixels stay as drawn (luminance x alpha at or over the effect's Glow thresh).",
    "uniform float glow_threshold = 0.5;",
    "// 1: an effect of matter (smoke, dust, ink): only its fire-colored bright pixels glow",
    "uniform float hot_only = 0.0;",
    LIT_HOT_GLSL,
    "void fragment() {",
    "\tvec4 c = texture(TEXTURE, UV);",
    "\tif (dot(c.rgb, vec3(0.3, 0.6, 0.1)) * c.a < glow_threshold || (hot_only > 0.5 && !lit_hot(c.rgb))) {",
    "\t\tdiscard;",
    "\t}",
    "}",
    ""].join("\n");
}
// the Glow child follows its Sprite's animation and frame (it is a child, so it takes its place, scale and flips)
var LIT_GLOW_SYNC = [
  "extends AnimatedSprite2D",
  "# CrunchyVFX Lit: shows the parent Sprite's frame, unshaded (only its glowing pixels draw).",
  "func _ready() -> void:",
  "\tvar s := get_parent() as AnimatedSprite2D",
  "\tif not s:",
  "\t\treturn",
  "\ts.animation_changed.connect(func(): animation = s.animation)",
  "\ts.frame_changed.connect(func(): frame = s.frame)",
  "\tanimation = s.animation",
  "\tframe = s.frame",
  ""].join("\n");
// 3D: the AnimatedSprite3D's material_override. A material override takes the place of the sprite's own material, so
// it does what that one did: the billboard by stand (Godot's own StandardMaterial3D lines, keeping scale), the sheet
// (the mesh's UV is the sheet's), nearest, the alpha cut or blend. Then albedo + NORMAL_MAP, the wrapped Lambert in
// light(), and the glowing pixels as EMISSION with no albedo (unshaded: no light changes them).
function litShader3d(stand, alpha, steps) {
  const bb = stand === "face" ? [
    "\tMODELVIEW_MATRIX = VIEW_MATRIX * mat4(MAIN_CAM_INV_VIEW_MATRIX[0], MAIN_CAM_INV_VIEW_MATRIX[1], MAIN_CAM_INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);",
  ] : stand === "upright" ? [
    "\tMODELVIEW_MATRIX = VIEW_MATRIX * mat4(vec4(normalize(cross(vec3(0.0, 1.0, 0.0), MAIN_CAM_INV_VIEW_MATRIX[2].xyz)), 0.0), vec4(0.0, 1.0, 0.0, 0.0), vec4(normalize(cross(MAIN_CAM_INV_VIEW_MATRIX[0].xyz, vec3(0.0, 1.0, 0.0))), 0.0), MODEL_MATRIX[3]);",
  ] : null;
  const L = [
    "shader_type spatial;",
    "// CrunchyVFX Lit: the effect's sprite takes the scene's lights through its normal map; glowing pixels stay emissive.",
    "render_mode cull_disabled, specular_disabled" + (alpha === "blend" ? ", blend_mix, depth_draw_never" : ", depth_draw_opaque") + ";",
    "uniform sampler2D sheet : filter_nearest;",
    "uniform sampler2D normal_sheet : filter_nearest;",
    "// luminance x alpha at or over this glows (the effect's Glow thresh; over 1: nothing does)",
    "uniform float glow_threshold = 0.5;",
    "// 1: an effect of matter (smoke, dust, ink): only its fire-colored bright pixels glow",
    "uniform float hot_only = 0.0;",
    LIT_HOT_GLSL,
    "uniform float wrap = " + LIT_WRAP.toFixed(2) + ";",
    "// pixel art: the light in this many hard bands (0: smooth)",
    "uniform float steps = " + (steps || 0).toFixed(1) + ";",
    "// -1 on an axis the sprite is flipped on (the scene's Variety sets it), so the normals flip with the picture",
    "uniform vec2 flip = vec2(1.0, 1.0);",
  ];
  if (bb) L.push("void vertex() {", ...bb,
    "\tMODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));",
    "\tMODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);",
    "}");
  L.push("void fragment() {",
    "\tvec4 c = texture(sheet, UV) * COLOR;",
    alpha === "blend" ? "\tALPHA = c.a;" : "\tif (c.a < 0.5) {\n\t\tdiscard;\n\t}",
    "\tvec3 lin = mix(c.rgb / 12.92, pow((c.rgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c.rgb));",
    "\tif (dot(c.rgb, vec3(0.3, 0.6, 0.1)) * c.a >= glow_threshold && (hot_only < 0.5 || lit_hot(c.rgb))) {",
    "\t\tALBEDO = vec3(0.0);",
    "\t\tEMISSION = lin;",
    "\t} else {",
    "\t\tALBEDO = lin;",
    "\t\tvec3 nm = texture(normal_sheet, UV).rgb;",
    "\t\tnm.xy = (nm.xy - 0.5) * flip + 0.5;",
    "\t\tNORMAL_MAP = nm;",
    "\t}",
    "\tROUGHNESS = 1.0;",
    "}",
    "void light() {",
    "\tfloat w = clamp((dot(NORMAL, LIGHT) + wrap) / (1.0 + wrap), 0.0, 1.0);",
    "\tif (steps > 0.0) {",
    "\t\tw = floor(w * steps + 0.5) / steps;",
    "\t}",
    "\tDIFFUSE_LIGHT += w * ATTENUATION * LIGHT_COLOR / PI;",
    "}",
    "");
  return L.join("\n");
}
// fx3dHot in GLSL (the sheet's raw 0..1 values): bright, strongly saturated, red to yellow
var LIT_HOT_GLSL = "bool lit_hot(vec3 c) {\n\tfloat mx = max(c.r, max(c.g, c.b)), d = mx - min(c.r, min(c.g, c.b));\n" +
  "\treturn mx >= 96.0 / 255.0 && c.r >= mx && d >= 0.6 * mx && c.b <= c.g + 0.25 * d;\n}";
// a shader's code as a .tscn string value (Godot's escapes: backslash and quote)
function litTscnString(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }

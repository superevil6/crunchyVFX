// GENERATED from crunchyCore/shader.js @ b392977 by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 e624efef7372bba3bb4e6f6204cf1908d3ec8899ea0afee5d46ae6eae388b1aa
"use strict";
// Crunchy suite: SHADER, the first piece of CrunchyShader (~/Code/crunchyTile/SHADER-HANDOFF.md §2), proved on ITEM
// EFFECTS for CrunchyItems. AJ, 2026-10-14: "Basic shaders that can be represented in browser, like a flame overlay, or
// sparkling. Something that can be exported to Godot and Unity as part of the item." Decisions: a small effect language
// (an IR) whose JS INTERPRETER is the reference picture (and the browser preview); PRINTERS emit a Godot 4 canvas_item
// `.gdshader` and a Unity URP 2D sprite `.shader` (and a WebGL2 GLSL ES 3.00 fragment); every export also carries BAKED
// frames for engines without the shader. The design note is SHADER.md (IR v2, how to write an effect).
//
// PURE and SELF-CONTAINED (like textures.js and items.js): no DOM, no app state, every helper prefixed `shader`/`SHADER_`.
//
// ---- THE IR ----------------------------------------------------------------------------------------------------------
// An effect is a function of ONE pixel: from its position, the frame and the image it returns that pixel's color. It is
// written in JS through a builder S (below) that makes plain-object NODES { id, op, t, a: [args], v }; equal nodes are
// the same object (interned), so a printer emits each once. Types: "i" a 32-bit int, "b" a bool, "c" a COLOR.
// Everything is INTEGER maths (pixel positions, frame numbers, 0..255 channels, an integer hash): what the CPU computes
// the GPU computes bit for bit, so the engines can match the reference EXACTLY. A color's channels are whole 0..255
// numbers in every target (a GPU stores k / 255 and reads it back as k, exactly).
//
// IR v1 (the six item effects):
//   S.x, S.y        the pixel (ints, 0,0 the TOP-LEFT of the padded image or the screen; every target is printed top-down)
//   S.w, S.h        the padded image's (or the screen's) size          S.frame   the frame, 0 .. FRAMES-1 (the loop closes)
//   S.i(n)          an int constant (plain numbers are taken as ints everywhere)
//   S.p(name)       a param (a uniform): an int or a color, as the effect's `params` declare it
//   S.tex(dx, dy)   the image's color at (x+dx, y+dy); transparent outside the image
//   S.clear         transparent
//   S.alpha(c), S.luma(c)   ints 0..255 (luma = (299 r + 587 g + 114 b) / 1000, floored)      S.solid(c)  alpha >= 128
//   S.add sub mul div mod min max abs neg          div/mod FLOOR (a negative left side rounds down); a divisor <= 0 gives 0
//                                                  add/sub/mul/neg wrap at 32 bits (keep values small; nothing checks)
//   S.lt le gt ge eq ne → bool;  S.and or (any count), S.not;  S.sel(cond, a, b) (any type: ints, bools, colors)
//   S.hash(a, b, c) an int 0..65535 from up to three ints (lowbias32, chained); inputs kept within ±65535
//   S.pick([[cond, value], …], otherwise)   nested sels, the first true cond wins
// IR v2 (CrunchyShader round 1):
//   S.texAt(x, y, mode)   the texel at absolute computed ints (warps): mode "clear" (the default: transparent outside the
//                         image), "clamp" (the nearest edge texel) or "wrap" (x mod w, y mod h)
//   S.rgba(r, g, b, a)    a COMPUTED color from four ints, each clamped to 0..255 (a omitted: 255). FREE effects only.
//   S.r(c) S.g(c) S.b(c) S.a(c)   a color's channels as ints 0..255 (S.a is S.alpha)
//   S.palAt(k, i)         palette param k's i-th color (i clamped to 0 .. count-1), opaque
//   S.palCount(k)         how many colors palette k holds (1 .. its max)
//   S.nearest(c, k, m)    k's color nearest to c's RGB (opaque). m "rgb" (the default): integer squared RGB distance;
//                         "redmean": era.js's 8-bit distance, exactly (x512, integers). The FIRST wins a tie (era.js's rule).
//                         c's alpha is ignored: keep clear pixels clear yourself (S.sel(S.solid(c), …, S.clear)).
//   S.palIndex(c, k)      the index of the first color of k equal to c's RGB, -1 if none or if c is clear (alpha 0)
//   S.progress()          a transition's progress 0..100: the `progress` param, or (when it is -1) the frame,
//                         frame 0 → 0 and frame FRAMES-1 → 100
//   sugar (no new ops):   S.clamp(v, lo, hi)   S.mix(a, b, t, n) = a + (b - a) * t / n (floor)
//                         S.mixc(c1, c2, t, n) the same per channel (free)   S.table([ints…], i) values[clamp(i)]
// Loops (an outline's neighbors, a flame's column) are JS loops in the effect: the IR is the unrolled result. Only
// nearest and palIndex are loops in the printed shaders (over the palette's colors in use).
//
// ---- AN EFFECT (SHADER_DEFS[name]; SHADER_EFFECTS lists the names, APPEND ONLY) -----------------------------------------
//   { label, title,                       what a person reads
//     kind: "sprite",                     "sprite" (the default: one sprite padded by `pad`), "screen" (the whole screen
//                                         at art resolution; pad must be 0) or "both"
//     palette: "strict",                  "strict" (the default): only the image's colors and the effect's own color
//                                         and palette params ever come out; "free": computed colors (S.rgba) allowed
//     frames: 24,                         the LOOP length in frames (a constant: the bake's count; frame N is frame 0);
//                                         1 for a still effect (a look, an era)
//     fps: 12,                            the default playback rate (the `fps` param, a uniform; the loop stays closed)
//     pad: [top, right, bottom, left],    px of transparent margin the effect needs round the sprite (a flame's room)
//     still0: true,                       frame 0 IS the plain image (resting effects); absent: frame 0 is a loop frame
//     turns: true,                        (build 9, sprite only) it turns the WHOLE sprite (spin, tilt, flip): a pixel may
//                                         land anywhere in its pad, so the contract holds it by the pad alone (roomy)
//     transition: "covered",              a transition (screen): the `progress` param is required; progress 0 is the
//                                         plain image, 100 is "covered" (every pixel one color) or this text says
//                                         what 100 means instead (e.g. "the largest blocks")
//     reworks: true,                      (build 42, a "covered" transition) on the way to covered it also MOVES, SHADES or
//                                         BLENDS the picture (paintmelt slides it down, flashcut fades it toward the cover),
//                                         so it cannot be drawn alone over a clear picture: an engine must give it the
//                                         screen. The contract proves every covered transition WITHOUT it draws alone.
//     params: { name: { type: "int", min, max, def, label, choices } | { type: "color", def: "#rrggbb", label }
//                    (choices, build 5, optional: one plain name per value min..max, for an int that picks a WAY rather
//                    than an amount: an app shows them as named choices, never as a number slider)
//                    | { type: "palette", def: ["#rrggbb", …], max: N, label } },
//     fragment: function (S) { … return colourNode; } }
//   Param names are also the uniform names (Godot as they are, Unity `_Name`, GLSL `u_name`): plain lower-case words.
//   A palette k also takes the uniform k_count (Godot `k_count`, GLSL `u_k_count`, Unity `_KCount`).
//   Every effect also gets the uniforms `fps` (int) and `frame_override` (int, -1 = play by time; 0.. = show that frame).
//
// ---- USE -------------------------------------------------------------------------------------------------------------
//   shaderImage(w, h, rgba)                       an image { w, h, rgba: Uint8Array w*h*4 } (straight alpha)
//   shaderFromIndexed(buf, palette, none)         items.js's { w, h, px } + "#rrggbb" palette → an image
//   shaderPad(img, pad)                           the image inside its effect's margin (what the engines draw)
//   shaderParams(name, given)                     the params, defaults filled, ints clamped and rounded
//   shaderRun(name, padded, frame, params)        ONE frame on an already padded image → an image (THE REFERENCE)
//   shaderRunFast(name, padded, frame, params)    the same, compiled to JS (shaderJit): byte-identical, many times faster
//   shaderBake(name, img, params)                 → { w, h, pad, fps, frames: [image …] }: pads, then every frame (fast)
//   shaderStrip(frames)                           the frames side by side, one image (a sprite strip)
//   shaderPrintGodot(name, params) / shaderPrintUnity(name, params) / shaderPrintGLSL(name, params) → source text
//   shaderGodotFiles(name, params, base)          a .gdshader, a ShaderMaterial .tres and a Sprite2D .tscn (texts)
//   (name may also be an effect definition object; its `name` field names it in printed text)
// Color space: every target works on the image's sRGB bytes as they are (Godot 2D does; Unity is told to: the texture is
// imported with sRGB OFF, and in a Linear project the printed shader turns its color params back to sRGB and its output
// to linear; see shaderPrintUnity). Alpha is straight, never premultiplied; every pixel out is fully opaque or clear.

const SHADER_BUILD = 45;

// ---- the builder -------------------------------------------------------------------------------------------------------
function shaderDef(name) {
  const d = typeof name === "string" ? SHADER_DEFS[name] : name;
  if (!d) throw new Error("shader: no effect " + name);
  return d;
}
function shaderNameOf(name) { return typeof name === "string" ? name : (name && name.name) || "effect"; }
const SHADER_TEX_MODES = { clear: "tex", clamp: "texc", wrap: "texw" };
const SHADER_METRICS = ["rgb", "redmean"];
function shaderBuilder(def) {
  const intern = {};
  let next = 0;
  const node = function (op, t, a, v) {
    const key = op + "|" + (v === undefined ? "" : v) + "|" + a.map(function (n) { return n.id; }).join(",");
    if (intern[key]) return intern[key];
    const n = { id: next++, op: op, t: t, a: a, v: v };
    intern[key] = n;
    return n;
  };
  const I = function (x) {
    if (typeof x === "number") {
      if (!(x === Math.floor(x)) || Math.abs(x) > 1e9) throw new Error("shader: not an int constant: " + x);
      return node("const", "i", [], x);
    }
    if (!x || !x.op) throw new Error("shader: not a node: " + x);
    return x;
  };
  const want = function (n, t, what) { if (n.t !== t) throw new Error("shader: " + what + " wants " + t + ", got " + n.t); return n; };
  const ii = function (op) { return function (a, b) { return node(op, "i", [want(I(a), "i", op), want(I(b), "i", op)]); }; };
  const cmp = function (op) { return function (a, b) { return node(op, "b", [want(I(a), "i", op), want(I(b), "i", op)]); }; };
  const many = function (op) {
    return function () {
      const xs = Array.prototype.slice.call(arguments).map(function (n) { return want(I(n), "b", op); });
      if (!xs.length) throw new Error("shader: " + op + " of nothing");
      return xs.reduce(function (acc, n) { return node(op, "b", [acc, n]); });
    };
  };
  const param = function (name) {
    const P = (def.params || {})[name];
    if (!P) throw new Error("shader: no param " + name);
    return P;
  };
  const pal = function (name, what) {
    if (param(name).type !== "palette") throw new Error("shader: " + what + " wants a palette param, " + name + " is " + param(name).type);
    return name;
  };
  const free = function (what) {
    if (def.palette !== "free") throw new Error("shader: " + what + " makes a color: declare palette: \"free\" (this effect is strict)");
  };
  const S = {
    x: node("x", "i", []), y: node("y", "i", []), w: node("w", "i", []), h: node("h", "i", []), frame: node("frame", "i", []),
    FRAMES: def.frames,
    clear: node("clear", "c", []),
    i: function (n) { return I(n); },
    p: function (name) {
      const P = param(name);
      if (P.type === "palette") throw new Error("shader: " + name + " is a palette: read it with S.palAt / S.nearest / S.palIndex");
      return node("uni", P.type === "colour" ? "c" : "i", [], name);
    },
    texAt: function (x, y, mode) {
      const op = SHADER_TEX_MODES[mode === undefined ? "clear" : mode];
      if (!op) throw new Error("shader: texAt mode " + mode + " (clear, clamp or wrap)");
      return node(op, "c", [want(I(x), "i", "tex"), want(I(y), "i", "tex")]);
    },
    tex: function (dx, dy) { return S.texAt(S.add(S.x, dx), S.add(S.y, dy)); },
    alpha: function (c) { return node("alpha", "i", [want(c, "c", "alpha")]); },
    luma: function (c) { return node("luma", "i", [want(c, "c", "luma")]); },
    solid: function (c) { return S.ge(S.alpha(c), 128); },
    r: function (c) { return node("chr", "i", [want(c, "c", "r")]); },
    g: function (c) { return node("chg", "i", [want(c, "c", "g")]); },
    b: function (c) { return node("chb", "i", [want(c, "c", "b")]); },
    a: function (c) { return S.alpha(c); },
    rgba: function (r, g, b, a) {
      free("S.rgba");
      return node("rgba", "c", [want(I(r), "i", "rgba"), want(I(g), "i", "rgba"), want(I(b), "i", "rgba"), want(I(a === undefined ? 255 : a), "i", "rgba")]);
    },
    palAt: function (k, i) { return node("palat", "c", [want(I(i), "i", "palAt")], pal(k, "palAt")); },
    palCount: function (k) { return node("palcount", "i", [], pal(k, "palCount")); },
    nearest: function (c, k, metric) {
      const m = metric === undefined ? "rgb" : metric;
      if (SHADER_METRICS.indexOf(m) < 0) throw new Error("shader: nearest metric " + m + " (rgb or redmean)");
      return node("nearest", "c", [want(c, "c", "nearest")], pal(k, "nearest") + ":" + m);
    },
    palIndex: function (c, k) { return node("palindex", "i", [want(c, "c", "palIndex")], pal(k, "palIndex")); },
    progress: function () {
      const P = param("progress");
      if (P.type !== "int" || P.min !== -1 || P.max !== 100) throw new Error("shader: progress must be { type: \"int\", min: -1, max: 100 }");
      if (def.frames < 2) throw new Error("shader: a transition needs frames >= 2");
      const p = S.p("progress");
      return S.sel(S.ge(p, 0), p, S.div(S.mul(S.frame, 100), def.frames - 1));
    },
    add: function (a, b) { a = I(a); b = I(b); if (b.op === "const" && b.v === 0) return want(a, "i", "add"); if (a.op === "const" && a.v === 0) return want(b, "i", "add"); return ii("add")(a, b); },
    sub: function (a, b) { b = I(b); if (b.op === "const" && b.v === 0) return want(I(a), "i", "sub"); return ii("sub")(a, b); },
    mul: ii("mul"), div: ii("div"), mod: ii("mod"), min: ii("min"), max: ii("max"),
    abs: function (a) { return node("abs", "i", [want(I(a), "i", "abs")]); },
    neg: function (a) { return node("neg", "i", [want(I(a), "i", "neg")]); },
    lt: cmp("lt"), le: cmp("le"), gt: cmp("gt"), ge: cmp("ge"), eq: cmp("eq"), ne: cmp("ne"),
    and: many("and"), or: many("or"),
    not: function (a) { return node("not", "b", [want(I(a), "b", "not")]); },
    sel: function (c, a, b) {
      c = want(I(c), "b", "sel"); a = I(a); b = I(b);
      if (a.t !== b.t) throw new Error("shader: sel of " + a.t + " and " + b.t);
      if (a === b) return a;
      return node("sel", a.t, [c, a, b]);
    },
    hash: function (a, b, c) {
      return node("hash", "i", [want(I(a), "i", "hash"), want(I(b === undefined ? 0 : b), "i", "hash"), want(I(c === undefined ? 0 : c), "i", "hash")]);
    },
    pick: function (cases, otherwise) {
      let out = I(otherwise);
      for (let k = cases.length - 1; k >= 0; k--) out = S.sel(cases[k][0], cases[k][1], out);
      return out;
    },
    // sugar: built from the ops above, so every target already prints it
    clamp: function (v, lo, hi) { return S.min(S.max(v, lo), hi); },
    mix: function (a, b, t, n) { return S.add(a, S.div(S.mul(S.sub(b, a), t), n)); },
    mixc: function (c1, c2, t, n) {
      free("S.mixc");
      return S.rgba(S.mix(S.r(c1), S.r(c2), t, n), S.mix(S.g(c1), S.g(c2), t, n), S.mix(S.b(c1), S.b(c2), t, n), S.mix(S.a(c1), S.a(c2), t, n));
    },
    table: function (values, i) {
      if (!values.length) throw new Error("shader: table of nothing");
      const k = S.clamp(i, 0, values.length - 1);
      const half = function (lo, hi) {                                     // a balanced sel tree over values[lo..hi]
        if (lo === hi) return I(values[lo]);
        const mid = (lo + hi + 1) >> 1;
        return S.sel(S.lt(k, mid), half(lo, mid - 1), half(mid, hi));
      };
      return half(0, values.length - 1);
    },
  };
  return S;
}

// Param names are printed AS THEY ARE as Godot uniforms, so a name may not be a keyword, reserved word or built-in of
// Godot's shading language or GLSL ES 3.00 (built-ins in capitals, TIME, COLOR, UV …, are already out: names are
// lower-case). GLSL prints u_name (no collision). Unity prints _Name, so Unity's own _Time, _MainTex … are out too, as
// are the printers' own names (sh_*, v<n>, fps, frame_override). shaderCompile REFUSES an effect whose param breaks
// this, with the name (chosen over prefixing every Godot uniform: a game sets them by the names the person sees).
const SHADER_RESERVED = ("attribute const uniform varying layout centroid flat smooth noperspective patch sample break continue do for while " +
  "switch case default if else subroutine in out inout float int uint void bool true false invariant precise discard return " +
  "mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 " +
  "bvec4 uvec2 uvec3 uvec4 lowp mediump highp precision sampler2d sampler3d samplercube struct common partition active asm " +
  "class union enum typedef template this resource goto inline noinline public static extern external interface long short " +
  "double half fixed unsigned superp input output hvec2 hvec3 hvec4 fvec2 fvec3 fvec4 filter sizeof cast namespace using " +
  "shader_type render_mode group_uniforms global instance source_color hint_range hint_enum repeat_enable repeat_disable " +
  "radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt abs sign " +
  "floor trunc round roundeven ceil fract mod modf min max clamp mix step smoothstep isnan isinf floatbitstoint floatbitstouint " +
  "intbitstofloat uintbitstofloat fma frexp ldexp length distance dot cross normalize reflect refract faceforward " +
  "matrixcompmult outerproduct transpose determinant inverse lessthan lessthanequal greaterthan greaterthanequal equal " +
  "notequal any all not texture texturesize texelfetch texturelod textureproj texturegrad texturequerylod textureoffset " +
  "dfdx dfdy fwidth packunorm2x16 packsnorm2x16 unpackunorm2x16 unpacksnorm2x16 packhalf2x16 unpackhalf2x16 bitfieldextract " +
  "bitfieldinsert bitfieldreverse bitcount findlsb findmsb fps frame_override sheet_cell sheet_origin whole_node node_size " +
  // a COMBO's own per-layer controls (<layer>_on, <layer>_weight, a one-shot layer's <layer>_frame): an effect param so
  // named would collide (builds 40, 44)
  "on weight frame " +
  // the one-node overlay's own uniform (build 41)
  "pixel " +
  // GLSL ES 3.00's remaining reserved words
  "volatile coherent restrict readonly writeonly buffer shared atomic_uint iimage2d uimage2d image2d " +
  // Godot's shading-language tokens (uniform hints, render and stencil modes, its own keywords)
  "stencil_mode hint_default_white hint_default_black hint_default_transparent hint_normal hint_roughness_normal " +
  "hint_roughness_r hint_roughness_g hint_roughness_b hint_roughness_a hint_roughness_gray hint_anisotropy hint_screen_texture " +
  "hint_depth_texture hint_normal_roughness_texture filter_nearest filter_linear filter_nearest_mipmap filter_linear_mipmap " +
  "filter_nearest_mipmap_anisotropic filter_linear_mipmap_anisotropic color_conversion_disabled instance_index " +
  // Unity prints a param k as _K: these would be Unity's / URP's own built-ins (_Time, _MainTex, _Flip …)
  "time sin_time cos_time time_parameters screen_params scaled_screen_params screen_size projection_params z_buffer_params " +
  "world_space_camera_pos main_tex main_tex_texel_size renderer_color flip alpha_tex enable_external_alpha global_mip_bias").split(" ");
function shaderNameOk(n) {
  return /^[a-z][a-z0-9_]*$/.test(n) && SHADER_RESERVED.indexOf(n) < 0 && !/^sh_/.test(n) && !/^v\d+$/.test(n);
}
// compile once per effect: the output node and every node it needs, in an order where arguments come first
function shaderCompile(name) {
  const def = shaderDef(name);
  if (def._ir) return def._ir;
  if (def.upscale !== undefined) {
    const U = (def.params || {})[def.upscale];
    if (!U || U.type !== "int" || U.min < 1) throw new Error("shader: upscale names \"" + def.upscale + "\": it must be an int param with min >= 1");
  }
  Object.keys(def.params || {}).forEach(function (k) {
    if (!shaderNameOk(k))
      throw new Error("shader: param name \"" + k + "\" can't be a uniform (a GLSL / Godot keyword or built-in, or a printer's own name): rename it");
  });
  const S = shaderBuilder(def);
  const out = def.fragment(S);
  if (!out || out.t !== "c") throw new Error("shader: an effect must return a color");
  const seen = {}, list = [];
  const walk = function (n) { if (seen[n.id]) return; seen[n.id] = true; n.a.forEach(walk); list.push(n); };
  walk(out);
  list.sort(function (p, q) { return p.id - q.id; });
  const ir = { def: def, out: out, nodes: list };
  Object.defineProperty(def, "_ir", { value: ir, enumerable: false, configurable: true });
  return ir;
}

// ---- COMBOS (build 39): several effects as ONE effect ------------------------------------------------------------------
// AJ, 2026-10-23: Godot gives a sprite ONE material, so a tint on a burning player had to replace the fire. A combo is
// an ordinary effect definition built from layers (bottom first), so the interpreter, the JIT and every printer take it
// unchanged and the game gets one shader:
//   shaderCombo([{ effect: "flame", params: { … } }, { effect: "tint", params: { … } }], { name: "player" })
// Each layer runs through a VIEW of the builder: its texture reads run the layer below at those coordinates (the image
// itself under the first), its params are renamed `<layer>_<param>` (layer = the effect's name, made a valid uniform,
// numbered when repeated: tint, tint2) and its frame counter runs its own loop at its own fps. Every layer also gets
// `<layer>_on` (1; 0 passes the layer below through untouched), so a game switches layers at runtime with no material
// swap. THE IDENTITY (tests/shader.test.mjs): a combo of A then B draws exactly what B draws on A's output (a clear pixel
// and one outside the image are the same 0, so edges agree too), and with a layer off exactly what the combo without it
// draws.
//   TIME: the combo's clock runs at the least common multiple of its animated layers' fps (over SHADER_COMBO_MAX_FPS:
//   the fastest), layer k showing frame floor(f * fps_k / fps) mod frames_k; the loop is the first frame where every
//   layer closes (refused over SHADER_COMBO_MAX_FRAMES).
//   KINDS: sprite and screen effects never mix ("both" goes with either); at most one transition (its progress param is
//   `def.comboProgress`); an UPSCALE effect (crt, lcd, interlace) only on top, the layers under it run at art
//   resolution (their coordinates divided by its k), so a combo [A, crt] draws what crt draws on A's output upscaled.
//   STRENGTH AND BLEND (build 40): every layer has `<layer>_weight` (its strength, 0..100, a live uniform, 100 by
//   default; not `_strength`: 16 effects have a param of that name, which the combo's own would have collided with): how much
//   of it shows over the layer below, by a 4 x 4 ordered dither (hard pixels, the palette kept); in a FREE combo, where
//   both pixels are solid, the colors mix instead (smooth). A layer's `blend` (made with the combo, not a uniform):
//   "replace" (the default), "add", "multiply" or "screen", computed where both pixels are solid (elsewhere the layer's
//   own pixel); any blend but replace makes the combo free. At strength 100 with replace a layer draws exactly as before.
//   SIZE: pads add up; a combo whose compiled graph passes SHADER_COMBO_MAX_NODES is refused (a slow shader in a game is
//   worse than an honest no). Neighbor reads that land on the same pixel share their work (coordinates are folded to a
//   node plus a constant before a layer is run there).
const SHADER_COMBO_BLENDS = ["replace", "add", "multiply", "screen"];   // APPEND ONLY
const SHADER_COMBO_BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SHADER_COMBO_MAX_FPS = 60, SHADER_COMBO_MAX_FRAMES = 480, SHADER_COMBO_MAX_NODES = 20000, SHADER_COMBO_MAX_LAYERS = 8;
function shaderGcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function shaderLcm(a, b) { return a / shaderGcd(a, b) * b; }
// A layer's uniform prefix: the effect's name as a lower-case word that starts with a letter (8-bit → bit8).
function shaderComboPrefix(name) {
  let w = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
  const lead = (w.match(/^[0-9]+/) || [""])[0];
  if (lead) w = w.slice(lead.length) + lead;
  return w || "layer";
}
// The combo's timing: { fps, frames, layer: [{ fps, frames }] } (frames 1: a still layer).
function shaderComboTime(defs) {
  const moving = defs.filter(function (d) { return d.frames > 1; });
  if (!moving.length) return { fps: 1, frames: 1 };
  let fps = moving.reduce(function (a, d) { return shaderLcm(a, Math.max(1, d.fps | 0)); }, 1);
  if (fps > SHADER_COMBO_MAX_FPS) fps = moving.reduce(function (a, d) { return Math.max(a, d.fps | 0); }, 1);
  const frames = moving.reduce(function (a, d) {
    const per = d.frames * fps, n = per / shaderGcd(per, Math.max(1, d.fps | 0));   // the first frame this layer closes on
    return shaderLcm(a, n);
  }, 1);
  return { fps: fps, frames: frames };
}
// Why these layers can't make one combo, or "" (the app shows this instead of failing).
function shaderComboProblem(layers) {
  if (!Array.isArray(layers) || !layers.length) return "A combo needs at least one effect.";
  if (layers.length > SHADER_COMBO_MAX_LAYERS) return "A combo holds up to " + SHADER_COMBO_MAX_LAYERS + " effects.";
  const defs = [];
  for (let i = 0; i < layers.length; i++) {
    const d = SHADER_DEFS[layers[i] && layers[i].effect];
    if (!d) return "There is no effect “" + (layers[i] && layers[i].effect) + "”.";
    if (layers[i].blend !== undefined && SHADER_COMBO_BLENDS.indexOf(layers[i].blend) < 0) return "There is no blend “" + layers[i].blend + "”.";
    defs.push(d);
  }
  const kinds = defs.map(function (d) { return d.kind || "sprite"; });
  if (kinds.indexOf("sprite") >= 0 && kinds.indexOf("screen") >= 0)
    return "Sprite effects and screen effects can't share a combo: one draws on a sprite, the other on the whole screen.";
  if (defs.filter(function (d) { return d.transition; }).length > 1) return "A combo can hold one transition, not two.";
  for (let i = 0; i < defs.length - 1; i++) if (defs[i].upscale !== undefined)
    return "“" + (defs[i].label || layers[i].effect) + "” draws at a larger size, so it can only be the top layer.";
  const t = shaderComboTime(defs);
  if (t.frames > SHADER_COMBO_MAX_FRAMES)
    return "These effects' loops only line up after " + t.frames + " frames (the limit is " + SHADER_COMBO_MAX_FRAMES + "): try fewer moving effects.";
  return "";
}
function shaderCombo(layers, opts) {
  opts = opts || {};
  const problem = shaderComboProblem(layers);
  if (problem) throw new Error(problem);
  const defs = layers.map(function (l) { return SHADER_DEFS[l.effect]; }), time = shaderComboTime(defs);
  // the prefixes: the effect's word, numbered when it repeats (tint, tint2 …)
  const seen = {}, pre = defs.map(function (d, i) {
    const w = shaderComboPrefix(layers[i].effect);
    seen[w] = (seen[w] || 0) + 1;
    return seen[w] > 1 ? w + seen[w] : w;
  });
  const params = {};
  defs.forEach(function (d, i) {
    const given = layers[i].params || {}, P = d.params || {}, who = d.label || layers[i].effect;
    params[pre[i] + "_on"] = { type: "int", min: 0, max: 1, def: layers[i].on === false ? 0 : 1, label: who + ": on", choices: ["off", "on"] };
    const st = layers[i].strength === undefined ? 100 : Math.max(0, Math.min(100, Math.round(+layers[i].strength) || 0));
    params[pre[i] + "_weight"] = { type: "int", min: 0, max: 100, def: st, label: who + ": strength" };
    // A ONE-SHOT layer (it rests on frame 0 and has a loop: a hit flash) gets its own frame (build 44): -1 follows the
    // combo's clock, as before; 0 and up shows that frame of THIS layer only, so a game (the states script) plays it from
    // its first frame at the moment of the hit, whatever the other layers' clock is (usability round, 2026-10-23).
    if (d.still0 && d.frames > 1) params[pre[i] + "_frame"] = { type: "int", min: -1, max: d.frames - 1, def: -1, label: who + ": frame (-1 plays by time)" };
    Object.keys(P).forEach(function (k) {
      // `on` and `weight` are the combo's own (reserved: no effect may name a param so); never let a name land twice
      if (params[pre[i] + "_" + k]) throw new Error("shader: combo param \"" + pre[i] + "_" + k + "\" would be two params");
      const q = Object.assign({}, P[k], { label: who + ": " + (P[k].label || k) });
      if (given[k] !== undefined) q.def = P[k].type === "palette" ? given[k].slice() : given[k];
      params[pre[i] + "_" + k] = q;
    });
  });
  Object.keys(params).forEach(function (k) {
    if (!shaderNameOk(k)) throw new Error("shader: combo param \"" + k + "\" can't be a uniform");
  });
  const kinds = defs.map(function (d) { return d.kind || "sprite"; });
  const top = defs[defs.length - 1], up = top.upscale !== undefined ? pre[defs.length - 1] + "_" + top.upscale : undefined;
  const tr = defs.findIndex(function (d) { return d.transition; });
  const pad = [0, 0, 0, 0];
  defs.forEach(function (d) { const p = d.pad || [0, 0, 0, 0]; for (let k = 0; k < 4; k++) pad[k] += p[k]; });
  const def = {
    name: opts.name || "combo",
    label: opts.label || defs.map(function (d, i) { return d.label || layers[i].effect; }).join(" + "),
    title: "a combo: " + defs.map(function (d, i) { return d.label || layers[i].effect; }).join(", then ") + ", in one shader",
    kind: kinds.indexOf("screen") >= 0 ? "screen" : kinds.indexOf("sprite") >= 0 ? "sprite" : "both",
    palette: defs.some(function (d) { return d.palette === "free"; }) || layers.some(function (l) { return l.blend && l.blend !== "replace"; }) ? "free" : "strict",
    frames: time.frames, fps: time.fps, pad: kinds.indexOf("screen") >= 0 ? [0, 0, 0, 0] : pad,   // a screen has no margin
    params: params,
    combo: layers.map(function (l, i) { return { effect: l.effect, prefix: pre[i], blend: l.blend || "replace" }; }),
  };
  // frame 0 is plain only if every layer rests there (or starts switched off)
  if (defs.every(function (d, i) { return d.still0 || layers[i].on === false; })) def.still0 = true;
  if (defs.some(function (d) { return d.turns; })) def.turns = true;
  if (tr >= 0) { def.transition = defs[tr].transition; def.comboProgress = pre[tr] + "_progress"; }
  if (up) def.upscale = up;
  def.fragment = function (S) {
    // coordinates folded to (node, constant), so neighbor reads that land on one pixel are ONE run of the layer below
    const fold = function (n) {
      n = S.i(n);
      let off = 0;
      for (;;) {
        if (n.op === "add" && n.a[1].op === "const") { off += n.a[1].v; n = n.a[0]; continue; }
        if (n.op === "add" && n.a[0].op === "const") { off += n.a[0].v; n = n.a[1]; continue; }
        if (n.op === "sub" && n.a[1].op === "const") { off -= n.a[1].v; n = n.a[0]; continue; }
        break;
      }
      if (n.op === "const") return S.i(n.v + off);
      return off ? S.add(n, off) : n;
    };
    const K = up ? S.p(up) : null, art = function (n) { return K ? S.div(n, K) : n; };
    const AW = K ? S.div(S.w, K) : S.w, AH = K ? S.div(S.h, K) : S.h;            // the art's size under an upscale
    const memo = {};
    // layer k's color at (X, Y), in its own space (art, or the upscaled screen for an upscale on top); k < 0: the image
    const run = function (k, X, Y) {
      X = fold(X); Y = fold(Y);
      const key = k + ":" + X.id + ":" + Y.id;
      if (memo[key]) return memo[key];
      const d = defs[k], p = pre[k], upTop = K && k === defs.length - 1, W = upTop ? S.w : AW, H = upTop ? S.h : AH;
      const V = Object.create(S);
      V.x = X; V.y = Y; V.w = W; V.h = H; V.FRAMES = d.frames;
      V.frame = d.frames > 1 ? S.mod(S.div(S.mul(S.frame, Math.max(1, d.fps | 0)), time.fps), d.frames) : S.i(0);
      if (d.still0 && d.frames > 1) V.frame = S.sel(S.ge(S.p(p + "_frame"), 0), S.p(p + "_frame"), V.frame);   // its own frame, when set
      // what this layer reads at (x, y), in its space: the layer below (or the image) with the same edge rule
      const below = function (x, y) {
        if (upTop) return run(k - 1, art(x), art(y));                        // the art pixel under this screen pixel
        if (k === 0) return K ? S.texAt(S.mul(x, K), S.mul(y, K), "clear") : S.texAt(x, y, "clear");
        return run(k - 1, x, y);
      };
      V.texAt = function (x, y, mode) {
        x = S.i(x); y = S.i(y);
        const m = mode === undefined ? "clear" : mode;
        if (!SHADER_TEX_MODES[m]) throw new Error("shader: texAt mode " + m + " (clear, clamp or wrap)");
        if (k === 0 && !K) return S.texAt(x, y, m);                          // the image itself: its own edge rule
        if (m === "wrap") return below(S.mod(x, W), S.mod(y, H));
        if (m === "clamp") return below(S.clamp(x, 0, S.sub(W, 1)), S.clamp(y, 0, S.sub(H, 1)));
        return S.sel(S.and(S.ge(x, 0), S.lt(x, W), S.ge(y, 0), S.lt(y, H)), below(x, y), S.clear);
      };
      V.tex = function (dx, dy) { return V.texAt(S.add(X, dx), S.add(Y, dy)); };
      V.p = function (n) { return S.p(p + "_" + n); };
      V.palAt = function (n, i) { return S.palAt(p + "_" + n, i); };
      V.palCount = function (n) { return S.palCount(p + "_" + n); };
      V.nearest = function (c, n, metric) { return S.nearest(c, p + "_" + n, metric); };
      V.palIndex = function (c, n) { return S.palIndex(c, p + "_" + n); };
      V.progress = function () {
        const q = S.p(p + "_progress");
        return S.sel(S.ge(q, 0), q, S.div(S.mul(V.frame, 100), d.frames - 1));
      };
      let out = d.fragment(V);
      if (!out || out.t !== "c") throw new Error("shader: " + layers[k].effect + " must return a color");
      const under = V.texAt(X, Y, "clear"), both = S.and(S.solid(out), S.solid(under));
      // BLEND (where both are solid): add, multiply or screen per channel, opaque
      const blend = layers[k].blend || "replace";
      if (blend !== "replace") {
        const op = blend === "add" ? function (a, b) { return S.min(S.add(a, b), 255); }
          : blend === "multiply" ? function (a, b) { return S.div(S.mul(a, b), 255); }
          : function (a, b) { return S.sub(255, S.div(S.mul(S.sub(255, a), S.sub(255, b)), 255)); };
        out = S.sel(both, S.rgba(op(S.r(under), S.r(out)), op(S.g(under), S.g(out)), op(S.b(under), S.b(out)), 255), out);
      }
      // STRENGTH: a 4 x 4 ordered dither between the layer and what is under it (threshold (2b + 1) * 100 / 32: 100 shows
      // all of it, 0 none); in a free combo, where both are solid, a straight mix of the colors instead
      const sv = S.p(p + "_weight");
      const bay = S.table(SHADER_COMBO_BAYER4, S.add(S.mul(S.mod(Y, 4), 4), S.mod(X, 4)));
      let mixed = S.sel(S.lt(S.div(S.mul(S.add(S.mul(bay, 2), 1), 100), 32), sv), out, under);
      if (def.palette === "free") mixed = S.sel(both, S.rgba(S.mix(S.r(under), S.r(out), sv, 100), S.mix(S.g(under), S.g(out), sv, 100), S.mix(S.b(under), S.b(out), sv, 100), 255), mixed);
      return (memo[key] = S.sel(S.eq(S.p(p + "_on"), 0), under, mixed));
    };
    return run(defs.length - 1, S.x, S.y);
  };
  const ir = shaderCompile(def);
  if (ir.nodes.length > SHADER_COMBO_MAX_NODES)
    throw new Error("This combo would make a very heavy shader (" + ir.nodes.length + " steps a pixel; the limit is " + SHADER_COMBO_MAX_NODES +
                    "): try fewer effects that read their neighbors (outlines, blurs, glows).");
  return def;
}

// ---- images ------------------------------------------------------------------------------------------------------------
function shaderImage(w, h, rgba) { return { w: w, h: h, rgba: rgba || new Uint8Array(w * h * 4) }; }
function shaderHex(h) {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map(function (c) { return c + c; }).join("") : s;
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
}
function shaderFromIndexed(buf, palette, none) {
  const NONE = none !== undefined ? none : (typeof TRANSPARENT !== "undefined" ? TRANSPARENT : 255);
  const img = shaderImage(buf.w, buf.h), rgb = palette.map(shaderHex);
  for (let i = 0; i < buf.w * buf.h; i++) {
    const v = buf.px[i];
    if (v === NONE || !rgb[v]) continue;
    img.rgba[i * 4] = rgb[v][0]; img.rgba[i * 4 + 1] = rgb[v][1]; img.rgba[i * 4 + 2] = rgb[v][2]; img.rgba[i * 4 + 3] = 255;
  }
  return img;
}
function shaderPadOf(name) { const d = typeof name === "string" ? SHADER_DEFS[name] : name; return (d && d.pad) || [0, 0, 0, 0]; }
function shaderPad(img, pad) {
  const p = Array.isArray(pad) ? pad : shaderPadOf(pad);
  const W = img.w + p[1] + p[3], H = img.h + p[0] + p[2], out = shaderImage(W, H);
  for (let y = 0; y < img.h; y++) out.rgba.set(img.rgba.subarray(y * img.w * 4, (y + 1) * img.w * 4), ((y + p[0]) * W + p[3]) * 4);
  return out;
}
// A sprite SHEET re-laid with every frame padded (for Godot's sheet_cell: a frame needs the effect's margin inside its own
// cell). img: the sheet, cw x ch its frame size (frames in rows, left to right), pad [top, right, bottom, left] (or an
// effect name: its pad). → { img, cw, ch }: the new sheet (same columns and rows) and its frame size.
function shaderPadSheet(img, cw, ch, pad) {
  pad = Array.isArray(pad) ? pad : shaderPadOf(pad);
  const cols = Math.max(1, Math.floor(img.w / cw)), rows = Math.max(1, Math.floor(img.h / ch));
  const nw = cw + pad[1] + pad[3], nh = ch + pad[0] + pad[2], out = shaderImage(cols * nw, rows * nh);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = ((r * ch + y) * img.w + c * cw + x) * 4, d = ((r * nh + y + pad[0]) * out.w + c * nw + x + pad[3]) * 4;
    out.rgba.set(img.rgba.subarray(s, s + 4), d);
  }
  return { img: out, cw: nw, ch: nh };
}
// UPSCALE: an effect with `upscale: "<int param>"` (crt, lcd, interlace) reads the ART UPSCALED k times, nearest (one
// texel per output pixel, so a scanline or an LCD gap can sit inside an art pixel), k being that param's value. Feed
// it shaderUpscale(art, shaderUpscaleOf(name, params)); Godot's screen scene builds the same stage (shaderGodotScreenFiles).
function shaderUpscale(img, k) {
  k = Math.max(1, Math.floor(k || 1));
  if (k === 1) return img;
  const W = img.w * k, out = shaderImage(W, img.h * k);
  for (let y = 0; y < img.h; y++) {
    const row = new Uint8Array(W * 4);
    for (let x = 0; x < img.w; x++) for (let i = 0; i < k; i++) row.set(img.rgba.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4), (x * k + i) * 4);
    for (let i = 0; i < k; i++) out.rgba.set(row, (y * k + i) * W * 4);
  }
  return out;
}
function shaderUpscaleOf(name, params) {
  const d = shaderDef(name);
  return d.upscale ? shaderParams(d, params)[d.upscale] : 1;
}
function shaderStrip(frames) {
  const w = frames[0].w, h = frames[0].h, out = shaderImage(w * frames.length, h);
  frames.forEach(function (f, k) {
    for (let y = 0; y < h; y++) out.rgba.set(f.rgba.subarray(y * w * 4, (y + 1) * w * 4), (y * w * frames.length + k * w) * 4);
  });
  return out;
}

// ---- params ------------------------------------------------------------------------------------------------------------
function shaderParamDefs(def) {
  const P = {};
  P.fps = { type: "int", min: 1, max: 60, def: def.fps, label: "Frames per second" };
  Object.keys(def.params || {}).forEach(function (k) { P[k] = def.params[k]; });
  return P;
}
function shaderColourOk(g) { return /^#?[0-9a-f]{6}$/i.test(String(g || "")); }
function shaderColourNorm(g) { return "#" + String(g).replace("#", "").toLowerCase(); }
// a palette: an array of 1 .. max "#rrggbb" colors; anything else (or one bad color) falls back to the default
function shaderPaletteParam(d, g) {
  if (!Array.isArray(g) || !g.length || !g.every(shaderColourOk)) return d.def.slice(0, d.max);
  return g.slice(0, d.max).map(shaderColourNorm);
}
function shaderParams(name, given) {
  const def = shaderDef(name), P = shaderParamDefs(def), out = {};
  Object.keys(P).forEach(function (k) {
    const d = P[k], g = given && given[k];
    if (d.type === "colour") out[k] = shaderColourOk(g) ? shaderColourNorm(g) : d.def;
    else if (d.type === "palette") out[k] = shaderPaletteParam(d, g);
    else out[k] = typeof g === "number" && isFinite(g) ? Math.max(d.min, Math.min(d.max, Math.round(g))) : d.def;
  });
  return out;
}

// ---- the hash (lowbias32, a well-known integer mix): the same bits in JS, GLSL and HLSL ----------------------------------
function shaderMix(x) {
  x = (x ^ (x >>> 16)) >>> 0; x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
function shaderHash3(a, b, c) {
  const h = shaderMix((((a + 65536) >>> 0) ^ shaderMix((((b + 65536) >>> 0) ^ shaderMix((c + 65536) >>> 0)) >>> 0)) >>> 0);
  return h >>> 16;
}
function shaderFloorDiv(a, b) { return b <= 0 ? 0 : Math.floor(a / b); }
function shaderFloorMod(a, b) { return b <= 0 ? 0 : a - b * Math.floor(a / b); }

// ---- colors as packed ints (r << 24 | g << 16 | b << 8 | a, unsigned), the interpreter's and the JIT's form -------------
function shaderPack(r, g, b, a) {
  r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b; a = a < 0 ? 0 : a > 255 ? 255 : a;
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}
function shaderPackHex(h) { const c = shaderHex(h); return shaderPack(c[0], c[1], c[2], 255); }
// palette k's color nearest to c's RGB (opaque); the FIRST wins a tie, as era.js's eraNes / eraPocket do (strict <).
// "redmean" is eraNes's (2 + rm/256) dr² + 4 dg² + (2 + (255-rm)/256) db², times 512: whole numbers, the same order.
function shaderNearestPacked(c, list, n, redmean) {
  const r = (c >>> 24) & 255, g = (c >>> 16) & 255, b = (c >>> 8) & 255;
  let best = 0, bd = 2147483647;
  for (let i = 0; i < n; i++) {
    const p = list[i], pr = (p >>> 24) & 255, dr = r - pr, dg = g - ((p >>> 16) & 255), db = b - ((p >>> 8) & 255);
    const d = redmean ? (1024 + r + pr) * dr * dr + 2048 * dg * dg + (1534 - r - pr) * db * db : dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return list[best];
}
function shaderPalIndexPacked(c, list, n) {
  if ((c & 255) === 0) return -1;
  const rgb = c >>> 8;
  for (let i = 0; i < n; i++) if ((list[i] >>> 8) === rgb) return i;
  return -1;
}
// the uniforms' values for one run: ints as they are, colors packed, palettes { list: [packed…], n }
function shaderUniforms(def, prm) {
  const P = shaderParamDefs(def), U = {};
  Object.keys(P).forEach(function (k) {
    if (P[k].type === "colour") U[k] = shaderPackHex(prm[k]);
    else if (P[k].type === "palette") U[k] = { list: prm[k].map(shaderPackHex), n: prm[k].length };
    else U[k] = prm[k];
  });
  return U;
}

// ---- the INTERPRETER: the reference picture ----------------------------------------------------------------------------
// A tree walk over the compiled nodes, every node every pixel. Kept simple on purpose: it is what everything else
// (the JIT below, Godot, Unity, the WebGL preview) is measured against.
function shaderRun(name, img, frame, params) {
  const ir = shaderCompile(name), def = ir.def, prm = shaderParams(def, params), U = shaderUniforms(def, prm);
  const W = img.w, H = img.h, src = shaderClearClean(img.rgba), out = shaderImage(W, H), N = ir.nodes.length;
  const f = shaderFloorMod(Math.floor(frame), def.frames);
  const slot = {}; ir.nodes.forEach(function (n, k) { slot[n.id] = k; });
  const ops = ir.nodes.map(function (n) { return n.op; });
  const args = ir.nodes.map(function (n) { return n.a.map(function (m) { return slot[m.id]; }); });
  const lit = ir.nodes.map(function (n) {
    if (n.op === "const") return n.v;
    if (n.op === "uni") return U[n.v];
    if (n.op === "palcount") return U[n.v].n;
    if (n.op === "palat" || n.op === "palindex") return U[n.v];
    if (n.op === "nearest") { const kv = n.v.split(":"); return { pal: U[kv[0]], redmean: kv[1] === "redmean" }; }
    return 0;
  });
  const v = new Array(N);
  const texel = function (x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const i = (y * W + x) * 4;
    return ((src[i] << 24) | (src[i + 1] << 16) | (src[i + 2] << 8) | src[i + 3]) >>> 0;
  };
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    for (let k = 0; k < N; k++) {
      const a = args[k];
      switch (ops[k]) {
        case "const": case "uni": case "palcount": v[k] = lit[k]; break;
        case "x": v[k] = px; break;
        case "y": v[k] = py; break;
        case "w": v[k] = W; break;
        case "h": v[k] = H; break;
        case "frame": v[k] = f; break;
        case "clear": v[k] = 0; break;
        case "tex": v[k] = texel(v[a[0]], v[a[1]]); break;
        case "texc": v[k] = texel(Math.min(Math.max(v[a[0]], 0), W - 1), Math.min(Math.max(v[a[1]], 0), H - 1)); break;
        case "texw": v[k] = texel(shaderFloorMod(v[a[0]], W), shaderFloorMod(v[a[1]], H)); break;
        case "alpha": v[k] = v[a[0]] & 255; break;
        case "chr": v[k] = (v[a[0]] >>> 24) & 255; break;
        case "chg": v[k] = (v[a[0]] >>> 16) & 255; break;
        case "chb": v[k] = (v[a[0]] >>> 8) & 255; break;
        case "rgba": v[k] = shaderPack(v[a[0]], v[a[1]], v[a[2]], v[a[3]]); break;
        case "palat": { const p = lit[k]; v[k] = p.list[Math.min(Math.max(v[a[0]], 0), p.n - 1)]; break; }
        case "nearest": { const q = lit[k]; v[k] = shaderNearestPacked(v[a[0]], q.pal.list, q.pal.n, q.redmean); break; }
        case "palindex": { const p = lit[k]; v[k] = shaderPalIndexPacked(v[a[0]], p.list, p.n); break; }
        case "luma": { const c = v[a[0]]; v[k] = Math.floor((((c >>> 24) & 255) * 299 + ((c >>> 16) & 255) * 587 + ((c >>> 8) & 255) * 114) / 1000); break; }
        case "add": v[k] = (v[a[0]] + v[a[1]]) | 0; break;
        case "sub": v[k] = (v[a[0]] - v[a[1]]) | 0; break;
        case "mul": v[k] = Math.imul(v[a[0]], v[a[1]]); break;
        case "div": v[k] = shaderFloorDiv(v[a[0]], v[a[1]]); break;
        case "mod": v[k] = shaderFloorMod(v[a[0]], v[a[1]]); break;
        case "min": v[k] = Math.min(v[a[0]], v[a[1]]); break;
        case "max": v[k] = Math.max(v[a[0]], v[a[1]]); break;
        case "abs": v[k] = Math.abs(v[a[0]]); break;
        case "neg": v[k] = -v[a[0]] | 0; break;
        case "lt": v[k] = v[a[0]] < v[a[1]]; break;
        case "le": v[k] = v[a[0]] <= v[a[1]]; break;
        case "gt": v[k] = v[a[0]] > v[a[1]]; break;
        case "ge": v[k] = v[a[0]] >= v[a[1]]; break;
        case "eq": v[k] = v[a[0]] === v[a[1]]; break;
        case "ne": v[k] = v[a[0]] !== v[a[1]]; break;
        case "and": v[k] = v[a[0]] && v[a[1]]; break;
        case "or": v[k] = v[a[0]] || v[a[1]]; break;
        case "not": v[k] = !v[a[0]]; break;
        case "sel": v[k] = v[a[0]] ? v[a[1]] : v[a[2]]; break;
        case "hash": v[k] = shaderHash3(v[a[0]], v[a[1]], v[a[2]]); break;
        default: throw new Error("shader: unknown op " + ops[k]);
      }
    }
    const c = v[N - 1], o = (py * W + px) * 4;
    if ((c & 255) === 0) continue;                                   // clear stays 0,0,0,0
    out.rgba[o] = (c >>> 24) & 255; out.rgba[o + 1] = (c >>> 16) & 255; out.rgba[o + 2] = (c >>> 8) & 255; out.rgba[o + 3] = c & 255;
  }
  return out;
}

// ---- the JIT: the same IR printed as a JS function (the app's live preview) ---------------------------------------------
// The body is printed from the compiled nodes like the GPU printers' (one const per node), with each op written as the
// interpreter computes it; nodes that do not depend on the pixel are hoisted out of the loops (per frame, per row). It
// must equal shaderRun byte for byte (tests/shader.test.mjs proves it over every effect and random ones). Where `new
// Function` is refused (a strict Content-Security-Policy), shaderRunFast falls back to the interpreter.
function shaderJitSource(ir) {
  const name = {}, level = {}, rows = [[], [], []];
  const ref = function (n) { return name[n.id]; };
  ir.nodes.forEach(function (n) {
    const a = n.a.map(ref);
    level[n.id] = n.op === "x" ? 2 : n.op === "y" ? 1 : n.a.reduce(function (m, q) { return Math.max(m, level[q.id]); }, 0);
    let e;
    switch (n.op) {
      case "const": name[n.id] = n.v < 0 ? "(" + n.v + ")" : String(n.v); return;
      case "x": name[n.id] = "px"; return;
      case "y": name[n.id] = "py"; return;
      case "w": name[n.id] = "W"; return;
      case "h": name[n.id] = "H"; return;
      case "frame": name[n.id] = "f"; return;
      case "clear": name[n.id] = "0"; return;
      case "uni": e = "U[" + JSON.stringify(n.v) + "]"; break;
      case "palcount": e = "U[" + JSON.stringify(n.v) + "].n"; break;
      case "tex": e = "T(" + a[0] + ", " + a[1] + ")"; break;
      case "texc": e = "T(MN(MX(" + a[0] + ", 0), W - 1), MN(MX(" + a[1] + ", 0), H - 1))"; break;
      case "texw": e = "T(M(" + a[0] + ", W), M(" + a[1] + ", H))"; break;
      case "alpha": e = "(" + a[0] + " & 255)"; break;
      case "chr": e = "((" + a[0] + " >>> 24) & 255)"; break;
      case "chg": e = "((" + a[0] + " >>> 16) & 255)"; break;
      case "chb": e = "((" + a[0] + " >>> 8) & 255)"; break;
      case "rgba": e = "PK(" + a.join(", ") + ")"; break;
      case "palat": { const p = "U[" + JSON.stringify(n.v) + "]"; e = p + ".list[MN(MX(" + a[0] + ", 0), " + p + ".n - 1)]"; break; }
      case "nearest": { const kv = n.v.split(":"), p = "U[" + JSON.stringify(kv[0]) + "]"; e = "NR(" + a[0] + ", " + p + ".list, " + p + ".n, " + (kv[1] === "redmean") + ")"; break; }
      case "palindex": { const p = "U[" + JSON.stringify(n.v) + "]"; e = "PI(" + a[0] + ", " + p + ".list, " + p + ".n)"; break; }
      case "luma": e = "FL(((((" + a[0] + ") >>> 24) & 255) * 299 + (((" + a[0] + ") >>> 16) & 255) * 587 + (((" + a[0] + ") >>> 8) & 255) * 114) / 1000)"; break;
      case "add": e = "((" + a[0] + " + " + a[1] + ") | 0)"; break;
      case "sub": e = "((" + a[0] + " - " + a[1] + ") | 0)"; break;
      case "mul": e = "IM(" + a[0] + ", " + a[1] + ")"; break;
      case "div": e = n.a[1].op === "const" && n.a[1].v > 0 ? "FL(" + a[0] + " / " + a[1] + ")" : "(" + a[1] + " <= 0 ? 0 : FL(" + a[0] + " / " + a[1] + "))"; break;
      case "mod": e = n.a[1].op === "const" && n.a[1].v > 0 ? "(" + a[0] + " - " + a[1] + " * FL(" + a[0] + " / " + a[1] + "))" : "(" + a[1] + " <= 0 ? 0 : " + a[0] + " - " + a[1] + " * FL(" + a[0] + " / " + a[1] + "))"; break;
      case "min": e = "MN(" + a[0] + ", " + a[1] + ")"; break;
      case "max": e = "MX(" + a[0] + ", " + a[1] + ")"; break;
      case "abs": e = "AB(" + a[0] + ")"; break;
      case "neg": e = "(-" + a[0] + " | 0)"; break;
      case "lt": e = "(" + a[0] + " < " + a[1] + ")"; break;
      case "le": e = "(" + a[0] + " <= " + a[1] + ")"; break;
      case "gt": e = "(" + a[0] + " > " + a[1] + ")"; break;
      case "ge": e = "(" + a[0] + " >= " + a[1] + ")"; break;
      case "eq": e = "(" + a[0] + " === " + a[1] + ")"; break;
      case "ne": e = "(" + a[0] + " !== " + a[1] + ")"; break;
      case "and": e = "(" + a[0] + " && " + a[1] + ")"; break;
      case "or": e = "(" + a[0] + " || " + a[1] + ")"; break;
      case "not": e = "(!" + a[0] + ")"; break;
      case "sel": e = "(" + a[0] + " ? " + a[1] + " : " + a[2] + ")"; break;
      case "hash": e = "HS(" + a.join(", ") + ")"; break;
      default: throw new Error("shader: cannot compile " + n.op);
    }
    name[n.id] = "v" + n.id;
    rows[level[n.id]].push("const v" + n.id + " = " + e + ";");
  });
  return [
    "const D = X.div, M = X.mod, HS = X.hash, PK = X.pack, NR = X.nearest, PI = X.palIndex;",
    "const IM = Math.imul, MN = Math.min, MX = Math.max, AB = Math.abs, FL = Math.floor;",
    "const T = function (x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return 0; const i = (y * W + x) * 4; return ((src[i] << 24) | (src[i + 1] << 16) | (src[i + 2] << 8) | src[i + 3]) >>> 0; };",
  ].concat(rows[0], ["for (let py = 0; py < H; py++) {"], rows[1], ["for (let px = 0; px < W; px++) {"], rows[2], [
    "const c = " + ref(ir.out) + ", o = (py * W + px) * 4;",
    "if ((c & 255) === 0) continue;",
    "out[o] = (c >>> 24) & 255; out[o + 1] = (c >>> 16) & 255; out[o + 2] = (c >>> 8) & 255; out[o + 3] = c & 255;",
    "}", "}",
  ]).join("\n");
}
const SHADER_JIT_HELP = { div: shaderFloorDiv, mod: shaderFloorMod, hash: shaderHash3, pack: shaderPack, nearest: shaderNearestPacked, palIndex: shaderPalIndexPacked };
// THE COMPILED EFFECTS KEPT ARE BOUNDED TOO (build 40): each def kept its IR and its JIT for the page's life; looking
// through hundreds of effects held gigabytes. The SHADER_JIT_KEEP most recently run keep theirs; an older one gives both
// back (they are rebuilt, identically, the next time it runs).
const SHADER_JIT_KEEP = 64, SHADER_JIT_RECENT = [];
function shaderJitTouch(def) {
  const i = SHADER_JIT_RECENT.indexOf(def);
  if (i >= 0) SHADER_JIT_RECENT.splice(i, 1);
  SHADER_JIT_RECENT.push(def);
  while (SHADER_JIT_RECENT.length > SHADER_JIT_KEEP) { const old = SHADER_JIT_RECENT.shift(); delete old._jit; delete old._ir; }
}
function shaderJit(name) {
  const ir = shaderCompile(name), def = ir.def;
  shaderJitTouch(def);
  if (def._jit === undefined) {
    const body = shaderJitSource(ir);                                      // a bug here throws: never hidden by the fallback
    let fn = null;
    try { fn = new Function("W", "H", "src", "out", "f", "U", "X", body); } catch (e) { fn = null; }   // CSP: no JIT
    Object.defineProperty(def, "_jit", { value: fn, enumerable: false, configurable: true, writable: true });
  }
  return def._jit;
}
// The picture an effect reads: every clear pixel (0, 0, 0, 0), whatever color it carried (see shaderTexHelpers). The
// same array when it already is (the usual case: no copy).
function shaderClearClean(rgba) {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] || !(rgba[i - 3] | rgba[i - 2] | rgba[i - 1])) continue;
    const o = new Uint8ClampedArray(rgba);
    for (let j = i; j < o.length; j += 4) if (!o[j]) { o[j - 3] = 0; o[j - 2] = 0; o[j - 1] = 0; }
    return o;
  }
  return rgba;
}
function shaderRunFast(name, img, frame, params) {
  const fn = shaderJit(name);
  if (!fn) return shaderRun(name, img, frame, params);
  const def = shaderDef(name), U = shaderUniforms(def, shaderParams(def, params)), out = shaderImage(img.w, img.h);
  fn(img.w, img.h, shaderClearClean(img.rgba), out.rgba, shaderFloorMod(Math.floor(frame), def.frames), U, SHADER_JIT_HELP);
  return out;
}
function shaderBake(name, img, params) {
  const def = shaderDef(name), padded = shaderPad(img, def.pad || [0, 0, 0, 0]);
  const frames = [];
  for (let f = 0; f < def.frames; f++) frames.push(shaderRunFast(def, padded, f, params));
  return { w: padded.w, h: padded.h, pad: (def.pad || [0, 0, 0, 0]).slice(), fps: shaderParams(def, params).fps, padded: padded, frames: frames };
}

// ---- PRINTERS ----------------------------------------------------------------------------------------------------------
// One walk over the compiled nodes; each target supplies how a node reads. Leaves print inline; the rest become locals.
// Helpers are printed only when an effect uses them (the six item effects print exactly as at IR v1).
function shaderBody(ir, L) {
  const name = {}, lines = [];
  const ref = function (n) { return name[n.id]; };
  ir.nodes.forEach(function (n) {
    const a = n.a.map(ref);
    let e;
    switch (n.op) {
      case "const": name[n.id] = n.v < 0 ? "(" + n.v + ")" : String(n.v); return;
      case "x": name[n.id] = "sh_x"; return;
      case "y": name[n.id] = "sh_y"; return;
      case "w": name[n.id] = "sh_w"; return;
      case "h": name[n.id] = "sh_h"; return;
      case "frame": name[n.id] = "sh_f"; return;
      case "clear": name[n.id] = L.clear; return;
      case "uni": name[n.id] = L.uni(n); return;
      case "palcount": name[n.id] = "sh_palcount_" + n.v + "()"; return;
      case "tex": e = L.tex(a[0], a[1]); break;
      case "texc": e = L.tex(a[0], a[1], "c"); break;
      case "texw": e = L.tex(a[0], a[1], "w"); break;
      case "alpha": e = "sh_alpha(" + a[0] + ")"; break;
      case "chr": e = "sh_ch(" + a[0] + ".r)"; break;
      case "chg": e = "sh_ch(" + a[0] + ".g)"; break;
      case "chb": e = "sh_ch(" + a[0] + ".b)"; break;
      case "rgba": e = "sh_rgba(" + a.join(", ") + ")"; break;
      case "palat": e = "sh_palat_" + n.v + "(" + a[0] + ")"; break;
      case "nearest": { const kv = n.v.split(":"); e = "sh_nearest_" + (kv[1] === "redmean" ? "rm_" : "") + kv[0] + "(" + a[0] + ")"; break; }
      case "palindex": e = "sh_palindex_" + n.v + "(" + a[0] + ")"; break;
      case "luma": e = "sh_luma(" + a[0] + ")"; break;
      case "add": e = a[0] + " + " + a[1]; break;
      case "sub": e = a[0] + " - " + a[1]; break;
      case "mul": e = a[0] + " * " + a[1]; break;
      case "div": e = "sh_div(" + a[0] + ", " + a[1] + ")"; break;
      case "mod": e = "sh_mod(" + a[0] + ", " + a[1] + ")"; break;
      case "min": e = "min(" + a[0] + ", " + a[1] + ")"; break;
      case "max": e = "max(" + a[0] + ", " + a[1] + ")"; break;
      case "abs": e = "abs(" + a[0] + ")"; break;
      case "neg": e = "-" + a[0]; break;
      case "lt": e = a[0] + " < " + a[1]; break;
      case "le": e = a[0] + " <= " + a[1]; break;
      case "gt": e = a[0] + " > " + a[1]; break;
      case "ge": e = a[0] + " >= " + a[1]; break;
      case "eq": e = a[0] + " == " + a[1]; break;
      case "ne": e = a[0] + " != " + a[1]; break;
      case "and": e = a[0] + " && " + a[1]; break;
      case "or": e = a[0] + " || " + a[1]; break;
      case "not": e = "!" + a[0]; break;
      case "sel": e = L.sel(n.t, a[0], a[1], a[2]); break;
      case "hash": e = "sh_hash(" + a[0] + ", " + a[1] + ", " + a[2] + ")"; break;
      default: throw new Error("shader: cannot print " + n.op);
    }
    name[n.id] = "v" + n.id;
    lines.push("\t" + L.type[n.t] + " v" + n.id + " = " + e + ";");
  });
  return { lines: lines, out: ref(ir.out) };
}
// what an effect's IR uses: { ops: { op: true }, nearest: { k: { rgb, redmean } }, palindex: { k: true } }
function shaderUses(ir) {
  const u = { ops: {}, nearest: {}, palindex: {} };
  ir.nodes.forEach(function (n) {
    u.ops[n.op] = true;
    if (n.op === "nearest") { const kv = n.v.split(":"); (u.nearest[kv[0]] = u.nearest[kv[0]] || {})[kv[1]] = true; }
    if (n.op === "palindex") u.palindex[n.v] = true;
  });
  return u;
}
function shaderPalettes(def) { const P = def.params || {}; return Object.keys(P).filter(function (k) { return P[k].type === "palette"; }); }
function shaderGlslFloat(x) { const s = String(Math.round(x * 1e6) / 1e6); return /[.e]/.test(s) ? s : s + ".0"; }
function shaderColourVec(hex, kw) { return kw + "(" + shaderHex(hex).map(function (c) { return shaderGlslFloat(c / 255); }).join(", ") + ", 1.0)"; }
// a palette param's default list padded to its max (unused slots opaque black; the count says how many are in use)
function shaderPalPadded(d, list) { const out = list.slice(0, d.max); while (out.length < d.max) out.push("#000000"); return out; }
function shaderHeader(def, name, lead) {
  const items = def.group === "Items", kind = def.kind || "sprite";
  return [lead + " CrunchyShader " + (items ? "item effect" : kind + " effect") + " \"" + name + "\" (" + def.label + "): " + def.title,
    lead + " Made by crunchyCore shader.js build " + SHADER_BUILD + ". CC0: drawn in code, no generative AI, no samples.",
    lead + " Loops every " + def.frames + " frames; frame_override >= 0 shows one frame (the baked frames match it pixel for pixel).",
    kind === "screen" ? lead + " A SCREEN effect: it reads the whole picture at art resolution, one pixel per art pixel (in Godot, the overlay version reads the screen itself)."
      : lead + " The sprite carries a transparent margin of " + (def.pad || [0, 0, 0, 0]).join("/") + " px (top/right/bottom/left) for the effect."];
}
// the int helpers, the same maths in every target (floor division; a divisor <= 0 gives 0, as the interpreter's).
// Every helper's own parameters and locals are sh_-named: Godot refuses a local that shadows a uniform, and a param
// may be called size, c or n (params may not start with sh_).
function shaderHelpers(T, u) {
  const out = [
    "uint sh_mix(uint sh_v) {",
    "\tsh_v = sh_v ^ (sh_v >> 16" + T.u + "); sh_v = sh_v * 2146121005" + T.u + ";",
    "\tsh_v = sh_v ^ (sh_v >> 15" + T.u + "); sh_v = sh_v * 2221713035" + T.u + ";",
    "\treturn sh_v ^ (sh_v >> 16" + T.u + ");",
    "}",
    "int sh_hash(int sh_a, int sh_b, int sh_c) {",
    "\tuint sh_m = sh_mix(uint(sh_a + 65536) ^ sh_mix(uint(sh_b + 65536) ^ sh_mix(uint(sh_c + 65536))));",
    "\treturn int(sh_m >> 16" + T.u + ");",
    "}",
    "int sh_div(int sh_a, int sh_b) {",
    "\tif (sh_b <= 0) return 0;",
    "\tif (sh_a >= 0) return sh_a / sh_b;",
    "\treturn -((-sh_a + sh_b - 1) / sh_b);",
    "}",
    "int sh_mod(int sh_a, int sh_b) {",
    "\tif (sh_b <= 0) return 0;",
    "\treturn sh_a - sh_b * sh_div(sh_a, sh_b);",
    "}",
    "int sh_alpha(" + T.vec4 + " sh_c) { return int(round(sh_c.a * 255.0)); }",
    "int sh_luma(" + T.vec4 + " sh_c) {",
    "\t" + T.ivec3 + " sh_k = " + T.ivec3 + "(round(sh_c.rgb * 255.0));",
    "\treturn (sh_k.r * 299 + sh_k.g * 587 + sh_k.b * 114) / 1000;",
    "}",
  ];
  if (u && (u.ops.chr || u.ops.chg || u.ops.chb)) out.push("int sh_ch(float sh_v) { return int(round(sh_v * 255.0)); }");
  if (u && u.ops.rgba) out.push(T.vec4 + " sh_rgba(int sh_r, int sh_g, int sh_b, int sh_a) { return " + T.vec4 + "(float(clamp(sh_r, 0, 255)), float(clamp(sh_g, 0, 255)), float(clamp(sh_b, 0, 255)), float(clamp(sh_a, 0, 255))) / 255.0; }");
  return out;
}
// the palette helpers, after sh_alpha. Every target holds a palette k two ways: the colors given at print time, printed
// as a const array (sh_def_k, sh_defn_k colors in use), and the uniform array k with its count. The count uniform is -1
// by default: use the printed palette. A count >= 0 (a material, a .tres, a script) switches to the uniform array.
// (Godot refuses default values on uniform arrays, and Unity materials cannot keep an array property: hence two.)
// T.uni(k) / T.cnt(k) name the uniform array and its count; T.constArr(type, name, M, items) prints a const array.
// The loops run to the palette's max (a constant) and break at the count: every target accepts that form.
function shaderPalHelpers(def, u, T, prm) {
  const P = def.params || {}, out = [];
  shaderPalettes(def).forEach(function (k) {
    const M = P[k].max, q = T.ivec3 + "(round(sh_c.rgb * 255.0))", pi = T.ivec3 + "(round(sh_palat_" + k + "(sh_i).rgb * 255.0))";
    out.push(T.constArr(T.vec4, "sh_def_" + k, M, shaderPalPadded(P[k], prm[k]).map(function (h) { return shaderColourVec(h, T.vec4); })),
      T.constInt + " sh_defn_" + k + " = " + prm[k].length + ";",
      "int sh_palcount_" + k + "() { int sh_n = " + T.cnt(k) + "; return clamp(sh_n >= 0 ? sh_n : sh_defn_" + k + ", 1, " + M + "); }",
      T.vec4 + " sh_palraw_" + k + "(int sh_i) { if (" + T.cnt(k) + " >= 0) return " + T.uni(k) + "[sh_i]; return sh_def_" + k + "[sh_i]; }",
      T.vec4 + " sh_palat_" + k + "(int sh_i) { return " + T.vec4 + "(sh_palraw_" + k + "(clamp(sh_i, 0, sh_palcount_" + k + "() - 1)).rgb, 1.0); }");
    Object.keys(u.nearest[k] || {}).forEach(function (m) {
      const dist = m === "redmean" ? "(1024 + sh_q.x + sh_p.x) * sh_d.x * sh_d.x + 2048 * sh_d.y * sh_d.y + (1534 - sh_q.x - sh_p.x) * sh_d.z * sh_d.z" : "sh_d.x * sh_d.x + sh_d.y * sh_d.y + sh_d.z * sh_d.z";
      out.push(T.vec4 + " sh_nearest_" + (m === "redmean" ? "rm_" : "") + k + "(" + T.vec4 + " sh_c) {",
        "\t" + T.ivec3 + " sh_q = " + q + ";",
        "\tint sh_n = sh_palcount_" + k + "();",
        "\tint sh_best = 0;",
        "\tint sh_bd = 2147483647;",
        "\tfor (int sh_i = 0; sh_i < " + M + "; sh_i++) {",
        "\t\tif (sh_i >= sh_n) break;",
        "\t\t" + T.ivec3 + " sh_p = " + pi + ";",
        "\t\t" + T.ivec3 + " sh_d = sh_q - sh_p;",
        "\t\tint sh_dd = " + dist + ";",
        "\t\tif (sh_dd < sh_bd) { sh_bd = sh_dd; sh_best = sh_i; }",
        "\t}",
        "\treturn sh_palat_" + k + "(sh_best);",
        "}");
    });
    if (u.palindex[k]) out.push("int sh_palindex_" + k + "(" + T.vec4 + " sh_c) {",
      "\tif (sh_alpha(sh_c) == 0) return -1;",
      "\t" + T.ivec3 + " sh_q = " + q + ";",
      "\tint sh_n = sh_palcount_" + k + "();",
      "\tfor (int sh_i = 0; sh_i < " + M + "; sh_i++) {",
      "\t\tif (sh_i >= sh_n) break;",
      "\t\t" + T.ivec3 + " sh_p = " + pi + ";",
      "\t\tif (sh_q.x == sh_p.x && sh_q.y == sh_p.y && sh_q.z == sh_p.z) return sh_i;",
      "\t}",
      "\treturn -1;",
      "}");
  });
  return out;
}
// the texel readers: clear outside (sh_tex), clamped (sh_texc, when used), wrapped (sh_texw, when used). sig(name) opens
// one (its parameters sh_tx, sh_ty, its size sh_tw, sh_th); R(x, y) reads a texel.
// A CLEAR texel reads as (0, 0, 0, 0) (build 42), as shaderRun reads it (shaderClearClean): an importer may color the
// clear pixels (Godot's default "Fix Alpha Border", Unity's "Alpha Is Transparency" dilate the edge colors into them), and
// an effect that looks at a clear pixel's color (atari2600, woodblock) must not see that.
function shaderTexHelpers(u, sig, R, vec4zero) {
  const ty = vec4zero.split("(")[0];
  const ret = function (e) { return "\t" + ty + " sh_c = " + e + ";\n\treturn sh_c.a > 0.0 ? sh_c : " + vec4zero + ";"; };
  const out = [sig("sh_tex"), "\tif (sh_tx < 0 || sh_ty < 0 || sh_tx >= sh_tw || sh_ty >= sh_th) return " + vec4zero + ";", ret(R("sh_tx", "sh_ty")), "}"];
  if (u.ops.texc) out.push(sig("sh_texc"), ret(R("clamp(sh_tx, 0, sh_tw - 1)", "clamp(sh_ty, 0, sh_th - 1)")), "}");
  if (u.ops.texw) out.push(sig("sh_texw"), ret(R("sh_mod(sh_tx, sh_tw)", "sh_mod(sh_ty, sh_th)")), "}");
  return out;
}

// Godot 4 canvas_item. Put it on a Sprite2D (or TextureRect) showing the PADDED sprite. texelFetch reads exact texels;
// the 2D canvas is sRGB, as the reference is. SPRITE SHEETS (build 5): an AnimatedSprite2D's frames are AtlasTextures
// (regions of one sheet), and Godot hands the shader the WHOLE sheet as TEXTURE with UV in the sheet's space. Set the
// uniforms sheet_cell (a frame's size in px) and sheet_origin (where the grid starts, (0, 0) usually): the shader finds
// the frame the pixel is in, measures x, y, w and h inside THAT frame, and reads neighbors only inside it (outside is
// clear, or clamped / wrapped within the frame), so the effect on a frame of a sheet is the effect on that frame alone
// (tests/shader-godot.mjs proves it on a 4-frame sheet through AnimatedSprite2D and Sprite2D hframes). A single region
// (Sprite2D region_rect) is sheet_origin = its position, sheet_cell = its size. The effect draws only inside the frame:
// give every frame the effect's pad of clear room (shaderPadSheet), or it is cut at the frame's edge.
// WHOLE NODE (build 45, AJ's CrunchyUI panels): a Control that draws its texture in PIECES (a NinePatchRect: corners,
// edges, a stretched or TILED center; a TextureRect in tile mode) hands every piece UV in the texture's space, so an effect
// placed by position (a glint, a sweep, a gradient) restarted in every piece, a grid of glints over a tiled panel. With
// `whole_node` on and `node_size` = the node's size in px, x, y, w and h are the pixel's place on the NODE (VERTEX, local
// space, through a varying) and the effect spans the node once; the picture is still read from the texture at the texel
// being drawn, its neighbors at the matching offsets (outside the node, or the texture, is clear). An effect that reads
// only its own pixel then draws exactly what it draws on the panel as one picture (tests/shader-godot.mjs, a tiled
// NinePatchRect); one that reads neighbors (outline, glow) reads across a piece's seam in the TEXTURE. Off: unchanged.
// opts.overlay (build 41): the ONE-NODE SCREEN OVERLAY version (shaderGodotOverlayFiles). It reads the SCREEN (Godot's
// hint_screen_texture: everything drawn under it) instead of its own node's texture, and finds its art pixel from the
// screen position: `pixel` window pixels per pixel the effect reads (1 when the game renders at art size, Stretch Mode
// "viewport"; the game's scale when it draws art bigger; for an upscale effect, the scale / k). Each pixel is read from
// the middle of its block. The effect's body is the same nodes, so it draws what the interpreter draws on that art.
function shaderPrintGodot(name, params, opts) {
  const ir = shaderCompile(name), def = ir.def, P = shaderParamDefs(def), prm = shaderParams(def, params), u = shaderUses(ir);
  const overlay = !!(opts && opts.overlay), pixel = Math.max(1, Math.floor((opts && opts.pixel) || 1));
  const uni = [];
  Object.keys(P).forEach(function (k) {
    const d = P[k];
    // build 44: the setting's own words as a doc comment, which Godot's Inspector shows as the uniform's tooltip
    // (a first-time user met `maskamt` and `curve` there; the names stay, links and saved designs use them)
    if (d.label) uni.push("/** " + String(d.label).replace(/\*\//g, "* /") + (d.choices ? ": " + d.choices.map(function (c, i) { return (d.min + i) + " " + c; }).join(", ") : "") + " */");
    if (d.type === "colour") uni.push("uniform vec4 " + k + " : source_color = " + shaderColourVec(prm[k], "vec4") + ";");
    else if (d.type === "palette") {
      uni.push("uniform vec4 " + k + "[" + d.max + "] : source_color;");
      uni.push("uniform int " + k + "_count : hint_range(-1, " + d.max + ") = -1; // -1: the palette printed below (" + prm[k].join(" ") + ")");
    } else uni.push("uniform int " + k + " : hint_range(" + d.min + ", " + d.max + ") = " + prm[k] + ";");
  });
  uni.push("uniform int frame_override : hint_range(-1, " + (def.frames - 1) + ") = -1;");
  if (overlay) uni.push("// the screen under this overlay, and how many window pixels make one pixel the effect reads",
    "uniform sampler2D sh_screen : hint_screen_texture, filter_nearest;",
    "uniform int pixel : hint_range(1, 16) = " + pixel + ";");
  else uni.push("// a SPRITE SHEET (AnimatedSprite2D frames, Sprite2D hframes/vframes or region): each frame's size in px, and where the",
    "// grid starts. (0, 0): the whole texture is one sprite. The effect then works inside the frame being drawn, as if it were alone.",
    "uniform ivec2 sheet_cell = ivec2(0, 0);",
    "uniform ivec2 sheet_origin = ivec2(0, 0);",
    "// WHOLE NODE: on a NinePatchRect (or any Control that draws its texture in pieces or tiles), on, with node_size = the",
    "// node's size in px, spans the effect over the whole node once instead of restarting it in every piece.",
    "uniform bool whole_node = false;",
    "uniform ivec2 node_size = ivec2(0, 0);");
  const body = shaderBody(ir, {
    type: { i: "int", b: "bool", c: "vec4" }, clear: "vec4(0.0)",
    uni: function (n) { return n.v; },
    tex: function (x, y, m) { return "sh_tex" + (m || "") + "(" + (overlay ? "sh_screen" : "TEXTURE") + ", sh_size, sh_o, " + x + ", " + y + ")"; },
    sel: function (t, c, a, b) { return c + " ? " + a + " : " + b; },
  });
  const T = { u: "u", vec4: "vec4", ivec3: "ivec3" };
  const tex = shaderTexHelpers(u, function (n) { return "vec4 " + n + "(sampler2D sh_tt, ivec2 sh_ts, ivec2 sh_to, int sh_tx, int sh_ty) {\n\tint sh_tw = sh_ts.x;\n\tint sh_th = sh_ts.y;"; },
    overlay ? function (x, y) { return "texelFetch(sh_tt, (sh_to + ivec2(" + x + ", " + y + ")) * pixel + ivec2(pixel / 2), 0)"; }
            : function (x, y) { return "sh_fetch(sh_tt, sh_to + ivec2(" + x + ", " + y + "))"; }, "vec4(0.0)");
  // (whole node: a neighbor's texel can fall outside the texture; it reads clear. Never in range otherwise.)
  if (!overlay) tex.unshift("vec4 sh_fetch(sampler2D sh_tt, ivec2 sh_p) {", "\tivec2 sh_s = textureSize(sh_tt, 0);",
    "\treturn sh_p.x < 0 || sh_p.y < 0 || sh_p.x >= sh_s.x || sh_p.y >= sh_s.y ? vec4(0.0) : texelFetch(sh_tt, sh_p, 0);", "}");
  return shaderHeader(def, shaderNameOf(name), "//").concat([
    "shader_type canvas_item;",
    "render_mode unshaded, blend_mix;",
    "",
  ], uni, [
    "const int FRAMES = " + def.frames + ";",
    "varying vec4 sh_modulate;" + (overlay ? "" : "\nvarying vec2 sh_local;"),
    "",
  ], shaderHelpers(T, u), shaderPalHelpers(def, u, Object.assign({}, T, {
    uni: function (k) { return k; }, cnt: function (k) { return k + "_count"; }, constInt: "const int",
    constArr: function (t, n, M, items) { return "const " + t + " " + n + "[" + M + "] = " + t + "[" + M + "](" + items.join(", ") + ");"; },
  }), prm), tex, [
    "",
    "void vertex() {",
    "\tsh_modulate = COLOR;" + (overlay ? "" : "\n\tsh_local = VERTEX;"),
    "}",
    "",
    "void fragment() {",
  ].concat(overlay ? [
    "\tivec2 sh_scr = textureSize(sh_screen, 0);",
    "\tivec2 sh_full = max(sh_scr / pixel, ivec2(1));",
    "\tivec2 sh_px = clamp(ivec2(floor(SCREEN_UV * vec2(sh_scr))) / pixel, ivec2(0), sh_full - 1);",
    "\tivec2 sh_size = sh_full;",
    "\tivec2 sh_o = ivec2(0);",
  ] : [
    "\tivec2 sh_full = textureSize(TEXTURE, 0);",
    "\tivec2 sh_px = clamp(ivec2(floor(UV * vec2(sh_full))), ivec2(0), sh_full - 1);",
    "\tbool sh_sheet = sheet_cell.x > 0 && sheet_cell.y > 0;",
    "\tivec2 sh_size = sh_sheet ? sheet_cell : sh_full;",
    "\tivec2 sh_o = sh_sheet ? sheet_origin + ((max(sh_px - sheet_origin, ivec2(0))) / sheet_cell) * sheet_cell : ivec2(0);",
    "\tif (whole_node && node_size.x > 0 && node_size.y > 0) {",
    "\t\t// the pixel's place on the node; reads stay on the texel being drawn (sh_o maps node offsets to the texture)",
    "\t\tivec2 sh_np = clamp(ivec2(floor(sh_local)), ivec2(0), node_size - 1);",
    "\t\tsh_size = node_size;",
    "\t\tsh_o = sh_px - sh_np;",
    "\t}",
  ], [
    "\tint sh_w = sh_size.x;",
    "\tint sh_h = sh_size.y;",
    "\tint sh_x = clamp(sh_px.x - sh_o.x, 0, sh_w - 1);",
    "\tint sh_y = clamp(sh_px.y - sh_o.y, 0, sh_h - 1);",
    "\tint sh_f = frame_override >= 0 ? sh_mod(frame_override, FRAMES) : sh_mod(int(floor(TIME * float(fps))), FRAMES);",
  ]), body.lines, [
    "\tCOLOR = " + body.out + (overlay ? ";" : " * sh_modulate;"),
    "}",
    "",
  ]).join("\n");
}

// WebGL2 / GLSL ES 3.00 fragment shader (the later CrunchyShader browser preview). Inputs: v_uv (0,0 the TOP-LEFT: flip
// in the vertex shader if your quad's uv starts at the bottom), u_tex (the padded sprite, NEAREST), u_time (seconds).
// A palette k is `uniform vec4 u_k[max]` (sRGB 0..1, set with uniform4fv) and `uniform int u_k_count`.
function shaderPrintGLSL(name, params) {
  const ir = shaderCompile(name), def = ir.def, P = shaderParamDefs(def), prm = shaderParams(def, params), u = shaderUses(ir);
  const uni = ["uniform sampler2D u_tex;", "uniform float u_time;", "uniform int u_frame_override; // -1: play by u_time"];
  Object.keys(P).forEach(function (k) {
    const d = P[k];
    if (d.type === "colour") uni.push("uniform vec4 u_" + k + "; // default " + prm[k]);
    else if (d.type === "palette") uni.push("uniform vec4 u_" + k + "[" + d.max + "]; // sRGB 0..1", "uniform int u_" + k + "_count; // -1: the palette printed below (" + prm[k].join(" ") + "); 0.." + d.max + ": u_" + k);
    else uni.push("uniform int u_" + k + "; // " + d.min + ".." + d.max + ", default " + prm[k]);
  });
  const body = shaderBody(ir, {
    type: { i: "int", b: "bool", c: "vec4" }, clear: "vec4(0.0)",
    uni: function (n) { return "u_" + n.v; },
    tex: function (x, y, m) { return "sh_tex" + (m || "") + "(sh_size, " + x + ", " + y + ")"; },
    sel: function (t, c, a, b) { return c + " ? " + a + " : " + b; },
  });
  const T = { u: "u", vec4: "vec4", ivec3: "ivec3" };
  const tex = shaderTexHelpers(u, function (n) { return "vec4 " + n + "(ivec2 sh_ts, int sh_tx, int sh_ty) {\n\tint sh_tw = sh_ts.x;\n\tint sh_th = sh_ts.y;"; },
    function (x, y) { return "texelFetch(u_tex, ivec2(" + x + ", " + y + "), 0)"; }, "vec4(0.0)");
  return ["#version 300 es"].concat(shaderHeader(def, shaderNameOf(name), "//"), [
    "precision highp float;",
    "precision highp int;",
    "in vec2 v_uv;",
    "out vec4 o_colour;",
  ], uni, [
    "const int FRAMES = " + def.frames + ";",
  ], shaderHelpers(T, u), shaderPalHelpers(def, u, Object.assign({}, T, {
    uni: function (k) { return "u_" + k; }, cnt: function (k) { return "u_" + k + "_count"; }, constInt: "const int",
    constArr: function (t, n, M, items) { return "const " + t + " " + n + "[" + M + "] = " + t + "[" + M + "](" + items.join(", ") + ");"; },
  }), prm), tex, [
    "void main() {",
    "\tivec2 sh_size = textureSize(u_tex, 0);",
    "\tint sh_w = sh_size.x;",
    "\tint sh_h = sh_size.y;",
    "\tint sh_x = clamp(int(floor(v_uv.x * float(sh_w))), 0, sh_w - 1);",
    "\tint sh_y = clamp(int(floor(v_uv.y * float(sh_h))), 0, sh_h - 1);",
    "\tint sh_f = u_frame_override >= 0 ? sh_mod(u_frame_override, FRAMES) : sh_mod(int(floor(u_time * float(u_fps))), FRAMES);",
  ], body.lines, [
    "\to_colour = " + body.out + ";",
    "}",
    "",
  ]).join("\n");
}

// Unity URP 2D: an unlit sprite shader for the 2D Renderer, built as URP's own Sprite-Unlit-Default is (one untagged
// pass on Core2D.hlsl: instancing, the SpriteRenderer's color and flip). The sprite's texture must be imported with sRGB (Color Texture) OFF, Filter Point, no mipmaps,
// Compression None, Mesh Type FULL RECT (a tight mesh cuts off the margin the effect draws in), and not packed into an
// atlas. Reads use Load (exact texels). Unity's texture rows run bottom-up, so y is turned to top-down here.
// Linear projects (Unity 6's default): material colors arrive linearized; the shader turns them back to sRGB, works on
// the sRGB bytes like every other target, and returns linear for the sRGB target to encode (decisions are exact by
// construction; the colors' float round trip came out exact too: tests/shader-unity.mjs). Gamma: no conversion at all.
// PALETTES: Unity materials cannot keep an array property, so a palette's colors are PRINTED into the shader (a static
// const of the params given) and `_KCount` is -1 (use them). A script may override at run time:
// material.SetVectorArray("_K", sRGB 0..1 vectors, padded to max; never linearized) and material.SetFloat("_KCount", n).
// (Godot and GLSL work the same way: see shaderPalHelpers.)
function shaderUnityProp(k) { return "_" + k.split("_").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(""); }
function shaderPrintUnity(name, params) {
  const ir = shaderCompile(name), def = ir.def, P = shaderParamDefs(def), prm = shaderParams(def, params), u = shaderUses(ir);
  const props = ["\t\t[PerRendererData] _MainTex (\"Sprite (padded, sRGB off, Full Rect)\", 2D) = \"white\" {}"];
  const cbuf = ["\tfloat4 _MainTex_TexelSize;"];
  const locals = [];
  Object.keys(P).forEach(function (k) {
    const d = P[k], U = shaderUnityProp(k), label = (d.label || k).replace(/"/g, "'");
    if (d.type === "colour") {
      const c = shaderHex(prm[k]).map(function (x) { return shaderGlslFloat(x / 255); });
      props.push("\t\t" + U + " (\"" + label + "\", Color) = (" + c.join(", ") + ", 1)");
      cbuf.push("\tfloat4 " + U + ";");
      locals.push("\tfloat4 sh_u_" + k + " = sh_colour(" + U + ");");
    } else if (d.type === "palette") {
      const UC = shaderUnityProp(k + "_count");
      props.push("\t\t[IntRange] " + UC + " (\"" + label + ": colors in use (-1 = the printed palette)\", Range(-1, " + d.max + ")) = -1");
      cbuf.push("\tfloat4 " + U + "[" + d.max + "];", "\tfloat " + UC + ";");
    } else {
      props.push("\t\t[IntRange] " + U + " (\"" + label + "\", Range(" + d.min + ", " + d.max + ")) = " + prm[k]);
      cbuf.push("\tfloat " + U + ";");
      locals.push("\tint sh_u_" + k + " = (int)round(" + U + ");");
    }
  });
  props.push("\t\t[IntRange] _FrameOverride (\"Frame override (-1 = play)\", Range(-1, " + (def.frames - 1) + ")) = -1");
  cbuf.push("\tfloat _FrameOverride;");
  const body = shaderBody(ir, {
    type: { i: "int", b: "bool", c: "float4" }, clear: "float4(0, 0, 0, 0)",
    uni: function (n) { return "sh_u_" + n.v; },
    tex: function (x, y, m) { return "sh_tex" + (m || "") + "(sh_w, sh_h, " + x + ", " + y + ")"; },
    sel: function (t, c, a, b) { return t === "c" ? "sh_selc(" + c + ", " + a + ", " + b + ")" : "(" + c + " ? " + a + " : " + b + ")"; },
  });
  const T = { u: "u", vec4: "float4", ivec3: "int3" };
  const pal = shaderPalHelpers(def, u, Object.assign({}, T, {
    uni: function (k) { return shaderUnityProp(k); }, cnt: function (k) { return "(int)round(" + shaderUnityProp(k + "_count") + ")"; }, constInt: "static const int",
    constArr: function (t, n, M, items) { return "static const " + t + " " + n + "[" + M + "] = { " + items.join(", ") + " };"; },
  }), prm);
  const tex = shaderTexHelpers(u, function (n) { return "float4 " + n + "(int sh_tw, int sh_th, int sh_tx, int sh_ty) {"; },
    function (x, y) { return "LOAD_TEXTURE2D(_MainTex, int2(" + x + ", sh_th - 1 - (" + y + ")))"; }, "float4(0, 0, 0, 0)");
  return shaderHeader(def, shaderNameOf(name), "//").concat([
    "Shader \"CrunchyShader/" + (def.group || "Effects") + "/" + shaderNameOf(name) + "\" {",
    "\tProperties {",
  ], props, [
    "\t}",
    "\tSubShader {",
    "\t\tTags { \"Queue\" = \"Transparent\" \"RenderType\" = \"Transparent\" \"RenderPipeline\" = \"UniversalPipeline\" \"IgnoreProjector\" = \"True\" \"PreviewType\" = \"Plane\" \"CanUseSpriteAtlas\" = \"False\" }",
    "\t\tBlend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha",
    "\t\tCull Off",
    "\t\tZWrite Off",
    "\t\tPass {",
    "\t\t\tHLSLPROGRAM",
    "#pragma target 3.5",
    "#pragma vertex sh_vert",
    "#pragma fragment sh_frag",
    "#pragma multi_compile_instancing",
    "#include \"Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Core2D.hlsl\"",
    "#include \"Packages/com.unity.render-pipelines.core/ShaderLibrary/Color.hlsl\"",
    "TEXTURE2D(_MainTex);",
    "CBUFFER_START(UnityPerMaterial)",
  ], cbuf, [
    "CBUFFER_END",
    "static const int FRAMES = " + def.frames + ";",
  ], [
    "struct sh_in_v { float3 positionOS : POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };",
    "struct sh_out_v { float4 positionCS : SV_POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };",
    "sh_out_v sh_vert(sh_in_v i) {",
    "\tUNITY_SETUP_INSTANCE_ID(i);",
    "\tSetUpSpriteInstanceProperties();",
    "\tsh_out_v o;",
    "\to.positionCS = TransformObjectToHClip(UnityFlipSprite(i.positionOS, unity_SpriteProps.xy));",
    "\to.color = i.color * unity_SpriteColor;",
    "\to.uv = i.uv;",
    "\treturn o;",
    "}",
  ], shaderHelpers(T, u), [
    "float4 sh_selc(bool sh_k, float4 sh_a, float4 sh_b) { if (sh_k) return sh_a; return sh_b; }",
    "float4 sh_colour(float4 sh_c) {",
    "#if defined(UNITY_COLORSPACE_GAMMA)",
    "\treturn sh_c;",
    "#else",
    "\treturn float4(LinearToSRGB(sh_c.rgb), sh_c.a);",
    "#endif",
    "}",
  ], pal, tex, [
    "half4 sh_frag(sh_out_v i) : SV_Target {",
    "\tint sh_w = (int)round(_MainTex_TexelSize.z);",
    "\tint sh_h = (int)round(_MainTex_TexelSize.w);",
    "\tint sh_x = clamp((int)floor(i.uv.x * sh_w), 0, sh_w - 1);",
    "\tint sh_y = clamp(sh_h - 1 - (int)floor(i.uv.y * sh_h), 0, sh_h - 1);",
  ], locals, [
    "\tint sh_fo = (int)round(_FrameOverride);",
    "\tint sh_f = sh_fo >= 0 ? sh_mod(sh_fo, FRAMES) : sh_mod((int)floor(_Time.y * sh_u_fps), FRAMES);",
  ], body.lines, [
    "\tfloat4 sh_c = " + body.out + ";",
    "#if !defined(UNITY_COLORSPACE_GAMMA)",
    "\tsh_c.rgb = SRGBToLinear(sh_c.rgb);",
    "#endif",
    "\treturn sh_c * i.color;",
    "}",
    "\t\t\tENDHLSL",
    "\t\t}",
    "\t}",
    "\tFallback Off",
    "}",
    "",
  ]).join("\n");
}

// Godot files for one effect on one sprite: base is the res:// folder they live in (e.g. "res://crunchy/items/sword/").
// The texture is the PADDED sprite (shaderPad); the baked frames are the app's to add (a strip + AnimatedSprite2D).
function shaderGodotValue(d, v) {
  if (d.type === "palette") return "PackedColorArray(" + shaderPalPadded(d, v).map(function (h) { return shaderHex(h).map(function (c) { return shaderGlslFloat(c / 255); }).join(", ") + ", 1"; }).join(", ") + ")";
  if (d.type !== "colour") return String(v);
  return "Color(" + shaderHex(v).map(function (c) { return shaderGlslFloat(c / 255); }).join(", ") + ", 1)";
}
function shaderGodotFiles(name, params, base, sprite) {
  const def = shaderDef(name), P = shaderParamDefs(def), prm = shaderParams(def, params), id = shaderNameOf(name);
  base = base || "res://"; sprite = sprite || "sprite.png";
  const sh = id + ".gdshader", mat = id + ".tres", scn = id + ".tscn";
  const rows = [];
  Object.keys(P).forEach(function (k) {
    rows.push("shader_parameter/" + k + " = " + shaderGodotValue(P[k], prm[k]));
    if (P[k].type === "palette") rows.push("shader_parameter/" + k + "_count = " + prm[k].length);
  });
  const tres = ["[gd_resource type=\"ShaderMaterial\" load_steps=2 format=3]", "",
    "[ext_resource type=\"Shader\" path=\"" + base + sh + "\" id=\"1\"]", "", "[resource]", "shader = ExtResource(\"1\")"]
    .concat(rows, [""]).join("\n");
  const tscn = ["[gd_scene load_steps=3 format=3]", "",
    "[ext_resource type=\"Texture2D\" path=\"" + base + sprite + "\" id=\"1\"]",
    "[ext_resource type=\"Material\" path=\"" + base + mat + "\" id=\"2\"]", "",
    "[node name=\"" + id + "\" type=\"Sprite2D\"]", "texture_filter = 1", "material = ExtResource(\"2\")", "texture = ExtResource(\"1\")", ""].join("\n");
  return [{ name: sh, data: shaderPrintGodot(name, params) }, { name: mat, data: tres }, { name: scn, data: tscn }];
}

// THE ONE-NODE SCREEN OVERLAY (build 41; AJ, testing in Godot, 2026-10-23: putting his game inside the screen scene's
// SubViewport was too much, and a CanvasGroup carrying the material drew flat blocks). <id>_overlay.tscn is a CanvasLayer
// (layer 100) holding one full-window ColorRect whose material reads the SCREEN under it (shaderPrintGodot's overlay):
// instance it in the main scene and the effect covers everything drawn below layer 100; UI on a higher CanvasLayer stays
// crisp above it. Nothing in the game moves. opts: pixel (window pixels per pixel the effect reads: 1 when the game
// renders at art size with Stretch Mode "viewport", the game's scale otherwise, / k for an upscale effect), layer, base.
// Proved pixel-exact against the interpreter in real Godot by tests/shader-godot-overlay.mjs.
function shaderGodotOverlayFiles(name, params, opts) {
  opts = opts || {};
  const def = shaderDef(name), P = shaderParamDefs(def), prm = shaderParams(def, params), id = shaderNameOf(name), base = opts.base || "res://";
  const pixel = Math.max(1, Math.floor(opts.pixel || 1)), layer = Math.floor(opts.layer || 100);
  const sh = id + "_overlay.gdshader", mat = id + "_overlay.tres", scn = id + "_overlay.tscn";
  const rows = [];
  Object.keys(P).forEach(function (k) {
    rows.push("shader_parameter/" + k + " = " + shaderGodotValue(P[k], prm[k]));
    if (P[k].type === "palette") rows.push("shader_parameter/" + k + "_count = " + prm[k].length);
  });
  rows.push("shader_parameter/pixel = " + pixel);
  const tres = ["[gd_resource type=\"ShaderMaterial\" load_steps=2 format=3]", "",
    "[ext_resource type=\"Shader\" path=\"" + base + sh + "\" id=\"1\"]", "", "[resource]", "shader = ExtResource(\"1\")"]
    .concat(rows, [""]).join("\n");
  const node = id.split(/[^a-z0-9]+/i).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("") + "Overlay";
  const tscn = ["[gd_scene load_steps=2 format=3]", "",
    "[ext_resource type=\"Material\" path=\"" + base + mat + "\" id=\"1\"]", "",
    "[node name=\"" + node + "\" type=\"CanvasLayer\"]", "layer = " + layer, "",
    "[node name=\"Effect\" type=\"ColorRect\" parent=\".\"]", "material = ExtResource(\"1\")",
    "anchors_preset = 15", "anchor_right = 1.0", "anchor_bottom = 1.0", "grow_horizontal = 2", "grow_vertical = 2", "mouse_filter = 2", ""].join("\n");
  return [{ name: sh, data: shaderPrintGodot(name, params, { overlay: true, pixel: pixel }) }, { name: mat, data: tres }, { name: scn, data: tscn }];
}

// Godot files for a SCREEN effect: the game drawn at ART resolution into a SubViewport, shown scaled by a whole number
// with the effect on it. opts: { w, h } the art size (required), zoom (a whole number, default 3), base (the res://
// folder the files live in, default "res://"), scene (the res:// path of the game's scene to instance inside; without
// it a placeholder Node2D "World" stands there for the person to replace).
// The scene: a Control (build 5: filling the window, so the picture sits CENTERED in any window, Godot's default 1152 x 648
// included, instead of in its top-left corner) holding a SubViewportContainer "Screen" (w·zoom x h·zoom, anchored at the
// center; stretch on, stretch_shrink = zoom, nearest, the ShaderMaterial) that holds the SubViewport "Game" (w x h, 2D only, nearest) that holds the game.
// A container, not a TextureRect over a free SubViewport, because only a container forwards INPUT to the game inside; it
// draws the viewport's texture with the material exactly as a TextureRect would (tests/shader-godot-screen.mjs).
// UPSCALE (crt, lcd, interlace: def.upscale names the param, k its value): when k > 1 an upscaling stage goes between:
// Screen (stretch_shrink = zoom / k, the material) → "Big" (a SubViewport, w·k x h·k) → "Art" (a SubViewportContainer,
// stretch_shrink = k, nearest: the game shown k times, exactly shaderUpscale) → Game (w x h) → the game. Input passes
// through both containers. zoom must be a MULTIPLE of k: anything else throws (rounding would change the window size
// behind the person's back). The stage is built for the k given here; a game that changes `scale` at run time must
// rebuild it (or export again).
// Make it the main scene (or instance it) and set the window to w·zoom x h·zoom (Project Settings → Display → Window),
// stretch mode "disabled" or "canvas_items" with an integer scale.
function shaderGodotScreenFiles(name, params, opts) {
  opts = opts || {};
  const id = shaderNameOf(name), base = opts.base || "res://", w = Math.floor(opts.w), h = Math.floor(opts.h);
  const zoom = Math.max(1, Math.floor(opts.zoom || 3)), k = shaderUpscaleOf(name, params);
  if (!(w >= 1 && h >= 1)) throw new Error("shader: shaderGodotScreenFiles needs opts.w and opts.h (the art size)");
  if (zoom % k !== 0) throw new Error("shader: " + id + " reads the art upscaled " + k + " times, so zoom must be a multiple of " + k + " (not " + zoom + "): try " + Math.max(k, Math.floor(zoom / k) * k) + " or " + (Math.floor(zoom / k) + 1) * k);
  const files = shaderGodotFiles(name, params, base, "unused.png").slice(0, 2);    // the .gdshader and the material .tres
  const scene = opts.scene ? String(opts.scene) : "";
  const game = k > 1 ? "Screen/Big/Art/Game" : "Screen/Game";
  const lines = ["[gd_scene load_steps=" + (scene ? 3 : 2) + " format=3]", "",
    "[ext_resource type=\"Material\" path=\"" + base + files[1].name + "\" id=\"1\"]"];
  if (scene) lines.push("[ext_resource type=\"PackedScene\" path=\"" + scene + "\" id=\"2\"]");
  const viewport = function (nm, parent, vw, vh) {
    return ["[node name=\"" + nm + "\" type=\"SubViewport\" parent=\"" + parent + "\"]", "disable_3d = true", "handle_input_locally = false",
      "canvas_item_default_texture_filter = 0", "size = Vector2i(" + vw + ", " + vh + ")", "render_target_update_mode = 4", ""];
  };
  lines.push("",
    "[node name=\"" + id + "_screen\" type=\"Control\"]",
    "layout_mode = 3",
    "anchors_preset = 15",
    "anchor_right = 1.0",
    "anchor_bottom = 1.0",
    "grow_horizontal = 2",
    "grow_vertical = 2",
    "mouse_filter = 2",
    "texture_filter = 1",
    "",
    "[node name=\"Screen\" type=\"SubViewportContainer\" parent=\".\"]",
    "texture_filter = 1",
    "material = ExtResource(\"1\")",
    "layout_mode = 1",
    "anchors_preset = 8",
    "anchor_left = 0.5",
    "anchor_top = 0.5",
    "anchor_right = 0.5",
    "anchor_bottom = 0.5",
    "offset_left = " + -Math.floor(w * zoom / 2) + ".0",
    "offset_top = " + -Math.floor(h * zoom / 2) + ".0",
    "offset_right = " + (w * zoom - Math.floor(w * zoom / 2)) + ".0",
    "offset_bottom = " + (h * zoom - Math.floor(h * zoom / 2)) + ".0",
    "grow_horizontal = 2",
    "grow_vertical = 2",
    "stretch = true",
    "stretch_shrink = " + zoom / k,
    "");
  if (k > 1) {
    Array.prototype.push.apply(lines, viewport("Big", "Screen", w * k, h * k));
    lines.push("[node name=\"Art\" type=\"SubViewportContainer\" parent=\"Screen/Big\"]",
      "texture_filter = 1",
      "offset_right = " + w * k + ".0",
      "offset_bottom = " + h * k + ".0",
      "stretch = true",
      "stretch_shrink = " + k,
      "");
    Array.prototype.push.apply(lines, viewport("Game", "Screen/Big/Art", w, h));
  } else Array.prototype.push.apply(lines, viewport("Game", "Screen", w, h));
  if (scene) lines.push("[node name=\"World\" parent=\"" + game + "\" instance=ExtResource(\"2\")]", "");
  else lines.push("[node name=\"World\" type=\"Node2D\" parent=\"" + game + "\"]", "");
  return files.concat([{ name: id + "_screen.tscn", data: lines.join("\n") }]);
}

// ---- the LIVE WebGL2 path (the app's preview on the GPU) -------------------------------------------------------------
// shaderPrintGLSL's program drawn by WebGL2 into a canvas the CALLER gives (an HTMLCanvasElement or an OffscreenCanvas):
// this file never reaches for the page itself, so it stays loadable anywhere. Exactness, as the other targets: the
// source is uploaded as straight-alpha RGBA8 (no premultiply, no color conversion), read with texelFetch, drawn with
// blending off into a context made with premultipliedAlpha: false, so readPixels gives back exactly what shaderRun
// computes (tests/shader-webgl.mjs proves it). A clear pixel may keep RGB under alpha 0 (it is invisible either way).
//   const r = shaderGL(canvas);                                  null when WebGL2 is unavailable (fall back to bakes)
//   shaderGLDraw(r, name, src, frame, params, { zoom: 3 });      src: a shaderImage, or a canvas / ImageBitmap / ImageData
//   shaderGLRead(r)                                              the canvas's pixels as a shaderImage (top-down rows)
//   shaderGLDispose(r)                                           frees the programs, texture and buffer
// frame: an int (shown via u_frame_override, so the loop wraps as everywhere), or null / -1 to play by opts.time
// (seconds). opts.zoom: a whole number >= 1; the canvas is resized to the source's size x zoom. opts.fresh: re-upload a
// shaderImage whose pixels changed in place (a new object, or any canvas source, is always uploaded).
const SHADER_GL_VERT = "#version 300 es\nin vec2 a_pos;\nout vec2 v_uv;\nvoid main() {\n\tv_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);\n\tgl_Position = vec4(a_pos, 0.0, 1.0);\n}\n";
function shaderGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: true, depth: false, stencil: false }); } catch (e) { gl = null; }
  if (!gl) return null;
  const vao = gl.createVertexArray(), vbo = gl.createBuffer(), tex = gl.createTexture();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);    // one triangle over the canvas
  gl.bindTexture(gl.TEXTURE_2D, tex);
  [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]
    .forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p[0], p[1]); });
  return { canvas: canvas, gl: gl, vao: vao, vbo: vbo, tex: tex, programs: new Map(), src: null, w: 0, h: 0 };
}
function shaderGLShader(gl, type, text) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, text);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error("shader: WebGL2 refused the shader: " + log); }
  return sh;
}
// the program for one effect (its GLSL printed with the default params; every draw sets every uniform), cached per
// definition. opts.glsl replaces the printed fragment source (the tests' negatives).
// THE PROGRAMS KEPT ARE BOUNDED (build 40): every effect looked at used to stay compiled for the page's life. With 479
// effects (and combos re-registered on every edit) browsing the strip grew without end, and the DOM suite, which walks
// them all, ran out of memory. The most recently used SHADER_GL_KEEP stay; the oldest is deleted from the GPU.
const SHADER_GL_KEEP = 32;
function shaderGLProgram(r, name, glsl) {
  const def = shaderDef(name), key = glsl ? "custom:" + glsl : def;
  if (r.programs.has(key)) { const hit = r.programs.get(key); r.programs.delete(key); r.programs.set(key, hit); return hit; }   // most recent last
  while (r.programs.size >= SHADER_GL_KEEP) {
    const oldest = r.programs.keys().next().value;
    r.gl.deleteProgram(r.programs.get(oldest).prog);
    r.programs.delete(oldest);
  }
  const gl = r.gl, prog = gl.createProgram();
  const vs = shaderGLShader(gl, gl.VERTEX_SHADER, SHADER_GL_VERT), fs = shaderGLShader(gl, gl.FRAGMENT_SHADER, glsl || shaderPrintGLSL(name));
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("shader: WebGL2 could not link: " + gl.getProgramInfoLog(prog));
  const loc = {};
  const P = { prog: prog, at: function (n) { if (!(n in loc)) loc[n] = gl.getUniformLocation(prog, n); return loc[n]; } };
  r.programs.set(key, P);
  return P;
}
function shaderGLDraw(r, name, src, frame, params, opts) {
  opts = opts || {};
  const gl = r.gl, def = shaderDef(name), P = shaderParamDefs(def), prm = shaderParams(def, params), prog = shaderGLProgram(r, name, opts.glsl);
  const zoom = Math.max(1, Math.floor(opts.zoom || 1));
  const image = !!(src && src.rgba), w = image ? src.w : src.width, h = image ? src.h : src.height;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, r.tex);
  if (src !== r.src || !image || opts.fresh) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.rgba);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    r.src = image ? src : null;
  }
  if (r.canvas.width !== w * zoom) r.canvas.width = w * zoom;
  if (r.canvas.height !== h * zoom) r.canvas.height = h * zoom;
  r.w = w; r.h = h;
  gl.viewport(0, 0, w * zoom, h * zoom);
  gl.useProgram(prog.prog);
  gl.uniform1i(prog.at("u_tex"), 0);
  const play = frame === null || frame === undefined || frame < 0;
  gl.uniform1i(prog.at("u_frame_override"), play ? -1 : Math.floor(frame));
  gl.uniform1f(prog.at("u_time"), play ? (opts.time || 0) : 0);
  Object.keys(P).forEach(function (k) {
    const d = P[k];
    if (d.type === "colour") { const c = shaderHex(prm[k]); gl.uniform4f(prog.at("u_" + k), c[0] / 255, c[1] / 255, c[2] / 255, 1); }
    else if (d.type === "palette") {
      const list = shaderPalPadded(d, prm[k]), arr = new Float32Array(d.max * 4);
      list.forEach(function (hx, i) { const c = shaderHex(hx); arr[i * 4] = c[0] / 255; arr[i * 4 + 1] = c[1] / 255; arr[i * 4 + 2] = c[2] / 255; arr[i * 4 + 3] = 1; });
      gl.uniform4fv(prog.at("u_" + k + "[0]"), arr);
      gl.uniform1i(prog.at("u_" + k + "_count"), opts.printed ? -1 : prm[k].length);   // printed: the palette in the source
    } else gl.uniform1i(prog.at("u_" + k), prm[k]);
  });
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindVertexArray(r.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, r.vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return r;
}
function shaderGLRead(r) {
  const gl = r.gl, W = r.canvas.width, H = r.canvas.height, raw = new Uint8Array(W * H * 4), out = shaderImage(W, H);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  for (let y = 0; y < H; y++) out.rgba.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // GL rows run bottom-up
  return out;
}
function shaderGLDispose(r) {
  const gl = r.gl;
  r.programs.forEach(function (p) { gl.deleteProgram(p.prog); });
  r.programs.clear();
  gl.deleteTexture(r.tex); gl.deleteBuffer(r.vbo); gl.deleteVertexArray(r.vao);
}

// ---- THE EFFECTS -------------------------------------------------------------------------------------------------------
// APPEND ONLY (an item definition or a share link names them).
const SHADER_EFFECTS = ["shimmer", "sparkle", "flame", "glow", "crackle", "bob"];
const SHADER_DEFS = {};

// the four-way neighbors, and a disc of offsets (dx² + dy² <= r2), for outline-reading effects
function shaderDisc(r2, rmin2) {
  const out = [], R = Math.ceil(Math.sqrt(r2));
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = dx * dx + dy * dy;
    if (d > 0 && d <= r2 && d > (rmin2 || 0)) out.push([dx, dy]);
  }
  return out;
}
function shaderNear(S, offsets) { return S.or.apply(null, offsets.map(function (o) { return S.solid(S.tex(o[0], o[1])); })); }
// a triangle wave over the loop: 0 at frame 0, `top` at mid-loop, back to 0 (integer, rounded)
function shaderTri(S, top) {
  const F = S.FRAMES, tri = S.min(S.frame, S.sub(F, S.frame));
  return S.div(S.add(S.mul(S.mul(tri, 2), top), Math.floor(F / 2)), F);
}

// SHIMMER: a band of light sweeps once across the item, then rests. The outline (darker than `outline`) is left alone.
SHADER_DEFS.shimmer = {
  label: "Shimmer", title: "a band of light sweeps across the item, then rests",
  group: "Items", frames: 32, fps: 16, pad: [0, 0, 0, 0], still0: true,
  params: {
    width: { type: "int", min: 1, max: 6, def: 2, label: "Band width" },
    dir: { type: "int", min: 0, max: 4, def: 0, label: "Direction", choices: ["diagonal", "across", "up-diagonal", "down", "up"] },
    outline: { type: "int", min: 0, max: 255, def: 48, label: "Leave pixels darker than" },
    glint: { type: "colour", def: "#ffffff", label: "Band core" },
    bright: { type: "colour", def: "#fff6c8", label: "Band edge" },
    sweep: { type: "int", min: 6, max: 32, def: 20, label: "The sweep takes (frames of the 32-frame loop; the rest it rests)" },
    bands: { type: "int", min: 1, max: 3, def: 1, label: "Bands, one after another" },
  },
  fragment: function (S) {
    // build 7: `sweep` frames to cross (20 as before; 32 never rests), `bands` bands trailing one another (each band's
    // width + 3 apart; the sweep travels that much further so the last one crosses too), dir "down" / "up"
    const TRAVEL = S.p("sweep"), c = S.tex(0, 0), w = S.p("width"), dir = S.p("dir");
    const d = S.pick([[S.eq(dir, 1), S.mul(S.x, 2)], [S.eq(dir, 2), S.add(S.x, S.sub(S.sub(S.h, 1), S.y))],
      [S.eq(dir, 3), S.mul(S.y, 2)], [S.eq(dir, 4), S.mul(S.sub(S.sub(S.h, 1), S.y), 2)]], S.add(S.x, S.y));
    const gapP = S.add(w, 4), nb = S.sub(S.p("bands"), 1);
    const span = S.add(S.add(S.add(S.w, S.h), S.add(w, 1)), S.mul(nb, gapP));
    const pos = S.sub(S.div(S.mul(S.frame, span), S.sub(TRAVEL, 1)), S.add(w, 1));
    const rel0 = S.sub(d, pos);
    // the band this pixel is in (0 the lead band): rel = rel0 + k (w + 4) in 0..w for some k < bands; kk is the k whose
    // band starts at or before this pixel (beyond the last band rel stays below 0: off)
    const kk = S.sel(S.lt(rel0, 0), S.add(S.div(S.sub(S.neg(rel0), 1), gapP), 1), 0);
    const rel = S.add(rel0, S.mul(S.min(kk, nb), gapP));
    const on = S.and(S.lt(S.frame, TRAVEL), S.solid(c), S.ge(S.luma(c), S.p("outline")), S.ge(rel, 0), S.le(rel, w));
    const edge = S.or(S.eq(rel, 0), S.eq(rel, w));
    return S.sel(on, S.sel(edge, S.p("bright"), S.p("glint")), c);
  },
};

// SPARKLE: four-point glints twinkle on the item's bright pixels, each at its own moment in the loop (never at frame 0).
SHADER_DEFS.sparkle = {
  label: "Sparkle", title: "four-point glints twinkle on the item's bright pixels",
  group: "Items", frames: 24, fps: 12, pad: [2, 2, 2, 2], still0: true,
  params: {
    rarity: { type: "int", min: 2, max: 64, def: 9, label: "One glint per this many bright pixels" },
    threshold: { type: "int", min: 0, max: 255, def: 140, label: "Bright from (brightness 0 to 255)" },
    seed: { type: "int", min: 0, max: 999, def: 7, label: "Seed" },
    glint: { type: "colour", def: "#ffffff", label: "Glint" },
    bright: { type: "colour", def: "#fff6c8", label: "Glint rays" },
    shape: { type: "int", min: 0, max: 2, def: 0, label: "Glint shape", choices: ["four-point star", "eight-point star", "diagonal cross"] },
    life: { type: "int", min: 3, max: 9, def: 5, label: "A glint lasts (frames)" },
  },
  fragment: function (S) {
    // build 7: `life` frames per glint (5 as before: rays on stages 1 .. life-2, the peak at life / 2); shape "eight-point"
    // adds short diagonal rays at the peak, "diagonal cross" turns the star 45 degrees
    const LIFE = S.p("life"), PEAK = S.div(LIFE, 2), F = S.FRAMES, seed = S.p("seed"), sh = S.p("shape"), X = S.eq(sh, 2);
    // the glint centered at offset (ox, oy) from this pixel: its stage this frame, -1 when there is none
    const stage = function (ox, oy) {
      const q = S.tex(ox, oy), qx = S.add(S.x, ox), qy = S.add(S.y, oy);
      const site = S.and(S.solid(q), S.ge(S.luma(q), S.p("threshold")), S.eq(S.mod(S.hash(qx, qy, seed), S.p("rarity")), 0));
      const start = S.add(1, S.mod(S.hash(qx, qy, S.add(seed, 101)), S.sub(F, LIFE)));
      const t = S.sub(S.frame, start);
      return S.sel(S.and(site, S.ge(t, 0), S.lt(t, LIFE)), t, -1);
    };
    const mid = function (t) { return S.and(S.ge(t, 1), S.le(t, S.sub(LIFE, 2))); };   // the middle stages show the rays
    const peak = function (t) { return S.eq(t, PEAK); };
    const any = function (ts, f) { return S.or.apply(null, ts.map(f)); };
    const arms = function (offs) { return offs.map(function (o) { return stage(-o[0], -o[1]); }); };
    const t0 = stage(0, 0);
    const arm1 = arms([[1, 0], [-1, 0], [0, 1], [0, -1]]), arm2 = arms([[2, 0], [-2, 0], [0, 2], [0, -2]]);
    const dia1 = arms([[1, 1], [-1, 1], [1, -1], [-1, -1]]), dia2 = arms([[2, 2], [-2, 2], [2, -2], [-2, -2]]);
    const peak1 = S.sel(X, any(dia1, peak), any(arm1, peak));
    const ray1 = S.sel(X, any(dia1, mid), any(arm1, mid));
    const ray2 = S.sel(X, any(dia2, peak), any(arm2, peak));
    return S.pick([
      [mid(t0), S.p("glint")],
      [S.ge(t0, 0), S.p("bright")],
      [peak1, S.p("glint")],
      [ray1, S.p("bright")],
      [ray2, S.p("bright")],
      [S.and(S.eq(sh, 1), any(dia1, peak)), S.p("bright")],
    ], S.tex(0, 0));
  },
};

// FLAME: flames lick up from the item's top edges into the transparent margin above it (value noise scrolling upward).
SHADER_DEFS.flame = {
  label: "Flame", title: "flames lick up from the item's top edges",
  group: "Items", frames: 12, fps: 12, pad: [8, 0, 0, 0],
  params: {
    height: { type: "int", min: 1, max: 8, def: 6, label: "Flame height" },
    seed: { type: "int", min: 0, max: 999, def: 3, label: "Seed" },
    glint: { type: "colour", def: "#fff6c8", label: "Core" },
    bright: { type: "colour", def: "#ffd03a", label: "Flame" },
    mid: { type: "colour", def: "#ff8a1e", label: "Flame edge" },
    deep: { type: "colour", def: "#d8401a", label: "Tips" },
  },
  fragment: function (S) {
    const MAX = 8, CW = 3, CH = 3, P = S.FRAMES;                           // P (the noise's vertical period) divides by CH
    const h = S.p("height"), seed = S.p("seed");
    let k = S.i(99);                                                         // the nearest solid pixel straight below, 1..MAX
    for (let d = MAX; d >= 1; d--) k = S.sel(S.solid(S.tex(0, d)), d, k);
    const yy = S.mod(S.add(S.y, S.frame), P);
    const ix = S.div(S.x, CW), fx = S.mod(S.x, CW), iy = S.div(yy, CH), fy = S.mod(yy, CH);
    const iy1 = S.mod(S.add(iy, 1), P / CH);
    const val = function (cx, cy) { return S.mod(S.hash(cx, cy, seed), 256); };
    const top = S.add(S.mul(val(ix, iy), S.sub(CW, fx)), S.mul(val(S.add(ix, 1), iy), fx));
    const bot = S.add(S.mul(val(ix, iy1), S.sub(CW, fx)), S.mul(val(S.add(ix, 1), iy1), fx));
    const n = S.div(S.add(S.mul(top, S.sub(CH, fy)), S.mul(bot, fy)), CW * CH);
    const thr = S.div(S.mul(k, 256), S.add(h, 1));
    const m = S.sub(n, thr);
    const fire = S.and(S.not(S.solid(S.tex(0, 0))), S.le(k, h), S.ge(m, 0));
    return S.sel(fire, S.pick([[S.ge(m, 110), S.p("glint")], [S.ge(m, 55), S.p("bright")], [S.ge(m, 18), S.p("mid")]], S.p("deep")), S.tex(0, 0));
  },
};

// GLOW: a halo round the item's outline that breathes in and out (rings 1..radius, the outer half-steps dithered).
SHADER_DEFS.glow = {
  label: "Glow", title: "a pulsing halo round the item's outline",
  group: "Items", frames: 16, fps: 10, pad: [3, 3, 3, 3],
  params: {
    radius: { type: "int", min: 1, max: 3, def: 3, label: "Halo reach" },
    pulse: { type: "int", min: 0, max: 2, def: 0, label: "Pulse", choices: ["breathes", "steady", "flickers"] },
    shape: { type: "int", min: 0, max: 1, def: 0, label: "Halo shape", choices: ["round", "square"] },
    glint: { type: "colour", def: "#ffffff", label: "Peak" },
    bright: { type: "colour", def: "#fff6c8", label: "Inner ring" },
    mid: { type: "colour", def: "#ffe07a", label: "Middle ring" },
    deep: { type: "colour", def: "#e2a630", label: "Outer ring" },
  },
  fragment: function (S) {
    // build 7: pulse "steady" holds the full halo, "flickers" picks a hashed level each frame, as a torch's light; shape
    // "square" reads square rings (the 8 neighbors, then 5 x 5 and 7 x 7 boxes) for a blockier, more digital halo
    const c = S.tex(0, 0), r = S.p("radius"), sq = S.eq(S.p("shape"), 1), pu = S.p("pulse");
    const r1 = S.sel(sq, shaderNear(S, shaderDisc(2)), shaderNear(S, [[1, 0], [-1, 0], [0, 1], [0, -1]]));
    const r2 = S.sel(sq, shaderNear(S, shaderDisc(8)), shaderNear(S, shaderDisc(5)));
    const r3 = S.sel(sq, shaderNear(S, shaderDisc(18)), shaderNear(S, shaderDisc(10)));
    const top = S.sub(S.mul(r, 2), 1);
    const level = S.pick([[S.eq(pu, 1), top], [S.eq(pu, 2), S.add(1, S.mod(S.hash(S.frame, 23, 5), top))]],
      S.add(1, shaderTri(S, S.sub(S.mul(r, 2), 2))));             // 1 .. 2r-1 and back
    const check = S.eq(S.mod(S.add(S.x, S.y), 2), 0);
    const show = function (full) { return S.or(S.ge(level, full), S.and(S.eq(level, full - 1), check)); };
    return S.sel(S.solid(c), c, S.pick([
      [r1, S.sel(S.ge(level, S.sub(S.mul(r, 2), 1)), S.p("glint"), S.p("bright"))],
      [S.and(r2, show(3)), S.p("mid")],
      [S.and(r3, show(5)), S.p("deep")],
    ], c));
  },
};

// CRACKLE: electric sparks jump along the item's outline, a few cells at a time, with a quiet beat.
SHADER_DEFS.crackle = {
  label: "Crackle", title: "electric sparks jump along the item's outline",
  group: "Items", frames: 12, fps: 15, pad: [2, 2, 2, 2],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 35, label: "Sparks (%)" },
    seed: { type: "int", min: 0, max: 999, def: 5, label: "Seed" },
    glint: { type: "colour", def: "#ffffff", label: "Spark" },
    bright: { type: "colour", def: "#fffa9a", label: "Spark glow" },
    deep: { type: "colour", def: "#4a8cff", label: "Arc" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), seed = S.p("seed");
    const quiet = S.eq(S.mod(S.hash(S.frame, seed, 31), 4), 0);
    const cell = S.lt(S.mod(S.hash(S.div(S.x, 3), S.div(S.y, 3), S.add(S.mul(S.frame, 7), seed)), 100), S.p("amount"));
    const px = S.hash(S.x, S.y, S.add(S.mul(S.frame, 13), seed));
    const r1 = shaderNear(S, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const r2 = shaderNear(S, shaderDisc(4));
    const lit = S.and(S.not(quiet), cell, S.not(S.solid(c)));
    return S.pick([
      [S.and(lit, r1), S.sel(S.eq(S.mod(px, 3), 0), S.p("glint"), S.p("bright"))],
      [S.and(lit, r2, S.eq(S.mod(px, 3), 1)), S.p("deep")],
    ], c);
  },
};

// BOB: the item floats up and down (a pickup waiting on the ground). Moves the whole picture, whole pixels only.
SHADER_DEFS.bob = {
  label: "Bob", title: "the item floats gently up and down",
  group: "Items", frames: 16, fps: 8, pad: [2, 0, 0, 0], still0: true,
  params: {
    height: { type: "int", min: 1, max: 2, def: 2, label: "Rise (px)" },
  },
  fragment: function (S) { return S.tex(0, shaderTri(S, S.p("height"))); },
};

// ======================================================================================================================
// ERAS AND DISPLAY (CrunchyShader round 1, 2026-10-14: written by a roster agent in wip/shader-eras.js, merged by Grout)
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1, group "Eras and display" (SHADER.md §2.6). Loaded after shader.js (and era.js,
// which the tests and the app load first). Grout merges this into shader.js; until then it is the roster agent's file.
//
// ERAS: one effect per era.js color era, with era.js's OWN names, in ERAS' order (super, mega, pocket, virtual, 8-bit,
// 1-bit; "32-bit" is the art as drawn, so it has no effect). The bar: a shader era and era.js make THE SAME COLORS.
// tests/shader-eras.test.mjs proves it against eraColor / eraFinish (exhaustive over all 16.7M colors where it is cheap).
//   super, mega   eraSnap5 / eraSnap(v, 8) in integers (SHADER.md §2.7). EXACT on all 256 channel values.
//   8-bit         S.nearest(c, SHADER_ERA_NES (= ERA_NES), "redmean") = eraNes, then eraBlocks' 2 x 2 merge. EXACT.
//   pocket        the nearest of four greens by brightness, then the blocks. Brightness is the integer luma x 1000
//                 (299 r + 587 g + 114 b), which orders like era.js's float luma EXCEPT on the 282 colors that sit exactly
//                 between two greens: there era.js's float rounding picks a side (126 the lighter, 156 the darker, by the
//                 rounding of 0.299 r + 0.587 g + 0.114 b, not by any rule). The shader takes the darker (the first, as
//                 era.js's strict < would without the rounding). 126 of 16,777,216 colors differ by one shade.
//   virtual       Pocket's shade drawn in red (eraVirtual), a red kept as it is; then the blocks. The same 126 colors.
//   1-bit         black and white by era.js's CRISP dither (eraDither1(buf, pal, true), the sprite rule): each pixel's
//                 brightness as drawn against a 4 x 4 Bayer cell. EXACT on all 16.7M colors x 16 cells: the integer form
//                 16 Y + 153000 b > 3264000 agrees with era.js's floats everywhere except three exact ties where float
//                 rounding tips the sum over 0.5; those three (color, cell) pairs are written in as exceptions.
//                 NOT the Tile export's SPREAD dither (eraRankLuma): that stretches brightness over the DESIGN's palette
//                 (its darkest, lightest and rank), which a screen shader cannot know; a game screen has no one design.
// THE BLOCKS (8-bit, pocket, virtual): eraBlocks' rule exactly: each 2 x 2 block becomes its most common color, a tie
// to the darker (by the ERA color's brightness), transparency losing a tie, the first seen winning an exact tie. Two
// honest differences: (1) era.js counts palette INDICES, the shader counts COLORS, so they agree whenever no two of the
// design's indices share a color (the usual case); (2) era.js's grid starts at every tile's / frame's corner, so a block
// never straddles a tile edge. A screen shader sees no tiles: its grid starts at the screen's corner, shifted by
// `gridx` / `gridy` (set them to the camera's position mod 2 and the blocks stay on the world's even pixels, which is
// where every tile starts: the same blocks as the export). 1-bit's dither phase works the same way (mod 4).
// `blocks` 1 turns the merge off (the era's colors only). On a SPRITE the block eras take a 2 px pad: a block of two
// solid and two clear pixels comes out solid (transparency loses a tie), so a silhouette can grow one pixel, as era.js's
// does; the pad is even, so the grid stays on the sprite's corner. (An odd-sized sprite's last partial block then also
// counts pad pixels, which era.js would not: give the shader even-sized sprites, as every Crunchy app draws them.)
// items.js palettes repeat colors (a material's ramp for two parts): there difference (1) shows, e.g. 4 px on a key.
//
// DISPLAY: crt (scanlines, aperture grille or slot mask, curvature, vignette, bloom), lcd (a handheld's pixel grid, a
// static smear for ghosting, a panel tint), interlace (fields alternating), posterize (levels per channel, optional
// ordered dither). A screen effect runs at ART resolution: one texel per art pixel. CRT, LCD and interlace take `scale`:
// the texture they read is the art upscaled `scale` times (nearest), so a scanline or a grid line can be thinner than an
// art pixel. In Godot: the game's SubViewport at art size, shown upscaled by `scale` in a second SubViewport of art x
// scale (a TextureRect, nearest, stretch 1:1 after scaling), whose texture the effect's TextureRect shows 1:1. At scale 1
// they draw on whole art pixels (every other ART row a scanline: era.js's own CRT does exactly that, one ramp step down).

// the integer luma x 1000: 299 r + 587 g + 114 b (0..255000); era.js's float luma x 1000, in the same order
function shaderErasY(S, c) { return S.add(S.add(S.mul(S.r(c), 299), S.mul(S.g(c), 587)), S.mul(S.b(c), 114)); }
// the index of the shade whose brightness (lumas: int nodes) is nearest Y; the first wins a tie (strict <)
function shaderErasShade(S, Y, lumas) {
  let best = S.i(0), bd = S.abs(S.sub(lumas[0], Y));
  for (let i = 1; i < lumas.length; i++) {
    const d = S.abs(S.sub(lumas[i], Y)), better = S.lt(d, bd);
    best = S.sel(better, i, best); bd = S.sel(better, d, bd);
  }
  return best;
}
// era.js's pocket greens' brightness, as constants (Virtual's shades are always measured against these, as eraVirtual is)
// era.js's constants, COPIED so shader.js needs nothing at load time (core files are self-contained, as textures.js):
// an app that loads shader.js before era.js (or without it) still gets the real palettes. tests/shader.test.mjs asserts
// each equals era.js's (ERA_NES, ERA_POCKET, ERA_VIRTUAL, ERA_1BIT, ERA_BAYER4), so they can't drift.
const SHADER_ERA_NES = [
  "#535353", "#410426", "#3f0a05", "#331400", "#1f2000", "#0c2b00", "#003000", "#002e0a", "#00262e", "#021b51",
  "#100f66", "#240763", "#36034b", "#000000", "#a0a0a0", "#85245c", "#832e24", "#6f3f01", "#515300", "#326300",
  "#1a6b05", "#0f692f", "#105d68", "#1f4a9e", "#3937bd", "#5929b9", "#752295", "#ffffff", "#e170b3", "#de7d71",
  "#c9913e", "#a6a826", "#81bb28", "#64c447", "#55c17d", "#57b3c0", "#6a9efc", "#8988ff", "#af76ff", "#cf6ef2",
  "#3c3c3c", "#f2c2df", "#f1c7c2", "#e8d0aa", "#dada9e", "#c9e29f", "#bce6ae", "#b5e5c8", "#b6dfe5", "#bfd6fe",
  "#cdccff", "#ddc4ff", "#ebc0fa", "#a9a9a9"];
const SHADER_ERA_POCKET = ["#1d2b1c", "#3e6a3c", "#8aa84e", "#c8d88e"];
const SHADER_ERA_VIRTUAL = ["#000000", "#55000a", "#a3000f", "#ff2234"];
const SHADER_ERA_1BIT = ["#16121c", "#f4f1ea"];
const SHADER_ERA_BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const shaderErasPocketY = SHADER_ERA_POCKET.map(function (h) {
  const c = shaderHex(h); return 299 * c[0] + 587 * c[1] + 114 * c[2];
});
const shaderErasBayer4 = SHADER_ERA_BAYER4;

// eraBlocks on a screen: `map` turns a texel into its era color (opaque). Reads the 2 x 2 block (grid shifted by
// gridx / gridy), counts colors, picks as eraBlocks does, returns the winner's era color (or clear). blocks 1: off.
function shaderErasBlocks(S, map) {
  const gx = S.p("gridx"), gy = S.p("gridy");
  const bx = S.sub(S.x, S.mod(S.add(S.x, gx), 2)), by = S.sub(S.y, S.mod(S.add(S.y, gy), 2));
  const cell = [];
  for (let k = 0; k < 4; k++) {
    const cx = S.add(bx, k & 1), cy = S.add(by, k >> 1), o = S.texAt(cx, cy), sol = S.solid(o), m = map(o, cx, cy);
    cell.push({
      o: o, sol: sol, m: m, valid: S.and(S.ge(cx, 0), S.lt(cx, S.w), S.ge(cy, 0), S.lt(cy, S.h)),
      L: S.sel(sol, shaderErasY(S, m), 1000000),                         // transparency: "Infinity", it loses a tie
    });
  }
  const same = {};
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = cell[i], b = cell[j];
    same[i + "," + j] = same[j + "," + i] = S.sel(a.sol, S.and(b.sol, S.eq(S.r(a.o), S.r(b.o)), S.eq(S.g(a.o), S.g(b.o)), S.eq(S.b(a.o), S.b(b.o))), S.not(b.sol));
  }
  let bestN = S.i(-1), bestL = S.i(0), bestC = S.clear;
  for (let k = 0; k < 4; k++) {
    let n = S.i(1);                                                       // itself (only read when it is valid)
    for (let j = 0; j < 4; j++) if (j !== k) n = S.add(n, S.sel(S.and(cell[j].valid, same[k + "," + j]), 1, 0));
    const c = cell[k], better = S.and(c.valid, S.or(S.gt(n, bestN), S.and(S.eq(n, bestN), S.lt(c.L, bestL))));
    bestN = S.sel(better, n, bestN); bestL = S.sel(better, c.L, bestL); bestC = S.sel(better, S.sel(c.sol, c.m, S.clear), bestC);
  }
  const own = S.add(S.sub(S.x, bx), S.mul(S.sub(S.y, by), 2));
  const plain = S.pick([0, 1, 2].map(function (k) { return [S.eq(own, k), S.sel(cell[k].sol, cell[k].m, S.clear)]; }), S.sel(cell[3].sol, cell[3].m, S.clear));
  return S.sel(S.eq(S.p("blocks"), 1), plain, bestC);
}
const shaderErasBlockParams = {
  blocks: { type: "int", min: 1, max: 2, def: 2, label: "Pixel blocks (2: every 2 x 2 merged, as the suite's eras; 1: off)" },
  gridx: { type: "int", min: 0, max: 1, def: 0, label: "Block grid x (the camera's x mod 2)" },
  gridy: { type: "int", min: 0, max: 1, def: 0, label: "Block grid y (the camera's y mod 2)" },
};
function shaderErasWith(extra) { const out = {}; Object.keys(extra).forEach(function (k) { out[k] = extra[k]; }); Object.keys(shaderErasBlockParams).forEach(function (k) { out[k] = shaderErasBlockParams[k]; }); return out; }
// a color to percent of itself (ints; channels clamp in S.rgba)
function shaderErasScale(S, c, pct) {
  return S.rgba(S.div(S.mul(S.r(c), pct), 100), S.div(S.mul(S.g(c), pct), 100), S.div(S.mul(S.b(c), pct), 100), 255);
}

// THE DITHER PATTERNS (build 7): a 0..15 threshold at (x, y) by `pat` (an int node): 0 the 4 x 4 Bayer (era.js's), 1
// clustered dots (a halftone's growth order), 2 lines (rows fill before columns: a scanline-ish dither), 3 noise (a hash
// of the position). Pattern 0 is the Bayer table lookup exactly as before, so a default draws as it did.
const SHADER_DITHER_NAMES = ["Bayer 4 x 4", "clustered dots", "lines", "noise"];
const SHADER_DITHER_CLUSTER = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14];
const SHADER_DITHER_LINES = [0, 2, 1, 3, 8, 10, 9, 11, 4, 6, 5, 7, 12, 14, 13, 15];
function shaderDither16(S, pat, x, y) {
  const i = S.add(S.mul(S.mod(y, 4), 4), S.mod(x, 4));
  return S.pick([
    [S.eq(pat, 1), S.table(SHADER_DITHER_CLUSTER, i)],
    [S.eq(pat, 2), S.table(SHADER_DITHER_LINES, i)],
    [S.eq(pat, 3), S.mod(S.hash(x, y, 1777), 16)],
  ], S.table(SHADER_ERA_BAYER4, i));
}
// a shade era's ordered dither (pocket, virtual; build 7): Y (luma x 1000) nudged by up to half a shade step either way
// through the pattern `dither` names (0 none: Y exactly as it was). The dither cell is the BLOCK when blocks are on, so
// the dither is drawn in the era's own 2 x 2 pixels; it follows gridx / gridy as the blocks do.
const shaderErasDitherParam = { type: "int", min: 0, max: 4, def: 0, label: "Dither between shades", choices: ["none"].concat(SHADER_DITHER_NAMES) };
function shaderErasDither(S, Y, steps, cx, cy) {
  const B = S.p("blocks"), d = S.p("dither");
  const t = shaderDither16(S, S.sub(d, 1), S.div(S.add(cx, S.p("gridx")), B), S.div(S.add(cy, S.p("gridy")), B));
  return S.sel(S.eq(d, 0), Y, S.add(Y, S.div(S.mul(S.sub(S.mul(t, 2), 15), 255000), S.mul(32, steps))));
}

SHADER_EFFECTS.push("super", "mega", "pocket", "virtual", "8-bit", "1-bit", "crt", "lcd", "interlace", "posterize");

// SUPER: era.js's eraSnap5. q = round(31 v / 255) = floor((62 v + 255) / 510) (never a tie), then (q << 3) | (q >> 2).
SHADER_DEFS.super = {
  label: "Super", title: "16-bit, Super style: every channel snapped to a 15-bit console's 32 levels (the Crunchy suite's Super era, exactly)",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {},
  fragment: function (S) {
    const c = S.tex(0, 0);
    const snap = function (v) { const q = S.div(S.add(S.mul(v, 62), 255), 510); return S.add(S.mul(q, 8), S.div(q, 4)); };
    return S.sel(S.solid(c), S.rgba(snap(S.r(c)), snap(S.g(c)), snap(S.b(c)), 255), S.clear);
  },
};

// MEGA: era.js's eraSnap(v, 8). q = floor((14 v + 255) / 510), out = floor((510 q + 7) / 14) (neither is ever a tie).
SHADER_DEFS.mega = {
  label: "Mega", title: "16-bit, Mega style: every channel snapped to 8 levels, 512 colors (the Crunchy suite's Mega era, exactly)",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {},
  fragment: function (S) {
    const c = S.tex(0, 0);
    const snap = function (v) { const q = S.div(S.add(S.mul(v, 14), 255), 510); return S.div(S.add(S.mul(q, 510), 7), 14); };
    return S.sel(S.solid(c), S.rgba(snap(S.r(c)), snap(S.g(c)), snap(S.b(c)), 255), S.clear);
  },
};

// POCKET: four greens by brightness (the shades' own lumas, so a changed palette is measured by its own colors), then
// the 2 x 2 blocks.
SHADER_DEFS.pocket = {
  label: "Pocket", title: "a handheld's four greens by brightness, every 2 x 2 block merged, like a Game Boy (the Crunchy suite's Pocket era)",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [2, 2, 2, 2],
  params: shaderErasWith({ greens: { type: "palette", def: SHADER_ERA_POCKET.slice(), max: 8, label: "Shades (dark to light)" }, dither: shaderErasDitherParam }),
  fragment: function (S) {
    const lumas = [], steps = S.sub(S.palCount("greens"), 1);
    for (let i = 0; i < 8; i++) lumas.push(shaderErasY(S, S.palAt("greens", i)));   // past the count: the last again, never nearer
    return shaderErasBlocks(S, function (c, cx, cy) { return S.palAt("greens", shaderErasShade(S, shaderErasDither(S, shaderErasY(S, c), steps, cx, cy), lumas)); });
  },
};

// VIRTUAL: red on black. A red of the palette stays; any other color takes Pocket's shade (measured against era.js's
// greens, as eraVirtual does) drawn in red. Then the blocks.
SHADER_DEFS.virtual = {
  label: "Virtual", title: "red on black, four shades by brightness, every 2 x 2 block merged (the Crunchy suite's Virtual era)",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [2, 2, 2, 2],
  params: shaderErasWith({ reds: { type: "palette", def: SHADER_ERA_VIRTUAL.slice(), max: 4, label: "Shades (dark to light)" }, dither: shaderErasDitherParam }),
  fragment: function (S) {
    const lumas = shaderErasPocketY.map(function (v) { return S.i(v); });
    return shaderErasBlocks(S, function (c, cx, cy) {
      return S.sel(S.ge(S.palIndex(c, "reds"), 0), c, S.palAt("reds", shaderErasShade(S, shaderErasDither(S, shaderErasY(S, c), 3, cx, cy), lumas)));
    });
  },
};

// 8-BIT: the nearest NES color by era.js's redmean (proved as fx_era8), then the blocks.
SHADER_DEFS["8-bit"] = {
  label: "8-Bit", title: "an NES-style palette by redmean color distance, every 2 x 2 block merged (the Crunchy suite's 8-Bit era)",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [2, 2, 2, 2],
  params: shaderErasWith({ nes: { type: "palette", def: SHADER_ERA_NES.slice(), max: 64, label: "Console palette" } }),
  fragment: function (S) { return shaderErasBlocks(S, function (c) { return S.nearest(c, "nes", "redmean"); }); },
};

// 1-BIT: era.js's crisp dither. white when Y/255000 + (b/16 - 0.5) * 0.6 > 0.5, i.e. 16 Y + 153000 b > 3264000; the
// three exact ties era.js's floats tip to white are written in, so it matches on every color and cell.
SHADER_DEFS["1-bit"] = {
  label: "1-Bit", title: "black and white, dithered by brightness through a 4 x 4 Bayer cell (the Crunchy suite's crisp 1-Bit era)",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    ink: { type: "colour", def: SHADER_ERA_1BIT[0], label: "Ink (black)" },
    paper: { type: "colour", def: SHADER_ERA_1BIT[1], label: "Paper (white)" },
    gridx: { type: "int", min: 0, max: 3, def: 0, label: "Dither phase x (the camera's x mod 4)" },
    gridy: { type: "int", min: 0, max: 3, def: 0, label: "Dither phase y (the camera's y mod 4)" },
    pattern: { type: "int", min: 0, max: 3, def: 0, label: "Dither pattern", choices: ["Bayer 4 x 4 (the suite's eras)", "clustered dots", "lines", "noise"] },
    bias: { type: "int", min: -100, max: 100, def: 0, label: "Lighter or darker (-100 to 100)" },
  },
  fragment: function (S) {
    // build 7: pattern 0 + bias 0 are era.js's crisp 1-Bit exactly (the same Bayer lookup, nothing added)
    const c = S.tex(0, 0), Y = S.add(shaderErasY(S, c), S.mul(S.p("bias"), 1275));
    const b = shaderDither16(S, S.p("pattern"), S.add(S.x, S.p("gridx")), S.add(S.y, S.p("gridy")));
    const tip = [[192, 234, 81, 0], [218, 58, 248, 8], [242, 181, 55, 2]].map(function (t) {
      return S.and(S.eq(S.r(c), t[0]), S.eq(S.g(c), t[1]), S.eq(S.b(c), t[2]), S.eq(b, t[3]));
    });
    const white = S.or(S.gt(S.add(S.mul(Y, 16), S.mul(b, 153000)), 3264000), tip[0], tip[1], tip[2]);
    return S.sel(S.solid(c), S.sel(white, S.p("paper"), S.p("ink")), S.clear);
  },
};

// CRT: the picture through a curved tube. Everything is read at the WARPED point (the lines and the mask curve with the
// glass): bloom adds the bright art neighbors' excess, the mask tints by phosphor column, every scanline is darkened,
// and a banded vignette darkens toward the corners. Off the curved glass: black.
SHADER_DEFS.crt = {
  label: "CRT", title: "a tube TV: scanlines, an aperture grille or slot mask, bloom, a vignette and optional curvature",
  group: "Eras and display", kind: "screen", upscale: "scale", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    // def 3 (build 44; usability round 2026-10-23: at 1 a first-time user saw no scanlines and thought CRT did nothing)
    scale: { type: "int", min: 1, max: 6, def: 3, label: "Screen pixels per art pixel (room for the scanlines; 1: none)" },
    lines: { type: "int", min: 0, max: 100, def: 30, label: "Scanline darkening (%)" },
    mask: { type: "int", min: 0, max: 3, def: 1, label: "Mask", choices: ["none", "aperture grille", "slot mask", "shadow mask (dot triads)"] },
    maskamt: { type: "int", min: 0, max: 100, def: 20, label: "Mask strength (%)" },
    curve: { type: "int", min: 0, max: 8, def: 2, label: "Curvature" },
    vignette: { type: "int", min: 0, max: 100, def: 20, label: "Vignette (%)" },
    bloom: { type: "int", min: 0, max: 100, def: 30, label: "Bloom (%)" },
    bleed: { type: "int", min: 0, max: 100, def: 0, label: "Color bleed (%: composite video's smear to the right)" },
  },
  fragment: function (S) {
    const s = S.p("scale");
    // centered, doubled coordinates (integers for any w), normalized to -1024..1024; r2 0 (center) .. 2048 (a corner)
    const dx2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), dy2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    const nx = S.div(S.mul(dx2, 1024), S.w), ny = S.div(S.mul(dy2, 1024), S.h);
    const r2 = S.div(S.add(S.mul(nx, nx), S.mul(ny, ny)), 1024);
    const k = S.mul(S.p("curve"), r2);
    const wx = S.div(S.add(S.add(dx2, S.div(S.mul(dx2, k), 16384)), S.sub(S.w, 1)), 2);
    const wy = S.div(S.add(S.add(dy2, S.div(S.mul(dy2, k), 16384)), S.sub(S.h, 1)), 2);
    const on = S.and(S.ge(wx, 0), S.lt(wx, S.w), S.ge(wy, 0), S.lt(wy, S.h));
    const c = S.texAt(wx, wy, "clamp");
    const nb = [[s, 0], [S.neg(s), 0], [0, s], [0, S.neg(s)]].map(function (o) { return S.texAt(S.add(wx, o[0]), S.add(wy, o[1]), "clamp"); });
    const glow = function (ch) {
      let sum = S.i(0);
      nb.forEach(function (n) { sum = S.add(sum, S.max(S.sub(ch(n), 128), 0)); });
      return S.div(S.mul(sum, S.p("bloom")), 400);
    };
    // build 7: bleed mixes each channel toward the art pixel to the left (nb[1]), red most and blue least, as a composite
    // signal smears color along a line; at 0 the texel as it is
    const bl = S.p("bleed"), smear = function (ch, w) { return S.mix(ch(c), ch(nb[1]), S.mul(bl, w), 400); };
    const R = S.add(smear(S.r, 3), glow(S.r)), G = S.add(smear(S.g, 2), glow(S.g)), B = S.add(smear(S.b, 1), glow(S.b));
    // the mask: aperture = vertical phosphor stripes R, G, B; slot = the same, with staggered dark gaps; shadow (build 7) =
    // dot triads, each row's triads shifted by half of one (R G B over B R G … reads as staggered dots)
    const m = S.p("mask"), dim = S.sub(100, S.p("maskamt"));
    const col = S.sel(S.eq(m, 3), S.mod(S.add(wx, S.mul(S.mod(S.div(wy, S.max(1, S.div(s, 2))), 2), 2)), 3), S.mod(wx, 3));
    const slotGap = S.and(S.eq(m, 2), S.eq(S.mod(S.add(wy, S.mul(S.mod(S.div(wx, 3), 2), 2)), 4), 3));
    const ch = function (i) { return S.sel(S.or(S.eq(m, 0), S.and(S.eq(col, i), S.not(slotGap))), 100, dim); };
    // scanlines: at scale 1 every other row; at scale k the last row of each art pixel
    const dark = S.sel(S.eq(s, 1), S.eq(S.mod(wy, 2), 1), S.eq(S.mod(wy, s), S.sub(s, 1)));
    const line = S.sel(dark, S.sub(100, S.p("lines")), 100);
    const band = S.div(S.mul(r2, 8), 2048);                              // 0 .. 8: concentric bands, hard steps
    const vig = S.sub(100, S.div(S.mul(S.p("vignette"), S.mul(band, band)), 64));
    const f = S.mul(line, vig);                                           // 0 .. 10000
    const out = function (v, i) { return S.div(S.mul(S.mul(S.min(v, 255), ch(i)), f), 1000000); };
    return S.sel(on, S.rgba(out(R, 0), out(G, 1), out(B, 2), 255), S.rgba(0, 0, 0, 255));
  },
};

// LCD: a handheld's screen. The texture is the art upscaled `scale` times: the last row and column of every art pixel
// are the grid (mixed toward the panel's gap color). Ghosting can't be temporal here (an effect sees one frame and no
// history), so it is a STATIC smear: each art pixel carries a little of its left and upper neighbors, as a slow panel's
// trails look on a still. Then the panel's tint.
SHADER_DEFS.lcd = {
  label: "LCD grid", title: "a handheld's LCD: a grid between the pixels, a little smear, the panel's tint",
  group: "Eras and display", kind: "screen", upscale: "scale", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    scale: { type: "int", min: 2, max: 6, def: 3, label: "Screen pixels per art pixel (room for the grid lines)" },
    grid: { type: "int", min: 0, max: 100, def: 35, label: "Grid strength (%)" },
    gap: { type: "colour", def: "#1a1f18", label: "Grid color" },
    ghost: { type: "int", min: 0, max: 100, def: 30, label: "Smear (%)" },
    tintamt: { type: "int", min: 0, max: 100, def: 12, label: "Panel tint (%)" },
    tint: { type: "colour", def: "#b8c4a0", label: "Panel color" },
  },
  fragment: function (S) {
    const s = S.p("scale"), c = S.tex(0, 0);
    const lf = S.texAt(S.sub(S.x, s), S.y, "clamp"), up = S.texAt(S.x, S.sub(S.y, s), "clamp");
    const avg = function (f) { return S.div(S.add(f(lf), f(up)), 2); };
    const g = S.p("ghost");
    const sm = S.rgba(S.mix(S.r(c), avg(S.r), g, 200), S.mix(S.g(c), avg(S.g), g, 200), S.mix(S.b(c), avg(S.b), g, 200), 255);
    const tinted = S.mixc(sm, S.p("tint"), S.p("tintamt"), 100);
    const edge = S.or(S.eq(S.mod(S.x, s), S.sub(s, 1)), S.eq(S.mod(S.y, s), S.sub(s, 1)));
    return S.sel(edge, S.mixc(tinted, S.p("gap"), S.p("grid"), 100), tinted);
  },
};

// INTERLACE: two fields. Each frame draws one field's lines fresh; the other field is dimmed (mode 0) or repeats the
// line above, dimmed (mode 1: line doubling's comb). At scale k a line is k texels tall.
SHADER_DEFS.interlace = {
  label: "Interlace", title: "alternate lines each frame, the other field dimmed or doubled",
  group: "Eras and display", kind: "screen", upscale: "scale", palette: "free", frames: 2, fps: 30, pad: [0, 0, 0, 0],
  params: {
    scale: { type: "int", min: 1, max: 6, def: 1, label: "Line height here (1: an art row; k: the art upscaled k times)" },
    dark: { type: "int", min: 0, max: 100, def: 50, label: "Other field dimmed (%)" },
    mode: { type: "int", min: 0, max: 1, def: 0, label: "Other field", choices: ["dimmed", "the line above, dimmed"] },
  },
  fragment: function (S) {
    const s = S.p("scale"), line = S.div(S.y, s), fresh = S.eq(S.mod(line, 2), S.frame);
    const old = S.sel(S.eq(S.p("mode"), 1), S.texAt(S.x, S.sub(S.y, s), "clamp"), S.tex(0, 0));
    return S.sel(fresh, S.tex(0, 0), shaderErasScale(S, old, S.sub(100, S.p("dark"))));
  },
};

// POSTERIZE: `levels` evenly spaced steps per channel (0 and 255 among them), rounded as era.js's eraSnap does (levels 8
// IS Mega), with an optional 4 x 4 ordered dither before the snap.
SHADER_DEFS.posterize = {
  label: "Posterize", title: "every channel cut to a few even levels, optionally through an ordered dither",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    levels: { type: "int", min: 2, max: 16, def: 4, label: "Levels per channel" },
    dither: { type: "int", min: 0, max: 100, def: 0, label: "Ordered dither (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.sub(S.p("levels"), 1);
    const b = S.table(shaderErasBayer4, S.add(S.mul(S.mod(S.y, 4), 4), S.mod(S.x, 4)));
    const off = S.div(S.mul(S.mul(S.sub(S.mul(b, 2), 15), 255), S.p("dither")), S.mul(3200, n));
    const snap = function (v0) {
      const v = S.clamp(S.add(v0, off), 0, 255), q = S.div(S.add(S.mul(S.mul(v, n), 2), 255), 510);
      return S.div(S.add(S.mul(q, 510), n), S.mul(n, 2));
    };
    return S.sel(S.solid(c), S.rgba(snap(S.r(c)), snap(S.g(c)), snap(S.b(c)), 255), S.clear);
  },
};

// ======================================================================================================================
// LOOKS (CrunchyShader round 1, 2026-10-14: written by a roster agent in wip/shader-looks.js, merged by Grout)
// ======================================================================================================================
// crunchyCore wip: the LOOKS group for CrunchyShader round 1 (merged into shader.js by Grout when done).
// CrunchyCharacter's and CrunchyTile's looks (draw.js lookColourise, CHAR-DESIGN.md §53-56; objects.js objShadeLook,
// TILE-DESIGN.md §96) run at runtime over a whole composed screen, so a line crosses tile edges without a seam. They
// are "both": on a screen (pad 0) or on one sprite. All stills (1 frame): a look is a way of drawing, not a motion.
// Lines come from BRIGHTNESS jumps between 4-neighbors (integer luma), read with "clamp" so the screen's own edge
// draws no line. The line sits on ONE side of a jump (the darker for ink, the brighter for neon), so it is one pixel.
SHADER_EFFECTS.push("ink", "lineart", "neon", "toon", "hatching", "halftone", "blueprint", "night", "watercolour");

const shaderLooksN4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// the texel at this pixel + (dx, dy), the screen's edge texel outside it (so the border never reads as a jump)
function shaderLooksAt(S, dx, dy) { return S.texAt(S.add(S.x, dx), S.add(S.y, dy), "clamp"); }

// is the pixel at (ox, oy) ON A LINE? `jump(d)` turns a neighbor's luma minus this pixel's into the amount compared
// with `thr` (d: the darker side; -d: the brighter side; |d|: both). A clear neighbor never makes a line, unless
// `rim` (then a solid pixel touching clear is on the line: a sprite's silhouette).
function shaderLooksEdge(S, ox, oy, thr, jump, rim) {
  const c = shaderLooksAt(S, ox, oy), l = S.luma(c);
  const conds = shaderLooksN4.map(function (o) {
    const n = shaderLooksAt(S, ox + o[0], oy + o[1]);
    const hit = S.and(S.solid(n), S.gt(jump(S.sub(S.luma(n), l)), thr));
    return rim ? S.or(hit, S.not(S.solid(n))) : hit;
  });
  return S.and(S.solid(c), S.or.apply(null, conds));
}
function shaderLooksDark(S) { return function (d) { return d; }; }

// a color's channels times k / n (alpha kept)
function shaderLooksScale(S, c, k, n) {
  return S.rgba(S.div(S.mul(S.r(c), k), n), S.div(S.mul(S.g(c), k), n), S.div(S.mul(S.b(c), k), n), S.a(c));
}
// a color with `d` added to every channel (a brightness shift that keeps the hue's differences)
function shaderLooksShift(S, c, d) { return S.rgba(S.add(S.r(c), d), S.add(S.g(c), d), S.add(S.b(c), d), S.a(c)); }
function shaderLooksMax3(S, c) { return S.max(S.max(S.r(c), S.g(c)), S.b(c)); }

const shaderLooksLine = { type: "int", min: 8, max: 255, def: 40, label: "Line at a brightness jump of" };

// INK: near-black lines where neighboring brightness jumps; the colors stay. Strict: the image's colors + ink.
SHADER_DEFS.ink = {
  label: "Ink", title: "near-black lines where neighboring brightness jumps",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    threshold: shaderLooksLine,
    width: { type: "int", min: 1, max: 2, def: 1, label: "Line", choices: ["on the dark side", "both sides"] },
    ink: { type: "colour", def: "#18141e", label: "Ink" },
  },
  fragment: function (S) {
    const two = S.eq(S.p("width"), 2);
    const e = shaderLooksEdge(S, 0, 0, S.p("threshold"), function (d) { return S.sel(two, S.abs(d), d); });
    return S.sel(e, S.p("ink"), S.tex(0, 0));
  },
};

// LINE ART: lines only, on paper; the darkest masses filled with ink (the comic's spotted blacks). Strict.
SHADER_DEFS.lineart = {
  label: "Line art", title: "lines only, on paper; the darkest masses spotted black",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    threshold: { type: "int", min: 8, max: 255, def: 32, label: "Line at a brightness jump of" },
    fill: { type: "int", min: 0, max: 255, def: 36, label: "Fill black below brightness" },
    ink: { type: "colour", def: "#1c1820", label: "Ink" },
    paper: { type: "colour", def: "#f2ecdc", label: "Paper" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), e = shaderLooksEdge(S, 0, 0, S.p("threshold"), shaderLooksDark(S));
    return S.sel(S.solid(c), S.sel(S.or(e, S.lt(S.luma(c), S.p("fill"))), S.p("ink"), S.p("paper")), c);
  },
};

// NEON: a dark world whose edges glow: each line is its own color pushed to full brightness, mixed with the tube
// color, on the BRIGHT side of the jump; a ring of glow beside it (checkered, or solid). On a sprite the silhouette
// glows too, and the ring spills one pixel into the margin.
SHADER_DEFS.neon = {
  label: "Neon", title: "a dark world, its edges glowing",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [1, 1, 1, 1],
  params: {
    threshold: { type: "int", min: 8, max: 255, def: 44, label: "Glow at a brightness jump of" },
    dim: { type: "int", min: 0, max: 60, def: 14, label: "The dark keeps (%)" },
    tint: { type: "colour", def: "#36d6e7", label: "Tube color" },
    hue: { type: "int", min: 0, max: 100, def: 35, label: "Tube color over its own (%)" },
    halo: { type: "int", min: 0, max: 2, def: 1, label: "Glow ring", choices: ["none", "checkered", "solid"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), thr = S.p("threshold");
    const bright = function (d) { return S.neg(d); };
    const on = function (ox, oy) { return shaderLooksEdge(S, ox, oy, thr, bright, true); };
    const m = S.max(shaderLooksMax3(S, c), 1);
    const lit = S.rgba(S.div(S.mul(S.r(c), 255), m), S.div(S.mul(S.g(c), 255), m), S.div(S.mul(S.b(c), 255), m), 255);
    const tube = S.mixc(lit, S.p("tint"), S.p("hue"), 100);
    const dark = shaderLooksScale(S, c, S.p("dim"), 100);
    const halo = S.p("halo");
    const ring = S.and(S.or.apply(null, shaderLooksN4.map(function (o) { return on(o[0], o[1]); })),
      S.or(S.eq(halo, 2), S.and(S.eq(halo, 1), S.eq(S.mod(S.add(S.x, S.y), 2), 0))));
    const glowOn = S.sel(S.solid(c), S.mixc(dark, S.p("tint"), 1, 3), S.mixc(S.rgba(0, 0, 0, 255), S.p("tint"), 1, 2));
    return S.pick([[on(0, 0), tube], [ring, glowOn], [S.solid(c), dark]], c);
  },
};

// TOON: brightness posterized into flat bands (each color shifted to its band's middle, so the hue stays; the top band
// only brightened, so whites stay white), dark
// edges, and a light rim where a shape faces the light (its upper-left edge).
SHADER_DEFS.toon = {
  label: "Toon", title: "flat bands of light, dark edges, a lit rim",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    bands: { type: "int", min: 2, max: 6, def: 3, label: "Bands" },
    flatten: { type: "int", min: 0, max: 100, def: 100, label: "Flatten (%)" },
    threshold: { type: "int", min: 8, max: 255, def: 48, label: "Edge at a brightness jump of" },
    rim: { type: "int", min: 0, max: 80, def: 28, label: "Lit rim (brighter by)" },
    ink: { type: "colour", def: "#18141e", label: "Edge" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Y = S.luma(c), n = S.p("bands"), thr = S.p("threshold");
    const q = S.div(S.mul(Y, n), 256);
    const mid = S.div(S.mul(S.add(S.mul(q, 2), 1), 128), n);             // the band's middle
    const T = S.sel(S.eq(q, S.sub(n, 1)), S.max(mid, Y), mid);            // (the top band is never dimmed: whites stay)
    const flat = shaderLooksShift(S, c, S.div(S.mul(S.sub(T, Y), S.p("flatten")), 100));
    const edge = shaderLooksEdge(S, 0, 0, thr, shaderLooksDark(S));
    // lit rim: the pixel above or to the left is darker by the threshold (this pixel starts a shape, facing the light)
    const rimSide = S.or.apply(null, [[-1, 0], [0, -1]].map(function (o) {
      const nb = shaderLooksAt(S, o[0], o[1]);
      return S.gt(S.sub(Y, S.luma(nb)), thr);
    }));
    return S.pick([[S.not(S.solid(c)), c], [edge, S.p("ink")], [rimSide, shaderLooksShift(S, flat, S.p("rim"))]], flat);
  },
};

// HATCHING: ink on paper, diagonal hatching by brightness band, laid in SCREEN space (one pattern across every tile and
// sprite, as an etcher's plate), lines at the jumps. Strict.
SHADER_DEFS.hatching = {
  label: "Hatching", title: "diagonal hatching by brightness, in screen space",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    spacing: { type: "int", min: 3, max: 8, def: 4, label: "Hatch spacing (px)" },
    light: { type: "int", min: -80, max: 80, def: 0, label: "Lighter" },
    threshold: { type: "int", min: 8, max: 255, def: 40, label: "Line at a brightness jump of" },
    ink: { type: "colour", def: "#2a2236", label: "Ink" },
    paper: { type: "colour", def: "#efe6d0", label: "Paper" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sp = S.p("spacing"), half = S.div(sp, 2);
    const Y = S.add(S.luma(c), S.p("light"));
    const a = S.mod(S.add(S.x, S.y), sp), b = S.mod(S.sub(S.x, S.y), sp);   // (floored mod: x - y may be negative)
    const hatch = S.or(
      S.and(S.lt(Y, 184), S.eq(a, 0)),
      S.and(S.lt(Y, 120), S.eq(a, half)),
      S.and(S.lt(Y, 76), S.eq(b, 0)),
      S.and(S.lt(Y, 40), S.eq(b, half)));
    const e = shaderLooksEdge(S, 0, 0, S.p("threshold"), shaderLooksDark(S));
    return S.sel(S.solid(c), S.sel(S.or(e, hatch), S.p("ink"), S.p("paper")), c);
  },
};

// HALFTONE: a dot screen: each 4 x 4 cell (x scale) grows a dot from its center as the picture darkens (a clustered-dot
// matrix, 17 sizes). Dots in the color, deepened with ink; the paper between them tinged with it; strong edges inked.
const shaderLooksCluster = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14];
SHADER_DEFS.halftone = {
  label: "Halftone", title: "a dot screen: bigger dots where it is darker",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    scale: { type: "int", min: 1, max: 3, def: 1, label: "Dot cell (x 4 px)" },
    colour: { type: "int", min: 0, max: 100, def: 75, label: "Color kept (%)" },
    threshold: { type: "int", min: 8, max: 255, def: 64, label: "Outline at a brightness jump of" },
    ink: { type: "colour", def: "#1c1626", label: "Ink" },
    paper: { type: "colour", def: "#f6eedc", label: "Paper" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), s = S.p("scale"), keep = S.p("colour");
    const m = S.table(shaderLooksCluster, S.add(S.mul(S.mod(S.div(S.y, s), 4), 4), S.mod(S.div(S.x, s), 4)));
    const dark = S.div(S.mul(S.sub(255, S.luma(c)), 17), 256);           // 0 .. 16
    const dot = S.mixc(S.p("ink"), c, keep, 100), bg = S.mixc(S.p("paper"), c, keep, 300);
    const e = shaderLooksEdge(S, 0, 0, S.p("threshold"), shaderLooksDark(S));
    return S.pick([[S.not(S.solid(c)), c], [e, S.p("ink")], [S.lt(m, dark), dot]], bg);
  },
};

// BLUEPRINT: light lines on blue paper over a faint grid; dark masses hatched in the grid's color. Strict.
SHADER_DEFS.blueprint = {
  label: "Blueprint", title: "light lines on blue paper, a faint grid",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    threshold: { type: "int", min: 8, max: 255, def: 32, label: "Line at a brightness jump of" },
    grid: { type: "int", min: 0, max: 32, def: 16, label: "Grid every (px, 0 none)" },
    fill: { type: "int", min: 0, max: 255, def: 72, label: "Hatch darker than" },
    paper: { type: "colour", def: "#1f4f9a", label: "Paper" },
    ink: { type: "colour", def: "#e4eeff", label: "Lines" },
    rule: { type: "colour", def: "#3b6cb6", label: "Grid and hatching" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), g = S.p("grid");
    const e = shaderLooksEdge(S, 0, 0, S.p("threshold"), shaderLooksDark(S));
    const gridOn = S.and(S.gt(g, 0), S.or(S.eq(S.mod(S.x, g), 0), S.eq(S.mod(S.y, g), 0)));
    const hatch = S.and(S.lt(S.luma(c), S.p("fill")), S.eq(S.mod(S.sub(S.x, S.y), 4), 0));
    return S.sel(S.solid(c), S.pick([[e, S.p("ink")], [S.or(gridOn, hatch), S.p("rule")]], S.p("paper")), c);
  },
};

// NIGHT: the world dark and blue (its brightness in the night's color, a little of its own kept); the LIGHTS (bright and
// warm: lamps, windows, fire, gold) kept as they are, spilling into a ring round them.
SHADER_DEFS.night = {
  label: "Night", title: "dark and blue, the lights kept",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    tint: { type: "colour", def: "#6478d0", label: "Night color" },
    bright: { type: "int", min: 10, max: 100, def: 55, label: "Brightness (%)" },
    keep: { type: "int", min: 0, max: 100, def: 30, label: "Own color kept (%)" },
    lights: { type: "int", min: 128, max: 255, def: 200, label: "A light's brightest channel from" },
    warm: { type: "int", min: -255, max: 255, def: 30, label: "A light's red over blue by" },
    glow: { type: "int", min: 0, max: 2, def: 2, label: "Light spill (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Y = S.luma(c), t = S.p("tint"), keep = S.p("keep"), br = S.p("bright");
    const ch = function (own, tc) {
      const night = S.div(S.mul(Y, tc), 255);
      return S.div(S.mul(S.mix(night, own, keep, 100), br), 100);
    };
    const dark = S.rgba(ch(S.r(c), S.r(t)), ch(S.g(c), S.g(t)), ch(S.b(c), S.b(t)), S.a(c));
    const isLight = function (q) {
      return S.and(S.solid(q), S.ge(shaderLooksMax3(S, q), S.p("lights")), S.ge(S.sub(S.r(q), S.b(q)), S.p("warm")));
    };
    const g = S.p("glow");
    const near1 = S.or.apply(null, shaderLooksN4.map(function (o) { return isLight(shaderLooksAt(S, o[0], o[1])); }));
    const near2 = S.or.apply(null, [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(function (o) { return isLight(shaderLooksAt(S, o[0], o[1])); }));
    const checker = S.eq(S.mod(S.add(S.x, S.y), 2), 0);
    const half = S.mixc(dark, c, 1, 2);
    return S.pick([
      [S.not(S.solid(c)), c],
      [isLight(c), c],
      [S.and(S.ge(g, 1), near1), half],
      [S.and(S.ge(g, 2), near2, checker), half],
    ], dark);
  },
};

// WATERCOLOR (an extra; objShadeLook's "watercolor"): the colors washed toward the paper in ragged blotches, the
// pigment POOLING dark where colors meet, and a granulation fleck here and there.
SHADER_DEFS.watercolour = {
  label: "Watercolor", title: "washed color in ragged blotches, pigment pooled at the edges",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    wash: { type: "int", min: 0, max: 80, def: 30, label: "Wash toward the paper (%)" },
    pool: { type: "int", min: 0, max: 60, def: 28, label: "Pooled edges (darker %)" },
    blotch: { type: "int", min: 0, max: 40, def: 12, label: "Blotches (%)" },
    seed: { type: "int", min: 0, max: 999, def: 11, label: "Seed" },
    paper: { type: "colour", def: "#f6f0e2", label: "Paper" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), seed = S.p("seed");
    // ragged cells: each pixel jitters which 6 px cell it reads, so the blotches have torn edges
    const j = S.hash(S.x, S.y, S.add(seed, 7));
    const cx = S.div(S.add(S.x, S.mod(j, 3)), 6), cy = S.div(S.add(S.y, S.mod(S.div(j, 3), 3)), 6);
    const n = S.sub(S.mod(S.hash(cx, cy, seed), 3), 1);                     // -1, 0, 1
    const wash = S.clamp(S.add(S.p("wash"), S.mul(n, S.p("blotch"))), 0, 100);
    const washed = S.mixc(c, S.p("paper"), wash, 100);
    // pooling: a neighbor that differs (summed channels) by more than 96: the pigment's edge
    const meet = S.or.apply(null, shaderLooksN4.map(function (o) {
      const q = shaderLooksAt(S, o[0], o[1]);
      return S.and(S.solid(q), S.gt(S.add(S.add(S.abs(S.sub(S.r(q), S.r(c))), S.abs(S.sub(S.g(q), S.g(c)))), S.abs(S.sub(S.b(q), S.b(c)))), 96));
    }));
    const fleck = S.eq(S.mod(S.hash(S.x, S.y, S.add(seed, 3)), 29), 0);
    const pooled = shaderLooksScale(S, washed, S.sub(100, S.p("pool")), 100);
    const grain = shaderLooksScale(S, washed, S.sub(100, S.div(S.p("pool"), 2)), 100);
    return S.pick([[S.not(S.solid(c)), c], [meet, pooled], [fleck, grain]], washed);
  },
};

// ======================================================================================================================
// SPRITE FX (CrunchyShader round 1, 2026-10-14: written by a roster agent in wip/shader-sprite.js, merged by Grout)
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1, group "Sprite FX" (a roster agent's file; Grout merges it into shader.js).
// A classic script loaded AFTER shader.js (it uses shaderNear, shaderDisc and shaderTri from there). Every effect here
// runs on ONE sprite's texture (kind "sprite"), padded where it draws outside the sprite. Private helpers: shaderSprite*.
//
//   hitflash    the sprite flashes a color for a few frames, then rests                         strict
//   palswap     ramp → ramp by exact color (S.palIndex)                                          strict
//   dissolve    hashed pixels vanish with progress, a burning edge (a transition: all clear)      strict
//   silhouette  a flat color, with or without an outline (x-ray behind walls)                    strict
//   outline     outer or inner, 1-2 px, any color, pulsing through a 2 x 2 dither                strict
//   sway        whole-pixel row shifts that grow with height (plants; banners anchored at the top) strict
//   freeze      the sprite in an ice ramp by luma, a frost rim on its top edges                   strict
//   poison      a green ramp that breathes, with bubbles rising                                   strict
//   petrify     stone creeps up from the feet (a transition: all stone)                           strict
//   hologram    a cyan ramp, see-through scanlines, a scrolling band and glitch flicker           strict
//   blink       invisible (or dithered) on alternate frames                                       strict
//
// PALETTE SWAP matches colors EXACTLY, so it is only as exact as the texture the shader reads. SHADER-HANDOFF §6:
//   - Godot: import the sprite lossless (Compress Mode "Lossless" or "Uncompressed"), filter Nearest, no mipmaps. VRAM
//     compression (the 3D default; "Detect 3D" can switch a 2D texture to it) changes colors and nothing swaps.
//   - Unity: Compression None, sRGB OFF (as every CrunchyShader sprite), Point, no mipmaps. In a Linear project the
//     printed shader converts back to sRGB before comparing, so the 0..255 values match the palette; with sRGB ON or
//     any compression they won't.
//   - The web: draw from a PNG into a canvas WITHOUT color management (WebGL: UNPACK_COLORSPACE_CONVERSION_WEBGL =
//     NONE, premultiply off), or browsers may shift colors from an embedded ICC/gAMA chunk.
//   - A color missing from "from" stays as it is; a "to" shorter than "from" repeats its last color (palAt clamps).
//   The exact route (an INDEX MAP: the index in the red channel) is the handoff's §5 suite tie, not built yet.

SHADER_EFFECTS.push("hitflash", "palswap", "dissolve", "silhouette", "outline", "sway", "freeze", "poison", "petrify", "hologram", "blink");

// a 2 x 2 ordered dither: true where this pixel's threshold (0..3) is below level (0 none … 4 every pixel)
function shaderSpriteCover(S, level) {
  return S.lt(S.table([0, 2, 3, 1], S.add(S.mul(S.mod(S.y, 2), 2), S.mod(S.x, 2))), level);
}
// c's luma picks a color from palette k (dark → light); clear stays clear
function shaderSpriteRamp(S, c, k) {
  return S.sel(S.solid(c), S.palAt(k, S.div(S.mul(S.luma(c), S.palCount(k)), 256)), S.clear);
}
function shaderSpriteN4() { return [[1, 0], [-1, 0], [0, 1], [0, -1]]; }
// any of the offsets is clear (a sprite's inner edge reads this)
function shaderSpriteNearClear(S, offsets) { return S.or.apply(null, offsets.map(function (o) { return S.not(S.solid(S.tex(o[0], o[1]))); })); }

// HIT FLASH: frames 1-2 the sprite is one color, 3 plain, 4-5 the color again … `flashes` times, then it rests.
// A game plays it once from frame 0 on a hit (frame_override, or restart the clock). Its dark outline can stay.
SHADER_DEFS.hitflash = {
  label: "Hit flash", title: "the sprite flashes a color for a few frames, then rests",
  group: "Sprite FX", kind: "sprite", frames: 12, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    flash: { type: "colour", def: "#ffffff", label: "Flash" },
    flashes: { type: "int", min: 1, max: 3, def: 2, label: "Flashes" },
    keep: { type: "int", min: 0, max: 255, def: 24, label: "Leave the outline (pixels darker than, 0 to 255)" },
    curve: { type: "int", min: 0, max: 2, def: 0, label: "Flash curve", choices: ["blinks", "one flash fading out", "strobe"] },
  },
  fragment: function (S) {
    // build 7: curve "fading out" is ONE flash dithering away (2 x 2, full to nothing) over the same 3 x flashes frames;
    // "strobe" flashes every other frame over them
    const c = S.tex(0, 0), f = S.sub(S.frame, 1), cv = S.p("curve"), n = S.mul(S.p("flashes"), 3);
    const blinks = S.and(S.ge(f, 0), S.lt(S.mod(f, 3), 2), S.lt(S.div(f, 3), S.p("flashes")));
    const live = S.and(S.ge(f, 0), S.lt(f, n));
    const on = S.pick([
      [S.eq(cv, 1), S.and(live, shaderSpriteCover(S, S.sub(4, S.div(S.mul(f, 4), n))))],
      [S.eq(cv, 2), S.and(live, S.eq(S.mod(f, 2), 0))],
    ], blinks);
    return S.sel(S.and(on, S.solid(c), S.ge(S.luma(c), S.p("keep"))), S.p("flash"), c);
  },
};

// PALETTE SWAP: each color found in "from" becomes the color at the same place in "to" (a player-2 sprite, a recolored
// enemy). The defaults swap items.js's gold ramp to silver and its red potion ramp to green.
SHADER_DEFS.palswap = {
  label: "Palette swap", title: "ramp to ramp: each exact color of one palette becomes another's",
  group: "Sprite FX", kind: "sprite", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    from: { type: "palette", def: ["#ffd860", "#e8a93a", "#b87628", "#7d4a1d", "#4a2a14", "#ff5a5a", "#d92a3a", "#a0172b", "#6a0d1f", "#3d0612"], max: 16, label: "From (exact colors)" },
    to: { type: "palette", def: ["#f4f6fa", "#c9d0db", "#9aa4b5", "#6d778a", "#474f61", "#b6e85a", "#6fae2c", "#3c7a22", "#24501a", "#14300f"], max: 16, label: "To (same order)" },
    tolerance: { type: "int", min: 0, max: 64, def: 0, label: "Also swap colors this close (per channel, 0: exact only)" },
  },
  fragment: function (S) {
    // build 7: tolerance swaps a color NEAR one of "from" too (its nearest, if every channel is within tolerance), so
    // art with stray or anti-aliased shades swaps whole; an exact match always wins, as before
    const c = S.tex(0, 0), ex = S.palIndex(c, "from"), tol = S.p("tolerance");
    const q = S.nearest(c, "from"), dist = S.max(S.max(S.abs(S.sub(S.r(c), S.r(q))), S.abs(S.sub(S.g(c), S.g(q)))), S.abs(S.sub(S.b(c), S.b(q))));
    const i = S.sel(S.ge(ex, 0), ex, S.sel(S.and(S.gt(tol, 0), S.le(dist, tol)), S.palIndex(q, "from"), -1));
    return S.sel(S.and(S.ge(i, 0), S.solid(c)), S.palAt("to", i), c);
  },
};

// DISSOLVE: a transition. Each pixel vanishes when progress passes its hash; for `edge` hash steps before that it burns
// (bright, then ember). `clump` mixes in 4 px cells so it burns in patches instead of static. Progress 100 = all clear.
SHADER_DEFS.dissolve = {
  label: "Dissolve", title: "the sprite burns away pixel by pixel, a glowing edge eating in",
  group: "Sprite FX", kind: "sprite", transition: "covered", frames: 16, fps: 12, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: { type: "int", min: -1, max: 100, def: -1, label: "Progress (-1 plays on time)" },
    edge: { type: "int", min: 0, max: 30, def: 12, label: "Burning edge" },
    clump: { type: "int", min: 0, max: 4, def: 3, label: "Patches (from fine static to big blocks)" },
    seed: { type: "int", min: 0, max: 999, def: 11, label: "Seed" },
    burn: { type: "colour", def: "#ffd03a", label: "Burn" },
    ember: { type: "colour", def: "#d8401a", label: "Ember" },
    pattern: { type: "int", min: 0, max: 3, def: 0, label: "Burns", choices: ["all over", "from the top down", "from the bottom up", "from the middle out"] },
    chunk: { type: "int", min: 2, max: 8, def: 4, label: "Patch size (px)" },
  },
  fragment: function (S) {
    // build 7: `chunk` px patches (4 as before); `pattern` sends a ragged burning front across the sprite instead of
    // all over: the order is three parts the position (0..99 down, up or out from the middle) and one part the noise
    const c = S.tex(0, 0), E = S.p("edge"), k = S.p("clump"), seed = S.p("seed"), ch = S.p("chunk"), pat = S.p("pattern");
    const fine = S.mod(S.hash(S.x, S.y, seed), 100), coarse = S.mod(S.hash(S.div(S.x, ch), S.div(S.y, ch), S.add(seed, 77)), 100);
    const noise = S.div(S.add(S.mul(coarse, k), S.mul(fine, S.sub(4, k))), 4);          // 0..99
    const mid = S.max(S.div(S.mul(S.abs(S.sub(S.add(S.mul(S.x, 2), 1), S.w)), 100), S.w),
      S.div(S.mul(S.abs(S.sub(S.add(S.mul(S.y, 2), 1), S.h)), 100), S.h));     // 0 .. 99, 0 in the middle
    const order = S.pick([[S.eq(pat, 1), S.div(S.mul(S.y, 100), S.h)], [S.eq(pat, 2), S.div(S.mul(S.sub(S.sub(S.h, 1), S.y), 100), S.h)]], mid);
    const h = S.sel(S.eq(pat, 0), noise, S.div(S.add(S.mul(order, 3), noise), 4));     // 0..99
    const t = S.div(S.mul(S.progress(), S.add(100, E)), 100);                              // 0 .. 100 + edge
    const d = S.sub(t, h);                                                                 // > 0 once it has caught
    return S.pick([
      [S.not(S.solid(c)), c],
      [S.gt(d, E), S.clear],
      [S.gt(d, S.div(E, 2)), S.p("ember")],
      [S.gt(d, 0), S.p("burn")],
    ], c);
  },
};

// SILHOUETTE: the sprite as one flat color (a character behind a wall), an outer or inner edge in another, and
// optionally a checkerboard fill so the wall shows through.
SHADER_DEFS.silhouette = {
  label: "Silhouette", title: "a flat color with an optional edge, for x-ray behind walls",
  group: "Sprite FX", kind: "sprite", frames: 1, fps: 1, pad: [1, 1, 1, 1],
  params: {
    fill: { type: "colour", def: "#3a4466", label: "Fill" },
    line: { type: "colour", def: "#9fe2f6", label: "Edge" },
    edge: { type: "int", min: 0, max: 2, def: 1, label: "Edge", choices: ["none", "outside", "inside"] },
    pattern: { type: "int", min: 0, max: 1, def: 0, label: "Fill", choices: ["solid", "checkerboard"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), edge = S.p("edge");
    const holed = S.and(S.eq(S.p("pattern"), 1), S.eq(S.mod(S.add(S.x, S.y), 2), 1));
    return S.sel(S.solid(c),
      S.pick([[S.and(S.eq(edge, 2), shaderSpriteNearClear(S, shaderSpriteN4())), S.p("line")], [holed, S.clear]], S.p("fill")),
      S.sel(S.and(S.eq(edge, 1), shaderNear(S, shaderSpriteN4())), S.p("line"), c));
  },
};

// OUTLINE: a 1 or 2 px line outside the sprite (in its margin) or inside its edge. Pulse 1 swaps the line to `pulse`
// and back through a 2 x 2 dither; pulse 2 fades the line out and back the same way; pulse 0 holds it steady.
SHADER_DEFS.outline = {
  label: "Outline", title: "a 1-2 px outline outside or inside the sprite, steady or pulsing",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 10, pad: [2, 2, 2, 2],
  params: {
    line: { type: "colour", def: "#ffffff", label: "Line" },
    pulse_to: { type: "colour", def: "#ffd03a", label: "Pulses to" },
    side: { type: "int", min: 0, max: 2, def: 0, label: "Side", choices: ["outside", "inside", "both sides"] },
    width: { type: "int", min: 1, max: 2, def: 1, label: "Width (px)" },
    pulse: { type: "int", min: 0, max: 2, def: 1, label: "Pulse", choices: ["steady", "color", "fade"] },
    corners: { type: "int", min: 0, max: 1, def: 0, label: "Corners", choices: ["round", "square"] },
    style: { type: "int", min: 0, max: 2, def: 0, label: "Line", choices: ["solid", "dashed", "marching ants"] },
  },
  fragment: function (S) {
    // build 7: corners "square" reads the 8 neighbors (a 5 x 5 box at width 2), so the line turns corners as a box does;
    // style dashes the line 2 on, 2 off along the diagonals (marching ants: the dashes crawl a pixel a frame)
    const c = S.tex(0, 0), wide = S.eq(S.p("width"), 2), side = S.p("side"), sq = S.eq(S.p("corners"), 1), D = shaderDisc(4);
    const N8 = shaderDisc(2), B5 = shaderDisc(8);
    const outer = S.and(S.not(S.solid(c)), S.sel(wide, S.sel(sq, shaderNear(S, B5), shaderNear(S, D)), S.sel(sq, shaderNear(S, N8), shaderNear(S, shaderSpriteN4()))));
    const inner = S.and(S.solid(c), S.sel(wide, S.sel(sq, shaderSpriteNearClear(S, B5), shaderSpriteNearClear(S, D)), S.sel(sq, shaderSpriteNearClear(S, N8), shaderSpriteNearClear(S, shaderSpriteN4()))));
    const ring = S.pick([[S.eq(side, 1), inner], [S.eq(side, 2), S.or(inner, outer)]], outer), pulse = S.p("pulse");
    const st = S.p("style"), gap = S.and(S.gt(st, 0), S.ge(S.mod(S.sub(S.add(S.x, S.y), S.sel(S.eq(st, 2), S.frame, 0)), 4), 2));
    const dith = S.and(S.gt(pulse, 0), shaderSpriteCover(S, shaderTri(S, 4)));
    return S.sel(S.and(ring, S.not(gap)), S.pick([[S.not(dith), S.p("line")], [S.eq(pulse, 1), S.p("pulse_to")]], c), c);
  },
};

// SWAY: each row slides sideways by whole pixels, more the further it is from the anchor (the bottom for a plant, the
// top for a hanging banner), on a cosine over the loop. Bend 1 curves it (the tip moves most); ripple > 0 delays the
// wave by one frame every `ripple` rows, so it travels along a banner. The anchor row never moves.
SHADER_DEFS.sway = {
  label: "Wind sway", title: "the sprite sways in the wind, whole pixels, more toward its tip",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 8, pad: [0, 3, 0, 3],
  params: {
    amount: { type: "int", min: 1, max: 3, def: 2, label: "Sway at the tip (px)" },
    bend: { type: "int", min: 0, max: 1, def: 1, label: "Bend", choices: ["straight lean", "curved"] },
    ripple: { type: "int", min: 0, max: 8, def: 0, label: "Ripple (rows per frame of delay; 0 none)" },
    anchor: { type: "int", min: 0, max: 1, def: 0, label: "Anchored at", choices: ["bottom", "top"] },
  },
  fragment: function (S) {
    const COS = [1000, 924, 707, 383, 0, -383, -707, -924, -1000, -924, -707, -383, 0, 383, 707, 924];   // 16 = frames
    const span = S.sub(S.h, 1), hb = S.sel(S.eq(S.p("anchor"), 1), S.y, S.sub(span, S.y));
    const bend = S.eq(S.p("bend"), 1);
    const num = S.sel(bend, S.mul(hb, hb), S.mul(hb, span)), den = S.mul(span, span);                    // 0 .. den
    const ph = S.mod(S.sub(S.frame, S.div(hb, S.p("ripple"))), S.FRAMES);                                // div by 0 = 0
    const v = S.mul(S.table(COS, ph), S.p("amount"));                                                     // ±3000
    const den2 = S.mul(den, 1000);                                                                         // <= 1e6 for 32 px
    const shift = S.div(S.add(S.mul(v, num), S.div(den2, 2)), den2);                                     // rounded
    return S.texAt(S.sub(S.x, shift), S.y);
  },
};

// FREEZE: every color to an ice ramp by its brightness (`amount` of 4 through a 2 x 2 dither, so 2 is half frozen),
// and the top edges frosted with the lightest ice.
SHADER_DEFS.freeze = {
  label: "Freeze", title: "frozen solid: an ice tint with frost on the top edges",
  group: "Sprite FX", kind: "sprite", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    ice: { type: "palette", def: ["#1a2c4e", "#2f5d8f", "#5b9bd0", "#9fd4f0", "#e6f8ff"], max: 8, label: "Ice (dark → light)" },
    amount: { type: "int", min: 1, max: 4, def: 4, label: "Frozen (of 4)" },
    rim: { type: "int", min: 0, max: 1, def: 1, label: "Frost on top edges" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0);
    const top = S.and(S.eq(S.p("rim"), 1), S.solid(c), S.not(S.solid(S.tex(0, -1))));
    return S.pick([
      [S.not(S.solid(c)), c],
      [top, S.palAt("ice", S.sub(S.palCount("ice"), 1))],
      [shaderSpriteCover(S, S.p("amount")), shaderSpriteRamp(S, c, "ice")],
    ], c);
  },
};

// POISON: a sickly green ramp over the sprite whose coverage breathes (amount, rising by `pulse` at mid-loop), with
// bubbles in the lightest green rising through it (one per `bubbles` pixels; 0 none).
SHADER_DEFS.poison = {
  label: "Poison", title: "a green tint that breathes, bubbles rising through the sprite",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  params: {
    venom: { type: "palette", def: ["#1b2e12", "#3c6b1f", "#6fae2c", "#b6e85a"], max: 8, label: "Venom (dark → light)" },
    amount: { type: "int", min: 0, max: 4, def: 3, label: "Tint at rest (of 4)" },
    pulse: { type: "int", min: 0, max: 4, def: 1, label: "Pulse (more at mid-loop)" },
    bubbles: { type: "int", min: 0, max: 80, def: 40, label: "One bubble per (0 none)" },
    seed: { type: "int", min: 0, max: 999, def: 5, label: "Seed" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), r = S.p("bubbles");
    const level = S.min(4, S.add(S.p("amount"), shaderTri(S, S.p("pulse"))));
    const yy = S.mod(S.add(S.y, S.frame), S.FRAMES);                                    // rises 1 px a frame, loops
    const bub = S.and(S.gt(r, 0), S.eq(S.mod(S.hash(S.x, yy, S.p("seed")), S.max(r, 1)), 0));
    return S.pick([
      [S.not(S.solid(c)), c],
      [bub, S.palAt("venom", S.sub(S.palCount("venom"), 1))],
      [shaderSpriteCover(S, level), shaderSpriteRamp(S, c, "venom")],
    ], c);
  },
};

// PETRIFY: a transition. Stone (a gray ramp by brightness, with hashed cracks in its darkest gray) creeps up from the
// sprite's feet along a ragged front; progress 100 is all stone.
SHADER_DEFS.petrify = {
  label: "Petrify", title: "stone creeps up from the feet until the sprite is a statue",
  group: "Sprite FX", kind: "sprite", transition: "all stone", frames: 16, fps: 10, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: { type: "int", min: -1, max: 100, def: -1, label: "Progress (-1 plays on time)" },
    stone: { type: "palette", def: ["#2b2a30", "#55545c", "#86858c", "#b8b6b4"], max: 8, label: "Stone (dark → light)" },
    cracks: { type: "int", min: 0, max: 20, def: 4, label: "Cracks (%)" },
    seed: { type: "int", min: 0, max: 999, def: 9, label: "Seed" },
  },
  fragment: function (S) {
    const J = 3, c = S.tex(0, 0), seed = S.p("seed");
    const L = S.sub(S.add(S.h, J), S.div(S.mul(S.progress(), S.add(S.h, 2 * J)), 100));  // h + J (none) … -J (all)
    const stone = S.ge(S.add(S.y, S.mod(S.hash(S.x, seed, 5), J)), L);
    const crack = S.lt(S.mod(S.hash(S.x, S.y, S.add(seed, 3)), 100), S.p("cracks"));
    return S.pick([
      [S.not(S.and(S.solid(c), stone)), c],
      [crack, S.palAt("stone", 0)],
    ], shaderSpriteRamp(S, c, "stone"));
  },
};

// HOLOGRAM: the sprite in a cyan ramp; every `gap`-th row is see-through; a bright band scrolls down once a loop; on
// some frames (flicker %) a slice of rows jumps 2 px sideways and the rest dims one step.
SHADER_DEFS.hologram = {
  label: "Hologram", title: "a flickering cyan projection with scanlines and a scrolling band",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 12, pad: [0, 2, 0, 2],
  params: {
    light: { type: "palette", def: ["#0b3a4a", "#1d7f99", "#3fd0e8", "#b8f6ff"], max: 8, label: "Light (dark → light)" },
    gap: { type: "int", min: 2, max: 4, def: 3, label: "Scanline every (rows)" },
    flicker: { type: "int", min: 0, max: 100, def: 20, label: "Glitch frames (%)" },
    seed: { type: "int", min: 0, max: 999, def: 4, label: "Seed" },
  },
  fragment: function (S) {
    const seed = S.p("seed"), F = S.FRAMES;
    const glitch = S.lt(S.mod(S.hash(S.frame, seed, 41), 100), S.p("flicker"));
    const y0 = S.mod(S.hash(S.frame, seed, 43), S.h), sh = S.sub(S.mul(S.mod(S.hash(S.frame, seed, 47), 2), 4), 2);   // ±2
    const inSlice = S.and(glitch, S.ge(S.y, y0), S.lt(S.y, S.add(y0, 4)));
    const c = S.texAt(S.sub(S.x, S.sel(inSlice, sh, 0)), S.y);
    const n = S.palCount("light"), i = S.div(S.mul(S.luma(c), n), 256);
    const band = S.sub(S.div(S.mul(S.frame, S.add(S.h, 4)), F), 2);                    // -2 .. h+1
    const inBand = S.and(S.ge(S.y, band), S.lt(S.y, S.add(band, 2)));
    const idx = S.pick([[inBand, S.sub(n, 1)], [glitch, S.sub(i, 1)]], i);
    return S.sel(S.and(S.solid(c), S.ne(S.mod(S.y, S.p("gap")), 0)), S.palAt("light", idx), S.clear);
  },
};

// BLINK: invisible on alternate frames (invulnerability after a hit), or 2 on / 2 off; `hide` 1 dithers it instead.
SHADER_DEFS.blink = {
  label: "Blink", title: "invisible on alternate frames, as after a hit",
  group: "Sprite FX", kind: "sprite", frames: 4, fps: 15, pad: [0, 0, 0, 0], still0: true,
  params: {
    pattern: { type: "int", min: 0, max: 1, def: 0, label: "Pattern", choices: ["every other frame", "two on, two off"] },
    hide: { type: "int", min: 0, max: 1, def: 0, label: "Hidden as", choices: ["invisible", "a checkerboard"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0);
    const off = S.sel(S.eq(S.p("pattern"), 1), S.ge(S.frame, 2), S.eq(S.mod(S.frame, 2), 1));
    const gone = S.or(S.eq(S.p("hide"), 0), S.eq(S.mod(S.add(S.x, S.y), 2), 1));
    return S.sel(S.and(off, gone), S.clear, c);
  },
};

// ======================================================================================================================
// TRANSITIONS AND WORLD (CrunchyShader round 1, 2026-10-14: written by a roster agent in wip/shader-world.js, merged by Grout)
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1, group "Transitions and world" (SHADER.md §2.6). Loaded after shader.js; Grout
// merges it in. Screen effects, all integer, all stepped:
//   TRANSITIONS (group "Transitions"): progress 0 is the plain screen, 100 is where `transition` says (S.progress()).
//     ditherfade, diamond, iris, pixelate, blinds, scanwipe
//   WORLD (group "World"): loops that close, calm over a game screen.
//     ripple, heathaze, fog, rain, snow, underwater, daynight
// Private helpers are shaderWorld*.

SHADER_EFFECTS.push("ditherfade", "diamond", "iris", "pixelate", "blinds", "scanwipe",
  "ripple", "heathaze", "fog", "rain", "snow", "underwater", "daynight");

// ---- helpers ------------------------------------------------------------------------------------------------------------
function shaderWorldBayer(S, x, y) {
  return S.table([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], S.add(S.mul(S.mod(y, 4), 4), S.mod(x, 4)));
}
function shaderWorldProgress() { return { type: "int", min: -1, max: 100, def: -1, label: "Progress (-1 plays on time)" }; }
// a triangle wave of period P (even): phase (any int) -> -P/4 .. P/4, 0 at phase 0, rising
function shaderWorldTri(S, phase, P) { return S.sub(P / 4, S.abs(S.sub(S.mod(S.add(phase, P / 4), P), P / 2))); }
// v (-q..q) scaled by amp / q, rounded half away from zero (symmetric, so a wave leans neither way)
function shaderWorldScale(S, v, amp, q) {
  const m = S.div(S.add(S.mul(S.abs(v), amp), Math.floor(q / 2)), q);
  return S.sel(S.lt(v, 0), S.neg(m), m);
}
// floor(sqrt(n)) for 0 <= n < 4^12, by setting bits from the top (12 sels)
function shaderWorldSqrt(S, n) {
  let r = S.i(0);
  for (let b = 11; b >= 0; b--) { const c = S.add(r, 1 << b); r = S.sel(S.le(S.mul(c, c), n), c, r); }
  return r;
}
function shaderWorldScaleC(S, c, num, den) {   // every channel times num / den (alpha kept)
  return S.rgba(S.div(S.mul(S.r(c), num), den), S.div(S.mul(S.g(c), num), den), S.div(S.mul(S.b(c), num), den), S.a(c));
}

// ======================================================================================================== TRANSITIONS

// DITHER FADE: the screen fades to a color through a 4 x 4 Bayer dither (SHADER.md's own example, plus a cell size).
SHADER_DEFS.ditherfade = {
  label: "Dither fade", title: "the screen fades to a color through a 4 x 4 dither",
  group: "Transitions", kind: "screen", transition: "covered", frames: 16, fps: 16, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Fade to" },
    cell: { type: "int", min: 1, max: 4, def: 1, label: "Dither pixel size" },
    pattern: { type: "int", min: 0, max: 3, def: 0, label: "Dither pattern", choices: SHADER_DITHER_NAMES.slice() },
  },
  fragment: function (S) {
    // build 7: `pattern` (shaderDither16; 0 the Bayer as before): clustered dots grow as a halftone, lines fill as blinds
    const s = S.p("cell"), t = shaderDither16(S, S.p("pattern"), S.div(S.x, s), S.div(S.y, s));
    return S.sel(S.lt(S.div(S.mul(t, 100), 16), S.progress()), S.p("cover"), S.tex(0, 0));
  },
};

// DIAMOND WIPE: a grid of diamonds grows to cover the screen, cell by cell in a sweep (the classic RPG battle wipe).
SHADER_DEFS.diamond = {
  label: "Diamond wipe", title: "a grid of diamonds grows over the screen in a sweep",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    cell: { type: "int", min: 4, max: 32, def: 16, label: "Diamond size (px)" },
    dir: { type: "int", min: 0, max: 2, def: 0, label: "Sweep", choices: ["diagonal", "left to right", "from the center"] },
  },
  fragment: function (S) {
    const N = S.p("cell"), dir = S.p("dir");
    const cx = S.div(S.x, N), cy = S.div(S.y, N);
    const d = S.add(S.abs(S.sub(S.mul(S.mod(S.x, N), 2), S.sub(N, 1))), S.abs(S.sub(S.mul(S.mod(S.y, N), 2), S.sub(N, 1))));
    const R = S.sub(S.mul(N, 2), 1);                                     // d < R everywhere in a cell
    const cols = S.div(S.add(S.w, S.sub(N, 1)), N), rows = S.div(S.add(S.h, S.sub(N, 1)), N);
    // order 0 .. span-1: which cells go first
    const order = S.pick([
      [S.eq(dir, 1), cx],
      [S.eq(dir, 2), S.add(S.abs(S.sub(S.mul(cx, 2), S.sub(cols, 1))), S.abs(S.sub(S.mul(cy, 2), S.sub(rows, 1))))],
    ], S.add(cx, cy));
    const span = S.pick([[S.eq(dir, 1), cols], [S.eq(dir, 2), S.add(cols, rows)]], S.add(cols, rows));
    const lag = S.mul(R, 2);
    const reach = S.sub(S.div(S.mul(S.progress(), S.add(R, lag)), 100), S.div(S.mul(order, lag), span));
    return S.sel(S.lt(d, reach), S.p("cover"), S.tex(0, 0));
  },
};

// IRIS: a circle closes on a point (iris out); driven 100 -> 0 it opens again (iris in). Chunky when block > 1.
SHADER_DEFS.iris = {
  label: "Iris", title: "a circle closes on a point (and opens again, driven backwards)",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    block: { type: "int", min: 1, max: 8, def: 1, label: "Pixel size of the edge" },
  },
  fragment: function (S) {
    const b = S.p("block");
    const px = S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), py = S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100);
    const bx = S.add(S.mul(S.div(S.x, b), b), S.div(b, 2)), by = S.add(S.mul(S.div(S.y, b), b), S.div(b, 2));
    const dx = S.sub(bx, px), dy = S.sub(by, py), d2 = S.add(S.mul(dx, dx), S.mul(dy, dy));
    const mx = S.add(S.max(px, S.sub(S.sub(S.w, 1), px)), b), my = S.add(S.max(py, S.sub(S.sub(S.h, 1), py)), b);
    const Rm = S.add(shaderWorldSqrt(S, S.add(S.mul(mx, mx), S.mul(my, my))), 1);      // Rm² > every d2
    const r = S.div(S.mul(Rm, S.sub(100, S.progress())), 100);
    return S.sel(S.ge(d2, S.mul(r, r)), S.p("cover"), S.tex(0, 0));
  },
};

// PIXELATE: the screen breaks into ever larger blocks (each its center texel); driven backwards it resolves again.
SHADER_DEFS.pixelate = {
  label: "Pixelate", title: "the screen breaks into ever larger blocks (driven backwards, it sharpens)",
  group: "Transitions", kind: "screen", transition: "the largest blocks", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    largest: { type: "int", min: 2, max: 32, def: 12, label: "Largest block (px)" },
    shape: { type: "int", min: 0, max: 2, def: 0, label: "Blocks", choices: ["square", "wide (2 : 1)", "tall (1 : 2)"] },
    seams: { type: "int", min: 0, max: 100, def: 0, label: "Dark seams between blocks (%: a mosaic of tiles)" },
  },
  fragment: function (S) {
    // build 7: shape stretches the blocks (2b - 1 one way: 1 at progress 0, so it still starts plain); seams darken each
    // block's last row and column once blocks are 3 px or more (palette "free" for that; seams 0 draws only texels)
    const b = S.add(1, S.div(S.mul(S.progress(), S.sub(S.p("largest"), 1)), 100)), shp = S.p("shape");
    const bw = S.sel(S.eq(shp, 1), S.sub(S.mul(b, 2), 1), b), bh = S.sel(S.eq(shp, 2), S.sub(S.mul(b, 2), 1), b);
    const hx = S.div(S.w, 2), hy = S.div(S.h, 2);
    const qx = S.add(S.add(S.mul(S.div(S.sub(S.x, hx), bw), bw), hx), S.div(bw, 2));
    const qy = S.add(S.add(S.mul(S.div(S.sub(S.y, hy), bh), bh), hy), S.div(bh, 2));
    const c = S.texAt(qx, qy, "clamp"), sm = S.p("seams");
    const seam = S.and(S.gt(sm, 0), S.ge(b, 3), S.or(S.eq(S.mod(S.sub(S.x, hx), bw), S.sub(bw, 1)), S.eq(S.mod(S.sub(S.y, hy), bh), S.sub(bh, 1))));
    return S.sel(seam, shaderWorldScaleC(S, c, S.sub(100, sm), 100), c);
  },
};

// BLINDS: horizontal slats close row by row, each band a little after the one above.
SHADER_DEFS.blinds = {
  label: "Blinds", title: "horizontal slats close over the screen, top band first",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 20, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    band: { type: "int", min: 2, max: 32, def: 8, label: "Slat height (px)" },
    stagger: { type: "int", min: 0, max: 100, def: 50, label: "Stagger (0 all at once)" },
  },
  fragment: function (S) {
    const B = S.p("band"), k = S.div(S.y, B), ly = S.mod(S.y, B), nb = S.div(S.add(S.h, S.sub(B, 1)), B);
    const lag = S.div(S.mul(B, S.p("stagger")), 25);
    const reach = S.sub(S.div(S.mul(S.progress(), S.add(B, lag)), 100), S.div(S.mul(k, lag), nb));
    return S.sel(S.lt(ly, reach), S.p("cover"), S.tex(0, 0));
  },
};

// SCANLINE WIPE: every row is wiped across by a beam, even rows from the left and odd rows from the right (a zip),
// lower rows a little later.
SHADER_DEFS.scanwipe = {
  label: "Scanline wipe", title: "each row is wiped across by a beam, alternate rows from either side",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    beam: { type: "colour", def: "#e8f4ff", label: "Beam" },
    lag: { type: "int", min: 0, max: 200, def: 100, label: "Lower rows lag (% of the width)" },
  },
  fragment: function (S) {
    const p = S.progress(), L = S.div(S.mul(S.w, S.p("lag")), 100);
    const xpos = S.sel(S.eq(S.mod(S.y, 2), 0), S.x, S.sub(S.sub(S.w, 1), S.x));
    const reach = S.sub(S.div(S.mul(p, S.add(S.w, L)), 100), S.div(S.mul(S.y, L), S.h));
    const beam = S.and(S.gt(p, 0), S.ge(xpos, reach), S.lt(xpos, S.add(reach, 2)));
    return S.pick([[S.lt(xpos, reach), S.p("cover")], [beam, S.p("beam")]], S.tex(0, 0));
  },
};

// ============================================================================================================== WORLD

// WATER RIPPLE: rows shift sideways by whole pixels on a traveling triangle wave (no sine), below a waterline.
SHADER_DEFS.ripple = {
  label: "Water ripple", title: "rows sway sideways in whole pixels, a slow traveling wave",
  group: "World", kind: "screen", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  params: {
    amp: { type: "int", min: 0, max: 3, def: 1, label: "Sway (px)" },
    rows: { type: "int", min: 1, max: 4, def: 2, label: "Rows per step" },
    from: { type: "int", min: 0, max: 100, def: 0, label: "Waterline (% down the screen)" },
    dir: { type: "int", min: 0, max: 2, def: 0, label: "Moves", choices: ["rows sway sideways", "columns bob up and down", "both (a wobbling pool)"] },
    falloff: { type: "int", min: 0, max: 2, def: 0, label: "Strength", choices: ["even", "growing with depth", "fading with depth"] },
  },
  fragment: function (S) {
    // build 7: dir "columns" bobs each column on the same wave (rows per step become columns per step), "both" does
    // both; falloff scales the sway by the depth below the waterline (0 at the line … full at the bottom, or the reverse)
    const amp = S.p("amp"), rows = S.p("rows"), dir = S.p("dir"), fo = S.p("falloff");
    const D = S.sub(S.mul(S.y, 100), S.mul(S.p("from"), S.h)), SPAN = S.mul(S.sub(100, S.p("from")), S.h);   // depth, 0 .. SPAN
    const k = S.pick([[S.eq(fo, 1), D], [S.eq(fo, 2), S.sub(SPAN, D)]], SPAN);
    const deep = function (v) {                                                     // v · k / SPAN · amp / 4, rounded as shaderWorldScale
      const q = S.mul(SPAN, 4), m = S.div(S.add(S.mul(S.abs(v), amp), S.div(q, 2)), q);
      return S.sel(S.lt(v, 0), S.neg(m), m);
    };
    const sway = function (tri) { return S.sel(S.eq(fo, 0), shaderWorldScale(S, tri, amp, 4), deep(S.mul(tri, k))); };
    const dx = S.sel(S.eq(dir, 1), 0, sway(shaderWorldTri(S, S.add(S.div(S.y, rows), S.frame), 16)));          // -4 .. 4 → px
    const dy = S.sel(S.eq(dir, 0), 0, sway(shaderWorldTri(S, S.add(S.div(S.x, rows), S.frame), 16)));
    const wet = S.ge(S.mul(S.y, 100), S.mul(S.p("from"), S.h));
    return S.sel(wet, S.texAt(S.sub(S.x, dx), S.sub(S.y, dy), "clamp"), S.tex(0, 0));
  },
};

// HEAT HAZE: short runs of pixels jitter one pixel sideways in a pattern that rises up the screen, stronger lower down.
SHADER_DEFS.heathaze = {
  label: "Heat haze", title: "air shimmers: pixels jitter sideways in a pattern rising up the screen",
  group: "World", kind: "screen", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  params: {
    amount: { type: "int", min: 1, max: 2, def: 1, label: "Shift (px)" },
    density: { type: "int", min: 0, max: 100, def: 35, label: "How much shimmers (%)" },
    seed: { type: "int", min: 0, max: 999, def: 11, label: "Seed" },
  },
  fragment: function (S) {
    const rb = S.div(S.mod(S.add(S.y, S.frame), 32), 2);                                // 16 bands of 2 rows, rising, loop 32
    const n = S.hash(S.div(S.x, 24), rb, S.p("seed"));                                  // patches 24 px wide
    const eff = S.div(S.mul(S.p("density"), S.add(S.h, S.mul(S.y, 3))), S.mul(S.h, 4));  // a quarter at the top, full at the bottom
    const on = S.lt(S.mod(n, 100), eff);
    // inside a patch the row bends on a short triangle wave along x (coherent, not torn), phase per band
    const wave = shaderWorldTri(S, S.add(S.div(S.x, 2), S.mul(rb, 5)), 16);                // -4 .. 4
    const dx = S.sel(on, shaderWorldScale(S, wave, S.p("amount"), 4), 0);
    return S.texAt(S.add(S.x, dx), S.y, "clamp");
  },
};

// FOG BANDS: banks of fog drift sideways at two speeds, three dithered strengths over the scene.
SHADER_DEFS.fog = {
  label: "Fog bands", title: "banks of fog drift slowly sideways over the scene",
  group: "World", kind: "screen", palette: "free", frames: 128, fps: 8, pad: [0, 0, 0, 0],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 55, label: "Thickest fog (%)" },
    density: { type: "int", min: 0, max: 100, def: 50, label: "How much of the screen" },
    fog: { type: "colour", def: "#c8d2dc", label: "Fog" },
    seed: { type: "int", min: 0, max: 999, def: 4, label: "Seed" },
  },
  fragment: function (S) {
    const CW = 32, CH = 10, NX = 4, seed = S.p("seed");                                  // x period 128 = the drift
    const iy = S.div(S.y, CH), fy = S.mod(S.y, CH);
    const row = function (r) {
      const sp = S.add(1, S.mod(S.hash(r, seed, 7), 2));                                 // 1 or 2 px a frame: 128 or 256
      const xx = S.mod(S.sub(S.x, S.mul(S.frame, sp)), CW * NX), ix = S.div(xx, CW), fx = S.mod(xx, CW);
      const v = function (i) { return S.mod(S.hash(S.mod(i, NX), r, seed), 256); };
      return S.div(S.add(S.mul(v(ix), S.sub(CW, fx)), S.mul(v(S.add(ix, 1)), fx)), CW);
    };
    const n = S.div(S.add(S.mul(row(iy), S.sub(CH, fy)), S.mul(row(S.add(iy, 1)), fy)), CH);    // 0..255
    const lev = S.clamp(S.add(S.sub(n, 196), S.div(S.mul(S.p("density"), 3), 2)), 0, 63);
    const step = S.div(S.add(S.mul(S.div(lev, 4), 3), shaderWorldBayer(S, S.x, S.y)), 16);     // 0..3, dithered
    return S.mixc(S.tex(0, 0), S.p("fog"), S.mul(step, S.p("amount")), 300);
  },
};

// RAIN: slanted streaks fall in two layers (far: faint and short, near: solid and longer); the scene dims a little.
SHADER_DEFS.rain = {
  label: "Rain", title: "slanted streaks of rain fall in two layers over a dimmed scene",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  params: {
    density: { type: "int", min: 0, max: 100, def: 22, label: "Rain (%)" },
    wind: { type: "int", min: -4, max: 4, def: 1, label: "Wind (slant)" },
    rain: { type: "colour", def: "#a9c1dc", label: "Rain" },
    dim: { type: "int", min: 0, max: 60, def: 12, label: "Dim the scene (%)" },
    seed: { type: "int", min: 0, max: 999, def: 2, label: "Seed" },
  },
  fragment: function (S) {
    const seed = S.p("seed"), c = S.tex(0, 0);
    const u = S.sub(S.x, S.div(S.mul(S.y, S.p("wind")), 4));                              // the streak's column, slanted
    const n = S.hash(u, seed, 3), has = S.lt(S.mod(n, 100), S.p("density"));
    const near = S.eq(S.mod(S.div(n, 100), 4), 0);
    const sp = S.sel(near, 12, 8), len = S.sel(near, 5, 3);                               // 16 frames: 192 / 128 = 3 / 2 periods
    const ph = S.mod(S.add(S.sub(S.y, S.mul(S.frame, sp)), S.hash(u, seed, 9)), 64);
    const on = S.and(has, S.lt(ph, len));
    const base = shaderWorldScaleC(S, c, S.sub(100, S.p("dim")), 100);
    return S.sel(on, S.sel(near, S.p("rain"), S.mixc(base, S.p("rain"), 1, 2)), base);
  },
};

// SNOWFALL: flakes drift down in two layers, swaying a pixel either way; near flakes are 2 x 2.
function shaderWorldFlakes(S, CW, CH, sp, big, salt) {
  const seed = S.add(S.p("seed"), salt), PH = 96;
  const sy = S.mod(S.sub(S.y, S.mul(S.frame, sp)), PH), cy = S.div(sy, CH), ly = S.mod(sy, CH);
  const t = S.mod(S.add(S.frame, S.mod(S.hash(cy, seed, 5), 48)), 48), tri = S.abs(S.sub(t, 24));     // 0..24, 48 frames
  const amp = S.p("sway"), sw = S.sub(S.div(S.add(S.mul(S.mul(tri, amp), 2), 12), 24), amp);         // -amp .. amp
  const xx = S.sub(S.x, sw), cx = S.div(xx, CW), lx = S.mod(xx, CW);
  const n = S.hash(cx, cy, seed), has = S.lt(S.mod(n, 100), S.p("density"));
  const fx = S.mod(S.div(n, 100), CW - big), fy = S.mod(S.div(n, 7), CH - big);
  return S.and(has, S.ge(lx, fx), S.le(lx, S.add(fx, big - 1)), S.ge(ly, fy), S.le(ly, S.add(fy, big - 1)));
}
SHADER_DEFS.snow = {
  label: "Snowfall", title: "snowflakes drift down in two layers, swaying gently",
  group: "World", kind: "screen", frames: 96, fps: 12, pad: [0, 0, 0, 0],
  params: {
    density: { type: "int", min: 0, max: 100, def: 55, label: "Snow (%)" },
    sway: { type: "int", min: 0, max: 2, def: 1, label: "Sway (px)" },
    flake: { type: "colour", def: "#ffffff", label: "Near flakes" },
    far: { type: "colour", def: "#c6d2e4", label: "Far flakes" },
    seed: { type: "int", min: 0, max: 999, def: 6, label: "Seed" },
  },
  fragment: function (S) {
    const near = shaderWorldFlakes(S, 24, 24, 2, 2, 500), far = shaderWorldFlakes(S, 12, 16, 1, 1, 0);
    return S.pick([[near, S.p("flake")], [far, S.p("far")]], S.tex(0, 0));
  },
};

// UNDERWATER: the scene wobbles a pixel either way, tinted deeper towards the bottom, with caustic glints drifting in
// the upper part.
SHADER_DEFS.underwater = {
  label: "Underwater", title: "the scene wobbles under water, tinted with depth, caustic glints overhead",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  params: {
    wobble: { type: "int", min: 0, max: 2, def: 1, label: "Wobble (px)" },
    depth: { type: "int", min: 0, max: 100, def: 40, label: "Tint (%)" },
    tint: { type: "colour", def: "#1c4f7c", label: "Water" },
    glints: { type: "int", min: 0, max: 100, def: 70, label: "Caustic glints (%)" },
    glint: { type: "colour", def: "#d6f4ff", label: "Glint" },
  },
  fragment: function (S) {
    const f = S.frame, amp = S.p("wobble");
    const dx = shaderWorldScale(S, shaderWorldTri(S, S.add(S.div(S.y, 3), f), 32), amp, 8);
    const dy = shaderWorldScale(S, shaderWorldTri(S, S.sub(S.div(S.x, 5), f), 32), amp, 8);
    const c = S.texAt(S.add(S.x, dx), S.add(S.y, dy), "clamp");
    const band = S.div(S.mul(S.y, 8), S.h);                                              // 0..7, deeper is bluer
    const tinted = S.mixc(c, S.p("tint"), S.mul(S.p("depth"), S.add(band, 8)), 1600);
    // caustics: two crossing triangle waves (period 32), each bent by the other's axis; lit where both crest
    const wx = S.add(S.x, shaderWorldTri(S, S.add(S.div(S.y, 2), f), 32));
    const wy = S.add(S.y, shaderWorldTri(S, S.sub(S.div(S.x, 2), S.mul(f, 2)), 32));
    const a = S.abs(shaderWorldTri(S, S.add(S.add(wx, S.div(wy, 2)), f), 32));         // 0..8
    const b = S.abs(shaderWorldTri(S, S.sub(S.sub(wy, S.div(wx, 2)), f), 32));
    const crest = S.or(S.ge(a, 8), S.ge(b, 8));                                           // a bent net, cells ~16 px
    const reach = S.div(S.mul(S.p("glints"), S.mul(S.h, 2)), 300);                     // glints in the top 2/3 at 100
    const keep = S.lt(S.mod(S.hash(S.x, S.y, S.div(f, 4)), 100), S.sub(100, S.div(S.mul(S.y, 100), S.max(reach, 1))));
    const lit = S.and(crest, S.lt(S.y, reach), keep);
    return S.sel(lit, S.mixc(tinted, S.p("glint"), 1, 2), tinted);
  },
};

// DAY-NIGHT: a tint through a day: blue night, warm dawn, plain day, orange dusk (half-hour steps, 48 to a day).
function shaderWorldSky(k) {   // the 48-step table of channel k (1 r, 2 g, 3 b, 4 desaturate)
  const keys = [   // [half-hour, r, g, b (x/256), desaturate (x/16)]
    [0, 112, 136, 214, 6], [10, 112, 136, 214, 6], [13, 236, 200, 214, 1], [16, 256, 256, 256, 0],
    [34, 256, 256, 256, 0], [37, 255, 168, 120, 1], [40, 112, 136, 214, 6], [48, 112, 136, 214, 6],
  ];
  const out = [];
  for (let t = 0; t < 48; t++) {
    let i = 0;
    while (keys[i + 1][0] <= t) i++;
    const A = keys[i], B = keys[i + 1];
    out.push(A[k] + Math.round((B[k] - A[k]) * (t - A[0]) / (B[0] - A[0])));
  }
  return out;
}
SHADER_DEFS.daynight = {
  label: "Day and night", title: "the light of a day: blue night, warm dawn, plain noon, orange dusk",
  group: "World", kind: "screen", palette: "free", frames: 48, fps: 4, pad: [0, 0, 0, 0],
  params: {
    hour: { type: "int", min: -1, max: 47, def: -1, label: "Time of day in half-hours (24 noon; -1 plays the day)" },
    strength: { type: "int", min: 0, max: 100, def: 100, label: "Strength (%)" },
  },
  fragment: function (S) {
    const t = S.sel(S.ge(S.p("hour"), 0), S.p("hour"), S.frame), c = S.tex(0, 0), l = S.luma(c);
    const de = S.table(shaderWorldSky(4), t), st = S.p("strength");
    const ch = function (v, k) {
      const grey = S.mix(v, l, de, 16), lit = S.div(S.mul(grey, S.table(shaderWorldSky(k), t)), 256);
      return S.mix(v, lit, st, 100);
    };
    return S.rgba(ch(S.r(c), 1), ch(S.g(c), 2), ch(S.b(c), 3), S.a(c));
  },
};

// ======================================================================================================================
// SCREEN EXTRAS (round 1b): CrunchyShader, 2026-10-14, written by a roster agent in wip/shader-screen2.js, merged by Grout
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1b, screen extras (SHADER.md §2.6). Loaded after shader.js; Grout merges it in.
// Screen effects, all integer, all stepped:
//   WORLD: torchlight (a lit circle in the dark), lightning (flashes, then an afterglow), shake (whole-pixel offsets)
//   LOOKS: vhs (row jitter, a tracking band, split channels), oldfilm (sepia, grain, scratches, flicker),
//          nightvision (green phosphor, noise, scanlines)
// Private helpers are shaderScreen2*.

SHADER_EFFECTS.push("torchlight", "lightning", "shake", "vhs", "oldfilm", "nightvision");

// ---- helpers ------------------------------------------------------------------------------------------------------------
function shaderScreen2Bayer(S, x, y) {
  return S.table([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], S.add(S.mul(S.mod(y, 4), 4), S.mod(x, 4)));
}
// floor(sqrt(n)) for 0 <= n < 4^12, by setting bits from the top
function shaderScreen2Sqrt(S, n) {
  let r = S.i(0);
  for (let b = 11; b >= 0; b--) { const c = S.add(r, 1 << b); r = S.sel(S.le(S.mul(c, c), n), c, r); }
  return r;
}
function shaderScreen2ScaleC(S, c, num, den) {   // every channel times num / den (alpha kept)
  return S.rgba(S.div(S.mul(S.r(c), num), den), S.div(S.mul(S.g(c), num), den), S.div(S.mul(S.b(c), num), den), S.a(c));
}
// a luma (any int) onto palette k's ramp, dark to light, through a 4 x 4 ordered dither: always a palette color
function shaderScreen2Ramp(S, l, k) {
  const n1 = S.sub(S.palCount(k), 1), lc = S.clamp(l, 0, 255);
  const idx = S.div(S.add(S.mul(S.mul(lc, n1), 32), S.mul(255, S.add(S.mul(shaderScreen2Bayer(S, S.x, S.y), 2), 1))), 8160);
  return S.palAt(k, S.clamp(idx, 0, n1));
}
// a signed jitter -a..a from a hash (a >= 0)
function shaderScreen2Jit(S, h, a) { return S.sub(S.mod(h, S.add(S.mul(a, 2), 1)), a); }

// ============================================================================================================== WORLD

// TORCHLIGHT: darkness everywhere but a lit circle round a point; a falloff ring of four dithered steps; an optional flicker.
SHADER_DEFS.torchlight = {
  label: "Torchlight", title: "darkness everywhere but a lit circle round a point, with a dithered falloff",
  group: "World", kind: "screen", palette: "free", frames: 8, fps: 8, pad: [0, 0, 0, 0],
  params: {
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Light across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 55, label: "Light down (%)" },
    radius: { type: "int", min: 0, max: 100, def: 28, label: "Lit radius (% of the height)" },
    ring: { type: "int", min: 1, max: 60, def: 14, label: "Falloff ring (% of the height)" },
    dark: { type: "int", min: 0, max: 100, def: 82, label: "Darkness (%)" },
    flicker: { type: "int", min: 0, max: 8, def: 2, label: "Flicker (px)" },
    tint: { type: "colour", def: "#ffffff", label: "Light color (white: the scene's own)" },
  },
  fragment: function (S) {
    // build 7: `tint` colors the light: lit pixels are multiplied by it, fading to plain through the falloff (white is
    // the identity: x · 255 · 4 / 1020 = x exactly)
    const c = S.tex(0, 0);
    const px = S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), py = S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100);
    const dx = S.sub(S.x, px), dy = S.sub(S.y, py), d = shaderScreen2Sqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy)));
    const R = S.add(S.div(S.mul(S.p("radius"), S.h), 100), shaderScreen2Jit(S, S.hash(S.frame, 11), S.p("flicker")));
    const rw = S.max(1, S.div(S.mul(S.p("ring"), S.h), 100));
    const t = S.clamp(S.div(S.mul(S.sub(d, R), 16), rw), -1, 16);   // <0 lit, 0..15 the ring, 16 dark
    // four dithered steps of darkness across the ring (q 0 lit .. 4 full dark)
    const q = S.clamp(S.div(S.add(S.mul(t, 4), shaderScreen2Bayer(S, S.x, S.y)), 16), 0, 4);
    const lit = shaderScreen2ScaleC(S, c, S.sub(100, S.div(S.mul(S.p("dark"), q), 4)), 100), L = S.p("tint");
    const by = function (v, l) { return S.div(S.mul(v, S.add(S.mul(q, 255), S.mul(l, S.sub(4, q)))), 1020); };
    return S.rgba(by(S.r(lit), S.r(L)), by(S.g(lit), S.g(L)), by(S.b(lit), S.b(L)), S.a(lit));
  },
};

// LIGHTNING: a storm-dimmed screen flashes to a color twice a loop at hashed moments (flash, gap, flash), then glows down.
SHADER_DEFS.lightning = {
  label: "Lightning", title: "the screen flashes white-blue at hashed moments, then a dim afterglow",
  group: "World", kind: "screen", palette: "free", frames: 48, fps: 16, pad: [0, 0, 0, 0],
  params: {
    flash: { type: "colour", def: "#e4ecff", label: "Flash" },
    strength: { type: "int", min: 0, max: 100, def: 85, label: "Flash strength (%)" },
    dim: { type: "int", min: 0, max: 100, def: 30, label: "Storm dimming (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Seed (when the strikes fall)" },
  },
  fragment: function (S) {
    const L = [100, 20, 80, 55, 36, 24, 16, 10, 6, 3, 0];          // the strike's envelope by frames since it fell
    const s1 = S.mod(S.hash(S.p("seed"), 1), 20), s2 = S.add(24, S.mod(S.hash(S.p("seed"), 2), 20));
    const lvl = S.max(S.table(L, S.mod(S.sub(S.frame, s1), 48)), S.table(L, S.mod(S.sub(S.frame, s2), 48)));
    const t = S.div(S.mul(lvl, S.p("strength")), 100), c = S.tex(0, 0), f = S.p("flash"), keep = S.sub(100, S.p("dim"));
    const ch = (v, fv) => S.mix(S.div(S.mul(v, keep), 100), fv, t, 100);
    return S.rgba(ch(S.r(c), S.r(f)), ch(S.g(c), S.g(f)), ch(S.b(c), S.b(f)), S.a(c));
  },
};

// SHAKE: the screen jumps by whole pixels, hashed per frame, the reach decaying over the loop; edges clamp.
SHADER_DEFS.shake = {
  label: "Shake", title: "the screen jumps by whole pixels, the shake dying away over the loop",
  group: "World", kind: "screen", frames: 16, fps: 30, pad: [0, 0, 0, 0],
  params: {
    amount: { type: "int", min: 0, max: 16, def: 4, label: "Reach (px)" },
    decay: { type: "int", min: 0, max: 100, def: 100, label: "Decay over the loop (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Seed" },
  },
  fragment: function (S) {
    const F = S.FRAMES;
    const a = S.div(S.mul(S.p("amount"), S.sub(100 * F, S.mul(S.p("decay"), S.frame))), 100 * F);
    const dx = shaderScreen2Jit(S, S.hash(S.frame, S.p("seed"), 1), a), dy = shaderScreen2Jit(S, S.hash(S.frame, S.p("seed"), 2), a);
    return S.texAt(S.add(S.x, dx), S.add(S.y, dy), "clamp");
  },
};

// ============================================================================================================== LOOKS

// VHS: rows jitter sideways, a tracking band rolls down the screen (shifted, speckled), red and blue split apart.
SHADER_DEFS.vhs = {
  label: "VHS", title: "jittering rows, a rolling tracking band, red and blue split apart",
  group: "Looks", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  params: {
    jitter: { type: "int", min: 0, max: 100, def: 12, label: "Jittering rows (%)" },
    band: { type: "int", min: 0, max: 50, def: 8, label: "Tracking band (% of the height)" },
    split: { type: "int", min: 0, max: 4, def: 1, label: "Color split (px)" },
  },
  fragment: function (S) {
    const F = S.FRAMES, bh = S.div(S.mul(S.p("band"), S.h), 100);
    const by = S.sub(S.div(S.mul(S.frame, S.add(S.h, bh)), F), bh);
    const inBand = S.and(S.ge(S.y, by), S.lt(S.y, S.add(by, bh)));
    const hr = S.hash(S.y, S.frame, 3);
    const j = S.pick([[inBand, S.add(2, S.mod(S.hash(S.y, S.frame, 5), 3))],
      [S.lt(S.mod(hr, 100), S.p("jitter")), S.sub(S.mul(S.mod(S.div(hr, 100), 2), 2), 1)]], 0);
    const xs = S.add(S.x, j), sp = S.p("split");
    const cr = S.texAt(S.add(xs, sp), S.y, "clamp"), cg = S.texAt(xs, S.y, "clamp"), cb = S.texAt(S.sub(xs, sp), S.y, "clamp");
    const speck = S.and(inBand, S.lt(S.mod(S.hash(S.x, S.y, S.frame), 100), 30));
    const lift = S.sel(speck, 90, 0);
    return S.rgba(S.add(S.r(cr), lift), S.add(S.g(cg), lift), S.add(S.b(cb), lift), S.a(cg));
  },
};

// OLD FILM: a sepia ramp (dithered), grain, vertical scratches that hop each frame, the whole frame flickering.
// Strict: only the ramp's colors come out.
SHADER_DEFS.oldfilm = {
  label: "Old film", title: "a sepia ramp with grain, hopping scratches and a flicker",
  group: "Looks", kind: "screen", frames: 12, fps: 12, pad: [0, 0, 0, 0],
  params: {
    tones: { type: "palette", def: ["#1e140c", "#4a3422", "#7e5e3e", "#b4946a", "#e6d4ac"], max: 8, label: "Tones, dark to light" },
    grain: { type: "int", min: 0, max: 100, def: 18, label: "Grain (%)" },
    scratches: { type: "int", min: 0, max: 3, def: 2, label: "Scratches" },
    flicker: { type: "int", min: 0, max: 40, def: 12, label: "Flicker (brightness steps)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), h = S.hash(S.x, S.y, S.frame);
    const grain = S.sel(S.lt(S.mod(h, 100), S.p("grain")), S.sub(S.mul(S.mod(S.div(h, 100), 2), 80), 40), 0);
    const l = S.add(S.add(S.luma(c), shaderScreen2Jit(S, S.hash(S.frame, 21), S.p("flicker"))), grain);
    const hits = [];
    for (let k = 0; k < 3; k++) {
      hits.push(S.and(S.lt(k, S.p("scratches")), S.eq(S.x, S.mod(S.hash(S.frame, k, 9), S.w)),
        S.ne(S.mod(S.hash(S.div(S.y, 6), S.frame, k), 5), 0)));
    }
    const scratch = S.or(...hits);
    const out = S.sel(scratch, S.palAt("tones", S.sub(S.palCount("tones"), 1)), shaderScreen2Ramp(S, l, "tones"));
    return S.sel(S.solid(c), out, S.clear);
  },
};

// NIGHT VISION: brightness boosted onto a green phosphor ramp, with crawling noise and darkened scanlines. Strict.
SHADER_DEFS.nightvision = {
  label: "Night vision", title: "a green phosphor ramp by brightness, with noise and scanlines",
  group: "Looks", kind: "screen", frames: 8, fps: 12, pad: [0, 0, 0, 0],
  params: {
    tones: { type: "palette", def: ["#04140a", "#0c3a18", "#1f7a2c", "#4cc244", "#b4ff8c"], max: 8, label: "Phosphor, dark to light" },
    gain: { type: "int", min: 50, max: 400, def: 160, label: "Gain (%)" },
    noise: { type: "int", min: 0, max: 100, def: 22, label: "Noise (%)" },
    scan: { type: "int", min: 0, max: 128, def: 36, label: "Scanline darkening (brightness steps)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), h = S.hash(S.x, S.y, S.frame);
    const nz = S.sel(S.lt(S.mod(h, 100), S.p("noise")), S.sub(S.mul(S.mod(S.div(h, 100), 2), 96), 48), 0);
    const l = S.sub(S.add(S.div(S.mul(S.luma(c), S.p("gain")), 100), nz), S.mul(S.mod(S.y, 2), S.p("scan")));
    return S.sel(S.solid(c), shaderScreen2Ramp(S, l, "tones"), S.clear);
  },
};

// ======================================================================================================================
// SPRITE EXTRAS (round 1b): CrunchyShader, 2026-10-14, written by a roster agent in wip/shader-sprite2.js, merged by Grout
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1b, group "Sprite FX" extras (a roster agent's file; Grout merges it into shader.js).
// A classic script loaded AFTER shader.js (it uses shaderNear, shaderTri and the round-1 sprite helpers
// shaderSpriteCover / shaderSpriteRamp from there). Every effect runs on ONE sprite's texture (kind "sprite"). All strict.
//
//   dropshadow  a flat offset shadow behind the sprite, solid or checkered                       strict
//   reflection  a mirrored copy below, in a water ramp, rippling and dithering out with depth      strict
//   ghost       a dithered see-through sprite in a pale ramp, floating up and down                 strict
//   rimlight    the edges facing one of 8 directions lit in a color (inside the outline)          strict
//   rainbow     invincibility: brightness through a cycling palette, in moving diagonal bands       strict
//   charge      an inner glow that pulses and deepens over the loop, then a flash, then rest       strict

SHADER_EFFECTS.push("dropshadow", "reflection", "ghost", "rimlight", "rainbow", "charge");

// a direction 0..7 (0 up, clockwise) as a step
function shaderSprite2Dx(S, dir) { return S.table([0, 1, 1, 1, 0, -1, -1, -1], dir); }
function shaderSprite2Dy(S, dir) { return S.table([-1, -1, 0, 1, 1, 1, 0, -1], dir); }
// a pixel that ends the sprite's body: clear, or an outline darker than keep
function shaderSprite2Edge(S, c, keep) { return S.or(S.not(S.solid(c)), S.lt(S.luma(c), keep)); }

// DROP SHADOW: where the sprite is clear but the sprite shifted by (dx, dy) is solid, the shadow color (or a checkerboard
// of it, so the ground shows through). The sprite itself is untouched.
SHADER_DEFS.dropshadow = {
  label: "Drop shadow", title: "a flat offset shadow behind the sprite",
  group: "Sprite FX", kind: "sprite", frames: 1, fps: 1, pad: [0, 3, 3, 0],
  params: {
    shadow: { type: "colour", def: "#17121c", label: "Shadow" },
    dx: { type: "int", min: 0, max: 3, def: 2, label: "Offset right (px)" },
    dy: { type: "int", min: 0, max: 3, def: 2, label: "Offset down (px)" },
    pattern: { type: "int", min: 0, max: 1, def: 0, label: "Fill", choices: ["solid", "checkerboard"] },
    style: { type: "int", min: 0, max: 1, def: 0, label: "Shadow", choices: ["flat", "long (extruded)"] },
  },
  fragment: function (S) {
    // build 7: style "long" is an EXTRUDED shadow, as in a long-shadow flat design. Build 8 (before release: at the
    // default 2, 2 build 7's version filled only 1 and 2 px, hidden inside the flat shadow on any solid shape): the
    // sprite is read 1, 2 and 3 px back along the offset's own direction, (dx, dy) scaled so its longer side is the pad's
    // full reach of 3 (rounded), which always includes the flat offset itself, so a long shadow runs on past it
    const c = S.tex(0, 0), dx = S.p("dx"), dy = S.p("dy"), s = S.texAt(S.sub(S.x, dx), S.sub(S.y, dy));
    const m = S.max(dx, dy), m2 = S.mul(m, 2);                                      // 0 (no offset): no shadow either way
    const along = function (v, k) { return S.div(S.add(S.mul(v, 2 * k), m), m2); };  // round(v k / m)
    const step = function (k) { return S.solid(S.texAt(S.sub(S.x, along(dx, k)), S.sub(S.y, along(dy, k)))); };
    const cast = S.sel(S.eq(S.p("style"), 1), S.and(S.gt(m, 0), S.or(step(1), step(2), step(3))), S.solid(s));
    const holed = S.and(S.eq(S.p("pattern"), 1), S.eq(S.mod(S.add(S.x, S.y), 2), 1));
    return S.pick([[S.solid(c), c], [S.and(cast, S.not(holed)), S.p("shadow")]], c);
  },
};

// REFLECTION: the 16 px pad below the sprite is water. Row d below the waterline shows the sprite's row d up from its
// bottom, shifted sideways by a traveling 8-frame wave, recolored through the `water` ramp by luma, and dithered out
// toward `depth` rows. The waterline is the image's bottom edge (a sprite standing on it), or `lift` rows above it when
// the art has empty rows under its feet (the reflection then starts inside the image, in those clear rows).
SHADER_DEFS.reflection = {
  label: "Reflection", title: "a mirrored, darkened, rippling copy below, as on water",
  group: "Sprite FX", kind: "sprite", frames: 8, fps: 8, pad: [0, 2, 16, 2],
  params: {
    water: { type: "palette", def: ["#14243a", "#1f3d5c", "#2f6a8a", "#5fa8c0"], max: 8, label: "Water (dark → light)" },
    depth: { type: "int", min: 4, max: 16, def: 12, label: "Fades out over (rows)" },
    ripple: { type: "int", min: 0, max: 2, def: 1, label: "Ripple (px)" },
    lift: { type: "int", min: 0, max: 8, def: 3, label: "Waterline above the image bottom (rows)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), line = S.sub(S.sub(S.h, 16), S.p("lift")), d = S.sub(S.y, line);   // d >= 0 in the water
    const wave = S.table([0, 1, 1, 0, 0, -1, -1, 0], S.mod(S.sub(S.y, S.frame), 8));
    const r = S.texAt(S.add(S.x, S.mul(wave, S.p("ripple"))), S.sub(S.sub(line, 1), d));
    const level = S.sub(4, S.div(S.mul(d, 4), S.p("depth")));                         // 4 at the line … 0 at depth
    return S.sel(S.and(S.ge(d, 0), S.not(S.solid(c)), S.solid(r), shaderSpriteCover(S, level)), shaderSpriteRamp(S, r, "water"), c);
  },
};

// GHOST: the sprite floats up by 0..drift px and back over the loop and is drawn through a 2 x 2 dither (see 1 = a
// quarter shows … 3 = three quarters), optionally recolored through a pale ramp by luma.
SHADER_DEFS.ghost = {
  label: "Ghost", title: "dithered see-through, floating slowly",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 6, pad: [2, 0, 0, 0],
  params: {
    see: { type: "int", min: 1, max: 3, def: 2, label: "Shows (quarters of the pixels)" },
    drift: { type: "int", min: 0, max: 2, def: 2, label: "Float (px)" },
    tint: { type: "int", min: 0, max: 1, def: 1, label: "Color", choices: ["its own", "the ghost ramp"] },
    pale: { type: "palette", def: ["#3a4466", "#8b9bb4", "#c0cbdc", "#f4f6fa"], max: 8, label: "Ghost ramp (dark → light)" },
  },
  fragment: function (S) {
    const up = S.div(S.mul(shaderTri(S, 4), S.p("drift")), 4);                         // 0 .. drift and back
    const c = S.texAt(S.x, S.add(S.y, up));
    const col = S.sel(S.eq(S.p("tint"), 1), shaderSpriteRamp(S, c, "pale"), c);
    return S.sel(S.and(S.solid(c), shaderSpriteCover(S, S.p("see"))), col, S.clear);
  },
};

// RIM LIGHT: a body pixel (solid, not outline) with an edge (clear or outline) within `width` steps toward the light
// takes the rim color. The outline stays, so the light sits just inside it.
SHADER_DEFS.rimlight = {
  label: "Rim light", title: "the edges facing a chosen side lit in a color",
  group: "Sprite FX", kind: "sprite", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    rim: { type: "colour", def: "#ffe9a8", label: "Light" },
    from: { type: "int", min: 0, max: 7, def: 1, label: "Light from", choices: ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"] },
    width: { type: "int", min: 1, max: 3, def: 1, label: "Width (px)" },
    keep: { type: "int", min: 0, max: 255, def: 24, label: "Outline: pixels darker than (0 to 255)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), dir = S.p("from"), dx = shaderSprite2Dx(S, dir), dy = shaderSprite2Dy(S, dir), keep = S.p("keep");
    const hits = [];
    for (let k = 1; k <= 3; k++) {
      const n = S.texAt(S.add(S.x, S.mul(dx, k)), S.add(S.y, S.mul(dy, k)));
      hits.push(S.and(S.le(k, S.p("width")), shaderSprite2Edge(S, n, keep)));
    }
    return S.sel(S.and(S.not(shaderSprite2Edge(S, c, keep)), S.or.apply(null, hits)), S.p("rim"), c);
  },
};

// RAINBOW: invincibility. Each body pixel's luma picks a color of `cycle`, plus diagonal bands (`bands` per 8 px) and
// the frame, so the colors run across the sprite and cycle round the palette once per loop. Outline pixels stay.
SHADER_DEFS.rainbow = {
  label: "Rainbow", title: "invincibility: brightness through a cycling palette",
  group: "Sprite FX", kind: "sprite", frames: 8, fps: 15, pad: [0, 0, 0, 0],
  params: {
    cycle: { type: "palette", def: ["#ff4a5a", "#ff9a3a", "#ffe45a", "#6fdc5a", "#3ad0e8", "#4a6aff", "#b05aff"], max: 16, label: "Cycle" },
    bands: { type: "int", min: 0, max: 4, def: 2, label: "Diagonal bands (per 8 px)" },
    keep: { type: "int", min: 0, max: 255, def: 24, label: "Leave the outline (pixels darker than, 0 to 255)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("cycle");
    const i = S.add(S.add(S.div(S.mul(S.luma(c), n), 256), S.div(S.mul(S.add(S.x, S.y), S.p("bands")), 8)),
      S.div(S.mul(S.frame, n), S.FRAMES));
    return S.sel(S.and(S.solid(c), S.ge(S.luma(c), S.p("keep"))), S.palAt("cycle", S.mod(i, n)), c);
  },
};

// CHARGE: 24 frames. Frames 0-17 build: an inner ring (body pixels within w of an edge, w growing 1 → 3) glows through a
// 2 x 2 dither that pulses three times, each pulse fuller. Frames 18-19 the whole body flashes; 20-23 plain (cooldown).
// A game holding a charge can loop it, or pin frame_override.
SHADER_DEFS.charge = {
  label: "Charge", title: "a pulsing inner glow that builds, then flashes",
  group: "Sprite FX", kind: "sprite", frames: 24, fps: 12, pad: [0, 0, 0, 0],
  params: {
    glow: { type: "colour", def: "#6fe8ff", label: "Glow" },
    flash: { type: "colour", def: "#ffffff", label: "Flash" },
    keep: { type: "int", min: 0, max: 255, def: 24, label: "Leave the outline (pixels darker than, 0 to 255)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), keep = S.p("keep"), f = S.frame, body = S.not(shaderSprite2Edge(S, c, keep));
    const near = function (r2, rmin2) {
      return S.or.apply(null, shaderDisc(r2, rmin2).map(function (o) { return shaderSprite2Edge(S, S.tex(o[0], o[1]), keep); }));
    };
    const w = S.add(1, S.div(S.mul(f, 3), 18));                                         // 1, 2, 3 over the build
    const ring = S.or(near(1), S.and(S.ge(w, 2), near(4, 1)), S.and(S.ge(w, 3), near(9, 4)));
    const level = S.min(4, S.add(S.table([1, 2, 3, 4, 3, 2], S.mod(f, 6)), S.div(f, 9)));
    return S.pick([
      [S.not(body), c],
      [S.and(S.ge(f, 18), S.lt(f, 20)), S.p("flash")],
      [S.and(S.lt(f, 18), ring, shaderSpriteCover(S, level)), S.p("glow")],
    ], c);
  },
};

// ======================================================================================================================
// SCREEN SET (round 1c): CrunchyShader, 2026-10-14, written by a roster agent in wip/shader-screen3.js, merged by Grout
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1c, screen effects (SHADER.md §2.6). Loaded after shader.js; Grout merges it in.
// Screen effects, all integer, all stepped:
//   WORLD: fireflies (soft-blinking lights on hashed drifting paths), leaves (falling, swaying, 2-3 palette colors),
//          sandstorm (a warm haze, sand streaks blowing sideways at two speeds)
//   TRANSITIONS: checker (a checkerboard wipe, cells filling from their centers in a staggered order)
// Private helpers are shaderScreen3*.

SHADER_EFFECTS.push("fireflies", "leaves", "sandstorm", "checker");

// ---- helpers ------------------------------------------------------------------------------------------------------------
// a triangle wave of period P (a multiple of 4): phase (any int) -> -P/4 .. P/4
function shaderScreen3Tri(S, phase, P) { return S.sub(P / 4, S.abs(S.sub(S.mod(S.add(phase, P / 4), P), P / 2))); }
function shaderScreen3ScaleC(S, c, num, den) {   // every channel times num / den (alpha kept)
  return S.rgba(S.div(S.mul(S.r(c), num), den), S.div(S.mul(S.g(c), num), den), S.div(S.mul(S.b(c), num), den), S.a(c));
}

// ============================================================================================================== WORLD

// FIREFLIES: one possible light per 16 x 16 cell, drifting on a hashed loop (a triangle wave each way, own phases),
// blinking: off, a dim pixel, then a bright core with a soft plus of glow round it. 32 frames close every path.
SHADER_DEFS.fireflies = {
  label: "Fireflies", title: "soft-blinking lights drifting on looping paths",
  group: "World", kind: "screen", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  params: {
    density: { type: "int", min: 0, max: 100, def: 30, label: "Fireflies (% of cells)" },
    drift: { type: "int", min: 0, max: 4, def: 3, label: "Drift (px)" },
    core: { type: "colour", def: "#f4ffa0", label: "Light" },
    glow: { type: "colour", def: "#8cc43c", label: "Glow" },
    seed: { type: "int", min: 0, max: 999, def: 4, label: "Seed" },
  },
  fragment: function (S) {
    const C = 16, seed = S.p("seed"), d = S.p("drift");
    const cx = S.div(S.x, C), cy = S.div(S.y, C), lx = S.mod(S.x, C), ly = S.mod(S.y, C);
    const n = S.hash(cx, cy, seed), has = S.lt(S.mod(n, 100), S.p("density"));
    const fx = S.add(5, S.mod(S.div(n, 100), 6)), fy = S.add(5, S.mod(S.div(n, 7), 6));
    const ox = S.div(S.mul(shaderScreen3Tri(S, S.add(S.frame, S.hash(n, 1)), 32), d), 8);
    const oy = S.div(S.mul(shaderScreen3Tri(S, S.add(S.mul(S.frame, 2), S.hash(n, 2)), 32), d), 16);
    const dx = S.sub(lx, S.add(fx, ox)), dy = S.sub(ly, S.add(fy, oy));
    const ph = S.mod(S.add(S.frame, S.hash(n, 3)), 32);               // 0..11 dark, 12..15 dim, 16..25 bright, 26..31 dim
    const bright = S.and(S.ge(ph, 16), S.lt(ph, 26)), lit = S.ge(ph, 12);
    const centre = S.and(S.eq(dx, 0), S.eq(dy, 0)), plus = S.eq(S.add(S.abs(dx), S.abs(dy)), 1);
    return S.pick([
      [S.and(has, bright, centre), S.p("core")],
      [S.and(has, bright, plus), S.p("glow")],
      [S.and(has, lit, centre), S.p("glow")],
    ], S.tex(0, 0));
  },
};

// LEAVES: one possible leaf per 16 x 16 cell, the field falling a pixel a frame (64 px over the 64-frame loop), each
// row swaying on its own phase; a leaf tilts with the way it swings (a 3 x 2 sliver either way), colored from the palette.
SHADER_DEFS.leaves = {
  label: "Falling leaves", title: "leaves fall in a few colors, swaying and tilting as they go",
  group: "World", kind: "screen", frames: 64, fps: 10, pad: [0, 0, 0, 0],
  params: {
    density: { type: "int", min: 0, max: 100, def: 28, label: "Leaves (% of cells)" },
    sway: { type: "int", min: 0, max: 3, def: 2, label: "Sway (px)" },
    colours: { type: "palette", def: ["#c8641e", "#e0a42a", "#9a3a1c"], max: 4, label: "Leaf colors" },
    seed: { type: "int", min: 0, max: 999, def: 9, label: "Seed" },
  },
  fragment: function (S) {
    const C = 16, PH = 64, seed = S.p("seed"), amp = S.p("sway");
    const sy = S.mod(S.sub(S.y, S.frame), PH), cy = S.div(sy, C), ly = S.mod(sy, C);
    const t = S.mod(S.add(S.frame, S.hash(cy, seed, 5)), 32);           // two sways a loop
    const sw = S.div(S.mul(shaderScreen3Tri(S, t, 32), amp), 8);       // -amp .. amp
    const rising = S.lt(t, 16);
    const xx = S.sub(S.x, sw), cx = S.div(xx, C), lx = S.mod(xx, C);
    const n = S.hash(cx, cy, seed), has = S.lt(S.mod(n, 100), S.p("density"));
    const fx = S.add(3, S.mod(S.div(n, 100), 8)), fy = S.mod(S.div(n, 7), C - 1);
    const dx = S.sub(lx, fx), dy = S.sub(ly, fy);
    // tilt one way: row 0 = x 1,2 / row 1 = x 0,1; the other way mirrored
    const lo = S.sel(rising, S.sub(1, dy), dy);
    const on = S.and(has, S.ge(dy, 0), S.le(dy, 1), S.ge(dx, lo), S.le(dx, S.add(lo, 1)));
    const col = S.palAt("colours", S.mod(S.div(n, 1000), S.palCount("colours")));
    return S.sel(on, col, S.tex(0, 0));
  },
};

// SANDSTORM: the scene hazed towards a warm tint, with sand streaks blowing sideways in two layers (far: slow, short,
// half-blended; near: fast, long, solid). 32 frames: the far layer moves 128 px, the near 256, both whole periods.
function shaderScreen3Streak(S, xs, sp, len, salt) {
  const seed = S.add(S.p("seed"), salt);
  const row = S.hash(S.y, seed, 1);
  const u = S.add(S.sub(xs, S.mul(S.frame, sp)), row);
  const id = S.mod(S.div(u, 64), 2), lu = S.mod(u, 64);
  const h = S.hash(S.y, id, seed);
  const L = S.add(len, S.mod(S.div(h, 100), len));
  return S.and(S.lt(S.mod(h, 100), S.p("density")), S.lt(lu, L));
}
SHADER_DEFS.sandstorm = {
  label: "Sandstorm", title: "a warm haze with streaks of sand blowing sideways at two speeds",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  params: {
    density: { type: "int", min: 0, max: 100, def: 30, label: "Sand streaks (% of rows)" },
    haze: { type: "int", min: 0, max: 100, def: 35, label: "Haze (%)" },
    tint: { type: "colour", def: "#c8964e", label: "Haze color" },
    sand: { type: "colour", def: "#ecc884", label: "Sand" },
    dir: { type: "int", min: 0, max: 1, def: 0, label: "Blowing", choices: ["to the right", "to the left"] },
    seed: { type: "int", min: 0, max: 999, def: 3, label: "Seed" },
  },
  fragment: function (S) {
    const xs = S.sel(S.eq(S.p("dir"), 1), S.neg(S.x), S.x);
    const near = shaderScreen3Streak(S, xs, 8, 6, 100), far = shaderScreen3Streak(S, xs, 4, 3, 0);
    const base = S.mixc(S.tex(0, 0), S.p("tint"), S.p("haze"), 100);
    return S.pick([[near, S.p("sand")], [far, S.mixc(base, S.p("sand"), 1, 2)]], base);
  },
};

// ======================================================================================================== TRANSITIONS

// CHECKER: a checkerboard wipe. One color of the board fills first, then the other, the cells of each in a shuffled
// order, every cell growing from its center as a square.
SHADER_DEFS.checker = {
  label: "Checker wipe", title: "a checkerboard fills in, one color of squares then the other, in a shuffled order",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: { type: "int", min: -1, max: 100, def: -1, label: "Progress (-1 plays on time)" },
    cover: { type: "colour", def: "#000000", label: "Cover" },
    cell: { type: "int", min: 4, max: 32, def: 8, label: "Square size (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Seed (the order)" },
  },
  fragment: function (S) {
    const N = S.p("cell"), cx = S.div(S.x, N), cy = S.div(S.y, N);
    const parity = S.mod(S.add(cx, cy), 2);
    const order = S.add(S.mul(parity, 8), S.mod(S.hash(cx, cy, S.p("seed")), 8));      // 0..15
    const d = S.max(S.abs(S.sub(S.mul(S.mod(S.x, N), 2), S.sub(N, 1))), S.abs(S.sub(S.mul(S.mod(S.y, N), 2), S.sub(N, 1))));
    const lag = S.mul(N, 2);                                                          // d < N everywhere in a cell
    const reach = S.sub(S.div(S.mul(S.progress(), S.add(N, lag)), 100), S.div(S.mul(order, lag), 16));
    return S.sel(S.lt(d, reach), S.p("cover"), S.tex(0, 0));
  },
};

// ======================================================================================================================
// SPRITE SET (round 1c): CrunchyShader, 2026-10-14, written by a roster agent in wip/shader-sprite3.js, merged by Grout
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1c, group "Sprite FX" extras (a roster agent's file; Grout merges it into shader.js).
// A classic script loaded AFTER shader.js (it uses shaderTri, shaderDisc, shaderSpriteRamp and shaderSpriteCover from there).
// Every effect runs on ONE sprite's texture (kind "sprite").
//
//   gold       Midas touch: brightness onto a gold ramp, a glint band sweeping across, then rest     strict
//   burn       charring creeps in from the edges and back, an ember rim, embers rising above          strict
//   wet        darkened, with drips running down the body and falling below the bottom edge          free
//   invisible  only a shimmering 1 px edge, displaced by a traveling wave; the inside is clear      strict

SHADER_EFFECTS.push("gold", "burn", "wet", "invisible");

// within r steps (r 0..3, an int node) of a clear pixel: rings of shaderDisc, nearest first
function shaderSprite3Zone(S, r) {
  const ring = function (r2, rmin2) {
    return S.or.apply(null, shaderDisc(r2, rmin2).map(function (o) { return S.not(S.solid(S.tex(o[0], o[1]))); }));
  };
  return S.or(S.and(S.ge(r, 1), ring(1)), S.and(S.ge(r, 2), ring(4, 1)), S.and(S.ge(r, 3), ring(9, 4)));
}

// GOLD: body pixels (solid, not outline) take the gold ramp by luma. A diagonal glint band `width` wide sweeps from the
// top-left to the bottom-right over the first part of the loop and is off-sprite for the rest (the rest).
SHADER_DEFS.gold = {
  label: "Gold", title: "Midas touch: brightness onto a gold ramp, with a glint sweeping across",
  group: "Sprite FX", kind: "sprite", frames: 24, fps: 12, pad: [0, 0, 0, 0],
  params: {
    gold: { type: "palette", def: ["#4a2a0c", "#8a5414", "#c98a1c", "#efc23a", "#fff0a0"], max: 8, label: "Gold ramp (dark → light)" },
    glint: { type: "colour", def: "#ffffff", label: "Glint" },
    width: { type: "int", min: 1, max: 6, def: 2, label: "Glint width (px)" },
    keep: { type: "int", min: 0, max: 255, def: 24, label: "Leave the outline (pixels darker than, 0 to 255)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), body = S.and(S.solid(c), S.ge(S.luma(c), S.p("keep")));
    const pos = S.sub(S.div(S.mul(S.frame, S.add(S.add(S.w, S.h), 24)), 16), 8);         // swept by frame 16, then gone
    const d = S.sub(S.add(S.x, S.y), pos), glint = S.and(S.ge(d, 0), S.lt(d, S.p("width")));
    return S.pick([[S.not(body), c], [glint, S.p("glint")]], shaderSpriteRamp(S, c, "gold"));
  },
};

// BURN: a smoulder. The char reaches 0..depth px (+ a ragged 0/1 per pixel, up to 3) in from the edges and back over the
// loop; charred pixels take the char ramp by luma; the innermost charred ring glows with flickering embers. Embers rise
// through the clear pixels above the sprite (only within 6 px of a solid pixel below, the pad).
SHADER_DEFS.burn = {
  label: "Burn", title: "charring creeps in from the edges, with embers rising, as a smoulder",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 8, pad: [6, 0, 0, 0],
  params: {
    char: { type: "palette", def: ["#140c0c", "#2a1a16", "#46281c"], max: 8, label: "Char ramp (dark → light)" },
    embers: { type: "palette", def: ["#ff5a14", "#ffa82a", "#ffe066"], max: 8, label: "Embers" },
    depth: { type: "int", min: 0, max: 2, def: 2, label: "Creeps in (px)" },
    rising: { type: "int", min: 0, max: 40, def: 8, label: "Rising embers (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), solid = S.solid(c);
    const w = S.min(3, S.add(shaderTri(S, S.p("depth")), S.mod(S.hash(S.x, S.y, 3), 2)));
    const charred = shaderSprite3Zone(S, w), inner = S.not(shaderSprite3Zone(S, S.sub(w, 1)));
    const n = S.palCount("embers");
    const flick = S.hash(S.x, S.y, S.frame);
    const ember = S.palAt("embers", S.mod(flick, n));
    // rising: a hash over (x, y + frame) mod 16 moves one row up per frame and closes the 16-frame loop
    const rh = S.hash(S.x, S.mod(S.add(S.y, S.frame), 16), 11);
    const below = [];
    for (let k = 1; k <= 6; k++) below.push(S.solid(S.tex(0, k)));
    const rise = S.and(S.not(solid), S.or.apply(null, below), S.lt(S.mod(rh, 100), S.p("rising")));
    return S.pick([
      [rise, S.palAt("embers", S.mod(S.div(rh, 100), n))],
      [S.not(solid), c],
      [S.and(charred, inner, S.ne(S.mod(flick, 3), 0)), ember],
      [charred, shaderSpriteRamp(S, c, "char")],
    ], c);
  },
};

// WET: the body darkened by `dark` %. In `drips` % of columns a drop runs down the full height once a loop (each column
// its own phase): a 2 px head in the drop color with a 3 px streak of half drop above it on the body. Below the body
// (clear, with a solid pixel within 8 px above) only the head shows: it falls off the bottom edge into the pad.
SHADER_DEFS.wet = {
  label: "Wet", title: "darkened, with drips running down and falling from the bottom",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 8, 0],
  params: {
    dark: { type: "int", min: 0, max: 80, def: 30, label: "Darken (%)" },
    drips: { type: "int", min: 0, max: 100, def: 18, label: "Drips (% of columns)" },
    drop: { type: "colour", def: "#bfe6ff", label: "Water" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), solid = S.solid(c), keep = S.sub(100, S.p("dark"));
    const darkc = S.rgba(S.div(S.mul(S.r(c), keep), 100), S.div(S.mul(S.g(c), keep), 100), S.div(S.mul(S.b(c), keep), 100), 255);
    const hx = S.hash(S.x, 7);
    const col = S.lt(S.mod(hx, 100), S.p("drips"));
    const t = S.mod(S.add(S.frame, S.div(hx, 100)), 16);
    const yd = S.div(S.mul(t, S.add(S.h, 4)), 16), d = S.sub(yd, S.y);              // d 0..1 head, 2..4 streak
    const head = S.and(col, S.ge(d, 0), S.le(d, 1)), streak = S.and(col, S.ge(d, 2), S.le(d, 4));
    const above = [];
    for (let k = 1; k <= 8; k++) above.push(S.solid(S.tex(0, -k)));
    const dp = S.p("drop");
    return S.pick([
      [S.and(solid, head), dp],
      [S.and(solid, streak), S.mixc(darkc, dp, 1, 2)],
      [solid, darkc],
      [S.and(head, S.or.apply(null, above)), dp],
    ], c);
  },
};

// INVISIBLE: the sprite's inner edge (solid pixels with a clear 4-neighbor), read 1 px sideways by a wave that travels
// down the rows, drawn in a shimmer palette whose colors run along the diagonal; everything else is clear.
SHADER_DEFS.invisible = {
  label: "Invisible", title: "only a shimmering, refracting outline; the inside shows what's behind",
  group: "Sprite FX", kind: "sprite", frames: 8, fps: 10, pad: [0, 1, 0, 1],
  params: {
    shimmer: { type: "palette", def: ["#9fd8ff", "#e8f8ff", "#6aa8d8"], max: 8, label: "Shimmer" },
    show: { type: "int", min: 1, max: 4, def: 4, label: "Edge shown (quarters of the pixels)" },
  },
  fragment: function (S) {
    const wave = S.table([0, 0, 1, 1, 0, 0, -1, -1], S.mod(S.sub(S.div(S.y, 2), S.frame), 8));
    const sx = S.add(S.x, wave);
    const at = function (dx, dy) { return S.solid(S.texAt(S.add(sx, dx), S.add(S.y, dy))); };
    const edge = S.and(at(0, 0), S.or(S.not(at(1, 0)), S.not(at(-1, 0)), S.not(at(0, 1)), S.not(at(0, -1))));
    const n = S.palCount("shimmer");
    const col = S.palAt("shimmer", S.mod(S.add(S.div(S.add(S.x, S.y), 3), S.div(S.mul(S.frame, n), S.FRAMES)), n));
    return S.sel(S.and(edge, shaderSpriteCover(S, S.p("show"))), col, S.clear);
  },
};

// ======================================================================================================================
// SCREEN SET (round 1d): CrunchyShader, 2026-10-14, written by a roster agent in wip/shader-screen4.js, merged by Grout
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1d, screen effects (SHADER.md §2.6). Loaded after shader.js; Grout merges it in.
//   WORLD: embers (ash and embers drifting up, 1 px, a 3-color palette), bubbles (small hollow bubbles rising, wobbling)
//   LOOKS: vignette (the corners darkened toward a color in 4 x 4 dithered steps)
//   TRANSITIONS: curtain (stage curtains close from both sides, folds striped across them)
// Private helpers are shaderScreen4*.

SHADER_EFFECTS.push("embers", "bubbles", "vignette", "curtain");

// a triangle wave of period P (a multiple of 4): phase (any int) -> -P/4 .. P/4
function shaderScreen4Tri(S, phase, P) { return S.sub(P / 4, S.abs(S.sub(S.mod(S.add(phase, P / 4), P), P / 2))); }

// ============================================================================================================== WORLD

// EMBERS: one possible speck per 8 x 8 cell of a field scrolling up a pixel a frame (32 px over the 32-frame loop); each
// speck sways on its own phase and takes a palette color (ash, ember, spark).
SHADER_DEFS.embers = {
  label: "Embers", title: "ash and embers drifting up, swaying as they rise",
  group: "World", kind: "screen", frames: 32, fps: 10, pad: [0, 0, 0, 0],
  params: {
    density: { type: "int", min: 0, max: 100, def: 30, label: "Embers (% of cells)" },
    sway: { type: "int", min: 0, max: 2, def: 1, label: "Sway (px)" },
    colours: { type: "palette", def: ["#5a5050", "#e0541c", "#ffc040"], max: 4, label: "Ash, ember, spark" },
    seed: { type: "int", min: 0, max: 999, def: 7, label: "Seed" },
  },
  fragment: function (S) {
    const C = 8, PH = 32, seed = S.p("seed");
    const sy = S.mod(S.add(S.y, S.frame), PH), cy = S.div(sy, C), ly = S.mod(sy, C);
    const cx = S.div(S.x, C), lx = S.mod(S.x, C);
    const n = S.hash(cx, cy, seed), has = S.lt(S.mod(n, 100), S.p("density"));
    const sw = S.div(S.mul(shaderScreen4Tri(S, S.add(S.frame, S.hash(n, 1)), 32), S.p("sway")), 8);   // -sway .. sway
    const fx = S.add(2, S.mod(S.div(n, 100), 4)), fy = S.mod(S.div(n, 7), C);
    const on = S.and(has, S.eq(lx, S.add(fx, sw)), S.eq(ly, fy));
    return S.sel(on, S.palAt("colours", S.mod(S.div(n, 1000), S.palCount("colours"))), S.tex(0, 0));
  },
};

// BUBBLES: one possible bubble per 16 x 16 cell of a field rising a pixel a frame (64 px over 64 frames); a hollow ring
// size x size with the corners cut, its top rim's first pixel the shine, wobbling 1 px side to side on its own phase.
SHADER_DEFS.bubbles = {
  label: "Bubbles", title: "small hollow bubbles rising and wobbling",
  group: "World", kind: "screen", frames: 64, fps: 12, pad: [0, 0, 0, 0],
  params: {
    density: { type: "int", min: 0, max: 100, def: 45, label: "Bubbles (% of cells)" },
    size: { type: "int", min: 3, max: 4, def: 3, label: "Size (px)" },
    rim: { type: "colour", def: "#bfe8ff", label: "Rim" },
    shine: { type: "colour", def: "#ffffff", label: "Shine" },
    seed: { type: "int", min: 0, max: 999, def: 5, label: "Seed" },
  },
  fragment: function (S) {
    const C = 16, PH = 64, seed = S.p("seed"), hi = S.sub(S.p("size"), 1);
    const sy = S.mod(S.add(S.y, S.frame), PH), cy = S.div(sy, C), ly = S.mod(sy, C);
    const cx = S.div(S.x, C), lx = S.mod(S.x, C);
    const n = S.hash(cx, cy, seed), has = S.lt(S.mod(n, 100), S.p("density"));
    const sw = S.div(shaderScreen4Tri(S, S.add(S.frame, S.hash(n, 2)), 16), 4);                    // -1 .. 1
    const dx = S.sub(lx, S.add(S.add(4, S.mod(S.div(n, 100), 7)), sw)), dy = S.sub(ly, S.add(2, S.mod(S.div(n, 7), 10)));
    const inBox = S.and(S.ge(dx, 0), S.le(dx, hi), S.ge(dy, 0), S.le(dy, hi));
    const ex = S.or(S.eq(dx, 0), S.eq(dx, hi)), ey = S.or(S.eq(dy, 0), S.eq(dy, hi));
    const ring = S.and(has, inBox, S.or(ex, ey), S.not(S.and(ex, ey)));
    const shine = S.and(S.eq(dx, 1), S.eq(dy, 0));                                            // the top rim's first pixel
    return S.pick([[S.and(ring, shine), S.p("shine")], [ring, S.p("rim")]], S.tex(0, 0));
  },
};

// ============================================================================================================== LOOKS

// VIGNETTE: a roundish distance from the center (0 at the middle, 100 at the corners' reach); past `size` the cover
// creeps in, in quarter steps up to `strength`, each step a 4 x 4 Bayer dither of the color over the picture.
SHADER_DEFS.vignette = {
  label: "Vignette", title: "the corners darkened toward a color in dithered steps",
  group: "Looks", kind: "screen", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  params: {
    strength: { type: "int", min: 0, max: 100, def: 75, label: "Strength (%)" },
    size: { type: "int", min: 0, max: 90, def: 40, label: "Clear middle (%)" },
    cover: { type: "colour", def: "#000000", label: "Toward" },
    shape: { type: "int", min: 0, max: 3, def: 0, label: "Shape", choices: ["round", "box", "top and bottom", "the sides"] },
    steps: { type: "int", min: 0, max: 1, def: 0, label: "Falloff", choices: ["four bands", "a smooth dither"] },
    pattern: { type: "int", min: 0, max: 3, def: 0, label: "Dither pattern", choices: SHADER_DITHER_NAMES.slice() },
  },
  fragment: function (S) {
    // build 7: shape (the distance: roundish as before, the box's, rows only, columns only), steps (four quarter bands
    // as before, or every 16th of the way), pattern (shaderDither16; 0 the Bayer as before)
    const dx = S.div(S.mul(S.abs(S.sub(S.mul(S.x, 2), S.sub(S.w, 1))), 100), S.max(S.w, 1));
    const dy = S.div(S.mul(S.abs(S.sub(S.mul(S.y, 2), S.sub(S.h, 1))), 100), S.max(S.h, 1));
    const shp = S.p("shape");
    const d = S.pick([[S.eq(shp, 1), S.max(dx, dy)], [S.eq(shp, 2), dy], [S.eq(shp, 3), dx]],
      S.add(S.div(S.max(dx, dy), 2), S.div(S.add(dx, dy), 4)));                       // 0 .. 100
    const sz = S.p("size");
    const t = S.clamp(S.div(S.mul(S.sub(d, sz), 100), S.max(S.sub(100, sz), 1)), 0, 100);
    const tt = S.div(S.mul(t, S.p("strength")), 100);
    const cov = S.sel(S.eq(S.p("steps"), 1), S.div(S.mul(tt, 16), 100), S.mul(S.div(tt, 25), 4));   // of 16
    const b = shaderDither16(S, S.p("pattern"), S.x, S.y);
    return S.sel(S.lt(b, cov), S.p("cover"), S.tex(0, 0));
  },
};

// ======================================================================================================== TRANSITIONS

// CURTAIN: two curtains slide in from the sides and meet in the middle. The folds (a shade stripe and a lighter one
// every `fold` px) travel with the cloth, measured from each leading hem; the hem itself is shade. At 100 the curtains
// have met and the folds flatten: one color everywhere.
SHADER_DEFS.curtain = {
  label: "Curtain", title: "stage curtains close from both sides, their folds striped down them",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: { type: "int", min: -1, max: 100, def: -1, label: "Progress (-1 plays on time)" },
    cover: { type: "colour", def: "#8a1426", label: "Curtain" },
    shade: { type: "colour", def: "#4a0a16", label: "Folds" },
    fold: { type: "int", min: 4, max: 16, def: 6, label: "Fold width (px)" },
  },
  fragment: function (S) {
    const p = S.progress(), reach = S.div(S.mul(p, S.add(S.w, 1)), 200);
    const left = S.lt(S.x, reach), right = S.ge(S.x, S.sub(S.w, reach));
    const u = S.sel(left, S.sub(S.sub(reach, 1), S.x), S.sub(S.x, S.sub(S.w, reach)));   // 0 at each hem
    const f = S.p("fold"), m = S.mod(u, f);
    const folded = S.and(S.lt(p, 100), S.or(S.eq(u, 0), S.eq(m, S.div(f, 2))));
    return S.pick([[S.and(S.or(left, right), folded), S.p("shade")], [S.or(left, right), S.p("cover")]], S.tex(0, 0));
  },
};

// ======================================================================================================================
// SPRITE SET (round 1d): CrunchyShader, 2026-10-14, written by a roster agent in wip/shader-sprite4.js, merged by Grout
// ======================================================================================================================
// crunchyCore wip: CrunchyShader round 1d, group "Sprite FX" extras (a roster agent's file; Grout merges it into shader.js).
// A classic script loaded AFTER shader.js (it uses shaderDisc, shaderWorldBayer and shaderWorldProgress from there).
// Every effect runs on ONE sprite's texture (kind "sprite").
//
//   shock     cartoon electrocution: odd frames flash an inverted (skeletal) ramp, a crackle outline     strict
//   spawn     materialize: rows build up from the bottom behind a bright scanline (100 = not there yet)  strict
//   aura      a dark flickering aura 1-2 px round the silhouette, drifting up                          strict
//   fadeout   the sprite dithers away through a 4 x 4 Bayer matrix (100 = clear)                        strict

SHADER_EFFECTS.push("shock", "spawn", "aura", "fadeout");

// any solid pixel at the offsets, read from (x, y + dy0)
function shaderSprite4Near(S, offsets, dy0) {
  return S.or.apply(null, offsets.map(function (o) { return S.solid(S.texAt(S.add(S.x, o[0]), S.add(S.add(S.y, dy0), o[1]))); }));
}

// SHOCK: frames alternate plain / flash. A flash frame maps luma onto the x-ray ramp INVERTED (dark parts light up, as
// a cartoon skeleton). Every frame, `crackle` % of the clear pixels touching the sprite (8-neighbors) spark in the bolt
// color, a fresh pattern each frame.
SHADER_DEFS.shock = {
  label: "Shock", title: "a cartoon electrocution: flashing an inverted x-ray, with a crackling outline",
  group: "Sprite FX", kind: "sprite", frames: 8, fps: 12, pad: [1, 1, 1, 1],
  params: {
    xray: { type: "palette", def: ["#101018", "#3a4a8a", "#9ad0ff", "#ffffff"], max: 8, label: "Flash ramp (dark → light)" },
    bolt: { type: "colour", def: "#fff35a", label: "Crackle" },
    crackle: { type: "int", min: 0, max: 100, def: 40, label: "Crackle (% of the outline)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), solid = S.solid(c), n = S.palCount("xray");
    const flash = S.eq(S.mod(S.frame, 2), 1);
    const inv = S.palAt("xray", S.sub(S.sub(n, 1), S.div(S.mul(S.luma(c), n), 256)));
    const ring = shaderSprite4Near(S, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]], 0);
    const spark = S.and(S.not(solid), ring, S.lt(S.mod(S.hash(S.x, S.y, S.add(S.frame, 5)), 100), S.p("crackle")));
    return S.pick([[spark, S.p("bolt")], [S.and(solid, flash), inv]], c);
  },
};

// SPAWN: a transition run BACKWARDS by a game (progress 100 → 0 materializes it). Rows from the cut down are shown; the
// cut moves from the top (0: all shown) to below the bottom (100: nothing, all clear). The sprite's pixels on the row
// just above the cut are the scanline, flickering between the beam's colors.
SHADER_DEFS.spawn = {
  label: "Spawn", title: "materialize: built up from the bottom row by row behind a bright scanline (play 100 → 0)",
  group: "Sprite FX", kind: "sprite", transition: "covered", frames: 16, fps: 12, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    beam: { type: "palette", def: ["#ffffff", "#9af0ff"], max: 8, label: "Scanline" },
    thick: { type: "int", min: 1, max: 4, def: 1, label: "Scanline (rows)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), cut = S.div(S.mul(S.progress(), S.add(S.h, 1)), 100);
    const line = S.and(S.solid(c), S.lt(S.y, cut), S.ge(S.y, S.sub(cut, S.p("thick"))), S.lt(S.progress(), 100));
    const beam = S.palAt("beam", S.mod(S.hash(S.x, S.y, S.frame), S.palCount("beam")));
    return S.pick([[line, beam], [S.lt(S.y, cut), S.clear]], c);
  },
};

// AURA: clear pixels within `size` px (1 or 2, a disc) of the sprite, read 0 or 1 px lower as the loop goes (so it
// drifts up), show `thick` % of the time (a fresh flicker each frame; the outer ring half as often), in the aura palette.
SHADER_DEFS.aura = {
  label: "Aura", title: "a dark, flickering aura round the silhouette, rising slightly",
  group: "Sprite FX", kind: "sprite", frames: 8, fps: 8, pad: [3, 2, 2, 2],
  params: {
    aura: { type: "palette", def: ["#1a0826", "#3c1458", "#6a2a8a"], max: 8, label: "Aura" },
    size: { type: "int", min: 1, max: 2, def: 2, label: "Reach (px)" },
    thick: { type: "int", min: 0, max: 100, def: 70, label: "Flicker (% shown)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), rise = S.table([0, 0, 0, 1, 1, 1, 1, 0], S.frame);
    const inner = shaderSprite4Near(S, shaderDisc(2), rise);
    const outer = S.and(S.eq(S.p("size"), 2), shaderSprite4Near(S, shaderDisc(5, 2), rise));
    const h = S.hash(S.x, S.y, S.add(S.frame, 17)), roll = S.mod(h, 100);
    const show = S.or(S.and(inner, S.lt(roll, S.p("thick"))), S.and(outer, S.lt(S.mul(roll, 2), S.p("thick"))));
    return S.sel(S.and(S.not(S.solid(c)), show), S.palAt("aura", S.mod(S.div(h, 100), S.palCount("aura"))), c);
  },
};

// FADE OUT: a pixel goes clear once progress passes its Bayer 4 x 4 threshold, cells `cell` px; `lead` > 0 makes the
// top go first (each row `lead` % ahead of the row below, measured from the bottom). 100 = all clear.
SHADER_DEFS.fadeout = {
  label: "Fade out", title: "the sprite dithers away through a 4 x 4 Bayer pattern",
  group: "Sprite FX", kind: "sprite", transition: "covered", frames: 16, fps: 12, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cell: { type: "int", min: 1, max: 4, def: 1, label: "Dither pixel size" },
    lead: { type: "int", min: 0, max: 10, def: 0, label: "Top first (% per row)" },
  },
  fragment: function (S) {
    const s = S.p("cell"), t = shaderWorldBayer(S, S.div(S.x, s), S.div(S.y, s));
    const p = S.progress(), skew = S.mul(S.sub(S.sub(S.h, 1), S.y), S.p("lead"));
    // progress stretched so the bottom row still clears at 100 and 0 stays plain
    const q = S.sel(S.ge(p, 100), 1000, S.add(p, S.div(S.mul(skew, p), 100)));
    return S.sel(S.lt(S.div(S.mul(t, 100), 16), q), S.clear, S.tex(0, 0));
  },
};

// ======================================================================================================================
// THE PLAYFUL BATCH (build 6, 2026-10-16): AJ, "these tools shouldn't be all business … goofy and silly are a bit of a
// goal". Eight effects, data only, on the same IR and conventions as the rest. Private helpers are shaderFun*.
//   jelly    squash and stretch that wobbles and settles (a landing), whole pixels, anchored     Sprite FX  strict
//   boil     line boil: patches of the picture jitter a pixel, redrawn a few times a loop        Looks      strict
//   melt     the sprite droops and drips down in ragged columns, then pulls itself together      Sprite FX  strict
//   bonk     a cartoon hit: a white flash, a photo-negative frame, a knock and a wobble          Sprite FX  free
//   cutout   a paper cutout (a paper border, a cast shadow) jiggled about like stop motion       Sprite FX  strict
//   woozy    the screen sways and swims and sees double                                          World      free
//   crosswire "wrong channel": areas swap color channels or trade colors with other areas      Looks      free
//   disco    colored spotlights sweep about a dimmed screen (redrawn in build 7)                World      free
// `tags` (app-only search words, SHADER-DESIGN §3) say which are the silly ones.
// ======================================================================================================================

SHADER_EFFECTS.push("jelly", "boil", "melt", "bonk", "cutout", "woozy", "crosswire", "disco");

// v * num / den rounded half away from zero (den > 0; nodes or ints): symmetric, so a wobble leans neither way
function shaderFunScale(S, v, num, den) {
  const m = S.div(S.add(S.mul(S.abs(v), num), S.div(den, 2)), den);
  return S.sel(S.lt(v, 0), S.neg(m), m);
}
// a box of n px stretched to n2 px about a DOUBLED anchor a2 (2 x an edge, or lo + hi for the middle): the source
// coordinate of output pixel v, measured at pixel centers (n2 = n is the identity, exactly)
function shaderFunStretch(S, v, a2, n, n2) {
  const m = S.max(n2, 1);
  return S.div(S.add(S.mul(a2, m), S.mul(S.sub(S.add(S.mul(v, 2), 1), a2), n)), S.mul(m, 2));
}
// sin(2 pi k / 32) x 1000
const SHADER_FUN_SIN32 = [0, 195, 383, 556, 707, 831, 924, 981, 1000, 981, 924, 831, 707, 556, 383, 195,
  0, -195, -383, -556, -707, -831, -924, -981, -1000, -981, -924, -831, -707, -556, -383, -195];

// JELLY: frame 0 rests; then the sprite squashes (wider and shorter: `squish` px off its height, half that on each
// side), springs back past it into a stretch, and wobbles `wobble` more times, smaller each time, until it settles. The
// shape is a table per wobble count in eighths of `squish`; `start` 1 flips it (a jump: stretch first). Whole pixels,
// nearest; the feet (or the middle) stay put. A game plays it once on a landing (frame_override, or restart the clock).
SHADER_DEFS.jelly = {
  label: "Jelly", title: "a squash and a stretch that wobbles and settles, as on landing",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 20, pad: [6, 3, 3, 3], still0: true,
  tags: ["silly", "cartoon", "squash", "stretch", "bounce", "boing", "wobble", "land", "jump", "jiggle"],
  params: {
    squish: { type: "int", min: 1, max: 6, def: 3, label: "Squash (px at the most)" },
    wobble: { type: "int", min: 0, max: 3, def: 2, label: "Wobbles before it settles" },
    anchor: { type: "int", min: 0, max: 1, def: 0, label: "Squashes toward", choices: ["the feet", "the middle"] },
    start: { type: "int", min: 0, max: 1, def: 0, label: "First", choices: ["squash (a landing)", "stretch (a jump)"] },
  },
  fragment: function (S) {
    const PT = 6, PR = 3, PB = 3, PL = 3;
    const SHAPE = [
      0, -8, -5, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, -8, -4, 2, 5, 3, 1, -1, -1, 0, 0, 0, 0, 0, 0, 0,
      0, -8, -4, 3, 6, 3, -2, -4, -2, 1, 2, 1, 0, 0, 0, 0,
      0, -8, -3, 4, 7, 3, -3, -5, -3, 2, 4, 2, -1, -2, -1, 0];
    const s8 = S.table(SHAPE, S.add(S.mul(S.p("wobble"), 16), S.frame));
    const d = shaderFunScale(S, S.sel(S.eq(S.p("start"), 1), S.neg(s8), s8), S.p("squish"), 8);   // + taller, - squashed
    const B = S.sub(S.h, PB), H = S.sub(B, PT), R = S.sub(S.w, PR), W = S.sub(R, PL);
    const side = shaderFunScale(S, d, 1, 2);
    const ay = S.sel(S.eq(S.p("anchor"), 1), S.add(B, PT), S.mul(B, 2));
    const sy = shaderFunStretch(S, S.y, ay, H, S.add(H, d));
    const sx = shaderFunStretch(S, S.x, S.add(R, PL), W, S.sub(W, S.mul(side, 2)));
    return S.texAt(sx, sy);
  },
};

// LINE BOIL: the picture cut into `cell`-px squares (the grid shifted each drawing); `wiggle` % of them are drawn a
// pixel off in a hashed direction. `drawings` different drawings share the 12-frame loop, each held for 12 / drawings
// frames (animation on twos, threes, fours), so the outlines crawl as a hand-drawn cel's do. Reads clamp to the edge, so
// a screen keeps its border; on a sprite the 1 px margin is clear.
SHADER_DEFS.boil = {
  label: "Line boil", title: "the lines jitter like hand-drawn animation, redrawn a few times a second",
  group: "Looks", kind: "both", frames: 12, fps: 12, pad: [1, 1, 1, 1],
  tags: ["silly", "cartoon", "hand drawn", "sketch", "wobble", "jitter", "squiggle", "animation"],
  params: {
    wiggle: { type: "int", min: 0, max: 100, def: 45, label: "Patches that move (%)" },
    cell: { type: "int", min: 1, max: 8, def: 3, label: "Patch size (px)" },
    drawings: { type: "int", min: 2, max: 4, def: 3, label: "Drawings in the loop" },
    seed: { type: "int", min: 0, max: 999, def: 7, label: "Seed" },
  },
  fragment: function (S) {
    const seed = S.p("seed"), n = S.p("cell");
    const pose = S.div(S.mul(S.frame, S.p("drawings")), S.FRAMES);
    const shift = S.mod(S.hash(pose, seed, 13), n);
    const h = S.hash(S.div(S.add(S.x, shift), n), S.div(S.add(S.y, shift), n), S.add(S.mul(pose, 1000), seed));
    const on = S.lt(S.mod(S.div(h, 9), 100), S.p("wiggle"));
    const dx = S.sel(on, S.sub(S.mod(h, 3), 1), 0), dy = S.sel(on, S.sub(S.mod(S.div(h, 3), 3), 1), 0);
    return S.texAt(S.add(S.x, dx), S.add(S.y, dy), "clamp");
  },
};

// MELT: frame 0 rests; over the loop the sprite droops: each column (`width` px wide) sags (`sag` % of its drop) and
// its lower part stretches down into the margin below, by up to `depth` px, the columns `ragged` % uneven (hashed), so it drips; it holds, then pulls itself
// back up faster than it fell. Whole pixels, nearest; only the sprite's own colors.
SHADER_DEFS.melt = {
  label: "Melt", title: "the sprite droops and drips down in ragged columns, then pulls itself back together",
  group: "Sprite FX", kind: "sprite", frames: 24, fps: 12, pad: [0, 0, 12, 0], still0: true,
  tags: ["silly", "cartoon", "drip", "goo", "slime", "ooze", "hot", "wax", "puddle", "liquid"],
  params: {
    depth: { type: "int", min: 2, max: 12, def: 10, label: "Longest drip (px)" },
    ragged: { type: "int", min: 0, max: 100, def: 70, label: "Ragged (%)" },
    width: { type: "int", min: 1, max: 4, def: 2, label: "Drip width (px)" },
    sag: { type: "int", min: 0, max: 100, def: 35, label: "The top sags too (%)" },
    seed: { type: "int", min: 0, max: 999, def: 3, label: "Seed" },
  },
  fragment: function (S) {
    const PB = 12;
    const m = S.table([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8, 8, 8, 8, 8, 6, 4, 2, 1, 0, 0, 0], S.frame);   // eighths
    const wc = S.sub(100, S.div(S.mul(S.p("ragged"), S.mod(S.hash(S.div(S.x, S.p("width")), S.p("seed"), 29), 101)), 100));
    const D = S.div(S.mul(S.mul(S.p("depth"), m), wc), 800);                     // this column's drop, 0 .. depth
    // every row comes down by `top`, and the lower rows by more, on a square (y / H')² up to D at the bottom: the drip
    // stretches where it hangs, the top holds its shape. y - disp(y) only rises while D < H' / 2 (D <= 12, H >= 16).
    const top = S.div(S.mul(D, S.p("sag")), 100), H2 = S.add(S.sub(S.h, PB), D);
    const disp = S.add(top, S.div(S.mul(S.sub(D, top), S.mul(S.y, S.y)), S.mul(H2, H2)));
    return S.texAt(S.x, S.sub(S.y, disp));
  },
};

// BONK: frame 0 rests. Frames 1 and 2 are the hit, in `order`: a FLASH (the body in one color; pixels darker than
// `keep` are the outline and stay) and a NEGATIVE (every color inverted, the outline too, as a cartoon's photo-negative
// frame); the hit knocks the sprite `jolt` px aside, it wobbles back over frames 3-6, then rests. Play it once.
SHADER_DEFS.bonk = {
  label: "Bonk", title: "a cartoon hit: a white flash, a photo-negative frame, a knock and a wobble",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 10, fps: 20, pad: [0, 2, 0, 2], still0: true,
  tags: ["silly", "cartoon", "hit", "hurt", "damage", "impact", "invert", "negative", "flash", "bonk"],
  params: {
    flash: { type: "colour", def: "#ffffff", label: "Flash" },
    order: { type: "int", min: 0, max: 2, def: 0, label: "The hit frames", choices: ["flash, then negative", "negative, then flash", "negative, negative"] },
    jolt: { type: "int", min: 0, max: 2, def: 1, label: "Knocked aside (px)" },
    keep: { type: "int", min: 0, max: 255, def: 24, label: "Leave the outline (pixels darker than, 0 to 255)" },
  },
  fragment: function (S) {
    const f = S.frame, order = S.p("order");
    const knock = shaderFunScale(S, S.table([0, 2, 2, -2, 2, -1, 1, 0, 0, 0], f), S.p("jolt"), 2);
    const c = S.texAt(S.sub(S.x, knock), S.y);
    const neg = S.or(S.and(S.eq(f, 1), S.ge(order, 1)), S.and(S.eq(f, 2), S.ne(order, 1)));
    const flash = S.or(S.and(S.eq(f, 1), S.eq(order, 0)), S.and(S.eq(f, 2), S.eq(order, 1)));
    const inv = S.rgba(S.sub(255, S.r(c)), S.sub(255, S.g(c)), S.sub(255, S.b(c)), 255);
    return S.pick([
      [S.not(S.solid(c)), S.clear],
      [neg, inv],
      [S.and(flash, S.ge(S.luma(c), S.p("keep"))), S.p("flash")],
    ], c);
  },
};

// PAPER CUTOUT: the sprite cut out of paper: a `border` of paper round it and the cutout's shadow `drop` px down and
// right. Every frame is a new pose, as stop motion is: the cutout jiggles by `jiggle` px and tilts (rows sheared up to
// `tilt` px at the top and bottom, a hashed way). Strict: the sprite's colors, the paper and the shadow.
SHADER_DEFS.cutout = {
  label: "Paper cutout", title: "a paper cutout with a white border and a shadow, jiggled about like stop motion",
  group: "Sprite FX", kind: "sprite", frames: 8, fps: 6, pad: [3, 7, 5, 5],
  tags: ["silly", "cartoon", "paper", "craft", "stop motion", "puppet", "sticker", "papercraft"],
  params: {
    paper: { type: "colour", def: "#f4efe2", label: "Paper" },
    shadow: { type: "colour", def: "#2b2233", label: "Shadow" },
    border: { type: "int", min: 1, max: 2, def: 1, label: "Paper border (px)" },
    drop: { type: "int", min: 0, max: 2, def: 1, label: "Shadow (px down and right; 0 none)" },
    jiggle: { type: "int", min: 0, max: 1, def: 1, label: "Jiggle (px)" },
    tilt: { type: "int", min: 0, max: 2, def: 1, label: "Tilt (px at the top)" },
    seed: { type: "int", min: 0, max: 999, def: 2, label: "Seed" },
  },
  fragment: function (S) {
    const PT = 3, PB = 5, J = S.p("jiggle"), h = S.hash(S.frame, S.p("seed"), 37);
    const jx = S.mul(S.sub(S.mod(h, 3), 1), J), jy = S.mul(S.sub(S.mod(S.div(h, 3), 3), 1), J);
    const lean = S.sub(S.mod(S.div(h, 9), 3), 1), H = S.sub(S.sub(S.h, PB), PT);
    const shear = shaderFunScale(S, S.mul(S.mul(lean, S.p("tilt")), S.sub(S.add(S.sub(S.h, PB), PT), S.add(S.mul(S.y, 2), 1))), 1, H);
    const u = S.sub(S.sub(S.x, jx), shear), v = S.sub(S.y, jy);
    const wide = S.eq(S.p("border"), 2), ring1 = shaderDisc(2), ring2 = shaderDisc(5, 2);
    const shape = function (du, dv) {
      const at = function (o) { return S.solid(S.texAt(S.add(S.add(u, du), o[0]), S.add(S.add(v, dv), o[1]))); };
      return S.or(S.or.apply(null, [[0, 0]].concat(ring1).map(at)), S.and(wide, S.or.apply(null, ring2.map(at))));
    };
    const c = S.texAt(u, v), dr = S.neg(S.p("drop"));
    return S.pick([
      [S.solid(c), c],
      [shape(0, 0), S.p("paper")],
      [S.and(S.gt(S.p("drop"), 0), shape(dr, dr)), S.p("shadow")],
    ], S.clear);
  },
};

// WOOZY: rows sway sideways on a sine (`wave` px long, `sway` px), columns bob half as much on another, both rolling
// over the loop; and the picture SEES DOUBLE: two copies `seeing` px apart at most (0 at frame 0, widest mid-loop)
// averaged together. Reads clamp to the screen's edge.
SHADER_DEFS.woozy = {
  label: "Woozy", title: "the screen sways and swims, seeing double",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 10, pad: [0, 0, 0, 0],
  tags: ["silly", "dizzy", "drunk", "confused", "poisoned", "sleepy", "wobble", "double vision", "seasick"],
  params: {
    sway: { type: "int", min: 0, max: 4, def: 2, label: "Sway (px)" },
    wave: { type: "int", min: 8, max: 64, def: 32, label: "Wave length (px)" },
    seeing: { type: "int", min: 0, max: 6, def: 3, label: "Seeing double (px apart)" },
  },
  fragment: function (S) {
    const wl = S.p("wave"), sw = S.p("sway"), f = S.frame;
    const dx = shaderFunScale(S, S.table(SHADER_FUN_SIN32, S.mod(S.add(S.div(S.mul(S.y, 32), wl), f), 32)), sw, 1000);
    const dy = shaderFunScale(S, S.table(SHADER_FUN_SIN32, S.mod(S.sub(S.div(S.mul(S.x, 16), wl), S.mul(f, 2)), 32)), sw, 2000);
    const o = S.div(S.add(S.mul(S.p("seeing"), S.sub(1000, S.table(SHADER_FUN_SIN32, S.mod(S.add(f, 8), 32)))), 1000), 2000);
    const xs = S.add(S.x, dx), ys = S.add(S.y, dy);
    return S.mixc(S.texAt(S.add(xs, o), ys, "clamp"), S.texAt(S.sub(xs, o), ys, "clamp"), 1, 2);
  },
};

// WRONG CHANNEL (crosswire): frame 0 rests (a game can pin it between bursts); on `often` % of the other frames (hashed), `amount` % of the areas (bands `patch` rows tall,
// blocks three times as wide, the blocks offset per band) go wrong: their red, green and blue SWAP round (one of three
// ways), or their colors TRADE PLACES with another area's along the row (only where both are solid, so a sprite keeps
// its outline shape), or both. A fresh pattern every frame.
SHADER_DEFS.crosswire = {
  label: "Wrong channel", title: "a glitch: areas swap their color channels or trade colors with other areas",
  group: "Looks", kind: "both", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0], still0: true,
  tags: ["silly", "glitch", "broken", "corrupt", "rgb", "channel", "cable", "signal", "error", "hack"],
  params: {
    often: { type: "int", min: 0, max: 100, def: 50, label: "Glitchy frames (%)" },
    amount: { type: "int", min: 0, max: 100, def: 25, label: "Areas hit (%)" },
    area: { type: "int", min: 2, max: 16, def: 5, label: "Area size (px)" },
    mode: { type: "int", min: 0, max: 2, def: 2, label: "What goes wrong", choices: ["the channels swap", "colors trade places", "both"] },
    seed: { type: "int", min: 0, max: 999, def: 4, label: "Seed" },
  },
  fragment: function (S) {
    const seed = S.p("seed"), n = S.p("area"), f = S.frame, mode = S.p("mode");
    const glitchy = S.and(S.gt(f, 0), S.lt(S.mod(S.hash(f, seed, 3), 100), S.p("often")));   // frame 0 rests
    const band = S.div(S.y, n), bx = S.div(S.add(S.x, S.mod(S.hash(band, f, seed), S.mul(n, 3))), S.mul(n, 3));
    const h = S.hash(bx, band, S.add(S.mul(f, 1000), seed));
    const hit = S.and(glitchy, S.lt(S.mod(h, 100), S.p("amount")));
    const c = S.tex(0, 0), far = S.texAt(S.add(S.x, S.mul(S.sub(S.mod(S.div(h, 300), 5), 2), S.mul(n, 2))), S.y);
    const moved = S.sel(S.and(hit, S.ne(mode, 0), S.solid(far)), far, c);
    const way = S.mod(S.div(h, 100), 3), swap = S.and(hit, S.ne(mode, 1));
    const r = S.r(moved), g = S.g(moved), b = S.b(moved);
    const out = S.sel(swap, S.pick([[S.eq(way, 0), S.rgba(g, b, r, 255)], [S.eq(way, 1), S.rgba(b, r, g, 255)]], S.rgba(b, g, r, 255)), moved);
    return S.sel(S.solid(c), out, c);
  },
};

// DISCO (redrawn in build 7, before release: AJ's note "the spots read as a regular polka-dot grid"): the room dims by
// `dim` %; a few big SPOTLIGHTS (`density` % of six: four by default) sweep over it, each from its own hashed place (no
// grid: each in its own sixth of the width, anywhere in it, the sixths taken in a spread-out order), on its own path: two triangle waves, across and down, each one or two passes a loop, its own way round and
// phase, `sweep` % of the screen wide. A spot is `spot` sizes big (a share of the screen's height) with a SOFT EDGE in
// the pixel sense: its outer `soft` % thins out through a 4 x 4 Bayer dither. Lit pixels show the scene (not dimmed)
// tinted half-way to the spot's color (a color of `lights`, hashed); the first spot wins an overlap. 64 frames, so
// every path closes.
SHADER_DEFS.disco = {
  label: "Disco", title: "colored spotlights sweep about a dimmed room, their edges dithered soft",
  group: "World", kind: "screen", palette: "free", frames: 64, fps: 16, pad: [0, 0, 0, 0],
  tags: ["silly", "party", "dance", "mirror ball", "club", "lights", "rave", "groovy", "celebrate", "spotlight"],
  params: {
    lights: { type: "palette", def: ["#ff4fa3", "#4fd8ff", "#ffe14f", "#9b6bff", "#5bff8f"], max: 8, label: "Spot colors" },
    dim: { type: "int", min: 0, max: 90, def: 50, label: "Dim the room (%)" },
    spot: { type: "int", min: 1, max: 5, def: 3, label: "Spot size" },
    density: { type: "int", min: 0, max: 100, def: 60, label: "How many spots (% of six)" },
    seed: { type: "int", min: 0, max: 999, def: 8, label: "Seed" },
    soft: { type: "int", min: 0, max: 100, def: 45, label: "Soft edge (% of the spot, dithered)" },
    sweep: { type: "int", min: 0, max: 100, def: 60, label: "Sweep (% of the screen)" },
  },
  fragment: function (S) {
    const N = 6, seed = S.p("seed"), c = S.tex(0, 0), f = S.frame;
    const count = S.add(1, S.div(S.mul(S.p("density"), N - 1), 100));
    const R = S.max(2, S.div(S.mul(S.h, S.add(6, S.mul(S.p("spot"), 3))), 100)), R2 = S.mul(R, R);
    const Ri = S.div(S.mul(R, S.sub(100, S.p("soft"))), 100), Ri2 = S.mul(Ri, Ri);
    const ax = S.div(S.mul(S.w, S.p("sweep")), 200), ay = S.div(S.mul(S.h, S.p("sweep")), 400);
    const bay = shaderDither16(S, 0, S.x, S.y), n = S.palCount("lights"), c0 = S.hash(seed, 3, 5);
    const pick = [];
    for (let k = 0; k < N; k++) {
      const hx = S.hash(k, seed, 11), hy = S.hash(k, seed, 13), hp = S.hash(k, seed, 17);
      const way = function (bit) { return S.sub(S.mul(S.mod(S.div(hp, bit), 2), 2), 1); };
      const sx = S.mul(S.add(1, S.mod(hp, 2)), way(64)), sy = S.mul(S.add(1, S.mod(S.div(hp, 2), 2)), way(128));
      const tx = shaderWorldTri(S, S.add(S.mul(f, sx), S.mod(S.div(hp, 4), 64)), 64);              // -16 .. 16
      const ty = shaderWorldTri(S, S.add(S.mul(f, sy), S.mod(S.div(hp, 256), 64)), 64);
      // across: spot k in its own sixth of the screen (sixths spread out first: 0, 3, 5, 1, 4, 2, turned by the seed),
      // anywhere inside it; down: anywhere
      const sixth = S.mod(S.add([0, 3, 5, 1, 4, 2][k], S.mod(S.hash(seed, 7, 1), N)), N);
      const cx = S.add(S.div(S.mul(S.add(S.mul(sixth, 1000), S.mod(hx, 1000)), S.w), 1000 * N), S.div(S.mul(tx, ax), 16));
      const cy = S.add(S.div(S.mul(S.mod(hy, 1000), S.h), 1000), S.div(S.mul(ty, ay), 16));
      const ddx = S.sub(S.x, cx), ddy = S.sub(S.y, cy), d2 = S.add(S.mul(ddx, ddx), S.mul(ddy, ddy));
      const ring = S.lt(S.mul(bay, S.sub(R2, Ri2)), S.mul(S.sub(R2, d2), 16));                 // the thinning edge
      const lit = S.and(S.lt(k, count), S.le(d2, R2), S.or(S.le(d2, Ri2), ring));
      pick.push([lit, S.mixc(c, S.palAt("lights", S.mod(S.add(c0, k), n)), 1, 2)]);
    }
    const keep = S.sub(100, S.p("dim"));
    const dark = S.rgba(S.div(S.mul(S.r(c), keep), 100), S.div(S.mul(S.g(c), keep), 100), S.div(S.mul(S.b(c), keep), 100), S.a(c));
    return S.pick(pick, dark);
  },
};

// ---- build 7: the engine suites' extra param sets ------------------------------------------------------------------
// `variants` (optional, test-only: an app ignores it): param sets the real-engine parity suites (tests/shader-godot.mjs,
// shader-godot-screen.mjs, shader-webgl.mjs, shader-unity.mjs) draw besides the defaults and the generated variant (every
// param one step off its default). Build 7's new params and new choices get here the values that change an effect's
// character, so Godot, WebGL2 and Unity are proved on them, not only on a one-step nudge.
SHADER_DEFS.shimmer.variants = [{ dir: 3, sweep: 32, bands: 3, width: 1 }, { dir: 4, sweep: 8 }];
SHADER_DEFS.sparkle.variants = [{ shape: 2, life: 3 }, { shape: 1, life: 9, rarity: 4 }];
SHADER_DEFS.glow.variants = [{ pulse: 2, shape: 1 }, { pulse: 1, radius: 2 }];
// SEARCH WORDS a first-time user types (usability round, 2026-10-23: "game boy" missed Pocket, "old tv" missed CRT)
SHADER_DEFS.pocket.tags = (SHADER_DEFS.pocket.tags || []).concat(["game boy", "gameboy", "gb", "dmg", "handheld", "green", "retro"]);
SHADER_DEFS.crt.tags = (SHADER_DEFS.crt.tags || []).concat(["old tv", "retro tv", "tv", "arcade", "scanline", "scanlines", "television", "tube", "monitor"]);
SHADER_DEFS.pocket.variants = [{ dither: 2 }, { dither: 4, blocks: 1 }];
SHADER_DEFS.virtual.variants = [{ dither: 1 }, { dither: 3, blocks: 1 }];
SHADER_DEFS["1-bit"].variants = [{ pattern: 3, bias: -40 }, { pattern: 1, bias: 35, gridx: 2 }];
SHADER_DEFS.crt.variants = [{ mask: 3, bleed: 80 }, { mask: 3, bleed: 100, curve: 6, maskamt: 60 }];
SHADER_DEFS.hitflash.variants = [{ curve: 1, flashes: 3 }, { curve: 2 }];
SHADER_DEFS.palswap.variants = [{ tolerance: 64 }, { tolerance: 24 }];
SHADER_DEFS.dissolve.variants = [{ pattern: 3, chunk: 2, progress: 50 }, { pattern: 1, progress: 40 }, { pattern: 2, chunk: 8 }];
SHADER_DEFS.outline.variants = [{ side: 2, corners: 1, style: 2, width: 2 }, { corners: 1, style: 1 }];
SHADER_DEFS.ditherfade.variants = [{ pattern: 3, progress: 50 }, { pattern: 1, progress: 40, cell: 2 }];
SHADER_DEFS.pixelate.variants = [{ shape: 2, seams: 60, progress: 70 }, { shape: 1, seams: 100 }];
SHADER_DEFS.ripple.variants = [{ dir: 2, falloff: 2, amp: 3 }, { dir: 1, falloff: 1, amp: 3, from: 30 }];
SHADER_DEFS.torchlight.variants = [{ tint: "#ffb060" }];
SHADER_DEFS.dropshadow.variants = [{ style: 1, dx: 3, dy: 1 }, { style: 1, pattern: 1 }];
SHADER_DEFS.vignette.variants = [{ shape: 2, steps: 1, pattern: 1 }, { shape: 1, pattern: 3, size: 10 }, { shape: 3, pattern: 2, steps: 1 }];
SHADER_DEFS.disco.variants = [{ soft: 100, sweep: 100, spot: 1, density: 100 }, { soft: 0, spot: 5, density: 0 }];

// ---- Character's looks (build 8) ----
// CrunchyCharacter's LOOKS (parts.js; draw.js lookColourise; CHAR-DESIGN.md §53-56, §78) as RUNTIME shaders, so any
// sprite in a game can wear them live. Character draws a look with what a shader never sees (each part's mask, its
// role, its volume); a shader sees only the finished pixels. So each is the look's CHARACTER in image space:
//   painted  §78's hue-shifted ramps: brightness pushed low and contrasty into eight bands, the highlights leaning warm
//            and the shadows blue-violet (each pixel keeps its own color family), dark lines and the silhouette in the
//            family's OWN deepest shade (Painted is self-outlined), warm glints on the lit peaks
//   soft     §53: no lines; brightness smoothed, the light from the upper left by how the silhouette thickens, the edges
//            darkening as it thins, laid in a gentle ordered dither. Lines "kept" is Character's LINED (§54)
//   clay     §55's clay: Soft with the contrast pushed (a flat matte highlight, deeper shade), plus bumps lit from a height
//            read off brightness, a lit rim on the upper left, the lower right dark, a fingerprint grain
//   dither   §54's dither: shading re-drawn as an ordered dither between a color family's own shades (STRICT: only the
//            sprite's colors come out)
// Already in the Looks group, so not repeated here: ink, lineart, toon, hatching, halftone, neon, watercolor,
// blueprint, night; silhouette and outline in Sprite FX. "pixel" is the art as it is. Every one a still, "both".
// Reads use "clamp" (shaderLooksAt), so a screen's own border is never a silhouette.
SHADER_EFFECTS.push("painted", "soft", "clay", "dither");

const shaderCharN4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// a pixel's brightness, -1 when clear (so a clear neighbor is never the brightest)
function shaderCharKey(S, c) { return S.sel(S.solid(c), S.luma(c), -1); }
// the brightest solid 4-neighbor, or c itself: a dark line's COLOR FAMILY (the part it bounds)
function shaderCharBright(S, c) {
  let best = c, bl = shaderCharKey(S, c);
  shaderCharN4.forEach(function (o) {
    const n = shaderLooksAt(S, o[0], o[1]), k = shaderCharKey(S, n), up = S.gt(k, bl);
    best = S.sel(up, n, best); bl = S.sel(up, k, bl);
  });
  return { c: best, l: bl };
}
// is (dx, dy) clear (read with clamp: a screen's border is solid)
function shaderCharClear(S, dx, dy) { return S.not(S.solid(shaderLooksAt(S, dx, dy))); }
// a dark LINE pixel: darker than `dark` and its brightest neighbor brighter by more than 40
function shaderCharLine(S, Y, br, dark) { return S.and(S.lt(Y, dark), S.gt(S.sub(br.l, Y), 40)); }
// the light from the upper left by the silhouette alone (Character's soft field, §53): solid pixels 1-2 px down-right
// minus those up-left, -6..6 (positive: near the lit upper-left edge)
function shaderCharVolume(S) {
  let v = S.i(0);
  [1, 2].forEach(function (k) {
    [[k, k], [k, 0], [0, k]].forEach(function (o) {
      v = S.add(v, S.sub(S.sel(S.solid(shaderLooksAt(S, o[0], o[1])), 1, 0), S.sel(S.solid(shaderLooksAt(S, -o[0], -o[1])), 1, 0)));
    });
  });
  return v;
}
// how many of the 12 pixels within 2 (the 8 round it, and 2 px out straight) are clear: the field thinning
function shaderCharThin(S) {
  let n = S.i(0);
  [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].forEach(function (o) {
    n = S.add(n, S.sel(shaderCharClear(S, o[0], o[1]), 1, 0));
  });
  return n;
}
// brightness 3 x 3, weighted 4 / 2 / 1, over the solid pixels of the same color family (brightness within 48 of Ys:
// an eye, a line, another part never smears in)
function shaderCharBlur(S, Ys) {
  let sum = S.mul(Ys, 4), wsum = S.i(4);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const n = shaderLooksAt(S, dx, dy), w = dx === 0 || dy === 0 ? 2 : 1;
    const s = S.and(S.solid(n), S.le(S.abs(S.sub(S.luma(n), Ys)), 48));
    sum = S.add(sum, S.sel(s, S.mul(S.luma(n), w), 0)); wsum = S.add(wsum, S.sel(s, w, 0));
  }
  return S.div(sum, wsum);
}
// a brightness shift d laid as an ordered dither in steps of q (4 x 4 Bayer, in screen space): soft gradients in bands
function shaderCharDitherShift(S, d, q) {
  const t = S.table(SHADER_ERA_BAYER4, S.add(S.mul(S.mod(S.y, 4), 4), S.mod(S.x, 4)));
  return S.mul(S.div(S.add(S.mul(d, 16), S.mul(t, q)), 16 * q), q);
}
// color s brought to brightness t: lightened toward white, or scaled down toward black (its hue kept)
function shaderCharRelight(S, s, t) {
  const ys = S.luma(s), up = S.ge(t, ys);
  const ch = function (v) {
    return S.sel(up, S.add(v, S.div(S.mul(S.sub(255, v), S.sub(t, ys)), S.max(S.sub(255, ys), 1))), S.div(S.mul(v, t), S.max(ys, 1)));
  };
  return S.rgba(ch(S.r(s)), ch(S.g(s)), ch(S.b(s)), 255);
}
// color c with w % of the tint's HUE added (its channels less its own brightness): a hue shift, brightness kept
function shaderCharHue(S, c, tint, w) {
  const tl = S.luma(tint);
  const ch = function (v, tv) { return S.add(v, S.div(S.mul(S.sub(tv, tl), w), 100)); };
  return S.rgba(ch(S.r(c), S.r(tint)), ch(S.g(c), S.g(tint)), ch(S.b(c), S.b(tint)), 255);
}

// PAINTED (§78, "Painted 16-Bit"): each pixel's color family re-drawn on an eight-shade ramp. Brightness sits low and
// contrasty (Character's "16-bit battle art sits low, its lights small and bright"); the shade's HUE leans toward the
// light color above the base and the shadow color below it, more the further from the base (Character's ramp: 0.35 at
// the glint … 0.32 at the deepest). Dark lines and the silhouette take the family's deepest shades (no black outline).
SHADER_DEFS.painted = {
  label: "Painted", title: "16-bit battle art: hue-shifted ramps, warm lights, blue-violet shadows, no black lines",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["character", "painted", "16-bit", "hue shift", "ramp", "warm", "cool", "jrpg", "battle", "selout", "glint"],
  params: {
    shift: { type: "int", min: 0, max: 200, def: 100, label: "Hue shift (%)" },
    light: { type: "colour", def: "#ffc85a", label: "Highlights lean toward" },
    shadow: { type: "colour", def: "#5a3cc8", label: "Shadows lean toward" },
    glint: { type: "int", min: 0, max: 80, def: 36, label: "Glints (0 none)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Y = S.luma(c), br = shaderCharBright(S, c);
    const rim = S.and(S.solid(c), S.or.apply(null, shaderCharN4.map(function (o) { return shaderCharClear(S, o[0], o[1]); })));
    const line = S.and(S.not(rim), shaderCharLine(S, Y, br, 72));
    const src = S.sel(S.or(rim, line), br.c, c);
    // brightness pushed: x 1.25 round the middle, 10 lower, into eight bands (0 the glint … 7 the deepest)
    const Yc = S.clamp(S.sub(S.add(128, S.div(S.mul(S.sub(Y, 128), 5), 4)), 14), 0, 255);
    const idx = S.pick([[rim, 7], [line, 6]], S.sub(7, S.div(S.mul(Yc, 8), 256)));
    const lit0 = shaderCharRelight(S, src, S.table([236, 202, 172, 144, 114, 84, 56, 30], idx));
    // saturation per shade (Character's: the glint pale, the shadows richer), pushed a little over all
    const sat = S.table([55, 112, 115, 118, 122, 128, 128, 96], idx), L0 = S.luma(lit0);
    const satc = function (v) { return S.add(L0, S.div(S.mul(S.sub(v, L0), sat), 100)); };
    const lit = S.rgba(satc(S.r(lit0)), satc(S.g(lit0)), satc(S.b(lit0)), 255);
    // the shift scaled by the family's own colorfulness (max - min channel, full at 96): a gray or a dull brown barely
    // turns (Character's rule: a hue under 8 % saturation never shifts), a rich color turns all the way
    const chroma = S.min(S.sub(S.max(S.max(S.r(src), S.g(src)), S.b(src)), S.min(S.min(S.r(src), S.g(src)), S.b(src))), 96);
    const w = S.div(S.mul(S.mul(S.table([35, 28, 18, 8, 0, 12, 24, 32], idx), S.p("shift")), chroma), 9600);
    const hued = shaderCharHue(S, lit, S.sel(S.lt(idx, 4), S.p("light"), S.p("shadow")), w);
    // a GLINT: a lit peak (no 4-neighbor brighter) in the top shades, a warm near-white
    const g = S.p("glint");
    const peak = S.and.apply(null, shaderCharN4.map(function (o) { return S.ge(Y, shaderCharKey(S, shaderLooksAt(S, o[0], o[1]))); }));
    const glint = S.and(S.gt(g, 0), S.not(rim), S.not(line), peak, S.ge(Yc, S.sub(255, g)));
    return S.pick([[S.not(S.solid(c)), c], [glint, S.mixc(S.rgba(255, 252, 240, 255), S.p("light"), 1, 4)]], hued);
  },
};

// SOFT (§53): blended shading, no lines. Dark lines melt into the part they bound (lines "kept": Character's LINED,
// §54); brightness is smoothed over the solid pixels; the silhouette lights the upper left and shades the lower right
// (the soft field, light from the upper left); the edges darken as the shape thins; the change is laid as a gentle
// ordered dither in steps of 6, so a gradient reads soft and stays pixel art.
SHADER_DEFS.soft = {
  label: "Soft", title: "blended shading with no lines, lit from the upper left, edges softly darkened",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["character", "soft", "smooth", "blended", "gradient", "rpg maker", "lined", "no outline", "airbrush"],
  params: {
    blend: { type: "int", min: 0, max: 100, def: 70, label: "Blend the shading (%)" },
    light: { type: "int", min: 0, max: 60, def: 30, label: "Light from the upper left" },
    rim: { type: "int", min: 0, max: 80, def: 36, label: "Edges darken by" },
    lines: { type: "int", min: 0, max: 1, def: 0, label: "Dark lines", choices: ["melted (Soft)", "kept (Lined)"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Y = S.luma(c), br = shaderCharBright(S, c);
    // the OUTLINE (a dark line on the silhouette) melts into the part it bounds; lines inside (eyes, folds) stay
    const rimN = S.or.apply(null, shaderCharN4.map(function (o) { return shaderCharClear(S, o[0], o[1]); }));
    const line = S.and(rimN, shaderCharLine(S, Y, br, 80)), kept = S.eq(S.p("lines"), 1);
    const src = S.sel(line, br.c, c), Ys = S.luma(src);
    const d = S.sub(S.add(S.div(S.mul(S.sub(shaderCharBlur(S, Ys), Ys), S.p("blend")), 100), S.div(S.mul(shaderCharVolume(S), S.p("light")), 6)),
      S.div(S.mul(shaderCharThin(S), S.p("rim")), 8));
    return S.pick([[S.not(S.solid(c)), c], [S.and(kept, line), c]], shaderLooksShift(S, src, shaderCharDitherShift(S, d, 6)));
  },
};

// CLAY (§55): Soft with the contrast pushed (a FLAT matte highlight where the light is strongest, the shade deeper), and
// modeled: bumps lit from a height read off brightness (the light from the upper left), a lit rim where the shape
// faces the light, the lower right dark, and a grain of fingerprints in 2 x 2 dabs. No lines (clay is self-outlined).
SHADER_DEFS.clay = {
  label: "Clay", title: "plasticine: soft forms, a flat matte highlight, bumps and fingerprints, the lower right dark",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["character", "clay", "plasticine", "claymation", "stop motion", "sculpted", "matte", "bumpy", "soft"],
  params: {
    bump: { type: "int", min: 0, max: 100, def: 50, label: "Bumps (%)" },
    gloss: { type: "int", min: 0, max: 80, def: 36, label: "Highlight (lighter by)" },
    shade: { type: "int", min: 0, max: 100, def: 50, label: "Shade depth (%)" },
    grain: { type: "int", min: 0, max: 24, def: 4, label: "Fingerprint grain" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Y = S.luma(c), br = shaderCharBright(S, c);
    const rimN = S.or.apply(null, shaderCharN4.map(function (o) { return shaderCharClear(S, o[0], o[1]); }));
    const src = S.sel(S.and(rimN, shaderCharLine(S, Y, br, 80)), br.c, c), Ys = S.luma(src);
    // the height: brightness within the family (anything else, or clear, at this pixel's own: no bump at a line)
    const h = function (dx, dy) {
      const n = shaderLooksAt(S, dx, dy);
      return S.sel(S.and(S.solid(n), S.le(S.abs(S.sub(S.luma(n), Ys)), 48)), S.luma(n), Ys);
    };
    const relief = S.clamp(S.div(S.mul(S.add(S.sub(h(1, 0), h(-1, 0)), S.sub(h(0, 1), h(0, -1))), S.p("bump")), 100), -32, 32);
    const L = S.add(S.add(S.mul(shaderCharVolume(S), 8), relief), S.div(S.sub(shaderCharBlur(S, Ys), Ys), 2));
    const shade = S.p("shade"), gr = S.p("grain");
    const grain = S.sub(S.mod(S.hash(S.div(S.x, 2), S.div(S.y, 2), 4111), S.add(S.mul(gr, 2), 1)), gr);
    const d = S.sub(S.pick([
      [S.ge(L, 20), S.p("gloss")],                                         // the flat matte highlight
      [S.lt(L, 0), S.div(S.mul(S.mul(L, 3), shade), 200)],                 // the shade pushed deeper
    ], S.div(L, 3)), S.div(S.mul(shaderCharThin(S), shade), 16));
    return S.sel(S.solid(c), shaderLooksShift(S, src, S.add(d, grain)), c);
  },
};

// DITHER (§54): the shading re-drawn as an ORDERED DITHER between a color family's own shades. Each pixel aims at its
// family's local brightness (the mean of the pixels within `reach` whose r + g + b differ from its own by at most
// `family`: a blue beside a gold of the same brightness is another family), nudged by the dither cell, and takes the
// family color nearest that aim: gradients become dither, edges and outlines stay crisp. STRICT: only the sprite's own colors come out.
SHADER_DEFS.dither = {
  label: "Dithered", title: "shading re-drawn as an ordered dither between each color's own shades",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["character", "dither", "dithered", "bayer", "retro", "16-bit", "ordered", "pattern", "checker"],
  params: {
    spread: { type: "int", min: 0, max: 96, def: 56, label: "Dither strength" },
    family: { type: "int", min: 16, max: 300, def: 110, label: "Same color within (r + g + b apart)" },
    reach: { type: "int", min: 1, max: 2, def: 2, label: "Reach (px)" },
    pattern: { type: "int", min: 0, max: 3, def: 0, label: "Pattern", choices: SHADER_DITHER_NAMES },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Y = S.luma(c), fam = S.p("family"), reach = S.p("reach"), cand = [];
    let sum = S.i(0), n = S.i(0);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const q = shaderLooksAt(S, dx, dy), k = Math.max(Math.abs(dx), Math.abs(dy));
      const dist = S.add(S.add(S.abs(S.sub(S.r(q), S.r(c))), S.abs(S.sub(S.g(q), S.g(c)))), S.abs(S.sub(S.b(q), S.b(c))));
      const same = S.and(S.solid(q), S.le(dist, fam), S.ge(reach, k));
      sum = S.add(sum, S.sel(same, S.luma(q), 0)); n = S.add(n, S.sel(same, 1, 0));
      if (k > 0) cand.push([q, same]);
    }
    const t = shaderDither16(S, S.p("pattern"), S.x, S.y);
    const aim = S.add(S.div(sum, S.max(n, 1)), S.div(S.mul(S.sub(S.mul(t, 2), 15), S.p("spread")), 32));
    let best = c, bd = S.abs(S.sub(Y, aim));
    cand.forEach(function (p) {
      const dist = S.abs(S.sub(S.luma(p[0]), aim)), win = S.and(p[1], S.lt(dist, bd));
      best = S.sel(win, p[0], best); bd = S.sel(win, dist, bd);
    });
    return S.sel(S.solid(c), best, c);
  },
};
SHADER_DEFS.painted.variants = [{ shift: 200, light: "#ff9a40", shadow: "#2a4ad8", glint: 80 }, { shift: 40, glint: 0 }];
SHADER_DEFS.soft.variants = [{ lines: 1 }, { blend: 100, light: 60, rim: 80 }];
SHADER_DEFS.clay.variants = [{ bump: 100, grain: 24, shade: 100 }, { bump: 0, gloss: 70, grain: 0 }];
SHADER_DEFS.dither.variants = [{ pattern: 1, spread: 96 }, { pattern: 2, reach: 1, family: 200 }, { pattern: 3, spread: 30 }];
// ---- AJ's motion and FX batch (build 9) ----
// ======================================================================================================================
// AJ, 2026-10-16: "would you be willing to add those new shader ideas?" Nine sprite effects on the IR as it is (no new
// op, no printer change), data only; private helpers are shaderMotion*. `tags` are the app's search words.
//   spin          the sprite spins round, pixel-clean (RotSprite-style: Scale2x twice, then nearest), never blurred
//   tilt          the same turn held at an angle, rocking to and fro, or wobbling to rest (an `angle` param)
//   flip          a pseudo-3D card / coin flip or tumble: columns (or rows) squeezed with perspective, a back face
//   powerlines    speed lines shoot out of the silhouette and pull back, fly off, or rush in (a charge-up, a focus)
//   superform     the golden transformation: a flickering bright aura hugging the silhouette, flaring, sparkles popping
//   afterimage    fading, tinted copies stream out behind the sprite along a direction (the FAKE kind: no frame history)
//   rainbowtrail  rainbow streaks trail behind it, in hard bands or blended through a dither, wavy or straight
//   sizzle        just burned (or zapped): the edge crackles and jitters, hot pops spit off it, smoke wisps curl up
//   disintegrate  a transition: it shakes violently, then breaks into pieces that drift away as dust, ending empty
// How they differ from the effects they sound like: shake is a SCREEN shake; spin/tilt turn the sprite (sway and cutout
// only shear rows); flip is a 3D turn (jelly squashes about its feet); powerlines are lines OUTSIDE the silhouette
// (charge glows inside it); superform is a bright flaring aura with sparkles (aura is a dark low flicker, glow a smooth
// halo); afterimage copies the sprite behind it (ghost makes the sprite itself see-through); rainbowtrail is a trail
// (rainbow recolors the sprite); sizzle jitters the edge and smokes (shock flashes an x-ray, burn chars inward);
// disintegrate moves pieces of the sprite away (dissolve burns pixels where they stand, fadeout dithers them).
// ======================================================================================================================

SHADER_EFFECTS.push("spin", "tilt", "flip", "powerlines", "superform", "afterimage", "rainbowtrail", "sizzle", "disintegrate");

// sin(deg) x 1000 for any whole degrees: Bhaskara I's rational form, 4000 p / (40500 - p), p = d (180 - d), within
// 2 / 1000 of the true sine; exact at 0, 30, 90, 150, 180 … Integers only, so every engine turns alike.
function shaderMotionSin(S, deg) {
  const d = S.mod(deg, 360), h = S.mod(d, 180), p = S.mul(h, S.sub(180, h));
  const v = S.div(S.mul(p, 4000), S.sub(40500, p));
  return S.sel(S.lt(d, 180), v, S.neg(v));
}
function shaderMotionCos(S, deg) { return shaderMotionSin(S, S.add(deg, 90)); }
// the angle of (x, y) (y down) in whole degrees 0..359, 0 along +x, 90 along +y: atan r ~ 45 r + 15.64 r (1 - r) on
// the nearer axis's octant (within half a degree), then mirrored into place
function shaderMotionAtan(S, x, y) {
  const ax = S.abs(x), ay = S.abs(y), r = S.div(S.mul(S.min(ax, ay), 1000), S.max(S.max(ax, ay), 1));   // 0..1000
  const a0 = S.div(S.add(S.add(S.mul(r, 45), S.div(S.mul(S.mul(r, S.sub(1000, r)), 1564), 100000)), 500), 1000);
  const a1 = S.sel(S.gt(ay, ax), S.sub(90, a0), a0), a2 = S.sel(S.lt(x, 0), S.sub(180, a1), a1);
  return S.mod(S.sel(S.lt(y, 0), S.sub(360, a2), a2), 360);
}
// two texels are the same color (two clear ones are the same, whatever their RGB)
function shaderMotionSame(S, a, b) {
  const sa = S.solid(a), sb = S.solid(b);
  return S.or(S.and(S.not(sa), S.not(sb)), S.and(sa, sb, S.eq(S.r(a), S.r(b)), S.eq(S.g(a), S.g(b)), S.eq(S.b(a), S.b(b))));
}
// the image scaled 2^n times by Scale2x (EPX), read at (X, Y) in that scaled image: each step a pixel's quarter takes
// the neighbor it touches when that neighbor's two sides agree (a corner of a staircase fills in), else it stays
function shaderMotionEpx(S, n, X, Y) {
  if (n === 0) return S.texAt(X, Y);
  const px = S.div(X, 2), py = S.div(Y, 2), right = S.eq(S.mod(X, 2), 1), low = S.eq(S.mod(Y, 2), 1);
  const at = function (dx, dy) { return shaderMotionEpx(S, n - 1, S.add(px, dx), S.add(py, dy)); };
  const P = at(0, 0), A = at(0, -1), B = at(1, 0), C = at(-1, 0), D = at(0, 1);
  const H = S.sel(right, B, C), H2 = S.sel(right, C, B), V = S.sel(low, D, A), V2 = S.sel(low, A, D);
  return S.sel(S.and(shaderMotionSame(S, V, H), S.not(shaderMotionSame(S, H, V2)), S.not(shaderMotionSame(S, V, H2))), V, P);
}
// the padded image turned `deg` degrees clockwise about its middle. clean (a bool): RotSprite's way, pixel-clean: the
// image is smoothed up 4x by Scale2x twice and that read nearest at the turned pixel center (a quarter-turn, or none,
// reads the image itself exactly); otherwise plain nearest. Never a blend: every pixel out is one of the image's.
function shaderMotionTurn(S, deg, clean) {
  const c = shaderMotionCos(S, deg), s = shaderMotionSin(S, deg);
  const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);     // doubled, from the middle
  const qx = S.div(S.add(S.mul(S.add(S.mul(X2, c), S.mul(Y2, s)), 2), S.mul(S.w, 2000)), 1000);  // quarter pixels
  const qy = S.div(S.add(S.mul(S.sub(S.mul(Y2, c), S.mul(X2, s)), 2), S.mul(S.h, 2000)), 1000);
  const plain = S.texAt(S.div(qx, 4), S.div(qy, 4));
  return S.sel(S.and(clean, S.ne(S.mod(deg, 90), 0)), shaderMotionEpx(S, 2, qx, qy), plain);
}
const SHADER_MOTION_EDGES = { type: "int", min: 0, max: 1, def: 0, label: "Edges", choices: ["clean (RotSprite-style)", "plain nearest"] };
const SHADER_MOTION_DIRS = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"];
// v / 1000 rounded (half up)
function shaderMotionK(S, v) { return S.div(S.add(v, 500), 1000); }

// SPIN: a whole turn (or `turns`) a loop through `positions` positions, clockwise or not, upright at frame 0. The pad
// (7 px) holds a square sprite up to 32 px turned to 45 degrees; a wider one turns about its middle and may clip.
SHADER_DEFS.spin = {
  label: "Spin", title: "the sprite spins round, pixel-clean (RotSprite-style), never blurred",
  group: "Sprite FX", kind: "sprite", frames: 32, fps: 16, pad: [7, 7, 7, 7], still0: true, turns: true,
  tags: ["silly", "spin", "rotate", "turn", "twirl", "whirl", "dizzy", "pinwheel", "rotsprite"],
  params: {
    dir: { type: "int", min: 0, max: 1, def: 0, label: "Spins", choices: ["clockwise", "counterclockwise"] },
    positions: { type: "int", min: 0, max: 2, def: 1, label: "Positions in a turn", choices: ["8 (chunky)", "16", "32 (smooth)"] },
    turns: { type: "int", min: 1, max: 3, def: 1, label: "Turns a loop" },
    edges: SHADER_MOTION_EDGES,
  },
  fragment: function (S) {
    const n = S.table([8, 16, 32], S.p("positions"));
    const deg = S.div(S.mul(S.div(S.mul(S.mul(S.frame, S.p("turns")), n), S.FRAMES), 360), n);   // whole positions
    return shaderMotionTurn(S, S.sel(S.eq(S.p("dir"), 1), S.neg(deg), deg), S.eq(S.p("edges"), 0));
  },
};

// TILT: the turn of `spin` at `angle` degrees: rocking between -angle and +angle (a cosine), held there, or wobbling
// from it to rest (a damped swing; play it once). Frame 0 is always at +angle.
SHADER_DEFS.tilt = {
  label: "Tilt", title: "the sprite turned to an angle: held, rocking to and fro, or wobbling to rest, pixel-clean",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 10, pad: [7, 7, 7, 7], turns: true,
  tags: ["silly", "tilt", "rotate", "angle", "rock", "tipsy", "wobble", "lean", "swing", "rotsprite"],
  params: {
    angle: { type: "int", min: -180, max: 180, def: 20, label: "Angle (degrees, clockwise)" },
    motion: { type: "int", min: 0, max: 2, def: 0, label: "Motion", choices: ["rocks to and fro", "held at the angle", "wobbles and settles"] },
    edges: SHADER_MOTION_EDGES,
  },
  fragment: function (S) {
    const WOBBLE = [1000, 640, -80, -620, -560, -120, 330, 450, 220, -110, -260, -160, 30, 120, 60, 0];   // x 1000
    const mo = S.p("motion");
    const k = S.pick([[S.eq(mo, 1), S.i(1000)], [S.eq(mo, 2), S.table(WOBBLE, S.frame)]], shaderMotionCos(S, S.div(S.mul(S.frame, 360), S.FRAMES)));
    return shaderMotionTurn(S, shaderFunScale(S, k, S.p("angle"), 1000), S.eq(S.p("edges"), 0));
  },
};

// FLIP: a pseudo-3D turn about the upright (columns squeeze, a card or a coin) or the level (rows squeeze, head over
// heels), seen from `depth` (an eye 112 or 56 px away: the near side grows, the far side shrinks; none: flat). Each
// pixel is read back through the turn (nearest, never blurred). Past a quarter turn the BACK shows: the art seen from
// behind (mirrored), shaded to the back color, as it is, flat in the back color, or nothing. Both faces darken by
// up to `shade` % as they turn edge-on. Upright at frame 0; "rocks" peeks 60 degrees each way.
SHADER_DEFS.flip = {
  label: "Flip", title: "a pseudo-3D flip, like a card or a coin, with perspective and a back face",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 16, pad: [8, 8, 8, 8], still0: true, turns: true,
  tags: ["flip", "card", "coin", "door", "3d", "turn", "tumble", "rotate", "spin", "pickup"],
  params: {
    axis: { type: "int", min: 0, max: 1, def: 0, label: "Turns", choices: ["side to side (a card, a coin)", "head over heels"] },
    motion: { type: "int", min: 0, max: 2, def: 0, label: "Motion", choices: ["all the way round", "rocks (a door ajar, a peek)", "over and back"] },
    back: { type: "int", min: 0, max: 3, def: 0, label: "The back", choices: ["the art, shaded to the back color", "the art, mirrored (a coin's other side)", "the back color, flat (a card)", "nothing (one-sided)"] },
    backing: { type: "colour", def: "#3a2e5c", label: "Back color" },
    depth: { type: "int", min: 0, max: 2, def: 1, label: "Perspective", choices: ["none (flat)", "a little", "strong"] },
    shade: { type: "int", min: 0, max: 100, def: 50, label: "Darkens edge-on (%)" },
  },
  fragment: function (S) {
    const F = S.FRAMES, mo = S.p("motion"), ax = S.eq(S.p("axis"), 1), round = S.div(S.mul(S.frame, 360), F);
    const deg = S.pick([[S.eq(mo, 1), shaderFunScale(S, shaderMotionSin(S, round), 60, 1000)], [S.eq(mo, 2), shaderTri(S, 180)]], round);
    const C = shaderMotionCos(S, deg), Sn = shaderMotionSin(S, deg);
    const Dd = S.table([1000, 224, 112], S.p("depth")), Sq = S.sel(S.eq(S.p("depth"), 0), 0, Sn);   // 2 x the eye (px)
    const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    const U2 = S.sel(ax, Y2, X2), V2 = S.sel(ax, X2, Y2), Wu = S.sel(ax, S.h, S.w), Wv = S.sel(ax, S.w, S.h);
    // across: x' = x c D / (D + x s), so x = x' D / (c D - x' s) (doubled px); along: scaled by (D + x s) / D
    const num = S.mul(S.mul(U2, Dd), 1000), den = S.sub(S.mul(C, Dd), S.mul(U2, Sq));
    const u2 = S.clamp(S.div(S.sel(S.lt(den, 0), S.neg(num), num), S.abs(den)), S.neg(Wu), Wu);
    const eye = S.add(S.mul(Dd, 1000), S.mul(u2, Sq));                                           // > 0: in front of the eye
    const v2 = S.div(S.mul(V2, eye), S.mul(Dd, 1000));
    const su = S.div(S.add(u2, S.sub(Wu, 1)), 2), sv = S.div(S.add(v2, S.sub(Wv, 1)), 2);
    const t = S.texAt(S.sel(ax, sv, su), S.sel(ax, su, sv)), b = S.p("back"), bc = S.p("backing");
    const k = S.sub(100, S.div(S.mul(S.p("shade"), S.sub(1000, S.abs(C))), 1000));              // % kept
    const dim = function (c) { return S.rgba(S.div(S.mul(S.r(c), k), 100), S.div(S.mul(S.g(c), k), 100), S.div(S.mul(S.b(c), k), 100), 255); };
    const backc = S.pick([[S.eq(b, 0), S.mixc(t, bc, 2, 3)], [S.eq(b, 2), bc]], t);
    return S.pick([
      [S.or(S.not(S.solid(t)), S.eq(den, 0), S.le(eye, 0)), S.clear],
      [S.gt(C, 0), dim(t)],
      [S.eq(b, 3), S.clear],
    ], dim(backc));
  },
};

// POWER LINES: `count` lines radiate from the sprite's middle (a little jittered by `seed`), or rise straight up from
// it (`count` of every 32 columns); each is drawn only OUTSIDE the silhouette, `reach` px long at most, measured from
// where it leaves the silhouette (read back along the line, 8 px at most: the pad). Each line has its own moment in the
// loop: it shoots out and pulls back in, shoots out and flies off, or rushes in from 8 px out and vanishes into the edge.
SHADER_DEFS.powerlines = {
  label: "Power lines", title: "speed lines shoot out of the silhouette and pull back, fly off, or rush in: a charge-up",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 16, pad: [8, 8, 8, 8],
  tags: ["silly", "anime", "charge", "power up", "speed lines", "focus", "burst", "energy", "shout", "manga"],
  params: {
    motion: { type: "int", min: 0, max: 2, def: 0, label: "The lines", choices: ["shoot out and pull back", "shoot out and fly off", "rush in (focus)"] },
    shape: { type: "int", min: 0, max: 1, def: 0, label: "Shape", choices: ["a burst, all round", "rising, straight up"] },
    count: { type: "int", min: 4, max: 24, def: 12, label: "Lines" },
    reach: { type: "int", min: 2, max: 8, def: 6, label: "Line length (px)" },
    colours: { type: "palette", def: ["#ffffff", "#aef0ff", "#5fd0ff"], max: 6, label: "Colors" },
    seed: { type: "int", min: 0, max: 999, def: 5, label: "Seed" },
  },
  fragment: function (S) {
    const L = 8, F = S.FRAMES, N = S.p("count"), seed = S.p("seed"), len = S.p("reach"), mo = S.p("motion");
    const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    // a burst: line k (of N, at k 360 / N degrees, jittered up to 60 / N either way) is the one nearest this pixel's angle
    const k = S.mod(S.div(S.add(S.mul(shaderMotionAtan(S, X2, Y2), N), 180), 360), N);
    const phi = S.add(S.div(S.mul(k, 360), N), S.div(S.mul(S.sub(S.mod(S.hash(k, seed, 41), 5), 2), 30), N));
    const ux = shaderMotionCos(S, phi), uy = shaderMotionSin(S, phi);
    const onBurst = S.le(S.abs(S.sub(S.mul(X2, uy), S.mul(Y2, ux))), 1000);                     // within half a px of it
    const rise = S.eq(S.p("shape"), 1), onRise = S.lt(S.mod(S.hash(S.x, seed, 43), 32), N);
    const id = S.sel(rise, S.x, k), Ux = S.sel(rise, 0, ux), Uy = S.sel(rise, -1000, uy);
    let d = S.i(99);                                         // where the line leaves the silhouette: 1..L px back along it
    for (let j = L; j >= 1; j--) d = S.sel(S.solid(S.texAt(S.sub(S.x, shaderMotionK(S, S.mul(Ux, j))), S.sub(S.y, shaderMotionK(S, S.mul(Uy, j))))), j, d);
    const tau = S.mod(S.add(S.frame, S.mod(S.hash(id, seed, 47), F)), F);                         // this line's moment
    const fly = S.div(S.mul(tau, S.add(L, len)), F);                                              // 0 .. L + len
    const b = S.pick([[S.eq(mo, 1), fly], [S.eq(mo, 2), S.sub(S.add(L, len), fly)]], S.div(S.mul(S.min(tau, S.sub(F, tau)), len), F / 2));
    const a = S.sel(S.eq(mo, 0), 1, S.max(1, S.sub(S.add(b, 1), len)));
    const lit = S.and(S.not(S.solid(S.tex(0, 0))), S.sel(rise, onRise, onBurst), S.ge(d, a), S.le(d, b));
    return S.sel(lit, S.palAt("colours", S.mod(S.hash(id, seed, 53), S.palCount("colours"))), S.tex(0, 0));
  },
};

// SUPER FORM: the clear pixels touching the sprite are the aura's bright core (aura[0]); a ring out to about 2 px is
// its body (aura[1], `flicker` % dropping out each frame); flames rise from upward edges, each 2 px column to its own
// height each frame (up to `flare` px; `flicker` sets how much they jump): aura[1] low, the deep aura[last] at the tips.
// The sprite's bright parts light up gold (luma 200+ aura[0], 140+ aura[1]). Sparkles pop round it: in `sparkles` % of
// the 8 x 8 cells near the sprite, a four-point star grows, peaks and goes, 4 frames, each cell at its own moment.
SHADER_DEFS.superform = {
  label: "Super form", title: "the golden transformation: a flickering, flaring bright aura with sparkles popping round it",
  group: "Sprite FX", kind: "sprite", frames: 12, fps: 12, pad: [6, 5, 5, 5],
  tags: ["silly", "super", "transform", "power up", "golden", "aura", "anime", "sparkle", "invincible", "level up"],
  params: {
    aura: { type: "palette", def: ["#fffbd6", "#ffe04a", "#f09a1a"], max: 6, label: "Aura (bright → deep)" },
    flicker: { type: "int", min: 0, max: 100, def: 50, label: "Flicker (%)" },
    sparkles: { type: "int", min: 0, max: 100, def: 60, label: "Sparkles (% of the places round it)" },
    flare: { type: "int", min: 1, max: 6, def: 5, label: "Flares up (px)" },
    body: { type: "int", min: 0, max: 1, def: 0, label: "The sprite", choices: ["lit up (its bright parts gold)", "as drawn"] },
    spark: { type: "colour", def: "#ffffff", label: "Sparkle" },
    seed: { type: "int", min: 0, max: 999, def: 3, label: "Seed" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), solid = S.solid(c), f = S.frame, seed = S.p("seed"), fl = S.p("flicker"), n = S.palCount("aura");
    const A0 = S.palAt("aura", 0), A1 = S.palAt("aura", 1), AD = S.palAt("aura", S.sub(n, 1));
    const roll = S.mod(S.hash(S.x, S.y, S.add(f, S.mul(seed, 16))), 100);
    const core = shaderNear(S, shaderDisc(2)), ring = S.and(shaderNear(S, shaderDisc(5, 2)), S.ge(roll, fl));
    let k = S.i(99);                                                    // the nearest solid pixel straight below, 1..6
    for (let j = 6; j >= 1; j--) k = S.sel(S.solid(S.tex(0, j)), j, k);
    const jump = S.mod(S.hash(S.div(S.x, 2), f, S.add(seed, 7)), S.add(1, S.div(S.mul(S.p("flare"), fl), 100)));
    const h = S.sub(S.p("flare"), jump);
    const tongue = S.le(k, h), tip = S.gt(S.mul(k, 2), h);
    // sparkles: one possible star per 8 x 8 cell, its center 2..5 px in (so its arms stay in the cell)
    const cx = S.div(S.x, 8), cy = S.div(S.y, 8), ph = S.add(f, S.mod(S.hash(cx, cy, S.add(seed, 11)), 12));
    const stage = S.mod(ph, 4), epoch = S.mod(S.div(ph, 4), 3), hs = S.hash(cx, cy, S.add(S.mul(epoch, 1000), seed));
    const ox = S.sub(S.x, S.add(S.mul(cx, 8), S.add(2, S.mod(hs, 4)))), oy = S.sub(S.y, S.add(S.mul(cy, 8), S.add(2, S.mod(S.div(hs, 4), 4))));
    const near = S.or.apply(null, [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]].map(function (o) {
      return S.solid(S.texAt(S.add(S.sub(S.x, ox), o[0]), S.add(S.sub(S.y, oy), o[1])));
    }));
    const r = S.add(S.abs(ox), S.abs(oy)), plus = S.or(S.eq(ox, 0), S.eq(oy, 0));
    const star = S.and(near, S.lt(S.mod(S.div(hs, 16), 100), S.p("sparkles")), plus,
      S.le(r, S.table([0, 1, 2, 0], stage)));
    const starC = S.pick([[S.eq(r, 0), S.sel(S.eq(stage, 3), A0, S.p("spark"))], [S.eq(stage, 2), S.sel(S.eq(r, 1), S.p("spark"), A0)]], A0);
    const lit = S.and(S.eq(S.p("body"), 0), S.ge(S.luma(c), 140));
    return S.pick([
      [star, starC],
      [S.and(solid, lit), S.sel(S.ge(S.luma(c), 200), A0, A1)],
      [solid, c],
      [core, A0],
      [ring, A1],
      [tongue, S.sel(tip, AD, A1)],
    ], c);
  },
};

// AFTERIMAGES (the fake kind: no frame history): copies of the sprite behind it, toward `dir`, `spacing` px apart,
// `count` of them, each farther one thinner (a 4 x 4 Bayer dither, down to 100 - `fade` % of its pixels) and more tinted
// (from half `tinted` % to all of it). "Stream out": the copies slide out from under the sprite and on, one place every
// 6 frames, as if it were dashing; "hold still": fixed; "flicker": fixed, every other copy on alternate frames.
SHADER_DEFS.afterimage = {
  label: "Afterimages", title: "fading copies of the sprite stream out behind it, as if it were dashing",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 12, fps: 20, pad: [16, 16, 16, 16],
  tags: ["silly", "speed", "dash", "afterimage", "echo", "motion blur", "fast", "trail", "ninja", "haste"],
  params: {
    dir: { type: "int", min: 0, max: 7, def: 6, label: "Trails toward", choices: SHADER_MOTION_DIRS },
    count: { type: "int", min: 1, max: 4, def: 3, label: "Copies" },
    spacing: { type: "int", min: 1, max: 4, def: 4, label: "Apart (px)" },
    fade: { type: "int", min: 0, max: 100, def: 60, label: "Fades (% gone by the last)" },
    tint: { type: "colour", def: "#4ab8ff", label: "Tint" },
    tinted: { type: "int", min: 0, max: 100, def: 50, label: "Tinted (%)" },
    motion: { type: "int", min: 0, max: 2, def: 0, label: "The copies", choices: ["stream out", "hold still", "flicker"] },
  },
  fragment: function (S) {
    const P = 6, c = S.tex(0, 0), dir = S.p("dir"), ux = shaderSprite2Dx(S, dir), uy = shaderSprite2Dy(S, dir);
    const sp = S.p("spacing"), total = S.mul(S.p("count"), sp), mo = S.p("motion"), tint = S.p("tint");
    const bay = S.div(S.mul(shaderWorldBayer(S, S.x, S.y), 100), 16);                                     // 0..93
    const cases = [];
    for (let j = 0; j <= 4; j++) {
      const d = S.sel(S.eq(mo, 0), S.div(S.mul(S.add(j * P, S.mod(S.frame, P)), sp), P), S.mul(j, sp));
      const q = S.texAt(S.sub(S.x, S.mul(ux, d)), S.sub(S.y, S.mul(uy, d)));
      const shown = S.sub(100, S.div(S.mul(S.p("fade"), d), S.max(total, 1)));
      const t = S.div(S.mul(S.p("tinted"), S.add(d, total)), S.max(S.mul(total, 2), 1));                     // % tint
      const vis = S.and(S.gt(d, 0), S.le(d, total), S.solid(q), S.lt(bay, shown),
        S.or(S.ne(mo, 2), S.eq(S.mod(S.add(j, S.frame), 2), 0)));
      cases.push([vis, S.rgba(S.mix(S.r(q), S.r(tint), t, 100), S.mix(S.g(q), S.g(tint), t, 100), S.mix(S.b(q), S.b(tint), t, 100), 255)]);
    }
    return S.sel(S.solid(c), c, S.pick(cases, c));
  },
};

// RAINBOW TRAIL: the sprite smeared `reach` px toward `dir` (each clear pixel finds the first solid pixel back toward
// the sprite), colored in `bands` stripes ACROSS the trail (the sprite's image height for a sideways trail), from the
// palette in turn: hard bands, or blended (the second half of each band dithers into the next). Wavy: every 4 px along
// the trail steps a pixel across, the steps marching back along it; the last third of the trail dithers out.
SHADER_DEFS.rainbowtrail = {
  label: "Rainbow trail", title: "streaks of rainbow color trail behind the sprite, in hard bands or blended",
  group: "Sprite FX", kind: "sprite", frames: 8, fps: 12, pad: [12, 12, 12, 12],
  tags: ["silly", "rainbow", "trail", "nyan", "streak", "speed", "magic", "pride", "dash", "colourful", "colorful"],
  params: {
    dir: { type: "int", min: 0, max: 7, def: 6, label: "Trails toward", choices: SHADER_MOTION_DIRS },
    reach: { type: "int", min: 4, max: 12, def: 12, label: "Trail length (px)" },
    bands: { type: "int", min: 2, max: 8, def: 6, label: "Bands across" },
    blend: { type: "int", min: 0, max: 1, def: 0, label: "Bands", choices: ["hard", "blended (dithered)"] },
    wave: { type: "int", min: 0, max: 1, def: 0, label: "Trail", choices: ["wavy (it steps up and down)", "straight"] },
    colours: { type: "palette", def: ["#ff3b4e", "#ff9a2a", "#ffe23a", "#4ad86a", "#3aa8ff", "#8a5aff"], max: 8, label: "Colors, in order" },
  },
  fragment: function (S) {
    const PAD = 12, c = S.tex(0, 0), dir = S.p("dir"), ux = shaderSprite2Dx(S, dir), uy = shaderSprite2Dy(S, dir);
    const px = S.neg(uy), py = ux, R = S.p("reach"), wavy = S.eq(S.p("wave"), 0), nb = S.p("bands");
    let d = S.i(99), w = S.i(0);
    for (let j = PAD; j >= 1; j--) {
      const wj = S.sel(wavy, S.mod(S.div(S.add(j, S.frame), 4), 2), 0);
      const hit = S.solid(S.texAt(S.sub(S.sub(S.x, S.mul(ux, j)), S.mul(px, wj)), S.sub(S.sub(S.y, S.mul(uy, j)), S.mul(py, wj))));
      d = S.sel(hit, j, d); w = S.sel(hit, wj, w);
    }
    // across the trail, doubled px from the middle, at the sprite pixel it came from
    const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    // (measured from the trail's left-hand side as it streams away: a trail toward the left has its first color on top)
    const across = S.sub(S.mul(S.mul(w, 2), S.add(S.mul(px, px), S.mul(py, py))), S.add(S.mul(X2, px), S.mul(Y2, py)));
    const span = S.max(1, S.add(S.mul(S.abs(px), S.sub(S.w, 2 * PAD)), S.mul(S.abs(py), S.sub(S.h, 2 * PAD))));
    const v = S.clamp(S.div(S.mul(S.mul(S.add(across, span), nb), 16), S.mul(span, 2)), 0, S.sub(S.mul(nb, 16), 1));
    const bay = shaderWorldBayer(S, S.x, S.y), band = S.div(v, 16);
    const next = S.and(S.eq(S.p("blend"), 1), S.lt(bay, S.mul(S.sub(S.mod(v, 16), 8), 2)));
    const idx = S.sel(next, S.min(S.add(band, 1), S.sub(nb, 1)), band);
    const tail = S.lt(S.mul(bay, R), S.mul(S.sub(R, d), 48));                                  // the last third thins out
    const lit = S.and(S.not(S.solid(c)), S.le(d, R), tail);
    return S.sel(lit, S.palAt("colours", S.mod(idx, S.palCount("colours"))), c);
  },
};

// SIZZLE: every frame the pixels on the sprite's edge (either side of it) read up to `jitter` px off in a hashed way,
// so the silhouette crackles; on that crackling edge `crackle` / 2 % of the sprite's edge pixels flash a heat color,
// and hot pops spit off it (dots within 2 px, crackle / 6 %). Smoke wisps curl up from its upward edges (in `wisps` %
// of the 3 px columns, 8 px high at most), swaying a pixel, in puffs, darker near the sprite.
SHADER_DEFS.sizzle = {
  label: "Sizzle", title: "just burned or zapped: a crackling, jittering edge, hot pops and wisps of smoke",
  group: "Sprite FX", kind: "sprite", frames: 12, fps: 15, pad: [8, 3, 2, 3],
  tags: ["silly", "burned", "sizzle", "crispy", "smoke", "electrified", "zapped", "singed", "hot", "fried"],
  params: {
    heat: { type: "palette", def: ["#fff4b8", "#ffb43a", "#ff5a1a"], max: 6, label: "Heat (white-hot → red)" },
    smoke: { type: "palette", def: ["#d4d0d8", "#8e8898"], max: 4, label: "Smoke (light → dark)" },
    crackle: { type: "int", min: 0, max: 100, def: 50, label: "Crackle (%)" },
    jitter: { type: "int", min: 0, max: 2, def: 1, label: "Edge jitter (px)" },
    wisps: { type: "int", min: 0, max: 100, def: 45, label: "Smoke wisps (% of places)" },
    seed: { type: "int", min: 0, max: 999, def: 6, label: "Seed" },
  },
  fragment: function (S) {
    const f = S.frame, seed = S.p("seed"), J = S.p("jitter"), cr = S.p("crackle"), c0 = S.tex(0, 0), s0 = S.solid(c0);
    const n4 = shaderSpriteN4(), anyClear = shaderSpriteNearClear(S, n4), anySolid = shaderNear(S, n4);
    const edge = S.or(S.and(s0, anyClear), S.and(S.not(s0), anySolid));
    const h = S.hash(S.x, S.y, S.add(S.mul(f, 37), seed)), J2 = S.add(S.mul(J, 2), 1);
    const c = S.sel(edge, S.texAt(S.add(S.x, S.sub(S.mod(h, J2), J)), S.add(S.y, S.sub(S.mod(S.div(h, 5), J2), J))), c0);
    const roll = S.mod(S.div(h, 25), 100), nh = S.palCount("heat"), heatC = S.palAt("heat", S.mod(S.div(h, 2500), nh));
    const hot = S.and(S.solid(c), S.or(edge, anyClear), S.lt(S.mul(roll, 2), cr));
    const pop = S.and(S.not(S.solid(c)), shaderNear(S, shaderDisc(5)), S.lt(S.mul(roll, 6), cr), S.not(edge));
    // wisps
    let k = S.i(99);
    for (let j = 8; j >= 1; j--) k = S.sel(S.solid(S.tex(0, j)), j, k);
    const cell = S.div(S.x, 3), hc = S.hash(cell, seed, 59), rise = S.add(S.add(S.y, f), S.mod(S.div(hc, 100), 12));
    const x0 = S.add(S.add(S.mul(cell, 3), 1), S.table([0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0], S.mod(rise, 12)));
    const puff = S.ne(S.mod(S.div(rise, 3), 4), 3), ns = S.palCount("smoke");
    const wisp = S.and(S.not(s0), S.eq(S.x, x0), S.le(k, 8), puff, S.lt(S.mod(hc, 100), S.p("wisps")),
      S.or(S.le(k, 5), S.eq(S.mod(S.add(S.x, S.y), 2), 0)));
    return S.pick([
      [hot, heatC],
      [pop, heatC],
      [S.solid(c), c],
      [wisp, S.palAt("smoke", S.sel(S.le(k, 3), S.sub(ns, 1), 0))],
    ], c);
  },
};

// DISINTEGRATE: a transition (Final Fantasy's: AJ, "they violently shake and disintegrate into pixels/dust"). The sprite
// is cut into `grain` px pieces, each of 16 classes (hashed; for "outward" its compass side of the middle and one of two
// waves). Progress 0 is the sprite; it shakes harder and harder (up to `shake` px, mostly sideways, a fresh jolt every
// frame) to 40; from 24 to 70 the classes break off one by one and drift away on their own path (`drift`), steadily,
// each piece gone at its own moment before progress 100, which is empty. The pieces keep the sprite's own colors,
// turn the dust color two thirds of their life along, or are dust from the start. Play 0 → 100 once (a game drives `progress`).
SHADER_DEFS.disintegrate = {
  label: "Disintegrate", title: "it shakes violently, then breaks into pixels that drift away as dust, ending empty",
  group: "Sprite FX", kind: "sprite", transition: "covered", frames: 24, fps: 12, pad: [12, 10, 8, 10], still0: true,
  tags: ["silly", "defeat", "death", "dust", "disintegrate", "shatter", "crumble", "vanish", "final fantasy", "thanos"],
  params: {
    progress: shaderWorldProgress(),
    shake: { type: "int", min: 0, max: 4, def: 3, label: "Shakes (px)" },
    grain: { type: "int", min: 1, max: 4, def: 2, label: "Pieces (px)" },
    drift: { type: "int", min: 0, max: 3, def: 0, label: "The pieces drift", choices: ["up, as dust", "outward, in a burst", "down, crumbling", "away on the wind"] },
    colouring: { type: "int", min: 0, max: 2, def: 0, label: "The pieces", choices: ["its colors, then dust", "its own colors", "dust"] },
    dust: { type: "colour", def: "#cfc6b8", label: "Dust" },
    seed: { type: "int", min: 0, max: 999, def: 9, label: "Seed" },
  },
  fragment: function (S) {
    const N = 16, p = S.progress(), seed = S.p("seed"), g = S.p("grain"), dr = S.p("drift"), out = S.eq(dr, 1), tone = S.p("colouring");
    // the 16 classes: release (progress), and drift (px at progress 100) per way; within the pad 12 / 10 / 8 / 10
    const T_ALL = [], T_OUT = [], DX = [], DY = [];
    const V8 = [[0, -12], [8, -9], [10, 0], [8, 7], [0, 8], [-8, 7], [-10, 0], [-8, -9]];
    for (let c = 0; c < N; c++) {
      const s = (c * 7) % 5, side = (c % 5) - 2, o = c % 8, wave = c >> 3;
      T_ALL.push(24 + 3 * c);
      T_OUT.push(wave ? 46 + 3 * o : 28 + 2 * o);
      DX.push([side * 2, Math.round(V8[o][0] * (wave ? 7 : 10) / 10) + (o % 4 === 0 ? side : 0), side * 2, 7 + (s % 4)]);
      DY.push([-(8 + s), Math.round(V8[o][1] * (wave ? 7 : 10) / 10), 5 + (s % 4), side - 1]);
    }
    const classOf = function (qx, qy) {                                   // → [class 0..15, its hash]
      const cx = S.div(qx, g), cy = S.div(qy, g), h = S.hash(cx, cy, seed);
      const ddx = S.sub(S.add(S.mul(cx, S.mul(g, 2)), g), S.w), ddy = S.sub(S.add(S.mul(cy, S.mul(g, 2)), g), S.h);
      const sx = S.sel(S.gt(S.mul(S.abs(ddx), 5), S.mul(S.abs(ddy), 2)), S.sel(S.lt(ddx, 0), -1, 1), 0);
      const sy = S.sel(S.gt(S.mul(S.abs(ddy), 5), S.mul(S.abs(ddx), 2)), S.sel(S.lt(ddy, 0), -1, 1), 0);
      const oct = S.table([7, 6, 5, 0, 0, 4, 1, 2, 3], S.add(S.mul(S.add(sx, 1), 3), S.add(sy, 1)));
      return [S.sel(out, S.add(oct, S.mul(S.mod(h, 2), 8)), S.mod(h, N)), h];
    };
    const relOf = function (cls) { return S.sel(out, S.table(T_OUT, cls), S.table(T_ALL, cls)); };
    const dust = S.p("dust");
    const cases = [];
    for (let c = 0; c < N; c++) {
      const T = S.sel(out, T_OUT[c], T_ALL[c]), A = S.sub(100, T), a = S.sub(p, T);
      const by = function (tab) { return S.pick([[S.eq(dr, 1), tab[1]], [S.eq(dr, 2), tab[2]], [S.eq(dr, 3), tab[3]]], tab[0]); };
      const m = a, mm = A;                                                            // 0 .. 1 of the way, steadily
      const qx = S.sub(S.x, S.div(S.mul(by(DX[c]), m), mm)), qy = S.sub(S.y, S.div(S.mul(by(DY[c]), m), mm));
      const q = S.texAt(qx, qy), k = classOf(qx, qy), life = S.div(S.mul(A, S.add(45, S.mod(S.div(k[1], 16), 56))), 100);
      const hit = S.and(S.ge(a, 0), S.lt(a, life), S.solid(q), S.eq(k[0], c));
      const col = S.pick([[S.eq(tone, 1), q], [S.eq(tone, 2), dust]], S.sel(S.gt(S.mul(a, 3), S.mul(life, 2)), dust, q));
      cases.push([hit, col]);
    }
    // what has not broken off yet shakes
    const amp = S.div(S.mul(S.p("shake"), S.min(p, 40)), 40), hs = S.hash(S.frame, p, S.add(seed, 61));
    const jx = S.sub(S.mod(hs, S.add(S.mul(amp, 2), 1)), amp), jy = S.sub(S.mod(S.div(hs, 13), S.add(amp, 1)), S.div(amp, 2));
    const sx = S.sub(S.x, jx), sy = S.sub(S.y, jy), q0 = S.texAt(sx, sy);
    cases.push([S.and(S.solid(q0), S.lt(p, relOf(classOf(sx, sy)[0]))), q0]);
    return S.pick(cases, S.clear);
  },
};

SHADER_DEFS.spin.variants = [{ dir: 1, positions: 2, turns: 2 }, { positions: 0, edges: 1 }];
SHADER_DEFS.tilt.variants = [{ angle: 45, motion: 1 }, { angle: -135, motion: 2, edges: 1 }, { angle: 90, motion: 1 }];
SHADER_DEFS.flip.variants = [{ axis: 1, back: 1, depth: 2 }, { motion: 1, back: 2, depth: 0, shade: 0 }, { motion: 2, back: 3, shade: 100 }];
SHADER_DEFS.powerlines.variants = [{ motion: 1, shape: 1, count: 20 }, { motion: 2, count: 24, reach: 3 }];
SHADER_DEFS.superform.variants = [{ body: 1, flicker: 100, sparkles: 100, flare: 2 }, { flicker: 0, sparkles: 0 }];
SHADER_DEFS.afterimage.variants = [{ dir: 3, motion: 1, count: 4, fade: 100 }, { dir: 0, motion: 2, spacing: 2, tinted: 100 }];
SHADER_DEFS.rainbowtrail.variants = [{ blend: 1, bands: 3 }, { dir: 1, wave: 1, reach: 6, bands: 8 }, { dir: 4, blend: 1 }];
SHADER_DEFS.sizzle.variants = [{ jitter: 2, crackle: 100, wisps: 100 }, { heat: ["#ffffff", "#9ae8ff", "#4a8aff"], wisps: 0, jitter: 0 }];
SHADER_DEFS.disintegrate.variants = [{ drift: 1, progress: 50 }, { drift: 2, grain: 1, colouring: 2, progress: 60 }, { drift: 3, grain: 4, colouring: 1, progress: 45 }, { shake: 4, progress: 20 }];

// ---- Tint (build 10) ----
// ======================================================================================================================
// AJ, 2026-10-17: "just a simple solid color opacity shader. If you want to make a sprite red, overlay a red filter and
// have an opacity amount." A STEADY overlay (hitflash is a blink that rests; silhouette replaces every pixel; charge and
// rainbow move). Data only, on the IR as it is. Solid pixels (alpha >= 128) are tinted and keep their own alpha; pixels
// below that are left exactly as they are (clear stays clear). Every mode at amount 0 is the plain image.
//   mix           each channel a straight blend toward the color: c + (color - c) x amount / 100
//   multiply      toward c x color / 255 (darkens: a red filter over the sprite)
//   screen        toward 255 - (255 - c)(255 - color) / 255 (lightens: a colored light)
//   keep shading  toward the color carried by the pixel's luma (black stays black, mid-gray is the color, white stays
//                 white), so the sprite's shading reads through a strong tint
//   dithered      a 4 x 4 Bayer dither: amount % of the pixels become the color, the rest stay (no new colors)
// A game drives `amount` (0..100), `colour` and `mode` at run time: they are uniforms like every param (SHADER.md §5.5).
// ======================================================================================================================
SHADER_EFFECTS.push("tint");

SHADER_DEFS.tint = {
  label: "Tint", title: "a steady color laid over the sprite at a chosen strength (mix, multiply, screen, keep shading or dithered)",
  group: "Sprite FX", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["tint", "colour", "color", "overlay", "filter", "opacity", "red", "hurt", "damage", "status", "poisoned", "frozen", "night", "team color"],
  params: {
    colour: { type: "colour", def: "#ff2020", label: "Color" },
    amount: { type: "int", min: 0, max: 100, def: 50, label: "Amount (%)" },
    mode: { type: "int", min: 0, max: 4, def: 0, label: "Blend", choices: ["mix", "multiply", "screen (lighten)", "keep shading", "dithered"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), T = S.p("colour"), amt = S.p("amount"), m = S.p("mode"), L = S.luma(c);
    const cs = [S.r(c), S.g(c), S.b(c)], ts = [S.r(T), S.g(T), S.b(T)];
    const target = function (i) {
      return S.pick([
        [S.eq(m, 1), S.div(S.mul(cs[i], ts[i]), 255)],
        [S.eq(m, 2), S.sub(255, S.div(S.mul(S.sub(255, cs[i]), S.sub(255, ts[i])), 255))],
        [S.eq(m, 3), S.sel(S.lt(L, 128), S.div(S.mul(ts[i], L), 128), S.add(ts[i], S.div(S.mul(S.sub(255, ts[i]), S.sub(L, 128)), 127)))],
      ], ts[i]);
    };
    const blend = S.rgba(S.mix(cs[0], target(0), amt, 100), S.mix(cs[1], target(1), amt, 100), S.mix(cs[2], target(2), amt, 100), S.a(c));
    const bayer = S.table([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], S.add(S.mul(S.mod(S.y, 4), 4), S.mod(S.x, 4)));
    const dith = S.sel(S.lt(S.div(S.mul(bayer, 100), 16), amt), S.rgba(ts[0], ts[1], ts[2], S.a(c)), c);
    return S.sel(S.solid(c), S.sel(S.eq(m, 4), dith, blend), c);
  },
};
SHADER_DEFS.tint.variants = [{ mode: 1, amount: 100 }, { mode: 2, amount: 70, colour: "#3a6aff" }, { mode: 3, amount: 100, colour: "#40d060" },
  { mode: 4, amount: 25 }, { mode: 4, amount: 75, colour: "#ffffff" }, { amount: 100, colour: "#202040" }];

// ---- Painter Panic ports (build 11) ----
// ======================================================================================================================
// AJ's own Godot canvas_item shaders from his game Painter Panic (splotch2/assets/Shaders), adapted with his blessing and
// RE-EXPRESSED in the integer IR (no new op, no printer change): the idea and the parameters that matter kept, floats,
// sin-hash noise and smoothsteps replaced by integer hashes, tables and squared distances. Private helpers shaderPaint*.
//   googly     googly.gdshader: a plastic eye stuck on the sprite; the loose pupil swings, overshoots and settles
//   camo       camo.gdshader: warped noise cut into hard tones of each pixel's OWN color (the hue survives)
//   bricks     canvas-bricks.gdshader: the picture laid as toy bricks, staggered, beveled, a stud on every cell
//   glass      canvas-glass.gdshader: stained glass, Voronoi pieces of one color each, backlit, lead between
//   print      canvas-print.gdshader: a cheap screenprint, the inks out of register, flat, punched, on paper tooth
//   paintmelt  transition-drip.gdshader: the screen slides off like wet paint, drips running ahead, a wet rim
// The ball shaders drew an orb of one color; here they work on a sprite's own pixels and silhouette.
// ======================================================================================================================

SHADER_EFFECTS.push("googly", "camo", "bricks", "glass", "print", "paintmelt");

// smooth value noise 0..255: hashed knots every `cell` px, bilinear with a smoothstep weight (canvas-common's noise)
function shaderPaintNoise(S, x, y, cell, seed) {
  const cx = S.div(x, cell), cy = S.div(y, cell);
  const sm = function (v) { const f = S.div(S.mul(S.mod(v, cell), 256), cell); return S.div(S.mul(S.mul(f, f), S.sub(768, S.mul(f, 2))), 65536); };
  const wx = sm(x), wy = sm(y);
  const k = function (i, j) { return S.mod(S.hash(S.add(cx, i), S.add(cy, j), seed), 256); };
  const top = S.mix(k(0, 0), k(1, 0), wx, 256), bot = S.mix(k(0, 1), k(1, 1), wx, 256);
  return S.mix(top, bot, wy, 256);
}
// a color x num / 100 + add per channel, alpha kept (free effects)
function shaderPaintShade(S, c, num, add) {
  const f = function (v) { return S.add(S.div(S.mul(v, num), 100), add || 0); };
  return S.rgba(f(S.r(c)), f(S.g(c)), f(S.b(c)), S.a(c));
}
// saturation about the pixel's own gray, x pct / 100 (canvas-glass's richness, canvas-print's punch)
function shaderPaintPunch(S, c, pct) {
  const grey = S.luma(c), f = function (v) { return S.add(grey, S.div(S.mul(S.sub(v, grey), pct), 100)); };
  return S.rgba(f(S.r(c)), f(S.g(c)), f(S.b(c)), S.a(c));
}

SHADER_DEFS.googly = {
  label: "Googly eyes", title: "plastic googly eyes stuck on the sprite; the loose pupils swing, overshoot and settle",
  group: "Sprite FX", kind: "sprite", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["silly", "googly", "eyes", "cartoon", "funny", "wobble", "derp", "sticker", "painter panic"],
  params: {
    eyes: { type: "int", min: 0, max: 1, def: 1, label: "Eyes", choices: ["one", "a pair"] },
    size: { type: "int", min: 2, max: 10, def: 4, label: "Eye radius (px)" },
    pupil: { type: "int", min: 1, max: 6, def: 2, label: "Pupil radius (px)" },
    across: { type: "int", min: 0, max: 100, def: 55, label: "Across the sprite (%)" },
    drop: { type: "int", min: 0, max: 16, def: 1, label: "Below the top edge (px)" },
    swing: { type: "int", min: 0, max: 170, def: 110, label: "Swing (degrees)" },
    swings: { type: "int", min: 1, max: 4, def: 2, label: "Swings a loop" },
    settle: { type: "int", min: 0, max: 1, def: 0, label: "Motion", choices: ["settles each loop", "keeps swinging"] },
    rim: { type: "int", min: 0, max: 1, def: 1, label: "Rim", choices: ["none", "dark ring"] },
    white: { type: "colour", def: "#f7f7fa", label: "Eye" },
    black: { type: "colour", def: "#0f0d12", label: "Pupil" },
    shine: { type: "colour", def: "#ffffff", label: "Shine" },
    ring: { type: "colour", def: "#2a2630", label: "Rim color" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), R = S.p("size"), pr = S.min(S.p("pupil"), S.sub(R, 1)), pair = S.eq(S.p("eyes"), 1);
    const mid = S.div(S.mul(S.sub(S.w, 1), S.p("across")), 100);
    // the head under the eyes: the first row (of the top 64) solid at the middle and at both sides of the eyes, so they
    // sit ON the sprite where it is wide enough to hold them (a potion's bulb, not its cork)
    const span = S.sel(pair, S.add(S.add(R, 1), S.div(R, 2)), S.div(R, 2));
    // (a thin sprite, a sword, has no such row: then the first solid row of the middle column, the eyes clipped to it)
    let wide = S.i(999), thin = S.i(999);
    for (let k = 63; k >= 0; k--) {
      const here = S.solid(S.texAt(mid, k));
      wide = S.sel(S.and(here, S.solid(S.texAt(S.sub(mid, span), k)), S.solid(S.texAt(S.add(mid, span), k))), k, wide);
      thin = S.sel(here, k, thin);
    }
    const top = S.sel(S.lt(wide, 999), wide, thin);
    const cy = S.add(S.add(top, R), S.p("drop")), found = S.lt(top, 999);
    const gap = S.add(R, 1), F = S.FRAMES, f = S.frame;
    const env = S.sel(S.eq(S.p("settle"), 0), S.div(S.mul(S.sub(F, f), S.sub(F, f)), F * F / 100 | 0), 100);   // 0..100
    const eye = function (cx, phase) {
      const th = S.div(S.mul(S.div(S.mul(S.p("swing"), env), 100), shaderMotionCos(S, S.add(S.div(S.mul(S.mul(f, S.p("swings")), 360), F), phase))), 1000);
      const room = S.max(S.sub(S.sub(R, pr), 1), 0);
      const px = S.add(cx, S.div(S.add(S.mul(shaderMotionSin(S, th), room), 500), 1000));
      const py = S.add(cy, S.div(S.add(S.mul(shaderMotionCos(S, th), room), 500), 1000));     // gravity: it hangs down
      const dx = S.sub(S.x, cx), dy = S.sub(S.y, cy), d2 = S.add(S.mul(dx, dx), S.mul(dy, dy));
      const qx = S.sub(S.x, px), qy = S.sub(S.y, py), q2 = S.add(S.mul(qx, qx), S.mul(qy, qy));
      const in_ = S.le(d2, S.add(S.mul(R, R), R)), ring = S.and(S.eq(S.p("rim"), 1), S.gt(d2, S.sub(S.mul(R, R), R)));
      const sh = S.div(S.mul(R, 2), 5);
      const shine = S.and(S.eq(S.x, S.sub(cx, sh)), S.eq(S.y, S.sub(cy, sh)));
      const col = S.pick([[ring, S.p("ring")], [shine, S.p("shine")], [S.le(q2, S.add(S.mul(pr, pr), pr)), S.p("black")]], S.p("white"));
      return [in_, col];
    };
    const a = eye(S.sel(pair, S.sub(mid, gap), mid), 0), b = eye(S.add(mid, gap), 70);
    const on = S.and(S.solid(c), found);
    return S.pick([[S.and(on, a[0]), a[1]], [S.and(on, pair, b[0]), b[1]]], c);
  },
};

SHADER_DEFS.camo = {
  label: "Camo", title: "camouflage patches in hard tones of each pixel's own color",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["camo", "camouflage", "army", "military", "pattern", "patches", "stealth", "tank", "material", "painter panic"],
  params: {
    blot: { type: "int", min: 2, max: 24, def: 6, label: "Patch size (px)" },
    spread: { type: "int", min: 0, max: 100, def: 62, label: "Torn edges (%)" },
    tones: { type: "int", min: 2, max: 5, def: 4, label: "Tones" },
    dark: { type: "int", min: 0, max: 100, def: 42, label: "Dark tone (% darker)" },
    pale: { type: "int", min: 0, max: 100, def: 34, label: "Pale tone (% to white)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Pattern" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.p("blot"), sd = S.mul(S.p("seed"), 8);
    // warped before it is sampled: what turns round blobs into torn, lobed patches
    const w1 = S.sub(shaderPaintNoise(S, S.x, S.y, S.max(S.div(S.mul(P, 10), 17), 1), S.add(sd, 1)), 128);
    const w2 = S.sub(shaderPaintNoise(S, S.add(S.x, 37), S.add(S.y, 11), S.max(S.div(S.mul(P, 10), 17), 1), S.add(sd, 2)), 128);
    const amt = S.mul(S.p("spread"), P);
    const ox = S.div(S.mul(w1, amt), 10667), oy = S.div(S.mul(w2, amt), 10667);    // up to 1.2 cells each way at 100 %
    const n1 = shaderPaintNoise(S, S.add(S.x, ox), S.add(S.y, oy), P, S.add(sd, 3));
    const n2 = shaderPaintNoise(S, S.add(S.x, S.div(ox, 2)), S.add(S.y, S.div(oy, 2)), S.max(S.div(S.mul(P, 10), 23), 1), S.add(sd, 4));
    const n = S.div(S.add(S.mul(n1, 62), S.mul(n2, 38)), 100), T = S.p("tones");
    const band = S.min(S.div(S.mul(n, T), 256), S.sub(T, 1)), t = S.div(S.mul(band, 100), S.sub(T, 1));
    const dk = shaderPaintShade(S, c, S.sub(100, S.p("dark")), 0);
    const pl = function (v) { return S.add(v, S.div(S.mul(S.sub(255, v), S.p("pale")), 100)); };
    const lt = S.rgba(pl(S.r(c)), pl(S.g(c)), pl(S.b(c)), 255);
    return S.sel(S.solid(c), S.mixc(dk, lt, t, 100), S.clear);
  },
};

SHADER_DEFS.bricks = {
  label: "Toy bricks", title: "the picture built from toy bricks: runs of a color laid as staggered bricks, a stud on every cell",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [5, 5, 5, 5],
  tags: ["bricks", "toy", "lego", "plastic", "studs", "blocks", "build", "mosaic", "fun", "painter panic"],
  params: {
    size: { type: "int", min: 3, max: 10, def: 6, label: "Stud size (px)" },
    longest: { type: "int", min: 1, max: 6, def: 4, label: "Longest brick (studs)" },
    studs: { type: "int", min: 0, max: 1, def: 0, label: "Top", choices: ["a stud on every cell", "smooth tiles"] },
    match: { type: "int", min: 0, max: 128, def: 38, label: "Same color within" },
    shine: { type: "int", min: 0, max: 100, def: 50, label: "Gloss (%)" },
  },
  fragment: function (S) {
    const s = S.p("size"), L = S.p("longest"), half = S.div(s, 2);
    const cx = S.div(S.x, s), cy = S.div(S.y, s), fx = S.mod(S.x, s), fy = S.mod(S.y, s);
    const cell = function (i) { return S.texAt(S.add(S.mul(S.add(cx, i), s), half), S.add(S.mul(cy, s), half), "clamp"); };
    const c = cell(0), cl = cell(-1), cr = cell(1), tol = S.p("match");
    const same = function (o) {
      return S.and(S.solid(o), S.le(S.abs(S.sub(S.r(o), S.r(c))), tol), S.le(S.abs(S.sub(S.g(o), S.g(c))), tol), S.le(S.abs(S.sub(S.b(o), S.b(c))), tol));
    };
    const stg = S.mul(S.mod(cy, 2), S.div(L, 2));                     // staggered row to row, as a wall is
    const joinL = S.and(same(cl), S.ne(S.mod(S.add(cx, stg), L), 0)), joinR = S.and(same(cr), S.ne(S.mod(S.add(S.add(cx, 1), stg), L), 0));
    const last = S.sub(s, 1);
    const gap = S.or(S.eq(fy, last), S.and(S.eq(fx, last), S.not(joinR)));
    const lit = S.or(S.eq(fy, 0), S.and(S.eq(fx, 0), S.not(joinL)));
    const shade = S.or(S.eq(fy, S.sub(s, 2)), S.and(S.eq(fx, S.sub(s, 2)), S.not(joinR)));
    const gloss = S.div(S.mul(S.mul(S.p("shine"), 26), S.sub(s, fy)), S.mul(100, s));
    // the stud, in half pixels about the cell's middle, with its shadow down and to the right
    const dx = S.sub(S.add(S.mul(fx, 2), 1), s), dy = S.sub(S.add(S.mul(fy, 2), 1), s), Rr = S.div(S.mul(s, 60), 100);
    const r2 = S.add(S.mul(dx, dx), S.mul(dy, dy)), R2 = S.add(S.mul(Rr, Rr), Rr);
    const sx = S.sub(dx, 2), sy = S.sub(dy, 2), studOn = S.eq(S.p("studs"), 0);
    const stud = S.and(studOn, S.le(r2, R2)), studShadow = S.and(studOn, S.le(S.add(S.mul(sx, sx), S.mul(sy, sy)), R2));
    const studLit = S.lt(S.add(dx, dy), S.neg(Rr)), studDark = S.gt(S.add(dx, dy), Rr);
    const col = S.pick([
      [stud, S.pick([[studLit, shaderPaintShade(S, c, 116, 22)], [studDark, shaderPaintShade(S, c, 90, 0)]], shaderPaintShade(S, c, 106, gloss))],
      [gap, shaderPaintShade(S, c, 35, 0)],
      [lit, shaderPaintShade(S, c, 118, 8)],
      [shade, shaderPaintShade(S, c, 72, 0)],
      [studShadow, shaderPaintShade(S, c, 72, 0)],
    ], shaderPaintShade(S, c, 100, gloss));
    return S.sel(S.solid(c), S.rgba(S.r(col), S.g(col), S.b(col), 255), S.clear);
  },
};

SHADER_DEFS.glass = {
  label: "Stained glass", title: "stained glass: pieces of one color each, lit from behind, held in dark lead",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["stained glass", "glass", "church", "cathedral", "windows", "voronoi", "shards", "jewel", "painter panic"],
  params: {
    piece: { type: "int", min: 3, max: 24, def: 7, label: "Piece size (px)" },
    lead: { type: "int", min: 0, max: 3, def: 1, label: "Lead width (px)" },
    came: { type: "colour", def: "#120f17", label: "Lead" },
    glow: { type: "int", min: 0, max: 150, def: 42, label: "Backlight (%)" },
    rich: { type: "int", min: 100, max: 250, def: 135, label: "Richness (%)" },
    edge: { type: "int", min: 0, max: 1, def: 0, label: "Silhouette", choices: ["leaded round", "open"] },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cut" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.p("piece"), sd = S.mul(S.p("seed"), 2);
    const gx = S.div(S.x, P), gy = S.div(S.y, P);
    let d1 = S.i(9999999), d2 = S.i(9999999), ax = S.i(0), ay = S.i(0), bx = S.i(0), by = S.i(0);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const nx = S.add(gx, i), ny = S.add(gy, j);
      const sx = S.add(S.mul(nx, P), S.mod(S.hash(nx, ny, sd), P)), sy = S.add(S.mul(ny, P), S.mod(S.hash(nx, ny, S.add(sd, 1)), P));
      const ex = S.sub(S.x, sx), ey = S.sub(S.y, sy), d = S.add(S.mul(ex, ex), S.mul(ey, ey));
      const first = S.lt(d, d1), second = S.lt(d, d2);
      d2 = S.sel(first, d1, S.sel(second, d, d2)); bx = S.sel(first, ax, S.sel(second, sx, bx)); by = S.sel(first, ay, S.sel(second, sy, by));
      d1 = S.sel(first, d, d1); ax = S.sel(first, sx, ax); ay = S.sel(first, sy, ay);
    }
    const s = S.texAt(ax, ay, "clamp"), base = S.sel(S.solid(s), s, c);
    const rich = shaderPaintPunch(S, base, S.p("rich"));
    const k = S.max(S.sub(100, S.div(S.mul(d1, 10000), S.mul(S.mul(P, P), 49))), 0);   // bright at the seed, none past 0.7 of a piece
    const lit = shaderPaintShade(S, rich, S.add(100, S.div(S.mul(k, S.p("glow")), 100)), 0);
    // the came: within lead / 2 px of the line between the two nearest seeds (d2 - d1 = 2 x dist x |seed2 - seed1|)
    const ux = S.sub(bx, ax), uy = S.sub(by, ay), e2 = S.add(S.mul(ux, ux), S.mul(uy, uy)), diff = S.sub(d2, d1), Ld = S.p("lead");
    const join = S.and(S.gt(Ld, 0), S.lt(S.mul(diff, diff), S.mul(S.mul(Ld, Ld), e2)));
    const rimEdge = S.and(S.eq(S.p("edge"), 0), S.not(S.and(S.solid(shaderLooksAt(S, 1, 0)), S.solid(shaderLooksAt(S, -1, 0)), S.solid(shaderLooksAt(S, 0, 1)), S.solid(shaderLooksAt(S, 0, -1)))));
    const out = S.sel(S.or(join, rimEdge), S.p("came"), lit);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.print = {
  label: "Screenprint", title: "a cheap screenprint: the inks out of register, flat and punchy, on paper tooth",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [6, 6, 6, 6],
  tags: ["screenprint", "print", "poster", "risograph", "misregistered", "pop art", "hippie", "retro", "ink", "painter panic"],
  params: {
    miss: { type: "int", min: 0, max: 6, def: 2, label: "Misregistration (px)" },
    inks: { type: "int", min: 2, max: 8, def: 4, label: "Inks per channel" },
    punch: { type: "int", min: 100, max: 250, def: 145, label: "Punch (%)" },
    grain: { type: "int", min: 0, max: 100, def: 55, label: "Paper tooth (%)" },
  },
  fragment: function (S) {
    const m = S.p("miss"), a = S.div(S.add(S.mul(m, 87), 50), 100), b = S.div(S.add(S.mul(m, 50), 50), 100);
    // each screen goes down at its own angle, so each misses by its own direction
    const cr = S.tex(0, 0), qr = S.texAt(S.add(S.x, a), S.add(S.y, b), "clamp"), qg = S.texAt(S.sub(S.x, a), S.add(S.y, b), "clamp"), qb = S.texAt(S.x, S.sub(S.y, m), "clamp");
    const ch = function (q, v) { return S.sel(S.solid(q), v, 0); };
    const mixd = S.rgba(ch(qr, S.r(qr)), ch(qg, S.g(qg)), ch(qb, S.b(qb)), 255);
    const any = S.or(S.solid(qr), S.solid(qg), S.solid(qb));
    const p = shaderPaintPunch(S, mixd, S.p("punch")), n = S.sub(S.p("inks"), 1);
    const tooth = S.div(S.add(S.mul(S.mod(S.hash(S.div(S.x, 3), S.div(S.y, 3), 7), 256), 55), S.mul(S.mod(S.hash(S.x, S.y, 8), 256), 45)), 100);
    const g = S.div(S.mul(S.mul(S.sub(tooth, 128), S.p("grain")), 22), 10000);
    const q = function (v) { const k = S.div(S.add(S.mul(S.mul(S.clamp(v, 0, 255), n), 2), 255), 510); return S.add(S.div(S.mul(k, 255), n), g); };
    return S.sel(any, S.rgba(q(S.r(p)), q(S.g(p)), q(S.b(p)), 255), S.sel(S.solid(cr), cr, S.clear));
  },
};

SHADER_DEFS.paintmelt = {
  label: "Paint melt", title: "the screen slides off like wet paint, drips running ahead of it, a wet rim round every edge",
  group: "Transitions", kind: "screen", palette: "free", transition: "covered", reworks: true, frames: 32, fps: 20, pad: [0, 0, 0, 0], still0: true,
  tags: ["melt", "drip", "paint", "wet", "doom", "wipe", "slide", "goo", "transition", "painter panic"],
  params: {
    progress: { type: "int", min: -1, max: 100, def: -1, label: "Progress (-1 plays on time)" },
    cover: { type: "colour", def: "#000000", label: "Underneath" },
    stagger: { type: "int", min: 0, max: 80, def: 30, label: "Stagger (%)" },
    waves: { type: "int", min: 1, max: 8, def: 3, label: "Waves across" },
    spacing: { type: "int", min: 3, max: 24, def: 8, label: "Drip spacing (px)" },
    reach: { type: "int", min: 0, max: 50, def: 24, label: "Longest drip (% of height)" },
    wet: { type: "int", min: 0, max: 100, def: 40, label: "Wet rim (% darker)" },
  },
  fragment: function (S) {
    const p = S.progress(), st = S.p("stagger"), W = S.p("spacing");
    const delay = S.div(S.mul(shaderPaintNoise(S, S.x, 0, S.max(S.div(S.w, S.p("waves")), 1), 5), st), 255);
    const t = S.clamp(S.sub(S.div(S.mul(p, S.add(100, st)), 100), delay), 0, 100), live = S.gt(t, 0);
    const fall = S.div(S.mul(S.div(S.mul(S.mul(t, t), 125), 100), S.h), 10000);     // speeds up; 125 % is off the bottom
    const cell = S.div(S.x, W), h1 = S.hash(cell, 1, 9), h2 = S.hash(cell, 4, 9), h3 = S.hash(cell, 7, 9);
    const centre = S.add(S.add(S.mul(cell, W), S.div(W, 2)), S.div(S.mul(S.sub(S.mod(h2, 49), 24), W), 200));
    const l = S.mod(h1, 101), grow = S.div(S.mul(S.min(t, 35), 100), 35);
    const tip = S.add(fall, S.div(S.mul(S.mul(S.h, S.p("reach")), S.div(S.mul(S.div(S.mul(l, l), 100), grow), 100)), 10000));
    const r = S.div(S.mul(S.mul(W, S.add(15, S.div(S.mul(S.mod(h3, 101), 20), 100))), S.min(t, 12)), 1200);
    const dx = S.abs(S.sub(S.x, centre)), dy = S.sub(S.y, tip), b2 = S.add(S.mul(dx, dx), S.mul(dy, dy));
    const R = S.max(S.div(S.mul(S.h, 18), 1000), 1);
    const gone = S.or(S.lt(S.y, fall), S.and(live, S.gt(r, 0), S.or(S.and(S.le(S.mul(dx, 10), S.mul(r, 6)), S.lt(S.y, tip)), S.le(b2, S.mul(r, r)))));
    const rim = S.and(live, S.or(S.lt(S.sub(S.y, fall), R), S.and(S.gt(r, 0), S.or(S.and(S.lt(S.sub(S.mul(dx, 10), S.mul(r, 6)), S.mul(R, 10)), S.lt(dy, R)), S.lt(b2, S.mul(S.add(r, R), S.add(r, R)))))));
    const old = S.texAt(S.x, S.sub(S.y, fall), "clamp");
    return S.pick([[gone, S.p("cover")], [rim, shaderPaintShade(S, old, S.sub(100, S.p("wet")), 0)]], old);
  },
};

SHADER_DEFS.googly.variants = [{ eyes: 0, size: 7, pupil: 3, settle: 1 }, { swing: 170, swings: 4, rim: 0, drop: 4 }];
SHADER_DEFS.camo.variants = [{ blot: 12, tones: 3, seed: 7 }, { blot: 3, spread: 100, tones: 5, dark: 70 }];
SHADER_DEFS.bricks.variants = [{ size: 4, longest: 2 }, { size: 9, studs: 1, match: 0 }];
SHADER_DEFS.glass.variants = [{ piece: 4, lead: 1, edge: 1 }, { piece: 14, lead: 2, glow: 120, seed: 9 }];
SHADER_DEFS.print.variants = [{ miss: 5, inks: 2 }, { miss: 1, inks: 6, grain: 0, punch: 220 }];
SHADER_DEFS.paintmelt.variants = [{ progress: 45 }, { progress: 70, spacing: 4, reach: 50, stagger: 80 }, { progress: 30, waves: 8, wet: 100 }];

// ---- Painter Panic ports, batch 2 (build 12) ----
// ======================================================================================================================
// Four more of AJ's Painter Panic shaders (splotch2/assets/Shaders), adapted with his blessing and RE-EXPRESSED in the
// integer IR as batch 1 was (no new op, no printer change; private helpers shaderPaint*):
//   mosaic       canvas-mosaic.gdshader: tesserae in dark mortar, every chip its own shade, beveled and tilted
//   crossstitch  cross-stitch.gdshader: a grid of X stitches in the picture's colors, the two legs lit differently
//   brushwipe    transition-brush.gdshader: wide brush strokes across the screen, alternate ways, a ragged bristle front
//   woodblock    canvas-woodblock.gdshader: ukiyo-e: flat inks, a hand-cut key line, blocks out of register, washi
// The canvas shaders read a board one texel per cell; their ports read any image at 1 px.
// ======================================================================================================================

SHADER_EFFECTS.push("mosaic", "crossstitch", "brushwipe", "woodblock");

// the two nearest seeds of a jittered grid of P px (3 x 3 cells): { d1, d2, ax, ay, bx, by } (canvas-common's voronoi)
function shaderPaintCells(S, P, sd) {
  const gx = S.div(S.x, P), gy = S.div(S.y, P);
  let d1 = S.i(9999999), d2 = S.i(9999999), ax = S.i(0), ay = S.i(0), bx = S.i(0), by = S.i(0);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const nx = S.add(gx, i), ny = S.add(gy, j);
    const sx = S.add(S.mul(nx, P), S.mod(S.hash(nx, ny, sd), P)), sy = S.add(S.mul(ny, P), S.mod(S.hash(nx, ny, S.add(sd, 1)), P));
    const ex = S.sub(S.x, sx), ey = S.sub(S.y, sy), d = S.add(S.mul(ex, ex), S.mul(ey, ey));
    const first = S.lt(d, d1), second = S.lt(d, d2);
    d2 = S.sel(first, d1, S.sel(second, d, d2)); bx = S.sel(first, ax, S.sel(second, sx, bx)); by = S.sel(first, ay, S.sel(second, sy, by));
    d1 = S.sel(first, d, d1); ax = S.sel(first, sx, ax); ay = S.sel(first, sy, ay);
  }
  return { d1: d1, d2: d2, ax: ax, ay: ay, bx: bx, by: by };
}
// within w HALF px of the line between the two nearest seeds (glass's came test, in half-pixel steps)
function shaderPaintJoin(S, v, w) {
  const ux = S.sub(v.bx, v.ax), uy = S.sub(v.by, v.ay), e2 = S.add(S.mul(ux, ux), S.mul(uy, uy)), diff = S.mul(S.sub(v.d2, v.d1), 2);
  return S.lt(S.mul(diff, diff), S.mul(S.mul(w, w), e2));
}
// a toward b by t / 100 per channel, opaque (free effects)
function shaderPaintMix(S, a, b, t) { return S.mixc(S.rgba(S.r(a), S.g(a), S.b(a), 255), S.rgba(S.r(b), S.g(b), S.b(b), 255), t, 100); }

SHADER_DEFS.mosaic = {
  label: "Mosaic", title: "the picture cut into tesserae: a few chips each in dark mortar, every chip its own shade, beveled and tilted",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["mosaic", "tesserae", "tiles", "chips", "roman", "byzantine", "stone", "glass", "mortar", "painter panic"],
  params: {
    chip: { type: "int", min: 3, max: 16, def: 5, label: "Chip size (px)" },
    grout: { type: "int", min: 0, max: 3, def: 1, label: "Mortar (px)" },
    mortar: { type: "colour", def: "#292421", label: "Mortar" },
    vary: { type: "int", min: 0, max: 50, def: 15, label: "Shade per chip (%)" },
    bevel: { type: "int", min: 0, max: 100, def: 38, label: "Bevel light (%)" },
    ground: { type: "int", min: 0, max: 1, def: 0, label: "Grays", choices: ["chips of their own color", "gold leaf (black as basalt)"] },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cut" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), v = shaderPaintCells(S, S.p("chip"), S.add(S.mul(S.p("seed"), 2), 40));
    // what a chip is cut from: the color at its own middle, so it is never two colors across a join
    const s = S.texAt(v.ax, v.ay, "clamp"), cut = S.sel(S.solid(s), s, c);
    const roll = S.mod(S.hash(v.ax, v.ay, 31), 256), roll2 = S.mod(S.hash(v.ax, v.ay, 32), 256);
    const own = shaderPaintShade(S, cut, S.add(100, S.div(S.mul(S.sub(roll, 128), S.p("vary")), 128)), 0);
    const dense = S.rgba(S.div(S.mul(S.r(cut), S.r(cut)), 255), S.div(S.mul(S.g(cut), S.g(cut)), 255), S.div(S.mul(S.b(cut), S.b(cut)), 255), 255);
    const glassy = shaderPaintMix(S, own, dense, S.div(S.mul(roll2, 18), 255));          // a few chips read denser
    const hi = S.max(S.r(cut), S.max(S.g(cut), S.b(cut))), lo = S.min(S.r(cut), S.min(S.g(cut), S.b(cut)));
    const gold = S.eq(S.p("ground"), 1), dark = S.and(gold, S.lt(hi, 64)), bare = S.and(gold, S.not(dark), S.le(S.sub(hi, lo), 38));
    const basalt = shaderPaintShade(S, S.rgba(43, 43, 48, 255), S.add(100, S.div(S.mul(S.sub(roll, 128), 18), 128)), 0);
    const leaf = shaderPaintMix(S, shaderPaintShade(S, S.rgba(219, 173, 71, 255), S.add(100, S.div(S.mul(S.sub(roll, 128), 20), 128)), 0),
      S.rgba(250, 235, 179, 255), S.div(S.mul(roll2, 25), 255));
    const chip = S.pick([[dark, basalt], [bare, leaf]], glassy);
    // cut chips do not sit flush: the joint is `grout` px, some a half pixel wider
    const G = S.p("grout"), gap = S.sel(S.gt(G, 0), S.add(S.mul(G, 2), S.sel(S.gt(roll, 191), 1, 0)), 0);
    const joint = shaderPaintJoin(S, v, gap), rim = shaderPaintJoin(S, v, S.add(gap, 3));
    // each chip tilted its own way: a bright lip on the side it leans to, a shadow opposite, only near its rim
    const k = S.mod(S.hash(v.ax, v.ay, 33), 8), tx = S.table([1, 1, 0, -1, -1, -1, 0, 1], k), ty = S.table([0, 1, 1, 1, 0, -1, -1, -1], k);
    const facing = S.add(S.mul(S.sub(S.x, v.ax), tx), S.mul(S.sub(S.y, v.ay), ty)), B = S.p("bevel");
    const tilt = S.pick([[S.and(rim, S.gt(facing, 0)), S.add(100, B)], [S.and(rim, S.lt(facing, 0)), S.sub(100, S.div(B, 2))]], 100);
    // the chip's own grain, the mortar's sand, and the bed very slightly uneven across the picture
    const grain = S.add(97, S.mod(S.hash(S.x, S.y, 34), 7));
    const bed = S.add(94, S.div(S.mul(shaderPaintNoise(S, S.x, S.y, S.max(S.div(S.w, 5), 4), 35), 10), 255));
    const face = shaderPaintShade(S, chip, S.div(S.mul(S.div(S.mul(tilt, grain), 100), bed), 100), 0);
    const sand = shaderPaintShade(S, S.p("mortar"), S.div(S.mul(S.add(85, S.mod(S.hash(S.div(S.x, 2), S.div(S.y, 2), 36), 31)), bed), 100), 0);
    const out = S.sel(joint, sand, face);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.crossstitch = {
  label: "Cross-stitch", title: "worked in thread: a grid of X stitches in the picture's colors, the two legs lit differently, cloth between",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["cross-stitch", "stitch", "embroidery", "thread", "sewn", "craft", "cloth", "linen", "sampler", "painter panic"],
  params: {
    stitch: { type: "int", min: 3, max: 12, def: 5, label: "Stitch size (px)" },
    thread: { type: "int", min: 5, max: 40, def: 12, label: "Thread width (% of a stitch)" },
    sheen: { type: "int", min: 0, max: 100, def: 62, label: "Sheen (%)" },
    weave: { type: "int", min: 0, max: 100, def: 30, label: "Weave (%)" },
    ground: { type: "int", min: 0, max: 1, def: 0, label: "Between the stitches", choices: ["the thread's color, dark", "linen"] },
    linen: { type: "colour", def: "#e6dcc4", label: "Linen" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), s = S.p("stitch"), half = S.div(s, 2);
    const fx = S.mod(S.x, s), fy = S.mod(S.y, s);
    const f = S.texAt(S.add(S.mul(S.div(S.x, s), s), half), S.add(S.mul(S.div(S.y, s), s), half), "clamp"), floss = S.sel(S.solid(f), f, c);
    // half pixels about the stitch's middle: a leg's distance across is |u -+ v| / (2 sqrt 2) px, along it |u +- v| / (2 sqrt 2)
    const u = S.sub(S.add(S.mul(fx, 2), 1), s), v = S.sub(S.add(S.mul(fy, 2), 1), s);
    const wide = S.mul(S.mul(S.p("thread"), s), 283), cap = S.mul(S.mul(60, s), 283);
    const leg = function (across, along) { return S.and(S.le(S.mul(across, 10000), wide), S.le(S.mul(along, 10000), cap)); };
    const da = S.abs(S.sub(u, v)), db = S.abs(S.add(u, v));
    const legA = leg(da, db), legB = leg(db, da);
    // each leg lit along its length, brightest down its middle; the second leg (over the first) a shade lower
    const qa = S.div(S.mul(da, 1000000), S.max(wide, 1)), qb = S.div(S.mul(db, 1000000), S.max(wide, 1));     // 0..100 of the half width
    const sh = S.p("sheen");
    const litA = shaderPaintShade(S, floss, S.add(100, S.div(S.mul(sh, S.sub(45, S.div(S.mul(qa, 50), 100))), 100)), 0);
    const litB = shaderPaintShade(S, floss, S.add(86, S.div(S.mul(sh, S.sub(30, S.div(S.mul(qb, 40), 100))), 100)), 0);
    // the cloth: a hole at every stitch's corner, a basket weave between
    const hole = S.and(S.eq(fx, 0), S.eq(fy, 0)), w = S.sel(hole, 0, S.sel(S.eq(S.mod(S.add(S.x, S.y), 2), 1), 60, 100));
    const base = S.sel(S.eq(S.p("ground"), 1), S.p("linen"), shaderPaintMix(S, shaderPaintShade(S, floss, 55, 0), S.p("linen"), 20));   // dark: tinted by the cloth
    const cloth = shaderPaintShade(S, base, S.sub(100, S.div(S.mul(S.mul(S.p("weave"), S.sub(100, w)), 35), 10000)), 0);
    const out = S.pick([[legB, litB], [legA, litA]], cloth);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.brushwipe = {
  label: "Brush wipe", title: "the screen painted over in a few wide brush strokes, alternate ways, a ragged bristle front",
  group: "Transitions", kind: "screen", palette: "free", transition: "covered", reworks: true, frames: 32, fps: 20, pad: [0, 0, 0, 0], still0: true,
  tags: ["brush", "paint", "stroke", "wipe", "painter", "bristle", "sweep", "transition", "painter panic"],
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Paint" },
    strokes: { type: "int", min: 2, max: 12, def: 5, label: "Strokes" },
    sweep: { type: "int", min: 20, max: 100, def: 42, label: "Each stroke's share of the wipe (%)" },
    bristle: { type: "int", min: 0, max: 30, def: 7, label: "Ragged front (% of the width)" },
    wobble: { type: "int", min: 0, max: 20, def: 6, label: "Wobbly band edges (% of the height)" },
    ridge: { type: "int", min: 0, max: 100, def: 35, label: "Shadow ahead of the brush (% darker)" },
  },
  fragment: function (S) {
    const p = S.progress(), N = S.p("strokes"), sw = S.p("sweep");
    // band edges wobble, so neighboring strokes overlap like real ones, not ruled lines
    const y = S.add(S.y, S.div(S.mul(S.mul(S.sub(shaderPaintNoise(S, S.x, 11, S.max(S.div(S.w, 3), 1), 21), 128), S.p("wobble")), S.h), 25600));
    const band = S.clamp(S.div(S.mul(y, N), S.max(S.h, 1)), 0, S.sub(N, 1));
    // in 1/10000ths: each stroke starts a little after the one above and takes `sweep` % of the wipe
    const start = S.div(S.mul(S.mul(band, S.sub(100, sw)), 100), N);
    const f = S.clamp(S.div(S.mul(S.sub(S.mul(p, 100), start), 100), sw), 0, 10000);
    const along = S.div(S.mul(S.sel(S.eq(S.mod(band, 2), 0), S.x, S.sub(S.sub(S.w, 1), S.x)), 10000), S.max(S.w, 1));
    // bristles: each row of hairs reaches its own distance (the front overshoots, so 100 covers); behind it a dry break-up
    const hair = S.div(S.add(S.mul(S.mod(S.hash(S.y, 3, 22), 256), 65), S.mul(shaderPaintNoise(S, 9, S.y, 6, 23), 35)), 100);
    const reach = S.mul(S.p("bristle"), 100);
    const front = S.sub(S.div(S.mul(f, S.add(10400, reach)), 10000), S.div(S.mul(hair, reach), 255));
    const dry = S.div(S.mul(S.mod(S.hash(S.div(S.x, 2), S.y, 24), 256), 300), 255);
    const d = S.sub(along, S.sub(front, dry));
    // a shadow just ahead of the brush, where the paint ridges up against the old screen (three steps)
    const near = S.and(S.gt(f, 0), S.lt(d, 300));
    const ahead = shaderPaintShade(S, S.tex(0, 0), S.sub(100, S.div(S.mul(S.p("ridge"), S.sub(3, S.div(S.mul(d, 3), 300))), 3)), 0);
    return S.pick([[S.lt(d, 0), S.p("cover")], [near, ahead]], S.tex(0, 0));
  },
};

SHADER_DEFS.woodblock = {
  label: "Woodblock", title: "a ukiyo-e woodblock print: flat inks, a hand-cut key line, the blocks out of register, washi paper",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["woodblock", "ukiyo-e", "print", "japanese", "hokusai", "woodcut", "ink", "washi", "paper", "painter panic"],
  params: {
    line: { type: "int", min: 0, max: 3, def: 1, label: "Key line (px)" },
    register: { type: "int", min: 0, max: 4, def: 1, label: "Out of register (px)" },
    wander: { type: "int", min: 0, max: 4, def: 1, label: "Knife wander (px)" },
    match: { type: "int", min: 0, max: 128, def: 46, label: "One block within" },
    bokashi: { type: "int", min: 0, max: 60, def: 20, label: "Bokashi: lighter toward the bottom (%)" },
    fibre: { type: "int", min: 0, max: 30, def: 10, label: "Paper fiber (%)" },
    grain: { type: "int", min: 0, max: 10, def: 2, label: "Wood grain (%)" },
    paper: { type: "colour", def: "#ede3c9", label: "Washi" },
    ink: { type: "colour", def: "#1c1a1f", label: "Key ink" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cut" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.mul(S.p("seed"), 4), Wd = S.p("wander");
    // the grid a knife follows: the picture read through a slow warp, so an edge wanders instead of running straight
    const wx = S.div(S.mul(S.sub(shaderPaintNoise(S, S.x, S.y, 8, S.add(sd, 41)), 128), Wd), 128);
    const wy = S.div(S.mul(S.sub(shaderPaintNoise(S, S.add(S.x, 17), S.add(S.y, 5), 8, S.add(sd, 42)), 128), Wd), 128);
    const kx = S.add(S.x, wx), ky = S.add(S.y, wy);
    const at = function (dx, dy) { return S.texAt(S.add(kx, dx), S.add(ky, dy), "clamp"); };
    const kc = at(0, 0);
    // areas: near enough the same color (or both clear). The key line is cut on the DARKER side of a change (clear
    // counts as lightest), so a 1 px line is 1 px and a sprite's silhouette is lined from inside
    const M = S.p("match"), M2 = S.max(S.mul(M, M), 1);
    const rank = function (q) { return S.sel(S.solid(q), S.add(S.mul(S.luma(q), 65536), S.add(S.mul(S.r(q), 256), S.b(q))), 99999999); };
    const differs = function (q) {
      // a shade of the same ink (a pixel-art ramp) is one block: brightness counts a quarter, the hue in full
      const dl = S.sub(S.luma(q), S.luma(kc)), dr = S.sub(S.sub(S.r(q), S.r(kc)), dl), dg = S.sub(S.sub(S.g(q), S.g(kc)), dl), db = S.sub(S.sub(S.b(q), S.b(kc)), dl);
      const near = S.lt(S.add(S.add(S.add(S.mul(dr, dr), S.mul(dg, dg)), S.mul(db, db)), S.div(S.mul(dl, dl), 4)), M2);
      return S.sel(S.solid(q), S.or(S.not(S.solid(kc)), S.not(near)), S.solid(kc));
    };
    const mine = rank(kc);
    // a knife-cut line is uneven: a pixel thicker or thinner along its length
    const knife = shaderPaintNoise(S, S.x, S.y, 5, S.add(sd, 43)), L = S.p("line");
    const reach = S.sel(S.gt(L, 0), S.max(S.add(L, S.pick([[S.gt(knife, 190), 1], [S.lt(knife, 60), -1]], 0)), 1), 0);
    const hits = [];
    for (let k = 1; k <= 4; k++) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
      const q = at(dx, dy);
      hits.push(S.and(S.le(k, reach), differs(q), S.lt(mine, rank(q))));
    }
    const line = S.and(S.solid(kc), S.or(...hits));
    // each color is its own block with its own slip: the same color always slips the same way
    const which = S.hash(S.add(S.div(S.r(kc), 16), sd), S.div(S.g(kc), 16), S.div(S.b(kc), 16)), R = S.p("register"), R2 = S.add(S.mul(R, 2), 1);
    const sx = S.sub(S.mod(which, R2), R), sy = S.sub(S.mod(S.div(which, 97), R2), R);
    const fc = at(sx, sy);
    // the paper: washi, long fibers across and a little cloud in the sheet
    const fib = S.div(S.add(S.mul(shaderPaintNoise(S, S.x, S.mul(S.y, 8), 16, S.add(sd, 44)), 60), S.mul(S.mod(S.hash(S.div(S.x, 6), S.y, S.add(sd, 45)), 256), 40)), 100);
    const washi = shaderPaintShade(S, S.p("paper"), S.add(S.sub(100, S.div(S.p("fibre"), 2)), S.div(S.mul(fib, S.p("fibre")), 255)), 0);
    // a block prints one color or none: near-white is the bare paper, near-black is the key ink; bokashi wipes the
    // ink lighter toward the bottom of the print, and ink on damp paper is a shade duller
    const hi = S.max(S.r(fc), S.max(S.g(fc), S.b(fc))), lo = S.min(S.r(fc), S.min(S.g(fc), S.b(fc)));
    const bare = S.or(S.not(S.solid(fc)), S.and(S.ge(S.luma(fc), 200), S.le(S.sub(hi, lo), 20)));
    const base = S.sel(S.lt(hi, 64), S.p("ink"), fc);
    const wipe = S.sub(100, S.div(S.mul(S.p("bokashi"), S.y), S.max(S.h, 1)));
    const area = S.sel(bare, washi, shaderPaintPunch(S, shaderPaintMix(S, S.p("paper"), base, wipe), 90));
    // the line runs a little dry in places: thinner ink, never broken
    const dry = S.add(80, S.div(S.mul(shaderPaintNoise(S, S.add(S.x, 11), S.add(S.y, 11), 7, S.add(sd, 46)), 20), 255));
    const col = S.sel(line, shaderPaintMix(S, area, S.p("ink"), dry), area);
    // the long grain of the block, pulled through everything it printed
    const gr = S.div(S.mul(shaderMotionSin(S, S.add(S.mul(S.x, 40), S.div(S.mul(shaderPaintNoise(S, S.x, S.y, 24, S.add(sd, 47)), 516), 255))), S.p("grain")), 1000);
    const out = shaderPaintShade(S, col, S.add(100, gr), 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.mosaic.variants = [{ chip: 3, grout: 0, vary: 50 }, { chip: 12, grout: 2, bevel: 100, ground: 1, seed: 7 }];
SHADER_DEFS.crossstitch.variants = [{ stitch: 3, thread: 40 }, { stitch: 9, thread: 20, ground: 1, sheen: 100, weave: 100 }];
SHADER_DEFS.brushwipe.variants = [{ progress: 40 }, { progress: 65, strokes: 12, sweep: 100, bristle: 30 }, { progress: 25, strokes: 2, wobble: 20, ridge: 100 }];
SHADER_DEFS.woodblock.variants = [{ line: 2, register: 3, wander: 0 }, { line: 3, wander: 4, match: 0, bokashi: 60, seed: 5 }, { line: 0, fibre: 30, grain: 10 }];

// ---- Painter Panic ports, batch 3 ----
// ======================================================================================================================
// Eight more of AJ's Painter Panic shaders (splotch2/assets/Shaders), adapted with his blessing and RE-EXPRESSED in the
// integer IR as batches 1 and 2 were (no new op, no printer change; private helpers shaderPaint*):
//   sticker   paper-cut.gdshader: a die-cut sticker, a white cut border, a dithered shadow that creeps as it lifts
//   chrome    mercury.gdshader: liquid metal, a bright band above, a dark equator, a bounce below, the horizon wobbling
//   magma     magma.gdshader: dark crust plates split by glowing ember fissures, breathing
//   drips     drip.gdshader: wet paint hanging off the sprite's underside in drips that run and ooze, a fat bead each
//   crayon    canvas-crayon.gdshader: wax scribbled back and forth, skipping the paper's tooth, drained, waxy
//   engrave   canvas-engrave.gdshader: burin lines that SWELL with darkness, bent by the picture, crossing in the darks
//   tiedye    tie-dye.gdshader: crinkled rings in shades of each pixel's own color, bleeding, drifting
//   goldleaf  canvas-gild.gdshader: gold-leaf sheets laid askew, bright seams, burnish streaks, skips showing red bole
// The ball shaders drew an orb of one color; here they work on a sprite's own pixels and silhouette.
// ======================================================================================================================

SHADER_EFFECTS.push("sticker", "chrome", "magma", "drips", "crayon", "engrave", "tiedye", "goldleaf");

// smoothstep(a, b, v) x 1000 for constant edges (either order), v in the same units
function shaderPaintStep(S, v, a, b) {
  if (a > b) return S.sub(1000, shaderPaintStep(S, v, b, a));
  const t = S.clamp(S.div(S.mul(S.sub(v, a), 1000), b - a), 0, 1000);
  return S.div(S.mul(S.mul(t, t), S.sub(3000, S.mul(t, 2))), 1000000);
}
// floor(sqrt(v)) for 0 <= v < 2^28, bit by bit
function shaderPaintSqrt(S, v) {
  let r = S.i(0);
  for (let b = 1 << 13; b >= 1; b >>= 1) { const t = S.add(r, b); r = S.sel(S.le(S.mul(t, t), v), t, r); }
  return r;
}
// the pixel is on the silhouette's rim: solid with a clear 4-neighbor (a screen's own border does not count)
function shaderPaintRim(S) {
  return S.not(S.and(S.solid(shaderLooksAt(S, 1, 0)), S.solid(shaderLooksAt(S, -1, 0)), S.solid(shaderLooksAt(S, 0, 1)), S.solid(shaderLooksAt(S, 0, -1))));
}
// a color's gray (luma), opaque
function shaderPaintGrey(S, c) { const l = S.luma(c); return S.rgba(l, l, l, 255); }

SHADER_DEFS.sticker = {
  label: "Sticker", title: "a die-cut sticker: a white cut border round the sprite, a shadow under it that creeps as it lifts",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 8, pad: [3, 11, 11, 3],
  tags: ["sticker", "die-cut", "paper", "decal", "vinyl", "peel", "shadow", "craft", "scrapbook", "painter panic"],
  params: {
    border: { type: "int", min: 0, max: 3, def: 1, label: "Cut border (px)" },
    paper: { type: "colour", def: "#f7f7f7", label: "Border" },
    shadowx: { type: "int", min: 0, max: 4, def: 1, label: "Shadow right (px)" },
    shadowy: { type: "int", min: 0, max: 4, def: 2, label: "Shadow down (px)" },
    shadow: { type: "int", min: 0, max: 100, def: 50, label: "Shadow (% dithered in)" },
    shade: { type: "colour", def: "#000000", label: "Shadow color" },
    lift: { type: "int", min: 0, max: 100, def: 44, label: "Lift: the shadow creeps (% of its offset)" },
    tilt: { type: "int", min: 0, max: 30, def: 10, label: "Tilt: lighter at the top (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), B = S.p("border"), B2 = S.mul(B, B), ring = shaderDisc(9);
    // the cut: the silhouette grown by `border` px (a disc), and the same shape read from where the shadow falls
    const cutAt = function (X, Y) {
      return S.or(S.solid(S.texAt(X, Y)), ...ring.map(function (o) { return S.and(S.le(o[0] * o[0] + o[1] * o[1], B2), S.solid(S.texAt(S.add(X, o[0]), S.add(Y, o[1])))); }));
    };
    // only the shadow moves: it creeps out and back as the sticker breathes against the board
    const k = S.add(1000, S.div(S.mul(shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), S.p("lift")), 100));
    const ox = S.div(S.add(S.mul(S.p("shadowx"), k), 500), 1000), oy = S.div(S.add(S.mul(S.p("shadowy"), k), 500), 1000);
    const dith = S.lt(S.div(S.mul(S.table(SHADER_ERA_BAYER4, S.add(S.mul(S.mod(S.y, 4), 4), S.mod(S.x, 4))), 100), 16), S.p("shadow"));
    // a faint lift on one side so the sticker reads as sitting proud: lighter at the top, darker at the bottom
    const lift = S.div(S.mul(S.mul(S.sub(S.sub(S.h, 1), S.mul(S.y, 2)), S.p("tilt")), 255), S.mul(S.max(S.h, 1), 200));
    return S.pick([
      [S.solid(c), shaderPaintShade(S, c, 100, lift)],
      [cutAt(S.x, S.y), S.p("paper")],
      [S.and(dith, cutAt(S.sub(S.x, ox), S.sub(S.y, oy))), S.p("shade")],
    ], S.clear);
  },
};

SHADER_DEFS.chrome = {
  label: "Chrome", title: "liquid metal: every column a mirror of sky above, a dark horizon, a bounce below, the horizon wobbling",
  group: "Looks", kind: "sprite", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["chrome", "mercury", "metal", "liquid metal", "mirror", "silver", "shiny", "t-1000", "material", "painter panic"],
  params: {
    polish: { type: "int", min: 0, max: 100, def: 78, label: "Polish: the hard highlight (%)" },
    horizon: { type: "int", min: 0, max: 100, def: 55, label: "Dark horizon (%)" },
    wobble: { type: "int", min: 0, max: 100, def: 35, label: "Wobble (%)" },
    waves: { type: "int", min: 1, max: 4, def: 1, label: "Wobbles a loop" },
    colour: { type: "int", min: 0, max: 100, def: 70, label: "Color kept (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0);
    // where in its column's solid run this pixel is: -1000 at the top of the run, 1000 at the bottom (the form a column
    // turns through, so each column is a little mirrored cylinder and the bands follow the sprite's shape)
    let up = S.i(0), dn = S.i(0), ru = S.solid(c), rd = S.solid(c);
    for (let k = 1; k <= 12; k++) {
      ru = S.and(ru, S.solid(S.tex(0, -k))); rd = S.and(rd, S.solid(S.tex(0, k)));
      up = S.add(up, S.sel(ru, 1, 0)); dn = S.add(dn, S.sel(rd, 1, 0));
    }
    const v = S.div(S.mul(S.sub(S.mul(up, 2), S.mul(dn, 2)), 1000), S.add(S.add(up, dn), 1));
    // the horizon slides along a wave traveling across the sprite, so the metal looks liquid rather than plated
    const slide = S.div(S.mul(shaderMotionSin(S, S.add(S.div(S.mul(S.mul(S.frame, S.p("waves")), 360), S.FRAMES), S.mul(S.x, 12))), S.p("wobble")), 250);
    const h = S.add(v, slide);
    // sky above, ground below, and a dark compression where they meet
    const sky = shaderPaintStep(S, h, 150, -450), ground = shaderPaintStep(S, h, 200, 620), band = S.sub(1000, shaderPaintStep(S, S.abs(S.sub(h, 20)), 0, 280));
    // the rim goes bright: at a grazing angle everything is a mirror
    const L = S.add(S.add(S.add(520, S.div(S.mul(sky, 62), 100)), S.div(S.mul(ground, 26), 100)),
      S.sub(S.sel(shaderPaintRim(S), 350, 0), S.div(S.mul(S.mul(band, S.p("horizon")), 45), 10000)));
    // strictly brightness, so the metal keeps the sprite's color (as much of it as `colour` says)
    const base = shaderPaintMix(S, shaderPaintGrey(S, c), c, S.p("colour"));
    // one hard highlight across the sky band, the way polished metal takes a light
    const spec = S.sel(S.lt(S.abs(S.add(h, 560)), 90), S.div(S.mul(S.p("polish"), 191), 100), 0);
    const out = shaderPaintShade(S, base, S.div(L, 10), spec);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.magma = {
  label: "Magma", title: "a cooled crust with the heat still in it: dark plates split by glowing ember fissures, breathing",
  group: "Looks", kind: "both", palette: "free", frames: 24, fps: 8, pad: [0, 0, 0, 0],
  tags: ["magma", "lava", "volcanic", "molten", "crust", "fire", "ember", "cracked", "hot", "material", "painter panic"],
  params: {
    plates: { type: "int", min: 3, max: 16, def: 6, label: "Plate size (px)" },
    crack: { type: "int", min: 1, max: 3, def: 1, label: "Fissure width (px)" },
    crust: { type: "int", min: 0, max: 100, def: 66, label: "Crust: plates darkened (%)" },
    darkest: { type: "int", min: 10, max: 60, def: 30, label: "Darkest crust (% of the color)" },
    vein: { type: "int", min: 0, max: 100, def: 85, label: "Heat in the fissures (%)" },
    pulse: { type: "int", min: 0, max: 100, def: 90, label: "Breathing (%)" },
    ember: { type: "colour", def: "#ff8c1f", label: "Ember" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cracks" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), v = shaderPaintCells(S, S.p("plates"), S.add(S.mul(S.p("seed"), 2), 60)), W = S.mul(S.p("crack"), 2);
    // the fissure: the line where two plates meet, its core `crack` px wide, a cooler glow a pixel each side
    const fissure = S.pick([[shaderPaintJoin(S, v, W), 1000], [shaderPaintJoin(S, v, S.add(W, 4)), 450]], 0);
    // breathing, so the rock looks like it has something moving under it
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const breath = S.sub(1000, S.div(S.mul(S.p("pulse"), S.sub(280, S.div(S.mul(s, 28), 100))), 100));
    const heat = S.div(S.mul(S.div(S.mul(fissure, S.p("vein")), 100), breath), 1000);
    // plates go dark (each a shade of its own); the seams keep the color and then glow past it
    const own = S.sub(S.mod(S.hash(v.ax, v.ay, 61), 13), 6);
    const lightness = S.add(S.sub(1000, S.div(S.mul(S.mul(S.sub(1000, S.mul(S.p("darkest"), 10)), S.p("crust")), S.sub(1000, fissure)), 100000)), S.mul(own, 10));
    const plate = shaderPaintShade(S, c, S.div(lightness, 10), 0);
    const glow = shaderPaintMix(S, plate, S.p("ember"), S.div(S.min(S.div(S.mul(heat, 7), 10), 800), 10));
    // white-hot at the peak, and the rim kept lit so the silhouette survives a dark face
    const add = S.add(S.div(S.mul(shaderPaintStep(S, heat, 550, 1000), 89), 1000), S.sel(shaderPaintRim(S), 46, 0));
    const out = shaderPaintShade(S, glow, 100, add);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.drips = {
  label: "Drips", title: "still wet and running: paint hangs off the sprite's underside in drips that run and ooze, a fat bead on each",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 8, pad: [0, 3, 15, 3],
  tags: ["drip", "drips", "wet paint", "slime", "goo", "blood", "ooze", "melting", "dripping", "painter panic"],
  params: {
    spacing: { type: "int", min: 5, max: 16, def: 7, label: "Drip spacing (px)" },
    drips: { type: "int", min: 10, max: 100, def: 60, label: "Drips (% of places)" },
    run: { type: "int", min: 0, max: 12, def: 8, label: "Longest run (px)" },
    fat: { type: "int", min: 1, max: 3, def: 2, label: "Bead radius (px)" },
    ooze: { type: "int", min: 0, max: 100, def: 30, label: "Ooze (% the runs stretch)" },
    dark: { type: "int", min: 0, max: 60, def: 18, label: "Darker paint (%)" },
    gloss: { type: "int", min: 0, max: 100, def: 55, label: "Gloss (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Drips" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sp = S.p("spacing"), R = S.p("fat");
    // one drip place per `spacing` px across, hung from its own column, its own length, its own moment
    const cell = S.div(S.x, sp), hc = S.hash(cell, 5, S.p("seed")), h2 = S.hash(cell, 6, S.p("seed"));
    const has = S.lt(S.mod(S.add(S.mul(cell, 62), S.mul(S.p("seed"), 29)), 100), S.p("drips"));       // golden-ratio spread
    const xc = S.add(S.add(S.mul(cell, sp), R), S.mod(S.div(hc, 100), S.max(S.sub(sp, S.mul(R, 2)), 1)));
    const len0 = S.div(S.mul(S.p("run"), S.add(45, S.div(S.mul(S.mod(h2, 256), 55), 255))), 100);
    const oz = shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), S.mod(S.div(h2, 256), 360)));
    const len = S.clamp(S.div(S.add(S.mul(len0, S.add(1000, S.div(S.mul(oz, S.p("ooze")), 100))), 500), 1000), 0, 12);
    // how far below the sprite's underside this row is, in the drip's column (the first solid pixel above)
    let k = S.i(99);
    for (let i = 15; i >= 1; i--) k = S.sel(S.solid(S.texAt(xc, S.sub(S.y, i))), i, k);
    const dx = S.sub(S.x, xc), dy = S.sub(k, len);
    // the bead at the end is fatter than the run, the way a drip loads before it falls
    const body = S.and(S.le(k, len), S.lt(S.abs(dx), S.sub(R, S.sel(S.gt(R, 2), 1, 0))));
    const bead = S.le(S.add(S.mul(dx, dx), S.mul(dy, dy)), S.mul(R, R));
    const drip = S.and(has, S.not(S.solid(c)), S.lt(k, 99), S.or(body, bead));
    // thicker paint is darker paint: the drip is the color it ran off, darkened; a glint on a fat bead
    // (the paint inside the outline: two pixels up the column if that is still the sprite, else the edge itself)
    const up2 = S.texAt(xc, S.sub(S.y, S.add(k, 2))), up1 = S.texAt(xc, S.sub(S.y, S.add(k, 1)));
    const paint = shaderPaintShade(S, S.pick([[S.solid(up2), up2], [S.solid(up1), up1]], S.texAt(xc, S.sub(S.y, k))), S.sub(100, S.p("dark")), 0);
    const glint = S.and(S.gt(R, 1), S.eq(dx, -1), S.eq(dy, -1));
    const g = S.div(S.mul(S.p("gloss"), 77), 100);
    // a wet highlight along the sprite's top edges: a drip is too thin to hold one
    const top = S.and(S.solid(c), S.not(S.solid(S.tex(0, -1))));
    return S.pick([
      [top, shaderPaintShade(S, c, 100, g)],
      [S.solid(c), c],
      [S.and(drip, glint), shaderPaintShade(S, paint, 100, g)],
      [drip, S.rgba(S.r(paint), S.g(paint), S.b(paint), 255)],
    ], S.clear);
  },
};

SHADER_DEFS.crayon = {
  label: "Crayon", title: "wax crayon pressed too hard: scribbled back and forth, skipping the paper's tooth, running over the edges",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [1, 1, 1, 1],
  tags: ["crayon", "wax", "scribble", "child", "kid", "drawing", "naive", "paper", "hand-drawn", "painter panic"],
  params: {
    stroke: { type: "int", min: 2, max: 13, def: 3, label: "Stroke spacing (px)" },
    wander: { type: "int", min: 0, max: 9, def: 2, label: "Wander (px)" },
    skip: { type: "int", min: 0, max: 100, def: 62, label: "Skips the tooth (%)" },
    overrun: { type: "int", min: 0, max: 9, def: 1, label: "Overrun (px)" },
    wax: { type: "int", min: 0, max: 100, def: 40, label: "Waxy sheen (%)" },
    drain: { type: "int", min: 0, max: 100, def: 55, label: "Drained to gray (%)" },
    show: { type: "int", min: 0, max: 100, def: 70, label: "Paper between strokes (%)" },
    paper: { type: "colour", def: "#f0ede6", label: "Paper" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Scribble" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.mul(S.p("seed"), 4), O = S.p("overrun");
    // read from somewhere NEAR here: what makes the scribble run past the edges of the shape it is filling
    const ox = S.div(S.mul(S.sub(shaderPaintNoise(S, S.x, S.y, 6, S.add(sd, 71)), 128), O), 128);
    const oy = S.div(S.mul(S.sub(shaderPaintNoise(S, S.add(S.x, 19), S.add(S.y, 7), 6, S.add(sd, 72)), 128), O), 128);
    const q = S.texAt(S.add(S.x, ox), S.add(S.y, oy), "clamp"), own = S.sel(S.solid(q), q, c);
    const hi = S.max(S.r(own), S.max(S.g(own), S.b(own))), lo = S.min(S.r(own), S.min(S.g(own), S.b(own)));
    const value = S.sub(1000, S.div(S.mul(S.luma(own), 1000), 255)), painted = S.min(S.div(S.mul(S.sub(hi, lo), 3200), 255), 1000);
    const want = S.min(S.div(S.add(S.mul(painted, 8), S.mul(value, 6)), 10), 1000);
    // back and forth, badly: rows of strokes, wandering enough that neighbors touch in places and gap in others
    const s = S.p("stroke");
    const py = S.add(S.mul(S.y, 1000), S.div(S.mul(S.mul(S.sub(shaderPaintNoise(S, S.x, S.y, 8, S.add(sd, 73)), 128), S.p("wander")), 1000), 128));
    const band = S.abs(S.sub(S.div(S.mul(S.mod(py, S.mul(s, 1000)), 2), s), 1000));
    const w9 = S.div(S.mul(want, 9), 10);
    const lay0 = S.sub(1000, shaderPaintStep(S, S.sub(band, w9), -250, 150));
    // wax only touches the tooth: the loudest thing about crayon, and the reason it never covers
    const tooth = S.div(S.add(S.mul(S.mod(S.hash(S.x, S.y, S.add(sd, 74)), 1000), 5), S.mul(S.mod(S.hash(S.div(S.x, 2), S.div(S.y, 2), S.add(sd, 75)), 1000), 5)), 10);
    const lay = S.div(S.mul(lay0, S.sub(1000, S.div(S.mul(S.sub(1000, tooth), S.p("skip")), 100))), 1000);
    // drained toward gray and never quite the color it was; where it was worked over, shiny instead of dark
    const stick = shaderPaintShade(S, shaderPaintMix(S, own, shaderPaintGrey(S, own), S.p("drain")), 86, S.div(S.mul(S.mul(S.div(S.mul(lay, lay), 1000), S.p("wax")), 77), 100000));
    const paper = shaderPaintMix(S, own, S.p("paper"), S.p("show"));
    const out = S.sel(S.ge(lay, 500), stick, paper);
    // past the edge: one pixel of wax where the scribble overran a solid neighbor (never paper)
    const over = S.and(S.not(S.solid(c)), S.solid(q), S.ge(lay, 500), S.or(S.solid(S.tex(1, 0)), S.solid(S.tex(-1, 0)), S.solid(S.tex(0, 1)), S.solid(S.tex(0, -1))));
    return S.sel(S.or(S.solid(c), over), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.engrave = {
  label: "Engraving", title: "a burin engraving: ruled lines that SWELL where it is dark, bent by the picture, a second set crossing in the darks",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["engraving", "engrave", "burin", "etching", "intaglio", "banknote", "lines", "print", "woodcut", "painter panic"],
  params: {
    line: { type: "int", min: 2, max: 12, def: 6, label: "Line spacing (px)" },
    angle: { type: "int", min: 0, max: 179, def: 32, label: "Angle (degrees)" },
    swell: { type: "int", min: 0, max: 100, def: 88, label: "Swell (% of the gap at the darkest)" },
    follow: { type: "int", min: 0, max: 12, def: 5, label: "Bend to follow the picture" },
    crossing: { type: "int", min: 0, max: 100, def: 80, label: "Second lattice from (% dark)" },
    tint: { type: "int", min: 0, max: 100, def: 26, label: "Hue in the ink (%)" },
    bite: { type: "int", min: 0, max: 100, def: 35, label: "Uneven plate (%)" },
    ink: { type: "colour", def: "#292629", label: "Ink" },
    paper: { type: "colour", def: "#faf7f0", label: "Paper" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), L = S.p("line");
    // chroma says a passage was painted at all, darkness how hard the burin went in (luminance alone leaves yellow blank)
    const hi = S.max(S.r(c), S.max(S.g(c), S.b(c))), lo = S.min(S.r(c), S.min(S.g(c), S.b(c)));
    const value = S.sub(1000, S.div(S.mul(S.luma(c), 1000), 255)), painted = S.min(S.div(S.mul(S.sub(hi, lo), 3200), 255), 1000);
    const want = S.min(S.add(S.div(S.mul(painted, 55), 100), value), 1000);
    // the bend: the lattice is pushed ACROSS its lines by the darkness round here, so it kinks over every form
    let dk = S.i(0);
    for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]]) { const q = shaderLooksAt(S, dx, dy); dk = S.add(dk, S.sel(S.solid(q), S.sub(255, S.luma(q)), 0)); }
    const wave = S.div(S.mul(S.mul(S.sub(S.div(dk, 9), 128), S.p("follow")), S.mul(L, 1000)), 4096);
    // one lattice: ink where the distance from the line (0 on it, 1000 between) is inside the width the tone asks for,
    // capped short of closing (and at least a pixel and a half of paper left at any spacing): an engraving is legible as
    // LINE at every tone
    const cut = function (deg, tone, bend) {
      const ry = S.add(S.add(S.mul(S.x, shaderMotionSin(S, deg)), S.mul(S.y, shaderMotionCos(S, deg))), bend);
      const across = S.abs(S.sub(S.div(S.mul(S.mod(ry, S.mul(L, 1000)), 2), L), 1000));
      const width = S.min(S.div(S.mul(S.clamp(tone, 0, 1000), S.p("swell")), 100), S.min(820, S.sub(1060, S.div(1500, L))));
      return S.and(S.gt(tone, 0), S.lt(across, S.sub(width, 60)));
    };
    const ink = S.or(cut(S.p("angle"), S.div(S.mul(want, 115), 100), wave),
      cut(S.add(S.p("angle"), 77), S.div(S.mul(S.sub(want, S.mul(S.p("crossing"), 10)), 26), 10), S.div(S.mul(wave, -7), 10)));
    // the plate never printed perfectly flat
    const press = S.div(S.add(S.mul(S.mod(S.hash(S.div(S.x, 2), S.div(S.y, 2), 81), 1000), 5), S.mul(S.mod(S.hash(S.x, S.y, 82), 1000), 5)), 10);
    const keep = S.sub(100, S.div(S.mul(S.sub(1000, press), S.p("bite")), 1000));
    const I = S.p("ink");
    const cutline = shaderPaintMix(S, I, S.rgba(S.add(S.div(S.r(I), 2), S.div(S.mul(S.r(c), 9), 10)), S.add(S.div(S.g(I), 2), S.div(S.mul(S.g(c), 9), 10)), S.add(S.div(S.b(I), 2), S.div(S.mul(S.b(c), 9), 10)), 255), S.p("tint"));
    const paper = shaderPaintMix(S, c, S.p("paper"), 80);
    const out = S.sel(ink, shaderPaintMix(S, paper, cutline, keep), paper);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.tiedye = {
  label: "Tie-dye", title: "single-color tie-dye: crinkled rings in shades of each pixel's own color, bleeding, drifting",
  group: "Looks", kind: "both", palette: "free", frames: 24, fps: 6, pad: [0, 0, 0, 0],
  tags: ["tie-dye", "tiedye", "hippie", "dye", "rings", "cloth", "psychedelic", "groovy", "shirt", "material", "painter panic"],
  params: {
    ring: { type: "int", min: 3, max: 16, def: 5, label: "Ring spacing (px)" },
    crinkle: { type: "int", min: 0, max: 100, def: 69, label: "Crinkle (%)" },
    depth: { type: "int", min: 0, max: 100, def: 56, label: "Dye depth (%)" },
    bleed: { type: "int", min: 2, max: 50, def: 22, label: "Bleed (% of a ring)" },
    drift: { type: "int", min: 0, max: 100, def: 30, label: "Drift (% of a ring)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Tie" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.p("ring");
    // from the middle of the image, in 1/32 px (doubled coordinates, x 16 under the root)
    const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    const r = shaderPaintSqrt(S, S.mul(S.add(S.mul(X2, X2), S.mul(Y2, Y2)), 256)), Rm = S.mul(S.max(S.w, S.h), 16);
    // the tie: the cloth is gathered, so the rings are not circles; two harmonics, damped toward the middle (undamped,
    // every angular term meets itself there in a hard star)
    const a = shaderMotionAtan(S, X2, Y2), ph = S.mul(S.p("seed"), 37);
    const pull = S.add(S.div(shaderMotionSin(S, S.add(S.mul(a, 5), ph)), 2), S.div(S.mul(shaderMotionSin(S, S.sub(S.mul(a, 8), S.mul(ph, 2))), 28), 100));
    const damp = shaderPaintStep(S, S.div(S.mul(r, 1000), S.max(S.div(S.mul(Rm, 55), 100), 1)), 0, 1000);
    // slow breathing, so the dye looks wet rather than printed
    const breathe = S.div(S.mul(S.mul(shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), ph)), S.p("drift")), S.mul(P, 32)), 100000);
    const rr = S.add(S.add(r, S.div(S.mul(S.div(S.mul(pull, damp), 1000), S.mul(S.mul(S.p("crinkle"), P), 19)), 100000)), breathe);
    // bands with soft edges (dye bleeds, it does not print a line): -1000 the deep dye .. 1000 the undyed fold
    const band = S.div(S.mul(S.mod(rr, S.mul(P, 32)), 1000), S.mul(P, 32)), bl = S.mul(S.p("bleed"), 10);
    const wave = S.sub(S.clamp(S.div(S.mul(S.add(S.sub(band, 500), bl), 1000), bl), 0, 1000), S.clamp(S.div(S.mul(S.sub(band, 500), 1000), bl), 0, 1000));
    const shade = S.sub(S.mul(wave, 2), 1000);
    const pale = shaderPaintMix(S, c, S.rgba(255, 255, 255, 255), 55), deep = shaderPaintShade(S, c, 55, 0);
    const dyed = shaderPaintMix(S, c, S.sel(S.gt(shade, 0), pale, deep), S.div(S.mul(S.abs(shade), S.p("depth")), 1000));
    // a soft turn, so it still reads as round and not flat
    const turn = S.sub(100, S.div(S.mul(shaderPaintStep(S, S.div(S.mul(r, 1000), S.max(Rm, 1)), 550, 1000), 22), 1000));
    const out = shaderPaintShade(S, dyed, turn, 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.goldleaf = {
  label: "Gold leaf", title: "gilded: gold-leaf sheets laid askew, bright overlapping seams, burnish streaks, skips showing the red bole",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["gold leaf", "gilded", "gilt", "gold", "icon", "illuminated", "byzantine", "luxury", "leaf", "painter panic"],
  params: {
    leaf: { type: "int", min: 4, max: 46, def: 8, label: "Sheet size (px)" },
    seam: { type: "int", min: 0, max: 100, def: 55, label: "Seams (%)" },
    skips: { type: "int", min: 0, max: 100, def: 30, label: "Skips (%)" },
    burnish: { type: "int", min: 0, max: 100, def: 62, label: "Burnish streaks (%)" },
    tint: { type: "int", min: 0, max: 100, def: 55, label: "Color in the bole (%)" },
    bright: { type: "colour", def: "#ffe68c", label: "Leaf, polished" },
    dull: { type: "colour", def: "#855c1a", label: "Leaf, dull" },
    bole: { type: "colour", def: "#703329", label: "Bole (the clay under it)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Laying" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Lf = S.p("leaf"), sd = S.mul(S.p("seed"), 4);
    // which sheet this is, and where inside it: each sheet slipped askew, so no two edges line up along a whole row
    const cx = S.div(S.x, Lf), cy = S.div(S.y, Lf), h = S.hash(cx, cy, S.add(sd, 91)), sl = S.max(S.div(S.mul(Lf, 18), 100), 1);
    const fx = S.mod(S.add(S.x, S.sub(S.mod(h, S.add(sl, 1)), S.div(sl, 2))), Lf), fy = S.mod(S.add(S.y, S.sub(S.mod(S.div(h, 64), S.add(sl, 1)), S.div(sl, 2))), Lf);
    // the seam: a bright overlap at the join, where two sheets lie on each other
    const edge = S.max(S.abs(S.sub(S.add(S.mul(fx, 2), 1), Lf)), S.abs(S.sub(S.add(S.mul(fy, 2), 1), Lf)));
    const overlap = shaderPaintStep(S, S.div(S.mul(edge, 1000), S.max(S.sub(Lf, 1), 1)), 860, 1000);
    // burnish streaks run along each sheet its own way (four ways): fast across the stroke, slow along it
    const k = S.mod(S.div(h, 4096), 4), ux = S.table([1, 0, 1, 1], k), uy = S.table([0, 1, 1, -1], k);
    const u = S.add(S.mul(S.x, ux), S.mul(S.y, uy)), w = S.sub(S.mul(S.y, ux), S.mul(S.x, uy));
    const streak = shaderPaintNoise(S, S.mul(u, 3), S.div(w, 2), 4, S.add(sd, 92));
    // the leaf takes its brightness from the passage under it, so a dark corner is dull gold and a bright one polished
    const lit = S.clamp(S.add(S.add(S.add(60, S.div(S.mul(S.luma(c), 1150), 255)), S.div(S.mul(S.mul(streak, S.p("burnish")), 35), 25500)),
      S.div(S.mul(S.mul(overlap, S.p("seam")), 45), 10000)), 0, 1000);
    const leaf = shaderPaintMix(S, S.p("dull"), S.p("bright"), S.div(lit, 10));
    // where the leaf skipped: more likely at the seams, which is where it really happens
    const gap = S.div(S.mul(shaderPaintNoise(S, S.add(S.x, S.mul(cx, 13)), S.add(S.y, S.mul(cy, 7)), 3, S.add(sd, 93)), 1000), 255);
    const bare = S.gt(S.add(S.div(S.mul(gap, 7), 10), S.div(S.mul(overlap, 45), 100)), S.sub(1000, S.div(S.mul(S.p("skips"), 55), 10)));
    // the clay ground: the bole, with some of the passage's own color in it
    const B = S.p("bole");
    const clay = shaderPaintMix(S, B, S.rgba(S.add(S.div(S.mul(S.r(c), 7), 10), S.div(S.r(B), 2)), S.add(S.div(S.mul(S.g(c), 7), 10), S.div(S.g(B), 2)), S.add(S.div(S.mul(S.b(c), 7), 10), S.div(S.b(B), 2)), 255), S.p("tint"));
    const out = S.sel(bare, clay, leaf);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.sticker.variants = [{ border: 2, shadowx: 3, shadowy: 3, shadow: 100, lift: 100 }, { border: 0, shadow: 25, tilt: 30, shade: "#3a2a50" }];
SHADER_DEFS.chrome.variants = [{ wobble: 100, waves: 3, colour: 0 }, { polish: 0, horizon: 100, colour: 100 }];
SHADER_DEFS.magma.variants = [{ plates: 4, crack: 1, crust: 100, darkest: 10 }, { plates: 12, crack: 3, vein: 100, pulse: 0, seed: 7 }];
SHADER_DEFS.drips.variants = [{ spacing: 5, drips: 100, run: 12, fat: 2, ooze: 100 }, { spacing: 12, fat: 3, dark: 60, gloss: 100, seed: 4 }, { fat: 1, run: 4 }];
SHADER_DEFS.crayon.variants = [{ stroke: 2, wander: 0, skip: 0, overrun: 0 }, { stroke: 8, wander: 9, overrun: 4, wax: 100, drain: 100, show: 86, seed: 3 }];
SHADER_DEFS.engrave.variants = [{ line: 3, angle: 90, follow: 0, crossing: 0 }, { line: 8, angle: 135, follow: 12, swell: 100, bite: 100, tint: 100 }];
SHADER_DEFS.tiedye.variants = [{ ring: 3, crinkle: 100, bleed: 50 }, { ring: 12, crinkle: 0, depth: 100, drift: 100, seed: 5 }];
SHADER_DEFS.goldleaf.variants = [{ leaf: 4, skips: 100, tint: 100 }, { leaf: 20, seam: 100, burnish: 100, skips: 0, seed: 6 }];

// ---- Live enchants, and a dithered ramp ----
// ======================================================================================================================
// CrunchyItem's enchants re-imagined as LIVE sprite effects (IDEAS.md, CrunchyShader): each takes the whole sprite, has
// an `amount` (0 is the plain sprite) a game can drive live as its strength, and defaults to that enchant's own
// five-color ramp from items.js (ITEM_ENCHANT_RAMPS, copied here as data: shader.js needs nothing from items.js),
// light to dark. These are the eleven enchants the roster had no effect for; fire, ice, lightning, poison, holy,
// shadow, water, stone, midas, prismatic, spectral and magma already have relatives (flame/burn, freeze, crackle/shock,
// poison, glow, aura, wet, petrify, gold, rainbow, ghost, magma). None draws more than 8 px from the sprite.
// And `ditherramp`: a palette ramp laid over a sprite or panel as a 4 x 4 dithered gradient (UI's gradient kits).
// Private helpers shaderEnch*; the shaderPaint* and shaderMotion* helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("arcane", "necrotic", "acid", "bleeding", "windswept", "circuit", "digital", "lunar", "solar", "sonic", "radiant", "ditherramp");

// a live enchant's two common params: how much (the strength) and its ramp, light to dark
function shaderEnchParams(def, ramp) {
  return {
    amount: { type: "int", min: 0, max: 100, def: def, label: "Amount (%)" },
    ramp: { type: "palette", def: ramp, max: 8, label: "Ramp (light to dark)" },
  };
}
// the 4 x 4 Bayer threshold at (x + ox, y), 0..93: draw where it is below a percent
function shaderEnchDither(S, ox) {
  return S.div(S.mul(S.table(SHADER_ERA_BAYER4, S.add(S.mul(S.mod(S.y, 4), 4), S.mod(S.add(S.x, ox || 0), 4))), 100), 16);
}
// a clear pixel touching the sprite (4-neighbor), and one a pixel further out
function shaderEnchRing1(S) {
  return S.and(S.not(S.solid(S.tex(0, 0))), S.or(S.solid(S.tex(1, 0)), S.solid(S.tex(-1, 0)), S.solid(S.tex(0, 1)), S.solid(S.tex(0, -1))));
}
function shaderEnchRing2(S) {
  return S.and(S.not(S.solid(S.tex(0, 0))), S.not(shaderEnchRing1(S)),
    S.or(S.solid(S.tex(2, 0)), S.solid(S.tex(-2, 0)), S.solid(S.tex(0, 2)), S.solid(S.tex(0, -2)), S.solid(S.tex(1, 1)), S.solid(S.tex(-1, 1)), S.solid(S.tex(1, -1)), S.solid(S.tex(-1, -1))));
}
// how many whole 4-way rings of solid pixels surround this one, up to K (0 on the rim)
function shaderEnchDepth(S, K) {
  let d = S.i(0), run = S.solid(S.tex(0, 0));
  for (let k = 1; k <= K; k++) { run = S.and(run, S.solid(S.tex(k, 0)), S.solid(S.tex(-k, 0)), S.solid(S.tex(0, k)), S.solid(S.tex(0, -k))); d = S.add(d, S.sel(run, 1, 0)); }
  return d;
}
// the first solid pixel straight above within K (its distance), or 99
function shaderEnchAbove(S, K) {
  let k = S.i(99);
  for (let i = K; i >= 1; i--) k = S.sel(S.solid(S.tex(0, -i)), i, k);
  return k;
}
const SHADER_ENCH_POW16 = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

SHADER_DEFS.arcane = {
  label: "Arcane", title: "arcane enchant: runes crawling up through the sprite, a violet glow pulsing, glimmers along its edge",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["arcane", "magic", "runes", "enchant", "mystic", "spell", "wizard", "violet", "glyphs", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#fff0ff", "#ffa2f2", "#e04aec", "#9a28c8", "#400c70"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Runes" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 401);
    // 4 x 4 rune cells crawling up 16 px a loop (the pattern repeats every 4 cells down, so the loop closes)
    const yy = S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), cx = S.div(S.x, 4), cy = S.mod(S.div(yy, 4), 4);
    const active = S.lt(S.mod(S.hash(cx, cy, sd), 100), A);
    const bit = S.table(SHADER_ENCH_POW16, S.add(S.mul(S.mod(yy, 4), 4), S.mod(S.x, 4)));
    const on = function (h) { return S.eq(S.mod(S.div(h, bit), 2), 1); };
    const rune = S.and(S.solid(c), active, on(S.hash(cx, cy, S.add(sd, 1))), on(S.hash(cx, cy, S.add(sd, 2))));
    // the glow swells and ebbs once a loop; glimmers run along the rim
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const glow = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(S.mul(A, S.add(300, S.div(s, 5))), 1000));
    const glimmer = S.and(S.gt(A, 0), shaderPaintRim(S), S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 3)), S.frame), 8), 0));
    const out = S.pick([[rune, S.palAt("ramp", 0)], [glimmer, S.palAt("ramp", 1)]], glow);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.necrotic = {
  label: "Necrotic", title: "necrotic enchant: decay creeping in from the edges, the color drained to grave tones, rot spots, wisps rising",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 6, pad: [4, 0, 0, 0], strength: "amount",
  tags: ["necrotic", "decay", "rot", "undead", "zombie", "curse", "enchant", "death", "wither", "debuff"],
  params: Object.assign(shaderEnchParams(60, ["#f2eed8", "#b6c09a", "#7e8f6e", "#4a5844", "#1a221c"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Rot" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 411);
    // the decay reaches further in as the amount grows, raggedly
    const nz = shaderPaintNoise(S, S.x, S.y, 4, sd), reach = S.add(S.div(S.mul(A, 7), 100), S.div(S.sub(nz, 128), 64));
    const decayed = S.and(S.gt(A, 0), S.solid(c), S.lt(shaderEnchDepth(S, 6), reach));
    const grave = S.palAt("ramp", S.sub(4, S.div(S.mul(S.luma(c), 5), 256)));
    const rot = S.and(decayed, S.gt(nz, 205));
    // wisps: pale motes drifting up from the top of the sprite
    const wisp = S.and(S.not(S.solid(c)), S.lt(S.mod(S.hash(S.x, S.mod(S.add(S.y, S.frame), 16), S.add(sd, 1)), 100), S.div(A, 3)),
      S.or(S.solid(S.tex(0, 1)), S.solid(S.tex(0, 2)), S.solid(S.tex(0, 3))));
    return S.pick([[wisp, S.palAt("ramp", 1)], [rot, S.palAt("ramp", 4)], [decayed, grave]], c);
  },
};

SHADER_DEFS.acid = {
  label: "Acid", title: "acid enchant: holes eaten through the sprite, their rims fizzing bright, acid dripping from its underside",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 2, 0], strength: "amount",
  tags: ["acid", "corrosion", "corrode", "toxic", "melt", "eaten", "enchant", "sizzle", "slime", "debuff"],
  params: Object.assign(shaderEnchParams(50, ["#fcffd8", "#eeff38", "#b4e60c", "#5e8006", "#2a2c06"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Holes" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 421), thr = S.sub(255, S.div(S.mul(A, 16), 10));
    // a hole wherever a value noise passes the amount (none at 0)
    const holeAt = function (dx, dy) { return S.and(S.solid(S.tex(dx, dy)), S.gt(shaderPaintNoise(S, S.add(S.x, dx), S.add(S.y, dy), 4, sd), thr)); };
    const hole = holeAt(0, 0);
    const rim = S.and(S.solid(c), S.not(hole), S.or(holeAt(1, 0), holeAt(-1, 0), holeAt(0, 1), holeAt(0, -1)));
    const fizz = S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 6), 0);
    // drips of one or two pixels under the sprite, coming and going
    const h = S.hash(S.x, 5, S.add(sd, 2)), has = S.lt(S.mod(h, 100), S.div(A, 3)), ph = S.mod(S.add(S.frame, S.div(h, 100)), 4);
    const drip = S.and(has, S.not(S.solid(c)), S.or(S.and(S.solid(S.tex(0, -1)), S.lt(ph, 3)), S.and(S.not(S.solid(S.tex(0, -1))), S.solid(S.tex(0, -2)), S.eq(ph, 1))));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 5));
    return S.pick([[hole, S.clear], [rim, S.sel(fizz, S.palAt("ramp", 0), S.palAt("ramp", 1))], [drip, S.palAt("ramp", 2)], [S.solid(c), body]], S.clear);
  },
};

SHADER_DEFS.bleeding = {
  label: "Bleeding", title: "blood enchant: wounds opening in the sprite, stained around, blood dripping and falling from its underside",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 8, 0], strength: "amount",
  tags: ["blood", "bleeding", "wound", "hurt", "damage", "gore", "enchant", "vampire", "drip", "debuff"],
  params: Object.assign(shaderEnchParams(50, ["#ffc2c8", "#e8283e", "#a8102a", "#640818", "#260208"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Wounds" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 431), nz = shaderPaintNoise(S, S.x, S.y, 5, sd);
    const wound = S.and(S.solid(c), S.gt(nz, S.sub(255, S.div(S.mul(A, 12), 10))));
    const stain = S.and(S.solid(c), S.not(wound), S.gt(nz, S.sub(255, S.div(S.mul(A, 16), 10))));
    // drips: in some columns the blood runs down off the underside, growing, falling and starting again
    const h = S.hash(S.x, 1, S.add(sd, 1)), has = S.lt(S.mod(h, 100), S.div(A, 2));
    const len = S.div(S.mod(S.add(S.frame, S.div(h, 100)), 16), 2), k = shaderEnchAbove(S, 8);
    const drip = S.and(has, S.not(S.solid(c)), S.le(k, len)), tip = S.and(drip, S.eq(k, len));
    return S.pick([[tip, S.palAt("ramp", 1)], [drip, S.palAt("ramp", 2)], [wound, S.palAt("ramp", 3)], [stain, shaderPaintMix(S, c, S.palAt("ramp", 2), 50)]], c);
  },
};

SHADER_DEFS.windswept = {
  label: "Windswept", title: "wind enchant: bright gusts sweeping across the sprite on a slant, speed lines trailing off its edges",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 12, pad: [0, 2, 0, 0], strength: "amount",
  tags: ["wind", "windswept", "gust", "air", "speed", "swift", "enchant", "haste", "breeze", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#ffffff", "#e4fbe6", "#b0eac0", "#68b88e", "#2e6a52"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Gusts" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 441), P = 8;
    // slanted bands moving right, four a loop (the band pattern repeats every four, so the loop closes)
    const u = S.sub(S.sub(S.x, S.div(S.y, 2)), S.div(S.mul(S.frame, 4 * P), S.FRAMES));
    const bi = S.mod(S.div(u, P), 4), at = S.mod(u, P), active = S.lt(S.mod(S.hash(bi, 7, sd), 100), A);
    const gust = S.and(active, S.lt(at, 2)), after = S.and(active, S.eq(at, 2));
    // speed lines in the margin just behind the sprite's right edge
    const line = S.and(gust, S.not(S.solid(c)), S.or(S.solid(S.tex(-1, 0)), S.solid(S.tex(-2, 0))));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 8));
    return S.pick([
      [line, S.palAt("ramp", 2)],
      [S.and(S.solid(c), gust), shaderPaintMix(S, c, S.palAt("ramp", 0), 60)],
      [S.and(S.solid(c), after), shaderPaintMix(S, c, S.palAt("ramp", 1), 30)],
      [S.solid(c), body],
    ], S.clear);
  },
};

SHADER_DEFS.circuit = {
  label: "Circuitry", title: "robotic enchant: glowing circuit traces laid through the sprite, pulses running along them, the metal shaded",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["robotic", "circuit", "cyber", "tech", "machine", "android", "enchant", "sci-fi", "electronic", "upgrade"],
  params: Object.assign(shaderEnchParams(55, ["#eafff8", "#36f0a8", "#18a8c0", "#5e6a7c", "#1a1f2a"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Layout" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 451);
    // a trace across or down each 4 px cell, more of them with the amount; pads where two meet
    const fx = S.mod(S.x, 4), fy = S.mod(S.y, 4), cx = S.div(S.x, 4), cy = S.div(S.y, 4);
    const hH = S.lt(S.mod(S.hash(cx, cy, sd), 100), A), hV = S.lt(S.mod(S.hash(cx, cy, S.add(sd, 1)), 100), A);
    const trace = S.and(S.solid(c), S.or(S.and(S.eq(fy, 1), hH), S.and(S.eq(fx, 1), hV)));
    const node = S.and(trace, S.eq(fx, 1), S.eq(fy, 1), hH, hV);
    // a pulse running along them, a whole cycle a loop
    const pulse = S.and(trace, S.lt(S.mod(S.sub(S.add(S.x, S.y), S.div(S.mul(S.frame, 16), S.FRAMES)), 16), 2));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 4));
    const out = S.pick([[pulse, S.palAt("ramp", 0)], [node, S.palAt("ramp", 2)], [trace, S.palAt("ramp", 1)]], body);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), S.clear);
  },
};

SHADER_DEFS.digital = {
  label: "Digital", title: "digital enchant: columns of glowing code blocks raining down through the sprite, bright at the head",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 12, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["digital", "code", "matrix", "hacker", "data", "cyber", "enchant", "glitch", "rain", "virtual"],
  params: Object.assign(shaderEnchParams(55, ["#eaffee", "#4cff6a", "#16a03c", "#26d0e0", "#031208"]), {
    trail: { type: "int", min: 2, max: 12, def: 6, label: "Trail (blocks)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Code" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 461);
    // 2 x 2 blocks; in some columns a head falls a block a frame (16 blocks a loop, so it closes), a trail behind it
    const bx = S.div(S.x, 2), by = S.div(S.y, 2), h = S.hash(bx, 3, sd), active = S.lt(S.mod(h, 100), A);
    const head = S.mod(S.add(S.div(S.mul(S.frame, 16), S.FRAMES), S.div(h, 100)), 16), d = S.mod(S.sub(head, by), 16);
    const lit = S.and(S.solid(c), active, S.lt(d, S.p("trail")));
    // each block a little glyph: some of its pixels dark
    const dark = S.eq(S.mod(S.hash(S.x, S.y, S.add(sd, 1)), 3), 0);
    return S.sel(lit, S.sel(dark, S.palAt("ramp", 4), S.palAt("ramp", S.min(d, 2))), c);
  },
};

SHADER_DEFS.lunar = {
  label: "Moonlit", title: "lunar enchant: the sprite lit cold and pale by moonlight, a crescent glint on its upper edge, a shimmering halo",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 6, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["lunar", "moon", "moonlit", "night", "silver", "cold", "enchant", "werewolf", "mystic", "pale"],
  params: shaderEnchParams(60, ["#ffffff", "#dfe8fa", "#a4b6dc", "#62729e", "#262c4c"]),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount");
    // its brightness through the moonlit ramp, mixed in by the amount
    const lit = shaderPaintMix(S, c, S.palAt("ramp", S.sub(4, S.div(S.mul(S.luma(c), 5), 256))), A);
    const glint = S.and(S.gt(A, 0), S.solid(c), S.not(S.solid(S.tex(-1, -1))), S.not(S.solid(S.tex(0, -1))));
    // a halo one pixel round it, dithered and turning slowly
    const halo = S.and(shaderEnchRing1(S), S.lt(shaderEnchDither(S, S.div(S.frame, 4)), S.div(A, 2)));
    return S.pick([[halo, S.palAt("ramp", 2)], [glint, S.palAt("ramp", 0)], [S.solid(c), S.rgba(S.r(lit), S.g(lit), S.b(lit), 255)]], c);
  },
};

SHADER_DEFS.solar = {
  label: "Solar corona", title: "solar enchant: a flickering corona of sunfire round the sprite, its edge white-hot, the body warmed",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["solar", "sun", "corona", "sunfire", "radiant", "holy", "enchant", "blazing", "flare", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#fffff0", "#ffea5c", "#ffb41a", "#ee6408", "#8c2600"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Flicker" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 471);
    // the corona: the two pixels round the sprite flickering in sunfire, the inner one fuller
    const fl = S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 100);
    const r1 = shaderEnchRing1(S), r2 = shaderEnchRing2(S);
    const rim = shaderPaintRim(S);
    const body = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 5));
    return S.pick([
      [S.and(r1, S.lt(fl, S.div(S.mul(A, 3), 10))), S.palAt("ramp", 0)],
      [S.and(r1, S.lt(fl, S.div(S.mul(A, 8), 10))), S.palAt("ramp", 1)],
      [S.and(r2, S.lt(fl, S.div(S.mul(A, 4), 10))), S.palAt("ramp", 2)],
      [S.and(S.solid(c), rim), shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(S.mul(A, 6), 10))],
      [S.solid(c), S.rgba(S.r(body), S.g(body), S.b(body), 255)],
    ], c);
  },
};

SHADER_DEFS.sonic = {
  label: "Sonic", title: "sonic enchant: rings of sound pulsing out from the middle of the sprite and off its edges",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["sonic", "sound", "vibration", "music", "bass", "rings", "enchant", "shockwave", "resonance", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#ffffff", "#b4c6ff", "#6a7cff", "#3a3cc8", "#16124a"]), {
    spacing: { type: "int", min: 3, max: 12, def: 5, label: "Ring spacing (px)" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sp2 = S.mul(S.p("spacing"), 2);
    // rings from the middle (in half pixels), moving out one spacing a loop, so the loop closes
    const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    const r = shaderPaintSqrt(S, S.add(S.mul(X2, X2), S.mul(Y2, Y2)));
    const ring = S.and(S.gt(A, 0), S.lt(S.mod(S.sub(r, S.div(S.mul(S.frame, sp2), S.FRAMES)), sp2), 2));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 8));
    return S.pick([
      [S.and(ring, S.solid(c)), shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(S.mul(A, 7), 10))],
      [S.and(ring, shaderEnchRing1(S)), S.palAt("ramp", 2)],
      [S.and(ring, shaderEnchRing2(S), S.lt(shaderEnchDither(S), A)), S.palAt("ramp", 3)],
      [S.solid(c), S.rgba(S.r(body), S.g(body), S.b(body), 255)],
    ], c);
  },
};

SHADER_DEFS.radiant = {
  label: "Radiant", title: "radiation enchant: a sickly neon glow pulsing through the sprite, hazard stripes, geiger speckle, a flickering halo",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["radiant", "radiation", "radioactive", "nuclear", "toxic", "glow", "enchant", "hazard", "mutant", "debuff"],
  params: Object.assign(shaderEnchParams(55, ["#ffffe0", "#d8ff3a", "#7cff2a", "#2c6e10", "#101808"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Speckle" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 481);
    // the glow pulses twice a loop, never quite going out
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 720), S.FRAMES));
    const glow = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(S.mul(A, S.add(400, S.div(S.mul(s, 3), 10))), 1000));
    const striped = S.sel(S.lt(S.mod(S.add(S.x, S.y), 6), 2), shaderPaintMix(S, glow, S.palAt("ramp", 3), S.div(A, 4)), glow);
    const geiger = S.and(S.solid(c), S.lt(S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 100), S.div(A, 6)));
    const flick = S.ne(S.mod(S.hash(S.frame, 1, sd), 3), 0);
    const halo = S.and(shaderEnchRing1(S), flick, S.lt(shaderEnchDither(S), A));
    return S.pick([[halo, S.palAt("ramp", 1)], [geiger, S.palAt("ramp", 0)], [S.solid(c), S.rgba(S.r(striped), S.g(striped), S.b(striped), 255)]], c);
  },
};

SHADER_DEFS.ditherramp = {
  label: "Dither ramp", title: "a palette ramp laid over the sprite or panel as a 4 x 4 dithered gradient, top to bottom, across, diagonal or from the middle",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["gradient", "dither", "ramp", "ui", "panel", "button", "retro", "fill", "bayer", "kit"],
  params: {
    dir: { type: "int", min: 0, max: 3, def: 0, label: "Runs", choices: ["top to bottom", "left to right", "diagonally", "out from the middle"] },
    reverse: { type: "int", min: 0, max: 1, def: 0, label: "Order", choices: ["as listed", "reversed"] },
    style: { type: "int", min: 0, max: 1, def: 0, label: "Steps", choices: ["dithered", "banded"] },
    scale: { type: "int", min: 1, max: 3, def: 1, label: "Dither pixel (px)" },
    keep: { type: "int", min: 0, max: 255, def: 0, label: "Keep pixels darker than (an outline)" },
    ramp: { type: "palette", def: ["#2a2f4a", "#3e4f7a", "#5a7fb0", "#8fb8e0"], max: 16, label: "Ramp" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), D = S.p("dir"), n = S.palCount("ramp"), K = S.p("scale");
    const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    const hd = S.max(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 1);
    // where along the ramp this pixel lies, 0..1000
    const t0 = S.pick([
      [S.eq(D, 0), S.div(S.mul(S.add(S.mul(S.y, 2), 1), 500), S.max(S.h, 1))],
      [S.eq(D, 1), S.div(S.mul(S.add(S.mul(S.x, 2), 1), 500), S.max(S.w, 1))],
      [S.eq(D, 2), S.div(S.mul(S.add(S.x, S.y), 1000), S.max(S.sub(S.add(S.w, S.h), 2), 1))],
    ], S.div(S.mul(shaderPaintSqrt(S, S.add(S.mul(X2, X2), S.mul(Y2, Y2))), 1000), hd));
    const t = S.clamp(S.sel(S.eq(S.p("reverse"), 0), t0, S.sub(1000, t0)), 0, 1000);
    const seg = S.mul(t, S.sub(n, 1)), i = S.div(seg, 1000), f = S.mod(seg, 1000);
    const bayer = S.table(SHADER_ERA_BAYER4, S.add(S.mul(S.mod(S.div(S.y, K), 4), 4), S.mod(S.div(S.x, K), 4)));
    const idx = S.sel(S.eq(S.p("style"), 0), S.add(i, S.sel(S.gt(S.div(S.mul(f, 16), 1000), bayer), 1, 0)), S.div(S.add(seg, 500), 1000));
    return S.pick([[S.not(S.solid(c)), c], [S.lt(S.luma(c), S.p("keep")), c]], S.palAt("ramp", idx));
  },
};

SHADER_DEFS.arcane.variants = [{ amount: 100, seed: 3 }, { amount: 20, ramp: ["#e8fff8", "#80ffd0", "#20c0a0", "#107060", "#043028"] }];
SHADER_DEFS.necrotic.variants = [{ amount: 100 }, { amount: 25, seed: 5 }];
SHADER_DEFS.acid.variants = [{ amount: 100 }, { amount: 20, seed: 7 }];
SHADER_DEFS.bleeding.variants = [{ amount: 100 }, { amount: 25, seed: 4 }];
SHADER_DEFS.windswept.variants = [{ amount: 100 }, { amount: 30, seed: 2 }];
SHADER_DEFS.circuit.variants = [{ amount: 100 }, { amount: 25, seed: 8 }];
SHADER_DEFS.digital.variants = [{ amount: 100, trail: 12 }, { amount: 30, trail: 2, seed: 6 }];
SHADER_DEFS.lunar.variants = [{ amount: 100 }, { amount: 25 }];
SHADER_DEFS.solar.variants = [{ amount: 100 }, { amount: 25, seed: 9 }];
SHADER_DEFS.sonic.variants = [{ amount: 100, spacing: 3 }, { amount: 30, spacing: 12 }];
SHADER_DEFS.radiant.variants = [{ amount: 100 }, { amount: 25, seed: 1 }];
SHADER_DEFS.ditherramp.variants = [{ dir: 1, style: 1 }, { dir: 2, reverse: 1, scale: 2 }, { dir: 3, keep: 60, scale: 3 }];

// ---- Live enchants, part 2 ----
// ======================================================================================================================
// The other nineteen of CrunchyItem's enchants as live sprite effects, on the same terms as part 1 above (an `amount`,
// 0 the plain sprite, as the strength; the enchant's own ramp from ITEM_ENCHANT_RAMPS, light to dark, as a palette
// param): first the seven with no relative at all (flower, plant, astro, laser, void, crystal, time), then live,
// amount-driven takes on the twelve that had only a fixed relative (fire, ice, lightning, poison, holy, shadow, water,
// stone, midas, prismatic, spectral, magma). The relatives (flame, freeze, crackle, poison, glow, aura, wet, petrify,
// gold, rainbow, ghost, magma) are untouched. None draws more than 6 px from the sprite. Two more private helpers.
// ======================================================================================================================

SHADER_EFFECTS.push("blossom", "overgrown", "astral", "lasered", "voided", "crystalline", "chrono", "ablaze", "frostbite",
  "electrified", "venomous", "blessed", "shadowed", "flooded", "stoneskin", "midastouch", "prismatic", "spectral", "molten");

// the first solid pixel straight below within K (its distance), or 99
function shaderEnchBelow(S, K) {
  let k = S.i(99);
  for (let i = K; i >= 1; i--) k = S.sel(S.solid(S.tex(0, i)), i, k);
  return k;
}
// shaderPaintNoise whose knots repeat every `per` px down (per a multiple of cell), so a noise scrolled `per` px a loop
// closes without a seam: smoke, steam and caustics rising or flowing
function shaderEnchFlow(S, x, y, cell, seed, per) {
  const cx = S.div(x, cell), cy = S.div(y, cell), n = per / cell;
  const sm = function (v) { const f = S.div(S.mul(S.mod(v, cell), 256), cell); return S.div(S.mul(S.mul(f, f), S.sub(768, S.mul(f, 2))), 65536); };
  const wx = sm(x), wy = sm(y);
  const k = function (i, j) { return S.mod(S.hash(S.add(cx, i), S.mod(S.add(cy, j), n), seed), 256); };
  const top = S.mix(k(0, 0), k(1, 0), wx, 256), bot = S.mix(k(0, 1), k(1, 1), wx, 256);
  return S.mix(top, bot, wy, 256);
}

SHADER_DEFS.blossom = {
  label: "Blossom", title: "flower enchant: little blossoms opening and closing over the sprite, petals drifting down from it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 4, 0], strength: "amount",
  tags: ["flower", "blossom", "bloom", "petals", "spring", "nature", "enchant", "garden", "sakura", "druid"],
  params: Object.assign(shaderEnchParams(50, ["#ffe866", "#ffb6dc", "#f0569e", "#3a9a40", "#1a4a22"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Blossoms" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 501);
    // a blossom in some 5 px cells: a heart, four petals, four more at its fullest; each opens and closes once a loop
    const cx = S.div(S.x, 5), cy = S.div(S.y, 5), dx = S.sub(S.mod(S.x, 5), 2), dy = S.sub(S.mod(S.y, 5), 2);
    const h = S.hash(cx, cy, sd), active = S.lt(S.mod(h, 100), A), ph = S.mod(S.add(S.frame, S.div(h, 100)), 16);
    const md = S.add(S.abs(dx), S.abs(dy)), straight = S.eq(S.mul(dx, dy), 0);
    const heart = S.and(active, S.lt(ph, 14), S.eq(md, 0));
    const petal = S.and(active, S.ge(ph, 2), S.lt(ph, 12), S.eq(md, 1));
    const tip = S.and(active, S.ge(ph, 4), S.lt(ph, 10), S.eq(md, 2), straight);
    // petals falling in some columns, up to 4 px under the sprite
    const hc = S.hash(S.x, 2, S.add(sd, 1)), drops = S.lt(S.mod(hc, 100), S.div(A, 3));
    const fall = S.add(S.div(S.mod(S.add(S.frame, S.div(hc, 100)), 16), 4), 1);
    const falling = S.and(drops, S.not(S.solid(c)), S.eq(shaderEnchAbove(S, 4), fall));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 8));
    return S.pick([
      [falling, S.palAt("ramp", 1)],
      [S.and(S.solid(c), heart), S.palAt("ramp", 0)],
      [S.and(S.solid(c), petal), S.palAt("ramp", 1)],
      [S.and(S.solid(c), tip), S.palAt("ramp", 2)],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.overgrown = {
  label: "Overgrown", title: "plant enchant: swaying vines climbing the sprite from the bottom, leaves sprouting off its edges as they grow",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 6, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["plant", "vines", "overgrown", "leaves", "nature", "druid", "enchant", "moss", "growth", "jungle"],
  params: Object.assign(shaderEnchParams(60, ["#f4ffb8", "#9ae05a", "#4ca83a", "#286428", "#3e2a14"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Vines" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 511);
    // the growth line climbs with the amount; a vine every 6 px, swaying a pixel either way once a loop
    const grown = S.and(S.gt(A, 0), S.ge(S.y, S.sub(S.h, S.div(S.mul(A, S.h), 100))));
    const wob = S.div(shaderMotionSin(S, S.add(S.mul(S.y, 45), S.div(S.mul(S.frame, 360), S.FRAMES))), 600);
    const vx = S.mod(S.add(S.add(S.x, wob), S.mod(sd, 6)), 6);
    const vine = S.and(grown, S.solid(c), S.eq(vx, 0));
    const leaf = S.and(grown, S.solid(c), S.or(S.eq(vx, 1), S.eq(vx, 5)), S.eq(S.mod(S.hash(S.x, S.y, sd), 4), 0));
    // leaves sprouting just off the edge, rustling every 4 frames
    const sprout = S.and(grown, shaderEnchRing1(S), S.lt(S.mod(S.hash(S.x, S.y, S.add(sd, S.div(S.frame, 4))), 100), S.div(A, 3)));
    const body = S.sel(grown, shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 5)), c);
    return S.pick([
      [sprout, S.palAt("ramp", 1)],
      [vine, S.palAt("ramp", 3)],
      [leaf, S.palAt("ramp", 1)],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.astral = {
  label: "Astral", title: "astro enchant: the inside of the sprite opened onto a starry night sky, stars twinkling, its edge rimmed in gold",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["astro", "astral", "stars", "cosmos", "night sky", "galaxy", "enchant", "celestial", "space", "constellation"],
  params: Object.assign(shaderEnchParams(70, ["#ffffff", "#ffe28a", "#6a5cf0", "#262070", "#0a0826"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Stars" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 521), dep = shaderEnchDepth(S, 2);
    // the sky: deep inside, a bluer band near the edge, a gold rim
    const sky = S.palAt("ramp", S.sel(S.ge(dep, 2), 4, 3));
    const inner = shaderPaintMix(S, c, sky, A), rim = shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(S.mul(A, 6), 10));
    // stars twinkle once a loop each, out of step
    const h = S.hash(S.x, S.y, sd), star = S.and(S.ge(dep, 1), S.lt(S.mod(h, 100), S.div(A, 6)));
    const tw = S.mod(S.add(S.div(h, 100), S.frame), 16);
    const starc = S.pick([[S.lt(tw, 2), S.palAt("ramp", 0)], [S.lt(tw, 8), S.palAt("ramp", 1)]], S.palAt("ramp", 2));
    return S.pick([[S.not(S.solid(c)), c], [star, starc], [S.eq(dep, 0), rim]], inner);
  },
};

SHADER_DEFS.lasered = {
  label: "Laser scan", title: "laser enchant: a red laser line scanning down and up the sprite, white-hot where it cuts, sparks off its sides",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [0, 2, 0, 2], strength: "amount",
  tags: ["laser", "scan", "beam", "sci-fi", "cyber", "cut", "enchant", "red", "targeting", "tech"],
  params: Object.assign(shaderEnchParams(60, ["#ffffff", "#ffb4c0", "#ff1e3c", "#b80424", "#3c0210"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Sparks" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 531);
    // the line goes down half a loop and back up the other half
    const there = S.sel(S.lt(S.mul(S.frame, 2), S.FRAMES), S.frame, S.sub(S.FRAMES, S.frame));
    const pos = S.div(S.mul(there, S.mul(S.sub(S.h, 1), 2)), S.FRAMES), dy = S.abs(S.sub(S.y, pos));
    const on = S.gt(A, 0);
    const core = S.and(on, S.solid(c), S.eq(dy, 0)), glow = S.and(on, S.solid(c), S.eq(dy, 1));
    const side = S.or(S.solid(S.tex(1, 0)), S.solid(S.tex(-1, 0)), S.solid(S.tex(2, 0)), S.solid(S.tex(-2, 0)));
    const spark = S.and(on, S.eq(dy, 0), S.not(S.solid(c)), side, S.lt(S.mod(S.hash(S.x, S.frame, sd), 100), A));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 6));
    return S.pick([
      [core, S.palAt("ramp", 0)],
      [spark, S.palAt("ramp", 2)],
      [glow, shaderPaintMix(S, c, S.palAt("ramp", 1), A)],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.voided = {
  label: "Voided", title: "void enchant: pure black eating into the sprite, a pale lip flickering round each hole, dark motes drawn in",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["void", "abyss", "black hole", "nothing", "eldritch", "corruption", "enchant", "dark", "entropy", "curse"],
  params: Object.assign(shaderEnchParams(50, ["#f2eeff", "#b4a8d4", "#4a4058", "#1a1622", "#000000"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Holes" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 541);
    // the holes breathe a little, once a loop
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const thr = S.sub(255, S.div(S.mul(A, S.add(14, S.div(s, 250))), 10));
    const voidAt = function (dx, dy) { return S.and(S.solid(S.tex(dx, dy)), S.gt(shaderPaintNoise(S, S.add(S.x, dx), S.add(S.y, dy), 5, sd), thr)); };
    const hole = S.and(S.gt(A, 0), voidAt(0, 0));
    const lip = S.and(S.gt(A, 0), S.solid(c), S.not(hole), S.or(voidAt(1, 0), voidAt(-1, 0), voidAt(0, 1), voidAt(0, -1)));
    const flick = S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 4), 0);
    // motes: the outer ring on even half-steps, the inner on odd ones, so they seem to fall inward
    const mote = function (ring, odd) { return S.and(ring, S.lt(S.mod(S.hash(S.x, S.y, S.add(S.div(S.add(S.frame, odd), 2), sd)), 100), S.div(A, 4))); };
    const body = shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 4));
    return S.pick([
      [hole, S.palAt("ramp", 4)],
      [lip, S.sel(flick, S.palAt("ramp", 0), S.palAt("ramp", 1))],
      [mote(shaderEnchRing1(S), 1), S.palAt("ramp", 3)],
      [mote(shaderEnchRing2(S), 0), S.palAt("ramp", 2)],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.crystalline = {
  label: "Crystalline", title: "crystal enchant: the sprite turned to cut gem facets, bright seams between them, a glint crossing the facets",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [1, 0, 0, 0], strength: "amount",
  tags: ["crystal", "gem", "facets", "emerald", "jewel", "crystalline", "enchant", "quartz", "prism", "shard"],
  params: Object.assign(shaderEnchParams(60, ["#f0fff8", "#9ff0d0", "#3cc8a0", "#1a7a6e", "#0a2e30"]), {
    facet: { type: "int", min: 3, max: 10, def: 5, label: "Facet size (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cut" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 551);
    // facets: a jittered grid's cells, each one shade of the ramp, the seams between them bright
    const v = shaderPaintCells(S, S.p("facet"), sd), seam = shaderPaintJoin(S, v, 1);
    const shade = S.palAt("ramp", S.add(1, S.mod(S.hash(v.ax, v.ay, S.add(sd, 2)), 3)));
    // a glint sweeps across the facets diagonally, 64 px a loop
    const glint = S.lt(S.mod(S.sub(S.add(v.ax, v.ay), S.div(S.mul(S.frame, 64), S.FRAMES)), 64), 6);
    // small shards on top
    const shard = S.and(S.gt(A, 0), S.not(S.solid(c)), S.solid(S.tex(0, 1)), S.lt(S.mod(S.hash(S.x, 9, sd), 100), S.div(A, 4)));
    const facetc = shaderPaintMix(S, c, shade, S.div(S.mul(A, 8), 10));
    return S.pick([
      [shard, S.palAt("ramp", 1)],
      [S.not(S.solid(c)), c],
      [S.and(S.gt(A, 0), seam), shaderPaintMix(S, c, S.palAt("ramp", 0), A)],
      [S.and(S.gt(A, 0), glint), shaderPaintMix(S, facetc, S.palAt("ramp", 0), 50)],
    ], facetc);
  },
};

SHADER_DEFS.chrono = {
  label: "Chrono", title: "time enchant: the sprite aged to sepia, a clock hand ticking round it, motes of dust in the light",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 4, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["time", "chrono", "clock", "aged", "sepia", "hourglass", "enchant", "temporal", "rewind", "antique"],
  params: Object.assign(shaderEnchParams(60, ["#fffaf0", "#e8dcc0", "#c8a868", "#6e6a8a", "#2a2838"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Dust" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 561);
    const aged = shaderPaintMix(S, c, S.palAt("ramp", S.sub(4, S.div(S.mul(S.luma(c), 5), 256))), A);
    // the hand: one tick a frame, a whole turn a loop, starting at twelve; a faint sweep trails it
    const X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), Y2 = S.sub(S.add(S.mul(S.y, 2), 1), S.h);
    const ang = shaderMotionAtan(S, X2, Y2), ha = S.sub(S.div(S.mul(S.frame, 360), S.FRAMES), 90);
    const behind = S.mod(S.add(S.sub(ha, ang), 720), 360);
    const hand = S.and(S.gt(A, 0), S.lt(behind, 8)), trail = S.and(S.gt(A, 0), S.lt(behind, 50));
    const dust = S.and(S.gt(A, 0), S.lt(S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 100), S.div(A, 12)));
    return S.pick([
      [S.not(S.solid(c)), c],
      [hand, shaderPaintMix(S, aged, S.palAt("ramp", 0), 70)],
      [dust, S.palAt("ramp", 1)],
      [trail, shaderPaintMix(S, aged, S.palAt("ramp", 2), 25)],
    ], aged);
  },
};

SHADER_DEFS.ablaze = {
  label: "Ablaze", title: "fire enchant: flames licking up off every top edge of the sprite, taller with the amount, the body heated",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [6, 0, 0, 0], strength: "amount",
  tags: ["fire", "flames", "burning", "ablaze", "blaze", "hot", "enchant", "inferno", "torch", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#fff6c8", "#ffd03a", "#ff8a1e", "#d8401a", "#701808"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Flicker" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 571);
    // each column's flame 0..6 px, flickering every frame; its color by how far up it is
    const tall = S.div(S.mul(A, S.add(2, S.mod(S.hash(S.x, S.frame, sd), 5))), 100), k = shaderEnchBelow(S, 6);
    const flame = S.and(S.not(S.solid(c)), S.le(k, tall));
    const fc = S.pick([[S.le(S.mul(k, 3), tall), S.palAt("ramp", 1)], [S.le(S.mul(k, 3), S.mul(tall, 2)), S.palAt("ramp", 2)]], S.palAt("ramp", 3));
    // the sprite's top edges burn yellow, the outer pixels heated
    const top = S.and(S.solid(c), S.not(S.solid(S.tex(0, -1))), S.gt(A, 0));
    const hot = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, S.add(3, S.mul(shaderEnchDepth(S, 3), 2))));
    return S.pick([[flame, fc], [top, shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(S.mul(A, 7), 10))], [S.solid(c), hot]], c);
  },
};

SHADER_DEFS.frostbite = {
  label: "Frostbite", title: "ice enchant: frost creeping in from the edges, rime spikes growing off them, sparkles glinting on the ice",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["ice", "frost", "frozen", "frostbite", "cold", "winter", "enchant", "rime", "chill", "slow"],
  params: Object.assign(shaderEnchParams(55, ["#ffffff", "#d2f6ff", "#86dcff", "#3a94e0", "#1a3a80"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Rime" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 581);
    const nz = shaderPaintNoise(S, S.x, S.y, 3, sd), reach = S.add(S.div(S.mul(A, 8), 100), S.div(S.sub(nz, 128), 64));
    const frozen = S.and(S.gt(A, 0), S.solid(c), S.lt(shaderEnchDepth(S, 7), reach));
    const ice = S.palAt("ramp", S.sub(4, S.div(S.mul(S.luma(c), 4), 256)));
    const sparkle = S.and(frozen, S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 12), 0));
    // rime: spikes off the edge, the long ones a pixel further
    const hs = S.mod(S.hash(S.x, S.y, S.add(sd, 2)), 100);
    const spike1 = S.and(S.gt(A, 0), shaderEnchRing1(S), S.lt(hs, S.div(A, 2)));
    const spike2 = S.and(S.gt(A, 0), shaderEnchRing2(S), S.lt(hs, S.div(A, 6)));
    return S.pick([
      [spike1, S.palAt("ramp", 1)],
      [spike2, S.palAt("ramp", 0)],
      [sparkle, S.palAt("ramp", 0)],
      [frozen, shaderPaintMix(S, c, ice, 75)],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 6))],
    ], c);
  },
};

SHADER_DEFS.electrified = {
  label: "Electrified", title: "lightning enchant: arcs crackling round the sprite, veins of current flashing through it, the odd bright jolt",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["lightning", "electric", "shock", "volt", "spark", "storm", "enchant", "thunder", "zap", "charged"],
  params: Object.assign(shaderEnchParams(55, ["#ffffff", "#fffa9a", "#ffe23a", "#4a8cff", "#22308c"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Arcs" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 591);
    // arcs: 2 x 2 clumps of the two rings round it, new ones every frame
    const ha = S.mod(S.hash(S.div(S.x, 2), S.div(S.y, 2), S.add(S.frame, sd)), 100), on = S.lt(ha, S.div(A, 3));
    const arc1 = S.and(on, shaderEnchRing1(S)), arc2 = S.and(on, shaderEnchRing2(S));
    // veins: a ridge of a noise that reshapes every other frame (eight shapes, twice a loop)
    const nz = shaderPaintNoise(S, S.x, S.y, 4, S.add(sd, S.mod(S.div(S.frame, 2), 8)));
    const vein = S.and(S.gt(A, 0), S.solid(c), S.lt(S.abs(S.sub(nz, 128)), S.div(A, 10)));
    // a jolt on a few frames lights the whole sprite
    const jolt = S.eq(S.mod(S.hash(S.frame, 4, sd), 5), 0);
    const body = shaderPaintMix(S, c, S.palAt("ramp", S.sel(jolt, 1, 3)), S.div(A, S.sel(jolt, 2, 8)));
    return S.pick([
      [arc1, S.sel(S.lt(ha, S.div(A, 9)), S.palAt("ramp", 0), S.palAt("ramp", 2))],
      [arc2, S.palAt("ramp", 3)],
      [vein, S.palAt("ramp", 1)],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.venomous = {
  label: "Venomous", title: "poison enchant: toxic bubbles rising through the sprite, a sickly purple edge, fumes curling off its top",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [3, 0, 0, 0], strength: "amount",
  tags: ["poison", "venom", "toxic", "bubbles", "sickly", "fumes", "enchant", "plague", "potion", "debuff"],
  params: Object.assign(shaderEnchParams(55, ["#f0ffb8", "#b8f24a", "#6cc81e", "#3a8a1a", "#3a1a4c"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Bubbles" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 601);
    // 2 x 2 bubbles in some 4 px cells, rising 16 px a loop (the cells repeat every four down, so it closes)
    const yy = S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), cx = S.div(S.x, 4), cy = S.mod(S.div(yy, 4), 4);
    const fx = S.mod(S.x, 4), fy = S.mod(yy, 4), active = S.lt(S.mod(S.hash(cx, cy, sd), 100), S.div(A, 2));
    const inb = S.and(S.solid(c), active, S.ge(fx, 1), S.le(fx, 2), S.ge(fy, 1), S.le(fy, 2));
    const shine = S.and(inb, S.eq(fx, 1), S.eq(fy, 1));
    // fumes: drifting up from the top edges
    const fume = S.and(S.gt(A, 0), S.not(S.solid(c)), S.le(shaderEnchBelow(S, 3), 3),
      S.gt(shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, S.add(sd, 1), 16), S.sub(255, S.div(S.mul(A, 12), 10))));
    const edge = S.and(S.gt(A, 0), shaderPaintRim(S));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 3));
    return S.pick([
      [fume, S.palAt("ramp", 2)],
      [S.not(S.solid(c)), c],
      [shine, S.palAt("ramp", 0)],
      [inb, S.palAt("ramp", 1)],
      [edge, shaderPaintMix(S, c, S.palAt("ramp", 4), S.div(S.mul(A, 7), 10))],
    ], body);
  },
};

SHADER_DEFS.blessed = {
  label: "Blessed", title: "holy enchant: shafts of light slanting through the sprite, a gilded edge, motes of light rising round it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 8, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["holy", "blessed", "divine", "light", "sacred", "angelic", "enchant", "paladin", "cleric", "buff"],
  params: Object.assign(shaderEnchParams(55, ["#ffffff", "#fff6c8", "#ffe07a", "#e2a630", "#865410"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Rays" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 611);
    // shafts 10 px apart on a slant, drifting across one shaft a loop; some of them lit
    const u = S.sub(S.add(S.x, S.div(S.y, 3)), S.div(S.mul(S.frame, 10), S.FRAMES)), bi = S.mod(S.div(u, 10), 6);
    const shaft = S.and(S.solid(c), S.lt(S.mod(u, 10), 3), S.lt(S.mod(S.hash(bi, 3, sd), 100), A));
    const edge = S.and(S.gt(A, 0), S.solid(c), shaderPaintRim(S));
    // motes rising through the two pixels round it, 24 px a loop
    const rise = S.mod(S.add(S.y, S.frame), 24);
    const mote = S.and(S.or(shaderEnchRing1(S), shaderEnchRing2(S)), S.lt(S.mod(S.hash(S.x, rise, S.add(sd, 1)), 100), S.div(A, 5)));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(A, 5));
    return S.pick([
      [mote, S.sel(shaderEnchRing1(S), S.palAt("ramp", 1), S.palAt("ramp", 2))],
      [shaft, shaderPaintMix(S, c, S.palAt("ramp", 0), 55)],
      [edge, shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(S.mul(A, 7), 10))],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.shadowed = {
  label: "Shadowed", title: "shadow enchant: darkness rising up the sprite from below, violet smoke curling off its edges, a cold rim light",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [3, 2, 0, 2], strength: "amount",
  tags: ["shadow", "darkness", "smoke", "umbral", "stealth", "rogue", "enchant", "night", "gloom", "curse"],
  params: Object.assign(shaderEnchParams(55, ["#e2c8ff", "#a678e6", "#6a40b0", "#3a1e6a", "#14081e"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Smoke" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 621);
    // the dark climbs with the amount, its top ragged
    const nz = shaderPaintNoise(S, S.x, S.y, 4, sd);
    const dark = S.and(S.gt(A, 0), S.solid(c), S.ge(S.add(S.y, S.div(S.sub(nz, 128), 32)), S.sub(S.h, S.div(S.mul(A, S.h), 100))));
    const gloom = S.palAt("ramp", S.sub(4, S.div(S.mul(S.luma(c), 3), 256)));
    // smoke rising 16 px a loop off its sides (2 px) and its top (3 px), never under it
    const near = S.or(S.solid(S.tex(1, 0)), S.solid(S.tex(-1, 0)), S.solid(S.tex(2, 0)), S.solid(S.tex(-2, 0)), S.le(shaderEnchBelow(S, 3), 3));
    const sm = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, S.add(sd, 1), 16);
    const thr = S.sub(255, S.div(S.mul(A, 14), 10));
    const smoke = S.and(S.gt(A, 0), S.not(S.solid(c)), near, S.gt(sm, thr));
    // a rim light on the edges that face left
    const lit = S.and(S.gt(A, 0), S.solid(c), S.not(S.solid(S.tex(-1, 0))));
    return S.pick([
      [smoke, S.sel(S.gt(sm, S.add(thr, 30)), S.palAt("ramp", 2), S.palAt("ramp", 3))],
      [lit, shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(A, 2))],
      [dark, shaderPaintMix(S, c, gloom, 80)],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 5))],
    ], c);
  },
};

SHADER_DEFS.flooded = {
  label: "Flooded", title: "water enchant: water rising inside the sprite, its surface rippling, caustics and bubbles below it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["water", "flood", "aqua", "tide", "ocean", "liquid", "enchant", "wave", "submerged", "bubbles"],
  params: Object.assign(shaderEnchParams(60, ["#e8fffc", "#6ee8e4", "#1ca8d8", "#0e5ea8", "#082a5e"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Caustics" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 631);
    // the level, a pixel up or down as a wave runs along it once a loop
    const wave = S.div(shaderMotionSin(S, S.add(S.mul(S.x, 30), S.div(S.mul(S.frame, 360), S.FRAMES))), 700);
    const lev = S.add(S.sub(S.h, S.div(S.mul(A, S.h), 100)), wave);
    const under = S.and(S.gt(A, 0), S.solid(c), S.ge(S.y, lev)), surface = S.and(under, S.eq(S.y, lev));
    // caustics: a ridge of a noise flowing 16 px a loop; bubbles rising one pixel a frame
    const ca = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, sd, 16);
    const caustic = S.and(under, S.lt(S.abs(S.sub(ca, 128)), 10));
    const bub = S.and(under, S.lt(S.mod(S.hash(S.x, S.mod(S.add(S.y, S.frame), 16), S.add(sd, 1)), 100), 4));
    const water = shaderPaintMix(S, c, S.palAt("ramp", 2), 55);
    return S.pick([
      [S.not(under), c],
      [surface, S.palAt("ramp", 0)],
      [bub, S.palAt("ramp", 0)],
      [caustic, shaderPaintMix(S, water, S.palAt("ramp", 1), 50)],
    ], water);
  },
};

SHADER_DEFS.stoneskin = {
  label: "Stoneskin", title: "stone enchant: the sprite turning to cracked gray stone from the feet up, moss on its ledges, the front crumbling",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 8, fps: 6, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["stone", "stoneskin", "petrify", "rock", "granite", "earth", "enchant", "golem", "moss", "defense"],
  params: Object.assign(shaderEnchParams(50, ["#9cbc52", "#d2cdc0", "#959083", "#5e5a51", "#2c2a26"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cracks" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 641);
    const line = S.sub(S.h, S.div(S.mul(A, S.add(S.h, 2)), 100));
    const stoneAt = function (dy) { return S.and(S.gt(A, 0), S.ge(S.add(S.add(S.y, dy), S.div(S.sub(shaderPaintNoise(S, S.x, S.add(S.y, dy), 3, sd), 128), 48)), line)); };
    const stone = S.and(S.solid(c), stoneAt(0));
    // the front: stone with flesh above; it crumbles, a chip or two each frame
    const front = S.and(stone, S.solid(S.tex(0, -1)), S.not(stoneAt(-1)));
    const crumb = S.lt(S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 3), 1);
    const v = shaderPaintCells(S, 6, S.add(sd, 1)), crack = shaderPaintJoin(S, v, 1);
    const moss = S.and(S.not(S.solid(S.tex(0, -1))), S.lt(S.mod(S.hash(S.x, 4, S.add(sd, 2)), 3), 2));
    const grey = S.palAt("ramp", S.add(1, S.sub(3, S.div(S.mul(S.luma(c), 4), 256))));
    return S.pick([
      [S.not(stone), c],
      [front, S.sel(crumb, S.palAt("ramp", 1), S.palAt("ramp", 2))],
      [moss, S.palAt("ramp", 0)],
      [crack, S.palAt("ramp", 4)],
    ], grey);
  },
};

SHADER_DEFS.midastouch = {
  label: "Midas touch", title: "midas enchant: gold spreading over the sprite from one corner, its front glittering, glints running on the gold",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["midas", "gold", "golden", "touch", "treasure", "wealth", "enchant", "greed", "gilded", "curse"],
  params: Object.assign(shaderEnchParams(55, ["#fffbe0", "#ffe066", "#e8b020", "#a86c10", "#4a2a06"]), {
    from: { type: "int", min: 0, max: 3, def: 0, label: "Spreads from", choices: ["the bottom left", "the bottom right", "the top", "the middle"] },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Front" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), F = S.p("from"), sd = S.add(S.mul(S.p("seed"), 4), 651);
    const ox = S.pick([[S.eq(F, 0), 0], [S.eq(F, 1), S.sub(S.w, 1)]], S.div(S.w, 2));
    const oy = S.pick([[S.eq(F, 2), 0], [S.eq(F, 3), S.div(S.h, 2)]], S.sub(S.h, 1));
    const dx = S.sub(S.x, ox), dy = S.sub(S.y, oy), far = S.add(S.w, S.h);
    // the reach as a share of the sprite's size, ragged by a noise
    const d = S.add(shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy))), S.div(S.sub(shaderPaintNoise(S, S.x, S.y, 3, sd), 128), 40));
    const reach = S.div(S.mul(A, far), 100), gold = S.and(S.gt(A, 0), S.solid(c), S.lt(d, reach));
    const front = S.and(gold, S.ge(d, S.sub(reach, 2)));
    const glit = S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 4), 0);
    const glint = S.lt(S.mod(S.sub(S.sub(S.x, S.y), S.div(S.mul(S.frame, 48), S.FRAMES)), 48), 2);
    const g = S.palAt("ramp", S.add(1, S.sub(3, S.div(S.mul(S.luma(c), 4), 256))));
    return S.pick([
      [S.not(gold), c],
      [front, S.sel(glit, S.palAt("ramp", 0), S.palAt("ramp", 1))],
      [glint, S.palAt("ramp", 0)],
    ], g);
  },
};

SHADER_DEFS.prismatic = {
  label: "Prismatic", title: "prismatic enchant: the ramp's colors in diagonal bands cycling through the sprite, a spectrum split at its sides",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 1, 0, 1], strength: "amount",
  tags: ["prismatic", "rainbow", "spectrum", "iridescent", "holographic", "prism", "enchant", "chroma", "shiny", "rare"],
  params: Object.assign(shaderEnchParams(50, ["#ff4646", "#ffd83a", "#46e66a", "#3a8cff", "#a446e8"]), {
    band: { type: "int", min: 1, max: 6, def: 3, label: "Band width (px)" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), n = S.palCount("ramp"), B = S.p("band");
    // one band a color, the whole ramp passing once a loop
    const run = S.mul(n, B), u = S.mod(S.sub(S.add(S.x, S.y), S.div(S.mul(S.frame, run), S.FRAMES)), run);
    const bandc = S.palAt("ramp", S.div(u, B));
    // keep the sprite's shading: the band lightened or darkened by the pixel's brightness
    const lit = shaderPaintShade(S, bandc, S.add(60, S.div(S.mul(S.luma(c), 60), 255)), 0);
    const body = shaderPaintMix(S, c, lit, A);
    // the split: its first color off the left side, its last off the right
    const left = S.and(S.not(S.solid(c)), S.solid(S.tex(1, 0)), S.lt(shaderEnchDither(S), A));
    const right = S.and(S.not(S.solid(c)), S.solid(S.tex(-1, 0)), S.lt(shaderEnchDither(S, 2), A));
    return S.pick([
      [left, S.palAt("ramp", 0)],
      [right, S.palAt("ramp", S.sub(n, 1))],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.spectral = {
  label: "Spectral", title: "spectral enchant: the sprite drained pale and see-through, fading in and out, an echo of it drifting beside",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 2, 0, 2], strength: "amount",
  tags: ["spectral", "ghost", "phantom", "ethereal", "wraith", "spirit", "enchant", "haunted", "translucent", "undead"],
  params: shaderEnchParams(55, ["#ffffff", "#e6eef6", "#b2c4d6", "#7a8ea6", "#3a4458"]),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount");
    const pale = shaderPaintMix(S, c, S.palAt("ramp", S.sub(3, S.div(S.mul(S.luma(c), 4), 256))), A);
    // it fades in and out once a loop: a dither takes up to half of it at the faintest
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const fade = S.div(S.mul(A, S.add(30, S.div(s, 50))), 100), gone = S.and(S.solid(c), S.lt(shaderEnchDither(S), fade));
    // an echo swaying one to two pixels either side
    const ex = S.mul(S.sel(S.gt(s, 0), 1, -1), S.sel(S.gt(S.abs(s), 600), 2, 1));
    const echo = S.and(S.gt(A, 0), S.not(S.solid(c)), S.solid(S.texAt(S.sub(S.x, ex), S.y, "clear")), S.lt(shaderEnchDither(S, 1), A));
    return S.pick([[echo, S.palAt("ramp", 3)], [gone, S.clear], [S.solid(c), pale]], c);
  },
};

SHADER_DEFS.molten = {
  label: "Molten", title: "magma enchant: a black crust over the sprite cracking open, the cracks glowing and pulsing, embers rising",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [3, 0, 0, 0], strength: "amount",
  tags: ["magma", "molten", "lava", "crust", "volcanic", "embers", "enchant", "obsidian", "heat", "fire"],
  params: Object.assign(shaderEnchParams(55, ["#fff2a0", "#ffb02a", "#f0560e", "#3c2a24", "#120a08"]), {
    plate: { type: "int", min: 3, max: 10, def: 6, label: "Crust plate (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cracks" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 661);
    // the crust: plates darkened by the amount, cracks between them wider as it grows
    const v = shaderPaintCells(S, S.p("plate"), sd), crack = S.and(S.gt(A, 0), shaderPaintJoin(S, v, S.add(1, S.div(A, 34))));
    const crust = shaderPaintMix(S, c, S.palAt("ramp", S.sel(S.gt(S.luma(c), 110), 3, 4)), S.div(S.mul(A, 8), 10));
    // the glow pulses once a loop, each plate's edge out of step
    const s = shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), S.mod(S.hash(v.ax, v.ay, sd), 360)));
    const glow = S.palAt("ramp", S.sel(S.gt(s, 500), 0, S.sel(S.gt(s, -300), 1, 2)));
    const ember = S.and(S.gt(A, 0), S.not(S.solid(c)), S.le(shaderEnchBelow(S, 3), 3),
      S.lt(S.mod(S.hash(S.x, S.mod(S.add(S.y, S.frame), 16), S.add(sd, 1)), 100), S.div(A, 8)));
    return S.pick([[ember, S.palAt("ramp", 1)], [S.not(S.solid(c)), c], [crack, glow]], crust);
  },
};

SHADER_DEFS.blossom.variants = [{ amount: 100, seed: 2 }, { amount: 25, ramp: ["#ffffff", "#ffe2f0", "#c8a0ff", "#5a8a48", "#22381e"] }];
SHADER_DEFS.overgrown.variants = [{ amount: 100 }, { amount: 30, seed: 5 }];
SHADER_DEFS.astral.variants = [{ amount: 100, seed: 4 }, { amount: 35 }];
SHADER_DEFS.lasered.variants = [{ amount: 100 }, { amount: 30, ramp: ["#ffffff", "#b4ffd0", "#1eff6a", "#04a840", "#023c18"] }];
SHADER_DEFS.voided.variants = [{ amount: 100 }, { amount: 20, seed: 6 }];
SHADER_DEFS.crystalline.variants = [{ amount: 100, facet: 3 }, { amount: 35, facet: 10, ramp: ["#fff0ff", "#f0a0e0", "#c03ca8", "#6e1a6e", "#2e0a30"] }];
SHADER_DEFS.chrono.variants = [{ amount: 100 }, { amount: 30, seed: 3 }];
SHADER_DEFS.ablaze.variants = [{ amount: 100 }, { amount: 30, ramp: ["#e8fffc", "#9ae8ff", "#3aa0ff", "#2040c8", "#101860"] }];
SHADER_DEFS.frostbite.variants = [{ amount: 100 }, { amount: 25, seed: 7 }];
SHADER_DEFS.electrified.variants = [{ amount: 100 }, { amount: 30, ramp: ["#ffffff", "#ffd0ff", "#e060ff", "#8a30d0", "#30104c"] }];
SHADER_DEFS.venomous.variants = [{ amount: 100 }, { amount: 25, seed: 3 }];
SHADER_DEFS.blessed.variants = [{ amount: 100 }, { amount: 30, seed: 8 }];
SHADER_DEFS.shadowed.variants = [{ amount: 100 }, { amount: 30, seed: 2 }];
SHADER_DEFS.flooded.variants = [{ amount: 100 }, { amount: 30, ramp: ["#fff0e8", "#ff9a6e", "#e04a2a", "#8a1e10", "#3a0a06"] }];
SHADER_DEFS.stoneskin.variants = [{ amount: 100 }, { amount: 25, seed: 4 }];
SHADER_DEFS.midastouch.variants = [{ amount: 100 }, { amount: 40, from: 3 }, { amount: 30, from: 2, seed: 5 }];
SHADER_DEFS.prismatic.variants = [{ amount: 100, band: 1 }, { amount: 30, band: 6 }];
SHADER_DEFS.spectral.variants = [{ amount: 100 }, { amount: 25 }];
SHADER_DEFS.molten.variants = [{ amount: 100, plate: 3 }, { amount: 30, plate: 10, seed: 5 }];

// ---- Weathering, looks, a shockwave and three transitions ----
// ======================================================================================================================
// Weathering for a sprite (snow, moss, rust, dust, char, cracks) and glitter, each with an `amount` as its strength;
// three looks for a sprite or a screen (bloom, spray paint, sumi ink wash) and a risograph print; a shockwave ring for
// the screen; and three transitions (shatter, a spiral wipe, burning away). Private helpers shaderWx*; the shaderEnch*,
// shaderPaint*, shaderMotion* and shaderWorld* helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("snowcap", "mossy", "rusted", "dusty", "charred", "cracked", "glitter", "bloom", "spraypaint", "sumi",
  "risograph", "shockwave", "shatter", "spiralwipe", "burnaway");

// the first clear pixel straight above within K (its distance), or 99: how deep under a top-facing surface this is
function shaderWxOpenAbove(S, K) {
  let k = S.i(99);
  for (let i = K; i >= 1; i--) k = S.sel(S.solid(S.tex(0, -i)), k, i);
  return k;
}
// the 4 x 4 Bayer threshold (0..15) at (x / k, y / k) plus an offset, for a dither of k px cells
function shaderWxBayer(S, k, ox, oy) {
  return S.table(SHADER_ERA_BAYER4, S.add(S.mul(S.mod(S.add(S.div(S.y, k), oy || 0), 4), 4), S.mod(S.add(S.div(S.x, k), ox || 0), 4)));
}
// the distance from (px, py) to the pixel, and the angle (0..359, 0 along +x, y down)
function shaderWxPolar(S, px, py) {
  const dx = S.sub(S.x, px), dy = S.sub(S.y, py);
  return { dx: dx, dy: dy, d: shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy))), ang: shaderMotionAtan(S, dx, dy) };
}

SHADER_DEFS.snowcap = {
  label: "Snowcap", title: "snow settled on every top-facing edge of the sprite, heaped a little above it, glinting now and then",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 6, pad: [2, 0, 0, 0], strength: "amount",
  tags: ["snow", "winter", "snowcap", "frost", "christmas", "cold", "weather", "seasonal", "holiday", "drift"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 60, label: "Amount (%)" },
    snow: { type: "colour", def: "#f4f8ff", label: "Snow" },
    shade: { type: "colour", def: "#b4c6e2", label: "Snow shadow" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Drifts" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 701);
    // each column's depth of snow, 0..4 px, by the amount
    const th = S.min(S.div(S.mul(A, S.add(1, S.mod(S.hash(S.x, 1, sd), 3))), 50), 4), k = shaderWxOpenAbove(S, 4);
    const snowed = S.and(S.solid(c), S.le(k, th)), under = S.and(snowed, S.eq(k, th), S.gt(th, 1));
    // heaps a pixel or two above the surface
    const hp = S.mod(S.hash(S.x, 2, sd), 100), b = shaderEnchBelow(S, 2);
    const heap = S.and(S.gt(A, 0), S.not(S.solid(c)), S.or(S.and(S.eq(b, 1), S.lt(hp, A)), S.and(S.eq(b, 2), S.lt(hp, S.div(A, 3)))));
    const glint = S.and(snowed, S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 16), 0));
    return S.pick([
      [glint, S.rgba(255, 255, 255, 255)],
      [S.or(heap, S.and(snowed, S.not(under))), S.p("snow")],
      [under, S.p("shade")],
    ], c);
  },
};

SHADER_DEFS.mossy = {
  label: "Mossy", title: "moss grown over the sprite in soft patches, thickest on its top edges, tufts sprouting off them in the breeze",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 4, pad: [1, 0, 0, 0], strength: "amount",
  tags: ["moss", "mossy", "overgrown", "ruin", "ancient", "forest", "weathered", "damp", "nature", "lichen"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 55, label: "Amount (%)" },
    moss: { type: "colour", def: "#6c9c36", label: "Moss" },
    deep: { type: "colour", def: "#2f5219", label: "Moss shadow" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Patches" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 711);
    // a noise, favoring the top surfaces, past a threshold the amount lowers
    const thr = S.sub(300, S.div(S.mul(A, 26), 10));
    const score = S.add(shaderPaintNoise(S, S.x, S.y, 4, sd), S.sel(S.le(shaderWxOpenAbove(S, 2), 2), 60, 0));
    const moss = S.and(S.gt(A, 0), S.solid(c), S.gt(score, thr));
    const thick = S.and(moss, S.gt(score, S.add(thr, 40)));
    // tufts on the moss's top edge, nodding every few frames
    const below = S.add(shaderPaintNoise(S, S.x, S.add(S.y, 1), 4, sd), 60), h = S.hash(S.x, 3, sd);
    const tuft = S.and(S.gt(A, 0), S.not(S.solid(c)), S.solid(S.tex(0, 1)), S.gt(below, thr), S.lt(S.mod(h, 100), S.div(A, 2)),
      S.lt(S.mod(S.add(S.frame, S.div(h, 100)), 8), 6));
    const speck = S.eq(S.mod(S.hash(S.x, S.y, S.add(sd, 1)), 5), 0);
    return S.pick([
      [tuft, S.p("moss")],
      [S.and(thick, speck), S.p("deep")],
      [thick, S.p("moss")],
      [moss, shaderPaintMix(S, c, S.p("moss"), 55)],
    ], c);
  },
};

SHADER_DEFS.rusted = {
  label: "Rusted", title: "rust eating into the sprite in pitted spots, orange streaks running down from them, the rest tarnished",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["rust", "rusted", "corroded", "old", "metal", "decay", "weathered", "iron", "ruin", "junk"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 55, label: "Amount (%)" },
    rust: { type: "colour", def: "#a8481c", label: "Rust" },
    pit: { type: "colour", def: "#552010", label: "Pits" },
    bloom: { type: "colour", def: "#d8823e", label: "Bright flakes" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Spots" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 721);
    const thr = S.sub(255, S.div(S.mul(A, 15), 10));
    const rustAt = function (dy) { return S.and(S.solid(S.tex(0, dy)), S.gt(shaderPaintNoise(S, S.x, S.add(S.y, dy), 3, sd), thr)); };
    const spot = S.and(S.gt(A, 0), rustAt(0));
    const deep = S.and(spot, S.gt(shaderPaintNoise(S, S.x, S.y, 3, sd), S.add(thr, 25)));
    // streaks: in some columns, rust a few pixels above runs down
    const col = S.lt(S.mod(S.hash(S.x, 4, sd), 100), S.add(30, S.div(A, 2)));
    const streak = S.and(S.gt(A, 0), S.solid(c), col, S.or(rustAt(-1), rustAt(-2), rustAt(-3), rustAt(-4)));
    const flake = S.lt(S.mod(S.hash(S.x, S.y, S.add(sd, 1)), 100), 18);
    const tarnish = shaderPaintMix(S, shaderPaintPunch(S, c, S.sub(100, S.div(A, 2))), S.p("pit"), S.div(A, 8));
    return S.pick([
      [S.not(S.solid(c)), c],
      [deep, S.p("pit")],
      [spot, S.sel(flake, S.p("bloom"), S.p("rust"))],
      [streak, shaderPaintMix(S, tarnish, S.p("rust"), 45)],
    ], tarnish);
  },
};

SHADER_DEFS.dusty = {
  label: "Dusty", title: "dust settled on the sprite's top edges and speckled over it, its colors dulled with neglect",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["dust", "dusty", "old", "abandoned", "attic", "neglected", "faded", "antique", "weathered", "cobweb"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 55, label: "Amount (%)" },
    dust: { type: "colour", def: "#c9bea2", label: "Dust" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Speckle" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 731);
    const dull = shaderPaintMix(S, shaderPaintPunch(S, c, S.sub(100, S.div(S.mul(A, 7), 10))), S.p("dust"), S.div(A, 6));
    // a layer on the top surfaces, one or two pixels by the amount
    const k = shaderWxOpenAbove(S, 2), layer = S.and(S.gt(A, 0), S.le(k, S.add(1, S.div(A, 60))));
    const speck = S.lt(S.mod(S.hash(S.x, S.y, sd), 100), S.div(A, 4));
    return S.pick([
      [S.not(S.solid(c)), c],
      [layer, shaderPaintMix(S, c, S.p("dust"), S.add(40, S.div(A, 3)))],
      [S.and(S.gt(A, 0), speck), shaderPaintMix(S, dull, S.p("dust"), 45)],
    ], dull);
  },
};

SHADER_DEFS.charred = {
  label: "Charred", title: "the sprite burnt black from its edges in, embers glowing in the char, smoke curling up off it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [3, 0, 0, 0], strength: "amount",
  tags: ["charred", "burnt", "scorched", "ash", "embers", "fire", "smoke", "damaged", "ruin", "cinder"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 50, label: "Amount (%)" },
    char: { type: "colour", def: "#1e1814", label: "Char" },
    ember: { type: "colour", def: "#ff7a1e", label: "Embers" },
    smoke: { type: "colour", def: "#6a6460", label: "Smoke" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Burn" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 741);
    const nz = shaderPaintNoise(S, S.x, S.y, 3, sd), reach = S.add(S.div(S.mul(A, 6), 100), S.div(S.sub(nz, 128), 50));
    const dep = shaderEnchDepth(S, 6), burnt = S.and(S.gt(A, 0), S.solid(c), S.lt(dep, reach));
    const scorch = S.and(S.gt(A, 0), S.solid(c), S.not(burnt), S.lt(dep, S.add(reach, 2)));
    // embers pulse in the char, each out of step
    const h = S.hash(S.x, S.y, S.add(sd, 1)), glow = S.and(burnt, S.lt(S.mod(h, 100), 12), S.lt(S.mod(S.add(S.div(h, 100), S.frame), 16), 6));
    const smoke = S.and(S.gt(A, 0), S.not(S.solid(c)), S.le(shaderEnchBelow(S, 3), 3),
      S.gt(shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, S.add(sd, 2), 16), S.sub(255, S.div(S.mul(A, 11), 10))));
    return S.pick([
      [smoke, S.p("smoke")],
      [glow, S.p("ember")],
      [burnt, shaderPaintMix(S, S.p("char"), c, S.div(S.luma(c), 12))],
      [scorch, shaderPaintMix(S, c, S.p("char"), 45)],
    ], c);
  },
};

SHADER_DEFS.cracked = {
  label: "Cracked", title: "cracks running out from a point of impact across the sprite, a broken ring round it, longer with the amount",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["cracked", "broken", "damage", "fracture", "impact", "shatter", "hurt", "glass", "stone", "worn"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 60, label: "Amount (%)" },
    across: { type: "int", min: 0, max: 100, def: 45, label: "Impact across (%)" },
    down: { type: "int", min: 0, max: 100, def: 40, label: "Impact down (%)" },
    lines: { type: "int", min: 3, max: 12, def: 7, label: "Cracks" },
    crack: { type: "colour", def: "#1a1410", label: "Crack" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Break" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 751), L = S.p("lines");
    const P = shaderWxPolar(S, S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("down"), S.sub(S.h, 1)), 100));
    const reach = S.div(S.mul(A, S.add(S.w, S.h)), 160), sector = S.div(360, L);
    // each crack wanders by a noise; a pixel is on it when it lies within about half a pixel of its ray
    const wob = S.div(S.mul(S.sub(shaderPaintNoise(S, S.x, S.y, 4, sd), 128), sector), 500);
    const a = S.mod(S.add(S.add(P.ang, wob), 720), 360), ray = S.mod(S.div(a, sector), L), off = S.mod(a, sector);
    const near = S.mul(S.min(off, S.sub(sector, off)), S.max(P.d, 1));
    const len = S.div(S.mul(reach, S.add(55, S.mod(S.hash(ray, 1, sd), 46))), 100);
    const line = S.and(S.lt(near, 34), S.le(P.d, len));
    // a broken ring at about half the reach
    const ring = S.and(S.le(S.abs(S.sub(P.d, S.div(reach, 2))), 0), S.lt(S.mod(S.hash(ray, 2, sd), 100), 60));
    const hit = S.and(S.gt(A, 0), S.solid(c), S.or(line, ring, S.le(P.d, S.div(A, 50))));
    const edge = S.and(S.gt(A, 0), S.solid(c), S.not(hit), S.lt(near, 70), S.le(P.d, len));
    return S.pick([[hit, S.p("crack")], [edge, shaderPaintShade(S, c, 80, 0)]], c);
  },
};

SHADER_DEFS.glitter = {
  label: "Glitter", title: "glitter strewn over the sprite, each fleck twinkling in its own time, the brightest flaring into little stars",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["glitter", "sparkle", "sparkly", "glam", "fabulous", "shiny", "party", "magic", "fairy", "bling"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 50, label: "Amount (%)" },
    glints: { type: "palette", def: ["#ffffff", "#ffd2f4", "#c4eeff", "#fff09a"], max: 8, label: "Flecks" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Flecks" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 761), n = S.palCount("glints");
    const fleck = function (dx, dy) {
      const h = S.hash(S.add(S.x, dx), S.add(S.y, dy), sd);
      return { on: S.and(S.solid(S.tex(dx, dy)), S.lt(S.mod(h, 1000), S.mul(A, 3))), ph: S.mod(S.add(S.div(h, 1000), S.frame), 16), col: S.palAt("glints", S.mod(S.div(h, 7), n)) };
    };
    const me = fleck(0, 0), arms = [fleck(1, 0), fleck(-1, 0), fleck(0, 1), fleck(0, -1)];
    // at its peak a fleck lights its four neighbors too, out over the edge
    const lits = [];
    let starc = S.palAt("glints", 0);
    for (const f of arms) { const lit = S.and(f.on, S.eq(f.ph, 0)); starc = S.sel(lit, f.col, starc); lits.push(lit); }
    const star = S.or(...lits);
    return S.pick([
      [S.and(me.on, S.lt(me.ph, 2)), me.col],
      [star, starc],
      [S.and(me.on, S.lt(me.ph, 8)), shaderPaintMix(S, c, me.col, 50)],
    ], c);
  },
};

SHADER_DEFS.bloom = {
  label: "Bloom", title: "the brightest pixels glowing onto those round them, in hard dithered steps (no blur)",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["bloom", "glow", "bright", "light", "dreamy", "hdr", "lens", "shine", "retro", "post"],
  params: {
    threshold: { type: "int", min: 0, max: 254, def: 140, label: "Glows above (brightness)" },
    radius: { type: "int", min: 1, max: 3, def: 2, label: "Reach (px)" },
    glow: { type: "int", min: 0, max: 100, def: 60, label: "Strength (%)" },
    tint: { type: "colour", def: "#fff2d0", label: "Glow" },
    steps: { type: "int", min: 0, max: 1, def: 0, label: "Edges", choices: ["dithered", "banded"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), T = S.p("threshold"), R = S.p("radius");
    // the strongest glow reaching here: a brighter pixel's excess, falling off with distance (8 ways, 1..3 px)
    let best = S.max(S.sub(S.luma(c), T), 0);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (let k = 1; k <= 3; k++) for (const [dx, dy] of dirs) {
      const tap = shaderLooksAt(S, dx * k, dy * k), tl = S.sel(S.solid(tap), S.luma(tap), 0);
      const v = S.div(S.mul(S.max(S.sub(tl, T), 0), S.sub(S.add(R, 1), k)), S.add(R, 1));
      best = S.sel(S.le(k, R), S.max(best, v), best);
    }
    const t = S.min(S.div(S.mul(S.mul(best, 100), S.p("glow")), S.mul(S.max(S.sub(255, T), 1), 100)), 100);   // 0..100
    // three hard steps, dithered between or banded
    const lv = S.sel(S.eq(S.p("steps"), 0), S.div(S.add(S.mul(t, 3), S.div(S.mul(shaderWxBayer(S, 1), 100), 16)), 100), S.div(S.add(S.mul(t, 3), 50), 100));
    const out = shaderPaintMix(S, c, S.p("tint"), S.mul(S.min(lv, 3), 22));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.spraypaint = {
  label: "Spray paint", title: "the picture sprayed through a stencil in a few flat paint colors, the overspray speckling where they meet",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["spray paint", "graffiti", "stencil", "street art", "urban", "poster", "aerosol", "punk", "tag", "mural"],
  params: {
    paints: { type: "palette", def: ["#1c1a1e", "#d8324e", "#f6d24a", "#f4f0e6"], max: 6, label: "Paints (dark to light)" },
    grain: { type: "int", min: 0, max: 128, def: 48, label: "Overspray" },
    keep: { type: "int", min: 0, max: 255, def: 0, label: "Keep pixels darker than (an outline)" },
    speck: { type: "int", min: 1, max: 3, def: 1, label: "Speck size (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Spray" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("paints"), G = S.p("grain"), K = S.p("speck");
    const jit = S.sub(S.mod(S.hash(S.div(S.x, K), S.div(S.y, K), S.add(S.mul(S.p("seed"), 4), 771)), S.add(G, 1)), S.div(G, 2));
    const idx = S.div(S.add(S.mul(S.luma(c), n), S.mul(jit, n)), 256);
    return S.pick([[S.not(S.solid(c)), c], [S.lt(S.luma(c), S.p("keep")), c]], S.palAt("paints", idx));
  },
};

SHADER_DEFS.sumi = {
  label: "Sumi ink", title: "the picture as an ink wash on paper: blotchy tones of one ink, its edges brushed dark, dry-brush gaps in the strokes",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["sumi", "ink", "wash", "sumi-e", "brush", "japanese", "calligraphy", "painting", "monochrome", "paper"],
  params: {
    ink: { type: "colour", def: "#1e1c26", label: "Ink" },
    paper: { type: "colour", def: "#f2ead6", label: "Paper" },
    blotch: { type: "int", min: 0, max: 100, def: 40, label: "Blotches" },
    edge: { type: "int", min: 0, max: 255, def: 40, label: "Brush the edges where brightness jumps by" },
    dry: { type: "int", min: 0, max: 100, def: 20, label: "Dry brush (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Wash" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 781), l = S.luma(c);
    // the tone: brightness shifted by a soft noise, cut into four washes of the ink
    const lb = S.add(l, S.div(S.mul(S.sub(shaderPaintNoise(S, S.x, S.y, 5, sd), 128), S.p("blotch")), 100));
    const wash = S.clamp(S.sub(3, S.div(S.mul(S.clamp(lb, 0, 255), 4), 256)), 0, 3);
    const tone = shaderPaintMix(S, S.p("paper"), S.p("ink"), S.pick([[S.eq(wash, 0), 0], [S.eq(wash, 1), 30], [S.eq(wash, 2), 60]], 100));
    // edges where the brightness jumps, but not in a dry-brush gap (a few rows of short gaps)
    const E = S.p("edge"), jump = S.or(S.gt(S.abs(S.sub(S.luma(shaderLooksAt(S, 1, 0)), l)), E), S.gt(S.abs(S.sub(S.luma(shaderLooksAt(S, 0, 1)), l)), E),
      S.not(S.solid(shaderLooksAt(S, 1, 0))), S.not(S.solid(shaderLooksAt(S, 0, 1))), S.not(S.solid(shaderLooksAt(S, -1, 0))), S.not(S.solid(shaderLooksAt(S, 0, -1))));
    const gap = S.lt(S.mod(S.hash(S.div(S.x, 3), S.y, S.add(sd, 1)), 100), S.p("dry"));
    const out = S.pick([[S.and(jump, S.not(gap)), S.p("ink")], [S.and(gap, S.gt(wash, 0)), shaderPaintMix(S, tone, S.p("paper"), 50)]], tone);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.risograph = {
  label: "Risograph", title: "the picture printed in two dithered spot inks on paper, one a pixel out of register, flecked with print grain",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["risograph", "riso", "print", "zine", "two-tone", "spot color", "misregistered", "duotone", "indie", "poster"],
  params: {
    ink1: { type: "colour", def: "#ff48b0", label: "First ink" },
    ink2: { type: "colour", def: "#0078bf", label: "Second ink" },
    paper: { type: "colour", def: "#f4efe4", label: "Paper" },
    shift: { type: "int", min: 0, max: 3, def: 1, label: "Out of register (px)" },
    grid: { type: "int", min: 1, max: 3, def: 1, label: "Dither cell (px)" },
    grain: { type: "int", min: 0, max: 50, def: 8, label: "Grain (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("grid"), M = S.p("shift"), i1 = S.p("ink1"), i2 = S.p("ink2"), pa = S.p("paper");
    // the first ink takes what the green lacks, the second (read a few px off) what the red lacks, each dithered
    const c2 = shaderLooksAt(S, S.neg(M), S.neg(M));
    const cov1 = S.sub(255, S.g(c)), cov2 = S.sel(S.solid(c2), S.sub(255, S.r(c2)), 0);
    const grain = S.lt(S.mod(S.hash(S.x, S.y, 791), 100), S.p("grain"));
    const on1 = S.and(S.not(grain), S.gt(S.div(cov1, 16), shaderWxBayer(S, K))), on2 = S.and(S.not(grain), S.gt(S.div(cov2, 16), shaderWxBayer(S, K, 2, 1)));
    const mul = function (a, b) { return S.rgba(S.div(S.mul(S.r(a), S.r(b)), 255), S.div(S.mul(S.g(a), S.g(b)), 255), S.div(S.mul(S.b(a), S.b(b)), 255), 255); };
    const out = S.pick([[S.and(on1, on2), mul(i1, i2)], [on1, mul(i1, pa)], [on2, mul(i2, pa)]], pa);
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.shockwave = {
  label: "Shockwave", title: "a ring bursting out from a point across the screen, pushing the picture outward as it passes, a bright front",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["shockwave", "blast", "explosion", "impact", "ring", "boom", "distortion", "pulse", "stomp", "nova"],
  params: {
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    push: { type: "int", min: 1, max: 6, def: 3, label: "Push (px)" },
    width: { type: "int", min: 2, max: 12, def: 5, label: "Ring width (px)" },
    flash: { type: "int", min: 0, max: 100, def: 35, label: "Front brightness (%)" },
    tint: { type: "colour", def: "#ffffff", label: "Front" },
  },
  fragment: function (S) {
    const P = shaderWxPolar(S, S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100));
    const Rm = S.add(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 1), W = S.p("width");
    // the ring's radius grows over the loop; its push fades as it spreads
    const r = S.div(S.mul(S.frame, Rm), S.FRAMES), gap = S.abs(S.sub(P.d, r));
    const off = S.sel(S.lt(gap, W), S.div(S.mul(S.mul(S.p("push"), S.sub(W, gap)), S.sub(Rm, r)), S.mul(W, Rm)), 0);
    const dd = S.max(P.d, 1), sx = S.div(S.mul(P.dx, off), dd), sy = S.div(S.mul(P.dy, off), dd);
    const src = S.texAt(S.sub(S.x, sx), S.sub(S.y, sy), "clamp");
    const front = S.and(S.gt(r, 0), S.lt(gap, 1));
    return S.sel(front, shaderPaintMix(S, src, S.p("tint"), S.p("flash")), src);
  },
};

SHADER_DEFS.shatter = {
  label: "Shatter", title: "the screen cracks into shards that light up and drop out one by one, leaving the cover behind",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    shard: { type: "int", min: 4, max: 24, def: 9, label: "Shard size (px)" },
    crack: { type: "colour", def: "#e8f2ff", label: "Cracks" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Break" },
  },
  fragment: function (S) {
    const p = S.progress(), sd = S.add(S.mul(S.p("seed"), 4), 801);
    const v = shaderPaintCells(S, S.p("shard"), sd), seam = shaderPaintJoin(S, v, 1);
    // each shard goes at its own time (6..93); just before, it lights up and sags a pixel
    const at = S.add(6, S.mod(S.hash(v.ax, v.ay, S.add(sd, 2)), 88)), gone = S.ge(p, at), going = S.and(S.gt(p, 0), S.not(gone), S.ge(p, S.sub(at, 6)));
    const cracks = S.and(S.gt(p, 0), seam);
    const img = S.sel(going, shaderPaintMix(S, shaderLooksAt(S, 0, -1), S.p("crack"), 35), S.tex(0, 0));
    return S.pick([[gone, S.p("cover")], [cracks, S.p("crack")]], img);
  },
};

SHADER_DEFS.spiralwipe = {
  label: "Spiral wipe", title: "the cover winds in along a spiral from the edges to a point",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    arm: { type: "int", min: 2, max: 24, def: 8, label: "Arm width (px)" },
    turn: { type: "int", min: 0, max: 1, def: 0, label: "Turns", choices: ["clockwise", "counterclockwise"] },
  },
  fragment: function (S) {
    const px = S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), py = S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100), P = shaderWxPolar(S, px, py);
    const mx = S.add(S.max(px, S.sub(S.sub(S.w, 1), px)), 1), my = S.add(S.max(py, S.sub(S.sub(S.h, 1), py)), 1);
    const Rm = S.add(shaderPaintSqrt(S, S.add(S.mul(mx, mx), S.mul(my, my))), 1), arm = S.p("arm");
    // the spiral's arc length from the outside, in degrees: whole arms in from the edge, plus the angle round
    const ang = S.sel(S.eq(S.p("turn"), 0), P.ang, S.sub(359, P.ang));
    const val = S.add(S.div(S.mul(S.sub(Rm, P.d), 360), arm), ang), top = S.add(S.div(S.mul(Rm, 360), arm), 360);
    return S.sel(S.lt(S.mul(val, 100), S.mul(S.progress(), top)), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.burnaway = {
  label: "Burn away", title: "the screen burns away in ragged holes, their edges glowing and charring, until only the cover is left",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    hot: { type: "colour", def: "#ffe066", label: "Burning edge" },
    ember: { type: "colour", def: "#ff5a1e", label: "Embers" },
    char: { type: "colour", def: "#2a1a10", label: "Char" },
    cell: { type: "int", min: 2, max: 12, def: 6, label: "Burn size (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Burn" },
  },
  fragment: function (S) {
    const p = S.progress(), sd = S.add(S.mul(S.p("seed"), 4), 811), C = S.p("cell");
    const nz = S.div(S.add(S.mul(shaderPaintNoise(S, S.x, S.y, C, sd), 3), shaderPaintNoise(S, S.x, S.y, S.add(S.div(C, 2), 1), S.add(sd, 1))), 4);
    const th = S.sub(S.div(S.mul(p, 280), 100), 14), on = S.gt(p, 0);
    const flick = S.eq(S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 3), 0);
    return S.pick([
      [S.lt(nz, th), S.p("cover")],
      [S.and(on, S.lt(nz, S.add(th, 4))), S.sel(flick, S.p("ember"), S.p("hot"))],
      [S.and(on, S.lt(nz, S.add(th, 10))), S.p("ember")],
      [S.and(on, S.lt(nz, S.add(th, 20))), shaderPaintMix(S, S.tex(0, 0), S.p("char"), 55)],
    ], S.tex(0, 0));
  },
};

SHADER_DEFS.snowcap.variants = [{ amount: 100 }, { amount: 25, snow: "#fff6e8", shade: "#d8c0a0", seed: 3 }];
SHADER_DEFS.mossy.variants = [{ amount: 100 }, { amount: 25, moss: "#9aa83a", deep: "#4a5a1c", seed: 4 }];
SHADER_DEFS.rusted.variants = [{ amount: 100 }, { amount: 25, rust: "#3e8a6e", pit: "#1c4234", bloom: "#78c8a0", seed: 2 }];
SHADER_DEFS.dusty.variants = [{ amount: 100 }, { amount: 25, dust: "#9a9a9a" }];
SHADER_DEFS.charred.variants = [{ amount: 100 }, { amount: 25, ember: "#6ae0ff", seed: 6 }];
SHADER_DEFS.cracked.variants = [{ amount: 100, lines: 12 }, { amount: 35, across: 80, down: 20, lines: 3, crack: "#f0f6ff" }];
SHADER_DEFS.glitter.variants = [{ amount: 100 }, { amount: 25, glints: ["#ffe08a", "#ffb43c", "#fff6d8"] }];
SHADER_DEFS.bloom.variants = [{ threshold: 100, radius: 3, glow: 100 }, { threshold: 210, radius: 1, steps: 1, tint: "#c8e0ff" }];
SHADER_DEFS.spraypaint.variants = [{ paints: ["#101418", "#2aa0d8", "#f4f0e6"], grain: 96 }, { paints: ["#2a1a3a", "#e8508a", "#ffb43a", "#fff6d8"], grain: 16, speck: 2, keep: 50 }];
SHADER_DEFS.sumi.variants = [{ blotch: 100, dry: 50 }, { ink: "#5a1a14", paper: "#fff8ec", blotch: 0, edge: 90, dry: 0 }];
SHADER_DEFS.risograph.variants = [{ shift: 0, grid: 2 }, { ink1: "#ffd800", ink2: "#ff4848", shift: 3, grain: 25 }];
SHADER_DEFS.shockwave.variants = [{ push: 6, width: 12, flash: 80 }, { cx: 20, cy: 80, push: 1, width: 2, flash: 0 }];
SHADER_DEFS.shatter.variants = [{ shard: 4 }, { shard: 24, cover: "#ffffff", crack: "#202020", seed: 5 }];
SHADER_DEFS.spiralwipe.variants = [{ arm: 3 }, { arm: 20, turn: 1, cx: 25, cy: 75, cover: "#1a0a2a" }];
SHADER_DEFS.burnaway.variants = [{ cell: 2 }, { cell: 12, hot: "#c8ffe8", ember: "#3ae0a0", char: "#0a2a1e", seed: 7 }];

// ---- Game feel and UI: icon states, screen moods, three more transitions ----
// ======================================================================================================================
// For an item's icon in a game's UI: a cooldown sweep, grayed out, a rarity outline by tier, a loot beam, marching ants
// and a pressed or raised button. For the screen: a low-health pulse, anime speed lines, letterbox bars sliding in,
// cloud shadows drifting over the ground and an aurora. And three transitions: a clock wipe, a slide off the screen
// and a glitch cut. Private helpers shaderUi*; the shaderEnch*, shaderWx*, shaderPaint*, shaderMotion* and shaderWorld*
// helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("cooldown", "grayedout", "rarity", "lootbeam", "marchingants", "pressed", "lowhealth", "speedlines",
  "letterbox", "cloudshadow", "aurora", "clockwipe", "slide", "glitchcut");

// the angle round the image's middle (half pixels, so an even size is symmetric), clockwise from twelve, 0..359; and the
// distance in half pixels
function shaderUiClock(S, cx, cy) {
  const X2 = cx === undefined ? S.sub(S.add(S.mul(S.x, 2), 1), S.w) : S.sub(S.add(S.mul(S.x, 2), 1), S.mul(cx, 2));
  const Y2 = cy === undefined ? S.sub(S.add(S.mul(S.y, 2), 1), S.h) : S.sub(S.add(S.mul(S.y, 2), 1), S.mul(cy, 2));
  return { X2: X2, Y2: Y2, a: S.mod(S.add(shaderMotionAtan(S, X2, Y2), 90), 360), d2: shaderPaintSqrt(S, S.add(S.mul(X2, X2), S.mul(Y2, Y2))) };
}
// three hard steps of t (0..100), dithered between: 0..3
function shaderUiSteps(S, t) {
  return S.min(S.div(S.add(S.mul(t, 3), S.div(S.mul(shaderWxBayer(S, 1), 100), 16)), 100), 3);
}

SHADER_DEFS.cooldown = {
  label: "Cooldown", title: "an ability icon's cooldown: a dark sweep winding back clockwise from twelve, its edge lit, a flash when it is ready",
  group: "Items", kind: "sprite", palette: "free", frames: 24, fps: 12, pad: [1, 1, 1, 1],
  tags: ["cooldown", "ability", "skill", "icon", "ui", "hud", "timer", "recharge", "clock", "hotbar"],
  params: {
    progress: shaderWorldProgress(),
    shade: { type: "colour", def: "#0e0e18", label: "Sweep" },
    dim: { type: "int", min: 0, max: 100, def: 60, label: "Sweep darkness (%)" },
    edge: { type: "colour", def: "#ffffff", label: "Edge and ready flash" },
    flash: { type: "int", min: 0, max: 1, def: 0, label: "When ready", choices: ["flashes", "just clears"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), p = S.progress(), K = shaderUiClock(S);
    // what is left of the cooldown lies past the hand; the hand itself is a lit line
    const hand = S.div(S.mul(p, 360), 100), left = S.ge(S.mul(K.a, 100), S.mul(p, 360));
    const line = S.and(S.gt(p, 0), S.lt(p, 100), S.lt(S.mul(S.abs(S.sub(K.a, hand)), S.max(K.d2, 1)), 80));
    const ready = S.and(S.eq(p, 100), S.eq(S.p("flash"), 0));
    return S.pick([
      [S.and(ready, shaderEnchRing1(S)), S.p("edge")],
      [S.not(S.solid(c)), c],
      [ready, shaderPaintMix(S, c, S.p("edge"), 30)],
      [line, shaderPaintMix(S, c, S.p("edge"), 70)],
      [left, shaderPaintMix(S, c, S.p("shade"), S.p("dim"))],
    ], c);
  },
};

SHADER_DEFS.grayedout = {
  label: "Disabled", title: "a grayed-out icon: drained of color and dimmed, optionally dithered or crossed out in its own darkest gray",
  group: "Items", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["disabled", "grayed out", "locked", "unavailable", "inactive", "ui", "icon", "button", "grayscale", "hud"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 100, label: "Amount (%)" },
    style: { type: "int", min: 0, max: 2, def: 0, label: "Style", choices: ["grayed", "grayed and dithered", "crossed out"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), st = S.p("style"), l = S.luma(c);
    const g = S.add(S.div(S.mul(l, 6), 10), 34), grey = shaderPaintMix(S, c, S.rgba(g, g, g, 255), A);
    const dith = S.and(S.eq(st, 1), S.gt(A, 0), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    // the cross: both diagonals of the image, about a pixel wide
    const m = S.max(S.w, S.h), d1 = S.abs(S.sub(S.mul(S.x, S.h), S.mul(S.y, S.w))), d2 = S.abs(S.sub(S.mul(S.sub(S.sub(S.w, 1), S.x), S.h), S.mul(S.y, S.w)));
    const cross = S.and(S.eq(st, 2), S.gt(A, 0), S.or(S.lt(d1, m), S.lt(d2, m)));
    return S.pick([[S.not(S.solid(c)), c], [cross, shaderPaintShade(S, grey, 45, 0)], [dith, shaderPaintShade(S, grey, 120, 10)]], grey);
  },
};

SHADER_DEFS.rarity = {
  label: "Rarity outline", title: "an item's rarity as an outline of its tier's color; higher tiers add a shine running round it, a glow, then sparkles",
  group: "Items", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [2, 2, 2, 2],
  tags: ["rarity", "tier", "loot", "legendary", "epic", "rare", "outline", "rpg", "item", "drop"],
  params: {
    tier: { type: "int", min: 0, max: 5, def: 4, label: "Tier", choices: ["common", "uncommon", "rare", "epic", "legendary", "mythic"] },
    tiers: { type: "palette", def: ["#b4b4b4", "#4ade5a", "#3a8cff", "#b45aff", "#ff9a1e", "#ff3a6a"], max: 8, label: "Tier colors" },
    glint: { type: "colour", def: "#ffffff", label: "Shine" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Sparkles" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), T = S.p("tier"), col = S.palAt("tiers", T), sd = S.add(S.mul(S.p("seed"), 4), 841), K = shaderUiClock(S);
    const r1 = shaderEnchRing1(S), r2 = shaderEnchRing2(S);
    // rare and up: a shine runs round the outline once a loop
    const behind = S.mod(S.add(S.sub(S.div(S.mul(S.frame, 360), S.FRAMES), K.a), 720), 360);
    const shine = S.and(S.ge(T, 2), r1, S.lt(behind, 45));
    // epic and up: a dithered glow a pixel further out, breathing
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const glow = S.and(S.ge(T, 3), r2, S.lt(shaderWxBayer(S, 1), S.add(5, S.div(s, 250))));
    // legendary and up: sparkles on the sprite (and, mythic, in the glow)
    const sp = S.eq(S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 40), 0);
    const spark = S.and(S.ge(T, 4), sp, S.or(S.solid(c), S.and(S.ge(T, 5), r2)));
    return S.pick([
      [spark, S.p("glint")],
      [shine, shaderPaintMix(S, col, S.p("glint"), 65)],
      [r1, col],
      [glow, col],
      [S.and(S.ge(T, 5), S.solid(c)), shaderPaintMix(S, c, col, 20)],
    ], c);
  },
};

SHADER_DEFS.lootbeam = {
  label: "Loot beam", title: "a pillar of light rising off a dropped item, fading upward and pulsing, motes drifting up it",
  group: "Items", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [16, 0, 0, 0],
  tags: ["loot", "beam", "drop", "pillar", "light", "rpg", "item", "pickup", "rarity", "treasure"],
  params: {
    beam: { type: "colour", def: "#ffd84a", label: "Beam" },
    core: { type: "colour", def: "#fff8dc", label: "Core and motes" },
    width: { type: "int", min: 1, max: 9, def: 4, label: "Width (half px either side)" },
    tall: { type: "int", min: 4, max: 15, def: 12, label: "Height (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Motes" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 851), X2 = S.sub(S.add(S.mul(S.x, 2), 1), S.w), ax = S.abs(X2);
    // up from whatever of the sprite lies under each column of the beam, pulsing a few px in height
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const top = S.sub(S.p("tall"), S.div(S.add(1000, s), 500)), k = shaderEnchBelow(S, 15);
    const inside = S.and(S.not(S.solid(c)), S.le(k, top), S.le(ax, S.p("width")));
    const dens = S.div(S.mul(S.add(S.sub(top, k), 1), 100), S.max(top, 1));
    const beam = S.and(inside, S.lt(S.div(S.mul(shaderWxBayer(S, 1), 100), 16), dens));
    const mote = S.and(inside, S.lt(S.mod(S.hash(S.x, S.mod(S.add(S.y, S.frame), 16), sd), 100), 10));
    const base = S.and(S.solid(c), S.not(S.solid(S.tex(0, -1))), S.le(ax, S.p("width")));
    return S.pick([
      [mote, S.p("core")],
      [S.and(beam, S.le(ax, 1)), S.p("core")],
      [beam, S.p("beam")],
      [base, shaderPaintMix(S, c, S.p("beam"), 55)],
    ], c);
  },
};

SHADER_DEFS.marchingants = {
  label: "Marching ants", title: "a selection outline of two-color dashes marching round the sprite",
  group: "Items", kind: "sprite", frames: 12, fps: 12, pad: [1, 1, 1, 1],
  tags: ["marching ants", "selection", "selected", "outline", "dashes", "editor", "ui", "lasso", "cursor", "highlight"],
  params: {
    one: { type: "colour", def: "#ffffff", label: "Dashes" },
    two: { type: "colour", def: "#000000", label: "Gaps" },
    dash: { type: "int", min: 1, max: 6, def: 2, label: "Dash length (px)" },
    reverse: { type: "int", min: 0, max: 1, def: 0, label: "Marches", choices: ["forward", "backward"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), D = S.p("dash"), P = S.mul(D, 2);
    // one dash period a loop, so it closes for any length
    const step = S.div(S.mul(S.frame, P), S.FRAMES), u = S.sel(S.eq(S.p("reverse"), 0), S.sub(S.add(S.x, S.y), step), S.add(S.add(S.x, S.y), step));
    return S.sel(shaderEnchRing1(S), S.sel(S.lt(S.mod(u, P), D), S.p("one"), S.p("two")), c);
  },
};

SHADER_DEFS.pressed = {
  label: "Pressed", title: "a button pressed in (sunk a pixel or two, darkened, its top in shadow) or raised (lifted, lit, a shadow left under it)",
  group: "Items", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [2, 0, 2, 0],
  tags: ["pressed", "button", "click", "raised", "hover", "ui", "press", "state", "icon", "menu"],
  params: {
    how: { type: "int", min: 0, max: 1, def: 0, label: "Button", choices: ["pressed in", "raised"] },
    depth: { type: "int", min: 0, max: 2, def: 1, label: "Depth (px)" },
    dark: { type: "int", min: 0, max: 100, def: 30, label: "Shade (%)" },
    shadow: { type: "colour", def: "#000000", label: "Shadow" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), d = S.p("depth"), up = S.eq(S.p("how"), 1), dk = S.p("dark");
    const sy = S.sel(up, S.add(S.y, d), S.sub(S.y, d)), src = S.texAt(S.x, sy, "clear"), over = S.texAt(S.x, S.sub(sy, 1), "clear");
    const topEdge = S.and(S.solid(src), S.not(S.solid(over)));
    const sunk = shaderPaintShade(S, src, S.sub(100, S.div(dk, 2)), 0), lit = shaderPaintShade(S, src, 100, S.div(dk, 3));
    const pressedC = S.sel(topEdge, shaderPaintMix(S, src, S.p("shadow"), S.add(20, S.div(dk, 2))), sunk);
    const raisedC = S.sel(topEdge, shaderPaintShade(S, src, 100, S.div(dk, 2)), lit);
    // raised: where the sprite was and no longer is, its shadow
    const shade = S.and(up, S.not(S.solid(src)), S.solid(c));
    return S.pick([[S.eq(d, 0), c], [shade, shaderPaintMix(S, c, S.p("shadow"), S.add(30, S.div(dk, 2)))], [S.not(S.solid(src)), src]],
      S.rgba(S.r(S.sel(up, raisedC, pressedC)), S.g(S.sel(up, raisedC, pressedC)), S.b(S.sel(up, raisedC, pressedC)), 255));
  },
};

SHADER_DEFS.lowhealth = {
  label: "Low health", title: "the screen's edges throbbing red with a heartbeat (lub-dub), deeper in as the amount grows",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["low health", "danger", "hurt", "heartbeat", "vignette", "damage", "hud", "critical", "blood", "warning"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 60, label: "Amount (%)" },
    tint: { type: "colour", def: "#c8102e", label: "Color" },
    beat: { type: "int", min: 0, max: 1, def: 0, label: "Beat", choices: ["heartbeat", "steady pulse"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), K = shaderUiClock(S);
    // the distance out from the middle, 0 there to 1000 at the edge's middle (1414 in a corner)
    const ex = S.div(S.mul(K.X2, 1000), S.max(S.w, 1)), ey = S.div(S.mul(K.Y2, 1000), S.max(S.h, 1));
    const r = shaderPaintSqrt(S, S.add(S.mul(ex, ex), S.mul(ey, ey)));
    const f = S.div(S.mul(S.frame, 16), S.FRAMES), s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const pulse = S.sel(S.eq(S.p("beat"), 0), S.pick([[S.lt(f, 2), 100], [S.and(S.ge(f, 3), S.lt(f, 5)), 75]], 35), S.add(65, S.div(s, 29)));
    const inner = S.sub(1000, S.div(S.mul(S.mul(A, 6), pulse), 100));
    const t = S.clamp(S.div(S.mul(S.sub(r, inner), 100), S.max(S.sub(1414, inner), 1)), 0, 100);
    const lv = S.sel(S.gt(A, 0), shaderUiSteps(S, t), 0);
    return S.sel(S.gt(lv, 0), shaderPaintMix(S, c, S.p("tint"), S.mul(lv, 28)), c);
  },
};

SHADER_DEFS.speedlines = {
  label: "Speed lines", title: "anime speed lines flickering in from the screen's edges toward a point, a clear space left round it",
  group: "World", kind: "screen", palette: "free", frames: 8, fps: 16, pad: [0, 0, 0, 0],
  tags: ["speed lines", "anime", "manga", "focus", "action", "dash", "impact", "dramatic", "zoom", "radial"],
  params: {
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    lines: { type: "int", min: 0, max: 100, def: 35, label: "Lines (%)" },
    inner: { type: "int", min: 0, max: 90, def: 45, label: "Clear in the middle (%)" },
    ink: { type: "colour", def: "#ffffff", label: "Lines" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S, S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100));
    const half = S.max(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 1), dn = S.div(S.mul(K.d2, 100), half);
    // one line in some 4 degree wedges, new ones each frame, starting a little way out and thickening outward
    const wedge = S.div(K.a, 4), h = S.hash(wedge, S.frame, 861), on = S.lt(S.mod(h, 100), S.p("lines"));
    const start = S.add(S.p("inner"), S.mod(S.div(h, 100), 30));
    const line = S.and(on, S.gt(dn, start), S.lt(S.mod(K.a, 4), S.add(1, S.div(S.sub(dn, start), 25))));
    return S.sel(line, S.p("ink"), c);
  },
};

SHADER_DEFS.letterbox = {
  label: "Letterbox", title: "cinematic black bars sliding in from the top and bottom of the screen",
  group: "World", kind: "screen", frames: 12, fps: 12, pad: [0, 0, 0, 0], still0: true,
  tags: ["letterbox", "cinematic", "cutscene", "bars", "widescreen", "movie", "dialogue", "film", "story", "scene"],
  params: {
    progress: shaderWorldProgress(),
    bars: { type: "int", min: 1, max: 40, def: 12, label: "Bar height (% each)" },
    bar: { type: "colour", def: "#000000", label: "Bars" },
  },
  fragment: function (S) {
    const p = S.progress(), hh = S.div(S.mul(S.mul(S.p("bars"), S.h), p), 10000);
    return S.sel(S.or(S.lt(S.y, hh), S.ge(S.y, S.sub(S.h, hh))), S.p("bar"), S.tex(0, 0));
  },
};

SHADER_DEFS.cloudshadow = {
  label: "Cloud shadows", title: "the soft shadows of clouds drifting slowly across the ground, their edges dithered",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["clouds", "shadows", "overcast", "weather", "sky", "overworld", "drift", "ambient", "outdoor", "day"],
  params: {
    cover: { type: "int", min: 0, max: 100, def: 45, label: "Cloud cover (%)" },
    dark: { type: "int", min: 0, max: 100, def: 35, label: "Shadow darkness (%)" },
    tint: { type: "colour", def: "#18203a", label: "Shadow" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Clouds" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 871);
    // a noise that repeats every 64 px across, moved 64 px a loop (shaderEnchFlow with its axes swapped)
    const n = shaderEnchFlow(S, S.y, S.sub(S.x, S.div(S.mul(S.frame, 64), S.FRAMES)), 8, sd, 64);
    const thr = S.sub(255, S.div(S.mul(S.p("cover"), 255), 100));
    const inS = S.gt(n, thr), edge = S.and(S.not(inS), S.gt(n, S.sub(thr, 14)), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    return S.sel(S.and(S.gt(S.p("cover"), 0), S.or(inS, edge)), shaderPaintMix(S, c, S.p("tint"), S.p("dark")), c);
  },
};

SHADER_DEFS.aurora = {
  label: "Aurora", title: "curtains of the northern lights rippling across the top of the screen, bright at their upper edge",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["aurora", "northern lights", "borealis", "sky", "night", "arctic", "glow", "ambient", "magic", "polar"],
  params: {
    reach: { type: "int", min: 10, max: 80, def: 50, label: "Reaches down (% of the screen)" },
    glow: { type: "int", min: 0, max: 100, def: 60, label: "Brightness (%)" },
    colors: { type: "palette", def: ["#3affb0", "#38d0ff", "#b46aff"], max: 6, label: "Colors (top down)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("reach"), S.h), 100), 4), n = S.palCount("colors");
    // the curtain's top edge: two waves running along it (once and twice a loop)
    const s1 = shaderMotionSin(S, S.add(S.mul(S.x, 12), S.div(S.mul(S.frame, 360), S.FRAMES)));
    const s2 = shaderMotionSin(S, S.sub(S.mul(S.x, 29), S.div(S.mul(S.frame, 720), S.FRAMES)));
    const y0 = S.add(S.add(S.div(H, 5), S.div(S.mul(s1, H), 6000)), S.div(S.mul(s2, H), 12000));
    // each column's curtain hangs its own length, shimmering every four frames
    const L = S.add(S.div(H, 2), S.mod(S.hash(S.x, S.div(S.frame, 4), 881), S.add(S.div(H, 3), 1)));
    const into = S.sub(S.y, y0), lit = S.and(S.ge(into, 0), S.lt(into, L));
    const t = S.div(S.mul(S.sub(100, S.div(S.mul(into, 100), S.max(L, 1))), S.p("glow")), 100);
    const lv = S.sel(lit, shaderUiSteps(S, t), 0), col = S.palAt("colors", S.div(S.mul(into, n), S.max(L, 1)));
    return S.sel(S.gt(lv, 0), shaderPaintMix(S, c, col, S.mul(lv, 25)), c);
  },
};

SHADER_DEFS.clockwipe = {
  label: "Clock wipe", title: "the cover sweeps round like a clock hand from twelve (or as several hands at once, a fan)",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    hands: { type: "int", min: 1, max: 8, def: 1, label: "Hands" },
    turn: { type: "int", min: 0, max: 1, def: 0, label: "Turns", choices: ["clockwise", "counterclockwise"] },
  },
  fragment: function (S) {
    const K = shaderUiClock(S, S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100));
    const k = S.p("hands"), per = S.div(360, k), a0 = S.sel(S.eq(S.p("turn"), 0), K.a, S.sub(359, K.a));
    const a = S.mul(S.mod(a0, per), k);                                              // 0..359 within its hand's sweep
    return S.sel(S.lt(S.mul(a, 100), S.mul(S.progress(), 360)), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.slide = {
  label: "Slide away", title: "the whole screen slides off one side, easing into its run, the cover left behind it",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    dir: { type: "int", min: 0, max: 3, def: 0, label: "Slides", choices: ["off to the left", "off to the right", "up", "down"] },
    ease: { type: "int", min: 0, max: 1, def: 0, label: "Speed", choices: ["eases in", "steady"] },
  },
  fragment: function (S) {
    const p = S.progress(), D = S.p("dir"), t = S.sel(S.eq(S.p("ease"), 0), S.div(S.mul(p, p), 100), p);
    const across = S.lt(D, 2), span = S.sel(across, S.w, S.h), off = S.div(S.mul(t, span), 100);
    const sx = S.pick([[S.eq(D, 0), S.add(S.x, off)], [S.eq(D, 1), S.sub(S.x, off)]], S.x);
    const sy = S.pick([[S.eq(D, 2), S.add(S.y, off)], [S.eq(D, 3), S.sub(S.y, off)]], S.y);
    const inside = S.and(S.ge(sx, 0), S.lt(sx, S.w), S.ge(sy, 0), S.lt(sy, S.h));
    return S.sel(inside, S.texAt(sx, sy, "clamp"), S.p("cover"));
  },
};

SHADER_DEFS.glitchcut = {
  label: "Glitch cut", title: "the screen tears into jittering slices with their colors split, which drop out one by one to the cover",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    slice: { type: "int", min: 1, max: 8, def: 3, label: "Slice height (px)" },
    split: { type: "int", min: 0, max: 6, def: 2, label: "Color split (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Glitch" },
  },
  fragment: function (S) {
    const p = S.progress(), sd = S.add(S.mul(S.p("seed"), 4), 891), band = S.div(S.y, S.p("slice"));
    const gone = S.ge(p, S.add(5, S.mod(S.hash(band, 1, sd), 90)));
    // each slice jumps sideways every other frame, further as it goes on; the colors pull apart
    const J = S.div(S.mul(p, 8), 100), off = S.sub(S.mod(S.hash(band, S.div(S.frame, 2), S.add(sd, 1)), S.add(S.mul(J, 2), 1)), J);
    const sp = S.div(S.mul(S.p("split"), p), 100), x0 = S.add(S.x, off);
    const cr = S.texAt(S.add(x0, sp), S.y, "clamp"), cg = S.texAt(x0, S.y, "clamp"), cb = S.texAt(S.sub(x0, sp), S.y, "clamp");
    return S.sel(gone, S.p("cover"), S.rgba(S.r(cr), S.g(cg), S.b(cb), S.a(cg)));
  },
};

SHADER_DEFS.cooldown.variants = [{ progress: 30 }, { progress: 100, edge: "#7af0ff", shade: "#200810", dim: 85 }];
SHADER_DEFS.grayedout.variants = [{ style: 1 }, { style: 2, amount: 60 }];
SHADER_DEFS.rarity.variants = [{ tier: 5, seed: 7 }, { tier: 1 }, { tier: 3 }];
SHADER_DEFS.lootbeam.variants = [{ beam: "#b45aff", core: "#f4e0ff", width: 7, tall: 15 }, { beam: "#4ade5a", core: "#e8ffe0", width: 2, tall: 6 }];
SHADER_DEFS.marchingants.variants = [{ dash: 1 }, { one: "#ffd84a", two: "#3a2a10", dash: 4, reverse: 1 }];
SHADER_DEFS.pressed.variants = [{ how: 1 }, { depth: 2, dark: 60 }];
SHADER_DEFS.lowhealth.variants = [{ amount: 100 }, { amount: 30, beat: 1, tint: "#5a20c8" }];
SHADER_DEFS.speedlines.variants = [{ lines: 70, inner: 20 }, { cx: 20, cy: 70, lines: 20, inner: 60, ink: "#101010" }];
SHADER_DEFS.letterbox.variants = [{ bars: 20 }, { bars: 6, bar: "#101828" }];
SHADER_DEFS.cloudshadow.variants = [{ cover: 75, dark: 50 }, { cover: 25, dark: 20, tint: "#3a2010", seed: 4 }];
SHADER_DEFS.aurora.variants = [{ reach: 80, glow: 100 }, { reach: 30, colors: ["#ff6ab4", "#ffb43a"] }];
SHADER_DEFS.clockwipe.variants = [{ hands: 4 }, { hands: 2, turn: 1, cx: 0, cy: 0, cover: "#ffffff" }];
SHADER_DEFS.slide.variants = [{ dir: 1, ease: 1 }, { dir: 3, cover: "#1a1028" }];
SHADER_DEFS.glitchcut.variants = [{ slice: 1, split: 6 }, { slice: 8, split: 0, cover: "#ffffff", seed: 3 }];

// ---- Old machines, night skies and crafts ----
// ======================================================================================================================
// Eight more machines and displays (a ZX Spectrum's attribute clash, CGA, a C64, teletext, an LED board, an
// oscilloscope, e-ink, a thermal receipt); four things in the sky (ash falling, meteors, searchlights, a rainbow); three
// crafts (cut paper, toy bricks, knitting). The machine palettes are the commonly published ones, as plain data.
// Private helpers shaderOld*; the shaderUi*, shaderWx*, shaderPaint*, shaderMotion* and shaderLooks* helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("zxspectrum", "cga", "c64", "teletext", "ledboard", "oscilloscope", "eink", "receipt", "ashfall",
  "meteors", "searchlight", "rainbowarc", "papercut", "bricktoy", "knitted");

// the nearest of palette k to c, its RGB first pushed by a 4 x 4 Bayer offset of +-amt (0 none) in cells of `wide` x 1
// px (each cell read at its left pixel, the doubled pixels of a low-res mode); clear stays clear
function shaderOldMap(S, k, wide, amt) {
  const x0 = S.sub(S.x, S.mod(S.x, wide)), q = S.texAt(x0, S.y, "clamp"), c = S.sel(S.solid(q), q, S.tex(0, 0));
  const o = S.div(S.mul(S.sub(S.mul(shaderWxBayer(S, 1), 2), 15), amt), 15);
  const pushed = S.rgba(S.add(S.r(c), o), S.add(S.g(c), o), S.add(S.b(c), o), 255);
  return S.sel(S.solid(S.tex(0, 0)), S.nearest(pushed, k, "redmean"), S.tex(0, 0));
}
// a cell's center texel (cells of w x h px), clamped to the image
function shaderOldCell(S, w, h) {
  return S.texAt(S.add(S.mul(S.div(S.x, w), w), S.div(w, 2)), S.add(S.mul(S.div(S.y, h), h), S.div(h, 2)), "clamp");
}

SHADER_DEFS.zxspectrum = {
  label: "ZX Spectrum", title: "the ZX Spectrum's attribute clash: in each 8 x 8 cell only two of its fifteen colors, ink and paper",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["zx spectrum", "speccy", "attribute clash", "8-bit", "retro", "home computer", "1982", "british", "sinclair", "clash"],
  params: {
    cell: { type: "int", min: 2, max: 8, def: 8, label: "Attribute cell (px)" },
    colors: { type: "palette", def: ["#000000", "#0000d8", "#d80000", "#d800d8", "#00d800", "#00d8d8", "#d8d800", "#d8d8d8", "#0000ff", "#ff0000", "#ff00ff", "#00ff00", "#00ffff", "#ffff00", "#ffffff"], max: 16, label: "Colors" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("cell");
    // the cell's ink and paper: the nearest colors to its darkest and brightest of five probes
    const bx = S.mul(S.div(S.x, K), K), by = S.mul(S.div(S.y, K), K), e = S.sub(K, 1), m = S.div(K, 2);
    const probes = [[0, 0], [e, 0], [0, e], [e, e], [m, m]].map(function (q) { return S.texAt(S.add(bx, q[0]), S.add(by, q[1]), "clamp"); });
    let dark = probes[0], light = probes[0];
    for (const p of probes.slice(1)) {
      dark = S.sel(S.and(S.solid(p), S.or(S.not(S.solid(dark)), S.lt(S.luma(p), S.luma(dark)))), p, dark);
      light = S.sel(S.and(S.solid(p), S.or(S.not(S.solid(light)), S.gt(S.luma(p), S.luma(light)))), p, light);
    }
    // a cell with only clear probes falls back to the pixel itself
    dark = S.sel(S.solid(dark), dark, c); light = S.sel(S.solid(light), light, c);
    const ink = S.nearest(dark, "colors", "redmean"), paper = S.nearest(light, "colors", "redmean");
    const l = S.luma(c), toInk = S.le(S.abs(S.sub(l, S.luma(ink))), S.abs(S.sub(l, S.luma(paper))));
    return S.sel(S.solid(c), S.sel(toInk, ink, paper), c);
  },
};

SHADER_DEFS.cga = {
  label: "CGA", title: "an IBM PC's CGA card: four colors (cyan, magenta, white on black by default), dithered, its pixels doubled wide",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["cga", "ibm pc", "dos", "4-color", "cyan", "magenta", "retro", "1981", "pc", "ega"],
  params: {
    colors: { type: "palette", def: ["#000000", "#55ffff", "#ff55ff", "#ffffff"], max: 16, label: "Colors" },
    wide: { type: "int", min: 1, max: 2, def: 2, label: "Pixel width (px)" },
    dither: { type: "int", min: 0, max: 96, def: 40, label: "Dither" },
  },
  fragment: function (S) { return shaderOldMap(S, "colors", S.p("wide"), S.p("dither")); },
};

SHADER_DEFS.c64 = {
  label: "C64", title: "a Commodore 64: its sixteen colors, in multicolor mode's double-wide pixels, lightly dithered",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["c64", "commodore", "commodore 64", "8-bit", "retro", "home computer", "1982", "multicolor", "sid", "vic-ii"],
  params: {
    colors: { type: "palette", def: ["#000000", "#ffffff", "#813338", "#75cec8", "#8e3c97", "#56ac4d", "#2e2c9b", "#edf171", "#8e5029", "#553800", "#c46c71", "#4a4a4a", "#7b7b7b", "#a9ff9f", "#706deb", "#b2b2b2"], max: 16, label: "Colors" },
    wide: { type: "int", min: 1, max: 2, def: 2, label: "Pixel width (px)" },
    dither: { type: "int", min: 0, max: 96, def: 24, label: "Dither" },
  },
  fragment: function (S) { return shaderOldMap(S, "colors", S.p("wide"), S.p("dither")); },
};

SHADER_DEFS.teletext = {
  label: "Teletext", title: "a teletext page: chunky mosaic blocks in eight pure colors, optionally separated by black gaps",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["teletext", "ceefax", "videotex", "mosaic", "8-color", "tv", "retro", "1970s", "blocky", "broadcast"],
  params: {
    block: { type: "int", min: 1, max: 4, def: 2, label: "Block (px)" },
    separated: { type: "int", min: 0, max: 1, def: 0, label: "Graphics", choices: ["contiguous", "separated (black gaps)"] },
    colors: { type: "palette", def: ["#000000", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff"], max: 8, label: "Colors" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), B = S.p("block"), cc = shaderOldCell(S, B, S.add(B, S.div(B, 2)));
    const gap = S.and(S.eq(S.p("separated"), 1), S.gt(B, 1), S.or(S.eq(S.mod(S.x, B), S.sub(B, 1)), S.eq(S.mod(S.y, S.add(B, S.div(B, 2))), S.sub(S.add(B, S.div(B, 2)), 1))));
    const col = S.sel(S.solid(cc), S.nearest(cc, "colors"), S.palAt("colors", 0));
    return S.sel(S.solid(c), S.sel(gap, S.palAt("colors", 0), col), c);
  },
};

SHADER_DEFS.ledboard = {
  label: "LED board", title: "the picture on a board of round LEDs, each lit in a few steps of brightness, the unlit ones dim on black",
  group: "Eras and display", kind: "both", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["led", "led board", "dot matrix", "scoreboard", "sign", "display", "stadium", "ticker", "jumbotron", "lights"],
  params: {
    pitch: { type: "int", min: 2, max: 6, def: 3, label: "LED pitch (px)" },
    mode: { type: "int", min: 0, max: 1, def: 0, label: "LEDs", choices: ["one color", "full color"] },
    led: { type: "colour", def: "#ffb020", label: "LED color" },
    board: { type: "colour", def: "#0c0a08", label: "Board" },
    flicker: { type: "int", min: 0, max: 30, def: 8, label: "LEDs dipping each frame (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.p("pitch"), cc = shaderOldCell(S, P, P);
    // the LED's round face in its cell (a 1 px LED and gap at pitch 2)
    const fx = S.sub(S.mul(S.mod(S.x, P), 2), S.sub(P, 1)), fy = S.sub(S.mul(S.mod(S.y, P), 2), S.sub(P, 1));
    const face = S.sel(S.eq(P, 2), S.and(S.eq(S.mod(S.x, 2), 0), S.eq(S.mod(S.y, 2), 0)), S.le(S.add(S.mul(fx, fx), S.mul(fy, fy)), S.mul(S.sub(P, 1), S.sub(P, 1))));
    // four brightness steps; each frame some LEDs dip a step
    const dip = S.lt(S.mod(S.hash(S.div(S.x, P), S.div(S.y, P), S.frame), 100), S.p("flicker"));
    const step = S.max(S.sub(S.div(S.mul(S.luma(cc), 4), 256), S.sel(dip, 1, 0)), 0);
    const lit = S.sel(S.eq(S.p("mode"), 0), S.p("led"), cc);
    const on = shaderPaintMix(S, S.p("board"), lit, S.add(25, S.mul(S.min(step, 3), 25)));
    const out = S.sel(S.and(face, S.solid(cc)), on, S.p("board"));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.oscilloscope = {
  label: "Oscilloscope", title: "the picture traced as glowing vector lines on a phosphor screen, a refresh band rolling down it",
  group: "Eras and display", kind: "both", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["oscilloscope", "vector", "phosphor", "vectrex", "asteroids", "crt", "green", "lines", "retro", "scope"],
  params: {
    trace: { type: "colour", def: "#7affa0", label: "Trace" },
    screen: { type: "colour", def: "#031008", label: "Screen" },
    edge: { type: "int", min: 0, max: 255, def: 36, label: "Trace where brightness jumps by" },
    band: { type: "int", min: 0, max: 100, def: 35, label: "Refresh band (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), l = S.luma(c), E = S.p("edge");
    const lineAt = function (dx, dy) {
      const q = shaderLooksAt(S, dx, dy), a = shaderLooksAt(S, dx + 1, dy), b = shaderLooksAt(S, dx, dy + 1);
      return S.and(S.solid(q), S.or(S.not(S.solid(a)), S.not(S.solid(b)), S.not(S.solid(shaderLooksAt(S, dx - 1, dy))), S.not(S.solid(shaderLooksAt(S, dx, dy - 1))),
        S.gt(S.abs(S.sub(S.luma(a), S.luma(q))), E), S.gt(S.abs(S.sub(S.luma(b), S.luma(q))), E)));
    };
    const line = lineAt(0, 0), glow = S.or(lineAt(1, 0), lineAt(-1, 0), lineAt(0, 1), lineAt(0, -1));
    // the refresh band rolls down the screen once a loop
    const by = S.div(S.mul(S.frame, S.h), S.FRAMES), inBand = S.lt(S.mod(S.add(S.sub(S.y, by), S.h), S.h), S.max(S.div(S.h, 4), 1));
    const tr = S.sel(inBand, shaderPaintMix(S, S.p("trace"), S.rgba(255, 255, 255, 255), S.div(S.p("band"), 2)), S.p("trace"));
    const out = S.pick([[line, tr], [glow, shaderPaintMix(S, S.p("screen"), tr, 30)]], S.sel(inBand, shaderPaintMix(S, S.p("screen"), tr, S.div(S.p("band"), 10)), S.p("screen")));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.eink = {
  label: "E-ink", title: "an e-ink screen: a few grays of ink on pale paper, a faint ghost of the last page, flashing black to refresh once a loop",
  group: "Eras and display", kind: "both", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["e-ink", "eink", "e-paper", "kindle", "ereader", "grayscale", "paper", "display", "ghosting", "refresh"],
  params: {
    levels: { type: "int", min: 2, max: 16, def: 8, label: "Grays" },
    ink: { type: "colour", def: "#24221e", label: "Ink" },
    paper: { type: "colour", def: "#d6d2c4", label: "Paper" },
    ghost: { type: "int", min: 0, max: 30, def: 10, label: "Ghosting (%)" },
    refresh: { type: "int", min: 0, max: 1, def: 0, label: "Refresh", choices: ["flashes once a loop", "never"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), N = S.p("levels");
    const tone = function (q) { const k = S.div(S.mul(S.luma(q), N), 256); return S.div(S.mul(k, 100), S.max(S.sub(N, 1), 1)); };   // 0..100, light
    // the last page's ghost: the picture two px up and left, faintly
    const g = shaderLooksAt(S, 2, 2), gt = S.sel(S.solid(g), S.div(S.mul(S.sub(100, tone(g)), S.p("ghost")), 100), 0);
    const ink = S.min(S.add(S.sub(100, tone(c)), gt), 100);
    const page = shaderPaintMix(S, S.p("paper"), S.p("ink"), ink);
    const f = S.div(S.mul(S.frame, 16), S.FRAMES), on = S.eq(S.p("refresh"), 0);
    const inv = shaderPaintMix(S, S.p("ink"), S.p("paper"), ink);
    const out = S.pick([[S.and(on, S.eq(f, 0)), inv], [S.and(on, S.eq(f, 1)), S.p("ink")]], page);
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.receipt = {
  label: "Thermal receipt", title: "the picture printed on a till receipt: one faded ink, ordered dither, streaks where the print head skips",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["receipt", "thermal", "printer", "till", "1-bit", "fax", "dither", "paper", "shop", "faded"],
  params: {
    ink: { type: "colour", def: "#3a3640", label: "Ink" },
    paper: { type: "colour", def: "#f4f1ea", label: "Paper" },
    darkness: { type: "int", min: 0, max: 100, def: 50, label: "Darkness (%)" },
    streaks: { type: "int", min: 0, max: 60, def: 12, label: "Streaked rows (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Streaks" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 901);
    const streak = S.lt(S.mod(S.hash(S.y, 1, sd), 100), S.p("streaks"));
    const v = S.add(S.sub(255, S.luma(c)), S.sub(S.div(S.mul(S.p("darkness"), 128), 100), 64));
    const lv = S.sel(streak, S.div(v, 2), v);
    const inked = S.gt(S.div(lv, 16), shaderWxBayer(S, 1));
    return S.sel(S.solid(c), S.sel(inked, S.p("ink"), S.p("paper")), c);
  },
};

SHADER_DEFS.ashfall = {
  label: "Ashfall", title: "gray ash drifting down over the scene while red embers float up through it",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 10, pad: [0, 0, 0, 0],
  tags: ["ash", "ashfall", "embers", "volcano", "fire", "apocalypse", "smoke", "burning", "wasteland", "particles"],
  params: {
    ash: { type: "int", min: 0, max: 100, def: 45, label: "Ash (%)" },
    embers: { type: "int", min: 0, max: 100, def: 25, label: "Embers (%)" },
    ashcolor: { type: "colour", def: "#9a948e", label: "Ash" },
    ember: { type: "colour", def: "#ff6a1e", label: "Embers" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Drift" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 911);
    // one flake in some 6 px cells, falling 32 px a loop (the cells repeat every 32 down), swaying a pixel
    const sway = S.div(shaderMotionSin(S, S.add(S.mul(S.y, 20), S.div(S.mul(S.frame, 360), S.FRAMES))), 700);
    const flake = function (x, y, P, R, salt, pct) {
      const cx = S.div(x, P), cy = S.mod(S.div(y, P), R), h = S.hash(cx, cy, salt);
      return S.and(S.lt(S.mod(h, 100), pct), S.eq(S.mod(x, P), S.mod(S.div(h, 100), P)), S.eq(S.mod(y, P), S.mod(S.div(h, 700), P)));
    };
    const fall = S.div(S.mul(S.frame, 36), S.FRAMES), rise = S.div(S.mul(S.frame, 36), S.FRAMES);
    const ash = flake(S.add(S.x, sway), S.sub(S.add(S.y, 360), fall), 6, 6, sd, S.p("ash"));
    const em = flake(S.sub(S.x, sway), S.add(S.y, rise), 9, 4, S.add(sd, 1), S.p("embers"));
    const glow = S.lt(S.mod(S.add(S.hash(S.x, 3, sd), S.frame), 4), 2);
    return S.pick([[em, S.sel(glow, S.p("ember"), shaderPaintMix(S, S.p("ember"), S.rgba(255, 230, 140, 255), 50))], [ash, S.p("ashcolor")]], c);
  },
};

SHADER_DEFS.meteors = {
  label: "Meteor shower", title: "meteors streaking across the sky one after another, a white head and a fading tail",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["meteors", "shooting stars", "meteor shower", "night", "sky", "space", "stars", "wish", "ambient", "comet"],
  params: {
    count: { type: "int", min: 1, max: 4, def: 3, label: "Meteors a loop" },
    tail: { type: "int", min: 3, max: 16, def: 8, label: "Tail (px)" },
    sky: { type: "int", min: 10, max: 100, def: 55, label: "In the top (% of the screen)" },
    colors: { type: "palette", def: ["#ffffff", "#ffe8a0", "#ff9a5a"], max: 6, label: "Head to tail" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Paths" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), L = S.p("tail"), N = S.p("count"), sd = S.add(S.mul(S.p("seed"), 4), 921), n = S.palCount("colors");
    const span = S.max(S.div(S.mul(S.p("sky"), S.h), 100), 2), half = S.div(S.FRAMES, 2);
    let hit = S.i(-1);
    for (let m = 0; m < 4; m++) {
      // meteor m crosses during half a loop starting at its own frame; the head runs down and right, two across for one down
      // (the clock runs an eighth of a loop ahead, build 42, so frame 0 has a meteor in the sky, not one just off the edge)
      const st = S.div(S.mul(S.FRAMES, m), 4), t = S.mod(S.sub(S.add(S.add(S.frame, S.div(S.FRAMES, 8)), S.FRAMES), st), S.FRAMES);
      const live = S.and(S.lt(m, N), S.lt(t, half));
      const hx = S.sub(S.div(S.mul(t, S.add(S.w, S.mul(L, 2))), half), L), hy = S.add(S.mod(S.hash(m, 1, sd), span), S.div(hx, 2));
      const u = S.sub(hx, S.x), on = S.and(live, S.ge(u, 0), S.le(u, L), S.le(S.abs(S.sub(u, S.mul(S.sub(hy, S.y), 2))), 1));
      hit = S.sel(on, u, hit);
    }
    return S.sel(S.ge(hit, 0), S.palAt("colors", S.div(S.mul(hit, n), S.add(L, 1))), c);
  },
};

SHADER_DEFS.searchlight = {
  label: "Searchlights", title: "the scene in darkness, swept by searchlight beams from below, the lit cones edged in dither",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["searchlight", "spotlight", "beam", "night", "prison", "stealth", "premiere", "sweep", "dark", "lights"],
  params: {
    dark: { type: "int", min: 0, max: 100, def: 65, label: "Darkness (%)" },
    beams: { type: "int", min: 1, max: 2, def: 2, label: "Beams" },
    width: { type: "int", min: 4, max: 30, def: 12, label: "Beam width (degrees)" },
    swing: { type: "int", min: 10, max: 80, def: 40, label: "Swing (degrees either way)" },
    night: { type: "colour", def: "#0a0c1a", label: "Darkness" },
    tint: { type: "colour", def: "#fff6d0", label: "Light" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("width"), sw = S.p("swing");
    const beam = function (sx, phase) {
      // a cone from (sx, below the bottom) swinging either side of straight up
      const K = shaderUiClock(S, sx, S.add(S.h, 2)), s = shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), phase));
      const aim = S.div(S.mul(s, sw), 1000), off = S.abs(S.sub(K.a, S.mod(S.add(aim, 360), 360)));
      const d = S.min(off, S.sub(360, off));
      return S.sel(S.lt(d, S.div(W, 2)), 2, S.sel(S.lt(d, S.add(S.div(W, 2), 3)), 1, 0));
    };
    const b1 = beam(S.div(S.w, 3), 0), b2 = S.sel(S.eq(S.p("beams"), 2), beam(S.div(S.mul(S.w, 2), 3), 180), 0);
    const b = S.max(b1, b2), edgeLit = S.and(S.eq(b, 1), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    const darkC = shaderPaintMix(S, c, S.p("night"), S.p("dark")), litC = shaderPaintMix(S, c, S.p("tint"), 25);
    return S.pick([[S.eq(b, 2), litC], [edgeLit, shaderPaintMix(S, c, S.p("tint"), 10)]], darkC);
  },
};

SHADER_DEFS.rainbowarc = {
  label: "Rainbow", title: "a faint rainbow arcing over the scene after rain, its bands dithered into the sky",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 6, pad: [0, 0, 0, 0],
  tags: ["rainbow", "arc", "after rain", "sky", "weather", "spectrum", "hope", "pastoral", "ambient", "happy"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    radius: { type: "int", min: 20, max: 150, def: 80, label: "Radius (% of the height)" },
    band: { type: "int", min: 1, max: 4, def: 2, label: "Band width (px)" },
    show: { type: "int", min: 0, max: 100, def: 40, label: "Strength (%)" },
    colors: { type: "palette", def: ["#ff3a3a", "#ff9a2a", "#ffe84a", "#4ae05a", "#3a8cff", "#8a5aff"], max: 8, label: "Bands, outside in" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("colors"), B = S.p("band");
    const K = shaderUiClock(S, S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), S.add(S.h, S.div(S.h, 4)));
    const R = S.div(S.mul(S.mul(S.p("radius"), S.h), 2), 100), into = S.div(S.sub(R, K.d2), S.mul(B, 2));
    const inArc = S.and(S.ge(into, 0), S.lt(into, n));
    // a dither that shifts a pixel every four frames: the arc shimmers faintly
    const show = S.lt(S.div(S.mul(shaderWxBayer(S, 1, S.div(S.frame, 4), 0), 100), 16), S.p("show"));
    return S.sel(S.and(inArc, show), shaderPaintMix(S, c, S.palAt("colors", into), 60), c);
  },
};

SHADER_DEFS.papercut = {
  label: "Papercut", title: "the picture cut from a few layers of colored paper, each layer casting a small shadow on the one beneath",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["papercut", "paper", "layers", "craft", "cutout", "collage", "shadow box", "kirigami", "diorama", "card"],
  params: {
    papers: { type: "palette", def: ["#2a2048", "#5a3c80", "#b0508e", "#f09a7a", "#ffe2b0"], max: 8, label: "Papers (dark to light)" },
    shadow: { type: "int", min: 1, max: 3, def: 1, label: "Shadow (px)" },
    depth: { type: "int", min: 0, max: 100, def: 40, label: "Shadow darkness (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("papers"), D = S.p("shadow");
    const layer = function (q) { return S.sel(S.solid(q), S.add(S.div(S.mul(S.luma(q), n), 256), 1), 0); };     // 0 clear, 1..n
    const me = layer(c), up = layer(S.texAt(S.sub(S.x, D), S.sub(S.y, D), "clamp"));
    // a lighter layer up and to the left lies over this one: its shadow falls here
    const shade = S.gt(up, me), base = S.palAt("papers", S.sub(me, 1));
    return S.sel(S.solid(c), S.sel(shade, shaderPaintMix(S, base, S.rgba(0, 0, 0, 255), S.p("depth")), base), c);
  },
};

SHADER_DEFS.bricktoy = {
  label: "Toy bricks", title: "the picture built from plastic toy bricks: square plates of flat color, a stud on each, seams between",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["bricks", "toy", "plastic", "studs", "building blocks", "mosaic", "lego-like", "voxel", "kids", "construction"],
  params: {
    brick: { type: "int", min: 3, max: 10, def: 5, label: "Brick (px)" },
    shine: { type: "int", min: 0, max: 100, def: 45, label: "Stud shine (%)" },
    seam: { type: "int", min: 0, max: 100, def: 30, label: "Seam darkness (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.p("brick"), cc = shaderOldCell(S, P, P), col = S.sel(S.solid(cc), cc, c);
    const fx = S.mod(S.x, P), fy = S.mod(S.y, P), e = S.sub(P, 1);
    // the stud: a disc in the brick's middle, lit on its upper left, shaded lower right
    const X2 = S.sub(S.mul(fx, 2), e), Y2 = S.sub(S.mul(fy, 2), e), r2 = S.add(S.mul(X2, X2), S.mul(Y2, Y2)), R = S.div(S.mul(P, 2), 3);
    const stud = S.le(r2, S.mul(R, R)), rimLit = S.and(stud, S.gt(r2, S.mul(S.sub(R, 2), S.sub(R, 2))), S.lt(S.add(X2, Y2), 0));
    const rimDark = S.and(stud, S.gt(r2, S.mul(S.sub(R, 2), S.sub(R, 2))), S.gt(S.add(X2, Y2), 0));
    const seam = S.or(S.eq(fx, e), S.eq(fy, e));
    const out = S.pick([
      [seam, shaderPaintShade(S, col, S.sub(100, S.p("seam")), 0)],
      [rimLit, shaderPaintMix(S, col, S.rgba(255, 255, 255, 255), S.p("shine"))],
      [rimDark, shaderPaintShade(S, col, 80, 0)],
    ], col);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.knitted = {
  label: "Knitted", title: "the picture knitted in wool: a V-shaped stitch in each cell in its color, the yarn a little fuzzy",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["knitted", "knit", "wool", "yarn", "sweater", "stitch", "cozy", "craft", "winter", "jumper"],
  params: {
    light: { type: "int", min: 0, max: 60, def: 25, label: "Stitch light (%)" },
    dark: { type: "int", min: 0, max: 80, def: 35, label: "Between stitches (%)" },
    fuzz: { type: "int", min: 0, max: 50, def: 12, label: "Fuzz (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Yarn" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), cc = shaderOldCell(S, 4, 4), col = S.sel(S.solid(cc), cc, c);
    // a 4 x 4 stitch: the arms of a V light, the middle plain, the gaps between stitches dark (2 light, 1 plain, 0 dark)
    const V = [2, 1, 1, 2, 2, 2, 2, 2, 1, 2, 2, 1, 0, 1, 1, 0];
    const k = S.table(V, S.add(S.mul(S.mod(S.y, 4), 4), S.mod(S.x, 4)));
    const fz = S.lt(S.mod(S.hash(S.x, S.y, S.add(S.mul(S.p("seed"), 4), 931)), 100), S.p("fuzz"));
    const out = S.pick([
      [fz, shaderPaintShade(S, col, 100, 18)],
      [S.eq(k, 2), shaderPaintMix(S, col, S.rgba(255, 255, 255, 255), S.p("light"))],
      [S.eq(k, 0), shaderPaintShade(S, col, S.sub(100, S.p("dark")), 0)],
    ], col);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.zxspectrum.variants = [{ cell: 4 }, { cell: 2 }];
SHADER_DEFS.cga.variants = [{ colors: ["#000000", "#55ff55", "#ff5555", "#ffff55"] }, { wide: 1, dither: 0 }];
SHADER_DEFS.c64.variants = [{ wide: 1, dither: 0 }, { dither: 72 }];
SHADER_DEFS.teletext.variants = [{ separated: 1, block: 3 }, { block: 1 }];
SHADER_DEFS.ledboard.variants = [{ mode: 1, pitch: 2 }, { led: "#ff3a2a", pitch: 5, flicker: 20 }];
SHADER_DEFS.oscilloscope.variants = [{ trace: "#ffb84a", screen: "#120804", band: 80 }, { edge: 0, band: 0 }];
SHADER_DEFS.eink.variants = [{ levels: 2, ghost: 25 }, { levels: 16, ghost: 0, refresh: 1 }];
SHADER_DEFS.receipt.variants = [{ darkness: 90, streaks: 0 }, { ink: "#7a2a6a", darkness: 20, streaks: 40 }];
SHADER_DEFS.ashfall.variants = [{ ash: 90, embers: 0 }, { ash: 15, embers: 70, ember: "#7affe0", seed: 3 }];
SHADER_DEFS.meteors.variants = [{ count: 4, tail: 16 }, { count: 1, tail: 4, colors: ["#e0f0ff", "#7ab0ff"] }];
SHADER_DEFS.searchlight.variants = [{ beams: 1, width: 24, swing: 20 }, { dark: 90, width: 6, swing: 70, tint: "#c8e0ff" }];
SHADER_DEFS.rainbowarc.variants = [{ radius: 140, band: 4, show: 70 }, { across: 20, radius: 40, band: 1 }];
SHADER_DEFS.papercut.variants = [{ shadow: 2, depth: 70 }, { papers: ["#0a3a3a", "#1a7a6a", "#7ac8a0", "#f0f8e0"], depth: 20 }];
SHADER_DEFS.bricktoy.variants = [{ brick: 3 }, { brick: 8, shine: 90, seam: 60 }];
SHADER_DEFS.knitted.variants = [{ light: 50, dark: 70, fuzz: 0 }, { light: 10, dark: 15, fuzz: 40, seed: 5 }];

// ---- States, four more transitions, a HUD and three looks ----
// ======================================================================================================================
// Six sprite states (a force field, bound in chains, muddied, glitching, healing, leveling up); four transitions (a
// dithered diagonal wipe, tiles flipping over, ink blots spreading, a zoom punch); two screen overlays (a sci-fi HUD
// grid, light leaks); three looks (a chromatic split, woven cloth, sand art). Private helpers shaderSt*; the
// shaderEnch*, shaderWx*, shaderUi*, shaderOld*, shaderPaint*, shaderMotion* and shaderWorld* helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("forcefield", "chained", "muddy", "glitch", "healing", "levelup", "diagonalwipe", "tileflip", "inkblots",
  "zoompunch", "hudgrid", "lightleak", "chromatic", "woven", "sandart");

// a plus sign 1 px thick, `arm` px each way, centered at (cx, cy) in a cell's own coordinates (fx, fy)
function shaderStPlus(S, fx, fy, cx, cy, arm) {
  const dx = S.abs(S.sub(fx, cx)), dy = S.abs(S.sub(fy, cy));
  return S.or(S.and(S.eq(dy, 0), S.le(dx, arm)), S.and(S.eq(dx, 0), S.le(dy, arm)));
}

SHADER_DEFS.forcefield = {
  label: "Force field", title: "an energy shield over the sprite: a honeycomb shimmering up through it, a lit rim, a ripple where it takes a hit",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["force field", "shield", "barrier", "energy", "sci-fi", "protect", "bubble", "hex", "buff", "defense"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 65, label: "Amount (%)" },
    shield: { type: "colour", def: "#5ac8ff", label: "Shield" },
    hit: { type: "colour", def: "#ffffff", label: "Ripple" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Hits" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1001);
    // a honeycomb of 4 x 3 cells, every other row shifted half a cell
    const cy = S.div(S.y, 3), sx = S.add(S.x, S.mul(S.mod(cy, 2), 2));
    const seam = S.or(S.eq(S.mod(sx, 4), 0), S.eq(S.mod(S.y, 3), 0));
    const shimmer = S.lt(S.mod(S.add(S.y, S.div(S.mul(S.frame, 12), S.FRAMES)), 12), 3);
    // a hit: a ring from a hashed point, once each half loop
    const half = S.div(S.mul(S.frame, 2), S.FRAMES), t = S.sub(S.frame, S.div(S.mul(half, S.FRAMES), 2));
    const hx = S.mod(S.hash(half, 1, sd), S.max(S.w, 1)), hy = S.mod(S.hash(half, 2, sd), S.max(S.h, 1));
    const dx = S.sub(S.x, hx), dy = S.sub(S.y, hy), d = shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy)));
    const ring = S.and(S.gt(A, 0), S.eq(d, S.mul(t, 2)));
    const rim = S.and(S.gt(A, 0), shaderEnchRing1(S), S.lt(shaderWxBayer(S, 1), S.div(S.mul(A, 16), 100)));
    const body = shaderPaintMix(S, c, S.p("shield"), S.div(A, 4));
    return S.pick([
      [rim, S.p("shield")],
      [S.not(S.solid(c)), c],
      [ring, shaderPaintMix(S, c, S.p("hit"), S.div(S.mul(A, 8), 10))],
      [S.and(seam, S.gt(A, 0)), shaderPaintMix(S, c, S.p("shield"), S.sel(shimmer, S.div(S.mul(A, 9), 10), S.div(A, 2)))],
    ], body);
  },
};

SHADER_DEFS.chained = {
  label: "Chained", title: "the sprite bound in chains: links crossing it diagonally, dark and light in turn, a glint sliding along them",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["chained", "chains", "bound", "locked", "prisoner", "sealed", "cursed", "trapped", "restrained", "debuff"],
  params: {
    chains: { type: "int", min: 0, max: 2, def: 0, label: "Chains", choices: ["crossed (an X)", "one, falling right", "one, rising right"] },
    metal: { type: "colour", def: "#9aa0ac", label: "Metal" },
    shade: { type: "colour", def: "#3a3c46", label: "Shadow" },
    glint: { type: "colour", def: "#ffffff", label: "Glint" },
    offset: { type: "int", min: -16, max: 16, def: 0, label: "Shift (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), X = S.p("chains"), off = S.p("offset");
    // a chain along one diagonal: across it a is -1..1, along it b counts 4 px links
    const chain = function (u, v) {
      const a = S.sub(u, off), b = S.mod(v, 8), face = S.lt(b, 4), fb = S.mod(b, 4);
      const ring = S.and(face, S.le(S.abs(a), 1), S.or(S.ne(S.abs(a), 0), S.eq(fb, 0), S.eq(fb, 3)));
      const edge = S.and(S.not(face), S.eq(a, 0));
      return { on: S.or(ring, edge), dark: S.and(edge, S.eq(S.mod(fb, 2), 1)), v: v };
    };
    const mid = S.div(S.sub(S.w, S.h), 2);
    const c1 = chain(S.sub(S.sub(S.x, S.y), mid), S.add(S.x, S.y)), c2 = chain(S.sub(S.add(S.x, S.y), S.add(S.div(S.add(S.w, S.h), 2), -1)), S.sub(S.x, S.y));
    const use1 = S.ne(X, 2), use2 = S.ne(X, 1);
    const on1 = S.and(use1, c1.on), on2 = S.and(use2, c2.on);
    const g = function (v) { return S.lt(S.mod(S.sub(v, S.div(S.mul(S.frame, 32), S.FRAMES)), 32), 2); };
    const col = function (k) { return S.sel(g(k.v), S.p("glint"), S.sel(k.dark, S.p("shade"), S.p("metal"))); };
    return S.pick([[S.not(S.solid(c)), c], [on1, col(c1)], [on2, col(c2)]], c);
  },
};

SHADER_DEFS.muddy = {
  label: "Muddy", title: "the sprite caked in mud from the bottom up, splattered above, mud dripping off its underside",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 3, 0], strength: "amount",
  tags: ["mud", "muddy", "dirty", "swamp", "splatter", "filth", "messy", "farm", "boots", "debuff"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 45, label: "Amount (%)" },
    mud: { type: "colour", def: "#6a4a2c", label: "Mud" },
    wet: { type: "colour", def: "#3e2a18", label: "Wet mud" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Splatter" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1011);
    const nz = shaderPaintNoise(S, S.x, S.y, 3, sd), line = S.sub(S.h, S.div(S.mul(A, S.h), 100));
    const caked = S.and(S.gt(A, 0), S.solid(c), S.ge(S.add(S.y, S.div(S.sub(nz, 128), 24)), line));
    const splat = S.and(S.gt(A, 0), S.solid(c), S.lt(S.mod(S.hash(S.div(S.x, 2), S.div(S.y, 2), sd), 100), S.div(A, 6)));
    // drips under the sprite in some columns, a pixel or two, coming and going
    const h = S.hash(S.x, 6, S.add(sd, 1)), ph = S.mod(S.add(S.frame, S.div(h, 100)), 16), k = shaderEnchAbove(S, 3);
    const drip = S.and(S.gt(A, 0), S.not(S.solid(c)), S.lt(S.mod(h, 100), S.div(A, 2)), S.le(k, S.add(1, S.div(ph, 6))));
    const mudc = S.sel(S.lt(S.luma(c), 90), S.p("wet"), S.p("mud"));
    return S.pick([[drip, S.p("wet")], [caked, mudc], [splat, shaderPaintMix(S, c, S.p("mud"), 70)]], c);
  },
};

SHADER_DEFS.glitch = {
  label: "Glitch", title: "the sprite glitching on some frames: bands of it jumping sideways, its colors pulled apart, a block of noise",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [0, 3, 0, 3],
  tags: ["glitch", "corrupted", "error", "digital", "hacked", "broken", "cyber", "datamosh", "bug", "static"],
  params: {
    often: { type: "int", min: 0, max: 100, def: 35, label: "Frames that glitch (%)" },
    band: { type: "int", min: 1, max: 8, def: 3, label: "Band height (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Glitches" },
  },
  fragment: function (S) {
    const sd = S.add(S.mul(S.p("seed"), 4), 1021);
    // frame 0 always glitches, so a short loop is never left plain
    const bad = S.or(S.eq(S.frame, 0), S.lt(S.mod(S.hash(S.frame, 1, sd), 100), S.p("often")));
    const bi = S.div(S.y, S.p("band")), hb = S.hash(bi, S.frame, S.add(sd, 1));
    const shift = S.sel(S.and(bad, S.lt(S.mod(hb, 100), 40)), S.sub(S.mod(S.div(hb, 100), 5), 2), 0);
    const split = S.sel(bad, 1, 0), x0 = S.sub(S.x, shift);
    const cr = S.texAt(S.add(x0, split), S.y, "clear"), cg = S.texAt(x0, S.y, "clear"), cb = S.texAt(S.sub(x0, split), S.y, "clear");
    const any = S.or(S.solid(cr), S.solid(cg), S.solid(cb));
    const ch = function (q, f) { return S.sel(S.solid(q), f(q), 0); };
    const out = S.rgba(ch(cr, S.r), ch(cg, S.g), ch(cb, S.b), 255);
    // now and then a 3 x 2 block of noise where the sprite is
    const blk = S.and(bad, S.solid(cg), S.lt(S.mod(S.hash(S.div(S.x, 3), S.div(S.y, 2), S.add(S.frame, sd)), 100), 4));
    const nzc = S.mod(S.hash(S.x, S.y, S.add(S.frame, 7)), 256);
    return S.pick([[blk, S.rgba(nzc, S.sub(255, nzc), S.mod(S.mul(nzc, 3), 256), 255)], [any, out]], S.clear);
  },
};

SHADER_DEFS.healing = {
  label: "Healing", title: "a healing glow: green plus signs rising off the sprite, the sprite itself pulsing gently green",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [6, 0, 0, 0], strength: "amount",
  tags: ["healing", "heal", "regen", "health", "cure", "restore", "potion", "cleric", "plus", "buff"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 60, label: "Amount (%)" },
    plus: { type: "colour", def: "#6aff7a", label: "Plus signs" },
    glow: { type: "colour", def: "#d8ffd8", label: "Glow" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Pluses" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1031);
    // pluses in some 5 px cells rising 20 px a loop (the cells repeat every four up), drawn only near the sprite
    const yy = S.add(S.y, S.div(S.mul(S.frame, 20), S.FRAMES)), cx = S.div(S.x, 5), cy = S.mod(S.div(yy, 5), 4);
    const on = S.lt(S.mod(S.hash(cx, cy, sd), 100), S.div(A, 2));
    const p = S.and(S.gt(A, 0), on, shaderStPlus(S, S.mod(S.x, 5), S.mod(yy, 5), 2, 2, 1));
    const near = S.or(S.solid(c), S.le(shaderEnchBelow(S, 6), 6));
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const body = shaderPaintMix(S, c, S.p("glow"), S.div(S.mul(A, S.add(20, S.div(s, 50))), 100));
    return S.pick([[S.and(p, near), S.p("plus")], [S.solid(c), body]], c);
  },
};

SHADER_DEFS.levelup = {
  label: "Level up", title: "a level-up burst: bands of light sweeping up through the sprite, its edge flashing gold, sparkles rising round it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [2, 2, 2, 2],
  tags: ["level up", "levelup", "power up", "upgrade", "rank up", "celebrate", "xp", "rpg", "reward", "achievement"],
  params: {
    gold: { type: "colour", def: "#ffe066", label: "Gold" },
    glint: { type: "colour", def: "#ffffff", label: "Sparkles" },
    bands: { type: "int", min: 1, max: 4, def: 2, label: "Bands a loop" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Sparkles" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1041), f = S.div(S.mul(S.frame, 16), S.FRAMES);
    // the bands rise through the sprite, one spacing a loop
    const P = S.max(S.div(S.h, S.p("bands")), 2), up = S.mod(S.add(S.y, S.div(S.mul(S.frame, P), S.FRAMES)), P);
    const band = S.and(S.solid(c), S.lt(up, 2));
    // the edge flashes gold for the first quarter of the loop
    const flash = S.and(S.lt(f, 4), S.solid(c), shaderPaintRim(S));
    const near = S.or(shaderEnchRing1(S), shaderEnchRing2(S));
    const spark = S.and(near, S.lt(S.mod(S.hash(S.x, S.mod(S.add(S.y, S.frame), 16), sd), 100), 9));
    return S.pick([
      [spark, S.sel(S.lt(S.mod(S.add(S.x, S.frame), 3), 1), S.p("glint"), S.p("gold"))],
      [flash, S.p("gold")],
      [band, shaderPaintMix(S, c, S.p("glint"), 60)],
      [S.solid(c), shaderPaintMix(S, c, S.p("gold"), 15)],
    ], c);
  },
};

SHADER_DEFS.diagonalwipe = {
  label: "Diagonal wipe", title: "the cover wipes across the screen from a corner, its edge a soft band of dither",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    from: { type: "int", min: 0, max: 3, def: 0, label: "From", choices: ["the top left", "the top right", "the bottom left", "the bottom right"] },
    soft: { type: "int", min: 0, max: 100, def: 30, label: "Dithered edge (%)" },
    grid: { type: "int", min: 1, max: 4, def: 1, label: "Dither cell (px)" },
  },
  fragment: function (S) {
    const F = S.p("from"), xx = S.sel(S.eq(S.mod(F, 2), 0), S.x, S.sub(S.sub(S.w, 1), S.x)), yy = S.sel(S.lt(F, 2), S.y, S.sub(S.sub(S.h, 1), S.y));
    const v = S.div(S.mul(S.add(xx, yy), 1000), S.max(S.sub(S.add(S.w, S.h), 2), 1));         // 0..1000
    const sw = S.mul(S.p("soft"), 10), d = S.div(S.mul(shaderWxBayer(S, S.p("grid")), sw), 16);   // 0 .. sw (never sw)
    return S.sel(S.lt(S.mul(S.add(v, d), 100), S.mul(S.progress(), S.add(1001, sw))), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.tileflip = {
  label: "Tile flip", title: "the screen in tiles that flip over one after another, a wave across, each showing the cover on its back",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    tile: { type: "int", min: 4, max: 24, def: 8, label: "Tile (px)" },
    wave: { type: "int", min: 0, max: 2, def: 0, label: "Wave", choices: ["left to right", "diagonal", "random"] },
    spread: { type: "int", min: 0, max: 200, def: 100, label: "Spread (how far apart the tiles go)" },
    gap: { type: "colour", def: "#101010", label: "Behind the tiles" },
  },
  fragment: function (S) {
    const p = S.progress(), T = S.p("tile"), tx = S.div(S.x, T), ty = S.div(S.y, T), W = S.p("wave"), sp = S.p("spread");
    const nx = S.max(S.div(S.add(S.w, S.sub(T, 1)), T), 1), ny = S.max(S.div(S.add(S.h, S.sub(T, 1)), T), 1);
    const order = S.pick([[S.eq(W, 0), S.div(S.mul(tx, 100), nx)], [S.eq(W, 1), S.div(S.mul(S.add(tx, ty), 100), S.add(nx, ny))]], S.mod(S.hash(tx, ty, 1051), 100));
    const delay = S.div(S.mul(order, sp), 100);                                       // 0 .. spread
    const q = S.clamp(S.sub(S.div(S.mul(p, S.add(100, sp)), 100), delay), 0, 100);
    // the tile's own x from its middle in half px; the first half squeezes the picture, the second spreads the cover
    const fx2 = S.sub(S.add(S.mul(S.mod(S.x, T), 2), 1), T), scale = S.sub(100, S.mul(q, 2));
    const srcx = S.add(S.mul(tx, T), S.div(S.add(S.div(S.mul(fx2, 100), S.max(scale, 1)), T), 2));
    const front = S.and(S.lt(q, 50), S.lt(S.mul(S.abs(fx2), 100), S.mul(T, S.max(scale, 0))));
    const back = S.and(S.ge(q, 50), S.le(S.mul(S.abs(fx2), 100), S.mul(T, S.sub(S.mul(q, 2), 100))));
    return S.pick([[S.eq(q, 0), S.tex(0, 0)], [S.eq(q, 100), S.p("cover")], [back, S.p("cover")], [front, S.texAt(srcx, S.y, "clamp")]], S.p("gap"));
  },
};

SHADER_DEFS.inkblots = {
  label: "Ink blots", title: "blots of ink spreading from points over the screen, each starting in its own time, until they join and cover it",
  group: "Transitions", kind: "screen", transition: "covered", palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Ink" },
    rim: { type: "colour", def: "#2a2440", label: "Wet edge" },
    blot: { type: "int", min: 4, max: 24, def: 10, label: "Blot spacing (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Blots" },
  },
  fragment: function (S) {
    const p = S.progress(), P = S.p("blot"), v = shaderPaintCells(S, P, S.add(S.mul(S.p("seed"), 4), 1061));
    // a blot starts at 0..59 and reaches three spacings (past any pixel its seed is nearest) at 100
    const st = S.mod(S.hash(v.ax, v.ay, 1062), 60), r = S.div(S.mul(S.max(S.sub(p, st), 0), S.mul(P, 3)), S.max(S.sub(100, st), 1));
    const d = shaderPaintSqrt(S, v.d1), wob = S.div(S.sub(shaderPaintNoise(S, S.x, S.y, 3, 1063), 128), 100);
    const dd = S.add(d, wob);
    return S.pick([[S.and(S.gt(p, 0), S.lt(dd, r)), S.p("cover")], [S.and(S.gt(r, 0), S.lt(dd, S.add(r, 1))), S.p("rim")]], S.tex(0, 0));
  },
};

SHADER_DEFS.zoompunch = {
  label: "Zoom punch", title: "the screen punches in toward a point, faster and faster, then dithers out to the cover",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#ffffff", label: "Cover" },
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    zoom: { type: "int", min: 2, max: 8, def: 5, label: "Zoom at the end (x)" },
  },
  fragment: function (S) {
    const p = S.progress(), px = S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), py = S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100);
    // the zoom eases in: 100 + (zoom - 1) x 100 x (p / 100)^2, in hundredths
    const z = S.add(100, S.div(S.mul(S.mul(S.sub(S.p("zoom"), 1), 100), S.mul(p, p)), 10000));
    const sx = S.add(px, S.div(S.mul(S.sub(S.x, px), 100), z)), sy = S.add(py, S.div(S.mul(S.sub(S.y, py), 100), z));
    const t = S.div(S.mul(S.max(S.sub(p, 60), 0), 100), 40), out = S.lt(S.div(S.mul(shaderWxBayer(S, 1), 100), 16), t);
    return S.sel(out, S.p("cover"), S.texAt(sx, sy, "clamp"));
  },
};

SHADER_DEFS.hudgrid = {
  label: "HUD grid", title: "a sci-fi heads-up display over the screen: a faint grid, a scan line sweeping down, corner brackets, blinking ticks",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["hud", "sci-fi", "grid", "scanner", "targeting", "cockpit", "visor", "tech", "interface", "overlay"],
  params: {
    grid: { type: "int", min: 4, max: 16, def: 8, label: "Grid (px)" },
    tint: { type: "colour", def: "#38ffd0", label: "HUD" },
    faint: { type: "int", min: 0, max: 100, def: 25, label: "Grid strength (%)" },
    corner: { type: "int", min: 0, max: 12, def: 5, label: "Corner brackets (px, 0 none)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), G = S.p("grid"), tint = S.p("tint"), K = S.p("corner");
    const line = S.or(S.eq(S.mod(S.x, G), 0), S.eq(S.mod(S.y, G), 0));
    const scan = S.eq(S.y, S.div(S.mul(S.frame, S.h), S.FRAMES)), trail = S.lt(S.mod(S.sub(S.div(S.mul(S.frame, S.h), S.FRAMES), S.y), S.h), 4);
    // brackets in the four corners, two px in
    const ex = S.min(S.sub(S.x, 2), S.sub(S.sub(S.w, 3), S.x)), ey = S.min(S.sub(S.y, 2), S.sub(S.sub(S.h, 3), S.y));
    const br = S.and(S.gt(K, 0), S.ge(ex, 0), S.ge(ey, 0), S.or(S.and(S.eq(ex, 0), S.lt(ey, K)), S.and(S.eq(ey, 0), S.lt(ex, K))));
    // ticks at some grid crossings, blinking
    const tick = S.and(S.eq(S.mod(S.x, G), 0), S.eq(S.mod(S.y, G), 0), S.lt(S.mod(S.add(S.hash(S.div(S.x, G), S.div(S.y, G), 1071), S.frame), 8), 3));
    return S.pick([
      [S.or(br, scan, tick), tint],
      [trail, shaderPaintMix(S, c, tint, 20)],
      [line, shaderPaintMix(S, c, tint, S.p("faint"))],
    ], c);
  },
};

SHADER_DEFS.lightleak = {
  label: "Light leaks", title: "warm light leaking in at the screen's edges like an old camera, drifting and swelling, in dithered steps",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["light leak", "film", "analog", "camera", "warm", "lomo", "vintage", "glow", "dreamy", "photo"],
  params: {
    leak: { type: "colour", def: "#ff8a3a", label: "Leak" },
    hot: { type: "colour", def: "#ffd8a0", label: "Hottest" },
    intensity: { type: "int", min: 0, max: 100, def: 55, label: "Strength (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Leaks" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1081);
    // a noise drifting 64 px across a loop, stronger toward the left and right edges
    const n = shaderEnchFlow(S, S.y, S.add(S.x, S.div(S.mul(S.frame, 64), S.FRAMES)), 16, sd, 64);
    const edge = S.max(S.sub(100, S.div(S.mul(S.min(S.x, S.sub(S.sub(S.w, 1), S.x)), 300), S.max(S.w, 1))), 0);   // 100 at the edge, 0 a third in
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const t = S.clamp(S.div(S.mul(S.mul(S.sub(n, 90), edge), S.add(S.p("intensity"), S.div(s, 40))), 16500), 0, 100);
    const lv = shaderUiSteps(S, t);
    // the hottest color where it is strongest, and where it is strong right at the rim (build 42: lv 3 alone was out of reach
    // at the defaults, so "Hottest" never showed)
    const hot = S.or(S.eq(lv, 3), S.and(S.ge(lv, 2), S.ge(edge, 90)));
    return S.pick([[hot, shaderPaintMix(S, c, S.p("hot"), 70)], [S.gt(lv, 0), shaderPaintMix(S, c, S.p("leak"), S.mul(lv, 25))]], c);
  },
};

SHADER_DEFS.chromatic = {
  label: "Chromatic split", title: "red and blue pulled apart from the green, more toward the edges (a lens) or the same everywhere",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["chromatic aberration", "rgb split", "lens", "fringe", "glitch", "retro", "vhs", "camera", "3d", "anaglyph"],
  params: {
    amount: { type: "int", min: 1, max: 4, def: 2, label: "Split (px)" },
    mode: { type: "int", min: 0, max: 1, def: 0, label: "Split", choices: ["out from the middle (a lens)", "sideways everywhere"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), K = shaderUiClock(S);
    // the lens's push: the split grows with distance, A px at the image's edge
    const Rm = S.max(S.max(S.w, S.h), 1), dx = S.div(S.mul(K.X2, A), Rm), dy = S.div(S.mul(K.Y2, A), Rm);
    const lens = S.eq(S.p("mode"), 0), ox = S.sel(lens, dx, A), oy = S.sel(lens, dy, 0);
    const cr = S.texAt(S.sub(S.x, ox), S.sub(S.y, oy), "clamp"), cb = S.texAt(S.add(S.x, ox), S.add(S.y, oy), "clamp");
    const ch = function (q, f) { return S.sel(S.solid(q), f(q), f(c)); };
    return S.sel(S.solid(c), S.rgba(ch(cr, S.r), S.g(c), ch(cb, S.b), 255), c);
  },
};

SHADER_DEFS.woven = {
  label: "Woven", title: "the picture woven in cloth: threads over and under in a plain weave, each thread rounded with light",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["woven", "weave", "fabric", "cloth", "textile", "basket", "tapestry", "thread", "linen", "craft"],
  params: {
    thread: { type: "int", min: 2, max: 5, def: 3, label: "Thread width (px)" },
    bulge: { type: "int", min: 0, max: 60, def: 30, label: "Roundness (%)" },
    weave: { type: "int", min: 0, max: 1, def: 0, label: "Weave", choices: ["plain (over one, under one)", "twill (diagonal)"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), T = S.p("thread"), cc = shaderOldCell(S, T, T), col = S.sel(S.solid(cc), cc, c);
    const cx = S.div(S.x, T), cy = S.div(S.y, T), fx = S.mod(S.x, T), fy = S.mod(S.y, T);
    // which thread is on top here: plain alternates like a checkerboard, twill steps one along each row
    const across = S.sel(S.eq(S.p("weave"), 0), S.eq(S.mod(S.add(cx, cy), 2), 0), S.lt(S.mod(S.add(cx, cy), 4), 2));
    const f = S.sel(across, fy, fx), e = S.sub(T, 1), R = S.p("bulge");
    const shade = S.pick([[S.eq(f, 0), S.sub(100, R)], [S.eq(f, e), S.sub(100, S.div(R, 2))]], S.add(100, S.div(R, 3)));
    const out = shaderPaintShade(S, col, shade, 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.sandart = {
  label: "Sand art", title: "the picture poured in layers of colored sand: wavy strata by brightness, each grain its own shade",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["sand art", "sand", "layers", "strata", "bottle", "desert", "craft", "grains", "souvenir", "earth"],
  params: {
    sands: { type: "palette", def: ["#3a2a4a", "#6a3a5a", "#b85a3a", "#e09a5a", "#f2d8a0"], max: 8, label: "Sands (dark to light)" },
    wave: { type: "int", min: 0, max: 40, def: 16, label: "Waviness" },
    grain: { type: "int", min: 0, max: 40, def: 14, label: "Grain (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Pour" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("sands"), sd = S.add(S.mul(S.p("seed"), 4), 1091);
    // the strata: brightness bent by a slow wave across, cut into the palette's bands
    const bend = S.div(S.mul(shaderMotionSin(S, S.add(S.mul(S.x, 23), S.mod(sd, 360))), S.p("wave")), 1000);
    const l = S.clamp(S.add(S.luma(c), bend), 0, 255), base = S.palAt("sands", S.div(S.mul(l, n), 256));
    const g = S.sub(S.mod(S.hash(S.x, S.y, sd), S.add(S.mul(S.p("grain"), 2), 1)), S.p("grain"));
    const out = shaderPaintShade(S, base, S.add(100, g), 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.forcefield.variants = [{ amount: 100, shield: "#ff6ab4" }, { amount: 30, seed: 4 }];
SHADER_DEFS.chained.variants = [{ chains: 1, offset: 4 }, { chains: 2, metal: "#c8a050", shade: "#5a3a10" }];
SHADER_DEFS.muddy.variants = [{ amount: 100 }, { amount: 20, mud: "#8a8a5a", wet: "#4a4a2a", seed: 3 }];
SHADER_DEFS.glitch.variants = [{ often: 100, band: 1 }, { often: 15, band: 8, seed: 5 }];
SHADER_DEFS.healing.variants = [{ amount: 100 }, { amount: 30, plus: "#ff6a8a", glow: "#ffe0e8" }];
SHADER_DEFS.levelup.variants = [{ bands: 4 }, { bands: 1, gold: "#7ae0ff", glint: "#e8fbff" }];
SHADER_DEFS.diagonalwipe.variants = [{ from: 3, soft: 100, grid: 2 }, { from: 1, soft: 0, cover: "#ffffff" }];
SHADER_DEFS.tileflip.variants = [{ wave: 1, tile: 4 }, { wave: 2, tile: 16, spread: 200, cover: "#1a1a3a" }];
SHADER_DEFS.inkblots.variants = [{ blot: 4 }, { blot: 24, cover: "#5a0a1a", rim: "#a83a4a", seed: 6 }];
SHADER_DEFS.zoompunch.variants = [{ zoom: 8, cover: "#000000" }, { cx: 20, cy: 30, zoom: 2 }];
SHADER_DEFS.hudgrid.variants = [{ grid: 4, faint: 50 }, { grid: 16, tint: "#ff5a3a", corner: 0 }];
SHADER_DEFS.lightleak.variants = [{ intensity: 100 }, { leak: "#ff3a8a", hot: "#ffd0e8", intensity: 35, seed: 4 }];
SHADER_DEFS.chromatic.variants = [{ amount: 4 }, { amount: 1, mode: 1 }];
SHADER_DEFS.woven.variants = [{ thread: 2, weave: 1 }, { thread: 5, bulge: 60 }];
SHADER_DEFS.sandart.variants = [{ wave: 40, grain: 30 }, { sands: ["#1a3a4a", "#3a7a8a", "#8ac8c0", "#f0f0d8"], wave: 0, grain: 5 }];

// ---- Hits and treats, night-sky shows, three more transitions ----
// ======================================================================================================================
// Six for a sprite (an impact burst, paintball splats, candy stripes, sprinkles on frosting, shivering, an oil-slick
// sheen); five for the screen (code rain, a hyperspace warp, fireworks, raindrops rippling, TV static); three
// transitions (a wavy wipe, a camera aperture, rolling up like a scroll); and embroidery. Private helpers shaderFw*;
// earlier helpers (shaderEnch*, shaderWx*, shaderUi*, shaderOld*, shaderPaint*, shaderMotion*) are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("impact", "paintball", "candystripe", "sprinkles", "shivering", "iridescent", "coderain", "warp", "fireworks",
  "raindrops", "tvstatic", "wavewipe", "aperture", "rollup", "embroidery");

// the pixel lies within about half a pixel of the ray from the origin at `deg` degrees (0 along +x, y down), d px out
function shaderFwOnRay(S, ang, deg, d) {
  const off = S.abs(S.sub(ang, S.mod(deg, 360))), near = S.min(off, S.sub(360, off));
  return S.lt(S.mul(near, S.max(d, 1)), 40);
}
// the pixel is (px, py), give or take nothing
function shaderFwAt(S, px, py) { return S.and(S.eq(S.x, px), S.eq(S.y, py)); }

SHADER_DEFS.impact = {
  label: "Impact", title: "a hit landing on the sprite: a white flash at the point, spark lines bursting out of it, then calm",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 16, pad: [2, 2, 2, 2],
  tags: ["impact", "hit", "punch", "strike", "spark", "damage", "combat", "smack", "burst", "fx"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Hit across (%)" },
    down: { type: "int", min: 0, max: 100, def: 45, label: "Hit down (%)" },
    rays: { type: "int", min: 4, max: 12, def: 8, label: "Spark lines" },
    spark: { type: "colour", def: "#fff2a0", label: "Sparks" },
    flash: { type: "colour", def: "#ffffff", label: "Flash" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 16), S.FRAMES), N = S.p("rays");
    const P = shaderWxPolar(S, S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("down"), S.sub(S.h, 1)), 100));
    // the burst runs for the first half of the loop: rays sweep outward, their inner end chasing their outer one
    const live = S.lt(t, 8), rin = S.mul(t, 2), rout = S.add(S.mul(t, 3), 2), step = S.div(360, N);
    const rot = S.mod(S.mul(S.p("rays"), 7), step), a = S.mod(S.add(S.sub(P.ang, rot), 360), 360);
    const k = S.div(S.add(a, S.div(step, 2)), step), ray = shaderFwOnRay(S, a, S.mul(k, step), P.d);
    const near = S.or(S.solid(c), shaderEnchRing1(S), shaderEnchRing2(S));
    const line = S.and(live, near, ray, S.ge(P.d, rin), S.le(P.d, rout));
    const fl = S.and(S.lt(t, 3), S.solid(c), S.le(P.d, S.sub(5, t)));
    return S.pick([[fl, S.p("flash")], [line, S.sel(S.lt(t, 4), S.p("flash"), S.p("spark"))]], c);
  },
};

SHADER_DEFS.paintball = {
  label: "Paintball", title: "the sprite splattered with bright paint: round splats in a few colors, each with a short run dripping from it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["paintball", "paint", "splat", "splatter", "colorful", "messy", "graffiti", "party", "fun", "hit"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 45, label: "Amount (%)" },
    paints: { type: "palette", def: ["#ff3a6a", "#3ae0ff", "#ffd83a", "#7aff5a", "#b45aff"], max: 8, label: "Paints" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Splats" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1101), n = S.palCount("paints");
    // a splat in some 6 px cells: a disc of radius 1-2 at a hashed middle, a run below it to the cell's foot
    const cx = S.div(S.x, 6), cy = S.div(S.y, 6), h = S.hash(cx, cy, sd), on = S.lt(S.mod(h, 100), A);
    const mx = S.add(2, S.mod(S.div(h, 100), 2)), my = S.add(2, S.mod(S.div(h, 200), 2)), r = S.add(1, S.mod(S.div(h, 400), 2));
    const fx = S.sub(S.mod(S.x, 6), mx), fy = S.sub(S.mod(S.y, 6), my);
    const disc = S.le(S.add(S.mul(fx, fx), S.mul(fy, fy)), S.add(S.mul(r, r), 1));
    const run = S.and(S.eq(fx, S.sub(S.mod(S.div(h, 800), 3), 1)), S.gt(fy, 0), S.lt(S.mod(S.div(h, 2400), 100), 60));
    const col = S.palAt("paints", S.mod(S.div(h, 7), n));
    const lit = S.and(S.eq(fx, S.neg(1)), S.eq(fy, S.neg(1)));
    return S.pick([
      [S.not(S.and(S.gt(A, 0), S.solid(c), on, S.or(disc, run))), c],
      [S.and(disc, lit), shaderPaintMix(S, col, S.rgba(255, 255, 255, 255), 50)],
    ], col);
  },
};

SHADER_DEFS.candystripe = {
  label: "Candy stripes", title: "the sprite in candy-cane stripes of two colors, shaded by its own light and dark, the stripes sliding along",
  group: "Looks", kind: "both", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["candy", "candy cane", "stripes", "christmas", "peppermint", "sweet", "barber", "festive", "pattern", "holiday"],
  params: {
    one: { type: "colour", def: "#ff2a4a", label: "Stripe" },
    two: { type: "colour", def: "#fff4f0", label: "Between" },
    stripe: { type: "int", min: 1, max: 6, def: 2, label: "Stripe width (px)" },
    slide: { type: "int", min: 0, max: 1, def: 0, label: "Stripes", choices: ["slide along", "stay still"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("stripe"), P = S.mul(W, 2);
    const mv = S.sel(S.eq(S.p("slide"), 0), S.div(S.mul(S.frame, P), S.FRAMES), 0);
    const base = S.sel(S.lt(S.mod(S.add(S.sub(S.x, S.y), S.add(mv, 512)), P), W), S.p("one"), S.p("two"));
    const out = shaderPaintShade(S, base, S.add(55, S.div(S.mul(S.luma(c), 60), 255)), 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.sprinkles = {
  label: "Sprinkles", title: "frosting poured over the sprite's top edges and dribbling down, scattered with colored sprinkles",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["sprinkles", "frosting", "icing", "donut", "cake", "dessert", "sweet", "bakery", "party", "candy"],
  params: {
    frosting: { type: "colour", def: "#ffcce6", label: "Frosting" },
    sprinkle: { type: "palette", def: ["#ff3a6a", "#3ac8ff", "#ffe03a", "#7aff7a", "#ffffff"], max: 8, label: "Sprinkles" },
    thick: { type: "int", min: 1, max: 6, def: 3, label: "Frosting depth (px)" },
    dribble: { type: "int", min: 0, max: 100, def: 40, label: "Dribbles (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Sprinkles" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1111), n = S.palCount("sprinkle");
    // depth under the top surface; some columns dribble twice as deep
    const hc = S.hash(S.x, 2, sd), deep = S.add(S.p("thick"), S.sel(S.lt(S.mod(hc, 100), S.p("dribble")), S.add(1, S.mod(S.div(hc, 100), 3)), 0));
    const k = shaderWxOpenAbove(S, 9), iced = S.and(S.solid(c), S.le(k, deep));
    // a sprinkle in some 3 px cells: two pixels, across or down, in one color
    const h = S.hash(S.div(S.x, 3), S.div(S.y, 3), S.add(sd, 1)), fx = S.mod(S.x, 3), fy = S.mod(S.y, 3), across = S.eq(S.mod(S.div(h, 100), 2), 0);
    const bit = S.and(S.lt(S.mod(h, 100), 45), S.or(S.and(S.eq(fx, 1), S.eq(fy, 1)), S.and(across, S.eq(fx, 2), S.eq(fy, 1)), S.and(S.not(across), S.eq(fx, 1), S.eq(fy, 2))));
    const edge = S.and(iced, S.eq(k, deep));
    return S.pick([
      [S.not(iced), c],
      [S.and(bit, S.not(edge)), S.palAt("sprinkle", S.mod(S.div(h, 7), n))],
      [edge, shaderPaintShade(S, S.p("frosting"), 85, 0)],
    ], S.p("frosting"));
  },
};

SHADER_DEFS.shivering = {
  label: "Shivering", title: "the sprite shivering with cold: jittering a pixel side to side, its colors chilled blue",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 8, fps: 16, pad: [0, 1, 0, 1], strength: "amount",
  tags: ["shiver", "shivering", "cold", "freezing", "chilly", "scared", "nervous", "tremble", "winter", "debuff"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 60, label: "Amount (%)" },
    chill: { type: "colour", def: "#9ad0ff", label: "Chill" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Shivers" },
  },
  fragment: function (S) {
    const A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1121);
    // on some frames (more with the amount; frame 1 always, when there is any) the sprite steps a pixel left or right
    const jump = S.and(S.gt(A, 0), S.or(S.eq(S.frame, 1), S.lt(S.mod(S.hash(S.frame, 1, sd), 100), A)));
    const dx = S.sel(jump, S.sel(S.eq(S.mod(S.frame, 2), 0), -1, 1), 0), q = S.texAt(S.sub(S.x, dx), S.y, "clear");
    const out = shaderPaintMix(S, q, S.p("chill"), S.div(A, 3));
    return S.sel(S.solid(q), S.sel(S.gt(A, 0), out, q), S.clear);
  },
};

SHADER_DEFS.iridescent = {
  label: "Iridescent", title: "an oil-slick sheen over the sprite: bands of shifting color following its light and dark, flowing slowly",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["iridescent", "oil slick", "pearlescent", "holographic", "sheen", "beetle", "opal", "shiny", "soap bubble", "rare"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 45, label: "Amount (%)" },
    sheen: { type: "palette", def: ["#ff5ac8", "#7a5aff", "#3ad0ff", "#5affa0", "#ffe85a"], max: 8, label: "Sheen colors" },
    flow: { type: "int", min: 0, max: 1, def: 0, label: "Sheen", choices: ["flows", "stays still"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), n = S.palCount("sheen"), run = S.mul(n, 16);
    const mv = S.sel(S.eq(S.p("flow"), 0), S.div(S.mul(S.frame, run), S.FRAMES), 0);
    const ph = S.mod(S.add(S.add(S.div(S.luma(c), 3), S.mul(S.add(S.x, S.y), 2)), mv), run);
    const i = S.div(ph, 16), next = S.mod(S.add(i, 1), n), f = S.mod(ph, 16);
    const col = S.sel(S.gt(f, shaderWxBayer(S, 1)), S.palAt("sheen", next), S.palAt("sheen", i));
    return S.sel(S.and(S.solid(c), S.gt(A, 0)), shaderPaintMix(S, c, col, A), c);
  },
};

SHADER_DEFS.coderain = {
  label: "Code rain", title: "columns of glowing glyphs raining down over a darkened screen, bright at their heads",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["code rain", "matrix", "digital", "hacker", "cyber", "terminal", "data", "glyphs", "sci-fi", "screen"],
  params: {
    density: { type: "int", min: 0, max: 100, def: 45, label: "Columns (%)" },
    trail: { type: "int", min: 2, max: 14, def: 7, label: "Trail (glyphs)" },
    dark: { type: "int", min: 0, max: 100, def: 55, label: "Darken the screen (%)" },
    glyph: { type: "colour", def: "#3aff6a", label: "Glyphs" },
    head: { type: "colour", def: "#e8ffe8", label: "Heads" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), gx = S.div(S.x, 3), gy = S.div(S.y, 4), h = S.hash(gx, 7, 1131);
    const on = S.lt(S.mod(h, 100), S.p("density"));
    // a head falls a glyph a frame, sixteen a loop; the glyph cells behind it are lit, fading
    const hd = S.mod(S.add(S.div(S.mul(S.frame, 16), S.FRAMES), S.div(h, 100)), 16), d = S.mod(S.sub(hd, gy), 16);
    const lit = S.and(on, S.lt(d, S.p("trail"))), px = S.and(S.lt(S.mod(S.x, 3), 2), S.lt(S.mod(S.y, 4), 3));
    const bitOn = S.eq(S.mod(S.hash(S.x, S.y, S.add(gy, S.div(S.frame, 4))), 3), 0);
    const bg = shaderPaintMix(S, c, S.rgba(0, 8, 2, 255), S.p("dark"));
    const fade = S.sub(90, S.div(S.mul(d, 70), S.max(S.p("trail"), 1)));
    return S.pick([
      [S.and(lit, px, S.not(bitOn), S.eq(d, 0)), S.p("head")],
      [S.and(lit, px, S.not(bitOn)), shaderPaintMix(S, bg, S.p("glyph"), fade)],
    ], bg);
  },
};

SHADER_DEFS.warp = {
  label: "Warp speed", title: "stars streaking out from the middle of the screen at hyperspace speed, longer as they fly out",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["warp", "hyperspace", "lightspeed", "stars", "space", "jump", "sci-fi", "travel", "zoom", "starship"],
  params: {
    stars: { type: "int", min: 0, max: 100, def: 40, label: "Stars (%)" },
    dark: { type: "int", min: 0, max: 100, def: 60, label: "Darken the screen (%)" },
    tip: { type: "colour", def: "#ffffff", label: "Star" },
    tail: { type: "colour", def: "#5a8aff", label: "Streak" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), d = S.div(K.d2, 2);
    const Rm = S.add(S.div(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 2), 1);
    // a star in some 3 degree spokes, flying out a whole radius a loop from its own start
    const spoke = S.div(K.a, 3), h = S.hash(spoke, 3, 1141), on = S.lt(S.mod(h, 100), S.p("stars"));
    const r = S.mod(S.add(S.mod(S.div(h, 100), Rm), S.div(S.mul(S.frame, Rm), S.FRAMES)), Rm), L = S.add(S.div(r, 4), 1);
    const ray = S.lt(S.mul(S.abs(S.sub(S.mod(K.a, 3), 1)), S.max(d, 1)), 40);
    const streak = S.and(on, ray, S.le(d, r), S.ge(d, S.sub(r, L)));
    const bg = shaderPaintMix(S, c, S.rgba(2, 2, 12, 255), S.p("dark"));
    return S.pick([[S.and(streak, S.ge(d, S.sub(r, 1))), S.p("tip")], [streak, shaderPaintMix(S, bg, S.p("tail"), 70)]], bg);
  },
};

SHADER_DEFS.fireworks = {
  label: "Fireworks", title: "fireworks bursting in the sky one after another, rings of sparks spreading and sagging as they fade",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["fireworks", "celebration", "new year", "festival", "party", "night", "sparks", "burst", "holiday", "victory"],
  params: {
    bursts: { type: "int", min: 1, max: 3, def: 3, label: "Bursts a loop" },
    size: { type: "int", min: 4, max: 16, def: 9, label: "Burst size (px)" },
    colors: { type: "palette", def: ["#ff4a6a", "#ffd84a", "#4ae0ff", "#b46aff", "#7aff6a"], max: 8, label: "Colors" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Shows" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1151), n = S.palCount("colors"), R = S.p("size");
    let hit = c;
    for (let m = 0; m < 3; m++) {
      // burst m starts a third of the loop after the one before and lasts 12 frames of 32
      const st = S.div(S.mul(S.FRAMES, m), 3), t = S.mod(S.sub(S.add(S.frame, S.FRAMES), st), S.FRAMES);
      const t12 = S.div(S.mul(t, 32), S.FRAMES), live = S.and(S.lt(m, S.p("bursts")), S.lt(t12, 12));
      const hb = S.hash(m, 5, sd), cx = S.add(S.div(S.w, 10), S.mod(hb, S.max(S.div(S.mul(S.w, 8), 10), 1))), cy = S.add(2, S.mod(S.div(hb, 100), S.max(S.div(S.h, 2), 1)));
      const r = S.div(S.mul(t12, R), 11), sag = S.div(S.mul(t12, t12), 24);
      const col = S.palAt("colors", S.mod(S.div(hb, 37), n)), dim = S.gt(t12, 7);
      let on = S.lt(1, 0);
      for (let k = 0; k < 12; k++) {
        const px = S.add(cx, S.div(S.mul(r, shaderMotionCos(S, k * 30)), 1000)), py = S.add(S.add(cy, S.div(S.mul(r, shaderMotionSin(S, k * 30)), 1000)), sag);
        on = S.or(on, shaderFwAt(S, px, py));
      }
      hit = S.sel(S.and(live, on), S.sel(dim, shaderPaintShade(S, col, 60, 0), col), hit);
    }
    return hit;
  },
};

SHADER_DEFS.raindrops = {
  label: "Raindrops", title: "raindrops landing on a still surface, each splashing and spreading a ring that fades",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["raindrops", "ripples", "puddle", "rain", "water", "pond", "rings", "weather", "calm", "splash"],
  params: {
    drops: { type: "int", min: 1, max: 6, def: 5, label: "Drops a loop" },
    ring: { type: "colour", def: "#dff4ff", label: "Rings" },
    bright: { type: "int", min: 0, max: 100, def: 45, label: "Ring brightness (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Drops" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1161);
    let lit = S.i(0);
    for (let m = 0; m < 6; m++) {
      // drop m lands at its own frame and its ring spreads a pixel a frame for eight frames
      const st = S.div(S.mul(S.FRAMES, m), 6), t = S.div(S.mul(S.mod(S.sub(S.add(S.frame, S.FRAMES), st), S.FRAMES), 16), S.FRAMES);
      const hb = S.hash(m, 9, sd), cx = S.mod(hb, S.max(S.w, 1)), cy = S.mod(S.div(hb, 100), S.max(S.h, 1));
      const dx = S.sub(S.x, cx), dy = S.mul(S.sub(S.y, cy), 2), d = shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy)));
      const live = S.and(S.lt(m, S.p("drops")), S.lt(t, 8));
      const v = S.pick([[S.and(S.eq(t, 0), S.eq(d, 0)), 100], [S.and(S.gt(t, 0), S.eq(d, S.mul(t, 2))), S.sub(100, S.mul(t, 11))]], 0);
      lit = S.max(lit, S.sel(live, v, 0));
    }
    return S.sel(S.gt(lit, 0), shaderPaintMix(S, c, S.p("ring"), S.div(S.mul(lit, S.p("bright")), 100)), c);
  },
};

SHADER_DEFS.tvstatic = {
  label: "TV static", title: "a detuned TV: snow crackling over the picture, a dark bar rolling down, the odd torn line",
  group: "World", kind: "screen", palette: "free", frames: 8, fps: 16, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["static", "tv", "snow", "noise", "detuned", "signal", "analog", "horror", "interference", "broadcast"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 45, label: "Amount (%)" },
    bar: { type: "int", min: 0, max: 100, def: 40, label: "Rolling bar (%)" },
    tear: { type: "int", min: 0, max: 100, def: 20, label: "Torn lines (%)" },
  },
  fragment: function (S) {
    const A = S.p("amount");
    const torn = S.lt(S.mod(S.hash(S.y, S.frame, 1171), 100), S.div(S.p("tear"), 4)), q = S.texAt(S.add(S.x, S.sel(torn, 3, 0)), S.y, "clamp");
    const g = S.mod(S.hash(S.x, S.y, S.add(S.frame, 1172)), 256), snow = S.rgba(g, g, g, 255);
    const by = S.div(S.mul(S.frame, S.h), S.FRAMES), inBar = S.lt(S.mod(S.add(S.sub(S.y, by), S.h), S.h), S.max(S.div(S.h, 5), 1));
    const mixed = shaderPaintMix(S, q, snow, A);
    return S.sel(S.gt(A, 0), S.sel(inBar, shaderPaintShade(S, mixed, S.sub(100, S.div(S.p("bar"), 2)), 0), mixed), S.tex(0, 0));
  },
};

SHADER_DEFS.wavewipe = {
  label: "Wave wipe", title: "the cover sweeps across the screen behind a wavy, rippling edge",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    amp: { type: "int", min: 0, max: 12, def: 4, label: "Wave height (px)" },
    waves: { type: "int", min: 1, max: 8, def: 3, label: "Waves along the edge" },
    dir: { type: "int", min: 0, max: 2, def: 0, label: "Sweeps", choices: ["left to right", "right to left", "top to bottom"] },
  },
  fragment: function (S) {
    const D = S.p("dir"), A = S.p("amp"), down = S.eq(D, 2);
    const u = S.pick([[S.eq(D, 0), S.x], [S.eq(D, 1), S.sub(S.sub(S.w, 1), S.x)]], S.y), along = S.sel(down, S.x, S.y);
    const span = S.sel(down, S.h, S.w), len = S.max(S.sel(down, S.w, S.h), 1);
    // the edge runs from -amp to span + amp, its wave rolling along it as it goes
    const ph = S.add(S.div(S.mul(S.mul(along, 360), S.p("waves")), len), S.div(S.mul(S.frame, 360), S.FRAMES));
    const edge = S.add(S.sub(S.div(S.mul(S.progress(), S.add(span, S.mul(A, 2))), 100), A), S.div(S.mul(shaderMotionSin(S, ph), A), 1000));
    return S.sel(S.lt(u, edge), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.aperture = {
  label: "Aperture", title: "a camera's iris: six blades turning in to close a hexagon on the middle",
  group: "Transitions", kind: "screen", transition: "covered", palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#16161c", label: "Blades" },
    seam: { type: "colour", def: "#3a3a46", label: "Blade edges" },
    turn: { type: "int", min: 0, max: 60, def: 30, label: "Blades turn (degrees)" },
  },
  fragment: function (S) {
    const p = S.progress(), K = shaderUiClock(S);
    const Rm = S.add(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 2), R = S.div(S.mul(Rm, S.sub(100, p)), 100);
    // the hexagon's six sides, turning as it closes: covered past the farthest of them
    const rot = S.div(S.mul(S.p("turn"), p), 100);
    let far = S.i(-99999);
    for (let k = 0; k < 6; k++) {
      const a = S.add(rot, k * 60), pr = S.div(S.add(S.mul(K.X2, shaderMotionCos(S, a)), S.mul(K.Y2, shaderMotionSin(S, a))), 1000);
      far = S.max(far, pr);
    }
    const covered = S.ge(far, R);
    // a blade's leading edge: where the side's own angle wraps to the next
    const edge = S.and(covered, S.lt(S.mod(S.add(S.sub(K.a, rot), 720), 60), 2), S.gt(K.d2, R));
    return S.pick([[S.and(S.eq(p, 100), covered), S.p("cover")], [edge, S.p("seam")], [covered, S.p("cover")]], S.tex(0, 0));
  },
};

SHADER_DEFS.rollup = {
  label: "Roll up", title: "the screen rolls up from the bottom like a scroll, the roll's underside shaded, the cover left beneath",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    roll: { type: "int", min: 2, max: 10, def: 5, label: "Roll thickness (px)" },
    shade: { type: "int", min: 0, max: 80, def: 40, label: "Roll shading (%)" },
  },
  fragment: function (S) {
    const p = S.progress(), R = S.p("roll"), top = S.sub(S.h, S.div(S.mul(p, S.add(S.h, R)), 100));
    // in the roll the rows above its top edge show again, mirrored, darker toward its middle
    const into = S.sub(S.y, top), inRoll = S.and(S.ge(into, 0), S.lt(into, R)), src = S.texAt(S.x, S.sub(S.sub(top, into), 1), "clamp");
    const mid = S.abs(S.sub(S.mul(into, 2), S.sub(R, 1))), dk = S.div(S.mul(S.p("shade"), S.sub(R, mid)), S.max(R, 1));
    return S.pick([[S.and(S.gt(p, 0), inRoll), shaderPaintShade(S, src, S.sub(100, dk), 0)], [S.ge(into, R), S.p("cover")]], S.tex(0, 0));
  },
};

SHADER_DEFS.embroidery = {
  label: "Embroidery", title: "the picture embroidered: satin stitches slanting one way and the other cell by cell, its outline back-stitched",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["embroidery", "embroidered", "stitch", "satin", "thread", "badge", "craft", "textile", "sewing", "crest"],
  params: {
    cell: { type: "int", min: 3, max: 8, def: 4, label: "Stitch block (px)" },
    sheen: { type: "int", min: 0, max: 60, def: 30, label: "Thread sheen (%)" },
    thread: { type: "colour", def: "#2a1a12", label: "Outline thread" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("cell"), cc = shaderOldCell(S, K, K), col = S.sel(S.solid(cc), cc, c);
    // stitches slant / in one cell and \ in the next; every other diagonal catches the light
    const slant = S.eq(S.mod(S.add(S.div(S.x, K), S.div(S.y, K)), 2), 0);
    const u = S.sel(slant, S.add(S.x, S.y), S.add(S.sub(S.x, S.y), 512)), light = S.eq(S.mod(u, 2), 0);
    const rim = S.and(S.solid(c), shaderPaintRim(S)), dash = S.lt(S.mod(S.add(S.x, S.y), 3), 2);
    const out = S.pick([
      [S.and(rim, dash), S.p("thread")],
      [light, shaderPaintMix(S, col, S.rgba(255, 255, 255, 255), S.p("sheen"))],
    ], shaderPaintShade(S, col, S.sub(100, S.div(S.p("sheen"), 2)), 0));
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.impact.variants = [{ rays: 12, across: 30, down: 30 }, { rays: 4, spark: "#7ae0ff", flash: "#e0f8ff" }];
SHADER_DEFS.paintball.variants = [{ amount: 100 }, { amount: 20, paints: ["#ff8a00", "#00a0ff"], seed: 5 }];
SHADER_DEFS.candystripe.variants = [{ stripe: 1, one: "#2a8a3a" }, { stripe: 5, slide: 1, one: "#3a5aff", two: "#ffd84a" }];
SHADER_DEFS.sprinkles.variants = [{ thick: 6, dribble: 100 }, { frosting: "#5a3020", thick: 1, dribble: 0, seed: 4 }];
SHADER_DEFS.shivering.variants = [{ amount: 100 }, { amount: 25, chill: "#ffffff" }];
SHADER_DEFS.iridescent.variants = [{ amount: 90 }, { amount: 30, sheen: ["#ffd84a", "#ff8a3a", "#ff3a8a"], flow: 1 }];
SHADER_DEFS.coderain.variants = [{ density: 90, trail: 14, dark: 85 }, { density: 20, trail: 3, glyph: "#ff3a5a", head: "#ffe0e0" }];
SHADER_DEFS.warp.variants = [{ stars: 90, dark: 90 }, { stars: 15, tail: "#ff8a3a" }];
SHADER_DEFS.fireworks.variants = [{ size: 16 }, { bursts: 1, size: 5, colors: ["#ffffff", "#ffd84a"] }];
SHADER_DEFS.raindrops.variants = [{ drops: 6, bright: 80 }, { drops: 2, ring: "#ffffff", seed: 4 }];
SHADER_DEFS.tvstatic.variants = [{ amount: 100, bar: 80 }, { amount: 15, tear: 100 }];
SHADER_DEFS.wavewipe.variants = [{ amp: 12, waves: 1 }, { dir: 2, amp: 2, waves: 8, cover: "#1a2a5a" }];
SHADER_DEFS.aperture.variants = [{ turn: 60 }, { turn: 0, cover: "#000000", seam: "#5a4a2a" }];
SHADER_DEFS.rollup.variants = [{ roll: 10, shade: 80 }, { roll: 2, shade: 0, cover: "#e8e0d0" }];
SHADER_DEFS.embroidery.variants = [{ cell: 3, sheen: 50 }, { cell: 8, sheen: 10, thread: "#e8d8a0" }];

// ---- Tools for pixel artists, light and frost, two more transitions ----
// ======================================================================================================================
// Practical looks an artist reaches for (adjust brightness, contrast, saturation and hue; simulate color blindness;
// selective outlining; a bevel; a negative), two drawn looks (stipple, pastel), three for a sprite (fairy dust falling,
// red-hot metal, relit from a direction), four for the screen (a blizzard, dappled sunlight, frost creeping in, rain on
// the lens) and two transitions (columns crumbling away, boxes growing). Private helpers shaderTk*; earlier helpers are
// reused.
// ======================================================================================================================

SHADER_EFFECTS.push("adjust", "colorblind", "selout", "bevel", "negative", "stipple", "pastel", "fairydust", "redhot", "relight",
  "blizzard", "dappled", "frostedscreen", "rainglass", "crumble", "boxgrow");

// a color with its channels clamped to 0..255, opaque
function shaderTkRgb(S, r, g, b) { return S.rgba(S.clamp(r, 0, 255), S.clamp(g, 0, 255), S.clamp(b, 0, 255), 255); }
// a luma that reads 0 off the silhouette (so edges count as a fall to black)
function shaderTkLum(S, q) { return S.sel(S.solid(q), S.luma(q), 0); }

SHADER_DEFS.adjust = {
  label: "Adjust colors", title: "brightness, contrast, saturation and a hue shift, the everyday color knobs",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["adjust", "brightness", "contrast", "saturation", "hue", "color correction", "levels", "tweak", "tool", "grade"],
  params: {
    brightness: { type: "int", min: -100, max: 100, def: 0, label: "Brightness" },
    contrast: { type: "int", min: 0, max: 200, def: 115, label: "Contrast (%)" },
    saturation: { type: "int", min: 0, max: 200, def: 125, label: "Saturation (%)" },
    hue: { type: "int", min: -180, max: 180, def: 0, label: "Hue shift (degrees)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), r = S.r(c), g = S.g(c), b = S.b(c);
    // YIQ, times 1000: brightness and contrast on Y, saturation and hue on I and Q
    const Y = S.div(S.add(S.add(S.mul(r, 299), S.mul(g, 587)), S.mul(b, 114)), 1000);
    const I = S.div(S.sub(S.sub(S.mul(r, 596), S.mul(g, 274)), S.mul(b, 322)), 1000);
    const Q = S.div(S.add(S.sub(S.mul(r, 211), S.mul(g, 523)), S.mul(b, 312)), 1000);
    const Y2 = S.add(S.add(S.div(S.mul(S.sub(Y, 128), S.p("contrast")), 100), 128), S.div(S.mul(S.p("brightness"), 255), 100));
    const cs = shaderMotionCos(S, S.p("hue")), sn = shaderMotionSin(S, S.p("hue")), sat = S.p("saturation");
    const I1 = S.div(S.mul(S.div(S.sub(S.mul(I, cs), S.mul(Q, sn)), 1000), sat), 100), Q1 = S.div(S.mul(S.div(S.add(S.mul(I, sn), S.mul(Q, cs)), 1000), sat), 100);
    const out = shaderTkRgb(S,
      S.add(Y2, S.div(S.add(S.mul(I1, 956), S.mul(Q1, 621)), 1000)),
      S.sub(Y2, S.div(S.add(S.mul(I1, 272), S.mul(Q1, 647)), 1000)),
      S.add(Y2, S.div(S.sub(S.mul(Q1, 1703), S.mul(I1, 1106)), 1000)));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.colorblind = {
  label: "Color blindness", title: "how the picture looks with a kind of color blindness (the common simplified simulations), to check a palette",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["color blindness", "accessibility", "protanopia", "deuteranopia", "tritanopia", "simulation", "a11y", "palette check", "tool", "vision"],
  params: {
    vision: { type: "int", min: 0, max: 3, def: 1, label: "Simulates", choices: ["protanopia (no red cones)", "deuteranopia (no green cones)", "tritanopia (no blue cones)", "achromatopsia (no color)"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("vision"), r = S.r(c), g = S.g(c), b = S.b(c);
    const M = [
      [567, 433, 0, 558, 442, 0, 0, 242, 758],
      [625, 375, 0, 700, 300, 0, 0, 300, 700],
      [950, 50, 0, 0, 433, 567, 0, 475, 525],
    ];
    const row = function (i) {
      const m = function (j) { return S.pick([[S.eq(K, 0), M[0][i * 3 + j]], [S.eq(K, 1), M[1][i * 3 + j]]], M[2][i * 3 + j]); };
      return S.div(S.add(S.add(S.mul(r, m(0)), S.mul(g, m(1))), S.mul(b, m(2))), 1000);
    };
    const l = S.luma(c), out = S.sel(S.eq(K, 3), S.rgba(l, l, l, 255), shaderTkRgb(S, row(0), row(1), row(2)));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.selout = {
  label: "Selective outline", title: "pixel art's selective outline: the sprite's edge pixels darkened away from the light and lightened toward it",
  group: "Looks", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["selout", "selective outline", "outline", "pixel art", "edge", "shading", "sprite", "tool", "cleanup", "lineart"],
  params: {
    dark: { type: "int", min: 0, max: 100, def: 55, label: "Shadow side (%)" },
    light: { type: "int", min: 0, max: 100, def: 30, label: "Lit side (%)" },
    shadow: { type: "colour", def: "#1a1028", label: "Shadow tint" },
    from: { type: "int", min: 0, max: 3, def: 0, label: "Light from", choices: ["the top left", "the top right", "the bottom left", "the bottom right"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), F = S.p("from");
    const hx = S.sel(S.eq(S.mod(F, 2), 0), -1, 1), hy = S.sel(S.lt(F, 2), -1, 1);
    const open = function (dx, dy) { return S.not(S.solid(S.texAt(S.add(S.x, dx), S.add(S.y, dy), "clear"))); };
    const rim = S.and(S.solid(c), S.or(open(1, 0), open(-1, 0), open(0, 1), open(0, -1)));
    // lit where the open side faces the light, shaded where it faces away
    const lit = S.and(rim, S.or(open(hx, 0), open(0, hy)));
    return S.pick([[lit, shaderPaintMix(S, c, S.rgba(255, 255, 255, 255), S.p("light"))], [rim, shaderPaintMix(S, c, S.p("shadow"), S.p("dark"))]], c);
  },
};

SHADER_DEFS.bevel = {
  label: "Bevel", title: "a bevel round the sprite's edge: lit on the sides toward the light, shaded on the others, like a button",
  group: "Looks", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["bevel", "button", "ui", "raised", "3d", "emboss", "edge", "plastic", "tile", "panel"],
  params: {
    width: { type: "int", min: 1, max: 4, def: 2, label: "Bevel (px)" },
    light: { type: "int", min: 0, max: 100, def: 45, label: "Lit edge (%)" },
    dark: { type: "int", min: 0, max: 100, def: 45, label: "Shaded edge (%)" },
    lamp: { type: "colour", def: "#ffffff", label: "Light" },
    shade: { type: "colour", def: "#000000", label: "Shade" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("width");
    // the nearest open pixel up-left or down-right along each axis, within the bevel's width
    let up = S.lt(1, 0), down = S.lt(1, 0);
    for (let k = 1; k <= 4; k++) {
      const inW = S.le(k, W);
      up = S.or(up, S.and(inW, S.or(S.not(S.solid(S.tex(-k, 0))), S.not(S.solid(S.tex(0, -k))))));
      down = S.or(down, S.and(inW, S.or(S.not(S.solid(S.tex(k, 0))), S.not(S.solid(S.tex(0, k))))));
    }
    return S.pick([[S.not(S.solid(c)), c], [up, shaderPaintMix(S, c, S.p("lamp"), S.p("light"))], [down, shaderPaintMix(S, c, S.p("shade"), S.p("dark"))]], c);
  },
};

SHADER_DEFS.negative = {
  label: "Negative", title: "the picture as a photographic negative, or only its light and dark turned over, its colors kept",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["negative", "invert", "inverse", "film", "x-ray", "spooky", "flash", "photo", "darkroom", "flip"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 100, label: "Amount (%)" },
    mode: { type: "int", min: 0, max: 1, def: 0, label: "Turns over", choices: ["every channel", "only the brightness"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), l = S.luma(c), sh = S.sub(255, S.mul(l, 2));
    const full = S.rgba(S.sub(255, S.r(c)), S.sub(255, S.g(c)), S.sub(255, S.b(c)), 255);
    const lum = shaderTkRgb(S, S.add(S.r(c), sh), S.add(S.g(c), sh), S.add(S.b(c), sh));
    return S.sel(S.solid(c), shaderPaintMix(S, c, S.sel(S.eq(S.p("mode"), 0), full, lum), S.p("amount")), c);
  },
};

SHADER_DEFS.stipple = {
  label: "Stipple", title: "the picture stippled in ink: scattered dots, thicker where it is darker, on plain paper",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["stipple", "dots", "ink", "pen", "engraving", "pointillism", "illustration", "1-bit", "sketch", "scientific"],
  params: {
    ink: { type: "colour", def: "#1c1a22", label: "Ink" },
    paper: { type: "colour", def: "#f4efe2", label: "Paper" },
    density: { type: "int", min: 30, max: 200, def: 100, label: "Density (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Dots" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), dark = S.div(S.mul(S.sub(255, S.luma(c)), S.p("density")), 100);
    const dot = S.lt(S.mod(S.hash(S.x, S.y, S.add(S.mul(S.p("seed"), 4), 1201)), 256), dark);
    return S.sel(S.solid(c), S.sel(dot, S.p("ink"), S.p("paper")), c);
  },
};

SHADER_DEFS.pastel = {
  label: "Pastel", title: "the picture in soft pastels: colors softened and lifted, a chalky paper grain, the edges a little powdery",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["pastel", "soft", "chalk", "kawaii", "cute", "light", "dreamy", "spring", "baby", "gentle"],
  params: {
    soften: { type: "int", min: 0, max: 100, def: 35, label: "Soften colors (%)" },
    lift: { type: "int", min: 0, max: 100, def: 40, label: "Lift toward the paper (%)" },
    paper: { type: "colour", def: "#fff6f2", label: "Paper" },
    grain: { type: "int", min: 0, max: 50, def: 15, label: "Grain (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), soft = shaderPaintPunch(S, c, S.sub(100, S.p("soften")));
    const up = shaderPaintMix(S, soft, S.p("paper"), S.p("lift"));
    const gr = S.lt(S.mod(S.hash(S.x, S.y, 1211), 100), S.p("grain")), rim = S.and(S.solid(c), shaderPaintRim(S));
    const out = S.pick([[S.and(rim, S.eq(S.mod(S.add(S.x, S.y), 2), 0)), shaderPaintMix(S, up, S.p("paper"), 45)], [gr, shaderPaintMix(S, up, S.p("paper"), 30)]], up);
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.fairydust = {
  label: "Fairy dust", title: "glittering dust drifting down off the sprite's underside, twinkling as it falls, a few sparks on the sprite",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 6, 0],
  tags: ["fairy dust", "pixie", "sparkle", "glitter", "magic", "fairy", "enchanted", "trail", "fly", "whimsy"],
  params: {
    dust: { type: "palette", def: ["#ffffff", "#ffe8a0", "#ffb8ec", "#b8f0ff"], max: 8, label: "Dust" },
    density: { type: "int", min: 0, max: 100, def: 40, label: "Dust (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Dust" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1221), n = S.palCount("dust");
    // in some columns a mote falls six px under the sprite, twice a loop, out of step
    const h = S.hash(S.x, 3, sd), on = S.lt(S.mod(h, 100), S.p("density"));
    const fall = S.add(S.div(S.mul(S.mod(S.add(S.mul(S.frame, 2), S.div(h, 100)), S.FRAMES), 6), S.FRAMES), 1);
    const mote = S.and(on, S.not(S.solid(c)), S.eq(shaderEnchAbove(S, 6), fall));
    const col = S.palAt("dust", S.mod(S.add(S.div(h, 7), S.frame), n));
    const spark = S.and(S.solid(c), S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 24), 0));
    return S.pick([[mote, col], [spark, S.palAt("dust", 0)]], c);
  },
};

SHADER_DEFS.redhot = {
  label: "Red hot", title: "the sprite heated red hot from its edges in: black, red, orange, yellow, white at the edge, throbbing",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["red hot", "heated", "forge", "molten", "glowing", "metal", "smith", "fire", "heat", "anvil"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 60, label: "Amount (%)" },
    heat: { type: "palette", def: ["#3a0a04", "#a01808", "#ff4a10", "#ffa020", "#fff0a0"], max: 8, label: "Cool to hot" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Glow" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), n = S.palCount("heat");
    // hottest at the rim, cooling inward; the reach throbs once a loop and wavers by a noise
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const nz = S.div(S.sub(shaderPaintNoise(S, S.x, S.y, 3, S.add(S.mul(S.p("seed"), 4), 1231)), 128), 64);
    const lv = S.sub(S.add(S.div(S.mul(A, S.add(S.sub(n, 1), S.div(s, 600))), 100), nz), shaderEnchDepth(S, 4));
    const hot = S.palAt("heat", S.clamp(lv, 0, S.sub(n, 1)));
    return S.sel(S.and(S.solid(c), S.gt(A, 0), S.ge(lv, 0)), shaderPaintMix(S, c, hot, S.add(40, S.div(A, 2))), c);
  },
};

SHADER_DEFS.relight = {
  label: "Relight", title: "the sprite lit from a chosen direction: its faces toward the light brightened, those away shaded, read off its own shading",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["relight", "lighting", "light direction", "shading", "normal", "sun", "lamp", "dynamic", "tool", "3d"],
  params: {
    angle: { type: "int", min: 0, max: 359, def: 225, label: "Light from (degrees, 0 right, 90 below)" },
    lamp: { type: "colour", def: "#fff2cc", label: "Light" },
    shade: { type: "colour", def: "#1a1430", label: "Shade" },
    power: { type: "int", min: 0, max: 100, def: 60, label: "Strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), lx = shaderMotionCos(S, S.p("angle")), ly = shaderMotionSin(S, S.p("angle"));
    // the slope of the brightness (the silhouette counting as a drop to black): a face whose bright side points at
    // the light is lit
    const gx = S.sub(shaderTkLum(S, S.tex(1, 0)), shaderTkLum(S, S.tex(-1, 0))), gy = S.sub(shaderTkLum(S, S.tex(0, 1)), shaderTkLum(S, S.tex(0, -1)));
    const dot = S.div(S.neg(S.add(S.mul(gx, lx), S.mul(gy, ly))), 1000);           // -510 .. 510, positive faces the light
    const t = S.div(S.mul(S.min(S.abs(dot), 255), S.p("power")), 255);
    return S.pick([[S.not(S.solid(c)), c], [S.gt(dot, 0), shaderPaintMix(S, c, S.p("lamp"), t)]], shaderPaintMix(S, c, S.p("shade"), t));
  },
};

SHADER_DEFS.blizzard = {
  label: "Blizzard", title: "a blizzard: snow streaking past on a slant, a whiteout thickening and thinning as the wind gusts",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["blizzard", "snowstorm", "whiteout", "winter", "storm", "wind", "snow", "arctic", "weather", "cold"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 55, label: "Amount (%)" },
    snow: { type: "colour", def: "#f4f8ff", label: "Snow" },
    fog: { type: "colour", def: "#c8d4e8", label: "Whiteout" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Snow" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1241);
    // streaks two px long falling down and left: one in some 5 px cells, the field moving 40 px down a loop
    const flake = function (dx, dy) {
      const x = S.add(S.add(S.x, dx), S.div(S.add(S.y, dy), 2)), y = S.sub(S.add(S.add(S.y, dy), 400), S.div(S.mul(S.frame, 40), S.FRAMES));
      const h = S.hash(S.div(x, 5), S.mod(S.div(y, 5), 8), sd);
      return S.and(S.lt(S.mod(h, 100), S.div(A, 2)), S.eq(S.mod(x, 5), S.mod(S.div(h, 100), 5)), S.eq(S.mod(y, 5), S.mod(S.div(h, 500), 5)));
    };
    const streak = S.or(flake(0, 0), flake(-1, -1));
    // the whiteout gusts once a loop
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const fogT = S.div(S.mul(A, S.add(40, S.div(s, 40))), 100), lv = shaderUiSteps(S, fogT);
    const out = shaderPaintMix(S, c, S.p("fog"), S.mul(lv, 18));
    return S.sel(S.gt(A, 0), S.sel(streak, S.p("snow"), out), c);
  },
};

SHADER_DEFS.dappled = {
  label: "Dappled light", title: "sunlight through leaves: bright patches drifting and shifting over the scene, the rest in soft shade",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 6, pad: [0, 0, 0, 0],
  tags: ["dappled", "sunlight", "leaves", "canopy", "forest", "shade", "summer", "park", "ambient", "light"],
  params: {
    sun: { type: "colour", def: "#fff4c0", label: "Sunlight" },
    shade: { type: "colour", def: "#1a2a1a", label: "Shade" },
    patches: { type: "int", min: 0, max: 100, def: 40, label: "Sunlit (%)" },
    contrast: { type: "int", min: 0, max: 100, def: 30, label: "Strength (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Leaves" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1251), K = S.p("contrast");
    // two noises drifting against each other, 48 px a loop; light where both are high
    const a = shaderEnchFlow(S, S.y, S.add(S.x, S.div(S.mul(S.frame, 48), S.FRAMES)), 6, sd, 48);
    const b = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 48), S.FRAMES)), 8, S.add(sd, 1), 48);
    const v = S.div(S.add(a, b), 2), thr = S.sub(255, S.div(S.mul(S.p("patches"), 200), 100));
    const lit = S.gt(v, thr), edge = S.and(S.not(lit), S.gt(v, S.sub(thr, 8)), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    return S.pick([[lit, shaderPaintMix(S, c, S.p("sun"), K)], [edge, shaderPaintMix(S, c, S.p("sun"), S.div(K, 2))]], shaderPaintMix(S, c, S.p("shade"), S.div(K, 2)));
  },
};

SHADER_DEFS.frostedscreen = {
  label: "Frosted screen", title: "frost creeping in from the screen's edges, crystals feathering across it, glinting",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["frost", "frozen", "ice", "cold", "window", "winter", "frosted", "freeze", "vignette", "chill"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 50, label: "Amount (%)" },
    frost: { type: "colour", def: "#e8f6ff", label: "Frost" },
    deep: { type: "colour", def: "#9ac8ec", label: "Crystals" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Crystals" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1261);
    const e = S.min(S.min(S.x, S.sub(S.sub(S.w, 1), S.x)), S.min(S.y, S.sub(S.sub(S.h, 1), S.y)));
    const reach = S.add(S.div(S.mul(A, S.div(S.min(S.w, S.h), 2)), 100), S.div(S.sub(shaderPaintNoise(S, S.x, S.y, 4, sd), 128), 32));
    const frosted = S.and(S.gt(A, 0), S.lt(e, reach));
    const v = shaderPaintCells(S, 5, S.add(sd, 1)), crystal = shaderPaintJoin(S, v, 1);
    const glint = S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 2)), S.frame), 20), 0);
    const deepIn = S.lt(e, S.div(reach, 2));
    return S.pick([
      [S.not(frosted), c],
      [glint, S.rgba(255, 255, 255, 255)],
      [crystal, shaderPaintMix(S, c, S.p("deep"), 80)],
    ], shaderPaintMix(S, c, S.p("frost"), S.sel(deepIn, 75, 45)));
  },
};

SHADER_DEFS.rainglass = {
  label: "Rain on glass", title: "raindrops on the lens: little drops bending the scene behind them, a glint on each, runnels sliding down",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0],
  tags: ["rain", "glass", "window", "lens", "drops", "wet", "storm", "melancholy", "weather", "camera"],
  params: {
    drops: { type: "int", min: 0, max: 100, def: 40, label: "Drops (%)" },
    runnels: { type: "int", min: 0, max: 100, def: 20, label: "Runnels (%)" },
    glint: { type: "colour", def: "#ffffff", label: "Glint" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Drops" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1271);
    // a drop in some 7 px cells: radius 1-2 round a hashed middle, showing the scene behind it flipped
    const cx = S.div(S.x, 7), cy = S.div(S.y, 7), h = S.hash(cx, cy, sd), on = S.lt(S.mod(h, 100), S.p("drops"));
    const mx = S.add(S.mul(cx, 7), S.add(2, S.mod(S.div(h, 100), 3))), my = S.add(S.mul(cy, 7), S.add(2, S.mod(S.div(h, 300), 3)));
    const r = S.add(1, S.mod(S.div(h, 900), 2)), dx = S.sub(S.x, mx), dy = S.sub(S.y, my);
    const inDrop = S.and(on, S.le(S.add(S.mul(dx, dx), S.mul(dy, dy)), S.add(S.mul(r, r), 1)));
    const behind = S.texAt(S.sub(mx, S.mul(dx, 2)), S.sub(my, S.mul(dy, 2)), "clamp");
    const shine = S.and(inDrop, S.eq(dx, S.neg(1)), S.eq(dy, S.neg(1)));
    // runnels: in some columns a bright pixel slides down the screen once a loop, a short wet trail behind it
    const hc = S.hash(S.x, 4, sd), run = S.lt(S.mod(hc, 100), S.div(S.p("runnels"), 3));
    const ry = S.mod(S.add(S.div(S.mul(S.frame, S.h), S.FRAMES), S.mod(S.div(hc, 100), S.max(S.h, 1))), S.max(S.h, 1));
    const up = S.mod(S.add(S.sub(ry, S.y), S.h), S.max(S.h, 1));
    return S.pick([
      [shine, S.p("glint")],
      [inDrop, shaderPaintShade(S, behind, 110, 6)],
      [S.and(run, S.eq(up, 0)), S.p("glint")],
      [S.and(run, S.lt(up, 4)), shaderPaintShade(S, c, 115, 8)],
    ], c);
  },
};

SHADER_DEFS.crumble = {
  label: "Crumble", title: "the screen crumbles away in columns, each falling at its own moment and gathering speed, the cover above",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    column: { type: "int", min: 1, max: 16, def: 4, label: "Column width (px)" },
    stagger: { type: "int", min: 0, max: 80, def: 50, label: "Stagger (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Order" },
  },
  fragment: function (S) {
    const p = S.progress(), col = S.div(S.x, S.p("column"));
    const st = S.mod(S.hash(col, 1, S.add(S.mul(S.p("seed"), 4), 1281)), S.add(S.p("stagger"), 1));
    // the drop accelerates: h x (p - start)^2 / (100 - start)^2, the whole height by 100
    const q = S.max(S.sub(p, st), 0), drop = S.div(S.mul(S.h, S.mul(q, q)), S.max(S.mul(S.sub(100, st), S.sub(100, st)), 1));
    return S.sel(S.lt(S.y, drop), S.p("cover"), S.texAt(S.x, S.sub(S.y, drop), "clamp"));
  },
};

SHADER_DEFS.boxgrow = {
  label: "Box grow", title: "squares of the cover growing out of a grid until they meet, all at once, from the middle out or at random",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    box: { type: "int", min: 2, max: 24, def: 8, label: "Box (px)" },
    order: { type: "int", min: 0, max: 2, def: 1, label: "Order", choices: ["all at once", "from the middle out", "at random"] },
    spread: { type: "int", min: 0, max: 200, def: 80, label: "Spread" },
  },
  fragment: function (S) {
    const p = S.progress(), B = S.p("box"), bx = S.div(S.x, B), by = S.div(S.y, B), O = S.p("order"), sp = S.p("spread");
    const nx = S.max(S.div(S.add(S.w, S.sub(B, 1)), B), 1), ny = S.max(S.div(S.add(S.h, S.sub(B, 1)), B), 1);
    const ddx = S.abs(S.sub(S.mul(bx, 2), S.sub(nx, 1))), ddy = S.abs(S.sub(S.mul(by, 2), S.sub(ny, 1)));
    const rank = S.pick([[S.eq(O, 0), 0], [S.eq(O, 1), S.div(S.mul(S.max(ddx, ddy), 100), S.max(S.max(nx, ny), 1))]], S.mod(S.hash(bx, by, 1291), 100));
    const q = S.clamp(S.sub(S.div(S.mul(p, S.add(100, sp)), 100), S.div(S.mul(rank, sp), 100)), 0, 100);
    const fx2 = S.abs(S.sub(S.add(S.mul(S.mod(S.x, B), 2), 1), B)), fy2 = S.abs(S.sub(S.add(S.mul(S.mod(S.y, B), 2), 1), B));
    return S.sel(S.lt(S.mul(S.max(fx2, fy2), 100), S.mul(q, B)), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.adjust.variants = [{ brightness: 20, contrast: 140, saturation: 0 }, { hue: 120, saturation: 160 }, { hue: -90, contrast: 80, brightness: -20 }];
SHADER_DEFS.colorblind.variants = [{ vision: 0 }, { vision: 2 }, { vision: 3 }];
SHADER_DEFS.selout.variants = [{ from: 1, dark: 80, light: 0 }, { from: 3, shadow: "#3a0a0a", light: 60 }];
SHADER_DEFS.bevel.variants = [{ width: 1, light: 70, dark: 70 }, { width: 4, lamp: "#ffe8a0", shade: "#2a0a3a" }];
SHADER_DEFS.negative.variants = [{ mode: 1 }, { amount: 50 }];
SHADER_DEFS.stipple.variants = [{ density: 160 }, { ink: "#7a1a2a", paper: "#fff8e8", density: 60, seed: 5 }];
SHADER_DEFS.pastel.variants = [{ soften: 70, lift: 60 }, { soften: 10, lift: 20, paper: "#f0f8ff", grain: 40 }];
SHADER_DEFS.fairydust.variants = [{ density: 90 }, { density: 20, dust: ["#b8ffd8", "#ffffff"] }];
SHADER_DEFS.redhot.variants = [{ amount: 100 }, { amount: 30, heat: ["#04103a", "#0a40a0", "#3aa0ff", "#c0f0ff", "#ffffff"] }];
SHADER_DEFS.relight.variants = [{ angle: 315, power: 100 }, { angle: 90, lamp: "#a0e0ff", shade: "#2a0a0a" }];
SHADER_DEFS.blizzard.variants = [{ amount: 100 }, { amount: 25, fog: "#e8e0d0", snow: "#ffffff" }];
SHADER_DEFS.dappled.variants = [{ patches: 70, contrast: 50 }, { patches: 20, contrast: 20, sun: "#e0fff0", seed: 3 }];
SHADER_DEFS.frostedscreen.variants = [{ amount: 100 }, { amount: 25, frost: "#fff0f8", deep: "#e0a0c8" }];
SHADER_DEFS.rainglass.variants = [{ drops: 80, runnels: 60 }, { drops: 15, runnels: 0, seed: 7 }];
SHADER_DEFS.crumble.variants = [{ column: 1, stagger: 80 }, { column: 16, stagger: 0, cover: "#2a1a10" }];
SHADER_DEFS.boxgrow.variants = [{ order: 0, box: 4 }, { order: 2, box: 16, spread: 200, cover: "#ffffff" }];

// ---- Tiles, the demoscene, two machines, two more transitions ----
// ======================================================================================================================
// For a tile (kind screen: every pattern moves a whole tile a loop or follows the tile's own size, so it stays seamless
// at any size): scrolling, water, lava. The demoscene's classics on the screen: copper bars, plasma, a rotozoom, a
// tunnel, demo fire. For a sprite: encased in ice. Two machines: the Game Boy Color, an amber (or green) monitor. Two
// transitions: a swirl out, a page curling away. And two tools for a screen: mirror and repeat. Private helpers
// shaderDm*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("scrolltile", "watertile", "lavatile", "copperbars", "plasma", "rotozoom", "tunnel", "demofire", "iceblock",
  "gbc", "ambermonitor", "swirlout", "pagecurl", "mirror", "repeat");

// the angle that runs k whole turns across n px at position v: so a wave of it tiles over n
function shaderDmWave(S, v, k, n) { return S.div(S.mul(S.mul(v, 360), k), S.max(n, 1)); }
// a palette entry chosen by a phase cycling over the whole palette every 16 x count, dithered between neighbors
function shaderDmCycle(S, k, ph) {
  const n = S.palCount(k), run = S.mul(n, 16), q = S.mod(ph, run), i = S.div(q, 16);
  return S.sel(S.gt(S.mod(q, 16), shaderWxBayer(S, 1)), S.palAt(k, S.mod(S.add(i, 1), n)), S.palAt(k, i));
}

SHADER_DEFS.scrolltile = {
  label: "Scrolling tile", title: "a tile scrolling one tile's length (or more) a loop, wrapping, for conveyors, rivers, clouds and skies",
  group: "World", kind: "screen", frames: 16, fps: 8, pad: [0, 0, 0, 0], still0: true,
  tags: ["scroll", "tile", "conveyor", "seamless", "loop", "river", "parallax", "sky", "belt", "background"],
  params: {
    dir: { type: "int", min: 0, max: 5, def: 0, label: "Scrolls", choices: ["right", "left", "down", "up", "down and right", "up and right"] },
    laps: { type: "int", min: 1, max: 4, def: 1, label: "Tiles a loop" },
  },
  fragment: function (S) {
    const D = S.p("dir"), L = S.p("laps");
    const sx = S.div(S.mul(S.mul(S.frame, L), S.w), S.FRAMES), sy = S.div(S.mul(S.mul(S.frame, L), S.h), S.FRAMES);
    const dx = S.pick([[S.eq(D, 0), sx], [S.eq(D, 1), S.neg(sx)], [S.ge(D, 4), sx]], 0);
    const dy = S.pick([[S.eq(D, 2), sy], [S.eq(D, 3), S.neg(sy)], [S.eq(D, 4), sy], [S.eq(D, 5), S.neg(sy)]], 0);
    return S.texAt(S.sub(S.x, dx), S.sub(S.y, dy), "wrap");
  },
};

SHADER_DEFS.watertile = {
  label: "Water tile", title: "a tile turned to water: rippling a pixel either way in waves that tile, tinted, glinting on the crests",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["water", "tile", "seamless", "ripple", "river", "lake", "sea", "animated", "terrain", "pond"],
  params: {
    sway: { type: "int", min: 0, max: 3, def: 1, label: "Ripple (px)" },
    waves: { type: "int", min: 1, max: 4, def: 2, label: "Waves across the tile" },
    tint: { type: "colour", def: "#2a8ad8", label: "Water" },
    depth: { type: "int", min: 0, max: 100, def: 30, label: "Tint (%)" },
    glint: { type: "colour", def: "#e8f8ff", label: "Glints" },
  },
  fragment: function (S) {
    const K = S.p("waves"), A = S.p("sway"), t = S.div(S.mul(S.frame, 360), S.FRAMES);
    const s1 = shaderMotionSin(S, S.add(shaderDmWave(S, S.y, K, S.h), t)), s2 = shaderMotionSin(S, S.sub(shaderDmWave(S, S.x, K, S.w), t));
    const dx = S.div(S.mul(s1, A), 900), dy = S.div(S.mul(s2, A), 900);
    const q = S.texAt(S.add(S.x, dx), S.add(S.y, dy), "wrap");
    const crest = S.and(S.gt(S.add(s1, s2), 1500), S.lt(S.mod(S.hash(S.x, S.y, 1301), 100), 30));
    return S.sel(crest, S.p("glint"), shaderPaintMix(S, q, S.p("tint"), S.p("depth")));
  },
};

SHADER_DEFS.lavatile = {
  label: "Lava tile", title: "a tile turned to lava: its bright parts glowing and throbbing in tiling waves, its dark parts a cooling crust, slowly flowing",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["lava", "tile", "seamless", "magma", "volcano", "hot", "terrain", "animated", "hell", "molten"],
  params: {
    hot: { type: "colour", def: "#ffd84a", label: "Hottest" },
    glow: { type: "colour", def: "#ff5a10", label: "Glow" },
    crust: { type: "colour", def: "#2a0e08", label: "Crust" },
    above: { type: "int", min: 0, max: 254, def: 110, label: "Glows above (brightness)" },
    flow: { type: "int", min: 0, max: 2, def: 1, label: "Flows (tiles a loop)" },
  },
  fragment: function (S) {
    const F = S.p("flow"), q = S.texAt(S.x, S.sub(S.y, S.div(S.mul(S.mul(S.frame, F), S.h), S.FRAMES)), "wrap"), l = S.luma(q), T = S.p("above");
    const s = shaderMotionSin(S, S.sub(S.add(shaderDmWave(S, S.x, 2, S.w), shaderDmWave(S, S.y, 2, S.h)), S.div(S.mul(S.frame, 360), S.FRAMES)));
    const heat = S.div(S.mul(S.max(S.sub(l, T), 0), S.add(1000, s)), S.mul(S.max(S.sub(255, T), 1), 20));   // 0..100
    const lv = shaderUiSteps(S, heat);
    return S.pick([
      [S.eq(lv, 3), S.p("hot")],
      [S.gt(lv, 0), shaderPaintMix(S, q, S.p("glow"), S.add(30, S.mul(lv, 25)))],
    ], shaderPaintMix(S, q, S.p("crust"), 45));
  },
};

SHADER_DEFS.copperbars = {
  label: "Copper bars", title: "the demoscene's copper bars: shaded color bars bouncing up and down across the screen, one after another",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["copper bars", "raster bars", "demoscene", "amiga", "retro", "intro", "cracktro", "bars", "8-bit", "16-bit"],
  params: {
    bars: { type: "int", min: 1, max: 6, def: 4, label: "Bars" },
    thick: { type: "int", min: 2, max: 12, def: 6, label: "Bar height (px)" },
    colors: { type: "palette", def: ["#ff3a3a", "#ffd83a", "#3aff6a", "#3ac8ff", "#c83aff", "#ff8a3a"], max: 8, label: "Bar colors" },
    blend: { type: "int", min: 0, max: 100, def: 85, label: "Over the picture (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.p("thick"), half = S.max(S.div(H, 2), 1), n = S.palCount("colors");
    let out = c;
    for (let k = 0; k < 6; k++) {
      // bar k swings on a sine, a twelfth of a turn behind the one before
      const s = shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), k * 30));
      const cy = S.add(S.div(S.h, 2), S.div(S.mul(s, S.sub(S.div(S.h, 2), half)), 1000)), dy = S.abs(S.sub(S.y, cy));
      const shade = S.sub(100, S.div(S.mul(dy, 70), half)), col = shaderPaintShade(S, S.palAt("colors", S.mod(k, n)), S.add(30, S.div(S.mul(shade, 9), 10)), 0);
      out = S.sel(S.and(S.lt(k, S.p("bars")), S.le(dy, half)), shaderPaintMix(S, c, col, S.p("blend")), out);
    }
    return out;
  },
};

SHADER_DEFS.plasma = {
  label: "Plasma", title: "the demoscene's plasma: four sine waves summed into a flowing field of cycling colors over the screen",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["plasma", "demoscene", "psychedelic", "retro", "background", "sine", "trippy", "lava lamp", "intro", "flow"],
  params: {
    scale: { type: "int", min: 1, max: 4, def: 2, label: "Waves (fewer is bigger)" },
    blend: { type: "int", min: 0, max: 100, def: 70, label: "Over the picture (%)" },
    colors: { type: "palette", def: ["#1a0a3a", "#5a1a8a", "#c83a8a", "#ff8a3a", "#ffe85a", "#ff8a3a", "#c83a8a", "#5a1a8a"], max: 16, label: "Colors (a loop)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("scale"), t = S.div(S.mul(S.frame, 360), S.FRAMES);
    const X2 = S.sub(S.mul(S.x, 2), S.w), Y2 = S.sub(S.mul(S.y, 2), S.h), d = shaderPaintSqrt(S, S.add(S.mul(X2, X2), S.mul(Y2, Y2)));
    const v = S.add(S.add(shaderMotionSin(S, S.add(S.mul(S.x, S.mul(K, 11)), t)), shaderMotionSin(S, S.sub(S.mul(S.y, S.mul(K, 13)), t))),
      S.add(shaderMotionSin(S, S.add(S.mul(S.add(S.x, S.y), S.mul(K, 7)), S.mul(t, 2))), shaderMotionSin(S, S.sub(S.mul(d, S.mul(K, 9)), t))));
    // the field (-4000..4000) plus a shift of the whole palette once a loop
    const ph = S.add(S.div(S.mul(S.add(v, 4000), S.mul(S.palCount("colors"), 16)), 8000), S.div(S.mul(S.frame, S.mul(S.palCount("colors"), 16)), S.FRAMES));
    return shaderPaintMix(S, c, shaderDmCycle(S, "colors", ph), S.p("blend"));
  },
};

SHADER_DEFS.rotozoom = {
  label: "Rotozoom", title: "the demoscene's rotozoomer: the picture tiled endlessly, turning and zooming in and out",
  group: "World", kind: "screen", frames: 32, fps: 16, pad: [0, 0, 0, 0], still0: true,
  tags: ["rotozoom", "demoscene", "rotate", "zoom", "mode 7", "retro", "intro", "spin", "tiled", "trippy"],
  params: {
    turns: { type: "int", min: 0, max: 2, def: 1, label: "Turns a loop" },
    zoom: { type: "int", min: 0, max: 80, def: 40, label: "Zoom swing (%)" },
  },
  fragment: function (S) {
    const a = S.div(S.mul(S.mul(S.frame, 360), S.p("turns")), S.FRAMES), cs = shaderMotionCos(S, a), sn = shaderMotionSin(S, a);
    const z = S.add(100, S.div(S.mul(shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), S.p("zoom")), 1000));
    const X = S.sub(S.x, S.div(S.w, 2)), Y = S.sub(S.y, S.div(S.h, 2));
    const u = S.add(S.div(S.w, 2), S.div(S.sub(S.mul(X, cs), S.mul(Y, sn)), S.mul(z, 10))), v = S.add(S.div(S.h, 2), S.div(S.add(S.mul(X, sn), S.mul(Y, cs)), S.mul(z, 10)));
    return S.texAt(u, v, "wrap");
  },
};

SHADER_DEFS.tunnel = {
  label: "Tunnel", title: "the demoscene's tunnel: the picture wrapped round the inside of an endless tube, flying down it, dark at the far end",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["tunnel", "demoscene", "tube", "wormhole", "flying", "retro", "intro", "vortex", "hyperspace", "depth"],
  params: {
    depth: { type: "int", min: 4, max: 40, def: 16, label: "Depth (smaller is a wider tube)" },
    spin: { type: "int", min: 0, max: 2, def: 0, label: "Spins a loop" },
    dark: { type: "int", min: 0, max: 100, def: 80, label: "Far end darkness (%)" },
  },
  fragment: function (S) {
    const K = shaderUiClock(S), d = S.max(K.d2, 1);
    const u = S.div(S.mul(S.add(K.a, S.div(S.mul(S.mul(S.frame, 360), S.p("spin")), S.FRAMES)), S.w), 360);
    const v = S.add(S.div(S.mul(S.mul(S.p("depth"), S.h), 8), d), S.div(S.mul(S.frame, S.h), S.FRAMES));
    const q = S.texAt(u, v, "wrap"), far = S.max(S.sub(100, S.div(S.mul(d, 100), S.max(S.h, 1))), 0);
    return shaderPaintMix(S, q, S.rgba(0, 0, 0, 255), S.div(S.mul(far, S.p("dark")), 100));
  },
};

SHADER_DEFS.demofire = {
  label: "Demo fire", title: "the demoscene's fire: flames rising from the bottom of the screen in a hot palette, licking up and flickering",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["fire", "demoscene", "flames", "inferno", "retro", "intro", "burning", "hell", "doom", "heat"],
  params: {
    height: { type: "int", min: 10, max: 100, def: 45, label: "Height (% of the screen)" },
    flames: { type: "palette", def: ["#3a0a04", "#a01808", "#ff5a10", "#ffb020", "#fff6c0"], max: 8, label: "Cool to hot" },
    blend: { type: "int", min: 0, max: 100, def: 100, label: "Over the picture (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("flames"), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 2);
    // a noise rising 16 px a loop, cooled the higher it gets
    const nz = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, 1311, 16);
    const up = S.sub(S.h, S.y), heat = S.sub(S.add(nz, 60), S.div(S.mul(up, 300), H));   // up to ~315 at the bottom
    const i = S.div(S.mul(S.clamp(heat, 0, 255), n), 256);
    return S.sel(S.gt(heat, 30), shaderPaintMix(S, c, S.palAt("flames", i), S.p("blend")), c);
  },
};

SHADER_DEFS.iceblock = {
  label: "Ice block", title: "the sprite frozen inside a block of ice: clear ice round it, the sprite tinted through it, a glint sliding across",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["ice block", "frozen", "encased", "ice", "freeze", "trapped", "cold", "crystal", "debuff", "stasis"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 70, label: "Amount (%)" },
    ice: { type: "colour", def: "#a8dcff", label: "Ice" },
    edge: { type: "colour", def: "#e8f8ff", label: "Ice edge" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), r1 = shaderEnchRing1(S), r2 = shaderEnchRing2(S);
    const dith = S.lt(shaderWxBayer(S, 1), S.div(S.mul(A, 16), 100));
    const glint = S.lt(S.mod(S.sub(S.add(S.sub(S.x, S.y), 512), S.div(S.mul(S.frame, 24), S.FRAMES)), 24), 2);
    return S.pick([
      [S.and(S.gt(A, 0), r2, dith), S.sel(glint, S.rgba(255, 255, 255, 255), S.p("edge"))],
      [S.and(S.gt(A, 0), r1), S.sel(glint, S.p("edge"), S.p("ice"))],
      [S.and(S.gt(A, 0), S.solid(c), glint), shaderPaintMix(S, c, S.p("edge"), 60)],
      [S.solid(c), shaderPaintMix(S, c, S.p("ice"), S.div(A, 2))],
    ], c);
  },
};

SHADER_DEFS.gbc = {
  label: "Game Boy Color", title: "a Game Boy Color: 15-bit color, each 8 x 8 tile limited to four shades between its darkest and brightest",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["game boy color", "gbc", "handheld", "8-bit", "retro", "nintendo-like", "1998", "15-bit", "pocket", "tile"],
  params: {
    cell: { type: "int", min: 2, max: 8, def: 8, label: "Tile (px)" },
    shades: { type: "int", min: 2, max: 4, def: 4, label: "Colors a tile" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("cell"), N = S.p("shades");
    const q5 = function (q) { const f = function (v) { return S.div(S.mul(S.div(S.add(S.mul(v, 31), 127), 255), 255), 31); }; return S.rgba(f(S.r(q)), f(S.g(q)), f(S.b(q)), 255); };
    const bx = S.mul(S.div(S.x, K), K), by = S.mul(S.div(S.y, K), K), e = S.sub(K, 1), m = S.div(K, 2);
    let dark = c, light = c;
    for (const [px, py] of [[0, 0], [e, 0], [0, e], [e, e], [m, m], [m, 0], [0, m]]) {
      const p = S.texAt(S.add(bx, px), S.add(by, py), "clamp");
      dark = S.sel(S.and(S.solid(p), S.lt(S.luma(p), S.luma(dark))), p, dark);
      light = S.sel(S.and(S.solid(p), S.gt(S.luma(p), S.luma(light))), p, light);
    }
    // this pixel's step between the tile's two ends, by brightness
    const ld = S.luma(dark), span = S.max(S.sub(S.luma(light), ld), 1), k = S.clamp(S.div(S.add(S.mul(S.sub(S.luma(c), ld), S.sub(N, 1)), S.div(span, 2)), span), 0, S.sub(N, 1));
    return S.sel(S.solid(c), q5(S.mixc(dark, light, k, S.max(S.sub(N, 1), 1))), c);
  },
};

SHADER_DEFS.ambermonitor = {
  label: "Amber monitor", title: "an old monochrome monitor: a few steps of amber (or green) phosphor, dim scan lines, a faint roll",
  group: "Eras and display", kind: "both", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["amber", "monochrome", "monitor", "terminal", "green screen", "phosphor", "crt", "retro", "dos", "1980s"],
  params: {
    phosphor: { type: "colour", def: "#ffb000", label: "Phosphor" },
    steps: { type: "int", min: 2, max: 8, def: 4, label: "Brightness steps" },
    scan: { type: "int", min: 0, max: 80, def: 35, label: "Scan line dimming (%)" },
    roll: { type: "int", min: 0, max: 40, def: 12, label: "Roll band (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), N = S.p("steps"), k = S.div(S.mul(S.luma(c), N), 256);
    const lit = S.div(S.mul(S.add(k, S.sel(S.gt(k, 0), 1, 0)), 100), S.add(N, 1));
    const by = S.div(S.mul(S.frame, S.h), S.FRAMES), band = S.lt(S.mod(S.add(S.sub(S.y, by), S.h), S.max(S.h, 1)), S.max(S.div(S.h, 6), 1));
    const dim = S.add(S.sel(S.eq(S.mod(S.y, 2), 1), S.p("scan"), 0), S.sel(band, S.neg(S.p("roll")), 0));
    const out = shaderPaintShade(S, shaderPaintMix(S, S.rgba(10, 6, 2, 255), S.p("phosphor"), lit), S.sub(100, dim), 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.swirlout = {
  label: "Swirl out", title: "the screen twists into a whirlpool, tighter at the middle, then dithers away to the cover",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    twist: { type: "int", min: 30, max: 720, def: 360, label: "Twist at the end (degrees)" },
    turn: { type: "int", min: 0, max: 1, def: 0, label: "Turns", choices: ["clockwise", "counterclockwise"] },
  },
  fragment: function (S) {
    const p = S.progress(), K = shaderUiClock(S), R = S.add(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 1);
    // the twist grows with progress squared and falls off from the middle out
    const tw = S.div(S.mul(S.mul(S.p("twist"), S.mul(p, p)), S.max(S.sub(R, K.d2), 0)), S.mul(10000, R));
    const a = S.sel(S.eq(S.p("turn"), 0), S.neg(tw), tw), cs = shaderMotionCos(S, a), sn = shaderMotionSin(S, a);
    const X = S.sub(S.x, S.div(S.w, 2)), Y = S.sub(S.y, S.div(S.h, 2));
    const q = S.texAt(S.add(S.div(S.w, 2), S.div(S.sub(S.mul(X, cs), S.mul(Y, sn)), 1000)), S.add(S.div(S.h, 2), S.div(S.add(S.mul(X, sn), S.mul(Y, cs)), 1000)), "clamp");
    const out = S.lt(S.div(S.mul(shaderWxBayer(S, 1), 100), 16), S.div(S.mul(S.max(S.sub(p, 55), 0), 100), 45));
    return S.sel(out, S.p("cover"), q);
  },
};

SHADER_DEFS.pagecurl = {
  label: "Page curl", title: "the screen peels away like a page from one corner, its back showing in the curl, the cover beneath",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    back: { type: "colour", def: "#f2ece0", label: "Back of the page" },
    curl: { type: "int", min: 2, max: 12, def: 6, label: "Curl width (px)" },
    from: { type: "int", min: 0, max: 1, def: 0, label: "Peels from", choices: ["the bottom right", "the bottom left"] },
  },
  fragment: function (S) {
    const p = S.progress(), W = S.p("curl"), xx = S.sel(S.eq(S.p("from"), 0), S.x, S.sub(S.sub(S.w, 1), S.x));
    // the fold line x + y = L sweeps from past the far corner to the near one
    const L = S.div(S.mul(S.add(S.w, S.h), S.sub(100, p)), 100), u = S.add(xx, S.y);
    const curled = S.and(S.gt(p, 0), S.ge(u, S.sub(L, W)), S.lt(u, L)), shadow = S.and(S.gt(p, 0), S.ge(u, S.sub(L, S.add(W, 2))), S.lt(u, S.sub(L, W)));
    // the page's back: the picture mirrored across the fold, faint through the paper
    const mx = S.sub(L, S.y), my = S.sub(L, xx), q = S.texAt(S.sel(S.eq(S.p("from"), 0), mx, S.sub(S.sub(S.w, 1), mx)), my, "clamp");
    const shade = S.sub(100, S.div(S.mul(S.sub(L, u), 30), S.max(W, 1)));
    return S.pick([
      [S.ge(u, L), S.p("cover")],
      [curled, shaderPaintShade(S, shaderPaintMix(S, q, S.p("back"), 80), shade, 0)],
      [shadow, shaderPaintShade(S, S.tex(0, 0), 70, 0)],
    ], S.tex(0, 0));
  },
};

SHADER_DEFS.mirror = {
  label: "Mirror", title: "one half of the screen mirrored onto the other (or a quarter onto all four), for symmetric scenes",
  group: "Looks", kind: "screen", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["mirror", "symmetry", "reflect", "flip", "kaleidoscope", "tool", "pattern", "rorschach", "tile", "background"],
  params: {
    mode: { type: "int", min: 0, max: 4, def: 0, label: "Mirrors", choices: ["left onto right", "right onto left", "top onto bottom", "bottom onto top", "top left onto all four"] },
  },
  fragment: function (S) {
    const M = S.p("mode"), rx = S.sub(S.sub(S.w, 1), S.x), ry = S.sub(S.sub(S.h, 1), S.y);
    const right = S.ge(S.mul(S.x, 2), S.w), low = S.ge(S.mul(S.y, 2), S.h);
    const sx = S.pick([[S.eq(M, 0), S.sel(right, rx, S.x)], [S.eq(M, 1), S.sel(right, S.x, rx)], [S.eq(M, 4), S.sel(right, rx, S.x)]], S.x);
    const sy = S.pick([[S.eq(M, 2), S.sel(low, ry, S.y)], [S.eq(M, 3), S.sel(low, S.y, ry)], [S.eq(M, 4), S.sel(low, ry, S.y)]], S.y);
    return S.texAt(sx, sy, "clamp");
  },
};

SHADER_DEFS.repeat = {
  label: "Repeat", title: "the screen shrunk and repeated in a grid of 2 x 2 up to 4 x 4, for patterns and previews",
  group: "Looks", kind: "screen", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["repeat", "tile", "grid", "pattern", "preview", "wallpaper", "tool", "seamless", "shrink", "mosaic"],
  params: {
    times: { type: "int", min: 2, max: 4, def: 2, label: "Repeats each way" },
    alternate: { type: "int", min: 0, max: 1, def: 0, label: "Copies", choices: ["all the same", "every other one mirrored"] },
  },
  fragment: function (S) {
    const N = S.p("times"), ux = S.mod(S.mul(S.x, N), S.w), uy = S.mod(S.mul(S.y, N), S.h);
    const ix = S.div(S.mul(S.x, N), S.max(S.w, 1)), iy = S.div(S.mul(S.y, N), S.max(S.h, 1)), fl = S.eq(S.p("alternate"), 1);
    const sx = S.sel(S.and(fl, S.eq(S.mod(ix, 2), 1)), S.sub(S.sub(S.w, 1), ux), ux), sy = S.sel(S.and(fl, S.eq(S.mod(iy, 2), 1)), S.sub(S.sub(S.h, 1), uy), uy);
    return S.texAt(sx, sy, "clamp");
  },
};

SHADER_DEFS.scrolltile.variants = [{ dir: 3, laps: 2 }, { dir: 4 }];
SHADER_DEFS.watertile.variants = [{ sway: 2, waves: 1, depth: 50 }, { sway: 1, waves: 4, tint: "#3ab88a", depth: 15 }];
SHADER_DEFS.lavatile.variants = [{ above: 60, flow: 2 }, { above: 170, flow: 0, glow: "#3affb0", hot: "#e8fff8", crust: "#0a1a2a" }];
SHADER_DEFS.copperbars.variants = [{ bars: 6, thick: 3 }, { bars: 2, thick: 12, blend: 50 }];
SHADER_DEFS.plasma.variants = [{ scale: 1, blend: 100 }, { scale: 4, blend: 40, colors: ["#0a1a2a", "#1a5a8a", "#3ac8e0", "#e8ffff", "#3ac8e0", "#1a5a8a"] }];
SHADER_DEFS.rotozoom.variants = [{ turns: 2, zoom: 80 }, { turns: 0, zoom: 70 }];
SHADER_DEFS.tunnel.variants = [{ depth: 6, spin: 1 }, { depth: 40, spin: 2, dark: 40 }];
SHADER_DEFS.demofire.variants = [{ height: 90 }, { height: 25, flames: ["#04103a", "#1a40c0", "#3aa0ff", "#c0f0ff"], blend: 70 }];
SHADER_DEFS.iceblock.variants = [{ amount: 100 }, { amount: 35, ice: "#c8b0ff", edge: "#f4ecff" }];
SHADER_DEFS.gbc.variants = [{ cell: 4 }, { shades: 2 }];
SHADER_DEFS.ambermonitor.variants = [{ phosphor: "#33ff66" }, { phosphor: "#e8f0ff", steps: 8, scan: 0, roll: 30 }];
SHADER_DEFS.swirlout.variants = [{ twist: 720 }, { twist: 90, turn: 1, cover: "#ffffff" }];
SHADER_DEFS.pagecurl.variants = [{ from: 1, curl: 12 }, { curl: 2, back: "#c8a070" }];
SHADER_DEFS.mirror.variants = [{ mode: 2 }, { mode: 4 }];
SHADER_DEFS.repeat.variants = [{ times: 4 }, { times: 3, alternate: 1 }];

// ---- Moods, more demoscene, more tiles, outlines and shadows ----
// ======================================================================================================================
// A mood recolor (eight times of day and states, by brightness); five more demoscene classics (a dot tunnel, a parallax
// star scroller, metaballs, moire rings, an infinite checker floor); three more seamless tiles (swaying, a waterfall,
// glints); two transitions (blocks exploding apart, static taking over); and five for a sprite or a picture (a rainbow
// outline, a double outline, a long flat shadow, a roving spotlight, hexagonal pixels). Private helpers shaderMd*;
// earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("mood", "dottunnel", "starscroll", "metaballs", "moire", "infinitefloor", "swaytile", "waterfall", "glinttile",
  "explode", "staticcut", "rainbowoutline", "doubleoutline", "longshadow", "spotlit", "hexpixel");

// the eight moods' four-color ramps, dark to light, as one flat list per channel (mood x 4 + step)
const SHADER_MD_MOODS = ["#2a1a3a", "#8a3a5a", "#f08a6a", "#ffe0b0", "#1a2a3a", "#4a7a5a", "#c8d87a", "#fffbe0", "#1a0a2a", "#5a1a5a", "#d0503a", "#ffb85a",
  "#050a1a", "#1a2a5a", "#4a6a9a", "#c8d8f0", "#2a1a0a", "#6a4a2a", "#b8946a", "#f4e4c0", "#0a1a0a", "#2a5a1a", "#7ac83a", "#e0ff9a",
  "#0a1a3a", "#3a6aa8", "#8ac8f0", "#f0faff", "#1a0000", "#6a0a0a", "#e03a0a", "#ffd84a"];
const SHADER_MD_CH = [0, 1, 2].map(function (k) { return SHADER_MD_MOODS.map(function (h) { return parseInt(h.slice(1 + k * 2, 3 + k * 2), 16); }); });
// the pixel is within `r` (Chebyshev) of (px, py)
function shaderMdNear(S, px, py, r) { return S.and(S.le(S.abs(S.sub(S.x, px)), r), S.le(S.abs(S.sub(S.y, py)), r)); }

SHADER_DEFS.mood = {
  label: "Mood", title: "the picture recolored by brightness into a mood: dawn, noon, dusk, night, sepia, poison, frozen or infernal",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["mood", "time of day", "night", "dusk", "dawn", "sepia", "recolor", "palette swap", "grade", "atmosphere"],
  params: {
    mood: { type: "int", min: 0, max: 7, def: 2, label: "Mood", choices: ["dawn", "noon", "dusk", "night", "sepia", "poison", "frozen", "infernal"] },
    amount: { type: "int", min: 0, max: 100, def: 80, label: "Amount (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), seg = S.div(S.mul(S.luma(c), 48), 256), i = S.div(seg, 16);
    const step = S.min(S.add(i, S.sel(S.gt(S.mod(seg, 16), shaderWxBayer(S, 1)), 1, 0)), 3), at = S.add(S.mul(S.p("mood"), 4), step);
    const col = S.rgba(S.table(SHADER_MD_CH[0], at), S.table(SHADER_MD_CH[1], at), S.table(SHADER_MD_CH[2], at), 255);
    return S.sel(S.solid(c), shaderPaintMix(S, c, col, S.p("amount")), c);
  },
};

SHADER_DEFS.dottunnel = {
  label: "Dot tunnel", title: "the demoscene's dot tunnel: rings of dots rushing toward you down a winding tube",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["dot tunnel", "demoscene", "tunnel", "dots", "rings", "retro", "intro", "flying", "3d", "vector"],
  params: {
    dots: { type: "int", min: 4, max: 16, def: 12, label: "Dots a ring" },
    dark: { type: "int", min: 0, max: 100, def: 70, label: "Darken the screen (%)" },
    colors: { type: "palette", def: ["#3ac8ff", "#7a5aff", "#ff5ac8", "#ffd84a"], max: 6, label: "Ring colors" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), N = S.p("dots"), n = S.palCount("colors"), Rm = S.max(S.div(S.max(S.w, S.h), 2), 4);
    let out = shaderPaintMix(S, c, S.rgba(0, 0, 4, 255), S.p("dark"));
    for (let k = 0; k < 6; k++) {
      // ring k's distance in 0..999 grows over the loop; its radius with distance squared; the tube winds with it
      const ph = S.mod(S.add(S.div(S.mul(S.frame, 1000), S.FRAMES), k * 166), 1000), r = S.div(S.mul(S.mul(ph, ph), Rm), 1000000);
      const wob = shaderMotionSin(S, S.add(S.div(ph, 3), S.div(S.mul(S.frame, 360), S.FRAMES)));
      const cx = S.add(S.div(S.w, 2), S.div(S.mul(S.mul(wob, S.div(S.w, 8)), S.sub(1000, ph)), 1000000)), cy = S.div(S.h, 2);
      const size = S.sel(S.gt(ph, 650), 1, 0), col = S.palAt("colors", S.mod(k, n));
      let hit = S.lt(1, 0);
      for (let j = 0; j < 16; j++) {
        const a = S.div(j * 360, N), on = S.lt(j, N);
        const px = S.add(cx, S.div(S.mul(r, shaderMotionCos(S, a)), 1000)), py = S.add(cy, S.div(S.mul(r, shaderMotionSin(S, a)), 1000));
        hit = S.or(hit, S.and(on, shaderMdNear(S, px, py, size)));
      }
      out = S.sel(S.and(S.gt(ph, 120), hit), col, out);
    }
    return out;
  },
};

SHADER_DEFS.starscroll = {
  label: "Star scroller", title: "three layers of stars scrolling sideways at different speeds, the near ones brighter, wrapping round",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["stars", "parallax", "scroll", "space", "shmup", "demoscene", "starfield", "background", "retro", "shooter"],
  params: {
    stars: { type: "int", min: 0, max: 100, def: 35, label: "Stars (%)" },
    dir: { type: "int", min: 0, max: 1, def: 0, label: "Flies", choices: ["to the left", "to the right"] },
    dark: { type: "int", min: 0, max: 100, def: 60, label: "Darken the screen (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), back = S.eq(S.p("dir"), 1);
    let out = shaderPaintMix(S, c, S.rgba(0, 0, 8, 255), S.p("dark"));
    const layers = [[1, 7, 90, 1401], [2, 5, 160, 1402], [4, 4, 255, 1403]];
    for (const [speed, P, lum, salt] of layers) {
      // layer stars on a P px grid, the layer moving `speed` screen widths a loop (so it wraps cleanly)
      const sh = S.div(S.mul(S.mul(S.frame, speed), S.w), S.FRAMES), xs = S.mod(S.add(S.sel(back, S.sub(S.x, sh), S.add(S.x, sh)), S.mul(S.w, 8)), S.max(S.w, 1));
      const h = S.hash(S.div(xs, P), S.div(S.y, P), salt), on = S.lt(S.mod(h, 100), S.p("stars"));
      const star = S.and(on, S.eq(S.mod(xs, P), S.mod(S.div(h, 100), P)), S.eq(S.mod(S.y, P), S.mod(S.div(h, 1000), P)));
      out = S.sel(star, S.rgba(lum, lum, S.min(S.add(lum, 30), 255), 255), out);
    }
    return out;
  },
};

SHADER_DEFS.metaballs = {
  label: "Metaballs", title: "the demoscene's metaballs: soft blobs drifting round the screen, merging where they meet, rimmed in light",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["metaballs", "blobs", "demoscene", "lava lamp", "goo", "slime", "retro", "intro", "organic", "merge"],
  params: {
    balls: { type: "int", min: 2, max: 5, def: 4, label: "Blobs" },
    size: { type: "int", min: 3, max: 16, def: 7, label: "Blob size (px)" },
    blob: { type: "colour", def: "#ff4aa8", label: "Blobs" },
    rim: { type: "colour", def: "#ffd0ec", label: "Rims" },
    blend: { type: "int", min: 0, max: 100, def: 85, label: "Over the picture (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), R = S.p("size"), t = S.div(S.mul(S.frame, 360), S.FRAMES), R2 = S.mul(S.mul(R, R), 1000);
    let field = S.i(0);
    const paths = [[1, 2, 0], [2, 1, 90], [1, 3, 200], [3, 1, 300], [2, 3, 45]];
    for (let k = 0; k < 5; k++) {
      // blob k on a Lissajous path (whole turns a loop, so it closes)
      const [a, b, ph] = paths[k];
      const bx = S.add(S.div(S.w, 2), S.div(S.mul(shaderMotionSin(S, S.add(S.mul(t, a), ph)), S.div(S.w, 3)), 1000));
      const by = S.add(S.div(S.h, 2), S.div(S.mul(shaderMotionCos(S, S.add(S.mul(t, b), ph)), S.div(S.h, 3)), 1000));
      const dx = S.sub(S.x, bx), dy = S.sub(S.y, by), f = S.div(R2, S.add(S.add(S.mul(dx, dx), S.mul(dy, dy)), 1));
      field = S.add(field, S.sel(S.lt(k, S.p("balls")), S.min(f, 4000), 0));
    }
    return S.pick([[S.ge(field, 1000), shaderPaintMix(S, c, S.p("blob"), S.p("blend"))], [S.ge(field, 780), shaderPaintMix(S, c, S.p("rim"), S.p("blend"))]], c);
  },
};

SHADER_DEFS.moire = {
  label: "Moire", title: "moire interference: two sets of rings drifting round each other, their crossings flickering into patterns",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["moire", "interference", "rings", "op art", "demoscene", "psychedelic", "hypnotic", "pattern", "retro", "trippy"],
  params: {
    ring: { type: "int", min: 2, max: 8, def: 3, label: "Ring spacing (px)" },
    ink: { type: "colour", def: "#000000", label: "Ink" },
    depth: { type: "int", min: 0, max: 100, def: 55, label: "Strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), G = S.p("ring"), t = S.div(S.mul(S.frame, 360), S.FRAMES);
    const ring = function (ph) {
      const cx = S.add(S.div(S.w, 2), S.div(S.mul(shaderMotionCos(S, S.add(t, ph)), S.div(S.w, 4)), 1000)), cy = S.add(S.div(S.h, 2), S.div(S.mul(shaderMotionSin(S, S.add(t, ph)), S.div(S.h, 4)), 1000));
      const dx = S.sub(S.x, cx), dy = S.sub(S.y, cy);
      return S.mod(S.div(shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy))), G), 2);
    };
    return S.sel(S.eq(S.mod(S.add(ring(0), ring(180)), 2), 1), shaderPaintMix(S, c, S.p("ink"), S.p("depth")), c);
  },
};

SHADER_DEFS.infinitefloor = {
  label: "Infinite floor", title: "the demoscene's endless checkerboard floor, rushing toward you below the horizon, fading into the distance",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["checkerboard", "floor", "mode 7", "perspective", "demoscene", "retro", "synthwave", "grid", "outrun", "horizon"],
  params: {
    horizon: { type: "int", min: 10, max: 90, def: 50, label: "Horizon (% down)" },
    one: { type: "colour", def: "#ff3ab4", label: "Squares" },
    two: { type: "colour", def: "#1a0a3a", label: "Between" },
    fog: { type: "colour", def: "#ffb0e0", label: "Far away" },
    square: { type: "int", min: 1, max: 4, def: 2, label: "Square size" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), hz = S.div(S.mul(S.p("horizon"), S.h), 100), dy = S.sub(S.y, hz), Q = S.mul(S.p("square"), 32);
    // depth 1 / dy; across scales with depth; the floor moves two squares a loop
    const z = S.div(4096, S.max(dy, 1)), u = S.div(S.mul(S.sub(S.mul(S.x, 2), S.w), z), 64);
    const v = S.add(z, S.div(S.mul(S.frame, S.mul(Q, 2)), S.FRAMES));
    const odd = S.eq(S.mod(S.add(S.div(S.add(u, 1 << 20), Q), S.div(v, Q)), 2), 1);
    const far = S.max(S.sub(100, S.div(S.mul(dy, 400), S.max(S.sub(S.h, hz), 1))), 0);
    return S.sel(S.gt(dy, 0), shaderPaintMix(S, S.sel(odd, S.p("one"), S.p("two")), S.p("fog"), far), c);
  },
};

SHADER_DEFS.swaytile = {
  label: "Swaying tile", title: "a tile's top swaying side to side in the wind (grass, reeds, banners), its foot still, wrapping across",
  group: "World", kind: "screen", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["sway", "grass", "wind", "tile", "seamless", "reeds", "foliage", "banner", "animated", "terrain"],
  params: {
    sway: { type: "int", min: 1, max: 4, def: 2, label: "Sway at the top (px)" },
    waves: { type: "int", min: 1, max: 4, def: 1, label: "Waves across the tile" },
  },
  fragment: function (S) {
    const s = shaderMotionSin(S, S.add(shaderDmWave(S, S.x, S.p("waves"), S.w), S.div(S.mul(S.frame, 360), S.FRAMES)));
    const dx = S.div(S.mul(S.mul(s, S.p("sway")), S.sub(S.h, S.y)), S.mul(S.max(S.h, 1), 1000));
    return S.texAt(S.sub(S.x, dx), S.y, "wrap");
  },
};

SHADER_DEFS.waterfall = {
  label: "Waterfall", title: "a tile pouring down as a waterfall: its picture falling two tiles a loop, tinted, streaked with foam",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["waterfall", "falls", "water", "tile", "seamless", "cascade", "river", "animated", "terrain", "foam"],
  params: {
    tint: { type: "colour", def: "#3a9ae8", label: "Water" },
    depth: { type: "int", min: 0, max: 100, def: 40, label: "Tint (%)" },
    foam: { type: "colour", def: "#f0faff", label: "Foam" },
    streaks: { type: "int", min: 0, max: 100, def: 35, label: "Foam streaks (%)" },
  },
  fragment: function (S) {
    const q = S.texAt(S.x, S.sub(S.y, S.div(S.mul(S.mul(S.frame, 2), S.h), S.FRAMES)), "wrap");
    // foam dashes in some columns, a quarter tile long, falling a tile a loop (half a tile apart, so it closes)
    const P = S.max(S.div(S.h, 2), 2), h = S.hash(S.x, 6, 1411), on = S.lt(S.mod(h, 100), S.p("streaks"));
    const yy = S.mod(S.sub(S.add(S.y, S.mul(P, 64)), S.add(S.div(S.mul(S.frame, S.h), S.FRAMES), S.div(h, 100))), P);
    return S.sel(S.and(on, S.lt(yy, S.max(S.div(P, 2), 1))), S.p("foam"), shaderPaintMix(S, q, S.p("tint"), S.p("depth")));
  },
};

SHADER_DEFS.glinttile = {
  label: "Glinting tile", title: "a tile's brightest pixels twinkling now and then (gems, sand, snow, ice), a little star at each peak",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0],
  tags: ["glint", "sparkle", "tile", "seamless", "gems", "sand", "snow", "ice", "twinkle", "treasure"],
  params: {
    above: { type: "int", min: 0, max: 254, def: 150, label: "Glints above (brightness)" },
    often: { type: "int", min: 1, max: 50, def: 10, label: "Glinting pixels (%)" },
    glint: { type: "colour", def: "#ffffff", label: "Glint" },
  },
  fragment: function (S) {
    const T = S.p("above");
    const peak = function (dx, dy) {
      const q = S.texAt(S.add(S.x, dx), S.add(S.y, dy), "wrap"), h = S.hash(S.mod(S.add(S.add(S.x, dx), S.w), S.max(S.w, 1)), S.mod(S.add(S.add(S.y, dy), S.h), S.max(S.h, 1)), 1421);
      return { on: S.and(S.gt(S.luma(q), T), S.lt(S.mod(h, 100), S.p("often"))), ph: S.mod(S.add(S.div(h, 100), S.frame), 16) };
    };
    const me = peak(0, 0), arms = [peak(1, 0), peak(-1, 0), peak(0, 1), peak(0, -1)];
    const star = S.or(...arms.map(function (a) { return S.and(a.on, S.eq(a.ph, 0)); }));
    return S.pick([[S.and(me.on, S.lt(me.ph, 2)), S.p("glint")], [star, shaderPaintMix(S, S.tex(0, 0), S.p("glint"), 60)]], S.tex(0, 0));
  },
};

SHADER_DEFS.explode = {
  label: "Explode", title: "the screen bursts into blocks flying apart from a point, gaps opening between them, then dithers to the cover",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    block: { type: "int", min: 2, max: 16, def: 4, label: "Block (px)" },
    spread: { type: "int", min: 50, max: 400, def: 200, label: "How far they fly (%)" },
    cx: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    cy: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
  },
  fragment: function (S) {
    const p = S.progress(), B = S.p("block"), px = S.div(S.mul(S.p("cx"), S.sub(S.w, 1)), 100), py = S.div(S.mul(S.p("cy"), S.sub(S.h, 1)), 100);
    // every block's corner moves out from the point by (100 + e) / 100; find the block that lands here
    const e = S.add(100, S.div(S.mul(S.mul(p, p), S.p("spread")), 10000));
    const ax = function (v, c0) {
      const s = S.add(c0, S.div(S.mul(S.sub(v, c0), 100), e)), b0 = S.mul(S.div(s, B), B), o = S.add(c0, S.div(S.mul(S.sub(b0, c0), e), 100));
      return { src: S.add(b0, S.sub(v, o)), ok: S.and(S.ge(S.sub(v, o), 0), S.lt(S.sub(v, o), B)) };
    };
    const X = ax(S.x, px), Y = ax(S.y, py);
    const fade = S.lt(S.div(S.mul(shaderWxBayer(S, 1), 100), 16), S.div(S.mul(S.max(S.sub(p, 50), 0), 100), 50));
    return S.sel(S.and(X.ok, Y.ok, S.not(fade)), S.texAt(X.src, Y.src, "clamp"), S.p("cover"));
  },
};

SHADER_DEFS.staticcut = {
  label: "Static cut", title: "the picture breaks up into TV static, the snow thickening and tearing, then dithers to the cover",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    tear: { type: "int", min: 0, max: 8, def: 4, label: "Tearing (px)" },
  },
  fragment: function (S) {
    const p = S.progress(), J = S.div(S.mul(S.p("tear"), p), 100);
    const off = S.sub(S.mod(S.hash(S.y, S.frame, 1431), S.add(S.mul(J, 2), 1)), J), q = S.texAt(S.add(S.x, off), S.y, "clamp");
    const g = S.mod(S.hash(S.x, S.y, S.add(S.frame, 1432)), 256);
    const noisy = shaderPaintMix(S, q, S.rgba(g, g, g, 255), S.min(S.div(S.mul(p, 100), 70), 100));
    const out = S.lt(S.div(S.mul(shaderWxBayer(S, 1), 100), 16), S.div(S.mul(S.max(S.sub(p, 70), 0), 100), 30));
    return S.pick([[S.eq(p, 0), S.tex(0, 0)], [out, S.p("cover")]], noisy);
  },
};

SHADER_DEFS.rainbowoutline = {
  label: "Rainbow outline", title: "an outline of the palette's colors running round the sprite like a marquee, one or two pixels thick",
  group: "Items", kind: "sprite", frames: 16, fps: 12, pad: [2, 2, 2, 2],
  tags: ["rainbow", "outline", "selected", "highlight", "marquee", "pride", "ui", "rgb", "gaming", "glow"],
  params: {
    colors: { type: "palette", def: ["#ff3a3a", "#ff9a2a", "#ffe84a", "#4ae05a", "#3a8cff", "#8a5aff"], max: 8, label: "Colors" },
    thick: { type: "int", min: 1, max: 2, def: 1, label: "Thickness (px)" },
    laps: { type: "int", min: 1, max: 4, def: 1, label: "Colors round the sprite (times)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), n = S.palCount("colors"), run = S.mul(n, 16);
    const ph = S.add(S.div(S.mul(S.mul(K.a, run), S.p("laps")), 360), S.div(S.mul(S.frame, run), S.FRAMES));
    const on = S.or(shaderEnchRing1(S), S.and(S.eq(S.p("thick"), 2), shaderEnchRing2(S)));
    return S.sel(on, shaderDmCycle(S, "colors", ph), c);
  },
};

SHADER_DEFS.doubleoutline = {
  label: "Double outline", title: "two outlines round the sprite, an inner and an outer color, for stickers, badges and readable icons",
  group: "Items", kind: "sprite", frames: 1, fps: 1, pad: [2, 2, 2, 2],
  tags: ["outline", "double", "sticker", "badge", "border", "icon", "ui", "readable", "contour", "cutout"],
  params: {
    inner: { type: "colour", def: "#1a1a24", label: "Inner" },
    outer: { type: "colour", def: "#ffffff", label: "Outer" },
    corners: { type: "int", min: 0, max: 1, def: 1, label: "Outer corners", choices: ["square", "rounded"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), r1 = shaderEnchRing1(S);
    const diag = S.or(S.solid(S.tex(1, 1)), S.solid(S.tex(-1, 1)), S.solid(S.tex(1, -1)), S.solid(S.tex(-1, -1)));
    const rounded = S.and(shaderEnchRing2(S), S.not(S.and(diag, S.not(S.or(S.solid(S.tex(2, 0)), S.solid(S.tex(-2, 0)), S.solid(S.tex(0, 2)), S.solid(S.tex(0, -2)))))));
    // square (build 42): every pixel within a 5 x 5 square of the sprite, so a diagonal edge gets a squared outer line too (it
    // differed from rounded only at a sharp 90-degree corner, which pixel art rarely has: the knob seemed to do nothing)
    const far = [];
    for (const [dx, dy] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) far.push(S.solid(S.tex(dx, dy)));
    const square = S.and(S.not(S.solid(c)), S.not(r1), S.or(shaderEnchRing2(S), ...far));
    const r2 = S.sel(S.eq(S.p("corners"), 0), square, rounded);
    return S.pick([[r1, S.p("inner")], [r2, S.p("outer")]], c);
  },
};

SHADER_DEFS.longshadow = {
  label: "Long shadow", title: "flat design's long shadow: the sprite's silhouette stretched out diagonally behind it, solid or fading",
  group: "Sprite FX", kind: "sprite", frames: 1, fps: 1, pad: [0, 8, 8, 8],
  tags: ["long shadow", "flat design", "shadow", "icon", "ui", "material", "cast", "poster", "badge", "depth"],
  params: {
    reach: { type: "int", min: 2, max: 8, def: 6, label: "Length (px)" },
    toward: { type: "int", min: 0, max: 1, def: 0, label: "Falls toward", choices: ["the bottom right", "the bottom left"] },
    shadow: { type: "colour", def: "#1a1428", label: "Shadow" },
    fade: { type: "int", min: 0, max: 1, def: 0, label: "Shadow", choices: ["solid", "fading out"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), L = S.p("reach"), left = S.eq(S.p("toward"), 1);
    let k = S.i(0);
    for (let i = 8; i >= 1; i--) {
      const q = S.texAt(S.sel(left, S.add(S.x, i), S.sub(S.x, i)), S.sub(S.y, i), "clear");
      k = S.sel(S.and(S.le(i, L), S.solid(q)), i, k);
    }
    const drop = S.and(S.eq(S.p("fade"), 1), S.ge(S.div(S.mul(k, 16), S.add(L, 1)), S.add(shaderWxBayer(S, 1), 1)));
    return S.sel(S.and(S.not(S.solid(c)), S.gt(k, 0), S.not(drop)), S.p("shadow"), c);
  },
};

SHADER_DEFS.spotlit = {
  label: "Spotlit", title: "a spotlight roving over the sprite: inside it lit and warm, outside it sunk into shade, its edge dithered",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["spotlight", "spotlit", "stage", "light", "search", "torch", "dark", "focus", "theater", "reveal"],
  params: {
    size: { type: "int", min: 10, max: 80, def: 35, label: "Spot size (% of the image)" },
    dark: { type: "int", min: 0, max: 100, def: 60, label: "Shade (%)" },
    night: { type: "colour", def: "#0a0a1e", label: "Shade" },
    lamp: { type: "colour", def: "#fff2c8", label: "Light" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 360), S.FRAMES);
    const sx = S.add(S.div(S.w, 2), S.div(S.mul(shaderMotionSin(S, t), S.div(S.w, 3)), 1000)), sy = S.add(S.div(S.h, 2), S.div(S.mul(shaderMotionSin(S, S.mul(t, 2)), S.div(S.h, 4)), 1000));
    const R = S.max(S.div(S.mul(S.p("size"), S.min(S.w, S.h)), 100), 2), dx = S.sub(S.x, sx), dy = S.sub(S.y, sy), d = shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy)));
    const inside = S.lt(d, R), edge = S.and(S.lt(d, S.add(R, 2)), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    const out = S.pick([[inside, shaderPaintMix(S, c, S.p("lamp"), 20)], [edge, shaderPaintMix(S, c, S.p("night"), S.div(S.p("dark"), 2))]], shaderPaintMix(S, c, S.p("night"), S.p("dark")));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.hexpixel = {
  label: "Hex pixels", title: "the picture pixelated into hexagons instead of squares, each one the color at its middle",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["hexagon", "hex", "pixelate", "honeycomb", "mosaic", "board game", "strategy", "grid", "cells", "tiles"],
  params: {
    hex: { type: "int", min: 3, max: 12, def: 5, label: "Hex size (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("hex"), H = S.max(S.div(S.mul(W, 7), 8), 2);
    // rows of hexagons, every other one shifted half a width: the nearest of this row's and the row above's centers
    const cand = function (r) {
      const off = S.mul(S.mod(r, 2), S.div(W, 2)), col = S.div(S.add(S.sub(S.x, off), S.mul(W, 64)), W);
      return { x: S.add(S.add(S.sub(S.mul(col, W), S.mul(W, 64)), off), S.div(W, 2)), y: S.add(S.mul(r, H), S.div(H, 2)) };
    };
    const r0 = S.div(S.y, H), A = cand(r0), Bc = cand(S.sub(r0, 1)), Cc = cand(S.add(r0, 1));
    const dist = function (q) { const dx = S.sub(S.x, q.x), dy = S.sub(S.y, q.y); return S.add(S.mul(dx, dx), S.div(S.mul(S.mul(dy, dy), 4), 3)); };
    const dA = dist(A), dB = dist(Bc), dC = dist(Cc);
    const bx = S.pick([[S.and(S.le(dB, dA), S.le(dB, dC)), Bc.x], [S.le(dC, dA), Cc.x]], A.x), by = S.pick([[S.and(S.le(dB, dA), S.le(dB, dC)), Bc.y], [S.le(dC, dA), Cc.y]], A.y);
    const q = S.texAt(bx, by, "clamp");
    return S.sel(S.solid(c), S.sel(S.solid(q), q, c), c);
  },
};

SHADER_DEFS.mood.variants = [{ mood: 3 }, { mood: 4 }, { mood: 5, amount: 60 }, { mood: 7, amount: 100 }];
SHADER_DEFS.dottunnel.variants = [{ dots: 16, dark: 90 }, { dots: 6, colors: ["#ffffff"] }];
SHADER_DEFS.starscroll.variants = [{ stars: 80, dark: 90 }, { stars: 15, dir: 1 }];
SHADER_DEFS.metaballs.variants = [{ balls: 5, size: 10 }, { balls: 2, size: 5, blob: "#3affb0", rim: "#e0fff4" }];
SHADER_DEFS.moire.variants = [{ ring: 2, depth: 90 }, { ring: 6, ink: "#ffffff" }];
SHADER_DEFS.infinitefloor.variants = [{ horizon: 30, square: 1 }, { horizon: 70, one: "#3ae0ff", two: "#0a1a2a", fog: "#c0f0ff", square: 4 }];
SHADER_DEFS.swaytile.variants = [{ sway: 4, waves: 2 }, { sway: 1, waves: 4 }];
SHADER_DEFS.waterfall.variants = [{ depth: 70, streaks: 70 }, { tint: "#ff7a2a", foam: "#ffe8a0", depth: 55 }];
SHADER_DEFS.glinttile.variants = [{ above: 90, often: 30 }, { above: 200, often: 5, glint: "#c8f0ff" }];
SHADER_DEFS.explode.variants = [{ block: 2, spread: 400 }, { block: 12, spread: 80, cx: 20, cy: 80, cover: "#ffffff" }];
SHADER_DEFS.staticcut.variants = [{ tear: 8 }, { tear: 0, cover: "#1a1a2a" }];
SHADER_DEFS.rainbowoutline.variants = [{ thick: 2, laps: 2 }, { colors: ["#ffd84a", "#ffffff", "#ff8a3a"], laps: 4 }];
SHADER_DEFS.doubleoutline.variants = [{ inner: "#ffffff", outer: "#1a1a24" }, { corners: 0, inner: "#ff3a6a", outer: "#ffe0ea" }];
SHADER_DEFS.longshadow.variants = [{ reach: 8, fade: 1 }, { toward: 1, reach: 3, shadow: "#3a2a5a" }];
SHADER_DEFS.spotlit.variants = [{ size: 60, dark: 80 }, { size: 20, dark: 40, lamp: "#c8e8ff" }];
SHADER_DEFS.hexpixel.variants = [{ hex: 3 }, { hex: 10 }];

// ---- Five more transitions, team colors, photo looks, a broken screen ----
// ======================================================================================================================
// Five transitions (slats, bars dropping, the screen split in four, spinning away, tiles shrinking); four for a sprite
// (a team-color swap, collected, wispy as a ghost, pulsing rings); five photographic and drawn looks (chalkboard,
// infrared, lomo, tilt-shift, cyanotype); and two for the screen (a broken screen, an RGB shake). Private helpers
// shaderTx*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("slats", "barsdrop", "quadsplit", "spinout", "tileshrink", "teamcolor", "collect", "wispy", "pulserings",
  "chalkboard", "infrared", "lomo", "tiltshift", "cyanotype", "brokenscreen", "rgbshake");

// the dither-out over the last part of a transition: true once a 4 x 4 Bayer cell's turn has come (from `from` % on)
function shaderTxFade(S, p, from) {
  return S.lt(S.div(S.mul(shaderWxBayer(S, 1), 100), 16), S.div(S.mul(S.max(S.sub(p, from), 0), 100), 100 - from));
}
// a clear pixel exactly k px (Chebyshev) from the sprite, for k = 3: something solid at distance 3 and nothing nearer
function shaderTxRing3(S) {
  const far = [];
  for (let d = -3; d <= 3; d++) { far.push(S.solid(S.tex(d, -3)), S.solid(S.tex(d, 3))); if (d > -3 && d < 3) far.push(S.solid(S.tex(-3, d)), S.solid(S.tex(3, d))); }
  return S.and(S.not(S.solid(S.tex(0, 0))), S.not(shaderEnchRing1(S)), S.not(shaderEnchRing2(S)), S.not(S.solid(S.tex(2, 2))), S.not(S.solid(S.tex(-2, 2))),
    S.not(S.solid(S.tex(2, -2))), S.not(S.solid(S.tex(-2, -2))), S.or(...far));
}

SHADER_DEFS.slats = {
  label: "Slats", title: "vertical slats close from each slat's middle outward, like shutters swinging shut",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    slat: { type: "int", min: 2, max: 32, def: 8, label: "Slat width (px)" },
    across: { type: "int", min: 0, max: 1, def: 0, label: "Slats", choices: ["upright", "lying across"] },
  },
  fragment: function (S) {
    const B = S.p("slat"), v = S.sel(S.eq(S.p("across"), 0), S.x, S.y);
    const f2 = S.abs(S.sub(S.add(S.mul(S.mod(v, B), 2), 1), B));                 // 0 at a slat's middle .. B - 1 at its edges
    return S.sel(S.lt(S.mul(f2, 100), S.mul(S.progress(), B)), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.barsdrop = {
  label: "Bars drop", title: "bars of the cover drop in from the top one after another and stack up until the screen is full",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    bar: { type: "int", min: 2, max: 16, def: 4, label: "Bar height (px)" },
    edge: { type: "colour", def: "#3a3a4a", label: "Bar edges" },
  },
  fragment: function (S) {
    const p = S.progress(), B = S.p("bar"), n = S.max(S.div(S.add(S.h, S.sub(B, 1)), B), 1);
    // bar s (0 first) falls during the s-th of n equal slices of the progress, landing in row n - 1 - s from the top
    const sl = S.min(S.div(S.mul(p, n), 100), S.sub(n, 1)), t = S.sub(S.mul(p, n), S.mul(sl, 100)), row = S.sub(S.sub(n, 1), sl);
    const top = S.div(S.mul(S.mul(row, B), S.mul(t, t)), 10000);                    // eased in from the top
    const landed = S.ge(S.y, S.mul(S.add(row, 1), B)), inBar = S.and(S.gt(p, 0), S.ge(S.y, top), S.lt(S.y, S.add(top, B)));
    const isEdge = S.eq(S.mod(S.y, B), S.sub(B, 1));
    return S.pick([[S.eq(p, 100), S.p("cover")], [S.and(S.gt(p, 0), landed, isEdge), S.p("edge")], [S.and(S.gt(p, 0), landed), S.p("cover")], [inBar, S.p("cover")]], S.tex(0, 0));
  },
};

SHADER_DEFS.quadsplit = {
  label: "Quad split", title: "the screen splits into four quarters that slide away to its corners, the cover behind",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    ease: { type: "int", min: 0, max: 1, def: 0, label: "Speed", choices: ["eases in", "steady"] },
  },
  fragment: function (S) {
    const p = S.progress(), t = S.sel(S.eq(S.p("ease"), 0), S.div(S.mul(p, p), 100), p);
    const right = S.ge(S.mul(S.x, 2), S.w), low = S.ge(S.mul(S.y, 2), S.h);
    const ox = S.div(S.mul(t, S.add(S.div(S.w, 2), 1)), 100), oy = S.div(S.mul(t, S.add(S.div(S.h, 2), 1)), 100);
    const sx = S.sel(right, S.sub(S.x, ox), S.add(S.x, ox)), sy = S.sel(low, S.sub(S.y, oy), S.add(S.y, oy));
    // a quarter only shows its own pixels: one that has slid past the middle is gone
    const same = function (a, b) { return S.or(S.and(a, b), S.and(S.not(a), S.not(b))); };
    const own = S.and(same(S.ge(S.mul(sx, 2), S.w), right), same(S.ge(S.mul(sy, 2), S.h), low), S.ge(sx, 0), S.lt(sx, S.w), S.ge(sy, 0), S.lt(sy, S.h));
    return S.sel(S.and(own, S.lt(p, 100)), S.texAt(sx, sy, "clamp"), S.p("cover"));
  },
};

SHADER_DEFS.spinout = {
  label: "Spin out", title: "the screen spins away into the distance, turning and shrinking to nothing in the middle",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    turns: { type: "int", min: 0, max: 3, def: 1, label: "Turns" },
  },
  fragment: function (S) {
    const p = S.progress(), a = S.div(S.mul(S.mul(p, 360), S.p("turns")), 100), cs = shaderMotionCos(S, a), sn = shaderMotionSin(S, a);
    const k = S.max(S.sub(100, p), 0), X = S.sub(S.x, S.div(S.w, 2)), Y = S.sub(S.y, S.div(S.h, 2));
    // the source of this pixel: turned back and scaled up by 100 / k
    const u = S.add(S.div(S.w, 2), S.div(S.div(S.add(S.mul(X, cs), S.mul(Y, sn)), 10), S.max(k, 1)));
    const v = S.add(S.div(S.h, 2), S.div(S.div(S.sub(S.mul(Y, cs), S.mul(X, sn)), 10), S.max(k, 1)));
    const inside = S.and(S.gt(k, 0), S.ge(u, 0), S.lt(u, S.w), S.ge(v, 0), S.lt(v, S.h));
    return S.sel(inside, S.texAt(u, v, "clamp"), S.p("cover"));
  },
};

SHADER_DEFS.tileshrink = {
  label: "Tile shrink", title: "the screen in tiles, each shrinking toward its middle until only the cover is left, in a wave or at random",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    tile: { type: "int", min: 4, max: 24, def: 8, label: "Tile (px)" },
    order: { type: "int", min: 0, max: 2, def: 1, label: "Order", choices: ["all at once", "a wave across", "at random"] },
    spread: { type: "int", min: 0, max: 200, def: 80, label: "Spread" },
  },
  fragment: function (S) {
    const p = S.progress(), T = S.p("tile"), tx = S.div(S.x, T), ty = S.div(S.y, T), O = S.p("order"), sp = S.p("spread");
    const nx = S.max(S.div(S.add(S.w, S.sub(T, 1)), T), 1);
    const rank = S.pick([[S.eq(O, 0), 0], [S.eq(O, 1), S.div(S.mul(tx, 100), nx)]], S.mod(S.hash(tx, ty, 1501), 100));
    const q = S.clamp(S.sub(S.div(S.mul(p, S.add(100, sp)), 100), S.div(S.mul(rank, sp), 100)), 0, 100), k = S.sub(100, q);
    // the tile's picture scaled by k / 100 about its middle (half px)
    const fx2 = S.sub(S.add(S.mul(S.mod(S.x, T), 2), 1), T), fy2 = S.sub(S.add(S.mul(S.mod(S.y, T), 2), 1), T);
    const inside = S.and(S.lt(S.mul(S.abs(fx2), 100), S.mul(T, k)), S.lt(S.mul(S.abs(fy2), 100), S.mul(T, k)));
    const sx = S.add(S.mul(tx, T), S.div(S.add(S.div(S.mul(fx2, 100), S.max(k, 1)), T), 2)), sy = S.add(S.mul(ty, T), S.div(S.add(S.div(S.mul(fy2, 100), S.max(k, 1)), T), 2));
    return S.pick([[S.eq(q, 0), S.tex(0, 0)], [S.and(S.gt(k, 0), inside), S.texAt(sx, sy, "clamp")]], S.p("cover"));
  },
};

SHADER_DEFS.teamcolor = {
  label: "Team color", title: "a team-color swap: pixels near a key color (grays by default, or a mask color like magenta) repainted in a team's color, keeping their shading",
  group: "Sprite FX", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["team color", "palette swap", "player color", "faction", "recolor", "rts", "multiplayer", "mask", "tool", "key"],
  params: {
    key: { type: "colour", def: "#7a7a7a", label: "Key color (gray by default: armor and metal; magenta for a mask)" },
    team: { type: "colour", def: "#2a8cff", label: "Team color" },
    near: { type: "int", min: 0, max: 255, def: 50, label: "How near to the key (hue and saturation)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("key"), l = S.luma(c), lk = S.luma(K);
    // compare colors with their brightness taken out, so every shade of the key matches
    const ch = function (f) { return S.abs(S.sub(S.sub(f(c), l), S.sub(f(K), lk))); };
    const d = S.add(S.add(ch(S.r), ch(S.g)), ch(S.b)), match = S.and(S.solid(c), S.lt(d, S.p("near")));
    const T = S.p("team"), lt = S.luma(T), sh = S.sub(l, lt);
    return S.sel(match, shaderTkRgb(S, S.add(S.r(T), sh), S.add(S.g(T), sh), S.add(S.b(T), sh)), c);
  },
};

SHADER_DEFS.collect = {
  label: "Collect", title: "a pickup being collected: a bright flash, a ring of sparkles bursting out of it, the sprite blinking away",
  group: "Items", kind: "sprite", palette: "free", frames: 16, fps: 16, pad: [3, 3, 3, 3],
  tags: ["collect", "pickup", "coin", "get", "loot", "reward", "flash", "sparkle", "item", "vanish"],
  params: {
    flash: { type: "colour", def: "#ffffff", label: "Flash" },
    sparkle: { type: "colour", def: "#ffe066", label: "Sparkles" },
    gone: { type: "int", min: 0, max: 1, def: 0, label: "After", choices: ["blinks away", "stays"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), f = S.div(S.mul(S.frame, 16), S.FRAMES);
    const flash = S.and(S.solid(c), S.lt(f, 3));
    // sparkles walk outward through the rings: ring 1 at frames 2-3, ring 2 at 4-5, ring 3 at 6-7
    const sp = S.eq(S.mod(S.add(S.x, S.y), 2), 0);
    const spark = S.and(sp, S.or(S.and(S.ge(f, 2), S.lt(f, 4), shaderEnchRing1(S)), S.and(S.ge(f, 4), S.lt(f, 6), shaderEnchRing2(S)), S.and(S.ge(f, 6), S.lt(f, 8), shaderTxRing3(S))));
    const blink = S.and(S.eq(S.p("gone"), 0), S.solid(c), S.ge(f, 8), S.or(S.ge(f, 12), S.eq(S.mod(f, 2), 1)));
    return S.pick([[spark, S.p("sparkle")], [flash, S.p("flash")], [blink, S.clear]], c);
  },
};

SHADER_DEFS.wispy = {
  label: "Wispy", title: "a ghost's wispy end: the sprite dissolving toward its foot into trailing wisps that sway",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["wispy", "ghost", "spirit", "phantom", "fade", "dissolve", "floating", "spooky", "undead", "spectral"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 45, label: "Amount (% of the height)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Wisps" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), start = S.sub(S.h, S.div(S.mul(A, S.h), 100));
    // below the start line the sprite thins out downward; wisps sway a pixel on a slow wave
    const into = S.sub(S.y, start), sway = S.div(shaderMotionSin(S, S.add(S.mul(S.y, 30), S.div(S.mul(S.frame, 360), S.FRAMES))), 700);
    const q = S.texAt(S.add(S.x, S.sel(S.ge(into, 0), sway, 0)), S.y, "clear");
    const keep = S.div(S.mul(S.max(into, 0), 100), S.max(S.sub(S.h, start), 1));
    const n = shaderPaintNoise(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 3, S.add(S.mul(S.p("seed"), 4), 1511));
    const gone = S.and(S.gt(A, 0), S.ge(into, 0), S.lt(S.div(S.mul(n, 100), 255), keep));
    return S.sel(S.and(S.solid(c), S.solid(q), S.not(gone)), q, S.clear);
  },
};

SHADER_DEFS.pulserings = {
  label: "Pulse rings", title: "rings of the sprite's outline pulsing outward from it, one after another, fading as they go",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 12, fps: 12, pad: [3, 3, 3, 3],
  tags: ["pulse", "rings", "ripple", "radar", "ping", "aura", "selected", "signal", "beacon", "highlight"],
  params: {
    ring: { type: "colour", def: "#5ae0ff", label: "Rings" },
    fade: { type: "int", min: 0, max: 100, def: 60, label: "Fading (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), f = S.div(S.mul(S.frame, 12), S.FRAMES), R = S.p("ring"), fd = S.p("fade");
    // three rings a loop, each stepping out a pixel every frame for three frames
    const step = S.mod(f, 4);
    const r1 = S.and(S.eq(step, 0), shaderEnchRing1(S)), r2 = S.and(S.eq(step, 1), shaderEnchRing2(S)), r3 = S.and(S.eq(step, 2), shaderTxRing3(S));
    const d2 = S.lt(shaderWxBayer(S, 1), S.sub(16, S.div(S.mul(fd, 8), 100))), d3 = S.lt(shaderWxBayer(S, 1), S.sub(16, S.div(S.mul(fd, 14), 100)));
    return S.pick([[r1, R], [S.and(r2, d2), R], [S.and(r3, d3), R]], c);
  },
};

SHADER_DEFS.chalkboard = {
  label: "Chalkboard", title: "the picture drawn in chalk on a blackboard: light strokes for bright parts, dusty and broken, on dark green",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["chalkboard", "blackboard", "chalk", "school", "classroom", "sketch", "dusty", "teacher", "drawing", "greenboard"],
  params: {
    board: { type: "colour", def: "#24382c", label: "Board" },
    chalk: { type: "colour", def: "#eef0e6", label: "Chalk" },
    dust: { type: "int", min: 0, max: 60, def: 25, label: "Broken strokes (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Chalk" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1521);
    // chalk density by brightness, in diagonal strokes; the edges always chalked
    const v = S.luma(c), stroke = S.lt(S.mod(S.hash(S.div(S.add(S.x, S.y), 2), S.div(S.sub(S.x, S.y), 3), sd), 100), S.sub(100, S.p("dust")));
    const rim = S.and(S.solid(c), shaderPaintRim(S));
    const t = S.sel(rim, 85, S.div(S.mul(v, 90), 255)), lv = S.sel(stroke, t, S.div(t, 3));
    const out = shaderPaintMix(S, S.p("board"), S.p("chalk"), lv);
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.infrared = {
  label: "Infrared", title: "an infrared photograph: foliage glowing white, skies and water dark, a pink-and-cream false color",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["infrared", "ir", "false color", "photo", "surreal", "aerochrome", "foliage", "dreamy", "film", "pink"],
  params: {
    glow: { type: "colour", def: "#ffe8f0", label: "Bright (foliage)" },
    deep: { type: "colour", def: "#3a1a3a", label: "Dark (sky, water)" },
    green: { type: "int", min: 0, max: 200, def: 120, label: "How much green glows (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0);
    // near infrared reads foliage bright and blue dark: weight green up, blue down
    const v = S.clamp(S.div(S.add(S.add(S.mul(S.r(c), 40), S.mul(S.g(c), S.p("green"))), S.mul(S.b(c), -30)), 130), 0, 255);
    return S.sel(S.solid(c), shaderPaintMix(S, S.p("deep"), S.p("glow"), S.div(S.mul(v, 100), 255)), c);
  },
};

SHADER_DEFS.lomo = {
  label: "Lomo", title: "a toy-camera lomo look: punchy colors, a cross-processed tint, and dark corners",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["lomo", "toy camera", "holga", "vignette", "cross process", "analog", "film", "photo", "retro", "saturated"],
  params: {
    punch: { type: "int", min: 100, max: 220, def: 150, label: "Saturation (%)" },
    tint: { type: "colour", def: "#c8ff6a", label: "Cross-process tint" },
    toning: { type: "int", min: 0, max: 50, def: 15, label: "Tint (%)" },
    corners: { type: "int", min: 0, max: 100, def: 55, label: "Dark corners (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S);
    const ex = S.div(S.mul(K.X2, 1000), S.max(S.w, 1)), ey = S.div(S.mul(K.Y2, 1000), S.max(S.h, 1)), r = shaderPaintSqrt(S, S.add(S.mul(ex, ex), S.mul(ey, ey)));
    const v = S.div(S.mul(S.clamp(S.sub(r, 550), 0, 864), S.p("corners")), 864);
    const lv = shaderUiSteps(S, v), pp = shaderPaintPunch(S, c, S.p("punch")), punchy = shaderPaintMix(S, shaderTkRgb(S, S.r(pp), S.g(pp), S.b(pp)), S.p("tint"), S.p("toning"));
    return S.sel(S.solid(c), shaderPaintShade(S, punchy, S.sub(100, S.mul(lv, 22)), 0), c);
  },
};

SHADER_DEFS.tiltshift = {
  label: "Tilt-shift", title: "a tilt-shift miniature: a sharp band across the middle, the top and bottom chunkier with distance, colors boosted",
  group: "Looks", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["tilt-shift", "miniature", "diorama", "toy", "model", "focus", "photo", "tiny", "city", "lens"],
  params: {
    focus: { type: "int", min: 10, max: 90, def: 55, label: "Sharp band at (% down)" },
    band: { type: "int", min: 5, max: 60, def: 25, label: "Sharp band height (%)" },
    chunk: { type: "int", min: 2, max: 6, def: 4, label: "Coarsest blocks (px)" },
    punch: { type: "int", min: 100, max: 200, def: 135, label: "Saturation (%)" },
  },
  fragment: function (S) {
    const fy = S.div(S.mul(S.p("focus"), S.h), 100), half = S.div(S.mul(S.p("band"), S.h), 200);
    const off = S.max(S.sub(S.abs(S.sub(S.y, fy)), half), 0), span = S.max(S.sub(S.h, half), 1);
    // the block size grows with distance from the sharp band, 1 to the coarsest
    const B = S.add(1, S.div(S.mul(off, S.sub(S.p("chunk"), 1)), S.max(S.div(span, 2), 1)));
    const Bc = S.min(B, S.p("chunk")), q = shaderOldCell(S, Bc, Bc);
    const pq = shaderPaintPunch(S, q, S.p("punch"));
    return shaderTkRgb(S, S.r(pq), S.g(pq), S.b(pq));
  },
};

SHADER_DEFS.cyanotype = {
  label: "Cyanotype", title: "a cyanotype print: the picture in Prussian blue on paper, its lightest parts the bare paper, a little uneven",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["cyanotype", "blueprint", "sun print", "photo", "prussian blue", "vintage", "botanical", "print", "monochrome", "darkroom"],
  params: {
    ink: { type: "colour", def: "#163a6a", label: "Prussian blue" },
    paper: { type: "colour", def: "#eef2ec", label: "Paper" },
    steps: { type: "int", min: 2, max: 8, def: 5, label: "Tones" },
    uneven: { type: "int", min: 0, max: 60, def: 20, label: "Uneven coating" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), N = S.p("steps");
    const l = S.clamp(S.add(S.luma(c), S.div(S.mul(S.sub(shaderPaintNoise(S, S.x, S.y, 6, 1531), 128), S.p("uneven")), 100)), 0, 255);
    const k = S.div(S.mul(l, N), 256), t = S.div(S.mul(k, 100), S.max(S.sub(N, 1), 1));
    return S.sel(S.solid(c), shaderPaintMix(S, S.p("ink"), S.p("paper"), S.min(t, 100)), c);
  },
};

SHADER_DEFS.brokenscreen = {
  label: "Broken screen", title: "the screen cracked from a point of impact: cracks across the glass, the shards a pixel out of line",
  group: "World", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["broken screen", "cracked", "glass", "shattered", "impact", "damage", "phone", "fourth wall", "game over", "glitch"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 35, label: "Impact across (%)" },
    down: { type: "int", min: 0, max: 100, def: 40, label: "Impact down (%)" },
    lines: { type: "int", min: 4, max: 16, def: 9, label: "Cracks" },
    crack: { type: "colour", def: "#f4f8ff", label: "Cracks" },
    shift: { type: "int", min: 0, max: 2, def: 1, label: "Shards out of line (px)" },
  },
  fragment: function (S) {
    const L = S.p("lines"), P = shaderWxPolar(S, S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("down"), S.sub(S.h, 1)), 100));
    const sector = S.div(360, L), wob = S.div(S.mul(S.sub(shaderPaintNoise(S, S.x, S.y, 5, 1541), 128), sector), 600);
    const a = S.mod(S.add(S.add(P.ang, wob), 720), 360), shard = S.div(a, sector), off = S.mod(a, sector);
    const line = S.lt(S.mul(S.min(off, S.sub(sector, off)), S.max(P.d, 1)), 34);
    // two rings of cracks round the impact; each shard (a wedge between rings) shifted its own way
    const ringN = S.div(P.d, S.max(S.div(S.max(S.w, S.h), 4), 2)), ringLine = S.and(S.eq(S.mod(P.d, S.max(S.div(S.max(S.w, S.h), 4), 2)), 0), S.lt(ringN, 3));
    const h = S.hash(shard, ringN, 1542), M = S.p("shift");
    const dx = S.sub(S.mod(h, S.add(S.mul(M, 2), 1)), M), dy = S.sub(S.mod(S.div(h, 7), S.add(S.mul(M, 2), 1)), M);
    const q = S.texAt(S.add(S.x, dx), S.add(S.y, dy), "clamp"), centre = S.le(P.d, 1);
    return S.sel(S.or(line, ringLine, centre), S.p("crack"), shaderPaintShade(S, q, S.sub(100, S.mul(S.mod(h, 3), 4)), 0));
  },
};

SHADER_DEFS.rgbshake = {
  label: "RGB shake", title: "the screen jolting on a hit: shaken a few pixels, its red and blue knocked apart, settling over the loop",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 24, pad: [0, 0, 0, 0],
  tags: ["shake", "rgb split", "hit", "impact", "screen shake", "juice", "damage", "chromatic", "jolt", "camera"],
  params: {
    power: { type: "int", min: 1, max: 6, def: 3, label: "Jolt (px)" },
    split: { type: "int", min: 0, max: 4, def: 2, label: "Color split (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Shake" },
  },
  fragment: function (S) {
    const f = S.div(S.mul(S.frame, 16), S.FRAMES), sd = S.add(S.mul(S.p("seed"), 4), 1551);
    // the jolt dies away over the first half of the loop; the second half is still
    const k = S.max(S.sub(8, f), 0), J = S.div(S.add(S.mul(S.p("power"), k), 7), 8), sp = S.div(S.add(S.mul(S.p("split"), k), 7), 8);
    const h = S.hash(S.frame, 1, sd), dx = S.sub(S.mod(h, S.add(S.mul(J, 2), 1)), J), dy = S.sub(S.mod(S.div(h, 13), S.add(S.mul(J, 2), 1)), J);
    const x0 = S.add(S.x, dx), y0 = S.add(S.y, dy);
    const cr = S.texAt(S.add(x0, sp), y0, "clamp"), cg = S.texAt(x0, y0, "clamp"), cb = S.texAt(S.sub(x0, sp), y0, "clamp");
    return S.rgba(S.r(cr), S.g(cg), S.b(cb), S.a(cg));
  },
};

SHADER_DEFS.slats.variants = [{ slat: 4 }, { slat: 16, across: 1, cover: "#ffffff" }];
SHADER_DEFS.barsdrop.variants = [{ bar: 2 }, { bar: 12, cover: "#1a1a3a", edge: "#5a5a8a" }];
SHADER_DEFS.quadsplit.variants = [{ ease: 1 }, { cover: "#ffffff" }];
SHADER_DEFS.spinout.variants = [{ turns: 3 }, { turns: 0, cover: "#ffffff" }];
SHADER_DEFS.tileshrink.variants = [{ order: 0, tile: 4 }, { order: 2, tile: 16, spread: 200, cover: "#1a0a2a" }];
SHADER_DEFS.teamcolor.variants = [{ team: "#e83a3a" }, { team: "#3ac85a", near: 160 }, { key: "#ff00ff", team: "#ffd84a", near: 120 }];
SHADER_DEFS.collect.variants = [{ gone: 1 }, { flash: "#c8f0ff", sparkle: "#7ae0ff" }];
SHADER_DEFS.wispy.variants = [{ amount: 80 }, { amount: 20, seed: 4 }];
SHADER_DEFS.pulserings.variants = [{ fade: 0 }, { ring: "#ff5aa8", fade: 100 }];
SHADER_DEFS.chalkboard.variants = [{ dust: 50 }, { board: "#1a1a1e", chalk: "#ffe8f0", dust: 5 }];
SHADER_DEFS.infrared.variants = [{ green: 200 }, { glow: "#ffffff", deep: "#000000", green: 80 }];
SHADER_DEFS.lomo.variants = [{ punch: 220, corners: 90 }, { tint: "#ffb07a", toning: 30, corners: 20 }];
SHADER_DEFS.tiltshift.variants = [{ focus: 70, band: 15, chunk: 6 }, { focus: 40, band: 40, chunk: 2 }];
SHADER_DEFS.cyanotype.variants = [{ steps: 2, uneven: 40 }, { ink: "#5a2a14", paper: "#f4e8d0", steps: 8 }];
SHADER_DEFS.brokenscreen.variants = [{ lines: 16, shift: 2 }, { across: 80, down: 70, lines: 5, crack: "#202020", shift: 0 }];
SHADER_DEFS.rgbshake.variants = [{ power: 6, split: 4 }, { power: 1, split: 0 }];

// ---- Fur, print crafts, festival skies, HUD bits, two more transitions ----
// ======================================================================================================================
// Fur on a sprite; four print and craft looks (a rubber stamp, pop art, braille, letterpress); things in the sky
// (petals, lanterns, a flock); HUD and menu pieces (an ECG line, a loading spinner, a sonar ping, a sunburst, scrolling
// menu checks); two transitions (folding up like an accordion, a sparkling wipe). Private helpers shaderFe*; earlier
// helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("furry", "rubberstamp", "popart", "braille", "letterpress", "petals", "lanterns", "flock", "ecg", "spinner",
  "sonar", "sunburst", "menuchecks", "accordion", "magicwipe");

// the four pop-art palettes, three colors each (dark, mid, light), as per-channel tables (quarter x 3 + level)
const SHADER_FE_POP = ["#1a1a6a", "#ff3a8a", "#ffe84a", "#0a3a1a", "#ff8a1a", "#7affe0", "#5a0a3a", "#3ac8ff", "#fff0a0", "#3a1a0a", "#a03aff", "#aaff4a"];
const SHADER_FE_POPCH = [0, 1, 2].map(function (k) { return SHADER_FE_POP.map(function (h) { return parseInt(h.slice(1 + k * 2, 3 + k * 2), 16); }); });
// a small falling (or rising) particle field: one particle in some P px cells, the field moving `per` px a loop
// (a multiple of P) in y, offset by `dx` across; true where a particle is
function shaderFeField(S, P, rows, pct, salt, dx, dy) {
  const x = S.add(S.add(S.x, dx), S.mul(P, 64)), y = S.add(S.add(S.y, dy), S.mul(P, 64));
  const h = S.hash(S.div(x, P), S.mod(S.div(y, P), rows), salt);
  return { on: S.and(S.lt(S.mod(h, 100), pct), S.eq(S.mod(x, P), S.mod(S.div(h, 100), P)), S.eq(S.mod(y, P), S.mod(S.div(h, 1000), P))), h: h };
}

SHADER_DEFS.furry = {
  label: "Furry", title: "fur on the sprite: tufts of its own colors sprouting a pixel or two off its edges, rustling, the tips lighter",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 6, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["fur", "furry", "fluffy", "hairy", "fuzzy", "plush", "beast", "wool", "cozy", "creature"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 55, label: "Amount (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Tufts" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1601);
    // the nearest solid neighbor's color: the fur is that
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
    let col = S.tex(dirs[dirs.length - 1][0], dirs[dirs.length - 1][1]);
    for (let i = dirs.length - 2; i >= 0; i--) { const q = S.tex(dirs[i][0], dirs[i][1]); col = S.sel(S.solid(q), q, col); }
    // tufts rustle every four frames
    const h = S.mod(S.hash(S.x, S.y, S.add(sd, S.div(S.frame, 4))), 100);
    const r1 = shaderEnchRing1(S), r2 = shaderEnchRing2(S);
    const tuft = S.and(S.gt(A, 0), S.or(S.and(r1, S.lt(h, A)), S.and(r2, S.lt(h, S.div(A, 3)))));
    const tip = S.and(S.solid(c), S.gt(A, 0), shaderPaintRim(S), S.lt(h, S.div(A, 2)));
    return S.pick([[tuft, shaderPaintShade(S, col, S.sel(r2, 115, 95), 0)], [tip, shaderPaintShade(S, c, 115, 8)]], c);
  },
};

SHADER_DEFS.rubberstamp = {
  label: "Rubber stamp", title: "the picture stamped in one ink: its dark parts inked, worn through in patches where the rubber missed",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["rubber stamp", "stamp", "ink", "approved", "postmark", "grunge", "office", "seal", "worn", "print"],
  params: {
    ink: { type: "colour", def: "#c8283a", label: "Ink" },
    paper: { type: "colour", def: "#f2ead8", label: "Paper" },
    level: { type: "int", min: 0, max: 255, def: 140, label: "Ink below (brightness)" },
    wear: { type: "int", min: 0, max: 100, def: 30, label: "Wear (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Wear" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1611);
    const worn = S.gt(S.add(shaderPaintNoise(S, S.x, S.y, 3, sd), S.div(S.mod(S.hash(S.x, S.y, sd), 60), 2)), S.sub(285, S.div(S.mul(S.p("wear"), 15), 10)));
    const inked = S.and(S.lt(S.luma(c), S.p("level")), S.not(worn));
    return S.sel(S.solid(c), S.sel(inked, S.p("ink"), S.p("paper")), c);
  },
};

SHADER_DEFS.popart = {
  label: "Pop art", title: "pop art: the screen four times over in a grid, each copy posterized in its own loud colors",
  group: "Looks", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["pop art", "warhol", "screen print", "posterize", "grid", "loud", "60s", "silkscreen", "poster", "four-up"],
  params: {
    levels: { type: "int", min: 2, max: 3, def: 3, label: "Colors a copy" },
    shift: { type: "int", min: 0, max: 3, def: 0, label: "Turn the palettes round" },
  },
  fragment: function (S) {
    const sx = S.mod(S.mul(S.x, 2), S.max(S.w, 1)), sy = S.mod(S.mul(S.y, 2), S.max(S.h, 1)), q = S.texAt(sx, sy, "clamp");
    const quad = S.mod(S.add(S.add(S.div(S.mul(S.x, 2), S.max(S.w, 1)), S.mul(S.div(S.mul(S.y, 2), S.max(S.h, 1)), 2)), S.p("shift")), 4);
    const N = S.p("levels"), lv = S.div(S.mul(S.luma(q), N), 256), k = S.sel(S.eq(N, 2), S.mul(lv, 2), lv), at = S.add(S.mul(quad, 3), k);
    return S.rgba(S.table(SHADER_FE_POPCH[0], at), S.table(SHADER_FE_POPCH[1], at), S.table(SHADER_FE_POPCH[2], at), 255);
  },
};

SHADER_DEFS.braille = {
  label: "Braille dots", title: "the picture as braille-style dot cells: two columns of four dots a cell, each raised where the picture is dark",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["braille", "dots", "terminal", "text art", "unicode", "cells", "tactile", "ascii", "minimal", "dot art"],
  params: {
    ink: { type: "colour", def: "#e8f0ff", label: "Dots" },
    paper: { type: "colour", def: "#101420", label: "Background" },
    level: { type: "int", min: 0, max: 255, def: 120, label: "Dot where brighter than" },
    invert: { type: "int", min: 0, max: 1, def: 0, label: "Dots", choices: ["where it is bright", "where it is dark"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), dot = S.and(S.eq(S.mod(S.x, 2), 0), S.eq(S.mod(S.y, 2), 0));
    // each dot reads the picture at its own place; between dots is the background
    const bright = S.gt(S.luma(c), S.p("level")), on = S.and(dot, S.sel(S.eq(S.p("invert"), 0), bright, S.not(bright)));
    return S.sel(S.solid(c), S.sel(on, S.p("ink"), S.p("paper")), c);
  },
};

SHADER_DEFS.letterpress = {
  label: "Letterpress", title: "letterpress: the picture's dark parts inked and pressed into thick paper, a shadow inside each top edge, a highlight under each",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["letterpress", "deboss", "press", "print", "paper", "stationery", "invitation", "card", "ink", "craft"],
  params: {
    ink: { type: "colour", def: "#2a3a6a", label: "Ink" },
    paper: { type: "colour", def: "#f6f0e4", label: "Paper" },
    level: { type: "int", min: 0, max: 255, def: 130, label: "Ink below (brightness)" },
    depth: { type: "int", min: 0, max: 100, def: 35, label: "Press depth (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), L = S.p("level"), D = S.p("depth");
    const inkAt = function (dx, dy) { const q = shaderLooksAt(S, dx, dy); return S.and(S.solid(q), S.lt(S.luma(q), L)); };
    const me = inkAt(0, 0), ul = inkAt(-1, -1);
    return S.sel(S.solid(c), S.pick([
      [S.and(me, S.not(ul)), shaderPaintShade(S, S.p("ink"), S.sub(100, D), 0)],
      [me, S.p("ink")],
      [S.and(S.not(me), ul), shaderPaintMix(S, S.p("paper"), S.rgba(255, 255, 255, 255), D)],
    ], S.p("paper")), c);
  },
};

SHADER_DEFS.petals = {
  label: "Petals", title: "cherry blossom petals drifting down across the scene, tumbling as they fall",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["petals", "cherry blossom", "sakura", "spring", "falling", "romance", "japan", "garden", "wind", "particles"],
  params: {
    petals: { type: "int", min: 0, max: 100, def: 40, label: "Petals (%)" },
    colors: { type: "palette", def: ["#ffc8dc", "#ffa8c8", "#fff0f4"], max: 6, label: "Petals" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Petals" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("colors"), sd = S.add(S.mul(S.p("seed"), 4), 1621);
    // the field falls 32 px a loop and sways 3 px either way; each petal is two pixels, across or down as it tumbles
    const fall = S.div(S.mul(S.frame, 32), S.FRAMES), drift = S.div(S.mul(shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), 3), 1000);
    const at = function (ox, oy) { return shaderFeField(S, 8, 4, S.p("petals"), sd, S.sub(ox, drift), S.sub(oy, fall)); };
    const me = at(0, 0), left = at(-1, 0), up = at(0, -1);
    const flat = function (f) { return S.eq(S.mod(S.add(S.div(S.frame, 4), S.div(f.h, 13)), 2), 0); };
    const hit = S.or(me.on, S.and(left.on, flat(left)), S.and(up.on, S.not(flat(up))));
    const hh = S.sel(me.on, me.h, S.sel(S.and(left.on, flat(left)), left.h, up.h));
    return S.sel(hit, S.palAt("colors", S.mod(S.div(hh, 7), n)), c);
  },
};

SHADER_DEFS.lanterns = {
  label: "Lanterns", title: "paper lanterns floating up into the night, each glowing and flickering softly",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["lanterns", "sky lanterns", "festival", "night", "glow", "celebration", "wish", "floating", "romance", "lights"],
  params: {
    lanterns: { type: "int", min: 0, max: 100, def: 35, label: "Lanterns (%)" },
    paper: { type: "colour", def: "#ffb04a", label: "Lantern" },
    glow: { type: "colour", def: "#ff7a2a", label: "Glow" },
    dark: { type: "int", min: 0, max: 100, def: 40, label: "Darken the sky (%)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Lanterns" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1631);
    // a lantern in some 9 x 12 cells, rising 36 px a loop (three cells), a 2 x 3 body with a dithered glow round it
    const rise = S.div(S.mul(S.frame, 36), S.FRAMES), x = S.add(S.x, 576), y = S.add(S.add(S.y, rise), 768);
    const h = S.hash(S.div(x, 9), S.mod(S.div(y, 12), 3), sd), on = S.lt(S.mod(h, 100), S.p("lanterns"));
    const fx = S.sub(S.mod(x, 9), S.add(2, S.mod(S.div(h, 100), 5))), fy = S.sub(S.mod(y, 12), S.add(3, S.mod(S.div(h, 1000), 6)));
    const body = S.and(on, S.ge(fx, 0), S.le(fx, 1), S.ge(fy, 0), S.le(fy, 2));
    const halo = S.and(on, S.ge(fx, -1), S.le(fx, 2), S.ge(fy, -1), S.le(fy, 3), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    const flick = S.eq(S.mod(S.add(S.div(h, 7), S.frame), 5), 0);
    const sky = shaderPaintMix(S, c, S.rgba(6, 4, 20, 255), S.p("dark"));
    return S.pick([[body, S.sel(flick, S.p("glow"), S.p("paper"))], [halo, shaderPaintMix(S, sky, S.p("glow"), 45)]], sky);
  },
};

SHADER_DEFS.flock = {
  label: "Flock", title: "a flock of birds (or bats) flapping across the sky, each at its own height, bobbing as it flies",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["birds", "bats", "flock", "sky", "flying", "ambient", "halloween", "seagulls", "wildlife", "silhouette"],
  params: {
    count: { type: "int", min: 1, max: 6, def: 5, label: "Flyers" },
    flyer: { type: "int", min: 0, max: 1, def: 0, label: "Flyers", choices: ["birds (wings up and down)", "bats (jagged, faster)"] },
    ink: { type: "colour", def: "#1a1a24", label: "Silhouettes" },
    sky: { type: "int", min: 10, max: 90, def: 50, label: "In the top (% of the screen)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Paths" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), bat = S.eq(S.p("flyer"), 1), sd = S.add(S.mul(S.p("seed"), 4), 1641), band = S.max(S.div(S.mul(S.p("sky"), S.h), 100), 3);
    let hit = S.lt(1, 0);
    for (let m = 0; m < 6; m++) {
      // flyer m crosses once a loop from its own start; wings beat every two frames (bats every frame)
      const hb = S.hash(m, 3, sd), px = S.sub(S.mod(S.add(S.div(S.mul(S.frame, S.add(S.w, 6)), S.FRAMES), S.mod(hb, S.add(S.w, 6))), S.add(S.w, 6)), 3);
      const py = S.add(S.add(1, S.mod(S.div(hb, 100), S.max(S.sub(band, 2), 1))), S.div(shaderMotionSin(S, S.add(S.mul(S.frame, 45), S.mod(hb, 360))), 700));
      const up = S.eq(S.mod(S.div(S.add(S.frame, m), S.sel(bat, 1, 2)), 2), 0), dx = S.sub(S.x, px), dy = S.sub(S.y, py);
      const body = S.and(S.eq(dx, 0), S.eq(dy, 0));
      const wing = S.and(S.eq(S.abs(dx), 1), S.eq(dy, S.sel(up, -1, S.sel(bat, 0, 1))));
      const tip = S.and(bat, S.eq(S.abs(dx), 2), S.eq(dy, S.sel(up, 0, -1)));
      hit = S.or(hit, S.and(S.lt(m, S.p("count")), S.or(body, wing, tip)));
    }
    return S.sel(hit, S.p("ink"), c);
  },
};

SHADER_DEFS.ecg = {
  label: "Heartbeat line", title: "a heart monitor's trace sweeping across the screen: flat, then a beat's spike, fading behind the sweep",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 16, pad: [0, 0, 0, 0],
  tags: ["ecg", "heartbeat", "monitor", "hospital", "pulse", "hud", "health", "vital signs", "medical", "line"],
  params: {
    height: { type: "int", min: 10, max: 90, def: 60, label: "Line at (% down)" },
    trace: { type: "colour", def: "#4aff7a", label: "Trace" },
    beat: { type: "int", min: 8, max: 64, def: 24, label: "Beat length (px)" },
    trail: { type: "int", min: 10, max: 100, def: 60, label: "Trail (% of the width)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), base = S.div(S.mul(S.p("height"), S.h), 100), B = S.p("beat"), amp = S.max(S.div(S.h, 4), 2);
    // a beat's shape in sixteen steps: flat, a small bump, the tall spike and its dip, a bump, flat
    const SHAPE = [0, 0, 0, -1, 0, 0, 2, -10, 6, 0, 0, -2, -2, 0, 0, 0];
    const yAt = function (x) { return S.add(base, S.div(S.mul(S.table(SHAPE, S.div(S.mul(S.mod(x, B), 16), B)), amp), 10)); };
    const y0 = yAt(S.x), y1 = yAt(S.add(S.x, 1)), lo = S.min(y0, y1), hi = S.max(y0, y1);
    const onLine = S.and(S.ge(S.y, lo), S.le(S.y, S.max(hi, lo)));
    // the sweep crosses once a loop; the trace is drawn behind it, fading
    const sweep = S.div(S.mul(S.frame, S.w), S.FRAMES), back = S.mod(S.add(S.sub(sweep, S.x), S.w), S.max(S.w, 1));
    const T = S.max(S.div(S.mul(S.p("trail"), S.w), 100), 1), age = S.div(S.mul(back, 100), T);
    const lit = S.and(onLine, S.lt(back, T)), head = S.and(onLine, S.lt(back, 2));
    return S.pick([[head, S.rgba(230, 255, 235, 255)], [lit, shaderPaintMix(S, S.p("trace"), c, S.min(age, 90))]], c);
  },
};

SHADER_DEFS.spinner = {
  label: "Loading spinner", title: "a loading spinner: a ring of dots, one lit dot running round it, the ones behind it dimming",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["loading", "spinner", "wait", "busy", "ui", "throbber", "progress", "hud", "menu", "indicator"],
  params: {
    dots: { type: "int", min: 4, max: 12, def: 8, label: "Dots" },
    radius: { type: "int", min: 3, max: 20, def: 7, label: "Ring radius (px)" },
    color: { type: "colour", def: "#ffffff", label: "Dots" },
    across: { type: "int", min: 0, max: 100, def: 50, label: "Across (%)" },
    down: { type: "int", min: 0, max: 100, def: 50, label: "Down (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), N = S.p("dots"), R = S.p("radius");
    const cx = S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), cy = S.div(S.mul(S.p("down"), S.sub(S.h, 1)), 100);
    const lead = S.mod(S.div(S.mul(S.frame, N), S.FRAMES), N);
    let out = c;
    for (let k = 0; k < 12; k++) {
      // dot k at k / N of a turn from twelve; its brightness by how far behind the lit one it is
      const a = S.sub(S.div(k * 360, N), 90), px = S.add(cx, S.div(S.mul(R, shaderMotionCos(S, a)), 1000)), py = S.add(cy, S.div(S.mul(R, shaderMotionSin(S, a)), 1000));
      const behind = S.mod(S.add(S.sub(lead, k), N), N), t = S.max(S.sub(100, S.div(S.mul(behind, 100), N)), 15);
      const at = S.and(S.lt(k, N), S.le(S.add(S.mul(S.sub(S.x, px), S.sub(S.x, px)), S.mul(S.sub(S.y, py), S.sub(S.y, py))), 1));
      out = S.sel(at, shaderPaintMix(S, c, S.p("color"), t), out);
    }
    return out;
  },
};

SHADER_DEFS.sonar = {
  label: "Sonar ping", title: "a sonar ping: the scene dark until a ring sweeps out from a point, lighting what it passes for a moment",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["sonar", "ping", "echolocation", "submarine", "radar", "reveal", "dark", "stealth", "pulse", "scan"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    down: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    dark: { type: "int", min: 0, max: 100, def: 80, label: "Darkness (%)" },
    tint: { type: "colour", def: "#3affc8", label: "Ping" },
    trail: { type: "int", min: 2, max: 24, def: 10, label: "Afterglow (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = shaderWxPolar(S, S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("down"), S.sub(S.h, 1)), 100));
    const Rm = S.add(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 1), r = S.div(S.mul(S.frame, Rm), S.FRAMES), back = S.sub(r, P.d);
    const T = S.p("trail"), lit = S.and(S.ge(back, 0), S.lt(back, T)), t = S.sub(100, S.div(S.mul(back, 100), T));
    const darkC = shaderPaintMix(S, c, S.rgba(0, 6, 10, 255), S.p("dark"));
    return S.pick([[S.and(lit, S.lt(back, 1)), S.p("tint")], [lit, shaderPaintMix(S, darkC, shaderPaintMix(S, c, S.p("tint"), 30), t)]], darkC);
  },
};

SHADER_DEFS.sunburst = {
  label: "Sunburst", title: "a sunburst of rays in two colors turning slowly behind the scene, a retro poster or a victory screen",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["sunburst", "rays", "victory", "retro", "poster", "background", "spin", "comic", "celebration", "manga"],
  params: {
    rays: { type: "int", min: 4, max: 24, def: 12, label: "Rays" },
    one: { type: "colour", def: "#ffd84a", label: "Rays" },
    two: { type: "colour", def: "#ff9a2a", label: "Between" },
    blend: { type: "int", min: 0, max: 100, def: 45, label: "Over the picture (%)" },
    spin: { type: "int", min: 0, max: 1, def: 0, label: "Rays", choices: ["turn", "stay still"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), N = S.p("rays"), per = S.max(S.div(360, N), 1);
    const turn = S.sel(S.eq(S.p("spin"), 0), S.div(S.mul(S.frame, S.mul(per, 2)), S.FRAMES), 0);
    const a = S.mod(S.add(K.a, turn), 360), even = S.eq(S.mod(S.div(a, per), 2), 0);
    return shaderPaintMix(S, c, S.sel(even, S.p("one"), S.p("two")), S.p("blend"));
  },
};

SHADER_DEFS.menuchecks = {
  label: "Menu checks", title: "a menu background of big soft checks scrolling diagonally, two colors blended over the scene",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["checkerboard", "menu", "background", "scrolling", "ui", "title screen", "pause", "retro", "pattern", "loop"],
  params: {
    check: { type: "int", min: 2, max: 16, def: 6, label: "Check (px)" },
    one: { type: "colour", def: "#5a3aa8", label: "Checks" },
    two: { type: "colour", def: "#3a2a7a", label: "Between" },
    blend: { type: "int", min: 0, max: 100, def: 60, label: "Over the picture (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Q = S.p("check"), sh = S.div(S.mul(S.frame, S.mul(Q, 2)), S.FRAMES);
    const odd = S.eq(S.mod(S.add(S.div(S.add(S.x, sh), Q), S.div(S.add(S.y, sh), Q)), 2), 1);
    return shaderPaintMix(S, c, S.sel(odd, S.p("one"), S.p("two")), S.p("blend"));
  },
};

SHADER_DEFS.accordion = {
  label: "Accordion", title: "the screen folds up like an accordion toward its middle, its pleats shading as they close, the cover beside it",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    pleat: { type: "int", min: 2, max: 16, def: 6, label: "Pleat (px)" },
    shade: { type: "int", min: 0, max: 80, def: 45, label: "Pleat shading (%)" },
  },
  fragment: function (S) {
    const p = S.progress(), k = S.sub(100, p), cx = S.div(S.w, 2), X = S.sub(S.x, cx);
    const sx = S.add(cx, S.div(S.mul(X, 100), S.max(k, 1))), inside = S.and(S.gt(k, 0), S.ge(sx, 0), S.lt(sx, S.w));
    // every other pleat (in the picture's own columns) shades darker as it closes
    const dark = S.eq(S.mod(S.div(S.add(sx, S.mul(S.p("pleat"), 64)), S.p("pleat")), 2), 1);
    const q = S.texAt(sx, S.y, "clamp"), d = S.div(S.mul(S.p("shade"), p), 100);
    return S.sel(inside, S.sel(dark, shaderPaintShade(S, q, S.sub(100, d), 0), q), S.p("cover"));
  },
};

SHADER_DEFS.magicwipe = {
  label: "Magic wipe", title: "the cover sweeps across the screen behind a glittering edge of sparkles",
  group: "Transitions", kind: "screen", transition: "covered", palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#1a0a3a", label: "Cover" },
    sparkle: { type: "palette", def: ["#ffffff", "#ffe8a0", "#c8b0ff"], max: 6, label: "Sparkles" },
    width: { type: "int", min: 1, max: 8, def: 4, label: "Sparkle edge (px)" },
    dir: { type: "int", min: 0, max: 1, def: 0, label: "Sweeps", choices: ["left to right", "right to left"] },
  },
  fragment: function (S) {
    const p = S.progress(), W = S.p("width"), u = S.sel(S.eq(S.p("dir"), 0), S.x, S.sub(S.sub(S.w, 1), S.x)), n = S.palCount("sparkle");
    const edge = S.div(S.mul(p, S.add(S.w, W)), 100);
    const h = S.hash(S.x, S.y, S.add(S.frame, 1651)), zone = S.and(S.gt(p, 0), S.ge(u, edge), S.lt(u, S.add(edge, W)));
    const spark = S.and(zone, S.lt(S.mod(h, 100), S.sub(70, S.div(S.mul(S.sub(u, edge), 50), W))));
    return S.pick([[S.lt(u, edge), S.p("cover")], [spark, S.palAt("sparkle", S.mod(S.div(h, 100), n))]], S.tex(0, 0));
  },
};

SHADER_DEFS.furry.variants = [{ amount: 100 }, { amount: 25, seed: 4 }];
SHADER_DEFS.rubberstamp.variants = [{ wear: 70, level: 180 }, { ink: "#1a3a8a", paper: "#ffffff", wear: 0 }];
SHADER_DEFS.popart.variants = [{ levels: 2 }, { shift: 2 }];
SHADER_DEFS.braille.variants = [{ invert: 1, ink: "#101010", paper: "#f4f0e4" }, { level: 60 }];
SHADER_DEFS.letterpress.variants = [{ depth: 80 }, { ink: "#8a1a2a", paper: "#fff8f0", level: 90, depth: 15 }];
SHADER_DEFS.petals.variants = [{ petals: 80 }, { petals: 20, colors: ["#fff0a0", "#ffffff"], seed: 4 }];
SHADER_DEFS.lanterns.variants = [{ lanterns: 70, dark: 70 }, { lanterns: 15, paper: "#ff5a6a", glow: "#ff2a4a", dark: 0 }];
SHADER_DEFS.flock.variants = [{ flyer: 1, count: 6, ink: "#0a0a10" }, { count: 2, ink: "#ffffff", sky: 90 }];
SHADER_DEFS.ecg.variants = [{ beat: 12, trail: 100 }, { trace: "#ff4a5a", beat: 48, height: 40 }];
SHADER_DEFS.spinner.variants = [{ dots: 12, radius: 12 }, { dots: 4, radius: 3, color: "#ffd84a", across: 85, down: 85 }];
SHADER_DEFS.sonar.variants = [{ dark: 95, trail: 4 }, { across: 0, down: 100, tint: "#ffb84a", trail: 24 }];
SHADER_DEFS.sunburst.variants = [{ rays: 24, blend: 80 }, { rays: 6, one: "#ffffff", two: "#e83a3a", spin: 1 }];
SHADER_DEFS.menuchecks.variants = [{ check: 12, blend: 100 }, { check: 3, one: "#ffb0c8", two: "#ffd8e4" }];
SHADER_DEFS.accordion.variants = [{ pleat: 3, shade: 80 }, { pleat: 16, shade: 20, cover: "#ffffff" }];
SHADER_DEFS.magicwipe.variants = [{ width: 8, dir: 1 }, { width: 2, cover: "#000000", sparkle: ["#7affe0", "#ffffff"] }];

// ---- More tiles, a reticle, three more machines, comic and contrast looks, clouds, three transitions ----
// ======================================================================================================================
// Seamless tiles (a conveyor with arrows, a torch-lit floor, a shine sweeping across); for a sprite (a target reticle,
// a mirage shimmer); three machines (an Atari 2600's per-line colors, a vacuum fluorescent display, tape-loading
// border stripes); looks (comic book, high contrast, outline only); clouds in the sky; and three transitions (a white
// flash, a dreamy fade, strips sliding away). Private helpers shaderAt*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("conveyortile", "torchtile", "shinetile", "targeted", "mirage", "atari2600", "vfd", "tapeloading", "comicbook",
  "highcontrast", "wireoutline", "clouds", "flashcut", "dreamfade", "stripslide");

// edges: a brightness jump of more than e to the right or below, or the silhouette's own edge
function shaderAtEdge(S, e) {
  const c = S.tex(0, 0), a = shaderLooksAt(S, 1, 0), b = shaderLooksAt(S, 0, 1), l = S.luma(c);
  return S.or(S.gt(S.abs(S.sub(S.luma(a), l)), e), S.gt(S.abs(S.sub(S.luma(b), l)), e), S.and(S.solid(c), shaderPaintRim(S)));
}

SHADER_DEFS.conveyortile = {
  label: "Conveyor tile", title: "a conveyor belt tile: the tile running one length a loop, chevron arrows marching with it, wrapping",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["conveyor", "belt", "tile", "seamless", "factory", "industrial", "arrows", "moving floor", "puzzle", "animated"],
  params: {
    dir: { type: "int", min: 0, max: 3, def: 0, label: "Runs", choices: ["right", "left", "down", "up"] },
    arrows: { type: "int", min: 0, max: 4, def: 2, label: "Arrows a tile (0 none)" },
    mark: { type: "colour", def: "#ffd84a", label: "Arrows" },
    strength: { type: "int", min: 0, max: 100, def: 60, label: "Arrow strength (%)" },
  },
  fragment: function (S) {
    const D = S.p("dir"), across = S.lt(D, 2), back = S.eq(S.mod(D, 2), 1);
    const span = S.sel(across, S.w, S.h), side = S.sel(across, S.h, S.w), sh = S.div(S.mul(S.frame, span), S.FRAMES);
    const along = S.sel(across, S.x, S.y), cross = S.sel(across, S.y, S.x), u = S.sel(back, S.add(along, sh), S.sub(along, sh));
    const q = S.texAt(S.sel(across, u, S.x), S.sel(across, S.y, u), "wrap");
    // chevrons pointing the way it runs: a period of span / arrows, bent at the middle of the belt
    const N = S.p("arrows"), P = S.max(S.div(span, S.max(N, 1)), 2);
    const bend = S.abs(S.sub(S.mul(cross, 2), S.sub(side, 1))), v = S.sel(back, S.add(u, S.div(bend, 2)), S.sub(u, S.div(bend, 2)));
    const chev = S.and(S.gt(N, 0), S.lt(S.mod(S.add(v, S.mul(P, 64)), P), 2));
    return S.sel(chev, shaderPaintMix(S, q, S.p("mark"), S.p("strength")), q);
  },
};

SHADER_DEFS.torchtile = {
  label: "Torch-lit tile", title: "a floor tile lit by a flickering torch in its middle: a warm pool of light fading to dark at its edges",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["torch", "torchlight", "dungeon", "tile", "flicker", "warm", "floor", "candle", "crypt", "light"],
  params: {
    radius: { type: "int", min: 20, max: 100, def: 60, label: "Light reaches (% of the tile)" },
    dark: { type: "int", min: 0, max: 100, def: 65, label: "Darkness (%)" },
    warm: { type: "colour", def: "#ffb050", label: "Light" },
    night: { type: "colour", def: "#0c0810", label: "Darkness" },
    flicker: { type: "int", min: 0, max: 30, def: 10, label: "Flicker (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), f = S.mod(S.hash(S.frame, 1, 1701), S.add(S.p("flicker"), 1));
    const R = S.max(S.div(S.mul(S.sub(S.p("radius"), f), S.max(S.w, S.h)), 100), 2), t = S.clamp(S.div(S.mul(K.d2, 100), R), 0, 100);
    const lv = shaderUiSteps(S, t), lit = shaderPaintMix(S, c, S.p("warm"), S.sub(25, S.mul(lv, 8)));
    return shaderPaintMix(S, lit, S.p("night"), S.div(S.mul(S.mul(lv, 33), S.p("dark")), 100));
  },
};

SHADER_DEFS.shinetile = {
  label: "Shine tile", title: "a band of shine sweeping diagonally across a tile once a loop (polished floors, ice, glass), seamless",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["shine", "gleam", "tile", "seamless", "polished", "ice", "glass", "marble", "sweep", "floor"],
  params: {
    shine: { type: "colour", def: "#ffffff", label: "Shine" },
    strength: { type: "int", min: 0, max: 100, def: 45, label: "Strength (%)" },
    width: { type: "int", min: 1, max: 30, def: 10, label: "Band width (% of the tile)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), WH = S.max(S.mul(S.w, S.h), 1);
    // a diagonal coordinate that tiles: x h + y w, modulo w h, the band moving all the way round once a loop
    const u = S.mod(S.add(S.sub(S.add(S.mul(S.x, S.h), S.mul(S.y, S.w)), S.div(S.mul(S.frame, WH), S.FRAMES)), S.mul(WH, 4)), WH);
    const band = S.lt(u, S.div(S.mul(WH, S.p("width")), 100)), core = S.lt(u, S.div(S.mul(WH, S.p("width")), 300));
    return S.pick([[core, shaderPaintMix(S, c, S.p("shine"), S.p("strength"))], [band, shaderPaintMix(S, c, S.p("shine"), S.div(S.p("strength"), 2))]], c);
  },
};

SHADER_DEFS.targeted = {
  label: "Targeted", title: "a target reticle on the sprite: crosshair lines through its middle, dashes running along them, a pulsing center",
  group: "Items", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [2, 2, 2, 2],
  tags: ["target", "reticle", "crosshair", "locked on", "aim", "marked", "sniper", "selected", "hud", "enemy"],
  params: {
    reticle: { type: "colour", def: "#ff3a3a", label: "Reticle" },
    dash: { type: "int", min: 1, max: 4, def: 2, label: "Dash (px)" },
    gap: { type: "int", min: 0, max: 8, def: 2, label: "Gap at the middle (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), cx = S.div(S.w, 2), cy = S.div(S.h, 2), D = S.p("dash"), G = S.p("gap");
    const dx = S.sub(S.x, cx), dy = S.sub(S.y, cy), near = S.or(S.solid(c), shaderEnchRing1(S), shaderEnchRing2(S));
    // dashes run outward from the middle, one period a loop
    const mv = S.div(S.mul(S.frame, S.mul(D, 2)), S.FRAMES);
    const hline = S.and(S.eq(dy, 0), S.gt(S.abs(dx), G), S.lt(S.mod(S.add(S.sub(S.abs(dx), mv), S.mul(D, 64)), S.mul(D, 2)), D));
    const vline = S.and(S.eq(dx, 0), S.gt(S.abs(dy), G), S.lt(S.mod(S.add(S.sub(S.abs(dy), mv), S.mul(D, 64)), S.mul(D, 2)), D));
    const pulse = S.lt(S.mod(S.frame, 8), 4), centre = S.and(S.le(S.abs(dx), S.sel(pulse, 1, 0)), S.le(S.abs(dy), S.sel(pulse, 1, 0)));
    return S.sel(S.and(near, S.or(hline, vline, centre)), S.p("reticle"), c);
  },
};

SHADER_DEFS.mirage = {
  label: "Mirage", title: "the sprite shimmering like a mirage in heat: its rows wavering a pixel side to side",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 10, pad: [0, 1, 0, 1],
  tags: ["mirage", "heat", "shimmer", "desert", "waver", "illusion", "hot", "haze", "dream", "unreal"],
  params: {
    waves: { type: "int", min: 1, max: 6, def: 3, label: "Waves down the sprite" },
    every: { type: "int", min: 1, max: 3, def: 1, label: "Rows a step" },
  },
  fragment: function (S) {
    const row = S.div(S.y, S.p("every"));
    const s = shaderMotionSin(S, S.add(shaderDmWave(S, row, S.p("waves"), S.max(S.div(S.h, S.p("every")), 1)), S.div(S.mul(S.frame, 360), S.FRAMES)));
    // -1, 0 or +1 px (|s| past 600): S.div floors, so s / 600 reached -2, past the 1 px pad (build 42)
    return S.texAt(S.sub(S.x, S.sub(S.div(S.add(s, 1800), 1200), 1)), S.y, "clear");
  },
};

SHADER_DEFS.atari2600 = {
  label: "Atari 2600", title: "an Atari 2600's look: fat pixels four wide, each line of the picture limited to two colors from a coarse palette",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["atari 2600", "vcs", "2600", "retro", "1977", "chunky", "scanline", "8-bit", "arcade", "console"],
  params: {
    wide: { type: "int", min: 1, max: 8, def: 4, label: "Pixel width (px)" },
    tall: { type: "int", min: 1, max: 4, def: 2, label: "Line height (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Wd = S.p("wide"), T = S.p("tall"), y0 = S.mul(S.div(S.y, T), T);
    const cell = S.texAt(S.add(S.mul(S.div(S.x, Wd), Wd), S.div(Wd, 2)), y0, "clamp");
    // the line's two colors: the darkest and brightest of eight probes across it
    let dark = cell, light = cell;
    for (let k = 0; k < 8; k++) {
      const p = S.texAt(S.div(S.mul(S.add(S.mul(k, 2), 1), S.w), 16), y0, "clamp");
      dark = S.sel(S.and(S.solid(p), S.lt(S.luma(p), S.luma(dark))), p, dark);
      light = S.sel(S.and(S.solid(p), S.gt(S.luma(p), S.luma(light))), p, light);
    }
    const l = S.luma(S.sel(S.solid(cell), cell, c)), pick = S.sel(S.le(S.abs(S.sub(l, S.luma(dark))), S.abs(S.sub(l, S.luma(light)))), dark, light);
    // a coarse palette: each channel to eight levels
    const q = function (v) { return S.mul(S.div(v, 32), 36); };
    return S.sel(S.solid(c), S.rgba(S.min(q(S.r(pick)), 255), S.min(q(S.g(pick)), 255), S.min(q(S.b(pick)), 255), 255), c);
  },
};

SHADER_DEFS.vfd = {
  label: "VFD display", title: "a vacuum fluorescent display: cyan glowing pixels in three brightnesses behind a fine mesh, a soft glow round them",
  group: "Eras and display", kind: "both", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["vfd", "vacuum fluorescent", "display", "cyan", "retro", "hifi", "clock", "dashboard", "segment", "glow"],
  params: {
    glow: { type: "colour", def: "#5affe8", label: "Phosphor" },
    mesh: { type: "int", min: 0, max: 60, def: 25, label: "Mesh (%)" },
    flicker: { type: "int", min: 0, max: 30, def: 6, label: "Flicker (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), G = S.p("glow"), k = S.div(S.mul(S.luma(c), 4), 256);
    const near = S.max(S.max(S.luma(shaderLooksAt(S, 1, 0)), S.luma(shaderLooksAt(S, -1, 0))), S.max(S.luma(shaderLooksAt(S, 0, 1)), S.luma(shaderLooksAt(S, 0, -1))));
    const halo = S.and(S.eq(k, 0), S.gt(near, 150));
    const fl = S.sel(S.lt(S.mod(S.hash(S.y, S.frame, 1711), 100), 20), S.p("flicker"), 0);
    const lit = S.pick([[S.eq(k, 0), S.sel(halo, 18, 4)], [S.eq(k, 1), 40], [S.eq(k, 2), 72]], 100);
    const meshed = S.or(S.eq(S.mod(S.x, 3), 2), S.eq(S.mod(S.y, 3), 2));
    const t = S.sub(S.sub(lit, S.sel(meshed, S.div(S.mul(lit, S.p("mesh")), 100), 0)), S.div(S.mul(lit, fl), 100));
    const out = shaderPaintMix(S, S.rgba(4, 10, 12, 255), G, S.max(t, 0));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.tapeloading = {
  label: "Tape loading", title: "an 8-bit computer loading from tape: the border round the screen flickering with racing colored stripes",
  group: "Eras and display", kind: "screen", palette: "free", frames: 8, fps: 16, pad: [0, 0, 0, 0],
  tags: ["tape loading", "cassette", "zx spectrum", "loading", "border", "stripes", "8-bit", "retro", "1980s", "boot"],
  params: {
    border: { type: "int", min: 2, max: 30, def: 12, label: "Border (% of each side)" },
    colors: { type: "palette", def: ["#d80000", "#00d8d8", "#0000d8", "#d8d800"], max: 8, label: "Stripe colors (in pairs)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), bx = S.div(S.mul(S.p("border"), S.w), 100), by = S.div(S.mul(S.p("border"), S.h), 100);
    const inBorder = S.or(S.lt(S.x, bx), S.ge(S.x, S.sub(S.w, bx)), S.lt(S.y, by), S.ge(S.y, S.sub(S.h, by)));
    // each frame its own stripe height (1..4 px) and phase; stripes alternate the two colors of a pair, the pair by frame
    const h = S.hash(S.frame, 2, 1721), sh = S.add(1, S.mod(h, 4)), ph = S.mod(S.div(h, 10), 8);
    const n = S.palCount("colors"), pair = S.mul(S.mod(S.div(h, 100), S.max(S.div(n, 2), 1)), 2);
    const alt = S.mod(S.div(S.add(S.y, ph), sh), 2);
    return S.sel(inBorder, S.palAt("colors", S.mod(S.add(pair, alt), n)), c);
  },
};

SHADER_DEFS.comicbook = {
  label: "Comic book", title: "the picture as a comic panel: flat bands of color, bold black ink lines on its edges, dots in its shadows",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["comic", "comic book", "cartoon", "ink", "halftone", "panel", "pop", "manga", "superhero", "graphic novel"],
  params: {
    ink: { type: "colour", def: "#0e0e14", label: "Ink" },
    edge: { type: "int", min: 0, max: 255, def: 60, label: "Ink where brightness jumps by" },
    bands: { type: "int", min: 2, max: 5, def: 3, label: "Color bands" },
    dots: { type: "int", min: 0, max: 200, def: 100, label: "Shadow dots below (brightness)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), N = S.p("bands");
    // flat bands: each channel cut to N levels, lifted a little
    const band = function (v) { return S.min(S.add(S.div(S.mul(S.div(S.mul(v, N), 256), 255), S.max(S.sub(N, 1), 1)), 10), 255); };
    const flat = S.rgba(band(S.r(c)), band(S.g(c)), band(S.b(c)), 255);
    const dot = S.and(S.lt(S.luma(c), S.p("dots")), S.eq(S.mod(S.x, 2), 0), S.eq(S.mod(S.add(S.y, S.div(S.x, 2)), 2), 0));
    return S.sel(S.solid(c), S.pick([[shaderAtEdge(S, S.p("edge")), S.p("ink")], [dot, shaderPaintShade(S, flat, 55, 0)]], flat), c);
  },
};

SHADER_DEFS.highcontrast = {
  label: "High contrast", title: "an accessibility high-contrast view: the picture in black and white by brightness, its edges traced in a bright accent",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["high contrast", "accessibility", "a11y", "low vision", "black and white", "readability", "tool", "mode", "outline", "clarity"],
  params: {
    level: { type: "int", min: 0, max: 255, def: 110, label: "White above (brightness)" },
    light: { type: "colour", def: "#ffffff", label: "Light" },
    dark: { type: "colour", def: "#000000", label: "Dark" },
    accent: { type: "colour", def: "#ffe600", label: "Edges" },
    edge: { type: "int", min: 0, max: 255, def: 70, label: "Edge where brightness jumps by" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0);
    return S.sel(S.solid(c), S.pick([[shaderAtEdge(S, S.p("edge")), S.p("accent")], [S.gt(S.luma(c), S.p("level")), S.p("light")]], S.p("dark")), c);
  },
};

SHADER_DEFS.wireoutline = {
  label: "Outline only", title: "only the sprite's outline kept, in its own colors, white or black, its inside emptied or left as a faint dithered ghost",
  group: "Looks", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["outline", "wireframe", "line art", "hollow", "silhouette", "ghost", "blueprint", "coloring", "tool", "stencil"],
  params: {
    line: { type: "int", min: 0, max: 2, def: 0, label: "Line", choices: ["its own colors", "white", "black"] },
    inside: { type: "int", min: 0, max: 1, def: 0, label: "Inside", choices: ["empty", "a faint ghost of itself"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), rim = S.and(S.solid(c), shaderPaintRim(S)), L = S.p("line");
    const ink = S.pick([[S.eq(L, 0), c], [S.eq(L, 1), S.rgba(255, 255, 255, 255)]], S.rgba(0, 0, 0, 255));
    const ghost = S.and(S.eq(S.p("inside"), 1), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    return S.pick([[S.not(S.solid(c)), c], [rim, ink], [ghost, shaderPaintShade(S, c, 45, 0)]], S.clear);
  },
};

SHADER_DEFS.clouds = {
  label: "Clouds", title: "puffy clouds drifting across the top of the sky, white on top, shaded underneath",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 6, pad: [0, 0, 0, 0],
  tags: ["clouds", "sky", "weather", "day", "cumulus", "drift", "overworld", "ambient", "fluffy", "parallax"],
  params: {
    cover: { type: "int", min: 0, max: 100, def: 45, label: "Cloud cover (%)" },
    height: { type: "int", min: 10, max: 100, def: 45, label: "In the top (% of the screen)" },
    cloud: { type: "colour", def: "#ffffff", label: "Cloud" },
    shade: { type: "colour", def: "#c4ccdc", label: "Underside" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Clouds" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 1731), top = S.max(S.div(S.mul(S.p("height"), S.h), 100), 2);
    // a noise repeating every 64 px across, drifting 64 px a loop; thinned toward the band's foot
    const nAt = function (dy) { return S.sub(shaderEnchFlow(S, S.add(S.y, dy), S.add(S.x, S.div(S.mul(S.frame, 64), S.FRAMES)), 8, sd, 64), S.div(S.mul(S.add(S.y, dy), 120), top)); };
    const thr = S.sub(230, S.div(S.mul(S.p("cover"), 160), 100)), me = nAt(0), below = nAt(2);
    const inCloud = S.and(S.lt(S.y, top), S.gt(me, thr)), under = S.and(inCloud, S.le(below, thr));
    return S.pick([[under, S.p("shade")], [inCloud, S.p("cloud")]], c);
  },
};

SHADER_DEFS.flashcut = {
  label: "Flash cut", title: "a bright flash: the screen burning out to white (or any cover), its brightest parts going first",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 16, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#ffffff", label: "Flash" },
  },
  fragment: function (S) {
    const p = S.progress(), c = S.tex(0, 0);
    // brighter pixels reach the flash sooner: a pixel goes when progress passes its darkness (dithered)
    const go = S.lt(S.add(S.div(S.mul(S.sub(255, S.luma(c)), 70), 255), S.div(S.mul(shaderWxBayer(S, 1), 30), 16)), p);
    return S.sel(S.or(go, S.eq(p, 100)), S.p("cover"), shaderPaintMix(S, c, S.p("cover"), S.div(p, 2)));
  },
};

SHADER_DEFS.dreamfade = {
  label: "Dream fade", title: "a dream sequence: the screen wavering harder and harder, then dissolving into the cover",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#f0e8ff", label: "Cover" },
    sway: { type: "int", min: 1, max: 8, def: 4, label: "Waver at most (px)" },
  },
  fragment: function (S) {
    const p = S.progress(), A = S.div(S.mul(S.p("sway"), p), 100);
    const s = shaderMotionSin(S, S.add(S.mul(S.y, 24), S.div(S.mul(S.frame, 720), S.FRAMES)));
    const q = S.texAt(S.add(S.x, S.div(S.mul(s, A), 1000)), S.y, "clamp");
    return S.sel(shaderTxFade(S, p, 40), S.p("cover"), q);
  },
};

SHADER_DEFS.stripslide = {
  label: "Strip slide", title: "the screen cut into strips that slide off alternately left and right, one after another",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    strip: { type: "int", min: 1, max: 16, def: 4, label: "Strip height (px)" },
    stagger: { type: "int", min: 0, max: 200, def: 60, label: "Stagger" },
  },
  fragment: function (S) {
    const p = S.progress(), B = S.p("strip"), k = S.div(S.y, B), sp = S.p("stagger"), n = S.max(S.div(S.add(S.h, S.sub(B, 1)), B), 1);
    const q = S.clamp(S.sub(S.div(S.mul(p, S.add(100, sp)), 100), S.div(S.mul(S.div(S.mul(k, 100), n), sp), 100)), 0, 100);
    const off = S.div(S.mul(S.mul(q, q), S.w), 10000), sx = S.sel(S.eq(S.mod(k, 2), 0), S.add(S.x, off), S.sub(S.x, off));
    return S.sel(S.and(S.ge(sx, 0), S.lt(sx, S.w), S.lt(q, 100)), S.texAt(sx, S.y, "clamp"), S.p("cover"));
  },
};

SHADER_DEFS.conveyortile.variants = [{ dir: 1, arrows: 1 }, { dir: 2, arrows: 4, mark: "#ffffff", strength: 30 }];
SHADER_DEFS.torchtile.variants = [{ radius: 100, dark: 40 }, { radius: 30, dark: 90, warm: "#7ac8ff", flicker: 30 }];
SHADER_DEFS.shinetile.variants = [{ strength: 80, width: 20 }, { shine: "#c8f0ff", width: 3 }];
SHADER_DEFS.targeted.variants = [{ dash: 1, gap: 0 }, { reticle: "#3aff6a", dash: 4, gap: 6 }];
SHADER_DEFS.mirage.variants = [{ waves: 6 }, { waves: 1, every: 3 }];
SHADER_DEFS.atari2600.variants = [{ wide: 8, tall: 1 }, { wide: 2, tall: 4 }];
SHADER_DEFS.vfd.variants = [{ glow: "#ff8a3a", mesh: 50 }, { mesh: 0, flicker: 30 }];
SHADER_DEFS.tapeloading.variants = [{ border: 25 }, { border: 5, colors: ["#000000", "#ffffff"] }];
SHADER_DEFS.comicbook.variants = [{ bands: 2, edge: 30 }, { bands: 5, dots: 0, ink: "#2a1a4a" }];
SHADER_DEFS.highcontrast.variants = [{ accent: "#00e8ff" }, { light: "#ffe600", dark: "#000000", accent: "#ffffff", level: 160 }];
SHADER_DEFS.wireoutline.variants = [{ line: 1 }, { inside: 1, line: 2 }];
SHADER_DEFS.clouds.variants = [{ cover: 80, height: 70 }, { cover: 20, cloud: "#ffd8e8", shade: "#c0a0c8", seed: 3 }];
SHADER_DEFS.flashcut.variants = [{ cover: "#ff3a3a" }, { cover: "#000000" }];
SHADER_DEFS.dreamfade.variants = [{ sway: 8, cover: "#ffffff" }, { sway: 1, cover: "#1a0a2a" }];
SHADER_DEFS.stripslide.variants = [{ strip: 1, stagger: 200 }, { strip: 16, stagger: 0, cover: "#ffffff" }];

// ---- Everyday tools, game UI overlays, a smear and a heartbeat, two more transitions ----
// ======================================================================================================================
// Everyday image tools (film grain, grayscale, threshold, a channel swap, colorize); game UI drawn over a screen (fog of
// war, a window frame, a dialog box, a pause screen, an inventory slot grid, a health bar); for a sprite (a motion smear,
// a heartbeat); and two transitions (the cover dripping down, tiles filling in a snake). Private helpers shaderUx*;
// earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("motionsmear", "heartbeat", "filmgrain", "grayscale", "threshold", "channelswap", "colorize", "fogofwar", "windowframe",
  "dialogbox", "paused", "slotgrid", "healthbar", "dripdown", "snakefill");

// a beveled box edge: 1 for the light (top-left) side, 2 for the dark (bottom-right) side, 0 inside, for a box from
// (x0, y0) of w x h with a bevel b px thick
function shaderUxBevel(S, x0, y0, w, h, b) {
  const lx = S.sub(S.x, x0), ly = S.sub(S.y, y0), rx = S.sub(S.sub(S.add(x0, w), 1), S.x), ry = S.sub(S.sub(S.add(y0, h), 1), S.y);
  const tl = S.or(S.lt(lx, b), S.lt(ly, b)), br = S.or(S.lt(rx, b), S.lt(ry, b));
  return S.pick([[S.and(br, S.or(S.not(tl), S.lt(S.min(rx, ry), S.min(lx, ly)))), 2], [tl, 1]], 0);
}

SHADER_DEFS.motionsmear = {
  label: "Motion smear", title: "an animator's smear: the sprite's own colors dragged out behind it as if moving fast, thinning to a dither",
  group: "Sprite FX", kind: "sprite", frames: 1, fps: 1, pad: [0, 6, 0, 6],
  tags: ["smear", "motion", "speed", "dash", "animation", "blur", "fast", "streak", "action", "swish"],
  params: {
    reach: { type: "int", min: 1, max: 6, def: 4, label: "Smear (px)" },
    moving: { type: "int", min: 0, max: 1, def: 0, label: "Moving", choices: ["right (smear on the left)", "left (smear on the right)"] },
    thin: { type: "int", min: 0, max: 1, def: 0, label: "Smear", choices: ["thins to a dither", "solid"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), L = S.p("reach"), dir = S.sel(S.eq(S.p("moving"), 0), 1, -1);
    // the nearest solid pixel ahead (in the direction of motion), within the reach
    let k = S.i(0), col = c;
    for (let i = 6; i >= 1; i--) {
      const q = S.texAt(S.add(S.x, S.mul(dir, i)), S.y, "clear"), on = S.and(S.le(i, L), S.solid(q));
      k = S.sel(on, i, k); col = S.sel(on, q, col);
    }
    const drop = S.and(S.eq(S.p("thin"), 0), S.ge(S.div(S.mul(k, 16), S.add(L, 1)), S.add(shaderWxBayer(S, 1), 1)));
    return S.sel(S.and(S.not(S.solid(c)), S.gt(k, 0), S.not(drop)), col, c);
  },
};

SHADER_DEFS.heartbeat = {
  label: "Heartbeat", title: "the sprite throbbing with a heartbeat: twice a loop (lub-dub) an outline flashes round it and it flushes with color",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [1, 1, 1, 1],
  tags: ["heartbeat", "pulse", "throb", "alive", "love", "health", "beat", "rhythm", "selected", "charm"],
  params: {
    color: { type: "colour", def: "#ff3a6a", label: "Pulse" },
    flush: { type: "int", min: 0, max: 100, def: 35, label: "Flush (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), f = S.div(S.mul(S.frame, 16), S.FRAMES);
    const beat = S.or(S.lt(f, 2), S.and(S.ge(f, 3), S.lt(f, 5))), strong = S.lt(f, 2);
    return S.pick([
      [S.and(beat, shaderEnchRing1(S)), S.p("color")],
      [S.and(beat, S.solid(c)), shaderPaintMix(S, c, S.p("color"), S.sel(strong, S.p("flush"), S.div(S.p("flush"), 2)))],
    ], c);
  },
};

SHADER_DEFS.filmgrain = {
  label: "Film grain", title: "film grain: fine noise crawling over the picture every frame, gray or in color",
  group: "Looks", kind: "both", palette: "free", frames: 8, fps: 24, pad: [0, 0, 0, 0],
  tags: ["film grain", "grain", "noise", "analog", "cinematic", "texture", "photo", "gritty", "tool", "vintage"],
  params: {
    amount: { type: "int", min: 0, max: 80, def: 20, label: "Grain" },
    color: { type: "int", min: 0, max: 1, def: 0, label: "Grain", choices: ["gray", "in color"] },
    size: { type: "int", min: 1, max: 3, def: 1, label: "Grain size (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), K = S.p("size"), gx = S.div(S.x, K), gy = S.div(S.y, K);
    const n = function (salt) { return S.sub(S.mod(S.hash(gx, gy, S.add(S.mul(S.frame, 3), salt)), S.add(S.mul(A, 2), 1)), A); };
    const g = n(1801), mono = S.eq(S.p("color"), 0);
    const out = shaderTkRgb(S, S.add(S.r(c), g), S.add(S.g(c), S.sel(mono, g, n(1802))), S.add(S.b(c), S.sel(mono, g, n(1803))));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.grayscale = {
  label: "Grayscale", title: "the picture in grays, by perceived brightness, a plain average, or lightness, all the way or partly",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["grayscale", "greyscale", "black and white", "monochrome", "desaturate", "tool", "noir", "photo", "mono", "gray"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 100, label: "Amount (%)" },
    by: { type: "int", min: 0, max: 2, def: 0, label: "By", choices: ["perceived brightness", "an average", "lightness (brightest and darkest)"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), r = S.r(c), g = S.g(c), b = S.b(c), B = S.p("by");
    const v = S.pick([[S.eq(B, 0), S.luma(c)], [S.eq(B, 1), S.div(S.add(S.add(r, g), b), 3)]], S.div(S.add(S.max(S.max(r, g), b), S.min(S.min(r, g), b)), 2));
    return S.sel(S.solid(c), shaderPaintMix(S, c, S.rgba(v, v, v, 255), S.p("amount")), c);
  },
};

SHADER_DEFS.threshold = {
  label: "Threshold", title: "the picture in two colors, split at a brightness, sharp or ordered-dithered across the split",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["threshold", "1-bit", "two-tone", "black and white", "binary", "stencil", "tool", "mask", "dither", "contrast"],
  params: {
    level: { type: "int", min: 0, max: 255, def: 128, label: "Split at (brightness)" },
    dark: { type: "colour", def: "#000000", label: "Below" },
    light: { type: "colour", def: "#ffffff", label: "Above" },
    soft: { type: "int", min: 0, max: 128, def: 0, label: "Dithered across (brightness either side)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), off = S.div(S.mul(S.sub(S.mul(shaderWxBayer(S, 1), 2), 15), S.p("soft")), 15);
    return S.sel(S.solid(c), S.sel(S.gt(S.add(S.luma(c), off), S.p("level")), S.p("light"), S.p("dark")), c);
  },
};

SHADER_DEFS.channelswap = {
  label: "Channel swap", title: "the red, green and blue channels traded round, for alien skies, palette variants and quick recolors",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["channel swap", "rgb", "recolor", "variant", "alien", "tool", "palette", "hue", "trippy", "swap"],
  params: {
    order: { type: "int", min: 0, max: 4, def: 3, label: "Becomes", choices: ["red, blue, green", "green, red, blue", "green, blue, red", "blue, red, green", "blue, green, red"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), O = S.p("order"), r = S.r(c), g = S.g(c), b = S.b(c);
    const R = S.pick([[S.eq(O, 0), r], [S.eq(O, 1), g], [S.eq(O, 2), g]], b);
    const G = S.pick([[S.eq(O, 0), b], [S.eq(O, 1), r], [S.eq(O, 2), b], [S.eq(O, 3), r]], g);
    const B = S.pick([[S.eq(O, 0), g], [S.eq(O, 1), b], [S.eq(O, 2), r], [S.eq(O, 3), g]], r);
    return S.sel(S.solid(c), S.rgba(R, G, B, 255), c);
  },
};

SHADER_DEFS.colorize = {
  label: "Colorize", title: "the picture tinted all one hue, its light and dark kept, like a colorized photo or a single-color sprite",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["colorize", "tint", "monochrome", "hue", "duotone", "recolor", "tool", "sepia", "variant", "wash"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 100, label: "Amount (%)" },
    hue: { type: "colour", def: "#3a8cff", label: "Color" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), T = S.p("hue"), l = S.luma(c), lt = S.max(S.luma(T), 1);
    // the tint scaled to the pixel's brightness; past the tint's own brightness it lifts toward white
    const up = S.gt(l, lt), k = S.div(S.mul(S.sub(l, lt), 100), S.max(S.sub(255, lt), 1));
    const base = S.rgba(S.div(S.mul(S.r(T), l), lt), S.div(S.mul(S.g(T), l), lt), S.div(S.mul(S.b(T), l), lt), 255);
    const out = S.sel(up, shaderPaintMix(S, T, S.rgba(255, 255, 255, 255), k), shaderTkRgb(S, S.r(base), S.g(base), S.b(base)));
    return S.sel(S.solid(c), shaderPaintMix(S, c, out, S.p("amount")), c);
  },
};

SHADER_DEFS.fogofwar = {
  label: "Fog of war", title: "strategy fog of war: clear round a point, the explored land beyond it grayed and dimmed, the edge dithered",
  group: "World", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["fog of war", "strategy", "rts", "vision", "explored", "map", "darkness", "radius", "tactics", "roguelike"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Center across (%)" },
    down: { type: "int", min: 0, max: 100, def: 50, label: "Center down (%)" },
    sight: { type: "int", min: 5, max: 100, def: 35, label: "Sight (% of the screen)" },
    fog: { type: "colour", def: "#1a1c26", label: "Fog" },
    dim: { type: "int", min: 0, max: 100, def: 55, label: "Dimming (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = shaderWxPolar(S, S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("down"), S.sub(S.h, 1)), 100));
    const R = S.max(S.div(S.mul(S.p("sight"), S.max(S.w, S.h)), 100), 2);
    const fogged = shaderPaintMix(S, shaderPaintGrey(S, c), S.p("fog"), S.p("dim"));
    const edge = S.and(S.ge(P.d, R), S.lt(P.d, S.add(R, 3)), S.lt(shaderWxBayer(S, 1), S.mul(S.sub(S.add(R, 3), P.d), 5)));
    return S.pick([[S.lt(P.d, R), c], [edge, shaderPaintMix(S, c, fogged, 50)]], fogged);
  },
};

SHADER_DEFS.windowframe = {
  label: "Window frame", title: "a game window's frame round the screen: an outline, a bevel lit top-left and shaded bottom-right, rivets in the corners",
  group: "World", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["frame", "window", "border", "ui", "bevel", "panel", "menu", "rpg", "hud", "box"],
  params: {
    width: { type: "int", min: 2, max: 12, def: 4, label: "Frame (px)" },
    body: { type: "colour", def: "#5a6a8a", label: "Frame" },
    line: { type: "colour", def: "#101420", label: "Outline" },
    rivets: { type: "int", min: 0, max: 1, def: 1, label: "Corners", choices: ["plain", "riveted"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("width"), e = S.min(S.min(S.x, S.y), S.min(S.sub(S.sub(S.w, 1), S.x), S.sub(S.sub(S.h, 1), S.y)));
    const bev = shaderUxBevel(S, 1, 1, S.sub(S.w, 2), S.sub(S.h, 2), 1), inner = S.eq(e, S.sub(W, 1));
    const cx = S.min(S.x, S.sub(S.sub(S.w, 1), S.x)), cy = S.min(S.y, S.sub(S.sub(S.h, 1), S.y)), mid = S.div(W, 2);
    const rivet = S.and(S.eq(S.p("rivets"), 1), S.eq(cx, mid), S.eq(cy, mid));
    return S.pick([
      [S.ge(e, W), c],
      [S.or(S.eq(e, 0), inner), S.p("line")],
      [rivet, shaderPaintShade(S, S.p("body"), 140, 20)],
      [S.eq(bev, 1), shaderPaintShade(S, S.p("body"), 130, 10)],
      [S.eq(bev, 2), shaderPaintShade(S, S.p("body"), 65, 0)],
    ], S.p("body"));
  },
};

SHADER_DEFS.dialogbox = {
  label: "Dialog box", title: "an RPG dialog box along the bottom of the screen: a see-through panel, a double border, a blinking 'more' arrow",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["dialog", "dialogue box", "text box", "rpg", "ui", "speech", "message", "visual novel", "panel", "hud"],
  params: {
    height: { type: "int", min: 15, max: 60, def: 30, label: "Height (% of the screen)" },
    panel: { type: "colour", def: "#101a4a", label: "Panel" },
    opacity: { type: "int", min: 0, max: 100, def: 80, label: "Panel opacity (%)" },
    border: { type: "colour", def: "#f0f0ff", label: "Border" },
    arrow: { type: "int", min: 0, max: 1, def: 0, label: "More arrow", choices: ["blinks", "none"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 6), m = 1;
    const x0 = m, y0 = S.sub(S.sub(S.h, H), m), bw = S.sub(S.w, m * 2), inBox = S.and(S.ge(S.x, x0), S.lt(S.x, S.add(x0, bw)), S.ge(S.y, y0), S.lt(S.y, S.add(y0, H)));
    const e = S.min(S.min(S.sub(S.x, x0), S.sub(S.y, y0)), S.min(S.sub(S.sub(S.add(x0, bw), 1), S.x), S.sub(S.sub(S.add(y0, H), 1), S.y)));
    // a little down-pointing arrow near the bottom right corner, on for half of each eight frames
    const ax = S.sub(S.sub(S.add(x0, bw), 5), S.x), ay = S.sub(S.y, S.sub(S.add(y0, H), 5)), on = S.and(S.eq(S.p("arrow"), 0), S.lt(S.mod(S.frame, 8), 4));
    const tri = S.and(on, S.ge(ay, 0), S.le(ay, 2), S.le(S.abs(S.sub(ax, 0)), S.sub(2, ay)));
    return S.pick([
      [S.not(inBox), c],
      [S.or(S.eq(e, 0), S.eq(e, 2)), S.p("border")],
      [tri, S.p("border")],
    ], shaderPaintMix(S, c, S.p("panel"), S.p("opacity")));
  },
};

SHADER_DEFS.paused = {
  label: "Paused", title: "a pause screen: the scene dimmed and drained, a pause symbol glowing softly in the middle",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["pause", "paused", "menu", "ui", "dim", "overlay", "game", "hud", "stop", "break"],
  params: {
    dim: { type: "int", min: 0, max: 100, def: 55, label: "Dimming (%)" },
    icon: { type: "colour", def: "#ffffff", label: "Pause symbol" },
    size: { type: "int", min: 4, max: 40, def: 14, label: "Symbol size (% of the height)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("size"), S.h), 100), 3), bw = S.max(S.div(H, 3), 1);
    const dx = S.sub(S.x, S.div(S.w, 2)), dy = S.abs(S.sub(S.mul(S.y, 2), S.h)), tall = S.lt(dy, H);
    const bar = S.and(tall, S.or(S.and(S.ge(dx, S.neg(S.add(bw, S.div(bw, 2)))), S.lt(dx, S.neg(S.div(bw, 2)))), S.and(S.ge(dx, S.div(bw, 2)), S.lt(dx, S.add(bw, S.div(bw, 2))))));
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const dimmed = shaderPaintMix(S, shaderPaintMix(S, c, shaderPaintGrey(S, c), 60), S.rgba(0, 0, 0, 255), S.p("dim"));
    return S.sel(bar, shaderPaintMix(S, dimmed, S.p("icon"), S.add(75, S.div(s, 50))), dimmed);
  },
};

SHADER_DEFS.slotgrid = {
  label: "Slot grid", title: "an inventory grid over the screen: beveled slots in rows, see-through panels inside them",
  group: "World", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["inventory", "slots", "grid", "ui", "rpg", "hotbar", "bag", "menu", "hud", "items"],
  params: {
    slot: { type: "int", min: 6, max: 32, def: 12, label: "Slot (px)" },
    gap: { type: "int", min: 0, max: 4, def: 1, label: "Gap (px)" },
    panel: { type: "colour", def: "#202838", label: "Slot" },
    opacity: { type: "int", min: 0, max: 100, def: 55, label: "Slot opacity (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.add(S.p("slot"), S.p("gap")), fx = S.mod(S.x, P), fy = S.mod(S.y, P), N = S.p("slot");
    const inSlot = S.and(S.lt(fx, N), S.lt(fy, N));
    const bev = shaderUxBevel(S, S.sub(S.x, fx), S.sub(S.y, fy), N, N, 1);
    const fill = shaderPaintMix(S, c, S.p("panel"), S.p("opacity"));
    return S.pick([[S.not(inSlot), c], [S.eq(bev, 1), shaderPaintShade(S, S.p("panel"), 50, 0)], [S.eq(bev, 2), shaderPaintShade(S, S.p("panel"), 180, 30)]], fill);
  },
};

SHADER_DEFS.healthbar = {
  label: "Health bar", title: "a health bar in the screen's corner: filled to the amount, green to yellow to red as it falls, flashing when low",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["health bar", "hp", "life", "hud", "ui", "meter", "gauge", "rpg", "boss", "status"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 70, label: "Health (%)" },
    span: { type: "int", min: 10, max: 90, def: 40, label: "Bar length (% of the width)" },
    thick: { type: "int", min: 2, max: 8, def: 3, label: "Bar height (px)" },
    corner: { type: "int", min: 0, max: 3, def: 0, label: "Corner", choices: ["top left", "top right", "bottom left", "bottom right"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), Cn = S.p("corner"), L = S.max(S.div(S.mul(S.p("span"), S.w), 100), 4), T = S.p("thick");
    const x0 = S.sel(S.eq(S.mod(Cn, 2), 0), 2, S.sub(S.sub(S.w, L), 4)), y0 = S.sel(S.lt(Cn, 2), 2, S.sub(S.sub(S.h, T), 4));
    const lx = S.sub(S.x, x0), ly = S.sub(S.y, y0), inBox = S.and(S.ge(lx, 0), S.lt(lx, S.add(L, 2)), S.ge(ly, 0), S.lt(ly, S.add(T, 2)));
    const edge = S.or(S.eq(lx, 0), S.eq(ly, 0), S.eq(lx, S.add(L, 1)), S.eq(ly, S.add(T, 1)));
    const filled = S.lt(S.sub(lx, 1), S.div(S.mul(A, L), 100));
    // green above half, yellow to a quarter, red below; red flashes on half the frames
    const col = S.pick([[S.gt(A, 50), S.rgba(74, 224, 90, 255)], [S.gt(A, 25), S.rgba(255, 216, 58, 255)]], S.rgba(232, 40, 60, 255));
    const flash = S.and(S.le(A, 25), S.lt(S.mod(S.frame, 4), 2));
    // a glint runs along the filled part once a loop
    const glint = S.eq(S.sub(lx, 1), S.div(S.mul(S.frame, S.div(S.mul(A, L), 100)), S.FRAMES));
    const fillC = S.sel(S.or(flash, glint), shaderPaintShade(S, col, 140, 30), col), shine = S.eq(ly, 1);
    return S.pick([
      [S.not(inBox), c],
      [edge, S.rgba(16, 16, 24, 255)],
      [filled, S.sel(shine, shaderPaintMix(S, fillC, S.rgba(255, 255, 255, 255), 40), fillC)],
    ], S.rgba(40, 36, 48, 255));
  },
};

SHADER_DEFS.dripdown = {
  label: "Drip down", title: "the cover running down the screen in drips, each column at its own speed, until it has all run down",
  group: "Transitions", kind: "screen", transition: "covered", palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#5a0a14", label: "Cover" },
    tip: { type: "colour", def: "#a01828", label: "Drip tips" },
    column: { type: "int", min: 1, max: 6, def: 2, label: "Drip width (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Drips" },
  },
  fragment: function (S) {
    const p = S.progress(), col = S.div(S.x, S.p("column"));
    // each column runs at 100..200 % speed: the slowest reaches the bottom at 100
    const sp = S.add(100, S.mod(S.hash(col, 1, S.add(S.mul(S.p("seed"), 4), 1811)), 101)), len = S.div(S.mul(S.mul(p, S.h), sp), 10000);
    return S.pick([[S.lt(S.y, len), S.p("cover")], [S.and(S.gt(p, 0), S.lt(p, 100), S.eq(S.y, len)), S.p("tip")]], S.tex(0, 0));
  },
};

SHADER_DEFS.snakefill = {
  label: "Snake fill", title: "tiles of the cover filling the screen in a snake, along the top row, back along the next, and so on",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    tile: { type: "int", min: 2, max: 16, def: 6, label: "Tile (px)" },
    start: { type: "int", min: 0, max: 1, def: 0, label: "Starts", choices: ["at the top", "at the bottom"] },
  },
  fragment: function (S) {
    const p = S.progress(), T = S.p("tile"), nx = S.max(S.div(S.add(S.w, S.sub(T, 1)), T), 1), ny = S.max(S.div(S.add(S.h, S.sub(T, 1)), T), 1);
    const tx = S.div(S.x, T), ty0 = S.div(S.y, T), ty = S.sel(S.eq(S.p("start"), 0), ty0, S.sub(S.sub(ny, 1), ty0));
    const idx = S.add(S.mul(ty, nx), S.sel(S.eq(S.mod(ty, 2), 0), tx, S.sub(S.sub(nx, 1), tx)));
    return S.sel(S.lt(S.mul(idx, 100), S.mul(p, S.mul(nx, ny))), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.motionsmear.variants = [{ reach: 6, thin: 1 }, { moving: 1, reach: 2 }];
SHADER_DEFS.heartbeat.variants = [{ flush: 70 }, { color: "#3affb0", flush: 15 }];
SHADER_DEFS.filmgrain.variants = [{ amount: 50, size: 2 }, { amount: 12, color: 1 }];
SHADER_DEFS.grayscale.variants = [{ by: 1 }, { by: 2 }, { amount: 50 }];
SHADER_DEFS.threshold.variants = [{ soft: 64 }, { level: 80, dark: "#1a1030", light: "#ffd84a", soft: 24 }];
SHADER_DEFS.channelswap.variants = [{ order: 0 }, { order: 1 }, { order: 4 }];
SHADER_DEFS.colorize.variants = [{ hue: "#c8783a" }, { hue: "#3ac85a", amount: 60 }];
SHADER_DEFS.fogofwar.variants = [{ sight: 15, dim: 85 }, { across: 20, down: 70, sight: 60, fog: "#2a1a10" }];
SHADER_DEFS.windowframe.variants = [{ width: 8, body: "#8a5a2a", line: "#2a1608" }, { width: 2, rivets: 0 }];
SHADER_DEFS.dialogbox.variants = [{ height: 45, opacity: 100 }, { panel: "#000000", border: "#ffd84a", arrow: 1 }];
SHADER_DEFS.paused.variants = [{ dim: 80, size: 25 }, { dim: 30, icon: "#ffd84a" }];
SHADER_DEFS.slotgrid.variants = [{ slot: 8, gap: 0 }, { slot: 20, gap: 3, panel: "#3a1a1a", opacity: 80 }];
SHADER_DEFS.healthbar.variants = [{ amount: 20 }, { amount: 45, corner: 3, span: 80, thick: 6 }];
SHADER_DEFS.dripdown.variants = [{ column: 1 }, { column: 6, cover: "#000000", tip: "#404040", seed: 3 }];
SHADER_DEFS.snakefill.variants = [{ tile: 2 }, { tile: 16, start: 1, cover: "#ffffff" }];

// ---- More UI, more weather, two moods, bubbles, two more transitions ----
// ======================================================================================================================
// UI drawn over a screen (a round minimap mask, a tooltip, a marching-ants selection box, a progress ring, a button);
// weather (hail, a wall of sand, acid rain, a lens flare, mist along the ground); two looks (vaporwave, noir); bubbles
// rising off a sprite; and two transitions (the screen split along its diagonal, dots of the cover growing). Private
// helpers shaderUy*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("minimap", "tooltip", "selectbox", "progressring", "uibutton", "hail", "sandwall", "acidrain", "lensflare",
  "groundmist", "vaporwave", "noir", "bubbling", "diagonalsplit", "dotgrow");

// a point given as percentages of the screen, in px
function shaderUyAt(S, ax, ay) { return { x: S.div(S.mul(ax, S.sub(S.w, 1)), 100), y: S.div(S.mul(ay, S.sub(S.h, 1)), 100) }; }
// the pixel is on a 1 px border of the box (x0, y0)..(x1, y1), inclusive; and inside it
function shaderUyBox(S, x0, y0, x1, y1) {
  const inside = S.and(S.ge(S.x, x0), S.le(S.x, x1), S.ge(S.y, y0), S.le(S.y, y1));
  return { inside: inside, edge: S.and(inside, S.or(S.eq(S.x, x0), S.eq(S.x, x1), S.eq(S.y, y0), S.eq(S.y, y1))) };
}

SHADER_DEFS.minimap = {
  label: "Minimap", title: "a round minimap: the screen seen through a circle with a two-tone rim, the rest masked, the player's dot blinking in the middle",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["minimap", "map", "radar", "hud", "ui", "circle", "mask", "navigation", "overworld", "compass"],
  params: {
    size: { type: "int", min: 20, max: 100, def: 85, label: "Size (% of the screen)" },
    rim: { type: "colour", def: "#d8c89a", label: "Rim" },
    mask: { type: "colour", def: "#101018", label: "Outside" },
    player: { type: "colour", def: "#ff3a3a", label: "Player dot" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), R = S.max(S.div(S.mul(S.p("size"), S.min(S.w, S.h)), 100), 4);
    // K.d2 is in half px, R a diameter in px: the same scale
    const ring = S.and(S.ge(K.d2, S.sub(R, 4)), S.lt(K.d2, R)), inner = S.lt(K.d2, S.sub(R, 2));
    const dot = S.and(S.le(K.d2, 2), S.lt(S.mod(S.frame, 8), 5));
    return S.pick([[S.ge(K.d2, R), S.p("mask")], [ring, S.sel(inner, shaderPaintShade(S, S.p("rim"), 60, 0), S.p("rim"))], [dot, S.p("player")]], c);
  },
};

SHADER_DEFS.tooltip = {
  label: "Tooltip", title: "a tooltip panel at a point on the screen: a see-through box with a border, its little pointer below",
  group: "World", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["tooltip", "popup", "panel", "ui", "hint", "hover", "info", "label", "hud", "callout"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Points at, across (%)" },
    down: { type: "int", min: 0, max: 100, def: 70, label: "Points at, down (%)" },
    wide: { type: "int", min: 10, max: 90, def: 50, label: "Width (% of the screen)" },
    tall: { type: "int", min: 10, max: 60, def: 30, label: "Height (% of the screen)" },
    panel: { type: "colour", def: "#1a1a2e", label: "Panel" },
    border: { type: "colour", def: "#e8e0c0", label: "Border" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = shaderUyAt(S, S.p("across"), S.p("down"));
    const bw = S.max(S.div(S.mul(S.p("wide"), S.w), 100), 6), bh = S.max(S.div(S.mul(S.p("tall"), S.h), 100), 4);
    const x0 = S.clamp(S.sub(P.x, S.div(bw, 2)), 0, S.max(S.sub(S.w, bw), 0)), y1 = S.sub(P.y, 3), y0 = S.sub(y1, bh);
    const B = shaderUyBox(S, x0, y0, S.sub(S.add(x0, bw), 1), y1);
    // the pointer: a small triangle from the box's foot down to the point
    const dy = S.sub(S.y, y1), ptr = S.and(S.gt(dy, 0), S.le(dy, 2), S.le(S.abs(S.sub(S.x, P.x)), S.sub(3, dy)));
    const corner = S.and(B.edge, S.or(S.eq(S.x, x0), S.eq(S.x, S.sub(S.add(x0, bw), 1))), S.or(S.eq(S.y, y0), S.eq(S.y, y1)));
    return S.pick([[corner, c], [B.edge, S.p("border")], [S.or(B.inside, ptr), shaderPaintMix(S, c, S.p("panel"), 85)]], c);
  },
};

SHADER_DEFS.selectbox = {
  label: "Selection box", title: "a drag-selection box on the screen: a border of marching dashes, the inside lightly tinted",
  group: "World", kind: "screen", palette: "free", frames: 12, fps: 12, pad: [0, 0, 0, 0],
  tags: ["selection", "marquee", "drag select", "rts", "editor", "box", "marching ants", "ui", "lasso", "units"],
  params: {
    left: { type: "int", min: 0, max: 100, def: 20, label: "Left (%)" },
    top: { type: "int", min: 0, max: 100, def: 25, label: "Top (%)" },
    right: { type: "int", min: 0, max: 100, def: 75, label: "Right (%)" },
    bottom: { type: "int", min: 0, max: 100, def: 80, label: "Bottom (%)" },
    one: { type: "colour", def: "#ffffff", label: "Dashes" },
    two: { type: "colour", def: "#3a8cff", label: "Gaps and tint" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), a = shaderUyAt(S, S.p("left"), S.p("top")), b = shaderUyAt(S, S.p("right"), S.p("bottom"));
    const B = shaderUyBox(S, S.min(a.x, b.x), S.min(a.y, b.y), S.max(a.x, b.x), S.max(a.y, b.y));
    const step = S.div(S.mul(S.frame, 4), S.FRAMES), dash = S.lt(S.mod(S.sub(S.add(S.x, S.y), step), 4), 2);
    return S.pick([[B.edge, S.sel(dash, S.p("one"), S.p("two"))], [B.inside, shaderPaintMix(S, c, S.p("two"), 18)]], c);
  },
};

SHADER_DEFS.progressring = {
  label: "Progress ring", title: "a round progress ring in the middle of the screen, filled clockwise from twelve to the amount, its leading end glowing",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["progress", "ring", "loading", "circle", "ui", "meter", "timer", "charge", "hud", "radial"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 65, label: "Amount (%)" },
    radius: { type: "int", min: 3, max: 30, def: 10, label: "Radius (px)" },
    thick: { type: "int", min: 1, max: 6, def: 2, label: "Thickness (px)" },
    fill: { type: "colour", def: "#3ae0ff", label: "Filled" },
    track: { type: "colour", def: "#202838", label: "Track" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), R2 = S.mul(S.p("radius"), 2), T2 = S.mul(S.p("thick"), 2), A = S.p("amount");
    const onRing = S.and(S.lt(K.d2, R2), S.ge(K.d2, S.sub(R2, T2)));
    const done = S.lt(S.mul(K.a, 100), S.mul(A, 360));
    // the leading end pulses brighter
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), endA = S.div(S.mul(A, 360), 100);
    const lead = S.and(done, S.lt(S.sub(endA, K.a), 20));
    return S.pick([[S.not(onRing), c], [lead, shaderPaintMix(S, S.p("fill"), S.rgba(255, 255, 255, 255), S.add(40, S.div(s, 40)))], [done, S.p("fill")]], S.p("track"));
  },
};

SHADER_DEFS.uibutton = {
  label: "Button", title: "a menu button in the middle of the screen: a beveled face, glowing when hovered, its bevel flipped when pressed",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["button", "ui", "menu", "start", "press", "hover", "interface", "title screen", "click", "panel"],
  params: {
    wide: { type: "int", min: 10, max: 90, def: 50, label: "Width (% of the screen)" },
    tall: { type: "int", min: 10, max: 60, def: 25, label: "Height (% of the screen)" },
    face: { type: "colour", def: "#3a6ac8", label: "Face" },
    mode: { type: "int", min: 0, max: 2, def: 1, label: "State", choices: ["idle", "hovered (glowing)", "pressed"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), bw = S.max(S.div(S.mul(S.p("wide"), S.w), 100), 6), bh = S.max(S.div(S.mul(S.p("tall"), S.h), 100), 5);
    const x0 = S.div(S.sub(S.w, bw), 2), y0 = S.div(S.sub(S.h, bh), 2), St = S.p("mode");
    const B = shaderUyBox(S, x0, y0, S.sub(S.add(x0, bw), 1), S.sub(S.add(y0, bh), 1)), bev = shaderUxBevel(S, S.add(x0, 1), S.add(y0, 1), S.sub(bw, 2), S.sub(bh, 2), 1);
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), glow = S.sel(S.eq(St, 1), S.add(115, S.div(s, 70)), 100);
    const face = shaderPaintShade(S, S.p("face"), S.sel(S.eq(St, 2), 85, glow), 0);
    const lit = S.sel(S.eq(St, 2), 2, 1);
    return S.pick([
      [S.not(B.inside), c],
      [B.edge, S.rgba(10, 10, 20, 255)],
      [S.eq(bev, lit), shaderPaintShade(S, face, 140, 20)],
      [S.gt(bev, 0), shaderPaintShade(S, face, 60, 0)],
    ], face);
  },
};

SHADER_DEFS.hail = {
  label: "Hail", title: "a hailstorm: white pellets pelting down, bouncing and breaking along the bottom of the screen",
  group: "World", kind: "screen", palette: "free", frames: 8, fps: 16, pad: [0, 0, 0, 0],
  tags: ["hail", "hailstorm", "storm", "ice", "weather", "pellets", "winter", "sleet", "cold", "harsh"],
  params: {
    hail: { type: "int", min: 0, max: 100, def: 40, label: "Hail (%)" },
    ice: { type: "colour", def: "#eef6ff", label: "Hailstones" },
    dark: { type: "int", min: 0, max: 60, def: 20, label: "Darken the sky (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), fall = S.div(S.mul(S.frame, 48), S.FRAMES);
    // a 2 x 2 stone in some 6 px cells, the field falling 48 px a loop (eight cells, so it closes)
    const st = function (dx, dy) { return shaderFeField(S, 6, 8, S.p("hail"), 1901, dx, S.sub(dy, fall)).on; };
    const stone = S.or(st(0, 0), st(-1, 0), st(0, -1), st(-1, -1));
    const splash = S.and(S.ge(S.y, S.sub(S.h, 2)), S.lt(S.mod(S.hash(S.x, S.frame, 1902), 100), S.div(S.p("hail"), 4)));
    const sky = shaderPaintMix(S, c, S.rgba(20, 24, 40, 255), S.p("dark"));
    return S.sel(S.or(stone, splash), S.p("ice"), sky);
  },
};

SHADER_DEFS.sandwall = {
  label: "Sand wall", title: "a wall of sand (a haboob) rolling across the screen: a churning front, the scene behind it buried in dust",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 10, pad: [0, 0, 0, 0],
  tags: ["sandstorm", "haboob", "dust storm", "desert", "wall", "storm", "wind", "sand", "weather", "apocalypse"],
  params: {
    sand: { type: "colour", def: "#c8945a", label: "Dust" },
    thick: { type: "int", min: 20, max: 100, def: 75, label: "Dust behind the front (%)" },
    dir: { type: "int", min: 0, max: 1, def: 0, label: "Rolls", choices: ["left to right", "right to left"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), u = S.sel(S.eq(S.p("dir"), 0), S.x, S.sub(S.sub(S.w, 1), S.x));
    // the front crosses once a loop, its edge churned by a drifting noise; the loop starts a quarter of the way across (build
    // 42: it started off the screen, so frame 0 was the plain scene)
    const fr = S.mod(S.add(S.frame, S.div(S.FRAMES, 4)), S.FRAMES);
    const n = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(fr, 16), S.FRAMES)), 4, 1911, 16);
    const front = S.add(S.sub(S.div(S.mul(fr, S.add(S.w, 16)), S.FRAMES), 8), S.div(S.sub(n, 128), 20));
    const behind = S.sub(front, u), t = S.clamp(S.div(S.mul(S.add(behind, 4), S.p("thick")), 12), 0, S.p("thick"));
    const lv = shaderUiSteps(S, t);
    return S.sel(S.gt(lv, 0), shaderPaintMix(S, c, shaderPaintShade(S, S.p("sand"), S.add(80, S.div(n, 8)), 0), S.mul(lv, 31)), c);
  },
};

SHADER_DEFS.acidrain = {
  label: "Acid rain", title: "acid rain: sickly green streaks slanting down, sizzling where they hit the ground, the scene tinted",
  group: "World", kind: "screen", palette: "free", frames: 8, fps: 16, pad: [0, 0, 0, 0],
  tags: ["acid rain", "toxic", "rain", "pollution", "wasteland", "poison", "storm", "green", "dystopia", "weather"],
  params: {
    rain: { type: "int", min: 0, max: 100, def: 35, label: "Rain (%)" },
    drop: { type: "colour", def: "#b8ff3a", label: "Rain" },
    tint: { type: "int", min: 0, max: 60, def: 20, label: "Green tint (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), fall = S.div(S.mul(S.frame, 40), S.FRAMES);
    // streaks three px long falling one across for two down: the field slides 40 px down a loop
    const at = function (k) { return shaderFeField(S, 5, 8, S.p("rain"), 1921, S.add(S.div(S.add(S.y, k), 2), 0), S.sub(S.add(S.y, k), S.add(S.y, fall))).on; };
    const streak = S.or(at(0), at(-1), at(-2));
    const fizz = S.and(S.ge(S.y, S.sub(S.h, 2)), S.lt(S.mod(S.hash(S.x, S.frame, 1922), 100), S.div(S.p("rain"), 3)));
    const tinted = shaderPaintMix(S, c, S.rgba(60, 90, 20, 255), S.p("tint"));
    return S.pick([[streak, S.p("drop")], [fizz, S.rgba(230, 255, 160, 255)]], tinted);
  },
};

SHADER_DEFS.lensflare = {
  label: "Lens flare", title: "a lens flare from a bright light: a glowing source with four rays, rings and discs strung across the screen through its middle",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["lens flare", "sun", "glare", "camera", "cinematic", "light", "summer", "sky", "flare", "bright"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 80, label: "Light across (%)" },
    down: { type: "int", min: 0, max: 100, def: 15, label: "Light down (%)" },
    colors: { type: "palette", def: ["#fff6d0", "#ffb04a", "#7ae0ff", "#c88aff", "#7aff9a"], max: 6, label: "Flare colors" },
    strength: { type: "int", min: 0, max: 100, def: 45, label: "Strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), L = shaderUyAt(S, S.p("across"), S.p("down")), n = S.palCount("colors"), A = S.p("strength");
    const mx = S.div(S.w, 2), my = S.div(S.h, 2), vx = S.sub(mx, L.x), vy = S.sub(my, L.y);
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), pulse = S.div(s, 500);
    let out = c;
    // the elements along the line from the light through the middle: (t in hundredths along it, radius, ring or disc)
    const parts = [[50, 2, 0], [100, 4, 1], [140, 2, 0], [175, 6, 1], [210, 3, 0]];
    for (let k = 0; k < parts.length; k++) {
      const [t, r, ring] = parts[k];
      const px = S.add(L.x, S.div(S.mul(vx, t), 100)), py = S.add(L.y, S.div(S.mul(vy, t), 100)), dx = S.sub(S.x, px), dy = S.sub(S.y, py);
      const d = shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy))), R = S.add(r, pulse);
      const on = ring ? S.eq(d, R) : S.le(d, R);
      out = S.sel(S.and(on, S.lt(shaderWxBayer(S, 1), S.div(S.mul(A, 16), 100))), shaderPaintMix(S, out, S.palAt("colors", S.mod(k + 1, n)), 60), out);
    }
    // the source: a bright core and four short rays
    const sx = S.abs(S.sub(S.x, L.x)), sy = S.abs(S.sub(S.y, L.y)), core = S.le(S.add(S.mul(sx, sx), S.mul(sy, sy)), 5);
    const rays = S.or(S.and(S.eq(sy, 0), S.le(sx, S.add(6, pulse))), S.and(S.eq(sx, 0), S.le(sy, S.add(6, pulse))));
    return S.pick([[core, S.palAt("colors", 0)], [rays, shaderPaintMix(S, c, S.palAt("colors", 0), 75)]], out);
  },
};

SHADER_DEFS.groundmist = {
  label: "Ground mist", title: "mist lying low along the ground, drifting slowly, thicker the lower it gets",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 6, pad: [0, 0, 0, 0],
  tags: ["mist", "fog", "ground fog", "swamp", "graveyard", "spooky", "morning", "marsh", "low cloud", "ambient"],
  params: {
    height: { type: "int", min: 10, max: 80, def: 35, label: "Height (% of the screen)" },
    mist: { type: "colour", def: "#d8e0ec", label: "Mist" },
    thick: { type: "int", min: 10, max: 100, def: 60, label: "Thickness (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 2), up = S.sub(S.h, S.y);
    const n = shaderEnchFlow(S, S.y, S.add(S.x, S.div(S.mul(S.frame, 64), S.FRAMES)), 8, 1931, 64);
    // thicker lower down, broken up by the noise
    const t = S.clamp(S.div(S.mul(S.add(S.sub(S.div(S.mul(S.sub(H, up), 100), H), 30), S.div(S.sub(n, 128), 3)), S.p("thick")), 100), 0, 100);
    const lv = S.sel(S.lt(up, H), shaderUiSteps(S, t), 0);
    return S.sel(S.gt(lv, 0), shaderPaintMix(S, c, S.p("mist"), S.mul(lv, 26)), c);
  },
};

SHADER_DEFS.vaporwave = {
  label: "Vaporwave", title: "vaporwave: the picture mapped onto purple, hot pink and aqua by brightness, with soft scan lines",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["vaporwave", "synthwave", "aesthetic", "80s", "neon", "retro", "pink", "aqua", "outrun", "mall"],
  params: {
    colors: { type: "palette", def: ["#2a0a4a", "#a01a8a", "#ff5ab4", "#5affe8", "#fff0ff"], max: 8, label: "Ramp (dark to light)" },
    amount: { type: "int", min: 0, max: 100, def: 85, label: "Amount (%)" },
    scan: { type: "int", min: 0, max: 50, def: 15, label: "Scan lines (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("colors"), seg = S.div(S.mul(S.luma(c), S.mul(S.sub(n, 1), 16)), 256);
    const i = S.div(seg, 16), col = S.sel(S.gt(S.mod(seg, 16), shaderWxBayer(S, 1)), S.palAt("colors", S.add(i, 1)), S.palAt("colors", i));
    const out = shaderPaintShade(S, shaderPaintMix(S, c, col, S.p("amount")), S.sel(S.eq(S.mod(S.y, 2), 1), S.sub(100, S.p("scan")), 100), 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.noir = {
  label: "Noir", title: "film noir: hard black and white, dark corners, and (if you like) only the reds left in color",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["noir", "film noir", "black and white", "detective", "sin city", "moody", "contrast", "crime", "cinematic", "red"],
  params: {
    contrast: { type: "int", min: 100, max: 250, def: 160, label: "Contrast (%)" },
    corners: { type: "int", min: 0, max: 100, def: 50, label: "Dark corners (%)" },
    reds: { type: "int", min: 0, max: 1, def: 1, label: "Reds", choices: ["gray like the rest", "kept in color"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), l = S.luma(c);
    const g = S.clamp(S.add(S.div(S.mul(S.sub(l, 128), S.p("contrast")), 100), 128), 0, 255);
    const red = S.and(S.eq(S.p("reds"), 1), S.gt(S.r(c), S.add(S.max(S.g(c), S.b(c)), 60)));
    const ex = S.div(S.mul(K.X2, 1000), S.max(S.w, 1)), ey = S.div(S.mul(K.Y2, 1000), S.max(S.h, 1)), r = shaderPaintSqrt(S, S.add(S.mul(ex, ex), S.mul(ey, ey)));
    const lv = shaderUiSteps(S, S.div(S.mul(S.clamp(S.sub(r, 600), 0, 814), S.p("corners")), 814));
    const base = S.sel(red, shaderPaintPunch(S, c, 140), S.rgba(g, g, g, 255));
    const out = shaderPaintShade(S, base, S.sub(100, S.mul(lv, 25)), 0);
    return S.sel(S.solid(c), shaderTkRgb(S, S.r(out), S.g(out), S.b(out)), c);
  },
};

SHADER_DEFS.bubbling = {
  label: "Bubbling", title: "bubbles rising off the sprite as if it were underwater or boiling, each a little ring with a glint",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [6, 0, 0, 0], strength: "amount",
  tags: ["bubbles", "underwater", "boiling", "fizz", "potion", "aquatic", "drowning", "brew", "soda", "rising"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 45, label: "Amount (%)" },
    bubble: { type: "colour", def: "#c8f0ff", label: "Bubbles" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Bubbles" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1941);
    // a 3 x 3 ring in some 6 px cells rising 18 px a loop (three cells), drawn only near the sprite's top
    const rise = S.div(S.mul(S.frame, 18), S.FRAMES), x = S.add(S.x, 384), y = S.add(S.add(S.y, rise), 384);
    const h = S.hash(S.div(x, 6), S.mod(S.div(y, 6), 3), sd), on = S.lt(S.mod(h, 100), A);
    const fx = S.sub(S.mod(x, 6), S.add(1, S.mod(S.div(h, 100), 3))), fy = S.sub(S.mod(y, 6), S.add(1, S.mod(S.div(h, 1000), 3)));
    const box = S.and(S.ge(fx, 0), S.le(fx, 2), S.ge(fy, 0), S.le(fy, 2)), mid = S.and(S.eq(fx, 1), S.eq(fy, 1)), glint = S.and(S.eq(fx, 0), S.eq(fy, 0));
    const near = S.or(S.solid(c), S.le(shaderEnchBelow(S, 6), 6));
    const ring = S.and(S.gt(A, 0), on, box, S.not(mid), near);
    return S.sel(ring, S.sel(glint, S.rgba(255, 255, 255, 255), S.sel(S.solid(c), shaderPaintMix(S, c, S.p("bubble"), 60), S.p("bubble"))), c);
  },
};

SHADER_DEFS.diagonalsplit = {
  label: "Diagonal split", title: "the screen splits along its diagonal and the two halves slide apart, to the top left and the bottom right",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    other: { type: "int", min: 0, max: 1, def: 0, label: "Split", choices: ["top right to bottom left", "top left to bottom right"] },
  },
  fragment: function (S) {
    const p = S.progress(), O = S.eq(S.p("other"), 1), xx = S.sel(O, S.sub(S.sub(S.w, 1), S.x), S.x);
    // the line x h + y w = w h splits the screen; each half slides away from it, easing in
    const side = function (x, y) { return S.lt(S.add(S.mul(x, S.h), S.mul(y, S.w)), S.mul(S.w, S.h)); };
    const off = S.div(S.mul(S.mul(p, p), S.add(S.w, S.h)), 10000), up = side(xx, S.y);
    const sx = S.sel(up, S.add(xx, off), S.sub(xx, off)), sy = S.sel(up, S.add(S.y, off), S.sub(S.y, off));
    const still = S.lt(S.add(S.mul(sx, S.h), S.mul(sy, S.w)), S.mul(S.w, S.h)), same = S.or(S.and(still, up), S.and(S.not(still), S.not(up)));
    const stays = S.and(same, S.ge(sx, 0), S.lt(sx, S.w), S.ge(sy, 0), S.lt(sy, S.h));
    return S.sel(S.and(stays, S.lt(p, 100)), S.texAt(S.sel(O, S.sub(S.sub(S.w, 1), sx), sx), sy, "clamp"), S.p("cover"));
  },
};

SHADER_DEFS.dotgrow = {
  label: "Dot grow", title: "a halftone wipe: dots of the cover growing on a grid until they merge, in a wave across or from the middle",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    spacing: { type: "int", min: 3, max: 16, def: 6, label: "Dot spacing (px)" },
    order: { type: "int", min: 0, max: 2, def: 1, label: "Order", choices: ["all at once", "a wave across", "from the middle out"] },
    spread: { type: "int", min: 0, max: 200, def: 100, label: "Spread" },
  },
  fragment: function (S) {
    const p = S.progress(), P = S.p("spacing"), bx = S.div(S.x, P), by = S.div(S.y, P), O = S.p("order"), sp = S.p("spread");
    const nx = S.max(S.div(S.add(S.w, S.sub(P, 1)), P), 1), ny = S.max(S.div(S.add(S.h, S.sub(P, 1)), P), 1);
    const ddx = S.abs(S.sub(S.mul(bx, 2), S.sub(nx, 1))), ddy = S.abs(S.sub(S.mul(by, 2), S.sub(ny, 1)));
    const rank = S.pick([[S.eq(O, 0), 0], [S.eq(O, 1), S.div(S.mul(bx, 100), nx)]], S.div(S.mul(S.max(ddx, ddy), 100), S.max(S.max(nx, ny), 1)));
    const q = S.clamp(S.sub(S.div(S.mul(p, S.add(100, sp)), 100), S.div(S.mul(rank, sp), 100)), 0, 100);
    const fx2 = S.sub(S.add(S.mul(S.mod(S.x, P), 2), 1), P), fy2 = S.sub(S.add(S.mul(S.mod(S.y, P), 2), 1), P);
    // the dot's radius in half px reaches past the cell's corners (1.43 x the spacing) at 100
    const r = S.div(S.mul(S.mul(q, P), 143), 10000), d2 = S.add(S.mul(fx2, fx2), S.mul(fy2, fy2));
    return S.sel(S.and(S.gt(q, 0), S.lt(d2, S.mul(r, r))), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.minimap.variants = [{ size: 50, rim: "#a0a8b8" }, { size: 100, mask: "#000000", player: "#3aff6a" }];
SHADER_DEFS.tooltip.variants = [{ across: 15, down: 90, wide: 70 }, { panel: "#f4ecd8", border: "#5a3a1a", tall: 50 }];
SHADER_DEFS.selectbox.variants = [{ left: 5, top: 5, right: 95, bottom: 95 }, { left: 60, top: 10, right: 30, bottom: 50, two: "#3aff6a" }];
SHADER_DEFS.progressring.variants = [{ amount: 25, radius: 14, thick: 4 }, { amount: 100, fill: "#ffd84a" }];
SHADER_DEFS.uibutton.variants = [{ mode: 0 }, { mode: 2, face: "#c83a3a" }, { wide: 80, tall: 15, face: "#3aa05a" }];
SHADER_DEFS.hail.variants = [{ hail: 90, dark: 40 }, { hail: 15, dark: 0 }];
SHADER_DEFS.sandwall.variants = [{ thick: 100 }, { dir: 1, sand: "#8a8a7a", thick: 50 }];
SHADER_DEFS.acidrain.variants = [{ rain: 80, tint: 40 }, { rain: 15, drop: "#ff5aff", tint: 0 }];
SHADER_DEFS.lensflare.variants = [{ across: 15, down: 20, strength: 80 }, { strength: 20, colors: ["#ffffff", "#7ab0ff"] }];
SHADER_DEFS.groundmist.variants = [{ height: 70, thick: 100 }, { height: 15, mist: "#a8f0b0" }];
SHADER_DEFS.vaporwave.variants = [{ scan: 0, amount: 100 }, { colors: ["#0a1a3a", "#3a3aa8", "#ff7ab4", "#ffe0a0"], scan: 40 }];
SHADER_DEFS.noir.variants = [{ reds: 0, contrast: 220 }, { contrast: 120, corners: 90 }];
SHADER_DEFS.bubbling.variants = [{ amount: 100 }, { amount: 20, bubble: "#a8ff9a", seed: 3 }];
SHADER_DEFS.diagonalsplit.variants = [{ other: 1 }, { cover: "#ffffff" }];
SHADER_DEFS.dotgrow.variants = [{ order: 0, spacing: 3 }, { order: 2, spacing: 16, spread: 200, cover: "#ff3a6a" }];

// ---- Crafted surfaces, the sea and the snow globe, comic bursts, three more transitions ----
// ======================================================================================================================
// For a sprite: a plush toy with stitches, kintsugi gold-filled cracks, candlelight from below, a glossy highlight, an
// erode tool. Looks: voxels, a red-cyan anaglyph, notebook paper. For the screen: ocean waves, bokeh, a snow globe, a
// comic "pow" burst. Transitions: a ripple wipe, a block shuffle, a hex fill. Private helpers shaderKs*; earlier
// helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("plushie", "kintsugi", "candlelit", "glossy", "erode", "voxels", "anaglyph", "notebook", "oceanwaves", "bokeh",
  "snowglobe", "burstbubble", "ripplewipe", "shuffle", "hexfill");

// the hex cell a pixel falls in (rows of W x 7W/8, every other one shifted half a width): its center
function shaderKsHex(S, W) {
  const H = S.max(S.div(S.mul(W, 7), 8), 2);
  const cand = function (r) {
    const off = S.mul(S.mod(r, 2), S.div(W, 2)), col = S.div(S.add(S.sub(S.x, off), S.mul(W, 64)), W);
    return { x: S.add(S.add(S.sub(S.mul(col, W), S.mul(W, 64)), off), S.div(W, 2)), y: S.add(S.mul(r, H), S.div(H, 2)) };
  };
  const r0 = S.div(S.y, H), A = cand(r0), B = cand(S.sub(r0, 1)), C = cand(S.add(r0, 1));
  const dist = function (q) { const dx = S.sub(S.x, q.x), dy = S.sub(S.y, q.y); return S.add(S.mul(dx, dx), S.div(S.mul(S.mul(dy, dy), 4), 3)); };
  const dA = dist(A), dB = dist(B), dC = dist(C), useB = S.and(S.le(dB, dA), S.le(dB, dC)), useC = S.and(S.not(useB), S.le(dC, dA));
  return { x: S.pick([[useB, B.x], [useC, C.x]], A.x), y: S.pick([[useB, B.y], [useC, C.y]], A.y) };
}

SHADER_DEFS.plushie = {
  label: "Plushie", title: "the sprite as a plush toy: soft fabric colors with a woven texture, a line of stitches running just inside its edge",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["plushie", "plush", "toy", "fabric", "stitches", "soft", "cute", "felt", "kawaii", "stuffed"],
  params: {
    soften: { type: "int", min: 0, max: 80, def: 25, label: "Soften colors (%)" },
    thread: { type: "colour", def: "#3a2a2a", label: "Stitches" },
    weave: { type: "int", min: 0, max: 20, def: 8, label: "Fabric texture" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), soft = shaderPaintPunch(S, c, S.sub(100, S.p("soften")));
    const fabric = shaderPaintShade(S, soft, S.sel(S.eq(S.mod(S.add(S.x, S.y), 2), 0), S.add(100, S.p("weave")), S.sub(100, S.p("weave"))), 0);
    // the stitches: one ring in from the edge, every third pixel along it
    const seam = S.and(S.solid(c), S.eq(shaderEnchDepth(S, 2), 1), S.eq(S.mod(S.add(S.x, S.y), 3), 0));
    return S.sel(S.solid(c), S.sel(seam, S.p("thread"), shaderTkRgb(S, S.r(fabric), S.g(fabric), S.b(fabric))), c);
  },
};

SHADER_DEFS.kintsugi = {
  label: "Kintsugi", title: "kintsugi: the sprite broken and mended with gold, golden seams running through it, glinting, the body optionally porcelain",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["kintsugi", "gold", "cracks", "mended", "porcelain", "japanese", "ceramic", "repair", "art", "precious"],
  params: {
    piece: { type: "int", min: 3, max: 12, def: 7, label: "Pieces (px)" },
    gold: { type: "colour", def: "#f0c040", label: "Gold" },
    body: { type: "int", min: 0, max: 1, def: 0, label: "Body", choices: ["its own colors", "white porcelain"] },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Break" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 2001);
    const v = shaderPaintCells(S, S.p("piece"), sd), seam = shaderPaintJoin(S, v, 1);
    const glint = S.and(seam, S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 10), 0));
    const l = S.luma(c), por = shaderPaintMix(S, S.rgba(250, 250, 246, 255), S.rgba(150, 168, 200, 255), S.sub(100, S.div(S.mul(l, 100), 255)));
    const base = S.sel(S.eq(S.p("body"), 1), por, c);
    return S.pick([[S.not(S.solid(c)), c], [glint, S.rgba(255, 252, 230, 255)], [seam, S.p("gold")]], base);
  },
};

SHADER_DEFS.candlelit = {
  label: "Candlelit", title: "the sprite lit by a flickering candle below it: warm light on its lower parts and underside, the top falling into shade",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0],
  tags: ["candle", "candlelit", "warm", "flicker", "spooky", "campfire", "story", "horror", "light", "cozy"],
  params: {
    warm: { type: "colour", def: "#ffb050", label: "Candlelight" },
    shade: { type: "colour", def: "#1a1020", label: "Shade" },
    strength: { type: "int", min: 0, max: 100, def: 55, label: "Strength (%)" },
    flicker: { type: "int", min: 0, max: 40, def: 15, label: "Flicker (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("strength"), f = S.mod(S.hash(S.frame, 1, 2011), S.add(S.p("flicker"), 1));
    // light rises from the foot: t is 100 at the bottom, 0 at the top, dipping with the flicker
    const t = S.sub(S.div(S.mul(S.y, 100), S.max(S.h, 1)), f), under = S.not(S.solid(S.tex(0, 1)));
    const lit = shaderPaintMix(S, c, S.p("warm"), S.div(S.mul(S.max(t, 0), A), 150));
    const out = S.sel(S.lt(t, 40), shaderPaintMix(S, lit, S.p("shade"), S.div(S.mul(S.sub(40, t), A), 80)), lit);
    return S.sel(S.solid(c), S.sel(under, shaderPaintMix(S, c, S.p("warm"), S.div(S.mul(A, 8), 10)), out), c);
  },
};

SHADER_DEFS.glossy = {
  label: "Glossy", title: "the sprite glossy like plastic or candy: colors richer, a bright specular streak inside its upper-left edge, a dot of shine",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["glossy", "shiny", "plastic", "candy", "gloss", "jelly", "toy", "polished", "gem", "sticker"],
  params: {
    punch: { type: "int", min: 100, max: 200, def: 125, label: "Richer colors (%)" },
    shine: { type: "colour", def: "#ffffff", label: "Shine" },
    strength: { type: "int", min: 0, max: 100, def: 70, label: "Shine strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("strength"), rich = shaderPaintPunch(S, c, S.p("punch"));
    // the streak: one pixel in from an edge that is open up and to the left
    const edgeUL = S.and(S.solid(S.tex(-1, -1)), S.or(S.not(S.solid(S.tex(-2, -1))), S.not(S.solid(S.tex(-1, -2)))));
    const streak = S.and(S.solid(c), S.not(shaderPaintRim(S)), edgeUL);
    const dot = S.and(S.solid(c), S.not(shaderPaintRim(S)), S.not(S.solid(S.tex(-2, -2))), S.solid(S.tex(-1, -1)), S.solid(S.tex(1, 1)));
    const out = S.pick([[dot, shaderPaintMix(S, rich, S.p("shine"), A)], [streak, shaderPaintMix(S, rich, S.p("shine"), S.div(A, 2))]], rich);
    return S.sel(S.solid(c), shaderTkRgb(S, S.r(out), S.g(out), S.b(out)), c);
  },
};

SHADER_DEFS.erode = {
  label: "Erode", title: "a tool that eats the sprite's silhouette in by one or two pixels all round (to thin outlines or shrink a shape)",
  group: "Looks", kind: "sprite", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["erode", "shrink", "thin", "trim", "outline", "tool", "silhouette", "mask", "cleanup", "morphology"],
  params: {
    by: { type: "int", min: 1, max: 3, def: 1, label: "Eat in by (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0);
    return S.sel(S.lt(shaderEnchDepth(S, 3), S.p("by")), S.clear, c);
  },
};

SHADER_DEFS.voxels = {
  label: "Voxels", title: "the picture built of little cubes: each block one flat color, lit on its top and left, shaded on its bottom and right",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["voxels", "cubes", "blocks", "3d", "minecraft-like", "isometric", "lego-like", "chunky", "pixel", "bevel"],
  params: {
    block: { type: "int", min: 2, max: 8, def: 3, label: "Block (px)" },
    light: { type: "int", min: 0, max: 60, def: 25, label: "Lit faces (%)" },
    dark: { type: "int", min: 0, max: 60, def: 30, label: "Shaded faces (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), B = S.p("block"), cc = shaderOldCell(S, B, B), col = S.sel(S.solid(cc), cc, c);
    const fx = S.mod(S.x, B), fy = S.mod(S.y, B), e = S.sub(B, 1);
    const out = S.pick([[S.or(S.eq(fx, e), S.eq(fy, e)), shaderPaintShade(S, col, S.sub(100, S.p("dark")), 0)], [S.or(S.eq(fx, 0), S.eq(fy, 0)), shaderPaintShade(S, col, S.add(100, S.p("light")), 8)]], col);
    return S.sel(S.solid(c), shaderTkRgb(S, S.r(out), S.g(out), S.b(out)), c);
  },
};

SHADER_DEFS.anaglyph = {
  label: "Anaglyph 3D", title: "red-cyan 3D glasses: the picture's brightness taken as depth, the red eye and the cyan eye pulled apart by it",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["anaglyph", "3d", "red cyan", "stereo", "glasses", "retro", "comic", "depth", "b-movie", "pop"],
  params: {
    depth: { type: "int", min: 0, max: 4, def: 2, label: "Depth (px)" },
    color: { type: "int", min: 0, max: 1, def: 0, label: "Eyes", choices: ["gray (classic)", "keep the colors"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), d = S.div(S.mul(S.luma(c), S.p("depth")), 255);
    const L = S.texAt(S.add(S.x, d), S.y, "clamp"), R = S.texAt(S.sub(S.x, d), S.y, "clamp"), keep = S.eq(S.p("color"), 1);
    const rr = S.sel(keep, S.r(L), S.luma(L)), gg = S.sel(keep, S.g(R), S.luma(R)), bb = S.sel(keep, S.b(R), S.luma(R));
    return S.sel(S.solid(c), S.rgba(rr, gg, bb, 255), c);
  },
};

SHADER_DEFS.notebook = {
  label: "Notebook paper", title: "lined notebook paper over the scene: pale blue rules, a red margin line, punched holes down the side",
  group: "Looks", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["notebook", "lined paper", "school", "doodle", "sketch", "paper", "rules", "margin", "journal", "homework"],
  params: {
    rule: { type: "int", min: 3, max: 16, def: 6, label: "Line spacing (px)" },
    lines: { type: "colour", def: "#8ab0e8", label: "Rules" },
    margin: { type: "colour", def: "#e86a7a", label: "Margin" },
    holes: { type: "int", min: 0, max: 1, def: 1, label: "Holes", choices: ["none", "punched"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), m = S.max(S.div(S.w, 8), 4);
    const rule = S.eq(S.mod(S.y, S.p("rule")), S.sub(S.p("rule"), 1)), marg = S.eq(S.x, m);
    const hy = S.mod(S.y, S.max(S.div(S.h, 3), 4)), hole = S.and(S.eq(S.p("holes"), 1), S.le(S.add(S.mul(S.sub(S.x, S.div(m, 2)), S.sub(S.x, S.div(m, 2))), S.mul(S.sub(hy, S.div(S.max(S.div(S.h, 3), 4), 2)), S.sub(hy, S.div(S.max(S.div(S.h, 3), 4), 2)))), 2));
    return S.pick([[hole, S.rgba(40, 40, 48, 255)], [marg, shaderPaintMix(S, c, S.p("margin"), 75)], [rule, shaderPaintMix(S, c, S.p("lines"), 55)]], c);
  },
};

SHADER_DEFS.oceanwaves = {
  label: "Ocean waves", title: "the sea below a horizon: rows of foamy wave crests rolling toward you, tinted deeper the nearer they come",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["ocean", "waves", "sea", "beach", "surf", "water", "coast", "summer", "sailing", "tide"],
  params: {
    horizon: { type: "int", min: 0, max: 80, def: 40, label: "Horizon (% down)" },
    sea: { type: "colour", def: "#1a6ab0", label: "Sea" },
    foam: { type: "colour", def: "#eef8ff", label: "Foam" },
    tint: { type: "int", min: 0, max: 100, def: 45, label: "Sea tint (%)" },
    spacing: { type: "int", min: 3, max: 12, def: 6, label: "Wave spacing (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), hz = S.div(S.mul(S.p("horizon"), S.h), 100), P = S.p("spacing"), dy = S.sub(S.y, hz);
    const s = shaderMotionSin(S, S.add(S.mul(S.x, 20), S.div(S.mul(S.frame, 360), S.FRAMES)));
    const yy = S.add(S.sub(S.y, S.div(S.mul(S.frame, P), S.FRAMES)), S.div(s, 700));
    const crest = S.and(S.gt(dy, 0), S.eq(S.mod(S.add(yy, S.mul(P, 64)), P), 0), S.lt(S.mod(S.hash(S.div(S.x, 3), S.div(yy, P), 2021), 100), 70));
    const deep = S.div(S.mul(S.min(S.mul(dy, 100), S.mul(S.max(S.sub(S.h, hz), 1), 100)), S.p("tint")), S.mul(S.max(S.sub(S.h, hz), 1), 100));
    return S.pick([[S.le(dy, 0), c], [crest, S.p("foam")]], shaderPaintMix(S, c, S.p("sea"), deep));
  },
};

SHADER_DEFS.bokeh = {
  label: "Bokeh", title: "out-of-focus lights drifting up the screen as soft dithered discs, in a few warm colors",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["bokeh", "lights", "blur", "dreamy", "romantic", "city", "night", "festive", "glow", "photo"],
  params: {
    lights: { type: "int", min: 0, max: 100, def: 40, label: "Lights (%)" },
    colors: { type: "palette", def: ["#ffd08a", "#ff9ab8", "#9ad8ff", "#fff0c0"], max: 6, label: "Lights" },
    strength: { type: "int", min: 0, max: 100, def: 45, label: "Strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("colors"), rise = S.div(S.mul(S.frame, 30), S.FRAMES);
    // a disc of radius 2-4 in some 10 px cells, the field rising 30 px a loop (three cells)
    const x = S.add(S.x, 640), y = S.add(S.add(S.y, rise), 640), h = S.hash(S.div(x, 10), S.mod(S.div(y, 10), 3), 2031);
    const on = S.lt(S.mod(h, 100), S.p("lights")), r = S.add(2, S.mod(S.div(h, 100), 3));
    const dx = S.sub(S.mod(x, 10), 5), dy = S.sub(S.mod(y, 10), 5), d2 = S.add(S.mul(dx, dx), S.mul(dy, dy));
    const disc = S.and(on, S.le(d2, S.mul(r, r))), rim = S.and(disc, S.gt(d2, S.mul(S.sub(r, 1), S.sub(r, 1))));
    const fill = S.and(disc, S.eq(S.mod(S.add(S.x, S.y), 2), 0)), col = S.palAt("colors", S.mod(S.div(h, 7), n));
    return S.pick([[rim, shaderPaintMix(S, c, col, S.p("strength"))], [fill, shaderPaintMix(S, c, col, S.div(S.p("strength"), 2))]], c);
  },
};

SHADER_DEFS.snowglobe = {
  label: "Snow globe", title: "the screen inside a snow globe: snow swirling round in the glass, a highlight on its curve, the rest dark",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["snow globe", "snow", "christmas", "winter", "glass", "souvenir", "holiday", "swirl", "magic", "festive"],
  params: {
    size: { type: "int", min: 30, max: 100, def: 90, label: "Size (% of the screen)" },
    snow: { type: "int", min: 0, max: 100, def: 30, label: "Snow (%)" },
    outside: { type: "colour", def: "#101420", label: "Outside" },
    glass: { type: "colour", def: "#ffffff", label: "Highlight" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), D = S.max(S.div(S.mul(S.p("size"), S.min(S.w, S.h)), 100), 4);
    // snow on rings 2 half px wide, each turning once a loop the other way from its neighbors, faster near the middle
    const ring = S.div(K.d2, 4), dir = S.sel(S.eq(S.mod(ring, 2), 0), 1, -1);
    const spin = S.div(S.mul(S.mul(S.frame, 360), dir), S.FRAMES), a = S.mod(S.add(S.add(K.a, spin), 720), 360);
    const flake = S.and(S.lt(K.d2, S.sub(D, 3)), S.lt(S.mod(S.hash(S.div(a, 12), ring, 2041), 100), S.p("snow")), S.lt(S.mod(a, 12), 2));
    const hl = S.and(S.lt(K.d2, D), S.ge(K.d2, S.sub(D, 5)), S.gt(K.a, 200), S.lt(K.a, 250));
    return S.pick([[S.ge(K.d2, D), S.p("outside")], [hl, S.p("glass")], [S.ge(K.d2, S.sub(D, 2)), shaderPaintMix(S, c, S.p("glass"), 35)], [flake, S.rgba(250, 252, 255, 255)]], c);
  },
};

SHADER_DEFS.burstbubble = {
  label: "Comic burst", title: "a comic 'pow' burst at a point: a jagged star of loud color with an ink outline, quivering",
  group: "World", kind: "screen", palette: "free", frames: 8, fps: 12, pad: [0, 0, 0, 0],
  tags: ["pow", "comic", "burst", "explosion", "bang", "boom", "cartoon", "onomatopoeia", "impact", "pop art"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Across (%)" },
    down: { type: "int", min: 0, max: 100, def: 50, label: "Down (%)" },
    size: { type: "int", min: 10, max: 100, def: 45, label: "Size (% of the screen)" },
    spikes: { type: "int", min: 5, max: 16, def: 10, label: "Spikes" },
    fill: { type: "colour", def: "#ffe03a", label: "Fill" },
    ink: { type: "colour", def: "#101010", label: "Outline" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = shaderUyAt(S, S.p("across"), S.p("down")), K = shaderUiClock(S, P.x, P.y);
    const Rout = S.max(S.div(S.mul(S.p("size"), S.min(S.w, S.h)), 100), 4), Rin = S.div(S.mul(Rout, 55), 100), per = S.max(S.div(360, S.p("spikes")), 1);
    // the outline's radius at this angle: spikes at their middles, valleys between, the star quivering a few degrees
    const jit = S.sub(S.mod(S.hash(S.frame, 1, 2051), 7), 3), f = S.mod(S.add(S.add(K.a, jit), 720), per);
    const tri = S.div(S.mul(S.abs(S.sub(S.mul(f, 2), per)), 100), per), lim = S.add(Rin, S.div(S.mul(S.sub(Rout, Rin), S.sub(100, tri)), 100));
    return S.pick([[S.lt(K.d2, S.sub(lim, 2)), S.p("fill")], [S.lt(K.d2, lim), S.p("ink")]], c);
  },
};

SHADER_DEFS.ripplewipe = {
  label: "Ripple wipe", title: "the cover spreads out from the middle like a drop in water, a ripple rolling ahead of it bending the picture",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    ripple: { type: "int", min: 2, max: 16, def: 8, label: "Ripple width (px)" },
    push: { type: "int", min: 1, max: 4, def: 2, label: "Ripple bend (px)" },
  },
  fragment: function (S) {
    const p = S.progress(), K = shaderUiClock(S), Rm = S.add(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 2);
    const R = S.div(S.mul(Rm, p), 100), W2 = S.mul(S.p("ripple"), 2), ahead = S.sub(K.d2, R);
    const inRip = S.and(S.gt(p, 0), S.ge(ahead, 0), S.lt(ahead, W2));
    const bend = S.sel(inRip, S.div(S.mul(shaderMotionSin(S, S.div(S.mul(ahead, 360), S.max(W2, 1))), S.p("push")), 1000), 0);
    const dd = S.max(K.d2, 1), q = S.texAt(S.add(S.x, S.div(S.mul(K.X2, bend), dd)), S.add(S.y, S.div(S.mul(K.Y2, bend), dd)), "clamp");
    return S.sel(S.or(S.lt(K.d2, R), S.eq(p, 100)), S.p("cover"), q);
  },
};

SHADER_DEFS.shuffle = {
  label: "Shuffle", title: "the screen's blocks shuffled about more and more, jumping to wrong places, then dithering out to the cover",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    block: { type: "int", min: 2, max: 16, def: 6, label: "Block (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Shuffle" },
  },
  fragment: function (S) {
    const p = S.progress(), B = S.p("block"), bx = S.div(S.x, B), by = S.div(S.y, B), sd = S.add(S.mul(S.p("seed"), 4), 2061);
    const nx = S.max(S.div(S.add(S.w, S.sub(B, 1)), B), 1), ny = S.max(S.div(S.add(S.h, S.sub(B, 1)), B), 1);
    // a block is shuffled once its turn (0..59) has come; the shuffle changes in steps of a tenth of the progress
    const turn = S.mod(S.hash(bx, by, sd), 60), moved = S.and(S.gt(p, 0), S.ge(p, turn)), step = S.div(p, 10);
    const h = S.hash(bx, S.add(by, S.mul(step, 97)), S.add(sd, 1)), tx = S.mod(h, nx), ty = S.mod(S.div(h, 100), ny);
    const sx = S.sel(moved, S.add(S.mul(tx, B), S.mod(S.x, B)), S.x), sy = S.sel(moved, S.add(S.mul(ty, B), S.mod(S.y, B)), S.y);
    return S.sel(shaderTxFade(S, p, 60), S.p("cover"), S.texAt(sx, sy, "clamp"));
  },
};

SHADER_DEFS.hexfill = {
  label: "Hex fill", title: "hexagons of the cover filling the screen, in a wave across or at random, until it is covered",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    hex: { type: "int", min: 3, max: 16, def: 6, label: "Hex size (px)" },
    order: { type: "int", min: 0, max: 1, def: 0, label: "Order", choices: ["a wave across", "at random"] },
  },
  fragment: function (S) {
    const p = S.progress(), C = shaderKsHex(S, S.p("hex"));
    const rank = S.sel(S.eq(S.p("order"), 0), S.clamp(S.div(S.mul(C.x, 100), S.max(S.w, 1)), 0, 99), S.mod(S.hash(C.x, C.y, 2071), 100));
    return S.sel(S.lt(rank, p), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.plushie.variants = [{ soften: 60, weave: 16 }, { thread: "#ffffff", soften: 0 }];
SHADER_DEFS.kintsugi.variants = [{ body: 1 }, { piece: 3, gold: "#d8e0ec", seed: 5 }];
SHADER_DEFS.candlelit.variants = [{ strength: 100, flicker: 40 }, { warm: "#7ac8ff", strength: 40, flicker: 0 }];
SHADER_DEFS.glossy.variants = [{ punch: 170, strength: 100 }, { punch: 100, shine: "#ffe8f0", strength: 40 }];
SHADER_DEFS.erode.variants = [{ by: 2 }, { by: 3 }];
SHADER_DEFS.voxels.variants = [{ block: 2 }, { block: 6, light: 45, dark: 50 }];
SHADER_DEFS.anaglyph.variants = [{ depth: 4 }, { depth: 1, color: 1 }];
SHADER_DEFS.notebook.variants = [{ rule: 4, holes: 0 }, { rule: 10, lines: "#c8c8c8", margin: "#c8c8c8" }];
SHADER_DEFS.oceanwaves.variants = [{ horizon: 20, spacing: 4, tint: 70 }, { horizon: 60, sea: "#2a8a7a", spacing: 10 }];
SHADER_DEFS.bokeh.variants = [{ lights: 80, strength: 70 }, { lights: 20, colors: ["#ffffff", "#b0d0ff"] }];
SHADER_DEFS.snowglobe.variants = [{ snow: 60 }, { size: 60, snow: 15, outside: "#2a1a10" }];
SHADER_DEFS.burstbubble.variants = [{ spikes: 16, size: 80, fill: "#ff3a5a" }, { across: 25, down: 30, spikes: 6, size: 30, fill: "#7ae0ff" }];
SHADER_DEFS.ripplewipe.variants = [{ ripple: 16, push: 4 }, { ripple: 2, push: 1, cover: "#ffffff" }];
SHADER_DEFS.shuffle.variants = [{ block: 2 }, { block: 16, cover: "#1a0a2a", seed: 4 }];
SHADER_DEFS.hexfill.variants = [{ order: 1, hex: 3 }, { hex: 14, cover: "#ffffff" }];

// ---- Combat, buffs, MacPaint and cabinet strips, nature, two more transitions ----
// ======================================================================================================================
// Combat beats for a sprite (a slash arc, a critical-hit flash, a parry spark, knockback, a smoke bomb, buff and debuff
// arrows, power absorbed); two retro looks (MacPaint's fill patterns, an arcade cabinet's colored overlay strips);
// nature on the screen (waterfall spray, cave glowworms, drifting pollen, grass in the foreground); and two transitions
// (eyelids closing, diagonal blinds). Private helpers shaderCb*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("slash", "critflash", "parry", "knockback", "smokebomb", "statarrows", "absorb", "macpaint", "colorstrips",
  "mistspray", "glowworms", "pollen", "foregroundgrass", "eyelids", "blindsdiag");

// near the sprite: on it or within three px (Chebyshev) of it
function shaderCbNear(S) { return S.or(S.solid(S.tex(0, 0)), shaderEnchRing1(S), shaderEnchRing2(S), shaderTxRing3(S)); }
// MacPaint-style 4 x 4 fill patterns, dark to light (solid, dense, bricks, thick diagonals, checker, thin diagonals,
// dots, sparse dots, white): 1 is ink
const SHADER_CB_PATTERNS = [].concat(
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0], [1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1],
  [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
// an up chevron in a 5 x 4 cell (rows top down): 1 where the arrow is
const SHADER_CB_CHEVRON = [0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];

SHADER_DEFS.slash = {
  label: "Slash", title: "a sword slash across the sprite: a bright arc sweeping through it in a few frames, its tail fading, then gone",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 12, fps: 24, pad: [3, 3, 3, 3], still0: true,   // a one-shot: rests plain (build 42)
  tags: ["slash", "sword", "cut", "attack", "hit", "swing", "combat", "blade", "strike", "arc"],
  params: {
    edge: { type: "colour", def: "#ffffff", label: "Edge" },
    trail: { type: "colour", def: "#9ad8ff", label: "Trail" },
    from: { type: "int", min: 0, max: 1, def: 0, label: "Swings", choices: ["from the top right", "from the top left"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 12), S.FRAMES), left = S.eq(S.p("from"), 1);
    // the arc's center sits off the image's upper corner; its radius reaches the image's middle
    const cx = S.sel(left, S.neg(S.div(S.w, 4)), S.add(S.w, S.div(S.w, 4))), cy = S.neg(S.div(S.h, 4));
    const P = shaderWxPolar(S, cx, cy), mx = S.sub(S.div(S.w, 2), cx), my = S.sub(S.div(S.h, 2), cy);
    const R = shaderPaintSqrt(S, S.add(S.mul(mx, mx), S.mul(my, my))), amid = shaderMotionAtan(S, mx, my);
    // the head sweeps 96 degrees over six frames; the band trails 40 degrees behind it
    const dirn = S.sel(left, -1, 1), head = S.add(S.sub(amid, S.mul(dirn, 48)), S.mul(S.mul(t, 16), dirn));
    const back = S.mul(S.sub(head, P.ang), dirn), onArc = S.le(S.abs(S.sub(P.d, R)), 1);
    const live = S.and(S.lt(t, 7), onArc, S.ge(back, 0), S.lt(back, 40), shaderCbNear(S));
    return S.sel(live, S.sel(S.lt(back, 12), S.p("edge"), S.sel(S.solid(c), shaderPaintMix(S, c, S.p("trail"), 70), S.p("trail"))), c);
  },
};

SHADER_DEFS.critflash = {
  label: "Critical hit", title: "a critical hit: the sprite flashes white, burns red with a red outline, then a white outline, then calm",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 12, fps: 24, pad: [1, 1, 1, 1],
  tags: ["critical", "crit", "hit", "damage", "flash", "combat", "strike", "rpg", "fighting", "impact"],
  params: {
    flash: { type: "colour", def: "#ffffff", label: "Flash" },
    burn: { type: "colour", def: "#ff2a3a", label: "Burn" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 12), S.FRAMES), r1 = shaderEnchRing1(S), on = S.solid(c);
    return S.pick([
      [S.and(on, S.lt(t, 2)), S.p("flash")],
      [S.and(r1, S.ge(t, 2), S.lt(t, 4)), S.p("burn")],
      [S.and(on, S.ge(t, 2), S.lt(t, 4)), shaderPaintMix(S, c, S.p("burn"), 60)],
      [S.and(r1, S.ge(t, 4), S.lt(t, 6)), S.p("flash")],
    ], c);
  },
};

SHADER_DEFS.parry = {
  label: "Parry", title: "a parry or block: a burst of sparks off a point on the sprite's edge and a ring of light, gone in a blink",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 12, fps: 24, pad: [3, 3, 3, 3],
  tags: ["parry", "block", "clang", "spark", "deflect", "shield", "guard", "combat", "metal", "counter"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 75, label: "Point across (%)" },
    down: { type: "int", min: 0, max: 100, def: 35, label: "Point down (%)" },
    spark: { type: "colour", def: "#fff2a0", label: "Sparks" },
    ring: { type: "colour", def: "#ffffff", label: "Ring" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 12), S.FRAMES), P = shaderWxPolar(S, S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), S.div(S.mul(S.p("down"), S.sub(S.h, 1)), 100));
    const live = S.and(S.lt(t, 6), shaderCbNear(S));
    const ray = shaderFwOnRay(S, P.ang, S.mul(S.div(S.add(P.ang, 22), 45), 45), P.d);
    const sparks = S.and(live, ray, S.ge(P.d, t), S.le(P.d, S.add(S.mul(t, 2), 1)));
    const ring = S.and(live, S.eq(P.d, S.add(t, 1)), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    return S.pick([[sparks, S.p("spark")], [ring, S.p("ring")]], c);
  },
};

SHADER_DEFS.knockback = {
  label: "Knockback", title: "the sprite knocked back by a hit: flashing, jolted a few pixels away, a fading ghost left where it stood, then sliding home",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 16, pad: [0, 3, 0, 3], still0: true,
  tags: ["knockback", "hit", "recoil", "stagger", "pushed", "combat", "damage", "jolt", "hurt", "fighting"],
  params: {
    away: { type: "int", min: 0, max: 1, def: 0, label: "Knocked", choices: ["to the left", "to the right"] },
    flash: { type: "colour", def: "#ffffff", label: "Flash" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 16), S.FRAMES), dir = S.sel(S.eq(S.p("away"), 0), -1, 1);
    // 0, then 3 px away, easing home over the rest of the loop
    const SHIFT = [0, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0];
    const dx = S.mul(S.table(SHIFT, t), dir), q = S.texAt(S.sub(S.x, dx), S.y, "clear");
    const ghost = S.and(S.ge(t, 1), S.lt(t, 5), S.not(S.solid(q)), S.solid(c), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    return S.pick([[S.and(S.solid(q), S.eq(t, 1)), S.p("flash")], [S.solid(q), q], [ghost, shaderPaintMix(S, c, S.p("flash"), 40)]], S.clear);
  },
};

SHADER_DEFS.smokebomb = {
  label: "Smoke bomb", title: "a smoke bomb: a puff of smoke billowing over the sprite and hiding it, then thinning away",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [3, 3, 3, 3],
  tags: ["smoke bomb", "smoke", "puff", "poof", "ninja", "vanish", "teleport", "escape", "cloud", "magic"],
  params: {
    smoke: { type: "colour", def: "#b8b8c4", label: "Smoke" },
    light: { type: "colour", def: "#e8e8f0", label: "Highlights" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 16), S.FRAMES);
    // thickest at frame 4, gone by 14
    const DENS = [40, 120, 200, 240, 255, 240, 210, 180, 150, 120, 90, 60, 35, 15, 0, 0];
    const n = shaderPaintNoise(S, S.x, S.sub(S.y, S.div(t, 2)), 3, S.add(2101, S.div(t, 4)));
    const on = S.and(shaderCbNear(S), S.lt(S.sub(255, n), S.table(DENS, t)));
    const hi = S.and(on, S.gt(n, S.sub(285, S.div(S.table(DENS, t), 4))));
    return S.pick([[hi, S.p("light")], [on, S.p("smoke")]], c);
  },
};

SHADER_DEFS.statarrows = {
  label: "Stat arrows", title: "a buff or debuff: chevron arrows rising (or sinking) through and round the sprite",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [3, 3, 3, 3],
  tags: ["buff", "debuff", "arrows", "stat up", "stat down", "status", "rpg", "strength", "chevrons", "power"],
  params: {
    way: { type: "int", min: 0, max: 1, def: 0, label: "Arrows", choices: ["rise (a buff)", "sink (a debuff)"] },
    arrow: { type: "colour", def: "#5aff7a", label: "Arrows (green for a buff, red for a debuff)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sink = S.eq(S.p("way"), 1);
    // 5 x 4 chevron cells moving 8 px a loop (two cells, so it closes), staggered by column
    const mv = S.div(S.mul(S.frame, 8), S.FRAMES), cx = S.div(S.x, 5);
    const yy = S.add(S.add(S.sel(sink, S.sub(S.y, mv), S.add(S.y, mv)), S.mul(S.mod(cx, 2), 2)), 64);
    const fy = S.sel(sink, S.sub(3, S.mod(yy, 4)), S.mod(yy, 4));
    const on = S.and(S.eq(S.mod(S.div(yy, 4), 2), 0), S.eq(S.table(SHADER_CB_CHEVRON, S.add(S.mul(fy, 5), S.mod(S.x, 5))), 1), shaderCbNear(S));
    const col = S.p("arrow");
    return S.sel(on, S.sel(S.solid(c), shaderPaintMix(S, c, col, 70), col), c);
  },
};

SHADER_DEFS.absorb = {
  label: "Absorb", title: "power being absorbed: sparks drawn in from three pixels out, one ring a step, the sprite glowing as they arrive",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 16, pad: [3, 3, 3, 3],
  tags: ["absorb", "charge", "power up", "drain", "gather", "energy", "magic", "xp", "soak", "channel"],
  params: {
    spark: { type: "colour", def: "#9a7aff", label: "Sparks" },
    glow: { type: "colour", def: "#e0d8ff", label: "Glow" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 16), S.FRAMES), sp = S.eq(S.mod(S.add(S.add(S.x, S.y), S.div(t, 4)), 2), 0);
    const spark = S.and(sp, S.or(S.and(S.lt(t, 4), shaderTxRing3(S)), S.and(S.ge(t, 4), S.lt(t, 8), shaderEnchRing2(S)), S.and(S.ge(t, 8), S.lt(t, 12), shaderEnchRing1(S))));
    const glowing = S.and(S.solid(c), S.ge(t, 12));
    return S.pick([[spark, S.p("spark")], [glowing, shaderPaintMix(S, c, S.p("glow"), S.sel(S.lt(t, 14), 60, 30))]], c);
  },
};

SHADER_DEFS.macpaint = {
  label: "MacPaint", title: "the picture in early Mac 1-bit fill patterns: solid, bricks, diagonals, checks and dots by brightness",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["macpaint", "mac", "1-bit", "patterns", "1984", "bitmap", "monochrome", "retro", "fill", "hypercard"],
  params: {
    ink: { type: "colour", def: "#000000", label: "Ink" },
    paper: { type: "colour", def: "#ffffff", label: "Paper" },
    scale: { type: "int", min: 1, max: 3, def: 1, label: "Pattern pixel (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("scale"), lv = S.div(S.mul(S.luma(c), 9), 256);
    const bit = S.table(SHADER_CB_PATTERNS, S.add(S.mul(lv, 16), S.add(S.mul(S.mod(S.div(S.y, K), 4), 4), S.mod(S.div(S.x, K), 4))));
    return S.sel(S.solid(c), S.sel(S.eq(bit, 1), S.p("ink"), S.p("paper")), c);
  },
};

SHADER_DEFS.colorstrips = {
  label: "Cabinet strips", title: "an arcade cabinet's colored overlay strips: bands of tinted film over a black-and-white screen, coloring what shows through",
  group: "Eras and display", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["overlay", "cellophane", "arcade", "space invaders", "strips", "1978", "tint", "cabinet", "retro", "film"],
  params: {
    bands: { type: "palette", def: ["#ff5a3a", "#ffffff", "#ffffff", "#ffffff", "#3aff5a"], max: 8, label: "Strips, top to bottom" },
    gray: { type: "int", min: 0, max: 100, def: 100, label: "Gray the screen first (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("bands"), T = S.palAt("bands", S.div(S.mul(S.y, n), S.max(S.h, 1)));
    const g = shaderPaintMix(S, c, shaderPaintGrey(S, c), S.p("gray"));
    return S.rgba(S.div(S.mul(S.r(g), S.r(T)), 255), S.div(S.mul(S.g(g), S.g(T)), 255), S.div(S.mul(S.b(g), S.b(T)), 255), 255);
  },
};

SHADER_DEFS.mistspray = {
  label: "Mist spray", title: "spray rising off a waterfall's foot or a crashing wave: white mist billowing up along the bottom of the screen",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["mist", "spray", "waterfall", "splash", "foam", "surf", "steam", "vapor", "water", "nature"],
  params: {
    height: { type: "int", min: 10, max: 80, def: 35, label: "Height (% of the screen)" },
    mist: { type: "colour", def: "#f0f8ff", label: "Mist" },
    thick: { type: "int", min: 10, max: 100, def: 65, label: "Thickness (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 2), up = S.sub(S.h, S.y);
    const n = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, 2111, 16);
    const t = S.clamp(S.div(S.mul(S.add(S.sub(S.div(S.mul(S.sub(H, up), 100), H), 20), S.div(S.sub(n, 128), 2)), S.p("thick")), 100), 0, 100);
    const lv = S.sel(S.lt(up, H), shaderUiSteps(S, t), 0);
    return S.sel(S.gt(lv, 0), shaderPaintMix(S, c, S.p("mist"), S.mul(lv, 28)), c);
  },
};

SHADER_DEFS.glowworms = {
  label: "Glowworms", title: "a cave ceiling of glowworms: tiny blue-green lights twinkling across the top, faint silk threads hanging under them",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["glowworms", "cave", "lights", "bioluminescent", "night", "underground", "twinkle", "magic", "grotto", "ambient"],
  params: {
    worms: { type: "int", min: 0, max: 100, def: 30, label: "Glowworms (%)" },
    glow: { type: "colour", def: "#5affe0", label: "Glow" },
    height: { type: "int", min: 10, max: 100, def: 40, label: "In the top (% of the screen)" },
    dark: { type: "int", min: 0, max: 100, def: 35, label: "Darken (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), top = S.max(S.div(S.mul(S.p("height"), S.h), 100), 3);
    // a worm in some 4 x 5 cells: a light at a hashed spot, a 2-4 px thread below it
    const cx = S.div(S.x, 4), cy = S.div(S.y, 5), h = S.hash(cx, cy, 2121), on = S.and(S.lt(S.y, top), S.lt(S.mod(h, 100), S.p("worms")));
    const fx = S.mod(S.div(h, 100), 4), fy = S.mod(S.div(h, 400), 2), lx = S.mod(S.x, 4), ly = S.mod(S.y, 5);
    const light = S.and(on, S.eq(lx, fx), S.eq(ly, fy)), thread = S.and(on, S.eq(lx, fx), S.gt(ly, fy), S.le(ly, S.add(fy, S.add(2, S.mod(S.div(h, 800), 3)))));
    const tw = S.mod(S.add(S.div(h, 7), S.frame), 32), bright = S.lt(tw, 24);
    const bg = shaderPaintMix(S, c, S.rgba(2, 6, 10, 255), S.sel(S.lt(S.y, top), S.p("dark"), 0));
    return S.pick([[light, S.sel(bright, S.p("glow"), shaderPaintMix(S, bg, S.p("glow"), 40))], [thread, shaderPaintMix(S, bg, S.p("glow"), 18)]], bg);
  },
};

SHADER_DEFS.pollen = {
  label: "Pollen", title: "golden pollen drifting lazily through warm air, the motes twinkling as they catch the light",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["pollen", "dust motes", "summer", "meadow", "spring", "sunlight", "particles", "dreamy", "golden hour", "ambient"],
  params: {
    motes: { type: "int", min: 0, max: 100, def: 35, label: "Motes (%)" },
    gold: { type: "colour", def: "#ffe07a", label: "Pollen" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Motes" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), sd = S.add(S.mul(S.p("seed"), 4), 2131);
    // the field sinks 28 px a loop and sways 3 px either way
    const fall = S.div(S.mul(S.frame, 28), S.FRAMES), sway = S.div(S.mul(shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), 3), 1000);
    const f = shaderFeField(S, 7, 4, S.p("motes"), sd, sway, S.neg(fall)), tw = S.lt(S.mod(S.add(S.div(f.h, 13), S.frame), 8), 5);
    return S.sel(f.on, S.sel(tw, S.p("gold"), shaderPaintMix(S, c, S.p("gold"), 50)), c);
  },
};

SHADER_DEFS.foregroundgrass = {
  label: "Foreground grass", title: "tall grass along the bottom of the screen in the foreground, each blade its own height, swaying in the breeze",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["grass", "foreground", "meadow", "field", "nature", "sway", "wind", "blades", "outdoor", "parallax"],
  params: {
    height: { type: "int", min: 5, max: 60, def: 25, label: "Tallest (% of the screen)" },
    dark: { type: "colour", def: "#1a3a1a", label: "Base" },
    tip: { type: "colour", def: "#5aa03a", label: "Tips" },
    sway: { type: "int", min: 0, max: 3, def: 2, label: "Sway (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 2), up = S.sub(S.sub(S.h, 1), S.y);
    // the blade under this pixel, read from the column the wind has bent it from (more the higher up)
    const s = shaderMotionSin(S, S.add(S.mul(S.x, 15), S.div(S.mul(S.frame, 360), S.FRAMES)));
    const col = S.sub(S.x, S.div(S.mul(S.mul(s, S.p("sway")), up), S.mul(S.max(H, 1), 1000)));
    const bh = S.add(S.div(H, 3), S.mod(S.hash(col, 1, 2141), S.add(S.div(S.mul(H, 2), 3), 1)));
    const blade = S.and(S.lt(up, bh), S.ne(S.mod(S.hash(col, 2, 2141), 3), 0));
    return S.sel(blade, shaderPaintMix(S, S.p("dark"), S.p("tip"), S.div(S.mul(up, 100), S.max(bh, 1))), c);
  },
};

SHADER_DEFS.eyelids = {
  label: "Eyelids", title: "eyelids closing on the screen: lids curving down from the top and up from the bottom until they meet",
  group: "Transitions", kind: "screen", transition: "covered", palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Lids" },
    lash: { type: "colour", def: "#3a2a2a", label: "Lid edge" },
    curve: { type: "int", min: 0, max: 50, def: 25, label: "Curve (% of the height)" },
  },
  fragment: function (S) {
    const p = S.progress(), hh = S.div(S.add(S.h, 1), 2), X = S.div(S.mul(S.sub(S.mul(S.x, 2), S.w), 100), S.max(S.w, 1));   // -100..100
    // each lid's edge: closing with progress, bowed toward the middle mid-way (none at the ends)
    const bow = S.div(S.mul(S.mul(S.div(S.mul(S.p("curve"), S.h), 100), S.sub(10000, S.mul(X, X))), S.mul(p, S.sub(100, p))), 25000000);
    const top = S.add(S.div(S.mul(p, hh), 100), bow), bot = S.sub(S.sub(S.h, S.div(S.mul(p, hh), 100)), bow);
    const shut = S.or(S.lt(S.y, top), S.ge(S.y, bot), S.eq(p, 100));
    const edge = S.and(S.gt(p, 0), S.or(S.eq(S.y, top), S.eq(S.y, S.sub(bot, 1))));
    return S.pick([[shut, S.p("cover")], [edge, S.p("lash")]], S.tex(0, 0));
  },
};

SHADER_DEFS.blindsdiag = {
  label: "Diagonal blinds", title: "diagonal slats closing from each slat's middle outward",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    slat: { type: "int", min: 2, max: 32, def: 8, label: "Slat width (px)" },
    lean: { type: "int", min: 0, max: 1, def: 0, label: "Lean", choices: ["/ (rising)", "\\ (falling)"] },
  },
  fragment: function (S) {
    const B = S.p("slat"), u = S.add(S.sel(S.eq(S.p("lean"), 0), S.add(S.x, S.y), S.sub(S.x, S.y)), S.mul(B, 64));
    const f2 = S.abs(S.sub(S.add(S.mul(S.mod(u, B), 2), 1), B));
    return S.sel(S.lt(S.mul(f2, 100), S.mul(S.progress(), B)), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.slash.variants = [{ from: 1 }, { edge: "#ffe0a0", trail: "#ff6a3a" }];
SHADER_DEFS.critflash.variants = [{ burn: "#ffb03a" }, { flash: "#c8f0ff", burn: "#3a8cff" }];
SHADER_DEFS.parry.variants = [{ across: 25, down: 50 }, { spark: "#7ae0ff", ring: "#c8f0ff" }];
SHADER_DEFS.knockback.variants = [{ away: 1 }, { flash: "#ff3a3a" }];
SHADER_DEFS.smokebomb.variants = [{ smoke: "#5a3a7a", light: "#a07ac8" }, { smoke: "#d8d0c0", light: "#ffffff" }];
SHADER_DEFS.statarrows.variants = [{ way: 1, arrow: "#ff4a5a" }, { arrow: "#5ad0ff" }];
SHADER_DEFS.absorb.variants = [{ spark: "#5aff9a", glow: "#e0ffe8" }, { spark: "#ff8a3a", glow: "#fff0d8" }];
SHADER_DEFS.macpaint.variants = [{ scale: 2 }, { ink: "#1a1a3a", paper: "#f0e8d0" }];
SHADER_DEFS.colorstrips.variants = [{ bands: ["#3a8cff", "#ffffff", "#ffd83a"] }, { gray: 0 }];
SHADER_DEFS.mistspray.variants = [{ height: 70, thick: 100 }, { height: 15, mist: "#e0fff0" }];
SHADER_DEFS.glowworms.variants = [{ worms: 70, dark: 70 }, { worms: 15, glow: "#b0e0ff", height: 100 }];
SHADER_DEFS.pollen.variants = [{ motes: 80 }, { motes: 15, gold: "#ffffff", seed: 4 }];
SHADER_DEFS.foregroundgrass.variants = [{ height: 50, sway: 3 }, { height: 12, dark: "#3a2a10", tip: "#c8a03a", sway: 1 }];
SHADER_DEFS.eyelids.variants = [{ curve: 50 }, { curve: 0, cover: "#2a0a0a" }];
SHADER_DEFS.blindsdiag.variants = [{ lean: 1, slat: 4 }, { slat: 16, cover: "#ffffff" }];

// ---- Five more machines, a swamp and a sunset, HUD pieces, slime, two more transitions ----
// ======================================================================================================================
// Machines (a plasma panel, a Teletype printout, the Genesis's 9-bit color, the MSX's color clash, EGA); the screen (a
// bubbling swamp, a synthwave sunset); HUD and broadcast pieces (a crosshair, a compass bar, a banner, a TV test card);
// slime on a sprite; and two transitions (a card flipping over, tiles filling in a spiral). Private helpers shaderMx*;
// earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("plasmadisplay", "teletype", "genesis", "msx", "ega", "swampbubbles", "sunset", "crosshair", "compassbar", "banner",
  "testcard", "slimed", "cardflip", "spiralfill");

// Teletype glyphs, 3 x 5, from blank to dense (space . : + # @): 1 is ink
const SHADER_MX_GLYPHS = [].concat(
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0], [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1]);
// the SMPTE-style bars: seven colors across, then a reversed strip under them
// a constant color from "#rrggbb" (free effects)
function shaderMxHex(S, h) { return S.rgba(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255); }
const SHADER_MX_BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];

SHADER_DEFS.plasmadisplay = {
  label: "Plasma display", title: "an old gas-plasma panel: the picture in glowing orange cells with dark gaps, a few steps of brightness, rows flickering",
  group: "Eras and display", kind: "both", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["plasma", "gas plasma", "orange", "monochrome", "laptop", "1980s", "display", "pinball", "panel", "retro"],
  params: {
    gas: { type: "colour", def: "#ff6a1e", label: "Glow" },
    cell: { type: "int", min: 2, max: 4, def: 2, label: "Cell (px, with its gap)" },
    steps: { type: "int", min: 2, max: 8, def: 4, label: "Brightness steps" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("cell"), N = S.p("steps"), cc = shaderOldCell(S, K, K);
    const gap = S.or(S.eq(S.mod(S.x, K), S.sub(K, 1)), S.eq(S.mod(S.y, K), S.sub(K, 1)));
    const k = S.div(S.mul(S.luma(S.sel(S.solid(cc), cc, c)), N), 256), fl = S.sel(S.eq(S.mod(S.hash(S.div(S.y, K), S.frame, 2201), 9), 0), 12, 0);
    const t = S.max(S.sub(S.div(S.mul(S.add(k, S.sel(S.gt(k, 0), 1, 0)), 100), S.add(N, 1)), fl), 0);
    const out = S.sel(gap, S.rgba(12, 4, 2, 255), shaderPaintMix(S, S.rgba(30, 8, 4, 255), S.p("gas"), t));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.teletype = {
  label: "Teletype", title: "the picture typed out on a Teletype: rows of characters from space to @ by darkness, the ink uneven",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["teletype", "typewriter", "ascii", "text art", "printout", "terminal", "characters", "retro", "1960s", "paper"],
  params: {
    ink: { type: "colour", def: "#1a1a22", label: "Ink" },
    paper: { type: "colour", def: "#f4eedc", label: "Paper" },
    worn: { type: "int", min: 0, max: 50, def: 15, label: "Faded ink (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), cc = shaderOldCell(S, 4, 6), col = S.sel(S.solid(cc), cc, c);
    // 4 x 6 cells: a 3 x 5 glyph with a column and a row of space
    const fx = S.mod(S.x, 4), fy = S.mod(S.y, 6), lv = S.div(S.mul(S.sub(255, S.luma(col)), 6), 256);
    const bit = S.and(S.lt(fx, 3), S.lt(fy, 5), S.eq(S.table(SHADER_MX_GLYPHS, S.add(S.mul(lv, 15), S.add(S.mul(fy, 3), fx))), 1));
    const faded = S.lt(S.mod(S.hash(S.x, S.y, 2211), 100), S.p("worn"));
    return S.sel(S.solid(c), S.sel(S.and(bit, S.not(faded)), S.p("ink"), S.p("paper")), c);
  },
};

SHADER_DEFS.genesis = {
  label: "Genesis", title: "a 16-bit console's 9-bit color: each channel in eight steps, lightly dithered between them",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["genesis", "mega drive", "16-bit", "9-bit color", "retro", "console", "1988", "dither", "sega-like", "quantize"],
  params: {
    dither: { type: "int", min: 0, max: 36, def: 14, label: "Dither" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), o = S.div(S.mul(S.sub(S.mul(shaderWxBayer(S, 1), 2), 15), S.p("dither")), 15);
    const q = function (v) { return S.mul(S.div(S.clamp(S.add(v, o), 0, 255), 36), 36); };
    return S.sel(S.solid(c), S.rgba(S.min(q(S.r(c)), 252), S.min(q(S.g(c)), 252), S.min(q(S.b(c)), 252), 255), c);
  },
};

SHADER_DEFS.msx = {
  label: "MSX", title: "an MSX's color clash: the TMS9918's fifteen colors, only two in each eight-pixel run of a line",
  group: "Eras and display", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["msx", "tms9918", "color clash", "8-bit", "retro", "home computer", "1983", "japan", "attribute", "clash"],
  params: {
    run: { type: "int", min: 2, max: 8, def: 8, label: "Run (px)" },
    colors: { type: "palette", def: ["#000000", "#3eb849", "#74d07d", "#5955e0", "#8076f1", "#b95e51", "#65dbef", "#db6559", "#ff897d", "#ccc35e", "#ded087", "#3aa241", "#b766b5", "#cccccc", "#ffffff"], max: 16, label: "Colors" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), R = S.p("run"), x0 = S.mul(S.div(S.x, R), R);
    let dark = c, light = c;
    for (let k = 0; k < 4; k++) {
      const p = S.texAt(S.add(x0, S.div(S.mul(S.add(S.mul(k, 2), 1), R), 8)), S.y, "clamp");
      dark = S.sel(S.and(S.solid(p), S.lt(S.luma(p), S.luma(dark))), p, dark);
      light = S.sel(S.and(S.solid(p), S.gt(S.luma(p), S.luma(light))), p, light);
    }
    const ink = S.nearest(dark, "colors", "redmean"), paper = S.nearest(light, "colors", "redmean"), l = S.luma(c);
    return S.sel(S.solid(c), S.sel(S.le(S.abs(S.sub(l, S.luma(ink))), S.abs(S.sub(l, S.luma(paper)))), ink, paper), c);
  },
};

SHADER_DEFS.ega = {
  label: "EGA", title: "an IBM PC's EGA card: its sixteen colors, dithered, square pixels",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["ega", "ibm pc", "dos", "16-color", "retro", "1984", "adventure game", "pc", "vga", "dither"],
  params: {
    colors: { type: "palette", def: ["#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa", "#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff"], max: 16, label: "Colors" },
    dither: { type: "int", min: 0, max: 96, def: 32, label: "Dither" },
  },
  fragment: function (S) { return shaderOldMap(S, "colors", 1, S.p("dither")); },
};

SHADER_DEFS.swampbubbles = {
  label: "Swamp bubbles", title: "a swamp's surface along the bottom of the screen: tinted murky green, bubbles swelling up and popping into rings",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0],
  tags: ["swamp", "bubbles", "marsh", "bog", "toxic", "murky", "pop", "sludge", "cauldron", "tar pit"],
  params: {
    height: { type: "int", min: 10, max: 100, def: 40, label: "Surface (% of the screen, from the bottom)" },
    murk: { type: "colour", def: "#3a5a1a", label: "Murk" },
    bubble: { type: "colour", def: "#a8d05a", label: "Bubbles" },
    tint: { type: "int", min: 0, max: 100, def: 35, label: "Tint (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 3), y0 = S.sub(S.h, H), inSwamp = S.ge(S.y, y0);
    let hit = S.i(0);
    for (let m = 0; m < 6; m++) {
      // bubble m swells over six frames from its own start, pops into a ring for two, then is gone
      const t = S.div(S.mul(S.mod(S.sub(S.add(S.frame, S.FRAMES), S.div(S.mul(S.FRAMES, m), 6)), S.FRAMES), 16), S.FRAMES);
      const hb = S.hash(m, 4, 2221), bx = S.mod(hb, S.max(S.w, 1)), by = S.add(y0, S.add(1, S.mod(S.div(hb, 100), S.max(S.sub(H, 2), 1))));
      const dx = S.sub(S.x, bx), dy = S.sub(S.y, by), d = shaderPaintSqrt(S, S.add(S.mul(dx, dx), S.mul(dy, dy)));
      const swell = S.and(S.lt(t, 6), S.le(d, S.div(t, 2))), pop = S.and(S.ge(t, 6), S.lt(t, 8), S.eq(d, S.sub(t, 3)));
      hit = S.sel(swell, 2, S.sel(S.and(pop, S.eq(hit, 0)), 1, hit));
    }
    const murky = S.sel(inSwamp, shaderPaintMix(S, c, S.p("murk"), S.p("tint")), c);
    return S.pick([[S.and(inSwamp, S.eq(hit, 2)), shaderPaintMix(S, murky, S.p("bubble"), 70)], [S.and(inSwamp, S.eq(hit, 1)), S.p("bubble")]], murky);
  },
};

SHADER_DEFS.sunset = {
  label: "Synthwave sunset", title: "a synthwave sunset: warm bands over the sky, a striped sun on the horizon, its stripes sliding down",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["sunset", "synthwave", "outrun", "retrowave", "80s", "sun", "vaporwave", "horizon", "neon", "dusk"],
  params: {
    horizon: { type: "int", min: 20, max: 90, def: 60, label: "Horizon (% down)" },
    size: { type: "int", min: 10, max: 60, def: 30, label: "Sun size (% of the height)" },
    colors: { type: "palette", def: ["#ffd84a", "#ff8a3a", "#ff3a7a", "#7a2aa8", "#1a0a3a"], max: 8, label: "Sky, horizon up" },
    blend: { type: "int", min: 0, max: 100, def: 70, label: "Over the picture (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), hz = S.div(S.mul(S.p("horizon"), S.h), 100), n = S.palCount("colors"), up = S.sub(hz, S.y);
    // sky bands by height, dithered between neighbors
    const seg = S.div(S.mul(S.max(up, 0), S.mul(S.sub(n, 1), 16)), S.max(hz, 1)), i = S.div(seg, 16);
    const sky = S.sel(S.gt(S.mod(seg, 16), shaderWxBayer(S, 1)), S.palAt("colors", S.min(S.add(i, 1), S.sub(n, 1))), S.palAt("colors", i));
    // the sun: a disc on the horizon, its lower half cut by stripes that slide down and widen
    const R = S.max(S.div(S.mul(S.p("size"), S.h), 200), 2), dx = S.sub(S.x, S.div(S.w, 2)), dy = S.sub(S.y, hz);
    const inSun = S.le(S.add(S.mul(dx, dx), S.mul(dy, dy)), S.mul(R, R)), below = S.sub(S.y, S.sub(hz, R));
    const stripe = S.and(S.gt(S.mul(below, 2), R), S.lt(S.mod(S.add(below, S.div(S.mul(S.frame, 8), S.FRAMES)), 8), S.div(S.mul(below, 4), S.max(S.mul(R, 2), 1))));
    const sunC = S.palAt("colors", S.div(S.mul(S.max(S.sub(hz, S.y), 0), 2), S.max(R, 1)));
    // the stripes are cut in the darkest color (build 42: they showed the sky, the sun's own color at the horizon, so unseen)
    return S.pick([[S.and(inSun, S.lt(S.y, hz), stripe), shaderPaintMix(S, c, S.palAt("colors", S.sub(n, 1)), S.p("blend"))],
      [S.and(inSun, S.lt(S.y, hz)), shaderPaintMix(S, c, sunC, S.p("blend"))], [S.lt(S.y, hz), shaderPaintMix(S, c, sky, S.p("blend"))]], c);
  },
};

SHADER_DEFS.crosshair = {
  label: "Crosshair", title: "a gun sight in the middle of the screen: four lines with a gap, a small ring, a center dot, pulsing when on target",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["crosshair", "reticle", "aim", "fps", "shooter", "hud", "sight", "gun", "target", "scope"],
  params: {
    color: { type: "colour", def: "#3aff6a", label: "Sight" },
    size: { type: "int", min: 3, max: 30, def: 8, label: "Line length (px)" },
    gap: { type: "int", min: 0, max: 10, def: 3, label: "Gap (px)" },
    ring: { type: "int", min: 0, max: 1, def: 1, label: "Ring", choices: ["none", "a small ring"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), dx = S.sub(S.x, S.div(S.w, 2)), dy = S.sub(S.y, S.div(S.h, 2)), ax = S.abs(dx), ay = S.abs(dy), G = S.p("gap");
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), L = S.add(S.p("size"), S.div(s, 600));
    const lines = S.or(S.and(S.eq(dy, 0), S.gt(ax, G), S.le(ax, S.add(G, L))), S.and(S.eq(dx, 0), S.gt(ay, G), S.le(ay, S.add(G, L))));
    const d2 = S.add(S.mul(dx, dx), S.mul(dy, dy)), r = S.add(G, 1);
    const ringOn = S.and(S.eq(S.p("ring"), 1), S.gt(G, 1), S.le(S.abs(S.sub(d2, S.mul(r, r))), r));
    return S.sel(S.or(lines, ringOn, S.eq(d2, 0)), S.p("color"), c);
  },
};

SHADER_DEFS.compassbar = {
  label: "Compass bar", title: "an open-world compass strip along the top: ticks scrolling past as the heading turns, cardinal marks taller, a pointer in the middle",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["compass", "heading", "hud", "open world", "navigation", "bar", "ui", "direction", "skyrim-like", "ticks"],
  params: {
    tick: { type: "int", min: 2, max: 12, def: 4, label: "Tick spacing (px)" },
    bar: { type: "colour", def: "#101420", label: "Bar" },
    mark: { type: "colour", def: "#e8e0c8", label: "Ticks" },
    north: { type: "colour", def: "#ff4a3a", label: "North" },
    turn: { type: "int", min: 0, max: 2, def: 1, label: "Turns a loop" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), T = S.p("tick"), y = S.y, inBar = S.lt(y, 7);
    // a full turn is sixteen ticks (four between cardinals); the strip scrolls by `turn` turns a loop
    const off = S.div(S.mul(S.mul(S.frame, S.mul(T, 16)), S.p("turn")), S.FRAMES), u = S.add(S.add(S.x, off), S.mul(T, 1024)), k = S.mod(S.div(u, T), 16);
    const onTick = S.eq(S.mod(u, T), 0), card = S.eq(S.mod(k, 4), 0);
    const tickPx = S.and(onTick, S.ge(y, S.sel(card, 1, 3)), S.le(y, 5)), isN = S.and(card, S.eq(k, 0));
    const ptr = S.and(S.eq(y, 6), S.le(S.abs(S.sub(S.x, S.div(S.w, 2))), 1));
    return S.pick([[S.not(inBar), c], [ptr, S.p("north")], [tickPx, S.sel(isN, S.p("north"), S.p("mark"))]], shaderPaintMix(S, c, S.p("bar"), 75));
  },
};

SHADER_DEFS.banner = {
  label: "Banner", title: "a title banner across the middle of the screen: a band with lit edges, a shine sweeping along it",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["banner", "title", "level start", "stage clear", "ribbon", "ui", "announcement", "hud", "strip", "victory"],
  params: {
    height: { type: "int", min: 10, max: 60, def: 25, label: "Height (% of the screen)" },
    band: { type: "colour", def: "#a01a2a", label: "Band" },
    edge: { type: "colour", def: "#ffd84a", label: "Edges" },
    opacity: { type: "int", min: 0, max: 100, def: 85, label: "Opacity (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 3), y0 = S.div(S.sub(S.h, H), 2), ly = S.sub(S.y, y0);
    const inBand = S.and(S.ge(ly, 0), S.lt(ly, H)), edge = S.or(S.eq(ly, 0), S.eq(ly, S.sub(H, 1)));
    const sw = S.div(S.mul(S.frame, S.add(S.w, H)), S.FRAMES), shine = S.lt(S.mod(S.sub(S.add(S.x, ly), sw), S.add(S.w, H)), 2);
    return S.pick([[S.not(inBand), c], [edge, S.p("edge")], [shine, shaderPaintMix(S, S.p("band"), S.rgba(255, 255, 255, 255), 45)]], shaderPaintMix(S, c, S.p("band"), S.p("opacity")));
  },
};

SHADER_DEFS.testcard = {
  label: "Test card", title: "a TV test card over the screen: seven color bars, a reversed strip, a black-and-white foot, its corner tone light blinking",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["test card", "color bars", "smpte", "tv", "broadcast", "off air", "signal", "retro", "no signal", "calibration"],
  params: {
    blend: { type: "int", min: 0, max: 100, def: 100, label: "Over the picture (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), bar = S.div(S.mul(S.x, 7), S.max(S.w, 1)), y1 = S.div(S.mul(S.h, 2), 3), y2 = S.div(S.mul(S.h, 3), 4);
    const pick = function (i) { return S.pick(SHADER_MX_BARS.slice(0, 6).map(function (h, k) { return [S.eq(i, k), shaderMxHex(S, h)]; }), shaderMxHex(S, SHADER_MX_BARS[6])); };
    const top = pick(bar), mid = S.sel(S.eq(S.mod(bar, 2), 0), pick(S.sub(6, bar)), S.rgba(16, 16, 16, 255));
    const q = S.div(S.mul(S.x, 4), S.max(S.w, 1)), foot = S.pick([[S.eq(q, 0), S.rgba(0, 32, 76, 255)], [S.eq(q, 1), S.rgba(235, 235, 235, 255)], [S.eq(q, 2), S.rgba(50, 0, 106, 255)]], S.rgba(16, 16, 16, 255));
    const blink = S.and(S.lt(S.mod(S.frame, 8), 4), S.ge(S.x, S.sub(S.w, 3)), S.ge(S.y, S.sub(S.h, 3)));
    const card = S.pick([[blink, S.rgba(255, 255, 255, 255)], [S.lt(S.y, y1), top], [S.lt(S.y, y2), mid]], foot);
    return shaderPaintMix(S, c, card, S.p("blend"));
  },
};

SHADER_DEFS.slimed = {
  label: "Slimed", title: "the sprite slimed: green goo poured over its top and running down it in drips, glistening",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["slime", "slimed", "goo", "ooze", "gross", "ghost", "drip", "gunk", "sticky", "debuff"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 40, label: "Amount (%)" },
    slime: { type: "colour", def: "#7ae03a", label: "Slime" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Drips" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 2231);
    const line = S.add(S.div(S.mul(A, S.h), 100), S.div(S.sub(shaderPaintNoise(S, S.x, 0, 3, sd), 128), 40));
    // drips in some columns run further down, creeping and pulling back over the loop
    const h = S.hash(S.x, 2, sd), drips = S.lt(S.mod(h, 100), 45), s = shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), S.mod(h, 360)));
    const len = S.sel(drips, S.add(S.add(2, S.mod(S.div(h, 100), 5)), S.div(s, 500)), 0);
    const goo = S.and(S.gt(A, 0), S.solid(c), S.lt(S.y, S.add(line, len)));
    const gleam = S.and(goo, S.eq(S.mod(S.sub(S.add(S.x, S.y), S.div(S.mul(S.frame, 12), S.FRAMES)), 12), 0));
    return S.pick([[gleam, shaderPaintMix(S, S.p("slime"), S.rgba(255, 255, 255, 255), 60)], [goo, shaderPaintMix(S, c, S.p("slime"), 75)]], c);
  },
};

SHADER_DEFS.cardflip = {
  label: "Card flip", title: "the whole screen flips over like a card: squeezing edge-on, then opening out again with the cover on its back",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover (the back)" },
    behind: { type: "colour", def: "#1a1a24", label: "Behind the card" },
    shade: { type: "int", min: 0, max: 60, def: 30, label: "Shading as it turns (%)" },
  },
  fragment: function (S) {
    const p = S.progress(), front = S.lt(p, 50), k = S.sel(front, S.sub(100, S.mul(p, 2)), S.sub(S.mul(p, 2), 100));   // the card's width, 100 .. 0 .. 100
    const X = S.sub(S.add(S.mul(S.x, 2), 1), S.w), inside = S.lt(S.mul(S.abs(X), 100), S.mul(S.w, k));
    const sx = S.div(S.add(S.div(S.mul(X, 100), S.max(k, 1)), S.w), 2), dk = S.div(S.mul(S.sub(100, k), S.p("shade")), 100);
    return S.pick([[S.eq(p, 0), S.tex(0, 0)], [S.eq(p, 100), S.p("cover")], [S.not(inside), S.p("behind")], [front, shaderPaintShade(S, S.texAt(sx, S.y, "clamp"), S.sub(100, dk), 0)]], shaderPaintShade(S, S.p("cover"), S.sub(100, dk), 0));
  },
};

SHADER_DEFS.spiralfill = {
  label: "Spiral fill", title: "tiles of the cover filling the screen in a spiral, round its edge and inward ring by ring",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    tile: { type: "int", min: 2, max: 16, def: 4, label: "Tile (px)" },
  },
  fragment: function (S) {
    const p = S.progress(), T = S.p("tile"), nx = S.max(S.div(S.add(S.w, S.sub(T, 1)), T), 1), ny = S.max(S.div(S.add(S.h, S.sub(T, 1)), T), 1);
    const tx = S.div(S.x, T), ty = S.div(S.y, T), r = S.min(S.min(tx, ty), S.min(S.sub(S.sub(nx, 1), tx), S.sub(S.sub(ny, 1), ty)));
    // tiles in rings outside this one, then the place along this ring (clockwise from its top left)
    const W = S.sub(nx, S.mul(r, 2)), H = S.sub(ny, S.mul(r, 2)), before = S.sub(S.mul(nx, ny), S.mul(W, H)), lx = S.sub(tx, r), ly = S.sub(ty, r);
    const pos = S.pick([
      [S.eq(ly, 0), lx],
      [S.eq(lx, S.sub(W, 1)), S.add(S.sub(W, 1), ly)],
      [S.eq(ly, S.sub(H, 1)), S.add(S.add(S.sub(W, 1), S.sub(H, 1)), S.sub(S.sub(W, 1), lx))],
    ], S.add(S.add(S.mul(S.sub(W, 1), 2), S.sub(H, 1)), S.sub(S.sub(H, 1), ly)));
    return S.sel(S.lt(S.mul(S.add(before, pos), 100), S.mul(p, S.mul(nx, ny))), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.plasmadisplay.variants = [{ cell: 3, steps: 2 }, { gas: "#ff3a3a", cell: 4, steps: 8 }];
SHADER_DEFS.teletype.variants = [{ worn: 40 }, { ink: "#2a3a8a", paper: "#ffffff", worn: 0 }];
SHADER_DEFS.genesis.variants = [{ dither: 0 }, { dither: 36 }];
SHADER_DEFS.msx.variants = [{ run: 4 }, { run: 2 }];
SHADER_DEFS.ega.variants = [{ dither: 0 }, { dither: 80 }];
SHADER_DEFS.swampbubbles.variants = [{ height: 100, tint: 60 }, { murk: "#3a2a10", bubble: "#c8a05a", height: 25 }];
SHADER_DEFS.sunset.variants = [{ horizon: 80, size: 50, blend: 100 }, { colors: ["#fff0a0", "#ffa03a", "#c83a3a", "#2a0a2a"], horizon: 45 }];
SHADER_DEFS.crosshair.variants = [{ gap: 0, ring: 0, size: 4 }, { color: "#ff3a3a", size: 16, gap: 6 }];
SHADER_DEFS.compassbar.variants = [{ tick: 8, turn: 2 }, { tick: 2, turn: 0, mark: "#7ae0ff" }];
SHADER_DEFS.banner.variants = [{ height: 45, band: "#1a3a8a", edge: "#ffffff" }, { height: 12, opacity: 100 }];
SHADER_DEFS.testcard.variants = [{ blend: 50 }, { blend: 20 }];
SHADER_DEFS.slimed.variants = [{ amount: 90 }, { amount: 20, slime: "#c83aff", seed: 5 }];
SHADER_DEFS.cardflip.variants = [{ shade: 60 }, { cover: "#ffffff", behind: "#000000", shade: 0 }];
SHADER_DEFS.spiralfill.variants = [{ tile: 2 }, { tile: 12, cover: "#2a0a3a" }];

// ---- Outlines aflame, clones, print separations, screen decorations, two more transitions ----
// ======================================================================================================================
// For a sprite: an outline of fire, shadow clones, a failing light, an inner glow, a gradient outline. Looks: a CMYK
// halftone print, a hue quantizer, an edge-finding tool. Decorations for the screen: cobwebs in the corners, ivy round
// the edges, fairy lights, colored stage lights, a snowdrift along the bottom. Transitions: an 8-bit palette fade, a
// code-rain wipe. Private helpers shaderDc*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("fireoutline", "shadowclones", "brokenlight", "innerglow", "gradientoutline", "cmykprint", "huequantize", "edges",
  "cobwebs", "ivyframe", "fairylights", "stagelights", "snowdrift", "palettefade", "rainwipe");

// how far out from the sprite a clear pixel is: 1, 2 or 3 (Chebyshev), 0 on the sprite or further away
function shaderDcRing(S) { return S.pick([[shaderEnchRing1(S), 1], [shaderEnchRing2(S), 2], [shaderTxRing3(S), 3]], 0); }
// a color times another, per channel (free effects)
function shaderDcMul(S, a, b) { return S.rgba(S.div(S.mul(S.r(a), S.r(b)), 255), S.div(S.mul(S.g(a), S.g(b)), 255), S.div(S.mul(S.b(a), S.b(b)), 255), 255); }

SHADER_DEFS.fireoutline = {
  label: "Fire outline", title: "an outline of flickering flames all round the sprite, licking up to three pixels out, hottest against it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [3, 3, 3, 3],
  tags: ["fire", "outline", "aura", "flames", "burning", "rage", "power", "boss", "enchant", "hot"],
  params: {
    flames: { type: "palette", def: ["#fff6c0", "#ffd03a", "#ff7a1a", "#c8200a"], max: 6, label: "Hot to cool" },
    reach: { type: "int", min: 0, max: 100, def: 70, label: "Height (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), k = shaderDcRing(S), n = S.palCount("flames");
    const nz = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, 2301, 16);
    // heat falls with distance; a rising noise breaks it into tongues
    const heat = S.sub(S.add(S.div(S.mul(nz, S.p("reach")), 100), 70), S.mul(k, 55));
    const on = S.and(S.gt(k, 0), S.gt(heat, 60)), i = S.clamp(S.sub(S.sub(n, 1), S.div(S.mul(S.sub(heat, 60), n), 200)), 0, S.sub(n, 1));
    return S.sel(on, S.palAt("flames", i), c);
  },
};

SHADER_DEFS.shadowclones = {
  label: "Shadow clones", title: "dark copies of the sprite flickering in and out a few pixels either side of it, like a ninja's clones",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [0, 5, 0, 5],
  tags: ["clones", "shadow", "ninja", "afterimage", "copies", "speed", "illusion", "dodge", "mirror image", "phantom"],
  params: {
    shade: { type: "colour", def: "#2a1a4a", label: "Clones" },
    spread: { type: "int", min: 1, max: 4, def: 3, label: "How far out (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), D = S.p("spread"), f = S.div(S.mul(S.frame, 16), S.FRAMES);
    // the left clone on the first half of each four frames, the right one on the second; they sway a pixel
    const left = S.lt(S.mod(f, 4), 2), sway = S.sel(S.lt(S.mod(f, 8), 4), 0, 1), dx = S.sel(left, S.neg(S.add(D, sway)), S.add(D, sway));
    const q = S.texAt(S.sub(S.x, dx), S.y, "clear"), clone = S.and(S.not(S.solid(c)), S.solid(q));
    return S.sel(clone, S.sel(S.eq(S.mod(S.add(S.x, S.y), 2), 0), S.p("shade"), shaderPaintMix(S, q, S.p("shade"), 70)), c);
  },
};

SHADER_DEFS.brokenlight = {
  label: "Failing light", title: "the sprite lit by a failing bulb: now and then it dims, browns out or blinks off for a frame",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["flicker", "broken light", "bulb", "horror", "power cut", "neon", "glitch", "creepy", "dim", "electric"],
  params: {
    often: { type: "int", min: 0, max: 80, def: 30, label: "Flickering frames (%)" },
    dark: { type: "colour", def: "#0a0a12", label: "Dark" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), h = S.mod(S.hash(S.frame, 1, 2311), 100), O = S.p("often");
    // frame 0 always browns out, so the loop is never plain (it was frame 1 before build 42: frame 0 was the plain sprite)
    const off = S.and(S.lt(h, S.div(O, 3)), S.ne(S.frame, 0)), dim = S.or(S.eq(S.frame, 0), S.lt(h, O));
    return S.sel(S.solid(c), S.pick([[off, shaderPaintMix(S, c, S.p("dark"), 85)], [dim, shaderPaintMix(S, c, S.p("dark"), 45)]], c), c);
  },
};

SHADER_DEFS.innerglow = {
  label: "Inner glow", title: "a glow inside the sprite's edge: its outer pixels tinted toward a color, fading inward, breathing",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["inner glow", "glow", "rim", "edge", "aura", "magic", "highlight", "selected", "enchant", "soft"],
  params: {
    glow: { type: "colour", def: "#7ae0ff", label: "Glow" },
    width: { type: "int", min: 1, max: 4, def: 2, label: "Width (px)" },
    strength: { type: "int", min: 0, max: 100, def: 70, label: "Strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("width"), d = shaderEnchDepth(S, 4), s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const t = S.div(S.mul(S.mul(S.max(S.sub(W, d), 0), S.p("strength")), S.add(70, S.div(s, 33))), S.mul(S.max(W, 1), 100));
    return S.sel(S.and(S.solid(c), S.lt(d, W)), shaderPaintMix(S, c, S.p("glow"), t), c);
  },
};

SHADER_DEFS.gradientoutline = {
  label: "Gradient outline", title: "an outline round the sprite blending from one color at the top to another at the bottom",
  group: "Items", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [2, 2, 2, 2],
  tags: ["outline", "gradient", "border", "sticker", "ui", "icon", "highlight", "fancy", "logo", "badge"],
  params: {
    top: { type: "colour", def: "#ffe66a", label: "Top" },
    bottom: { type: "colour", def: "#ff4a8a", label: "Bottom" },
    thick: { type: "int", min: 1, max: 2, def: 1, label: "Thickness (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), on = S.or(shaderEnchRing1(S), S.and(S.eq(S.p("thick"), 2), shaderEnchRing2(S)));
    const t = S.div(S.mul(S.y, 100), S.max(S.sub(S.h, 1), 1)), lv = S.div(S.add(S.mul(t, 4), S.div(S.mul(shaderWxBayer(S, 1), 100), 16)), 100);
    return S.sel(on, shaderPaintMix(S, S.p("top"), S.p("bottom"), S.mul(S.min(lv, 4), 25)), c);
  },
};

SHADER_DEFS.cmykprint = {
  label: "CMYK print", title: "the picture printed in CMYK: cyan, magenta, yellow and black dot screens, each on its own slant, on paper",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["cmyk", "print", "halftone", "separations", "offset", "magazine", "comic", "dots", "press", "ink"],
  params: {
    grid: { type: "int", min: 1, max: 3, def: 1, label: "Dot cell (px)" },
    paper: { type: "colour", def: "#fbf8f0", label: "Paper" },
    black: { type: "int", min: 0, max: 100, def: 100, label: "Black ink (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("grid");
    const C0 = S.sub(255, S.r(c)), M0 = S.sub(255, S.g(c)), Y0 = S.sub(255, S.b(c)), K0 = S.div(S.mul(S.min(S.min(C0, M0), Y0), S.p("black")), 100);
    // each ink's screen: a Bayer cell read on its own sheared grid
    const scr = function (u, v) { return S.table(SHADER_ERA_BAYER4, S.add(S.mul(S.mod(S.div(v, K), 4), 4), S.mod(S.div(u, K), 4))); };
    const big = 1024, inkC = S.gt(S.div(S.sub(C0, K0), 16), scr(S.add(S.add(S.x, S.div(S.y, 2)), big), S.y));
    const inkM = S.gt(S.div(S.sub(M0, K0), 16), scr(S.add(S.sub(S.x, S.div(S.y, 2)), big), S.add(S.y, 1)));
    const inkY = S.gt(S.div(S.sub(Y0, K0), 16), scr(S.x, S.add(S.y, 2))), inkK = S.gt(S.div(K0, 16), scr(S.add(S.add(S.x, S.y), big), S.sub(S.add(S.y, big), S.x)));
    let out = S.p("paper");
    out = S.sel(inkC, shaderDcMul(S, out, S.rgba(0, 174, 239, 255)), out);
    out = S.sel(inkM, shaderDcMul(S, out, S.rgba(236, 0, 140, 255)), out);
    out = S.sel(inkY, shaderDcMul(S, out, S.rgba(255, 242, 0, 255)), out);
    out = S.sel(inkK, S.rgba(28, 28, 32, 255), out);
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.huequantize = {
  label: "Hue bands", title: "a tool that snaps every color's hue to a few evenly spaced hues, keeping its brightness and saturation",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["hue", "quantize", "posterize", "palette", "bands", "tool", "stylize", "limited palette", "color", "reduce"],
  params: {
    hues: { type: "int", min: 2, max: 16, def: 6, label: "Hues" },
    turn: { type: "int", min: 0, max: 359, def: 0, label: "Turn the hues (degrees)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), r = S.r(c), g = S.g(c), b = S.b(c), N = S.p("hues");
    const Y = S.div(S.add(S.add(S.mul(r, 299), S.mul(g, 587)), S.mul(b, 114)), 1000);
    const I = S.div(S.sub(S.sub(S.mul(r, 596), S.mul(g, 274)), S.mul(b, 322)), 1000), Q = S.div(S.add(S.sub(S.mul(r, 211), S.mul(g, 523)), S.mul(b, 312)), 1000);
    // the hue as an angle in the I-Q plane, snapped to the nearest of N, the chroma kept
    const C = shaderPaintSqrt(S, S.add(S.mul(I, I), S.mul(Q, Q))), per = S.div(360, S.max(N, 1)), T = S.p("turn");
    const a = S.mod(S.add(S.sub(shaderMotionAtan(S, I, Q), T), 720), 360), a2 = S.add(S.mul(S.div(S.add(a, S.div(per, 2)), per), per), T);
    const I2 = S.div(S.mul(C, shaderMotionCos(S, a2)), 1000), Q2 = S.div(S.mul(C, shaderMotionSin(S, a2)), 1000);
    const out = shaderTkRgb(S, S.add(Y, S.div(S.add(S.mul(I2, 956), S.mul(Q2, 621)), 1000)), S.sub(Y, S.div(S.add(S.mul(I2, 272), S.mul(Q2, 647)), 1000)), S.add(Y, S.div(S.sub(S.mul(Q2, 1703), S.mul(I2, 1106)), 1000)));
    return S.sel(S.solid(c), out, c);
  },
};

SHADER_DEFS.edges = {
  label: "Find edges", title: "a tool that finds the picture's edges: lines where the brightness changes, light on dark, in one color or their own",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["edges", "edge detect", "sobel", "outline", "line art", "tool", "contour", "trace", "sketch", "mask"],
  params: {
    gain: { type: "int", min: 50, max: 400, def: 150, label: "Gain (%)" },
    line: { type: "colour", def: "#ffffff", label: "Lines" },
    back: { type: "colour", def: "#000000", label: "Background" },
    own: { type: "int", min: 0, max: 1, def: 0, label: "Lines in", choices: ["the line color", "the picture's own colors"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), L = function (dx, dy) { return shaderTkLum(S, shaderLooksAt(S, dx, dy)); };
    // a Sobel-like slope across and down, plus the silhouette's edge
    const gx = S.sub(S.add(S.add(L(1, -1), S.mul(L(1, 0), 2)), L(1, 1)), S.add(S.add(L(-1, -1), S.mul(L(-1, 0), 2)), L(-1, 1)));
    const gy = S.sub(S.add(S.add(L(-1, 1), S.mul(L(0, 1), 2)), L(1, 1)), S.add(S.add(L(-1, -1), S.mul(L(0, -1), 2)), L(1, -1)));
    const t = S.min(S.div(S.mul(S.add(S.abs(gx), S.abs(gy)), S.p("gain")), 800), 100);
    const lineC = S.sel(S.eq(S.p("own"), 1), c, S.p("line"));
    return S.sel(S.solid(c), shaderPaintMix(S, S.p("back"), lineC, t), c);
  },
};

SHADER_DEFS.cobwebs = {
  label: "Cobwebs", title: "cobwebs strung in the corners of the screen: threads fanning out from each corner, crossed by sagging rings",
  group: "World", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["cobwebs", "spider web", "halloween", "haunted", "spooky", "abandoned", "dungeon", "attic", "decoration", "corner"],
  params: {
    size: { type: "int", min: 10, max: 70, def: 35, label: "Size (% of the height)" },
    corners: { type: "int", min: 0, max: 2, def: 1, label: "Corners", choices: ["top left only", "both top corners", "all four"] },
    silk: { type: "colour", def: "#e8e8f0", label: "Silk" },
    strength: { type: "int", min: 0, max: 100, def: 65, label: "Strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Cn = S.p("corners"), R = S.max(S.div(S.mul(S.p("size"), S.h), 100), 4);
    const web = function (cx, cy, on) {
      const P = shaderWxPolar(S, cx, cy), thread = shaderFwOnRay(S, P.ang, S.mul(S.div(S.add(P.ang, 7), 15), 15), P.d);
      const ring = S.eq(S.mod(S.add(P.d, S.div(S.mod(P.ang, 15), 5)), S.max(S.div(R, 4), 2)), 0);
      return S.and(on, S.lt(P.d, R), S.or(thread, ring));
    };
    const hit = S.or(web(0, 0, S.lt(1, 2)), web(S.sub(S.w, 1), 0, S.ge(Cn, 1)), web(0, S.sub(S.h, 1), S.eq(Cn, 2)), web(S.sub(S.w, 1), S.sub(S.h, 1), S.eq(Cn, 2)));
    return S.sel(hit, shaderPaintMix(S, c, S.p("silk"), S.p("strength")), c);
  },
};

SHADER_DEFS.ivyframe = {
  label: "Ivy frame", title: "ivy creeping round the edges of the screen: a wandering stem and clumps of leaves that stir now and then",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 4, pad: [0, 0, 0, 0],
  tags: ["ivy", "vines", "frame", "border", "nature", "ruins", "garden", "fantasy", "overgrown", "decoration"],
  params: {
    depth: { type: "int", min: 2, max: 12, def: 5, label: "Reaches in (px)" },
    leaf: { type: "colour", def: "#3a8a3a", label: "Leaves" },
    stem: { type: "colour", def: "#2a4a1a", label: "Stem" },
    thick: { type: "int", min: 10, max: 100, def: 60, label: "Leafiness (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), e = S.min(S.min(S.x, S.y), S.min(S.sub(S.sub(S.w, 1), S.x), S.sub(S.sub(S.h, 1), S.y))), D = S.p("depth");
    const along = S.add(S.x, S.y), wav = S.div(S.add(shaderMotionSin(S, S.mul(along, 25)), 1000), S.div(2000, S.max(S.div(D, 2), 1)));
    const stem = S.eq(e, wav);
    const h = S.hash(S.div(S.x, 2), S.div(S.y, 2), S.add(2321, S.div(S.frame, 8))), leaf = S.and(S.lt(e, D), S.lt(S.mod(h, 100), S.sub(S.p("thick"), S.div(S.mul(e, 60), D))));
    return S.pick([[stem, S.p("stem")], [leaf, S.sel(S.eq(S.mod(S.div(h, 100), 3), 0), shaderPaintShade(S, S.p("leaf"), 135, 0), S.p("leaf"))]], c);
  },
};

SHADER_DEFS.fairylights = {
  label: "Fairy lights", title: "a string of fairy lights sagging across the top of the screen, the bulbs blinking in a chase of colors",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0],
  tags: ["fairy lights", "christmas lights", "string lights", "festive", "holiday", "party", "decoration", "bulbs", "garland", "cozy"],
  params: {
    sag: { type: "int", min: 0, max: 40, def: 15, label: "Sag (% of the height)" },
    spacing: { type: "int", min: 3, max: 16, def: 6, label: "Bulb spacing (px)" },
    colors: { type: "palette", def: ["#ff3a4a", "#ffd83a", "#3aff6a", "#3ab0ff", "#ff7af0"], max: 8, label: "Bulbs" },
    wire: { type: "colour", def: "#1a2a1a", label: "Wire" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("colors"), G = S.p("spacing"), X = S.div(S.mul(S.sub(S.mul(S.x, 2), S.w), 100), S.max(S.w, 1));
    const wy = S.add(1, S.div(S.mul(S.div(S.mul(S.p("sag"), S.h), 100), S.sub(10000, S.mul(X, X))), 10000));
    const k = S.div(S.x, G), bx = S.add(S.mul(k, G), S.div(G, 2)), Xb = S.div(S.mul(S.sub(S.mul(bx, 2), S.w), 100), S.max(S.w, 1));
    const by = S.add(S.add(1, S.div(S.mul(S.div(S.mul(S.p("sag"), S.h), 100), S.sub(10000, S.mul(Xb, Xb))), 10000)), 1);
    const bulb = S.and(S.le(S.abs(S.sub(S.x, bx)), 0), S.ge(S.y, by), S.le(S.y, S.add(by, 1)));
    // a chase: each bulb dims when the chase is a step behind it
    const lit = S.ne(S.mod(S.add(k, S.div(S.mul(S.frame, 4), S.FRAMES)), 4), 0), col = S.palAt("colors", S.mod(k, n));
    return S.pick([[bulb, S.sel(lit, col, shaderPaintShade(S, col, 35, 0))], [S.eq(S.y, wy), S.p("wire")]], c);
  },
};

SHADER_DEFS.stagelights = {
  label: "Stage lights", title: "colored stage lights beaming down from above, sweeping across a darkened stage",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["stage lights", "concert", "spotlight", "show", "theater", "club", "disco", "performance", "beams", "colored"],
  params: {
    dark: { type: "int", min: 0, max: 100, def: 55, label: "Darkness (%)" },
    width: { type: "int", min: 4, max: 30, def: 12, label: "Beam width (degrees)" },
    colors: { type: "palette", def: ["#ff3aa8", "#3ac8ff", "#ffd83a"], max: 4, label: "Beams" },
    swing: { type: "int", min: 5, max: 60, def: 30, label: "Swing (degrees either way)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("width"), n = S.palCount("colors");
    let out = shaderPaintMix(S, c, S.rgba(6, 4, 14, 255), S.p("dark"));
    for (let k = 0; k < 4; k++) {
      // beam k from above the top, at k + 1 fifths across, swinging on its own phase about straight down (180 from twelve)
      const sx = S.div(S.mul(S.w, k + 1), 5), K = shaderUiClock(S, sx, -2), s = shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), k * 97));
      const aim = S.add(180, S.div(S.mul(s, S.p("swing")), 1000)), off = S.abs(S.sub(K.a, aim)), on = S.and(S.lt(k, n), S.lt(S.mul(off, 2), W));
      out = S.sel(on, shaderPaintMix(S, out, S.palAt("colors", S.mod(k, n)), 40), out);
    }
    return out;
  },
};

SHADER_DEFS.snowdrift = {
  label: "Snowdrift", title: "snow heaped along the bottom of the screen in soft uneven drifts, shaded blue underneath, glinting",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 6, pad: [0, 0, 0, 0],
  tags: ["snowdrift", "snow", "winter", "drift", "ground", "christmas", "frozen", "landscape", "cold", "bank"],
  params: {
    height: { type: "int", min: 5, max: 60, def: 20, label: "Depth (% of the screen)" },
    snow: { type: "colour", def: "#f4f8ff", label: "Snow" },
    shade: { type: "colour", def: "#a8c0e0", label: "Shade" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 2), up = S.sub(S.sub(S.h, 1), S.y);
    const top = S.div(S.mul(H, S.add(160, S.div(shaderPaintNoise(S, S.x, 0, 8, 2331), 2))), 300);
    const inSnow = S.le(up, top), shaded = S.lt(up, S.div(top, 3));
    const glint = S.and(inSnow, S.eq(S.mod(S.add(S.hash(S.x, S.y, 2332), S.frame), 24), 0));
    return S.pick([[glint, S.rgba(255, 255, 255, 255)], [S.and(inSnow, shaded), S.p("shade")], [inSnow, S.p("snow")]], c);
  },
};

SHADER_DEFS.palettefade = {
  label: "Palette fade", title: "an 8-bit fade: the picture stepping toward the cover in four hard steps, its colors snapping coarser each step",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
  },
  fragment: function (S) {
    const p = S.progress(), step = S.div(S.mul(p, 4), 100), c = S.tex(0, 0);
    const mixed = shaderPaintMix(S, c, S.p("cover"), S.mul(step, 25)), q = function (v) { return S.mul(S.div(v, 64), 64); };
    return S.pick([[S.eq(step, 0), c], [S.ge(step, 4), S.p("cover")]], S.rgba(q(S.r(mixed)), q(S.g(mixed)), q(S.b(mixed)), 255));
  },
};

SHADER_DEFS.rainwipe = {
  label: "Code rain wipe", title: "columns of glowing code rain pour down the screen, each in its turn, leaving the cover behind them",
  group: "Transitions", kind: "screen", transition: "covered", palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#020a04", label: "Cover" },
    glyph: { type: "colour", def: "#3aff6a", label: "Code" },
    trail: { type: "int", min: 2, max: 16, def: 8, label: "Trail (px)" },
  },
  fragment: function (S) {
    const p = S.progress(), T = S.p("trail"), col = S.div(S.x, 2), delay = S.mod(S.hash(col, 1, 2341), 50);
    const q = S.clamp(S.sub(S.div(S.mul(p, 150), 100), delay), 0, 100), head = S.div(S.mul(q, S.add(S.h, T)), 100);
    const behind = S.sub(head, S.y), bit = S.ne(S.mod(S.hash(S.x, S.y, S.add(2342, S.div(S.frame, 2))), 3), 0);
    return S.pick([
      [S.or(S.ge(behind, T), S.eq(p, 100)), S.p("cover")],
      [S.and(S.gt(q, 0), S.ge(behind, 0), S.lt(behind, 1)), S.rgba(230, 255, 235, 255)],
      [S.and(S.gt(q, 0), S.ge(behind, 0), bit), shaderPaintMix(S, S.p("cover"), S.p("glyph"), S.sub(100, S.div(S.mul(behind, 80), T)))],
      [S.and(S.gt(q, 0), S.ge(behind, 0)), S.p("cover")],
    ], S.tex(0, 0));
  },
};

SHADER_DEFS.fireoutline.variants = [{ reach: 100 }, { flames: ["#e8f8ff", "#7ae0ff", "#3a8cff", "#1a2aa8"], reach: 40 }];
SHADER_DEFS.shadowclones.variants = [{ spread: 4 }, { shade: "#3a0a0a", spread: 1 }];
SHADER_DEFS.brokenlight.variants = [{ often: 70 }, { often: 10, dark: "#1a0a00" }];
SHADER_DEFS.innerglow.variants = [{ width: 4, strength: 100 }, { glow: "#ff5a3a", width: 1 }];
SHADER_DEFS.gradientoutline.variants = [{ thick: 2 }, { top: "#7affe0", bottom: "#3a5aff" }];
SHADER_DEFS.cmykprint.variants = [{ grid: 2 }, { black: 0, paper: "#fff4e0" }];
SHADER_DEFS.huequantize.variants = [{ hues: 3 }, { hues: 12, turn: 30 }];
SHADER_DEFS.edges.variants = [{ own: 1 }, { line: "#3aff6a", back: "#001a08", gain: 300 }];
SHADER_DEFS.cobwebs.variants = [{ corners: 2, size: 25 }, { corners: 0, size: 60, strength: 90 }];
SHADER_DEFS.ivyframe.variants = [{ depth: 10, thick: 90 }, { depth: 3, leaf: "#8a5a2a", stem: "#4a2a10" }];
SHADER_DEFS.fairylights.variants = [{ sag: 30, spacing: 4 }, { sag: 5, spacing: 12, colors: ["#fff0c0"] }];
SHADER_DEFS.stagelights.variants = [{ dark: 80, width: 20 }, { colors: ["#ffffff"], swing: 10 }];
SHADER_DEFS.snowdrift.variants = [{ height: 45 }, { height: 10, snow: "#f0f0e8", shade: "#c0b8a8" }];
SHADER_DEFS.palettefade.variants = [{ cover: "#ffffff" }, { cover: "#2a0a3a" }];
SHADER_DEFS.rainwipe.variants = [{ trail: 16 }, { trail: 3, glyph: "#ff3a5a", cover: "#0a0204" }];

// ---- Wrapped and patterned, printed and copied, portals and lasers, two more transitions ----
// ======================================================================================================================
// For a sprite: bound in vines, wrapped like a mummy, an enchanted glint. Looks: animal prints, polka dots, batik, a
// photocopy, a barrel lens. The screen: a shower of sparks, a smoke plume, a swirling portal, a black hole, a laser grid.
// Transitions: a vortex wipe, tiles fading one by one. Private helpers shaderPt*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("vinebound", "mummified", "enchantglint", "animalprint", "polkadots", "batik", "photocopy", "barrel", "sparkshower",
  "smokeplume", "portal", "blackhole", "lasergrid", "vortexwipe", "tilefade");

SHADER_DEFS.vinebound = {
  label: "Vine-bound", title: "the sprite bound in living vines: two green tendrils winding across it, leaves sprouting off them, stirring",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 6, pad: [0, 0, 0, 0],
  tags: ["vines", "bound", "entangled", "roots", "druid", "nature", "trapped", "snare", "plant", "debuff"],
  params: {
    vine: { type: "colour", def: "#3a7a2a", label: "Vines" },
    leaf: { type: "colour", def: "#7ad04a", label: "Leaves" },
    wind: { type: "int", min: 0, max: 3, def: 1, label: "Winding (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("wind"), t = S.div(S.mul(S.frame, 360), S.FRAMES);
    const band = function (u, v, ph) { const wob = S.div(S.mul(shaderMotionSin(S, S.add(S.add(S.mul(v, 30), t), ph)), A), 1000); return S.sub(u, wob); };
    const mid = S.div(S.sub(S.w, S.h), 2), u1 = band(S.sub(S.sub(S.x, S.y), mid), S.add(S.x, S.y), 0), u2 = band(S.sub(S.add(S.x, S.y), S.sub(S.div(S.add(S.w, S.h), 2), 1)), S.sub(S.x, S.y), 120);
    const on = S.or(S.le(S.abs(u1), 0), S.le(S.abs(u2), 0)), near = S.or(S.eq(S.abs(u1), 1), S.eq(S.abs(u2), 1));
    const leaf = S.and(near, S.eq(S.mod(S.hash(S.x, S.y, S.add(2401, S.div(S.frame, 8))), 4), 0));
    return S.pick([[S.not(S.solid(c)), c], [on, S.p("vine")], [leaf, S.p("leaf")]], c);
  },
};

SHADER_DEFS.mummified = {
  label: "Mummified", title: "the sprite wrapped in bandages: strips across it, slanting one way then the other, their edges shaded, gaps here and there",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["mummy", "bandages", "wrapped", "undead", "egypt", "tomb", "halloween", "linen", "cursed", "monster"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 85, label: "Wrapped (%)" },
    linen: { type: "colour", def: "#e8dcb8", label: "Bandage" },
    strip: { type: "int", min: 2, max: 6, def: 3, label: "Strip width (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("strip"), A = S.p("amount");
    // strips step a pixel every few across, alternate strips the other way
    const r0 = S.div(S.y, W), slope = S.sel(S.eq(S.mod(r0, 2), 0), S.div(S.x, 4), S.neg(S.div(S.x, 4)));
    const yy = S.add(S.add(S.y, slope), S.mul(W, 64)), row = S.div(yy, W), fy = S.mod(yy, W);
    const gap = S.ge(S.mod(S.hash(S.div(S.x, 3), row, 2411), 100), A);
    const base = shaderPaintShade(S, S.p("linen"), S.add(60, S.div(S.mul(S.luma(c), 50), 255)), 0);
    const edge = S.or(S.eq(fy, 0), S.eq(fy, S.sub(W, 1)));
    return S.pick([[S.not(S.solid(c)), c], [gap, c], [edge, shaderPaintShade(S, base, 75, 0)]], shaderTkRgb(S, S.r(base), S.g(base), S.b(base)));
  },
};

SHADER_DEFS.enchantglint = {
  label: "Enchant glint", title: "an enchanted item's glint: soft purple sheen bands sliding diagonally across the sprite, two at once, crossing",
  group: "Items", kind: "sprite", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["enchanted", "glint", "sheen", "magic", "enchant", "shimmer", "purple", "item", "rare", "glow"],
  params: {
    glint: { type: "colour", def: "#a05aff", label: "Glint" },
    strength: { type: "int", min: 0, max: 100, def: 55, label: "Strength (%)" },
    width: { type: "int", min: 2, max: 12, def: 5, label: "Band width (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), W = S.p("width"), P = S.add(S.mul(W, 4), 4), A = S.p("strength");
    // one band down-right at one speed, one up-right at twice it, each a whole period a loop
    const u1 = S.mod(S.sub(S.add(S.add(S.x, S.y), S.mul(P, 64)), S.div(S.mul(S.frame, P), S.FRAMES)), P);
    const u2 = S.mod(S.sub(S.add(S.sub(S.x, S.y), S.mul(P, 64)), S.div(S.mul(S.frame, S.mul(P, 2)), S.FRAMES)), P);
    const b1 = S.lt(u1, W), b2 = S.lt(u2, S.div(W, 2)), both = S.and(b1, b2);
    const t = S.pick([[both, A], [b1, S.div(S.mul(A, 2), 3)], [b2, S.div(A, 2)]], S.div(A, 8));
    return S.sel(S.solid(c), shaderPaintMix(S, c, S.p("glint"), t), c);
  },
};

SHADER_DEFS.animalprint = {
  label: "Animal print", title: "an animal print over the picture: tiger stripes, leopard rosettes, zebra stripes or cow patches",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["animal print", "tiger", "leopard", "zebra", "cow", "pattern", "fur", "safari", "fashion", "skin"],
  params: {
    print: { type: "int", min: 0, max: 3, def: 1, label: "Print", choices: ["tiger", "leopard", "zebra", "cow"] },
    ink: { type: "colour", def: "#1a120a", label: "Markings" },
    strength: { type: "int", min: 0, max: 100, def: 75, label: "Strength (%)" },
    scale: { type: "int", min: 1, max: 4, def: 2, label: "Scale" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = S.p("scale"), Pr = S.p("print"), x = S.div(S.x, K), y = S.div(S.y, K);
    const nz = shaderPaintNoise(S, x, y, 4, 2421), wob = S.div(S.mul(shaderMotionSin(S, S.mul(y, 40)), 2), 1000);
    // tiger: ragged bands across; zebra: tighter bands; cow: big blobs; leopard: rings round cell middles
    const tiger = S.lt(S.mod(S.add(S.add(x, wob), S.div(S.sub(nz, 128), 24)), 9), 2), zebra = S.lt(S.mod(S.add(S.add(x, wob), S.div(S.sub(nz, 128), 40)), 4), 2);
    const cow = S.gt(shaderPaintNoise(S, x, y, 8, 2422), 160);
    const lx = S.sub(S.mod(x, 7), 3), ly = S.sub(S.mod(S.add(y, S.mul(S.mod(S.div(x, 7), 2), 3)), 7), 3), r2 = S.add(S.mul(lx, lx), S.mul(ly, ly));
    // a rosette in most cells; the rest (one in four) a small solid spot, as a real coat mixes them (a cell was empty before
    // build 42, and a small sprite could fall in one and show no print at all)
    const rosette = S.ne(S.mod(S.hash(S.div(x, 7), S.div(y, 7), 2423), 4), 0);
    const leopard = S.sel(rosette, S.and(S.ge(r2, 3), S.le(r2, 7)), S.le(r2, 2));
    const mark = S.pick([[S.eq(Pr, 0), tiger], [S.eq(Pr, 1), leopard], [S.eq(Pr, 2), zebra]], cow);
    return S.sel(S.and(S.solid(c), mark), shaderPaintMix(S, c, S.p("ink"), S.p("strength")), c);
  },
};

SHADER_DEFS.polkadots = {
  label: "Polka dots", title: "polka dots over the picture: round dots on staggered rows, in a dot color shaded by what is under them",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["polka dots", "dots", "pattern", "retro", "cute", "fabric", "pop", "spotted", "fashion", "fun"],
  params: {
    spot: { type: "colour", def: "#ffffff", label: "Dots" },
    spacing: { type: "int", min: 3, max: 16, def: 6, label: "Spacing (px)" },
    size: { type: "int", min: 1, max: 6, def: 2, label: "Dot radius (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.p("spacing"), R = S.p("size"), row = S.div(S.y, P);
    const lx = S.sub(S.mod(S.add(S.x, S.mul(S.mod(row, 2), S.div(P, 2))), P), S.div(P, 2)), ly = S.sub(S.mod(S.y, P), S.div(P, 2));
    const on = S.le(S.add(S.mul(lx, lx), S.mul(ly, ly)), S.add(S.mul(R, R), R));
    const shaded = shaderPaintShade(S, S.p("spot"), S.add(55, S.div(S.mul(S.luma(c), 50), 255)), 0);
    return S.sel(S.and(S.solid(c), on), shaderTkRgb(S, S.r(shaded), S.g(shaded), S.b(shaded)), c);
  },
};

SHADER_DEFS.batik = {
  label: "Batik", title: "the picture dyed as batik: a few dye colors by brightness, crossed by the dark crackle where the wax cracked",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["batik", "wax", "dye", "textile", "crackle", "indonesian", "fabric", "craft", "resist", "indigo"],
  params: {
    dyes: { type: "palette", def: ["#1a2a5a", "#5a7ab0", "#f0e8d0"], max: 6, label: "Dyes (dark to light)" },
    crackle: { type: "int", min: 3, max: 12, def: 6, label: "Crackle size (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Crackle" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("dyes"), v = shaderPaintCells(S, S.p("crackle"), S.add(S.mul(S.p("seed"), 4), 2431));
    const crack = S.and(shaderPaintJoin(S, v, 1), S.lt(S.mod(S.hash(S.x, S.y, 2432), 100), 70));
    const dye = S.palAt("dyes", S.div(S.mul(S.add(S.luma(c), S.div(S.sub(shaderPaintNoise(S, S.x, S.y, 5, 2433), 128), 6)), n), 256));
    return S.sel(S.solid(c), S.sel(crack, S.palAt("dyes", 0), dye), c);
  },
};

SHADER_DEFS.photocopy = {
  label: "Photocopy", title: "the picture run through a cheap photocopier: hard black and white, toner specks in the whites, dropouts in the blacks",
  group: "Looks", kind: "both", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["photocopy", "xerox", "zine", "punk", "flyer", "toner", "grunge", "black and white", "copy", "diy"],
  params: {
    level: { type: "int", min: 0, max: 255, def: 120, label: "Black below (brightness)" },
    noise: { type: "int", min: 0, max: 30, def: 6, label: "Specks and dropouts (%)" },
    toner: { type: "colour", def: "#141414", label: "Toner" },
    paper: { type: "colour", def: "#f2f0ea", label: "Paper" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), dark = S.lt(S.luma(c), S.p("level")), h = S.mod(S.hash(S.x, S.y, 2441), 100);
    // a darker smear down one column band as the drum wears
    const streak = S.lt(S.mod(S.hash(S.div(S.x, 2), 1, 2442), 100), 4);
    const ink = S.sel(dark, S.ge(h, S.p("noise")), S.or(S.lt(h, S.div(S.p("noise"), 2)), S.and(streak, S.lt(h, 30))));
    return S.sel(S.solid(c), S.sel(ink, S.p("toner"), S.p("paper")), c);
  },
};

SHADER_DEFS.barrel = {
  label: "Barrel lens", title: "a tool that bends the screen as a lens: bulging out like an old curved CRT, or pinched in, the corners filled",
  group: "Looks", kind: "screen", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["barrel", "lens", "distortion", "crt curve", "fisheye", "pincushion", "bulge", "tool", "warp", "retro tv"],
  params: {
    bend: { type: "int", min: -50, max: 50, def: 25, label: "Bend (+ bulge, - pinch)" },
    border: { type: "colour", def: "#000000", label: "Outside the picture" },
  },
  fragment: function (S) {
    const cx = S.div(S.w, 2), cy = S.div(S.h, 2), X = S.sub(S.x, cx), Y = S.sub(S.y, cy), Rm = S.max(S.add(S.mul(cx, cx), S.mul(cy, cy)), 1);
    // read from further out the further from the middle: 1 + bend r^2 (r 0..1 to the corner), in thousandths
    const k = S.add(1000, S.div(S.mul(S.mul(S.p("bend"), 10), S.add(S.mul(X, X), S.mul(Y, Y))), Rm));
    const sx = S.add(cx, S.div(S.mul(X, k), 1000)), sy = S.add(cy, S.div(S.mul(Y, k), 1000));
    return S.sel(S.and(S.ge(sx, 0), S.lt(sx, S.w), S.ge(sy, 0), S.lt(sy, S.h)), S.texAt(sx, sy, "clamp"), S.p("border"));
  },
};

SHADER_DEFS.sparkshower = {
  label: "Spark shower", title: "a shower of sparks from a point, as from a grinder or a welder: arcing down, bouncing off the bottom, cooling as they go",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["sparks", "welding", "grinder", "forge", "industrial", "fireworks", "embers", "factory", "metal", "shower"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "From, across (%)" },
    down: { type: "int", min: 0, max: 100, def: 20, label: "From, down (%)" },
    hot: { type: "colour", def: "#fff6a0", label: "Hot" },
    cool: { type: "colour", def: "#ff6a1a", label: "Cooling" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = shaderUyAt(S, S.p("across"), S.p("down"));
    let hit = S.i(-1);
    for (let k = 0; k < 12; k++) {
      // spark k: its own launch (hashed speed), its own phase in the loop; gravity pulls it down; it bounces at the foot
      const hb = S.hash(k, 7, 2451), vx = S.sub(S.mod(hb, 9), 4), vy = S.neg(S.mod(S.div(hb, 10), 4)), t = S.mod(S.add(S.frame, S.mul(k, 5)), S.FRAMES);
      const px = S.add(P.x, S.div(S.mul(vx, t), 2)), py0 = S.add(S.add(P.y, S.mul(vy, t)), S.div(S.mul(t, t), 4)), foot = S.sub(S.h, 1);
      const py = S.sel(S.gt(py0, foot), S.sub(S.mul(foot, 2), py0), py0);
      hit = S.sel(S.and(S.eq(S.x, px), S.eq(S.y, py)), t, hit);
    }
    return S.sel(S.ge(hit, 0), shaderPaintMix(S, S.p("hot"), S.p("cool"), S.min(S.div(S.mul(hit, 100), S.max(S.div(S.FRAMES, 1), 1)), 100)), c);
  },
};

SHADER_DEFS.smokeplume = {
  label: "Smoke plume", title: "a plume of smoke rising from a point at the bottom of the screen, widening as it climbs, leaning with the wind",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["smoke", "plume", "chimney", "fire", "campfire", "volcano", "factory", "signal", "wreck", "column"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "From, across (%)" },
    lean: { type: "int", min: -100, max: 100, def: 30, label: "Wind lean (%)" },
    smoke: { type: "colour", def: "#8a8890", label: "Smoke" },
    thick: { type: "int", min: 10, max: 100, def: 70, label: "Thickness (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), x0 = S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), up = S.sub(S.sub(S.h, 1), S.y);
    const mid = S.add(x0, S.div(S.mul(S.mul(up, up), S.p("lean")), S.mul(S.max(S.h, 1), 100))), half = S.add(1, S.div(S.mul(up, 2), 5));
    const n = shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 32), S.FRAMES)), 4, 2461, 32);
    const inside = S.lt(S.abs(S.sub(S.x, mid)), half), edge = S.div(S.mul(S.abs(S.sub(S.x, mid)), 100), S.max(half, 1));
    const t = S.clamp(S.div(S.mul(S.sub(S.add(n, 40), edge), S.p("thick")), 150), 0, 100), lv = S.sel(inside, shaderUiSteps(S, t), 0);
    return S.sel(S.gt(lv, 0), shaderPaintMix(S, c, shaderPaintShade(S, S.p("smoke"), S.add(80, S.div(n, 8)), 0), S.mul(lv, 28)), c);
  },
};

SHADER_DEFS.portal = {
  label: "Portal", title: "a swirling portal at a point: spiral arms of two colors turning inside a bright rim, a faint glow round it",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["portal", "vortex", "warp", "gate", "magic", "rift", "teleport", "sci-fi", "dimension", "swirl"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Across (%)" },
    down: { type: "int", min: 0, max: 100, def: 50, label: "Down (%)" },
    size: { type: "int", min: 10, max: 100, def: 45, label: "Size (% of the height)" },
    one: { type: "colour", def: "#7a3aff", label: "Arms" },
    two: { type: "colour", def: "#2a0a5a", label: "Between" },
    arms: { type: "int", min: 1, max: 6, def: 3, label: "Arms" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = shaderUyAt(S, S.p("across"), S.p("down")), K = shaderUiClock(S, P.x, P.y), D = S.max(S.div(S.mul(S.p("size"), S.h), 100), 4);
    const per = S.max(S.div(360, S.p("arms")), 1), a = S.mod(S.add(S.add(K.a, S.mul(K.d2, 12)), S.sub(720, S.div(S.mul(S.frame, per), S.FRAMES))), per);
    const inside = S.lt(K.d2, D), rim = S.and(inside, S.ge(K.d2, S.sub(D, 2))), glow = S.and(S.ge(K.d2, D), S.lt(K.d2, S.add(D, 4)), S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    return S.pick([[rim, shaderPaintMix(S, S.p("one"), S.rgba(255, 255, 255, 255), 55)], [inside, S.sel(S.lt(S.mul(a, 2), per), S.p("one"), S.p("two"))], [glow, shaderPaintMix(S, c, S.p("one"), 40)]], c);
  },
};

SHADER_DEFS.blackhole = {
  label: "Black hole", title: "a black hole: a dark disc swallowing the middle, the picture bent round it, a hot ring of matter whirling at its edge",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["black hole", "gravity", "space", "lensing", "singularity", "event horizon", "sci-fi", "vortex", "cosmic", "warp"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Across (%)" },
    down: { type: "int", min: 0, max: 100, def: 50, label: "Down (%)" },
    size: { type: "int", min: 4, max: 40, def: 14, label: "Hole size (% of the height)" },
    bend: { type: "int", min: 0, max: 100, def: 60, label: "Bending (%)" },
    ring: { type: "colour", def: "#ffb04a", label: "Hot ring" },
  },
  fragment: function (S) {
    const P = shaderUyAt(S, S.p("across"), S.p("down")), dx = S.sub(S.x, P.x), dy = S.sub(S.y, P.y);
    const d2 = S.add(S.mul(dx, dx), S.mul(dy, dy)), d = shaderPaintSqrt(S, d2), R = S.max(S.div(S.mul(S.p("size"), S.h), 200), 2);
    // light passing near is bent: read from further out by R^2 / d, scaled by the bending
    const push = S.div(S.mul(S.div(S.mul(S.mul(R, R), S.p("bend")), 100), 100), S.max(d, 1));
    const sx = S.add(S.x, S.div(S.mul(dx, push), S.mul(S.max(d, 1), 100))), sy = S.add(S.y, S.div(S.mul(dy, push), S.mul(S.max(d, 1), 100)));
    const ang = shaderMotionAtan(S, dx, dy), whirl = S.lt(S.mod(S.add(ang, S.div(S.mul(S.frame, 360), S.FRAMES)), 60), 30);
    const ringOn = S.and(S.ge(d, R), S.le(d, S.add(R, 1)));
    return S.pick([[S.lt(d, R), S.rgba(0, 0, 0, 255)], [ringOn, S.sel(whirl, S.p("ring"), shaderPaintShade(S, S.p("ring"), 60, 0))]], S.texAt(sx, sy, "clamp"));
  },
};

SHADER_DEFS.lasergrid = {
  label: "Laser grid", title: "a security laser grid: thin red beams sweeping up, down and across the screen, glowing where they cross",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 12, pad: [0, 0, 0, 0],
  tags: ["lasers", "security", "heist", "grid", "beams", "stealth", "spy", "trap", "sci-fi", "red"],
  params: {
    beams: { type: "int", min: 1, max: 4, def: 3, label: "Beams each way" },
    laser: { type: "colour", def: "#ff2a3a", label: "Beams" },
    dark: { type: "int", min: 0, max: 80, def: 25, label: "Darken (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 360), S.FRAMES), N = S.p("beams");
    let h = S.lt(1, 0), v = S.lt(1, 0);
    for (let k = 0; k < 4; k++) {
      // beam k sweeps on a sine at its own phase: rows for the level beams, columns for the upright ones
      const sy = S.add(S.div(S.h, 2), S.div(S.mul(shaderMotionSin(S, S.add(t, k * 90)), S.sub(S.div(S.h, 2), 1)), 1000));
      const sx = S.add(S.div(S.w, 2), S.div(S.mul(shaderMotionCos(S, S.add(S.mul(t, 2), k * 70)), S.sub(S.div(S.w, 2), 1)), 1000));
      h = S.or(h, S.and(S.lt(k, N), S.eq(S.y, sy))); v = S.or(v, S.and(S.lt(k, N), S.eq(S.x, sx)));
    }
    const bg = shaderPaintMix(S, c, S.rgba(0, 0, 0, 255), S.p("dark"));
    return S.pick([[S.and(h, v), S.rgba(255, 220, 220, 255)], [S.or(h, v), S.p("laser")]], bg);
  },
};

SHADER_DEFS.vortexwipe = {
  label: "Vortex wipe", title: "the cover swirls out from the middle, its edge a spiral that winds tighter as it grows",
  group: "Transitions", kind: "screen", transition: "covered", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#1a0a3a", label: "Cover" },
    arms: { type: "int", min: 1, max: 6, def: 3, label: "Spiral arms" },
    depth: { type: "int", min: 0, max: 16, def: 8, label: "Spiral depth (px)" },
  },
  fragment: function (S) {
    const p = S.progress(), K = shaderUiClock(S), A = S.mul(S.p("depth"), 2), Rm = S.add(shaderPaintSqrt(S, S.add(S.mul(S.w, S.w), S.mul(S.h, S.h))), 2);
    const per = S.max(S.div(360, S.p("arms")), 1), a = S.mod(S.add(K.a, S.mul(K.d2, 6)), per), wave = S.div(S.mul(a, A), per);   // 0 .. A
    const R = S.sub(S.div(S.mul(S.add(Rm, A), p), 100), A);
    return S.sel(S.or(S.lt(S.add(K.d2, wave), R), S.eq(p, 100)), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.tilefade = {
  label: "Tile fade", title: "the screen's tiles each dithering away to the cover in their own time",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    tile: { type: "int", min: 2, max: 24, def: 8, label: "Tile (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Order" },
  },
  fragment: function (S) {
    const p = S.progress(), T = S.p("tile"), st = S.mod(S.hash(S.div(S.x, T), S.div(S.y, T), S.add(S.mul(S.p("seed"), 4), 2471)), 61);
    const t = S.div(S.mul(S.max(S.sub(p, st), 0), 100), 40);
    return S.sel(S.lt(S.div(S.mul(shaderWxBayer(S, 1), 100), 16), t), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.vinebound.variants = [{ wind: 3 }, { vine: "#5a3a1a", leaf: "#a07a3a", wind: 0 }];
SHADER_DEFS.mummified.variants = [{ amount: 100, strip: 2 }, { amount: 50, strip: 5, linen: "#c8c0a8" }];
SHADER_DEFS.enchantglint.variants = [{ strength: 90, width: 8 }, { glint: "#3ac8ff", width: 3 }];
SHADER_DEFS.animalprint.variants = [{ print: 0, ink: "#2a1206" }, { print: 2, strength: 100 }, { print: 3, scale: 4 }];
SHADER_DEFS.polkadots.variants = [{ spacing: 10, size: 3, spot: "#ff3a6a" }, { spacing: 4, size: 1 }];
SHADER_DEFS.batik.variants = [{ crackle: 3 }, { dyes: ["#3a0a0a", "#c8501a", "#ffd88a", "#fff8e8"], crackle: 10 }];
SHADER_DEFS.photocopy.variants = [{ noise: 20, level: 160 }, { noise: 0, toner: "#2a1a4a", paper: "#fff8f0" }];
SHADER_DEFS.barrel.variants = [{ bend: 50 }, { bend: -40, border: "#1a1a24" }];
SHADER_DEFS.sparkshower.variants = [{ across: 20, down: 10 }, { hot: "#c8f0ff", cool: "#3a8cff" }];
SHADER_DEFS.smokeplume.variants = [{ lean: -60, thick: 100 }, { across: 20, lean: 0, smoke: "#3a3a40" }];
SHADER_DEFS.portal.variants = [{ one: "#3affb0", two: "#0a3a2a", arms: 2 }, { size: 80, arms: 6 }];
SHADER_DEFS.blackhole.variants = [{ size: 30, bend: 100 }, { across: 30, down: 40, size: 8, ring: "#7ac8ff" }];
SHADER_DEFS.lasergrid.variants = [{ beams: 4, dark: 50 }, { beams: 1, laser: "#3aff6a" }];
SHADER_DEFS.vortexwipe.variants = [{ arms: 6, depth: 16 }, { arms: 1, depth: 0, cover: "#000000" }];
SHADER_DEFS.tilefade.variants = [{ tile: 2 }, { tile: 16, cover: "#ffffff", seed: 3 }];

// ---- Frost, film and steam, pencils and polygons, storms and eclipses, two more transitions ----
// ======================================================================================================================
// For a sprite: frosted glass, shrink-wrapped, steaming, ink bleeding, a game-text outline. Looks: colored pencil, the
// PICO-8 palette, low-poly triangles, an isometric grid. The screen: a tornado, an eclipse, coins raining, edges burnt
// away. Transitions: a color wipe, a corner wipe. Private helpers shaderLp*; earlier helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("frosted", "shrinkwrap", "steaming", "inkbleed", "gameoutline", "coloredpencil", "pico8", "lowpoly", "isogrid",
  "tornado", "eclipse", "coinrain", "burntedges", "colorwipe", "cornerwipe");

SHADER_DEFS.frosted = {
  label: "Frosted", title: "the sprite as frosted glass: its colors scattered a pixel this way and that and paled, its edge catching the light",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["frosted", "glass", "frosted glass", "ice", "translucent", "crystal", "cold", "window", "pale", "sculpture"],
  params: {
    frost: { type: "colour", def: "#e8f4ff", label: "Frost" },
    pale: { type: "int", min: 0, max: 100, def: 40, label: "Paleness (%)" },
    scatter: { type: "int", min: 1, max: 3, def: 1, label: "Scatter (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), M = S.p("scatter"), h = S.hash(S.x, S.y, 2501);
    const dx = S.sub(S.mod(h, S.add(S.mul(M, 2), 1)), M), dy = S.sub(S.mod(S.div(h, 7), S.add(S.mul(M, 2), 1)), M);
    const q0 = S.texAt(S.add(S.x, dx), S.add(S.y, dy), "clear"), q = S.sel(S.solid(q0), q0, c);
    const rim = S.and(S.solid(c), shaderPaintRim(S));
    return S.sel(S.solid(c), shaderPaintMix(S, q, S.p("frost"), S.sel(rim, S.add(S.p("pale"), 30), S.p("pale"))), c);
  },
};

SHADER_DEFS.shrinkwrap = {
  label: "Shrink-wrapped", title: "the sprite sealed in plastic like a toy in its packaging: a thin film round it, glossy streaks across it",
  group: "Items", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [1, 1, 1, 1],
  tags: ["shrinkwrap", "plastic", "packaging", "toy", "mint condition", "sealed", "collectible", "blister", "shop", "new"],
  params: {
    film: { type: "colour", def: "#e8eef8", label: "Film" },
    gloss: { type: "int", min: 0, max: 100, def: 55, label: "Gloss (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), G = S.p("gloss"), r1 = shaderEnchRing1(S);
    // two diagonal streaks across the sprite ("\\", top left to bottom right), a wide one and a thin one, 30 % and 60 % of the
    // way across. (Before build 42 an offset put them in the image's empty corners, running "/" along a sword: no gloss.)
    const span = S.max(S.add(S.w, S.h), 1), u = S.add(S.sub(S.x, S.y), S.h);
    const s1 = S.and(S.ge(S.mul(u, 10), S.mul(span, 3)), S.lt(S.mul(u, 10), S.add(S.mul(span, 3), 30))), s2 = S.eq(S.div(S.mul(u, 10), span), 6);
    const film = S.and(r1, S.eq(S.mod(S.add(S.x, S.y), 2), 0));
    return S.pick([
      [film, S.p("film")],
      [S.and(S.solid(c), s1), shaderPaintMix(S, c, S.rgba(255, 255, 255, 255), G)],
      [S.and(S.solid(c), s2), shaderPaintMix(S, c, S.rgba(255, 255, 255, 255), S.div(G, 2))],
      [S.solid(c), shaderPaintMix(S, c, S.p("film"), 12)],
    ], c);
  },
};

SHADER_DEFS.steaming = {
  label: "Steaming", title: "steam rising off the sprite: pale wisps curling up from its top, as from hot food, a hot bath or a sweaty brow",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [6, 0, 0, 0], strength: "amount",
  tags: ["steam", "steaming", "hot", "food", "coffee", "bath", "sweat", "vapor", "warm", "cooking"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 55, label: "Amount (%)" },
    steam: { type: "colour", def: "#f4f8ff", label: "Steam" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), k = shaderEnchBelow(S, 6);
    // the noise rises 16 px a loop and sways; it thins with height
    const wob = S.div(shaderMotionSin(S, S.add(S.mul(S.y, 40), S.div(S.mul(S.frame, 360), S.FRAMES))), 600);
    const n = shaderEnchFlow(S, S.add(S.x, wob), S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, 2511, 16);
    const on = S.and(S.gt(A, 0), S.not(S.solid(c)), S.le(k, 6), S.gt(S.add(n, S.mul(k, 12)), S.sub(300, S.div(S.mul(A, 12), 10))));
    return S.sel(on, S.sel(S.lt(k, 3), S.p("steam"), shaderPaintShade(S, S.p("steam"), 85, 0)), c);
  },
};

SHADER_DEFS.inkbleed = {
  label: "Ink bleed", title: "the sprite drawn in wet ink on soft paper: its edge darkened where the ink pooled, bleeding a pixel out into the paper",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 1, fps: 1, pad: [1, 1, 1, 1],
  tags: ["ink", "bleed", "watercolor", "wet", "paper", "illustration", "brush", "painting", "soft", "artistic"],
  params: {
    pool: { type: "int", min: 0, max: 80, def: 35, label: "Pooled edge (%)" },
    bleed: { type: "int", min: 0, max: 100, def: 45, label: "Bleed (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let col = S.tex(0, -1);
    for (const [dx, dy] of dirs) { const q = S.tex(dx, dy); col = S.sel(S.solid(q), q, col); }
    const r1 = shaderEnchRing1(S), rim = S.and(S.solid(c), shaderPaintRim(S));
    const bleed = S.and(r1, S.lt(S.mod(S.hash(S.x, S.y, 2521), 100), S.p("bleed")));
    return S.pick([[bleed, shaderPaintShade(S, col, 85, 20)], [rim, shaderPaintShade(S, c, S.sub(100, S.p("pool")), 0)]], c);
  },
};

SHADER_DEFS.gameoutline = {
  label: "Game text outline", title: "a game title's outline: a solid outline round the sprite and a hard shadow a pixel down and right of it",
  group: "Items", kind: "sprite", frames: 1, fps: 1, pad: [1, 2, 2, 1],
  tags: ["outline", "shadow", "text", "title", "logo", "arcade", "readable", "ui", "drop shadow", "badge"],
  params: {
    line: { type: "colour", def: "#000000", label: "Outline" },
    shadow: { type: "colour", def: "#5a2a8a", label: "Shadow" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), r1 = shaderEnchRing1(S);
    // the outlined shape up and to the left of this pixel: is it solid or its own outline?
    const O = S.or(S.solid(S.tex(-1, -1)), S.solid(S.tex(0, -1)), S.solid(S.tex(-1, 0)), S.solid(S.tex(-2, -1)), S.solid(S.tex(-1, -2)));
    return S.pick([[S.solid(c), c], [r1, S.p("line")], [O, S.p("shadow")]], c);
  },
};

SHADER_DEFS.coloredpencil = {
  label: "Colored pencil", title: "the picture in colored pencil: slanted strokes in its own colors, crosshatched in the darks, the paper showing between",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["colored pencil", "pencil", "sketch", "drawing", "crosshatch", "art", "strokes", "school", "illustration", "paper"],
  params: {
    paper: { type: "colour", def: "#f6f2e8", label: "Paper" },
    hatch: { type: "int", min: 0, max: 255, def: 110, label: "Crosshatch below (brightness)" },
    tint: { type: "int", min: 0, max: 60, def: 25, label: "Paper tinted (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), j = S.mod(S.hash(S.div(S.add(S.x, S.y), 4), 1, 2531), 2);
    const stroke = S.eq(S.mod(S.add(S.sub(S.x, S.y), S.add(j, 512)), 3), 0), cross = S.and(S.lt(S.luma(c), S.p("hatch")), S.eq(S.mod(S.add(S.x, S.y), 3), 0));
    const darkFill = S.lt(S.luma(c), S.div(S.p("hatch"), 2));
    const lead = shaderPaintPunch(S, c, 130), bg = shaderPaintMix(S, S.p("paper"), c, S.p("tint"));
    return S.sel(S.solid(c), S.sel(S.or(stroke, cross, darkFill), shaderTkRgb(S, S.r(lead), S.g(lead), S.b(lead)), bg), c);
  },
};

SHADER_DEFS.pico8 = {
  label: "PICO-8", title: "the picture in the PICO-8 fantasy console's sixteen colors, nearest match, lightly dithered",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["pico-8", "fantasy console", "16 colors", "palette", "retro", "indie", "pixel art", "limited palette", "jam", "lofi"],
  params: {
    colors: { type: "palette", def: ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"], max: 16, label: "Colors" },
    dither: { type: "int", min: 0, max: 96, def: 20, label: "Dither" },
  },
  fragment: function (S) { return shaderOldMap(S, "colors", 1, S.p("dither")); },
};

SHADER_DEFS.lowpoly = {
  label: "Low poly", title: "the picture as low-poly art: the grid of each cell split into two triangles, each one flat in the color at its middle",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["low poly", "triangles", "polygons", "geometric", "facets", "3d", "flat", "modern", "abstract", "faceted"],
  params: {
    cell: { type: "int", min: 3, max: 16, def: 6, label: "Cell (px)" },
    facet: { type: "int", min: 0, max: 30, def: 8, label: "Facet shading (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = S.p("cell"), bx = S.mul(S.div(S.x, P), P), by = S.mul(S.div(S.y, P), P), fx = S.mod(S.x, P), fy = S.mod(S.y, P);
    // alternate cells cut the other diagonal; the upper triangle reads its color a third in from its corner
    const flip = S.eq(S.mod(S.add(S.div(S.x, P), S.div(S.y, P)), 2), 1), upper = S.sel(flip, S.lt(S.add(fx, fy), P), S.gt(fx, fy));
    const ux = S.sel(flip, S.div(P, 3), S.div(S.mul(P, 2), 3)), uy = S.div(P, 3), lx = S.sel(flip, S.div(S.mul(P, 2), 3), S.div(P, 3)), ly = S.div(S.mul(P, 2), 3);
    const q = S.texAt(S.add(bx, S.sel(upper, ux, lx)), S.add(by, S.sel(upper, uy, ly)), "clamp"), col = S.sel(S.solid(q), q, c);
    const out = shaderPaintShade(S, col, S.sel(upper, S.add(100, S.p("facet")), S.sub(100, S.p("facet"))), 0);
    return S.sel(S.solid(c), shaderTkRgb(S, S.r(out), S.g(out), S.b(out)), c);
  },
};

SHADER_DEFS.isogrid = {
  label: "Isometric grid", title: "an isometric (2:1) grid over the screen, for laying out and checking isometric art",
  group: "Looks", kind: "screen", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["isometric", "grid", "2:1", "level design", "tool", "guide", "tiles", "diamond", "pixel art", "overlay"],
  params: {
    tile: { type: "int", min: 4, max: 64, def: 16, label: "Tile width (px)" },
    line: { type: "colour", def: "#3ac8ff", label: "Lines" },
    strength: { type: "int", min: 0, max: 100, def: 45, label: "Strength (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), T = S.p("tile"), big = S.mul(T, 256);
    const on = S.or(S.eq(S.mod(S.add(S.sub(S.x, S.mul(S.y, 2)), big), T), 0), S.eq(S.mod(S.add(S.x, S.mul(S.y, 2)), T), 0));
    return S.sel(on, shaderPaintMix(S, c, S.p("line"), S.p("strength")), c);
  },
};

SHADER_DEFS.tornado = {
  label: "Tornado", title: "a tornado on the horizon: a funnel narrowing to the ground, dust bands spiraling up it, swaying, the sky darkened",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["tornado", "twister", "storm", "funnel", "wind", "disaster", "weather", "cyclone", "dust", "plains"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 55, label: "Across (%)" },
    width: { type: "int", min: 5, max: 60, def: 25, label: "Width at the top (% of the screen)" },
    dust: { type: "colour", def: "#6a6458", label: "Dust" },
    sky: { type: "int", min: 0, max: 80, def: 35, label: "Darken the sky (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), up = S.sub(S.sub(S.h, 1), S.y), t = S.div(S.mul(S.frame, 360), S.FRAMES);
    const sway = S.div(S.mul(shaderMotionSin(S, S.add(t, S.mul(up, 8))), S.div(S.w, 20)), 1000), cx = S.add(S.div(S.mul(S.p("across"), S.w), 100), sway);
    const half = S.add(1, S.div(S.mul(S.mul(S.div(S.mul(S.p("width"), S.w), 200), up), up), S.max(S.mul(S.h, S.h), 1)));
    const off = S.sub(S.x, cx), inside = S.lt(S.abs(off), half);
    // bands spiral up the funnel: across it and up it, moving once a loop
    const band = S.lt(S.mod(S.add(S.add(S.div(S.mul(off, 8), S.max(half, 1)), S.div(up, 2)), S.sub(64, S.div(S.mul(S.frame, 8), S.FRAMES))), 8), 4);
    const sky = shaderPaintMix(S, c, S.rgba(30, 32, 40, 255), S.p("sky"));
    return S.sel(inside, shaderPaintShade(S, S.p("dust"), S.sel(band, 120, 80), 0), sky);
  },
};

SHADER_DEFS.eclipse = {
  label: "Eclipse", title: "a solar eclipse: the moon sliding across the sun, the sky dimming as it covers it, a corona flaring at totality",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["eclipse", "sun", "moon", "corona", "sky", "astronomy", "omen", "apocalypse", "celestial", "dark"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Sun across (%)" },
    down: { type: "int", min: 0, max: 100, def: 30, label: "Sun down (%)" },
    size: { type: "int", min: 3, max: 30, def: 10, label: "Sun radius (px)" },
    sun: { type: "colour", def: "#fff2b0", label: "Sun" },
    dim: { type: "int", min: 0, max: 100, def: 60, label: "Dimming at totality (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), P = shaderUyAt(S, S.p("across"), S.p("down")), R = S.p("size");
    // the moon crosses from 3 radii left to 3 right over the loop
    const mx = S.add(P.x, S.sub(S.div(S.mul(S.frame, S.mul(R, 6)), S.FRAMES), S.mul(R, 3))), gap = S.abs(S.sub(mx, P.x));
    const cover = S.max(S.sub(100, S.div(S.mul(gap, 50), S.max(R, 1))), 0);                 // 100 at totality, 0 two radii off
    const sd = S.add(S.mul(S.sub(S.x, P.x), S.sub(S.x, P.x)), S.mul(S.sub(S.y, P.y), S.sub(S.y, P.y))), md = S.add(S.mul(S.sub(S.x, mx), S.sub(S.x, mx)), S.mul(S.sub(S.y, P.y), S.sub(S.y, P.y)));
    const inSun = S.le(sd, S.mul(R, R)), inMoon = S.le(md, S.mul(R, R));
    const corona = S.and(S.gt(cover, 80), S.le(sd, S.mul(S.add(R, 3), S.add(R, 3))), S.not(inSun), S.lt(shaderWxBayer(S, 1), S.div(S.sub(cover, 80), 2)));
    const sky = shaderPaintMix(S, c, S.rgba(10, 12, 30, 255), S.div(S.mul(cover, S.p("dim")), 100));
    return S.pick([[inMoon, S.sel(inSun, S.rgba(8, 8, 14, 255), sky)], [inSun, S.p("sun")], [corona, shaderPaintMix(S, sky, S.p("sun"), 60)]], sky);
  },
};

SHADER_DEFS.coinrain = {
  label: "Coin rain", title: "gold coins raining down the screen, spinning as they fall, for a jackpot or a treasure room",
  group: "World", kind: "screen", palette: "free", frames: 8, fps: 12, pad: [0, 0, 0, 0],
  tags: ["coins", "gold", "jackpot", "treasure", "money", "reward", "win", "rain", "loot", "casino"],
  params: {
    coins: { type: "int", min: 0, max: 100, def: 30, label: "Coins (%)" },
    gold: { type: "colour", def: "#ffd03a", label: "Gold" },
    edge: { type: "colour", def: "#a86a10", label: "Edge" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), fall = S.div(S.mul(S.frame, 24), S.FRAMES);
    // a coin in some 8 px cells, the field falling 24 px a loop (three cells); it turns from face-on to edge-on and back
    const x = S.add(S.x, 512), y = S.add(S.sub(S.y, fall), 512), h = S.hash(S.div(x, 8), S.mod(S.div(y, 8), 3), 2541);
    const on = S.lt(S.mod(h, 100), S.p("coins")), lx = S.sub(S.mod(x, 8), 3), ly = S.sub(S.mod(y, 8), 3);
    const spin = S.mod(S.add(S.frame, S.div(h, 100)), 4), wd = S.pick([[S.eq(spin, 0), 2], [S.eq(spin, 2), 0]], 1);
    const body = S.and(on, S.le(S.abs(lx), wd), S.le(S.abs(ly), 2)), rim = S.and(body, S.or(S.eq(S.abs(lx), wd), S.eq(S.abs(ly), 2)));
    const shine = S.and(body, S.eq(lx, S.neg(S.min(wd, 1))), S.eq(ly, -1));
    return S.pick([[shine, S.rgba(255, 252, 220, 255)], [rim, S.p("edge")], [body, S.p("gold")]], c);
  },
};

SHADER_DEFS.burntedges = {
  label: "Burnt edges", title: "the screen as a burning page: its edges eaten away to black, a glowing rim flickering where it burns, scorched brown inside",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["burnt", "burning", "paper", "scorched", "map", "parchment", "fire", "edges", "old", "vignette"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 40, label: "Amount (%)" },
    ash: { type: "colour", def: "#0a0604", label: "Burnt away" },
    glow: { type: "colour", def: "#ff7a1a", label: "Burning rim" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), e = S.min(S.min(S.x, S.y), S.min(S.sub(S.sub(S.w, 1), S.x), S.sub(S.sub(S.h, 1), S.y)));
    const b = S.add(S.div(S.mul(A, S.div(S.min(S.w, S.h), 3)), 100), S.div(S.sub(shaderPaintNoise(S, S.x, S.y, 4, 2551), 128), 24));
    const flick = S.eq(S.mod(S.add(S.hash(S.x, S.y, 2552), S.frame), 3), 0);
    return S.pick([
      [S.and(S.gt(A, 0), S.lt(e, b)), S.p("ash")],
      [S.and(S.gt(A, 0), S.lt(e, S.add(b, 1))), S.sel(flick, S.rgba(255, 220, 120, 255), S.p("glow"))],
      [S.and(S.gt(A, 0), S.lt(e, S.add(b, 4))), shaderPaintMix(S, c, S.rgba(90, 50, 20, 255), 55)],
    ], c);
  },
};

SHADER_DEFS.colorwipe = {
  label: "Color wipe", title: "the cover sweeps across behind a leading band of color stripes, like a rainbow or a brand's colors",
  group: "Transitions", kind: "screen", transition: "covered", palette: "free", frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    colors: { type: "palette", def: ["#ff3a3a", "#ff9a2a", "#ffe84a", "#4ae05a", "#3a8cff", "#8a5aff"], max: 8, label: "Stripes, leading first" },
    stripe: { type: "int", min: 1, max: 8, def: 2, label: "Stripe width (px)" },
    slant: { type: "int", min: 0, max: 1, def: 1, label: "Edge", choices: ["upright", "slanted"] },
  },
  fragment: function (S) {
    const p = S.progress(), n = S.palCount("colors"), B = S.mul(S.p("stripe"), n), u = S.add(S.x, S.sel(S.eq(S.p("slant"), 1), S.div(S.y, 2), 0));
    const span = S.add(S.add(S.w, S.div(S.h, 2)), B), edge = S.div(S.mul(p, span), 100), ahead = S.sub(S.sub(edge, u), 0);
    // behind the edge lies the cover; the band of stripes is just behind its leading edge
    return S.pick([[S.or(S.ge(ahead, B), S.eq(p, 100)), S.p("cover")], [S.and(S.gt(p, 0), S.ge(ahead, 0)), S.palAt("colors", S.div(ahead, S.p("stripe")))]], S.tex(0, 0));
  },
};

SHADER_DEFS.cornerwipe = {
  label: "Corner wipe", title: "the cover grows in from the four corners as triangles until they meet in the middle",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    corners: { type: "int", min: 0, max: 1, def: 0, label: "From", choices: ["all four corners", "two opposite corners"] },
  },
  fragment: function (S) {
    const p = S.progress(), two = S.eq(S.p("corners"), 1);
    const ex = S.min(S.x, S.sub(S.sub(S.w, 1), S.x)), ey = S.min(S.y, S.sub(S.sub(S.h, 1), S.y));
    // the distance (thousandths, x and y summed as shares of the size) to the nearest corner: about 1000 at the middle
    const d4 = S.add(S.div(S.mul(ex, 1000), S.max(S.w, 1)), S.div(S.mul(ey, 1000), S.max(S.h, 1)));
    const dTL = S.add(S.div(S.mul(S.x, 1000), S.max(S.w, 1)), S.div(S.mul(S.y, 1000), S.max(S.h, 1))), dBR = S.sub(2000, dTL);
    const d = S.sel(two, S.min(dTL, dBR), d4);
    return S.sel(S.lt(S.mul(d, 100), S.mul(p, 1010)), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.frosted.variants = [{ scatter: 3, pale: 60 }, { frost: "#ffe8f0", pale: 20 }];
SHADER_DEFS.shrinkwrap.variants = [{ gloss: 90 }, { film: "#fff0e0", gloss: 30 }];
SHADER_DEFS.steaming.variants = [{ amount: 100 }, { amount: 25, steam: "#d8ffd8" }];
SHADER_DEFS.inkbleed.variants = [{ pool: 70, bleed: 80 }, { pool: 15, bleed: 20 }];
SHADER_DEFS.gameoutline.variants = [{ line: "#ffffff", shadow: "#000000" }, { line: "#2a1a0a", shadow: "#ffd84a" }];
SHADER_DEFS.coloredpencil.variants = [{ hatch: 200, tint: 50 }, { paper: "#fff8f0", hatch: 60, tint: 0 }];
SHADER_DEFS.pico8.variants = [{ dither: 0 }, { dither: 64 }];
SHADER_DEFS.lowpoly.variants = [{ cell: 3, facet: 15 }, { cell: 12, facet: 0 }];
SHADER_DEFS.isogrid.variants = [{ tile: 8 }, { tile: 32, line: "#ffffff", strength: 80 }];
SHADER_DEFS.tornado.variants = [{ width: 45, sky: 60 }, { across: 25, width: 12, dust: "#3a3a40" }];
SHADER_DEFS.eclipse.variants = [{ size: 20, dim: 90 }, { across: 75, down: 20, size: 6, sun: "#ffffff" }];
SHADER_DEFS.coinrain.variants = [{ coins: 70 }, { coins: 15, gold: "#e0e8f0", edge: "#7a8090" }];
SHADER_DEFS.burntedges.variants = [{ amount: 80 }, { amount: 20, glow: "#ffd03a" }];
SHADER_DEFS.colorwipe.variants = [{ stripe: 4, slant: 0 }, { colors: ["#ffffff", "#ffd84a"], stripe: 6 }];
SHADER_DEFS.cornerwipe.variants = [{ corners: 1 }, { cover: "#ffffff" }];

// ---- Lightning, ripples, maps and fabrics, skies and dunes, a timer and a ring menu, two more transitions ----
// ======================================================================================================================
// For a sprite: struck by lightning, rippling. Looks: an aperture-grille screen, a contour map, hillshade relief, fabric
// patterns. The screen: sand dunes, a night sky with a moon, an eruption, wind lines, glowing spores. UI: a countdown
// bar, a radial menu. Transitions: floating away, diamonds growing. No new helpers.
// ======================================================================================================================

SHADER_EFFECTS.push("struck", "spriteripple", "aperturegrille", "contourmap", "hillshade", "fabricpattern", "dunes", "nightsky", "eruption",
  "windlines", "spores", "timerbar", "radialmenu", "floataway", "diamondgrid");

SHADER_DEFS.struck = {
  label: "Struck", title: "the sprite struck by lightning: a jagged bolt stabbing down onto its top, a white flash, sparks crackling round it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 16, pad: [6, 1, 1, 1],
  tags: ["lightning", "struck", "thunder", "zap", "electric", "smite", "storm", "spell", "bolt", "damage"],
  params: {
    bolt: { type: "colour", def: "#ffffff", label: "Bolt" },
    glow: { type: "colour", def: "#8ac8ff", label: "Glow" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), t = S.div(S.mul(S.frame, 16), S.FRAMES), k = shaderEnchBelow(S, 6);
    // the bolt wanders a pixel a row round the middle column, a new path every frame it shows
    const jit = S.sub(S.mod(S.hash(S.div(S.y, 2), S.frame, 2601), 3), 1), bx = S.add(S.div(S.w, 2), jit);
    const showing = S.and(S.lt(t, 4), S.ne(t, 2));
    const bolt = S.and(showing, S.not(S.solid(c)), S.le(k, 6), S.eq(S.x, bx)), halo = S.and(showing, S.not(S.solid(c)), S.le(k, 6), S.eq(S.abs(S.sub(S.x, bx)), 1));
    const flash = S.and(S.solid(c), S.lt(t, 2)), spark = S.and(S.ge(t, 2), S.lt(t, 6), shaderEnchRing1(S), S.eq(S.mod(S.hash(S.x, S.y, S.frame), 3), 0));
    return S.pick([[bolt, S.p("bolt")], [S.or(halo, spark), S.p("glow")], [flash, shaderPaintMix(S, c, S.p("bolt"), 75)]], c);
  },
};

SHADER_DEFS.spriteripple = {
  label: "Ripple", title: "a ripple running out through the sprite from its middle, bending its pixels and edge outward as it passes",
  group: "Sprite FX", kind: "sprite", frames: 16, fps: 12, pad: [2, 2, 2, 2],
  tags: ["ripple", "wave", "shock", "pulse", "distortion", "wobble", "hit", "water", "impact", "boing"],
  params: {
    push: { type: "int", min: 1, max: 2, def: 2, label: "Bend (px)" },
    width: { type: "int", min: 1, max: 6, def: 3, label: "Ring width (px)" },
  },
  fragment: function (S) {
    const K = shaderUiClock(S), Rm = S.add(S.max(S.w, S.h), 2), r = S.div(S.mul(S.frame, Rm), S.FRAMES), W2 = S.mul(S.p("width"), 2);
    const gap = S.abs(S.sub(K.d2, r)), push = S.sel(S.lt(gap, W2), S.p("push"), 0), dd = S.max(K.d2, 1);
    return S.texAt(S.sub(S.x, S.div(S.mul(K.X2, push), dd)), S.sub(S.y, S.div(S.mul(K.Y2, push), dd)), "clear");
  },
};

SHADER_DEFS.aperturegrille = {
  label: "Aperture grille", title: "a close-up of a color tube's face: each column showing only red, green or blue, brightened to make up for it",
  group: "Eras and display", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["aperture grille", "shadow mask", "crt", "subpixels", "rgb", "phosphor", "trinitron", "monitor", "retro", "close-up"],
  params: {
    mask: { type: "int", min: 0, max: 1, def: 0, label: "Mask", choices: ["aperture grille (stripes)", "shadow mask (offset triads)"] },
    boost: { type: "int", min: 100, max: 300, def: 220, label: "Brightness boost (%)" },
    gap: { type: "int", min: 0, max: 60, def: 20, label: "Dark lines (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), B = S.p("boost"), row = S.div(S.y, 2);
    const col = S.mod(S.add(S.x, S.sel(S.eq(S.p("mask"), 1), S.mul(S.mod(row, 2), 1), 0)), 3);
    const v = function (ch, k) { return S.sel(S.eq(col, k), S.min(S.div(S.mul(ch, B), 100), 255), 0); };
    const dark = S.sel(S.and(S.eq(S.p("mask"), 1), S.eq(S.mod(S.y, 2), 1)), S.sub(100, S.p("gap")), 100);
    const out = shaderPaintShade(S, S.rgba(v(S.r(c), 0), v(S.g(c), 1), v(S.b(c), 2), 255), S.sel(S.eq(S.p("mask"), 0), S.sel(S.eq(S.mod(S.y, 4), 3), S.sub(100, S.p("gap")), 100), dark), 0);
    return S.sel(S.solid(c), S.rgba(S.r(out), S.g(out), S.b(out), 255), c);
  },
};

SHADER_DEFS.contourmap = {
  label: "Contour map", title: "the picture as a topographic map: brightness as height in banded colors, a contour line wherever the height steps",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["contour", "topographic", "map", "terrain", "elevation", "isolines", "cartography", "survey", "height", "atlas"],
  params: {
    bands: { type: "int", min: 3, max: 12, def: 7, label: "Bands" },
    colors: { type: "palette", def: ["#2a5a8a", "#4a9ac8", "#8ac87a", "#c8d88a", "#d8b87a", "#a87a5a", "#f0f0f0"], max: 12, label: "Low to high" },
    line: { type: "colour", def: "#3a2a1a", label: "Contours" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), N = S.p("bands"), n = S.palCount("colors");
    const band = function (q) { return S.div(S.mul(shaderTkLum(S, q), N), 256); };
    const me = band(c), edge = S.or(S.ne(band(shaderLooksAt(S, 1, 0)), me), S.ne(band(shaderLooksAt(S, 0, 1)), me));
    const col = S.palAt("colors", S.div(S.mul(me, n), S.max(N, 1)));
    return S.sel(S.solid(c), S.sel(edge, S.p("line"), col), c);
  },
};

SHADER_DEFS.hillshade = {
  label: "Hillshade", title: "brightness read as height and lit from a direction like a relief map, over the picture or as gray relief alone",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["hillshade", "relief", "heightmap", "terrain", "emboss", "3d", "map", "lighting", "tool", "depth"],
  params: {
    angle: { type: "int", min: 0, max: 359, def: 225, label: "Light from (degrees)" },
    strength: { type: "int", min: 0, max: 200, def: 100, label: "Strength (%)" },
    show: { type: "int", min: 0, max: 1, def: 0, label: "Show", choices: ["shading over the picture", "gray relief alone"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), lx = shaderMotionCos(S, S.p("angle")), ly = shaderMotionSin(S, S.p("angle"));
    const L = function (dx, dy) { return shaderTkLum(S, shaderLooksAt(S, dx, dy)); };
    const gx = S.sub(L(1, 0), L(-1, 0)), gy = S.sub(L(0, 1), L(0, -1)), dot = S.div(S.neg(S.add(S.mul(gx, lx), S.mul(gy, ly))), 1000);
    const g = S.clamp(S.add(128, S.div(S.mul(dot, S.p("strength")), 100)), 0, 255), relief = S.rgba(g, g, g, 255);
    const over = shaderPaintShade(S, c, S.add(50, S.div(S.mul(g, 100), 255)), 0);
    return S.sel(S.solid(c), S.sel(S.eq(S.p("show"), 1), relief, shaderTkRgb(S, S.r(over), S.g(over), S.b(over))), c);
  },
};

SHADER_DEFS.fabricpattern = {
  label: "Fabric pattern", title: "a fabric pattern printed over the picture, keeping its shading: stripes, zigzags, plaid or argyle",
  group: "Looks", kind: "both", palette: "free", frames: 1, fps: 1, pad: [0, 0, 0, 0],
  tags: ["fabric", "pattern", "plaid", "argyle", "stripes", "zigzag", "tartan", "textile", "clothing", "sweater"],
  params: {
    pattern: { type: "int", min: 0, max: 3, def: 2, label: "Pattern", choices: ["stripes", "zigzag", "plaid", "argyle"] },
    ink: { type: "colour", def: "#c82a3a", label: "Pattern color" },
    strength: { type: "int", min: 0, max: 100, def: 55, label: "Strength (%)" },
    size: { type: "int", min: 3, max: 16, def: 6, label: "Size (px)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), Pn = S.p("pattern"), P = S.p("size"), A = S.p("strength");
    const stripes = S.lt(S.mod(S.x, P), S.div(P, 2));
    const zig = S.lt(S.mod(S.add(S.y, S.abs(S.sub(S.mod(S.x, P), S.div(P, 2)))), P), S.div(P, 3));
    const pv = S.lt(S.mod(S.x, S.mul(P, 2)), S.div(P, 2)), ph = S.lt(S.mod(S.y, S.mul(P, 2)), S.div(P, 2)), thin = S.or(S.eq(S.mod(S.x, S.mul(P, 2)), P), S.eq(S.mod(S.y, S.mul(P, 2)), P));
    const plaid = S.pick([[S.and(pv, ph), 100], [S.or(pv, ph), 55], [thin, 35]], 0);
    const Q = S.mul(P, 2), fx = S.abs(S.sub(S.mod(S.x, P), S.div(P, 2))), fy = S.abs(S.sub(S.mod(S.y, Q), P));
    const diamond = S.and(S.lt(S.add(S.mul(fx, 2), fy), P), S.eq(S.mod(S.add(S.div(S.x, P), S.div(S.y, Q)), 2), 0));
    const lines = S.or(S.eq(S.mod(S.add(S.mul(S.x, 2), S.y), Q), 0), S.eq(S.mod(S.add(S.sub(S.mul(S.x, 2), S.y), S.mul(Q, 64)), Q), 0));
    const argyle = S.pick([[diamond, 100], [lines, 60]], 0);
    const t = S.pick([[S.eq(Pn, 0), S.sel(stripes, 100, 0)], [S.eq(Pn, 1), S.sel(zig, 100, 0)], [S.eq(Pn, 2), plaid]], argyle);
    const ink = shaderPaintShade(S, S.p("ink"), S.add(50, S.div(S.mul(S.luma(c), 60), 255)), 0);
    return S.sel(S.solid(c), shaderPaintMix(S, c, ink, S.div(S.mul(t, A), 100)), c);
  },
};

SHADER_DEFS.dunes = {
  label: "Dunes", title: "wind-rippled sand dunes along the bottom of the screen: wavy ripples catching light and shade, creeping with the wind",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 6, pad: [0, 0, 0, 0],
  tags: ["dunes", "desert", "sand", "ripples", "sahara", "wind", "terrain", "arid", "beach", "landscape"],
  params: {
    height: { type: "int", min: 10, max: 100, def: 45, label: "Height (% of the screen)" },
    sand: { type: "colour", def: "#e0b070", label: "Sand" },
    ripple: { type: "int", min: 2, max: 8, def: 4, label: "Ripple spacing (px)" },
    tint: { type: "int", min: 0, max: 100, def: 70, label: "Sand over the picture (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.max(S.div(S.mul(S.p("height"), S.h), 100), 2), y0 = S.sub(S.h, H), R = S.p("ripple");
    // the dune's own crest wavers; ripples ride on it and creep one spacing a loop
    const crest = S.add(y0, S.div(S.mul(shaderMotionSin(S, S.mul(S.x, 6)), S.div(H, 4)), 1000)), inSand = S.ge(S.y, crest);
    const yy = S.add(S.sub(S.add(S.y, S.div(shaderMotionSin(S, S.mul(S.x, 24)), 600)), S.div(S.mul(S.frame, R), S.FRAMES)), S.mul(R, 64)), f = S.mod(yy, R);
    const shade = S.pick([[S.eq(f, 0), 125], [S.eq(f, 1), 110]], S.sel(S.eq(f, S.sub(R, 1)), 80, 95));
    return S.sel(inSand, shaderPaintMix(S, c, shaderPaintShade(S, S.p("sand"), shade, 0), S.p("tint")), c);
  },
};

SHADER_DEFS.nightsky = {
  label: "Night sky", title: "night falling over the top of the screen: the sky darkened blue, stars twinkling, a crescent moon glowing",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["night", "night sky", "moon", "stars", "crescent", "evening", "sky", "calm", "lullaby", "dark"],
  params: {
    height: { type: "int", min: 20, max: 100, def: 60, label: "Sky (% of the screen)" },
    dark: { type: "int", min: 0, max: 100, def: 70, label: "Darkness (%)" },
    moon: { type: "colour", def: "#fff6d0", label: "Moon" },
    stars: { type: "int", min: 0, max: 100, def: 25, label: "Stars (%)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), H = S.div(S.mul(S.p("height"), S.h), 100), inSky = S.lt(S.y, H);
    const sky = shaderPaintMix(S, c, S.rgba(8, 12, 40, 255), S.div(S.mul(S.p("dark"), S.sub(H, S.div(S.y, 2))), S.max(H, 1)));
    const h = S.hash(S.div(S.x, 3), S.div(S.y, 3), 2611), star = S.and(S.lt(S.mod(h, 100), S.p("stars")), S.eq(S.mod(S.x, 3), 1), S.eq(S.mod(S.y, 3), 1));
    const tw = S.lt(S.mod(S.add(S.div(h, 100), S.frame), 32), 24);
    // a crescent: the moon's disc less one shifted toward the upper right
    const mx = S.div(S.mul(S.w, 3), 4), my = S.max(S.div(H, 3), 3), R = S.max(S.div(H, 6), 2);
    const d1 = S.add(S.mul(S.sub(S.x, mx), S.sub(S.x, mx)), S.mul(S.sub(S.y, my), S.sub(S.y, my))), d2 = S.add(S.mul(S.sub(S.x, S.add(mx, S.div(R, 2))), S.sub(S.x, S.add(mx, S.div(R, 2)))), S.mul(S.sub(S.y, S.sub(my, S.div(R, 3))), S.sub(S.y, S.sub(my, S.div(R, 3)))));
    const crescent = S.and(S.le(d1, S.mul(R, R)), S.gt(d2, S.mul(R, R)));
    return S.pick([[S.not(inSky), c], [crescent, S.p("moon")], [S.and(star, tw), S.rgba(240, 244, 255, 255)]], sky);
  },
};

SHADER_DEFS.eruption = {
  label: "Eruption", title: "a volcano erupting from a point at the bottom of the screen: blobs of lava flung up in arcs, glowing as they fall",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 12, pad: [0, 0, 0, 0],
  tags: ["eruption", "volcano", "lava", "magma", "fire", "disaster", "explosion", "fountain", "geyser", "hot"],
  params: {
    across: { type: "int", min: 0, max: 100, def: 50, label: "Vent across (%)" },
    hot: { type: "colour", def: "#ffe060", label: "Hot" },
    lava: { type: "colour", def: "#e0401a", label: "Lava" },
    blobs: { type: "int", min: 2, max: 12, def: 8, label: "Blobs" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), vx = S.div(S.mul(S.p("across"), S.sub(S.w, 1)), 100), vy = S.sub(S.h, 1);
    let hit = S.i(-1);
    for (let k = 0; k < 12; k++) {
      // blob k: launched up at its own speed and lean, falling under gravity, 2 x 2
      const hb = S.hash(k, 3, 2621), sx = S.sub(S.mod(hb, 7), 3), sy = S.add(4, S.mod(S.div(hb, 10), 4)), t = S.mod(S.add(S.frame, S.mul(k, 3)), S.FRAMES);
      const px = S.add(vx, S.div(S.mul(sx, t), 2)), py = S.add(S.sub(vy, S.mul(sy, t)), S.div(S.mul(t, t), 3));
      const on = S.and(S.lt(k, S.p("blobs")), S.ge(S.sub(S.x, px), 0), S.le(S.sub(S.x, px), 1), S.ge(S.sub(S.y, py), 0), S.le(S.sub(S.y, py), 1));
      hit = S.sel(on, t, hit);
    }
    const vent = S.and(S.ge(S.y, S.sub(S.h, 2)), S.le(S.abs(S.sub(S.x, vx)), 2));
    return S.pick([[vent, S.p("hot")], [S.ge(hit, 0), shaderPaintMix(S, S.p("hot"), S.p("lava"), S.min(S.div(S.mul(hit, 100), 10), 100))]], c);
  },
};

SHADER_DEFS.windlines = {
  label: "Wind lines", title: "streaks of wind whipping across the screen, each a long thin line racing by",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 16, pad: [0, 0, 0, 0],
  tags: ["wind", "gust", "breeze", "streaks", "speed", "air", "storm", "anime", "motion", "weather"],
  params: {
    lines: { type: "int", min: 0, max: 100, def: 25, label: "Lines (%)" },
    streak: { type: "int", min: 2, max: 8, def: 6, label: "Length (px)" },
    wind: { type: "colour", def: "#ffffff", label: "Lines" },
    dir: { type: "int", min: 0, max: 1, def: 0, label: "Blows", choices: ["to the right", "to the left"] },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), back = S.eq(S.p("dir"), 1), sh = S.div(S.mul(S.frame, 64), S.FRAMES);
    let on = S.lt(1, 0);
    for (let k = 0; k < 8; k++) {
      // a line's head in some 16 x 4 cells; the field moves 64 px a loop (four cells)
      const x = S.add(S.add(S.sel(back, S.add(S.x, sh), S.sub(S.x, sh)), S.sel(back, -k, k)), 1024), cell = S.div(x, 16), cy = S.div(S.y, 4);
      const h = S.hash(S.mod(cell, 4), cy, S.add(2631, S.div(cell, 4)));
      on = S.or(on, S.and(S.lt(k, S.p("streak")), S.lt(S.mod(h, 100), S.p("lines")), S.eq(S.mod(x, 16), 0), S.eq(S.mod(S.y, 4), S.mod(S.div(h, 100), 4))));
    }
    return S.sel(on, shaderPaintMix(S, c, S.p("wind"), 70), c);
  },
};

SHADER_DEFS.spores = {
  label: "Spores", title: "glowing spores drifting slowly up through the scene, swaying and pulsing, the bigger ones haloed",
  group: "World", kind: "screen", palette: "free", frames: 32, fps: 8, pad: [0, 0, 0, 0],
  tags: ["spores", "bioluminescent", "forest", "magic", "mushrooms", "glow", "ambient", "fantasy", "particles", "fairy"],
  params: {
    spores: { type: "int", min: 0, max: 100, def: 30, label: "Spores (%)" },
    colors: { type: "palette", def: ["#7affd0", "#b0ff7a", "#7ad0ff"], max: 6, label: "Glow" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), n = S.palCount("colors"), rise = S.div(S.mul(S.frame, 30), S.FRAMES);
    const sway = S.div(S.mul(shaderMotionSin(S, S.add(S.mul(S.y, 12), S.div(S.mul(S.frame, 360), S.FRAMES))), 2), 1000);
    const x = S.add(S.add(S.x, sway), 640), y = S.add(S.add(S.y, rise), 640), h = S.hash(S.div(x, 10), S.mod(S.div(y, 10), 3), 2641);
    const on = S.lt(S.mod(h, 100), S.p("spores")), lx = S.sub(S.mod(x, 10), 5), ly = S.sub(S.mod(y, 10), 5), d2 = S.add(S.mul(lx, lx), S.mul(ly, ly));
    const big = S.eq(S.mod(S.div(h, 100), 3), 0), pulse = S.lt(S.mod(S.add(S.div(h, 7), S.frame), 16), 10), col = S.palAt("colors", S.mod(S.div(h, 13), n));
    return S.pick([
      [S.and(on, S.le(d2, S.sel(big, 1, 0))), S.sel(pulse, col, shaderPaintMix(S, c, col, 50))],
      [S.and(on, big, pulse, S.le(d2, 5), S.eq(S.mod(S.add(S.x, S.y), 2), 0)), shaderPaintMix(S, c, col, 35)],
    ], c);
  },
};

SHADER_DEFS.timerbar = {
  label: "Timer bar", title: "a countdown bar across the top of the screen draining as time runs out, green to yellow to red, flashing near the end",
  group: "World", kind: "screen", palette: "free", frames: 24, fps: 12, pad: [0, 0, 0, 0],
  tags: ["timer", "countdown", "bar", "hud", "time", "ui", "deadline", "quiz", "race", "hurry"],
  params: {
    progress: shaderWorldProgress(),
    thick: { type: "int", min: 1, max: 8, def: 3, label: "Height (px)" },
    track: { type: "colour", def: "#1a1a24", label: "Empty" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), p = S.progress(), left = S.sub(100, p), T = S.p("thick");
    const inBar = S.and(S.ge(S.y, 1), S.le(S.y, T), S.ge(S.x, 1), S.lt(S.x, S.sub(S.w, 1)));
    const full = S.lt(S.mul(S.sub(S.x, 1), 100), S.mul(left, S.sub(S.w, 2)));
    const col = S.pick([[S.gt(left, 50), S.rgba(74, 224, 90, 255)], [S.gt(left, 20), S.rgba(255, 216, 58, 255)]], S.rgba(232, 40, 60, 255));
    const flash = S.and(S.le(left, 20), S.lt(S.mod(S.frame, 4), 2));
    return S.pick([[S.not(inBar), c], [full, S.sel(flash, S.rgba(255, 255, 255, 255), col)]], S.p("track"));
  },
};

SHADER_DEFS.radialmenu = {
  label: "Radial menu", title: "a radial (pie) menu in the middle of the screen: a ring of segments, one of them lit as the choice runs round it",
  group: "World", kind: "screen", palette: "free", frames: 16, fps: 4, pad: [0, 0, 0, 0],
  tags: ["radial menu", "pie menu", "weapon wheel", "ui", "selection", "ring", "hud", "inventory", "choice", "wheel"],
  params: {
    segments: { type: "int", min: 3, max: 12, def: 8, label: "Segments" },
    radius: { type: "int", min: 6, max: 40, def: 14, label: "Radius (px)" },
    panel: { type: "colour", def: "#202838", label: "Segments" },
    lit: { type: "colour", def: "#ffd84a", label: "Chosen" },
    chosen: { type: "int", min: -1, max: 11, def: -1, label: "Chosen segment (-1 runs round)" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), K = shaderUiClock(S), N = S.p("segments"), R2 = S.mul(S.p("radius"), 2), r2 = S.div(R2, 2);
    const per = S.max(S.div(360, N), 1), seg = S.div(K.a, per), off = S.mod(K.a, per);
    const ring = S.and(S.lt(K.d2, R2), S.ge(K.d2, r2), S.gt(S.mul(off, K.d2), 60), S.gt(S.mul(S.sub(per, off), K.d2), 60));
    const ch = S.p("chosen"), pick = S.sel(S.ge(ch, 0), S.mod(ch, N), S.mod(S.div(S.mul(S.frame, N), S.FRAMES), N));
    const edge = S.and(ring, S.or(S.ge(K.d2, S.sub(R2, 2)), S.lt(K.d2, S.add(r2, 2))));
    return S.pick([[S.not(ring), c], [S.eq(seg, pick), S.sel(edge, S.rgba(255, 255, 255, 255), S.p("lit"))], [edge, shaderPaintShade(S, S.p("panel"), 180, 20)]], shaderPaintMix(S, c, S.p("panel"), 85));
  },
};

SHADER_DEFS.floataway = {
  label: "Float away", title: "the screen's columns float up and away, each at its own moment and gathering speed, the cover left below",
  group: "Transitions", kind: "screen", transition: "covered", reworks: true, frames: 24, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    column: { type: "int", min: 1, max: 16, def: 3, label: "Column width (px)" },
    stagger: { type: "int", min: 0, max: 80, def: 50, label: "Stagger (%)" },
  },
  fragment: function (S) {
    const p = S.progress(), col = S.div(S.x, S.p("column")), st = S.mod(S.hash(col, 1, 2651), S.add(S.p("stagger"), 1));
    const q = S.max(S.sub(p, st), 0), lift = S.div(S.mul(S.h, S.mul(q, q)), S.max(S.mul(S.sub(100, st), S.sub(100, st)), 1));
    return S.sel(S.ge(S.y, S.sub(S.h, lift)), S.p("cover"), S.texAt(S.x, S.add(S.y, lift), "clamp"));
  },
};

SHADER_DEFS.diamondgrid = {
  label: "Diamond grid", title: "diamonds of the cover growing on a grid until they meet, in a wave across or from the middle out",
  group: "Transitions", kind: "screen", transition: "covered", frames: 20, fps: 24, pad: [0, 0, 0, 0], still0: true,
  params: {
    progress: shaderWorldProgress(),
    cover: { type: "colour", def: "#000000", label: "Cover" },
    spacing: { type: "int", min: 3, max: 16, def: 8, label: "Spacing (px)" },
    order: { type: "int", min: 0, max: 2, def: 1, label: "Order", choices: ["all at once", "a wave across", "from the middle out"] },
    spread: { type: "int", min: 0, max: 200, def: 100, label: "Spread" },
  },
  fragment: function (S) {
    const p = S.progress(), P = S.p("spacing"), bx = S.div(S.x, P), by = S.div(S.y, P), O = S.p("order"), sp = S.p("spread");
    const nx = S.max(S.div(S.add(S.w, S.sub(P, 1)), P), 1), ny = S.max(S.div(S.add(S.h, S.sub(P, 1)), P), 1);
    const ddx = S.abs(S.sub(S.mul(bx, 2), S.sub(nx, 1))), ddy = S.abs(S.sub(S.mul(by, 2), S.sub(ny, 1)));
    const rank = S.pick([[S.eq(O, 0), 0], [S.eq(O, 1), S.div(S.mul(bx, 100), nx)]], S.div(S.mul(S.max(ddx, ddy), 100), S.max(S.max(nx, ny), 1)));
    const q = S.clamp(S.sub(S.div(S.mul(p, S.add(100, sp)), 100), S.div(S.mul(rank, sp), 100)), 0, 100);
    const fx2 = S.abs(S.sub(S.add(S.mul(S.mod(S.x, P), 2), 1), P)), fy2 = S.abs(S.sub(S.add(S.mul(S.mod(S.y, P), 2), 1), P));
    return S.sel(S.and(S.gt(q, 0), S.lt(S.mul(S.add(fx2, fy2), 100), S.mul(q, S.mul(P, 2)))), S.p("cover"), S.tex(0, 0));
  },
};

SHADER_DEFS.struck.variants = [{ bolt: "#fff6a0", glow: "#ffd84a" }, { bolt: "#e0c8ff", glow: "#a05aff" }];
SHADER_DEFS.spriteripple.variants = [{ push: 1, width: 1 }, { width: 6 }];
SHADER_DEFS.aperturegrille.variants = [{ mask: 1 }, { boost: 300, gap: 50 }];
SHADER_DEFS.contourmap.variants = [{ bands: 4 }, { bands: 12, colors: ["#101010", "#ffffff"], line: "#ff3a3a" }];
SHADER_DEFS.hillshade.variants = [{ show: 1 }, { angle: 45, strength: 200 }];
SHADER_DEFS.fabricpattern.variants = [{ pattern: 0, ink: "#ffffff" }, { pattern: 1, ink: "#1a1a1a", size: 4 }, { pattern: 3, ink: "#2a5a3a", size: 8 }];
SHADER_DEFS.dunes.variants = [{ height: 80, ripple: 3 }, { sand: "#c8c0b0", ripple: 8, tint: 40 }];
SHADER_DEFS.nightsky.variants = [{ height: 100, stars: 50 }, { dark: 40, moon: "#ffd8a0", stars: 10 }];
SHADER_DEFS.eruption.variants = [{ blobs: 12 }, { across: 25, blobs: 4, hot: "#c8f0ff", lava: "#3a8cff" }];
SHADER_DEFS.windlines.variants = [{ lines: 60, streak: 8 }, { dir: 1, streak: 3, wind: "#c8e8ff" }];
SHADER_DEFS.spores.variants = [{ spores: 70 }, { spores: 15, colors: ["#ffb0e0", "#ffffff"] }];
SHADER_DEFS.timerbar.variants = [{ progress: 85, thick: 6 }, { progress: 30, track: "#3a1a1a" }];
SHADER_DEFS.radialmenu.variants = [{ segments: 4, radius: 10 }, { segments: 12, radius: 30, chosen: 3, lit: "#3affb0" }];
SHADER_DEFS.floataway.variants = [{ column: 1, stagger: 80 }, { column: 16, stagger: 0, cover: "#ffffff" }];
SHADER_DEFS.diamondgrid.variants = [{ order: 0, spacing: 4 }, { order: 2, spacing: 16, spread: 200, cover: "#2a0a3a" }];

// ---- More live enchants: lifesteal, thorns, rage, magnetism, quakes, quicksilver, amber, mushrooms, hexes ----
// ======================================================================================================================
// Fifteen more LIVE enchants in the same mold as the first two rounds: each takes the whole sprite, has an `amount` (0
// is the plain sprite) a game can drive live as its strength, and a five-color ramp, light to dark (magnetic takes its
// two poles and its filings as colors instead). None of these has a relative in ITEM_ENCHANT_RAMPS; their ramps are
// new. vampiric, thorned, berserk, magnetic, quaking, mercurial, amberlocked, fungal, hexed, phased, lucky, gravitic,
// obsidian, borealis and miasma. None draws more than 4 px from the sprite.
// Private helpers shaderEx*; the shaderEnch*, shaderPaint*, shaderMotion*, shaderUi* and shaderTx* helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("vampiric", "thorned", "berserk", "magnetic", "quaking", "mercurial", "amberlocked", "fungal", "hexed",
  "phased", "lucky", "gravitic", "obsidian", "borealis", "miasma");

// a heart's double thump, twice in 16 steps, 0..100
const SHADER_EX_BEAT = [0, 70, 40, 100, 55, 25, 8, 0, 0, 70, 40, 100, 55, 25, 8, 0];
// a sprite's brightness through a five-color ramp, light to dark (0 the lightest)
function shaderExRampOf(S, c) { return S.palAt("ramp", S.sub(4, S.div(S.mul(S.luma(c), 5), 256))); }
// the pixel at (ox, oy) from this one is clear and within 2 px (Chebyshev) of the sprite
function shaderExNear2(S, ox, oy) {
  const near = [];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i || j) near.push(S.solid(S.tex(ox + i, oy + j)));
  return S.and(S.not(S.solid(S.tex(ox, oy))), S.or(...near));
}

SHADER_DEFS.vampiric = {
  label: "Vampiric", title: "lifesteal enchant: blood motes drawn in from all round the sprite, its edge throbbing crimson as it drinks",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["vampiric", "lifesteal", "vampire", "drain", "blood", "leech", "enchant", "siphon", "crimson", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#ffd0d8", "#ff3050", "#b01030", "#5a0820", "#1a0008"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Motes" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 901);
    // 24 wedges round the middle; in some, a mote steps in from two pixels out to the edge, then the edge flashes
    const k = shaderUiClock(S), h = S.hash(S.div(k.a, 15), 3, sd), act = S.lt(S.mod(h, 100), A);
    const ph = S.mod(S.add(S.frame, S.div(h, 100)), 8), rim = S.and(S.solid(c), shaderPaintRim(S));
    const mote = S.and(act, S.or(S.and(shaderEnchRing2(S), S.eq(ph, 0)), S.and(shaderEnchRing1(S), S.eq(ph, 1))));
    const sip = S.and(act, rim, S.eq(ph, 2));
    // the edge throbs twice a loop; the body darkens toward the blood
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 720), S.FRAMES));
    const edge = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(S.mul(A, S.add(500, S.div(s, 2))), 1000));
    return S.pick([[mote, S.palAt("ramp", 1)], [sip, S.palAt("ramp", 0)], [rim, edge], [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 5))]], c);
  },
};

SHADER_DEFS.thorned = {
  label: "Thorned", title: "thorns enchant: thorns pushing out from the sprite's edge, growing and drawing back, the body bark-tinted",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["thorns", "thorned", "spikes", "briar", "bramble", "retaliate", "enchant", "nature", "barbed", "defense"],
  params: Object.assign(shaderEnchParams(60, ["#f0f8c8", "#c8e070", "#6a9a30", "#3a4a1a", "#1a200a"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Thorns" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 911);
    // a thorn grows straight out of some edge pixels, one way each, to 1 or 2 px and back, on its own beat
    const len = function (bx, by, di) {
      const hb = S.hash(bx, by, S.add(sd, di)), on = S.and(S.eq(S.mod(S.add(bx, by), 3), 0), S.lt(S.mod(hb, 100), S.div(A, 2)));
      return S.sel(on, S.table([0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0], S.mod(S.add(S.frame, S.div(hb, 100)), 16)), 0);
    };
    // a pixel k out along a thorn's way is its shaft while the thorn is longer than k, its tip when exactly k long
    const shafts = [], tips = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d, di) {
      for (let k = 1; k <= 2; k++) {
        const L = len(S.sub(S.x, d[0] * (k - 1)), S.sub(S.y, d[1] * (k - 1)), di);
        let at = S.and(S.not(S.solid(c)), S.solid(S.tex(-d[0] * k, -d[1] * k)));
        if (k === 2) at = S.and(at, S.not(S.solid(S.tex(-d[0], -d[1]))));
        shafts.push(S.and(at, S.gt(L, k)));
        tips.push(S.and(at, S.eq(L, k)));
      }
    });
    // the edge darkens and lightens slowly, like sap
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), rim = S.and(S.solid(c), shaderPaintRim(S));
    return S.pick([
      [S.or(...tips), S.palAt("ramp", 1)], [S.or(...shafts), S.palAt("ramp", 3)],
      [rim, shaderPaintMix(S, c, S.palAt("ramp", 4), S.div(S.mul(A, S.add(450, S.div(s, 4))), 1000))],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 5))],
    ], c);
  },
};

SHADER_DEFS.berserk = {
  label: "Berserk", title: "rage enchant: the sprite flushing red on a pounding double heartbeat, veins standing out, a red flare round it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["berserk", "rage", "fury", "frenzy", "anger", "bloodlust", "enchant", "heartbeat", "red", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#ffe0c0", "#ff4020", "#c01010", "#600808", "#200000"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Veins" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 921);
    const beat = S.table(SHADER_EX_BEAT, S.mod(S.div(S.mul(S.frame, 16), S.FRAMES), 16));
    // the flush: a steady red, deeper on each thump
    const body = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(S.mul(A, S.add(20, S.div(S.mul(beat, 6), 10))), 100));
    // veins: the middle line of a value noise, bright on the thump
    const vein = S.and(S.solid(c), S.lt(S.abs(S.sub(shaderPaintNoise(S, S.x, S.y, 4, sd), 128)), S.div(A, 10)));
    const flare = S.and(shaderEnchRing1(S), S.lt(shaderEnchDither(S), S.div(S.mul(A, beat), 100)));
    return S.pick([[flare, S.palAt("ramp", 1)], [vein, S.sel(S.gt(beat, 50), S.palAt("ramp", 1), S.palAt("ramp", 3))], [S.solid(c), body]], c);
  },
};

SHADER_DEFS.magnetic = {
  label: "Magnetic", title: "magnetism enchant: the sprite's halves polarized red and blue, rings of iron filings streaming round it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [3, 3, 3, 3], strength: "amount",
  tags: ["magnetic", "magnet", "magnetism", "polarity", "iron", "filings", "enchant", "field", "attract", "science"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 60, label: "Amount (%)" },
    north: { type: "colour", def: "#ff4a3a", label: "North pole (left)" },
    south: { type: "colour", def: "#3a7aff", label: "South pole (right)" },
    filings: { type: "colour", def: "#c8ccd8", label: "Filings" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), k = shaderUiClock(S);
    const pole = S.sel(S.lt(k.X2, 0), S.p("north"), S.p("south"));
    // three rings out from the edge, the filings in each streaming round it, the middle ring the other way
    const sh = S.div(S.mul(S.frame, 30), S.FRAMES), w = S.div(S.mul(A, 12), 100);
    const dash = function (s) { return S.lt(S.mod(S.add(k.a, s), 30), w); };
    const fil = S.and(S.lt(shaderEnchDither(S), S.add(A, 10)),
      S.or(S.and(shaderEnchRing1(S), dash(sh)), S.and(shaderEnchRing2(S), dash(S.neg(sh))), S.and(shaderTxRing3(S), dash(S.mul(sh, 2)))));
    // the halves take their pole's color, stronger at the far edges
    const t = S.div(S.mul(A, S.add(20, S.div(S.mul(S.min(S.abs(k.X2), S.w), 30), S.max(S.w, 1)))), 100);
    return S.pick([[fil, S.p("filings")], [S.solid(c), shaderPaintMix(S, c, pole, t)]], c);
  },
};

SHADER_DEFS.quaking = {
  label: "Quaking", title: "earthquake enchant: the sprite juddering, cracks across it, pebbles crumbling off its underside",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [1, 1, 4, 1], strength: "amount",
  tags: ["quake", "earthquake", "tremor", "earth", "stone", "rumble", "enchant", "shake", "crumble", "geomancer"],
  params: Object.assign(shaderEnchParams(55, ["#e8d8b8", "#b89868", "#806040", "#4a3624", "#1e140c"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cracks" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 931), f = S.mod(S.div(S.mul(S.frame, 16), S.FRAMES), 16);
    // a judder of a pixel on some frames, more of them the stronger it is
    const on = S.and(S.gt(A, 0), S.lt(S.mod(S.hash(f, 9, sd), 100), S.add(A, 20)));
    const jx = S.sel(on, S.table([1, 0, -1, 1, 0, -1, 0, 1, -1, 0, 1, 0, -1, 1, 0, -1], f), 0);
    const jy = S.sel(on, S.table([0, 1, 0, -1, 1, 0, -1, 0, 1, -1, 0, 1, 0, 0, -1, 1], f), 0);
    const src = S.texAt(S.sub(S.x, jx), S.sub(S.y, jy), "clear");
    // cracks ride with it
    const crack = S.and(S.solid(src), S.lt(S.abs(S.sub(shaderPaintNoise(S, S.sub(S.x, jx), S.sub(S.y, jy), 5, sd), 128)), S.div(A, 12)));
    // pebbles: in some columns one falls from the underside, a pixel each two frames, four down
    const h = S.hash(S.x, 2, S.add(sd, 1)), kk = shaderEnchAbove(S, 4);
    const peb = S.and(S.not(S.solid(src)), S.lt(S.mod(h, 100), S.div(A, 3)), S.eq(kk, S.add(1, S.div(S.mod(S.add(S.frame, S.div(h, 100)), 8), 2))));
    return S.pick([[peb, S.palAt("ramp", 2)], [crack, S.palAt("ramp", 4)], [S.solid(src), shaderPaintMix(S, src, S.palAt("ramp", 2), S.div(A, 6))]], S.clear);
  },
};

SHADER_DEFS.mercurial = {
  label: "Quicksilver", title: "quicksilver enchant: the sprite turned to liquid mercury, bright ripples rolling across it, beads hanging under it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 12, pad: [0, 0, 1, 0], strength: "amount",
  tags: ["quicksilver", "mercury", "liquid metal", "silver", "chrome", "fluid", "enchant", "mercurial", "metal", "shapeshift"],
  params: Object.assign(shaderEnchParams(65, ["#ffffff", "#dce4ec", "#a0aab8", "#5c6674", "#20262e"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Beads" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 941);
    const metal = shaderPaintMix(S, c, shaderExRampOf(S, c), A);
    // wavering bands rolling across it, one period of 12 px a loop
    const u = S.add(S.sub(S.x, S.y), S.div(S.mul(shaderMotionSin(S, S.mul(S.y, 60)), 2), 1000));
    const m = S.mod(S.sub(u, S.div(S.mul(S.frame, 12), S.FRAMES)), 12), lit = S.and(S.gt(A, 0), S.solid(c));
    // beads swelling under the underside and dropping back
    const h = S.hash(S.x, 4, sd), ph = S.mod(S.add(S.frame, S.div(h, 100)), 12);
    const bead = S.and(S.not(S.solid(c)), S.solid(S.tex(0, -1)), S.lt(S.mod(h, 100), S.div(A, 3)), S.ge(ph, 4), S.lt(ph, 10));
    return S.pick([[bead, S.palAt("ramp", 2)], [S.and(lit, S.lt(m, 2)), S.palAt("ramp", 0)], [S.and(lit, S.eq(m, 2)), shaderPaintMix(S, metal, S.palAt("ramp", 1), 60)], [S.solid(c), metal]], c);
  },
};

SHADER_DEFS.amberlocked = {
  label: "Amber", title: "amber enchant: the sprite sealed in warm amber, bubbles rising slowly through it, a gloss sweeping over, a shell round it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 8, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["amber", "resin", "fossil", "sealed", "encased", "preserved", "enchant", "honey", "trapped", "stasis"],
  params: Object.assign(shaderEnchParams(60, ["#fff4c0", "#ffc840", "#e08a10", "#9a4c08", "#4a2004"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Bubbles" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 951);
    const warm = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(S.mul(A, 55), 100));
    // bubbles in 4 px cells rising 16 px a loop (the cells repeat every 4 down, so the loop closes)
    const yy = S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), fx = S.mod(S.x, 4), fy = S.mod(yy, 4);
    const act = S.lt(S.mod(S.hash(S.div(S.x, 4), S.mod(S.div(yy, 4), 4), sd), 100), S.div(A, 3));
    const bub = S.and(S.solid(c), act, S.eq(fy, 1), S.ge(fx, 1), S.le(fx, 2));
    // a gloss crossing it on the diagonal once a loop
    const pos = S.sub(S.div(S.mul(S.frame, S.add(S.add(S.w, S.h), 6)), S.FRAMES), 3), u = S.add(S.x, S.y);
    const gloss = S.and(S.gt(A, 0), S.solid(c), S.ge(u, pos), S.le(u, S.add(pos, 1)));
    const shell = S.and(shaderEnchRing1(S), S.lt(shaderEnchDither(S), A));
    return S.pick([[shell, S.palAt("ramp", 3)], [bub, S.sel(S.eq(fx, 1), S.palAt("ramp", 0), S.palAt("ramp", 1))], [gloss, shaderPaintMix(S, warm, S.palAt("ramp", 0), 65)], [S.solid(c), warm]], c);
  },
};

SHADER_DEFS.fungal = {
  label: "Fungal", title: "spore enchant: little mushrooms sprouting along the sprite's top edges and puffing spores, mold spots on it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 6, pad: [3, 1, 0, 1], strength: "amount",
  tags: ["fungal", "mushroom", "spores", "mold", "fungus", "myconid", "enchant", "sprout", "damp", "druid"],
  params: Object.assign(shaderEnchParams(60, ["#fff0e0", "#e85030", "#f0e0c0", "#6a8a40", "#2a3a1a"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Mushrooms" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 961);
    // one mushroom place every 4 columns (its stem in the second); it sprouts, stands, and is gone, on its own beat
    const fx = S.mod(S.x, 4), xc = S.add(S.mul(S.div(S.x, 4), 4), 1), h = S.hash(S.div(S.x, 4), 6, sd);
    const ph = S.mod(S.add(S.frame, S.div(h, 100)), 16), has = S.and(S.lt(S.mod(h, 100), A), S.le(fx, 2), S.not(S.solid(c)));
    const at = function (dy) { return S.solid(S.texAt(xc, S.add(S.y, dy), "clear")); };
    const stem = S.and(has, S.eq(fx, 1), at(1), S.ge(ph, 3));
    const cap = S.and(has, S.not(at(1)), at(2), S.ge(ph, 5));
    const spore = S.and(has, S.eq(fx, 1), S.not(at(1)), S.not(at(2)), at(3), S.or(S.eq(ph, 9), S.eq(ph, 10), S.eq(ph, 13)));
    // damp: the body breathing toward the moss, mold spots on it
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES));
    const mold = S.and(S.solid(c), S.gt(shaderPaintNoise(S, S.x, S.y, 3, S.add(sd, 1)), S.sub(255, S.div(A, 2))));
    return S.pick([
      [spore, S.palAt("ramp", 0)], [S.and(stem, S.lt(ph, 5)), S.palAt("ramp", 1)], [stem, S.palAt("ramp", 2)],
      [cap, S.sel(S.eq(fx, 1), S.palAt("ramp", 0), S.palAt("ramp", 1))],
      [mold, S.palAt("ramp", 3)], [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(S.mul(A, S.add(200, S.div(s, 10))), 1000))],
    ], c);
  },
};

SHADER_DEFS.hexed = {
  label: "Hexed", title: "curse enchant: three violet sigils circling the sprite, the sprite flickering into cursed shades",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 12, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["hexed", "hex", "curse", "cursed", "witch", "sigil", "enchant", "jinx", "violet", "debuff"],
  params: Object.assign(shaderEnchParams(60, ["#f0d0ff", "#c060ff", "#7020c0", "#3a0a6a", "#12021e"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Flicker" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 971), k = shaderUiClock(S);
    // three sigils a third of a turn apart, turning a third of a turn a loop
    const m = S.mod(S.sub(k.a, S.div(S.mul(S.frame, 120), S.FRAMES)), 120), wd = S.div(S.mul(A, 16), 100);
    const sig = S.lt(m, wd), mid = S.lt(S.abs(S.sub(S.mul(m, 2), wd)), 4);
    // the flicker: on some frames the whole sprite drops into the curse's own shades
    const fl = S.and(S.gt(A, 0), S.eq(S.mod(S.hash(S.frame, 5, sd), 5), 0));
    const body = S.sel(fl, shaderPaintMix(S, c, shaderExRampOf(S, c), A), shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 4)));
    return S.pick([
      [S.and(sig, shaderEnchRing2(S)), S.sel(mid, S.palAt("ramp", 0), S.palAt("ramp", 1))],
      [S.and(sig, shaderEnchRing1(S)), S.palAt("ramp", 2)],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.phased = {
  label: "Phased", title: "phasing enchant: the sprite half out of this world, its rows wavering sideways, pixels winking out through a dither",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 2, 0, 2], strength: "amount",
  tags: ["phased", "phasing", "ethereal", "blink", "intangible", "astral", "enchant", "shimmer", "dimension", "evasion"],
  params: Object.assign(shaderEnchParams(55, ["#ffffff", "#c8f0ff", "#80c0ff", "#4060c0", "#101a40"]), {
    waves: { type: "int", min: 1, max: 4, def: 2, label: "Waves up the sprite" },
  }),
  fragment: function (S) {
    const A = S.p("amount"), amp = S.div(S.mul(A, 2), 100);
    // each row slides on a wave travelling up it, one whole turn a loop
    const deg = S.add(S.div(S.mul(S.mul(S.y, 360), S.p("waves")), S.max(S.h, 1)), S.div(S.mul(S.frame, 360), S.FRAMES));
    const dx = S.div(S.add(S.mul(shaderMotionSin(S, deg), amp), 500), 1000);
    const src = S.texAt(S.sub(S.x, dx), S.y, "clear");
    // a 4 x 4 dither winking pixels out, stepping a column a frame (four steps, so 16 frames close)
    const gone = S.lt(shaderEnchDither(S, S.frame), S.div(A, 3));
    const out = shaderPaintMix(S, src, shaderExRampOf(S, src), S.div(A, 2));
    return S.sel(S.and(S.solid(src), S.not(gone)), out, S.clear);
  },
};

SHADER_DEFS.lucky = {
  label: "Lucky", title: "fortune enchant: gold and white twinkles winking round the sprite, four-leaf clovers on it, glints along its edge",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [3, 3, 3, 3], strength: "amount",
  tags: ["lucky", "luck", "fortune", "clover", "shamrock", "charm", "enchant", "gold", "twinkle", "buff"],
  params: Object.assign(shaderEnchParams(55, ["#fffbe0", "#ffd84a", "#5ad85a", "#228a3a", "#0a3a16"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Twinkles" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 981);
    // twinkle centers: clear pixels near the sprite on a sparse lattice; each lives 4 frames of 8, its arms 2
    const life = function (ox, oy) {
      const X = S.add(S.x, ox), Y = S.add(S.y, oy), h = S.hash(X, Y, sd);
      const on = S.and(shaderExNear2(S, ox, oy), S.eq(S.mod(S.add(X, S.mul(Y, 2)), 5), 0), S.lt(S.mod(h, 100), S.div(A, 2)));
      return S.sel(on, S.mod(S.add(S.frame, S.div(h, 100)), 8), 99);
    };
    const ctr = S.lt(life(0, 0), 4);
    const armOf = function (ph) { return S.and(S.ge(ph, 1), S.le(ph, 2)); };
    const arm = S.and(S.not(S.solid(c)), S.or(armOf(life(1, 0)), armOf(life(-1, 0)), armOf(life(0, 1)), armOf(life(0, -1))));
    // clovers: four leaves round a stem in some 6 px cells
    const fx = S.mod(S.x, 6), fy = S.mod(S.y, 6), act = S.lt(S.mod(S.hash(S.div(S.x, 6), S.div(S.y, 6), S.add(sd, 1)), 100), S.div(A, 3));
    const ddx = S.abs(S.sub(fx, 3)), ddy = S.abs(S.sub(fy, 3));
    const leaf = S.and(S.solid(c), act, S.eq(S.add(ddx, ddy), 1)), stem = S.and(S.solid(c), act, S.eq(ddx, 0), S.eq(ddy, 0));
    const glint = S.and(S.gt(A, 0), S.solid(c), shaderPaintRim(S), S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 2)), S.frame), 8), 0));
    return S.pick([
      [ctr, S.palAt("ramp", 0)], [arm, S.palAt("ramp", 1)], [glint, S.palAt("ramp", 1)],
      [leaf, S.palAt("ramp", 2)], [stem, S.palAt("ramp", 3)],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(A, 8))],
    ], c);
  },
};

SHADER_DEFS.gravitic = {
  label: "Gravitic", title: "gravity enchant: dark rings closing in on the sprite's heart, its middle sinking into shadow, dust circling it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["gravity", "gravitic", "singularity", "heavy", "black hole", "pull", "enchant", "cosmic", "weight", "debuff"],
  params: Object.assign(shaderEnchParams(60, ["#e8e0ff", "#9a80ff", "#5a3ad0", "#2a1870", "#08041a"]), {
    spacing: { type: "int", min: 3, max: 12, def: 5, label: "Ring spacing (px)" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), k = shaderUiClock(S), sp2 = S.mul(S.p("spacing"), 2);
    // rings moving in one spacing a loop (the sonic rings, backward)
    const ring = S.and(S.gt(A, 0), S.lt(S.mod(S.add(k.d2, S.div(S.mul(S.frame, sp2), S.FRAMES)), sp2), 2));
    // the middle sinks: darker toward the center, out to a third of the sprite
    const R = S.max(S.div(S.add(S.w, S.h), 3), 1), deep = S.div(S.mul(S.max(S.sub(R, k.d2), 0), S.div(S.mul(A, 7), 10)), R);
    const body = shaderPaintMix(S, shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 6)), S.palAt("ramp", 4), deep);
    const dust = S.and(shaderEnchRing1(S), S.lt(S.mod(S.add(k.a, S.div(S.mul(S.frame, 45), S.FRAMES)), 45), S.div(S.mul(A, 10), 100)));
    return S.pick([[dust, S.palAt("ramp", 1)], [S.and(ring, S.solid(c)), shaderPaintMix(S, body, S.palAt("ramp", 2), S.div(S.mul(A, 7), 10))], [S.solid(c), body]], c);
  },
};

SHADER_DEFS.obsidian = {
  label: "Obsidian", title: "obsidian enchant: the sprite turned to faceted black volcanic glass, a glint running along the facet edges",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["obsidian", "glass", "volcanic", "black", "faceted", "dragonglass", "enchant", "gem", "sharp", "stone"],
  params: Object.assign(shaderEnchParams(65, ["#ffffff", "#b8a8d8", "#504868", "#221e2c", "#0a080e"]), {
    facet: { type: "int", min: 3, max: 8, def: 4, label: "Facet size (px)" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Facets" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), F = S.p("facet"), sd = S.add(S.mul(S.p("seed"), 4), 991);
    // square cells cut on the diagonal; each half its own dark shade, the brighter the passage the lighter
    const fx = S.mod(S.x, F), fy = S.mod(S.y, F), tri = S.sel(S.gt(fx, fy), 1, 0);
    const h = S.hash(S.div(S.x, F), S.add(S.mul(S.div(S.y, F), 2), tri), sd);
    const glass = S.palAt("ramp", S.clamp(S.sub(S.sub(4, S.mod(h, 2)), S.div(S.luma(c), 128)), 2, 4));
    const edge = S.or(S.eq(fx, 0), S.eq(fy, 0), S.eq(fx, fy));
    const glint = S.and(S.gt(A, 0), edge, S.lt(S.mod(S.sub(S.add(S.x, S.y), S.div(S.mul(S.frame, 16), S.FRAMES)), 16), 2));
    const body = shaderPaintMix(S, c, S.sel(edge, S.palAt("ramp", 2), glass), A);
    return S.pick([[S.not(S.solid(c)), c], [glint, S.palAt("ramp", 0)]], body);
  },
};

SHADER_DEFS.borealis = {
  label: "Borealis", title: "aurora enchant: the sprite dimmed to night, curtains of green, teal and violet light rippling down through it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 10, pad: [1, 0, 0, 0], strength: "amount",
  tags: ["aurora", "borealis", "northern lights", "night", "sky", "curtain", "enchant", "polar", "shimmer", "celestial"],
  params: Object.assign(shaderEnchParams(60, ["#e0fff0", "#40ff9a", "#20c8d0", "#a050ff", "#0a1030"]), {
    spacing: { type: "int", min: 4, max: 12, def: 6, label: "Curtain spacing (px)" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), P = S.p("spacing");
    // folds that sway with height, a whole turn a loop, and drift one spacing a loop
    const u = S.add(S.x, S.div(S.mul(shaderMotionSin(S, S.add(S.mul(S.y, 24), S.div(S.mul(S.frame, 360), S.FRAMES))), 2), 1000));
    const at = S.mod(S.add(u, S.div(S.mul(S.frame, P), S.FRAMES)), P), rib = S.lt(at, 2);
    const hue = S.palAt("ramp", S.add(1, S.mod(S.div(S.y, 3), 3)));
    const body = shaderPaintMix(S, c, S.palAt("ramp", 4), S.div(A, 3));
    // the light spills a pixel above the top edges
    const spill = S.and(rib, shaderEnchRing1(S), S.solid(S.tex(0, 1)), S.lt(shaderEnchDither(S, S.frame), S.div(A, 2)));
    return S.pick([
      [spill, S.palAt("ramp", 1)],
      [S.and(S.solid(c), rib, S.gt(A, 0)), shaderPaintMix(S, body, S.sel(S.eq(at, 0), S.palAt("ramp", 0), hue), S.div(S.mul(A, 7), 10))],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.miasma = {
  label: "Miasma", title: "plague enchant: a sickly fog curling round the sprite, flies circling it, the color gone to rot",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["miasma", "plague", "flies", "stench", "disease", "swamp", "enchant", "rot", "pestilence", "debuff"],
  params: Object.assign(shaderEnchParams(55, ["#e8f0c0", "#a8c050", "#6a8a30", "#3a4a20", "#101408"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Fog" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1001), k = shaderUiClock(S);
    const r1 = shaderEnchRing1(S), r2 = shaderEnchRing2(S);
    // the fog: a value noise rising a pixel a frame, repeating every 16 px, so the loop closes
    const fog = S.and(S.or(r1, r2), S.gt(shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, sd, 16), S.sub(255, S.div(S.mul(A, 13), 10))));
    // three flies on the outer ring, one more for each third of the amount, the middle one the other way, buzzing
    const flies = [0, 1, 2].map(function (i) {
      const turn = S.div(S.mul(S.frame, 360), S.FRAMES), jit = S.sub(S.mod(S.hash(S.frame, i, sd), 21), 10);
      const fa = S.add(S.add(i * 120, i === 1 ? S.neg(turn) : turn), jit);
      return S.and(S.gt(A, i * 33), r2, S.lt(S.mod(S.sub(k.a, fa), 360), 10));
    });
    const fly = S.or(...flies);
    return S.pick([[fly, S.palAt("ramp", 4)], [fog, S.sel(r1, S.palAt("ramp", 2), S.palAt("ramp", 1))], [S.solid(c), shaderPaintMix(S, c, shaderExRampOf(S, c), S.div(A, 3))]], c);
  },
};

SHADER_DEFS.vampiric.variants = [{ amount: 100, seed: 2 }, { amount: 25, ramp: ["#e0e0ff", "#8080ff", "#4040c0", "#20206a", "#080820"] }];
SHADER_DEFS.thorned.variants = [{ amount: 100 }, { amount: 30, seed: 5 }];
SHADER_DEFS.berserk.variants = [{ amount: 100, seed: 3 }, { amount: 25 }];
SHADER_DEFS.magnetic.variants = [{ amount: 100 }, { amount: 30, north: "#ffd84a", south: "#a050ff", filings: "#ffffff" }];
SHADER_DEFS.quaking.variants = [{ amount: 100 }, { amount: 20, seed: 6 }];
SHADER_DEFS.mercurial.variants = [{ amount: 100 }, { amount: 30, seed: 4, ramp: ["#fffbe0", "#ffe08a", "#d0a040", "#806020", "#302008"] }];
SHADER_DEFS.amberlocked.variants = [{ amount: 100, seed: 3 }, { amount: 25 }];
SHADER_DEFS.fungal.variants = [{ amount: 100 }, { amount: 35, seed: 7, ramp: ["#e8f8ff", "#40a0ff", "#d0e8ff", "#5a6a8a", "#1a2030"] }];
SHADER_DEFS.hexed.variants = [{ amount: 100 }, { amount: 30, seed: 2, ramp: ["#e0ffe0", "#60ff60", "#20a030", "#0a5010", "#021a04"] }];
SHADER_DEFS.phased.variants = [{ amount: 100, waves: 4 }, { amount: 25, waves: 1 }];
SHADER_DEFS.lucky.variants = [{ amount: 100, seed: 1 }, { amount: 25 }];
SHADER_DEFS.gravitic.variants = [{ amount: 100, spacing: 3 }, { amount: 30, spacing: 12 }];
SHADER_DEFS.obsidian.variants = [{ amount: 100, facet: 3 }, { amount: 40, facet: 8, seed: 5, ramp: ["#ffffff", "#ffb090", "#803020", "#301010", "#100404"] }];
SHADER_DEFS.borealis.variants = [{ amount: 100, spacing: 4 }, { amount: 30, spacing: 12, ramp: ["#fff0f8", "#ff60c0", "#ffa040", "#40ffb0", "#100820"] }];
SHADER_DEFS.miasma.variants = [{ amount: 100, seed: 3 }, { amount: 30 }];

// ---- Live enchants, round four: rain, embers, souls, rune rings, echoes, eyes, scales, gems, armor, plasma ----
// ======================================================================================================================
// Fifteen more LIVE enchants in the mold of §5.10-§5.11 and §5.37: each takes the whole sprite, has an `amount` (0 is
// the plain sprite) a game can drive live as its strength, and a ramp, light to dark (`jeweled` takes its gems as a
// palette and its setting as a color). raincloud, smoldering, soulbound, runering, echoing, eldritch, dragonscale,
// luminous, feathered, honeyed, sandblasted, jeweled, fractured, ironclad and plasmatic. None draws more than 6 px from
// the sprite.
// Private helpers shaderEv*; the shaderEx*, shaderEnch*, shaderPaint*, shaderMotion*, shaderUi* and shaderTx* helpers are reused.
// ======================================================================================================================

SHADER_EFFECTS.push("raincloud", "smoldering", "soulbound", "runering", "echoing", "eldritch", "dragonscale", "luminous",
  "feathered", "honeyed", "sandblasted", "jeweled", "fractured", "ironclad", "plasmatic");

// the first clear pixel straight above within K (its distance), or 99: how deep a solid pixel lies below its top edge
function shaderEvClearAbove(S, K) {
  let k = S.i(99);
  for (let i = K; i >= 1; i--) k = S.sel(S.solid(S.tex(0, -i)), k, i);
  return k;
}
// solid or not, within 3 px (Chebyshev) of the sprite
function shaderEvNear3(S) {
  const t = [];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) t.push(S.solid(S.tex(i, j)));
  return S.or(...t);
}

SHADER_DEFS.raincloud = {
  label: "Rain cloud", title: "storm enchant: a little rain cloud hanging over the sprite, drifting, rain falling from it and splashing on top",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [6, 0, 0, 0], strength: "amount",
  tags: ["rain cloud", "raincloud", "storm", "rain", "gloomy", "sad", "enchant", "weather", "drizzle", "debuff"],
  params: Object.assign(shaderEnchParams(55, ["#e8f0ff", "#9ab0d0", "#5a6a88", "#343c50", "#14181f"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Rain" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1101), on = S.gt(A, 0), clear = S.not(S.solid(c));
    // the cloud: 5 and 6 px above the top edge in every column, a lumpy fringe under it, drifting 16 px a loop
    const kb = shaderEnchBelow(S, 6), n = shaderEnchFlow(S, S.mul(kb, 5), S.add(S.x, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, sd, 16);
    const cloud = S.and(on, clear, S.or(S.eq(kb, 5), S.eq(kb, 6), S.and(S.eq(kb, 4), S.gt(n, S.sub(230, A)))));
    // drops fall from it in some columns, a pixel a frame, and splash on the top edge
    const h = S.hash(S.x, 7, sd), has = S.and(on, S.lt(S.mod(h, 100), A)), ph = S.mod(S.add(S.frame, S.div(h, 100)), 8);
    const drop = S.and(has, clear, S.lt(ph, 4), S.eq(kb, S.sub(4, ph)));
    const splash = S.and(has, S.eq(ph, 4), S.solid(c), S.not(S.solid(S.tex(0, -1))));
    return S.pick([
      [cloud, S.pick([[S.eq(kb, 4), S.palAt("ramp", 3)], [S.and(S.eq(kb, 6), S.gt(n, 128)), S.palAt("ramp", 1)]], S.palAt("ramp", 2))],
      [drop, S.palAt("ramp", 1)], [splash, S.palAt("ramp", 0)],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 4))],
    ], c);
  },
};

SHADER_DEFS.smoldering = {
  label: "Smoldering", title: "ember enchant: the sprite charred dark, embers glowing and fading in its cracks, sparks and smoke rising off it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [4, 0, 0, 0], strength: "amount",
  tags: ["smoldering", "embers", "charred", "cinders", "burnt", "ash", "enchant", "fire", "smoke", "heat"],
  params: Object.assign(shaderEnchParams(55, ["#fff0a0", "#ff8a20", "#d03a08", "#4a3a34", "#141010"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cracks" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1111), on = S.gt(A, 0), clear = S.not(S.solid(c));
    // cracks: the middle line of a noise, wider with the amount; each 3 px patch of them glows on its own beat
    const crack = S.and(on, S.solid(c), S.lt(S.abs(S.sub(shaderPaintNoise(S, S.x, S.y, 4, sd), 128)), S.add(1, S.div(A, 12))));
    const s = shaderMotionSin(S, S.add(S.div(S.mul(S.frame, 360), S.FRAMES), S.mul(S.mod(S.hash(S.div(S.x, 3), S.div(S.y, 3), S.add(sd, 1)), 8), 45)));
    const ember = S.sel(S.gt(s, 400), S.palAt("ramp", 0), S.sel(S.gt(s, -300), S.palAt("ramp", 1), S.palAt("ramp", 2)));
    // sparks rising up to 4 px off the top edge, cooling as they go; smoke drifting up round them
    const kb = shaderEnchBelow(S, 4), h = S.hash(S.x, 8, S.add(sd, 2)), ph = S.mod(S.add(S.frame, S.div(h, 100)), 8);
    const spark = S.and(clear, S.lt(S.mod(h, 100), S.div(A, 3)), S.eq(kb, S.add(1, S.div(ph, 2))));
    const smoke = S.and(on, clear, S.le(kb, 4), S.lt(shaderEnchDither(S), 50),
      S.gt(shaderEnchFlow(S, S.x, S.add(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), 4, S.add(sd, 3), 16), S.sub(255, S.div(A, 2))));
    const rim = S.and(S.solid(c), shaderPaintRim(S));
    return S.pick([
      [spark, S.sel(S.lt(ph, 4), S.palAt("ramp", 1), S.palAt("ramp", 2))], [smoke, S.palAt("ramp", 3)],
      [crack, ember], [rim, shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(S.mul(A, 7), 10))],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 4), S.div(S.mul(A, 6), 10))],
    ], c);
  },
};

SHADER_DEFS.soulbound = {
  label: "Soulbound", title: "soul enchant: two strands of pale soul-wisps spiraling up round the sprite, passing in front of it and behind",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 10, pad: [2, 2, 2, 2], strength: "amount",
  tags: ["soulbound", "souls", "spirit", "wisps", "spiral", "ghostly", "enchant", "necromancy", "bound", "helix"],
  params: Object.assign(shaderEnchParams(60, ["#f0ffff", "#a8e8ff", "#60a8e0", "#30508a", "#0c1430"]), {
    turns: { type: "int", min: 1, max: 4, def: 2, label: "Turns up the sprite" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), k = shaderUiClock(S), R = S.max(S.sub(S.w, 4), 2);
    // a helix: at each height a strand sits at R sin(phase) across, in front while cos(phase) > 0; it turns a whole
    // turn a loop, so the wisps climb
    const deg = S.add(S.div(S.mul(S.mul(S.y, 360), S.p("turns")), S.max(S.h, 1)), S.div(S.mul(S.frame, 360), S.FRAMES));
    const seg = S.lt(S.mod(S.add(S.y, S.div(S.mul(S.frame, 12), S.FRAMES)), 6), S.div(S.mul(A, 6), 100));
    const near = S.or(S.solid(c), shaderExNear2(S, 0, 0));
    const front = [], back = [];
    [0, 180].forEach(function (o) {
      const d = S.add(deg, o), hit = S.and(seg, near, S.le(S.abs(S.sub(k.X2, S.div(S.mul(shaderMotionSin(S, d), R), 1000))), 2));
      const fr = S.gt(shaderMotionCos(S, d), 0);
      front.push(S.and(hit, fr)); back.push(S.and(hit, S.not(fr), S.not(S.solid(c))));
    });
    return S.pick([[S.or(...front), S.palAt("ramp", 0)], [S.or(...back), S.palAt("ramp", 2)], [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 3), S.div(A, 5))]], c);
  },
};

SHADER_DEFS.runering = {
  label: "Rune ring", title: "ward enchant: a flat ring of glowing runes orbiting the sprite's middle, in front below and behind above",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 10, pad: [3, 3, 3, 3], strength: "amount",
  tags: ["rune ring", "ward", "orbit", "runes", "halo", "protection", "enchant", "magic circle", "spell", "buff"],
  params: Object.assign(shaderEnchParams(60, ["#fffce0", "#ffe070", "#e0a020", "#805010", "#302004"]), {
    tilt: { type: "int", min: 2, max: 6, def: 3, label: "Flatness (width / height)" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), k = shaderUiClock(S), T = S.p("tilt");
    // an ellipse round the middle (half pixels): at each x its rim lies at y = +-Ry sqrt(1 - x^2 / Rx^2)
    const Rx = S.max(S.sub(S.w, 4), 4), Ry = S.max(S.div(Rx, T), 2), ax = S.abs(k.X2);
    const q = S.max(S.sub(10000, S.div(S.mul(S.mul(k.X2, k.X2), 10000), S.mul(Rx, Rx))), 0);
    const yE = S.div(S.mul(Ry, shaderPaintSqrt(S, q)), 100), tol = S.add(1, S.sel(S.gt(S.mul(ax, 4), S.mul(Rx, 3)), 2, 0));
    const ring = S.and(S.gt(A, 0), S.lt(ax, Rx), shaderEvNear3(S));
    const front = S.and(ring, S.le(S.abs(S.sub(k.Y2, yE)), tol)), back = S.and(ring, S.le(S.abs(S.add(k.Y2, yE)), tol), S.not(S.solid(c)));
    // runes: bright dashes round it, a ninth of a turn apart, turning a ninth of a turn a loop
    const th = shaderMotionAtan(S, k.X2, S.mul(k.Y2, T));
    const rune = S.lt(S.mod(S.add(th, S.div(S.mul(S.frame, 40), S.FRAMES)), 40), S.div(S.mul(A, 24), 100));
    return S.pick([
      [front, S.sel(rune, S.palAt("ramp", 0), S.palAt("ramp", 2))], [back, S.sel(rune, S.palAt("ramp", 1), S.palAt("ramp", 3))],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 8))],
    ], c);
  },
};

SHADER_DEFS.echoing = {
  label: "Echoing", title: "echo enchant: copies of the sprite's outline rippling out from it, one ring after another, fading as they go",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [3, 3, 3, 3], strength: "amount",
  tags: ["echo", "echoing", "resonance", "outline", "ripple", "pulse", "enchant", "sound", "psychic", "buff"],
  params: shaderEnchParams(60, ["#ffffff", "#b8f0ff", "#60c0f0", "#2a70b0", "#0a2040"]),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), rim = S.and(S.solid(c), shaderPaintRim(S));
    // which ring this is: 0 the sprite's own edge, 1-3 out from it
    const ri = S.pick([[rim, 0], [shaderEnchRing1(S), 1], [shaderEnchRing2(S), 2], [shaderTxRing3(S), 3]], 9);
    // a wave steps out a ring every 2 frames, a dimmer one a ring behind it, then a rest: 16 frames a loop
    const wv = S.div(S.mod(S.frame, 16), 2), lead = S.eq(ri, wv), trail = S.eq(ri, S.sub(wv, 1));
    const show = S.lt(shaderEnchDither(S), S.sub(A, S.mul(ri, 10)));
    return S.pick([
      [S.and(rim, lead, S.gt(A, 0)), shaderPaintMix(S, c, S.palAt("ramp", 0), A)],
      [S.and(rim, trail, S.gt(A, 0)), shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(A, 2))],
      [S.and(S.not(S.solid(c)), lead, show), S.palAt("ramp", ri)],
      [S.and(S.not(S.solid(c)), trail, show), S.palAt("ramp", S.add(ri, 1))],
      [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 6))],
    ], c);
  },
};

SHADER_DEFS.eldritch = {
  label: "Eldritch", title: "eldritch enchant: eyes opening all over the sprite, blinking and glancing about, its color gone strange",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["eldritch", "eyes", "horror", "cosmic horror", "madness", "watching", "enchant", "creepy", "curse", "aberration"],
  params: Object.assign(shaderEnchParams(50, ["#fff8f0", "#d05aff", "#5a2a8a", "#2a0a40", "#08000c"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Eyes" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1121);
    // an eye 3 x 2 in some 6 x 5 cells: shut 2 frames in 16, the pupil glancing left, ahead and right
    const fx = S.mod(S.x, 6), fy = S.mod(S.y, 5), h = S.hash(S.div(S.x, 6), S.div(S.y, 5), sd);
    const eye = S.and(S.solid(c), S.lt(S.mod(h, 100), S.div(A, 2)), S.ge(fx, 1), S.le(fx, 3), S.ge(fy, 1), S.le(fy, 2));
    const ph = S.mod(S.add(S.frame, S.div(h, 100)), 16), shut = S.lt(ph, 2);
    const look = S.table([0, 1, 0, -1], S.mod(S.div(S.add(S.frame, S.div(h, 7)), 4), 4)), pupil = S.eq(fx, S.add(2, look));
    // the body tinted, its edge throbbing slowly
    const s = shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES)), body = shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 4));
    const rim = S.and(S.solid(c), shaderPaintRim(S));
    return S.pick([
      [S.and(eye, shut, S.eq(fy, 2)), S.palAt("ramp", 3)], [S.and(eye, shut), body],
      [S.and(eye, pupil), S.palAt("ramp", 4)], [eye, S.palAt("ramp", 0)],
      [rim, shaderPaintMix(S, body, S.palAt("ramp", 1), S.div(S.mul(A, S.add(400, S.div(s, 3))), 1000))],
      [S.solid(c), body],
    ], c);
  },
};

SHADER_DEFS.dragonscale = {
  label: "Dragonscale", title: "dragon enchant: the sprite covered in overlapping scales in the ramp's colors, a sheen rippling across them",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["dragon", "dragonscale", "scales", "reptile", "armor", "wyrm", "enchant", "scaly", "serpent", "defense"],
  params: Object.assign(shaderEnchParams(65, ["#f0ffd0", "#a8e050", "#48a040", "#1e5a30", "#08200f"]), {
    size: { type: "int", min: 3, max: 8, def: 4, label: "Scale width (px)" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), W = S.p("size"), H = S.max(S.sub(W, 1), 2);
    // rows of scales, every other row half a scale over; each scale a U: dark along its bottom and up its sides
    const row = S.div(S.y, H), fx = S.mod(S.add(S.x, S.mul(S.mod(row, 2), S.div(W, 2))), W), fy = S.mod(S.y, H);
    const edge = S.or(S.eq(fy, S.sub(H, 1)), S.and(S.eq(fy, S.sub(H, 2)), S.or(S.eq(fx, 0), S.eq(fx, S.sub(W, 1)))));
    const top = S.and(S.eq(fy, 0), S.gt(fx, 0), S.lt(fx, S.sub(W, 1)));
    const sheen = S.and(S.gt(A, 0), S.lt(S.mod(S.sub(S.add(S.x, S.mul(S.y, 2)), S.div(S.mul(S.frame, 24), S.FRAMES)), 24), 4));
    const base = shaderPaintMix(S, c, shaderExRampOf(S, c), S.div(S.mul(A, 6), 10)), t = S.div(S.mul(A, 6), 10);
    return S.pick([
      [S.not(S.solid(c)), c], [edge, shaderPaintMix(S, base, S.palAt("ramp", 4), t)],
      [sheen, shaderPaintMix(S, base, S.palAt("ramp", 0), t)], [top, shaderPaintMix(S, base, S.palAt("ramp", 1), S.div(S.mul(A, 4), 10))],
    ], base);
  },
};

SHADER_DEFS.luminous = {
  label: "Bioluminescent", title: "deep-sea enchant: the sprite gone dark, glowing spots on it lighting up in waves that climb it, a cold halo",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 10, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["bioluminescent", "glow", "deep sea", "jellyfish", "abyss", "luminous", "enchant", "neon", "ocean", "spots"],
  params: Object.assign(shaderEnchParams(60, ["#e0fffc", "#60fff0", "#20a0e0", "#103a6a", "#020814"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Spots" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1131);
    const dark = shaderPaintMix(S, c, S.palAt("ramp", 4), S.div(S.mul(A, 6), 10));
    // a wave of light 12 px long climbing a whole wave a loop
    const wave = shaderMotionSin(S, S.add(S.mul(S.y, 30), S.div(S.mul(S.frame, 360), S.FRAMES)));
    const spot = S.and(S.gt(A, 0), S.solid(c), S.gt(shaderPaintNoise(S, S.x, S.y, 3, sd), S.sub(255, S.div(A, 2))));
    const lit = S.palAt("ramp", S.sel(S.gt(wave, 500), 0, S.sel(S.gt(wave, -200), 1, 2)));
    const halo = S.and(shaderEnchRing1(S), S.gt(wave, 300), S.lt(shaderEnchDither(S), A));
    const rim = S.and(S.solid(c), shaderPaintRim(S), S.gt(wave, 0));
    return S.pick([[halo, S.palAt("ramp", 2)], [spot, lit], [rim, shaderPaintMix(S, dark, S.palAt("ramp", 2), S.div(A, 2))], [S.solid(c), dark]], c);
  },
};

SHADER_DEFS.feathered = {
  label: "Feathered", title: "feather enchant: soft white feathers drifting down past and over the sprite, swaying, a faint glow round it",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [3, 3, 3, 3], strength: "amount",
  tags: ["feathers", "feathered", "angelic", "wings", "light", "featherfall", "enchant", "holy", "dove", "slowfall"],
  params: Object.assign(shaderEnchParams(55, ["#ffffff", "#f0f0ff", "#d8d0f0", "#a098c0", "#504870"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Feathers" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1141);
    // feathers in some 6 x 8 cells falling 16 px a loop (the cells repeat every 2 down) and swaying a pixel each way
    const ox = S.table([0, 1, 1, 0, 0, -1, -1, 0], S.mod(S.div(S.frame, 2), 8)), X = S.sub(S.x, ox);
    const yy = S.sub(S.y, S.div(S.mul(S.frame, 16), S.FRAMES)), fx = S.mod(X, 6), fy = S.mod(yy, 8);
    const act = S.and(shaderEvNear3(S), S.lt(S.mod(S.hash(S.div(X, 6), S.mod(S.div(yy, 8), 2), sd), 100), S.div(A, 2)));
    const vane = S.and(act, S.or(S.and(S.eq(fx, 2), S.ge(fy, 1), S.le(fy, 3)), S.and(S.eq(fx, 3), S.ge(fy, 2), S.le(fy, 3))));
    const quill = S.and(act, S.eq(fx, 3), S.eq(fy, 4));
    const glow = S.and(shaderEnchRing1(S), S.lt(shaderEnchDither(S, S.div(S.frame, 4)), S.div(A, 2)));
    return S.pick([
      [quill, S.palAt("ramp", 3)], [vane, S.sel(S.eq(fx, 2), S.palAt("ramp", 0), S.palAt("ramp", 2))],
      [glow, S.palAt("ramp", 1)], [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 0), S.div(A, 6))],
    ], c);
  },
};

SHADER_DEFS.honeyed = {
  label: "Honeyed", title: "honey enchant: golden honey coating the sprite's top edges and oozing down it in glossy runs, dripping off",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 8, pad: [0, 0, 2, 0], strength: "amount",
  tags: ["honey", "honeyed", "sticky", "syrup", "sweet", "goo", "enchant", "slow", "drip", "debuff"],
  params: Object.assign(shaderEnchParams(55, ["#fff8d0", "#ffd860", "#f0a818", "#b06a08", "#4a2a04"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Runs" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1151);
    // in some 2 px streams, a run creeps down from the top edge up to 6 px, then thins back
    const h = S.hash(S.div(S.x, 2), 11, sd), act = S.lt(S.mod(h, 100), A), ph = S.mod(S.add(S.frame, S.div(h, 100)), 16);
    const L = S.table([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 3, 2], ph), d = shaderEvClearAbove(S, 7);
    const coat = S.and(S.gt(A, 0), S.solid(c), S.eq(d, 1));
    const run = S.and(act, S.solid(c), S.le(d, L)), tip = S.and(run, S.eq(d, L), S.gt(d, 1));
    // and a drop forms under the underside, then falls
    const kk = shaderEnchAbove(S, 2);
    const drop = S.and(act, S.not(S.solid(c)), S.or(S.and(S.eq(kk, 1), S.ge(ph, 11), S.le(ph, 12)), S.and(S.eq(kk, 2), S.ge(ph, 13), S.le(ph, 14))));
    const gloss = S.sel(S.eq(S.mod(S.x, 2), 0), S.palAt("ramp", 1), S.palAt("ramp", 2));
    return S.pick([
      [drop, S.palAt("ramp", 2)], [tip, shaderPaintMix(S, c, S.palAt("ramp", 3), 85)],
      [S.or(run, coat), shaderPaintMix(S, c, gloss, 80)], [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 8))],
    ], c);
  },
};

SHADER_DEFS.sandblasted = {
  label: "Sandblasted", title: "sand enchant: grains of sand streaking past and over the sprite on the wind, its windward edge worn away",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 12, pad: [3, 3, 3, 3], strength: "amount",
  tags: ["sand", "sandblasted", "desert", "erosion", "wind", "grit", "enchant", "dust", "sandstorm", "debuff"],
  params: Object.assign(shaderEnchParams(55, ["#fff4d8", "#f0d8a0", "#d0b070", "#987840", "#4a3a1c"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Grains" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1161);
    // 2 px streaks in some 8 px slots of each row, racing right 32 px a loop (the slots repeat every 4)
    const u = S.sub(S.x, S.div(S.mul(S.frame, 32), S.FRAMES));
    const grain = S.and(S.gt(A, 0), shaderEvNear3(S), S.lt(S.mod(u, 8), 2), S.lt(S.mod(S.hash(S.mod(S.div(u, 8), 4), S.y, sd), 100), S.div(A, 2)));
    // the windward edge: lit, and flickering away a pixel at a time
    const wind = S.and(S.solid(c), S.not(S.solid(S.tex(-1, 0))));
    const worn = S.and(wind, S.lt(S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 100), S.div(A, 4)));
    return S.pick([
      [worn, S.clear], [grain, S.sel(S.solid(c), S.palAt("ramp", 0), S.palAt("ramp", 1))],
      [wind, shaderPaintMix(S, c, S.palAt("ramp", 1), S.div(A, 2))], [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", 2), S.div(A, 5))],
    ], c);
  },
};

SHADER_DEFS.jeweled = {
  label: "Jeweled", title: "gem enchant: little cut gems set into the sprite in gold, each catching the light in turn, glints along its edge",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["jeweled", "gems", "jewels", "studded", "treasure", "rich", "enchant", "ornate", "gold", "loot"],
  params: {
    amount: { type: "int", min: 0, max: 100, def: 50, label: "Amount (%)" },
    gems: { type: "palette", def: ["#ff3a5a", "#3aa0ff", "#3aff8a", "#ffd23a", "#c05aff"], max: 8, label: "Gems" },
    setting: { type: "colour", def: "#e8c050", label: "Setting" },
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Gems' places" },
  },
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1171), G = S.p("setting");
    // a 2 x 2 gem in a 4 x 4 setting in some 6 px cells, where the gem's four pixels all lie on the sprite
    const fx = S.mod(S.x, 6), fy = S.mod(S.y, 6), bx = S.sub(S.x, fx), by = S.sub(S.y, fy), h = S.hash(S.div(S.x, 6), S.div(S.y, 6), sd);
    const full = S.and(S.solid(S.texAt(S.add(bx, 2), S.add(by, 2))), S.solid(S.texAt(S.add(bx, 3), S.add(by, 2))),
      S.solid(S.texAt(S.add(bx, 2), S.add(by, 3))), S.solid(S.texAt(S.add(bx, 3), S.add(by, 3))));
    const act = S.and(S.solid(c), full, S.lt(S.mod(h, 100), A));
    const gem = S.and(act, S.ge(fx, 2), S.le(fx, 3), S.ge(fy, 2), S.le(fy, 3));
    const set = S.and(act, S.ge(fx, 1), S.le(fx, 4), S.ge(fy, 1), S.le(fy, 4));
    const col = S.palAt("gems", S.mod(S.div(h, 100), S.palCount("gems"))), ph = S.mod(S.add(S.frame, S.div(h, 7)), 16);
    const white = S.rgba(255, 255, 255, 255);
    const glint = S.and(S.gt(A, 0), S.solid(c), shaderPaintRim(S), S.eq(S.mod(S.add(S.hash(S.x, S.y, S.add(sd, 1)), S.frame), 10), 0));
    return S.pick([
      [S.and(gem, S.eq(fx, 2), S.eq(fy, 2)), S.sel(S.lt(ph, 2), white, shaderPaintMix(S, col, white, 55))],
      [S.and(gem, S.eq(fx, 3), S.eq(fy, 3)), shaderPaintMix(S, col, S.rgba(0, 0, 0, 255), 40)], [gem, col],
      [S.and(set, S.eq(ph, 1), S.or(S.and(S.eq(fx, 1), S.eq(fy, 1)), S.and(S.eq(fx, 4), S.eq(fy, 4)))), white],
      [set, shaderPaintMix(S, G, S.rgba(0, 0, 0, 255), S.sel(S.or(S.eq(fx, 4), S.eq(fy, 4)), 35, 0))],
      [glint, shaderPaintMix(S, G, white, 50)],
    ], c);
  },
};

SHADER_DEFS.fractured = {
  label: "Fractured", title: "shatter enchant: the sprite cracked like a mirror into jagged pieces that shift apart and back, glints on the cracks",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 16, fps: 10, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["fractured", "cracked", "shattered", "mirror", "glass", "broken", "enchant", "unstable", "splinter", "debuff"],
  params: Object.assign(shaderEnchParams(60, ["#ffffff", "#d8e8f8", "#8aa0c0", "#303a50", "#0c1018"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Cracks" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1181);
    // pieces: 5 px cells with their edges pushed about by a noise, so the cracks run jagged
    const piece = function (dx, dy) {
      const X = S.add(S.x, dx), Y = S.add(S.y, dy);
      const cx = S.div(S.add(X, S.div(shaderPaintNoise(S, X, Y, 3, sd), 64)), 5), cy = S.div(S.add(Y, S.div(shaderPaintNoise(S, X, Y, 3, S.add(sd, 1)), 64)), 5);
      return S.hash(cx, cy, S.add(sd, 2));
    };
    const p0 = piece(0, 0), crack = S.or(S.ne(p0, piece(1, 0)), S.ne(p0, piece(0, 1)));
    // twice a loop, as hard as the amount says, each piece slips a pixel its own way
    const open = S.gt(S.div(S.mul(S.abs(shaderMotionSin(S, S.div(S.mul(S.frame, 360), S.FRAMES))), A), 100), 400);
    const ox = S.sel(open, S.sub(S.mod(p0, 3), 1), 0), oy = S.sel(open, S.sub(S.mod(S.div(p0, 3), 3), 1), 0);
    const src = S.texAt(S.sub(S.x, ox), S.sub(S.y, oy), "clear"), on = S.and(S.gt(A, 0), S.solid(src));
    const glint = S.eq(S.mod(S.sub(S.add(S.x, S.y), S.frame), 8), 0);
    return S.pick([
      [S.not(S.solid(src)), S.clear], [S.and(on, crack, glint), S.palAt("ramp", 0)], [S.and(on, crack), shaderPaintMix(S, src, S.palAt("ramp", 3), 80)],
    ], shaderPaintMix(S, src, S.palAt("ramp", 1), S.div(A, 6)));
  },
};

SHADER_DEFS.ironclad = {
  label: "Ironclad", title: "armor enchant: the sprite plated in riveted iron, staggered plates and seams, a shine sliding across",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 20, fps: 10, pad: [0, 0, 0, 0], strength: "amount",
  tags: ["ironclad", "armor", "plated", "iron", "rivets", "steel", "enchant", "tank", "fortified", "defense"],
  params: Object.assign(shaderEnchParams(60, ["#ffffff", "#c8d0d8", "#8a949e", "#4a525a", "#1a1e22"]), {
    plate: { type: "int", min: 4, max: 10, def: 6, label: "Plate width (px)" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), P = S.p("plate");
    // rows of plates 4 px tall, staggered half a plate, a seam along the bottom and left of each, two rivets near its top
    const row = S.div(S.y, 4), fx = S.mod(S.add(S.x, S.mul(S.mod(row, 2), S.div(P, 2))), P), fy = S.mod(S.y, 4);
    const seam = S.or(S.eq(fy, 3), S.eq(fx, 0)), rv = S.or(S.eq(fx, 1), S.eq(fx, S.sub(P, 2)));
    const metal = shaderPaintMix(S, c, shaderExRampOf(S, c), S.div(S.mul(A, 7), 10));
    const sheen = S.and(S.gt(A, 0), S.lt(S.mod(S.sub(S.add(S.x, S.y), S.div(S.mul(S.frame, 20), S.FRAMES)), 20), 3));
    return S.pick([
      [S.not(S.solid(c)), c],
      [S.and(rv, S.eq(fy, 1)), shaderPaintMix(S, c, S.palAt("ramp", 0), A)], [S.and(rv, S.eq(fy, 2)), shaderPaintMix(S, c, S.palAt("ramp", 4), S.div(A, 2))],
      [seam, shaderPaintMix(S, c, S.palAt("ramp", 4), S.div(S.mul(A, 6), 10))], [sheen, shaderPaintMix(S, metal, S.palAt("ramp", 1), S.div(A, 2))],
    ], metal);
  },
};

SHADER_DEFS.plasmatic = {
  label: "Plasma", title: "plasma enchant: a churning plasma of the ramp's colors swirling inside the sprite, arcs crackling round its edge",
  group: "Sprite FX", kind: "sprite", palette: "free", frames: 24, fps: 12, pad: [1, 1, 1, 1], strength: "amount",
  tags: ["plasma", "plasmatic", "energy", "demoscene", "swirl", "psychedelic", "enchant", "arcane", "cosmic", "neon"],
  params: Object.assign(shaderEnchParams(65, ["#ffffff", "#ff60f0", "#8040ff", "#20c0ff", "#101040"]), {
    seed: { type: "int", min: 0, max: 99, def: 0, label: "Arcs" },
  }),
  fragment: function (S) {
    const c = S.tex(0, 0), A = S.p("amount"), sd = S.add(S.mul(S.p("seed"), 4), 1191), n = S.palCount("ramp");
    // three sine waves across, down and on the diagonal, each turning whole turns a loop, summed and cycled through the ramp
    const t = S.div(S.mul(S.frame, 360), S.FRAMES);
    const v = S.add(S.add(shaderMotionSin(S, S.add(S.mul(S.x, 24), t)), shaderMotionSin(S, S.sub(S.mul(S.y, 30), t))),
      shaderMotionSin(S, S.add(S.mul(S.add(S.x, S.y), 15), S.mul(t, 2))));
    const idx = S.mod(S.add(S.div(S.mul(S.add(v, 3000), n), 2000), S.div(S.mul(S.frame, n), S.FRAMES)), n);
    const arc = S.and(shaderEnchRing1(S), S.lt(S.mod(S.hash(S.x, S.y, S.add(S.frame, sd)), 100), S.div(A, 5)));
    return S.pick([[arc, S.palAt("ramp", 0)], [S.solid(c), shaderPaintMix(S, c, S.palAt("ramp", idx), S.div(S.mul(A, 7), 10))]], c);
  },
};

SHADER_DEFS.raincloud.variants = [{ amount: 100, seed: 2 }, { amount: 25, ramp: ["#ffffff", "#f0f0f8", "#d8dce8", "#a8b0c0", "#606878"] }];
SHADER_DEFS.smoldering.variants = [{ amount: 100 }, { amount: 25, seed: 4 }];
SHADER_DEFS.soulbound.variants = [{ amount: 100, turns: 4 }, { amount: 35, turns: 1, ramp: ["#f0fff0", "#90ffa0", "#40c060", "#206030", "#081a0c"] }];
SHADER_DEFS.runering.variants = [{ amount: 100, tilt: 2 }, { amount: 30, tilt: 6, ramp: ["#f0f0ff", "#a0a0ff", "#6060e0", "#30307a", "#0c0c30"] }];
SHADER_DEFS.echoing.variants = [{ amount: 100 }, { amount: 35, ramp: ["#fff0ff", "#ffa0f0", "#d050d0", "#702070", "#200820"] }];
SHADER_DEFS.eldritch.variants = [{ amount: 100, seed: 5 }, { amount: 20 }];
SHADER_DEFS.dragonscale.variants = [{ amount: 100, size: 3, ramp: ["#fff0c0", "#ffb040", "#e04020", "#801010", "#300404"] }, { amount: 40, size: 8 }];
SHADER_DEFS.luminous.variants = [{ amount: 100, seed: 2 }, { amount: 30, ramp: ["#fff0ff", "#ff80e0", "#c040c0", "#501a6a", "#0c0414"] }];
SHADER_DEFS.feathered.variants = [{ amount: 100 }, { amount: 30, seed: 3, ramp: ["#606060", "#404048", "#2a2a30", "#18181c", "#060608"] }];
SHADER_DEFS.honeyed.variants = [{ amount: 100, seed: 1 }, { amount: 25, ramp: ["#fff0f8", "#ff90c0", "#e04080", "#902050", "#300818"] }];
SHADER_DEFS.sandblasted.variants = [{ amount: 100 }, { amount: 30, seed: 6, ramp: ["#ffffff", "#e8f0f8", "#c0d0e0", "#8090a8", "#303848"] }];
SHADER_DEFS.jeweled.variants = [{ amount: 100, setting: "#d0d8e0" }, { amount: 30, gems: ["#ff2040"], seed: 4 }];
SHADER_DEFS.fractured.variants = [{ amount: 100, seed: 3 }, { amount: 30 }];
SHADER_DEFS.ironclad.variants = [{ amount: 100, plate: 4 }, { amount: 40, plate: 10, ramp: ["#fff8e0", "#e0c080", "#a07a40", "#5a4020", "#201408"] }];
SHADER_DEFS.plasmatic.variants = [{ amount: 100, seed: 2 }, { amount: 35, ramp: ["#fff8e0", "#ffc040", "#ff6020", "#c01040", "#300410"] }];

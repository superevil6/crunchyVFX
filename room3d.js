"use strict";
// CrunchyVFX: THE ROOM (VFX-DESIGN §61.3). The effect standing in a small 3D room, drawn in SOFTWARE: rays against a
// floor, a back wall and a side wall (a wall seen from behind is not drawn, so the camera always looks in, the way a
// doll's house cutaway does), textured with crunchyCore textures.js (+ texgen.js for the recipe textures) in ramps.js's colors, lit
// by an ambient, the room's own dim light and the EFFECT's light (fx3dLight: the same per-frame energies the Godot
// export bakes, with Godot's own omni falloff, so the preview IS the export's light). The effect's current frame stands
// in it as the export stands it: "face" (a billboard facing the camera), "upright" (turned to the camera, kept
// vertical), "flat" (a decal on the floor, sampled in floor space) or "screen" (drawn over the room in 2D). Sprites are
// unshaded, cut at a half (alpha_cut DISCARD, pixel art) or alpha-blended (soft effects), as the export's AnimatedSprite3D
// is, and depth-tested against the room.
//
// PURE: no DOM, no window, no storage. Returns RGBA. DETERMINISTIC: the same inputs give the same pixels (the only state
// is a memo of the textures' 32 x 32 periods). Every top-level name is room3d* / ROOM3D_*.
//
// THE API:
//   ROOM3D_ROOMS                         [{ id, name, ... }], the rooms, in the picker's order (append only)
//   room3dRoom(id) -> room               a room by id (the first when unknown)
//   room3dPlace(frames, stand, mpp, anchor, opts?) -> place   where the effect stands, from ALL its frames (once per
//                                        render): frames [{ w, h, data }]; anchor { x, y } in frame pixels, the scene's
//                                        node (fx3dAnchor); opts { alpha: "cut" | "blend" (fx3dAlphaMode), depth (a flat
//                                        effect's stretch along the floor, fx3dFlatDepth), light: [x, y, z] from the node
//                                        (fx3dLightPos) }. The app passes what fx3d.js decided, so the room IS the export.
//   room3dView(place) -> { yaw, pitch, dist, ty }      the camera that frames it (yaw/pitch the starting orbit)
//   room3dClampYaw(yaw) -> yaw           kept inside the orbit's range (ROOM3D_YAW_MIN .. MAX)
//   room3dEye(place, zoom?) -> { pitch, dist, ty }   EYE HEIGHT: a first-person look at it, the camera 1.6 m up, a few
//                                        meters off (zoom scales the distance)
//   room3dRender(o) -> { w, h, data }    one picture. o: { room, yaw, pitch, w?, h?, place?, frame?, light?, lit? }
//                                        frame { w, h, data } (this frame's RGBA), light { color: [r,g,b] 0..1 sRGB,
//                                        energy, range } (null or energy 0: no light)
//                                        <vfx13-shapes> geom (optional): a function of the camera { e, f, r, u } (eye, forward,
//                                        right, up) returning { parts, tris } (fx3d.js fx3dRoomDraws): camera-facing quads and
//                                        textured triangles drawn after the room and the card, tested against their depth
//                                        lit (§65, a LIT effect) { normal:
//                                        this frame's normal map RGBA (lit.js: x right, y up, z out), glow: the glow
//                                        threshold 0..1 (over 1: nothing glows), hot: only fire colors glow, steps: light bands }: SHADED by the
//                                        room's lights (ambient, lamp, moon, torch) and the effect's own light, in the
//                                        exported shader's model (a Lambert wrapped by ROOM3D_WRAP); its glow stays as drawn

const ROOM3D_BUILD = 4;   // <vfx13-shapes> 2: the 3D-native forms (o.geom: particles and meshes, depth-tested); vfx13-lit 3: §65 lit effects (o.lit) and the Torchlit cellar; vfx13-tile 4: §66 the "texture" stand (a seamless tile on the floor)
const ROOM3D_W = 320, ROOM3D_H = 200;      // the picture's size: Texture's places' look, shown upscaled NEAREST
const ROOM3D_WALL = 3, ROOM3D_EDGE = 12;    // the walls stand 3 m behind and beside the effect; they and the floor run 12 m out
// THE ORBIT'S RANGE: the camera stays in front of both walls, so they are always behind the effect and the view never
// looks out past their open ends into the void (0 = straight at the back wall, pi/2 = straight at the side wall)
const ROOM3D_YAW_MIN = 0.1, ROOM3D_YAW_MAX = 1.47;
const ROOM3D_EYE = 1.6;                     // EYE HEIGHT: a first-person camera's height, in meters
const ROOM3D_TEXELS = 16;                   // texture pixels per meter (a 32 px period is 2 m)
const ROOM3D_FOV = 0.95;                    // vertical field of view, radians (about 54 degrees)
const ROOM3D_CUT = 0.5;                     // the sprite's alpha cut (Godot's alpha_scissor_threshold default)
const ROOM3D_WRAP = 0.4;                    // §65: a lit sprite's light wraps this far round (lit.js LIT_WRAP, the shaders' wrap)

// THE ROOMS. Textures by name (textures.js TEXTURES; the recipe ones need texgen.js, else they draw flat), ramps by
// ramps.js CT_RAMPS name; `wall` is the back wall, `side` the side wall (the back one's when missing). Lights are LINEAR
// colors; `fill` is the room's own dim lamp (an omni), `moon` a directional. The walls stand at x = -3 and z = -3.
const ROOM3D_ROOMS = [
  { id: "dungeon", name: "Dungeon", seed: 3,
    floor: { tex: "flagstones", ramp: "stone" }, wall: { tex: "blockwork", ramp: "stone" }, wallH: 4,
    bg: [7, 6, 9], ambient: [0.035, 0.03, 0.035],
    fill: { pos: [-2.6, 2.4, -2.6], color: [1.0, 0.55, 0.25], energy: 1.4, range: 5.5 } },
  { id: "meadow", name: "Night meadow", seed: 5,
    floor: { tex: "grass", ramp: "leaf" }, wall: { tex: "leaves", ramp: "leaf" }, wallH: 1.6, sky: "night",
    bg: [10, 14, 34], ambient: [0.03, 0.04, 0.08],
    moon: { dir: [-0.45, 0.75, 0.5], color: [0.35, 0.45, 0.8], energy: 0.3 } },
  { id: "deck", name: "Sci-fi deck", seed: 7,
    floor: { tex: "plating", ramp: "iron" }, wall: { tex: "plating", ramp: "cold" }, side: { tex: "circuit", ramp: "iron" }, wallH: 4,
    bg: [5, 8, 12], ambient: [0.03, 0.04, 0.05],
    fill: { pos: [1.5, 3.8, -2.6], color: [0.45, 0.85, 1.0], energy: 1.2, range: 6 } },
  { id: "hall", name: "Wooden hall", seed: 9,
    floor: { tex: "boards", ramp: "wood" }, wall: { tex: "planks", ramp: "wood" }, side: { tex: "bookshelf", ramp: "wood" }, wallH: 4,
    bg: [10, 6, 4], ambient: [0.05, 0.036, 0.028],
    fill: { pos: [2.4, 2.6, -2.6], color: [1.0, 0.7, 0.4], energy: 1.3, range: 5.5 } },
  // §65: a TORCH on a stand at the front left, between the effect and the camera's side, so a lit effect shows its torch
  // side warm (and its far side dark) from where the camera starts
  { id: "cellar", name: "Torchlit cellar", seed: 11,
    floor: { tex: "cobble", ramp: "stone" }, wall: { tex: "blockwork", ramp: "earth" }, wallH: 4,
    bg: [6, 4, 4], ambient: [0.03, 0.026, 0.03],
    torch: { pos: [-1.5, 1.4, 1.5], color: [1.0, 0.5, 0.16], energy: 2, range: 6 } },
];
function room3dRoom(id) {
  for (let i = 0; i < ROOM3D_ROOMS.length; i++) if (ROOM3D_ROOMS[i].id === id) return ROOM3D_ROOMS[i];
  return ROOM3D_ROOMS[0];
}

// sRGB <-> linear, by table (lighting is done in linear light, as Godot does it)
const ROOM3D_LIN = (function () {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  return t;
})();
const ROOM3D_SRGB = (function () {
  const t = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    const c = i / 4095, s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    t[i] = Math.max(0, Math.min(255, Math.round(s * 255)));
  }
  return t;
})();
function room3dToLin(c) { return Math.pow(Math.max(0, Math.min(1, c)), 2.2); }
const ROOM3D_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// A texture's 32 x 32 period in LINEAR color (period divides 32 for every texture: textures.js's rule). Ramps are darkest
// first; a texture's level 0 is its lightest, so level k wears the ramp's (5 - k)th step.
const ROOM3D_TEX_MEMO = {};
function room3dHex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function room3dTex(spec, seed) {
  const key = spec.tex + "|" + spec.ramp + "|" + seed;
  if (ROOM3D_TEX_MEMO[key]) return ROOM3D_TEX_MEMO[key];
  const ramp = (typeof CT_RAMPS !== "undefined" && CT_RAMPS[spec.ramp] ? CT_RAMPS[spec.ramp].c : ["#202020", "#404040", "#606060", "#808080", "#a0a0a0", "#c0c0c0"]).map(room3dHex);
  const out = new Float32Array(32 * 32 * 3);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let k = 2;
    if (typeof textureIndex === "function") k = textureIndex(spec.tex, x, y, 5, 0, seed) | 0;
    const c = ramp[Math.max(0, Math.min(5, k))], o = (y * 32 + x) * 3;
    out[o] = ROOM3D_LIN[c[0]]; out[o + 1] = ROOM3D_LIN[c[1]]; out[o + 2] = ROOM3D_LIN[c[2]];
  }
  return (ROOM3D_TEX_MEMO[key] = out);
}

// WHERE THE EFFECT STANDS, from every frame's drawn pixels (alpha at or over the cut): the scene's node (the anchor: an
// upright effect's foot, else its impact point) sits on the floor, unless that would bury drawn pixels under it (a burst centered on its origin, a bolt drawn down from its
// top): then it is lifted just enough that its FOOT touches the floor. The foot is the row above which 97 % of all the
// drawn pixels of all the frames lie, so a few bits of debris flung to the frame's edge do not hoist a fireball into the
// air (the rest sink out of sight under the floor, as they would in the engine). Where the node stands is the room's
// choice (a game puts it where it likes); everything relative to the node is the export's. A flat effect lies on the
// floor, stretched along it by opts.depth. The light hangs where opts.light says (fx3dLightPos, the scene's OmniLight3D);
// without it, at the middle of what is drawn, never lower than 0.3 m.
function room3dPlace(frames, stand, mpp, origin, opts) {
  opts = opts || {};
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, w = 0, h = 0, total = 0;
  let rows = new Float64Array(0);
  for (const f of frames || []) {
    w = f.w; h = f.h;
    if (rows.length < f.h) { const r = new Float64Array(f.h); r.set(rows); rows = r; }
    const d = f.data, cut = opts.alpha === "blend" ? 8 : Math.round(ROOM3D_CUT * 255);   // what shows: a blended sprite shows faint pixels too
    for (let y = 0; y < f.h; y++) {
      let row = y * f.w * 4;
      for (let x = 0; x < f.w; x++, row += 4) if (d[row + 3] >= cut) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        rows[y]++; total++;
      }
    }
  }
  let foot = y1 + 1;
  for (let y = 0, acc = 0; y < rows.length && total; y++) { acc += rows[y]; if (acc >= total * 0.97) { foot = y + 1; break; } }
  const empty = !isFinite(x0);
  if (empty) { x0 = 0; y0 = 0; x1 = Math.max(0, w - 1); y1 = Math.max(0, h - 1); }
  const ox = origin ? origin.x : w / 2, oy = origin ? origin.y : h / 2;
  const P = { stand: stand, mpp: mpp, ox: ox, oy: oy, w: w, h: h, box: { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 }, foot: empty ? h : foot, empty: empty,
              alpha: opts.alpha === "blend" ? "blend" : "cut", depth: stand === "flat" && opts.depth > 0 ? opts.depth : 1 };
  if (stand === "texture") {             // vfx13-tile §66: a seamless tile covers the floor; nothing stands
    P.lift = 0; P.light = [0, 0.3, 0];
  } else if (stand === "flat") {
    P.lift = 0.01;
    P.light = opts.light ? [opts.light[0], opts.light[1], opts.light[2]] : [((x0 + x1 + 1) / 2 - ox) * mpp, 0.3, ((y0 + y1 + 1) / 2 - oy) * mpp * P.depth];
  } else {
    P.lift = stand === "screen" ? 0 : Math.max(0, (P.foot - oy) * mpp);
    P.light = opts.light ? [opts.light[0], opts.light[1] + P.lift, opts.light[2]]
                         : [0, Math.max(0.3, P.lift + (oy - (y0 + P.foot) / 2) * mpp), 0];
  }
  return P;
}

// THE CAMERA that frames the effect: looking at the middle of what is drawn, far enough to see all of it (and some room).
function room3dClampYaw(y) { return Math.max(ROOM3D_YAW_MIN, Math.min(ROOM3D_YAW_MAX, +y || 0)); }
function room3dEye(P, zoom) {
  const V = room3dView(P), dist = Math.max(2.5, Math.min(7, V.dist)) * (zoom > 0 ? zoom : 1);
  return { pitch: Math.asin(Math.max(-0.95, Math.min(0.95, (ROOM3D_EYE - V.ty) / dist))), dist: dist, ty: V.ty };
}
function room3dView(P) {
  const tanH = Math.tan(ROOM3D_FOV / 2);
  if (!P || P.stand === "screen") return { yaw: 0.55, pitch: 0.28, dist: 5.2, ty: 1.2 };
  const bw = (P.box.x1 - P.box.x0) * P.mpp, bh = (P.box.y1 - P.box.y0) * P.mpp;
  if (P.stand === "texture") return { yaw: 0.55, pitch: 0.5, dist: 5.2, ty: 0.6 };   // vfx13-tile: the floor it covers, and the wall
  if (P.stand === "flat") {
    const s = Math.max(bw, bh);
    return { yaw: 0.55, pitch: 0.72, dist: Math.max(2.4, Math.min(7, s * 0.5 / tanH + 1)), ty: 0.1 };
  }
  const top = P.lift + (P.oy - P.box.y0) * P.mpp, bottom = Math.max(0, P.lift + (P.oy - P.foot) * P.mpp);
  const mid = (top + bottom) / 2, span = Math.max(bh, bw * 0.625);
  return { yaw: 0.55, pitch: 0.22, dist: Math.max(2.6, Math.min(8, span * 0.6 / tanH + 1.2)), ty: Math.max(0.5, Math.min(3, mid)) };
}

// Godot 4's omni falloff (decay 1): energy over distance, windowed to zero at the range
function room3dOmni(dx, dy, dz, nx, ny, nz, range) {
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d >= range || d < 1e-6) return 0;
  const ndl = (dx * nx + dy * ny + dz * nz) / d;
  if (ndl <= 0) return 0;
  let q = d / range; q *= q; q *= q; q = 1 - q;
  return ndl * q * q / Math.max(d, 0.0001);
}

// fx3d.js fx3dHot (room3d.js stands alone): a fire-colored pixel, the only kind that glows in an effect of matter (o.lit.hot)
function room3dHot(r, g, b) { const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); return mx >= 96 && r === mx && d >= 0.6 * mx && b <= g + 0.25 * d; }
function room3dRender(o) {
  const W = o.w || ROOM3D_W, H = o.h || ROOM3D_H;
  const R = typeof o.room === "object" && o.room ? o.room : room3dRoom(o.room);
  const P = o.place || null, F = o.frame || null, stand = P ? P.stand : "face", blend = !!P && P.alpha === "blend";
  const V = room3dView(P);
  const yaw = o.yaw != null ? o.yaw : V.yaw, pitch = o.pitch != null ? o.pitch : V.pitch;
  const dist = o.dist != null ? o.dist : V.dist, ty = o.ty != null ? o.ty : V.ty;
  // the camera: on a sphere round (0, ty, 0)
  const cp = Math.cos(pitch);
  const ex = Math.sin(yaw) * cp * dist, ey = ty + Math.sin(pitch) * dist, ez = Math.cos(yaw) * cp * dist;
  let fx = -ex, fy = ty - ey, fz = -ez;
  let fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;   // right = forward x up, level
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                       // up = right x forward
  const tanH = Math.tan(ROOM3D_FOV / 2), aspect = W / H;

  const floorT = room3dTex(R.floor, R.seed), sideT = room3dTex(R.side || R.wall, R.seed + 1), backT = room3dTex(R.wall, R.seed + 1);
  const S = ROOM3D_WALL, E = ROOM3D_EDGE, WH = R.wallH || 4, TX = ROOM3D_TEXELS;
  const amb = R.ambient, bg = R.bg;
  const L = o.light && o.light.energy > 0 && stand !== "screen" && P ? o.light : null;
  const lc = L ? [room3dToLin(L.color[0]) * L.energy, room3dToLin(L.color[1]) * L.energy, room3dToLin(L.color[2]) * L.energy] : null;
  const lp = P ? P.light : [0, 0.3, 0], lr = L ? Math.max(0.1, L.range) : 1;
  const fill = R.fill, moon = R.moon, torch = R.torch || null;
  let mdx = 0, mdy = 0, mdz = 0;
  if (moon) { const m = Math.hypot(moon.dir[0], moon.dir[1], moon.dir[2]); mdx = moon.dir[0] / m; mdy = moon.dir[1] / m; mdz = moon.dir[2] / m; }

  // the sprite's plane: an anchor A (the origin pixel) and two axes in meters per frame pixel (a: +x, b: +y down)
  let spr = null;
  if (P && F && stand !== "screen" && stand !== "texture" && F.w && F.h) {   // vfx13-tile: a texture is no sprite
    const m = P.mpp;
    let ax, ay, az, bx, by, bz;
    if (stand === "flat") { ax = m; ay = 0; az = 0; bx = 0; by = 0; bz = m * P.depth; }
    else if (stand === "upright") { ax = rx * m; ay = 0; az = rz * m; bx = 0; by = -m; bz = 0; }
    else { ax = rx * m; ay = 0; az = rz * m; bx = -ux * m; by = -uy * m; bz = -uz * m; }
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    spr = { Ax: 0, Ay: P.lift, Az: 0, ax: ax, ay: ay, az: az, bx: bx, by: by, bz: bz, nx: nx, ny: ny, nz: nz,
            aa: ax * ax + ay * ay + az * az, bb: bx * bx + by * by + bz * bz };
  }
  // §65 A LIT SPRITE: its tangent frame in the room (T: the picture's right, B: its UP, N: out of it, toward the camera
  // for a billboard, up for a flat one), and every light that reaches it
  const LIT = spr && o.lit && o.lit.normal && o.lit.normal.length === F.data.length ? o.lit : null;
  let litT = null;
  if (LIT) {
    const la = Math.sqrt(spr.aa), lb = Math.sqrt(spr.bb);
    const T = [spr.ax / la, spr.ay / la, spr.az / la], B = [-spr.bx / lb, -spr.by / lb, -spr.bz / lb];
    const N = [T[1] * B[2] - T[2] * B[1], T[2] * B[0] - T[0] * B[2], T[0] * B[1] - T[1] * B[0]];
    const omni = [];
    if (fill) omni.push({ p: fill.pos, c: fill.color, e: fill.energy, r: fill.range });
    if (torch) omni.push({ p: torch.pos, c: torch.color, e: torch.energy, r: torch.range });
    if (L) omni.push({ p: lp, c: [lc[0] / L.energy, lc[1] / L.energy, lc[2] / L.energy], e: L.energy, r: lr });
    litT = { T: T, B: B, N: N, omni: omni, thr: (o.lit.glow > 1 ? 2 : Math.max(0, o.lit.glow)) * 255, steps: o.lit.steps > 0 ? o.lit.steps : 0, hot: !!o.lit.hot };
  }
  // the lit color of sprite pixel k at (hx, hy, hz), 0..255 sRGB into dst (glowing pixels as drawn)
  const shade = (k, hx, hy, hz, dst) => {
    const d = F.data, a = d[k + 3];
    if ((d[k] * 0.3 + d[k + 1] * 0.6 + d[k + 2] * 0.1) * (a / 255) >= litT.thr && (!litT.hot || room3dHot(d[k], d[k + 1], d[k + 2]))) { dst[0] = d[k]; dst[1] = d[k + 1]; dst[2] = d[k + 2]; return; }
    const n = LIT.normal, tx = n[k] / 127.5 - 1, ty = n[k + 1] / 127.5 - 1, tz = n[k + 2] / 127.5 - 1;
    const T = litT.T, B = litT.B, N = litT.N;
    let wx = tx * T[0] + ty * B[0] + tz * N[0], wy = tx * T[1] + ty * B[1] + tz * N[1], wz = tx * T[2] + ty * B[2] + tz * N[2];
    const wl = Math.hypot(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl;
    let r = amb[0], g = amb[1], b = amb[2];
    for (const q of litT.omni) {
      const dx = q.p[0] - hx, dy = q.p[1] - hy, dz = q.p[2] - hz, dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dd >= q.r || dd < 1e-6) continue;
      let w = Math.min(1, ((dx * wx + dy * wy + dz * wz) / dd + ROOM3D_WRAP) / (1 + ROOM3D_WRAP));
      if (litT.steps) w = Math.round(w * litT.steps) / litT.steps;
      if (w <= 0) continue;
      let qq = dd / q.r; qq *= qq; qq *= qq; qq = 1 - qq;
      const e = q.e * w * qq * qq / Math.max(dd, 0.0001);
      r += q.c[0] * e; g += q.c[1] * e; b += q.c[2] * e;
    }
    if (moon) {
      let w = Math.max(0, Math.min(1, (wx * mdx + wy * mdy + wz * mdz + ROOM3D_WRAP) / (1 + ROOM3D_WRAP)));
      if (litT.steps) w = Math.round(w * litT.steps) / litT.steps;
      w *= moon.energy;
      r += moon.color[0] * w; g += moon.color[1] * w; b += moon.color[2] * w;
    }
    dst[0] = ROOM3D_SRGB[Math.min(4095, (ROOM3D_LIN[d[k]] * r * 4095) | 0)];
    dst[1] = ROOM3D_SRGB[Math.min(4095, (ROOM3D_LIN[d[k + 1]] * g * 4095) | 0)];
    dst[2] = ROOM3D_SRGB[Math.min(4095, (ROOM3D_LIN[d[k + 2]] * b * 4095) | 0)];
  };
  const sc = [0, 0, 0];
  let shx = 0, shy = 0, shz = 0;

  const out = new Uint8ClampedArray(W * H * 4);
  const zb = typeof o.geom === "function" ? new Float32Array(W * H).fill(Infinity) : null;   // <vfx13-shapes> the depth (view z) of what is drawn
  for (let py = 0; py < H; py++) {
    const sv = (1 - (py + 0.5) / H * 2) * tanH;
    for (let px = 0; px < W; px++) {
      const su = ((px + 0.5) / W * 2 - 1) * tanH * aspect;
      const dx = fx + rx * su + ux * sv, dy = fy + uy * sv, dz = fz + rz * su + uz * sv;
      // the nearest room surface: the floor, then the walls
      let t = Infinity, nx = 0, ny = 0, nz = 0, tu = 0, tv = 0, which = 0;
      if (dy < 0 && ey > 0) {
        const tt = -ey / dy, hx = ex + dx * tt, hz = ez + dz * tt;
        if (hx >= -S && hx <= E && hz >= -S && hz <= E) { t = tt; ny = 1; tu = hx; tv = hz; which = 1; }
      }
      // the side wall x = -S (normal +x) and the back wall z = -S (normal +z), each seen from inside only
      if (dx < 0 && ex > -S) {
        const tt = (-S - ex) / dx;
        if (tt < t) { const hy = ey + dy * tt, hz = ez + dz * tt; if (hy >= 0 && hy <= WH && hz >= -S && hz <= E) { t = tt; nx = 1; ny = 0; nz = 0; tu = hz; tv = -hy; which = 2; } }
      }
      if (dz < 0 && ez > -S) {
        const tt = (-S - ez) / dz;
        if (tt < t) { const hy = ey + dy * tt, hx = ex + dx * tt; if (hy >= 0 && hy <= WH && hx >= -S && hx <= E) { t = tt; nx = 0; ny = 0; nz = 1; tu = hx; tv = -hy; which = 3; } }
      }
      const o4 = (py * W + px) * 4;
      if (zb && which) zb[py * W + px] = t;   // <vfx13-shapes>
      // the sprite, in front of whatever the room put there: "cut" (pixel art: alpha_cut discard at a half) draws a pixel
      // whole or not at all; "blend" (soft glows and smoke) lays it over the room by its alpha, in linear light as Godot does
      let sk = -1;
      if (spr) {
        const den = dx * spr.nx + dy * spr.ny + dz * spr.nz;
        if (den !== 0) {
          const ts = ((spr.Ax - ex) * spr.nx + (spr.Ay - ey) * spr.ny + (spr.Az - ez) * spr.nz) / den;
          if (ts > 0 && ts < t) {
            const qx = ex + dx * ts - spr.Ax, qy = ey + dy * ts - spr.Ay, qz = ez + dz * ts - spr.Az;
            const u = Math.floor(P.ox + (qx * spr.ax + qy * spr.ay + qz * spr.az) / spr.aa);
            const v = Math.floor(P.oy + (qx * spr.bx + qy * spr.by + qz * spr.bz) / spr.bb);
            if (u >= 0 && v >= 0 && u < F.w && v < F.h) {
              const k = (v * F.w + u) * 4, a = F.data[k + 3];
              if (blend ? a === 255 : a >= 128) {
                if (litT) { shade(k, qx + spr.Ax, qy + spr.Ay, qz + spr.Az, sc); out[o4] = sc[0]; out[o4 + 1] = sc[1]; out[o4 + 2] = sc[2]; }
                else { out[o4] = F.data[k]; out[o4 + 1] = F.data[k + 1]; out[o4 + 2] = F.data[k + 2]; }
                out[o4 + 3] = 255;
                if (zb) zb[py * W + px] = ts;   // <vfx13-shapes>
                continue;
              }
              if (blend && a > 0) { sk = k; shx = qx + spr.Ax; shy = qy + spr.Ay; shz = qz + spr.Az; }
            }
          }
        }
      }
      let r, g, b;
      if (!which) {
        // nothing: the dark beyond the room, or (outdoors) the night sky with fixed stars
        r = bg[0]; g = bg[1]; b = bg[2];
        if (R.sky === "night") {
          const dl = Math.hypot(dx, dy, dz), el = dy / dl;
          const k = Math.max(0, Math.min(1, el * 2));
          r = bg[0] * (1 - k) + 3 * k; g = bg[1] * (1 - k) + 4 * k; b = bg[2] * (1 - k) + 12 * k;
          if (el > 0.02) {
            const az = Math.atan2(dx, dz), ca = Math.floor(az * 70), ce = Math.floor(Math.asin(el) * 70);
            let hsh = Math.imul(ca | 0, 374761393) + Math.imul(ce | 0, 668265263);
            hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177); hsh = ((hsh ^ (hsh >>> 16)) >>> 0) / 4294967296;
            if (hsh < 0.012) { const s = hsh < 0.003 ? 230 : 150; r = s; g = s; b = s + 20; }
          }
        }
      } else {
        const hx = ex + dx * t, hy = ey + dy * t, hz = ez + dz * t;
        const T = which === 1 ? floorT : which === 2 ? sideT : backT;
        const iu = ((Math.floor(tu * TX) % 32) + 32) % 32, iv = ((Math.floor(tv * TX) % 32) + 32) % 32, ti = (iv * 32 + iu) * 3;
        let lr0 = amb[0], lg0 = amb[1], lb0 = amb[2];
        if (fill) {
          const a = fill.energy * room3dOmni(fill.pos[0] - hx, fill.pos[1] - hy, fill.pos[2] - hz, nx, ny, nz, fill.range);
          lr0 += fill.color[0] * a; lg0 += fill.color[1] * a; lb0 += fill.color[2] * a;
        }
        if (moon) {
          const a = Math.max(0, nx * mdx + ny * mdy + nz * mdz) * moon.energy;
          lr0 += moon.color[0] * a; lg0 += moon.color[1] * a; lb0 += moon.color[2] * a;
        }
        if (torch) {
          const a = torch.energy * room3dOmni(torch.pos[0] - hx, torch.pos[1] - hy, torch.pos[2] - hz, nx, ny, nz, torch.range);
          lr0 += torch.color[0] * a; lg0 += torch.color[1] * a; lb0 += torch.color[2] * a;
        }
        if (L) {
          const a = room3dOmni(lp[0] - hx, lp[1] - hy, lp[2] - hz, nx, ny, nz, lr);
          lr0 += lc[0] * a; lg0 += lc[1] * a; lb0 += lc[2] * a;
        }
        // depth fog into the dark (the old consoles' trick), then back to sRGB with a 4 x 4 ordered dither to 5 bits
        const fog = Math.max(0, Math.min(0.75, (t - 7) / 9));
        const cr = ROOM3D_SRGB[Math.min(4095, (T[ti] * lr0 * 4095) | 0)], cg = ROOM3D_SRGB[Math.min(4095, (T[ti + 1] * lg0 * 4095) | 0)], cb = ROOM3D_SRGB[Math.min(4095, (T[ti + 2] * lb0 * 4095) | 0)];
        r = cr * (1 - fog) + bg[0] * fog; g = cg * (1 - fog) + bg[1] * fog; b = cb * (1 - fog) + bg[2] * fog;
        // <vfx13-tile> §66: a seamless texture tiles the FLOOR, a tile every mpp x its width meters, unshaded (it glows as drawn,
        // as the export's material does), over the room's own floor by its alpha, fogged like the room
        if (stand === "texture" && which === 1 && F && F.w && F.h) {
          const tu2 = Math.floor(hx / P.mpp), tv2 = Math.floor(hz / P.mpp);
          const k = ((((tv2 % F.h) + F.h) % F.h) * F.w + (((tu2 % F.w) + F.w) % F.w)) * 4, a = F.data[k + 3] / 255 * (1 - fog);
          r = F.data[k] * a + r * (1 - a); g = F.data[k + 1] * a + g * (1 - a); b = F.data[k + 2] * a + b * (1 - a);
        }
        // </vfx13-tile>
      }
      const dth = (ROOM3D_BAYER[(py & 3) * 4 + (px & 3)] / 16 - 0.5) * 8;
      out[o4] = Math.max(0, Math.min(255, Math.round((r + dth) / 8) * 8));
      out[o4 + 1] = Math.max(0, Math.min(255, Math.round((g + dth) / 8) * 8));
      out[o4 + 2] = Math.max(0, Math.min(255, Math.round((b + dth) / 8) * 8));
      out[o4 + 3] = 255;
      if (sk >= 0) {
        const a = F.data[sk + 3] / 255;
        if (litT) shade(sk, shx, shy, shz, sc);
        for (let c = 0; c < 3; c++) {
          const lin = ROOM3D_LIN[litT ? sc[c] : F.data[sk + c]] * a + ROOM3D_LIN[out[o4 + c]] * (1 - a);
          out[o4 + c] = ROOM3D_SRGB[Math.min(4095, (lin * 4095) | 0)];
        }
      }
    }
  }
  // §65 THE TORCH: a small flame on its bracket where the room's torch hangs (drawn over the room, under a screen effect)
  if (torch) {
    const vx = torch.pos[0] - ex, vy = torch.pos[1] - ey, vz = torch.pos[2] - ez, z = vx * fx + vy * fy + vz * fz;
    if (z > 0.2) {
      const sx = (vx * rx + vz * rz) / (z * tanH * aspect), sy = (vx * ux + vy * uy + vz * uz) / (z * tanH);
      const cx = Math.round((sx + 1) / 2 * W), cy = Math.round((1 - sy) / 2 * H), s = Math.max(1, Math.round(0.07 * H / (z * tanH * 2)));
      // a 3 x 5 flame (rows top to bottom; 0 none, 1 orange, 2 yellow, 3 white) over a 1-wide dark bracket
      const FL = ["010", "121", "131", "121", "444"], C = [null, [255, 120, 30], [255, 200, 70], [255, 245, 200], [40, 28, 24]];
      // its stand: a dark pole from under the flame down to the floor (the floor point projected the same way)
      const zf = (torch.pos[0] - ex) * fx + (0 - ey) * fy + (torch.pos[2] - ez) * fz;
      if (zf > 0.2) {
        const fy0 = ((torch.pos[0] - ex) * ux + (0 - ey) * uy + (torch.pos[2] - ez) * uz) / (zf * tanH);
        const footY = Math.round((1 - fy0) / 2 * H), pw = Math.max(1, s >> 1);
        for (let Y = cy + 3 * s; Y <= Math.min(H - 1, footY); Y++) for (let X = cx - (pw >> 1); X < cx - (pw >> 1) + pw; X++) {
          if (X < 0 || Y < 0 || X >= W) continue;
          const q = (Y * W + X) * 4;
          out[q] = 34; out[q + 1] = 24; out[q + 2] = 20;
        }
      }
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
        const c = C[+FL[j][i]];
        if (!c) continue;
        for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
          const X = cx + (i - 1) * s + xx - (s >> 1), Y = cy + (j - 2) * s + yy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const q = (Y * W + X) * 4;
          out[q] = c[0]; out[q + 1] = c[1]; out[q + 2] = c[2];
        }
      }
    }
  }
  // <vfx13-shapes> the 3D-native forms: what o.geom says for this camera
  if (zb && P && stand !== "screen") room3dGeom(out, zb, W, H, o.geom({ e: [ex, ey, ez], f: [fx, fy, fz], r: [rx, 0, rz], u: [ux, uy, uz] }),
    { ex: ex, ey: ey, ez: ez, fx: fx, fy: fy, fz: fz, rx: rx, rz: rz, ux: ux, uy: uy, uz: uz, tx: tanH * aspect, ty: tanH });
  // </vfx13-shapes>
  // "screen": the frame over the room in 2D, covering it, nearest, alpha-blended (a CanvasLayer)
  if (P && F && stand === "screen" && F.w && F.h) {
    const k = Math.max(W / F.w, H / F.h), offx = (W - F.w * k) / 2, offy = (H - F.h * k) / 2;
    for (let py = 0; py < H; py++) {
      const v = Math.floor((py + 0.5 - offy) / k);
      if (v < 0 || v >= F.h) continue;
      for (let px = 0; px < W; px++) {
        const u = Math.floor((px + 0.5 - offx) / k);
        if (u < 0 || u >= F.w) continue;
        const s = (v * F.w + u) * 4, a = F.data[s + 3] / 255;
        if (!a) continue;
        const o4 = (py * W + px) * 4;
        out[o4] = Math.round(F.data[s] * a + out[o4] * (1 - a));
        out[o4 + 1] = Math.round(F.data[s + 1] * a + out[o4 + 1] * (1 - a));
        out[o4 + 2] = Math.round(F.data[s + 2] * a + out[o4 + 2] * (1 - a));
      }
    }
  }
  return { w: W, h: H, data: out };
}

// <vfx13-shapes>
// THE 3D-NATIVE FORMS (VFX-DESIGN §61.8), drawn as Godot draws them: unshaded; "cut" (alpha scissor at a half) writes depth
// and draws whole pixels in any order; "mix" (alpha) and "add" (additive) are drawn after, far to near, over what is
// nearer than them, never writing depth. A particle is a camera-facing quad (BILLBOARD_PARTICLES: the camera's own axes,
// turned by its angle) showing one cell of its strip; a triangle carries the frame pixel at each corner, interpolated
// perspective-correct, and shows that pixel of the frame.
const ROOM3D_NEAR = 0.05;
function room3dGeom(out, zb, W, H, G, C) {
  if (!G) return;
  const proj = (p) => {
    const vx = p[0] - C.ex, vy = p[1] - C.ey, vz = p[2] - C.ez, z = vx * C.fx + vy * C.fy + vz * C.fz;
    return [((vx * C.rx + vz * C.rz) / (z * C.tx) + 1) / 2 * W, (1 - (vx * C.ux + vy * C.uy + vz * C.uz) / (z * C.ty)) / 2 * H, z];
  };
  const put = (j, img, k, z, mode) => {
    const a = img.data[k + 3];
    if (!a || z >= zb[j]) return;
    const o4 = j * 4;
    if (mode === "cut") {
      if (a < 128) return;
      out[o4] = img.data[k]; out[o4 + 1] = img.data[k + 1]; out[o4 + 2] = img.data[k + 2]; zb[j] = z;
      return;
    }
    const f = a / 255;
    for (let c = 0; c < 3; c++) {
      const s = ROOM3D_LIN[img.data[k + c]] * f, d = ROOM3D_LIN[out[o4 + c]];
      out[o4 + c] = ROOM3D_SRGB[Math.min(4095, ((mode === "add" ? d + s : d * (1 - f) + s) * 4095) | 0)];
    }
  };
  const quad = (q) => {
    const c = proj(q.p);
    if (c[2] < ROOM3D_NEAR) return;
    const sc = (W / 2) / (C.tx * c[2]), half = q.s * sc * 0.7072;
    const x0 = Math.max(0, Math.floor(c[0] - half)), x1 = Math.min(W - 1, Math.ceil(c[0] + half));
    const y0 = Math.max(0, Math.floor(c[1] - half)), y1 = Math.min(H - 1, Math.ceil(c[1] + half));
    const ca = Math.cos(q.a), sa = Math.sin(q.a), img = q.img, cw = q.cell[2], ch = q.cell[3];
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const X = (px + 0.5 - c[0]) / sc, Y = -(py + 0.5 - c[1]) / sc;
      const qx = X * ca - Y * sa, qy = X * sa + Y * ca, u = qx / q.s + 0.5, v = 0.5 - qy / q.s;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const tx = q.cell[0] + Math.floor(u * cw), ty = q.cell[1] + Math.floor(v * ch);
      put(py * W + px, img, (ty * img.w + tx) * 4, c[2], q.mode);
    }
  };
  const tri = (T) => {
    const a = proj(T.v[0]), b = proj(T.v[1]), c = proj(T.v[2]);
    if (a[2] < ROOM3D_NEAR || b[2] < ROOM3D_NEAR || c[2] < ROOM3D_NEAR) return;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const iz = [1 / a[2], 1 / b[2], 1 / c[2]], F = T.img, Q = T.fp;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const X = px + 0.5, Y = py + 0.5;
      const l0 = ((b[0] - X) * (c[1] - Y) - (b[1] - Y) * (c[0] - X)) / area, l1 = ((c[0] - X) * (a[1] - Y) - (c[1] - Y) * (a[0] - X)) / area, l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const w0 = l0 * iz[0], w1 = l1 * iz[1], w2 = l2 * iz[2], ws = w0 + w1 + w2;
      const fx = Math.floor((w0 * Q[0][0] + w1 * Q[1][0] + w2 * Q[2][0]) / ws), fy = Math.floor((w0 * Q[0][1] + w1 * Q[1][1] + w2 * Q[2][1]) / ws);
      if (fx < 0 || fy < 0 || fx >= F.w || fy >= F.h) continue;
      put(py * W + px, F, (fy * F.w + fx) * 4, 1 / ws, T.mode);
    }
  };
  const depth = (p) => (p[0] - C.ex) * C.fx + (p[1] - C.ey) * C.fy + (p[2] - C.ez) * C.fz;
  const parts = G.parts || [], tris = G.tris || [];
  for (const T of tris) if (T.mode === "cut") tri(T);
  for (const q of parts) if (q.mode === "cut") quad(q);
  const soft = [];
  for (const T of tris) if (T.mode !== "cut") soft.push([depth([(T.v[0][0] + T.v[1][0] + T.v[2][0]) / 3, (T.v[0][1] + T.v[1][1] + T.v[2][1]) / 3, (T.v[0][2] + T.v[1][2] + T.v[2][2]) / 3]), T, 1]);
  for (const q of parts) if (q.mode !== "cut") soft.push([depth(q.p), q, 0]);
  soft.sort((x, y) => y[0] - x[0]);
  for (const s of soft) (s[2] ? tri : quad)(s[1]);
}
// </vfx13-shapes>

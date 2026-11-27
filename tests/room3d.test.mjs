// THE ROOM's engine checks (VFX-DESIGN §61.3, §61.4): room3d.js in Node over the crunchyCore textures.js, texgen.js and
// ramps.js copies beside it, exactly as the 3D view loads them. A synthetic effect (drawn here, deterministic) stands in
// each room in each of the four stands; every picture is hashed, and the hashes are pinned below, so a change to the
// renderer, a room or a pulled texture shows up as a moved hash (re-pin with --print only when the change is MEANT).
// Then what the pictures must show: the light pools where the effect is, the floor and walls hide what is behind them,
// a flat effect lies on the floor, a screen effect covers the view, and the file is pure.
//
//   node tests/room3d.test.mjs            the checks
//   node tests/room3d.test.mjs --print    print the current hashes (to re-pin GOLDEN after a meant change)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console, Math };
vm.createContext(ctx);
for (const f of ["textures.js", "texgen.js", "ramps.js", "room3d.js"]) vm.runInContext(readFileSync(join(root, f), "utf8"), ctx, { filename: f });
const R = vm.runInContext("({ render: room3dRender, place: room3dPlace, view: room3dView, rooms: ROOM3D_ROOMS, room: room3dRoom, tex: room3dTex, build: ROOM3D_BUILD, TEXTURES, clampYaw: room3dClampYaw, eye: room3dEye, YAW: [ROOM3D_YAW_MIN, ROOM3D_YAW_MAX] })", ctx);
const PRINT = process.argv.includes("--print");

let fails = 0, n = 0;
const ok = (name, pass, detail) => { n++; if (!pass) fails++; console.log((pass ? "ok   " : "FAIL ") + name + (pass || !detail ? "" : " — " + detail)); };
const hash = (u8) => { let a = 0x811c9dc5; for (let i = 0; i < u8.length; i++) a = Math.imul(a ^ u8[i], 0x01000193) >>> 0; return ("00000000" + a.toString(16)).slice(-8); };

// THE SYNTHETIC EFFECT: a 48 x 64 frame, a magenta diamond (the body) round a yellow core, rows 5 to 54; placed with its
// origin at the diamond's foot (24, 55), the impact point on the floor, or in its MIDDLE (24, 30), which must be lifted.
function sprite(w, h, fill) {
  // the diamond: centered at (w/2, h/2 - 2), half-width w/2, half-height h/2 - 6, so its rows run 5 .. h-10 (its foot at h-9)
  const d = new Uint8ClampedArray(w * h * 4), hx = w / 2, hy = h / 2 - 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, q = Math.abs(x + 0.5 - w / 2) / hx + Math.abs(y + 0.5 - (h / 2 - 2)) / hy;
    if (q <= 1) { d[o] = 255; d[o + 1] = q < 0.35 ? 230 : 0; d[o + 2] = q < 0.35 ? 40 : 255; d[o + 3] = 255; }
    else if (fill) { d[o] = fill[0]; d[o + 1] = fill[1]; d[o + 2] = fill[2]; d[o + 3] = 255; }
  }
  return { w, h, data: d };
}
const F = sprite(48, 64);
const LIGHT = { color: [1, 0.5, 0.2], energy: 6, range: 6 };
const magenta = (pic) => { let c = 0; for (let i = 0; i < pic.data.length; i += 4) if (pic.data[i] === 255 && pic.data[i + 1] === 0 && pic.data[i + 2] === 255) c++; return c; };

// 1. every room, every stand: a picture of the right size, opaque, the same twice, and pinned
const GOLDEN = {
  "dungeon/none": "4947fa55", "dungeon/face": "291080a9", "dungeon/upright": "df99ae99",
  "dungeon/flat": "b3896cbe", "dungeon/screen": "0e7da5dd",
  "meadow/none": "3b013a8d", "meadow/face": "3f24bcad", "meadow/upright": "9f8d9f75",
  "meadow/flat": "1762f69d", "meadow/screen": "a01c2b85",
  "deck/none": "0227dd84", "deck/face": "a781da96", "deck/upright": "0b905075",
  "deck/flat": "21f6cb52", "deck/screen": "51968d18",
  "hall/none": "35f0ffdd", "hall/face": "6f5c4146", "hall/upright": "db0f18b9",
  "hall/flat": "29e627fa", "hall/screen": "5171a5cd",
};
const got = {};
for (const room of R.rooms) {
  for (const stand of ["none", "face", "upright", "flat", "screen"]) {
    const P = stand === "none" ? null : R.place([F], stand, 0.025, { x: 24, y: 55 });
    const o = { room: room.id, place: P, frame: P ? F : null, light: P ? LIGHT : null };
    const a = R.render(o), b = R.render(o);
    let opaque = true;
    for (let i = 3; i < a.data.length; i += 4) if (a.data[i] !== 255) { opaque = false; break; }
    const key = room.id + "/" + stand;
    got[key] = hash(a.data);
    ok("render/" + key + "/320x200-opaque-and-deterministic", a.w === 320 && a.h === 200 && a.data.length === 320 * 200 * 4 && opaque && got[key] === hash(b.data));
  }
}
if (PRINT) console.log(JSON.stringify(got, null, 2));
const pinned = Object.keys(GOLDEN).filter((k) => GOLDEN[k]);
ok("render/hashes-pinned-for-every-room-and-stand", pinned.length === Object.keys(GOLDEN).length, (Object.keys(GOLDEN).length - pinned.length) + " not pinned (run with --print)");
for (const k of pinned) ok("render/hash/" + k, got[k] === GOLDEN[k], got[k] + " vs pinned " + GOLDEN[k]);

// 2. the rooms' textures are real (texgen.js drew the recipe ones: more than one color in each 32 x 32 period)
for (const room of R.rooms) for (const part of ["floor", "wall", "side"]) {
  const spec = room[part];
  if (!spec) continue;
  const T = R.tex(spec, 1), seen = new Set();
  for (let i = 0; i < T.length; i += 3) seen.add(T[i] + "," + T[i + 1] + "," + T[i + 2]);
  ok("rooms/" + room.id + "/" + part + "/" + spec.tex + "-draws", R.TEXTURES.indexOf(spec.tex) >= 0 && seen.size >= 3, seen.size + " colors");
}
ok("rooms/four-rooms-unknown-id-falls-back", R.rooms.length === 4 && R.room("nope") === R.rooms[0] && new Set(R.rooms.map((r) => r.id)).size === 4);

// 3. placement: the impact point on the floor; a burst centered on its origin is lifted until its foot touches it
const footP = R.place([F], "face", 0.025, { x: 24, y: 55 }), midP = R.place([F], "face", 0.025, { x: 24, y: 30 });
ok("place/impact-point-on-the-floor", footP.lift === 0 && footP.box.y0 === 5 && footP.box.y1 === 55, JSON.stringify(footP.box));
ok("place/centered-burst-lifted-to-its-foot", midP.foot >= 50 && midP.foot <= 55 && Math.abs(midP.lift - (midP.foot - 30) * 0.025) < 1e-9, midP.foot + " " + midP.lift);
// a few bits flung to the frame's foot do not hoist it: one stray pixel row at the bottom leaves the foot where it was
const stray = { w: F.w, h: F.h, data: F.data.slice() }; for (const x of [3, 40]) stray.data.set([255, 0, 255, 255], ((F.h - 1) * F.w + x) * 4);
ok("place/stray-bits-do-not-hoist-it", R.place([stray], "face", 0.025, { x: 24, y: 30 }).lift === midP.lift && R.place([stray], "face", 0.025, { x: 24, y: 30 }).box.y1 === F.h);
ok("place/flat-lies-on-the-floor", R.place([F], "flat", 0.025, { x: 24, y: 32 }).lift === 0.01);
ok("place/light-at-the-middle-of-what-is-drawn", Math.abs(footP.light[1] - (55 - (5 + footP.foot) / 2) * 0.025) < 1e-9 && footP.light[0] === 0, String(footP.light));

// 4. the light pools on the floor round the effect, in its color; no light, no pool
const at = (pic, x, y) => { const o = (y * pic.w + x) * 4; return [pic.data[o], pic.data[o + 1], pic.data[o + 2]]; };
const lum = (c) => c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1;
const V = R.view(footP);
const lit = R.render({ room: "dungeon", place: footP, frame: F, light: LIGHT });
const dark = R.render({ room: "dungeon", place: footP, frame: F, light: { color: [1, 0.5, 0.2], energy: 0, range: 6 } });
const red = R.render({ room: "dungeon", place: footP, frame: F, light: { color: [1, 0, 0], energy: 6, range: 6 } });
const blue = R.render({ room: "dungeon", place: footP, frame: F, light: { color: [0, 0, 1], energy: 6, range: 6 } });
// the floor just in front of the effect's foot: the bottom middle of the picture, below the sprite
let sumLit = 0, sumDark = 0, rr = 0, rb = 0, bb = 0, br = 0;
for (let y = 150; y < 175; y++) for (let x = 140; x < 180; x++) {
  sumLit += lum(at(lit, x, y)); sumDark += lum(at(dark, x, y));
  rr += at(red, x, y)[0]; rb += at(red, x, y)[2]; bb += at(blue, x, y)[2]; br += at(blue, x, y)[0];
}
ok("light/pools-on-the-floor", sumLit > sumDark * 2.5, Math.round(sumLit) + " vs " + Math.round(sumDark));
ok("light/takes-the-effects-color", rr > rb * 2 && bb > br * 2, [rr, rb, bb, br].join(" "));
const far = R.render({ room: "dungeon", place: footP, frame: F, light: { color: [1, 0.5, 0.2], energy: 6, range: 0.5 } });
let sumFar = 0; for (let y = 150; y < 175; y++) for (let x = 140; x < 180; x++) sumFar += lum(at(far, x, y));
ok("light/stops-at-its-range", Math.abs(sumFar - sumDark) < sumDark * 0.05 + 50, Math.round(sumFar) + " vs " + Math.round(sumDark));
ok("light/view-frames-the-effect", V.ty > 0.5 && V.dist >= 2.4 && magenta(lit) > 1500, JSON.stringify(V) + " " + magenta(lit));

// 5. depth: the floor hides what is under it (the same sprite unlifted loses its lower half), the sprite hides the room
const sunk = Object.assign({}, midP, { lift: 0 });
const shownFull = magenta(R.render({ room: "deck", place: midP, frame: F, yaw: 0.55, pitch: 0.22 }));
const shownSunk = magenta(R.render({ room: "deck", place: sunk, frame: F, yaw: 0.55, pitch: 0.22, ty: R.view(midP).ty, dist: R.view(midP).dist }));
ok("depth/the-floor-hides-what-is-under-it", shownSunk > 0 && shownSunk < shownFull * 0.75, shownSunk + " of " + shownFull);
// from behind the back wall it is culled (seen from outside), so the effect still shows; inside, a wall in front hides it
const behind = magenta(R.render({ room: "dungeon", place: footP, frame: F, yaw: Math.PI, pitch: 0.22 }));
ok("depth/a-wall-seen-from-behind-is-not-drawn", behind > 1000, String(behind));

// 6. the stands: face turns to the camera's tilt, upright keeps its up, flat lies down, screen covers the view
const high = { yaw: 0.55, pitch: 1.1 };
const nFace = magenta(R.render(Object.assign({ room: "hall", place: footP, frame: F }, high)));
const nUp = magenta(R.render(Object.assign({ room: "hall", place: R.place([F], "upright", 0.025, { x: 24, y: 55 }), frame: F }, high)));
ok("stand/upright-is-foreshortened-from-above-face-is-not", nUp < nFace * 0.75 && nUp > 0, nUp + " vs " + nFace);
const flatP = R.place([F], "flat", 0.025, { x: 24, y: 32 });
const nFlatHigh = magenta(R.render({ room: "hall", place: flatP, frame: F, yaw: 0.55, pitch: 1.1 }));
const nFlatLow = magenta(R.render({ room: "hall", place: flatP, frame: F, yaw: 0.55, pitch: 0.05 }));
ok("stand/flat-lies-on-the-floor", nFlatHigh > 0 && nFlatLow < nFlatHigh * 0.3, nFlatLow + " vs " + nFlatHigh);
const full = { w: 16, h: 10, data: new Uint8ClampedArray(16 * 10 * 4).map((v, i) => [10, 200, 30, 255][i % 4]) };
const scr = R.render({ room: "meadow", place: R.place([full], "screen", 0.025, { x: 8, y: 5 }), frame: full });
let green = 0; for (let i = 0; i < scr.data.length; i += 4) if (scr.data[i + 1] === 200 && scr.data[i] === 10) green++;
ok("stand/screen-covers-the-view", green === 320 * 200, green + " px");
const half = { w: 2, h: 1, data: new Uint8ClampedArray([255, 0, 0, 128, 255, 0, 0, 0]) };
const scrH = R.render({ room: "meadow", place: R.place([half], "screen", 0.025, { x: 1, y: 0 }), frame: half });
const bare = R.render({ room: "meadow", place: R.place([half], "screen", 0.025, { x: 1, y: 0 }), frame: null });
ok("stand/screen-blends-its-alpha", at(scrH, 10, 100)[0] > at(bare, 10, 100)[0] && at(scrH, 10, 100)[0] < 255 && at(scrH, 300, 100).join() === at(bare, 300, 100).join());
const cut = { w: 1, h: 1, data: new Uint8ClampedArray([255, 0, 255, 127]) };
ok("stand/sprites-cut-their-alpha-at-a-half", magenta(R.render({ room: "deck", place: R.place([F], "face", 0.6, { x: 0, y: 0 }), frame: cut })) === 0);

// 6b. what the export decides, the room takes (fx3d.js via index.html): the alpha mode, a flat effect's depth, the light's place
const soft = { w: F.w, h: F.h, data: F.data.map((v, i) => (i % 4 === 3 && v ? 100 : v)) };
const softCut = R.place([soft], "face", 0.025, { x: 24, y: 55 }), softBlend = R.place([soft], "face", 0.025, { x: 24, y: 55 }, { alpha: "blend" });
const picCut = R.render({ room: "deck", place: softCut, frame: soft }), picBlend = R.render({ room: "deck", place: softBlend, frame: soft });
const bare3 = R.render({ room: "deck", place: softCut, frame: null });
let tinted = 0, cutDiff = 0;
for (let i = 0; i < picBlend.data.length; i += 4) {
  if (picBlend.data[i] > bare3.data[i] + 20 && picBlend.data[i] < 255) tinted++;
  if (picCut.data[i] !== bare3.data[i]) cutDiff++;
}
ok("export/blend-lays-a-soft-sprite-over-the-room", softBlend.alpha === "blend" && tinted > 1000, String(tinted));
ok("export/cut-drops-a-soft-sprite", softCut.alpha === "cut" && cutDiff === 0, String(cutDiff));
const flat1 = R.place([F], "flat", 0.025, { x: 24, y: 30 }), flat2 = R.place([F], "flat", 0.025, { x: 24, y: 30 }, { depth: 2 });
const nf1 = magenta(R.render({ room: "hall", place: flat1, frame: F, yaw: 0.55, pitch: 1.2 })), nf2 = magenta(R.render({ room: "hall", place: flat2, frame: F, yaw: 0.55, pitch: 1.2 }));
ok("export/flat-depth-stretches-it-along-the-floor", flat2.depth === 2 && R.place([F], "face", 0.025, { x: 24, y: 30 }, { depth: 2 }).depth === 1 && nf2 > nf1 * 1.6, nf1 + " -> " + nf2);
const lp = R.place([F], "face", 0.025, { x: 24, y: 30 }, { light: [0.1, 0.4, 0] });
ok("export/the-light-hangs-where-the-scene-hangs-it", lp.light[0] === 0.1 && Math.abs(lp.light[1] - (0.4 + lp.lift)) < 1e-12 && lp.light[2] === 0 &&
   R.place([F], "flat", 0.025, { x: 24, y: 30 }, { light: [0, 0.3, 0.2] }).light.join() === "0,0.3,0.2");

// 6c. the orbit's range: anywhere in it, at any tilt and zoom, the walls are behind the effect: looking down any column
// of the picture, the void (a room whose dark is pure magenta here) is only ABOVE the walls, never beside or under them
const voidRoom = Object.assign({}, R.room("dungeon"), { bg: [255, 0, 255] });
const isVoid = (d, o) => d[o] >= 248 && d[o + 1] <= 8 && d[o + 2] >= 248;
const leaks = [];
for (const yaw of [R.YAW[0], (R.YAW[0] + R.YAW[1]) / 2, R.YAW[1]]) for (const pitch of [0.02, 0.22, 1.2]) for (const dist of [2.6, 6, 11]) {
  const pic = R.render({ room: voidRoom, yaw, pitch, dist, ty: 1 });
  let bad = 0;
  for (let x = 0; x < pic.w; x++) {
    let solid = false;
    for (let y = 0; y < pic.h; y++) { const v = isVoid(pic.data, (y * pic.w + x) * 4); if (!v) solid = true; else if (solid) bad++; }
  }
  if (bad) leaks.push([yaw.toFixed(2), pitch, dist, bad].join("/"));
}
ok("orbit/the-walls-stay-behind-it-across-the-range", leaks.length === 0, leaks.join(" "));
ok("orbit/yaw-is-kept-in-range", R.clampYaw(-3) === R.YAW[0] && R.clampYaw(9) === R.YAW[1] && R.clampYaw(0.7) === 0.7 && R.clampYaw(NaN) === R.YAW[0]);
const E1 = R.eye(footP), E2 = R.eye(footP, 1.5);
ok("orbit/eye-height-is-1.6-m", Math.abs(E1.ty + Math.sin(E1.pitch) * E1.dist - 1.6) < 1e-9 && Math.abs(E2.ty + Math.sin(E2.pitch) * E2.dist - 1.6) < 1e-9 &&
   Math.abs(E2.dist - E1.dist * 1.5) < 1e-9 && E1.dist >= 2.5, JSON.stringify(E1));
ok("orbit/eye-height-sees-the-effect", magenta(R.render(Object.assign({ room: "dungeon", place: footP, frame: F, yaw: 0.55 }, E1))) > 1000);

// 7. pure: no DOM, no window, no storage; every top-level name is room3d* / ROOM3D_*
const src = readFileSync(join(root, "room3d.js"), "utf8").replace(/\/\/.*$/gm, "");
ok("pure/no-dom-window-or-storage", !/\b(document|window|localStorage|sessionStorage|navigator|fetch)\b/.test(src));
const tops = [...src.matchAll(/^(?:function|const|let|var)\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]);
ok("pure/top-level-names-prefixed", tops.length > 5 && tops.every((t) => /^(room3d|ROOM3D_)/.test(t)), tops.filter((t) => !/^(room3d|ROOM3D_)/.test(t)).join(", "));
ok("pure/build-stamp", R.build === 1);

console.log((fails ? "FAIL " : "PASS ") + (n - fails) + "/" + n);
process.exit(fails ? 1 : 0);

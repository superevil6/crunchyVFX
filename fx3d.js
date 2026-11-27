"use strict";
// CrunchyVFX — EFFECTS IN 3D (VFX-DESIGN §61, VFX 1.3). PURE: no document, no window, no storage; every top-level name
// is fx3d* / FX3D_*. The rule: a 3D effect is the 2D effect standing in a room. The same frames, the same SpriteFrames,
// the same script API; 3D adds only PLACEMENT (how it stands, how big it is, where its foot is) and a LIGHT whose energy
// follows the frames. This file says those four things about an effect, and writes the Godot 3D scene's text from them
// (index.html hands it the frames' emissive masks and the 2D scene's own script, so the two scripts can never drift).
//
//   fx3dStand(st, name?)          "face" | "upright" | "flat" | "screen": d3Stand, or "auto" resolved (FX3D_AUTO_STAND by
//                                 the preset's name, else the nearest shipped preset, else the effect's systems)
//   fx3dMetersPerPixel(st, bounds?, name?)   meters per frame pixel: d3Size (the longer side of what is DRAWN, in
//                                 meters) or the auto size for its stand (fx3dAutoSize); `bounds` = fx3dBounds(masks)
//   fx3dSize(st, bounds?, name?)  that longer side in meters ({ m, auto }), for a readout
//   fx3dLight(st, masks, fps)     { on, color: [r,g,b] 0..1, energies: one per frame 0..peak, range, peak, center }
//   fx3dOrigin(st, r, fit?)       the emitter (the impact point) in frame pixels: index.html effectOriginPx's math
//   fx3dBounds(masks)             the drawn pixels' box over every frame (a foot for an upright effect)
//   fx3dLightPos(stand, bounds, anchor, mpp, depth)   where the light hangs from the node (the room uses it too)
//   fx3dAlphaMode(masks)          "cut" (pixel art: alpha_cut discard) or "blend" (soft glow and smoke)
//   fx3dFlatDepth(st)             how far a flat effect drawn squashed is stretched back to round along the floor
//
// Loads after vfx.js (frameDims, renderPrep) and is read by index.html's export and the 3D preview. PRESETS and PARAMS
// are read at call time only, so the file stands alone in a test.

// d3Stand's values, by index (APPEND-ONLY: the index is stored in links and saved effects). 0 = auto.
var FX3D_STANDS = ["auto", "face", "upright", "flat", "screen"];
// what the editor's select shows for each (no console or engine names)
var FX3D_STAND_WORDS = ["Auto", "Faces you", "Upright", "Flat on the ground", "On the screen"];
// in a sentence ("it stands …"), for the panel note, the export note and the README
var FX3D_STAND_SAY = { face: "faces the camera", upright: "stands upright, turning to face you", flat: "lies flat on the ground",
                       screen: "plays on the screen (a 3D game puts it on the camera)" };
// d3Light's values (APPEND-ONLY)
var FX3D_LIGHTS = ["auto", "off", "always"];
var FX3D_LIGHT_WORDS = ["Auto (from its glow)", "Off", "Always (its own color)"];
// The old fixed scale (0.025 m per frame pixel), kept for what has no drawing to measure. The AUTO SIZE (1.3.1, the
// persona test: a 192 px torch came out 4.8 m) sizes what is DRAWN to a believable size for how it stands.
var FX3D_AUTO_MPP = 0.025;
// the longer side of what is drawn, in meters: [base, least, most] per stand (a hit or a pickup over a head, a torch or a
// portal on the floor, a circle on the ground); a bigger frame is a somewhat bigger effect (sqrt of frame / 128 px)
var FX3D_AUTO_SIZE = { face: [1.3, 0.7, 3.0], upright: [1.6, 1.0, 2.2], flat: [2.4, 1.6, 3.2], screen: [1.3, 0.7, 3.0] };
// STRIKES AND BEAMS are long: about 3 m on their long side whatever their stand (1.3.1: Pixel Lightning came out a thin
// 1.3 m bolt in the middle of the room). By name, then by what draws them (a pixel bolt, electric arcs, a beam).
var FX3D_STRIKES = ["Pixel Lightning", "Lightning Zap", "Chain Lightning", "Tesla Coil", "Pixel Zap", "Pixel Arc", "Laser",
                    "Magic Bolt", "Spear Thrust", "Pixel Laser", "Searchlight", "Static Charge"];
var FX3D_STRIKE_SIZE = [3.0, 2.4, 3.6];

// ---------- AUTO: how each shipped preset stands (§61.1) ----------
// ONE TABLE, every shipped preset in exactly one list (the engine suite asserts it, so a new preset must be placed here):
//   upright  fires, columns, portals, rising heals: they keep their up when the camera looks down (a Y billboard)
//   flat     rings and marks on a floor, drawn as seen from above or squashed into an ellipse (it is un-squashed lying
//            down, fx3dFlatDepth): a summoning circle, a ripple, a crack web; a mark with smoke or debris rising off it
//            stands upright instead (lying down, its smoke smears across the floor)
//   screen   weather, camera and light, atmosphere: a 3D game puts rain on the camera, not on one billboard
//   face     everything else: impacts, explosions, magic, pickups, emotes, numbers, status over a head
var FX3D_AUTO_STAND = {
  face: [
    "Explosion", "Big Boom", "Shockwave", "Fire Jet", "Split Shot", "Spark Shower", "Lens Burst", "Triple Tap",
    "Disintegrate", "Jet Exhaust", "Blast Shell", "Sonic Pulse", "Cannon Blast", "Bomb Blast", "Solar Flare",
    "Ice Blast", "Frost Nova", "Freeze Solid", "Icicle Drop", "Laser", "Magic Bolt", "Sword Slash", "Comet Arc",
    "Chain Lightning", "Comet Trail", "Neon Streaks", "Glass Shatter", "Ice Shatter", "Impact Lines", "Spear Thrust",
    "Comic Pow", "Arrow Shot", "Slime Blob", "Firework", "Glitch Out", "Goo Split", "Comet Path", "Sun Glint",
    "Corrupt Blip", "Searchlight", "Rift Split", "Hit Spark", "Muzzle Flash", "Slash", "Twin Slash", "Critical Hit",
    "Dust Kick", "Blood Splat", "Paint Splatter", "Slash Gash", "Bouncing Debris", "Rubble Drop", "Cog Burst",
    "Whip Crack", "Hit Flash", "Landing Puff", "Speed Dash", "Crit Pop", "Whip Pan", "Katana Cut", "Sword Clash",
    "Rock Slide", "Ninja Strike", "Axe Chop", "Perfect Parry", "Death Poof", "Dash Trail", "Jump Dust", "Crit Burst",
    "Skull Puff", "Magic Sparkle", "Lightning Zap", "Summon Swirl", "Teleport", "Poison Cloud", "Shield Orbit",
    "Power Rings", "Constellation", "Nano Swarm", "Vacuum Pull", "Soul Drain", "Shield Hex", "Spirit Wisps",
    "Tentacle Lash", "Static Charge", "Tesla Coil", "Overcharge", "Cursed Halo", "Boo!", "Web Snare",
    "Treasure Unlock", "Coin Pickup", "Pixel Burst", "Charm Hearts", "Confetti", "Twinkle", "Confetti Toss",
    "Flower Bloom", "Garden Burst", "Coin Fountain", "Candy Shower", "Crown Victory", "Egg Hatch", "Magnet Pull",
    "Coin Burst", "Gem Pickup", "Trophy Win", "Emote Pop", "Emoji Burst", "Speech Pop", "Damage Number",
    "Music Notes", "Heartbreak", "Stun Stars", "Sleepy Zzz", "Sweat Drop", "Alert Pop", "Talk Bubble", "Prompt Pop",
    "Fireflies", "Leaf Swirl", "Firefly Swarm", "Bird Flock", "Shield Up", "Poisoned", "Target Lock", "Speed Boost",
    "Time Slow", "Magnetized", "Hazard Alert", "Curse Mark", "Rally Banner", "Atom Charge", "Muzzle Cone",
    "Mandala Burst", "Snow Mandala", "Backlit Burst", "Hit Blank", "Galaxy Spin", "Charge Release", "Meteor Hit",
    "Deep Freeze", "Bloom Cycle", "Sonar Sweep", "Smoke Puff", "Water Splash", "Splash Down", "Lava Bubble",
    "Spirit Lights", "Fireball", "Energy Bolt", "Arrow Trail", "Frost Shot", "Pixel Explosion", "Big Pixel Boom",
    "Blood Spurt", "Slime Spurt", "Pixel Poof", "Ring Burst", "Pixel Dust", "Pixel Spark", "Pixel Muzzle",
    "Pixel Splash", "Pixel Glint", "Pixel Slash", "Pixel Zap", "Pixel Fireball", "Pixel Bubbles",
    "Pixel Arc", "Pixel Holy Burst", "Pixel Halo", "Pixel Shadow Burst", "Pixel Dark Orb", "Pixel Ice Shards",
    "Pixel Frost Nova", "Pixel Charge", "Pixel Gust", "Pixel Rock Burst", "Pixel Toxic Puff", "Pixel Hit Flash",
    "Pixel Dash", "Pixel Shield", "Pixel Wisps", "Pixel Meteor", "Pixel Run Dust", "Pixel Coin", "Pixel Gem Sparkle",
    "Pixel Heart Pickup", "Pixel Button Sparkle", "Pixel Confirm", "Pixel Crit Star", "Pixel Shield Hit",
    "Pixel Appear", "Pixel Sweat Drop", "Pixel Hearts", "Pixel Laser", "Pixel Ring Blast", "Pixel Swoosh",
    "Pixel Impact Rays", "Pixel Muzzle Rays", "Pixel Twin Swoosh", "Pixel Energy Shield", "Pixel Spinner",
    "Pixel Fireflies", "Pixel Damage Number", "Pixel Heal Number", "Pixel Score Pop", "Pixel Crit Text", "Pixel Miss",
    "Pixel KO", "Pixel Alert", "Pixel Question", "Pixel Sleepy", "Pixel Music Notes", "Pixel Anger",
    "Pixel Skull Rise", "Pixel Pow", "Pixel Disintegrate", "Pixel Ghost Fade", "Pixel Burn Away", "Pixel Warp Out",
    "Pixel Underwater", "Pixel Ghosts", "Pixel Gem Burst", "Pixel Flower Burst", "Pixel Bone Burst",
  ],
  upright: [
    // marks on the ground with smoke or debris rising off them stand upright on their foot: lying flat, the smoke of a
    // Scorch Mark was a long smear across the floor (judged in the renders, §61.4)
    "Scorch Mark", "Ground Slam",
    // a bolt from the sky stands on its foot, so its strike reaches the floor (1.3.1)
    "Pixel Lightning",
    "Ember Rise", "Portal", "Teleport Out", "Slime Drip", "Molten Drip", "Heal Rise", "Aura Loop", "Spirit Aura",
    "Potion Brew", "Soul Rise", "Spirit Release", "Heal Pulse", "Heart Heal", "Dimension Tear", "Warp Tunnel",
    "Portal Depth", "Level Up", "Tornado Spin", "Burning", "Portal Open", "Summon Ritual", "Rift Tear", "Steam",
    "Heat Shimmer", "Campfire Smoke", "Torch Flicker", "Pixel Heal", "Pixel Teleport", "Pixel Campfire",
    "Pixel Smolder", "Pixel Torch", "Pixel Dust Devil", "Pixel Level Up", "Pixel Portal", "Pixel Waterfall",
    "Pixel Warp Rings", "Pixel Dream Portal", "Pixel Bonfire", "Pixel Torch Flame", "Pixel Burning Ground",
    "Pixel Spirit Fire", "Pixel Wall of Fire", "Pixel Smoke Column", "Pixel Heat Shimmer",
  ],
  flat: [
    "Cracks", "Summon Circle", "Water Ripple", "Sonar Ping", "Glass Web", "Radar Sweep", "Rune Circle", "Summon Seal",
    "Summon Grid", "Frost Growth", "Pixel Slam", "Pixel Shockwave", "Pixel Summon", "Pixel Lava Pool",
    // its debris falls far below the crack, so standing on its foot (the bottom of all it draws) it floated: it lies down
    "Ground Crack",
  ],
  screen: [
    "Focus Lines", "Rain", "Snow", "Leaf Fall", "Petal Fall", "Downpour", "Ash Fall", "Spore Drift", "Feather Fall",
    "Warp Speed", "Punch In", "Star Filter", "Signal Lost", "Dream Drift", "Searchbeam", "Cathedral Light",
    "Rift Light", "Rain On Glass", "Glint Field", "Sonar Motes", "Old Broadcast", "Dust Motes", "Pixel Rain",
    "Pixel Snow", "Pixel Blizzard", "Pixel Falling Leaves", "Pixel Embers", "Pixel Ash Fall", "Pixel Sandstorm",
    "Pixel Meteor Shower", "Pixel Dust Motes", "Pixel Spores", "Pixel Snowflakes",
  ],
};

var fx3dAutoByName = null;
function fx3dAutoOf(name) {
  if (!fx3dAutoByName) {
    fx3dAutoByName = {};
    for (const k in FX3D_AUTO_STAND) for (const n of FX3D_AUTO_STAND[k]) fx3dAutoByName[n] = k;
  }
  return Object.prototype.hasOwnProperty.call(fx3dAutoByName, name) ? fx3dAutoByName[name] : null;
}

// The shipped preset an effect still IS: an edited one (a new hue, a bigger count), or one the CLI renamed. The share of
// the rows either sets that differ; a quarter or less is the same effect. A Wizard composition is usually none (null).
// Rows of the 3D group and the seed never count. Remembered for the last state asked about (the preview asks often).
var fx3dNearestMemo = { key: null, name: null };
function fx3dNearestPreset(st) {
  if (typeof PRESETS === "undefined" || typeof PARAMS === "undefined" || !st) return null;
  const rows = PARAMS.filter((p) => p[7] !== "3D" && p[0] !== "seed");
  const key = rows.map((p) => (p[0] in st ? st[p[0]] : p[5])).join(",");
  if (fx3dNearestMemo.key === key) return fx3dNearestMemo.name;
  let best = null, bestD = Infinity;
  for (const name in PRESETS) {
    const P = PRESETS[name];
    let diff = 0, n = 0;
    for (const p of rows) {
      const k = p[0], want = k in P ? P[k] : p[5], have = k in st ? st[k] : p[5];
      const same = Math.abs(+have - +want) <= 1e-6;
      if (!(k in P) && same) continue;            // a row neither of them sets
      n++;
      if (!same) diff++;
    }
    const d = n ? diff / n : 1;
    if (d < bestD) { bestD = d; best = name; }
  }
  fx3dNearestMemo = { key: key, name: bestD <= 0.25 ? best : null };
  return fx3dNearestMemo.name;
}

// THE RULE for an effect of your own (no shipped preset in it): by what draws it. Weather and the whole-frame camera
// systems on the screen; a ring or mark drawn on a floor flat; fire and portals upright; the rest faces you.
function fx3dStandRule(st) {
  const on = (k) => +st[k] > 0;
  const areaPix = on("pix") && Math.round(st.pixEmit) === 6 && on("pixLoop");     // PIX_EMITS "area", looping: pixel weather
  if (on("weather") || on("drops") || on("zoom") || on("scan") || areaPix) return "screen";
  if (on("pix") && on("pixFire")) return "upright";
  if (on("sigil") || on("ripple") || on("fracture") || on("growth") || on("grid") ||
      (on("vortex") && +st.vortexSquash >= 0.75) || (on("pix") && +st.pixFlat >= 0.7)) return "flat";
  if (on("vortex") || on("tunnel") || on("rift")) return "upright";
  return "face";
}

// HOW IT STANDS: the person's choice, else auto (the table by name, the nearest shipped preset, the rule)
function fx3dStand(st, name) {
  const v = Math.round(+(st && st.d3Stand) || 0);
  if (v >= 1 && v < FX3D_STANDS.length) return FX3D_STANDS[v];
  const byName = name ? fx3dAutoOf(String(name)) : null;
  if (byName) return byName;
  const near = fx3dNearestPreset(st);
  if (near && fx3dAutoOf(near)) return fx3dAutoOf(near);
  return fx3dStandRule(st);
}

// A FLAT effect drawn squashed (an ellipse in 2D is a circle on a floor seen from the side) is stretched back to round
// along the floor's depth: 1 / the squash its ground system was drawn with (the renderer's own factors, vfx.js and
// pixart.js); 1 when nothing is squashed. The strongest squash wins; capped at 4x.
function fx3dFlatDepth(st) {
  const on = (k) => +st[k] > 0;
  const r = [1];
  if (on("decal")) r.push(1 - +st.decalSquash * 0.9);
  if (on("sigil")) r.push(1 - +st.sigilSquash * 0.85);
  if (on("vortex")) r.push(1 - +st.vortexSquash * 0.85);
  if (on("ripple")) r.push(1 - +st.rippleSquash * 0.85);
  if (on("sweep")) r.push(1 - +st.sweepSquash * 0.85);
  if (on("grid")) r.push(1 - Math.max(0, Math.min(1, +st.gridTilt)) * 0.88);
  if (on("wave") && on("waveSquash")) r.push(1 - +st.waveSquash * 0.85);
  if (on("pix") && on("pixFlat")) r.push(1 - 0.65 * Math.max(0, Math.min(1, +st.pixFlat)));
  const m = Math.min.apply(null, r.filter((x) => isFinite(x)));
  return +(1 / Math.max(0.25, m)).toFixed(4);
}

// METERS PER FRAME PIXEL: d3Size is the frame's longer side in meters (0 = auto)
// The moments the effect is for (its preset's, by name or the nearest shipped one): explosions are bigger, pickups smaller.
function fx3dMoments(st, name) {
  const P = typeof PRESETS === "undefined" ? null : PRESETS[name] ? PRESETS[name] : PRESETS[fx3dNearestPreset(st)];
  return P && Array.isArray(P.moments) ? P.moments : [];
}
// a strike or a beam: by name, the nearest shipped preset, else a pixel bolt emitter, electric arcs or a beam
function fx3dIsStrike(st, name) {
  const near = name && fx3dAutoOf(String(name)) ? String(name) : fx3dNearestPreset(st);
  if (near && fx3dAutoOf(near)) return FX3D_STRIKES.indexOf(near) >= 0;
  return (+st.pix > 0 && Math.round(st.pixEmit) === 5) || +st.arc > 0 || +st.beam > 0;
}
// AUTO SIZE: the longer side of what is drawn, in meters
function fx3dAutoSize(st, name) {
  const sd = fx3dStand(st, name), T = fx3dIsStrike(st, name) ? FX3D_STRIKE_SIZE : FX3D_AUTO_SIZE[sd] || FX3D_AUTO_SIZE.face;
  const d = typeof frameDims === "function" ? frameDims(st) : { w: 128, h: 128 };
  const k = Math.max(0.85, Math.min(1.4, Math.sqrt(Math.max(d.w, d.h) / 128)));
  const ms = fx3dMoments(st, name);
  const boost = ms.indexOf("explosion") >= 0 ? 1.7 : ms.indexOf("pickup") >= 0 ? 0.75 : 1;
  return +Math.max(T[1], Math.min(T[2], T[0] * k * boost)).toFixed(2);
}
// The drawn box's longer side in frame pixels (no box: four fifths of the frame, what Fit leaves drawn)
function fx3dDrawnPx(st, bounds) {
  if (bounds) return Math.max(1, bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1);
  const d = typeof frameDims === "function" ? frameDims(st) : { w: 128, h: 128 };
  return Math.max(d.w, d.h) * 0.8;
}
function fx3dSize(st, bounds, name) {
  const auto = !(+st.d3Size > 0);
  return { m: auto ? fx3dAutoSize(st, name) : +st.d3Size, auto: auto };
}
function fx3dMetersPerPixel(st, bounds, name) {
  return fx3dSize(st, bounds, name).m / fx3dDrawnPx(st, bounds);
}

// THE EMITTER in frame pixels: renderPrep's own transform (Fit's centering, or the origin kept at its fraction of the
// frame), exactly as the frames were drawn; the frame's center if the render kept no sim. `fit`: the render's Fit
// (default: r.fit when the caller kept it there, else on, the app's default).
function fx3dOrigin(st, r, fit) {
  const f = fit !== undefined ? !!fit : r && r.fit !== undefined ? !!r.fit : true;
  try {
    const p = renderPrep(st, { fit: f, sim: r.sim, w: r.w, h: r.h });
    const x = st.originX * p.sim.fs * p.k + p.dx, y = st.originY * p.sim.fs * p.k + p.dy;
    if (isFinite(x) && isFinite(y)) return { x: x, y: y };
  } catch (e) { /* no sim kept: center */ }
  return { x: r.w / 2, y: r.h / 2 };
}

// The box of every drawn pixel over all frames ({ x0, y0, x1, y1 } inclusive, in the masks' pixels), null when empty.
// The emissive masks keep every pixel's alpha (only the color of what does not glow goes black), so they say this too.
function fx3dBounds(masks) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const m of masks || []) {
    const d = m.data, w = m.w;
    for (let p = 0, n = m.w * m.h; p < n; p++) {
      if (d[p * 4 + 3] < 8) continue;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
}

// Soft edges or hard ones: pixel art is all-or-nothing alpha and draws best cut (no sorting, depth written); a smooth
// effect's glow and smoke are mostly see-through pixels a cut would turn to blocks, so they blend. The share of drawn
// pixels that are partly see-through decides.
function fx3dAlphaMode(masks) {
  let drawn = 0, soft = 0;
  for (const m of masks || []) {
    const d = m.data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 8) continue;
      drawn++;
      if (d[i] < 240) soft++;
    }
  }
  return drawn && soft / drawn > 0.12 ? "blend" : "cut";
}

// THE LIGHT (§61.1): from the frames' EMISSIVE pixels (index.html emissiveFrames: the mask the sheet export makes).
// Per frame the glowing coverage (each pixel's luminance x alpha, summed); energies = that over the effect's peak, times
// the peak energy, which grows with the root of the glowing area in square meters (and d3LightPower). Color: the mean of the
// glowing pixels weighted by brightness and saturation (the plan's "brightest third" lit an Explosion white and a portal
// near-white; this keeps the fire orange and the portal violet), brought up to full strength (the energy carries the
// brightness). Range: from
// the frame's size. Smoke, blood, ink and dust have no glowing pixels: no light. Deterministic: the same masks, the
// same numbers (rounded to 3 places, so the scene text is stable).
// The peak energy grows with the SQUARE ROOT of the glowing area (judged in renders, §61.4: by the area itself a torch was
// a glimmer and a heal flooded the room green): K x sqrt(m2), clamped.
var FX3D_LIGHT_K = 5.5;
var FX3D_LIGHT_MIN = 0.4, FX3D_LIGHT_MAX = 10;
// `opt` (optional): { frames: the effect's own frames as [{ w, h, data }] (Light "always" takes its color from them; without
// them, from what glows, else white), name (the auto size), loop (else effectLoops) }.
// Light "always" (d3Light 2): a light in the effect's own main color whatever glows, following how much is drawn.
// A LOOP (a torch, a portal) is ambient: half the peak, steadier (its curve kept to the top 30 %), and a shorter reach.
function fx3dLight(st, masks, fps, opt) {
  opt = opt || {};
  const off = { on: false, color: [1, 1, 1], energies: (masks || []).map(() => 0), range: 0, peak: 0, center: null, fps: fps || 0 };
  if (!masks || !masks.length) return off;
  const mode = Math.round(+st.d3Light || 0);
  if (mode === 1) return off;
  if (mode === 2) return fx3dLightAlways(st, masks, fps, opt);
  const cov = [];
  let cr = 0, cg = 0, cb = 0;
  let peak = 0, peakAt = 0, cx = 0, cy = 0;
  masks.forEach((m, f) => {
    const d = m.data, w = m.w;
    let c = 0, sx = 0, sy = 0;
    for (let p = 0, n = m.w * m.h; p < n; p++) {
      const i = p * 4, a = d[i + 3];
      if (!a || !(d[i] | d[i + 1] | d[i + 2])) continue;
      const lum = (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255, wt = lum * (a / 255);
      c += wt; sx += wt * (p % w); sy += wt * ((p / w) | 0);
      // the color: every glowing pixel by its brightness and its SATURATION, so a white-hot core (no hue) barely counts
      // and the fire or the magic around it gives the hue; an effect that glows only white stays white
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), sat = (mx - Math.min(d[i], d[i + 1], d[i + 2])) / mx, cw = wt * (sat + 0.08);
      cr += d[i] * cw; cg += d[i + 1] * cw; cb += d[i + 2] * cw;
    }
    cov.push(c);
    if (c > peak) { peak = c; peakAt = f; cx = sx / c; cy = sy / c; }
  });
  if (peak < 2) return off;
  const top = Math.max(cr, cg, cb, 1e-9);
  const color = [cr / top, cg / top, cb / top].map((v) => +v.toFixed(3));
  return fx3dLightOut(st, masks, fps, opt, cov, peak, peakAt, cx, cy, color, 1);
}
// the energies, peak and range from a coverage curve (shared by auto and always)
function fx3dLightOut(st, masks, fps, opt, cov, peak, peakAt, cx, cy, color, k) {
  // the masks may be an export size (2x): meters per MASK pixel
  const dims = typeof frameDims === "function" ? frameDims(st) : { w: masks[0].w, h: masks[0].h };
  const sx = dims.w / masks[0].w, b = fx3dBounds(masks);
  const bb = b ? { x0: b.x0 * sx, y0: b.y0 * sx, x1: (b.x1 + 1) * sx - 1, y1: (b.y1 + 1) * sx - 1 } : null;
  const mpp = fx3dMetersPerPixel(st, bb, opt.name), mppMask = mpp * sx;
  const area = peak * mppMask * mppMask;
  const loop = opt.loop !== undefined ? !!opt.loop : typeof effectLoops === "function" ? !!effectLoops(st) : +st.loopBlend > 0 || +st.pixLoop > 0;
  const power = isFinite(+st.d3LightPower) ? Math.max(0, +st.d3LightPower) : 1;
  let e = power * k * Math.max(FX3D_LIGHT_MIN, Math.min(FX3D_LIGHT_MAX, FX3D_LIGHT_K * Math.sqrt(area)));
  if (loop) e *= 0.45;
  const drawnM = fx3dDrawnPx(st, bb) * mpp;
  const range = loop ? Math.max(2, Math.min(6, drawnM * 2)) : Math.max(2, Math.min(9, drawnM * 2.5));
  return {
    on: e > 0, color: color, peak: +e.toFixed(3), fps: fps || 0, loop: loop,
    energies: cov.map((c) => +(e * (loop ? 0.7 + 0.3 * c / peak : c / peak)).toFixed(3)),
    range: +range.toFixed(3),
    // where the glow is at its fullest, in FRAME pixels (1x), for the light's place
    center: { x: +(cx * sx).toFixed(2), y: +(cy * sx).toFixed(2), frame: peakAt },
  };
}
// Light "always": coverage = how much is drawn (alpha), color = the drawn pixels' own, by alpha and saturation
function fx3dLightAlways(st, masks, fps, opt) {
  const src = opt.frames && opt.frames.length === masks.length ? opt.frames : masks;
  const cov = [];
  let cr = 0, cg = 0, cb = 0, peak = 0, peakAt = 0, cx = 0, cy = 0;
  src.forEach((m, f) => {
    const d = m.data, w = m.w;
    let c = 0, sx = 0, sy = 0;
    for (let p = 0, n = m.w * m.h; p < n; p++) {
      const i = p * 4, a = d[i + 3] / 255;
      if (a < 0.03) continue;
      c += a; sx += a * (p % w); sy += a * ((p / w) | 0);
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      if (!mx) continue;
      const cw = a * ((mx - Math.min(d[i], d[i + 1], d[i + 2])) / mx + 0.15);
      cr += d[i] * cw; cg += d[i + 1] * cw; cb += d[i + 2] * cw;
    }
    cov.push(c);
    if (c > peak) { peak = c; peakAt = f; cx = sx / c; cy = sy / c; }
  });
  if (peak < 2) return { on: false, color: [1, 1, 1], energies: masks.map(() => 0), range: 0, peak: 0, center: null, fps: fps || 0 };
  const top = Math.max(cr, cg, cb);
  const color = top > 1e-6 ? [cr / top, cg / top, cb / top].map((v) => +v.toFixed(3)) : [1, 1, 1];
  // a drawn pixel is not a glowing one: a third of the energy the same area would give glowing (0.6 floodlit the floor
  // under a gray Smoke Puff, judged in the renders)
  return fx3dLightOut(st, src, fps, opt, cov, peak, peakAt, cx, cy, color, 0.35);
}

// ---------- THE GODOT 3D SCENE (§61.2): text only, from what index.html measured ----------
// `p`: { base, name, tres, stream, stand, mpp, mult, w, h (1x frame), origin {x,y} (1x), bounds (1x, or null), depth
// (flat), alpha "cut"|"blend", light (fx3dLight), impact, sound, varietyProps (the 2D scene's Variety lines), energyStarts
// (baked variations), text (the 2D Text node's lines, or null) }. Godot 4.7's own formats: SpriteBase3D billboard 0 off /
// 1 on / 2 fixed Y, axis 1 = Y (lying in XZ), alpha_cut 1 = discard, texture_filter 0 = nearest; default values left out.
function fx3dNum(v) { return Number.isInteger(v) ? v.toFixed(1) : String(+(+v).toFixed(5)); }
// The point the NODE stands for, in 1x frame pixels: the emitter (faces you, flat); an upright effect's FOOT (the
// bottom of everything it draws, under the emitter), so the node goes on the floor and the flames stand on it.
function fx3dAnchor(p) {
  if (p.stand === "upright" && p.bounds) return { x: p.origin.x, y: p.bounds.y1 + 1 };
  return { x: p.origin.x, y: p.origin.y };
}
// WHERE THE LIGHT HANGS, from the node, in meters [x, y, z]: over the middle of what the effect draws (its box over every
// frame), at least 0.3 m up; a flat effect's over its middle on the floor. The 3D preview's room hangs it by this same
// function, so the room and the exported scene agree. `bounds` and `anchor` in 1x frame pixels.
function fx3dLightPos(stand, bounds, anchor, mpp, depth) {
  const b = bounds || { x0: anchor.x, y0: anchor.y, x1: anchor.x - 1, y1: anchor.y - 1 };
  const dx = ((b.x0 + b.x1 + 1) / 2 - anchor.x) * mpp, dy = ((b.y0 + b.y1 + 1) / 2 - anchor.y) * mpp;
  return stand === "flat" ? [dx, 0.3, dy * (depth || 1)] : [dx, Math.max(0.3, -dy), 0];
}
function fx3dPlacement(p) {
  const a = fx3dAnchor(p), m = p.mult, px = p.mpp / m;
  // the frame's center from the anchor, in SHEET pixels (2D: y down), rounded as the 2D scene rounds its offset
  const ox = Math.round((p.w / 2 - a.x) * m), oy = Math.round((p.h / 2 - a.y) * m);
  const flat = p.stand === "flat";
  const lp = p.light && p.light.on ? fx3dLightPos(p.stand, p.bounds, a, p.mpp, p.depth) : null;
  // a sprite's offset is y-UP in its own plane; lying on Y (axis 1) that up is the floor's far side (-Z), with the texture's
  // top there too (measured in Godot 4.7: no flip), so the same (x, -y) serves a billboard and a flat effect
  return { anchor: a, pixel: px, offset: [ox, -oy], light: lp,
           // the Text node sits at the emitter (the 2D layout is drawn from it)
           text: [ (p.origin.x - a.x) * p.mpp, -(p.origin.y - a.y) * p.mpp ] };
}
function fx3dTscn(p) {
  const node = String(p.name).replace(/[^A-Za-z0-9_]/g, "_") || "Effect";
  if (p.stand === "screen") {
    return "[gd_scene format=3]\n\n" +
      '[ext_resource type="Script" path="' + p.base + '_3d.gd" id="1"]\n' +
      '[ext_resource type="PackedScene" path="' + p.base + '.tscn" id="2"]\n\n' +
      '[node name="' + node + '" type="CanvasLayer"]\nscript = ExtResource("1")\n' +
      "frame_size = Vector2(" + p.w * p.mult + ", " + p.h * p.mult + ")\n" +
      "frame_offset = Vector2(" + p.offset2d.x + ", " + p.offset2d.y + ")\n\n" +
      '[node name="Effect" parent="." instance=ExtResource("2")]\nautoplay = false\nfree_when_done = false\n';
  }
  const pl = fx3dPlacement(p), flat = p.stand === "flat", T = p.text;
  const res = ['[ext_resource type="Script" path="' + p.base + '_3d.gd" id="1"]', '[ext_resource type="SpriteFrames" path="' + p.tres + '" id="2"]'];
  if (p.stream) res.push('[ext_resource type="AudioStream" path="' + p.stream + '" id="3"]');
  if (T) res.push('[ext_resource type="Script" path="' + p.base + '_text_3d.gd" id="4"]', '[ext_resource type="Texture2D" path="' + p.base + '_glyphs.png" id="5"]');
  const Lt = p.light && p.light.on ? p.light : null;
  const en = Lt ? (p.energies || Lt.energies) : [];
  let s = "[gd_scene format=3]\n\n" + res.join("\n") + "\n\n" +
    '[node name="' + node + '" type="Node3D"]\nscript = ExtResource("1")\n' +
    "impact_frame = " + p.impact + "\nsound_frame = " + p.sound + "\n" +
    (en.length ? "energies = PackedFloat32Array(" + en.map(fx3dNum).join(", ") + ")\n" : "") +
    (p.energyStarts ? "energy_starts = PackedInt32Array(" + p.energyStarts.join(", ") + ")\n" : "") +
    (p.varietyProps || "") + "\n" +
    '[node name="Sprite" type="AnimatedSprite3D" parent="."]\n' +
    (flat ? "transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, " + fx3dNum(p.depth || 1) + ", 0, 0.01, 0)\n" : "") +
    "pixel_size = " + fx3dNum(pl.pixel) + "\n" +
    (flat ? "axis = 1\n" : "billboard = " + (p.stand === "upright" ? 2 : 1) + "\n") +
    (p.alpha === "blend" ? "" : "alpha_cut = 1\n") +
    "texture_filter = 0\n" +
    (pl.offset[0] || pl.offset[1] ? "offset = Vector2(" + pl.offset[0] + ", " + pl.offset[1] + ")\n" : "") +
    'sprite_frames = ExtResource("2")\n';
  if (Lt) {
    s += '\n[node name="Light" type="OmniLight3D" parent="."]\n' +
      "transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, " + pl.light.map(fx3dNum).join(", ") + ")\n" +
      "light_color = Color(" + Lt.color.map(fx3dNum).join(", ") + ", 1)\nlight_energy = 0.0\nomni_range = " + fx3dNum(Lt.range) + "\n";
  }
  if (p.stream) s += '\n[node name="Sound" type="AudioStreamPlayer3D" parent="."]\nstream = ExtResource("3")\n';
  if (T) {
    s += '\n[node name="Text" type="Node3D" parent="."]\n' +
      (pl.text[0] || pl.text[1] ? "transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, " + fx3dNum(pl.text[0]) + ", " + fx3dNum(pl.text[1]) + ", 0)\n" : "") +
      'script = ExtResource("4")\n' + T + "pixel_size = " + fx3dNum(pl.pixel) + "\nbillboard = " + (p.stand === "upright" ? 2 : p.stand === "flat" ? 0 : 1) + "\n";
  }
  return s;
}

// THE 3D SCRIPT: the 2D scene's own script (plain or with Variety), turned 3D at fixed lines, so the API can never
// drift (autoplay, free_when_done, impact / finished, play, stop, impact_frame, sound_frame, the Variety exports). An
// anchor that moved throws here, at the export, loudly. Adds the light: `energies` (one per frame, baked), light_power.
function fx3dScript(src, base) {
  const own = String(base || "hit_spark").replace(/"/g, "");
  const L = String(src).split("\n");
  const at = (line, from) => { const i = L.indexOf(line, from || 0); if (i < 0) throw new Error("3D script: anchor gone: " + line); return i; };
  const swap = (line, by) => { L.splice(at(line), 1, ...[].concat(by)); };
  const varied = L.indexOf("func _vary() -> void:") >= 0;
  swap("extends Node2D", "extends Node3D");
  swap("## A CrunchyVFX effect: its sprite and its sound as one scene. Instance it and it plays:",
    "## A CrunchyVFX effect in 3D: its sprite, its light and its sound as one scene. Instance it and it plays:");
  swap("##     var fx = preload(\"res://hit_spark.tscn\").instantiate(); fx.position = pos; add_child(fx)",
    "##     var fx = preload(\"res://" + own + "_3d.tscn\").instantiate(); fx.position = pos; add_child(fx)");
  swap("## The node's position is where the effect happens. A one-shot emits [signal impact] on its impact frame,",
    "## The node's position is where the effect happens (an upright one's: its foot, on the floor). A one-shot emits [signal impact] on its impact frame,");
  L.splice(at("@export var sound_frame := 0") + 1, 0,
    "## The light's energy on each frame, baked from the effect's glowing pixels (or, with Light: Always, its drawn ones; empty: no light).",
    "@export var energies := PackedFloat32Array()",
    "## Scales the light on every frame (0: dark).",
    "@export var light_power := 1.0");
  swap("@onready var _sprite: AnimatedSprite2D = $Sprite", ["@onready var _sprite: AnimatedSprite3D = $Sprite"]);
  swap("@onready var _sound: AudioStreamPlayer2D = get_node_or_null(\"Sound\")", [
    "@onready var _sound: AudioStreamPlayer3D = get_node_or_null(\"Sound\")",
    "@onready var _light: OmniLight3D = get_node_or_null(\"Light\")",
    "var _e0 := 0"]);
  L.splice(at("func _ready() -> void:") + 1, 0, "\t_glow(-1)");
  L.splice(at("func stop() -> void:") + 1, 0, "\t_glow(-1)");
  L.splice(at("func _on_frame(f: int) -> void:") + 1, 0, "\t_glow(f)");
  L.splice(at("func _on_animation_finished() -> void:") + 1, 0, "\t_glow(-1)");
  if (varied) {
    L.splice(at("@export var sound_frames := PackedInt32Array()") + 1, 0,
      "## Where each variation's energies start in [member energies], in the order of [member animations].",
      "@export var energy_starts := PackedInt32Array()");
    L.splice(at("var _seeded := false") + 1, 0,
      "var _base_scale := Vector3.ONE", "var _base_pos := Vector3.ZERO", "var _base_offset := Vector2.ZERO",
      "var _base_fv := false", "var _base_range := 0.0", "var _based := false");
    L.splice(at("\t\t\tsound_frame = sound_frames[variation]") + 1, 0,
      "\t\tif variation < energy_starts.size():",
      "\t\t\t_e0 = energy_starts[variation]");
    // the sprite's tweaks in 3D, the SAME random draws in the same order as 2D (a seed replays the same plays): flips by
    // the sprite's own flip (its offset mirrored, as a 2D negative scale mirrors it), a scale on its base (a flat
    // effect's depth kept), a turn only for a flat one (a billboard always stands straight), the nudge in its plane
    const a = at("\tvar sx := s"), b = at("\t\t_sprite.position = Vector2.ZERO", a);
    L.splice(a, b - a + 1,
      "\tif not _based:",
      "\t\t_based = true",
      "\t\t_base_scale = _sprite.scale",
      "\t\t_base_pos = _sprite.position",
      "\t\t_base_offset = _sprite.offset",
      "\t\t_base_fv = _sprite.flip_v",
      "\t\t_base_range = _light.omni_range if _light else 0.0",
      "\tvar fh := flip_h and _rng.randi_range(0, 1) == 1",
      "\tvar fv := flip_v and _rng.randi_range(0, 1) == 1",
      "\t_sprite.flip_h = fh",
      "\t_sprite.flip_v = _base_fv != fv",
      "\tvar flat := _sprite.billboard == BaseMaterial3D.BILLBOARD_DISABLED",
      "\t_sprite.offset = Vector2(-_base_offset.x if fh else _base_offset.x, -_base_offset.y if fv else _base_offset.y)",
      "\t_sprite.scale = _base_scale * s",
      "\tvar turn := 0.0",
      "\tif rotation_mode == 1:",
      "\t\tturn = _rng.randi_range(0, 3) * PI / 2.0",
      "\telif rotation_mode == 2:",
      "\t\tturn = _rng.randf() * TAU",
      "\t_sprite.rotation = Vector3(0, turn, 0) if flat else Vector3.ZERO",
      "\t_sprite.speed_scale = 1.0 + _rng.randf_range(-speed_percent, speed_percent) / 100.0 if speed_percent > 0.0 else 1.0",
      "\tif jitter_px > 0:",
      "\t\tvar jx := _rng.randi_range(-jitter_px, jitter_px) * _sprite.pixel_size",
      "\t\tvar jy := _rng.randi_range(-jitter_px, jitter_px) * _sprite.pixel_size",
      "\t\t_sprite.position = _base_pos + (Vector3(jx, 0, jy) if flat else Vector3(jx, -jy, 0))",
      "\telse:",
      "\t\t_sprite.position = _base_pos",
      "\tif _light:",
      "\t\t_light.omni_range = _base_range * s");
  }
  // the light follows the frames; -1 (not playing, stopped, done) is dark
  const end = L.length && L[L.length - 1] === "" ? L.length - 1 : L.length;
  L.splice(end, 0,
    "",
    "# The light on frame f (its baked energy), or dark.",
    "func _glow(f: int) -> void:",
    "\tif not _light:",
    "\t\treturn",
    "\tvar i := _e0 + f",
    "\t_light.light_energy = energies[i] * light_power if f >= 0 and i < energies.size() else 0.0");
  return L.join("\n");
}

// THE 3D TEXT NODE (§53 in a room): the 2D Text script, turned 3D at fixed lines. Each glyph is a Sprite3D at the Text
// node, placed by its OFFSET (in its own plane), so the whole word billboards as one and stays laid out from any side.
function fx3dTextScript(src) {
  const L = String(src).split("\n");
  const at = (line) => { const i = L.indexOf(line); if (i < 0) throw new Error("3D text script: anchor gone: " + line); return i; };
  const swap = (line, by) => { L.splice(at(line), 1, ...[].concat(by)); };
  swap("extends Node2D", "extends Node3D");
  swap("##     fx.position = pos; add_child(fx)", "##     fx.position = pos; add_child(fx)   (the 3D scene: <name>_3d.tscn)");
  L.splice(at("@export var centers := PackedFloat32Array()") + 1, 0,
    "## Meters per atlas pixel (the effect sprite's own pixel_size).",
    "@export var pixel_size := 0.025",
    "## 1: faces the camera, 2: upright (turns about Y only), 0: lies flat.",
    "@export var billboard := 1");
  swap("var _letters: Array[Sprite2D] = []", "var _letters: Array[Sprite3D] = []");
  swap("\t\tvar s := Sprite2D.new()", ["\t\tvar s := Sprite3D.new()", "\t\ts.pixel_size = pixel_size", "\t\ts.shaded = false",
    "\t\ts.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD", "\t\ts.billboard = billboard as BaseMaterial3D.BillboardMode",
    "\t\tif billboard == 0:", "\t\t\ts.axis = Vector3.AXIS_Y"]);
  swap("\t\ts.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST", "\t\ts.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST");
  swap("\tvar sp := get_parent().get_node_or_null(\"Sprite\") as AnimatedSprite2D", "\tvar sp := get_parent().get_node_or_null(\"Sprite\") as AnimatedSprite3D");
  // 2D: the glyph's top-left from the node (y down); a Sprite3D's offset is its quad's bottom-left (y up)
  swap("\t\ts.position = cell_origin + Vector2((x0s + off * S - x0g) * px, 0)", [
    "\t\tvar p := cell_origin + Vector2((x0s + off * S - x0g) * px, 0)",
    "\t\ts.offset = Vector2(p.x, -(p.y + cell.y))"]);
  return L.join("\n");
}

// THE SCREEN KIND: a CanvasLayer holding the 2D scene, scaled to cover the screen (whole steps: square pixels), with
// the 2D scene's API passed through, so it drops into a 3D game like any other effect.
var FX3D_SCREEN_SCRIPT = [
  "extends CanvasLayer",
  "## A CrunchyVFX screen effect for a 3D game (weather, camera, atmosphere): the 2D effect on a layer over the view,",
  "## scaled to cover it. Instance it and it plays:",
  "##",
  "##     var fx = preload(\"res://rain_3d.tscn\").instantiate(); add_child(fx)   # no position: it covers the view",
  "##",
  "## The same API as the 2D scene: [signal impact], [signal finished], play(), stop(), is_playing().",
  "",
  "signal impact",
  "signal finished",
  "",
  "## Play as soon as the scene enters the tree. Untick it to start the effect yourself with play().",
  "@export var autoplay := true",
  "## Free this layer when a one-shot ends, right after [signal finished].",
  "@export var free_when_done := true",
  "## Scale in whole steps (square pixels). Off: exactly cover the screen.",
  "@export var whole_steps := true",
  "## The effect's frame and its 2D offset, in sheet pixels (set by CrunchyVFX).",
  "@export var frame_size := Vector2(128, 128)",
  "@export var frame_offset := Vector2.ZERO",
  "",
  "@onready var _fx = $Effect",
  "",
  "func _ready() -> void:",
  "\t_fx.impact.connect(func(): impact.emit())",
  "\t_fx.finished.connect(_on_finished)",
  "\tget_viewport().size_changed.connect(_fit)",
  "\t_fit()",
  "\tif autoplay:",
  "\t\tplay.call_deferred()",
  "",
  "## Play the effect from its first frame.",
  "func play() -> void:",
  "\t_fx.play()",
  "",
  "## Stop the effect and its sound.",
  "func stop() -> void:",
  "\t_fx.stop()",
  "",
  "## True while the effect is playing.",
  "func is_playing() -> bool:",
  "\treturn _fx.is_playing()",
  "",
  "# The frame centered on the view and scaled to cover it.",
  "func _fit() -> void:",
  "\tvar vs := get_viewport().get_visible_rect().size",
  "\tvar k := maxf(vs.x / maxf(frame_size.x, 1.0), vs.y / maxf(frame_size.y, 1.0))",
  "\tif whole_steps:",
  "\t\tk = ceilf(k)",
  "\t_fx.scale = Vector2(k, k)",
  "\t_fx.position = vs / 2.0 - frame_offset * k",
  "",
  "func _on_finished() -> void:",
  "\tfinished.emit()",
  "\tif free_when_done:",
  "\t\tqueue_free()",
  ""].join("\n");

// <base>_3d.json: what an engine without the scene needs (Unity, Unreal, your own): the stand, the scale, the anchor,
// the light per frame. Numbers only, keys sorted as written here.
function fx3dJson(p) {
  const pl = p.stand === "screen" ? null : fx3dPlacement(p), Lt = p.light && p.light.on ? p.light : null;
  const o = {
    app: "crunchyvfx", kind: "effect-3d", version: 1, name: p.name, sheet: p.sheet, frames: p.frames, fps: p.fps, loop: p.loop,
    stand: p.stand, billboard: { face: "full", upright: "y-axis", flat: "none, lying on the ground (the frame's top away from a camera looking down -Z)", screen: "screen overlay" }[p.stand],
    metersPerPixel: +p.mpp.toFixed(6), pixelSize: +(p.mpp / p.mult).toFixed(6), sheetScale: p.mult,
    frame: { w: p.w * p.mult, h: p.h * p.mult },
    anchor: pl ? { x: +(pl.anchor.x * p.mult).toFixed(2), y: +(pl.anchor.y * p.mult).toFixed(2), is: p.stand === "upright" ? "foot" : "emitter" } : null,
    flatDepthScale: p.stand === "flat" ? p.depth : undefined,
    alpha: p.alpha === "blend" ? "blend" : "clip",
    impactFrame: p.impact,
    light: Lt ? { color: Lt.color, range: Lt.range, peak: Lt.peak, energies: p.energies || Lt.energies, energyStarts: p.energyStarts || undefined,
                  offset: pl.light.map((v) => +v.toFixed(4)) } : null,
  };
  return JSON.stringify(o, null, 1) + "\n";
}

// The README's 3D part (one list of lines, appended by godotReadme only when a 3D scene was written)
// the screen kind's script, its example naming the effect's own scene
function fx3dScreenScript(base) {
  return FX3D_SCREEN_SCRIPT.replace("res://rain_3d.tscn", "res://" + String(base || "rain").replace(/"/g, "") + "_3d.tscn");
}
// the README's one spawn line for a 3D effect, by how it stands (said plainly)
function fx3dSpawnLines(i, dir) {
  const path = "res://" + (dir || "") + i.base + "_3d.tscn", st = i.d3 && i.d3.stand;
  if (st === "screen") return ["    var fx = preload(\"" + path + "\").instantiate(); add_child(fx)",
    "        (on the screen: no position, it covers the view; add it anywhere in the tree)"];
  if (st === "upright" || st === "flat") return ["    var fx = preload(\"" + path + "\").instantiate(); fx.position = floor_point; add_child(fx)",
    "        (" + (st === "upright" ? "upright: the node is its FOOT" : "flat: it lies on the ground") + ", so put it on the floor)"];
  return ["    var fx = preload(\"" + path + "\").instantiate(); fx.position = hit_point; add_child(fx)",
    "        (faces the camera: the node is where it happens, e.g. a hit point or over a head)"];
}
function fx3dReadme(infos) {
  const dir = (i) => (i.dir ? i.dir + "/" : ""), seen = {}, spawn = [];
  for (const i of infos) if (i.d3 && !seen[i.d3.stand]) { seen[i.d3.stand] = 1; spawn.push(...fx3dSpawnLines(i, dir(i))); }
  return [
    "3D (the \"3D scene too\" option): the same effect standing in a 3D game",
    "",
  ].concat(spawn).concat([
    "",
    "  <name>_3d.tscn uses the SAME SpriteFrames as the 2D scene: an AnimatedSprite3D (nearest filter, unshaded) with an",
    "  OmniLight3D whose energy follows the frames (`energies`, baked from the effect's glowing pixels, or with Light:",
    "  Always in CrunchyVFX from what it draws, in its own color; `light_power` scales it; a loop is gentler and steadier),",
    "  and the sound as an AudioStreamPlayer3D. The same signals, options and methods as above.",
    "  How it stands: faces you (a billboard), upright (turns about Y only: fire, columns, portals; its node is its",
    "  FOOT, so put it on the floor), flat on the ground (lying down; put it on the floor), or on the screen (a",
    "  CanvasLayer over the view holding the 2D scene: weather, camera and light). Change it in CrunchyVFX's 3D panel.",
    "  <name>_3d.json says the same for any engine (Unity, Unreal, your own): the stand, meters per pixel, the anchor,",
    "  the light's color, range and energy per frame. Make a camera-facing quad from the sheet (point filter, alpha",
    "  clip), scale it by pixelSize, and drive a point light from `energies` at `fps`.",
    "",
  ]);
}

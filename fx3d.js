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
var FX3D_STANDS = ["auto", "face", "upright", "flat", "screen", "texture"];   // vfx13-tile: "texture" appended (§66)
// what the editor's select shows for each (no console or engine names)
var FX3D_STAND_WORDS = ["Auto", "Faces you", "Upright", "Flat on the ground", "On the screen", "A surface (tiled)"];   // vfx13-tile
// in a sentence ("it stands …"), for the panel note, the export note and the README
var FX3D_STAND_SAY = { face: "faces the camera", upright: "stands upright, turning to face you", flat: "lies flat on the ground",
                       screen: "plays on the screen (a 3D game puts it on the camera)",
                       texture: "covers a surface, tiled (a material for a floor or a wall)" };   // vfx13-tile (§66)
// d3Light's values (APPEND-ONLY)
var FX3D_LIGHTS = ["auto", "off", "always"];
var FX3D_LIGHT_WORDS = ["Auto (from its glow)", "Off", "Always (its own color)"];
// The old fixed scale (0.025 m per frame pixel), kept for what has no drawing to measure. The AUTO SIZE (1.3.1, the
// persona test: a 192 px torch came out 4.8 m) sizes what is DRAWN to a believable size for how it stands.
var FX3D_AUTO_MPP = 0.025;
// the longer side of what is drawn, in meters: [base, least, most] per stand (a hit or a pickup over a head, a torch or a
// portal on the floor, a circle on the ground); a bigger frame is a somewhat bigger effect (sqrt of frame / 128 px)
var FX3D_AUTO_SIZE = { face: [1.3, 0.7, 3.0], upright: [1.6, 1.0, 2.2], flat: [2.4, 1.6, 3.2], screen: [1.3, 0.7, 3.0],
                       texture: [1.0, 0.5, 2.0] };   // vfx13-tile: a seamless tile, one tile's side in meters (§66)
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
    // <vfx13-fluid> §64: a blast cloud and a swirl face you
    "Rolling Blast", "Mist Swirl",
    // </vfx13-fluid>
    // <vfx13-lit> §65
    "Lit Dust Cloud", "Lit Pixel Dust", "Lit Rock Burst",
    // </vfx13-lit>
    // <vfx13-pack> §67: the dungeon's moments and breaths face you
    "Door Unlock", "Spell Cast", "Secret Found", "Sword Swing", "Arrow Volley", "Ghost Wisps", "Dragon Breath", "Cold Breath",
    "Blood Spatter", "Cave-in Dust",
    // </vfx13-pack>
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
    // <vfx13-fluid> §64: columns, jets and drops keep their up (a smoke column rises from the floor; ink falls)
    "Curling Smoke", "Steam Vent", "Ink Drop",
    // </vfx13-fluid>
    "Lit Smoke Column",   // vfx13-lit §65
    // <vfx13-pack> §67 the dungeon pack: lights stand on the floor or the wall; vents, chests and a dissolving monster keep their up
    "Wall Sconce", "Brazier", "Candle Cluster", "Glow Mushrooms", "Crystal Pulse", "Lantern Glow", "Chest Open", "Item Rise",
    "Monster Dissolve", "Torch Smoke", "Poison Vent", "Falling Rubble",
    // </vfx13-pack>
  ],
  flat: [
    "Cracks", "Summon Circle", "Water Ripple", "Sonar Ping", "Glass Web", "Radar Sweep", "Rune Circle", "Summon Seal",
    "Summon Grid", "Frost Growth", "Pixel Slam", "Pixel Shockwave", "Pixel Summon", "Pixel Lava Pool",
    // its debris falls far below the crack, so standing on its foot (the bottom of all it draws) it floated: it lies down
    "Ground Crack",
    // <vfx13-pack> §67: marks on a dungeon floor
    "Pressure Plate", "Trap Glyph", "Puddle Drip", "Frost Creep",
    // </vfx13-pack>
  ],
  screen: [
    "Focus Lines", "Rain", "Snow", "Leaf Fall", "Petal Fall", "Downpour", "Ash Fall", "Spore Drift", "Feather Fall",
    "Warp Speed", "Punch In", "Star Filter", "Signal Lost", "Dream Drift", "Searchbeam", "Cathedral Light",
    "Rift Light", "Rain On Glass", "Glint Field", "Sonar Motes", "Old Broadcast", "Dust Motes", "Pixel Rain",
    "Pixel Snow", "Pixel Blizzard", "Pixel Falling Leaves", "Pixel Embers", "Pixel Ash Fall", "Pixel Sandstorm",
    "Pixel Meteor Shower", "Pixel Dust Motes", "Pixel Spores", "Pixel Snowflakes",
  ],
  // <vfx13-tile> §66: seamless tiles cover a surface (the room's floor; the export's plane and material)
  texture: ["Energy Field", "Water Caustics", "Lava Crust", "Force Field", "Rune Crawl", "Electric Static", "Rain Streaks"],
  // </vfx13-tile>
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
  const rows = PARAMS.filter((p) => p[7] !== "3D" && /* <vfx13-lit> */ p[7] !== "Lit" && /* </vfx13-lit> */ p[0] !== "seed");
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
  if (on("tile")) return "texture";                                                  // vfx13-tile: a seamless tile is a surface (§66)
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
  if (st && +st.tile > 0) return "texture";          // vfx13-tile: Tile on makes it a surface, whatever it was made from (§66)
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
// <vfx13-lit>
// WHAT GLOWS vs WHAT IS BRIGHT MATTER (VFX 1.3, §65 + the fluid round: white smoke, white steam and magenta ink were lighting
// the room). The glow mask (emissiveFrames: luminance x alpha over Glow thresh) says only that a pixel is BRIGHT. An effect
// GLOWS where something in it makes light: particles or Layer B drawn additive or screen, a light layer (Glow, Flash,
// Streaks, Bokeh, a beam, an arc, lines, a sigil …), pixel art in a hot or magic ramp or with Heat, a fire, a hot fluid or a
// smooth fluid drawn additive or screen. Such an effect: every bright pixel glows ("all", as before). An effect of MATTER
// only (alpha-blended smoke, dust, ink, steam, rubble, blood): only its FIRE-colored bright pixels glow ("hot": embers in the
// smoke), so white smoke and magenta ink cast no light. Lit with Lit parts "Everything": nothing glows ("none").
var FX3D_LIGHT_LAYERS = ["glow", "flash", "streak", "bokeh", "cone", "rim", "shafts", "twinkle", "prings", "beam", "arc", "lines",
                         "sigil", "rift", "wave", "ribbon", "vortex", "orbit", "chain", "impact", "zoom", "kaleido", "lightning"];
var FX3D_MATTER_RAMPS = ["blood", "cloud", "dust", "shadow", "ink"];   // PIX_RAMPS by name: the rest glow (fire, effect colors, holy, ice, electric)
function fx3dEmits(st) {
  const on = (k) => +st[k] > 0, B = (v) => Math.round(+v || 0);
  const pblend = B(st.blend);
  if (on("count") && on("opacity") && pblend !== 1) return true;
  if (on("emit2Count")) { const b2 = B(st.emit2Blend); if ((b2 === 0 ? pblend : b2 - 1) !== 1) return true; }
  for (const k of FX3D_LIGHT_LAYERS) if (on(k)) return true;
  if (on("pix")) {
    const ramp = typeof PIX_RAMPS !== "undefined" ? PIX_RAMPS[B(st.pixColors)] : null;
    // a hot or magic ramp, Heat, a fire in fire colors, sparks, or a star-shaped blob (a glint, a twinkle: light by its shape)
    if (on("pixHeat") || on("pixFire") && ramp === "fire" || (ramp && FX3D_MATTER_RAMPS.indexOf(ramp) < 0) || on("pixSparks") ||
        (typeof PIX_SHAPES !== "undefined" && PIX_SHAPES[B(st.pixShape)] === "star")) return true;
  }
  if (on("fluid") && (on("fluidHeat") || (B(st.fluidLook) === 0 && pblend !== 1))) return true;
  return false;
}
// a FIRE-colored pixel: bright, strongly saturated (tan dust is not), hue from about -15 to 60 degrees (red, orange, yellow)
function fx3dHot(r, g, b) {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  return mx >= 96 && r === mx && d >= 0.6 * mx && b <= g + 0.25 * d;
}
function fx3dGlowMode(st) {
  if (+st.lit > 0 && Math.round(+st.litParts || 0) === 1) return "none";
  return fx3dEmits(st) ? "all" : "hot";
}
// </vfx13-lit>
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
  // <vfx13-lit> only what GLOWS lights (fx3dGlowMode; opt.glowMode overrides it, for a test's "as before")
  const gm = opt.glowMode || fx3dGlowMode(st);
  if (gm === "none") return off;
  // </vfx13-lit>
  const cov = [];
  let cr = 0, cg = 0, cb = 0;
  let peak = 0, peakAt = 0, cx = 0, cy = 0;
  masks.forEach((m, f) => {
    const d = m.data, w = m.w;
    let c = 0, sx = 0, sy = 0;
    for (let p = 0, n = m.w * m.h; p < n; p++) {
      const i = p * 4, a = d[i + 3];
      if (!a || !(d[i] | d[i + 1] | d[i + 2])) continue;
      if (gm === "hot" && !fx3dHot(d[i], d[i + 1], d[i + 2])) continue;   // vfx13-lit: matter: only its fire glows
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
  const SH = p.shapes ? fx3dShapesTscn(p) : null;   // <vfx13-shapes> §61.8 (a card: null, every byte as before)
  const res = ['[ext_resource type="Script" path="' + p.base + '_3d.gd" id="1"]', '[ext_resource type="SpriteFrames" path="' + ((p.shapes && p.shapes.cardTres) || p.tres) + '" id="2"]'];
  if (p.stream) res.push('[ext_resource type="AudioStream" path="' + p.stream + '" id="3"]');
  if (T) res.push('[ext_resource type="Script" path="' + p.base + '_text_3d.gd" id="4"]', '[ext_resource type="Texture2D" path="' + p.base + '_glyphs.png" id="5"]');
  const Lt = p.light && p.light.on ? p.light : null;
  const en = Lt ? (p.energies || Lt.energies) : [];
  if (SH) res.push(...SH.res);   // <vfx13-shapes>
  // <vfx13-lit> §65: a LIT effect's sprite wears a material that takes the scene's lights through its normal map
  const LT = p.lit && !T && typeof litShader3d === "function" ? p.lit : null;
  let litSubs = "";
  if (LT) {
    res.push('[ext_resource type="Texture2D" path="' + LT.sheet + '" id="7"]', '[ext_resource type="Texture2D" path="' + LT.normal + '" id="8"]');
    litSubs = '[sub_resource type="Shader" id="Shader_lit"]\ncode = ' + litTscnString(litShader3d(p.stand, p.alpha, LT.steps)) + "\n\n" +
      '[sub_resource type="ShaderMaterial" id="Lit"]\nresource_local_to_scene = true\nshader = SubResource("Shader_lit")\nshader_parameter/sheet = ExtResource("7")\n' +
      'shader_parameter/normal_sheet = ExtResource("8")\nshader_parameter/glow_threshold = ' + fx3dNum(LT.glow) + "\n" + (LT.hot ? "shader_parameter/hot_only = 1.0\n" : "") + "\n";
  }
  // </vfx13-lit>
  let s = "[gd_scene format=3]\n\n" + res.join("\n") + "\n\n" + (SH && SH.subs.length ? SH.subs.join("\n") + "\n" : "") + litSubs +   // <vfx13-shapes> + vfx13-lit
    '[node name="' + node + '" type="Node3D"]\nscript = ExtResource("1")\n' +
    "impact_frame = " + p.impact + "\nsound_frame = " + p.sound + "\n" +
    (en.length ? "energies = PackedFloat32Array(" + en.map(fx3dNum).join(", ") + ")\n" : "") +
    (p.energyStarts ? "energy_starts = PackedInt32Array(" + p.energyStarts.join(", ") + ")\n" : "") +
    (p.varietyProps || "") + (SH && SH.props.length ? SH.props.join("\n") + "\n" : "") + "\n" +   // <vfx13-shapes> the form's values
    '[node name="Sprite" type="AnimatedSprite3D" parent="."]\n' +
    (p.shapes && p.shapes.cardHidden ? "visible = false\n" : "") +   // <vfx13-shapes> the mesh or the particles draw it: the sprite is the clock
    (flat ? "transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, " + fx3dNum(p.depth || 1) + ", 0, 0.01, 0)\n" : "") +
    (LT ? 'material_override = SubResource("Lit")\n' : "") +   // vfx13-lit
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
  if (SH) s += SH.nodes.map((x) => "\n" + x).join("");   // <vfx13-shapes>
  return s;
}

// THE 3D SCRIPT: the 2D scene's own script (plain or with Variety), turned 3D at fixed lines, so the API can never
// drift (autoplay, free_when_done, impact / finished, play, stop, impact_frame, sound_frame, the Variety exports). An
// anchor that moved throws here, at the export, loudly. Adds the light: `energies` (one per frame, baked), light_power.
function fx3dScript(src, base, form) {
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
  // <vfx13-shapes> §61.8: a 3D-native form's lines (a card: none, every byte as before)
  if (form && form !== "card") {
    const sx = form === "particles" ? ["## The frame each CPUParticles3D below starts on, in tree order (set by CrunchyVFX).", "@export var particle_frames := PackedInt32Array()"]
      : form === "ring" ? ["## The ring's inner and outer radius on each frame, in frame pixels (set by CrunchyVFX).", "@export var ring_in := PackedFloat32Array()", "@export var ring_out := PackedFloat32Array()"]
      : form === "beam" ? ["## The beam's length as exported, in meters (aim() stretches it from this).", "@export var beam_length := 1.0"] : [];
    L.splice(at("@export var light_power := 1.0") + 1, 0, ...sx);
    L.splice(at("var _e0 := 0") + 1, 0, ...(form === "particles" ? ["var _parts: Array[CPUParticles3D] = []"] : ["@onready var _shape_mesh: MeshInstance3D = get_node_or_null(\"Shape\")"]));
    if (form === "particles") L.splice(at("func _ready() -> void:") + 1, 0, "\t_collect(self)");
    L.splice(at("func stop() -> void:") + 1, 0, "\t_shape(-1)");
    L.splice(at("func _on_frame(f: int) -> void:") + 1, 0, "\t_shape(f)");
    const e2 = L.length && L[L.length - 1] === "" ? L.length - 1 : L.length;
    L.splice(e2, 0, ...fx3dShapesScriptLines(form));
  }
  // </vfx13-shapes>
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
    // <vfx13-lit> a lit effect's normal map sheet (aligned with `sheet`; x right, y up, z out); absent when not lit
    normalSheet: p.lit && !p.text ? p.lit.normal : undefined,
    // </vfx13-lit>
    light: Lt ? { color: Lt.color, range: Lt.range, peak: Lt.peak, energies: p.energies || Lt.energies, energyStarts: p.energyStarts || undefined,
                  offset: pl.light.map((v) => +v.toFixed(4)) } : null,
  };
  if (p.shapes) o.form = fx3dShapesJson(p.shapes);   // <vfx13-shapes> §61.8 (a card: no key, every byte as before)
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
  if (st === "texture") return ["    var fx = preload(\"" + path + "\").instantiate(); add_child(fx)   # vfx13-tile",
    "        (a surface: a plane wearing the seamless material; or put " + i.base + "_tile_3d.tres on your own mesh)"];
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
  ]).concat(typeof fx3dShapesReadme === "function" && fx3dShapesReadme(infos).length ? fx3dShapesReadme(infos).concat([""]) : []);   // <vfx13-shapes> §61.8
}

// <vfx13-shapes>
// ---------- 3D-NATIVE SHAPES (VFX-DESIGN §61.8; VFX 1.3, the content round) ----------
// AJ, seeing the billboards: could bursts like Pixel Level Up "burst in a 3D area"? `d3Form` (a 3D row, appended) says what
// the effect BECOMES in a 3D game. "card" is §61's rule, the frames on a billboard (every 3D byte as before). The others are
// 3D-native, and the room preview draws exactly what the scene is made of:
//   particles  the effect's PARTICLES (vfx.js's emitters, Layer B, the pixel layer's blobs, its core and sparks) emitted
//              again in 3D as Godot CPUParticles3D: each wears its own sprite, baked small (nearest) over its life as a strip
//              (its colors, fade and shading ARE the strip), with its count, speed, spread, gravity, life and drag; a burst
//              is a sphere, a cone stays a cone round its axis, a ring lies in the floor plane. Whatever is not a particle
//              (a flash, a ring, a glow, text, strokes) stays the card, drawn from the same frames without them.
//   arc        a slash, sweep or swoosh laid on a curved strip of quads in the swing plane in front of the node (its -Z),
//              the effect's own frames revealed along it: a sword swing that reads in first person
//   beam       a strip from the node out along the beam, turned about its own axis to face the camera, its frames along it
//   ring       a shockwave or ring as a flat ring on the floor that grows, each frame's own pixels on it
// CPUParticles3D, not GPUParticles3D: it runs on the CPU, so it simulates the same under --headless (the tests), on the
// Compatibility renderer the Flatpak's GL gets, and on every desktop; a burst of a few hundred costs nothing; and its every
// knob is an inspector field a person can tune. Its emission POINTS (each with its own direction) carry the 2D emitter's
// geometry exactly, which Godot's own shapes cannot (a ring thrown outward, a uniform sphere).
var FX3D_FORMS = ["auto", "card", "particles", "arc", "beam", "ring"];   // d3Form's values (APPEND-ONLY); 0 = auto
var FX3D_FORM_WORDS = ["Auto", "A card (its frames)", "Particles in 3D", "A slash arc", "A beam", "A ring on the floor"];
var FX3D_FORM_SAY = {
  card: "is its frames on a card",
  particles: "bursts as real 3D particles round its point (the rest of it on a card)",
  arc: "sweeps on a curved strip in front of you, a first-person swing",
  beam: "is a strip between two points, turning to face the camera",
  ring: "is a ring lying on the floor that grows",
};
// AUTO: the shipped presets that clearly read better 3D-native (judged in the room and in Godot renders); every other one
// is a card. An edited preset takes its preset's form (fx3dNearestPreset); an effect of your own is a card unless you pick.
var FX3D_AUTO_FORM = {
  particles: ["Pixel Level Up", "Pixel Gem Burst", "Pixel Gem Sparkle", "Pixel Flower Burst", "Pixel Bone Burst",
              "Pixel Spark", "Pixel Button Sparkle", "Ring Burst", "Magic Sparkle", "Confetti", "Twinkle", "Pixel Burst",
              "Charm Hearts", "Emoji Burst", "Coin Burst", "Candy Shower"],
  arc: ["Slash", "Twin Slash", "Pixel Slash", "Pixel Swoosh", "Pixel Twin Swoosh", "Sword Slash"],
  beam: ["Laser", "Pixel Laser"],
  ring: ["Shockwave", "Pixel Shockwave", "Pixel Ring Blast", "Sonic Pulse"],
};
// <vfx13-pack> §67 the dungeon pack's 3D-native forms (judged in the room; the rest are cards) and its tiled surfaces
FX3D_AUTO_FORM.particles.push("Chest Open", "Item Rise", "Spell Cast", "Secret Found");
FX3D_AUTO_FORM.arc.push("Sword Swing");
FX3D_AUTO_FORM.ring.push("Pressure Plate");
FX3D_AUTO_STAND.texture.push("Blood Ward", "Brimstone Floor", "Sewer Water");   // the dungeon's surfaces (tiled)
// </vfx13-pack>
var FX3D_PART_MAX = 300;          // particles in one system, at most (2D allows 6000; a 3D burst of 300 already fills a room)
var FX3D_ARC_TILT = 20;           // the swing plane's lean above level, degrees (0: flat in front of you, 90: a card)
var FX3D_ARC_REACH = 1.25;        // an arc's outer radius when Size is auto, meters (a sword's reach)
var FX3D_STRIP_FPS = 24;          // the strip's own clock (cells are the particle's life, not the effect's frames)

function fx3dFormOf(name) {
  for (const k in FX3D_AUTO_FORM) if (FX3D_AUTO_FORM[k].indexOf(String(name)) >= 0) return k;
  return null;
}
// What the effect has to become each form (no units: a yes or no)
function fx3dFormKinds(st) {
  const on = (k) => +st[k] > 0, pix = on("pix"), blobs = pix && !(st.pixBlobs != null && +st.pixBlobs <= 0), pe = Math.round(+st.pixEmit || 0);
  const ps = Math.round(+st.pixStroke || 0), text = pix && Math.round(+st.pixShape || 0) === 15;
  return {
    particles: fx3dParticleSources(st).length > 0,
    arc: (Math.round(+st.shape) === 13 && on("opacity") && Math.round(+st.count) <= 4) || on("sweep") || on("ribbon") ||
         (blobs && pe === 3) || (pix && ps === 3),
    beam: on("beam") || (pix && ps === 2),
    ring: on("wave") || on("ripple") || (pix && ps === 1) || (blobs && on("pixHollow") && Math.round(+st.pixCount) <= 2 && pe < 3),
    text: text || on("bubble"),
  };
}
// a form an effect can take: not on the screen, not with baked Variety (its animations are the card's) or runtime text
function fx3dFormCan(st, form, stand) {
  if (form === "card") return true;
  if (stand === "screen" || stand === "texture" || /(^|,)b:[1-9]/.test(String(st.variety || ""))) return false;   // vfx13-tile: a surface is a material, never a 3D form
  const K = fx3dFormKinds(st);
  return !K.text && !!K[form];
}
// THE FORM: the person's choice when it applies, else auto (the table by name, the nearest shipped preset), else a card
function fx3dForm(st, name, stand) {
  const v = Math.round(+(st && st.d3Form) || 0);
  let f = v >= 1 && v < FX3D_FORMS.length ? FX3D_FORMS[v] : null;
  if (!f) f = (name && fx3dFormOf(name)) || (fx3dNearestPreset(st) && fx3dFormOf(fx3dNearestPreset(st))) || "card";
  return fx3dFormCan(st, f, stand !== undefined ? stand : fx3dStand(st, name)) ? f : "card";
}

// ---- the particle systems ----
// The deterministic draws (the pixel layer's own hash, so a ring's blobs are its 2D blobs one for one)
function fx3dRnd(seed, i, salt) {
  if (typeof pixRnd === "function") return pixRnd(seed, i, salt);
  let a = (Math.imul(i | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) | 0;
  a ^= a >>> 16; a = Math.imul(a, 0x21f0aaad); a ^= a >>> 15; a = Math.imul(a, 0x735a2d97); a ^= a >>> 15;
  return (a >>> 0) / 4294967296;
}
// a 2D screen angle (radians, y down) as a 3D direction in the card's plane (y up)
function fx3dDir2(a) { return [Math.cos(a), -Math.sin(a), 0]; }
function fx3dNorm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function fx3dCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function fx3dSphere(u, v) { const z = 1 - 2 * u, s = Math.sqrt(Math.max(0, 1 - z * z)), p = v * Math.PI * 2; return [s * Math.cos(p), z, s * Math.sin(p)]; }
// uniform in a cone round `axis` of half-angle h (h >= pi: the whole sphere)
function fx3dCone(axis, h, u, v) {
  if (h >= Math.PI - 1e-6) return fx3dSphere(u, v);
  const c = 1 - u * (1 - Math.cos(Math.max(0, h))), s = Math.sqrt(Math.max(0, 1 - c * c)), p = v * Math.PI * 2;
  const a = fx3dNorm(axis), t = fx3dNorm(Math.abs(a[1]) < 0.95 ? fx3dCross(a, [0, 1, 0]) : fx3dCross(a, [1, 0, 0])), b = fx3dCross(a, t);
  return fx3dNorm([a[0] * c + (t[0] * Math.cos(p) + b[0] * Math.sin(p)) * s, a[1] * c + (t[1] * Math.cos(p) + b[1] * Math.sin(p)) * s,
                   a[2] * c + (t[2] * Math.cos(p) + b[2] * Math.sin(p)) * s]);
}
// a flattened spray: in the floor plane, round azimuth a0 within +-h
function fx3dFlatDir(a0, h, u) { const a = a0 + (u * 2 - 1) * Math.min(Math.PI, h); return [Math.cos(a), 0, Math.sin(a)]; }

// Which populations of the effect are particles (no units). A single smooth sprite is a card, not a burst.
function fx3dParticleSources(st) {
  const on = (k) => +st[k] > 0, out = [];
  if (on("opacity") && Math.round(+st.count) >= 2) out.push("A");
  if (Math.round(+st.emit2Count || 0) >= 2 && on("emit2Opacity")) out.push("B");
  if (on("pix") && Math.round(+st.pixShape || 0) !== 15) {
    const pe = Math.round(+st.pixEmit || 0), blobs = !(st.pixBlobs != null && +st.pixBlobs <= 0);
    if (blobs && pe <= 2 && Math.round(+st.pixCount) >= 1) {
      const core = +st.pixCore > 0;
      if (Math.round(+st.pixCount) - (core ? 1 : 0) >= 1) out.push("blob");
      if (core) out.push("core");
    }
    if (Math.round(+st.pixSparks || 0) >= 2) out.push("spark");
  }
  return out;
}

// THE SYSTEMS, with units. `cx` (what the render measured): { mpp (m per frame px), k (frame px per sim px: the render's
// transform), w, h (the frame, px), origin {x, y} (the emitter, frame px), anchor {x, y} (the node, frame px), stand, depth,
// loop, seed }. Each system: { src, nodes: [{ amount, points, normals, variant, start, seed, v?, scale?, life? }], lifetime,
// lifeRand, explosiveness, vMin, vMax, gravity [x,y,z], radial, damp0, dampEnd (a share of the life), angle [min,max] deg,
// angVel [min,max] deg/s, scale [min,max], quad (m), blend "cut" | "mix" | "add", loop, strip { kind, K, V, C, ... },
// emit [x,y,z] (the emitter from the node, m) }. Points are meters from the emitter; normals unit directions.
function fx3dParticleSystems(st, cx) {
  const srcs = fx3dParticleSources(st);
  if (!srcs.length || !cx) return [];
  const seed = Math.max(1, Math.round(+st.seed || 1)) | 0, dur = Math.max(0.05, +st.duration || 0.7), mpp = cx.mpp;
  const loop = !!cx.loop, stand = cx.stand, flatSt = stand === "flat";
  // where the emitter is from the node: in the card's plane (a flat effect: on the floor)
  const ex = ((cx.origin.x - cx.anchor.x) * mpp), ey = -((cx.origin.y - cx.anchor.y) * mpp);
  const emitAt = (dx, dy) => flatSt ? [ex + dx, 0.02, -ey * (cx.depth || 1) - dy] : [ex + dx, ey + dy, 0];
  const out = [];
  // a one-shot's particles live at most to the clip's end (the scene frees itself there, as the 2D clip ends)
  const fit = (L, start) => loop ? L : Math.max(0.05, Math.min(L, dur * 0.999 - start));
  // the drag (2D: the velocity falls off e^-kt, so gravity settles to g/k) as Godot's damping, which takes a fixed amount off
  // the speed a second: FITTED, so a particle's 3D path follows its 2D path over its life (fx3dFitDamping)
  // (the pixel layer drags only the launch: its gravity falls free, pixart.js fly())
  const drag = (k, vbar, L, gy, free) => fx3dFitDamping(vbar, gy || 0, k, L, free);
  const smooth = (B) => {
    const fs = typeof frameSizePx === "function" ? frameSizePx(st) : 128, ms = cx.k * mpp;   // meters per sim px
    const count = Math.min(FX3D_PART_MAX, Math.round(B ? +st.emit2Count : +st.count));
    const em = Math.round(B ? +st.emit2Emitter || 0 : +st.emitter || 0), R = (B ? +st.emit2Radius : +st.emitRadius) * fs * ms;
    const base = ((B ? +st.emit2Angle : +st.emitAngle) - 90) * Math.PI / 180, half = (B ? +st.emit2Spread : +st.emitSpread) * Math.PI / 360;
    const life = Math.max(0.02, B ? +st.emit2Life : +st.life), lv = Math.max(0, Math.min(0.95, B ? +st.emit2LifeVar : +st.lifeVar));
    const start = Math.max(0, B ? +st.emit2Delay || 0 : +st.emitDelay || 0), span = Math.max(0, (B ? +st.emit2Over : +st.emitTime) * dur);
    const L = fit(life * (1 + lv), start);
    // Godot spreads a one-shot's births over at most one lifetime: a stream longer than that is several emitters, one after
    // another, each with its share of the particles (SEG of them, a lifetime apart)
    const SEG = loop ? 1 : Math.max(1, Math.min(8, Math.ceil(span / L - 1e-6))), segSpan = span / SEG;
    const sp = (B ? +st.emit2Speed : +st.speed) * ms, sv = Math.max(0, Math.min(1, B ? +st.emit2SpeedVar : +st.speedVar));
    const D = fx3dDir2(base), pts = [], nrm = [];
    for (let i = 0; i < count; i++) {
      const u = fx3dRnd(seed, i, B ? 601 : 501), v = fx3dRnd(seed, i, B ? 602 : 502), w = fx3dRnd(seed, i, B ? 603 : 503);
      let p = [0, 0, 0], d;
      if (em === 0) { d = fx3dSphere(u, v); p = [d[0] * R, d[1] * R, d[2] * R]; }                       // burst: a sphere
      else if (em === 1) d = fx3dCone(D, half, u, v);                                                      // cone: a cone
      else if (em === 2) { const a = u * Math.PI * 2; d = [Math.cos(a), 0, Math.sin(a)]; p = [d[0] * R, 0, d[2] * R]; }   // ring: on the floor
      else if (em === 3) { d = fx3dSphere(u, v); const r = Math.cbrt(w) * R; p = [d[0] * r, d[1] * r, d[2] * r]; }  // disc: a ball
      else if (em === 4) { d = fx3dCone(D, half, v, w); p = [(u * 2 - 1) * R, 0, 0]; }                    // line: a bar
      else if (em === 5) { const a = i * 2.39996323, r = (i / Math.max(1, count - 1)) * R; d = [Math.cos(a), 0, Math.sin(a)]; p = [d[0] * r, 0, d[2] * r]; }   // spiral: a sunflower on the floor
      else { d = fx3dCone(D, half, v, w); p = [(u * 2 - 1) * R, (v * 2 - 1) * R, (w * 2 - 1) * R]; }     // box: a cube
      pts.push(p); nrm.push(d);
    }
    const size = Math.max(0.5, B ? +st.emit2Size : +st.size), grow = B ? +st.emit2Grow : +st.grow, szv = Math.max(0, Math.min(0.9, B ? +st.emit2SizeVar : +st.sizeVar));
    const ramp = typeof parseRamp === "function" ? parseRamp(st.ramp) : null;
    const zMax = ramp ? Math.max.apply(null, ramp.map((s) => s.z)) : 1;
    const big = size * Math.max(1, 1 + grow) * Math.max(1, zMax) * cx.k;        // its largest drawn size, frame px
    const C = Math.max(8, Math.min(128, Math.ceil(big * 1.12) + 2 + (+st.glow > 0 ? 2 * Math.ceil(+st.glowRadius || 0) : 0)));
    const K = Math.max(3, Math.min(12, Math.round(life * Math.max(8, +st.fps || 24))));
    const hv = Math.max(0, +st.hueVar || 0), V = hv > 0.3 ? 4 : hv > 0.04 ? 2 : 1;
    const hues = []; for (let j = 0; j < V; j++) hues.push(V > 1 ? +(((j + 0.5) / V * 2 - 1) * hv * 180).toFixed(2) : 0);
    const bl = B ? Math.round(+st.emit2Blend || 0) - 1 : -1, op = bl >= 0 ? bl : Math.round(+st.blend || 0);
    const blend = op === 1 ? (+st.alphaCut > 0 ? "cut" : "mix") : "add";
    const wind = (+st.wind || 0) * ms, grav = (B ? +st.emit2Gravity : +st.gravity) * ms;
    const vbar = sp, dk = 6 * Math.max(0, B ? +st.emit2Drag : +st.drag);
    const off = B ? [(+st.emit2OffsetX || 0) * fs * ms, -(+st.emit2OffsetY || 0) * fs * ms] : [0, 0];
    const sys = Object.assign({
      src: B ? "B" : "A", emit: emitAt(off[0], off[1]), lifetime: +L.toFixed(4), lifeRand: lv > 0 ? +Math.min(1, 2 * lv / (1 + lv)).toFixed(4) : 0,
      explosiveness: +Math.max(0, Math.min(1, 1 - segSpan / L)).toFixed(4), vMin: +(sp * (1 - sv)).toFixed(4), vMax: +(sp * (1 + sv)).toFixed(4),
      gravity: [+wind.toFixed(4), +(-grav).toFixed(4), 0], radial: B ? 0 : +((+st.radial || 0) * ms).toFixed(4),
      angle: [+(+st.angle || 0).toFixed(2), +((+st.angle || 0) + (+st.angleVar || 0) * 360).toFixed(2)],
      angVel: [+((+st.spin || 0) * (1 - (+st.spinVar || 0))).toFixed(2), +((+st.spin || 0) * (1 + (+st.spinVar || 0))).toFixed(2)],
      scale: [+(1 - szv).toFixed(4), +(1 + szv).toFixed(4)], quad: +(C * mpp).toFixed(5), blend: blend, loop: loop,
      strip: { kind: "smooth", layer: B ? "B" : "A", K: K, V: V, C: C, hues: hues, k: cx.k },
    }, drag(dk, vbar, L, -grav));
    // V hue variants x SEG stretches of the stream: one node each (a node plays one row of the strip), the points dealt round
    sys.nodes = [];
    for (let g = 0; g < SEG; g++) for (let j = 0; j < V; j++) {
      const P = [], N = [];
      for (let i = g * V + j; i < count; i += V * SEG) { P.push(pts[i]); N.push(nrm[i]); }
      if (P.length) sys.nodes.push({ amount: P.length, points: P, normals: N, variant: j, start: +(start + g * segSpan).toFixed(4),
        seed: (seed * 7919 + (g * V + j) * 104729 + (B ? 31 : 0)) % 2147483647 || 1 });
    }
    return sys;
  };
  if (srcs.indexOf("A") >= 0) out.push(smooth(false));
  if (srcs.indexOf("B") >= 0) out.push(smooth(true));
  // the PIXEL layer: art px and the clip's own time (speeds are R0 per clip, gravity R0 per clip squared)
  if (srcs.some((s) => s === "blob" || s === "core" || s === "spark")) {
    const W = cx.w, H = cx.h, kA = Math.max(1, Math.round(Math.min(W, H) / Math.max(8, +st.pixDetail || 64)));
    const R0 = 0.16 * Math.min(W, H) * (+st.pixSize || 1) / kA, ma = mpp * kA, Lc = Math.max(0.1, dur);
    const toV = (x) => x * ma / Lc, toG = (x) => x * ma / (Lc * Lc);
    const emit = Math.round(+st.pixEmit || 0), th0 = (+st.pixAngle || 0) * Math.PI / 180, spread = (+st.pixSpread || 0) * Math.PI / 180;
    const nB = Math.max(1, Math.round(+st.pixCount)), P = Math.max(1, Math.round(+st.pixPulses || 1)), span = Math.max(0, +st.pixSpan || 0), gap = span / P;
    const core = +st.pixCore > 0 && emit < 3, flat = +st.pixFlat >= 0.5, G = R0 * (+st.pixGravity || 0), dr = Math.max(0, +st.pixDrag || 0) / Lc;
    const grav = [0, +(-toG(G)).toFixed(4), 0];
    const vMax = R0 * (+st.pixSpeed || 0), sv = Math.max(0, Math.min(1, +st.pixSpeedVar || 0));
    const lumps = Math.max(0, +st.pixLumps || 0), swell = +st.pixSwell || 0;
    const cellArt = (bigK) => Math.max(8, Math.ceil(2.4 * R0 * Math.max(0.2, +st.pixBlob || 0.95) * bigK * (1 + Math.max(0, swell) * 0.6) * (1 + lumps * 0.5)) + 4);
    const steps = Math.max(1, +st.pixStep || 15);
    const life0 = (i) => (+st.pixLife || 0.75) * (0.85 + 0.3 * fx3dRnd(seed, i, 404));
    const birth = (i) => (i % P) * gap + gap * (P > 1 ? 0.7 : 1) * (emit === 1 ? fx3dRnd(seed, i, 400) : Math.pow(fx3dRnd(seed, i, 400), 1.4));
    const em0 = emitAt(0, 0);
    if (srcs.indexOf("blob") >= 0) {
      const i0 = core ? 1 : 0, ca = cellArt(1), Kb = Math.max(4, Math.min(16, Math.round((+st.pixLife || 0.75) * Lc * steps)));
      const Lmax = loop ? (+st.pixLife || 0.75) * 1.15 * Lc : Math.max(0.05, Math.min((+st.pixLife || 0.75) * 1.15, 0.97 - span) * Lc);
      const sys = Object.assign({
        src: "blob", emit: em0, lifetime: +Lmax.toFixed(4), lifeRand: +(0.3 / 1.15).toFixed(4),
        explosiveness: +Math.max(0, Math.min(1, 1 - span * Lc / Lmax)).toFixed(4),
        vMin: +toV(vMax * (1 - sv)).toFixed(4), vMax: +toV(vMax).toFixed(4), gravity: grav, radial: 0, angle: [0, 0], angVel: [0, 0],
        scale: [+(1 - 0.9 * Math.max(0, Math.min(1, +st.pixSizeVar || 0))).toFixed(4), 1], quad: +(ca * kA * mpp).toFixed(5), blend: "cut", loop: loop,
        strip: { kind: "pixel", core: false, K: Kb, V: 1, C: ca * kA, cellArt: ca, kA: kA, minWH: Math.min(W, H) },
      }, drag(dr, toV(vMax * (1 - sv / 2)), Lmax, grav[1], true));
      sys.nodes = [];
      if (emit === 2 && !loop) {
        // A RING: evenly laid, as in 2D, so each blob is its own emitter (Godot picks emission points at random): its
        // own direction, birth, speed, size and life, the 2D blob's one for one
        for (let i = i0; i < nB; i++) {
          const th = th0 + (i / nB) * Math.PI * 2, d = [Math.cos(th), 0, Math.sin(th)], dd = (+st.pixScatter || 0) * R0 * ma;
          const b = birth(i), lf = Math.max(0.05, Math.min(life0(i), 0.97 - b)) * Lc;
          const v = toV(vMax * (1 - sv * fx3dRnd(seed, i, 403)));
          sys.nodes.push({ amount: 1, points: [[d[0] * dd, 0, d[2] * dd]], normals: [d], variant: 0, start: +(b * Lc).toFixed(4),
            seed: (seed * 7919 + i * 15485863) % 2147483647 || 1, v: +v.toFixed(4), life: +lf.toFixed(4),
            scale: +(1 - (+st.pixSizeVar || 0) * fx3dRnd(seed, i, 404) * 0.9).toFixed(4) });
        }
      } else {
        const pts = [], nrm = [], n = Math.min(FX3D_PART_MAX, nB - i0), axis = fx3dDir2(th0);
        for (let j = 0; j < n; j++) {
          const i = j + i0, r2 = fx3dRnd(seed, i, 401), r3 = fx3dRnd(seed, i, 402), r6 = fx3dRnd(seed, i, 405);
          const d = flat ? fx3dFlatDir(th0, spread / 2, r2) : fx3dCone(axis, spread / 2, r2, r6);
          const dd = (+st.pixScatter || 0) * R0 * Math.sqrt(r3) * ma;
          pts.push([d[0] * dd, d[1] * dd, d[2] * dd]); nrm.push(d);
        }
        sys.nodes.push({ amount: n, points: pts, normals: nrm, variant: 0, start: 0, seed: (seed * 7919 + 17) % 2147483647 || 1 });
      }
      if (sys.nodes.length) out.push(sys);
    }
    if (srcs.indexOf("core") >= 0) {
      const ca = cellArt(1 + 0.15 * (+st.pixCore || 0)), lf = loop ? 0.35 * life0(0) : Math.max(0.05, Math.min(life0(0), 0.97)) * Lc;
      out.push({
        src: "core", emit: em0, lifetime: +lf.toFixed(4), lifeRand: 0, explosiveness: 1, vMin: 0, vMax: 0, gravity: grav, radial: 0,
        angle: [0, 0], angVel: [0, 0], scale: [1, 1], quad: +(ca * kA * mpp).toFixed(5), blend: "cut", loop: loop, damp0: 0, dampEnd: 1,
        strip: { kind: "pixel", core: true, K: Math.max(4, Math.min(16, Math.round(lf * steps))), V: 1, C: ca * kA, cellArt: ca, kA: kA, minWH: Math.min(W, H) },
        nodes: [{ amount: 1, points: [[0, 0, 0]], normals: [[0, 1, 0]], variant: 0, start: 0, seed: (seed * 7919 + 3) % 2147483647 || 1 }],
      });
    }
    if (srcs.indexOf("spark") >= 0) {
      const nE = Math.min(FX3D_PART_MAX, Math.round(+st.pixSparks)), eth = Math.min(Math.PI * 2, spread * 1.6 + 0.6), axis = fx3dDir2(th0);
      const bAt = +st.pixBitsAt > 0 ? (+st.pixBitsAt) * (+st.pixScatter || 0) * R0 * ma : 0;
      const em = emitAt(Math.cos(th0) * bAt, -Math.sin(th0) * bAt);
      const vS = R0 * (+st.pixSparkSpeed || 8), Ls = loop ? 0.52 * Lc : Math.min(0.52 * Lc, 0.97 * Lc);
      const pts = [], nrm = [];
      for (let i = 0; i < nE; i++) { pts.push([0, 0, 0]); nrm.push(flat ? fx3dFlatDir(th0, eth / 2, fx3dRnd(seed, i, 441)) : fx3dCone(axis, eth / 2, fx3dRnd(seed, i, 441), fx3dRnd(seed, i, 445))); }
      out.push(Object.assign({
        src: "spark", emit: em, lifetime: +Ls.toFixed(4), lifeRand: +(0.4 / 0.52).toFixed(4), explosiveness: loop ? 0 : 0.97,
        vMin: +toV(vS * 0.6).toFixed(4), vMax: +toV(vS * 1.2).toFixed(4), gravity: [0, 0, 0], radial: 0, angle: [0, 0], angVel: [0, 0],
        scale: [1, 1], quad: +(kA * mpp).toFixed(5), blend: "cut", loop: loop,
        strip: { kind: "spark", K: 6, V: 1, C: kA, cellArt: 1, kA: kA },
        nodes: [{ amount: nE, points: pts, normals: nrm, variant: 0, start: 0, seed: (seed * 7919 + 5) % 2147483647 || 1 }],
      }, drag(3 / Lc, toV(vS * 0.9), Ls, 0)));
    }
  }
  return out;
}

// ---- the strips: each particle's look over its life, one cell per stage, a row per hue ----
// Cell k is the particle at life k / (K - 1) (the last a hair before its end). Godot's particle animation shows cell
// floor((offset + t x speed) x K V) for a particle t of the way through its life; with these numbers that is
// j K + floor(0.5 + t (K - 1)) on row j: each cell round the moment it was drawn at, never a neighbor row's.
function fx3dStripLife(k, K) { return Math.min(0.985, K > 1 ? k / (K - 1) : 0); }
function fx3dStripAnim(strip, j) {
  const K = strip.K, V = strip.V || 1;
  return { offset: +((j * K + 0.5) / (K * V)).toFixed(6), speed: +((K - 1) / (K * V)).toFixed(6) };
}
function fx3dStripCell(strip, j, tv) {
  const K = strip.K, V = strip.V || 1, A = fx3dStripAnim(strip, j);
  return Math.max(0, Math.min(K * V - 1, Math.floor((A.offset + Math.max(0, tv) * A.speed) * K * V)));
}
// A SMOOTH particle's strip is drawn by the app's own renderer (its shapes.js drawing, ramp, fade, glow and crunch): this
// is the effect it renders, one particle standing still in the middle of a C x C frame, every other layer at its PARAMS
// default (off: every default is), the strip's K frames at the K stages of its life. Pure: index.html renders it.
var FX3D_STRIP_KEEP = ["Life", "Color", "Spark", "Ring", "Star", "Flower", "Smoke", "Shard", "Bolt", "Cross", "Crescent",
  "Snowflake", "Blob", "Teardrop", "Spiral", "Glyph", "Icon", "Image sprite", "Glow", "Crunch"];
function fx3dSmoothStripState(st, strip, j) {
  const s = Object.assign({}, st), keep = FX3D_STRIP_KEEP.concat(strip.layer === "B" ? ["Layer B"] : []);
  if (typeof PARAMS !== "undefined") for (const p of PARAMS) if (keep.indexOf(p[7]) < 0) s[p[0]] = p[5];
  delete s.variety; delete s.fitBox; delete s.layerDelay;
  s.shape = st.shape; s.frameSize = st.frameSize; s.seed = st.seed;
  s.count = 1; s.emitter = 0; s.emitRadius = 0; s.emitTime = 0; s.emitDelay = 0; s.originX = 0.5; s.originY = 0.5;
  s.speed = 0; s.speedVar = 0; s.gravity = 0; s.drag = 0; s.wind = 0; s.spin = 0; s.spinVar = 0; s.angle = 0; s.angleVar = 0;
  s.fps = FX3D_STRIP_FPS; s.duration = strip.K / FX3D_STRIP_FPS; s.frameW = strip.C; s.frameH = strip.C;
  s.scale = strip.k * (typeof frameSizePx === "function" ? frameSizePx(s) : 128) / strip.C;
  const life = Math.max(0.02, (strip.K - 1) / (FX3D_STRIP_FPS * 0.985)), dh = strip.hues[j] || 0;
  if (strip.layer === "B") {
    Object.assign(s, { opacity: 0, emit2Count: 1, emit2Speed: 0, emit2SpeedVar: 0, emit2Gravity: 0, emit2Drag: 0, emit2Radius: 0,
      emit2Delay: 0, emit2Over: 0, emit2OffsetX: 0, emit2OffsetY: 0, emit2LifeVar: 0, emit2SizeVar: 0, emit2Life: life, emit2Hue: +st.emit2Hue + dh });
  } else Object.assign(s, { life: life, lifeVar: 0, sizeVar: 0, hue: +st.hue + dh });
  s.hueVar = 0;
  // with a ramp the ramp owns the hue: a row's hue turns the ramp
  if (dh && s.ramp) s.ramp = String(s.ramp).split("|").map((q) => { const n = q.split(","); if (n.length > 1 && isFinite(+n[1])) n[1] = String(+(+n[1] + dh).toFixed(2)); return n.join(","); }).join("|");
  return s;
}
// A PIXEL blob's strip, drawn here by crunchyCore pixart.js itself: the layer's one blob, standing still in the middle of
// a cell (its art scale and size kept), at each stage of its life: its heat cooling down the ramp, its swell, light, rim,
// break-up and outline exactly as the layer draws it. The core is the layer's core blob. RGBA, K cells wide.
function fx3dPixelStrip(st, strip) {
  const C = strip.C, K = strip.K, kA = strip.kA, ca = strip.cellArt, W = C * K, out = new Uint8ClampedArray(W * C * 4);
  if (typeof pixArtFrame !== "function") return { w: W, h: C, data: out };
  const s = Object.assign({}, st, {
    pixCount: 1, pixCore: strip.core ? st.pixCore : 0, pixEmit: 0, pixPulses: 1, pixSpan: 0, pixLoop: 0, pixSpeed: 0, pixSpeedVar: 0,
    pixScatter: 0, pixGravity: 0, pixDrag: 0, pixSway: 0, pixGather: 0, pixCurl: 0, pixStretch: 0, pixTrail: 0, pixFloor: 0,
    pixFlat: 0, pixSpin: 0, pixSizeVar: 0, pixSmoke: 0, pixBits: 0, pixSparks: 0, pixStroke: 0, pixWipe: 0, pixWobble: 0, pixFire: 0,
    pixCycle: 0, pixFlash: 0, pixBlobs: 1, pixLife: 10, pixStep: 1000, duration: 1, originX: 0.5, originY: 0.5,
    pixDetail: ca, pixSize: (+st.pixSize || 1) * (strip.minWH || C) / C,
  });
  const seed = Math.max(1, Math.round(+st.seed || 1)) | 0;
  for (let k = 0; k < K; k++) {
    // the blob lives 0.97 of this clip (pixLife 10 is clamped there), so a life stage a is the clip at 0.97 a
    const F = pixArtFrame(s, (fx3dStripLife(k, K) * 0.97 * 1000 + 0.5) / 1000, C, C, seed);
    for (let y = 0; y < F.Ha; y++) for (let x = 0; x < F.Wa; x++) {
      const c = F.col[y * F.Wa + x];
      if (c < 0) continue;
      const rgb = F.pal[Math.min(F.pal.length - 1, c)];
      for (let yy = y * F.k; yy < Math.min(C, (y + 1) * F.k); yy++) for (let xx = x * F.k; xx < Math.min(C, (x + 1) * F.k); xx++) {
        const o = (yy * W + k * C + xx) * 4;
        out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
      }
    }
  }
  return { w: W, h: C, data: out };
}
// A SPARK's strip: the layer's single art pixel, hot then cooling (a flicker every third stage when it is hot), in its ramp
function fx3dSparkStrip(st, strip) {
  const C = strip.C, K = strip.K, W = C * K, out = new Uint8ClampedArray(W * C * 4);
  if (typeof pixPalette !== "function") return { w: W, h: C, data: out };
  const P = pixPalette(st), nR = P.n, heat = Math.max(0, Math.min(1, +st.pixHeat)), tone = Math.max(0, Math.min(1, +st.pixTone || 0));
  for (let k = 0; k < K; k++) {
    if (heat > 0 && k % 3 === 2) continue;
    const early = k < K / 2, hi = heat > 0 ? (early ? nR - 2 : 1) : Math.round(tone * (nR - 2)) + (early ? 1 : 0);
    const rgb = P.pal[Math.min(P.pal.length - 1, 4 + Math.max(0, Math.min(nR - 1, hi)))];
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const o = (y * W + k * C + x) * 4; out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255; }
  }
  return { w: W, h: C, data: out };
}

// ---- THE SIM (the room's): what Godot's CPUParticles3D does with a system's numbers, stepped at 60 Hz ----
// Particle i of a node's n is born i / n of (1 - explosiveness) of the lifetime after the node starts (a loop: again every
// lifetime, warmed up by a whole one, as `preprocess` does); its life the lifetime less a draw x lifeRand; its speed a draw
// between vMin and vMax along its emission point's normal; each step gravity and the radial pull are added, then the
// damping (damp0 x its curve, 1 falling to 0 at dampEnd of the life) is taken off the speed's length; the angle is the
// start angle + spin x age; the cell is fx3dStripCell's. Godot draws its own random numbers (and picks a pooled node's
// emission points at random), so a particle here is not one particle there; the population and every number are the same.
function fx3dParticleSim(sys, t) {
  const out = [], dt = 1 / 60, g = sys.gravity, d0 = sys.damp0 || 0, de = sys.dampEnd || 1;
  for (const nd of sys.nodes) {
    const n = nd.amount, P = nd.points.length, L = nd.life || sys.lifetime;
    for (let i = 0; i < n; i++) {
      const birth = nd.start + (n > 1 ? (i / n) * (1 - sys.explosiveness) * L : 0);
      let age = t - birth, c = 0;
      if (sys.loop) { c = Math.floor((t + L - birth) / L); age = (t + L - birth) - c * L; }
      if (age < 0) continue;
      const h = (q) => fx3dRnd(nd.seed, i, q + c * 13);
      const li = L * (1 - h(11) * (nd.life ? 0 : sys.lifeRand));
      if (age >= li) continue;
      const idx = P ? (i + c) % P : 0, dir = nd.normals[idx] || [0, 1, 0], p0 = nd.points[idx] || [0, 0, 0];
      const v0 = nd.v !== undefined ? nd.v : sys.vMin + (sys.vMax - sys.vMin) * h(12);
      let x = p0[0], y = p0[1], z = p0[2], vx = dir[0] * v0, vy = dir[1] * v0, vz = dir[2] * v0, tau = 0;
      while (tau < age - 1e-9) {
        const s = Math.min(dt, age - tau), tv = tau / li;
        vx += g[0] * s; vy += g[1] * s; vz += g[2] * s;
        if (sys.radial) { const l = Math.hypot(x, y, z); if (l > 1e-9) { vx += x / l * sys.radial * s; vy += y / l * sys.radial * s; vz += z / l * sys.radial * s; } }
        if (d0 > 0) {
          const dmp = d0 * Math.max(0, 1 - tv / de), vl = Math.hypot(vx, vy, vz), nv = vl - dmp * s;
          if (nv <= 0) { vx = 0; vy = 0; vz = 0; } else { const q = nv / vl; vx *= q; vy *= q; vz *= q; }
        }
        x += vx * s; y += vy * s; z += vz * s;
        tau += s;
      }
      const ang = sys.angle[0] + (sys.angle[1] - sys.angle[0]) * h(13) + age * (sys.angVel[0] + (sys.angVel[1] - sys.angVel[0]) * h(14));
      const sc = nd.scale !== undefined ? nd.scale : sys.scale[0] + (sys.scale[1] - sys.scale[0]) * h(15);
      out.push({ p: [sys.emit[0] + x, sys.emit[1] + y, sys.emit[2] + z], s: sys.quad * sc, a: ang * Math.PI / 180,
                 f: fx3dStripCell(sys.strip, nd.variant, age / li) });
    }
  }
  return out;
}
// THE DAMPING, FITTED. 2D drag is exponential (dv/dt = g - k v); Godot's damping takes damp x curve(t) off the speed's length
// each second. Of a grid of (damp0, where its curve reaches 0), the one whose paths (thrown level, up, down and at 45
// degrees, at the mean speed, under the same gravity, stepped as fx3dParticleSim steps) stay nearest the 2D paths over the
// life. No drag: no damping. Deterministic (a fixed grid). `free`: the 2D drag slows the launch only and gravity falls free
// (the pixel layer's flight), not the whole velocity (vfx.js's particles).
var FX3D_DAMP_ENDS = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 3, 5, 10, 100];
function fx3dFitDamping(vbar, gy, k, L, free) {
  if (!(k > 0) || !(L > 0) || !(vbar > 0 || gy)) return { damp0: 0, dampEnd: 1 };
  const dirs = [[1, 0], [0, 1], [0, -1], [0.7071, 0.7071]], N = 12, dt = 1 / 60;
  const ref = dirs.map((d) => {
    const out = [];
    for (let j = 1; j <= N; j++) {
      const t = L * j / N, e = (1 - Math.exp(-k * t)) / k;
      out.push(free ? [d[0] * vbar * e, d[1] * vbar * e + 0.5 * gy * t * t] : [d[0] * vbar * e, (gy / k) * t + (d[1] * vbar - gy / k) * e]);
    }
    return out;
  });
  const err = (d0, de) => {
    let E = 0;
    dirs.forEach((d, n) => {
      let x = 0, y = 0, vx = d[0] * vbar, vy = d[1] * vbar, tau = 0, j = 1;
      while (j <= N) {
        const tj = L * j / N;
        if (tau >= tj - 1e-9) { const r = ref[n][j - 1]; E += (x - r[0]) * (x - r[0]) + (y - r[1]) * (y - r[1]); j++; continue; }
        const s = Math.min(dt, tj - tau);
        vy += gy * s;
        const dm = d0 * Math.max(0, 1 - (tau / L) / de), vl = Math.hypot(vx, vy), nv = vl - dm * s;
        if (nv <= 0) { vx = 0; vy = 0; } else { vx *= nv / vl; vy *= nv / vl; }
        x += vx * s; y += vy * s; tau += s;
      }
    });
    return E;
  };
  let best = { damp0: 0, dampEnd: 1 }, bestE = err(0, 1);
  const top = Math.max(vbar * k * 2, Math.abs(gy) * 2, 1e-6);
  for (let a = 1; a <= 24; a++) for (const de of FX3D_DAMP_ENDS) {
    const d0 = top * a / 24, e = err(d0, de);
    if (e < bestE - 1e-12) { bestE = e; best = { damp0: +d0.toFixed(4), dampEnd: de }; }
  }
  return best;
}
// the seconds a one-shot system is busy (its last particle gone), from the effect's start
function fx3dSystemEnd(sys) {
  let e = 0;
  for (const nd of sys.nodes) e = Math.max(e, nd.start + (nd.amount > 1 ? (1 - sys.explosiveness) * (nd.life || sys.lifetime) : 0) + (nd.life || sys.lifetime));
  return e;
}

// ---- the geometry forms, measured from the frames ----
// Every drawn pixel (alpha 64 and over) of every frame, its polar place round the emitter: an ARC is the annulus sector
// holding them (the angles: all but the widest empty gap round the circle; the radii: 1 % to 99 %); a RING is each
// frame's own annulus (2 % to 98 %, the ellipse a flat effect is drawn as stretched round by `depth`); a BEAM the box along
// its direction from the emitter (its length to 99 %, its half-width to 99 % of the drawn pixels off its axis).
function fx3dQuantBins(H, binW, q) {
  let tot = 0; for (let i = 0; i < H.length; i++) tot += H[i];
  if (!tot) return 0;
  let acc = 0; const want = tot * q;
  for (let i = 0; i < H.length; i++) { acc += H[i]; if (acc >= want) return (i + 0.5) * binW; }
  return H.length * binW;
}
function fx3dEachDrawn(frames, fn) {
  frames.forEach((F, f) => {
    const d = F.data, w = F.w;
    for (let p = 0, n = F.w * F.h; p < n; p++) if (d[p * 4 + 3] >= 64) fn(p % w + 0.5, ((p / w) | 0) + 0.5, f);
  });
}
function fx3dArcSpec(frames, origin) {
  const NB = 72, A = new Float64Array(NB), BW = 0.5, R = new Float64Array(2400);
  let tot = 0;
  fx3dEachDrawn(frames, (x, y) => {
    const dx = x - origin.x, dy = y - origin.y, r = Math.hypot(dx, dy);
    A[Math.min(NB - 1, Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * NB))]++;
    R[Math.min(R.length - 1, Math.floor(r / BW))]++; tot++;
  });
  if (!tot) return null;
  // the widest run of empty bins, round the circle
  const occ = (i) => A[((i % NB) + NB) % NB] > tot * 0.0015;
  let best = 0, bestAt = -1;
  for (let i = 0; i < NB; i++) {
    if (occ(i) || !occ(i - 1)) continue;                           // an empty run starts here, after a drawn bin
    let n = 0; while (n < NB && !occ(i + n)) n++;
    if (n > best) { best = n; bestAt = i; }
  }
  let a0 = -Math.PI, a1 = Math.PI;
  if (best > 0 && best < NB) {
    const first = bestAt + best;                                   // the first drawn bin after the gap
    a0 = (first / NB) * Math.PI * 2 - Math.PI - (Math.PI / NB);
    a1 = a0 + ((NB - best) / NB) * Math.PI * 2 + (2 * Math.PI / NB);
  }
  const r0 = Math.max(0, fx3dQuantBins(R, BW, 0.01) - 1.5), r1 = fx3dQuantBins(R, BW, 0.99) + 1.5;
  return { kind: "arc", cx: +origin.x.toFixed(2), cy: +origin.y.toFixed(2), r0: +r0.toFixed(2), r1: +r1.toFixed(2), a0: +a0.toFixed(4), a1: +a1.toFixed(4) };
}
function fx3dRingSpec(frames, origin, depth) {
  const dz = depth > 0 ? depth : 1, BW = 0.5, rin = [], rout = [];
  let rmax = 0;
  const per = frames.map(() => new Float64Array(2400));
  fx3dEachDrawn(frames, (x, y, f) => { const r = Math.hypot(x - origin.x, (y - origin.y) * dz); per[f][Math.min(2399, Math.floor(r / BW))]++; });
  for (const H of per) {
    let any = 0; for (let i = 0; i < H.length; i++) any += H[i];
    if (!any) { rin.push(0); rout.push(0); continue; }
    const a = Math.max(0, fx3dQuantBins(H, BW, 0.02) - 1), b = fx3dQuantBins(H, BW, 0.98) + 1;
    rin.push(+a.toFixed(2)); rout.push(+b.toFixed(2)); rmax = Math.max(rmax, b);
  }
  if (!rmax) return null;
  return { kind: "ring", cx: +origin.x.toFixed(2), cy: +origin.y.toFixed(2), depth: +dz.toFixed(4), rin: rin, rout: rout, rmax: +rmax.toFixed(2) };
}
function fx3dBeamSpec(frames, origin, ang) {
  const dx = Math.cos(ang), dy = Math.sin(ang), BW = 0.5, S = new Float64Array(4000), Wd = new Float64Array(2400);
  let tot = 0, sMin = 0;
  fx3dEachDrawn(frames, (x, y) => {
    const px = x - origin.x, py = y - origin.y, s = px * dx + py * dy, w = -px * dy + py * dx;
    if (s >= 0) S[Math.min(S.length - 1, Math.floor(s / BW))]++; else sMin = Math.min(sMin, s);
    Wd[Math.min(Wd.length - 1, Math.floor(Math.abs(w) / BW))]++; tot++;
  });
  if (!tot) return null;
  return { kind: "beam", sx: +origin.x.toFixed(2), sy: +origin.y.toFixed(2), ang: +ang.toFixed(4), s0: +Math.max(-24, sMin - 1).toFixed(2),
           s1: +(fx3dQuantBins(S, BW, 0.99) + 1).toFixed(2), hw: +(fx3dQuantBins(Wd, BW, 0.99) + 1).toFixed(2) };
}
// the beam's direction (2D, radians): the Beam layer's, else the pixel stroke's
function fx3dBeamAngle(st) { return +st.beam > 0 ? (+st.beamAngle - 90) * Math.PI / 180 : (+st.pixAngle || 0) * Math.PI / 180; }

// WHERE A GEOMETRY VERTEX GOES, (u, v) in 0..1 across its strip, in meters from its node (-Z forward, Y up), and the frame
// pixel it shows. The Godot shader (fx3dShapeShader) does exactly this per vertex, so the room and the scene agree.
//   arc   the frame laid in the swing plane, turned so the arc's middle points straight ahead (-Z), its sweep across the
//         view; the plane leans FX3D_ARC_TILT above level ahead
//   ring  on the floor, the frame's y along +Z (as a flat effect lies), un-squashed by depth
//   beam  along `axis` (the node's local; default the 2D direction in the card's plane), across `side` (set per camera)
function fx3dArcVertex(sp, u, v, m) {
  const th = sp.a0 + (sp.a1 - sp.a0) * u, r = sp.r0 + (sp.r1 - sp.r0) * v, dx = Math.cos(th) * r, dy = Math.sin(th) * r;
  const tl = FX3D_ARC_TILT * Math.PI / 180, q = th - (sp.a0 + sp.a1) / 2 - Math.PI / 2, ex = Math.cos(q) * r, ey = Math.sin(q) * r;
  return { p: [ex * m, -ey * m * Math.sin(tl), ey * m * Math.cos(tl)], fp: [sp.cx + dx, sp.cy + dy] };
}
function fx3dRingVertex(sp, f, u, v, m) {
  const th = u * Math.PI * 2, r = (sp.rin[f] || 0) + ((sp.rout[f] || 0) - (sp.rin[f] || 0)) * v;
  return { p: [Math.cos(th) * r * m, 0, Math.sin(th) * r * m], fp: [sp.cx + Math.cos(th) * r, sp.cy + Math.sin(th) * r / sp.depth] };
}
function fx3dBeamVertex(sp, u, v, m, axis, side, stretch) {
  const s = sp.s0 + (sp.s1 - sp.s0) * u, w = (v * 2 - 1) * sp.hw, k = stretch || 1, d = [Math.cos(sp.ang), Math.sin(sp.ang)];
  return { p: [axis[0] * s * m * k + side[0] * w * m, axis[1] * s * m * k + side[1] * w * m, axis[2] * s * m * k + side[2] * w * m],
           fp: [sp.sx + d[0] * s - d[1] * w, sp.sy + d[1] * s + d[0] * w] };
}
// the strip's grid (Godot's PlaneMesh subdivisions): segments along u, across v
var FX3D_GRID = { arc: [32, 2], ring: [64, 1], beam: [16, 1] };
// meters per frame pixel for a geometry form: an arc reaches FX3D_ARC_REACH (or d3Size across), a ring and a beam as their
// effect's size says (a ring sized as a flat effect lies)
function fx3dShapeMpp(sp, st, mppEffect, mppFlat) {
  if (sp.kind === "arc") return +st.d3Size > 0 ? +st.d3Size / Math.max(1, 2 * sp.r1) : FX3D_ARC_REACH / Math.max(1, sp.r1);
  if (sp.kind === "ring") return mppFlat || mppEffect;
  return mppEffect;
}

// ---- what the room draws for a 3D-native form, one frame ----
// S: { form, systems, strips (one RGBA per system), spec, frames (the effect's full frames), mpp (geometry), node [x,y,z]
// (the scene's node in the room), alpha "cut" | "blend", eye (a first-person camera) }; cam: room3dRender's camera
// { e, f, r, u } (eye, forward, right, up); fi the frame, t its time. Returns { parts, tris } in world meters:
//   parts [{ p, s, a, img, cell: [x, y, w, h], mode }]   camera-facing quads (BILLBOARD_PARTICLES: the camera's own axes)
//   tris  [{ v: [p0, p1, p2], fp: [q0, q1, q2], img, mode }]   textured triangles, fp the frame pixel at each corner
function fx3dRoomDraws(S, fi, t, cam) {
  const out = { parts: [], tris: [] };
  if (!S) return out;
  if (S.form === "particles") {
    S.systems.forEach((sys, i) => {
      const img = S.strips[i], C = sys.strip.C, K = sys.strip.K, node = S.node;
      for (const q of fx3dParticleSim(sys, t)) {
        out.parts.push({ p: [node[0] + q.p[0], node[1] + q.p[1], node[2] + q.p[2]], s: q.s, a: q.a, img: img,
                         cell: [(q.f % K) * C, Math.floor(q.f / K) * C, C, C], mode: sys.blend });
      }
    });
    return out;
  }
  const sp = S.spec, F = S.frames && S.frames[fi];
  if (!sp || !F) return out;
  const m = S.mpp, mode = S.alpha === "blend" ? "mix" : "cut";
  // the node's frame: where it stands and which way is ahead (a level forward from the camera: the swing, the shot)
  const fh = fx3dNorm([cam.f[0], 0, cam.f[2]]), right = fx3dNorm([-fh[2], 0, fh[0]]);
  let o = S.node, X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  if (sp.kind === "arc") {
    o = S.eye ? [cam.e[0] + fh[0] * 0.15, cam.e[1] - 0.45, cam.e[2] + fh[2] * 0.15] : [S.node[0], Math.max(0.9, S.node[1]), S.node[2]];
    X = right; Z = [-fh[0], 0, -fh[2]];
  } else if (sp.kind === "ring") o = [S.node[0], 0.012, S.node[2]];
  const W = (lp) => [o[0] + X[0] * lp[0] + Y[0] * lp[1] + Z[0] * lp[2], o[1] + X[1] * lp[0] + Y[1] * lp[1] + Z[1] * lp[2], o[2] + X[2] * lp[0] + Y[2] * lp[1] + Z[2] * lp[2]];
  const [NU, NV] = FX3D_GRID[sp.kind];
  let vert;
  if (sp.kind === "arc") vert = (u, v) => fx3dArcVertex(sp, u, v, m);
  else if (sp.kind === "ring") vert = (u, v) => fx3dRingVertex(sp, fi, u, v, m);
  else {
    // the beam: from its node along the 2D direction (a first-person camera: straight ahead from the hip), its width
    // turned about its axis to face the camera
    let axis = fx3dDir2(sp.ang);
    if (S.eye) { o = [cam.e[0] + right[0] * 0.25 + fh[0] * 0.2, cam.e[1] - 0.3, cam.e[2] + right[2] * 0.25 + fh[2] * 0.2]; axis = fh; }
    const toCam = fx3dNorm([cam.e[0] - o[0], cam.e[1] - o[1], cam.e[2] - o[2]]);
    let side = fx3dCross(axis, toCam);
    side = Math.hypot(side[0], side[1], side[2]) < 1e-5 ? [0, 1, 0] : fx3dNorm(side);
    vert = (u, v) => fx3dBeamVertex(sp, u, v, m, axis, side, 1);
  }
  for (let a = 0; a < NU; a++) for (let b = 0; b < NV; b++) {
    const q = [vert(a / NU, b / NV), vert((a + 1) / NU, b / NV), vert((a + 1) / NU, (b + 1) / NV), vert(a / NU, (b + 1) / NV)];
    const P = q.map((x) => W(x.p)), Q = q.map((x) => x.fp);
    out.tris.push({ v: [P[0], P[1], P[2]], fp: [Q[0], Q[1], Q[2]], img: F, mode: mode });
    out.tris.push({ v: [P[0], P[2], P[3]], fp: [Q[0], Q[2], Q[3]], img: F, mode: mode });
  }
  return out;
}

// THE FORM'S MAKINGS, for the scene and the room alike. `cx`: fx3dParticleSystems's, plus `mppFlat` (meters per pixel were
// it lying flat: a ring's size). `frames` the effect's own frames ({ w, h, data }). null: nothing of that kind is drawn.
function fx3dShapesOf(st, form, cx, frames) {
  if (form === "particles") { const sy = fx3dParticleSystems(st, cx); return sy.length ? { form: form, systems: sy } : null; }
  let sp = null;
  if (form === "arc") sp = fx3dArcSpec(frames, cx.origin);
  else if (form === "ring") sp = fx3dRingSpec(frames, cx.origin, fx3dFlatDepth(st));
  else if (form === "beam") sp = fx3dBeamSpec(frames, cx.origin, fx3dBeamAngle(st));
  return sp ? { form: form, spec: sp, mpp: +fx3dShapeMpp(sp, st, cx.mpp, cx.mppFlat).toFixed(6) } : null;
}

// ---- the Godot side ----
// a form's mesh shader (<base>_3d.gdshader): the vertex placed and given its frame pixel as fx3d*Vertex does, the frame's
// region of the sheet (the 2D SpriteFrames' own AtlasTexture, set by the script each frame) drawn on it
function fx3dShapeShader(kind, alpha) {
  const cut = alpha !== "blend";
  const vx = {
    arc: ["\tfloat th = mix(angles.x, angles.y, UV.x);", "\tfloat r = mix(radii.x, radii.y, UV.y);", "\tfp = center + vec2(cos(th), sin(th)) * r;",
          "\t// turned so the arc's middle points straight ahead (-Z)", "\tfloat q = th - (angles.x + angles.y) * 0.5 - PI * 0.5;",
          "\tvec2 e = vec2(cos(q), sin(q)) * r;", "\tVERTEX = vec3(e.x * mpp, -e.y * mpp * sin(tilt), e.y * mpp * cos(tilt));"],
    ring: ["\tfloat th = UV.x * TAU;", "\tfloat r = mix(r_in, r_out, UV.y);", "\tfp = center + vec2(cos(th), sin(th) / depth) * r;",
           "\tVERTEX = vec3(cos(th) * r * mpp, 0.0, sin(th) * r * mpp);"],
    beam: ["\tfloat s = mix(span.x, span.y, UV.x);", "\tfloat w = (UV.y * 2.0 - 1.0) * half_width;", "\tvec2 d = vec2(cos(angle), sin(angle));",
           "\tfp = start + d * s + vec2(-d.y, d.x) * w;", "\tvec3 a = normalize(axis);", "\tvec3 p = a * s * mpp * stretch;",
           "\t// its width turned about its axis to face the camera", "\tvec3 cam = (inverse(MODEL_MATRIX) * vec4(INV_VIEW_MATRIX[3].xyz, 1.0)).xyz;",
           "\tvec3 side = cross(a, cam - p);", "\tside = length(side) < 0.00001 ? vec3(0.0, 1.0, 0.0) : normalize(side);",
           "\tVERTEX = p + side * w * mpp;"],
  }[kind];
  const un = {
    arc: ["uniform vec2 center;", "uniform vec2 radii;", "uniform vec2 angles;", "uniform float tilt = 0.35;"],
    ring: ["uniform vec2 center;", "uniform float r_in = 0.0;", "uniform float r_out = 0.0;", "uniform float depth = 1.0;"],
    beam: ["uniform vec2 start;", "uniform float angle = 0.0;", "uniform vec2 span;", "uniform float half_width = 1.0;",
           "uniform vec3 axis = vec3(1.0, 0.0, 0.0);", "uniform float stretch = 1.0;"],
  }[kind];
  return ["shader_type spatial;",
    "// CrunchyVFX: the effect as " + { arc: "a slash arc in the swing plane (its -Z ahead)", ring: "a ring on the floor that grows", beam: "a beam along its axis, turned to face the camera" }[kind] + ".",
    "// Each vertex is placed and given the frame pixel it shows exactly as CrunchyVFX's 3D room does; the scene's script",
    "// hands it each frame's region of the effect's own sheet (its SpriteFrames), so these are the effect's own pixels.",
    "render_mode unshaded, cull_disabled, " + (cut ? "depth_draw_opaque" : "blend_mix, depth_draw_never") + ";",
    "uniform sampler2D atlas : source_color, filter_nearest;",
    "uniform vec4 region = vec4(0.0, 0.0, 1.0, 1.0);",
    "uniform vec2 margin = vec2(0.0);",
    "uniform float mpp = 0.01;"].concat(un, ["varying vec2 fp;", "", "void vertex() {"], vx, ["}", "", "void fragment() {",
    "\tvec2 ap = region.xy + floor(fp) - margin;",
    "\tif (ap.x < region.x || ap.y < region.y || ap.x >= region.x + region.z || ap.y >= region.y + region.w) {", "\t\tdiscard;", "\t}",
    "\tvec4 c = texture(atlas, (ap + 0.5) / vec2(textureSize(atlas, 0)));"],
    cut ? ["\tif (c.a < 0.5) {", "\t\tdiscard;", "\t}", "\tALBEDO = c.rgb;"] : ["\tALBEDO = c.rgb;", "\tALPHA = c.a;"], ["}", ""]).join("\n");
}
var FX3D_SYS_NODE = { A: "Particles", B: "ParticlesB", blob: "Blobs", core: "Core", spark: "Sparks" };
function fx3dV3(a) { return "Vector3(" + a.map(fx3dNum).join(", ") + ")"; }
// the damping's curve: 1 falling straight to 0 at dampEnd of the life (past the end: what it has fallen to by then)
function fx3dDampCurve(id, de) {
  const x = Math.min(1, de), y = de <= 1 ? 0 : 1 - 1 / de, sl = -1 / de;
  const pts = ["Vector2(0, 1), 0.0, " + fx3dNum(sl) + ", 0, 1", "Vector2(" + fx3dNum(x) + ", " + fx3dNum(y) + "), " + fx3dNum(sl) + ", 0.0, 1, " + (x < 1 ? 1 : 0)];
  if (x < 1) pts.push("Vector2(1, 0), 0.0, 0.0, 1, 0");
  return '[sub_resource type="Curve" id="' + id + '"]\n_data = [' + pts.join(", ") + "]\npoint_count = " + pts.length + "\n";
}
// The scene's 3D-native parts: { res (ext_resource lines), subs (sub_resource blocks), nodes (node blocks), props (the root's
// exported values) }. p: fx3dTscn's, with p.shapes = fx3dShapesOf's + { stripFiles, shaderFile, fps }.
function fx3dShapesTscn(p) {
  const S = p.shapes, res = [], subs = [], nodes = [], props = [];
  if (S.form === "particles") {
    const starts = [];
    S.systems.forEach((sys, i) => {
      res.push('[ext_resource type="Texture2D" path="' + S.stripFiles[i] + '" id="fxt' + i + '"]');
      const st = sys.strip;
      subs.push('[sub_resource type="StandardMaterial3D" id="fxm' + i + '"]\n' +
        (sys.blend === "cut" ? "transparency = 2\nalpha_scissor_threshold = 0.5\n" : "transparency = 1\n") +
        (sys.blend === "add" ? "blend_mode = 1\n" : "") +
        "shading_mode = 0\nvertex_color_use_as_albedo = true\nalbedo_texture = ExtResource(\"fxt" + i + "\")\ntexture_filter = 0\n" +
        "billboard_mode = 3\nparticles_anim_h_frames = " + st.K + "\nparticles_anim_v_frames = " + (st.V || 1) + "\nparticles_anim_loop = false\n");
      subs.push('[sub_resource type="QuadMesh" id="fxq' + i + '"]\nmaterial = SubResource("fxm' + i + '")\nsize = Vector2(' + fx3dNum(sys.quad) + ", " + fx3dNum(sys.quad) + ")\n");
      if (sys.damp0 > 0) subs.push(fx3dDampCurve("fxd" + i, sys.dampEnd));
      const name = FX3D_SYS_NODE[sys.src] || "Particles", one = sys.nodes.length === 1;
      const at = "transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, " + sys.emit.map(fx3dNum).join(", ") + ")\n";
      if (!one) nodes.push('[node name="' + name + '" type="Node3D" parent="."]\n' + at);
      sys.nodes.forEach((nd, j) => {
        const A = fx3dStripAnim(st, nd.variant), life = nd.life || sys.lifetime;
        const L = ['[node name="' + (one ? name : name.replace(/s$/, "") + (j + 1)) + '" type="CPUParticles3D" parent="' + (one ? "." : name) + '"]'];
        if (one) L.push(at.trim());
        L.push("emitting = false", "amount = " + nd.amount, "lifetime = " + fx3dNum(life));
        L.push(sys.loop ? "preprocess = " + fx3dNum(life) : "one_shot = true");
        if (nd.amount > 1) L.push("explosiveness = " + fx3dNum(sys.explosiveness));
        if (!nd.life && sys.lifeRand > 0) L.push("lifetime_randomness = " + fx3dNum(sys.lifeRand));
        L.push("use_fixed_seed = true", "seed = " + nd.seed);
        if (sys.blend === "mix") L.push("draw_order = 2");
        L.push('mesh = SubResource("fxq' + i + '")', "emission_shape = 5",
          "emission_points = PackedVector3Array(" + nd.points.map((q) => q.map(fx3dNum).join(", ")).join(", ") + ")",
          "emission_normals = PackedVector3Array(" + nd.normals.map((q) => q.map(fx3dNum).join(", ")).join(", ") + ")",
          "direction = Vector3(0, 0, 1)", "spread = 0.0", "gravity = " + fx3dV3(sys.gravity),
          "initial_velocity_min = " + fx3dNum(nd.v !== undefined ? nd.v : sys.vMin), "initial_velocity_max = " + fx3dNum(nd.v !== undefined ? nd.v : sys.vMax));
        if (sys.angVel[0] || sys.angVel[1]) L.push("angular_velocity_min = " + fx3dNum(sys.angVel[0]), "angular_velocity_max = " + fx3dNum(sys.angVel[1]));
        if (sys.radial) L.push("radial_accel_min = " + fx3dNum(sys.radial), "radial_accel_max = " + fx3dNum(sys.radial));
        if (sys.damp0 > 0) L.push("damping_min = " + fx3dNum(sys.damp0), "damping_max = " + fx3dNum(sys.damp0), 'damping_curve = SubResource("fxd' + i + '")');
        if (sys.angle[0] || sys.angle[1]) L.push("angle_min = " + fx3dNum(sys.angle[0]), "angle_max = " + fx3dNum(sys.angle[1]));
        const sc = nd.scale !== undefined ? [nd.scale, nd.scale] : sys.scale;
        L.push("scale_amount_min = " + fx3dNum(sc[0]), "scale_amount_max = " + fx3dNum(sc[1]),
          "anim_speed_min = " + fx3dNum(A.speed), "anim_speed_max = " + fx3dNum(A.speed),
          "anim_offset_min = " + fx3dNum(A.offset), "anim_offset_max = " + fx3dNum(A.offset));
        nodes.push(L.join("\n") + "\n");
        starts.push(Math.max(0, Math.round(nd.start * (S.fps || 24))));
      });
    });
    props.push("particle_frames = PackedInt32Array(" + starts.join(", ") + ")");
  } else {
    const sp = S.spec, k = sp.kind;
    res.push('[ext_resource type="Shader" path="' + S.shaderFile + '" id="fxs"]');
    const u = ["mpp = " + fx3dNum(S.mpp)];
    if (k === "arc") u.push("center = Vector2(" + fx3dNum(sp.cx) + ", " + fx3dNum(sp.cy) + ")", "radii = Vector2(" + fx3dNum(sp.r0) + ", " + fx3dNum(sp.r1) + ")",
      "angles = Vector2(" + fx3dNum(sp.a0) + ", " + fx3dNum(sp.a1) + ")", "tilt = " + fx3dNum(+(FX3D_ARC_TILT * Math.PI / 180).toFixed(5)));
    if (k === "ring") u.push("center = Vector2(" + fx3dNum(sp.cx) + ", " + fx3dNum(sp.cy) + ")", "depth = " + fx3dNum(sp.depth));
    if (k === "beam") {
      const ax = fx3dDir2(sp.ang);
      u.push("start = Vector2(" + fx3dNum(sp.sx) + ", " + fx3dNum(sp.sy) + ")", "angle = " + fx3dNum(sp.ang), "span = Vector2(" + fx3dNum(sp.s0) + ", " + fx3dNum(sp.s1) + ")",
        "half_width = " + fx3dNum(sp.hw), "axis = " + fx3dV3(ax.map((v) => +v.toFixed(5))));
      props.push("beam_length = " + fx3dNum(+(sp.s1 * S.mpp).toFixed(5)));
    }
    if (k === "ring") props.push("ring_in = PackedFloat32Array(" + sp.rin.map(fx3dNum).join(", ") + ")", "ring_out = PackedFloat32Array(" + sp.rout.map(fx3dNum).join(", ") + ")");
    subs.push('[sub_resource type="ShaderMaterial" id="fxsm"]\nresource_local_to_scene = true\nrender_priority = 0\nshader = ExtResource("fxs")\n' +
      u.map((x) => "shader_parameter/" + x).join("\n") + "\n");
    const G = FX3D_GRID[k];
    subs.push('[sub_resource type="PlaneMesh" id="fxpm"]\nsize = Vector2(1, 1)\nsubdivide_width = ' + (G[0] - 1) + "\nsubdivide_depth = " + (G[1] - 1) + "\n");
    nodes.push('[node name="Shape" type="MeshInstance3D" parent="."]\n' + (k === "ring" ? "transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.012, 0)\n" : "") +
      "visible = false\nextra_cull_margin = 8.0\nmesh = SubResource(\"fxpm\")\nmaterial_override = SubResource(\"fxsm\")\n");
  }
  return { res: res, subs: subs, nodes: nodes, props: props };
}
// the 3D script's lines for a form (fx3dScript adds them): the particle emitters start on their frames, the mesh shows each
// frame of the sheet; a beam can be aimed
function fx3dShapesScriptLines(form) {
  const L = ["", "# ---- " + { particles: "the 3D particles", arc: "the slash arc", beam: "the beam", ring: "the ring on the floor" }[form] + " (CrunchyVFX: In 3D as " + FX3D_FORM_WORDS[FX3D_FORMS.indexOf(form)].toLowerCase() + ") ----"];
  if (form === "particles") L.push(
    "# Each CPUParticles3D below this node starts on its frame of the effect (a one-shot bursts again on every play, a loop",
    "# keeps emitting until stop()). Tune them in the inspector as any Godot particles.");
  else L.push("# The mesh \"Shape\" shows each frame of the effect's own sheet; the sprite stays as the clock (hidden).");
  L.push("func _shape(f: int) -> void:");
  if (form === "particles") L.push(
    "\tif f < 0:", "\t\tfor p in _parts:", "\t\t\tp.emitting = false", "\t\treturn",
    "\tfor i in _parts.size():", "\t\tif f == (particle_frames[i] if i < particle_frames.size() else 0):",
    "\t\t\tif _parts[i].one_shot:", "\t\t\t\t_parts[i].restart(true)", "\t\t\telif not _parts[i].emitting:", "\t\t\t\t_parts[i].emitting = true",
    "", "func _collect(n: Node) -> void:", "\tfor c in n.get_children():", "\t\tif c is CPUParticles3D:", "\t\t\t_parts.append(c)", "\t\t_collect(c)");
  else {
    L.push("\tif not _shape_mesh:", "\t\treturn", "\tif f < 0:", "\t\t_shape_mesh.visible = false", "\t\treturn",
      "\tvar tex := _sprite.sprite_frames.get_frame_texture(_sprite.animation, f) as AtlasTexture",
      "\tvar m := _shape_mesh.material_override as ShaderMaterial",
      "\tif tex and m:", "\t\tm.set_shader_parameter(\"atlas\", tex.atlas)",
      "\t\tm.set_shader_parameter(\"region\", Vector4(tex.region.position.x, tex.region.position.y, tex.region.size.x, tex.region.size.y))",
      "\t\tm.set_shader_parameter(\"margin\", tex.margin.position)");
    if (form === "ring") L.push("\tif m and f < ring_in.size():", "\t\tm.set_shader_parameter(\"r_in\", ring_in[f])", "\t\tm.set_shader_parameter(\"r_out\", ring_out[f])");
    L.push("\t_shape_mesh.visible = tex != null");
    if (form === "beam") L.push("", "## Points the beam at a place in the world; it stretches to reach it.", "func aim(at: Vector3) -> void:",
      "\tif not _shape_mesh:", "\t\treturn", "\tvar local := _shape_mesh.to_local(at)", "\tvar m := _shape_mesh.material_override as ShaderMaterial",
      "\tm.set_shader_parameter(\"axis\", local.normalized())", "\tm.set_shader_parameter(\"stretch\", local.length() / maxf(0.001, beam_length))");
  }
  return L;
}
// </vfx13-shapes>
// <vfx13-shapes>
// <base>_3d.json's "form": what a 3D-native form is, for an engine without the scene (the strips, the numbers, the mesh)
function fx3dShapesJson(S) {
  if (S.form === "particles") return { kind: "particles", note: "each system's sprite strip: K cells of its life along, a row per hue; a cell is shown for a particle t of the way through its life: row x K + floor(0.5 + t x (K - 1))",
    systems: S.systems.map((sys, i) => ({ strip: S.stripFiles ? S.stripFiles[i] : undefined, cells: sys.strip.K, rows: sys.strip.V || 1, quad: sys.quad,
      busyUntil: sys.loop ? undefined : +fx3dSystemEnd(sys).toFixed(4),
      blend: sys.blend, loop: sys.loop, lifetime: sys.lifetime, lifeRandom: sys.lifeRand, explosiveness: sys.explosiveness,
      speed: [sys.vMin, sys.vMax], gravity: sys.gravity, damping: sys.damp0 ? { start: sys.damp0, endsAt: sys.dampEnd } : undefined,
      emitter: sys.emit.map((v) => +v.toFixed(4)), nodes: sys.nodes.map((nd) => ({ amount: nd.amount, start: nd.start, row: nd.variant, lifetime: nd.life || sys.lifetime,
        points: nd.points.map((q) => q.map((v) => +v.toFixed(4))), normals: nd.normals.map((q) => q.map((v) => +v.toFixed(4))) })) })) };
  const sp = S.spec;
  return Object.assign({ kind: sp.kind, metersPerPixel: S.mpp, note: { arc: "an annulus sector round (cx, cy) from a0 to a1 (radians, y down) and r0 to r1 (frame px), laid in the swing plane: frame x to the right, frame up leaning tilt above level ahead (-Z)",
    ring: "an annulus on the floor round (cx, cy), radii rin..rout per frame (frame px, the ellipse stretched by depth)", beam: "a strip from (sx, sy) along ang (radians, y down) from s0 to s1, half-width hw (frame px), turned about its axis to face the camera" }[sp.kind],
    tilt: sp.kind === "arc" ? FX3D_ARC_TILT : undefined }, sp);
}
// the README's lines for a form (fx3dReadme adds them when any effect has one)
function fx3dShapesReadme(infos) {
  const L = [], seen = {};
  for (const i of infos) {
    const f = i.d3 && i.d3.form;
    if (!f || f === "card" || seen[f]) continue;
    seen[f] = 1;
    L.push({
      particles: "  Particles in 3D: the effect's particles are CPUParticles3D below the node (each wearing its own sprite, baked over its life\n  as <name>_3d_p<n>.png), bursting round it in 3D; what is not a particle stays on the card. They start on their frames\n  (`particle_frames`) and are ordinary Godot particles: tune amount, speed or gravity in the inspector.",
      arc: "  A slash arc: the frames drawn on a curved strip in the swing plane, ahead of the node (its -Z). Spawn it at the hand with the\n  camera's (or the player's) basis and it sweeps across the view, a first-person swing: fx.global_transform = camera.global_transform",
      beam: "  A beam: the frames on a strip from the node out along the beam, turned about its axis to face the camera.\n  fx.aim(target_position) points it at a place and stretches it to reach.",
      ring: "  A ring on the floor: a ring mesh lying on the ground that grows with the frames. Put the node on the floor.",
    }[f]);
  }
  return L;
}
// </vfx13-shapes>

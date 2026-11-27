// GENERATED from crunchyCore/ramps.js @ bfc9f4a by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 6dbf07b6882057fd336bc7500d331f671dba83ed4a12b4601e99ea7e97e9eede
"use strict";
// CrunchyTexture prototype: color RAMPS for texture-lab.js's levels. A ramp is 6 colors, darkest first, hand-picked with
// a small hue shift (cool shadows, warm lights) the way PS1 texture artists did. A texture with n levels takes n of
// them, spread from the darkest to the lightest. Pure data plus two helpers; loaded by the page and by the sheet tool.

const CT_RAMPS_BUILD = 3;   // crunchyCore's stamp (moved from CrunchyTexture, 2026-11-17; 2: CT_SET_COLORS, 2026-11-22; 3: CT_TEX_RAMP, 2026-11-23)
const CT_RAMPS = {
  stone:    { title: "Stone gray",   c: ["#141519", "#2a2b31", "#44444a", "#625f5c", "#86817a", "#aca698"] },
  torch:    { title: "Torchlit",     c: ["#1a0f0a", "#3b2014", "#66381e", "#94582a", "#c4843e", "#ecbd6a"] },
  sickly:   { title: "Sickly green", c: ["#0e130b", "#1f2b17", "#354522", "#536430", "#7a8a44", "#a8b067"] },
  cold:     { title: "Cold blue",    c: ["#0b0f1c", "#16223a", "#263c5c", "#3d5c80", "#6386a4", "#9cb8c8"] },
  crimson:  { title: "Crimson",      c: ["#140608", "#2e0c10", "#551419", "#842222", "#b4403a", "#dc7a62"] },
  violet:   { title: "Violet",       c: ["#0e0a18", "#221634", "#3a2456", "#593a7a", "#7f5c9e", "#ae8cc4"] },
  teal:     { title: "Teal",         c: ["#071414", "#0f2a2a", "#1a4442", "#2a625c", "#458a7c", "#78b8a0"] },
  gold:     { title: "Gold",         c: ["#18110a", "#33240f", "#5a4016", "#86621e", "#b48e34", "#e0c060"] },
  ivory:    { title: "Ivory",        c: ["#23201c", "#46403a", "#6c655a", "#96907e", "#c4bca4", "#ece4cc"] },
  wood:     { title: "Wood",         c: ["#140c08", "#2c1a10", "#48291a", "#683e24", "#8c5a34", "#b47e4e"] },
  neon:     { title: "Neon cyan",    c: ["#04080e", "#0a1a2a", "#0e3448", "#10606e", "#20a0a0", "#70e8d8"] },
  magenta:  { title: "Magenta",      c: ["#10060e", "#2a0c26", "#4c1244", "#7a1e6a", "#b4348e", "#f070b8"] },
  magma:    { title: "Magma",        c: ["#120604", "#2e0e06", "#5a1a08", "#962e0a", "#d45a12", "#ffa030"] },
  coral:    { title: "Coral",        c: ["#1a0c10", "#3a1a22", "#64303a", "#964c50", "#c87466", "#f0a890"] },
  olive:    { title: "Olive",        c: ["#12130a", "#262812", "#3e421c", "#5a5e28", "#7c7e3c", "#a4a45c"] },
  hazard:   { title: "Hazard",       c: ["#141006", "#2e260a", "#5a4a0e", "#8e7612", "#c8a818", "#f4dc4a"] },
  black:    { title: "Oil black",    c: ["#050506", "#0e0e13", "#1a1a22", "#2a2a35", "#3e3e4c", "#5c5c6c"] },
  leaf:     { title: "Leaf green",   c: ["#08120a", "#12281a", "#1e4426", "#2e6430", "#4a8a3a", "#80b452"] },
  sky:      { title: "Sky blue",     c: ["#0c1830", "#183060", "#2c5090", "#4878b8", "#78a4d8", "#b8d8f0"] },
  white:    { title: "Clinical",     c: ["#2a2c30", "#4a4e54", "#727880", "#9ea4aa", "#c8ccd0", "#eef0ee"] },
  // MATERIALS (2026-10-28): the ramps the materials below wear
  earth:    { title: "Earth",        c: ["#120c08", "#2a1c12", "#463020", "#644630", "#866044", "#aa8260"] },
  iron:     { title: "Iron",         c: ["#0c0e12", "#1e2228", "#363c44", "#545c66", "#7c8590", "#aab4bc"] },
  rust:     { title: "Rust",         c: ["#140806", "#30140c", "#542414", "#7c3a1c", "#a45a2c", "#c88448"] },
  autumn:   { title: "Autumn",       c: ["#180a06", "#3a160a", "#68280e", "#9a4612", "#cc7020", "#f0a840"] },
};

// MATERIALS (AJ, 2026-10-28: "better color... more colors automatically"): texture-lab marks WHAT a pixel is (its
// LAB_MATERIALS, build 14); each material wears its own ramp here, so a grass path's dirt is earth brown under green
// grass. Material 0 ("base") wears the set's ramp, or the palette you picked; the rest keep theirs (moss stays moss).
const CT_MAT_RAMPS = { earth: "earth", grass: "leaf", leaf: "leaf", bark: "wood", wood: "wood", stone: "stone", moss: "sickly",
  water: "teal", metal: "iron", rust: "rust", flower: "magenta", glow: "torch", bone: "ivory", ice: "cold", snow: "white",
  crystal: "neon", lava: "magma", ash: "black", sand: "gold", cloth: "crimson", blood: "crimson", gold: "gold", sky: "sky",
  star: "white", mortar: "stone", fire: "magma", rope: "gold", berry: "crimson", autumn: "autumn", foam: "white", coral: "coral",
  // build 18 (modern horror, TEXTURE-DESIGN.md §38): exposed plaster, black mold, a water stain's tea, concrete, glass, paper,
  // chalk, PAINT (a set's accent color: lockers, stripes; teal unless the set says), a fluorescent lamp, asphalt
  plaster: "ivory", mold: "black", stain: "ivory", concrete: "stone", glass: "cold", paper: "ivory", chalk: "white", paint: "teal",
  lamp: "white", asphalt: "black" };
// A set's own picks where the general one would be wrong for it (a cave's water and crystals are its mineral blue).
const CT_SET_MAT_RAMPS = { cave: { water: "cold", crystal: "cold" }, campsite: { sky: "violet" },
  graveyard: { sky: "violet", leaf: "olive" }, dungeon: { moss: "olive" }, ice: { stone: "cold" },
  desert: { flower: "cold", mortar: "ivory" }, void: { glow: "magenta" }, falls: { water: "cold" },
  sunken: { water: "cold", sand: "ivory" }, fungal: { glow: "neon" }, arcane: { glow: "violet" },
  // build 18 (modern horror, §38): the lockers' and rails' paint, the store's red OPEN, the cemetery's night, the drain's murk
  hospital: { paint: "teal", glow: "crimson" }, school: { paint: "cold", glow: "crimson" }, asylum: { paint: "sickly", glow: "crimson" },
  suburb_house: { glow: "crimson" }, convenience_store: { glow: "crimson", paint: "teal" }, office_modern: { paint: "cold", glow: "crimson" },
  cemetery: { sky: "violet", grass: "olive", leaf: "olive", moss: "olive" }, sewer_modern: { water: "olive", moss: "sickly", glow: "leaf" } };
// With materials on, a set whose first ramp word named its MOSS ("mossy stone") wears its stone as the base: the moss is
// marked and keeps its own green. Only the set's own default; a palette you pick wins.
const CT_SET_MAT_BASE = { dungeon: "stone", graveyard: "stone" };
// A SET'S COLORS, VARIED (build 2, 2026-11-22, CrunchyTexture persona round 3, Dana: "Iron grays the carpet and the wooden
// door too"): one palette over a whole set is one ramp on every slot, so a castle's carpet wears its granite. Here each slot
// of every set wears a ramp of its own, hand-picked from the set's three ramp words (castle: gray granite, royal crimson, oak
// brown) and from what the slot's texture is (a tapestry, a carpet, an oak door, an iron gate). The slots in BR_SLOTS order:
// wall wall2 floor floor2 ceiling trim door stair ("-": the set has no such slot). Only a texture's BASE wears it: its
// marked materials keep their own ramps (moss stays moss). Opt-in where an app offers it; nothing reads it otherwise.
const CT_SET_COLOR_SLOTS = ["wall", "wall2", "floor", "floor2", "ceiling", "trim", "door", "stair"];
const CT_SET_COLORS = {
  dungeon: "stone stone iron iron stone - wood iron", sewer: "sickly rust rust olive sickly rust rust iron",
  bunker: "stone stone olive stone stone hazard olive hazard", temple: "torch gold teal gold torch gold gold torch",
  flesh: "crimson violet crimson crimson ivory ivory crimson ivory", cyber: "neon leaf neon magenta magenta neon iron neon",
  cave: "ivory cold earth earth ivory wood wood earth", ice: "cold cold cold white white cold violet cold",
  catacomb: "ivory wood earth earth stone ivory iron stone", castle: "stone crimson crimson stone wood stone wood stone",
  inferno: "stone hazard magma black magma iron crimson stone", manor: "coral coral wood wood ivory wood wood crimson",
  shrine: "ivory crimson olive stone wood gold ivory wood", clockwork: "gold iron iron black teal gold iron gold",
  sunken: "coral teal ivory wood teal leaf wood coral", hedge: "leaf leaf leaf autumn leaf leaf wood wood",
  asylum: "white ivory sickly stone white sickly sickly stone", library: "wood ivory crimson ivory wood crimson wood wood",
  swamp: "earth wood sickly wood olive olive olive wood", prison: "stone torch stone stone iron iron iron stone",
  subway: "ivory crimson stone iron stone crimson iron iron", office: "ivory cold cold ivory white black wood stone",
  hive: "black leaf hazard sickly black leaf black black", fungal: "crimson violet violet earth crimson neon crimson violet",
  heaven: "white white white gold sky gold ivory white", jungle: "olive teal leaf stone leaf teal teal olive",
  arcane: "cold wood violet cold cold gold violet violet", biolab: "white leaf white iron white hazard iron hazard",
  bathhouse: "sky sky teal wood white sky wood wood", barn: "crimson wood gold earth wood stone crimson wood",
  ruins: "stone coral black iron earth magenta rust stone", factory: "rust iron iron black rust iron magma magma",
  void: "violet sky violet black violet crimson crimson violet", village: "white wood stone earth gold wood wood stone",
  cottage: "white stone wood gold wood wood wood wood", tavern: "wood wood wood torch wood gold wood stone",
  market: "torch violet torch ivory gold crimson violet torch", suburb: "sky rust stone leaf iron white crimson stone",
  home: "ivory olive wood ivory white white wood wood", apartment: "white teal white teal white iron iron stone",
  city: "stone rust stone black crimson magenta cold stone", school: "olive olive ivory torch white wood wood stone",
  chapel: "ivory violet rust gold wood coral wood ivory", diner: "teal crimson white white iron iron iron stone",
  greenhouse: "leaf leaf rust earth sky leaf white stone", mansion: "crimson wood wood ivory ivory gold wood crimson",
  hotel: "teal gold crimson ivory ivory gold gold crimson", docks: "stone olive wood stone white wood teal wood",
  farm: "stone iron gold earth sky white crimson gold", park: "iron wood stone teal coral leaf olive stone",
  beach: "crimson wood gold teal crimson sky sky gold", desert: "torch sky torch earth wood crimson wood torch",
  cabin: "wood crimson torch earth wood wood wood wood", station: "ivory wood stone hazard teal black teal iron",
  workplace: "stone white cold wood white iron wood stone", mall: "ivory black ivory teal white leaf iron ivory",
  hospital: "white teal stone iron white teal wood stone", museum: "white wood wood stone white gold wood ivory",
  cinema: "crimson crimson violet black black gold crimson violet", gym: "white stone black cold iron black iron torch",
  bank: "wood gold ivory gold ivory gold iron ivory", alley: "rust olive black earth black iron iron stone",
  construction: "iron torch earth stone sky hazard torch iron", campsite: "wood ivory earth magma cold crimson ivory earth",
  playground: "crimson black wood stone sky crimson hazard hazard", vineyard: "leaf wood earth stone wood violet wood stone",
  snowtown: "crimson wood white cold cold cold crimson white", graveyard: "stone stone olive earth cold iron wood stone",
  parking: "stone cold stone stone stone hazard cold stone", airport: "sky black white iron white hazard iron stone",
  cafe: "wood earth ivory wood black coral wood wood", laundromat: "white white teal white stone iron teal stone",
  aquarium: "cold magenta teal teal cold sky iron coral", natatorium: "sky white white teal white cold sky iron",
  arcade: "magenta neon black neon black hazard iron magenta", bowling: "iron teal torch teal black white teal torch",
  firehouse: "rust gold stone crimson stone hazard crimson stone", garage: "torch black stone black iron black crimson stone",
  falls: "stone cold stone cold stone sickly cold stone", deepwood: "wood leaf earth autumn leaf wood wood wood",
  suburb_house: "ivory ivory wood olive ivory wood wood rust", convenience_store: "white teal white stone white crimson iron stone",
  cemetery: "stone iron olive earth cold iron iron stone", office_modern: "ivory cold cold ivory white black wood stone",
  sewer_modern: "stone rust stone sickly stone rust rust stone",
};
// The ramp each slot of set `id` wears, varied: { slot: ramp } (null for a set not listed). `picks` ({ slot: ramp }, a
// person's changes) win where they name a ramp.
function ctSetColors(id, picks) {
  const row = CT_SET_COLORS[id];
  if (!row) return null;
  const out = {}, r = row.split(" ");
  CT_SET_COLOR_SLOTS.forEach((slot, i) => { if (r[i] && r[i] !== "-") out[slot] = picks && CT_RAMPS[picks[slot]] ? picks[slot] : r[i]; });
  return out;
}
// The picks in a link: "castle.floor.teal,castle.door.iron" <-> { castle: { floor: "teal", door: "iron" } } (only real sets,
// slots they have and real ramps are read)
function ctSetColorsRead(v) {
  const out = {};
  for (const e of String(v || "").split(",")) {
    const [id, slot, r] = e.split(".");
    if (typeof LAB_SETS !== "undefined" && LAB_SETS[id] && CT_SET_COLOR_SLOTS.indexOf(slot) >= 0 && LAB_SETS[id][slot] && CT_RAMPS[r]) (out[id] = out[id] || {})[slot] = r;
  }
  return out;
}
function ctSetColorsLink(picks) {
  const out = [];
  for (const id of Object.keys(picks || {})) for (const slot of Object.keys(picks[id])) out.push(id + "." + slot + "." + picks[id][slot]);
  return out.join(",");
}
// A STAPLE'S OWN PALETTE (build 3, 2026-11-23, CrunchyTexture §58, for TEXTURE VERSION 2 only): a texture's "its own" ramp was
// its first set's first ramp word, so Fieldstone came out hay gold (the farm's), the castle's carpet stone gray, Alley brick
// soot gray. Here the 142 everyday walls, floors, ceilings and trims each wear what they are made of (judged on contact sheets,
// ~/.cache/crunchy-wip/step2/own/). An app asks ctTexOwnRamp(t) only when it draws version 2 (texture-lab LAB_TEX_V); version 1
// and every texture not listed keep their old "own".
const CT_TEX_RAMP = {
  acousticceil: "ivory", adobefloor: "torch", adobewall: "torch", alleybrick: "rust", ashlar: "stone", asphalt: "black",
  bankceil: "ivory", bankfloor: "ivory", barnwall: "crimson", barrail: "wood", baseboard: "wood", bathtile: "sky",
  beachsand: "gold", beamceiling: "wood", blockpaint: "ivory", boardwalk: "wood", brassrail: "gold", cabinrafters: "wood",
  cafehex: "white", carpetfloor: "crimson", carpettile: "cold", cavefloor: "earth", cavewall: "stone", ceilpanel: "iron",
  cellfloor: "stone", cellwall: "stone", chairrail: "wood", chapelwall: "ivory", checkerfloor: "stone", chevronfloor: "wood",
  churchyardwall: "stone", cinderblock: "stone", cleanceil: "white", cobblestreet: "stone", coffer: "stone", concrete: "stone",
  concreteslab: "stone", concretewall: "stone", conduitband: "iron", corrugated: "iron", crenel: "stone", crowntrim: "white",
  culvert: "stone", damaskwall: "coral", deckplate: "iron", dentiltrim: "stone", dinertile: "white", dirtroad: "earth",
  drainarch: "stone", driveway: "stone", dropceiling: "white", drymud: "earth", drywall: "white", dustfloor: "earth",
  fancobble: "stone", fieldstone: "stone", firehousewall: "rust", flagstone: "iron", floralpaper: "ivory", forestfloor: "earth",
  galleryfloor: "wood", girderceil: "rust", grasspath: "leaf", gratefloor: "iron", grating: "iron", gravelpath: "stone",
  gymfloor: "torch", halftimber: "white", hardwood: "wood", hazardband: "hazard", hextile: "white", hospitalpaint: "ivory",
  hotelcarpet: "crimson", hotelwall: "teal", icefloor: "cold", joistceil: "wood", jungleblock: "stone", kitchentile: "white",
  labfloor: "white", lawn: "leaf", leaffloor: "autumn", linocheck: "stone", linoplain: "stone", lobbymarble: "white",
  lograil: "wood", logwall: "wood", loopcarpet: "cold", marblewall: "white", mossystone: "stone", muddyyard: "earth",
  oakboards: "wood", officecarpet: "cold", paintedceil: "ivory", parquet: "wood", pennytile: "white", picketfence: "white",
  pierplanks: "wood", pineboards: "wood", plankfloor: "wood", plasterbeam: "ivory", plasterceil: "ivory", plasterwall: "ivory",
  plazastone: "stone", plushcarpet: "crimson", popcornceil: "ivory", rafterceil: "wood", redtile: "rust", ribvault: "stone",
  riverstones: "stone", rivetband: "iron", roughstone: "stone", rugfloor: "crimson", seawall: "stone", sheetvinyl: "stone",
  shingleroof: "stone", sidewalk: "stone", siding: "white", snowpath: "white", stalactites: "stone", stationflags: "stone",
  stationwall: "ivory", stonepath: "stone", stripepaper: "olive", subwaytile: "white", tatami: "ivory", tavernwall: "wood",
  terrazzo: "white", thatchroof: "gold", tileband: "white", timberbeam: "wood", tinceiling: "iron", trofferceil: "white",
  tunnelceil: "stone", vctfloor: "ivory", wainscot: "wood", wallguard: "cold", walltile: "white", wardwall: "white",
  wetcobble: "stone", whitetile: "white", wineflags: "stone", woodvault: "wood",
};
function ctTexOwnRamp(t) { return typeof LAB_TEX_V !== "undefined" && LAB_TEX_V >= 2 && CT_TEX_RAMP[t] && CT_RAMPS[CT_TEX_RAMP[t]] ? CT_TEX_RAMP[t] : null; }
// The ramp a material wears: 0 (base) the base ramp; an unknown material the base ramp too.
// build 3 (texture version 2, texture-lab.js 19's new marks): a subway's tile band red, a pool's lane lines cold blue.
// Version 1 never reads these (those marks are version 2's), so every older link draws as before.
const CT_SET_MAT_RAMPS_V2 = { subway: { paint: "crimson" }, natatorium: { paint: "cold" }, aquarium: { paint: "cold" } };
function ctMatRamp(m, baseRamp, setId) {
  if (!m || typeof LAB_MATERIALS === "undefined") return baseRamp;
  const name = LAB_MATERIALS[m], own = setId && CT_SET_MAT_RAMPS[setId];
  const v2 = setId && typeof LAB_TEX_V !== "undefined" && LAB_TEX_V >= 2 && CT_SET_MAT_RAMPS_V2[setId];
  return (v2 && v2[name]) || (own && own[name]) || CT_MAT_RAMPS[name] || baseRamp;
}

// THE RAMPS BY LOOK (2026-11-14, TEXTURE-DESIGN.md §28): how the visual ramp pickers (ramp-pick.js) and the texture
// generator group them. Display only: a ramp's name never changes. A ramp not listed shows under "More".
const CT_RAMP_GROUPS = [
  ["Grays", ["stone", "iron", "black", "white", "ivory"]],
  ["Warm", ["torch", "wood", "earth", "gold", "hazard", "autumn", "rust", "magma"]],
  ["Reds and pinks", ["crimson", "coral", "magenta"]],
  ["Greens", ["sickly", "olive", "leaf", "teal"]],
  ["Blues and purples", ["cold", "sky", "neon", "violet"]],
];
function ctRampGroup(name) {
  for (const g of CT_RAMP_GROUPS) if (g[1].indexOf(name) >= 0) return g[0];
  return "More";
}

// The fixed choices offered in the prototype beside a set's own suggestions.
const CT_FIXED = ["stone", "torch", "sickly", "cold", "crimson"];

// A set's ramp WORDS ("mossy stone", "neon pink") to a ramp: the first keyword that matches wins.
const CT_WORDS = [
  ["sickly", "sickly"], ["moss", "sickly"], ["slime", "sickly"], ["moldy", "sickly"], ["bog", "sickly"], ["drowned", "teal"],
  ["acid", "leaf"], ["specimen", "leaf"], ["terminal", "leaf"], ["leaf", "leaf"], ["jungle", "leaf"], ["olive", "olive"],
  ["marsh", "olive"], ["jade", "teal"], ["teal", "teal"], ["verdigris", "teal"], ["neon cyan", "neon"], ["glow cyan", "neon"],
  ["neon pink", "magenta"], ["magenta", "magenta"], ["coral", "coral"], ["glacier", "cold"], ["frost", "white"],
  ["mineral", "cold"], ["moonlit", "cold"], ["twilight", "cold"], ["midnight", "cold"], ["carpet blue", "cold"],
  ["night", "cold"], ["tile blue", "sky"], ["sky", "sky"], ["starlight", "sky"], ["violet", "violet"], ["purple", "violet"],
  ["arcane", "violet"], ["spore", "violet"], ["blood", "crimson"], ["crimson", "crimson"], ["meat", "crimson"],
  ["emergency", "crimson"], ["vermilion", "crimson"], ["cap red", "crimson"], ["barn red", "crimson"], ["rust red", "crimson"],
  ["leather", "crimson"], ["line color", "crimson"], ["damask", "coral"], ["magma", "magma"], ["orange", "magma"],
  ["hazard", "hazard"], ["bile", "hazard"], ["brimstone", "hazard"], ["gold", "gold"], ["ochre", "gold"], ["brass", "gold"],
  ["amber", "torch"], ["torch", "torch"], ["sandstone", "torch"], ["hay", "gold"], ["ivory", "ivory"], ["paper", "ivory"],
  ["cream", "ivory"], ["beige", "ivory"], ["dust", "ivory"], ["limestone", "ivory"], ["marble", "white"], ["white", "white"],
  ["clinical", "white"], ["steam", "white"], ["oak", "wood"], ["cedar", "wood"], ["mahogany", "wood"], ["peat", "wood"],
  ["brown", "wood"], ["pine", "leaf"], ["adobe", "torch"], ["rust", "wood"], ["smog", "wood"], ["resin", "black"], ["oil", "black"], ["abyss", "violet"],
];
function ctRampForWords(words) {
  const w = String(words).toLowerCase();
  for (const [k, r] of CT_WORDS) if (w.includes(k)) return r;
  return "stone";
}
// The n colors a texture with n levels uses, as [r, g, b] triples.
function ctRampColors(name, n) {
  const c = (CT_RAMPS[name] || CT_RAMPS.stone).c, out = [];
  for (let i = 0; i < n; i++) {
    const h = c[Math.round((i * (c.length - 1)) / Math.max(1, n - 1))];
    out.push([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  }
  return out;
}

// THE VISUAL RAMP PICKERS' BINDING (§28; moved here from the app's own ramp-pick.js 2026-11-16, when the picker itself,
// `rpMount`, became crunchyCore's ramp-pick.js). It touches no DOM itself: rpMount does, when it is called.
// This app's ramps (CT_RAMPS above): each value a ramp's name, drawn as its strip, grouped by look; `special(value)`
// says what an entry stands for when it is not a ramp's name ({ ramp, tag, label }, e.g. "" = the texture's own)
function rpRamps(sel, special, title) {
  if (typeof rpMount !== "function") return null;   // no picker loaded (the node tests load ramps.js alone): the select stays
  const sp = function (v) { return special ? special(v) : null; };
  return rpMount(sel, {
    title: title,
    colors: function (v) { const s = sp(v), r = CT_RAMPS[s ? s.ramp : v]; return r ? r.c : null; },
    label: function (v, text) { const s = sp(v); return s && s.label ? s.label : CT_RAMPS[v] ? CT_RAMPS[v].title : text; },
    group: function (v) { const s = sp(v); return s ? s.group || "" : CT_RAMPS[v] ? ctRampGroup(v) : ""; },
    order: function (v) {
      if (sp(v) || !CT_RAMPS[v]) return -1;
      const g = CT_RAMP_GROUPS.findIndex(function (x) { return x[1].indexOf(v) >= 0; });
      return g < 0 ? 9999 : g * 100 + CT_RAMP_GROUPS[g][1].indexOf(v);
    },
    tag: function (v) { const s = sp(v); return s ? s.tag || "" : ""; },
    wide: function (v) { return !!sp(v); },
  });
}

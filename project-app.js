"use strict";
// CrunchyVFX — THIS APP'S PART OF THE PLANTED LIBRARY (crunchyCore plant.js, DESKTOP-ROADMAP.md step 4; VFX-DESIGN §18).
// plant.js is the suite's shared core (byte-identical in every tool, pulled by tools/pull-core.mjs); everything about a
// planted asset that is CrunchyVFX's own is this one object, loaded BEFORE plant.js. Pure: no DOM, no app state.
//
// ONE KIND, an EFFECT: `crunchy/vfx/<slug>/` (Unity `Assets/Crunchy/VFX/<slug>/`) holding exactly what the Export
// dialog writes for it as a sprite sheet: `<base>.png`, its metadata (a Godot 4 SpriteFrames `<base>.tres` in a Godot
// project; the dialog's Generic / Aseprite / Phaser JSON elsewhere), and, when chosen, `<base>_emissive.png`, the
// `@2x` sizes and the synthesised `<base>.wav` — beside `<slug>.crunchy`. The sidecar's fields (index.html's planted
// block writes them):
//   s           the share string (encodePatch: the same ?e= a link carries): reopens the effect exactly
//   exportName  the name it was FIRST planted under; `base` (its sanitize()d form) names every file and is what the .tres
//               and the JSON metadata point at, so a rename never moves or rewrites a file
//   exp         { layout, meta, trim, pot, emissive, sound, scales }: the export settings it was saved with (always a
//               sprite sheet); Update re-exports with them
//   fit         Fit, as it was on (a render setting no share link carries)
//   sound       (optional) { patch, name }: the synthesised sound written beside it (a CrunchySFX patch, as a diff from
//               the engine's defaults), so Update can render the same WAV
//   ref         (optional) the name of a reference image COMBINED into the export: a sidecar can't keep the image, so
//               such an effect is never re-rendered behind the person's back
//   info        { frames, w, h, fps }: for the card
//   categories  (optional) the My Effects categories it was filed under when it was planted
//   from        (optional) "my-effects:<id>" or "file:<name>#<id>": what "Plant my effects" / "Plant a project file…"
//               made it from, so nothing is planted twice
//   links       (optional, SUITE-LINKS.md §4) [one crunchyCore plant.js 7 link]: the CrunchySFX sound it plays, used
//               where it is: the Godot scene points at its res:// path, so a Replace in CrunchySFX reaches the game
//   soundFrame  (optional) the impact frame: the Godot scene starts its sound on this frame when the game calls play()

const PROJECT_APP_BUILD = 2;
const PROJECT_APP = {
  id: "crunchyvfx",
  name: "CrunchyVFX",
  suite: "vfx",                                        // its child of a planted crunchy/ folder: crunchy/vfx/, Unity Assets/Crunchy/VFX/
  kinds: {
    effect: { dir: "effects", label: "Effects" },
  },
  // a kind's own fields (plant.js has already checked the format, the name and the file list)
  valid: function (kind, d) {
    if (kind !== "effect") return false;
    if (typeof d.s !== "string" || !d.s.length) return false;
    if (d.base != null && (typeof d.base !== "string" || !/^[\w.\- ]+$/.test(d.base))) return false;
    if (d.exp != null && (typeof d.exp !== "object" || Array.isArray(d.exp))) return false;
    if (d.sound != null && (typeof d.sound !== "object" || typeof d.sound.patch !== "object")) return false;
    if (d.links != null && !Array.isArray(d.links)) return false;
    if (d.soundFrame != null && !(Number.isInteger(d.soundFrame) && d.soundFrame >= 0)) return false;
    return true;
  },
};

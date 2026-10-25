# CrunchyVFX: itch.io store page (1.0.0)

Ready-to-paste material for **https://sevi66.itch.io/crunchyvfx** (desktop $6; the web build at https://crunchyvfx.com
is free). The images are in `~/Pictures/crunchyvfx-itch/`. Every number and feature below was checked against the
code on 2026-10-16 (index.html, presets.js, shapes.js, suite.js, VFX-DESIGN §13, §18, §19, §23, §26-§28); see
"Checked against" at the end. RELEASE.md covers the page settings (Downloadable, no HTML embed, the AI disclosure,
the SmartScreen note). This file covers the words and pictures.

---

## Page fields

- **Title:** `CrunchyVFX`
- **Short description / tagline** (itch's one line, under 120 characters):

  > Pixel-art sprite effects for every game moment, with drop-in Godot scenes. CC0, no generative AI. Free on the web.

- **Classification:** Tool · **Kind of project:** Downloadable (no HTML upload; link the web build in the description)
- **Release status:** Released
- **Pricing:** $6 minimum ("Payment", not donation), the same as CrunchySFX and CrunchyTile
- **Genre:** none (leave it as "No genre"; it is a tool, not a game)
- **Platforms (set on the uploads):** Windows (the `:windows` channel, NSIS installer), Linux (the `:linux-flatpak`
  channel). Label them on the page: *"Windows installer"* and *"Linux: Flatpak (any distro)"*.
- **AI disclosure:** as RELEASE.md says ("Yes", AI Generated Code only; Graphics unticked: every effect and particle is
  drawn by code).
- **Tags** (itch allows 10):
  `vfx`, `particles`, `pixel-art`, `sprites`, `godot`, `game-development`, `tool`, `cc0`, `procedural-generation`, `2d`

---

## Main description (paste into itch's editor)

> **▶ Free in your browser: https://crunchyvfx.com** (nothing to install, no account). This page is the desktop app.

**Effects for the moments your game actually has.** A hit, a crit, a death puff, a coin pickup, a heal, a dash, a
fireball, a level-up. Pick the moment, pick an effect, change what you like, and export it. Choose Godot 4 and you get
a **ready scene**: drop the `.tscn` into your game and it plays, sends an `impact` signal on the hit frame, and frees
itself when it ends. A loop keeps looping until you stop it.

```
var fx = preload("res://frost-nova.tscn").instantiate()
fx.position = pos
add_child(fx)
```

Every effect is a seeded particle simulation with layers, palettes and a pixel-art finishing stage, and every particle
is drawn by hand-written code. **No generative AI, no samples, no bundled art.** Everything it makes for you is
**CC0** (public domain): ship it in commercial games, no credit, no royalties.

### What's in it

- **209 ready effects**, sorted into **16 game moments** (Hit, Crit, Death, Spawn, Pickup, Heal, Power-up, Dash,
  Jump / Land, Projectile, Muzzle / Cast, Explosion, Shield, Status, Ambient, UI / Emote), and also by technique and
  by material. Every effect in a moment was checked to read at 64 px.
- **98 particle shapes**, including the **Icon particle**: any of the Crunchy suite's 193 pixel icons (hearts, coins,
  gems, skulls, trophies, warning signs, speech bubbles, button prompts) as particles, drawn pixel for pixel at the
  particle's size.
- **58 layer systems** to stack on top: shockwaves, rings, trails, rune circles, beams, lightning and more.
- **The Wizard:** answer three questions (what it's for, what it's made of, which era) and pick from nine new effects,
  all playing.
- **Randomize, Breed and Variations:** roll a fresh effect, breed nine children of one you like (and breed again), or
  make a pack of eight siblings of one effect so repeated hits never look like a loop.
- **Era styles:** one click crunches an effect down to an older look (Woodgrain, Micro, 8-bit, Pocket, Mega, Super,
  Advanced, 32-bit, Modern). **Game palette** locks an effect to your game's own colors (paste hex codes or load a
  `.hex`/`.gpl` file).
- **Match a sound:** paste a CrunchySFX sound link and it draws an effect to match, then exports the sound beside it.
- **Quick shape sliders** in plain words (Violence, Softness, Chunkiness, Weight, Heat, Swirl, Busyness), plus every
  real control underneath when you want it.
- **Exports:** PNG sprite sheet (grid or strip), PNG frames in a zip, animated PNG, GIF. Frames from 32 to 256 px square
  or any width and height up to 512, at 1x, 2x, 3x, 4x or 8x. **Godot 4** ready scene + SpriteFrames, **Phaser 3**
  atlas, **Aseprite** JSON, or generic JSON; Unity takes the sheet as it is (Sprite Mode Multiple, slice by cell size).
  Optional emissive mask for your engine's bloom, a WAV when the effect has a sound, and Variations packs
  (`hit_01` … `hit_08`).
- **Share links** that hold a whole effect's recipe.

It also has a silly side, because tools should be fun to poke at: ghosts that pop out and swirl (Boo!), sleepy Zzz,
sweat drops, stun stars and emoji bursts sit right beside the explosions.

### Free on the web, and what the desktop adds

**The web version is free and stays free:** every effect, shape, layer, preset, the Wizard, Breed, Variations, Match a
sound, every export format and size, GIF and share links. Nothing is watermarked or size-capped. **The $6 desktop app
sells workflow, never effects:**

- **A Library planted in your game.** Pick your Godot project, Unity project or any folder once. Every effect you save
  lands in `crunchy/vfx/` inside it (Unity: `Assets/Crunchy/VFX/`) as exactly what the Export dialog writes: the sheet,
  the Godot SpriteFrames and the ready scene, with a small `.crunchy` file beside it that reopens the effect exactly.
- **Updates in place, never by accident.** Save always makes a new effect. **Replace** on a card rewrites that effect's
  files where they are, so your game picks up the change. If a newer CrunchyVFX would draw an effect differently, its
  card says "update available" and **Update all** re-exports them. If a save or a delete would remove a file one of
  your scenes uses, it stops and names the file first.
- **Sound from CrunchySFX in the same game.** Link a sound CrunchySFX planted there and set the frame it starts on; the
  Godot scene plays it on that frame.
- **My Effects and custom categories** for the effects you keep.
- **Imports & history:** every particle image you imported and every effect you exported, ready to load back.
- **Batch export** (all of My Effects, or every preset and saved effect as one asset pack), **pipelines that write
  straight to a folder**, **drag-out** of a sheet into your engine or file manager, project files, and native Save and
  Open dialogs.
- An optional check for updates on launch (it asks crunchyvfx.com for a version number and nothing else; switch it off
  in Settings).

**Platforms:** Windows (installer) and Linux (Flatpak). The Windows installer is not code-signed yet, so SmartScreen
may warn you: choose *More info* → *Run anyway*.

### License

Effects you make or export with CrunchyVFX are **CC0 1.0** (public domain). A sprite or image you import yourself keeps
its own license. The app never uploads what you make; Feedback opens your own mail app.

### The Crunchy suite

Free tools that make the art and sound for your game, with no generative AI, and everything they make is CC0.

- **CrunchyTile:** tilesets, backdrops, objects and rooms for top-down and side-scrollers. Web: https://crunchytile.com
  · Desktop ($6): https://sevi66.itch.io/crunchytile
- **CrunchySFX:** sound effects from scratch, as WAV. Web: https://crunchysfx.com · Desktop ($6):
  https://sevi66.itch.io/crunchysfx
- **CrunchyUI:** panels, buttons, bars, frames, cursors and icons. Web: https://crunchyui.com
- **CrunchyBGM:** background music in seamless loops. Web: https://crunchybgm.com

Made by superevil6.

---

## Images

Upload order: the cover, then the GIFs (itch shows the first screenshots first; lead with the effects), then the UI
screenshots. All GIFs are drawn by CrunchyVFX's own engine (`renderFrames` + `encodeGif`, the app's GIF encoder) at the
preset's own frame size, then scaled up by a whole number (nearest-neighbor) onto the app's dark stage color. A
one-shot gets a short blank pause before it repeats. None is over 0.5 MB.

| file | size | what | alt text |
|---|---|---|---|
| `cover-630x500.png` | 630x500, 49 KB | the cover: six effects over the wordmark | CrunchyVFX: six pixel-art effects (an explosion, a critical hit, a frost ring, gold coins, a skull in smoke, ghosts) above the CrunchyVFX wordmark |
| `big-boom-mega.gif` | 576 px, 23 frames, 138 KB | Big Boom in the Mega era style (96 px, 15 fps) | A chunky pixel-art explosion: a white-hot fireball bursting into red and orange embers |
| `critical-hit.gif` | 576 px, 108 KB | Critical Hit (Crit moment) | A critical-hit flash: a white starburst throwing out gold sparkles and impact lines |
| `twin-slash.gif` | 512 px, 44 KB | Twin Slash (Hit moment) | Two pale blue crescent sword slashes sweeping across and fading |
| `frost-nova.gif` | 576 px, 322 KB | Frost Nova (magic burst) | A ring of white and blue snowflakes bursting outward and drifting apart |
| `coin-burst.gif` | 576 px, 93 KB | Coin Burst, the Icon particle (Pickup moment) | Pixel gold coins thrown up from one point and falling away |
| `heart-heal.gif` | 576 px, 87 KB | Heart Heal, the Icon particle (Heal moment) | Pink pixel hearts rising out of a ring and fading |
| `boo.gif` | 576 px, 482 KB | Boo! (the silly side) | Cartoon ghosts popping out of one spot and swirling around |
| `fireball-8-bit.gif` | 576 px, 12 frames, 47 KB | Fireball in the 8-bit era style (a seamless projectile loop) | A blocky 8-bit fireball with a flickering orange tail, looping |
| `screenshot-1-library-desktop.png` | 1400x900 | the desktop app with the Library docked, planted in a Godot game | The CrunchyVFX desktop app: the effect editor with an explosion on the stage, and the Library panel listing effects saved into a Godot game, with Update all and other suite apps' assets |
| `screenshot-2-moments.png` | 1400x900 | the effect strip on the Pickup moment, Coin Burst loaded | The effect strip filtered to the Pickup moment (coin, gem and treasure effects), with gold coins on the stage and the Quick shape sliders |
| `screenshot-3-export-godot.png` | 1400x900 | the Export dialog with "Godot 4: ready scene (.tscn) + SpriteFrames" | The Export dialog set to Godot 4 ready scene, explaining that the scene plays, signals impact on frame 5 and frees itself, with the one-line spawn code |
| `screenshot-4-wizard.png` | 1400x900 | the Wizard's nine results for "a spell, Fire + Arcane" | The Wizard showing nine generated spell effects for Fire and Arcane, each with its particles and palettes listed |

Notes on the screenshots:
- They were taken in WebKitGTK (the desktop app's engine) at 1400x900. The first is the desktop build over the test
  suite's mocked disk (a Godot game at `/home/dev/my-platformer`, its effects and two other suite assets, one card
  marked "update available"): a staged scene, not a real game. The other three are the web build; the Wizard and
  Export dialogs are the same on the desktop.
- They are 14:9, not 16:9. itch shows any ratio; crop the bottom 112 px for 16:9 on the first two if you like. The two
  dialogs need the full height (their footers end at y = 800).
- `og.png` was NOT used for the cover: it is out of date (the old orange accent, "42 systems · 88 shapes · 118
  presets"). It is worth redrawing for the link card too (209 effects, 98 shapes, 58 systems).

---

## Launch posts

Both subs dislike drive-by ads. Post the work first, say plainly that you made it and that it's paid on desktop, and
stay in the comments. Check each sub's current rules and flair before posting.

### r/godot

Flair: whatever the sub uses for self-promotion of tools at the time (it has had a "selfpromo (software)" flair).
Attach `frost-nova.gif` or a short screen recording of a Godot scene playing the effect.

**Title:** I made a free browser tool that exports pixel-art VFX as drop-in Godot scenes (they play, signal the hit
frame, and free themselves)

> I kept animating the same hit sparks and death puffs by hand, so I built CrunchyVFX. It's a procedural sprite-effect
> generator (seeded particle sims, every particle drawn in code, no generative AI) and the Godot export is the part I
> care about most:
>
> Choose Godot 4 in the Export dialog and you get the sheet, a SpriteFrames `.tres`, and a `.tscn` + small `.gd`.
> Instance it and it plays by itself, emits `impact` on the hit frame (the frame with the most light; the desktop app lets you pick one), emits
> `finished` and `queue_free`s when a one-shot ends. Loops loop until you call `stop()`. `autoplay` and
> `free_when_done` are exported if you'd rather drive it yourself.
>
> ```
> var fx = preload("res://frost-nova.tscn").instantiate()
> fx.position = pos
> add_child(fx)
> ```
>
> The exported scenes are tested by playing them in a real headless Godot 4.7 (the impact tick, the free, the loops).
>
> The presets are sorted by game moment (hit, crit, death, pickup, heal, dash, projectile …), and output is CC0, so
> use it however you like.
>
> It's free in the browser with every effect and export: https://crunchyvfx.com. There's also a $6 desktop app that
> saves effects straight into your project folder and updates them in place when you change them; it doesn't make
> different effects, it's just workflow. Happy to answer questions about the scene script or the sim.

### r/PixelArt

r/PixelArt is about pixel art people draw, so be upfront that these are procedural. If the sub's rules don't allow
tool posts at the time (they have varied; some weeks there is a resource thread), post in r/gamedev, r/IndieDev or
r/godot instead, or ask the mods first. Lead with a GIF in a chunky era style, e.g. `big-boom-mega.gif` or
`fireball-8-bit.gif`.

**Title:** I made a free tool that generates pixel-art effect sprite sheets in code (no AI): explosions, slashes,
coin pickups, with era styles from 8-bit to 32-bit

> These are all procedural: a seeded particle sim, every particle shape drawn by hand-written code, then a pixel-art
> finishing stage (pixelate, posterize, dither, outline, a palette lock). No generative AI, no sampled art. I'm not
> claiming they're hand-pixeled; they're meant as a fast starting point or a placeholder you can paint over.
>
> The era buttons are the fun part: the same explosion at 8-bit, Pocket (four greens) or Mega (dither instead of
> blending). You can lock an effect to your own palette by pasting hex codes or loading a .gpl, and the coin, heart and
> skull effects use a shared pixel-icon set drawn at the particle's exact size, so they stay crisp.
>
> Exports are PNG sheets, frames, APNG or GIF, and everything you make is CC0. It's free in the browser:
> https://crunchyvfx.com (there's a paid desktop version for folder workflow, but the web one has every effect and
> export). Feedback on which ones read badly at small sizes is very welcome.

---

## Checked against (2026-10-16)

- Counts read from the running app (headless Firefox, the 1.0.0 working tree): `Object.keys(PRESETS).length` 209,
  `SHAPES.length` 98, `iconOffered().length` 193, `PRESET_MOMENTS` 16, `PALETTES` 18, STYLES = Anything + 9 eras, sizes
  32-256, `EXPORT_SCALES` [1, 2, 3, 4, 8]; "58 systems" is the strip's own count.
- Web vs desktop: the `data-desktop` markup and `isDesktop` gates in index.html (My Effects, custom categories, Drag out,
  Imports & history, Save/Open project, Set folder, Re-export pack, batch My Effects / Everything, Sounds in this game,
  Impact frame, the Library, the update check) and `desktopMount`'s own list.
- The Godot scene: §26 and the Export dialog's note (screenshot 3); `tests/godot-scene.mjs` plays it in Godot 4.7.2.
- Suite links: crunchyCore `suite.js` build 9 (Tile and SFX have desktop pages at $6; UI and BGM web only; Character,
  Items and Shader have no links, so they are left out).

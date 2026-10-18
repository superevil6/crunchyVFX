# CrunchyVFX: project folders, the Library, and export straight into Godot and Unity

> **SUPERSEDED (2026-10-11) by planting: VFX-DESIGN.md §18** (crunchyCore DESKTOP-ROADMAP.md, AJ's decision: planting
> REPLACES separate project folders). There is no project folder and no linked game: the Library is planted INSIDE the
> game (`crunchy/vfx/<slug>/`, Unity `Assets/Crunchy/VFX/`), each effect's export beside a `.crunchy` sidecar. The hand
> copy of project.js this document proposed was removed (VFX never called it). §2's bugs 1 and 2 were fixed before; bug 3
> (exports return files) is what planting uses. §5's Library decision became option (b) with a rename: VFX's own dialog
> is "Imports & history" (`ih-*`). Kept for the history; nothing below is a plan any more.

A handoff from CrunchyTile (2026-10-09). CrunchyTile's desktop tier gained project folders, a visual Library,
and linked Godot/Unity projects with re-export on save. AJ wants the same here:

> "These direct exports to Unity and Godot are game changers, this single handedly makes the desktop version of
> all the applications worth it I think."

**Read these first, in order:**
1. `~/Code/crunchyTile/PROJECTS-HANDOFF.md`: the general design, the portable files, the Tauri permissions,
   the testing approach and the traps. This document doesn't repeat it.
2. `~/Code/crunchyTile/TILE-DESIGN.md` §79: what Tile built and why.
3. This file: what's different for VFX, and how much VFX already has. It is based on a survey of this repo on
   2026-10-09. Line numbers refer to `index.html` at that date and will drift.

The rule is unchanged: **the desktop version sells workflow, never effects** (VFX-DESIGN §13). Everything you
can make and export on the web stays free and identical.

---

## 1. VFX is further along than Tile was

| Need | Already in VFX | What changes |
|---|---|---|
| A saved effect | My Effects: `{id, name, state}` in `crunchyvfx.userpresets.v1` (:3162); categories as references in `crunchyvfx.usercats.v1` (:5603) | Store the same `{name, state}` object as a file in the project (§3). |
| Rebuilding an effect off-screen | `withState(snap, fn)` (:3170), `applyPreset` | This is Tile's `withState` pattern. Use it for exports, thumbnails and Export all. |
| A project | A single `.crunchyvfx` file (`buildProject` :3604, `saveProject`/`openProject` :3646/:3665) holding effects, categories and imported sprites | It becomes a **folder** (§3). Keep the single file as Import/Export, and offer to convert it (§6). |
| A Library dialog | `#libBtn`, `libModal` (:5174), `renderLibrary` (:5211): imported sprites and export history | **Name collision:** it uses `lib-*` classes, and `lib-title` exists in both. Decide before copying anything (§5). |
| Export to a folder | **Pipelines**: `crunchyvfx.pipelines.v1` (:4363), `{name, settings, folder}`, with the folder picked through `dialog.open` (:4578) | **Engine export is a pipeline with a fixed destination.** A linked Godot project is the pipeline "Godot sidecar, into `res://crunchyvfx/`", run automatically on save (§4). |
| Godot output | `sidecarFor("godot", …)` (:4031) writes Godot 4 SpriteFrames with AtlasTexture regions and trim margins, verified in Godot 4.7 | Keep it. Fix the two bugs below, and add an AnimatedSprite2D scene. |
| Unity output | None. Unity `.meta` files were deliberately left out (:4025–4030) | §4 proposes an editor script, the approach Tile proved. |
| Batch export | `batchExport(which, {overrides, folder})` (:4429), "Re-export My Effects" | It writes everything, but without stable paths or a record of what it wrote. |
| Thumbnails | `effectThumb` (:3195) renders every frame at 44 px; vfx.js has `renderPrep` + `renderOneFrame` (:3196/:3232) | For cards, render **one** frame at about 96 px with `renderOneFrame`, and also write it as `effects/<slug>.png`. |
| Export history | `crunchyvfx.exports.v1`, desktop only | In a project, the Library's Godot and Unity badges replace it. Keep it outside projects. |

## 2. Fix these first (real bugs, confirmed in code)

1. **Batch export always names the sidecar `.json`** (:4459), even when the format is Godot. A Godot batch
   gives `name/name.json` with `.tres` contents, which Godot won't load. Use the extension `sidecarFor`'s kind
   implies.
2. **The Godot sidecar uses an absolute texture path,** `res://<name>.png` (:4088). That only works when the
   PNG sits at the top of the project, so it breaks inside a batch's `name/` folder and inside
   `res://crunchyvfx/`. **Use a path relative to the `.tres`**: `path="<name>.png"`. Godot resolves
   ext_resource paths relative to the resource file. Tile ships it that way, and its headless Godot check
   loads a `.tres` from a nested folder (`~/Code/crunchyTile/export.js`, the comment near the top).
3. **`runExportToFolder` (:4597) temporarily replaces `window.download` and polls for the result.** Replace it
   with the refactor in §5: exports **return** `[{ name, data }]`, and the buttons zip or save them. Every
   later step depends on this.

## 3. The project folder

```
My Game VFX/
  crunchyvfx-project.json     name, links, autoExport, the engine export settings, the exported-file records
  effects/<slug>.json         { name, state, category?, modified }
  effects/<slug>.png          one frame, for file managers
  categories.json             { cats: [{ name, items: [<effect slug> | "builtin:<preset name>"] }] }
  sprites/<name>.png          imported particle sprites as REAL files (today they are data URLs in storage)
  pipelines.json              the saved pipelines, minus their folder (links replace it)
  README.txt
```

- **Imported sprites become real files.** Today they're data URLs in browser storage, which is what triggers
  the "Sprite library is full" message (:2026–2045). In a project that limit is gone. They are the user's own
  images, so they are **not CC0**. Mark the folder that way, as Tile does with imported sprites (Tile §63).
- **An effect that uses an imported sprite has to find it.** Check how `state` refers to sprites (by id? by
  data URL?) and make it a project-relative name, so a copied effect file still finds its sprite.

## 4. Export into a game

**Godot**, under `res://crunchyvfx/<slug>/`:
- `<slug>.png` (the sheet), `<slug>.tres` (SpriteFrames), and `<slug>_emissive.png` / `<slug>.wav` if the
  effect has them;
- **new:** `<slug>.tscn`, an AnimatedSprite2D using that SpriteFrames, set to autoplay and centered, so the
  user drags one scene into a level. If the effect has a sound, an AudioStreamPlayer2D child plays it.
- **Settings:** the pipeline settings for the Godot link (trim, layout, scale) live in the manifest. Default:
  the Godot sidecar, trimmed, 1×.
- **Prove it with a headless Godot:** `~/Code/crunchyTile/tests/godot-check.mjs` is the pattern. Import the
  folder, load the `.tscn`, and check the animation's frame count and fps against the effect.

**Unity**, under `Assets/CrunchyVFX/<slug>/`:
- **Why there's no Unity export yet:** a sheet needs slicing, and slicing lives in the `.meta`, which only
  Unity should write. Tile hit the same problem with tiles and solved it without writing a `.meta`:
  - an **editor script** (an AssetPostprocessor) is shipped once into `Assets/CrunchyVFX/Editor/`;
  - on import, it reads the JSON sidecar beside the PNG, slices the sprite, and builds an AnimationClip, or
    an animated prefab;
  - Tile proved it against Unity's real code under dotnet, without Unity installed (`tests/unity-check.mjs`,
    `unity-harness.cs`, `unity-stubs.cs`).
- **Starting point:** reuse VFX's generic JSON sidecar as the input.
- This is the largest single piece. It's fine to ship Godot first and Unity after. A live Unity import is
  still unverified even in Tile (AJ will test later).

**Both:**
- **The same bytes as the buttons.** Everything goes through one function: `effectFiles(asset, settings) →
  [{ name, data }]`. A desktop suite proves byte-identity.
- **Re-export on save:** saving an effect in the project re-renders it and rewrites its folder in every linked
  engine. VFX renders are heavier than a sound or a tile, so show progress in the Library's status line. Save
  first and export afterwards, so the editor never waits.
- **Stable paths:** named for the effect, never for a timestamp. A re-export removes only files this project
  wrote, and never `.import` or `.meta` files.

## 5. The code

**The Library: decide first.** VFX already has a "Library" button and dialog showing sprites and export
history, styled with `lib-*` classes. Tile's portable `library.js` and its CSS block use `lib-*` classes too,
and both have `.lib-title`. Two options:
- **(a) Recommended:** rename VFX's existing classes (for example `vlib-*`), then show sprites and export
  history as extra filter chips, or groups, in the shared Library. One Library, consistent with the suite.
- **(b)** Keep VFX's dialog as it is and give the project viewer a different name. That is quicker, but it
  leaves two "libraries".

**Copy these from `~/Code/crunchyTile`:**
- `library.js`: unchanged.
- The `lib-*` CSS block: unchanged. It hides itself, which VFX needs because it has no global `[hidden]`
  rule. VFX's suite-button port found this.
- `project.js`: copy it, then change only these parts:
  - `PROJECT_APP`: `{ id: "crunchyvfx", name: "CrunchyVFX", kinds: { effect: { dir: "effects", label: "Effects" } }, godotDir: "crunchyvfx", unityDir: "CrunchyVFX" }`.
  - `projectAssetValid`: an effect has a `name` and an object `state`.
  - `projectReadme`.
  - It also needs two small helpers, `slugify` and `utf8Bytes`. Add them to VFX's code, not to `project.js`.
- `tests/tauri-mock.js` and the pattern of `tests/regression-desktop.js`. VFX's async suite already stubs
  `__TAURI__`, so fold the mock in there.

**Register every new file** in all four places: the `<script>` tags, the `FRONTEND` array in
`src-tauri/build.rs`, `tests/build.py:32`, and the `cp` line in `.github/workflows/desktop-build.yml:47`. Make
sure `.assetsignore` doesn't match any of them, and update DEPLOY.md's counts.

**Tauri permissions:** VFX has `dialog:allow-open`, `fs:allow-write-file`, `fs:allow-read-file` and
`fs:allow-mkdir`. Add:
- `fs:allow-read-text-file`, `fs:allow-write-text-file`, `fs:allow-read-dir`, `fs:allow-exists` and
  `fs:allow-remove`.

## 6. Moving existing users over

- **Converting a `.crunchyvfx` file:** *Open project* accepts a `.crunchyvfx` file and offers to convert it
  into a folder. Effects become `effects/*.json`, categories become `categories.json`, and sprites become real
  PNGs.
- **Browser data:** the first time a project opens, offer to copy the browser's My Effects and sprites into
  it. Ask first, and never take them out of the browser.
- **Pipelines:** they keep working outside projects. Inside a project, the Godot and Unity links are the
  pipelines' destinations.

## 7. Tests

- **`tests/project.test.mjs`:** Tile's Node test for `project.js`, ported with VFX's two helpers.
- **The async suite with the Tauri mock** should prove:
  - Godot files are byte-identical to the export button's;
  - the `.tres` loads from a nested folder (bug 2);
  - a batch's Godot sidecar has the `.tres` extension (bug 1);
  - re-export removes only files this project wrote;
  - sprites are real files;
  - a `.crunchyvfx` file converts into a folder project;
  - nothing is written outside the three folders (the project, Godot and Unity).
- **A headless Godot check** that the `.tscn` plays the right frames.
- **Unity, when it comes:** port Tile's dotnet harness.

## 8. Decisions for AJ

1. **The Library:** merge (a) or keep two (b)? See §5. Recommendation: (a).
2. **The Godot scene:** generate an AnimatedSprite2D `.tscn` per effect? Recommendation: yes. It turns
   "an effect" into something the user drops into a level.
3. **Unity:** in v1, or Godot first? Recommendation: Godot first. Unity's editor-script approach is the biggest
   job here and can't be checked live yet.
4. **The default scale for engine export:** 1×, or the pipeline's scales?

## 9. Order of work

1. Fix the three problems in §2. The first two are worth fixing anyway, since they're bugs on the web too.
2. `project.js` with its Node test, the folder format, conversion, and sprites as files.
3. Settle the Library (decision 1), then cards with single-frame thumbnails.
4. Godot link, re-export on save, Export all, the `.tscn`, and the headless Godot check.
5. Unity's editor script and its dotnet check.
6. A desktop suite with the mocked Tauri, and a live click-through by AJ.

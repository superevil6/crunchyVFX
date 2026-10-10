# Handoff — a shared shape roster, from CrunchyVFX

Written 2026-08-26 from the CrunchyVFX codebase, after reading `UI-DESIGN.md` §1.3, §11.3, §11.6,
§11.7, §11.11, §11.12 and `tools/port-vfx-shapes.mjs` in full. **Every number below was measured
today**, in a browser or in node, against both repos as they stand. Nothing here is recalled.

Read `~/.claude/crunchy-suite.md` first, then this. Where this contradicts something already
settled in `UI-DESIGN.md`, **the settled thing wins** — §11.12's even-odd rule especially, which is
the one place UI's contract is stricter than VFX's and therefore governs both.

The proposal in one line: **one authored geometry file, vendored into both repos, so a shape drawn
once appears in both apps.** Everything below is what that costs and what it cannot cover.

---

## 1. The one structural thing to get right

**It must be a name → geometry DICTIONARY, never an ordered roster.**

Both apps store their shape as an **index**, and the two orders are already different and can never
be reconciled:

- VFX: `shape` is an index into `SHAPES` (`shapes.js`), stored in every preset, share link and
  saved effect. Append-only.
- UI: the element kind is an index into `ELEMENT_DEFS`, stored in every preset and share link
  (§7, §11.12). Append-only, and `LATE_DEFS` is pushed after the ported roster *for that reason
  alone*.

A shared **ordered list** would make every future addition append-only in two products at once,
with no way to reconcile a divergence once it happened. A shared **dictionary** costs nothing: each
app keeps its own registration order and looks geometry up by name. This is the single decision that
is cheap now and expensive to retrofit — the analogue of UI's own `describe`/`rasterize` split.

The corollary: **the shared file must not decide visibility either.** UI hides four names as
duplicates (`SHOP_DUPLICATES`: `gear`≈`cog`, `plusbold`≈`plus`, `padlock`≈`lock`, `shard`=`triangle`)
and hides `splash` because it has no silhouette at icon size. VFX has no reason to hide any of them.
Visibility is per-app, always.

---

## 2. What the two rosters actually contain

Measured 2026-08-26.

| CrunchyVFX `SHAPE_DEFS` | count | |
|---|---|---|
| records | **89** | includes the `grenade` trial port, uncommitted |
| static geometry — shareable | **65** | |
| reads a slider (`st.*`) | 16 | `blob bolt crescent cross custom flower glyph image ring shard smoke snowflake spark spiral star teardrop` |
| radial gradient | 6 | `glow spark ring smoke cross flower` |
| seeded noise `rnd()` | 6 | `boom crack puddle rift rock specks` |
| animates on `frame` | 2 | `frame image` |
| bitmap | 2 | `custom image` |

| CrunchyUI icons | count | |
|---|---|---|
| icon records total | **161** | `ICON_DEFS` 16 · `LATE_DEFS` 91 · `INPUT_DEFS` 54 · `COMPOSITE_MARKS` 14 |
| with `segs()` | **107** | `ICON_DEFS` 16 + `LATE_DEFS` 91; the portable pool |
| object icons new to VFX | **68** | |
| multi-subpath (even-odd matters) | **70 of 106** | |
| `segs(rp)` — weight-parameterised | 16 | UI-native, cannot be static data |
| `btn-*` input glyphs | 54 | not particles |
| `icons-vfx.js` `VFX_SHAPES` | **54** | already ported from VFX |

**Only 10 names collide** between UI's icons and VFX's shapes: `plus arrow lock star heart bolt ring
flower egg crack`. The two rosters are very nearly disjoint, which is why this is worth doing at
all.

---

## 3. What does NOT transfer

**VFX's 24 dynamic shapes, permanently.** Gradients, per-pixel noise, bitmaps and slider-driven
geometry have no static form. `port-vfx-shapes.mjs` reached the same list independently and its
comment on `bolt` is the one to keep:

> `bolt` joins them not because it cannot be recorded but because it SHOULD NOT be — its shape comes
> out of a seeded jitter, so what ports is one arbitrary instance of a lightning bolt rather than a
> drawing of one.

**UI's parameterised icons.** 16 records take `segs(rp)` and read `rp.weight`; the icon treatment
controls that weight. Baking one instance throws away the reason they exist.

**Semantic ops.** §1.2 — `roundRect` is a snapped stair-step in raster and an arc in SVG; a ramp
fill is Bayer dither or a `<linearGradient>`. Shared geometry is *baked bezier data* and knows none
of that. Anything whose value comes from being semantic should stay UI-native rather than being
flattened into the shared file.

**So both apps keep a native roster regardless.** The shared file is the middle ~120 entries. This
is not a merge; it is an intersection, and framing it as a merge is how it would fail.

---

## 4. The constraint UI owns, and VFX has to adopt

§11.12, and it governs the shared file:

> **EVEN-ODD DECIDES WHAT CAN BE DRAWN AT ALL.** Crossed swords, a muted speaker and a refresh arrow
> were all wanted and all dropped: each is defined by strokes that CROSS, and the path op fills
> even-odd, so the intersection cancels and punches a hole exactly where the shape needs to be solid.

**VFX has no such limit and never has.** It composites a white mask into a 64px canvas, so
overlapping fills simply union — a VFX author can cross two strokes and nothing complains. A shape
authored that way enters the shared file looking fine in VFX and arrives in UI with a hole in it.

This is the invariant most likely to be violated silently, and it needs an assertion on the VFX
side, where the discipline is new. UI's existing solutions are the reference: a `log`'s nested cuts,
a `compass` as a band with the needle inside the hole, and `clock`'s two hands drawn as one L-shaped
polygon — §11.12 notes that last construction "would solve crossed swords, which is now a known job
rather than an open question."

**Second, the two apps author at different sizes.** §11.6:

> the same 88 VFX records work as particles and struggle as icons, and not because of resolution
> (§11.5) — because a particle is glimpsed for six frames among a hundred and fifty, and an icon is
> stared at. Same art, different viewing contract.

VFX ships at roughly 8–30px in motion; UI at 16–256px, stared at. §8.3's `bow` lesson — read at 54px,
collapsed into a filled D at 30px — is the failure mode. **The shared contact sheet must render at
VFX's 12px and UI's 30px in the same view**, or one app will keep accepting shapes the other cannot
use.

---

## 5. Traps, all of them paid for here

**The existing generator cannot run.** `tools/port-vfx-shapes.mjs` line 170 reads its `st` defaults
from `/tmp/claude-1000/-home-acas-Code-crunchyUI/b8559732-…/scratchpad/vfxdefaults.json`, which no
longer exists. A one-shot generator with an unpinned input decayed inside a single session. **This
is the strongest argument for the whole proposal and also its main risk**: pin every input inside
the repo, and put a hash assertion in *both* suites, the way `crunchysfx-synth.js` is checked. A
shared file nobody can regenerate is worse than two hand-maintained ones.

**VFX's default fill rule is nonzero.** `g.fill()` throughout `shapes.js`; the string `evenodd`
appeared nowhere in the file before this week. Replaying UI geometry with the default silently
fills every hole — I rendered it: `compass` becomes a plain disc, `crt` and `controller` become
solid blobs, and `battery`, `clock`, `portal`, `helm` all lose their holes. It looks like a drawing
decision, not a bug.

**A VFX shape can draw nothing without `st`.** Rendering `teardrop` with `st = {}` produced an empty
sprite in my harness. Sixteen shapes read sliders; the generator needs real defaults, which is
exactly the input that went missing.

**UI's name-collision skip already exists and should be kept.** §11.12: "the VFX loop now skips a
name already defined, so a hand-authored shape wins over the ported one." Six of UI's redraws depend
on it. The shared file needs the same per-app override, in both directions.

**Do not edit the vendored copy.** UI already articulated this, and it is the principle the whole
proposal rests on — §11.12 on why `icons-vfx.js` is left untouched: *"it is VFX's data, and editing
it there would make two repos disagree about a shape neither owns."*

---

## 6. Decisions worth settling before any code

1. **Where the authored file lives.** Neither repo owns it cleanly. Vendoring a copy into each — the
   `crunchysfx-synth.js` model, with a pull script and a hash assertion — is the only option that
   survives `file://`, two deploys, two `.assetsignore` files and two Tauri `FRONTEND` lists.
2. **Whose geometry wins for the 10 colliding names**, and separately for the 14 in the generator's
   `DONE` set that UI hand-authored rather than porting.
3. **The six redrawn silhouettes.** §11.11: `flame`, `leaf`, `feather`, `drop`, `spike` and `wing`
   were "the same narrow pointed oval — six names for one silhouette", and UI fixed all six by
   changing the OUTLINE. Those fixes never came back to VFX. I measured VFX's current versions at
   30px: **`flame`/`leaf` overlap 0.62 IoU** — still the same shape. The rest are more distinct than
   §11.11's framing implies (0.36–0.51), so this is a partial confirmation, not a full one.
   **Adopting UI's versions changes the appearance of every saved VFX effect using them**, so it is
   a maintainer decision, not a consequence of plumbing. VFX's default is to keep its own.
4. **Whether the shared file carries anything beyond geometry** — a category, a suggested size band,
   an even-odd-safe flag. Keep it minimal; each app already has its own categorisation
   (`SHAPE_CATS` here, families there) and they do not agree.

---

## 7. Suggested first steps

1. **Resurrect the generator with pinned inputs.** Rebuild `vfxdefaults.json` from VFX's `PARAMS`
   defaults, commit it, and regenerate `icons-vfx.js`. **Success is a byte-for-byte match with the
   checked-in file** — that proves the pipeline before anything depends on it, and it is the only
   cheap proof available.
2. **Write the even-odd assertion on the VFX side** before importing anything, since that discipline
   is new there.
3. **Build the two-regime contact sheet** — 12px and 30px in one view — and look at it.
4. Only then extract the shared file and write the two replayers.

A precedent for step 4 exists and it went well: `grenade` was ported into VFX by hand this week from
`LATE_DEFS`. It needed **zero coordinate work** — UI's `segs()` are already in the −1..1 space
`draw(g, R, …)` multiplies against — and one change, `g.fill("evenodd")`. It tints, scales and
rotates like any native shape; the pin ring measures alpha 0 against a body of 255; the suite passes
479 assertions with `RANDOM_SHAPES` grown 86 → 87; and it registered three picker buttons (main,
Layer B, Orbit). The format risk is retired. What remains is governance.

---

## 8. What VFX is asking UI for

- **A ruling on items 2 and 3 of §6** — the colliding names and the six silhouettes. VFX will not change existing
  geometry without it.
- **Confirmation that the even-odd contract is the shared one**, and that VFX adopting it is
  correct rather than VFX carrying an exception.
- **Anything §11 learned that is not written down.** §11.11's "nobody had looked at all 68 at once"
  is the kind of thing that only shows up in a contact sheet, and VFX is about to make the same
  class of mistake in the other direction.

VFX is not asking UI to take anything new today. UI already holds all 68 and has judged them —
55 of 64 good, four hidden as duplicates, `splash` hidden as *"a texture at 30px is a smudge."*
The value is entirely forward-looking: shape #90 gets drawn once and appears in both. If shapes stop
being added, this is not worth building.

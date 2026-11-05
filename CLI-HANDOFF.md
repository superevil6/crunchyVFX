# CLI handoff from Painter Panic (splotch2), 2026-11-05

## 1. A batch file's `"play"` key is silently ignored

`--help` says of the batch file: "Every option above is a key there." The option is `--play auto|loop|once`, so a
batch entry with `"play": "once"` looks right. But the batch path only reads `playback` (`tools/vfx-cli-page.js:106`;
the flag is translated to `e.playback` at `tools/vfx-cli.mjs:104`, and nothing does the same for batch keys).

**What it cost:** Painter Panic's `tools/attack-vfx.json` used `"play": "once"` for 18 effects. The four whose presets
loop by default (Curse Mark, Music Notes, Cathedral Light, Petal Fall) exported as loops, and in the game they played
forever and were never freed. It went unnoticed until a playtest, because nothing warned.

**Asks, either is enough:**
- Accept `play` in a batch entry as an alias of `playback`, the same way the flag does, or
- Warn on any unknown key in a batch entry (`unknown key "play" in effect "attack-doubt", did you mean "playback"?`).

The warning covers every future typo too, so it's the better of the two. Fixed on the game's side by renaming the key.

// GENERATED from crunchyCore/moments.js @ b392977 by tools/pull-core.mjs. DO NOT EDIT HERE: edit crunchyCore, then pull.
// sha256 ca524b9716df00d5b6fd8e2708421374b4ba9ddedf4d5051feb2f17e910b787a
"use strict";
// crunchyCore — GAME MOMENTS (MOMENTS.md, AJ 2026-10-24): a hit is not one asset. A moment puts a CrunchyVFX effect, a
// CrunchySFX sound, a CrunchyShader hit look, a screen shake and a beat of hit stop into ONE Godot node:
// `$Hit.play_at($Enemy)`. Step 1 (this build): the node itself, `crunchy_moment.gd` (class CrunchyMoment), and the
// writer of a moment's scene. A developer can fill one in by hand in Godot's Inspector with ANY assets; the Library's
// moment modal (step 2) will only fill one in. tests/moments-godot.mjs plays one in REAL Godot.
//
// TIMING: a CrunchyVFX effect scene emits `impact` on its brightest frame (the fireball at its fullest). With
// `on_impact` on, the sound, the hit look, the shake and the hit stop wait for it (each plus its own delay), so they
// land with the hit, not with the wind-up; an effect without the signal (or none) starts them at once.
// THE HIT LOOK, two ways: a target whose sprite carries a CrunchyShader combo's States node (exportStatesGd) gets
// `flash(<look_state>)`; otherwise the sprite wears `look_material` for `look_seconds` (a play-once material is
// played through: frame_override 0 -> last, or progress 0 -> 100 -> 0) and gets its own material back.
// Pure: strings only.

const MOMENT_BUILD = 2;   // 2: share links in the Sound and Hit look slots (MOMENTS.md step 3)

const MOMENT_GD = [
  "class_name CrunchyMoment",
  "extends Node",
  "## A game moment from the Crunchy suite (CC0): a sound, an effect, a hit look, a screen shake and a hit stop,",
  "## played together at a target with play_at(target). Fill the fields in the Inspector (any assets work).",
  "",
  "## Emitted when every part of the moment has finished.",
  "signal finished",
  "",
  "@export_group(\"Parts\")",
  "## The sound (an AudioStreamWAV, or CrunchySFX's AudioStreamRandomizer pack: a different take each time).",
  "@export var sound: AudioStream",
  "## The effect scene, spawned at the target (CrunchyVFX's scenes play, emit impact and free themselves).",
  "@export var effect: PackedScene",
  "## The target's hit look: a CrunchyShader material it wears for look_seconds (none: no hit look).",
  "@export var look_material: ShaderMaterial",
  "## Or a state of the target's CrunchyShader States node to flash (it wins over look_material when found).",
  "@export var look_state := \"\"",
  "@export var look_seconds := 0.2",
  "@export_group(\"Feel\")",
  "## How far the camera shakes, in pixels (0: none).",
  "@export var shake_px := 3.0",
  "@export var shake_seconds := 0.15",
  "## How many frames the game freezes for (at 60 frames a second; 0: none).",
  "@export var hit_stop_frames := 0",
  "@export_group(\"Timing\")",
  "## Wait for the effect's impact frame before the rest (an effect without one starts them at once).",
  "@export var on_impact := true",
  "@export var sound_delay := 0.0",
  "@export var look_delay := 0.0",
  "@export var shake_delay := 0.0",
  "@export var stop_delay := 0.0",
  "## How long an effect that does not free itself is kept (seconds).",
  "@export var effect_lifetime := 1.5",
  "",
  "var _running := 0",
  "",
  "## Play the moment at a target (a Node2D: its position; any node: the screen's sound, no position).",
  "func play_at(target: Node = null) -> void:",
  "\t_running = 0",
  "\tvar fx: Node = null",
  "\tif effect:",
  "\t\tfx = effect.instantiate()",
  "\t\tvar host: Node = target.get_parent() if target and target.get_parent() else get_tree().current_scene",
  "\t\tif host == null:",
  "\t\t\thost = get_tree().root",
  "\t\thost.add_child(fx)",
  "\t\tif fx is Node2D and target is Node2D:",
  "\t\t\tfx.global_position = target.global_position",
  "\t\t_hold()",
  "\t\tif fx.has_signal(\"finished\"):",
  "\t\t\tfx.finished.connect(_done, CONNECT_ONE_SHOT)",
  "\t\telse:",
  "\t\t\tget_tree().create_timer(effect_lifetime, true, false, true).timeout.connect(_free_effect.bind(fx))",
  "\tif on_impact and fx and fx.has_signal(\"impact\"):",
  "\t\t_hold()",
  "\t\tfx.impact.connect(_on_impact.bind(target), CONNECT_ONE_SHOT)",
  "\telse:",
  "\t\t_rest(target)",
  "\tif _running == 0:",
  "\t\tfinished.emit.call_deferred()",
  "",
  "func _free_effect(fx: Node) -> void:",
  "\tif is_instance_valid(fx):",
  "\t\tfx.queue_free()",
  "\t_done()",
  "",
  "func _on_impact(target: Node) -> void:",
  "\t_rest(target)",
  "\t_done()",
  "",
  "func _rest(target: Node) -> void:",
  "\tif sound:",
  "\t\t_after(sound_delay, \"sound\", target)",
  "\tif look_material or look_state != \"\":",
  "\t\t_after(look_delay, \"look\", target)",
  "\tif shake_px > 0.0 and shake_seconds > 0.0:",
  "\t\t_after(shake_delay, \"shake\", target)",
  "\tif hit_stop_frames > 0:",
  "\t\t_after(stop_delay, \"stop\", target)",
  "",
  "# A part's start, after its delay in REAL time (a hit stop never holds up the rest of the moment).",
  "func _after(delay: float, part: String, target: Node) -> void:",
  "\t_hold()",
  "\tif delay > 0.0:",
  "\t\tawait get_tree().create_timer(delay, true, false, true).timeout",
  "\tmatch part:",
  "\t\t\"sound\": await _sound_at(target)",
  "\t\t\"look\": await _look(target)",
  "\t\t\"shake\": await _shake()",
  "\t\t\"stop\": await _stop()",
  "\t_done()",
  "",
  "func _hold() -> void:",
  "\t_running += 1",
  "",
  "func _done() -> void:",
  "\t_running -= 1",
  "\tif _running == 0:",
  "\t\tfinished.emit()",
  "",
  "func _sound_at(target: Node) -> void:",
  "\tvar p: Node",
  "\tif target is Node2D:",
  "\t\tp = AudioStreamPlayer2D.new()",
  "\telse:",
  "\t\tp = AudioStreamPlayer.new()",
  "\tp.stream = sound",
  "\tadd_child(p)",
  "\tif p is AudioStreamPlayer2D:",
  "\t\tp.global_position = target.global_position",
  "\tp.play()",
  "\tvar n := sound.get_length() if sound.get_length() > 0.0 else 2.0",
  "\tawait get_tree().create_timer(n + 0.1, true, false, true).timeout",
  "\tp.queue_free()",
  "",
  "# The target's sprite: the target itself if it draws, else its first CanvasItem child.",
  "func _sprite_of(target: Node) -> CanvasItem:",
  "\tif target is CanvasItem and not (target is CollisionObject2D):",
  "\t\treturn target",
  "\tif target:",
  "\t\tfor c in target.get_children():",
  "\t\t\tif c is Sprite2D or c is AnimatedSprite2D:",
  "\t\t\t\treturn c",
  "\treturn null",
  "",
  "func _look(target: Node) -> void:",
  "\tvar s := _sprite_of(target)",
  "\tif s == null:",
  "\t\treturn",
  "\tvar states := s.get_node_or_null(\"States\")",
  "\tif look_state != \"\" and states and states.has_method(\"flash\"):",
  "\t\tstates.flash(look_state)",
  "\t\tawait get_tree().create_timer(look_seconds, true, false, true).timeout",
  "\t\treturn",
  "\tif look_material == null:",
  "\t\treturn",
  "\tvar was := s.material",
  "\tvar m: ShaderMaterial = look_material.duplicate()",
  "\ts.material = m",
  "\tvar names := []",
  "\tif m.shader:",
  "\t\tfor u in m.shader.get_shader_uniform_list():",
  "\t\t\tnames.append(u.name)",
  "\tvar tw := create_tween().set_ignore_time_scale(true)",
  "\tif \"frame_override\" in names and \"fps\" in names:",
  "\t\tvar last := maxi(0, int(round(look_seconds * float(m.get_shader_parameter(\"fps\")))) - 1)",
  "\t\tm.set_shader_parameter(\"frame_override\", 0)",
  "\t\ttw.tween_method(func(f: float) -> void: m.set_shader_parameter(\"frame_override\", int(f)), 0.0, float(last), look_seconds)",
  "\telif \"progress\" in names:",
  "\t\ttw.tween_method(func(p: float) -> void: m.set_shader_parameter(\"progress\", int(p)), 0.0, 100.0, look_seconds * 0.5)",
  "\t\ttw.tween_method(func(p: float) -> void: m.set_shader_parameter(\"progress\", int(p)), 100.0, 0.0, look_seconds * 0.5)",
  "\telse:",
  "\t\ttw.tween_interval(look_seconds)",
  "\tawait tw.finished",
  "\tif is_instance_valid(s) and s.material == m:",
  "\t\ts.material = was",
  "",
  "func _shake() -> void:",
  "\tvar cam := get_viewport().get_camera_2d()",
  "\tif cam == null:",
  "\t\treturn",
  "\tvar base := cam.offset",
  "\tvar t0 := Time.get_ticks_msec()",
  "\twhile Time.get_ticks_msec() - t0 < shake_seconds * 1000.0:",
  "\t\tvar k := 1.0 - float(Time.get_ticks_msec() - t0) / (shake_seconds * 1000.0)",
  "\t\tcam.offset = base + Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)).round() * shake_px * k",
  "\t\tawait get_tree().process_frame",
  "\tcam.offset = base",
  "",
  "func _stop() -> void:",
  "\tvar was := Engine.time_scale",
  "\tEngine.time_scale = 0.0",
  "\tawait get_tree().create_timer(float(hit_stop_frames) / 60.0, true, false, true).timeout",
  "\tEngine.time_scale = was",
  ""].join("\n");

// A moment's scene: one CrunchyMoment node with its fields filled. o: { name, script (res:// of crunchy_moment.gd),
// sound, effect, look (res:// paths or ""), look_state, look_seconds, shake_px, shake_seconds, hit_stop_frames,
// on_impact, sound_delay, look_delay, shake_delay, stop_delay }. Paths may be relative to the scene ("hit.wav").
function momentScene(o) {
  const ext = [], ids = {};
  const res = (key, type, path) => { if (!path) return; ids[key] = (ext.length + 1) + "_" + key; ext.push("[ext_resource type=\"" + type + "\" path=\"" + path + "\" id=\"" + ids[key] + "\"]"); };
  res("script", "Script", o.script || "../crunchy_moment.gd");
  res("sound", "AudioStream", o.sound);
  res("effect", "PackedScene", o.effect);
  res("look", "Material", o.look);
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  const fl = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  const L = ["[gd_scene load_steps=" + (ext.length + 1) + " format=3]", ""].concat(ext, ["",
    "[node name=\"" + String(o.name || "Moment").replace(/[^A-Za-z0-9_]/g, "") + "\" type=\"Node\"]",
    "script = ExtResource(\"" + ids.script + "\")"]);
  if (ids.sound) L.push("sound = ExtResource(\"" + ids.sound + "\")");
  if (ids.effect) L.push("effect = ExtResource(\"" + ids.effect + "\")");
  if (ids.look) L.push("look_material = ExtResource(\"" + ids.look + "\")");
  if (o.look_state) L.push("look_state = \"" + String(o.look_state).replace(/"/g, "") + "\"");
  L.push("look_seconds = " + fl(num(o.look_seconds, 0.2)), "shake_px = " + fl(num(o.shake_px, 3)), "shake_seconds = " + fl(num(o.shake_seconds, 0.15)),
    "hit_stop_frames = " + Math.max(0, Math.round(num(o.hit_stop_frames, 0))), "on_impact = " + (o.on_impact === false ? "false" : "true"));
  for (const k of ["sound_delay", "look_delay", "shake_delay", "stop_delay"]) if (num(o[k], 0)) L.push(k + " = " + fl(num(o[k], 0)));
  return L.join("\n") + "\n";
}

// ---- STEP 2: the moment as a planted asset (MOMENTS.md) -----------------------------------------------------------------
// A moment belongs to no one tool: it is the suite's, in crunchy/moments/<slug>/ (<slug>.tscn + its sidecar), with the
// node's script planted ONCE as a support file (crunchy/moments/scripts/crunchy_moment.gd). plant.js 16's plantOpenAs(P,
// MOMENT_APP) opens that folder as this "app". The sidecar's `m` is the moment's settings and pieces; `links` are suite
// links (mode "reference") to every planted piece, so deleting a piece in its app names the moment (plantLinkersOf), and
// the scene's res:// paths are what the removal guard reads. Godot only for now (a Unity project: MOMENT_GODOT_ONLY).
const MOMENT_APP = {
  id: "crunchymoments", name: "Game moments", suite: "moments",
  kinds: { moment: { dir: "moments", label: "Game moments" } },
  valid: function (kind, d) { return kind === "moment" && !!d.m && typeof d.m === "object" && !Array.isArray(d.m) && (d.links == null || Array.isArray(d.links)); },
};
const MOMENT_SCRIPT_REL = "scripts/crunchy_moment.gd", MOMENT_GODOT_ONLY = "Game moments are Godot only for now.";
// Templates: the knobs a kind of moment starts from (every slot stays the person's).
const MOMENT_TEMPLATES = {
  hit: { label: "Hit", shake_px: 3, shake_seconds: 0.15, hit_stop_frames: 4, look_seconds: 0.2 },
  heavy: { label: "Heavy hit", shake_px: 6, shake_seconds: 0.3, hit_stop_frames: 8, look_seconds: 0.3 },
  pickup: { label: "Pickup", shake_px: 0, shake_seconds: 0.1, hit_stop_frames: 0, look_seconds: 0.3 },
  death: { label: "Death", shake_px: 5, shake_seconds: 0.35, hit_stop_frames: 10, look_seconds: 0.6 },
  levelup: { label: "Level up", shake_px: 0, shake_seconds: 0.1, hit_stop_frames: 0, look_seconds: 0.8 },
  heal: { label: "Heal", shake_px: 0, shake_seconds: 0.1, hit_stop_frames: 0, look_seconds: 0.5 },
  explosion: { label: "Explosion", shake_px: 8, shake_seconds: 0.45, hit_stop_frames: 6, look_seconds: 0.3 },
};
const MOMENT_DEFAULTS = { template: "hit", effect: null, sound: null, look: null, sound_link: "", look_link: "", look_state: "", on_impact: true,
  sound_delay: 0, look_delay: 0, shake_delay: 0, stop_delay: 0, shake_px: 3, shake_seconds: 0.15, hit_stop_frames: 4, look_seconds: 0.2 };
// A moment's settings, every field present and in range (a hand-edited sidecar never reaches the scene as nonsense)
function momentClean(m) {
  const o = Object.assign({}, MOMENT_DEFAULTS, m || {}), n = (v, lo, hi, d) => (typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  o.template = MOMENT_TEMPLATES[o.template] ? o.template : "hit";
  for (const k of ["effect", "sound", "look"]) o[k] = o[k] && typeof o[k].suite === "string" && typeof o[k].slug === "string" ? { suite: o[k].suite, slug: o[k].slug } : null;
  o.look_state = typeof o.look_state === "string" ? o.look_state.replace(/[^\w -]/g, "").slice(0, 40) : "";
  // a SHARE LINK in a slot (step 3): kept as given (a web address, bounded), and only while that slot has no planted piece
  for (const k of ["sound_link", "look_link"]) o[k] = typeof o[k] === "string" && /^https?:\/\//.test(o[k].trim()) ? o[k].trim().slice(0, 6000) : "";
  if (o.sound) o.sound_link = "";
  if (o.look) o.look_link = "";
  o.on_impact = o.on_impact !== false;
  for (const k of ["sound_delay", "look_delay", "shake_delay", "stop_delay"]) o[k] = n(o[k], 0, 5, 0);
  o.shake_px = n(o.shake_px, 0, 32, 3); o.shake_seconds = n(o.shake_seconds, 0, 3, 0.15);
  o.hit_stop_frames = Math.round(n(o.hit_stop_frames, 0, 60, 4)); o.look_seconds = n(o.look_seconds, 0.05, 3, 0.2);
  return o;
}
// THE PIECES in a game: every planted VFX effect, CrunchySFX sound and CrunchyShader effect (sprite effects only, when the
// shader engine is loaded to tell), as { suite, slug, name, files, d, file (the one the moment uses), res (its res://) }.
const MOMENT_SLOTS = {
  effect: { suite: "vfx", kind: "effect", label: "Effect", app: "CrunchyVFX", pick: (x) => x.files.find((f) => /\.tscn$/i.test(f)) },
  sound: { suite: "sfx", kind: "sound", label: "Sound", app: "CrunchySFX", pick: (x) => x.d.wav && x.files.indexOf(x.d.wav) >= 0 ? x.d.wav : x.files.find((f) => /\.wav$/i.test(f)) },
  look: { suite: "shader", kind: "effect", label: "Hit look", app: "CrunchyShader", pick: (x) => x.files.find((f) => /\.tres$/i.test(f) && !/overlay|transition/i.test(f)) },
};
async function momentPieces(P) {
  const out = {};
  for (const slot of Object.keys(MOMENT_SLOTS)) {
    const S = MOMENT_SLOTS[slot], rel = plantChildRel(P.engine, S.suite);
    out[slot] = (await plantReadChild(P, S.suite)).filter((x) => x.d.kind === S.kind).map((x) => {
      const files = Array.isArray(x.d.files) ? x.d.files.filter(plantSafeRel) : [], piece = { suite: S.suite, slug: x.slug, name: x.d.name, files: files, d: x.d, hash: String(x.d.hash || "") };
      piece.file = S.pick(piece) || null;
      piece.path = piece.file ? plantJoin(rel, x.slug, piece.file) : null;               // relative to the game folder
      piece.res = piece.path ? "res://" + piece.path : null;
      return piece;
    }).filter((p) => p.file && (slot !== "look" || typeof SHADER_DEFS === "undefined" || !SHADER_DEFS[p.d.e] || (SHADER_DEFS[p.d.e].kind || "sprite") !== "screen"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}
// What the stage reads from a VFX effect's own files: the SpriteFrames' regions and speed, and the scene's impact frame.
function momentFrames(tres) {
  const regions = [], re = /region = Rect2\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)/g;
  let m;
  while ((m = re.exec(tres))) regions.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] });
  const sp = /"speed":\s*([\d.]+)/.exec(tres), lp = /"loop":\s*(true|false)/.exec(tres);
  return { regions: regions, fps: sp ? +sp[1] : 12, loop: !!(lp && lp[1] === "true") };
}
function momentImpactFrame(tscn) { const m = /impact_frame = (\d+)/.exec(tscn || ""); return m ? +m[1] : 0; }
// THE TARGET on the stage when you bring no sprite of your own: the suite's hero (crunchyCore hero.js, CrunchyCharacter's
// default character drawn by its own engine; AJ, 2026-10-25: "that guy should be uniquely ours"). The app loads hero.js.
function momentTargetImage() { return crunchyHeroImage(); }
// ---- STEP 3: SHARE LINKS in the slots (AJ, 2026-10-25: "Make one in…" opens the free web app, where there is no Library:
// paste its share link here) --------------------------------------------------------------------------------------------
// A CrunchyShader link (?e=<effect>&p=<settings>&n=<name>) is rendered by this file's own shader engine: the moment's
// look is printed into ITS folder. A combo (&c=) needs CrunchyShader's own code, so it is refused, saying so. A
// CrunchySFX link is the HOST APP's to render (momentOpen's `linkSound`: CrunchyVFX carries the synth); the WAV it makes
// is written into the moment's folder the same way. The moment keeps the link (m.sound_link / m.look_link) so it reopens.
function momentShaderLink(url) {
  const s = String(url || "").trim(), qi = s.indexOf("?");
  if (qi < 0) return { error: "That isn't a CrunchyShader link: copy it with Share link in CrunchyShader." };
  let q;
  try { q = new URLSearchParams(s.slice(qi + 1)); } catch (e) { return { error: "That isn't a CrunchyShader link." }; }
  const e = q.get("e");
  if (!e) return { error: "That isn't a CrunchyShader link (there is no effect in it)." };
  if (q.get("c")) return { error: "That link is a combo, and a combo can't be rendered outside CrunchyShader yet: save it into this game from CrunchyShader, or link one effect." };
  if (typeof SHADER_DEFS === "undefined" || !SHADER_DEFS[e]) return { error: "This app doesn't know the effect “" + e + "”: it was made in a newer CrunchyShader. Update this app, or save it into this game from CrunchyShader." };
  if ((SHADER_DEFS[e].kind || "sprite") === "screen") return { error: "“" + e + "” is a screen effect: a hit look needs one that works on a sprite." };
  let p = {};
  try { p = JSON.parse(q.get("p") || "{}") || {}; } catch (err) { p = {}; }
  return { e: e, p: typeof p === "object" && !Array.isArray(p) ? p : {}, name: (q.get("n") || e).slice(0, 60) };
}
// A linked look's Godot files, to sit in the moment's folder `dir` (res://…/): its .gdshader and its material
function momentLookFiles(L, dir) {
  const f = shaderGodotFiles(L.e, shaderParams(shaderDef(L.e), L.p), dir, "unused.png");
  return [{ path: f[0].name, data: f[0].data }, { path: f[1].name, data: f[1].data }];
}
// SAVE: plant the moment (and the node's script, once). P: the app's own handle on the game; name; m: the settings;
// pieces: momentPieces(P); linked (step 3, optional): { sound: { name, wav: bytes } } from the host's linkSound.
// Returns the planted asset.
async function momentSave(P, name, m, pieces, linked) {
  if (P.engine === "unity") throw new Error(MOMENT_GODOT_ONLY);
  const M = await plantOpenAs(P, MOMENT_APP), mc = momentClean(m), find = (slot) => mc[slot] && (pieces[slot] || []).find((p) => p.suite === mc[slot].suite && p.slug === mc[slot].slug);
  const fx = find("effect"), snd = find("sound"), look = find("look");
  await plantSupport(M, [{ path: MOMENT_SCRIPT_REL, data: MOMENT_GD }]);
  const slug = await plantSlugFor(M, "moment", name), file = slug + ".tscn", dirRes = "res://" + plantJoin(M.rel, slug) + "/", extra = [];
  // pieces from LINKS, written into the moment's own folder (they are the moment's: Delete takes them with it)
  let sndRes = snd ? snd.res : "", lookRes = look ? look.res : "";
  if (!snd && mc.sound_link && linked && linked.sound && linked.sound.wav) { extra.push({ path: slug + "_sound.wav", data: linked.sound.wav }); sndRes = dirRes + slug + "_sound.wav"; }
  if (!look && mc.look_link) {
    const L = momentShaderLink(mc.look_link);
    if (L.error) throw new Error("Hit look: " + L.error);
    const lf = momentLookFiles(L, dirRes);
    extra.push.apply(extra, lf); lookRes = dirRes + lf[1].path;
  }
  const scene = momentScene(Object.assign({}, mc, { name: name, script: "res://" + plantJoin(M.rel, MOMENT_SCRIPT_REL),
    sound: sndRes, effect: fx ? fx.res : "", look: lookRes }));
  const links = [fx, snd, look].filter(Boolean).map((p) => plantLinkOf({ suite: p.suite, slug: p.slug, kind: p.d.kind, name: p.name, files: p.files, hash: p.hash }, p.file, "reference"));
  return plantPut(M, { kind: "moment", name: name, fields: { m: mc, links: links, s: "" }, files: [{ path: file, data: scene }].concat(extra), appVersion: String(MOMENT_BUILD) });
}

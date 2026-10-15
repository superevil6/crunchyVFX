// CrunchyVFX ships as plain sibling files at the repo root — the SAME files the web version
// serves. Tauri wants a single frontend directory, so before compiling we copy them into ../dist/
// (the configured frontendDist). Runs on every cargo build, on every platform, with no external
// tooling, which is what keeps web and desktop from drifting.
//
// If you add a sibling file to the frontend, add it here too — a missing one fails the build
// loudly rather than shipping a desktop app with a feature quietly missing.
const FRONTEND: [&str; 19] = [
    "index.html",
    "favicon.png",
    "presets.js",
    // The shape roster — vfx.js reads SHAPE_DEFS out of it, so the app is blank without it.
    "shapes.js",
    // The suite's icon drawings (crunchyCore glyphs.js, GENERATED; VFX-DESIGN §28): the Icon particle draws them.
    "glyphs.js",
    // Vendored CrunchySFX synthesis engine (tools/pull-synth.py) — the desktop build
    // must carry it or the app loses in-app sound.
    "crunchysfx-synth.js",
    "vfx.js",
    "gif.js",
    "apng.js",
    // The planted Library (VFX-DESIGN §18): VFX's own adapter, then plant.js, library.js, settings.js and
    // desktop.js — GENERATED from crunchyCore (tools/pull-core.mjs), never edited here.
    "project-app.js",
    "plant.js",
    "library.js",
    "settings.js",
    "desktop.js",
    // The feedback dialog (VFX-DESIGN §20) — GENERATED from crunchyCore too.
    "feedback.js",
    // The "Crunchy suite" dialog and the suite's pixel icons — GENERATED from crunchyCore
    // (tools/pull-core.mjs), never edited here.
    "suite.js",
    "crunchy-icons.js",
    // The suite's shared look (crunchyCore), linked BEFORE styles.css.
    "crunchy-base.css",
    "styles.css",
];

fn main() {
    let _ = std::fs::create_dir_all("../dist");
    for f in FRONTEND {
        std::fs::copy(format!("../{f}"), format!("../dist/{f}"))
            .unwrap_or_else(|e| panic!("build.rs: could not copy ../{f} -> ../dist/{f}: {e}"));
        println!("cargo:rerun-if-changed=../{f}");
    }
    tauri_build::build();
}

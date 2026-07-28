// CrunchyVFX ships as plain sibling files at the repo root — the SAME files the web version
// serves. Tauri wants a single frontend directory, so before compiling we copy them into ../dist/
// (the configured frontendDist). Runs on every cargo build, on every platform, with no external
// tooling, which is what keeps web and desktop from drifting.
//
// If you add a sibling file to the frontend, add it here too — a missing one fails the build
// loudly rather than shipping a desktop app with a feature quietly missing.
const FRONTEND: [&str; 8] = [
    "index.html",
    "presets.js",
    // The shape roster — vfx.js reads SHAPE_DEFS out of it, so the app is blank without it.
    "shapes.js",
    // Vendored CrunchySFX synthesis engine (tools/pull-synth.py) — the desktop build
    // must carry it or the app loses in-app sound.
    "crunchysfx-synth.js",
    "vfx.js",
    "gif.js",
    "apng.js",
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

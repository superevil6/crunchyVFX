// CrunchyVFX ships as plain sibling files at the repo root — the SAME files the web version
// serves. Tauri wants a single frontend directory, so before compiling we copy them into ../dist/
// (the configured frontendDist). Runs on every cargo build, on every platform, with no external
// tooling, which is what keeps web and desktop from drifting.
//
// If you add a sibling file to the frontend, add it here too — a missing one fails the build
// loudly rather than shipping a desktop app with a feature quietly missing.
const FRONTEND: [&str; 6] = [
    "index.html",
    "presets.js",
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

#!/usr/bin/env python3
"""Generate the test pages.

The app is one big inline <script> in index.html, and fetch() is CORS-blocked on file://, so a
test page can't pull it in at run time. Instead we concatenate: index.html verbatim, then the
suite appended as another classic script — which shares the same global scope and can therefore
poke at `state`, `PARAMS`, `simulate`, the modals, everything, exactly as the app sees them.

  python3 tests/build.py      ->  tests/run.html, tests/run-async.html
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
APP = (HERE.parent / "index.html").read_text()

# index.html loads its siblings by relative path, so rebase them to the parent directory.
APP = APP.replace('href="styles.css"', 'href="../styles.css"')
for js in ("presets.js", "vfx.js", "gif.js", "apng.js"):
    APP = APP.replace('src="%s"' % js, 'src="../%s"' % js)

for suite, out in (("regression.js", "run.html"), ("regression-async.js", "run-async.html")):
    if not (HERE / suite).exists():
        continue
    (HERE / out).write_text(APP + '\n<script src="%s"></script>\n' % suite)
    print("wrote tests/%s  (%s)" % (out, suite))

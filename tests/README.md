# Dev regression suite

Not shipped — the app never loads any of this.

`build.py` concatenates `index.html` with a suite into a runnable page. It has to concatenate
rather than import because the app is one inline `<script>` and `fetch` is CORS-blocked on
`file://` — appending the suite as another classic script puts it in the same global scope, so it
can drive `state`, `simulate`, the modals and the real DOM handlers directly.

## Running it

There is no JS runtime on the dev box, so the browser IS the test runner:

```sh
python3 tests/build.py
firefox --headless --profile $(mktemp -d) --window-size=1200,900 \
        --screenshot tests/out.png file:///path/to/crunchyVFX/tests/run.html
```

Read `out.png`: a green banner means every assertion passed, red lists the failures.

**Always pass a fresh `--profile`.** Firefox caches `file://` assets between runs and will
happily screenshot stale code, which looks exactly like "my fix did nothing".

## Async assertions

`--screenshot` fires at `window.load`, so anything behind an `await` (APNG encoding, image
decoding, zip writing) finishes *after* the shot and would silently never appear. Those live in
`regression-async.js`, which writes `results.txt` via a download instead. Run it with a profile
configured to auto-save downloads and read the file.

## The edge handler

```sh
node tests/worker.test.mjs        # 29 assertions, exits non-zero on failure
```

A second runner, and only just justified: `worker.js` is an ES module built on Cloudflare globals,
so it can't be inlined into the browser suite the way every sibling file is. What it decides is
whether a stale file can reach a user and whether a share link unfurls by name — worth pinning. It
already caught one real bug: decoding a patch title with bare `atob` turned `Feu ✨` into `Feu â¨`,
because `atob` yields latin1 and the app encodes names as UTF-8.

The Worker's `fetch` itself needs a runtime. There is one — `npx wrangler dev --port 8787 --local`
runs it on `workerd` locally, which is how the stamping, cache headers, `.assetsignore` exclusions
and share-card rewriting were confirmed rather than assumed. See `DEPLOY.md`.

## Why this lives in the repo

It used to live in a scratchpad directory and was lost to a stray `rm -rf`. Verification that
can be deleted by accident isn't verification.

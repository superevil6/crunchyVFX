# Shipping CrunchyVFX to crunchyvfx.com

Mirrors the CrunchySFX and CrunchyBGM setup — Cloudflare **Workers** (not Pages), with Workers
Builds connected to the GitHub repo, serving the repo root as static assets with a small Worker in
front. `worker.js` has the reasoning in its header; this file is the runbook.

Domain: **crunchyvfx.com at the root**, matching crunchysfx.com and crunchybgm.com — one domain per
tool in the suite. The canonical/`og:` URLs in `index.html` and `WEB_BASE_URL` (which is what share
links from the desktop build point at) all already say so.

---

## What this app needs that its siblings don't

It needs **both** of their Worker jobs, which is why `worker.js` here is longer than either of
theirs:

| | CrunchySFX | CrunchyBGM | CrunchyVFX |
|---|---|---|---|
| Subresources the browser loads | 3 | 9 | **7** |
| Version-stamps them at the edge | no | yes | **yes** |
| Rewrites Open Graph per share link | yes (`?s=`) | slot left open | **yes (`?e=`)** |
| Repoints card images at the serving host | no | yes | **yes** |

**Why the image repointing.** `og:image` must be absolute — crawlers drop relative ones — so
`index.html` hard-codes `https://crunchyvfx.com/og.png`. That is right once the domain is attached
and wrong everywhere else: on the workers.dev URL, on every preview deploy. The Worker rewrites
`og:image` and `twitter:image` to whichever origin answered, so cards unfurl with a real image on
any host. `canonical` and `og:url` are left alone — they are identity claims, true regardless of who
served the page. (Ported from CrunchyBGM, where it was worked out first. Directly relevant here: the
checklist below says to validate cards *on the preview URL*, which is precisely where the hard-coded
absolute image would have been broken.)

**Why the stamping.** Seven independently-cached sibling files means a browser can pair a fresh
`index.html` with a stale `vfx.js`, and the app dies on a symbol that doesn't exist yet. That is not
hypothetical — it happened during development: a cached `vfx.js` against an edited `index.html`
produced `shapeSet is not defined`, and the visible error was in a function that had nothing to do
with the cause. On `file://` a hard reload fixes it. On a CDN it's a deploy, it hits strangers, and
"hard-reload" isn't an instruction you get to give them.

So a subresource URL changes whenever the deploy does: `index.html` is `no-cache` and is the
manifest naming every other file's version; everything it points at is immutable for a year because
its URL is unique per deploy. Staleness stops being something to detect and becomes something that
can't happen.

---

## One-time setup

1. **Push to GitHub** — `superevil6/crunchyVFX` is already `origin`.
2. **Cloudflare → Workers & Pages → Create → Workers → Connect to Git**, pick the repo.
   - Build command: *(none — there is no build step)*
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
3. Confirm the Worker is named **`crunchyvfx`** so it matches `wrangler.jsonc`. If the dashboard
   creates it under a different name, Workers Builds will happily make a *second* Worker and you'll
   be deploying to a URL nobody is looking at. (Both siblings call out the same footgun.)
4. **Enable the version metadata binding** (Settings → Bindings → Version metadata). `worker.js`
   uses it to stamp subresource URLs. Without it the Worker falls back to a constant and
   cache-busting silently stops working — the fallback logs loudly, so check the logs once.
5. **DNS**: the zone is already on Cloudflare nameservers. Worker → Settings → Domains & Routes →
   **Add → Custom Domain** → `crunchyvfx.com`, and again for `www.crunchyvfx.com`.

   Cloudflare creates the DNS record and the certificate itself — **do not hand-add an A/AAAA/CNAME
   for these hostnames.** A Custom Domain *cannot* be created on a hostname that already has a CNAME
   record, so a manual record doesn't just duplicate the work, it blocks the real fix. If a hostname
   ever stops resolving, the repair is to re-add the Custom Domain (remove and re-add if the
   dashboard still lists it), not to recreate the record by hand.

   Both hostnames need adding because a Custom Domain matches the hostname *exactly* — a Worker on
   `crunchyvfx.com` never sees `www.crunchyvfx.com`. Two Custom Domains is the simple option and what
   this runbook assumes. The alternative — one canonical host plus a redirect rule — additionally
   needs a *proxied placeholder* record on the host you redirect from (`A → 192.0.2.0` or
   `AAAA → 100::`), which is the one case where a manual record is correct.
6. Run the checklist below **on the preview URL** before pointing the domain at it.

---

## Cache policy

| what | header | why |
|---|---|---|
| `index.html` | `no-cache` | Tiny, and it's the manifest that names every other file's version. It must never be stale. |
| `*.js`, `*.css` **with** `?v=` | `public, max-age=31536000, immutable` | The URL changes when the deploy does, so it can be cached forever. |
| `*.js`, `*.css` **without** `?v=` | `no-cache` | Someone typed the URL, or the injection failed. Fail safe, not fast. |
| `*.js`, `*.css` with **`?v=dev`** | `no-cache` | `dev` is the fallback stamp used when the version binding is missing. See below — this row is the most important one in the table. |
| `version.json` | `no-cache` + `Access-Control-Allow-Origin: *` | A desktop update check runs from `tauri://` — cross-origin — and must see a release immediately. |

`og.png` and the icons are fetched by crawlers without a `?v=`, so they land in the `no-cache`
row. That's a deliberate consequence of keeping one rule rather than three: it costs a few
kilobytes of revalidation per unfurl and means a regenerated card is never served stale.

The `?v=` is injected **at the edge**, from the deploy's version id — never hand-maintained in
`index.html`. A hand-kept version gets forgotten, and a forgotten one here is a broken site rather
than a failing test. (This repo's tour copy carried three hard-coded counts and all three were
stale; same class of mistake, smaller blast radius.)

### Why `?v=dev` must not be cacheable

If step 4 is missed, the Worker has no version id and falls back to the constant `dev`. Every asset
then gets stamped `?v=dev` — a URL that is *stable across every future deploy*. Treating that as
"versioned" would serve the entire site `immutable` for a year under URLs that never change again:
the exact catastrophe the stamping exists to prevent, arrived at **through** the mechanism meant to
prevent it, with one log line as the only symptom.

So `isVersioned()` excludes the fallback explicitly, and a missing binding degrades to "nothing is
cached" rather than "everything is cached forever". Verified both ways on the local runtime.

**CrunchyBGM has this hole** — its `isVersioned()` is `url.searchParams.has("v")`, so a BGM deploy
that ever loses the binding pins a year of immutable caching to `?v=dev`. Worth porting the
two-line fix.

---

## What does NOT get published

`.assetsignore` excludes the design doc, the working notes, the test suite, the tooling, and the
Tauri and Flatpak sources. Without it, `assets.directory: "."` publishes the **entire repo** on
every path a crawler can find.

The published set is exactly: `index.html`, the six sibling scripts, `styles.css`, and
`favicon.png` / `apple-touch-icon.png` / `og.png`. **If you add a file the app loads at runtime, it
must not be matched by `.assetsignore`** — re-run the verification below after adding one.

---

## Verifying it

Unlike the siblings, this Worker has been **run against the real Cloudflare runtime locally** —
`workerd`, via `npx wrangler dev` — so its behaviour isn't taken on faith:

```sh
node tests/worker.test.mjs                    # the pure helpers (33 assertions)
rm -rf .wrangler                              # see the reload-loop note below
npx wrangler dev --port 8787 --local          # the whole thing, on workerd
```

**`rm -rf .wrangler` first.** `assets.directory: "."` makes `wrangler dev` watch the repo root — and
its own `.wrangler/` state directory lives inside that root, so its writes trigger a reload, which
writes state, which triggers a reload. A stale one sent a session into 2838 reloads serving zero
requests, which reads exactly like a broken Worker. Cleared, it settles after three.

**Keep `flatpak/` free of build output.** `.assetsignore` filters the asset list *after* wrangler has
walked the directory, so it does not stop the walk. CrunchySFX cannot run `wrangler dev` at all right
now for exactly this reason — a flatpak-builder sandbox left an unreadable directory behind and the
scan dies on `EACCES … scandir 'flatpak/build-dir/var/run/containerd'`. Workers Builds is unaffected
(it clones the repo, and those paths are gitignored); this only bites local runs. This repo is clean
today because it has only the two flatpak source files — building the Flatpak locally would change
that, so clear `flatpak/build-dir` and `flatpak/repo` before a local wrangler run.

Confirmed locally on that runtime:

- all seven subresources stamped, every one with the same version
- `index.html` `no-cache`; `vfx.js?v=…` immutable; bare `vfx.js` `no-cache`
- `.assetsignore` works — `CLAUDE.md`, `VFX-DESIGN.md`, `worker.js`, `wrangler.jsonc` and
  `tests/` all 404, while every app file is 200
- `?e=<patch>` rewrites `<title>`, `og:title`, `og:description`, `og:url` and the twitter tags
- a non-ASCII effect name survives (`Feu ✨`, not `Feu â¨` — see the note on `effectTitle`)
- an unnamed patch and a malformed `?e=` both fall back to the generic card, status 200
- an effect name containing `" onload="` is escaped into the attribute, not out of it
- `/version.json` gets CORS + `no-cache` even while no such file exists
- **the app itself boots and renders** when served through the Worker with stamped URLs
- a real deploy id (`?v=49383b66`) is `immutable` while the fallback (`?v=dev`) is `no-cache`
- `og:image` and `twitter:image` are repointed at the serving host and the image returns 200 there,
  while `canonical` and `og:url` still say `crunchyvfx.com`
- the Worker module **boots at all** — exporting a non-function from an entry module made workerd
  refuse to start ("not of type 'function or ExportedHandler'"), which would have been a dead site
  rather than a warning. Only the runtime catches that; the unit tests were perfectly happy.

## Cost note

`run_worker_first: true` routes **every** request through the Worker — roughly ten invocations per
page view here, not one. Cloudflare's own guidance prefers selective array patterns
(`run_worker_first: ["/", "/api/*"]`) to cut that, and the free tier is 100k invocations/day, so
this ceiling is around 10k page views/day before the paid plan ($5/mo) is needed.

It stays `true` deliberately. The alternative is serving assets directly and setting cache headers
declaratively — but `_headers` is a Pages feature, not available for Workers static assets, and the
cache policy here is *conditional on the query string* (`?v=` present, and not the fallback), which
no path-pattern config can express. Correct caching is worth more than the invocation savings; if
traffic ever makes that false, the lever is a selective pattern for `/` plus accepting a fixed
policy for assets.

### What still needs a real deploy

Only the things no local runtime can stand in for:

- [ ] the **version metadata binding** is actually enabled — check the Worker log for the
      "no version_metadata binding" warning; if it's there, step 4 was missed
- [ ] the custom domain and `www` both resolve and serve over HTTPS
- [ ] paste a `?e=…` share link into Discord or a card validator and see the effect's name unfurl
- [ ] `crunchyvfx.com/version.json` — expect 404 until the update checker ships; the point is that
      the CORS header is present
- [ ] mobile width: toolbar wraps, panels fit, nothing scrolls horizontally

---

## Still to do before launch

- [ ] **`version.json` + the update checker** — deferred by decision. The Worker route already
      exists, so enabling it is committing one JSON file, not editing and re-verifying the Worker.

Both sibling issues that were listed here are **fixed** (edits staged in their repos, uncommitted):
CrunchySFX's share encoder threw on any non-latin1 sound name, and CrunchyBGM's `isVersioned()`
treated the fallback stamp as cacheable. Neither was what this file originally claimed — see the
notes in those repos.

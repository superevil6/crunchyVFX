/* CrunchyVFX — the edge handler for the web deploy (Cloudflare Worker + static assets).
 *
 * See DEPLOY.md for the runbook. This app needs BOTH of what its siblings do, which is why this
 * file is longer than either of theirs:
 *
 * 1. STAMP EVERY SUBRESOURCE with the deploy's version, and set cache headers to match.
 *    (CrunchyBGM's problem. CrunchySFX does not need it.)
 * 2. PER-EFFECT OPEN GRAPH CARDS for `?e=` share links.
 *    (CrunchySFX's feature. CrunchyBGM has the slot left open but no share links yet.)
 * 3. Serve /version.json with CORS and no-cache, for a desktop update check.
 *
 * =================================================================================================
 * WHY (1) EXISTS
 *
 * CrunchySFX loads three subresources and gets away without this. CrunchyVFX loads SEVEN —
 * presets.js, the vendored synth, shapes.js, vfx.js, gif.js, apng.js and the stylesheet — each
 * cached independently by the browser, because the app must also open on file:// where modules and
 * fetch are both CORS-blocked. Seven independent caches means a browser can pair a fresh
 * index.html with a stale vfx.js and the app dies on a symbol that does not exist yet.
 *
 * That is not hypothetical for this codebase. It is exactly the failure that cost time TODAY: a
 * cached vfx.js against an edited index.html produced `shapeSet is not defined`, and the only clue
 * was a ReferenceError deep in a function that had nothing to do with the real problem. On
 * file:// a hard reload fixes it. On a CDN it is a deploy, it happens to strangers, and
 * "hard-reload" is not an instruction you get to give them.
 *
 * The fix is that a subresource URL must change whenever the deploy does. index.html is served
 * no-cache and is the manifest naming every other file's version; everything it points at is
 * immutable for a year because its URL is unique per deploy. Staleness stops being something to
 * detect and becomes something that cannot happen.
 *
 * Injected HERE rather than hand-written into index.html: a hand-kept version number gets
 * forgotten, and a forgotten one here is a broken site rather than a failing test. (Today's tour
 * copy had three hard-coded counts, all three stale. Same class of mistake, smaller blast radius.)
 * =================================================================================================
 *
 * VERIFIED on a real Cloudflare runtime — unlike both siblings, whose workers still carry an
 * "UNVERIFIED" note. `npx wrangler dev --local` runs workerd here, and the stamping, cache headers,
 * .assetsignore exclusions, share-card rewriting, image repointing and a full app boot were all
 * confirmed through it. The pure helpers are additionally covered by `node tests/worker.test.mjs`.
 *
 * What local runs still cannot prove: that the version_metadata binding is actually enabled on the
 * deployed Worker, and that the custom domain resolves. DEPLOY.md's checklist covers both.
 */

// Used only if the version_metadata binding is missing. It logs when that happens, because the
// silent failure mode — no stamps, every sibling cached for a year under a stable URL — is the
// exact problem this file exists to prevent, and it looks perfectly healthy until a deploy breaks
// someone else's first visit.
// NOT exported, and that is load-bearing: a Worker entry module may only export functions and the
// default handler. Exporting this string made workerd refuse to start outright —
// "Incorrect type for map entry 'FALLBACK_VERSION': the provided value is not of type 'function or
// ExportedHandler'" — which would have been a dead site, not a warning. The test gets this value
// from deployVersion({}) instead, which is the contract that actually matters anyway.
const FALLBACK_VERSION = "dev";

const YEAR = 60 * 60 * 24 * 365;
const MAX_TITLE = 60;   // keep card titles tidy; also caps abuse from a crafted link

/** The deploy id, short enough to keep URLs readable. */
export function deployVersion(env) {
  const meta = env && env.CF_VERSION_METADATA;
  if (meta && meta.id) return String(meta.id).slice(0, 8);
  console.warn("CrunchyVFX: no version_metadata binding — subresources will NOT be cache-busted. "
    + "Enable it in the Worker's settings (DEPLOY.md step 4).");
  return FALLBACK_VERSION;
}

/**
 * Is this a versioned subresource request? Only those may be cached hard.
 *
 * `?v=dev` deliberately does NOT count. When the version_metadata binding is missing, every asset
 * gets stamped with that one constant — so treating it as versioned would pin a year-long immutable
 * cache to a URL that never changes between deploys. That is precisely the catastrophe the stamping
 * exists to prevent, arrived at by the mechanism meant to prevent it, and the only symptom would be
 * one log line nobody reads. A missing binding must degrade to "nothing is cached", never to
 * "everything is cached forever". (CrunchyBGM's worker has this hole — see DEPLOY.md.)
 */
export function isVersioned(url) {
  const v = url.searchParams.get("v");
  return !!v && v !== FALLBACK_VERSION;
}

/**
 * Cache-Control for a response, given the request.
 *
 * Anything without a `?v=` is served no-cache even when it looks static, because reaching a bare
 * `vfx.js` means either someone typed it or the injection failed — and caching that for a year
 * would bake the bug in permanently. Fail safe, not fast.
 */
export function cacheHeaderFor(url, contentType) {
  if (url.pathname === "/version.json") return "no-cache";
  if ((contentType || "").includes("text/html")) return "no-cache";
  return isVersioned(url) ? "public, max-age=" + YEAR + ", immutable" : "no-cache";
}

/** Add `?v=` to a relative subresource URL, leaving absolute and already-stamped ones alone. */
export function stamp(src, version) {
  if (!src) return src;
  if (/^(https?:)?\/\//.test(src) || src.startsWith("data:")) return src;
  if (/[?&]v=/.test(src)) return src;
  return src + (src.includes("?") ? "&" : "?") + "v=" + version;
}

/**
 * Point an absolute asset URL at the origin actually serving this request.
 *
 * `og:image` has to be absolute — crawlers do not resolve relative ones, they drop the image — so
 * index.html hard-codes `https://crunchyvfx.com/og.png`. That is correct once the domain is attached
 * and BROKEN everywhere else: on the workers.dev URL, on every preview deploy, on any staging host.
 * The card unfurls with a missing image and nothing says why — and DEPLOY.md's own checklist says to
 * validate share cards ON THE PREVIEW URL, which is exactly where it would have been wrong.
 *
 * Only IMAGE urls are rewritten. `canonical` and `og:url` are identity claims — "this page's real
 * home is crunchyvfx.com" — and stay true whichever host answered. An image has to actually load.
 *
 * (Ported from CrunchyBGM, where this was worked out first.)
 */
export function sameOrigin(value, origin) {
  if (!value) return value;
  try {
    const u = new URL(value);
    return origin + u.pathname + u.search;
  } catch (_) {
    return value;                       // relative or malformed: leave it alone
  }
}

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Decode the base64url payload encodePatch() produces and return its title (`n`), or null.
 *
 * Never throws: a truncated or hand-mangled link is a completely ordinary thing to receive, and
 * the right response is the generic card rather than a 500. Mirrors decodePatch()'s alphabet —
 * "-_" back to "+/" and the stripped "=" padding restored.
 *
 * The TextDecoder step is NOT optional, and the test suite is what proved it. `atob` returns a
 * latin1 "binary string", so decoding straight out of it turns an effect named "Feu ✨" into
 * "Feu â¨" on the card. The app encodes names as UTF-8 bytes (TextEncoder → btoa) and decodes them
 * back through TextDecoder; anything reading those patches has to do the same. Share names are
 * whatever someone typed, and emoji in them is a feature elsewhere in the app.
 */
export function effectTitle(e) {
  try {
    let b64 = String(e).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (obj && typeof obj.n === "string" && obj.n.trim()) return obj.n.trim().slice(0, MAX_TITLE);
  } catch (_) { /* ignore — generic card */ }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The DESKTOP app's update check would run from its own webview origin (tauri://…), so it is a
    // CROSS-ORIGIN request and needs CORS or the browser blocks it; no-cache so a fresh release is
    // seen immediately rather than after an edge TTL. Same as both siblings.
    //
    // NOTE: there is no version.json in this repo yet — the update checker is deliberately
    // deferred. The route lives here anyway so that turning it on later means committing one JSON
    // file, not editing the Worker and re-running the whole preview-deploy verification.
    if (url.pathname === "/version.json") {
      const r = await env.ASSETS.fetch(request);
      const h = new Headers(r.headers);
      h.set("Access-Control-Allow-Origin", "*");
      h.set("Cache-Control", "no-cache");
      return new Response(r.body, { status: r.status, headers: h });
    }

    const res = await env.ASSETS.fetch(request);
    const ct = res.headers.get("content-type") || "";
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", cacheHeaderFor(url, ct));

    // Not an HTML document: nothing to rewrite, just the corrected cache header.
    if (!ct.includes("text/html")) {
      return new Response(res.body, { status: res.status, headers: headers });
    }

    const version = deployVersion(env);
    const setAttr = (attr) => ({
      element(el) {
        const v = el.getAttribute(attr);
        if (v) el.setAttribute(attr, stamp(v, version));
      },
    });

    // Both jobs run over the same document in one pass. Stamping always applies; the card rewrite
    // only when the link actually carries a named effect.
    // Card images resolve against whatever host answered, so a preview deploy and the workers.dev
    // URL unfurl with a real image instead of a broken one. Identity tags are deliberately untouched.
    const toHere = { element(el) {
      const v = el.getAttribute("content");
      if (v) el.setAttribute("content", sameOrigin(v, url.origin));
    } };

    let rw = new HTMLRewriter()
      .on("script[src]", setAttr("src"))
      .on('link[rel="stylesheet"]', setAttr("href"))
      .on('meta[property="og:image"]', toHere)
      .on('meta[name="twitter:image"]', toHere);

    const title = effectTitle(url.searchParams.get("e") || "");
    if (title) {
      const ogTitle = esc("💥 " + title + " — CrunchyVFX");
      const ogDesc = esc('Click to see "' + title + '" — made with CrunchyVFX, the free '
        + 'from-scratch sprite VFX generator. Design your own and share it as a link.');
      const setContent = (v) => ({ element: (el) => el.setAttribute("content", v) });
      rw = rw
        .on('meta[property="og:title"]',        setContent(ogTitle))
        .on('meta[name="twitter:title"]',       setContent(ogTitle))
        .on('meta[property="og:description"]',  setContent(ogDesc))
        .on('meta[name="twitter:description"]', setContent(ogDesc))
        .on('meta[property="og:url"]',          setContent(esc(url.href)))
        .on("title", { element: (el) => el.setInnerContent(title + " — CrunchyVFX") });
    }

    return rw.transform(new Response(res.body, { status: res.status, headers: headers }));
  },
};

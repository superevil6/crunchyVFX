/* The edge handler's pure helpers.
 *
 * Run: node tests/worker.test.mjs
 *
 * A SECOND RUNNER, and only just justified — the same call CrunchyBGM made. `worker.js` is an ES
 * module that depends on Cloudflare globals, so it cannot be inlined into the browser suite the way
 * every sibling file is. What it decides matters: whether a stale file can reach a user, and
 * whether a shared link unfurls as an effect or as a bare domain. The Worker's `fetch` itself still
 * cannot be exercised here — DEPLOY.md's checklist covers that on a preview deploy.
 */
import { stamp, cacheHeaderFor, isVersioned, deployVersion, effectTitle, esc, sameOrigin }
  from "../worker.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fail++;
  console.log("FAIL " + name + (detail ? " — " + detail : ""));
};
const eq = (name, got, want) => ok(name, got === want, JSON.stringify(got) + " != " + JSON.stringify(want));

// --- stamp ---------------------------------------------------------------------------------------
eq("a relative script gains the version", stamp("vfx.js", "abc123"), "vfx.js?v=abc123");
eq("an existing query string is preserved", stamp("a.js?x=1", "v"), "a.js?x=1&v=v");
// Re-stamping would grow the URL on every pass and quietly change it, which is the one thing a
// cache key must never do.
eq("an already-stamped URL is left alone", stamp("a.js?v=old", "new"), "a.js?v=old");
eq("an absolute URL is left alone", stamp("https://cdn.example/x.js", "v"), "https://cdn.example/x.js");
eq("a protocol-relative URL is left alone", stamp("//cdn/x.js", "v"), "//cdn/x.js");
eq("a data: URL is left alone", stamp("data:text/javascript,0", "v"), "data:text/javascript,0");
eq("an empty src is returned unchanged", stamp("", "v"), "");

// --- cache headers -------------------------------------------------------------------------------
const u = (s) => new URL("https://crunchyvfx.com" + s);
ok("HTML is never cached", cacheHeaderFor(u("/"), "text/html; charset=utf-8") === "no-cache");
ok("a versioned script is immutable",
   /immutable/.test(cacheHeaderFor(u("/vfx.js?v=abc"), "text/javascript")));
// The important one: reaching a BARE sibling means the injection failed or someone typed it.
// Caching that for a year would bake the bug in permanently.
ok("an UNVERSIONED script is not cached",
   cacheHeaderFor(u("/vfx.js"), "text/javascript") === "no-cache");
ok("version.json is never cached, even though it is not HTML",
   cacheHeaderFor(u("/version.json"), "application/json") === "no-cache");
ok("a share link is still HTML, so still no-cache",
   cacheHeaderFor(u("/?e=abc"), "text/html") === "no-cache");
ok("isVersioned only looks at v", isVersioned(u("/a.js?v=1")) && !isVersioned(u("/a.js?x=1")));

// --- version -------------------------------------------------------------------------------------
eq("the deploy id is shortened", deployVersion({ CF_VERSION_METADATA: { id: "0123456789abcdef" } }),
   "01234567");
{
  // The fallback must be LOUD. Silently serving unstamped URLs is exactly the failure the whole
  // mechanism exists to prevent, and it would look perfectly healthy until a deploy broke someone.
  const warns = [];
  const real = console.warn;
  console.warn = (m) => warns.push(String(m));
  const v = deployVersion({});
  console.warn = real;
  ok("a missing binding falls back", typeof v === "string" && v.length > 0);
  ok("and says so, loudly", warns.length === 1 && /version_metadata/.test(warns[0]), warns.join());
}

// The failure mode that matters most, and the one a log line alone does not save you from: with no
// binding every asset is stamped with the SAME constant, so counting that as "versioned" would
// serve the whole site immutable for a year under URLs that never change between deploys — the
// exact catastrophe the stamping exists to prevent, reached through the stamping itself.
//
// The fallback string is read back out of deployVersion rather than imported: worker.js is a Worker
// ENTRY module, and exporting a non-function from one makes workerd refuse to boot. This also tests
// the contract that matters — whatever a binding-less deploy stamps must not be cacheable — instead
// of a constant's spelling.
const FALLBACK = (() => {
  const real = console.warn; console.warn = () => {};
  const v = deployVersion({}); console.warn = real; return v;
})();
ok("the fallback version is NOT treated as cacheable", !isVersioned(u("/vfx.js?v=" + FALLBACK)));
eq("…so a missing binding degrades to no-cache, not to cached-forever",
   cacheHeaderFor(u("/vfx.js?v=" + FALLBACK), "text/javascript"), "no-cache");
ok("a real deploy id is still cacheable", isVersioned(u("/vfx.js?v=21697004")));
ok("an empty v= is not cacheable", !isVersioned(u("/vfx.js?v=")));

// --- share-link titles ---------------------------------------------------------------------------
// Must decode exactly what encodePatch() produces: URL-safe base64 with "=" padding stripped, and
// the effect name in `n`. Built here the same way the app builds it, so a change to either alphabet
// shows up as a failure rather than as cards that quietly stop naming the effect.
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

eq("a named effect yields its name", effectTitle(encode({ n: "Fire Jet", count: 40 })), "Fire Jet");
eq("an unnamed patch yields null", effectTitle(encode({ count: 40 })), null);
eq("a blank name yields null", effectTitle(encode({ n: "   " })), null);
eq("names are trimmed", effectTitle(encode({ n: "  Hit Spark  " })), "Hit Spark");
ok("a long name is capped", (effectTitle(encode({ n: "x".repeat(200) })) || "").length === 60);
// Every one of these is an ordinary thing to be sent, and none may 500 the page.
eq("garbage decodes to null", effectTitle("not!base64"), null);
eq("empty decodes to null", effectTitle(""), null);
eq("valid base64 that isn't JSON decodes to null", effectTitle(encode("")) === null ? null : "x", null);
eq("a JSON array decodes to null", effectTitle(encode([1, 2, 3])), null);
eq("a non-string name decodes to null", effectTitle(encode({ n: 42 })), null);
// Non-ASCII survives the round trip — presets and user names both allow it.
eq("unicode names survive", effectTitle(encode({ n: "Feu ✨" })), "Feu ✨");

// --- escaping ------------------------------------------------------------------------------------
// The name goes into an HTML attribute, and it comes from whatever was in the URL.
eq("quotes and angles are escaped",
   esc('"><script>'), "&quot;&gt;&lt;script&gt;");
ok("an injected attribute cannot break out",
   !/[<>"]/.test(esc('" onload="alert(1)')), esc('" onload="alert(1)'));

// --- card images follow the host that answered ---------------------------------------------------
// og:image must be absolute or crawlers drop it, but an absolute URL naming a domain that is not live
// yet unfurls broken on every OTHER host — including the preview URL that DEPLOY.md tells you to
// validate cards on.
eq("an image URL is repointed at the serving origin",
   sameOrigin("https://crunchyvfx.com/og.png", "https://crunchyvfx.sevi66.workers.dev"),
   "https://crunchyvfx.sevi66.workers.dev/og.png");
eq("the path and query survive",
   sameOrigin("https://crunchyvfx.com/og.png?x=1", "https://example.test"),
   "https://example.test/og.png?x=1");
eq("on the real domain it is a no-op",
   sameOrigin("https://crunchyvfx.com/og.png", "https://crunchyvfx.com"),
   "https://crunchyvfx.com/og.png");
eq("a relative value is left alone", sameOrigin("og.png", "https://x.test"), "og.png");
eq("and so is an empty one", sameOrigin("", "https://x.test"), "");

// --- the search-engine files (VFX-DESIGN §29) ------------------------------------------------------
// Plain assets, through the same one rule as og.png: unversioned, so revalidated, never pinned for a year.
for (const f of ["/robots.txt", "/sitemap.xml", "/44b30b0415e1540c853a5d3826a59855.txt"])
  ok(f + " is served no-cache", cacheHeaderFor(u(f), f.endsWith(".xml") ? "application/xml" : "text/plain") === "no-cache");
// The About page (about.html, served by the static assets at /about): the Worker passes it through ASSETS unchanged and
// it comes back as no-cache HTML. HTMLRewriter is a Cloudflare global; a pass-through stands in for it here.
{
  const worker = (await import("../worker.js")).default;
  const page = "<!doctype html><html lang=\"en\"><title>About CrunchyVFX</title></html>";
  const seen = [];
  globalThis.HTMLRewriter = class { on() { return this; } transform(r) { return r; } };
  const ASSETS = { fetch: async (req) => { seen.push(new URL(req.url).pathname);
    return new URL(req.url).pathname === "/about"
      ? new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } })
      : new Response("not found", { status: 404, headers: { "content-type": "text/plain" } }); } };
  const r = await worker.fetch(new Request("https://crunchyvfx.com/about"), { ASSETS, CF_VERSION_METADATA: { id: "abc12345" } });
  const body = await r.text();
  ok("/about is asked of ASSETS as /about", seen.length === 1 && seen[0] === "/about", seen.join(","));
  ok("/about comes back 200", r.status === 200, String(r.status));
  ok("/about is HTML", /text\/html/.test(r.headers.get("content-type") || ""), r.headers.get("content-type"));
  ok("/about is no-cache", r.headers.get("cache-control") === "no-cache", r.headers.get("cache-control"));
  ok("/about's page is passed through unchanged", body === page, body);
  delete globalThis.HTMLRewriter;
}
// And what a crawler reads (title, description, JSON-LD, the About FAQ, the suite footer, robots, sitemap, the
// IndexNow key, none of it hidden by .assetsignore): its own file, the same in every Crunchy app.
{
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("./seo.test.mjs", import.meta.url))], { encoding: "utf8" });
  const lines = (r.stdout + r.stderr).trim().split("\n");
  ok("the search-engine pass (node tests/seo.test.mjs): " + lines[lines.length - 1], r.status === 0,
     lines.filter((l) => l.startsWith("FAIL ")).join("; "));
}

// §30: version.json, what the DESKTOP app's update check reads. It must be published (not hidden by .assetsignore),
// parse, carry the shipped version (the same one tauri.conf.json, Cargo.toml, index.html's APP_VERSION and the Flatpak
// metainfo's newest <release> carry: scripts/release.sh bumps all five), and point at the store page.
{
  const { readFileSync } = await import("node:fs");
  const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  let info = null;
  try { info = JSON.parse(rd("version.json")); } catch (e) { /* reported below */ }
  ok("version.json exists and parses", !!info);
  const want = JSON.parse(rd("src-tauri/tauri.conf.json")).version;
  const found = {
    "version.json": info && info.version,
    "src-tauri/Cargo.toml": (rd("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m) || [])[1],
    "index.html APP_VERSION": (rd("index.html").match(/const APP_VERSION = "([^"]+)"/) || [])[1],
    "flatpak metainfo's newest release": (rd("flatpak/com.crunchyvfx.app.metainfo.xml").match(/<release version="([^"]+)"/) || [])[1],
  };
  for (const [where, v] of Object.entries(found)) eq(where + " is tauri.conf.json's version", v, want);
  ok("version.json points at the itch page", !!info && /^https:\/\/sevi66\.itch\.io\/crunchyvfx$/.test(info.url), info && info.url);
  ok("version.json has notes for the update banner", !!info && typeof info.notes === "string" && info.notes.length > 10);
  ok("the app's update check reads crunchyvfx.com/version.json",
     rd("index.html").includes('const UPDATE_URL = "https://crunchyvfx.com/version.json";'));
  const pats = rd(".assetsignore").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const rx = (p) => {
    const dir = p.endsWith("/"), body = p.replace(/\/$/, "").replace(/^\//, "");
    const re = body.split("**/").map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")).join("(?:.*/)?");
    return new RegExp((body.includes("/") ? "^" : "(^|/)") + re + (dir ? "/" : "(/|$)"));
  };
  ok(".assetsignore publishes version.json", !pats.some((p) => rx(p).test("version.json")));
}

console.log((fail ? "FAIL" : "PASS") + " · " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

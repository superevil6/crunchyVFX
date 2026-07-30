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

console.log((fail ? "FAIL" : "PASS") + " · " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// Before the app boots (the web and desktop suites): the browser store exactly as CrunchyVFX HEAD 11e8d14 left it
// (tests/fixtures/head.js, made by that build's own save functions), so the suites prove the current build reads it.
// Page errors are collected in window.__pageErrors (the web suite fails on any; the desktop mock keeps its own).
(function () {
  window.__pageErrors = [];
  addEventListener("error", function (e) { window.__pageErrors.push(String(e.message || e)); });
  addEventListener("unhandledrejection", function (e) { window.__pageErrors.push("unhandled: " + String(e.reason && e.reason.message || e.reason)); });
  localStorage.clear();
  const st = window.VFX_HEAD.localStorage.store;
  Object.keys(st).forEach(function (k) { localStorage.setItem(k, st[k]); });
})();

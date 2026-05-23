---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Restore non-browser-global support for `setupScrollRestoration`. Router construction no longer throws under jsdom-style DOM shims or in pure Node environments because the scroll-restoration setup now qualifies browser APIs with `window.` and bails out early when `window` is not defined.

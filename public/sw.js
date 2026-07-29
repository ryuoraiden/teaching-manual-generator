/*
 * Service worker for the Teaching Manual Generator PWA.
 *
 * Deliberately minimal and hand-written (no build plugin): this app is a thin
 * client — generation, image extraction and PDF/DOCX export all happen on the
 * server — so there is nothing meaningful to run offline. The worker exists to
 *   (a) satisfy the installability requirement (a fetch handler is required for
 *       Chrome's install prompt), and
 *   (b) make repeat launches fast without ever serving a stale app.
 *
 * Caching rules:
 *  - Only GET requests are touched. API calls are POST, so generation/export
 *    are never cached or intercepted in a way that could corrupt them.
 *  - /_next/static/* is content-hashed → cache-first, safe forever.
 *  - Navigations → network-first, falling back to cache then the offline page,
 *    so a deploy is picked up immediately instead of pinning an old build.
 */

const VERSION = "v2";
const STATIC_CACHE = `tmg-static-${VERSION}`;
const PAGE_CACHE = `tmg-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never interfere with non-GET (uploads, generation, exports) or cross-origin.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API responses are per-request and often large — always go to the network.
  if (url.pathname.startsWith("/api/")) return;

  // Content-hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Page navigations: network-first so new deploys land immediately.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match(OFFLINE_URL))
            .then((hit) => hit || Response.error())
        )
    );
  }
});

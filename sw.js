const VERSION = "epay-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/*
 * Network-first, no asset cache on purpose.
 * The app changes often and GitHub Pages should always serve the newest UI.
 * Keeping a fetch handler also gives installed browsers a proper PWA service worker.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});

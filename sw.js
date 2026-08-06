/* Service worker: the app is a multi-page site on GitHub Pages, so every
   tab switch was a full network round-trip - the blank frame while the
   next page downloaded is the "flash" between pages (an inline background
   can't paint a frame that hasn't arrived yet). Cache-first with
   background refresh (stale-while-revalidate) makes navigation instant
   from device cache. The update-check pill stays the freshness authority:
   tapping it tells this worker to drop every cache before reloading, so a
   new deploy still lands cleanly instead of trickling in. */
const CACHE = 'app-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SW_CLEAR') {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Cross-origin (GitHub API, Firebase, CDNs) goes straight to network -
  // this cache is only for the app's own files.
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const refresh = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || refresh;
      })
    )
  );
});

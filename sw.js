/* Service worker: the app is a multi-page site on GitHub Pages, so every
   tab switch was a full network round-trip - the blank frame while the
   next page downloaded is the "flash" between pages (an inline background
   can't paint a frame that hasn't arrived yet). Cache-first with
   background refresh (stale-while-revalidate) makes navigation instant
   from device cache. The update-check pill stays a secondary freshness
   nudge: tapping it drops every cache before reloading, for a clean jump
   straight to a specific deploy.

   v2 (2026-08-06): v1 applied stale-first to EVERY same-origin GET,
   including the top-level HTML documents themselves. That's a real bug,
   not just staleness - a cached HTML page references a FIXED set of
   versioned script URLs (godlike.css?v=31 etc.), so once the HTML itself
   goes stale it can NEVER discover newer script versions exist, no matter
   how many times the page reloads or how long you wait - there's no path
   back to fresh without an explicit cache-clear. Confirmed live: a device
   stuck on an old snapshot showed zero sign of Round-13+ work (search UI,
   Imprint Alignment, everything) despite many reloads. Fix: page
   NAVIGATIONS go network-first (falling back to cache only when offline),
   so the HTML is always current and always references the right script
   versions; sub-resources (scripts/styles/images) keep the original
   cache-first-with-background-refresh behavior, since a fresh HTML
   requesting a NEW version number is a cache miss anyway and fetches
   clean. CACHE renamed so activate() drops every v1 entry, including any
   stale cached HTML. */
const CACHE = 'app-v2';

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

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            e.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, res.clone())));
          }
          return res;
        })
        .catch(() => caches.open(CACHE).then((cache) => cache.match(req)))
    );
    return;
  }

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

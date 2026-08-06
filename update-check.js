/* New-deploy detector. Polls the repo's latest commit sha (public GitHub API,
   CORS-open, 60 req/hr/IP — we use ~12) and compares against the sha this
   device last saw. On a mismatch: a small "new version" pill slides in; tapping
   it stores the new sha and reloads with a cache-busting query so the HTML
   skips GitHub Pages' 10-minute cache (sub-resources may lag a few minutes
   behind — harmless). Dismissing also stores the sha so it never nags twice
   for the same deploy. localStorage is untouched by reloads, so this is the
   data-safe way to stay current on the home-screen app. */
(function () {
  const API = 'https://api.github.com/repos/ManWinAcuna/Advanced-Numerology/commits/main?per_page=1';
  const KEY = 'app_last_seen_sha';
  const POLL_MS = 5 * 60 * 1000;
  // GitHub's unauthenticated REST API allows 60 req/hr/IP - a long, active
  // session (many reloads, many app-switches each firing the visibility
  // check below) can burn through that fast, and a 403 rate-limit response
  // used to fail completely silently (r.ok false -> sha undefined -> the
  // pill just never shows, with no sign anything went wrong). lastCheckAt
  // throttles the visibilitychange trigger so backgrounding/foregrounding
  // repeatedly can't spam the budget on its own.
  let shown = false;
  let lastCheckAt = 0;

  function currentSeen() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(sha) {
    try { localStorage.setItem(KEY, sha); } catch (e) { /* ignore */ }
  }

  function showBanner(sha) {
    if (shown) return;
    shown = true;
    const style = document.createElement('style');
    style.textContent = `
      /* Top-LEFT on purpose: the sign-in pill owns the top-right — the two
         must never overlap (an undismissed update pill was eating the
         sign-in button's taps). */
      .upd-pill { position: fixed; top: calc(env(safe-area-inset-top) + 12px); left: 10px;
        z-index: 94; display: flex; align-items: center; gap: 10px;
        background: var(--panel, #0a0f1a); border: 1px solid var(--yellow, #f5c542);
        color: var(--yellow, #f5c542); border-radius: 999px; padding: 8px 12px;
        font-size: 12px; font-family: inherit; box-shadow: 0 4px 20px rgba(0,0,0,.5);
        animation: updIn .2s ease; }
      @keyframes updIn { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
      .upd-pill button { background: none; border: none; color: inherit; font-family: inherit;
        font-size: 13px; cursor: pointer; padding: 0; }
      .upd-pill .upd-x { color: var(--muted, #5b6a80); font-size: 15px; }
    `;
    document.head.appendChild(style);
    const pill = document.createElement('div');
    pill.className = 'upd-pill';
    pill.innerHTML = '<button class="upd-go">⬆ New version — tap to update</button><button class="upd-x" title="Later">×</button>';
    pill.querySelector('.upd-go').addEventListener('click', () => {
      pill.querySelector('.upd-go').textContent = '⏳ Updating…';
      remember(sha);
      // Drop the service worker's whole cache first, so the reload (and
      // every page after it) refetches the new deploy instead of being
      // served the pre-update files from cache.
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('SW_CLEAR');
      }
      location.replace(location.pathname + '?v=' + sha.slice(0, 7));
      // Standalone WebKit occasionally swallows same-path replace() calls —
      // if we're still here after a beat, force a plain reload.
      setTimeout(() => location.reload(), 1200);
    });
    pill.querySelector('.upd-x').addEventListener('click', () => {
      remember(sha);
      pill.remove();
      shown = false;
    });
    document.body.appendChild(pill);
  }

  function check() {
    if (!navigator.onLine) return;
    lastCheckAt = Date.now();
    fetch(API, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => {
        if (r.status === 403 || r.status === 429) {
          // Rate-limited - used to die here silently forever. Retry sooner
          // than the normal 5-minute cadence instead of just giving up.
          setTimeout(check, 45000);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        const sha = data && data.sha;
        if (!sha) return;
        const seen = currentSeen();
        if (!seen) { remember(sha); return; }
        if (seen !== sha) showBanner(sha);
      })
      .catch(() => { /* offline - try again on the normal cadence */ });
  }

  setTimeout(check, 3000);
  setInterval(check, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckAt > 60000) check();
  });

  // Standard PWA safety net: if a new service worker ever DOES take control
  // mid-session (e.g. the SW file itself changed), the page that's already
  // loaded is still running on the OLD cached resources until it reloads -
  // do that once automatically instead of leaving the user stuck looking at
  // stale content with no visible sign anything updated.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('sw_auto_reloaded')) return;
      sessionStorage.setItem('sw_auto_reloaded', '1');
      location.reload();
    });
  }

  // Instant page switches: sw.js serves every same-origin file cache-first
  // (with background refresh), so tab-to-tab navigation stops showing a
  // blank frame while the next page re-downloads. Registered here because
  // this script is already on every page.
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* ignore */ }
  }
})();

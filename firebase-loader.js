// Loads the Firebase SDKs (and the sign-in widget that needs them) after
// the page has finished loading, instead of parsing ~600KB of SDK on the
// critical path of every single page - the main source of first-visit lag
// on phones. Everything that touches Firebase already tolerates it being
// absent: db-core's cloudPushKey() queues keys saved before the SDK
// arrives, and auth-widget flushes that queue once sign-in state is known.
(function () {
  const SCRIPTS = [
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js',
    'firebase-init.js',
    'auth-widget.js',
  ];

  function loadNext(i) {
    if (i >= SCRIPTS.length) return;
    const s = document.createElement('script');
    s.src = SCRIPTS[i];
    s.onload = () => loadNext(i + 1);
    document.body.appendChild(s);
  }

  // Warm the HTTP cache for the astronomy bundle on pages that don't use
  // it, so the first visit to a page that does (Calendar, Astrology, the
  // UFC pages) doesn't pay its download on top of everything else.
  function prefetchAstronomy() {
    if (document.querySelector('script[src="astronomy.browser.min.js"]')) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = 'astronomy.browser.min.js';
    document.head.appendChild(link);
  }

  function start() {
    setTimeout(() => {
      loadNext(0);
      prefetchAstronomy();
    }, 300);
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();

// Loads the Firebase SDKs (and the sign-in widget that needs them) only
// when there's an actual reason to - not on every single page for every
// single visitor. The three SDK files alone are ~150KB gzipped, by far the
// biggest download on any page, and most visitors never touch cloud sync
// at all. Everything that touches Firebase already tolerates it being
// absent: db-core's cloudPushKey() queues keys saved before the SDK
// arrives, and auth-widget flushes that queue once sign-in state is known.
//
// - A browser that has signed in before auto-loads Firebase shortly after
//   the page settles, same as before, so a returning signed-in user's
//   cloud sync just works without an extra click on every page.
// - A browser that never has gets a static "Sign In" placeholder pill
//   instead (no Firebase dependency at all) - clicking it loads the SDK
//   on demand and hands off to the real widget in auth-widget.js.
(function () {
  const SCRIPTS = [
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js',
    'firebase-init.js',
    'auth-widget.js',
  ];

  const EVER_SIGNED_IN_KEY = 'numerology_ever_signed_in';

  // Resolves once this page's first (and only) cloud-pull attempt of the
  // session has settled - a signed-in user's real pull completing, an
  // unsigned-in state discovering there's no cloud to pull from, or a
  // network/SDK failure that means it's never coming. Anything on the page
  // that seeds local defaults and would PUSH them (EMAX's starter
  // categories - see emax.js) needs to know this has already happened
  // before touching the cloud, or it can push empty defaults over real
  // data before the real pull ever gets a chance to land. Capped so a
  // dead network can never wedge a caller waiting on this forever.
  let resolveFirstCloudPullDone;
  window.__firstCloudPullDone = new Promise((resolve) => { resolveFirstCloudPullDone = resolve; });
  window.__resolveFirstCloudPullDone = function () { resolveFirstCloudPullDone(); };
  setTimeout(() => resolveFirstCloudPullDone(), 10000);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(s);
    });
  }

  let loadPromise = null;

  // Idempotent and shared - the automatic path and a placeholder click can
  // both call this safely, the SDK chain only ever runs once.
  window.loadFirebaseSdk = function loadFirebaseSdk() {
    if (!loadPromise) {
      loadPromise = SCRIPTS.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve());
    }
    return loadPromise;
  };

  function renderSignInPlaceholder() {
    const widget = document.createElement('div');
    widget.className = 'auth-widget';
    widget.id = 'authWidgetPlaceholder';
    widget.innerHTML = '<span>Sign In</span>';
    document.body.appendChild(widget);

    let loading = false;
    widget.addEventListener('click', () => {
      if (loading) return;
      loading = true;
      widget.querySelector('span').textContent = 'Loading…';
      window.__pendingAuthWidgetClick = true;
      window.loadFirebaseSdk().catch(() => {
        loading = false;
        window.__pendingAuthWidgetClick = false;
        widget.querySelector('span').textContent = 'Sign In';
      });
    });
  }

  function start() {
    let everSignedIn = false;
    try { everSignedIn = !!localStorage.getItem(EVER_SIGNED_IN_KEY); } catch (e) { /* ignore */ }

    if (everSignedIn) {
      setTimeout(() => window.loadFirebaseSdk().catch(() => resolveFirstCloudPullDone()), 300);
    } else {
      renderSignInPlaceholder();
      resolveFirstCloudPullDone();
    }
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();

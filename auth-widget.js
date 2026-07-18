// Small floating sign-in widget + modal, injected on every page. Signing in
// is entirely optional - the app works purely on localStorage either way.
// When signed in, db-core.js's saveX() functions also push to Firestore.
// Right after an explicit sign-in/sign-up, this pulls the cloud copy down
// and reloads so the page reflects it immediately (the moment a fresh
// install/device/reinstalled home-screen icon needs it most). On a plain
// app relaunch where Firebase just restores an already-signed-in session,
// it instead pulls quietly in the background with no reload - forcing a
// reload there just flashed/glitched a page that was already showing
// perfectly good local data.
(function () {
  let explicitAuthAction = false;
  const widget = document.createElement('div');
  widget.className = 'auth-widget';
  widget.id = 'authWidget';
  widget.innerHTML = '<span id="authWidgetStatus">Sign In</span>';
  document.body.appendChild(widget);

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="authModalOverlay">
      <div class="modal-box modal-box-narrow">
        <button class="modal-close" id="authModalClose" title="Close">&times;</button>
        <div class="box-label" id="authModalTitle">Sign In</div>
        <div class="auth-modal-form">
          <input type="email" id="authEmail" placeholder="Email" autocomplete="email">
          <input type="password" id="authPassword" placeholder="Password" autocomplete="current-password">
          <div class="auth-modal-error" id="authError"></div>
          <button class="btn btn-large" id="authSubmitBtn">Sign In</button>
          <button class="btn-link" id="authToggleModeBtn">Need an account? Sign up</button>
        </div>
      </div>
    </div>
    <div class="auth-sync-overlay" id="authSyncOverlay">
      <div class="auth-sync-box">☁️ Syncing your data&hellip;</div>
    </div>
  `);

  let authMode = 'signin';

  function openAuthModal() {
    document.getElementById('authError').textContent = '';
    document.getElementById('authModalOverlay').classList.add('active');
  }

  function closeAuthModal() {
    document.getElementById('authModalOverlay').classList.remove('active');
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authError').textContent = '';
  }

  function setAuthMode(mode) {
    authMode = mode;
    document.getElementById('authModalTitle').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
    document.getElementById('authSubmitBtn').textContent = mode === 'signup' ? 'Sign Up' : 'Sign In';
    document.getElementById('authToggleModeBtn').textContent = mode === 'signup'
      ? 'Already have an account? Sign in'
      : 'Need an account? Sign up';
    document.getElementById('authError').textContent = '';
  }

  widget.addEventListener('click', () => {
    const user = firebase.auth().currentUser;
    if (user) {
      if (confirm(`Signed in as ${user.email}. Sign out?`)) firebase.auth().signOut();
    } else {
      setAuthMode('signin');
      openAuthModal();
    }
  });

  document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
  document.getElementById('authModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'authModalOverlay') closeAuthModal();
  });
  document.getElementById('authToggleModeBtn').addEventListener('click', () => {
    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
  });

  const AUTH_ERROR_MESSAGES = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'No account with that email. Try signing up instead.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists with that email. Try signing in instead.',
    'auth/weak-password': 'Password should be at least 6 characters.',
  };

  function showAuthError(err) {
    document.getElementById('authError').textContent = AUTH_ERROR_MESSAGES[err.code] || err.message || 'Something went wrong.';
  }

  document.getElementById('authSubmitBtn').addEventListener('click', () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) {
      document.getElementById('authError').textContent = 'Enter both an email and a password.';
      return;
    }

    explicitAuthAction = true;

    if (authMode === 'signup') {
      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(() => { cloudPushAll(); closeAuthModal(); })
        .catch((err) => { explicitAuthAction = false; showAuthError(err); });
    } else {
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => closeAuthModal())
        .catch((err) => { explicitAuthAction = false; showAuthError(err); });
    }
  });

  function updateWidgetUI(user) {
    document.getElementById('authWidgetStatus').textContent = user ? `☁️ ${user.email}` : 'Sign In';
  }

  // Caps how long the post-sign-in sync can block the reload - a Firestore
  // fetch over a weak connection can take much longer than expected, and
  // silently waiting on it left the user staring at an already-rendered
  // page for up to a minute before an unexplained reload. Now they see a
  // visible "Syncing" overlay the whole time, capped at 8s either way.
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
  }

  // Every tab switch is a full page load, and quietly re-pulling the whole
  // Firestore doc on all of them (network fetch + rewriting every
  // localStorage key) added lag to each navigation. Once per 5 minutes per
  // session is plenty - saveX() pushes keep the cloud current in between.
  const CLOUD_PULL_THROTTLE_MS = 5 * 60 * 1000;
  const CLOUD_PULL_STAMP_KEY = 'numerology_last_cloud_pull';

  function stampCloudPull() {
    try { sessionStorage.setItem(CLOUD_PULL_STAMP_KEY, String(Date.now())); } catch (e) { /* ignore */ }
  }

  function cloudPullIsDue() {
    try {
      return Date.now() - Number(sessionStorage.getItem(CLOUD_PULL_STAMP_KEY) || 0) > CLOUD_PULL_THROTTLE_MS;
    } catch (e) {
      return true;
    }
  }

  firebase.auth().onAuthStateChanged((user) => {
    updateWidgetUI(user);
    if (user) {
      if (explicitAuthAction) {
        explicitAuthAction = false;
        document.getElementById('authSyncOverlay').classList.add('active');
        withTimeout(cloudPullAll(), 8000).then(() => {
          stampCloudPull();
          document.getElementById('authSyncOverlay').classList.remove('active');
          if (typeof window.__refreshAfterCloudSync === 'function') {
            window.__refreshAfterCloudSync();
          } else {
            location.reload();
          }
        });
      } else if (cloudPullIsDue()) {
        stampCloudPull();
        cloudPullAll();
      }
    }
  });
})();

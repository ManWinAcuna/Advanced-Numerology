// Small floating sign-in widget + modal, injected on every page. Signing in
// is entirely optional - the app works purely on localStorage either way.
// When signed in, db-core.js's saveX() functions also push to Firestore, and
// this file pulls the cloud copy down once per app session on sign-in (or on
// launch if already signed in), so a fresh install/device/reinstalled
// home-screen icon isn't stuck starting from empty local storage.
(function () {
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

    if (authMode === 'signup') {
      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(() => { cloudPushAll(); closeAuthModal(); })
        .catch(showAuthError);
    } else {
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => closeAuthModal())
        .catch(showAuthError);
    }
  });

  function updateWidgetUI(user) {
    document.getElementById('authWidgetStatus').textContent = user ? `☁️ ${user.email}` : 'Sign In';
  }

  firebase.auth().onAuthStateChanged((user) => {
    updateWidgetUI(user);
    if (user) {
      const alreadySynced = sessionStorage.getItem('cloudSyncedUid') === user.uid;
      if (!alreadySynced) {
        cloudPullAll().then(() => {
          sessionStorage.setItem('cloudSyncedUid', user.uid);
          location.reload();
        });
      }
    } else {
      sessionStorage.removeItem('cloudSyncedUid');
    }
  });
})();

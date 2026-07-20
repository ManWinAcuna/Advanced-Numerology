// Access gate for the Sports Betting section (sports-betting.html, polymarket*,
// stats.html). Only the owner account may view these pages.
//
// HONEST SCOPE: this is a CLIENT-SIDE gate. GitHub Pages serves these files
// publicly, so it reliably keeps casual visitors out of the betting UI but is
// NOT a hardened lock - anyone technical can read the page source regardless.
// The real privacy guarantee is on the DATA: every synced record lives in
// Firestore under users/{uid} and is only ever pulled while signed in as the
// owner, and the Firestore security rules (see FIREBASE_RULES note in the repo)
// restrict that document to the owner's own account. So a blocked visitor sees
// a locked shell with none of the owner's data behind it.
(function () {
  var OWNER_EMAIL = 'horseyear2026manuel@gmail.com';

  var INP = 'width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:8px;border-radius:8px;border:1px solid #33334d;background:#14141f;color:#e8e8f0;font-size:1rem;';
  var BTN = 'width:100%;padding:12px;border-radius:8px;border:none;background:#6c5ce7;color:#fff;font-size:1rem;font-weight:600;cursor:pointer;margin-bottom:10px;';
  var LINK = 'display:inline-block;color:#9a9ab5;text-decoration:none;font-size:.9rem;';

  // Hide everything (except our own overlay + the sign-in widget) the instant
  // this runs - before the betting content below it parses - so nothing flashes
  // to a non-owner while auth state is being resolved.
  var hideStyle = document.createElement('style');
  hideStyle.textContent =
    'body > *:not(#sportsGate):not(#authWidget):not(#authWidgetPlaceholder):not(#authModalOverlay):not(#authSyncOverlay){visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(hideStyle);

  var overlay = document.createElement('div');
  overlay.id = 'sportsGate';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;background:#0a0a12;color:#e8e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
  var card = document.createElement('div');
  card.style.cssText = 'max-width:340px;width:100%;text-align:center;';
  overlay.appendChild(card);
  card.innerHTML = '<div style="opacity:.6;font-size:.95rem;">Checking access…</div>';

  function mount() {
    if (document.body) document.body.appendChild(overlay);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(overlay); });
  }
  mount();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function reveal() {
    if (hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  var signingIn = false;

  function renderSignIn(message) {
    signingIn = false;
    card.innerHTML =
      '<div style="font-size:2rem;margin-bottom:10px;">🔒</div>' +
      '<div style="font-size:1.15rem;font-weight:600;margin-bottom:8px;">This section is private</div>' +
      '<div style="opacity:.7;line-height:1.5;margin-bottom:18px;">' + (message || 'Sign in with the owner account to continue.') + '</div>' +
      '<input id="sgEmail" type="email" placeholder="Email" autocomplete="email" style="' + INP + '">' +
      '<input id="sgPass" type="password" placeholder="Password" autocomplete="current-password" style="' + INP + '">' +
      '<div id="sgErr" style="color:#ff6b6b;font-size:.85rem;min-height:1.1em;margin:2px 0 10px;text-align:left;"></div>' +
      '<button id="sgGo" style="' + BTN + '">Sign in</button>' +
      '<a href="index.html" style="' + LINK + '">Back to home</a>';
    var go = document.getElementById('sgGo');
    function submit() {
      var email = document.getElementById('sgEmail').value.trim();
      var pass = document.getElementById('sgPass').value;
      if (!email || !pass) { document.getElementById('sgErr').textContent = 'Enter your email and password.'; return; }
      go.disabled = true; go.textContent = 'Signing in…';
      signingIn = true;
      firebase.auth().signInWithEmailAndPassword(email, pass).catch(function (err) {
        signingIn = false;
        go.disabled = false; go.textContent = 'Sign in';
        var code = err && err.code;
        document.getElementById('sgErr').textContent =
          (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email')
            ? 'Incorrect email or password.'
            : ((err && err.message) || 'Something went wrong.');
      });
      // success is handled by onAuthStateChanged -> decide()
    }
    go.addEventListener('click', submit);
    document.getElementById('sgPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  function renderWrongAccount(user) {
    card.innerHTML =
      '<div style="font-size:2rem;margin-bottom:10px;">🔒</div>' +
      '<div style="font-size:1.15rem;font-weight:600;margin-bottom:8px;">This section is private</div>' +
      '<div style="opacity:.7;line-height:1.5;margin-bottom:18px;">You’re signed in as <b>' + esc(user.email) + '</b>, which isn’t the owner account.</div>' +
      '<button id="sgSwitch" style="' + BTN + '">Sign in as the owner</button>' +
      '<a href="index.html" style="' + LINK + '">Back to home</a>';
    document.getElementById('sgSwitch').addEventListener('click', function () {
      firebase.auth().signOut().then(function () { renderSignIn(); });
    });
  }

  function decide(user) {
    if (user && (user.email || '').toLowerCase() === OWNER_EMAIL) {
      if (signingIn) {
        // Fresh sign-in: pull the owner's cloud copy before revealing, so the
        // page renders their synced data rather than this browser's empty
        // local state. Reload once the pull lands (capped so a slow network
        // can't hang the gate open).
        var done = false;
        var finish = function () { if (done) return; done = true; location.reload(); };
        if (typeof cloudPullAll === 'function') {
          try { Promise.resolve(cloudPullAll()).then(finish, finish); } catch (e) { finish(); }
          setTimeout(finish, 8000);
        } else {
          finish();
        }
      } else {
        reveal();
      }
      return;
    }
    if (user) renderWrongAccount(user);
    else renderSignIn();
  }

  function begin() {
    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(decide);
    } else if (window.loadFirebaseSdk) {
      window.loadFirebaseSdk()
        .then(function () { firebase.auth().onAuthStateChanged(decide); })
        .catch(function () { card.innerHTML = '<div style="opacity:.7;">Couldn’t reach the sign-in service. Check your connection and reload.</div>'; });
    } else {
      // firebase-loader.js hasn't defined the loader yet - it runs at the end
      // of the page, so try again shortly.
      setTimeout(begin, 40);
    }
  }

  if (document.readyState !== 'loading') begin();
  else document.addEventListener('DOMContentLoaded', begin);
})();

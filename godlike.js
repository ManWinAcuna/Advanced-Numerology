/* ============================================================================
   GODLIKE — behavior engine (UI_REDESIGN_SPEC.md)
   Loads last on every page. Sets the energy-reactive accent, runs the
   once-daily ceremony, drives portal-veil transitions, builds the Daily
   Altar + portal grid on profile, tags living glyphs, and choreographs
   entrances. Silent by design. Nothing here touches data except reading it.
   ========================================================================== */
(function () {
  'use strict';

  const FILE = (location.pathname.split('/').pop() || 'profile.html').replace('.html', '') || 'profile';
  const IS_STABLE = FILE === 'stable';
  const doc = document.documentElement;

  /* ------------------------------------------------------ day energy ----- */
  // Uses the app's own reduceNumber when the page loads numerology.js;
  // otherwise this is a VERBATIM copy of numerology.js reduceNumber's table
  // (not a reinvention) so accent pages without the engine still react.
  function gkReduce(n) {
    if (typeof reduceNumber === 'function') return reduceNumber(n);
    const special = { 28: 28, 39: 3, 19: 1, 20: 11, 11: 11, 22: 22, 33: 33 };
    if (n in special) return special[n];
    const sum = String(n).split('').reduce((s, c) => s + (Number(c) || 0), 0);
    if (sum === 11 || sum === 22 || sum === 33) return sum;
    return ((sum - 1) % 9) + 1;
  }
  function dayKey(d) {
    const x = d || new Date();
    const p = (v) => String(v).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }
  // UNIVERSAL DAY is the crown (owner's hierarchy: UD > Day Energy). Pages
  // with db-core compute it directly and cache it; pages without fall back to
  // today's cached value, then to Day Energy as a last resort.
  function gkUniversal() {
    const k = 'gk_ud_' + dayKey();
    if (typeof universalDayNumber === 'function') {
      try {
        const v = universalDayNumber(new Date());
        try { localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ }
        return v;
      } catch (e) { /* fall through */ }
    }
    try { const c = localStorage.getItem(k); if (c) return parseInt(c, 10); } catch (e) { /* ignore */ }
    return gkReduce(new Date().getDate());
  }
  const UD = gkUniversal();

  // The Stable stays numerology-BLIND: pinned realm accent, no energy attr,
  // and never the ceremony (it would reveal the day's number pre-wrap).
  if (!IS_STABLE && !doc.hasAttribute('data-energy')) doc.setAttribute('data-energy', String(UD));

  /* ----------------------------------------------------------- crest ----- */
  // The crest is the REAL brand horse (logo.svg) — rendered by today.html.
  function stableStreak() {
    try {
      const days = JSON.parse(localStorage.getItem('stable_days') || '{}');
      let streak = 0;
      const d = new Date();
      const today = dayKey(d);
      if (!(days[today] && days[today].wrapped)) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 365; i++) {
        const rec = days[dayKey(d)];
        if (!rec || !rec.wrapped) break;
        streak++;
        d.setDate(d.getDate() - 1);
      }
      return streak;
    } catch (e) { return 0; }
  }

  /* ------------------------------------------------------ living glyphs -- */
  const GLYPH_SET = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 11: 1, 22: 1, 28: 1, 33: 1 };
  function tagGlyphs(root) {
    const sel = '.cell.highlight, .box-value, .dayleft-value, .pinnacle-card-value, .rg-num';
    (root || document).querySelectorAll(sel).forEach((el) => {
      const raw = (el.textContent || '').trim();
      const n = parseInt(raw, 10);
      if (String(n) === raw && GLYPH_SET[n]) {
        el.classList.add('gk-glyph', 'gk-n' + n);
      }
    });
  }

  /* --------------------------------------------- entrance choreography --- */
  function choreograph() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const page = document.querySelector('.page, .ufc-page, .astro-page');
    const targets = [];
    if (page) Array.prototype.slice.call(page.children, 0, 8).forEach((el) => targets.push(el));
    document.querySelectorAll('.profile-grid .box').forEach((el, i) => { if (i < 6) targets.push(el); });
    targets.forEach((el, i) => {
      el.classList.add('gk-in');
      el.style.animationDelay = (i * 80) + 'ms';
    });
  }

  /* ----------------------------------------------------- portal veil ----- */
  function makeVeil(cls) {
    const v = document.createElement('div');
    v.className = 'gk-veil ' + cls;
    document.body.appendChild(v);
    return v;
  }
  window.gkNavigate = function (href) {
    try { sessionStorage.setItem('gk_veil', '1'); } catch (e) { /* ignore */ }
    makeVeil('gk-out');
    setTimeout(() => { location.href = href; }, 210);
  };
  function arrive() {
    let flagged = false;
    try { flagged = sessionStorage.getItem('gk_veil') === '1'; sessionStorage.removeItem('gk_veil'); } catch (e) { /* ignore */ }
    if (!flagged) return;
    const v = makeVeil('gk-arrive');
    setTimeout(() => v.remove(), 700);
  }

  /* -------------------------------------------------- daily ceremony ----- */
  function ceremony() {
    if (IS_STABLE) return; // the blind is sacred
    let last = null;
    try { last = localStorage.getItem('gk_last_ceremony'); } catch (e) { /* ignore */ }
    const today = dayKey();
    if (last === today) return;
    try { localStorage.setItem('gk_last_ceremony', today); } catch (e) { /* ignore */ }
    const c = document.createElement('div');
    c.className = 'gk-ceremony';
    c.innerHTML =
      '<div class="gk-cer-ring"></div>' +
      '<div class="gk-cer-num gk-glyph gk-n' + UD + '">' + UD + '</div>' +
      '<div class="gk-cer-line">Universal Day</div>';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2900);
  }

  // The Daily Altar now lives on its own page (today.html) — profile is a
  // pure realm again. The streak reader is exported for the today page.
  window.gkStableStreak = stableStreak;

  /* --------------------------------------------------------------- boot -- */
  function boot() {
    arrive();
    ceremony();
    tagGlyphs();
    choreograph();
    setTimeout(() => tagGlyphs(), 800); // async-rendered numbers
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

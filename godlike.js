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
  const DE = gkReduce(new Date().getDate());

  // The Stable stays numerology-BLIND: pinned realm accent, no energy attr,
  // and never the ceremony (it would reveal the day's number pre-wrap).
  if (!IS_STABLE) doc.setAttribute('data-energy', String(DE));

  /* ----------------------------------------------------------- crest ----- */
  // Engraved-line horse crest (brand seal). Streak states light it up.
  const CREST_SVG =
    '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="32" cy="32" r="30" stroke="#f5c542" stroke-opacity=".5" stroke-width="1"/>' +
    '<circle cx="32" cy="32" r="26" stroke="#f5c542" stroke-opacity=".22" stroke-width=".6" stroke-dasharray="2 3"/>' +
    '<path d="M22 46c1-7 2-12 6-17 3-4 7-6 9-10 1-2 1-4 3-5 1 2 2 3 4 4 2 0 3 1 4 3l-3 2c-1 2-2 3-4 3-1 3-1 6-2 9-2 6-5 9-9 11" stroke="#f5c542" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M37 14c-3 3-4 6-7 9m8-6c-2 3-4 5-6 8m-5 12c-2 3-3 5-3 9" stroke="#f5c542" stroke-opacity=".55" stroke-width=".9" stroke-linecap="round"/>' +
    '<circle cx="38.5" cy="18.5" r="1" fill="#f5c542"/>' +
    '</svg>';

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
      '<div class="gk-cer-num gk-glyph gk-n' + DE + '">' + DE + '</div>' +
      '<div class="gk-cer-line">Energy of the day</div>';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2900);
  }

  /* ------------------------------------------- the daily altar (profile) - */
  function buildAltar() {
    if (FILE !== 'profile') return;
    const page = document.querySelector('.page');
    if (!page || document.querySelector('.gk-altar')) return;

    const read = (id) => {
      const el = document.getElementById(id);
      const t = el ? (el.textContent || '').trim() : '';
      return t && t !== '-' ? t : null;
    };
    const ud = (typeof universalDayNumber === 'function') ? universalDayNumber(new Date()) : null;

    const altar = document.createElement('section');
    altar.className = 'gk-altar';
    altar.innerHTML =
      '<div class="gk-altar-ring"></div>' +
      '<div class="gk-altar-label">' + new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '</div>' +
      '<div class="gk-altar-num gk-glyph gk-n' + DE + '">' + DE + '</div>' +
      '<div class="gk-altar-sub">Energy of the day' + (ud ? ' · Universal ' + ud : '') + '</div>' +
      '<div class="gk-orbits" id="gkOrbits"></div>' +
      '<div class="gk-brief" id="gkBrief"></div>' +
      '<div class="gk-crest" id="gkCrest">' + CREST_SVG + '<div class="gk-crest-streak" id="gkCrestStreak"></div></div>';
    page.insertBefore(altar, page.firstChild);

    // Portal doorways into the realms (the rest of profile flows beneath).
    const portals = document.createElement('nav');
    portals.className = 'gk-portals';
    const DOORS = [
      { href: 'stable.html', ico: '🐎', name: 'The Stable', sub: 'flow · discipline · review' },
      { href: 'sports-betting.html', ico: '📈', name: 'Markets', sub: 'betting · stocks' },
      { href: 'calendar.html', ico: '📅', name: 'Days', sub: 'calendar · astrology' },
      { href: 'calculator.html', ico: '🧮', name: 'Tools', sub: 'numbers · lookups' },
    ];
    portals.innerHTML = DOORS.map((d) =>
      '<a class="gk-portal" href="' + d.href + '"><span class="gk-p-ico">' + d.ico + '</span>' +
      '<span class="gk-p-name">' + d.name + '</span><div class="gk-p-sub">' + d.sub + '</div></a>').join('');
    portals.addEventListener('click', (e) => {
      const a = e.target.closest('a.gk-portal');
      if (!a) return;
      e.preventDefault();
      window.gkNavigate(a.getAttribute('href'));
    });
    altar.insertAdjacentElement('afterend', portals);

    // Orbits + brief fill from the app's own computed values (render.js runs
    // first; retry once for async fills).
    function fill() {
      const compat = read('compatTodayScore');
      const energy = read('energyFlowScore');
      const bestHour = read('bestHourTime');
      const orbits = document.getElementById('gkOrbits');
      const brief = document.getElementById('gkBrief');
      if (!orbits || !brief) return;
      orbits.innerHTML =
        (compat ? '<span class="gk-orbit">Aligned <b>' + compat + '</b></span>' : '') +
        (energy ? '<span class="gk-orbit">Flow <b>' + energy + '</b></span>' : '') +
        (ud ? '<span class="gk-orbit">Universal <b>' + ud + '</b></span>' : '');
      const bits = [];
      bits.push('An <b>energy ' + DE + '</b> day');
      if (compat) bits.push('you are <b>' + compat + ' aligned</b>');
      if (bestHour) bits.push('best hour <b>' + bestHour + '</b>');
      brief.innerHTML = bits.join(' · ') + '.';
    }
    fill();
    setTimeout(fill, 700);

    const streak = stableStreak();
    const crest = document.getElementById('gkCrest');
    const label = document.getElementById('gkCrestStreak');
    if (label) label.textContent = streak > 0 ? 'Streak ' + streak : 'The horse rests';
    if (crest && streak >= 4) crest.classList.add('gk-blazing');
    else if (crest && streak >= 1) crest.classList.add('gk-lit');
  }

  /* --------------------------------------------------------------- boot -- */
  function boot() {
    arrive();
    ceremony();
    buildAltar();
    tagGlyphs();
    choreograph();
    setTimeout(() => tagGlyphs(), 800); // async-rendered numbers
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

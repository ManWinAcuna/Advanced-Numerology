/* Discrepancy Scout (Boost13 2026-08-14, 16 answers) - scans EVERY open
   two-sided Polymarket market resolving within the next 7 days and ranks
   the board by implied-probability gap, biggest first (+5000 vs -3000
   style), no cutoff. Each side gets a vs-today alignment score (standard
   computeCompatibility blend, same as the Versus page) wherever a real
   birthdate can be resolved via the existing Wikidata cascade
   (lookupKeyDateByName, db-core.js); unknown sides show a dash and the
   row still ranks. Tapping a fully-resolved row opens versus.html with
   both sides prefilled.

   Lives as its own picker card on betting.html (data-scout - deliberately
   NOT data-sport, so betting.js's generic sport switch never sees it).
   Owner-gated by the page's sports-gate.js like everything else here. */

(function () {
  const SCOUT_LIMIT_SHOWN = 15;
  const SCOUT_FETCH_LIMIT = 400;
  const SCOUT_WINDOW_DAYS = 7;
  const SCOUT_BDAY_CACHE_KEY = 'numerology_scout_bday_cache';

  const scoutSection = document.getElementById('bettingScoutSection');
  if (!scoutSection) return;

  /* ---------------- birthdate cache (positive AND negative hits) -------- */
  function loadBdayCache() {
    try { return JSON.parse(localStorage.getItem(SCOUT_BDAY_CACHE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveBdayCache(cache) {
    try { localStorage.setItem(SCOUT_BDAY_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  // Resolves a name to a full YYYY-MM-DD birthdate or null. Year-only /
  // partial Wikidata dates are treated as unknown - a fabricated day would
  // poison the score (no-placeholder-dates doctrine).
  async function birthdateFor(name, cache) {
    if (Object.prototype.hasOwnProperty.call(cache, name)) return cache[name];
    let date = null;
    try {
      const hit = await lookupKeyDateByName(name);
      if (hit && hit.date && /^\d{4}-\d{2}-\d{2}$/.test(hit.date)) date = hit.date;
    } catch (e) {}
    cache[name] = date;
    saveBdayCache(cache);
    return date;
  }

  /* ---------------- odds helpers ---------------- */
  function americanOdds(p) {
    if (!(p > 0 && p < 1)) return '-';
    return p >= 0.5
      ? '-' + Math.round((p / (1 - p)) * 100)
      : '+' + Math.round(((1 - p) / p) * 100);
  }

  function vsTodayScore(isoDate) {
    try {
      const [y, m, d] = isoDate.split('-').map(Number);
      const birth = new Date();
      birth.setFullYear(y, m - 1, d);
      birth.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return computeCompatibility(birth, today).finalScore;
    } catch (e) { return null; }
  }

  /* ---------------- market fetch + ranking ---------------- */
  async function fetchScoutBoard() {
    const now = new Date();
    const max = new Date(now.getTime() + SCOUT_WINDOW_DAYS * 86400000);
    const url = 'https://gamma-api.polymarket.com/markets?closed=false&active=true'
      + '&end_date_min=' + encodeURIComponent(now.toISOString())
      + '&end_date_max=' + encodeURIComponent(max.toISOString())
      + '&limit=' + SCOUT_FETCH_LIMIT + '&order=volumeNum&ascending=false';
    const res = await fetch(url);
    if (!res.ok) throw new Error('gamma ' + res.status);
    const markets = await res.json();

    const rows = [];
    (Array.isArray(markets) ? markets : []).forEach((m) => {
      let outcomes, prices;
      try {
        outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes;
        prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      } catch (e) { return; }
      if (!Array.isArray(outcomes) || outcomes.length !== 2) return;
      // Proposition markets aren't 1v1s - two NAMED sides only. Yes/No,
      // Up/Down, Over/Under all describe ONE thing's outcome, not a duel.
      const names = outcomes.map((o) => String(o).trim());
      if (names.some((n) => /^(yes|no|up|down|over|under)$/i.test(n))) return;
      const pA = Number(prices && prices[0]);
      const pB = Number(prices && prices[1]);
      // Near-resolved prices carry no real market anymore.
      if (!(pA > 0.01 && pA < 0.99 && pB > 0.01 && pB < 0.99)) return;
      rows.push({
        question: m.question || m.title || names.join(' vs '),
        endDate: m.endDate || m.end_date_iso || null,
        nameA: names[0], nameB: names[1],
        pA, pB, gap: Math.abs(pA - pB),
      });
    });

    rows.sort((a, b) => b.gap - a.gap);
    return rows.slice(0, SCOUT_LIMIT_SHOWN);
  }

  /* ---------------- render ---------------- */
  function tierOfScore(s) {
    return s == null ? '' : s >= 77 ? 'good' : s < 49 ? 'bad' : 'mid';
  }
  function sideHtml(name, p, iso, score) {
    const chip = score == null
      ? '<span class="scout-vs none">-</span>'
      : `<span class="scout-vs ${tierOfScore(score)}">${score}%</span>`;
    return `
      <div class="scout-side">
        <div class="scout-name">${escapeHtml(name)}</div>
        <div class="scout-odds ${p >= 0.5 ? 'fav' : 'dog'}">${americanOdds(p)}</div>
        ${chip}
      </div>`;
  }

  async function renderScout() {
    const listEl = document.getElementById('scoutList');
    const statusEl = document.getElementById('scoutStatus');
    statusEl.textContent = 'Scanning the board…';
    listEl.innerHTML = '';
    let rows;
    try {
      rows = await fetchScoutBoard();
    } catch (e) {
      statusEl.textContent = 'Polymarket did not answer. Try refresh.';
      return;
    }
    if (!rows.length) {
      statusEl.textContent = 'No open two-sided markets inside the next 7 days.';
      return;
    }
    statusEl.textContent = `Top ${rows.length} widest markets closing within 7 days · biggest gap first`;

    // First paint: odds immediately, score chips as dashes.
    listEl.innerHTML = rows.map((r, i) => `
      <div class="scout-row" data-row="${i}">
        <div class="scout-rank">#${i + 1}</div>
        <div class="scout-body">
          <div class="scout-q">${escapeHtml(r.question)}</div>
          <div class="scout-sides">
            ${sideHtml(r.nameA, r.pA, null, null)}
            <div class="scout-gapchip">${Math.round(r.gap * 100)}%<span>gap</span></div>
            ${sideHtml(r.nameB, r.pB, null, null)}
          </div>
          <div class="scout-meta">${r.endDate ? 'closes ' + new Date(r.endDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</div>
        </div>
      </div>`).join('');

    // Resolve birthdates row by row (cache-first) and upgrade chips in place.
    const cache = loadBdayCache();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const [dA, dB] = await Promise.all([birthdateFor(r.nameA, cache), birthdateFor(r.nameB, cache)]);
      r.dateA = dA; r.dateB = dB;
      const rowEl = listEl.querySelector(`[data-row="${i}"]`);
      if (!rowEl) continue;
      const sides = rowEl.querySelector('.scout-sides');
      sides.innerHTML =
        sideHtml(r.nameA, r.pA, dA, dA ? vsTodayScore(dA) : null) +
        `<div class="scout-gapchip">${Math.round(r.gap * 100)}%<span>gap</span></div>` +
        sideHtml(r.nameB, r.pB, dB, dB ? vsTodayScore(dB) : null);
      if (dA && dB) {
        rowEl.classList.add('scout-openable');
        rowEl.addEventListener('click', () => {
          location.href = 'versus.html?a=' + dA + '&an=' + encodeURIComponent(r.nameA)
            + '&b=' + dB + '&bn=' + encodeURIComponent(r.nameB);
        });
      }
    }
  }

  /* ---------------- wiring ---------------- */
  document.getElementById('bettingSportPicker').addEventListener('click', (e) => {
    const card = e.target.closest('.mode-card[data-scout]');
    if (!card) return;
    e.preventDefault();
    document.getElementById('bettingSportPicker').style.display = 'none';
    scoutSection.style.display = '';
    renderScout();
  });
  document.getElementById('scoutBackLink').addEventListener('click', (e) => {
    e.preventDefault();
    scoutSection.style.display = 'none';
    document.getElementById('bettingSportPicker').style.display = '';
  });
  document.getElementById('scoutRefreshBtn').addEventListener('click', renderScout);
})();

// Master Dashboard (2026-08-02, CODE13 backlog 5/8) - headline summary
// cards for Stocks/Betting/EMAX, each reusing whatever that domain already
// computed and cached on its own page. Per the clarifying round for this
// feature: standalone page, headline cards only (tap through for detail),
// owner-only, and reads whatever's already cached rather than recomputing
// anything live - so nothing here ever fetches a price, grades a bet, or
// scrapes a Wikipedia page. Deliberately does NOT load stocks.js or
// betting-core.js (and their own heavy dependency chains - price history,
// UFC/tennis/MLB/NBA data, stats-*.js) just to read one already-persisted
// store each; the tiny read/aggregate logic for each is re-derived here
// instead, matching a "no blanket eager-load" project convention already
// established for shared scripts.

/* ---- EMAX: reuses the exact same result shape/keys emax.js itself saves (db-core.js) ---- */
function dashboardLoadEmaxAudit() {
  try {
    const raw = localStorage.getItem(EMAX_AUDIT_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function dashboardLoadEmaxNomination() {
  try {
    const raw = localStorage.getItem(EMAX_NOMINATION_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function dashboardEmaxCardHtml() {
  const audit = dashboardLoadEmaxAudit();
  const nomination = dashboardLoadEmaxNomination();
  const auditLine = audit
    ? `7/11 Audit: ${Math.round((audit.py7or11NegativeRate || 0) * 100)}% negative vs ${Math.round((audit.otherNegativeRate || 0) * 100)}% baseline <span class="dashboard-card-meta">(${audit.entryCount} items, ${new Date(audit.ranAt).toLocaleDateString()})</span>`
    : `7/11 Audit: <span class="dashboard-card-meta">not run yet</span>`;
  const candidateCount = nomination
    ? Object.keys(nomination.dimensions || {}).reduce((n, dim) => n + nomination.dimensions[dim].bearish.length + nomination.dimensions[dim].bullish.length, 0)
    : 0;
  const nominationLine = nomination
    ? `Number Nomination: ${candidateCount} candidate${candidateCount === 1 ? '' : 's'} found <span class="dashboard-card-meta">(${new Date(nomination.ranAt).toLocaleDateString()})</span>`
    : `Number Nomination: <span class="dashboard-card-meta">not run yet</span>`;
  return `
    <div class="dashboard-card-row">${auditLine}</div>
    <div class="dashboard-card-row">${nominationLine}</div>`;
}

/* ---- Stocks: re-tallies the persisted Combined Track Record ledger (stocks.js) ---- */
const DASHBOARD_STOCKS_STORE_KEY = 'numerology_stock_combined_record_v7';

function dashboardLoadStocksStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(DASHBOARD_STOCKS_STORE_KEY));
    if (raw && Array.isArray(raw.monthEntries) && Array.isArray(raw.yearEntries)) return raw;
  } catch (e) { /* corrupt or missing - shows the empty state below */ }
  return null;
}

// Same right/wrong/mixed tally stocks.js's own stocksAggregateEntries does
// for the Reversal exit mode (its own default) - re-derived here rather
// than loading stocks.js itself, which fetches live price history and
// expects stocks.html's own DOM to exist.
function dashboardStocksWinRate(entries) {
  let right = 0;
  let wrong = 0;
  let mixed = 0;
  entries.forEach((e) => {
    ['calendar', 'calPrice'].forEach((mode) => {
      const sub = e[mode] && e[mode].reversal;
      if (!sub) return;
      if (sub.grade === 'right') right++;
      else if (sub.grade === 'wrong') wrong++;
      else if (sub.grade === 'mixed') mixed++;
    });
  });
  const settled = right + wrong + mixed;
  return { right, wrong, mixed, settled, rate: settled ? right / settled : null };
}

function dashboardStocksLine(label, s) {
  if (s.rate == null) return `${label}: <span class="dashboard-card-meta">not enough graded trades yet</span>`;
  return `${label}: ${Math.round(s.rate * 100)}% <span class="dashboard-card-meta">(${s.right}/${s.wrong}/${s.mixed} of ${s.settled})</span>`;
}

function dashboardStocksCardHtml() {
  const store = dashboardLoadStocksStore();
  if (!store) return `<div class="dashboard-card-row"><span class="dashboard-card-meta">No track record yet - visit Stocks to build one.</span></div>`;
  return `
    <div class="dashboard-card-row">${dashboardStocksLine('Month win rate', dashboardStocksWinRate(store.monthEntries))}</div>
    <div class="dashboard-card-row">${dashboardStocksLine('Year win rate', dashboardStocksWinRate(store.yearEntries))}</div>`;
}

/* ---- Betting: reads the persisted locked-bet log (betting-core.js) ---- */
const DASHBOARD_BETTING_LOCKED_SLATES_KEY = 'numerology_betting_locked_slates';

// Mirrors betting-core.js's own loadBettingLockedSlates() exactly - not
// calling it directly avoids loading the whole betting stack (ufc/tennis/
// mlb/nba data + stats-*.js, several MB) just to read one already-persisted
// list. bigStoreGetItem itself comes from big-store.js, which this page
// already loads.
function dashboardLoadBettingSlates() {
  try {
    const v = JSON.parse(bigStoreGetItem(DASHBOARD_BETTING_LOCKED_SLATES_KEY));
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

function dashboardBettingCardHtml() {
  const slates = dashboardLoadBettingSlates();
  if (!slates.length) return `<div class="dashboard-card-row"><span class="dashboard-card-meta">No bets locked yet - visit Sports Betting to lock your first slate.</span></div>`;
  let ticketCount = 0;
  let totalStake = 0;
  let lastLockedAt = null;
  slates.forEach((s) => {
    (s.tickets || []).forEach((t) => { ticketCount++; totalStake += t.stake || 0; });
    if (!lastLockedAt || s.lockedAt > lastLockedAt) lastLockedAt = s.lockedAt;
  });
  return `
    <div class="dashboard-card-row">${ticketCount} locked bet${ticketCount === 1 ? '' : 's'} <span class="dashboard-card-meta">($${totalStake.toFixed(2)} total staked)</span></div>
    <div class="dashboard-card-row">Last locked <span class="dashboard-card-meta">${new Date(lastLockedAt).toLocaleDateString()}</span></div>`;
}

function dashboardRender() {
  document.getElementById('dashboardStocksBody').innerHTML = dashboardStocksCardHtml();
  document.getElementById('dashboardBettingBody').innerHTML = dashboardBettingCardHtml();
  document.getElementById('dashboardEmaxBody').innerHTML = dashboardEmaxCardHtml();
}

(async () => {
  // Betting's card needs the big store hydrated first; Stocks/EMAX read
  // plain localStorage and are ready immediately either way.
  if (typeof bigStoreReadyPromise !== 'undefined') await bigStoreReadyPromise;
  dashboardRender();
})();

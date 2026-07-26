/* ===================== NBA Stats tracker ===================== */
// Mirrors stats-mlb.js: the same Today/Old Data scopes, the same breakdown
// boxes, the same edge tiers and price buckets, the same paginated table, and
// a historical backfill. Every generic renderer (day-number tables, dimension
// edge, pagination, breakdown toggle) is the shared one in db-core.js, so this
// file only holds what is genuinely NBA-specific.
//
// Scope suffix convention, and the one that bit us before: ids are built as
// base + part + SUFFIX, with the suffix always landing LAST. Every lookup goes
// through an id() helper so a scoped id can never be assembled as
// base + suffix + part - which silently rendered nothing on the Old scope
// while Today worked, because Today's suffix is empty.

const nbaStoreReady = bigStoreReadyPromise;

// Rendered-from state, kept so a day-filter change can re-render without
// refetching anything.
let currentNbaPredictions = [];
let currentNbaTotals = [];
let currentNbaPropSignals = [];
// Today's games fetched but not scoreable yet (no rotation form) - listed as
// pending rows so the Today tab reflects the whole slate.
let todaysNbaSlatePending = [];

/* ---------- Result checking ---------- */
// A pending pick resolves off ESPN's own final score. Polymarket's closed
// markets are never used for this: a resolved event reports the same flat 1/0
// on every market it contains, which would mark every pick the same way.
async function checkNbaResults() {
  const predictions = loadNbaPredictions();
  const pending = predictions.filter((p) => !p.result && p.gameTime);
  if (!pending.length) return 0;

  // One scoreboard call per distinct date covers every pending game that day.
  const dates = [...new Set(pending.map((p) => nbaEasternDateISO(new Date(p.gameTime))).filter(Boolean))];
  let resolved = 0;

  for (const date of dates) {
    const games = await fetchNbaScoreboard(date);
    if (!games.length) continue;
    pending.forEach((p) => {
      if (p.result) return;
      if (nbaEasternDateISO(new Date(p.gameTime)) !== date) return;
      const game = games.find((g) => String(g.eventId) === String(p.eventId));
      if (!game || !game.final) return;
      if (!Number.isFinite(game.home.score) || !Number.isFinite(game.away.score)) return;
      // The stored names are Polymarket's outcome labels (team nicknames);
      // match them against ESPN's nickname for each side.
      const homeIsA = normalizeName(game.home.nickname) === normalizeName(p.teamAName);
      const scoreA = homeIsA ? game.home.score : game.away.score;
      const scoreB = homeIsA ? game.away.score : game.home.score;
      p.result = scoreA === scoreB
        ? { winner: null, draw: true, resolvedAt: Date.now() }
        : { winner: scoreA > scoreB ? p.teamAName : p.teamBName, draw: false, resolvedAt: Date.now() };
      resolved += 1;
    });
  }

  if (resolved) saveNbaPredictions(predictions);
  return resolved;
}

async function checkNbaTotalsResults() {
  const records = loadNbaTotalsPredictions();
  const pending = records.filter((p) => !p.result && p.gameTime);
  if (!pending.length) return 0;

  const dates = [...new Set(pending.map((p) => nbaEasternDateISO(new Date(p.gameTime))).filter(Boolean))];
  let resolved = 0;

  for (const date of dates) {
    const games = await fetchNbaScoreboard(date);
    if (!games.length) continue;
    pending.forEach((p) => {
      if (p.result) return;
      const game = games.find((g) => String(g.eventId) === String(p.eventId));
      if (!game || !game.final) return;
      const result = nbaTotalsResultFromScores(game.home.score, game.away.score, p.teamAName, p.teamBName, p.line);
      if (!result) return;
      p.result = result;
      resolved += 1;
    });
  }

  if (resolved) saveNbaTotalsPredictions(records);
  return resolved;
}

/* ---------- Headline stats ---------- */
function computeNbaStats(predictions) {
  const resolvedAll = predictions.filter((p) => p.result && !p.result.draw);
  const resolved = resolvedAll.filter(hasRealEdgeNba);
  const wins = resolved.filter(isCorrectPick);
  const favoritePicks = resolved.filter((p) => p.pickType === 'favorite');
  const underdogPicks = resolved.filter((p) => p.pickType === 'underdog');
  const favoriteWins = favoritePicks.filter(isCorrectPick);
  const underdogWins = underdogPicks.filter(isCorrectPick);

  return {
    total: predictions.length,
    resolvedCount: resolved.length,
    tossupResolvedCount: resolvedAll.length - resolved.length,
    pendingCount: predictions.filter((p) => !p.result).length,
    drawCount: predictions.filter((p) => p.result && p.result.draw).length,
    winsCount: wins.length,
    overallWinPct: resolved.length ? Math.round((wins.length / resolved.length) * 100) : null,
    favoriteCount: favoritePicks.length,
    favoriteWinsCount: favoriteWins.length,
    favoriteWinPct: favoritePicks.length ? Math.round((favoriteWins.length / favoritePicks.length) * 100) : null,
    underdogCount: underdogPicks.length,
    underdogWinsCount: underdogWins.length,
    underdogWinPct: underdogPicks.length ? Math.round((underdogWins.length / underdogPicks.length) * 100) : null,
  };
}

function renderNbaHero(stats, suffix = '') {
  const hero = document.getElementById('nbaStatsHero' + suffix);
  if (!hero) return;

  if (stats.total === 0) {
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">No games tracked yet &mdash; run Backfill on the Old Data tab to build a track record from the last two seasons.</div>
    `;
    return;
  }

  if (stats.resolvedCount === 0) {
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">${stats.tossupResolvedCount
        ? `Only tossups (no real edge) have resolved so far (${stats.tossupResolvedCount}) &mdash; see the edge-strength table below.`
        : `${stats.total} game${stats.total === 1 ? '' : 's'} tracked, none resolved yet. Check back after they finish.`}</div>
    `;
    return;
  }

  const extras = [];
  if (stats.tossupResolvedCount) extras.push(`${stats.tossupResolvedCount} tossup${stats.tossupResolvedCount === 1 ? '' : 's'} excluded`);
  if (stats.pendingCount) extras.push(`${stats.pendingCount} pending`);
  if (stats.drawCount) extras.push(`${stats.drawCount} tie`);

  hero.innerHTML = `
    <div class="score-names">Numerology Win Rate</div>
    <div class="score-big ${winRateClass(stats.overallWinPct)}">${stats.overallWinPct}<span class="score-out-of">%</span></div>
    <div class="pm-breakdown-hint">${stats.winsCount} of ${stats.resolvedCount} resolved real-edge picks correct${extras.length ? ` &middot; ${extras.join(' &middot; ')}` : ''}</div>
  `;
}

function nbaMeterRow(label, pct, count, wins) {
  const known = pct != null;
  return `
    <div class="breakdown-header"><span>${label}</span><span>${known ? `${pct}% (${wins}/${count})` : 'No data yet'}</span></div>
    <div class="meter"><div class="meter-fill" style="width:${known ? pct : 0}%"></div></div>
  `;
}

function renderNbaBreakdown(stats, suffix = '') {
  const el = document.getElementById('nbaStatsBreakdown' + suffix);
  if (!el) return;
  el.innerHTML = `
    ${nbaMeterRow('✅ When numerology agreed with the favorite', stats.favoriteWinPct, stats.favoriteCount, stats.favoriteWinsCount)}
    ${nbaMeterRow('⚡ When numerology picked the underdog', stats.underdogWinPct, stats.underdogCount, stats.underdogWinsCount)}
  `;
}

function renderNbaEdgeTiers(predictions, suffix = '') {
  const el = document.getElementById('nbaStatsEdgeTiers' + suffix);
  if (!el) return;
  const tiers = computeEdgeTierStatsNba(predictions);
  const total = tiers.reduce((s, t) => s + t.count, 0);
  el.innerHTML = pmTableTotalRow(total, 3) + tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function renderNbaPriceBuckets(predictions, suffix = '') {
  const el = document.getElementById('nbaStatsPriceBuckets' + suffix);
  if (!el) return;
  const buckets = computeBucketStats(predictions, NBA_REAL_EDGE_MIN_GAP);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  el.innerHTML = pmTableTotalRow(total, 3) + buckets.map((b) => `
    <tr>
      <td>${b.label}</td>
      <td>${b.count}</td>
      <td>${b.winPct != null && b.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(b.winPct)}">${b.winPct}%</span>`
        : `<span class="empty-state">${b.count ? `${b.wins}/${b.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

/* ---------- Tracked games table ---------- */
function nbaResultBadge(p) {
  if (!p.result) return '<span class="pm-countdown-badge">⏳ Pending</span>';
  if (p.result.draw) return '<span class="coming-soon-tag">🤝 Tie</span>';
  return isCorrectPick(p) ? '<span class="score-inline good">✅ Won</span>' : '<span class="score-inline bad">❌ Lost</span>';
}

function formatNbaGameDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function nbaEdgeCell(p) {
  const gap = edgeGap(p);
  const tier = edgeTierForGapNba(gap);
  if (tier.key === 'none') return `<span class="empty-state">⚖️ Tossup (+${gap})</span>`;
  return `${tier.icon} ${tier.label.replace(' Edge', '')} (+${gap})`;
}

function nbaPendingRowHtml(g) {
  const label = {
    rotation: '⏳ Not enough rotation form yet',
    pending: '⏳ Awaiting data',
  }[g.status] || '⏳ Pending';
  return `
    <tr>
      <td>${formatNbaGameDate(g.gameStartTime.toISOString())}</td>
      <td>${escapeHtml(g.teamAName)} vs ${escapeHtml(g.teamBName)}</td>
      <td class="empty-state" colspan="4">${label}</td>
    </tr>
  `;
}

function renderNbaTable(predictions, suffix = '', pendingGames = []) {
  const tbody = document.getElementById('nbaStatsTableBody' + suffix);
  if (!tbody) return;
  const pendingHtml = pendingGames.map(nbaPendingRowHtml).join('');
  if (!predictions.length && !pendingHtml) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No games tracked yet.</td></tr>';
    renderPaginationControls('nbaStatsTablePagination' + suffix, 'nbaStatsTable' + suffix, 1, 1);
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.gameTime) - new Date(a.gameTime));
  const { rows, page, totalPages } = paginationSlice('nbaStatsTable' + suffix, sorted);
  tbody.innerHTML = pendingHtml + rows.map((p) => `
    <tr data-condition-id="${p.conditionId}">
      <td>${formatNbaGameDate(p.gameTime)}</td>
      <td>${escapeHtml(p.teamAName)} vs ${escapeHtml(p.teamBName)}</td>
      <td>${escapeHtml(p.numerologyFavorite)}</td>
      <td>${nbaEdgeCell(p)}</td>
      <td>${p.pickType === 'favorite' ? 'Favorite' : 'Underdog'}</td>
      <td>${nbaResultBadge(p)}</td>
    </tr>
  `).join('');
  renderPaginationControls('nbaStatsTablePagination' + suffix, 'nbaStatsTable' + suffix, page, totalPages, () => renderNbaTable(predictions, suffix, pendingGames));
}

/* ---------- Matchup detail modal ---------- */
function nbaMatchupModalHtml(p) {
  const odds = (price) => (price != null ? `${Math.round(price * 100)}%` : '—');
  const comp = (side) => {
    const c = p.components && p.components[side];
    if (!c) return '<div class="empty-state">No component data stored for this pick.</div>';
    return NBA_COMPONENT_KEYS.map((k) => `
      <div class="breakdown-header"><span>${NBA_COMPONENT_LABELS[k]}</span><span>${c[k] != null ? c[k] : '—'}</span></div>
    `).join('');
  };
  return `
    <div class="score-names">${escapeHtml(p.teamAName)} vs ${escapeHtml(p.teamBName)}</div>
    <div class="pm-breakdown-hint">${formatNbaGameDate(p.gameTime)} &middot; numerology picked <b>${escapeHtml(p.numerologyFavorite)}</b> (${p.pickType === 'favorite' ? 'market favorite' : 'underdog'})</div>
    <div class="box">
      <div class="box-label">Scores at pick time</div>
      <div class="breakdown-header"><span>${escapeHtml(p.teamAName)}</span><span>${p.numerologyScoreA} &middot; market ${odds(p.marketPriceA)}</span></div>
      <div class="breakdown-header"><span>${escapeHtml(p.teamBName)}</span><span>${p.numerologyScoreB} &middot; market ${odds(p.marketPriceB)}</span></div>
      <div class="mode-desc">${nbaEdgeCell(p)} &middot; ${nbaResultBadge(p)}</div>
    </div>
    <div class="box">
      <div class="box-label">${escapeHtml(p.teamAName)} components</div>
      ${comp('A')}
    </div>
    <div class="box">
      <div class="box-label">${escapeHtml(p.teamBName)} components</div>
      ${comp('B')}
    </div>
  `;
}

function initNbaMatchupModal(suffix = '') {
  const overlay = document.getElementById('nbaStatsMatchupOverlay' + suffix);
  const closeBtn = document.getElementById('nbaStatsMatchupClose' + suffix);
  const body = document.getElementById('nbaStatsMatchupBody' + suffix);
  const table = document.getElementById('nbaStatsTable' + suffix);
  if (!overlay || !closeBtn || !body || !table) return;

  table.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-condition-id]');
    if (!row) return;
    const p = currentNbaPredictions.find((x) => String(x.conditionId) === row.dataset.conditionId);
    if (!p) return;
    body.innerHTML = nbaMatchupModalHtml(p);
    overlay.classList.add('active');
  });
  closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
}

/* ---------- Which component predicts best ---------- */
// Same beat-the-market test the MLB table runs: each component picks the side
// it scores higher, and that side's actual win rate is compared with what the
// market implied for it. A positive edge means the component beats the market
// on its own.
function computeNbaComponentSignalStats(predictions) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw && p.components && p.components.A && p.components.B);
  const priceOf = (p, name) => (normalizeName(p.teamAName) === normalizeName(name) ? p.marketPriceA : p.marketPriceB);

  const statFor = (scoreAOf, scoreBOf) => {
    const picks = resolved
      .map((p) => {
        const a = scoreAOf(p);
        const b = scoreBOf(p);
        if (a == null || b == null || a === b) return null; // no lean on this axis
        const favName = a > b ? p.teamAName : p.teamBName;
        const implied = priceOf(p, favName);
        if (implied == null) return null;
        return { won: normalizeName(p.result.winner) === normalizeName(favName), implied };
      })
      .filter(Boolean);
    const n = picks.length;
    const wins = picks.filter((x) => x.won).length;
    const winPct = n ? Math.round((wins / n) * 100) : null;
    const marketPct = n ? Math.round((picks.reduce((s, x) => s + x.implied, 0) / n) * 100) : null;
    return { count: n, wins, winPct, marketPct, edge: (winPct != null && marketPct != null) ? winPct - marketPct : null };
  };

  const rows = NBA_COMPONENT_KEYS.map((key) => ({
    key,
    label: NBA_COMPONENT_LABELS[key],
    ...statFor((p) => p.components.A[key], (p) => p.components.B[key]),
  }));
  rows.push({
    key: 'composite',
    label: '🎯 Full Composite (minutes-weighted)',
    ...statFor((p) => p.numerologyScoreA, (p) => p.numerologyScoreB),
  });
  rows.sort((a, b) => (b.edge == null ? -Infinity : b.edge) - (a.edge == null ? -Infinity : a.edge));
  return rows;
}

function renderNbaComponentSignal(predictions, suffix = '') {
  const el = document.getElementById('nbaComponentSignal' + suffix);
  if (!el) return;
  const rows = computeNbaComponentSignalStats(predictions);
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (!maxCount) {
    el.innerHTML = '<div class="empty-state">No resolved games with component data yet &mdash; run the backfill (or wait for tracked games to finish) to populate this.</div>';
    return;
  }
  const total = (rows.find((r) => r.key === 'composite') || {}).count || maxCount;
  const body = rows.map((r) => {
    const isModel = r.key === 'composite';
    const edgeCell = (r.edge != null && r.count >= MIN_BUCKET_SAMPLE)
      ? `<span class="score-inline ${r.edge > 0 ? 'good' : (r.edge < 0 ? 'bad' : '')}">${r.edge > 0 ? '+' : ''}${r.edge}</span>`
      : `<span class="empty-state">${r.count ? 'thin' : '—'}</span>`;
    return `
      <tr${isModel ? ' style="border-top:2px solid var(--border);"' : ''}>
        <td>${escapeHtml(r.label)}</td>
        <td>${r.count}</td>
        <td>${r.winPct != null ? `${r.winPct}%` : '—'}</td>
        <td>${r.marketPct != null ? `${r.marketPct}%` : '—'}</td>
        <td>${edgeCell}</td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <div class="pm-table-total">Total picks: ${total}</div>
    <table class="astro-table">
      <thead><tr><th>Component</th><th>Picks</th><th>Win %</th><th>Market %</th><th>Edge</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/* ---------- Totals (pace) market ---------- */
// base/suffix stay SEPARATE parameters with a single id() helper, so the scope
// suffix always lands last. Pre-concatenating them is what produced
// nbaTotalsOldHero instead of nbaTotalsHeroOld last time.
function renderNbaTotalsMarket(records, base, suffix, emptyMsg, onPageChange) {
  const id = (part) => `${base}${part}${suffix}`;
  const prefix = base + suffix; // pagination state key, unique per market+scope
  const hero = document.getElementById(id('Hero'));
  if (!hero) return;

  const resolvedAll = records.filter((p) => p.result && !p.result.draw);
  const resolved = resolvedAll.filter((p) => edgeGap(p) >= NBA_TOTALS_MIN_GAP);
  const wins = resolved.filter(isCorrectPick);
  const pct = resolved.length ? Math.round((wins.length / resolved.length) * 100) : null;

  hero.innerHTML = resolved.length
    ? `
      <div class="score-names">Pace Pick Win Rate</div>
      <div class="score-big ${winRateClass(pct)}">${pct}<span class="score-out-of">%</span></div>
      <div class="pm-breakdown-hint">${wins.length} of ${resolved.length} real-edge picks correct &middot; ${resolvedAll.length - resolved.length} tossups excluded &middot; ${records.filter((p) => !p.result).length} pending</div>`
    : `<div class="score-names">Pace Pick Win Rate</div>
       <div class="empty-state">${records.length ? `${records.length} tracked, none resolved with a real edge yet.` : emptyMsg}</div>`;

  const tierEl = document.getElementById(id('Tier'));
  if (tierEl) {
    const tierRows = computeEdgeTierStats(records, NBA_TOTALS_TIERS).map((t) => `
      <tr>
        <td>${t.icon} ${t.label}</td>
        <td>${t.count}</td>
        <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
          ? `<span class="score-inline ${winRateClass(t.winPct)}">${t.winPct}%</span>`
          : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
      </tr>`).join('');
    tierEl.innerHTML = records.length
      ? `<table class="astro-table"><thead><tr><th>Pace Strength</th><th>Picks</th><th>Win Rate</th></tr></thead><tbody>${tierRows}</tbody></table>`
      : '<div class="empty-state">No picks tracked yet.</div>';
  }

  renderNbaTotalsComponentSignal(records, id('ComponentSignal'));
  renderDayNumberTable(id('UniversalDay'), records, 'gameTime', universalDayNumber, DAY_FILTER_UNIVERSAL_OPTIONS, 'Universal Day', NBA_TOTALS_MIN_GAP);
  renderDayNumberTable(id('DayEnergy'), records, 'gameTime', getReducedDay, DAY_FILTER_ENERGY_OPTIONS, 'Day Energy', NBA_TOTALS_MIN_GAP);
  renderDayComboTable(id('DayCombo'), records, 'gameTime', NBA_TOTALS_MIN_GAP);

  const body = document.getElementById(id('Body'));
  if (!body) return;
  if (!records.length) {
    body.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    renderPaginationControls(id('Pagination'), prefix, 1, 1, () => {});
    return;
  }
  const sorted = [...records].sort((a, b) => new Date(b.gameTime) - new Date(a.gameTime));
  const { rows, page, totalPages } = paginationSlice(prefix, sorted);
  const bodyRows = rows.map((p) => {
    const status = !p.result
      ? '<span class="empty-state">Pending</span>'
      : p.result.draw
        ? '↩️ Push'
        : isCorrectPick(p) ? '✅ Hit' : '❌ Miss';
    const price = numerologyPickPrice(p);
    return `
      <tr>
        <td>${formatNbaGameDate(p.gameTime)}</td>
        <td>${escapeHtml(p.gameLabel || '')}</td>
        <td>${escapeHtml(p.numerologyFavorite)}${p.line != null ? ` ${p.line}` : ''}</td>
        <td>${p.paceScore != null ? p.paceScore : ''}</td>
        <td>${Number.isFinite(price) ? `${Math.round(price * 100)}¢` : ''}</td>
        <td>${status}</td>
      </tr>`;
  }).join('');
  body.innerHTML = `
    <div class="pm-table-total">Total picks: ${records.length}</div>
    <div class="pm-table-scroll">
      <table class="astro-table">
        <thead><tr><th>Date</th><th>Game</th><th>Pick</th><th>Pace</th><th>Price</th><th>Result</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
  renderPaginationControls(id('Pagination'), prefix, page, totalPages, onPageChange);
}

function renderNbaTotalsComponentSignal(records, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const withComps = records.filter((p) => p.paceComponents && p.result && !p.result.draw);
  if (!withComps.length) {
    el.innerHTML = '<div class="empty-state">No component data yet &mdash; run Backfill on the Old Data tab to collect it for this market.</div>';
    return;
  }
  const priceFor = (p, name) => (normalizeName(p.teamAName) === normalizeName(name) ? p.marketPriceA : p.marketPriceB);

  const statFor = (scoreOf) => {
    const picks = withComps
      .map((p) => {
        const score = scoreOf(p);
        if (score == null) return null;
        const side = nbaPaceSideForScore(score, p.teamAName, p.teamBName);
        const implied = priceFor(p, side);
        if (implied == null) return null;
        return { won: normalizeName(p.result.winner) === normalizeName(side), implied };
      })
      .filter(Boolean);
    const n = picks.length;
    const wins = picks.filter((x) => x.won).length;
    const winPct = n ? Math.round((wins / n) * 100) : null;
    const marketPct = n ? Math.round((picks.reduce((s, x) => s + x.implied, 0) / n) * 100) : null;
    return { count: n, wins, winPct, marketPct, edge: (winPct != null && marketPct != null) ? winPct - marketPct : null };
  };

  const rows = NBA_PACE_COMPONENT_KEYS.map((key) => ({
    key,
    label: NBA_PACE_COMPONENT_LABELS[key],
    ...statFor((p) => (p.paceComponents ? p.paceComponents[key] : null)),
  }));
  rows.push({ key: 'pace', label: NBA_PACE_COMPONENT_LABELS.pace, ...statFor((p) => p.paceScore) });
  rows.sort((a, b) => (b.edge == null ? -Infinity : b.edge) - (a.edge == null ? -Infinity : a.edge));

  const body = rows.map((r) => `
    <tr${r.key === 'pace' ? ' style="border-top:2px solid var(--border);"' : ''}>
      <td>${escapeHtml(r.label)}</td>
      <td>${r.count}</td>
      <td>${r.winPct != null ? `${r.winPct}%` : '—'}</td>
      <td>${r.marketPct != null ? `${r.marketPct}%` : '—'}</td>
      <td>${(r.edge != null && r.count >= MIN_BUCKET_SAMPLE)
        ? `<span class="score-inline ${r.edge > 0 ? 'good' : (r.edge < 0 ? 'bad' : '')}">${r.edge > 0 ? '+' : ''}${r.edge}</span>`
        : `<span class="empty-state">${r.count ? 'thin' : '—'}</span>`}</td>
    </tr>`).join('');

  el.innerHTML = `
    <div class="pm-table-total">Total picks: ${withComps.length}</div>
    <table class="astro-table">
      <thead><tr><th>Signal</th><th>Picks</th><th>Win %</th><th>Market %</th><th>Edge</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/* ---------- Player prop signal rendering ---------- */
// Fifteen tests run here at once (five day bands across three stats). At that
// many, roughly one will clear 2 sigma on pure chance every time you look, so
// 2 sigma is NOT the bar - reading it as one is how a project talks itself into
// betting noise. The hero applies a Bonferroni-style correction and reports the
// threshold it is actually using.
const NBA_PROP_TEST_COUNT = NBA_PROP_DAY_BANDS.length * NBA_PROP_STATS.length;
// 3 sigma two-sided is about 1-in-370, which stays convincing even after 15
// looks (15/370 is about a 4% chance of one false positive across the set).
const NBA_PROP_SIGMA_BAR = 3;

function renderNbaPropHero(signals, suffix = '') {
  const hero = document.getElementById('nbaPropHero' + suffix);
  if (!hero) return;

  if (!signals.length) {
    hero.innerHTML = `
      <div class="score-names">Prop Signal</div>
      <div class="empty-state">No prop signals collected yet &mdash; run Collect Prop Signals on the Old Data tab. It only needs ESPN boxscores, so it is far quicker than the game backfill.</div>`;
    return;
  }

  // The single most extreme band across every stat, judged on the magnitude
  // test - it uses how MUCH a player beat his average by rather than only
  // whether he did, and measured about 40% more sensitive on a known small
  // effect (+4.78 sigma vs +3.38 for the same +0.15 assists).
  let best = null;
  NBA_PROP_STATS.forEach((stat) => {
    computeNbaPropBandStats(signals, stat).forEach((b) => {
      if (b.diffSigma == null || !b.samples) return;
      if (!best || Math.abs(b.diffSigma) > Math.abs(best.diffSigma)) best = { ...b, stat };
    });
  });

  const total = signals.length;
  if (!best) {
    hero.innerHTML = `
      <div class="score-names">Prop Signal</div>
      <div class="empty-state">${total} player-games collected, none resolvable yet.</div>`;
    return;
  }

  const passes = Math.abs(best.diffSigma) >= NBA_PROP_SIGMA_BAR;
  const diffTxt = `${best.meanDiff > 0 ? '+' : ''}${best.meanDiff.toFixed(2)}`;
  hero.innerHTML = `
    <div class="score-names">Strongest Prop Signal</div>
    <div class="score-big ${passes ? (best.diffSigma > 0 ? 'good' : 'bad') : ''}">${diffTxt}<span class="score-out-of"> vs own avg</span></div>
    <div class="pm-breakdown-hint">
      ${escapeHtml(NBA_PROP_STAT_LABELS[best.stat])} on ${escapeHtml(best.label)} days &middot;
      ${best.samples.toLocaleString()} player-games &middot;
      <b>${best.diffSigma > 0 ? '+' : ''}${best.diffSigma.toFixed(2)} sigma</b> against every other band
    </div>
    <div class="mode-desc">${passes
      ? `That clears the ${NBA_PROP_SIGMA_BAR} sigma bar this table is held to &mdash; a real effect rather than a lucky band.`
      : `Below the ${NBA_PROP_SIGMA_BAR} sigma bar, so read it as nothing. ${NBA_PROP_TEST_COUNT} bands are tested at once here, and about one reaches 2 sigma by chance every time you look.`}
    <br><b>Read the sigma, not the percentage.</b> Beating your own trailing <i>mean</i> is a sub-50% proposition for any counting stat &mdash; a few big games drag the mean above the median, so with zero numerology effect at all these rates sit near 45-48%. A raw rate below 50% therefore means nothing on its own. What matters is whether one band differs from the others, which is exactly what the sigma columns test.
    <br>Baseline is each player's own trailing ${NBA_FORM_WINDOW}-game average, so talent cancels out entirely. ${total.toLocaleString()} player-games recorded.</div>`;
}

function renderNbaPropStatTable(signals, stat, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const rows = computeNbaPropBandStats(signals, stat);
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!total) {
    el.innerHTML = '<div class="empty-state">No player-games collected for this stat yet.</div>';
    return;
  }
  const overallPct = (rows.find((r) => r.overallPct != null) || {}).overallPct;
  const cell = (sigma, text) => (sigma == null
    ? '<span class="empty-state">—</span>'
    : `<span class="score-inline ${Math.abs(sigma) >= NBA_PROP_SIGMA_BAR ? (sigma > 0 ? 'good' : 'bad') : ''}">${text}</span>`);

  const body = rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td>${r.count.toLocaleString()}</td>
        <td>${r.overPct != null ? `${r.overPct}%` : '—'}</td>
        <td>${cell(r.sigma, `${r.sigma > 0 ? '+' : ''}${r.sigma == null ? '' : r.sigma.toFixed(2)}`)}</td>
        <td>${r.meanDiff != null ? `${r.meanDiff > 0 ? '+' : ''}${r.meanDiff.toFixed(2)}` : '—'}</td>
        <td>${cell(r.diffSigma, `${r.diffSigma > 0 ? '+' : ''}${r.diffSigma == null ? '' : r.diffSigma.toFixed(2)}`)}</td>
      </tr>`).join('');

  el.innerHTML = `
    <div class="pm-table-total">Player-games: ${total.toLocaleString()}${overallPct != null ? ` &middot; overall rate ${overallPct}% (this stat's true null, not 50%)` : ''}</div>
    <table class="astro-table">
      <thead><tr>
        <th>Day Energy Band</th>
        <th>Player-games</th>
        <th>Beat own avg</th>
        <th>&sigma; vs overall</th>
        <th>Avg diff</th>
        <th>&sigma; magnitude</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="mode-desc">The last column is the one to trust: it compares how much this band beat its baseline by against every other band, so it uses magnitude rather than a yes/no, and skew cancels out. Measured about 40% more sensitive than the rate test on a known small effect.</div>`;
}

function renderNbaPropSignals(signals, suffix = '') {
  renderNbaPropHero(signals, suffix);
  NBA_PROP_STATS.forEach((stat) => {
    renderNbaPropStatTable(signals, stat, `nbaProp${stat.toUpperCase()}${suffix}`);
  });
}

/* ---------- Scope rendering ---------- */
function isNbaTodayLocal(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function renderNbaScope(suffix, predictions, totals) {
  const isOld = suffix === 'Old';
  const todayOrOld = predictions.filter((p) => isNbaTodayLocal(p.gameTime) === !isOld);
  const matchesDay = dayFilterPredicate('nba' + suffix);
  const scoped = todayOrOld.filter((p) => matchesDay(p.gameTime));
  const stats = computeNbaStats(scoped);

  renderNbaHero(stats, suffix);
  renderNbaBreakdown(stats, suffix);
  renderNbaEdgeTiers(scoped, suffix);
  renderNbaPriceBuckets(scoped, suffix);
  // Always todayOrOld, not scoped - these tables exist to show every day value
  // side by side, which the day filter would collapse.
  renderDayNumberTable('nbaUniversalDay' + suffix, todayOrOld, 'gameTime', universalDayNumber, DAY_FILTER_UNIVERSAL_OPTIONS, 'Universal Day', NBA_REAL_EDGE_MIN_GAP);
  renderDayNumberTable('nbaDayEnergy' + suffix, todayOrOld, 'gameTime', getReducedDay, DAY_FILTER_ENERGY_OPTIONS, 'Day Energy', NBA_REAL_EDGE_MIN_GAP);
  renderDayComboTable('nbaDayCombo' + suffix, todayOrOld, 'gameTime', NBA_REAL_EDGE_MIN_GAP);
  renderNbaComponentSignal(scoped, suffix);
  renderDimensionEdgeTable('nbaDimensionEdge' + suffix, scoped, (p) => [p.teamAName, p.teamBName]);
  renderNbaTable(scoped, suffix, isOld ? [] : todaysNbaSlatePending);

  const lastUpdated = document.getElementById('nbaStatsLastUpdated' + suffix);
  if (lastUpdated) lastUpdated.textContent = `Last checked ${new Date().toLocaleTimeString()}`;

  // Prop signals carry an ET date string rather than a timestamp. Noon is
  // appended before the day filter reads it so a bare YYYY-MM-DD isn't parsed
  // as UTC midnight and pulled back a day in western timezones.
  const todayET = nbaEasternDateISO(new Date());
  const scopedProps = currentNbaPropSignals.filter((r) => {
    const isToday = r.d === todayET;
    return isToday === !isOld && matchesDay(`${r.d}T12:00:00`);
  });
  renderNbaPropSignals(scopedProps, suffix);

  const scopedTotals = (totals || []).filter((p) => isNbaTodayLocal(p.gameTime) === !isOld && matchesDay(p.gameTime));
  renderNbaTotalsMarket(
    scopedTotals, 'nbaTotals', suffix,
    'No totals picks yet - run Backfill on the Old Data tab to collect them.',
    () => renderNbaScope(suffix, predictions, totals),
  );
}

async function refreshAndRenderNba() {
  await checkNbaResults();
  await checkNbaTotalsResults();
  currentNbaPredictions = loadNbaPredictions();
  currentNbaTotals = loadNbaTotalsPredictions();
  currentNbaPropSignals = loadNbaPropSignals();
  renderNbaScope('', currentNbaPredictions, currentNbaTotals);
  renderNbaScope('Old', currentNbaPredictions, currentNbaTotals);
}

function wireNbaRefreshButton(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Checking…';
    try {
      await refreshAndRenderNba();
    } catch (e) {
      console.error('NBA result check failed', e);
    }
    btn.textContent = original;
    btn.disabled = false;
  });
}

/* ---------- Historical backfill ---------- */
// Bump when the stored record shape changes - a mismatch forces a full re-walk
// rather than leaving old and new shapes mixed in one store.
//   1 -> 2: added the franchise component to every side's composite, which
//           changes both the stored components and the composite score itself.
const NBA_BACKFILL_SCHEMA = 2;

// How often a long walk writes its data and progress marker to storage. Seven
// days of games is a small enough amount of work to redo after an interruption,
// and infrequent enough that a two-season run does ~90 writes rather than ~640.
const NBA_BACKFILL_CHECKPOINT_DAYS = 7;

// Totals events carry several lines (3-7 in the regular season, 25 on a
// playoff game); the "main" one is whichever is priced closest to even,
// matching how MLB picks its main run-total line. Prices come from CLOB history
// because a closed market's own prices are the 1/0 result.
//
// Do NOT try to shortcut this by picking the highest-volume line. That was
// measured against four real events and the highest-volume line was a
// DIFFERENT line from the closest-to-even one every single time - volume
// clusters on whichever number the crowd liked, not on the fair line.
//
// What is safe to skip is a line with zero volume: checked across those same
// events, every zero-volume line has no CLOB history at all and returns null,
// so pricing it is a guaranteed wasted request. On a 25-line playoff event
// that is most of them.
async function pickMainNbaTotalsLine(totalsMarkets, targetTs) {
  let best = null;
  for (const market of totalsMarkets) {
    if (!market.clobTokenIdA || !market.clobTokenIdB) continue;
    if (Number(market.volume) === 0) continue;
    const priceA = await fetchNbaClobPriceNear(market.clobTokenIdA, targetTs);
    if (priceA == null) continue;
    const distance = Math.abs(priceA - 0.5);
    if (!best || distance < best.distance) {
      const priceB = await fetchNbaClobPriceNear(market.clobTokenIdB, targetTs);
      best = { market, priceA, priceB: priceB != null ? priceB : 1 - priceA, distance };
    }
  }
  return best;
}

function nbaIsoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function nbaAddDaysISO(dateISO, days) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return nbaIsoDateOnly(d);
}

// Walks forward one ET date at a time. Order is the whole point: a game is
// scored from the form built by games BEFORE it, and only then does its own
// boxscore fold into that form. Reversing those two steps would leak the
// result into the prediction.
async function backfillNbaHistory(onProgress) {
  const windowDays = loadNbaBackfillWindowDays();
  const state = loadNbaBackfillState();
  const freshWalk = state.schema !== NBA_BACKFILL_SCHEMA;

  const today = nbaEasternDateISO(new Date());
  const endDate = nbaAddDaysISO(today, -1); // yesterday - today's games may be live
  const windowStart = nbaAddDaysISO(today, -windowDays);
  // Polymarket has nothing before this, so an earlier date can never produce a
  // priced pick.
  let startDate = windowStart < NBA_POLYMARKET_FIRST_DATE ? NBA_POLYMARKET_FIRST_DATE : windowStart;
  if (!freshWalk && state.lastDate && state.lastDate >= startDate) {
    startDate = nbaAddDaysISO(state.lastDate, 1);
  }
  if (startDate > endDate) return { alreadyCurrent: true };

  // A fresh walk has to start from genuinely empty state, for two separate
  // reasons that both produce silently wrong output otherwise:
  //
  // 1. Records are deduped by conditionId, so any surviving record from an
  //    older schema would be SKIPPED rather than rebuilt - leaving a store
  //    with two different shapes in it and a component table quietly averaging
  //    across both.
  // 2. More subtly, the form store keeps only the most recent
  //    NBA_FORM_WINDOW games per player. Re-walking from the start against a
  //    form store already full of late-season games means every early date
  //    finds no prior games at all, so nothing scores and the whole walk
  //    produces almost nothing. The form store must be rebuilt in step with
  //    the walk that populates it.
  //
  // Birth dates are deliberately kept - a date of birth doesn't change, and
  // re-fetching ~750 of them one request at a time is the slowest part of a run.
  const predictions = freshWalk ? [] : loadNbaPredictions();
  const totalsRecords = freshWalk ? [] : loadNbaTotalsPredictions();
  const form = freshWalk ? {} : loadNbaPlayerForm();
  const birthdates = loadNbaBirthdates();
  const seenConditionIds = new Set(predictions.map((p) => String(p.conditionId)));
  const seenTotalsIds = new Set(totalsRecords.map((p) => String(p.conditionId)));

  // Writes everything gathered so far plus the marker saying how far the walk
  // got, as one unit. lastDate is only ever advanced to a day whose records are
  // already persisted.
  function checkpoint(throughDate) {
    saveNbaPredictions(predictions);
    saveNbaTotalsPredictions(totalsRecords);
    saveNbaPlayerForm(form);
    saveNbaBirthdates(birthdates);
    saveNbaBackfillState({ schema: NBA_BACKFILL_SCHEMA, lastDate: throughDate });
  }

  let gamesProcessed = 0;
  let newPredictions = 0;
  let newTotals = 0;
  let skippedNoForm = 0;
  let skippedNoMarket = 0;
  let dobFetched = 0;

  // Total days is known up front, so progress can be reported as a fraction of
  // the walk rather than an open-ended counter.
  const totalDays = Math.max(1, Math.round((new Date(`${endDate}T12:00:00Z`) - new Date(`${startDate}T12:00:00Z`)) / 86400000) + 1);
  let dayIndex = 0;

  for (let date = startDate; date <= endDate; date = nbaAddDaysISO(date, 1)) {
    dayIndex += 1;
    if (onProgress) onProgress(dayIndex, totalDays, gamesProcessed, newPredictions);

    const games = await fetchNbaScoreboard(date);
    for (const game of games) {
      if (!game.final) continue;
      if (!game.home.abbr || !game.away.abbr) continue;
      // All-Star exhibition teams are not real franchises.
      if (NBA_EXHIBITION_SLUG_CODES.has(String(game.home.abbr).toLowerCase())
        || NBA_EXHIBITION_SLUG_CODES.has(String(game.away.abbr).toLowerCase())) continue;
      gamesProcessed += 1;

      const matchDate = parseDateInput(date);
      const stateInfo = nbaVenueStateInfo(game.venueState);
      const stateDate = stateInfo && stateInfo.founded ? parseDateInput(stateInfo.founded) : null;

      // --- score from form as it stands BEFORE this game ---
      const rotationAway = nbaExpectedRotation(form, game.away.abbr, date)
        .map((p) => ({ ...p, birthDate: p.birthDate || (birthdates[p.id] ? birthdates[p.id].birthDate : null) }));
      const rotationHome = nbaExpectedRotation(form, game.home.abbr, date)
        .map((p) => ({ ...p, birthDate: p.birthDate || (birthdates[p.id] ? birthdates[p.id].birthDate : null) }));
      const compAway = computeNbaSideComposite(rotationAway, matchDate, null, stateDate, game.away.abbr);
      const compHome = computeNbaSideComposite(rotationHome, matchDate, null, stateDate, game.home.abbr);

      if (compAway && compHome) {
        const event = await fetchNbaEventForGame(game.away.abbr, game.home.abbr, date);
        if (!event) {
          skippedNoMarket += 1;
        } else {
          const targetTs = Math.floor(event.gameStartTime.getTime() / 1000);
          // Which stored side is which team: Polymarket lists nicknames.
          const aIsHome = normalizeName(event.teamAName) === normalizeName(game.home.nickname);
          const scoreA = aIsHome ? compHome.combined : compAway.combined;
          const scoreB = aIsHome ? compAway.combined : compHome.combined;
          const compsA = aIsHome ? extractNbaComponents(compHome.parts) : extractNbaComponents(compAway.parts);
          const compsB = aIsHome ? extractNbaComponents(compAway.parts) : extractNbaComponents(compHome.parts);
          const dimsA = aIsHome ? extractTeamDimensions(compHome.parts) : extractTeamDimensions(compAway.parts);
          const dimsB = aIsHome ? extractTeamDimensions(compAway.parts) : extractTeamDimensions(compHome.parts);

          if (!seenConditionIds.has(String(event.conditionId))) {
            const priceA = await fetchNbaClobPriceNear(event.clobTokenIdA, targetTs);
            const priceB = await fetchNbaClobPriceNear(event.clobTokenIdB, targetTs);
            if (priceA != null && priceB != null) {
              const marketFavName = priceA >= priceB ? event.teamAName : event.teamBName;
              const numFavName = scoreA >= scoreB ? event.teamAName : event.teamBName;
              const homeScore = game.home.score;
              const awayScore = game.away.score;
              const sideAScore = aIsHome ? homeScore : awayScore;
              const sideBScore = aIsHome ? awayScore : homeScore;
              const result = (!Number.isFinite(sideAScore) || !Number.isFinite(sideBScore))
                ? null
                : sideAScore === sideBScore
                  ? { winner: null, draw: true, resolvedAt: Date.now() }
                  : { winner: sideAScore > sideBScore ? event.teamAName : event.teamBName, draw: false, resolvedAt: Date.now() };

              predictions.push({
                conditionId: event.conditionId,
                eventId: game.eventId,
                teamAName: event.teamAName,
                teamBName: event.teamBName,
                numerologyFavorite: numFavName,
                numerologyScoreA: scoreA,
                numerologyScoreB: scoreB,
                components: { A: compsA, B: compsB },
                dims: { A: dimsA, B: dimsB },
                marketFavorite: marketFavName,
                marketPriceA: priceA,
                marketPriceB: priceB,
                pickType: normalizeName(marketFavName) === normalizeName(numFavName) ? 'favorite' : 'underdog',
                gameTime: event.gameStartTime.toISOString(),
                recordedAt: Date.now(),
                result,
              });
              seenConditionIds.add(String(event.conditionId));
              newPredictions += 1;
            }
          }

          // --- totals on the same event ---
          if (event.totalsMarkets && event.totalsMarkets.length) {
            const main = await pickMainNbaTotalsLine(event.totalsMarkets, targetTs);
            if (main && !seenTotalsIds.has(String(main.market.conditionId))) {
              const paceScore = (compHome.combined + compAway.combined) / 2;
              const result = nbaTotalsResultFromScores(game.home.score, game.away.score, main.market.outcomeA, main.market.outcomeB, main.market.line);
              totalsRecords.push(buildNbaTotalsRecord(
                { ...main.market, priceA: main.priceA, priceB: main.priceB },
                paceScore,
                `${game.away.nickname} vs. ${game.home.nickname}`,
                event.gameStartTime.toISOString(),
                result,
                game.eventId,
                nbaPaceComponentsFromSides(extractNbaComponents(compHome.parts), extractNbaComponents(compAway.parts)),
              ));
              seenTotalsIds.add(String(main.market.conditionId));
              newTotals += 1;
            }
          }
        }
      } else {
        skippedNoForm += 1;
      }

      // --- fold this game's boxscore into form (always, even if unscored:
      // that is how form accumulates in the first place) ---
      const box = await fetchNbaGameBoxscore(game.eventId);
      if (!box) continue;
      for (const abbr of Object.keys(box)) {
        const players = box[abbr];
        // Fetch any birth date we don't have yet - once per player, ever.
        for (const p of players) {
          if (!p.id || !p.played) continue;
          if (birthdates[p.id]) continue;
          const dob = await fetchNbaAthleteDob(p.id);
          // Cache the miss too, as null, so a player ESPN has no DOB for isn't
          // re-requested on every one of their 82 games.
          birthdates[p.id] = dob ? { name: dob.name, birthDate: dob.birthDate } : { name: p.name, birthDate: null };
          if (dob) dobFetched += 1;
        }
        nbaUpdatePlayerForm(form, abbr, date, players, birthdates);
      }
    }

    // Checkpoint the DATA and the progress marker together, never the marker
    // alone. Saving only the marker each day (as this first did) meant an
    // interrupted run recorded "reached day 100" while none of those 100 days'
    // records had been written - so the resume skipped straight past them and
    // the work was silently lost. Every NBA_BACKFILL_CHECKPOINT_DAYS the two
    // are written as a pair, so a resume can only ever repeat work, never
    // skip it.
    if (dayIndex % NBA_BACKFILL_CHECKPOINT_DAYS === 0) checkpoint(date);
  }

  checkpoint(endDate);

  return {
    gamesProcessed,
    newPredictionsCount: newPredictions,
    newTotalsCount: newTotals,
    skippedNoForm,
    skippedNoMarket,
    dobFetched,
  };
}

/* ---------- Player prop signal collection ---------- */
const NBA_PROP_BACKFILL_SCHEMA = 1;

// Walks the same dates as the game backfill but touches only ESPN: one
// scoreboard call per date and one boxscore per game. No Polymarket, no CLOB
// price history - which is why this runs in minutes where the game walk runs in
// hours, and why it is a separate pass rather than a schema bump that would
// have forced the whole price fetch to happen again.
//
// The trailing-average form used for baselines is rebuilt LOCALLY as the walk
// proceeds, starting empty, and is never read from the persisted form store.
// That store keeps only each player's most recent ten games, so reading it here
// would compare an October game against the following April's average - a
// lookahead that would manufacture signal out of nothing.
async function backfillNbaPropSignals(onProgress) {
  const windowDays = loadNbaBackfillWindowDays();
  const state = loadNbaPropBackfillState();
  const freshWalk = state.schema !== NBA_PROP_BACKFILL_SCHEMA;

  const today = nbaEasternDateISO(new Date());
  const endDate = nbaAddDaysISO(today, -1);
  // Not bounded by NBA_POLYMARKET_FIRST_DATE: a prop signal needs no market at
  // all, so it can reach back as far as ESPN has boxscores.
  let startDate = nbaAddDaysISO(today, -windowDays);
  if (!freshWalk && state.lastDate && state.lastDate >= startDate) {
    startDate = nbaAddDaysISO(state.lastDate, 1);
  }
  if (startDate > endDate) return { alreadyCurrent: true };

  const signals = freshWalk ? [] : loadNbaPropSignals();
  const birthdates = loadNbaBirthdates();
  const seen = new Set(signals.map((r) => `${r.g}|${r.p}`));
  const form = {}; // local, rebuilt in step with the walk - see above

  let gamesProcessed = 0;
  let newSignals = 0;
  let skippedThinBaseline = 0;
  let dobFetched = 0;

  const totalDays = Math.max(1, Math.round((new Date(`${endDate}T12:00:00Z`) - new Date(`${startDate}T12:00:00Z`)) / 86400000) + 1);
  let dayIndex = 0;

  function checkpoint(throughDate) {
    saveNbaPropSignals(signals);
    saveNbaBirthdates(birthdates);
    saveNbaPropBackfillState({ schema: NBA_PROP_BACKFILL_SCHEMA, lastDate: throughDate });
  }

  for (let date = startDate; date <= endDate; date = nbaAddDaysISO(date, 1)) {
    dayIndex += 1;
    if (onProgress) onProgress(dayIndex, totalDays, gamesProcessed, newSignals);

    const games = await fetchNbaScoreboard(date);
    for (const game of games) {
      if (!game.final || !game.home.abbr || !game.away.abbr) continue;
      if (NBA_EXHIBITION_SLUG_CODES.has(String(game.home.abbr).toLowerCase())
        || NBA_EXHIBITION_SLUG_CODES.has(String(game.away.abbr).toLowerCase())) continue;
      gamesProcessed += 1;

      const matchDate = parseDateInput(date);
      const stateInfo = nbaVenueStateInfo(game.venueState);
      const stateDate = stateInfo && stateInfo.founded ? parseDateInput(stateInfo.founded) : null;

      // Record against the form as it stands BEFORE this game.
      const preGameRotations = {};
      [game.home.abbr, game.away.abbr].forEach((abbr) => {
        preGameRotations[abbr] = nbaExpectedRotation(form, abbr, date).slice(0, NBA_PROP_PLAYERS_PER_TEAM);
      });

      const box = await fetchNbaGameBoxscore(game.eventId);
      if (!box) continue;

      for (const abbr of Object.keys(box)) {
        const players = box[abbr];
        for (const p of players) {
          if (!p.id || !p.played) continue;
          if (!birthdates[p.id]) {
            const dob = await fetchNbaAthleteDob(p.id);
            birthdates[p.id] = dob ? { name: dob.name, birthDate: dob.birthDate } : { name: p.name, birthDate: null };
            if (dob) dobFetched += 1;
          }
        }

        const rotation = preGameRotations[abbr] || [];
        for (const rotPlayer of rotation) {
          const actual = players.find((p) => String(p.id) === String(rotPlayer.id));
          if (!actual || !actual.played) continue;             // rested or injured
          if (seen.has(`${game.eventId}|${rotPlayer.id}`)) continue;

          const bd = birthdates[rotPlayer.id];
          if (!bd || !bd.birthDate) continue;
          if (rotPlayer.priorGames < NBA_PROP_MIN_BASELINE_GAMES) { skippedThinBaseline += 1; continue; }

          const baselines = {
            pts: nbaTrailingAvg(form, rotPlayer.id, 'pts'),
            reb: nbaTrailingAvg(form, rotPlayer.id, 'reb'),
            ast: nbaTrailingAvg(form, rotPlayer.id, 'ast'),
          };
          const dayScore = computeFighterScore(parseDateInput(bd.birthDate), matchDate, null, stateDate).combined;
          const rec = buildNbaPropSignal(
            game.eventId, rotPlayer.id, abbr, date, dayScore,
            { pts: actual.points, reb: actual.rebounds, ast: actual.assists },
            baselines,
          );
          if (!rec) continue;
          signals.push(rec);
          seen.add(`${game.eventId}|${rotPlayer.id}`);
          newSignals += 1;
        }

        // Fold this game in only after every player has been recorded against
        // the pre-game baseline.
        nbaUpdatePlayerForm(form, abbr, date, players, birthdates);
      }
    }

    if (dayIndex % NBA_BACKFILL_CHECKPOINT_DAYS === 0) checkpoint(date);
  }

  checkpoint(endDate);
  return { gamesProcessed, newSignalsCount: newSignals, skippedThinBaseline, dobFetched, total: signals.length };
}

/* ---------- Today's slate ---------- */
// Pulls today's open Polymarket markets and scores any game not already
// stored, so the Today tab reflects the slate without the live tracker open.
async function recordTodaysNbaGames() {
  const games = await fetchNbaMoneylineEvents();
  if (!games.length) return;

  const predictions = loadNbaPredictions();
  const totalsRecords = loadNbaTotalsPredictions();
  const form = loadNbaPlayerForm();
  const birthdates = loadNbaBirthdates();
  const seen = new Set(predictions.map((p) => String(p.conditionId)));
  const seenTotals = new Set(totalsRecords.map((p) => String(p.conditionId)));
  const pending = [];
  let added = 0;

  const today = nbaEasternDateISO(new Date());
  const slate = await fetchNbaScoreboard(today);

  for (const g of games) {
    if (seen.has(String(g.conditionId))) continue;
    if (nbaEasternDateISO(g.gameStartTime) !== today) continue;

    const espnGame = slate.find((s) => normalizeName(s.home.nickname) === normalizeName(g.teamAName)
      || normalizeName(s.home.nickname) === normalizeName(g.teamBName));
    if (!espnGame) { pending.push({ ...g, status: 'pending' }); continue; }

    const matchDate = parseDateInput(today);
    const stateInfo = nbaVenueStateInfo(espnGame.venueState);
    const stateDate = stateInfo && stateInfo.founded ? parseDateInput(stateInfo.founded) : null;
    const withDobs = (list) => list.map((p) => ({ ...p, birthDate: p.birthDate || (birthdates[p.id] ? birthdates[p.id].birthDate : null) }));
    const compHome = computeNbaSideComposite(withDobs(nbaExpectedRotation(form, espnGame.home.abbr, today)), matchDate, null, stateDate, espnGame.home.abbr);
    const compAway = computeNbaSideComposite(withDobs(nbaExpectedRotation(form, espnGame.away.abbr, today)), matchDate, null, stateDate, espnGame.away.abbr);
    if (!compHome || !compAway) { pending.push({ ...g, status: 'rotation' }); continue; }

    const aIsHome = normalizeName(g.teamAName) === normalizeName(espnGame.home.nickname);
    const scoreA = aIsHome ? compHome.combined : compAway.combined;
    const scoreB = aIsHome ? compAway.combined : compHome.combined;
    if (g.priceA == null || g.priceB == null) { pending.push({ ...g, status: 'pending' }); continue; }

    const marketFavName = g.priceA >= g.priceB ? g.teamAName : g.teamBName;
    const numFavName = scoreA >= scoreB ? g.teamAName : g.teamBName;
    predictions.push({
      conditionId: g.conditionId,
      eventId: espnGame.eventId,
      teamAName: g.teamAName,
      teamBName: g.teamBName,
      numerologyFavorite: numFavName,
      numerologyScoreA: scoreA,
      numerologyScoreB: scoreB,
      components: {
        A: aIsHome ? extractNbaComponents(compHome.parts) : extractNbaComponents(compAway.parts),
        B: aIsHome ? extractNbaComponents(compAway.parts) : extractNbaComponents(compHome.parts),
      },
      dims: {
        A: aIsHome ? extractTeamDimensions(compHome.parts) : extractTeamDimensions(compAway.parts),
        B: aIsHome ? extractTeamDimensions(compAway.parts) : extractTeamDimensions(compHome.parts),
      },
      marketFavorite: marketFavName,
      marketPriceA: g.priceA,
      marketPriceB: g.priceB,
      pickType: normalizeName(marketFavName) === normalizeName(numFavName) ? 'favorite' : 'underdog',
      gameTime: g.gameStartTime.toISOString(),
      recordedAt: Date.now(),
      result: null,
    });
    seen.add(String(g.conditionId));
    added += 1;

    // Live totals: the open market's own prices are real (not yet collapsed to
    // a result), so the main line is simply the one closest to even.
    const lines = (g.totalsMarkets || []).filter((m) => m.priceA != null && m.line != null);
    if (lines.length) {
      const main = lines.reduce((bestSoFar, m) => (Math.abs(m.priceA - 0.5) < Math.abs(bestSoFar.priceA - 0.5) ? m : bestSoFar), lines[0]);
      if (!seenTotals.has(String(main.conditionId))) {
        totalsRecords.push(buildNbaTotalsRecord(
          main,
          (compHome.combined + compAway.combined) / 2,
          `${espnGame.away.nickname} vs. ${espnGame.home.nickname}`,
          g.gameStartTime.toISOString(),
          null,
          espnGame.eventId,
          nbaPaceComponentsFromSides(extractNbaComponents(compHome.parts), extractNbaComponents(compAway.parts)),
        ));
        seenTotals.add(String(main.conditionId));
      }
    }
  }

  todaysNbaSlatePending = pending;
  if (added) {
    saveNbaPredictions(predictions);
    saveNbaTotalsPredictions(totalsRecords);
  }
}

/* ---------- Controls ---------- */
function initNbaStorageControls() {
  const windowSel = document.getElementById('nbaBackfillWindowSelect');
  if (!windowSel) return;
  windowSel.value = String(loadNbaBackfillWindowDays());
  windowSel.addEventListener('change', () => {
    saveNbaBackfillWindowDays(Number(windowSel.value));
    // The progress marker records how far the LAST window reached, so it has to
    // be dropped or the next run would skip the new range.
    saveNbaBackfillState({});
    document.getElementById('nbaBackfillStatus').textContent = `Window set to ${Math.round(Number(windowSel.value) / 7)} weeks - press Backfill Data to re-walk it.`;
  });
}

function initNbaBackfillButton() {
  const btn = document.getElementById('nbaBackfillBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const status = document.getElementById('nbaBackfillStatus');
    btn.disabled = true;
    const original = btn.textContent;
    status.textContent = 'Starting…';
    try {
      const result = await backfillNbaHistory((day, totalDays, games, picks) => {
        status.textContent = `Backfilling… day ${day}/${totalDays} · ${games} games · ${picks} picks so far`;
      });
      status.textContent = result.alreadyCurrent
        ? 'Already caught up to yesterday - nothing new to backfill.'
        : `Done - checked ${result.gamesProcessed} games, added ${result.newPredictionsCount} game picks and ${result.newTotalsCount} totals picks.`
          + `${result.skippedNoForm ? ` ${result.skippedNoForm} skipped for thin rotation form (expected early in the walk).` : ''}`
          + `${result.skippedNoMarket ? ` ${result.skippedNoMarket} had no Polymarket market.` : ''}`;
      await refreshAndRenderNba();
    } catch (e) {
      // Surface the real failure - a bare "try again" hides the one thing
      // needed to fix it, and a backfill is far too long to debug by guessing.
      status.textContent = `Backfill failed: ${e && e.message ? e.message : e}`;
      console.error('NBA backfill failed', e);
    }
    btn.textContent = original;
    btn.disabled = false;
  });
}

function initNbaPropBackfillButton() {
  const btn = document.getElementById('nbaPropBackfillBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const status = document.getElementById('nbaPropBackfillStatus');
    btn.disabled = true;
    const original = btn.textContent;
    status.textContent = 'Starting…';
    try {
      const result = await backfillNbaPropSignals((day, totalDays, games, added) => {
        status.textContent = `Collecting… day ${day}/${totalDays} · ${games} games · ${added.toLocaleString()} player-games so far`;
      });
      status.textContent = result.alreadyCurrent
        ? 'Already caught up to yesterday - nothing new to collect.'
        : `Done - ${result.gamesProcessed} games, added ${result.newSignalsCount.toLocaleString()} player-games (${result.total.toLocaleString()} total).`
          + `${result.skippedThinBaseline ? ` ${result.skippedThinBaseline.toLocaleString()} skipped for having under ${NBA_PROP_MIN_BASELINE_GAMES} prior games.` : ''}`;
      await refreshAndRenderNba();
    } catch (e) {
      status.textContent = `Collection failed: ${e && e.message ? e.message : e}`;
      console.error('NBA prop collection failed', e);
    }
    btn.textContent = original;
    btn.disabled = false;
  });
}

/* ---------- Bootstrap ---------- */
// Only wires the DOM when the NBA Stats section exists - this file also loads
// on betting.html for checkNbaResults() and the shared prediction helpers.
nbaStoreReady.then(() => {
  if (!document.getElementById('statsNbaSection')) return;

  document.getElementById('nbaGameSection').insertAdjacentHTML('beforebegin', dayFilterHtml('nba'));
  document.getElementById('nbaGameSectionOld').insertAdjacentHTML('beforebegin', dayFilterHtml('nbaOld'));
  initDayFilter('nba', () => {
    resetPagination('nbaStatsTable');
    resetPagination('nbaTotals');
    renderNbaScope('', currentNbaPredictions, currentNbaTotals);
  });
  initDayFilter('nbaOld', () => {
    resetPagination('nbaStatsTableOld');
    resetPagination('nbaTotalsOld');
    renderNbaScope('Old', currentNbaPredictions, currentNbaTotals);
  });

  initBreakdownToggle('nbaBreakdownToggle', ['nbaStatsEdgeTiersBox', 'nbaStatsPriceBucketsBox', 'nbaUniversalDayBox', 'nbaDayEnergyBox', 'nbaDayComboBox', 'nbaComponentSignalBox', 'nbaDimensionEdgeBox']);
  initBreakdownToggle('nbaBreakdownToggleOld', ['nbaStatsEdgeTiersBoxOld', 'nbaStatsPriceBucketsBoxOld', 'nbaUniversalDayBoxOld', 'nbaDayEnergyBoxOld', 'nbaDayComboBoxOld', 'nbaComponentSignalBoxOld', 'nbaDimensionEdgeBoxOld']);

  ['', 'Old'].forEach((s) => {
    initBreakdownToggle(`nbaTotalsBreakdownToggle${s}`, ['TierBox', 'ComponentBox', 'UniversalDayBox', 'DayEnergyBox', 'DayComboBox'].map((b) => `nbaTotals${b}${s}`));
    initBreakdownToggle(`nbaPropBreakdownToggle${s}`, NBA_PROP_STATS.map((stat) => `nbaProp${stat.toUpperCase()}Box${s}`));
  });

  initNbaMatchupModal('');
  initNbaMatchupModal('Old');
  initModalTabSwitcher('statsNbaSection');
  initNbaBackfillButton();
  initNbaPropBackfillButton();
  initNbaStorageControls();
  wireNbaRefreshButton('nbaStatsRefreshBtn');
  wireNbaRefreshButton('nbaStatsRefreshBtnOld');

  refreshAndRenderNba().then(() => {
    // Best-effort and non-blocking: stored data renders first, today's slate
    // fills in behind it.
    recordTodaysNbaGames().then(() => refreshAndRenderNba()).catch(() => {});
  });
});

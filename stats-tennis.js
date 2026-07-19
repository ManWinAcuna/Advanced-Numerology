// Mirrors stats-ufc.js exactly, but for tennis predictions - every top-level
// name here is prefixed/renamed versus that file since both scripts run in
// the same page (stats.html) and share one global scope.

const TENNIS_MARKETS_URL = 'https://gamma-api.polymarket.com/markets';

let currentTennisPredictions = [];

async function fetchTennisMarketsByConditionIds(ids) {
  if (!ids.length) return [];
  const params = new URLSearchParams({ closed: 'true' });
  ids.forEach((id) => params.append('condition_ids', id));
  try {
    const res = await fetch(`${TENNIS_MARKETS_URL}?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function determineTennisResult(market) {
  if (!market.closed) return null;
  let prices;
  let outcomes;
  try {
    prices = JSON.parse(market.outcomePrices).map(Number);
    outcomes = JSON.parse(market.outcomes);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(prices) || prices.length < 2) return null;

  const maxPrice = Math.max(...prices);
  if (maxPrice < 0.9) return { winner: null, draw: true, resolvedAt: Date.now() };

  const idx = prices.indexOf(maxPrice);
  return { winner: outcomes[idx], draw: false, resolvedAt: Date.now() };
}

async function checkTennisResults() {
  const predictions = loadTennisPredictions();
  const pending = predictions.filter((p) => !p.result);

  if (pending.length) {
    const markets = await fetchTennisMarketsByConditionIds(pending.map((p) => p.conditionId));
    const byId = new Map(markets.map((m) => [m.conditionId, m]));
    let changed = false;

    predictions.forEach((p) => {
      if (p.result) return;
      const market = byId.get(p.conditionId);
      if (!market) return;
      const result = determineTennisResult(market);
      if (result) {
        p.result = result;
        changed = true;
      }
    });

    if (changed) saveTennisPredictions(predictions);
  }

  return predictions;
}

// isCorrectPick, PRICE_BUCKETS, and computeBucketStats live in db-core.js -
// shared with the Polymarket tracker's risk manager so the two can never
// disagree.

// Same real-edge-only headline as stats-ufc.js - tossups recorded but
// excluded, tracked separately in the edge-tier table.
function computeTennisStats(predictions) {
  const resolvedAll = predictions.filter((p) => p.result && !p.result.draw);
  const resolved = resolvedAll.filter(hasRealEdge);
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

function renderTennisHero(stats) {
  const hero = document.getElementById('tennisStatsHero');

  if (stats.total === 0) {
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">No matches tracked yet &mdash; open the Polymarket Tennis tracker and set a tournament's location to start building a track record.</div>
    `;
    return;
  }

  if (stats.resolvedCount === 0) {
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">${stats.tossupResolvedCount
        ? `Only tossups (no real edge) have resolved so far (${stats.tossupResolvedCount}) &mdash; see the edge-strength table below.`
        : `${stats.total} match${stats.total === 1 ? '' : 'es'} tracked, none resolved yet. Check back after they finish.`}</div>
    `;
    return;
  }

  const extras = [];
  if (stats.tossupResolvedCount) extras.push(`${stats.tossupResolvedCount} tossup${stats.tossupResolvedCount === 1 ? '' : 's'} excluded`);
  if (stats.pendingCount) extras.push(`${stats.pendingCount} pending`);
  if (stats.drawCount) extras.push(`${stats.drawCount} no contest`);

  hero.innerHTML = `
    <div class="score-names">Numerology Win Rate</div>
    <div class="score-big ${scoreClass(stats.overallWinPct)}">${stats.overallWinPct}<span class="score-out-of">%</span></div>
    <div class="pm-breakdown-hint">${stats.winsCount} of ${stats.resolvedCount} resolved real-edge picks correct${extras.length ? ` &middot; ${extras.join(' &middot; ')}` : ''}</div>
  `;
}

function tennisMeterRow(label, pct, count, wins) {
  const known = pct != null;
  return `
    <div class="breakdown-header"><span>${label}</span><span>${known ? `${pct}% (${wins}/${count})` : 'No data yet'}</span></div>
    <div class="meter"><div class="meter-fill" style="width:${known ? pct : 0}%"></div></div>
  `;
}

function renderTennisBreakdown(stats) {
  document.getElementById('tennisStatsBreakdown').innerHTML = `
    ${tennisMeterRow('✅ When numerology agreed with the favorite', stats.favoriteWinPct, stats.favoriteCount, stats.favoriteWinsCount)}
    ${tennisMeterRow('⚡ When numerology picked the underdog', stats.underdogWinPct, stats.underdogCount, stats.underdogWinsCount)}
  `;
}

function renderTennisEdgeTiers(predictions) {
  const tiers = computeEdgeTierStats(predictions);
  document.getElementById('tennisStatsEdgeTiers').innerHTML = tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function renderTennisPriceBuckets(predictions) {
  const buckets = computeBucketStats(predictions);
  document.getElementById('tennisStatsPriceBuckets').innerHTML = buckets.map((b) => `
    <tr>
      <td>${b.label}</td>
      <td>${b.count}</td>
      <td>${b.winPct != null && b.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(b.winPct)}">${b.winPct}%</span>`
        : `<span class="empty-state">${b.count ? 'Not enough data yet' : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function tennisResultBadge(p) {
  if (!p.result) return '<span class="pm-countdown-badge">⏳ Pending</span>';
  if (p.result.draw) return '<span class="coming-soon-tag">🤝 No Contest</span>';
  return isCorrectPick(p) ? '<span class="score-inline good">✅ Won</span>' : '<span class="score-inline bad">❌ Lost</span>';
}

function formatTennisMatchDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function tennisEdgeCell(p) {
  const gap = edgeGap(p);
  const tier = edgeTierForGap(gap);
  if (tier.key === 'none') return `<span class="empty-state">⚖️ Tossup (+${gap})</span>`;
  return `${tier.icon} ${tier.label.replace(' Edge', '')} (+${gap})`;
}

function renderTennisTable(predictions) {
  const tbody = document.getElementById('tennisStatsTableBody');
  if (!predictions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No matches tracked yet.</td></tr>';
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.matchTime) - new Date(a.matchTime));
  tbody.innerHTML = sorted.map((p) => `
    <tr data-condition-id="${p.conditionId}">
      <td>${formatTennisMatchDate(p.matchTime)}</td>
      <td>${escapeHtml(p.playerAName)} vs ${escapeHtml(p.playerBName)}</td>
      <td>${escapeHtml(p.numerologyFavorite)}</td>
      <td>${tennisEdgeCell(p)}</td>
      <td>${p.pickType === 'favorite' ? 'Favorite' : 'Underdog'}</td>
      <td>${tennisResultBadge(p)}</td>
    </tr>
  `).join('');
}

function formatTennisOdds(price) {
  return price != null ? `${Math.round(price * 100)}%` : '—';
}

function tennisMatchupModalHtml(p) {
  const agree = p.pickType === 'favorite';
  const gap = edgeGap(p);
  const tier = edgeTierForGap(gap);

  const signalHtml = tier.key === 'none'
    ? `⚖️ Tossup (${p.numerologyScoreA} vs ${p.numerologyScoreB}) &mdash; no real numerology edge, excluded from the headline win rate`
    : agree
      ? `✅ ${tier.icon} ${tier.label} &mdash; numerology agreed with the market favorite (${escapeHtml(p.marketFavorite)})`
      : `⚡ ${tier.icon} ${tier.label} &mdash; numerology favored ${escapeHtml(p.numerologyFavorite)} while the market favored ${escapeHtml(p.marketFavorite)} &mdash; possible value on ${escapeHtml(p.numerologyFavorite)}`;

  const resultRow = p.result
    ? `<div class="breakdown-row"><span>Result</span><span>${tennisResultBadge(p)}</span></div>`
    : '';

  return `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(p.playerAName)} <span class="score-vs">&times;</span> ${escapeHtml(p.playerBName)}</div>
    </div>
    <div class="pm-breakdown-hint" style="text-align:center;">${escapeHtml(p.eventTitle)} &middot; ${formatTennisMatchDate(p.matchTime)}</div>
    <div class="pm-breakdown-grid">
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">${escapeHtml(p.playerAName)}</div>
        <div class="pm-breakdown-row"><span>🔢 Numerology</span><span class="score-inline ${scoreClass(p.numerologyScoreA)}">${p.numerologyScoreA}</span></div>
        <div class="pm-breakdown-row"><span>📊 Market Odds</span><span>${formatTennisOdds(p.marketPriceA)}</span></div>
      </div>
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">${escapeHtml(p.playerBName)}</div>
        <div class="pm-breakdown-row"><span>🔢 Numerology</span><span class="score-inline ${scoreClass(p.numerologyScoreB)}">${p.numerologyScoreB}</span></div>
        <div class="pm-breakdown-row"><span>📊 Market Odds</span><span>${formatTennisOdds(p.marketPriceB)}</span></div>
      </div>
    </div>
    <div class="pm-signal ${tier.key === 'none' ? 'neutral' : (agree ? 'agree' : 'disagree')}">${signalHtml}</div>
    ${resultRow ? `<div class="breakdown-rows">${resultRow}</div>` : ''}
  `;
}

function initTennisMatchupModal() {
  document.getElementById('tennisStatsTableBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-condition-id]');
    if (!row) return;
    const p = currentTennisPredictions.find((x) => x.conditionId === row.dataset.conditionId);
    if (!p) return;
    document.getElementById('tennisStatsMatchupBody').innerHTML = tennisMatchupModalHtml(p);
    document.getElementById('tennisStatsMatchupOverlay').classList.add('active');
  });

  document.getElementById('tennisStatsMatchupClose').addEventListener('click', () => {
    document.getElementById('tennisStatsMatchupOverlay').classList.remove('active');
  });
  document.getElementById('tennisStatsMatchupOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'tennisStatsMatchupOverlay') document.getElementById('tennisStatsMatchupOverlay').classList.remove('active');
  });
}

async function refreshTennisAndRender() {
  const predictions = await checkTennisResults();
  currentTennisPredictions = predictions;
  const stats = computeTennisStats(predictions);
  renderTennisHero(stats);
  renderTennisBreakdown(stats);
  renderTennisEdgeTiers(predictions);
  renderTennisPriceBuckets(predictions);
  renderTennisTable(predictions);
  document.getElementById('tennisStatsLastUpdated').textContent = `Last checked ${new Date().toLocaleTimeString()}`;
}

document.getElementById('tennisStatsRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('tennisStatsRefreshBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '🔄 Checking…';
  await refreshTennisAndRender();
  btn.textContent = original;
  btn.disabled = false;
});

initTennisMatchupModal();
refreshTennisAndRender();

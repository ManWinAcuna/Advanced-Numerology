const MARKETS_URL = 'https://gamma-api.polymarket.com/markets';

// Kept around so the matchup popup can look a clicked row's full prediction
// back up by conditionId without re-reading localStorage on every click.
let currentPredictions = [];

// The /markets endpoint defaults to closed=false (still-open markets only)
// and silently omits anything that doesn't match - condition_ids alone isn't
// enough, closed=true has to be passed explicitly or every already-resolved
// fight just vanishes from the response instead of coming back resolved.
async function fetchMarketsByConditionIds(ids) {
  if (!ids.length) return [];
  const params = new URLSearchParams({ closed: 'true' });
  ids.forEach((id) => params.append('condition_ids', id));
  try {
    const res = await fetch(`${MARKETS_URL}?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// A resolved moneyline market's outcomePrices collapse to an exact "1"/"0"
// split (verified against a real resolved UFC 300 market) - a draw/no
// contest instead leaves both prices near 0.5, so it's treated as neither a
// win nor a loss rather than corrupting the win rate.
function determineResult(market) {
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

async function checkResults() {
  const predictions = loadUfcPredictions();
  const pending = predictions.filter((p) => !p.result);

  if (pending.length) {
    const markets = await fetchMarketsByConditionIds(pending.map((p) => p.conditionId));
    const byId = new Map(markets.map((m) => [m.conditionId, m]));
    let changed = false;

    predictions.forEach((p) => {
      if (p.result) return;
      const market = byId.get(p.conditionId);
      if (!market) return;
      const result = determineResult(market);
      if (result) {
        p.result = result;
        changed = true;
      }
    });

    if (changed) saveUfcPredictions(predictions);
  }

  return predictions;
}

// isCorrectPick, PRICE_BUCKETS, and computeBucketStats live in db-core.js -
// shared with the Polymarket tracker's risk manager so the two can never
// disagree about what a bucket contains or what counts as a win.

// Headline numbers count only real-edge picks (gap >= REAL_EDGE_MIN_GAP,
// db-core.js) - a 70-vs-71 tossup was never a pick, and its coin-flip
// outcome would dilute whatever real signal exists. Tossups are still
// counted separately (tossupResolvedCount) so the hero can say how many
// were excluded, and the edge-tier table below tracks their ~50/50-ness.
function computeStats(predictions) {
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

function renderHero(stats) {
  const hero = document.getElementById('statsHero');

  if (stats.total === 0) {
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">No fights tracked yet &mdash; open the Polymarket UFC tracker and set a fight location to start building a track record.</div>
    `;
    return;
  }

  if (stats.resolvedCount === 0) {
    // Distinguish "nothing has finished yet" from "things finished, but
    // every one of them was a tossup" - the second case has data, it just
    // isn't headline-worthy data.
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">${stats.tossupResolvedCount
        ? `Only tossups (no real edge) have resolved so far (${stats.tossupResolvedCount}) &mdash; see the edge-strength table below.`
        : `${stats.total} fight${stats.total === 1 ? '' : 's'} tracked, none resolved yet. Check back after they finish.`}</div>
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

function meterRow(label, pct, count, wins) {
  const known = pct != null;
  return `
    <div class="breakdown-header"><span>${label}</span><span>${known ? `${pct}% (${wins}/${count})` : 'No data yet'}</span></div>
    <div class="meter"><div class="meter-fill" style="width:${known ? pct : 0}%"></div></div>
  `;
}

function renderBreakdown(stats) {
  document.getElementById('statsBreakdown').innerHTML = `
    ${meterRow('✅ When numerology agreed with the favorite', stats.favoriteWinPct, stats.favoriteCount, stats.favoriteWinsCount)}
    ${meterRow('⚡ When numerology picked the underdog', stats.underdogWinPct, stats.underdogCount, stats.underdogWinsCount)}
  `;
}

// The direct empirical test of the whole hypothesis: if numerology works,
// win rate should climb as the score gap widens - and the tossup row
// should sit near 50%, which is its own sanity check. computeEdgeTierStats
// lives in db-core.js, shared with stats-tennis.js.
function renderEdgeTiers(predictions) {
  const tiers = computeEdgeTierStats(predictions);
  document.getElementById('statsEdgeTiers').innerHTML = tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

// Finer-grained companion to the favorite/underdog meters above - the same
// idea, bucketed by the actual market price of the pick instead of just
// which side of the line it fell on. Feeds the Polymarket tracker's risk
// manager, which looks up the bucket for a live fight's price here.
function renderPriceBuckets(predictions) {
  const buckets = computeBucketStats(predictions);
  document.getElementById('statsPriceBuckets').innerHTML = buckets.map((b) => `
    <tr>
      <td>${b.label}</td>
      <td>${b.count}</td>
      <td>${b.winPct != null && b.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(b.winPct)}">${b.winPct}%</span>`
        : `<span class="empty-state">${b.count ? 'Not enough data yet' : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function resultBadge(p) {
  if (!p.result) return '<span class="pm-countdown-badge">⏳ Pending</span>';
  if (p.result.draw) return '<span class="coming-soon-tag">🤝 No Contest</span>';
  return isCorrectPick(p) ? '<span class="score-inline good">✅ Won</span>' : '<span class="score-inline bad">❌ Lost</span>';
}

function formatFightDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function edgeCell(p) {
  const gap = edgeGap(p);
  const tier = edgeTierForGap(gap);
  if (tier.key === 'none') return `<span class="empty-state">⚖️ Tossup (+${gap})</span>`;
  return `${tier.icon} ${tier.label.replace(' Edge', '')} (+${gap})`;
}

function renderTable(predictions) {
  const tbody = document.getElementById('statsTableBody');
  if (!predictions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No fights tracked yet.</td></tr>';
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.fightTime) - new Date(a.fightTime));
  tbody.innerHTML = sorted.map((p) => `
    <tr data-condition-id="${p.conditionId}">
      <td>${formatFightDate(p.fightTime)}</td>
      <td>${escapeHtml(p.fighterAName)} vs ${escapeHtml(p.fighterBName)}</td>
      <td>${escapeHtml(p.numerologyFavorite)}</td>
      <td>${edgeCell(p)}</td>
      <td>${p.pickType === 'favorite' ? 'Favorite' : 'Underdog'}</td>
      <td>${resultBadge(p)}</td>
    </tr>
  `).join('');
}

function formatOdds(price) {
  return price != null ? `${Math.round(price * 100)}%` : '—';
}

// Everything shown here was already captured on the Polymarket tracker the
// moment the fight's edge was first displayed (recordPredictionIfNew in
// polymarket-ufc.js) - this just replays it, it's not fetched fresh.
function matchupModalHtml(p) {
  const agree = p.pickType === 'favorite';
  const gap = edgeGap(p);
  const tier = edgeTierForGap(gap);

  const signalHtml = tier.key === 'none'
    ? `⚖️ Tossup (${p.numerologyScoreA} vs ${p.numerologyScoreB}) &mdash; no real numerology edge, excluded from the headline win rate`
    : agree
      ? `✅ ${tier.icon} ${tier.label} &mdash; numerology agreed with the market favorite (${escapeHtml(p.marketFavorite)})`
      : `⚡ ${tier.icon} ${tier.label} &mdash; numerology favored ${escapeHtml(p.numerologyFavorite)} while the market favored ${escapeHtml(p.marketFavorite)} &mdash; possible value on ${escapeHtml(p.numerologyFavorite)}`;

  const resultRow = p.result
    ? `<div class="breakdown-row"><span>Result</span><span>${resultBadge(p)}</span></div>`
    : '';

  return `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(p.fighterAName)} <span class="score-vs">&times;</span> ${escapeHtml(p.fighterBName)}</div>
    </div>
    <div class="pm-breakdown-hint" style="text-align:center;">${escapeHtml(p.eventTitle)} &middot; ${formatFightDate(p.fightTime)}</div>
    <div class="pm-breakdown-grid">
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">${escapeHtml(p.fighterAName)}</div>
        <div class="pm-breakdown-row"><span>🔢 Numerology</span><span class="score-inline ${scoreClass(p.numerologyScoreA)}">${p.numerologyScoreA}</span></div>
        <div class="pm-breakdown-row"><span>📊 Market Odds</span><span>${formatOdds(p.marketPriceA)}</span></div>
      </div>
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">${escapeHtml(p.fighterBName)}</div>
        <div class="pm-breakdown-row"><span>🔢 Numerology</span><span class="score-inline ${scoreClass(p.numerologyScoreB)}">${p.numerologyScoreB}</span></div>
        <div class="pm-breakdown-row"><span>📊 Market Odds</span><span>${formatOdds(p.marketPriceB)}</span></div>
      </div>
    </div>
    <div class="pm-signal ${tier.key === 'none' ? 'neutral' : (agree ? 'agree' : 'disagree')}">${signalHtml}</div>
    ${resultRow ? `<div class="breakdown-rows">${resultRow}</div>` : ''}
  `;
}

function initMatchupModal() {
  document.getElementById('statsTableBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-condition-id]');
    if (!row) return;
    const p = currentPredictions.find((x) => x.conditionId === row.dataset.conditionId);
    if (!p) return;
    document.getElementById('statsMatchupBody').innerHTML = matchupModalHtml(p);
    document.getElementById('statsMatchupOverlay').classList.add('active');
  });

  document.getElementById('statsMatchupClose').addEventListener('click', () => {
    document.getElementById('statsMatchupOverlay').classList.remove('active');
  });
  document.getElementById('statsMatchupOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'statsMatchupOverlay') document.getElementById('statsMatchupOverlay').classList.remove('active');
  });
}

async function refreshAndRender() {
  const predictions = await checkResults();
  currentPredictions = predictions;
  const stats = computeStats(predictions);
  renderHero(stats);
  renderBreakdown(stats);
  renderEdgeTiers(predictions);
  renderPriceBuckets(predictions);
  renderTable(predictions);
  document.getElementById('statsLastUpdated').textContent = `Last checked ${new Date().toLocaleTimeString()}`;
}

document.getElementById('statsRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('statsRefreshBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '🔄 Checking…';
  await refreshAndRender();
  btn.textContent = original;
  btn.disabled = false;
});

initMatchupModal();
refreshAndRender();

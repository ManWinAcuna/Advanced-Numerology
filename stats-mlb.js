// MLB counterpart of stats-ufc.js/stats-tennis.js - every top-level name here
// is Mlb-prefixed since all three files load together on stats.html (same
// convention stats-tennis.js already uses to avoid colliding with stats-ufc.js).
// Two differences from the other two sports: resolution comes from MLB's own
// live feed (gamePk), not a Polymarket condition_id, since the final score is
// already known with certainty straight from MLB - no need to wait on
// Polymarket's own market-closing lag. And there's a second, independent
// panel below for the pitcher-strikeout research signal (not a bet - see
// MLB_PITCHER_K_SIGNALS_KEY in db-core.js).

let currentMlbPredictions = [];

// Resolves via MLB's own boxscore/live feed instead of Polymarket - the
// final score is the ground truth here, not a market closing.
async function checkMlbResults() {
  const predictions = loadMlbPredictions();
  const pending = predictions.filter((p) => !p.result && p.gamePk);

  if (pending.length) {
    const feeds = await Promise.all(pending.map((p) => fetchGameLiveFeed(p.gamePk)));
    let changed = false;

    pending.forEach((p, i) => {
      const feed = feeds[i];
      if (!feed || feed.abstractGameState !== 'Final') return;

      const runsForName = (name) => {
        if (normalizeName(feed.home.teamName) === normalizeName(name)) return feed.home.runs;
        if (normalizeName(feed.away.teamName) === normalizeName(name)) return feed.away.runs;
        return null;
      };
      const runsA = runsForName(p.teamAName);
      const runsB = runsForName(p.teamBName);
      if (!Number.isFinite(runsA) || !Number.isFinite(runsB)) return;

      p.result = runsA === runsB
        ? { winner: null, draw: true, resolvedAt: Date.now() }
        : { winner: runsA > runsB ? p.teamAName : p.teamBName, draw: false, resolvedAt: Date.now() };
      changed = true;
    });

    if (changed) saveMlbPredictions(predictions);
  }

  return predictions;
}

// isCorrectPick, hasRealEdge, PRICE_BUCKETS, computeBucketStats, edgeGap, and
// edgeTierForGap live in db-core.js, shared across all three sports' Stats
// pages and the Polymarket trackers' risk managers.
function computeMlbStats(predictions) {
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

function renderMlbHero(stats) {
  const hero = document.getElementById('mlbStatsHero');

  if (stats.total === 0) {
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">No games tracked yet &mdash; open the MLB Polymarket tracker once a slate's lineups are posted to start building a track record.</div>
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
    <div class="score-big ${scoreClass(stats.overallWinPct)}">${stats.overallWinPct}<span class="score-out-of">%</span></div>
    <div class="pm-breakdown-hint">${stats.winsCount} of ${stats.resolvedCount} resolved real-edge picks correct${extras.length ? ` &middot; ${extras.join(' &middot; ')}` : ''}</div>
  `;
}

function mlbMeterRow(label, pct, count, wins) {
  const known = pct != null;
  return `
    <div class="breakdown-header"><span>${label}</span><span>${known ? `${pct}% (${wins}/${count})` : 'No data yet'}</span></div>
    <div class="meter"><div class="meter-fill" style="width:${known ? pct : 0}%"></div></div>
  `;
}

function renderMlbBreakdown(stats) {
  document.getElementById('mlbStatsBreakdown').innerHTML = `
    ${mlbMeterRow('✅ When numerology agreed with the favorite', stats.favoriteWinPct, stats.favoriteCount, stats.favoriteWinsCount)}
    ${mlbMeterRow('⚡ When numerology picked the underdog', stats.underdogWinPct, stats.underdogCount, stats.underdogWinsCount)}
  `;
}

function renderMlbEdgeTiers(predictions) {
  const tiers = computeEdgeTierStats(predictions);
  document.getElementById('mlbStatsEdgeTiers').innerHTML = tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function renderMlbPriceBuckets(predictions) {
  const buckets = computeBucketStats(predictions);
  document.getElementById('mlbStatsPriceBuckets').innerHTML = buckets.map((b) => `
    <tr>
      <td>${b.label}</td>
      <td>${b.count}</td>
      <td>${b.winPct != null && b.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(b.winPct)}">${b.winPct}%</span>`
        : `<span class="empty-state">${b.count ? 'Not enough data yet' : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function mlbResultBadge(p) {
  if (!p.result) return '<span class="pm-countdown-badge">⏳ Pending</span>';
  if (p.result.draw) return '<span class="coming-soon-tag">🤝 Tie</span>';
  return isCorrectPick(p) ? '<span class="score-inline good">✅ Won</span>' : '<span class="score-inline bad">❌ Lost</span>';
}

function formatMlbGameDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function mlbEdgeCell(p) {
  const gap = edgeGap(p);
  const tier = edgeTierForGap(gap);
  if (tier.key === 'none') return `<span class="empty-state">⚖️ Tossup (+${gap})</span>`;
  return `${tier.icon} ${tier.label.replace(' Edge', '')} (+${gap})`;
}

function renderMlbTable(predictions) {
  const tbody = document.getElementById('mlbStatsTableBody');
  if (!predictions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No games tracked yet.</td></tr>';
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.gameTime) - new Date(a.gameTime));
  tbody.innerHTML = sorted.map((p) => `
    <tr data-condition-id="${p.conditionId}">
      <td>${formatMlbGameDate(p.gameTime)}</td>
      <td>${escapeHtml(p.teamAName)} vs ${escapeHtml(p.teamBName)}</td>
      <td>${escapeHtml(p.numerologyFavorite)}</td>
      <td>${mlbEdgeCell(p)}</td>
      <td>${p.pickType === 'favorite' ? 'Favorite' : 'Underdog'}</td>
      <td>${mlbResultBadge(p)}</td>
    </tr>
  `).join('');
}

function formatMlbOdds(price) {
  return price != null ? `${Math.round(price * 100)}%` : '—';
}

function mlbMatchupModalHtml(p) {
  const agree = p.pickType === 'favorite';
  const gap = edgeGap(p);
  const tier = edgeTierForGap(gap);

  const signalHtml = tier.key === 'none'
    ? `⚖️ Tossup (${p.numerologyScoreA} vs ${p.numerologyScoreB}) &mdash; no real numerology edge, excluded from the headline win rate`
    : agree
      ? `✅ ${tier.icon} ${tier.label} &mdash; numerology agreed with the market favorite (${escapeHtml(p.marketFavorite)})`
      : `⚡ ${tier.icon} ${tier.label} &mdash; numerology favored ${escapeHtml(p.numerologyFavorite)} while the market favored ${escapeHtml(p.marketFavorite)} &mdash; possible value on ${escapeHtml(p.numerologyFavorite)}`;

  const resultRow = p.result
    ? `<div class="breakdown-row"><span>Result</span><span>${mlbResultBadge(p)}</span></div>`
    : '';

  return `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(p.teamAName)} <span class="score-vs">&times;</span> ${escapeHtml(p.teamBName)}</div>
    </div>
    <div class="pm-breakdown-hint" style="text-align:center;">${escapeHtml(p.eventTitle)} &middot; ${formatMlbGameDate(p.gameTime)}</div>
    <div class="pm-breakdown-grid">
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">${escapeHtml(p.teamAName)}</div>
        <div class="pm-breakdown-row"><span>🔢 Numerology</span><span class="score-inline ${scoreClass(p.numerologyScoreA)}">${p.numerologyScoreA}</span></div>
        <div class="pm-breakdown-row"><span>📊 Market Odds</span><span>${formatMlbOdds(p.marketPriceA)}</span></div>
      </div>
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">${escapeHtml(p.teamBName)}</div>
        <div class="pm-breakdown-row"><span>🔢 Numerology</span><span class="score-inline ${scoreClass(p.numerologyScoreB)}">${p.numerologyScoreB}</span></div>
        <div class="pm-breakdown-row"><span>📊 Market Odds</span><span>${formatMlbOdds(p.marketPriceB)}</span></div>
      </div>
    </div>
    <div class="pm-signal ${tier.key === 'none' ? 'neutral' : (agree ? 'agree' : 'disagree')}">${signalHtml}</div>
    ${resultRow ? `<div class="breakdown-rows">${resultRow}</div>` : ''}
  `;
}

function initMlbMatchupModal() {
  document.getElementById('mlbStatsTableBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-condition-id]');
    if (!row) return;
    const p = currentMlbPredictions.find((x) => x.conditionId === row.dataset.conditionId);
    if (!p) return;
    document.getElementById('mlbStatsMatchupBody').innerHTML = mlbMatchupModalHtml(p);
    document.getElementById('mlbStatsMatchupOverlay').classList.add('active');
  });

  document.getElementById('mlbStatsMatchupClose').addEventListener('click', () => {
    document.getElementById('mlbStatsMatchupOverlay').classList.remove('active');
  });
  document.getElementById('mlbStatsMatchupOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'mlbStatsMatchupOverlay') document.getElementById('mlbStatsMatchupOverlay').classList.remove('active');
  });
}

/* ===================== Pitcher strikeout research signal ===================== */
// Resolved off the same live feed, matching by pitcherId against whichever
// side actually started him (a probable pitcher occasionally changes before
// first pitch - the signal was recorded against whoever was probable at the
// time, same "locked in when first seen" rule as everything else here).
async function checkMlbKSignals() {
  const signals = loadMlbPitcherKSignals();
  const pending = signals.filter((s) => !s.result && s.gamePk);

  if (pending.length) {
    const uniqueGamePks = [...new Set(pending.map((s) => s.gamePk))];
    const feeds = await Promise.all(uniqueGamePks.map((pk) => fetchGameLiveFeed(pk)));
    const feedByGamePk = new Map(uniqueGamePks.map((pk, i) => [pk, feeds[i]]));
    let changed = false;

    pending.forEach((s) => {
      const feed = feedByGamePk.get(s.gamePk);
      if (!feed || feed.abstractGameState !== 'Final') return;
      const side = [feed.home, feed.away].find((sd) => sd.startingPitcherId === s.pitcherId);
      if (!side || side.startingPitcherStrikeouts == null) return;

      s.actualKs = side.startingPitcherStrikeouts;
      const actualDirection = s.actualKs > s.seasonAvgKsAtPickTime ? 'over' : (s.actualKs < s.seasonAvgKsAtPickTime ? 'under' : 'push');
      s.result = {
        actualDirection,
        correct: s.predictedDirection !== 'neutral' ? s.predictedDirection === actualDirection : null,
        resolvedAt: Date.now(),
      };
      changed = true;
    });

    if (changed) saveMlbPitcherKSignals(signals);
  }

  return signals;
}

function computeKSignalStats(signals) {
  const resolved = signals.filter((s) => s.result);
  const predicted = resolved.filter((s) => s.predictedDirection !== 'neutral');
  const correct = predicted.filter((s) => s.result.correct);
  return {
    total: signals.length,
    resolvedCount: resolved.length,
    neutralResolvedCount: resolved.length - predicted.length,
    predictedCount: predicted.length,
    correctCount: correct.length,
    hitPct: predicted.length ? Math.round((correct.length / predicted.length) * 100) : null,
  };
}

function renderMlbKSignalPanel(signals) {
  const stats = computeKSignalStats(signals);
  const headline = stats.predictedCount
    ? `
      <div class="score-hero">
        <div class="score-names">Hit Rate &mdash; Hot/Cold Day Score vs. Own Season Average</div>
        <div class="score-big ${scoreClass(stats.hitPct)}">${stats.hitPct}<span class="score-out-of">%</span></div>
        <div class="pm-breakdown-hint">${stats.correctCount} of ${stats.predictedCount} resolved starts correct &middot; ${stats.neutralResolvedCount} neutral (no prediction) &middot; ${stats.total - stats.resolvedCount} pending</div>
      </div>
    `
    : `<div class="empty-state">${stats.total ? "No hot/cold-day starts resolved yet - check back once a pitcher with a real day score (≥60 or ≤40) has taken the mound." : 'No starts tracked yet - open the MLB Polymarket tracker to start recording probable pitchers.'}</div>`;

  const sorted = [...signals].sort((a, b) => new Date(b.gameTime) - new Date(a.gameTime));
  const rows = sorted.map((s) => {
    const dirLabel = s.predictedDirection === 'over' ? '🔥 Predicted Over' : (s.predictedDirection === 'under' ? '🧊 Predicted Under' : '➖ Neutral');
    const baseline = s.seasonAvgKsAtPickTime.toFixed(1);
    const resultLabel = !s.result
      ? '<span class="pm-countdown-badge">⏳ Pending</span>'
      : s.predictedDirection === 'neutral'
        ? `<span class="empty-state">${s.actualKs} K (baseline ${baseline})</span>`
        : s.result.correct
          ? `<span class="score-inline good">✅ ${s.actualKs} K (baseline ${baseline})</span>`
          : `<span class="score-inline bad">❌ ${s.actualKs} K (baseline ${baseline})</span>`;
    return `
      <tr>
        <td>${formatMlbGameDate(s.gameTime)}</td>
        <td>${escapeHtml(s.pitcherName)} (${escapeHtml(s.teamName)})</td>
        <td>${dirLabel} (${s.dayScore})</td>
        <td>${resultLabel}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('mlbKSignalBody').innerHTML = `
    ${headline}
    <div class="pm-table-scroll">
      <table class="astro-table">
        <thead><tr><th>Date</th><th>Pitcher</th><th>Day Score / Prediction</th><th>Result</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="empty-state">No starts tracked yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

async function refreshAndRenderMlb() {
  const predictions = await checkMlbResults();
  currentMlbPredictions = predictions;
  const stats = computeMlbStats(predictions);
  renderMlbHero(stats);
  renderMlbBreakdown(stats);
  renderMlbEdgeTiers(predictions);
  renderMlbPriceBuckets(predictions);
  renderMlbTable(predictions);
  document.getElementById('mlbStatsLastUpdated').textContent = `Last checked ${new Date().toLocaleTimeString()}`;

  const signals = await checkMlbKSignals();
  renderMlbKSignalPanel(signals);
}

document.getElementById('mlbStatsRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('mlbStatsRefreshBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '🔄 Checking…';
  await refreshAndRenderMlb();
  btn.textContent = original;
  btn.disabled = false;
});

initMlbMatchupModal();
refreshAndRenderMlb();

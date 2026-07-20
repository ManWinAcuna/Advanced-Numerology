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
let currentMlbKSignals = [];

function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, (m || 1) - 1, d || 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

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

// isCorrectPick, PRICE_BUCKETS, computeBucketStats, edgeGap live in db-core.js,
// shared across all three sports. The edge-tier calls here use the MLB-tuned
// variants (hasRealEdgeMlb / edgeTierForGapMlb / computeEdgeTierStatsMlb,
// MLB_REAL_EDGE_MIN_GAP) rather than the one-on-one UFC/Tennis bands - a team
// composite's gap distribution is far tighter, so it needs its own cutoffs.
function computeMlbStats(predictions) {
  const resolvedAll = predictions.filter((p) => p.result && !p.result.draw);
  const resolved = resolvedAll.filter(hasRealEdgeMlb);
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

// suffix is '' for the Today scope's DOM ids, 'Old' for Old Data's - both
// scopes render through the exact same functions against a pre-filtered
// subset of the same underlying predictions/signals arrays (see
// isMlbTodayLocal/refreshAndRenderMlb below), rather than keeping two
// separate copies of this rendering logic.
function renderMlbHero(stats, suffix = '') {
  const hero = document.getElementById('mlbStatsHero' + suffix);

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

function renderMlbBreakdown(stats, suffix = '') {
  document.getElementById('mlbStatsBreakdown' + suffix).innerHTML = `
    ${mlbMeterRow('✅ When numerology agreed with the favorite', stats.favoriteWinPct, stats.favoriteCount, stats.favoriteWinsCount)}
    ${mlbMeterRow('⚡ When numerology picked the underdog', stats.underdogWinPct, stats.underdogCount, stats.underdogWinsCount)}
  `;
}

function renderMlbEdgeTiers(predictions, suffix = '') {
  const tiers = computeEdgeTierStatsMlb(predictions);
  document.getElementById('mlbStatsEdgeTiers' + suffix).innerHTML = tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function renderMlbPriceBuckets(predictions, suffix = '') {
  const buckets = computeBucketStats(predictions, MLB_REAL_EDGE_MIN_GAP);
  document.getElementById('mlbStatsPriceBuckets' + suffix).innerHTML = buckets.map((b) => `
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
  const tier = edgeTierForGapMlb(gap);
  if (tier.key === 'none') return `<span class="empty-state">⚖️ Tossup (+${gap})</span>`;
  return `${tier.icon} ${tier.label.replace(' Edge', '')} (+${gap})`;
}

// A today game that isn't a scored pick yet (lineup not posted / venue still
// resolving) - shown as a plain non-clickable row so the Today tab reflects the
// whole slate, not just the games already scored. Only the Today scope passes
// these in.
function mlbPendingRowHtml(g) {
  const label = {
    lineup: '⏳ Lineup not posted yet',
    venue: '⏳ Resolving venue',
    pending: '⏳ Awaiting data',
  }[g.status] || '⏳ Pending';
  return `
    <tr>
      <td>${formatMlbGameDate(g.gameStartTime.toISOString())}</td>
      <td>${escapeHtml(g.teamAName)} vs ${escapeHtml(g.teamBName)}</td>
      <td class="empty-state" colspan="4">${label}</td>
    </tr>
  `;
}

function renderMlbTable(predictions, suffix = '', pendingGames = []) {
  const tbody = document.getElementById('mlbStatsTableBody' + suffix);
  const pendingHtml = pendingGames.map(mlbPendingRowHtml).join('');
  if (!predictions.length && !pendingHtml) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No games tracked yet.</td></tr>';
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.gameTime) - new Date(a.gameTime));
  tbody.innerHTML = pendingHtml + sorted.map((p) => `
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

// The stored prediction only ever kept team NAMES and the game's gamePk, not
// individual roster ids, so the Insight tab re-derives the full roster live
// from MLB's own boxscore via the same teamRosterInsightRows() (db-core.js)
// the live tracker's Insight tab uses. Box scores stay queryable long after
// a game ends, so this works for historical predictions too, not just
// pending ones - same "ask live, never store a roster" philosophy as
// fetchPitcherVsLineupDetail() below.
async function fetchMlbMatchupInsightRows(p) {
  if (!p.gamePk) return null;
  const feed = await fetchGameLiveFeed(p.gamePk);
  if (!feed) return null;

  const season = new Date(p.gameTime).getFullYear();
  const [managerHome, managerAway] = await Promise.all([
    fetchTeamManager(feed.home.teamId, season),
    fetchTeamManager(feed.away.teamId, season),
  ]);
  const allIds = [
    feed.home.startingPitcherId, feed.away.startingPitcherId,
    ...feed.home.batters.map((b) => b.id), ...feed.away.batters.map((b) => b.id),
    managerHome && managerHome.id, managerAway && managerAway.id,
  ];
  const birthdates = await fetchPeopleBirthdates(allIds);

  const sideFor = (teamName) => (normalizeName(feed.home.teamName) === normalizeName(teamName)
    ? { side: feed.home, manager: managerHome }
    : { side: feed.away, manager: managerAway });
  const a = sideFor(p.teamAName);
  const b = sideFor(p.teamBName);
  // Universal Day - each roster person's own life path vs. the game date
  // itself, shown as an extra "Day N" tag per row. p.gameTime is stored in
  // UTC without the original venue timezone, so (like UFC/Tennis's stats
  // re-derivation) this reads it in the browser's own local time - a
  // reasonable approximation for a historical, informational-only read.
  const matchDate = p.gameTime ? new Date(p.gameTime) : null;

  return {
    rowsA: teamRosterInsightRows(a.side, a.manager, birthdates, matchDate),
    rowsB: teamRosterInsightRows(b.side, b.manager, birthdates, matchDate),
  };
}

function mlbInsightTabHtml(p, rows, loading) {
  if (loading) return '<div class="pm-unmatched">Loading roster insight&hellip;</div>';
  if (!rows) return '<div class="pm-unmatched">Roster data isn\'t available for this game anymore.</div>';
  return `
    <div class="pm-insight-grid">
      <div class="pm-insight-person">
        <div class="pm-breakdown-name">${escapeHtml(p.teamAName)}</div>
        ${rows.rowsA.map(insightRowHtml).join('') || '<div class="empty-state">No roster data.</div>'}
      </div>
      <div class="pm-insight-person">
        <div class="pm-breakdown-name">${escapeHtml(p.teamBName)}</div>
        ${rows.rowsB.map(insightRowHtml).join('') || '<div class="empty-state">No roster data.</div>'}
      </div>
    </div>
    <div class="pm-insight-disclaimer">Research-based read on each life path's tendencies &mdash; informational only.</div>
  `;
}

function mlbMatchupModalHtml(p) {
  const agree = p.pickType === 'favorite';
  const gap = edgeGap(p);
  const tier = edgeTierForGapMlb(gap);

  const signalHtml = tier.key === 'none'
    ? `⚖️ Tossup (${p.numerologyScoreA} vs ${p.numerologyScoreB}) &mdash; no real numerology edge, excluded from the headline win rate`
    : agree
      ? `✅ ${tier.icon} ${tier.label} &mdash; numerology agreed with the market favorite (${escapeHtml(p.marketFavorite)})`
      : `⚡ ${tier.icon} ${tier.label} &mdash; numerology favored ${escapeHtml(p.numerologyFavorite)} while the market favored ${escapeHtml(p.marketFavorite)} &mdash; possible value on ${escapeHtml(p.numerologyFavorite)}`;

  const resultRow = p.result
    ? `<div class="breakdown-row"><span>Result</span><span>${mlbResultBadge(p)}</span></div>`
    : '';

  const hero = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(p.teamAName)} <span class="score-vs">&times;</span> ${escapeHtml(p.teamBName)}</div>
    </div>
    <div class="pm-breakdown-hint" style="text-align:center;">${escapeHtml(p.eventTitle)} &middot; ${formatMlbGameDate(p.gameTime)}</div>
  `;
  const breakdown = `
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
  // Insight tab starts in its loading state - initMlbMatchupModal() fetches
  // the real roster afterward and patches just that page's innerHTML in,
  // so switching tabs mid-fetch doesn't get reset back to Breakdown.
  return hero + modalTabsHtml(breakdown, mlbInsightTabHtml(p, null, true));
}

function initMlbMatchupModal(suffix = '') {
  document.getElementById('mlbStatsTableBody' + suffix).addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-condition-id]');
    if (!row) return;
    const p = currentMlbPredictions.find((x) => x.conditionId === row.dataset.conditionId);
    if (!p) return;
    document.getElementById('mlbStatsMatchupBody' + suffix).innerHTML = mlbMatchupModalHtml(p);
    document.getElementById('mlbStatsMatchupOverlay' + suffix).classList.add('active');

    const rows = await fetchMlbMatchupInsightRows(p);
    const insightPage = document.querySelector('#mlbStatsMatchupBody' + suffix + ' [data-page="insight"]');
    if (insightPage) insightPage.innerHTML = mlbInsightTabHtml(p, rows, false);
  });

  document.getElementById('mlbStatsMatchupClose' + suffix).addEventListener('click', () => {
    document.getElementById('mlbStatsMatchupOverlay' + suffix).classList.remove('active');
  });
  document.getElementById('mlbStatsMatchupOverlay' + suffix).addEventListener('click', (e) => {
    if (e.target.id === 'mlbStatsMatchupOverlay' + suffix) document.getElementById('mlbStatsMatchupOverlay' + suffix).classList.remove('active');
  });
  initModalTabSwitcher('mlbStatsMatchupBody' + suffix);
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
      if (!side) {
        // The probable pitcher recorded at pick time never actually started -
        // a real pre-game scratch/rotation change. The box score is final and
        // still doesn't show him, so this would never resolve on its own;
        // mark it void instead of leaving it stuck on "Pending" forever.
        s.result = { scratched: true, resolvedAt: Date.now() };
        changed = true;
        return;
      }
      if (side.startingPitcherStrikeouts == null) return;

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
  const resolved = signals.filter((s) => s.result && !s.result.scratched);
  const predicted = resolved.filter((s) => s.predictedDirection !== 'neutral');
  const correct = predicted.filter((s) => s.result.correct);
  const scratchedCount = signals.filter((s) => s.result && s.result.scratched).length;
  return {
    total: signals.length,
    resolvedCount: resolved.length,
    neutralResolvedCount: resolved.length - predicted.length,
    predictedCount: predicted.length,
    correctCount: correct.length,
    hitPct: predicted.length ? Math.round((correct.length / predicted.length) * 100) : null,
    scratchedCount,
  };
}

// Hit rate per strength tier - the same idea as the game-pick edge-tier table,
// but for the strikeout signal: if a high day score really is a signal, a
// "Strong Over" should hit more often than a "Slight Over." Strength is
// derived live from the stored dayScore (mlbKSignalTier in db-core.js), so it
// reclassifies every past start automatically if the bands are ever retuned,
// rather than freezing whatever tier applied when it was recorded. Only the two
// directional sides are shown (neutral starts make no prediction to grade).
function computeKSignalTierStats(signals) {
  const resolved = signals.filter((s) => s.result && !s.result.scratched && s.predictedDirection !== 'neutral');
  return MLB_K_SIGNAL_TIERS.filter((t) => t.direction !== 'neutral').map((tier) => {
    const inTier = resolved.filter((s) => mlbKSignalTier(s.dayScore).key === tier.key);
    const correct = inTier.filter((s) => s.result.correct);
    return {
      key: tier.key,
      label: tier.label,
      icon: tier.icon,
      count: inTier.length,
      correct: correct.length,
      hitPct: inTier.length ? Math.round((correct.length / inTier.length) * 100) : null,
    };
  });
}

function renderMlbKSignalPanel(signals, suffix = '') {
  const stats = computeKSignalStats(signals);
  const headline = stats.predictedCount
    ? `
      <div class="score-hero">
        <div class="score-names">Hit Rate &mdash; Hot/Cold Day Score vs. Own Season Average</div>
        <div class="score-big ${scoreClass(stats.hitPct)}">${stats.hitPct}<span class="score-out-of">%</span></div>
        <div class="pm-breakdown-hint">${stats.correctCount} of ${stats.predictedCount} resolved starts correct &middot; ${stats.neutralResolvedCount} neutral (no prediction) &middot; ${stats.total - stats.resolvedCount - stats.scratchedCount} pending${stats.scratchedCount ? ` &middot; ${stats.scratchedCount} scratched before first pitch` : ''}</div>
      </div>
    `
    : `<div class="empty-state">${stats.total ? "No hot/cold-day starts resolved yet - check back once a pitcher with a real day score (≥60 or ≤40) has taken the mound." : 'No starts tracked yet - open the MLB Polymarket tracker to start recording probable pitchers.'}</div>`;

  const tierStats = computeKSignalTierStats(signals);
  const tierRows = tierStats.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.hitPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${scoreClass(t.hitPct)}">${t.hitPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.correct}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
  const tierTable = stats.predictedCount ? `
    <div class="box" style="margin-top:16px;">
      <div class="box-label">Hit Rate by Signal Strength</div>
      <div class="mode-desc">A 61 and a 95 are both "over," but only one is a strong call &mdash; if the day score means anything, the hit rate should climb from Slight to Strong. Day scores sit high by nature, so the Under tiers fill slowly.</div>
      <div class="pm-table-scroll">
        <table class="astro-table">
          <thead><tr><th>Signal Strength</th><th>Starts</th><th>Hit Rate</th></tr></thead>
          <tbody>${tierRows}</tbody>
        </table>
      </div>
    </div>
  ` : '';

  const sorted = [...signals].sort((a, b) => new Date(b.gameTime) - new Date(a.gameTime));
  const rows = sorted.map((s) => {
    const dirLabel = s.predictedDirection === 'neutral' ? '➖ Neutral' : (() => {
      const tier = mlbKSignalTier(s.dayScore);
      return `${tier.icon} ${tier.label}`;
    })();
    const baseline = s.seasonAvgKsAtPickTime.toFixed(1);
    const resultLabel = !s.result
      ? '<span class="pm-countdown-badge">⏳ Pending</span>'
      : s.result.scratched
        ? '<span class="empty-state">🚫 Scratched before first pitch</span>'
        : s.predictedDirection === 'neutral'
        ? `<span class="empty-state">${s.actualKs} K (baseline ${baseline})</span>`
        : s.result.correct
          ? `<span class="score-inline good">✅ ${s.actualKs} K (baseline ${baseline})</span>`
          : `<span class="score-inline bad">❌ ${s.actualKs} K (baseline ${baseline})</span>`;
    return `
      <tr data-game-pk="${s.gamePk}" data-pitcher-id="${s.pitcherId}">
        <td>${formatMlbGameDate(s.gameTime)}</td>
        <td>${escapeHtml(s.pitcherName)} (${escapeHtml(s.teamName)})</td>
        <td>${dirLabel} (${s.dayScore})</td>
        <td>${resultLabel}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('mlbKSignalBody' + suffix).innerHTML = `
    ${headline}
    ${tierTable}
    <div class="pm-table-scroll" style="margin-top:16px;">
      <table class="astro-table">
        <thead><tr><th>Date</th><th>Pitcher</th><th>Signal (Day Score)</th><th>Result</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="empty-state">No starts tracked yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

// The K-signal record only ever stored the pitcher's own day score and
// season baseline (everything it needs to grade itself) - the pitcher-vs-
// opposing-lineup breakdown was never persisted, so it's fetched fresh from
// MLB's live feed on click, same data source (and same pitcherVsLineupBreakdown
// formula in db-core.js) the live tracker uses for its own matchup factor.
async function fetchPitcherVsLineupDetail(s) {
  const feed = await fetchGameLiveFeed(s.gamePk);
  if (!feed) return null;
  const pitcherSide = [feed.home, feed.away].find((sd) => sd.startingPitcherId === s.pitcherId);
  if (!pitcherSide) return null;
  const opposingSide = pitcherSide === feed.home ? feed.away : feed.home;
  if (!opposingSide.batters.length) return null; // lineup not posted yet

  const birthdates = await fetchPeopleBirthdates([s.pitcherId, ...opposingSide.batters.map((b) => b.id)]);
  const pitcherBd = birthdates.get(s.pitcherId);
  if (!pitcherBd || !pitcherBd.birthDate) return null;

  const batters = opposingSide.batters
    .map((b) => {
      const bd = birthdates.get(b.id);
      return bd && bd.birthDate ? { name: bd.name, pos: b.pos, dobDate: parseDateInput(bd.birthDate) } : null;
    })
    .filter(Boolean);
  const rows = pitcherVsLineupBreakdown(parseDateInput(pitcherBd.birthDate), batters);
  if (!rows.length) return null;

  const avg = Math.round(rows.reduce((sum, r) => sum + r.combined, 0) / rows.length);
  return { opposingTeamName: opposingSide.teamName, rows, avg };
}

function mlbKSignalModalHtml(s, detail, loading) {
  const dirLabel = s.predictedDirection === 'neutral' ? '➖ Neutral' : `${mlbKSignalTier(s.dayScore).icon} ${mlbKSignalTier(s.dayScore).label}`;
  const baseline = s.seasonAvgKsAtPickTime.toFixed(1);
  const actualRow = !s.result
    ? `<div class="pm-breakdown-row"><span>This Game</span><span class="pm-countdown-badge">⏳ Pending</span></div>`
    : s.result.scratched
      ? `<div class="pm-breakdown-row"><span>This Game</span><span class="empty-state">🚫 Scratched before first pitch</span></div>`
      : `<div class="pm-breakdown-row"><span>This Game</span><span class="score-inline ${s.result.correct === false ? 'bad' : (s.result.correct ? 'good' : '')}">${s.actualKs} K</span></div>`;

  let lineupHtml;
  if (loading) {
    lineupHtml = '<div class="pm-unmatched" style="margin-top:12px;">Loading pitcher-vs-batters breakdown&hellip;</div>';
  } else if (s.result && s.result.scratched) {
    lineupHtml = '<div class="pm-unmatched" style="margin-top:12px;">This pitcher never actually started the game &mdash; scratched before first pitch, so there\'s no real matchup to show.</div>';
  } else if (detail) {
    lineupHtml = `
      <div class="pm-breakdown-col" style="margin-top:12px;">
        <div class="pm-breakdown-name">vs ${escapeHtml(detail.opposingTeamName)} Lineup</div>
        ${detail.rows.map((r) => `<div class="pm-breakdown-row"><span>${escapeHtml(r.pos)} ${escapeHtml(r.name)}</span><span class="score-inline ${scoreClass(r.combined)}">${r.combined}</span></div>`).join('')}
        <div class="pm-breakdown-row pm-breakdown-total"><span>Lineup Avg</span><span class="score-inline ${scoreClass(detail.avg)}">${detail.avg}</span></div>
      </div>
    `;
  } else {
    lineupHtml = '<div class="pm-unmatched" style="margin-top:12px;">⏳ Lineups not posted yet &mdash; check back closer to first pitch to see the pitcher-vs-batters breakdown.</div>';
  }

  return `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(s.pitcherName)}</div>
      <div class="pm-breakdown-hint">${escapeHtml(s.teamName)} &middot; ${formatMlbGameDate(s.gameTime)}</div>
    </div>
    <div class="pm-breakdown-grid">
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">Day Score</div>
        <div class="pm-breakdown-row"><span>🔢 Numerology</span><span class="score-inline ${scoreClass(s.dayScore)}">${s.dayScore}</span></div>
        <div class="pm-breakdown-row"><span>Prediction</span><span>${dirLabel}</span></div>
      </div>
      <div class="pm-breakdown-col">
        <div class="pm-breakdown-name">Strikeouts</div>
        <div class="pm-breakdown-row"><span>Season Avg</span><span>${baseline} K/start</span></div>
        ${actualRow}
      </div>
    </div>
    ${lineupHtml}
  `;
}

function initMlbKSignalModal(suffix = '') {
  document.getElementById('mlbKSignalBody' + suffix).addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-game-pk]');
    if (!row) return;
    const gamePk = Number(row.dataset.gamePk);
    const pitcherId = Number(row.dataset.pitcherId);
    const s = currentMlbKSignals.find((x) => x.gamePk === gamePk && x.pitcherId === pitcherId);
    if (!s) return;

    document.getElementById('mlbKSignalModalBody' + suffix).innerHTML = mlbKSignalModalHtml(s, null, true);
    document.getElementById('mlbKSignalModalOverlay' + suffix).classList.add('active');

    const detail = await fetchPitcherVsLineupDetail(s);
    document.getElementById('mlbKSignalModalBody' + suffix).innerHTML = mlbKSignalModalHtml(s, detail, false);
  });

  document.getElementById('mlbKSignalModalClose' + suffix).addEventListener('click', () => {
    document.getElementById('mlbKSignalModalOverlay' + suffix).classList.remove('active');
  });
  document.getElementById('mlbKSignalModalOverlay' + suffix).addEventListener('click', (e) => {
    if (e.target.id === 'mlbKSignalModalOverlay' + suffix) document.getElementById('mlbKSignalModalOverlay' + suffix).classList.remove('active');
  });
}

// Today is whatever falls on today's calendar date in the viewer's own local
// time (same convention formatMlbGameDate already renders with) - Old Data is
// everything else. This is a pure filter over the one underlying array, not
// a separate store, so a game recorded today simply reads as Old Data once
// local midnight passes on a later visit - no timer, no explicit rollover.
function isMlbTodayLocal(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// The whole point of the component storage: test each part of the team score
// on its own. For a component, "favors" the team with the higher score on that
// axis; the edge is how much that pick beats (or trails) the market-implied
// win rate. A component with a persistently positive edge is one the composite
// should lean on more; a negative one is dead weight or noise. The full
// composite is included as the baseline to beat. All measured on the same set
// of games (those carrying component data) for an apples-to-apples read.
function computeComponentSignalStats(predictions) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw && p.components && p.components.A && p.components.B);
  const priceOf = (p, name) => (normalizeName(p.teamAName) === normalizeName(name) ? p.marketPriceA : p.marketPriceB);

  // Beat-the-market read for one "picker" over an arbitrary game list: for each
  // game it favors the team it scores higher, then compares how often that team
  // won to how often the market said they would.
  const statOver = (list, scoreAOf, scoreBOf) => {
    const picks = list
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
    const edge = (winPct != null && marketPct != null) ? winPct - marketPct : null;
    return { count: n, wins, winPct, marketPct, edge };
  };
  const statFor = (scoreAOf, scoreBOf) => statOver(resolved, scoreAOf, scoreBOf);
  const v2A = (p) => mlbCompositeFromComponents(p.components.A, MLB_ROLE_WEIGHTS_V2);
  const v2B = (p) => mlbCompositeFromComponents(p.components.B, MLB_ROLE_WEIGHTS_V2);

  const rows = MLB_COMPONENT_KEYS.map((key) => ({
    key,
    label: MLB_COMPONENT_LABELS[key],
    ...statFor((p) => p.components.A[key], (p) => p.components.B[key]),
  }));
  rows.push({
    key: 'reweighted',
    label: MLB_COMPONENT_LABELS.reweighted,
    ...statFor(v2A, v2B),
  });
  rows.push({
    key: 'composite',
    label: MLB_COMPONENT_LABELS.composite,
    ...statFor((p) => p.numerologyScoreA, (p) => p.numerologyScoreB),
  });

  rows.sort((a, b) => (b.edge == null ? -Infinity : b.edge) - (a.edge == null ? -Infinity : a.edge));

  // The honest test of the V2 weights: games played AFTER those weights were
  // fixed, which had no hand in choosing them. Grows over time; starts empty
  // since the backfill only reaches yesterday. The cutoff is noon UTC, not
  // midnight, because gameTime is UTC and a night game spills past midnight
  // into the next UTC day - no MLB game starts between ~04:00 and ~17:00 UTC,
  // so noon cleanly separates one day's night games from the next day's,
  // keeping yesterday's late games in-sample where they belong.
  const oosCutoff = MLB_V2_SINCE + 'T12:00:00.000Z';
  const oosList = resolved.filter((p) => p.gameTime >= oosCutoff);
  const v2OutOfSample = statOver(oosList, v2A, v2B);

  return { rows, v2OutOfSample };
}

function renderMlbComponentSignal(predictions, suffix = '') {
  const el = document.getElementById('mlbComponentSignal' + suffix);
  if (!el) return;
  const { rows, v2OutOfSample } = computeComponentSignalStats(predictions);
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (!maxCount) {
    el.innerHTML = '<div class="empty-state">No resolved games with component data yet &mdash; run the backfill (or wait for tracked games to finish) to populate this.</div>';
    return;
  }
  const rowMarker = { composite: '🎯 ', reweighted: '⚡ ' };
  const body = rows.map((r) => {
    const isModel = r.key === 'composite' || r.key === 'reweighted';
    const edgeCell = (r.edge != null && r.count >= MIN_BUCKET_SAMPLE)
      ? `<span class="score-inline ${r.edge > 0 ? 'good' : (r.edge < 0 ? 'bad' : '')}">${r.edge > 0 ? '+' : ''}${r.edge}</span>`
      : `<span class="empty-state">${r.count ? 'thin' : '—'}</span>`;
    return `
      <tr${isModel ? ' style="border-top:2px solid var(--border);"' : ''}>
        <td>${rowMarker[r.key] || ''}${escapeHtml(r.label)}</td>
        <td>${r.count}</td>
        <td>${r.winPct != null ? `${r.winPct}%` : '—'}</td>
        <td>${r.marketPct != null ? `${r.marketPct}%` : '—'}</td>
        <td>${edgeCell}</td>
      </tr>
    `;
  }).join('');

  // The V2 row's edge above is in-sample (its weights were chosen from these
  // very games), so it's optimistic. This line is the number that actually
  // matters - V2 measured only on games played since the weights were fixed.
  const oos = v2OutOfSample;
  const oosLine = oos.count >= MIN_BUCKET_SAMPLE
    ? `⚡ <b>Reweighted V2, out-of-sample</b> (games since ${MLB_V2_SINCE}): <span class="score-inline ${oos.edge > 0 ? 'good' : (oos.edge < 0 ? 'bad' : '')}">${oos.winPct}% vs ${oos.marketPct}% market (${oos.edge > 0 ? '+' : ''}${oos.edge})</span> over ${oos.count} games. This is the real test &mdash; the in-sample edge above was fit to the past.`
    : `⚡ <b>Reweighted V2</b> leans on the components above (Manager &amp; Pitcher up, Catcher &amp; Batters down). Its edge in the table is <b>in-sample</b> &mdash; those weights were picked from this same data, so treat it as optimistic. The honest test is out-of-sample: <b>${oos.count} games</b> played since ${MLB_V2_SINCE} so far. Watch that number as new games resolve.`;

  el.innerHTML = `
    <table class="astro-table">
      <thead><tr><th>Signal</th><th>Games</th><th>Win%</th><th>Market%</th><th>Edge</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="mode-desc" style="margin-top:10px;">${oosLine}</div>
  `;
}

function renderMlbScope(suffix, predictions, signals) {
  const isOld = suffix === 'Old';
  const scopedPredictions = predictions.filter((p) => isMlbTodayLocal(p.gameTime) === !isOld);
  const stats = computeMlbStats(scopedPredictions);
  renderMlbHero(stats, suffix);
  renderMlbBreakdown(stats, suffix);
  renderMlbEdgeTiers(scopedPredictions, suffix);
  renderMlbPriceBuckets(scopedPredictions, suffix);
  renderMlbComponentSignal(scopedPredictions, suffix);
  renderMlbTable(scopedPredictions, suffix, isOld ? [] : todaysMlbSlatePending);
  document.getElementById('mlbStatsLastUpdated' + suffix).textContent = `Last checked ${new Date().toLocaleTimeString()}`;

  const scopedSignals = signals.filter((s) => isMlbTodayLocal(s.gameTime) === !isOld);
  renderMlbKSignalPanel(scopedSignals, suffix);
}

// Today's games the Stats page has fetched but can't score into a pick yet
// (lineup not posted, venue unresolved) - shown as pending rows on the Today
// tab. Rebuilt each time recordTodaysMlbGames runs.
let todaysMlbSlatePending = [];

// So the Today tab reflects today's whole slate without needing the live
// tracker open: pull today's OPEN Polymarket markets (same source the live
// tracker uses), and for any today game not already stored, score it if its
// lineup is up (recording a real pick at the current market price) or list it
// as pending otherwise. A game already recorded (here or by the live tracker)
// is skipped - dedup by conditionId. Best-effort and non-blocking: the stored
// data renders first, this fills in behind it. Finished games that were never
// recorded drop off the open-market feed and are instead caught by the daily
// backfill.
async function recordTodaysMlbGames() {
  todaysMlbSlatePending = [];
  let markets = [];
  try { markets = await fetchMlbMoneylineEvents(); } catch (e) { return; }
  const todays = markets.filter((m) => isMlbTodayLocal(m.gameStartTime.toISOString()));
  if (!todays.length) return;

  const now = new Date();
  const scheduleGames = await fetchMlbSchedule(isoDateOnlyUTC(new Date(now.getTime() - 86400000)), isoDateOnlyUTC(new Date(now.getTime() + 86400000)));

  const existing = loadMlbPredictions();
  const existingCond = new Set(existing.map((p) => p.conditionId));
  const teamInfoCache = new Map();
  const managerCache = new Map();
  const regionCache = new Map();
  const stadiumCache = new Map();
  const newPreds = [];
  const pending = [];

  await Promise.all(todays.map(async (m) => {
    if (existingCond.has(m.conditionId)) return; // already a stored pick

    const sched = findScheduleGameForMarket(scheduleGames, m.teamAName, m.teamBName, m.gameStartTime);
    if (!sched) { pending.push({ ...m, status: 'pending' }); return; }
    const gamePk = sched.gamePk;

    const feed = await fetchGameLiveFeed(gamePk);
    if (!feed) { pending.push({ ...m, status: 'pending' }); return; }
    if (feed.home.batters.length !== 9 || feed.away.batters.length !== 9) { pending.push({ ...m, status: 'lineup' }); return; }

    const venueId = feed.venue && feed.venue.id;
    const venueName = feed.venue && feed.venue.name;
    if (!venueId) { pending.push({ ...m, status: 'venue' }); return; }
    let regionInfo = regionCache.get(venueId);
    if (!regionInfo) { regionInfo = await resolveMlbRegionForBackfill(venueId, venueName); regionCache.set(venueId, regionInfo); }
    if (!regionInfo.region) { pending.push({ ...m, status: 'venue' }); return; }
    let stadiumFounded = stadiumCache.get(venueId);
    if (stadiumFounded === undefined) { stadiumFounded = await resolveMlbStadiumFoundedForBackfill(venueId, venueName); stadiumCache.set(venueId, stadiumFounded); }

    if (!currentMlbMatchDateISO({ regionMode: regionInfo.regionMode, region: regionInfo.region, gameStartTime: m.gameStartTime })) { pending.push({ ...m, status: 'venue' }); return; }

    const season = now.getFullYear();
    await Promise.all([feed.home.teamId, feed.away.teamId].map(async (id) => {
      if (!teamInfoCache.has(id)) teamInfoCache.set(id, await fetchTeamInfo(id));
      if (!managerCache.has(id)) managerCache.set(id, await fetchTeamManager(id, season));
    }));
    const allIds = [
      feed.home.startingPitcherId, feed.away.startingPitcherId,
      ...feed.home.batters.map((b) => b.id), ...feed.away.batters.map((b) => b.id),
      managerCache.get(feed.home.teamId) && managerCache.get(feed.home.teamId).id,
      managerCache.get(feed.away.teamId) && managerCache.get(feed.away.teamId).id,
    ];
    const birthdates = await fetchPeopleBirthdates(allIds);

    const sideForName = (name) => (normalizeName(feed.home.teamName) === normalizeName(name) ? feed.home : feed.away);
    const gObj = {
      sideA: sideForName(m.teamAName), sideB: sideForName(m.teamBName),
      teamInfoA: teamInfoCache.get(sideForName(m.teamAName).teamId), teamInfoB: teamInfoCache.get(sideForName(m.teamBName).teamId),
      managerA: managerCache.get(sideForName(m.teamAName).teamId), managerB: managerCache.get(sideForName(m.teamBName).teamId),
      birthdates, region: regionInfo.region, regionMode: regionInfo.regionMode, stadiumFounded, gameStartTime: m.gameStartTime,
    };
    const scoreA = computeTeamComposite(gObj, 'A');
    const scoreB = computeTeamComposite(gObj, 'B');
    if (!scoreA || !scoreB || m.priceA == null || m.priceB == null) { pending.push({ ...m, status: 'pending' }); return; }

    const marketFavName = m.priceA >= m.priceB ? m.teamAName : m.teamBName;
    const numFavName = scoreA.combined >= scoreB.combined ? m.teamAName : m.teamBName;
    const agree = normalizeName(marketFavName) === normalizeName(numFavName);
    const rA = sideForName(m.teamAName).runs;
    const rB = sideForName(m.teamBName).runs;
    const result = (feed.abstractGameState === 'Final' && Number.isFinite(rA) && Number.isFinite(rB))
      ? (rA === rB ? { winner: null, draw: true, resolvedAt: Date.now() } : { winner: rA > rB ? m.teamAName : m.teamBName, draw: false, resolvedAt: Date.now() })
      : null;

    newPreds.push({
      conditionId: m.conditionId, gamePk,
      teamAName: m.teamAName, teamBName: m.teamBName,
      numerologyFavorite: numFavName, numerologyScoreA: scoreA.combined, numerologyScoreB: scoreB.combined,
      components: { A: extractComponents(scoreA.parts), B: extractComponents(scoreB.parts) },
      marketFavorite: marketFavName, marketPriceA: m.priceA, marketPriceB: m.priceB,
      pickType: agree ? 'favorite' : 'underdog',
      eventTitle: m.eventTitle, gameTime: m.gameStartTime.toISOString(),
      recordedAt: Date.now(), result,
    });
    existingCond.add(m.conditionId);
  }));

  if (newPreds.length) saveMlbPredictions([...existing, ...newPreds]);
  // Sort pending soonest-first for display.
  todaysMlbSlatePending = pending.sort((a, b) => a.gameStartTime - b.gameStartTime);
}

// The companion to recordTodaysMlbGames. That pass fills the Today tab from
// OPEN markets, but a game that has already finished has a CLOSED market and is
// gone from the open-market feed - so without this, today's completed games
// would be invisible on Today until tomorrow's backfill swept them into Old
// Data, which is exactly why the Today tab only showed the one game that
// happened to be caught live. This reconstructs each finished game the same way
// the backfill does (closed-market slug lookup + CLOB price history + box-score
// resolution), for BOTH the Game Picks and Strikeout Signal halves, so "today's
// worth of games" is complete the moment each one ends. Best-effort, non-
// blocking, and dedups against anything already stored so nothing double-counts.
async function recordTodaysFinishedMlbGames() {
  const now = new Date();
  const scheduleGames = await fetchMlbSchedule(
    isoDateOnlyUTC(new Date(now.getTime() - 86400000)),
    isoDateOnlyUTC(new Date(now.getTime() + 86400000)),
  );
  const todaysFinal = scheduleGames.filter(
    (g) => g.status.abstractGameState === 'Final' && isMlbTodayLocal(g.gameDate),
  );
  if (!todaysFinal.length) return;

  // Doubleheader guard for the Game Picks half only (Polymarket's slug has no
  // game-number suffix, so game 1 vs 2 can't be told apart); the Strikeout half
  // still processes both games, since it needs no market match.
  const dhSeen = new Set();
  const dhKeys = new Set();
  todaysFinal.forEach((g) => {
    const key = [g.teams.away.team.id, g.teams.home.team.id].sort().join('-');
    if (dhSeen.has(key)) dhKeys.add(key);
    dhSeen.add(key);
  });

  const existingPreds = loadMlbPredictions();
  const existingByGamePk = new Map(existingPreds.filter((p) => p.gamePk != null).map((p) => [p.gamePk, p]));
  const existingSignals = loadMlbPitcherKSignals();
  const existingSignalKeys = new Set(existingSignals.map((s) => `${s.gamePk}|${s.pitcherId}`));
  const signalCountByGamePk = new Map();
  existingSignals.forEach((s) => signalCountByGamePk.set(s.gamePk, (signalCountByGamePk.get(s.gamePk) || 0) + 1));

  const teamInfoCache = new Map();
  const managerCache = new Map();
  const regionCache = new Map();
  const stadiumCache = new Map();
  const newPreds = [];
  const newSignals = [];
  let patchedCount = 0; // existing componentless picks upgraded in place

  async function processFinal(g) {
    const gamePk = g.gamePk;
    // Skip before fetching the feed only if there's nothing left to add: an
    // existing pick that ALREADY has components, plus both starters' signals.
    // A componentless pick still needs patching (that's exactly the case that
    // left today's games out of the component table), so it must not skip here.
    const stored = existingByGamePk.get(gamePk);
    const pickComplete = stored && stored.components;
    if (pickComplete && (signalCountByGamePk.get(gamePk) || 0) >= 2) return;

    const date = g.officialDate;
    const feed = await fetchGameLiveFeed(gamePk);
    if (!feed || feed.abstractGameState !== 'Final') return;
    if (feed.home.batters.length !== 9 || feed.away.batters.length !== 9) return;

    const venueId = feed.venue && feed.venue.id;
    const venueName = feed.venue && feed.venue.name;
    if (!venueId) return;
    let regionInfo = regionCache.get(venueId);
    if (!regionInfo) { regionInfo = await resolveMlbRegionForBackfill(venueId, venueName); regionCache.set(venueId, regionInfo); }
    if (!regionInfo.region) return;
    let stadiumFounded = stadiumCache.get(venueId);
    if (stadiumFounded === undefined) { stadiumFounded = await resolveMlbStadiumFoundedForBackfill(venueId, venueName); stadiumCache.set(venueId, stadiumFounded); }

    const matchDateISO = currentMlbMatchDateISO({ regionMode: regionInfo.regionMode, region: regionInfo.region, gameStartTime: new Date(g.gameDate) });
    if (!matchDateISO) return;
    const matchDate = parseDateInput(matchDateISO);

    const season = new Date(g.gameDate).getFullYear();
    await Promise.all([feed.home.teamId, feed.away.teamId].map(async (id) => {
      if (!teamInfoCache.has(id)) teamInfoCache.set(id, await fetchTeamInfo(id));
      if (!managerCache.has(id)) managerCache.set(id, await fetchTeamManager(id, season));
    }));
    const allIds = [
      feed.home.startingPitcherId, feed.away.startingPitcherId,
      ...feed.home.batters.map((b) => b.id), ...feed.away.batters.map((b) => b.id),
      managerCache.get(feed.home.teamId) && managerCache.get(feed.home.teamId).id,
      managerCache.get(feed.away.teamId) && managerCache.get(feed.away.teamId).id,
    ];
    const birthdates = await fetchPeopleBirthdates(allIds);
    const sideForName = (name) => (normalizeName(feed.home.teamName) === normalizeName(name) ? feed.home : feed.away);

    // ---- Game Picks half ----
    // Reuse the same per-side scoring for both the patch and create paths.
    const buildGObj = (aName, bName) => ({
      sideA: sideForName(aName), sideB: sideForName(bName),
      teamInfoA: teamInfoCache.get(sideForName(aName).teamId), teamInfoB: teamInfoCache.get(sideForName(bName).teamId),
      managerA: managerCache.get(sideForName(aName).teamId), managerB: managerCache.get(sideForName(bName).teamId),
      birthdates, region: regionInfo.region, regionMode: regionInfo.regionMode, stadiumFounded, gameStartTime: new Date(g.gameDate),
    });
    const dhKey = [feed.home.teamId, feed.away.teamId].sort().join('-');
    // Skip only a pick that's already complete (has components). A componentless
    // pick gets patched in place with its OWN A/B naming (same in-place upgrade
    // the backfill does, but the backfill never reaches today); if nothing's
    // stored yet, a fresh pick is built from the closed market.
    if (!stored || !stored.components) {
      if (stored) {
        const scoreA = computeTeamComposite(buildGObj(stored.teamAName, stored.teamBName), 'A');
        const scoreB = computeTeamComposite(buildGObj(stored.teamAName, stored.teamBName), 'B');
        if (scoreA && scoreB) {
          stored.components = { A: extractComponents(scoreA.parts), B: extractComponents(scoreB.parts) };
          patchedCount++;
        }
      } else if (!dhKeys.has(dhKey)) {
        const event = await fetchMlbMoneylineEventForGame(g.teams.away.team.abbreviation, g.teams.home.team.abbreviation, date);
        if (event) {
          const scoreA = computeTeamComposite(buildGObj(event.teamAName, event.teamBName), 'A');
          const scoreB = computeTeamComposite(buildGObj(event.teamAName, event.teamBName), 'B');
          if (scoreA && scoreB) {
            const targetTs = Math.floor(event.gameStartTime.getTime() / 1000);
            const [priceA, priceB] = await Promise.all([
              fetchClobPriceNear(event.clobTokenIdA, targetTs),
              fetchClobPriceNear(event.clobTokenIdB, targetTs),
            ]);
            if (priceA != null && priceB != null) {
              const marketFavName = priceA >= priceB ? event.teamAName : event.teamBName;
              const numFavName = scoreA.combined >= scoreB.combined ? event.teamAName : event.teamBName;
              const agree = normalizeName(marketFavName) === normalizeName(numFavName);
              const rA = sideForName(event.teamAName).runs;
              const rB = sideForName(event.teamBName).runs;
              const result = (!Number.isFinite(rA) || !Number.isFinite(rB))
                ? null
                : rA === rB
                  ? { winner: null, draw: true, resolvedAt: Date.now() }
                  : { winner: rA > rB ? event.teamAName : event.teamBName, draw: false, resolvedAt: Date.now() };
              const rec = {
                conditionId: event.conditionId, gamePk,
                teamAName: event.teamAName, teamBName: event.teamBName,
                numerologyFavorite: numFavName, numerologyScoreA: scoreA.combined, numerologyScoreB: scoreB.combined,
                components: { A: extractComponents(scoreA.parts), B: extractComponents(scoreB.parts) },
                marketFavorite: marketFavName, marketPriceA: priceA, marketPriceB: priceB,
                pickType: agree ? 'favorite' : 'underdog',
                eventTitle: event.eventTitle, gameTime: event.gameStartTime.toISOString(),
                recordedAt: Date.now(), result,
              };
              newPreds.push(rec);
              existingByGamePk.set(gamePk, rec);
            }
          }
        }
      }
    }

    // ---- Strikeout Signal half - no market match needed ----
    for (const side of [feed.home, feed.away]) {
      if (!side.startingPitcherId) continue;
      const key = `${gamePk}|${side.startingPitcherId}`;
      if (existingSignalKeys.has(key)) continue;
      const bd = birthdates.get(side.startingPitcherId);
      if (!bd || !bd.birthDate || side.startingPitcherStrikeouts == null) continue;
      const baseline = await fetchMlbGameLogBeforeDate(side.startingPitcherId, season, date);
      if (!baseline) continue;
      const dayScore = computeCompatibility(parseDateInput(bd.birthDate), matchDate, sportsNumerologyCompat).finalScore;
      const predictedDirection = dayScore >= 60 ? 'over' : (dayScore <= 40 ? 'under' : 'neutral');
      const actualKs = side.startingPitcherStrikeouts;
      const actualDirection = actualKs > baseline.strikeoutsPerStart ? 'over' : (actualKs < baseline.strikeoutsPerStart ? 'under' : 'push');
      newSignals.push({
        gamePk, pitcherId: side.startingPitcherId, pitcherName: bd.name, teamName: side.teamName,
        gameTime: new Date(g.gameDate).toISOString(),
        dayScore, predictedDirection, seasonAvgKsAtPickTime: baseline.strikeoutsPerStart,
        recordedAt: Date.now(), actualKs,
        result: { actualDirection, correct: predictedDirection !== 'neutral' ? predictedDirection === actualDirection : null, resolvedAt: Date.now() },
      });
      existingSignalKeys.add(key);
    }
  }

  for (let i = 0; i < todaysFinal.length; i += MLB_BACKFILL_CHUNK) {
    const chunk = todaysFinal.slice(i, i + MLB_BACKFILL_CHUNK);
    await Promise.all(chunk.map((g) => processFinal(g).catch(() => {})));
  }

  // existingPreds holds any patched records in place (mutated), so persist when
  // there's a new pick OR an in-place component patch.
  if (newPreds.length || patchedCount) saveMlbPredictions([...existingPreds, ...newPreds]);
  if (newSignals.length) saveMlbPitcherKSignals([...existingSignals, ...newSignals]);
}

async function refreshAndRenderMlb() {
  const predictions = await checkMlbResults();
  currentMlbPredictions = predictions;
  const signals = await checkMlbKSignals();
  currentMlbKSignals = signals;

  renderMlbScope('', predictions, signals);
  renderMlbScope('Old', predictions, signals);

  // Fill today's slate behind the first render, then re-render Today with any
  // newly-scored picks + pending rows. Best-effort - never blocks the page.
  // Pass 1 pulls today's OPEN markets (live/upcoming games); pass 2 reconstructs
  // today's already-FINISHED games, whose markets have closed and dropped off
  // that feed - together they give the Today tab the whole day, not just games
  // caught mid-flight.
  try {
    await recordTodaysMlbGames();
    await recordTodaysFinishedMlbGames();
    const preds2 = loadMlbPredictions();
    const sigs2 = loadMlbPitcherKSignals();
    currentMlbPredictions = preds2;
    currentMlbKSignals = sigs2;
    renderMlbScope('', preds2, sigs2);
  } catch (e) { /* today-slate fill is best-effort */ }
}

function wireMlbRefreshButton(btnId) {
  document.getElementById(btnId).addEventListener('click', async () => {
    const btn = document.getElementById(btnId);
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '🔄 Checking…';
    await refreshAndRenderMlb();
    btn.textContent = original;
    btn.disabled = false;
  });
}

wireMlbRefreshButton('mlbStatsRefreshBtn');
wireMlbRefreshButton('mlbStatsRefreshBtnOld');

/* ===================== Historical backfill (MLB only) ===================== */
// Old Data doesn't have to start empty and wait weeks for the live tracker to
// build a track record one game at a time - MLB's own box scores and
// Polymarket's CLOB price history both stay queryable long after a game
// closes (confirmed live during planning), so already-played games can be
// scored and resolved directly. This never touches Today (only walks up to
// yesterday) and never re-processes a game the live tracker already caught
// (dedup by gamePk for predictions, by gamePk+pitcherId for K-signals) - it's
// purely a gap-filler, triggered manually since it's a genuinely heavy job.

const MLB_BACKFILL_LOOKBACK_DAYS = 42; // ~6 weeks - deep enough to start the
// component-signal analysis, shallow enough that every pick (now carrying its
// per-component breakdown) stays under Firebase's ~1MB per-account sync limit.
const MLB_BACKFILL_SCHEMA = 2; // bump when the stored prediction shape changes.
// A stored marker whose schemaVersion doesn't match triggers a one-time full
// re-walk of the whole window instead of an incremental catch-up, so existing
// records get upgraded in place (here: back-filled with per-component scores)
// rather than the marker skipping straight past them.
const MLB_BACKFILL_CHUNK = 5; // games processed concurrently per batch - a
// full-window rebuild is hundreds of games x several fetches each, far too slow
// one at a time; 5-at-a-time keeps it to a few minutes without hammering the
// upstream APIs.

function isoDateOnlyUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDaysISO(dateISO, days) {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateOnlyUTC(d);
}

// Resolves a venue's region the same way the live tracker's
// ensureVenueLocation/applyVenueLocation do, but awaited directly rather than
// through their fire-and-forget-with-a-re-render-callback design - a
// one-shot backfill has nothing live to re-render, and needs the timezone
// settled before it ever scores anything, not eventually.
async function resolveMlbRegionForBackfill(venueId, venueName) {
  const loc = await fetchVenueLocation(venueId);
  if (!loc) return { regionMode: null, region: null };
  if (loc.country === 'USA' && loc.state) {
    return { regionMode: 'us', region: US_STATES.find((s) => s.name === loc.state) || null };
  }
  const cityName = loc.city || venueName;
  const regions = loadIntlRegions();
  let region = regions.find((r) => normalizeName(r.name) === normalizeName(cityName));
  if (!region) {
    const info = await lookupPlaceFoundingDate(cityName);
    if (!info) return { regionMode: 'intl', region: null };
    region = { id: uid(), name: cityName, founded: info.date };
    const list = loadIntlRegions();
    if (!list.some((r) => normalizeName(r.name) === normalizeName(cityName))) {
      list.push(region);
      saveIntlRegions(list);
    }
  }
  if (!region.timezone) {
    const tz = await lookupTimezoneForPlace(region.name);
    if (tz) {
      region = { ...region, timezone: tz };
      const list = loadIntlRegions();
      const idx = list.findIndex((r) => r.id === region.id);
      if (idx !== -1) { list[idx] = { ...list[idx], timezone: tz }; saveIntlRegions(list); }
    }
  }
  return { regionMode: 'intl', region };
}

async function resolveMlbStadiumFoundedForBackfill(venueId, venueName) {
  const existing = loadMlbVenues().find((v) => v.id === venueId);
  if (existing) return existing.founded;
  const info = await lookupKeyDateByName(venueName);
  if (!info) return null;
  const list = loadMlbVenues();
  if (!list.some((v) => v.id === venueId)) {
    list.push({ id: venueId, name: venueName, founded: info.date });
    saveMlbVenues(list);
  }
  return info.date;
}

async function backfillMlbHistory(onProgress) {
  const todayISO = isoDateOnlyUTC(new Date());
  const state = loadMlbBackfillState();
  // A stored marker only lets us skip ahead if it was written by THIS schema.
  // On a schema bump (e.g. adding per-component scores) we re-walk the whole
  // window once so already-stored records get upgraded in place.
  const schemaCurrent = state && state.schemaVersion === MLB_BACKFILL_SCHEMA;
  const startISO = (schemaCurrent && state.throughDateISO)
    ? addDaysISO(state.throughDateISO, 1)
    : addDaysISO(todayISO, -MLB_BACKFILL_LOOKBACK_DAYS);
  const endISO = addDaysISO(todayISO, -1); // yesterday - today is live-tracked, not backfilled

  if (startISO > endISO) return { gamesProcessed: 0, newPredictionsCount: 0, patchedCount: 0, newSignalsCount: 0, alreadyCurrent: true };

  const scheduleGames = await fetchMlbSchedule(startISO, endISO);
  const byDate = new Map();
  scheduleGames.forEach((g) => {
    if (g.status.abstractGameState !== 'Final') return;
    const list = byDate.get(g.officialDate) || [];
    list.push(g);
    byDate.set(g.officialDate, list);
  });

  // A day with more than one game between the same two teams is a
  // doubleheader - Polymarket's slug has no game-number suffix, so there's
  // no reliable way to tell which game a market belongs to. Skipped for the
  // Game Picks half only; the Strikeout Signal half needs no market match at
  // all, so it still processes every game normally.
  const doubleheaderKeys = new Set();
  byDate.forEach((games, date) => {
    const seen = new Set();
    games.forEach((g) => {
      const key = `${date}|${[g.teams.away.team.id, g.teams.home.team.id].sort().join('-')}`;
      if (seen.has(key)) doubleheaderKeys.add(key);
      seen.add(key);
    });
  });

  const existingPredictions = loadMlbPredictions();
  const existingByGamePk = new Map(existingPredictions.filter((p) => p.gamePk != null).map((p) => [p.gamePk, p]));
  const existingSignals = loadMlbPitcherKSignals();
  const existingSignalKeys = new Set(existingSignals.map((s) => `${s.gamePk}|${s.pitcherId}`));

  const teamInfoCache = new Map();
  const managerCache = new Map();
  const regionCache = new Map();
  const stadiumCache = new Map();

  const newPredictions = [];
  const newSignals = [];
  let patchedCount = 0; // existing records that got their components back-filled in place

  const allGames = [...byDate.entries()].flatMap(([date, games]) => games.map((g) => ({ date, g })));
  const total = allGames.length;
  let processed = 0;
  let lastCheckpoint = Date.now();

  const saveProgress = () => {
    // existingPredictions holds patched records in place (mutated), so spread
    // it whenever there's either a new prediction OR an in-place patch.
    if (newPredictions.length || patchedCount) saveMlbPredictions([...existingPredictions, ...newPredictions]);
    if (newSignals.length) saveMlbPitcherKSignals([...existingSignals, ...newSignals]);
  };

  async function processGame({ date, g }) {
    const gamePk = g.gamePk;
    const feed = await fetchGameLiveFeed(gamePk);
    if (!feed || feed.abstractGameState !== 'Final') return;
    if (feed.home.batters.length !== 9 || feed.away.batters.length !== 9) return; // no full lineup - can't score

    const venueId = feed.venue && feed.venue.id;
    const venueName = feed.venue && feed.venue.name;
    if (!venueId) return; // no venue - can't resolve day/state, don't guess

    let regionInfo = regionCache.get(venueId);
    if (!regionInfo) {
      regionInfo = await resolveMlbRegionForBackfill(venueId, venueName);
      regionCache.set(venueId, regionInfo);
    }
    if (!regionInfo.region) return; // couldn't confirm a region - don't guess

    let stadiumFounded = stadiumCache.get(venueId);
    if (stadiumFounded === undefined) {
      stadiumFounded = await resolveMlbStadiumFoundedForBackfill(venueId, venueName);
      stadiumCache.set(venueId, stadiumFounded);
    }

    const matchDateISO = currentMlbMatchDateISO({ regionMode: regionInfo.regionMode, region: regionInfo.region, gameStartTime: new Date(g.gameDate) });
    if (!matchDateISO) return; // timezone still unconfirmed - don't guess
    const matchDate = parseDateInput(matchDateISO);

    const season = new Date(date).getFullYear();
    const teamIds = [feed.home.teamId, feed.away.teamId];
    await Promise.all(teamIds.map(async (id) => {
      if (!teamInfoCache.has(id)) teamInfoCache.set(id, await fetchTeamInfo(id));
      if (!managerCache.has(id)) managerCache.set(id, await fetchTeamManager(id, season));
    }));

    const allIds = [
      feed.home.startingPitcherId, feed.away.startingPitcherId,
      ...feed.home.batters.map((b) => b.id), ...feed.away.batters.map((b) => b.id),
      managerCache.get(feed.home.teamId) && managerCache.get(feed.home.teamId).id,
      managerCache.get(feed.away.teamId) && managerCache.get(feed.away.teamId).id,
    ];
    const birthdates = await fetchPeopleBirthdates(allIds);

    const sideForName = (name) => (normalizeName(feed.home.teamName) === normalizeName(name) ? feed.home : feed.away);
    const teamInfoForName = (name) => teamInfoCache.get(sideForName(name).teamId);
    const managerForName = (name) => managerCache.get(sideForName(name).teamId);
    // gameStartTime is the real UTC first-pitch instant (not the already-
    // resolved matchDate) so computeTeamComposite's own currentMlbMatchDateISO(g)
    // re-derives the identical matchDateISO from the same real timestamp +
    // region, rather than re-converting an already-local-midnight Date.
    const buildGObj = (aName, bName) => ({
      sideA: sideForName(aName), sideB: sideForName(bName),
      teamInfoA: teamInfoForName(aName), teamInfoB: teamInfoForName(bName),
      managerA: managerForName(aName), managerB: managerForName(bName),
      birthdates, region: regionInfo.region, regionMode: regionInfo.regionMode,
      stadiumFounded, gameStartTime: new Date(g.gameDate),
    });

    // ---- Game Picks half ----
    // Skip entirely only if this game is already stored WITH components. If it
    // lacks components (older record) we recompute to back-fill them in place;
    // if it isn't stored at all, we create it.
    const dhKey = `${date}|${[feed.home.teamId, feed.away.teamId].sort().join('-')}`;
    const existingPred = existingByGamePk.get(gamePk);
    if (!existingPred || !existingPred.components) {
      let teamAName = null;
      let teamBName = null;
      let event = null;
      if (existingPred) {
        // Patching: keep the record's own A/B naming so components line up.
        teamAName = existingPred.teamAName;
        teamBName = existingPred.teamBName;
      } else if (!doubleheaderKeys.has(dhKey)) {
        event = await fetchMlbMoneylineEventForGame(g.teams.away.team.abbreviation, g.teams.home.team.abbreviation, date);
        if (event) { teamAName = event.teamAName; teamBName = event.teamBName; }
      }
      if (teamAName) {
        const scoreA = computeTeamComposite(buildGObj(teamAName, teamBName), 'A');
        const scoreB = computeTeamComposite(buildGObj(teamAName, teamBName), 'B');
        if (scoreA && scoreB) {
          const components = { A: extractComponents(scoreA.parts), B: extractComponents(scoreB.parts) };
          if (existingPred) {
            existingPred.components = components;
            patchedCount++;
          } else if (event) {
            const targetTs = Math.floor(event.gameStartTime.getTime() / 1000);
            const [priceA, priceB] = await Promise.all([
              fetchClobPriceNear(event.clobTokenIdA, targetTs),
              fetchClobPriceNear(event.clobTokenIdB, targetTs),
            ]);
            if (priceA != null && priceB != null) {
              const favA = priceA >= priceB;
              const marketFavName = favA ? event.teamAName : event.teamBName;
              const numFavName = scoreA.combined >= scoreB.combined ? event.teamAName : event.teamBName;
              const agree = normalizeName(marketFavName) === normalizeName(numFavName);
              const runsForName = (name) => sideForName(name).runs;
              const runsA = runsForName(event.teamAName);
              const runsB = runsForName(event.teamBName);
              const result = !Number.isFinite(runsA) || !Number.isFinite(runsB)
                ? null
                : runsA === runsB
                  ? { winner: null, draw: true, resolvedAt: Date.now() }
                  : { winner: runsA > runsB ? event.teamAName : event.teamBName, draw: false, resolvedAt: Date.now() };
              const rec = {
                conditionId: event.conditionId,
                gamePk,
                teamAName: event.teamAName,
                teamBName: event.teamBName,
                numerologyFavorite: numFavName,
                numerologyScoreA: scoreA.combined,
                numerologyScoreB: scoreB.combined,
                components,
                marketFavorite: marketFavName,
                marketPriceA: priceA,
                marketPriceB: priceB,
                pickType: agree ? 'favorite' : 'underdog',
                eventTitle: event.eventTitle,
                gameTime: event.gameStartTime.toISOString(),
                recordedAt: Date.now(),
                result,
              };
              newPredictions.push(rec);
              existingByGamePk.set(gamePk, rec); // guard against a same-run duplicate
            }
          }
        }
      }
    }

    // ---- Strikeout Signal half - independent of any market match ----
    for (const side of [feed.home, feed.away]) {
      if (!side.startingPitcherId) continue;
      const key = `${gamePk}|${side.startingPitcherId}`;
      if (existingSignalKeys.has(key)) continue;
      const bd = birthdates.get(side.startingPitcherId);
      if (!bd || !bd.birthDate || side.startingPitcherStrikeouts == null) continue;

      const baseline = await fetchMlbGameLogBeforeDate(side.startingPitcherId, season, date);
      if (!baseline) continue; // no starts yet this season to baseline against

      const dayScore = computeCompatibility(parseDateInput(bd.birthDate), matchDate, sportsNumerologyCompat).finalScore;
      const predictedDirection = dayScore >= 60 ? 'over' : (dayScore <= 40 ? 'under' : 'neutral');
      const actualKs = side.startingPitcherStrikeouts;
      const actualDirection = actualKs > baseline.strikeoutsPerStart ? 'over' : (actualKs < baseline.strikeoutsPerStart ? 'under' : 'push');

      newSignals.push({
        gamePk,
        pitcherId: side.startingPitcherId,
        pitcherName: bd.name,
        teamName: side.teamName,
        gameTime: new Date(g.gameDate).toISOString(),
        dayScore,
        predictedDirection,
        seasonAvgKsAtPickTime: baseline.strikeoutsPerStart,
        recordedAt: Date.now(),
        actualKs,
        result: {
          actualDirection,
          correct: predictedDirection !== 'neutral' ? predictedDirection === actualDirection : null,
          resolvedAt: Date.now(),
        },
      });
      existingSignalKeys.add(key);
    }
  }

  // Process in small concurrent batches - a full-window rebuild is hundreds of
  // games, each several fetches, so one-at-a-time would take far too long.
  for (let i = 0; i < allGames.length; i += MLB_BACKFILL_CHUNK) {
    const chunk = allGames.slice(i, i + MLB_BACKFILL_CHUNK);
    await Promise.all(chunk.map((entry) => processGame(entry).catch(() => {})));
    processed += chunk.length;
    if (onProgress) onProgress(Math.min(processed, total), total);
    if (Date.now() - lastCheckpoint > 5000) { saveProgress(); lastCheckpoint = Date.now(); }
  }

  saveProgress();
  saveMlbBackfillState({ throughDateISO: endISO, schemaVersion: MLB_BACKFILL_SCHEMA });

  return { gamesProcessed: total, newPredictionsCount: newPredictions.length, patchedCount, newSignalsCount: newSignals.length, alreadyCurrent: false };
}

function initMlbBackfillButton() {
  document.getElementById('mlbBackfillBtn').addEventListener('click', async () => {
    const btn = document.getElementById('mlbBackfillBtn');
    const status = document.getElementById('mlbBackfillStatus');
    btn.disabled = true;
    const original = btn.textContent;
    status.textContent = 'Starting…';
    try {
      const result = await backfillMlbHistory((processed, total) => {
        status.textContent = `Backfilling… ${processed}/${total} games`;
      });
      status.textContent = result.alreadyCurrent
        ? 'Already caught up to yesterday - nothing new to backfill.'
        : `Done - checked ${result.gamesProcessed} games, added ${result.newPredictionsCount} game picks and ${result.newSignalsCount} strikeout signals${result.patchedCount ? `, upgraded ${result.patchedCount} existing picks with component data` : ''}.`;
      await refreshAndRenderMlb();
    } catch (e) {
      status.textContent = 'Something went wrong during backfill - try again.';
    }
    btn.textContent = original;
    btn.disabled = false;
  });
}

initMlbMatchupModal('');
initMlbMatchupModal('Old');
initMlbKSignalModal('');
initMlbKSignalModal('Old');
initModalTabSwitcher('statsMlbSection');
initMlbBackfillButton();
refreshAndRenderMlb();

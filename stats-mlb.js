// MLB counterpart of stats-ufc.js/stats-tennis.js - every top-level name here
// is Mlb-prefixed since all three files load together on stats.html (same
// convention stats-tennis.js already uses to avoid colliding with stats-ufc.js).
// Two differences from the other two sports: resolution comes from MLB's own
// live feed (gamePk), not a Polymarket condition_id, since the final score is
// already known with certainty straight from MLB - no need to wait on
// Polymarket's own market-closing lag. And there's a second, independent
// panel below for the pitcher-strikeout research signal (not a bet - see
// MLB_PITCHER_K_SIGNALS_KEY in db-core.js).

// The weight rescore must run before anything reads the store, and on every
// page that reads it (Stats, Betting, Bet Log) - hence outside the page-DOM
// guard at the bottom of this file. It waits on bigStoreReadyPromise so it
// operates on the IndexedDB-backed data rather than a pre-init snapshot.
const mlbStoreReady = bigStoreReadyPromise.then(() => rescoreMlbPredictionsForWeights());

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

      // Both sides must match DISTINCT feed sides. Exact-comparing missed every
      // short-named 2025 record, and the two names resolving to the same side
      // is what manufactured tie results out of decided games.
      const sideA = mlbFeedSideForName(feed, p.teamAName);
      const sideB = mlbFeedSideForName(feed, p.teamBName);
      if (!sideA || !sideB || sideA === sideB) return;
      const runsA = sideA.runs;
      const runsB = sideB.runs;
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

// One-time repair for games wrongly stored as ties.
//
// Baseball has no ties, so any stored draw is suspect. They came from the old
// name matcher defaulting to the away side (see mlbFeedSideForName in
// mlb-api.js): a record naming its teams "Giants"/"Braves" matched neither
// against the feed's "San Francisco Giants"/"Atlanta Braves", so BOTH sides
// resolved to away, the run totals came out identical, and the game was written
// as a draw. Draws are excluded from every statistic on the Stats page, so each
// one silently deleted a real game from the measured track record - which is
// what pulled the Manager component's edge down and made the v3 weights look
// unjustified.
//
// Re-resolves each suspect draw from MLB's own linescore using the strict
// matcher. A genuinely tied game (a suspended or called game) simply stays a
// draw, so this can only correct records that were actually decided.
const MLB_DRAW_REPAIR_KEY = 'numerology_mlb_draw_repair_version';
const MLB_DRAW_REPAIR_VERSION = 1;

async function repairMlbFalseDraws(onProgress) {
  const predictions = loadMlbPredictions();
  const suspects = predictions.filter((p) => p.result && p.result.draw && p.gamePk);
  if (!suspects.length) {
    localStorage.setItem(MLB_DRAW_REPAIR_KEY, String(MLB_DRAW_REPAIR_VERSION));
    return { checked: 0, repaired: 0, stillTied: 0, unmatched: 0 };
  }

  let repaired = 0;
  let stillTied = 0;
  let unmatched = 0;
  let checked = 0;

  // Batched rather than one big Promise.all - 700+ concurrent boxscore fetches
  // get throttled, and a throttled fetch returns null, which would look like
  // "cannot repair" and burn the record's only chance at being fixed.
  const BATCH = 8;
  for (let i = 0; i < suspects.length; i += BATCH) {
    const batch = suspects.slice(i, i + BATCH);
    const feeds = await Promise.all(batch.map((p) => fetchGameLiveFeed(p.gamePk)));
    batch.forEach((p, j) => {
      checked += 1;
      const feed = feeds[j];
      if (!feed || feed.abstractGameState !== 'Final') { unmatched += 1; return; }
      const sideA = mlbFeedSideForName(feed, p.teamAName);
      const sideB = mlbFeedSideForName(feed, p.teamBName);
      if (!sideA || !sideB || sideA === sideB) { unmatched += 1; return; }
      const rA = sideA.runs;
      const rB = sideB.runs;
      if (!Number.isFinite(rA) || !Number.isFinite(rB)) { unmatched += 1; return; }
      if (rA === rB) { stillTied += 1; return; } // a real tie - leave it alone
      p.result = { winner: rA > rB ? p.teamAName : p.teamBName, draw: false, resolvedAt: Date.now() };
      repaired += 1;
    });
    if (onProgress) onProgress(checked, suspects.length, repaired);
    if (repaired) saveMlbPredictions(predictions); // checkpoint as we go
  }

  const stripped = stripMlbTwinComponents(predictions);
  if (repaired || stripped) saveMlbPredictions(predictions);
  localStorage.setItem(MLB_DRAW_REPAIR_KEY, String(MLB_DRAW_REPAIR_VERSION));
  return { checked, repaired, stillTied, unmatched, componentsCleared: stripped };
}

// Second half of the same corruption. When both team names resolved to the away
// side, side A and side B were scored as the SAME team - so the record's two
// component sets came out byte-identical and its two composites came out equal.
// Such a game has no lean on any axis, so it contributes nothing to the win
// rate, the component signal table or the edge tiers: it is invisible rather
// than wrong, which is why the damage went unnoticed.
//
// Fixing the result is not enough; the scores themselves have to be rebuilt
// from the real home/away sides. The backfill already does exactly that, but it
// skips any record that HAS components - so clearing them is what lets it
// recompute these in place on its next run.
//
// Identical components on both sides is a safe signature: it needs six separate
// scores to coincide exactly, and it occurs in 0 of the 1,460 records written
// after the naming conventions converged.
function stripMlbTwinComponents(predictions) {
  let cleared = 0;
  predictions.forEach((p) => {
    if (!p.components || !p.components.A || !p.components.B) return;
    if (JSON.stringify(p.components.A) !== JSON.stringify(p.components.B)) return;
    delete p.components;
    delete p.dims;
    cleared += 1;
  });
  return cleared;
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
    <div class="score-big ${winRateClass(stats.overallWinPct)}">${stats.overallWinPct}<span class="score-out-of">%</span></div>
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
  const total = tiers.reduce((s, t) => s + t.count, 0);
  document.getElementById('mlbStatsEdgeTiers' + suffix).innerHTML = pmTableTotalRow(total, 3) + tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function renderMlbPriceBuckets(predictions, suffix = '') {
  const buckets = computeBucketStats(predictions, MLB_REAL_EDGE_MIN_GAP);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  document.getElementById('mlbStatsPriceBuckets' + suffix).innerHTML = pmTableTotalRow(total, 3) + buckets.map((b) => `
    <tr>
      <td>${b.label}</td>
      <td>${b.count}</td>
      <td>${b.winPct != null && b.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(b.winPct)}">${b.winPct}%</span>`
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

// Pending rows (today's slate with no full score yet) always show in full,
// unpaginated - there are only ever a handful, and they're never in
// `predictions` to begin with. Only the resolved/tracked predictions below
// them get paginated.
function renderMlbTable(predictions, suffix = '', pendingGames = []) {
  const tbody = document.getElementById('mlbStatsTableBody' + suffix);
  const pendingHtml = pendingGames.map(mlbPendingRowHtml).join('');
  if (!predictions.length && !pendingHtml) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No games tracked yet.</td></tr>';
    renderPaginationControls('mlbStatsTablePagination' + suffix, 'mlbStatsTable' + suffix, 1, 1);
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.gameTime) - new Date(a.gameTime));
  const { rows, page, totalPages } = paginationSlice('mlbStatsTable' + suffix, sorted);
  tbody.innerHTML = pendingHtml + rows.map((p) => `
    <tr data-condition-id="${p.conditionId}">
      <td>${formatMlbGameDate(p.gameTime)}</td>
      <td>${escapeHtml(p.teamAName)} vs ${escapeHtml(p.teamBName)}</td>
      <td>${escapeHtml(p.numerologyFavorite)}</td>
      <td>${mlbEdgeCell(p)}</td>
      <td>${p.pickType === 'favorite' ? 'Favorite' : 'Underdog'}</td>
      <td>${mlbResultBadge(p)}</td>
    </tr>
  `).join('');
  renderPaginationControls('mlbStatsTablePagination' + suffix, 'mlbStatsTable' + suffix, page, totalPages, () => renderMlbTable(predictions, suffix, pendingGames));
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
        <div class="score-big ${winRateClass(stats.hitPct)}">${stats.hitPct}<span class="score-out-of">%</span></div>
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
        ? `<span class="score-inline ${winRateClass(t.hitPct)}">${t.hitPct}%</span>`
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
  const { rows: pageSignals, page, totalPages } = paginationSlice('mlbKSignal' + suffix, sorted);
  const rows = pageSignals.map((s) => {
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
    <div class="pm-table-pagination" id="mlbKSignalPagination${suffix}"></div>
  `;
  renderPaginationControls('mlbKSignalPagination' + suffix, 'mlbKSignal' + suffix, page, totalPages, () => renderMlbKSignalPanel(signals, suffix));
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
  // The comparison row is now the weighting v3 replaced, so the table shows
  // what the reweighting actually bought rather than re-testing a candidate.
  const v2A = (p) => mlbCompositeFromComponents(p.components.A, MLB_ROLE_WEIGHTS_LEGACY);
  const v2B = (p) => mlbCompositeFromComponents(p.components.B, MLB_ROLE_WEIGHTS_LEGACY);

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
  const oosCutoff = MLB_WEIGHTS_SINCE + 'T12:00:00.000Z';
  const oosList = resolved.filter((p) => p.gameTime >= oosCutoff);
  // Out-of-sample is measured on the LIVE model (the composite actually
  // placing bets), not on a candidate weighting.
  const v2OutOfSample = statOver(oosList, (p) => p.numerologyScoreA, (p) => p.numerologyScoreB);

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
  // Some components (catcher, matchup) run thinner than the full resolved
  // set - the composite row is always the full set, so that's the honest
  // "total," not the max of a possibly-thinner component row.
  const total = (rows.find((r) => r.key === 'composite') || {}).count || maxCount;
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
    ? `🎯 <b>Live model (v3), out-of-sample</b> (games since ${MLB_WEIGHTS_SINCE}): <span class="score-inline ${oos.edge > 0 ? 'good' : (oos.edge < 0 ? 'bad' : '')}">${oos.winPct}% vs ${oos.marketPct}% market (${oos.edge > 0 ? '+' : ''}${oos.edge})</span> over ${oos.count} games. This is the real test &mdash; the Full Composite edge above was fit to these same games.`
    : `🎯 <b>Live model (v3)</b> weights Manager 45% / Pitcher 28%, because Manager was the only component beating the market with real statistical support (+4, 3.3 se) while Batters, Catcher and Pitcher-vs-Lineup measured as noise &mdash; and 40% on Batters was diluting the signal badly enough that Manager alone outperformed the whole composite. The Full Composite edge in the table is <b>in-sample</b> (these weights were chosen from these games), so treat it as optimistic. The honest test is out-of-sample: <b>${oos.count} games</b> since ${MLB_WEIGHTS_SINCE}. Watch that number as new games resolve.`;

  el.innerHTML = `
    <div class="pm-table-total">Total picks: ${total}</div>
    <table class="astro-table">
      <thead><tr><th>Signal</th><th>Games</th><th>Win%</th><th>Market%</th><th>Edge</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="mode-desc" style="margin-top:10px;">${oosLine}</div>
  `;
}

// Today/Old each keep their own day-filter state ('mlb' + suffix, see
// db-core.js's dayFilterPredicate) since they're independent tabs a user
// might want sliced differently.
function renderMlbScope(suffix, predictions, signals) {
  const isOld = suffix === 'Old';
  const todayOrOldPredictions = predictions.filter((p) => isMlbTodayLocal(p.gameTime) === !isOld);
  const matchesDay = dayFilterPredicate('mlb' + suffix);
  const scopedPredictions = todayOrOldPredictions.filter((p) => matchesDay(p.gameTime));
  const stats = computeMlbStats(scopedPredictions);
  renderMlbHero(stats, suffix);
  renderMlbBreakdown(stats, suffix);
  renderMlbEdgeTiers(scopedPredictions, suffix);
  renderMlbPriceBuckets(scopedPredictions, suffix);
  // Always todayOrOldPredictions, not scopedPredictions - this table's whole
  // point is showing every day value side by side, which the day filter
  // itself can't (it stays scoped to the Today/Old tab, just not the filter).
  renderDayNumberTable('mlbUniversalDay' + suffix, todayOrOldPredictions, 'gameTime', universalDayNumber, DAY_FILTER_UNIVERSAL_OPTIONS, 'Universal Day', MLB_REAL_EDGE_MIN_GAP);
  renderDayNumberTable('mlbDayEnergy' + suffix, todayOrOldPredictions, 'gameTime', getReducedDay, DAY_FILTER_ENERGY_OPTIONS, 'Day Energy', MLB_REAL_EDGE_MIN_GAP);
  renderDayComboTable('mlbDayCombo' + suffix, todayOrOldPredictions, 'gameTime', MLB_REAL_EDGE_MIN_GAP);
  renderMlbComponentSignal(scopedPredictions, suffix);
  renderDimensionEdgeTable('mlbDimensionEdge' + suffix, scopedPredictions, (p) => [p.teamAName, p.teamBName]);
  renderMlbTable(scopedPredictions, suffix, isOld ? [] : todaysMlbSlatePending);
  document.getElementById('mlbStatsLastUpdated' + suffix).textContent = `Last checked ${new Date().toLocaleTimeString()}`;

  const scopedSignals = signals.filter((s) => isMlbTodayLocal(s.gameTime) === !isOld && matchesDay(s.gameTime));
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
    if (existingCond.has(m.conditionId)) return; // already stored

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

    const todayMatchDateISO = currentMlbMatchDateISO({ regionMode: regionInfo.regionMode, region: regionInfo.region, gameStartTime: m.gameStartTime });
    if (!todayMatchDateISO) { pending.push({ ...m, status: 'venue' }); return; }

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

    // Must resolve to two DISTINCT feed sides. A name that matches neither used
    // to fall through to away, which scored the game against the wrong team's
    // manager and then called it a tie.
    const sideA = mlbFeedSideForName(feed, m.teamAName);
    const sideB = mlbFeedSideForName(feed, m.teamBName);
    if (!sideA || !sideB || sideA === sideB) { pending.push({ ...m, status: 'pending' }); return; }

    const gObj = {
      sideA, sideB,
      teamInfoA: teamInfoCache.get(sideA.teamId), teamInfoB: teamInfoCache.get(sideB.teamId),
      managerA: managerCache.get(sideA.teamId), managerB: managerCache.get(sideB.teamId),
      birthdates, region: regionInfo.region, regionMode: regionInfo.regionMode, stadiumFounded, gameStartTime: m.gameStartTime,
    };
    const scoreA = computeTeamComposite(gObj, 'A');
    const scoreB = computeTeamComposite(gObj, 'B');
    if (!scoreA || !scoreB || m.priceA == null || m.priceB == null) { pending.push({ ...m, status: 'pending' }); return; }

    // The guard at the top of this map already returned for anything stored,
    // so reaching here means this game's moneyline still needs recording.
    const marketFavName = m.priceA >= m.priceB ? m.teamAName : m.teamBName;
    const numFavName = scoreA.combined >= scoreB.combined ? m.teamAName : m.teamBName;
    const agree = normalizeName(marketFavName) === normalizeName(numFavName);
    const rA = sideA.runs;
    const rB = sideB.runs;
    const result = (feed.abstractGameState === 'Final' && Number.isFinite(rA) && Number.isFinite(rB))
      ? (rA === rB ? { winner: null, draw: true, resolvedAt: Date.now() } : { winner: rA > rB ? m.teamAName : m.teamBName, draw: false, resolvedAt: Date.now() })
      : null;

    newPreds.push({
      conditionId: m.conditionId, gamePk,
      teamAName: m.teamAName, teamBName: m.teamBName,
      numerologyFavorite: numFavName, numerologyScoreA: scoreA.combined, numerologyScoreB: scoreB.combined,
      components: { A: extractComponents(scoreA.parts), B: extractComponents(scoreB.parts) },
      dims: { A: extractTeamDimensions(scoreA.parts), B: extractTeamDimensions(scoreB.parts) },
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
    const pickComplete = stored && stored.components && stored.dims;
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
    // ---- Game Picks half ----
    // Reuse the same per-side scoring for both the patch and create paths.
    // Returns null when either name can't be matched to its own feed side, so
    // a game is skipped rather than scored against the wrong team's manager.
    const buildGObj = (aName, bName) => {
      const sideA = mlbFeedSideForName(feed, aName);
      const sideB = mlbFeedSideForName(feed, bName);
      if (!sideA || !sideB || sideA === sideB) return null;
      return {
        sideA, sideB,
        teamInfoA: teamInfoCache.get(sideA.teamId), teamInfoB: teamInfoCache.get(sideB.teamId),
        managerA: managerCache.get(sideA.teamId), managerB: managerCache.get(sideB.teamId),
        birthdates, region: regionInfo.region, regionMode: regionInfo.regionMode, stadiumFounded, gameStartTime: new Date(g.gameDate),
      };
    };
    const dhKey = [feed.home.teamId, feed.away.teamId].sort().join('-');
    // Skip only a pick that's already complete (has components). A componentless
    // pick gets patched in place with its OWN A/B naming (same in-place upgrade
    // the backfill does, but the backfill never reaches today); if nothing's
    // stored yet, a fresh pick is built from the closed market.
    if (!stored || !stored.components || !stored.dims) {
      if (stored) {
        const gObj = buildGObj(stored.teamAName, stored.teamBName);
        const scoreA = gObj && computeTeamComposite(gObj, 'A');
        const scoreB = gObj && computeTeamComposite(gObj, 'B');
        if (scoreA && scoreB) {
          stored.components = { A: extractComponents(scoreA.parts), B: extractComponents(scoreB.parts) };
          stored.dims = { A: extractTeamDimensions(scoreA.parts), B: extractTeamDimensions(scoreB.parts) };
          patchedCount++;
        }
      } else if (!dhKeys.has(dhKey)) {
        const event = await fetchMlbMoneylineEventForGame(g.teams.away.team.abbreviation, g.teams.home.team.abbreviation, date);
        if (event) {
          const gObj = buildGObj(event.teamAName, event.teamBName);
          const scoreA = gObj && computeTeamComposite(gObj, 'A');
          const scoreB = gObj && computeTeamComposite(gObj, 'B');
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
              const rA = gObj.sideA.runs;
              const rB = gObj.sideB.runs;
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
                dims: { A: extractTeamDimensions(scoreA.parts), B: extractTeamDimensions(scoreB.parts) },
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
      const dayScore = computeCompatibility(parseDateInput(bd.birthDate), matchDate, sportsNumerologyCompat, MLB_COMPAT_WEIGHTS).finalScore;
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

// The null check is load-bearing, not defensive padding. This file is loaded by
// betting.html and bet-log.html too, and neither has the Stats page's refresh
// buttons - so without it this threw at top level and killed the REST of the
// file's execution, leaving every const declared below (MLB_BACKFILL_SCHEMA and
// friends) permanently in the temporal dead zone on those two pages. Function
// declarations still hoisted, which is what made the breakage so quiet.
// wireNbaRefreshButton has always guarded; this one did not.
function wireMlbRefreshButton(btnId) {
  const el = document.getElementById(btnId);
  if (!el) return;
  el.addEventListener('click', async () => {
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

// Superseded by loadMlbBackfillWindowDays() (db-core.js), which makes this
// adjustable because all four MLB stores at 52 weeks exceed the ~5MB
// localStorage cap. Kept as the default that function falls back to.
const MLB_BACKFILL_LOOKBACK_DAYS = 364; // 52 weeks (~1 full MLB season) - now
// that MLB predictions are local-only (db-core.js's CLOUD_SYNC_FIELDS), the
// old ~1MB Firebase sync cap that kept this at 6 weeks no longer applies. The
// real limits now are just how long one run takes (hundreds more games) and
// whether Polymarket's own price history still reaches back that far - a gap
// in old data is their retention, not a bug here.
const MLB_BACKFILL_SCHEMA = 11; // bump when the stored prediction shape changes,
// v9: the NRFI and run-totals pitcher-duel markets were removed. The walk no
// longer collects them, so v7 and v8 (which existed only to build and then
// upgrade those two stores) are dead history. Bumped so a marker left at 7 or
// 8 doesn't imply this walk still gathers them.
// v10: MLB now scores every person on the birth-vs-game-day anchor alone
// (MLB_DAY_ANCHOR_ONLY in db-core.js), dropping the stadium and state anchors
// that measured 0 and +1 against the market. That changes every stored
// component AND every composite.
// v11: same reasoning one level deeper - MLB_COMPAT_WEIGHTS (db-core.js)
// reweights the dimensions inside each compat score (western sun sign to 0,
// day-of-year 3% -> 19%, day number 21% -> 34%), and the lucky-number bonus is
// added to DIMENSION_KEYS as a ninth measured dimension. Every person's day
// score moves, and every stored dims vector gains a field.
// NOTE for both: a bump alone does NOT re-score existing records - see the
// comment in backfillMlbHistory. The store has to be WIPED first, or the walk
// will skip every game it already has and the old numbers will survive.
// when the lookback window grows, OR (as here) when a bug meant earlier runs
// silently under-collected - a schema-current marker just continues forward
// from its own throughDateISO, so it has no way to know a past "complete" walk
// actually missed data. v6: fetchMlbMoneylineEventForGame (mlb-api.js) built
// its Polymarket slug straight from MLB's own team.abbreviation, which is
// off for exactly two teams (Athletics: MLB says ATH, Polymarket's slugs
// still say oak; Diamondbacks: MLB says AZ, Polymarket says ari) - every
// Athletics/Diamondbacks game was silently skipped for lack of a matched
// event, no matter how many times it was re-walked. A stored marker whose
// schemaVersion doesn't match triggers a one-time full re-walk of the whole
// window, so existing records get upgraded/extended in place (v2: per-
// component scores; v3: per-dimension scores; v4: the 52-week window; v5:
// the CLOB price-history fix; v6: this fix) rather than the marker skipping
// straight past them.
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
  // On a schema bump we re-walk the whole window once instead of continuing
  // from the marker.
  //
  // IMPORTANT: re-walking is not re-scoring. processGame below skips any game
  // already stored WITH components and dims, so a bump only back-fills records
  // MISSING those fields - it cannot update ones that have them. A change to
  // how scores are CALCULATED (weights, anchors, blends) therefore needs the
  // store wiped first; the schema bump alone will leave every existing record
  // exactly as it was.
  const schemaCurrent = state && state.schemaVersion === MLB_BACKFILL_SCHEMA;
  const startISO = (schemaCurrent && state.throughDateISO)
    ? addDaysISO(state.throughDateISO, 1)
    : addDaysISO(todayISO, -loadMlbBackfillWindowDays());
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

    // gameStartTime is the real UTC first-pitch instant (not the already-
    // resolved matchDate) so computeTeamComposite's own currentMlbMatchDateISO(g)
    // re-derives the identical matchDateISO from the same real timestamp +
    // region, rather than re-converting an already-local-midnight Date.
    // Returns null when either name can't be matched to its own feed side - the
    // walk then skips the game instead of scoring it against the wrong side.
    const buildGObj = (aName, bName) => {
      const sideA = mlbFeedSideForName(feed, aName);
      const sideB = mlbFeedSideForName(feed, bName);
      if (!sideA || !sideB || sideA === sideB) return null;
      return {
        sideA, sideB,
        teamInfoA: teamInfoCache.get(sideA.teamId), teamInfoB: teamInfoCache.get(sideB.teamId),
        managerA: managerCache.get(sideA.teamId), managerB: managerCache.get(sideB.teamId),
        birthdates, region: regionInfo.region, regionMode: regionInfo.regionMode,
        stadiumFounded, gameStartTime: new Date(g.gameDate),
      };
    };

    // ---- Game Picks half ----
    // Skip entirely only if this game is already stored WITH both components and
    // dimension scores. If it lacks either (older record) we recompute to
    // back-fill them in place; if it isn't stored at all, we create it.
    const dhKey = `${date}|${[feed.home.teamId, feed.away.teamId].sort().join('-')}`;
    const existingPred = existingByGamePk.get(gamePk);
    let event = null;
    if (!existingPred || !existingPred.components || !existingPred.dims) {
      let teamAName = null;
      let teamBName = null;
      if (existingPred) {
        // Patching: keep the record's own A/B naming so components line up.
        teamAName = existingPred.teamAName;
        teamBName = existingPred.teamBName;
      } else if (!doubleheaderKeys.has(dhKey)) {
        event = await fetchMlbMoneylineEventForGame(g.teams.away.team.abbreviation, g.teams.home.team.abbreviation, date);
        if (event) { teamAName = event.teamAName; teamBName = event.teamBName; }
      }
      const gObj = teamAName ? buildGObj(teamAName, teamBName) : null;
      if (gObj) {
        const scoreA = computeTeamComposite(gObj, 'A');
        const scoreB = computeTeamComposite(gObj, 'B');
        if (scoreA && scoreB) {
          const components = { A: extractComponents(scoreA.parts), B: extractComponents(scoreB.parts) };
          const dims = { A: extractTeamDimensions(scoreA.parts), B: extractTeamDimensions(scoreB.parts) };
          if (existingPred) {
            existingPred.components = components;
            existingPred.dims = dims;
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
              const runsA = gObj.sideA.runs;
              const runsB = gObj.sideB.runs;
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
                dims,
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

      const dayScore = computeCompatibility(parseDateInput(bd.birthDate), matchDate, sportsNumerologyCompat, MLB_COMPAT_WEIGHTS).finalScore;
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

// The storage readout and its clear button are gone - with the prediction
// stores in IndexedDB there's no cap left to manage, so it was just clutter.
// The backfill window stays: a shorter window is still a much faster run.
function initMlbStorageControls() {
  const windowSel = document.getElementById('mlbBackfillWindowSelect');
  if (!windowSel) return;
  windowSel.value = String(loadMlbBackfillWindowDays());
  windowSel.addEventListener('change', () => {
    saveMlbBackfillWindowDays(Number(windowSel.value));
    // The progress marker records how far the LAST window reached, so it has
    // to be dropped or the next run would skip the new range.
    saveMlbBackfillState({});
    document.getElementById('mlbBackfillStatus').textContent = `Window set to ${Math.round(Number(windowSel.value) / 7)} weeks - press Backfill Data to re-walk it.`;
  });
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
      // Surface the actual failure - a bare "try again" hides the one piece of
      // information needed to fix it, and a backfill run is too long to debug
      // by guesswork.
      status.textContent = `Backfill failed: ${e && e.message ? e.message : e}`;
      console.error('MLB backfill failed', e);
    }
    btn.textContent = original;
    btn.disabled = false;
  });
}

// Backfill can only ADD games. A change to how scores are CALCULATED needs the
// stored picks gone first, which used to mean a console command - impossible on
// a phone, which is where this app mostly gets used. Same walk as Backfill, just
// against an empty store.
//
// Clears three things together, and all three matter: the picks themselves, the
// backfill marker (or the walk resumes from where the old data ended and covers
// nothing), and MLB_WEIGHTS_VERSION_KEY in localStorage (or a later rescore sees
// a current-looking marker and skips the fresh records - the same trap that made
// restoring a backup silently keep old-weighted scores, betting-backup.js:135).
// The strikeout signals go too: they carry a stored dayScore, which the compat
// weights move as well.
function initMlbRebuildButton() {
  const btn = document.getElementById('mlbRebuildBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const existing = loadMlbPredictions().length;
    if (!confirm(`Delete all ${existing} stored MLB picks and re-walk the full window from scratch?\n\nThis cannot be undone, and the rebuild takes several minutes - keep this tab open and awake until it finishes.`)) return;

    const status = document.getElementById('mlbBackfillStatus');
    const backfillBtn = document.getElementById('mlbBackfillBtn');
    const original = btn.textContent;
    btn.disabled = true;
    if (backfillBtn) backfillBtn.disabled = true;
    btn.textContent = '♻️ Rebuilding…';
    try {
      status.textContent = `Clearing ${existing} stored picks…`;
      saveMlbPredictions([]);
      saveMlbPitcherKSignals([]);
      saveMlbBackfillState({});
      localStorage.removeItem(MLB_WEIGHTS_VERSION_KEY);

      const result = await backfillMlbHistory((processed, total) => {
        status.textContent = `Rebuilding… ${processed}/${total} games`;
      });
      status.textContent = `Rebuilt from scratch - checked ${result.gamesProcessed} games, stored ${result.newPredictionsCount} game picks and ${result.newSignalsCount} strikeout signals.`;
      await refreshAndRenderMlb();
    } catch (e) {
      // The store is empty at this point, so a failure here is not cosmetic -
      // say so plainly rather than leaving a half-rebuilt store looking done.
      status.textContent = `Rebuild failed after clearing the store: ${e && e.message ? e.message : e}. Press Backfill Data to fill it back in.`;
      console.error('MLB rebuild failed', e);
    }
    btn.textContent = original;
    btn.disabled = false;
    if (backfillBtn) backfillBtn.disabled = false;
  });
}

// Wire the Stats page DOM only when it exists - this file also loads on
// betting.html purely for checkMlbResults() and the shared prediction
// helpers, so the Betting page settles results through the same code path.
mlbStoreReady.then(() => {
 if (document.getElementById('statsMlbSection')) {
  document.getElementById('mlbGameSection').insertAdjacentHTML('beforebegin', dayFilterHtml('mlb'));
  document.getElementById('mlbGameSectionOld').insertAdjacentHTML('beforebegin', dayFilterHtml('mlbOld'));
  initDayFilter('mlb', () => { resetPagination('mlbStatsTable'); resetPagination('mlbKSignal'); renderMlbScope('', currentMlbPredictions, currentMlbKSignals); });
  initDayFilter('mlbOld', () => { resetPagination('mlbStatsTableOld'); resetPagination('mlbKSignalOld'); renderMlbScope('Old', currentMlbPredictions, currentMlbKSignals); });

  initBreakdownToggle('mlbBreakdownToggle', ['mlbStatsEdgeTiersBox', 'mlbStatsPriceBucketsBox', 'mlbUniversalDayBox', 'mlbDayEnergyBox', 'mlbDayComboBox', 'mlbComponentSignalBox', 'mlbDimensionEdgeBox']);
  initBreakdownToggle('mlbBreakdownToggleOld', ['mlbStatsEdgeTiersBoxOld', 'mlbStatsPriceBucketsBoxOld', 'mlbUniversalDayBoxOld', 'mlbDayEnergyBoxOld', 'mlbDayComboBoxOld', 'mlbComponentSignalBoxOld', 'mlbDimensionEdgeBoxOld']);

  initMlbMatchupModal('');
  initMlbMatchupModal('Old');
  initMlbKSignalModal('');
  initMlbKSignalModal('Old');
  initModalTabSwitcher('statsMlbSection');
  initMlbBackfillButton();
  initMlbRebuildButton();
  initMlbStorageControls();
  refreshAndRenderMlb();
 }
});

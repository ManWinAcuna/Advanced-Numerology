// Mirrors stats-ufc.js closely, but for tennis predictions - every top-level
// name here is prefixed/renamed versus that file since both scripts run in
// the same page (stats.html) and share one global scope. Unlike UFC's
// backfill, tennis DOES get a real region (the tournament city, parsed
// straight from the event's own title) - see the backfill section below.

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

// suffix is '' for the Today scope's DOM ids, 'Old' for Old Data's - same
// convention MLB's Stats page (and UFC's, now) already established.
function renderTennisHero(stats, suffix = '') {
  const hero = document.getElementById('tennisStatsHero' + suffix);

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
    <div class="score-big ${winRateClass(stats.overallWinPct)}">${stats.overallWinPct}<span class="score-out-of">%</span></div>
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

function renderTennisBreakdown(stats, suffix = '') {
  document.getElementById('tennisStatsBreakdown' + suffix).innerHTML = `
    ${tennisMeterRow('✅ When numerology agreed with the favorite', stats.favoriteWinPct, stats.favoriteCount, stats.favoriteWinsCount)}
    ${tennisMeterRow('⚡ When numerology picked the underdog', stats.underdogWinPct, stats.underdogCount, stats.underdogWinsCount)}
  `;
}

function renderTennisEdgeTiers(predictions, suffix = '') {
  const tiers = computeEdgeTierStats(predictions);
  const total = tiers.reduce((s, t) => s + t.count, 0);
  document.getElementById('tennisStatsEdgeTiers' + suffix).innerHTML = pmTableTotalRow(total, 3) + tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

function renderTennisPriceBuckets(predictions, suffix = '') {
  const buckets = computeBucketStats(predictions);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  document.getElementById('tennisStatsPriceBuckets' + suffix).innerHTML = pmTableTotalRow(total, 3) + buckets.map((b) => `
    <tr>
      <td>${b.label}</td>
      <td>${b.count}</td>
      <td>${b.winPct != null && b.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(b.winPct)}">${b.winPct}%</span>`
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

function renderTennisTable(predictions, suffix = '') {
  const tbody = document.getElementById('tennisStatsTableBody' + suffix);
  if (!predictions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No matches tracked yet.</td></tr>';
    renderPaginationControls('tennisStatsTablePagination' + suffix, 'tennisStatsTable' + suffix, 1, 1);
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.matchTime) - new Date(a.matchTime));
  const { rows, page, totalPages } = paginationSlice('tennisStatsTable' + suffix, sorted);
  tbody.innerHTML = rows.map((p) => `
    <tr data-condition-id="${p.conditionId}">
      <td>${formatTennisMatchDate(p.matchTime)}</td>
      <td>${escapeHtml(p.playerAName)} vs ${escapeHtml(p.playerBName)}</td>
      <td>${escapeHtml(p.numerologyFavorite)}</td>
      <td>${tennisEdgeCell(p)}</td>
      <td>${p.pickType === 'favorite' ? 'Favorite' : 'Underdog'}</td>
      <td>${tennisResultBadge(p)}</td>
    </tr>
  `).join('');
  renderPaginationControls('tennisStatsTablePagination' + suffix, 'tennisStatsTable' + suffix, page, totalPages, () => renderTennisTable(predictions, suffix));
}

function formatTennisOdds(price) {
  return price != null ? `${Math.round(price * 100)}%` : '—';
}

function tennisParseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Mirrors buildAllPlayers()/matchPlayer() in polymarket-tennis.js - the stored
// prediction only ever kept the player's NAME, not their DOB, so the Insight
// tab (and the backfill, which discovers players purely by name from
// Polymarket) has to match against the current roster the same way the live
// tracker does. If a player was since renamed or removed (or was never
// added), the match simply comes back null and the caller skips rather than
// guessing.
function buildAllPlayers() {
  const overrides = loadTennisPlayerOverrides();
  const custom = loadCustomTennisPlayers();
  const seedPlayers = TENNIS_PLAYERS.map((p, idx) => {
    const id = `seed-${idx}`;
    const override = overrides[id];
    if (override && override.deleted) return null;
    return override ? { id, ...override } : { id, name: p.name, dob: p.dob, tour: p.tour, tournament: p.tournament };
  }).filter(Boolean);
  return seedPlayers.concat(custom);
}

function matchPlayer(name, roster) {
  const norm = normalizeName(name);
  if (!norm) return null;

  let found = roster.find((p) => normalizeName(p.name) === norm);
  if (found) return found;

  const tokens = norm.split(' ');
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  found = roster.find((p) => {
    const rTokens = normalizeName(p.name).split(' ');
    return rTokens[0] === first && rTokens[rTokens.length - 1] === last;
  });
  return found || null;
}

function tennisInsightTabHtml(p) {
  const roster = buildAllPlayers();
  const matchedA = matchPlayer(p.playerAName, roster);
  const matchedB = matchPlayer(p.playerBName, roster);
  if (!matchedA || !matchedB) {
    return '<div class="pm-unmatched">One or both players aren\'t in the current database anymore (renamed or removed since this pick was recorded), so a life path reading isn\'t available here.</div>';
  }
  const infoA = compatLifePathInfo(tennisParseDateInput(matchedA.dob));
  const infoB = compatLifePathInfo(tennisParseDateInput(matchedB.dob));
  const pair = pairInsight(infoA.lookupValue, infoB.lookupValue);
  // Universal Day - each player's own life path vs. the match date itself,
  // added alongside the player-vs-player read above, not instead of it. The
  // original region/timezone isn't stored on the prediction, so this reads
  // the match's UTC timestamp in the browser's own local time rather than
  // the venue's - a reasonable approximation for a historical,
  // informational-only read, not the exact figure the live tracker showed.
  const matchDate = p.matchTime ? new Date(p.matchTime) : null;
  return `
    <div class="pm-insight-grid">
      ${personInsightHtml(matchedA.name, infoA.display, infoA.lookupValue)}
      ${personInsightHtml(matchedB.name, infoB.display, infoB.lookupValue)}
    </div>
    <div class="pm-insight-pair">
      <div class="pm-insight-pair-clash">${pair.clash.icon} ${escapeHtml(pair.clash.label)} <span class="score-inline ${scoreClass(pair.score)}">${pair.score}</span></div>
      <div class="pm-insight-pair-theme">${escapeHtml(pair.themeLine)}</div>
    </div>
    ${matchDate ? `
    <div class="pm-insight-grid">
      ${universalDayInsightHtml(matchedA.name, infoA.lookupValue, matchDate)}
      ${universalDayInsightHtml(matchedB.name, infoB.lookupValue, matchDate)}
    </div>` : ''}
    <div class="pm-insight-disclaimer">Research-based read on each life path's tendencies &mdash; informational only, not part of the numerology edge above.</div>
  `;
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

  const hero = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(p.playerAName)} <span class="score-vs">&times;</span> ${escapeHtml(p.playerBName)}</div>
    </div>
    <div class="pm-breakdown-hint" style="text-align:center;">${escapeHtml(p.eventTitle)} &middot; ${formatTennisMatchDate(p.matchTime)}</div>
  `;
  const breakdown = `
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
  return hero + modalTabsHtml(breakdown, tennisInsightTabHtml(p));
}

function initTennisMatchupModal(suffix = '') {
  document.getElementById('tennisStatsTableBody' + suffix).addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-condition-id]');
    if (!row) return;
    const p = currentTennisPredictions.find((x) => x.conditionId === row.dataset.conditionId);
    if (!p) return;
    document.getElementById('tennisStatsMatchupBody' + suffix).innerHTML = tennisMatchupModalHtml(p);
    document.getElementById('tennisStatsMatchupOverlay' + suffix).classList.add('active');
  });

  document.getElementById('tennisStatsMatchupClose' + suffix).addEventListener('click', () => {
    document.getElementById('tennisStatsMatchupOverlay' + suffix).classList.remove('active');
  });
  document.getElementById('tennisStatsMatchupOverlay' + suffix).addEventListener('click', (e) => {
    if (e.target.id === 'tennisStatsMatchupOverlay' + suffix) document.getElementById('tennisStatsMatchupOverlay' + suffix).classList.remove('active');
  });
  initModalTabSwitcher('tennisStatsMatchupBody' + suffix);
}

// Today/Old each keep their own day-filter state ('tennis' + suffix, see
// db-core.js's dayFilterPredicate). The day-number/day-combo tables always
// get todayOrOldPredictions (scoped to the tab, not the day filter) - that's
// the whole point of those tables, a side-by-side view the filter can't give.
function renderTennisScope(suffix, predictions) {
  const isOld = suffix === 'Old';
  const todayOrOldPredictions = predictions.filter((p) => isTodayLocal(p.matchTime) === !isOld);
  const matchesDay = dayFilterPredicate('tennis' + suffix);
  const scopedPredictions = todayOrOldPredictions.filter((p) => matchesDay(p.matchTime));

  const stats = computeTennisStats(scopedPredictions);
  renderTennisHero(stats, suffix);
  renderTennisBreakdown(stats, suffix);
  renderTennisEdgeTiers(scopedPredictions, suffix);
  renderTennisPriceBuckets(scopedPredictions, suffix);
  renderDimensionEdgeTable('tennisDimensionEdge' + suffix, scopedPredictions, (p) => [p.playerAName, p.playerBName]);
  renderTennisTable(scopedPredictions, suffix);
  renderDayNumberTable('tennisUniversalDay' + suffix, todayOrOldPredictions, 'matchTime', (d) => compatLifePathInfo(d).lookupValue, DAY_FILTER_UNIVERSAL_OPTIONS, 'Universal Day');
  renderDayNumberTable('tennisDayEnergy' + suffix, todayOrOldPredictions, 'matchTime', getReducedDay, DAY_FILTER_ENERGY_OPTIONS, 'Day Energy');
  renderDayComboTable('tennisDayCombo' + suffix, todayOrOldPredictions, 'matchTime');
  document.getElementById('tennisStatsLastUpdated' + suffix).textContent = `Last checked ${new Date().toLocaleTimeString()}`;
}

async function refreshTennisAndRender() {
  const predictions = await checkTennisResults();
  currentTennisPredictions = predictions;
  renderTennisScope('', predictions);
  renderTennisScope('Old', predictions);
}

function wireTennisRefreshButton(btnId) {
  document.getElementById(btnId).addEventListener('click', async () => {
    const btn = document.getElementById(btnId);
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '🔄 Checking…';
    await refreshTennisAndRender();
    btn.textContent = original;
    btn.disabled = false;
  });
}

/* ===================== Historical backfill (Tennis) ===================== */
// Mirrors UFC's backfill (stats-ufc.js) in spirit: no official league
// schedule API for tennis either, so matches are discovered purely from
// Polymarket's own closed tennis events. Unlike UFC, though, tennis gets a
// REAL region: the tournament's own city, parsed straight from the event's
// title ("ITF Brisbane: A vs B" -> "Brisbane") - checked live against every
// closed tennis event title, which all follow that same "{City}: player vs
// player" shape - then resolved/created as an Intl Region exactly like the
// "Add New City/Region" flow does (resolveIntlRegionForBackfillByCity,
// db-core.js). No venue-level data exists for a backfilled match though, so
// it scores Day 75% + Region 25% - the same blend the live tracker itself
// falls back to whenever no specific venue has been set for a card.

const TENNIS_BACKFILL_STATE_KEY = 'numerology_tennis_backfill_state';
// Deliberately local-only, no cloudPushKey - same lesson learned from MLB's
// predictions key silently growing past Firestore's ~1MB cap and getting
// wiped by a stale cloud pull (db-core.js's CLOUD_SYNC_FIELDS comment).

function loadTennisBackfillState() {
  try {
    const raw = localStorage.getItem(TENNIS_BACKFILL_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveTennisBackfillState(state) {
  localStorage.setItem(TENNIS_BACKFILL_STATE_KEY, JSON.stringify(state));
}

function tennisIsoDateOnlyUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function tennisAddDaysISO(dateISO, days) {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return tennisIsoDateOnlyUTC(d);
}

const TENNIS_BACKFILL_LOOKBACK_DAYS = 364; // 52 weeks, matching MLB/UFC's window.
const TENNIS_BACKFILL_SCHEMA = 1;
const TENNIS_BACKFILL_CHUNK = 5;
// Polymarket lists a tennis event's markets shortly before the match itself
// (confirmed live) - start_date_min/max below filters by that LISTING date,
// not the match date, so the server-side window is padded wider than the
// real target range and every result is re-checked precisely afterward
// against the event's own eventDate (the actual scheduled match date).
const TENNIS_BACKFILL_LISTING_PAD_DAYS = 35;

// "ITF Brisbane: A vs B" -> "Brisbane"; a handful of non-ITF titles observed
// ("Winnipeg: A vs B") use the same "{City}: player vs player" shape without
// the prefix, so both are handled by one pattern.
function tennisCityFromEventTitle(title) {
  const m = /^(?:ITF\s+)?(.+?):/.exec(title || '');
  return m ? m[1].trim() : null;
}

async function fetchClosedTennisEventsInWindow(startISO, endISO) {
  const paddedMin = tennisAddDaysISO(startISO, -TENNIS_BACKFILL_LISTING_PAD_DAYS);
  const limit = 100;
  let offset = 0;
  const events = [];
  for (;;) {
    let page;
    try {
      const res = await fetch(`https://gamma-api.polymarket.com/events?tag_slug=tennis&closed=true&limit=${limit}&offset=${offset}&start_date_min=${paddedMin}&start_date_max=${endISO}`);
      if (!res.ok) break;
      page = await res.json();
    } catch (e) {
      break;
    }
    if (!Array.isArray(page) || !page.length) break;
    events.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return events.filter((e) => e.eventDate && e.eventDate >= startISO && e.eventDate <= endISO);
}

// One event -> one stored prediction (or null if anything needed to score it
// honestly is missing - never guessed). regionCache avoids re-resolving the
// same tournament city's region/timezone for every match in that tournament.
async function processTennisBackfillEvent(event, existingByConditionId, regionCache) {
  const m = (event.markets || []).find((mk) => mk.sportsMarketType === 'moneyline');
  if (!m || !m.closed) return null;
  if (existingByConditionId.has(m.conditionId)) return null;

  let outcomes = [];
  let clobTokenIds = [];
  try { outcomes = JSON.parse(m.outcomes); } catch (e) { /* leave empty */ }
  try { clobTokenIds = JSON.parse(m.clobTokenIds); } catch (e) { /* leave empty */ }
  if (!outcomes[0] || !outcomes[1] || clobTokenIds.length < 2) return null;

  const gameStartTime = parseMlbGameStart(m.gameStartTime); // generic timestamp parser, mlb-api.js
  if (!gameStartTime) return null;

  const roster = buildAllPlayers();
  const matchedA = matchPlayer(outcomes[0], roster);
  const matchedB = matchPlayer(outcomes[1], roster);
  if (!matchedA || !matchedB) return null; // not in the player database - skip, don't guess

  const cityName = tennisCityFromEventTitle(event.title);
  if (!cityName) return null;
  let region = regionCache.get(cityName);
  if (region === undefined) {
    region = await resolveIntlRegionForBackfillByCity(cityName);
    regionCache.set(cityName, region);
  }
  if (!region || !region.timezone) return null; // couldn't confirm a region/timezone - don't guess

  const matchDateISO = localMatchDateISO(gameStartTime, 'intl', region);
  if (!matchDateISO) return null;
  const matchDate = tennisParseDateInput(matchDateISO);

  const result = determineTennisResult(m);

  const targetTs = Math.floor(gameStartTime.getTime() / 1000);
  const [priceA, priceB] = await Promise.all([
    fetchClobPriceNear(clobTokenIds[0], targetTs),
    fetchClobPriceNear(clobTokenIds[1], targetTs),
  ]);
  if (priceA == null || priceB == null) return null; // no pregame price data - don't guess

  // No venue-level data for a backfilled match - Day 75% + Region 25%,
  // computeFighterScore's own no-stadium fallback (db-core.js), same blend
  // the live tracker itself uses whenever no venue has been set.
  const regionDate = tennisParseDateInput(region.founded);
  const scoreA = computeFighterScore(tennisParseDateInput(matchedA.dob), matchDate, null, regionDate);
  const scoreB = computeFighterScore(tennisParseDateInput(matchedB.dob), matchDate, null, regionDate);

  const favA = priceA >= priceB;
  const marketFavName = favA ? outcomes[0] : outcomes[1];
  const numFavName = scoreA.combined >= scoreB.combined ? outcomes[0] : outcomes[1];
  const agree = normalizeName(marketFavName) === normalizeName(numFavName);

  return {
    conditionId: m.conditionId,
    playerAName: outcomes[0],
    playerBName: outcomes[1],
    numerologyFavorite: numFavName,
    numerologyScoreA: scoreA.combined,
    numerologyScoreB: scoreB.combined,
    dims: { A: extractDimensionScores(scoreA), B: extractDimensionScores(scoreB) },
    marketFavorite: marketFavName,
    marketPriceA: priceA,
    marketPriceB: priceB,
    pickType: agree ? 'favorite' : 'underdog',
    eventTitle: event.title,
    matchTime: gameStartTime.toISOString(),
    recordedAt: Date.now(),
    result,
  };
}

async function backfillTennisHistory(onProgress) {
  const todayISO = tennisIsoDateOnlyUTC(new Date());
  const state = loadTennisBackfillState();
  const schemaCurrent = state && state.schemaVersion === TENNIS_BACKFILL_SCHEMA;
  const startISO = (schemaCurrent && state.throughDateISO)
    ? tennisAddDaysISO(state.throughDateISO, 1)
    : tennisAddDaysISO(todayISO, -TENNIS_BACKFILL_LOOKBACK_DAYS);
  const endISO = tennisAddDaysISO(todayISO, -1);

  if (startISO > endISO) return { eventsProcessed: 0, newPredictionsCount: 0, alreadyCurrent: true };

  const events = await fetchClosedTennisEventsInWindow(startISO, endISO);
  const existing = loadTennisPredictions();
  const existingByConditionId = new Map(existing.filter((p) => p.conditionId).map((p) => [p.conditionId, p]));
  const regionCache = new Map();

  const newPredictions = [];
  const total = events.length;
  let processed = 0;

  for (let i = 0; i < events.length; i += TENNIS_BACKFILL_CHUNK) {
    const chunk = events.slice(i, i + TENNIS_BACKFILL_CHUNK);
    const results = await Promise.all(chunk.map((ev) => processTennisBackfillEvent(ev, existingByConditionId, regionCache)));
    results.forEach((rec) => {
      if (!rec) return;
      newPredictions.push(rec);
      existingByConditionId.set(rec.conditionId, rec);
    });
    processed += chunk.length;
    if (onProgress) onProgress(processed, total);
  }

  if (newPredictions.length) saveTennisPredictions([...existing, ...newPredictions]);
  saveTennisBackfillState({ throughDateISO: endISO, schemaVersion: TENNIS_BACKFILL_SCHEMA });

  return { eventsProcessed: total, newPredictionsCount: newPredictions.length, alreadyCurrent: false };
}

function initTennisBackfillButton() {
  document.getElementById('tennisBackfillBtn').addEventListener('click', async () => {
    const btn = document.getElementById('tennisBackfillBtn');
    const status = document.getElementById('tennisBackfillStatus');
    btn.disabled = true;
    const original = btn.textContent;
    status.textContent = 'Starting…';
    try {
      const result = await backfillTennisHistory((processed, total) => {
        status.textContent = `Backfilling… ${processed}/${total} matches`;
      });
      status.textContent = result.alreadyCurrent
        ? 'Already caught up to yesterday - nothing new to backfill.'
        : `Done - checked ${result.eventsProcessed} matches, added ${result.newPredictionsCount} matches.`;
      await refreshTennisAndRender();
    } catch (e) {
      status.textContent = 'Something went wrong during backfill - try again.';
    }
    btn.textContent = original;
    btn.disabled = false;
  });
}

document.getElementById('tennisStatsHero').insertAdjacentHTML('beforebegin', dayFilterHtml('tennis'));
document.getElementById('tennisStatsHeroOld').insertAdjacentHTML('beforebegin', dayFilterHtml('tennisOld'));
initDayFilter('tennis', () => { resetPagination('tennisStatsTable'); renderTennisScope('', currentTennisPredictions); });
initDayFilter('tennisOld', () => { resetPagination('tennisStatsTableOld'); renderTennisScope('Old', currentTennisPredictions); });

initBreakdownToggle('tennisBreakdownToggle', ['tennisStatsEdgeTiersBox', 'tennisStatsPriceBucketsBox', 'tennisUniversalDayBox', 'tennisDayEnergyBox', 'tennisDayComboBox', 'tennisDimensionEdgeBox']);
initBreakdownToggle('tennisBreakdownToggleOld', ['tennisStatsEdgeTiersBoxOld', 'tennisStatsPriceBucketsBoxOld', 'tennisUniversalDayBoxOld', 'tennisDayEnergyBoxOld', 'tennisDayComboBoxOld', 'tennisDimensionEdgeBoxOld']);

wireTennisRefreshButton('tennisStatsRefreshBtn');
wireTennisRefreshButton('tennisStatsRefreshBtnOld');
initTennisMatchupModal('');
initTennisMatchupModal('Old');
initModalTabSwitcher('statsTennisSection');
initTennisBackfillButton();
refreshTennisAndRender();

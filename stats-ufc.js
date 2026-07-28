const MARKETS_URL = 'https://gamma-api.polymarket.com/markets';

// Kept around so the matchup popup can look a clicked row's full prediction
// back up by conditionId without re-reading localStorage on every click.
// Shared across the Today/Old scopes - conditionIds are unique across the
// whole set either way.
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

// suffix is '' for the Today scope's DOM ids, 'Old' for Old Data's - both
// scopes render through the exact same functions against a pre-filtered
// subset of the same underlying predictions array, same convention MLB's
// Stats page already established.
function renderHero(stats, suffix = '') {
  const hero = document.getElementById('statsHero' + suffix);

  if (stats.total === 0) {
    hero.innerHTML = `
      <div class="score-names">Numerology Win Rate</div>
      <div class="empty-state">No fights tracked yet &mdash; fight days are picked up automatically when you open this page or the Betting page, and the backfill below fills in history.</div>
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
    <div class="score-big ${winRateClass(stats.overallWinPct)}">${stats.overallWinPct}<span class="score-out-of">%</span></div>
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

function renderBreakdown(stats, suffix = '') {
  document.getElementById('statsBreakdown' + suffix).innerHTML = `
    ${meterRow('✅ When numerology agreed with the favorite', stats.favoriteWinPct, stats.favoriteCount, stats.favoriteWinsCount)}
    ${meterRow('⚡ When numerology picked the underdog', stats.underdogWinPct, stats.underdogCount, stats.underdogWinsCount)}
  `;
}

// The direct empirical test of the whole hypothesis: if numerology works,
// win rate should climb as the score gap widens - and the tossup row
// should sit near 50%, which is its own sanity check. computeEdgeTierStats
// lives in db-core.js, shared with stats-tennis.js.
function renderEdgeTiers(predictions, suffix = '') {
  const tiers = computeEdgeTierStats(predictions);
  const total = tiers.reduce((s, t) => s + t.count, 0);
  document.getElementById('statsEdgeTiers' + suffix).innerHTML = pmTableTotalRow(total, 3) + tiers.map((t) => `
    <tr>
      <td>${t.icon} ${t.label}</td>
      <td>${t.count}</td>
      <td>${t.winPct != null && t.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(t.winPct)}">${t.winPct}%</span>`
        : `<span class="empty-state">${t.count ? `${t.wins}/${t.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
}

// Finer-grained companion to the favorite/underdog meters above - the same
// idea, bucketed by the actual market price of the pick instead of just
// which side of the line it fell on. Feeds the Polymarket tracker's risk
// manager, which looks up the bucket for a live fight's price here.
function renderPriceBuckets(predictions, suffix = '') {
  const buckets = computeBucketStats(predictions);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  document.getElementById('statsPriceBuckets' + suffix).innerHTML = pmTableTotalRow(total, 3) + buckets.map((b) => `
    <tr>
      <td>${b.label}</td>
      <td>${b.count}</td>
      <td>${b.winPct != null && b.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(b.winPct)}">${b.winPct}%</span>`
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

function renderTable(predictions, suffix = '') {
  const tbody = document.getElementById('statsTableBody' + suffix);
  if (!predictions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No fights tracked yet.</td></tr>';
    renderPaginationControls('statsTablePagination' + suffix, 'statsTable' + suffix, 1, 1);
    return;
  }

  const sorted = [...predictions].sort((a, b) => new Date(b.fightTime) - new Date(a.fightTime));
  const { rows, page, totalPages } = paginationSlice('statsTable' + suffix, sorted);
  tbody.innerHTML = rows.map((p) => `
    <tr data-condition-id="${p.conditionId}">
      <td>${formatFightDate(p.fightTime)}</td>
      <td>${escapeHtml(p.fighterAName)} vs ${escapeHtml(p.fighterBName)}</td>
      <td>${escapeHtml(p.numerologyFavorite)}</td>
      <td>${edgeCell(p)}</td>
      <td>${p.pickType === 'favorite' ? 'Favorite' : 'Underdog'}</td>
      <td>${resultBadge(p)}</td>
    </tr>
  `).join('');
  renderPaginationControls('statsTablePagination' + suffix, 'statsTable' + suffix, page, totalPages, () => renderTable(predictions, suffix));
}

function formatOdds(price) {
  return price != null ? `${Math.round(price * 100)}%` : '—';
}

function ufcParseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Mirrors buildAllFighters()/matchFighter() in polymarket-ufc.js - the stored
// prediction only ever kept the fighter's NAME, not their DOB, so the Insight
// tab (and the backfill, which discovers fighters purely by name from
// Polymarket) has to match against the current roster the same way the live
// tracker does. If a fighter was since renamed or removed (or was never
// added), the match simply comes back null and the caller skips rather than
// guessing.
function buildAllFighters() {
  const overrides = loadFighterOverrides();
  const custom = loadCustomFighters();
  const seedFighters = UFC_FIGHTERS.map((f, idx) => {
    const id = `seed-${idx}`;
    const override = overrides[id];
    return override ? { id, name: override.name, dob: override.dob } : { id, name: f.name, dob: f.dob };
  });
  return seedFighters.concat(custom);
}

function matchFighter(name, roster) {
  const norm = normalizeName(name);
  if (!norm) return null;

  let found = roster.find((f) => normalizeName(f.name) === norm);
  if (found) return found;

  const tokens = norm.split(' ');
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  found = roster.find((f) => {
    const rTokens = normalizeName(f.name).split(' ');
    return rTokens[0] === first && rTokens[rTokens.length - 1] === last;
  });
  return found || null;
}

function insightTabHtml(p) {
  const roster = buildAllFighters();
  const matchedA = matchFighter(p.fighterAName, roster);
  const matchedB = matchFighter(p.fighterBName, roster);
  if (!matchedA || !matchedB) {
    return '<div class="pm-unmatched">One or both fighters aren\'t in the current database anymore (renamed or removed since this pick was recorded), so a life path reading isn\'t available here.</div>';
  }
  const infoA = compatLifePathInfo(ufcParseDateInput(matchedA.dob));
  const infoB = compatLifePathInfo(ufcParseDateInput(matchedB.dob));
  const pair = pairInsight(infoA.lookupValue, infoB.lookupValue);
  // Universal Day - each fighter's own life path vs. the fight date itself,
  // added alongside the fighter-vs-fighter read above, not instead of it.
  // The original region/timezone isn't stored on the prediction, so this
  // reads the fight's UTC timestamp in the browser's own local time rather
  // than the venue's - a reasonable approximation for a historical,
  // informational-only read, not the exact figure the live tracker showed.
  const matchDate = p.fightTime ? new Date(p.fightTime) : null;
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

// Everything shown here was already captured either live (recordPredictionIfNew
// in polymarket-ufc.js) or by the backfill below the moment the fight's edge
// was first computed - this just replays it, it's not fetched fresh.
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

  const hero = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(p.fighterAName)} <span class="score-vs">&times;</span> ${escapeHtml(p.fighterBName)}</div>
    </div>
    <div class="pm-breakdown-hint" style="text-align:center;">${escapeHtml(p.eventTitle)} &middot; ${formatFightDate(p.fightTime)}</div>
  `;
  const breakdown = `
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
  return hero + modalTabsHtml(breakdown, insightTabHtml(p));
}

function initMatchupModal(suffix = '') {
  document.getElementById('statsTableBody' + suffix).addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-condition-id]');
    if (!row) return;
    const p = currentPredictions.find((x) => x.conditionId === row.dataset.conditionId);
    if (!p) return;
    document.getElementById('statsMatchupBody' + suffix).innerHTML = matchupModalHtml(p);
    document.getElementById('statsMatchupOverlay' + suffix).classList.add('active');
  });

  document.getElementById('statsMatchupClose' + suffix).addEventListener('click', () => {
    document.getElementById('statsMatchupOverlay' + suffix).classList.remove('active');
  });
  document.getElementById('statsMatchupOverlay' + suffix).addEventListener('click', (e) => {
    if (e.target.id === 'statsMatchupOverlay' + suffix) document.getElementById('statsMatchupOverlay' + suffix).classList.remove('active');
  });
  initModalTabSwitcher('statsMatchupBody' + suffix);
}

// Today/Old each keep their own day-filter state ('ufc' + suffix, see
// db-core.js's dayFilterPredicate) since they're independent tabs a user
// might want sliced differently. The day-number/day-combo tables always get
// todayOrOldPredictions (scoped to the tab, not the day filter) - that's the
// whole point of those tables, a side-by-side view the filter itself can't
// give.
function renderUfcScope(suffix, predictions) {
  const isOld = suffix === 'Old';
  const todayOrOldPredictions = predictions.filter((p) => isTodayLocal(p.fightTime) === !isOld);
  const matchesDay = dayFilterPredicate('ufc' + suffix);
  const scopedPredictions = todayOrOldPredictions.filter((p) => matchesDay(p.fightTime));

  const stats = computeStats(scopedPredictions);
  renderHero(stats, suffix);
  renderBreakdown(stats, suffix);
  renderEdgeTiers(scopedPredictions, suffix);
  renderPriceBuckets(scopedPredictions, suffix);
  renderDimensionEdgeTable('ufcDimensionEdge' + suffix, scopedPredictions, (p) => [p.fighterAName, p.fighterBName]);
  renderTable(scopedPredictions, suffix);
  renderDayNumberTable('statsUniversalDay' + suffix, todayOrOldPredictions, 'fightTime', universalDayNumber, DAY_FILTER_UNIVERSAL_OPTIONS, 'Universal Day');
  renderDayNumberTable('statsDayEnergy' + suffix, todayOrOldPredictions, 'fightTime', getReducedDay, DAY_FILTER_ENERGY_OPTIONS, 'Day Energy');
  renderDayComboTable('statsDayCombo' + suffix, todayOrOldPredictions, 'fightTime');
  document.getElementById('statsLastUpdated' + suffix).textContent = `Last checked ${new Date().toLocaleTimeString()}`;
}

async function refreshAndRenderUfc() {
  const predictions = await checkResults();
  currentPredictions = predictions;
  renderUfcScope('', predictions);
  renderUfcScope('Old', predictions);
  // Fill today's card behind the first paint (recordTodaysUfcFights below) -
  // best-effort and non-blocking, same pattern as MLB's refresh.
  try {
    await recordTodaysUfcFights();
    const preds2 = loadUfcPredictions();
    currentPredictions = preds2;
    renderUfcScope('', preds2);
  } catch (e) { /* today fill is best-effort */ }
}

function wireUfcRefreshButton(btnId) {
  document.getElementById(btnId).addEventListener('click', async () => {
    const btn = document.getElementById(btnId);
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '🔄 Checking…';
    await refreshAndRenderUfc();
    btn.textContent = original;
    btn.disabled = false;
  });
}

/* ===================== Historical backfill (UFC) ===================== */
// Mirrors MLB's backfill (stats-mlb.js) in spirit, adapted to what's actually
// available for UFC: there's no official league schedule API the way MLB has
// one, so fights are discovered purely from Polymarket's own closed UFC
// events. And unlike MLB (venue -> official region) or Tennis (tournament
// city parsed straight from the event title), UFC has no reliable per-fight
// venue/location source at all - the only mention of one is buried in a
// loose AI-generated paragraph, not something worth trusting. Every UFC
// pick everywhere is therefore scored on the Day anchor only
// (computeFighterScore's now-optional stateDate, db-core.js) - the live
// tracker and the auto today-tracker above score the exact same way, so the
// whole UFC record shares one basis rather than guessing a venue.

const UFC_BACKFILL_STATE_KEY = 'numerology_ufc_backfill_state';
// Deliberately local-only, no cloudPushKey - same lesson learned from MLB's
// predictions key silently growing past Firestore's ~1MB cap and getting
// wiped by a stale cloud pull (db-core.js's CLOUD_SYNC_FIELDS comment).

function loadUfcBackfillState() {
  try {
    const raw = localStorage.getItem(UFC_BACKFILL_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveUfcBackfillState(state) {
  localStorage.setItem(UFC_BACKFILL_STATE_KEY, JSON.stringify(state));
}

function ufcIsoDateOnlyUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function ufcAddDaysISO(dateISO, days) {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return ufcIsoDateOnlyUTC(d);
}

const UFC_BACKFILL_LOOKBACK_DAYS = 364; // 52 weeks, matching MLB's window.
// v2: the very first run added the missing order=eventDate to the event
// query (fetchClosedUfcEventsInWindow) - without it the result set was
// dominated by parlay/prop meta-events sharing the same tag, so real fight
// events could sit unreached many pages deep and that first run finished
// having added nothing, while still saving a "complete through yesterday"
// marker. Same lesson as MLB's backfill schema bumps: a schema-current
// marker only ever continues forward from its own throughDateISO, so the
// fix alone can't retroactively re-walk a day already (wrongly) marked done.
// v3: the v2 run correctly discovered real fight cards but still added
// nothing, because matchFighter can only match a fighter already added by
// hand (via the live tracker's "Add Fighter" flow) - the roster had ~22
// entries against 52 weeks of fights. ensureFighterInRoster now auto-adds
// an unmatched fighter via the same Wikidata lookup "Add Fighter" itself
// uses, instead of just skipping them.
// v4: the scoring day is the event's own eventDate (the billed fight date),
// not the browser-local calendar date of the UTC start timestamp. Verified
// against live data: a late US card's UTC timestamp rolls past midnight
// (UFC Freedom 250 - billed 2026-06-14, gameStartTime 2026-06-15T00:00Z)
// while eventDate stays on the billed day, and the old timestamp-local way
// also made the day depend on whichever device happened to run the walk.
// v5: fighter names come from the event TITLE (ufcResolveSideNames,
// db-core.js) so the surname-only outcome era (< ~March 2026) matches, and
// the birthdate lookup gained the label-search fallback - together these
// recover the ~4 of 5 available fights the old walk silently dropped (74
// stored of 397 available, measured live; zero of the losses were prices).
// v6: scoring switched to UFC_COMPAT_WEIGHTS (year-animal-only, db-core.js)
// - a SCORING change, so existing records need a Wipe & Rebuild to
// re-score; the bump alone only re-walks and adds.
const UFC_BACKFILL_SCHEMA = 6;
const UFC_BACKFILL_CHUNK = 5;
// Polymarket lists a UFC event's markets roughly 1-3 weeks before the fight
// itself (confirmed live) - start_date_min/max below filters by that LISTING
// date, not the fight date, so the server-side window is padded wider than
// the real target range and every result is re-checked precisely afterward
// against the event's own eventDate (the actual scheduled fight date).
const UFC_BACKFILL_LISTING_PAD_DAYS = 35;

async function fetchClosedUfcEventsInWindow(startISO, endISO) {
  const paddedMin = ufcAddDaysISO(startISO, -UFC_BACKFILL_LISTING_PAD_DAYS);
  const limit = 100;
  let offset = 0;
  const events = [];
  for (;;) {
    let page;
    try {
      // order=eventDate is load-bearing, not cosmetic - without it, confirmed
      // live, the tag_slug=ufc result set is dominated by parlay/method-of-
      // victory/prop meta-events that share the same tag but aren't real
      // fights, and a real fight card's own event can sit many pages deep
      // behind them. Sorted by eventDate, the real per-fight events surface
      // directly.
      const res = await fetch(`https://gamma-api.polymarket.com/events?tag_slug=ufc&closed=true&limit=${limit}&offset=${offset}&start_date_min=${paddedMin}&start_date_max=${endISO}&order=eventDate&ascending=false`);
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

// Backfill hits fighters far outside anyone's ever manually added - the
// roster only ever grows one card at a time from the live tracker's "Add
// Fighter" flow, so a 52-week historical walk would match almost nothing
// without this. Same Wikidata lookup that flow already uses
// (lookupKeyDateByName, db-core.js); a miss (no Wikidata birthdate) is left
// unmatched rather than guessed. rosterCache holds the in-flight/resolved
// PROMISE per name (not just the result) so two fights in the same
// concurrent chunk that share a never-seen name share one lookup instead of
// both racing to add a duplicate custom fighter.
// A person counts as a fighter for the label-search fallback when their
// Wikidata description reads like one - MMA first, plus the combat-sport
// backgrounds UFC fighters actually arrive from ("Russian sambo fighter"
// is a real UFC prelim fighter's description, verified live).
const UFC_FIGHTER_DESC_RE = /mixed martial|mma|fighter|kickbox|wrestl|jiu[- ]?jitsu|judo|sambo|boxer|boxing/i;

function ensureFighterInRoster(name, rosterCache) {
  const found = matchFighter(name, buildAllFighters());
  if (found) return Promise.resolve(found);

  if (!rosterCache.has(name)) {
    // Article-title lookup first (unchanged), then the Wikidata label
    // search (db-core.js) for the many fighters who have a day-precision
    // birthdate on Wikidata but no English Wikipedia article - measured
    // live, that gap alone cost ~4 of every 5 available fights.
    rosterCache.set(name, lookupKeyDateByName(name)
      .catch(() => null)
      .then((info) => ((info && info.kind === 'born')
        ? info
        : lookupPersonDobByLabelSearch(name, UFC_FIGHTER_DESC_RE)))
      .then((info) => {
        if (!info || info.kind !== 'born') return null;
        const fighter = { id: uid(), name, dob: info.date };
        const custom = loadCustomFighters();
        custom.push(fighter);
        saveCustomFighters(custom);
        return fighter;
      }).catch(() => null));
  }
  return rosterCache.get(name);
}

// One event -> one stored prediction (or null if anything needed to score it
// honestly is missing - never guessed). existingByConditionId both dedups
// against already-tracked fights and guards against re-processing the same
// fight twice within one backfill run.
async function processUfcBackfillEvent(event, existingByConditionId, rosterCache) {
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

  // Full names from the event title where outcomes[] only carries surnames
  // (every event before ~March 2026) - side.nameA stays outcomes[0]'s
  // fighter, so prices and results keep their indexing.
  const side = ufcResolveSideNames(outcomes, event.title);
  const [matchedA, matchedB] = await Promise.all([
    ensureFighterInRoster(side.nameA, rosterCache),
    ensureFighterInRoster(side.nameB, rosterCache),
  ]);
  if (!matchedA || !matchedB) return null; // no Wikidata birthdate either - skip, don't guess

  const result = determineResult(m);

  const targetTs = Math.floor(gameStartTime.getTime() / 1000);
  const [priceA, priceB] = await Promise.all([
    fetchClobPriceNear(clobTokenIds[0], targetTs),
    fetchClobPriceNear(clobTokenIds[1], targetTs),
  ]);
  if (priceA == null || priceB == null) return null; // no pregame price data - don't guess

  // Scored on the event's billed date, not the timestamp's browser-local
  // date - deterministic on every device, and stays on the right side of
  // midnight for late US cards (see the v4 schema note above). The window
  // filter in fetchClosedUfcEventsInWindow already guarantees eventDate.
  // UFC_COMPAT_WEIGHTS: year-animal-only scoring (db-core.js, v6 note).
  const fightDay = ufcParseDateInput(event.eventDate);
  const scoreA = computeFighterScore(ufcParseDateInput(matchedA.dob), fightDay, null, null, false, UFC_COMPAT_WEIGHTS);
  const scoreB = computeFighterScore(ufcParseDateInput(matchedB.dob), fightDay, null, null, false, UFC_COMPAT_WEIGHTS);

  const favA = priceA >= priceB;
  const marketFavName = favA ? side.nameA : side.nameB;
  const numFavName = scoreA.combined >= scoreB.combined ? side.nameA : side.nameB;
  const agree = normalizeName(marketFavName) === normalizeName(numFavName);

  return {
    conditionId: m.conditionId,
    fighterAName: side.nameA,
    fighterBName: side.nameB,
    numerologyFavorite: numFavName,
    numerologyScoreA: scoreA.combined,
    numerologyScoreB: scoreB.combined,
    dims: { A: extractDimensionScores(scoreA), B: extractDimensionScores(scoreB) },
    marketFavorite: marketFavName,
    marketPriceA: priceA,
    marketPriceB: priceB,
    pickType: agree ? 'favorite' : 'underdog',
    eventTitle: event.title,
    fightTime: gameStartTime.toISOString(),
    recordedAt: Date.now(),
    result,
  };
}

async function backfillUfcHistory(onProgress) {
  const todayISO = ufcIsoDateOnlyUTC(new Date());
  const state = loadUfcBackfillState();
  const schemaCurrent = state && state.schemaVersion === UFC_BACKFILL_SCHEMA;
  const startISO = (schemaCurrent && state.throughDateISO)
    ? ufcAddDaysISO(state.throughDateISO, 1)
    : ufcAddDaysISO(todayISO, -UFC_BACKFILL_LOOKBACK_DAYS);
  const endISO = ufcAddDaysISO(todayISO, -1);

  if (startISO > endISO) return { eventsProcessed: 0, newPredictionsCount: 0, alreadyCurrent: true };

  const events = await fetchClosedUfcEventsInWindow(startISO, endISO);
  const existing = loadUfcPredictions();
  const existingByConditionId = new Map(existing.filter((p) => p.conditionId).map((p) => [p.conditionId, p]));
  const rosterCache = new Map();

  const newPredictions = [];
  const total = events.length;
  let processed = 0;

  for (let i = 0; i < events.length; i += UFC_BACKFILL_CHUNK) {
    const chunk = events.slice(i, i + UFC_BACKFILL_CHUNK);
    const results = await Promise.all(chunk.map((ev) => processUfcBackfillEvent(ev, existingByConditionId, rosterCache)));
    results.forEach((rec) => {
      if (!rec) return;
      newPredictions.push(rec);
      existingByConditionId.set(rec.conditionId, rec);
    });
    processed += chunk.length;
    if (onProgress) onProgress(processed, total);
  }

  if (newPredictions.length) saveUfcPredictions([...existing, ...newPredictions]);
  saveUfcBackfillState({ throughDateISO: endISO, schemaVersion: UFC_BACKFILL_SCHEMA });

  return { eventsProcessed: total, newPredictionsCount: newPredictions.length, alreadyCurrent: false };
}

/* ===================== Today's fights (auto-tracking) ===================== */
// UFC counterpart of recordTodaysMlbGames (stats-mlb.js): pull today's OPEN
// Polymarket UFC moneylines and record a pick for any fight not already
// stored - scored on the Day anchor only, the exact basis the backfill above
// already uses (UFC has no reliable per-fight venue source, so nothing
// venue-shaped is guessed). Runs from both the Stats page refresh and the
// Betting page's refresh, so a fight card gets tracked automatically every
// day it's opened - no live tracker visit, no location picking.
//
// Only fights that HAVEN'T started yet are recorded here, which MLB's
// version doesn't guard for: a mid-fight price is not a pregame price, and a
// fight missed before its start is caught by the daily backfill instead,
// with a real pregame CLOB price - strictly more honest than freezing
// whatever the market drifted to mid-round.

async function fetchOpenUfcMoneylines() {
  let events = [];
  try {
    // Same keyset feed the live tracker reads (its GAMMA_EVENTS_URL) -
    // duplicated here because polymarket-ufc.js never loads on the Stats or
    // Betting pages.
    const res = await fetch('https://gamma-api.polymarket.com/events/keyset?tag_slug=ufc&closed=false&limit=100');
    if (!res.ok) return [];
    const data = await res.json();
    events = Array.isArray(data.events) ? data.events : [];
  } catch (e) {
    return [];
  }
  const fights = [];
  events.forEach((ev) => {
    (ev.markets || []).forEach((m) => {
      if (m.sportsMarketType !== 'moneyline') return;
      if (m.closed || m.active === false) return;
      let outcomes = [];
      let prices = [];
      try { outcomes = JSON.parse(m.outcomes); } catch (e) { /* leave empty */ }
      try { prices = JSON.parse(m.outcomePrices).map(Number); } catch (e) { /* leave empty */ }
      const gameStartTime = parseMlbGameStart(m.gameStartTime); // generic timestamp parser, mlb-api.js
      if (!outcomes[0] || !outcomes[1] || !gameStartTime) return;
      if (!ev.eventDate) return; // no billed fight date - can't pin the scoring day, don't guess
      if (!Number.isFinite(prices[0]) || !Number.isFinite(prices[1])) return;
      // Full names from the title where outcomes[] are surnames - the
      // A-side stays outcomes[0]'s fighter (ufcResolveSideNames, db-core.js).
      const side = ufcResolveSideNames(outcomes, ev.title);
      fights.push({
        conditionId: m.conditionId,
        fighterAName: side.nameA,
        fighterBName: side.nameB,
        priceA: prices[0],
        priceB: prices[1],
        gameStartTime,
        eventDate: ev.eventDate,
        eventTitle: ev.title,
      });
    });
  });
  return fights;
}

async function recordTodaysUfcFights() {
  const fights = await fetchOpenUfcMoneylines();
  const now = Date.now();
  const nowD = new Date();
  const todayISO = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
  // "Today's card" is anything billed for today (eventDate) OR starting on
  // today's local calendar date - the OR matters both ways: a late US main
  // event's UTC timestamp rolls into tomorrow while its eventDate stays on
  // the billed day (so eventDate catches it the evening you'd actually bet
  // it), and a viewer checking just after midnight still catches the card
  // whose fights start "today" off yesterday's billed date.
  const todays = fights.filter((f) => (f.eventDate === todayISO || isTodayLocal(f.gameStartTime.toISOString()))
    && f.gameStartTime.getTime() > now);
  if (!todays.length) return;

  const existing = loadUfcPredictions();
  const existingCond = new Set(existing.map((p) => p.conditionId));
  const rosterCache = new Map();
  const newPredictions = [];

  await Promise.all(todays.map(async (f) => {
    if (existingCond.has(f.conditionId)) return; // already stored (here, live tracker, or backfill)
    const [matchedA, matchedB] = await Promise.all([
      ensureFighterInRoster(f.fighterAName, rosterCache),
      ensureFighterInRoster(f.fighterBName, rosterCache),
    ]);
    if (!matchedA || !matchedB) return; // no Wikidata birthdate either - skip, don't guess

    // Scored on the billed fight date, same as the backfill (v4 note above) -
    // never the timestamp's browser-local date, which flips with the device.
    // UFC_COMPAT_WEIGHTS: year-animal-only scoring (db-core.js, v6 note).
    const fightDay = ufcParseDateInput(f.eventDate);
    const scoreA = computeFighterScore(ufcParseDateInput(matchedA.dob), fightDay, null, null, false, UFC_COMPAT_WEIGHTS);
    const scoreB = computeFighterScore(ufcParseDateInput(matchedB.dob), fightDay, null, null, false, UFC_COMPAT_WEIGHTS);

    const marketFavName = f.priceA >= f.priceB ? f.fighterAName : f.fighterBName;
    const numFavName = scoreA.combined >= scoreB.combined ? f.fighterAName : f.fighterBName;
    const agree = normalizeName(marketFavName) === normalizeName(numFavName);

    newPredictions.push({
      conditionId: f.conditionId,
      fighterAName: f.fighterAName,
      fighterBName: f.fighterBName,
      numerologyFavorite: numFavName,
      numerologyScoreA: scoreA.combined,
      numerologyScoreB: scoreB.combined,
      dims: { A: extractDimensionScores(scoreA), B: extractDimensionScores(scoreB) },
      marketFavorite: marketFavName,
      marketPriceA: f.priceA,
      marketPriceB: f.priceB,
      pickType: agree ? 'favorite' : 'underdog',
      eventTitle: f.eventTitle,
      fightTime: f.gameStartTime.toISOString(),
      recordedAt: Date.now(),
      result: null,
    });
    existingCond.add(f.conditionId);
  }));

  if (newPredictions.length) saveUfcPredictions([...existing, ...newPredictions]);
}

function initUfcBackfillButton() {
  document.getElementById('ufcBackfillBtn').addEventListener('click', async () => {
    const btn = document.getElementById('ufcBackfillBtn');
    const status = document.getElementById('ufcBackfillStatus');
    btn.disabled = true;
    const original = btn.textContent;
    status.textContent = 'Starting…';
    try {
      const result = await backfillUfcHistory((processed, total) => {
        status.textContent = `Backfilling… ${processed}/${total} fight cards`;
      });
      status.textContent = result.alreadyCurrent
        ? 'Already caught up to yesterday - nothing new to backfill.'
        : `Done - checked ${result.eventsProcessed} fight cards, added ${result.newPredictionsCount} fights.`;
      await refreshAndRenderUfc();
    } catch (e) {
      status.textContent = 'Something went wrong during backfill - try again.';
    }
    btn.textContent = original;
    btn.disabled = false;
  });
}

// Backfill can only ADD fights - it dedupes by conditionId, so records
// written before the day-only rebuild (live-tracked with a hand-picked
// stadium/state) keep their old scoring basis forever. This clears the
// store and the backfill marker together and re-walks the full window, so
// every stored UFC pick lands on the one basis every page now scores with.
// withMlbScreenAwake lives in stats-mlb.js - generic despite the name, and
// always loaded wherever this button exists.
function initUfcRebuildButton() {
  const btn = document.getElementById('ufcRebuildBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const existing = loadUfcPredictions().length;
    if (!confirm(`Delete all ${existing} stored UFC picks and re-walk the full window from scratch?\n\nThis cannot be undone - keep this tab open and awake until it finishes.`)) return;

    const status = document.getElementById('ufcBackfillStatus');
    const backfillBtn = document.getElementById('ufcBackfillBtn');
    const original = btn.textContent;
    btn.disabled = true;
    if (backfillBtn) backfillBtn.disabled = true;
    btn.textContent = '♻️ Rebuilding…';
    try {
      status.textContent = `Clearing ${existing} stored picks…`;
      saveUfcPredictions([]);
      saveUfcBackfillState({});
      const result = await withMlbScreenAwake(() => backfillUfcHistory((processed, total) => {
        status.textContent = `Rebuilding… ${processed}/${total} fight cards`;
      }));
      status.textContent = `Rebuilt from scratch - checked ${result.eventsProcessed} fight cards, stored ${result.newPredictionsCount} fights.`;
      await refreshAndRenderUfc();
    } catch (e) {
      // The store is empty at this point, so a failure here is not cosmetic -
      // say so plainly rather than leaving a half-rebuilt store looking done.
      status.textContent = `Rebuild failed after clearing the store: ${e && e.message ? e.message : e}. Press Backfill Data to fill it back in.`;
      console.error('UFC rebuild failed', e);
    }
    btn.textContent = original;
    btn.disabled = false;
    if (backfillBtn) backfillBtn.disabled = false;
  });
}

/* ===================== Weights Lab (UFC) ===================== */
// Replays every resolved UFC pick under candidate weight blends, using the
// per-side dimension vectors stored on each pick (dims.A/dims.B) - the same
// inputs the dimension-edge table reads, so the two can never disagree
// about the underlying data. A blend's score is Σ w_k · dims[k] plus the
// lucky bonus (ADDED, not weighted - exactly how the live engine treats it,
// compat-engine.js). A pick is skipped for a blend when any weighted
// dimension is missing on either side (records from before the zodiac
// year/month/day split), or when the blend ties the two sides - no lean,
// no pick, the dimension table's own rule. Wins settle through
// resultWinnerIs, the same answer the headline stats use.
//
// Everything here is IN-SAMPLE: the top row is best-in-hindsight on the
// exact fights it was scored over - a shortlist for the forward test, not
// proof. The MLB reweight measured +46% in-fit vs -6% out-of-fit on this
// same kind of exercise.

const UFC_LAB_NAMED_BLENDS = [
  { label: 'Old default blend (life path 36 · zodiac 30 · day num 21 · sun 10 · doy 3)', w: { lifePath: 0.36, zodiac: 0.30, dayNum: 0.21, western: 0.10, doy: 0.03 } },
  { label: 'Zodiac only', w: { zodiac: 1 } },
  { label: 'Zodiac 70 · day number 20 · sun sign 10', w: { zodiac: 0.70, dayNum: 0.20, western: 0.10 } },
  { label: 'MLB recipe (day num 34 · zodiac 25 · life path 22 · doy 19)', w: { dayNum: 0.3375, zodiac: 0.25, lifePath: 0.225, doy: 0.1875 } },
  // The zodiac dimension is itself year 60 / month 30 / day 10 - these
  // split the one dimension with signal open, so the lab can say WHERE in
  // it the signal lives. Need picks recorded after the split (rebuild).
  { label: 'Zodiac year animal only', w: { zodiacYear: 1 } },
  { label: 'Zodiac month sign only', w: { zodiacMonth: 1 } },
  { label: 'Zodiac day sign only', w: { zodiacDay: 1 } },
  { label: 'Zodiac month 60 · day sign 40 (no year)', w: { zodiacMonth: 0.60, zodiacDay: 0.40 } },
];

// Every way to split 100% across the five flat dimensions in 25% steps -
// 70 blends, cheap to replay, broad enough to catch a shape no one named.
const UFC_LAB_GRID_DIMS = ['zodiac', 'dayNum', 'lifePath', 'western', 'doy'];
const UFC_LAB_GRID_STEPS = 4;

function ufcLabGridBlends() {
  const out = [];
  const walk = (idx, left, acc) => {
    if (idx === UFC_LAB_GRID_DIMS.length - 1) {
      const w = { ...acc };
      if (left) w[UFC_LAB_GRID_DIMS[idx]] = left / UFC_LAB_GRID_STEPS;
      if (Object.keys(w).length) out.push(w);
      return;
    }
    for (let units = 0; units <= left; units++) {
      const w = { ...acc };
      if (units) w[UFC_LAB_GRID_DIMS[idx]] = units / UFC_LAB_GRID_STEPS;
      walk(idx + 1, left - units, w);
    }
  };
  walk(0, UFC_LAB_GRID_STEPS, {});
  return out;
}

function ufcLabBlendLabel(w) {
  const names = { zodiac: 'zodiac', dayNum: 'day num', lifePath: 'life path', western: 'sun', doy: 'doy', zodiacYear: 'zodiac yr', zodiacMonth: 'zodiac mo', zodiacDay: 'zodiac day' };
  return Object.keys(w).map((k) => `${names[k] || k} ${Math.round(w[k] * 100)}`).join(' · ');
}

// Per-side scorer for a blend - null when any weighted dimension is
// missing on that side, which skips the pick rather than scoring half a
// blend.
function ufcLabBlendScorer(w, side) {
  return (p) => {
    let total = 0;
    for (const k of Object.keys(w)) {
      const v = p.dims[side][k];
      if (v == null) return null;
      total += w[k] * v;
    }
    return total + (p.dims[side].lucky || 0);
  };
}

function ufcLabEvaluate(resolved, scoreAOf, scoreBOf) {
  let n = 0;
  let wins = 0;
  let impliedSum = 0;
  resolved.forEach((p) => {
    const a = scoreAOf(p);
    const b = scoreBOf(p);
    if (a == null || b == null || a === b) return;
    const favA = a > b;
    const favName = favA ? p.fighterAName : p.fighterBName;
    const implied = favA ? p.marketPriceA : p.marketPriceB;
    if (implied == null) return;
    n++;
    impliedSum += implied;
    if (resultWinnerIs(p.result.winner, favName, p.fighterAName, p.fighterBName)) wins++;
  });
  if (!n) return { count: 0, winPct: null, marketPct: null, edge: null };
  const winPct = Math.round((wins / n) * 100);
  const marketPct = Math.round((impliedSum / n) * 100);
  return { count: n, winPct, marketPct, edge: winPct - marketPct };
}

function ufcLabRowHtml(label, r, star) {
  const edgeCell = (r.edge != null && r.count >= MIN_BUCKET_SAMPLE)
    ? `<span class="score-inline ${r.edge > 0 ? 'good' : (r.edge < 0 ? 'bad' : '')}">${r.edge > 0 ? '+' : ''}${r.edge}</span>`
    : `<span class="empty-state">${r.count ? 'thin' : 'needs rebuild'}</span>`;
  return `<tr${star ? ' style="border-top:2px solid var(--border);"' : ''}><td>${star ? '🎯 ' : ''}${escapeHtml(label)}</td><td>${r.count}</td><td>${r.winPct != null ? `${r.winPct}%` : '—'}</td><td>${r.marketPct != null ? `${r.marketPct}%` : '—'}</td><td>${edgeCell}</td></tr>`;
}

function runUfcWeightsLab() {
  const el = document.getElementById('ufcWeightsLabResults');
  const resolved = loadUfcPredictions().filter((p) => p.result && !p.result.draw && p.dims && p.dims.A && p.dims.B);
  if (!resolved.length) {
    el.innerHTML = '<div class="empty-state">No resolved picks with dimension data yet &mdash; backfill first.</div>';
    return;
  }

  // The honest baseline: the composite exactly as recorded (rounding, cap
  // and all), same accessor the dimension table's Full Score row uses.
  const composite = ufcLabEvaluate(resolved, (p) => p.numerologyScoreA, (p) => p.numerologyScoreB);

  const named = UFC_LAB_NAMED_BLENDS
    .map((c) => ({ label: c.label, r: ufcLabEvaluate(resolved, ufcLabBlendScorer(c.w, 'A'), ufcLabBlendScorer(c.w, 'B')) }))
    .sort((x, y) => (y.r.edge == null ? -Infinity : y.r.edge) - (x.r.edge == null ? -Infinity : x.r.edge));

  const namedSigs = new Set(UFC_LAB_NAMED_BLENDS.map((c) => ufcLabBlendLabel(c.w)));
  const grid = ufcLabGridBlends()
    .filter((w) => !namedSigs.has(ufcLabBlendLabel(w)))
    .map((w) => ({ label: ufcLabBlendLabel(w), r: ufcLabEvaluate(resolved, ufcLabBlendScorer(w, 'A'), ufcLabBlendScorer(w, 'B')) }))
    .filter((x) => x.r.count > 0)
    .sort((x, y) => y.r.edge - x.r.edge)
    .slice(0, 8);

  el.innerHTML = `
    <div class="pm-table-total">Resolved picks replayed: ${resolved.length}</div>
    <table class="astro-table">
      <thead><tr><th>Blend</th><th>Picks</th><th>Win%</th><th>Market%</th><th>Edge</th></tr></thead>
      <tbody>
        ${ufcLabRowHtml('Current blend as recorded', composite, true)}
        ${named.map((x) => ufcLabRowHtml(x.label, x.r)).join('')}
        <tr><td colspan="5" class="empty-state" style="text-align:center;">&mdash; top finds from a 25%-step sweep of zodiac / day num / life path / sun / doy &mdash;</td></tr>
        ${grid.map((x) => ufcLabRowHtml(x.label, x.r)).join('')}
      </tbody>
    </table>`;
}

function initUfcWeightsLab() {
  const btn = document.getElementById('ufcWeightsLabBtn');
  if (!btn) return;
  btn.addEventListener('click', runUfcWeightsLab);
}

// Wire the Stats page DOM only when it exists - this file also loads on
// betting.html purely for checkResults() and the shared prediction helpers,
// so the Betting page settles results through the exact same code path.
bigStoreReadyPromise.then(() => {
 if (document.getElementById('statsUfcSection')) {
  document.getElementById('statsHero').insertAdjacentHTML('beforebegin', dayFilterHtml('ufc'));
  document.getElementById('statsHeroOld').insertAdjacentHTML('beforebegin', dayFilterHtml('ufcOld'));
  initDayFilter('ufc', () => { resetPagination('statsTable'); renderUfcScope('', currentPredictions); });
  initDayFilter('ufcOld', () => { resetPagination('statsTableOld'); renderUfcScope('Old', currentPredictions); });

  initBreakdownToggle('statsBreakdownToggle', ['statsEdgeTiersBox', 'statsPriceBucketsBox', 'statsUniversalDayBox', 'statsDayEnergyBox', 'statsDayComboBox', 'ufcDimensionEdgeBox']);
  initBreakdownToggle('statsBreakdownToggleOld', ['statsEdgeTiersBoxOld', 'statsPriceBucketsBoxOld', 'statsUniversalDayBoxOld', 'statsDayEnergyBoxOld', 'statsDayComboBoxOld', 'ufcDimensionEdgeBoxOld', 'ufcWeightsLabBox']);

  wireUfcRefreshButton('statsRefreshBtn');
  wireUfcRefreshButton('statsRefreshBtnOld');
  initMatchupModal('');
  initMatchupModal('Old');
  initModalTabSwitcher('statsUfcSection');
  initUfcBackfillButton();
  initUfcRebuildButton();
  initUfcWeightsLab();
  refreshAndRenderUfc();
 }
});

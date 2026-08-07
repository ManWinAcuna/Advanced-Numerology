const GAMMA_EVENTS_URL = 'https://gamma-api.polymarket.com/events/keyset?tag_slug=tennis&closed=false&limit=100';
const TRADES_URL = 'https://data-api.polymarket.com/trades';
const LEADERBOARD_ALL_URL = 'https://data-api.polymarket.com/v1/leaderboard?category=SPORTS&timePeriod=ALL&orderBy=PNL&limit=50';
const LEADERBOARD_MONTH_URL = 'https://data-api.polymarket.com/v1/leaderboard?category=SPORTS&timePeriod=MONTH&orderBy=PNL&limit=50';

const WHALE_THRESHOLD_USD = 500;
const TRADES_POLL_MS = 20000;
const EVENTS_POLL_MS = 5 * 60 * 1000;
const LOOKBACK_MS = 6 * 3600 * 1000; // still show matches that started up to this long ago (likely still live)
// Unlike a UFC card (one night, one venue), tennis runs many tournaments at
// once in different cities across several days - so instead of anchoring to
// "the next card," this just shows everything coming up over the next few days.
const FORWARD_WINDOW_MS = 3 * 24 * 3600 * 1000;

let leaderboardMap = new Map();
let allMatches = [];
const matchesByTournament = new Map();
const tradesCache = new Map();

/* ===================== Manually-dismissed matches ===================== */
// Same "I've seen this finish" local note as polymarket-ufc.js's dismissed
// fights - layered on top of Polymarket's own closed/active filtering below.
const DISMISSED_MATCHES_KEY = 'numerology_tennis_pm_dismissed_matches';

function loadDismissedMatches() {
  try {
    const raw = localStorage.getItem(DISMISSED_MATCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

function saveDismissedMatches(set) {
  localStorage.setItem(DISMISSED_MATCHES_KEY, JSON.stringify([...set]));
}

let dismissedMatches = loadDismissedMatches();

/* ===================== Risk manager (stake + track record) ===================== */
// Same shared-stake concept as polymarket-ufc.js, but scoped to its own key
// and its own track record (loadTennisPredictions) - a UFC pick's history
// shouldn't dilute a tennis pick's, and vice versa.
const STAKE_KEY = 'numerology_tennis_pm_stake';

function loadStake() {
  const n = Number(localStorage.getItem(STAKE_KEY));
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function saveStake(n) {
  localStorage.setItem(STAKE_KEY, String(n));
}

let currentStake = loadStake();

const RISK_FLAG_THRESHOLD_FRACTION = 0.10;

function riskManagerHtml(pickName, pickPrice) {
  if (pickPrice == null) return '';

  const bucket = bucketForPrice(pickPrice);
  const stat = computeBucketStats(loadTennisPredictions()).find((b) => b.label === bucket.label);

  const payout = currentStake / pickPrice;
  const profit = payout - currentStake;

  let flagHtml;
  if (!stat || stat.count < MIN_BUCKET_SAMPLE) {
    const count = stat ? stat.count : 0;
    flagHtml = `<div class="pm-risk-flag unknown">📊 Not enough track record yet in the ${bucket.label} range (${count} pick${count === 1 ? '' : 's'}) to judge this one.</div>`;
  } else {
    const winProb = stat.winPct / 100;
    const expectedProfit = winProb * payout - currentStake;
    const threshold = currentStake * RISK_FLAG_THRESHOLD_FRACTION;

    let tier = 'mid';
    let icon = '➖';
    let verdict = 'roughly matches the market here';
    if (expectedProfit > threshold) {
      tier = 'good'; icon = '✅'; verdict = 'favors this bet';
    } else if (expectedProfit < -threshold) {
      tier = 'bad'; icon = '⚠️'; verdict = 'says be cautious here';
    }

    const sign = expectedProfit >= 0 ? '+' : '-';
    flagHtml = `<div class="pm-risk-flag ${tier}">${icon} Track record ${verdict} &mdash; picks in the ${bucket.label} range have hit ${stat.winPct}% (${stat.wins}/${stat.count}), for an expected ${sign}$${Math.abs(expectedProfit).toFixed(2)} per $${currentStake} bet.</div>`;
  }

  return `
    <div class="pm-risk-manager">
      <div class="pm-risk-row"><span>$${currentStake} on ${escapeHtml(pickName)} at ${Math.round(pickPrice * 100)}%</span><span>pays $${payout.toFixed(2)} (${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toFixed(2)})</span></div>
      ${flagHtml}
    </div>
  `;
}

function initStakeInput() {
  const input = document.getElementById('pmStakeInput');
  input.value = currentStake;
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (!Number.isFinite(n) || n <= 0) return;
    currentStake = n;
    saveStake(n);
    renderMatchesContainer();
    renderTradeFeeds();
  });
}

/* ===================== Auto-resolved tournament regions ===================== */
// The tournament's city IS its title prefix on Polymarket ("Bastad: A vs
// B"), so the region resolves automatically - the exact path the Stats
// backfill and the auto today-tracker (stats-tennis.js) already use
// (resolveIntlRegionForBackfillByCity, db-core.js) - instead of asking for
// a per-tournament location. A tournament whose title prefix isn't a
// resolvable place gets NO score and NO recorded pick, matching the
// backfill's own skip: a location is never guessed. The venue and US-state
// anchors are gone from tennis scoring entirely, so every path now scores
// the same Day 75% + Region 25% blend on the same city record.

// key -> 'loading' | region object | null (couldn't resolve)
const tournamentRegions = new Map();

// Polymarket prefixes lower-tier events with "ITF " ("ITF Brisbane: A vs
// B"); the place name is what's left. Same normalization stats-tennis.js's
// tennisCityFromEventTitle applies, just on the already-split key.
function tournamentCityName(key) {
  return key.replace(/^ITF\s+/i, '').trim();
}

function ensureTournamentRegion(key) {
  if (tournamentRegions.has(key)) return;
  tournamentRegions.set(key, 'loading');
  resolveIntlRegionForBackfillByCity(tournamentCityName(key))
    .then((region) => {
      tournamentRegions.set(key, region || null);
      renderMatchesContainer();
    })
    .catch(() => {
      tournamentRegions.set(key, null);
      renderMatchesContainer();
    });
}

function tournamentRegionFor(key) {
  const region = tournamentRegions.get(key);
  return region && region !== 'loading' ? region : null;
}

function findTournamentGroupEl(key) {
  return [...document.querySelectorAll('.pm-tournament-group')].find((el) => el.dataset.tournament === key) || null;
}

/* ===================== Player roster + matching ===================== */
// Mirrors buildAllPlayers() in tennis.js so Polymarket player names can be
// matched against the same seed+override+custom roster the calculator uses.

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

// normalizeName() lives in db-core.js (shared with the Stats page).
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

function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* ===================== Matchup scoring ===================== */
// computeFighterScore (db-core.js) with no venue anchor - Day 75% + Region
// 25%, byte-identical to what the Stats backfill and the auto today-tracker
// (stats-tennis.js) record, so every tennis pick shares one scoring basis
// no matter which page wrote it. (The old local computeMatchScore also
// returned its region score under a key extractDimensionScores never read,
// so live-recorded picks silently dropped the region dimension from the
// stats tables - fixed for free by sharing the function.)

// The calendar date scoring uses is the one actually showing on a clock in
// the tournament's own city, resolved from the auto-resolved region's
// timezone. Null until that timezone confirms - never guessed.
function currentMatchDateISO(gameStartTime, region) {
  return localMatchDateISO(gameStartTime, 'intl', region);
}

function scoresForMatch(m, region) {
  if (!(m.matchedA && m.matchedB && region)) return null;
  const matchDateISO = currentMatchDateISO(m.gameStartTime, region);
  if (!matchDateISO) return null; // timezone not confirmed yet - don't guess
  const matchDate = parseDateInput(matchDateISO);
  const regionDate = parseDateInput(region.founded);
  return {
    scoreA: computeFighterScore(parseDateInput(m.matchedA.dob), matchDate, null, regionDate),
    scoreB: computeFighterScore(parseDateInput(m.matchedB.dob), matchDate, null, regionDate),
  };
}

// Locks in one prediction per match, the first time its numerology edge is
// shown - never overwritten afterward. The Stats page resolves `result` later.
function recordPredictionIfNew(m, scoreA, scoreB, marketFavorite, numerologyFavorite, pickType) {
  const predictions = loadTennisPredictions();
  if (predictions.some((p) => p.conditionId === m.conditionId)) return;

  predictions.push({
    conditionId: m.conditionId,
    playerAName: m.playerAName,
    playerBName: m.playerBName,
    numerologyFavorite,
    numerologyScoreA: scoreA.combined,
    numerologyScoreB: scoreB.combined,
    // Per-dimension scores for the "which compatibility dimension predicts best"
    // analysis. Accumulates going forward only - a stored prediction keeps no
    // venue anchors to recompute the breakdown from after the fact.
    dims: { A: extractDimensionScores(scoreA), B: extractDimensionScores(scoreB) },
    marketFavorite,
    marketPriceA: m.priceA,
    marketPriceB: m.priceB,
    pickType,
    eventTitle: m.eventTitle,
    matchTime: m.gameStartTime.toISOString(),
    recordedAt: Date.now(),
    result: null,
  });
  saveTennisPredictions(predictions);
}

/* ===================== Data fetching ===================== */

function parseGameStart(raw) {
  if (!raw) return null;
  const iso = raw.replace(' ', 'T').replace(/\+00$/, 'Z').replace(/\+00:00$/, 'Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// Event titles look like "Geneva Open: Cameron Norrie vs Mariano Navone" -
// the tournament name (used for grouping/location) is everything before the
// first colon, the two player names split on the last " vs ". Titles always
// carry full names, unlike `outcomes` below which sometimes only has surnames.
function parseTennisTitle(title) {
  const colonIdx = title.indexOf(':');
  if (colonIdx === -1) return null;
  const tournament = title.slice(0, colonIdx).trim();
  const matchup = title.slice(colonIdx + 1).trim();
  const vsIdx = matchup.toLowerCase().lastIndexOf(' vs ');
  if (vsIdx === -1) return null;
  const nameA = matchup.slice(0, vsIdx).trim();
  const nameB = matchup.slice(vsIdx + 4).trim();
  if (!nameA || !nameB) return null;
  return { tournament, nameA, nameB };
}

// Futures/qualifying-level "ITF <city>" events and doubles pairings are
// filtered out - the player roster is a curated singles list of recognizable
// pros, and doubles isn't a 1v1 model this app's scoring supports.
function isExcludedTournament(tournament) {
  const lower = tournament.toLowerCase();
  return lower.startsWith('itf ') || lower.includes('(doubles)');
}

function parseMarket(market, event) {
  const parsed = parseTennisTitle(event.title);
  if (!parsed) return null;

  let outcomes = [];
  let prices = [];
  try { outcomes = JSON.parse(market.outcomes); } catch (e) { /* leave empty */ }
  try { prices = JSON.parse(market.outcomePrices).map(Number); } catch (e) { /* leave empty */ }

  let priceA = Number.isFinite(prices[0]) ? prices[0] : null;
  let priceB = Number.isFinite(prices[1]) ? prices[1] : null;

  // outcomes[] is sometimes just a surname ("Siegemund") and sometimes a full
  // name - either way, verify it lines up with the title's "A vs B" order and
  // swap the prices if Polymarket's outcome order runs the other way.
  if (outcomes.length === 2 && outcomes[0]) {
    const normA = normalizeName(parsed.nameA);
    const normOut0 = normalizeName(outcomes[0]);
    if (!normA.includes(normOut0) && normalizeName(parsed.nameB).includes(normOut0)) {
      [priceA, priceB] = [priceB, priceA];
    }
  }

  return {
    conditionId: market.conditionId,
    tournament: parsed.tournament,
    playerAName: parsed.nameA,
    playerBName: parsed.nameB,
    priceA,
    priceB,
    gameStartTime: parseGameStart(market.gameStartTime),
    eventTitle: event.title,
  };
}

async function fetchTennisEvents() {
  try {
    const res = await fetch(GAMMA_EVENTS_URL);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.events) ? data.events : [];
  } catch (e) {
    return [];
  }
}

async function fetchTrades(conditionId) {
  try {
    const res = await fetch(`${TRADES_URL}?market=${conditionId}&limit=50`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// Sports-wide (not tennis-specific) leaderboard - same limitation and same
// dual all-time+monthly qualification bar as polymarket-ufc.js.
async function fetchLeaderboard() {
  const map = new Map();
  try {
    const [allRes, monthRes] = await Promise.all([fetch(LEADERBOARD_ALL_URL), fetch(LEADERBOARD_MONTH_URL)]);
    const allData = allRes.ok ? await allRes.json() : [];
    const monthData = monthRes.ok ? await monthRes.json() : [];

    const monthPnlByWallet = new Map();
    (monthData || []).forEach((r) => {
      if (r.proxyWallet) monthPnlByWallet.set(r.proxyWallet.toLowerCase(), r.pnl);
    });

    (allData || []).forEach((r) => {
      if (!r.proxyWallet) return;
      const wallet = r.proxyWallet.toLowerCase();
      const monthPnl = monthPnlByWallet.has(wallet) ? monthPnlByWallet.get(wallet) : null;
      map.set(wallet, {
        userName: r.userName,
        pnl: r.pnl,
        monthPnl,
        qualifiesSmart: monthPnl != null && monthPnl > 0,
      });
    });
  } catch (e) { /* leaderboard is a nice-to-have, fail quiet */ }
  return map;
}

/* ===================== Numerology enrichment ===================== */

function enrichWithNumerology(m) {
  const roster = buildAllPlayers();
  m.matchedA = matchPlayer(m.playerAName, roster);
  m.matchedB = matchPlayer(m.playerBName, roster);
}

/* ===================== Rendering helpers ===================== */

function shortWallet(addr) {
  if (!addr) return 'Unknown';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsd(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function timeAgo(unixSeconds) {
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function fightBadge(gameStartTime) {
  if (!gameStartTime) return '';
  const now = Date.now();
  const t = gameStartTime.getTime();
  if (t <= now) return '<span class="pm-live-badge">🔴 Live / In Progress</span>';
  const diff = t - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return `<span class="pm-countdown-badge">Starts in ${label}</span>`;
}

function numerologyBlockHtml(m) {
  if (!(m.matchedA && m.matchedB)) {
    const unmatched = [];
    if (!m.matchedA) unmatched.push(m.playerAName);
    if (!m.matchedB) unmatched.push(m.playerBName);
    // returnTo carries the exact card back with it, so tennis.js can send the
    // user right back here (instead of the Polymarket hub menu) once the
    // player's saved - see scrollToConditionIdFromQuery below.
    const returnUrl = `polymarket-tennis.html?conditionId=${encodeURIComponent(m.conditionId)}`;
    return `<div class="pm-unmatched">${unmatched
      .map((n) => `${escapeHtml(n)} isn't in your player database yet &mdash; <a href="tennis.html?addPlayer=${encodeURIComponent(n)}&returnTo=${encodeURIComponent(returnUrl)}">add them</a> for a numerology read.`)
      .join('<br>')}</div>`;
  }

  const regionState = tournamentRegions.get(m.tournament);
  if (regionState === undefined || regionState === 'loading') {
    return '<div class="pm-unmatched">🔍 Working out this tournament\'s city&hellip;</div>';
  }
  if (!regionState) {
    return '<div class="pm-unmatched">⚠️ Couldn\'t confirm this tournament\'s city, so its matches aren\'t scored or recorded &mdash; a location is never guessed.</div>';
  }

  const scores = scoresForMatch(m, regionState);
  if (!scores) {
    return '<div class="pm-unmatched">⏳ Waiting to confirm this region\'s timezone before scoring &mdash; check back shortly.</div>';
  }
  const { scoreA, scoreB } = scores;
  const favA = m.priceA != null && m.priceB != null && m.priceA >= m.priceB;
  const marketFavName = favA ? m.playerAName : m.playerBName;
  const numFavMatched = scoreA.combined >= scoreB.combined ? m.matchedA : m.matchedB;
  const agree = normalizeName(marketFavName) === normalizeName(numFavMatched.name);

  recordPredictionIfNew(m, scoreA, scoreB, marketFavName, numFavMatched.name, agree ? 'favorite' : 'underdog');

  // Same tossup handling as polymarket-ufc.js: a near-tie was never a pick,
  // so it gets a neutral line and no bet pitch, while real edges get their
  // strength labeled. Still recorded above either way - the Stats page
  // tracks tossups separately as a ~50/50 sanity check.
  const gap = Math.abs(scoreA.combined - scoreB.combined);
  const tier = edgeTierForGap(gap);
  const pickPrice = scoreA.combined >= scoreB.combined ? m.priceA : m.priceB;

  const signalHtml = tier.key === 'none'
    ? `<div class="pm-signal neutral">⚖️ Too close to call (${scoreA.combined} vs ${scoreB.combined}) &mdash; no real numerology edge on this one</div>`
    : `<div class="pm-signal ${agree ? 'agree' : 'disagree'}">${agree
      ? `✅ ${tier.icon} ${tier.label} &mdash; numerology agrees with the market favorite (${escapeHtml(marketFavName)})`
      : `⚡ ${tier.icon} ${tier.label} &mdash; numerology favors ${escapeHtml(numFavMatched.name)} while the market favors ${escapeHtml(marketFavName)} &mdash; possible value on ${escapeHtml(numFavMatched.name)}`}</div>`;

  return `
    <div class="pm-numerology-clickable" data-condition-id="${m.conditionId}">
      <div class="pm-edge-line">🔢 Numerology Edge: <span class="score-inline ${scoreClass(scoreA.combined)}">${escapeHtml(m.matchedA.name)} ${scoreA.combined}</span> vs <span class="score-inline ${scoreClass(scoreB.combined)}">${escapeHtml(m.matchedB.name)} ${scoreB.combined}</span></div>
      ${signalHtml}
      <div class="pm-breakdown-hint">Tap for the full breakdown &rarr;</div>
    </div>
    ${tier.key === 'none' ? '' : riskManagerHtml(numFavMatched.name, pickPrice)}
  `;
}

// One player's column in the breakdown popup - the Day and Region anchors
// plus the combined number. computeFighterScore keeps the region compat
// under its .state key (its MLB/UFC-era name), hence score.state below.
function breakdownColumnHtml(name, score) {
  return `
    <div class="pm-breakdown-col">
      <div class="pm-breakdown-name">${escapeHtml(name)}</div>
      <div class="pm-breakdown-row"><span>🗓️ Match Day</span><span class="score-inline ${scoreClass(score.day.finalScore)}">${score.day.finalScore}</span></div>
      <div class="pm-breakdown-row"><span>🏙️ Region</span><span class="score-inline ${scoreClass(score.state.finalScore)}">${score.state.finalScore}</span></div>
      <div class="pm-breakdown-row pm-breakdown-total"><span>Combined</span><span class="score-inline ${scoreClass(score.combined)}">${score.combined}</span></div>
    </div>
  `;
}

// Research-based read on each player's life path (theme/volatility/athletic
// tag) plus a player-vs-player numerology reading via the shared
// numerologyCompat table - informational only, on the Insight tab. Players
// are never scored against each other for the real edge above (each is only
// ever scored against the day/region/venue), so this is the one place that
// head-to-head number gets computed and shown at all.
function insightTabHtml(m, region) {
  const infoA = compatLifePathInfo(parseDateInput(m.matchedA.dob));
  const infoB = compatLifePathInfo(parseDateInput(m.matchedB.dob));
  const pair = pairInsight(infoA.lookupValue, infoB.lookupValue);
  // Universal Day - each player's own life path vs. today itself (reduced
  // the exact same way a birthdate is) - added alongside the player-vs-
  // player read above, not instead of it. Skipped (not guessed) if the
  // region's timezone hasn't confirmed yet, same as the real edge above.
  const matchDateISO = region ? currentMatchDateISO(m.gameStartTime, region) : null;
  const matchDate = matchDateISO ? parseDateInput(matchDateISO) : null;
  return `
    <div class="pm-insight-grid">
      ${personInsightHtml(m.matchedA.name, infoA.display, infoA.lookupValue)}
      ${personInsightHtml(m.matchedB.name, infoB.display, infoB.lookupValue)}
    </div>
    <div class="pm-insight-pair">
      <div class="pm-insight-pair-clash">${pair.clash.icon} ${escapeHtml(pair.clash.label)} <span class="score-inline ${scoreClass(pair.score)}">${pair.score}</span></div>
      <div class="pm-insight-pair-theme">${escapeHtml(pair.themeLine)}</div>
    </div>
    ${matchDate ? `
    <div class="pm-insight-grid">
      ${universalDayInsightHtml(m.matchedA.name, infoA.lookupValue, matchDate)}
      ${universalDayInsightHtml(m.matchedB.name, infoB.lookupValue, matchDate)}
    </div>` : ''}
    <div class="pm-insight-disclaimer">Research-based read on each life path's tendencies &mdash; informational only, not part of the numerology edge above.</div>
  `;
}

function imprintTabHtml(m, region) {
  const matchDateISO = region ? currentMatchDateISO(m.gameStartTime, region) : null;
  const matchDate = matchDateISO ? parseDateInput(matchDateISO) : null;
  if (!matchDate) return '';
  return `
    <div class="pm-insight-grid">
      ${imprintInsightHtml(m.matchedA.name, parseDateInput(m.matchedA.dob), matchDate)}
      ${imprintInsightHtml(m.matchedB.name, parseDateInput(m.matchedB.dob), matchDate)}
    </div>
    <div class="pm-insight-disclaimer">Financial/relationship/career/etc. imprint read for the match date &mdash; informational only, not part of the numerology edge above.</div>
  `;
}

function breakdownModalHtml(m, scores, region) {
  const hero = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(m.matchedA.name)} <span class="score-vs">&times;</span> ${escapeHtml(m.matchedB.name)}</div>
    </div>
  `;
  const breakdown = `
    <div class="pm-breakdown-grid">
      ${breakdownColumnHtml(m.matchedA.name, scores.scoreA)}
      ${breakdownColumnHtml(m.matchedB.name, scores.scoreB)}
    </div>
  `;
  return hero + modalTabsHtml(breakdown, insightTabHtml(m, region), imprintTabHtml(m, region));
}

function initDismissButtons() {
  document.getElementById('matchesContainer').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dismiss]');
    if (!btn) return;
    const conditionId = btn.dataset.dismiss;
    dismissedMatches.add(conditionId);
    saveDismissedMatches(dismissedMatches);
    allMatches = allMatches.filter((m) => m.conditionId !== conditionId);
    matchesByTournament.forEach((list, key) => matchesByTournament.set(key, list.filter((m) => m.conditionId !== conditionId)));
    renderMatchesContainer();
    renderTradeFeeds();
  });
}

function initBreakdownModal() {
  document.getElementById('matchesContainer').addEventListener('click', (e) => {
    const trigger = e.target.closest('.pm-numerology-clickable');
    if (!trigger) return;
    const m = allMatches.find((x) => x.conditionId === trigger.dataset.conditionId);
    if (!m) return;
    const region = tournamentRegionFor(m.tournament);
    const scores = scoresForMatch(m, region);
    if (!scores) return;
    document.getElementById('pmBreakdownBody').innerHTML = breakdownModalHtml(m, scores, region);
    document.getElementById('pmBreakdownOverlay').classList.add('active');
  });

  document.getElementById('pmBreakdownClose').addEventListener('click', () => {
    document.getElementById('pmBreakdownOverlay').classList.remove('active');
  });
  document.getElementById('pmBreakdownOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'pmBreakdownOverlay') document.getElementById('pmBreakdownOverlay').classList.remove('active');
  });
  initModalTabSwitcher('pmBreakdownBody');
}

function fullMatchupHtml(m) {
  if (!(m.matchedA && m.matchedB)) return '';
  const params = new URLSearchParams({ a: m.matchedA.name, b: m.matchedB.name });
  // The date prefill rides along only once the region's timezone has
  // confirmed - omitted (not guessed) before then.
  const region = tournamentRegionFor(m.tournament);
  const matchDateISO = region ? currentMatchDateISO(m.gameStartTime, region) : null;
  if (matchDateISO) params.set('date', isoToDisplay(matchDateISO));
  return `<a class="btn" href="tennis.html?${params.toString()}">Full Matchup &rarr;</a>`;
}

// The edge tier's key for a match's colored card strip - '' (default
// border) when scores can't be computed yet.
function cardTierKey(m) {
  const scores = scoresForMatch(m, tournamentRegionFor(m.tournament));
  if (!scores) return '';
  return edgeTierForGap(Math.abs(scores.scoreA.combined - scores.scoreB.combined)).key;
}

function matchCardHtml(m) {
  const pctA = m.priceA != null ? Math.round(m.priceA * 100) : null;
  const pctB = m.priceB != null ? Math.round(m.priceB * 100) : null;
  const favA = pctA != null && pctB != null && pctA >= pctB;

  return `
    <div class="box pm-fight-card" id="pm-card-${m.conditionId}" data-tier="${cardTierKey(m)}">
      <div class="pm-fight-head">
        <div class="pm-fight-names">${escapeHtml(m.playerAName)} vs ${escapeHtml(m.playerBName)}</div>
        ${fightBadge(m.gameStartTime)}
      </div>
      <div class="pm-odds-row">
        <div class="pm-odds-pill ${favA ? 'favorite' : ''}">
          <div class="pm-odds-name">${escapeHtml(m.playerAName)}</div>
          <div class="pm-odds-pct">${pctA != null ? `${pctA}%` : '—'}</div>
        </div>
        <div class="pm-odds-pill ${!favA && pctB != null ? 'favorite' : ''}">
          <div class="pm-odds-name">${escapeHtml(m.playerBName)}</div>
          <div class="pm-odds-pct">${pctB != null ? `${pctB}%` : '—'}</div>
        </div>
      </div>
      <div class="pm-numerology" id="pm-num-${m.conditionId}">${numerologyBlockHtml(m)}</div>
      <div class="pm-trade-feed" id="pm-feed-${m.conditionId}">
        ${feedToggleHtml(m.conditionId, 0, false)}
      </div>
      <div class="pm-fight-actions">
        <button class="btn-link" data-dismiss="${m.conditionId}" type="button">✓ Mark as Over</button>
        ${fullMatchupHtml(m)}
      </div>
    </div>
  `;
}

function tournamentGroupHtml(key, matches) {
  ensureTournamentRegion(key);
  const regionState = tournamentRegions.get(key);

  // One auto-resolved location line per group - the live clock stays, as
  // proof the right timezone resolved for match-day scoring.
  let locationHtml;
  if (regionState === undefined || regionState === 'loading') {
    locationHtml = '<div class="pm-location-suggestion">🔍 Working out where this tournament is played&hellip;</div>';
  } else if (!regionState) {
    locationHtml = `<div class="pm-location-suggestion">⚠️ Couldn't confirm where ${escapeHtml(key)} is played &mdash; its matches aren't scored or recorded (a location is never guessed).</div>`;
  } else {
    const now = venueLocalTimeNow('intl', regionState);
    let clockHtml;
    if (now) {
      clockHtml = `<div class="pm-location-clock">🕐 Local time there right now: ${now} &mdash; match days are scored on this clock.</div>`;
    } else {
      ensureIntlRegionTimezone(regionState, () => renderMatchesContainer());
      clockHtml = '<div class="pm-location-clock warn">⚠️ Couldn\'t confirm this region\'s timezone yet &mdash; matches aren\'t scored until it resolves.</div>';
    }
    locationHtml = `
      <div class="pm-location-summary">
        <div class="pm-location-summary-row">
          <span class="pm-location-summary-text">📍 ${escapeHtml(regionState.name)}</span>
        </div>
        ${clockHtml}
      </div>`;
  }

  return `
    <div class="box pm-tournament-group location-collapsed" data-tournament="${escapeHtml(key)}">
      <div class="pm-tournament-header">
        <span class="pm-tournament-name">🎾 ${escapeHtml(key)}</span>
      </div>
      ${locationHtml}
      <div class="pm-tournament-matches">
        ${matches.map((m) => matchCardHtml(m)).join('')}
      </div>
    </div>
  `;
}

function renderMatchesContainer() {
  const container = document.getElementById('matchesContainer');
  if (!allMatches.length) {
    container.innerHTML = '<div class="empty-state">No upcoming tennis matches found on Polymarket right now.</div>';
    return;
  }

  const sortedKeys = [...matchesByTournament.keys()].sort((a, b) => {
    const aMin = Math.min(...matchesByTournament.get(a).map((m) => m.gameStartTime.getTime()));
    const bMin = Math.min(...matchesByTournament.get(b).map((m) => m.gameStartTime.getTime()));
    return aMin - bMin;
  });

  container.innerHTML = sortedKeys.map((key) => tournamentGroupHtml(key, matchesByTournament.get(key))).join('');
}

function updateTournamentMatches(key) {
  const groupEl = findTournamentGroupEl(key);
  if (!groupEl) return;
  const matchesEl = groupEl.querySelector('.pm-tournament-matches');
  const matches = matchesByTournament.get(key) || [];
  matchesEl.innerHTML = matches.map((m) => matchCardHtml(m)).join('');
}

// Feeds the user has expanded - the whale feed defaults collapsed so the
// card leads with the numerology verdict; trade flow is one tap away.
// Mirrors polymarket-ufc.js.
const openFeeds = new Set();

function feedToggleHtml(conditionId, count, open) {
  return `<button class="pm-trade-feed-toggle" data-feed-toggle="${conditionId}" type="button">🐋 ${count ? `${count} whale bet${count === 1 ? '' : 's'}` : 'Big Money Activity'} <span class="pm-feed-caret">${open ? '▾' : '▸'}</span></button>`;
}

function initFeedToggles() {
  document.getElementById('matchesContainer').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feed-toggle]');
    if (!btn) return;
    const id = btn.dataset.feedToggle;
    if (openFeeds.has(id)) openFeeds.delete(id);
    else openFeeds.add(id);
    renderTradeFeeds();
  });
}

function renderTradeFeeds() {
  allMatches.forEach((m) => {
    const el = document.getElementById(`pm-feed-${m.conditionId}`);
    if (!el) return;

    const trades = tradesCache.get(m.conditionId) || [];
    const flagged = trades
      .map((t) => ({
        ...t,
        usd: t.size * t.price,
        smart: !!leaderboardMap.get((t.proxyWallet || '').toLowerCase())?.qualifiesSmart,
      }))
      .filter((t) => t.usd >= WHALE_THRESHOLD_USD || t.smart)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);

    const open = openFeeds.has(m.conditionId);

    if (!flagged.length) {
      el.innerHTML = feedToggleHtml(m.conditionId, 0, open)
        + (open ? '<div class="empty-state">No notable big-money activity yet on this match.</div>' : '');
      return;
    }

    el.innerHTML = feedToggleHtml(m.conditionId, flagged.length, open) + (!open ? '' : flagged.map((t) => {
      const leader = leaderboardMap.get((t.proxyWallet || '').toLowerCase());
      const who = leader ? leader.userName : shortWallet(t.proxyWallet);
      const badges = `${t.usd >= WHALE_THRESHOLD_USD ? '<span class="pm-badge-whale">WHALE</span> ' : ''}${t.smart ? '<span class="pm-badge-smart" title="Top 50 all-time on Polymarket\'s Sports PNL leaderboard, and still profitable this month">SMART</span>' : ''}`;
      return `
        <div class="pm-trade-row">
          <span class="pm-trade-who">${escapeHtml(who)}</span>
          <span class="pm-trade-side">${t.side === 'BUY' ? 'Bought' : 'Sold'} ${escapeHtml(t.outcome || '')}</span>
          ${badges}
          <span class="pm-trade-usd">${formatUsd(t.usd)}</span>
          <span class="pm-trade-time">${timeAgo(t.timestamp)}</span>
        </div>
      `;
    }).join(''));
  });

  const stamp = document.getElementById('pmLastUpdated');
  if (stamp) stamp.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
}

/* ===================== Orchestration ===================== */

async function pollTrades() {
  if (!allMatches.length) return;
  const results = await Promise.all(allMatches.map((m) => fetchTrades(m.conditionId)));
  allMatches.forEach((m, i) => tradesCache.set(m.conditionId, results[i]));
  renderTradeFeeds();

  // A timezone lookup that failed on a transient hiccup otherwise wouldn't
  // retry until the 5-minute event refresh. Piggyback on this 20s poll
  // instead so it clears sooner, for every auto-resolved region on screen
  // still missing its timezone.
  tournamentRegions.forEach((region, key) => {
    if (region && region !== 'loading' && !region.timezone) {
      ensureIntlRegionTimezone(region, () => updateTournamentMatches(key));
    }
  });
}

async function loadEventsAndRender() {
  const events = await fetchTennisEvents();
  const rawMatches = [];
  events.forEach((ev) => {
    (ev.markets || []).forEach((mkt) => {
      if (mkt.sportsMarketType !== 'moneyline') return;
      if (mkt.closed || mkt.active === false) return;
      const parsed = parseMarket(mkt, ev);
      if (!parsed || !parsed.gameStartTime) return;
      if (isExcludedTournament(parsed.tournament)) return;
      if (parsed.playerAName.includes('/') || parsed.playerBName.includes('/')) return; // doubles pairs that slipped past the title filter
      rawMatches.push(parsed);
    });
  });

  // Forget dismissals for matches Polymarket no longer lists here at all.
  const stillPresent = new Set(rawMatches.map((m) => m.conditionId));
  dismissedMatches = new Set([...dismissedMatches].filter((id) => stillPresent.has(id)));
  saveDismissedMatches(dismissedMatches);

  const visibleMatches = rawMatches.filter((m) => !dismissedMatches.has(m.conditionId));

  const now = Date.now();
  const cutoff = now - LOOKBACK_MS;
  const forwardCutoff = now + FORWARD_WINDOW_MS;
  const windowed = visibleMatches.filter((m) => {
    const t = m.gameStartTime.getTime();
    return t > cutoff && t <= forwardCutoff;
  });

  windowed.sort((a, b) => a.gameStartTime - b.gameStartTime);
  windowed.forEach(enrichWithNumerology);

  allMatches = windowed;
  matchesByTournament.clear();
  allMatches.forEach((m) => {
    if (!matchesByTournament.has(m.tournament)) matchesByTournament.set(m.tournament, []);
    matchesByTournament.get(m.tournament).push(m);
  });

  // Forget resolved regions for tournaments no longer on screen so a
  // long-lived tab doesn't accumulate them - the city record itself stays
  // saved in the shared Intl Regions list either way, so a recurring
  // tournament re-resolves instantly from that list.
  [...tournamentRegions.keys()].forEach((key) => {
    if (!matchesByTournament.has(key)) tournamentRegions.delete(key);
  });

  if (!allMatches.length) {
    document.getElementById('matchesContainer').innerHTML = '<div class="empty-state">No upcoming tennis matches found on Polymarket right now.</div>';
    return;
  }

  renderMatchesContainer();
  pollTrades();
}

function initRefreshButton() {
  const btn = document.getElementById('pmRefreshBtn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '🔄 Refreshing…';
    leaderboardMap = await fetchLeaderboard();
    await loadEventsAndRender();
    btn.textContent = originalText;
    btn.disabled = false;
  });
}

function startPolling() {
  setInterval(() => {
    if (document.visibilityState === 'visible') pollTrades();
  }, TRADES_POLL_MS);

  setInterval(() => {
    if (document.visibilityState === 'visible') loadEventsAndRender();
  }, EVENTS_POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollTrades();
  });
}

// Arriving from the Tennis page (?from=tennis), the back link returns there
// instead of dropping the user at the Polymarket hub menu.
(function initBackLink() {
  if (new URLSearchParams(window.location.search).get('from') === 'tennis') {
    const back = document.getElementById('pmBackLink');
    back.href = 'tennis.html';
    back.innerHTML = '&larr; Tennis';
  }
})();

// Arriving back from tennis.js after adding a player via the deep link above
// (?conditionId=) - scrolls straight back to the exact match card instead of
// leaving the user at the top of the list to re-find it themselves.
function scrollToConditionIdFromQuery() {
  const conditionId = new URLSearchParams(window.location.search).get('conditionId');
  if (!conditionId) return;
  const card = document.getElementById(`pm-card-${conditionId}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.style.boxShadow = '0 0 0 3px var(--purple), 0 0 16px rgba(167, 107, 214, 0.6)';
  setTimeout(() => { card.style.boxShadow = ''; }, 2500);
}

(async function init() {
  // The prediction stores live in IndexedDB now (big-store.js); wait for
  // them before any read, or a pre-init read could serve a stale
  // localStorage copy and a later save would clobber newer records.
  await bigStoreReadyPromise;
  initRefreshButton();
  initBreakdownModal();
  initDismissButtons();
  initFeedToggles();
  initStakeInput();
  leaderboardMap = await fetchLeaderboard();
  await loadEventsAndRender();
  scrollToConditionIdFromQuery();
  startPolling();
})();

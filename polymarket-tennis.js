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

/* ===================== Per-tournament location ===================== */
// UFC has one card a night at one venue, so polymarket-ufc.js sets a single
// shared location for everything on screen. Tennis has several tournaments
// running at once in different cities, so location is set per tournament
// instead - parsed from the event title ("Geneva Open: A vs B" -> "Geneva
// Open") - and remembered across visits so it's only set once per event.
const TOURNAMENT_LOCATIONS_KEY = 'numerology_tennis_pm_tournament_locations';

function loadTournamentLocationPrefs() {
  try {
    const raw = localStorage.getItem(TOURNAMENT_LOCATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveTournamentLocationPrefs(map) {
  localStorage.setItem(TOURNAMENT_LOCATIONS_KEY, JSON.stringify(map));
}

let venues = loadTennisVenues();
let tournamentLocationPrefs = loadTournamentLocationPrefs();

// Live, resolved { regionMode, selectedRegion, selectedVenue } per tournament,
// lazily derived from tournamentLocationPrefs plus the current regions/venues
// lists - re-deriving (rather than caching the objects themselves) means an
// edited founding date is picked up right away instead of a stale snapshot.
const tournamentState = new Map();

function getTournamentState(key) {
  if (!tournamentState.has(key)) {
    const pref = tournamentLocationPrefs[key] || {};
    const regionMode = pref.regionMode === 'intl' ? 'intl' : 'us';
    let selectedRegion = null;
    if (pref.regionName) {
      const list = regionMode === 'us' ? US_STATES : allIntlRegions();
      selectedRegion = list.find((r) => r.name === pref.regionName) || null;
    }
    const selectedVenue = pref.venueId ? (venues.find((v) => v.id === pref.venueId) || null) : null;
    tournamentState.set(key, { regionMode, selectedRegion, selectedVenue });
  }
  return tournamentState.get(key);
}

function persistTournamentState(key) {
  const st = getTournamentState(key);
  tournamentLocationPrefs[key] = {
    regionMode: st.regionMode,
    regionName: st.selectedRegion ? st.selectedRegion.name : null,
    venueId: st.selectedVenue ? st.selectedVenue.id : null,
  };
  saveTournamentLocationPrefs(tournamentLocationPrefs);
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
// Same Day 60/Venue 15/Region 25 (or Day 75/Region 25 without a venue) blend
// as computeMatchScore() in tennis.js.

function computeMatchScore(dobDate, matchDate, venueDate, regionDate) {
  const day = computeCompatibility(dobDate, matchDate, sportsNumerologyCompat);
  const region = computeCompatibility(dobDate, regionDate, sportsNumerologyCompat);
  if (!venueDate) {
    const combined = Math.round(0.75 * day.finalScore + 0.25 * region.finalScore);
    return { day, venue: null, region, combined };
  }
  const venue = computeCompatibility(dobDate, venueDate, sportsNumerologyCompat);
  const combined = Math.round(0.60 * day.finalScore + 0.15 * venue.finalScore + 0.25 * region.finalScore);
  return { day, venue, region, combined };
}

// The calendar date scoring uses is the one that's actually showing on a
// clock at the venue, not whichever UTC date the match's timestamp happens
// to convert to - computed fresh each time (a tournament's region can
// change after its matches are already loaded) rather than cached once at
// enrichment time.
function currentMatchDateISO(gameStartTime, st, tournamentKey) {
  if (st.regionMode === 'us') return localMatchDateISO(gameStartTime, 'us', st.selectedRegion);
  if (st.selectedRegion && !st.selectedRegion.timezone) {
    ensureIntlRegionTimezone(st.selectedRegion, () => updateTournamentMatches(tournamentKey));
  }
  return localMatchDateISO(gameStartTime, 'intl', st.selectedRegion);
}

function scoresForMatch(m, st) {
  if (!(m.matchedA && m.matchedB && st.selectedRegion)) return null;
  const matchDate = parseDateInput(currentMatchDateISO(m.gameStartTime, st, m.tournament));
  const regionDate = parseDateInput(st.selectedRegion.founded);
  const venueDate = st.selectedVenue ? parseDateInput(st.selectedVenue.founded) : null;
  return {
    scoreA: computeMatchScore(parseDateInput(m.matchedA.dob), matchDate, venueDate, regionDate),
    scoreB: computeMatchScore(parseDateInput(m.matchedB.dob), matchDate, venueDate, regionDate),
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
    return `<div class="pm-unmatched">${unmatched
      .map((n) => `${escapeHtml(n)} isn't in your player database yet &mdash; <a href="tennis.html?addPlayer=${encodeURIComponent(n)}">add them</a> for a numerology read.`)
      .join('<br>')}</div>`;
  }

  const st = getTournamentState(m.tournament);
  if (!st.selectedRegion) {
    return '<div class="pm-unmatched">Set this tournament\'s location above to see the numerology edge for its matches.</div>';
  }

  const { scoreA, scoreB } = scoresForMatch(m, st);
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
      <div class="pm-breakdown-hint">Tap for the full Day / Region / Venue breakdown &rarr;</div>
    </div>
    ${tier.key === 'none' ? '' : riskManagerHtml(numFavMatched.name, pickPrice)}
  `;
}

// One player's column in the breakdown popup - drops the Venue row entirely
// (not zeroed) when no venue is set, same as tennis.js.
function breakdownColumnHtml(name, score, regionMode) {
  const regionLabel = regionMode === 'intl' ? '🏙️ Region' : '🗺️ State';
  const venueRow = score.venue
    ? `<div class="pm-breakdown-row"><span>🏟️ Venue</span><span class="score-inline ${scoreClass(score.venue.finalScore)}">${score.venue.finalScore}</span></div>`
    : '';
  return `
    <div class="pm-breakdown-col">
      <div class="pm-breakdown-name">${escapeHtml(name)}</div>
      <div class="pm-breakdown-row"><span>🗓️ Match Day</span><span class="score-inline ${scoreClass(score.day.finalScore)}">${score.day.finalScore}</span></div>
      <div class="pm-breakdown-row"><span>${regionLabel}</span><span class="score-inline ${scoreClass(score.region.finalScore)}">${score.region.finalScore}</span></div>
      ${venueRow}
      <div class="pm-breakdown-row pm-breakdown-total"><span>Combined</span><span class="score-inline ${scoreClass(score.combined)}">${score.combined}</span></div>
    </div>
  `;
}

function breakdownModalHtml(m, scores, regionMode) {
  return `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(m.matchedA.name)} <span class="score-vs">&times;</span> ${escapeHtml(m.matchedB.name)}</div>
    </div>
    <div class="pm-breakdown-grid">
      ${breakdownColumnHtml(m.matchedA.name, scores.scoreA, regionMode)}
      ${breakdownColumnHtml(m.matchedB.name, scores.scoreB, regionMode)}
    </div>
  `;
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
    const st = getTournamentState(m.tournament);
    const scores = scoresForMatch(m, st);
    if (!scores) return;
    document.getElementById('pmBreakdownBody').innerHTML = breakdownModalHtml(m, scores, st.regionMode);
    document.getElementById('pmBreakdownOverlay').classList.add('active');
  });

  document.getElementById('pmBreakdownClose').addEventListener('click', () => {
    document.getElementById('pmBreakdownOverlay').classList.remove('active');
  });
  document.getElementById('pmBreakdownOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'pmBreakdownOverlay') document.getElementById('pmBreakdownOverlay').classList.remove('active');
  });
}

function fullMatchupHtml(m) {
  if (!(m.matchedA && m.matchedB)) return '';
  const st = getTournamentState(m.tournament);
  const params = new URLSearchParams({
    a: m.matchedA.name,
    b: m.matchedB.name,
    date: isoToDisplay(currentMatchDateISO(m.gameStartTime, st, m.tournament)),
  });
  return `<a class="btn" href="tennis.html?${params.toString()}">Full Matchup &rarr;</a>`;
}

// The edge tier's key for a match's colored card strip - '' (default
// border) when scores can't be computed yet.
function cardTierKey(m) {
  const st = getTournamentState(m.tournament);
  if (!(m.matchedA && m.matchedB && st.selectedRegion)) return '';
  const { scoreA, scoreB } = scoresForMatch(m, st);
  return edgeTierForGap(Math.abs(scoreA.combined - scoreB.combined)).key;
}

function matchCardHtml(m) {
  const pctA = m.priceA != null ? Math.round(m.priceA * 100) : null;
  const pctB = m.priceB != null ? Math.round(m.priceB * 100) : null;
  const favA = pctA != null && pctB != null && pctA >= pctB;

  return `
    <div class="box pm-fight-card" data-tier="${cardTierKey(m)}">
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

function regionOptionsHtml(regionMode, selectedRegion) {
  if (regionMode === 'us') {
    return '<option value="">Select state...</option>'
      + US_STATES.map((r) => `<option value="${escapeHtml(r.name)}"${selectedRegion && selectedRegion.name === r.name ? ' selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  }
  return '<option value="">Select city / region...</option>'
    + allIntlRegions().map((r) => `<option value="${escapeHtml(r.name)}"${selectedRegion && selectedRegion.name === r.name ? ' selected' : ''}>${escapeHtml(r.name)}</option>`).join('')
    + '<option value="__add__">+ Add New City / Region</option>';
}

function venueOptionsHtml(regionMode, selectedVenue) {
  const visible = venues.filter((v) => (regionMode === 'intl' ? !!v.region : !v.region));
  return '<option value="">Select venue...</option>'
    + visible.map((v) => `<option value="${v.id}"${selectedVenue && selectedVenue.id === v.id ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('')
    + '<option value="__add__">+ Add New Venue</option>';
}

/* ===================== Tournament location suggestion ===================== */
// Best-effort auto-detection of a tournament's usual host city, so the user
// doesn't have to already know where e.g. "Kitzbuehel" or "Estoril Open" is
// played. This is a SUGGESTION the user must accept, never a silent
// auto-fill - a generically-named tournament can genuinely resolve to the
// wrong Wikipedia article entirely (a live test found "Swiss Open" redirects
// to a golf tournament, not the tennis event Polymarket means here), and a
// wrong location would quietly corrupt the numerology score with nothing
// visibly off. Manual selection via the dropdowns below always remains the
// reliable path regardless of whether a suggestion appears.

// key -> 'loading' | 'none' | 'dismissed' | { city, state, country, venue }
const tournamentSuggestions = new Map();

// Strips the common wikitext decorations out of a single infobox field's
// raw value: flag-icon templates, HTML comments, <ref> citations, wikilinks
// (resolved to their display text), and stray tags.
function cleanWikitextFragment(raw) {
  return raw
    .replace(/\{\{flagicon\|[^}]*\}\}/gi, '')
    .replace(/\{\{flag\|([^}|]*)\}\}/gi, '$1')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// A combined infobox "location" value looks like "Geneva, Switzerland" or
// "Lincoln, Nebraska, U.S." - the last comma-separated part is the country
// (or "U.S.", in which case the part before it is a state).
function parseCommaLocation(text) {
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  const isUS = /^(u\.?s\.?a?\.?|united states(?: of america)?)$/i.test(last);
  if (isUS && parts.length >= 2) {
    return { city: parts.length >= 3 ? parts[0] : null, state: parts[parts.length - 2], country: 'United States' };
  }
  return { city: parts.length >= 2 ? parts[0] : null, state: null, country: last };
}

// Real {{Infobox tennis tournament}} pages (e.g. "Austrian Open Kitzbühel")
// use separate city/country/venue fields, not one combined "location" -
// checked first since it's both more common and gives the venue for free.
// Everything is restricted to roughly the first ~3000 characters of the
// wikitext, which reliably covers only the page's own primary infobox - a
// live test found a "location" field matching deep in the Kitzbühel *city*
// article that actually belonged to an unrelated defunct 1971-2000 ski
// event mentioned further down the same page, not the city itself.
function extractTournamentLocation(wikitext, searchedName) {
  const head = wikitext.slice(0, 3000);

  const cityMatch = /\|\s*city\s*=\s*([^\n]+)/i.exec(head);
  const countryMatch = /\|\s*country\s*=\s*([^\n]+)/i.exec(head);
  const venueMatch = /\|\s*venue\s*=\s*([^\n]+)/i.exec(head);
  const venue = venueMatch ? cleanWikitextFragment(venueMatch[1]) : null;

  if (cityMatch || countryMatch) {
    const city = cityMatch ? cleanWikitextFragment(cityMatch[1]) : null;
    const country = countryMatch ? cleanWikitextFragment(countryMatch[1]) : null;
    if (city || country) return { city, state: null, country, venue };
  }

  const locationMatch = /\|\s*location\s*=\s*([^\n]+)/i.exec(head);
  if (locationMatch) {
    const parsed = parseCommaLocation(cleanWikitextFragment(locationMatch[1]));
    if (parsed) return { ...parsed, venue };
  }

  // The tournament name resolved straight to a place article (e.g.
  // "Granby" -> the town of Granby) rather than a dedicated tournament
  // article - the page's own subject IS the location in that case.
  const subdivTypeMatch = /\|\s*subdivision_type\s*=\s*([^\n]+)/i.exec(head);
  const subdivNameMatch = /\|\s*subdivision_name\s*=\s*([^\n]+)/i.exec(head);
  if (subdivTypeMatch && subdivNameMatch && /country/i.test(subdivTypeMatch[1])) {
    const country = cleanWikitextFragment(subdivNameMatch[1]);
    const isUS = /^(united states|u\.?s\.?a?\.?)$/i.test(country);
    let state = null;
    if (isUS) {
      const subdivType1Match = /\|\s*subdivision_type1\s*=\s*([^\n]+)/i.exec(head);
      const subdivName1Match = /\|\s*subdivision_name1\s*=\s*([^\n]+)/i.exec(head);
      if (subdivType1Match && subdivName1Match && /state/i.test(subdivType1Match[1])) {
        state = cleanWikitextFragment(subdivName1Match[1]);
      }
    }
    return { city: searchedName, state, country: isUS ? 'United States' : country, venue: null };
  }

  return null;
}

// The tournament group key is the grouping/display name (kept as-is so
// qualifying rounds stay a distinct group from the main draw), but Polymarket
// tacks on suffixes like ", Qualification" that have no corresponding
// Wikipedia article - stripped only for the search query itself.
function tournamentSearchName(tournamentKey) {
  return tournamentKey.replace(/,?\s*qualification\s*$/i, '').trim();
}

function lookupTournamentLocation(tournamentName) {
  const searchName = tournamentSearchName(tournamentName);
  return fetchWikipediaWikitext(searchName).then((wikitext) => (
    wikitext ? extractTournamentLocation(wikitext, searchName) : null
  ));
}

function suggestionLabel(suggestion) {
  const place = suggestion.state
    ? `${suggestion.city ? suggestion.city + ', ' : ''}${suggestion.state}`
    : `${suggestion.city ? suggestion.city + ', ' : ''}${suggestion.country}`;
  return suggestion.venue ? `${place} (${suggestion.venue})` : place;
}

function suggestionBannerHtml(key) {
  const suggestion = tournamentSuggestions.get(key);
  if (!suggestion || suggestion === 'none' || suggestion === 'dismissed') return '';
  if (suggestion === 'loading') {
    return '<div class="pm-location-suggestion">🔍 Checking where this tournament is usually played&hellip;</div>';
  }
  return `
    <div class="pm-location-suggestion">
      📍 Guessed location: <strong>${escapeHtml(suggestionLabel(suggestion))}</strong> - is this right?
      <button class="btn-link" data-accept-suggestion="${escapeHtml(key)}" type="button">Use this</button>
      <button class="btn-link" data-dismiss-suggestion="${escapeHtml(key)}" type="button">No, I'll set it</button>
    </div>
  `;
}

function updateTournamentSuggestionUI(key) {
  const groupEl = findTournamentGroupEl(key);
  if (!groupEl) return;
  const wrap = groupEl.querySelector('.pm-location-suggestion-wrap');
  if (!wrap) return;
  const st = getTournamentState(key);
  wrap.innerHTML = st.selectedRegion ? '' : suggestionBannerHtml(key);
}

function ensureTournamentSuggestion(key) {
  if (tournamentSuggestions.has(key)) return;
  tournamentSuggestions.set(key, 'loading');
  lookupTournamentLocation(key).then((loc) => {
    tournamentSuggestions.set(key, loc || 'none');
    updateTournamentSuggestionUI(key);
  });
}

// Once the region is settled, also try to auto-add/select the detected
// venue - same founding-date lookup the manual "+ Add New Venue" form uses
// (no country-fallback here: a specific stadium/venue's own opening date is
// already the concrete, official record, unlike a city that may only have
// an ancient, undocumented-to-the-day history).
function applyDetectedVenue(key, venueName) {
  const st = getTournamentState(key);
  const existing = venues.find((v) => v.name.toLowerCase() === venueName.toLowerCase());
  if (existing) {
    st.selectedVenue = existing;
    persistTournamentState(key);
    updateTournamentMatches(key);
    return;
  }

  const regionFields = st.regionMode === 'us' ? { state: st.selectedRegion.name } : { region: st.selectedRegion.name };
  lookupKeyDateByName(venueName).then((info) => {
    if (!info) return; // couldn't confirm a founding date - leave venue unset, region alone still applies
    const venue = { id: uid(), name: venueName, founded: info.date, ...regionFields };
    venues.push(venue);
    saveTennisVenues(venues);
    st.selectedVenue = venue;
    persistTournamentState(key);
    updateTournamentMatches(key);
  });
}

// Applies an accepted suggestion: matches an existing US state or saved
// international region by name, or - for a new international city - fetches
// its founding date (same country-fallback lookup the manual "+ Add New
// City / Region" flow uses) and adds it before selecting it.
function acceptTournamentSuggestion(key) {
  const suggestion = tournamentSuggestions.get(key);
  if (!suggestion || suggestion === 'loading' || suggestion === 'none' || suggestion === 'dismissed') return;
  const st = getTournamentState(key);

  const finish = () => {
    persistTournamentState(key);
    tournamentSuggestions.delete(key);
    renderMatchesContainer();
    if (suggestion.venue) applyDetectedVenue(key, suggestion.venue);
  };

  if (suggestion.state) {
    const stateObj = US_STATES.find((s) => s.name.toLowerCase() === suggestion.state.toLowerCase());
    if (stateObj) {
      st.regionMode = 'us';
      st.selectedRegion = stateObj;
      st.selectedVenue = null;
      finish();
      return;
    }
  }

  const cityName = suggestion.city || suggestion.country;
  const regions = loadIntlRegions();
  const existing = regions.find((r) => r.name.toLowerCase() === cityName.toLowerCase());
  if (existing) {
    st.regionMode = 'intl';
    st.selectedRegion = existing;
    st.selectedVenue = null;
    finish();
    return;
  }

  lookupPlaceFoundingDate(cityName).then((info) => {
    if (!info) {
      alert(`Guessed "${cityName}" as the location, but couldn't automatically find its founding date - please add it yourself via "+ Add New City / Region".`);
      return;
    }
    const region = { id: uid(), name: cityName, founded: info.date };
    regions.push(region);
    saveIntlRegions(regions);
    st.regionMode = 'intl';
    st.selectedRegion = region;
    st.selectedVenue = null;
    finish();
  });
}

// Tournament groups whose set location the user has temporarily re-expanded
// via "Change" - cleared again the moment a new selection is made.
const expandedTournamentLocations = new Set();

function tournamentGroupHtml(key, matches) {
  const st = getTournamentState(key);
  const regionLabel = st.regionMode === 'intl' ? 'City / Region' : 'State';
  if (!st.selectedRegion) ensureTournamentSuggestion(key);

  // Same collapsed chip + live venue clock as the UFC tracker's location
  // box - with 7+ tournament groups on screen, collapsing the set ones is
  // where most of the vertical space comes back.
  const collapsed = !!st.selectedRegion && !expandedTournamentLocations.has(key);
  let locationSummaryHtml = '';
  if (collapsed) {
    const now = venueLocalTimeNow(st.regionMode, st.selectedRegion);
    let clockHtml = '';
    if (now) {
      clockHtml = `<div class="pm-location-clock">🕐 Local time at the venue right now: ${now} &mdash; match days are scored on this clock.</div>`;
    } else if (st.regionMode === 'intl') {
      ensureIntlRegionTimezone(st.selectedRegion, () => renderMatchesContainer());
      clockHtml = `<div class="pm-location-clock warn">⚠️ Couldn't confirm this region's timezone yet &mdash; match days fall back to UTC dates.</div>`;
    }
    locationSummaryHtml = `
      <div class="pm-location-summary">
        <div class="pm-location-summary-row">
          <span class="pm-location-summary-text">📍 ${escapeHtml(st.selectedRegion.name)}${st.selectedVenue ? ` · ${escapeHtml(st.selectedVenue.name)}` : ''}</span>
          <button class="btn-link" data-change-location="${escapeHtml(key)}" type="button">✏️ Change</button>
        </div>
        ${clockHtml}
      </div>`;
  }

  // The tournament name links out to a Google search built from one of its
  // actual matchups, asking in one query for everything the location form
  // needs: the host city, the venue, and the venue's founding date - the
  // quickest way to fill it all in when the Wikipedia auto-suggestion can't
  // (generic names like "Lincoln" or "Granby" resolve to disambiguation
  // pages, not a tournament article).
  const searchMatch = matches[0];
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${searchMatch.playerAName} vs ${searchMatch.playerBName} where is the game, what venue, and the venue's founding date`)}`;

  return `
    <div class="box pm-tournament-group ${collapsed ? 'location-collapsed' : ''}" data-tournament="${escapeHtml(key)}">
      <div class="pm-tournament-header">
        <a class="pm-tournament-name" href="${searchUrl}" target="_blank" rel="noopener" title="Google where this tournament's matches are being played">🎾 ${escapeHtml(key)} <span class="pm-tournament-search-icon">🔎</span></a>
      </div>
      ${locationSummaryHtml}
      <div class="pm-location-suggestion-wrap">${st.selectedRegion ? '' : suggestionBannerHtml(key)}</div>
      <div class="hours-toggle ufc-region-toggle pm-tournament-region-toggle">
        <button type="button" class="hours-toggle-btn ${st.regionMode === 'us' ? 'active' : ''}" data-region="us">🇺🇸 United States</button>
        <button type="button" class="hours-toggle-btn ${st.regionMode === 'intl' ? 'active' : ''}" data-region="intl">🌍 International</button>
      </div>
      <div class="ufc-location-grid pm-tournament-location-grid">
        <div class="ufc-location-field">
          <label>${regionLabel}</label>
          <select class="pm-tournament-region-select">${regionOptionsHtml(st.regionMode, st.selectedRegion)}</select>
        </div>
        <div class="ufc-location-field">
          <label>Venue <span class="optional-tag">optional</span></label>
          <select class="pm-tournament-venue-select">${venueOptionsHtml(st.regionMode, st.selectedVenue)}</select>
        </div>
      </div>
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

  // Once a tournament's matches are all gone (no more games for it), forget
  // its saved location - same idea as the UFC tracker clearing its shared
  // location once a card wraps up - so if the same-named tournament recurs
  // later at a possibly different city, it starts fresh instead of
  // silently inheriting a stale one.
  let prefsChanged = false;
  Object.keys(tournamentLocationPrefs).forEach((key) => {
    if (!matchesByTournament.has(key)) {
      delete tournamentLocationPrefs[key];
      tournamentState.delete(key);
      tournamentSuggestions.delete(key);
      prefsChanged = true;
    }
  });
  if (prefsChanged) saveTournamentLocationPrefs(tournamentLocationPrefs);

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

/* ===================== Add region / venue modals ===================== */
// One shared modal for each (rather than one inline form per tournament
// group) - tagged with whichever tournament's "+ Add New..." option
// triggered it, since there can be several groups on screen at once.

let pendingLocationTournament = null;

function setRegionModalFoundedStatus(message, isError) {
  const el = document.getElementById('pmRegionModalFoundedStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

// Same Wikidata-then-Wikipedia-infobox lookup used for player birthdays
// (lookupKeyDateByName in db-core.js), aimed at a city/region's founding
// date instead - coverage is thinner here than for people, so failing
// quietly and leaving manual entry as the fallback is the expected case.
function lookupRegionModalFoundedDate(name) {
  setRegionModalFoundedStatus('🔍 Looking up founding date...', false);
  lookupPlaceFoundingDate(name)
    .then((info) => {
      if (!info) {
        setRegionModalFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('pmModalRegionFounded').value = isoToDisplay(info.date);
      const source = info.via === 'country' ? "its country's founding" : 'Wikipedia/Wikidata';
      setRegionModalFoundedStatus(`✓ Found via ${source} (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setRegionModalFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function setVenueModalFoundedStatus(message, isError) {
  const el = document.getElementById('pmVenueModalFoundedStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

function lookupVenueModalFoundedDate(name) {
  setVenueModalFoundedStatus('🔍 Looking up founding date...', false);
  lookupKeyDateByName(name)
    .then((info) => {
      if (!info) {
        setVenueModalFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('pmModalVenueFounded').value = isoToDisplay(info.date);
      setVenueModalFoundedStatus(`✓ Found via Wikipedia/Wikidata (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setVenueModalFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function openRegionModal(tournamentKey) {
  pendingLocationTournament = tournamentKey;
  document.getElementById('pmModalRegionName').value = '';
  document.getElementById('pmModalRegionFounded').value = '';
  setRegionModalFoundedStatus('', false);
  document.getElementById('pmRegionModal').classList.add('active');
}

function closeRegionModal() {
  pendingLocationTournament = null;
  document.getElementById('pmRegionModal').classList.remove('active');
}

function openVenueModal(tournamentKey) {
  pendingLocationTournament = tournamentKey;
  document.getElementById('pmModalVenueName').value = '';
  document.getElementById('pmModalVenueFounded').value = '';
  setVenueModalFoundedStatus('', false);
  const st = getTournamentState(tournamentKey);
  const regionSel = document.getElementById('pmModalVenueRegionSelect');
  if (st.regionMode === 'us') {
    regionSel.innerHTML = '<option value="">Select state...</option>'
      + US_STATES.map((s, idx) => `<option value="${idx}">${escapeHtml(s.name)}</option>`).join('');
  } else {
    regionSel.innerHTML = '<option value="">Select city / region...</option>'
      + allIntlRegions().map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
  document.getElementById('pmVenueModal').classList.add('active');
}

function closeVenueModal() {
  pendingLocationTournament = null;
  document.getElementById('pmVenueModal').classList.remove('active');
}

function initLocationModals() {
  attachDateMask(document.getElementById('pmModalRegionFounded'));
  attachDateMask(document.getElementById('pmModalVenueFounded'));

  document.getElementById('pmRegionModalClose').addEventListener('click', closeRegionModal);
  document.getElementById('pmRegionModal').addEventListener('click', (e) => {
    if (e.target.id === 'pmRegionModal') closeRegionModal();
  });
  document.getElementById('pmModalRegionName').addEventListener('blur', () => {
    const name = document.getElementById('pmModalRegionName').value.trim();
    const foundedFilled = document.getElementById('pmModalRegionFounded').value.trim();
    if (name && !foundedFilled) lookupRegionModalFoundedDate(name);
  });

  document.getElementById('pmRegionModalLookupBtn').addEventListener('click', () => {
    const name = document.getElementById('pmModalRegionName').value.trim();
    if (!name) { alert('Please enter a city / region name first.'); return; }
    lookupRegionModalFoundedDate(name);
  });
  document.getElementById('pmModalSaveRegionBtn').addEventListener('click', () => {
    const key = pendingLocationTournament;
    if (!key) return;
    const name = document.getElementById('pmModalRegionName').value.trim();
    const founded = displayToISO(document.getElementById('pmModalRegionFounded').value);
    if (!name) { alert('Please enter a city / region name.'); return; }
    if (!founded) { alert('Please enter a valid founding date (MM/DD/YYYY).'); return; }

    const regions = loadIntlRegions();
    const region = { id: uid(), name, founded };
    regions.push(region);
    saveIntlRegions(regions);

    const st = getTournamentState(key);
    st.selectedRegion = region;
    persistTournamentState(key);
    expandedTournamentLocations.delete(key);
    closeRegionModal();
    renderMatchesContainer();
  });

  document.getElementById('pmVenueModalClose').addEventListener('click', closeVenueModal);
  document.getElementById('pmVenueModal').addEventListener('click', (e) => {
    if (e.target.id === 'pmVenueModal') closeVenueModal();
  });
  document.getElementById('pmModalVenueName').addEventListener('blur', () => {
    const name = document.getElementById('pmModalVenueName').value.trim();
    const foundedFilled = document.getElementById('pmModalVenueFounded').value.trim();
    if (name && !foundedFilled) lookupVenueModalFoundedDate(name);
  });

  document.getElementById('pmVenueModalLookupBtn').addEventListener('click', () => {
    const name = document.getElementById('pmModalVenueName').value.trim();
    if (!name) { alert('Please enter a venue name first.'); return; }
    lookupVenueModalFoundedDate(name);
  });
  document.getElementById('pmModalSaveVenueBtn').addEventListener('click', () => {
    const key = pendingLocationTournament;
    if (!key) return;
    const st = getTournamentState(key);
    const name = document.getElementById('pmModalVenueName').value.trim();
    const founded = displayToISO(document.getElementById('pmModalVenueFounded').value);
    const regionVal = document.getElementById('pmModalVenueRegionSelect').value;
    if (!name) { alert('Please enter a venue name.'); return; }
    if (!founded) { alert('Please enter a valid founding date for the venue (MM/DD/YYYY).'); return; }
    if (regionVal === '') { alert(`Please select which ${st.regionMode === 'intl' ? 'city / region' : 'state'} this venue is in.`); return; }

    const regionFields = st.regionMode === 'us'
      ? { state: US_STATES[Number(regionVal)].name }
      : { region: (allIntlRegions().find((c) => c.id === regionVal) || {}).name };

    const venue = { id: uid(), name, founded, ...regionFields };
    venues.push(venue);
    saveTennisVenues(venues);
    st.selectedVenue = venue;
    persistTournamentState(key);
    expandedTournamentLocations.delete(key);
    closeVenueModal();
    renderMatchesContainer();
  });
}

/* ===================== Per-tournament location controls ===================== */

function initTournamentLocationControls() {
  document.getElementById('matchesContainer').addEventListener('click', (e) => {
    const changeBtn = e.target.closest('[data-change-location]');
    if (changeBtn) {
      expandedTournamentLocations.add(changeBtn.dataset.changeLocation);
      renderMatchesContainer();
      return;
    }

    const acceptBtn = e.target.closest('[data-accept-suggestion]');
    if (acceptBtn) {
      acceptTournamentSuggestion(acceptBtn.dataset.acceptSuggestion);
      return;
    }

    const dismissBtn = e.target.closest('[data-dismiss-suggestion]');
    if (dismissBtn) {
      const key = dismissBtn.dataset.dismissSuggestion;
      tournamentSuggestions.set(key, 'dismissed');
      updateTournamentSuggestionUI(key);
      return;
    }

    const toggleBtn = e.target.closest('.pm-tournament-region-toggle .hours-toggle-btn');
    if (!toggleBtn) return;
    const groupEl = toggleBtn.closest('.pm-tournament-group');
    const key = groupEl.dataset.tournament;
    const st = getTournamentState(key);
    const mode = toggleBtn.dataset.region;
    if (mode !== st.regionMode) {
      st.regionMode = mode;
      st.selectedRegion = null;
      st.selectedVenue = null;
      persistTournamentState(key);
      renderMatchesContainer();
    }
  });

  document.getElementById('matchesContainer').addEventListener('change', (e) => {
    const regionSelect = e.target.closest('.pm-tournament-region-select');
    if (regionSelect) {
      const key = regionSelect.closest('.pm-tournament-group').dataset.tournament;
      const val = regionSelect.value;
      const st = getTournamentState(key);
      if (val === '__add__') {
        regionSelect.value = st.selectedRegion ? st.selectedRegion.name : '';
        openRegionModal(key);
        return;
      }
      const list = st.regionMode === 'us' ? US_STATES : allIntlRegions();
      st.selectedRegion = val ? (list.find((r) => r.name === val) || null) : null;
      persistTournamentState(key);
      expandedTournamentLocations.delete(key);
      renderMatchesContainer();
      return;
    }

    const venueSelect = e.target.closest('.pm-tournament-venue-select');
    if (venueSelect) {
      const key = venueSelect.closest('.pm-tournament-group').dataset.tournament;
      const val = venueSelect.value;
      const st = getTournamentState(key);
      if (val === '__add__') {
        venueSelect.value = st.selectedVenue ? st.selectedVenue.id : '';
        openVenueModal(key);
        return;
      }
      st.selectedVenue = val ? (venues.find((v) => v.id === val) || null) : null;
      persistTournamentState(key);
      expandedTournamentLocations.delete(key);
      renderMatchesContainer();
    }
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

(async function init() {
  initLocationModals();
  initTournamentLocationControls();
  initRefreshButton();
  initBreakdownModal();
  initDismissButtons();
  initFeedToggles();
  initStakeInput();
  leaderboardMap = await fetchLeaderboard();
  await loadEventsAndRender();
  startPolling();
})();

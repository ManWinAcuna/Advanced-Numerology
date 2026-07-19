/* ===================== Constants ===================== */
const TRADES_URL = 'https://data-api.polymarket.com/trades';
const LEADERBOARD_ALL_URL = 'https://data-api.polymarket.com/v1/leaderboard?category=SPORTS&timePeriod=ALL&orderBy=PNL&limit=50';
const LEADERBOARD_MONTH_URL = 'https://data-api.polymarket.com/v1/leaderboard?category=SPORTS&timePeriod=MONTH&orderBy=PNL&limit=50';
const WHALE_THRESHOLD_USD = 500;
const TRADES_POLL_MS = 20000;
const EVENTS_POLL_MS = 5 * 60 * 1000;
const LOOKBACK_MS = 6 * 3600 * 1000; // still show games that started up to this long ago (likely still live)
const UPCOMING_WINDOW_MS = 36 * 3600 * 1000; // one nightly slate's worth of games

let leaderboardMap = new Map();
let cardGames = [];
const tradesCache = new Map();
const openFeeds = new Set();

/* ===================== Risk manager (stake + track record) ===================== */
const STAKE_KEY = 'numerology_mlb_pm_stake';

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
  const stat = computeBucketStats(loadMlbPredictions()).find((b) => b.label === bucket.label);

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
    renderGameCards();
  });
}

/* ===================== Live-data caches ===================== */
// Nothing here is a maintained roster - every entry is fetched fresh from
// MLB's API and cached only because a birthdate/founding year/venue address
// never changes, purely to avoid re-fetching it for every game a team plays
// within the same slate.
const teamInfoCache = new Map();
const managerCache = new Map();
const venueLocationCache = new Map();
const intlRegionLookupsInFlight = new Set();
const venueFoundedLookupsInFlight = new Set();

async function ensureTeamInfo(teamId) {
  if (teamInfoCache.has(teamId)) return teamInfoCache.get(teamId);
  const info = await fetchTeamInfo(teamId);
  teamInfoCache.set(teamId, info);
  return info;
}

async function ensureManager(teamId) {
  if (managerCache.has(teamId)) return managerCache.get(teamId);
  const mgr = await fetchTeamManager(teamId, new Date().getFullYear());
  managerCache.set(teamId, mgr);
  return mgr;
}

// Resolves g.regionMode/g.region from the venue's real address - the US
// state (matched against the same US_STATES list UFC/Tennis use) or, for a
// non-US venue (only Toronto today), the international-region store already
// built for UFC/Tennis, auto-adding an entry the first time that city comes
// up instead of asking the user to.
function applyVenueLocation(g, loc) {
  if (!loc) { g.regionMode = null; g.region = null; return; }
  if (loc.country === 'USA' && loc.state) {
    g.regionMode = 'us';
    g.region = US_STATES.find((s) => s.name === loc.state) || null;
    return;
  }
  g.regionMode = 'intl';
  const cityName = loc.city || g.venueName;
  const regions = loadIntlRegions();
  const existing = regions.find((r) => normalizeName(r.name) === normalizeName(cityName));
  if (existing) {
    g.region = existing;
    if (!existing.timezone) ensureIntlRegionTimezone(existing, () => updateGameCard(g.conditionId));
    return;
  }
  g.region = null;
  const key = normalizeName(cityName);
  if (intlRegionLookupsInFlight.has(key)) return;
  intlRegionLookupsInFlight.add(key);
  lookupPlaceFoundingDate(cityName).then((info) => {
    intlRegionLookupsInFlight.delete(key);
    if (!info) return;
    const list = loadIntlRegions();
    if (list.some((r) => normalizeName(r.name) === key)) return;
    list.push({ id: uid(), name: cityName, founded: info.date });
    saveIntlRegions(list);
    updateGameCard(g.conditionId);
  });
}

async function ensureVenueLocation(g) {
  if (venueLocationCache.has(g.venueId)) {
    applyVenueLocation(g, venueLocationCache.get(g.venueId));
    return;
  }
  const loc = await fetchVenueLocation(g.venueId);
  venueLocationCache.set(g.venueId, loc);
  applyVenueLocation(g, loc);
}

// Fire-and-forget: the stadium factor is dropped gracefully (not blocked on)
// while this resolves, same as UFC/Tennis behave with no stadium set yet.
function ensureVenueFoundedDate(g) {
  const venues = loadMlbVenues();
  const existing = venues.find((v) => v.id === g.venueId);
  if (existing) { g.stadiumFounded = existing.founded; return; }
  if (venueFoundedLookupsInFlight.has(g.venueId)) return;
  venueFoundedLookupsInFlight.add(g.venueId);
  lookupKeyDateByName(g.venueName).then((info) => {
    venueFoundedLookupsInFlight.delete(g.venueId);
    if (!info) return;
    const list = loadMlbVenues();
    if (list.some((v) => v.id === g.venueId)) return;
    list.push({ id: g.venueId, name: g.venueName, founded: info.date });
    saveMlbVenues(list);
    g.stadiumFounded = info.date;
    updateGameCard(g.conditionId);
  });
}

/* ===================== Scoring ===================== */

function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, (m || 1) - 1, d || 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoDateOnly(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// currentMlbMatchDateISO(g, onTimezoneResolved), pitcherVsLineupScore(),
// computeTeamComposite(g, sideLetter, onTimezoneResolved), and
// scoresForGame(g, onTimezoneResolved) now live in db-core.js - the
// historical backfill on the Stats page needs the exact same 13-component
// scoring against an already-finished game, not a re-derived copy of it.

/* ===================== Enrichment ===================== */
// Every game starts as a Polymarket moneyline market and gets enriched with
// MLB's own data in stages: match to a real gamePk, then venue/region
// (independent of the lineup), then - only once the FULL lineup is posted -
// the roster itself. A prediction only ever gets recorded once the composite
// is complete and stable (enrichState === 'ready'), never on a partial score
// that would later change as the lineup fills in.
async function enrichGame(g) {
  if (!g.gamePk) { g.enrichState = 'unmatched'; return; }

  const feed = await fetchGameLiveFeed(g.gamePk);
  if (!feed) { g.enrichState = 'error'; return; }
  g.feed = feed;

  const feedSideForName = (name) => {
    if (normalizeName(feed.home.teamName) === normalizeName(name)) return feed.home;
    if (normalizeName(feed.away.teamName) === normalizeName(name)) return feed.away;
    return null;
  };
  g.sideA = feedSideForName(g.teamAName);
  g.sideB = feedSideForName(g.teamBName);
  if (!g.sideA || !g.sideB) { g.enrichState = 'error'; return; }

  if (feed.venue && feed.venue.id) {
    g.venueId = feed.venue.id;
    g.venueName = feed.venue.name;
    await ensureVenueLocation(g);
    ensureVenueFoundedDate(g);
  }

  recordPitcherKSignals(g);

  const lineupReady = g.sideA.batters.length === 9 && g.sideB.batters.length === 9;
  if (!lineupReady) {
    g.enrichState = 'pending-lineup';
    return;
  }
  if (!g.region) {
    g.enrichState = 'pending-location';
    return;
  }

  const [teamInfoA, teamInfoB, managerA, managerB] = await Promise.all([
    ensureTeamInfo(g.sideA.teamId), ensureTeamInfo(g.sideB.teamId),
    ensureManager(g.sideA.teamId), ensureManager(g.sideB.teamId),
  ]);
  g.teamInfoA = teamInfoA; g.teamInfoB = teamInfoB; g.managerA = managerA; g.managerB = managerB;

  const allIds = [
    g.sideA.startingPitcherId, g.sideB.startingPitcherId,
    ...g.sideA.batters.map((b) => b.id), ...g.sideB.batters.map((b) => b.id),
    managerA && managerA.id, managerB && managerB.id,
  ];
  g.birthdates = await fetchPeopleBirthdates(allIds);

  g.enrichState = 'ready';
}

/* ===================== Predictions (team composite) ===================== */

function recordMlbPredictionIfNew(g, scoreA, scoreB, marketFavorite, numerologyFavorite, pickType) {
  const predictions = loadMlbPredictions();
  if (predictions.some((p) => p.conditionId === g.conditionId)) return;

  predictions.push({
    conditionId: g.conditionId,
    gamePk: g.gamePk,
    teamAName: g.teamAName,
    teamBName: g.teamBName,
    numerologyFavorite,
    numerologyScoreA: scoreA.combined,
    numerologyScoreB: scoreB.combined,
    marketFavorite,
    marketPriceA: g.priceA,
    marketPriceB: g.priceB,
    pickType,
    eventTitle: g.eventTitle,
    gameTime: g.gameStartTime.toISOString(),
    recordedAt: Date.now(),
    result: null,
  });
  saveMlbPredictions(predictions);
}

/* ===================== Pitcher strikeout research signal ===================== */
// Not a bet - see MLB_PITCHER_K_SIGNALS_KEY in db-core.js. Only needs the
// probable pitcher + a season baseline, so it can record well before the
// full lineup (and therefore the team composite) is even available.
async function recordPitcherKSignals(g) {
  const season = new Date().getFullYear();
  const candidates = [
    { pitcher: g.probablePitcherA, teamName: g.teamAName },
    { pitcher: g.probablePitcherB, teamName: g.teamBName },
  ];

  for (const { pitcher, teamName } of candidates) {
    if (!pitcher || !pitcher.id) continue;
    if (loadMlbPitcherKSignals().some((s) => s.gamePk === g.gamePk && s.pitcherId === pitcher.id)) continue;

    const [birthdates, seasonStats] = await Promise.all([
      fetchPeopleBirthdates([pitcher.id]),
      fetchPitcherSeasonStats(pitcher.id, season),
    ]);
    const bd = birthdates.get(pitcher.id);
    if (!bd || !bd.birthDate || !seasonStats) continue; // no dob, or no starts yet this season to baseline against

    const matchDateISO = currentMlbMatchDateISO(g, () => updateGameCard(g.conditionId));
    if (!matchDateISO) continue; // timezone not confirmed yet - don't guess; retried on the next enrichment pass
    const dayScore = computeCompatibility(parseDateInput(bd.birthDate), parseDateInput(matchDateISO), sportsNumerologyCompat).finalScore;

    const signals = loadMlbPitcherKSignals();
    if (signals.some((s) => s.gamePk === g.gamePk && s.pitcherId === pitcher.id)) continue;
    signals.push({
      gamePk: g.gamePk,
      pitcherId: pitcher.id,
      pitcherName: bd.name,
      teamName,
      gameTime: g.gameStartTime.toISOString(),
      dayScore,
      predictedDirection: dayScore >= 60 ? 'over' : (dayScore <= 40 ? 'under' : 'neutral'),
      seasonAvgKsAtPickTime: seasonStats.strikeoutsPerStart,
      recordedAt: Date.now(),
      actualKs: null,
      result: null,
    });
    saveMlbPitcherKSignals(signals);
  }
}

/* ===================== Rendering ===================== */

// MLB uniquely gives us a real live-game feed (unlike UFC/Tennis, where
// Polymarket has no such signal) - so once that feed has loaded, trust its
// actual game state instead of guessing "Live" just because the scheduled
// first-pitch time has passed (games get delayed, postponed, etc.).
function gameBadge(g) {
  const state = g.feed && g.feed.abstractGameState;
  const detail = (g.feed && g.feed.detailedState) || '';
  if (state === 'Final') return '<span class="pm-countdown-badge">Final</span>';
  if (state === 'Live') return '<span class="pm-live-badge">🔴 Live / In Progress</span>';
  if (state === 'Preview' && /postpon|suspend|delay|cancel/i.test(detail)) {
    return `<span class="pm-countdown-badge">${escapeHtml(detail)}</span>`;
  }

  const now = Date.now();
  const t = g.gameStartTime.getTime();
  if (t <= now) return '<span class="pm-countdown-badge">Awaiting first pitch&hellip;</span>';
  const diff = t - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return `<span class="pm-countdown-badge">Starts in ${label}</span>`;
}

function venueLineHtml(g) {
  if (!g.venueName) return '';
  const regionLabel = g.region ? g.region.name : 'resolving location…';
  return `<div class="mode-desc">📍 ${escapeHtml(g.venueName)} &middot; ${escapeHtml(regionLabel)}</div>`;
}

function probablePitchersHtml(g) {
  if (!g.probablePitcherA && !g.probablePitcherB) return '';
  const a = g.probablePitcherA ? escapeHtml(g.probablePitcherA.fullName) : 'TBD';
  const b = g.probablePitcherB ? escapeHtml(g.probablePitcherB.fullName) : 'TBD';
  return `<div class="mode-desc">⚾ Probable: ${a} vs ${b}</div>`;
}

function numerologyBlockHtml(g) {
  const state = g.enrichState;
  if (state === 'unmatched' || state === 'error') {
    return '<div class="pm-unmatched">Couldn\'t match this game to MLB\'s own schedule data yet &mdash; try refreshing in a bit.</div>';
  }
  if (state === 'pending-location') {
    return '<div class="pm-unmatched">Resolving the venue\'s location for numerology scoring&hellip;</div>';
  }
  if (state === 'pending-lineup') {
    return '<div class="pm-unmatched">⏳ Lineups not posted yet &mdash; check back closer to first pitch for the numerology edge.</div>';
  }
  if (state !== 'ready') {
    return '<div class="pm-unmatched">Loading matchup data&hellip;</div>';
  }

  const scores = scoresForGame(g, () => updateGameCard(g.conditionId));
  if (!scores) return '<div class="pm-unmatched">⏳ Waiting to confirm this venue\'s timezone (or a birthdate) before scoring &mdash; check back shortly.</div>';
  const { scoreA, scoreB } = scores;

  const favA = g.priceA != null && g.priceB != null && g.priceA >= g.priceB;
  const marketFavName = favA ? g.teamAName : g.teamBName;
  const numFavName = scoreA.combined >= scoreB.combined ? g.teamAName : g.teamBName;
  const agree = normalizeName(marketFavName) === normalizeName(numFavName);

  recordMlbPredictionIfNew(g, scoreA, scoreB, marketFavName, numFavName, agree ? 'favorite' : 'underdog');

  const gap = Math.abs(scoreA.combined - scoreB.combined);
  const tier = edgeTierForGap(gap);
  const pickPrice = scoreA.combined >= scoreB.combined ? g.priceA : g.priceB;

  const signalHtml = tier.key === 'none'
    ? `<div class="pm-signal neutral">⚖️ Too close to call (${scoreA.combined} vs ${scoreB.combined}) &mdash; no real numerology edge on this one</div>`
    : `<div class="pm-signal ${agree ? 'agree' : 'disagree'}">${agree
      ? `✅ ${tier.icon} ${tier.label} &mdash; numerology agrees with the market favorite (${escapeHtml(marketFavName)})`
      : `⚡ ${tier.icon} ${tier.label} &mdash; numerology favors ${escapeHtml(numFavName)} while the market favors ${escapeHtml(marketFavName)} &mdash; possible value on ${escapeHtml(numFavName)}`}</div>`;

  return `
    <div class="pm-numerology-clickable" data-condition-id="${g.conditionId}">
      <div class="pm-edge-line">🔢 Numerology Edge: <span class="score-inline ${scoreClass(scoreA.combined)}">${escapeHtml(g.teamAName)} ${scoreA.combined}</span> vs <span class="score-inline ${scoreClass(scoreB.combined)}">${escapeHtml(g.teamBName)} ${scoreB.combined}</span></div>
      ${signalHtml}
      <div class="pm-breakdown-hint">Tap for the full 12-factor breakdown &rarr;</div>
    </div>
    ${tier.key === 'none' ? '' : riskManagerHtml(numFavName, pickPrice)}
  `;
}

function cardTierKey(g) {
  const scores = scoresForGame(g, () => updateGameCard(g.conditionId));
  if (!scores) return '';
  return edgeTierForGap(Math.abs(scores.scoreA.combined - scores.scoreB.combined)).key;
}

function breakdownColumnHtml(teamName, score) {
  return `
    <div class="pm-breakdown-col">
      <div class="pm-breakdown-name">${escapeHtml(teamName)}</div>
      ${score.parts.map((p) => `<div class="pm-breakdown-row"><span>${escapeHtml(p.role)}</span><span class="score-inline ${scoreClass(p.score.combined)}">${p.score.combined}</span></div>`).join('')}
      <div class="pm-breakdown-row pm-breakdown-total"><span>Combined</span><span class="score-inline ${scoreClass(score.combined)}">${score.combined}</span></div>
    </div>
  `;
}

// teamRosterInsightRows()/insightRowHtml() now live in db-core.js (stats-mlb.js
// needs the exact same roster-to-insight-rows conversion for its own matchup
// modal, re-derived live from a resolved game's gamePk).

// Research-based read per roster person (theme/volatility/athletic tag), plus
// a relabeling of the pitcher-vs-lineup number that's already part of the
// real composite above - informational framing on an already-real number,
// not a new one, so nothing here changes what's being bet on.
function insightTabHtml(g, scores) {
  // Universal Day - each roster person's own life path vs. today itself,
  // added as an extra "Day N" tag on their row alongside the theme/
  // volatility/athletic read, not instead of it. Left off (not guessed) if
  // the venue's timezone hasn't confirmed yet, same as the real edge above.
  const matchDateISO = currentMlbMatchDateISO(g, () => updateGameCard(g.conditionId));
  const matchDate = matchDateISO ? parseDateInput(matchDateISO) : null;
  const rowsA = teamRosterInsightRows(g.sideA, g.managerA, g.birthdates, matchDate).map(insightRowHtml).join('');
  const rowsB = teamRosterInsightRows(g.sideB, g.managerB, g.birthdates, matchDate).map(insightRowHtml).join('');
  const matchupParts = [scores.scoreA, scores.scoreB]
    .flatMap((s) => s.parts.filter((p) => p.role.includes(' vs ')));
  const matchupHtml = matchupParts.map((p) => {
    const clash = clashTypeForScore(p.score.combined);
    return `
      <div class="pm-insight-pair">
        <div class="pm-insight-pair-clash">${clash.icon} ${escapeHtml(clash.label)} <span class="score-inline ${scoreClass(p.score.combined)}">${p.score.combined}</span></div>
        <div class="pm-insight-pair-theme">${escapeHtml(p.role)}</div>
      </div>
    `;
  }).join('');
  return `
    <div class="pm-insight-grid">
      <div class="pm-insight-person">
        <div class="pm-breakdown-name">${escapeHtml(g.teamAName)}</div>
        ${rowsA || '<div class="empty-state">No roster data yet.</div>'}
      </div>
      <div class="pm-insight-person">
        <div class="pm-breakdown-name">${escapeHtml(g.teamBName)}</div>
        ${rowsB || '<div class="empty-state">No roster data yet.</div>'}
      </div>
    </div>
    ${matchupHtml}
    <div class="pm-insight-disclaimer">Research-based read on each life path's tendencies &mdash; informational only.</div>
  `;
}

function breakdownModalHtml(g, scores) {
  const hero = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(g.teamAName)} <span class="score-vs">&times;</span> ${escapeHtml(g.teamBName)}</div>
    </div>
  `;
  const breakdown = `
    <div class="pm-breakdown-grid">
      ${breakdownColumnHtml(g.teamAName, scores.scoreA)}
      ${breakdownColumnHtml(g.teamBName, scores.scoreB)}
    </div>
  `;
  return hero + modalTabsHtml(breakdown, insightTabHtml(g, scores));
}

function feedToggleHtml(conditionId, count, open) {
  return `<button class="pm-trade-feed-toggle" data-feed-toggle="${conditionId}" type="button">🐋 ${count ? `${count} whale bet${count === 1 ? '' : 's'}` : 'Big Money Activity'} <span class="pm-feed-caret">${open ? '▾' : '▸'}</span></button>`;
}

function gameCardHtml(g) {
  const pctA = g.priceA != null ? Math.round(g.priceA * 100) : null;
  const pctB = g.priceB != null ? Math.round(g.priceB * 100) : null;
  const favA = pctA != null && pctB != null && pctA >= pctB;

  return `
    <div class="box pm-fight-card" id="pm-card-${g.conditionId}" data-tier="${cardTierKey(g)}">
      <div class="pm-fight-head">
        <div class="pm-fight-names">${escapeHtml(g.teamAName)} vs ${escapeHtml(g.teamBName)}</div>
        ${gameBadge(g)}
      </div>
      <div class="pm-odds-row">
        <div class="pm-odds-pill ${favA ? 'favorite' : ''}">
          <div class="pm-odds-name">${escapeHtml(g.teamAName)}</div>
          <div class="pm-odds-pct">${pctA != null ? `${pctA}%` : '—'}</div>
        </div>
        <div class="pm-odds-pill ${!favA && pctB != null ? 'favorite' : ''}">
          <div class="pm-odds-name">${escapeHtml(g.teamBName)}</div>
          <div class="pm-odds-pct">${pctB != null ? `${pctB}%` : '—'}</div>
        </div>
      </div>
      ${venueLineHtml(g)}
      ${probablePitchersHtml(g)}
      <div class="pm-numerology" id="pm-num-${g.conditionId}">${numerologyBlockHtml(g)}</div>
      <div class="pm-trade-feed" id="pm-feed-${g.conditionId}">${feedToggleHtml(g.conditionId, 0, false)}</div>
    </div>
  `;
}

function renderGameCards() {
  const container = document.getElementById('gamesContainer');
  if (!cardGames.length) {
    container.innerHTML = '<div class="empty-state">No upcoming MLB games found on Polymarket right now.</div>';
    return;
  }
  container.innerHTML = cardGames.map(gameCardHtml).join('');
}

function updateGameCard(conditionId) {
  const g = cardGames.find((x) => x.conditionId === conditionId);
  if (!g) return;
  const el = document.getElementById(`pm-card-${conditionId}`);
  if (el) el.outerHTML = gameCardHtml(g);
  else renderGameCards();
}

/* ===================== Trade feed + smart money ===================== */

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

function renderTradeFeeds() {
  cardGames.forEach((g) => {
    const el = document.getElementById(`pm-feed-${g.conditionId}`);
    if (!el) return;

    const trades = tradesCache.get(g.conditionId) || [];
    const flagged = trades
      .map((t) => ({
        ...t,
        usd: t.size * t.price,
        smart: !!leaderboardMap.get((t.proxyWallet || '').toLowerCase())?.qualifiesSmart,
      }))
      .filter((t) => t.usd >= WHALE_THRESHOLD_USD || t.smart)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);

    const open = openFeeds.has(g.conditionId);

    if (!flagged.length) {
      el.innerHTML = feedToggleHtml(g.conditionId, 0, open)
        + (open ? '<div class="empty-state">No notable big-money activity yet on this game.</div>' : '');
      return;
    }

    el.innerHTML = feedToggleHtml(g.conditionId, flagged.length, open) + (!open ? '' : flagged.map((t) => {
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

function initFeedToggles() {
  document.getElementById('gamesContainer').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feed-toggle]');
    if (!btn) return;
    const id = btn.dataset.feedToggle;
    if (openFeeds.has(id)) openFeeds.delete(id);
    else openFeeds.add(id);
    renderTradeFeeds();
  });
}

async function pollTrades() {
  if (!cardGames.length) return;
  const results = await Promise.all(cardGames.map((g) => fetchTrades(g.conditionId)));
  cardGames.forEach((g, i) => tradesCache.set(g.conditionId, results[i]));
  renderTradeFeeds();
}

/* ===================== Breakdown modal ===================== */

function initBreakdownModal() {
  document.getElementById('gamesContainer').addEventListener('click', (e) => {
    const trigger = e.target.closest('.pm-numerology-clickable');
    if (!trigger) return;
    const g = cardGames.find((x) => x.conditionId === trigger.dataset.conditionId);
    if (!g) return;
    const scores = scoresForGame(g, () => updateGameCard(g.conditionId));
    if (!scores) return;
    document.getElementById('pmBreakdownBody').innerHTML = breakdownModalHtml(g, scores);
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

/* ===================== Orchestration ===================== */

async function loadEventsAndRender() {
  const rawGames = await fetchMlbMoneylineEvents();
  const now = Date.now();
  const cutoff = now - LOOKBACK_MS;
  const windowEnd = now + UPCOMING_WINDOW_MS;
  const relevant = rawGames.filter((g) => g.gameStartTime.getTime() > cutoff && g.gameStartTime.getTime() < windowEnd);
  relevant.sort((a, b) => a.gameStartTime - b.gameStartTime);

  if (!relevant.length) {
    cardGames = [];
    document.getElementById('gamesContainer').innerHTML = '<div class="empty-state">No upcoming MLB games found on Polymarket right now.</div>';
    return;
  }

  const minTime = Math.min(...relevant.map((g) => g.gameStartTime.getTime()));
  const maxTime = Math.max(...relevant.map((g) => g.gameStartTime.getTime()));
  const startISO = isoDateOnly(new Date(minTime - 86400000));
  const endISO = isoDateOnly(new Date(maxTime + 86400000));
  const scheduleGames = await fetchMlbSchedule(startISO, endISO);

  cardGames = relevant.map((g) => {
    const sched = findScheduleGameForMarket(scheduleGames, g.teamAName, g.teamBName, g.gameStartTime);
    if (!sched) return { ...g, gamePk: null, enrichState: 'unmatched' };
    const schedHomeIsA = normalizeName(sched.teams.home.team.name) === normalizeName(g.teamAName);
    return {
      ...g,
      gamePk: sched.gamePk,
      probablePitcherA: schedHomeIsA ? sched.teams.home.probablePitcher : sched.teams.away.probablePitcher,
      probablePitcherB: schedHomeIsA ? sched.teams.away.probablePitcher : sched.teams.home.probablePitcher,
      enrichState: 'loading',
    };
  });

  renderGameCards();
  cardGames.forEach((g) => {
    if (g.enrichState === 'unmatched') return;
    enrichGame(g).then(() => updateGameCard(g.conditionId));
  });
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

(async function init() {
  initRefreshButton();
  initBreakdownModal();
  initFeedToggles();
  initStakeInput();
  leaderboardMap = await fetchLeaderboard();
  await loadEventsAndRender();
  startPolling();
})();

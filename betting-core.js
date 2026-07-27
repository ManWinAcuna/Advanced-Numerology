// Betting engine - shared by betting.html. No DOM in this file: it turns the
// stored predictions (UFC/Tennis/MLB, same records the Stats page tracks) into
// bet slates and a simulated track record. betting.js renders what this
// produces.
//
// Core ideas:
//  - A pick only qualifies for a bet when its own historical bucket (edge tier
//    x market-price bucket, per sport) has enough resolved sample AND the
//    estimated win probability beats the Polymarket price by a real margin.
//    The criteria come from our own data, not from the raw score alone.
//  - Stakes are fractional Kelly (half-Kelly) off the bankroll, with hard caps
//    so no single day can ever torch the roll.
//  - The Betting Stats simulation walks the historical days in order and only
//    ever uses data from BEFORE each day to decide that day's bets - no
//    lookahead - with the bankroll compounding day over day.

/* ===================== Persisted settings (local-only) ===================== */
// Deliberately NOT in CLOUD_SYNC_FIELDS - tiny values, but the betting page
// derives everything else from prediction data that is itself local-only, so
// syncing just these two would create cross-device states that disagree.

const BETTING_BANKROLL_KEY = 'numerology_betting_bankroll';
const BETTING_SIM_START_KEY = 'numerology_betting_sim_start';
const BETTING_MODE_KEY = 'numerology_betting_mode';

function loadBettingBankroll() {
  const v = Number(localStorage.getItem(BETTING_BANKROLL_KEY));
  return Number.isFinite(v) && v > 0 ? v : 1000;
}

function saveBettingBankroll(value) {
  localStorage.setItem(BETTING_BANKROLL_KEY, String(value));
}

// The simulation's day-1 bankroll is its own setting so updating the current
// bankroll every day (which resizes today's stakes) never re-scales the
// historical ledger's dollar figures out from under you.
function loadBettingSimStart() {
  const v = Number(localStorage.getItem(BETTING_SIM_START_KEY));
  return Number.isFinite(v) && v > 0 ? v : 1000;
}

function saveBettingSimStart(value) {
  localStorage.setItem(BETTING_SIM_START_KEY, String(value));
}

// Kelly dial: fraction of full Kelly the stakes use. Quarter is the
// cautious end, half the balanced default, full the aggressive ceiling.
const BETTING_KELLY_KEY = 'numerology_betting_kelly';
const BETTING_KELLY_OPTIONS = [0.25, 0.5, 1];

function loadBettingKellyFraction() {
  const v = Number(localStorage.getItem(BETTING_KELLY_KEY));
  return BETTING_KELLY_OPTIONS.includes(v) ? v : 0.5;
}

function saveBettingKellyFraction(value) {
  localStorage.setItem(BETTING_KELLY_KEY, String(value));
}

function loadBettingMode() {
  const v = localStorage.getItem(BETTING_MODE_KEY);
  return ['singles', '2', '3', '4', 'mixed'].includes(v) ? v : 'singles';
}

function saveBettingMode(value) {
  localStorage.setItem(BETTING_MODE_KEY, String(value));
}

// Which bet kinds run together when Bet Type is Mixed.
const BETTING_MIXED_TYPES_KEY = 'numerology_betting_mixed_types';
const BETTING_MIXED_TYPE_OPTIONS = ['singles', '2', '3', '4'];

function loadBettingMixedTypes() {
  try {
    const v = JSON.parse(localStorage.getItem(BETTING_MIXED_TYPES_KEY));
    const list = Array.isArray(v) ? v.filter((t) => BETTING_MIXED_TYPE_OPTIONS.includes(t)) : [];
    return list.length ? list : ['singles'];
  } catch (e) {
    return ['singles'];
  }
}

function saveBettingMixedTypes(types) {
  localStorage.setItem(BETTING_MIXED_TYPES_KEY, JSON.stringify(types));
}

/* ===================== Day filter ===================== */
// Multi-select: a day passes when its Universal Day is one of the selected
// universal numbers AND its Day Energy is one of the selected energy numbers
// (either list empty = that dimension unrestricted; both selected = the
// combo filter). Restricts WHICH days get bet - the win-probability tallies
// still learn from every resolved day, so the estimates don't thin out.

const BETTING_DAY_FILTER_KEY = 'numerology_betting_day_filter';

function loadBettingDayFilter() {
  try {
    const f = JSON.parse(localStorage.getItem(BETTING_DAY_FILTER_KEY));
    return {
      universal: Array.isArray(f && f.universal) ? f.universal.map(Number) : [],
      energy: Array.isArray(f && f.energy) ? f.energy.map(Number) : [],
      personal: Array.isArray(f && f.personal) ? f.personal.map(Number) : [],
      compat: Array.isArray(f && f.compat) ? f.compat.filter((k) => BETTING_DAY_COMPAT_BANDS.some((b) => b.key === k)) : [],
    };
  } catch (e) {
    return { universal: [], energy: [], personal: [], compat: [] };
  }
}

// Bands for "my compatibility with the day" - same 0-100 score the profile's
// Compatibility with Today box computes (computeEnergyFlow), cut at the same
// thresholds the app colors scores with (77+ good, below 49 rough).
const BETTING_DAY_COMPAT_BANDS = [
  { key: 'good', label: '77+', min: 77, max: 101 },
  { key: 'mid', label: '49-76', min: 49, max: 77 },
  { key: 'rough', label: 'Under 49', min: -1, max: 49 },
];

function bettingDayCompatBandKey(score) {
  const band = BETTING_DAY_COMPAT_BANDS.find((b) => score >= b.min && score < b.max);
  return band ? band.key : null;
}

function saveBettingDayFilter(filter) {
  localStorage.setItem(BETTING_DAY_FILTER_KEY, JSON.stringify(filter));
}

function bettingDayNumbers(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return { universal: universalDayNumber(date), energy: getReducedDay(date), personal: bettingPersonalDayFor(dateKey), compatScore: bettingDayCompatFor(dateKey) };
}

// The user's own Personal Day for a calendar date - same
// personal-month -> personal-day chain the profile's Energy Flow uses, off
// the My Profile birthday. Memoized per date (and invalidated if the
// profile changes) since sims ask for the same ~380 dates repeatedly.
// Returns null when no profile birthday is set.
let _bettingPersonalDayMemo = { profileRaw: null, days: new Map() };

function bettingPersonalDayFor(dateKey) {
  const raw = localStorage.getItem(PROFILE_KEY) || '';
  if (_bettingPersonalDayMemo.profileRaw !== raw) {
    _bettingPersonalDayMemo = { profileRaw: raw, days: new Map() };
  }
  if (_bettingPersonalDayMemo.days.has(dateKey)) return _bettingPersonalDayMemo.days.get(dateKey);

  let result = null;
  const profile = loadProfile();
  if (profile && profile.date) {
    const [by, bm, bd] = profile.date.split('-').map(Number);
    const birthDate = new Date(by, (bm || 1) - 1, bd || 1);
    if (by && !Number.isNaN(birthDate.getTime())) {
      const [y, m, d] = dateKey.split('-').map(Number);
      const date = new Date(y, m - 1, d, 12);
      const personalMonth = reduceNumber(getPersonalMonthRaw(birthDate, date));
      result = reduceNumber(getPersonalDayRaw(personalMonth, date));
      // A summed personal day has no standalone 2 - the one raw sum that
      // lands on exactly 2 is 1+1, which IS an 11 (same doctrine as
      // universalDayNumber; reduceNumber already maps a raw 20 to 11).
      if (result === 2) result = 11;
    }
  }
  _bettingPersonalDayMemo.days.set(dateKey, result);
  return result;
}

// My-compatibility-with-the-day score (0-100) for a calendar date - the
// profile's Compatibility with Today engine pointed at any date. Memoized
// the same way as the personal day above.
let _bettingDayCompatMemo = { profileRaw: null, days: new Map() };

function bettingDayCompatFor(dateKey) {
  const raw = localStorage.getItem(PROFILE_KEY) || '';
  if (_bettingDayCompatMemo.profileRaw !== raw) {
    _bettingDayCompatMemo = { profileRaw: raw, days: new Map() };
  }
  if (_bettingDayCompatMemo.days.has(dateKey)) return _bettingDayCompatMemo.days.get(dateKey);

  let result = null;
  const profile = loadProfile();
  if (profile && profile.date) {
    const [by, bm, bd] = profile.date.split('-').map(Number);
    const birthDate = new Date(by, (bm || 1) - 1, bd || 1);
    if (by && !Number.isNaN(birthDate.getTime())) {
      const [y, m, d] = dateKey.split('-').map(Number);
      result = computeEnergyFlow(birthDate, new Date(y, m - 1, d, 12)).finalScore;
    }
  }
  _bettingDayCompatMemo.days.set(dateKey, result);
  return result;
}

function bettingDayMatchesFilter(dateKey, filter) {
  if (!filter) return true;
  const hasPersonal = filter.personal && filter.personal.length;
  const hasCompat = filter.compat && filter.compat.length;
  if (!filter.universal.length && !filter.energy.length && !hasPersonal && !hasCompat) return true;
  const nums = bettingDayNumbers(dateKey);
  if (filter.universal.length && !filter.universal.includes(nums.universal)) return false;
  if (filter.energy.length && !filter.energy.includes(nums.energy)) return false;
  // No profile birthday means the personal dimensions can't be computed -
  // they're skipped rather than silently blocking every bet.
  if (hasPersonal && nums.personal != null && !filter.personal.includes(nums.personal)) return false;
  if (hasCompat && nums.compatScore != null && !filter.compat.includes(bettingDayCompatBandKey(nums.compatScore))) return false;
  return true;
}

/* ===================== Sport registry ===================== */
// Each sport keeps its own edge-tier calibration (the same tiers the Stats
// page uses) - MLB's composite gaps live on a much tighter scale than the
// one-on-one UFC/Tennis gaps, so tier tallies are never pooled across sports
// even in All Sports mode.

// scopeSport maps a pseudo-sport onto the scope tab it belongs to (NBA totals
// live under the NBA scope); market names the toggle that turns it on/off
// (entries without one are always on). Each pseudo-sport keeps its own tier
// calibration and its own tallies, so a totals record never pollutes a
// moneyline record.
const BETTING_SPORTS = {
  mlb: { label: 'MLB', icon: '⚾', load: () => loadMlbPredictions(), timeField: 'gameTime', minGap: MLB_REAL_EDGE_MIN_GAP, tiers: MLB_EDGE_TIERS, nameA: 'teamAName', nameB: 'teamBName', market: 'moneyline', scopeSport: 'mlb' },
  nba: { label: 'NBA', icon: '🏀', load: () => loadNbaPredictions(), timeField: 'gameTime', minGap: NBA_REAL_EDGE_MIN_GAP, tiers: NBA_EDGE_TIERS, nameA: 'teamAName', nameB: 'teamBName', market: 'nbaMoneyline', scopeSport: 'nba', eventIdField: 'eventId' },
  nbaTotals: { label: 'NBA Totals', icon: '↕️', load: () => loadNbaTotalsPredictions(), timeField: 'gameTime', minGap: NBA_TOTALS_MIN_GAP, tiers: NBA_TOTALS_TIERS, nameA: 'teamAName', nameB: 'teamBName', matchupField: 'gameLabel', market: 'nbaTotals', scopeSport: 'nba', eventIdField: 'eventId' },
  tennis: { label: 'Tennis', icon: '🎾', load: () => loadTennisPredictions(), timeField: 'matchTime', minGap: REAL_EDGE_MIN_GAP, tiers: EDGE_TIERS, nameA: 'playerAName', nameB: 'playerBName' },
  ufc: { label: 'UFC', icon: '🥊', load: () => loadUfcPredictions(), timeField: 'fightTime', minGap: REAL_EDGE_MIN_GAP, tiers: EDGE_TIERS, nameA: 'fighterAName', nameB: 'fighterBName' },
};

// Which per-sport market kinds are enabled on the Betting page. Each key is
// owned by exactly one scope (see BETTING_MARKET_SCOPE in betting.js) so an
// NBA toggle can never gate an MLB market or vice versa.
const BETTING_MARKETS_KEY = 'numerology_betting_markets';
// 'nrfi' and 'totals' (the MLB pitcher-duel markets) were removed. A saved list
// still naming them is cleaned by the filter in loadBettingMarkets below, so no
// version bump is needed - and bumping would be wrong here, since the union
// step would switch markets back on that were deliberately toggled off.
const BETTING_MARKET_OPTIONS = ['moneyline', 'nbaMoneyline', 'nbaTotals'];

// Bumped whenever new market keys are introduced. Without this, a saved list
// from before NBA existed would filter down to the three MLB keys and the new
// NBA markets would silently default to OFF - which reads as "NBA is broken"
// rather than "a toggle is off". On a version bump the newly-added keys are
// unioned in once and the version recorded, so a later deliberate toggle-off
// stays off.
const BETTING_MARKETS_VERSION_KEY = 'numerology_betting_markets_version';
const BETTING_MARKETS_VERSION = 2;

function loadBettingMarkets() {
  try {
    const v = JSON.parse(localStorage.getItem(BETTING_MARKETS_KEY));
    let list = Array.isArray(v) ? v.filter((m) => BETTING_MARKET_OPTIONS.includes(m)) : [];
    if (!list.length) return [...BETTING_MARKET_OPTIONS];

    if (Number(localStorage.getItem(BETTING_MARKETS_VERSION_KEY)) !== BETTING_MARKETS_VERSION) {
      const added = BETTING_MARKET_OPTIONS.filter((m) => !list.includes(m));
      if (added.length) {
        list = [...list, ...added];
        localStorage.setItem(BETTING_MARKETS_KEY, JSON.stringify(list));
      }
      localStorage.setItem(BETTING_MARKETS_VERSION_KEY, String(BETTING_MARKETS_VERSION));
    }
    return list;
  } catch (e) {
    return [...BETTING_MARKET_OPTIONS];
  }
}

function saveBettingMarkets(list) {
  localStorage.setItem(BETTING_MARKETS_KEY, JSON.stringify(list));
}

// Local calendar date of an event time - one betting "day" is a local day,
// matching how isTodayLocal (db-core.js) splits Today from Old Data.
function bettingLocalDateKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Flattens a stored prediction into the one shape the engine works with.
// Returns null when the record can't be bet at all (no usable price/time).
function normalizeBettingPick(p, sportKey) {
  const cfg = BETTING_SPORTS[sportKey];
  const price = numerologyPickPrice(p);
  const timeISO = p[cfg.timeField];
  const dateKey = timeISO ? bettingLocalDateKey(timeISO) : null;
  if (!Number.isFinite(price) || price <= 0 || price >= 1 || !dateKey) return null;

  const gap = edgeGap(p);
  const nameA = p[cfg.nameA];
  return {
    sport: sportKey,
    timeISO,
    dateKey,
    conditionId: p.conditionId || null,
    // Which side of the market this pick is - so a live re-quote reads the
    // same outcome the pick was made on.
    outcomeIndex: normalizeName(p.numerologyFavorite) === normalizeName(nameA) ? 0 : 1,
    // Identifies the underlying event across markets - NBA's moneyline and
    // totals records for one game share ESPN's eventId, which is what lets the parlay
    // builder see that several "different" legs are really several reads on the
    // same game. cfg.eventIdField names whichever field carries that id; the
    // resulting key is prefixed by scope so two sports can never collide.
    gameKey: (cfg.eventIdField && p[cfg.eventIdField] != null)
      ? `${cfg.scopeSport || sportKey}#${p[cfg.eventIdField]}`
      : `${sportKey}#${p.conditionId || timeISO}`,
    matchup: cfg.matchupField && p[cfg.matchupField] ? p[cfg.matchupField] : `${p[cfg.nameA]} vs ${p[cfg.nameB]}`,
    pickName: p.numerologyFavorite,
    price,
    gap,
    tierKey: edgeTierForGap(gap, cfg.tiers).key,
    realEdge: gap >= cfg.minGap,
    bucketLabel: bucketForPrice(price).label,
    resolved: !!p.result,
    draw: !!(p.result && p.result.draw),
    won: isCorrectPick(p),
  };
}

function collectBettingPicks(scope) {
  const enabledMarkets = loadBettingMarkets();
  const sports = Object.keys(BETTING_SPORTS).filter((sportKey) => {
    const cfg = BETTING_SPORTS[sportKey];
    const inScope = scope === 'all' || (cfg.scopeSport || sportKey) === scope;
    const marketOn = !cfg.market || enabledMarkets.includes(cfg.market);
    return inScope && marketOn;
  });
  const picks = [];
  sports.forEach((sportKey) => {
    BETTING_SPORTS[sportKey].load().forEach((p) => {
      const n = normalizeBettingPick(p, sportKey);
      if (n) picks.push(n);
    });
  });
  return picks;
}

/* ===================== Win-probability tallies ===================== */
// Running win/loss counts per (sport | edge tier) and per (sport | edge tier |
// price bucket). The estimate for a pick uses its tier-x-bucket record when it
// exists, shrunk toward the tier's own record so a 3-for-3 micro-bucket can't
// claim 100%. A tier needs BETTING_MIN_TIER_SAMPLE resolved picks before it
// can qualify anything - until the data exists, the engine simply doesn't bet.

const BETTING_MIN_TIER_SAMPLE = 20;
const BETTING_SHRINK_K = 10;
const BETTING_MIN_EV_EDGE = 0.04; // est. win prob must beat the price by 4+ cents
const BETTING_MAX_PROB = 0.95;

function makeBettingTallies() {
  return new Map();
}

function bettingTallyAdd(tallies, key, won) {
  const t = tallies.get(key) || { w: 0, c: 0 };
  t.c += 1;
  if (won) t.w += 1;
  tallies.set(key, t);
}

// Feeds one resolved pick into the tallies. Tossups still get recorded (their
// tier just never qualifies) so tier records mirror the Stats page's tables.
function bettingRecordResult(tallies, pick) {
  if (!pick.resolved || pick.draw) return;
  bettingTallyAdd(tallies, `${pick.sport}|${pick.tierKey}`, pick.won);
  bettingTallyAdd(tallies, `${pick.sport}|${pick.tierKey}|${pick.bucketLabel}`, pick.won);
}

function bettingEstimateWinProb(tallies, pick) {
  if (!pick.realEdge) return null;
  const tier = tallies.get(`${pick.sport}|${pick.tierKey}`);
  if (!tier || tier.c < BETTING_MIN_TIER_SAMPLE) return null;

  const tierRate = (tier.w + BETTING_SHRINK_K * 0.5) / (tier.c + BETTING_SHRINK_K);
  const tb = tallies.get(`${pick.sport}|${pick.tierKey}|${pick.bucketLabel}`);
  const prob = tb
    ? (tb.w + BETTING_SHRINK_K * tierRate) / (tb.c + BETTING_SHRINK_K)
    : tierRate;
  return Math.min(prob, BETTING_MAX_PROB);
}

// A pick qualifies for a bet when its bucket history estimates a win chance
// meaningfully above what the market is charging. Returns the pick annotated
// with estProb/evEdge, or null.
function bettingQualify(tallies, pick) {
  const estProb = bettingEstimateWinProb(tallies, pick);
  if (estProb == null) return null;
  const evEdge = estProb - pick.price;
  if (evEdge < BETTING_MIN_EV_EDGE) return null;
  return { ...pick, estProb, evEdge };
}

/* ===================== Stake sizing (fractional Kelly) ===================== */

const BETTING_MAX_SINGLE_FRACTION = 0.05; // one single can never exceed 5% of roll
const BETTING_MAX_DAY_SINGLES_FRACTION = 0.20; // all singles in a day cap at 20%
const BETTING_MAX_DAY_PARLAY_FRACTION = 0.10; // all parlay tickets in a day cap at 10%
const BETTING_MIN_STAKE = 0.5; // a stake that rounds to $0 isn't worth listing
// Stake multiplier applied per extra leg that repeats a game already on the
// ticket - a concentration discount, not an EV correction (see makeParlays).
const BETTING_SAME_GAME_STAKE_FACTOR = 0.6;

function bettingKellyFraction(prob, price) {
  const b = 1 / price - 1; // net odds a winning $1 returns
  if (b <= 0) return 0;
  return Math.max(0, (prob * b - (1 - prob)) / b);
}

function bettingCombinations(arr, size) {
  const out = [];
  const walk = (start, combo) => {
    if (combo.length === size) { out.push([...combo]); return; }
    for (let i = start; i < arr.length; i += 1) {
      combo.push(arr[i]);
      walk(i + 1, combo);
      combo.pop();
    }
  };
  walk(0, []);
  return out;
}

// Proportionally scales ticket stakes down so their sum never exceeds the
// day's risk budget - Kelly is computed per ticket in isolation, and on a
// heavy slate the naive sum would overbet the roll.
function bettingCapDayStakes(tickets, bankroll, maxDayFraction) {
  const total = tickets.reduce((s, t) => s + t.stake, 0);
  const budget = bankroll * maxDayFraction;
  if (total > budget && total > 0) {
    const scale = budget / total;
    tickets.forEach((t) => { t.stake *= scale; });
  }
  // Whole-dollar stakes - that's how the bets actually get placed, and Kelly
  // is insensitive to sub-dollar precision anyway.
  tickets.forEach((t) => { t.stake = Math.round(t.stake); });
  return tickets.filter((t) => t.stake >= BETTING_MIN_STAKE);
}

/* ===================== Slate builder ===================== */
// mode: 'singles' | '2' | '3' | '4'. Parlay modes build every N-leg
// combination of the top N+1 qualified picks (ranked by EV edge): the first
// combination IS the headline top-N ticket, and the rest are the round-robin
// alternates, so one bad leg doesn't sink the whole day. The day's budget is
// split across all tickets via the cap above.

// kellyFractionOverride lets the Strategy Lab compare Kelly dials; everything
// else sizes off the saved setting.
function buildBettingSlate(dayPicks, mode, tallies, bankroll, mixedTypes, kellyFractionOverride) {
  const kellyFraction = kellyFractionOverride || loadBettingKellyFraction();
  const seen = new Set();
  const qualified = dayPicks
    .map((p) => bettingQualify(tallies, p))
    .filter(Boolean)
    .filter((q) => {
      // one bet per event - backfill dedup already handles this per sport,
      // but All Sports pooling makes the guard cheap insurance
      const key = `${q.sport}|${q.matchup}|${q.dateKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.evEdge - a.evEdge);

  const makeSingles = () => qualified.map((q) => {
    const f = Math.min(bettingKellyFraction(q.estProb, q.price) * kellyFraction, BETTING_MAX_SINGLE_FRACTION);
    return { legs: [q], stake: bankroll * f, prodPrice: q.price, estProb: q.estProb, headline: false };
  }).filter((t) => t.stake > 0);

  const makeParlays = (legCount) => {
    if (qualified.length < legCount) return [];
    const pool = qualified.slice(0, legCount + 1);
    return bettingCombinations(pool, legCount).map((legs, i) => {
      const estProb = legs.reduce((p, l) => p * l.estProb, 1);
      const prodPrice = legs.reduce((p, l) => p * l.price, 1);
      // Legs drawn from the same game (a moneyline and an Under both read off
      // one matchup) are not independent. They're positively correlated, so
      // multiplying their probabilities actually UNDER-states the ticket's
      // true win chance - the problem isn't the EV, it's concentration: one
      // game can sink every leg at once, so a ticket like this carries far
      // more risk than its leg count suggests. The stake is discounted per
      // duplicated game to keep that concentration in check.
      const distinctGames = new Set(legs.map((l) => l.gameKey)).size;
      const concentration = legs.length - distinctGames;
      const concentrationFactor = Math.pow(BETTING_SAME_GAME_STAKE_FACTOR, concentration);
      const f = bettingKellyFraction(estProb, prodPrice) * kellyFraction * concentrationFactor;
      return { legs, stake: bankroll * f, prodPrice, estProb, headline: i === 0, sameGameLegs: concentration };
    }).filter((t) => t.stake > 0);
  };

  if (mode === 'singles') {
    return { tickets: bettingCapDayStakes(makeSingles(), bankroll, BETTING_MAX_DAY_SINGLES_FRACTION), qualifiedCount: qualified.length };
  }

  // Mixed runs the selected bet kinds side by side over the same qualified
  // picks: singles keep their own daily budget, and every parlay ticket of
  // every selected size shares the single parlay budget, so total day risk
  // stays capped no matter how many kinds are on.
  if (mode === 'mixed') {
    const types = (mixedTypes && mixedTypes.length) ? mixedTypes : ['singles'];
    let tickets = [];
    if (types.includes('singles')) {
      tickets = bettingCapDayStakes(makeSingles(), bankroll, BETTING_MAX_DAY_SINGLES_FRACTION);
    }
    let parlays = [];
    ['2', '3', '4'].forEach((n) => {
      if (types.includes(n)) parlays = parlays.concat(makeParlays(Number(n)));
    });
    tickets = tickets.concat(bettingCapDayStakes(parlays, bankroll, BETTING_MAX_DAY_PARLAY_FRACTION));
    return { tickets, qualifiedCount: qualified.length, mixed: true };
  }

  const legCount = Number(mode);
  if (qualified.length < legCount) {
    return { tickets: [], qualifiedCount: qualified.length, notEnoughLegs: true, legCount };
  }

  return { tickets: bettingCapDayStakes(makeParlays(legCount), bankroll, BETTING_MAX_DAY_PARLAY_FRACTION), qualifiedCount: qualified.length, legCount };
}

/* ===================== Settlement ===================== */
// A lost leg loses the ticket no matter what else is pending; a drawn/voided
// leg voids the whole ticket (stake back); otherwise pending until every leg
// resolves. Winning pays $1 per share Polymarket-style: profit =
// stake * (1/price - 1), parlays multiply legs into prodPrice first.

function settleBettingTicket(ticket) {
  let anyPending = false;
  let anyDraw = false;
  for (const leg of ticket.legs) {
    if (leg.resolved && !leg.draw && !leg.won) return { status: 'lost', profit: -ticket.stake };
    if (leg.resolved && leg.draw) anyDraw = true;
    if (!leg.resolved) anyPending = true;
  }
  if (anyDraw) return { status: 'void', profit: 0 };
  if (anyPending) return { status: 'pending', profit: 0 };
  return { status: 'won', profit: Math.round(ticket.stake * (1 / ticket.prodPrice - 1) * 100) / 100 };
}

/* ===================== Walk-forward simulation ===================== */
// Replays the whole stored history day by day: each day's bets are chosen
// using only the tallies accumulated from earlier days (the first weeks
// produce no bets at all until tiers reach sample), stakes come off the
// current simulated bankroll, results settle, the bankroll compounds, and
// only then does that day's data join the tallies. Today (local) is included
// live: its picks can still be pending, so its ledger row keeps updating as
// results land - which is exactly the end-of-day "how did today do" view.

// prePicks lets the Strategy Lab run many sims off one collectBettingPicks
// pass instead of re-reading/re-parsing storage per run. Picks are never
// mutated by a simulation, so sharing the array across runs is safe.
function runBettingSimulation(scope, mode, startBankroll, dayFilter, mixedTypes, prePicks, kellyFractionOverride) {
  const picks = prePicks || collectBettingPicks(scope);
  const todayKey = bettingLocalDateKey(new Date());

  const byDay = new Map();
  picks.forEach((p) => {
    if (p.dateKey > todayKey) return; // tomorrow's posted games aren't bettable yet
    if (!byDay.has(p.dateKey)) byDay.set(p.dateKey, []);
    byDay.get(p.dateKey).push(p);
  });

  const dayKeys = [...byDay.keys()].sort();
  const tallies = makeBettingTallies();
  let bankroll = startBankroll;
  const ledger = [];
  const totals = { staked: 0, profit: 0, won: 0, lost: 0, pending: 0, voided: 0, tickets: 0 };
  // Worst peak-to-trough slide of the simulated bankroll - the honest "how
  // bad did it get before it recovered" number next to the headline growth.
  //
  // Tracked as two SEPARATE maxima, because on a compounding curve the biggest
  // dollar slide and the biggest percentage slide are almost never the same
  // event, and only reporting the dollar one hides the risk. A bankroll that
  // runs $50 -> $12,000 spends most of its life below the eventual dollar
  // record, so an early wipeout - $80 down to $8, a 90% loss - is only $72 and
  // can never win a dollar comparison. The dollar figure describes the richest
  // stretch of the run by construction; the percentage is the one that says
  // whether the slide was survivable at the size you were betting.
  let bankrollPeak = startBankroll;
  let maxDrawdown = 0; // largest slide in dollars, + the % that came with it
  let maxDrawdownPct = 0;
  let worstSlidePct = 0; // largest slide in percent, + the $ that came with it
  let worstSlideAmount = 0;
  let worstSlideDateKey = null;

  dayKeys.forEach((dateKey) => {
    const dayPicks = byDay.get(dateKey);
    const isToday = dateKey === todayKey;
    // History only replays what actually resolved; today bets its full slate
    // and settles what it can so far. A day outside the day filter places no
    // bets at all (it still feeds the tallies below).
    const dayAllowed = bettingDayMatchesFilter(dateKey, dayFilter);
    const bettable = isToday ? dayPicks : dayPicks.filter((p) => p.resolved && !p.draw);

    const slate = dayAllowed ? buildBettingSlate(bettable, mode, tallies, bankroll, mixedTypes, kellyFractionOverride) : { tickets: [] };
    const tickets = slate.tickets.map((t) => ({ ...t, ...settleBettingTicket(t) }));

    if (tickets.length) {
      const staked = Math.round(tickets.reduce((s, t) => s + t.stake, 0) * 100) / 100;
      const profit = Math.round(tickets.reduce((s, t) => s + t.profit, 0) * 100) / 100;
      const inProgress = tickets.some((t) => t.status === 'pending');
      bankroll = Math.round((bankroll + profit) * 100) / 100;
      ledger.push({ dateKey, tickets, staked, profit, bankrollAfter: bankroll, inProgress });

      if (bankroll > bankrollPeak) bankrollPeak = bankroll;
      const drawdown = bankrollPeak - bankroll;
      const drawdownPct = bankrollPeak > 0 ? drawdown / bankrollPeak : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = drawdownPct;
      }
      if (drawdownPct > worstSlidePct) {
        worstSlidePct = drawdownPct;
        worstSlideAmount = drawdown;
        worstSlideDateKey = dateKey;
      }

      totals.staked += staked;
      totals.profit += profit;
      totals.tickets += tickets.length;
      tickets.forEach((t) => {
        if (t.status === 'won') totals.won += 1;
        else if (t.status === 'lost') totals.lost += 1;
        else if (t.status === 'pending') totals.pending += 1;
        else totals.voided += 1;
      });
    }

    // The day joins the track record only after it was bet - no lookahead.
    dayPicks.forEach((p) => bettingRecordResult(tallies, p));
  });

  totals.staked = Math.round(totals.staked * 100) / 100;
  totals.profit = Math.round(totals.profit * 100) / 100;

  return {
    ledger: ledger.reverse(), // newest first for display
    finalBankroll: bankroll,
    startBankroll,
    totals,
    dayCount: ledger.length,
    peakBankroll: Math.round(bankrollPeak * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100),
    worstSlidePct: Math.round(worstSlidePct * 100),
    worstSlideAmount: Math.round(worstSlideAmount * 100) / 100,
    worstSlideDateKey,
    resolvedPickCount: picks.filter((p) => p.resolved && !p.draw && p.dateKey < todayKey).length,
  };
}

/* ===================== Stale-price guard ===================== */
// A pick is tracked at the price that existed when the slate was built, but
// the bet gets placed hours later - by then the market may have moved past
// the point where the edge exists at all. This re-fetches the live price for
// today's suggested legs and marks any whose edge has evaporated. Prices are
// keyed by conditionId (the same id the Stats trackers resolve against).

// Live prices for a set of Polymarket condition ids, as a Map of
// conditionId -> [priceA, priceB]. Uses the same batched endpoint the
// result-checkers use, so no new API surface.
async function fetchLiveBettingPrices(conditionIds) {
  const prices = new Map();
  const unique = [...new Set(conditionIds.filter(Boolean))];
  if (!unique.length) return prices;
  const markets = await fetchMarketsByConditionIds(unique);
  markets.forEach((m) => {
    try {
      const parsed = JSON.parse(m.outcomePrices).map(Number);
      if (parsed.length >= 2 && parsed.every(Number.isFinite)) prices.set(m.conditionId, parsed);
    } catch (e) { /* skip unparseable */ }
  });
  return prices;
}

// Annotates each leg of each ticket with livePrice/stale. A leg is stale
// when its current price has risen past the point where the estimated win
// probability still clears BETTING_MIN_EV_EDGE - i.e. the edge is gone at
// today's price, even though the pick itself hasn't changed.
async function markStaleBettingPrices(tickets) {
  const legs = tickets.flatMap((t) => t.legs);
  const prices = await fetchLiveBettingPrices(legs.map((l) => l.conditionId));
  if (!prices.size) return { checked: 0, stale: 0 };

  let checked = 0;
  let stale = 0;
  legs.forEach((leg) => {
    const pair = prices.get(leg.conditionId);
    if (!pair) return;
    // outcomeIndex was stored when the pick was normalized, so the right
    // side is read even when the market lists them in the other order.
    const live = pair[leg.outcomeIndex];
    if (!Number.isFinite(live) || live <= 0 || live >= 1) return;
    checked += 1;
    leg.livePrice = live;
    leg.maxPrice = leg.estProb - BETTING_MIN_EV_EDGE;
    leg.stale = live > leg.maxPrice;
    if (leg.stale) stale += 1;
  });
  return { checked, stale };
}

/* ===================== Market readiness ===================== */
// Answers "is this market actually working?" - the thing that's otherwise
// invisible, because a market with no qualifying bets and a market with no
// data at all both render as an empty slate. Per pseudo-sport in scope:
// how much is stored, how much resolved, how the real-edge picks have done,
// and the best tier's progress toward BETTING_MIN_TIER_SAMPLE (the warmup
// every tier must clear before the engine will stake anything on it).

function bettingMarketReadiness(scope) {
  const enabled = loadBettingMarkets();
  return Object.keys(BETTING_SPORTS).filter((sportKey) => {
    const cfg = BETTING_SPORTS[sportKey];
    const inScope = scope === 'all' || (cfg.scopeSport || sportKey) === scope;
    return inScope && (!cfg.market || enabled.includes(cfg.market));
  }).map((sportKey) => {
    const cfg = BETTING_SPORTS[sportKey];
    const picks = cfg.load().map((p) => normalizeBettingPick(p, sportKey)).filter(Boolean);
    const resolved = picks.filter((p) => p.resolved && !p.draw);
    const realEdge = resolved.filter((p) => p.realEdge);
    const wins = realEdge.filter((p) => p.won).length;

    // Best tier by resolved count - the one closest to being bettable.
    const tierCounts = new Map();
    realEdge.forEach((p) => tierCounts.set(p.tierKey, (tierCounts.get(p.tierKey) || 0) + 1));
    let bestTier = null;
    tierCounts.forEach((count, key) => {
      if (!bestTier || count > bestTier.count) bestTier = { key, count };
    });

    return {
      sportKey,
      label: cfg.label,
      icon: cfg.icon,
      tracked: picks.length,
      resolved: resolved.length,
      realEdge: realEdge.length,
      winPct: realEdge.length ? Math.round((wins / realEdge.length) * 100) : null,
      bestTierCount: bestTier ? bestTier.count : 0,
      ready: !!bestTier && bestTier.count >= BETTING_MIN_TIER_SAMPLE,
    };
  });
}

/* ===================== Locked Bet Log ===================== */
// Receipts. Locking freezes the currently-suggested slate - tickets, stakes,
// prices, settings, timestamp - permanently (local-only storage, never
// cloud-synced, no edit path). Settlement re-derives each leg's result from
// the live prediction stores at render time, so a locked slate settles
// exactly when the Stats page would settle the same games.

const BETTING_LOCKED_SLATES_KEY = 'numerology_betting_locked_slates';

function loadBettingLockedSlates() {
  try {
    const v = JSON.parse(bigStoreGetItem(BETTING_LOCKED_SLATES_KEY));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function saveBettingLockedSlates(list) {
  saveJsonGuarded(BETTING_LOCKED_SLATES_KEY, list);
}

// Removes one locked receipt. Keyed by id, falling back to the content
// signature for records written before ids existed (and for anything restored
// from an older backup) - the signature is unique per locked slate by
// construction, so it identifies the same row just as well.
//
// Returns the removed record so the caller can report what went, or null when
// the key matches nothing. Callers must treat null as "already gone" rather
// than an error: a double-tap on a phone, or another tab that deleted it first,
// both land here and neither is a failure.
function deleteBettingLockedSlate(key) {
  const list = loadBettingLockedSlates();
  const idx = list.findIndex((s) => (s.id || s.signature) === key);
  if (idx < 0) return null;
  const [removed] = list.splice(idx, 1);
  saveBettingLockedSlates(list);
  return removed;
}

// Identity of a slate's content - used to stop the same slate being locked
// twice. A later slate the same day (games dropped out / new games tracked)
// has a different signature and locks as its own receipt.
function bettingSlateSignature(scope, mode, dateKey, tickets) {
  const body = tickets.map((t) => `${t.stake.toFixed(2)}:${t.legs.map((l) => `${l.sport}~${l.matchup}~${l.pickName}`).join('+')}`).join('|');
  return `${scope}#${mode}#${dateKey}#${body}`;
}

function lockBettingSlate(scope, mode, mixedTypes, bankroll, tickets) {
  if (!tickets.length) return null;
  const list = loadBettingLockedSlates();
  const dateKey = bettingLocalDateKey(new Date());
  const signature = bettingSlateSignature(scope, mode, dateKey, tickets);
  if (list.some((s) => s.signature === signature)) return null;

  const record = {
    id: uid(),
    lockedAt: new Date().toISOString(),
    dateKey,
    scope,
    mode,
    mixedTypes: mode === 'mixed' ? mixedTypes : null,
    bankroll,
    signature,
    tickets: tickets.map((t) => ({
      stake: t.stake,
      prodPrice: t.prodPrice,
      estProb: t.estProb,
      headline: !!t.headline,
      legs: t.legs.map((l) => ({ sport: l.sport, timeISO: l.timeISO, matchup: l.matchup, pickName: l.pickName, price: l.price, estProb: l.estProb })),
    })),
  };
  list.push(record);
  saveBettingLockedSlates(list);
  return record;
}

// Returns the locked slates hydrated with current results - never mutates
// the stored records themselves.
function settleLockedSlates(lockedList) {
  const idx = new Map();
  collectBettingPicks('all').forEach((p) => idx.set(`${p.sport}|${p.timeISO}|${normalizeName(p.matchup)}`, p));

  return lockedList.map((s) => {
    const tickets = s.tickets.map((t) => {
      const legs = t.legs.map((l) => {
        const cur = idx.get(`${l.sport}|${l.timeISO}|${normalizeName(l.matchup)}`);
        return { ...l, resolved: !!(cur && cur.resolved), draw: !!(cur && cur.draw), won: !!(cur && cur.won) };
      });
      const hydrated = { ...t, legs };
      return { ...hydrated, ...settleBettingTicket(hydrated) };
    });
    const staked = Math.round(tickets.reduce((sum, t) => sum + t.stake, 0) * 100) / 100;
    const profit = Math.round(tickets.reduce((sum, t) => sum + t.profit, 0) * 100) / 100;
    return { ...s, tickets, staked, profit, inProgress: tickets.some((t) => t.status === 'pending') };
  });
}

/* ===================== Today's real-money slate ===================== */
// Same qualification as the simulation's today row, but staked from the
// user's actual entered bankroll (the sim's compounded balance is a
// hypothetical; today's recommendations are for real money). Tallies are the
// full resolved history before today - order doesn't matter for counting, so
// no day walk is needed here.

function buildTodayBettingSlate(scope, mode, userBankroll, dayFilter, mixedTypes) {
  const picks = collectBettingPicks(scope);
  const todayKey = bettingLocalDateKey(new Date());

  if (!bettingDayMatchesFilter(todayKey, dayFilter)) {
    return { tickets: [], dayFiltered: true, todayNums: bettingDayNumbers(todayKey) };
  }

  const tallies = makeBettingTallies();
  picks.filter((p) => p.dateKey < todayKey).forEach((p) => bettingRecordResult(tallies, p));

  const todayPicks = picks.filter((p) => p.dateKey === todayKey);
  // Only games that haven't started are placeable - the stored price is the
  // pre-game quote, and once a game is underway (or already final) that bet
  // no longer exists, so it must never appear in a suggested ticket. The
  // day's already-started games still count in the ledger's today row.
  const nowMs = Date.now();
  const upcoming = todayPicks.filter((p) => {
    const t = new Date(p.timeISO).getTime();
    return Number.isFinite(t) && t > nowMs;
  });
  const slate = buildBettingSlate(upcoming, mode, tallies, userBankroll, mixedTypes);
  const tickets = slate.tickets.map((t) => ({ ...t, ...settleBettingTicket(t) }));

  return {
    tickets,
    qualifiedCount: slate.qualifiedCount,
    notEnoughLegs: !!slate.notEnoughLegs,
    legCount: slate.legCount,
    totalTodayPicks: todayPicks.length,
    upcomingCount: upcoming.length,
  };
}

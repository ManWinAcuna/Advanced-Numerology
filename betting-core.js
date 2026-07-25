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

function loadBettingMode() {
  const v = localStorage.getItem(BETTING_MODE_KEY);
  return ['singles', '2', '3', '4'].includes(v) ? v : 'singles';
}

function saveBettingMode(value) {
  localStorage.setItem(BETTING_MODE_KEY, String(value));
}

/* ===================== Sport registry ===================== */
// Each sport keeps its own edge-tier calibration (the same tiers the Stats
// page uses) - MLB's composite gaps live on a much tighter scale than the
// one-on-one UFC/Tennis gaps, so tier tallies are never pooled across sports
// even in All Sports mode.

const BETTING_SPORTS = {
  mlb: { label: 'MLB', icon: '⚾', load: () => loadMlbPredictions(), timeField: 'gameTime', minGap: MLB_REAL_EDGE_MIN_GAP, tiers: MLB_EDGE_TIERS, nameA: 'teamAName', nameB: 'teamBName' },
  tennis: { label: 'Tennis', icon: '🎾', load: () => loadTennisPredictions(), timeField: 'matchTime', minGap: REAL_EDGE_MIN_GAP, tiers: EDGE_TIERS, nameA: 'playerAName', nameB: 'playerBName' },
  ufc: { label: 'UFC', icon: '🥊', load: () => loadUfcPredictions(), timeField: 'fightTime', minGap: REAL_EDGE_MIN_GAP, tiers: EDGE_TIERS, nameA: 'fighterAName', nameB: 'fighterBName' },
};

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
  return {
    sport: sportKey,
    timeISO,
    dateKey,
    matchup: `${p[cfg.nameA]} vs ${p[cfg.nameB]}`,
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
  const sports = scope === 'all' ? Object.keys(BETTING_SPORTS) : [scope];
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

const BETTING_HALF_KELLY = 0.5;
const BETTING_MAX_SINGLE_FRACTION = 0.05; // one single can never exceed 5% of roll
const BETTING_MAX_DAY_SINGLES_FRACTION = 0.20; // all singles in a day cap at 20%
const BETTING_MAX_DAY_PARLAY_FRACTION = 0.10; // all parlay tickets in a day cap at 10%
const BETTING_MIN_STAKE = 0.5; // below 50 cents a ticket isn't worth listing

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
  tickets.forEach((t) => { t.stake = Math.round(t.stake * 100) / 100; });
  return tickets.filter((t) => t.stake >= BETTING_MIN_STAKE);
}

/* ===================== Slate builder ===================== */
// mode: 'singles' | '2' | '3' | '4'. Parlay modes build every N-leg
// combination of the top N+1 qualified picks (ranked by EV edge): the first
// combination IS the headline top-N ticket, and the rest are the round-robin
// alternates, so one bad leg doesn't sink the whole day. The day's budget is
// split across all tickets via the cap above.

function buildBettingSlate(dayPicks, mode, tallies, bankroll) {
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

  if (mode === 'singles') {
    const tickets = qualified.map((q) => {
      const f = Math.min(bettingKellyFraction(q.estProb, q.price) * BETTING_HALF_KELLY, BETTING_MAX_SINGLE_FRACTION);
      return { legs: [q], stake: bankroll * f, prodPrice: q.price, estProb: q.estProb, headline: false };
    }).filter((t) => t.stake > 0);
    return { tickets: bettingCapDayStakes(tickets, bankroll, BETTING_MAX_DAY_SINGLES_FRACTION), qualifiedCount: qualified.length };
  }

  const legCount = Number(mode);
  if (qualified.length < legCount) {
    return { tickets: [], qualifiedCount: qualified.length, notEnoughLegs: true, legCount };
  }

  const pool = qualified.slice(0, legCount + 1);
  const tickets = bettingCombinations(pool, legCount).map((legs, i) => {
    const estProb = legs.reduce((p, l) => p * l.estProb, 1);
    const prodPrice = legs.reduce((p, l) => p * l.price, 1);
    const f = bettingKellyFraction(estProb, prodPrice) * BETTING_HALF_KELLY;
    return { legs, stake: bankroll * f, prodPrice, estProb, headline: i === 0 };
  }).filter((t) => t.stake > 0);

  return { tickets: bettingCapDayStakes(tickets, bankroll, BETTING_MAX_DAY_PARLAY_FRACTION), qualifiedCount: qualified.length, legCount };
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

function runBettingSimulation(scope, mode, startBankroll) {
  const picks = collectBettingPicks(scope);
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
  let bankrollPeak = startBankroll;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  dayKeys.forEach((dateKey) => {
    const dayPicks = byDay.get(dateKey);
    const isToday = dateKey === todayKey;
    // History only replays what actually resolved; today bets its full slate
    // and settles what it can so far.
    const bettable = isToday ? dayPicks : dayPicks.filter((p) => p.resolved && !p.draw);

    const slate = buildBettingSlate(bettable, mode, tallies, bankroll);
    const tickets = slate.tickets.map((t) => ({ ...t, ...settleBettingTicket(t) }));

    if (tickets.length) {
      const staked = Math.round(tickets.reduce((s, t) => s + t.stake, 0) * 100) / 100;
      const profit = Math.round(tickets.reduce((s, t) => s + t.profit, 0) * 100) / 100;
      const inProgress = tickets.some((t) => t.status === 'pending');
      bankroll = Math.round((bankroll + profit) * 100) / 100;
      ledger.push({ dateKey, tickets, staked, profit, bankrollAfter: bankroll, inProgress });

      if (bankroll > bankrollPeak) bankrollPeak = bankroll;
      const drawdown = bankrollPeak - bankroll;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = bankrollPeak > 0 ? drawdown / bankrollPeak : 0;
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
    resolvedPickCount: picks.filter((p) => p.resolved && !p.draw && p.dateKey < todayKey).length,
  };
}

/* ===================== Today's real-money slate ===================== */
// Same qualification as the simulation's today row, but staked from the
// user's actual entered bankroll (the sim's compounded balance is a
// hypothetical; today's recommendations are for real money). Tallies are the
// full resolved history before today - order doesn't matter for counting, so
// no day walk is needed here.

function buildTodayBettingSlate(scope, mode, userBankroll) {
  const picks = collectBettingPicks(scope);
  const todayKey = bettingLocalDateKey(new Date());

  const tallies = makeBettingTallies();
  picks.filter((p) => p.dateKey < todayKey).forEach((p) => bettingRecordResult(tallies, p));

  const todayPicks = picks.filter((p) => p.dateKey === todayKey);
  const slate = buildBettingSlate(todayPicks, mode, tallies, userBankroll);
  const tickets = slate.tickets.map((t) => ({ ...t, ...settleBettingTicket(t) }));

  return {
    tickets,
    qualifiedCount: slate.qualifiedCount,
    notEnoughLegs: !!slate.notEnoughLegs,
    legCount: slate.legCount,
    totalTodayPicks: todayPicks.length,
  };
}

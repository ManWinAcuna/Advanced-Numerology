// Stock Cycles - the numerology engine pointed at markets instead of matchups.
// Every instrument is a set of dated anchors (company founding, IPO, CEO
// birthdate; exchange/contract dates for futures), each read exactly like a
// person elsewhere in the app: life path from numerology.js, zodiac year
// animal, this year's animal relationship from the same VIETNAMESE_TABLE the
// sports engine scores with (clash pairs sit at 10, trine allies at 85+),
// and the anchor's Personal Year/Month/Day cycles via computeEnergyFlow.
//
// HONEST SCOPE: unlike the sports side there is no tracked record behind any
// of this yet - no fitted weights, no backtest. Every read on this page is
// the raw engine, presented as a watchlist lens, not a proven edge. Dates
// are sourced public record; an anchor whose exact day is not reliably known
// (COMEX silver, 1963) carries a YEAR ONLY read - the zodiac animal is the
// only thing a bare year genuinely determines (same rule as the MLB
// franchise fallback). No fabricated dates.

/* ===================== Instruments ===================== */
// primary anchors drive the watch verdicts: a company trades on its own
// cycle and its CEO's, with the IPO as context; a contract or coin has only
// its own dates. px maps each instrument to its Twelve Data price symbol for
// the Trades panel (futures/metals ride 1:1 proxies, labeled).

const STOCK_INSTRUMENTS = [
  {
    ticker: 'TSLA', name: 'Tesla', kind: 'stock', hue: 0,
    px: { symbol: 'TSLA' },
    anchors: [
      { key: 'company', label: 'Company', date: '2003-07-01', primary: true },
      { key: 'ipo', label: 'IPO', date: '2010-06-29' },
      { key: 'ceo', label: 'CEO', person: 'Elon Musk', date: '1971-06-28', primary: true },
    ],
  },
  {
    ticker: 'META', name: 'Meta', kind: 'stock', hue: 217,
    px: { symbol: 'META' },
    anchors: [
      { key: 'company', label: 'Company', date: '2004-02-04', primary: true },
      { key: 'ipo', label: 'IPO', date: '2012-05-18' },
      { key: 'ceo', label: 'CEO', person: 'Mark Zuckerberg', date: '1984-05-14', primary: true },
    ],
  },
  {
    ticker: 'AAPL', name: 'Apple', kind: 'stock', hue: 210,
    px: { symbol: 'AAPL' },
    anchors: [
      { key: 'company', label: 'Company', date: '1976-04-01', primary: true },
      { key: 'ipo', label: 'IPO', date: '1980-12-12' },
      { key: 'ceo', label: 'CEO', person: 'Tim Cook', date: '1960-11-01', primary: true },
    ],
  },
  {
    ticker: 'NVDA', name: 'Nvidia', kind: 'stock', hue: 95,
    px: { symbol: 'NVDA' },
    anchors: [
      { key: 'company', label: 'Company', date: '1993-04-05', primary: true },
      { key: 'ipo', label: 'IPO', date: '1999-01-22' },
      { key: 'ceo', label: 'CEO', person: 'Jensen Huang', date: '1963-02-17', primary: true },
    ],
  },
  {
    ticker: 'MSFT', name: 'Microsoft', kind: 'stock', hue: 200,
    px: { symbol: 'MSFT' },
    anchors: [
      { key: 'company', label: 'Company', date: '1975-04-04', primary: true },
      { key: 'ipo', label: 'IPO', date: '1986-03-13' },
      { key: 'ceo', label: 'CEO', person: 'Satya Nadella', date: '1967-08-19', primary: true },
    ],
  },
  {
    ticker: 'AMZN', name: 'Amazon', kind: 'stock', hue: 35,
    px: { symbol: 'AMZN' },
    anchors: [
      { key: 'company', label: 'Company', date: '1994-07-05', primary: true },
      { key: 'ipo', label: 'IPO', date: '1997-05-15' },
      { key: 'ceo', label: 'CEO', person: 'Andy Jassy', date: '1968-01-13', primary: true },
    ],
  },
  {
    ticker: 'GOOGL', name: 'Alphabet', kind: 'stock', hue: 265,
    px: { symbol: 'GOOGL' },
    anchors: [
      { key: 'company', label: 'Company', date: '1998-09-04', primary: true },
      { key: 'ipo', label: 'IPO', date: '2004-08-19' },
      { key: 'ceo', label: 'CEO', person: 'Sundar Pichai', date: '1972-06-10', primary: true },
    ],
  },
  {
    ticker: 'WMT', name: 'Walmart', kind: 'stock', hue: 208,
    px: { symbol: 'WMT' },
    anchors: [
      // First Walmart store opened Rogers, Arkansas, July 2, 1962.
      { key: 'company', label: 'Company', date: '1962-07-02', primary: true },
      { key: 'ipo', label: 'IPO', date: '1970-10-01' },
      { key: 'ceo', label: 'CEO', person: 'Doug McMillon', date: '1966-10-17', primary: true },
    ],
  },
  {
    ticker: 'NQ', name: 'Nasdaq-100 E-mini', kind: 'futures', hue: 190, image: 'Nasdaq',
    px: { symbol: 'QQQ', note: 'via QQQ' },
    anchors: [
      // The exchange's own first trading day - owner-requested anchor.
      { key: 'exchange', label: 'Nasdaq Born', date: '1971-02-08', primary: true },
      { key: 'launch', label: 'Contract Launch', date: '1999-06-21', primary: true },
    ],
  },
  {
    ticker: 'ES', name: 'S&P 500 E-mini', kind: 'futures', hue: 150, image: "Standard & Poor's",
    px: { symbol: 'SPY', note: 'via SPY' },
    anchors: [
      // Owner-specified anchor date (the index's own launch was 1957-03-04;
      // this record follows the owner's 3/4/1971 instruction).
      { key: 'index', label: 'Index Anchor', date: '1971-03-04', primary: true },
      { key: 'launch', label: 'Contract Launch', date: '1997-09-09', primary: true },
    ],
  },
  {
    ticker: 'GC', name: 'Gold Futures', kind: 'commodity', hue: 45, image: 'Gold',
    px: { symbol: 'XAU/USD', note: 'spot' },
    anchors: [
      // COMEX gold trading opened the day private gold ownership came back
      // (Dec 31, 1974) - a real, exact, well-documented birthdate.
      { key: 'launch', label: 'COMEX Launch', date: '1974-12-31', primary: true },
    ],
  },
  {
    ticker: 'SI', name: 'Silver Futures', kind: 'commodity', hue: 220, image: 'Silver',
    px: { symbol: 'XAG/USD', note: 'spot' },
    anchors: [
      // Owner-verified exact launch date.
      { key: 'launch', label: 'COMEX Launch', date: '1963-06-12', primary: true },
    ],
  },
  {
    ticker: 'BTC', name: 'Bitcoin', kind: 'crypto', hue: 28, image: 'Bitcoin',
    px: { symbol: 'BTC/USD' },
    anchors: [
      { key: 'launch', label: 'Genesis Block', date: '2009-01-03', primary: true },
    ],
  },
  {
    ticker: 'ETH', name: 'Ethereum', kind: 'crypto', hue: 250, image: 'Ethereum',
    px: { symbol: 'ETH/USD' },
    anchors: [
      { key: 'launch', label: 'Genesis Block', date: '2015-07-30', primary: true },
    ],
  },
  {
    ticker: 'XLM', name: 'Stellar', kind: 'crypto', hue: 185, image: 'Stellar (payment network)',
    px: { symbol: 'XLM/USD' },
    anchors: [
      { key: 'launch', label: 'Network Launch', date: '2014-07-31', primary: true },
    ],
  },
  {
    ticker: 'ZEC', name: 'Zcash', kind: 'crypto', hue: 48, image: 'Zcash',
    px: { symbol: 'ZEC/USD' },
    anchors: [
      { key: 'launch', label: 'Genesis Block', date: '2016-10-28', primary: true },
    ],
  },
];

// Grid sections, in display order. kind is the grouping key.
const STOCKS_GROUPS = [
  { kind: 'stock', label: 'Stocks' },
  { kind: 'futures', label: 'Indices' },
  { kind: 'commodity', label: 'Metals' },
  { kind: 'crypto', label: 'Crypto' },
];

/* ===================== Anchor reads ===================== */

// Same local-midnight parse every other page uses for YYYY-MM-DD input -
// never new Date(iso), which lands the previous evening west of UTC.
function stocksParseDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, (m || 1) - 1, d || 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Year-only anchor: July 1 is just a resolver safely past any possible Lunar
// New Year boundary (always Jan 21 - Feb 20) so the correct animal comes out
// for that calendar year - it is NOT treated as a real date (same rule as
// the MLB franchise year-only fallback in db-core.js).
function stocksYearAnimal(year) {
  return getChineseZodiacYear(new Date(year, 6, 1));
}

// Number meanings in the owner's own system (stated 2026-07-29, 11's
// direction corrected 2026-07-29): 7 = weakness, 8 = strength, 28 =
// expansion, 11 = emotional / sporadic - and leans DOWN, not up ("more
// likely to go down than up"), not a directionless wildcard. All four now
// drive the cycle reads the same way - short for 7 and 11, long for 8 and
// 28. Numbers he hasn't defined stay unflagged rather than guessed at, and
// the number is always shown next to its label so the rule stays
// inspectable on every card.
const STOCKS_NUMBER_MEANINGS = {
  7: { label: 'Weakness', dir: 'bear' },
  8: { label: 'Strength', dir: 'bull' },
  28: { label: 'Expansion', dir: 'bull' },
  11: { label: 'Emotional · Sporadic', dir: 'bear' },
};

/* ===================== Transit signals (financial astrology) ===================== */
// Local copies of astrology.js's angularDiff/ASTRO_ASPECTS - not loaded here,
// since that file is the Astrology page's own DOM controller and wires event
// listeners against elements this page doesn't have. Same 5 aspects, same
// orbs, just the pure math. Requires astro-engine.js (loaded on stocks.html
// before numerology.js) for getAstroBodyInfo.
const STOCKS_ASPECTS = [
  { key: 'conjunction', angle: 0, orb: 6 },
  { key: 'sextile', angle: 60, orb: 4 },
  { key: 'square', angle: 90, orb: 6 },
  { key: 'trine', angle: 120, orb: 6 },
  { key: 'opposition', angle: 180, orb: 6 },
];

function stocksAngularDiff(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Financial-astrology planet-to-timeframe split, by real orbital speed:
// Moon changes sign every ~2.5 days (Day level), Mercury/Venus/Mars run
// weeks-per-sign (Month level), Jupiter/Saturn/Uranus/Neptune/Pluto run
// months-to-years-per-sign (Year level) - the classic Jupiter-Saturn
// business-cycle pair lives here. Mirrors how PY/PM/PD already split by cadence.
const STOCKS_TRANSIT_PLANETS = {
  year: ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'],
  month: ['Mercury', 'Venus', 'Mars'],
  day: ['Moon'],
};

// Trine/sextile to the anchor's natal Sun reads bullish (harmonious flow),
// square/opposition reads bearish (friction) - same "does this help or fight
// the underlying" idea STOCKS_NUMBER_MEANINGS already applies to numbers.
// Conjunction has no fixed direction in astrology (it just merges the
// transiting planet's own nature into the natal point), so it's resolved per
// planet instead: Jupiter/Venus are classical benefics (bull), Saturn/Mars
// are classical malefics and Uranus/Neptune/Pluto are the modern
// crisis/volatility planets financial astrology reads as destabilizing
// (bear). Mercury and Moon have no fixed benefic/malefic charge, so their
// conjunction is left neutral rather than guessed at.
const STOCKS_TRANSIT_ASPECT_DIR = { trine: 'bull', sextile: 'bull', square: 'bear', opposition: 'bear' };
const STOCKS_TRANSIT_CONJUNCTION_DIR = {
  Jupiter: 'bull', Venus: 'bull',
  Saturn: 'bear', Mars: 'bear', Uranus: 'bear', Neptune: 'bear', Pluto: 'bear',
};

// Signal Backtest (2026-08-03) baseline-matched square/sextile at Year
// cadence and both came back backwards or worse than doing nothing: Square's
// "bear" call was less accurate than the base down-rate (21% vs a 24% base
// down-rate), and Sextile's "bull" call underperformed the base up-rate (72%
// vs 76%) - both are flat (harmless) at Day/Month, so only Year is
// neutralized here rather than dropping the aspect everywhere or flipping
// its label on a still-thin edge. Scoped to the LIVE signal path
// (stocksTransitSignalsFor) only - the backtest itself keeps measuring the
// raw, unfiltered picture so this call can keep being checked against real
// data going forward instead of the backtest quietly grading its own filter.
const STOCKS_TRANSIT_YEAR_NEUTRAL_ASPECTS = ['square', 'sextile'];

// One planet's current read against an anchor's natal Sun - null most days,
// for most planets, since an active aspect is the exception not the rule.
// Uses astroEclipticLongitude directly rather than getAstroBodyInfo, since
// only the longitude is needed here - not the extra retrograde lookup
// getAstroBodyInfo does (a second position evaluation a day earlier), which
// would double the ephemeris cost for nothing this function uses.
function stocksTransitSignal(bodyKey, natalSunLon, onDate) {
  const transitLon = astroEclipticLongitude(bodyKey, onDate);
  const diff = stocksAngularDiff(natalSunLon, transitLon);
  const aspect = STOCKS_ASPECTS.find((a) => Math.abs(diff - a.angle) <= a.orb);
  if (!aspect) return null;
  const dir = aspect.key === 'conjunction' ? STOCKS_TRANSIT_CONJUNCTION_DIR[bodyKey] : STOCKS_TRANSIT_ASPECT_DIR[aspect.key];
  // aspect.key added 2026-08-02 for the Transit Backtest's own by-aspect
  // breakdown - existing callers only ever destructured dir/why, so this is
  // purely additive.
  return dir ? { dir, why: `${bodyKey} ${aspect.key} natal Sun`, aspect: aspect.key } : null;
}

// All active transit signals for one anchor at one timeframe, on a given
// date - level picks which planets are even in scope, matching each one's
// real orbital speed to the timeframe it actually represents.
function stocksTransitSignalsFor(anchorDate, level, onDate) {
  const natalSunLon = astroEclipticLongitude('Sun', anchorDate);
  return STOCKS_TRANSIT_PLANETS[level]
    .map((body) => stocksTransitSignal(body, natalSunLon, onDate))
    .filter(Boolean)
    .filter((sig) => !(level === 'year' && STOCKS_TRANSIT_YEAR_NEUTRAL_ASPECTS.includes(sig.aspect)));
}

/* ===================== Transit Backtest (2026-08-02, CODE13 backlog 8/8) =====================
 * Validates the transit-aspect signal above against real historical price
 * moves. Standalone from the Combined Track Record's own persisted ledger
 * (per the user's own call) - reuses the SAME cached daily price history
 * (STOCKS_CYCLES_PX_CACHE_KEY, via stocksFetchSeries) that ledger already
 * warms, rather than a separate fetch, but never touches that ledger's own
 * store or versioning.
 *
 * Grades a plain point-to-point return over a FIXED holding period keyed
 * to each planet's own cadence (Moon=1 trading day, Mercury/Venus/Mars=21,
 * Jupiter through Pluto=252 - the user's own call) - not the path-based
 * Right/Wrong/Mixed grading Calendar/Cal+Price use, since a transit signal
 * fires on an arbitrary day with no cycle-window boundary to grade a path
 * against. Binary right/wrong on whether the return's sign matched the
 * predicted direction - no "mixed" band, since there is no established
 * flat-return threshold for this simpler point-return shape to reuse.
 */
const STOCKS_TRANSIT_HOLD_DAYS = { day: 1, month: 21, year: 252 };

function stocksTransitPlanetLevel(bodyKey) {
  return Object.keys(STOCKS_TRANSIT_PLANETS).find((level) => STOCKS_TRANSIT_PLANETS[level].includes(bodyKey));
}

// Every active transit signal on one date, across all 9 planets - unlike
// stocksTransitSignalsFor (which only checks whichever ONE level's planets
// the live signal display cares about at a time), a backtest needs every
// planet's own independent read on every day.
function stocksTransitAllSignalsOnDate(natalSunLon, onDate) {
  return Object.values(STOCKS_TRANSIT_PLANETS).flat()
    .map((bodyKey) => {
      const signal = stocksTransitSignal(bodyKey, natalSunLon, onDate);
      return signal ? { bodyKey, level: stocksTransitPlanetLevel(bodyKey), ...signal } : null;
    })
    .filter(Boolean);
}

// One anchor's full backtest across its own price history - every bar with
// an active signal, graded against the real return over that planet's own
// fixed holding period. A signal too close to the end of the available
// history (not enough future bars to reach its holding period yet) is
// skipped rather than graded on a truncated window.
function stocksTransitBacktestAnchor(anchorDate, bars) {
  const natalSunLon = astroEclipticLongitude('Sun', anchorDate);
  const trades = [];
  for (let i = 0; i < bars.length; i++) {
    const onDate = stocksParseDate(bars[i][0]);
    stocksTransitAllSignalsOnDate(natalSunLon, onDate).forEach((sig) => {
      const holdDays = STOCKS_TRANSIT_HOLD_DAYS[sig.level];
      const exitIdx = i + holdDays;
      if (exitIdx >= bars.length) return;
      const entryClose = bars[i][4];
      const exitClose = bars[exitIdx][4];
      const returnPct = ((exitClose - entryClose) / entryClose) * 100;
      const predictedUp = sig.dir === 'bull';
      const grade = (returnPct > 0) === predictedUp && returnPct !== 0 ? 'right' : 'wrong';
      trades.push({
        date: bars[i][0], bodyKey: sig.bodyKey, level: sig.level, aspect: sig.aspect, dir: sig.dir,
        returnPct: Math.round(returnPct * 100) / 100, grade,
      });
    });
  }
  return trades;
}

function stocksTransitTally(list) {
  const right = list.filter((t) => t.grade === 'right').length;
  return { n: list.length, right, wrong: list.length - right, rate: list.length ? right / list.length : null };
}

// One anchor's numerology + Vietnamese zodiac signals across its own price
// history, same fixed-hold grading shape as the transit signals above.
// computeEnergyFlow (compat-engine.js) already derives personalYear/Month/
// Day and the Vietnamese clash/ally scores for any given date - this reuses
// it directly rather than re-deriving those numbers.
//
// Unlike transits (rare - an aspect is only in orb some days), a personal
// number and a Vietnamese relation exist on EVERY day, so there's no
// established bull/bear direction to grade "right/wrong" against for most
// of them (STOCKS_NUMBER_MEANINGS only tags 7/8/28/11; the rest are
// unflagged). So this tracks plain up/down instead of right/wrong, bucketed
// by whichever number or clash/ally/neutral band was active - the discovery
// question is "does THIS bucket skew toward up-moves", not "did a
// prediction land". Same {n, right(=up), wrong(=down), rate} shape as
// stocksTransitBaselineForBars, for the same reason: reuses the same row
// renderer even though "right" here just means "up".
function stocksSignalBacktestAnchor(anchorDate, bars) {
  const numerologyTrades = [];
  const vietnameseTrades = [];
  for (let i = 0; i < bars.length; i++) {
    const onDate = stocksParseDate(bars[i][0]);
    const flow = computeEnergyFlow(anchorDate, onDate);
    Object.keys(STOCKS_TRANSIT_HOLD_DAYS).forEach((level) => {
      const holdDays = STOCKS_TRANSIT_HOLD_DAYS[level];
      const exitIdx = i + holdDays;
      if (exitIdx >= bars.length) return;
      const entryClose = bars[i][4];
      const exitClose = bars[exitIdx][4];
      const returnPct = ((exitClose - entryClose) / entryClose) * 100;
      if (returnPct === 0) return;
      const up = returnPct > 0;
      const roundedReturn = Math.round(returnPct * 100) / 100;

      const numKey = level === 'year' ? 'personalYear' : level === 'month' ? 'personalMonth' : 'personalDay';
      numerologyTrades.push({ date: bars[i][0], level, num: flow.numerology[numKey], returnPct: roundedReturn, up });

      const scoreKey = level === 'year' ? 'yearScore' : level === 'month' ? 'monthScore' : 'daySignScore';
      const score = flow.vietnamese[scoreKey];
      const band = score <= 10 ? 'clash' : score >= 85 ? 'ally' : 'neutral';
      vietnameseTrades.push({ date: bars[i][0], level, band, returnPct: roundedReturn, up });
    });
  }
  return { numerologyTrades, vietnameseTrades };
}

function stocksUpTally(list) {
  const up = list.filter((t) => t.up).length;
  return { n: list.length, right: up, wrong: list.length - up, rate: list.length ? up / list.length : null };
}

// Numerology: %up per distinct personal-number value actually observed,
// split by level - the same number (e.g. 8) means a very different holding
// period depending which cycle it's the personal-X of, so a Day-level 8 and
// a Year-level 8 are kept separate rather than pooled. Every number that
// shows up gets its own bucket, not just the 4 STOCKS_NUMBER_MEANINGS
// already tags - the point is to discover whether an untagged number
// carries real edge too.
function stocksNumerologyAggregate(trades) {
  const overall = stocksUpTally(trades);
  const byLevel = {};
  Object.keys(STOCKS_TRANSIT_HOLD_DAYS).forEach((level) => {
    const levelTrades = trades.filter((t) => t.level === level);
    const byNumber = {};
    Array.from(new Set(levelTrades.map((t) => t.num))).sort((a, b) => a - b)
      .forEach((num) => { byNumber[num] = stocksUpTally(levelTrades.filter((t) => t.num === num)); });
    byLevel[level] = { overall: stocksUpTally(levelTrades), byNumber };
  });
  return { overall, byLevel };
}

// Vietnamese zodiac: %up per relation band (clash/neutral/ally, the same
// <=10 / 11-84 / >=85 thresholds stocksAnchorTimeframeSignals already uses
// live), split by level for the same reason numerology is.
const STOCKS_VIETNAMESE_BANDS = ['clash', 'neutral', 'ally'];

function stocksVietnameseAggregate(trades) {
  const overall = stocksUpTally(trades);
  const byLevel = {};
  Object.keys(STOCKS_TRANSIT_HOLD_DAYS).forEach((level) => {
    const levelTrades = trades.filter((t) => t.level === level);
    const byBand = {};
    STOCKS_VIETNAMESE_BANDS.forEach((band) => { byBand[band] = stocksUpTally(levelTrades.filter((t) => t.band === band)); });
    byLevel[level] = { overall: stocksUpTally(levelTrades), byBand };
  });
  return { overall, byLevel };
}

// Flat trade list -> overall / by-aspect-type / by-planet win rates, per
// the user's own "all of them" call on backtest output. byAspectByLevel
// splits each aspect by cadence (day/month/year) too - byAspect alone pools
// e.g. Moon-square (1-day hold) with Saturn-square (252-day hold) into one
// number, which can hide or fake a pattern since the three cadences have
// very different baseline drift (see stocksTransitBaselineForBars). byPlanet
// doesn't need the same split - each planet only ever belongs to one level.
function stocksTransitAggregate(trades) {
  const overall = stocksTransitTally(trades);
  const byAspect = {};
  STOCKS_ASPECTS.forEach((a) => { byAspect[a.key] = stocksTransitTally(trades.filter((t) => t.aspect === a.key)); });
  const byAspectByLevel = {};
  STOCKS_ASPECTS.forEach((a) => {
    byAspectByLevel[a.key] = {};
    Object.keys(STOCKS_TRANSIT_HOLD_DAYS).forEach((level) => {
      byAspectByLevel[a.key][level] = stocksTransitTally(trades.filter((t) => t.aspect === a.key && t.level === level));
    });
  });
  const byPlanet = {};
  Object.values(STOCKS_TRANSIT_PLANETS).flat().forEach((bodyKey) => { byPlanet[bodyKey] = stocksTransitTally(trades.filter((t) => t.bodyKey === bodyKey)); });
  return { overall, byAspect, byAspectByLevel, byPlanet };
}

// Unconditional positive-return rate at each holding cadence, off the exact
// same bars the signal backtest above already fetched - no extra fetches.
// This is the number a win rate has to beat to mean anything: if a given
// aspect/level's "right" rate barely clears this, most of that apparent
// edge is just the instrument's own drift over that hold, not the aspect.
// Shaped like a tally ({n, right, wrong, rate}) so it reuses the same row
// renderer as everything else, even though there's no "prediction" here -
// right/wrong just means up/down.
function stocksTransitBaselineForBars(bars) {
  const out = {};
  Object.keys(STOCKS_TRANSIT_HOLD_DAYS).forEach((level) => {
    const holdDays = STOCKS_TRANSIT_HOLD_DAYS[level];
    let n = 0;
    let up = 0;
    for (let i = 0; i + holdDays < bars.length; i++) {
      const entryClose = bars[i][4];
      const exitClose = bars[i + holdDays][4];
      const returnPct = ((exitClose - entryClose) / entryClose) * 100;
      if (returnPct === 0) continue; // same no-flat-band treatment as the signal grading
      n++;
      if (returnPct > 0) up++;
    }
    out[level] = { n, right: up, wrong: n - up, rate: n ? up / n : null };
  });
  return out;
}

// Pools every instrument's own baseline into one figure per cadence - one
// call per instrument regardless of how many primary anchors it has (an
// instrument with e.g. Company + CEO anchors would otherwise double-count
// the exact same price series into its own baseline).
function stocksTransitBaselineMerge(list) {
  const out = {};
  Object.keys(STOCKS_TRANSIT_HOLD_DAYS).forEach((level) => {
    const n = list.reduce((s, b) => s + b[level].n, 0);
    const right = list.reduce((s, b) => s + b[level].right, 0);
    out[level] = { n, right, wrong: n - right, rate: n ? right / n : null };
  });
  return out;
}

// Runs the backtest across every instrument's primary anchor(s), fetching
// (or reusing the day's already-cached) price history one instrument at a
// time - same throttle as every other price-history loop on this page,
// since Twelve Data's free tier caps at 8 credits/minute.
async function stocksTransitBacktestAll(instruments, onProgress) {
  let allTrades = [];
  let allNumerologyTrades = [];
  let allVietnameseTrades = [];
  const baselines = [];
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const anchors = inst.anchors.filter((a) => a.primary && a.date);
    if (anchors.length) {
      // One bad symbol or a rate-limit hiccup shouldn't block the rest -
      // same doctrine as stocksLoadCombinedRecord/stocksLoadStopLossRecord
      // above, which this function originally missed (the "stuck at 11/16"
      // bug: a single failed fetch was propagating all the way up through
      // stocksRunTransitBacktest with nothing catching it, freezing the
      // progress line and leaving the Run button disabled forever).
      try {
        const wasCached = stocksCyclesCacheHit(inst.px.symbol);
        const bars = await stocksFetchSeries(inst.px.symbol, { outputsize: STOCKS_CYCLES_OUTPUTSIZE, cacheKey: STOCKS_CYCLES_PX_CACHE_KEY });
        baselines.push(stocksTransitBaselineForBars(bars));
        anchors.forEach((a) => {
          const anchorDate = stocksParseDate(a.date);
          allTrades = allTrades.concat(stocksTransitBacktestAnchor(anchorDate, bars));
          const sig = stocksSignalBacktestAnchor(anchorDate, bars);
          allNumerologyTrades = allNumerologyTrades.concat(sig.numerologyTrades);
          allVietnameseTrades = allVietnameseTrades.concat(sig.vietnameseTrades);
        });
        if (!wasCached) await stocksDelay(STOCKS_COMBINED_FETCH_GAP_MS);
      } catch (e) {
        console.error('[Transit Backtest] could not fetch', inst.ticker, e);
      }
    }
    if (onProgress) onProgress(i + 1, instruments.length);
  }
  return {
    ranAt: new Date().toISOString(), instrumentCount: instruments.length,
    ...stocksTransitAggregate(allTrades), baseline: stocksTransitBaselineMerge(baselines),
    numerology: stocksNumerologyAggregate(allNumerologyTrades),
    vietnamese: stocksVietnameseAggregate(allVietnameseTrades),
  };
}

/* ---- Transit Backtest UI - own instruments var, own result cache, both
   deliberately separate from the Combined Track Record above (stocksCombinedInstruments,
   STOCKS_COMBINED_STORE_KEY) per the "standalone" call this feature's own
   clarifying round settled on. ---- */
// v3 (2026-08-03): added baseline + byAspectByLevel + numerology + vietnamese
// - bumped so an older cached result (missing those fields) doesn't render
// broken rows, just prompts a re-run like no result existed yet.
const STOCKS_TRANSIT_RESULT_KEY = 'numerology_stock_transit_backtest_v3';
let stocksTransitCollapsed = true;
let stocksTransitRunning = false;
let stocksTransitInstruments = null;
// Which signal family's breakdown is showing - a view toggle over one
// shared backtest run (all three families are graded in the same pass, off
// the same bars, against the same baseline), same "one run, pick a lens on
// it" idea as the EMAX Distribution chart's dimension toggle.
let stocksTransitActiveFamily = 'astrology';
const STOCKS_TRANSIT_FAMILIES = [
  { key: 'astrology', label: 'Astrology' },
  { key: 'numerology', label: 'Numerology' },
  { key: 'vietnamese', label: 'Vietnamese Zodiac' },
];

function stocksTransitLoadResult() {
  try {
    const raw = localStorage.getItem(STOCKS_TRANSIT_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function stocksTransitSaveResult(result) {
  try { localStorage.setItem(STOCKS_TRANSIT_RESULT_KEY, JSON.stringify(result)); } catch (e) { /* storage full - still shown this session */ }
}

function stocksTransitRateRowHtml(label, tally, sub) {
  const rowCls = sub ? ' sub' : '';
  if (!tally || tally.rate == null) {
    return `
      <div class="stock-combined-record-row${rowCls}">
        <span class="stock-combined-record-label" style="font-weight:400;color:var(--muted);">${escapeHtml(label)}</span>
        <span class="stock-trades-note">no signals</span>
      </div>`;
  }
  const pct = Math.round(tally.rate * 100);
  const cls = pct >= 55 ? 'good' : pct <= 45 ? 'bad' : '';
  return `
    <div class="stock-combined-record-row${rowCls}">
      <span class="stock-combined-record-label"${sub ? ' style="font-weight:400;"' : ''}>${escapeHtml(label)}</span>
      <span class="score-inline ${cls}">${pct}% <span style="font-weight:400;">(${tally.right}/${tally.wrong} of ${tally.n})</span></span>
    </div>`;
}

const STOCKS_TRANSIT_LEVEL_LABELS = { day: 'Day (1d hold)', month: 'Month (21d hold)', year: 'Year (252d hold)' };

function stocksTransitAstrologyBodyHtml(result) {
  const aspectRows = STOCKS_ASPECTS.map((a) => {
    const label = a.key.charAt(0).toUpperCase() + a.key.slice(1);
    const overallRow = stocksTransitRateRowHtml(label, result.byAspect[a.key]);
    const byLevel = result.byAspectByLevel && result.byAspectByLevel[a.key];
    const subRows = byLevel
      ? Object.keys(STOCKS_TRANSIT_LEVEL_LABELS).map((level) => stocksTransitRateRowHtml(STOCKS_TRANSIT_LEVEL_LABELS[level], byLevel[level], true)).join('')
      : '';
    return overallRow + subRows;
  }).join('');
  const planetRows = Object.values(STOCKS_TRANSIT_PLANETS).flat().map((bodyKey) => stocksTransitRateRowHtml(bodyKey, result.byPlanet[bodyKey])).join('');
  return `
    ${stocksTransitRateRowHtml('Overall', result.overall)}
    <div class="stock-combined-record-label" style="margin-top:10px;font-weight:700;">By aspect type (indented rows split by cadence)</div>
    ${aspectRows}
    <div class="stock-combined-record-label" style="margin-top:10px;font-weight:700;">By planet</div>
    ${planetRows}`;
}

// Shared renderer for numerology (bucketField 'byNumber') and Vietnamese
// zodiac (bucketField 'byBand') - both share the same {overall, byLevel:
// {day/month/year: {overall, byNumber|byBand}}} shape from
// stocksNumerologyAggregate/stocksVietnameseAggregate.
function stocksTransitBucketBodyHtml(agg, bucketField, labelFor) {
  const levelSections = Object.keys(STOCKS_TRANSIT_LEVEL_LABELS).map((level) => {
    const levelAgg = agg.byLevel[level];
    const buckets = levelAgg[bucketField];
    const rows = Object.keys(buckets).map((key) => stocksTransitRateRowHtml(labelFor(key), buckets[key], true)).join('');
    return `
      <div class="stock-combined-record-label" style="margin-top:10px;font-weight:700;">${STOCKS_TRANSIT_LEVEL_LABELS[level]}</div>
      ${stocksTransitRateRowHtml('Overall this level', levelAgg.overall)}
      ${rows}`;
  }).join('');
  return `${stocksTransitRateRowHtml('Overall', agg.overall)}${levelSections}`;
}

function stocksTransitFamilyToggleHtml() {
  const buttons = STOCKS_TRANSIT_FAMILIES.map((f) => `<button class="stocks-filter-btn${stocksTransitActiveFamily === f.key ? ' active' : ''}" data-family="${f.key}">${escapeHtml(f.label)}</button>`).join('');
  return `<div class="stocks-filter-seg" id="stockTransitFamilyToggle">${buttons}</div>`;
}

function renderStocksTransitBacktestBody(box, result) {
  const runBtnLabel = result ? 'Re-run Backtest' : 'Run Backtest';
  let bodyHtml;
  if (!result) {
    bodyHtml = `<div class="stock-trades-note">Not run yet - checks every astrology transit, numerology, and Vietnamese zodiac signal already live on this page against real historical price moves. One price fetch per instrument, throttled - takes a while the first time.</div>`;
  } else {
    const baselineRows = result.baseline
      ? Object.keys(STOCKS_TRANSIT_LEVEL_LABELS).map((level) => stocksTransitRateRowHtml(STOCKS_TRANSIT_LEVEL_LABELS[level], result.baseline[level])).join('')
      : '<div class="stock-trades-note">Re-run to compute (added after your last run).</div>';
    let familyBody;
    if (stocksTransitActiveFamily === 'numerology' && result.numerology) {
      familyBody = stocksTransitBucketBodyHtml(result.numerology, 'byNumber', (num) => `Number ${num}`);
    } else if (stocksTransitActiveFamily === 'vietnamese' && result.vietnamese) {
      familyBody = stocksTransitBucketBodyHtml(result.vietnamese, 'byBand', (band) => band.charAt(0).toUpperCase() + band.slice(1));
    } else if (stocksTransitActiveFamily !== 'astrology') {
      familyBody = '<div class="stock-trades-note">Re-run to compute (added after your last run).</div>';
    } else {
      familyBody = stocksTransitAstrologyBodyHtml(result);
    }
    bodyHtml = `
      <div class="stock-trades-note">Scanned ${result.instrumentCount} instruments - last run ${new Date(result.ranAt).toLocaleString()}. Graded on a fixed hold matched to each signal's own cadence (1 trading day for Moon/Personal Day/Day sign, 21 for Mercury-Venus-Mars/Personal Month/Month sign, 252 for Jupiter-through-Pluto/Personal Year/Year sign).</div>
      <div class="stock-combined-record-label" style="margin-top:10px;font-weight:700;">Baseline (no signal, same holds)</div>
      <div class="stock-trades-note">Unconditional % of up-moves at each hold length, same price bars, no signal required. Every rate below only means something if it clears the matching line here.</div>
      ${baselineRows}
      ${stocksTransitFamilyToggleHtml()}
      ${familyBody}`;
  }
  box.innerHTML = `
    <div class="stock-group${stocksTransitCollapsed ? ' collapsed' : ''}" id="stockTransitGroup">
      <div class="stock-group-head">
        <span>🔮 Signal Backtest</span>
        <span class="stock-group-chev">▾</span>
      </div>
      <div class="stock-group-grid">
        ${bodyHtml}
        <button class="btn" id="stockTransitRunBtn" type="button">${runBtnLabel}</button>
        <div class="famous-status" id="stockTransitStatus"></div>
      </div>
    </div>`;
  box.querySelector('.stock-group-head').addEventListener('click', () => {
    stocksTransitCollapsed = !stocksTransitCollapsed;
    box.querySelector('#stockTransitGroup').classList.toggle('collapsed', stocksTransitCollapsed);
  });
  box.querySelector('#stockTransitRunBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    stocksRunTransitBacktest();
  });
  if (result) {
    box.querySelectorAll('#stockTransitFamilyToggle .stocks-filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (stocksTransitActiveFamily === btn.dataset.family) return;
        stocksTransitActiveFamily = btn.dataset.family;
        renderStocksTransitBacktestBody(box, result);
      });
    });
  }
}

async function stocksRunTransitBacktest() {
  if (stocksTransitRunning || !stocksTransitInstruments) return;
  stocksTransitRunning = true;
  const box = document.getElementById('stocksTransitBacktest');
  const btn = document.getElementById('stockTransitRunBtn');
  if (btn) btn.disabled = true;
  // try/finally as a second, outer layer on top of stocksTransitBacktestAll's
  // own per-instrument try/catch - even a total failure (not just one bad
  // symbol) still resets the running flag and re-enables the button,
  // instead of freezing mid-scan forever (the "stuck at 11/16" bug).
  try {
    const result = await stocksTransitBacktestAll(stocksTransitInstruments, (done, total) => {
      const status = document.getElementById('stockTransitStatus');
      if (status) status.textContent = `Scanning ${done}/${total} instruments...`;
    });
    stocksTransitSaveResult(result);
    renderStocksTransitBacktestBody(box, result);
    const statusAfter = document.getElementById('stockTransitStatus');
    if (statusAfter) statusAfter.textContent = `Done - scanned ${result.instrumentCount} instruments.`;
  } catch (e) {
    console.error('[Transit Backtest] failed', e);
    const statusErr = document.getElementById('stockTransitStatus');
    if (statusErr) statusErr.textContent = `Backtest failed: ${e.message || 'unknown error'}. Try again.`;
  } finally {
    stocksTransitRunning = false;
    if (btn) btn.disabled = false;
  }
}

function stocksInitTransitBacktest(instruments) {
  const box = document.getElementById('stocksTransitBacktest');
  if (!box) return;
  stocksTransitInstruments = instruments;
  renderStocksTransitBacktestBody(box, stocksTransitLoadResult());
}

/* ===================== Western Sun-sign compat (Month level) ===================== */
// Natal Sun sign vs today's Sun sign, scored through the same westernCompat/
// WESTERN_TABLE the Compatibility Calculator and Month Outlook already use -
// not a new table. Sun sign changes roughly monthly, so this is a Month-level
// signal, same cadence as Personal Month / Zodiac Month.
function stocksWesternSignal(anchorDate, onDate) {
  const entitySign = getSunSign(anchorDate);
  const daySign = getSunSign(onDate);
  const score = westernCompat(entitySign, daySign);
  if (score <= 10) return { dir: 'bear', why: `${entitySign} clashes ${daySign} (western)` };
  if (score >= 85) return { dir: 'bull', why: `${entitySign} allies ${daySign} (western)` };
  return null;
}

// One anchor -> everything the cards show. relation comes straight off the
// engine's VIETNAMESE_TABLE bands: the six clash pairs score exactly 10
// (enemy year), trine partners 85+ (ally year), everything else neutral.
function stocksAnchorRead(anchor, today, todayAnimal) {
  if (anchor.year != null) {
    const animal = stocksYearAnimal(anchor.year);
    const score = vietnameseCompat(animal, todayAnimal);
    return {
      ...anchor,
      yearOnly: true,
      dateDisplay: `${anchor.year} · year only`,
      animal,
      relation: score <= 10 ? 'enemy' : score >= 85 ? 'ally' : 'neutral',
      lifePath: null,
      lifePathMeaning: null,
      personalYear: null,
      cycle: null,
    };
  }
  const d = stocksParseDate(anchor.date);
  const animal = getChineseZodiacYear(d);
  const score = vietnameseCompat(animal, todayAnimal);
  let personalYear = reduceNumber(personalYearRawForYear(d, getActiveBirthYear(d, today)));
  if (personalYear === 2) personalYear = 11; // no standalone 2 - same doctrine as universalDayNumber
  return {
    ...anchor,
    yearOnly: false,
    dateDisplay: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    animal,
    relation: score <= 10 ? 'enemy' : score >= 85 ? 'ally' : 'neutral',
    lifePath: getLifePath(d),
    // The permanent trait read for the number itself (a Life Path 8 company
    // IS strength in this system), separate from the year's cycle.
    lifePathMeaning: STOCKS_NUMBER_MEANINGS[getLifePathNumeric(d)] || null,
    personalYear,
    cycle: STOCKS_NUMBER_MEANINGS[personalYear] || null,
    // The deep today read - the exact engine behind the profile's Energy
    // Flow box: PY/PM/PD vs Universal Y/M/D (numerologyCompat per level)
    // AND birth year/month/day signs vs today's three signs
    // (vietnameseCompat per level).
    flow: computeEnergyFlow(d, today),
  };
}

// Score bands straight from the app's own clash language (clashTypeForScore
// in db-core.js): under 30 reads as a fundamental clash, 85+ as synergy.
function stocksScoreCls(score) {
  return score <= 29 ? 'bad' : score >= 85 ? 'good' : '';
}

function stocksScoreMark(score) {
  return score <= 10 ? ' · clash' : score >= 85 ? ' · boost' : '';
}

// Color/mark for a Numbers-row chip (PY/PM/PD) - keyed to the number's OWN
// meaning (7/8/28/11, the thing that actually feeds the verdict), NOT the
// numerology compat score against the Universal number. Those are two
// unrelated axes that used to share the same red/green language here, which
// meant an 11 (a bear meaning-number) could render green just because it
// happens to pair well with today's Universal number - misleading, since it
// looked like it agreed with a signal it was actually opposing.
function stocksNumberSignalCls(num) {
  const m = STOCKS_NUMBER_MEANINGS[num];
  if (!m) return '';
  return m.dir === 'bear' ? 'bad' : 'good';
}

// A number with one of the owner's meanings shows it everywhere it appears.
function stocksNumLabel(n) {
  const m = STOCKS_NUMBER_MEANINGS[n];
  return m ? `${n} · ${m.label}` : String(n);
}

// Boom/bust vs steady read for this entity's own Life Path number, independent
// of bull/bear lean - reuses the CUE-sourced research (NUMEROLOGY_RESEARCH.md)
// already powering the Sports Betting Insight tab (LIFE_PATH_VOLATILITY /
// VOLATILITY_BADGES in db-core.js) instead of inventing a stocks-only scale.
// A fixed trait of the anchor's own date - never changes with level or "today".
// Text only, no icon glyph: Stock Cycles' modal is deliberately emoji-free
// (color/weight carries meaning instead), same doctrine as the tier chips.
function stocksVolatilityBadge(date) {
  const key = numerologyLookupKey(getLifePathNumeric(date));
  const tier = LIFE_PATH_VOLATILITY[key];
  return tier ? { tier, label: VOLATILITY_BADGES[tier].label } : null;
}

/* ===================== Year / Month / Day verdicts ===================== */
// Every timeframe (year/month/day) blends four signal families per primary
// anchor: the 7/8/28/11 meaning-number for that timeframe's own personal
// number, the Vietnamese zodiac relation at that timeframe, real planetary
// transits to the anchor's natal Sun (which planets are in scope depends on
// the timeframe - see STOCKS_TRANSIT_PLANETS), and - Month only - western
// Sun-sign compat (stocksWesternSignal). A card's own level then decides how
// the three timeframes' NET signal counts (bulls minus bears) get weighted
// together: 60/30/10, the card's own level takes 60%, and the senior cycle
// (Year > Month > Day) takes the 30% slot whenever it isn't primary. Real
// magnitude competition decides the lean - a strong bull read can outweigh
// a lone bear signal now; there's no fixed bears-always-win precedence.
const STOCKS_LEVEL_NUM_META = {
  year: { numKey: 'personalYear', numName: 'PY', signKey: 'yearScore', mySignKey: 'personalYearSign', nowSignKey: 'universalYearSign', signWord: 'year' },
  month: { numKey: 'personalMonth', numName: 'PM', signKey: 'monthScore', mySignKey: 'personalMonthSign', nowSignKey: 'universalMonthSign', signWord: 'month sign' },
  day: { numKey: 'personalDay', numName: 'PD', signKey: 'daySignScore', mySignKey: 'personalDaySign', nowSignKey: 'universalDaySign', signWord: 'day sign' },
};

// The 60/30/10 cross-level weighting for a card at level `primary` - the
// senior cycle (Year > Month > Day) takes the 30% slot whenever it isn't
// the primary level itself (owner's call: "senior cycle wins ties").
const STOCKS_LEVEL_WEIGHTS = {
  year: { year: 0.6, month: 0.3, day: 0.1 },
  month: { month: 0.6, year: 0.3, day: 0.1 },
  day: { day: 0.6, month: 0.3, year: 0.1 },
};

// One anchor's bulls/bears at one timeframe - numerology meaning-number
// always, real transits at every timeframe (which planets depends on the
// timeframe), western Sun-sign only at Month. Vietnamese zodiac clash/ally
// used to vote here too, but the Signal Backtest (2026-08-03) showed it
// flat against baseline at every cadence (Day 53/53/52, Month 59/60/60,
// Year 73/76/75 for clash/neutral/ally) - pure noise, so it was dropped
// from the vote. The relation itself still shows on the card (see
// stocksCycleBoxHtml) - only its use as a bull/bear signal was removed.
function stocksAnchorTimeframeSignals(read, level, historical, today) {
  if (!read.flow) return { bulls: [], bears: [] };
  const f = read.flow;
  const who = read.person || read.label;
  const meta = STOCKS_LEVEL_NUM_META[level];
  const num = f.numerology[meta.numKey];
  const bulls = [];
  const bears = [];

  const meaning = STOCKS_NUMBER_MEANINGS[num];
  if (meaning && meaning.dir === 'bear') bears.push(`${who} runs a ${meta.numName} ${num} ${meaning.label.toLowerCase()}`);
  if (meaning && meaning.dir === 'bull') bulls.push(`${who} runs a ${meta.numName} ${num} ${meaning.label.toLowerCase()}`);

  const anchorDate = stocksParseDate(read.date);
  if (level === 'month') {
    const western = stocksWesternSignal(anchorDate, today);
    if (western) (western.dir === 'bull' ? bulls : bears).push(`${who}'s ${western.why}`);
  }
  stocksTransitSignalsFor(anchorDate, level, today).forEach((t) => {
    (t.dir === 'bull' ? bulls : bears).push(`${who}'s ${t.why}`);
  });

  if (historical) (historical.dir === 'bear' ? bears : bulls).push(historical.why);
  return { bulls, bears };
}

// Pools every primary anchor's signals at one timeframe into one combined
// {bulls, bears} - anchors are weighted equally for now (an explicit,
// revisitable placeholder pending an answer on Company-vs-CEO weighting).
function stocksTimeframeSignals(reads, level, historical, today) {
  const bulls = [];
  const bears = [];
  reads.filter((r) => r.primary).forEach((r) => {
    const s = stocksAnchorTimeframeSignals(r, level, historical, today);
    bulls.push(...s.bulls);
    bears.push(...s.bears);
  });
  return { bulls, bears };
}

// Conviction tier: how many of the THREE timeframes (year/month/day) agree
// with the winning direction, not just which side won overall. Only 3
// timeframes exist, so this is a much stronger bar than counting raw signal
// instances would be - a timeframe with a net-opposing read (e.g. Month
// sitting on a 7-Weakness while Year leans bullish) always caps the tier at
// Majority, it can never be silently outweighed into an "Unanimous" read.
// Deliberately not called "Strong"/"Weak" - those words already mean
// something specific in this app (7 = Weakness, 8 = Strength) and conviction
// is a different axis.
//   Unanimous - 2+ timeframes agree, nothing opposes.
//   Majority  - 2+ timeframes agree, but at least one opposes too.
//   Solo      - exactly one timeframe is doing all the work.
function stocksTierFor(winningCount, opposingCount) {
  if (winningCount >= 2 && opposingCount === 0) return 'unanimous';
  if (winningCount >= 2) return 'majority';
  return 'solo';
}

// historicalByLevel: {year, month, day}, each either the Day Cycles backtest
// vote for that timeframe (see stocksHistoricalLeanFor) or null/undefined -
// only ever present for ES/NQ, and only once their price history has loaded.
function stocksLevelVerdict(reads, level, historicalByLevel, today) {
  const hist = historicalByLevel || {};
  const byTimeframe = {
    year: stocksTimeframeSignals(reads, 'year', hist.year, today),
    month: stocksTimeframeSignals(reads, 'month', hist.month, today),
    day: stocksTimeframeSignals(reads, 'day', hist.day, today),
  };
  const nets = {
    year: byTimeframe.year.bulls.length - byTimeframe.year.bears.length,
    month: byTimeframe.month.bulls.length - byTimeframe.month.bears.length,
    day: byTimeframe.day.bulls.length - byTimeframe.day.bears.length,
  };
  const weights = STOCKS_LEVEL_WEIGHTS[level];
  const score = weights.year * nets.year + weights.month * nets.month + weights.day * nets.day;

  const allBulls = [...byTimeframe.year.bulls, ...byTimeframe.month.bulls, ...byTimeframe.day.bulls];
  const allBears = [...byTimeframe.year.bears, ...byTimeframe.month.bears, ...byTimeframe.day.bears];

  if (score === 0) return { lean: 'neutral', label: 'Neutral', why: 'no net signal at this level', whyItems: [], whyLead: 'no net signal at this level', signalCount: 0, opposingCount: 0, tier: null, score: 0 };

  const dirSign = score > 0 ? 1 : -1;
  const timeframes = ['year', 'month', 'day'];
  const agreeing = timeframes.filter((tf) => Math.sign(nets[tf]) === dirSign).length;
  const opposing = timeframes.filter((tf) => Math.sign(nets[tf]) === -dirSign).length;
  const tier = stocksTierFor(agreeing, opposing);

  // whyItems: the same reasons, grouped by timeframe instead of run together
  // in one sentence - what the tap-to-expand detail actually renders as a
  // bulleted list. whyLead: just the first reason, for the one-line teaser
  // spots that were never meant to hold the full breakdown.
  const list = dirSign < 0 ? allBears : allBulls;
  const whyItems = timeframes
    .map((tf) => ({ tf, items: dirSign < 0 ? byTimeframe[tf].bears : byTimeframe[tf].bulls }))
    .filter((g) => g.items.length);
  const whyLead = list[0] || (dirSign < 0 ? 'weighted bear signals outweigh bulls' : 'weighted bull signals outweigh bears');

  if (dirSign < 0) return { lean: 'short', label: 'Short Lean', why: allBears.join('; ') || whyLead, whyItems, whyLead, signalCount: allBears.length, opposingCount: allBulls.length, tier, score };
  return { lean: 'long', label: 'Long Lean', why: allBulls.join('; ') || whyLead, whyItems, whyLead, signalCount: allBulls.length, opposingCount: allBears.length, tier, score };
}

// The year-level watch verdict that drives the grid pill - now just the
// year-level card's own blended verdict, reworded for the watchlist. Used to
// be a separate parallel implementation (enemies/weak/allies/strong arrays);
// two computations of "is this instrument's year bullish" quietly drifting
// out of sync was exactly the kind of thing that caused confusing results
// before, so this is now a thin wrapper instead of a second engine.
function stocksVerdict(reads, historicalByLevel, today) {
  const v = stocksLevelVerdict(reads, 'year', historicalByLevel, today);
  if (v.lean === 'short') return { watch: 'short', label: 'High Short Watch', text: `${v.why}.`, tier: v.tier };
  if (v.lean === 'long') return { watch: 'long', label: 'Long Watch', text: `${v.why}.`, tier: v.tier };
  return { watch: 'neutral', label: 'Neutral', text: 'No year-level signals on the primary anchors.', tier: null };
}

// Today's own Day Cycles backtest read, at one resolution - reuses the
// EXACT rows and lean rule (N + margin) the Day Cycles panel itself shows,
// so this vote is never stronger or looser than what that panel would tell
// you if you opened it. cycleStats is the plain object stocksComputeCycles
// returns (or null/undefined before it's loaded - callers just get no vote).
function stocksHistoricalLeanFor(cycleStats, level, today) {
  if (!cycleStats) return null;
  const l = stocksDayCycleLabels(today);
  let row = null;
  if (level === 'day') {
    const comboKey = `${l.universalMonth}|${l.universalDay}`;
    row = cycleStats.day.monthDayRows.find((r) => r.key === comboKey) || null;
  } else if (level === 'month') {
    row = cycleStats.month.universalMonthRows.find((r) => r.key === l.universalMonth) || null;
  } else if (level === 'year') {
    row = cycleStats.year.universalYearRows.find((r) => r.key === getUniversalYear(today)) || null;
  }
  if (!row) return null;
  const lean = stocksCycleLean(row, cycleStats.baseline);
  if (lean.cls !== 'lean-up' && lean.cls !== 'lean-down') return null;
  const dir = lean.cls === 'lean-up' ? 'bull' : 'bear';
  const pct = dir === 'bull' ? row.upPct : row.downPct;
  return { dir, why: `history leans ${dir === 'bull' ? 'up' : 'down'} ${pct}% on ${row.label} (N=${row.n})` };
}

function stocksInstrumentRead(inst, today, todayAnimal, cycleStats) {
  const reads = inst.anchors.map((a) => stocksAnchorRead(a, today, todayAnimal));
  const historicalByLevel = {
    year: stocksHistoricalLeanFor(cycleStats, 'year', today),
    month: stocksHistoricalLeanFor(cycleStats, 'month', today),
    day: stocksHistoricalLeanFor(cycleStats, 'day', today),
  };
  return {
    ...inst,
    reads,
    verdict: stocksVerdict(reads, historicalByLevel, today),
    levels: {
      year: stocksLevelVerdict(reads, 'year', historicalByLevel, today),
      month: stocksLevelVerdict(reads, 'month', historicalByLevel, today),
      day: stocksLevelVerdict(reads, 'day', historicalByLevel, today),
    },
  };
}

/* ===================== CEO portraits (popup only) ===================== */
// Real faces, fetched at runtime from Wikipedia's page-summary API and
// cached in localStorage. The GRID deliberately stays ticker monograms; the
// portrait only appears inside an instrument's own popup (owner's choice).

const STOCKS_PORTRAITS = new Map();
const STOCKS_PORTRAIT_CACHE_KEY = 'numerology_stock_portraits_v1';

function stocksPortraitFor(person) {
  return (person && STOCKS_PORTRAITS.get(person)) || null;
}

async function stocksLoadPortraits() {
  let cached = {};
  try { cached = JSON.parse(localStorage.getItem(STOCKS_PORTRAIT_CACHE_KEY)) || {}; } catch (e) { cached = {}; }
  // CEO faces for stocks, the subject's own page image for everything else
  // (Bitcoin's logo, the Nasdaq logo, gold itself) - one loader, one cache.
  const titles = [...new Set(STOCK_INSTRUMENTS.flatMap((i) => [
    ...i.anchors.filter((a) => a.person).map((a) => a.person),
    ...(i.image ? [i.image] : []),
  ]))];
  await Promise.all(titles.map(async (title) => {
    if (Object.prototype.hasOwnProperty.call(cached, title)) { STOCKS_PORTRAITS.set(title, cached[title]); return; }
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
      if (!res.ok) return; // leave uncached so a later load retries
      const data = await res.json();
      const url = (data.thumbnail && data.thumbnail.source) || null;
      cached[title] = url;
      STOCKS_PORTRAITS.set(title, url);
    } catch (e) { /* offline - monogram fallback stays */ }
  }));
  try { localStorage.setItem(STOCKS_PORTRAIT_CACHE_KEY, JSON.stringify(cached)); } catch (e) { /* storage full - refetch next load */ }
  // If a popup is already open when the photo lands, stamp it in.
  document.querySelectorAll('[data-portrait]').forEach((el) => {
    const url = stocksPortraitFor(el.dataset.portrait);
    if (url) { el.style.backgroundImage = `url('${url}')`; el.classList.add('has-photo'); }
  });
}

/* ===================== Rendering ===================== */

const STOCKS_WATCH_ORDER = { short: 0, caution: 1, long: 2, neutral: 3 };

// Color alone carries enemy/ally - red or green already says it, so the
// chip text stays just the animal name (no "· Enemy Year" repeating what
// the border/fill already shout).
const STOCKS_RELATION_CHIP = {
  enemy: { cls: 'bad' },
  ally: { cls: 'good' },
  neutral: { cls: '' },
};

const STOCKS_CYCLE_CLS = { bear: 'bad', bull: 'good', volatile: 'warn' };

// Grid monogram: always the plain ticker circle. The portrait version only
// exists inside the popup hero - the CEO's face for a stock, the subject's
// own page image (coin logo, exchange logo, the metal) for the rest.
function stocksMonogram(inst, withPortrait) {
  const ceo = inst.anchors.find((a) => a.person);
  const title = withPortrait ? ((ceo && ceo.person) || inst.image || null) : null;
  const url = title ? stocksPortraitFor(title) : null;
  const cls = `stock-monogram${withPortrait ? ' large' : ''}${url ? ' has-photo' : ''}`;
  const style = `--stock-hue:${inst.hue};${url ? `background-image:url('${escapeHtml(url)}');` : ''}`;
  return `<div class="${cls}" style="${style}"${title ? ` data-portrait="${escapeHtml(title)}"` : ''}><span>${escapeHtml(inst.ticker)}</span></div>`;
}

// Conviction badge shown next to a lean/verdict wherever it appears - how
// many signals actually agree, not just which side won (see stocksTierFor).
const STOCKS_TIER_LABEL = { unanimous: 'Unanimous', majority: 'Majority', solo: 'Solo' };
function stocksTierChip(tier) {
  if (!tier) return '';
  return `<span class="stock-tier stock-tier-${tier}">${STOCKS_TIER_LABEL[tier]}</span>`;
}

// Compact lean badge: an arrow + LONG/SHORT/FLAT, used everywhere a
// direction appears (Grid, Modal, Radar, Upcoming) - replaces the old wordy
// "Long Watch"/"High Short Watch"/"Long Lean" labels. The direction + tier
// is the whole story at a glance; the sentence-length reasoning lives behind
// a tap now (see the modal's verdict rows and stocksWireDetailToggles).
const STOCKS_LEAN_WORD = { long: 'LONG', short: 'SHORT', neutral: 'FLAT', caution: 'FLAT' };
const STOCKS_LEAN_ARROW = { long: '▲', short: '▼', neutral: '–', caution: '–' };
function stocksLeanBadge(lean, tier) {
  const cls = lean === 'short' ? 'short' : lean === 'long' ? 'long' : 'neutral';
  return `<span class="stock-lean stock-lean-${cls}"><span class="stock-lean-arrow">${STOCKS_LEAN_ARROW[lean] || '–'}</span>${STOCKS_LEAN_WORD[lean] || 'FLAT'}</span>${stocksTierChip(tier)}`;
}

// Renders a verdict's whyItems (see stocksLevelVerdict) as an actual
// bulleted list, grouped under a small timeframe header - replaces the old
// single semicolon-joined sentence, which read as one run-on wall of text
// once transits/western/cross-level blending gave a level several reasons
// instead of just one or two.
function stocksWhyListHtml(whyItems) {
  if (!whyItems || !whyItems.length) return '<div class="stock-why-empty">No signals fired at this level.</div>';
  return whyItems.map((g) => `
    <div class="stock-why-group">
      <div class="stock-why-group-label">${escapeHtml(g.tf.toUpperCase())}</div>
      <ul class="stock-why-list">${g.items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>`).join('');
}

function stocksAnchorFlagBadges(read) {
  const who = (read.person ? read.person.split(' ').pop() : read.label).toUpperCase();
  const badges = [];
  if (read.relation === 'enemy') badges.push(`<span class="stock-badge bad">${escapeHtml(who)} ${escapeHtml(read.animal.toUpperCase())} · ENEMY YEAR</span>`);
  if (read.relation === 'ally') badges.push(`<span class="stock-badge good">${escapeHtml(who)} ${escapeHtml(read.animal.toUpperCase())} · ALLY YEAR</span>`);
  if (read.cycle) badges.push(`<span class="stock-badge ${STOCKS_CYCLE_CLS[read.cycle.dir]}">${escapeHtml(who)} · PY ${read.personalYear} ${escapeHtml(read.cycle.label.toUpperCase())}</span>`);
  return badges;
}

// Direction/level filter state ("only longs at the month level") and which
// sections are folded shut. Session-scoped on purpose - a filter is a way of
// looking, not a setting.
const stocksFilter = { dir: 'all', level: 'year' };
// Starts with every group closed - a tap opens the one you actually want to
// look at, instead of dumping all 16 instruments open on load.
const stocksCollapsedGroups = new Set(STOCKS_GROUPS.map((g) => g.kind));
let stocksAllInstruments = [];

// Glanceable only: ticker, name, direction, tier. The zodiac/cycle detail
// that used to sit here as a chip row now lives one tap away in the modal -
// the grid's job is "which way, how sure," nothing else.
function stocksCardHtml(inst) {
  return `
    <div class="stock-card stock-card-${inst.verdict.watch}" data-ticker="${escapeHtml(inst.ticker)}">
      ${stocksMonogram(inst, false)}
      <div class="stock-card-title">
        <div class="stock-card-ticker">${escapeHtml(inst.ticker)}</div>
        <div class="stock-card-name">${escapeHtml(inst.name)}</div>
      </div>
      ${stocksLeanBadge(inst.verdict.watch, inst.verdict.tier)}
    </div>`;
}

function renderStocksGrid(instruments) {
  const grid = document.getElementById('stocksGrid');
  const matches = (inst) => stocksFilter.dir === 'all'
    || (inst.levels[stocksFilter.level] && inst.levels[stocksFilter.level].lean === stocksFilter.dir);

  const sections = STOCKS_GROUPS.map((g) => {
    const list = instruments
      .filter((i) => i.kind === g.kind && matches(i))
      .sort((a, b) => STOCKS_WATCH_ORDER[a.verdict.watch] - STOCKS_WATCH_ORDER[b.verdict.watch]);
    // While filtering, an emptied section disappears instead of sitting
    // there as a header over nothing.
    if (!list.length && stocksFilter.dir !== 'all') return '';
    const collapsed = stocksCollapsedGroups.has(g.kind);
    return `
      <div class="stock-group${collapsed ? ' collapsed' : ''}" data-group="${g.kind}">
        <div class="stock-group-head">
          <span>${escapeHtml(g.label)}</span>
          <span class="stock-group-count">${list.length}</span>
          <span class="stock-group-chev">▾</span>
        </div>
        <div class="stock-group-grid">${list.length ? list.map(stocksCardHtml).join('') : '<div class="empty-state">Nothing in this group.</div>'}</div>
      </div>`;
  }).join('');

  grid.innerHTML = sections || '';
  if (stocksFilter.dir !== 'all' && !grid.querySelector('.stock-card')) {
    grid.innerHTML = `<div class="empty-state" style="margin-top:16px;">No ${stocksFilter.dir === 'long' ? 'long' : 'short'} leans at the ${stocksFilter.level} level right now.</div>`;
  }

  grid.querySelectorAll('.stock-card').forEach((card) => {
    card.addEventListener('click', () => {
      const inst = instruments.find((i) => i.ticker === card.dataset.ticker);
      if (inst) openStockModal(inst);
    });
  });
  grid.querySelectorAll('.stock-group-head').forEach((head) => {
    head.addEventListener('click', () => {
      const section = head.parentElement;
      const kind = section.dataset.group;
      if (stocksCollapsedGroups.has(kind)) stocksCollapsedGroups.delete(kind);
      else stocksCollapsedGroups.add(kind);
      section.classList.toggle('collapsed');
    });
  });
}

function stocksSyncFilterButtons() {
  document.querySelectorAll('#stocksDirFilter .stocks-filter-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.dir === stocksFilter.dir);
  });
  document.querySelectorAll('#stocksLevelFilter .stocks-filter-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.level === stocksFilter.level);
  });
  // Level only matters once a direction is chosen.
  document.getElementById('stocksLevelFilter').classList.toggle('muted', stocksFilter.dir === 'all');
}

const STOCKS_CYCLE_LABELS = { year: 'PY', month: 'PM', day: 'PD' };
const STOCKS_CYCLE_FULL_LABELS = { year: 'Personal Year', month: 'Personal Month', day: 'Personal Day' };

// Days until this anchor's own PY/PM number changes, found by asking the
// real engine directly (computeEnergyFlow) at each candidate date rather
// than hand-deriving a rollover formula - getPersonalMonthRaw's day-of-
// month comparison has real edge cases (e.g. a day-31 birth can hold the
// same PM number for ~60 days across a 30-day month), and this way the
// countdown can never disagree with when the number actually changes.
function stocksDaysToNextPersonalValue(anchorDate, atDate, level) {
  const key = level === 'year' ? 'personalYear' : 'personalMonth';
  const current = computeEnergyFlow(anchorDate, atDate).numerology[key];
  for (let i = 1; i <= 400; i++) {
    const d = stocksAddDays(atDate, i);
    if (computeEnergyFlow(anchorDate, d).numerology[key] !== current) return i;
  }
  return null;
}

// One anchor's PY, PM, or PD as its own card, styled like an Anchor card
// (owner's ask) instead of a chip row: big number, meaning label, a
// countdown to the next rollover in place of a birthdate, and the matching
// zodiac animal (Year/Month/Day, not just the birth-year one) colored the
// same clash/boost way the anchor zodiac chip already is - color only, no
// redundant "vs X" text, same minimalism the Anchor cards already use.
// Western compat (Month-cadence) folds into the PM box; transits fold into
// whichever box matches their own timeframe (Moon->PD, Mercury/Venus/
// Mars->PM, Jupiter..Pluto->PY - see STOCKS_TRANSIT_PLANETS).
function stocksCycleBoxHtml(r, level, atDate) {
  const f = r.flow;
  const meta = STOCKS_LEVEL_NUM_META[level];
  const num = f.numerology[meta.numKey];
  const sign = f.vietnamese[meta.mySignKey];
  const signScore = f.vietnamese[meta.signKey];
  const anchorDate = stocksParseDate(r.date);

  // PD has no countdown row at all - it changes every day, so there's
  // nothing to count down to and no date worth stating either.
  const countdown = level === 'day' ? null : (() => {
    const days = stocksDaysToNextPersonalValue(anchorDate, atDate, level);
    return days == null ? '—' : `${days}d to next ${STOCKS_CYCLE_LABELS[level]}`;
  })();

  const western = level === 'month' ? stocksWesternSignal(anchorDate, atDate) : null;
  const transits = stocksTransitSignalsFor(anchorDate, level, atDate);
  const extraChips = [
    ...(western ? [`<span class="stock-chip ${western.dir === 'bull' ? 'good' : 'bad'}">${escapeHtml(western.why)}</span>`] : []),
    ...transits.map((t) => `<span class="stock-chip ${t.dir === 'bull' ? 'good' : 'bad'}">${escapeHtml(t.why)}</span>`),
  ].join('');

  return `
    <div class="stock-anchor-card cycle-box">
      <div class="stock-anchor-label">${STOCKS_CYCLE_LABELS[level]}</div>
      <div class="stock-anchor-number ${stocksNumberSignalCls(num)}">${num}</div>
      <div class="stock-anchor-sub">${STOCKS_CYCLE_FULL_LABELS[level]}${STOCKS_NUMBER_MEANINGS[num] ? ' · ' + escapeHtml(STOCKS_NUMBER_MEANINGS[num].label) : ''}</div>
      ${countdown ? `<div class="stock-anchor-date">${escapeHtml(countdown)}</div>` : ''}
      <div class="stock-anchor-zodiac">
        <span class="stock-chip ${stocksScoreCls(signScore)}">${escapeHtml(sign)}</span>
      </div>
      ${extraChips ? `<div class="stock-cycle-extra">${extraChips}</div>` : ''}
    </div>`;
}

// One anchor's full cycle read: a header (name, volatility, today's overall
// score) over a row of its three PY/PM/PD cards - same layout language the
// Anchors section already established, just one anchor's three cycles
// instead of three different anchors side by side.
function stocksEnergyBlock(r, atDate) {
  const vol = stocksVolatilityBadge(stocksParseDate(r.date));
  return `
    <div class="stock-cycle-group">
      <div class="stock-energy-title">
        <span class="stock-energy-title-main">
          <span>${escapeHtml(r.person || r.label)}</span>
          ${vol ? `<span class="stock-volatility-badge stock-volatility-${vol.tier}" title="This entity's own Life Path risk profile, independent of the bull/bear lean">${escapeHtml(vol.label)}</span>` : ''}
        </span>
        <span class="score-inline ${stocksScoreCls(r.flow.finalScore)}">${r.flow.finalScore}</span>
      </div>
      <div class="stock-anchor-row" style="grid-template-columns:repeat(3,1fr);">
        ${stocksCycleBoxHtml(r, 'year', atDate)}
        ${stocksCycleBoxHtml(r, 'month', atDate)}
        ${stocksCycleBoxHtml(r, 'day', atDate)}
      </div>
    </div>`;
}

// The same per-anchor breakdown "Today's Energies" shows in the main
// modal, just computed as of whatever date actually produced a trade
// card's lean, instead of today. This is the click-to-expand "why" detail
// on replayed trade cards - the tier already counts how many signals
// agreed vs dissented, this shows exactly which ones and what they read.
function stocksTradeDetailBlocks(inst, atDate) {
  const reads = inst.anchors
    .filter((a) => a.primary && a.date)
    .map((a) => ({ ...a, flow: computeEnergyFlow(stocksParseDate(a.date), atDate) }));
  return reads.map((r) => stocksEnergyBlock(r, atDate)).join('');
}

// Which signal an anchor card should shout with, if any - a real
// clash/enemy-year or bear cycle reads louder than an ally/bull cycle, which
// reads louder than a plain neutral card. Drives a top accent border so the
// anchor that actually matters doesn't get lost among the others.
function stocksAnchorTone(r) {
  if (r.relation === 'enemy' || (r.cycle && r.cycle.dir === 'bear')) return 'bad';
  if (r.relation === 'ally' || (r.cycle && r.cycle.dir === 'bull')) return 'good';
  return '';
}

function openStockModal(inst) {
  const overlay = document.getElementById('stockModalOverlay');
  const ceo = inst.reads.find((r) => r.key === 'ceo');
  const headline = ceo ? ceo.person : inst.name;
  const badges = inst.reads.flatMap(stocksAnchorFlagBadges).join('');

  const anchorCards = inst.reads.map((r) => `
    <div class="stock-anchor-card${r.primary ? ' primary' : ''}${stocksAnchorTone(r) ? ' ' + stocksAnchorTone(r) : ''}">
      <div class="stock-anchor-label">${escapeHtml(r.label)}</div>
      <div class="stock-anchor-number">${r.lifePath != null ? escapeHtml(String(r.lifePath)) : escapeHtml(r.animal)}</div>
      <div class="stock-anchor-sub">${r.lifePath != null ? `Life Path${r.lifePathMeaning ? ' · ' + escapeHtml(r.lifePathMeaning.label) : ''}` : 'Zodiac only'}</div>
      <div class="stock-anchor-date">${escapeHtml(r.dateDisplay)}</div>
      <div class="stock-anchor-zodiac">
        <span class="stock-chip ${STOCKS_RELATION_CHIP[r.relation].cls}">${escapeHtml(r.animal)}</span>
      </div>
      ${r.personalYear != null ? `<div class="stock-anchor-py${r.cycle ? ' ' + STOCKS_CYCLE_CLS[r.cycle.dir] : ''}">Personal Year ${r.personalYear}${r.cycle ? ` · ${escapeHtml(r.cycle.label)}` : ''}</div>` : ''}
    </div>`).join('');

  // Three-level verdict: the same rule engine at year, month, and day
  // resolution - the stable year lean plus how this month and this day sit.
  // The sentence-length reasoning is a tap away now (same toggle pattern as
  // the trade cards' "Why"), not printed inline for every level every time.
  // Entry/Peak/TP dates (Year/Month only - a single day has no separate
  // take-profit day) come from the level's ACTIVE cycle window - shown only
  // when the window's own direction agrees with the blended verdict badge
  // above it (they can disagree: the badge blends all three timeframes,
  // the window is this timeframe's own state; showing a short window's
  // entry under a LONG badge would just confuse).
  const today = new Date();
  const levelRows = ['year', 'month', 'day'].map((level) => {
    const v = inst.levels[level];
    if (!v) return '';
    let stats = null;
    if (level !== 'day' && (v.lean === 'short' || v.lean === 'long')) {
      const w = stocksCycleWindow(inst, level, today, { needStart: false, maxAhead: level === 'month' ? 120 : 400 });
      if (w && w.dir === v.lean) stats = stocksHorizonStats(inst, stocksWindowLean(w), stocksWindowFutureDays(w, today));
    }
    return `
      <div class="stock-verdict-row">
        <div class="stock-verdict-top">
          <span class="stock-verdict-term">${level.toUpperCase()}</span>
          ${stocksLeanBadge(v.lean, v.tier)}
        </div>
        ${stats && stats.length ? `<div class="stock-trade-path">${stats.map((s) => `<span>${escapeHtml(s.label)} <b>${escapeHtml(s.value)}</b></span>`).join('')}</div>` : ''}
        <button class="stock-trade-detail-toggle" type="button">Why<span class="stock-trade-detail-chev">▾</span></button>
        <div class="stock-trade-detail" hidden>${stocksWhyListHtml(v.whyItems)}</div>
      </div>`;
  }).join('');

  const flows = inst.reads.filter((r) => r.flow);
  const uni = flows.length ? flows[0].flow : null;
  const uniLine = uni ? `
    <div class="stock-uni-row">
      <span class="stock-chip">UY ${stocksNumLabel(uni.numerology.universalYear)}</span>
      <span class="stock-chip">UM ${stocksNumLabel(uni.numerology.universalMonth)}</span>
      <span class="stock-chip">UD ${escapeHtml(String(uni.numerology.universalDay))}${STOCKS_NUMBER_MEANINGS[Number(uni.numerology.universalDay)] ? ' · ' + escapeHtml(STOCKS_NUMBER_MEANINGS[Number(uni.numerology.universalDay)].label) : ''}</span>
      <span class="stock-chip">${escapeHtml(uni.vietnamese.universalYearSign)} year</span>
      <span class="stock-chip">${escapeHtml(uni.vietnamese.universalMonthSign)} month</span>
      <span class="stock-chip">${escapeHtml(uni.vietnamese.universalDaySign)} day</span>
    </div>` : '';

  document.getElementById('stockModalBody').innerHTML = `
    <div class="stock-modal-hero">
      ${stocksMonogram(inst, true)}
      <div class="stock-modal-headline">${escapeHtml(headline)}</div>
      <div class="stock-modal-subline">${escapeHtml(inst.name)} · ${escapeHtml(inst.ticker)}</div>
      <div class="stock-modal-badges">${stocksLeanBadge(inst.verdict.watch, inst.verdict.tier)}${badges}</div>
      <button class="stock-trades-btn" id="stockTradesBtn">View Trades</button>
      ${inst.kind === 'futures' ? '<button class="stock-trades-btn" id="stockCyclesBtn">Day Cycles</button>' : ''}
    </div>
    <div id="stockTradesPanel"></div>
    ${inst.kind === 'futures' ? '<div id="stockCyclesPanel"></div>' : ''}
    <div class="stock-section-label">Verdict</div>
    <div class="stock-verdict-rows">${levelRows}</div>
    <div class="stock-section-label">Anchors</div>
    <div class="stock-anchor-row" style="grid-template-columns:repeat(${inst.reads.length},1fr);">${anchorCards}</div>
    ${uni ? `<div class="stock-section-label">Today's Energies</div>` : ''}
    ${uniLine}
    ${flows.map((r) => stocksEnergyBlock(r, today)).join('')}`;

  document.getElementById('stockTradesBtn').addEventListener('click', () => renderStockTrades(inst));
  if (inst.kind === 'futures') {
    document.getElementById('stockCyclesBtn').addEventListener('click', () => renderStockDayCycles(inst));
  }
  stocksWireDetailToggles(document.getElementById('stockModalBody'));
  overlay.style.display = 'flex';
}

/* ===================== Trades (real prices) ===================== */
// "What would this system's trades have been, and what did the stock
// actually do" - replayed from real daily prices (Twelve Data, free API key
// pasted once and kept in localStorage; browser-callable, CORS-verified).
// Long-term = the current zodiac-year window under the YEAR lean; medium =
// each of the last three months under that month's own lean (computed
// as-of that month, not today's); short-term = the last completed session
// under its day lean. Every row shows the real entry/exit prices and move.

const STOCKS_TD_KEY = 'numerology_twelvedata_key';
// v2: bars carry the full [date, open, high, low, close] - the high/low are
// what let a single session be judged on its whole range instead of just
// where the last print landed.
const STOCKS_PX_CACHE_KEY = 'numerology_stock_px_v2';

// Which entry mode the Trades panel displays. All three modes are still
// computed on every render (daily bars are day-cached, and the intraday
// fetch only ever runs for the one confirmed day per window), but only one
// is shown at a time so the panel doesn't triple every multi-day window into
// a stack of near-identical cards. Resets to Calendar on page load, same as
// the grid filters below.
const STOCKS_TRADE_MODES = ['Calendar', 'Cal + Price', 'Intraday'];
let stocksTradeMode = 'Calendar';

// Which resolution the Trades panel shows - day/month/year narrows both the
// Upcoming rows and the replayed cards to one horizon so a quick look
// doesn't have to scroll past windows you don't care about right now.
let stocksTradesLevel = 'all';

// Which exit rule the replayed cards use - 'reversal' (default) actually
// exits there; 'end' rides to the window's natural end regardless. Owner's
// call: taking profit as a stat shouldn't force everyone to stop tracking
// the full term, so both are real options, not a hardcoded answer.
let stocksTradesExitMode = 'reversal';

// opts lets a second caller (the Day Cycles backtest below) pull a much
// longer history into its own cache slot without disturbing the Trades
// panel's 260-day window/cache.
async function stocksFetchSeries(symbol, opts) {
  const outputsize = (opts && opts.outputsize) || 260;
  const cacheKey = (opts && opts.cacheKey) || STOCKS_PX_CACHE_KEY;
  const todayISO = new Date().toISOString().slice(0, 10);
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(cacheKey)) || {}; } catch (e) { cache = {}; }
  const hit = cache[symbol];
  if (hit && hit.fetched === todayISO) return hit.bars;

  const key = localStorage.getItem(STOCKS_TD_KEY);
  const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputsize}&apikey=${encodeURIComponent(key)}`);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.values)) {
    throw new Error(data.message || 'price feed unavailable');
  }
  // Twelve Data returns newest first; store oldest-first [date, open, high, low, close].
  const bars = data.values.map((v) => [v.datetime, Number(v.open), Number(v.high), Number(v.low), Number(v.close)]).reverse();
  cache[symbol] = { fetched: todayISO, bars };
  try { localStorage.setItem(cacheKey, JSON.stringify(cache)); } catch (e) { /* cache full - live fetch still worked */ }
  return bars;
}

// v1: one trading day's 15-minute bars [datetime, open, high, low, close].
// A past day's intraday session never changes, so it caches forever; TODAY's
// is never cached since it's still forming.
const STOCKS_INTRADAY_CACHE_KEY = 'numerology_stock_intraday_v1';

async function stocksFetchIntradayBars(symbol, dateISO) {
  const todayISO = new Date().toISOString().slice(0, 10);
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(STOCKS_INTRADAY_CACHE_KEY)) || {}; } catch (e) { cache = {}; }
  const cacheKey = `${symbol}|${dateISO}`;
  if (dateISO !== todayISO && cache[cacheKey]) return cache[cacheKey];

  const key = localStorage.getItem(STOCKS_TD_KEY);
  const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=15min&start_date=${encodeURIComponent(dateISO + ' 00:00:00')}&end_date=${encodeURIComponent(dateISO + ' 23:59:59')}&outputsize=100&apikey=${encodeURIComponent(key)}`);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.values)) {
    throw new Error(data.message || 'intraday feed unavailable');
  }
  const bars = data.values.map((v) => [v.datetime, Number(v.open), Number(v.high), Number(v.low), Number(v.close)]).reverse();
  cache[cacheKey] = bars;
  try { localStorage.setItem(STOCKS_INTRADAY_CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cache full - live fetch still worked */ }
  return bars;
}

// CISD (Change in State of Delivery): track the most recent 15m candle
// AGAINST the trade direction; the trigger fires on the first later candle
// that CLOSES back through that candle's open - a short-term order-flow
// shift in the trade's favor. Our own reading of the ICT concept; if this
// doesn't match how you define it, say so and it gets adjusted.
function stocksCisdIndex(lean, bars) {
  let refOpen = null;
  for (let i = 0; i < bars.length; i++) {
    const o = bars[i][1];
    const c = bars[i][4];
    if (lean.lean === 'long') {
      if (refOpen != null && c > refOpen) return i;
      if (c < o) refOpen = o; // bearish candle - the reference to reclaim
    } else {
      if (refOpen != null && c < refOpen) return i;
      if (c > o) refOpen = o; // bullish candle - the reference to lose
    }
  }
  return -1;
}

// IFVG (Inversion Fair Value Gap): a 3-candle imbalance that price later
// closes through (inverting a bearish gap to support, or a bullish gap to
// resistance), then price wicks back into that same zone and closes beyond
// it again in the trade's favor - the reclaim. Bar shape matches CISD:
// [datetime, open, high, low, close].
function stocksIfvgIndex(lean, bars) {
  const gaps = []; // { top, bottom, dir: 'bull'|'bear', inverted }
  for (let i = 0; i < bars.length; i++) {
    const hi = bars[i][2];
    const lo = bars[i][3];
    const close = bars[i][4];
    for (const g of gaps) {
      if (!g.inverted) continue;
      const touchedZone = lo <= g.top && hi >= g.bottom;
      if (!touchedZone) continue;
      if (lean.lean === 'long' && g.dir === 'bear' && close > g.bottom) return i;
      if (lean.lean === 'short' && g.dir === 'bull' && close < g.top) return i;
    }
    gaps.forEach((g) => {
      if (g.inverted) return;
      if (g.dir === 'bear' && close > g.top) g.inverted = true;
      if (g.dir === 'bull' && close < g.bottom) g.inverted = true;
    });
    if (i >= 2) {
      const c1 = bars[i - 2];
      const c3 = bars[i];
      if (c1[2] < c3[3]) gaps.push({ top: c3[3], bottom: c1[2], dir: 'bull', inverted: false });
      if (c1[3] > c3[2]) gaps.push({ top: c1[3], bottom: c3[2], dir: 'bear', inverted: false });
    }
  }
  return -1;
}

// Whichever of the two fires first within the session - the intraday
// trigger is one precise moment, not two competing ones.
function stocksIntradayTriggerIndex(lean, bars) {
  const ci = stocksCisdIndex(lean, bars);
  const fi = stocksIfvgIndex(lean, bars);
  if (ci < 0 && fi < 0) return { index: -1, which: null };
  if (ci < 0) return { index: fi, which: 'IFVG' };
  if (fi < 0) return { index: ci, which: 'CISD' };
  return ci <= fi ? { index: ci, which: 'CISD' } : { index: fi, which: 'IFVG' };
}

// The lean this system would have given at a past date, at one level -
// computed from the anchors' energy flow AS OF that date, so a month's
// trade uses that month's numbers, not today's.
// Memoized: stocksLeanAt is a pure function of (instrument config, level,
// date) - anchors never change mid-session - and the window/entry scans
// call it repeatedly over overlapping date ranges (real transit/ephemeris
// math per call, not free).
const stocksLeanAtCache = new Map();
function stocksLeanAt(inst, level, atDate) {
  const key = `${inst.ticker}|${level}|${atDate.getFullYear()}-${atDate.getMonth()}-${atDate.getDate()}`;
  const hit = stocksLeanAtCache.get(key);
  if (hit) return hit;
  const reads = inst.anchors
    .filter((a) => a.primary && a.date)
    .map((a) => ({ ...a, primary: true, flow: computeEnergyFlow(stocksParseDate(a.date), atDate) }));
  const result = stocksLevelVerdict(reads, level, null, atDate);
  stocksLeanAtCache.set(key, result);
  return result;
}

// ONE anchor's own day-level lean, independent of every other anchor -
// reuses the exact same bear/bull rule (stocksLevelVerdict), just fed a
// single-anchor list instead of every primary anchor blended together.
// ONE anchor's own day-timeframe read (PD meaning-number, day zodiac sign,
// Moon transit - nothing else), plus its PD meaning direction separately:
// the entry doctrine requires an agreeing PD meaning-number specifically
// (owner's rule - zodiac/Moon only deepen the stack, never trigger alone),
// and the exit doctrine requires an OPPOSITE PD meaning-number.
const stocksAnchorDayCache = new Map();
function stocksAnchorDayLeanAt(anchor, atDate) {
  const key = `${anchor.date}|${atDate.getFullYear()}-${atDate.getMonth()}-${atDate.getDate()}`;
  const hit = stocksAnchorDayCache.get(key);
  if (hit) return hit;
  const read = { ...anchor, primary: true, flow: computeEnergyFlow(stocksParseDate(anchor.date), atDate) };
  const s = stocksTimeframeSignals([read], 'day', null, atDate);
  const net = s.bulls.length - s.bears.length;
  const pdMeaning = STOCKS_NUMBER_MEANINGS[read.flow.numerology.personalDay];
  const result = {
    lean: net > 0 ? 'long' : net < 0 ? 'short' : 'neutral',
    net,
    pdDir: pdMeaning ? pdMeaning.dir : null,
    bullCount: s.bulls.length,
    bearCount: s.bears.length,
  };
  stocksAnchorDayCache.set(key, result);
  return result;
}

// The pooled TIMEFRAME-OWN net for one instrument at one date, at any of
// the three timeframes - only that timeframe's signals (e.g. month = PM
// meaning-number + Vietnamese month relation + western sun-sign +
// Mercury/Venus/Mars aspects), no cross-level blending. This is what
// cycle windows are built from: the net can only change on real cycle
// boundaries (an anchor's own PM/PY rollover day, the zodiac month/year
// flip, a sun-sign season change, an aspect entering/leaving orb), so runs
// of constant sign ARE the anchor-cycle windows the owner described - and
// two instruments only share a boundary when their cycles genuinely align.
const stocksTfNetCache = new Map();
function stocksTfNetAt(inst, level, atDate) {
  const key = `${inst.ticker}|${level}|${atDate.getFullYear()}-${atDate.getMonth()}-${atDate.getDate()}`;
  const hit = stocksTfNetCache.get(key);
  if (hit) return hit;
  const reads = inst.anchors
    .filter((a) => a.primary && a.date)
    .map((a) => ({ ...a, primary: true, flow: computeEnergyFlow(stocksParseDate(a.date), atDate) }));
  const s = stocksTimeframeSignals(reads, level, null, atDate);
  const net = s.bulls.length - s.bears.length;
  const result = { net, bulls: s.bulls, bears: s.bears };
  stocksTfNetCache.set(key, result);
  return result;
}

// Kept as the day-level wrapper (harness + day-card call sites use it).
function stocksDayTimeframeLeanAt(inst, atDate) {
  const s = stocksTfNetAt(inst, 'day', atDate);
  return { lean: s.net > 0 ? 'long' : s.net < 0 ? 'short' : 'neutral', net: s.net };
}

/* ===================== Cycle-anchored windows ===================== */
// A window is a maximal run of consecutive calendar days where a level's
// timeframe-own net keeps the same nonzero sign - e.g. a PM 7 month opens
// a bear window on the anchor's own rollover day and closes when the next
// cycle event flips or clears the net (net magnitude decides conflicted
// stretches, same rule as the verdict engine). This replaces every
// "calendar month"/"zodiac year" window in the app: those boundaries have
// nothing to do with when any anchor's actual cycles roll over.

function stocksAddDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// The window ACTIVE on fromDate, or the next one to open (scanning ahead) -
// { dir, start, end, endsOpen, why } or null if nothing directional within
// maxAhead. needStart=false skips the backward scan (the Radar only needs
// direction + remaining days; the replay label wants the true start).
function stocksCycleWindow(inst, level, fromDate, opts) {
  const maxAhead = (opts && opts.maxAhead) || 400;
  const needStart = !opts || opts.needStart !== false;
  let day = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  let sign = Math.sign(stocksTfNetAt(inst, level, day).net);
  let ahead = 0;
  while (sign === 0 && ahead < maxAhead) {
    day = stocksAddDays(day, 1);
    ahead++;
    sign = Math.sign(stocksTfNetAt(inst, level, day).net);
  }
  if (sign === 0) return null;

  let start = new Date(day);
  if (needStart) {
    for (let back = 0; back < 400; back++) {
      const prev = stocksAddDays(start, -1);
      if (Math.sign(stocksTfNetAt(inst, level, prev).net) !== sign) break;
      start = prev;
    }
  }
  let end = new Date(day);
  let endsOpen = true; // still running past the scan horizon
  for (let fwd = 0; fwd < maxAhead; fwd++) {
    const next = stocksAddDays(end, 1);
    if (Math.sign(stocksTfNetAt(inst, level, next).net) !== sign) { endsOpen = false; break; }
    end = next;
  }
  const at = stocksTfNetAt(inst, level, day);
  return {
    dir: sign > 0 ? 'long' : 'short',
    start, end, endsOpen,
    why: sign > 0 ? at.bulls : at.bears,
  };
}

// The most recent COMPLETED windows at a level, newest first - walks
// backward from yesterday, skipping the still-open window containing today
// (open trades are never graded as settled) and any neutral gaps between
// runs. maxBackDays bounds the walk; count bounds how many windows come back.
function stocksRecentCompletedWindows(inst, level, today, count, maxBackDays) {
  const wins = [];
  let cursor = stocksAddDays(today, -1);
  let guard = 0;
  const todaySign = Math.sign(stocksTfNetAt(inst, level, today).net);
  if (todaySign !== 0) {
    while (guard < maxBackDays && Math.sign(stocksTfNetAt(inst, level, cursor).net) === todaySign) {
      cursor = stocksAddDays(cursor, -1);
      guard++;
    }
  }
  while (wins.length < count && guard < maxBackDays) {
    while (guard < maxBackDays && Math.sign(stocksTfNetAt(inst, level, cursor).net) === 0) {
      cursor = stocksAddDays(cursor, -1);
      guard++;
    }
    if (guard >= maxBackDays) break;
    const sign = Math.sign(stocksTfNetAt(inst, level, cursor).net);
    const end = new Date(cursor);
    while (guard < maxBackDays && Math.sign(stocksTfNetAt(inst, level, cursor).net) === sign) {
      cursor = stocksAddDays(cursor, -1);
      guard++;
    }
    const start = stocksAddDays(cursor, 1);
    const at = stocksTfNetAt(inst, level, start);
    wins.push({ dir: sign > 0 ? 'long' : 'short', start, end, endsOpen: false, why: sign > 0 ? at.bulls : at.bears });
  }
  return wins;
}

// A lean-shaped object for a window, so the existing trade-card renderers
// (which want lean.lean/whyLead/signalCount/tier) can grade a window trade
// without a parallel card pipeline. tier is null on purpose: conviction
// tiers measure cross-timeframe agreement, and a window is by definition a
// single timeframe's own state.
function stocksWindowLean(w) {
  return {
    lean: w.dir,
    label: w.dir === 'short' ? 'Short Lean' : 'Long Lean',
    why: w.why.join('; '),
    whyLead: w.why[0] || (w.dir === 'short' ? 'bear window' : 'bull window'),
    whyItems: [],
    signalCount: w.why.length,
    opposingCount: 0,
    tier: null,
  };
}

/* ===================== Stacked PD entry ===================== */
// The entry trigger inside a directional window (owner's doctrine): the
// day must carry an agreeing PD meaning-number for SOME primary anchor -
// mandatory, a day zodiac clash or Moon aspect alone never triggers. Among
// qualifying days, the DEEPEST stack wins (a PD 7 landing on an enemy
// zodiac day outranks an earlier lone PD 11); ties go to the earliest.
// Returns { date, anchor, depth } or null - the anchor is the trigger
// anchor the exit rule then tracks.
function stocksStackedEntry(inst, dir, dates) {
  const anchors = inst.anchors.filter((a) => a.primary && a.date);
  const wantPd = dir === 'long' ? 'bull' : 'bear';
  let best = null;
  dates.forEach((date) => {
    anchors.forEach((anchor) => {
      const r = stocksAnchorDayLeanAt(anchor, date);
      if (r.pdDir !== wantPd) return;
      const depth = dir === 'long' ? r.bullCount : r.bearCount;
      if (!best || depth > best.depth) best = { date, anchor, depth };
    });
  });
  return best;
}

// Which primary anchor is actually responsible for an entry day - the one
// whose agreeing PD meaning-number (deepest stack on ties) fired there.
// This is "the pair" the exit rule then tracks on its own, instead of the
// blended verdict (which can flip because some OTHER anchor or zodiac
// reading changed, not the one that actually triggered).
function stocksTriggeringAnchor(inst, lean, date) {
  const pick = stocksStackedEntry(inst, lean.lean, [date]);
  return pick ? pick.anchor : null;
}

// Entry timing (owner's idea): instead of blindly entering at the window's
// first session, enter where the SYSTEM's signal peaks - the window's
// weakest energy day for a short, strongest for a long, measured as the
// primary anchors' average energy-flow score on each session date. This is
// NOT hindsight: energies are pure calendar math (no prices involved), so
// the peak day was knowable before the window ever opened.
// The one signal both entry pickers share: the primary anchors' average
// energy on a date, flipped so "bigger = better entry" for either side
// (deepest weakness for a short, peak strength for a long).
function stocksSignalScoreAt(inst, lean, date) {
  const anchorDates = inst.anchors.filter((a) => a.primary && a.date).map((a) => stocksParseDate(a.date));
  if (!anchorDates.length) return null;
  const avg = anchorDates.reduce((s, ad) => s + computeEnergyFlow(ad, date).finalScore, 0) / anchorDates.length;
  return lean.lean === 'short' ? -avg : avg;
}

// Entry trigger, two-timeframe style (the global-extreme rule failed in the
// obvious way: NVDA's weakest June day landed on Jun 29, turning a "month
// trade" into a two-session stub with no runway). The window sets the BIAS;
// the first session whose own DAY-level lean agrees pulls the trigger. If no
// day in the window ever confirms, there is no trade - the system said the
// month was weak but never gave a daily go-signal, and that's an honest
// no-fill, not a forced one. Still pure calendar math, knowable in advance.
function stocksConfirmedEntryIndex(inst, lean, bars) {
  const dates = bars.map((b) => stocksParseDate(b[0]));
  const pick = stocksStackedEntry(inst, lean.lean, dates);
  return pick ? dates.findIndex((d) => d.getTime() === pick.date.getTime()) : -1;
}

// Calendar + price mode: the energy confirmation says when to START
// LOOKING, then the tape has to agree - the first session at/after the
// energy trigger that CLOSES in the trade's direction (red close for a
// short, green for a long) confirms, and the entry is the NEXT session's
// open. Stricter and later than calendar-only (you give up the confirming
// day's move), but it never trades a lean the price never validated.
// Returns the ENTRY bar index, or -1 when price never agreed in time.
function stocksPriceConfirmedEntryIndex(inst, lean, bars) {
  const ci = stocksConfirmedEntryIndex(inst, lean, bars);
  if (ci < 0) return -1;
  for (let i = ci; i < bars.length - 1; i++) { // needs a next session to enter at
    const agrees = lean.lean === 'short' ? bars[i][4] < bars[i][1] : bars[i][4] > bars[i][1];
    if (agrees) return i + 1;
  }
  return -1;
}

// The window's peak-signal day (deepest weakness for a short, peak strength
// for a long) - no longer the entry, but the pressure point the trade rides
// toward; shown on the card and a natural exit target.
function stocksPeakBarIndex(inst, lean, bars) {
  let bestI = 0;
  let best = null;
  bars.forEach((b, i) => {
    const signal = stocksSignalScoreAt(inst, lean, stocksParseDate(b[0]));
    if (signal != null && (best == null || signal > best)) { best = signal; bestI = i; }
  });
  return bestI;
}

// Peak-signal calendar day over a list of FUTURE dates - same math as the
// replay entries, pointed forward. Legit because energies are pure date
// math: tomorrow's weakness is as computable as last month's.
function stocksPeakDay(inst, lean, dates) {
  let bestD = null;
  let best = null;
  dates.forEach((d) => {
    const signal = stocksSignalScoreAt(inst, lean, d);
    if (signal != null && (best == null || signal > best)) { best = signal; bestD = d; }
  });
  return bestD;
}

// The actual exit: hold from entry until the SAME anchor that triggered
// entry has its OWN day-lean flip to the OPPOSITE direction - or the
// window's natural end if that never fires. Deliberately scoped to that
// one anchor rather than the blended day-lean: a Personal Day number steps
// by about 1 most days (entering on a 7 very often means the very next
// calendar day reads 8 - just the digit counting up, not a real shift), so
// stocksAnchorReversalDay also requires at least a 2-day gap before it'll
// count anything as a genuine reversal. A take-profit day the system never
// actually acted on is just a look-back stat; this is what turns it into a
// real exit, so "held"/"peak"/"worst"/"take profit" all get graded over
// what actually happened, not an arbitrary month/year boundary ridden past
// the good exit.
// exitMode: 'reversal' (default) actually exits there; 'end' rides to the
// window's natural end regardless - owner's ask, since "take profit" as a
// stat shouldn't force-stop the calculation for everyone who'd rather see
// the full term played out. Both are real, comparable options, not a
// right answer/wrong answer - hence the toggle instead of picking one.
function stocksApplyExitRule(inst, lean, entryBars, wasOpen, triggerAnchor, exitMode) {
  if (entryBars.length <= 1 || exitMode === 'end') return { bars: entryBars, stillOpen: !!wasOpen, exitDate: null };
  const afterDate = stocksParseDate(entryBars[0][0]);
  const laterDates = entryBars.slice(1).map((b) => stocksParseDate(b[0]));
  const reversal = triggerAnchor
    ? stocksAnchorReversalDay(triggerAnchor, lean, afterDate, laterDates)
    : stocksReversalDay(inst, lean, afterDate, laterDates); // safety net - shouldn't normally happen, entry always has a triggering anchor
  if (!reversal) return { bars: entryBars, stillOpen: !!wasOpen, exitDate: null };
  const exitIdx = entryBars.findIndex((b) => stocksParseDate(b[0]).getTime() === reversal.getTime());
  return { bars: entryBars.slice(0, exitIdx + 1), stillOpen: false, exitDate: reversal };
}

// One trade, one card, told from the TRADE's point of view - and graded on
// the WHOLE PATH, not just the endpoints. Endpoint grading is path-blind: a
// short that was in profit all month gets called wrong because of one
// last-session rebound. So a multi-day call is graded by how much of its
// window the trade spent in profit vs the entry (60%+ of days = RIGHT, 40%
// or less = WRONG, in between = MIXED), and every card also shows the best
// exit the window offered and what holding to the end actually returned -
// the endpoint number stays as a fact, it just no longer gets to be the
// judge. A one-session call has no path, so it stays a plain WIN/LOSS.
// Multi-day windows route through here: pick the system's entry day first,
// then actually exit at the first energy-reversal day (stocksApplyExitRule)
// instead of riding blind to the window's end - a take-profit day the
// system never acted on was just a look-back stat, not a real exit.
// Neutral/sporadic windows fall straight through untimed.
// Every directional multi-day window produces THREE entry-mode cards, so
// their records can be compared on identical windows: 'Calendar' (enter at
// the first energy-confirming day's open), 'Cal + Price' (energy trigger,
// then the first agreeing close, entry next open), and 'Intraday' (same
// energy-confirmed day as Calendar, but zoomed into that day's 15m chart for
// a precise CISD/IFVG trigger instead of blindly buying the open).
async function stocksTimedTrades(inst, label, lean, bars, opts) {
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long') || bars.length <= 1) {
    return [stocksTradeCard(label, lean, bars, null, opts)];
  }
  const fmtD = (iso) => stocksParseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); // for real Date objects, not ISO strings (e.g. exit.exitDate)
  const fmtT = (iso) => iso.slice(11, 16);
  const fmtPx = (x) => (x >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(2));
  const noFill = (mode, why) => ({
    html: `
      <div class="stock-trade-card skip">
        <div class="stock-trade-top">
          <span class="stock-trade-window">${escapeHtml(label)}</span>
          <span class="stock-trade-chips"><span class="stock-chip">${escapeHtml(mode)}</span><span class="stock-chip">No fill</span></span>
        </div>
        <div class="stock-trade-story">${escapeHtml(lean.whyLead)}${lean.signalCount > 1 ? ` +${lean.signalCount - 1} more` : ''}. ${escapeHtml(why)}</div>
      </div>`,
    grade: null,
    mode,
    nofill: true,
  });

  const cards = [];
  const pi = stocksPeakBarIndex(inst, lean, bars);
  const peakStat = { label: 'Peak', value: fmtD(bars[pi][0]) };
  // Click-to-expand detail, built once - same for all three modes since
  // they share this window's own lean/date, just different entry timing.
  const detailHtml = opts && opts.atDate ? stocksTradeDetailBlocks(inst, opts.atDate) : null;

  // Mode 1: calendar only.
  const ei = stocksConfirmedEntryIndex(inst, lean, bars);
  // Whichever anchor's own day-signal actually confirmed entry - the exit
  // rule tracks this SAME anchor going forward, not every anchor blended.
  const triggerAnchor = ei >= 0 ? stocksTriggeringAnchor(inst, lean, stocksParseDate(bars[ei][0])) : null;
  if (ei < 0) {
    cards.push(noFill('Calendar', `The ${lean.lean} lean never got a daily energy confirmation - no trade taken.`));
  } else {
    const exit = stocksApplyExitRule(inst, lean, bars.slice(ei), opts && opts.open, triggerAnchor, opts && opts.exitMode);
    const stats = [
      { label: 'Entry', value: fmtD(bars[ei][0]) },
      ...(exit.exitDate ? [{ label: 'Exit', value: fmtDate(exit.exitDate) }] : []),
      peakStat,
    ];
    cards.push({ ...stocksTradeCard(label, lean, exit.bars, stats, { ...opts, mode: 'Calendar', open: exit.stillOpen }, detailHtml), mode: 'Calendar' });
  }

  // Mode 2: calendar + price.
  const pei = stocksPriceConfirmedEntryIndex(inst, lean, bars);
  if (pei < 0) {
    cards.push(noFill('Cal + Price', ei < 0
      ? 'No energy confirmation, so price was never consulted - no trade taken.'
      : `Price never closed ${lean.lean === 'short' ? 'red' : 'green'} after the energy trigger - no trade taken.`));
  } else {
    const exit = stocksApplyExitRule(inst, lean, bars.slice(pei), opts && opts.open, triggerAnchor, opts && opts.exitMode);
    const stats = [
      { label: 'Trigger', value: fmtD(bars[ei][0]) },
      { label: 'Confirmed', value: fmtD(bars[pei - 1][0]) },
      { label: 'Entry', value: fmtD(bars[pei][0]) },
      ...(exit.exitDate ? [{ label: 'Exit', value: fmtDate(exit.exitDate) }] : []),
      peakStat,
    ];
    cards.push({ ...stocksTradeCard(label, lean, exit.bars, stats, { ...opts, mode: 'Cal + Price', open: exit.stillOpen }, detailHtml), mode: 'Cal + Price' });
  }

  // Mode 3: intraday (CISD/IFVG). Needs a day to zoom into, so it rides the
  // SAME confirmed day Calendar mode found - fetching 15m bars for every day
  // in a multi-month window isn't feasible on a free API tier, but one day's
  // worth is cheap and this is the day the system actually said to act on.
  if (ei < 0) {
    cards.push(noFill('Intraday', 'No energy confirmation, so there was no day to zoom into intraday.'));
  } else {
    const dayISO = bars[ei][0];
    let ibars = null;
    let fetchErr = null;
    try { ibars = await stocksFetchIntradayBars(inst.px.symbol, dayISO); } catch (err) { fetchErr = err; }
    if (fetchErr) {
      cards.push(noFill('Intraday', `15m data for ${fmtD(dayISO)} unavailable - ${fetchErr.message || 'feed error'}.`));
    } else if (!ibars || ibars.length < 3) {
      cards.push(noFill('Intraday', `No 15m session data for ${fmtD(dayISO)} - no trade taken.`));
    } else {
      const { index: ti, which } = stocksIntradayTriggerIndex(lean, ibars);
      if (ti < 0 || ti >= ibars.length - 1) {
        cards.push(noFill('Intraday', `Neither a 15m CISD nor an IFVG confirmed on ${fmtD(dayISO)} - no trade taken.`));
      } else {
        const entryBar = ibars[ti + 1];
        const rest = ibars.slice(ti + 1);
        const remHigh = Math.max(...rest.map((b) => b[2]));
        const remLow = Math.min(...rest.map((b) => b[3]));
        const dayClose = ibars[ibars.length - 1][4];
        const windowBars = [[dayISO, entryBar[1], remHigh, remLow, dayClose], ...bars.slice(ei + 1)];
        const exit = stocksApplyExitRule(inst, lean, windowBars, opts && opts.open, triggerAnchor, opts && opts.exitMode);
        const stats = [
          { label: 'Trigger', value: fmtD(dayISO) },
          { label: which, value: fmtT(ibars[ti][0]) },
          { label: 'Entry', value: `${fmtT(entryBar[0])} @ ${fmtPx(entryBar[1])}` },
          ...(exit.exitDate ? [{ label: 'Exit', value: fmtDate(exit.exitDate) }] : []),
          peakStat,
        ];
        cards.push({ ...stocksTradeCard(label, lean, exit.bars, stats, { ...opts, mode: 'Intraday', open: exit.stillOpen }, detailHtml), mode: 'Intraday' });
      }
    }
  }

  return cards;
}

function stocksTradeCard(windowLabel, lean, windowBars, entryStats, opts, detailHtml) {
  if (!lean || lean.lean === 'neutral' || lean.lean === 'caution') {
    return {
      html: `
      <div class="stock-trade-card skip">
        <div class="stock-trade-top">
          <span class="stock-trade-window">${escapeHtml(windowLabel)}</span>
          <span class="stock-chip">No trade</span>
        </div>
        <div class="stock-trade-story">${lean && lean.lean === 'caution' ? 'Sporadic energy - the system stands aside.' : 'No signals - nothing to act on.'}</div>
      </div>`,
      grade: null,
    };
  }
  const bars = windowBars || [];
  if (!bars.length) {
    return {
      html: `
      <div class="stock-trade-card skip">
        <div class="stock-trade-top">
          <span class="stock-trade-window">${escapeHtml(windowLabel)}</span>
          <span class="stock-chip">${lean.lean === 'short' ? 'Short' : 'Long'}</span>
        </div>
        <div class="stock-trade-story">No price data for this window.</div>
      </div>`,
      grade: null,
    };
  }

  // Bars are [date, open, high, low, close]. Time-in-profit reads the
  // session closes; the best exit reads the true extremes (a short's best
  // exit is the lowest LOW, not the lowest close).
  const entry = bars[0][1];
  const exit = bars[bars.length - 1][4];
  const fav = (px) => (lean.lean === 'short' ? ((entry - px) / entry) * 100 : ((px - entry) / entry) * 100);
  const closes = bars.map((b) => ({ d: b[0], f: fav(b[4]) }));
  const held = closes[closes.length - 1].f;
  const extremes = bars.map((b) => ({ d: b[0], f: fav(lean.lean === 'short' ? b[3] : b[2]) }));
  const best = extremes.reduce((m, x) => (x.f > m.f ? x : m));
  // The friendliest CLOSE is the realistic take-profit: an exit you could
  // actually have taken at a session's end, unlike the intraday wick above.
  const bestClose = closes.reduce((m, x) => (x.f > m.f ? x : m));
  // The other side of the path: the worst the trade was ever against you,
  // measured on the adverse extremes (a short's pain is the highest HIGH).
  const adverse = bars.map((b) => ({ d: b[0], f: fav(lean.lean === 'short' ? b[2] : b[3]) }));
  const worst = adverse.reduce((m, x) => (x.f < m.f ? x : m));
  const inProfit = closes.filter((x) => x.f > 0).length / closes.length;

  const movePct = ((exit - entry) / entry) * 100;
  const flat = Math.abs(movePct) < 0.05;
  const fmt = (x) => (x >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(2));
  const singleDay = bars.length === 1;
  const isOpen = !!(opts && opts.open);

  let grade;
  let badge;
  if (singleDay) {
    // One session, judged on its whole range: WIN if it closed in profit,
    // WRONG only if it NEVER traded in profit (the favorable extreme stayed
    // at or under entry), MIXED when the range offered profit but the close
    // took it back - the "down all day, spiked at the bell" case.
    if (held > 0) { grade = 'right'; badge = 'WIN'; }
    else if (best.f <= 0) { grade = 'wrong'; badge = flat ? 'FLAT' : 'LOSS'; }
    else { grade = 'mixed'; badge = 'MIXED'; }
  } else if (inProfit >= 0.6) {
    grade = 'right';
    badge = 'RIGHT';
  } else if (inProfit <= 0.4) {
    grade = 'wrong';
    badge = 'WRONG';
  } else {
    grade = 'mixed';
    badge = 'MIXED';
  }
  const cardCls = grade === 'right' ? 'win' : grade === 'wrong' ? 'loss' : 'mixed';
  const badgeCls = grade === 'right' ? 'good' : grade === 'wrong' ? 'bad' : 'warn';
  // A window still running is a position, not a verdict - it reads AHEAD or
  // BEHIND so far, and the record line counts it as open, never as settled.
  if (isOpen) {
    badge = `${grade === 'right' ? 'AHEAD' : grade === 'wrong' ? 'BEHIND' : 'MIXED'} SO FAR`;
    grade = 'open';
  }

  const pathRow = singleDay ? `
        <div class="stock-trade-path">
          <span>ranged ${fmt(Math.min(bars[0][3], entry))} – ${fmt(bars[0][2])}</span>
          <span>best exit <span class="score-inline ${best.f > 0 ? 'good' : 'bad'}">${best.f > 0 ? '+' : ''}${best.f.toFixed(1)}%</span> intraday</span>
        </div>` : `
        <div class="stock-trade-path">
          <span>in profit ${Math.round(inProfit * 100)}% of days${isOpen ? ' so far' : ''}</span>
          <span>take profit <span class="score-inline ${bestClose.f > 0 ? 'good' : 'bad'}">${bestClose.f > 0 ? '+' : ''}${bestClose.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(bestClose.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>
          <span>peak <span class="score-inline ${best.f > 0 ? 'good' : 'bad'}">${best.f > 0 ? '+' : ''}${best.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(best.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>
          <span>worst <span class="score-inline ${worst.f < 0 ? 'bad' : 'good'}">${worst.f > 0 ? '+' : ''}${worst.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(worst.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>
        </div>`;

  // Entry/trigger/confirm/peak as labeled fragments instead of a run-on
  // sentence - same treatment as the Upcoming rows: the direction is
  // already the chip above, the reasoning is its own line below, this is
  // just the dates.
  const entryStatsRow = (entryStats && entryStats.length)
    ? `<div class="stock-trade-path">${entryStats.map((s) => `<span>${escapeHtml(s.label)} <b>${escapeHtml(s.value)}</b></span>`).join('')}</div>`
    : '';
  // Click-to-expand detail: the full per-anchor breakdown behind the "why"
  // sentence - which signals agreed, which dissented (the tier already
  // counts them, this shows exactly what they read).
  const detailSection = detailHtml ? `
        <button class="stock-trade-detail-toggle" type="button">Why<span class="stock-trade-detail-chev">▾</span></button>
        <div class="stock-trade-detail" hidden>${detailHtml}</div>` : '';

  return {
    html: `
      <div class="stock-trade-card ${cardCls}">
        <div class="stock-trade-top">
          <span class="stock-trade-window">${escapeHtml(windowLabel)}</span>
          <span class="stock-trade-chips">
            ${opts && opts.mode ? `<span class="stock-chip">${escapeHtml(opts.mode)}</span>` : ''}
            <span class="stock-chip">${lean.lean === 'short' ? 'Short' : 'Long'}</span>
            ${stocksTierChip(lean.tier)}
            <span class="stock-badge ${badgeCls}">${badge}</span>
          </span>
        </div>
        <div class="stock-trade-story">${escapeHtml(lean.whyLead)}${lean.signalCount > 1 ? ` +${lean.signalCount - 1} more${detailHtml ? ' (see Why)' : ''}` : ''}.</div>${entryStatsRow}
        <div class="stock-trade-nums">
          <span>${fmt(entry)} → ${fmt(exit)}</span>
          <span class="score-inline ${held > 0 ? 'good' : 'bad'}">${isOpen ? 'running' : 'held to end'} ${held > 0 ? '+' : ''}${held.toFixed(1)}%</span>
        </div>${pathRow}${detailSection}
      </div>`,
    grade,
    // Realized (held-to-end) and best-case (peak) % returns, plus the worst
    // adverse excursion - the actual size data expectancy/drawdown tracking
    // needs, not just the grade string. Favorable-oriented (positive = good
    // for either a long or a short), same as every number on this card.
    held,
    peak: best.f,
    worst: worst.f,
  };
}

// The take-profit day, forward-pointed: the first date after entry whose
// own day-level lean flips to the OPPOSITE direction (not just "no longer
// agrees" - a real reversal). Same calendar-only math as the entry trigger,
// so it's just as knowable in advance; bounded to the same date list the
// window already searched, never reaching past it.
function stocksReversalDay(inst, lean, afterDate, dates) {
  const opposite = lean.lean === 'short' ? 'long' : 'short';
  return dates.find((d) => d > afterDate && stocksDayTimeframeLeanAt(inst, d).lean === opposite) || null;
}

// Same idea, scoped to ONE anchor instead of every primary anchor blended
// together - and requiring at least a 2-calendar-day gap from entry, since
// a Personal Day number steps by about 1 most days (a 7 is very often
// followed by an 8 the very next calendar day purely from the digit
// counting up, not any real shift). Used for both the actual replay exit
// (stocksApplyExitRule) and the Upcoming section's forward-looking "TP"
// day, so the preview and the real exit use the same rule.
function stocksAnchorReversalDay(anchor, lean, afterDate, dates) {
  // PD-mandatory, mirroring the entry doctrine: the exit day must carry an
  // OPPOSITE PD meaning-number for the trigger anchor (entered on a 7-day,
  // exits on that anchor's own 8/28-day) - a zodiac/Moon flip alone doesn't
  // close the trade, same as it can't open one.
  const oppositePd = lean.lean === 'short' ? 'bull' : 'bear';
  const minGapMs = 2 * 24 * 60 * 60 * 1000;
  return dates.find((d) => (d - afterDate) >= minGapMs && stocksAnchorDayLeanAt(anchor, d).pdDir === oppositePd) || null;
}

// All calendar days of a window that are strictly after `after` (the entry
// search never looks backward from today on forward surfaces) AND inside
// the window itself - a not-yet-open window contributes nothing before its
// own start day.
function stocksWindowFutureDays(w, after) {
  const days = [];
  let d = stocksAddDays(after, 1);
  if (d < w.start) d = new Date(w.start);
  for (; d <= w.end; d = stocksAddDays(d, 1)) days.push(new Date(d));
  return days;
}

// Entry/Peak/TP preview for one directional window - pure calendar math,
// no prices. Shared by the Upcoming rows and the Verdict section's level
// rows, so "when would this actually enter/exit" reads the same wherever
// it's shown. Entry is the stacked PD-mandatory pick; TP is the trigger
// anchor's first opposite PD (the exact replay exit rule, pointed forward).
// "No fill"/"Held to end" are real results said explicitly, not omissions:
// a window whose remaining days never carry an agreeing PD has no entry,
// and an entry with no later opposite-PD day inside the window just rides
// to the window's own end.
function stocksHorizonStats(inst, lean, days) {
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long')) return null;
  const fmtD = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const pick = stocksStackedEntry(inst, lean.lean, days);
  if (!pick) return [{ label: 'Entry', value: 'No fill' }];
  const peak = stocksPeakDay(inst, lean, days);
  const reversal = stocksAnchorReversalDay(pick.anchor, lean, pick.date, days);
  return [
    { label: 'Entry', value: fmtD(pick.date) },
    ...(peak ? [{ label: 'Peak', value: fmtD(peak) }] : []),
    { label: 'TP', value: reversal ? fmtD(reversal) : 'Held to end' },
  ];
}

// Returns rows tagged with a level so the Trades panel filter can narrow to
// just one horizon.
function stocksUpcomingRows(inst) {
  const today = new Date();
  const fmtD = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const rows = [];

  const pill = (lean) => stocksLeanBadge(lean.lean, lean.tier);
  // Compact label:value pairs instead of a prose sentence - the pill above
  // already says the direction and why (hover/inspect the Anchors section
  // for the reasoning), so this row is just the dates that matter.
  const row = (label, lean, stats) => `
    <div class="stock-trade-card upcoming">
      <div class="stock-trade-top">
        <span class="stock-trade-window">${escapeHtml(label)}</span>
        <span class="stock-trade-chips">${pill(lean)}</span>
      </div>
      ${stats && stats.length ? `<div class="stock-trade-path">${stats.map((s) => `<span>${escapeHtml(s.label)} <b>${escapeHtml(s.value)}</b></span>`).join('')}</div>` : ''}
    </div>`;

  // Tomorrow, at day resolution - a single session has no separate take
  // profit day, it lives and dies on that day's own range.
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  rows.push({ level: 'day', html: row(`Tomorrow · ${fmtD(tomorrow)}`, stocksLeanAt(inst, 'day', tomorrow), null) });

  // Month and Year: the active-or-next cycle window for that timeframe -
  // its boundaries ARE the anchors' own PM/PY rollovers, zodiac flips,
  // season changes, and aspect onsets, so the label says exactly which
  // real span this trade lives in. Entry/Peak/TP inside it via the stacked
  // PD rule (stocksHorizonStats).
  ['month', 'year'].forEach((level) => {
    const w = stocksCycleWindow(inst, level, tomorrow, { maxAhead: level === 'month' ? 120 : 400 });
    if (!w) {
      rows.push({ level, html: row(`No ${level} window ahead`, { lean: 'neutral', tier: null }, null) });
      return;
    }
    const wLean = stocksWindowLean(w);
    const label = `${level === 'month' ? 'Month' : 'Year'} window · ${fmtD(w.start)} – ${w.endsOpen ? 'open' : fmtD(w.end)}`;
    rows.push({ level, html: row(label, wLean, stocksHorizonStats(inst, wLean, stocksWindowFutureDays(w, today))) });
  });

  return rows;
}

// One instrument's SINGLE soonest opportunity across day/month/year - the
// building block behind the main-page radar. Pure calendar math (same
// trigger definition as the Upcoming rows), so it's cheap enough to run for
// all 16 instruments on every page load, no price fetch needed. Returns
// null when nothing's directional on any horizon right now.
// levelFilter (optional): 'day'|'month'|'year' to only build/return that
// one level's candidate instead of the soonest across all three - lets the
// Radar toggle show just one horizon instead of Day always winning "soonest"
// (tomorrow is always sooner than any Month/Year trigger, which drowned out
// the other two levels entirely before the toggle existed).
function stocksNextOpportunity(inst, today, levelFilter) {
  const candidates = [];
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  // Day dropped from the Radar entirely (owner's call) - Month/Year only.
  ['month', 'year'].forEach((level) => {
    if (levelFilter && levelFilter !== level) return;
    // needStart:false - the Radar only needs the entry date within the
    // remaining window, not the (possibly long-past) window start.
    const w = stocksCycleWindow(inst, level, tomorrow, { needStart: false, maxAhead: level === 'month' ? 120 : 400 });
    if (!w) return;
    const wLean = stocksWindowLean(w);
    const pick = stocksStackedEntry(inst, w.dir, stocksWindowFutureDays(w, today));
    if (pick) candidates.push({ level, date: pick.date, lean: { ...wLean, signalCount: pick.depth } });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.date - b.date);
  return candidates[0];
}

// Which single horizon the Radar shows - Day dropped entirely (owner's
// call, too noisy/near-term to be useful here); 'all' picks each
// instrument's soonest of Month/Year, or narrow to just one.
let stocksRadarLevel = 'all';

function stocksRadarLevelFilterHtml() {
  const opt = (level, label) => `<button class="stocks-filter-btn${stocksRadarLevel === level ? ' active' : ''}" data-level="${level}">${label}</button>`;
  return `<div class="stocks-filter-seg" id="stockRadarLevelFilter">${opt('all', 'All')}${opt('month', 'Month')}${opt('year', 'Year')}</div>`;
}

// Ranks every instrument by its soonest opportunity at the selected horizon
// - one glance across the whole watchlist instead of opening each modal and
// toggling through its panels one at a time.
function stocksRadarHtml(instruments, today) {
  const fmtD = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const levelFilter = stocksRadarLevel === 'all' ? undefined : stocksRadarLevel;
  const ranked = instruments
    .map((inst) => ({ inst, opp: stocksNextOpportunity(inst, today, levelFilter) }))
    .filter((x) => x.opp)
    .sort((a, b) => a.opp.date - b.opp.date || b.opp.lean.signalCount - a.opp.lean.signalCount)
    .slice(0, 8);
  const rows = ranked.length ? ranked.map(({ inst, opp }) => `
    <div class="stock-radar-row" data-ticker="${escapeHtml(inst.ticker)}">
      <span class="stock-radar-ticker">${escapeHtml(inst.ticker)}</span>
      <span class="stock-radar-lean">${stocksLeanBadge(opp.lean.lean, opp.lean.tier)}</span>
      <span class="stock-radar-when">${escapeHtml(opp.level.toUpperCase())} · ${escapeHtml(fmtD(opp.date))}</span>
    </div>`).join('') : `<div class="stock-trades-note">No directional signals on the horizon right now.</div>`;
  return stocksRadarLevelFilterHtml() + rows;
}

// Renders + wires the Radar box in one call, so the level-filter toggle can
// just call this again on click instead of duplicating the wiring.
function stocksRenderRadar(instruments, today) {
  const box = document.getElementById('stocksRadar');
  box.innerHTML = stocksRadarHtml(instruments, today);
  box.querySelectorAll('.stock-radar-row').forEach((row) => {
    row.addEventListener('click', () => {
      const inst = stocksAllInstruments.find((i) => i.ticker === row.dataset.ticker);
      if (inst) openStockModal(inst);
    });
  });
  box.querySelectorAll('#stockRadarLevelFilter .stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (stocksRadarLevel === btn.dataset.level) return;
      stocksRadarLevel = btn.dataset.level;
      stocksRenderRadar(instruments, today);
    });
  });
}

function stocksTradesLevelFilterHtml() {
  const opt = (level, label) => `<button class="stocks-filter-btn${stocksTradesLevel === level ? ' active' : ''}" data-level="${level}">${label}</button>`;
  return `
    <div class="stocks-filter-seg" id="stockTradesLevelFilter">
      ${opt('all', 'All')}${opt('day', 'Day')}${opt('month', 'Month')}${opt('year', 'Year')}
    </div>`;
}

function stocksWireTradesLevelFilter(inst) {
  const el = document.getElementById('stockTradesLevelFilter');
  if (!el) return;
  el.querySelectorAll('.stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (stocksTradesLevel === btn.dataset.level) return;
      stocksTradesLevel = btn.dataset.level;
      renderStockTrades(inst);
    });
  });
}

// Click a "Why" toggle to expand/collapse its detail - pure show/hide, no
// re-render needed since the detail HTML is already built into the card.
// Shared by the Trades panel's per-card detail AND the modal's verdict rows,
// so tap-to-expand behaves identically everywhere it appears on the page.
function stocksWireDetailToggles(container) {
  if (!container) return;
  container.querySelectorAll('.stock-trade-detail-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const detail = btn.nextElementSibling;
      if (!detail) return;
      const opening = detail.hasAttribute('hidden');
      if (opening) detail.removeAttribute('hidden'); else detail.setAttribute('hidden', '');
      const chev = btn.querySelector('.stock-trade-detail-chev');
      if (chev) chev.textContent = opening ? '▴' : '▾';
    });
  });
}

async function renderStockTrades(inst) {
  const panel = document.getElementById('stockTradesPanel');
  const levelFilter = stocksTradesLevelFilterHtml();
  const upcomingRows = stocksUpcomingRows(inst).filter((r) => stocksTradesLevel === 'all' || r.level === stocksTradesLevel);
  const upcoming = `
    <div class="stock-trades-box">
      <div class="stock-trades-note">Upcoming entries - pure calendar math, computed in advance, no prices involved.</div>
      ${upcomingRows.map((r) => r.html).join('')}
    </div>`;
  const key = localStorage.getItem(STOCKS_TD_KEY);
  if (!key) {
    panel.innerHTML = `${levelFilter}${upcoming}
      <div class="stock-trades-box">
        <div class="stock-trades-note">Replayed trades need live prices - a free Twelve Data API key (twelvedata.com, free tier), pasted once, kept only on this device.</div>
        <div class="stock-trades-keyrow">
          <input type="text" id="stockTdKeyInput" placeholder="Paste API key" autocomplete="off">
          <button id="stockTdKeySave">Save</button>
        </div>
      </div>`;
    document.getElementById('stockTdKeySave').addEventListener('click', () => {
      const v = document.getElementById('stockTdKeyInput').value.trim();
      if (!v) return;
      localStorage.setItem(STOCKS_TD_KEY, v);
      renderStockTrades(inst);
    });
    stocksWireTradesLevelFilter(inst);
    return;
  }

  panel.innerHTML = `${levelFilter}${upcoming}<div class="stock-trades-box"><div class="stock-trades-note">Loading ${escapeHtml(inst.px.symbol)} prices…</div></div>`;
  let bars;
  try {
    bars = await stocksFetchSeries(inst.px.symbol);
  } catch (err) {
    panel.innerHTML = `${levelFilter}${upcoming}
      <div class="stock-trades-box">
        <div class="stock-trades-note bad">Price feed error: ${escapeHtml(err.message || 'unknown')}.</div>
        <div class="stock-trades-keyrow"><button id="stockTdKeyReset">Change API key</button></div>
      </div>`;
    document.getElementById('stockTdKeyReset').addEventListener('click', () => {
      localStorage.removeItem(STOCKS_TD_KEY);
      renderStockTrades(inst);
    });
    stocksWireTradesLevelFilter(inst);
    return;
  }

  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cards = [];

  // Short-term: the last completed session under its own day lean.
  const doneBars = bars.filter((b) => b[0] < todayISO);
  const lastBar = doneBars[doneBars.length - 1];
  if (lastBar) {
    const dayDate = stocksParseDate(lastBar[0]);
    const dayLean = stocksLeanAt(inst, 'day', dayDate);
    const dayLabel = dayDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    cards.push({ ...stocksTradeCard(dayLabel, dayLean, [lastBar], null, null, stocksTradeDetailBlocks(inst, dayDate)), level: 'day' });
  }

  // Medium: the last three COMPLETED month-timeframe cycle windows - each
  // one's boundaries are the anchors' own PM rollovers / zodiac flips /
  // season changes / aspect onsets, not calendar months (which have nothing
  // to do with when any anchor's cycles actually change).
  const fmtWD = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const monthWindows = stocksRecentCompletedWindows(inst, 'month', today, 3, 240);
  for (const w of monthWindows) {
    const startISO = stocksDateToISO(w.start);
    const endISO = stocksDateToISO(w.end);
    const wBars = bars.filter((b) => b[0] >= startISO && b[0] <= endISO);
    const label = `Month window · ${fmtWD(w.start)} – ${fmtWD(w.end)}`;
    cards.push(...(await stocksTimedTrades(inst, label, stocksWindowLean(w), wBars, { exitMode: stocksTradesExitMode, atDate: w.start })).map((c) => ({ ...c, level: 'month' })));
  }

  // Long-term: the ACTIVE year-timeframe window, replayed from its own
  // start - an OPEN position, shown as ahead/behind so far, never graded
  // as settled. No active window is a real state, said plainly.
  const yw = stocksCycleWindow(inst, 'year', today, { maxAhead: 400 });
  if (yw && yw.start <= today) {
    const ywStartISO = stocksDateToISO(yw.start);
    const yearBars = bars.filter((b) => b[0] >= ywStartISO);
    cards.push(...(await stocksTimedTrades(inst, `Year window · since ${fmtWD(yw.start)}`, stocksWindowLean(yw), yearBars, { open: true, exitMode: stocksTradesExitMode, atDate: today })).map((c) => ({ ...c, level: 'year' })));
  } else {
    cards.push({ ...stocksTradeCard('Year window', null, [], null, null), level: 'year' });
  }

  // Record over the calls that actually traded - stated up front so the
  // reader never has to count for themselves. All three modes are computed
  // on every render so the toggle below is instant, but only the active
  // mode's record and cards are shown. The lone Day card has no mode and
  // counts under Calendar, same as it always has. The level filter narrows
  // this the same way it narrows the cards below - the record always
  // matches what's shown.
  const modeLine = (modeLabel, list) => {
    const settled = list.filter((c) => c.grade != null && c.grade !== 'open');
    const openCount = list.filter((c) => c.grade === 'open').length;
    const nofills = list.filter((c) => c.nofill).length;
    if (!settled.length && !openCount && !nofills) return '';
    const right = settled.filter((c) => c.grade === 'right').length;
    const wrong = settled.filter((c) => c.grade === 'wrong').length;
    const mixed = settled.filter((c) => c.grade === 'mixed').length;
    const cls = right > wrong ? 'good' : wrong > right ? 'bad' : '';
    return `<div class="stock-trades-summary">${escapeHtml(modeLabel)}: <span class="score-inline ${cls}">${right} right · ${wrong} wrong${mixed ? ` · ${mixed} mixed` : ''}</span>${openCount ? ` · ${openCount} open` : ''}${nofills ? ` · ${nofills} no-fill` : ''}</div>`;
  };
  const levelCards = cards.filter((c) => stocksTradesLevel === 'all' || c.level === stocksTradesLevel);
  const visibleCards = levelCards.filter((c) => !c.mode || c.mode === stocksTradeMode);
  const modeCards = (mode) => levelCards.filter((c) => (mode === 'Calendar' ? (!c.mode || c.mode === 'Calendar') : c.mode === mode));
  const summary = modeLine(stocksTradeMode, modeCards(stocksTradeMode))
    || `<div class="stock-trades-summary">No tradeable calls in these windows.</div>`;
  const modeToggle = `
    <div class="stocks-filter-seg" id="stockTradeModeToggle">
      ${STOCKS_TRADE_MODES.map((m) => `<button class="stocks-filter-btn${stocksTradeMode === m ? ' active' : ''}" data-mode="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')}
    </div>`;
  const exitToggle = `
    <div class="stocks-filter-seg" id="stockTradesExitFilter">
      <button class="stocks-filter-btn${stocksTradesExitMode === 'reversal' ? ' active' : ''}" data-exit="reversal">Reversal</button>
      <button class="stocks-filter-btn${stocksTradesExitMode === 'end' ? ' active' : ''}" data-exit="end">Full Term</button>
    </div>`;

  panel.innerHTML = `${levelFilter}${upcoming}
    <div class="stock-trades-box">
      <div class="stock-trades-note">Replayed on real ${escapeHtml(inst.px.symbol)} prices${inst.px.note ? ` (${escapeHtml(inst.px.note)})` : ''}. Exit: ${stocksTradesExitMode === 'end' ? 'holds to the window’s end' : 'exits at the reversal signal'}.</div>
      ${modeToggle}
      ${exitToggle}
      ${summary}
      ${visibleCards.map((c) => c.html).join('')}
    </div>`;

  document.querySelectorAll('#stockTradeModeToggle .stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (stocksTradeMode === btn.dataset.mode) return;
      stocksTradeMode = btn.dataset.mode;
      renderStockTrades(inst);
    });
  });
  document.querySelectorAll('#stockTradesExitFilter .stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (stocksTradesExitMode === btn.dataset.exit) return;
      stocksTradesExitMode = btn.dataset.exit;
      renderStockTrades(inst);
    });
  });
  stocksWireTradesLevelFilter(inst);
  stocksWireDetailToggles(document.getElementById('stockTradesPanel'));
}

/* ===================== Day Cycles (calendar seasonality backtest) =====
 * ES and NQ only (the two 'futures' instruments) - the owner's specific ask:
 * does the CALENDAR ITSELF, independent of any birth chart, lean the tape
 * up, down, or sideways? Three resolutions, toggled in the panel:
 *   DAY   - Universal Day (compatLifePathInfo lookupValue - the life-path-
 *           style pool of the date's own digits, reusing the owner's own
 *           number meanings 7/8/28/11), Calendar Day (1-31), Calendar Day
 *           Reduced, Chinese Zodiac Day (the repeating 12-day animal
 *           cycle) - plus a Universal Month x Universal Day cross-tab.
 *   MONTH - Universal Month (calendar-only), Vietnamese Zodiac Month (the
 *           calendar's own month-animal, also calendar-only), and Personal
 *           Month per PRIMARY anchor (needs a birth/launch date - this one
 *           IS anchor-relative, same Personal Month cell used everywhere
 *           else in the app, just walked across real price history).
 *   YEAR  - same split: Universal Year and Vietnamese Zodiac Year
 *           (calendar-only) alongside Personal Year per primary anchor.
 * Every session in the fetched history is scored open-to-close (that
 * session's own range, same definition used in the Trades panel - not
 * day-over-day momentum) and sorted into whichever bucket is showing.
 * HONEST SCOPE, same as the header of this file: raw historical frequency
 * over one price history, no fitted weights, and testing this many buckets
 * at once means some of them clear the "lean" bar by chance alone - every
 * table shows its own N so that's checkable, never hidden. */

const STOCKS_CYCLES_PX_CACHE_KEY = 'numerology_stock_px_cycles_v1';
const STOCKS_CYCLES_OUTPUTSIZE = 5000; // as much daily history as one Twelve Data call returns

// A session's close lands within this band of its own open -> read as
// Consolidate (no clear resolution either way) rather than forced into
// Up or Down. Same spirit as the existing "flat" dead zone in stocksTradeCard.
const STOCKS_CYCLE_FLAT_PCT = 0.15;
// Fewer historical hits than this and a bucket's read is noise, not a lean -
// shown in the table (never hidden), just never tagged.
const STOCKS_CYCLE_MIN_N = 8;
// A bucket needs to beat the baseline by this many percentage points (on
// whichever of up/down/consolidate is its best case) to earn a lean tag.
const STOCKS_CYCLE_LEAN_MARGIN = 10;

// No 2: same doctrine as universalDayNumber (db-core.js) - a standalone 2
// doesn't exist in this system, it's an 11. The only place lookupValue can
// be 2 is the 20th-of-month quirk in compatLifePathInfo, which is folded
// into the 11 bucket below rather than kept as its own row.
const STOCKS_CYCLE_UNIVERSAL_DAY_ORDER = [1, 3, 4, 5, 6, 7, 8, 9, 11, 22, 28, 33];
const STOCKS_CYCLE_CAL_DAY_REDUCED_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22];

function stocksClassifyOutcome(pctChange) {
  if (pctChange > STOCKS_CYCLE_FLAT_PCT) return 'up';
  if (pctChange < -STOCKS_CYCLE_FLAT_PCT) return 'down';
  return 'consolidate';
}

// One date -> all four bucket keys at once, straight off numerology.js /
// compat-engine.js - nothing here is a new numerology rule, just a new lens
// pointed at each of them.
function stocksDayCycleLabels(date) {
  const u = compatLifePathInfo(date);
  return {
    calendarDay: getRawDay(date),
    calendarDayReduced: getReducedDay(date),
    universalDay: u.lookupValue === 2 ? 11 : u.lookupValue,
    universalMonth: getUniversalMonth(date),
    zodiacDay: getChineseDaySign(date),
  };
}

function stocksNewCycleBucket() {
  return { n: 0, up: 0, down: 0, consolidate: 0, sumPct: 0 };
}

function stocksBumpCycleBucket(map, key, outcome, pct) {
  if (!map.has(key)) map.set(key, stocksNewCycleBucket());
  const b = map.get(key);
  b.n++;
  b[outcome]++;
  b.sumPct += pct;
}

function stocksFinalizeCycleBucket(key, label, b) {
  return {
    key,
    label,
    n: b.n,
    upPct: b.n ? Math.round((b.up / b.n) * 100) : 0,
    downPct: b.n ? Math.round((b.down / b.n) * 100) : 0,
    consolidatePct: b.n ? Math.round((b.consolidate / b.n) * 100) : 0,
    avgPct: b.n ? b.sumPct / b.n : 0,
  };
}

// Every session gets classified once (open-to-close, its own range - no
// prior-day reference needed, so every fetched bar counts) and dropped into
// every bucket at every resolution in the same pass - one fetch, one walk
// over the bars. inst is needed here (unlike the old day-only version) because Personal
// Month/Year are anchor-relative: each primary anchor with a real date
// (ES's Index Anchor + Contract Launch; NQ's Nasdaq Born + Contract
// Launch) gets its own Personal Month and Personal Year read on every
// session date, via the exact same getPersonalMonthRaw/getPersonalYearRaw
// cells the rest of the app already uses - just walked across history
// instead of evaluated once for today.
function stocksComputeCycles(inst, bars) {
  const calendarDay = new Map();
  const calendarDayReduced = new Map();
  const universalDay = new Map();
  const zodiacDay = new Map();
  const monthDay = new Map(); // key `${universalMonth}|${universalDay}`
  const universalMonth = new Map();
  const zodiacMonth = new Map();
  const universalYear = new Map();
  const zodiacYear = new Map();
  const overall = stocksNewCycleBucket();

  const anchors = inst.anchors.filter((a) => a.primary && a.date);
  const personalMonthMaps = anchors.map(() => new Map());
  const personalYearMaps = anchors.map(() => new Map());

  for (let i = 0; i < bars.length; i++) {
    const open = bars[i][1];
    const close = bars[i][4];
    if (!(open > 0)) continue;
    const pct = ((close - open) / open) * 100;
    const outcome = stocksClassifyOutcome(pct);
    const date = stocksParseDate(bars[i][0]);
    const l = stocksDayCycleLabels(date);

    overall.n++; overall[outcome]++; overall.sumPct += pct;
    stocksBumpCycleBucket(calendarDay, l.calendarDay, outcome, pct);
    stocksBumpCycleBucket(calendarDayReduced, l.calendarDayReduced, outcome, pct);
    stocksBumpCycleBucket(universalDay, l.universalDay, outcome, pct);
    stocksBumpCycleBucket(zodiacDay, l.zodiacDay, outcome, pct);
    stocksBumpCycleBucket(monthDay, `${l.universalMonth}|${l.universalDay}`, outcome, pct);
    stocksBumpCycleBucket(universalMonth, l.universalMonth, outcome, pct);
    stocksBumpCycleBucket(zodiacMonth, getChineseMonth(date), outcome, pct);
    stocksBumpCycleBucket(universalYear, getUniversalYear(date), outcome, pct);
    stocksBumpCycleBucket(zodiacYear, getChineseZodiacYear(date), outcome, pct);

    anchors.forEach((a, idx) => {
      const birthDate = stocksParseDate(a.date);
      let personalMonth = reduceNumber(getPersonalMonthRaw(birthDate, date));
      if (personalMonth === 2) personalMonth = 11; // no standalone 2 - same doctrine as universalDayNumber
      let personalYear = reduceNumber(getPersonalYearRaw(birthDate, date));
      if (personalYear === 2) personalYear = 11;
      stocksBumpCycleBucket(personalMonthMaps[idx], personalMonth, outcome, pct);
      stocksBumpCycleBucket(personalYearMaps[idx], personalYear, outcome, pct);
    });
  }

  const baseline = stocksFinalizeCycleBucket('all', 'All sessions', overall);

  const toRows = (map, order, labelFn) => order
    .filter((k) => map.has(k))
    .map((k) => stocksFinalizeCycleBucket(k, labelFn ? labelFn(k) : String(k), map.get(k)));
  const numLabelRows = (map) => toRows(map, STOCKS_CYCLE_UNIVERSAL_DAY_ORDER, (k) => stocksNumLabel(k));
  const zodiacLabelRows = (map) => toRows(map, CHINESE_ANIMALS);

  const edgeOverBaseline = (r) => Math.max(
    r.upPct - baseline.upPct,
    r.downPct - baseline.downPct,
    r.consolidatePct - baseline.consolidatePct,
  );

  const monthDayAll = [...monthDay.entries()].map(([key, b]) => {
    const [um, ud] = key.split('|').map(Number);
    return stocksFinalizeCycleBucket(key, `UM ${um} × UD ${stocksNumLabel(ud)}`, b);
  });
  const monthDayQualified = monthDayAll
    .filter((r) => r.n >= STOCKS_CYCLE_MIN_N)
    .sort((a, b) => edgeOverBaseline(b) - edgeOverBaseline(a));

  const anchorLabel = (a) => a.person || a.label;

  return {
    baseline,
    n: overall.n,
    firstDate: bars.length ? bars[0][0] : null,
    lastDate: bars.length ? bars[bars.length - 1][0] : null,
    day: {
      calendarDayRows: toRows(calendarDay, Array.from({ length: 31 }, (_, i) => i + 1)),
      calendarDayReducedRows: toRows(calendarDayReduced, STOCKS_CYCLE_CAL_DAY_REDUCED_ORDER),
      universalDayRows: numLabelRows(universalDay),
      zodiacDayRows: zodiacLabelRows(zodiacDay),
      monthDayRows: monthDayQualified,
      monthDayTotalCombos: monthDayAll.length,
      monthDayDropped: monthDayAll.length - monthDayQualified.length,
    },
    month: {
      universalMonthRows: numLabelRows(universalMonth),
      zodiacMonthRows: zodiacLabelRows(zodiacMonth),
      perAnchor: anchors.map((a, idx) => ({ label: anchorLabel(a), rows: numLabelRows(personalMonthMaps[idx]) })),
    },
    year: {
      universalYearRows: numLabelRows(universalYear),
      zodiacYearRows: zodiacLabelRows(zodiacYear),
      perAnchor: anchors.map((a, idx) => ({ label: anchorLabel(a), rows: numLabelRows(personalYearMaps[idx]) })),
    },
  };
}

// Cache of computed Day Cycles stats per ticker, so the grid/modal Verdict
// and the Day Cycles panel itself never fetch or recompute twice in one
// visit. Only ever populated for ES/NQ, and only once a Twelve Data key is
// on file - everything else about the page works exactly as before this.
const stocksCycleStatsCache = new Map();

// Background load for the Verdict's historical vote: fetches the same
// long history the Day Cycles panel uses, computes the same stats, caches
// them, then re-derives and re-renders just this instrument so its pill
// picks up the vote. Silent no-op without a saved API key or on a fetch
// error - the grid already rendered its zodiac/number-only read a moment
// earlier, so there's nothing to roll back, it just never gets the extra
// vote. No loading spinner, same as how CEO portraits fill in later.
async function stocksLoadCycleStatsForVerdict(inst, today, todayAnimal) {
  const key = localStorage.getItem(STOCKS_TD_KEY);
  if (!key) return;
  try {
    const bars = await stocksFetchSeries(inst.px.symbol, { outputsize: STOCKS_CYCLES_OUTPUTSIZE, cacheKey: STOCKS_CYCLES_PX_CACHE_KEY });
    if (bars.length < STOCKS_CYCLE_MIN_N * 2) return;
    const stats = stocksComputeCycles(inst, bars);
    stocksCycleStatsCache.set(inst.ticker, stats);
    const idx = stocksAllInstruments.findIndex((i) => i.ticker === inst.ticker);
    if (idx < 0) return;
    stocksAllInstruments[idx] = stocksInstrumentRead(inst, today, todayAnimal, stats);
    renderStocksGrid(stocksAllInstruments);
  } catch (e) { /* offline or bad key - stays zodiac/number-only, no error shown on the grid */ }
}

/* ===================== Combined Track Record (main-page dashboard) =====
 * "One win-rate across everything we've actually traded" - refined a few
 * times since the first pass: Intraday dropped from this box entirely (too
 * expensive to keep current automatically - it still lives as a mode
 * inside each instrument's own Trades panel, just not summed here); shows
 * whichever of Calendar/Cal+Price actually won, not both stacked; Month
 * and Year are separate, picked one at a time, not shown together; and the
 * graded result is now a persisted ledger in localStorage that only grows
 * when a new month or zodiac year actually completes - not recomputed
 * from scratch on every visit. */

// Rolling windows kept for each horizon.
const STOCKS_COMBINED_MONTHS_BACK = 24;
const STOCKS_COMBINED_YEARS_BACK = 3;
// Space between real (non-cached) history fetches while extending the
// record, so a cold run for 16 instruments never exceeds Twelve Data's
// 8-credits-a-minute free-tier cap no matter how the timing lands.
const STOCKS_COMBINED_FETCH_GAP_MS = 8000;
// v7: calendar/calPrice sub-grades now store the actual held/peak/worst %
// returns behind each grade (expectancy/avg-win-loss/worst-trade), not just
// the grade string - v6 entries have no size data to backfill, so the
// ledger rebuilds.
// v8 (2026-08-03): stocksAnchorTimeframeSignals dropped the Vietnamese
// zodiac vote and neutralized square/sextile at Year cadence (Signal
// Backtest showed both flat-or-backwards against baseline) - every v7 entry
// was graded under the old vote mix, so the ledger rebuilds to reflect the
// new one immediately instead of phasing in as old windows age out.
const STOCKS_COMBINED_STORE_KEY = 'numerology_stock_combined_record_v8';

function stocksDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stocksDateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Peeks at the long-history cache without fetching - lets the throttled
// loader below skip the delay after a cache hit (which cost no API call)
// and only pace out real network fetches.
function stocksCyclesCacheHit(symbol) {
  const todayISO = new Date().toISOString().slice(0, 10);
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(STOCKS_CYCLES_PX_CACHE_KEY)) || {}; } catch (e) { cache = {}; }
  const hit = cache[symbol];
  return !!(hit && hit.fetched === todayISO);
}

// Grades one window under Calendar and Cal + Price only - synchronous,
// since neither mode needs anything beyond the daily bars already in hand.
// Computes BOTH exit modes (reversal and full-term) at once, since the
// price data's already in hand either way - lets the Combined Track
// Record's toggle switch instantly with no re-fetch. Returns
// { calendar: { reversal, end }, calPrice: { reversal, end } }, each a
// grade ('right'/'wrong'/'mixed') or null (not directional, or no fill).
// One sub-grade: not just the grade string, but the actual held-to-end and
// peak % returns behind it - the size data expectancy needs, not just
// win/loss/mixed. Same favorable-oriented numbers stocksTradeCard already
// shows on the card itself, just captured instead of only displayed.
function stocksGradeSub(inst, lean, bars, entryIdx, triggerAnchor, exitMode) {
  if (entryIdx < 0) return null;
  const card = stocksTradeCard('', lean, stocksApplyExitRule(inst, lean, bars.slice(entryIdx), false, triggerAnchor, exitMode).bars);
  return { grade: card.grade, held: Math.round(card.held * 100) / 100, peak: Math.round(card.peak * 100) / 100, worst: Math.round(card.worst * 100) / 100 };
}

function stocksGradeWindowTwoModes(inst, lean, bars) {
  const none = { reversal: null, end: null };
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long') || bars.length <= 1) return { calendar: none, calPrice: none };
  const ei = stocksConfirmedEntryIndex(inst, lean, bars);
  const triggerAnchor = ei >= 0 ? stocksTriggeringAnchor(inst, lean, stocksParseDate(bars[ei][0])) : null;
  const calendar = {
    reversal: stocksGradeSub(inst, lean, bars, ei, triggerAnchor, 'reversal'),
    end: stocksGradeSub(inst, lean, bars, ei, triggerAnchor, 'end'),
  };
  const pei = stocksPriceConfirmedEntryIndex(inst, lean, bars);
  const calPrice = {
    reversal: stocksGradeSub(inst, lean, bars, pei, triggerAnchor, 'reversal'),
    end: stocksGradeSub(inst, lean, bars, pei, triggerAnchor, 'end'),
  };
  return { calendar, calPrice };
}

/* ---- Stop-Loss grading (session-only, not a persisted ledger version - see
   stocksLoadStopLossRecord below for why) ---- */

// Checks a hard % stop against each day's actual adverse extreme (the LOW
// for a long, the HIGH for a short - not the close, a stop can fire
// intraday). Fires on the first day the adverse extreme breaches -stopPct;
// the exit price on that day is that day's real worst price, not an
// idealized fill sitting exactly on the stop line. Also tracks the best
// favorable extreme reached along the way, for the card's "peak" stat.
function stocksApplyStopExit(bars, lean, stopPct) {
  const entry = bars[0][1];
  const fav = (px) => (lean.lean === 'short' ? ((entry - px) / entry) * 100 : ((px - entry) / entry) * 100);
  let peak = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    const favBest = fav(lean.lean === 'short' ? bars[i][3] : bars[i][2]);
    if (favBest > peak) peak = favBest;
    const adverseFav = fav(lean.lean === 'short' ? bars[i][2] : bars[i][3]);
    if (adverseFav <= -stopPct) return { bars: bars.slice(0, i + 1), stopped: true, stopFav: adverseFav, peak };
  }
  return { bars, stopped: false, peak };
}

// Stop-Loss sub-grade: the OTHER exit (besides the stop) is the window's
// natural end, not the reversal signal - this mode is isolating "does a
// hard floor alone fix the tail risk," not blending in the reversal exit
// too. A stopped trade is always graded WRONG, overriding the normal
// time-in-profit grading - that's the point of a hard stop. An unstopped
// trade grades exactly like Full Term (same path, nothing intervened), so
// a stop wide enough to never fire reproduces Full Term's numbers exactly.
function stocksGradeSubStop(inst, lean, bars, entryIdx, triggerAnchor, stopPct) {
  if (entryIdx < 0) return null;
  const fullPath = stocksApplyExitRule(inst, lean, bars.slice(entryIdx), false, triggerAnchor, 'end').bars;
  const stop = stocksApplyStopExit(fullPath, lean, stopPct);
  if (!stop.stopped) {
    const card = stocksTradeCard('', lean, stop.bars);
    return { grade: card.grade, held: Math.round(card.held * 100) / 100, peak: Math.round(card.peak * 100) / 100, worst: Math.round(card.worst * 100) / 100 };
  }
  const held = Math.round(stop.stopFav * 100) / 100;
  return { grade: 'wrong', held, peak: Math.round(stop.peak * 100) / 100, worst: held };
}

// Same shape as stocksGradeWindowTwoModes's { calendar, calPrice }, but each
// nested one level under a 'stop' key so stocksAggregateEntries (built for
// exitMode lookups like entries[mode]) works unchanged for this mode too.
function stocksGradeWindowStop(inst, lean, bars, stopPct) {
  const none = { stop: null };
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long') || bars.length <= 1) return { calendar: none, calPrice: none };
  const ei = stocksConfirmedEntryIndex(inst, lean, bars);
  const triggerAnchor = ei >= 0 ? stocksTriggeringAnchor(inst, lean, stocksParseDate(bars[ei][0])) : null;
  const pei = stocksPriceConfirmedEntryIndex(inst, lean, bars);
  return {
    calendar: { stop: stocksGradeSubStop(inst, lean, bars, ei, triggerAnchor, stopPct) },
    calPrice: { stop: stocksGradeSubStop(inst, lean, bars, pei, triggerAnchor, stopPct) },
  };
}

/* ---- persisted ledger: one entry per instrument per completed period ---- */

function stocksLoadCombinedStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STOCKS_COMBINED_STORE_KEY));
    if (raw && Array.isArray(raw.monthEntries) && Array.isArray(raw.yearEntries)) return raw;
  } catch (e) { /* corrupt or missing - start fresh */ }
  return { monthEntries: [], yearEntries: [] };
}

function stocksSaveCombinedStore(store) {
  try { localStorage.setItem(STOCKS_COMBINED_STORE_KEY, JSON.stringify(store)); } catch (e) { /* storage full - still works in-memory this session */ }
}

// A window's stable ledger key - the start date is unique per instrument
// per level (two runs can't share a start), and it never changes once the
// window has completed, so already-graded entries diff cleanly against it.
function stocksWindowKey(w) {
  return stocksDateToISO(w.start);
}

function stocksAggregateEntries(entries, exitMode) {
  const mk = () => ({ right: 0, wrong: 0, mixed: 0, wins: [], losses: [], worstTrade: 0 });
  const agg = { calendar: mk(), calPrice: mk() };
  entries.forEach((e) => {
    const cal = e.calendar && e.calendar[exitMode];
    const cp = e.calPrice && e.calPrice[exitMode];
    if (cal) {
      agg.calendar[cal.grade]++;
      (cal.held > 0 ? agg.calendar.wins : agg.calendar.losses).push(cal.held);
      agg.calendar.worstTrade = Math.min(agg.calendar.worstTrade, cal.worst);
    }
    if (cp) {
      agg.calPrice[cp.grade]++;
      (cp.held > 0 ? agg.calPrice.wins : agg.calPrice.losses).push(cp.held);
      agg.calPrice.worstTrade = Math.min(agg.calPrice.worstTrade, cp.worst);
    }
  });
  return agg;
}

// $1,000 is a clearly-labeled hypothetical stand-in position size (nothing
// here trades real money) - just makes the expectancy % easy to picture at
// a glance; multiply by 10 for $10k, etc.
const STOCKS_HYPOTHETICAL_POSITION = 1000;

// The size data behind the win rate - a 71% win rate with losses bigger
// than wins can still lose money, and a 51% win rate with wins twice the
// size of losses is a real, strong edge. "Win"/"loss" here means the
// actual realized (held-to-end) return's sign, not the right/wrong/mixed
// grade - a MIXED trade still has a real return and counts at that number.
// Gated on STOCKS_CYCLE_MIN_N, same "not enough sample yet" doctrine the
// Day Cycles backtest already uses.
function stocksExpectancyStats(m) {
  const n = m.wins.length + m.losses.length;
  if (n < STOCKS_CYCLE_MIN_N) return { n, ready: false };
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const avgWin = m.wins.length ? sum(m.wins) / m.wins.length : 0;
  const avgLoss = m.losses.length ? sum(m.losses) / m.losses.length : 0;
  const expectancy = (sum(m.wins) + sum(m.losses)) / n;
  return {
    n, ready: true, avgWin, avgLoss, expectancy,
    ratio: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null,
    dollarExpectancy: (expectancy / 100) * STOCKS_HYPOTHETICAL_POSITION,
    worstTrade: m.worstTrade,
  };
}

function stocksExpectancyRowsHtml(m) {
  const s = stocksExpectancyStats(m);
  if (!s.ready) return `<div class="stock-trades-note">Not enough graded trades yet for expectancy (n=${s.n}, need ${STOCKS_CYCLE_MIN_N}+).</div>`;
  const fmtPct = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
  const good = s.expectancy > 0;
  return `
    <div class="stock-combined-record-row">
      <span class="stock-combined-record-label">Expectancy <span class="stock-edge ${good ? 'good' : 'bad'}">${good ? 'Positive Edge' : 'Negative Edge'}</span></span>
      <span class="score-inline ${good ? 'good' : 'bad'}">${fmtPct(s.expectancy)} <span style="font-weight:400;">per trade</span></span>
    </div>
    <div class="stock-combined-record-row">
      <span class="stock-combined-record-label" style="font-weight:400;color:var(--muted);">Avg win ${fmtPct(s.avgWin)} · Avg loss ${fmtPct(s.avgLoss)}${s.ratio != null ? ` · ${s.ratio.toFixed(1)}:1` : ''}</span>
      <span style="font-weight:400;color:var(--muted);font-size:0.8rem;">${s.dollarExpectancy >= 0 ? '+' : ''}$${s.dollarExpectancy.toFixed(0)} / $${STOCKS_HYPOTHETICAL_POSITION.toLocaleString()} risked</span>
    </div>
    <div class="stock-combined-record-row">
      <span class="stock-combined-record-label" style="font-weight:400;color:var(--muted);">Worst single trade</span>
      <span class="score-inline bad">${s.worstTrade.toFixed(1)}%</span>
    </div>`;
}

// Shows whichever of Calendar/Cal + Price actually performed better - one
// number, the one that's actually working, not both stacked - plus the
// expectancy/avg-win-loss/worst-trade breakdown for that same mode.
function stocksBestModeLine(agg) {
  const rate = (m) => { const s = m.right + m.wrong + m.mixed; return s ? m.right / s : -1; };
  const calRate = rate(agg.calendar);
  const cpRate = rate(agg.calPrice);
  if (calRate < 0 && cpRate < 0) return `<div class="stock-trades-note">No graded trades yet in this window.</div>`;
  const best = cpRate >= calRate ? { label: 'Cal + Price', m: agg.calPrice, rate: cpRate } : { label: 'Calendar', m: agg.calendar, rate: calRate };
  const settled = best.m.right + best.m.wrong + best.m.mixed;
  const pct = Math.round(best.rate * 100);
  const cls = pct >= 55 ? 'good' : pct <= 45 ? 'bad' : '';
  return `
    <div class="stock-combined-record-row">
      <span class="stock-combined-record-label">${escapeHtml(best.label)} <span style="font-weight:400;color:var(--muted);">best of the two</span></span>
      <span class="score-inline ${cls}">${pct}% <span style="font-weight:400;">(${best.m.right}/${best.m.wrong}/${best.m.mixed} of ${settled})</span></span>
    </div>
    ${stocksExpectancyRowsHtml(best.m)}`;
}

// Which stored horizon the box shows - session-scoped, resets to Month on
// page load, same idea as the other Day/Month/Year toggles on this page.
let stocksCombinedHorizon = 'month';
// Which exit rule the box grades by - 'reversal' (default), 'end' (ride to
// the window's natural end), or 'stop' (ride to the end, but exit early on
// a hard % stop). Reversal/end are pre-computed per entry in the persisted
// ledger; stop is computed fresh in-session (see stocksLoadStopLossRecord).
let stocksCombinedExitMode = 'reversal';

// The hard stop %, freely editable in the box - same number applied to
// every instrument (not scaled per volatility tier).
let stocksStopPct = 5;
// Session-only cache of the Stop-Loss regrade: { pct, monthEntries,
// yearEntries }. Not persisted to localStorage - the % is a free-typed
// input, so re-deriving it fresh (from price bars already cached for the
// ledger above) is simpler than a fourth version-locked store, and cheap
// once those bars are in hand.
let stocksStopCache = null;
let stocksStopLoading = false;
// The instruments/today this box last loaded with - stashed here so the
// Stop-Loss toggle and % input can kick off a rebuild without needing the
// caller to thread them through the render function.
let stocksCombinedInstruments = null;
let stocksCombinedToday = null;

function stocksCombinedHorizonFilterHtml() {
  const opt = (h, label) => `<button class="stocks-filter-btn${stocksCombinedHorizon === h ? ' active' : ''}" data-horizon="${h}">${label}</button>`;
  return `<div class="stocks-filter-seg" id="stockCombinedHorizonFilter">${opt('month', 'Month')}${opt('year', 'Year')}</div>`;
}

function stocksCombinedExitFilterHtml() {
  const opt = (m, label) => `<button class="stocks-filter-btn${stocksCombinedExitMode === m ? ' active' : ''}" data-exit="${m}">${label}</button>`;
  const stopInput = stocksCombinedExitMode === 'stop'
    ? `<span class="stock-stop-input"><input type="number" id="stockStopPctInput" value="${stocksStopPct}" min="0.1" max="100" step="0.5">%</span>`
    : '';
  return `<div class="stocks-filter-seg" id="stockCombinedExitFilter">${opt('reversal', 'Reversal')}${opt('end', 'Full Term')}${opt('stop', 'Stop-Loss')}${stopInput}</div>`;
}

// Starts closed like every other group/dropdown on this page - a glance at
// the ticker/day pill is the default view, the record itself is a tap away.
let stocksCombinedCollapsed = true;

function renderStocksCombinedRecordBody(box, store) {
  const isStop = stocksCombinedExitMode === 'stop';
  const windowLabel = stocksCombinedHorizon === 'year' ? `last ${STOCKS_COMBINED_YEARS_BACK} years` : `last ${STOCKS_COMBINED_MONTHS_BACK} months`;
  const stopReady = isStop && stocksStopCache && stocksStopCache.pct === stocksStopPct;
  let noteHtml;
  let statsHtml = '';
  if (isStop && !stopReady) {
    noteHtml = stocksStopLoading
      ? `Building the Stop-Loss record at ${stocksStopPct}%…`
      : `Not built yet at ${stocksStopPct}% - change the number and press Enter, or re-click Stop-Loss, to run it.`;
  } else if (isStop) {
    const entries = stocksCombinedHorizon === 'year' ? stocksStopCache.yearEntries : stocksStopCache.monthEntries;
    noteHtml = `Every completed ${stocksCombinedHorizon}-cycle window, ${windowLabel}, all 16 instruments, riding to the window's end but exiting at that day's real low/high the moment a ${stocksStopPct}% adverse move hits. A stopped trade always grades WRONG. Recomputed in-session, not saved.`;
    statsHtml = stocksBestModeLine(stocksAggregateEntries(entries, 'stop'));
  } else {
    const entries = stocksCombinedHorizon === 'year' ? store.yearEntries : store.monthEntries;
    const exitLabel = stocksCombinedExitMode === 'end' ? 'holding to the window’s end' : 'exiting at the reversal signal';
    noteHtml = `Every completed ${stocksCombinedHorizon}-cycle window (each instrument's own boundaries), ${windowLabel}, all 16 instruments, ${exitLabel}. Updates only when a new window completes.`;
    statsHtml = stocksBestModeLine(stocksAggregateEntries(entries, stocksCombinedExitMode));
  }
  box.innerHTML = `
    <div class="stock-group${stocksCombinedCollapsed ? ' collapsed' : ''}" id="stockCombinedGroup">
      <div class="stock-group-head">
        <span>Combined Track Record</span>
        <span class="stock-group-chev">▾</span>
      </div>
      <div class="stock-group-grid">
        ${stocksCombinedHorizonFilterHtml()}
        ${stocksCombinedExitFilterHtml()}
        <div class="stock-trades-note">${noteHtml}</div>
        ${statsHtml}
      </div>
    </div>`;
  box.querySelector('.stock-group-head').addEventListener('click', () => {
    stocksCombinedCollapsed = !stocksCombinedCollapsed;
    box.querySelector('#stockCombinedGroup').classList.toggle('collapsed', stocksCombinedCollapsed);
  });
  box.querySelectorAll('#stockCombinedHorizonFilter .stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (stocksCombinedHorizon === btn.dataset.horizon) return;
      stocksCombinedHorizon = btn.dataset.horizon;
      renderStocksCombinedRecordBody(box, store);
    });
  });
  box.querySelectorAll('#stockCombinedExitFilter .stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (stocksCombinedExitMode === btn.dataset.exit) return;
      stocksCombinedExitMode = btn.dataset.exit;
      renderStocksCombinedRecordBody(box, store);
      if (stocksCombinedExitMode === 'stop' && (!stocksStopCache || stocksStopCache.pct !== stocksStopPct) && stocksCombinedInstruments && !stocksStopLoading) {
        stocksLoadStopLossRecord(stocksCombinedInstruments, stocksCombinedToday, stocksStopPct);
      }
    });
  });
  const stopInput = box.querySelector('#stockStopPctInput');
  if (stopInput) {
    stopInput.addEventListener('click', (e) => e.stopPropagation());
    const commit = () => {
      const v = parseFloat(stopInput.value);
      if (!(v > 0) || v === stocksStopPct) return;
      stocksStopPct = v;
      stocksStopCache = null;
      renderStocksCombinedRecordBody(box, store);
      if (stocksCombinedInstruments && !stocksStopLoading) stocksLoadStopLossRecord(stocksCombinedInstruments, stocksCombinedToday, stocksStopPct);
    };
    stopInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); });
    stopInput.addEventListener('blur', commit);
  }
}

// Only grades what's actually new: each instrument's completed cycle
// windows (per-instrument boundaries - see stocksRecentCompletedWindows)
// are diffed against the ledger by window key, and only ungraded ones get
// graded. Window discovery itself is real ephemeris math over hundreds of
// days per instrument, so it runs at most once per calendar day
// (lastCheckedISO) - every other visit renders straight from the ledger
// with zero computation and zero fetches.
async function stocksLoadCombinedRecord(instruments, today) {
  const box = document.getElementById('stocksCombinedRecord');
  if (!box) return;
  stocksCombinedInstruments = instruments;
  stocksCombinedToday = today;
  const key = localStorage.getItem(STOCKS_TD_KEY);
  if (!key) {
    box.innerHTML = `<div class="stock-trades-note">Needs the same Twelve Data API key as Trades/Day Cycles - open any instrument's Trades panel once to save one, then reload this page.</div>`;
    return;
  }

  const store = stocksLoadCombinedStore();
  const todayISO = stocksDateToISO(today);
  if (store.lastCheckedISO === todayISO) {
    renderStocksCombinedRecordBody(box, store); // already checked today - ledger is current
    return;
  }

  const gradedKeys = new Set([
    ...store.monthEntries.map((e) => `${e.ticker}|M|${e.key}`),
    ...store.yearEntries.map((e) => `${e.ticker}|Y|${e.key}`),
  ]);
  const monthBackDays = Math.round(STOCKS_COMBINED_MONTHS_BACK * 30.5);
  const yearBackDays = STOCKS_COMBINED_YEARS_BACK * 366;
  const relevantKeys = new Set();
  let processed = 0;
  for (const inst of instruments) {
    box.innerHTML = `<div class="stock-trades-note">Updating track record - ${processed}/${instruments.length} instruments…</div>`;
    await stocksDelay(0); // let the note paint before this instrument's window scan
    try {
      const monthWins = stocksRecentCompletedWindows(inst, 'month', today, 999, monthBackDays);
      const yearWins = stocksRecentCompletedWindows(inst, 'year', today, 99, yearBackDays);
      monthWins.forEach((w) => relevantKeys.add(`${inst.ticker}|M|${stocksWindowKey(w)}`));
      yearWins.forEach((w) => relevantKeys.add(`${inst.ticker}|Y|${stocksWindowKey(w)}`));
      const newMonthWins = monthWins.filter((w) => !gradedKeys.has(`${inst.ticker}|M|${stocksWindowKey(w)}`));
      const newYearWins = yearWins.filter((w) => !gradedKeys.has(`${inst.ticker}|Y|${stocksWindowKey(w)}`));
      if (newMonthWins.length || newYearWins.length) {
        const wasCached = stocksCyclesCacheHit(inst.px.symbol);
        const bars = await stocksFetchSeries(inst.px.symbol, { outputsize: STOCKS_CYCLES_OUTPUTSIZE, cacheKey: STOCKS_CYCLES_PX_CACHE_KEY });
        const gradeInto = (wins, entries) => wins.forEach((w) => {
          const startISO = stocksDateToISO(w.start);
          const endISO = stocksDateToISO(w.end);
          const wBars = bars.filter((b) => b[0] >= startISO && b[0] <= endISO);
          if (!wBars.length) return; // window predates available price history - retried daily, cheap on the cached bars
          const { calendar, calPrice } = stocksGradeWindowTwoModes(inst, stocksWindowLean(w), wBars);
          entries.push({ key: stocksWindowKey(w), ticker: inst.ticker, calendar, calPrice });
        });
        gradeInto(newMonthWins, store.monthEntries);
        gradeInto(newYearWins, store.yearEntries);
        if (!wasCached) await stocksDelay(STOCKS_COMBINED_FETCH_GAP_MS);
      }
    } catch (e) { /* one bad symbol or a rate-limit hiccup shouldn't block the rest */ }
    processed++;
  }

  store.monthEntries = store.monthEntries.filter((e) => relevantKeys.has(`${e.ticker}|M|${e.key}`));
  store.yearEntries = store.yearEntries.filter((e) => relevantKeys.has(`${e.ticker}|Y|${e.key}`));
  store.lastCheckedISO = todayISO;
  stocksSaveCombinedStore(store);
  renderStocksCombinedRecordBody(box, store);
}

// Stop-Loss isn't a persisted ledger version like Calendar/Cal+Price above -
// the % is a free-typed input, so instead of a fifth version-locked store
// this regrades fresh in-session, every time the toggle switches to Stop-Loss
// or the % changes. Still cheap: it reuses the exact same price cache
// (STOCKS_CYCLES_PX_CACHE_KEY) the ledger above already warms, so an
// instrument the ledger already fetched today for a new window is a free
// cache hit here too - only instruments with no new windows today (and so
// no reason for the ledger to have fetched them) cost a real network call,
// throttled the same way. Regrades EVERY completed window (not just new
// ones, there's no store to diff against), which is what "full retroactive
// regrade" means for a mode with nothing persisted to diff against.
async function stocksLoadStopLossRecord(instruments, today, stopPct) {
  const box = document.getElementById('stocksCombinedRecord');
  if (!box || stocksStopLoading) return;
  stocksStopLoading = true;
  const monthBackDays = Math.round(STOCKS_COMBINED_MONTHS_BACK * 30.5);
  const yearBackDays = STOCKS_COMBINED_YEARS_BACK * 366;
  const monthEntries = [];
  const yearEntries = [];
  let processed = 0;
  for (const inst of instruments) {
    box.innerHTML = `<div class="stock-trades-note">Building the Stop-Loss record at ${stopPct}% - ${processed}/${instruments.length} instruments…</div>`;
    await stocksDelay(0);
    try {
      const monthWins = stocksRecentCompletedWindows(inst, 'month', today, 999, monthBackDays);
      const yearWins = stocksRecentCompletedWindows(inst, 'year', today, 99, yearBackDays);
      if (monthWins.length || yearWins.length) {
        const wasCached = stocksCyclesCacheHit(inst.px.symbol);
        const bars = await stocksFetchSeries(inst.px.symbol, { outputsize: STOCKS_CYCLES_OUTPUTSIZE, cacheKey: STOCKS_CYCLES_PX_CACHE_KEY });
        const gradeInto = (wins, entries) => wins.forEach((w) => {
          const startISO = stocksDateToISO(w.start);
          const endISO = stocksDateToISO(w.end);
          const wBars = bars.filter((b) => b[0] >= startISO && b[0] <= endISO);
          if (!wBars.length) return;
          const { calendar, calPrice } = stocksGradeWindowStop(inst, stocksWindowLean(w), wBars, stopPct);
          entries.push({ key: stocksWindowKey(w), ticker: inst.ticker, calendar, calPrice });
        });
        gradeInto(monthWins, monthEntries);
        gradeInto(yearWins, yearEntries);
        if (!wasCached) await stocksDelay(STOCKS_COMBINED_FETCH_GAP_MS);
      }
    } catch (e) { /* one bad symbol or a rate-limit hiccup shouldn't block the rest */ }
    processed++;
  }
  stocksStopCache = { pct: stopPct, monthEntries, yearEntries };
  stocksStopLoading = false;
  renderStocksCombinedRecordBody(box, stocksLoadCombinedStore());
}

function stocksCycleLean(row, baseline) {
  if (row.n < STOCKS_CYCLE_MIN_N) return { tag: `n<${STOCKS_CYCLE_MIN_N}`, cls: '', dim: true };
  const upEdge = row.upPct - baseline.upPct;
  const downEdge = row.downPct - baseline.downPct;
  const consolidateEdge = row.consolidatePct - baseline.consolidatePct;
  const best = Math.max(upEdge, downEdge, consolidateEdge);
  if (best < STOCKS_CYCLE_LEAN_MARGIN) return { tag: '—', cls: '', dim: false };
  if (best === upEdge) return { tag: 'Bullish lean', cls: 'lean-up', dim: false };
  if (best === downEdge) return { tag: 'Bearish lean', cls: 'lean-down', dim: false };
  return { tag: 'Choppy lean', cls: 'lean-flat', dim: false };
}

function stocksCycleRowHtml(row, baseline) {
  const lean = stocksCycleLean(row, baseline);
  return `
    <tr class="${lean.cls}">
      <td>${escapeHtml(row.label)}</td>
      <td>${row.n}</td>
      <td class="${row.upPct - baseline.upPct >= STOCKS_CYCLE_LEAN_MARGIN ? 'good' : ''}">${row.upPct}%</td>
      <td class="${row.downPct - baseline.downPct >= STOCKS_CYCLE_LEAN_MARGIN ? 'bad' : ''}">${row.downPct}%</td>
      <td>${row.consolidatePct}%</td>
      <td class="${row.avgPct >= 0 ? 'good' : 'bad'}">${row.avgPct >= 0 ? '+' : ''}${row.avgPct.toFixed(2)}%</td>
      <td class="lean-cell${lean.dim ? ' dim' : ''}">${escapeHtml(lean.tag)}</td>
    </tr>`;
}

function stocksCycleTableHtml(title, headerLabel, note, rows, baseline) {
  if (!rows.length) return '';
  return `
    <div class="stock-section-label">${escapeHtml(title)}</div>
    ${note ? `<div class="stock-cycles-note">${escapeHtml(note)}</div>` : ''}
    <div class="pm-table-scroll">
      <table class="stock-cycles-table">
        <thead><tr><th>${escapeHtml(headerLabel)}</th><th>N</th><th>Up</th><th>Down</th><th>Consolidate</th><th>Avg &Delta;</th><th>Read</th></tr></thead>
        <tbody>${rows.map((r) => stocksCycleRowHtml(r, baseline)).join('')}</tbody>
      </table>
    </div>`;
}

// Which resolution the panel is showing - Day/Month/Year. Session-scoped,
// same idea as stocksTradesLevel; reset to Day on page load.
let stocksCyclesLevel = 'day';

function stocksCyclesLevelFilterHtml() {
  const opt = (level, label) => `<button class="stocks-filter-btn${stocksCyclesLevel === level ? ' active' : ''}" data-level="${level}">${label}</button>`;
  return `<div class="stocks-filter-seg" id="stockCyclesLevelFilter">${opt('day', 'Day')}${opt('month', 'Month')}${opt('year', 'Year')}</div>`;
}

function stocksCyclesDayHtml(stats) {
  return `
    ${stocksCycleTableHtml('Universal Day', 'Universal Day', 'Life-path-style pool of the date itself (1-9, 11, 22, 28, 33) - the same number and owner-defined meanings (7 weak, 8 strong, 28 expansion, 11 volatile) used across the app.', stats.day.universalDayRows, stats.baseline)}
    ${stocksCycleTableHtml('Calendar Day', 'Day of Month', 'Plain day-of-month, 1-31.', stats.day.calendarDayRows, stats.baseline)}
    ${stocksCycleTableHtml('Calendar Day Reduced', 'Reduced', 'Day-of-month reduced to a single digit (11/22 held as master numbers).', stats.day.calendarDayReducedRows, stats.baseline)}
    ${stocksCycleTableHtml('Chinese Zodiac Day', 'Animal', "The date's own day-animal in the repeating 12-day cycle - independent of the zodiac YEAR below.", stats.day.zodiacDayRows, stats.baseline)}
    <div class="stock-section-label">Universal Month &times; Universal Day</div>
    <div class="stock-cycles-note">Top ${Math.min(30, stats.day.monthDayRows.length)} of ${stats.day.monthDayTotalCombos} combos with N&ge;${STOCKS_CYCLE_MIN_N} (${stats.day.monthDayDropped} combos dropped for too few sessions), ranked by size of edge over baseline.</div>
    <div class="pm-table-scroll">
      <table class="stock-cycles-table">
        <thead><tr><th>Combo</th><th>N</th><th>Up</th><th>Down</th><th>Consolidate</th><th>Avg &Delta;</th><th>Read</th></tr></thead>
        <tbody>${stats.day.monthDayRows.slice(0, 30).map((r) => stocksCycleRowHtml(r, stats.baseline)).join('')}</tbody>
      </table>
    </div>`;
}

function stocksCyclesMonthHtml(stats) {
  return `
    ${stocksCycleTableHtml('Universal Month', 'Universal Month', 'Universal Year + calendar month, reduced - calendar-only, the same number used in Today\'s Energies.', stats.month.universalMonthRows, stats.baseline)}
    ${stocksCycleTableHtml('Vietnamese Zodiac Month', 'Animal', "The calendar's own month-animal (calendar-only, not tied to any anchor).", stats.month.zodiacMonthRows, stats.baseline)}
    ${stats.month.perAnchor.map((a) => stocksCycleTableHtml(
      `Personal Month — ${a.label}`, 'Personal Month',
      `${a.label}'s own Personal Month (its Life Path cycle vs. each session's date) - anchor-relative, unlike the two calendar-only tables above.`,
      a.rows, stats.baseline,
    )).join('')}`;
}

function stocksCyclesYearHtml(stats) {
  return `
    ${stocksCycleTableHtml('Universal Year', 'Universal Year', 'Calendar year, reduced - calendar-only.', stats.year.universalYearRows, stats.baseline)}
    ${stocksCycleTableHtml('Vietnamese Zodiac Year', 'Animal', "The calendar's own zodiac year-animal (calendar-only).", stats.year.zodiacYearRows, stats.baseline)}
    ${stats.year.perAnchor.map((a) => stocksCycleTableHtml(
      `Personal Year — ${a.label}`, 'Personal Year',
      `${a.label}'s own Personal Year on each session's date - anchor-relative, same cell the Verdict/Trades panels already lean on.`,
      a.rows, stats.baseline,
    )).join('')}`;
}

function stocksCyclesBodyHtml(inst, stats) {
  const fmtD = (iso) => stocksParseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const sections = stocksCyclesLevel === 'month' ? stocksCyclesMonthHtml(stats)
    : stocksCyclesLevel === 'year' ? stocksCyclesYearHtml(stats)
    : stocksCyclesDayHtml(stats);
  return `
    <div class="stock-trades-box">
      <div class="stock-cycles-note">
        <b>${escapeHtml(inst.ticker)} Day Cycles</b> — ${escapeHtml(inst.px.symbol)}${inst.px.note ? ` (${escapeHtml(inst.px.note)})` : ''}, ${stats.n} sessions, ${escapeHtml(fmtD(stats.firstDate))} &rarr; ${escapeHtml(fmtD(stats.lastDate))}.
        Every session is Up / Down / Consolidate off its close vs. its own open, with a &plusmn;${STOCKS_CYCLE_FLAT_PCT}% dead zone read as Consolidate.
        Baseline over the whole window: <span class="score-inline good">${stats.baseline.upPct}% up</span> &middot; <span class="score-inline bad">${stats.baseline.downPct}% down</span> &middot; <span class="score-inline mid">${stats.baseline.consolidatePct}% consolidate</span>.
        A Read only appears once a bucket clears both a minimum sample (N&ge;${STOCKS_CYCLE_MIN_N}) and a ${STOCKS_CYCLE_LEAN_MARGIN}-point edge over that baseline &mdash; raw historical frequency on one price history, not a proven edge, and testing this many buckets at once means some reads clear that bar by chance alone.
      </div>
      ${stocksCyclesLevelFilterHtml()}
      ${sections}
    </div>`;
}

function stocksWireCyclesLevelFilter(inst, stats) {
  const el = document.getElementById('stockCyclesLevelFilter');
  if (!el) return;
  el.querySelectorAll('.stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (stocksCyclesLevel === btn.dataset.level) return;
      stocksCyclesLevel = btn.dataset.level;
      const panel = document.getElementById('stockCyclesPanel');
      if (panel) panel.innerHTML = stocksCyclesBodyHtml(inst, stats);
      stocksWireCyclesLevelFilter(inst, stats);
    });
  });
}

async function renderStockDayCycles(inst) {
  const panel = document.getElementById('stockCyclesPanel');
  if (!panel) return;
  const key = localStorage.getItem(STOCKS_TD_KEY);
  if (!key) {
    panel.innerHTML = `
      <div class="stock-trades-box">
        <div class="stock-trades-note">Day Cycles needs the same Twelve Data API key as Trades - a free key (twelvedata.com), pasted once, kept only on this device.</div>
        <div class="stock-trades-keyrow">
          <input type="text" id="stockCyclesKeyInput" placeholder="Paste API key" autocomplete="off">
          <button id="stockCyclesKeySave">Save</button>
        </div>
      </div>`;
    document.getElementById('stockCyclesKeySave').addEventListener('click', () => {
      const v = document.getElementById('stockCyclesKeyInput').value.trim();
      if (!v) return;
      localStorage.setItem(STOCKS_TD_KEY, v);
      renderStockDayCycles(inst);
    });
    return;
  }

  panel.innerHTML = `<div class="stock-trades-box"><div class="stock-trades-note">Loading ${escapeHtml(inst.px.symbol)} history…</div></div>`;
  let bars;
  try {
    bars = await stocksFetchSeries(inst.px.symbol, { outputsize: STOCKS_CYCLES_OUTPUTSIZE, cacheKey: STOCKS_CYCLES_PX_CACHE_KEY });
  } catch (err) {
    panel.innerHTML = `
      <div class="stock-trades-box">
        <div class="stock-trades-note bad">Price feed error: ${escapeHtml(err.message || 'unknown')}.</div>
        <div class="stock-trades-keyrow"><button id="stockCyclesKeyReset">Change API key</button></div>
      </div>`;
    document.getElementById('stockCyclesKeyReset').addEventListener('click', () => {
      localStorage.removeItem(STOCKS_TD_KEY);
      renderStockDayCycles(inst);
    });
    return;
  }
  if (bars.length < STOCKS_CYCLE_MIN_N * 2) {
    panel.innerHTML = `<div class="stock-trades-box"><div class="stock-trades-note bad">Only ${bars.length} sessions came back - not enough history for a day-cycle read.</div></div>`;
    return;
  }

  const stats = stocksComputeCycles(inst, bars);
  panel.innerHTML = stocksCyclesBodyHtml(inst, stats);
  stocksWireCyclesLevelFilter(inst, stats);
}

// Header shortcut: jump straight to an instrument's Day Cycles panel
// without first finding its card and opening "Day Cycles" from inside -
// opens the same modal, then immediately renders the same panel.
function stocksOpenDayCycles(ticker) {
  const inst = stocksAllInstruments.find((i) => i.ticker === ticker);
  if (!inst) return;
  openStockModal(inst);
  renderStockDayCycles(inst);
}

/* ===================== Page init ===================== */

function initStocksPage() {
  const today = new Date();
  const todayAnimal = getChineseZodiacYear(today);
  document.getElementById('stocksYearChip').textContent = `${today.getFullYear()} · Year of the ${todayAnimal}`;

  const instruments = STOCK_INSTRUMENTS.map((inst) => stocksInstrumentRead(inst, today, todayAnimal));
  stocksAllInstruments = instruments;
  renderStocksGrid(instruments);
  stocksSyncFilterButtons();
  stocksLoadPortraits(); // async - popup portraits, grid stays ticker-only
  // ES/NQ only: background-load their Day Cycles history so the Verdict's
  // historical vote can fold in once it lands - the grid already rendered
  // instantly above with the zodiac/number-only read, this just refines it.
  instruments.filter((i) => i.kind === 'futures').forEach((inst) => stocksLoadCycleStatsForVerdict(inst, today, todayAnimal));

  // Radar: pure calendar math across all 16, renders instantly - no need to
  // open every modal one at a time to see what's coming up next.
  stocksRenderRadar(instruments, today);
  stocksLoadCombinedRecord(instruments, today); // async - throttled, see the Combined Track Record section above
  stocksInitTransitBacktest(instruments); // shell + any cached result only - the real scan waits for the Run button

  document.querySelectorAll('#stocksDirFilter .stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      stocksFilter.dir = btn.dataset.dir;
      stocksSyncFilterButtons();
      renderStocksGrid(stocksAllInstruments);
    });
  });
  document.getElementById('stocksCyclesEsBtn').addEventListener('click', () => stocksOpenDayCycles('ES'));
  document.getElementById('stocksCyclesNqBtn').addEventListener('click', () => stocksOpenDayCycles('NQ'));

  document.querySelectorAll('#stocksLevelFilter .stocks-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      stocksFilter.level = btn.dataset.level;
      stocksSyncFilterButtons();
      renderStocksGrid(stocksAllInstruments);
    });
  });

  const overlay = document.getElementById('stockModalOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
  document.getElementById('stockModalClose').addEventListener('click', () => { overlay.style.display = 'none'; });
}

initStocksPage();

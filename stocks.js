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
  return dir ? { dir, why: `${bodyKey} ${aspect.key} natal Sun` } : null;
}

// All active transit signals for one anchor at one timeframe, on a given
// date - level picks which planets are even in scope, matching each one's
// real orbital speed to the timeframe it actually represents.
function stocksTransitSignalsFor(anchorDate, level, onDate) {
  const natalSunLon = astroEclipticLongitude('Sun', anchorDate);
  return STOCKS_TRANSIT_PLANETS[level]
    .map((body) => stocksTransitSignal(body, natalSunLon, onDate))
    .filter(Boolean);
}

// All 9 transit-eligible planets (every STOCKS_TRANSIT_PLANETS body across
// all three timeframes), for the energy-block display - the tally checks
// each planet against only its own timeframe, but the display shows
// everything currently active in one place, same as Numbers/Zodiac already
// merge all three timeframes into one block.
const STOCKS_ALL_TRANSIT_PLANETS = [].concat(...Object.values(STOCKS_TRANSIT_PLANETS));

// Chips for whichever transits are actually active right now - most days,
// for most planets, this is empty (an active aspect is the exception, not
// the rule), which is a real, correct read, not a broken one.
function stocksTransitChipsHtml(anchorDate, onDate) {
  const natalSunLon = astroEclipticLongitude('Sun', anchorDate);
  const active = STOCKS_ALL_TRANSIT_PLANETS
    .map((body) => stocksTransitSignal(body, natalSunLon, onDate))
    .filter(Boolean);
  if (!active.length) return '<span class="stock-chip">No active transits right now</span>';
  return active.map((t) => `<span class="stock-chip ${t.dir === 'bull' ? 'good' : 'bad'}">${escapeHtml(t.why)}</span>`).join('');
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

// One anchor's bulls/bears at one timeframe - numerology meaning-number +
// Vietnamese zodiac relation always, real transits at every timeframe (which
// planets depends on the timeframe), western Sun-sign only at Month.
function stocksAnchorTimeframeSignals(read, level, historical, today) {
  if (!read.flow) return { bulls: [], bears: [] };
  const f = read.flow;
  const who = read.person || read.label;
  const meta = STOCKS_LEVEL_NUM_META[level];
  const num = f.numerology[meta.numKey];
  const signScore = f.vietnamese[meta.signKey];
  const mySign = f.vietnamese[meta.mySignKey];
  const nowSign = f.vietnamese[meta.nowSignKey];
  const bulls = [];
  const bears = [];

  const meaning = STOCKS_NUMBER_MEANINGS[num];
  if (signScore <= 10) bears.push(`${who}'s ${mySign} clashes the ${nowSign} ${meta.signWord}`);
  if (meaning && meaning.dir === 'bear') bears.push(`${who} runs a ${meta.numName} ${num} ${meaning.label.toLowerCase()}`);
  if (signScore >= 85) bulls.push(`${who}'s ${mySign} allies the ${nowSign} ${meta.signWord}`);
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

// One anchor's deep today block: PY/PM/PD against the Universal numbers,
// birth year/month/day signs against today's three signs, western Sun-sign
// compat, and any currently active planetary transits to the natal Sun -
// every pair marked in words when it clashes (table 10) or boosts (85+) -
// color carries the rest, no icon noise. atDate is the reference date the
// transit/western signals are read against (today, or a replay date).
function stocksEnergyBlock(r, atDate) {
  const f = r.flow;
  const n = f.numerology;
  const v = f.vietnamese;
  const vol = stocksVolatilityBadge(stocksParseDate(r.date));
  const anchorDate = stocksParseDate(r.date);
  const entitySign = getSunSign(anchorDate);
  const todaySign = getSunSign(atDate);
  const westernScore = westernCompat(entitySign, todaySign);
  return `
    <div class="stock-energy-block">
      <div class="stock-energy-title">
        <span class="stock-energy-title-main">
          <span>${escapeHtml(r.person || r.label)}</span>
          ${vol ? `<span class="stock-volatility-badge stock-volatility-${vol.tier}" title="This entity's own Life Path risk profile, independent of the bull/bear lean">${escapeHtml(vol.label)}</span>` : ''}
        </span>
        <span class="score-inline ${stocksScoreCls(f.finalScore)}">${f.finalScore}</span>
      </div>
      <div class="stock-energy-row">
        <span class="stock-energy-lab">Numbers</span>
        <span class="stock-energy-chips">
          <span class="stock-chip ${stocksNumberSignalCls(n.personalYear)}">PY ${stocksNumLabel(n.personalYear)} vs ${n.universalYear}</span>
          <span class="stock-chip ${stocksNumberSignalCls(n.personalMonth)}">PM ${stocksNumLabel(n.personalMonth)} vs ${n.universalMonth}</span>
          <span class="stock-chip ${stocksNumberSignalCls(n.personalDay)}">PD ${stocksNumLabel(n.personalDay)} vs ${escapeHtml(String(n.universalDay))}</span>
        </span>
      </div>
      <div class="stock-energy-row">
        <span class="stock-energy-lab">Zodiac</span>
        <span class="stock-energy-chips">
          <span class="stock-chip ${stocksScoreCls(v.yearScore)}">Year · ${escapeHtml(v.personalYearSign)} vs ${escapeHtml(v.universalYearSign)}${stocksScoreMark(v.yearScore)}</span>
          <span class="stock-chip ${stocksScoreCls(v.monthScore)}">Month · ${escapeHtml(v.personalMonthSign)} vs ${escapeHtml(v.universalMonthSign)}${stocksScoreMark(v.monthScore)}</span>
          <span class="stock-chip ${stocksScoreCls(v.daySignScore)}">Day · ${escapeHtml(v.personalDaySign)} vs ${escapeHtml(v.universalDaySign)}${stocksScoreMark(v.daySignScore)}</span>
        </span>
      </div>
      <div class="stock-energy-row">
        <span class="stock-energy-lab">Western</span>
        <span class="stock-energy-chips">
          <span class="stock-chip ${stocksScoreCls(westernScore)}">${escapeHtml(entitySign)} vs ${escapeHtml(todaySign)}${stocksScoreMark(westernScore)}</span>
        </span>
      </div>
      <div class="stock-energy-row">
        <span class="stock-energy-lab">Transits</span>
        <span class="stock-energy-chips">${stocksTransitChipsHtml(anchorDate, atDate)}</span>
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
  // take-profit day) use stocksLevelWindowDays - the real window this exact
  // call stays true for, not a calendar-month or zodiac-year cutoff (which
  // has nothing to do with when Personal Month/Year, Vietnamese Month/Year,
  // western, or transits actually change - see stocksLevelWindowDays).
  const today = new Date();
  const levelRows = ['year', 'month', 'day'].map((level) => {
    const v = inst.levels[level];
    if (!v) return '';
    const days = (level !== 'day' && (v.lean === 'short' || v.lean === 'long'))
      ? stocksLevelWindowDays(inst, level, v, today)
      : null;
    const stats = days ? stocksHorizonStats(inst, v, days) : null;
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
// date) - anchors never change mid-session - and stocksLevelWindowDays now
// calls it up to hundreds of times per window scan (real transit/ephemeris
// math per call, not free). Two windows for the same instrument (Year and
// Month) scan heavily overlapping date ranges, so this cache turns what
// would be thousands of redundant recomputations into a handful.
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
function stocksAnchorDayLeanAt(anchor, atDate) {
  const read = { ...anchor, primary: true, flow: computeEnergyFlow(stocksParseDate(anchor.date), atDate) };
  return stocksLevelVerdict([read], 'day', null, atDate);
}

// Which primary anchor is actually responsible for a day matching the
// window's lean - the first one (in the anchors' own order) whose OWN day
// lean agrees. This is "the pair" the exit rule then tracks on its own,
// instead of the blended verdict (which can flip because some OTHER
// anchor or zodiac reading changed, not the one that actually triggered).
function stocksTriggeringAnchor(inst, lean, date) {
  const anchors = inst.anchors.filter((a) => a.primary && a.date);
  return anchors.find((a) => stocksAnchorDayLeanAt(a, date).lean === lean.lean) || null;
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
  for (let i = 0; i < bars.length; i++) {
    const dayLean = stocksLeanAt(inst, 'day', stocksParseDate(bars[i][0]));
    if (dayLean.lean === lean.lean) return i;
  }
  return -1;
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

// First day of the current zodiac year, found with the engine's own
// boundary: walk forward from Jan 20 until the year animal flips.
function stocksZodiacYearStart(today) {
  const animal = getChineseZodiacYear(today);
  const d = new Date(today.getFullYear(), 0, 20);
  while (d <= today && getChineseZodiacYear(d) !== animal) d.setDate(d.getDate() + 1);
  return d;
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
  };
}

// The take-profit day, forward-pointed: the first date after entry whose
// own day-level lean flips to the OPPOSITE direction (not just "no longer
// agrees" - a real reversal). Same calendar-only math as the entry trigger,
// so it's just as knowable in advance; bounded to the same date list the
// window already searched, never reaching past it.
function stocksReversalDay(inst, lean, afterDate, dates) {
  const opposite = lean.lean === 'short' ? 'long' : 'short';
  return dates.find((d) => d > afterDate && stocksLeanAt(inst, 'day', d).lean === opposite) || null;
}

// Same idea, scoped to ONE anchor instead of every primary anchor blended
// together - and requiring at least a 2-calendar-day gap from entry, since
// a Personal Day number steps by about 1 most days (a 7 is very often
// followed by an 8 the very next calendar day purely from the digit
// counting up, not any real shift). Used for both the actual replay exit
// (stocksApplyExitRule) and the Upcoming section's forward-looking "TP"
// day, so the preview and the real exit use the same rule.
function stocksAnchorReversalDay(anchor, lean, afterDate, dates) {
  const opposite = lean.lean === 'short' ? 'long' : 'short';
  const minGapMs = 2 * 24 * 60 * 60 * 1000;
  return dates.find((d) => (d - afterDate) >= minGapMs && stocksAnchorDayLeanAt(anchor, d).lean === opposite) || null;
}

// The forward view: where the system says the NEXT entries are. Pure
// calendar - no prices, no API key - so it renders for everyone, first.
// Tomorrow's day lean, next month's lean with its pre-computed entry + take
// profit days, and the best remaining entry of the current zodiac year.
// First future date in `dates` whose own day-level lean agrees with the
// window's - the same trigger the replay uses, pointed forward. Shared
// between the Upcoming rows and the main-page radar (stocksNextOpportunity)
// so both use the exact same definition of "when does this confirm."
function stocksFirstConfirmingDate(inst, lean, dates) {
  return dates.find((d) => stocksLeanAt(inst, 'day', d).lean === lean.lean) || null;
}

// How many days into the future this exact level call stays true, before
// the blended signal set itself flips - the real, non-arbitrary window for
// "how long is this call good for." A calendar-month or zodiac-year cutoff
// has nothing to do with when any of the underlying cycles actually change:
// Personal Month/Year is anchored to each ANCHOR's own birth day-of-month
// (Company and the CEO don't even agree with each other), Vietnamese
// Month/Year flips on a different fixed boundary, western sun-sign on
// another, and transits on none at all. Scanning until the level's own
// blended verdict changes sidesteps all of that - it's exactly as long (or
// short) as the actual conviction behind today's call warrants: a lopsided,
// stable read naturally scans far; a borderline one flips fast.
function stocksLevelWindowDays(inst, level, lean, today, maxDays) {
  const days = [];
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  for (let i = 0; i < (maxDays || 400); i++) {
    if (stocksLeanAt(inst, level, d).lean !== lean.lean) break;
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Entry/Peak/TP preview for one lean over one forward window of dates - pure
// calendar math, no prices. Shared by the Upcoming rows and the Verdict
// section's own level rows, so "when would this actually enter/exit" reads
// the same wherever it's shown instead of two versions quietly drifting.
// Null for a neutral lean (nothing to enter) or before there IS a window
// (the day resolution has no separate take-profit day - see stocksUpcomingRows).
function stocksHorizonStats(inst, lean, days) {
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long')) return null;
  const fmtD = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const trigger = stocksFirstConfirmingDate(inst, lean, days);
  if (!trigger) return [{ label: 'Entry', value: 'No fill' }];
  const peak = stocksPeakDay(inst, lean, days);
  // Same anchor-scoped rule the actual replay exit uses (stocksApplyExitRule)
  // - so this preview and what the system would really do line up. The
  // reversal search is bounded to `days` (this window only) same as the
  // real replay - if entry lands near the end of the window there may be no
  // day left afterward to find a reversal in, which is a real result (the
  // position would just ride to the window's own end), not a bug. Said
  // explicitly ("Held to end") instead of silently dropping the TP label,
  // same as "No fill" is said explicitly rather than omitted above.
  const triggerAnchor = stocksTriggeringAnchor(inst, lean, trigger);
  const reversal = triggerAnchor ? stocksAnchorReversalDay(triggerAnchor, lean, trigger, days) : null;
  return [
    { label: 'Entry', value: fmtD(trigger) },
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

  const horizonStats = (lean, days) => stocksHorizonStats(inst, lean, days);

  // Next calendar month.
  const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthLean = stocksLeanAt(inst, 'month', new Date(nm.getFullYear(), nm.getMonth(), 15));
  const monthDays = [];
  for (let d = new Date(nm); d.getMonth() === nm.getMonth(); d.setDate(d.getDate() + 1)) monthDays.push(new Date(d));
  rows.push({ level: 'month', html: row(nm.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), monthLean, horizonStats(monthLean, monthDays)) });

  // As long as this exact Year call stays true (see stocksLevelWindowDays) -
  // not "the rest of the zodiac year," which has nothing to do with when
  // Personal Year (birthday-anchored, different per anchor) or the other
  // Year-timeframe signals actually change.
  const yearLean = stocksLeanAt(inst, 'year', today);
  const yearDays = stocksLevelWindowDays(inst, 'year', yearLean, today);
  rows.push({ level: 'year', html: row('This Year call', yearLean, horizonStats(yearLean, yearDays)) });

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

  if (!levelFilter || levelFilter === 'day') {
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const dayLean = stocksLeanAt(inst, 'day', tomorrow);
    if (dayLean.lean === 'short' || dayLean.lean === 'long') {
      candidates.push({ level: 'day', date: tomorrow, lean: dayLean });
    }
  }

  if (!levelFilter || levelFilter === 'month') {
    const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const monthLean = stocksLeanAt(inst, 'month', new Date(nm.getFullYear(), nm.getMonth(), 15));
    if (monthLean.lean === 'short' || monthLean.lean === 'long') {
      const days = [];
      for (let d = new Date(nm); d.getMonth() === nm.getMonth(); d.setDate(d.getDate() + 1)) days.push(new Date(d));
      const trigger = stocksFirstConfirmingDate(inst, monthLean, days);
      if (trigger) candidates.push({ level: 'month', date: trigger, lean: monthLean });
    }
  }

  if (!levelFilter || levelFilter === 'year') {
    const yearLean = stocksLeanAt(inst, 'year', today);
    if (yearLean.lean === 'short' || yearLean.lean === 'long') {
      const days = stocksLevelWindowDays(inst, 'year', yearLean, today);
      const trigger = stocksFirstConfirmingDate(inst, yearLean, days);
      if (trigger) candidates.push({ level: 'year', date: trigger, lean: yearLean });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.date - b.date);
  return candidates[0];
}

// Which single horizon the Radar shows - 'all' picks each instrument's
// soonest across all three levels (Day usually wins, since tomorrow is
// always sooner than any Month/Year trigger); Day/Month/Year narrows to
// just that one so the other horizons aren't permanently drowned out.
let stocksRadarLevel = 'all';

function stocksRadarLevelFilterHtml() {
  const opt = (level, label) => `<button class="stocks-filter-btn${stocksRadarLevel === level ? ' active' : ''}" data-level="${level}">${label}</button>`;
  return `<div class="stocks-filter-seg" id="stockRadarLevelFilter">${opt('all', 'All')}${opt('day', 'Day')}${opt('month', 'Month')}${opt('year', 'Year')}</div>`;
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

  // Medium: each of the last three completed months under that month's lean.
  for (let k = 1; k <= 3; k++) {
    const m = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const mISO = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    const monthBars = bars.filter((b) => b[0].startsWith(mISO));
    const monthAtDate = new Date(m.getFullYear(), m.getMonth(), 15);
    const lean = stocksLeanAt(inst, 'month', monthAtDate);
    const label = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    cards.push(...(await stocksTimedTrades(inst, label, lean, monthBars, { exitMode: stocksTradesExitMode, atDate: monthAtDate })).map((c) => ({ ...c, level: 'month' })));
  }

  // Long-term: the current zodiac-year window under the year lean.
  const yStart = stocksZodiacYearStart(today);
  const yStartISO = `${yStart.getFullYear()}-${String(yStart.getMonth() + 1).padStart(2, '0')}-${String(yStart.getDate()).padStart(2, '0')}`;
  const yearBars = bars.filter((b) => b[0] >= yStartISO);
  const yearLean = stocksLeanAt(inst, 'year', today);
  // The zodiac year runs until the next Lunar New Year - it's an OPEN
  // position, shown as ahead/behind so far, never graded as settled.
  cards.push(...(await stocksTimedTrades(inst, `Zodiac year · since ${yStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`, yearLean, yearBars, { open: true, exitMode: stocksTradesExitMode, atDate: today })).map((c) => ({ ...c, level: 'year' })));

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
// v3: entries now carry BOTH exit modes per grade (was one grade per
// mode) - old v2 data is simply superseded, not migrated.
// v4: bumped because the verdict engine now blends transits/western/cross-
// level weighting - leans computed under v3 are no longer comparable and
// must be regraded rather than mixed with new entries.
const STOCKS_COMBINED_STORE_KEY = 'numerology_stock_combined_record_v4';

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
function stocksGradeWindowTwoModes(inst, lean, bars) {
  const none = { reversal: null, end: null };
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long') || bars.length <= 1) return { calendar: none, calPrice: none };
  const ei = stocksConfirmedEntryIndex(inst, lean, bars);
  const triggerAnchor = ei >= 0 ? stocksTriggeringAnchor(inst, lean, stocksParseDate(bars[ei][0])) : null;
  const calendar = ei < 0 ? none : {
    reversal: stocksTradeCard('', lean, stocksApplyExitRule(inst, lean, bars.slice(ei), false, triggerAnchor, 'reversal').bars).grade,
    end: stocksTradeCard('', lean, stocksApplyExitRule(inst, lean, bars.slice(ei), false, triggerAnchor, 'end').bars).grade,
  };
  const pei = stocksPriceConfirmedEntryIndex(inst, lean, bars);
  const calPrice = pei < 0 ? none : {
    reversal: stocksTradeCard('', lean, stocksApplyExitRule(inst, lean, bars.slice(pei), false, triggerAnchor, 'reversal').bars).grade,
    end: stocksTradeCard('', lean, stocksApplyExitRule(inst, lean, bars.slice(pei), false, triggerAnchor, 'end').bars).grade,
  };
  return { calendar, calPrice };
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

// The 'YYYY-MM' keys currently inside the rolling month window (oldest
// first) - completed months only, this month itself isn't done yet.
function stocksRelevantMonthKeys(today) {
  const keys = [];
  for (let k = STOCKS_COMBINED_MONTHS_BACK; k >= 1; k--) {
    const m = new Date(today.getFullYear(), today.getMonth() - k, 1);
    keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// The last N completed zodiac years (the current one is still running and
// stays excluded) - found by walking the engine's own boundary backward
// one flip at a time, so there's no calendar-drift risk from approximating
// "a year" as 365 days.
function stocksCompletedZodiacYearRanges(today, count) {
  const ranges = [];
  let boundary = stocksZodiacYearStart(today);
  for (let i = 0; i < count; i++) {
    const end = new Date(boundary);
    end.setDate(end.getDate() - 1);
    const start = stocksZodiacYearStart(end);
    ranges.push({ start, end, key: `${start.getFullYear()}-${getChineseZodiacYear(start)}` });
    boundary = start;
  }
  return ranges;
}

function stocksAggregateEntries(entries, exitMode) {
  const agg = { calendar: { right: 0, wrong: 0, mixed: 0 }, calPrice: { right: 0, wrong: 0, mixed: 0 } };
  entries.forEach((e) => {
    const cal = e.calendar && e.calendar[exitMode];
    const cp = e.calPrice && e.calPrice[exitMode];
    if (cal) agg.calendar[cal]++;
    if (cp) agg.calPrice[cp]++;
  });
  return agg;
}

// Shows whichever of Calendar/Cal + Price actually performed better - one
// number, the one that's actually working, not both stacked.
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
    </div>`;
}

// Which stored horizon the box shows - session-scoped, resets to Month on
// page load, same idea as the other Day/Month/Year toggles on this page.
let stocksCombinedHorizon = 'month';
// Which exit rule the box grades by - 'reversal' (default) or 'end' (ride
// to the window's natural end). Both are pre-computed per entry, so this
// switches instantly with no re-fetch.
let stocksCombinedExitMode = 'reversal';

function stocksCombinedHorizonFilterHtml() {
  const opt = (h, label) => `<button class="stocks-filter-btn${stocksCombinedHorizon === h ? ' active' : ''}" data-horizon="${h}">${label}</button>`;
  return `<div class="stocks-filter-seg" id="stockCombinedHorizonFilter">${opt('month', 'Month')}${opt('year', 'Year')}</div>`;
}

function stocksCombinedExitFilterHtml() {
  const opt = (m, label) => `<button class="stocks-filter-btn${stocksCombinedExitMode === m ? ' active' : ''}" data-exit="${m}">${label}</button>`;
  return `<div class="stocks-filter-seg" id="stockCombinedExitFilter">${opt('reversal', 'Reversal')}${opt('end', 'Full Term')}</div>`;
}

// Starts closed like every other group/dropdown on this page - a glance at
// the ticker/day pill is the default view, the record itself is a tap away.
let stocksCombinedCollapsed = true;

function renderStocksCombinedRecordBody(box, store) {
  const entries = stocksCombinedHorizon === 'year' ? store.yearEntries : store.monthEntries;
  const windowLabel = stocksCombinedHorizon === 'year' ? `last ${STOCKS_COMBINED_YEARS_BACK} zodiac years` : `last ${STOCKS_COMBINED_MONTHS_BACK} months`;
  const exitLabel = stocksCombinedExitMode === 'end' ? 'holding to the window’s end' : 'exiting at the reversal signal';
  box.innerHTML = `
    <div class="stock-group${stocksCombinedCollapsed ? ' collapsed' : ''}" id="stockCombinedGroup">
      <div class="stock-group-head">
        <span>Combined Track Record</span>
        <span class="stock-group-chev">▾</span>
      </div>
      <div class="stock-group-grid">
        ${stocksCombinedHorizonFilterHtml()}
        ${stocksCombinedExitFilterHtml()}
        <div class="stock-trades-note">Every completed ${stocksCombinedHorizon}, ${windowLabel}, all 16 instruments, ${exitLabel}. Updates only when a new one completes.</div>
        ${stocksBestModeLine(stocksAggregateEntries(entries, stocksCombinedExitMode))}
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
    });
  });
}

// Only grades what's actually new: diffs the current rolling windows
// against what's already stored, and if nothing has completed since last
// time, renders straight from the ledger with zero fetches. When something
// has completed, fetches each instrument's (cached-per-day) history once,
// grades just the new month(s)/year(s), prunes anything that's rolled out
// of the window, and persists the result.
async function stocksLoadCombinedRecord(instruments, today) {
  const box = document.getElementById('stocksCombinedRecord');
  if (!box) return;
  const key = localStorage.getItem(STOCKS_TD_KEY);
  if (!key) {
    box.innerHTML = `<div class="stock-trades-note">Needs the same Twelve Data API key as Trades/Day Cycles - open any instrument's Trades panel once to save one, then reload this page.</div>`;
    return;
  }

  const store = stocksLoadCombinedStore();
  const relevantMonthKeys = stocksRelevantMonthKeys(today);
  const relevantYearRanges = stocksCompletedZodiacYearRanges(today, STOCKS_COMBINED_YEARS_BACK);
  const gradedMonthKeys = new Set(store.monthEntries.map((e) => e.month));
  const gradedYearKeys = new Set(store.yearEntries.map((e) => e.year));
  const newMonthKeys = relevantMonthKeys.filter((k) => !gradedMonthKeys.has(k));
  const newYearRanges = relevantYearRanges.filter((r) => !gradedYearKeys.has(r.key));

  if (!newMonthKeys.length && !newYearRanges.length) {
    renderStocksCombinedRecordBody(box, store); // fully up to date - no fetches, no recompute
    return;
  }

  let processed = 0;
  for (const inst of instruments) {
    box.innerHTML = `<div class="stock-trades-note">Updating track record - ${processed}/${instruments.length} instruments…</div>`;
    const wasCached = stocksCyclesCacheHit(inst.px.symbol);
    try {
      const bars = await stocksFetchSeries(inst.px.symbol, { outputsize: STOCKS_CYCLES_OUTPUTSIZE, cacheKey: STOCKS_CYCLES_PX_CACHE_KEY });
      newMonthKeys.forEach((monthKey) => {
        const [y, m] = monthKey.split('-').map(Number);
        const monthBars = bars.filter((b) => b[0].startsWith(monthKey));
        if (!monthBars.length) return;
        const lean = stocksLeanAt(inst, 'month', new Date(y, m - 1, 15));
        const { calendar, calPrice } = stocksGradeWindowTwoModes(inst, lean, monthBars);
        store.monthEntries.push({ month: monthKey, ticker: inst.ticker, calendar, calPrice });
      });
      newYearRanges.forEach((range) => {
        const startISO = stocksDateToISO(range.start);
        const endISO = stocksDateToISO(range.end);
        const yearBars = bars.filter((b) => b[0] >= startISO && b[0] <= endISO);
        if (!yearBars.length) return;
        const mid = new Date((range.start.getTime() + range.end.getTime()) / 2);
        const lean = stocksLeanAt(inst, 'year', mid);
        const { calendar, calPrice } = stocksGradeWindowTwoModes(inst, lean, yearBars);
        store.yearEntries.push({ year: range.key, ticker: inst.ticker, calendar, calPrice });
      });
    } catch (e) { /* one bad symbol or a rate-limit hiccup shouldn't block the rest */ }
    processed++;
    if (!wasCached) await stocksDelay(STOCKS_COMBINED_FETCH_GAP_MS);
  }

  const relevantMonthSet = new Set(relevantMonthKeys);
  const relevantYearSet = new Set(relevantYearRanges.map((r) => r.key));
  store.monthEntries = store.monthEntries.filter((e) => relevantMonthSet.has(e.month));
  store.yearEntries = store.yearEntries.filter((e) => relevantYearSet.has(e.year));
  stocksSaveCombinedStore(store);
  renderStocksCombinedRecordBody(box, store);
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

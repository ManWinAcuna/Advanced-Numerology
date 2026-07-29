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
      // Only the launch YEAR is reliably documented - so only the zodiac
      // year is read. No invented month/day (see HONEST SCOPE above).
      { key: 'launch', label: 'COMEX Launch', year: 1963, primary: true },
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

// A number with one of the owner's meanings shows it everywhere it appears.
function stocksNumLabel(n) {
  const m = STOCKS_NUMBER_MEANINGS[n];
  return m ? `${n} · ${m.label}` : String(n);
}

/* ===================== Year / Month / Day verdicts ===================== */
// The same rule at every level, fed by that level's own signals. Bear
// signals win: a zodiac clash (table score 10) or a 7-weakness cycle number
// -> short lean. Then bull: a zodiac ally (85+) or an 8/28 cycle -> long
// lean (with a swings note if an 11 rides along). An 11 alone -> sporadic.
// Year uses PY + year animals, month uses PM + month signs, day uses PD +
// day signs - "more than just the year", both systems, as instructed.

function stocksLevelSignals(read, level) {
  if (!read.flow) return null;
  const f = read.flow;
  if (level === 'year') {
    return {
      num: f.numerology.personalYear, numName: 'PY',
      signScore: f.vietnamese.yearScore,
      mySign: f.vietnamese.personalYearSign, nowSign: f.vietnamese.universalYearSign, signWord: 'year',
    };
  }
  if (level === 'month') {
    return {
      num: f.numerology.personalMonth, numName: 'PM',
      signScore: f.vietnamese.monthScore,
      mySign: f.vietnamese.personalMonthSign, nowSign: f.vietnamese.universalMonthSign, signWord: 'month sign',
    };
  }
  return {
    num: f.numerology.personalDay, numName: 'PD',
    signScore: f.vietnamese.daySignScore,
    mySign: f.vietnamese.personalDaySign, nowSign: f.vietnamese.universalDaySign, signWord: 'day sign',
  };
}

function stocksLevelVerdict(reads, level) {
  const who = (r) => r.person || r.label;
  const bears = [];
  const bulls = [];
  reads.filter((r) => r.primary).forEach((r) => {
    const s = stocksLevelSignals(r, level);
    if (!s) return;
    const meaning = STOCKS_NUMBER_MEANINGS[s.num];
    if (s.signScore <= 10) bears.push(`${who(r)}'s ${s.mySign} clashes the ${s.nowSign} ${s.signWord}`);
    if (meaning && meaning.dir === 'bear') bears.push(`${who(r)} runs a ${s.numName} ${s.num} ${meaning.label.toLowerCase()}`);
    if (s.signScore >= 85) bulls.push(`${who(r)}'s ${s.mySign} allies the ${s.nowSign} ${s.signWord}`);
    if (meaning && meaning.dir === 'bull') bulls.push(`${who(r)} runs a ${s.numName} ${s.num} ${meaning.label.toLowerCase()}`);
  });

  if (bears.length) return { lean: 'short', label: 'Short Lean', why: bears.join('; ') };
  if (bulls.length) return { lean: 'long', label: 'Long Lean', why: bulls.join('; ') };
  return { lean: 'neutral', label: 'Neutral', why: 'no signals at this level' };
}

// The year-level watch verdict that drives the grid pill - same precedence,
// worded as the watchlist item (this is what sorts the board).
function stocksVerdict(reads) {
  const primary = reads.filter((r) => r.primary);
  const who = (r) => r.person || r.label;
  const enemies = primary.filter((r) => r.relation === 'enemy');
  const weak = primary.filter((r) => r.cycle && r.cycle.dir === 'bear');
  const strong = primary.filter((r) => r.cycle && r.cycle.dir === 'bull');
  const allies = primary.filter((r) => r.relation === 'ally');

  if (enemies.length || weak.length) {
    const parts = [
      ...enemies.map((r) => `${who(r)}'s ${r.animal} runs its enemy year`),
      ...weak.map((r) => `${who(r)} sits in a Personal Year ${r.personalYear} ${r.cycle.label.toLowerCase()} cycle`),
    ];
    return { watch: 'short', label: 'High Short Watch', text: `${parts.join('; ')}.` };
  }
  if (allies.length || strong.length) {
    const parts = [
      ...allies.map((r) => `${who(r)}'s ${r.animal} runs an ally year`),
      ...strong.map((r) => `${who(r)} runs a Personal Year ${r.personalYear} ${r.cycle.label.toLowerCase()} cycle`),
    ];
    return { watch: 'long', label: 'Long Watch', text: `${parts.join('; ')}.` };
  }
  return { watch: 'neutral', label: 'Neutral', text: 'No year-level signals on the primary anchors.' };
}

function stocksInstrumentRead(inst, today, todayAnimal) {
  const reads = inst.anchors.map((a) => stocksAnchorRead(a, today, todayAnimal));
  return {
    ...inst,
    reads,
    verdict: stocksVerdict(reads),
    levels: {
      year: stocksLevelVerdict(reads, 'year'),
      month: stocksLevelVerdict(reads, 'month'),
      day: stocksLevelVerdict(reads, 'day'),
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

function stocksWatchPill(verdict) {
  return `<span class="stock-watch ${verdict.watch}">${verdict.watch === 'short' ? '<span class="stock-dot"></span>' : ''}${escapeHtml(verdict.label)}</span>`;
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
const stocksCollapsedGroups = new Set();
let stocksAllInstruments = [];

function stocksCardHtml(inst) {
  // Zodiac chips first, cycle chips after - two consistent groups so every
  // card scans the same way.
  const primary = inst.reads.filter((r) => r.primary);
  const chips = [
    ...primary.map((r) => `<span class="stock-chip ${STOCKS_RELATION_CHIP[r.relation].cls}">${escapeHtml(r.animal)}</span>`),
    ...primary.filter((r) => r.cycle).map((r) => `<span class="stock-chip ${STOCKS_CYCLE_CLS[r.cycle.dir]}">PY ${r.personalYear} · ${escapeHtml(r.cycle.label)}</span>`),
  ].join('');
  return `
    <div class="stock-card" data-ticker="${escapeHtml(inst.ticker)}">
      <div class="stock-card-head">
        ${stocksMonogram(inst, false)}
        <div class="stock-card-title">
          <div class="stock-card-ticker">${escapeHtml(inst.ticker)}</div>
          <div class="stock-card-name">${escapeHtml(inst.name)}</div>
        </div>
        ${stocksWatchPill(inst.verdict)}
      </div>
      <div class="stock-card-chips">${chips}</div>
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

// One anchor's deep today block: PY/PM/PD against the Universal numbers and
// birth year/month/day signs against today's three signs, every pair marked
// in words when it clashes (table 10) or boosts (85+) - color carries the
// rest, no icon noise.
function stocksEnergyBlock(r) {
  const f = r.flow;
  const n = f.numerology;
  const v = f.vietnamese;
  return `
    <div class="stock-energy-block">
      <div class="stock-energy-title"><span>${escapeHtml(r.person || r.label)}</span><span class="score-inline ${stocksScoreCls(f.finalScore)}">${f.finalScore}</span></div>
      <div class="stock-energy-row">
        <span class="stock-energy-lab">Numbers</span>
        <span class="stock-energy-chips">
          <span class="stock-chip ${stocksScoreCls(n.yearScore)}">PY ${stocksNumLabel(n.personalYear)} vs ${n.universalYear}${stocksScoreMark(n.yearScore)}</span>
          <span class="stock-chip ${stocksScoreCls(n.monthScore)}">PM ${stocksNumLabel(n.personalMonth)} vs ${n.universalMonth}${stocksScoreMark(n.monthScore)}</span>
          <span class="stock-chip ${stocksScoreCls(n.dayScore)}">PD ${stocksNumLabel(n.personalDay)} vs ${escapeHtml(String(n.universalDay))}${stocksScoreMark(n.dayScore)}</span>
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
    </div>`;
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
  const levelRows = ['year', 'month', 'day'].map((level) => {
    const v = inst.levels[level];
    if (!v) return '';
    const pillCls = v.lean === 'short' ? 'short' : v.lean === 'long' ? 'long' : v.lean === 'caution' ? 'caution' : 'neutral';
    return `
      <div class="stock-verdict-row">
        <span class="stock-verdict-term">${level.toUpperCase()}</span>
        <span class="stock-watch ${pillCls}">${escapeHtml(v.label)}</span>
        <span class="stock-verdict-why">${escapeHtml(v.why)}</span>
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
      <div class="stock-modal-badges">${stocksWatchPill(inst.verdict)}${badges}</div>
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
    ${flows.map(stocksEnergyBlock).join('')}`;

  document.getElementById('stockTradesBtn').addEventListener('click', () => renderStockTrades(inst));
  if (inst.kind === 'futures') {
    document.getElementById('stockCyclesBtn').addEventListener('click', () => renderStockDayCycles(inst));
  }
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
function stocksLeanAt(inst, level, atDate) {
  const reads = inst.anchors
    .filter((a) => a.primary && a.date)
    .map((a) => ({ ...a, primary: true, flow: computeEnergyFlow(stocksParseDate(a.date), atDate) }));
  return stocksLevelVerdict(reads, level);
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

// One trade, one card, told from the TRADE's point of view - and graded on
// the WHOLE PATH, not just the endpoints. Endpoint grading is path-blind: a
// short that was in profit all month gets called wrong because of one
// last-session rebound. So a multi-day call is graded by how much of its
// window the trade spent in profit vs the entry (60%+ of days = RIGHT, 40%
// or less = WRONG, in between = MIXED), and every card also shows the best
// exit the window offered and what holding to the end actually returned -
// the endpoint number stays as a fact, it just no longer gets to be the
// judge. A one-session call has no path, so it stays a plain WIN/LOSS.
// Multi-day windows route through here: pick the system's entry day first
// (stocksEntryBarIndex), trade from there to the window's end, and say so
// on the card. Neutral/sporadic windows fall straight through untimed.
// Every directional multi-day window produces THREE entry-mode cards, so
// their records can be compared on identical windows: 'Calendar' (enter at
// the first energy-confirming day's open), 'Cal + Price' (energy trigger,
// then the first agreeing close, entry next open), and 'Intraday' (same
// energy-confirmed day as Calendar, but zoomed into that day's 15m chart for
// a precise CISD/IFVG trigger instead of blindly buying the open).
async function stocksTimedTrades(inst, label, lean, bars, opts) {
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long') || bars.length <= 1) {
    return [stocksTradeCard(label, lean, bars, inst.px.symbol, '', opts)];
  }
  const fmtD = (iso) => stocksParseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtT = (iso) => iso.slice(11, 16);
  const fmtPx = (x) => (x >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(2));
  const noFill = (mode, why) => ({
    html: `
      <div class="stock-trade-card skip">
        <div class="stock-trade-top">
          <span class="stock-trade-window">${escapeHtml(label)}</span>
          <span class="stock-trade-chips"><span class="stock-chip">${escapeHtml(mode)}</span><span class="stock-chip">No fill</span></span>
        </div>
        <div class="stock-trade-story">${escapeHtml(lean.why)}. ${escapeHtml(why)}</div>
      </div>`,
    grade: null,
    mode,
    nofill: true,
  });

  const cards = [];
  const pi = stocksPeakBarIndex(inst, lean, bars);
  const peakNote = `peak ${lean.lean === 'short' ? 'weakness' : 'strength'} day: ${fmtD(bars[pi][0])}`;

  // Mode 1: calendar only.
  const ei = stocksConfirmedEntryIndex(inst, lean, bars);
  if (ei < 0) {
    cards.push(noFill('Calendar', `The ${lean.lean} lean never got a daily energy confirmation - no trade taken.`));
  } else {
    const note = `Entered ${fmtD(bars[ei][0])} - first daily confirmation of the ${lean.lean} lean (${peakNote}).`;
    cards.push({ ...stocksTradeCard(label, lean, bars.slice(ei), inst.px.symbol, note, { ...opts, mode: 'Calendar' }), mode: 'Calendar' });
  }

  // Mode 2: calendar + price.
  const pei = stocksPriceConfirmedEntryIndex(inst, lean, bars);
  if (pei < 0) {
    cards.push(noFill('Cal + Price', ei < 0
      ? 'No energy confirmation, so price was never consulted - no trade taken.'
      : `Price never closed ${lean.lean === 'short' ? 'red' : 'green'} after the energy trigger - no trade taken.`));
  } else {
    const note = `Energy trigger ${fmtD(bars[ei][0])}; first ${lean.lean === 'short' ? 'red' : 'green'} close ${fmtD(bars[pei - 1][0])}; entered next open ${fmtD(bars[pei][0])} (${peakNote}).`;
    cards.push({ ...stocksTradeCard(label, lean, bars.slice(pei), inst.px.symbol, note, { ...opts, mode: 'Cal + Price' }), mode: 'Cal + Price' });
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
        const note = `Energy trigger ${fmtD(dayISO)}; 15m ${which} confirmed ${fmtT(ibars[ti][0])}; entered ${fmtT(entryBar[0])} at ${fmtPx(entryBar[1])} (${peakNote}).`;
        cards.push({ ...stocksTradeCard(label, lean, windowBars, inst.px.symbol, note, { ...opts, mode: 'Intraday' }), mode: 'Intraday' });
      }
    }
  }

  return cards;
}

function stocksTradeCard(windowLabel, lean, windowBars, symbol, entryNote, opts) {
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
  const moved = flat ? 'closed flat' : `${movePct > 0 ? 'rose' : 'fell'} ${Math.abs(movePct).toFixed(1)}%`;
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
          <span>take profit <span class="score-inline ${bestClose.f > 0 ? 'good' : 'bad'}">${bestClose.f > 0 ? '+' : ''}${bestClose.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(bestClose.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>
          <span>peak <span class="score-inline ${best.f > 0 ? 'good' : 'bad'}">${best.f > 0 ? '+' : ''}${best.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(best.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>
          <span>worst <span class="score-inline ${worst.f < 0 ? 'bad' : 'good'}">${worst.f > 0 ? '+' : ''}${worst.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(worst.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>
        </div>`;

  return {
    html: `
      <div class="stock-trade-card ${cardCls}">
        <div class="stock-trade-top">
          <span class="stock-trade-window">${escapeHtml(windowLabel)}</span>
          <span class="stock-trade-chips">
            ${opts && opts.mode ? `<span class="stock-chip">${escapeHtml(opts.mode)}</span>` : ''}
            <span class="stock-chip">${lean.lean === 'short' ? 'Short' : 'Long'}</span>
            <span class="stock-badge ${badgeCls}">${badge}</span>
          </span>
        </div>
        <div class="stock-trade-story">${escapeHtml(lean.why)}.${entryNote ? ` ${escapeHtml(entryNote)}` : ''} ${escapeHtml(symbol)} ${moved}${isOpen ? ' so far' : ''}.</div>
        <div class="stock-trade-nums">
          <span>${fmt(entry)} → ${fmt(exit)}</span>
          <span class="score-inline ${held > 0 ? 'good' : 'bad'}">${isOpen ? 'running' : 'held to end'} ${held > 0 ? '+' : ''}${held.toFixed(1)}%</span>
        </div>${pathRow}
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

// The forward view: where the system says the NEXT entries are. Pure
// calendar - no prices, no API key - so it renders for everyone, first.
// Tomorrow's day lean, next month's lean with its pre-computed entry + take
// profit days, and the best remaining entry of the current zodiac year.
// Returns rows tagged with a level so the Trades panel filter can narrow to
// just one horizon.
function stocksUpcomingRows(inst) {
  const today = new Date();
  const fmtD = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const rows = [];

  const pill = (lean) => {
    const cls = lean.lean === 'short' ? 'short' : lean.lean === 'long' ? 'long' : lean.lean === 'caution' ? 'caution' : 'neutral';
    return `<span class="stock-watch ${cls}">${escapeHtml(lean.label)}</span>`;
  };
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

  // First future date in `dates` whose own day-level lean agrees with the
  // window's - the same trigger the replay uses, pointed forward.
  const firstConfirming = (lean, dates) => dates.find((d) => stocksLeanAt(inst, 'day', d).lean === lean.lean) || null;

  const horizonStats = (lean, days) => {
    if (lean.lean !== 'short' && lean.lean !== 'long') return null;
    const trigger = firstConfirming(lean, days);
    if (!trigger) return [{ label: 'Entry', value: 'No fill' }];
    const peak = stocksPeakDay(inst, lean, days);
    const reversal = stocksReversalDay(inst, lean, trigger, days);
    return [
      { label: 'Entry', value: fmtD(trigger) },
      ...(peak ? [{ label: 'Peak', value: fmtD(peak) }] : []),
      ...(reversal ? [{ label: 'TP', value: fmtD(reversal) }] : []),
    ];
  };

  // Next calendar month.
  const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthLean = stocksLeanAt(inst, 'month', new Date(nm.getFullYear(), nm.getMonth(), 15));
  const monthDays = [];
  for (let d = new Date(nm); d.getMonth() === nm.getMonth(); d.setDate(d.getDate() + 1)) monthDays.push(new Date(d));
  rows.push({ level: 'month', html: row(nm.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), monthLean, horizonStats(monthLean, monthDays)) });

  // Rest of the current zodiac year.
  const yearLean = stocksLeanAt(inst, 'year', today);
  const yearDays = [];
  const animal = getChineseZodiacYear(today);
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  for (let i = 0; i < 400 && getChineseZodiacYear(d) === animal; i++) {
    yearDays.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  rows.push({ level: 'year', html: row('Rest of the zodiac year', yearLean, horizonStats(yearLean, yearDays)) });

  return rows;
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
    const dayLean = stocksLeanAt(inst, 'day', stocksParseDate(lastBar[0]));
    const dayLabel = stocksParseDate(lastBar[0]).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    cards.push({ ...stocksTradeCard(dayLabel, dayLean, [lastBar], inst.px.symbol), level: 'day' });
  }

  // Medium: each of the last three completed months under that month's lean.
  for (let k = 1; k <= 3; k++) {
    const m = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const mISO = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    const monthBars = bars.filter((b) => b[0].startsWith(mISO));
    const lean = stocksLeanAt(inst, 'month', new Date(m.getFullYear(), m.getMonth(), 15));
    const label = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    cards.push(...(await stocksTimedTrades(inst, label, lean, monthBars)).map((c) => ({ ...c, level: 'month' })));
  }

  // Long-term: the current zodiac-year window under the year lean.
  const yStart = stocksZodiacYearStart(today);
  const yStartISO = `${yStart.getFullYear()}-${String(yStart.getMonth() + 1).padStart(2, '0')}-${String(yStart.getDate()).padStart(2, '0')}`;
  const yearBars = bars.filter((b) => b[0] >= yStartISO);
  const yearLean = stocksLeanAt(inst, 'year', today);
  // The zodiac year runs until the next Lunar New Year - it's an OPEN
  // position, shown as ahead/behind so far, never graded as settled.
  cards.push(...(await stocksTimedTrades(inst, `Zodiac year · since ${yStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, yearLean, yearBars, { open: true })).map((c) => ({ ...c, level: 'year' })));

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

  panel.innerHTML = `${levelFilter}${upcoming}
    <div class="stock-trades-box">
      <div class="stock-trades-note">Replayed on real ${escapeHtml(inst.px.symbol)} prices${inst.px.note ? ` (${escapeHtml(inst.px.note)})` : ''}.</div>
      ${modeToggle}
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
  stocksWireTradesLevelFilter(inst);
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

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

// Number meanings in the owner's own system (stated 2026-07-29): 7 =
// weakness, 8 = strength, 28 = expansion, 11 = emotional / sporadic. These
// four drive the cycle reads - 7 leans short, 8 and 28 lean long, 11 flags
// volatility without a direction. Numbers he hasn't defined stay unflagged
// rather than guessed at, and the number is always shown next to its label
// so the rule stays inspectable on every card.
const STOCKS_NUMBER_MEANINGS = {
  7: { label: 'Weakness', dir: 'bear' },
  8: { label: 'Strength', dir: 'bull' },
  28: { label: 'Expansion', dir: 'bull' },
  11: { label: 'Emotional · Sporadic', dir: 'volatile' },
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
  const personalYear = reduceNumber(personalYearRawForYear(d, getActiveBirthYear(d, today)));
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
  const swings = [];
  reads.filter((r) => r.primary).forEach((r) => {
    const s = stocksLevelSignals(r, level);
    if (!s) return;
    const meaning = STOCKS_NUMBER_MEANINGS[s.num];
    if (s.signScore <= 10) bears.push(`${who(r)}'s ${s.mySign} clashes the ${s.nowSign} ${s.signWord}`);
    if (meaning && meaning.dir === 'bear') bears.push(`${who(r)} runs a ${s.numName} ${s.num} weakness`);
    if (s.signScore >= 85) bulls.push(`${who(r)}'s ${s.mySign} allies the ${s.nowSign} ${s.signWord}`);
    if (meaning && meaning.dir === 'bull') bulls.push(`${who(r)} runs a ${s.numName} ${s.num} ${meaning.label.toLowerCase()}`);
    if (meaning && meaning.dir === 'volatile') swings.push(`${who(r)} runs a ${s.numName} 11 - sporadic`);
  });

  if (bears.length) return { lean: 'short', label: 'Short Lean', why: bears.join('; ') };
  if (bulls.length) return { lean: 'long', label: 'Long Lean', why: bulls.join('; ') + (swings.length ? `; ${swings.join('; ')}` : '') };
  if (swings.length) return { lean: 'caution', label: 'Sporadic', why: swings.join('; ') };
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
  const sporadic = primary.filter((r) => r.cycle && r.cycle.dir === 'volatile');
  const allies = primary.filter((r) => r.relation === 'ally');

  if (enemies.length || weak.length) {
    const parts = [
      ...enemies.map((r) => `${who(r)}'s ${r.animal} runs its enemy year`),
      ...weak.map((r) => `${who(r)} sits in a Personal Year ${r.personalYear} weakness cycle`),
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
  if (sporadic.length) {
    return { watch: 'caution', label: 'Sporadic Year', text: `${sporadic.map((r) => `${who(r)} runs a Personal Year 11 - emotional, sporadic energy`).join('; ')}.` };
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

const STOCKS_RELATION_CHIP = {
  enemy: { cls: 'bad', text: 'Enemy Year' },
  ally: { cls: 'good', text: 'Ally Year' },
  neutral: { cls: '', text: 'Neutral' },
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
    ...primary.map((r) => {
      const chip = STOCKS_RELATION_CHIP[r.relation];
      return `<span class="stock-chip ${chip.cls}">${escapeHtml(r.animal)}${r.relation !== 'neutral' ? ` · ${chip.text}` : ''}</span>`;
    }),
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

function openStockModal(inst) {
  const overlay = document.getElementById('stockModalOverlay');
  const ceo = inst.reads.find((r) => r.key === 'ceo');
  const headline = ceo ? ceo.person : inst.name;
  const badges = inst.reads.flatMap(stocksAnchorFlagBadges).join('');

  const anchorCards = inst.reads.map((r) => `
    <div class="stock-anchor-card${r.primary ? ' primary' : ''}">
      <div class="stock-anchor-label">${escapeHtml(r.label)}</div>
      <div class="stock-anchor-number">${r.lifePath != null ? escapeHtml(String(r.lifePath)) : escapeHtml(r.animal)}</div>
      <div class="stock-anchor-sub">${r.lifePath != null ? `Life Path${r.lifePathMeaning ? ' · ' + escapeHtml(r.lifePathMeaning.label) : ''}` : 'Zodiac only'}</div>
      <div class="stock-anchor-date">${escapeHtml(r.dateDisplay)}</div>
      <div class="stock-anchor-zodiac">
        <span class="stock-chip ${STOCKS_RELATION_CHIP[r.relation].cls}">${escapeHtml(r.animal)}${r.relation !== 'neutral' ? ` · ${STOCKS_RELATION_CHIP[r.relation].text}` : ''}</span>
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
    </div>
    <div id="stockTradesPanel"></div>
    <div class="stock-section-label">Verdict</div>
    <div class="stock-verdict-rows">${levelRows}</div>
    <div class="stock-section-label">Anchors</div>
    <div class="stock-anchor-row" style="grid-template-columns:repeat(${inst.reads.length},1fr);">${anchorCards}</div>
    ${uni ? `<div class="stock-section-label">Today's Energies</div>` : ''}
    ${uniLine}
    ${flows.map(stocksEnergyBlock).join('')}`;

  document.getElementById('stockTradesBtn').addEventListener('click', () => renderStockTrades(inst));
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

async function stocksFetchSeries(symbol) {
  const todayISO = new Date().toISOString().slice(0, 10);
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(STOCKS_PX_CACHE_KEY)) || {}; } catch (e) { cache = {}; }
  const hit = cache[symbol];
  if (hit && hit.fetched === todayISO) return hit.bars;

  const key = localStorage.getItem(STOCKS_TD_KEY);
  const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=260&apikey=${encodeURIComponent(key)}`);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.values)) {
    throw new Error(data.message || 'price feed unavailable');
  }
  // Twelve Data returns newest first; store oldest-first [date, open, high, low, close].
  const bars = data.values.map((v) => [v.datetime, Number(v.open), Number(v.high), Number(v.low), Number(v.close)]).reverse();
  cache[symbol] = { fetched: todayISO, bars };
  try { localStorage.setItem(STOCKS_PX_CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* cache full - live fetch still worked */ }
  return bars;
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
function stocksEntryBarIndex(inst, lean, bars) {
  if (bars.length <= 1) return 0;
  const anchorDates = inst.anchors.filter((a) => a.primary && a.date).map((a) => stocksParseDate(a.date));
  if (!anchorDates.length) return 0;
  let bestI = 0;
  let best = null;
  bars.forEach((b, i) => {
    const d = stocksParseDate(b[0]);
    const avg = anchorDates.reduce((s, ad) => s + computeEnergyFlow(ad, d).finalScore, 0) / anchorDates.length;
    const signal = lean.lean === 'short' ? -avg : avg; // deepest weakness / peak strength
    if (best == null || signal > best) { best = signal; bestI = i; }
  });
  return bestI;
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
function stocksTimedTrade(inst, label, lean, bars, opts) {
  if (!lean || (lean.lean !== 'short' && lean.lean !== 'long') || bars.length <= 1) {
    return stocksTradeCard(label, lean, bars, inst.px.symbol, '', opts);
  }
  const ei = stocksEntryBarIndex(inst, lean, bars);
  const eDate = stocksParseDate(bars[ei][0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const note = `Entered ${eDate} - the window's ${lean.lean === 'short' ? 'weakest' : 'strongest'} energy day.`;
  return stocksTradeCard(label, lean, bars.slice(ei), inst.px.symbol, note, opts);
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
          <span>best exit <span class="score-inline ${best.f > 0 ? 'good' : 'bad'}">${best.f > 0 ? '+' : ''}${best.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(best.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>
          <span>worst <span class="score-inline ${worst.f < 0 ? 'bad' : 'good'}">${worst.f > 0 ? '+' : ''}${worst.f.toFixed(1)}%</span> · ${escapeHtml(stocksParseDate(worst.d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>
        </div>`;

  return {
    html: `
      <div class="stock-trade-card ${cardCls}">
        <div class="stock-trade-top">
          <span class="stock-trade-window">${escapeHtml(windowLabel)}</span>
          <span class="stock-trade-chips">
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

async function renderStockTrades(inst) {
  const panel = document.getElementById('stockTradesPanel');
  const key = localStorage.getItem(STOCKS_TD_KEY);
  if (!key) {
    panel.innerHTML = `
      <div class="stock-trades-box">
        <div class="stock-trades-note">Live prices need a free Twelve Data API key (twelvedata.com, free tier) - pasted once, kept only on this device.</div>
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
    return;
  }

  panel.innerHTML = `<div class="stock-trades-box"><div class="stock-trades-note">Loading ${escapeHtml(inst.px.symbol)} prices…</div></div>`;
  let bars;
  try {
    bars = await stocksFetchSeries(inst.px.symbol);
  } catch (err) {
    panel.innerHTML = `
      <div class="stock-trades-box">
        <div class="stock-trades-note bad">Price feed error: ${escapeHtml(err.message || 'unknown')}.</div>
        <div class="stock-trades-keyrow"><button id="stockTdKeyReset">Change API key</button></div>
      </div>`;
    document.getElementById('stockTdKeyReset').addEventListener('click', () => {
      localStorage.removeItem(STOCKS_TD_KEY);
      renderStockTrades(inst);
    });
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
    cards.push(stocksTradeCard(dayLabel, dayLean, [lastBar], inst.px.symbol));
  }

  // Medium: each of the last three completed months under that month's lean.
  for (let k = 1; k <= 3; k++) {
    const m = new Date(today.getFullYear(), today.getMonth() - k, 1);
    const mISO = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    const monthBars = bars.filter((b) => b[0].startsWith(mISO));
    const lean = stocksLeanAt(inst, 'month', new Date(m.getFullYear(), m.getMonth(), 15));
    const label = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    cards.push(stocksTimedTrade(inst, label, lean, monthBars));
  }

  // Long-term: the current zodiac-year window under the year lean.
  const yStart = stocksZodiacYearStart(today);
  const yStartISO = `${yStart.getFullYear()}-${String(yStart.getMonth() + 1).padStart(2, '0')}-${String(yStart.getDate()).padStart(2, '0')}`;
  const yearBars = bars.filter((b) => b[0] >= yStartISO);
  const yearLean = stocksLeanAt(inst, 'year', today);
  // The zodiac year runs until the next Lunar New Year - it's an OPEN
  // position, shown as ahead/behind so far, never graded as settled.
  cards.push(stocksTimedTrade(inst, `Zodiac year · since ${yStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, yearLean, yearBars, { open: true }));

  // Record over the calls that actually traded - stated up front so the
  // reader never has to count for themselves.
  const graded = cards.filter((c) => c.grade != null && c.grade !== 'open');
  const openCount = cards.filter((c) => c.grade === 'open').length;
  const right = graded.filter((c) => c.grade === 'right').length;
  const wrong = graded.filter((c) => c.grade === 'wrong').length;
  const mixed = graded.filter((c) => c.grade === 'mixed').length;
  const recordCls = right > wrong ? 'good' : wrong > right ? 'bad' : '';
  const summary = (graded.length || openCount)
    ? `<div class="stock-trades-summary">Record on settled calls: <span class="score-inline ${recordCls}">${right} right · ${wrong} wrong${mixed ? ` · ${mixed} mixed` : ''}</span>${openCount ? ` · ${openCount} still open` : ''}</div>`
    : `<div class="stock-trades-summary">No tradeable calls in these windows.</div>`;

  panel.innerHTML = `
    <div class="stock-trades-box">
      <div class="stock-trades-note">The system's recent calls, replayed on real ${escapeHtml(inst.px.symbol)} prices${inst.px.note ? ` (${escapeHtml(inst.px.note)})` : ''}. Each call uses the numbers as they stood in its own window; entries land on the window's peak-signal energy day (pure calendar math - knowable before the window opened, never price-picked); and multi-day calls are graded on the whole path from entry, not just where the last print landed.</div>
      ${summary}
      ${cards.map((c) => c.html).join('')}
    </div>`;
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

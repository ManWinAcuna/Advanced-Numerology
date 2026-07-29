// Stock Cycles - the numerology engine pointed at markets instead of matchups.
// Every instrument is a set of dated anchors (company founding, IPO, CEO
// birthdate; contract launch and index birth for futures), each read exactly
// like a person elsewhere in the app: life path from numerology.js, zodiac
// year animal from getChineseZodiacYear, this year's animal relationship from
// the same VIETNAMESE_TABLE the sports engine scores with (clash pairs sit at
// 10, trine allies at 85+), and the anchor's own Personal Year cycle.
//
// HONEST SCOPE: unlike the sports side there is no tracked record behind any
// of this yet - no fitted weights, no win rates, no backtest. Every read on
// this page is the raw engine, presented as a watchlist lens, not a proven
// edge. Dates are sourced public record; an anchor whose exact day is not
// reliably known (COMEX silver, 1963) carries a YEAR ONLY read - the zodiac
// animal is the only thing a bare year genuinely determines (same rule as
// the MLB franchise fallback), so that is all it gets. No fabricated dates.

/* ===================== Instruments ===================== */
// kind drives which anchors count as PRIMARY for the watch verdict: a
// company trades on its own cycle and its CEO's (the two the user circled),
// with the IPO as context; a contract or coin has only its own dates.

const STOCK_INSTRUMENTS = [
  {
    ticker: 'TSLA', name: 'Tesla', kind: 'stock', hue: 0,
    anchors: [
      { key: 'company', icon: '🏢', label: 'Company', date: '2003-07-01', primary: true },
      { key: 'ipo', icon: '📈', label: 'IPO', date: '2010-06-29' },
      { key: 'ceo', icon: '👤', label: 'CEO', person: 'Elon Musk', date: '1971-06-28', primary: true },
    ],
  },
  {
    ticker: 'META', name: 'Meta', kind: 'stock', hue: 217,
    anchors: [
      { key: 'company', icon: '🏢', label: 'Company', date: '2004-02-04', primary: true },
      { key: 'ipo', icon: '📈', label: 'IPO', date: '2012-05-18' },
      { key: 'ceo', icon: '👤', label: 'CEO', person: 'Mark Zuckerberg', date: '1984-05-14', primary: true },
    ],
  },
  {
    ticker: 'AAPL', name: 'Apple', kind: 'stock', hue: 210,
    anchors: [
      { key: 'company', icon: '🏢', label: 'Company', date: '1976-04-01', primary: true },
      { key: 'ipo', icon: '📈', label: 'IPO', date: '1980-12-12' },
      { key: 'ceo', icon: '👤', label: 'CEO', person: 'Tim Cook', date: '1960-11-01', primary: true },
    ],
  },
  {
    ticker: 'NVDA', name: 'Nvidia', kind: 'stock', hue: 95,
    anchors: [
      { key: 'company', icon: '🏢', label: 'Company', date: '1993-04-05', primary: true },
      { key: 'ipo', icon: '📈', label: 'IPO', date: '1999-01-22' },
      { key: 'ceo', icon: '👤', label: 'CEO', person: 'Jensen Huang', date: '1963-02-17', primary: true },
    ],
  },
  {
    ticker: 'MSFT', name: 'Microsoft', kind: 'stock', hue: 200,
    anchors: [
      { key: 'company', icon: '🏢', label: 'Company', date: '1975-04-04', primary: true },
      { key: 'ipo', icon: '📈', label: 'IPO', date: '1986-03-13' },
      { key: 'ceo', icon: '👤', label: 'CEO', person: 'Satya Nadella', date: '1967-08-19', primary: true },
    ],
  },
  {
    ticker: 'AMZN', name: 'Amazon', kind: 'stock', hue: 35,
    anchors: [
      { key: 'company', icon: '🏢', label: 'Company', date: '1994-07-05', primary: true },
      { key: 'ipo', icon: '📈', label: 'IPO', date: '1997-05-15' },
      { key: 'ceo', icon: '👤', label: 'CEO', person: 'Andy Jassy', date: '1968-01-13', primary: true },
    ],
  },
  {
    ticker: 'GOOGL', name: 'Alphabet', kind: 'stock', hue: 265,
    anchors: [
      { key: 'company', icon: '🏢', label: 'Company', date: '1998-09-04', primary: true },
      { key: 'ipo', icon: '📈', label: 'IPO', date: '2004-08-19' },
      { key: 'ceo', icon: '👤', label: 'CEO', person: 'Sundar Pichai', date: '1972-06-10', primary: true },
    ],
  },
  {
    ticker: 'NQ', name: 'Nasdaq-100 E-mini', kind: 'futures', hue: 190,
    anchors: [
      { key: 'launch', icon: '🚀', label: 'Contract Launch', date: '1999-06-21', primary: true },
      { key: 'index', icon: '🧮', label: 'Index Born', date: '1985-01-31', primary: true },
    ],
  },
  {
    ticker: 'ES', name: 'S&P 500 E-mini', kind: 'futures', hue: 150,
    anchors: [
      { key: 'launch', icon: '🚀', label: 'Contract Launch', date: '1997-09-09', primary: true },
      { key: 'index', icon: '🧮', label: 'Index Born', date: '1957-03-04', primary: true },
    ],
  },
  {
    ticker: 'GC', name: 'Gold Futures', kind: 'commodity', hue: 45,
    anchors: [
      // COMEX gold trading opened the day private gold ownership came back
      // (Dec 31, 1974) - a real, exact, well-documented birthdate.
      { key: 'launch', icon: '🚀', label: 'COMEX Launch', date: '1974-12-31', primary: true },
    ],
  },
  {
    ticker: 'SI', name: 'Silver Futures', kind: 'commodity', hue: 220,
    anchors: [
      // Only the launch YEAR is reliably documented - so only the zodiac
      // year is read. No invented month/day (see HONEST SCOPE above).
      { key: 'launch', icon: '🚀', label: 'COMEX Launch', year: 1963, primary: true },
    ],
  },
  {
    ticker: 'BTC', name: 'Bitcoin', kind: 'crypto', hue: 28,
    anchors: [
      { key: 'launch', icon: '🚀', label: 'Genesis Block', date: '2009-01-03', primary: true },
    ],
  },
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

// Personal Years that read as pressure phases in the cycle content the app
// already uses: 4 (restriction/grind), 7 (pullback, low external reward),
// 9 (endings/clearing). Display always names the number, so the rule is
// inspectable on every card rather than a hidden judgment.
const STOCKS_PRESSURE_YEARS = [4, 7, 9];

// One anchor -> everything the card shows. relation comes straight off the
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
      personalYear: null,
      pressure: false,
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
    personalYear,
    pressure: STOCKS_PRESSURE_YEARS.includes(personalYear),
  };
}

// Watch verdict from the PRIMARY anchors only (company + CEO for a stock,
// the instrument's own dates otherwise): any enemy year -> short-side watch;
// pressure without an enemy year -> caution; allies with a clean slate ->
// long-side watch. Plain rules, every input visible on the cards above it.
function stocksVerdict(reads) {
  const primary = reads.filter((r) => r.primary);
  const enemies = primary.filter((r) => r.relation === 'enemy');
  const pressured = primary.filter((r) => r.pressure);
  const allies = primary.filter((r) => r.relation === 'ally');

  if (enemies.length) {
    return {
      watch: 'short', label: 'High Short Watch',
      text: `${enemies.map((r) => `${r.person || r.label}'s ${r.animal} runs its enemy year`).join('; ')}`
        + `${pressured.length ? `, and ${pressured.map((r) => `${r.person || r.label} sits in a Personal Year ${r.personalYear} pressure cycle`).join('; ')}` : ''}.`
        + ' Pressure cycle and/or enemy year detected — treat as a high-priority short-side watchlist item.',
    };
  }
  if (pressured.length) {
    return {
      watch: 'caution', label: 'Pressure Cycle',
      text: `${pressured.map((r) => `${r.person || r.label} sits in a Personal Year ${r.personalYear} pressure cycle`).join('; ')}.`
        + ' No enemy year, but the cycle argues against chasing strength here.',
    };
  }
  if (allies.length) {
    return {
      watch: 'long', label: 'Long Watch',
      text: `${allies.map((r) => `${r.person || r.label}'s ${r.animal} runs an ally year`).join('; ')}`
        + ` with no enemy years or pressure cycles against it. Favorable-cycle watchlist item.`,
    };
  }
  return {
    watch: 'neutral', label: 'Neutral',
    text: 'No enemy years, ally years, or pressure cycles on the primary anchors — nothing cyclical to lean on either way this year.',
  };
}

function stocksInstrumentRead(inst, today, todayAnimal) {
  const reads = inst.anchors.map((a) => stocksAnchorRead(a, today, todayAnimal));
  return { ...inst, reads, verdict: stocksVerdict(reads) };
}

/* ===================== Rendering ===================== */

const STOCKS_WATCH_ORDER = { short: 0, caution: 1, long: 2, neutral: 3 };

const STOCKS_RELATION_CHIP = {
  enemy: { cls: 'bad', text: 'Enemy Year' },
  ally: { cls: 'good', text: 'Ally Year' },
  neutral: { cls: '', text: 'Neutral' },
};

function stocksMonogram(inst) {
  return `<div class="stock-monogram" style="--stock-hue:${inst.hue};">${escapeHtml(inst.ticker)}</div>`;
}

function stocksWatchPill(verdict) {
  return `<span class="stock-watch ${verdict.watch}">${verdict.watch === 'short' ? '● ' : ''}${escapeHtml(verdict.label)}</span>`;
}

function stocksAnchorFlagBadges(read) {
  const who = (read.person ? read.person.split(' ').pop() : read.label).toUpperCase();
  const badges = [];
  if (read.relation === 'enemy') badges.push(`<span class="stock-badge bad">${escapeHtml(who)} ${escapeHtml(read.animal.toUpperCase())} · ENEMY YEAR</span>`);
  if (read.relation === 'ally') badges.push(`<span class="stock-badge good">${escapeHtml(who)} ${escapeHtml(read.animal.toUpperCase())} · ALLY YEAR</span>`);
  if (read.pressure) badges.push(`<span class="stock-badge warn">${escapeHtml(who)} · PY ${read.personalYear} PRESSURE</span>`);
  return badges;
}

function renderStocksGrid(instruments) {
  const grid = document.getElementById('stocksGrid');
  const sorted = [...instruments].sort((a, b) => STOCKS_WATCH_ORDER[a.verdict.watch] - STOCKS_WATCH_ORDER[b.verdict.watch]);
  grid.innerHTML = sorted.map((inst) => {
    const chips = inst.reads.filter((r) => r.primary).map((r) => {
      const chip = STOCKS_RELATION_CHIP[r.relation];
      return `<span class="stock-chip ${chip.cls}">${VIETNAMESE_ZODIAC_EMOJI[r.animal] || ''} ${escapeHtml(r.animal)}${r.relation !== 'neutral' ? ` · ${chip.text}` : ''}${r.pressure ? ' · PY ' + r.personalYear : ''}</span>`;
    }).join('');
    return `
      <div class="stock-card" data-ticker="${escapeHtml(inst.ticker)}">
        <div class="stock-card-head">
          ${stocksMonogram(inst)}
          <div class="stock-card-title">
            <div class="stock-card-ticker">${escapeHtml(inst.ticker)}</div>
            <div class="stock-card-name">${escapeHtml(inst.name)}</div>
          </div>
          ${stocksWatchPill(inst.verdict)}
        </div>
        <div class="stock-card-chips">${chips}</div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.stock-card').forEach((card) => {
    card.addEventListener('click', () => {
      const inst = instruments.find((i) => i.ticker === card.dataset.ticker);
      if (inst) openStockModal(inst);
    });
  });
}

function openStockModal(inst) {
  const overlay = document.getElementById('stockModalOverlay');
  const ceo = inst.reads.find((r) => r.key === 'ceo');
  const headline = ceo ? ceo.person : inst.name;
  const badges = inst.reads.flatMap(stocksAnchorFlagBadges).join('');

  const anchorCards = inst.reads.map((r) => `
    <div class="stock-anchor-card${r.primary ? ' primary' : ''}">
      <div class="stock-anchor-label">${r.icon} ${escapeHtml(r.label)}</div>
      <div class="stock-anchor-number">${r.lifePath != null ? escapeHtml(String(r.lifePath)) : VIETNAMESE_ZODIAC_EMOJI[r.animal] || '—'}</div>
      <div class="stock-anchor-sub">${r.lifePath != null ? 'Life Path' : 'Zodiac only'}</div>
      <div class="stock-anchor-date">${escapeHtml(r.dateDisplay)}</div>
      <div class="stock-anchor-zodiac">
        <span class="stock-chip ${STOCKS_RELATION_CHIP[r.relation].cls}">${VIETNAMESE_ZODIAC_EMOJI[r.animal] || ''} ${escapeHtml(r.animal)}${r.relation !== 'neutral' ? ` · ${STOCKS_RELATION_CHIP[r.relation].text}` : ''}</span>
      </div>
      ${r.personalYear != null ? `<div class="stock-anchor-py${r.pressure ? ' warn' : ''}">Personal Year ${r.personalYear}${r.pressure ? ' ⚠️' : ''}</div>` : ''}
    </div>`).join('');

  document.getElementById('stockModalBody').innerHTML = `
    <div class="stock-modal-top">
      <div class="stock-modal-badges">${stocksWatchPill(inst.verdict)}${badges}</div>
      ${stocksMonogram(inst)}
    </div>
    <div class="stock-modal-headline">${escapeHtml(headline)}</div>
    <div class="stock-modal-subline">${escapeHtml(inst.name)} · ${escapeHtml(inst.ticker)}</div>
    <div class="stock-anchor-row">${anchorCards}</div>
    <div class="stock-verdict ${inst.verdict.watch}">${escapeHtml(inst.verdict.text)}</div>`;
  overlay.style.display = 'flex';
}

function initStocksPage() {
  const today = new Date();
  const todayAnimal = getChineseZodiacYear(today);
  document.getElementById('stocksYearChip').innerHTML =
    `${VIETNAMESE_ZODIAC_EMOJI[todayAnimal] || ''} ${today.getFullYear()} · Year of the ${escapeHtml(todayAnimal)}`;

  const instruments = STOCK_INSTRUMENTS.map((inst) => stocksInstrumentRead(inst, today, todayAnimal));
  renderStocksGrid(instruments);

  const overlay = document.getElementById('stockModalOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
  document.getElementById('stockModalClose').addEventListener('click', () => { overlay.style.display = 'none'; });
}

initStocksPage();

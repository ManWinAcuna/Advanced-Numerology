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

// Number meanings in the owner's own system (stated 2026-07-29): 7 =
// weakness, 8 = strength, 28 = expansion, 11 = emotional / sporadic. These
// four drive the cycle read - 7 leans short, 8 and 28 lean long, 11 flags
// volatility without a direction. Numbers he hasn't defined stay unflagged
// rather than guessed at, and the number is always shown next to its label
// so the rule stays inspectable on every card.
const STOCKS_NUMBER_MEANINGS = {
  7: { label: 'Weakness', dir: 'bear' },
  8: { label: 'Strength', dir: 'bull' },
  28: { label: 'Expansion', dir: 'bull' },
  11: { label: 'Emotional · Sporadic', dir: 'volatile' },
};

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
    // IS strength in this system), separate from the year's cycle below.
    lifePathMeaning: STOCKS_NUMBER_MEANINGS[getLifePathNumeric(d)] || null,
    personalYear,
    cycle: STOCKS_NUMBER_MEANINGS[personalYear] || null,
    // The deep today read - the exact engine behind the profile's Energy
    // Flow box: PY/PM/PD vs Universal Y/M/D (numerologyCompat per level)
    // AND birth year/month/day signs vs today's three signs
    // (vietnameseCompat per level). Clashes at any level surface below.
    flow: computeEnergyFlow(d, today),
  };
}

// Score bands straight from the app's own clash language (clashTypeForScore
// in db-core.js): under 30 reads as a fundamental clash, 85+ as synergy.
function stocksScoreCls(score) {
  return score <= 29 ? 'bad' : score >= 85 ? 'good' : '';
}

function stocksScoreMark(score) {
  return score <= 29 ? ' ⚔️' : score >= 85 ? ' 🚀' : '';
}

// A number with one of the owner's meanings shows it everywhere it appears.
function stocksNumLabel(n) {
  const m = STOCKS_NUMBER_MEANINGS[n];
  return m ? `${n} · ${m.label}` : String(n);
}

// Watch verdict from the PRIMARY anchors only (company + CEO for a stock,
// the instrument's own dates otherwise). Bear signals win: an enemy year or
// a Personal Year 7 weakness cycle -> short-side watch. Then bull signals:
// an ally year or a PY 8 strength / PY 28 expansion cycle -> long-side
// watch (with a swings warning if a PY 11 rides along). PY 11 alone ->
// sporadic caution, no direction. Plain rules, every input visible on the
// cards above it.
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
    return {
      watch: 'short', label: 'High Short Watch',
      text: `${parts.join('; ')}. Weakness cycle and/or enemy year detected — treat as a high-priority short-side watchlist item.`,
    };
  }
  if (allies.length || strong.length) {
    const parts = [
      ...allies.map((r) => `${who(r)}'s ${r.animal} runs an ally year`),
      ...strong.map((r) => `${who(r)} runs a Personal Year ${r.personalYear} ${r.cycle.label.toLowerCase()} cycle`),
    ];
    const swings = sporadic.length
      ? ` ${sporadic.map((r) => `${who(r)}'s Personal Year 11 runs emotional and sporadic — expect swings on the way`).join('; ')}.`
      : '';
    return {
      watch: 'long', label: 'Long Watch',
      text: `${parts.join('; ')} with no enemy years or weakness cycles against it. Favorable-cycle watchlist item.${swings}`,
    };
  }
  if (sporadic.length) {
    return {
      watch: 'caution', label: 'Sporadic Year',
      text: `${sporadic.map((r) => `${who(r)} runs a Personal Year 11 — emotional, sporadic energy`).join('; ')}.`
        + ' No direction from the cycles, but expect erratic swings; size accordingly.',
    };
  }
  return {
    watch: 'neutral', label: 'Neutral',
    text: 'No enemy or ally years and no defined cycle numbers on the primary anchors — nothing cyclical to lean on either way this year.',
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

const STOCKS_CYCLE_CLS = { bear: 'bad', bull: 'good', volatile: 'warn' };

function stocksAnchorFlagBadges(read) {
  const who = (read.person ? read.person.split(' ').pop() : read.label).toUpperCase();
  const badges = [];
  if (read.relation === 'enemy') badges.push(`<span class="stock-badge bad">${escapeHtml(who)} ${escapeHtml(read.animal.toUpperCase())} · ENEMY YEAR</span>`);
  if (read.relation === 'ally') badges.push(`<span class="stock-badge good">${escapeHtml(who)} ${escapeHtml(read.animal.toUpperCase())} · ALLY YEAR</span>`);
  if (read.cycle) badges.push(`<span class="stock-badge ${STOCKS_CYCLE_CLS[read.cycle.dir]}">${escapeHtml(who)} · PY ${read.personalYear} ${escapeHtml(read.cycle.label.toUpperCase())}</span>`);
  return badges;
}

function renderStocksGrid(instruments) {
  const grid = document.getElementById('stocksGrid');
  const sorted = [...instruments].sort((a, b) => STOCKS_WATCH_ORDER[a.verdict.watch] - STOCKS_WATCH_ORDER[b.verdict.watch]);
  grid.innerHTML = sorted.map((inst) => {
    const chips = inst.reads.filter((r) => r.primary).flatMap((r) => {
      const chip = STOCKS_RELATION_CHIP[r.relation];
      const out = [`<span class="stock-chip ${chip.cls}">${VIETNAMESE_ZODIAC_EMOJI[r.animal] || ''} ${escapeHtml(r.animal)}${r.relation !== 'neutral' ? ` · ${chip.text}` : ''}</span>`];
      if (r.cycle) out.push(`<span class="stock-chip ${STOCKS_CYCLE_CLS[r.cycle.dir]}">PY ${r.personalYear} · ${escapeHtml(r.cycle.label)}</span>`);
      return out;
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

// One anchor's deep today block: PY/PM/PD against the Universal numbers
// (numerology side) and birth year/month/day signs against today's three
// signs (Vietnamese side), every pair marked when it clashes (<=29, the
// engine's fundamental-clash band) or boosts (85+).
function stocksEnergyBlock(r) {
  const f = r.flow;
  const n = f.numerology;
  const v = f.vietnamese;
  const e = (a) => VIETNAMESE_ZODIAC_EMOJI[a] || '';
  return `
    <div class="stock-energy-block">
      <div class="stock-energy-title">${r.icon} ${escapeHtml(r.person || r.label)} <span class="score-inline ${stocksScoreCls(f.finalScore)}">⚡ ${f.finalScore}</span></div>
      <div class="stock-energy-chips">
        <span class="stock-chip ${stocksScoreCls(n.yearScore)}">PY ${stocksNumLabel(n.personalYear)} vs UY ${n.universalYear}${stocksScoreMark(n.yearScore)}</span>
        <span class="stock-chip ${stocksScoreCls(n.monthScore)}">PM ${stocksNumLabel(n.personalMonth)} vs UM ${n.universalMonth}${stocksScoreMark(n.monthScore)}</span>
        <span class="stock-chip ${stocksScoreCls(n.dayScore)}">PD ${stocksNumLabel(n.personalDay)} vs UD ${escapeHtml(String(n.universalDay))}${stocksScoreMark(n.dayScore)}</span>
      </div>
      <div class="stock-energy-chips">
        <span class="stock-chip ${stocksScoreCls(v.yearScore)}">Year ${e(v.personalYearSign)} ${escapeHtml(v.personalYearSign)} vs ${e(v.universalYearSign)}${stocksScoreMark(v.yearScore)}</span>
        <span class="stock-chip ${stocksScoreCls(v.monthScore)}">Month ${e(v.personalMonthSign)} ${escapeHtml(v.personalMonthSign)} vs ${e(v.universalMonthSign)}${stocksScoreMark(v.monthScore)}</span>
        <span class="stock-chip ${stocksScoreCls(v.daySignScore)}">Day ${e(v.personalDaySign)} ${escapeHtml(v.personalDaySign)} vs ${e(v.universalDaySign)}${stocksScoreMark(v.daySignScore)}</span>
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
      <div class="stock-anchor-label">${r.icon} ${escapeHtml(r.label)}</div>
      <div class="stock-anchor-number">${r.lifePath != null ? escapeHtml(String(r.lifePath)) : VIETNAMESE_ZODIAC_EMOJI[r.animal] || '—'}</div>
      <div class="stock-anchor-sub">${r.lifePath != null ? `Life Path${r.lifePathMeaning ? ' · ' + escapeHtml(r.lifePathMeaning.label) : ''}` : 'Zodiac only'}</div>
      <div class="stock-anchor-date">${escapeHtml(r.dateDisplay)}</div>
      <div class="stock-anchor-zodiac">
        <span class="stock-chip ${STOCKS_RELATION_CHIP[r.relation].cls}">${VIETNAMESE_ZODIAC_EMOJI[r.animal] || ''} ${escapeHtml(r.animal)}${r.relation !== 'neutral' ? ` · ${STOCKS_RELATION_CHIP[r.relation].text}` : ''}</span>
      </div>
      ${r.personalYear != null ? `<div class="stock-anchor-py${r.cycle ? ' ' + STOCKS_CYCLE_CLS[r.cycle.dir] : ''}">Personal Year ${r.personalYear}${r.cycle ? ` · ${escapeHtml(r.cycle.label)}` : ''}</div>` : ''}
    </div>`).join('');

  // Universal side stated once (it's the same "today" for every anchor),
  // then one deep block per dated anchor, then a clash/boost tally over the
  // primary anchors. The year-only anchor (silver) has no flow - honest gap.
  const flows = inst.reads.filter((r) => r.flow);
  const uni = flows.length ? flows[0].flow : null;
  const e = (a) => VIETNAMESE_ZODIAC_EMOJI[a] || '';
  const uniLine = uni ? `
    <div class="stock-energy-head">⚡ Today's Energies — Universal Y ${stocksNumLabel(uni.numerology.universalYear)} · M ${stocksNumLabel(uni.numerology.universalMonth)} · D ${escapeHtml(String(uni.numerology.universalDay))}${STOCKS_NUMBER_MEANINGS[Number(uni.numerology.universalDay)] ? ' · ' + escapeHtml(STOCKS_NUMBER_MEANINGS[Number(uni.numerology.universalDay)].label) : ''}
    · ${e(uni.vietnamese.universalYearSign)} ${escapeHtml(uni.vietnamese.universalYearSign)} year · ${e(uni.vietnamese.universalMonthSign)} ${escapeHtml(uni.vietnamese.universalMonthSign)} month · ${e(uni.vietnamese.universalDaySign)} ${escapeHtml(uni.vietnamese.universalDaySign)} day</div>` : '';

  let clashes = 0;
  let boosts = 0;
  inst.reads.filter((r) => r.primary && r.flow).forEach((r) => {
    const f = r.flow;
    [f.numerology.yearScore, f.numerology.monthScore, f.numerology.dayScore,
      f.vietnamese.yearScore, f.vietnamese.monthScore, f.vietnamese.daySignScore].forEach((s) => {
      if (s <= 29) clashes += 1;
      else if (s >= 85) boosts += 1;
    });
  });
  const todayLine = uni ? `
    <div class="stock-today-line">${clashes ? `⚔️ ${clashes} clashing energ${clashes === 1 ? 'y' : 'ies'}` : 'No clashing energies'} · ${boosts ? `🚀 ${boosts} boost${boosts === 1 ? '' : 's'}` : 'no boosts'} across the primary anchors today.</div>` : '';

  document.getElementById('stockModalBody').innerHTML = `
    <div class="stock-modal-top">
      <div class="stock-modal-badges">${stocksWatchPill(inst.verdict)}${badges}</div>
      ${stocksMonogram(inst)}
    </div>
    <div class="stock-modal-headline">${escapeHtml(headline)}</div>
    <div class="stock-modal-subline">${escapeHtml(inst.name)} · ${escapeHtml(inst.ticker)}</div>
    <div class="stock-anchor-row">${anchorCards}</div>
    <div class="stock-verdict ${inst.verdict.watch}">${escapeHtml(inst.verdict.text)}</div>
    ${uniLine}
    ${flows.map(stocksEnergyBlock).join('')}
    ${todayLine}`;
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

/*
 * Shared rendering for a computeCompatibility() result. Used by both the
 * Compatibility Calculator page and the Sports Betting tools. Requires
 * compat-engine.js (for the result shape) and db-core.js (escapeHtml,
 * ZODIAC_SYMBOLS, VIETNAMESE_ZODIAC_EMOJI) to be loaded first.
 */

function scoreClass(score) {
  if (score >= 77) return 'good';
  if (score < 49) return 'bad';
  return 'mid';
}

// The shared .modal-box defaults to a width sized for the full compatibility
// breakdown (meters + rows). Narrower popups (like Month Outlook) opt into a
// tighter box instead of sitting mostly-empty inside the wide default.
function setModalWidth(containerEl, narrow) {
  const box = containerEl.closest('.modal-box');
  if (box) box.classList.toggle('modal-box-narrow', narrow);
}

function breakdownSection(title, score, rows) {
  return `
    <div class="breakdown-section">
      <div class="breakdown-header"><span>${title}</span></div>
      <div class="meter"><div class="meter-fill" style="width:${score}%"></div></div>
      <div class="breakdown-rows">
        ${rows.map((row) => `<div class="breakdown-row"><span>${row.label}</span><span class="breakdown-score">${row.score}</span></div>`).join('')}
      </div>
    </div>
  `;
}

// Shared "Lucky Number Bonuses" section - every compatibility-style score in
// the app (Compatibility, Energy Flow, Month Outlook) factors lucky number
// in, so they all render it the same way.
function bonusSectionHtml(bonuses) {
  if (!bonuses || !bonuses.notes.length) return '';
  return `
    <div class="breakdown-section bonus-section">
      <div class="breakdown-header"><span>🍀 Lucky Number Bonuses</span></div>
      <div class="breakdown-rows">
        ${bonuses.notes.map((n) => `<div class="breakdown-row bonus-row">${escapeHtml(n)}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderCompatResults(containerEl, r, nameA, nameB) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);

  const flagHtml = r.flags.map((f) => {
    if (f === 'perfect') return '<div class="score-flag perfect">&#9733; PERFECT MATCH</div>';
    if (f === 'ideal') return '<div class="score-flag ideal">&#9733; IDEAL MATCH</div>';
    if (f === 'clash') return '<div class="score-flag clash">&#9888; CLASH</div>';
    return '';
  }).join('');

  const numerologyRows = [
    { label: `✨ Lifepath (${r.numerology.entityLifePath} &rarr; ${r.numerology.dayLifePath})`, score: r.numerology.lifePathScore },
    { label: `📅 Day (${r.numerology.entityDay} &rarr; ${r.numerology.dayDay})`, score: r.numerology.dayScore },
    { label: `🔢 Day of Year (${r.numerology.entityDoy} &rarr; ${r.numerology.dayDoy})`, score: r.numerology.doyScore },
  ];

  const vietnameseRows = [
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.entityYearSign] || ''} Year (${r.vietnamese.entityYearSign} &rarr; ${r.vietnamese.dayYearSign})`, score: r.vietnamese.yearScore },
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.entityMonthSign] || ''} Month (${r.vietnamese.entityMonthSign} &rarr; ${r.vietnamese.dayMonthSign})`, score: r.vietnamese.monthScore },
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.entityDaySign] || ''} Day (${r.vietnamese.entityDaySign} &rarr; ${r.vietnamese.dayDaySign})`, score: r.vietnamese.daySignScore },
  ];

  const westernRows = [
    { label: `${ZODIAC_SYMBOLS[r.western.entitySunSign] || ''} Sign (${r.western.entitySunSign} &rarr; ${r.western.daySunSign})`, score: r.western.score },
  ];

  containerEl.innerHTML = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(nameA)} <span class="score-vs">&times;</span> ${escapeHtml(nameB)}</div>
      <div class="score-big ${scoreClass(r.finalScore)}">${r.finalScore}<span class="score-out-of">/100</span></div>
      ${flagHtml}
    </div>
    <div class="score-breakdown">
      ${breakdownSection('Numerology', r.numerology.score, numerologyRows)}
      ${breakdownSection('Vietnamese Zodiac', r.vietnamese.score, vietnameseRows)}
      ${breakdownSection('Western Zodiac', r.western.score, westernRows)}
      ${bonusSectionHtml(r.bonuses)}
    </div>
  `;
}

// Renders a computeEnergyFlow() result - Personal Year/Month/Day vs
// Universal Year/Month/Day, numerology + Vietnamese zodiac only.
function renderEnergyFlowResults(containerEl, r) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);

  const numerologyRows = [
    { label: `Year (${r.numerology.personalYear} &harr; ${r.numerology.universalYear})`, score: r.numerology.yearScore },
    { label: `Month (${r.numerology.personalMonth} &harr; ${r.numerology.universalMonth})`, score: r.numerology.monthScore },
    { label: `Day (${r.numerology.personalDay} &harr; ${r.numerology.universalDay})`, score: r.numerology.dayScore },
  ];

  const vietnameseRows = [
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.personalYearSign] || ''} Year (${r.vietnamese.personalYearSign} &harr; ${r.vietnamese.universalYearSign})`, score: r.vietnamese.yearScore },
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.personalMonthSign] || ''} Month (${r.vietnamese.personalMonthSign} &harr; ${r.vietnamese.universalMonthSign})`, score: r.vietnamese.monthScore },
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.personalDaySign] || ''} Day (${r.vietnamese.personalDaySign} &harr; ${r.vietnamese.universalDaySign})`, score: r.vietnamese.daySignScore },
  ];

  containerEl.innerHTML = `
    <div class="score-hero">
      <div class="score-names">Your Energy <span class="score-vs">&times;</span> Today's Energy</div>
      <div class="score-big ${scoreClass(r.finalScore)}">${r.finalScore}<span class="score-out-of">/100</span></div>
    </div>
    <div class="score-breakdown">
      ${breakdownSection('Numerology (Year / Month / Day)', r.numerology.score, numerologyRows)}
      ${breakdownSection('Vietnamese Zodiac (Year / Month / Day)', r.vietnamese.score, vietnameseRows)}
      ${bonusSectionHtml(r.bonuses)}
    </div>
  `;
}

// Renders a computeMonthOutlook() result - all 12 calendar months ranked
// best to worst for this person.
function renderMonthOutlook(containerEl, rankedMonths) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, true);
  containerEl.innerHTML = `
    <div class="score-hero month-outlook-hero">
      <div class="month-outlook-icon">📅</div>
      <div class="score-names">Yearly Outlook</div>
    </div>
    <div class="calendar-rank-list month-outlook-list">
      ${rankedMonths.map((m, idx) => `
        <div class="month-outlook-row ${scoreClass(m.finalScore)}" data-index="${m.index}" title="Personal Month ${m.personalMonth} &middot; Universal Month ${m.universalMonth} &middot; ${m.westernRepSign} - click for the breakdown">
          <span class="month-outlook-rank">${idx + 1}</span>
          <span class="rank-day">${VIETNAMESE_ZODIAC_EMOJI[m.animal] || ''} ${m.name}${m.isLuckyMonth ? ' 🍀' : ''}<span class="month-outlook-pm">PM ${m.personalMonth}</span></span>
          <span class="rank-score ${scoreClass(m.finalScore)}">${m.finalScore}</span>
        </div>
      `).join('')}
    </div>
    <div id="monthOutlookCompareResults"></div>
  `;

  containerEl.querySelectorAll('.month-outlook-row').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      const monthIndex = Number(rowEl.dataset.index);
      const m = rankedMonths.find((row) => row.index === monthIndex);
      if (!m) return;
      renderMonthDetail(document.getElementById('monthOutlookCompareResults'), m);
      document.getElementById('monthOutlookCompareResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// Drills into a single month from computeMonthOutlook()'s result - reuses
// the exact same numbers already shown in the ranked list (personalMonthScore,
// universalMonthScore, vietnameseScore, westernScore, luckyNote) rather than
// running a different comparison, so this breakdown always adds up to the
// same score the list already showed for that month.
function renderMonthDetail(containerEl, m) {
  const numerologyRows = [
    { label: `Personal Month (Lifepath &harr; ${m.personalMonth})`, score: m.personalMonthScore },
    { label: `Universal Month (Lifepath &harr; ${m.universalMonth})`, score: m.universalMonthScore },
  ];
  const vietnameseRows = [
    { label: `${VIETNAMESE_ZODIAC_EMOJI[m.personMonthSign] || ''} Month Sign (${m.personMonthSign} &harr; ${m.animal})`, score: m.vietnameseScore },
  ];
  const westernRows = [
    { label: `${ZODIAC_SYMBOLS[m.personSunSign] || ''} Sign (${m.personSunSign} &harr; ${m.westernRepSign})`, score: m.westernScore },
  ];
  const bonuses = { total: m.luckyBonus, notes: m.luckyNote ? [m.luckyNote] : [] };

  containerEl.classList.add('active');
  setModalWidth(containerEl, false);
  containerEl.innerHTML = `
    <div class="score-hero">
      <div class="score-names">You <span class="score-vs">&times;</span> ${m.name} ${m.cycleYear}</div>
      <div class="score-big ${scoreClass(m.finalScore)}">${m.finalScore}<span class="score-out-of">/100</span></div>
    </div>
    <div class="score-breakdown">
      ${breakdownSection('Numerology', m.numerologyScore, numerologyRows)}
      ${breakdownSection('Vietnamese Zodiac', m.vietnameseScore, vietnameseRows)}
      ${breakdownSection('Western Zodiac', m.westernScore, westernRows)}
      ${bonusSectionHtml(bonuses)}
    </div>
  `;
}

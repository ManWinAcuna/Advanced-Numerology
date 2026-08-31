function parseDateInput(value) {
  // value is "YYYY-MM-DD"; construct using local components to avoid TZ shift.
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y - which corrupted mid-typing states in the date picker.
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setTitle(id, value) {
  const el = document.getElementById(id);
  if (el) el.title = value;
}

// Sign text plus a small retrograde marker when the natal placement was R.
function setSignText(id, sign, retro) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = retro ? `${sign} <span class="retro-marker" title="Retrograde at birth">℞</span>` : sign;
}

let lastBirthDate = null;
let lastMonthsTable = null;
let lastPDReduced = null;

// Personal Cycles readability redesign (Boost13, locked 2026-08-31): energy
// colors + one-line meanings for the Year/Month/Day cards. PCYCLE_ENERGY and
// PCYCLE_MEANING live in compat-render.js (loads before this file on every
// page that loads both) since the Roadmap/Outlook popup rows in that file
// need the same tables - defining them twice would be a duplicate global.

// Pure display math, kept out of numerology.js (never edited) - calls its
// exported toUTCDays/daysBetween but computes BOTH cycle bounds (last+next),
// not just "days until next" like getDaysLeftBlock. Year pivots on the real
// birthday, Month on the birth day-of-month - same pivots computeAll already
// uses for PY/PM themselves, just read again here for the bar's own span.
// Returns {progress, daysPassed, daysLeft} instead of a bare percentage -
// the Days Left box (profile/calculator/famous.html) was folded into these
// bars directly (owner's call 2026-08-31: "we can literally get rid of the
// days left if we figure out a way to implement them into the bars"), so
// the bar's own fill % and its printed day counts need to come from the
// exact same start/end computation to guarantee they never disagree.
function yearCycleProgress(birthDate, today) {
  const m = birthDate.getMonth() + 1, d = birthDate.getDate();
  const thisYearBday = new Date(today.getFullYear(), m - 1, d);
  const start = toUTCDays(thisYearBday) <= toUTCDays(today) ? thisYearBday : new Date(today.getFullYear() - 1, m - 1, d);
  const end = new Date(start.getFullYear() + 1, m - 1, d);
  const totalDays = daysBetween(start, end);
  const daysPassed = daysBetween(start, today);
  return { progress: daysPassed / totalDays, daysPassed, daysLeft: totalDays - daysPassed };
}

function monthCycleProgress(birthDate, today) {
  const d = birthDate.getDate();
  const tDay = today.getDate();
  const start = d <= tDay ? new Date(today.getFullYear(), today.getMonth(), d) : new Date(today.getFullYear(), today.getMonth() - 1, d);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, d);
  const totalDays = daysBetween(start, end);
  const daysPassed = daysBetween(start, today);
  return { progress: daysPassed / totalDays, daysPassed, daysLeft: totalDays - daysPassed };
}

// Locked spec: "the day bar is birthtime to birthtime". Reuses the same
// #btime input Personal Hours already reads (renderPersonalHours below) -
// when it's set, the bar's own boundary is that clock time, wrapping across
// midnight; when it's empty, falls back to midnight-to-midnight. This is
// purely the BAR's own span - the underlying Personal Day NUMBER still flips
// at real midnight regardless (getPersonalDayRaw, numerology.js - never
// touched here).
function dayCycleProgress(btimeStr) {
  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  if (!btimeStr) return nowSec / 86400;
  const [bh, bm] = btimeStr.split(':').map(Number);
  const boundarySec = bh * 3600 + bm * 60;
  return ((nowSec - boundarySec + 86400) % 86400) / 86400;
}

// progressData is either a bare 0-1 number (Today's card - a live clock
// fraction, no "days passed/left" concept applies) or the
// {progress, daysPassed, daysLeft} shape from yearCycleProgress/
// monthCycleProgress. Only Year/Month cards have the passed/left pill
// elements in their HTML, so the pill-fill is a no-op on Today's card.
function applyPCycleCard(prefix, number, progressData) {
  const colors = PCYCLE_ENERGY[number] || PCYCLE_ENERGY[1];
  const card = document.getElementById(prefix + 'Card');
  if (card) {
    card.style.setProperty('--acc', colors.acc);
    card.style.setProperty('--acc-dim', colors.dim);
    card.style.setProperty('--acc-ghost', colors.ghost);
  }
  setText(prefix + 'Meaning', PCYCLE_MEANING[number] || '');
  const progress = typeof progressData === 'number' ? progressData : progressData.progress;
  const fill = document.getElementById(prefix + 'BarFill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, progress * 100)).toFixed(1)}%`;
  if (progressData && typeof progressData === 'object') {
    setText(prefix + 'BarPassed', `${progressData.daysPassed}d`);
    setText(prefix + 'BarLeft', `${progressData.daysLeft}d left`);
  }
}

// Split out from render() so the #btime 'input' listener (below) can
// refresh just the day bar's boundary without re-running the full compute -
// the Personal Day NUMBER itself never depends on birth time, only where
// this bar's own 24h window starts.
function refreshDayCard() {
  if (lastPDReduced == null) return;
  const btimeVal = document.getElementById('btime');
  applyPCycleCard('pd', lastPDReduced, dayCycleProgress(btimeVal && btimeVal.value ? btimeVal.value : null));
}

function render() {
  const input = document.getElementById('bday');
  const iso = displayToISO(input.value);
  if (!iso) { lastBirthDate = null; lastMonthsTable = null; return; }

  const birthDate = parseDateInput(iso);
  lastBirthDate = birthDate;
  const today = getToday();

  const r = computeAll(birthDate, today);
  lastMonthsTable = r.monthsTable;

  setText('lifePath', lifePathDisplayText(r.lifePath));
  setText('dayBornReduced', r.dayBornReduced);
  setText('dayNumReduced', r.dayNumReduced);
  setText('combo', r.combo);

  setText('lifePathRaw', r.lifePathCompound);
  setText('dayBornRaw', r.dayBornRaw);
  setText('dayNumRaw', r.dayNumRaw);

  setText('sunSign', r.sunSign);
  setSignText('saturnSign', r.saturnSign, r.saturnRetro);
  setSignText('jupiterSign', r.jupiterSign, r.jupiterRetro);
  setSignText('venusSign', r.venusSign, r.venusRetro);
  setTitle('sunSign', `Numerical value: ${WESTERN_SIGN_NUMERIC[r.sunSign]}`);
  setTitle('saturnSign', `Numerical value: ${WESTERN_SIGN_NUMERIC[r.saturnSign]}`);
  setTitle('jupiterSign', `Numerical value: ${WESTERN_SIGN_NUMERIC[r.jupiterSign]}`);
  setTitle('venusSign', `Numerical value: ${WESTERN_SIGN_NUMERIC[r.venusSign]}`);

  setText('chineseYear', r.chineseYear);
  setText('chineseMonth', r.chineseMonth);
  setText('chineseDay', r.chineseDay);
  setTitle('chineseYear', `Numerical value: ${CHINESE_ANIMAL_NUMERIC[r.chineseYear]}`);
  setTitle('chineseMonth', `Numerical value: ${CHINESE_ANIMAL_NUMERIC[r.chineseMonth]}`);
  setTitle('chineseDay', `Numerical value: ${CHINESE_ANIMAL_NUMERIC[r.chineseDay]}`);

  setText('luckyNumber', r.luckyNumber);
  setText('missing', r.missing);
  // "8 Day" = the LP of the FIRST 8-DAY from birth, where an "8 day" is
  // any day-of-month reducing to 8 (the 8th/17th/26th - NOT the 28th,
  // which is its own number). Owner's final ruling 2026-08-29, same fix
  // as Code13, worked examples: born 4/15/1994 -> April 17 -> 8; born
  // 1/3/2003 -> Jan 8 -> 5. See getFirstEightDayImprint
  // (imprint-alignment.js).
  const first8 = getFirstEightDayImprint(birthDate);
  setText('twentyEightDay', first8 ? first8.lp : '-');

  setText('pinnacle1', r.pinnacles.values[0]);
  setText('pinnacle2', r.pinnacles.values[1]);
  setText('pinnacle3', r.pinnacles.values[2]);
  setText('pinnacle4', r.pinnacles.values[3]);
  setText('pinnacle1Compound', r.pinnacles.compounds[0]);
  setText('pinnacle2Compound', r.pinnacles.compounds[1]);
  setText('pinnacle3Compound', r.pinnacles.compounds[2]);
  setText('pinnacle4Compound', r.pinnacles.compounds[3]);

  const [age1, age2, age3] = r.pinnacles.ages;
  setText('pinnacleAge1', `Birth – ${age1}`);
  setText('pinnacleAge2', `${age1 + 1} – ${age2}`);
  setText('pinnacleAge3', `${age2 + 1} – ${age3}`);
  setText('pinnacleAge4', `${age3 + 1}+`);

  setText('pyReduced', r.py.reduced);
  setText('pmReduced', r.pm.reduced);
  setText('pdReduced', r.pd.reduced);
  setText('pyRaw', r.py.raw);
  setText('pmRaw', r.pm.raw);
  setText('pdRaw', r.pd.raw);
  lastPDReduced = r.pd.reduced;
  applyPCycleCard('py', r.py.reduced, yearCycleProgress(birthDate, today));
  applyPCycleCard('pm', r.pm.reduced, monthCycleProgress(birthDate, today));
  refreshDayCard();

  const todayCompat = computeCompatibility(birthDate, today);
  const compatEl = document.getElementById('compatTodayScore');
  compatEl.textContent = `${todayCompat.finalScore}%`;
  compatEl.className = `box-value ${tierClass(todayCompat.finalScore)}`;

  const compatMeEl = document.getElementById('compatMeScore');
  if (compatMeEl) {
    const profile = loadProfile();
    if (profile && profile.date) {
      const meDate = parseDateInput(profile.date);
      const meCompat = computeCompatibility(meDate, birthDate);
      compatMeEl.textContent = `${meCompat.finalScore}%`;
      compatMeEl.className = `box-value ${tierClass(meCompat.finalScore)}`;
    } else {
      compatMeEl.textContent = '-';
      compatMeEl.className = 'box-value';
    }
  }

  const energyFlow = computeEnergyFlow(birthDate, today);
  const energyEl = document.getElementById('energyFlowScore');
  energyEl.textContent = `${energyFlow.finalScore}%`;
  energyEl.className = `box-value ${tierClass(energyFlow.finalScore)}`;

  const imprintsEl = document.getElementById('firstImprints');
  imprintsEl.innerHTML = '';
  r.firstImprints.forEach((fi) => {
    const div = document.createElement('div');
    div.className = 'imprint-cell';
    div.innerHTML = `<div class="lp-label">LP ${fi.target}</div><div class="lp-day">${fi.day}</div>`;
    imprintsEl.appendChild(div);
  });

  const monthsBody = document.querySelector('#monthsTable tbody');
  monthsBody.innerHTML = '';
  const currentMonthIndex = today.getMonth() + 1;
  r.monthsTable.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.index === currentMonthIndex) tr.className = 'current-month';
    tr.innerHTML = `
      <td class="month-name">${row.index} ${row.name} <span class="month-animal" title="${row.animal}">${VIETNAMESE_ZODIAC_EMOJI[row.animal] || ''}</span></td>
      <td class="reduced">${row.reduced}</td>
      <td>${row.unreduced}</td>
    `;
    monthsBody.appendChild(tr);
  });

  renderCompoundStories(r, birthDate);
}

// insertStoryLink/openStoryModal/openIdentityModal/openZodiacIdentityModal/
// renderCompoundStories moved to compat-render.js (2026-08-08) so
// category.js (the Database entry popup) can call them too, without
// loading all of this file's page-specific #bday wiring. See
// compat-render.js for these functions and the storyModalOverlayEl
// close-button wiring that used to live here.

attachDateMask(document.getElementById('bday'));
document.getElementById('bday').addEventListener('input', render);

/* ===================== Personal Hours ===================== */

function tierClass(score) {
  if (score >= 77) return 'good';
  if (score < 49) return 'bad';
  return 'mid';
}

let hoursMode = 'reduced';

function renderHoursTableHalf(tableEl, rows, table) {
  const theadRow = tableEl.querySelector('thead tr');
  theadRow.innerHTML = table.isPM
    ? '<th>Time</th><th>Digital</th><th>Military</th><th>Sign</th>'
    : '<th>Time</th><th>Digital</th><th>Sign</th>';

  const tbody = tableEl.querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.isOwnHour) tr.className = 'own-hour';

    const digitalValue = hoursMode === 'raw' ? row.digitalRaw : row.digitalReduced;
    const digitalTier = tierClass(numerologyCompat(table.digitalRoot, row.digitalReduced));
    // Your own hour-sign is always favorable to you, regardless of what the
    // lookup table says about it compared against itself.
    const signTier = row.sign === table.ownSign ? 'good' : tierClass(vietnameseCompat(table.ownSign, row.sign));
    const signEmoji = VIETNAMESE_ZODIAC_EMOJI[row.sign] || '';

    let militaryCellHtml = '';
    if (table.isPM) {
      const militaryValue = hoursMode === 'raw' ? row.militaryRaw : row.militaryReduced;
      const militaryTier = tierClass(numerologyCompat(table.militaryRoot, row.militaryReduced));
      militaryCellHtml = `<td class="hour-num"><span class="hour-pill ${militaryTier}">${militaryValue}</span></td>`;
    }

    tr.innerHTML = `
      <td class="hour-time">${row.label}${row.isOwnHour ? '<span class="you-pill">you</span>' : ''}</td>
      <td class="hour-num"><span class="hour-pill ${digitalTier}">${digitalValue}</span></td>
      ${militaryCellHtml}
      <td class="hour-sign"><span class="hour-pill ${signTier}">${signEmoji} ${row.sign}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function personalHourScore(table, row) {
  const signScore = row.sign === table.ownSign ? 100 : vietnameseCompat(table.ownSign, row.sign);
  const scores = [
    numerologyCompat(table.digitalRoot, row.digitalReduced),
    signScore,
  ];
  if (table.isPM) scores.push(numerologyCompat(table.militaryRoot, row.militaryReduced));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// Financial hours run on 8 and 28. Prefer 8, but if 8 is a clash for this
// person's own root, fall back to 28 instead. Among whichever hours carry
// that number (digital or, for PM, military), pick the one that also lines
// up best with the sign - i.e. the highest personalHourScore among them.
function findBestFinancialHour(table) {
  const eightScore = numerologyCompat(table.digitalRoot, 8);
  const financialNumber = eightScore < 49 ? 28 : 8;

  const candidates = table.rows.filter((row) => {
    const digitalMatch = row.digitalReduced === financialNumber;
    const militaryMatch = table.isPM && row.militaryReduced === financialNumber;
    return digitalMatch || militaryMatch;
  });

  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = -Infinity;
  candidates.forEach((row) => {
    const score = personalHourScore(table, row);
    if (score > bestScore) { bestScore = score; best = row; }
  });

  return { row: best, financialNumber };
}

function renderPersonalHours() {
  const timeInput = document.getElementById('btime');
  if (!timeInput) return; // page has no Personal Hours UI (e.g. Famous Lookup)
  const emptyEl = document.getElementById('hoursEmpty');
  const boxEl = document.getElementById('hoursBox');
  const ownNoteEl = document.getElementById('hoursOwnNote');
  const bestEl = document.getElementById('bestHourTime');
  const worstEl = document.getElementById('worstHourTime');
  const best2El = document.getElementById('bestHourTime2');
  const worst2El = document.getElementById('worstHourTime2');
  const finEl = document.getElementById('finHourTime');
  const finNoteEl = document.getElementById('finHourNote');
  // These only make sense once a birth time is known, so they're hidden
  // outright (not just shown with placeholder "-") until one is entered.
  const finBoxEl = document.getElementById('finHourBox');
  const bwBoxEl = document.getElementById('bestWorstHourBox');
  const hoursSectionEl = document.getElementById('personalHoursSection');

  if (!timeInput.value) {
    if (finBoxEl) finBoxEl.style.display = 'none';
    if (bwBoxEl) bwBoxEl.style.display = 'none';
    if (hoursSectionEl) hoursSectionEl.style.display = 'none';
    emptyEl.style.display = 'block';
    boxEl.style.display = 'none';
    bestEl.textContent = '-';
    worstEl.textContent = '-';
    best2El.textContent = '-';
    worst2El.textContent = '-';
    finEl.textContent = '-';
    finNoteEl.textContent = '';
    return;
  }

  if (finBoxEl) finBoxEl.style.display = '';
  if (bwBoxEl) bwBoxEl.style.display = '';
  if (hoursSectionEl) hoursSectionEl.style.display = '';

  const [hh, mm] = timeInput.value.split(':').map(Number);
  const table = getPersonalHoursTable(hh, mm);

  emptyEl.style.display = 'none';
  boxEl.style.display = 'block';
  ownNoteEl.textContent = table.isPM
    ? `Digital root ${table.digitalRoot} · Military root ${table.militaryRoot} · born in the ${table.ownSign} hour`
    : `Time root ${table.digitalRoot} · born in the ${table.ownSign} hour`;

  renderHoursTableHalf(document.getElementById('hoursTableA'), table.rows.slice(0, 12), table);
  renderHoursTableHalf(document.getElementById('hoursTableB'), table.rows.slice(12, 24), table);

  const ranked = table.rows
    .map((row) => ({ row, score: personalHourScore(table, row) }))
    .sort((a, b) => b.score - a.score);

  bestEl.textContent = ranked[0].row.label;
  worstEl.textContent = ranked[ranked.length - 1].row.label;
  best2El.textContent = ranked[1].row.label;
  worst2El.textContent = ranked[ranked.length - 2].row.label;

  const financial = findBestFinancialHour(table);
  if (financial) {
    finEl.textContent = financial.row.label;
    finNoteEl.textContent = `via ${financial.financialNumber}`;
  } else {
    finEl.textContent = 'None today';
    finNoteEl.textContent = '';
  }

  // When the personal best/worst hour happens to also be the financial
  // hour, that overlap used to be invisible unless you read both boxes
  // and compared the times yourself - flag whichever tile(s) match.
  [bestEl, worstEl, best2El, worst2El].forEach((el) => {
    const tile = el.closest('.bw-hour');
    if (tile) tile.classList.toggle('bw-hour-fin', !!(financial && el.textContent === financial.row.label));
  });
}

document.querySelectorAll('.hours-toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.hours-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    hoursMode = btn.dataset.mode;
    renderPersonalHours();
  });
});

const btimeInput = document.getElementById('btime');
if (btimeInput) btimeInput.addEventListener('input', () => { renderPersonalHours(); refreshDayCard(); });
renderPersonalHours();

(function applyBdayFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const bday = params.get('bday');
  if (bday && /^\d{4}-\d{2}-\d{2}$/.test(bday)) {
    document.getElementById('bday').value = isoToDisplay(bday);
  }
  const btime = params.get('btime');
  const btimeField = document.getElementById('btime');
  if (btimeField && btime && /^\d{2}:\d{2}$/.test(btime)) {
    btimeField.value = btime;
    renderPersonalHours();
    refreshDayCard();
  }
})();

// Called by auth-widget.js after a post-sign-in cloud pull, instead of a
// full page reload. Profile.html overrides this with its own version that
// also repopulates the bday/btime fields from the freshly-synced profile;
// pages without a stored profile (Calculator, Famous Lookup) just need the
// numbers (e.g. Compatibility with Me, which reads loadProfile() fresh
// every render) to recompute in place.
window.__refreshAfterCloudSync = function () {
  render();
  if (document.getElementById('btime')) renderPersonalHours();
};

render();

/* ===================== Compat / Energy Flow popups ===================== */

function openModal() {
  document.getElementById('compatModalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('compatModalOverlay').classList.remove('active');
}

document.getElementById('compatTodayBox').addEventListener('click', () => {
  if (!lastBirthDate) return;
  const result = computeCompatibility(lastBirthDate, getToday());
  renderCompatHero(document.getElementById('compatModalBody'), result, 'You', 'Today', { compact: true, pillDateA: lastBirthDate, pillDateB: getToday() });
  openModal();
});

document.getElementById('energyFlowBox').addEventListener('click', () => {
  if (!lastBirthDate) return;
  const result = computeEnergyFlow(lastBirthDate, getToday());
  renderEnergyFlowResults(document.getElementById('compatModalBody'), result);
  openModal();
});

const pmReducedEl = document.getElementById('pmReduced');
if (pmReducedEl) {
  pmReducedEl.title = 'Click for Yearly Outlook';
  pmReducedEl.addEventListener('click', () => {
    if (!lastBirthDate || !lastMonthsTable) return;
    const ranked = computeMonthOutlook(lastBirthDate, lastMonthsTable);
    renderMonthOutlook(document.getElementById('compatModalBody'), ranked);
    openModal();
  });
}

const pyReducedEl = document.getElementById('pyReduced');
if (pyReducedEl) {
  pyReducedEl.title = 'Click for Personal Year Roadmap';
  pyReducedEl.addEventListener('click', () => {
    if (!lastBirthDate) return;
    const roadmap = computeYearRoadmap(lastBirthDate);
    renderYearRoadmap(document.getElementById('compatModalBody'), roadmap);
    openModal();
  });
}

const compatMeBox = document.getElementById('compatMeBox');
if (compatMeBox) {
  compatMeBox.addEventListener('click', () => {
    if (!lastBirthDate) return;
    const profile = loadProfile();
    if (!profile || !profile.date) {
      alert('Set your birthday on the My Profile page first, then come back to compare.');
      return;
    }
    const meDate = parseDateInput(profile.date);
    const famousNameEl = document.getElementById('famousSearch');
    const dayName = (famousNameEl && famousNameEl.value) ? famousNameEl.value : 'This Date';
    const result = computeCompatibility(meDate, lastBirthDate);
    renderCompatHero(document.getElementById('compatModalBody'), result, 'Me', dayName, { compact: true, pillDateA: meDate, pillDateB: lastBirthDate, pillPersonMode: true });
    openModal();
  });
}

document.getElementById('compatModalClose').addEventListener('click', closeModal);
document.getElementById('compatModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'compatModalOverlay') closeModal();
});

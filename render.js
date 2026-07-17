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

function render() {
  const input = document.getElementById('bday');
  const iso = displayToISO(input.value);
  if (!iso) { lastBirthDate = null; lastMonthsTable = null; return; }

  const birthDate = parseDateInput(iso);
  lastBirthDate = birthDate;
  const today = getToday();

  const r = computeAll(birthDate, today);
  lastMonthsTable = r.monthsTable;

  setText('lifePath', r.lifePath);
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
  setText('twentyEightDay', r.twentyEightDay);

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

  setText('daysUntilBirthday', r.daysLeft.daysUntilBirthday);
  setText('daysUntilMonthlyDay', r.daysLeft.daysUntilMonthlyDay);

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
}

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

  if (!timeInput.value) {
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
if (btimeInput) btimeInput.addEventListener('input', renderPersonalHours);
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
  }
})();

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
  renderCompatResults(document.getElementById('compatModalBody'), result, 'You', 'Today');
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
    renderCompatResults(document.getElementById('compatModalBody'), result, 'Me', dayName);
    openModal();
  });
}

document.getElementById('compatModalClose').addEventListener('click', closeModal);
document.getElementById('compatModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'compatModalOverlay') closeModal();
});

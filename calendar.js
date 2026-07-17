const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let viewYear;
let viewMonth; // 0-11

function setToCurrentMonth() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
}

// Daily Energy freeze rule: stop at 28/13/11/22/33. A bare 2 is only ever
// shown on the 2nd of the month - any other day that reduces to 2 shows 11.
function calendarDayReduce(n, date) {
  const freeze = [28, 13, 11, 22, 33];
  const allowBareTwo = date.getDate() === 2;
  let value = n;
  while (true) {
    if (freeze.includes(value)) return value;
    if (value === 2) return allowBareTwo ? 2 : 11;
    if (value <= 9) return value;
    value = digitSum(value);
  }
}

function dailyEnergyRaw(date) {
  return date.getDate();
}

// Which planets to mark transits for on the grid - opt-in, empty by default
// so the calendar doesn't get cluttered unless the user asks for it.
const calendarPlanetFilter = new Set();

function renderCalPlanetFilterBar() {
  const bar = document.getElementById('calPlanetFilter');
  bar.innerHTML = ASTRO_BODIES.map((b) => `
    <button type="button" class="astro-filter-chip" data-key="${b.key}" title="Show ${b.label} transits">${b.symbol}</button>
  `).join('');
  bar.querySelectorAll('.astro-filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.key;
      if (calendarPlanetFilter.has(key)) {
        calendarPlanetFilter.delete(key);
        chip.classList.remove('active');
      } else {
        calendarPlanetFilter.add(key);
        chip.classList.add('active');
      }
      renderGrid();
    });
  });

  document.getElementById('calFilterAllBtn').addEventListener('click', () => {
    ASTRO_BODIES.forEach((b) => calendarPlanetFilter.add(b.key));
    bar.querySelectorAll('.astro-filter-chip').forEach((chip) => chip.classList.add('active'));
    renderGrid();
  });

  document.getElementById('calFilterNoneBtn').addEventListener('click', () => {
    calendarPlanetFilter.clear();
    bar.querySelectorAll('.astro-filter-chip').forEach((chip) => chip.classList.remove('active'));
    renderGrid();
  });
}

// Which of the currently-filtered planets change zodiac sign on exactly this
// date (compared to the day before).
function transitsOnDay(date) {
  const results = [];
  calendarPlanetFilter.forEach((key) => {
    const prevDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
    const todayInfo = getAstroBodyInfo(key, date);
    const prevInfo = getAstroBodyInfo(key, prevDate);
    if (todayInfo.signIndex !== prevInfo.signIndex) {
      const body = ASTRO_BODIES.find((b) => b.key === key);
      results.push({ key, label: body.label, symbol: body.symbol, sign: todayInfo.sign });
    }
  });
  return results;
}

function renderHeader() {
  // The Chinese zodiac month switches on the 7th, so day 1 of a Gregorian
  // month is still under the PREVIOUS sign - anchor on the 7th to get the
  // sign that actually dominates most of the viewed month.
  const zodiacAnchor = new Date(viewYear, viewMonth, 7);
  // Western sign transitions land around the 19th-23rd most months, so the
  // 15th reliably falls in whichever sign covers the bulk of the month.
  const seasonAnchor = new Date(viewYear, viewMonth, 15);

  setText('calUniversalYear', getUniversalYear(zodiacAnchor));
  setText('calUniversalMonth', getUniversalMonth(zodiacAnchor));
  const chineseYear = getChineseZodiacYear(zodiacAnchor);
  const chineseMonth = getChineseMonth(zodiacAnchor);
  const sunSign = getSunSign(seasonAnchor);
  document.getElementById('calChineseYear').innerHTML = `${VIETNAMESE_ZODIAC_EMOJI[chineseYear] || ''} ${chineseYear}`;
  document.getElementById('calChineseMonth').innerHTML = `${VIETNAMESE_ZODIAC_EMOJI[chineseMonth] || ''} ${chineseMonth}`;
  document.getElementById('calZodiacSeason').innerHTML = `${ZODIAC_SYMBOLS[sunSign] || ''} ${sunSign}`;
  setText('calMonthLabel', `${MONTH_NAMES[viewMonth]} ${viewYear}`);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function renderGrid() {
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  WEEKDAY_NAMES.forEach((name) => {
    const el = document.createElement('div');
    el.className = 'calendar-weekday';
    el.textContent = name;
    grid.appendChild(el);
  });

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) {
    const el = document.createElement('div');
    el.className = 'calendar-day empty';
    grid.appendChild(el);
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;

  // The zodiac month that takes over on the 7th of the viewed month.
  const incomingZodiacSign = getChineseMonth(new Date(viewYear, viewMonth, 7));
  const incomingZodiacEmoji = VIETNAMESE_ZODIAC_EMOJI[incomingZodiacSign] || '';

  // The exact day (if any, within the viewed month) the Western sun sign changes.
  let seasonStartDay = null;
  let seasonStartSign = null;
  for (let d = 1; d <= daysInMonth; d++) {
    const sign = getSunSign(new Date(viewYear, viewMonth, d));
    const prevSign = getSunSign(new Date(viewYear, viewMonth, d - 1));
    if (sign !== prevSign) {
      seasonStartDay = d;
      seasonStartSign = sign;
      break;
    }
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    const universalDay = compatLifePathInfo(date).display;
    const zodiacMarker = d === 7
      ? `<span class="calendar-day-zodiac-marker" title="Chinese Zodiac Month starts: ${incomingZodiacSign}">${incomingZodiacEmoji}</span>`
      : '';
    const seasonMarker = d === seasonStartDay
      ? `<div class="calendar-day-season-marker" title="Western Zodiac Season starts: ${seasonStartSign}">${ZODIAC_SYMBOLS[seasonStartSign] || ''} ${seasonStartSign}</div>`
      : '';

    const transits = calendarPlanetFilter.size ? transitsOnDay(date) : [];
    const transitMarkers = transits.length
      ? `<div class="calendar-day-planet-markers">${transits.map((t) => `<span class="calendar-day-planet-marker" title="${t.label} enters ${t.sign}">${t.symbol}</span>`).join('')}</div>`
      : '';

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (isCurrentMonth && d === today.getDate()) cell.classList.add('today');
    cell.innerHTML = `
      <div class="calendar-day-num">${d}</div>
      <div class="calendar-day-universal">${universalDay}</div>${zodiacMarker}
      ${seasonMarker}
      ${transitMarkers}
    `;
    cell.addEventListener('click', () => openDayModal(date));
    grid.appendChild(cell);
  }
}

function parseDateStr(dateStr) {
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y - which corrupted mid-typing states in the date picker.
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function openDayModal(date) {
  const universalDay = compatLifePathInfo(date).display;
  const reducedEnergy = calendarDayReduce(dailyEnergyRaw(date), date);
  const dayOfYear = getDayOfYear(date);
  const chineseDaySign = getChineseDaySign(date);
  const sunSign = getSunSign(date);

  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const transits = calendarPlanetFilter.size ? transitsOnDay(date) : [];
  const transitRows = transits.map((t) =>
    `<div class="breakdown-row"><span>${t.symbol} ${t.label} Transit</span><span class="breakdown-score">Enters ${t.sign}</span></div>`
  ).join('');

  document.getElementById('dayModalBody').innerHTML = `
    <div class="day-modal-date">${dateLabel}</div>
    <div class="breakdown-rows day-modal-rows">
      <div class="breakdown-row"><span>Universal Day</span><span class="breakdown-score">${universalDay}</span></div>
      <div class="breakdown-row"><span>Reduced Daily Energy</span><span class="breakdown-score">${reducedEnergy}</span></div>
      <div class="breakdown-row"><span>Day # of the Year</span><span class="breakdown-score">${dayOfYear}</span></div>
      <div class="breakdown-row"><span>${VIETNAMESE_ZODIAC_EMOJI[chineseDaySign] || ''} Chinese Zodiac Day</span><span class="breakdown-score">${chineseDaySign}</span></div>
      <div class="breakdown-row"><span>${ZODIAC_SYMBOLS[sunSign] || ''} Western Zodiac Season</span><span class="breakdown-score">${sunSign}</span></div>
      ${transitRows}
    </div>
    <button class="btn day-compare-btn" id="dayCompareBtn">💫 Compare with My Profile</button>
    <div id="dayCompareResults"></div>
  `;
  document.getElementById('dayCompareBtn').addEventListener('click', () => {
    const profile = loadProfile();
    if (!profile || !profile.date) {
      alert('Set your birthday on the My Profile page first, then come back to compare.');
      return;
    }
    const meDate = parseDateStr(profile.date);
    const result = computeCompatibility(meDate, date);
    renderCompatResults(document.getElementById('dayCompareResults'), result, 'Me', dateLabel);
  });
  document.getElementById('dayModalOverlay').classList.add('active');
}

function closeDayModal() {
  document.getElementById('dayModalOverlay').classList.remove('active');
}

function tierClass(score) {
  if (score >= 77) return 'good';
  if (score < 49) return 'bad';
  return 'mid';
}

let rankMode = 'best';

function renderRankList() {
  const listEl = document.getElementById('calendarRankList');
  const profile = loadProfile();
  if (!profile || !profile.date) {
    listEl.innerHTML = '<div class="hours-empty">Set your birthday on My Profile to see this.</div>';
    return;
  }

  const meDate = parseDateStr(profile.date);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;

  let scored = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    const result = computeCompatibility(meDate, date);
    scored.push({ date, score: result.finalScore });
  }

  // Don't surface days that have already passed this month - only today onward.
  if (isCurrentMonth) {
    scored = scored.filter(({ date }) => date >= todayMidnight);
  }

  const ranked = scored.slice().sort((a, b) => (rankMode === 'best' ? b.score - a.score : a.score - b.score));
  // Pick the top 5 by score, then display them in chronological order.
  const top5 = ranked.slice(0, 5).sort((a, b) => a.date - b.date);

  listEl.innerHTML = top5.map(({ date, score }) => {
    const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `
      <div class="rank-item" data-day="${date.getDate()}">
        <span class="rank-day">${label}</span>
        <span class="rank-score ${tierClass(score)}">${score}</span>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.rank-item').forEach((item) => {
    item.addEventListener('click', () => {
      openDayModal(new Date(viewYear, viewMonth, Number(item.dataset.day)));
    });
  });
}

document.querySelectorAll('.calendar-rank-toggle .hours-toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.calendar-rank-toggle .hours-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    rankMode = btn.dataset.mode;
    renderRankList();
  });
});

document.getElementById('dayModalClose').addEventListener('click', closeDayModal);
document.getElementById('dayModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'dayModalOverlay') closeDayModal();
});

document.getElementById('calPrevBtn').addEventListener('click', () => {
  viewMonth -= 1;
  if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
  renderHeader();
  renderGrid();
  renderRankList();
});

document.getElementById('calNextBtn').addEventListener('click', () => {
  viewMonth += 1;
  if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
  renderHeader();
  renderGrid();
  renderRankList();
});

document.getElementById('calTodayBtn').addEventListener('click', () => {
  setToCurrentMonth();
  renderHeader();
  renderGrid();
  renderRankList();
});

renderCalPlanetFilterBar();
setToCurrentMonth();
renderHeader();
renderGrid();
renderRankList();

/* Versus (Boost13 2026-08-14, 16 answers) - two full charts side by side
   under today's numbers. Top rectangle: today's Universal Day (impure
   display), Energy, Day#, Combo, and Vietnamese year/month/day animals.
   Each panel: numerology core + Vietnamese natal animals + current
   personal cycles + sun sign; every row checks BOTH sides against
   today's matching layer with the real (override-aware) tables and tints
   the stronger side. One vs-today percentage per side (higher glows) and
   the head-to-head compatibility shield between them. Sides arrive by
   manual date, Database pick, or the Scout tab's tap-through params
   (?a=YYYY-MM-DD&an=Name&b=...&bn=...). No extra buttons - a reading
   instrument, per the owner's call. */

(function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* ---------------- today strip ---------------- */
  const tUdInfo = compatLifePathInfo(today);
  const tUd = tUdInfo.lookupValue;
  const tEnergy = reduceNumber(today.getDate());
  const tDayNum = reduceNumber(getDayOfYear(today));
  const tCombo = getCombo(today);
  const tYearAn = getChineseZodiacYear(today);
  const tMonthAn = getChineseMonth(today);
  const tDayAn = getChineseDaySign(today);
  const tUy = getUniversalYear(today);
  const tUm = getUniversalMonth(today);
  const tSun = getSunSign(today);
  const em = (a) => (typeof VIETNAMESE_ZODIAC_EMOJI !== 'undefined' && VIETNAMESE_ZODIAC_EMOJI[a]) || '';

  document.getElementById('vsToday').innerHTML = [
    ['Universal Day', tUdInfo.display],
    ['Energy', tEnergy],
    ['Day#', tDayNum],
    ['Combo', tCombo],
    ['Year', em(tYearAn) + ' ' + tYearAn],
    ['Month', em(tMonthAn) + ' ' + tMonthAn],
    ['Day', em(tDayAn) + ' ' + tDayAn],
  ].map(([label, val]) => `<div class="vs-tstat"><b>${val}</b><span>${label}</span></div>`).join('');

  /* ---------------- side state ---------------- */
  function parseIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date();
    dt.setFullYear(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  const els = {
    nameA: document.getElementById('vsNameA'), nameB: document.getElementById('vsNameB'),
    dateA: document.getElementById('vsDateA'), dateB: document.getElementById('vsDateB'),
    pickA: document.getElementById('vsPickA'), pickB: document.getElementById('vsPickB'),
  };

  // Database picker: every dated entry across every category.
  try {
    const db = loadDB();
    const opts = [];
    (db.categories || []).forEach((cat) => {
      (cat.entries || []).forEach((e) => {
        if (e && e.name && e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
          opts.push({ label: `${e.name} (${cat.name})`, name: e.name, date: e.date });
        }
      });
    });
    opts.sort((a, b) => a.label.localeCompare(b.label));
    const optionsHtml = opts.map((o, i) => `<option value="${i}">${escapeHtml(o.label)}</option>`).join('');
    els.pickA.insertAdjacentHTML('beforeend', optionsHtml);
    els.pickB.insertAdjacentHTML('beforeend', optionsHtml);
    const applyPick = (sel, nameEl, dateEl) => {
      const o = opts[Number(sel.value)];
      if (!o) return;
      nameEl.value = o.name;
      dateEl.value = o.date;
      render();
    };
    els.pickA.addEventListener('change', () => applyPick(els.pickA, els.nameA, els.dateA));
    els.pickB.addEventListener('change', () => applyPick(els.pickB, els.nameB, els.dateB));
  } catch (e) {}

  // Scout tap-through / shared links.
  const params = new URLSearchParams(location.search);
  if (params.get('a')) els.dateA.value = params.get('a');
  if (params.get('b')) els.dateB.value = params.get('b');
  if (params.get('an')) els.nameA.value = params.get('an');
  if (params.get('bn')) els.nameB.value = params.get('bn');

  ['input', 'change'].forEach((ev) => {
    els.dateA.addEventListener(ev, render);
    els.dateB.addEventListener(ev, render);
    els.nameA.addEventListener(ev, renderNamesOnly);
    els.nameB.addEventListener(ev, renderNamesOnly);
  });

  function tierOf(s) { return s >= 77 ? 'good' : s < 49 ? 'bad' : 'mid'; }

  function renderNamesOnly() {
    document.getElementById('vsShowNameA').textContent = els.nameA.value || 'Side A';
    document.getElementById('vsShowNameB').textContent = els.nameB.value || 'Side B';
  }

  /* ---------------- the matchup ---------------- */
  function sideData(birth) {
    const r = computeAll(birth, today);
    return {
      r,
      lpLookup: compatLifePathInfo(birth).lookupValue,
      vsToday: computeCompatibility(birth, today).finalScore,
      lucky: computeLuckyBonus(birth, today).total,
      sun: r.sunSign,
    };
  }

  // One row: both values + the vs-today check that decides the tint.
  // scoreFn(side) returns that side's strength against today's matching
  // layer via the real override-aware tables; higher side wins the row.
  function row(label, valA, valB, scoreA, scoreB) {
    const winA = scoreA != null && scoreB != null && scoreA > scoreB;
    const winB = scoreA != null && scoreB != null && scoreB > scoreA;
    const sub = (s) => (s == null ? '' : `<span class="vs-sub">${s} vs today</span>`);
    return `<tr>
      <td class="${winA ? 'win' : ''}">${valA}${sub(scoreA)}</td>
      <td class="vs-label">${label}</td>
      <td class="${winB ? 'win' : ''}">${valB}${sub(scoreB)}</td>
    </tr>`;
  }

  function render() {
    renderNamesOnly();
    const a = parseIso(els.dateA.value);
    const b = parseIso(els.dateB.value);
    const results = document.getElementById('vsResults');
    const empty = document.getElementById('vsEmpty');
    if (!a || !b) {
      results.style.display = 'none';
      empty.style.display = '';
      return;
    }
    results.style.display = '';
    empty.style.display = 'none';

    const A = sideData(a);
    const B = sideData(b);

    const sA = document.getElementById('vsScoreA');
    const sB = document.getElementById('vsScoreB');
    sA.innerHTML = A.vsToday + '%<span>vs today</span>';
    sB.innerHTML = B.vsToday + '%<span>vs today</span>';
    sA.className = 'vs-score ' + tierOf(A.vsToday) + (A.vsToday > B.vsToday ? ' lead' : '');
    sB.className = 'vs-score ' + tierOf(B.vsToday) + (B.vsToday > A.vsToday ? ' lead' : '');

    const h2h = computeCompatibility(a, b).finalScore;
    const shield = document.getElementById('vsShield');
    shield.innerHTML = h2h + '%<span>h2h</span>';
    shield.className = 'vs-shield ' + tierOf(h2h);

    const n = (x, y) => numerologyCompatEffective(x, y);
    const v = (x, y) => vietnameseCompatEffective(x, y);
    const anCell = (animal) => `${em(animal)} ${animal}`;

    document.getElementById('vsGrid').innerHTML = [
      row('Life Path', A.r.lifePath, B.r.lifePath, n(A.lpLookup, tUd), n(B.lpLookup, tUd)),
      row('Day Born', A.r.dayBornReduced, B.r.dayBornReduced, n(A.r.dayBornReduced, tEnergy), n(B.r.dayBornReduced, tEnergy)),
      row('Day#', A.r.dayNumReduced, B.r.dayNumReduced, n(A.r.dayNumReduced, tDayNum), n(B.r.dayNumReduced, tDayNum)),
      row('Combo', A.r.combo, B.r.combo, n(A.r.combo, tCombo), n(B.r.combo, tCombo)),
      // Lucky has no pair table - the day either triggers a side's lucky
      // bonus or it doesn't, so the bonus total IS the score.
      row('Lucky', A.r.luckyNumber, B.r.luckyNumber, A.lucky, B.lucky),
      row('Viet Year', anCell(A.r.chineseYear), anCell(B.r.chineseYear), v(A.r.chineseYear, tYearAn), v(B.r.chineseYear, tYearAn)),
      row('Viet Month', anCell(A.r.chineseMonth), anCell(B.r.chineseMonth), v(A.r.chineseMonth, tMonthAn), v(B.r.chineseMonth, tMonthAn)),
      row('Viet Day', anCell(A.r.chineseDay), anCell(B.r.chineseDay), v(A.r.chineseDay, tDayAn), v(B.r.chineseDay, tDayAn)),
      row('Pers. Year', A.r.py.reduced, B.r.py.reduced, n(A.r.py.reduced, tUy), n(B.r.py.reduced, tUy)),
      row('Pers. Month', A.r.pm.reduced, B.r.pm.reduced, n(A.r.pm.reduced, tUm), n(B.r.pm.reduced, tUm)),
      row('Pers. Day', A.r.pd.reduced, B.r.pd.reduced, n(A.r.pd.reduced, tUd), n(B.r.pd.reduced, tUd)),
      row('Sun', A.sun, B.sun, westernCompatEffective(A.sun, tSun), westernCompatEffective(B.sun, tSun)),
    ].join('');
  }

  render();
})();

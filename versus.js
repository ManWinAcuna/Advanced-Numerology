/* Versus (Boost13 2026-08-14; day picker + visual pass 2026-08-22) - two
   full charts side by side under a CHOSEN day's numbers. The day defaults
   to today and is steppable/tappable from the header, so a Saturday card
   can be scored on fight day, not scan day. Top instrument: the day's
   Universal Day (impure display), Energy, Day#, Combo, and Vietnamese
   year/month/day animals. Each panel: numerology core + Vietnamese natal
   animals + current personal cycles + sun sign; every row checks BOTH
   sides against the day's matching layer with the real (override-aware)
   tables, tints the stronger side, and the center spine shows the day's
   own value for that layer. One vs-day percentage per side (leader
   glows), the head-to-head shield between them, and a rows-won tally.
   Sides arrive by manual date or the Scout tab's tap-through params
   (?a=YYYY-MM-DD&an=Name&b=...&bn=..., optional &d=YYYY-MM-DD to open
   on a specific day). No extra buttons - a reading instrument, per the
   owner's call (Database picker removed 2026-08-22, owner's call). */

(function () {
  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function parseIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date();
    dt.setFullYear(y, m - 1, d);
    return dayStart(dt);
  }
  function isoOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  const realToday = dayStart(new Date());
  let focus = dayStart(new Date());

  const em = (a) => (typeof VIETNAMESE_ZODIAC_EMOJI !== 'undefined' && VIETNAMESE_ZODIAC_EMOJI[a]) || '';
  function tierOf(s) { return s >= 77 ? 'good' : s < 49 ? 'bad' : 'mid'; }

  const els = {
    nameA: document.getElementById('vsNameA'), nameB: document.getElementById('vsNameB'),
    dateA: document.getElementById('vsDateA'), dateB: document.getElementById('vsDateB'),
    day: document.getElementById('vsDay'), dayPretty: document.getElementById('vsDayPretty'),
    dayPrev: document.getElementById('vsDayPrev'), dayNext: document.getElementById('vsDayNext'),
    dayReset: document.getElementById('vsDayReset'), dayTap: document.getElementById('vsDayTap'),
  };

  /* ---------------- the day ---------------- */
  // Everything on the page is scored against this one context - the strip,
  // both vs-day percentages, and every row's matching layer.
  function dayCtx(day) {
    const udInfo = compatLifePathInfo(day);
    return {
      day,
      ud: udInfo.lookupValue, udDisplay: udInfo.display,
      energy: reduceNumber(day.getDate()),
      dayNum: reduceNumber(getDayOfYear(day)),
      combo: getCombo(day),
      yearAn: getChineseZodiacYear(day),
      monthAn: getChineseMonth(day),
      dayAn: getChineseDaySign(day),
      uy: getUniversalYear(day), um: getUniversalMonth(day),
      sun: getSunSign(day),
    };
  }

  function isFocusToday() { return focus.getTime() === realToday.getTime(); }
  function focusLabel() {
    return isFocusToday() ? 'today'
      : focus.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function renderDayHead() {
    const wd = focus.toLocaleDateString([], { weekday: 'short' });
    const md = focus.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const yr = focus.getFullYear() !== realToday.getFullYear() ? ' · ' + focus.getFullYear() : '';
    els.dayPretty.textContent = wd + ' · ' + md + yr;
    els.day.value = isoOf(focus);
    const t = isFocusToday();
    els.dayReset.textContent = t ? 'Today' : '↺ Today';
    els.dayReset.classList.toggle('is-today', t);
    els.dayReset.disabled = t;
  }

  function renderStrip(t) {
    document.getElementById('vsToday').innerHTML = [
      ['Universal Day', t.udDisplay, false],
      ['Energy', t.energy, false],
      ['Day#', t.dayNum, false],
      ['Combo', t.combo, false],
      ['Year', em(t.yearAn) + ' ' + t.yearAn, true],
      ['Month', em(t.monthAn) + ' ' + t.monthAn, true],
      ['Day', em(t.dayAn) + ' ' + t.dayAn, true],
    ].map(([label, val, an]) =>
      `<div class="vs-tstat${an ? ' an' : ''}"><b>${val}</b><span>${label}</span></div>`).join('');
  }

  function setFocus(d) { focus = d; render(); }
  els.dayPrev.addEventListener('click', () =>
    setFocus(dayStart(new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() - 1))));
  els.dayNext.addEventListener('click', () =>
    setFocus(dayStart(new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + 1))));
  els.dayReset.addEventListener('click', () => setFocus(dayStart(new Date())));
  els.day.addEventListener('change', () => {
    const p = parseIso(els.day.value);
    if (p) setFocus(p);
  });
  // Desktop browsers only open the native calendar from the icon - force it
  // from anywhere on the date text. Mobile taps land on the overlay input
  // natively; the try swallows "picker already open".
  els.dayTap.addEventListener('click', () => {
    try { if (els.day.showPicker) els.day.showPicker(); } catch (e) {}
  });

  /* ---------------- side inputs ---------------- */
  // Scout tap-through / shared links.
  const params = new URLSearchParams(location.search);
  if (params.get('a')) els.dateA.value = params.get('a');
  if (params.get('b')) els.dateB.value = params.get('b');
  if (params.get('an')) els.nameA.value = params.get('an');
  if (params.get('bn')) els.nameB.value = params.get('bn');
  const pd = parseIso(params.get('d') || '');
  if (pd) focus = pd;

  ['input', 'change'].forEach((ev) => {
    els.dateA.addEventListener(ev, render);
    els.dateB.addEventListener(ev, render);
    els.nameA.addEventListener(ev, refreshNames);
    els.nameB.addEventListener(ev, refreshNames);
  });

  function nameOf(side) {
    return (side === 'A' ? els.nameA : els.nameB).value.trim() || 'Side ' + side;
  }
  function refreshNames() {
    const a = document.getElementById('vsBandNameA');
    const b = document.getElementById('vsBandNameB');
    if (a) a.textContent = nameOf('A');
    if (b) b.textContent = nameOf('B');
  }

  /* ---------------- the matchup ---------------- */
  function sideData(birth, t) {
    const r = computeAll(birth, t.day);
    return {
      r,
      lpLookup: compatLifePathInfo(birth).lookupValue,
      vsDay: computeCompatibility(birth, t.day).finalScore,
      lucky: computeLuckyBonus(birth, t.day).total,
      sun: r.sunSign,
    };
  }

  function render() {
    const t = dayCtx(focus);
    renderDayHead();
    renderStrip(t);

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

    const A = sideData(a, t);
    const B = sideData(b, t);
    const label = focusLabel();

    const sA = document.getElementById('vsScoreA');
    const sB = document.getElementById('vsScoreB');
    sA.innerHTML = `<span class="vs-score-name" id="vsBandNameA">${escapeHtml(nameOf('A'))}</span>`
      + `<b>${A.vsDay}%</b><span class="sub">vs ${label}</span>`;
    sB.innerHTML = `<span class="vs-score-name" id="vsBandNameB">${escapeHtml(nameOf('B'))}</span>`
      + `<b>${B.vsDay}%</b><span class="sub">vs ${label}</span>`;
    sA.className = 'vs-score ' + tierOf(A.vsDay) + (A.vsDay > B.vsDay ? ' lead' : '');
    sB.className = 'vs-score ' + tierOf(B.vsDay) + (B.vsDay > A.vsDay ? ' lead' : '');

    // Head-to-head is a birthdate pair - the chosen day never moves it.
    const h2h = computeCompatibility(a, b).finalScore;
    const shield = document.getElementById('vsShield');
    shield.innerHTML = `<b>${h2h}%</b><span>H2H</span>`;
    shield.className = 'vs-shield ' + tierOf(h2h);

    const n = (x, y) => numerologyCompatEffective(x, y);
    const v = (x, y) => vietnameseCompatEffective(x, y);
    const anCell = (animal) => `${em(animal)} ${animal}`;

    // One row: both values, the day's own value for that layer in the
    // center spine, and the table score that decides the tint. Higher
    // side wins the row; the tally feeds the edge line.
    const cells = [];
    let winsA = 0;
    let winsB = 0;
    function row(rowLabel, dayVal, valA, valB, scoreA, scoreB, tierFn) {
      const tf = tierFn || tierOf;
      const both = scoreA != null && scoreB != null;
      const winA = both && scoreA > scoreB;
      const winB = both && scoreB > scoreA;
      if (winA) winsA++;
      if (winB) winsB++;
      const rs = (s) => (s == null ? '' : `<span class="vs-rs ${tf(s)}">${s}</span>`);
      cells.push(`<tr>
        <td class="side a ${winA ? 'win' : ''}"><b>${valA}</b>${rs(scoreA)}</td>
        <td class="vs-spine"><span class="l">${rowLabel}</span><b>${dayVal}</b></td>
        <td class="side b ${winB ? 'win' : ''}"><b>${valB}</b>${rs(scoreB)}</td>
      </tr>`);
    }

    // Lucky has no pair table - the day either triggers a side's lucky
    // bonus or it doesn't, so the bonus total IS the score (its own tier
    // coloring: any bonus glows, zero stays quiet).
    const luckyTier = (s) => (s > 0 ? 'good' : 'none');

    row('Life Path', t.udDisplay, A.r.lifePath, B.r.lifePath, n(A.lpLookup, t.ud), n(B.lpLookup, t.ud));
    row('Day Born', t.energy, A.r.dayBornReduced, B.r.dayBornReduced, n(A.r.dayBornReduced, t.energy), n(B.r.dayBornReduced, t.energy));
    row('Day#', t.dayNum, A.r.dayNumReduced, B.r.dayNumReduced, n(A.r.dayNumReduced, t.dayNum), n(B.r.dayNumReduced, t.dayNum));
    row('Combo', t.combo, A.r.combo, B.r.combo, n(A.r.combo, t.combo), n(B.r.combo, t.combo));
    row('Lucky', '·', A.r.luckyNumber, B.r.luckyNumber, A.lucky, B.lucky, luckyTier);
    row('Viet Year', anCell(t.yearAn), anCell(A.r.chineseYear), anCell(B.r.chineseYear), v(A.r.chineseYear, t.yearAn), v(B.r.chineseYear, t.yearAn));
    row('Viet Month', anCell(t.monthAn), anCell(A.r.chineseMonth), anCell(B.r.chineseMonth), v(A.r.chineseMonth, t.monthAn), v(B.r.chineseMonth, t.monthAn));
    row('Viet Day', anCell(t.dayAn), anCell(A.r.chineseDay), anCell(B.r.chineseDay), v(A.r.chineseDay, t.dayAn), v(B.r.chineseDay, t.dayAn));
    row('Pers. Year', t.uy, A.r.py.reduced, B.r.py.reduced, n(A.r.py.reduced, t.uy), n(B.r.py.reduced, t.uy));
    row('Pers. Month', t.um, A.r.pm.reduced, B.r.pm.reduced, n(A.r.pm.reduced, t.um), n(B.r.pm.reduced, t.um));
    row('Pers. Day', t.udDisplay, A.r.pd.reduced, B.r.pd.reduced, n(A.r.pd.reduced, t.ud), n(B.r.pd.reduced, t.ud));
    row('Sun', t.sun, A.sun, B.sun, westernCompatEffective(A.sun, t.sun), westernCompatEffective(B.sun, t.sun));

    document.getElementById('vsGrid').innerHTML = cells.join('');

    const evens = cells.length - winsA - winsB;
    document.getElementById('vsEdge').innerHTML =
      `<i class="a"></i><span class="cnt">${winsA}</span>`
      + `<span>rows${evens ? ' · ' + evens + ' even' : ''}</span>`
      + `<span class="cnt">${winsB}</span><i class="b"></i>`;
  }

  render();
})();

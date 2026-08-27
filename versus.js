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
  function tierOf(s) { return s >= 82 ? 'good' : s < 58 ? 'bad' : 'mid'; }

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
    updateBars();
  }

  /* ---------------- name lookup ----------------
     Same instrument as Famous Lookup: Wikipedia opensearch suggestions
     under the name field, and picking one runs the full Wikidata-then-
     infobox cascade (lookupKeyDateByName, db-core.js) to fill the
     birthdate. The resolved KIND is always shown ("born 1993-07-13" vs
     "founded ...") so a non-person match can never silently pass as a
     birthday; partial dates are rejected outright (never fabricate). */
  const KIND_VERB = { born: 'born', founded: 'founded', opened: 'opened', released: 'released' };
  function wireLookup(nameEl, dateEl, sugId, lkId) {
    const sug = document.getElementById(sugId);
    const lk = document.getElementById(lkId);
    let matches = [];
    let timer = null;
    let seq = 0;

    function close() { sug.classList.remove('open'); sug.innerHTML = ''; }
    function status(text, cls) { lk.textContent = text; lk.className = 'vs-lk' + (cls ? ' ' + cls : ''); }

    function showMatches() {
      sug.innerHTML = matches.length
        ? matches.map((m, i) => `
          <div class="suggestion-item" data-index="${i}">
            <span class="suggestion-name">${escapeHtml(m.title)}</span>
            ${m.description ? `<span class="suggestion-meta">${escapeHtml(m.description).slice(0, 46)}</span>` : ''}
          </div>`).join('')
        : '<div class="suggestion-empty">No matches found</div>';
      sug.classList.add('open');
    }

    function search(q) {
      const url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search='
        + encodeURIComponent(q) + '&limit=8&namespace=0&format=json&origin=*';
      fetch(url)
        .then((res) => res.json())
        .then(([, titles, descriptions]) => {
          matches = (titles || []).map((title, i) => ({ title, description: (descriptions || [])[i] || '' }));
          showMatches();
        })
        .catch(() => {
          matches = [];
          sug.innerHTML = '<div class="suggestion-empty">Search failed - check your connection</div>';
          sug.classList.add('open');
        });
    }

    function pick(title) {
      const my = ++seq;
      nameEl.value = title;
      refreshNames();
      close();
      status('Looking up date…');
      lookupKeyDateByName(title)
        .then((hit) => {
          if (my !== seq) return;
          if (hit && hit.date && /^\d{4}-\d{2}-\d{2}$/.test(hit.date)) {
            dateEl.value = hit.date;
            status('✓ ' + (KIND_VERB[hit.kind] || 'born') + ' ' + hit.date, 'ok');
            render();
          } else {
            status('No exact date found', 'err');
          }
        })
        .catch(() => {
          if (my !== seq) return;
          status('Lookup failed. Try again.', 'err');
        });
    }

    nameEl.addEventListener('input', () => {
      status('');
      const q = nameEl.value.trim();
      clearTimeout(timer);
      if (!q) { close(); return; }
      timer = setTimeout(() => search(q), 300);
    });
    // A hand-typed date replaces whatever a lookup found - drop its label.
    dateEl.addEventListener('input', () => status(''));

    sug.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      const m = matches[Number(item.dataset.index)];
      if (m) pick(m.title);
    });
    document.addEventListener('click', (e) => {
      if (e.target !== nameEl && !sug.contains(e.target)) sug.classList.remove('open');
    });
  }
  wireLookup(els.nameA, els.dateA, 'vsSugA', 'vsLkA');
  wireLookup(els.nameB, els.dateB, 'vsSugB', 'vsLkB');

  /* ---------------- saved matchups (this device) ----------------
     A save is the two sides plus the chosen day IF one is pinned (off
     today) - same pair on a different fight day is its own save. Chips
     restore everything in one tap; ✕ forgets one. */
  const SAVE_KEY = 'numerology_versus_saved_v1';
  function loadSaved() {
    try {
      const a = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function storeSaved(list) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function currentMatch() {
    if (!parseIso(els.dateA.value) || !parseIso(els.dateB.value)) return null;
    const m = { an: nameOf('A'), a: els.dateA.value, bn: nameOf('B'), b: els.dateB.value };
    if (!isFocusToday()) m.d = isoOf(focus);
    return m;
  }
  function matchKey(m) { return m.a + '|' + m.b + '|' + (m.d || ''); }

  function updateBars() {
    const saveBtn = document.getElementById('vsSaveBtn');
    const clearBtn = document.getElementById('vsClearBtn');
    const m = currentMatch();
    if (m) {
      saveBtn.hidden = false;
      const exists = loadSaved().some((s) => matchKey(s) === matchKey(m));
      saveBtn.textContent = exists ? '✓ Saved' : '☆ Save matchup';
      saveBtn.classList.toggle('saved', exists);
      saveBtn.disabled = exists;
    } else {
      saveBtn.hidden = true;
    }
    clearBtn.hidden = !(els.nameA.value || els.nameB.value || els.dateA.value || els.dateB.value);
  }

  function renderSaved() {
    const list = loadSaved();
    document.getElementById('vsSaved').innerHTML = list.map((m, i) => {
      const pdDate = m.d ? parseIso(m.d) : null;
      const day = pdDate
        ? `<span class="d"> · ${pdDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>`
        : '';
      return `<span class="vs-chip" data-i="${i}"><b>${escapeHtml(m.an)} vs ${escapeHtml(m.bn)}</b>${day}<span class="x" data-x="${i}">✕</span></span>`;
    }).join('');
    updateBars();
  }

  document.getElementById('vsSaveBtn').addEventListener('click', () => {
    const m = currentMatch();
    if (!m) return;
    const list = loadSaved();
    if (!list.some((s) => matchKey(s) === matchKey(m))) {
      list.unshift(m);
      storeSaved(list);
    }
    renderSaved();
  });

  document.getElementById('vsClearBtn').addEventListener('click', () => {
    els.nameA.value = ''; els.nameB.value = '';
    els.dateA.value = ''; els.dateB.value = '';
    ['vsLkA', 'vsLkB'].forEach((id) => {
      const el = document.getElementById(id);
      el.textContent = ''; el.className = 'vs-lk';
    });
    ['vsSugA', 'vsSugB'].forEach((id) => {
      const el = document.getElementById(id);
      el.innerHTML = ''; el.classList.remove('open');
    });
    render();
  });

  document.getElementById('vsSaved').addEventListener('click', (e) => {
    const x = e.target.closest('.x');
    if (x) {
      const list = loadSaved();
      list.splice(Number(x.dataset.x), 1);
      storeSaved(list);
      renderSaved();
      return;
    }
    const chip = e.target.closest('.vs-chip');
    if (!chip) return;
    const m = loadSaved()[Number(chip.dataset.i)];
    if (!m) return;
    els.nameA.value = m.an; els.dateA.value = m.a;
    els.nameB.value = m.bn; els.dateB.value = m.b;
    focus = (m.d && parseIso(m.d)) || dayStart(new Date());
    render();
  });

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
    updateBars();

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
    // Spine labels name the DAY's value in the middle (owner's call
    // 2026-08-22): sides bring their personal cycles, the center is the
    // universal year/month/day they are scored against.
    row('Universal Year', t.uy, A.r.py.reduced, B.r.py.reduced, n(A.r.py.reduced, t.uy), n(B.r.py.reduced, t.uy));
    row('Universal Month', t.um, A.r.pm.reduced, B.r.pm.reduced, n(A.r.pm.reduced, t.um), n(B.r.pm.reduced, t.um));
    row('Universal Day', t.udDisplay, A.r.pd.reduced, B.r.pd.reduced, n(A.r.pd.reduced, t.ud), n(B.r.pd.reduced, t.ud));
    row('Sun', t.sun, A.sun, B.sun, westernCompatEffective(A.sun, t.sun), westernCompatEffective(B.sun, t.sun));

    document.getElementById('vsGrid').innerHTML = cells.join('');

    const evens = cells.length - winsA - winsB;
    document.getElementById('vsEdge').innerHTML =
      `<i class="a"></i><span class="cnt">${winsA}</span>`
      + `<span>rows${evens ? ' · ' + evens + ' even' : ''}</span>`
      + `<span class="cnt">${winsB}</span><i class="b"></i>`;
  }

  render();
  renderSaved();
})();

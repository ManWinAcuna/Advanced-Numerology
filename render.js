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

  renderCompoundStories(r, birthDate);
}

// Boost13, 2026-08-06: Core Numbers and Personal Cycles each get their own
// tap-to-reveal "whole story" (the specific compound behind each number,
// not just its reduced root), plus one page-wide "big picture" combining
// both. Purely the person's own numbers - today's date never enters this
// (that's Today page's job alone). Idempotent: inserts each tap target
// once, then just re-wires its click handler on every render() call so a
// changed birthdate always reopens with fresh content.
function insertStoryLink(id, afterSelector, label) {
  let el = document.getElementById(id);
  if (el) return el;
  const anchor = document.querySelector(afterSelector);
  if (!anchor) return null;
  el = document.createElement('button');
  el.type = 'button';
  el.id = id;
  el.className = 'story-link';
  el.textContent = label;
  anchor.insertAdjacentElement('afterend', el);
  return el;
}

function openStoryModal(title, story) {
  if (!story) return;
  document.getElementById('storyModalBody').innerHTML =
    `<div class="story-modal-title">${title}</div><div class="story-modal-text">${story.text}</div>`;
  document.getElementById('storyModalOverlay').classList.add('active');
}

// Round 14 (2026-08-06): per-number identity popups - tap Lifepath/Day
// Born/Day#/PD to get just that number's own "who you are" section
// (moved here from Today's modal, where it described the profile owner
// but lived on the wrong page).
//
// 2026-08-08 round 2: light/shadow got pulled from these popups entirely
// - the general reading already shows that exact text verbatim, so
// leaving it in the popup meant tapping Lifepath and then reading the
// general reading repeated the same sentence twice. User: "don't make it
// be the same thing that's going to be shown on the general reading,
// this is why I gave you a lot of copy so there's no repeats." Popups
// now show ONLY the characteristics bullets (the PDF's Emotional Reality
// Checks) - content composeGeneralReading never touches. First occurrence
// of a root shows characteristics (3); a repeat shows moreCharacteristics
// (2, the reserve) instead of the same bullets again.
function openIdentityModal(label, entry, opts) {
  if (!entry) return;
  const o = opts || {};
  const list = o.cherry ? (entry.moreCharacteristics || []) : (entry.characteristics || []);
  if (!list.length) return;
  const bullets = list.map((c) => `<li>${c}</li>`).join('');
  const note = o.cherry ? `<div class="story-row">Same energy as your ${o.repeatOf}. A few more angles:</div>` : '';
  document.getElementById('storyModalBody').innerHTML =
    `<div class="story-modal-title">${label}</div>${note}<ul class="story-bullets">${bullets}</ul>`;
  document.getElementById('storyModalOverlay').classList.add('active');
}

// Boost13 (2026-08-07): tap Western sign / Vietnamese year/month/day for
// their own "who you are" popup, same visual pattern as openIdentityModal
// above but pulling straight from the plain-voice content bank.
//
// 2026-08-08 round 2: same fix as openIdentityModal - light/shadow
// dropped (duplicates the general reading verbatim). `deep` (the
// emotional-core line, general reading never touches it) stays as a
// short intro, then characteristics/moreCharacteristics bullets exactly
// like the number popups - first occurrence gets characteristics (3), a
// repeat animal gets moreCharacteristics (2) instead of the same content.
function openZodiacIdentityModal(label, entry, opts) {
  if (!entry) return;
  const o = opts || {};
  const list = o.cherry ? (entry.moreCharacteristics || []) : (entry.characteristics || []);
  if (!list.length) return;
  const bullets = list.map((c) => `<li>${c}</li>`).join('');
  const note = o.cherry
    ? `<div class="story-row">Same animal as your ${o.repeatOf}. A few more angles:</div>`
    : (entry.deep ? `<div class="story-row">${entry.deep}</div>` : '');
  document.getElementById('storyModalBody').innerHTML =
    `<div class="story-modal-title">${label}</div>${note}<ul class="story-bullets">${bullets}</ul>`;
  document.getElementById('storyModalOverlay').classList.add('active');
}

function renderCompoundStories(r, birthDate) {
  // isFamous (2026-08-07): weaveIdentityStory's "you" voice ("At your
  // core, you are...") is correct for Profile/Calculator (a real person's
  // own numbers) but would misdescribe a famous person's - Famous Lookup
  // keeps the original day-voice weaveResolvedStory for its "full story"/
  // "big picture" buttons, same reasoning as the identityTargets guard
  // below (which already excluded Famous from the individual-number taps).
  const isFamous = /famous/i.test(location.pathname);

  // slot (2026-08-07) picks each number's IDENTITY_SLOTS entry for
  // weaveIdentityStory's "you" voice - same slots the individual number
  // tap popups below already use, so the aggregate story and the per-
  // number popups never disagree on how a given number is framed.
  const coreParts = [
    { label: 'Life Path', slot: 'core', raw: null, entry: compoundEntryForLifePath(r.lifePath, r.lifePathCompound) },
    { label: 'Day Born', slot: 'rhythm', raw: r.dayBornRaw },
    { label: 'Day#', slot: 'year', raw: r.dayNumRaw },
    { label: 'Combo', slot: 'combo', raw: compoundRawCombo(birthDate) },
  ].map((p) => ({ label: p.label, slot: p.slot, entry: p.entry || compoundEntry(p.raw) }));

  const cycleParts = [
    { label: 'Personal Year', slot: 'personalYear', raw: r.py.raw },
    { label: 'Personal Month', slot: 'personalMonth', raw: r.pm.raw },
    { label: 'Personal Day', slot: 'today', raw: r.pd.raw },
  ].map((p) => ({ label: p.label, slot: p.slot, entry: compoundEntry(p.raw) }));

  // 2026-08-07 round 2: "the full story"/"the big picture"/Personal
  // Cycles' "full story" are obsolete everywhere now that "the general
  // reading" covers the same ground with real content - user: "get rid of
  // it and replace it with the current general reading, same with the big
  // picture... the full story of the personal cycles we'll work on that
  // later so get rid of those [too]." Initially kept these for Famous
  // Lookup only (the general reading is "you"-voice, which can't describe
  // a famous person) - user corrected that too: "add it but don't give it
  // you voice, just use general reading language" for Famous. So all 3
  // old static buttons are hidden everywhere; Famous gets the general
  // reading via composeGeneralReading's thirdPerson option instead of its
  // own separate weave.
  const coreLinkOld = document.getElementById('coreNumbersStoryLink');
  if (coreLinkOld) coreLinkOld.style.display = 'none';
  const cyclesLinkOld = document.getElementById('personalCyclesStoryLink');
  if (cyclesLinkOld) cyclesLinkOld.style.display = 'none';
  const bigLinkOld = document.getElementById('bigPictureStoryLink');
  if (bigLinkOld) bigLinkOld.style.display = 'none';

  // Boost13 (2026-08-07): "the general reading" - timeless identity only
  // (Life Path, Day Born, Combo, Western Sign, Vietnamese Year/Month/Day),
  // explicitly NOT Personal Year/Month/Day - user: "the today stuff is
  // for the day and personal day, this is simply a general reading."
  // Takes the Core Numbers "full story" link's old spot on every page.
  // Personal Cycles' equivalent (same register approach applied to
  // Personal Year/Month/Day) is deferred - not built yet, so nothing
  // replaces that link yet.
  const generalParts = [
    { kind: 'number', root: coreParts[0].entry.root, impure: coreParts[0].entry.impure, isLifePath: true },
    { kind: 'number', root: coreParts[1].entry.root, impure: coreParts[1].entry.impure },
    { kind: 'number', root: coreParts[3].entry.root, impure: coreParts[3].entry.impure },
    { kind: 'sign', key: r.sunSign },
    { kind: 'animal', key: r.chineseYear },
    { kind: 'animal', key: r.chineseMonth },
    { kind: 'animal', key: r.chineseDay },
  ];
  const generalReading = composeGeneralReading(generalParts, { thirdPerson: isFamous });
  const generalLink = insertStoryLink('generalReadingStoryLink', '.grid4.subrow', '🧭 the general reading');
  if (generalLink) {
    generalLink.style.display = generalReading ? '' : 'none';
    generalLink.onclick = () => openStoryModal('The General Reading', generalReading);
  }

  // Round 14: the 4 identity numbers become tappable, each opening its
  // own popup. Profile + Calculator only - the copy is written as "you
  // are...", which doesn't fit describing a famous person. Slots match
  // Today's old My Numbers framing exactly (core/rhythm/year/today).
  if (!isFamous) {
    // root marks which slots share a number - the first occurrence gets
    // the fuller read (light/shadow/characteristics), a repeat gets one
    // new line from moreCharacteristics instead of the same content again.
    const identityTargets = [
      { id: 'lifePath', label: 'Lifepath', root: coreParts[0].entry.root, impure: coreParts[0].entry.impure },
      { id: 'dayBornReduced', label: 'Day Born', root: coreParts[1].entry.root, impure: coreParts[1].entry.impure },
      { id: 'dayNumReduced', label: 'Day#', root: coreParts[2].entry.root, impure: coreParts[2].entry.impure },
      { id: 'combo', label: 'Combo', root: coreParts[3].entry.root, impure: coreParts[3].entry.impure },
      { id: 'pdReduced', label: 'Personal Day', root: cycleParts[2].entry.root, impure: cycleParts[2].entry.impure },
    ];
    const seenNumberSlots = {};
    identityTargets.forEach((t) => {
      t.entry = numberIdentityV2(t.root, t.impure);
      if (!t.entry) return;
      const prior = seenNumberSlots[t.root];
      // Only the FIRST repeat gets moreCharacteristics (2 fresh bullets) -
      // a 3rd+ occurrence of the same root would have nothing left to show
      // that isn't already used, so it falls back to a short doubled note.
      if (prior === undefined) {
        seenNumberSlots[t.root] = t.label;
      } else if (prior !== null) {
        t.opts = { cherry: true, repeatOf: prior };
        seenNumberSlots[t.root] = null;
      } else {
        t.entry = null;
        t.plainDoubled = true;
      }
    });
    identityTargets.forEach((t) => {
      const el = document.getElementById(t.id);
      if (!el) return;
      if (t.plainDoubled) {
        el.classList.add('idnum-tap');
        el.onclick = () => { document.getElementById('storyModalBody').innerHTML = `<div class="story-modal-title">${t.label}</div><div class="story-row">Same current as earlier in your chart, running doubled.</div>`; document.getElementById('storyModalOverlay').classList.add('active'); };
        return;
      }
      if (!t.entry) return;
      el.classList.add('idnum-tap');
      el.onclick = () => openIdentityModal(t.label, t.entry, t.opts);
    });

    // Western sign + Vietnamese year/month/day (natal, from the person's
    // own birth date) - same tap pattern, plain-voice content bank.
    // animalKey marks which Vietnamese slots share an animal - the first
    // occurrence gets the fuller read, a repeat gets the short cherry line.
    const zodiacTargets = [
      { id: 'sunSign', label: 'Western Sign', entry: WESTERN_IDENTITY[r.sunSign] },
      { id: 'chineseYear', label: 'Vietnamese Year', entry: VIETNAMESE_IDENTITY[r.chineseYear], animalKey: r.chineseYear },
      { id: 'chineseMonth', label: 'Vietnamese Month', entry: VIETNAMESE_IDENTITY[r.chineseMonth], animalKey: r.chineseMonth },
      { id: 'chineseDay', label: 'Vietnamese Day', entry: VIETNAMESE_IDENTITY[r.chineseDay], animalKey: r.chineseDay },
    ];
    const seenAnimalSlots = {};
    zodiacTargets.forEach((t) => {
      if (!t.animalKey) return;
      const prior = seenAnimalSlots[t.animalKey];
      // Only the first repeat gets moreCharacteristics - a 3rd occurrence
      // (all of year/month/day sharing an animal) has nothing fresh left.
      if (prior === undefined) {
        seenAnimalSlots[t.animalKey] = t.label.replace('Vietnamese ', '');
      } else if (prior !== null) {
        t.opts = { cherry: true, repeatOf: prior };
        seenAnimalSlots[t.animalKey] = null;
      } else {
        t.entry = null;
        t.plainDoubled = true;
      }
    });
    zodiacTargets.forEach((t) => {
      const el = document.getElementById(t.id);
      if (!el) return;
      if (t.plainDoubled) {
        el.classList.add('idnum-tap');
        el.onclick = () => { document.getElementById('storyModalBody').innerHTML = `<div class="story-modal-title">${t.label}</div><div class="story-row">Same animal as earlier in your chart, running doubled.</div>`; document.getElementById('storyModalOverlay').classList.add('active'); };
        return;
      }
      if (!t.entry) return;
      el.classList.add('idnum-tap');
      el.onclick = () => openZodiacIdentityModal(t.label, t.entry, t.opts);
    });
  }
}

const storyModalOverlayEl = document.getElementById('storyModalOverlay');
if (storyModalOverlayEl) {
  document.getElementById('storyModalClose').addEventListener('click', () => storyModalOverlayEl.classList.remove('active'));
  storyModalOverlayEl.addEventListener('click', (e) => { if (e.target === storyModalOverlayEl) storyModalOverlayEl.classList.remove('active'); });
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

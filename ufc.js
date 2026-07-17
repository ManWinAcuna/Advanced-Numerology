const currentMatches = { A: [], B: [] };
const selectedFighters = { A: null, B: null };

let stadiums = loadStadiums();
let editingStadiumId = null;

let customFighters = loadCustomFighters();
let fighterOverrides = loadFighterOverrides();
let editingFighterId = null;

// The built-in roster is static seed data, so edits to it are kept
// separately as overrides (keyed by a synthetic "seed-<index>" id) and
// applied on top here - custom (user-added) fighters follow after.
function buildAllFighters() {
  const seedFighters = UFC_FIGHTERS.map((f, idx) => {
    const id = `seed-${idx}`;
    const override = fighterOverrides[id];
    return override ? { id, name: override.name, dob: override.dob } : { id, name: f.name, dob: f.dob };
  });
  return seedFighters.concat(customFighters);
}

let allFighters = buildAllFighters();

attachDateMask(document.getElementById('newFighterDob'));
attachDateMask(document.getElementById('matchDate'));
attachDateMask(document.getElementById('newStadiumFounded'));

function parseDateInput(value) {
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y - which corrupted mid-typing states in the date picker.
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function renderSuggestions(key, query) {
  const container = document.querySelector(`.player-suggestions[data-player="${key}"]`);
  const q = query.trim().toLowerCase();

  if (!q) {
    currentMatches[key] = [];
    container.innerHTML = '';
    container.classList.remove('open');
    return;
  }

  const matches = allFighters.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  currentMatches[key] = matches;

  if (matches.length === 0) {
    container.innerHTML = '<div class="suggestion-empty">No fighters found</div>';
  } else {
    container.innerHTML = matches.map((f, idx) => `
      <div class="suggestion-item" data-player="${key}" data-index="${idx}">
        <span class="suggestion-name">${escapeHtml(f.name)}</span>
      </div>
    `).join('');
  }
  container.classList.add('open');
}

function selectFighter(key, fighter) {
  selectedFighters[key] = fighter;

  const wrapEl = document.querySelector(`.player-search-wrap[data-player="${key}"]`);
  const searchEl = document.querySelector(`.player-search[data-player="${key}"]`);
  const suggestionsEl = document.querySelector(`.player-suggestions[data-player="${key}"]`);
  const selectedEl = document.querySelector(`.player-selected[data-player="${key}"]`);

  searchEl.value = '';
  suggestionsEl.innerHTML = '';
  suggestionsEl.classList.remove('open');
  wrapEl.style.display = 'none';

  selectedEl.classList.add('active');
  selectedEl.querySelector('.player-selected-name').textContent = fighter.name;
  selectedEl.querySelector('.player-selected-dob').textContent = formatDate(fighter.dob);

  const editBtn = document.querySelector(`.player-edit[data-player="${key}"]`);
  if (editBtn) editBtn.style.display = '';
}

function clearFighter(key) {
  selectedFighters[key] = null;
  document.querySelector(`.player-selected[data-player="${key}"]`).classList.remove('active');
  document.querySelector(`.player-search-wrap[data-player="${key}"]`).style.display = 'block';
  document.querySelector(`.player-search[data-player="${key}"]`).value = '';
  const editBtn = document.querySelector(`.player-edit[data-player="${key}"]`);
  if (editBtn) editBtn.style.display = 'none';
  document.getElementById('ufcResults').classList.remove('active');
}

document.querySelectorAll('.player-search').forEach((input) => {
  input.addEventListener('input', () => renderSuggestions(input.dataset.player, input.value));
});

document.querySelectorAll('.player-suggestions').forEach((container) => {
  container.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    const key = item.dataset.player;
    const idx = Number(item.dataset.index);
    const fighter = currentMatches[key][idx];
    if (fighter) selectFighter(key, fighter);
  });
});

document.querySelectorAll('.player-clear').forEach((btn) => {
  btn.addEventListener('click', () => clearFighter(btn.dataset.player));
});

document.getElementById('clearFightersBtn').addEventListener('click', () => {
  clearFighter('A');
  clearFighter('B');
});

document.querySelectorAll('.player-edit').forEach((btn) => {
  btn.addEventListener('click', () => {
    const fighter = selectedFighters[btn.dataset.player];
    if (fighter) openFighterForm(fighter);
  });
});

document.getElementById('todayBtn').addEventListener('click', () => {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('matchDate').value = isoToDisplay(iso);
});

/* ===================== Add / Edit Fighter ===================== */

function openFighterForm(fighter) {
  document.getElementById('addFighterForm').classList.add('active');
  if (fighter) {
    editingFighterId = fighter.id;
    document.getElementById('newFighterName').value = fighter.name;
    document.getElementById('newFighterDob').value = isoToDisplay(fighter.dob);
    document.getElementById('fighterFormLabel').textContent = `Edit Fighter - ${fighter.name}`;
    document.getElementById('saveFighterBtn').textContent = 'Update Fighter';
  } else {
    editingFighterId = null;
    document.getElementById('newFighterName').value = '';
    document.getElementById('newFighterDob').value = '';
    document.getElementById('fighterFormLabel').textContent = 'Add Fighter';
    document.getElementById('saveFighterBtn').textContent = 'Save Fighter';
  }
  document.getElementById('addFighterForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeFighterForm() {
  editingFighterId = null;
  document.getElementById('addFighterForm').classList.remove('active');
  document.getElementById('newFighterName').value = '';
  document.getElementById('newFighterDob').value = '';
  document.getElementById('fighterFormLabel').textContent = 'Add Fighter';
  document.getElementById('saveFighterBtn').textContent = 'Save Fighter';
}

document.getElementById('showAddFighterBtn').addEventListener('click', () => openFighterForm(null));
document.getElementById('cancelFighterBtn').addEventListener('click', closeFighterForm);

document.getElementById('saveFighterBtn').addEventListener('click', () => {
  const name = document.getElementById('newFighterName').value.trim();
  const dob = displayToISO(document.getElementById('newFighterDob').value);
  if (!name) {
    alert('Please enter a fighter name.');
    return;
  }
  if (!dob) {
    alert('Please enter a valid date of birth (MM/DD/YYYY).');
    return;
  }

  if (editingFighterId) {
    if (editingFighterId.startsWith('seed-')) {
      fighterOverrides[editingFighterId] = { name, dob };
      saveFighterOverrides(fighterOverrides);
    } else {
      const idx = customFighters.findIndex((f) => f.id === editingFighterId);
      if (idx !== -1) customFighters[idx] = { id: editingFighterId, name, dob };
      saveCustomFighters(customFighters);
    }
    allFighters = buildAllFighters();
    const updated = allFighters.find((f) => f.id === editingFighterId);
    ['A', 'B'].forEach((key) => {
      if (selectedFighters[key] && selectedFighters[key].id === editingFighterId) {
        selectedFighters[key] = updated;
        const selectedEl = document.querySelector(`.player-selected[data-player="${key}"]`);
        selectedEl.querySelector('.player-selected-name').textContent = name;
        selectedEl.querySelector('.player-selected-dob').textContent = formatDate(dob);
      }
    });
  } else {
    customFighters.push({ id: uid(), name, dob });
    saveCustomFighters(customFighters);
    allFighters = buildAllFighters();
  }

  closeFighterForm();
});

/* ===================== Fight Location: State + Stadium ===================== */

function stateIndexByName(name) {
  return US_STATES.findIndex((s) => s.name === name);
}

function populateStateSelectInto(selectEl) {
  selectEl.innerHTML = '<option value="">Select state...</option>'
    + US_STATES.map((s, idx) => `<option value="${idx}">${escapeHtml(s.name)}</option>`).join('');
}

function populateStadiumSelect(selectValue) {
  const sel = document.getElementById('stadiumSelect');
  sel.innerHTML = '<option value="">Select stadium...</option>'
    + stadiums.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
    + '<option value="__add__">+ Add New Stadium</option>';
  sel.value = selectValue || '';
}

function updateEditStadiumBtnVisibility() {
  const val = document.getElementById('stadiumSelect').value;
  document.getElementById('editStadiumBtn').style.display = (val && val !== '__add__') ? '' : 'none';
}

populateStateSelectInto(document.getElementById('stateSelect'));
populateStateSelectInto(document.getElementById('newStadiumState'));
populateStadiumSelect();
updateEditStadiumBtnVisibility();

// A stadium saved with a state carries that state with it - picking the
// stadium always syncs the State dropdown to match, so they can't drift apart.
document.getElementById('stadiumSelect').addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === '__add__') {
    e.target.value = '';
    openStadiumForm(null);
    updateEditStadiumBtnVisibility();
    return;
  }

  closeStadiumForm();
  updateEditStadiumBtnVisibility();

  if (val) {
    const stadium = stadiums.find((s) => s.id === val);
    if (stadium && stadium.state) {
      const idx = stateIndexByName(stadium.state);
      if (idx !== -1) document.getElementById('stateSelect').value = String(idx);
    }
  }
});

document.getElementById('editStadiumBtn').addEventListener('click', () => {
  const stadium = stadiums.find((s) => s.id === document.getElementById('stadiumSelect').value);
  if (stadium) openStadiumForm(stadium);
});

// Only fighters/stadiums created here (which carry an id) can be edited.
function openStadiumForm(stadium) {
  document.getElementById('addStadiumForm').classList.add('active');
  const stateSel = document.getElementById('newStadiumState');
  if (stadium) {
    editingStadiumId = stadium.id;
    document.getElementById('newStadiumName').value = stadium.name;
    document.getElementById('newStadiumFounded').value = isoToDisplay(stadium.founded);
    const idx = stadium.state ? stateIndexByName(stadium.state) : -1;
    stateSel.value = idx !== -1 ? String(idx) : '';
    document.getElementById('stadiumFormLabel').textContent = `Edit Stadium - ${stadium.name}`;
    document.getElementById('saveStadiumBtn').textContent = 'Update Stadium';
  } else {
    editingStadiumId = null;
    document.getElementById('newStadiumName').value = '';
    document.getElementById('newStadiumFounded').value = '';
    stateSel.value = '';
    document.getElementById('stadiumFormLabel').textContent = 'Add New Stadium';
    document.getElementById('saveStadiumBtn').textContent = 'Save Stadium';
  }
  document.getElementById('addStadiumForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeStadiumForm() {
  editingStadiumId = null;
  document.getElementById('addStadiumForm').classList.remove('active');
  document.getElementById('newStadiumName').value = '';
  document.getElementById('newStadiumFounded').value = '';
  document.getElementById('newStadiumState').value = '';
  document.getElementById('stadiumFormLabel').textContent = 'Add New Stadium';
  document.getElementById('saveStadiumBtn').textContent = 'Save Stadium';
}

document.getElementById('cancelStadiumBtn').addEventListener('click', closeStadiumForm);

document.getElementById('saveStadiumBtn').addEventListener('click', () => {
  const name = document.getElementById('newStadiumName').value.trim();
  const founded = displayToISO(document.getElementById('newStadiumFounded').value);
  const stateIdx = document.getElementById('newStadiumState').value;
  if (!name) {
    alert('Please enter a stadium name.');
    return;
  }
  if (!founded) {
    alert('Please enter a valid founding date for the stadium (MM/DD/YYYY).');
    return;
  }
  if (stateIdx === '') {
    alert('Please select which state this stadium is in.');
    return;
  }
  const stateName = US_STATES[Number(stateIdx)].name;

  let selectValue;
  if (editingStadiumId) {
    const idx = stadiums.findIndex((s) => s.id === editingStadiumId);
    if (idx !== -1) stadiums[idx] = { id: editingStadiumId, name, founded, state: stateName };
    selectValue = editingStadiumId;
  } else {
    const stadium = { id: uid(), name, founded, state: stateName };
    stadiums.push(stadium);
    selectValue = stadium.id;
  }
  saveStadiums(stadiums);
  populateStadiumSelect(selectValue);
  document.getElementById('stateSelect').value = stateIdx;
  updateEditStadiumBtnVisibility();

  closeStadiumForm();
});

/* ===================== Matchup scoring ===================== */

// Blends the location/date factors for one fighter: Fight Day, Stadium
// founding, and State founding - each scored the same way the rest of the
// app scores compatibility, just against a different date. When the
// stadium isn't known yet, it's dropped entirely (not just zeroed) and the
// remaining two factors are reweighted so the score still adds up cleanly.
function computeFighterScore(dobDate, matchDate, stadiumDate, stateDate) {
  const day = computeCompatibility(dobDate, matchDate, sportsNumerologyCompat);
  const state = computeCompatibility(dobDate, stateDate, sportsNumerologyCompat);

  if (!stadiumDate) {
    const combined = Math.round(0.75 * day.finalScore + 0.25 * state.finalScore);
    return { day, stadium: null, state, combined };
  }

  const stadium = computeCompatibility(dobDate, stadiumDate, sportsNumerologyCompat);
  const combined = Math.round(0.60 * day.finalScore + 0.15 * stadium.finalScore + 0.25 * state.finalScore);
  return { day, stadium, state, combined };
}

// Renders one fighter's combined score plus the three clickable sub-score
// tabs, each swapping in the full breakdown for that factor below.
function renderFighterBreakdown(containerEl, fighter, score, stadiumName, stateName) {
  const hasStadium = !!score.stadium;

  containerEl.innerHTML = `
    <div class="score-hero ufc-combined-hero">
      <div class="score-names">Combined Score</div>
      <div class="score-big ${scoreClass(score.combined)}">${score.combined}<span class="score-out-of">/100</span></div>
    </div>
    <div class="ufc-subscore-tabs">
      <button type="button" class="ufc-subscore-tab active" data-factor="day">
        <span class="ufc-subscore-name">🗓️ Fight Day</span>
        <span class="ufc-subscore-val ${scoreClass(score.day.finalScore)}">${score.day.finalScore}</span>
      </button>
      ${hasStadium ? `
      <button type="button" class="ufc-subscore-tab" data-factor="stadium">
        <span class="ufc-subscore-name">🏟️ Stadium</span>
        <span class="ufc-subscore-val ${scoreClass(score.stadium.finalScore)}">${score.stadium.finalScore}</span>
      </button>` : ''}
      <button type="button" class="ufc-subscore-tab" data-factor="state">
        <span class="ufc-subscore-name">🗺️ State</span>
        <span class="ufc-subscore-val ${scoreClass(score.state.finalScore)}">${score.state.finalScore}</span>
      </button>
    </div>
    <div class="ufc-subscore-detail"></div>
  `;

  const detailEl = containerEl.querySelector('.ufc-subscore-detail');
  const factors = {
    day: { result: score.day, label: 'Fight Day' },
    state: { result: score.state, label: stateName },
  };
  if (hasStadium) factors.stadium = { result: score.stadium, label: stadiumName };

  function showFactor(factor) {
    containerEl.querySelectorAll('.ufc-subscore-tab').forEach((t) => t.classList.toggle('active', t.dataset.factor === factor));
    renderCompatResults(detailEl, factors[factor].result, fighter.name, factors[factor].label);
  }

  containerEl.querySelectorAll('.ufc-subscore-tab').forEach((t) => {
    t.addEventListener('click', () => showFactor(t.dataset.factor));
  });

  showFactor('day');
}

document.getElementById('calculateBtn').addEventListener('click', () => {
  if (!selectedFighters.A || !selectedFighters.B) {
    alert('Please select both fighters.');
    return;
  }
  const matchDateInput = document.getElementById('matchDate');
  const matchDateISO = displayToISO(matchDateInput.value);
  if (!matchDateISO) {
    alert('Please enter a valid fight date (MM/DD/YYYY), or click Today.');
    return;
  }
  const stateIdx = document.getElementById('stateSelect').value;
  if (stateIdx === '') {
    alert('Please select the state the fight is taking place in.');
    return;
  }
  const stadiumId = document.getElementById('stadiumSelect').value;
  const stadium = (stadiumId && stadiumId !== '__add__') ? stadiums.find((s) => s.id === stadiumId) : null;
  const state = US_STATES[Number(stateIdx)];

  const matchDate = parseDateInput(matchDateISO);
  const stadiumDate = stadium ? parseDateInput(stadium.founded) : null;
  const stateDate = parseDateInput(state.founded);
  const fighterA = selectedFighters.A;
  const fighterB = selectedFighters.B;

  const scoreA = computeFighterScore(parseDateInput(fighterA.dob), matchDate, stadiumDate, stateDate);
  const scoreB = computeFighterScore(parseDateInput(fighterB.dob), matchDate, stadiumDate, stateDate);

  const resultsEl = document.getElementById('ufcResults');
  resultsEl.classList.add('active');

  const edgeEl = document.getElementById('edgeBanner');
  let aWins = null;
  if (scoreA.combined === scoreB.combined) {
    edgeEl.innerHTML = `<div class="edge-tie">🥊 Even matchup &mdash; ${scoreA.combined} vs ${scoreB.combined}</div>`;
  } else {
    aWins = scoreA.combined > scoreB.combined;
    const winner = aWins ? fighterA : fighterB;
    const winnerScore = aWins ? scoreA.combined : scoreB.combined;
    const loserScore = aWins ? scoreB.combined : scoreA.combined;
    edgeEl.innerHTML = `<div class="edge-winner">👑 Edge: <strong>${escapeHtml(winner.name)}</strong> &mdash; ${winnerScore} vs ${loserScore}</div>`;
  }

  document.getElementById('matchupTitleA').innerHTML = `${aWins === true ? '<span class="crown">👑</span> ' : ''}${escapeHtml(fighterA.name)}`;
  document.getElementById('matchupTitleB').innerHTML = `${aWins === false ? '<span class="crown">👑</span> ' : ''}${escapeHtml(fighterB.name)}`;

  const stadiumName = stadium ? stadium.name : null;
  renderFighterBreakdown(document.getElementById('resultA'), fighterA, scoreA, stadiumName, state.name);
  renderFighterBreakdown(document.getElementById('resultB'), fighterB, scoreB, stadiumName, state.name);
});

const currentMatches = { A: [], B: [] };
const selectedFighters = { A: null, B: null };

let stadiums = loadStadiums();
let editingStadiumId = null;

let customFighters = loadCustomFighters();
let fighterOverrides = loadFighterOverrides();
let editingFighterId = null;

// The built-in roster is static seed data, so edits to it are kept
// separately as overrides (keyed by a synthetic "seed-<index>" id) and
// applied on top here - custom (user-added) fighters follow after. A seed
// fighter can't be spliced out of that static array, so "deleting" one just
// marks its override deleted and this filters it out.
function buildAllFighters() {
  const seedFighters = UFC_FIGHTERS.map((f, idx) => {
    const id = `seed-${idx}`;
    const override = fighterOverrides[id];
    if (override && override.deleted) return null;
    return override ? { id, name: override.name, dob: override.dob } : { id, name: f.name, dob: f.dob };
  }).filter(Boolean);
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

function setFighterDobStatus(message, isError) {
  const el = document.getElementById('fighterDobStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

// Auto-fills the DOB from Wikidata for a fighter arriving via the Polymarket
// "add them" deep link, where the exact name is already known - the user
// still double-checks the filled-in date (or types it themselves if none
// was found) before saving, same as the rest of this form.
function lookupFighterBirthday(name) {
  setFighterDobStatus('🔍 Looking up birthday...', false);
  lookupKeyDateByName(name)
    .then((info) => {
      if (!info || info.kind !== 'born') {
        setFighterDobStatus(`Couldn't find a birthday automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newFighterDob').value = isoToDisplay(info.date);
      setFighterDobStatus(`✓ Found via Wikidata (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setFighterDobStatus(`Couldn't find a birthday automatically for ${name} - please enter it yourself.`, true));
}

function openFighterForm(fighter) {
  document.getElementById('addFighterForm').classList.add('active');
  setFighterDobStatus('', false);
  if (fighter) {
    editingFighterId = fighter.id;
    document.getElementById('newFighterName').value = fighter.name;
    document.getElementById('newFighterDob').value = isoToDisplay(fighter.dob);
    document.getElementById('fighterFormLabel').textContent = `Edit Fighter - ${fighter.name}`;
    document.getElementById('saveFighterBtn').textContent = 'Update Fighter';
    document.getElementById('deleteFighterBtn').style.display = '';
  } else {
    editingFighterId = null;
    document.getElementById('newFighterName').value = '';
    document.getElementById('newFighterDob').value = '';
    document.getElementById('fighterFormLabel').textContent = 'Add Fighter';
    document.getElementById('saveFighterBtn').textContent = 'Save Fighter';
    document.getElementById('deleteFighterBtn').style.display = 'none';
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
  document.getElementById('deleteFighterBtn').style.display = 'none';
  setFighterDobStatus('', false);
}

document.getElementById('showAddFighterBtn').addEventListener('click', () => openFighterForm(null));
document.getElementById('cancelFighterBtn').addEventListener('click', closeFighterForm);

document.getElementById('deleteFighterBtn').addEventListener('click', () => {
  if (!editingFighterId) return;
  const fighter = allFighters.find((f) => f.id === editingFighterId);
  const name = fighter ? fighter.name : 'this fighter';
  if (!confirm(`Delete ${name} from the fighter database? This can't be undone.`)) return;

  if (editingFighterId.startsWith('seed-')) {
    fighterOverrides[editingFighterId] = { ...(fighterOverrides[editingFighterId] || {}), deleted: true };
    saveFighterOverrides(fighterOverrides);
  } else {
    customFighters = customFighters.filter((f) => f.id !== editingFighterId);
    saveCustomFighters(customFighters);
  }

  allFighters = buildAllFighters();
  ['A', 'B'].forEach((key) => {
    if (selectedFighters[key] && selectedFighters[key].id === editingFighterId) clearFighter(key);
  });

  closeFighterForm();
});

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

// Matches each uploaded row against the existing roster the same way the
// Polymarket tracker matches fighter names (normalizeName, from db-core.js)
// - a name already in the roster gets its dob updated in place (and is
// un-deleted if it had been soft-deleted) rather than creating a duplicate.
document.getElementById('bulkUploadBtn').addEventListener('click', () => {
  openBulkUploadModal((rows) => {
    let added = 0;
    let updatedCount = 0;

    rows.forEach(({ name, date }) => {
      const norm = normalizeName(name);
      const seedIdx = UFC_FIGHTERS.findIndex((f, i) => {
        const id = `seed-${i}`;
        const override = fighterOverrides[id];
        const currentName = override ? override.name : f.name;
        return normalizeName(currentName) === norm;
      });

      if (seedIdx !== -1) {
        fighterOverrides[`seed-${seedIdx}`] = { name, dob: date };
        updatedCount++;
        return;
      }

      const customIdx = customFighters.findIndex((f) => normalizeName(f.name) === norm);
      if (customIdx !== -1) {
        customFighters[customIdx] = { id: customFighters[customIdx].id, name, dob: date };
        updatedCount++;
      } else {
        customFighters.push({ id: uid(), name, dob: date });
        added++;
      }
    });

    saveFighterOverrides(fighterOverrides);
    saveCustomFighters(customFighters);
    allFighters = buildAllFighters();
    return `Imported ${rows.length} fighter${rows.length === 1 ? '' : 's'}: ${added} added, ${updatedCount} updated.`;
  });
});

/* ===================== Fight Location: Region + Stadium ===================== */
// The region is a US state (statehood date) or, for international cards, the
// host city/emirate/province (its founding date, e.g. Abu Dhabi's) - toggled
// with the US/International switch. Same model as polymarket-ufc.js.

let editingRegionId = null;
let regionMode = 'us'; // 'us' | 'intl'

function regionNoun() {
  return regionMode === 'intl' ? 'city / region' : 'state';
}

function stateIndexByName(name) {
  return US_STATES.findIndex((s) => s.name === name);
}

function populateRegionOptionsInto(selectEl, includeAdd) {
  if (regionMode === 'us') {
    selectEl.innerHTML = '<option value="">Select state...</option>'
      + US_STATES.map((s, idx) => `<option value="${idx}">${escapeHtml(s.name)}</option>`).join('');
  } else {
    selectEl.innerHTML = '<option value="">Select city / region...</option>'
      + allIntlRegions().map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
      + (includeAdd ? '<option value="__addRegion__">+ Add New City / Region</option>' : '');
  }
}

function regionFromSelectValue(val) {
  if (val === '' || val == null || val === '__addRegion__') return null;
  if (regionMode === 'us') return US_STATES[Number(val)] || null;
  return allIntlRegions().find((c) => c.id === val) || null;
}

// US stadiums carry a `state`, international ones a `region` (older records
// may still say `country`) - each mode only lists its own kind so a Vegas
// arena can't be picked for an Abu Dhabi card.
function populateStadiumSelect(selectValue) {
  const sel = document.getElementById('stadiumSelect');
  const visible = stadiums.filter((s) => (regionMode === 'intl' ? !!(s.region || s.country) : !(s.region || s.country)));
  sel.innerHTML = '<option value="">Select stadium...</option>'
    + visible.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
    + '<option value="__add__">+ Add New Stadium</option>';
  sel.value = selectValue || '';
}

function updateEditStadiumBtnVisibility() {
  const val = document.getElementById('stadiumSelect').value;
  document.getElementById('editStadiumBtn').style.display = (val && val !== '__add__') ? '' : 'none';
}

function updateEditRegionBtnVisibility() {
  const region = regionFromSelectValue(document.getElementById('stateSelect').value);
  const show = regionMode === 'intl' && !!(region && region.id);
  document.getElementById('editRegionBtn').style.display = show ? '' : 'none';
}

populateRegionOptionsInto(document.getElementById('stateSelect'), true);
populateRegionOptionsInto(document.getElementById('newStadiumState'), false);
populateStadiumSelect();
updateEditStadiumBtnVisibility();

document.querySelectorAll('#regionToggle .hours-toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.region === regionMode) return;
    regionMode = btn.dataset.region;
    document.querySelectorAll('#regionToggle .hours-toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
    closeRegionForm();
    closeStadiumForm();
    document.getElementById('regionLabel').textContent = regionMode === 'intl' ? 'City / Region' : 'State';
    populateRegionOptionsInto(document.getElementById('stateSelect'), true);
    populateRegionOptionsInto(document.getElementById('newStadiumState'), false);
    populateStadiumSelect();
    updateEditStadiumBtnVisibility();
    updateEditRegionBtnVisibility();
  });
});

document.getElementById('stateSelect').addEventListener('change', (e) => {
  if (e.target.value === '__addRegion__') {
    e.target.value = '';
    openRegionForm(null);
  }
  updateEditRegionBtnVisibility();
});

document.getElementById('editRegionBtn').addEventListener('click', () => {
  const region = regionFromSelectValue(document.getElementById('stateSelect').value);
  if (region && region.id) openRegionForm(region);
});

function setRegionFoundedStatus(message, isError) {
  const el = document.getElementById('regionFoundedStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

// Same Wikidata-then-Wikipedia-infobox lookup used for fighter birthdays
// (lookupKeyDateByName in db-core.js), aimed at a city/region's founding
// date instead - coverage is thinner here than for people, so failing
// quietly and leaving manual entry as the fallback is the expected case.
function lookupRegionFoundedDate(name) {
  setRegionFoundedStatus('🔍 Looking up founding date...', false);
  lookupPlaceFoundingDate(name)
    .then((info) => {
      if (!info) {
        setRegionFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newRegionFounded').value = isoToDisplay(info.date);
      const source = info.via === 'country' ? "its country's founding" : 'Wikipedia/Wikidata';
      setRegionFoundedStatus(`✓ Found via ${source} (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setRegionFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function openRegionForm(region) {
  closeStadiumForm();
  document.getElementById('addRegionForm').classList.add('active');
  setRegionFoundedStatus('', false);
  if (region) {
    editingRegionId = region.id;
    document.getElementById('newRegionName').value = region.name;
    document.getElementById('newRegionFounded').value = isoToDisplay(region.founded);
    document.getElementById('regionFormLabel').textContent = `Edit City / Region - ${region.name}`;
    document.getElementById('saveRegionBtn').textContent = 'Update Region';
  } else {
    editingRegionId = null;
    document.getElementById('newRegionName').value = '';
    document.getElementById('newRegionFounded').value = '';
    document.getElementById('regionFormLabel').textContent = 'Add New City / Region';
    document.getElementById('saveRegionBtn').textContent = 'Save Region';
  }
  document.getElementById('addRegionForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeRegionForm() {
  editingRegionId = null;
  document.getElementById('addRegionForm').classList.remove('active');
  document.getElementById('newRegionName').value = '';
  document.getElementById('newRegionFounded').value = '';
  document.getElementById('regionFormLabel').textContent = 'Add New City / Region';
  document.getElementById('saveRegionBtn').textContent = 'Save Region';
  setRegionFoundedStatus('', false);
}

document.getElementById('newRegionName').addEventListener('blur', () => {
  const name = document.getElementById('newRegionName').value.trim();
  const foundedFilled = document.getElementById('newRegionFounded').value.trim();
  if (name && !foundedFilled && !editingRegionId) lookupRegionFoundedDate(name);
});

document.getElementById('regionLookupBtn').addEventListener('click', () => {
  const name = document.getElementById('newRegionName').value.trim();
  if (!name) { alert('Please enter a city / region name first.'); return; }
  lookupRegionFoundedDate(name);
});

document.getElementById('cancelRegionBtn').addEventListener('click', closeRegionForm);

document.getElementById('saveRegionBtn').addEventListener('click', () => {
  const name = document.getElementById('newRegionName').value.trim();
  const founded = displayToISO(document.getElementById('newRegionFounded').value);
  if (!name) {
    alert('Please enter a city / region name.');
    return;
  }
  if (!founded) {
    alert('Please enter a valid founding date (MM/DD/YYYY).');
    return;
  }

  const regions = loadIntlRegions();
  let selectId;
  if (editingRegionId) {
    const idx = regions.findIndex((c) => c.id === editingRegionId);
    if (idx !== -1) regions[idx] = { id: editingRegionId, name, founded };
    selectId = editingRegionId;
  } else {
    const region = { id: uid(), name, founded };
    regions.push(region);
    selectId = region.id;
  }
  saveIntlRegions(regions);
  populateRegionOptionsInto(document.getElementById('stateSelect'), true);
  populateRegionOptionsInto(document.getElementById('newStadiumState'), false);
  document.getElementById('stateSelect').value = selectId;
  updateEditRegionBtnVisibility();
  closeRegionForm();
});

// A stadium saved with a region carries that region with it - picking the
// stadium always syncs the region dropdown to match, so they can't drift apart.
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
    if (stadium && regionMode === 'us' && stadium.state) {
      const idx = stateIndexByName(stadium.state);
      if (idx !== -1) document.getElementById('stateSelect').value = String(idx);
    } else if (stadium && regionMode === 'intl' && (stadium.region || stadium.country)) {
      const c = allIntlRegions().find((x) => x.name === (stadium.region || stadium.country));
      if (c) document.getElementById('stateSelect').value = c.id;
    }
  }
  updateEditRegionBtnVisibility();
});

document.getElementById('editStadiumBtn').addEventListener('click', () => {
  const stadium = stadiums.find((s) => s.id === document.getElementById('stadiumSelect').value);
  if (stadium) openStadiumForm(stadium);
});

// Only fighters/stadiums created here (which carry an id) can be edited.
function setStadiumFoundedStatus(message, isError) {
  const el = document.getElementById('stadiumFoundedStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

function lookupStadiumFoundedDate(name) {
  setStadiumFoundedStatus('🔍 Looking up founding date...', false);
  lookupKeyDateByName(name)
    .then((info) => {
      if (!info) {
        setStadiumFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newStadiumFounded').value = isoToDisplay(info.date);
      setStadiumFoundedStatus(`✓ Found via Wikipedia/Wikidata (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setStadiumFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function openStadiumForm(stadium) {
  closeRegionForm();
  document.getElementById('addStadiumForm').classList.add('active');
  setStadiumFoundedStatus('', false);
  const regionSel = document.getElementById('newStadiumState');
  if (stadium) {
    editingStadiumId = stadium.id;
    document.getElementById('newStadiumName').value = stadium.name;
    document.getElementById('newStadiumFounded').value = isoToDisplay(stadium.founded);
    if (regionMode === 'us') {
      const idx = stadium.state ? stateIndexByName(stadium.state) : -1;
      regionSel.value = idx !== -1 ? String(idx) : '';
    } else {
      const regionName = stadium.region || stadium.country;
      const c = regionName ? allIntlRegions().find((x) => x.name === regionName) : null;
      regionSel.value = c ? c.id : '';
    }
    document.getElementById('stadiumFormLabel').textContent = `Edit Stadium - ${stadium.name}`;
    document.getElementById('saveStadiumBtn').textContent = 'Update Stadium';
  } else {
    editingStadiumId = null;
    document.getElementById('newStadiumName').value = '';
    document.getElementById('newStadiumFounded').value = '';
    regionSel.value = '';
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
  setStadiumFoundedStatus('', false);
}

document.getElementById('newStadiumName').addEventListener('blur', () => {
  const name = document.getElementById('newStadiumName').value.trim();
  const foundedFilled = document.getElementById('newStadiumFounded').value.trim();
  if (name && !foundedFilled && !editingStadiumId) lookupStadiumFoundedDate(name);
});

document.getElementById('stadiumLookupBtn').addEventListener('click', () => {
  const name = document.getElementById('newStadiumName').value.trim();
  if (!name) { alert('Please enter a stadium name first.'); return; }
  lookupStadiumFoundedDate(name);
});

document.getElementById('cancelStadiumBtn').addEventListener('click', closeStadiumForm);

document.getElementById('saveStadiumBtn').addEventListener('click', () => {
  const name = document.getElementById('newStadiumName').value.trim();
  const founded = displayToISO(document.getElementById('newStadiumFounded').value);
  const regionVal = document.getElementById('newStadiumState').value;
  if (!name) {
    alert('Please enter a stadium name.');
    return;
  }
  if (!founded) {
    alert('Please enter a valid founding date for the stadium (MM/DD/YYYY).');
    return;
  }
  if (regionVal === '') {
    alert(`Please select which ${regionNoun()} this stadium is in.`);
    return;
  }

  const regionFields = regionMode === 'us'
    ? { state: US_STATES[Number(regionVal)].name }
    : { region: (allIntlRegions().find((c) => c.id === regionVal) || {}).name };

  let selectValue;
  if (editingStadiumId) {
    const idx = stadiums.findIndex((s) => s.id === editingStadiumId);
    if (idx !== -1) stadiums[idx] = { id: editingStadiumId, name, founded, ...regionFields };
    selectValue = editingStadiumId;
  } else {
    const stadium = { id: uid(), name, founded, ...regionFields };
    stadiums.push(stadium);
    selectValue = stadium.id;
  }
  saveStadiums(stadiums);
  populateStadiumSelect(selectValue);
  document.getElementById('stateSelect').value = regionVal;
  updateEditStadiumBtnVisibility();
  updateEditRegionBtnVisibility();

  closeStadiumForm();
});

/* ===================== Matchup scoring ===================== */

// computeFighterScore() now lives in db-core.js (shared with polymarket-ufc.js
// and polymarket-mlb.js, which needed the identical Day/Stadium/State blend).

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
        <span class="ufc-subscore-name">${regionMode === 'intl' ? '🏙️ Region' : '🗺️ State'}</span>
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
  const state = regionFromSelectValue(document.getElementById('stateSelect').value);
  if (!state) {
    alert(`Please select the ${regionNoun()} the fight is taking place in.`);
    return;
  }
  const stadiumId = document.getElementById('stadiumSelect').value;
  const stadium = (stadiumId && stadiumId !== '__add__') ? stadiums.find((s) => s.id === stadiumId) : null;

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

/* ===================== Deep links from the Polymarket tracker ===================== */
// polymarket-ufc.js links here with ?a=&b=&date= (both fighters already in
// the roster) or ?addFighter= (a fighter Polymarket knows about that isn't
// in the roster yet), so a whale bet can be followed straight into a full
// matchup without retyping anything.

(function handlePolymarketDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const nameA = params.get('a');
  const nameB = params.get('b');
  const date = params.get('date');
  const addFighterName = params.get('addFighter');

  if (nameA && nameB) {
    const fighterA = allFighters.find((f) => f.name.toLowerCase() === nameA.toLowerCase());
    const fighterB = allFighters.find((f) => f.name.toLowerCase() === nameB.toLowerCase());
    if (fighterA) selectFighter('A', fighterA);
    if (fighterB) selectFighter('B', fighterB);
  }
  if (date) {
    document.getElementById('matchDate').value = date;
  }
  if (addFighterName) {
    openFighterForm(null);
    document.getElementById('newFighterName').value = addFighterName;
    lookupFighterBirthday(addFighterName);
  }
})();

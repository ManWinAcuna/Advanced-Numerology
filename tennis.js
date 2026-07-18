const currentMatches = { A: [], B: [] };
const selectedPlayers = { A: null, B: null };

let venues = loadTennisVenues();
let editingVenueId = null;
let editingRegionId = null;
let regionMode = 'us'; // 'us' | 'intl'
let selectedRegion = null; // a US_STATES entry or an allIntlRegions() entry - both carry .name/.founded
let selectedVenue = null;

let customPlayers = loadCustomTennisPlayers();
let playerOverrides = loadTennisPlayerOverrides();
let editingPlayerId = null;

// Mirrors buildAllFighters() in ufc.js - the static TENNIS_PLAYERS seed data
// plus overrides (edits to a seed player, keyed by synthetic "seed-<index>"
// ids, since the static array can't be spliced) plus fully custom players.
function buildAllPlayers() {
  const seedPlayers = TENNIS_PLAYERS.map((p, idx) => {
    const id = `seed-${idx}`;
    const override = playerOverrides[id];
    if (override && override.deleted) return null;
    return override ? { id, ...override } : { id, name: p.name, dob: p.dob, tour: p.tour, tournament: p.tournament };
  }).filter(Boolean);
  return seedPlayers.concat(customPlayers);
}

let allPlayers = buildAllPlayers();

attachDateMask(document.getElementById('newPlayerDob'));
attachDateMask(document.getElementById('matchDate'));
attachDateMask(document.getElementById('newVenueFounded'));
attachDateMask(document.getElementById('newRegionFounded'));

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

function playerMeta(p) {
  return [p.tour, p.tournament].filter(Boolean).join(' · ');
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

  const matches = allPlayers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  currentMatches[key] = matches;

  if (matches.length === 0) {
    container.innerHTML = '<div class="suggestion-empty">No players found</div>';
  } else {
    container.innerHTML = matches.map((p, idx) => `
      <div class="suggestion-item" data-player="${key}" data-index="${idx}">
        <span class="suggestion-name">${escapeHtml(p.name)}</span>
        <span class="suggestion-meta">${escapeHtml(playerMeta(p))}</span>
      </div>
    `).join('');
  }
  container.classList.add('open');
}

function selectPlayer(key, player) {
  selectedPlayers[key] = player;

  const wrapEl = document.querySelector(`.player-search-wrap[data-player="${key}"]`);
  const searchEl = document.querySelector(`.player-search[data-player="${key}"]`);
  const suggestionsEl = document.querySelector(`.player-suggestions[data-player="${key}"]`);
  const selectedEl = document.querySelector(`.player-selected[data-player="${key}"]`);

  searchEl.value = '';
  suggestionsEl.innerHTML = '';
  suggestionsEl.classList.remove('open');
  wrapEl.style.display = 'none';

  selectedEl.classList.add('active');
  selectedEl.querySelector('.player-selected-name').textContent = player.name;
  selectedEl.querySelector('.player-selected-meta').textContent = playerMeta(player);
  selectedEl.querySelector('.player-selected-dob').textContent = formatDate(player.dob);

  const editBtn = document.querySelector(`.player-edit[data-player="${key}"]`);
  if (editBtn) editBtn.style.display = '';
}

function clearPlayer(key) {
  selectedPlayers[key] = null;
  document.querySelector(`.player-selected[data-player="${key}"]`).classList.remove('active');
  document.querySelector(`.player-search-wrap[data-player="${key}"]`).style.display = 'block';
  document.querySelector(`.player-search[data-player="${key}"]`).value = '';
  const editBtn = document.querySelector(`.player-edit[data-player="${key}"]`);
  if (editBtn) editBtn.style.display = 'none';
  document.getElementById('tennisResults').classList.remove('active');
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
    const player = currentMatches[key][idx];
    if (player) selectPlayer(key, player);
  });
});

document.querySelectorAll('.player-clear').forEach((btn) => {
  btn.addEventListener('click', () => clearPlayer(btn.dataset.player));
});

document.getElementById('clearPlayersBtn').addEventListener('click', () => {
  clearPlayer('A');
  clearPlayer('B');
});

document.querySelectorAll('.player-edit').forEach((btn) => {
  btn.addEventListener('click', () => {
    const player = selectedPlayers[btn.dataset.player];
    if (player) openPlayerForm(player);
  });
});

document.getElementById('todayBtn').addEventListener('click', () => {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('matchDate').value = isoToDisplay(iso);
});

/* ===================== Add / Edit Player ===================== */

function setPlayerDobStatus(message, isError) {
  const el = document.getElementById('playerDobStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

function lookupPlayerBirthday(name) {
  setPlayerDobStatus('🔍 Looking up birthday...', false);
  lookupKeyDateByName(name)
    .then((info) => {
      if (!info || info.kind !== 'born') {
        setPlayerDobStatus(`Couldn't find a birthday automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newPlayerDob').value = isoToDisplay(info.date);
      setPlayerDobStatus(`✓ Found via Wikidata (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setPlayerDobStatus(`Couldn't find a birthday automatically for ${name} - please enter it yourself.`, true));
}

function openPlayerForm(player) {
  document.getElementById('addPlayerForm').classList.add('active');
  setPlayerDobStatus('', false);
  if (player) {
    editingPlayerId = player.id;
    document.getElementById('newPlayerName').value = player.name;
    document.getElementById('newPlayerDob').value = isoToDisplay(player.dob);
    document.getElementById('newPlayerTour').value = player.tour === 'WTA' ? 'WTA' : 'ATP';
    document.getElementById('newPlayerTournament').value = player.tournament || '';
    document.getElementById('playerFormLabel').textContent = `Edit Player - ${player.name}`;
    document.getElementById('savePlayerBtn').textContent = 'Update Player';
    document.getElementById('deletePlayerBtn').style.display = '';
  } else {
    editingPlayerId = null;
    document.getElementById('newPlayerName').value = '';
    document.getElementById('newPlayerDob').value = '';
    document.getElementById('newPlayerTour').value = 'ATP';
    document.getElementById('newPlayerTournament').value = '';
    document.getElementById('playerFormLabel').textContent = 'Add Player';
    document.getElementById('savePlayerBtn').textContent = 'Save Player';
    document.getElementById('deletePlayerBtn').style.display = 'none';
  }
  document.getElementById('addPlayerForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePlayerForm() {
  editingPlayerId = null;
  document.getElementById('addPlayerForm').classList.remove('active');
  document.getElementById('newPlayerName').value = '';
  document.getElementById('newPlayerDob').value = '';
  document.getElementById('newPlayerTour').value = 'ATP';
  document.getElementById('newPlayerTournament').value = '';
  document.getElementById('playerFormLabel').textContent = 'Add Player';
  document.getElementById('savePlayerBtn').textContent = 'Save Player';
  document.getElementById('deletePlayerBtn').style.display = 'none';
  setPlayerDobStatus('', false);
}

document.getElementById('showAddPlayerBtn').addEventListener('click', () => openPlayerForm(null));
document.getElementById('cancelPlayerBtn').addEventListener('click', closePlayerForm);

document.getElementById('newPlayerName').addEventListener('blur', () => {
  const name = document.getElementById('newPlayerName').value.trim();
  const dobFilled = document.getElementById('newPlayerDob').value.trim();
  if (name && !dobFilled && !editingPlayerId) lookupPlayerBirthday(name);
});

document.getElementById('deletePlayerBtn').addEventListener('click', () => {
  if (!editingPlayerId) return;
  const player = allPlayers.find((p) => p.id === editingPlayerId);
  const name = player ? player.name : 'this player';
  if (!confirm(`Delete ${name} from the player database? This can't be undone.`)) return;

  if (editingPlayerId.startsWith('seed-')) {
    playerOverrides[editingPlayerId] = { ...(playerOverrides[editingPlayerId] || {}), deleted: true };
    saveTennisPlayerOverrides(playerOverrides);
  } else {
    customPlayers = customPlayers.filter((p) => p.id !== editingPlayerId);
    saveCustomTennisPlayers(customPlayers);
  }

  allPlayers = buildAllPlayers();
  ['A', 'B'].forEach((key) => {
    if (selectedPlayers[key] && selectedPlayers[key].id === editingPlayerId) clearPlayer(key);
  });

  closePlayerForm();
});

document.getElementById('savePlayerBtn').addEventListener('click', () => {
  const name = document.getElementById('newPlayerName').value.trim();
  const dob = displayToISO(document.getElementById('newPlayerDob').value);
  const tour = document.getElementById('newPlayerTour').value;
  const tournament = document.getElementById('newPlayerTournament').value.trim();
  if (!name) {
    alert('Please enter a player name.');
    return;
  }
  if (!dob) {
    alert('Please enter a valid date of birth (MM/DD/YYYY).');
    return;
  }

  const record = { name, dob, tour, tournament };

  if (editingPlayerId) {
    if (editingPlayerId.startsWith('seed-')) {
      playerOverrides[editingPlayerId] = record;
      saveTennisPlayerOverrides(playerOverrides);
    } else {
      const idx = customPlayers.findIndex((p) => p.id === editingPlayerId);
      if (idx !== -1) customPlayers[idx] = { id: editingPlayerId, ...record };
      saveCustomTennisPlayers(customPlayers);
    }
    allPlayers = buildAllPlayers();
    const updated = allPlayers.find((p) => p.id === editingPlayerId);
    ['A', 'B'].forEach((key) => {
      if (selectedPlayers[key] && selectedPlayers[key].id === editingPlayerId) {
        selectedPlayers[key] = updated;
        const selectedEl = document.querySelector(`.player-selected[data-player="${key}"]`);
        selectedEl.querySelector('.player-selected-name').textContent = name;
        selectedEl.querySelector('.player-selected-meta').textContent = playerMeta(updated);
        selectedEl.querySelector('.player-selected-dob').textContent = formatDate(dob);
      }
    });
  } else {
    customPlayers.push({ id: uid(), ...record });
    saveCustomTennisPlayers(customPlayers);
    allPlayers = buildAllPlayers();
  }

  closePlayerForm();
});

// Matches each uploaded row against the existing roster via normalizeName
// (db-core.js) - a name already in the roster gets its dob updated in place
// (and un-deleted if it had been soft-deleted); bulk rows carry no tour or
// tournament data, so new players default to ATP/blank until edited by hand.
document.getElementById('bulkUploadBtn').addEventListener('click', () => {
  openBulkUploadModal((rows) => {
    let added = 0;
    let updatedCount = 0;

    rows.forEach(({ name, date }) => {
      const norm = normalizeName(name);
      const seedIdx = TENNIS_PLAYERS.findIndex((p, i) => {
        const id = `seed-${i}`;
        const override = playerOverrides[id];
        const currentName = override ? override.name : p.name;
        return normalizeName(currentName) === norm;
      });

      if (seedIdx !== -1) {
        const id = `seed-${seedIdx}`;
        const existingOverride = playerOverrides[id];
        const base = existingOverride && !existingOverride.deleted ? existingOverride : TENNIS_PLAYERS[seedIdx];
        playerOverrides[id] = { name, dob: date, tour: base.tour, tournament: base.tournament };
        updatedCount++;
        return;
      }

      const customIdx = customPlayers.findIndex((p) => normalizeName(p.name) === norm);
      if (customIdx !== -1) {
        customPlayers[customIdx] = { ...customPlayers[customIdx], name, dob: date };
        updatedCount++;
      } else {
        customPlayers.push({ id: uid(), name, dob: date, tour: 'ATP', tournament: '' });
        added++;
      }
    });

    saveTennisPlayerOverrides(playerOverrides);
    saveCustomTennisPlayers(customPlayers);
    allPlayers = buildAllPlayers();
    return `Imported ${rows.length} player${rows.length === 1 ? '' : 's'}: ${added} added, ${updatedCount} updated.`;
  });
});

/* ===================== Match Location: Region + Venue ===================== */
// Same US-state-or-international-city/region model as ufc.js, with a
// tennis-scoped venue list (numerology_tennis_venues) since a UFC arena and
// a tournament site are different lists.

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

// US venues carry a `state`, international ones a `region` - each mode only
// lists its own kind so a US venue can't be picked for an overseas match.
function populateVenueSelect(selectValue) {
  const sel = document.getElementById('venueSelect');
  const visible = venues.filter((v) => (regionMode === 'intl' ? !!v.region : !v.region));
  sel.innerHTML = '<option value="">Select venue...</option>'
    + visible.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('')
    + '<option value="__add__">+ Add New Venue</option>';
  sel.value = selectValue || '';
}

function updateEditVenueBtnVisibility() {
  const val = document.getElementById('venueSelect').value;
  document.getElementById('editVenueBtn').style.display = (val && val !== '__add__') ? '' : 'none';
}

function updateEditRegionBtnVisibility() {
  const show = regionMode === 'intl' && !!(selectedRegion && selectedRegion.id);
  document.getElementById('editRegionBtn').style.display = show ? '' : 'none';
}

function setRegionFoundedStatus(message, isError) {
  const el = document.getElementById('regionFoundedStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

// Same Wikidata-then-Wikipedia-infobox lookup used for player birthdays
// (lookupKeyDateByName in db-core.js), just aimed at a city/region's
// founding date instead - coverage is noticeably thinner here than for
// people, so failing quietly and leaving manual entry as the fallback is
// the expected common case, not a bug.
function lookupRegionFoundedDate(name) {
  setRegionFoundedStatus('🔍 Looking up founding date...', false);
  lookupKeyDateByName(name)
    .then((info) => {
      if (!info) {
        setRegionFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newRegionFounded').value = isoToDisplay(info.date);
      setRegionFoundedStatus(`✓ Found via Wikipedia/Wikidata (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setRegionFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function openRegionForm(region) {
  closeVenueForm();
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

populateRegionOptionsInto(document.getElementById('stateSelect'), true);
populateRegionOptionsInto(document.getElementById('newVenueState'), false);
populateVenueSelect();
updateEditVenueBtnVisibility();

document.querySelectorAll('#regionToggle .hours-toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.region === regionMode) return;
    regionMode = btn.dataset.region;
    document.querySelectorAll('#regionToggle .hours-toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
    selectedRegion = null;
    selectedVenue = null;
    closeRegionForm();
    closeVenueForm();
    document.getElementById('regionLabel').textContent = regionMode === 'intl' ? 'City / Region' : 'State';
    populateRegionOptionsInto(document.getElementById('stateSelect'), true);
    populateRegionOptionsInto(document.getElementById('newVenueState'), false);
    populateVenueSelect();
    updateEditVenueBtnVisibility();
    updateEditRegionBtnVisibility();
  });
});

document.getElementById('stateSelect').addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === '__addRegion__') {
    e.target.value = '';
    selectedRegion = null;
    openRegionForm(null);
    updateEditRegionBtnVisibility();
    return;
  }
  selectedRegion = regionFromSelectValue(val);
  updateEditRegionBtnVisibility();
});

document.getElementById('editRegionBtn').addEventListener('click', () => {
  if (selectedRegion && selectedRegion.id) openRegionForm(selectedRegion);
});

document.getElementById('cancelRegionBtn').addEventListener('click', closeRegionForm);

document.getElementById('saveRegionBtn').addEventListener('click', () => {
  const name = document.getElementById('newRegionName').value.trim();
  const founded = displayToISO(document.getElementById('newRegionFounded').value);
  if (!name) { alert('Please enter a city / region name.'); return; }
  if (!founded) { alert('Please enter a valid founding date (MM/DD/YYYY).'); return; }

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
  populateRegionOptionsInto(document.getElementById('newVenueState'), false);
  document.getElementById('stateSelect').value = selectId;
  selectedRegion = regionFromSelectValue(selectId);
  updateEditRegionBtnVisibility();
  closeRegionForm();
});

document.getElementById('venueSelect').addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === '__add__') {
    e.target.value = '';
    openVenueForm(null);
    updateEditVenueBtnVisibility();
    return;
  }

  closeVenueForm();
  updateEditVenueBtnVisibility();

  if (val) {
    const venue = venues.find((v) => v.id === val);
    selectedVenue = venue || null;
    if (venue && regionMode === 'us' && venue.state) {
      const stIdx = stateIndexByName(venue.state);
      if (stIdx !== -1) {
        document.getElementById('stateSelect').value = String(stIdx);
        selectedRegion = US_STATES[stIdx];
      }
    } else if (venue && regionMode === 'intl' && venue.region) {
      const c = allIntlRegions().find((x) => x.name === venue.region);
      if (c) {
        document.getElementById('stateSelect').value = c.id;
        selectedRegion = c;
      }
    }
  } else {
    selectedVenue = null;
  }
  updateEditRegionBtnVisibility();
});

document.getElementById('editVenueBtn').addEventListener('click', () => {
  const venue = venues.find((v) => v.id === document.getElementById('venueSelect').value);
  if (venue) openVenueForm(venue);
});

function setVenueFoundedStatus(message, isError) {
  const el = document.getElementById('venueFoundedStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

function lookupVenueFoundedDate(name) {
  setVenueFoundedStatus('🔍 Looking up founding date...', false);
  lookupKeyDateByName(name)
    .then((info) => {
      if (!info) {
        setVenueFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newVenueFounded').value = isoToDisplay(info.date);
      setVenueFoundedStatus(`✓ Found via Wikipedia/Wikidata (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setVenueFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function openVenueForm(venue) {
  closeRegionForm();
  document.getElementById('addVenueForm').classList.add('active');
  setVenueFoundedStatus('', false);
  const regionSel = document.getElementById('newVenueState');
  if (venue) {
    editingVenueId = venue.id;
    document.getElementById('newVenueName').value = venue.name;
    document.getElementById('newVenueFounded').value = isoToDisplay(venue.founded);
    if (regionMode === 'us') {
      const idx = venue.state ? stateIndexByName(venue.state) : -1;
      regionSel.value = idx !== -1 ? String(idx) : '';
    } else {
      const c = venue.region ? allIntlRegions().find((x) => x.name === venue.region) : null;
      regionSel.value = c ? c.id : '';
    }
    document.getElementById('venueFormLabel').textContent = `Edit Venue - ${venue.name}`;
    document.getElementById('saveVenueBtn').textContent = 'Update Venue';
  } else {
    editingVenueId = null;
    document.getElementById('newVenueName').value = '';
    document.getElementById('newVenueFounded').value = '';
    regionSel.value = '';
    document.getElementById('venueFormLabel').textContent = 'Add New Venue';
    document.getElementById('saveVenueBtn').textContent = 'Save Venue';
  }
}

function closeVenueForm() {
  editingVenueId = null;
  document.getElementById('addVenueForm').classList.remove('active');
  document.getElementById('newVenueName').value = '';
  document.getElementById('newVenueFounded').value = '';
  document.getElementById('newVenueState').value = '';
  document.getElementById('venueFormLabel').textContent = 'Add New Venue';
  document.getElementById('saveVenueBtn').textContent = 'Save Venue';
  setVenueFoundedStatus('', false);
}

document.getElementById('newVenueName').addEventListener('blur', () => {
  const name = document.getElementById('newVenueName').value.trim();
  const foundedFilled = document.getElementById('newVenueFounded').value.trim();
  if (name && !foundedFilled && !editingVenueId) lookupVenueFoundedDate(name);
});

document.getElementById('cancelVenueBtn').addEventListener('click', closeVenueForm);

document.getElementById('saveVenueBtn').addEventListener('click', () => {
  const name = document.getElementById('newVenueName').value.trim();
  const founded = displayToISO(document.getElementById('newVenueFounded').value);
  const regionVal = document.getElementById('newVenueState').value;
  if (!name) { alert('Please enter a venue name.'); return; }
  if (!founded) { alert('Please enter a valid founding date for the venue (MM/DD/YYYY).'); return; }
  if (regionVal === '') { alert(`Please select which ${regionNoun()} this venue is in.`); return; }

  const regionFields = regionMode === 'us'
    ? { state: US_STATES[Number(regionVal)].name }
    : { region: (allIntlRegions().find((c) => c.id === regionVal) || {}).name };

  let selectValue;
  if (editingVenueId) {
    const idx = venues.findIndex((v) => v.id === editingVenueId);
    if (idx !== -1) venues[idx] = { id: editingVenueId, name, founded, ...regionFields };
    selectValue = editingVenueId;
  } else {
    const venue = { id: uid(), name, founded, ...regionFields };
    venues.push(venue);
    selectValue = venue.id;
  }
  saveTennisVenues(venues);
  populateVenueSelect(selectValue);
  document.getElementById('stateSelect').value = regionVal;
  selectedRegion = regionFromSelectValue(regionVal);
  selectedVenue = venues.find((v) => v.id === selectValue) || null;
  updateEditVenueBtnVisibility();
  updateEditRegionBtnVisibility();
  closeVenueForm();
});

/* ===================== Matchup scoring ===================== */
// Same Day 60/Venue 15/Region 25 (or Day 75/Region 25 without a venue) blend
// as ufc.js's computeFighterScore().

function computeMatchScore(dobDate, matchDate, venueDate, regionDate) {
  const day = computeCompatibility(dobDate, matchDate, sportsNumerologyCompat);
  const region = computeCompatibility(dobDate, regionDate, sportsNumerologyCompat);

  if (!venueDate) {
    const combined = Math.round(0.75 * day.finalScore + 0.25 * region.finalScore);
    return { day, venue: null, region, combined };
  }

  const venue = computeCompatibility(dobDate, venueDate, sportsNumerologyCompat);
  const combined = Math.round(0.60 * day.finalScore + 0.15 * venue.finalScore + 0.25 * region.finalScore);
  return { day, venue, region, combined };
}

function renderPlayerBreakdown(containerEl, player, score, venueName, regionName) {
  const hasVenue = !!score.venue;
  const regionTabLabel = regionMode === 'intl' ? '🏙️ Region' : '🗺️ State';

  containerEl.innerHTML = `
    <div class="score-hero ufc-combined-hero">
      <div class="score-names">Combined Score</div>
      <div class="score-big ${scoreClass(score.combined)}">${score.combined}<span class="score-out-of">/100</span></div>
    </div>
    <div class="ufc-subscore-tabs">
      <button type="button" class="ufc-subscore-tab active" data-factor="day">
        <span class="ufc-subscore-name">🗓️ Match Day</span>
        <span class="ufc-subscore-val ${scoreClass(score.day.finalScore)}">${score.day.finalScore}</span>
      </button>
      ${hasVenue ? `
      <button type="button" class="ufc-subscore-tab" data-factor="venue">
        <span class="ufc-subscore-name">🏟️ Venue</span>
        <span class="ufc-subscore-val ${scoreClass(score.venue.finalScore)}">${score.venue.finalScore}</span>
      </button>` : ''}
      <button type="button" class="ufc-subscore-tab" data-factor="region">
        <span class="ufc-subscore-name">${regionTabLabel}</span>
        <span class="ufc-subscore-val ${scoreClass(score.region.finalScore)}">${score.region.finalScore}</span>
      </button>
    </div>
    <div class="ufc-subscore-detail"></div>
  `;

  const detailEl = containerEl.querySelector('.ufc-subscore-detail');
  const factors = {
    day: { result: score.day, label: 'Match Day' },
    region: { result: score.region, label: regionName },
  };
  if (hasVenue) factors.venue = { result: score.venue, label: venueName };

  function showFactor(factor) {
    containerEl.querySelectorAll('.ufc-subscore-tab').forEach((t) => t.classList.toggle('active', t.dataset.factor === factor));
    renderCompatResults(detailEl, factors[factor].result, player.name, factors[factor].label);
  }

  containerEl.querySelectorAll('.ufc-subscore-tab').forEach((t) => {
    t.addEventListener('click', () => showFactor(t.dataset.factor));
  });

  showFactor('day');
}

document.getElementById('calculateBtn').addEventListener('click', () => {
  if (!selectedPlayers.A || !selectedPlayers.B) {
    alert('Please select both players.');
    return;
  }
  const matchDateInput = document.getElementById('matchDate');
  const matchDateISO = displayToISO(matchDateInput.value);
  if (!matchDateISO) {
    alert('Please enter a valid match date (MM/DD/YYYY), or click Today.');
    return;
  }
  const region = regionFromSelectValue(document.getElementById('stateSelect').value);
  if (!region) {
    alert(`Please select the ${regionNoun()} the match is taking place in.`);
    return;
  }
  const venueId = document.getElementById('venueSelect').value;
  const venue = (venueId && venueId !== '__add__') ? venues.find((v) => v.id === venueId) : null;

  const matchDate = parseDateInput(matchDateISO);
  const venueDate = venue ? parseDateInput(venue.founded) : null;
  const regionDate = parseDateInput(region.founded);
  const playerA = selectedPlayers.A;
  const playerB = selectedPlayers.B;

  const scoreA = computeMatchScore(parseDateInput(playerA.dob), matchDate, venueDate, regionDate);
  const scoreB = computeMatchScore(parseDateInput(playerB.dob), matchDate, venueDate, regionDate);

  const resultsEl = document.getElementById('tennisResults');
  resultsEl.classList.add('active');

  const edgeEl = document.getElementById('edgeBanner');
  let aWins = null;
  if (scoreA.combined === scoreB.combined) {
    edgeEl.innerHTML = `<div class="edge-tie">🎾 Even matchup &mdash; ${scoreA.combined} vs ${scoreB.combined}</div>`;
  } else {
    aWins = scoreA.combined > scoreB.combined;
    const winner = aWins ? playerA : playerB;
    const winnerScore = aWins ? scoreA.combined : scoreB.combined;
    const loserScore = aWins ? scoreB.combined : scoreA.combined;
    edgeEl.innerHTML = `<div class="edge-winner">🎾 Edge: <strong>${escapeHtml(winner.name)}</strong> &mdash; ${winnerScore} vs ${loserScore}</div>`;
  }

  document.getElementById('matchupTitleA').innerHTML = `${aWins === true ? '<span class="crown">👑</span> ' : ''}${escapeHtml(playerA.name)}`;
  document.getElementById('matchupTitleB').innerHTML = `${aWins === false ? '<span class="crown">👑</span> ' : ''}${escapeHtml(playerB.name)}`;

  const venueName = venue ? venue.name : null;
  renderPlayerBreakdown(document.getElementById('resultA'), playerA, scoreA, venueName, region.name);
  renderPlayerBreakdown(document.getElementById('resultB'), playerB, scoreB, venueName, region.name);
});

/* ===================== Deep links from the Polymarket tracker ===================== */
// polymarket-tennis.js links here with ?a=&b=&date= (both players already in
// the roster) or ?addPlayer= (a player Polymarket knows about that isn't in
// the roster yet), so a whale bet can be followed straight into a full
// matchup without retyping anything.

(function handlePolymarketDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const nameA = params.get('a');
  const nameB = params.get('b');
  const date = params.get('date');
  const addPlayerName = params.get('addPlayer');

  if (nameA && nameB) {
    const playerA = allPlayers.find((p) => p.name.toLowerCase() === nameA.toLowerCase());
    const playerB = allPlayers.find((p) => p.name.toLowerCase() === nameB.toLowerCase());
    if (playerA) selectPlayer('A', playerA);
    if (playerB) selectPlayer('B', playerB);
  }
  if (date) {
    document.getElementById('matchDate').value = date;
  }
  if (addPlayerName) {
    openPlayerForm(null);
    document.getElementById('newPlayerName').value = addPlayerName;
    lookupPlayerBirthday(addPlayerName);
  }
})();

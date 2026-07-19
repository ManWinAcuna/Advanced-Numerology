const GAMMA_EVENTS_URL = 'https://gamma-api.polymarket.com/events/keyset?tag_slug=ufc&closed=false&limit=100';
const TRADES_URL = 'https://data-api.polymarket.com/trades';
const LEADERBOARD_ALL_URL = 'https://data-api.polymarket.com/v1/leaderboard?category=SPORTS&timePeriod=ALL&orderBy=PNL&limit=50';
const LEADERBOARD_MONTH_URL = 'https://data-api.polymarket.com/v1/leaderboard?category=SPORTS&timePeriod=MONTH&orderBy=PNL&limit=50';

const WHALE_THRESHOLD_USD = 500;
const TRADES_POLL_MS = 20000;
const EVENTS_POLL_MS = 5 * 60 * 1000;
const CARD_WINDOW_MS = 16 * 3600 * 1000; // fights within this window of the soonest one count as "the same card"
const LOOKBACK_MS = 6 * 3600 * 1000; // still show fights that started up to this long ago (likely still live)

let leaderboardMap = new Map();
let cardFights = [];
const tradesCache = new Map();

/* ===================== Manually-dismissed fights ===================== */
// Polymarket's own "closed" flag is the authoritative signal a fight is
// over, but it lags real life - sometimes by a lot for lower-profile
// undercard bouts, since resolution isn't instant and the trading price
// doesn't reliably jump to near-certain either. This lets the user hide a
// fight they've personally watched finish, without waiting on Polymarket -
// it's purely a local "I've seen this" note, layered on top of the same
// automatic closed/active filtering below, which keeps running regardless.
const DISMISSED_FIGHTS_KEY = 'numerology_pm_dismissed_fights';

function loadDismissedFights() {
  try {
    const raw = localStorage.getItem(DISMISSED_FIGHTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

function saveDismissedFights(set) {
  localStorage.setItem(DISMISSED_FIGHTS_KEY, JSON.stringify([...set]));
}

let dismissedFights = loadDismissedFights();

/* ===================== Risk manager (stake + track record) ===================== */
// One shared stake applies to every fight card rather than a separate box
// per fight - the question is "if I bet my usual amount on picks like
// this," not a different amount each time. PRICE_BUCKETS, bucketForPrice,
// and computeBucketStats live in db-core.js, shared with the Stats page so
// the two can never disagree about what a bucket contains.
const STAKE_KEY = 'numerology_pm_stake';

function loadStake() {
  const n = Number(localStorage.getItem(STAKE_KEY));
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function saveStake(n) {
  localStorage.setItem(STAKE_KEY, String(n));
}

let currentStake = loadStake();

// EV threshold below which a pick is called "roughly matches the market"
// rather than a clear favor/avoid - 10% of stake, so small noise in a
// still-growing sample doesn't get over-read as a strong signal either way.
const RISK_FLAG_THRESHOLD_FRACTION = 0.10;

function riskManagerHtml(pickName, pickPrice) {
  if (pickPrice == null) return '';

  const bucket = bucketForPrice(pickPrice);
  const stat = computeBucketStats(loadUfcPredictions()).find((b) => b.label === bucket.label);

  const payout = currentStake / pickPrice;
  const profit = payout - currentStake;

  let flagHtml;
  if (!stat || stat.count < MIN_BUCKET_SAMPLE) {
    const count = stat ? stat.count : 0;
    flagHtml = `<div class="pm-risk-flag unknown">📊 Not enough track record yet in the ${bucket.label} range (${count} pick${count === 1 ? '' : 's'}) to judge this one.</div>`;
  } else {
    const winProb = stat.winPct / 100;
    const expectedProfit = winProb * payout - currentStake;
    const threshold = currentStake * RISK_FLAG_THRESHOLD_FRACTION;

    let tier = 'mid';
    let icon = '➖';
    let verdict = 'roughly matches the market here';
    if (expectedProfit > threshold) {
      tier = 'good'; icon = '✅'; verdict = 'favors this bet';
    } else if (expectedProfit < -threshold) {
      tier = 'bad'; icon = '⚠️'; verdict = 'says be cautious here';
    }

    const sign = expectedProfit >= 0 ? '+' : '-';
    flagHtml = `<div class="pm-risk-flag ${tier}">${icon} Track record ${verdict} &mdash; picks in the ${bucket.label} range have hit ${stat.winPct}% (${stat.wins}/${stat.count}), for an expected ${sign}$${Math.abs(expectedProfit).toFixed(2)} per $${currentStake} bet.</div>`;
  }

  return `
    <div class="pm-risk-manager">
      <div class="pm-risk-row"><span>$${currentStake} on ${escapeHtml(pickName)} at ${Math.round(pickPrice * 100)}%</span><span>pays $${payout.toFixed(2)} (${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toFixed(2)})</span></div>
      ${flagHtml}
    </div>
  `;
}

function initStakeInput() {
  const input = document.getElementById('pmStakeInput');
  input.value = currentStake;
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (!Number.isFinite(n) || n <= 0) return;
    currentStake = n;
    saveStake(n);
    renderFightCards();
    renderTradeFeeds();
  });
}

/* ===================== Fight location (region + stadium) ===================== */
// Polymarket gives no venue data, and the numerology score depends on it
// (Day/Stadium/Region, same formula as ufc.js) - so no score shows at all
// until the user sets a location here. Every fight on a UFC Fight Night
// shares one venue, so this is set once per card rather than per fight.
// The region is a US state (statehood date) or, for international cards, the
// host city/emirate/province (its founding date, e.g. Abu Dhabi's) - toggled
// between with the US/International switch.

let stadiums = loadStadiums();
let editingStadiumId = null;
let editingRegionId = null;
let regionMode = 'us'; // 'us' | 'intl'
let selectedRegion = null; // a US_STATES entry or an allIntlRegions() entry - both carry .name/.founded
let selectedStadium = null;

/* ===================== Location persistence ===================== */
// Remembering the card's location across visits means the user doesn't have
// to re-pick a state/stadium every single time they open the tracker - it
// just stays put until the card it was set for has completely wrapped up
// (no more games), at which point it clears itself automatically so the
// next (different) card doesn't silently inherit a stale venue.
const LOCATION_KEY = 'numerology_ufc_pm_location';

function loadSavedLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLocationState() {
  localStorage.setItem(LOCATION_KEY, JSON.stringify({
    regionMode,
    regionName: selectedRegion ? selectedRegion.name : null,
    stadiumId: selectedStadium ? selectedStadium.id : null,
  }));
}

function clearSavedLocation() {
  localStorage.removeItem(LOCATION_KEY);
}

// Clears the in-memory selection and resets the controls' UI to match -
// called once the card's fights are all gone (no more games).
function resetLocationSelection() {
  if (!selectedRegion && !selectedStadium && regionMode === 'us') { clearSavedLocation(); return; }
  regionMode = 'us';
  selectedRegion = null;
  selectedStadium = null;
  clearSavedLocation();
  document.querySelectorAll('#pmRegionToggle .hours-toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.region === 'us'));
  document.getElementById('pmRegionLabel').textContent = 'State';
  populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
  populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);
  document.getElementById('pmStateSelect').value = '';
  populateStadiumSelect();
  updateEditRegionBtnVisibility();
  updateEditStadiumBtnVisibility();
  updateLocationSummaryUI();
}

// Applies whatever's saved to both the in-memory state and the location
// controls' UI - called once at init, before the card's first render.
function restoreSavedLocationIntoUI() {
  const saved = loadSavedLocation();
  if (!saved) return;

  regionMode = saved.regionMode === 'intl' ? 'intl' : 'us';
  document.querySelectorAll('#pmRegionToggle .hours-toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.region === regionMode));
  document.getElementById('pmRegionLabel').textContent = regionMode === 'intl' ? 'City / Region' : 'State';
  populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
  populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);

  const list = regionMode === 'us' ? US_STATES : allIntlRegions();
  selectedRegion = saved.regionName ? (list.find((r) => r.name === saved.regionName) || null) : null;
  if (selectedRegion) {
    document.getElementById('pmStateSelect').value = regionMode === 'us'
      ? String(US_STATES.findIndex((s) => s.name === selectedRegion.name))
      : selectedRegion.id;
  }

  selectedStadium = saved.stadiumId ? (stadiums.find((s) => s.id === saved.stadiumId) || null) : null;
  populateStadiumSelect(selectedStadium ? selectedStadium.id : '');

  updateEditRegionBtnVisibility();
  updateEditStadiumBtnVisibility();
}

/* ===================== Collapsed location summary ===================== */
// Once a location is set, the full control block collapses to a one-line
// chip plus a live clock showing the venue's current local time - the
// clock doubles as reassurance that the right timezone resolved for
// match-day scoring (see currentMatchDateISO below), in a way a user can
// sanity-check at a glance. "Change" re-expands the controls.

let locationManuallyExpanded = false;

function updateLocationSummaryUI() {
  const box = document.getElementById('pmLocationBox');
  const summary = document.getElementById('pmLocationSummary');
  if (!selectedRegion || locationManuallyExpanded) {
    box.classList.remove('collapsed');
    summary.style.display = 'none';
    return;
  }

  box.classList.add('collapsed');
  summary.style.display = '';
  document.getElementById('pmLocationSummaryText').textContent =
    `📍 ${selectedRegion.name}${selectedStadium ? ` · ${selectedStadium.name}` : ''}`;

  const clockEl = document.getElementById('pmLocationClock');
  const now = venueLocalTimeNow(regionMode, selectedRegion);
  if (now) {
    clockEl.classList.remove('warn');
    clockEl.textContent = `🕐 Local time at the venue right now: ${now} — match days are scored on this clock.`;
  } else if (regionMode === 'intl') {
    ensureIntlRegionTimezone(selectedRegion, updateLocationSummaryUI);
    clockEl.classList.add('warn');
    clockEl.textContent = "⚠️ Couldn't confirm this region's timezone yet — match days fall back to UTC dates.";
  } else {
    clockEl.textContent = '';
  }
}

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
  if (val === '' || val == null) return null;
  if (regionMode === 'us') return US_STATES[Number(val)] || null;
  return allIntlRegions().find((c) => c.id === val) || null;
}

// US stadiums carry a `state`, international ones a `region` (older records
// may still say `country`) - each mode only lists its own kind so a Vegas
// arena can't be picked for an Abu Dhabi card.
function populateStadiumSelect(selectValue) {
  const sel = document.getElementById('pmStadiumSelect');
  const visible = stadiums.filter((s) => (regionMode === 'intl' ? !!(s.region || s.country) : !(s.region || s.country)));
  sel.innerHTML = '<option value="">Select stadium...</option>'
    + visible.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
    + '<option value="__add__">+ Add New Stadium</option>';
  sel.value = selectValue || '';
}

function updateEditRegionBtnVisibility() {
  const show = regionMode === 'intl' && !!(selectedRegion && selectedRegion.id);
  document.getElementById('pmEditRegionBtn').style.display = show ? '' : 'none';
}

function setRegionFoundedStatus(message, isError) {
  const el = document.getElementById('pmRegionFoundedStatus');
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
      document.getElementById('pmNewRegionFounded').value = isoToDisplay(info.date);
      const source = info.via === 'country' ? "its country's founding" : 'Wikipedia/Wikidata';
      setRegionFoundedStatus(`✓ Found via ${source} (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setRegionFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function openRegionForm(region) {
  closeStadiumForm();
  document.getElementById('pmAddRegionForm').classList.add('active');
  setRegionFoundedStatus('', false);
  if (region) {
    editingRegionId = region.id;
    document.getElementById('pmNewRegionName').value = region.name;
    document.getElementById('pmNewRegionFounded').value = isoToDisplay(region.founded);
    document.getElementById('pmRegionFormLabel').textContent = `Edit City / Region - ${region.name}`;
    document.getElementById('pmSaveRegionBtn').textContent = 'Update Region';
  } else {
    editingRegionId = null;
    document.getElementById('pmNewRegionName').value = '';
    document.getElementById('pmNewRegionFounded').value = '';
    document.getElementById('pmRegionFormLabel').textContent = 'Add New City / Region';
    document.getElementById('pmSaveRegionBtn').textContent = 'Save Region';
  }
}

function closeRegionForm() {
  editingRegionId = null;
  document.getElementById('pmAddRegionForm').classList.remove('active');
  document.getElementById('pmNewRegionName').value = '';
  document.getElementById('pmNewRegionFounded').value = '';
  document.getElementById('pmRegionFormLabel').textContent = 'Add New City / Region';
  document.getElementById('pmSaveRegionBtn').textContent = 'Save Region';
  setRegionFoundedStatus('', false);
}

function updateEditStadiumBtnVisibility() {
  const val = document.getElementById('pmStadiumSelect').value;
  document.getElementById('pmEditStadiumBtn').style.display = (val && val !== '__add__') ? '' : 'none';
}

function setStadiumFoundedStatus(message, isError) {
  const el = document.getElementById('pmStadiumFoundedStatus');
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
      document.getElementById('pmNewStadiumFounded').value = isoToDisplay(info.date);
      setStadiumFoundedStatus(`✓ Found via Wikipedia/Wikidata (${info.date}) - please double-check before saving.`, false);
    })
    .catch(() => setStadiumFoundedStatus(`Couldn't find a founding date automatically for ${name} - please enter it yourself.`, true));
}

function openStadiumForm(stadium) {
  closeRegionForm();
  document.getElementById('pmAddStadiumForm').classList.add('active');
  setStadiumFoundedStatus('', false);
  const regionSel = document.getElementById('pmNewStadiumState');
  if (stadium) {
    editingStadiumId = stadium.id;
    document.getElementById('pmNewStadiumName').value = stadium.name;
    document.getElementById('pmNewStadiumFounded').value = isoToDisplay(stadium.founded);
    if (regionMode === 'us') {
      const idx = stadium.state ? stateIndexByName(stadium.state) : -1;
      regionSel.value = idx !== -1 ? String(idx) : '';
    } else {
      const regionName = stadium.region || stadium.country;
      const c = regionName ? allIntlRegions().find((x) => x.name === regionName) : null;
      regionSel.value = c ? c.id : '';
    }
    document.getElementById('pmStadiumFormLabel').textContent = `Edit Stadium - ${stadium.name}`;
    document.getElementById('pmSaveStadiumBtn').textContent = 'Update Stadium';
  } else {
    editingStadiumId = null;
    document.getElementById('pmNewStadiumName').value = '';
    document.getElementById('pmNewStadiumFounded').value = '';
    regionSel.value = '';
    document.getElementById('pmStadiumFormLabel').textContent = 'Add New Stadium';
    document.getElementById('pmSaveStadiumBtn').textContent = 'Save Stadium';
  }
}

function closeStadiumForm() {
  editingStadiumId = null;
  document.getElementById('pmAddStadiumForm').classList.remove('active');
  document.getElementById('pmNewStadiumName').value = '';
  document.getElementById('pmNewStadiumFounded').value = '';
  document.getElementById('pmNewStadiumState').value = '';
  document.getElementById('pmStadiumFormLabel').textContent = 'Add New Stadium';
  document.getElementById('pmSaveStadiumBtn').textContent = 'Save Stadium';
  setStadiumFoundedStatus('', false);
}

function initLocationControls() {
  attachDateMask(document.getElementById('pmNewStadiumFounded'));
  attachDateMask(document.getElementById('pmNewRegionFounded'));
  populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
  populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);
  populateStadiumSelect();
  updateEditStadiumBtnVisibility();
  restoreSavedLocationIntoUI();
  updateLocationSummaryUI();

  document.getElementById('pmLocationChangeBtn').addEventListener('click', () => {
    locationManuallyExpanded = true;
    updateLocationSummaryUI();
  });

  // Keep the venue clock ticking while collapsed.
  setInterval(() => {
    if (document.visibilityState === 'visible' && selectedRegion && !locationManuallyExpanded) updateLocationSummaryUI();
  }, 60000);

  document.querySelectorAll('#pmRegionToggle .hours-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.region === regionMode) return;
      regionMode = btn.dataset.region;
      document.querySelectorAll('#pmRegionToggle .hours-toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
      selectedRegion = null;
      selectedStadium = null;
      closeRegionForm();
      closeStadiumForm();
      document.getElementById('pmRegionLabel').textContent = regionMode === 'intl' ? 'City / Region' : 'State';
      populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
      populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);
      populateStadiumSelect();
      updateEditStadiumBtnVisibility();
      updateEditRegionBtnVisibility();
      updateNumerologyBlocks();
    });
  });

  document.getElementById('pmStateSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === '__addRegion__') {
      e.target.value = '';
      selectedRegion = null;
      openRegionForm(null);
      updateEditRegionBtnVisibility();
      updateNumerologyBlocks();
      return;
    }
    selectedRegion = regionFromSelectValue(val);
    updateEditRegionBtnVisibility();
    updateNumerologyBlocks();
  });

  document.getElementById('pmEditRegionBtn').addEventListener('click', () => {
    if (selectedRegion && selectedRegion.id) openRegionForm(selectedRegion);
  });

  document.getElementById('pmCancelRegionBtn').addEventListener('click', closeRegionForm);

  document.getElementById('pmNewRegionName').addEventListener('blur', () => {
    const name = document.getElementById('pmNewRegionName').value.trim();
    const foundedFilled = document.getElementById('pmNewRegionFounded').value.trim();
    if (name && !foundedFilled && !editingRegionId) lookupRegionFoundedDate(name);
  });

  document.getElementById('pmRegionLookupBtn').addEventListener('click', () => {
    const name = document.getElementById('pmNewRegionName').value.trim();
    if (!name) { alert('Please enter a city / region name first.'); return; }
    lookupRegionFoundedDate(name);
  });

  document.getElementById('pmSaveRegionBtn').addEventListener('click', () => {
    const name = document.getElementById('pmNewRegionName').value.trim();
    const founded = displayToISO(document.getElementById('pmNewRegionFounded').value);
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
    populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
    populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);
    document.getElementById('pmStateSelect').value = selectId;
    selectedRegion = regionFromSelectValue(selectId);
    updateEditRegionBtnVisibility();
    closeRegionForm();
    updateNumerologyBlocks();
  });

  document.getElementById('pmStadiumSelect').addEventListener('change', (e) => {
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
      selectedStadium = stadium || null;
      if (stadium && regionMode === 'us' && stadium.state) {
        const stIdx = stateIndexByName(stadium.state);
        if (stIdx !== -1) {
          document.getElementById('pmStateSelect').value = String(stIdx);
          selectedRegion = US_STATES[stIdx];
        }
      } else if (stadium && regionMode === 'intl' && (stadium.region || stadium.country)) {
        const c = allIntlRegions().find((x) => x.name === (stadium.region || stadium.country));
        if (c) {
          document.getElementById('pmStateSelect').value = c.id;
          selectedRegion = c;
        }
      }
    } else {
      selectedStadium = null;
    }
    updateEditRegionBtnVisibility();
    updateNumerologyBlocks();
  });

  document.getElementById('pmEditStadiumBtn').addEventListener('click', () => {
    const stadium = stadiums.find((s) => s.id === document.getElementById('pmStadiumSelect').value);
    if (stadium) openStadiumForm(stadium);
  });

  document.getElementById('pmCancelStadiumBtn').addEventListener('click', closeStadiumForm);

  document.getElementById('pmNewStadiumName').addEventListener('blur', () => {
    const name = document.getElementById('pmNewStadiumName').value.trim();
    const foundedFilled = document.getElementById('pmNewStadiumFounded').value.trim();
    if (name && !foundedFilled && !editingStadiumId) lookupStadiumFoundedDate(name);
  });

  document.getElementById('pmStadiumLookupBtn').addEventListener('click', () => {
    const name = document.getElementById('pmNewStadiumName').value.trim();
    if (!name) { alert('Please enter a stadium name first.'); return; }
    lookupStadiumFoundedDate(name);
  });

  document.getElementById('pmSaveStadiumBtn').addEventListener('click', () => {
    const name = document.getElementById('pmNewStadiumName').value.trim();
    const founded = displayToISO(document.getElementById('pmNewStadiumFounded').value);
    const regionVal = document.getElementById('pmNewStadiumState').value;
    if (!name) { alert('Please enter a stadium name.'); return; }
    if (!founded) { alert('Please enter a valid founding date for the stadium (MM/DD/YYYY).'); return; }
    if (regionVal === '') { alert(`Please select which ${regionNoun()} this stadium is in.`); return; }

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
    document.getElementById('pmStateSelect').value = regionVal;
    selectedRegion = regionFromSelectValue(regionVal);
    selectedStadium = stadiums.find((s) => s.id === selectValue) || null;
    updateEditStadiumBtnVisibility();
    updateEditRegionBtnVisibility();
    closeStadiumForm();
    updateNumerologyBlocks();
  });
}

// computeFighterScore() now lives in db-core.js (shared with ufc.js and
// polymarket-mlb.js) - returns the three factors plus the combined number so
// the breakdown popup can show all of them.

// The calendar date scoring uses is the one that's actually showing on a
// clock at the venue, not whichever UTC date the fight's timestamp happens
// to convert to - computed fresh each time (region can change after a fight
// card is already loaded) rather than cached once at enrichment time.
function currentMatchDateISO(gameStartTime) {
  if (regionMode === 'us') return localMatchDateISO(gameStartTime, 'us', selectedRegion);
  if (selectedRegion && !selectedRegion.timezone) {
    ensureIntlRegionTimezone(selectedRegion, () => updateNumerologyBlocks());
  }
  return localMatchDateISO(gameStartTime, 'intl', selectedRegion);
}

function scoresForFight(f) {
  if (!(f.matchedA && f.matchedB && selectedRegion)) return null;
  const matchDateISO = currentMatchDateISO(f.gameStartTime);
  if (!matchDateISO) return null; // timezone not confirmed yet - don't guess
  const matchDate = parseDateInput(matchDateISO);
  const stateDate = parseDateInput(selectedRegion.founded);
  const stadiumDate = selectedStadium ? parseDateInput(selectedStadium.founded) : null;
  return {
    scoreA: computeFighterScore(parseDateInput(f.matchedA.dob), matchDate, stadiumDate, stateDate),
    scoreB: computeFighterScore(parseDateInput(f.matchedB.dob), matchDate, stadiumDate, stateDate),
  };
}

// Locks in one prediction per fight, the first time its numerology edge is
// shown - never overwritten afterward, so it stays what was actually seen
// rather than drifting as odds move. The Stats page resolves `result` later.
function recordPredictionIfNew(f, scoreA, scoreB, marketFavorite, numerologyFavorite, pickType) {
  const predictions = loadUfcPredictions();
  if (predictions.some((p) => p.conditionId === f.conditionId)) return;

  predictions.push({
    conditionId: f.conditionId,
    fighterAName: f.fighterAName,
    fighterBName: f.fighterBName,
    numerologyFavorite,
    numerologyScoreA: scoreA.combined,
    numerologyScoreB: scoreB.combined,
    marketFavorite,
    marketPriceA: f.priceA,
    marketPriceB: f.priceB,
    pickType,
    eventTitle: f.eventTitle,
    fightTime: f.gameStartTime.toISOString(),
    recordedAt: Date.now(),
    result: null,
  });
  saveUfcPredictions(predictions);
}

/* ===================== Fighter roster + matching ===================== */
// Mirrors buildAllFighters() in ufc.js so Polymarket fighter names can be
// matched against the same seed+override+custom roster the calculator uses.

function buildAllFighters() {
  const overrides = loadFighterOverrides();
  const custom = loadCustomFighters();
  const seedFighters = UFC_FIGHTERS.map((f, idx) => {
    const id = `seed-${idx}`;
    const override = overrides[id];
    return override ? { id, name: override.name, dob: override.dob } : { id, name: f.name, dob: f.dob };
  });
  return seedFighters.concat(custom);
}

// normalizeName() lives in db-core.js (shared with the Stats page).
function matchFighter(name, roster) {
  const norm = normalizeName(name);
  if (!norm) return null;

  let found = roster.find((f) => normalizeName(f.name) === norm);
  if (found) return found;

  const tokens = norm.split(' ');
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  found = roster.find((f) => {
    const rTokens = normalizeName(f.name).split(' ');
    return rTokens[0] === first && rTokens[rTokens.length - 1] === last;
  });
  return found || null;
}

function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* ===================== Data fetching ===================== */

function parseGameStart(raw) {
  if (!raw) return null;
  const iso = raw.replace(' ', 'T').replace(/\+00$/, 'Z').replace(/\+00:00$/, 'Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function parseMarket(market, event) {
  let outcomes = [];
  let prices = [];
  try { outcomes = JSON.parse(market.outcomes); } catch (e) { /* leave empty */ }
  try { prices = JSON.parse(market.outcomePrices).map(Number); } catch (e) { /* leave empty */ }

  return {
    conditionId: market.conditionId,
    fighterAName: outcomes[0] || '',
    fighterBName: outcomes[1] || '',
    priceA: Number.isFinite(prices[0]) ? prices[0] : null,
    priceB: Number.isFinite(prices[1]) ? prices[1] : null,
    gameStartTime: parseGameStart(market.gameStartTime),
    eventTitle: event.title,
  };
}

async function fetchUfcEvents() {
  try {
    const res = await fetch(GAMMA_EVENTS_URL);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.events) ? data.events : [];
  } catch (e) {
    return [];
  }
}

async function fetchTrades(conditionId) {
  try {
    const res = await fetch(`${TRADES_URL}?market=${conditionId}&limit=50`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// A wallet on the all-time SPORTS PNL leaderboard could be resting on one
// old lucky streak - only ~30% of the current all-time top 50 are still
// net-positive this month (checked directly against the live leaderboard).
// "SMART" now requires both: proven money over the long run AND still
// winning recently, not just once. (Polymarket's leaderboard has no
// per-sport breakdown, so this is sports-wide rather than UFC-specific -
// the tightest signal available without the app tracking its own
// UFC-only history over time.)
async function fetchLeaderboard() {
  const map = new Map();
  try {
    const [allRes, monthRes] = await Promise.all([fetch(LEADERBOARD_ALL_URL), fetch(LEADERBOARD_MONTH_URL)]);
    const allData = allRes.ok ? await allRes.json() : [];
    const monthData = monthRes.ok ? await monthRes.json() : [];

    const monthPnlByWallet = new Map();
    (monthData || []).forEach((r) => {
      if (r.proxyWallet) monthPnlByWallet.set(r.proxyWallet.toLowerCase(), r.pnl);
    });

    (allData || []).forEach((r) => {
      if (!r.proxyWallet) return;
      const wallet = r.proxyWallet.toLowerCase();
      const monthPnl = monthPnlByWallet.has(wallet) ? monthPnlByWallet.get(wallet) : null;
      map.set(wallet, {
        userName: r.userName,
        pnl: r.pnl,
        monthPnl,
        qualifiesSmart: monthPnl != null && monthPnl > 0,
      });
    });
  } catch (e) { /* leaderboard is a nice-to-have, fail quiet */ }
  return map;
}

/* ===================== Numerology enrichment ===================== */

function enrichWithNumerology(f) {
  const roster = buildAllFighters();
  f.matchedA = matchFighter(f.fighterAName, roster);
  f.matchedB = matchFighter(f.fighterBName, roster);
}

/* ===================== Rendering helpers ===================== */

function shortWallet(addr) {
  if (!addr) return 'Unknown';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsd(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function timeAgo(unixSeconds) {
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function fightBadge(gameStartTime) {
  if (!gameStartTime) return '';
  const now = Date.now();
  const t = gameStartTime.getTime();
  if (t <= now) return '<span class="pm-live-badge">🔴 Live / In Progress</span>';
  const diff = t - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return `<span class="pm-countdown-badge">Starts in ${label}</span>`;
}

function numerologyBlockHtml(f) {
  if (!(f.matchedA && f.matchedB)) {
    const unmatched = [];
    if (!f.matchedA) unmatched.push(f.fighterAName);
    if (!f.matchedB) unmatched.push(f.fighterBName);
    // returnTo carries the exact card back with it, so ufc.js can send the
    // user right back here (instead of the Polymarket hub menu) once the
    // fighter's saved - see scrollToConditionIdFromQuery below.
    const returnUrl = `polymarket-ufc.html?conditionId=${encodeURIComponent(f.conditionId)}`;
    return `<div class="pm-unmatched">${unmatched
      .map((n) => `${escapeHtml(n)} isn't in your fighter database yet &mdash; <a href="ufc.html?addFighter=${encodeURIComponent(n)}&returnTo=${encodeURIComponent(returnUrl)}">add them</a> for a numerology read.`)
      .join('<br>')}</div>`;
  }

  if (!selectedRegion) {
    return '<div class="pm-unmatched">Set the fight location above to see the numerology edge for this card.</div>';
  }

  const scores = scoresForFight(f);
  if (!scores) {
    return '<div class="pm-unmatched">⏳ Waiting to confirm this region\'s timezone before scoring &mdash; check back shortly.</div>';
  }
  const { scoreA, scoreB } = scores;
  const favA = f.priceA != null && f.priceB != null && f.priceA >= f.priceB;
  const marketFavName = favA ? f.fighterAName : f.fighterBName;
  const numFavMatched = scoreA.combined >= scoreB.combined ? f.matchedA : f.matchedB;
  const agree = normalizeName(marketFavName) === normalizeName(numFavMatched.name);

  recordPredictionIfNew(f, scoreA, scoreB, marketFavName, numFavMatched.name, agree ? 'favorite' : 'underdog');

  // A 70-vs-71 was never a pick - showing it as one would be a coin flip
  // dressed up as a signal. Tossups get a neutral line and no bet pitch;
  // real edges get their strength labeled so a 76-vs-41 visibly reads
  // different from a 62-vs-55. (The prediction is still recorded above
  // either way - the Stats page tracks tossups separately as a sanity
  // check that they really do land ~50/50.)
  const gap = Math.abs(scoreA.combined - scoreB.combined);
  const tier = edgeTierForGap(gap);
  const pickPrice = scoreA.combined >= scoreB.combined ? f.priceA : f.priceB;

  const signalHtml = tier.key === 'none'
    ? `<div class="pm-signal neutral">⚖️ Too close to call (${scoreA.combined} vs ${scoreB.combined}) &mdash; no real numerology edge on this one</div>`
    : `<div class="pm-signal ${agree ? 'agree' : 'disagree'}">${agree
      ? `✅ ${tier.icon} ${tier.label} &mdash; numerology agrees with the market favorite (${escapeHtml(marketFavName)})`
      : `⚡ ${tier.icon} ${tier.label} &mdash; numerology favors ${escapeHtml(numFavMatched.name)} while the market favors ${escapeHtml(marketFavName)} &mdash; possible value on ${escapeHtml(numFavMatched.name)}`}</div>`;

  return `
    <div class="pm-numerology-clickable" data-condition-id="${f.conditionId}">
      <div class="pm-edge-line">🔢 Numerology Edge: <span class="score-inline ${scoreClass(scoreA.combined)}">${escapeHtml(f.matchedA.name)} ${scoreA.combined}</span> vs <span class="score-inline ${scoreClass(scoreB.combined)}">${escapeHtml(f.matchedB.name)} ${scoreB.combined}</span></div>
      ${signalHtml}
      <div class="pm-breakdown-hint">Tap for the full Day / State / Stadium breakdown &rarr;</div>
    </div>
    ${tier.key === 'none' ? '' : riskManagerHtml(numFavMatched.name, pickPrice)}
  `;
}

// One fighter's column in the breakdown popup - drops the Stadium row
// entirely (not zeroed) when no stadium is set, same as ufc.js.
function breakdownColumnHtml(name, score) {
  const regionLabel = regionMode === 'intl' ? '🏙️ Region' : '🗺️ State';
  const stadiumRow = score.stadium
    ? `<div class="pm-breakdown-row"><span>🏟️ Stadium</span><span class="score-inline ${scoreClass(score.stadium.finalScore)}">${score.stadium.finalScore}</span></div>`
    : '';
  return `
    <div class="pm-breakdown-col">
      <div class="pm-breakdown-name">${escapeHtml(name)}</div>
      <div class="pm-breakdown-row"><span>🗓️ Fight Day</span><span class="score-inline ${scoreClass(score.day.finalScore)}">${score.day.finalScore}</span></div>
      <div class="pm-breakdown-row"><span>${regionLabel}</span><span class="score-inline ${scoreClass(score.state.finalScore)}">${score.state.finalScore}</span></div>
      ${stadiumRow}
      <div class="pm-breakdown-row pm-breakdown-total"><span>Combined</span><span class="score-inline ${scoreClass(score.combined)}">${score.combined}</span></div>
    </div>
  `;
}

// Research-based read on each fighter's life path (theme/volatility/athletic
// tag) plus a fighter-vs-fighter numerology reading via the shared
// numerologyCompat table - informational only, on the Insight tab. Fighters
// are never scored against each other for the real edge above (each is only
// ever scored against the day/state/stadium), so this is the one place that
// head-to-head number gets computed and shown at all.
function insightTabHtml(f) {
  const infoA = compatLifePathInfo(parseDateInput(f.matchedA.dob));
  const infoB = compatLifePathInfo(parseDateInput(f.matchedB.dob));
  const pair = pairInsight(infoA.lookupValue, infoB.lookupValue);
  return `
    <div class="pm-insight-grid">
      ${personInsightHtml(f.matchedA.name, infoA.display, infoA.lookupValue)}
      ${personInsightHtml(f.matchedB.name, infoB.display, infoB.lookupValue)}
    </div>
    <div class="pm-insight-pair">
      <div class="pm-insight-pair-clash">${pair.clash.icon} ${escapeHtml(pair.clash.label)} <span class="score-inline ${scoreClass(pair.score)}">${pair.score}</span></div>
      <div class="pm-insight-pair-theme">${escapeHtml(pair.themeLine)}</div>
    </div>
    <div class="pm-insight-disclaimer">Research-based read on each life path's tendencies &mdash; informational only, not part of the numerology edge above.</div>
  `;
}

function breakdownModalHtml(f, scores) {
  const hero = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(f.matchedA.name)} <span class="score-vs">&times;</span> ${escapeHtml(f.matchedB.name)}</div>
    </div>
  `;
  const breakdown = `
    <div class="pm-breakdown-grid">
      ${breakdownColumnHtml(f.matchedA.name, scores.scoreA)}
      ${breakdownColumnHtml(f.matchedB.name, scores.scoreB)}
    </div>
  `;
  return hero + modalTabsHtml(breakdown, insightTabHtml(f));
}

// Removes the card from view immediately and remembers it - independent of
// Polymarket's own closed/active flags, which keep being checked as normal
// on every subsequent load (see loadEventsAndRender's dismissedFights
// filter) so this only ever hides a fight sooner, never un-hides one.
function initDismissButtons() {
  document.getElementById('fightsContainer').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dismiss]');
    if (!btn) return;
    const conditionId = btn.dataset.dismiss;
    dismissedFights.add(conditionId);
    saveDismissedFights(dismissedFights);
    cardFights = cardFights.filter((f) => f.conditionId !== conditionId);
    renderFightCards();
    renderTradeFeeds();
  });
}

function initFeedToggles() {
  document.getElementById('fightsContainer').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feed-toggle]');
    if (!btn) return;
    const id = btn.dataset.feedToggle;
    if (openFeeds.has(id)) openFeeds.delete(id);
    else openFeeds.add(id);
    renderTradeFeeds();
  });
}

function initBreakdownModal() {
  document.getElementById('fightsContainer').addEventListener('click', (e) => {
    const trigger = e.target.closest('.pm-numerology-clickable');
    if (!trigger) return;
    const f = cardFights.find((x) => x.conditionId === trigger.dataset.conditionId);
    if (!f) return;
    const scores = scoresForFight(f);
    if (!scores) return;
    document.getElementById('pmBreakdownBody').innerHTML = breakdownModalHtml(f, scores);
    document.getElementById('pmBreakdownOverlay').classList.add('active');
  });

  document.getElementById('pmBreakdownClose').addEventListener('click', () => {
    document.getElementById('pmBreakdownOverlay').classList.remove('active');
  });
  document.getElementById('pmBreakdownOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'pmBreakdownOverlay') document.getElementById('pmBreakdownOverlay').classList.remove('active');
  });
  initModalTabSwitcher('pmBreakdownBody');
}

function fullMatchupHtml(f) {
  if (!(f.matchedA && f.matchedB)) return '';
  const params = new URLSearchParams({
    a: f.matchedA.name,
    b: f.matchedB.name,
    date: isoToDisplay(currentMatchDateISO(f.gameStartTime)),
  });
  return `<a class="btn" href="ufc.html?${params.toString()}">Full Matchup &rarr;</a>`;
}

// The edge tier's key for a fight's colored card strip - '' (default
// border) when scores can't be computed yet (unmatched fighter or no
// location set).
function cardTierKey(f) {
  if (!(f.matchedA && f.matchedB && selectedRegion)) return '';
  const scores = scoresForFight(f);
  if (!scores) return '';
  return edgeTierForGap(Math.abs(scores.scoreA.combined - scores.scoreB.combined)).key;
}

function renderFightCards() {
  const container = document.getElementById('fightsContainer');
  if (!cardFights.length) {
    container.innerHTML = '<div class="empty-state">No upcoming UFC fights found on Polymarket right now.</div>';
    return;
  }

  container.innerHTML = cardFights.map((f) => {
    const pctA = f.priceA != null ? Math.round(f.priceA * 100) : null;
    const pctB = f.priceB != null ? Math.round(f.priceB * 100) : null;
    const favA = pctA != null && pctB != null && pctA >= pctB;

    return `
      <div class="box pm-fight-card" id="pm-card-${f.conditionId}" data-tier="${cardTierKey(f)}">
        <div class="pm-fight-head">
          <div class="pm-fight-names">${escapeHtml(f.fighterAName)} vs ${escapeHtml(f.fighterBName)}</div>
          ${fightBadge(f.gameStartTime)}
        </div>
        <div class="pm-odds-row">
          <div class="pm-odds-pill ${favA ? 'favorite' : ''}">
            <div class="pm-odds-name">${escapeHtml(f.fighterAName)}</div>
            <div class="pm-odds-pct">${pctA != null ? `${pctA}%` : '—'}</div>
          </div>
          <div class="pm-odds-pill ${!favA && pctB != null ? 'favorite' : ''}">
            <div class="pm-odds-name">${escapeHtml(f.fighterBName)}</div>
            <div class="pm-odds-pct">${pctB != null ? `${pctB}%` : '—'}</div>
          </div>
        </div>
        <div class="pm-numerology" id="pm-num-${f.conditionId}">${numerologyBlockHtml(f)}</div>
        <div class="pm-trade-feed" id="pm-feed-${f.conditionId}">
          ${feedToggleHtml(f.conditionId, 0, false)}
        </div>
        <div class="pm-fight-actions">
          <button class="btn-link" data-dismiss="${f.conditionId}" type="button">✓ Mark as Over</button>
          ${fullMatchupHtml(f)}
        </div>
      </div>
    `;
  }).join('');
}

// Feeds the user has expanded - the whale feed defaults collapsed so the
// card leads with the numerology verdict and the bet math; trade flow is
// supporting evidence one tap away. Survives the 20s re-render cycle.
const openFeeds = new Set();

function feedToggleHtml(conditionId, count, open) {
  return `<button class="pm-trade-feed-toggle" data-feed-toggle="${conditionId}" type="button">🐋 ${count ? `${count} whale bet${count === 1 ? '' : 's'}` : 'Big Money Activity'} <span class="pm-feed-caret">${open ? '▾' : '▸'}</span></button>`;
}

function renderTradeFeeds() {
  cardFights.forEach((f) => {
    const el = document.getElementById(`pm-feed-${f.conditionId}`);
    if (!el) return;

    const trades = tradesCache.get(f.conditionId) || [];
    const flagged = trades
      .map((t) => ({
        ...t,
        usd: t.size * t.price,
        smart: !!leaderboardMap.get((t.proxyWallet || '').toLowerCase())?.qualifiesSmart,
      }))
      .filter((t) => t.usd >= WHALE_THRESHOLD_USD || t.smart)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);

    const open = openFeeds.has(f.conditionId);

    if (!flagged.length) {
      el.innerHTML = feedToggleHtml(f.conditionId, 0, open)
        + (open ? '<div class="empty-state">No notable big-money activity yet on this fight.</div>' : '');
      return;
    }

    el.innerHTML = feedToggleHtml(f.conditionId, flagged.length, open) + (!open ? '' : flagged.map((t) => {
      const leader = leaderboardMap.get((t.proxyWallet || '').toLowerCase());
      const who = leader ? leader.userName : shortWallet(t.proxyWallet);
      const badges = `${t.usd >= WHALE_THRESHOLD_USD ? '<span class="pm-badge-whale">WHALE</span> ' : ''}${t.smart ? '<span class="pm-badge-smart" title="Top 50 all-time on Polymarket\'s Sports PNL leaderboard, and still profitable this month">SMART</span>' : ''}`;
      return `
        <div class="pm-trade-row">
          <span class="pm-trade-who">${escapeHtml(who)}</span>
          <span class="pm-trade-side">${t.side === 'BUY' ? 'Bought' : 'Sold'} ${escapeHtml(t.outcome || '')}</span>
          ${badges}
          <span class="pm-trade-usd">${formatUsd(t.usd)}</span>
          <span class="pm-trade-time">${timeAgo(t.timestamp)}</span>
        </div>
      `;
    }).join(''));
  });

  const stamp = document.getElementById('pmLastUpdated');
  if (stamp) stamp.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
}

function updateNumerologyBlocks() {
  saveLocationState();
  locationManuallyExpanded = false;
  updateLocationSummaryUI();
  cardFights.forEach((f) => {
    const el = document.getElementById(`pm-num-${f.conditionId}`);
    if (el) el.innerHTML = numerologyBlockHtml(f);
    const card = document.getElementById(`pm-card-${f.conditionId}`);
    if (card) card.dataset.tier = cardTierKey(f);
  });
}

/* ===================== Orchestration ===================== */

async function pollTrades() {
  if (!cardFights.length) return;
  const results = await Promise.all(cardFights.map((f) => fetchTrades(f.conditionId)));
  cardFights.forEach((f, i) => tradesCache.set(f.conditionId, results[i]));
  renderTradeFeeds();
}

async function loadEventsAndRender() {
  const events = await fetchUfcEvents();
  const rawFights = [];
  events.forEach((ev) => {
    (ev.markets || []).forEach((m) => {
      if (m.sportsMarketType !== 'moneyline') return;
      if (m.closed || m.active === false) return;
      const parsed = parseMarket(m, ev);
      if (!parsed.fighterAName || !parsed.fighterBName || !parsed.gameStartTime) return;
      rawFights.push(parsed);
    });
  });

  // Forget dismissals for fights Polymarket no longer lists here at all
  // (already resolved-and-gone upstream, or aged out) so the stored set
  // doesn't grow forever.
  const stillPresent = new Set(rawFights.map((f) => f.conditionId));
  dismissedFights = new Set([...dismissedFights].filter((id) => stillPresent.has(id)));
  saveDismissedFights(dismissedFights);

  const visibleFights = rawFights.filter((f) => !dismissedFights.has(f.conditionId));

  visibleFights.sort((a, b) => a.gameStartTime - b.gameStartTime);
  const cutoff = Date.now() - LOOKBACK_MS;
  const upcoming = visibleFights.filter((f) => f.gameStartTime.getTime() > cutoff);

  if (!upcoming.length) {
    cardFights = [];
    document.getElementById('fightsContainer').innerHTML = '<div class="empty-state">No upcoming UFC fights found on Polymarket right now.</div>';
    resetLocationSelection();
    return;
  }

  const anchorTime = upcoming[0].gameStartTime.getTime();
  cardFights = upcoming.filter((f) => Math.abs(f.gameStartTime.getTime() - anchorTime) <= CARD_WINDOW_MS);
  cardFights.forEach(enrichWithNumerology);

  renderFightCards();
  pollTrades();
}

function initRefreshButton() {
  const btn = document.getElementById('pmRefreshBtn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '🔄 Refreshing…';
    leaderboardMap = await fetchLeaderboard();
    await loadEventsAndRender();
    btn.textContent = originalText;
    btn.disabled = false;
  });
}

function startPolling() {
  setInterval(() => {
    if (document.visibilityState === 'visible') pollTrades();
  }, TRADES_POLL_MS);

  setInterval(() => {
    if (document.visibilityState === 'visible') loadEventsAndRender();
  }, EVENTS_POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollTrades();
  });
}

// Arriving from the UFC page (?from=ufc), the back link returns there
// instead of dropping the user at the Polymarket hub menu.
(function initBackLink() {
  if (new URLSearchParams(window.location.search).get('from') === 'ufc') {
    const back = document.getElementById('pmBackLink');
    back.href = 'ufc.html';
    back.innerHTML = '&larr; UFC';
  }
})();

// Arriving back from ufc.js after adding a fighter via the deep link above
// (?conditionId=) - scrolls straight back to the exact fight card instead of
// leaving the user at the top of the list to re-find it themselves.
function scrollToConditionIdFromQuery() {
  const conditionId = new URLSearchParams(window.location.search).get('conditionId');
  if (!conditionId) return;
  const card = document.getElementById(`pm-card-${conditionId}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.style.boxShadow = '0 0 0 3px var(--purple), 0 0 16px rgba(167, 107, 214, 0.6)';
  setTimeout(() => { card.style.boxShadow = ''; }, 2500);
}

(async function init() {
  initLocationControls();
  initRefreshButton();
  initBreakdownModal();
  initDismissButtons();
  initFeedToggles();
  initStakeInput();
  leaderboardMap = await fetchLeaderboard();
  await loadEventsAndRender();
  scrollToConditionIdFromQuery();
  startPolling();
})();

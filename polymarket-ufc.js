const GAMMA_EVENTS_URL = 'https://gamma-api.polymarket.com/events/keyset?tag_slug=ufc&closed=false&limit=100';
const TRADES_URL = 'https://data-api.polymarket.com/trades';
const LEADERBOARD_URL = 'https://data-api.polymarket.com/v1/leaderboard?category=SPORTS&timePeriod=ALL&orderBy=PNL&limit=50';

const WHALE_THRESHOLD_USD = 500;
const TRADES_POLL_MS = 20000;
const EVENTS_POLL_MS = 5 * 60 * 1000;
const CARD_WINDOW_MS = 16 * 3600 * 1000; // fights within this window of the soonest one count as "the same card"
const LOOKBACK_MS = 6 * 3600 * 1000; // still show fights that started up to this long ago (likely still live)

let leaderboardMap = new Map();
let cardFights = [];
const tradesCache = new Map();

/* ===================== Fight location (region + stadium) ===================== */
// Polymarket gives no venue data, and the numerology score depends on it
// (Day/Stadium/Region, same formula as ufc.js) - so no score shows at all
// until the user sets a location here. Every fight on a UFC Fight Night
// shares one venue, so this is set once per card rather than per fight.
// The region is a US state (statehood date) or, for international cards, a
// country (founding date) - toggled between with the US/International switch.

let stadiums = loadStadiums();
let editingStadiumId = null;
let editingCountryId = null;
let regionMode = 'us'; // 'us' | 'intl'
let selectedRegion = null; // a US_STATES entry or an allCountries() entry - both carry .name/.founded
let selectedStadium = null;

function regionNoun() {
  return regionMode === 'intl' ? 'country' : 'state';
}

function stateIndexByName(name) {
  return US_STATES.findIndex((s) => s.name === name);
}

function populateRegionOptionsInto(selectEl, includeAdd) {
  if (regionMode === 'us') {
    selectEl.innerHTML = '<option value="">Select state...</option>'
      + US_STATES.map((s, idx) => `<option value="${idx}">${escapeHtml(s.name)}</option>`).join('');
  } else {
    selectEl.innerHTML = '<option value="">Select country...</option>'
      + allCountries().map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
      + (includeAdd ? '<option value="__addCountry__">+ Add New Country</option>' : '');
  }
}

function regionFromSelectValue(val) {
  if (val === '' || val == null) return null;
  if (regionMode === 'us') return US_STATES[Number(val)] || null;
  return allCountries().find((c) => c.id === val) || null;
}

// US stadiums carry a `state`, international ones a `country` - each mode
// only lists its own kind so a Vegas arena can't be picked for a London card.
function populateStadiumSelect(selectValue) {
  const sel = document.getElementById('pmStadiumSelect');
  const visible = stadiums.filter((s) => (regionMode === 'intl' ? !!s.country : !s.country));
  sel.innerHTML = '<option value="">Select stadium...</option>'
    + visible.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
    + '<option value="__add__">+ Add New Stadium</option>';
  sel.value = selectValue || '';
}

function updateEditCountryBtnVisibility() {
  const show = regionMode === 'intl' && selectedRegion && selectedRegion.id && !selectedRegion.seed;
  document.getElementById('pmEditCountryBtn').style.display = show ? '' : 'none';
}

function openCountryForm(country) {
  closeStadiumForm();
  document.getElementById('pmAddCountryForm').classList.add('active');
  if (country) {
    editingCountryId = country.id;
    document.getElementById('pmNewCountryName').value = country.name;
    document.getElementById('pmNewCountryFounded').value = isoToDisplay(country.founded);
    document.getElementById('pmCountryFormLabel').textContent = `Edit Country - ${country.name}`;
    document.getElementById('pmSaveCountryBtn').textContent = 'Update Country';
  } else {
    editingCountryId = null;
    document.getElementById('pmNewCountryName').value = '';
    document.getElementById('pmNewCountryFounded').value = '';
    document.getElementById('pmCountryFormLabel').textContent = 'Add New Country';
    document.getElementById('pmSaveCountryBtn').textContent = 'Save Country';
  }
}

function closeCountryForm() {
  editingCountryId = null;
  document.getElementById('pmAddCountryForm').classList.remove('active');
  document.getElementById('pmNewCountryName').value = '';
  document.getElementById('pmNewCountryFounded').value = '';
  document.getElementById('pmCountryFormLabel').textContent = 'Add New Country';
  document.getElementById('pmSaveCountryBtn').textContent = 'Save Country';
}

function updateEditStadiumBtnVisibility() {
  const val = document.getElementById('pmStadiumSelect').value;
  document.getElementById('pmEditStadiumBtn').style.display = (val && val !== '__add__') ? '' : 'none';
}

function openStadiumForm(stadium) {
  closeCountryForm();
  document.getElementById('pmAddStadiumForm').classList.add('active');
  const regionSel = document.getElementById('pmNewStadiumState');
  if (stadium) {
    editingStadiumId = stadium.id;
    document.getElementById('pmNewStadiumName').value = stadium.name;
    document.getElementById('pmNewStadiumFounded').value = isoToDisplay(stadium.founded);
    if (regionMode === 'us') {
      const idx = stadium.state ? stateIndexByName(stadium.state) : -1;
      regionSel.value = idx !== -1 ? String(idx) : '';
    } else {
      const c = stadium.country ? allCountries().find((x) => x.name === stadium.country) : null;
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
}

function initLocationControls() {
  attachDateMask(document.getElementById('pmNewStadiumFounded'));
  attachDateMask(document.getElementById('pmNewCountryFounded'));
  populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
  populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);
  populateStadiumSelect();
  updateEditStadiumBtnVisibility();

  document.querySelectorAll('#pmRegionToggle .hours-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.region === regionMode) return;
      regionMode = btn.dataset.region;
      document.querySelectorAll('#pmRegionToggle .hours-toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
      selectedRegion = null;
      selectedStadium = null;
      closeCountryForm();
      closeStadiumForm();
      document.getElementById('pmRegionLabel').textContent = regionMode === 'intl' ? 'Country' : 'State';
      populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
      populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);
      populateStadiumSelect();
      updateEditStadiumBtnVisibility();
      updateEditCountryBtnVisibility();
      updateNumerologyBlocks();
    });
  });

  document.getElementById('pmStateSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === '__addCountry__') {
      e.target.value = '';
      selectedRegion = null;
      openCountryForm(null);
      updateEditCountryBtnVisibility();
      updateNumerologyBlocks();
      return;
    }
    selectedRegion = regionFromSelectValue(val);
    updateEditCountryBtnVisibility();
    updateNumerologyBlocks();
  });

  document.getElementById('pmEditCountryBtn').addEventListener('click', () => {
    if (selectedRegion && selectedRegion.id && !selectedRegion.seed) openCountryForm(selectedRegion);
  });

  document.getElementById('pmCancelCountryBtn').addEventListener('click', closeCountryForm);

  document.getElementById('pmSaveCountryBtn').addEventListener('click', () => {
    const name = document.getElementById('pmNewCountryName').value.trim();
    const founded = displayToISO(document.getElementById('pmNewCountryFounded').value);
    if (!name) { alert('Please enter a country name.'); return; }
    if (!founded) { alert('Please enter a valid founding / independence date (MM/DD/YYYY).'); return; }

    const customs = loadCustomCountries();
    let selectId;
    if (editingCountryId) {
      const idx = customs.findIndex((c) => c.id === editingCountryId);
      if (idx !== -1) customs[idx] = { id: editingCountryId, name, founded };
      selectId = editingCountryId;
    } else {
      const country = { id: uid(), name, founded };
      customs.push(country);
      selectId = country.id;
    }
    saveCustomCountries(customs);
    populateRegionOptionsInto(document.getElementById('pmStateSelect'), true);
    populateRegionOptionsInto(document.getElementById('pmNewStadiumState'), false);
    document.getElementById('pmStateSelect').value = selectId;
    selectedRegion = regionFromSelectValue(selectId);
    updateEditCountryBtnVisibility();
    closeCountryForm();
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
      } else if (stadium && regionMode === 'intl' && stadium.country) {
        const c = allCountries().find((x) => x.name === stadium.country);
        if (c) {
          document.getElementById('pmStateSelect').value = c.id;
          selectedRegion = c;
        }
      }
    } else {
      selectedStadium = null;
    }
    updateEditCountryBtnVisibility();
    updateNumerologyBlocks();
  });

  document.getElementById('pmEditStadiumBtn').addEventListener('click', () => {
    const stadium = stadiums.find((s) => s.id === document.getElementById('pmStadiumSelect').value);
    if (stadium) openStadiumForm(stadium);
  });

  document.getElementById('pmCancelStadiumBtn').addEventListener('click', closeStadiumForm);

  document.getElementById('pmSaveStadiumBtn').addEventListener('click', () => {
    const name = document.getElementById('pmNewStadiumName').value.trim();
    const founded = displayToISO(document.getElementById('pmNewStadiumFounded').value);
    const regionVal = document.getElementById('pmNewStadiumState').value;
    if (!name) { alert('Please enter a stadium name.'); return; }
    if (!founded) { alert('Please enter a valid founding date for the stadium (MM/DD/YYYY).'); return; }
    if (regionVal === '') { alert(`Please select which ${regionNoun()} this stadium is in.`); return; }

    const regionFields = regionMode === 'us'
      ? { state: US_STATES[Number(regionVal)].name }
      : { country: (allCountries().find((c) => c.id === regionVal) || {}).name };

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
    updateEditCountryBtnVisibility();
    closeStadiumForm();
    updateNumerologyBlocks();
  });
}

// Same Day 60/Stadium 15/State 25 (or Day 75/State 25 without a stadium)
// blend as computeFighterScore() in ufc.js - returns the three factors plus
// the combined number so the breakdown popup can show all of them.
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

function scoresForFight(f) {
  if (!(f.matchedA && f.matchedB && selectedRegion)) return null;
  const matchDate = parseDateInput(f.matchDateISO);
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

function isoDateFromUTC(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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

async function fetchLeaderboard() {
  const map = new Map();
  try {
    const res = await fetch(LEADERBOARD_URL);
    if (!res.ok) return map;
    const data = await res.json();
    (data || []).forEach((r) => {
      if (r.proxyWallet) map.set(r.proxyWallet.toLowerCase(), { userName: r.userName, pnl: r.pnl });
    });
  } catch (e) { /* leaderboard is a nice-to-have, fail quiet */ }
  return map;
}

/* ===================== Numerology enrichment ===================== */

function enrichWithNumerology(f) {
  const roster = buildAllFighters();
  f.matchedA = matchFighter(f.fighterAName, roster);
  f.matchedB = matchFighter(f.fighterBName, roster);
  f.matchDateISO = isoDateFromUTC(f.gameStartTime);
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
    return `<div class="pm-unmatched">${unmatched
      .map((n) => `${escapeHtml(n)} isn't in your fighter database yet &mdash; <a href="ufc.html?addFighter=${encodeURIComponent(n)}">add them</a> for a numerology read.`)
      .join('<br>')}</div>`;
  }

  if (!selectedRegion) {
    return '<div class="pm-unmatched">Set the fight location above to see the numerology edge for this card.</div>';
  }

  const { scoreA, scoreB } = scoresForFight(f);
  const favA = f.priceA != null && f.priceB != null && f.priceA >= f.priceB;
  const marketFavName = favA ? f.fighterAName : f.fighterBName;
  const numFavMatched = scoreA.combined >= scoreB.combined ? f.matchedA : f.matchedB;
  const agree = normalizeName(marketFavName) === normalizeName(numFavMatched.name);

  recordPredictionIfNew(f, scoreA, scoreB, marketFavName, numFavMatched.name, agree ? 'favorite' : 'underdog');

  return `
    <div class="pm-numerology-clickable" data-condition-id="${f.conditionId}">
      <div class="pm-edge-line">🔢 Numerology Edge: <span class="score-inline ${scoreClass(scoreA.combined)}">${escapeHtml(f.matchedA.name)} ${scoreA.combined}</span> vs <span class="score-inline ${scoreClass(scoreB.combined)}">${escapeHtml(f.matchedB.name)} ${scoreB.combined}</span></div>
      <div class="pm-signal ${agree ? 'agree' : 'disagree'}">${agree
        ? `✅ Numerology agrees with the market favorite (${escapeHtml(marketFavName)})`
        : `⚡ Numerology favors ${escapeHtml(numFavMatched.name)} while the market favors ${escapeHtml(marketFavName)} &mdash; possible value on ${escapeHtml(numFavMatched.name)}`}</div>
      <div class="pm-breakdown-hint">Tap for the full Day / State / Stadium breakdown &rarr;</div>
    </div>
  `;
}

// One fighter's column in the breakdown popup - drops the Stadium row
// entirely (not zeroed) when no stadium is set, same as ufc.js.
function breakdownColumnHtml(name, score) {
  const regionLabel = regionMode === 'intl' ? '🌍 Country' : '🗺️ State';
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

function breakdownModalHtml(f, scores) {
  return `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(f.matchedA.name)} <span class="score-vs">&times;</span> ${escapeHtml(f.matchedB.name)}</div>
    </div>
    <div class="pm-breakdown-grid">
      ${breakdownColumnHtml(f.matchedA.name, scores.scoreA)}
      ${breakdownColumnHtml(f.matchedB.name, scores.scoreB)}
    </div>
  `;
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
}

function fullMatchupHtml(f) {
  if (!(f.matchedA && f.matchedB)) return '';
  const params = new URLSearchParams({
    a: f.matchedA.name,
    b: f.matchedB.name,
    date: isoToDisplay(f.matchDateISO),
  });
  return `<a class="btn" href="ufc.html?${params.toString()}">Full Matchup &rarr;</a>`;
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
      <div class="box pm-fight-card">
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
          <div class="pm-trade-feed-label">🐋 Big Money Activity</div>
          <div class="empty-state">Loading activity&hellip;</div>
        </div>
        <div class="pm-fight-actions">${fullMatchupHtml(f)}</div>
      </div>
    `;
  }).join('');
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
        smart: leaderboardMap.has((t.proxyWallet || '').toLowerCase()),
      }))
      .filter((t) => t.usd >= WHALE_THRESHOLD_USD || t.smart)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);

    if (!flagged.length) {
      el.innerHTML = '<div class="pm-trade-feed-label">🐋 Big Money Activity</div><div class="empty-state">No notable big-money activity yet on this fight.</div>';
      return;
    }

    el.innerHTML = '<div class="pm-trade-feed-label">🐋 Big Money Activity</div>' + flagged.map((t) => {
      const leader = leaderboardMap.get((t.proxyWallet || '').toLowerCase());
      const who = leader ? leader.userName : shortWallet(t.proxyWallet);
      const badges = `${t.usd >= WHALE_THRESHOLD_USD ? '<span class="pm-badge-whale">WHALE</span> ' : ''}${t.smart ? '<span class="pm-badge-smart">SMART</span>' : ''}`;
      return `
        <div class="pm-trade-row">
          <span class="pm-trade-who">${escapeHtml(who)}</span>
          <span class="pm-trade-side">${t.side === 'BUY' ? 'Bought' : 'Sold'} ${escapeHtml(t.outcome || '')}</span>
          ${badges}
          <span class="pm-trade-usd">${formatUsd(t.usd)}</span>
          <span class="pm-trade-time">${timeAgo(t.timestamp)}</span>
        </div>
      `;
    }).join('');
  });

  const stamp = document.getElementById('pmLastUpdated');
  if (stamp) stamp.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
}

function updateNumerologyBlocks() {
  cardFights.forEach((f) => {
    const el = document.getElementById(`pm-num-${f.conditionId}`);
    if (el) el.innerHTML = numerologyBlockHtml(f);
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

  rawFights.sort((a, b) => a.gameStartTime - b.gameStartTime);
  const cutoff = Date.now() - LOOKBACK_MS;
  const upcoming = rawFights.filter((f) => f.gameStartTime.getTime() > cutoff);

  if (!upcoming.length) {
    cardFights = [];
    document.getElementById('fightsContainer').innerHTML = '<div class="empty-state">No upcoming UFC fights found on Polymarket right now.</div>';
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

(async function init() {
  initLocationControls();
  initRefreshButton();
  initBreakdownModal();
  leaderboardMap = await fetchLeaderboard();
  await loadEventsAndRender();
  startPolling();
})();

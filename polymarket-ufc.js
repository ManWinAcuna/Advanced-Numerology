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

/* ===================== Fight location (state + stadium) ===================== */
// Polymarket gives no venue data, and the numerology score depends on it
// (Day/Stadium/State, same formula as ufc.js) - so no score shows at all
// until the user sets a location here. Every fight on a UFC Fight Night
// shares one venue, so this is set once per card rather than per fight.

let stadiums = loadStadiums();
let editingStadiumId = null;
let selectedState = null;
let selectedStadium = null;

function stateIndexByName(name) {
  return US_STATES.findIndex((s) => s.name === name);
}

function populateStateSelectInto(selectEl) {
  selectEl.innerHTML = '<option value="">Select state...</option>'
    + US_STATES.map((s, idx) => `<option value="${idx}">${escapeHtml(s.name)}</option>`).join('');
}

function populateStadiumSelect(selectValue) {
  const sel = document.getElementById('pmStadiumSelect');
  sel.innerHTML = '<option value="">Select stadium...</option>'
    + stadiums.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
    + '<option value="__add__">+ Add New Stadium</option>';
  sel.value = selectValue || '';
}

function updateEditStadiumBtnVisibility() {
  const val = document.getElementById('pmStadiumSelect').value;
  document.getElementById('pmEditStadiumBtn').style.display = (val && val !== '__add__') ? '' : 'none';
}

function openStadiumForm(stadium) {
  document.getElementById('pmAddStadiumForm').classList.add('active');
  const stateSel = document.getElementById('pmNewStadiumState');
  if (stadium) {
    editingStadiumId = stadium.id;
    document.getElementById('pmNewStadiumName').value = stadium.name;
    document.getElementById('pmNewStadiumFounded').value = isoToDisplay(stadium.founded);
    const idx = stadium.state ? stateIndexByName(stadium.state) : -1;
    stateSel.value = idx !== -1 ? String(idx) : '';
    document.getElementById('pmStadiumFormLabel').textContent = `Edit Stadium - ${stadium.name}`;
    document.getElementById('pmSaveStadiumBtn').textContent = 'Update Stadium';
  } else {
    editingStadiumId = null;
    document.getElementById('pmNewStadiumName').value = '';
    document.getElementById('pmNewStadiumFounded').value = '';
    stateSel.value = '';
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
  populateStateSelectInto(document.getElementById('pmStateSelect'));
  populateStateSelectInto(document.getElementById('pmNewStadiumState'));
  populateStadiumSelect();
  updateEditStadiumBtnVisibility();

  document.getElementById('pmStateSelect').addEventListener('change', (e) => {
    const idx = e.target.value;
    selectedState = idx !== '' ? US_STATES[Number(idx)] : null;
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
      if (stadium && stadium.state) {
        const stIdx = stateIndexByName(stadium.state);
        if (stIdx !== -1) {
          document.getElementById('pmStateSelect').value = String(stIdx);
          selectedState = US_STATES[stIdx];
        }
      }
    } else {
      selectedStadium = null;
    }
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
    const stateIdx = document.getElementById('pmNewStadiumState').value;
    if (!name) { alert('Please enter a stadium name.'); return; }
    if (!founded) { alert('Please enter a valid founding date for the stadium (MM/DD/YYYY).'); return; }
    if (stateIdx === '') { alert('Please select which state this stadium is in.'); return; }
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
    document.getElementById('pmStateSelect').value = stateIdx;
    selectedState = US_STATES[Number(stateIdx)];
    selectedStadium = stadiums.find((s) => s.id === selectValue) || null;
    updateEditStadiumBtnVisibility();
    closeStadiumForm();
    updateNumerologyBlocks();
  });
}

// Same Day 60/Stadium 15/State 25 (or Day 75/State 25 without a stadium)
// blend as computeFighterScore() in ufc.js.
function computeFighterScore(dobDate, matchDate, stadiumDate, stateDate) {
  const day = computeCompatibility(dobDate, matchDate, sportsNumerologyCompat);
  const state = computeCompatibility(dobDate, stateDate, sportsNumerologyCompat);
  if (!stadiumDate) {
    return Math.round(0.75 * day.finalScore + 0.25 * state.finalScore);
  }
  const stadium = computeCompatibility(dobDate, stadiumDate, sportsNumerologyCompat);
  return Math.round(0.60 * day.finalScore + 0.15 * stadium.finalScore + 0.25 * state.finalScore);
}

function scoresForFight(f) {
  if (!(f.matchedA && f.matchedB && selectedState)) return null;
  const matchDate = parseDateInput(f.matchDateISO);
  const stateDate = parseDateInput(selectedState.founded);
  const stadiumDate = selectedStadium ? parseDateInput(selectedStadium.founded) : null;
  return {
    scoreA: computeFighterScore(parseDateInput(f.matchedA.dob), matchDate, stadiumDate, stateDate),
    scoreB: computeFighterScore(parseDateInput(f.matchedB.dob), matchDate, stadiumDate, stateDate),
  };
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

// Polymarket fighter names sometimes carry suffixes or middle names our
// roster doesn't ("Levi Rodrigues" vs "Levi Rodrigues Jr.", "Jose Delgado"
// vs "Jose Miguel Delgado") - normalize and fall back to a first+last token
// match rather than requiring an exact string match.
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  if (!selectedState) {
    return '<div class="pm-unmatched">Set the fight location above to see the numerology edge for this card.</div>';
  }

  const { scoreA, scoreB } = scoresForFight(f);
  const favA = f.priceA != null && f.priceB != null && f.priceA >= f.priceB;
  const marketFavName = favA ? f.fighterAName : f.fighterBName;
  const numFavMatched = scoreA >= scoreB ? f.matchedA : f.matchedB;
  const agree = normalizeName(marketFavName) === normalizeName(numFavMatched.name);

  return `
    <div class="pm-edge-line">🔢 Numerology Edge: <span class="score-inline ${scoreClass(scoreA)}">${escapeHtml(f.matchedA.name)} ${scoreA}</span> vs <span class="score-inline ${scoreClass(scoreB)}">${escapeHtml(f.matchedB.name)} ${scoreB}</span></div>
    <div class="pm-signal ${agree ? 'agree' : 'disagree'}">${agree
      ? `✅ Numerology agrees with the market favorite (${escapeHtml(marketFavName)})`
      : `⚡ Numerology favors ${escapeHtml(numFavMatched.name)} while the market favors ${escapeHtml(marketFavName)} &mdash; possible value on ${escapeHtml(numFavMatched.name)}`}</div>
  `;
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

(async function init() {
  initLocationControls();
  leaderboardMap = await fetchLeaderboard();
  await loadEventsAndRender();
  startPolling();
})();

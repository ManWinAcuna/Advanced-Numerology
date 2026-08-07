/* Settings page (2026-08-08) - the UI for overrides-engine.js. Every field
 * here reads/writes through getOverrideSection/setOverrideEntry/
 * clearOverrideEntry (overrides-engine.js), never touches a default
 * constant directly. Edits take effect immediately (every consumer reads
 * the override store fresh on each call, per compat-engine.js/
 * imprint-alignment.js/db-core.js's own Effective wrappers) - no reload
 * needed to see a change reflected elsewhere in the app.
 */

/* ============================================================ tabs === */
function wireSettingsTabs() {
  document.querySelectorAll('.settings-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach((b) => b.classList.toggle('active', b === btn));
      const tab = btn.dataset.tab;
      document.querySelectorAll('.settings-page').forEach((p) => p.classList.remove('active'));
      document.getElementById(`settingsPage${tab.charAt(0).toUpperCase()}${tab.slice(1)}`).classList.add('active');
    });
  });
}

function flashSaved(el) {
  const note = document.createElement('span');
  note.className = 'settings-save-note';
  note.textContent = '✓ saved';
  el.appendChild(note);
  requestAnimationFrame(() => note.classList.add('show'));
  setTimeout(() => note.remove(), 1200);
}

/* ================================================== Compat Tables === */
const SETTINGS_COMPAT_TABLES = {
  numerology: { label: 'Numerology', keys: NUMEROLOGY_KEYS, getFn: () => numerologyCompat },
  vietnamese: { label: 'Vietnamese Zodiac', keys: VIETNAMESE_KEYS, getFn: () => vietnameseCompat },
  western: { label: 'Western Zodiac', keys: WESTERN_KEYS, getFn: () => westernCompat },
};

function renderCompatPage() {
  const el = document.getElementById('settingsPageCompat');
  el.innerHTML = `
    <div class="settings-intro">Numerology/Vietnamese/Western are the three tables behind every compatibility score in the app - the Compatibility Calculator, Imprint Alignment, EMAX, Database, Calendar highlighting, and (through the sports variants) Sports Betting. Pick two values to see and edit that one cell.</div>
    <div class="settings-compat-picker">
      <select id="compatTableSelect">
        <option value="numerology">Numerology</option>
        <option value="vietnamese">Vietnamese Zodiac</option>
        <option value="western">Western Zodiac</option>
      </select>
      <select id="compatEntitySelect"></select>
      <select id="compatDaySelect"></select>
    </div>
    <div class="settings-compat-result" id="compatResultBox"></div>
    <div class="settings-sub-label">Active overrides in this table</div>
    <div class="settings-overrides-list" id="compatOverridesList"></div>
  `;

  const tableSel = document.getElementById('compatTableSelect');
  const entitySel = document.getElementById('compatEntitySelect');
  const daySel = document.getElementById('compatDaySelect');

  function populateKeySelects() {
    const t = SETTINGS_COMPAT_TABLES[tableSel.value];
    [entitySel, daySel].forEach((sel) => {
      sel.innerHTML = t.keys.map((k) => `<option value="${k}">${k}</option>`).join('');
    });
  }

  function renderResult() {
    const tKey = tableSel.value;
    const t = SETTINGS_COMPAT_TABLES[tKey];
    const a = ['numerology'].includes(tKey) ? Number(entitySel.value) : entitySel.value;
    const b = ['numerology'].includes(tKey) ? Number(daySel.value) : daySel.value;
    const defaultVal = t.getFn()(a, b);
    const overrideVal = getCompatOverrideValue(tKey, a, b);
    const current = overrideVal != null ? overrideVal : defaultVal;
    document.getElementById('compatResultBox').innerHTML = `
      <div class="settings-field-row" style="border-bottom:none">
        <div class="settings-field-label">
          ${entitySel.value} &times; ${daySel.value}
          <span class="hint">Default: ${defaultVal}${overrideVal != null ? ` &middot; currently overridden` : ''}</span>
        </div>
        <input type="number" min="0" max="100" class="settings-field-input${overrideVal != null ? ' overridden' : ''}" id="compatValueInput" value="${current}">
        <button type="button" class="settings-reset-btn" id="compatResetBtn" ${overrideVal == null ? 'disabled' : ''}>Reset</button>
      </div>
    `;
    const input = document.getElementById('compatValueInput');
    input.addEventListener('change', () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      setCompatOverride(tKey, a, b, Math.max(0, Math.min(100, n)));
      renderResult();
      renderOverridesList();
      flashSaved(document.getElementById('compatResultBox').querySelector('.settings-field-row'));
    });
    document.getElementById('compatResetBtn').addEventListener('click', () => {
      clearCompatOverride(tKey, a, b);
      renderResult();
      renderOverridesList();
    });
  }

  function renderOverridesList() {
    const tKey = tableSel.value;
    const overrides = getOverrideSection('compat')[tKey] || {};
    const keys = Object.keys(overrides);
    const listEl = document.getElementById('compatOverridesList');
    if (!keys.length) {
      listEl.innerHTML = '<div class="settings-empty">No overrides in this table.</div>';
      return;
    }
    listEl.innerHTML = keys.map((k) => {
      const [a, b] = k.split('-');
      return `
        <div class="settings-override-row">
          <span>${a} &times; ${b}: <b>${overrides[k]}</b></span>
          <button type="button" class="settings-reset-btn" data-clear="${k}">Reset</button>
        </div>
      `;
    }).join('');
    listEl.querySelectorAll('[data-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [a, b] = btn.dataset.clear.split('-');
        clearCompatOverride(tKey, a, b);
        renderResult();
        renderOverridesList();
      });
    });
  }

  tableSel.addEventListener('change', () => { populateKeySelects(); renderResult(); renderOverridesList(); });
  entitySel.addEventListener('change', renderResult);
  daySel.addEventListener('change', renderResult);

  populateKeySelects();
  renderResult();
  renderOverridesList();
}

/* ============================================================ Imprint Domains === */
const SETTINGS_ALL_IMPRINT_NUMBERS = [1, 3, 4, 5, 6, 7, 8, 9, 11, 22, 28, 33];

function renderDomainsPage() {
  const el = document.getElementById('settingsPageDomains');
  el.innerHTML = `<div class="settings-intro">Which numbers count toward each life-area domain. Numbers can belong to more than one domain. Relationship's secondary numbers only reinforce an already-hit primary match - they never trigger the domain alone.</div><div id="domainCards"></div>`;
  const cardsEl = document.getElementById('domainCards');

  function currentDomain(key) {
    const overrides = getOverrideSection('imprintDomains');
    return overrides[key] || IMPRINT_DOMAINS[key];
  }

  function isOverridden(key) {
    return !!getOverrideSection('imprintDomains')[key];
  }

  function renderCard(key) {
    const domain = IMPRINT_DOMAINS[key];
    const current = currentDomain(key);
    const chips = SETTINGS_ALL_IMPRINT_NUMBERS.map((n) => `
      <button type="button" class="settings-num-toggle${current.numbers.includes(n) ? ' on' : ''}" data-key="${key}" data-field="numbers" data-n="${n}">${n}</button>
    `).join('');
    const secondaryChips = domain.secondaryNumbers ? SETTINGS_ALL_IMPRINT_NUMBERS.map((n) => `
      <button type="button" class="settings-num-toggle${(current.secondaryNumbers || domain.secondaryNumbers).includes(n) ? ' on' : ''}" data-key="${key}" data-field="secondaryNumbers" data-n="${n}">${n}</button>
    `).join('') : '';
    return `
      <div class="settings-domain-card" data-domain-card="${key}">
        <div class="settings-domain-head">
          <div class="settings-domain-name">${domain.emoji} ${domain.label}</div>
          <button type="button" class="settings-reset-btn" data-domain-reset="${key}" ${isOverridden(key) ? '' : 'disabled'}>Reset</button>
        </div>
        <div class="settings-chip-row">${chips}</div>
        ${domain.secondaryNumbers ? `<div class="settings-sub-label">Secondary (reinforce only)</div><div class="settings-chip-row">${secondaryChips}</div>` : ''}
      </div>
    `;
  }

  function renderAll() {
    cardsEl.innerHTML = Object.keys(IMPRINT_DOMAINS).map(renderCard).join('');
    cardsEl.querySelectorAll('.settings-num-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const field = btn.dataset.field;
        const n = Number(btn.dataset.n);
        const overrides = getOverrideSection('imprintDomains');
        const base = overrides[key] || Object.assign({}, IMPRINT_DOMAINS[key]);
        const working = Object.assign({}, base, {
          numbers: (base.numbers || IMPRINT_DOMAINS[key].numbers).slice(),
          secondaryNumbers: base.secondaryNumbers ? base.secondaryNumbers.slice() : (IMPRINT_DOMAINS[key].secondaryNumbers ? IMPRINT_DOMAINS[key].secondaryNumbers.slice() : undefined),
        });
        const list = working[field];
        const idx = list.indexOf(n);
        if (idx === -1) list.push(n); else list.splice(idx, 1);
        overrides[key] = working;
        setOverrideSection('imprintDomains', overrides);
        renderAll();
      });
    });
    cardsEl.querySelectorAll('[data-domain-reset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        clearOverrideEntry('imprintDomains', btn.dataset.domainReset);
        renderAll();
      });
    });
  }

  renderAll();
}

/* ============================================================ Imprint Weights === */
const SETTINGS_IMPRINT_WEIGHT_LABELS = {
  themeExact: 'Theme exact match (event-date mode)',
  themeCompat: 'Theme compatible match (event-date mode)',
  ownFirstImprintDay: "Your First N-LP Day match (event-date mode)",
  rareCoincidence: 'Rare Coincidence bonus (event-date mode)',
  pairExact: 'Exact match (person-vs-person)',
  pairCompat: 'Compatible match (person-vs-person)',
  secondaryExact: 'Relationship secondary exact (3/9 reinforcing 6)',
  secondaryCompat: 'Relationship secondary compatible',
  luckyExact: 'Lucky-day boost, exact',
  luckyCompat: 'Lucky-day boost, compatible',
};

function renderWeightsPage() {
  const el = document.getElementById('settingsPageWeights');
  el.innerHTML = `<div class="settings-intro">The point values Imprint Alignment adds per match. Baseline is always 50, capped at 100.</div><div id="weightRows"></div>`;
  const rowsEl = document.getElementById('weightRows');

  function renderAll() {
    const overrides = getOverrideSection('imprintWeights');
    rowsEl.innerHTML = Object.keys(IMPRINT_WEIGHT_DEFAULTS).map((name) => {
      const isOverridden = Object.prototype.hasOwnProperty.call(overrides, name);
      const current = getImprintWeight(name);
      return `
        <div class="settings-field-row" data-weight-row="${name}">
          <div class="settings-field-label">${SETTINGS_IMPRINT_WEIGHT_LABELS[name]}<span class="hint">Default: ${IMPRINT_WEIGHT_DEFAULTS[name]}</span></div>
          <input type="number" class="settings-field-input${isOverridden ? ' overridden' : ''}" data-weight-input="${name}" value="${current}">
          <button type="button" class="settings-reset-btn" data-weight-reset="${name}" ${isOverridden ? '' : 'disabled'}>Reset</button>
        </div>
      `;
    }).join('');
    rowsEl.querySelectorAll('[data-weight-input]').forEach((input) => {
      input.addEventListener('change', () => {
        const n = Number(input.value);
        if (!Number.isFinite(n)) return;
        setOverrideEntry('imprintWeights', input.dataset.weightInput, n);
        renderAll();
        flashSaved(rowsEl.querySelector(`[data-weight-row="${input.dataset.weightInput}"]`));
      });
    });
    rowsEl.querySelectorAll('[data-weight-reset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        clearOverrideEntry('imprintWeights', btn.dataset.weightReset);
        renderAll();
      });
    });
  }

  renderAll();
}

/* ============================================================ Betting Weights === */
function bettingSection(sport) {
  const o = getOverrideSection('betting')[sport] || {};
  return o;
}

function saveBettingField(sport, group, field, value) {
  const betting = getOverrideSection('betting');
  if (!betting[sport]) betting[sport] = {};
  if (!betting[sport][group]) {
    // Seed the FULL default object so a single edited field doesn't leave
    // the rest of the weight set missing (each group is a full-replacement
    // object per getEffectiveMlbRoleWeights() etc., not a per-field merge).
    betting[sport][group] = Object.assign({}, BETTING_GROUP_DEFAULTS[sport][group]);
  }
  betting[sport][group][field] = value;
  // Auto-reset the in-sample "since" date on any weight edit (user-
  // confirmed) - old picks under the old weights shouldn't count toward
  // validating the new ones.
  if (sport === 'mlb' && (group === 'roleWeights' || group === 'compatWeights')) {
    betting.mlb.sinceDate = new Date().toISOString().slice(0, 10);
  }
  setOverrideSection('betting', betting);
}

function resetBettingGroup(sport, group) {
  const betting = getOverrideSection('betting');
  if (betting[sport]) {
    delete betting[sport][group];
    if (Object.keys(betting[sport]).length === 0) delete betting[sport];
  }
  setOverrideSection('betting', betting);
}

const BETTING_GROUP_DEFAULTS = {
  mlb: { roleWeights: MLB_ROLE_WEIGHTS, compatWeights: MLB_COMPAT_WEIGHTS },
  ufc: { compatWeights: UFC_COMPAT_WEIGHTS },
  tennis: {},
  nba: {},
};

function bettingFieldRow(sport, group, field, label, defaultVal, currentVal) {
  const isOverridden = currentVal !== defaultVal;
  return `
    <div class="settings-field-row" data-bfrow="${sport}-${group}-${field}">
      <div class="settings-field-label">${label}<span class="hint">Default: ${defaultVal}</span></div>
      <input type="number" step="0.01" class="settings-field-input${isOverridden ? ' overridden' : ''}" data-bf="${sport}|${group}|${field}" value="${currentVal}">
    </div>
  `;
}

function renderEdgeTierFields(sport, defaultTiers) {
  const overrides = getOverrideSection('betting')[sport] || {};
  const tiers = overrides.edgeTiers || defaultTiers;
  const minGapDefault = REAL_EDGE_MIN_GAP_BY_SPORT[sport];
  const currentMinGap = overrides.realEdgeMinGap != null ? overrides.realEdgeMinGap : minGapDefault;
  const slight = tiers.find((t) => t.key === 'slight');
  const clear = tiers.find((t) => t.key === 'clear');
  const strong = tiers.find((t) => t.key === 'strong');
  return `
    <div class="settings-sub-label">Edge tier boundaries (gap between the two scores)</div>
    ${bettingFieldRow(sport, 'tiers', 'realEdgeMinGap', 'Real edge starts at (below = tossup)', minGapDefault, currentMinGap)}
    ${bettingFieldRow(sport, 'tiers', 'clearMin', 'Clear Edge starts at', defaultTiers.find((t) => t.key === 'clear').min, clear.min)}
    ${bettingFieldRow(sport, 'tiers', 'strongMin', 'Strong Edge starts at', defaultTiers.find((t) => t.key === 'strong').min, strong.min)}
  `;
}

const REAL_EDGE_MIN_GAP_BY_SPORT = { mlb: 3, ufc: 5, tennis: 5, nba: 3 };
const EDGE_TIERS_BY_SPORT = {
  mlb: [
    { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 8, max: Infinity },
    { key: 'clear', label: 'Clear Edge', icon: '💪', min: 5, max: 8 },
    { key: 'slight', label: 'Slight Edge', icon: '📈', min: 3, max: 5 },
    { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: 3 },
  ],
  ufc: [
    { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 30, max: Infinity },
    { key: 'clear', label: 'Clear Edge', icon: '💪', min: 15, max: 30 },
    { key: 'slight', label: 'Slight Edge', icon: '📈', min: 5, max: 15 },
    { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: 5 },
  ],
  tennis: [
    { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 30, max: Infinity },
    { key: 'clear', label: 'Clear Edge', icon: '💪', min: 15, max: 30 },
    { key: 'slight', label: 'Slight Edge', icon: '📈', min: 5, max: 15 },
    { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: 5 },
  ],
  nba: [
    { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 8, max: Infinity },
    { key: 'clear', label: 'Clear Edge', icon: '💪', min: 5, max: 8 },
    { key: 'slight', label: 'Slight Edge', icon: '📈', min: 3, max: 5 },
    { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: 3 },
  ],
};

function saveEdgeTierField(sport, field, value) {
  const betting = getOverrideSection('betting');
  if (!betting[sport]) betting[sport] = {};
  const defaults = EDGE_TIERS_BY_SPORT[sport];
  const existing = betting[sport].edgeTiers || defaults;
  const cur = {
    realEdgeMinGap: betting[sport].realEdgeMinGap != null ? betting[sport].realEdgeMinGap : REAL_EDGE_MIN_GAP_BY_SPORT[sport],
    clearMin: existing.find((t) => t.key === 'clear').min,
    strongMin: existing.find((t) => t.key === 'strong').min,
  };
  cur[field] = value;
  betting[sport].realEdgeMinGap = cur.realEdgeMinGap;
  betting[sport].edgeTiers = [
    { key: 'strong', label: 'Strong Edge', icon: '🔥', min: cur.strongMin, max: Infinity },
    { key: 'clear', label: 'Clear Edge', icon: '💪', min: cur.clearMin, max: cur.strongMin },
    { key: 'slight', label: 'Slight Edge', icon: '📈', min: cur.realEdgeMinGap, max: cur.clearMin },
    { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: cur.realEdgeMinGap },
  ];
  setOverrideSection('betting', betting);
}

function renderBettingPage() {
  const el = document.getElementById('settingsPageBetting');
  el.innerHTML = `
    <div class="settings-intro">Display-only for Imprint Alignment aside, these numbers drive the real edge score and stake sizing for live picks. Editing an MLB weight auto-resets the out-of-sample "since" date, so old picks under the old weights don't count toward validating the new ones.</div>
    <div class="settings-sport-block" id="bettingMlb"></div>
    <div class="settings-sport-block" id="bettingUfc"></div>
    <div class="settings-sport-block" id="bettingTennis"></div>
    <div class="settings-sport-block" id="bettingNba"></div>
  `;

  function renderMlb() {
    const rw = getEffectiveMlbRoleWeights();
    const cw = getEffectiveMlbCompatWeights();
    document.getElementById('bettingMlb').innerHTML = `
      <div class="settings-sport-title">⚾ MLB</div>
      <div class="settings-sub-label">Role weights</div>
      ${Object.keys(MLB_ROLE_WEIGHTS).map((k) => bettingFieldRow('mlb', 'roleWeights', k, k, MLB_ROLE_WEIGHTS[k], rw[k])).join('')}
      <div class="settings-sub-label">Compat blend</div>
      ${Object.keys(MLB_COMPAT_WEIGHTS).map((k) => bettingFieldRow('mlb', 'compatWeights', k, k, MLB_COMPAT_WEIGHTS[k], cw[k])).join('')}
      ${renderEdgeTierFields('mlb', EDGE_TIERS_BY_SPORT.mlb)}
      <button type="button" class="settings-reset-btn" data-sport-reset="mlb" style="margin-top:8px">Reset all MLB overrides</button>
    `;
    wireSportInputs('mlb', renderMlb);
  }

  function renderUfc() {
    const cw = getEffectiveUfcCompatWeights();
    document.getElementById('bettingUfc').innerHTML = `
      <div class="settings-sport-title">🥊 UFC</div>
      <div class="settings-sub-label">Compat blend</div>
      ${Object.keys(UFC_COMPAT_WEIGHTS).map((k) => bettingFieldRow('ufc', 'compatWeights', k, k, UFC_COMPAT_WEIGHTS[k], cw[k])).join('')}
      ${renderEdgeTierFields('ufc', EDGE_TIERS_BY_SPORT.ufc)}
      <button type="button" class="settings-reset-btn" data-sport-reset="ufc" style="margin-top:8px">Reset all UFC overrides</button>
    `;
    wireSportInputs('ufc', renderUfc);
  }

  function renderTennis() {
    document.getElementById('bettingTennis').innerHTML = `
      <div class="settings-sport-title">🎾 Tennis</div>
      ${renderEdgeTierFields('tennis', EDGE_TIERS_BY_SPORT.tennis)}
      <button type="button" class="settings-reset-btn" data-sport-reset="tennis" style="margin-top:8px">Reset all Tennis overrides</button>
    `;
    wireSportInputs('tennis', renderTennis);
  }

  function renderNba() {
    const fw = getEffectiveNbaFranchiseWeight();
    document.getElementById('bettingNba').innerHTML = `
      <div class="settings-sport-title">🏀 NBA</div>
      ${bettingFieldRow('nba', 'franchise', 'franchiseWeight', 'Franchise weight', NBA_FRANCHISE_WEIGHT, fw)}
      ${renderEdgeTierFields('nba', EDGE_TIERS_BY_SPORT.nba)}
      <button type="button" class="settings-reset-btn" data-sport-reset="nba" style="margin-top:8px">Reset all NBA overrides</button>
    `;
    wireSportInputs('nba', renderNba);
  }

  function wireSportInputs(sport, rerender) {
    const scopeId = { mlb: 'bettingMlb', ufc: 'bettingUfc', tennis: 'bettingTennis', nba: 'bettingNba' }[sport];
    const scope = document.getElementById(scopeId);
    scope.querySelectorAll('[data-bf]').forEach((input) => {
      input.addEventListener('change', () => {
        const [sp, group, field] = input.dataset.bf.split('|');
        const n = Number(input.value);
        if (!Number.isFinite(n)) return;
        if (group === 'tiers') {
          saveEdgeTierField(sp, field, n);
        } else if (group === 'franchise') {
          const betting = getOverrideSection('betting');
          if (!betting.nba) betting.nba = {};
          betting.nba.franchiseWeight = n;
          setOverrideSection('betting', betting);
        } else {
          saveBettingField(sp, group, field, n);
        }
        rerender();
        flashSaved(scope.querySelector(`[data-bfrow="${input.dataset.bf.replace(/\|/g, '-')}"]`) || scope);
      });
    });
    const resetBtn = scope.querySelector('[data-sport-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const betting = getOverrideSection('betting');
        delete betting[sport];
        setOverrideSection('betting', betting);
        rerender();
      });
    }
  }

  renderMlb();
  renderUfc();
  renderTennis();
  renderNba();
}

/* ============================================================ init === */
document.addEventListener('DOMContentLoaded', () => {
  wireSettingsTabs();
  renderCompatPage();
  renderDomainsPage();
  renderWeightsPage();
  renderBettingPage();
});

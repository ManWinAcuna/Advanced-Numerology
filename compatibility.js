let mode = null; // 'today' | 'date'

const modeSelectEl = document.getElementById('modeSelect');
const compatFormEl = document.getElementById('compatForm');
const personInputsEl = document.getElementById('personInputs');
const compatResultsEl = document.getElementById('compatResults');
const compatModalOverlayEl = document.getElementById('compatModalOverlay');

function closeCompatModal() {
  compatModalOverlayEl.classList.remove('active');
}
document.getElementById('compatModalClose').addEventListener('click', closeCompatModal);
compatModalOverlayEl.addEventListener('click', (e) => {
  if (e.target === compatModalOverlayEl) closeCompatModal();
});

// Source-scoped search (2026-08-06) - replaces the old single giant
// <select> of every Database entry flattened together, which had gotten
// unusable now that EMAX alone can hold thousands of entries across dozens
// of categories. Pick a source first (Database or EMAX), then type to
// search just that source - same player-search/player-suggestions UI
// pattern Famous Lookup already uses (famous.js), reused here instead of
// inventing a second search widget. Year-only entries (no full date) are
// excluded, same precedent as EMAX's own Reverse Lookup/filters - a bare
// year can't drive a real compatibility calculation.
function getSourceEntries(source) {
  if (source !== 'database' && source !== 'emax') return [];
  const loaded = source === 'database' ? loadDB() : loadEmaxDB();
  const entries = [];
  loaded.categories.forEach((cat) => {
    cat.entries.forEach((e) => {
      if (e.date) entries.push({ name: e.name, date: e.date, category: cat.name });
    });
  });
  return entries;
}

// Current search results per person key ("A"/"B") - held here so the
// suggestions list's click handler can look up which entry a given row
// actually refers to without re-running the search.
const sourceMatches = {};

// personToggle (2026-08-07): only the Imprint Alignment mode's Candidate
// Date field needs this - Database picks already imply a person, EMAX
// picks already imply an event, but a hand-typed date is ambiguous (a
// friend's birthday vs a release date look identical as MM/DD/YYYY). Only
// shown while the source-picker is on "Type manually" - swapping to
// Database/EMAX makes it moot, so it hides itself.
function personInputHTML(label, key, personToggle) {
  const toggle = personToggle
    ? `<label class="imprint-person-toggle" data-person="${key}"><input type="checkbox" class="imprint-person-checkbox" data-person="${key}"> This is a person, not an event</label>`
    : '';
  return `
    <div class="person-input box" data-person="${key}">
      <div class="box-label">${label}</div>
      <select class="db-picker source-picker" data-person="${key}">
        <option value="manual">✍️ Type manually</option>
        <option value="database">🗂 Search Database</option>
        <option value="emax">⚡ Search EMAX</option>
      </select>
      <div class="player-search-wrap source-search-wrap" data-person="${key}" hidden>
        <input type="text" class="player-search source-search" data-person="${key}" placeholder="Search by name..." autocomplete="off">
        <div class="player-suggestions source-suggestions" data-person="${key}"></div>
      </div>
      <div class="inline-form">
        <input type="text" class="person-name" data-person="${key}" placeholder="Name (optional)">
        <input type="text" class="person-date" data-person="${key}" inputmode="numeric" placeholder="MM/DD/YYYY" maxlength="10" autocomplete="off">
      </div>
      ${toggle}
    </div>
  `;
}

function renderSourceSuggestions(key, matches) {
  const container = document.querySelector(`.source-suggestions[data-person="${key}"]`);
  container.innerHTML = matches.length
    ? matches.slice(0, 30).map((m, idx) => `
      <div class="suggestion-item" data-index="${idx}">
        <span class="suggestion-name">${escapeHtml(m.name)}</span>
        <span class="suggestion-meta">${escapeHtml(m.category)}</span>
      </div>
    `).join('')
    : '<div class="suggestion-empty">No matches found</div>';
  container.classList.add('open');
}

function handleSourceSearchInput(key, source, value) {
  const container = document.querySelector(`.source-suggestions[data-person="${key}"]`);
  const q = value.trim().toLowerCase();
  if (!q) {
    sourceMatches[key] = [];
    container.innerHTML = '';
    container.classList.remove('open');
    return;
  }
  const matches = getSourceEntries(source).filter((e) => e.name.toLowerCase().includes(q));
  sourceMatches[key] = matches;
  renderSourceSuggestions(key, matches);
}

function selectSourceEntry(key, entry) {
  document.querySelector(`.person-date[data-person="${key}"]`).value = isoToDisplay(entry.date);
  document.querySelector(`.person-name[data-person="${key}"]`).value = entry.name;
  document.querySelector(`.source-search[data-person="${key}"]`).value = entry.name;
  const container = document.querySelector(`.source-suggestions[data-person="${key}"]`);
  container.innerHTML = '';
  container.classList.remove('open');
}

function wirePersonInputs() {
  document.querySelectorAll('.person-date').forEach((input) => attachDateMask(input));

  document.querySelectorAll('.source-picker').forEach((sel) => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.person;
      const wrap = document.querySelector(`.source-search-wrap[data-person="${key}"]`);
      const searchInput = document.querySelector(`.source-search[data-person="${key}"]`);
      wrap.hidden = sel.value === 'manual';
      if (!wrap.hidden) { searchInput.value = ''; searchInput.focus(); }
      document.querySelector(`.source-suggestions[data-person="${key}"]`).classList.remove('open');
      // Only meaningful for a hand-typed date - Database already implies a
      // person, EMAX already implies an event.
      const personToggle = document.querySelector(`.imprint-person-toggle[data-person="${key}"]`);
      if (personToggle) personToggle.hidden = sel.value !== 'manual';
    });
  });

  document.querySelectorAll('.source-search').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.person;
      const source = document.querySelector(`.source-picker[data-person="${key}"]`).value;
      handleSourceSearchInput(key, source, input.value);
    });
  });

  document.querySelectorAll('.source-suggestions').forEach((container) => {
    container.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      const key = container.dataset.person;
      const match = (sourceMatches[key] || [])[Number(item.dataset.index)];
      if (match) selectSourceEntry(key, match);
    });
  });
}

document.addEventListener('click', (e) => {
  document.querySelectorAll('.source-suggestions.open').forEach((container) => {
    const key = container.dataset.person;
    const searchInput = document.querySelector(`.source-search[data-person="${key}"]`);
    if (e.target !== searchInput && !container.contains(e.target)) container.classList.remove('open');
  });
});

document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', () => {
    mode = card.dataset.mode;
    modeSelectEl.style.display = 'none';
    compatFormEl.classList.add('active');
    closeCompatModal();
    compatResultsEl.innerHTML = '';

    if (mode === 'today') {
      personInputsEl.innerHTML = personInputHTML('Birthday', 'A');
    } else if (mode === 'imprint') {
      personInputsEl.innerHTML = personInputHTML('Person (whose imprints)', 'A') + personInputHTML('Candidate Date', 'B', true);
    } else {
      personInputsEl.innerHTML = personInputHTML('Person A', 'A') + personInputHTML('Person B', 'B');
    }
    wirePersonInputs();
  });
});

document.getElementById('backToModes').addEventListener('click', (e) => {
  e.preventDefault();
  modeSelectEl.style.display = 'grid';
  compatFormEl.classList.remove('active');
  closeCompatModal();
});

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

document.getElementById('calculateBtn').addEventListener('click', () => {
  const dateAInput = document.querySelector('.person-date[data-person="A"]');
  const dateAISO = displayToISO(dateAInput.value);
  if (!dateAISO) {
    alert(`Please enter a valid date (MM/DD/YYYY) for ${mode === 'today' ? 'the birthday' : (mode === 'imprint' ? 'the person' : 'Person A')}.`);
    return;
  }
  const dateA = parseDateInput(dateAISO);
  const nameA = document.querySelector('.person-name[data-person="A"]').value.trim()
    || (mode === 'today' ? 'This birthday' : 'Person A');

  let dateB;
  let nameB;
  if (mode === 'today') {
    const now = new Date();
    dateB = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    nameB = 'Today';
  } else {
    const dateBInput = document.querySelector('.person-date[data-person="B"]');
    const dateBISO = displayToISO(dateBInput.value);
    if (!dateBISO) {
      alert(`Please enter a valid date (MM/DD/YYYY) for ${mode === 'imprint' ? 'the candidate date' : 'Person B'}.`);
      return;
    }
    dateB = parseDateInput(dateBISO);
    nameB = document.querySelector('.person-name[data-person="B"]').value.trim() || (mode === 'imprint' ? 'Candidate Date' : 'Person B');
  }

  // Imprint Alignment (2026-08-06): one-sided read (A's history vs B as
  // the candidate), not a two-equal-sides compat score - its own render
  // function, not renderCompatHero. Fixed 2026-08-07: a Candidate Date
  // picked from Database is a real PERSON (their own imprint history
  // matters, not just whether their birthday lands on a themed day), so
  // that case switches to the person-vs-person cross-comparison. A
  // hand-typed date defaults to the date-based read too (safe default,
  // unknown by default) UNLESS the "This is a person" checkbox is
  // checked - added since a friend's birthday and a release date are
  // indistinguishable as plain MM/DD/YYYY.
  if (mode === 'imprint') {
    const sourceB = document.querySelector('.source-picker[data-person="B"]').value;
    const manualPersonCheckbox = document.querySelector('.imprint-person-checkbox[data-person="B"]');
    const isPerson = sourceB === 'database' || (sourceB === 'manual' && manualPersonCheckbox && manualPersonCheckbox.checked);
    compatResultsEl.classList.add('active');
    setModalWidth(compatResultsEl, false);
    if (isPerson) {
      const result = computeImprintPersonAlignment(dateA, dateB);
      compatResultsEl.innerHTML = imprintPersonAlignmentResultHtml(result, nameA, nameB);
    } else {
      const result = computeImprintAlignment(dateA, dateB);
      compatResultsEl.innerHTML = imprintAlignmentResultHtml(result, nameA, nameB);
    }
    wireImprintRevealButtons(compatResultsEl);
    compatModalOverlayEl.classList.add('active');
    return;
  }

  // Deep Compatibility (2026-08-07): the headline number on these 2 modes
  // is now the blended fusion of today's/this-pairing's compat with first-
  // imprint alignment (deep-compat.js), not the raw compat score alone -
  // "today" blends current compat with the event-date imprint read,
  // "date" blends it with the person-vs-person cross-comparison. The
  // dedicated Imprint Alignment mode above stays pure (it never computed a
  // current-compat score to begin with, so there's nothing to fuse there).
  const result = computeCompatibility(dateA, dateB);
  const deep = computeDeepCompatibility(dateA, dateB, mode === 'date');
  renderCompatHero(compatResultsEl, result, nameA, nameB, { dateA, dateB, pillDateA: dateA, pillDateB: dateB, pillPersonMode: mode === 'date', deep });
  compatModalOverlayEl.classList.add('active');
});

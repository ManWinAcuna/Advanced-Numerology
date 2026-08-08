const params = new URLSearchParams(window.location.search);
const categoryId = params.get('id');

let db = loadDB();
let category = db.categories.find((c) => c.id === categoryId);
let editingEntryId = null;

if (!category) {
  document.querySelector('.db-page').innerHTML = '<div class="empty-state">Category not found. <a href="database.html">Back to categories</a></div>';
} else {
  document.getElementById('categoryTitle').textContent = `${pickCategoryEmoji(category.name)} ${category.name}`;
  document.title = category.name + ' - Birthday Database';
  init();
}

function addEntry(name, date, time) {
  name = name.trim();
  if (!name || !date) return;
  const entry = { id: uid(), name, date };
  if (time) entry.time = time;
  category.entries.push(entry);
  category.entries.sort((a, b) => a.name.localeCompare(b.name));
  saveDBState(db);
  renderEntries();
}

function updateEntry(entryId, name, date, time) {
  name = name.trim();
  if (!name || !date) return;
  const entry = category.entries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.name = name;
  entry.date = date;
  delete entry.year; // a real date supersedes any year-only value
  if (time) entry.time = time;
  else delete entry.time;
  category.entries.sort((a, b) => a.name.localeCompare(b.name));
  saveDBState(db);
  renderEntries();
}

function deleteEntry(entryId) {
  category.entries = category.entries.filter((e) => e.id !== entryId);
  saveDBState(db);
  renderEntries();
}

function parseDateStr(dateStr) {
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y - which corrupted mid-typing states in the date picker.
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function renderEntries() {
  const container = document.getElementById('entriesContainer');
  container.innerHTML = '';

  if (category.entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No birthdays yet. Add one above.</div>';
    return;
  }

  category.entries.forEach((entry) => {
    // Year-only entry: not enough data for the full popup (no life path, day
    // number, or sun sign without a real month/day) - keeps its own simple
    // inline row with a prompt to add the full date.
    if (!entry.date && entry.year) {
      const yearSign = getChineseZodiacYear(new Date(entry.year, 6, 1));
      const div = document.createElement('div');
      div.className = 'entry-item';
      div.innerHTML = `
        <div class="entry-main">
          <div class="entry-name">${escapeHtml(entry.name)}</div>
          <div class="entry-date">${entry.year} · year only</div>
          <div class="entry-actions">
            <button class="btn-link" data-edit="${entry.id}">Add full date</button>
            <button class="icon-btn" data-entry="${entry.id}" title="Delete">&times;</button>
          </div>
        </div>
        <div class="entry-badges">
          <span class="badge">${VIETNAMESE_ZODIAC_EMOJI[yearSign] || ''} ${yearSign} year</span>
        </div>
      `;
      container.appendChild(div);
      return;
    }

    // Full-date entry: the row is just an entry point now - tap it to open
    // the full numerology popup (Calculate/Compare/Edit all live there).
    const timeLabel = entry.time ? ` · 🕐 ${formatHourLabel(...entry.time.split(':').map(Number))}` : '';

    const div = document.createElement('div');
    div.className = 'entry-item entry-item-tap';
    div.dataset.entryId = entry.id;
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.innerHTML = `
      <div class="entry-main">
        <div class="entry-name">${escapeHtml(entry.name)}</div>
        <div class="entry-date">${formatDate(entry.date)}${timeLabel}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

/* ---- Personal Hours: verbatim copies of render.js's helpers. render.js
   itself can't load on this page - its top-level wiring expects the
   calculator's own #bday/#btime inputs, not this page's add/edit form
   (#newEntryName/#newEntryDate/#newEntryTime). Same functions, same reason
   they were copied instead of loaded on today.html earlier. ---- */
function personalHourScore(table, row) {
  const signScore = row.sign === table.ownSign ? 100 : vietnameseCompat(table.ownSign, row.sign);
  const scores = [numerologyCompat(table.digitalRoot, row.digitalReduced), signScore];
  if (table.isPM) scores.push(numerologyCompat(table.militaryRoot, row.militaryReduced));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
function findBestFinancialHour(table) {
  const eightScore = numerologyCompat(table.digitalRoot, 8);
  const financialNumber = eightScore < 49 ? 28 : 8;
  const candidates = table.rows.filter((row) => row.digitalReduced === financialNumber
    || (table.isPM && row.militaryReduced === financialNumber));
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = -Infinity;
  candidates.forEach((row) => {
    const score = personalHourScore(table, row);
    if (score > bestScore) { bestScore = score; best = row; }
  });
  return { row: best, financialNumber };
}

function retroSpan(retro) {
  return retro ? ' <span class="retro-marker" title="Retrograde at birth">℞</span>' : '';
}

// The full numerology popup for one entry - same visual language as My
// Profile (Core Numbers/Zodiac/Personal Cycles/hours all reuse its exact
// CSS classes, so every readability/hierarchy fix made there applies here
// automatically), reached by tapping the row instead of a wall of inline
// badges and links.
function openEntryModal(entry) {
  const dateObj = parseDateStr(entry.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const r = computeAll(dateObj, today);
  const todayCompat = computeCompatibility(dateObj, today);
  const timeLabel = entry.time ? formatHourLabel(...entry.time.split(':').map(Number)) : '';

  // Best/Worst Hour and Best Financial Hour need a birth TIME, unlike
  // everything else here (which only needs the date) - quietly omitted
  // rather than shown empty when there isn't one on file.
  let hoursHtml = '';
  if (entry.time) {
    try {
      const [hh, mm] = entry.time.split(':').map(Number);
      const table = getPersonalHoursTable(hh, mm);
      const ranked = table.rows
        .map((row) => ({ row, score: personalHourScore(table, row) }))
        .sort((a, b) => b.score - a.score);
      const financial = findBestFinancialHour(table);
      hoursHtml = `
        <div class="box stat-box" id="entryBwHourBox">
          <div class="box-label">⏰ Best / Worst Hour</div>
          <div class="bw-hour-row">
            <div class="bw-hour good"><div class="bw-hour-tag">Best</div><div class="bw-hour-time" id="entryBestHour">${escapeHtml(ranked[0].row.label)}</div></div>
            <div class="bw-hour bad"><div class="bw-hour-tag">Worst</div><div class="bw-hour-time" id="entryWorstHour">${escapeHtml(ranked[ranked.length - 1].row.label)}</div></div>
          </div>
          <div class="bw-hour-row">
            <div class="bw-hour good subtle"><div class="bw-hour-tag">2nd Best</div><div class="bw-hour-time" id="entryBestHour2">${escapeHtml(ranked[1].row.label)}</div></div>
            <div class="bw-hour bad subtle"><div class="bw-hour-tag">2nd Worst</div><div class="bw-hour-time" id="entryWorstHour2">${escapeHtml(ranked[ranked.length - 2].row.label)}</div></div>
          </div>
        </div>
        <div class="box stat-box">
          <div class="box-label">💰 Best Financial Hour</div>
          <div class="box-value box-value-fin">${financial ? escapeHtml(financial.row.label) : 'None today'}</div>
          <div class="dayleft-caption">${financial ? `via ${financial.financialNumber}` : ''}</div>
        </div>
      `;
      // Same gold-overlap flag as Profile: mark whichever Best/Worst Hour
      // tile happens to also be the financial hour.
      if (financial) {
        setTimeout(() => {
          [['entryBestHour', ranked[0]], ['entryWorstHour', ranked[ranked.length - 1]],
            ['entryBestHour2', ranked[1]], ['entryWorstHour2', ranked[ranked.length - 2]]].forEach(([id, rh]) => {
            const el = document.getElementById(id);
            const tile = el && el.closest('.bw-hour');
            if (tile) tile.classList.toggle('bw-hour-fin', rh.row.label === financial.row.label);
          });
        }, 0);
      }
    } catch (e) { /* malformed time on an old entry - just skip the hours section */ }
  }

  document.getElementById('entryModalBody').innerHTML = `
    <div class="emax-modal-actions" style="width:100%; justify-content:flex-end">
      <button type="button" id="entryModalEditBtn">✎ Edit</button>
      <button type="button" class="emax-modal-delete" id="entryModalDeleteBtn">🗑 Delete</button>
    </div>
    <div class="emax-modal-name">${escapeHtml(entry.name)}</div>
    <div class="emax-modal-date">${formatDate(entry.date)}${timeLabel ? ' · 🕐 ' + escapeHtml(timeLabel) : ''}</div>

    <div class="section-label" style="margin-top:16px">Core Numbers</div>
    <div class="grid4 headerrow">
      <div class="cell head">Lifepath</div><div class="cell head">Day Born</div>
      <div class="cell head">Day#</div><div class="cell head">Combo</div>
    </div>
    <div class="grid4">
      <div class="cell highlight" id="lifePath">${lifePathDisplayText(r.lifePath)}</div>
      <div class="cell highlight" id="dayBornReduced">${r.dayBornReduced}</div>
      <div class="cell highlight" id="dayNumReduced">${r.dayNumReduced}</div>
      <div class="cell highlight" id="combo">${r.combo}</div>
    </div>
    <div class="grid4 subrow">
      <div class="cell small">${r.lifePathCompound}</div>
      <div class="cell small">${r.dayBornRaw}</div>
      <div class="cell small">${r.dayNumRaw}</div>
      <div class="cell small"></div>
    </div>

    <div class="profile-grid profile-core-grid" style="margin-top:10px">
      <div class="box stat-box">
        <div class="box-label">🍀 Lucky Number</div>
        <div class="box-value">${r.luckyNumber}</div>
      </div>
      <div class="box stat-box">
        <div class="box-label">✨ 28 Day</div>
        <div class="box-value">${r.twentyEightDay}</div>
      </div>
      <div class="box stat-box">
        <div class="box-label">🔢 Missing</div>
        <div class="box-value box-value-muted">${r.missing}</div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px">Vietnamese Zodiac</div>
    <div class="grid3 headerrow">
      <div class="cell head">Year</div><div class="cell head">Month</div><div class="cell head">Day</div>
    </div>
    <div class="grid3">
      <div class="cell sign" id="chineseYear">${r.chineseYear}</div>
      <div class="cell sign" id="chineseMonth">${r.chineseMonth}</div>
      <div class="cell sign" id="chineseDay">${r.chineseDay}</div>
    </div>

    <div class="section-label">Western Signs</div>
    <div class="grid4 headerrow">
      <div class="cell head">Sun Sign</div><div class="cell head">Saturn</div>
      <div class="cell head">Jupiter</div><div class="cell head">Venus</div>
    </div>
    <div class="grid4">
      <div class="cell sign" id="sunSign">${r.sunSign}</div>
      <div class="cell sign">${r.saturnSign}${retroSpan(r.saturnRetro)}</div>
      <div class="cell sign">${r.jupiterSign}${retroSpan(r.jupiterRetro)}</div>
      <div class="cell sign">${r.venusSign}${retroSpan(r.venusRetro)}</div>
    </div>

    <div class="section-label" style="margin-top:20px">Personal Cycles</div>
    <div class="grid3 headerrow">
      <div class="cell head">PY</div><div class="cell head">PM</div><div class="cell head">PD</div>
    </div>
    <div class="grid3">
      <div class="cell highlight">${r.py.reduced}</div>
      <div class="cell highlight">${r.pm.reduced}</div>
      <div class="cell highlight" id="pdReduced">${r.pd.reduced}</div>
    </div>
    <div class="grid3 subrow">
      <div class="cell small">${r.py.raw}</div>
      <div class="cell small">${r.pm.raw}</div>
      <div class="cell small">${r.pd.raw}</div>
    </div>

    <div class="profile-grid" style="margin-top:20px">
      <div class="box stat-box">
        <div class="box-label underline">📆 Days Left</div>
        <div class="dayleft-row">
          <div class="dayleft-tile">
            <div class="dayleft-icon">🎂</div>
            <div class="dayleft-value">${r.daysLeft.daysUntilBirthday}</div>
            <div class="dayleft-caption">until Birthday</div>
          </div>
          <div class="dayleft-tile">
            <div class="dayleft-icon">📅</div>
            <div class="dayleft-value">${r.daysLeft.daysUntilMonthlyDay}</div>
            <div class="dayleft-caption">until Monthly Day</div>
          </div>
        </div>
      </div>
      ${hoursHtml}
      <div class="box stat-box compat-today-box" id="entryCompatTodayBox">
        <div class="box-label">🤝 Compatibility with Today</div>
        <div class="box-value ${scoreClass(todayCompat.finalScore)}">${todayCompat.finalScore}%</div>
      </div>
    </div>

    <button type="button" class="emax-breakdown-toggle" id="compareToggleBtn" style="margin-top:20px">🤝 Compare with me</button>
  `;

  // Same box, same tap-to-expand behavior as Profile/Calculator/Famous's
  // Compatibility with Today - it was rendered here (same classes, same
  // look) but never actually wired to open anything.
  document.getElementById('entryCompatTodayBox').addEventListener('click', () => {
    renderCompatHero(document.getElementById('compareMiniBody'), todayCompat, entry.name, 'Today', { compact: true, pillDateA: dateObj, pillDateB: today });
    document.getElementById('compareMiniOverlay').classList.add('active');
  });

  document.getElementById('entryModalEditBtn').addEventListener('click', () => {
    closeEntryModal();
    startEdit(entry);
  });
  document.getElementById('entryModalDeleteBtn').addEventListener('click', () => {
    if (!confirm(`Delete ${entry.name}?`)) return;
    closeEntryModal();
    deleteEntry(entry.id);
  });
  document.getElementById('compareToggleBtn').addEventListener('click', () => openCompareMini(entry, dateObj));

  // "The general reading" link + tappable Lifepath/Day Born/Day#/Combo/
  // Personal Day/sign/animal popups - same feature Profile/Calculator
  // already have, wired here now too (2026-08-08). renderCompoundStories
  // (compat-render.js) is path-based for its "you"-voice vs third-person
  // choice; category.html isn't famous.html, so this naturally renders in
  // the same second-person voice as Profile, tap popups included.
  renderCompoundStories(r, dateObj);

  document.getElementById('entryModalOverlay').classList.add('active');
}

// "Compare with me" - the same shield-hero popup used everywhere else in
// the app now (Boost13, 2026-08-05); the entry popup above it already
// covers the entry's own numbers, so this stays compact.
function openCompareMini(entry, dateObj) {
  const profile = loadProfile();
  if (!profile || !profile.date) {
    alert('Set your birthday on the My Profile page first, then come back to compare.');
    return;
  }
  const meDate = parseDateStr(profile.date);
  const result = computeCompatibility(meDate, dateObj);
  renderCompatHero(document.getElementById('compareMiniBody'), result, 'Me', entry.name, { compact: true, pillDateA: meDate, pillDateB: dateObj, pillPersonMode: true });
  document.getElementById('compareMiniOverlay').classList.add('active');
}

function closeCompareMini() {
  document.getElementById('compareMiniOverlay').classList.remove('active');
}

function closeEntryModal() {
  document.getElementById('entryModalOverlay').classList.remove('active');
}

function startEdit(entry) {
  editingEntryId = entry.id;
  document.getElementById('newEntryName').value = entry.name;
  document.getElementById('newEntryDate').value = entry.date ? isoToDisplay(entry.date) : '';
  document.getElementById('newEntryTime').value = entry.time || '';
  document.getElementById('entryFormLabel').textContent = `Edit Birthday - ${entry.name}`;
  document.getElementById('addEntryBtn').textContent = 'Save Changes';
  document.getElementById('cancelEditBtn').style.display = '';
  document.getElementById('newEntryName').focus();
  document.getElementById('addEntryBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exitEditMode() {
  editingEntryId = null;
  document.getElementById('newEntryName').value = '';
  document.getElementById('newEntryDate').value = '';
  document.getElementById('newEntryTime').value = '';
  document.getElementById('entryFormLabel').textContent = 'Add Birthday';
  document.getElementById('addEntryBtn').textContent = 'Add';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

function init() {
  attachDateMask(document.getElementById('newEntryDate'));

  document.getElementById('addEntryBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('newEntryName');
    const dateInput = document.getElementById('newEntryDate');
    const timeInput = document.getElementById('newEntryTime');
    const iso = displayToISO(dateInput.value);
    if (!iso) {
      alert('Please enter a valid date (MM/DD/YYYY).');
      return;
    }
    if (editingEntryId) {
      updateEntry(editingEntryId, nameInput.value, iso, timeInput.value);
    } else {
      addEntry(nameInput.value, iso, timeInput.value);
    }
    exitEditMode();
  });

  document.getElementById('cancelEditBtn').addEventListener('click', () => exitEditMode());

  document.getElementById('newEntryName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('addEntryBtn').click();
  });

  document.getElementById('entriesContainer').addEventListener('click', (e) => {
    // Year-only rows keep their own inline delete/"Add full date" actions.
    const deleteBtn = e.target.closest('button[data-entry]');
    if (deleteBtn) {
      deleteEntry(deleteBtn.dataset.entry);
      if (editingEntryId === deleteBtn.dataset.entry) exitEditMode();
      return;
    }
    const editBtn = e.target.closest('button[data-edit]');
    if (editBtn) {
      const entry = category.entries.find((en) => en.id === editBtn.dataset.edit);
      if (entry) startEdit(entry);
      return;
    }
    // Full-date rows: tap anywhere to open the popup.
    const row = e.target.closest('.entry-item-tap');
    if (row) {
      const entry = category.entries.find((en) => en.id === row.dataset.entryId);
      if (entry) openEntryModal(entry);
    }
  });
  document.getElementById('entriesContainer').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.entry-item-tap');
    if (!row) return;
    e.preventDefault();
    const entry = category.entries.find((en) => en.id === row.dataset.entryId);
    if (entry) openEntryModal(entry);
  });

  document.getElementById('entryModalClose').addEventListener('click', closeEntryModal);
  document.getElementById('entryModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'entryModalOverlay') closeEntryModal();
  });

  document.getElementById('compareMiniClose').addEventListener('click', closeCompareMini);
  document.getElementById('compareMiniOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'compareMiniOverlay') closeCompareMini();
  });

  document.getElementById('bulkUploadBtn').addEventListener('click', () => {
    openBulkUploadModal((rows) => {
      let added = 0;
      let updated = 0;
      rows.forEach(({ name, date, time, year }) => {
        const existing = category.entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          if (date) {
            existing.date = date;
            delete existing.year;
            if (time) existing.time = time; else delete existing.time;
          } else {
            // Year-only: keep just the year, never a fabricated date.
            existing.year = year;
            delete existing.date;
            delete existing.time;
          }
          updated++;
        } else {
          const entry = date ? { id: uid(), name, date } : { id: uid(), name, year };
          if (date && time) entry.time = time;
          category.entries.push(entry);
          added++;
        }
      });
      category.entries.sort((a, b) => a.name.localeCompare(b.name));
      saveDBState(db);
      renderEntries();
      return `Imported ${rows.length} row${rows.length === 1 ? '' : 's'}: ${added} added, ${updated} updated.`;
    });
  });

  renderEntries();
}

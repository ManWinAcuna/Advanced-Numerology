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
    // Year-only entry: a year determines only the Chinese zodiac animal (not a
    // life path, day number or sun sign, which all need a real month/day), so
    // that's the one badge shown. July 1 anchors the year safely past any Lunar
    // New Year boundary (always Jan 21-Feb 20) so the right animal resolves.
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

    const dateObj = parseDateStr(entry.date);
    const lifePath = getLifePath(dateObj);
    const dayReduced = getReducedDay(dateObj);
    const yearSign = getChineseZodiacYear(dateObj);
    const zodiacSign = getSunSign(dateObj);

    const timeLabel = entry.time ? ` · 🕐 ${formatHourLabel(...entry.time.split(':').map(Number))}` : '';
    const calcHref = `calculator.html?bday=${entry.date}${entry.time ? `&btime=${entry.time}` : ''}`;

    const div = document.createElement('div');
    div.className = 'entry-item';
    div.innerHTML = `
      <div class="entry-main">
        <div class="entry-name">${escapeHtml(entry.name)}</div>
        <div class="entry-date">${formatDate(entry.date)}${timeLabel}</div>
        <div class="entry-actions">
          <a class="btn-link" href="${calcHref}">Calculate</a>
          <button class="btn-link" data-compare="${entry.id}">Compare with me</button>
          <button class="btn-link" data-edit="${entry.id}">Edit</button>
          <button class="icon-btn" data-entry="${entry.id}" title="Delete">&times;</button>
        </div>
      </div>
      <div class="entry-badges">
        <span class="badge">✨ LP ${lifePath}</span>
        <span class="badge">📅 Day ${dayReduced}</span>
        <span class="badge">${VIETNAMESE_ZODIAC_EMOJI[yearSign] || ''} ${yearSign}</span>
        <span class="badge">${ZODIAC_SYMBOLS[zodiacSign] || ''} ${zodiacSign}</span>
      </div>
    `;
    container.appendChild(div);
  });
}

function openCompatModal(entry) {
  const profile = loadProfile();
  if (!profile || !profile.date) {
    alert('Set your birthday on the My Profile page first, then come back to compare.');
    return;
  }

  const meDate = parseDateStr(profile.date);
  const themDate = parseDateStr(entry.date);
  const result = computeCompatibility(meDate, themDate);

  renderCompatResults(document.getElementById('compatModalBody'), result, 'Me', entry.name);
  document.getElementById('compatModalOverlay').classList.add('active');
}

function closeCompatModal() {
  document.getElementById('compatModalOverlay').classList.remove('active');
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
    const compareBtn = e.target.closest('button[data-compare]');
    if (compareBtn) {
      const entry = category.entries.find((en) => en.id === compareBtn.dataset.compare);
      if (entry) openCompatModal(entry);
    }
  });

  document.getElementById('compatModalClose').addEventListener('click', closeCompatModal);
  document.getElementById('compatModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'compatModalOverlay') closeCompatModal();
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

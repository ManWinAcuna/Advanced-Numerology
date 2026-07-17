let mode = null; // 'today' | 'date'

const modeSelectEl = document.getElementById('modeSelect');
const compatFormEl = document.getElementById('compatForm');
const personInputsEl = document.getElementById('personInputs');
const compatResultsEl = document.getElementById('compatResults');

function getAllDbEntries() {
  const db = loadDB();
  const entries = [];
  db.categories.forEach((cat) => {
    cat.entries.forEach((e) => {
      entries.push({ name: e.name, date: e.date, category: cat.name });
    });
  });
  return entries;
}

function personInputHTML(label, key) {
  const entries = getAllDbEntries();
  const options = entries
    .map((e) => `<option value="${e.date}" data-name="${escapeHtml(e.name)}">${escapeHtml(e.name)} (${escapeHtml(e.category)})</option>`)
    .join('');
  return `
    <div class="person-input box" data-person="${key}">
      <div class="box-label">${label}</div>
      <select class="db-picker" data-person="${key}">
        <option value="">Choose from database...</option>
        ${options}
      </select>
      <div class="inline-form">
        <input type="text" class="person-name" data-person="${key}" placeholder="Name (optional)">
        <input type="text" class="person-date" data-person="${key}" inputmode="numeric" placeholder="MM/DD/YYYY" maxlength="10" autocomplete="off">
      </div>
    </div>
  `;
}

function wirePersonInputs() {
  document.querySelectorAll('.person-date').forEach((input) => attachDateMask(input));

  document.querySelectorAll('.db-picker').forEach((sel) => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.person;
      const opt = sel.options[sel.selectedIndex];
      if (!opt.value) return;
      document.querySelector(`.person-date[data-person="${key}"]`).value = isoToDisplay(opt.value);
      document.querySelector(`.person-name[data-person="${key}"]`).value = opt.dataset.name || '';
    });
  });
}

document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', () => {
    mode = card.dataset.mode;
    modeSelectEl.style.display = 'none';
    compatFormEl.classList.add('active');
    compatResultsEl.classList.remove('active');
    compatResultsEl.innerHTML = '';

    if (mode === 'today') {
      personInputsEl.innerHTML = personInputHTML('Birthday', 'A');
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
  compatResultsEl.classList.remove('active');
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
    alert(`Please enter a valid date (MM/DD/YYYY) for ${mode === 'today' ? 'the birthday' : 'Person A'}.`);
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
      alert('Please enter a valid date (MM/DD/YYYY) for Person B.');
      return;
    }
    dateB = parseDateInput(dateBISO);
    nameB = document.querySelector('.person-name[data-person="B"]').value.trim() || 'Person B';
  }

  const result = computeCompatibility(dateA, dateB);
  renderCompatResults(compatResultsEl, result, nameA, nameB);
});

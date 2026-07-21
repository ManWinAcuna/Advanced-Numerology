/* ===================== Bulk Birthday Upload (CSV / Excel) ===================== */
// Lets a big spreadsheet of Name + Birthday rows get imported in one shot
// instead of typing each one in by hand. Only loaded on pages that offer it
// (the Database category page, UFC, Tennis) - not part of every page's load.

// SheetJS stopped publishing to npm after 0.18.5, so the old jsdelivr/npm URL
// for 0.20.x 404s (that was the "Could not load the Excel file reader" error).
// Load from SheetJS's own CDN first, then fall back to the last npm build on
// jsdelivr if that host is unreachable - either can read the file fine.
const XLSX_CDN_URLS = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];
let xlsxLoadPromise = null;

function loadOneScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => (typeof XLSX !== 'undefined' ? resolve() : reject(new Error('script loaded but XLSX missing')));
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.body.appendChild(s);
  });
}

// SheetJS is ~1MB - only fetched the moment someone actually picks an Excel
// file, never on page load. Plain .csv needs no library at all.
function loadXlsxLibrary() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (!xlsxLoadPromise) {
    xlsxLoadPromise = (async () => {
      for (const url of XLSX_CDN_URLS) {
        try {
          await loadOneScript(url);
          if (typeof XLSX !== 'undefined') return;
        } catch (e) { /* try the next CDN */ }
      }
      throw new Error('Could not load the Excel file reader - check your connection and try again.');
    })();
  }
  return xlsxLoadPromise;
}

// Excel's date epoch is 1899-12-30 (it has a fake 1900 leap-year bug baked
// in, which 25569 already accounts for) - only hit for raw numeric date
// cells that weren't already converted by cellDates:true.
function excelSerialToISO(serial) {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isoIfValid(year, month, day) {
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Accepts whatever shape a spreadsheet cell shows up as: a real Date object
// (Excel, cellDates:true), a raw serial number (fallback), or free text in a
// handful of common formats. Returns 'YYYY-MM-DD' or null if unparseable.
function parseFlexibleDateToISO(raw) {
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return excelSerialToISO(raw);
  }

  const value = String(raw == null ? '' : raw).trim();
  if (!value) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(value);
  if (m) return isoIfValid(Number(m[3]), Number(m[1]), Number(m[2]));

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() <= new Date().getFullYear()) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return null;
}

// A cell that carries only a year (a bare 4-digit value typed as text, or a
// plain number in the plausible-birth-year range). A real Excel date serial for
// a birthday is 5 digits (~15000+), so a value like 1990 is a year the user
// typed, not a serial. Returns the year, or null. Kept separate from full-date
// parsing so a year is NEVER fabricated into a Jan-1 date - a year only supports
// the Chinese zodiac animal, so that's all it's later used for.
function parseYearOnly(raw) {
  const thisYear = new Date().getFullYear();
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1900 && raw <= thisYear + 1) return raw;
  const s = String(raw == null ? '' : raw).trim();
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    if (y >= 1900 && y <= thisYear + 1) return y;
  }
  return null;
}

// Resolves one birthday cell to either a full date ({ iso }) or a year-only
// value ({ year }), or null if it's neither. Year is checked first so a bare
// year isn't fabricated into a full date by the flexible date parser.
function parseDateCell(raw) {
  const year = parseYearOnly(raw);
  if (year != null) return { year };
  const iso = parseFlexibleDateToISO(raw);
  if (iso) return { iso };
  return null;
}

// Minimal RFC4180-ish CSV parser - handles quoted fields containing commas
// or newlines and escaped "" quotes, which a plain split(',') would mangle.
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function detectColumnIndexes(headerRow) {
  const idx = { name: -1, date: -1, time: -1 };
  headerRow.forEach((cell, i) => {
    const v = String(cell || '').trim().toLowerCase();
    if (idx.name === -1 && /name/.test(v)) idx.name = i;
    if (idx.date === -1 && /(birth|dob|date)/.test(v)) idx.date = i;
    if (idx.time === -1 && /time/.test(v)) idx.time = i;
  });
  return idx;
}

// rows: array of arrays (raw cell values - strings from CSV, or
// string/Date/number from an Excel sheet). Returns { imported, skippedCount }.
function rowsToBirthdayEntries(rows) {
  if (!rows.length) return { imported: [], skippedCount: 0 };

  let startIndex = 0;
  let idx = detectColumnIndexes(rows[0].map((c) => String(c || '')));
  if (idx.name !== -1 && idx.date !== -1) {
    startIndex = 1;
  } else {
    idx = { name: 0, date: 1, time: 2 };
    // No recognizable header names - if row 0's date column doesn't parse,
    // it's still probably a header ("Name, Birthday"), just not one we
    // matched by keyword, so skip it rather than counting it as bad data.
    if (rows[0][1] !== undefined && parseDateCell(rows[0][1]) === null) startIndex = 1;
  }

  const imported = [];
  let skippedCount = 0;

  for (let i = startIndex; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[idx.name] == null ? '' : r[idx.name]).trim();
    const dateRaw = r[idx.date];
    const cell = (dateRaw != null && dateRaw !== '') ? parseDateCell(dateRaw) : null;
    if (!name || !cell) { skippedCount++; continue; }

    // A full date carries name + date (+ optional time); a year-only cell
    // carries just the year - never a fabricated month/day. Time is only
    // meaningful alongside a real date.
    const entry = cell.iso ? { name, date: cell.iso } : { name, year: cell.year };
    if (cell.iso && idx.time !== -1 && r[idx.time]) {
      const tm = /^(\d{1,2}):(\d{2})/.exec(String(r[idx.time]).trim());
      if (tm) entry.time = `${tm[1].padStart(2, '0')}:${tm[2]}`;
    }
    imported.push(entry);
  }

  return { imported, skippedCount };
}

async function parseBulkUploadFile(file) {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  if (isExcel) {
    await loadXlsxLibrary();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    return rowsToBirthdayEntries(rows);
  }

  const text = await file.text();
  const rows = parseCsvText(text);
  return rowsToBirthdayEntries(rows);
}

/* ===================== Bulk Upload Modal (shared UI) ===================== */

let bulkUploadOnImport = null;

function ensureBulkUploadModal() {
  if (document.getElementById('bulkUploadOverlay')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="bulkUploadOverlay">
      <div class="modal-box modal-box-narrow">
        <button class="modal-close" id="bulkUploadClose" title="Close">&times;</button>
        <div class="box-label">Bulk Upload Birthdays</div>
        <div class="bulk-upload-hint">Upload a CSV or Excel file with a Name column and a Birthday column (any common date format, a real Excel date column, or just a year). A header row is optional.</div>
        <input type="file" id="bulkUploadFileInput" accept=".csv,.xlsx,.xls">
        <div class="bulk-upload-status" id="bulkUploadStatus"></div>
        <div class="bulk-upload-actions" id="bulkUploadActions" style="display:none;">
          <button class="btn" id="bulkUploadConfirmBtn" type="button">Import</button>
          <button class="btn-link" id="bulkUploadCancelBtn" type="button">Cancel</button>
        </div>
      </div>
    </div>
  `);

  let pendingRows = null;

  function closeModal() {
    document.getElementById('bulkUploadOverlay').classList.remove('active');
    document.getElementById('bulkUploadFileInput').value = '';
    document.getElementById('bulkUploadStatus').textContent = '';
    document.getElementById('bulkUploadActions').style.display = 'none';
    pendingRows = null;
  }

  document.getElementById('bulkUploadClose').addEventListener('click', closeModal);
  document.getElementById('bulkUploadOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'bulkUploadOverlay') closeModal();
  });
  document.getElementById('bulkUploadCancelBtn').addEventListener('click', closeModal);

  document.getElementById('bulkUploadFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('bulkUploadStatus');
    statusEl.textContent = 'Reading file…';
    document.getElementById('bulkUploadActions').style.display = 'none';
    pendingRows = null;

    try {
      const { imported, skippedCount } = await parseBulkUploadFile(file);
      pendingRows = imported;
      if (!imported.length) {
        statusEl.textContent = `Couldn't find any usable rows in that file${skippedCount ? ` (${skippedCount} skipped)` : ''}. Expected a Name column and a Birthday column.`;
        return;
      }
      statusEl.textContent = `Found ${imported.length} birthday${imported.length === 1 ? '' : 's'}`
        + `${skippedCount ? ` · skipped ${skippedCount} row${skippedCount === 1 ? '' : 's'} that couldn't be read` : ''}.`;
      document.getElementById('bulkUploadActions').style.display = '';
    } catch (err) {
      statusEl.textContent = err.message || 'Could not read that file.';
    }
  });

  document.getElementById('bulkUploadConfirmBtn').addEventListener('click', () => {
    if (!pendingRows || !bulkUploadOnImport) return;
    const summary = bulkUploadOnImport(pendingRows);
    closeModal();
    if (summary) alert(summary);
  });
}

// onImport(rows) - rows: [{name, date, time?}] - merges them into whatever
// storage the calling page manages and returns a summary string to alert.
function openBulkUploadModal(onImport) {
  ensureBulkUploadModal();
  bulkUploadOnImport = onImport;
  document.getElementById('bulkUploadOverlay').classList.add('active');
}

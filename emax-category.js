const params = new URLSearchParams(window.location.search);
const categoryId = params.get('id');

let db = loadEmaxDB();
let category = db.categories.find((c) => c.id === categoryId);
let editingEntryId = null;
// The wiki title a successful "Look up" resolved to - saved onto the entry
// so the popup's image fetch can reuse the exact page instead of guessing
// off the typed name. Cleared whenever the date field is hand-edited (see
// the 'input' listener in init) so a stale match never gets saved silently.
let pendingWikiTitle = null;
// Guards a lookup response against a newer one that started after it (e.g.
// fixing a typo and re-clicking Look Up before the first request lands).
let lookupToken = 0;

if (!category) {
  document.querySelector('.db-page').innerHTML = '<div class="empty-state">Category not found. <a href="emax.html">Back to categories</a></div>';
} else {
  document.getElementById('categoryTitle').textContent = `${pickCategoryEmoji(category.name)} ${category.name}`;
  document.title = category.name + ' - EMAX';
  init();
}

/* ===================== Entries CRUD ===================== */

function addEntry(name, date, imageUrl, wikiTitle) {
  name = name.trim();
  if (!name || !date) return;
  const entry = { id: uid(), name, date };
  if (imageUrl) entry.imageUrl = imageUrl;
  if (wikiTitle) entry.wikiTitle = wikiTitle;
  category.entries.push(entry);
  saveEmaxDB(db);
  renderEntries();
}

function updateEntry(entryId, name, date, imageUrl, wikiTitle) {
  name = name.trim();
  if (!name || !date) return;
  const entry = category.entries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.name = name;
  entry.date = date;
  delete entry.year; // a real date supersedes any year-only value
  if (imageUrl) entry.imageUrl = imageUrl; else delete entry.imageUrl;
  if (wikiTitle) entry.wikiTitle = wikiTitle; else delete entry.wikiTitle;
  saveEmaxDB(db);
  renderEntries();
}

function deleteEntry(entryId) {
  category.entries = category.entries.filter((e) => e.id !== entryId);
  saveEmaxDB(db);
  renderEntries();
}

// Clicking the star already showing your current rating clears it back to
// unrated, rather than being stuck re-affirming the same number forever.
function setRating(entryId, rating) {
  const entry = category.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  const next = entry.rating === rating ? undefined : rating;
  if (next === undefined) delete entry.rating; else entry.rating = next;
  saveEmaxDB(db);
  return entry;
}

function parseDateStr(dateStr) {
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y.
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* ===================== Images: auto-fetch + monogram fallback ===================== */
// Same pattern Stocks already uses for CEO portraits: the LIST stays
// monogram-only (fast, no image loading in a scrolling list), the real
// photo only loads lazily when an item's own popup opens. A manual
// entry.imageUrl always wins over the auto-fetch.

const EMAX_IMAGE_CACHE_KEY = 'numerology_emax_images_v1';
let emaxImageCache = {};
try { emaxImageCache = JSON.parse(localStorage.getItem(EMAX_IMAGE_CACHE_KEY)) || {}; } catch (e) { emaxImageCache = {}; }

async function emaxFetchImage(title) {
  if (Object.prototype.hasOwnProperty.call(emaxImageCache, title)) return emaxImageCache[title];
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const data = await res.json();
    const url = (data.thumbnail && data.thumbnail.source) || null;
    emaxImageCache[title] = url;
    try { localStorage.setItem(EMAX_IMAGE_CACHE_KEY, JSON.stringify(emaxImageCache)); } catch (e2) { /* storage full - refetch next time */ }
    return url;
  } catch (e) {
    return null; // offline or no image - monogram fallback stays
  }
}

function emaxMonogram(name, large) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `<div class="emax-monogram${large ? ' large' : ''}" style="--emax-hue:${hue}">${escapeHtml(initials)}</div>`;
}

/* ===================== Star rating widget ===================== */

function starsHtml(entryId, rating) {
  let html = `<span class="emax-stars" data-entry="${entryId}">`;
  for (let i = 1; i <= 5; i++) {
    html += `<button class="emax-star${i <= (rating || 0) ? ' filled' : ''}" data-star="${i}" type="button" title="Rate ${i}">&#9733;</button>`;
  }
  html += `</span>`;
  return html;
}

/* ===================== List rendering ===================== */

// { entry, score }[] - score null when there's no profile birthday yet or
// the entry is year-only (can't compute a real compatibility score without
// a full date). Sorted highest-score-first; scoreless entries sort last,
// alphabetically among themselves.
function scoredEntries(meDate) {
  const list = category.entries.map((entry) => {
    if (!meDate || !entry.date) return { entry, score: null };
    const score = computeCompatibility(meDate, parseDateStr(entry.date)).finalScore;
    return { entry, score };
  });
  list.sort((a, b) => {
    if (a.score == null && b.score == null) return a.entry.name.localeCompare(b.entry.name);
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });
  return list;
}

function entryRowHtml(entry, score) {
  if (!entry.date && entry.year) {
    const yearSign = getChineseZodiacYear(new Date(entry.year, 6, 1));
    return `
      <div class="entry-item emax-entry-item">
        <div class="emax-entry-thumb">${emaxMonogram(entry.name, false)}</div>
        <div class="emax-entry-main">
          <div class="entry-name">${escapeHtml(entry.name)}</div>
          <div class="entry-date">${entry.year} · year only</div>
        </div>
        <div class="emax-entry-side">
          <span class="badge">${VIETNAMESE_ZODIAC_EMOJI[yearSign] || ''} ${yearSign} year</span>
          <div class="entry-actions">
            <button class="btn-link" data-edit="${entry.id}">Add full date</button>
            <button class="icon-btn" data-entry-delete="${entry.id}" title="Delete">&times;</button>
          </div>
        </div>
      </div>`;
  }

  const scoreHtml = score == null ? '<div class="emax-score dim">&mdash;</div>' : `<div class="emax-score ${scoreClass(score)}">${score}%</div>`;
  return `
    <div class="entry-item emax-entry-item" data-open="${entry.id}">
      <div class="emax-entry-thumb">${emaxMonogram(entry.name, false)}</div>
      <div class="emax-entry-main">
        <div class="entry-name">${escapeHtml(entry.name)}</div>
        ${starsHtml(entry.id, entry.rating || 0)}
      </div>
      <div class="emax-entry-side">
        ${scoreHtml}
        <div class="entry-actions">
          <button class="btn-link" data-edit="${entry.id}">Edit</button>
          <button class="icon-btn" data-entry-delete="${entry.id}" title="Delete">&times;</button>
        </div>
      </div>
    </div>`;
}

function renderEntries() {
  const container = document.getElementById('entriesContainer');

  if (category.entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No items yet. Add one above.</div>';
    return;
  }

  const profile = loadProfile();
  const meDate = (profile && profile.date) ? parseDateStr(profile.date) : null;
  const noteHtml = meDate ? '' : '<div class="emax-note">Set your birthday on <a href="profile.html">My Profile</a> to see compatibility scores.</div>';
  const ranked = scoredEntries(meDate);
  container.innerHTML = noteHtml + ranked.map(({ entry, score }) => entryRowHtml(entry, score)).join('');
}

/* ===================== Item popup ===================== */
// Quick-glance facts up top (image, Life Path, Day Born, Chinese Month/Day
// animal, your rating), the full two-way compatibility breakdown
// (compat-render.js, same component the Database's "Compare with me" and
// the Compatibility Calculator already use) underneath.

function openItemModal(entry) {
  const profile = loadProfile();
  if (!profile || !profile.date) {
    alert('Set your birthday on the My Profile page first, then come back to see compatibility.');
    return;
  }

  const body = document.getElementById('itemModalBody');
  body.innerHTML = `<div id="itemModalHeader"></div><div id="itemModalCompat"></div>`;

  const meDate = parseDateStr(profile.date);
  const themDate = parseDateStr(entry.date);
  const result = computeCompatibility(meDate, themDate);

  const lifePath = getLifePath(themDate);
  const dayBorn = getReducedDay(themDate);
  const chineseMonth = getChineseMonth(themDate);
  const chineseDay = getChineseDaySign(themDate);

  document.getElementById('itemModalHeader').innerHTML = `
    <div class="emax-modal-hero">
      <div class="emax-modal-image" id="itemModalImage">${emaxMonogram(entry.name, true)}</div>
      <div class="emax-modal-facts">
        ${starsHtml(entry.id, entry.rating || 0)}
        <div class="entry-badges">
          <span class="badge">✨ LP ${lifePath}</span>
          <span class="badge">📅 Day ${dayBorn}</span>
          <span class="badge">${VIETNAMESE_ZODIAC_EMOJI[chineseMonth] || ''} ${chineseMonth} month</span>
          <span class="badge">${VIETNAMESE_ZODIAC_EMOJI[chineseDay] || ''} ${chineseDay} day</span>
        </div>
      </div>
    </div>`;

  renderCompatResults(document.getElementById('itemModalCompat'), result, entry.name, 'Me');
  document.getElementById('itemModalOverlay').classList.add('active');

  if (entry.imageUrl) {
    document.getElementById('itemModalImage').innerHTML = `<img src="${escapeHtml(entry.imageUrl)}" alt="">`;
  } else {
    const title = entry.wikiTitle || entry.name;
    emaxFetchImage(title).then((url) => {
      if (!url) return;
      const imgEl = document.getElementById('itemModalImage');
      if (imgEl) imgEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
    });
  }
}

function closeItemModal() {
  document.getElementById('itemModalOverlay').classList.remove('active');
}

/* ===================== Add/Edit form ===================== */

function startEdit(entry) {
  editingEntryId = entry.id;
  pendingWikiTitle = entry.wikiTitle || null;
  document.getElementById('newEntryName').value = entry.name;
  document.getElementById('newEntryDate').value = entry.date ? isoToDisplay(entry.date) : '';
  document.getElementById('newEntryImage').value = entry.imageUrl || '';
  document.getElementById('entryFormLabel').textContent = `Edit Item - ${entry.name}`;
  document.getElementById('addEntryBtn').textContent = 'Save Changes';
  document.getElementById('cancelEditBtn').style.display = '';
  document.getElementById('entryLookupStatus').textContent = '';
  document.getElementById('newEntryName').focus();
  document.getElementById('addEntryBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exitEditMode() {
  editingEntryId = null;
  pendingWikiTitle = null;
  document.getElementById('newEntryName').value = '';
  document.getElementById('newEntryDate').value = '';
  document.getElementById('newEntryImage').value = '';
  document.getElementById('entryFormLabel').textContent = 'Add Item';
  document.getElementById('addEntryBtn').textContent = 'Add';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('entryLookupStatus').textContent = '';
}

function setLookupStatus(text, isError) {
  const el = document.getElementById('entryLookupStatus');
  el.textContent = text;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

/* ===================== Preload Top 50 ===================== */
// Only offered on a category whose name exactly matches one of EMAX's
// starter lists (emax-seed-data.js) - a renamed or custom category simply
// never shows the button, no per-category configuration needed. Runs the
// exact same lookup (lookupKeyDateByNameWithTitle) as a single manual
// "Look up" click, just looped: skips names already in the category
// (case-insensitive, same dedup rule Bulk Upload already uses), and any
// name that doesn't resolve is silently skipped and counted (never a
// fabricated date) rather than blocking the rest of the run. Sequential with
// a small gap between requests - Wikimedia throttles bursty automated
// clients (see the label-search queue further down this file's neighbor,
// db-core.js), and ~50 lookups in a tight loop is exactly that pattern.
let emaxPreloading = false;

async function preloadTop50() {
  if (emaxPreloading) return;
  const names = EMAX_SEED_LISTS[category.name];
  if (!names) return;
  emaxPreloading = true;
  const btn = document.getElementById('preloadTop50Btn');
  btn.disabled = true;
  const existing = new Set(category.entries.map((e) => e.name.toLowerCase()));
  let added = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (let i = 0; i < names.length; i++) {
    // Each seed entry is either a plain display name, or [displayName,
    // searchTerm] when the clean name alone is too ambiguous to resolve
    // reliably - the search term only finds the right Wikidata item, the
    // display name is always what actually gets saved/shown.
    const seed = names[i];
    const displayName = Array.isArray(seed) ? seed[0] : seed;
    const searchTerm = Array.isArray(seed) ? seed[1] : seed;
    setLookupStatus(`⚡ Preloading Top 50 - ${i + 1}/${names.length} (${added} added so far)...`, false);
    if (existing.has(displayName.toLowerCase())) { skippedExisting++; continue; }
    try {
      const info = await lookupKeyDateByNameWithTitle(searchTerm);
      if (info) {
        category.entries.push({ id: uid(), name: displayName, date: info.date, wikiTitle: info.title });
        existing.add(displayName.toLowerCase());
        added++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  saveEmaxDB(db);
  renderEntries();
  btn.disabled = false;
  emaxPreloading = false;
  const skipNote = skippedExisting ? ` (${skippedExisting} already in your list)` : '';
  setLookupStatus(`⚡ Preloaded ${added}/${names.length - skippedExisting}${skipNote} - ${failed} couldn't be matched automatically.`, false);
}

/* ===================== Preload by Year ===================== */
// Only offered on the brand categories (EMAX_YEAR_FILTERABLE_CATEGORIES) -
// "founded in year X" is a real, checkable fact for a brand, unlike a
// meaningful "top of year X" for a movie or artist. There's no live
// "founded in year X" query - this SCANS the whole category's seed pool
// (fetchFoundingDateOrYear per candidate) and keeps only the ones whose
// founding year matches, so an exact year with sparse coverage can come
// back with very few hits (or none) - that's the honest tradeoff of an
// exact-year filter over a broader curated list, never papered over with a
// fabricated match. Results are cached per (category, search term) so
// re-running for a DIFFERENT year on the same category reuses everything
// already looked up instead of re-querying Wikidata from scratch.

const EMAX_FOUNDING_CACHE_KEY = 'numerology_emax_founding_cache_v1';
let emaxFoundingCache = {};
try { emaxFoundingCache = JSON.parse(localStorage.getItem(EMAX_FOUNDING_CACHE_KEY)) || {}; } catch (e) { emaxFoundingCache = {}; }

async function emaxLookupFoundingCached(categoryName, searchTerm) {
  const key = `${categoryName}|${searchTerm}`;
  if (Object.prototype.hasOwnProperty.call(emaxFoundingCache, key)) return emaxFoundingCache[key];
  let info = null;
  try { info = await lookupFoundingDateOrYearWithTitle(searchTerm); } catch (e) { info = null; }
  emaxFoundingCache[key] = info;
  try { localStorage.setItem(EMAX_FOUNDING_CACHE_KEY, JSON.stringify(emaxFoundingCache)); } catch (e2) { /* storage full - refetch next time */ }
  await new Promise((resolve) => setTimeout(resolve, 350)); // pace real network calls only - a cache hit above already returned
  return info;
}

async function preloadByYear(targetYear, includeYearOnly) {
  if (emaxPreloading) return;
  const names = EMAX_SEED_LISTS[category.name];
  if (!names) return;
  emaxPreloading = true;
  const btn = document.getElementById('preloadByYearBtn');
  btn.disabled = true;
  const existing = new Set(category.entries.map((e) => e.name.toLowerCase()));
  let added = 0;
  let addedYearOnly = 0;
  let skippedExisting = 0;
  let skippedYearOnlyExcluded = 0;

  for (let i = 0; i < names.length; i++) {
    const seed = names[i];
    const displayName = Array.isArray(seed) ? seed[0] : seed;
    const searchTerm = Array.isArray(seed) ? seed[1] : seed;
    setLookupStatus(`⚡ Scanning for ${targetYear} - ${i + 1}/${names.length} (${added} matched so far)...`, false);
    if (existing.has(displayName.toLowerCase())) { skippedExisting++; continue; }

    const info = await emaxLookupFoundingCached(category.name, searchTerm);
    if (!info) continue;

    const resolvedYear = info.date ? Number(info.date.slice(0, 4)) : info.year;
    if (resolvedYear !== targetYear) continue;

    if (info.date) {
      category.entries.push({ id: uid(), name: displayName, date: info.date, wikiTitle: info.title });
      existing.add(displayName.toLowerCase());
      added++;
    } else if (includeYearOnly) {
      category.entries.push({ id: uid(), name: displayName, year: info.year });
      existing.add(displayName.toLowerCase());
      added++;
      addedYearOnly++;
    } else {
      skippedYearOnlyExcluded++;
    }
  }

  saveEmaxDB(db);
  renderEntries();
  btn.disabled = false;
  emaxPreloading = false;
  const yearOnlyNote = addedYearOnly ? ` (${addedYearOnly} year-only precision)` : '';
  const excludedNote = skippedYearOnlyExcluded ? ` · ${skippedYearOnlyExcluded} more matched but were year-only and excluded` : '';
  setLookupStatus(`⚡ Found ${added} founded in ${targetYear}${yearOnlyNote} out of ${names.length} scanned${excludedNote}.`, false);
}

function init() {
  attachDateMask(document.getElementById('newEntryDate'));

  document.getElementById('addEntryBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('newEntryName');
    const dateInput = document.getElementById('newEntryDate');
    const imageInput = document.getElementById('newEntryImage');
    const iso = displayToISO(dateInput.value);
    if (!iso) {
      alert('Please enter a valid date (MM/DD/YYYY) - or use Look Up to try filling it in automatically.');
      return;
    }
    if (editingEntryId) {
      updateEntry(editingEntryId, nameInput.value, iso, imageInput.value.trim(), pendingWikiTitle);
    } else {
      addEntry(nameInput.value, iso, imageInput.value.trim(), pendingWikiTitle);
    }
    exitEditMode();
  });

  document.getElementById('cancelEditBtn').addEventListener('click', () => exitEditMode());

  document.getElementById('newEntryName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('addEntryBtn').click();
  });

  // A hand-typed date invalidates whatever "Look up" previously matched -
  // setting .value programmatically (the lookup filling it in) does NOT
  // fire 'input', only real typing does, so this only clears on genuine edits.
  document.getElementById('newEntryDate').addEventListener('input', () => { pendingWikiTitle = null; });

  document.getElementById('entryLookupBtn').addEventListener('click', () => {
    const name = document.getElementById('newEntryName').value.trim();
    if (!name) { setLookupStatus('Type a name first.', true); return; }
    setLookupStatus('🔍 Looking up...', false);
    const myToken = ++lookupToken;
    lookupKeyDateByNameWithTitle(name).then((info) => {
      if (myToken !== lookupToken) return; // superseded by a newer lookup
      if (!info) {
        setLookupStatus(`Couldn't find a date automatically for "${name}" - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newEntryDate').value = isoToDisplay(info.date);
      pendingWikiTitle = info.title;
      const kindLabel = info.kind === 'born' ? 'born' : info.kind === 'released' ? 'released' : 'founded';
      setLookupStatus(`✓ Matched "${info.title}" (${kindLabel} ${info.date}) - please double-check before saving.`, false);
    }).catch(() => {
      if (myToken !== lookupToken) return;
      setLookupStatus(`Couldn't find a date automatically for "${name}" - please enter it yourself.`, true);
    });
  });

  document.getElementById('entriesContainer').addEventListener('click', (e) => {
    const starBtn = e.target.closest('.emax-star');
    if (starBtn) {
      e.preventDefault();
      e.stopPropagation();
      const entryId = starBtn.closest('.emax-stars').dataset.entry;
      setRating(entryId, Number(starBtn.dataset.star));
      renderEntries();
      return;
    }

    const deleteBtn = e.target.closest('button[data-entry-delete]');
    if (deleteBtn) {
      e.preventDefault();
      deleteEntry(deleteBtn.dataset.entryDelete);
      if (editingEntryId === deleteBtn.dataset.entryDelete) exitEditMode();
      return;
    }

    const editBtn = e.target.closest('button[data-edit]');
    if (editBtn) {
      e.preventDefault();
      const entry = category.entries.find((en) => en.id === editBtn.dataset.edit);
      if (entry) startEdit(entry);
      return;
    }

    const row = e.target.closest('[data-open]');
    if (row) {
      const entry = category.entries.find((en) => en.id === row.dataset.open);
      if (entry && entry.date) openItemModal(entry);
    }
  });

  document.getElementById('itemModalBody').addEventListener('click', (e) => {
    const starBtn = e.target.closest('.emax-star');
    if (!starBtn) return;
    const starsEl = starBtn.closest('.emax-stars');
    const entry = setRating(starsEl.dataset.entry, Number(starBtn.dataset.star));
    if (entry) starsEl.outerHTML = starsHtml(entry.id, entry.rating || 0);
    renderEntries(); // keep the list in sync while the popup stays open
  });

  document.getElementById('itemModalClose').addEventListener('click', closeItemModal);
  document.getElementById('itemModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'itemModalOverlay') closeItemModal();
  });

  document.getElementById('bulkUploadBtn').addEventListener('click', () => {
    openBulkUploadModal((rows) => {
      let added = 0;
      let updated = 0;
      rows.forEach(({ name, date, year }) => {
        const existing = category.entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          if (date) {
            existing.date = date;
            delete existing.year;
          } else {
            existing.year = year;
            delete existing.date;
          }
          updated++;
        } else {
          const entry = date ? { id: uid(), name, date } : { id: uid(), name, year };
          category.entries.push(entry);
          added++;
        }
      });
      saveEmaxDB(db);
      renderEntries();
      return `Imported ${rows.length} row${rows.length === 1 ? '' : 's'}: ${added} added, ${updated} updated.`;
    });
  });

  if (EMAX_SEED_LISTS[category.name]) {
    document.getElementById('preloadTop50Btn').style.display = '';
    document.getElementById('preloadTop50Btn').addEventListener('click', () => preloadTop50());
  }

  if (EMAX_YEAR_FILTERABLE_CATEGORIES.includes(category.name)) {
    document.getElementById('preloadByYearRow').style.display = '';
    document.getElementById('preloadByYearBtn').addEventListener('click', () => {
      const year = parseInt(document.getElementById('preloadYearInput').value, 10);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < 1500 || year > currentYear) {
        setLookupStatus(`Enter a real year (1500-${currentYear}).`, true);
        return;
      }
      const includeYearOnly = document.getElementById('preloadYearOnlyToggle').checked;
      preloadByYear(year, includeYearOnly);
    });
  }

  renderEntries();
}

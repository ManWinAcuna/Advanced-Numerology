let db = loadEmaxDB();

// Seeds any starter category name not yet offered to this account -
// EMAX_SEEN_STARTERS_KEY tracks that regardless of whether you kept or
// deleted it, so nothing is ever resurrected, but a category added to the
// app AFTER you'd already been using EMAX (Anime/Shows/Songs, added well
// after the original 6) still reaches your existing database instead of
// only ever showing up for a brand-new install.
//
// A signed-in browser whose cloud pull for THIS session hasn't landed yet
// looks, to this function, exactly like a brand-new account: local
// db.categories is empty, so it seeds all ~20 starters as empty shells and
// (via saveEmaxDB -> cloudPushKey -> cloudPushEmax) immediately PUSHES
// them - creating brand-new emaxCats docs under fresh random ids and
// overwriting the shared emaxCategoryIds pointer to reference them,
// orphaning whatever real categories/entries the cloud actually had. The
// pull runs async (network-bound); this runs synchronously at page load,
// so it always wins that race unless explicitly held back. A device that
// has never signed in has no cloud data to race against, so it seeds
// immediately as before - only a signed-in device waits, and only until
// this session's first pull settles (capped at 10s so a slow/broken
// network can never wedge the page).
function applyStarterSeeding() {
  let emaxSeenStarters = null;
  try {
    const raw = localStorage.getItem(EMAX_SEEN_STARTERS_KEY);
    emaxSeenStarters = raw ? JSON.parse(raw) : null;
  } catch (e) { emaxSeenStarters = null; }

  if (emaxSeenStarters === null) {
    // No migration record yet. A device that already has categories was
    // seeded under the ORIGINAL one-time-only logic (the first 6) before this
    // tracking existed - treat those as already-seen so they're never
    // re-offered (that would resurrect one you'd deliberately deleted). A
    // truly first-ever visit (zero categories) has seen nothing yet.
    emaxSeenStarters = db.categories.length > 0
      ? ['Clothing Brands', 'Movies', 'Artists', 'Shoe Brands', 'Technology Brands', 'Hygiene Brands']
      : [];
  }

  // Also guards against a name that's somehow already present in db.categories
  // (a stale/out-of-sync emaxSeenStarters shouldn't be able to duplicate a
  // category that's already there, deleted-and-seen or not) - belt and
  // suspenders over the seen-list check alone.
  const existingNames = new Set(db.categories.map((c) => c.name));
  const newStarters = EMAX_STARTER_CATEGORIES.filter((name) => !emaxSeenStarters.includes(name) && !existingNames.has(name));
  if (newStarters.length) {
    newStarters.forEach((name) => db.categories.push({ id: uid(), name, entries: [] }));
    emaxSeenStarters = emaxSeenStarters.concat(newStarters);
    saveEmaxDB(db);
  }
  try { localStorage.setItem(EMAX_SEEN_STARTERS_KEY, JSON.stringify(emaxSeenStarters)); cloudPushKey(EMAX_SEEN_STARTERS_KEY); } catch (e) { /* storage full - retried next load */ }
}

let everSignedInForEmaxSeed = false;
try { everSignedInForEmaxSeed = !!localStorage.getItem('numerology_ever_signed_in'); } catch (e) { /* ignore */ }

if (everSignedInForEmaxSeed && window.__firstCloudPullDone) {
  window.__firstCloudPullDone.then(() => {
    // Re-read: the pull this was waiting on may have just replaced local
    // EMAX data with the real cloud copy, entries and all.
    db = loadEmaxDB();
    applyStarterSeeding();
    render();
  });
} else {
  applyStarterSeeding();
}

function addCategory(name) {
  name = name.trim();
  if (!name) return;
  db.categories.push({ id: uid(), name, entries: [] });
  saveEmaxDB(db);
  render();
}

function deleteCategory(categoryId) {
  db.categories = db.categories.filter((c) => c.id !== categoryId);
  saveEmaxDB(db);
  render();
}

// The actual reorder step, kept separate from the pointer/touch-drag
// plumbing below so the logic itself (move one category to another spot,
// save) is directly testable without a real pointer/touch environment.
function reorderCategory(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0
    || fromIndex >= db.categories.length || toIndex >= db.categories.length) return;
  const [moved] = db.categories.splice(fromIndex, 1);
  db.categories.splice(toIndex, 0, moved);
  saveEmaxDB(db);
}

// Explicit, button-driven alternative to the tap-hold/drag reorder below -
// added after tap-hold repeatedly failed on a real device even with the
// iOS touch-callout fix (a native gesture or platform quirk this app can't
// fully control either way). "‹"/"›" just call the SAME reorderCategory
// used by the drag path, one array position at a time - no pointer timing,
// no touch-action fights, nothing that depends on how any given browser
// happens to arbitrate a held touch. Guaranteed to work everywhere.
let rearrangeMode = false;

// The grid is auto-fill/minmax, so its column count changes with viewport
// width - measuring the browser's own computed layout (rather than
// hardcoding a number) keeps Up/Down correct whether it's 2 columns on a
// phone or 5+ on a wide desktop window.
function currentGridColumns() {
  const container = document.getElementById('categoriesContainer');
  // getComputedStyle is always present in a real browser; the fallback here
  // only matters for the Node/vm test harness, which has no CSS layout
  // engine to resolve auto-fill/minmax into an actual column count.
  if (typeof getComputedStyle !== 'function') return 2;
  const cols = getComputedStyle(container).gridTemplateColumns.split(' ').filter(Boolean).length;
  return cols || 1;
}

// Up/Down swaps directly with the tile one row away in the same column.
// This is deliberately NOT reorderCategory's splice-based move: splicing by
// more than one position shifts every tile in between rather than
// exchanging just the two involved, which for a "move up/down one row"
// click would drag along a neighbor the user never touched. Left/Right
// moves by exactly one position, where a splice and a swap are the same
// operation, so reorderCategory is untouched and still owns those.
function swapCategories(indexA, indexB) {
  if (indexA === indexB || indexA < 0 || indexB < 0
    || indexA >= db.categories.length || indexB >= db.categories.length) return;
  const tmp = db.categories[indexA];
  db.categories[indexA] = db.categories[indexB];
  db.categories[indexB] = tmp;
  saveEmaxDB(db);
}

function render() {
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '';

  if (db.categories.length === 0) {
    container.className = '';
    container.innerHTML = '<div class="empty-state">No categories yet. Add one above to get started.</div>';
    return;
  }

  container.className = 'category-grid';
  const cols = rearrangeMode ? currentGridColumns() : 1;

  db.categories.forEach((cat, index) => {
    const count = cat.entries.length;
    const tile = document.createElement('a');
    tile.className = 'category-tile' + (rearrangeMode ? ' rearrange-active' : '');
    tile.href = `emax-category.html?id=${cat.id}`;
    tile.dataset.category = cat.id;
    const reorderControlsHtml = rearrangeMode ? `
      <div class="tile-reorder-controls">
        <button class="icon-btn" data-action="move-up" data-category="${cat.id}" title="Move up" ${index - cols < 0 ? 'disabled' : ''}>▲</button>
        <button class="icon-btn" data-action="move-earlier" data-category="${cat.id}" title="Move earlier" ${index === 0 ? 'disabled' : ''}>‹</button>
        <button class="icon-btn" data-action="move-down" data-category="${cat.id}" title="Move down" ${index + cols >= db.categories.length ? 'disabled' : ''}>▼</button>
        <button class="icon-btn" data-action="move-later" data-category="${cat.id}" title="Move later" ${index === db.categories.length - 1 ? 'disabled' : ''}>›</button>
      </div>` : '';
    tile.innerHTML = `
      <button class="icon-btn tile-delete" data-action="delete-category" data-category="${cat.id}" title="Delete category">&times;</button>
      <div class="tile-icon">${pickCategoryEmoji(cat.name)}</div>
      <div class="tile-name">${escapeHtml(cat.name)}</div>
      <div class="tile-count">${count} item${count === 1 ? '' : 's'}</div>
      ${reorderControlsHtml}
    `;
    container.appendChild(tile);
  });
}

document.getElementById('addCategoryBtn').addEventListener('click', () => {
  const input = document.getElementById('newCategoryName');
  addCategory(input.value);
  input.value = '';
  input.focus();
});

document.getElementById('newCategoryName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('addCategoryBtn').click();
});

document.getElementById('rearrangeToggleBtn').addEventListener('click', () => {
  rearrangeMode = !rearrangeMode;
  document.getElementById('rearrangeToggleBtn').textContent = rearrangeMode ? '✓ Done' : '⇅ Rearrange';
  render();
});

document.getElementById('categoriesContainer').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('button[data-action="delete-category"]');
  if (deleteBtn) {
    e.preventDefault();
    e.stopPropagation();
    const categoryId = deleteBtn.dataset.category;
    const cat = db.categories.find((c) => c.id === categoryId);
    const label = cat ? cat.name : 'this category';
    if (confirm(`Delete "${label}" and everything in it?`)) deleteCategory(categoryId);
    return;
  }

  const moveBtn = e.target.closest('button[data-action="move-earlier"], button[data-action="move-later"], button[data-action="move-up"], button[data-action="move-down"]');
  if (moveBtn) {
    e.preventDefault();
    e.stopPropagation();
    const fromIndex = db.categories.findIndex((c) => c.id === moveBtn.dataset.category);
    if (fromIndex === -1) return;
    switch (moveBtn.dataset.action) {
      case 'move-earlier': reorderCategory(fromIndex, fromIndex - 1); break;
      case 'move-later': reorderCategory(fromIndex, fromIndex + 1); break;
      case 'move-up': swapCategories(fromIndex, fromIndex - currentGridColumns()); break;
      case 'move-down': swapCategories(fromIndex, fromIndex + currentGridColumns()); break;
    }
    // render() rebuilds the whole grid via innerHTML - the tapped button
    // gets destroyed mid-click, and losing focus mid-scroll is what was
    // dragging the page back to the top (the real scrolling element is
    // .scroll-viewport, not the document - see scroll-viewport.js). Save/
    // restore its position across the rebuild so the view holds still.
    const viewport = document.querySelector('.scroll-viewport');
    const savedScroll = viewport ? viewport.scrollTop : null;
    render();
    if (viewport && savedScroll != null) viewport.scrollTop = savedScroll;
    return;
  }

  // Rearrange mode is for shifting tiles around, not navigating away from
  // the page mid-edit - tapping the tile body itself (anything that isn't
  // one of the buttons above) is a no-op while it's on.
  if (rearrangeMode && e.target.closest('.category-tile')) {
    e.preventDefault();
  }
});

/* ===================== Tap-and-hold / click-and-drag to reorder ===================== */
// Pointer Events unify touch and mouse under one API, so the same code
// handles both "tap and hold" on a phone and click-and-drag with a mouse -
// no separate touchstart/mousedown handling needed. A short hold threshold
// distinguishes a drag from a normal tap/scroll that merely started on a
// tile; moving too far before the hold fires cancels it outright (a real
// scroll gesture, not a drag attempt).
const REORDER_HOLD_MS = 450;
const REORDER_CANCEL_PX = 10;
let reorderState = null; // { pointerId, tileEl, categoryId, startX, startY, holdTimer, dragging }

function reorderTileEl(categoryId) {
  return document.querySelector(`.category-tile[data-category="${categoryId}"]`);
}

function endReorderHold() {
  if (reorderState && reorderState.holdTimer) clearTimeout(reorderState.holdTimer);
  if (reorderState && reorderState.dragging) {
    const el = reorderTileEl(reorderState.categoryId);
    if (el) { el.classList.remove('dragging'); el.style.touchAction = ''; }
  }
  reorderState = null;
}

document.getElementById('categoriesContainer').addEventListener('pointerdown', (e) => {
  if (rearrangeMode) return; // the explicit ‹/› buttons own reordering while this is on
  if (e.target.closest('button[data-action="delete-category"]')) return;
  const tile = e.target.closest('.category-tile');
  if (!tile) return;
  const categoryId = tile.dataset.category;
  reorderState = { pointerId: e.pointerId, categoryId, startX: e.clientX, startY: e.clientY, dragging: false, holdTimer: null };
  reorderState.holdTimer = setTimeout(() => {
    if (!reorderState) return;
    reorderState.dragging = true;
    const el = reorderTileEl(categoryId);
    if (el) {
      el.classList.add('dragging');
      el.style.touchAction = 'none'; // only suppress the browser's own scroll/zoom once a drag actually starts
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (e2) { /* already released, e.g. a fast tap-cancel */ } }
    }
  }, REORDER_HOLD_MS);
});

document.getElementById('categoriesContainer').addEventListener('pointermove', (e) => {
  if (!reorderState || reorderState.pointerId !== e.pointerId) return;
  if (!reorderState.dragging) {
    const dx = e.clientX - reorderState.startX;
    const dy = e.clientY - reorderState.startY;
    if (Math.hypot(dx, dy) > REORDER_CANCEL_PX) endReorderHold(); // moved before the hold fired - a scroll/tap, not a drag
    return;
  }
  e.preventDefault();
  const overTile = document.elementFromPoint(e.clientX, e.clientY);
  const targetTile = overTile && overTile.closest && overTile.closest('.category-tile');
  if (!targetTile || targetTile.dataset.category === reorderState.categoryId) return;
  const fromIndex = db.categories.findIndex((c) => c.id === reorderState.categoryId);
  const toIndex = db.categories.findIndex((c) => c.id === targetTile.dataset.category);
  if (fromIndex === -1 || toIndex === -1) return;
  reorderCategory(fromIndex, toIndex);
  render();
  const el = reorderTileEl(reorderState.categoryId);
  if (el) { el.classList.add('dragging'); el.style.touchAction = 'none'; }
});

// A drag that just finished shouldn't also fire the tile's own navigation -
// suppressed for exactly the click that follows a real drag, nothing else.
// Reads reorderState's dragging flag BEFORE endReorderHold() clears it -
// both have to happen in this one handler, in this order, since a second
// pointerup listener would otherwise race the first with no guaranteed order.
let justDraggedCategory = false;
document.getElementById('categoriesContainer').addEventListener('pointerup', (e) => {
  const wasDragging = !!(reorderState && reorderState.dragging && reorderState.pointerId === e.pointerId);
  endReorderHold();
  if (wasDragging) {
    justDraggedCategory = true;
    setTimeout(() => { justDraggedCategory = false; }, 0);
  }
});
document.getElementById('categoriesContainer').addEventListener('pointercancel', () => endReorderHold());

document.getElementById('categoriesContainer').addEventListener('click', (e) => {
  if (!justDraggedCategory) return;
  const tile = e.target.closest('.category-tile');
  if (tile) e.preventDefault();
});

/* ===================== Category filter (2026-08-02) =====================
 * Shared by both the 7/11 Audit and Number Nomination boxes below - "a lot
 * of them are songs, I want to toggle between all categories and whatever
 * I choose" - narrows what each scan actually includes, not just what's
 * displayed afterward. Persists across visits like every other EMAX filter. */
const EMAX_CATEGORY_FILTER_KEY = 'numerology_emax_category_filter_v1';

function emaxLoadCategoryFilterIds() {
  try {
    const raw = localStorage.getItem(EMAX_CATEGORY_FILTER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function emaxSaveCategoryFilterIds(ids) {
  try { localStorage.setItem(EMAX_CATEGORY_FILTER_KEY, JSON.stringify(ids)); } catch (e) { /* storage full - just won't persist across visits */ }
}

// No saved selection at all defaults to every current category (starts at
// "all", per your own call). A stored id belonging to a category you've
// since deleted is silently dropped rather than carried along as a phantom
// selection.
function emaxActiveCategoryIds() {
  const allIds = db.categories.map((c) => c.id);
  const stored = emaxLoadCategoryFilterIds();
  if (!stored) return allIds;
  return stored.filter((id) => allIds.includes(id));
}

// What actually gets passed to emax711Audit/emaxNumberNomination as their
// categoryIds argument - collapses "every category is checked" down to
// null (db-core.js's own "no filter at all" signal) rather than the literal
// full id list, so a completely unfiltered run stores categoryIds: null and
// the "across N categories" summary line stays silent, exactly as it read
// before this filter existed. Only a genuine subset (including a
// deliberate "Select None", which is a real empty array, not null) passes
// through as an explicit array.
function emaxCategoryFilterForScan() {
  const active = emaxActiveCategoryIds();
  return active.length === db.categories.length ? null : active;
}

function emaxCategoryFilterItemHtml(cat, checked) {
  return `
    <label class="emax-category-filter-item">
      <input type="checkbox" data-cat-filter="${escapeHtml(cat.id)}"${checked ? ' checked' : ''}>
      <span>${escapeHtml(cat.name)} <span class="emax-category-filter-count">(${cat.entries.length})</span></span>
    </label>`;
}

function emaxRenderCategoryFilterList() {
  const active = new Set(emaxActiveCategoryIds());
  document.getElementById('categoryFilterList').innerHTML = db.categories.length
    ? db.categories.map((cat) => emaxCategoryFilterItemHtml(cat, active.has(cat.id))).join('')
    : '<div class="emax-nomination-empty">No categories yet.</div>';
}

document.getElementById('categoryFilterBody').hidden = true;
document.getElementById('categoryFilterToggle').addEventListener('click', () => {
  const body = document.getElementById('categoryFilterBody');
  body.hidden = !body.hidden;
  document.getElementById('categoryFilterChevron').classList.toggle('open', !body.hidden);
});

document.getElementById('categoryFilterList').addEventListener('change', (e) => {
  const checkbox = e.target.closest('[data-cat-filter]');
  if (!checkbox) return;
  const active = new Set(emaxActiveCategoryIds());
  if (checkbox.checked) active.add(checkbox.dataset.catFilter);
  else active.delete(checkbox.dataset.catFilter);
  emaxSaveCategoryFilterIds([...active]);
});

document.getElementById('categoryFilterSelectAll').addEventListener('click', () => {
  emaxSaveCategoryFilterIds(db.categories.map((c) => c.id));
  emaxRenderCategoryFilterList();
});
document.getElementById('categoryFilterSelectNone').addEventListener('click', () => {
  emaxSaveCategoryFilterIds([]);
  emaxRenderCategoryFilterList();
});

emaxRenderCategoryFilterList();

/* ===================== 7/11 Audit (2026-08-02) ===================== */
// UI-only wrapper around emax711Audit (db-core.js) - the actual scan/tally
// engine is shared with the future master dashboard (task #74), this file
// just renders the button/progress/result and caches the last run so it's
// still there next time you open the page, not lost the moment you leave.
let emaxAuditRunning = false;

function emaxLoadAuditResult() {
  try {
    const raw = localStorage.getItem(EMAX_AUDIT_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function emaxSaveAuditResult(result) {
  try { localStorage.setItem(EMAX_AUDIT_RESULT_KEY, JSON.stringify(result)); } catch (e) { /* storage full - just won't persist across visits */ }
}

// Both rates shown side by side, per your own call - a recorded event
// alone isn't necessarily bad, so "any event" and "negative-tagged event"
// answer two different questions rather than picking one for you. Raw N
// stays visible next to every percentage so a thin sample still reads as
// a thin sample, not a false certainty. Each tile is now a button
// (2026-08-02) - tapping it opens the real entries/years/event text behind
// that percentage (emaxAuditDetailEntries, db-core.js), since a number
// with no examples behind it isn't something you can actually check.
function emaxAuditStatHtml(label, rate, withCount, total, is7or11, tagFilter) {
  const pct = rate == null ? '—' : `${Math.round(rate * 100)}%`;
  return `
    <button type="button" class="emax-audit-stat" data-audit-is7or11="${is7or11}" data-audit-tag="${tagFilter || ''}">
      <div class="emax-audit-stat-label">${escapeHtml(label)}</div>
      <div class="emax-audit-stat-value">${pct}</div>
      <div class="emax-audit-stat-n">${withCount}/${total} years</div>
    </button>`;
}

// "" when the run covered every category (categoryIds === null) - the
// summary line only says anything extra when a subset was actually used,
// so the common case reads exactly as it did before this filter existed.
// A deliberate "Select None" run is a real empty array, not null - called
// out explicitly rather than silently reading as if nothing were filtered.
function emaxCategoryFilterSummaryText(categoryIds) {
  if (categoryIds == null) return '';
  if (!categoryIds.length) return ' across 0 categories (none selected)';
  const names = categoryIds.map((id) => { const c = db.categories.find((x) => x.id === id); return c ? c.name : null; }).filter(Boolean);
  return ` across ${names.length} categor${names.length === 1 ? 'y' : 'ies'} (${names.join(', ')})`;
}

function emaxAuditResultsHtml(result) {
  return `
    <div class="emax-audit-summary">Scanned ${result.entryCount} items${emaxCategoryFilterSummaryText(result.categoryIds)} - last run ${new Date(result.ranAt).toLocaleString()}. Tap a tile to see the real years behind it.</div>
    <div class="emax-audit-grid">
      ${emaxAuditStatHtml('Personal Yr 7/11 - Any Event', result.py7or11AnyEventRate, result.py7or11WithEvent, result.py7or11Total, true, '')}
      ${emaxAuditStatHtml('Other Years - Any Event', result.otherAnyEventRate, result.otherWithEvent, result.otherTotal, false, '')}
      ${emaxAuditStatHtml('Personal Yr 7/11 - Negative Event', result.py7or11NegativeRate, result.py7or11WithNegative, result.py7or11Total, true, 'negative')}
      ${emaxAuditStatHtml('Other Years - Negative Event', result.otherNegativeRate, result.otherWithNegative, result.otherTotal, false, 'negative')}
    </div>`;
}

function emaxRenderAuditResults() {
  const result = emaxLoadAuditResult();
  const btn = document.getElementById('runAuditBtn');
  document.getElementById('auditResults').innerHTML = result ? emaxAuditResultsHtml(result) : '';
  btn.textContent = result ? 'Re-run Audit' : 'Run Audit';
}

async function runEmaxAudit() {
  if (emaxAuditRunning) return;
  const status = document.getElementById('auditStatus');
  if (!emaxActiveCategoryIds().length) {
    status.textContent = 'Select at least one category in "Categories to Include" first.';
    return;
  }
  emaxAuditRunning = true;
  const btn = document.getElementById('runAuditBtn');
  btn.disabled = true;
  // try/finally so a total failure (not just one bad entry - emax711Audit's
  // own loop already tolerates those) still resets the running flag and
  // re-enables the button, instead of freezing the progress line and
  // silently no-opping every future click forever (the "stuck at 293" bug -
  // emax711Audit itself is now hardened per-entry too, this is the second,
  // outer layer of the same fix).
  try {
    const result = await emax711Audit(db, (done, total) => {
      status.textContent = `Scanning ${done}/${total} items...`;
    }, emaxCategoryFilterForScan());
    emaxSaveAuditResult(result);
    emaxRenderAuditResults();
    status.textContent = `Done - scanned ${result.entryCount} items.`;
  } catch (e) {
    console.error('[EMAX Audit] failed', e);
    status.textContent = `Audit failed: ${e.message || 'unknown error'}. Try again.`;
  } finally {
    btn.disabled = false;
    emaxAuditRunning = false;
  }
}

// The HTML's own `hidden` attribute already starts this collapsed (avoids
// a flash of the open box before this script runs) - set it again here too
// so the collapsed state doesn't quietly depend on that markup alone (same
// convention as emax-category.js's addEntryBody).
document.getElementById('auditBody').hidden = true;
document.getElementById('auditToggle').addEventListener('click', () => {
  const body = document.getElementById('auditBody');
  body.hidden = !body.hidden;
  document.getElementById('auditChevron').classList.toggle('open', !body.hidden);
});
document.getElementById('runAuditBtn').addEventListener('click', () => runEmaxAudit());
emaxRenderAuditResults();

/* ===================== Data-led number nomination (2026-08-02) ===================== */
// UI-only wrapper around emaxNumberNomination (db-core.js) - same
// collapsible-box/cache-in-localStorage convention as the 7/11 Audit above,
// the actual scan engine is shared with the future master dashboard.
let emaxNominationRunning = false;

const EMAX_NOMINATION_DIMENSION_LABELS = {
  personalYear: 'Personal Year',
  zodiacRelation: 'Zodiac Year Type',
  lifePath: 'Life Path',
  ownAnimal: 'Birth Animal',
};

const EMAX_NOMINATION_ZODIAC_LABELS = {
  own: 'Own Year',
  trine: 'Trine Year',
  friendly: 'Friendly Year',
  enemy: 'Enemy Year',
  neutral: 'Neutral Year (no zodiac flag)',
};

function emaxNominationKeyLabel(dim, key) {
  if (dim === 'personalYear') return `Personal Year ${key}`;
  if (dim === 'zodiacRelation') return EMAX_NOMINATION_ZODIAC_LABELS[key] || key;
  if (dim === 'lifePath') return `Life Path ${key}`;
  return key;
}

function emaxLoadNominationResult() {
  try {
    const raw = localStorage.getItem(EMAX_NOMINATION_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function emaxSaveNominationResult(result) {
  try { localStorage.setItem(EMAX_NOMINATION_RESULT_KEY, JSON.stringify(result)); } catch (e) { /* storage full - just won't persist across visits */ }
}

// "Person-years" (2026-08-02): the sample-size N is a count of
// (entry x year) instances summed across your whole collection, not
// calendar years - reads as nonsense ("113225 years") without this label.
function emaxNominationSampleLabel(n) {
  return `${n.toLocaleString()} person-year${n === 1 ? '' : 's'}`;
}

// One unified row per candidate (2026-08-02 rework) - a candidate elevated
// on BOTH sides (like Own Year usually is) gets both badges on the SAME
// row instead of appearing twice across two columns with identical,
// unexplained numbers. Tapping the row opens the real entries/years/event
// text behind it (emaxNominationDetailEntries, db-core.js).
function emaxNominationCandidateRowHtml(dim, c) {
  const badges = [];
  if (c.isBearish) badges.push(`<span class="emax-nomination-badge bearish">Bearish ${Math.round(c.negativeRate * 100)}% <span class="emax-nomination-delta">(+${Math.round(c.deltaNegative * 100)}pt)</span></span>`);
  if (c.isBullish) badges.push(`<span class="emax-nomination-badge bullish">Bullish ${Math.round(c.achievementRate * 100)}% <span class="emax-nomination-delta">(+${Math.round(c.deltaAchievement * 100)}pt)</span></span>`);
  const bothNote = (c.isBearish && c.isBullish)
    ? '<div class="emax-nomination-both-note">Sees more activity overall, not specifically good or bad - both directions are elevated.</div>'
    : '';
  return `
    <button type="button" class="emax-nomination-candidate" data-nom-dim="${dim}" data-nom-key="${escapeHtml(c.key)}">
      <div class="emax-nomination-candidate-name">${escapeHtml(emaxNominationKeyLabel(dim, c.key))}</div>
      <div class="emax-nomination-badges">${badges.join('')}</div>
      ${bothNote}
      <div class="emax-nomination-candidate-n">${emaxNominationSampleLabel(c.n)} - avg magnitude ${c.avgMagnitude > 0 ? '+' : ''}${c.avgMagnitude.toFixed(1)}</div>
    </button>`;
}

function emaxNominationDimensionHtml(dim, data) {
  const rowsHtml = data.candidates.length
    ? data.candidates.map((c) => emaxNominationCandidateRowHtml(dim, c)).join('')
    : '<div class="emax-nomination-empty">No standout candidates yet</div>';
  return `
    <div class="emax-nomination-dimension">
      <div class="emax-nomination-dimension-title">${escapeHtml(EMAX_NOMINATION_DIMENSION_LABELS[dim] || dim)}</div>
      ${rowsHtml}
    </div>`;
}

function emaxNominationResultsHtml(result) {
  const dims = ['personalYear', 'zodiacRelation', 'lifePath', 'ownAnimal'];
  return `
    <div class="emax-audit-summary">Scanned ${result.entryCount} items${emaxCategoryFilterSummaryText(result.categoryIds)}, ${emaxNominationSampleLabel(result.totalYearInstances)} total - baseline ${Math.round(result.baselineNegativeRate * 100)}% negative / ${Math.round(result.baselineAchievementRate * 100)}% achievement - last run ${new Date(result.ranAt).toLocaleString()}.</div>
    <div class="emax-nomination-explainer">A "person-year" is one item, one year of its life - the same item can contribute many, summed across your whole collection. Tap a candidate to see the real entries and years behind it.</div>
    ${dims.map((dim) => emaxNominationDimensionHtml(dim, result.dimensions[dim])).join('')}`;
}

function emaxRenderNominationResults() {
  const result = emaxLoadNominationResult();
  const btn = document.getElementById('runNominationBtn');
  document.getElementById('nominationResults').innerHTML = result ? emaxNominationResultsHtml(result) : '';
  btn.textContent = result ? 'Re-run Nomination' : 'Run Nomination';
}

async function runEmaxNomination() {
  if (emaxNominationRunning) return;
  const status = document.getElementById('nominationStatus');
  if (!emaxActiveCategoryIds().length) {
    status.textContent = 'Select at least one category in "Categories to Include" first.';
    return;
  }
  emaxNominationRunning = true;
  const btn = document.getElementById('runNominationBtn');
  btn.disabled = true;
  // Same try/finally hardening as runEmaxAudit above, same "stuck at N"
  // bug class.
  try {
    const result = await emaxNumberNomination(db, (done, total) => {
      status.textContent = `Scanning ${done}/${total} items...`;
    }, emaxCategoryFilterForScan());
    emaxSaveNominationResult(result);
    emaxRenderNominationResults();
    status.textContent = `Done - scanned ${result.entryCount} items.`;
  } catch (e) {
    console.error('[EMAX Nomination] failed', e);
    status.textContent = `Nomination failed: ${e.message || 'unknown error'}. Try again.`;
  } finally {
    btn.disabled = false;
    emaxNominationRunning = false;
  }
}

document.getElementById('nominationBody').hidden = true;
document.getElementById('nominationToggle').addEventListener('click', () => {
  const body = document.getElementById('nominationBody');
  body.hidden = !body.hidden;
  document.getElementById('nominationChevron').classList.toggle('open', !body.hidden);
});
document.getElementById('runNominationBtn').addEventListener('click', () => runEmaxNomination());
emaxRenderNominationResults();

/* ===================== Tap-to-detail modal (2026-08-02) =====================
 * Shared by both the Audit tiles and Nomination candidates - "the actual
 * examples of what happened, and to who" instead of a bare percentage.
 * Only rows that actually have a recorded event are shown (a bucket like
 * Neutral Year can carry well over 100,000 person-years, and the vast
 * majority never had anything found on Wikipedia at all - listing those
 * wouldn't be an "example", just noise), capped so a huge bucket doesn't
 * try to render thousands of rows at once; most-recent-year-first per your
 * own call, which also means the cap keeps the most relevant ones. */
const EMAX_DETAIL_MAX_ROWS = 300;

function emaxDetailRowHtml(e) {
  const tagsHtml = e.tags.length
    ? `<div class="emax-detail-row-tags">${e.tags.map((t) => `<span class="emax-timeline-tag-pill">${escapeHtml(t.charAt(0).toUpperCase() + t.slice(1))}</span>`).join('')}</div>`
    : '';
  const zodiacEmoji = VIETNAMESE_ZODIAC_EMOJI[e.zodiacAnimal] || '';
  const ownEmoji = VIETNAMESE_ZODIAC_EMOJI[e.ownAnimal] || '';
  return `
    <button type="button" class="emax-detail-row" data-detail-open="${escapeHtml(e.entryId)}">
      <div class="emax-detail-row-head">
        <span class="emax-detail-row-name">${escapeHtml(e.entryName)}</span>
        <span class="emax-detail-row-year">${zodiacEmoji} ${e.year}</span>
      </div>
      <div class="emax-detail-row-cat">${escapeHtml(e.categoryName)}</div>
      <div class="emax-detail-row-facts">Born ${e.ownYear} ${ownEmoji} &middot; Personal Year ${e.personalYear} &middot; Life Path ${e.lifePath}</div>
      <div class="emax-detail-row-text">${escapeHtml(e.text)}</div>
      ${tagsHtml}
    </button>`;
}

function openEmaxDetailModal(title, entries) {
  const withEvent = entries.filter((e) => e.text);
  const shown = withEvent.slice(0, EMAX_DETAIL_MAX_ROWS);
  const truncatedNote = shown.length < withEvent.length
    ? ` - showing the most recent ${shown.length}`
    : '';
  document.getElementById('emaxDetailBody').innerHTML = `
    <div class="box-label">${escapeHtml(title)}</div>
    <div class="emax-detail-summary">${withEvent.length.toLocaleString()} of ${entries.length.toLocaleString()} person-years here have a recorded event${truncatedNote}.</div>
    <div class="emax-detail-list">
      ${shown.length ? shown.map(emaxDetailRowHtml).join('') : '<div class="emax-nomination-empty">No recorded events in this group yet.</div>'}
    </div>`;
  document.getElementById('emaxDetailOverlay').classList.add('active');
}

function closeEmaxDetailModal() {
  document.getElementById('emaxDetailOverlay').classList.remove('active');
}

document.getElementById('emaxDetailClose').addEventListener('click', closeEmaxDetailModal);
document.getElementById('emaxDetailOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'emaxDetailOverlay') closeEmaxDetailModal();
});

// Tapping a row opens the real EMAX item popup (emax-popup.js, shared with
// emax-category.html) right on top of this one - "not having to go all the
// way to EMAX category etc, just popup right there" (2026-08-02). Stacks
// visually over emaxDetailOverlay since itemModalOverlay comes later in
// the DOM; closing it returns to this list untouched.
document.getElementById('emaxDetailBody').addEventListener('click', (e) => {
  const row = e.target.closest('[data-detail-open]');
  if (!row) return;
  const entry = emaxFindEntryById(db, row.dataset.detailOpen);
  if (!entry) return;
  const ownerCat = db.categories.find((c) => c.entries.some((en) => en.id === entry.id));
  if (ownerCat) openItemModal(entry, ownerCat.name);
});

// Delegated on the stable results containers (their innerHTML gets
// rebuilt on every render, but the containers themselves never do) - same
// convention already used for the Timeline modal's data-year-save clicks.
document.getElementById('auditResults').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-audit-is7or11]');
  if (!btn) return;
  const is7or11 = btn.dataset.auditIs7or11 === 'true';
  const tagFilter = btn.dataset.auditTag || null;
  // The categories the RUN that produced this tile actually scanned - not
  // necessarily the picker's current live selection, which may have
  // changed since without a re-run.
  const lastResult = emaxLoadAuditResult();
  const entries = emaxAuditDetailEntries(db, is7or11, tagFilter, lastResult && lastResult.categoryIds);
  const title = `${is7or11 ? 'Personal Year 7/11' : 'Other Years'} - ${tagFilter === 'negative' ? 'Negative Events' : 'Any Event'}`;
  openEmaxDetailModal(title, entries);
});

document.getElementById('nominationResults').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-nom-dim]');
  if (!btn) return;
  const dim = btn.dataset.nomDim;
  const key = btn.dataset.nomKey;
  const lastResult = emaxLoadNominationResult();
  const entries = emaxNominationDetailEntries(db, dim, key, lastResult && lastResult.categoryIds);
  openEmaxDetailModal(`${EMAX_NOMINATION_DIMENSION_LABELS[dim] || dim}: ${emaxNominationKeyLabel(dim, key)}`, entries);
});

/* ===================== Reverse Lookup (2026-08-02) ===================== */
// UI-only wrapper around emaxReverseLookup (db-core.js). Unlike the Audit/
// Nomination boxes above, this never caches - a fresh filter selection
// always searches live, since it's pure synchronous arithmetic over
// already-known dates (no network calls) and the result depends entirely
// on whatever was just picked.

// Life Path can genuinely be 2 (reduceNumber has no 2->11 remap - that's
// specific to Personal Year/Day sums); Personal Year can't, since
// emaxPersonalYearForYear explicitly folds a raw 2 into 11.
const EMAX_REVERSE_LOOKUP_LIFE_PATH_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];
const EMAX_REVERSE_LOOKUP_PERSONAL_YEAR_VALUES = [1, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

function reverseLookupOptionsHtml(values, labelFn) {
  return `<option value="">Any</option>${values.map((v) => `<option value="${escapeHtml(String(v))}">${escapeHtml(labelFn ? labelFn(v) : String(v))}</option>`).join('')}`;
}

function reverseLookupFiltersHtml() {
  const rows = [
    `<div class="reverse-lookup-filter"><label for="rlFilterLifePath">Life Path</label><select id="rlFilterLifePath">${reverseLookupOptionsHtml(EMAX_REVERSE_LOOKUP_LIFE_PATH_VALUES)}</select></div>`,
    `<div class="reverse-lookup-filter"><label for="rlFilterPersonalYear">Personal Year (today)</label><select id="rlFilterPersonalYear">${reverseLookupOptionsHtml(EMAX_REVERSE_LOOKUP_PERSONAL_YEAR_VALUES)}</select></div>`,
    `<div class="reverse-lookup-filter"><label for="rlFilterZodiacAnimal">Chinese Zodiac Animal</label><select id="rlFilterZodiacAnimal">${reverseLookupOptionsHtml(VIETNAMESE_KEYS)}</select></div>`,
  ];
  ASTRO_BODIES.forEach((body) => {
    rows.push(`<div class="reverse-lookup-filter"><label for="rlFilterBody_${body.key}">${body.symbol} ${escapeHtml(body.label)} Sign</label><select id="rlFilterBody_${body.key}">${reverseLookupOptionsHtml(ASTRO_ZODIAC_SIGNS)}</select></div>`);
  });
  return rows.join('');
}

function reverseLookupReadFilters() {
  const filters = {};
  const lifePathVal = document.getElementById('rlFilterLifePath').value;
  if (lifePathVal) filters.lifePath = Number(lifePathVal);
  const personalYearVal = document.getElementById('rlFilterPersonalYear').value;
  if (personalYearVal) filters.personalYear = Number(personalYearVal);
  const zodiacVal = document.getElementById('rlFilterZodiacAnimal').value;
  if (zodiacVal) filters.zodiacAnimal = zodiacVal;
  const bodies = {};
  ASTRO_BODIES.forEach((body) => {
    const val = document.getElementById(`rlFilterBody_${body.key}`).value;
    if (val) bodies[body.key] = val;
  });
  if (Object.keys(bodies).length) filters.bodies = bodies;
  return filters;
}

function reverseLookupHasAnyFilter(filters) {
  return filters.lifePath != null || filters.personalYear != null || !!filters.zodiacAnimal || !!(filters.bodies && Object.keys(filters.bodies).length);
}

// Every filter select's id, by exact name rather than a querySelectorAll
// sweep - keeps Clear filters explicit about exactly which controls it
// touches (same convention as this file's other collapsible-state code,
// which sets .hidden in JS too rather than leaning on markup alone).
function reverseLookupSelectIds() {
  return ['rlFilterLifePath', 'rlFilterPersonalYear', 'rlFilterZodiacAnimal', ...ASTRO_BODIES.map((body) => `rlFilterBody_${body.key}`)];
}

function reverseLookupResultRowHtml(result) {
  return `
    <a class="reverse-lookup-result" href="emax-category.html?id=${encodeURIComponent(result.categoryId)}&open=${encodeURIComponent(result.entry.id)}">
      <span class="reverse-lookup-result-name">${escapeHtml(result.entry.name)}</span>
      <span class="reverse-lookup-result-category">${escapeHtml(result.categoryName)}</span>
    </a>`;
}

function runReverseLookup() {
  const filters = reverseLookupReadFilters();
  const resultsEl = document.getElementById('reverseLookupResults');
  if (!reverseLookupHasAnyFilter(filters)) {
    resultsEl.innerHTML = '<div class="emax-nomination-empty">Pick at least one filter - searching with none would just list your whole collection.</div>';
    return;
  }
  const results = emaxReverseLookup(db, filters);
  if (!results.length) {
    resultsEl.innerHTML = '<div class="emax-nomination-empty">No items in your collection match every filter picked.</div>';
    return;
  }
  resultsEl.innerHTML = `
    <div class="emax-audit-summary">${results.length} match${results.length === 1 ? '' : 'es'}.</div>
    <div class="reverse-lookup-results-list">${results.map(reverseLookupResultRowHtml).join('')}</div>`;
}

document.getElementById('reverseLookupFilters').innerHTML = reverseLookupFiltersHtml();
document.getElementById('reverseLookupBody').hidden = true;
document.getElementById('reverseLookupToggle').addEventListener('click', () => {
  const body = document.getElementById('reverseLookupBody');
  body.hidden = !body.hidden;
  document.getElementById('reverseLookupChevron').classList.toggle('open', !body.hidden);
});
document.getElementById('reverseLookupSearchBtn').addEventListener('click', () => runReverseLookup());
document.getElementById('reverseLookupClearBtn').addEventListener('click', () => {
  reverseLookupSelectIds().forEach((id) => { document.getElementById(id).value = ''; });
  document.getElementById('reverseLookupResults').innerHTML = '';
});

/* ===================== Landing search + multi-filter (2026-08-06) ===================== */
// "a search bar where I can search for any of the inputs no matter what"
// + multi-select filters that "clear out the categories and only show
// what I'm looking for". The old Reverse Lookup box (above) stays as-is;
// this is the promoted, front-and-center version: live-as-you-type,
// multiple values per dimension (OR within a dimension, AND across
// dimensions), results replacing the category grid.
//
// Every per-entry value comes from the app's own established functions -
// Life Path buckets are compatLifePathInfo (the same 1/3-9/11/13/22/22-4/
// 28/33/33-6 set the distribution chart already uses), Personal Year is
// emaxPersonalYearForYear + getActiveBirthYear (same as Reverse Lookup),
// PM/PD reduce the same raws Profile shows. Nothing re-derived.
const EMAX_FILTER_TODAY = new Date();
const EMAX_FILTER_NUM_SET = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '22', '28', '33'];
const EMAX_FILTER_DIMS = [
  { key: 'lifePath', label: 'Lifepath', values: ['1', '3', '4', '5', '6', '7', '8', '9', '11', '13', '22', '22/4', '28', '33', '33/6'], get: (d) => lifePathDisplayText(compatLifePathInfo(d).display) },
  { key: 'energy', label: 'Secondary Energy', values: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '22', '28'], get: (d) => String(getReducedDay(d)) },
  { key: 'dayNum', label: 'Day#', values: EMAX_FILTER_NUM_SET, get: (d) => String(getReducedDayOfYear(d)) },
  { key: 'py', label: 'Personal Year', values: ['1', '3', '4', '5', '6', '7', '8', '9', '11', '22', '33'], get: (d) => String(emaxPersonalYearForYear(d, getActiveBirthYear(d, EMAX_FILTER_TODAY))) },
  { key: 'pm', label: 'Personal Month', values: EMAX_FILTER_NUM_SET, get: (d) => String(reduceNumber(getPersonalMonthRaw(d, EMAX_FILTER_TODAY))) },
  { key: 'pd', label: 'Personal Day', values: EMAX_FILTER_NUM_SET, get: (d) => String(reduceNumber(getPersonalDayRaw(reduceNumber(getPersonalMonthRaw(d, EMAX_FILTER_TODAY)), EMAX_FILTER_TODAY))) },
  { key: 'chYear', label: 'Chinese Year', values: VIETNAMESE_KEYS, get: (d) => getChineseZodiacYear(d) },
  { key: 'chMonth', label: 'Chinese Month', values: VIETNAMESE_KEYS, get: (d) => getChineseMonth(d) },
  { key: 'chDay', label: 'Chinese Day', values: VIETNAMESE_KEYS, get: (d) => getChineseDaySign(d) },
].concat(ASTRO_BODIES.map((b) => ({
  key: 'body_' + b.key, label: `${b.symbol} ${b.label}`, values: ASTRO_ZODIAC_SIGNS, planet: true,
  get: (d) => getAstroBodyInfo(b.key, d).sign,
})));

let emaxSearchQuery = '';
const emaxFilterSel = {}; // dimKey -> Set of selected value strings

// Per-dimension memo (entry.id -> value). Values are pure functions of the
// entry's date (plus a today fixed at page load for PY/PM/PD), so caching
// per session is safe - matters for the planet dimensions, whose astro
// math over a few thousand entries would otherwise rerun on every chip
// toggle and keystroke.
const emaxFilterMemo = {};
function emaxFilterValueFor(dim, entry) {
  let m = emaxFilterMemo[dim.key];
  if (!m) m = emaxFilterMemo[dim.key] = new Map();
  if (m.has(entry.id)) return m.get(entry.id);
  let v = null;
  try { v = dim.get(parseDateStr(entry.date)); } catch (e) { v = null; }
  m.set(entry.id, v);
  return v;
}

function emaxActiveFilterDims() {
  return EMAX_FILTER_DIMS.filter((dim) => emaxFilterSel[dim.key] && emaxFilterSel[dim.key].size);
}

// Search matches names AND dates - the ISO form the entry stores
// (1987-10-19), the US form the rest of the app displays (10/19/1987),
// or a bare year (works for year-only entries too).
function emaxEntryMatchesQuery(entry, q) {
  if (entry.name.toLowerCase().includes(q)) return true;
  if (entry.date) {
    if (entry.date.includes(q)) return true;
    const parts = entry.date.split('-');
    if (parts.length === 3 && `${parts[1]}/${parts[2]}/${parts[0]}`.includes(q)) return true;
  }
  if (entry.year != null && String(entry.year).includes(q)) return true;
  return false;
}

// Filters need a full date (same year-only exclusion precedent as Reverse
// Lookup - a bare year can't give a Life Path or a planet sign, and this
// app never fabricates the missing month/day). Dimensions check in
// cheap-first order (numerology arithmetic, then zodiac tables, then the
// astro engine) with short-circuit fails, so the expensive planet math
// only ever runs on entries that survived everything cheaper.
function emaxEntryMatchesFilters(entry, activeDims) {
  if (!entry.date) return false;
  for (let i = 0; i < activeDims.length; i++) {
    const dim = activeDims[i];
    const v = emaxFilterValueFor(dim, entry);
    if (v == null || !emaxFilterSel[dim.key].has(String(v))) return false;
  }
  return true;
}

function emaxRunSearchFilter() {
  const q = emaxSearchQuery.trim().toLowerCase();
  const activeDims = emaxActiveFilterDims();
  const active = q.length > 0 || activeDims.length > 0;

  const resultsEl = document.getElementById('emaxSearchResults');
  const gridEl = document.getElementById('categoriesContainer');
  resultsEl.hidden = !active;
  gridEl.style.display = active ? 'none' : '';

  const btn = document.getElementById('emaxFilterToggleBtn');
  const activeCount = activeDims.reduce((s, dim) => s + emaxFilterSel[dim.key].size, 0);
  btn.textContent = activeCount ? `⚙ Filters (${activeCount})` : '⚙ Filters';

  if (!active) { resultsEl.innerHTML = ''; return; }

  const results = [];
  db.categories.forEach((cat) => {
    cat.entries.forEach((entry) => {
      if (q && !emaxEntryMatchesQuery(entry, q)) return;
      if (activeDims.length && !emaxEntryMatchesFilters(entry, activeDims)) return;
      results.push({ entry, cat });
    });
  });

  const rowHtml = (r) => {
    const dateStr = r.entry.date
      ? (() => { const p = r.entry.date.split('-'); return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : r.entry.date; })()
      : (r.entry.year != null ? String(r.entry.year) : '');
    return `
      <button type="button" class="emax-search-row" data-open-entry="${escapeHtml(r.entry.id)}">
        <span class="emax-search-row-name">${escapeHtml(r.entry.name)}</span>
        <span class="emax-search-row-meta">${escapeHtml(r.cat.name)}${dateStr ? ' · ' + dateStr : ''}</span>
      </button>`;
  };
  resultsEl.innerHTML = `
    <div class="emax-audit-summary">${results.length} match${results.length === 1 ? '' : 'es'} across your whole collection.</div>
    <div class="emax-search-results-list">${results.map(rowHtml).join('') || '<div class="emax-nomination-empty">Nothing matches - loosen the search or filters.</div>'}</div>`;
}

function emaxFilterPanelHtml() {
  const groupHtml = (dim) => `
    <div class="emax-filter-group" data-filter-group="${dim.key}">
      <div class="emax-filter-group-label">${dim.label}</div>
      <div class="emax-filter-chips">
        ${dim.values.map((v) => `<button type="button" class="emax-f-chip" data-dim="${dim.key}" data-val="${escapeHtml(String(v))}">${escapeHtml(String(v))}</button>`).join('')}
      </div>
    </div>`;
  const core = EMAX_FILTER_DIMS.filter((d) => !d.planet).map(groupHtml).join('');
  const planets = EMAX_FILTER_DIMS.filter((d) => d.planet).map(groupHtml).join('');
  return `
    <div class="emax-filter-actions">
      <button type="button" class="btn-link" id="emaxFilterClearBtn">Clear all filters</button>
    </div>
    ${core}
    <button type="button" class="emax-filter-planets-toggle" id="emaxFilterPlanetsToggle">🪐 Planet signs <span id="emaxFilterPlanetsChevron">▸</span></button>
    <div id="emaxFilterPlanets" hidden>${planets}</div>`;
}

document.getElementById('emaxFilterPanel').innerHTML = emaxFilterPanelHtml();

document.getElementById('emaxFilterToggleBtn').addEventListener('click', () => {
  const panel = document.getElementById('emaxFilterPanel');
  panel.hidden = !panel.hidden;
});

document.getElementById('emaxFilterPlanetsToggle').addEventListener('click', () => {
  const el = document.getElementById('emaxFilterPlanets');
  el.hidden = !el.hidden;
  document.getElementById('emaxFilterPlanetsChevron').textContent = el.hidden ? '▸' : '▾';
});

document.getElementById('emaxFilterPanel').addEventListener('click', (e) => {
  const chip = e.target.closest('.emax-f-chip');
  if (chip) {
    const { dim, val } = chip.dataset;
    if (!emaxFilterSel[dim]) emaxFilterSel[dim] = new Set();
    if (emaxFilterSel[dim].has(val)) { emaxFilterSel[dim].delete(val); chip.classList.remove('on'); }
    else { emaxFilterSel[dim].add(val); chip.classList.add('on'); }
    emaxRunSearchFilter();
    return;
  }
  if (e.target.id === 'emaxFilterClearBtn') {
    Object.keys(emaxFilterSel).forEach((k) => emaxFilterSel[k].clear());
    document.querySelectorAll('#emaxFilterPanel .emax-f-chip.on').forEach((c) => c.classList.remove('on'));
    emaxRunSearchFilter();
  }
});

let emaxSearchDebounce = null;
document.getElementById('emaxSearchInput').addEventListener('input', (e) => {
  emaxSearchQuery = e.target.value;
  clearTimeout(emaxSearchDebounce);
  emaxSearchDebounce = setTimeout(emaxRunSearchFilter, 120);
});

// Tapping a result opens the shared item popup right here - same pattern
// as the Audit/Nomination detail rows above, no category-page navigation.
document.getElementById('emaxSearchResults').addEventListener('click', (e) => {
  const row = e.target.closest('[data-open-entry]');
  if (!row) return;
  const entry = emaxFindEntryById(db, row.dataset.openEntry);
  if (!entry) return;
  const ownerCat = db.categories.find((c) => c.entries.some((en) => en.id === entry.id));
  if (ownerCat) openItemModal(entry, ownerCat.name);
});

/* ===================== Clean Up Garbled Events (2026-08-02) =====================
 * UI-only wrapper around emaxCleanAndRescanGarbled (db-core.js) - real user
 * report, with a screenshot, that already-scraped entries kept showing raw
 * wikitext after the extractor fix landed, since that fix only changes
 * what a FUTURE scrape returns. Not cached across visits like Audit/
 * Nomination - this is a one-off maintenance action, not something you'd
 * re-run repeatedly once your collection is clean.
 */
let emaxCleanupRunning = false;

async function runEmaxCleanup() {
  if (emaxCleanupRunning) return;
  emaxCleanupRunning = true;
  const btn = document.getElementById('runCleanupBtn');
  const status = document.getElementById('cleanupStatus');
  const results = document.getElementById('cleanupResults');
  btn.disabled = true;
  results.innerHTML = '';
  try {
    const found = emaxFindGarbledEntries(db);
    if (!found.garbled.length && !found.skippedWithManualNotes.length) {
      status.textContent = 'No garbled events found - your collection is clean.';
      return;
    }
    if (!found.garbled.length) {
      status.textContent = `Found ${found.skippedWithManualNotes.length} garbled item(s), but all have a manual note mixed in - skipped automatically. Fix those yourself via their Timeline popup.`;
      return;
    }
    const outcome = await emaxCleanAndRescanGarbled(db, (done, total) => {
      status.textContent = `Re-scanning ${done}/${total} garbled items...`;
    });
    status.textContent = `Done - re-scraped ${outcome.rescannedCount} item${outcome.rescannedCount === 1 ? '' : 's'}.`;
    if (outcome.skippedCount) {
      results.innerHTML = `<div class="emax-audit-summary">${outcome.skippedCount} item${outcome.skippedCount === 1 ? '' : 's'} skipped (manual note mixed in - fix by hand): ${escapeHtml(outcome.skippedNames.join(', '))}</div>`;
    }
  } catch (e) {
    console.error('[EMAX Cleanup] failed', e);
    status.textContent = `Cleanup failed: ${e.message || 'unknown error'}. Try again.`;
  } finally {
    btn.disabled = false;
    emaxCleanupRunning = false;
  }
}

document.getElementById('cleanupBody').hidden = true;
document.getElementById('cleanupToggle').addEventListener('click', () => {
  const body = document.getElementById('cleanupBody');
  body.hidden = !body.hidden;
  document.getElementById('cleanupChevron').classList.toggle('open', !body.hidden);
});
document.getElementById('runCleanupBtn').addEventListener('click', () => runEmaxCleanup());

render();

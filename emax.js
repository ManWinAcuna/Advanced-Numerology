let db = loadEmaxDB();

// Seeds any starter category name not yet offered to this account -
// EMAX_SEEN_STARTERS_KEY tracks that regardless of whether you kept or
// deleted it, so nothing is ever resurrected, but a category added to the
// app AFTER you'd already been using EMAX (Anime/Shows/Songs, added well
// after the original 6) still reaches your existing database instead of
// only ever showing up for a brand-new install.
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
    render();
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

function emaxAuditResultsHtml(result) {
  return `
    <div class="emax-audit-summary">Scanned ${result.entryCount} items - last run ${new Date(result.ranAt).toLocaleString()}. Tap a tile to see the real years behind it.</div>
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
  emaxAuditRunning = true;
  const btn = document.getElementById('runAuditBtn');
  const status = document.getElementById('auditStatus');
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
    });
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
    <div class="emax-audit-summary">Scanned ${result.entryCount} items, ${emaxNominationSampleLabel(result.totalYearInstances)} total - baseline ${Math.round(result.baselineNegativeRate * 100)}% negative / ${Math.round(result.baselineAchievementRate * 100)}% achievement - last run ${new Date(result.ranAt).toLocaleString()}.</div>
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
  emaxNominationRunning = true;
  const btn = document.getElementById('runNominationBtn');
  const status = document.getElementById('nominationStatus');
  btn.disabled = true;
  // Same try/finally hardening as runEmaxAudit above, same "stuck at N"
  // bug class.
  try {
    const result = await emaxNumberNomination(db, (done, total) => {
      status.textContent = `Scanning ${done}/${total} items...`;
    });
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
    <div class="emax-detail-row">
      <div class="emax-detail-row-head">
        <span class="emax-detail-row-name">${escapeHtml(e.entryName)}</span>
        <span class="emax-detail-row-year">${zodiacEmoji} ${e.year}</span>
      </div>
      <div class="emax-detail-row-cat">${escapeHtml(e.categoryName)}</div>
      <div class="emax-detail-row-facts">Born ${e.ownYear} ${ownEmoji} &middot; Personal Year ${e.personalYear} &middot; Life Path ${e.lifePath}</div>
      <div class="emax-detail-row-text">${escapeHtml(e.text)}</div>
      ${tagsHtml}
    </div>`;
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

// Delegated on the stable results containers (their innerHTML gets
// rebuilt on every render, but the containers themselves never do) - same
// convention already used for the Timeline modal's data-year-save clicks.
document.getElementById('auditResults').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-audit-is7or11]');
  if (!btn) return;
  const is7or11 = btn.dataset.auditIs7or11 === 'true';
  const tagFilter = btn.dataset.auditTag || null;
  const entries = emaxAuditDetailEntries(db, is7or11, tagFilter);
  const title = `${is7or11 ? 'Personal Year 7/11' : 'Other Years'} - ${tagFilter === 'negative' ? 'Negative Events' : 'Any Event'}`;
  openEmaxDetailModal(title, entries);
});

document.getElementById('nominationResults').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-nom-dim]');
  if (!btn) return;
  const dim = btn.dataset.nomDim;
  const key = btn.dataset.nomKey;
  const entries = emaxNominationDetailEntries(db, dim, key);
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

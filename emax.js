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

function render() {
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '';

  if (db.categories.length === 0) {
    container.className = '';
    container.innerHTML = '<div class="empty-state">No categories yet. Add one above to get started.</div>';
    return;
  }

  container.className = 'category-grid';

  db.categories.forEach((cat) => {
    const count = cat.entries.length;
    const tile = document.createElement('a');
    tile.className = 'category-tile';
    tile.href = `emax-category.html?id=${cat.id}`;
    tile.dataset.category = cat.id;
    tile.innerHTML = `
      <button class="icon-btn tile-delete" data-action="delete-category" data-category="${cat.id}" title="Delete category">&times;</button>
      <div class="tile-icon">${pickCategoryEmoji(cat.name)}</div>
      <div class="tile-name">${escapeHtml(cat.name)}</div>
      <div class="tile-count">${count} item${count === 1 ? '' : 's'}</div>
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

document.getElementById('categoriesContainer').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="delete-category"]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const categoryId = btn.dataset.category;
  const cat = db.categories.find((c) => c.id === categoryId);
  const label = cat ? cat.name : 'this category';
  if (confirm(`Delete "${label}" and everything in it?`)) deleteCategory(categoryId);
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

render();

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

render();

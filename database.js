let db = loadDB();

function addCategory(name) {
  name = name.trim();
  if (!name) return;
  db.categories.push({ id: uid(), name, entries: [] });
  saveDBState(db);
  render();
}

function deleteCategory(categoryId) {
  db.categories = db.categories.filter((c) => c.id !== categoryId);
  saveDBState(db);
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
    tile.href = `category.html?id=${cat.id}`;
    tile.innerHTML = `
      <button class="icon-btn tile-delete" data-action="delete-category" data-category="${cat.id}" title="Delete category">&times;</button>
      <div class="tile-icon">${pickCategoryEmoji(cat.name)}</div>
      <div class="tile-name">${escapeHtml(cat.name)}</div>
      <div class="tile-count">${count} birthday${count === 1 ? '' : 's'}</div>
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
  if (confirm(`Delete "${label}" and all its birthdays?`)) deleteCategory(categoryId);
});

render();

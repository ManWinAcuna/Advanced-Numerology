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
// The specific date TYPE ("founded", "opened", ...) a successful "Look up"
// resolved to - db-core.js's lookups can now match more than one Wikidata
// property per category kind (e.g. a brand's official-opening date when its
// inception has no exact day), so the popup needs to remember which one
// actually matched THIS entry rather than always assuming the category's
// default kind. Same lifecycle as pendingWikiTitle - cleared on hand-edit.
let pendingDateKind = null;
// Categories with a linked-person config (EMAX_LINKED_PERSON_CONFIG - Songs'
// artist, Video Games' director): the QID a successful "Look up" resolved
// that person to - lets "+ Add to Database" (in the popup) skip straight to
// fetchKeyDate instead of a name re-search. The person's NAME itself is the
// visible #newEntryArtist field, not a hidden var - "Look up" fills it in,
// but it's always user-editable/typeable, since the lookup doesn't resolve
// for every item and there was previously no way to attach one by hand at
// all. Same cleared-on-hand-edit lifecycle as pendingWikiTitle/pendingDateKind.
let pendingArtistQid = null;
// Guards a lookup response against a newer one that started after it (e.g.
// fixing a typo and re-clicking Look Up before the first request lands).
let lookupToken = 0;

// The filter drawer's controls - each null/''/'any' means that particular
// filter isn't active. All of them combine (AND, not OR) in renderEntries()
// below; none of them touch sorting or anything else on the page.
let scoreFilterValue = null;
let scoreFilterMode = 'over';
let starFilterValue = null; // 1-5, or null = off
let starFilterMode = 'atLeast'; // 'atLeast' | 'exactly'
// Mutually exclusive with starFilterValue (a numeric floor/exact rating and
// "has no rating at all" can't both be true at once) - lets you find
// exactly the items you haven't gotten around to rating yet.
let unratedOnly = false;
let pictureFilterMode = 'any'; // 'any' | 'has' | 'none'
let searchQuery = '';

// Pagination (added 2026-08-01) - a category can run into the hundreds of
// items (Artists/Movies/Songs all do), and rendering + lazy-image-fetching
// all of them on one endless-scroll page at once was the actual complaint.
// EMAX_PAGE_WINDOW is how many page-number buttons show at once - beyond
// that, the </ > arrows jump a whole window at a time rather than one page,
// so "page 47 of 80" is still just a couple of clicks away.
const EMAX_PAGE_SIZE = 30;
const EMAX_PAGE_WINDOW = 5;
let emaxCurrentPage = 1;

// EMAX_IMAGE_CACHE_KEY/emaxImageCache, EMAX_LINKED_PERSON_CONFIG, and
// EMAX_YOUTUBE_CONFIG all moved to emax-popup.js (2026-08-02, shared with
// emax.html's item popup) - still globals by the time this file's init()
// runs, since that script loads first.

if (!category) {
  document.querySelector('.db-page').innerHTML = '<div class="empty-state">Category not found. <a href="emax.html">Back to categories</a></div>';
} else {
  document.getElementById('categoryTitle').textContent = `${pickCategoryEmoji(category.name)} ${category.name}`;
  document.title = category.name + ' - EMAX';
  init();
}

/* ===================== Entries CRUD ===================== */

// linkedPersonName/linkedPersonQid: only meaningful for a category with an
// EMAX_LINKED_PERSON_CONFIG entry (Songs' artist, Video Games' director) -
// stored under that category's own field prefix (entry.artistName for
// Songs, entry.directorName for Video Games) so existing Songs data keeps
// working under its already-shipped literal field names unchanged.
function addEntry(name, date, imageUrl, wikiTitle, noImage, dateKind, linkedPersonName, linkedPersonQid) {
  name = name.trim();
  if (!name || !date) return;
  const entry = { id: uid(), name, date };
  if (imageUrl) entry.imageUrl = imageUrl;
  if (wikiTitle) entry.wikiTitle = wikiTitle;
  if (noImage) entry.noImage = true;
  if (dateKind) entry.dateKind = dateKind;
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  if (linkedPersonCfg && linkedPersonName) {
    entry[linkedPersonCfg.field + 'Name'] = linkedPersonName;
    entry[linkedPersonCfg.field + 'Qid'] = linkedPersonQid;
  }
  category.entries.push(entry);
  saveEmaxDB(db);
  renderEntries();
}

function updateEntry(entryId, name, date, imageUrl, wikiTitle, noImage, dateKind, linkedPersonName, linkedPersonQid) {
  name = name.trim();
  if (!name || !date) return;
  const entry = category.entries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.name = name;
  entry.date = date;
  delete entry.year; // a real date supersedes any year-only value
  if (imageUrl) entry.imageUrl = imageUrl; else delete entry.imageUrl;
  if (wikiTitle) entry.wikiTitle = wikiTitle; else delete entry.wikiTitle;
  // The "remove picture" override (in case the auto-fetch got the wrong
  // one) - when set, both the list row and the popup always show the
  // monogram, skipping the fetch (and any manual imageUrl) entirely.
  if (noImage) entry.noImage = true; else delete entry.noImage;
  if (dateKind) entry.dateKind = dateKind; else delete entry.dateKind;
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  if (linkedPersonCfg) {
    if (linkedPersonName) {
      entry[linkedPersonCfg.field + 'Name'] = linkedPersonName;
      entry[linkedPersonCfg.field + 'Qid'] = linkedPersonQid;
    } else {
      delete entry[linkedPersonCfg.field + 'Name'];
      delete entry[linkedPersonCfg.field + 'Qid'];
    }
  }
  saveEmaxDB(db);
  renderEntries();
}

function deleteEntry(entryId) {
  category.entries = category.entries.filter((e) => e.id !== entryId);
  saveEmaxDB(db);
  renderEntries();
}

// Clicking the star already showing your current rating clears it back to
// setRating, emaxFetchImage, emaxMonogram, starsHtml, emaxAdjustedCompatibility,
// and emaxRewriteBonusNotes all moved to emax-popup.js (2026-08-02) - see
// that file for each. scoredEntries below now passes category.name to
// emaxAdjustedCompatibility explicitly, since that function no longer
// assumes a page-level `category` global exists.

/* ===================== List rendering ===================== */

// { entry, score }[] - score null when there's no profile birthday yet or
// the entry is year-only (can't compute a real compatibility score without
// a full date). Sorted highest-score-first; scoreless entries sort last,
// alphabetically among themselves.
function scoredEntries(meDate) {
  const list = category.entries.map((entry) => {
    if (!meDate || !entry.date) return { entry, score: null };
    const score = emaxAdjustedCompatibility(meDate, parseDateStr(entry.date), category.name).finalScore;
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

// A compact version of the popup's score ring (openItemModal), sized for a
// list row. `null` (no profile birthday yet, or a year-only entry) keeps the
// plain dash - a ring with nothing to show would be misleading.
function emaxRowScoreHtml(score) {
  if (score == null) return '<div class="emax-score dim">&mdash;</div>';
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  return `
    <div class="emax-row-score">
      <svg viewBox="0 0 44 44" class="emax-row-score-ring ${scoreClass(score)}">
        <circle cx="22" cy="22" r="${r}" class="emax-row-score-ring-track"></circle>
        <circle cx="22" cy="22" r="${r}" class="emax-row-score-ring-fill" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset};"></circle>
      </svg>
      <div class="emax-row-score-num">${score}</div>
    </div>`;
}

// Movies/Songs/Shows/Anime/Video Games/Books (their own poster/cover art IS
// their identity) get a portrait poster tile; Artists/YouTubers/Historical
// Figures/Authors and all 5 Brand categories (a face or a logo mark reads
// better as a circle) get a circular avatar tile instead - derived from the
// same EMAX_YEAR_FILTER_KIND already used everywhere else in this file, not
// a second parallel list that could drift out of sync with it. A custom
// category with no known kind defaults to circle (the original universal
// treatment, before this redesign existed).
function emaxTileShapeClass() {
  const kind = EMAX_YEAR_FILTER_KIND[category.name];
  return (kind === 'released' || kind === 'aired' || kind === 'anime') ? 'emax-tile-poster' : 'emax-tile-circle';
}

// emaxIsLogoCategory moved to emax-popup.js (2026-08-02) - still a global
// by the time this file's own list-rendering code below calls it.

// Redesigned 2026-07-31 from a one-row-per-item list into a poster/avatar
// grid (per the user's own brainstormed direction) - Edit/Delete moved into
// the popup for a normal dated tile (nothing to overlay on the art itself),
// but a year-only entry has no popup to open at all (no date to compute
// compatibility from), so it keeps its own small delete corner button and
// tapping it jumps straight into the edit form instead.
function entryRowHtml(entry, score) {
  const shapeCls = emaxTileShapeClass();
  const logoCls = emaxIsLogoCategory(category.name) ? ' logo' : '';

  if (!entry.date && entry.year) {
    return `
      <div class="emax-tile ${shapeCls} dim" data-year-only="${entry.id}">
        <div class="emax-tile-media">
          ${emaxMonogram(entry.name, false)}
          <button class="emax-tile-delete" data-entry-delete="${entry.id}" title="Delete">&times;</button>
        </div>
        <div class="emax-tile-info">
          <div class="emax-tile-name">${escapeHtml(entry.name)}</div>
          <span class="emax-tile-year-badge">${entry.year} · year only</span>
        </div>
      </div>`;
  }

  // The score tier tints the whole tile (border + glow), not just the badge
  // number - per your original "no special top-3 badge, keep it to sort +
  // color" answer, this IS that color, just carried further into the new
  // poster/avatar treatment. A "perfect" (85+) match additionally pulses -
  // per "lean into the luxury/glowing aesthetic further" (2026-07-31).
  const tierCls = score == null ? 'dim' : scoreClass(score);
  const perfectCls = score != null && score >= 85 ? ' perfect' : '';
  return `
    <div class="emax-tile ${shapeCls} ${tierCls}${perfectCls}" data-open="${entry.id}">
      <div class="emax-tile-media${logoCls}">
        <div class="emax-tile-media-img" id="emaxThumb-${entry.id}">${entry.imageUrl && !entry.noImage ? `<img src="${escapeHtml(entry.imageUrl)}" alt="">` : emaxMonogram(entry.name, false)}</div>
        <div class="emax-tile-badge">${emaxRowScoreHtml(score)}</div>
      </div>
      <div class="emax-tile-info">
        <div class="emax-tile-name">${escapeHtml(entry.name)}</div>
        ${starsHtml(entry.id, entry.rating || 0)}
      </div>
    </div>`;
}

// Same auto-fetch (real photo/logo, cached, monogram-fallback) the popup
// already uses, applied to each dated row's small thumbnail too - lazy,
// after the list itself has already painted with monograms, so a big list
// isn't blocked on network round-trips to show up. A manual entry.imageUrl
// is already rendered synchronously above (no fetch needed); entry.noImage
// (the "remove picture" edit option) skips this entirely, monogram stays.
// Categories with a linked-person config only: most items in these
// categories simply have no lead image of their own on Wikipedia (a plain
// 2-letter monogram is the common case, not the exception), so when the
// ITEM's own fetch comes up empty, the linked person's own photo is tried
// next before finally settling for the monogram - a real photo the row can
// actually show beats a blank initials circle either way.
function emaxLoadRowImages(ranked) {
  const isBrandCategory = EMAX_YEAR_FILTER_KIND[category.name] === 'founded';
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  ranked.forEach(({ entry }) => {
    if (!entry.date || entry.noImage || entry.imageUrl) return;
    const title = entry.wikiTitle || entry.name;
    emaxFetchImage(title, isBrandCategory).then((url) => {
      if (url) {
        const thumbEl = document.getElementById(`emaxThumb-${entry.id}`);
        if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
        return;
      }
      emaxLinkedPersonImageUrl(entry, linkedPersonCfg).then((personUrl) => {
        if (!personUrl) return;
        const thumbEl = document.getElementById(`emaxThumb-${entry.id}`);
        if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(personUrl)}" alt="">`;
      });
    });
  });
}

// Matches the item's own name OR (when this category has a linked-person
// config - Songs' artist, Video Games' director, Books' author) that
// person's name too - typing "Freddie" finds a song whose listed artist is
// Freddie Mercury, not just an item literally named Freddie.
function emaxEntryMatchesSearch(entry, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (entry.name.toLowerCase().includes(q)) return true;
  const cfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  const personName = cfg && entry[cfg.field + 'Name'];
  return !!(personName && personName.toLowerCase().includes(q));
}

// "Has picture" reflects whatever's ACTUALLY on screen right now, not just
// entry.imageUrl (only ever set for a manually-typed image URL) - most
// pictures come from emaxFetchImage's own lazy, cached fetch (emaxImageCache,
// keyed by wikiTitle/name), which this reads directly. A year-only entry
// never attempts a fetch at all, so it's always "no picture". An entry whose
// fetch hasn't resolved YET reads as "no picture" until it does - the same
// monogram-until-loaded state already visible in the row itself.
function emaxEntryHasPicture(entry) {
  if (entry.noImage) return false;
  if (entry.imageUrl) return true;
  if (!entry.date) return false;
  return !!emaxImageCache[entry.wikiTitle || entry.name];
}

function emaxEntryMatchesStars(entry, mode, minStars, wantUnrated) {
  if (wantUnrated) return !entry.rating;
  if (minStars == null) return true;
  const rating = entry.rating || 0;
  return mode === 'exactly' ? rating === minStars : rating >= minStars;
}

function emaxAnyFilterActive() {
  return !!searchQuery || scoreFilterValue != null || starFilterValue != null || unratedOnly || pictureFilterMode !== 'any';
}
function emaxUpdateFilterClearVisibility() {
  const active = emaxAnyFilterActive();
  document.getElementById('emaxFilterClearBtn').style.display = active ? '' : 'none';
  document.getElementById('emaxFiltersToggleBtn').classList.toggle('has-active', active);
}
function emaxRenderStarFilterPicker() {
  document.querySelectorAll('#emaxStarFilterPicker .emax-star').forEach((btn) => {
    btn.classList.toggle('filled', starFilterValue != null && Number(btn.dataset.star) <= starFilterValue);
  });
  const unratedBtn = document.getElementById('emaxUnratedFilterBtn');
  if (unratedBtn) unratedBtn.classList.toggle('active', unratedOnly);
}
// Clicking the currently-active star again turns the filter off - the same
// "click again to reset" pattern as most star-picker UIs. Kept as its own
// pure-ish state-update function (like reorderCategory/swapCategories on the
// landing page) rather than inline in the click listener, so the toggle
// logic itself is directly testable without a real click event.
function emaxToggleStarFilter(n) {
  starFilterValue = starFilterValue === n ? null : n;
  if (starFilterValue != null) unratedOnly = false; // mutually exclusive - see unratedOnly's own comment
  emaxRenderStarFilterPicker();
  emaxUpdateFilterClearVisibility();
}
// "Unrated only" - added 2026-08-01 so items you haven't gotten to yet are
// actually findable, not just invisible among everything else.
function emaxToggleUnratedFilter() {
  unratedOnly = !unratedOnly;
  if (unratedOnly) starFilterValue = null; // mutually exclusive - see unratedOnly's own comment
  emaxRenderStarFilterPicker();
  emaxUpdateFilterClearVisibility();
}
function emaxClearAllFilters() {
  searchQuery = '';
  scoreFilterValue = null;
  starFilterValue = null;
  unratedOnly = false;
  pictureFilterMode = 'any';
  emaxRenderStarFilterPicker();
  emaxSetToggleGroupActive('emaxPictureToggle', 'any');
  emaxUpdateFilterClearVisibility();
}

// Shared by all three segmented toggle-pill groups (Score's Over/Under,
// Stars' At least/Exactly, Picture's Any/Has/None) - replaces the old
// <select onchange> handling with the same "set state, reflect it visually"
// split as the star picker above, for the same reason (directly testable
// without a real click event).
function emaxSetToggleGroupActive(groupId, value) {
  document.querySelectorAll(`#${groupId} button`).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}
function emaxSetScoreMode(mode) {
  scoreFilterMode = mode;
  emaxSetToggleGroupActive('emaxScoreModeToggle', mode);
  if (scoreFilterValue != null) { emaxCurrentPage = 1; renderEntries(); }
}
function emaxSetStarMode(mode) {
  starFilterMode = mode;
  emaxSetToggleGroupActive('emaxStarModeToggle', mode);
  if (starFilterValue != null) { emaxCurrentPage = 1; renderEntries(); }
}
function emaxSetPictureMode(mode) {
  pictureFilterMode = mode;
  emaxSetToggleGroupActive('emaxPictureToggle', mode);
  emaxUpdateFilterClearVisibility();
  emaxCurrentPage = 1;
  renderEntries();
}

// Numbered page buttons, EMAX_PAGE_WINDOW at a time - beyond that window
// the </ > arrows jump the whole window (not just one page) in either
// direction, landing on the first/last page of the newly-revealed window
// so the click itself is immediately useful, not just a reveal.
function emaxPaginationHtml(totalPages) {
  if (totalPages <= 1) return '';
  const windowStart = Math.floor((emaxCurrentPage - 1) / EMAX_PAGE_WINDOW) * EMAX_PAGE_WINDOW + 1;
  const windowEnd = Math.min(windowStart + EMAX_PAGE_WINDOW - 1, totalPages);
  let html = '<div class="emax-pagination">';
  if (windowStart > 1) html += `<button type="button" class="emax-page-arrow" data-page="${windowStart - 1}">&lsaquo;</button>`;
  for (let p = windowStart; p <= windowEnd; p++) {
    html += `<button type="button" class="emax-page-num${p === emaxCurrentPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
  }
  if (windowEnd < totalPages) html += `<button type="button" class="emax-page-arrow" data-page="${windowEnd + 1}">&rsaquo;</button>`;
  html += '</div>';
  return html;
}

function renderEntries() {
  const container = document.getElementById('entriesContainer');

  if (category.entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No items yet. Add one above.</div>';
    document.getElementById('emaxPagination').innerHTML = '';
    return;
  }

  const profile = loadProfile();
  const meDate = (profile && profile.date) ? parseDateStr(profile.date) : null;
  const noteHtml = meDate ? '' : '<div class="emax-note">Set your birthday on <a href="profile.html">My Profile</a> to see compatibility scores.</div>';
  const ranked = scoredEntries(meDate);

  // A score filter excludes anything that doesn't HAVE a score yet
  // (year-only entries, or no profile birthday set) - "over 80" can't
  // meaningfully include an item with no score to compare. The other
  // filters (search/stars/picture) apply to every entry regardless of
  // whether it has a score.
  const anyFilterActive = emaxAnyFilterActive();
  const visible = !anyFilterActive ? ranked : ranked.filter(({ entry, score }) => {
    if (!emaxEntryMatchesSearch(entry, searchQuery)) return false;
    if (scoreFilterValue != null) {
      if (score == null) return false;
      if (!(scoreFilterMode === 'under' ? score < scoreFilterValue : score > scoreFilterValue)) return false;
    }
    if (!emaxEntryMatchesStars(entry, starFilterMode, starFilterValue, unratedOnly)) return false;
    if (pictureFilterMode !== 'any') {
      const hasPic = emaxEntryHasPicture(entry);
      if (pictureFilterMode === 'has' && !hasPic) return false;
      if (pictureFilterMode === 'none' && hasPic) return false;
    }
    return true;
  });
  const emptyFilterHtml = (anyFilterActive && visible.length === 0)
    ? '<div class="empty-state">No items match this filter.</div>'
    : '';

  const totalPages = Math.max(1, Math.ceil(visible.length / EMAX_PAGE_SIZE));
  if (emaxCurrentPage > totalPages) emaxCurrentPage = totalPages;
  if (emaxCurrentPage < 1) emaxCurrentPage = 1;
  const pageStart = (emaxCurrentPage - 1) * EMAX_PAGE_SIZE;
  const pageEntries = visible.slice(pageStart, pageStart + EMAX_PAGE_SIZE);

  container.innerHTML = noteHtml + emptyFilterHtml + pageEntries.map(({ entry, score }) => entryRowHtml(entry, score)).join('');
  emaxLoadRowImages(pageEntries);
  document.getElementById('emaxPagination').innerHTML = emaxPaginationHtml(totalPages);
}

// EMAX_DATE_KIND_LABEL, emaxFactTile, emaxLinkedPersonBannerHtml,
// emaxLinkedPersonImageUrl, emaxLoadLinkedPersonBannerImage, and
// emaxAddArtistToDatabase all moved to emax-popup.js (2026-08-02), along
// with openItemModal/closeItemModal themselves - see that file.

/* ===================== Timeline mini-popup (2026-08-01) ===================== */
// The pure computation (emaxEnemyZodiacAnimal, emaxTrineZodiacAnimals,
// emaxFriendlyZodiacAnimals, emaxPersonalYearForYear, emaxTimelineYearVerdict,
// emaxBuildTimeline, emaxFetchYearEvents) moved to db-core.js on 2026-08-02
// so the 7/11 audit (emax.js, the EMAX landing page) can reuse the exact
// same engine instead of duplicating it - none of them ever depended on
// this page's own `category`/`db` beyond the ordinary shared-global-scope
// pattern every script in this app already relies on.

function emaxTimelineFindEntryById(entryId) {
  for (const cat of db.categories) {
    const found = cat.entries.find((e) => e.id === entryId);
    if (found) return found;
  }
  return null;
}

// Ordered so the picker and any future tag-frequency listing render
// consistently. "other" has no auto-detection tie in EMAX_TAG_KEYWORDS
// (db-core.js) - a manual-only fallback for whatever doesn't fit the rest.
const EMAX_TIMELINE_TAGS = [
  { key: 'health', label: 'Health', emoji: '🏥' },
  { key: 'career', label: 'Career', emoji: '💼' },
  { key: 'relationship', label: 'Relationship', emoji: '💞' },
  { key: 'financial', label: 'Financial', emoji: '💰' },
  { key: 'achievement', label: 'Achievement', emoji: '🏆' },
  { key: 'loss', label: 'Loss', emoji: '💔' },
  { key: 'other', label: 'Other', emoji: '🔹' },
];
function emaxTagEmoji(key) {
  const tag = EMAX_TIMELINE_TAGS.find((t) => t.key === key);
  return tag ? tag.emoji : '';
}

// Module-level, reset at the top of every openTimelineModal call - only one
// timeline popup is ever open at a time, same convention as
// emaxPreloading/pendingWikiTitle elsewhere in this file.
let emaxTimelineExpandedYear = null;
let emaxTimelineEditingYear = null;
// Which tags are checked in the currently-open edit form - starts from the
// event's own saved tags (or empty for a fresh note), mutated by tag-toggle
// clicks before Save writes it back onto the entry.
let emaxTimelineEditingTags = [];
// Only ever set right before a tag-toggle click re-renders the whole
// timeline body - preserves whatever's typed but not yet saved in the
// textarea, which would otherwise reset back to the stored text on every
// tag click (a real re-render, same "rebuild the whole innerHTML" pattern
// every other piece of UI in this app already uses). Cleared on save/cancel
// and whenever a fresh edit starts.
let emaxTimelineDraftText = null;
let emaxTimelineCurrentEntryId = null;
let emaxTimelineCurrentTimeline = null;

// |magnitude| >= 2 means at least 2 stacked/reinforcing signals landed on
// this one year (e.g. Enemy Year + Personal Year 7 + a confirmed negative
// event) - gets a visibly heavier chip so a severe year doesn't read
// identically to one that's only barely on the bad/good side.
function emaxTimelineChipHtml(year, verdict, tags, magnitude) {
  const expanded = String(year) === String(emaxTimelineExpandedYear);
  const severe = typeof magnitude === 'number' && Math.abs(magnitude) >= 2;
  const tagPrefix = (tags && tags.length) ? tags.map(emaxTagEmoji).join('') + ' ' : '';
  return `<button type="button" class="emax-timeline-chip ${verdict}${expanded ? ' expanded' : ''}${severe ? ' severe' : ''}" data-year="${year}">${tagPrefix}${year}</button>`;
}

function emaxTagPickerHtml() {
  return `<div class="emax-tag-picker">${EMAX_TIMELINE_TAGS.map((t) => `<button type="button" class="emax-tag-chip${emaxTimelineEditingTags.includes(t.key) ? ' active' : ''}" data-tag-toggle="${t.key}">${t.emoji} ${t.label}</button>`).join('')}</div>`;
}

// Plain-English severity line ("Severity: -2 (2 stacked reasons)") - shown
// regardless of whether an event was ever found, since the BASE half of
// magnitude (signal-stacking) is always known immediately; only the event
// bonus half needs a resolved fetch.
function emaxTimelineSeverityLabel(magnitude) {
  if (magnitude > 0) return `+${magnitude} (leans good)`;
  if (magnitude < 0) return `${magnitude} (leans bad)`;
  return '0 (mixed/neutral)';
}

// A year's expand/edit row is rendered once per SECTION it appears in (the
// same year, e.g. 2019, can be both an Own Year and a Personal Year 7 at
// once - see emaxTimelineYearVerdict) - always the same underlying note,
// shown consistently wherever that year is flagged.
function emaxTimelineEventRowHtml(entry, year, magnitude) {
  const ev = entry.timelineEvents && entry.timelineEvents[year];
  const editing = String(year) === String(emaxTimelineEditingYear);
  const severityHtml = typeof magnitude === 'number'
    ? `<div class="emax-timeline-severity">Severity: ${emaxTimelineSeverityLabel(magnitude)}</div>`
    : '';
  if (editing) {
    const current = emaxTimelineDraftText != null ? emaxTimelineDraftText : (ev ? ev.text : '');
    return `
      <div class="emax-timeline-event-row emax-timeline-event-edit">
        <textarea id="emaxTimelineNoteInput" placeholder="What happened this year?">${escapeHtml(current)}</textarea>
        ${emaxTagPickerHtml()}
        <div class="emax-timeline-event-actions">
          <button type="button" class="btn-link" data-year-save="${year}">Save</button>
          <button type="button" class="btn-link" data-year-cancel="${year}">Cancel</button>
        </div>
      </div>`;
  }
  if (ev) {
    const tagsHtml = (ev.tags && ev.tags.length)
      ? `<div class="emax-timeline-event-tags">${ev.tags.map((k) => `<span class="emax-timeline-tag-pill">${emaxTagEmoji(k)} ${EMAX_TIMELINE_TAGS.find((t) => t.key === k) ? EMAX_TIMELINE_TAGS.find((t) => t.key === k).label : k}</span>`).join('')}</div>`
      : '';
    return `
      <div class="emax-timeline-event-row">
        <div class="emax-timeline-event-text">${escapeHtml(ev.text)}</div>
        ${tagsHtml}
        ${severityHtml}
        <div class="emax-timeline-event-meta">
          <span>${ev.manual ? 'Your note' : 'From Wikipedia'}</span>
          <button type="button" class="btn-link" data-year-edit="${year}">Edit</button>
        </div>
      </div>`;
  }
  if (entry.timelineEvents === undefined) {
    return `<div class="emax-timeline-event-row emax-timeline-event-loading">Looking up what happened...${severityHtml}</div>`;
  }
  return `
    <div class="emax-timeline-event-row emax-timeline-event-empty">
      <span>Nothing found for this year</span>
      ${severityHtml}
      <button type="button" class="btn-link" data-year-edit="${year}">+ Add note</button>
    </div>`;
}

function emaxTimelineSectionHtml(entry, title, years) {
  const chipsHtml = years.length
    ? `<div class="emax-timeline-chips">${years.map(({ year, verdict, magnitude }) => {
        const ev = entry.timelineEvents && entry.timelineEvents[year];
        return emaxTimelineChipHtml(year, verdict, ev && ev.tags, magnitude);
      }).join('')}</div>`
    : '<div class="emax-timeline-empty">None yet</div>';
  const expandedYearObj = years.find(({ year }) => String(year) === String(emaxTimelineExpandedYear));
  const eventRowHtml = expandedYearObj ? emaxTimelineEventRowHtml(entry, expandedYearObj.year, expandedYearObj.magnitude) : '';
  return `
    <div class="emax-timeline-section">
      <div class="emax-timeline-section-title">${escapeHtml(title)}</div>
      ${chipsHtml}
      ${eventRowHtml}
    </div>`;
}

function emaxTimelineZodiacGroupTitle(animals, label) {
  const emojis = animals.map((a) => VIETNAMESE_ZODIAC_EMOJI[a] || '').join('');
  return `${emojis} ${label}${animals.length > 1 ? 's' : ''} (${animals.join(', ')})`;
}

// "Worst Year: 2001, 2013 (-2)" - lists every tied year rather than
// arbitrarily picking one (same honesty convention as Tiger's own 3-way
// friendly-animal tie). Omitted entirely when nothing's been flagged yet
// (worstYears/bestYears both empty - too early in a short lifetime for any
// signal to have landed at all).
function emaxMagnitudeSigned(m) {
  return m > 0 ? `+${m}` : `${m}`;
}

function emaxTimelineHeadlineHtml(timeline) {
  const { worstYears, worstMagnitude, bestYears, bestMagnitude } = timeline;
  if (!worstYears.length && !bestYears.length) return '';
  const worstPart = worstYears.length ? `Worst Year${worstYears.length > 1 ? 's' : ''}: ${worstYears.join(', ')} (${emaxMagnitudeSigned(worstMagnitude)})` : '';
  const bestPart = bestYears.length ? `Best Year${bestYears.length > 1 ? 's' : ''}: ${bestYears.join(', ')} (${emaxMagnitudeSigned(bestMagnitude)})` : '';
  return `<div class="emax-timeline-headline">${[worstPart, bestPart].filter(Boolean).join(' · ')}</div>`;
}

function renderTimelineBody(entry, timeline) {
  const { ownAnimal, enemyAnimal, trineAnimals, friendlyAnimals, ownYears, trineYears, friendlyYears, enemyYears, py7Years, py11Years } = timeline;
  // friendlyAnimals is already pre-filtered (emaxBuildTimeline) down to
  // matches NOT already covered by the trine group - when that leaves
  // nothing, the whole section is skipped rather than shown empty, since
  // "None yet" would misleadingly read as "no friendly years exist" when
  // really they're just already covered by Trine above.
  const friendlySectionHtml = friendlyAnimals.length
    ? emaxTimelineSectionHtml(entry, emaxTimelineZodiacGroupTitle(friendlyAnimals, 'Friendly Year'), friendlyYears)
    : '';
  document.getElementById('emaxTimelineBody').innerHTML = `
    <div class="box-label">${escapeHtml(entry.name)}'s Timeline</div>
    ${emaxTimelineHeadlineHtml(timeline)}
    ${emaxTimelineSectionHtml(entry, `${VIETNAMESE_ZODIAC_EMOJI[ownAnimal] || ''} Own Year (${ownAnimal})`, ownYears)}
    ${emaxTimelineSectionHtml(entry, emaxTimelineZodiacGroupTitle(trineAnimals, 'Trine Year'), trineYears)}
    ${friendlySectionHtml}
    ${emaxTimelineSectionHtml(entry, `${VIETNAMESE_ZODIAC_EMOJI[enemyAnimal] || ''} Enemy Year (${enemyAnimal})`, enemyYears)}
    ${emaxTimelineSectionHtml(entry, 'Personal Year 7', py7Years)}
    ${emaxTimelineSectionHtml(entry, 'Personal Year 11', py11Years)}
  `;
}

async function openTimelineModal(entry, birthDate) {
  let timeline = emaxBuildTimeline(birthDate, entry);
  emaxTimelineExpandedYear = null;
  emaxTimelineEditingYear = null;
  emaxTimelineEditingTags = [];
  emaxTimelineDraftText = null;
  emaxTimelineCurrentEntryId = entry.id;
  emaxTimelineCurrentTimeline = timeline;
  renderTimelineBody(entry, timeline);
  document.getElementById('emaxTimelineOverlay').classList.add('active');

  if (entry.timelineEvents === undefined) {
    const { ownYears, trineYears, friendlyYears, enemyYears, py7Years, py11Years } = timeline;
    const years = [...new Set([...ownYears, ...trineYears, ...friendlyYears, ...enemyYears, ...py7Years, ...py11Years].map((y) => y.year))];
    await emaxFetchYearEvents(entry, years);
    // The popup may have moved on to a different entry (or closed) while
    // this fetch was in flight - only repaint if we're still looking at it.
    // Rebuilds the timeline (not just re-rendering the old one) - every
    // year's magnitude bakes in whatever event bonus is now resolved,
    // which wasn't available yet on the first build above.
    if (emaxTimelineCurrentEntryId === entry.id) {
      timeline = emaxBuildTimeline(birthDate, entry);
      emaxTimelineCurrentTimeline = timeline;
      renderTimelineBody(entry, timeline);
    }
  }
}

function closeTimelineModal() {
  document.getElementById('emaxTimelineOverlay').classList.remove('active');
}

// openItemModal/closeItemModal moved to emax-popup.js (2026-08-02, shared
// with emax.html) - startEdit/deleteEntry below are still what that shared
// popup calls into for this page's own entries.

/* ===================== Add/Edit form ===================== */

function startEdit(entry) {
  editingEntryId = entry.id;
  pendingWikiTitle = entry.wikiTitle || null;
  pendingDateKind = entry.dateKind || null;
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  pendingArtistQid = (linkedPersonCfg && entry[linkedPersonCfg.field + 'Qid']) || null;
  document.getElementById('newEntryName').value = entry.name;
  document.getElementById('newEntryDate').value = entry.date ? isoToDisplay(entry.date) : '';
  document.getElementById('newEntryArtist').value = (linkedPersonCfg && entry[linkedPersonCfg.field + 'Name']) || '';
  document.getElementById('newEntryImage').value = entry.imageUrl || '';
  document.getElementById('newEntryNoImage').checked = !!entry.noImage;
  document.getElementById('entryFormLabel').textContent = `Edit Item - ${entry.name}`;
  document.getElementById('addEntryBtn').textContent = 'Save Changes';
  document.getElementById('cancelEditBtn').style.display = '';
  document.getElementById('entryLookupStatus').textContent = '';
  document.getElementById('addEntryBody').hidden = false;
  document.getElementById('addEntryChevron').classList.add('open');
  document.getElementById('newEntryName').focus();
  document.getElementById('addEntryBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exitEditMode() {
  editingEntryId = null;
  pendingWikiTitle = null;
  pendingDateKind = null;
  pendingArtistQid = null;
  document.getElementById('newEntryName').value = '';
  document.getElementById('newEntryDate').value = '';
  document.getElementById('newEntryArtist').value = '';
  document.getElementById('newEntryImage').value = '';
  document.getElementById('newEntryNoImage').checked = false;
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
  // Gates the prose "first product launch" long-shot tier in
  // lookupKeyDateByNameWithTitle - only meaningful for brand/company
  // categories, never people or movies (see that function's own comment).
  const isBrandCategory = EMAX_YEAR_FILTER_KIND[category.name] === 'founded';
  // Categories with a linked-person config also resolve that person
  // alongside the item's own date, for the banner in the item's own popup -
  // see EMAX_LINKED_PERSON_CONFIG and openItemModal's banner section.
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
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
    setLookupStatus(`⚡ Preloading Top ${names.length} - ${i + 1}/${names.length} (${added} added so far)...`, false);
    if (existing.has(displayName.toLowerCase())) { skippedExisting++; continue; }
    try {
      const info = await lookupKeyDateByNameWithTitle(searchTerm, isBrandCategory);
      if (info) {
        const entry = { id: uid(), name: displayName, date: info.date, wikiTitle: info.title, dateKind: info.kind };
        if (linkedPersonCfg) {
          try {
            const person = await linkedPersonCfg.lookupFn(searchTerm);
            if (person) { entry[linkedPersonCfg.field + 'Name'] = person.title; entry[linkedPersonCfg.field + 'Qid'] = person.qid; }
          } catch (e2) { /* no linked person found - the item still saves fine without one */ }
        }
        category.entries.push(entry);
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

/* ===================== Find Missing Pictures ===================== */
// A second, on-demand pass over every entry that currently has NO picture
// showing (emaxEntryHasPicture false) - unlike the automatic lazy fetch
// (emaxLoadRowImages, runs once as the list first renders), this DELETES
// any stale cached "nothing found" result before retrying, since the whole
// point of a second scan is to give a past failure another shot (the
// Wikipedia article may have gained an infobox image since, or the first
// automated match was simply wrong) - per the user's own explicit call
// (2026-08-01), not a distinction the harness needs to guess at. Entries
// with entry.noImage (the explicit "remove picture" edit option) are never
// touched - that is a deliberate choice, not a failed fetch. Same
// sequential 350ms-gap throttle as Preload Top 50, for the same reason
// (Wikimedia throttles bursty automated clients).
let emaxFindingPictures = false;

async function findMissingPictures() {
  if (emaxPreloading || emaxFindingPictures) return;
  const isBrandCategory = EMAX_YEAR_FILTER_KIND[category.name] === 'founded';
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  const candidates = category.entries.filter((e) => e.date && !e.noImage && !emaxEntryHasPicture(e));
  if (!candidates.length) {
    setLookupStatus('🖼️ Every item with a date already has a picture (or has one intentionally removed).', false);
    return;
  }
  emaxFindingPictures = true;
  const btn = document.getElementById('findPicturesBtn');
  btn.disabled = true;
  let found = 0;

  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    setLookupStatus(`🖼️ Finding pictures - ${i + 1}/${candidates.length} (${found} found so far)...`, false);
    const title = entry.wikiTitle || entry.name;
    delete emaxImageCache[title];
    let url = await emaxFetchImage(title, isBrandCategory);
    if (!url) url = await emaxLinkedPersonImageUrl(entry, linkedPersonCfg);
    if (url) {
      found++;
      const thumbEl = document.getElementById(`emaxThumb-${entry.id}`);
      if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  btn.disabled = false;
  emaxFindingPictures = false;
  setLookupStatus(`🖼️ Found ${found}/${candidates.length} missing pictures.`, false);
}

/* ===================== Preload by Year ===================== */
// Only offered on categories listed in EMAX_YEAR_QUERY_CONFIG. One live
// SPARQL query for what actually exists FROM year X (see
// buildEmaxYearSparqlQuery/fetchEmaxYearCandidates, db-core.js) - replaced
// the original approach of scanning this category's own curated seed list
// hoping a handful of all-time picks happened to land on one exact year,
// which for most years came back with zero or near-zero hits (the actual
// bug report this rebuild fixed, 2026-07-31). RAW_POOL_LIMIT is how many
// real candidates get pulled from Wikidata before sampling down to however
// many the user actually asked for - generous enough that the fame-spread
// sample (emaxStratifiedFameSample) has real range to work with even at a
// large requested count.
const EMAX_YEAR_RAW_POOL_LIMIT = 1500;

async function preloadByYear(targetYear, targetCount) {
  if (emaxPreloading) return;
  const cfg = EMAX_YEAR_QUERY_CONFIG[category.name];
  const kind = EMAX_YEAR_FILTER_KIND[category.name];
  if (!cfg || !kind) return;
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  emaxPreloading = true;
  const btn = document.getElementById('preloadByYearBtn');
  btn.disabled = true;
  setLookupStatus(`⚡ Querying Wikidata for ${category.name.toLowerCase()} from ${targetYear} - this can take up to a minute...`, false);

  let candidates = [];
  try { candidates = await fetchEmaxYearCandidates(cfg, targetYear, EMAX_YEAR_RAW_POOL_LIMIT); } catch (e) { candidates = []; }
  const sampled = emaxStratifiedFameSample(candidates, targetCount);

  const existing = new Set(category.entries.map((e) => e.name.toLowerCase()));
  let added = 0;
  let addedYearOnly = 0;
  let skippedExisting = 0;

  for (let i = 0; i < sampled.length; i++) {
    const cand = sampled[i];
    setLookupStatus(`⚡ Adding ${category.name.toLowerCase()} from ${targetYear} - ${i + 1}/${sampled.length}...`, false);
    if (existing.has(cand.name.toLowerCase())) { skippedExisting++; continue; }

    if (cand.dayPrecision) {
      const entry = { id: uid(), name: cand.name, date: cand.date, wikiTitle: cand.wikiTitle, dateKind: kind };
      if (linkedPersonCfg) {
        let person = null;
        try { person = await linkedPersonCfg.lookupFn(cand.wikiTitle); } catch (e2) { /* no linked person found - the item still saves fine without one */ }
        if (person) { entry[linkedPersonCfg.field + 'Name'] = person.title; entry[linkedPersonCfg.field + 'Qid'] = person.qid; }
      }
      category.entries.push(entry);
      added++;
    } else {
      category.entries.push({ id: uid(), name: cand.name, year: cand.year });
      added++;
      addedYearOnly++;
    }
    existing.add(cand.name.toLowerCase());
  }

  saveEmaxDB(db);
  renderEntries();
  btn.disabled = false;
  emaxPreloading = false;
  const yearOnlyNote = addedYearOnly ? ` (${addedYearOnly} year-only precision)` : '';
  const skipNote = skippedExisting ? ` · ${skippedExisting} already in your list` : '';
  setLookupStatus(`⚡ Added ${added}/${sampled.length} ${category.name.toLowerCase()} from ${targetYear}${yearOnlyNote}${skipNote} - ${candidates.length} found total on Wikidata.`, false);
}

function init() {
  attachDateMask(document.getElementById('newEntryDate'));

  // The HTML's own `hidden` attribute already starts this collapsed (avoids
  // a flash of the open form before this script runs) - set it again here
  // too so the collapsed state doesn't quietly depend on that markup alone.
  document.getElementById('addEntryBody').hidden = true;
  document.getElementById('addEntryToggle').addEventListener('click', () => {
    const body = document.getElementById('addEntryBody');
    body.hidden = !body.hidden;
    document.getElementById('addEntryChevron').classList.toggle('open', !body.hidden);
  });

  document.getElementById('emaxSearchInput').addEventListener('input', () => {
    searchQuery = document.getElementById('emaxSearchInput').value.trim();
    emaxUpdateFilterClearVisibility();
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxFilterValue').addEventListener('input', () => {
    const raw = document.getElementById('emaxFilterValue').value;
    scoreFilterValue = raw === '' ? null : Number(raw);
    emaxUpdateFilterClearVisibility();
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxScoreModeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) emaxSetScoreMode(btn.dataset.value);
  });
  document.getElementById('emaxStarModeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) emaxSetStarMode(btn.dataset.value);
  });
  document.getElementById('emaxStarFilterPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.emax-star');
    if (!btn) return;
    emaxToggleStarFilter(Number(btn.dataset.star));
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxUnratedFilterBtn').addEventListener('click', () => {
    emaxToggleUnratedFilter();
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxPictureToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) emaxSetPictureMode(btn.dataset.value);
  });
  document.getElementById('emaxFilterClearBtn').addEventListener('click', () => {
    emaxClearAllFilters();
    document.getElementById('emaxSearchInput').value = '';
    document.getElementById('emaxFilterValue').value = '';
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxFiltersToggleBtn').addEventListener('click', () => {
    document.getElementById('emaxFilterDrawer').classList.toggle('open');
  });
  document.getElementById('emaxPagination').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    emaxCurrentPage = Number(btn.dataset.page);
    renderEntries();
    document.getElementById('entriesContainer').scrollIntoView({ block: 'start' });
  });

  document.getElementById('addEntryBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('newEntryName');
    const dateInput = document.getElementById('newEntryDate');
    const imageInput = document.getElementById('newEntryImage');
    const noImageInput = document.getElementById('newEntryNoImage');
    const artistInput = document.getElementById('newEntryArtist');
    const iso = displayToISO(dateInput.value);
    if (!iso) {
      alert('Please enter a valid date (MM/DD/YYYY) - or use Look Up to try filling it in automatically.');
      return;
    }
    // artistInput is always user-editable (typed by hand or auto-filled by
    // Look Up), so whatever's in it wins - pendingArtistQid only tags along
    // when the visible text still matches what Look Up actually resolved
    // (cleared the instant the field is hand-edited, see its own listener
    // below); a hand-typed name with no QID still saves fine, same as any
    // other manual entry - "+ Add to Database" just falls back to a name
    // search instead of skipping straight to the QID.
    const artistName = artistInput.value.trim() || null;
    const artistQid = artistName ? pendingArtistQid : null;
    if (editingEntryId) {
      updateEntry(editingEntryId, nameInput.value, iso, imageInput.value.trim(), pendingWikiTitle, noImageInput.checked, pendingDateKind, artistName, artistQid);
    } else {
      addEntry(nameInput.value, iso, imageInput.value.trim(), pendingWikiTitle, noImageInput.checked, pendingDateKind, artistName, artistQid);
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
  // The artist NAME text itself is left alone (it's the user's own visible
  // field now, not tied to the date) - only the internal QID association
  // is stale once the date no longer matches what Look Up found.
  document.getElementById('newEntryDate').addEventListener('input', () => {
    pendingWikiTitle = null;
    pendingDateKind = null;
    pendingArtistQid = null;
  });

  // Same idea for the artist field itself - typing a different name means
  // whatever QID Look Up previously attached no longer applies to it.
  document.getElementById('newEntryArtist').addEventListener('input', () => {
    pendingArtistQid = null;
  });

  document.getElementById('entryLookupBtn').addEventListener('click', () => {
    const name = document.getElementById('newEntryName').value.trim();
    if (!name) { setLookupStatus('Type a name first.', true); return; }
    setLookupStatus('🔍 Looking up...', false);
    const myToken = ++lookupToken;
    const isBrandCategory = EMAX_YEAR_FILTER_KIND[category.name] === 'founded';
    const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
    lookupKeyDateByNameWithTitle(name, isBrandCategory).then((info) => {
      if (myToken !== lookupToken) return; // superseded by a newer lookup
      if (!info) {
        setLookupStatus(`Couldn't find a date automatically for "${name}" - please enter it yourself.`, true);
        return;
      }
      document.getElementById('newEntryDate').value = isoToDisplay(info.date);
      pendingWikiTitle = info.title;
      pendingDateKind = info.kind;
      const kindLabel = EMAX_DATE_KIND_LABEL[info.kind] ? EMAX_DATE_KIND_LABEL[info.kind].toLowerCase() : info.kind;
      setLookupStatus(`✓ Matched "${info.title}" (${kindLabel} ${info.date}) - please double-check before saving.`, false);
      if (!linkedPersonCfg) return;
      const artistInput = document.getElementById('newEntryArtist');
      // Only fills in an EMPTY field - a name the user already typed by hand
      // (the lookup doesn't resolve for every item, or they know better
      // than Wikidata) is never silently overwritten by an auto-detection
      // that happens to land afterward, same "manual always wins" rule
      // every other auto-fetched field in this app already follows.
      if (artistInput.value.trim()) return;
      linkedPersonCfg.lookupFn(name).then((person) => {
        if (myToken !== lookupToken || !person || artistInput.value.trim()) return;
        artistInput.value = person.title;
        pendingArtistQid = person.qid;
      }).catch(() => { /* no linked person found - the item still saves fine without one, or the user can type one by hand */ });
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
      e.stopPropagation();
      deleteEntry(deleteBtn.dataset.entryDelete);
      if (editingEntryId === deleteBtn.dataset.entryDelete) exitEditMode();
      return;
    }

    // A year-only tile has no popup to open (no full date to compute
    // compatibility from) - tapping it goes straight to the edit form to
    // add the missing day, replacing the old separate "Add full date" link.
    const yearOnlyTile = e.target.closest('[data-year-only]');
    if (yearOnlyTile) {
      const entry = category.entries.find((en) => en.id === yearOnlyTile.dataset.yearOnly);
      if (entry) startEdit(entry);
      return;
    }

    const tile = e.target.closest('[data-open]');
    if (tile) {
      const entry = category.entries.find((en) => en.id === tile.dataset.open);
      if (entry && entry.date) openItemModal(entry);
    }
  });

  // itemModalBody's star-rating click handler, plus itemModalClose/
  // itemModalOverlay's own listeners, moved to emax-popup.js (2026-08-02) -
  // set up once there instead of here, since that file is now shared with
  // emax.html too.

  document.getElementById('emaxTimelineClose').addEventListener('click', closeTimelineModal);
  document.getElementById('emaxTimelineOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'emaxTimelineOverlay') closeTimelineModal();
  });

  document.getElementById('emaxTimelineBody').addEventListener('click', (e) => {
    const timelineEntry = emaxTimelineFindEntryById(emaxTimelineCurrentEntryId);
    if (!timelineEntry || !emaxTimelineCurrentTimeline) return;

    const saveBtn = e.target.closest('[data-year-save]');
    if (saveBtn) {
      const year = saveBtn.dataset.yearSave;
      const text = document.getElementById('emaxTimelineNoteInput').value.trim();
      timelineEntry.timelineEvents = timelineEntry.timelineEvents || {};
      if (text) timelineEntry.timelineEvents[year] = { text, tags: emaxTimelineEditingTags.slice(), manual: true };
      else delete timelineEntry.timelineEvents[year];
      saveEmaxDB(db);
      emaxTimelineEditingYear = null;
      emaxTimelineEditingTags = [];
      emaxTimelineDraftText = null;
      // Rebuilds (not just re-renders the old one) - the tags just saved
      // can change that year's magnitude (emaxYearEventMagnitudeBonus),
      // which was baked in at the timeline's last build, before this save.
      emaxTimelineCurrentTimeline = emaxBuildTimeline(parseDateStr(timelineEntry.date), timelineEntry);
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
      return;
    }
    const cancelBtn = e.target.closest('[data-year-cancel]');
    if (cancelBtn) {
      emaxTimelineEditingYear = null;
      emaxTimelineEditingTags = [];
      emaxTimelineDraftText = null;
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
      return;
    }
    // Toggling a tag re-renders the whole timeline body (same "rebuild from
    // state" pattern as everything else here) - capture whatever's already
    // typed in the textarea first, or it would reset back to the saved text.
    const tagBtn = e.target.closest('[data-tag-toggle]');
    if (tagBtn) {
      emaxTimelineDraftText = document.getElementById('emaxTimelineNoteInput').value;
      const tag = tagBtn.dataset.tagToggle;
      const idx = emaxTimelineEditingTags.indexOf(tag);
      if (idx === -1) emaxTimelineEditingTags.push(tag); else emaxTimelineEditingTags.splice(idx, 1);
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
      return;
    }
    const editBtn = e.target.closest('[data-year-edit]');
    if (editBtn) {
      emaxTimelineEditingYear = editBtn.dataset.yearEdit;
      emaxTimelineExpandedYear = emaxTimelineEditingYear;
      const existingEvent = timelineEntry.timelineEvents && timelineEntry.timelineEvents[emaxTimelineEditingYear];
      emaxTimelineEditingTags = (existingEvent && existingEvent.tags) ? existingEvent.tags.slice() : [];
      emaxTimelineDraftText = null;
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
      return;
    }
    const chip = e.target.closest('.emax-timeline-chip');
    if (chip) {
      const year = chip.dataset.year;
      emaxTimelineEditingYear = null;
      emaxTimelineEditingTags = [];
      emaxTimelineDraftText = null;
      emaxTimelineExpandedYear = (String(emaxTimelineExpandedYear) === String(year)) ? null : year;
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
    }
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
    const preloadBtn = document.getElementById('preloadTop50Btn');
    // Labeled with the list's REAL length, not a fixed number - each
    // category's pool grew to a different size (quality over forcing an
    // exact count), so the button always says what it actually offers.
    preloadBtn.textContent = `⚡ Preload Top ${EMAX_SEED_LISTS[category.name].length}`;
    preloadBtn.style.display = '';
    preloadBtn.addEventListener('click', () => preloadTop50());
  }

  document.getElementById('findPicturesBtn').addEventListener('click', () => findMissingPictures());

  // Any category with a linked-person config (EMAX_LINKED_PERSON_CONFIG) -
  // see #newEntryArtist's own comments (init's addEntryBtn handler,
  // entryLookupBtn handler) for how this field is filled/used. The DOM ids
  // stay "Artist"-named even for Video Games' Director - internal only,
  // never shown to the user, and not worth a churn-risky rename.
  const formLinkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  if (formLinkedPersonCfg) {
    document.getElementById('newEntryArtistRow').style.display = '';
    document.getElementById('newEntryArtist').placeholder = `${formLinkedPersonCfg.label} (optional) - auto-filled by Look Up, or type your own`;
  }

  if (EMAX_YEAR_QUERY_CONFIG[category.name]) {
    document.getElementById('preloadByYearRow').style.display = '';
    document.getElementById('preloadByYearBtn').addEventListener('click', () => {
      const year = parseInt(document.getElementById('preloadYearInput').value, 10);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < 1500 || year > currentYear) {
        setLookupStatus(`Enter a real year (1500-${currentYear}).`, true);
        return;
      }
      const targetCount = parseInt(document.getElementById('preloadYearCountInput').value, 10);
      if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 1000) {
        setLookupStatus('Enter how many to pull in (1-1000).', true);
        return;
      }
      preloadByYear(year, targetCount);
    });
  }

  renderEntries();
}

// Reverse Lookup deep link (emax.html?...&open=<entryId>) - auto-opens the
// exact matched entry's popup, so a search result lands you straight on the
// match instead of a scroll through however many hundred entries this
// category has. Runs at the very end of the file, after every const/function
// this needs (openItemModal and everything it references, e.g.
// EMAX_DATE_KIND_LABEL further down) has actually finished declaring -
// calling it any earlier hits those bindings' temporal dead zone.
if (category) {
  const openEntryId = params.get('open');
  if (openEntryId) {
    const openEntry = category.entries.find((e) => e.id === openEntryId);
    if (openEntry && openEntry.date) openItemModal(openEntry);
  }

  // emax.html's item popup deep-links Edit here (?id=<catId>&edit=<entryId>)
  // since the add/edit form only exists on this page - lands straight in
  // edit mode instead of the plain view popup.
  const editEntryId = params.get('edit');
  if (editEntryId) {
    const editTarget = category.entries.find((e) => e.id === editEntryId);
    if (editTarget) startEdit(editTarget);
  }
}

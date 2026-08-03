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
// The add/edit form's own scale-kind severity picker (Hurricanes'
// Category) - a click-based widget needs its own state the same way
// starFilterValue does for the filter drawer's picker, separate from that
// one since this is what's ABOUT TO be saved, not a list filter.
let formSeverityScaleValue = null;
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
// Earthquakes' Magnitude / Hurricanes' Category (EMAX_SEVERITY_CONFIG,
// emax-popup.js) - severityFilterMode holds whichever mode string applies
// to THIS category's own kind ('over'/'under' for numeric, 'atLeast'/
// 'exactly' for scale), set to the right default the first time init()
// sees a category with a severity config.
let severityFilterValue = null;
let severityFilterMode = null;
let searchQuery = '';

// Distribution chart (2026-08-02) - which of the 5 dimensions is charted,
// and which single bar (if any) is the active filter. Exclusive with the 4
// filters above (the user's own call) - tapping a bar clears them, and
// touching any of them clears this right back, so only one filtering mode
// is ever active at once.
let distributionDimension = 'lifePath';
let distributionFilterKey = null;

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

// linkedPersonName/linkedPersonQid/linkedPersonDate: only meaningful for a
// category with an EMAX_LINKED_PERSON_CONFIG entry (Songs' artist, Video
// Games' director, Inventors' invention) - stored under that category's
// own field prefix (entry.artistName for Songs, entry.inventionName for
// Inventors) so existing Songs data keeps working under its
// already-shipped literal field names unchanged. linkedPersonDate only
// applies to a manualDate config (Inventors) - a QID-resolving config
// (Songs/Video Games/Books) ignores it and uses linkedPersonQid instead.
//
// The linked person/thing is auto-added to its own target category right
// here (2026-08-03, the user's own call) - manualDate does it synchronously
// (the date's already known, nothing to fetch), the QID-resolving kind
// fires emaxAutoAddLinkedPerson in the background (fetches their real
// birthdate) without blocking this entry's own save.
function addEntry(name, date, imageUrl, wikiTitle, noImage, dateKind, linkedPersonName, linkedPersonQid, linkedPersonDate, severityValue) {
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
    if (linkedPersonCfg.manualDate) {
      if (linkedPersonDate) entry[linkedPersonCfg.field + 'Date'] = linkedPersonDate;
      emaxAutoAddLinkedEntityWithDate(linkedPersonName, linkedPersonDate, linkedPersonCfg.targetCategory);
    } else {
      entry[linkedPersonCfg.field + 'Qid'] = linkedPersonQid;
      emaxAutoAddLinkedPerson(linkedPersonName, linkedPersonQid, linkedPersonCfg.targetCategory);
    }
  }
  const severityCfg = EMAX_SEVERITY_CONFIG[category.name];
  if (severityCfg && severityValue != null) entry[severityCfg.field] = severityValue;
  category.entries.push(entry);
  saveEmaxDB(db);
  renderEntries();
}

function updateEntry(entryId, name, date, imageUrl, wikiTitle, noImage, dateKind, linkedPersonName, linkedPersonQid, linkedPersonDate, severityValue) {
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
  const severityCfg = EMAX_SEVERITY_CONFIG[category.name];
  if (severityCfg) {
    if (severityValue != null) entry[severityCfg.field] = severityValue; else delete entry[severityCfg.field];
  }
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[category.name];
  if (linkedPersonCfg) {
    if (linkedPersonName) {
      entry[linkedPersonCfg.field + 'Name'] = linkedPersonName;
      if (linkedPersonCfg.manualDate) {
        if (linkedPersonDate) entry[linkedPersonCfg.field + 'Date'] = linkedPersonDate; else delete entry[linkedPersonCfg.field + 'Date'];
        emaxAutoAddLinkedEntityWithDate(linkedPersonName, linkedPersonDate, linkedPersonCfg.targetCategory);
      } else {
        entry[linkedPersonCfg.field + 'Qid'] = linkedPersonQid;
        emaxAutoAddLinkedPerson(linkedPersonName, linkedPersonQid, linkedPersonCfg.targetCategory);
      }
    } else {
      delete entry[linkedPersonCfg.field + 'Name'];
      delete entry[linkedPersonCfg.field + 'Qid'];
      delete entry[linkedPersonCfg.field + 'Date'];
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
        ${emaxTileSeverityBadgeHtml(entry)}
        ${starsHtml(entry.id, entry.rating || 0)}
      </div>
    </div>`;
}

// A small badge naming the entry's own Magnitude/Category (EMAX_SEVERITY_
// CONFIG) right on the tile - '' for any category with no severity config,
// or an entry that was saved/preloaded with no severity value at all.
function emaxTileSeverityBadgeHtml(entry) {
  const cfg = EMAX_SEVERITY_CONFIG[category.name];
  if (!cfg) return '';
  const value = entry[cfg.field];
  if (value == null) return '';
  const display = cfg.kind === 'numeric' ? Number(value).toFixed(1) : `Cat ${value}`;
  return `<span class="emax-tile-severity-badge">${escapeHtml(display)}</span>`;
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
  return !!searchQuery || scoreFilterValue != null || starFilterValue != null || unratedOnly || pictureFilterMode !== 'any' || severityFilterValue != null;
}
// True when `value` (an entry's severity field) matches the active
// severity filter, under the given config's own kind. A missing value
// never matches - same "no score, can't be over/under anything" rule the
// existing Score filter already follows.
function emaxEntryMatchesSeverity(cfg, value, filterValue, mode) {
  if (filterValue == null) return true;
  if (value == null) return false;
  return cfg.kind === 'numeric'
    ? (mode === 'under' ? value < filterValue : value > filterValue)
    : (mode === 'exactly' ? value === filterValue : value >= filterValue);
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
function emaxRenderFormSeverityPicker(value) {
  formSeverityScaleValue = value;
  document.querySelectorAll('#newEntrySeverityScale .emax-severity-btn').forEach((btn) => {
    btn.classList.toggle('filled', value != null && Number(btn.dataset.value) <= value);
  });
}
function emaxRenderSeverityFilterPicker() {
  document.querySelectorAll('#emaxSeverityFilterPicker .emax-severity-btn').forEach((btn) => {
    btn.classList.toggle('filled', severityFilterValue != null && Number(btn.dataset.value) <= severityFilterValue);
  });
}
function emaxClearAllFilters() {
  searchQuery = '';
  scoreFilterValue = null;
  starFilterValue = null;
  unratedOnly = false;
  pictureFilterMode = 'any';
  severityFilterValue = null;
  emaxRenderStarFilterPicker();
  emaxRenderSeverityFilterPicker();
  emaxSetToggleGroupActive('emaxPictureToggle', 'any');
  emaxUpdateFilterClearVisibility();
}

function emaxDistributionBarLabel(dimension, key) {
  if (dimension === 'chineseZodiac') return `${VIETNAMESE_ZODIAC_EMOJI[key] || ''} ${key}`;
  if (dimension === 'westernZodiac') return `${ZODIAC_SYMBOLS[key] || ''} ${key}`;
  return key;
}

function emaxDistributionBarHtml(dimension, row, maxCount) {
  const pct = maxCount ? Math.round((row.count / maxCount) * 100) : 0;
  const active = distributionFilterKey === row.key;
  return `<button type="button" class="emax-dist-bar-row${active ? ' active' : ''}" data-dist-key="${escapeHtml(row.key)}">
    <span class="emax-dist-bar-label">${escapeHtml(emaxDistributionBarLabel(dimension, row.key))}</span>
    <span class="emax-dist-bar-track"><span class="emax-dist-bar-fill" style="width:${pct}%"></span></span>
    <span class="emax-dist-bar-count">${row.count}</span>
  </button>`;
}

// The collapsed box header itself names the active filter (e.g.
// "Distribution - Life Path: 5") - so collapsing the box after tapping a
// bar doesn't hide the fact the list is still filtered.
function renderDistributionChart() {
  const rows = emaxDistributionCounts(category.entries, distributionDimension);
  const chartEl = document.getElementById('emaxDistributionChart');
  chartEl.innerHTML = rows.length
    ? rows.map((row) => emaxDistributionBarHtml(distributionDimension, row, rows[0].count)).join('')
    : '<div class="emax-timeline-empty">No dated items yet.</div>';
  document.getElementById('emaxDistributionClearBtn').style.display = distributionFilterKey != null ? '' : 'none';
  document.getElementById('emaxDistributionLabel').textContent = distributionFilterKey != null
    ? `Distribution - ${EMAX_DISTRIBUTION_DIMENSIONS[distributionDimension]}: ${emaxDistributionBarLabel(distributionDimension, distributionFilterKey)}`
    : 'Distribution';
}

// Switching dimension clears whatever bar was picked under the OLD one -
// its key wouldn't even mean anything under the new value set (e.g. a
// Chinese zodiac animal name isn't a valid Life Path number).
function emaxSetDistributionDimension(dimension) {
  distributionDimension = dimension;
  distributionFilterKey = null;
  emaxSetToggleGroupActive('emaxDistDimensionToggle', dimension);
  renderDistributionChart();
}

// Tapping the already-active bar again clears it - same "click again to
// reset" convention as the star-rating filter. Exclusive with the other 4
// filters (the user's own call, 2026-08-02) - picking a bar clears them,
// in state AND on screen, so the UI never implies two filtering modes are
// both silently active.
function emaxToggleDistributionBar(key) {
  distributionFilterKey = distributionFilterKey === key ? null : key;
  if (distributionFilterKey != null) {
    emaxClearAllFilters();
    document.getElementById('emaxSearchInput').value = '';
    document.getElementById('emaxFilterValue').value = '';
    document.getElementById('emaxSeverityFilterValue').value = '';
  }
  renderDistributionChart();
}

function emaxClearDistributionFilter() {
  distributionFilterKey = null;
  renderDistributionChart();
}

// Using ANY of the 4 filters above clears the bar-chart filter right back -
// exclusive in both directions, so the UI never implies two different
// filtering modes are both silently active at once.
function emaxClearDistributionFilterIfActive() {
  if (distributionFilterKey != null) emaxClearDistributionFilter();
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
function emaxSetSeverityMode(mode) {
  severityFilterMode = mode;
  const cfg = EMAX_SEVERITY_CONFIG[category.name];
  emaxSetToggleGroupActive(cfg && cfg.kind === 'numeric' ? 'emaxSeverityNumericModeToggle' : 'emaxSeverityScaleModeToggle', mode);
  if (severityFilterValue != null) { emaxCurrentPage = 1; renderEntries(); }
}
function emaxToggleSeverityFilter(n) {
  severityFilterValue = severityFilterValue === n ? null : n;
  emaxRenderSeverityFilterPicker();
  emaxUpdateFilterClearVisibility();
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
  //
  // A distribution-chart bar filter is exclusive with the 4 filters above
  // (the user's own call, 2026-08-02) - narrows to exactly its own bucket,
  // bypassing search/score/star/picture entirely, rather than combining
  // with whatever they'd otherwise say (their state is already cleared the
  // moment a bar is tapped - see emaxClearDistributionFilterIfActive/the
  // chart click handler in init()).
  const anyFilterActive = distributionFilterKey != null || emaxAnyFilterActive();
  const visible = distributionFilterKey != null
    ? ranked.filter(({ entry }) => emaxDistributionEntryMatches(entry, distributionDimension, distributionFilterKey))
    : (!anyFilterActive ? ranked : ranked.filter(({ entry, score }) => {
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
      const severityCfg = EMAX_SEVERITY_CONFIG[category.name];
      if (severityCfg && !emaxEntryMatchesSeverity(severityCfg, entry[severityCfg.field], severityFilterValue, severityFilterMode)) return false;
      return true;
    }));
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

// The Timeline mini-popup (openTimelineModal/closeTimelineModal and
// everything it renders) and the item popup (openItemModal/closeItemModal)
// both moved to emax-popup.js (2026-08-02, shared with emax.html) -
// startEdit/deleteEntry below are still what that shared popup calls into
// for this page's own entries.

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
  document.getElementById('newEntryArtistDate').value = (linkedPersonCfg && linkedPersonCfg.manualDate && entry[linkedPersonCfg.field + 'Date'])
    ? isoToDisplay(entry[linkedPersonCfg.field + 'Date']) : '';
  const severityCfgForEdit = EMAX_SEVERITY_CONFIG[category.name];
  const severityValueForEdit = severityCfgForEdit ? entry[severityCfgForEdit.field] : null;
  document.getElementById('newEntrySeverityNumeric').value = (severityCfgForEdit && severityCfgForEdit.kind === 'numeric' && severityValueForEdit != null) ? String(severityValueForEdit) : '';
  emaxRenderFormSeverityPicker(severityCfgForEdit && severityCfgForEdit.kind === 'scale' ? severityValueForEdit : null);
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
  document.getElementById('newEntryArtistDate').value = '';
  document.getElementById('newEntrySeverityNumeric').value = '';
  emaxRenderFormSeverityPicker(null);
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
  // Earthquakes/Hurricanes (EMAX_SEVERITY_CONFIG) - their own severity
  // value, baked into the seed object same as an Inventors seed's
  // invention/inventionDate, since there's no live lookup for "how
  // destructive was this event" either.
  const severityCfg = EMAX_SEVERITY_CONFIG[category.name];
  emaxPreloading = true;
  const btn = document.getElementById('preloadTop50Btn');
  btn.disabled = true;
  const existing = new Set(category.entries.map((e) => e.name.toLowerCase()));
  let added = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (let i = 0; i < names.length; i++) {
    // Each seed entry is a plain display name, [displayName, searchTerm]
    // when the clean name alone is too ambiguous to resolve reliably, or
    // (Inventors only) { name, searchTerm, invention, inventionDate } -
    // there's no reliable live Wikidata lookup for "what did this person
    // invent and when" (manualDate config, EMAX_LINKED_PERSON_CONFIG), so
    // that pairing is baked directly into the seed data instead of
    // resolved here, same as the item's own date always is otherwise.
    const seed = names[i];
    const isSeedObject = seed !== null && typeof seed === 'object' && !Array.isArray(seed);
    const displayName = isSeedObject ? seed.name : (Array.isArray(seed) ? seed[0] : seed);
    const searchTerm = isSeedObject ? (seed.searchTerm || seed.name) : (Array.isArray(seed) ? seed[1] : seed);
    setLookupStatus(`⚡ Preloading Top ${names.length} - ${i + 1}/${names.length} (${added} added so far)...`, false);
    if (existing.has(displayName.toLowerCase())) { skippedExisting++; continue; }
    // A baked-in date (Earthquakes/Hurricanes/Power Outages/Wars' own real
    // date - no reliable live lookup for "when did this happen" exists,
    // same reasoning as Inventors' invention date) skips the live fetch
    // entirely and uses the seed's own verified date/severity directly.
    // dateKind comes from the category's own EMAX_YEAR_FILTER_KIND default
    // (e.g. 'started' for Wars, not the generic 'occurred' every other
    // baked-date category uses) so the popup's date line reads correctly.
    // A seed with `year` instead of `date` (a real, sourced year, but no
    // day-precision source exists for it) becomes a genuine year-only entry
    // - same "never fabricate finer precision than the source supports"
    // rule every live lookup's own year-only fallback already follows,
    // just fed from a baked value instead of a live Wikidata property.
    if (isSeedObject && (seed.date || seed.year)) {
      const entry = seed.date
        ? { id: uid(), name: displayName, date: seed.date, dateKind: EMAX_YEAR_FILTER_KIND[category.name] }
        : { id: uid(), name: displayName, year: seed.year };
      if (severityCfg && seed[severityCfg.field] != null) entry[severityCfg.field] = seed[severityCfg.field];
      category.entries.push(entry);
      existing.add(displayName.toLowerCase());
      added++;
      await new Promise((resolve) => setTimeout(resolve, 350));
      continue;
    }
    try {
      const info = await lookupKeyDateByNameWithTitle(searchTerm, isBrandCategory);
      if (info) {
        const entry = { id: uid(), name: displayName, date: info.date, wikiTitle: info.title, dateKind: info.kind };
        if (linkedPersonCfg && linkedPersonCfg.manualDate) {
          // inventionYear: a real, sourced year with no day-precision
          // source behind it (most pre-modern inventions) - never a
          // fabricated day, same as the item's own year-only fallback.
          if (isSeedObject && seed.invention && (seed.inventionDate || seed.inventionYear)) {
            entry[linkedPersonCfg.field + 'Name'] = seed.invention;
            if (seed.inventionDate) entry[linkedPersonCfg.field + 'Date'] = seed.inventionDate;
            else entry[linkedPersonCfg.field + 'Year'] = seed.inventionYear;
            emaxAutoAddLinkedEntityWithDate(seed.invention, seed.inventionDate, linkedPersonCfg.targetCategory, seed.inventionYear);
          }
        } else if (linkedPersonCfg && linkedPersonCfg.lookupFn) {
          try {
            const person = await linkedPersonCfg.lookupFn(searchTerm);
            if (person) {
              entry[linkedPersonCfg.field + 'Name'] = person.title;
              entry[linkedPersonCfg.field + 'Qid'] = person.qid;
              emaxAutoAddLinkedPerson(person.title, person.qid, linkedPersonCfg.targetCategory);
            }
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
      // manualDate configs (Inventors) have no live lookupFn to call here -
      // there's no Wikidata-driven way to know what a randomly-sampled
      // year's candidate invented, so the Invention field stays empty from
      // this path (addable afterward by hand via Edit).
      if (linkedPersonCfg && linkedPersonCfg.lookupFn) {
        let person = null;
        try { person = await linkedPersonCfg.lookupFn(cand.wikiTitle); } catch (e2) { /* no linked person found - the item still saves fine without one */ }
        if (person) {
          entry[linkedPersonCfg.field + 'Name'] = person.title;
          entry[linkedPersonCfg.field + 'Qid'] = person.qid;
          emaxAutoAddLinkedPerson(person.title, person.qid, linkedPersonCfg.targetCategory);
        }
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
    emaxClearDistributionFilterIfActive();
    emaxUpdateFilterClearVisibility();
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxFilterValue').addEventListener('input', () => {
    const raw = document.getElementById('emaxFilterValue').value;
    scoreFilterValue = raw === '' ? null : Number(raw);
    emaxClearDistributionFilterIfActive();
    emaxUpdateFilterClearVisibility();
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxScoreModeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) { emaxClearDistributionFilterIfActive(); emaxSetScoreMode(btn.dataset.value); }
  });
  document.getElementById('emaxStarModeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) { emaxClearDistributionFilterIfActive(); emaxSetStarMode(btn.dataset.value); }
  });
  document.getElementById('emaxSeverityFilterValue').addEventListener('input', () => {
    const raw = document.getElementById('emaxSeverityFilterValue').value;
    severityFilterValue = raw === '' ? null : Number(raw);
    emaxClearDistributionFilterIfActive();
    emaxUpdateFilterClearVisibility();
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxSeverityNumericModeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) { emaxClearDistributionFilterIfActive(); emaxSetSeverityMode(btn.dataset.value); }
  });
  document.getElementById('emaxSeverityScaleModeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) { emaxClearDistributionFilterIfActive(); emaxSetSeverityMode(btn.dataset.value); }
  });
  document.getElementById('emaxSeverityFilterPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.emax-severity-btn');
    if (!btn) return;
    emaxClearDistributionFilterIfActive();
    emaxToggleSeverityFilter(Number(btn.dataset.value));
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('newEntrySeverityScale').addEventListener('click', (e) => {
    const btn = e.target.closest('.emax-severity-btn');
    if (!btn) return;
    const n = Number(btn.dataset.value);
    emaxRenderFormSeverityPicker(formSeverityScaleValue === n ? null : n);
  });
  document.getElementById('emaxStarFilterPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.emax-star');
    if (!btn) return;
    emaxClearDistributionFilterIfActive();
    emaxToggleStarFilter(Number(btn.dataset.star));
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxUnratedFilterBtn').addEventListener('click', () => {
    emaxClearDistributionFilterIfActive();
    emaxToggleUnratedFilter();
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxPictureToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) { emaxClearDistributionFilterIfActive(); emaxSetPictureMode(btn.dataset.value); }
  });
  document.getElementById('emaxFilterClearBtn').addEventListener('click', () => {
    emaxClearAllFilters();
    emaxClearDistributionFilterIfActive();
    document.getElementById('emaxSearchInput').value = '';
    document.getElementById('emaxFilterValue').value = '';
    document.getElementById('emaxSeverityFilterValue').value = '';
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxFiltersToggleBtn').addEventListener('click', () => {
    document.getElementById('emaxFilterDrawer').classList.toggle('open');
  });

  document.getElementById('emaxDistributionBody').hidden = true;
  document.getElementById('emaxDistributionToggle').addEventListener('click', () => {
    const body = document.getElementById('emaxDistributionBody');
    body.hidden = !body.hidden;
    document.getElementById('emaxDistributionChevron').classList.toggle('open', !body.hidden);
  });
  document.getElementById('emaxDistDimensionToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    emaxSetDistributionDimension(btn.dataset.value);
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxDistributionChart').addEventListener('click', (e) => {
    const bar = e.target.closest('[data-dist-key]');
    if (!bar) return;
    emaxToggleDistributionBar(bar.dataset.distKey);
    emaxCurrentPage = 1;
    renderEntries();
  });
  document.getElementById('emaxDistributionClearBtn').addEventListener('click', () => {
    emaxClearDistributionFilter();
    emaxCurrentPage = 1;
    renderEntries();
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
    const artistDateInput = document.getElementById('newEntryArtistDate');
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
    const linkedCfgForSave = EMAX_LINKED_PERSON_CONFIG[category.name];
    const artistName = artistInput.value.trim() || null;
    const isManualDate = !!(linkedCfgForSave && linkedCfgForSave.manualDate);
    const artistQid = (artistName && !isManualDate) ? pendingArtistQid : null;
    // The Invention date (Inventors only) has to be a real, valid date -
    // there's no Wikidata fallback to resolve it from, unlike the item's
    // own date which Look Up can fill in.
    let artistDateIso = null;
    if (artistName && isManualDate) {
      artistDateIso = displayToISO(artistDateInput.value);
      if (artistDateInput.value.trim() && !artistDateIso) {
        alert(`Please enter a valid ${linkedCfgForSave.label.toLowerCase()} date (MM/DD/YYYY), or leave it blank.`);
        return;
      }
    }
    // Severity (Earthquakes' Magnitude / Hurricanes' Category) - optional,
    // like the artist field, but whatever IS entered has to fall inside the
    // real scale (a "Magnitude 47" or "Category 9" is never a real event),
    // same validate-if-present rule as the invention date above.
    const severityCfgForSave = EMAX_SEVERITY_CONFIG[category.name];
    let severityValue = null;
    if (severityCfgForSave) {
      if (severityCfgForSave.kind === 'numeric') {
        const raw = document.getElementById('newEntrySeverityNumeric').value;
        if (raw.trim()) {
          const n = Number(raw);
          if (!Number.isFinite(n) || n < severityCfgForSave.min || n > severityCfgForSave.max) {
            alert(`Please enter a valid ${severityCfgForSave.label.toLowerCase()} between ${severityCfgForSave.min} and ${severityCfgForSave.max}, or leave it blank.`);
            return;
          }
          severityValue = n;
        }
      } else {
        severityValue = formSeverityScaleValue;
      }
    }
    if (editingEntryId) {
      updateEntry(editingEntryId, nameInput.value, iso, imageInput.value.trim(), pendingWikiTitle, noImageInput.checked, pendingDateKind, artistName, artistQid, artistDateIso, severityValue);
    } else {
      addEntry(nameInput.value, iso, imageInput.value.trim(), pendingWikiTitle, noImageInput.checked, pendingDateKind, artistName, artistQid, artistDateIso, severityValue);
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
      if (!linkedPersonCfg || !linkedPersonCfg.lookupFn) return; // manualDate (Inventors) has nothing to auto-resolve here
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

  // itemModalBody's star-rating click handler, itemModalClose/
  // itemModalOverlay's own listeners, and the whole Timeline mini-popup's
  // click handlers all moved to emax-popup.js (2026-08-02) - set up once
  // there instead of here, since that file is now shared with emax.html too.

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
    // manualDate (Inventors' Invention) has no live Look Up source, so its
    // own date has to be typed by hand right alongside the name - the
    // date input only shows for that kind of config.
    document.getElementById('newEntryArtist').placeholder = formLinkedPersonCfg.manualDate
      ? `${formLinkedPersonCfg.label} name`
      : `${formLinkedPersonCfg.label} (optional) - auto-filled by Look Up, or type your own`;
    if (formLinkedPersonCfg.manualDate) {
      const artistDateInput = document.getElementById('newEntryArtistDate');
      artistDateInput.style.display = '';
      artistDateInput.placeholder = `${formLinkedPersonCfg.label} date (MM/DD/YYYY)`;
      attachDateMask(artistDateInput);
    }
  }

  // Earthquakes' Magnitude / Hurricanes' Category (EMAX_SEVERITY_CONFIG,
  // emax-popup.js) - the add/edit form's own row and the filter drawer's
  // own block both stay hidden entirely for any category without one.
  const formSeverityCfg = EMAX_SEVERITY_CONFIG[category.name];
  if (formSeverityCfg) {
    document.getElementById('newEntrySeverityRow').style.display = '';
    document.getElementById('newEntrySeverityLabel').textContent = formSeverityCfg.label;
    document.getElementById('emaxSeverityFilterBlock').style.display = '';
    document.getElementById('emaxSeverityFilterLabel').textContent = formSeverityCfg.label;
    if (formSeverityCfg.kind === 'numeric') {
      const numericInput = document.getElementById('newEntrySeverityNumeric');
      numericInput.style.display = '';
      numericInput.min = formSeverityCfg.min;
      numericInput.max = formSeverityCfg.max;
      numericInput.step = formSeverityCfg.step;
      numericInput.placeholder = `e.g. ${((formSeverityCfg.min + formSeverityCfg.max) / 2).toFixed(1)}`;
      document.getElementById('emaxSeverityNumericModeToggle').style.display = '';
      const filterValueInput = document.getElementById('emaxSeverityFilterValue');
      filterValueInput.style.display = '';
      filterValueInput.min = formSeverityCfg.min;
      filterValueInput.max = formSeverityCfg.max;
      filterValueInput.step = formSeverityCfg.step;
      filterValueInput.placeholder = numericInput.placeholder;
      severityFilterMode = 'over';
    } else {
      document.getElementById('newEntrySeverityScale').style.display = '';
      document.getElementById('emaxSeverityScaleModeToggle').style.display = '';
      document.getElementById('emaxSeverityFilterPicker').style.display = '';
      severityFilterMode = 'atLeast';
    }
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

  renderDistributionChart();
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

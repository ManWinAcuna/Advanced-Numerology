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

// Declared here (ahead of init() below) rather than down by emaxFetchImage
// itself - renderEntries() now loads row images synchronously off of
// init(), which runs immediately at module load, before any `let` further
// down this file has been reached; a hoisted function calling into it that
// early would otherwise hit a genuine temporal-dead-zone ReferenceError.
const EMAX_IMAGE_CACHE_KEY = 'numerology_emax_images_v1';
let emaxImageCache = {};
try { emaxImageCache = JSON.parse(localStorage.getItem(EMAX_IMAGE_CACHE_KEY)) || {}; } catch (e) { emaxImageCache = {}; }

// Same reason as EMAX_IMAGE_CACHE_KEY above - init() (called synchronously
// below) reads this directly, so it has to be initialized before that call,
// not down by emaxLinkedPersonBannerHtml where it conceptually belongs.
// Categories whose items have a linked REAL PERSON worth their own banner
// in the popup - Songs' performer (originally the only one), now also
// Video Games' designer/director. One config entry drives the whole
// banner/manual-field/preload/lookup machinery instead of a parallel copy
// per category. `field` is the entry property PREFIX - the actual stored
// properties are entry[field+'Name']/entry[field+'Qid'] ('artist' for Songs
// matches its already-shipped entry.artistName/artistQid exactly, so
// existing real user data needs no migration). `label` is what the manual
// field's placeholder calls it. `lookupFn` is the db-core.js resolver.
// targetCategory: which category a "+ Add to Database" click actually adds
// the linked person INTO, and where an existing match is looked up from -
// Songs' artist and Video Games' director both share the general "Artists"
// bucket (real people generally), but Books' author gets its own dedicated
// "Authors" category instead, per an explicit call not to just keep
// dumping every linked-person type into Artists.
const EMAX_LINKED_PERSON_CONFIG = {
  Songs: { field: 'artist', label: 'Artist', lookupFn: lookupPerformerForSong, targetCategory: 'Artists' },
  'Video Games': { field: 'director', label: 'Director', lookupFn: lookupDirectorForGame, targetCategory: 'Artists' },
  Books: { field: 'author', label: 'Author', lookupFn: lookupAuthorForBook, targetCategory: 'Authors' },
};

// A plain YouTube SEARCH link (never a guessed video id, which could easily
// land on the wrong upload or a cover) - `query` builds the search text,
// `label` is the button's own wording so it reads naturally for what's
// actually being searched (a trailer isn't "listened to"). Every category
// gets SOME query, including a custom one you type yourself (the DEFAULT
// entry below) - "some kind of search for everything", not just Songs.
const EMAX_YOUTUBE_CONFIG = {
  Songs: { label: '▶ Listen on YouTube', query: (entry) => [entry.name, entry.artistName].filter(Boolean).join(' ') },
  Artists: { label: '▶ Watch on YouTube', query: (entry) => `${entry.name} best songs` },
  Movies: { label: '▶ Watch Trailer', query: (entry) => `${entry.name} trailer` },
  Shows: { label: '▶ Watch Trailer', query: (entry) => `${entry.name} trailer` },
  Anime: { label: '▶ Watch Trailer', query: (entry) => `${entry.name} trailer` },
  'Video Games': { label: '▶ Watch Trailer', query: (entry) => `${entry.name} trailer` },
  YouTubers: { label: '▶ Watch on YouTube', query: (entry) => entry.name },
  'Historical Figures': { label: '▶ Watch Documentary', query: (entry) => `${entry.name} documentary` },
  Authors: { label: '▶ Watch Interview', query: (entry) => `${entry.name} interview` },
  Books: { label: '▶ Watch Review', query: (entry) => `${entry.name} book review` },
  'Clothing Brands': { label: '▶ Watch Commercial', query: (entry) => `${entry.name} commercial` },
  'Shoe Brands': { label: '▶ Watch Commercial', query: (entry) => `${entry.name} commercial` },
  'Technology Brands': { label: '▶ Watch Commercial', query: (entry) => `${entry.name} commercial` },
  'Hygiene Brands': { label: '▶ Watch Commercial', query: (entry) => `${entry.name} commercial` },
  'Food & Beverage Brands': { label: '▶ Watch Commercial', query: (entry) => `${entry.name} commercial` },
  DEFAULT: { label: '▶ Search on YouTube', query: (entry) => entry.name },
};

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
// unrated, rather than being stuck re-affirming the same number forever.
// Searches every category, not just the current page's - entry.id (uid())
// is globally unique, so this is a strict superset of the old current-
// -category-only behavior, needed for rating an Artists entry from the
// Songs page's artist banner (categoryNameOverride's popup, same star UI).
function setRating(entryId, rating) {
  let entry = null;
  for (const cat of db.categories) {
    entry = cat.entries.find((e) => e.id === entryId);
    if (entry) break;
  }
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
// Same pattern Stocks already uses for CEO portraits: the real photo loads
// lazily (an item's own popup, or - now - each dated list row) with a
// monogram fallback. A manual entry.imageUrl always wins over the
// auto-fetch, and entry.noImage (the "remove picture" edit option) wins
// over both. EMAX_IMAGE_CACHE_KEY/emaxImageCache are declared up top of
// this file - see the comment there for why.

// tryLogoFirst: brand categories check Wikidata's real logo property (P154)
// before falling back to whatever photo the Wikipedia page's own summary
// leads with - see lookupLogoImageUrl in db-core.js for why. Either path's
// result lands in the same cache, keyed by title alone.
async function emaxFetchImage(title, tryLogoFirst) {
  if (Object.prototype.hasOwnProperty.call(emaxImageCache, title)) return emaxImageCache[title];
  let url = null;
  try {
    if (tryLogoFirst) url = await lookupLogoImageUrl(title);
    if (!url) {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      const data = await res.json();
      url = (data.thumbnail && data.thumbnail.source) || null;
    }
  } catch (e) {
    url = null; // offline or no image - monogram fallback stays
  }
  emaxImageCache[title] = url;
  try { localStorage.setItem(EMAX_IMAGE_CACHE_KEY, JSON.stringify(emaxImageCache)); } catch (e2) { /* storage full - refetch next time */ }
  return url;
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

/* ===================== Same-sign zodiac override ===================== */
// Non-person items only (Artists = real people, always the plain computed
// score): when the item's Vietnamese zodiac sign matches yours on an axis -
// "a horse wearing horse brands" is optimal energy - that axis's score
// becomes a flat 99 instead of whatever vietnameseCompat's table has for a
// same-animal pairing, then blends via the SAME year>month>day weighting
// compat-engine.js's own defaults use (0.60/0.30/0.10 - not exported by
// that file, so mirrored here rather than editing it). Numerology and
// Western stay exactly as computeCompatibility already computed them; only
// the Vietnamese axis and the top-level blend get recomputed, using
// COMPAT_DEFAULT_WEIGHTS' own real numerology/vietnamese/western split -
// this NEVER edits compat-engine.js, it only consumes it more than once.
function emaxAdjustedCompatibility(meDate, themDate) {
  const result = computeCompatibility(meDate, themDate);
  // Real PEOPLE (any category whose date is a birthdate - Artists,
  // YouTubers, Historical Figures, Authors) are exempt from the same-sign
  // override below: a matching Vietnamese zodiac sign is a meaningful
  // thematic-alignment signal for a brand/movie/song, but not something
  // that should artificially boost an actual person's real numerological
  // compatibility. This was hardcoded to the literal name "Artists" before
  // YouTubers/Historical Figures/Authors existed - genuinely missed
  // exempting YouTubers since it shipped, caught while wiring the newer
  // person categories through the same check.
  if (EMAX_YEAR_FILTER_KIND[category.name] === 'born') return result;

  // Life Path 9 matched against Life Path 9 scores very low (10) in the core
  // person-to-person table (NUMEROLOGY_TABLE[9][9], compat-data.js) - two
  // PEOPLE who are both 9 (the completion/letting-go number) can genuinely
  // clash. That reading doesn't transfer to a brand/movie/song sharing your
  // Life Path 9: there's no interpersonal friction to have, so it reads as a
  // strong thematic match instead (per the user, 2026-07-31). Only the Life
  // Path sub-score is touched - Day Number and Day-of-Year keep whatever
  // computeCompatibility already found for them, same "never edit
  // compat-engine.js, just recompose what it already returned" approach as
  // the Vietnamese override below.
  let numerologyScore = result.numerology.score;
  let lifePathScore = result.numerology.lifePathScore;
  const nineNineMatch = result.numerology.entityLifePath === '9' && result.numerology.dayLifePath === '9';
  if (nineNineMatch) {
    lifePathScore = 80;
    numerologyScore = COMPAT_DEFAULT_WEIGHTS.lifePath * lifePathScore
      + COMPAT_DEFAULT_WEIGHTS.dayNum * result.numerology.dayScore
      + COMPAT_DEFAULT_WEIGHTS.doy * result.numerology.doyScore;
  }

  const v = result.vietnamese;
  const yearMatch = v.entityYearSign === v.dayYearSign;
  const monthMatch = v.entityMonthSign === v.dayMonthSign;
  const dayMatch = v.entityDaySign === v.dayDaySign;
  const vietnameseOverride = yearMatch || monthMatch || dayMatch;
  if (!nineNineMatch && !vietnameseOverride) return result;

  const yearScore = yearMatch ? 99 : v.yearScore;
  const monthScore = monthMatch ? 99 : v.monthScore;
  const daySignScore = dayMatch ? 99 : v.daySignScore;
  const vietnameseScore = vietnameseOverride ? (0.60 * yearScore + 0.30 * monthScore + 0.10 * daySignScore) : v.score;

  const baseScore = COMPAT_DEFAULT_WEIGHTS.numerology * numerologyScore
    + COMPAT_DEFAULT_WEIGHTS.vietnamese * vietnameseScore
    + COMPAT_DEFAULT_WEIGHTS.western * result.western.score;
  const finalScore = Math.min(100, Math.round(baseScore + result.bonuses.total));

  const flags = [];
  if (finalScore < 49) flags.push('clash');
  else if (finalScore >= 85) flags.push('perfect');
  else if (finalScore >= 77) flags.push('ideal');

  return {
    ...result,
    finalScore,
    baseScore: Math.round(baseScore),
    flags,
    numerology: { ...result.numerology, score: Math.round(numerologyScore), lifePathScore },
    vietnamese: vietnameseOverride
      ? { ...v, score: Math.round(vietnameseScore), yearScore, monthScore, daySignScore }
      : v,
  };
}

// computeLuckyBonus checks both directions - a note's `from` says WHOSE lucky
// digits actually triggered it ('entity' = mine, 'day' = the item's - see
// computeCompatibility(meDate, themDate) in emaxAdjustedCompatibility above,
// entityDate is always meDate here). The engine always writes "your lucky
// digits" regardless of direction since it has no notion of "the viewer";
// EMAX does, so a 'day' note gets rewritten to name the item instead of
// reading as if the fact were about the viewer's own digits.
function emaxRewriteBonusNotes(bonuses, themName) {
  if (!bonuses || !bonuses.notes.length) return bonuses;
  const notes = bonuses.notes.map((note) => {
    if (typeof note === 'string') return note; // no direction info - leave as-is
    if (note.from !== 'day') return note.text;
    return note.text.replace(/\byour lucky (digits|number)\b/g, `${themName}'s lucky $1`);
  });
  return { total: bonuses.total, notes };
}

/* ===================== List rendering ===================== */

// { entry, score }[] - score null when there's no profile birthday yet or
// the entry is year-only (can't compute a real compatibility score without
// a full date). Sorted highest-score-first; scoreless entries sort last,
// alphabetically among themselves.
function scoredEntries(meDate) {
  const list = category.entries.map((entry) => {
    if (!meDate || !entry.date) return { entry, score: null };
    const score = emaxAdjustedCompatibility(meDate, parseDateStr(entry.date)).finalScore;
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

// Redesigned 2026-07-31 from a one-row-per-item list into a poster/avatar
// grid (per the user's own brainstormed direction) - Edit/Delete moved into
// the popup for a normal dated tile (nothing to overlay on the art itself),
// but a year-only entry has no popup to open at all (no date to compute
// compatibility from), so it keeps its own small delete corner button and
// tapping it jumps straight into the edit form instead.
function entryRowHtml(entry, score) {
  const shapeCls = emaxTileShapeClass();

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
      <div class="emax-tile-media">
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
  if (scoreFilterValue != null) renderEntries();
}
function emaxSetStarMode(mode) {
  starFilterMode = mode;
  emaxSetToggleGroupActive('emaxStarModeToggle', mode);
  if (starFilterValue != null) renderEntries();
}
function emaxSetPictureMode(mode) {
  pictureFilterMode = mode;
  emaxSetToggleGroupActive('emaxPictureToggle', mode);
  emaxUpdateFilterClearVisibility();
  renderEntries();
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

  container.innerHTML = noteHtml + emptyFilterHtml + visible.map(({ entry, score }) => entryRowHtml(entry, score)).join('');
  emaxLoadRowImages(visible);
}

/* ===================== Item popup ===================== */
// Quick-glance facts up top (image, Life Path, Day Born, Chinese Month/Day
// animal, your rating), the full two-way compatibility breakdown
// (compat-render.js, same component the Database's "Compare with me" and
// the Compatibility Calculator already use) underneath.

// A date "kind" (from EMAX_YEAR_FILTER_KIND's category default, or an
// entry's own dateKind when a lookup resolved one) as a human verb on the
// date line - no match (a custom category with no known kind, or a
// hand-typed date) just shows the bare date with no verb prefix.
const EMAX_DATE_KIND_LABEL = { founded: 'Founded', born: 'Born', released: 'Released', opened: 'Opened', renamed: 'Renamed', launched: 'Launched', aired: 'Aired' };

// A fact-grid tile. When `compound` is given and differs from the reduced
// value shown, the tile becomes tappable - clicking toggles the displayed
// value between the reduced form and "compound/reduced" (e.g. "23/5"). Used
// for Life Path, Day Born, Day of Year, and Personal Year/Month/Day. The
// Chinese sign tiles have no numeric compound, so they stay plain.
function emaxFactTile(icon, label, reduced, compound) {
  const iconHtml = `<span class="emax-fact-icon">${icon}</span>`;
  const labelHtml = `<span class="emax-fact-label">${escapeHtml(label)}</span>`;
  const valueHtml = `<span class="emax-fact-value">${escapeHtml(String(reduced))}</span>`;
  if (compound != null && String(compound) !== String(reduced)) {
    const compoundLabel = `${compound}/${reduced}`;
    return `<button type="button" class="emax-fact-tile emax-fact-tile-tap" data-reduced="${escapeHtml(String(reduced))}" data-compound="${escapeHtml(compoundLabel)}">${iconHtml}${labelHtml}${valueHtml}</button>`;
  }
  return `<div class="emax-fact-tile">${iconHtml}${labelHtml}${valueHtml}</div>`;
}

// entry[cfg.field+'Name'] (set by cfg.lookupFn at Preload/Look-up time, or
// typed by hand) gets its own small banner in the item's popup - the linked
// person's own compatibility, a separate number from the item's own score
// already shown above. If that person already exists in the Artists
// category (matched by name), the banner shows their real score and opens
// THEIR popup on tap (openItemModal again, with an 'Artists' override so it
// behaves exactly as it would from that page - see openItemModal's own
// comment on categoryNameOverride). If not, there's nothing to score yet,
// so it offers "+ Add to Database" instead. cfg is null for every category
// without a config above - returns '' immediately, same as before this was
// Songs-only.
function emaxLinkedPersonBannerHtml(entry, meDate, cfg) {
  if (!cfg) return '';
  const personName = entry[cfg.field + 'Name'];
  if (!personName) return '';
  const personQid = entry[cfg.field + 'Qid'];
  const targetCat = db.categories.find((c) => c.name === cfg.targetCategory);
  const existing = targetCat && targetCat.entries.find((e) => e.name.toLowerCase() === personName.toLowerCase());
  const thumb = emaxMonogram(personName, false);

  if (existing && existing.date) {
    const personScore = computeCompatibility(meDate, parseDateStr(existing.date)).finalScore;
    return `
      <button type="button" class="emax-artist-banner" id="emaxArtistBanner" data-artist-id="${escapeHtml(existing.id)}">
        <div class="emax-artist-banner-thumb" id="emaxArtistBannerThumb">${thumb}</div>
        <div class="emax-artist-banner-name">${escapeHtml(personName)}</div>
        <div class="emax-score ${scoreClass(personScore)}">${personScore}%</div>
      </button>`;
  }

  return `
    <div class="emax-artist-banner">
      <div class="emax-artist-banner-thumb" id="emaxArtistBannerThumb">${thumb}</div>
      <div class="emax-artist-banner-name">${escapeHtml(personName)}</div>
      <button type="button" class="btn-link" id="emaxAddArtistBtn" data-artist-name="${escapeHtml(personName)}" data-artist-qid="${escapeHtml(personQid || '')}">+ Add to Database</button>
    </div>`;
}

// Shared by the linked-person banner (popup) and each row's own small
// avatar fallback - one resolver, same priority order everywhere: the
// PERSON's own stored noImage/imageUrl wins when they're already a real
// Artists entry (their own edits should be respected wherever their photo
// shows up), else falls back to the name itself, which is already the
// resolved Wikipedia title from cfg.lookupFn, not a guessed search string.
// Resolves to a URL, or null (never fetches when noImage is set).
function emaxLinkedPersonImageUrl(entry, cfg) {
  if (!cfg) return Promise.resolve(null);
  const personName = entry[cfg.field + 'Name'];
  if (!personName) return Promise.resolve(null);
  const targetCat = db.categories.find((c) => c.name === cfg.targetCategory);
  const existing = targetCat && targetCat.entries.find((e) => e.name.toLowerCase() === personName.toLowerCase());
  if (existing && existing.noImage) return Promise.resolve(null);
  if (existing && existing.imageUrl) return Promise.resolve(existing.imageUrl);
  const title = (existing && existing.wikiTitle) || personName;
  return emaxFetchImage(title, false);
}

// emaxLinkedPersonBannerHtml above only ever renders the monogram - it's a
// sync string builder, same as every other row/hero thumb in this file. The
// real photo is a separate async enhancement, called right after the
// banner HTML lands in the DOM (openItemModal), same "paint monogram
// first, swap in the real image once it resolves" pattern as
// emaxLoadRowImages and the modal hero image below.
function emaxLoadLinkedPersonBannerImage(entry, cfg) {
  if (!cfg || !entry[cfg.field + 'Name']) return;
  emaxLinkedPersonImageUrl(entry, cfg).then((url) => {
    if (!url) return;
    const thumbEl = document.getElementById('emaxArtistBannerThumb');
    if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
  });
}

// The "+ Add to Database" click: resolves the linked person's own birthdate
// (their real QID, already captured by cfg.lookupFn, skips straight to
// fetchKeyDate instead of re-searching by name - the same property-priority
// cascade every "born"-kind category's own Preload/Look-up already use,
// P569 first) and adds them to cfg.targetCategory (Artists for Songs/Video
// Games, Authors for Books). On success, immediately opens their real
// popup - the natural conclusion of "add them," per the owner's own answer
// to "should this also resolve their birthdate" (originally asked for
// Songs, now shared by every category with a linked-person config).
async function emaxAddArtistToDatabase(artistName, artistQid, targetCategoryName, backTo) {
  const targetCat = db.categories.find((c) => c.name === targetCategoryName);
  if (!targetCat) return;
  if (targetCat.entries.some((e) => e.name.toLowerCase() === artistName.toLowerCase())) return;

  const btn = document.getElementById('emaxAddArtistBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

  let info = null;
  try {
    info = artistQid ? await fetchKeyDate(artistQid) : await lookupBirthDateOrYearWithTitle(artistName);
  } catch (e) { info = null; }

  // Nothing found at all (most often a BAND typed in by hand - a group has
  // no birthdate to find, no matter how many times this runs) - nothing is
  // added, so the name isn't permanently stuck past the "already in the
  // database" guard above with no way to retry after fixing the name.
  if (!info || (!info.date && !info.year)) {
    if (btn) { btn.disabled = false; btn.textContent = "Couldn't find a birthdate - try the person's own name"; }
    return;
  }

  const newEntry = { id: uid(), name: artistName };
  if (info.date) { newEntry.date = info.date; newEntry.dateKind = info.kind; }
  else { newEntry.year = info.year; }
  targetCat.entries.push(newEntry);
  saveEmaxDB(db);

  if (newEntry.date) {
    openItemModal(newEntry, targetCategoryName, backTo);
  } else if (btn) {
    btn.disabled = false;
    btn.textContent = 'Added (year only)';
  }
}

// categoryNameOverride: lets a DIFFERENT page open this same popup for an
// entry that doesn't belong to its own category - the Songs artist banner
// opens an Artists-category entry while still on the Songs page, and needs
// this to behave exactly as it would from the Artists page itself (the
// same-sign override skipped, the date-kind label defaulting to "Born", the
// image fetch not trying the brand-only P154 logo tier). Defaults to the
// current page's own category, unchanged for every existing caller.
// backTo: { entry, categoryNameOverride } of whatever popup navigated INTO
// this one (the song whose artist banner was tapped) - renders a "Back to"
// link at the top so following the banner into the artist's own profile
// doesn't strand you there with no way back except closing the modal
// outright. undefined for every ordinary open (list row, Preload, etc.).

/* ===================== Timeline mini-popup (2026-08-01) ===================== */
// Tapping the item's own picture (inside the already-open popup) opens a
// second, smaller popup on top of it, listing every year across the item's
// whole life/existence that falls into one of four patterns: their own
// Chinese zodiac year, the directly-opposing "enemy" zodiac year, and every
// Personal Year 7 or 11. VIETNAMESE_TABLE (compat-data.js) already encodes
// each animal's one true clash partner as the unique lowest score in its
// row (verified live: every animal's minimum is a mutual 10, six pairs,
// exactly 6 positions apart) - reused here via straight index math rather
// than a second, separately-maintained lookup table.
function emaxEnemyZodiacAnimal(animal) {
  return VIETNAMESE_KEYS[(VIETNAMESE_KEYS.indexOf(animal) + 6) % 12];
}

// Chinese zodiac's traditional "Three Harmonies" trine - a FIXED grouping
// (every 4th animal around the 12-year cycle forms a harmonious trio: e.g.
// Rat-Dragon-Monkey), always the same 2 partners regardless of any
// compatibility scoring. Independent of VIETNAMESE_TABLE below - shown as
// its own section alongside whatever the table separately calls
// "friendly", per the user's own explicit call (2026-08-01): always show
// the trine, and on top of that whatever the table itself flags as
// friendly, even where the two don't fully agree.
function emaxTrineZodiacAnimals(animal) {
  const i = VIETNAMESE_KEYS.indexOf(animal);
  return [VIETNAMESE_KEYS[(i + 4) % 12], VIETNAMESE_KEYS[(i + 8) % 12]];
}

// The "friendliest" animal(s) for a given sign - unlike the enemy pair
// (a clean, symmetric 10 for every animal, always exactly 6 positions
// apart), the table's HIGHEST score per row isn't a uniform offset or even
// always symmetric (Cat's best is Goat at 85, but Goat's own best is Pig at
// 93, not Cat back) - so this reads straight from VIETNAMESE_TABLE itself
// rather than a shortcut formula. Most animals have one clear best match;
// Tiger ties 3-way (Horse/Dog/Pig, all 80) - returns every animal tied at
// the row's max score rather than picking one arbitrarily.
function emaxFriendlyZodiacAnimals(animal) {
  const row = VIETNAMESE_TABLE[animal];
  const selfIndex = VIETNAMESE_KEYS.indexOf(animal);
  let max = -Infinity;
  row.forEach((score, i) => { if (i !== selfIndex && score > max) max = score; });
  return VIETNAMESE_KEYS.filter((a, i) => i !== selfIndex && row[i] === max);
}

// Personal Year for a SPECIFIC calendar year Y, not "as of today" -
// personalYearRawForYear(birthDate, activeYear) already takes the cycle
// year directly, skipping getPersonalYearRaw's own today-relative
// getActiveBirthYear indirection (the cycle actually rolls over on the
// birthday, not Jan 1, but the timeline buckets by CALENDAR year - the
// value shown here matches whatever the cycle that STARTS on their Y-th
// birthday resolves to, same "no standalone 2" reduction rule as
// computeEnergyFlow uses everywhere else in this app).
function emaxPersonalYearForYear(birthDate, year) {
  const raw = personalYearRawForYear(birthDate, year);
  let py = reduceNumber(raw);
  if (py === 2) py = 11;
  return py;
}

// Numerology supersedes the zodiac read when a single year matches both -
// per the user's own call (2026-08-01): their own zodiac year doesn't save
// a Personal Year 7 or 11, since 7/11 are already bearish in this app's own
// established number meanings (matches Stocks' identical reading). Enemy
// zodiac year reads as bad on its own; own, trine, or friendly zodiac year
// reads as good UNLESS numerology overrides it.
function emaxTimelineYearVerdict(personalYear, isOwnYear, isEnemyYear, isFriendlyYear, isTrineYear) {
  if (personalYear === 7 || personalYear === 11) return 'bad';
  if (isEnemyYear) return 'bad';
  if (isOwnYear || isFriendlyYear || isTrineYear) return 'good';
  return 'mid';
}

// Full lifetime, birth/release year through the current year - however
// long that list gets, per the user's own call to keep it complete rather
// than capped to the most recent few.
function emaxBuildTimeline(birthDate) {
  const ownAnimal = getChineseZodiacYear(birthDate);
  const enemyAnimal = emaxEnemyZodiacAnimal(ownAnimal);
  const trineAnimals = emaxTrineZodiacAnimals(ownAnimal);
  // Only the friendly match(es) NOT already covered by the trine group -
  // per the user's own call (2026-08-01): no point in a whole separate
  // "Friendly Year" section that just re-lists years Trine already listed
  // (most animals' single table-best match already sits inside their own
  // trine; Tiger's 3-way tie is the interesting case - Horse and Dog
  // overlap its trine, but Pig doesn't, so Pig alone is genuinely new).
  const friendlyAnimals = emaxFriendlyZodiacAnimals(ownAnimal).filter((a) => !trineAnimals.includes(a));
  const startYear = birthDate.getFullYear();
  const endYear = new Date().getFullYear();
  const ownYears = [];
  const trineYears = [];
  const friendlyYears = [];
  const enemyYears = [];
  const py7Years = [];
  const py11Years = [];
  for (let year = startYear; year <= endYear; year++) {
    const personalYear = emaxPersonalYearForYear(birthDate, year);
    // July 1 as a safe mid-year reference for the zodiac animal check only
    // - well clear of any lunar-new-year boundary ambiguity in Jan/Feb.
    const yearAnimal = getChineseZodiacYear(new Date(year, 6, 1));
    const isOwnYear = yearAnimal === ownAnimal;
    const isEnemyYear = yearAnimal === enemyAnimal;
    const isTrineYear = trineAnimals.includes(yearAnimal);
    const isFriendlyYear = friendlyAnimals.includes(yearAnimal);
    const verdict = emaxTimelineYearVerdict(personalYear, isOwnYear, isEnemyYear, isFriendlyYear, isTrineYear);
    if (isOwnYear) ownYears.push({ year, verdict });
    if (isTrineYear) trineYears.push({ year, verdict });
    if (isFriendlyYear) friendlyYears.push({ year, verdict });
    if (isEnemyYear) enemyYears.push({ year, verdict });
    if (personalYear === 7) py7Years.push({ year, verdict });
    if (personalYear === 11) py11Years.push({ year, verdict });
  }
  return { ownAnimal, enemyAnimal, trineAnimals, friendlyAnimals, ownYears, trineYears, friendlyYears, enemyYears, py7Years, py11Years };
}

// entry.timelineEvents is undefined until the very first Wikipedia-scan
// attempt (emaxFetchYearEvents); after that it's always a real object, even
// if empty, so "attempted, nothing found" and "never attempted" stay
// distinguishable per year. entry.timelineEvents[year].manual marks a note
// the user typed themselves - always wins over a future auto-scan (which
// only ever runs once per entry anyway, see emaxFetchYearEvents).
async function emaxFetchYearEvents(entry, years) {
  if (entry.timelineEvents !== undefined) return entry.timelineEvents;
  const title = entry.wikiTitle || entry.name;
  const wikitext = await fetchWikipediaWikitext(title);
  const events = {};
  if (wikitext) {
    for (const year of years) {
      const text = extractYearEventFromWikitext(wikitext, year);
      if (text) events[year] = { text, manual: false };
    }
  }
  entry.timelineEvents = events;
  saveEmaxDB(db);
  return events;
}

function emaxTimelineFindEntryById(entryId) {
  for (const cat of db.categories) {
    const found = cat.entries.find((e) => e.id === entryId);
    if (found) return found;
  }
  return null;
}

// Module-level, reset at the top of every openTimelineModal call - only one
// timeline popup is ever open at a time, same convention as
// emaxPreloading/pendingWikiTitle elsewhere in this file.
let emaxTimelineExpandedYear = null;
let emaxTimelineEditingYear = null;
let emaxTimelineCurrentEntryId = null;
let emaxTimelineCurrentTimeline = null;

function emaxTimelineChipHtml(year, verdict) {
  const expanded = String(year) === String(emaxTimelineExpandedYear);
  return `<button type="button" class="emax-timeline-chip ${verdict}${expanded ? ' expanded' : ''}" data-year="${year}">${year}</button>`;
}

// A year's expand/edit row is rendered once per SECTION it appears in (the
// same year, e.g. 2019, can be both an Own Year and a Personal Year 7 at
// once - see emaxTimelineYearVerdict) - always the same underlying note,
// shown consistently wherever that year is flagged.
function emaxTimelineEventRowHtml(entry, year) {
  const ev = entry.timelineEvents && entry.timelineEvents[year];
  const editing = String(year) === String(emaxTimelineEditingYear);
  if (editing) {
    const current = ev ? ev.text : '';
    return `
      <div class="emax-timeline-event-row emax-timeline-event-edit">
        <textarea id="emaxTimelineNoteInput" placeholder="What happened this year?">${escapeHtml(current)}</textarea>
        <div class="emax-timeline-event-actions">
          <button type="button" class="btn-link" data-year-save="${year}">Save</button>
          <button type="button" class="btn-link" data-year-cancel="${year}">Cancel</button>
        </div>
      </div>`;
  }
  if (ev) {
    return `
      <div class="emax-timeline-event-row">
        <div class="emax-timeline-event-text">${escapeHtml(ev.text)}</div>
        <div class="emax-timeline-event-meta">
          <span>${ev.manual ? 'Your note' : 'From Wikipedia'}</span>
          <button type="button" class="btn-link" data-year-edit="${year}">Edit</button>
        </div>
      </div>`;
  }
  if (entry.timelineEvents === undefined) {
    return '<div class="emax-timeline-event-row emax-timeline-event-loading">Looking up what happened...</div>';
  }
  return `
    <div class="emax-timeline-event-row emax-timeline-event-empty">
      <span>Nothing found for this year</span>
      <button type="button" class="btn-link" data-year-edit="${year}">+ Add note</button>
    </div>`;
}

function emaxTimelineSectionHtml(entry, title, years) {
  const chipsHtml = years.length
    ? `<div class="emax-timeline-chips">${years.map(({ year, verdict }) => emaxTimelineChipHtml(year, verdict)).join('')}</div>`
    : '<div class="emax-timeline-empty">None yet</div>';
  const expandedHere = years.some(({ year }) => String(year) === String(emaxTimelineExpandedYear));
  const eventRowHtml = expandedHere ? emaxTimelineEventRowHtml(entry, emaxTimelineExpandedYear) : '';
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
    ${emaxTimelineSectionHtml(entry, `${VIETNAMESE_ZODIAC_EMOJI[ownAnimal] || ''} Own Year (${ownAnimal})`, ownYears)}
    ${emaxTimelineSectionHtml(entry, emaxTimelineZodiacGroupTitle(trineAnimals, 'Trine Year'), trineYears)}
    ${friendlySectionHtml}
    ${emaxTimelineSectionHtml(entry, `${VIETNAMESE_ZODIAC_EMOJI[enemyAnimal] || ''} Enemy Year (${enemyAnimal})`, enemyYears)}
    ${emaxTimelineSectionHtml(entry, 'Personal Year 7', py7Years)}
    ${emaxTimelineSectionHtml(entry, 'Personal Year 11', py11Years)}
  `;
}

async function openTimelineModal(entry, birthDate) {
  const timeline = emaxBuildTimeline(birthDate);
  emaxTimelineExpandedYear = null;
  emaxTimelineEditingYear = null;
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
    if (emaxTimelineCurrentEntryId === entry.id) renderTimelineBody(entry, timeline);
  }
}

function closeTimelineModal() {
  document.getElementById('emaxTimelineOverlay').classList.remove('active');
}

function openItemModal(entry, categoryNameOverride, backTo) {
  const effectiveCategoryName = categoryNameOverride || category.name;
  const linkedPersonCfg = EMAX_LINKED_PERSON_CONFIG[effectiveCategoryName];
  const profile = loadProfile();
  if (!profile || !profile.date) {
    alert('Set your birthday on the My Profile page first, then come back to see compatibility.');
    return;
  }

  const body = document.getElementById('itemModalBody');
  body.innerHTML = `<div id="itemModalHeader"></div><div id="itemModalCompat"></div>`;

  const meDate = parseDateStr(profile.date);
  const themDate = parseDateStr(entry.date);
  // Real people (any 'born'-kind category - Artists, YouTubers, Historical
  // Figures, Authors) are always exempt from the same-sign 99% override -
  // emaxAdjustedCompatibility applies the exact same exemption for the
  // CURRENT page's own category, so calling computeCompatibility directly
  // here for a person-category override is the same result, without
  // needing emaxAdjustedCompatibility to also learn about a category
  // (Authors, viewed from within a Books popup) it isn't actually on.
  const result = EMAX_YEAR_FILTER_KIND[effectiveCategoryName] === 'born' ? computeCompatibility(meDate, themDate) : emaxAdjustedCompatibility(meDate, themDate);
  const score = result.finalScore;
  const scoreCls = scoreClass(score);

  const lifePath = getLifePath(themDate);
  const lifePathCompound = getLifePathCompound(themDate);
  const dayBorn = getReducedDay(themDate);
  const dayBornCompound = getRawDay(themDate);
  const dayOfYear = getReducedDayOfYear(themDate);
  const dayOfYearCompound = getDayOfYear(themDate);
  const chineseYear = getChineseZodiacYear(themDate);
  const chineseMonth = getChineseMonth(themDate);
  const chineseDay = getChineseDaySign(themDate);

  // The item's OWN current personal cycle, same computeEnergyFlow(birth,
  // today) pattern used everywhere else in the app (Stocks' Today's
  // Energies, etc.) - "today" is always the real current date, never the
  // profile's own date or anything else. Raw (unreduced) values are
  // computed separately for the tap-to-reveal compound view below -
  // computeEnergyFlow's own return only exposes the final reduced numbers.
  const today = new Date();
  const energyFlow = computeEnergyFlow(themDate, today);
  const personalYear = energyFlow.numerology.personalYear;
  const personalMonth = energyFlow.numerology.personalMonth;
  const personalDay = energyFlow.numerology.personalDay;
  const personalYearCompound = getPersonalYearRaw(themDate, today);
  const personalMonthCompound = getPersonalMonthRaw(themDate, today);
  const personalDayCompound = getPersonalDayRaw(personalMonth, today);

  // entry.dateKind (set when a lookup - Preload or "Look up" - resolved this
  // specific entry's date) is more accurate than the category's default kind:
  // a brand whose official-opening date (not its inception) supplied the
  // real day should say "Opened", not "Founded". Falls back to the category
  // default for entries with no stored kind (e.g. a hand-typed date).
  const kindLabel = EMAX_DATE_KIND_LABEL[entry.dateKind] || EMAX_DATE_KIND_LABEL[EMAX_YEAR_FILTER_KIND[effectiveCategoryName]];
  const dateLine = `${kindLabel ? kindLabel + ' ' : ''}${formatDate(entry.date)}`;

  // A ring circumference for r=52 (see the SVG below) - dashoffset shrinks
  // as the score climbs, so the fill sweeps clockwise from empty to full.
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

  const flagHtml = result.flags.map((f) => {
    if (f === 'perfect') return '<div class="emax-score-flag perfect">★ Perfect Match</div>';
    if (f === 'ideal') return '<div class="emax-score-flag ideal">★ Ideal Match</div>';
    if (f === 'clash') return '<div class="emax-score-flag clash">⚠ Clash</div>';
    return '';
  }).join('');

  const backHtml = backTo
    ? `<button type="button" class="btn-link emax-modal-back" id="itemModalBack">← Back to ${escapeHtml(backTo.entry.name)}</button>`
    : '';

  const youtubeCfg = EMAX_YOUTUBE_CONFIG[effectiveCategoryName] || EMAX_YOUTUBE_CONFIG.DEFAULT;
  const youtubeHtml = `<a class="btn-link emax-modal-youtube" id="itemModalYouTube" href="https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeCfg.query(entry))}" target="_blank" rel="noopener noreferrer">${youtubeCfg.label}</a>`;

  // Edit/Delete moved here from the list tile itself (2026-07-31 redesign) -
  // a poster/avatar tile has nowhere clean to put inline action links, and
  // every entry with a real date already opens this popup on tap anyway.
  // startEdit/deleteEntry both operate on the CURRENT page's own `category`
  // global, so these only make sense (and only render) when this popup is
  // actually showing an entry from THIS page's own category - a foreign
  // entry (an Artist opened from a Songs banner, or a "Back to <song>"
  // hop) isn't something this page can edit or delete at all.
  const actionsHtml = effectiveCategoryName === category.name ? `
    <div class="emax-modal-actions">
      <button type="button" id="itemModalEditBtn">✎ Edit</button>
      <button type="button" class="emax-modal-delete" id="itemModalDeleteBtn">🗑 Delete</button>
    </div>` : '';

  document.getElementById('itemModalHeader').innerHTML = `
    <div class="emax-modal-hero-v2">
      ${backHtml}
      ${actionsHtml}
      <div class="emax-modal-image ${scoreCls}" id="itemModalImage">${emaxMonogram(entry.name, true)}</div>
      ${starsHtml(entry.id, entry.rating || 0)}
      <div class="emax-modal-name">${escapeHtml(entry.name)}</div>
      <div class="emax-modal-date">${escapeHtml(dateLine)}</div>
      ${youtubeHtml}
      <div class="emax-score-ring-wrap">
        <svg viewBox="0 0 120 120" class="emax-score-ring ${scoreCls}">
          <circle cx="60" cy="60" r="52" class="emax-score-ring-track"></circle>
          <circle cx="60" cy="60" r="52" class="emax-score-ring-fill" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset};"></circle>
        </svg>
        <div class="emax-score-ring-label">
          <span class="emax-score-num">${score}</span>
          <span class="emax-score-outof">/100</span>
        </div>
      </div>
      ${flagHtml}
      ${emaxLinkedPersonBannerHtml(entry, meDate, linkedPersonCfg)}
      <div class="emax-fact-grid">
        ${emaxFactTile('✨', 'Life Path', lifePath, lifePathCompound)}
        ${emaxFactTile('📅', 'Day Born', dayBorn, dayBornCompound)}
        ${emaxFactTile('🔢', 'Day of Year', dayOfYear, dayOfYearCompound)}
        ${emaxFactTile('', 'Personal Yr', personalYear, personalYearCompound)}
        ${emaxFactTile('', 'Personal Mo', personalMonth, personalMonthCompound)}
        ${emaxFactTile('', 'Personal Day', personalDay, personalDayCompound)}
        ${emaxFactTile(VIETNAMESE_ZODIAC_EMOJI[chineseYear] || '', 'Year', chineseYear)}
        ${emaxFactTile(VIETNAMESE_ZODIAC_EMOJI[chineseMonth] || '', 'Month', chineseMonth)}
        ${emaxFactTile(VIETNAMESE_ZODIAC_EMOJI[chineseDay] || '', 'Day', chineseDay)}
      </div>
      <button class="emax-breakdown-toggle" id="itemModalBreakdownToggle" type="button">▾ See full breakdown</button>
    </div>`;

  const compatEl = document.getElementById('itemModalCompat');
  const renderResult = { ...result, bonuses: emaxRewriteBonusNotes(result.bonuses, entry.name) };
  renderCompatResults(compatEl, renderResult, entry.name, 'Me');
  compatEl.classList.add('emax-breakdown-body');
  compatEl.hidden = true;
  document.getElementById('itemModalBreakdownToggle').addEventListener('click', () => {
    const toggleBtn = document.getElementById('itemModalBreakdownToggle');
    compatEl.hidden = !compatEl.hidden;
    toggleBtn.textContent = compatEl.hidden ? '▾ See full breakdown' : '▴ Hide full breakdown';
  });

  document.getElementById('itemModalHeader').addEventListener('click', (e) => {
    const backBtn = e.target.closest('#itemModalBack');
    if (backBtn) {
      if (backTo) openItemModal(backTo.entry, backTo.categoryNameOverride);
      return;
    }

    const imageEl = e.target.closest('#itemModalImage');
    if (imageEl) {
      openTimelineModal(entry, themDate);
      return;
    }

    const editBtn = e.target.closest('#itemModalEditBtn');
    if (editBtn) {
      closeItemModal();
      startEdit(entry);
      return;
    }

    const deleteBtn = e.target.closest('#itemModalDeleteBtn');
    if (deleteBtn) {
      if (confirm(`Delete "${entry.name}"?`)) {
        deleteEntry(entry.id);
        closeItemModal();
      }
      return;
    }

    const tile = e.target.closest('.emax-fact-tile-tap');
    if (tile) {
      const valueEl = tile.querySelector('.emax-fact-value');
      const showingCompound = tile.classList.toggle('showing-compound');
      valueEl.textContent = showingCompound ? tile.dataset.compound : tile.dataset.reduced;
      return;
    }

    const artistBanner = e.target.closest('#emaxArtistBanner');
    if (artistBanner && linkedPersonCfg) {
      const targetCat = db.categories.find((c) => c.name === linkedPersonCfg.targetCategory);
      const artistEntry = targetCat && targetCat.entries.find((en) => en.id === artistBanner.dataset.artistId);
      if (artistEntry) openItemModal(artistEntry, linkedPersonCfg.targetCategory, { entry, categoryNameOverride: effectiveCategoryName });
      return;
    }

    const addArtistBtn = e.target.closest('#emaxAddArtistBtn');
    if (addArtistBtn && linkedPersonCfg) {
      emaxAddArtistToDatabase(addArtistBtn.dataset.artistName, addArtistBtn.dataset.artistQid, linkedPersonCfg.targetCategory, { entry, categoryNameOverride: effectiveCategoryName });
    }
  });

  document.getElementById('itemModalOverlay').classList.add('active');

  if (entry.noImage) {
    // "Remove picture" override - stays the monogram already rendered above.
  } else if (entry.imageUrl) {
    document.getElementById('itemModalImage').innerHTML = `<img src="${escapeHtml(entry.imageUrl)}" alt="">`;
  } else {
    const title = entry.wikiTitle || entry.name;
    const isBrand = EMAX_YEAR_FILTER_KIND[effectiveCategoryName] === 'founded';
    emaxFetchImage(title, isBrand).then((url) => {
      if (!url) return;
      const imgEl = document.getElementById('itemModalImage');
      if (imgEl) imgEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
    });
  }

  emaxLoadLinkedPersonBannerImage(entry, linkedPersonCfg);
}

function closeItemModal() {
  document.getElementById('itemModalOverlay').classList.remove('active');
}

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
    renderEntries();
  });
  document.getElementById('emaxFilterValue').addEventListener('input', () => {
    const raw = document.getElementById('emaxFilterValue').value;
    scoreFilterValue = raw === '' ? null : Number(raw);
    emaxUpdateFilterClearVisibility();
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
    renderEntries();
  });
  document.getElementById('emaxUnratedFilterBtn').addEventListener('click', () => {
    emaxToggleUnratedFilter();
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
    renderEntries();
  });
  document.getElementById('emaxFiltersToggleBtn').addEventListener('click', () => {
    document.getElementById('emaxFilterDrawer').classList.toggle('open');
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
      if (text) timelineEntry.timelineEvents[year] = { text, manual: true };
      else delete timelineEntry.timelineEvents[year];
      saveEmaxDB(db);
      emaxTimelineEditingYear = null;
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
      return;
    }
    const cancelBtn = e.target.closest('[data-year-cancel]');
    if (cancelBtn) {
      emaxTimelineEditingYear = null;
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
      return;
    }
    const editBtn = e.target.closest('[data-year-edit]');
    if (editBtn) {
      emaxTimelineEditingYear = editBtn.dataset.yearEdit;
      emaxTimelineExpandedYear = emaxTimelineEditingYear;
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
      return;
    }
    const chip = e.target.closest('.emax-timeline-chip');
    if (chip) {
      const year = chip.dataset.year;
      emaxTimelineEditingYear = null;
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

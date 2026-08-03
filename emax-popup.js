/* ===================== EMAX Item Popup + Timeline (shared) =====================
 * Moved out of emax-category.js (2026-08-02) so the Audit/Nomination
 * "tap-to-detail" list on emax.html can open the exact same popups in
 * place, instead of needing to navigate to that item's category page
 * first. Loaded on BOTH emax-category.html and emax.html, after
 * db-core.js/compat-engine.js/compat-render.js/emax-seed-data.js and
 * before that page's own script.
 *
 * openItemModal itself works on either page: emax-category.html declares
 * a page-level `category` global (the page's own category) that gates
 * Edit/Delete for "is this really this page's own entry, or a foreign one
 * opened via a linked-person banner" - emax.html has no such global at
 * all (every entry it opens is "foreign" in that sense), so `category`
 * being undefined there is used as the signal to always show Edit/Delete,
 * with Edit navigating to the real owning category page (the add/edit
 * form only exists there) and Delete working in place via the
 * category-agnostic emaxRemoveEntryById (db-core.js).
 *
 * openTimelineModal (tapping the item popup's own image) never had any
 * page-scoped dependency at all - it already worked purely off `db` and
 * the entry itself, so it moved over unchanged, no branching needed.
 */

const EMAX_IMAGE_CACHE_KEY = 'numerology_emax_images_v1';
let emaxImageCache = {};
try { emaxImageCache = JSON.parse(localStorage.getItem(EMAX_IMAGE_CACHE_KEY)) || {}; } catch (e) { emaxImageCache = {}; }

// tryLogoFirst: brand categories check Wikidata's own logo property first
// (see lookupLogoImageUrl in db-core.js) before falling back to whatever
// photo the Wikipedia page's own summary leads with. Either path's result
// lands in the same cache, keyed by title alone.
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

/* ---- Star rating widget ---- */

function starsHtml(entryId, rating) {
  let html = `<span class="emax-stars" data-entry="${entryId}">`;
  for (let i = 1; i <= 5; i++) {
    html += `<button class="emax-star${i <= (rating || 0) ? ' filled' : ''}" data-star="${i}" type="button" title="Rate ${i}">&#9733;</button>`;
  }
  html += `</span>`;
  return html;
}

// Clicking the star already showing your current rating clears it back to
// unrated, rather than being stuck re-affirming the same number forever.
// Searches every category, not just the current page's - entry.id (uid())
// is globally unique, so this is a strict superset of the old current-
// -category-only behavior, needed for rating an Artists entry from the
// Songs page's artist banner (categoryNameOverride's popup, same star UI),
// and now also from an emax.html detail-popup entry.
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

// Brand categories try Wikidata's own logo property first (emaxFetchImage's
// tryLogoFirst) - a logo mark cropped to fill a square/circle the way a
// face-photo cover-fit would (object-fit:cover) chops off exactly the parts
// that make it recognizable. These get object-fit:contain + a light card
// behind them instead (see .logo in style.css) so the whole mark stays
// visible.
function emaxIsLogoCategory(categoryName) {
  return EMAX_YEAR_FILTER_KIND[categoryName] === 'founded';
}

// A date "kind" (from EMAX_YEAR_FILTER_KIND's category default, or an
// entry's own dateKind when a lookup resolved one) as a human verb on the
// date line - no match (a custom category with no known kind, or a
// hand-typed date) just shows the bare date with no verb prefix.
const EMAX_DATE_KIND_LABEL = { founded: 'Founded', born: 'Born', released: 'Released', opened: 'Opened', renamed: 'Renamed', launched: 'Launched', aired: 'Aired', invented: 'Invented', occurred: 'Occurred', started: 'Started' };

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

// Categories with a linked-person config (EMAX_LINKED_PERSON_CONFIG - Songs'
// artist, Video Games' designer/director, Books' author): the QID a
// successful "Look up" resolved that person to - lets "+ Add to Database"
// (in the popup) skip straight to fetchKeyDate instead of a name re-search.
//
// manualDate (Inventors' own Invention field, 2026-08-03): the linked
// "thing" here is an invention, not a person - there's no reliable live
// Wikidata lookup for "what did this specific person invent and when", so
// its date is typed by hand alongside its name instead of resolved via
// lookupFn (null for this one). See emaxAutoAddLinkedEntityWithDate below,
// and emaxLinkedPersonBannerHtml's own manualDate branch (no "+ Add to
// Database" fallback offered - there's nothing left for it to look up).
const EMAX_LINKED_PERSON_CONFIG = {
  Songs: { field: 'artist', label: 'Artist', lookupFn: lookupPerformerForSong, targetCategory: 'Artists' },
  'Video Games': { field: 'director', label: 'Director', lookupFn: lookupDirectorForGame, targetCategory: 'Artists' },
  Books: { field: 'author', label: 'Author', lookupFn: lookupAuthorForBook, targetCategory: 'Authors' },
  Inventors: { field: 'invention', label: 'Invention', lookupFn: null, targetCategory: 'Inventions', manualDate: true },
};

// A "how big/destructive was it" severity field, orthogonal to the
// compatibility date every category already has - Earthquakes/Hurricanes
// are the user's own explicit request (2026-08-03: "there should be a
// different filter for their strength / how big or destructive they
// were"), Saffir-Simpson Category 1-5 for hurricanes per their own choice.
// 'numeric' is a free decimal value with an Over/Under filter (same shape
// as the existing Score filter); 'scale' is a small fixed 1-max integer
// range with an At least/Exactly filter (same shape as the existing Stars
// filter) - two different real-world scales, so two different UI shapes,
// same as EMAX_LINKED_PERSON_CONFIG's own manualDate branch exists because
// Inventors' Invention needed different UI than Songs' Artist. No live
// Wikidata lookup for either (unlike a date) - always typed by hand or
// baked into a seed entry, same reasoning as Inventors' invention date.
const EMAX_SEVERITY_CONFIG = {
  Earthquakes: { field: 'magnitude', kind: 'numeric', label: 'Magnitude', min: 0, max: 10, step: 0.1 },
  Hurricanes: { field: 'hurricaneCategory', kind: 'scale', label: 'Category', min: 1, max: 5 },
};

// The popup header's own severity line, right under the date - entirely
// absent (returns '') for any category with no EMAX_SEVERITY_CONFIG entry,
// or an entry that was saved/preloaded with no severity value at all.
function emaxSeverityLine(entry, categoryName) {
  const cfg = EMAX_SEVERITY_CONFIG[categoryName];
  if (!cfg) return '';
  const value = entry[cfg.field];
  if (value == null) return '';
  const display = cfg.kind === 'numeric' ? Number(value).toFixed(1) : String(value);
  return `<div class="emax-modal-severity">${escapeHtml(cfg.label)} ${escapeHtml(display)}</div>`;
}

// A plain YouTube SEARCH link (never a guessed video id, which could easily
// land on the wrong upload or a cover) - `query` builds the search text,
// `label` is the button's own wording so it reads naturally for what's
// actually being searched.
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
  Inventors: { label: '▶ Watch Documentary', query: (entry) => `${entry.name} inventor documentary` },
  Inventions: { label: '▶ Watch Explainer', query: (entry) => `${entry.name} invention history` },
  'US Presidents': { label: '▶ Watch Documentary', query: (entry) => `${entry.name} president documentary` },
  Earthquakes: { label: '▶ Watch Footage', query: (entry) => `${entry.name} earthquake footage` },
  Hurricanes: { label: '▶ Watch Footage', query: (entry) => `${entry.name} hurricane footage` },
  'Power Outages': { label: '▶ Watch News Coverage', query: (entry) => `${entry.name} news coverage` },
  Wars: { label: '▶ Watch Documentary', query: (entry) => `${entry.name} documentary` },
  'Plane Crashes': { label: '▶ Watch Documentary', query: (entry) => `${entry.name} documentary` },
  DEFAULT: { label: '▶ Search on YouTube', query: (entry) => entry.name },
};

// entry[cfg.field+'Name'] (set by cfg.lookupFn at Preload/Look-up time, or
// typed by hand) gets its own small banner in the item's popup - the linked
// person's own compatibility, a separate number from the item's own score
// already shown above. If that person already exists in the Artists
// category (matched by name), the banner shows their real score and opens
// THEIR popup on tap (openItemModal again, with an 'Artists' override so it
// behaves exactly as it would from that page). If not, there's nothing to
// score yet, so it offers "+ Add to Database" instead. cfg is null for
// every category without a config above - returns '' immediately.
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

  // manualDate (Inventors' Invention) has no live source a button could
  // look anything up from - by the time this popup is ever opened, the
  // invention should already have been auto-added (emaxAutoAddLinkedEntity
  // WithDate, called synchronously at save time) if a date was ever given
  // for it at all. Nothing left to offer here if it somehow still isn't.
  if (cfg.manualDate) return '';

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
// Artists entry, else falls back to the name itself (the resolved
// Wikipedia title from cfg.lookupFn). Resolves to a URL, or null (never
// fetches when noImage is set).
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
// sync string builder. The real photo is a separate async enhancement,
// called right after the banner HTML lands in the DOM (openItemModal),
// same "paint monogram first, swap in the real image once it resolves"
// pattern as everywhere else in this app.
function emaxLoadLinkedPersonBannerImage(entry, cfg) {
  if (!cfg || !entry[cfg.field + 'Name']) return;
  emaxLinkedPersonImageUrl(entry, cfg).then((url) => {
    if (!url) return;
    const thumbEl = document.getElementById('emaxArtistBannerThumb');
    if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
  });
}

// The "+ Add to Database" click: resolves the linked person's own birthdate
// and adds them to cfg.targetCategory (Artists for Songs/Video Games,
// Authors for Books). On success, immediately opens their real popup.
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

// Silent counterpart to "+ Add to Database" above (2026-08-03, the user's
// own call) - fires automatically the moment a linked person's name+qid is
// newly attached to an entry (manual add/edit, Look Up, Preload), instead
// of waiting for a button click. No UI side effects (no button state, no
// popup navigation) - safe to call mid-loop during a bulk preload just as
// easily as from a single manual add. The button in
// emaxLinkedPersonBannerHtml is still there as a manual retry path for
// whatever this couldn't resolve (most often a group/band with no
// birthdate at all) or a pre-existing entry saved before this existed.
async function emaxAutoAddLinkedPerson(personName, personQid, targetCategoryName) {
  if (!personName || !targetCategoryName) return;
  const targetCat = db.categories.find((c) => c.name === targetCategoryName);
  if (!targetCat || targetCat.entries.some((e) => e.name.toLowerCase() === personName.toLowerCase())) return;

  let info = null;
  try {
    info = personQid ? await fetchKeyDate(personQid) : await lookupBirthDateOrYearWithTitle(personName);
  } catch (e) { info = null; }
  if (!info || (!info.date && !info.year)) return; // nothing found (often a band) - silently skip, same as before this existed

  // Re-check right before pushing - another call already in flight (e.g.
  // two songs by the same artist added back to back) could have added them
  // while this fetch was running.
  if (targetCat.entries.some((e) => e.name.toLowerCase() === personName.toLowerCase())) return;
  const newEntry = { id: uid(), name: personName };
  if (info.date) { newEntry.date = info.date; newEntry.dateKind = info.kind; }
  else { newEntry.year = info.year; }
  targetCat.entries.push(newEntry);
  saveEmaxDB(db);
}

// Same idea as emaxAutoAddLinkedPerson, but for a manualDate config
// (Inventors' own Invention) whose date is already known directly - no
// Wikidata fetch to make, so this is synchronous and can run inline before
// the entry itself even saves.
function emaxAutoAddLinkedEntityWithDate(name, date, targetCategoryName) {
  if (!name || !date || !targetCategoryName) return;
  const targetCat = db.categories.find((c) => c.name === targetCategoryName);
  if (!targetCat || targetCat.entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
  targetCat.entries.push({ id: uid(), name, date });
  saveEmaxDB(db);
}

/* ---- Same-sign zodiac override ---- */
// Non-person items only (Artists = real people, always the plain computed
// score): when the item's Vietnamese zodiac sign matches yours on an axis -
// "a horse wearing horse brands" is optimal energy - that axis's score
// becomes a flat 99 instead of whatever vietnameseCompat's table has for a
// same-animal pairing, then blends via the SAME year>month>day weighting
// compat-engine.js's own defaults use. Numerology and Western stay exactly
// as computeCompatibility already computed them; only the Vietnamese axis
// and the top-level blend get recomputed, using COMPAT_DEFAULT_WEIGHTS' own
// real numerology/vietnamese/western split - this NEVER edits
// compat-engine.js, it only consumes it more than once.
//
// categoryName: the item's OWN category (not necessarily "the current
// page's category" - emax.html has no such thing, and even on
// emax-category.html a caller can be scoring an entry from a different
// category than the page's own, e.g. scoredEntries always passes its own
// page's category.name explicitly rather than this function assuming it).
function emaxAdjustedCompatibility(meDate, themDate, categoryName) {
  const result = computeCompatibility(meDate, themDate);
  // Real PEOPLE (any category whose date is a birthdate - Artists,
  // YouTubers, Historical Figures, Authors) are exempt from the same-sign
  // override below: a matching Vietnamese zodiac sign is a meaningful
  // thematic-alignment signal for a brand/movie/song, but not something
  // that should artificially boost an actual person's real numerological
  // compatibility.
  if (EMAX_YEAR_FILTER_KIND[categoryName] === 'born') return result;

  // Life Path 9 matched against Life Path 9 scores very low (10) in the core
  // person-to-person table (NUMEROLOGY_TABLE[9][9], compat-data.js) - two
  // PEOPLE who are both 9 (the completion/letting-go number) can genuinely
  // clash. That reading doesn't transfer to a brand/movie/song sharing your
  // Life Path 9: there's no interpersonal friction to have, so it reads as a
  // strong thematic match instead. Only the Life Path sub-score is touched -
  // Day Number and Day-of-Year keep whatever computeCompatibility already
  // found for them, same "never edit compat-engine.js, just recompose what
  // it already returned" approach as the Vietnamese override below.
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
// digits actually triggered it ('entity' = mine, 'day' = the item's). The
// engine always writes "your lucky digits" regardless of direction since it
// has no notion of "the viewer"; EMAX does, so a 'day' note gets rewritten
// to name the item instead of reading as if the fact were about the
// viewer's own digits.
function emaxRewriteBonusNotes(bonuses, themName) {
  if (!bonuses || !bonuses.notes.length) return bonuses;
  const notes = bonuses.notes.map((note) => {
    if (typeof note === 'string') return note; // no direction info - leave as-is
    if (note.from !== 'day') return note.text;
    return note.text.replace(/\byour lucky (digits|number)\b/g, `${themName}'s lucky $1`);
  });
  return { total: bonuses.total, notes };
}

/* ===================== Item popup ===================== */
// Quick-glance facts up top (image, Life Path, Day Born, Chinese Month/Day
// animal, your rating), the full two-way compatibility breakdown
// (compat-render.js, same component the Database's "Compare with me" and
// the Compatibility Calculator already use) underneath.
//
// categoryNameOverride: lets a DIFFERENT page open this same popup for an
// entry that doesn't belong to its own category - the Songs artist banner
// opens an Artists-category entry while still on the Songs page, and needs
// this to behave exactly as it would from the Artists page itself. Also
// how emax.html's Audit/Nomination detail popup opens ANY entry - it
// always passes an explicit override, since it has no "own category" at
// all. Defaults to the current page's own category (emax-category.html
// only) when omitted.
// backTo: { entry, categoryNameOverride } of whatever popup navigated INTO
// this one - renders a "Back to" link at the top so following the banner
// into the artist's own profile doesn't strand you there with no way back
// except closing the modal outright. undefined for every ordinary open.
function openItemModal(entry, categoryNameOverride, backTo) {
  // emax-category.html declares a page-level `category` global; emax.html
  // does not - that absence is the signal this popup is being opened from
  // a page with no "own category" concept of its own, so Edit/Delete
  // should always be offered (Edit navigating to the real owning category
  // page instead of editing in place, since the add/edit form only exists
  // there).
  const onCategoryPage = typeof category !== 'undefined' && !!category;
  const effectiveCategoryName = categoryNameOverride || (onCategoryPage ? category.name : null);
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
  // Real people (any 'born'-kind category) are always exempt from the
  // same-sign 99% override - emaxAdjustedCompatibility applies the exact
  // same exemption given the item's own effectiveCategoryName.
  const result = EMAX_YEAR_FILTER_KIND[effectiveCategoryName] === 'born' ? computeCompatibility(meDate, themDate) : emaxAdjustedCompatibility(meDate, themDate, effectiveCategoryName);
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
  // today) pattern used everywhere else in the app - "today" is always the
  // real current date. Raw (unreduced) values are computed separately for
  // the tap-to-reveal compound view below.
  const today = new Date();
  const energyFlow = computeEnergyFlow(themDate, today);
  const personalYear = energyFlow.numerology.personalYear;
  const personalMonth = energyFlow.numerology.personalMonth;
  const personalDay = energyFlow.numerology.personalDay;
  const personalYearCompound = getPersonalYearRaw(themDate, today);
  const personalMonthCompound = getPersonalMonthRaw(themDate, today);
  const personalDayCompound = getPersonalDayRaw(personalMonth, today);

  // entry.dateKind (set when a lookup - Preload or "Look up" - resolved this
  // specific entry's date) is more accurate than the category's default kind.
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

  // Shown whenever we know an entry's owning category is safe to manage
  // from here: on emax-category.html, only for that page's own entries
  // (unchanged from before this popup was shared - a foreign entry opened
  // via a linked-person banner still isn't editable from within it). On
  // emax.html (no `category` global at all), always - Edit/Delete are the
  // whole point of "the full popup, identical to the category page".
  const showActions = onCategoryPage ? (effectiveCategoryName === category.name) : true;
  const actionsHtml = showActions ? `
    <div class="emax-modal-actions">
      <button type="button" id="itemModalEditBtn">✎ Edit</button>
      <button type="button" class="emax-modal-delete" id="itemModalDeleteBtn">🗑 Delete</button>
    </div>` : '';

  document.getElementById('itemModalHeader').innerHTML = `
    <div class="emax-modal-hero-v2">
      ${backHtml}
      ${actionsHtml}
      <div class="emax-modal-image ${scoreCls}${emaxIsLogoCategory(effectiveCategoryName) ? ' logo' : ''}" id="itemModalImage">${emaxMonogram(entry.name, true)}</div>
      ${starsHtml(entry.id, entry.rating || 0)}
      <div class="emax-modal-name">${escapeHtml(entry.name)}</div>
      <div class="emax-modal-date">${escapeHtml(dateLine)}</div>
      ${emaxSeverityLine(entry, effectiveCategoryName)}
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
      if (onCategoryPage && effectiveCategoryName === category.name) {
        closeItemModal();
        startEdit(entry);
      } else {
        // The add/edit form only exists on the category page - jump there
        // with the edit form already open, rather than duplicating that
        // whole form (lookup/autocomplete included) a second time here.
        const ownerCat = db.categories.find((c) => c.entries.some((en) => en.id === entry.id));
        if (ownerCat) window.location.href = `emax-category.html?id=${encodeURIComponent(ownerCat.id)}&edit=${encodeURIComponent(entry.id)}`;
      }
      return;
    }

    const deleteBtn = e.target.closest('#itemModalDeleteBtn');
    if (deleteBtn) {
      if (confirm(`Delete "${entry.name}"?`)) {
        if (onCategoryPage && typeof deleteEntry === 'function' && category.entries.some((en) => en.id === entry.id)) {
          deleteEntry(entry.id); // page-specific: also refreshes this page's own list
        } else {
          emaxRemoveEntryById(db, entry.id);
          saveEmaxDB(db);
        }
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

  document.getElementById('itemModalOverlay').classList.add('active');
}

function closeItemModal() {
  document.getElementById('itemModalOverlay').classList.remove('active');
}

document.getElementById('itemModalBody').addEventListener('click', (e) => {
  const starBtn = e.target.closest('.emax-star');
  if (!starBtn) return;
  const starsEl = starBtn.closest('.emax-stars');
  const entry = setRating(starsEl.dataset.entry, Number(starBtn.dataset.star));
  if (entry) starsEl.outerHTML = starsHtml(entry.id, entry.rating || 0);
  // Only defined on emax-category.html - keeps that page's own list in
  // sync while the popup stays open; nothing to sync on emax.html.
  if (typeof renderEntries === 'function') renderEntries();
});

document.getElementById('itemModalClose').addEventListener('click', closeItemModal);
document.getElementById('itemModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'itemModalOverlay') closeItemModal();
});

/* ===================== Timeline mini-popup (2026-08-01) ===================== */
// The pure computation (emaxEnemyZodiacAnimal, emaxTrineZodiacAnimals,
// emaxFriendlyZodiacAnimals, emaxPersonalYearForYear, emaxTimelineYearVerdict,
// emaxBuildTimeline, emaxFetchYearEvents) lives in db-core.js - none of them
// ever depended on a page-scoped `category`, just the ordinary shared-
// global-scope pattern every script in this app already relies on.

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
// emaxPreloading/pendingWikiTitle elsewhere in this app.
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

// key: "1990" for a year with no birthday split, "1990:early"/"1990:late"
// for the two real periods of a year that does split (see
// emaxYearPersonalYearPeriods, db-core.js) - keeps expand/edit state
// independently addressable per period even though they share a calendar
// year number. emaxYearPeriodLabel (db-core.js) builds the matching
// human-readable chip text ("1990" vs "1990 (early)"/"1990 (late)").
//
// |magnitude| >= 2 means at least 2 stacked/reinforcing signals landed on
// this one period (e.g. Enemy Year + Personal Year 7 + a confirmed
// negative event) - gets a visibly heavier chip so a severe period doesn't
// read identically to one that's only barely on the bad/good side.
function emaxTimelineChipHtml(year, part, verdict, tags, magnitude) {
  const key = `${year}:${part}`;
  const expanded = key === String(emaxTimelineExpandedYear);
  const severe = typeof magnitude === 'number' && Math.abs(magnitude) >= 2;
  const tagPrefix = (tags && tags.length) ? tags.map(emaxTagEmoji).join('') + ' ' : '';
  return `<button type="button" class="emax-timeline-chip ${verdict}${expanded ? ' expanded' : ''}${severe ? ' severe' : ''}" data-year-key="${key}">${tagPrefix}${emaxYearPeriodLabel(year, part)}</button>`;
}

function emaxTagPickerHtml() {
  return `<div class="emax-tag-picker">${EMAX_TIMELINE_TAGS.map((t) => `<button type="button" class="emax-tag-chip${emaxTimelineEditingTags.includes(t.key) ? ' active' : ''}" data-tag-toggle="${t.key}">${t.emoji} ${t.label}</button>`).join('')}</div>`;
}

// Plain-English severity line ("Severity: -2 (2 stacked reasons)") - a
// year with no confirmed event (never fetched, or fetched and nothing
// found) always reads a flat "0 (mixed/neutral)" here now, per
// emaxYearMagnitude's own "if there's nothing found it should not affect
// the score" rule (db-core.js) - pure zodiac/numerology speculation with
// no real evidence behind it doesn't get to read as "leans bad/good".
function emaxTimelineSeverityLabel(magnitude) {
  if (magnitude > 0) return `+${magnitude} (leans good)`;
  if (magnitude < 0) return `${magnitude} (leans bad)`;
  return '0 (mixed/neutral)';
}

// A year's expand/edit row is rendered once per SECTION it appears in (the
// same year, e.g. 2019, can be both an Own Year and a Personal Year 7 at
// once - see emaxTimelineYearVerdict) - always the same underlying note,
// shown consistently wherever that year/period is flagged. The note itself
// is still stored per bare calendar year (entry.timelineEvents[year]) -
// splitting storage per period would need a real data migration, so a
// split year's early/late periods share the one slot; which period (if
// any) the note applies to is tracked separately via ev.confirmedPart
// ('early'/'late'), set by the per-period confirm checkbox below.
//
// A quick way to actually go find out what happened - opens a Google
// search for "<name> in <year> events timeline" in a new tab, right next
// to that year's Edit/+ Add note action.
function emaxYearSearchUrl(name, year) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} in ${year} events timeline`)}`;
}

function emaxTimelineEventRowHtml(entry, year, part, magnitude) {
  const ev = entry.timelineEvents && entry.timelineEvents[year];
  const key = `${year}:${part}`;
  const editing = key === String(emaxTimelineEditingYear);
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
          <button type="button" class="btn-link" data-year-save="${key}">Save</button>
          <button type="button" class="btn-link" data-year-cancel="${key}">Cancel</button>
        </div>
      </div>`;
  }
  if (ev) {
    const tagsHtml = (ev.tags && ev.tags.length)
      ? `<div class="emax-timeline-event-tags">${ev.tags.map((k) => `<span class="emax-timeline-tag-pill">${emaxTagEmoji(k)} ${EMAX_TIMELINE_TAGS.find((t) => t.key === k) ? EMAX_TIMELINE_TAGS.find((t) => t.key === k).label : k}</span>`).join('')}</div>`
      : '';
    // part !== 'whole' means this calendar year straddles two different
    // Personal Years - a scraped/manual note only ever carries year
    // precision, so it can't be attributed to a specific period by
    // default. Checking the box below explicitly confirms which one it
    // happened in - the only thing that makes it count toward THAT
    // period's Audit/Number Nomination numbers (emaxEventConfirmedForPart,
    // db-core.js).
    const confirmedForThis = part !== 'whole' && ev.confirmedPart === part;
    const confirmHtml = part !== 'whole'
      ? `<label class="emax-timeline-confirm-part">
          <input type="checkbox" data-year-confirm="${key}"${confirmedForThis ? ' checked' : ''}>
          Confirm this happened during this period
        </label>
        <div class="emax-timeline-split-caveat">${confirmedForThis
          ? 'Confirmed for this period - counts toward the Audit and Number Nomination.'
          : "Not confirmed for this period - doesn't count toward the Audit or Number Nomination yet."}</div>`
      : '';
    return `
      <div class="emax-timeline-event-row">
        <div class="emax-timeline-event-text">${escapeHtml(ev.text)}</div>
        ${tagsHtml}
        ${confirmHtml}
        ${severityHtml}
        <div class="emax-timeline-event-meta">
          <span>${ev.manual ? 'Your note' : 'From Wikipedia'}</span>
          <div class="emax-timeline-event-actions">
            <a class="btn-link" href="${emaxYearSearchUrl(entry.name, year)}" target="_blank" rel="noopener">Search</a>
            <button type="button" class="btn-link" data-year-edit="${key}">Edit</button>
          </div>
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
      <div class="emax-timeline-event-actions">
        <a class="btn-link" href="${emaxYearSearchUrl(entry.name, year)}" target="_blank" rel="noopener">Search</a>
        <button type="button" class="btn-link" data-year-edit="${key}">+ Add note</button>
      </div>
    </div>`;
}

// A chip's note used to expand INLINE right below it - on a long timeline
// (dozens of sections, hundreds of years for something centuries old) that
// meant scrolling all the way down to actually see what you just tapped.
// Tapping a chip now opens it in a small popup on top instead (see
// openEmaxYearDetailPopup below) - this section only ever renders chips.
function emaxTimelineSectionHtml(entry, title, years) {
  const chipsHtml = years.length
    ? `<div class="emax-timeline-chips">${years.map(({ year, part, verdict, magnitude }) => {
        const ev = entry.timelineEvents && entry.timelineEvents[year];
        return emaxTimelineChipHtml(year, part, verdict, ev && ev.tags, magnitude);
      }).join('')}</div>`
    : '<div class="emax-timeline-empty">None yet</div>';
  return `
    <div class="emax-timeline-section">
      <div class="emax-timeline-section-title">${escapeHtml(title)}</div>
      ${chipsHtml}
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

// A centuries-old historical figure's timeline can have dozens or hundreds
// of years tied at the same magnitude (no confirmed events for most of a
// 500-year span, so the base zodiac/numerology signal alone repeats
// constantly) - listing every single one turns the headline into a wall of
// text. Past this many ties, state the count instead of the list itself -
// still honest about how many really tied (no arbitrary pick of which few
// to show), just not an unreadable dump of every year.
const EMAX_TIMELINE_HEADLINE_MAX_LISTED = 6;
function emaxTimelineHeadlinePart(label, years, magnitude) {
  if (!years.length) return '';
  const plural = years.length > 1 ? 's' : '';
  if (years.length > EMAX_TIMELINE_HEADLINE_MAX_LISTED) {
    return `${label} Year${plural}: ${years.length} tied at ${emaxMagnitudeSigned(magnitude)}`;
  }
  return `${label} Year${plural}: ${years.join(', ')} (${emaxMagnitudeSigned(magnitude)})`;
}

function emaxTimelineHeadlineHtml(timeline) {
  const { worstYears, worstMagnitude, bestYears, bestMagnitude } = timeline;
  if (!worstYears.length && !bestYears.length) return '';
  const worstPart = emaxTimelineHeadlinePart('Worst', worstYears, worstMagnitude);
  const bestPart = emaxTimelineHeadlinePart('Best', bestYears, bestMagnitude);
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

// A chip's year/part is guaranteed to exist in at least one of these 6
// arrays (that's the only way it could have rendered a chip at all) - the
// SAME row object (magnitude included) can be flagged into more than one
// (e.g. both an Own Year and a Personal Year 7), so any match is correct.
function emaxFindTimelineRow(timeline, year, part) {
  const all = [...timeline.ownYears, ...timeline.trineYears, ...timeline.friendlyYears, ...timeline.enemyYears, ...timeline.py7Years, ...timeline.py11Years];
  return all.find((r) => r.year === year && r.part === part);
}

// Opens a single year/period's note in its own small popup, stacked on top
// of the Timeline modal (same "later in the DOM stacks visually over the
// modal behind it" convention as the Audit/Nomination detail popup opening
// the real item popup on top of itself) - "just open a mini popup, not
// make me scroll down for it" (2026-08-02): a long timeline's chip used to
// expand inline, which could be far below the fold.
function openEmaxYearDetailPopup(entry, year, part, magnitude) {
  emaxTimelineExpandedYear = `${year}:${part}`;
  emaxTimelineEditingYear = null;
  emaxTimelineEditingTags = [];
  emaxTimelineDraftText = null;
  renderEmaxYearDetailPopup(entry, year, part, magnitude);
  document.getElementById('emaxYearDetailOverlay').classList.add('active');
}

function renderEmaxYearDetailPopup(entry, year, part, magnitude) {
  document.getElementById('emaxYearDetailBody').innerHTML = `
    <div class="box-label">${escapeHtml(entry.name)} &middot; ${emaxYearPeriodLabel(year, part)}</div>
    ${emaxTimelineEventRowHtml(entry, year, part, magnitude)}
  `;
}

// Re-renders the popup for whichever year/part is currently open, looking
// its (possibly just-changed) magnitude back up from the current timeline
// - used after save/cancel/confirm/tag-toggle, the same way those used to
// just re-render the whole Timeline body when the note lived inline.
function refreshEmaxYearDetailPopup(entry) {
  if (!emaxTimelineExpandedYear) return;
  const [yearStr, part] = String(emaxTimelineExpandedYear).split(':');
  const year = Number(yearStr);
  const row = emaxFindTimelineRow(emaxTimelineCurrentTimeline, year, part);
  renderEmaxYearDetailPopup(entry, year, part, row ? row.magnitude : null);
}

function closeEmaxYearDetailPopup() {
  document.getElementById('emaxYearDetailOverlay').classList.remove('active');
  const timelineEntry = emaxTimelineFindEntryById(emaxTimelineCurrentEntryId);
  emaxTimelineExpandedYear = null;
  emaxTimelineEditingYear = null;
  emaxTimelineEditingTags = [];
  emaxTimelineDraftText = null;
  // Un-highlights the chip and picks up anything changed while the popup
  // was open (a new tag emoji, an updated Worst/Best Years headline).
  if (timelineEntry && emaxTimelineCurrentTimeline) renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
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
  document.getElementById('emaxYearDetailOverlay').classList.remove('active');

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
  document.getElementById('emaxYearDetailOverlay').classList.remove('active');
}

document.getElementById('emaxTimelineClose').addEventListener('click', closeTimelineModal);
document.getElementById('emaxTimelineOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'emaxTimelineOverlay') closeTimelineModal();
});

document.getElementById('emaxYearDetailClose').addEventListener('click', closeEmaxYearDetailPopup);
document.getElementById('emaxYearDetailOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'emaxYearDetailOverlay') closeEmaxYearDetailPopup();
});

// Only chip clicks happen here now - the note/edit UI itself lives in the
// year-detail popup below, opened fresh for whichever chip was tapped.
document.getElementById('emaxTimelineBody').addEventListener('click', (e) => {
  const timelineEntry = emaxTimelineFindEntryById(emaxTimelineCurrentEntryId);
  if (!timelineEntry || !emaxTimelineCurrentTimeline) return;
  const chip = e.target.closest('.emax-timeline-chip');
  if (!chip) return;
  const key = chip.dataset.yearKey;
  const [yearStr, part] = key.split(':');
  const year = Number(yearStr);
  const row = emaxFindTimelineRow(emaxTimelineCurrentTimeline, year, part);
  openEmaxYearDetailPopup(timelineEntry, year, part, row ? row.magnitude : null);
  renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
});

document.getElementById('emaxYearDetailBody').addEventListener('click', (e) => {
  const timelineEntry = emaxTimelineFindEntryById(emaxTimelineCurrentEntryId);
  if (!timelineEntry || !emaxTimelineCurrentTimeline) return;

  const saveBtn = e.target.closest('[data-year-save]');
  if (saveBtn) {
    // data-year-save carries the compound "year:part" key (UI state), but
    // the note itself is always stored under the bare calendar year - a
    // split year's early/late periods share the one slot.
    const year = saveBtn.dataset.yearSave.split(':')[0];
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
    refreshEmaxYearDetailPopup(timelineEntry);
    renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
    return;
  }
  const cancelBtn = e.target.closest('[data-year-cancel]');
  if (cancelBtn) {
    emaxTimelineEditingYear = null;
    emaxTimelineEditingTags = [];
    emaxTimelineDraftText = null;
    refreshEmaxYearDetailPopup(timelineEntry);
    return;
  }
  const confirmCheckbox = e.target.closest('[data-year-confirm]');
  if (confirmCheckbox) {
    // data-year-confirm carries the compound "year:part" key - checking it
    // marks THIS period as the one the shared note actually happened in
    // (ev.confirmedPart), unchecking clears it back to unconfirmed.
    const [confirmYear, confirmPart] = confirmCheckbox.dataset.yearConfirm.split(':');
    const ev = timelineEntry.timelineEvents && timelineEntry.timelineEvents[confirmYear];
    if (ev) {
      ev.confirmedPart = confirmCheckbox.checked ? confirmPart : null;
      saveEmaxDB(db);
      // Rebuilds - confirmedPart directly changes whether this period's
      // event bonus/tags count toward its magnitude (db-core.js
      // emaxEventConfirmedForPart), which was baked in at the timeline's
      // last build, before this toggle.
      emaxTimelineCurrentTimeline = emaxBuildTimeline(parseDateStr(timelineEntry.date), timelineEntry);
      refreshEmaxYearDetailPopup(timelineEntry);
      renderTimelineBody(timelineEntry, emaxTimelineCurrentTimeline);
    }
    return;
  }
  // Toggling a tag re-renders the popup (same "rebuild from state" pattern
  // as everything else here) - capture whatever's already typed in the
  // textarea first, or it would reset back to the saved text.
  const tagBtn = e.target.closest('[data-tag-toggle]');
  if (tagBtn) {
    emaxTimelineDraftText = document.getElementById('emaxTimelineNoteInput').value;
    const tag = tagBtn.dataset.tagToggle;
    const idx = emaxTimelineEditingTags.indexOf(tag);
    if (idx === -1) emaxTimelineEditingTags.push(tag); else emaxTimelineEditingTags.splice(idx, 1);
    refreshEmaxYearDetailPopup(timelineEntry);
    return;
  }
  const editBtn = e.target.closest('[data-year-edit]');
  if (editBtn) {
    // data-year-edit carries the compound "year:part" key - the note
    // itself is looked up by the bare year (its actual storage key).
    emaxTimelineEditingYear = editBtn.dataset.yearEdit;
    emaxTimelineExpandedYear = emaxTimelineEditingYear;
    const bareYear = emaxTimelineEditingYear.split(':')[0];
    const existingEvent = timelineEntry.timelineEvents && timelineEntry.timelineEvents[bareYear];
    emaxTimelineEditingTags = (existingEvent && existingEvent.tags) ? existingEvent.tags.slice() : [];
    emaxTimelineDraftText = null;
    refreshEmaxYearDetailPopup(timelineEntry);
    return;
  }
});

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

// Categories with a linked-person config (EMAX_LINKED_PERSON_CONFIG - Songs'
// artist, Video Games' designer/director, Books' author): the QID a
// successful "Look up" resolved that person to - lets "+ Add to Database"
// (in the popup) skip straight to fetchKeyDate instead of a name re-search.
const EMAX_LINKED_PERSON_CONFIG = {
  Songs: { field: 'artist', label: 'Artist', lookupFn: lookupPerformerForSong, targetCategory: 'Artists' },
  'Video Games': { field: 'director', label: 'Director', lookupFn: lookupDirectorForGame, targetCategory: 'Artists' },
  Books: { field: 'author', label: 'Author', lookupFn: lookupAuthorForBook, targetCategory: 'Authors' },
};

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

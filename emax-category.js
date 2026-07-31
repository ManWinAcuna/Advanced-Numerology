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
// Songs only: the QID a successful "Look up" resolved the performer to via
// P175 (see lookupPerformerForSong, db-core.js) - lets "+ Add to Database"
// (in the popup) skip straight to fetchKeyDate instead of a name re-search.
// The artist NAME itself is the visible #newEntryArtist field, not a hidden
// var - "Look up" fills it in, but it's always user-editable/typeable, since
// P175 doesn't resolve for every song and there was previously no way to
// attach an artist by hand at all. Same cleared-on-hand-edit lifecycle as
// pendingWikiTitle/pendingDateKind.
let pendingArtistQid = null;
// Guards a lookup response against a newer one that started after it (e.g.
// fixing a typo and re-clicking Look Up before the first request lands).
let lookupToken = 0;

// The "show scores over/under X" filter (emaxFilterRow) - null means no
// filter is active. Only affects which rows renderEntries() prints; sorting
// and everything else on the page stays exactly as it already was.
let scoreFilterValue = null;
let scoreFilterMode = 'over';

// Declared here (ahead of init() below) rather than down by emaxFetchImage
// itself - renderEntries() now loads row images synchronously off of
// init(), which runs immediately at module load, before any `let` further
// down this file has been reached; a hoisted function calling into it that
// early would otherwise hit a genuine temporal-dead-zone ReferenceError.
const EMAX_IMAGE_CACHE_KEY = 'numerology_emax_images_v1';
let emaxImageCache = {};
try { emaxImageCache = JSON.parse(localStorage.getItem(EMAX_IMAGE_CACHE_KEY)) || {}; } catch (e) { emaxImageCache = {}; }

if (!category) {
  document.querySelector('.db-page').innerHTML = '<div class="empty-state">Category not found. <a href="emax.html">Back to categories</a></div>';
} else {
  document.getElementById('categoryTitle').textContent = `${pickCategoryEmoji(category.name)} ${category.name}`;
  document.title = category.name + ' - EMAX';
  init();
}

/* ===================== Entries CRUD ===================== */

function addEntry(name, date, imageUrl, wikiTitle, noImage, dateKind, artistName, artistQid) {
  name = name.trim();
  if (!name || !date) return;
  const entry = { id: uid(), name, date };
  if (imageUrl) entry.imageUrl = imageUrl;
  if (wikiTitle) entry.wikiTitle = wikiTitle;
  if (noImage) entry.noImage = true;
  if (dateKind) entry.dateKind = dateKind;
  if (artistName) { entry.artistName = artistName; entry.artistQid = artistQid; }
  category.entries.push(entry);
  saveEmaxDB(db);
  renderEntries();
}

function updateEntry(entryId, name, date, imageUrl, wikiTitle, noImage, dateKind, artistName, artistQid) {
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
  // Songs only (see lookupPerformerForSong) - the artist behind this track,
  // for the popup's artist banner.
  if (artistName) { entry.artistName = artistName; entry.artistQid = artistQid; } else { delete entry.artistName; delete entry.artistQid; }
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
  if (category.name === 'Artists') return result;

  const v = result.vietnamese;
  const yearMatch = v.entityYearSign === v.dayYearSign;
  const monthMatch = v.entityMonthSign === v.dayMonthSign;
  const dayMatch = v.entityDaySign === v.dayDaySign;
  if (!yearMatch && !monthMatch && !dayMatch) return result;

  const yearScore = yearMatch ? 99 : v.yearScore;
  const monthScore = monthMatch ? 99 : v.monthScore;
  const daySignScore = dayMatch ? 99 : v.daySignScore;
  const vietnameseScore = 0.60 * yearScore + 0.30 * monthScore + 0.10 * daySignScore;

  const baseScore = COMPAT_DEFAULT_WEIGHTS.numerology * result.numerology.score
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
    vietnamese: { ...v, score: Math.round(vietnameseScore), yearScore, monthScore, daySignScore },
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

function entryRowHtml(entry, score) {
  if (!entry.date && entry.year) {
    const yearSign = getChineseZodiacYear(new Date(entry.year, 6, 1));
    return `
      <div class="entry-item emax-entry-item dim">
        <div class="emax-entry-thumb">${emaxMonogram(entry.name, false)}</div>
        <div class="emax-entry-main">
          <div class="entry-name">${escapeHtml(entry.name)}</div>
          <div class="entry-date">${entry.year} · year only</div>
        </div>
        <div class="emax-entry-side">
          <span class="badge">${VIETNAMESE_ZODIAC_EMOJI[yearSign] || ''} ${yearSign} year</span>
          <div class="entry-actions">
            <button class="btn-link" data-edit="${entry.id}">Add full date</button>
            <button class="icon-btn" data-entry-delete="${entry.id}" title="Delete">&times;</button>
          </div>
        </div>
      </div>`;
  }

  // The score tier tints the whole card (border + thumbnail glow), not just
  // the number - per your "no special top-3 badge, keep it to sort + color"
  // answer, this IS the color coding, just carried through the whole row.
  const tierCls = score == null ? 'dim' : scoreClass(score);
  return `
    <div class="entry-item emax-entry-item ${tierCls}" data-open="${entry.id}">
      <div class="emax-entry-thumb" id="emaxThumb-${entry.id}">${entry.imageUrl && !entry.noImage ? `<img src="${escapeHtml(entry.imageUrl)}" alt="">` : emaxMonogram(entry.name, false)}</div>
      <div class="emax-entry-main">
        <div class="entry-name">${escapeHtml(entry.name)}</div>
        ${starsHtml(entry.id, entry.rating || 0)}
      </div>
      <div class="emax-entry-side">
        ${emaxRowScoreHtml(score)}
        <div class="entry-actions">
          <button class="btn-link" data-edit="${entry.id}">Edit</button>
          <button class="icon-btn" data-entry-delete="${entry.id}" title="Delete">&times;</button>
        </div>
      </div>
    </div>`;
}

// Same auto-fetch (real photo/logo, cached, monogram-fallback) the popup
// already uses, applied to each dated row's small thumbnail too - lazy,
// after the list itself has already painted with monograms, so a big list
// isn't blocked on network round-trips to show up. A manual entry.imageUrl
// is already rendered synchronously above (no fetch needed); entry.noImage
// (the "remove picture" edit option) skips this entirely, monogram stays.
// Songs only: most song articles simply have no lead image on Wikipedia at
// all (a plain 2-letter monogram is the common case, not the exception), so
// when the SONG's own fetch comes up empty, the artist's own photo is tried
// next before finally settling for the monogram - a real photo the row can
// actually show beats a blank initials circle either way.
function emaxLoadRowImages(ranked) {
  const isBrandCategory = EMAX_YEAR_FILTER_KIND[category.name] === 'founded';
  const isSongsCategory = category.name === 'Songs';
  ranked.forEach(({ entry }) => {
    if (!entry.date || entry.noImage || entry.imageUrl) return;
    const title = entry.wikiTitle || entry.name;
    emaxFetchImage(title, isBrandCategory).then((url) => {
      if (url) {
        const thumbEl = document.getElementById(`emaxThumb-${entry.id}`);
        if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
        return;
      }
      if (!isSongsCategory || !entry.artistName) return;
      emaxArtistImageUrl(entry).then((artistUrl) => {
        if (!artistUrl) return;
        const thumbEl = document.getElementById(`emaxThumb-${entry.id}`);
        if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(artistUrl)}" alt="">`;
      });
    });
  });
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
  // meaningfully include an item with no score to compare.
  const visible = scoreFilterValue == null ? ranked : ranked.filter(({ score }) => {
    if (score == null) return false;
    return scoreFilterMode === 'under' ? score < scoreFilterValue : score > scoreFilterValue;
  });
  const emptyFilterHtml = (scoreFilterValue != null && visible.length === 0)
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

// Songs only: entry.artistName (set by lookupPerformerForSong at Preload/
// Look-up time) gets its own small banner in the song's popup - the
// performer's own compatibility, a separate number from the song's own
// release-date score already shown above. If that performer already exists
// in the Artists category (matched by name), the banner shows their real
// score and opens THEIR popup on tap (openItemModal again, with an
// 'Artists' override so it behaves exactly as it would from that page - see
// openItemModal's own comment on categoryNameOverride). If not, there's
// nothing to score yet, so it offers "+ Add to Database" instead.
function emaxArtistBannerHtml(entry, meDate) {
  if (!entry.artistName) return '';
  const artistsCat = db.categories.find((c) => c.name === 'Artists');
  const existing = artistsCat && artistsCat.entries.find((e) => e.name.toLowerCase() === entry.artistName.toLowerCase());
  const thumb = emaxMonogram(entry.artistName, false);

  if (existing && existing.date) {
    const artistScore = computeCompatibility(meDate, parseDateStr(existing.date)).finalScore;
    return `
      <button type="button" class="emax-artist-banner" id="emaxArtistBanner" data-artist-id="${escapeHtml(existing.id)}">
        <div class="emax-artist-banner-thumb" id="emaxArtistBannerThumb">${thumb}</div>
        <div class="emax-artist-banner-name">${escapeHtml(entry.artistName)}</div>
        <div class="emax-score ${scoreClass(artistScore)}">${artistScore}%</div>
      </button>`;
  }

  return `
    <div class="emax-artist-banner">
      <div class="emax-artist-banner-thumb" id="emaxArtistBannerThumb">${thumb}</div>
      <div class="emax-artist-banner-name">${escapeHtml(entry.artistName)}</div>
      <button type="button" class="btn-link" id="emaxAddArtistBtn" data-artist-name="${escapeHtml(entry.artistName)}" data-artist-qid="${escapeHtml(entry.artistQid || '')}">+ Add to Database</button>
    </div>`;
}

// Shared by the artist banner (popup) and each Songs row's own small artist
// avatar - one resolver, same priority order everywhere: the ARTIST's own
// stored noImage/imageUrl wins when they're already a real Artists entry
// (their own edits should be respected wherever their photo shows up), else
// falls back to entry.artistName itself, which is already the resolved
// Wikipedia title from lookupPerformerForSong, not a guessed search string.
// Resolves to a URL, or null (never fetches when noImage is set).
function emaxArtistImageUrl(entry) {
  if (!entry.artistName) return Promise.resolve(null);
  const artistsCat = db.categories.find((c) => c.name === 'Artists');
  const existing = artistsCat && artistsCat.entries.find((e) => e.name.toLowerCase() === entry.artistName.toLowerCase());
  if (existing && existing.noImage) return Promise.resolve(null);
  if (existing && existing.imageUrl) return Promise.resolve(existing.imageUrl);
  const title = (existing && existing.wikiTitle) || entry.artistName;
  return emaxFetchImage(title, false);
}

// emaxArtistBannerHtml above only ever renders the monogram - it's a sync
// string builder, same as every other row/hero thumb in this file. The real
// photo is a separate async enhancement, called right after the banner HTML
// lands in the DOM (openItemModal), same "paint monogram first, swap in the
// real image once it resolves" pattern as emaxLoadRowImages and the modal
// hero image below.
function emaxLoadArtistBannerImage(entry) {
  if (!entry.artistName) return;
  emaxArtistImageUrl(entry).then((url) => {
    if (!url) return;
    const thumbEl = document.getElementById('emaxArtistBannerThumb');
    if (thumbEl) thumbEl.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
  });
}

// The "+ Add to Database" click: resolves the performer's own birthdate
// (their real QID, already captured by lookupPerformerForSong, skips
// straight to fetchKeyDate instead of re-searching by name - the same
// property-priority cascade Artists' own Preload/Look-up already use, P569
// first) and adds them to the Artists category. On success, immediately
// opens their real popup - the natural conclusion of "add them," per the
// owner's own answer to "should this also resolve their birthdate."
async function emaxAddArtistToDatabase(artistName, artistQid, backTo) {
  const artistsCat = db.categories.find((c) => c.name === 'Artists');
  if (!artistsCat) return;
  if (artistsCat.entries.some((e) => e.name.toLowerCase() === artistName.toLowerCase())) return;

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
  artistsCat.entries.push(newEntry);
  saveEmaxDB(db);

  if (newEntry.date) {
    openItemModal(newEntry, 'Artists', backTo);
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
function openItemModal(entry, categoryNameOverride, backTo) {
  const effectiveCategoryName = categoryNameOverride || category.name;
  const profile = loadProfile();
  if (!profile || !profile.date) {
    alert('Set your birthday on the My Profile page first, then come back to see compatibility.');
    return;
  }

  const body = document.getElementById('itemModalBody');
  body.innerHTML = `<div id="itemModalHeader"></div><div id="itemModalCompat"></div>`;

  const meDate = parseDateStr(profile.date);
  const themDate = parseDateStr(entry.date);
  // Artists (real people) are always exempt from the same-sign 99% override
  // - emaxAdjustedCompatibility already returns computeCompatibility's own
  // result unmodified for the CURRENT page's Artists category, so calling
  // computeCompatibility directly here for an override of 'Artists' is the
  // exact same result, without needing emaxAdjustedCompatibility to also
  // learn about a category it isn't actually on.
  const result = effectiveCategoryName === 'Artists' ? computeCompatibility(meDate, themDate) : emaxAdjustedCompatibility(meDate, themDate);
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

  document.getElementById('itemModalHeader').innerHTML = `
    <div class="emax-modal-hero-v2">
      ${backHtml}
      <div class="emax-modal-image ${scoreCls}" id="itemModalImage">${emaxMonogram(entry.name, true)}</div>
      ${starsHtml(entry.id, entry.rating || 0)}
      <div class="emax-modal-name">${escapeHtml(entry.name)}</div>
      <div class="emax-modal-date">${escapeHtml(dateLine)}</div>
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
      ${emaxArtistBannerHtml(entry, meDate)}
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

    const tile = e.target.closest('.emax-fact-tile-tap');
    if (tile) {
      const valueEl = tile.querySelector('.emax-fact-value');
      const showingCompound = tile.classList.toggle('showing-compound');
      valueEl.textContent = showingCompound ? tile.dataset.compound : tile.dataset.reduced;
      return;
    }

    const artistBanner = e.target.closest('#emaxArtistBanner');
    if (artistBanner) {
      const artistsCat = db.categories.find((c) => c.name === 'Artists');
      const artistEntry = artistsCat && artistsCat.entries.find((en) => en.id === artistBanner.dataset.artistId);
      if (artistEntry) openItemModal(artistEntry, 'Artists', { entry, categoryNameOverride: effectiveCategoryName });
      return;
    }

    const addArtistBtn = e.target.closest('#emaxAddArtistBtn');
    if (addArtistBtn) {
      emaxAddArtistToDatabase(addArtistBtn.dataset.artistName, addArtistBtn.dataset.artistQid, { entry, categoryNameOverride: effectiveCategoryName });
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

  emaxLoadArtistBannerImage(entry);
}

function closeItemModal() {
  document.getElementById('itemModalOverlay').classList.remove('active');
}

/* ===================== Add/Edit form ===================== */

function startEdit(entry) {
  editingEntryId = entry.id;
  pendingWikiTitle = entry.wikiTitle || null;
  pendingDateKind = entry.dateKind || null;
  pendingArtistQid = entry.artistQid || null;
  document.getElementById('newEntryName').value = entry.name;
  document.getElementById('newEntryDate').value = entry.date ? isoToDisplay(entry.date) : '';
  document.getElementById('newEntryArtist').value = entry.artistName || '';
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
  // Songs only: also resolves the performer (P175) alongside the release
  // date, for the artist banner in the song's own popup - see
  // lookupPerformerForSong (db-core.js) and openItemModal's banner section.
  const isSongsCategory = category.name === 'Songs';
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
        if (isSongsCategory) {
          try {
            const performer = await lookupPerformerForSong(searchTerm);
            if (performer) { entry.artistName = performer.title; entry.artistQid = performer.qid; }
          } catch (e2) { /* no performer found - the song still saves fine without one */ }
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
// Only offered on categories listed in EMAX_YEAR_FILTER_KIND - each maps to
// a real, single-fact Wikidata property (founded/born/released), never a
// curated "top of year X" judgment call. There's no live "X in year Y"
// query - this SCANS the whole category's seed pool (one lookup per
// candidate, via whichever property this category's kind maps to) and keeps
// only the ones whose resolved year matches, so an exact year with sparse
// coverage can come back with very few hits (or none) - that's the honest
// tradeoff of an exact-year filter over a broader curated list, never
// papered over with a fabricated match. Results are cached per (category,
// search term) so re-running for a DIFFERENT year on the same category
// reuses everything already looked up instead of re-querying Wikidata.

const EMAX_YEAR_LOOKUP_FN = {
  founded: lookupFoundingDateOrYearWithTitle,
  born: lookupBirthDateOrYearWithTitle,
  released: lookupReleaseDateOrYearWithTitle,
  aired: lookupAiredDateOrYearWithTitle,
  anime: lookupAnimeDateOrYearWithTitle,
};

const EMAX_FOUNDING_CACHE_KEY = 'numerology_emax_founding_cache_v1';
let emaxFoundingCache = {};
try { emaxFoundingCache = JSON.parse(localStorage.getItem(EMAX_FOUNDING_CACHE_KEY)) || {}; } catch (e) { emaxFoundingCache = {}; }

async function emaxLookupYearCached(kind, categoryName, searchTerm) {
  const key = `${kind}|${categoryName}|${searchTerm}`;
  if (Object.prototype.hasOwnProperty.call(emaxFoundingCache, key)) return emaxFoundingCache[key];
  let info = null;
  try { info = await EMAX_YEAR_LOOKUP_FN[kind](searchTerm); } catch (e) { info = null; }
  emaxFoundingCache[key] = info;
  try { localStorage.setItem(EMAX_FOUNDING_CACHE_KEY, JSON.stringify(emaxFoundingCache)); } catch (e2) { /* storage full - refetch next time */ }
  await new Promise((resolve) => setTimeout(resolve, 350)); // pace real network calls only - a cache hit above already returned
  return info;
}

async function preloadByYear(targetYear, includeYearOnly) {
  if (emaxPreloading) return;
  const names = EMAX_SEED_LISTS[category.name];
  const kind = EMAX_YEAR_FILTER_KIND[category.name];
  if (!names || !kind) return;
  const isSongsCategory = category.name === 'Songs';
  emaxPreloading = true;
  const btn = document.getElementById('preloadByYearBtn');
  btn.disabled = true;
  const existing = new Set(category.entries.map((e) => e.name.toLowerCase()));
  let added = 0;
  let addedYearOnly = 0;
  let skippedExisting = 0;
  let skippedYearOnlyExcluded = 0;

  for (let i = 0; i < names.length; i++) {
    const seed = names[i];
    const displayName = Array.isArray(seed) ? seed[0] : seed;
    const searchTerm = Array.isArray(seed) ? seed[1] : seed;
    setLookupStatus(`⚡ Scanning for ${targetYear} - ${i + 1}/${names.length} (${added} matched so far)...`, false);
    if (existing.has(displayName.toLowerCase())) { skippedExisting++; continue; }

    const info = await emaxLookupYearCached(kind, category.name, searchTerm);
    if (!info) continue;

    const resolvedYear = info.date ? Number(info.date.slice(0, 4)) : info.year;
    if (resolvedYear !== targetYear) continue;

    if (info.date) {
      const entry = { id: uid(), name: displayName, date: info.date, wikiTitle: info.title, dateKind: info.kind };
      if (isSongsCategory) {
        let performer = null;
        try { performer = await lookupPerformerForSong(searchTerm); } catch (e2) { /* no performer found - the song still saves fine without one */ }
        if (performer) { entry.artistName = performer.title; entry.artistQid = performer.qid; }
      }
      category.entries.push(entry);
      existing.add(displayName.toLowerCase());
      added++;
    } else if (includeYearOnly) {
      category.entries.push({ id: uid(), name: displayName, year: info.year });
      existing.add(displayName.toLowerCase());
      added++;
      addedYearOnly++;
    } else {
      skippedYearOnlyExcluded++;
    }
  }

  saveEmaxDB(db);
  renderEntries();
  btn.disabled = false;
  emaxPreloading = false;
  const yearOnlyNote = addedYearOnly ? ` (${addedYearOnly} year-only precision)` : '';
  const excludedNote = skippedYearOnlyExcluded ? ` · ${skippedYearOnlyExcluded} more matched but were year-only and excluded` : '';
  setLookupStatus(`⚡ Found ${added} ${kind} in ${targetYear}${yearOnlyNote} out of ${names.length} scanned${excludedNote}.`, false);
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

  document.getElementById('emaxFilterValue').addEventListener('input', () => {
    const raw = document.getElementById('emaxFilterValue').value;
    scoreFilterValue = raw === '' ? null : Number(raw);
    document.getElementById('emaxFilterClearBtn').style.display = scoreFilterValue == null ? 'none' : '';
    renderEntries();
  });
  document.getElementById('emaxFilterMode').addEventListener('change', () => {
    scoreFilterMode = document.getElementById('emaxFilterMode').value;
    renderEntries();
  });
  document.getElementById('emaxFilterClearBtn').addEventListener('click', () => {
    scoreFilterValue = null;
    document.getElementById('emaxFilterValue').value = '';
    document.getElementById('emaxFilterClearBtn').style.display = 'none';
    renderEntries();
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
    const isSongsCategory = category.name === 'Songs';
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
      if (!isSongsCategory) return;
      const artistInput = document.getElementById('newEntryArtist');
      // Only fills in an EMPTY field - a name the user already typed by hand
      // (because P175 doesn't resolve for every song, or they know better
      // than Wikidata) is never silently overwritten by an auto-detection
      // that happens to land afterward, same "manual always wins" rule
      // every other auto-fetched field in this app already follows.
      if (artistInput.value.trim()) return;
      lookupPerformerForSong(name).then((performer) => {
        if (myToken !== lookupToken || !performer || artistInput.value.trim()) return;
        artistInput.value = performer.title;
        pendingArtistQid = performer.qid;
      }).catch(() => { /* no performer found - the song still saves fine without one, or the user can type one by hand */ });
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
      deleteEntry(deleteBtn.dataset.entryDelete);
      if (editingEntryId === deleteBtn.dataset.entryDelete) exitEditMode();
      return;
    }

    const editBtn = e.target.closest('button[data-edit]');
    if (editBtn) {
      e.preventDefault();
      const entry = category.entries.find((en) => en.id === editBtn.dataset.edit);
      if (entry) startEdit(entry);
      return;
    }

    const row = e.target.closest('[data-open]');
    if (row) {
      const entry = category.entries.find((en) => en.id === row.dataset.open);
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

  // Songs only - see #newEntryArtist's own comments (init's addEntryBtn
  // handler, entryLookupBtn handler) for how this field is filled/used.
  if (category.name === 'Songs') {
    document.getElementById('newEntryArtistRow').style.display = '';
  }

  if (EMAX_YEAR_FILTER_KIND[category.name]) {
    document.getElementById('preloadByYearRow').style.display = '';
    document.getElementById('preloadByYearBtn').addEventListener('click', () => {
      const year = parseInt(document.getElementById('preloadYearInput').value, 10);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < 1500 || year > currentYear) {
        setLookupStatus(`Enter a real year (1500-${currentYear}).`, true);
        return;
      }
      const includeYearOnly = document.getElementById('preloadYearOnlyToggle').checked;
      preloadByYear(year, includeYearOnly);
    });
  }

  renderEntries();
}

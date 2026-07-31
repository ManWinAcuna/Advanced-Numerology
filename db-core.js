const STORAGE_KEY = 'numerology_bday_db';

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && Array.isArray(parsed.categories)) ? parsed : { categories: [] };
  } catch (e) {
    return { categories: [] };
  }
}

function saveDBState(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  cloudPushKey(STORAGE_KEY);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date();
  dt.setFullYear(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ===================== Typeable date fields ===================== */
// Native <input type="date"> forces mobile users through a calendar/wheel
// picker to reach a date - painfully slow for birth years decades back.
// These helpers back a plain typed "MM/DD/YYYY" text field instead, while
// every date is still stored/passed around the app as "YYYY-MM-DD" as before.

// "MM/DD/YYYY" -> "YYYY-MM-DD", or '' if not yet a complete, valid date.
function displayToISO(display) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((display || '').trim());
  if (!match) return '';
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return '';
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "YYYY-MM-DD" -> "MM/DD/YYYY", or '' if empty/malformed.
function isoToDisplay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

// Converts a date input to a typed field that auto-inserts slashes as
// digits are entered ("MM/DD/YYYY"), instead of the native picker UI.
function attachDateMask(inputEl) {
  if (!inputEl) return;
  inputEl.type = 'text';
  inputEl.inputMode = 'numeric';
  inputEl.autocomplete = 'off';
  if (!inputEl.placeholder) inputEl.placeholder = 'MM/DD/YYYY';
  inputEl.maxLength = 10;

  inputEl.addEventListener('input', () => {
    const digits = inputEl.value.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    inputEl.value = formatted;
  });
}

/* ===================== Wikidata date lookup ===================== */
// Shared by Famous Lookup (search-as-you-type) and the UFC Add Fighter
// deep link (single lookup by exact name) - both just need "find this
// name's key date on Wikidata" and nothing more.

function fetchWikidataId(title) {
  // redirects=1 so an alternate spelling/title ("Kitzbuehel" -> "Kitzbühel")
  // resolves to the real article's item instead of coming back empty.
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const pages = data.query && data.query.pages;
      if (!pages) return null;
      const page = Object.values(pages)[0];
      return (page && page.pageprops) ? page.pageprops.wikibase_item : null;
    });
}

// Wikidata dates look like "+1990-06-15T00:00:00Z". Precision 11 = day-level;
// anything coarser (year/decade/century only) isn't usable for numerology.
function dateFromClaim(claims) {
  if (!claims || claims.length === 0) return null;
  const snak = claims[0].mainsnak;
  if (!snak || !snak.datavalue) return null;
  const value = snak.datavalue.value;
  if (value.precision < 11) return null;
  const time = value.time;
  if (time.charAt(0) === '-') return null;
  return time.slice(1, 11);
}

function fetchWikidataClaims(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      return (entity && entity.claims) || null;
    });
}

// P569 = date of birth (people). P571 = inception (companies, organizations,
// countries, buildings, etc.) - tried as a fallback for non-person entities.
// P1619 = date of official opening - a distinct event from inception (a
// brand/venue's grand opening vs. when the company itself came into being),
// but Wikidata sometimes has one recorded with a real day when the other
// only has a year or is missing entirely, so it's worth a second organization
// -tier try before giving up. P577 = publication date (films, books, songs,
// software) - EMAX's Movies/Songs categories. P580 = start time - the
// property TV series use for when they first aired (P577 is a single-work
// "publication," which doesn't fit an ongoing series); tried last, for
// EMAX's Shows/Anime categories. Both P577 and P580 are virtually never set
// on a person/place/company, so both tiers are inert for every other
// existing caller of this function.
function fetchKeyDate(qid) {
  return fetchWikidataClaims(qid).then((claims) => {
    if (!claims) return null;

    const born = dateFromClaim(claims.P569);
    if (born) return { date: born, kind: 'born' };

    const founded = dateFromClaim(claims.P571);
    if (founded) return { date: founded, kind: 'founded' };

    const opened = dateFromClaim(claims.P1619);
    if (opened) return { date: opened, kind: 'opened' };

    const released = dateFromClaim(claims.P577);
    if (released) return { date: released, kind: 'released' };

    const aired = dateFromClaim(claims.P580);
    if (aired) return { date: aired, kind: 'aired' };

    return null;
  });
}

// Year-only sibling of dateFromClaim - EMAX's "Preload by Year" needs to
// know a brand's founding YEAR even when Wikidata only records that (a
// precision-9 claim, no exact day/month), unlike every other caller of
// dateFromClaim, which needs a real calendar date for a full numerology
// profile and correctly rejects anything coarser.
function yearFromClaim(claims) {
  if (!claims || claims.length === 0) return null;
  const snak = claims[0].mainsnak;
  if (!snak || !snak.datavalue) return null;
  const value = snak.datavalue.value;
  if (value.precision < 9) return null; // coarser than a year (decade/century) - never usable
  const time = value.time;
  if (time.charAt(0) === '-') return null;
  return Number(time.slice(1, 5));
}

// EMAX-only: resolves a real date (day-precision) for the given Wikidata
// property when available, or just the YEAR when that's all Wikidata
// records - never a fabricated day. `propKindPairs` is tried in priority
// order as TWO passes: first every pair is checked for a day-precision date
// (the first one found wins, even if it's a lower-priority pair - a real day
// always beats a bare year), and only if NONE of them have a real day does
// it fall back to the best available year (highest-priority pair first).
// This is how a brand's inception (P571) being year-only doesn't shadow its
// official-opening date (P1619) when THAT has a real day on file. Returns
// { date, kind } or { year, kind } or null - `kind` is whichever pair
// actually matched, not necessarily the first one in the list.
function fetchBestDateOrYear(qid, propKindPairs) {
  return fetchWikidataClaims(qid).then((claims) => {
    if (!claims) return null;
    for (const [prop, kind] of propKindPairs) {
      const exact = dateFromClaim(claims[prop]);
      if (exact) return { date: exact, kind };
    }
    for (const [prop, kind] of propKindPairs) {
      const year = yearFromClaim(claims[prop]);
      if (year) return { year, kind };
    }
    return null;
  });
}

// wikipediaFallback: when NEITHER Wikidata property has a real day, tries
// the Wikipedia article itself before settling for a bare Wikidata year - a
// real day found there still beats a bare year, same "exact day always
// wins" rule as fetchBestDateOrYear's own two-property cascade. Falsy (the
// common case) skips this entirely - only worth trying for categories where
// Wikidata itself is frequently missing a day-precision claim. When present,
// it's { infobox, prose } - two tiers, each only tried if the previous one
// missed, and each caller supplies its OWN scrape functions rather than this
// shared cascade hardcoding one category's field names/keywords (a brand's
// "founded/opened" infobox fields and product-launch prose scan are useless
// noise on a song's article, and vice versa - see lookupFoundingDateOrYearWithTitle
// vs lookupReleaseDateOrYearWithTitle below). `prose` may be null/omitted to
// skip that tier - it's the true long-shot, not every category needs it.
function lookupBestDateOrYearWithTitle(name, propKindPairs, wikipediaFallback) {
  return fetchWikidataIdWithTitle(name).then((hit) => {
    if (!hit) return null;
    return fetchBestDateOrYear(hit.qid, propKindPairs).then((result) => {
      if (result && result.date) return { ...result, title: hit.title };
      if (!wikipediaFallback) return result ? { ...result, title: hit.title } : null;
      return wikipediaFallback.infobox(hit.title).then((infoboxResult) => {
        if (infoboxResult) return { ...infoboxResult, title: hit.title };
        if (!wikipediaFallback.prose) return result ? { ...result, title: hit.title } : null;
        return wikipediaFallback.prose(hit.title).then((proseResult) => {
          if (proseResult) return { ...proseResult, title: hit.title };
          return result ? { ...result, title: hit.title } : null;
        });
      });
    });
  });
}

// EMAX "Preload by Year" - one wrapper per category kind. Brands try
// inception (P571) first, falling back to the date of official opening
// (P1619) when inception has no real day, then the Wikipedia infobox scrape,
// then the prose scrape, when NEITHER Wikidata property has one - see
// fetchBestDateOrYear and lookupBestDateOrYearWithTitle above. Songs try
// release (P577) first, then their own Infobox song "released" field scrape
// (no prose tier - the brand prose scanner's "first product launched"
// wording doesn't fit a song, and a bespoke one isn't worth the false-
// positive risk for what's already a rarer miss than brands see). Artists
// filter by birth year (P569) with no fallback at all - a person's Wikidata
// item is reliably complete enough not to need one.
function lookupFoundingDateOrYearWithTitle(name) {
  return lookupBestDateOrYearWithTitle(name, [['P571', 'founded'], ['P1619', 'opened']], { infobox: lookupKeyDateFromWikipediaInfobox, prose: lookupLaunchDateFromWikipediaProse });
}
function lookupBirthDateOrYearWithTitle(name) {
  return lookupBestDateOrYearWithTitle(name, [['P569', 'born']], false);
}
function lookupReleaseDateOrYearWithTitle(name) {
  return lookupBestDateOrYearWithTitle(name, [['P577', 'released']], { infobox: lookupReleaseDateFromWikipediaInfobox, prose: null });
}
// TV series only (EMAX Shows) - P580 start time, no P577 fallback since a
// show isn't a single "publication."
function lookupAiredDateOrYearWithTitle(name) {
  return lookupBestDateOrYearWithTitle(name, [['P580', 'aired']], false);
}
// EMAX Anime - a mixed list of both series and films, so both properties are
// tried per entity (whichever one the actual Wikidata item has); P577 first
// since standalone films are the more common day-precision hit, P580 as the
// fallback for series entries. See fetchBestDateOrYear above for how ties
// (both present) resolve - the first pair in the list wins.
function lookupAnimeDateOrYearWithTitle(name) {
  return lookupBestDateOrYearWithTitle(name, [['P577', 'released'], ['P580', 'aired']], false);
}

// EMAX brand logos only: Wikidata's P154 (logo image) is a structured,
// separate fact from whatever photo the Wikipedia page's own summary
// happens to lead with - which is sometimes a founder's portrait rather
// than the mark itself, for a brand named after its founder (Ralph Lauren,
// Tommy Hilfiger, ...). P154's value is a Commons filename; Commons'
// Special:FilePath redirects that straight to the real image, so no
// second API round-trip is needed - the constructed URL just works as an
// <img src>.
function fetchLogoImageUrl(qid) {
  return fetchWikidataClaims(qid).then((claims) => {
    const claim = claims && claims.P154 && claims.P154[0];
    const filename = claim && claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value;
    return filename ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}` : null;
  });
}

function lookupLogoImageUrl(name) {
  return fetchWikidataIdWithTitle(name).then((hit) => (hit ? fetchLogoImageUrl(hit.qid) : null));
}

// EMAX Songs only: P175 (performer) is a WIKIDATA-ITEM-valued claim (an
// artist's own QID, not a date/string), so a second lookup - the same
// enwiki-sitelink resolution the country/place fallback already uses via
// fetchWikipediaTitleFromQid - turns that QID into a real title, which then
// doubles as both the artist's display name and (like every other entry in
// this app) the seed for their photo fetch.
function fetchPerformerForSong(qid) {
  return fetchWikidataClaims(qid).then((claims) => {
    const claim = claims && claims.P175 && claims.P175[0];
    const value = claim && claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value;
    const artistQid = value && value.id;
    if (!artistQid) return null;
    return fetchWikipediaTitleFromQid(artistQid).then((title) => (title ? { qid: artistQid, title } : null));
  });
}

function lookupPerformerForSong(name) {
  return fetchWikidataIdWithTitle(name).then((hit) => (hit ? fetchPerformerForSong(hit.qid) : null));
}

/* ===================== Wikipedia infobox fallback ===================== */
// Wikidata's P571 (inception) is often missing even when the Wikipedia
// article's infobox has the date written right in it - infoboxes get filled
// in by editors well before anyone also adds the structured Wikidata claim.
// This is a second-tier, best-effort fallback for venues/stadiums/cities
// (Wikidata alone has noticeably thinner coverage there than it does for
// people's birthdays) - it raises the hit rate, it doesn't guarantee one:
// many infoboxes only give a founding YEAR with no day/month, which isn't
// usable here any more than a coarse Wikidata claim is (see dateFromClaim's
// precision check above).

// Split into two buckets (rather than one flat list) so a match reports
// which kind of event it actually is - "founded"-type fields describe the
// entity coming into existence, "opened"-type fields describe a later grand
// -opening/inauguration. Checked in this order (founded bucket first) so a
// page listing both prefers the truer, earlier event, same priority as
// P571-before-P1619 on the Wikidata side.
const INFOBOX_FOUNDED_FIELDS = ['established', 'founded', 'built', 'broke_ground', 'formed', 'foundation'];
const INFOBOX_OPENED_FIELDS = ['inaugurated', 'opened', 'opening'];
// A genuine long-shot, tried last, only once founded/opened both miss.
// Unlike those two, there's no dedicated "rename date" field in Infobox
// company - these fields hold a NAME or a short fate description ("Renamed
// TechCo", "Merged into BigCorp"), so a date only turns up here when an
// editor happened to write one into that same short phrase. Real, lower
// hit rate, and the one place a false-positive-shaped match is even
// plausible - parseWikitextDateValue's month-name-or-ISO requirement still
// guards against a bare year range like "(1985-1998)" being mistaken for one.
const INFOBOX_RENAMED_FIELDS = ['former_name', 'fate', 'predecessor'];
// EMAX Songs only - Infobox song's field is literally "released" (usually
// wrapped in {{Start date|YYYY|MM|DD}}, the same template
// parseWikitextDateValue already handles for every other infobox tier).
// Tried only when Wikidata's own P577 has no day-precision value on file.
const INFOBOX_RELEASED_FIELDS = ['released'];

// Named WIKI_ (not plain MONTH_NAMES) because calendar.js declares its own
// top-level MONTH_NAMES const - two same-named top-level consts across
// scripts loaded on one page is a SyntaxError that silently kills the
// second script entirely.
const WIKI_MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function isoFromParts(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Handles the handful of date shapes actually seen in infobox wikitext:
// {{Start date|1968|06|24}}-style templates, plain "1968-06-24", "24 June
// 1968", "June 24, 1968", and wikilinked versions of the same ("[[24
// June]] [[1968]]"). Anything coarser than a full day (just a year, a
// decade, "c. 1900", etc.) intentionally returns null.
function parseWikitextDateValue(rawValue) {
  const templateMatch = /\{\{[^}|]*\|(\d{4})\|(\d{1,2})\|(\d{1,2})/.exec(rawValue);
  if (templateMatch) return isoFromParts(templateMatch[1], templateMatch[2], templateMatch[3]);

  const text = rawValue.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').replace(/[{}]/g, ' ');

  const isoMatch = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (isoMatch) return isoFromParts(isoMatch[1], isoMatch[2], isoMatch[3]);

  const dmyMatch = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text);
  if (dmyMatch) {
    const month = WIKI_MONTH_NAMES.indexOf(dmyMatch[2].toLowerCase());
    if (month !== -1) return isoFromParts(dmyMatch[3], month + 1, dmyMatch[1]);
  }

  const mdyMatch = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (mdyMatch) {
    const month = WIKI_MONTH_NAMES.indexOf(mdyMatch[1].toLowerCase());
    if (month !== -1) return isoFromParts(mdyMatch[3], month + 1, mdyMatch[2]);
  }

  return null;
}

// Wikipedia's Infobox country template often lists a multi-stage formation
// history as paired established_eventN / established_dateN fields - e.g. for
// the UAE: event1 "British protectorate" / 1892, event2 "Foundation of the
// United Arab Emirates / Independence" / 2 December 1971, event3 "Admission
// of Ras Al Khaimah" / 10 February 1972. The highest N is NOT reliably "the
// founding" - it's just the last one listed, which is often a later, more
// minor amendment (like Ras Al Khaimah joining after the fact) rather than
// the actual founding act. So the event LABEL is checked for founding-type
// wording first, and only the highest N is used as a tiebreaker/last resort.
const FOUNDING_EVENT_KEYWORDS = [
  'independence', 'founded', 'foundation', 'formation', 'established',
  'union', 'unification', 'republic', 'constitution', 'sovereignty',
];

// Returns { date, kind } or null - never a bare string, so a caller can
// label "opened" honestly instead of assuming every infobox hit is a
// founding (see EMAX's dateKind, which now traces back to whichever real
// event actually supplied the date).
function extractInfoboxDayDate(wikitext) {
  const eventRe = /\|\s*established_event(\d+)\s*=\s*([^\n]+)/gi;
  const dateRe = /\|\s*established_date(\d+)\s*=\s*([^\n]+)/gi;

  const eventLabels = new Map();
  let eventMatch;
  while ((eventMatch = eventRe.exec(wikitext))) eventLabels.set(eventMatch[1], eventMatch[2]);

  let best = null; // { n, date, hasKeyword }
  let dateMatch;
  while ((dateMatch = dateRe.exec(wikitext))) {
    const n = Number(dateMatch[1]);
    const date = parseWikitextDateValue(dateMatch[2]);
    if (!date) continue;
    const label = (eventLabels.get(dateMatch[1]) || '').toLowerCase();
    const hasKeyword = FOUNDING_EVENT_KEYWORDS.some((k) => label.includes(k));
    if (!best || (hasKeyword && !best.hasKeyword) || (hasKeyword === best.hasKeyword && n > best.n)) {
      best = { n, date, hasKeyword };
    }
  }
  if (best) return { date: best.date, kind: 'founded' };

  // Capture to end of line, not to the next "|" - infobox param values are
  // almost always one per line, and a value that's itself a template (the
  // common "{{Start date|1968|06|24}}" case) contains its own pipes, which
  // a "stop at any |" capture would truncate mid-template.
  for (const field of INFOBOX_FOUNDED_FIELDS) {
    const re = new RegExp(`\\|\\s*${field}[a-z_]*\\s*=\\s*([^\\n]+)`, 'i');
    const match = re.exec(wikitext);
    if (match) {
      const date = parseWikitextDateValue(match[1]);
      if (date) return { date, kind: 'founded' };
    }
  }
  for (const field of INFOBOX_OPENED_FIELDS) {
    const re = new RegExp(`\\|\\s*${field}[a-z_]*\\s*=\\s*([^\\n]+)`, 'i');
    const match = re.exec(wikitext);
    if (match) {
      const date = parseWikitextDateValue(match[1]);
      if (date) return { date, kind: 'opened' };
    }
  }
  for (const field of INFOBOX_RENAMED_FIELDS) {
    const re = new RegExp(`\\|\\s*${field}[a-z_]*\\s*=\\s*([^\\n]+)`, 'i');
    const match = re.exec(wikitext);
    if (match) {
      const date = parseWikitextDateValue(match[1]);
      if (date) return { date, kind: 'renamed' };
    }
  }
  return null;
}

function fetchWikipediaWikitext(title) {
  // redirects=1 so a page that's just "#REDIRECT [[Real Title]]" (very
  // common for alternate names/spellings) resolves to the target article's
  // actual content instead of the bare redirect line.
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&redirects=1&prop=wikitext&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => ((data.parse && data.parse.wikitext) ? data.parse.wikitext['*'] : null))
    .catch(() => null);
}

function lookupKeyDateFromWikipediaInfobox(title) {
  return fetchWikipediaWikitext(title).then((wikitext) => (wikitext ? extractInfoboxDayDate(wikitext) : null));
}

// Songs' own infobox tier - separate from extractInfoboxDayDate above (which
// is company/place-founding vocabulary shared with UFC/Tennis/MLB's own
// venue lookups) so a "released" field never gets mistaken for a founding
// date on an unrelated page, and vice versa.
function extractInfoboxReleaseDate(wikitext) {
  for (const field of INFOBOX_RELEASED_FIELDS) {
    const re = new RegExp(`\\|\\s*${field}[a-z_]*\\s*=\\s*([^\\n]+)`, 'i');
    const match = re.exec(wikitext);
    if (match) {
      const date = parseWikitextDateValue(match[1]);
      if (date) return { date, kind: 'released' };
    }
  }
  return null;
}

function lookupReleaseDateFromWikipediaInfobox(title) {
  return fetchWikipediaWikitext(title).then((wikitext) => (wikitext ? extractInfoboxReleaseDate(wikitext) : null));
}

/* ===================== Wikipedia prose fallback: first product launch ===================== */
// EMAX brands/companies only, and only wired in behind an explicit
// useProseFallback flag - the true last resort, tried only after founded,
// opened, AND renamed have all missed. There is no infobox field for "first
// product launched" at all (products lists WHAT a company makes, never
// WHEN), so the only place this fact can possibly live is the article's own
// written prose. This is a real step down in reliability from everything
// else in this cascade: no field to anchor on, just a sentence that happens
// to mention both a launch-type word and a real date near each other -
// genuinely a long shot, not a normal fallback tier. Deliberately kept
// separate from extractInfoboxDayDate/lookupKeyDateFromWikipediaInfobox
// (shared with UFC/Tennis/MLB's place-founding lookups, which read the date
// directly rather than just the kind) so a prose false positive here can
// never corrupt real stadium/venue data those pages never asked to change.
const PROSE_LAUNCH_KEYWORDS = /\b(launch(?:ed|ing)?|released?|introduc(?:ed|ing)|debut(?:ed)?|unveiled)\b/i;
const PROSE_FIRST_HINT = /\bfirst\b/i;

// <ref>...</ref> citation blocks are full of dates that have nothing to do
// with the article's subject ("Retrieved 2019-05-01", a cited source's own
// publication date) - stripped first so they can't masquerade as the event
// date just because they happen to sit near a launch-type word.
function stripWikiRefs(wikitext) {
  return wikitext.replace(/<ref[^>]*\/>/gi, ' ').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ');
}

// Crude sentence split (on ./!/?) - good enough for a best-effort scan, not
// meant to perfectly parse prose. Only a sentence containing BOTH "first"
// and a launch-type verb is even considered, and only then is it checked
// for a real day-precision date via the same parser used everywhere else in
// this cascade - never a fabricated or coarse-year date.
function extractProseLaunchDate(wikitext) {
  const body = stripWikiRefs(wikitext);
  const sentences = body.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!PROSE_FIRST_HINT.test(sentence) || !PROSE_LAUNCH_KEYWORDS.test(sentence)) continue;
    const date = parseWikitextDateValue(sentence);
    if (date) return date;
  }
  return null;
}

function lookupLaunchDateFromWikipediaProse(title) {
  return fetchWikipediaWikitext(title).then((wikitext) => {
    if (!wikitext) return null;
    const date = extractProseLaunchDate(wikitext);
    return date ? { date, kind: 'launched' } : null;
  });
}

/* ===================== Place lookup: country fallback ===================== */
// A US state's founding date used elsewhere in this app is its statehood
// (joined-the-union) date, not "when this land was first settled" - the
// international-region equivalent of that is usually the date the country
// itself was formed, not the city's own (often ancient, often undocumented-
// to-the-day) history. Abu Dhabi doesn't have its own separately-recorded
// "founding as an administrative unit" - the UAE's 1971 union IS that event
// for it. So for places specifically (never for people - see
// lookupKeyDateByName below, which people/birthday lookups keep using
// unchanged), the most "concrete" record - a signing, a union, a
// constitution - is tried first via this place's country (Wikidata P17),
// and only falls back to the place's own recorded date if that's
// unavailable (no country link, or the country itself has nothing usable).

function fetchCountryQid(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      const claims = entity && entity.claims && entity.claims.P17;
      if (!claims || !claims.length) return null;
      const snak = claims[0].mainsnak;
      return (snak && snak.datavalue && snak.datavalue.value && snak.datavalue.value.id) || null;
    })
    .catch(() => null);
}

function fetchWikipediaTitleFromQid(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      const sitelink = entity && entity.sitelinks && entity.sitelinks.enwiki;
      return sitelink ? sitelink.title : null;
    })
    .catch(() => null);
}

// Resolves to { date, kind, via: 'country' | 'place' } or null. `via` lets
// the status message be honest about which record the date actually came
// from, since "Abu Dhabi's founding date" and "the UAE's founding date" are
// not the same claim even when this app uses the latter for the former.
function lookupPlaceFoundingDate(name) {
  const ownDateChain = (qid) => (qid ? fetchKeyDate(qid) : Promise.resolve(null))
    .then((result) => result || lookupKeyDateFromWikipediaInfobox(name))
    .then((result) => (result ? { ...result, via: 'place' } : null));

  return fetchWikidataId(name).then((qid) => {
    if (!qid) return ownDateChain(null);

    return fetchCountryQid(qid).then((countryQid) => {
      if (!countryQid || countryQid === qid) return ownDateChain(qid);

      return fetchKeyDate(countryQid)
        .then((result) => result || fetchWikipediaTitleFromQid(countryQid).then((title) => (title ? lookupKeyDateFromWikipediaInfobox(title) : null)))
        .then((countryResult) => (countryResult ? { ...countryResult, via: 'country' } : ownDateChain(qid)));
    });
  });
}

// Looks up a single exact name (no search/disambiguation UI) and resolves
// to { date, kind } or null if nothing usable was found. Tries Wikidata's
// structured claims first (fast, precise when present), then falls back to
// scraping the Wikipedia infobox directly.
function lookupKeyDateByName(name) {
  return fetchWikidataId(name)
    .then((qid) => (qid ? fetchKeyDate(qid) : null))
    .then((result) => (result || lookupKeyDateFromWikipediaInfobox(name)));
}

// Same first tier as fetchWikidataId, but also keeps the resolved page's
// TITLE (post-redirect) - EMAX's "Look up" button shows this so a wrong
// match (e.g. a common brand/movie name with more than one Wikipedia
// article) is obvious before saving, instead of trusting the date silently.
// A separate function rather than changing fetchWikidataId's return shape,
// since that one's relied on as a bare qid by several existing callers
// (Famous Lookup, UFC/Tennis venue lookups) that must not change behavior.
function fetchWikidataIdWithTitle(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const pages = data.query && data.query.pages;
      if (!pages) return null;
      const page = Object.values(pages)[0];
      const qid = (page && page.pageprops) ? page.pageprops.wikibase_item : null;
      return qid ? { qid, title: page.title } : null;
    });
}

// Same Wikidata-claims-then-infobox-scrape cascade as lookupKeyDateByName,
// but resolves to { date, kind, title } (or null) - hit.title (the resolved
// page, post-redirect) is already known here, so the infobox fallback can
// report exactly which page it read, same as lookupKeyDateByName's own. This
// is the cascade both "Preload Top N" and the manual "Look up" button
// actually run (for every EMAX category, not just brands), so a tier added
// here is the one that matters most for real day-to-day coverage.
// Two infobox tiers, each tried only if the previous one missed: the
// founding-vocabulary scrape (lookupKeyDateFromWikipediaInfobox -
// founded/opened/renamed fields) first, then the release-vocabulary scrape
// (lookupReleaseDateFromWikipediaInfobox - Infobox song/film's "released"
// field) - safe to always try both regardless of category, since a page
// with no matching infobox field just falls through, same "never fabricate,
// only ever find a REAL day" guarantee as every other tier in this file.
// useProseFallback additionally tries the prose "first product launch" scan
// (lookupLaunchDateFromWikipediaProse) as the true last resort, once BOTH
// infobox scrapes have missed - gated separately from those (which are safe
// for every category) because a "released her first album" -style sentence
// is a real risk in an ARTIST's biography prose and would mislabel what
// should be a birthday lookup; EMAX only passes true for brand/company
// categories.
function lookupKeyDateByNameWithTitle(name, useProseFallback) {
  return fetchWikidataIdWithTitle(name).then((hit) => {
    if (!hit) return null;
    return fetchKeyDate(hit.qid).then((result) => {
      if (result) return { ...result, title: hit.title };
      return lookupKeyDateFromWikipediaInfobox(hit.title).then((infoboxResult) => {
        if (infoboxResult) return { ...infoboxResult, title: hit.title };
        return lookupReleaseDateFromWikipediaInfobox(hit.title).then((releaseResult) => {
          if (releaseResult) return { ...releaseResult, title: hit.title };
          if (!useProseFallback) return null;
          return lookupLaunchDateFromWikipediaProse(hit.title).then((proseResult) => (proseResult ? { ...proseResult, title: hit.title } : null));
        });
      });
    });
  });
}

/* ===================== Label-search birthdate fallback ===================== */
// lookupKeyDateByName above starts from an ENGLISH WIKIPEDIA ARTICLE at the
// exact name - but a large share of UFC prelim fighters and lower-tour
// tennis players have a Wikidata item (with a day-precision birthdate) and
// no article at all, so the whole backfill funnel silently dropped them:
// measured live, only ~74 of 397 available UFC fights survived, and every
// loss was this lookup, not prices. This searches Wikidata items by label
// instead, and accepts a hit only when it has BOTH a day-precision P569
// AND an English description matching descriptionRe - the description gate
// is what stops "Jose Delgado" from resolving to some unrelated namesake
// with a birthday.

// Wikimedia throttles bursty clients ("You are making too many requests" -
// hit directly while measuring the funnel), and a 400-fight rebuild is
// exactly that. Every lookup here funnels through one queue: sequential,
// lightly spaced, one retry after a pause. A skipped person costs a whole
// recorded fight, so this is coverage, not politeness.
let wikiSearchQueue = Promise.resolve();

function queuedWikiJson(url) {
  const run = wikiSearchQueue.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (e) { /* fall through to the retry pause */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  });
  wikiSearchQueue = run.catch(() => null).then(() => new Promise((r) => setTimeout(r, 300)));
  return run;
}

async function lookupPersonDobByLabelSearch(name, descriptionRe) {
  const data = await queuedWikiJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=5&format=json&origin=*`);
  const hits = data && Array.isArray(data.search) ? data.search : [];
  if (!hits.length) return null;
  // One batched entity fetch for all candidates instead of one call each.
  const d = await queuedWikiJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hits.map((h) => h.id).join('|')}&props=claims%7Cdescriptions&format=json&origin=*`);
  const entities = (d && d.entities) || {};
  for (const hit of hits) {
    const entity = entities[hit.id];
    if (!entity) continue;
    const desc = entity.descriptions && entity.descriptions.en ? entity.descriptions.en.value : '';
    if (!descriptionRe.test(desc)) continue;
    const born = dateFromClaim(entity.claims && entity.claims.P569);
    if (born) return { date: born, kind: 'born' };
  }
  return null;
}

/* ===================== Match-day timezone correctness ===================== */
// A match's numerology "Day" factor needs to be scored against the calendar
// date it actually falls on AT THE VENUE, not whatever date UTC happens to
// land on after conversion - a morning match in Australia/Asia can easily
// be a different calendar day in UTC than what's on a clock at the venue,
// while a European match (only 1-2 hours from UTC) rarely crosses that
// boundary. US states get a small fixed lookup (only needs to be right
// about which side of midnight, even for a state spanning more than one
// real zone); international regions get their timezone via Wikidata's P421
// "time zone" property.

const US_STATE_TIMEZONES = {
  Alabama: 'America/Chicago', Alaska: 'America/Anchorage', Arizona: 'America/Phoenix',
  Arkansas: 'America/Chicago', California: 'America/Los_Angeles', Colorado: 'America/Denver',
  Connecticut: 'America/New_York', Delaware: 'America/New_York', Florida: 'America/New_York',
  Georgia: 'America/New_York', Hawaii: 'Pacific/Honolulu', Idaho: 'America/Boise',
  Illinois: 'America/Chicago', Indiana: 'America/Indiana/Indianapolis', Iowa: 'America/Chicago',
  Kansas: 'America/Chicago', Kentucky: 'America/New_York', Louisiana: 'America/Chicago',
  Maine: 'America/New_York', Maryland: 'America/New_York', Massachusetts: 'America/New_York',
  Michigan: 'America/Detroit', Minnesota: 'America/Chicago', Mississippi: 'America/Chicago',
  Missouri: 'America/Chicago', Montana: 'America/Denver', Nebraska: 'America/Chicago',
  Nevada: 'America/Los_Angeles', 'New Hampshire': 'America/New_York', 'New Jersey': 'America/New_York',
  'New Mexico': 'America/Denver', 'New York': 'America/New_York', 'North Carolina': 'America/New_York',
  'North Dakota': 'America/Chicago', Ohio: 'America/New_York', Oklahoma: 'America/Chicago',
  Oregon: 'America/Los_Angeles', Pennsylvania: 'America/New_York', 'Rhode Island': 'America/New_York',
  'South Carolina': 'America/New_York', 'South Dakota': 'America/Chicago', Tennessee: 'America/Chicago',
  Texas: 'America/Chicago', Utah: 'America/Denver', Vermont: 'America/New_York',
  Virginia: 'America/New_York', Washington: 'America/Los_Angeles', 'West Virginia': 'America/New_York',
  Wisconsin: 'America/Chicago', Wyoming: 'America/Denver',
};

// Wikidata's P421 links to a "time zone" entity whose label isn't itself an
// IANA identifier ("Australian Eastern Standard Time", not "Australia/
// Sydney") - this maps the common ones to an IANA zone with the same
// offset/DST behavior. Doesn't need to be the exact city, just correct.
const TIMEZONE_LABEL_TO_IANA = {
  'coordinated universal time': 'UTC',
  'greenwich mean time': 'Etc/UTC',
  'western european time': 'Europe/Lisbon',
  'western european summer time': 'Europe/Lisbon',
  'central european time': 'Europe/Berlin',
  'central european summer time': 'Europe/Berlin',
  'eastern european time': 'Europe/Athens',
  'eastern european summer time': 'Europe/Athens',
  'moscow time': 'Europe/Moscow',
  'india standard time': 'Asia/Kolkata',
  'china standard time': 'Asia/Shanghai',
  'japan standard time': 'Asia/Tokyo',
  'korea standard time': 'Asia/Seoul',
  'australian western standard time': 'Australia/Perth',
  'australian central standard time': 'Australia/Adelaide',
  'australian central daylight time': 'Australia/Adelaide',
  'australian eastern standard time': 'Australia/Sydney',
  'australian eastern daylight time': 'Australia/Sydney',
  'new zealand standard time': 'Pacific/Auckland',
  'new zealand daylight time': 'Pacific/Auckland',
  'gulf standard time': 'Asia/Dubai',
  'arabian standard time': 'Asia/Riyadh',
  'eastern standard time': 'America/New_York',
  'eastern daylight time': 'America/New_York',
  'central standard time': 'America/Chicago',
  'central daylight time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'mountain daylight time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles',
  'pacific daylight time': 'America/Los_Angeles',
  'argentina time': 'America/Argentina/Buenos_Aires',
  'brasilia time': 'America/Sao_Paulo',
};

// A place can carry more than one P421 (timezone) claim - confirmed live for
// Toronto, which links both "America/Toronto" and the broader "Eastern Time
// Zone" entity. Returns all of them so the caller can try each in order
// instead of trusting the first is always usable.
function fetchWikidataTimezoneQids(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      const claims = (entity && entity.claims && entity.claims.P421) || [];
      return claims
        .map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id)
        .filter(Boolean);
    })
    .catch(() => []);
}

function fetchWikidataEntityLabel(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=en&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      const label = entity && entity.labels && entity.labels.en;
      return label ? label.value : null;
    })
    .catch(() => null);
}

// Best-effort: place name -> IANA timezone. Returns null (not a guess) if
// unresolvable - callers fall back to plain UTC date math, same as before
// this existed.
// Most city entities on Wikidata link P421 to a plain fixed-offset entity
// ("UTC+04:00") rather than a named zone ("Gulf Standard Time") - checked
// live against Abu Dhabi, Kitzbühel, and Sydney, all three of which only had
// the generic offset. Etc/GMT zones have inverted sign vs. common usage
// (Etc/GMT-10 is UTC+10) and carry no DST, so this is a close approximation
// rather than exact during a DST transition - still far better than the
// plain-UTC baseline, since a 1-hour DST discrepancy only flips the
// calendar day if the match starts within an hour of local midnight, while
// plain UTC can be off by up to 12+ hours.
function parseUtcOffsetLabel(label) {
  const trimmed = label.trim();
  if (/^UTC$/i.test(trimmed)) return 'Etc/UTC';
  const m = /^UTC\s*([+−-])\s*(\d{1,2})(?::(\d{2}))?$/i.exec(trimmed);
  if (!m) return null;
  const minutes = Number(m[3] || 0);
  if (minutes !== 0) return null; // Etc/GMT is whole-hour only; skip half/quarter-hour offsets
  const hours = Number(m[2]);
  if (hours === 0) return 'Etc/UTC';
  const invertedSign = m[1] === '+' ? '-' : '+';
  return `Etc/GMT${invertedSign}${hours}`;
}

// Some Wikidata timezone entities are already labeled with the real IANA
// identifier ("America/Toronto") rather than a display name like "Eastern
// Standard Time" - confirmed live for Toronto, whose P421 claim resolves to
// exactly that. TIMEZONE_LABEL_TO_IANA/parseUtcOffsetLabel only handle the
// display-name and UTC-offset cases, so neither matched and the lookup
// always came back null - checking whether the label is already a valid
// zone id closes that gap.
function isIanaTimeZoneLabel(label) {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z_+\-]+)+$/.test(label)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: label });
    return true;
  } catch (e) {
    return false;
  }
}

function ianaFromTimezoneLabel(label) {
  if (isIanaTimeZoneLabel(label)) return label;
  return TIMEZONE_LABEL_TO_IANA[label.toLowerCase()] || parseUtcOffsetLabel(label);
}

function lookupTimezoneForPlace(name) {
  return fetchWikidataId(name).then((qid) => {
    if (!qid) return null;
    return fetchWikidataTimezoneQids(qid).then((tzQids) => {
      if (!tzQids.length) return null;
      // Try each linked timezone entity in turn - a place can have more
      // than one P421 claim and the first isn't guaranteed to resolve.
      return tzQids.reduce((chain, tzQid) => chain.then((resolved) => {
        if (resolved) return resolved;
        return fetchWikidataEntityLabel(tzQid).then((label) => (label ? ianaFromTimezoneLabel(label) : null));
      }), Promise.resolve(null));
    });
  });
}

// The calendar date a match falls on at the venue, given its US state or
// international region - returns null (never a guess) when the timezone
// isn't confirmed yet. A US state always resolves instantly via the fixed
// lookup above, but an international region's zone is looked up
// asynchronously and may not have resolved on this call. Callers must treat
// null as "don't score this yet" - a match a few hours either side of
// midnight can land on the wrong calendar day entirely under a plain UTC
// guess, producing a numerology score that looks legitimate but isn't.
function localMatchDateISO(gameStartTime, regionMode, region) {
  const zone = regionMode === 'us' ? US_STATE_TIMEZONES[region && region.name] : (region && region.timezone);
  if (!zone) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(gameStartTime);
  } catch (e) {
    return null;
  }
}

// The venue's clock right now, formatted for display ("Jul 19, 11:42 AM"),
// or null when no timezone is resolvable for the region. Shown next to a
// set location as living proof the right timezone resolved - a user can
// sanity-check a live local time at a glance in a way they never could a
// zone identifier.
function venueLocalTimeNow(regionMode, region) {
  const zone = regionMode === 'us' ? US_STATE_TIMEZONES[region && region.name] : (region && region.timezone);
  if (!zone) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
  } catch (e) {
    return null;
  }
}

// Lazily backfills a missing timezone onto an already-saved international
// region (INTL_REGIONS_KEY) and persists it, so it only has to be looked up
// once per region rather than on every match that uses it. Safe to call
// repeatedly for the same region while a lookup is already in flight.
const regionTimezoneLookupsInFlight = new Set();

function ensureIntlRegionTimezone(region, onResolved) {
  if (!region || region.timezone || regionTimezoneLookupsInFlight.has(region.id)) return;
  regionTimezoneLookupsInFlight.add(region.id);
  lookupTimezoneForPlace(region.name).then((tz) => {
    regionTimezoneLookupsInFlight.delete(region.id);
    if (!tz) return;
    const regions = loadIntlRegions();
    const idx = regions.findIndex((r) => r.id === region.id);
    if (idx !== -1) {
      regions[idx] = { ...regions[idx], timezone: tz };
      saveIntlRegions(regions);
    }
    region.timezone = tz;
    if (onResolved) onResolved(tz);
  });
}

// Tennis backfill has no per-match venue ID the way MLB's official venue API
// gives it - only a city name parsed straight from the tournament's own
// Polymarket event title ("ITF Brisbane: A vs B" -> "Brisbane"). Mirrors
// resolveMlbRegionForBackfill's awaited find-or-create-then-resolve-timezone
// pattern (db-core.js can't reach stats-mlb.js's copy, and this is keyed by
// name instead of a venue ID anyway), just synchronous/awaited rather than
// fire-and-forget since a backfill has nothing live to re-render later.
async function resolveIntlRegionForBackfillByCity(cityName) {
  let region = loadIntlRegions().find((r) => normalizeName(r.name) === normalizeName(cityName));
  if (!region) {
    const info = await lookupPlaceFoundingDate(cityName);
    if (!info) return null;
    region = { id: uid(), name: cityName, founded: info.date };
    const list = loadIntlRegions();
    list.push(region);
    saveIntlRegions(list);
  }
  if (!region.timezone) {
    const tz = await lookupTimezoneForPlace(region.name);
    if (tz) {
      region = { ...region, timezone: tz };
      const list = loadIntlRegions();
      const idx = list.findIndex((r) => r.id === region.id);
      if (idx !== -1) {
        list[idx] = region;
        saveIntlRegions(list);
      }
    }
  }
  return region;
}

// Generic "is this ISO timestamp today, in the browser's own local time" -
// shared by UFC/Tennis's Today/Old Data split. MLB's own isMlbTodayLocal
// (stats-mlb.js) predates this and is left as-is rather than risk touching
// already-working code for a pure rename.
function isTodayLocal(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

const ZODIAC_SYMBOLS = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍',
  Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

const VIETNAMESE_ZODIAC_EMOJI = {
  Rat: '🐀', Ox: '🐂', Tiger: '🐯', Cat: '🐱', Dragon: '🐉', Snake: '🐍',
  Horse: '🐎', Goat: '🐐', Monkey: '🐵', Rooster: '🐓', Dog: '🐶', Pig: '🐷',
};

/* ===================== Category icons ===================== */

const CATEGORY_EMOJI_KEYWORDS = [
  { keywords: ['family', 'fam', 'parent', 'sibling', 'cousin'], emoji: '👨‍👩‍👧‍👦' },
  { keywords: ['friend'], emoji: '🧑‍🤝‍🧑' },
  { keywords: ['work', 'colleague', 'coworker', 'office', 'job'], emoji: '💼' },
  { keywords: ['client', 'customer'], emoji: '🤝' },
  { keywords: ['kid', 'child', 'children', 'baby'], emoji: '🧒' },
  { keywords: ['pet', 'dog', 'cat', 'animal'], emoji: '🐾' },
  { keywords: ['partner', 'love', 'spouse', 'wife', 'husband', 'boyfriend', 'girlfriend', 'crush'], emoji: '❤️' },
  { keywords: ['school', 'class', 'classmate', 'college', 'university'], emoji: '🎓' },
  { keywords: ['neighbor'], emoji: '🏘️' },
  { keywords: ['team', 'sport', 'gym'], emoji: '🏆' },
  { keywords: ['music', 'band'], emoji: '🎵' },
  { keywords: ['church', 'faith'], emoji: '🙏' },
  { keywords: ['travel', 'trip'], emoji: '✈️' },
  { keywords: ['clothing', 'clothes', 'apparel', 'fashion'], emoji: '👕' },
  { keywords: ['movie', 'film', 'cinema'], emoji: '🎬' },
  { keywords: ['artist', 'singer', 'rapper', 'musician'], emoji: '🎤' },
  { keywords: ['shoe', 'sneaker'], emoji: '👟' },
  { keywords: ['tech', 'electronics', 'gadget'], emoji: '💻' },
  { keywords: ['hygiene', 'skincare', 'grooming', 'cologne'], emoji: '🧴' },
  { keywords: ['anime', 'manga'], emoji: '🎌' },
  { keywords: ['show', 'series', 'tv'], emoji: '📺' },
  { keywords: ['song', 'track', 'single'], emoji: '🎵' },
];

const CATEGORY_EMOJI_FALLBACK = ['🎉', '🎈', '🎊', '🌟', '💫', '🎁', '✨', '🎆', '🪩', '🎇'];

// Keyword match first; otherwise a deterministic (but varied) fallback so
// unmatched category names don't all end up with the same icon.
function pickCategoryEmoji(name) {
  const lower = name.toLowerCase();
  const match = CATEGORY_EMOJI_KEYWORDS.find((entry) => entry.keywords.some((k) => lower.includes(k)));
  if (match) return match.emoji;

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_EMOJI_FALLBACK[hash % CATEGORY_EMOJI_FALLBACK.length];
}

/* ===================== EMAX (personal brand/media compatibility) ===================== */
// Same categories-of-entries shape as the Birthday Database above, kept in
// its own store since these are things you like, not people you know -
// EMAX_STARTER_CATEGORIES gets seeded in incrementally (emax.js, tracked by
// EMAX_SEEN_STARTERS_KEY): any name in this list not yet marked "seen" for
// this account gets added once, so a NEW starter category added to the app
// later (Anime/Shows/Songs, added well after the original 6 shipped) still
// reaches an EXISTING user's already-populated database, not just a
// brand-new one. A name only ever gets offered once - deleting it afterward
// (an original starter or a newly-added one) is never resurrected. From
// there it's just an ordinary extensible category list, same "Add Category"
// capability as the Birthday Database.

const EMAX_STORAGE_KEY = 'numerology_emax_db';
const EMAX_SEEN_STARTERS_KEY = 'numerology_emax_starters_seen_v1';

const EMAX_STARTER_CATEGORIES = [
  'Clothing Brands', 'Movies', 'Artists', 'Shoe Brands', 'Technology Brands', 'Hygiene Brands',
  'Anime', 'Shows', 'Songs',
];

function loadEmaxDB() {
  try {
    const raw = localStorage.getItem(EMAX_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && Array.isArray(parsed.categories)) ? parsed : { categories: [] };
  } catch (e) {
    return { categories: [] };
  }
}

function saveEmaxDB(db) {
  localStorage.setItem(EMAX_STORAGE_KEY, JSON.stringify(db));
  cloudPushKey(EMAX_STORAGE_KEY);
}

/* ===================== My Profile ===================== */

const PROFILE_KEY = 'numerology_profile';

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  cloudPushKey(PROFILE_KEY);
}

/* ===================== UFC Stadiums ===================== */

const STADIUMS_KEY = 'numerology_ufc_stadiums';

function loadStadiums() {
  try {
    const raw = localStorage.getItem(STADIUMS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveStadiums(stadiums) {
  localStorage.setItem(STADIUMS_KEY, JSON.stringify(stadiums));
  cloudPushKey(STADIUMS_KEY);
}

/* ===================== International regions (fight venues outside the US) ===================== */
// The international counterpart of a US state: the host city/emirate/
// province (e.g. Abu Dhabi) and its founding date, which is what the
// location factor scores against. Cities rarely have one agreed-on
// founding date, so there's no seed list - the user adds each one with
// whatever date they count from, and it syncs like everything else.

const INTL_REGIONS_KEY = 'numerology_intl_regions';

function loadIntlRegions() {
  try {
    const raw = localStorage.getItem(INTL_REGIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveIntlRegions(regions) {
  localStorage.setItem(INTL_REGIONS_KEY, JSON.stringify(regions));
  cloudPushKey(INTL_REGIONS_KEY);
}

function allIntlRegions() {
  return loadIntlRegions().slice().sort((a, b) => a.name.localeCompare(b.name));
}

/* ===================== UFC Custom Fighters ===================== */

const CUSTOM_FIGHTERS_KEY = 'numerology_ufc_custom_fighters';

function loadCustomFighters() {
  try {
    const raw = localStorage.getItem(CUSTOM_FIGHTERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveCustomFighters(fighters) {
  localStorage.setItem(CUSTOM_FIGHTERS_KEY, JSON.stringify(fighters));
  cloudPushKey(CUSTOM_FIGHTERS_KEY);
}

// Edits made to the built-in UFC_FIGHTERS roster (which is static seed data,
// not stored) - keyed by a synthetic "seed-<index>" id, {name, dob} only.
const FIGHTER_OVERRIDES_KEY = 'numerology_ufc_fighter_overrides';

function loadFighterOverrides() {
  try {
    const raw = localStorage.getItem(FIGHTER_OVERRIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveFighterOverrides(overrides) {
  localStorage.setItem(FIGHTER_OVERRIDES_KEY, JSON.stringify(overrides));
  cloudPushKey(FIGHTER_OVERRIDES_KEY);
}

/* ===================== Tennis Venues + Custom Players ===================== */
// Same pattern as the UFC section above - a tournament venue list scoped to
// tennis (a UFC arena and a tennis tournament site are different lists),
// plus custom players and overrides to the static TENNIS_PLAYERS seed data.

const TENNIS_VENUES_KEY = 'numerology_tennis_venues';

function loadTennisVenues() {
  try {
    const raw = localStorage.getItem(TENNIS_VENUES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveTennisVenues(venues) {
  localStorage.setItem(TENNIS_VENUES_KEY, JSON.stringify(venues));
  cloudPushKey(TENNIS_VENUES_KEY);
}

const TENNIS_CUSTOM_PLAYERS_KEY = 'numerology_tennis_custom_players';

function loadCustomTennisPlayers() {
  try {
    const raw = localStorage.getItem(TENNIS_CUSTOM_PLAYERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveCustomTennisPlayers(players) {
  localStorage.setItem(TENNIS_CUSTOM_PLAYERS_KEY, JSON.stringify(players));
  cloudPushKey(TENNIS_CUSTOM_PLAYERS_KEY);
}

// Edits made to the built-in TENNIS_PLAYERS roster - keyed by a synthetic
// "seed-<index>" id, same shape as a player: {name, dob, tour, tournament}.
const TENNIS_PLAYER_OVERRIDES_KEY = 'numerology_tennis_player_overrides';

function loadTennisPlayerOverrides() {
  try {
    const raw = localStorage.getItem(TENNIS_PLAYER_OVERRIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveTennisPlayerOverrides(overrides) {
  localStorage.setItem(TENNIS_PLAYER_OVERRIDES_KEY, JSON.stringify(overrides));
  cloudPushKey(TENNIS_PLAYER_OVERRIDES_KEY);
}

/* ===================== UFC Numerology Predictions (Stats tracker) ===================== */
// One entry per fight, recorded the first time its numerology edge is shown
// on the Polymarket tracker - never overwritten afterward, so it stays a
// locked-in pick rather than drifting with line movement. result stays null
// until the Stats page resolves it against Polymarket.

const UFC_PREDICTIONS_KEY = 'numerology_ufc_predictions';

function loadUfcPredictions() {
  try {
    const raw = bigStoreGetItem(UFC_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveUfcPredictions(predictions) {
  saveJsonGuarded(UFC_PREDICTIONS_KEY, predictions);
  cloudPushKey(UFC_PREDICTIONS_KEY);
}

// Fighter names from Polymarket sometimes carry suffixes or middle names our
// roster doesn't ("Levi Rodrigues" vs "Levi Rodrigues Jr.") - normalize and
// fall back to a first+last token match rather than requiring an exact
// string match. Shared by the Polymarket tracker (matching against the
// fighter roster) and the Stats page (matching a resolved winner's name
// against a stored pick).
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ===================== UFC full names from the event title ===================== */
// Polymarket UFC events before ~March 2026 list outcomes as bare surnames
// (["Spann","Kuniev"]) that no roster or birthdate lookup can safely use -
// but the event TITLE usually carries the full names ("UFC Fight Night:
// Ryan Spann vs. Rizvan Kuniev (Heavyweight, Main Card)"), the same trick
// parseTennisTitle already relies on for tennis. Shared here because both
// the Stats backfill/today-tracker (stats-ufc.js) and the live tracker
// (polymarket-ufc.js) need it, and those files never load together.

// "UFC 326: Charles Oliveira vs. Max Holloway (Lightweight, Main Card)"
// -> { nameA: 'Charles Oliveira', nameB: 'Max Holloway' }, or null when the
// title doesn't follow the shape - callers fall back to outcomes[] as-is.
function ufcNamesFromEventTitle(title) {
  const colonIdx = (title || '').indexOf(':');
  if (colonIdx === -1) return null;
  const matchup = title.slice(colonIdx + 1).trim().replace(/\s*\([^)]*\)\s*$/, '');
  const vs = /\s+vs\.?\s+/i.exec(matchup);
  if (!vs) return null;
  const nameA = matchup.slice(0, vs.index).trim();
  const nameB = matchup.slice(vs.index + vs[0].length).trim();
  return nameA && nameB ? { nameA, nameB } : null;
}

// Aligns a title's full names to the outcome sides - outcomes[0] is what
// prices and results are indexed by, so side A must stay that person. The
// outcome label is either the full name or its trailing part ("Spann" of
// "Ryan Spann"); if neither title name matches outcomes[0], or both do
// (same-surname opponents), alignment is ambiguous and the outcomes are
// kept as-is rather than guessed.
function alignSideNamesToOutcomes(outcomes, parsed) {
  const fallback = { nameA: outcomes[0], nameB: outcomes[1] };
  if (!parsed) return fallback;
  const matches = (outcome, name) => {
    const o = normalizeName(outcome);
    const n = normalizeName(name);
    return !!o && !!n && (o === n || n.endsWith(' ' + o));
  };
  const a0 = matches(outcomes[0], parsed.nameA);
  const b0 = matches(outcomes[0], parsed.nameB);
  if (a0 && !b0) return { nameA: parsed.nameA, nameB: parsed.nameB };
  if (b0 && !a0) return { nameA: parsed.nameB, nameB: parsed.nameA };
  return fallback;
}

function ufcResolveSideNames(outcomes, title) {
  return alignSideNamesToOutcomes(outcomes, ufcNamesFromEventTitle(title));
}

// Tennis counterpart, for the Stats backfill/today-tracker: titles are
// "{City}: A vs B" and always carry full names, while outcomes[] sometimes
// only has surnames (polymarket-tennis.js's parseTennisTitle relies on the
// same fact). Split on the LAST " vs " like parseTennisTitle does. Full
// names matter double here - tennis has same-surname siblings on tour
// (Cerundolo, Andreeva), exactly what the ambiguity fallback refuses to
// guess about.
function tennisResolveSideNames(outcomes, title) {
  const colonIdx = (title || '').indexOf(':');
  if (colonIdx === -1) return alignSideNamesToOutcomes(outcomes, null);
  const matchup = title.slice(colonIdx + 1).trim();
  const vsIdx = matchup.toLowerCase().lastIndexOf(' vs ');
  if (vsIdx === -1) return alignSideNamesToOutcomes(outcomes, null);
  const nameA = matchup.slice(0, vsIdx).trim();
  const nameB = matchup.slice(vsIdx + 4).trim();
  return alignSideNamesToOutcomes(outcomes, nameA && nameB ? { nameA, nameB } : null);
}

/* ===================== Tennis Numerology Predictions (Stats tracker) ===================== */
// Tennis counterpart of UFC_PREDICTIONS_KEY above - same shape, recorded by
// polymarket-tennis.js the first time a match's numerology edge is shown.

const TENNIS_PREDICTIONS_KEY = 'numerology_tennis_predictions';

function loadTennisPredictions() {
  try {
    const raw = bigStoreGetItem(TENNIS_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveTennisPredictions(predictions) {
  saveJsonGuarded(TENNIS_PREDICTIONS_KEY, predictions);
  cloudPushKey(TENNIS_PREDICTIONS_KEY);
}

/* ===================== MLB Predictions (Stats tracker) ===================== */
// Team-composite counterpart of UFC_PREDICTIONS_KEY/TENNIS_PREDICTIONS_KEY -
// same shape (a favorite/underdog pick vs. the market, resolved later), just
// with teamAName/teamBName instead of fighterAName/playerAName. Recorded by
// polymarket-mlb.js only once both teams' full lineups are known (unlike UFC/
// Tennis, an MLB pick isn't locked in on partial data - the composite isn't
// stable until the whole roster is).

const MLB_PREDICTIONS_KEY = 'numerology_mlb_predictions';

function loadMlbPredictions() {
  try {
    const raw = bigStoreGetItem(MLB_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMlbPredictions(predictions) {
  saveJsonGuarded(MLB_PREDICTIONS_KEY, predictions);
  cloudPushKey(MLB_PREDICTIONS_KEY);
}

// Auto-populated cache of MLB ballpark founding dates, keyed by venue name -
// same role STADIUMS_KEY/TENNIS_VENUES_KEY play, but nothing here is ever
// manually added through a form. polymarket-mlb.js looks a venue up here
// first and only falls back to the Wikipedia/Wikidata lookup (already built
// for UFC/Tennis venues) on a cache miss, then saves the result here so it's
// a one-time lookup per ballpark rather than once per game.
/* ===================== Storage size guard ===================== */
// localStorage is only ~5MB per origin (less on iOS Safari), and the MLB
// stores outgrew it: measured against real records, a full 52-week window
// projected to ~6.6MB back when the pitcher-duel markets were still collected
// (game picks 2.3 + K signals 1.6 + NRFI 1.4 + totals 1.5); dropping those two
// takes ~2.9MB off it, but the remainder still clears the cap once NBA is
// counted. Past the cap setItem throws QuotaExceededError, which surfaced as an
// opaque "something went wrong" halfway through a long backfill. Big stores
// save through here so the failure names itself and points at the fix.

function numerologyStorageBytes() {
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k) continue;
    bytes += k.length + (localStorage.getItem(k) || '').length;
  }
  return bytes;
}

function numerologyStorageMB() {
  return (numerologyStorageBytes() / (1024 * 1024)).toFixed(2);
}

function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || /quota/i.test(e.message || ''));
}

function saveJsonGuarded(key, value) {
  try {
    // Big stores go to IndexedDB (via the cache); everything else stays in
    // localStorage. bigStoreSetItem only throws if it had to fall back to
    // localStorage and that hit the quota too.
    if (BIG_STORE_KEYS.includes(key)) bigStoreSetItem(key, JSON.stringify(value));
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (isQuotaError(e)) {
      throw new Error(`Browser storage is full (~${numerologyStorageMB()} MB used, limit is about 5 MB). Download a backup from the Bet Log page first, then free space - see the Storage box on Old Data.`);
    }
    throw e;
  }
}

const MLB_VENUES_KEY = 'numerology_mlb_venues';

function loadMlbVenues() {
  try {
    const raw = localStorage.getItem(MLB_VENUES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMlbVenues(venues) {
  localStorage.setItem(MLB_VENUES_KEY, JSON.stringify(venues));
  cloudPushKey(MLB_VENUES_KEY);
}

/* ===================== MLB pitcher strikeout research signal ===================== */
// Not a bet - a standalone hypothesis test. Polymarket has no single-game
// strikeout prop market (only season-long "Strikeouts Leader" futures, in a
// public-search check), so this tracks a starting pitcher's own numerology
// day score against THEIR OWN season-average strikeout rate instead of a
// market line, resolved purely off MLB's own boxscore/season-stat data. Kept
// separate from MLB_PREDICTIONS_KEY since it's a different kind of claim
// (deviation from a personal baseline, not a win/loss vs. an opponent).
const MLB_PITCHER_K_SIGNALS_KEY = 'numerology_mlb_pitcher_k_signals';

function loadMlbPitcherKSignals() {
  try {
    const raw = bigStoreGetItem(MLB_PITCHER_K_SIGNALS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMlbPitcherKSignals(signals) {
  saveJsonGuarded(MLB_PITCHER_K_SIGNALS_KEY, signals);
  cloudPushKey(MLB_PITCHER_K_SIGNALS_KEY);
}

// Marks how far the Stats page's historical backfill has already caught up,
// so a later click tops up only the new gap instead of re-walking (and
// re-fetching schedules/box scores/prices for) the full window every time.
// How far back a backfill walks. Adjustable because a full 52 weeks of all
// four MLB stores exceeds the localStorage cap - halving the window is the
// fastest way back under it without losing the recent history that matters
// most. Changing it clears the progress marker so the next run re-walks.
const MLB_BACKFILL_WINDOW_KEY = 'numerology_mlb_backfill_window_days';
// 728 = two full years. It exists for one specific job: everything before the
// 364-day window is data the current weights were NEVER fitted on, so running
// the frozen model across it is a genuine out-of-sample test rather than more
// of the same. It also roughly doubles every tier's sample, which is what the
// win-probability estimates actually need - a tier qualifies at 20 picks, where
// the standard error is around 11 points, comparable to the whole claimed edge.
// Whether Polymarket's price history reaches back that far is the open question;
// where it doesn't, those games simply produce no pick.
const MLB_BACKFILL_WINDOW_OPTIONS = [91, 182, 273, 364, 728];

function loadMlbBackfillWindowDays() {
  const v = Number(localStorage.getItem(MLB_BACKFILL_WINDOW_KEY));
  return MLB_BACKFILL_WINDOW_OPTIONS.includes(v) ? v : 364;
}

function saveMlbBackfillWindowDays(days) {
  localStorage.setItem(MLB_BACKFILL_WINDOW_KEY, String(days));
}

const MLB_BACKFILL_STATE_KEY = 'numerology_mlb_backfill_state';

function loadMlbBackfillState() {
  try {
    const raw = localStorage.getItem(MLB_BACKFILL_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveMlbBackfillState(state) {
  localStorage.setItem(MLB_BACKFILL_STATE_KEY, JSON.stringify(state));
  cloudPushKey(MLB_BACKFILL_STATE_KEY);
}

/* ===================== Shared athlete scoring (fighters/players/MLB roster) ===================== */
// Day 60/Venue 15/Region 25 (or Day 75/Region 25 without a venue) blend -
// used for a single person (or, for MLB, any one entity - a batter, the
// pitcher, the manager, even the franchise itself scored against its
// founding date like a birthdate) against a match date, venue, and region.
// Was duplicated identically in ufc.js and polymarket-ufc.js; hoisted here
// once MLB needed the exact same formula for an 11th-12th time over.
// stateDate is optional too (on top of the already-optional stadiumDate) -
// used by the UFC backfill, which has no reliable per-fight venue/region
// source the way MLB's official venue API or Tennis's tournament-city title
// parsing do. A day-only score is a real, honest degrade (not a guess), same
// spirit as dropping just the stadium anchor when only that's missing.
// dayOnly scores on the birth-vs-game-day anchor alone, ignoring the stadium
// and state anchors for the COMBINED number while still computing both so the
// breakdown popups and the dimension-edge table can keep reporting them. Only
// MLB passes it - see MLB_DAY_ANCHOR_ONLY.
// compatWeights overrides the dimension blend inside each anchor's compat score
// (life path / day number / day-of-year / zodiac / western). Defaults to the
// app-wide blend; MLB passes MLB_COMPAT_WEIGHTS.
function computeFighterScore(dobDate, matchDate, stadiumDate, stateDate, dayOnly, compatWeights) {
  const w = compatWeights || COMPAT_DEFAULT_WEIGHTS;
  const day = computeCompatibility(dobDate, matchDate, sportsNumerologyCompat, w);
  if (dayOnly) {
    const state = stateDate ? computeCompatibility(dobDate, stateDate, sportsNumerologyCompat, w) : null;
    const stadium = stadiumDate ? computeCompatibility(dobDate, stadiumDate, sportsNumerologyCompat, w) : null;
    return { day, stadium, state, combined: day.finalScore };
  }
  if (!stateDate) {
    return { day, stadium: null, state: null, combined: day.finalScore };
  }
  const state = computeCompatibility(dobDate, stateDate, sportsNumerologyCompat, w);
  if (!stadiumDate) {
    const combined = Math.round(0.75 * day.finalScore + 0.25 * state.finalScore);
    return { day, stadium: null, state, combined };
  }
  const stadium = computeCompatibility(dobDate, stadiumDate, sportsNumerologyCompat, w);
  const combined = Math.round(0.60 * day.finalScore + 0.15 * stadium.finalScore + 0.25 * state.finalScore);
  return { day, stadium, state, combined };
}

/* ===================== Life Path research insight (informational only) ===================== */
// Reference data from NUMEROLOGY_RESEARCH.md - describes what a life path number tends to
// MEAN (its theme, how volatile it runs, whether it carries a physical/athletic read),
// none of which was in the numeric compat tables above. This is display-only: nothing here
// feeds computeFighterScore, edge tiers, or any prediction - it only powers the "Insight"
// tab on the breakdown popups so the numbers on the "Breakdown" tab have a plain-English
// why behind them. Keyed by numerologyLookupKey() so 13 (karmic, borrows 4's row) resolves
// the same way it already does everywhere else.
const LIFE_PATH_THEMES = {
  1: 'Leadership', 2: 'Cooperation', 3: 'Expression', 4: 'Structure', 5: 'Freedom',
  6: 'Care', 7: 'Analysis', 8: 'Power', 9: 'Adaptability', 11: 'Emotional Intensity',
  22: 'Master Building', 28: 'Structural Pressure', 33: 'Influence',
};

// Boom/bust framing (8, 11, 3, 5) vs. steady framing (4, 6) straight from how CUE describes
// each number's own risk profile - not derived from any of our own game results yet.
const LIFE_PATH_VOLATILITY = {
  1: 'medium', 2: 'low', 3: 'high', 4: 'low', 5: 'high', 6: 'low', 7: 'medium',
  8: 'high', 9: 'medium', 11: 'high', 22: 'medium', 28: 'medium', 33: 'medium',
};

const VOLATILITY_BADGES = {
  low: { icon: '🛡️', label: 'Low Variance' },
  medium: { icon: '◐', label: 'Medium Variance' },
  high: { icon: '⚡', label: 'High Variance' },
};

// Only the numbers CUE explicitly ties to a physical/athletic read get a badge here -
// everything else is genuinely neutral on this axis, not just missing data.
const LIFE_PATH_ATHLETIC_ARCHETYPE = {
  1: { icon: '🏃', label: 'Athletic Archetype' },
  11: { icon: '🏃', label: 'Athletic Archetype' },
  5: { icon: '🏃', label: 'Athletic Archetype' },
  7: { icon: '⚠️', label: 'Injury-Risk Profile' },
  8: { icon: '😓', label: 'Physical Strain Under Pressure' },
};

// Reuses the same score bands as EDGE_TIERS in spirit, but as a relationship descriptor
// rather than a betting-edge label - describing what the existing (already-validated)
// number actually means, not adding a new one.
function clashTypeForScore(score) {
  if (score >= 85) return { icon: '🚀', label: 'Amplifying Synergy' };
  if (score >= 70) return { icon: '🤝', label: 'Stable Complement' };
  if (score >= 50) return { icon: '➖', label: 'Workable Overlap' };
  if (score >= 30) return { icon: '⚠️', label: 'Structural Friction' };
  return { icon: '⚔️', label: 'Fundamental Clash' };
}

// One person's insight card: their theme, volatility read, and athletic/injury badge (if
// CUE called one out for this number). lookupValue is compatLifePathInfo(dobDate).lookupValue.
function lifePathInsight(lookupValue) {
  const key = numerologyLookupKey(lookupValue);
  return {
    theme: LIFE_PATH_THEMES[key] || 'Unknown',
    volatility: VOLATILITY_BADGES[LIFE_PATH_VOLATILITY[key]] || VOLATILITY_BADGES.medium,
    athletic: LIFE_PATH_ATHLETIC_ARCHETYPE[key] || null,
  };
}

// "Universal Day" - the match/game date itself, run through the exact same
// compatLifePathInfo() reduction a birthdate gets, then compared to a
// person's own life path via sportsNumerologyCompat. This isn't a new number:
// it's the dominant (60%) sub-component already sitting inside
// computeFighterScore's "day" factor (computeCompatibility's lifePathScore) -
// today it only ever surfaces blended into day.finalScore, never on its own.
// Added as an extra Insight-tab layer alongside the person-vs-person read
// below, not a replacement - this measures how a person's own number is
// running on this specific day, not how two people's numbers relate.
function universalDayInsight(personLookupValue, matchDate) {
  const dayInfo = compatLifePathInfo(matchDate);
  const score = sportsNumerologyCompat(personLookupValue, dayInfo.lookupValue);
  return { score, clash: clashTypeForScore(score), dayDisplay: dayInfo.display };
}

function universalDayInsightHtml(name, personLookupValue, matchDate) {
  const insight = universalDayInsight(personLookupValue, matchDate);
  return `
    <div class="pm-insight-pair">
      <div class="pm-insight-pair-clash">${insight.clash.icon} ${escapeHtml(insight.clash.label)} <span class="score-inline ${scoreClass(insight.score)}">${insight.score}</span></div>
      <div class="pm-insight-pair-theme">${escapeHtml(name)} vs Universal Day ${escapeHtml(insight.dayDisplay)}</div>
    </div>
  `;
}

// The pairwise "why" between two entities - runs their life paths through the same
// numerologyCompat table as everything else, purely to label the relationship, not to
// score it (UFC/Tennis fighters are never scored against each other for real - only
// MLB's pitcher-vs-lineup factor does that, and only there does a number like this one
// already feed the actual composite).
function pairInsight(lookupA, lookupB) {
  const themeA = LIFE_PATH_THEMES[numerologyLookupKey(lookupA)] || 'Unknown';
  const themeB = LIFE_PATH_THEMES[numerologyLookupKey(lookupB)] || 'Unknown';
  const score = numerologyCompat(lookupA, lookupB);
  return {
    score,
    clash: clashTypeForScore(score),
    themeLine: lookupA === lookupB ? `${themeA} meets itself` : `${themeA} meets ${themeB}`,
  };
}

function insightBadgeHtml(badge) {
  return `<span class="pm-insight-badge">${badge.icon} ${escapeHtml(badge.label)}</span>`;
}

// One person's insight block (life path number + theme + volatility + athletic tag) -
// shared markup for the UFC/Tennis/MLB insight tabs so they all look identical.
function personInsightHtml(name, lifePathDisplay, lookupValue) {
  const insight = lifePathInsight(lookupValue);
  return `
    <div class="pm-insight-person">
      <div class="pm-breakdown-name">${escapeHtml(name)}</div>
      <div class="pm-insight-lifepath">Life Path <span class="score-inline mid">${escapeHtml(lifePathDisplay)}</span> &middot; ${escapeHtml(insight.theme)}</div>
      <div class="pm-insight-badges">
        ${insightBadgeHtml(insight.volatility)}
        ${insight.athletic ? insightBadgeHtml(insight.athletic) : ''}
      </div>
    </div>
  `;
}

// One MLB team's roster reduced to {role, lookupValue, dayScore} rows for the
// Insight tab - pitcher, batters, and manager only (the franchise's
// zodiac-year score isn't a person's life path, so it's left out of this
// reading on purpose). Shared by the live tracker (polymarket-mlb.js, from
// already-loaded roster state) and the Stats page (stats-mlb.js, re-derived
// live from a resolved game's gamePk) - both already have
// `side`/`manager`/`birthdates` in the exact same shape
// mlb-api.js's fetchGameLiveFeed()/fetchPeopleBirthdates() produce, so one
// function covers both call sites. matchDate is optional (null while a
// timezone hasn't confirmed yet) - dayScore is just left off the row rather
// than guessed.
function teamRosterInsightRows(side, manager, birthdates, matchDate) {
  const dayScoreFor = (lookupValue) => (matchDate ? universalDayInsight(lookupValue, matchDate).score : null);
  const rows = [];
  const pitcherBd = birthdates.get(side.startingPitcherId);
  if (pitcherBd && pitcherBd.birthDate) {
    const lookupValue = compatLifePathInfo(parseDateInput(pitcherBd.birthDate)).lookupValue;
    rows.push({ role: `SP ${pitcherBd.name}`, lookupValue, dayScore: dayScoreFor(lookupValue) });
  }
  side.batters.forEach((b) => {
    const bd = birthdates.get(b.id);
    if (!bd || !bd.birthDate) return;
    const lookupValue = compatLifePathInfo(parseDateInput(bd.birthDate)).lookupValue;
    rows.push({ role: `${b.pos} ${bd.name}`, lookupValue, dayScore: dayScoreFor(lookupValue) });
  });
  if (manager) {
    const bd = birthdates.get(manager.id);
    if (bd && bd.birthDate) {
      const lookupValue = compatLifePathInfo(parseDateInput(bd.birthDate)).lookupValue;
      rows.push({ role: `Mgr ${bd.name}`, lookupValue, dayScore: dayScoreFor(lookupValue) });
    }
  }
  return rows;
}

function insightRowHtml(row) {
  const insight = lifePathInsight(row.lookupValue);
  const icons = insight.volatility.icon + (insight.athletic ? insight.athletic.icon : '');
  const dayPart = row.dayScore != null ? ` &middot; Day <span class="score-inline ${scoreClass(row.dayScore)}">${row.dayScore}</span>` : '';
  return `<div class="pm-breakdown-row"><span>${escapeHtml(row.role)}</span><span>${escapeHtml(insight.theme)} ${icons}${dayPart}</span></div>`;
}

// Wraps a breakdown popup's existing content plus the new Insight tab into the
// shared two-tab shell, identical across UFC/Tennis/MLB.
function modalTabsHtml(breakdownHtml, insightHtml) {
  return `
    <div class="pm-modal-tabs">
      <button class="pm-modal-tab active" data-tab="breakdown" type="button">📊 Breakdown</button>
      <button class="pm-modal-tab" data-tab="insight" type="button">🔮 Insight</button>
    </div>
    <div class="pm-modal-page" data-page="breakdown">${breakdownHtml}</div>
    <div class="pm-modal-page" data-page="insight" style="display:none;">${insightHtml}</div>
  `;
}

// Wires the Breakdown/Insight tab clicks once per page - the modal body's own
// innerHTML gets fully replaced on every open, but the body element itself
// never does, so a single delegated listener (same pattern as the trade-feed
// toggle) is all that's needed.
//
// The toggle is scoped to the clicked tab's OWN .pm-modal-tabs bar and the
// .pm-modal-page siblings of that bar - never a blanket querySelectorAll over
// the whole container. That matters because these tab groups nest: the MLB
// Stats page wraps its Today/Old scope in one .pm-modal-tabs/.pm-modal-page
// set, and a matchup modal opened inside a scope page brings its own
// Breakdown/Insight set. A click on the modal's Insight tab bubbles up to the
// outer scope switcher too, and a blanket toggle there would hide every page
// whose data-page isn't "insight" - including both scope pages, blanking the
// screen. Scoping to the clicked bar's siblings makes that bubbled call a
// harmless no-op on the modal's own pages instead.
function initModalTabSwitcher(bodyElementId) {
  const body = document.getElementById(bodyElementId);
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.pm-modal-tab');
    if (!btn) return;
    const tabsBar = btn.closest('.pm-modal-tabs');
    if (!tabsBar || !body.contains(tabsBar)) return;
    const tab = btn.dataset.tab;
    tabsBar.querySelectorAll('.pm-modal-tab').forEach((b) => b.classList.toggle('active', b === btn));
    Array.from(tabsBar.parentElement.children)
      .filter((el) => el.classList && el.classList.contains('pm-modal-page'))
      .forEach((p) => { p.style.display = p.dataset.page === tab ? '' : 'none'; });
  });
}

// Pitcher vs. opposing lineup, person-vs-person rather than person-vs-date -
// the pitcher's life path run against each opposing batter's through the same
// sportsNumerologyCompat table fighter-vs-fighter uses. Returns the full
// per-batter breakdown (not just the average) so both the live tracker's
// composite (which only needs the average) and the Stats page's matchup
// modal (which shows the batter-by-batter detail) share one formula instead
// of drifting apart. batters is [{ name, pos, dobDate }] - already parsed by
// the caller, same convention computeFighterScore uses above.
function pitcherVsLineupBreakdown(pitcherDobDate, batters) {
  const pitcherLifePath = compatLifePathInfo(pitcherDobDate).lookupValue;
  return batters.map((b) => ({
    name: b.name,
    pos: b.pos,
    combined: sportsNumerologyCompat(pitcherLifePath, compatLifePathInfo(b.dobDate).lookupValue),
  }));
}

// Real franchise founding dates (month/day/year, not just the year MLB's own
// firstYearOfPlay field gives us) - sourced from CUE (cuetheapp.com), keyed
// by MLB Stats API team id so it lines up with teamInfo.id from
// fetchTeamInfo(). Several teams' years genuinely disagree with MLB's own
// firstYearOfPlay (expansion-franchise-awarded vs. first-game-played, or a
// different historical anchor entirely for the oldest clubs like the
// Reds/Cardinals/Orioles) - that's not an error to reconcile, CUE's date is
// the one actually used for scoring once a team is listed here.
const MLB_TEAM_FOUNDING_DATES = {
  108: '1961-04-11', // Los Angeles Angels
  109: '1998-03-31', // Arizona Diamondbacks
  110: '1954-04-13', // Baltimore Orioles
  111: '1901-04-26', // Boston Red Sox
  112: '1876-04-25', // Chicago Cubs
  113: '1869-05-04', // Cincinnati Reds
  114: '1901-04-24', // Cleveland Guardians
  115: '1993-04-05', // Colorado Rockies
  116: '1901-04-25', // Detroit Tigers
  117: '1962-04-10', // Houston Astros
  118: '1969-04-08', // Kansas City Royals
  119: '1884-05-01', // Los Angeles Dodgers
  120: '1969-04-08', // Washington Nationals
  121: '1962-04-11', // New York Mets
  133: '1901-04-26', // Athletics
  134: '1882-05-02', // Pittsburgh Pirates
  135: '1969-04-08', // San Diego Padres
  136: '1977-04-06', // Seattle Mariners
  137: '1883-05-01', // San Francisco Giants
  138: '1882-05-02', // St. Louis Cardinals
  139: '1998-03-31', // Tampa Bay Rays
  140: '1961-04-10', // Texas Rangers
  141: '1977-04-07', // Toronto Blue Jays
  142: '1901-04-26', // Minnesota Twins
  143: '1883-05-01', // Philadelphia Phillies
  144: '1871-01-20', // Atlanta Braves
  145: '1901-04-24', // Chicago White Sox
  146: '1993-04-05', // Miami Marlins
  147: '1903-01-09', // New York Yankees
  158: '1969-04-07', // Milwaukee Brewers
};

// MLB team-composite role weights. Batters beyond the catcher are weighted
// flat (decided against batting-order weighting - the real plate-appearance
// gap top-to-bottom is modest, not worth the extra complexity).
//
// Weights v4 - fitted from the three-layer Weights Lab over ~3,700 resolved
// games (2026-07-28). The Starting Pitcher was the only role that beat the
// market on its own (52% vs 50%), every one of the role sweep's +3 blends
// carried pitcher at 50%, and this exact blend was the top find built
// entirely from roles that are individually positive (pitcher +2, manager
// +1, franchise +1 solo). Pitcher-vs-Lineup and Batters measured 0 alone and
// Catcher -1, so they score at ZERO - but their parts are still computed and
// stored in components (a zero weight adds nothing to the weighted average),
// so the component table and future lab runs keep auditing them. The v3
// story this replaces (manager-heavy 45/28, chosen off ~1,700 games where
// Manager solo measured +4 at 3.3 se) did not hold at twice the sample:
// Manager alone had fallen to +1, back inside the noise, while Pitcher held.
// See MLB_WEIGHTS_SINCE for the honest out-of-sample test: these numbers
// were fit to games already played, so their in-sample edge is optimistic by
// construction.
const MLB_ROLE_WEIGHTS = {
  manager: 0.25,
  pitcher: 0.50,
  pitcherMatchup: 0, // pitcher's life path vs. the opposing lineup's,
  // averaged across all 9 batters (pitcherVsLineupScore below) - measured no
  // edge alone, kept in parts/components at zero weight so it stays audited.
  catcher: 0, // measured -1 alone - the only negative role
  batter: 0, // each of the 8 non-catcher batters - measured 0 alone (as avg)
  franchise: 0.25, // Backed by a real founding date (MLB_TEAM_FOUNDING_DATES
  // above) for every current team, so it gets the full person-style
  // day/stadium/state blend like everything else. A team missing from that
  // table falls back to a thinner zodiac-year-only score, weighted down
  // instead (franchiseZodiacOnly below) - see computeTeamComposite below.
  franchiseZodiacOnly: 0.075, // same 30% haircut vs full franchise as v3 (0.03/0.10)
};

// The calendar date a game falls on at the venue - same pattern as
// currentMatchDateISO in polymarket-ufc.js/polymarket-tennis.js (kept as a
// separate, differently-shaped function per sport rather than forcing one
// signature - MLB's region lives per-game on g itself, so this takes the
// whole game object). Computed fresh on every call, never cached, so it can
// re-trigger the timezone lookup for a US venue this never needs (the fixed
// lookup resolves instantly) or an international one (Toronto) whose zone
// may still be in flight. Returns null when unconfirmed - callers must not
// score against a guess. onTimezoneResolved is an optional callback fired
// once an in-flight lookup completes (the live tracker uses it to re-render
// the card; a one-shot historical backfill has nothing live to re-render, so
// it's safe to omit - though the backfill path should already have awaited
// the region's timezone before ever getting here, since that branch existing
// at all means the calling code didn't score this game yet).
function currentMlbMatchDateISO(g, onTimezoneResolved) {
  if (g.regionMode === 'us') return localMatchDateISO(g.gameStartTime, 'us', g.region);
  if (g.region && !g.region.timezone) {
    ensureIntlRegionTimezone(g.region, onTimezoneResolved || (() => {}));
  }
  return localMatchDateISO(g.gameStartTime, 'intl', g.region);
}

// Pitcher vs. opposing lineup, averaged across all 9 batters into the one
// "does this pitcher's number play well against this specific lineup" score
// that feeds MLB_ROLE_WEIGHTS.pitcherMatchup above. batters is looked up from
// the shared birthdates map rather than passed pre-parsed, since both the
// live tracker and the historical backfill build opposingBatters the same
// way (a roster array of { id, pos }) but never keep parsed DOB objects
// lying around.
function pitcherVsLineupScore(pitcherDobDate, opposingBatters, birthdates) {
  const batters = opposingBatters
    .map((b) => {
      const bd = birthdates.get(b.id);
      return bd && bd.birthDate ? { name: bd.name, pos: b.pos, dobDate: parseDateInput(bd.birthDate) } : null;
    })
    .filter(Boolean);
  const rows = pitcherVsLineupBreakdown(pitcherDobDate, batters);
  if (!rows.length) return null;
  return Math.round(rows.reduce((s, r) => s + r.combined, 0) / rows.length);
}

// The 13-component weighted composite for one side of a game: starting
// pitcher, catcher, the 8 other batters (flat weight), the franchise (scored
// against its founding year like a birthdate), the manager, and the
// pitcher-vs-opposing-lineup matchup edge - every person-vs-date factor runs
// through the exact same computeFighterScore() UFC uses, weighted-averaged
// across a roster instead of standing alone. g is a plain object shape (not
// a class) so both the live tracker (polymarket-mlb.js, enriched from
// polling) and the historical backfill (stats-mlb.js, enriched once from an
// already-finished game) can build one and score it identically - nothing
// here cares how g got populated, only that it's fully populated.
// MLB scores every person on the birth-vs-game-day anchor alone.
//
// The dimension-edge table measured all three anchors separately over 2,404
// resolved games: the day anchor beat the market by +2, the state/region anchor
// by +1, and the stadium anchor by 0 - while the blended Full Score also came
// out at +2. So 40% of every MLB score (0.15 stadium + 0.25 state) sat on
// anchors carrying no measurable signal, and carrying them bought nothing: the
// blend never beat the day anchor it was diluting.
//
// This is a removal of dead weight rather than a search for a better number,
// which is why it is a defensible read of the same games that produced it -
// unlike picking whichever component happens to top the table. Expect the edge
// to stay at +2; what should improve is the spread, since the composite stops
// carrying two noise terms. UFC, Tennis and NBA are deliberately untouched -
// their own dimension tables have not been checked this way.
const MLB_DAY_ANCHOR_ONLY = true;

// The same dimension-edge table, read one level deeper. Inside each anchor's
// compat score the app's default blend put 36% on life path, 30% on the zodiac,
// 21% on the day number, 10% on the western sun sign and 3% on day-of-year -
// while the measured edges came out life path +1, zodiac +1, day number +2,
// western 0, day-of-year +2. The two dimensions that actually beat the market
// were carrying 24% of the score between them; the three at +1 or 0 carried 76%.
//
// This moves toward the measurement without handing the model over to it. The
// western sun sign goes to zero, since a measured 0 earns no weight (it is still
// computed and still reported, so it can be re-checked). Day-of-year rises to
// 19% rather than to its proportional share: its +2 was earned while carrying 3%
// of the score, making it the least stress-tested number in the table, and these
// edges are in-sample by construction - the same trap that made the Manager +4
// fail to replicate. Day number, the best-supported dimension, leads at 34%.
//
// Flattened: dayNum 33.75%, zodiac 25%, lifePath 22.5%, doy 18.75%, western 0%.
// MLB only - Tennis and NBA keep COMPAT_DEFAULT_WEIGHTS until their own
// dimension tables have been checked the same way. UFC got its own check
// and its own weights below.
const MLB_COMPAT_WEIGHTS = {
  numerology: 0.75, vietnamese: 0.25, western: 0,
  lifePath: 0.30, dayNum: 0.45, doy: 0.25,
};

// UFC blend, fitted 2026-07-28 on the rebuilt 141-resolved-pick record via
// the Weights Lab (stats-ufc.js). The zodiac YEAR ANIMAL alone measured
// +10 edge on 98 picks (~2 standard errors, the strongest clean reading in
// the record); the zodiac's own month (-4) and day-sign (-6) components,
// every numerology dimension, and the sun sign all measured
// flat-to-negative, and the old default blend sat at exactly 0. So UFC
// scores on the year animal alone: the vietnamese block takes the whole
// blend and its inner split is year-only (zodiacYear/Month/Day
// sub-weights, compat-engine.js). The lucky-number bonus still adds on
// top, unchanged. Same-animal matchups genuinely tie and drop out as
// tossups - fewer, sharper picks, by design.
//
// IN-SAMPLE fit, frozen 2026-07-28: the record from this date forward is
// the real test (the MLB reweight measured +46% in-fit vs -6%
// out-of-fit on exactly this kind of exercise).
const UFC_COMPAT_WEIGHTS = {
  numerology: 0, vietnamese: 1, western: 0,
  lifePath: 0, dayNum: 1, doy: 0, // inner numerology split is moot at numerology: 0
  zodiacYear: 1, zodiacMonth: 0, zodiacDay: 0,
};

function computeTeamComposite(g, sideLetter, onTimezoneResolved) {
  const side = sideLetter === 'A' ? g.sideA : g.sideB;
  const opposingSide = sideLetter === 'A' ? g.sideB : g.sideA;
  const teamInfo = sideLetter === 'A' ? g.teamInfoA : g.teamInfoB;
  const manager = sideLetter === 'A' ? g.managerA : g.managerB;

  const matchDateISO = currentMlbMatchDateISO(g, onTimezoneResolved);
  if (!matchDateISO) return null; // timezone not confirmed yet - don't guess
  const matchDate = parseDateInput(matchDateISO);
  const stateDate = g.region ? parseDateInput(g.region.founded) : null;
  const stadiumDate = g.stadiumFounded ? parseDateInput(g.stadiumFounded) : null;

  // Each part carries a stable `key` (pitcher / pitcherMatchup / catcher /
  // batter / franchise / manager) alongside its display role, so the Stats
  // page's component-signal analysis can group scores by what they ARE without
  // re-parsing the human role string. extractComponents() below turns a parts
  // array into one score per component.
  const parts = [];
  const pitcherBd = g.birthdates.get(side.startingPitcherId);
  if (pitcherBd && pitcherBd.birthDate) {
    parts.push({ key: 'pitcher', role: `SP ${pitcherBd.name}`, weight: MLB_ROLE_WEIGHTS.pitcher, score: computeFighterScore(parseDateInput(pitcherBd.birthDate), matchDate, stadiumDate, stateDate, MLB_DAY_ANCHOR_ONLY, MLB_COMPAT_WEIGHTS) });

    const matchupScore = pitcherVsLineupScore(parseDateInput(pitcherBd.birthDate), opposingSide.batters, g.birthdates);
    if (matchupScore != null) {
      parts.push({ key: 'pitcherMatchup', role: `SP ${pitcherBd.name} vs ${opposingSide.teamName} lineup`, weight: MLB_ROLE_WEIGHTS.pitcherMatchup, score: { combined: matchupScore } });
    }
  }
  side.batters.forEach((b) => {
    const bd = g.birthdates.get(b.id);
    if (!bd || !bd.birthDate) return;
    const isCatcher = b.pos === 'C';
    const weight = isCatcher ? MLB_ROLE_WEIGHTS.catcher : MLB_ROLE_WEIGHTS.batter;
    parts.push({ key: isCatcher ? 'catcher' : 'batter', role: `${b.pos} ${bd.name}`, weight, score: computeFighterScore(parseDateInput(bd.birthDate), matchDate, stadiumDate, stateDate, MLB_DAY_ANCHOR_ONLY, MLB_COMPAT_WEIGHTS) });
  });
  if (teamInfo) {
    const foundingISO = MLB_TEAM_FOUNDING_DATES[teamInfo.id];
    if (foundingISO) {
      // A real founding date (day/month/year, sourced from CUE) - scores
      // exactly like any other entity through computeFighterScore, at full
      // weight, instead of the thinner zodiac-only fallback below.
      const foundingDate = parseDateInput(foundingISO);
      parts.push({ key: 'franchise', role: `Franchise (est. ${foundingISO})`, weight: MLB_ROLE_WEIGHTS.franchise, score: computeFighterScore(foundingDate, matchDate, stadiumDate, stateDate, MLB_DAY_ANCHOR_ONLY, MLB_COMPAT_WEIGHTS) });
    } else if (teamInfo.firstYearOfPlay) {
      // No real date for this team - MLB's own API only gives a founding
      // YEAR, never a month/day, and (per explicit instruction) no
      // fabricated "January 1st" stand-in date either. The one thing a bare
      // year genuinely determines is which Vietnamese zodiac year it falls
      // in, so that's the only axis scored here - July 1st is just an anchor
      // safely past any possible Lunar New Year boundary (always Jan 21-Feb
      // 20) so getChineseZodiacYear resolves the correct animal for that
      // calendar year without claiming to know the real founding date.
      const franchiseYearAnchor = new Date(Number(teamInfo.firstYearOfPlay), 6, 1);
      const franchiseSign = getChineseZodiacYear(franchiseYearAnchor);
      const todaySign = getChineseZodiacYear(matchDate);
      const zodiacScore = vietnameseCompat(franchiseSign, todaySign);
      parts.push({ key: 'franchise', role: `Franchise (${teamInfo.firstYearOfPlay}, ${franchiseSign} year)`, weight: MLB_ROLE_WEIGHTS.franchiseZodiacOnly, score: { combined: zodiacScore } });
    }
  }
  if (manager) {
    const bd = g.birthdates.get(manager.id);
    if (bd && bd.birthDate) parts.push({ key: 'manager', role: `Mgr ${bd.name}`, weight: MLB_ROLE_WEIGHTS.manager, score: computeFighterScore(parseDateInput(bd.birthDate), matchDate, stadiumDate, stateDate, MLB_DAY_ANCHOR_ONLY, MLB_COMPAT_WEIGHTS) });
  }

  if (!parts.length) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  // Possible since v4 zeroed some roles: a game where ONLY zero-weighted
  // roles resolved has parts but no scoreable weight - don't divide by zero.
  if (!totalWeight) return null;
  const combined = Math.round(parts.reduce((s, p) => s + p.score.combined * p.weight, 0) / totalWeight);
  return { combined, parts };
}

// The component keys the team composite breaks into, and their display
// labels. 'batter' collapses to one 'batters' average in extractComponents
// (8 near-identical flat-weighted entries aren't worth storing individually
// for signal analysis). Order here is the order the Stats page's
// component-signal table shows them in before it re-sorts by measured edge.
const MLB_COMPONENT_KEYS = ['pitcher', 'pitcherMatchup', 'catcher', 'batters', 'franchise', 'manager'];

const MLB_COMPONENT_LABELS = {
  pitcher: 'Starting Pitcher',
  pitcherMatchup: 'Pitcher vs Lineup',
  catcher: 'Catcher',
  batters: 'Batters (avg)',
  franchise: 'Franchise',
  manager: 'Manager',
  composite: 'Full Composite',
  reweighted: 'Old Weights (pre-v3)',
};

// Collapses a computeTeamComposite() parts array into one score per component,
// stored on each prediction so the Stats page can later ask which single
// component best predicts the winner - the empirical way to decide what to
// weight more, instead of guessing. Returns nulls for anything a given game
// was missing (e.g. no manager birthdate), which the analysis then skips.
function extractComponents(parts) {
  const out = { pitcher: null, pitcherMatchup: null, catcher: null, batters: null, franchise: null, manager: null };
  const batterScores = [];
  (parts || []).forEach((p) => {
    const s = p.score && p.score.combined;
    if (s == null) return;
    if (p.key === 'batter') batterScores.push(s);
    else if (p.key && p.key in out) out[p.key] = s;
  });
  if (batterScores.length) out.batters = Math.round(batterScores.reduce((a, b) => a + b, 0) / batterScores.length);
  return out;
}

// The live composite's weighting expressed over the same six stored
// components, so any weighting can be recomputed apples-to-apples from a
// prediction's stored components alone - no re-scoring, no re-fetching.
// (When batters carry weight, one `batters` weight over the stored average
// reproduces the eight per-slot batter weights exactly: 8 x w = 8w x avg.)
const MLB_ROLE_WEIGHTS_CURRENT = {
  manager: 0.25,
  pitcher: 0.50,
  pitcherMatchup: 0,
  franchise: 0.25,
  catcher: 0,
  batters: 0,
};

// The weighting that was live before v3 - an up-front guess with nothing
// behind it, kept only so the component table can show what the move away
// from it actually bought. Its 40% on the batter average is the dilution v3
// exists to fix.
const MLB_ROLE_WEIGHTS_LEGACY = {
  pitcher: 0.24,
  pitcherMatchup: 0.15,
  catcher: 0.11,
  batters: 0.40,
  franchise: 0.17,
  manager: 0.08,
};

// A reworked, data-informed weighting. The live weights above were an up-front
// guess with nothing behind them; these lean on what the component-signal
// analysis actually found over ~280 resolved games - the Manager score beat
// the market most (~+8 pts) and the Starting Pitcher next (~+3), while the
// Catcher ran negative (~-3) and the batter average ~flat. So Manager and
// Pitcher carry the most weight here, Catcher and Batters the least. Kept as
// its own set so it can run in PARALLEL with the live model for out-of-sample
// validation before it's ever trusted to place a bet: the +8 is only ~2-3
// standard errors, promising but not proven, and its edge measured on the same
// games that chose these weights is circular. The honest test is games from
// MLB_V2_SINCE forward.
const MLB_ROLE_WEIGHTS_V2 = {
  pitcher: 0.30,
  manager: 0.30,
  pitcherMatchup: 0.15,
  franchise: 0.10,
  batters: 0.10,
  catcher: 0.05,
};

// The date the v4 weights went live. A resolved game on or after this had no
// hand in choosing them, so it's a fair out-of-sample test of the model that
// is now actually placing bets. (v3's out-of-sample window only ran
// 2026-07-26..28 - two days, far too short to have said anything.)
const MLB_WEIGHTS_SINCE = '2026-07-28';

// Superseded by MLB_WEIGHTS_SINCE - kept because older stored state and the
// component table's history still reference the v2 cutoff.
const MLB_V2_SINCE = '2026-07-19';

/* ===================== Rescore on a weight change ===================== */
// Changing the role weights would otherwise split the stored history across
// two models: games recorded before the change keep their old
// numerologyScoreA/B while new ones use the new weighting. That silently
// corrupts everything downstream - the edge gap and its tiers, the price
// buckets, and the betting engine's win-probability tallies - because two
// different scoring systems would be pooled as if they were one. Every
// prediction stores its per-component scores, so the composite can be
// rebuilt exactly without refetching anything: this rescores the whole store
// under the current weights, runs once per weight version, and also
// re-derives numerologyFavorite and pickType since a reweighting can flip
// which side the model prefers.

/* ===================== UFC weights rescore (no-rebuild) ===================== */
// The UFC counterpart of the MLB rescore below, so a UFC weights change
// never needs a Wipe & Rebuild again: every pick stores its per-dimension
// scores (dims.A/dims.B, zodiac year/month/day split included), and for a
// day-anchor-only sport the composite is EXACTLY reconstructable from them:
//   score = min(100, round( numerology·(lp·lifePath + dn·dayNum + doy·doy)
//                         + vietnamese·(zy·zodiacYear + zm·zodiacMonth + zd·zodiacDay)
//                         + western·western + lucky ))
// Runs once per weights version on load, before anything reads the store.
// A pick recorded before the zodiac split (no zodiacYear stored) is left
// untouched rather than half-rescored - a rebuild remains the only way to
// re-score those, but every pick recorded from the split onward is covered.
const UFC_WEIGHTS_VERSION_KEY = 'numerology_ufc_weights_version';
const UFC_WEIGHTS_VERSION = 1; // 1 = year-animal-only (UFC_COMPAT_WEIGHTS, fitted 2026-07-28)

function ufcCompositeFromDims(d, w) {
  if (!d) return null;
  const flat = {
    lifePath: w.numerology * w.lifePath,
    dayNum: w.numerology * w.dayNum,
    doy: w.numerology * w.doy,
    zodiacYear: w.vietnamese * (w.zodiacYear != null ? w.zodiacYear : 0.60),
    zodiacMonth: w.vietnamese * (w.zodiacMonth != null ? w.zodiacMonth : 0.30),
    zodiacDay: w.vietnamese * (w.zodiacDay != null ? w.zodiacDay : 0.10),
    western: w.western,
  };
  let total = 0;
  for (const k of Object.keys(flat)) {
    if (!flat[k]) continue; // zero-weighted piece may be missing on old picks without penalty
    if (d[k] == null) return null; // a NEEDED piece is missing - don't half-score
    total += flat[k] * d[k];
  }
  return Math.min(100, Math.round(total + (d.lucky || 0)));
}

function rescoreUfcPredictionsForWeights() {
  if (Number(localStorage.getItem(UFC_WEIGHTS_VERSION_KEY)) === UFC_WEIGHTS_VERSION) {
    return { alreadyCurrent: true, rescored: 0, skipped: 0, flipped: 0 };
  }
  // Same bail-out as the MLB rescore: an unhydrated store reads as [], and
  // stamping the marker over that would mean the rescore never runs.
  if (!bigStoreKeyHydrated(UFC_PREDICTIONS_KEY)) {
    return { alreadyCurrent: false, unavailable: true, rescored: 0, skipped: 0, flipped: 0 };
  }

  const predictions = loadUfcPredictions();
  let rescored = 0;
  let skipped = 0;
  let flipped = 0;

  predictions.forEach((p) => {
    if (!p.dims || !p.dims.A || !p.dims.B) { skipped += 1; return; }
    const a = ufcCompositeFromDims(p.dims.A, UFC_COMPAT_WEIGHTS);
    const b = ufcCompositeFromDims(p.dims.B, UFC_COMPAT_WEIGHTS);
    if (a == null || b == null) { skipped += 1; return; }

    const wasFavorite = p.numerologyFavorite;
    p.numerologyScoreA = a;
    p.numerologyScoreB = b;
    p.numerologyFavorite = a >= b ? p.fighterAName : p.fighterBName;
    if (p.marketFavorite) {
      p.pickType = normalizeName(p.marketFavorite) === normalizeName(p.numerologyFavorite) ? 'favorite' : 'underdog';
    }
    if (wasFavorite && normalizeName(wasFavorite) !== normalizeName(p.numerologyFavorite)) flipped += 1;
    rescored += 1;
  });

  if (rescored) saveUfcPredictions(predictions);
  localStorage.setItem(UFC_WEIGHTS_VERSION_KEY, String(UFC_WEIGHTS_VERSION));
  return { alreadyCurrent: false, rescored, skipped, flipped };
}

const MLB_WEIGHTS_VERSION_KEY = 'numerology_mlb_weights_version';
// 3 = manager-heavy v3; 4 = pitcher 50 · manager 25 · franchise 25 (lab-fitted 2026-07-28)
const MLB_WEIGHTS_VERSION = 4;

function rescoreMlbPredictionsForWeights() {
  if (Number(localStorage.getItem(MLB_WEIGHTS_VERSION_KEY)) === MLB_WEIGHTS_VERSION) {
    return { alreadyCurrent: true, rescored: 0, skipped: 0, flipped: 0 };
  }
  // An unloaded store reads as [], which would rescore nothing and then stamp
  // the version marker below as though the job were done - so the rescore would
  // never run again even after the store came back. Bail out instead and let
  // the next load do it.
  if (!bigStoreKeyHydrated(MLB_PREDICTIONS_KEY)) {
    return { alreadyCurrent: false, unavailable: true, rescored: 0, skipped: 0, flipped: 0 };
  }

  const predictions = loadMlbPredictions();
  let rescored = 0;
  let skipped = 0;
  let flipped = 0;

  predictions.forEach((p) => {
    if (!p.components || !p.components.A || !p.components.B) { skipped += 1; return; }
    const a = mlbCompositeFromComponents(p.components.A, MLB_ROLE_WEIGHTS_CURRENT);
    const b = mlbCompositeFromComponents(p.components.B, MLB_ROLE_WEIGHTS_CURRENT);
    if (a == null || b == null) { skipped += 1; return; }

    const wasFavorite = p.numerologyFavorite;
    p.numerologyScoreA = a;
    p.numerologyScoreB = b;
    p.numerologyFavorite = a >= b ? p.teamAName : p.teamBName;
    if (p.marketFavorite) {
      p.pickType = normalizeName(p.marketFavorite) === normalizeName(p.numerologyFavorite) ? 'favorite' : 'underdog';
    }
    if (wasFavorite && normalizeName(wasFavorite) !== normalizeName(p.numerologyFavorite)) flipped += 1;
    rescored += 1;
  });

  if (rescored) saveMlbPredictions(predictions);
  localStorage.setItem(MLB_WEIGHTS_VERSION_KEY, String(MLB_WEIGHTS_VERSION));
  return { alreadyCurrent: false, rescored, skipped, flipped };
}

// Re-derives a team's composite from its stored per-component scores under an
// arbitrary weight map - the whole reason components are stored. Skips any
// component the game was missing, normalizing by the weights actually present.
function mlbCompositeFromComponents(comp, weights) {
  if (!comp) return null;
  let sum = 0;
  let wsum = 0;
  MLB_COMPONENT_KEYS.forEach((k) => {
    const w = weights[k] || 0;
    if (comp[k] == null || !w) return;
    sum += comp[k] * w;
    wsum += w;
  });
  return wsum ? Math.round(sum / wsum) : null;
}

// g.enrichState is the live tracker's polling state machine ('loading' /
// 'pending-lineup' / 'pending-location' / 'ready' / 'error' / 'unmatched');
// a historical backfill has no polling to do, so it just sets 'ready'
// directly once everything's been fetched once.
function scoresForGame(g, onTimezoneResolved) {
  if (g.enrichState !== 'ready') return null;
  const scoreA = computeTeamComposite(g, 'A', onTimezoneResolved);
  const scoreB = computeTeamComposite(g, 'B', onTimezoneResolved);
  if (!scoreA || !scoreB) return null;
  return { scoreA, scoreB };
}

/* ===================== Compatibility dimension edge (all sports) ===================== */
// The component analysis asks which ROSTER ROLE (pitcher, catcher, manager…)
// predicts best. This asks one level deeper: which COMPATIBILITY DIMENSION - the
// pieces every person-vs-date score is blended from - actually beats the market.
// A computeFighterScore() result carries three date-anchor compat objects (day /
// stadium / state), and each of those carries the numeric sub-scores it was made
// of. Isolating each dimension and testing it as a standalone pick signal is the
// only honest way to answer "does the stadium/state anchor add anything," "is
// life-path-to-life-path stronger than day-number-to-day-number," etc. Shared by
// all three sports, since they all score people through computeFighterScore.
const DIMENSION_KEYS = ['day', 'stadium', 'state', 'lifePath', 'dayNum', 'doy', 'zodiac', 'zodiacYear', 'zodiacMonth', 'zodiacDay', 'western', 'lucky'];

const DIMENSION_LABELS = {
  day: 'Day anchor (birth ↔ game day)',
  stadium: 'Stadium anchor (birth ↔ venue)',
  state: 'State/region anchor (birth ↔ place)',
  lifePath: 'Life path ↔ life path',
  dayNum: 'Day number ↔ day number',
  doy: 'Day-of-year ↔ day-of-year',
  zodiac: 'Chinese/Vietnamese zodiac',
  // The zodiac dimension is itself a blend (year 60 / month 30 / day 10,
  // compat-engine.js) - these three split it open so the one dimension
  // with signal can show WHERE that signal lives. Only populated on picks
  // recorded after the split landed (or re-recorded by a rebuild).
  zodiacYear: 'Zodiac — year animal',
  zodiacMonth: 'Zodiac — month sign',
  zodiacDay: 'Zodiac — day sign',
  western: 'Western sun sign',
  lucky: 'Lucky number bonus',
  composite: 'Full Score (current blend)',
};

// One person's dimension vector, pulled from a computeFighterScore() result.
// The three anchor finalScores come straight off .day/.stadium/.state. The
// subsystem leaves (lifePath, dayNum, doy, zodiac, western) are read from the
// DAY anchor specifically: it's 60% of the score and the dominant place each
// subsystem lives, so it's the cleanest isolation of "does life-path-vs-game-day
// predict" without diluting the signal through the tiny stadium/state anchors.
// Returns null for anything not shaped like a real computeFighterScore result
// (e.g. the pitcher-vs-lineup matchup, which is a bare {combined}).
function extractDimensionScores(fs) {
  if (!fs || !fs.day || !fs.day.numerology) return null;
  const d = fs.day;
  return {
    day: fs.day.finalScore != null ? fs.day.finalScore : null,
    stadium: fs.stadium ? fs.stadium.finalScore : null,
    state: fs.state ? fs.state.finalScore : null,
    lifePath: d.numerology.lifePathScore,
    dayNum: d.numerology.dayScore,
    doy: d.numerology.doyScore,
    zodiac: d.vietnamese ? d.vietnamese.score : null,
    zodiacYear: d.vietnamese && d.vietnamese.yearScore != null ? d.vietnamese.yearScore : null,
    zodiacMonth: d.vietnamese && d.vietnamese.monthScore != null ? d.vietnamese.monthScore : null,
    zodiacDay: d.vietnamese && d.vietnamese.daySignScore != null ? d.vietnamese.daySignScore : null,
    western: d.western ? d.western.score : null,
    // The lucky-number bonus is the one input that is ADDED to a score rather
    // than weighted into it (compat-engine.js), so no reweighting can measure
    // it - it has to be tested on its own. Scale differs from the rest (0/5/10/
    // 15/20, usually 0), which is fine: every dimension is judged by comparing
    // side A to side B, and a game where neither side caught a bonus ties at
    // 0 and is dropped as "no lean" like any other tie.
    lucky: d.bonuses ? d.bonuses.total : null,
  };
}

// Role-weight-average each dimension across a computeTeamComposite() parts array
// - the dimension-level analogue of extractComponents(), for MLB's roster. Parts
// whose score has no anchor breakdown (pitcher-vs-lineup matchup, zodiac-only
// franchise fallback) contribute nothing here; they're measured elsewhere.
function extractTeamDimensions(parts) {
  const acc = {};
  DIMENSION_KEYS.forEach((k) => { acc[k] = { sum: 0, w: 0 }; });
  (parts || []).forEach((p) => {
    const dv = extractDimensionScores(p.score);
    if (!dv) return;
    DIMENSION_KEYS.forEach((k) => {
      if (dv[k] == null) return;
      acc[k].sum += dv[k] * p.weight;
      acc[k].w += p.weight;
    });
  });
  const out = {};
  DIMENSION_KEYS.forEach((k) => {
    if (!acc[k].w) { out[k] = null; return; }
    const avg = acc[k].sum / acc[k].w;
    // Everything else is a 0-100 score, where rounding to an integer costs
    // nothing. The lucky bonus is not: it's 0-20 before being weight-averaged
    // down, so a batter's +10 at weight 0.005 lands around 0.05 and would round
    // to 0 - erasing the lean and making the row look like a permanent tie.
    // These values are only ever compared A-vs-B, never displayed, so keeping
    // the full precision here costs nothing either.
    out[k] = k === 'lucky' ? avg : Math.round(avg);
  });
  return out;
}

// Beat-the-market read for each compatibility dimension, mirroring the MLB
// component-signal analysis but over DIMENSION_KEYS. Sport-agnostic: each
// prediction must carry dims:{A,B} (per-side dimension vectors), marketPriceA/B,
// a non-draw result, and numerologyScoreA/B. sideNames(p) returns [nameA, nameB]
// (fighterAName/… for UFC & tennis, teamAName/… for MLB). A positive edge means
// that dimension, used alone to pick the higher-scored side, beat the market.
function computeDimensionEdgeStats(predictions, sideNames) {
  const resolved = (predictions || []).filter((p) => p.result && !p.result.draw && p.dims && p.dims.A && p.dims.B);
  const priceOf = (p, name) => (normalizeName(sideNames(p)[0]) === normalizeName(name) ? p.marketPriceA : p.marketPriceB);
  const statOver = (key, label, scoreAOf, scoreBOf) => {
    const picks = resolved.map((p) => {
      const a = scoreAOf(p);
      const b = scoreBOf(p);
      if (a == null || b == null || a === b) return null; // no lean on this axis
      const [nameA, nameB] = sideNames(p);
      const favName = a > b ? nameA : nameB;
      const implied = priceOf(p, favName);
      if (implied == null) return null;
      // resultWinnerIs, not an exact compare - surname-labeled winners
      // ("Spann") must credit a full-name side, same as isCorrectPick.
      return { won: resultWinnerIs(p.result.winner, favName, nameA, nameB), implied };
    }).filter(Boolean);
    const n = picks.length;
    const wins = picks.filter((x) => x.won).length;
    const winPct = n ? Math.round((wins / n) * 100) : null;
    const marketPct = n ? Math.round((picks.reduce((s, x) => s + x.implied, 0) / n) * 100) : null;
    return { key, label, count: n, winPct, marketPct, edge: (winPct != null && marketPct != null) ? winPct - marketPct : null };
  };
  const rows = DIMENSION_KEYS.map((k) => statOver(k, DIMENSION_LABELS[k], (p) => p.dims.A[k], (p) => p.dims.B[k]));
  rows.push(statOver('composite', DIMENSION_LABELS.composite, (p) => p.numerologyScoreA, (p) => p.numerologyScoreB));
  rows.sort((a, b) => (b.edge == null ? -Infinity : b.edge) - (a.edge == null ? -Infinity : a.edge));
  return rows;
}

// Renders the dimension-edge table into an element. Shared by all three Stats
// sections - each just passes its own predictions + name accessor.
function renderDimensionEdgeTable(elId, predictions, sideNames, emptyMsg) {
  const el = document.getElementById(elId);
  if (!el) return;
  const rows = computeDimensionEdgeStats(predictions, sideNames);
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (!maxCount) {
    el.innerHTML = `<div class="empty-state">${escapeHtml(emptyMsg || 'No resolved games with dimension data yet — this fills in as tracked games finish.')}</div>`;
    return;
  }
  // Each dimension can carry a smaller subsample than the full resolved set
  // (missing data for that one piece) - the composite row is always the full
  // set, so that's the honest "total," not the max of a possibly-thinner row.
  const total = (rows.find((r) => r.key === 'composite') || {}).count || maxCount;
  const body = rows.map((r) => {
    const isBase = r.key === 'composite';
    const edgeCell = (r.edge != null && r.count >= MIN_BUCKET_SAMPLE)
      ? `<span class="score-inline ${r.edge > 0 ? 'good' : (r.edge < 0 ? 'bad' : '')}">${r.edge > 0 ? '+' : ''}${r.edge}</span>`
      : `<span class="empty-state">${r.count ? 'thin' : '—'}</span>`;
    return `<tr${isBase ? ' style="border-top:2px solid var(--border);"' : ''}><td>${isBase ? '🎯 ' : ''}${escapeHtml(r.label)}</td><td>${r.count}</td><td>${r.winPct != null ? `${r.winPct}%` : '—'}</td><td>${r.marketPct != null ? `${r.marketPct}%` : '—'}</td><td>${edgeCell}</td></tr>`;
  }).join('');
  el.innerHTML = `<div class="pm-table-total">Total picks: ${total}</div><table class="astro-table"><thead><tr><th>Dimension</th><th>Games</th><th>Win%</th><th>Market%</th><th>Edge</th></tr></thead><tbody>${body}</tbody></table>`;
}

/* ===================== Weights Lab (shared) ===================== */
// Replays every resolved pick under candidate weight blends, using the
// per-side dimension vectors stored on each pick (dims.A/dims.B) - the same
// inputs the dimension-edge table above reads, so the two can never
// disagree about the underlying data. Sport-agnostic the same way
// renderDimensionEdgeTable is: each Stats section passes its own
// predictions + side-name accessor. A blend's score is Σ w_k · dims[k]
// plus the lucky bonus (ADDED, not weighted - exactly how the live engine
// treats it, compat-engine.js). A pick is skipped for a blend when any
// weighted dimension is missing on either side (records from before the
// zodiac year/month/day split), or when the blend ties the two sides - no
// lean, no pick, the dimension table's own rule. Wins settle through
// resultWinnerIs, the same answer the headline stats use.
//
// Everything here is IN-SAMPLE: the top row is best-in-hindsight on the
// exact games it was scored over - a shortlist for the forward test, not
// proof. The MLB reweight measured +46% in-fit vs -6% out-of-fit on this
// same kind of exercise; UFC's year-animal blend came out of exactly this
// lab and is on its own forward test now.

const WEIGHTS_LAB_NAMED_BLENDS = [
  { label: 'Default blend (life path 36 · zodiac 30 · day num 21 · sun 10 · doy 3)', w: { lifePath: 0.36, zodiac: 0.30, dayNum: 0.21, western: 0.10, doy: 0.03 } },
  { label: 'Zodiac only', w: { zodiac: 1 } },
  { label: 'Zodiac 70 · day number 20 · sun sign 10', w: { zodiac: 0.70, dayNum: 0.20, western: 0.10 } },
  { label: 'MLB recipe (day num 34 · zodiac 25 · life path 22 · doy 19)', w: { dayNum: 0.3375, zodiac: 0.25, lifePath: 0.225, doy: 0.1875 } },
  // The zodiac dimension is itself year 60 / month 30 / day 10 - these
  // split the one dimension open so the lab can say WHERE any signal
  // lives. Need picks recorded after the split (rebuild fills history).
  { label: 'Zodiac year animal only (UFC shipping blend)', w: { zodiacYear: 1 } },
  { label: 'Zodiac month sign only', w: { zodiacMonth: 1 } },
  { label: 'Zodiac day sign only', w: { zodiacDay: 1 } },
  { label: 'Zodiac month 60 · day sign 40 (no year)', w: { zodiacMonth: 0.60, zodiacDay: 0.40 } },
];

// Every way to split 100% across the five flat dimensions in 25% steps -
// 70 blends, cheap to replay, broad enough to catch a shape no one named.
const WEIGHTS_LAB_GRID_DIMS = ['zodiac', 'dayNum', 'lifePath', 'western', 'doy'];
const WEIGHTS_LAB_GRID_STEPS = 4;

function weightsLabGridBlends() {
  const out = [];
  const walk = (idx, left, acc) => {
    if (idx === WEIGHTS_LAB_GRID_DIMS.length - 1) {
      const w = { ...acc };
      if (left) w[WEIGHTS_LAB_GRID_DIMS[idx]] = left / WEIGHTS_LAB_GRID_STEPS;
      if (Object.keys(w).length) out.push(w);
      return;
    }
    for (let units = 0; units <= left; units++) {
      const w = { ...acc };
      if (units) w[WEIGHTS_LAB_GRID_DIMS[idx]] = units / WEIGHTS_LAB_GRID_STEPS;
      walk(idx + 1, left - units, w);
    }
  };
  walk(0, WEIGHTS_LAB_GRID_STEPS, {});
  return out;
}

function weightsLabBlendLabel(w) {
  const names = { zodiac: 'zodiac', dayNum: 'day num', lifePath: 'life path', western: 'sun', doy: 'doy', zodiacYear: 'zodiac yr', zodiacMonth: 'zodiac mo', zodiacDay: 'zodiac day' };
  return Object.keys(w).map((k) => `${names[k] || k} ${Math.round(w[k] * 100)}`).join(' · ');
}

// Per-side scorer for a blend - null when any weighted dimension is missing
// on that side, which skips the pick rather than scoring half a blend.
function weightsLabBlendScorer(w, side) {
  return (p) => {
    let total = 0;
    for (const k of Object.keys(w)) {
      const v = p.dims[side][k];
      if (v == null) return null;
      total += w[k] * v;
    }
    return total + (p.dims[side].lucky || 0);
  };
}

function weightsLabEvaluate(resolved, scoreAOf, scoreBOf, sideNames) {
  let n = 0;
  let wins = 0;
  let impliedSum = 0;
  resolved.forEach((p) => {
    const a = scoreAOf(p);
    const b = scoreBOf(p);
    if (a == null || b == null || a === b) return;
    const [nameA, nameB] = sideNames(p);
    const favA = a > b;
    const favName = favA ? nameA : nameB;
    const implied = favA ? p.marketPriceA : p.marketPriceB;
    if (implied == null) return;
    n++;
    impliedSum += implied;
    if (resultWinnerIs(p.result.winner, favName, nameA, nameB)) wins++;
  });
  if (!n) return { count: 0, winPct: null, marketPct: null, edge: null };
  const winPct = Math.round((wins / n) * 100);
  const marketPct = Math.round((impliedSum / n) * 100);
  return { count: n, winPct, marketPct, edge: winPct - marketPct };
}

function weightsLabRowHtml(label, r, star) {
  const edgeCell = (r.edge != null && r.count >= MIN_BUCKET_SAMPLE)
    ? `<span class="score-inline ${r.edge > 0 ? 'good' : (r.edge < 0 ? 'bad' : '')}">${r.edge > 0 ? '+' : ''}${r.edge}</span>`
    : `<span class="empty-state">${r.count ? 'thin' : 'needs rebuild'}</span>`;
  return `<tr${star ? ' style="border-top:2px solid var(--border);"' : ''}><td>${star ? '🎯 ' : ''}${escapeHtml(label)}</td><td>${r.count}</td><td>${r.winPct != null ? `${r.winPct}%` : '—'}</td><td>${r.marketPct != null ? `${r.marketPct}%` : '—'}</td><td>${edgeCell}</td></tr>`;
}

function runWeightsLab(resultsElId, predictions, sideNames) {
  const el = document.getElementById(resultsElId);
  const resolved = (predictions || []).filter((p) => p.result && !p.result.draw && p.dims && p.dims.A && p.dims.B);
  if (!resolved.length) {
    el.innerHTML = '<div class="empty-state">No resolved picks with dimension data yet &mdash; backfill first.</div>';
    return;
  }

  // The honest baseline: the composite exactly as recorded (rounding, cap
  // and all), same accessor the dimension table's Full Score row uses.
  const composite = weightsLabEvaluate(resolved, (p) => p.numerologyScoreA, (p) => p.numerologyScoreB, sideNames);

  const named = WEIGHTS_LAB_NAMED_BLENDS
    .map((c) => ({ label: c.label, r: weightsLabEvaluate(resolved, weightsLabBlendScorer(c.w, 'A'), weightsLabBlendScorer(c.w, 'B'), sideNames) }))
    .sort((x, y) => (y.r.edge == null ? -Infinity : y.r.edge) - (x.r.edge == null ? -Infinity : x.r.edge));

  const namedSigs = new Set(WEIGHTS_LAB_NAMED_BLENDS.map((c) => weightsLabBlendLabel(c.w)));
  const grid = weightsLabGridBlends()
    .filter((w) => !namedSigs.has(weightsLabBlendLabel(w)))
    .map((w) => ({ label: weightsLabBlendLabel(w), r: weightsLabEvaluate(resolved, weightsLabBlendScorer(w, 'A'), weightsLabBlendScorer(w, 'B'), sideNames) }))
    .filter((x) => x.r.count > 0)
    .sort((x, y) => y.r.edge - x.r.edge)
    .slice(0, 8);

  el.innerHTML = `
    <div class="pm-table-total">Resolved picks replayed: ${resolved.length}</div>
    <table class="astro-table">
      <thead><tr><th>Blend</th><th>Picks</th><th>Win%</th><th>Market%</th><th>Edge</th></tr></thead>
      <tbody>
        ${weightsLabRowHtml('Current blend as recorded', composite, true)}
        ${named.map((x) => weightsLabRowHtml(x.label, x.r)).join('')}
        <tr><td colspan="5" class="empty-state" style="text-align:center;">&mdash; top finds from a 25%-step sweep of zodiac / day num / life path / sun / doy &mdash;</td></tr>
        ${grid.map((x) => weightsLabRowHtml(x.label, x.r)).join('')}
      </tbody>
    </table>`;
}

function initWeightsLab(btnId, resultsElId, loadPredictions, sideNames) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => runWeightsLab(resultsElId, loadPredictions(), sideNames));
}

/* ===================== Day filter (Stats page) ===================== */
// Lets each Stats section slice its own tracked picks by which kind of day
// the match/game fell on - independent of the per-fighter/team edge tested
// elsewhere. Three different readings of one date:
//  - exact: the literal calendar date
//  - universal: the date's own life path (full date reduced - the same
//    reduction a birthdate gets, see compatLifePathInfo/universalDayInsight
//    above)
//  - energy: just the day-of-month digits reduced (getReducedDay) - a
//    narrower, faster-cycling read than Universal Day
// "both" requires Universal Day AND Day Energy to match at once. State is
// keyed by an arbitrary string prefix so UFC/Tennis/MLB (and MLB's separate
// Today/Old scopes) can each keep their own filter independently while
// sharing one implementation.
// A date's Universal Day for day-number contexts (filters, win-rate tables,
// combos). The 20-exception impure-11 case carries lookupValue 2 for the
// compat TABLE lookups, but as a day NUMBER a standalone 2 doesn't exist -
// it IS an 11. The only real 2 in the day system is the literal 2nd of the
// month, which lives in Day Energy (reduceNumber already maps a raw 20 to
// 11, so energy 2 can only come from the 2nd). Everything that groups or
// filters by Universal Day goes through this so an 11/2 day counts as 11
// everywhere, consistently.
function universalDayNumber(date) {
  const v = compatLifePathInfo(date).lookupValue;
  return v === 2 ? 11 : v;
}

// No 2: see universalDayNumber above - a universal 2 is an 11.
const DAY_FILTER_UNIVERSAL_OPTIONS = [1, 3, 4, 5, 6, 7, 8, 9, 11, 13, 22, 28, 33];
const DAY_FILTER_ENERGY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 28];
const _dayFilterState = new Map();

function dayFilterNumberOptionsHtml(options) {
  return options.map((n) => `<option value="${n}">${n}</option>`).join('');
}

// Injected next to a section's own results (via insertAdjacentHTML) rather
// than baked into stats.html - one implementation instead of four near-
// identical copies of the same markup.
function dayFilterHtml(prefix) {
  return `
    <div class="box stats-sport-box pm-day-filter-box">
      <div class="box-label">📅 Filter by Day</div>
      <select id="${prefix}DayFilterMode">
        <option value="all">All picks</option>
        <option value="exact">Specific date</option>
        <option value="universal">Universal Day</option>
        <option value="energy">Day Energy (reduced)</option>
        <option value="both">Universal Day + Day Energy</option>
      </select>
      <div class="pm-day-filter-fields">
        <input type="text" id="${prefix}DayFilterExact" class="pm-day-filter-exact" style="display:none;" placeholder="MM/DD/YYYY">
        <select id="${prefix}DayFilterUniversal" style="display:none;">
          <option value="">Universal Day: Any</option>
          ${dayFilterNumberOptionsHtml(DAY_FILTER_UNIVERSAL_OPTIONS)}
        </select>
        <select id="${prefix}DayFilterEnergy" style="display:none;">
          <option value="">Day Energy: Any</option>
          ${dayFilterNumberOptionsHtml(DAY_FILTER_ENERGY_OPTIONS)}
        </select>
      </div>
      <div class="pm-day-filter-status" id="${prefix}DayFilterStatus"></div>
    </div>
  `;
}

// A filtered hero/table can look like a bug ("where did all my picks go?")
// if there's nothing on screen saying a filter is even active - this makes
// the current filter state impossible to miss, right where it's set.
function dayFilterStatusText(state) {
  if (!state || state.mode === 'all') return 'Showing all picks (filter off)';
  if (state.mode === 'exact') return state.exact ? `Showing only ${isoToDisplay(state.exact)}` : 'Pick a date above to filter';
  if (state.mode === 'universal') return state.universal != null ? `Showing only Universal Day ${state.universal}` : 'Pick a Universal Day above to filter';
  if (state.mode === 'energy') return state.energy != null ? `Showing only Day Energy ${state.energy}` : 'Pick a Day Energy above to filter';
  if (state.mode === 'both') {
    const parts = [];
    if (state.universal != null) parts.push(`Universal Day ${state.universal}`);
    if (state.energy != null) parts.push(`Day Energy ${state.energy}`);
    return parts.length ? `Showing only ${parts.join(' + ')}` : 'Pick values above to filter';
  }
  return '';
}

// dateValue can be an ISO timestamp string or a Date - read in the browser's
// own local time, same convention every other Insight-tab date read here
// already uses (see universalDayInsight above).
function matchDayFilter(dateValue, state) {
  if (!state || state.mode === 'all' || !dateValue) return true;
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(d)) return true;

  if (state.mode === 'exact') {
    if (!state.exact) return true;
    return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()) === state.exact;
  }

  const universal = universalDayNumber(d);
  const energy = getReducedDay(d);
  const universalOk = state.universal == null || universal === state.universal;
  const energyOk = state.energy == null || energy === state.energy;

  if (state.mode === 'universal') return universalOk;
  if (state.mode === 'energy') return energyOk;
  if (state.mode === 'both') return universalOk && energyOk;
  return true;
}

function dayFilterState(prefix) {
  return _dayFilterState.get(prefix) || { mode: 'all' };
}

function dayFilterPredicate(prefix) {
  const state = dayFilterState(prefix);
  return (dateValue) => matchDayFilter(dateValue, state);
}

// Wires one filter box's controls. onChange fires (no args) on every change
// so the caller just re-runs its own render pass over already-loaded
// predictions - this never triggers a network refetch.
function initDayFilter(prefix, onChange) {
  const modeSel = document.getElementById(`${prefix}DayFilterMode`);
  if (!modeSel) return;
  const exactInput = document.getElementById(`${prefix}DayFilterExact`);
  const universalSel = document.getElementById(`${prefix}DayFilterUniversal`);
  const energySel = document.getElementById(`${prefix}DayFilterEnergy`);

  attachDateMask(exactInput);
  _dayFilterState.set(prefix, { mode: 'all', exact: '', universal: null, energy: null });

  function sync() {
    const mode = modeSel.value;
    exactInput.style.display = mode === 'exact' ? '' : 'none';
    universalSel.style.display = (mode === 'universal' || mode === 'both') ? '' : 'none';
    energySel.style.display = (mode === 'energy' || mode === 'both') ? '' : 'none';
    const state = {
      mode,
      exact: displayToISO(exactInput.value),
      universal: universalSel.value ? Number(universalSel.value) : null,
      energy: energySel.value ? Number(energySel.value) : null,
    };
    _dayFilterState.set(prefix, state);
    const statusEl = document.getElementById(`${prefix}DayFilterStatus`);
    if (statusEl) {
      statusEl.textContent = dayFilterStatusText(state);
      statusEl.classList.toggle('active', state.mode !== 'all');
    }
  }

  modeSel.addEventListener('change', () => { sync(); onChange(); });
  exactInput.addEventListener('input', () => { sync(); onChange(); });
  universalSel.addEventListener('change', () => { sync(); onChange(); });
  energySel.addEventListener('change', () => { sync(); onChange(); });
  sync();
}

/* ===================== UFC pick-price buckets (risk manager) ===================== */
// Shared by the Stats page (which displays the win rate per bucket) and the
// Polymarket tracker (which looks up the bucket for a live fight's price to
// judge it) - keeping this in one place means the two can never disagree
// about what a bucket contains or what counts as a win.

// A 45% underdog and a 10% longshot are very different bets even though
// both count as "underdog" - bucketing by the actual price numerology's
// pick was at gives a much more apples-to-apples track record to check a
// new fight against than one blanket favorite/underdog split.
const PRICE_BUCKETS = [
  { label: '80-100%', min: 0.80, max: 1.01 },
  { label: '65-80%', min: 0.65, max: 0.80 },
  { label: '50-65%', min: 0.50, max: 0.65 },
  { label: '35-50%', min: 0.35, max: 0.50 },
  { label: '20-35%', min: 0.20, max: 0.35 },
  { label: '0-20%', min: 0, max: 0.20 },
];

// Below this many resolved picks in a bucket, its win rate isn't shown as
// a confident number - a 2-for-4 record isn't a track record yet.
const MIN_BUCKET_SAMPLE = 5;

function bucketForPrice(price) {
  return PRICE_BUCKETS.find((b) => price >= b.min && price < b.max) || PRICE_BUCKETS[PRICE_BUCKETS.length - 1];
}

// The price of whichever side numerology favored on a stored prediction -
// what following the pick would actually have bought - derived from the two
// stored prices by matching numerologyFavorite's name, rather than stored
// as its own field. Works for both UFC (fighterAName) and Tennis
// (playerAName) prediction records, whichever the object carries.
function numerologyPickPrice(p) {
  const nameA = p.fighterAName || p.playerAName || p.teamAName;
  const favA = normalizeName(p.numerologyFavorite) === normalizeName(nameA);
  const price = favA ? p.marketPriceA : p.marketPriceB;
  return Number.isFinite(price) ? price : null;
}

// result.winner is whatever label the market's outcomes[] carried - on many
// (mostly older) UFC/tennis markets that's a bare surname ("Spann",
// "Siegemund"), while the stored pick's names are the full names parsed
// from the event title. The old exact-only compare silently counted every
// such WIN as a LOSS. The surname rule below is deliberately narrow: it
// only runs when the exact compare fails, only matches a name that ENDS in
// the winner's tokens, and refuses to decide when the label fits both
// sides (same-surname opponents) - never guessed.
function winnerMatchesName(winner, name) {
  const w = normalizeName(winner);
  const n = normalizeName(name);
  if (!w || !n) return false;
  return w === n || n.endsWith(' ' + w) || w.endsWith(' ' + n);
}

// The one shared answer to "did this side win?" - used by isCorrectPick,
// the dimension-edge table, and the Weights Lab, so no analysis can quietly
// disagree with the headline stats about what a win was.
function resultWinnerIs(winner, name, nameA, nameB) {
  if (winner == null) return false;
  if (normalizeName(winner) === normalizeName(name)) return true;
  if (!winnerMatchesName(winner, name)) return false;
  // Ambiguity guard: the winner label must identify exactly one side.
  return !(winnerMatchesName(winner, nameA) && winnerMatchesName(winner, nameB));
}

function isCorrectPick(p) {
  if (!p.result || p.result.draw) return false;
  const nameA = p.fighterAName || p.playerAName || p.teamAName;
  const nameB = p.fighterBName || p.playerBName || p.teamBName;
  return resultWinnerIs(p.result.winner, p.numerologyFavorite, nameA, nameB);
}

/* ===================== Edge strength tiers ===================== */
// A 76-vs-41 and a 70-vs-71 both produce "numerology favors X," but only
// one of them is a signal - the other is a coin flip dressed up as a pick,
// and counting coin flips in the track record dilutes whatever real signal
// exists. The gap between the two combined scores is tiered here; a gap
// below REAL_EDGE_MIN_GAP is a tossup that gets recorded (so its ~50/50-ness
// can be verified empirically) but excluded from headline win rates and the
// risk manager's EV history. Both scores are already stored on every
// prediction, so all of this applies retroactively to existing data.
//
// Thresholds are a starting guess, not doctrine - once the per-tier table
// on the Stats page fills in, the data itself will show where real signal
// starts, and these cutoffs can move to match.

const REAL_EDGE_MIN_GAP = 5;

const EDGE_TIERS = [
  { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 30, max: Infinity },
  { key: 'clear', label: 'Clear Edge', icon: '💪', min: 15, max: 30 },
  { key: 'slight', label: 'Slight Edge', icon: '📈', min: REAL_EDGE_MIN_GAP, max: 15 },
  { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: REAL_EDGE_MIN_GAP },
];

// MLB needs its own, much tighter bands. A team composite is a weighted
// average of ~13 people's scores, and averaging pulls everything hard toward
// the middle: in real backfilled data every team score landed in 59-73 (std
// dev under 3), so the gap between two teams is almost always 0-6, rarely as
// high as ~11 - it can NEVER reach the 15/30 the one-on-one UFC/Tennis tiers
// need, so those tiers would sit permanently empty. These bands are scaled to
// the distribution that actually occurs (calibrated to that ~2.8 std-dev
// spread) so Clear and Strong are reachable while Strong still stays genuinely
// rare. Same "starting guess, move it once more games resolve" caveat as the
// UFC/Tennis bands above.
const MLB_REAL_EDGE_MIN_GAP = 3;

const MLB_EDGE_TIERS = [
  { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 8, max: Infinity },
  { key: 'clear', label: 'Clear Edge', icon: '💪', min: 5, max: 8 },
  { key: 'slight', label: 'Slight Edge', icon: '📈', min: MLB_REAL_EDGE_MIN_GAP, max: 5 },
  { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: MLB_REAL_EDGE_MIN_GAP },
];

function edgeGap(p) {
  const a = Number(p.numerologyScoreA);
  const b = Number(p.numerologyScoreB);
  return (Number.isFinite(a) && Number.isFinite(b)) ? Math.abs(a - b) : 0;
}

// tiers/minGap default to the UFC/Tennis one-on-one set; MLB passes its own
// (via the edgeTierForGapMlb/hasRealEdgeMlb wrappers below) so the three
// sports share one implementation but not one calibration.
function edgeTierForGap(gap, tiers = EDGE_TIERS) {
  return tiers.find((t) => gap >= t.min && gap < t.max) || tiers[tiers.length - 1];
}

function hasRealEdge(p, minGap = REAL_EDGE_MIN_GAP) {
  return edgeGap(p) >= minGap;
}

// Per-tier win rates - the direct empirical test of the core hypothesis: if
// numerology works, win rate should climb as the gap widens, and the
// tossup tier should sit near 50%.
function computeEdgeTierStats(predictions, tiers = EDGE_TIERS) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw);

  return tiers.map((tier) => {
    const inTier = resolved.filter((p) => {
      const gap = edgeGap(p);
      return gap >= tier.min && gap < tier.max;
    });
    const wins = inTier.filter(isCorrectPick);
    return {
      key: tier.key,
      label: tier.label,
      icon: tier.icon,
      count: inTier.length,
      wins: wins.length,
      winPct: inTier.length ? Math.round((wins.length / inTier.length) * 100) : null,
    };
  });
}

// MLB-tuned wrappers - kept as their own named functions (rather than callers
// passing MLB_EDGE_TIERS inline) both for readability and so hasRealEdgeMlb is
// safe to hand straight to Array.filter, whose index argument would otherwise
// land in hasRealEdge's minGap parameter.
function edgeTierForGapMlb(gap) {
  return edgeTierForGap(gap, MLB_EDGE_TIERS);
}

function hasRealEdgeMlb(p) {
  return edgeGap(p) >= MLB_REAL_EDGE_MIN_GAP;
}

function computeEdgeTierStatsMlb(predictions) {
  return computeEdgeTierStats(predictions, MLB_EDGE_TIERS);
}

// Strength tiers for the pitcher strikeout signal. The signal already calls a
// direction (over/under/neutral) off the pitcher's day score, but "predicted
// over" alone says nothing about conviction - a 61 and a 95 were both just
// "over." These bands subdivide each direction into slight/strong by how
// extreme the day score is, the same way the edge tiers subdivide a game pick
// by gap. The direction each band resolves to is identical to the existing
// predictedDirection cutoffs (>=60 over, <=40 under, else neutral), so this is
// purely an added conviction layer - it never changes whether a start counts
// as a hit. Calibrated to the real day-score spread (centered ~63, std dev
// ~12): "over" fires far more often than "under" because the compat engine's
// day scores naturally sit above 50, so the under tiers fill slowly - that's
// the data, not a bug.
const MLB_K_SIGNAL_TIERS = [
  { key: 'strongOver', label: 'Strong Over', icon: '🔥', direction: 'over', min: 75, max: Infinity },
  { key: 'slightOver', label: 'Slight Over', icon: '📈', direction: 'over', min: 60, max: 75 },
  { key: 'neutral', label: 'Neutral', icon: '➖', direction: 'neutral', min: 41, max: 60 },
  { key: 'slightUnder', label: 'Slight Under', icon: '📉', direction: 'under', min: 33, max: 41 },
  { key: 'strongUnder', label: 'Strong Under', icon: '🧊', direction: 'under', min: -Infinity, max: 33 },
];

function mlbKSignalTier(dayScore) {
  return MLB_K_SIGNAL_TIERS.find((t) => dayScore >= t.min && dayScore < t.max) || MLB_K_SIGNAL_TIERS[MLB_K_SIGNAL_TIERS.length - 1];
}

// Buckets every resolved (non-draw) REAL-EDGE prediction by the numerology
// pick's market price at the time, so "how has a pick like THIS actually
// done" can be checked against a specific odds range. Tossups are excluded
// on purpose - they were never picks, and letting their coin-flip outcomes
// into these numbers would contaminate the risk manager's EV math.
// minGap defaults to the UFC/Tennis threshold; MLB passes MLB_REAL_EDGE_MIN_GAP
// so its price buckets count the same set of "real edge" picks its own edge
// tiers and headline win rate do, instead of a stricter one-on-one cutoff that
// would drop most MLB picks out of the risk manager entirely.
function computeBucketStats(predictions, minGap = REAL_EDGE_MIN_GAP) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw && numerologyPickPrice(p) != null && hasRealEdge(p, minGap));

  return PRICE_BUCKETS.map((bucket) => {
    const inBucket = resolved.filter((p) => {
      const price = numerologyPickPrice(p);
      return price >= bucket.min && price < bucket.max;
    });
    const wins = inBucket.filter(isCorrectPick);
    return {
      label: bucket.label,
      min: bucket.min,
      max: bucket.max,
      count: inBucket.length,
      wins: wins.length,
      winPct: inBucket.length ? Math.round((wins.length / inBucket.length) * 100) : null,
    };
  });
}

// A summary row prepended to a breakdown table's tbody - for the tables
// whose <table><thead> is static markup in stats.html (Edge Tiers, Price
// Buckets), so there's no separate element outside the tbody to put a total
// in. The tables that build their own markup from scratch (day-number,
// dimension, component) instead get a plain <div class="pm-table-total">
// above the <table>; same wording, just fitted to how each table is built.
function pmTableTotalRow(total, colspan) {
  return `<tr class="pm-table-total-row"><td colspan="${colspan}">Total picks: ${total}</td></tr>`;
}

// Separate from scoreClass (compat-render.js), which colors a 0-100
// compatibility score - a win/hit rate percentage is a different scale
// entirely and needs its own threshold. 65%+ reads as a real edge worth
// green; below 49% reads as actively losing. Shared by every win-rate/
// hit-rate percentage on the Stats page (hero, edge tiers, price buckets,
// day-number breakdown, K-signal).
function winRateClass(pct) {
  if (pct == null) return '';
  if (pct >= 65) return 'good';
  if (pct < 49) return 'bad';
  return 'mid';
}

/* ===================== Win rate by day number (Stats page) ===================== */
// Answers "does the day matter" directly: buckets every resolved real-edge
// pick by the match date's own Universal Day or Day Energy (the same two
// reductions the day filter above slices by) and shows every value's win
// rate side by side, instead of flipping the filter through one value at a
// time. Always computed off every tracked pick regardless of the day
// filter's current setting - that's the point, it's the side-by-side
// comparison the filter itself can't show on its own.
function computeDayNumberStats(predictions, dateField, reduceFn, options, minGap = REAL_EDGE_MIN_GAP) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw && p[dateField] && hasRealEdge(p, minGap));
  return options.map((value) => {
    const inGroup = resolved.filter((p) => {
      const d = new Date(p[dateField]);
      return !isNaN(d) && reduceFn(d) === value;
    });
    const wins = inGroup.filter(isCorrectPick);
    return {
      value,
      count: inGroup.length,
      wins: wins.length,
      winPct: inGroup.length ? Math.round((wins.length / inGroup.length) * 100) : null,
    };
  }).sort((a, b) => (b.winPct == null ? -Infinity : b.winPct) - (a.winPct == null ? -Infinity : a.winPct));
}

function renderDayNumberTable(elId, predictions, dateField, reduceFn, options, headerLabel, minGap) {
  const el = document.getElementById(elId);
  if (!el) return;
  const rows = computeDayNumberStats(predictions, dateField, reduceFn, options, minGap);
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (!maxCount) {
    el.innerHTML = '<div class="empty-state">No resolved real-edge picks yet — this fills in as tracked picks resolve.</div>';
    return;
  }
  const total = rows.reduce((s, r) => s + r.count, 0);
  const body = rows.map((r) => `
    <tr>
      <td>${r.value}</td>
      <td>${r.count}</td>
      <td>${r.winPct != null && r.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(r.winPct)}">${r.winPct}%</span>`
        : `<span class="empty-state">${r.count ? `${r.wins}/${r.count} so far` : 'No data yet'}</span>`}</td>
    </tr>
  `).join('');
  el.innerHTML = `<div class="pm-table-total">Total picks: ${total}</div><table class="astro-table"><thead><tr><th>${escapeHtml(headerLabel)}</th><th>Picks</th><th>Win Rate</th></tr></thead><tbody>${body}</tbody></table>`;
}

// Crosses Universal Day and Day Energy instead of testing each alone -
// answers "which SPECIFIC combo wins most," the actual "best energy combo
// to bet on" question the single-dimension tables above can't answer on
// their own. Pure date math, no roster/birthdate matching needed, so it
// applies to every sport the same way (MLB included). Only combos that
// actually occurred are listed - most of the 14x12 grid never comes up, and
// showing every empty cell would bury the ones that matter.
function computeDayComboStats(predictions, dateField, minGap = REAL_EDGE_MIN_GAP) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw && p[dateField] && hasRealEdge(p, minGap));
  const byKey = new Map();
  resolved.forEach((p) => {
    const d = new Date(p[dateField]);
    if (isNaN(d)) return;
    const universalDay = universalDayNumber(d);
    const dayEnergy = getReducedDay(d);
    const key = `${universalDay}|${dayEnergy}`;
    if (!byKey.has(key)) byKey.set(key, { universalDay, dayEnergy, count: 0, wins: 0 });
    const entry = byKey.get(key);
    entry.count += 1;
    if (isCorrectPick(p)) entry.wins += 1;
  });
  return [...byKey.values()]
    .map((e) => ({ ...e, winPct: e.count ? Math.round((e.wins / e.count) * 100) : null }))
    .sort((a, b) => (b.winPct == null ? -Infinity : b.winPct) - (a.winPct == null ? -Infinity : a.winPct) || b.count - a.count);
}

function renderDayComboTable(elId, predictions, dateField, minGap) {
  const el = document.getElementById(elId);
  if (!el) return;
  const rows = computeDayComboStats(predictions, dateField, minGap);
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">No resolved real-edge picks yet — this fills in as tracked picks resolve.</div>';
    return;
  }
  const total = rows.reduce((s, r) => s + r.count, 0);
  const body = rows.map((r) => `
    <tr>
      <td>${r.universalDay}</td>
      <td>${r.dayEnergy}</td>
      <td>${r.count}</td>
      <td>${r.winPct != null && r.count >= MIN_BUCKET_SAMPLE
        ? `<span class="score-inline ${winRateClass(r.winPct)}">${r.winPct}%</span>`
        : `<span class="empty-state">${r.wins}/${r.count} so far</span>`}</td>
    </tr>
  `).join('');
  el.innerHTML = `<div class="pm-table-total">Total picks: ${total}</div><table class="astro-table"><thead><tr><th>Universal Day</th><th>Day Energy</th><th>Picks</th><th>Win Rate</th></tr></thead><tbody>${body}</tbody></table>`;
}

/* ===================== Pagination (Stats page tracked-picks tables) ===================== */
// MLB's Old Data table in particular can run into the hundreds of rows once
// backfilled - keyed by prefix so UFC/Tennis/MLB Today/MLB Old each keep
// their own page independently, same pattern as the day filter's state.
const PAGINATION_PAGE_SIZE = 25;
const _paginationState = new Map();

function resetPagination(prefix) {
  _paginationState.set(prefix, 1);
}

// sortedRows must already be in final display order. Clamps the stored page
// back into range (e.g. after the day filter shrinks the set) rather than
// leaving the view stuck on a page that no longer exists.
function paginationSlice(prefix, sortedRows) {
  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGINATION_PAGE_SIZE));
  let page = _paginationState.get(prefix) || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  _paginationState.set(prefix, page);
  const start = (page - 1) * PAGINATION_PAGE_SIZE;
  return { rows: sortedRows.slice(start, start + PAGINATION_PAGE_SIZE), page, totalPages, total };
}

// Rebuilds the Prev/Next controls fresh on every call (cheap, and means no
// separate one-time wiring step) - hidden entirely once everything fits on
// one page. onChange re-renders the same table from its already-loaded data,
// never re-fetching or re-filtering.
function renderPaginationControls(elId, prefix, page, totalPages, onChange) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button type="button" class="btn-link" id="${prefix}PagePrev"${page <= 1 ? ' disabled' : ''}>&larr; Prev</button>
    <span>Page ${page} of ${totalPages}</span>
    <button type="button" class="btn-link" id="${prefix}PageNext"${page >= totalPages ? ' disabled' : ''}>Next &rarr;</button>
  `;
  document.getElementById(`${prefix}PagePrev`).addEventListener('click', () => {
    _paginationState.set(prefix, Math.max(1, page - 1));
    onChange();
  });
  document.getElementById(`${prefix}PageNext`).addEventListener('click', () => {
    _paginationState.set(prefix, Math.min(totalPages, page + 1));
    onChange();
  });
}

/* ===================== Breakdown box toggle (Stats page) ===================== */
// Edge Strength / Market Price / Universal Day / Day Energy / Dimension (and
// MLB's Component) breakdowns stacked on top of each other read as clutter -
// this collapses them to one dropdown that shows exactly one box at a time.
// Pure show/hide over markup that already renders normally; doesn't touch
// how any of those boxes compute or render their own contents.
function initBreakdownToggle(selectId, boxIds) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  function sync() {
    boxIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === sel.value) ? '' : 'none';
    });
  }
  sel.addEventListener('change', sync);
  sync();
}

/* ===================== Cloud sync (Firebase) ===================== */
// Signing in is optional - the app works purely on localStorage either way.
// When signed in, every save also pushes to Firestore under the user's own
// document; cloudPullAll() (called once per app session by auth-widget.js)
// pulls that down first, so a fresh install/device/reinstalled home-screen
// icon picks up where the account left off instead of starting empty.

const CLOUD_SYNC_FIELDS = {
  [STORAGE_KEY]: 'db',
  [EMAX_STORAGE_KEY]: 'emax',
  // Syncs the starter-category migration state itself (see
  // EMAX_SEEN_STARTERS_KEY above) so a second device that already pulled
  // down a newly-added starter category (e.g. Anime/Shows/Songs) doesn't
  // also independently re-seed it - it sees the same "already seen" record.
  [EMAX_SEEN_STARTERS_KEY]: 'emaxSeenStarters',
  [PROFILE_KEY]: 'profile',
  [STADIUMS_KEY]: 'stadiums',
  [INTL_REGIONS_KEY]: 'intlRegions',
  [CUSTOM_FIGHTERS_KEY]: 'customFighters',
  [FIGHTER_OVERRIDES_KEY]: 'fighterOverrides',
  [UFC_PREDICTIONS_KEY]: 'ufcPredictions',
  [TENNIS_VENUES_KEY]: 'tennisVenues',
  [TENNIS_CUSTOM_PLAYERS_KEY]: 'customTennisPlayers',
  [TENNIS_PLAYER_OVERRIDES_KEY]: 'tennisPlayerOverrides',
  [TENNIS_PREDICTIONS_KEY]: 'tennisPredictions',
  [MLB_VENUES_KEY]: 'mlbVenues',
  // MLB_PREDICTIONS_KEY, MLB_PITCHER_K_SIGNALS_KEY, and MLB_BACKFILL_STATE_KEY
  // are deliberately NOT synced. Each MLB pick stores a 13-person team's full
  // per-component + per-dimension breakdown, and after months of live
  // tracking plus a deep historical backfill that array grows well past
  // Firestore's ~1MB per-document cap. cloudPushKey's write then silently
  // fails (.catch(() => {})), freezing the cloud copy at an old, smaller
  // snapshot - and the NEXT cloudPullAll (e.g. the Sports Betting sign-in
  // gate) unconditionally overwrites the fuller local data back down to that
  // stale snapshot, wiping out backfilled history that had actually synced
  // fine right up until it silently didn't. Keeping these three local-only
  // makes that impossible, at the cost of no longer syncing MLB stats across
  // devices - a fair trade for a dataset that's reconstructible via the
  // Backfill button anyway (unlike Database/Profile, which are irreplaceable
  // user data and stay synced).
};

function cloudPushKey(storageKey) {
  if (typeof firebase === 'undefined') {
    // The SDK loads lazily after the page is up (firebase-loader.js) -
    // remember anything saved before it arrives so auth-widget can push
    // it once sign-in state is known.
    (window.__pendingCloudPushKeys = window.__pendingCloudPushKeys || new Set()).add(storageKey);
    return;
  }
  const user = firebase.auth().currentUser;
  if (!user) return;
  const field = CLOUD_SYNC_FIELDS[storageKey];
  if (!field) return;

  const raw = localStorage.getItem(storageKey);
  const value = raw ? JSON.parse(raw) : null;
  firebase.firestore().collection('users').doc(user.uid).set({ [field]: value }, { merge: true }).catch(() => {});
}

// Pushes every locally-stored key up to Firestore - used right after signup,
// so a brand-new account's initial cloud backup is whatever's already on
// this device, rather than waiting for the next edit to create it.
function cloudPushAll() {
  if (typeof firebase === 'undefined') return;
  Object.keys(CLOUD_SYNC_FIELDS).forEach((storageKey) => cloudPushKey(storageKey));
}

function cloudPullAll() {
  if (typeof firebase === 'undefined') return Promise.resolve();
  const user = firebase.auth().currentUser;
  if (!user) return Promise.resolve();

  return firebase.firestore().collection('users').doc(user.uid).get().then((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    Object.keys(CLOUD_SYNC_FIELDS).forEach((storageKey) => {
      const field = CLOUD_SYNC_FIELDS[storageKey];
      if (data[field] !== undefined && data[field] !== null) {
        localStorage.setItem(storageKey, JSON.stringify(data[field]));
      }
    });
  });
}

/* ===================== NBA Predictions (Stats tracker) ===================== */
// Same record shape as the MLB game picks (teamAName/teamBName, a favorite vs.
// the market, resolved later), so numerologyPickPrice, isCorrectPick, the edge
// tiers, the price buckets and the whole betting engine work on NBA records
// with no changes. What differs is how a side's composite is built.
//
// MLB scores ~13 fixed roles per side at fixed weights. NBA can't: there is no
// pre-game equivalent of a probable pitcher, and a 17-man roster contains
// players who will not touch the floor. Flat-weighting all of them is exactly
// the mistake the MLB component analysis exposed - 40% spread across nine
// batters diluted the signal so badly that the manager alone outperformed the
// full composite. So NBA weights each player by EXPECTED MINUTES instead of by
// role, taken from that player's own trailing form.
//
// No coach component, deliberately. ESPN gives NBA coach names without birth
// dates, and the id only resolves to a DOB for the coaches who used to play -
// 10 of 30 when checked live. Rather than hand-fit a table and then measure it
// on the same games it was fit to, the coach is simply absent here; if it is
// ever added it gets measured forward from the day it ships.

const NBA_PREDICTIONS_KEY = 'numerology_nba_predictions';
const NBA_TOTALS_PREDICTIONS_KEY = 'numerology_nba_totals_predictions';
// Rolling per-player form: the trailing window of games that produces both the
// expected-minutes weighting above and the prop baselines. Persisted so a live
// slate can be scored without re-walking two seasons.
const NBA_PLAYER_FORM_KEY = 'numerology_nba_player_form';
// Birth dates by ESPN athlete id. A backfill spans players who are on no
// current roster, and each lookup is its own request, so caching turns "once
// per game" into "once per player, ever".
const NBA_BIRTHDATES_KEY = 'numerology_nba_birthdates';

function loadNbaPredictions() {
  try {
    const raw = bigStoreGetItem(NBA_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveNbaPredictions(predictions) {
  saveJsonGuarded(NBA_PREDICTIONS_KEY, predictions);
}

function loadNbaTotalsPredictions() {
  try {
    const raw = bigStoreGetItem(NBA_TOTALS_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveNbaTotalsPredictions(predictions) {
  saveJsonGuarded(NBA_TOTALS_PREDICTIONS_KEY, predictions);
}

function loadNbaPlayerForm() {
  try {
    const raw = bigStoreGetItem(NBA_PLAYER_FORM_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveNbaPlayerForm(form) {
  saveJsonGuarded(NBA_PLAYER_FORM_KEY, form);
}

function loadNbaBirthdates() {
  try {
    const raw = bigStoreGetItem(NBA_BIRTHDATES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveNbaBirthdates(map) {
  saveJsonGuarded(NBA_BIRTHDATES_KEY, map);
}

/* ---------- Player form (trailing window) ---------- */
// How many games back the trailing window reaches. Ten is long enough to
// smooth a single blowout or a foul-plagued night, short enough to follow a
// role change (a starter lost to injury, a rookie handed minutes).
const NBA_FORM_WINDOW = 10;
// Players scored per side, ranked by expected minutes. Ten covers a real NBA
// rotation; beyond that a player's minutes are noise and their score would
// only dilute.
const NBA_ROTATION_SIZE = 10;
// Below this many players with usable form, the side is not scored at all
// rather than scored on a fragment - the same "don't predict on partial data"
// stance the MLB tracker takes with unposted lineups.
const NBA_MIN_ROTATION = 5;
// A player who hasn't appeared in this long isn't part of the rotation any
// more (injury, trade, G-League). Keeps a stale name from holding a weight.
const NBA_FORM_STALE_DAYS = 30;

function nbaFormEntry(form, playerId) {
  const rec = form[String(playerId)];
  return (rec && Array.isArray(rec.recent)) ? rec : null;
}

// Average of a stat across the trailing window. Returns null with no games,
// never 0 - a player with no history is unknown, not a zero-minute player.
function nbaTrailingAvg(form, playerId, stat) {
  const rec = nbaFormEntry(form, playerId);
  if (!rec || !rec.recent.length) return null;
  const vals = rec.recent.map((g) => g[stat]).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// The rotation a team is expected to play, derived purely from games ALREADY
// in the form store. Nothing about the game being predicted is consulted -
// not the boxscore, not who was active - because that would be lookahead: a
// backfilled pick built from the participant list would silently "know" a star
// was out, and every measured edge would be inflated by information no bettor
// had. The cost is that a trade or a same-day injury takes a few games to show
// up here, which is the honest version of the problem a real bettor has.
function nbaExpectedRotation(form, teamAbbr, asOfISO) {
  const cutoff = new Date(`${asOfISO}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - NBA_FORM_STALE_DAYS);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const candidates = [];
  Object.keys(form).forEach((id) => {
    const rec = nbaFormEntry(form, id);
    if (!rec || !rec.recent.length) return;
    // Only games strictly before the one being predicted count.
    const prior = rec.recent.filter((g) => g.d && g.d < asOfISO);
    if (!prior.length) return;
    const last = prior[prior.length - 1];
    if (last.team !== teamAbbr) return;          // has moved on / different team
    if (last.d < cutoffISO) return;              // hasn't played recently enough
    const mins = prior.map((g) => g.min).filter((v) => Number.isFinite(v));
    if (!mins.length) return;
    const expectedMinutes = mins.reduce((a, b) => a + b, 0) / mins.length;
    if (expectedMinutes <= 0) return;
    candidates.push({
      id: String(id),
      name: rec.name || null,
      birthDate: rec.birthDate || null,
      position: rec.pos || null,
      expectedMinutes,
      priorGames: prior.length,
    });
  });

  candidates.sort((a, b) => b.expectedMinutes - a.expectedMinutes);
  return candidates.slice(0, NBA_ROTATION_SIZE);
}

// Folds one finished game's boxscore into the form store. Called only AFTER a
// game has been scored, so the walk-forward order is what keeps the store
// free of lookahead.
function nbaUpdatePlayerForm(form, teamAbbr, dateISO, players, birthdates) {
  (players || []).forEach((p) => {
    if (!p.id || !p.played) return;
    const key = String(p.id);
    if (!form[key]) form[key] = { name: p.name || null, birthDate: null, recent: [] };
    const rec = form[key];
    if (p.name) rec.name = p.name;
    const bd = birthdates ? birthdates[key] : null;
    if (bd && bd.birthDate) rec.birthDate = bd.birthDate;
    // Idempotent: re-running a backfill over the same game must not double it.
    if (rec.recent.some((g) => g.d === dateISO && g.team === teamAbbr)) return;
    if (p.position) rec.pos = p.position;
    rec.recent.push({
      d: dateISO,
      team: teamAbbr,
      min: Number.isFinite(p.minutes) ? p.minutes : 0,
      pts: Number.isFinite(p.points) ? p.points : null,
      reb: Number.isFinite(p.rebounds) ? p.rebounds : null,
      ast: Number.isFinite(p.assists) ? p.assists : null,
    });
    rec.recent.sort((a, b) => (a.d < b.d ? -1 : (a.d > b.d ? 1 : 0)));
    if (rec.recent.length > NBA_FORM_WINDOW) rec.recent = rec.recent.slice(-NBA_FORM_WINDOW);
  });
  return form;
}

/* ---------- The side composite ---------- */
// Deliberately a different signature from computeTeamComposite: MLB needs the
// whole game object because its pitcherMatchup component scores one side
// against the other's lineup, and NBA has no cross-side component at all. So
// this takes just the one side's rotation plus the date/place context, and
// every player runs through the same computeFighterScore the other three
// sports use.
//
// stadiumDate is always null for now - NBA arena founding dates are not in any
// API here, and inventing one is not on the table, so computeFighterScore
// degrades to its day+state blend. stateDate comes from the venue's US state
// when there is one; an international game (Berlin, Paris, Mexico City) has no
// state and correctly falls back to day-only rather than borrowing a state.
// Franchise founding dates, all 30, supplied by the user from their own
// database rather than scraped - which matters, because no API here carries
// them and Wikidata only holds year-level precision for several teams (the
// Nuggets' inception is literally "+1967-00-00" at precision 9). A team absent
// from this map is scored on its players alone; nothing is ever stood in for a
// missing date.
//
// Two things about this data worth not "tidying up" later:
//
// 1. The convention is deliberately mixed. Eight teams use their ORIGINAL
//    founding despite later moves (Pistons 1941 Fort Wayne, 76ers 1946
//    Syracuse, Kings 1945 Rochester, Rockets 1967 San Diego, Spurs 1967
//    Dallas, Jazz 1974 New Orleans, Hawks 1946 Tri-Cities, Lakers 1947
//    Minneapolis), while seven use the date their CURRENT identity began
//    (Thunder 2008, Nets 2012, Grizzlies 2001, Clippers 1984, Warriors 1971,
//    Pelicans 2013, Hornets 2014). That is the owner's doctrine, not an
//    inconsistency to normalise.
// 2. Two pairs share an exact date and therefore always score identically on
//    this component: Celtics/Knicks (1946-06-06, the BAA's founding) and
//    Bucks/Suns (1968-01-22, expansion granted the same day). Real, not a
//    typo - it means the franchise axis cannot separate those four teams.
//
// Keyed by ESPN's team abbreviation, since that is what the scoreboard returns.
// Note ESPN's codes, not Polymarket's: GS not GSW, NY not NYK, SA not SAS,
// NO not NOP, UTAH not UTA, WSH not WAS.
const NBA_TEAM_FOUNDING_DATES = {
  ATL: '1946-06-03',
  BOS: '1946-06-06',
  BKN: '2012-04-30',
  CHA: '2014-05-20',
  CHI: '1966-01-16',
  CLE: '1970-06-22',
  DAL: '1980-10-11',
  // No full date exists in any authoritative source (Wikidata precision 9,
  // Wikipedia infobox "1967"). Owner chose the day the franchise became a
  // Denver team - it was awarded to Kansas City on 1967-02-02 and moved before
  // playing a game - matching how the Rockets and Spurs use their original
  // city's founding date.
  DEN: '1967-04-01',
  DET: '1941-06-22',
  GS: '1971-07-17',
  HOU: '1967-01-11',
  IND: '1967-02-02',
  LAC: '1984-05-16',
  LAL: '1947-11-01',
  MEM: '2001-03-26',
  MIA: '1988-12-01',
  MIL: '1968-01-22',
  MIN: '1989-11-03',
  NO: '2013-04-18',
  NY: '1946-06-06',
  OKC: '2008-09-03',
  ORL: '1989-06-15',
  PHI: '1946-05-14',
  PHX: '1968-01-22',
  POR: '1970-02-06',
  SAC: '1945-05-10',
  SA: '1967-06-18',
  TOR: '1995-05-05',
  UTAH: '1974-06-07',
  WSH: '1997-12-02',
};

// Share of a side's score the franchise carries, with the players splitting the
// rest by minutes. 10% deliberately matches MLB's franchise weight rather than
// being invented for NBA - it is a starting point to be MEASURED, not a claim.
// The component-signal table on the Stats page reports how the franchise does
// on its own, and that is what should move this number, the same way the MLB
// manager weight was moved by measurement rather than by intuition.
const NBA_FRANCHISE_WEIGHT = 0.10;

function computeNbaSideComposite(rotation, matchDate, stadiumDate, stateDate, teamAbbr) {
  const players = (rotation || [])
    .filter((p) => p.birthDate && Number.isFinite(p.expectedMinutes) && p.expectedMinutes > 0);
  if (players.length < NBA_MIN_ROTATION) return null;
  const minutesTotal = players.reduce((s, p) => s + p.expectedMinutes, 0);
  if (!minutesTotal) return null;

  const foundingISO = teamAbbr ? NBA_TEAM_FOUNDING_DATES[teamAbbr] : null;
  // With a founding date the players share 90%; without one they take the whole
  // 100%, so a team missing from the map is still scored normally instead of
  // quietly carrying a 10% hole that would drag its composite toward zero.
  const playerShare = foundingISO ? 1 - NBA_FRANCHISE_WEIGHT : 1;

  const parts = players.map((p, index) => ({
    // Grouped by ROLE, not by minutes rank. Roles are what made the MLB
    // analysis informative - the manager mattered because a manager is a job,
    // where "the fifth-most-used batter" is not.
    //
    // ESPN gives NBA only three positions, G / F / C, checked against 243
    // player-games across both the boxscore and the athlete endpoint. There is
    // no PG/SG/SF/PF available; a retired player like Redick reports SG only
    // because his historical record is finer than a current player's. So three
    // buckets is the honest ceiling, not a simplification chosen here.
    //
    // A player with no position still carries full weight in the composite; he
    // just lands in no bucket, rather than being guessed into one.
    key: NBA_POSITION_KEYS.includes(p.position) ? p.position : 'unknown',
    role: `${p.name || 'Player'} ${p.position ? `(${p.position}, ` : '('}${p.expectedMinutes.toFixed(1)} min)`,
    // Weights are shares of the whole side, not raw minutes, so the franchise
    // part below sits on the same scale - extractTeamDimensions weights its
    // per-dimension averages by exactly this field.
    weight: playerShare * (p.expectedMinutes / minutesTotal),
    score: computeFighterScore(parseDateInput(p.birthDate), matchDate, stadiumDate, stateDate),
  }));

  if (foundingISO) {
    parts.push({
      key: 'franchise',
      role: `Franchise (est. ${foundingISO})`,
      weight: NBA_FRANCHISE_WEIGHT,
      score: computeFighterScore(parseDateInput(foundingISO), matchDate, stadiumDate, stateDate),
    });
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (!totalWeight) return null;
  const combined = Math.round(parts.reduce((s, p) => s + p.score.combined * p.weight, 0) / totalWeight);
  return { combined, parts };
}

// Two groups rather than MLB's six, because minutes-weighting already does the
// work role-weights were doing there. The question this leaves the component
// table is the one worth asking: does the heavy-minutes core carry the signal,
// or the back of the rotation?
// The three positions ESPN actually reports for NBA.
const NBA_POSITION_KEYS = ['G', 'F', 'C'];

// 'star' is derived rather than assigned: it is whichever player carries the
// most expected minutes, so he also appears inside his own position bucket.
// Components are reported values, not weights, so that overlap costs nothing -
// and it finally puts a SINGLE person on the table. Every NBA component so far
// has been an average of several players, and averaging is exactly what buried
// the signal in MLB until the manager was isolated. Centre comes closest among
// the positions at about 1.4 players a team; star is exactly one.
const NBA_COMPONENT_KEYS = ['star', 'G', 'F', 'C', 'franchise'];

const NBA_COMPONENT_LABELS = {
  star: '⭐ Star (most minutes)',
  G: 'Guards',
  F: 'Forwards',
  C: 'Center',
  franchise: 'Franchise',
};

function extractNbaComponents(parts) {
  const buckets = { G: [], F: [], C: [], franchise: [] };
  let star = null;
  (parts || []).forEach((p) => {
    const s = p.score && p.score.combined;
    if (s == null) return;
    if (p.key in buckets) buckets[p.key].push(s);
    // Heaviest-weighted player part, franchise excluded - its weight is a fixed
    // 10% and would outrank a real player in a thin rotation.
    if (p.key !== 'franchise' && (!star || p.weight > star.weight)) star = { weight: p.weight, score: s };
  });
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  return {
    star: star ? star.score : null,
    G: avg(buckets.G),
    F: avg(buckets.F),
    C: avg(buckets.C),
    // Only ever one franchise part, so this is that score rather than a mean.
    franchise: avg(buckets.franchise),
  };
}

/* ---------- Edge tiers ---------- */
// A minutes-weighted average over ten players concentrates toward the middle
// the same way MLB's team composite does, so the one-on-one UFC/Tennis bands
// (15/30) would sit permanently empty. These start at the MLB spacing, which
// was itself calibrated against a real ~2.8 std-dev composite spread. They are
// a starting guess, not doctrine - once the per-tier table on the Stats page
// fills in, move them to where the data says signal actually begins.
const NBA_REAL_EDGE_MIN_GAP = 3;

const NBA_EDGE_TIERS = [
  { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 8, max: Infinity },
  { key: 'clear', label: 'Clear Edge', icon: '💪', min: 5, max: 8 },
  { key: 'slight', label: 'Slight Edge', icon: '📈', min: NBA_REAL_EDGE_MIN_GAP, max: 5 },
  { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: NBA_REAL_EDGE_MIN_GAP },
];

function edgeTierForGapNba(gap) {
  return edgeTierForGap(gap, NBA_EDGE_TIERS);
}

function hasRealEdgeNba(p) {
  return edgeGap(p) >= NBA_REAL_EDGE_MIN_GAP;
}

function computeEdgeTierStatsNba(predictions) {
  return computeEdgeTierStats(predictions, NBA_EDGE_TIERS);
}

/* ---------- Totals (game pace) ---------- */
// The game-level analogue of MLB's pitcher duel, and note the direction is
// INVERTED relative to it: a high MLB duel means both starters are on, so
// runs stay down and the pick is Under. Here both teams' composites averaged
// is read as how much energy is on the floor, so a high pace score points
// OVER. That inversion is a hypothesis, not an established fact - and it is
// a falsifiable one, because a systematically backwards direction shows up in
// the tier table as a win rate consistently below 50% rather than as noise.
//
// NBA_PACE_NEUTRAL is the pivot where the favorite flips. 63 is where this
// compat engine's day scores actually center (the same value the MLB duel was
// calibrated to, and it is the same engine producing the numbers), so it is a
// principled starting point rather than a fitted one - recalibrate it off the
// observed NBA distribution once the backfill has run.
const NBA_PACE_NEUTRAL = 63;

const NBA_TOTALS_MIN_GAP = 5;

const NBA_TOTALS_TIERS = [
  { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 22, max: Infinity },
  { key: 'clear', label: 'Clear Edge', icon: '💪', min: 12, max: 22 },
  { key: 'slight', label: 'Slight Edge', icon: '📈', min: NBA_TOTALS_MIN_GAP, max: 12 },
  { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: NBA_TOTALS_MIN_GAP },
];

// Which side of a totals market a score favors: at or above neutral is Over.
function nbaPaceSideForScore(score, outcomeA, outcomeB) {
  const overIsA = normalizeName(outcomeA) === 'over';
  const overName = overIsA ? outcomeA : outcomeB;
  const underName = overIsA ? outcomeB : outcomeA;
  return score >= NBA_PACE_NEUTRAL ? overName : underName;
}

// Game-level components: each side's group averaged across both teams, so the
// "which signal predicts best" test works on totals the same way it does on
// game picks.
const NBA_PACE_COMPONENT_KEYS = ['stars', 'Gs', 'Fs', 'Cs', 'franchises'];

const NBA_PACE_COMPONENT_LABELS = {
  stars: '⭐ Both Stars',
  Gs: 'Both Guard Groups',
  Fs: 'Both Forward Groups',
  Cs: 'Both Centers',
  franchises: 'Both Franchises',
  pace: '🏃 Pace Score (live)',
};

function nbaPaceComponentsFromSides(compHome, compAway) {
  if (!compHome || !compAway) return null;
  const pair = (key) => {
    const a = compHome[key];
    const b = compAway[key];
    if (a == null || b == null) return null;
    return Math.round(((a + b) / 2) * 10) / 10;
  };
  return {
    stars: pair('star'),
    Gs: pair('G'),
    Fs: pair('F'),
    Cs: pair('C'),
    franchises: pair('franchise'),
  };
}

// market is a parseNbaSideMarket() shape whose priceA/priceB must already be
// PRE-GAME prices - the backfill swaps the resolved 1/0 finals out for CLOB
// history prices before calling this, for the same reason MLB does.
function buildNbaTotalsRecord(market, paceScore, gameLabel, gameTimeISO, result, eventId, paceComponents) {
  const overIsA = normalizeName(market.outcomeA) === 'over';
  const p = Math.round(paceScore * 10) / 10;
  const mirrored = Math.round((2 * NBA_PACE_NEUTRAL - paceScore) * 10) / 10;
  const overName = overIsA ? market.outcomeA : market.outcomeB;
  const underName = overIsA ? market.outcomeB : market.outcomeA;
  return {
    conditionId: market.conditionId,
    eventId,
    kind: 'totals',
    line: market.line != null ? market.line : undefined,
    teamAName: market.outcomeA,
    teamBName: market.outcomeB,
    gameLabel,
    paceScore: p,
    numerologyFavorite: paceScore >= NBA_PACE_NEUTRAL ? overName : underName,
    // The Over side carries the pace score itself; Under carries its mirror,
    // so the stored pair is shaped like every other prediction and edgeGap,
    // the tiers and the betting engine all work on it untouched.
    numerologyScoreA: overIsA ? p : mirrored,
    numerologyScoreB: overIsA ? mirrored : p,
    marketPriceA: market.priceA,
    marketPriceB: market.priceB,
    paceComponents: paceComponents || undefined,
    gameTime: gameTimeISO,
    recordedAt: Date.now(),
    result: result || null,
  };
}

// Totals resolve from ESPN's own final scores, never from Polymarket's
// outcomePrices - a closed market's prices collapse to the 1/0 result on every
// market of the event at once, which would mark every total the same way.
function nbaTotalsResultFromScores(homeScore, awayScore, outcomeA, outcomeB, line) {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || !Number.isFinite(line)) return null;
  const total = homeScore + awayScore;
  // Polymarket's lines are .5 in practice, so a push shouldn't occur - but a
  // whole-number line landing exactly on the total is a void, not a loss.
  if (total === line) return { winner: null, draw: true, resolvedAt: Date.now() };
  const overIsA = normalizeName(outcomeA) === 'over';
  const overName = overIsA ? outcomeA : outcomeB;
  const underName = overIsA ? outcomeB : outcomeA;
  return { winner: total > line ? overName : underName, draw: false, resolvedAt: Date.now() };
}

/* ---------- Player prop signals ---------- */
// The cleanest test of the premise this project has. Every other tracker asks
// "can numerology beat a market that already prices team strength" - and on NBA
// team moneylines the answer measured as a flat zero across 1,245 picks. A prop
// signal asks something different: does a player beat HIS OWN trailing average
// on days his numerology runs hot? The baseline is the player, so talent
// cancels out entirely and no market has to be beaten for the signal to be
// measurable.
//
// It is also vastly better powered. Team picks gave ~1,245 samples, where one
// standard error is 1.42 points and nothing under +4.25 is visible at 3 sigma.
// Sixteen players a game over two seasons gives ~42,000, where 1se is 0.24 and
// +0.73 is visible. A null result here means something; a null at n=1,245 mostly
// meant the test was underpowered.
//
// Deliberately NO predicted direction is stored. MLB's strikeout signal hardcodes
// "day score >= 60 means over", which bakes in both a threshold and a direction
// before any data exists - the same mistake as assuming a high pace score means
// Over. Here the raw day score is stored and the analysis buckets it, so the
// data answers whether hot days mean more production, less, or nothing at all.
const NBA_PROP_SIGNALS_KEY = 'numerology_nba_prop_signals';

// Which stats are tracked. These are exactly the three Polymarket prices as
// player props, so a signal that works here is directly bettable later.
const NBA_PROP_STATS = ['pts', 'reb', 'ast'];

const NBA_PROP_STAT_LABELS = { pts: 'Points', reb: 'Rebounds', ast: 'Assists' };

// Players per team recorded per game, ranked by trailing minutes. Eight covers
// everyone Polymarket actually lists (about seven a game) and stops garbage-time
// minutes from adding records whose baselines are pure noise.
const NBA_PROP_PLAYERS_PER_TEAM = 8;

// A baseline needs enough prior games to mean anything. Below this the player
// is skipped for that game rather than compared against a one-game average.
const NBA_PROP_MIN_BASELINE_GAMES = 5;

// Day-score bands for the analysis. The compat engine centres around 63, so
// these are spaced around that rather than around 50 - and they are reporting
// buckets, not thresholds that decide a pick.
const NBA_PROP_DAY_BANDS = [
  { key: 'hot', label: '🔥 Hot (75+)', icon: '🔥', min: 75, max: Infinity },
  { key: 'warm', label: '📈 Warm (66-74)', icon: '📈', min: 66, max: 75 },
  { key: 'neutral', label: '➖ Neutral (56-65)', icon: '➖', min: 56, max: 66 },
  { key: 'cool', label: '📉 Cool (45-55)', icon: '📉', min: 45, max: 56 },
  { key: 'cold', label: '🧊 Cold (under 45)', icon: '🧊', min: -Infinity, max: 45 },
];

function nbaPropDayBand(dayScore) {
  return NBA_PROP_DAY_BANDS.find((b) => dayScore >= b.min && dayScore < b.max)
    || NBA_PROP_DAY_BANDS[NBA_PROP_DAY_BANDS.length - 1];
}

// This store is lazy: at ~4.4MB it is the largest in the app and only two
// screens read it, so it is not hydrated at startup. Await this before either
// loading or saving it.
async function ensureNbaPropSignals() {
  return ensureBigStoreKey(NBA_PROP_SIGNALS_KEY);
}

function loadNbaPropSignals() {
  // Deliberately outside the try: if the store is not loaded, or failed to
  // load, that error must reach the caller. Backfill builds its next value by
  // appending to whatever this returns, so answering [] would turn a two-season
  // walk into a one-day file the next time it checkpoints.
  const raw = bigStoreGetItem(NBA_PROP_SIGNALS_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveNbaPropSignals(signals) {
  saveJsonGuarded(NBA_PROP_SIGNALS_KEY, signals);
}

// Field names are short on purpose: at ~42,000 records the difference between
// "playerId" and "p" is about a megabyte held in memory.
//   g  game id      p  player id     t  team      d  ET date
//   s  day score    pts/reb/ast  [actual, trailing baseline]
function buildNbaPropSignal(gameId, playerId, teamAbbr, dateISO, dayScore, actuals, baselines) {
  const rec = { g: String(gameId), p: String(playerId), t: teamAbbr, d: dateISO, s: Math.round(dayScore) };
  let any = false;
  NBA_PROP_STATS.forEach((stat) => {
    const a = actuals[stat];
    const b = baselines[stat];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    rec[stat] = [a, Math.round(b * 10) / 10];
    any = true;
  });
  return any ? rec : null;
}

// Per-band performance for one stat, tested TWO ways.
//
// The null here is emphatically NOT 50%, and assuming it was produced a table
// that screamed -6.5 sigma at pure noise. Beating your own trailing MEAN is a
// sub-50% proposition for any right-skewed counting stat, because a handful of
// big games drag the mean above the median: simulated with zero effect, assists
// land at 47.1%, rebounds 47.4%, points 48.3% - and real NBA assists are more
// skewed than that simulation, which is why every band read ~45%. Uniformly.
//
// So the honest baseline is the rate this stat actually shows across ALL bands.
// The question worth asking was never "is this above a coin flip", it is "does a
// hot day differ from an ordinary one", and that is what comparing each band to
// the overall rate measures.
//
// The second test is strictly better than the first: instead of throwing away
// magnitude and counting over/under, it averages (actual - baseline) and asks
// whether a band's average differs from the rest of the sample, via Welch's t.
// A day that adds half an assist shows up here and is invisible to a rate test.
// Skew cancels out of a difference of means entirely.
function computeNbaPropBandStats(signals, stat) {
  const rows = NBA_PROP_DAY_BANDS.map((band) => ({
    key: band.key, label: band.label, band, over: 0, under: 0, diffs: [],
  }));

  let allOver = 0;
  let allUnder = 0;
  const allDiffs = [];

  (signals || []).forEach((r) => {
    const pair = r[stat];
    if (!pair) return;
    const row = rows.find((x) => r.s >= x.band.min && r.s < x.band.max);
    if (!row) return;
    const diff = pair[0] - pair[1];
    row.diffs.push(diff);
    allDiffs.push(diff);
    // A game landing exactly on the baseline is a push - excluded from the rate
    // rather than scored either way. It still counts in the magnitude test,
    // where a difference of zero is real information.
    if (diff > 0) { row.over += 1; allOver += 1; } else if (diff < 0) { row.under += 1; allUnder += 1; }
  });

  const allN = allOver + allUnder;
  const overallRate = allN ? allOver / allN : null;

  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const variance = (a, m) => (a.length > 1 ? a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1) : null);
  const overallDiffMean = mean(allDiffs);

  return rows.map((row) => {
    const n = row.over + row.under;
    const rate = n ? row.over / n : null;

    // Rate test: this band against the overall rate for the stat.
    const rateSigma = (n && overallRate != null && overallRate > 0 && overallRate < 1)
      ? (rate - overallRate) / Math.sqrt((overallRate * (1 - overallRate)) / n)
      : null;

    // Magnitude test: this band's mean (actual - baseline) against every OTHER
    // band's, using Welch's t so unequal sizes and spreads are handled properly.
    // Compared against the rest of the sample rather than the whole of it,
    // since a band is part of the whole and would otherwise be tested against
    // itself.
    const bandMean = mean(row.diffs);
    let diffSigma = null;
    let restMean = null;
    if (row.diffs.length > 1) {
      // Built directly rather than derived from the pooled variance identity.
      // Five bands over ~42,000 values is a couple of hundred thousand
      // operations, which is nothing, and the algebraic shortcut is easy to get
      // subtly wrong in a way no test would obviously catch.
      const restDiffs = [];
      rows.forEach((other) => {
        if (other.key === row.key) return;
        other.diffs.forEach((v) => restDiffs.push(v));
      });
      if (restDiffs.length > 1) {
        restMean = mean(restDiffs);
        const bandVar = variance(row.diffs, bandMean);
        const restVar = variance(restDiffs, restMean);
        if (bandVar != null && restVar != null) {
          const se = Math.sqrt(bandVar / row.diffs.length + restVar / restDiffs.length);
          if (se > 0) diffSigma = (bandMean - restMean) / se;
        }
      }
    }

    return {
      key: row.key,
      label: row.label,
      count: n,
      samples: row.diffs.length,
      overs: row.over,
      overPct: rate != null ? Math.round(rate * 100) : null,
      overallPct: overallRate != null ? Math.round(overallRate * 100) : null,
      sigma: rateSigma,
      meanDiff: bandMean,
      restMeanDiff: restMean,
      diffSigma,
    };
  });
}

/* ---------- Backfill settings ---------- */
// Two seasons is the whole priced history (Polymarket's NBA markets start on
// 2024-10-21), so 730 days is the useful maximum rather than an arbitrary cap.
const NBA_BACKFILL_WINDOW_KEY = 'numerology_nba_backfill_window_days';
const NBA_BACKFILL_WINDOW_OPTIONS = [91, 182, 364, 730];

function loadNbaBackfillWindowDays() {
  const raw = Number(localStorage.getItem(NBA_BACKFILL_WINDOW_KEY));
  return NBA_BACKFILL_WINDOW_OPTIONS.includes(raw) ? raw : 364;
}

function saveNbaBackfillWindowDays(days) {
  localStorage.setItem(NBA_BACKFILL_WINDOW_KEY, String(days));
}

const NBA_BACKFILL_STATE_KEY = 'numerology_nba_backfill_state';

// Prop collection walks separately from the game backfill, and tracks its own
// progress. Keeping them apart matters: the game walk spends ~6 requests per
// game on Polymarket slugs and CLOB price history, while prop signals need only
// ESPN's boxscore, which the walk fetches anyway. Folding props into the game
// walk would have meant re-running the whole two-hour price fetch to collect
// data that costs one request per game.
const NBA_PROP_BACKFILL_STATE_KEY = 'numerology_nba_prop_backfill_state';

function loadNbaPropBackfillState() {
  try {
    const raw = localStorage.getItem(NBA_PROP_BACKFILL_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveNbaPropBackfillState(state) {
  localStorage.setItem(NBA_PROP_BACKFILL_STATE_KEY, JSON.stringify(state));
}

function loadNbaBackfillState() {
  try {
    const raw = localStorage.getItem(NBA_BACKFILL_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveNbaBackfillState(state) {
  localStorage.setItem(NBA_BACKFILL_STATE_KEY, JSON.stringify(state));
}

/* ===================== Suppress saved-password autofill (non-auth fields) ===================== */
// The sign-in modal (auth-widget.js) and the Sports Betting gate both inject a
// real password field, and once one is on the page Chrome's Google Password
// Manager will happily offer to dump a saved login into ANY text box it thinks
// is a username - which meant typing a name/birthday on the Database (or any
// other) page popped up saved credentials. Turn autofill off on every field the
// app owns, EXCEPT the actual sign-in inputs (inside the auth modal, the sign-in
// pill, or the gate), where filling a saved password is the whole point.
(function () {
  const AUTH_CONTAINERS = '#authModalOverlay, #authWidget, #authWidgetPlaceholder, #sportsGate';

  function disableNonAuthAutofill() {
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.type === 'password') return;            // never touch a password field
      if (el.closest && el.closest(AUTH_CONTAINERS)) return; // leave sign-in fields alone
      if (el.getAttribute('autocomplete') === 'off') return; // already handled
      el.setAttribute('autocomplete', 'off');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableNonAuthAutofill);
  } else {
    disableNonAuthAutofill();
  }
  // A second pass after full load catches any fields a page's own init script
  // built after DOMContentLoaded; the auth-modal exclusion above keeps the
  // sign-in inputs untouched even though they're injected later.
  window.addEventListener('load', () => setTimeout(disableNonAuthAutofill, 0));
})();

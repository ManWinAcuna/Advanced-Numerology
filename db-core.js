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

// P569 = date of birth (people). P571 = inception (companies, organizations,
// countries, buildings, etc.) - tried as a fallback for non-person entities.
function fetchKeyDate(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      if (!entity || !entity.claims) return null;

      const born = dateFromClaim(entity.claims.P569);
      if (born) return { date: born, kind: 'born' };

      const founded = dateFromClaim(entity.claims.P571);
      if (founded) return { date: founded, kind: 'founded' };

      return null;
    });
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

const INFOBOX_DATE_FIELDS = [
  'established', 'founded', 'opened', 'built', 'broke_ground',
  'inaugurated', 'formed', 'foundation', 'opening',
];

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
  if (best) return best.date;

  for (const field of INFOBOX_DATE_FIELDS) {
    // Capture to end of line, not to the next "|" - infobox param values are
    // almost always one per line, and a value that's itself a template (the
    // common "{{Start date|1968|06|24}}" case) contains its own pipes, which
    // a "stop at any |" capture would truncate mid-template.
    const re = new RegExp(`\\|\\s*${field}[a-z_]*\\s*=\\s*([^\\n]+)`, 'i');
    const match = re.exec(wikitext);
    if (match) {
      const date = parseWikitextDateValue(match[1]);
      if (date) return date;
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
  return fetchWikipediaWikitext(title).then((wikitext) => {
    if (!wikitext) return null;
    const date = extractInfoboxDayDate(wikitext);
    return date ? { date, kind: 'founded' } : null;
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
// projects to ~6.6MB (game picks 2.3 + K signals 1.6 + NRFI 1.4 + totals
// 1.5). Past the cap setItem throws QuotaExceededError, which surfaced as an
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

/* ===================== MLB pitcher-duel markets (NRFI / totals) ===================== */
// Local-only, like the other MLB prediction stores - deliberately NOT in
// CLOUD_SYNC_FIELDS (see the comment there for the Firestore-size lesson).

const MLB_NRFI_PREDICTIONS_KEY = 'numerology_mlb_nrfi_predictions';
const MLB_TOTALS_PREDICTIONS_KEY = 'numerology_mlb_totals_predictions';

function loadMlbNrfiPredictions() {
  try {
    const raw = bigStoreGetItem(MLB_NRFI_PREDICTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveMlbNrfiPredictions(predictions) {
  saveJsonGuarded(MLB_NRFI_PREDICTIONS_KEY, predictions);
}

function loadMlbTotalsPredictions() {
  try {
    const raw = bigStoreGetItem(MLB_TOTALS_PREDICTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveMlbTotalsPredictions(predictions) {
  saveJsonGuarded(MLB_TOTALS_PREDICTIONS_KEY, predictions);
}

// The pitcher-duel signal: both starting pitchers' day scores averaged. A
// high duel means both starters are "on" - quiet bats, so No run in the 1st
// and Under; a low duel means runs. Scores are mirrored around
// MLB_DUEL_NEUTRAL (the observed center of pitcher day scores - see the
// MLB_K_SIGNAL_TIERS calibration note) so the record carries a scoreA/scoreB
// pair shaped exactly like every other prediction: edgeGap, the edge tiers,
// numerologyPickPrice, and the whole betting engine work on it unchanged.
const MLB_DUEL_NEUTRAL = 63;

const MLB_DUEL_MIN_GAP = 5;

const MLB_DUEL_TIERS = [
  { key: 'strong', label: 'Strong Edge', icon: '🔥', min: 22, max: Infinity },
  { key: 'clear', label: 'Clear Edge', icon: '💪', min: 12, max: 22 },
  { key: 'slight', label: 'Slight Edge', icon: '📈', min: MLB_DUEL_MIN_GAP, max: 12 },
  { key: 'none', label: 'No Edge (tossup)', icon: '⚖️', min: 0, max: MLB_DUEL_MIN_GAP },
];

// Run scoring is a property of the whole game, not of one side, so a duel
// record's components are each role averaged ACROSS both teams: both
// starters, both managers, both lineups, and so on. That gives the same
// "which single signal predicts best" test the game picks get, just aimed at
// quiet-vs-loud instead of who wins. pitchers is the existing duel score.
const MLB_DUEL_COMPONENT_KEYS = ['pitchers', 'managers', 'batters', 'catchers', 'pitcherMatchups', 'franchises'];

const MLB_DUEL_COMPONENT_LABELS = {
  pitchers: 'Both Starters (duel)',
  managers: 'Both Managers',
  batters: 'Both Lineups',
  catchers: 'Both Catchers',
  pitcherMatchups: 'Pitcher vs Lineup (both)',
  franchises: 'Both Franchises',
  duel: '⚔️ Duel Score (live)',
};

// Averages the two sides' stored component sets (extractComponents shapes)
// into the game-level set above. A role missing on either side is skipped
// rather than half-counted.
function mlbDuelComponentsFromSides(compHome, compAway) {
  if (!compHome || !compAway) return null;
  const pair = (key) => {
    const a = compHome[key];
    const b = compAway[key];
    if (a == null || b == null) return null;
    return Math.round(((a + b) / 2) * 10) / 10;
  };
  return {
    pitchers: pair('pitcher'),
    managers: pair('manager'),
    batters: pair('batters'),
    catchers: pair('catcher'),
    pitcherMatchups: pair('pitcherMatchup'),
    franchises: pair('franchise'),
  };
}

// kind is 'nrfi' or 'totals'; market is a parseMlbSideMarket() shape whose
// priceA/priceB must already be the PRE-GAME prices (the backfill swaps the
// resolved 1/0 finals out for CLOB history prices before calling this).
// The quiet side (No / Under) gets the duel score itself; the loud side gets
// its mirror, so the favorite flips at the neutral point.
function buildMlbDuelRecord(kind, market, duelScore, gameLabel, gameTimeISO, result, gamePk, duelComponents) {
  const quietIsA = ['no', 'under'].includes(normalizeName(market.outcomeA));
  const d = Math.round(duelScore * 10) / 10;
  const mirrored = Math.round((2 * MLB_DUEL_NEUTRAL - duelScore) * 10) / 10;
  const quietName = quietIsA ? market.outcomeA : market.outcomeB;
  const loudName = quietIsA ? market.outcomeB : market.outcomeA;
  return {
    conditionId: market.conditionId,
    gamePk,
    kind,
    line: market.line != null ? market.line : undefined,
    teamAName: market.outcomeA,
    teamBName: market.outcomeB,
    gameLabel,
    duelScore: d,
    numerologyFavorite: duelScore >= MLB_DUEL_NEUTRAL ? quietName : loudName,
    numerologyScoreA: quietIsA ? d : mirrored,
    numerologyScoreB: quietIsA ? mirrored : d,
    marketPriceA: market.priceA,
    marketPriceB: market.priceB,
    duelComponents: duelComponents || undefined,
    gameTime: gameTimeISO,
    recordedAt: Date.now(),
    result: result || null,
  };
}

// Which side of a duel market a given component score favors, mirrored around
// MLB_DUEL_NEUTRAL exactly like the duel score itself: at or above neutral is
// the quiet side (No run / Under), below it the loud side (Yes / Over).
function mlbDuelSideForScore(score, outcomeA, outcomeB) {
  const quietIsA = ['no', 'under'].includes(normalizeName(outcomeA));
  const quietName = quietIsA ? outcomeA : outcomeB;
  const loudName = quietIsA ? outcomeB : outcomeA;
  return score >= MLB_DUEL_NEUTRAL ? quietName : loudName;
}

// Duel markets resolve from MLB's own final linescore, never from
// Polymarket's outcomePrices: confirmed live that a closed MLB per-game
// market reports a flat ["1","0"] on every market of the event (moneyline,
// nrfi, and all seven totals lines alike) no matter the actual result, so
// trusting it would mark every NRFI "Yes" and every total "Over". The
// linescore is unambiguous and matches how the game picks already resolve.
// outcomeA/outcomeB are the market's own labels ("Yes"/"No", "Over"/"Under")
// so the returned winner always matches what the record stored.

function mlbNrfiResultFromFeed(feed, outcomeA, outcomeB) {
  if (!feed || feed.abstractGameState !== 'Final' || !Number.isFinite(feed.firstInningRuns)) return null;
  const yesIsA = normalizeName(outcomeA) === 'yes';
  const scored = feed.firstInningRuns > 0;
  const yesName = yesIsA ? outcomeA : outcomeB;
  const noName = yesIsA ? outcomeB : outcomeA;
  return { winner: scored ? yesName : noName, draw: false, resolvedAt: Date.now() };
}

function mlbTotalsResultFromFeed(feed, outcomeA, outcomeB, line) {
  if (!feed || feed.abstractGameState !== 'Final' || !Number.isFinite(feed.totalRuns) || !Number.isFinite(line)) return null;
  // Polymarket's lines are always .5 (no push possible), but a whole-number
  // line landing exactly on the total would be a push - treated as a void.
  if (feed.totalRuns === line) return { winner: null, draw: true, resolvedAt: Date.now() };
  const overIsA = normalizeName(outcomeA) === 'over';
  const overName = overIsA ? outcomeA : outcomeB;
  const underName = overIsA ? outcomeB : outcomeA;
  return { winner: feed.totalRuns > line ? overName : underName, draw: false, resolvedAt: Date.now() };
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
const MLB_BACKFILL_WINDOW_OPTIONS = [91, 182, 273, 364];

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
function computeFighterScore(dobDate, matchDate, stadiumDate, stateDate) {
  const day = computeCompatibility(dobDate, matchDate, sportsNumerologyCompat);
  if (!stateDate) {
    return { day, stadium: null, state: null, combined: day.finalScore };
  }
  const state = computeCompatibility(dobDate, stateDate, sportsNumerologyCompat);
  if (!stadiumDate) {
    const combined = Math.round(0.75 * day.finalScore + 0.25 * state.finalScore);
    return { day, stadium: null, state, combined };
  }
  const stadium = computeCompatibility(dobDate, stadiumDate, sportsNumerologyCompat);
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
// Weights v3 - data-chosen, not guessed. The per-component signal table over
// ~1,700 resolved games was unambiguous: the Manager score beat the market by
// +4 points (3.3 standard errors - the only component with real statistical
// support), the Starting Pitcher by +2 (1.7 se, marginal), and every other
// component sat at 0 or below (Batters -1, Catcher 0, Pitcher-vs-Lineup 0,
// Franchise 0 - all inside one standard error of noise). The tell that the
// old weighting was actively wrong: Manager ALONE (+4) beat the Full
// Composite (+1), because 40% of the weight sat on the batter average, a
// noise signal that drowned the one component that works. So Manager leads
// here, Pitcher second, and the unproven components keep only token weight -
// enough that they'd still show up if they ever start predicting, too little
// to dilute. See MLB_WEIGHTS_SINCE for the honest out-of-sample test: these
// numbers were fit to games already played, so their in-sample edge is
// optimistic by construction.
const MLB_ROLE_WEIGHTS = {
  manager: 0.45,
  pitcher: 0.28,
  pitcherMatchup: 0.10, // pitcher's life path vs. the opposing lineup's,
  // averaged across all 9 batters (pitcherVsLineupScore below) - the one
  // place the two teams' numerology actually meets head-to-head, instead of
  // each side only ever being scored against the day/venue.
  catcher: 0.03,
  batter: 0.005, // each of the 8 non-catcher batters (0.04 combined)
  franchise: 0.10, // Backed by a real founding date (MLB_TEAM_FOUNDING_DATES
  // above) for every current team, so it gets the full person-style
  // day/stadium/state blend like everything else. A team missing from that
  // table falls back to a thinner zodiac-year-only score, weighted down
  // instead (franchiseZodiacOnly below) - see computeTeamComposite below.
  franchiseZodiacOnly: 0.03,
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
    parts.push({ key: 'pitcher', role: `SP ${pitcherBd.name}`, weight: MLB_ROLE_WEIGHTS.pitcher, score: computeFighterScore(parseDateInput(pitcherBd.birthDate), matchDate, stadiumDate, stateDate) });

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
    parts.push({ key: isCatcher ? 'catcher' : 'batter', role: `${b.pos} ${bd.name}`, weight, score: computeFighterScore(parseDateInput(bd.birthDate), matchDate, stadiumDate, stateDate) });
  });
  if (teamInfo) {
    const foundingISO = MLB_TEAM_FOUNDING_DATES[teamInfo.id];
    if (foundingISO) {
      // A real founding date (day/month/year, sourced from CUE) - scores
      // exactly like any other entity through computeFighterScore, at full
      // weight, instead of the thinner zodiac-only fallback below.
      const foundingDate = parseDateInput(foundingISO);
      parts.push({ key: 'franchise', role: `Franchise (est. ${foundingISO})`, weight: MLB_ROLE_WEIGHTS.franchise, score: computeFighterScore(foundingDate, matchDate, stadiumDate, stateDate) });
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
    if (bd && bd.birthDate) parts.push({ key: 'manager', role: `Mgr ${bd.name}`, weight: MLB_ROLE_WEIGHTS.manager, score: computeFighterScore(parseDateInput(bd.birthDate), matchDate, stadiumDate, stateDate) });
  }

  if (!parts.length) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
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
// batters at 0.40 exactly reproduces the eight individual 0.05 batter weights
// (0.05 x 8 = 0.40 x their average).
const MLB_ROLE_WEIGHTS_CURRENT = {
  manager: 0.45,
  pitcher: 0.28,
  pitcherMatchup: 0.10,
  franchise: 0.10,
  catcher: 0.03,
  batters: 0.04, // 0.005 x 8 batters
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

// The date the v3 weights went live. A resolved game on or after this had no
// hand in choosing them, so it's a fair out-of-sample test of the model that
// is now actually placing bets.
const MLB_WEIGHTS_SINCE = '2026-07-26';

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

const MLB_WEIGHTS_VERSION_KEY = 'numerology_mlb_weights_version';
const MLB_WEIGHTS_VERSION = 3;

function rescoreMlbPredictionsForWeights() {
  if (Number(localStorage.getItem(MLB_WEIGHTS_VERSION_KEY)) === MLB_WEIGHTS_VERSION) {
    return { alreadyCurrent: true, rescored: 0, skipped: 0, flipped: 0 };
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
const DIMENSION_KEYS = ['day', 'stadium', 'state', 'lifePath', 'dayNum', 'doy', 'zodiac', 'western'];

const DIMENSION_LABELS = {
  day: 'Day anchor (birth ↔ game day)',
  stadium: 'Stadium anchor (birth ↔ venue)',
  state: 'State/region anchor (birth ↔ place)',
  lifePath: 'Life path ↔ life path',
  dayNum: 'Day number ↔ day number',
  doy: 'Day-of-year ↔ day-of-year',
  zodiac: 'Chinese/Vietnamese zodiac',
  western: 'Western sun sign',
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
    western: d.western ? d.western.score : null,
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
  DIMENSION_KEYS.forEach((k) => { out[k] = acc[k].w ? Math.round(acc[k].sum / acc[k].w) : null; });
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
      return { won: normalizeName(p.result.winner) === normalizeName(favName), implied };
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

function isCorrectPick(p) {
  return !!(p.result && !p.result.draw && normalizeName(p.result.winner) === normalizeName(p.numerologyFavorite));
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
    // Rank within the rotation, not a listed position: 'top5' is the five
    // players expected to play the most, which is the closest honest pre-game
    // stand-in for a starting five.
    key: index < 5 ? 'top5' : 'rotation',
    role: `${p.name || 'Player'} (${p.expectedMinutes.toFixed(1)} min)`,
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
const NBA_COMPONENT_KEYS = ['top5', 'rotation', 'franchise'];

const NBA_COMPONENT_LABELS = {
  top5: 'Top 5 by Minutes',
  rotation: 'Rest of Rotation',
  franchise: 'Franchise',
};

function extractNbaComponents(parts) {
  const buckets = { top5: [], rotation: [], franchise: [] };
  (parts || []).forEach((p) => {
    const s = p.score && p.score.combined;
    if (s == null || !(p.key in buckets)) return;
    buckets[p.key].push(s);
  });
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  return {
    top5: avg(buckets.top5),
    rotation: avg(buckets.rotation),
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
const NBA_PACE_COMPONENT_KEYS = ['top5s', 'rotations', 'franchises'];

const NBA_PACE_COMPONENT_LABELS = {
  top5s: 'Both Top 5s',
  rotations: 'Both Rotations',
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
  return { top5s: pair('top5'), rotations: pair('rotation'), franchises: pair('franchise') };
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

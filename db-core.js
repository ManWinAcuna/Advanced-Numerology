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

function fetchWikidataTimezoneQid(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      const claims = entity && entity.claims && entity.claims.P421;
      if (!claims || !claims.length) return null;
      const snak = claims[0].mainsnak;
      return (snak && snak.datavalue && snak.datavalue.value && snak.datavalue.value.id) || null;
    })
    .catch(() => null);
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

function lookupTimezoneForPlace(name) {
  return fetchWikidataId(name).then((qid) => {
    if (!qid) return null;
    return fetchWikidataTimezoneQid(qid).then((tzQid) => {
      if (!tzQid) return null;
      return fetchWikidataEntityLabel(tzQid).then((label) => {
        if (!label) return null;
        return TIMEZONE_LABEL_TO_IANA[label.toLowerCase()] || parseUtcOffsetLabel(label);
      });
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
    const raw = localStorage.getItem(UFC_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveUfcPredictions(predictions) {
  localStorage.setItem(UFC_PREDICTIONS_KEY, JSON.stringify(predictions));
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
    const raw = localStorage.getItem(TENNIS_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveTennisPredictions(predictions) {
  localStorage.setItem(TENNIS_PREDICTIONS_KEY, JSON.stringify(predictions));
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
    const raw = localStorage.getItem(MLB_PREDICTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMlbPredictions(predictions) {
  localStorage.setItem(MLB_PREDICTIONS_KEY, JSON.stringify(predictions));
  cloudPushKey(MLB_PREDICTIONS_KEY);
}

// Auto-populated cache of MLB ballpark founding dates, keyed by venue name -
// same role STADIUMS_KEY/TENNIS_VENUES_KEY play, but nothing here is ever
// manually added through a form. polymarket-mlb.js looks a venue up here
// first and only falls back to the Wikipedia/Wikidata lookup (already built
// for UFC/Tennis venues) on a cache miss, then saves the result here so it's
// a one-time lookup per ballpark rather than once per game.
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
    const raw = localStorage.getItem(MLB_PITCHER_K_SIGNALS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMlbPitcherKSignals(signals) {
  localStorage.setItem(MLB_PITCHER_K_SIGNALS_KEY, JSON.stringify(signals));
  cloudPushKey(MLB_PITCHER_K_SIGNALS_KEY);
}

/* ===================== Shared athlete scoring (fighters/players/MLB roster) ===================== */
// Day 60/Venue 15/Region 25 (or Day 75/Region 25 without a venue) blend -
// used for a single person (or, for MLB, any one entity - a batter, the
// pitcher, the manager, even the franchise itself scored against its
// founding date like a birthdate) against a match date, venue, and region.
// Was duplicated identically in ufc.js and polymarket-ufc.js; hoisted here
// once MLB needed the exact same formula for an 11th-12th time over.
function computeFighterScore(dobDate, matchDate, stadiumDate, stateDate) {
  const day = computeCompatibility(dobDate, matchDate, sportsNumerologyCompat);
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
function initModalTabSwitcher(bodyElementId) {
  const body = document.getElementById(bodyElementId);
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.pm-modal-tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    body.querySelectorAll('.pm-modal-tab').forEach((b) => b.classList.toggle('active', b === btn));
    body.querySelectorAll('.pm-modal-page').forEach((p) => { p.style.display = p.dataset.page === tab ? '' : 'none'; });
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

// MLB team-composite role weights - a starting guess, not doctrine, same
// spirit as REAL_EDGE_MIN_GAP/EDGE_TIERS below: once enough games resolve on
// the Stats page, that per-tier breakdown is what should actually move these
// numbers, not intuition. Batters beyond the catcher are weighted flat
// (decided against batting-order weighting - the real plate-appearance gap
// top-to-bottom is modest, not worth the extra complexity yet).
const MLB_ROLE_WEIGHTS = {
  pitcher: 0.24,
  pitcherMatchup: 0.15, // pitcher's life path vs. the opposing lineup's,
  // averaged across all 9 batters (pitcherVsLineupScore in polymarket-mlb.js) -
  // the one place the two teams' numerology actually meets head-to-head,
  // instead of each side only ever being scored against the day/venue.
  catcher: 0.11,
  batter: 0.05, // each of the 8 non-catcher batters
  franchise: 0.17, // Now backed by a real founding date (MLB_TEAM_FOUNDING_DATES
  // above) for every current team, so it gets the full person-style
  // day/stadium/state blend like everything else - back to its full weight
  // now that the "we only have the year" limitation is gone. A team missing
  // from that table falls back to a thinner zodiac-year-only score, weighted
  // down instead (franchiseZodiacOnly below) - see computeTeamComposite in
  // polymarket-mlb.js.
  franchiseZodiacOnly: 0.05,
  manager: 0.08,
};

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

function edgeGap(p) {
  const a = Number(p.numerologyScoreA);
  const b = Number(p.numerologyScoreB);
  return (Number.isFinite(a) && Number.isFinite(b)) ? Math.abs(a - b) : 0;
}

function edgeTierForGap(gap) {
  return EDGE_TIERS.find((t) => gap >= t.min && gap < t.max) || EDGE_TIERS[EDGE_TIERS.length - 1];
}

function hasRealEdge(p) {
  return edgeGap(p) >= REAL_EDGE_MIN_GAP;
}

// Per-tier win rates - the direct empirical test of the core hypothesis: if
// numerology works, win rate should climb as the gap widens, and the
// tossup tier should sit near 50%.
function computeEdgeTierStats(predictions) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw);

  return EDGE_TIERS.map((tier) => {
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

// Buckets every resolved (non-draw) REAL-EDGE prediction by the numerology
// pick's market price at the time, so "how has a pick like THIS actually
// done" can be checked against a specific odds range. Tossups are excluded
// on purpose - they were never picks, and letting their coin-flip outcomes
// into these numbers would contaminate the risk manager's EV math.
function computeBucketStats(predictions) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw && numerologyPickPrice(p) != null && hasRealEdge(p));

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
  [MLB_PREDICTIONS_KEY]: 'mlbPredictions',
  [MLB_VENUES_KEY]: 'mlbVenues',
  [MLB_PITCHER_K_SIGNALS_KEY]: 'mlbPitcherKSignals',
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

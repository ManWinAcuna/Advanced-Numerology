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

const MONTH_NAMES = [
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
    const month = MONTH_NAMES.indexOf(dmyMatch[2].toLowerCase());
    if (month !== -1) return isoFromParts(dmyMatch[3], month + 1, dmyMatch[1]);
  }

  const mdyMatch = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (mdyMatch) {
    const month = MONTH_NAMES.indexOf(mdyMatch[1].toLowerCase());
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
// international region - falls back to the plain UTC calendar date if no
// timezone is resolvable yet (region not backfilled, or lookup failed).
function localMatchDateISO(gameStartTime, regionMode, region) {
  const zone = regionMode === 'us' ? US_STATE_TIMEZONES[region && region.name] : (region && region.timezone);
  if (zone) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(gameStartTime);
    } catch (e) { /* fall through to plain UTC below */ }
  }
  return `${gameStartTime.getUTCFullYear()}-${String(gameStartTime.getUTCMonth() + 1).padStart(2, '0')}-${String(gameStartTime.getUTCDate()).padStart(2, '0')}`;
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
  const nameA = p.fighterAName || p.playerAName;
  const favA = normalizeName(p.numerologyFavorite) === normalizeName(nameA);
  const price = favA ? p.marketPriceA : p.marketPriceB;
  return Number.isFinite(price) ? price : null;
}

function isCorrectPick(p) {
  return !!(p.result && !p.result.draw && normalizeName(p.result.winner) === normalizeName(p.numerologyFavorite));
}

// Buckets every resolved (non-draw) prediction by the numerology pick's
// market price at the time, so "how has a pick like THIS actually done"
// can be checked against a specific odds range.
function computeBucketStats(predictions) {
  const resolved = predictions.filter((p) => p.result && !p.result.draw && numerologyPickPrice(p) != null);

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

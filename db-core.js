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
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(title)}&format=json&origin=*`;
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

// Looks up a single exact name (no search/disambiguation UI) and resolves
// to { date, kind } or null if nothing usable was found.
function lookupKeyDateByName(name) {
  return fetchWikidataId(name).then((qid) => (qid ? fetchKeyDate(qid) : null));
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
  [CUSTOM_FIGHTERS_KEY]: 'customFighters',
  [FIGHTER_OVERRIDES_KEY]: 'fighterOverrides',
};

function cloudPushKey(storageKey) {
  if (typeof firebase === 'undefined') return;
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

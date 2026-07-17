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
}

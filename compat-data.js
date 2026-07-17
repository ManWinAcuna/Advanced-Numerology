/*
 * Compatibility lookup tables, transcribed from the user's "Compatibility
 * Engine" reference artifact. All three tables are direction-aware
 * (entity -> day) even where the underlying data happens to be symmetric.
 */

const NUMEROLOGY_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 28, 33];

// Row = entity number, Col = day number, values in NUMEROLOGY_KEYS order.
const NUMEROLOGY_TABLE = {
  1: [80, 80, 75, 70, 60, 60, 90, 80, 10, 93, 60, 80, 60],
  2: [80, 60, 80, 65, 60, 75, 60, 85, 10, 60, 60, 80, 60],
  3: [75, 80, 80, 10, 91, 80, 60, 88, 60, 80, 60, 80, 80],
  4: [70, 80, 10, 80, 20, 96, 80, 80, 80, 60, 60, 70, 75],
  5: [60, 60, 91, 20, 85, 10, 80, 80, 80, 75, 20, 60, 85],
  6: [60, 75, 80, 96, 10, 60, 20, 80, 80, 60, 80, 70, 75],
  7: [90, 60, 60, 80, 80, 20, 70, 10, 50, 99, 80, 93, 60],
  8: [80, 85, 88, 80, 80, 80, 10, 30, 60, 60, 85, 86, 90],
  9: [10, 10, 60, 80, 80, 80, 50, 60, 10, 10, 20, 10, 10],
  11: [93, 60, 80, 60, 75, 60, 99, 60, 10, 70, 70, 60, 75],
  22: [60, 60, 60, 60, 20, 80, 80, 85, 20, 70, 70, 70, 65],
  28: [93, 80, 80, 70, 60, 70, 80, 86, 10, 60, 70, 80, 70],
  33: [60, 60, 80, 75, 85, 75, 60, 90, 10, 75, 65, 70, 70],
};

// Karmic 13 has no row/column of its own - it borrows number 4's.
function numerologyLookupKey(n) {
  return n === 13 ? 4 : n;
}

function numerologyCompat(entityNum, dayNum) {
  const row = NUMEROLOGY_TABLE[numerologyLookupKey(entityNum)];
  const colIndex = NUMEROLOGY_KEYS.indexOf(numerologyLookupKey(dayNum));
  return row[colIndex];
}

// Sports Betting-only variant: identical to NUMEROLOGY_TABLE except the
// diagonal (a competitor matched against their own number). Competing under
// your own energy reads as strong here, not weak - own-number matchups sit
// around 70%, except lifepath 9 which stays lower (50%) even under itself.
// Used only by Tennis/UFC; every other compatibility feature in the app
// (Compatibility Calculator, Energy Flow, Calendar, Database, Personal
// Hours) keeps using the regular NUMEROLOGY_TABLE above.
const SPORTS_NUMEROLOGY_TABLE = {
  1: [80, 80, 75, 70, 60, 60, 90, 80, 10, 93, 60, 80, 60],
  2: [80, 70, 80, 65, 60, 75, 60, 85, 10, 60, 60, 80, 60],
  3: [75, 80, 80, 10, 91, 80, 60, 88, 60, 80, 60, 80, 80],
  4: [70, 80, 10, 80, 20, 96, 80, 80, 80, 60, 60, 70, 75],
  5: [60, 60, 91, 20, 85, 10, 80, 80, 80, 75, 20, 60, 85],
  6: [60, 75, 80, 96, 10, 70, 20, 80, 80, 60, 80, 70, 75],
  7: [90, 60, 60, 80, 80, 20, 70, 10, 50, 99, 80, 93, 60],
  8: [80, 85, 88, 80, 80, 80, 10, 70, 60, 60, 85, 86, 90],
  9: [10, 10, 60, 80, 80, 80, 50, 60, 50, 10, 20, 10, 10],
  11: [93, 60, 80, 60, 75, 60, 99, 60, 10, 70, 70, 60, 75],
  22: [60, 60, 60, 60, 20, 80, 80, 85, 20, 70, 70, 70, 65],
  28: [93, 80, 80, 70, 60, 70, 80, 86, 10, 60, 70, 80, 70],
  33: [60, 60, 80, 75, 85, 75, 60, 90, 10, 75, 65, 70, 70],
};

function sportsNumerologyCompat(entityNum, dayNum) {
  const row = SPORTS_NUMEROLOGY_TABLE[numerologyLookupKey(entityNum)];
  const colIndex = NUMEROLOGY_KEYS.indexOf(numerologyLookupKey(dayNum));
  return row[colIndex];
}

const VIETNAMESE_KEYS = ['Rat', 'Ox', 'Tiger', 'Cat', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];

// Row = entity animal, Col = day animal, values in VIETNAMESE_KEYS order.
const VIETNAMESE_TABLE = {
  Rat: [70, 95, 60, 50, 80, 70, 10, 60, 80, 60, 60, 60],
  Ox: [95, 70, 60, 60, 60, 80, 60, 10, 60, 80, 60, 60],
  Tiger: [60, 60, 95, 70, 60, 60, 80, 60, 10, 60, 80, 80],
  Cat: [50, 60, 70, 97, 70, 70, 60, 85, 60, 10, 70, 80],
  Dragon: [80, 60, 60, 70, 80, 80, 60, 50, 100, 60, 10, 60],
  Snake: [70, 80, 60, 70, 80, 80, 70, 70, 60, 96, 70, 10],
  Horse: [10, 60, 80, 60, 60, 70, 80, 87, 60, 60, 98, 60],
  Goat: [60, 10, 60, 85, 50, 70, 87, 80, 60, 60, 60, 93],
  Monkey: [80, 60, 10, 60, 94, 60, 60, 60, 80, 60, 60, 60],
  Rooster: [60, 80, 60, 10, 60, 96, 60, 60, 60, 80, 70, 60],
  Dog: [60, 60, 80, 70, 10, 70, 98, 60, 60, 70, 80, 75],
  Pig: [60, 60, 80, 80, 60, 10, 60, 93, 60, 60, 75, 75],
};

function vietnameseCompat(entityAnimal, dayAnimal) {
  const row = VIETNAMESE_TABLE[entityAnimal];
  const colIndex = VIETNAMESE_KEYS.indexOf(dayAnimal);
  return row[colIndex];
}

const WESTERN_KEYS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

// Row = entity sign, Col = day sign (this table is symmetric, but kept
// direction-aware for consistency with the other two).
const WESTERN_TABLE = {
  Aries: [80, 60, 80, 60, 100, 60, 10, 60, 100, 60, 80, 60],
  Taurus: [60, 80, 60, 60, 60, 100, 60, 10, 60, 100, 60, 80],
  Gemini: [80, 60, 80, 60, 80, 60, 100, 60, 10, 60, 100, 60],
  Cancer: [60, 60, 60, 80, 60, 60, 60, 100, 60, 10, 60, 100],
  Leo: [100, 60, 80, 60, 80, 60, 60, 60, 100, 60, 10, 60],
  Virgo: [60, 100, 60, 60, 60, 80, 60, 60, 60, 100, 60, 10],
  Libra: [10, 60, 100, 60, 60, 60, 80, 60, 100, 60, 100, 60],
  Scorpio: [60, 10, 60, 100, 60, 60, 60, 80, 60, 100, 60, 100],
  Sagittarius: [100, 60, 10, 60, 100, 60, 100, 60, 80, 80, 80, 60],
  Capricorn: [60, 100, 60, 10, 60, 100, 60, 100, 80, 80, 80, 80],
  Aquarius: [80, 60, 100, 60, 10, 60, 100, 60, 80, 80, 80, 60],
  Pisces: [60, 80, 60, 100, 60, 10, 60, 100, 60, 80, 80, 80],
};

function westernCompat(entitySign, daySign) {
  const row = WESTERN_TABLE[entitySign];
  const colIndex = WESTERN_KEYS.indexOf(daySign);
  return row[colIndex];
}

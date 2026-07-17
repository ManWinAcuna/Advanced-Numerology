/*
 * Compatibility scoring engine, per the user's "how to compare numbers" spec.
 * Requires numerology.js (digitSum, getReducedDay, getReducedDayOfYear,
 * getChineseZodiacYear, getChineseMonth, getChineseDaySign, getSunSign) and
 * compat-data.js (numerologyCompat, vietnameseCompat, westernCompat) to be
 * loaded first.
 */

/* ---------- Compatibility Life Path (does not freeze at 28/13, unlike the rest of the app) ---------- */

function masterPairScanSum(str) {
  const pool = [];
  let i = 0;
  while (i < str.length) {
    if (i + 1 < str.length) {
      const two = str.substring(i, i + 2);
      if (two === '11' || two === '22' || two === '33') {
        pool.push(parseInt(two, 10));
        i += 2;
        continue;
      }
    }
    pool.push(parseInt(str.charAt(i), 10));
    i++;
  }
  return pool.reduce((a, b) => a + b, 0);
}

// Each component (month, day, year) is scanned independently for master pairs,
// then summed - a master pair is never allowed to form *across* a month/day/year
// boundary (e.g. month "1" + day "1" from the 16th should never combine into "11").
// The 20th of a month is its own exception (mirrors the main Life Path box):
// landing on day (or month) 20 contributes a master 11 to the pool instead of
// digit-splitting into 2+0. hasTwentyException flags when that happened, the
// same way the sheet-accurate calc tracks it for the "11/2" display.
function compatLifePathCompound(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const yStr = String(date.getFullYear());

  let hasTwentyException = false;

  let monthSum;
  if (month === 20) { monthSum = 11; hasTwentyException = true; }
  else monthSum = masterPairScanSum(String(month));

  let daySum;
  if (day === 20) { daySum = 11; hasTwentyException = true; }
  else daySum = masterPairScanSum(String(day));

  const yearSum = masterPairScanSum(yStr);

  return { compound: monthSum + daySum + yearSum, hasTwentyException };
}

// "2 doesn't exist" - any total that reduces down to a plain 2 is read as an
// 11 instead, matching the same rule already used by the main Life Path box
// and Personal Hours.
function compatReduceLifepath(n) {
  if (n === 11 || n === 22 || n === 33 || n === 13 || n === 28) return n;
  if (n === 2) return 11;
  while (n > 9) {
    n = digitSum(n);
    if (n === 11 || n === 22 || n === 33 || n === 13 || n === 28) return n;
    if (n === 2) return 11;
  }
  return n;
}

function compatLifePath(date) {
  return compatReduceLifepath(compatLifePathCompound(date).compound);
}

// A master Life Path (33/22/13) is only "pure" when the day is a single digit
// or already a master day itself (11/22/33) - i.e. there's no other way to
// add the date up. A double-digit, non-master day (e.g. the 16th) means the
// date could just as easily reduce past the master into its companion digit
// (33->6, 22->4, 13->4), so that companion is used for the compatibility
// lookup instead of the harsher master-vs-master reading. 28 is a fixed stop
// number, not a master - it never splits, always shown/looked-up as plain 28.
function compatLifePathInfo(date) {
  const { compound, hasTwentyException } = compatLifePathCompound(date);
  const masterResult = compatReduceLifepath(compound);
  const day = date.getDate();
  const isDoubleDigitDay = day > 9 && day !== 11 && day !== 22 && day !== 33;

  let lookupValue = masterResult;
  let impure = false;

  if (masterResult === 28) {
    lookupValue = 28;
    impure = false;
  } else if (masterResult === 11 && hasTwentyException) {
    lookupValue = 2;
    impure = true;
  } else if (isDoubleDigitDay && (masterResult === 33 || masterResult === 22 || masterResult === 13)) {
    lookupValue = digitSum(masterResult);
    impure = true;
  }

  return {
    masterResult,
    lookupValue,
    impure,
    display: impure ? `${masterResult}/${lookupValue}` : String(masterResult),
  };
}

/* ---------- Lucky number (compatibility variant: skips every trailing zero) ---------- */

function getCompatLuckyNumber(date) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const firstDigit = String(month).charAt(0);
  const yearStr = String(year);
  let i = yearStr.length - 1;
  while (i > 0 && yearStr.charAt(i) === '0') i--;
  const lastDigit = yearStr.charAt(i);
  const luckyNumber = Number(firstDigit + lastDigit);

  if (luckyNumber === 19) {
    const day = date.getDate();
    return { number: day, digits: String(day).split('').map(Number), usedDayOfBirth: true };
  }
  return { number: luckyNumber, digits: [Number(firstDigit), Number(lastDigit)], usedDayOfBirth: false };
}

// The lucky-number digit pair for anyone born in a given month/year (day doesn't factor in).
function monthYearLuckyDigits(month, year) {
  const firstDigit = String(month).charAt(0);
  const yearStr = String(year);
  let i = yearStr.length - 1;
  while (i > 0 && yearStr.charAt(i) === '0') i--;
  const lastDigit = yearStr.charAt(i);
  return [Number(firstDigit), Number(lastDigit)];
}

// Same digits present, order doesn't matter (72 and 27 are "the same" lucky number).
function sameDigitSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = a.slice().sort();
  const sb = b.slice().sort();
  return sa.every((v, idx) => v === sb[idx]);
}

const ORDINAL_SUFFIX = (n) => {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Checks a person's lucky-number digits against a compared date, per the three bonus rules.
// Each note explains exactly which value triggered it, not just the rule's name. Notes are
// {points, text} pairs (rather than plain strings) so the caller can de-duplicate identical
// facts surfaced from both comparison directions without losing track of their point value -
// e.g. two dates in the same month+year make the "Month" check trivially true both ways,
// which would otherwise double-count the same fact as two separate bonuses.
function luckyNumberBonus(luckyNumber, luckyDigits, comparedDate) {
  const month = comparedDate.getMonth() + 1;
  const monthName = MONTH_NAMES_LONG[month - 1];
  const day = comparedDate.getDate();
  const year = comparedDate.getFullYear();
  const dayOfYear = getDayOfYear(comparedDate);

  const notes = [];

  // Lucky Day: month+day reconstruct the pair (Jan 3rd / Mar 1st for lucky 13), OR the day
  // of month alone equals the two digits combined either way (the 27th of every month for
  // lucky 72/27), whichever direction is a valid calendar day.
  if (luckyDigits.length === 2) {
    const [a, b] = luckyDigits;
    const monthDayMatch = (a === month && b === day) || (b === month && a === day);
    const combinedDayMatch = day === Number(`${a}${b}`) || day === Number(`${b}${a}`);
    if (monthDayMatch) {
      notes.push({ points: 10, text: `Lucky Number Day - ${monthName} ${day} is built from your lucky digits ${a}/${b}` });
    } else if (combinedDayMatch) {
      notes.push({ points: 10, text: `Lucky Number Day - the ${day}${ORDINAL_SUFFIX(day)} matches your lucky digits ${a}/${b} combined` });
    }
  }

  // Lucky Month: anyone born in this compared month+year would share the same lucky digits.
  const monthDigits = monthYearLuckyDigits(month, year);
  if (sameDigitSet(monthDigits, luckyDigits)) {
    notes.push({ points: 5, text: `Lucky Number Month - ${monthName} ${year} shares your lucky digits ${luckyDigits.join('/')}` });
  } else if ((luckyNumber === 11 || luckyNumber === 12) && month === luckyNumber) {
    // A lucky number of 11 or 12 directly names a calendar month (Nov/Dec) -
    // that month is lucky every single year regardless of the year's own
    // digits, since months only run 1-12 and no other lucky number can ever
    // land on a real month this way.
    notes.push({ points: 5, text: `Lucky Number Month - ${monthName} is the ${luckyNumber}th month, matching your lucky number ${luckyNumber}` });
  }

  // X day of the year: day-of-year's digits (zeros stripped) are a permutation of the lucky digits.
  const doyDigits = String(dayOfYear).split('').map(Number).filter((d) => d !== 0).sort();
  const luckyDigitsSorted = luckyDigits.slice().sort();
  const doyMatch = doyDigits.length === luckyDigitsSorted.length
    && doyDigits.every((d, idx) => d === luckyDigitsSorted[idx]);
  if (doyMatch) {
    notes.push({ points: 10, text: `Lucky Number Day-of-Year - ${monthName} ${day} is day ${dayOfYear} of the year, matching your lucky digits ${luckyDigits.join('/')}` });
  }

  return notes;
}

// Runs the lucky-number bonus check in both directions between two dates and
// de-dupes identical facts (two dates in the same month+year make some
// checks trivially true both ways). Shared by every compatibility-style
// score in the app - lucky number should factor in everywhere, not just the
// main Compatibility Calculator.
function computeLuckyBonus(dateA, dateB) {
  const luckyA = getCompatLuckyNumber(dateA);
  const luckyB = getCompatLuckyNumber(dateB);
  const rawNotes = [
    ...luckyNumberBonus(luckyA.number, luckyA.digits, dateB),
    ...luckyNumberBonus(luckyB.number, luckyB.digits, dateA),
  ];
  const seenText = new Set();
  const notes = rawNotes.filter((n) => {
    if (seenText.has(n.text)) return false;
    seenText.add(n.text);
    return true;
  });
  const total = notes.reduce((sum, n) => sum + n.points, 0);
  return { total, notes: notes.map((n) => n.text) };
}

/* ---------- Full scoring ---------- */

function computeCompatibility(entityDate, dayDate, numCompatFn = numerologyCompat) {
  const entityLifePathInfo = compatLifePathInfo(entityDate);
  const dayLifePathInfo = compatLifePathInfo(dayDate);
  const lifePathScore = numCompatFn(entityLifePathInfo.lookupValue, dayLifePathInfo.lookupValue);

  const entityDay = getReducedDay(entityDate);
  const dayDay = getReducedDay(dayDate);
  const dayScore = numCompatFn(entityDay, dayDay);

  const entityDoy = getReducedDayOfYear(entityDate);
  const dayDoy = getReducedDayOfYear(dayDate);
  const doyScore = numCompatFn(entityDoy, dayDoy);

  const numerologyScore = 0.60 * lifePathScore + 0.35 * dayScore + 0.05 * doyScore;

  const entityYearSign = getChineseZodiacYear(entityDate);
  const dayYearSign = getChineseZodiacYear(dayDate);
  const yearScore = vietnameseCompat(entityYearSign, dayYearSign);

  const entityMonthSign = getChineseMonth(entityDate);
  const dayMonthSign = getChineseMonth(dayDate);
  const monthScore = vietnameseCompat(entityMonthSign, dayMonthSign);

  const entityDaySign = getChineseDaySign(entityDate);
  const dayDaySign = getChineseDaySign(dayDate);
  const daySignScore = vietnameseCompat(entityDaySign, dayDaySign);

  const vietnameseScore = 0.60 * yearScore + 0.30 * monthScore + 0.10 * daySignScore;

  const entitySunSign = getSunSign(entityDate);
  const daySunSign = getSunSign(dayDate);
  const westernScore = westernCompat(entitySunSign, daySunSign);

  const baseScore = 0.60 * numerologyScore + 0.30 * vietnameseScore + 0.10 * westernScore;

  const luckyBonus = computeLuckyBonus(entityDate, dayDate);

  const finalScore = Math.min(100, Math.round(baseScore + luckyBonus.total));

  const flags = [];
  if (finalScore < 49) flags.push('clash');
  else if (finalScore >= 85) flags.push('perfect');
  else if (finalScore >= 77) flags.push('ideal');

  return {
    finalScore,
    baseScore: Math.round(baseScore),
    flags,
    numerology: {
      score: Math.round(numerologyScore),
      lifePathScore, dayScore, doyScore,
      entityLifePath: entityLifePathInfo.display,
      dayLifePath: dayLifePathInfo.display,
      entityDay, dayDay, entityDoy, dayDoy,
    },
    vietnamese: {
      score: Math.round(vietnameseScore),
      yearScore, monthScore, daySignScore,
      entityYearSign, dayYearSign, entityMonthSign, dayMonthSign, entityDaySign, dayDaySign,
    },
    western: { score: westernScore, entitySunSign, daySunSign },
    bonuses: luckyBonus,
  };
}

/* ---------- Energy Flow: Personal Year/Month/Day vs Universal Year/Month/Day ---------- */

function computeEnergyFlow(birthDate, today) {
  const rawPY = getPersonalYearRaw(birthDate, today);
  const personalYear = reduceNumber(rawPY);
  const rawPM = getPersonalMonthRaw(birthDate, today);
  const personalMonth = reduceNumber(rawPM);
  const rawPD = getPersonalDayRaw(personalMonth, today);
  const personalDay = reduceNumber(rawPD);

  const universalYear = getUniversalYear(today);
  const universalMonth = getUniversalMonth(today);
  // Universal Day is the Lifepath-style pool of today's own month+day+year
  // digits, purity-checked the same way a birth Lifepath is (e.g. 22/4).
  const universalDayInfo = compatLifePathInfo(today);
  const universalDay = universalDayInfo.lookupValue;
  const universalDayDisplay = universalDayInfo.display;

  const yearScore = numerologyCompat(personalYear, universalYear);
  const monthScore = numerologyCompat(personalMonth, universalMonth);
  const dayScore = numerologyCompat(personalDay, universalDay);
  const numerologyScore = 0.65 * yearScore + 0.25 * monthScore + 0.10 * dayScore;

  const personalYearSign = getChineseZodiacYear(birthDate);
  const universalYearSign = getChineseZodiacYear(today);
  const yearSignScore = vietnameseCompat(personalYearSign, universalYearSign);

  const personalMonthSign = getChineseMonth(birthDate);
  const universalMonthSign = getChineseMonth(today);
  const monthSignScore = vietnameseCompat(personalMonthSign, universalMonthSign);

  const personalDaySign = getChineseDaySign(birthDate);
  const universalDaySign = getChineseDaySign(today);
  const daySignScore = vietnameseCompat(personalDaySign, universalDaySign);

  const vietnameseScore = 0.65 * yearSignScore + 0.25 * monthSignScore + 0.10 * daySignScore;

  const luckyBonus = computeLuckyBonus(birthDate, today);

  const finalScore = Math.min(100, Math.round(0.65 * numerologyScore + 0.35 * vietnameseScore + luckyBonus.total));

  return {
    finalScore,
    numerology: {
      score: Math.round(numerologyScore),
      yearScore, monthScore, dayScore,
      personalYear, universalYear, personalMonth, universalMonth, personalDay,
      universalDay: universalDayDisplay,
    },
    vietnamese: {
      score: Math.round(vietnameseScore),
      yearScore: yearSignScore, monthScore: monthSignScore, daySignScore,
      personalYearSign, universalYearSign, personalMonthSign, universalMonthSign, personalDaySign, universalDaySign,
    },
    bonuses: luckyBonus,
  };
}

/* ---------- Month Outlook: best/worst calendar months for this person ---------- */

// For each evergreen calendar month (Jan-Dec), blends three angles:
//   - Vietnamese Zodiac (45%): the person's own natal Chinese Zodiac Month
//     animal vs that calendar month's animal (Jan=Ox, Feb=Tiger, etc - same
//     mapping the "Months" table emoji uses).
//   - Numerology (35%): Lifepath vs that month's Personal Month, and vs its
//     Universal Month, averaged.
//   - Western Zodiac (20%): the person's natal Sun Sign vs the sign that
//     covers most of that calendar month (day-15 anchor, matching how the
//     Calendar page picks a season's dominant sign).
//   - Lucky Number: same bonus system used everywhere else in the app -
//     a month whose own month+year digits match the person's lucky digits
//     (or is directly named by a lucky number of 11/12) gets a +5% boost.
function computeMonthOutlook(birthDate, monthsTable) {
  const lifePathNum = getLifePathNumeric(birthDate);
  const personMonthSign = getChineseMonth(birthDate);
  const personSunSign = getSunSign(birthDate);
  const personLucky = getCompatLuckyNumber(birthDate);

  const months = monthsTable.map((row) => {
    const personalMonthScore = numerologyCompat(lifePathNum, row.reduced);
    const universalMonthScore = numerologyCompat(lifePathNum, row.universalMonth);
    const numerologyScore = Math.round(0.5 * personalMonthScore + 0.5 * universalMonthScore);

    const vietnameseScore = vietnameseCompat(personMonthSign, row.animal);

    const westernRepSign = getSunSign(new Date(row.cycleYear, row.index - 1, 15));
    const westernScore = westernCompat(personSunSign, westernRepSign);

    const monthDigits = monthYearLuckyDigits(row.index, row.cycleYear);
    const digitMatch = sameDigitSet(monthDigits, personLucky.digits);
    const directMatch = (personLucky.number === 11 || personLucky.number === 12) && row.index === personLucky.number;
    const isLuckyMonth = digitMatch || directMatch;
    const luckyBonus = isLuckyMonth ? 5 : 0;
    let luckyNote = null;
    if (digitMatch) {
      luckyNote = `Lucky Number Month - ${row.name} ${row.cycleYear} shares your lucky digits ${personLucky.digits.join('/')}`;
    } else if (directMatch) {
      luckyNote = `Lucky Number Month - ${row.name} is the ${personLucky.number}th month, matching your lucky number ${personLucky.number}`;
    }

    const finalScore = Math.min(100, Math.round(0.45 * vietnameseScore + 0.35 * numerologyScore + 0.20 * westernScore + luckyBonus));

    return {
      index: row.index, name: row.name, animal: row.animal, cycleYear: row.cycleYear,
      finalScore, numerologyScore, vietnameseScore, westernScore, isLuckyMonth, luckyBonus, luckyNote,
      personalMonthScore, universalMonthScore, personMonthSign, personSunSign,
      personalMonth: row.reduced, universalMonth: row.universalMonth, westernRepSign,
    };
  });

  return months.slice().sort((a, b) => b.finalScore - a.finalScore);
}

/* ===================== Basic helpers ===================== */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function digitSum(value) {
  return String(value)
    .split('')
    .reduce((sum, ch) => {
      const d = Number(ch);
      return isNaN(d) ? sum : sum + d;
    }, 0);
}

// Sheet's inline "reduce" helper (single pass): special-cases the RAW input,
// otherwise sums its digits once and applies the digital-root formula.
// This intentionally does NOT loop / re-check the special table against the
// digit-summed value - that's how the real spreadsheet formula behaves.
function reduceNumber(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '';
  const special = { 28: 28, 39: 3, 19: 1, 20: 11, 11: 11, 22: 22, 33: 33 };
  if (n in special) return special[n];
  const sum = digitSum(n);
  if (sum === 11 || sum === 22 || sum === 33) return sum;
  return ((sum - 1) % 9) + 1;
}

// Script's multi-pass reduction (loops down to a single digit, checking the
// master/28 table at every pass). Used only by GET_FIRST_28TH_DAY_UNIVERSAL_VALUE
// and GET_FIRST_MATCHING_LIFEPATH_DAY_NUMBER, matching the original Apps Script.
function runCustomReduction(n) {
  if (n === 28) return 28;
  if (n === 20) return 11;
  if (n === 2) return 11;
  if (n === 11 || n === 22 || n === 33) return n;
  while (n > 9) {
    n = digitSum(n);
    if (n === 28) return 28;
    if (n === 20) return 11;
    if (n === 2) return 11;
    if (n === 11 || n === 22 || n === 33) break;
  }
  return n;
}

// Master-aware digit value for a 2-digit month/day/year-half string, as used
// throughout the sheet's inline formulas ("11"/"22"/"33" pass through, else sum digits).
function masterAwarePart(str) {
  if (str === '11' || str === '22' || str === '33') return Number(str);
  return digitSum(str);
}

// Whole calendar-day count since epoch, using UTC components so DST transitions
// in the local timezone never shift the result by a day.
function toUTCDays(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function daysBetween(dateA, dateB) {
  return toUTCDays(dateB) - toUTCDays(dateA);
}

function julianDate(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  const day = date.getDate();
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

const ZODIAC_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const CHINESE_ANIMALS = ['Rat', 'Ox', 'Tiger', 'Cat', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];

/* ===================== Planetary signs (astronomy-engine, real geocentric
 * apparent ecliptic longitude - requires astronomy.browser.min.js and
 * astro-engine.js to be loaded first) ===================== */

function getVenusSign(date) {
  return ZODIAC_SIGNS[astroSignIndex(astroEclipticLongitude('Venus', date))];
}

function getSaturnSign(date) {
  return ZODIAC_SIGNS[astroSignIndex(astroEclipticLongitude('Saturn', date))];
}

function getJupiterSign(date) {
  return ZODIAC_SIGNS[astroSignIndex(astroEclipticLongitude('Jupiter', date))];
}

function getSunSign(date) {
  return ZODIAC_SIGNS[astroSignIndex(astroEclipticLongitude('Sun', date))];
}

// Retrograde: apparent geocentric longitude moving backward day over day.
// The Sun is never retrograde (that apparent motion is really Earth's own
// orbit), so only Saturn/Jupiter/Venus are worth checking here.
function getSaturnRetrograde(date) {
  return getAstroBodyInfo('Saturn', date).retrograde;
}

function getJupiterRetrograde(date) {
  return getAstroBodyInfo('Jupiter', date).retrograde;
}

function getVenusRetrograde(date) {
  return getAstroBodyInfo('Venus', date).retrograde;
}

/* ===================== Chinese zodiac ===================== */

function getChineseZodiacYear(date) {
  const year = date.getFullYear();
  const anchorTime = Date.UTC(1970, 1, 6, 7, 13, 0);
  const synodicMonth = 29.530588853 * 24 * 60 * 60 * 1000;
  const aquariusSeasonStart = Date.UTC(year, 0, 20, 0, 0, 0);
  const approximateCycles = Math.round((aquariusSeasonStart - anchorTime) / synodicMonth);
  let lunarNewYearTime = anchorTime + (approximateCycles * synodicMonth);
  if (lunarNewYearTime < aquariusSeasonStart) {
    lunarNewYearTime += synodicMonth;
  }
  let zodiacYear = year;
  if (date.getTime() < lunarNewYearTime) {
    zodiacYear = year - 1;
  }
  let index = (zodiacYear - 1900) % 12;
  if (index < 0) index += 12;
  return CHINESE_ANIMALS[index];
}

const CHINESE_MONTH_SIGNS = {
  1: 'Ox', 2: 'Tiger', 3: 'Cat', 4: 'Dragon', 5: 'Snake', 6: 'Horse',
  7: 'Goat', 8: 'Monkey', 9: 'Rooster', 10: 'Dog', 11: 'Pig', 12: 'Rat',
};

function getChineseMonth(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let activeMonth = month;
  if (day < 7) {
    activeMonth = month - 1;
    if (activeMonth === 0) activeMonth = 12;
  }
  return CHINESE_MONTH_SIGNS[activeMonth];
}

function getChineseDaySign(date) {
  const jdn = Math.floor(julianDate(date) + 0.5);
  let index = (jdn + 1) % 12;
  if (index < 0) index += 12;
  return CHINESE_ANIMALS[index];
}

const CHINESE_ANIMAL_NUMERIC = { Rat: 1, Ox: 2, Tiger: 3, Cat: 4, Dragon: 5, Snake: 6, Horse: 7, Goat: 8, Monkey: 9, Rooster: 10, Dog: 11, Pig: 12 };
const WESTERN_SIGN_NUMERIC = { Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6, Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12 };

/* ===================== Life Path (matches GET_LIFE_PATH exactly) ===================== */

function lifePathBreakdown(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  let pool = [];
  const isDoubleDigitDay = (day > 9 && day !== 11 && day !== 22 && day !== 33);
  let hasTwentyException = false;

  if (month === 11 || month === 22 || month === 33) {
    pool.push(month);
  } else if (month === 20) {
    pool.push(11);
    hasTwentyException = true;
  } else {
    pool = pool.concat(String(month).split('').map(Number));
  }

  if (day === 11 || day === 22 || day === 33) {
    pool.push(day);
  } else if (day === 20) {
    pool.push(11);
    hasTwentyException = true;
  } else {
    pool = pool.concat(String(day).split('').map(Number));
  }

  pool = pool.concat(String(year).split('').map(Number));

  const compound = pool.reduce((a, b) => a + b, 0);

  function finalReduce(n) {
    if (n === 2) return 11;
    if (n === 11 || n === 22 || n === 33) return n;
    while (n > 9) {
      n = digitSum(n);
      if (n === 2) return 11;
      if (n === 11 || n === 22 || n === 33) break;
    }
    return n;
  }

  const result = finalReduce(compound);

  let display;
  if (result === 33) display = isDoubleDigitDay ? '33/6' : '33';
  else if (result === 22) display = isDoubleDigitDay ? '22/4' : '22';
  else if (result === 11) display = hasTwentyException ? '11/2' : '11';
  else display = String(result);

  return { compound, result, display };
}

function getLifePath(date) {
  return lifePathBreakdown(date).display;
}

// Compound (pre-reduction) Life Path total - shown underneath the reduced value.
function getLifePathCompound(date) {
  return lifePathBreakdown(date).compound;
}

// Numeric-only version for downstream arithmetic (Missing, Pinnacle ages, etc.)
function getLifePathNumeric(date) {
  return lifePathBreakdown(date).result;
}

/* ===================== Day Born / Day# (sheet inline versions) ===================== */

function getRawDay(date) {
  return date.getDate();
}

function getReducedDay(date) {
  return reduceNumber(getRawDay(date));
}

function getDayOfYear(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  return daysBetween(startOfYear, date) + 1;
}

function getReducedDayOfYear(date) {
  return reduceNumber(getDayOfYear(date));
}

/* ===================== Combo ===================== */

function getCombo(date) {
  const sunSign = getSunSign(date);
  const zodiacYear = getChineseZodiacYear(date);
  const total = WESTERN_SIGN_NUMERIC[sunSign] + CHINESE_ANIMAL_NUMERIC[zodiacYear];
  if (total === 19) return 1;
  if (total === 20) return 11;
  if (total === 11 || total === 22) return total;
  return digitSum(total);
}

/* ===================== Lucky Number ===================== */

function getLuckyNumber(date) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const firstDigit = String(month).charAt(0);
  const yearStr = String(year);
  // Walk back past every trailing zero, not just one - a year like 2000 has
  // three in a row, and the lucky number can never actually contain a 0.
  let i = yearStr.length - 1;
  while (i > 0 && yearStr.charAt(i) === '0') i--;
  const lastDigit = yearStr.charAt(i);
  const luckyNumber = Number(firstDigit + lastDigit);
  // 19 is never a valid lucky number - fall back to the day of birth instead
  // (a single-digit day is fine here, this is the one case that allows it).
  if (luckyNumber === 19) return date.getDate();
  return luckyNumber;
}

/* ===================== 28 Day / First Imprints (script logic) ===================== */

function getFirst28thDayUniversalValue(date) {
  const birthDay = date.getDate();
  const targetDate = new Date(date.getTime());
  if (birthDay <= 28) {
    targetDate.setDate(28);
  } else {
    targetDate.setDate(28);
    targetDate.setMonth(targetDate.getMonth() + 1);
  }
  const mStr = String(targetDate.getMonth() + 1);
  const dStr = String(targetDate.getDate());
  const yStr = String(targetDate.getFullYear());
  const fullSequence = mStr + dStr + yStr;

  const pool = [];
  let i = 0;
  while (i < fullSequence.length) {
    if (i + 1 < fullSequence.length) {
      const twoDigits = fullSequence.substring(i, i + 2);
      if (twoDigits === '11' || twoDigits === '22' || twoDigits === '33') {
        pool.push(parseInt(twoDigits, 10));
        i += 2;
        continue;
      }
    }
    pool.push(parseInt(fullSequence.charAt(i), 10));
    i++;
  }
  const rawSum = pool.reduce((a, b) => a + b, 0);
  return runCustomReduction(rawSum);
}

function getFirstMatchingLifepathDayNumber(birthDate, targetLP) {
  const targetStr = String(targetLP).trim();
  const searchDate = new Date(birthDate.getTime());

  for (let d = 1; d <= 3652; d++) {
    searchDate.setDate(searchDate.getDate() + 1);
    const mStr = String(searchDate.getMonth() + 1);
    const dStr = String(searchDate.getDate());
    const yStr = String(searchDate.getFullYear());
    const fullSequence = mStr + dStr + yStr;

    const pool = [];
    let i = 0;
    while (i < fullSequence.length) {
      if (i + 1 < fullSequence.length) {
        const twoDigits = fullSequence.substring(i, i + 2);
        if (twoDigits === '11' || twoDigits === '22' || twoDigits === '33') {
          pool.push(parseInt(twoDigits, 10));
          i += 2;
          continue;
        }
      }
      pool.push(parseInt(fullSequence.charAt(i), 10));
      i++;
    }
    const rawSum = pool.reduce((a, b) => a + b, 0);
    const finalResult = String(runCustomReduction(rawSum));

    if (finalResult === targetStr) {
      return searchDate.getDate();
    }
  }
  return 'Not Found';
}

const FIRST_IMPRINT_TARGETS = [1, 11, 3, 4, 5, 6, 7, 8, 9, 22, 33, 28];

/* ===================== Pinnacles ===================== */

function getPinnacles(date) {
  const month2 = pad2(date.getMonth() + 1);
  const day2 = pad2(date.getDate());
  const yearAllDigitsSum = digitSum(String(date.getFullYear()));

  const p1raw = masterAwarePart(month2) + masterAwarePart(day2);
  const p2raw = masterAwarePart(day2) + yearAllDigitsSum;
  const p1 = reduceNumber(p1raw);
  const p2 = reduceNumber(p2raw);
  const p3raw = p1 + p2;
  const p3 = reduceNumber(p3raw);
  const p4raw = masterAwarePart(month2) + yearAllDigitsSum;
  const p4 = reduceNumber(p4raw);

  const lifePathNum = getLifePathNumeric(date);
  const isMasterLP = lifePathNum === 11 || lifePathNum === 22 || lifePathNum === 33;
  const age1 = 36 - (isMasterLP ? digitSum(lifePathNum) : lifePathNum);
  const age2 = age1 + 9;
  const age3 = age2 + 9;

  return {
    values: [p1, p2, p3, p4],
    compounds: [p1raw, p2raw, p3raw, p4raw],
    ages: [age1, age2, age3],
  };
}

/* ===================== Missing numbers ===================== */

function getMissingNumbers(date) {
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const yyyy = String(date.getFullYear());
  const birthDigits = mm + dd + yyyy;

  const lifePathNum = getLifePathNumeric(date);
  const dayBorn = getReducedDay(date);
  const dayNum = getReducedDayOfYear(date);
  const combo = getCombo(date);
  const chineseNumeric = CHINESE_ANIMAL_NUMERIC[getChineseZodiacYear(date)];
  const sunSignNumeric = WESTERN_SIGN_NUMERIC[getSunSign(date)];

  const combinedText = birthDigits + String(lifePathNum) + String(dayBorn) + String(dayNum) + String(combo) + String(chineseNumeric) + String(sunSignNumeric);

  let missing = '';
  for (let n = 1; n <= 9; n++) {
    if (!combinedText.includes(String(n))) missing += String(n);
  }
  return missing;
}

/* ===================== Personal Year / Month / Day + Months table ===================== */

// "Last active birthday year" - the year whose birthday most recently passed (or is today).
function getActiveBirthYear(birthDate, today) {
  const m = birthDate.getMonth() + 1;
  const d = birthDate.getDate();
  const thisYearBday = new Date(today.getFullYear(), m - 1, d);
  return today.getFullYear() - (thisYearBday > today ? 1 : 0);
}

// Raw Personal Year for an explicit "active" birth-cycle year - half-split
// master-aware algorithm (matches the dedicated PY cell).
function personalYearRawForYear(birthDate, activeYear) {
  const mm = pad2(birthDate.getMonth() + 1);
  const dd = pad2(birthDate.getDate());
  const yearStr = String(activeYear).padStart(4, '0');
  const leftHalf = yearStr.slice(0, 2);
  const rightHalf = yearStr.slice(2, 4);
  return masterAwarePart(mm) + masterAwarePart(dd) + masterAwarePart(leftHalf) + masterAwarePart(rightHalf);
}

function getPersonalYearRaw(birthDate, today) {
  return personalYearRawForYear(birthDate, getActiveBirthYear(birthDate, today));
}

// Raw Personal Month - plain full-year digit sum + current-month adjustment (matches its own cell).
function getPersonalMonthRaw(birthDate, today) {
  const mm = pad2(birthDate.getMonth() + 1);
  const dd = pad2(birthDate.getDate());
  const d = birthDate.getDate();
  const activeYear = getActiveBirthYear(birthDate, today);
  const yearDigitsSum = digitSum(String(activeYear));
  const personalYear = masterAwarePart(mm) + masterAwarePart(dd) + yearDigitsSum;
  const currentMonth = (today.getMonth() + 1) + (today.getDate() >= d ? 0 : -1);
  return personalYear + currentMonth;
}

function getPersonalDayRaw(personalMonthReduced, today) {
  const dStr = String(today.getDate());
  const dVal = (dStr === '11' || dStr === '22') ? Number(dStr) : digitSum(dStr);
  return personalMonthReduced + dVal;
}

/* ===================== Universal Year / Month / Day ===================== */

// Universal Year: the calendar year's own digits, reduced (e.g. 2026 -> 10 -> 1).
function getUniversalYear(date) {
  return reduceNumber(date.getFullYear());
}

// Universal Month: Universal Year + the current month number, reduced.
function getUniversalMonth(date) {
  return reduceNumber(getUniversalYear(date) + (date.getMonth() + 1));
}

// Universal Day intentionally lives in compat-engine.js as compatLifePathInfo -
// a specific date's own month+day+year digits are Lifepath-style pooled and
// purity-checked (e.g. July 23 2026 -> 22/4), not a simple Month+day add-on.

function getDaysLeftBlock(birthDate, today) {
  const m = birthDate.getMonth() + 1;
  const d = birthDate.getDate();

  // Days until next yearly birthday
  const thisYearBday = new Date(today.getFullYear(), m - 1, d);
  const nextYearBday = new Date(today.getFullYear() + 1, m - 1, d);
  const nextBday = toUTCDays(thisYearBday) >= toUTCDays(today) ? thisYearBday : nextYearBday;
  const daysUntilBirthday = daysBetween(today, nextBday);

  // Days until next monthly "day" recurrence
  const tDay = today.getDate();
  let targetDate;
  if (d >= tDay) {
    targetDate = new Date(today.getFullYear(), today.getMonth(), d);
  } else {
    targetDate = new Date(today.getFullYear(), today.getMonth() + 1, d);
  }
  const daysUntilMonthlyDay = daysBetween(today, targetDate);

  return { daysUntilBirthday, daysUntilMonthlyDay };
}

// The Personal Year cycle changes ON the birthday, not on Jan 1. So within the
// displayed calendar year, months before the birth month are still under last
// year's cycle, and the birth month onward are under the new one.
function getMonthsTable(birthDate, today) {
  const birthMonth = birthDate.getMonth() + 1;
  const displayYear = today.getFullYear();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((name, idx) => {
    const i = idx + 1;
    const cycleYear = i < birthMonth ? displayYear - 1 : displayYear;
    const rawPY = personalYearRawForYear(birthDate, cycleYear);
    const unreduced = rawPY + i;
    const reduced = reduceNumber(unreduced);
    const universalMonth = getUniversalMonth(new Date(cycleYear, idx, 1));
    const animal = CHINESE_MONTH_SIGNS[i];
    return { name, index: i, unreduced, reduced, universalMonth, animal, cycleYear };
  });
}

/* ===================== Personal Hours ===================== */

// Values that freeze during reduction (stop reducing further). This is a
// standalone rule for Personal Hours only - do not reuse reduceNumber's or
// runCustomReduction's special tables here, they freeze a different set.
const PERSONAL_HOUR_FREEZE = [28, 13, 11, 22, 33];

// 2 never appears on its own - it's treated as the same essence as 11.
function personalHourReduce(n) {
  if (n === 2) return 11;
  if (PERSONAL_HOUR_FREEZE.includes(n)) return n;
  while (n > 9) {
    n = digitSum(n);
    if (n === 2) return 11;
    if (PERSONAL_HOUR_FREEZE.includes(n)) return n;
  }
  return n;
}

function hour24To12(hour24) {
  return ((hour24 + 11) % 12) + 1;
}

function formatHourLabel(hour24, minute) {
  const hour12 = hour24To12(hour24);
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  return `${hour12}:${pad2(minute)} ${ampm}`;
}

// Digit-root of the birth clock time, 12-hour representation (hour + minute).
function getTimeOfBirthRoot(hour24, minute) {
  const raw = digitSum(hour24To12(hour24)) + digitSum(pad2(minute));
  return personalHourReduce(raw);
}

// Digit-root of the birth clock time, 24-hour/military representation. Only
// meaningfully different from the 12-hour root for PM births (hour24 >= 12),
// e.g. 10:30 PM reduces to 4, but 22:30 reduces to 7 - both are tracked.
function getMilitaryTimeOfBirthRoot(hour24, minute) {
  const raw = digitSum(hour24) + digitSum(pad2(minute));
  return personalHourReduce(raw);
}

// 24-row Personal Hours cycle in classic double-hour (shichen) order,
// starting at the Rat hour (11PM-1AM). Every row shares the birth minute;
// each row's value is its root plus its position in the cycle. PM births
// carry a second ("military") root/value in parallel, since the 12-hour and
// 24-hour digit representations of the birth time differ.
function getPersonalHoursTable(hour24, minute) {
  const digitalRoot = getTimeOfBirthRoot(hour24, minute);
  const isPM = hour24 >= 12;
  const militaryRoot = isPM ? getMilitaryTimeOfBirthRoot(hour24, minute) : null;

  const ownIndex = (hour24 + 1) % 24;

  const rows = [];
  for (let i = 0; i < 24; i++) {
    const rowHour24 = (i + 23) % 24;
    const digitalRaw = digitalRoot + i;
    const row = {
      index: i,
      label: formatHourLabel(rowHour24, minute),
      sign: VIETNAMESE_KEYS[Math.floor(i / 2) % 12],
      isOwnHour: i === ownIndex,
      digitalRaw,
      digitalReduced: personalHourReduce(digitalRaw),
    };
    if (isPM) {
      const militaryRaw = militaryRoot + i;
      row.militaryRaw = militaryRaw;
      row.militaryReduced = personalHourReduce(militaryRaw);
    }
    rows.push(row);
  }
  return { digitalRoot, militaryRoot, isPM, ownSign: VIETNAMESE_KEYS[Math.floor(ownIndex / 2) % 12], rows };
}

/* ===================== Orchestrator ===================== */

function computeAll(birthDate, today) {
  const lifePath = getLifePath(birthDate);
  const lifePathCompound = getLifePathCompound(birthDate);
  const dayBornReduced = getReducedDay(birthDate);
  const dayBornRaw = getRawDay(birthDate);
  const dayNumReduced = getReducedDayOfYear(birthDate);
  const dayNumRaw = getDayOfYear(birthDate);
  const combo = getCombo(birthDate);

  const sunSign = getSunSign(birthDate);
  const saturnSign = getSaturnSign(birthDate);
  const jupiterSign = getJupiterSign(birthDate);
  const venusSign = getVenusSign(birthDate);
  const saturnRetro = getSaturnRetrograde(birthDate);
  const jupiterRetro = getJupiterRetrograde(birthDate);
  const venusRetro = getVenusRetrograde(birthDate);

  const chineseYear = getChineseZodiacYear(birthDate);
  const chineseMonth = getChineseMonth(birthDate);
  const chineseDay = getChineseDaySign(birthDate);

  const luckyNumber = getLuckyNumber(birthDate);
  const missing = getMissingNumbers(birthDate);
  const twentyEightDay = getFirst28thDayUniversalValue(birthDate);

  const pinnacles = getPinnacles(birthDate);

  const rawPY = getPersonalYearRaw(birthDate, today);
  const reducedPY = reduceNumber(rawPY);
  const rawPM = getPersonalMonthRaw(birthDate, today);
  const reducedPM = reduceNumber(rawPM);
  const rawPD = getPersonalDayRaw(reducedPM, today);
  const reducedPD = reduceNumber(rawPD);

  const daysLeft = getDaysLeftBlock(birthDate, today);
  const monthsTable = getMonthsTable(birthDate, today);

  const firstImprints = FIRST_IMPRINT_TARGETS.map((target) => ({
    target,
    day: getFirstMatchingLifepathDayNumber(birthDate, target),
  }));

  return {
    lifePath, lifePathCompound, dayBornReduced, dayBornRaw, dayNumReduced, dayNumRaw, combo,
    sunSign, saturnSign, jupiterSign, venusSign,
    saturnRetro, jupiterRetro, venusRetro,
    chineseYear, chineseMonth, chineseDay,
    luckyNumber, missing, twentyEightDay,
    pinnacles,
    py: { raw: rawPY, reduced: reducedPY },
    pm: { raw: rawPM, reduced: reducedPM },
    pd: { raw: rawPD, reduced: reducedPD },
    daysLeft, monthsTable, firstImprints,
  };
}

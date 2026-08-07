/* Imprint Alignment (Boost13, 2026-08-06) - the user's own life's-work theory,
 * worked through 4 real artist case studies (Bruno Mars, Taylor Swift, Bad
 * Bunny, Drake): a person's FIRST-EVER exposure to a themed day (their 28th,
 * their lucky-number day, their own 8/11) permanently imprints a specific
 * Life Path onto that theme for them - and future dates sharing that theme
 * AND that same (or compatible) Life Path carry real resonance, especially
 * for big/financial outcomes.
 *
 * New file - never touches numerology.js/compat-data.js/compat-engine.js.
 * Duplicates the small pieces of their reduction logic it needs (the same
 * digit-pool-with-11/22/33-pairing method getFirst28thDayUniversalValue
 * already uses) rather than editing those files, per the user's own
 * explicit choice this round. Consumes their PUBLIC functions freely
 * (runCustomReduction, numerologyCompat, compatLifePathInfo,
 * getCompatLuckyNumber, luckyNumberBonus, scoreClass).
 */

/* ------------------------------------------ day-of-month -> first LP ---- */
// Generalizes getFirst28thDayUniversalValue (numerology.js) to any day-of-
// month, not just 28. Same semantic: the first calendar occurrence of that
// day-of-month ON OR AFTER birth (so someone born ON the target day gets
// their own birth date back). Days 29-31 don't exist in every month, so
// this walks forward to the first month that actually has enough days.
function getFirstDayOfMonthImprint(birthDate, targetDayOfMonth) {
  const birthDay = birthDate.getDate();
  let year = birthDate.getFullYear();
  let month = birthDate.getMonth();
  if (birthDay > targetDayOfMonth) month += 1;

  let targetDate = null;
  for (let guard = 0; guard < 24; guard++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    if (daysInMonth >= targetDayOfMonth) {
      targetDate = new Date(year, month, targetDayOfMonth);
      break;
    }
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  if (!targetDate) return null;

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
  return { date: targetDate, lp: runCustomReduction(rawSum) };
}

/* ------------------------------------------------- alt lucky number ---- */
// getLuckyNumber()/getCompatLuckyNumber() (numerology.js/compat-engine.js,
// untouched) fall back entirely to day-of-birth when the standard calc
// hits 19. Taylor Swift's own proposed rule, user-confirmed: 19 isn't just
// invalid, it's "not a good energy" - but a SECOND, real lucky number can
// still be recovered by treating the trailing 9 the same way trailing
// zeros already get treated (skip it, keep walking back). For a 1989
// birth year this recovers 18 - a real day multiple of Swift's biggest
// songs land on, alongside the existing day-of-birth (13) fallback.
function getImprintLuckyNumbers(birthDate) {
  const month = birthDate.getMonth() + 1;
  const year = birthDate.getFullYear();
  const firstDigit = String(month).charAt(0);
  const yearStr = String(year);

  let i = yearStr.length - 1;
  while (i > 0 && yearStr.charAt(i) === '0') i--;
  const primaryLastDigit = yearStr.charAt(i);
  const primaryRaw = Number(firstDigit + primaryLastDigit);

  if (primaryRaw !== 19) {
    return {
      primary: primaryRaw,
      primaryDigits: [Number(firstDigit), Number(primaryLastDigit)],
      alt: null, altDigits: null,
      usedDayOfBirth: false,
    };
  }

  // Primary hit the invalid 19 - the app's own getCompatLuckyNumber falls
  // back to day-of-birth entirely; that fallback IS "primary" here too,
  // for consistency with the rest of the app. Alt: keep walking back past
  // the trailing 9 as well, same as a trailing 0.
  let j = i;
  while (j > 0 && (yearStr.charAt(j) === '0' || yearStr.charAt(j) === '9')) j--;
  const altLastDigit = yearStr.charAt(j);
  const altRaw = Number(firstDigit + altLastDigit);
  const day = birthDate.getDate();

  return {
    primary: day,
    primaryDigits: String(day).split('').map(Number),
    alt: altRaw === 19 ? null : altRaw,
    altDigits: altRaw === 19 ? null : [Number(firstDigit), Number(altLastDigit)],
    usedDayOfBirth: true,
  };
}

/* ------------------------------------------------- day-theme imprints -- */
// The 4 day-of-month themes the user's case studies actually use: the
// fixed-stop 28, the two master-adjacent days 8/11, and the person's own
// lucky-number day (only when that number is itself a valid calendar day
// 1-31 - a lucky number like 82 has no "28th"-style literal day to search
// for, so that theme is simply skipped for that person, not guessed at).
function getPersonDayThemeImprints(birthDate) {
  const themes = [
    { key: 'imprint28', label: '28-Day', day: 28 },
    { key: 'imprint8', label: '8-Day', day: 8 },
    { key: 'imprint11', label: '11-Day', day: 11 },
  ];
  const lucky = getImprintLuckyNumbers(birthDate);
  if (lucky.primary >= 1 && lucky.primary <= 31) {
    themes.push({ key: 'imprintLucky', label: `Lucky Day (${lucky.primary})`, day: lucky.primary });
  }
  return themes
    .map((t) => {
      const found = getFirstDayOfMonthImprint(birthDate, t.day);
      return found ? Object.assign({}, t, found) : null;
    })
    .filter(Boolean);
}

/* ---------------------------------------------------- the full score --- */
// Baseline 50 (neutral - no imprint relationship either way), additive
// bonuses only (never a penalty for having no match, same philosophy as
// the lucky-number bonus elsewhere in this app), capped at 100.
//   +15  candidate's own Universal Day LP EXACTLY matches a day-theme's
//        imprinted LP, on a day that literally hits that theme
//   +8   same, but only numerologyCompat-COMPATIBLE (>=77), not exact
//   ...  the existing (now zero-sandwich-aware) lucky-number bonus,
//        reused as-is via luckyNumberBonus() - both the primary AND, when
//        it exists, the alt (9-as-0) lucky number each get checked
//   +10  rare coincidence: the candidate's OWN Universal Day LP's first-
//        ever imprint day (the app's EXISTING "First Imprints" Profile
//        panel, getFirstMatchingLifepathDayNumber) equals the candidate's
//        actual day-of-month
function computeImprintAlignment(personBirthDate, candidateDate) {
  const dayThemes = getPersonDayThemeImprints(personBirthDate);
  const candidateDay = candidateDate.getDate();
  const candidateLP = compatLifePathInfo(candidateDate).lookupValue;

  let score = 50;
  const matches = [];

  dayThemes.forEach((theme) => {
    if (candidateDay !== theme.day) return;
    if (theme.lp === candidateLP) {
      score += 15;
      matches.push({ label: `${theme.label} imprint (${theme.lp}LP)`, text: 'Exact Life Path match', points: 15 });
    } else {
      const c = numerologyCompat(theme.lp, candidateLP);
      if (c >= 77) {
        score += 8;
        matches.push({ label: `${theme.label} imprint (${theme.lp}LP)`, text: `Compatible with today's ${candidateLP}LP (${c})`, points: 8 });
      }
    }
  });

  const seenLuckyText = new Set();
  function addLuckyNotes(luckyNumber, luckyDigits, sourceLabel) {
    if (luckyNumber == null) return;
    luckyNumberBonus(luckyNumber, luckyDigits, candidateDate, 'entity').forEach((n) => {
      if (seenLuckyText.has(n.text)) return;
      seenLuckyText.add(n.text);
      score += n.points;
      matches.push({ label: sourceLabel, text: n.text, points: n.points });
    });
  }
  const lucky = getImprintLuckyNumbers(personBirthDate);
  addLuckyNotes(lucky.primary, lucky.primaryDigits, 'Lucky Number');
  if (lucky.alt != null) addLuckyNotes(lucky.alt, lucky.altDigits, `Alt Lucky Number (${lucky.alt})`);

  const ownImprintDay = getFirstMatchingLifepathDayNumber(personBirthDate, candidateLP);
  if (ownImprintDay === candidateDay) {
    score += 10;
    matches.push({ label: 'Rare Coincidence', text: `Today's day-of-month matches your own first ${candidateLP}LP imprint day`, points: 10 });
  }

  score = Math.min(100, score);
  return { score, tier: scoreClass(score), matches, candidateLP };
}

/* ------------------------------------- person-vs-person alignment ------ */
// computeImprintAlignment (above) is a PERSON-vs-EVENT-DATE read: it only
// fires when the other side's actual day-of-month literally lands on a
// themed day, and it checks that date's own Universal Day LP. That's right
// for a release date (verified against the user's real artist case
// studies) but wrong for a real PERSON, who isn't a single date - they
// carry their own full imprint history (their own 28/8/11/lucky-day
// imprints, plus their own core Life Path) independent of what day-of-
// month their birthday happens to fall on. Confirmed broken live: user
// vs "Tyreese" (7 Life Path, whose first-8-imprint is 11) - Tyreese's LP
// exactly matches the user's own first-28-imprint (7), and his 8-imprint
// (11) is compat-table-compatible with it (99, well past the 77 bar) -
// neither of which the date-based function above can ever see, since it
// never fetches the other side's Life Path or imprint history at all.
//
// Fix: build each person's full set of imprint VALUES (day-theme imprints
// + their own core Life Path, via compatLifePathInfo - the same function
// already used to read a real Life Path elsewhere in this file/app), then
// cross-compare every value on side A against every value on side B - not
// requiring the two themes to match (a 28-imprint can resonate with an
// 8-imprint, exactly like the Tyreese example). Same additive-only, +15
// exact / +8 compatible, cap-at-100 philosophy as every other score in
// this file - user's own call when scoped: more matches should stack, not
// get averaged down, same as the rest of the app's additive bonuses.
function getPersonImprintValues(birthDate) {
  const themes = getPersonDayThemeImprints(birthDate);
  const values = themes.map((t) => ({ label: `${t.label} imprint`, lp: t.lp }));
  values.push({ label: 'Life Path', lp: compatLifePathInfo(birthDate).lookupValue });
  return values;
}

function computeImprintPersonAlignment(personABirthDate, personBBirthDate) {
  const valuesA = getPersonImprintValues(personABirthDate);
  const valuesB = getPersonImprintValues(personBBirthDate);

  let score = 50;
  const matches = [];

  valuesA.forEach((va) => {
    valuesB.forEach((vb) => {
      if (va.lp === vb.lp) {
        score += 15;
        matches.push({ aLabel: va.label, aLp: va.lp, bLabel: vb.label, bLp: vb.lp, points: 15, kind: 'exact' });
      } else {
        const c = numerologyCompat(va.lp, vb.lp);
        if (c >= 77) {
          score += 8;
          matches.push({ aLabel: va.label, aLp: va.lp, bLabel: vb.label, bLp: vb.lp, points: 8, kind: 'compat', compatScore: c });
        }
      }
    });
  });

  score = Math.min(100, score);
  return { score, tier: scoreClass(score), matches };
}

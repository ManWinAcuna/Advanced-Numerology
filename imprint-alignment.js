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

/* ---------------------------------------------------- domain taxonomy -- */
// 2026-08-07 Boost13: the original 4 themes (28/8/11/lucky-day) were built
// assuming "imprint" always means "financial/big-outcome" - true for the
// artist case studies, but the user's real theory tracks different themes
// for different life areas (their own words: "6day imprints are for
// relationships... 8/28 financial"). Every number that drives at least one
// domain (primary or secondary) below.
//
// Numbers CAN and do span multiple domains (user's explicit call) - 8 is
// both Financial and Career, 9 is Relationship(secondary)/Family/Spiritual,
// etc. Relationship is the one domain with a primary/secondary split: only
// 6 can trigger it on its own; 3 and 9 can only reinforce an already-hit 6
// pair, never trigger the domain alone (see computeImprintPersonAlignment).
// 2 is deliberately unassigned - it doesn't carry a domain of its own.
const IMPRINT_DOMAINS = {
  financial: { label: 'Financial', emoji: '💰', numbers: [8, 28] },
  career: { label: 'Career', emoji: '💼', numbers: [1, 4, 8, 22] },
  relationship: { label: 'Relationship', emoji: '❤️', numbers: [6], secondaryNumbers: [3, 9] },
  family: { label: 'Family', emoji: '🏠', numbers: [6, 4, 9] },
  health: { label: 'Health', emoji: '🩺', numbers: [5, 3] },
  spiritual: { label: 'Spiritual', emoji: '✨', numbers: [11, 9, 3, 7, 33] },
};

// The full set of "first imprint day" themes now tracked, up from the
// original 4. 33 isn't a real calendar day (no month has a 33rd) so it's
// excluded here and handled separately via a pure-Life-Path day search
// (getPure33Imprint) instead of a literal day-of-month search.
const IMPRINT_TRACKED_NUMBERS = [1, 3, 4, 5, 6, 7, 8, 9, 11, 22, 28];

function domainsForNumber(n) {
  return Object.keys(IMPRINT_DOMAINS).filter((key) => {
    const d = IMPRINT_DOMAINS[key];
    return d.numbers.includes(n) || (d.secondaryNumbers && d.secondaryNumbers.includes(n));
  });
}

function domainTagHtml(numbers) {
  const keys = [];
  (Array.isArray(numbers) ? numbers : [numbers]).forEach((n) => {
    domainsForNumber(n).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
  });
  return keys.map((k) => `${IMPRINT_DOMAINS[k].emoji} ${IMPRINT_DOMAINS[k].label}`);
}

/* ------------------------------------------------- day-theme imprints -- */
// getFirstMatchingLifepathDayNumber (numerology.js, untouched) already
// walks forward day-by-day from birth looking for a calendar date whose
// full reduction PURE-matches a target Life Path - exactly the mechanic
// needed for 33, which can't be searched as a literal day-of-month. Only
// the LP matters here (it's 33 by construction once found); "Not Found"
// (no pure-33 date within the 10-year search window) means this person
// simply doesn't carry that imprint, same precedent as any other skipped
// theme.
function getPure33Imprint(birthDate) {
  const day = getFirstMatchingLifepathDayNumber(birthDate, 33);
  return day === 'Not Found' ? null : { lp: 33 };
}

// Every domain-relevant number's first-imprint LP, plus the person's own
// core Life Path - treated as just another value in the set, domain-tagged
// through the exact same number-based lookup as everything else (a 6 Life
// Path counts toward Relationship/Family regardless of where it came from).
function getPersonImprintValues(birthDate) {
  const values = [];
  IMPRINT_TRACKED_NUMBERS.forEach((n) => {
    const found = getFirstDayOfMonthImprint(birthDate, n);
    if (found) values.push({ number: n, label: `${n}-Day imprint`, lp: found.lp });
  });
  const pure33 = getPure33Imprint(birthDate);
  if (pure33) values.push({ number: 33, label: '33-Day imprint', lp: pure33.lp });
  // Life Path's domain comes from the person's own first-imprint day for
  // it (the EXISTING Profile "First Imprints" mechanic,
  // getFirstMatchingLifepathDayNumber) - NOT the raw LP number treated as
  // if it were itself a themed day. User's own correction: a 7 Life Path
  // whose first 7LP day was the 28th is a FINANCIAL imprint (28's domain),
  // not Spiritual (7's domain) - the imprint lives on the day it first
  // appeared, not on the number itself.
  const coreLP = compatLifePathInfo(birthDate).lookupValue;
  const ownLPDay = getFirstMatchingLifepathDayNumber(birthDate, coreLP);
  values.push({ number: typeof ownLPDay === 'number' ? ownLPDay : null, label: 'Life Path', lp: coreLP });
  return values;
}

// Same set as above, but keeping the literal calendar "day" field event-
// date mode gates on (candidate's day-of-month must literally hit it). 33
// has no such day, so it's excluded here - it only makes sense in the
// person-vs-person cross-compare, where LPs are compared directly with no
// calendar-day requirement.
function getPersonImprintDayThemes(birthDate) {
  return IMPRINT_TRACKED_NUMBERS.map((n) => {
    const found = getFirstDayOfMonthImprint(birthDate, n);
    return found ? { number: n, label: `${n}-Day`, day: n, lp: found.lp } : null;
  }).filter(Boolean);
}

// The lucky-number-day imprint stays domain-agnostic (2026-08-07 call):
// it isn't a fixed theme number like 6 or 8, it's personal to each person,
// so rather than locking it to one domain it gets checked against whatever
// domain the thing it resonates with belongs to - at boosted weight, since
// a first-imprint lucky number is a stronger signal than an ordinary theme
// (see IMPRINT_LUCKY_EXACT/COMPAT below).
function getPersonLuckyImprintValues(birthDate) {
  const lucky = getImprintLuckyNumbers(birthDate);
  const values = [];
  if (lucky.primary >= 1 && lucky.primary <= 31) {
    const found = getFirstDayOfMonthImprint(birthDate, lucky.primary);
    if (found) values.push({ label: `Lucky Day (${lucky.primary}) imprint`, lp: found.lp });
  }
  if (lucky.alt != null && lucky.alt >= 1 && lucky.alt <= 31) {
    const found = getFirstDayOfMonthImprint(birthDate, lucky.alt);
    if (found) values.push({ label: `Alt Lucky Day (${lucky.alt}) imprint`, lp: found.lp });
  }
  return values;
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
// Every theme match also carries a `domains` tag (2026-08-07) for display -
// this is a person-vs-EVENT-DATE read (a release date, a game day, "today"),
// so the score/weighting itself is untouched by domains; only the label.
function computeImprintAlignment(personBirthDate, candidateDate) {
  const dayThemes = getPersonImprintDayThemes(personBirthDate);
  const candidateDay = candidateDate.getDate();
  const candidateLP = compatLifePathInfo(candidateDate).lookupValue;

  let score = 50;
  const matches = [];

  dayThemes.forEach((theme) => {
    if (candidateDay !== theme.day) return;
    const domains = domainTagHtml(theme.number);
    if (theme.lp === candidateLP) {
      score += 15;
      matches.push({ label: `${theme.label} imprint (${theme.lp}LP)`, text: 'Exact Life Path match', points: 15, domains });
    } else {
      const c = numerologyCompat(theme.lp, candidateLP);
      if (c >= 77) {
        score += 8;
        matches.push({ label: `${theme.label} imprint (${theme.lp}LP)`, text: `Compatible with today's ${candidateLP}LP (${c})`, points: 8, domains });
      }
    }
  });

  // Own Life Path vs the candidate's Universal Day (2026-08-07) - was
  // missing entirely: the simplest, most literal resonance (today matches
  // YOUR own Life Path exactly) never got checked, unlike the day-themes
  // above. No day-of-month gate - unlike a themed day, this can land on
  // any date. Domain-tagged through the person's own first-imprint day for
  // their Life Path (getFirstMatchingLifepathDayNumber), not the raw LP
  // number - a 7 Life Path whose first 7LP day was the 28th reads as
  // Financial (28's domain), not Spiritual (7's domain).
  const personLP = compatLifePathInfo(personBirthDate).lookupValue;
  const ownLPDay = getFirstMatchingLifepathDayNumber(personBirthDate, personLP);
  const lpDomains = typeof ownLPDay === 'number' ? domainTagHtml(ownLPDay) : [];
  if (personLP === candidateLP) {
    score += 15;
    matches.push({ label: `Your Life Path (${personLP}LP)`, text: "Exactly matches today's Universal Day", points: 15, domains: lpDomains });
  } else {
    const c = numerologyCompat(personLP, candidateLP);
    if (c >= 77) {
      score += 8;
      matches.push({ label: `Your Life Path (${personLP}LP)`, text: `Compatible with today's ${candidateLP}LP (${c})`, points: 8, domains: lpDomains });
    }
  }

  const seenLuckyText = new Set();
  function addLuckyNotes(luckyNumber, luckyDigits, sourceLabel) {
    if (luckyNumber == null) return;
    luckyNumberBonus(luckyNumber, luckyDigits, candidateDate, 'entity').forEach((n) => {
      if (seenLuckyText.has(n.text)) return;
      seenLuckyText.add(n.text);
      score += n.points;
      matches.push({ label: sourceLabel, text: n.text, points: n.points, domains: [] });
    });
  }
  const lucky = getImprintLuckyNumbers(personBirthDate);
  addLuckyNotes(lucky.primary, lucky.primaryDigits, 'Lucky Number');
  if (lucky.alt != null) addLuckyNotes(lucky.alt, lucky.altDigits, `Alt Lucky Number (${lucky.alt})`);

  const ownImprintDay = getFirstMatchingLifepathDayNumber(personBirthDate, candidateLP);
  if (ownImprintDay === candidateDay) {
    score += 10;
    matches.push({ label: 'Rare Coincidence', text: `Today's day-of-month matches your own first ${candidateLP}LP imprint day`, points: 10, domains: [] });
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
// carry their own full imprint history independent of what day-of-month
// their birthday happens to fall on. Confirmed broken live: user vs
// "Tyreese" (7 Life Path, whose first-8-imprint is 11) - Tyreese's LP
// exactly matches the user's own first-28-imprint (7), and his 8-imprint
// (11) is compat-table-compatible with it (99) - neither of which the
// date-based function above can ever see.
//
// 2026-08-07 reweigh: the very first version of this (full cross-product,
// every value vs every value, flat additive) scored two essentially random
// people 100/100 - checked against the whole compat table, 45% of all
// possible number pairings already read "compatible", so a handful of
// hits was never actually rare. Domains fix this two ways: (1) a value
// only competes against same-domain values on the other side, not the
// other person's ENTIRE imprint set, and (2) each domain scores by DENSITY
// (weighted hits / max possible for that many pairs), not raw stacking -
// 1 hit out of 6 possible pairs reads very differently than 5 out of 6.
const IMPRINT_PAIR_EXACT = 15;
const IMPRINT_PAIR_COMPAT = 8;
const IMPRINT_SECONDARY_EXACT = 6;
const IMPRINT_SECONDARY_COMPAT = 3;
const IMPRINT_LUCKY_EXACT = 20;
const IMPRINT_LUCKY_COMPAT = 12;

function imprintPairWeight(lpA, lpB, exactPts, compatPts) {
  if (lpA === lpB) return { weight: exactPts, kind: 'exact' };
  const c = numerologyCompat(lpA, lpB);
  if (c >= 77) return { weight: compatPts, kind: 'compat', compatScore: c };
  return null;
}

function computeImprintPersonAlignment(personABirthDate, personBBirthDate) {
  const valuesA = getPersonImprintValues(personABirthDate);
  const valuesB = getPersonImprintValues(personBBirthDate);
  const luckyA = getPersonLuckyImprintValues(personABirthDate);
  const luckyB = getPersonLuckyImprintValues(personBBirthDate);

  const domains = {};

  Object.keys(IMPRINT_DOMAINS).forEach((key) => {
    const domain = IMPRINT_DOMAINS[key];
    const domainValuesA = valuesA.filter((v) => domain.numbers.includes(v.number));
    const domainValuesB = valuesB.filter((v) => domain.numbers.includes(v.number));
    const totalPairs = domainValuesA.length * domainValuesB.length;

    let weightedHits = 0;
    const matches = [];

    domainValuesA.forEach((va) => {
      domainValuesB.forEach((vb) => {
        const r = imprintPairWeight(va.lp, vb.lp, IMPRINT_PAIR_EXACT, IMPRINT_PAIR_COMPAT);
        if (r) {
          weightedHits += r.weight;
          matches.push({ aLabel: va.label, aLp: va.lp, bLabel: vb.label, bLp: vb.lp, points: r.weight, kind: r.kind, compatScore: r.compatScore });
        }
      });
    });

    let score = totalPairs > 0 ? Math.round(50 + 50 * weightedHits / (totalPairs * IMPRINT_PAIR_EXACT)) : 50;

    // Secondary numbers (Relationship's 3/9) only reinforce an already-hit
    // primary pair - they can't put the domain in play on their own.
    if (domain.secondaryNumbers && matches.length > 0) {
      const secA = valuesA.filter((v) => domain.secondaryNumbers.includes(v.number));
      const secB = valuesB.filter((v) => domain.secondaryNumbers.includes(v.number));
      secA.forEach((sa) => {
        secB.forEach((sb) => {
          const r = imprintPairWeight(sa.lp, sb.lp, IMPRINT_SECONDARY_EXACT, IMPRINT_SECONDARY_COMPAT);
          if (r) {
            score += r.weight;
            matches.push({ aLabel: sa.label, aLp: sa.lp, bLabel: sb.label, bLp: sb.lp, points: r.weight, kind: r.kind, compatScore: r.compatScore, secondary: true });
          }
        });
      });
    }

    // Lucky-day imprints are domain-agnostic - checked against this
    // domain's own values at boosted weight, stacked on top of the
    // density score above rather than folded into its denominator.
    luckyA.forEach((lv) => {
      domainValuesB.forEach((ov) => {
        const r = imprintPairWeight(lv.lp, ov.lp, IMPRINT_LUCKY_EXACT, IMPRINT_LUCKY_COMPAT);
        if (r) {
          score += r.weight;
          matches.push({ aLabel: lv.label, aLp: lv.lp, bLabel: ov.label, bLp: ov.lp, points: r.weight, kind: r.kind, compatScore: r.compatScore, lucky: true });
        }
      });
    });
    luckyB.forEach((lv) => {
      domainValuesA.forEach((ov) => {
        const r = imprintPairWeight(lv.lp, ov.lp, IMPRINT_LUCKY_EXACT, IMPRINT_LUCKY_COMPAT);
        if (r) {
          score += r.weight;
          matches.push({ aLabel: ov.label, aLp: ov.lp, bLabel: lv.label, bLp: lv.lp, points: r.weight, kind: r.kind, compatScore: r.compatScore, lucky: true });
        }
      });
    });

    score = Math.min(100, score);
    domains[key] = { label: domain.label, emoji: domain.emoji, score, tier: scoreClass(score), matches };
  });

  const domainScores = Object.keys(domains).map((k) => domains[k].score);
  const overallScore = Math.round(domainScores.reduce((a, b) => a + b, 0) / domainScores.length);

  return { score: overallScore, tier: scoreClass(overallScore), domains };
}

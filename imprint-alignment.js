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

function ordinalSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

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

// Settings-tunable overlay (2026-08-08) - IMPRINT_DOMAINS above stays the
// real default, untouched. getOverrideSection('imprintDomains') holds only
// the domains the user has actually edited from Settings, each a full
// {numbers, secondaryNumbers} replacement for that one domain; anything not
// in there falls through to the default. domainsForNumber/domainTagHtml and
// the person-mode scoring loop are the only two choke points that read
// domain membership, so routing both through this one function is enough to
// make every domain-aware feature in the app override-aware for free.
function getEffectiveImprintDomains() {
  const overrides = (typeof getOverrideSection === 'function') ? getOverrideSection('imprintDomains') : {};
  const merged = {};
  Object.keys(IMPRINT_DOMAINS).forEach((key) => {
    merged[key] = overrides[key]
      ? Object.assign({}, IMPRINT_DOMAINS[key], overrides[key])
      : IMPRINT_DOMAINS[key];
  });
  return merged;
}

function domainsForNumber(n) {
  const domains = getEffectiveImprintDomains();
  return Object.keys(domains).filter((key) => {
    const d = domains[key];
    return d.numbers.includes(n) || (d.secondaryNumbers && d.secondaryNumbers.includes(n));
  });
}

function domainTagHtml(numbers) {
  const domains = getEffectiveImprintDomains();
  const keys = [];
  (Array.isArray(numbers) ? numbers : [numbers]).forEach((n) => {
    domainsForNumber(n).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
  });
  return keys.map((k) => `${domains[k].emoji} ${domains[k].label}`);
}

// Named scoring weights, same Settings-tunable overlay pattern. Defaults
// are the exact values this file has always used - only diverges once the
// user actually edits one from Settings.
const IMPRINT_WEIGHT_DEFAULTS = {
  themeExact: 15, themeCompat: 8, ownFirstImprintDay: 15, rareCoincidence: 10,
  pairExact: 15, pairCompat: 8, secondaryExact: 6, secondaryCompat: 3,
  luckyExact: 20, luckyCompat: 12,
};

function getImprintWeight(name) {
  const overrides = (typeof getOverrideSection === 'function') ? getOverrideSection('imprintWeights') : {};
  return Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : IMPRINT_WEIGHT_DEFAULTS[name];
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

// Which of your OWN themed days (28th, 8th, 11th, etc.) was the FIRST
// (chronologically, by actual date - not by which day-number is smaller)
// to ever produce a given target Life Path. NOT the same as
// getFirstMatchingLifepathDayNumber, which searches every single day 1-31
// and can land on a day that isn't itself a themed number at all (e.g. the
// 10th) - that's not what "imprint" means in this theory. User's own
// clarification: "my first 7 lifepath day imprint is 28" means the
// earliest THEMED day that produced LP 7, so this only searches among the
// already-tracked theme numbers. Returns the theme's own number (e.g. 28)
// so it domain-tags normally, or null if none of the themed days have
// ever produced this LP.
function firstThemedDayForLP(birthDate, targetLP) {
  let best = null;
  IMPRINT_TRACKED_NUMBERS.forEach((n) => {
    const found = getFirstDayOfMonthImprint(birthDate, n);
    if (found && found.lp === targetLP && (!best || found.date < best.date)) {
      best = { number: n, date: found.date };
    }
  });
  return best ? best.number : null;
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
  // Life Path's domain comes from the person's own first THEMED day that
  // ever produced it - NOT the raw LP number treated as if it were itself
  // a themed day. User's own correction: a 7 Life Path whose first 7LP
  // day was the 28th is a FINANCIAL imprint (28's domain), not Spiritual
  // (7's domain) - the imprint lives on the day it first appeared, not on
  // the number itself.
  const coreLP = compatLifePathInfo(birthDate).lookupValue;
  values.push({ number: firstThemedDayForLP(birthDate, coreLP), label: 'Life Path', lp: coreLP });
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
// (see getImprintWeight('luckyExact'/'luckyCompat') below).
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
      const pts = getImprintWeight('themeExact');
      score += pts;
      matches.push({ label: `${theme.label} imprint (${theme.lp}LP)`, text: 'Exact Life Path match', points: pts, domains });
    } else {
      const c = numerologyCompatEffective(theme.lp, candidateLP);
      if (c >= 77) {
        const pts = getImprintWeight('themeCompat');
        score += pts;
        matches.push({ label: `${theme.label} imprint (${theme.lp}LP)`, text: `Compatible with today's ${candidateLP}LP (${c})`, points: pts, domains });
      }
    }
  });

  // Your own first THEMED day for TODAY's specific LP (2026-08-07 fix,
  // corrected twice now: first from comparing against your fixed core LP
  // only, then from using getFirstMatchingLifepathDayNumber - which
  // searches every day 1-31 and can return a day that isn't itself a
  // themed number, like the 10th, instead of a recognizable one like the
  // 28th). firstThemedDayForLP only searches among the already-tracked
  // theme days, so this always resolves to a real themed number when it
  // fires, matching how the user actually thinks about their own imprints.
  const ownThemeForTodaysLP = firstThemedDayForLP(personBirthDate, candidateLP);
  if (ownThemeForTodaysLP != null) {
    const domains = domainTagHtml(ownThemeForTodaysLP);
    const pts = getImprintWeight('ownFirstImprintDay');
    score += pts;
    matches.push({ label: `Your First ${candidateLP}LP Day (${ownThemeForTodaysLP})`, text: `Today's Universal Day is the same Life Path that first imprinted you on your ${ownThemeForTodaysLP}${ordinalSuffix(ownThemeForTodaysLP)}`, points: pts, domains });
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
    const pts = getImprintWeight('rareCoincidence');
    score += pts;
    matches.push({ label: 'Rare Coincidence', text: `Today's day-of-month matches your own first ${candidateLP}LP imprint day`, points: pts, domains: [] });
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
// Point values now come from getImprintWeight() (Settings-tunable overlay,
// defaults in IMPRINT_WEIGHT_DEFAULTS above) - kept as plain numbers only at
// the call sites below, resolved fresh on every call so a Settings edit
// takes effect immediately without needing a page reload.
function imprintPairWeight(lpA, lpB, exactPts, compatPts) {
  if (lpA === lpB) return { weight: exactPts, kind: 'exact' };
  const c = numerologyCompatEffective(lpA, lpB);
  if (c >= 77) return { weight: compatPts, kind: 'compat', compatScore: c };
  return null;
}

function computeImprintPersonAlignment(personABirthDate, personBBirthDate) {
  const valuesA = getPersonImprintValues(personABirthDate);
  const valuesB = getPersonImprintValues(personBBirthDate);
  const luckyA = getPersonLuckyImprintValues(personABirthDate);
  const luckyB = getPersonLuckyImprintValues(personBBirthDate);

  const domains = {};
  const effectiveDomains = getEffectiveImprintDomains();

  Object.keys(effectiveDomains).forEach((key) => {
    const domain = effectiveDomains[key];
    // domainValuesA/B ("anchors") are this side's values whose OWN theme
    // number belongs to this domain. 2026-08-07 fix: an anchor now checks
    // against the OTHER side's FULL value set, not just their own anchors -
    // user's own example: Tyreese's raw Life Path (7, not itself a
    // Financial number) should still be checkable against Manuel's
    // Financial-anchored 28-Day imprint (also 7LP), an exact match. The
    // domain comes from whichever side is anchored, not from both sides
    // independently belonging to it. A pairKey Set stops a pair anchored
    // from both sides from being counted twice.
    const domainValuesA = valuesA.filter((v) => domain.numbers.includes(v.number));
    const domainValuesB = valuesB.filter((v) => domain.numbers.includes(v.number));

    let weightedHits = 0;
    let totalPairs = 0;
    const matches = [];
    const seenPairs = new Set();

    function tryPair(va, vb) {
      const pairKey = va.label + '' + vb.label;
      if (seenPairs.has(pairKey)) return;
      seenPairs.add(pairKey);
      totalPairs++;
      const r = imprintPairWeight(va.lp, vb.lp, getImprintWeight('pairExact'), getImprintWeight('pairCompat'));
      if (r) {
        weightedHits += r.weight;
        matches.push({ aLabel: va.label, aLp: va.lp, bLabel: vb.label, bLp: vb.lp, points: r.weight, kind: r.kind, compatScore: r.compatScore });
      }
    }
    domainValuesA.forEach((va) => valuesB.forEach((vb) => tryPair(va, vb)));
    domainValuesB.forEach((vb) => valuesA.forEach((va) => tryPair(va, vb)));

    let score = totalPairs > 0 ? Math.round(50 + 50 * weightedHits / (totalPairs * getImprintWeight('pairExact'))) : 50;

    // Secondary numbers (Relationship's 3/9) only reinforce an already-hit
    // primary pair - they can't put the domain in play on their own.
    if (domain.secondaryNumbers && matches.length > 0) {
      const secA = valuesA.filter((v) => domain.secondaryNumbers.includes(v.number));
      const secB = valuesB.filter((v) => domain.secondaryNumbers.includes(v.number));
      secA.forEach((sa) => {
        secB.forEach((sb) => {
          const r = imprintPairWeight(sa.lp, sb.lp, getImprintWeight('secondaryExact'), getImprintWeight('secondaryCompat'));
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
        const r = imprintPairWeight(lv.lp, ov.lp, getImprintWeight('luckyExact'), getImprintWeight('luckyCompat'));
        if (r) {
          score += r.weight;
          matches.push({ aLabel: lv.label, aLp: lv.lp, bLabel: ov.label, bLp: ov.lp, points: r.weight, kind: r.kind, compatScore: r.compatScore, lucky: true });
        }
      });
    });
    luckyB.forEach((lv) => {
      domainValuesA.forEach((ov) => {
        const r = imprintPairWeight(lv.lp, ov.lp, getImprintWeight('luckyExact'), getImprintWeight('luckyCompat'));
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

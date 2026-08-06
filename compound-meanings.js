/*
 * Practical compound-number library (Boost13, 2026-08-05/06). The user's
 * own "Compound Numbers in Numerology" PDF gave 30 entries (Driver 1st
 * digit -> Bridge 2nd digit -> Outcome root, each with a Light/Shadow
 * Expression) written in mystical language ("Crown of the Magi", generic
 * "humanitarian calling" for 9s). This file strips that and re-derives the
 * real practical mechanism per root, then extends the same method to
 * compounds the PDF never covered.
 *
 * New file - never touches numerology.js/compat-data.js/compat-engine.js,
 * only consumes their already-public functions/constants (getSunSign,
 * getChineseZodiacYear, WESTERN_SIGN_NUMERIC, CHINESE_ANIMAL_NUMERIC,
 * getPersonalMonthRaw, getPersonalDayRaw, getDayOfYear, reduceNumber,
 * digitSum, compatLifePathCompound). Load this AFTER numerology.js and
 * compat-engine.js on any page that calls into it.
 *
 * Two layers:
 *   1. COMPOUND_CURATED - hand-written entries (the PDF's 30, de-woo'd and
 *      re-derived around the real mechanism per root - Root 9 specifically
 *      reframed around ADAPTATION, not "humanitarian calling", per the
 *      user's correction - plus Root 1, which the PDF never covered).
 *   2. deriveCompoundEntry() - a real generator for any compound not
 *      curated (e.g. 29, 37, 38, 39, 43, or anything a Personal Year/Day-
 *      of-year sum produces outside the curated set), composing driver +
 *      bridge digit meanings with the root's own practical mechanism. Not
 *      a gap-filler lookup - genuinely follows the same Driver->Bridge->
 *      Outcome method the curated entries use, so quality should track the
 *      curated entries rather than reading as generic filler.
 *
 * Pure vs impure master numbers (11/22/33): the app already computes this
 * distinction (lifePathBreakdown()/compatLifePathInfo() in numerology.js/
 * compat-engine.js) - pure is when a total lands on a master directly,
 * impure is when it only gets there via digit-summing reduction or the
 * 20-substitution (see feedback-no-standalone-two memory). The user's own
 * words: impure numbers "switch back and forth depending on what energy
 * they're portraying/harnessing" - and the PDF's own "22/4"/"33/6" entries
 * ARE that impure case already (that's what the slash means). Pure masters
 * defer to the app's own existing short themes (LIFE_PATH_THEMES, db-
 * core.js) rather than inventing new lore for them - deliberately shorter
 * than the impure entries, which carry the user's own PDF's depth.
 *
 * 28 is its own fixed-stop number (reduceNumber() never reduces it past
 * 28, same status as a master, not a Root-1 compound) - kept separate,
 * matches the existing 28 = wealth/expansion framing (project-number-
 * meanings memory).
 *
 * No standalone root 2 anywhere in this file - see feedback-no-standalone-
 * two memory. Any total that would land on 2 is an 11 instead, always.
 */

/* ------------------------------------------------------- digit flavor -- */
// Plain, practical meaning per digit - used both as the Driver (leads with)
// and the Bridge (channeled through) position, since the same underlying
// impulse reads slightly differently depending on which role it's playing.
const COMPOUND_DIGIT_FLAVOR = {
  0: {
    label: 'Amplifier',
    driverGood: 'whatever comes next is dialed all the way up',
    driverBad: 'whatever comes next runs with no brakes',
    bridgeGood: 'and it comes through at full strength',
    bridgeBad: 'and there is nothing left to rein it in',
  },
  1: {
    label: 'Initiative',
    driverGood: 'you lead with your own instinct',
    driverBad: 'you go it alone when you actually needed input',
    bridgeGood: 'backed by real self-direction',
    bridgeBad: 'but self-direction tips into stubbornness',
  },
  2: {
    label: 'Reading people',
    driverGood: 'you start by reading the room',
    driverBad: 'you start by trying to please everyone',
    bridgeGood: 'sharpened by real sensitivity to others',
    bridgeBad: 'but that sensitivity turns into people-pleasing',
  },
  3: {
    label: 'Expression',
    driverGood: 'you lead with your own voice or idea',
    driverBad: 'you lead with more talk than substance',
    bridgeGood: 'given real shape through honest expression',
    bridgeBad: 'but the message gets scattered or overstated on the way out',
  },
  4: {
    label: 'Structure',
    driverGood: 'you lead with discipline and a real plan',
    driverBad: 'you lead with rigid insistence on doing it your way',
    bridgeGood: 'given the structure to actually last',
    bridgeBad: 'but the structure turns into a cage',
  },
  5: {
    label: 'Change',
    driverGood: 'you lead with a calculated risk',
    driverBad: 'you lead with restlessness for its own sake',
    bridgeGood: 'sharpened by a willingness to adapt fast',
    bridgeBad: 'but that willingness tips into recklessness',
  },
  6: {
    label: 'Duty',
    driverGood: 'you lead with real care for the people involved',
    driverBad: 'you lead with obligation instead of choice',
    bridgeGood: 'grounded in genuine responsibility',
    bridgeBad: 'but responsibility curdles into control or self-sacrifice',
  },
  7: {
    label: 'Scrutiny',
    driverGood: 'you lead with a closer, more honest look',
    driverBad: "you lead with suspicion before you've even looked",
    bridgeGood: 'sharpened by real analysis',
    bridgeBad: 'but the analysis turns into isolation or overthinking',
  },
  8: {
    label: 'Execution',
    driverGood: 'you lead with the discipline to actually execute',
    driverBad: 'you lead with an appetite for more than is fair',
    bridgeGood: 'backed by real follow-through',
    bridgeBad: 'but the follow-through tips into overreach',
  },
  9: {
    label: 'Release',
    driverGood: "you lead by letting go of what's already finished",
    driverBad: "you lead by clinging to what's already over",
    bridgeGood: 'eased by a real willingness to adapt',
    bridgeBad: "but the willingness to adapt turns into losing track of the people it's for",
  },
};

/* ------------------------------------------------------ root mechanism -- */
// The REAL practical mechanism per root - not the mystical theme, the actual
// behavioral fork. Used both for the generator's "good day for X" phrasing
// and as a readable summary if a page wants to show it directly.
const COMPOUND_ROOT_MECHANISM = {
  1: { name: 'Initiative & Independence', mechanism: "whether you back your own instinct and go first, or stall out waiting for permission/certainty", domain: 'making the first move' },
  3: { name: 'Expression & Output', mechanism: "whether your impulse gets out into the world clean, or gets stuck/distorted on the way out", domain: 'putting your voice or work out there' },
  4: { name: 'Structure & Discipline', mechanism: "whether effort compounds into something durable, or gets wasted on rigid, joyless grinding", domain: 'building something that lasts' },
  5: { name: 'Change & Risk', mechanism: "whether change gets used strategically, or compulsively", domain: 'a calculated risk or pivot' },
  6: { name: 'Duty & Care', mechanism: "whether caring for others stays reciprocal, or curdles into control or self-sacrifice", domain: 'showing up for someone who matters' },
  7: { name: 'Scrutiny & Depth', mechanism: "whether looking closely gets you to real understanding, or just isolates you further", domain: 'looking closely at something that needs real understanding' },
  8: { name: 'Execution, Money & Authority', mechanism: "whether authority/money is earned and held with integrity, or grabbed, abused, or lost through excess", domain: 'closing a deal or executing on something concrete' },
  9: { name: 'Adaptation', mechanism: "whether you can let go of what's ending and adjust to what's next, or you cling and resist and get dragged", domain: "letting go of what's finished and adapting to what's next" },
};

/* ------------------------------------------------------- curated entries -- */
// De-woo'd rewrite of the user's PDF (30 entries) + Root 1, which the PDF
// never covered (10, 19 - derived the same way; 28 is NOT here, see
// COMPOUND_FIXED_STOP below - it never reduces to 1).
const COMPOUND_CURATED = {
  // Root 1 - derived, not in the PDF
  10: {
    root: 1,
    light: 'Pure "go" energy. Rewards making the first move - no committee, no second-guessing.',
    shadow: 'Going it alone when you actually needed backup. Impulsive, stubborn, deaf to "wait."',
  },
  19: {
    root: 1,
    light: 'A cycle closing out leaves you leaner and more focused - good day to start something new once the old thing is actually finished.',
    shadow: "Bad health. Physically, this is \"you've been running on empty\" - the body billing you for what you pushed through instead of resting. Watch for burnout showing up physically, not just mentally.",
  },

  // Root 3 - Expression & Output
  12: {
    root: 3,
    light: "You lead with your own idea, but shape it WITH other people before putting it out - it lands because it's been tested against real feedback, not just your own head.",
    shadow: 'You cave on your own idea to keep everyone happy, or go quiet rather than risk friction. The message never actually gets said.',
  },
  21: {
    root: 3,
    light: "You read the room first, then step up with your own voice once you know it'll land - confident, well-timed self-promotion that actually works.",
    shadow: 'You get good at performing what people want to hear instead of meaning it. Charm without substance catches up with you.',
  },
  30: {
    root: 3,
    light: "Whatever you'd normally say or make is dialed up today - sharper, more magnetic than usual. Use it, don't waste it on small talk.",
    shadow: "Volume's up with nothing to aim it at. You scatter your best material across ten places, or say something blunt you can't walk back.",
  },

  // Root 4 - Structure & Discipline
  13: {
    root: 4,
    light: 'An idea you actually said out loud turns into something you can build on. Rewards turning talk into a real plan.',
    shadow: 'You get stubborn defending the plan once it exists, or frustrated that building takes longer than talking did.',
  },
  31: {
    root: 4,
    light: "You had the idea, and you're disciplined enough to execute it alone - no committee, no waiting on anyone.",
    shadow: 'You get so protective of doing it your way you refuse help even when you clearly need it. Isolation dressed up as independence.',
  },
  40: {
    root: 4,
    light: "Discipline and follow-through are maxed out. Use it for the boring, unglamorous task you've been putting off - it'll stick.",
    shadow: 'Full autopilot-grind, forgetting there are people in your life. Cold, rigid, all business, nobody home.',
  },

  // Root 5 - Change & Risk
  14: {
    root: 5,
    light: 'You use real limits (budget, plan, deadline) to actually earn the freedom you want, instead of just wanting it. Disciplined risk-taking.',
    shadow: "You get restless with the limits and blow past them - reckless spending, a broken commitment, an impulsive move you can't take back.",
  },
  41: {
    root: 5,
    light: 'You take something rigid or established and modernize it fast, on your own call. Good day to cut through red tape.',
    shadow: 'You break rules just to prove you can, and it costs you stability you actually needed.',
  },
  23: {
    root: 5,
    light: 'Charm is working overtime - people are more receptive than usual, deals and asks land easier. Good day to pitch, negotiate, or ask for a favor.',
    shadow: "You coast on charm instead of doing the actual work. It's a trap the moment you start believing you don't need to try.",
  },
  32: {
    root: 5,
    light: "You're good at saying the right thing to the right person today. Useful for networking, diplomacy, smoothing over a disagreement.",
    shadow: 'You start telling everyone what they want to hear instead of what\'s true. Spread thin, no real position of your own.',
  },

  // Root 6 - Duty & Care
  15: {
    root: 6,
    light: 'Personal magnetism is high and it flows toward the people you actually care about. Good day for romance, generosity, making something beautiful.',
    shadow: "That same magnetism gets used to control someone, or spent on indulgence (spending, image, vanity) instead of the people it's meant for.",
  },
  51: {
    root: 6,
    light: 'You step up fast to protect someone or something under threat. Decisive, protective action that actually fixes the situation.',
    shadow: 'You manufacture a crisis so you have something to fight for, or get controlling with the people you\'re "protecting."',
  },
  24: {
    root: 6,
    light: 'Steady, reliable cooperation pays off. A partnership gets more solid because you both showed up and did the unglamorous work.',
    shadow: 'You avoid a necessary confrontation to keep the peace, and end up enabling a problem instead of fixing it.',
  },
  42: {
    root: 6,
    light: "You're the dependable one today - patient, practical support for people counting on you. It's noticed.",
    shadow: 'You quietly resent carrying everyone else\'s weight, especially if nobody says thank you.',
  },

  // Root 7 - Scrutiny & Depth
  16: {
    root: 7,
    light: 'Something you were overly attached to gets tested today. Let it go instead of fighting it, and you come out with real clarity.',
    shadow: 'You get blindsided because you were too proud or certain to see it coming. A plan collapses, and it stings.',
  },
  25: {
    root: 7,
    light: "You learn something real about a relationship or situation by actually testing it, not theorizing. Lived experience becomes real expertise.",
    shadow: "You overanalyze a relationship until you've talked yourself out of trusting anyone. Suspicion where none was needed.",
  },
  34: {
    root: 7,
    light: 'Creative and analytical work well together today. Good for solving a real, complex problem that needs both a good idea and rigor.',
    shadow: 'You get lost in your own head correcting minor flaws nobody else cares about, and struggle to just say how you feel.',
  },
  52: {
    root: 7,
    light: 'You quietly notice a shift before anyone else does, and it lets you make a smart, well-timed move. Good day for reading a room or a market.',
    shadow: 'You keep your read to yourself and manipulate from behind the scenes instead of being straight with people.',
  },

  // Root 8 - Execution, Money & Authority
  17: {
    root: 8,
    light: "The inner work you've done pays off materially. A day where integrity and competence both cash out - good day to close a deal you believe in.",
    shadow: 'You use whatever credibility you\'ve built to squeeze more than is fair, and forget how you actually got here.',
  },
  26: {
    root: 8,
    light: 'A fair, well-structured partnership pays off financially. Good day to formalize an agreement built on real trust.',
    shadow: "Watch who you're trusting with money today - a bad partner or a shortcut on the paperwork could cost you.",
  },
  35: {
    root: 8,
    light: 'A creative idea is genuinely marketable today. Good day to pitch, launch, or put a price on something you made.',
    shadow: 'You oversell what you can actually deliver, or chase too many ideas at once and burn out before any of them pay off.',
  },
  44: {
    root: 8,
    light: 'Execution is maxed out - you can build or ship something big and durable today if you put in the hours.',
    shadow: 'You treat people, including yourself, as tools instead of humans. Burnout or coldness - all output, no relationship.',
  },

  // Root 9 - Adaptation (re-derived; the PDF called this "humanitarian calling")
  18: {
    root: 9,
    light: "You let go of a material or ego win you were chasing, and something bigger opens up because of it. Good day to release a grudge or a win you don't actually need.",
    shadow: 'Internal conflict between what you want (money/status) and what you know is right - sort that out first, or get burned by someone you trusted.',
  },
  27: {
    root: 9,
    light: 'You can see the bigger pattern in a relationship or situation and adjust your approach accordingly. Wise, well-timed course-correction.',
    shadow: "You get preachy or detached instead of actually engaging. Knowing what should happen isn't the same as helping it happen.",
  },
  36: {
    root: 9,
    light: "You use what you're good at to help something bigger than yourself wrap up cleanly. Good day to close out a project by giving generously of your skill.",
    shadow: 'You take on a burden that was never yours to carry, then feel sorry for yourself when nobody notices.',
  },
  45: {
    root: 9,
    light: 'You adapt a rigid plan into something more flexible that can actually handle change. Good day to future-proof a system.',
    shadow: "Big ideas, no follow-through - you get so attached to the vision you lose track of the actual people it's supposed to help.",
  },
};

/* --------------------------------------------------------- fixed stops -- */
// 28 never reduces further (reduceNumber's own special table) - same
// standing as a master number, but not one of the three. Matches the
// existing 28 = wealth/expansion framing (project-number-meanings memory).
const COMPOUND_FIXED_STOP = {
  28: {
    light: 'Financial execution and personal drive line up - effort actually converts to material gain today.',
    shadow: "Chasing the payoff so hard you cut corners or overextend. The wealth is real, but only if greed doesn't get there first.",
  },
};

/* ---------------------------------------------------------- master numbers -- */
// Pure: defer to the app's own existing short theme (LIFE_PATH_THEMES,
// db-core.js) - deliberately short, not reinventing established lore.
// Impure: the user's own PDF's "22/4"/"33/6" entries, correctly understood
// as the oscillating case (that's what the slash always meant).
const COMPOUND_MASTER_PURE = {
  11: {
    theme: 'Emotional Intensity',
    light: 'Raw intuition running at full strength - trust the gut read.',
    shadow: "That same intensity tips into anxiety or reactivity if you don't ground it.",
  },
  22: {
    theme: 'Master Building',
    light: 'You can see how to build something that outlasts you - use the scale.',
    shadow: 'The scale of what you\'re building becomes genuinely overwhelming.',
  },
  33: {
    theme: 'Influence',
    light: 'What you say or make reaches further than usual - real influence, not just noise.',
    shadow: 'The reach becomes a burden if you start feeling responsible for everyone it touches.',
  },
};
const COMPOUND_MASTER_IMPURE = {
  11: {
    light: "Same base 11 meaning, but it's a borrowed intuition rather than an intrinsic one - runs a touch less stable than a pure 11.",
    shadow: "There's no legitimate root-2 for it to switch into (root 2 doesn't exist), so the instability shows up as raw volatility rather than a clean second identity.",
  },
  22: {
    light: "Some moments you're operating as the grand-scale 22 (building something that outlasts you); other moments you're just a grounded, practical 4 (heads-down on the immediate task) - which one shows up depends on what you're actually engaging with, not a fixed trait.",
    shadow: 'The switch itself is the trap - reaching for 22-scale ambition with only 4-scale bandwidth, or playing small on a day that called for the big vision.',
  },
  33: {
    light: "Oscillates between 33's wide-reach creative/teaching impulse and 6's close-in duty for the people actually in front of you - both real, neither the \"true\" you.",
    shadow: 'Over-committing to the big audience while the people closest to you go unattended, or burying real talent in small domestic duty when the moment called for the bigger reach.',
  },
};

/* -------------------------------------------------------- the generator -- */
// Composes a practical entry for any compound NOT in COMPOUND_CURATED,
// following the same Driver->Bridge->Outcome method by design - not a
// generic filler, a real (if simpler) application of the method above.
function deriveCompoundEntry(driverDigit, bridgeDigit, root) {
  const mech = COMPOUND_ROOT_MECHANISM[root];
  if (!mech) return null;
  const d = COMPOUND_DIGIT_FLAVOR[driverDigit];
  const b = COMPOUND_DIGIT_FLAVOR[bridgeDigit];
  if (!d || !b) return null;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    root,
    light: `${cap(d.driverGood)}, ${b.bridgeGood} - good day for ${mech.domain}.`,
    shadow: `${cap(d.driverBad)}, ${b.bridgeBad}.`,
    generated: true,
  };
}

/* ------------------------------------------------------------ resolution -- */
// Brings a raw total into compound-lookup range (roughly 2-52) with one
// digit-sum pass if needed. Only Day-of-year's raw value (up to 366) ever
// needs this; everything else in this feature already lands in range.
function compoundNormalize(rawTotal) {
  return rawTotal > 52 ? digitSum(rawTotal) : rawTotal;
}

// Resolves a raw total to { compound, root, impure, companion }. impure/
// companion only apply when root is a master (11/22/33) - mirrors the same
// rule already implemented in compatLifePathInfo()/compatReduceLifepath()
// (compat-engine.js), generalized to any raw total rather than just a Life
// Path pool sum. See feedback-no-standalone-two: a bare 2 is always an 11.
function compoundResolve(rawTotal) {
  const compound = compoundNormalize(rawTotal);
  if (compound === 11 || compound === 22 || compound === 33) {
    return { compound, root: compound, impure: rawTotal !== compound, companion: digitSum(compound) };
  }
  if (compound === 28) return { compound, root: 28, impure: false, companion: null };
  if (compound === 20) return { compound, root: 11, impure: true, companion: 2 };
  let n = compound;
  while (n > 9) {
    n = digitSum(n);
    if (n === 11 || n === 22 || n === 33) return { compound, root: n, impure: true, companion: digitSum(n) };
    if (n === 2) return { compound, root: 11, impure: true, companion: 2 };
  }
  return { compound, root: n, impure: false, companion: null };
}

// Life Path gets its OWN resolver instead of compoundResolve() - it already
// has an established pure/impure test (isDoubleDigitDay, based on the BIRTH
// DAY digit) that can disagree with the generic "does the raw total already
// equal 11/22/33" test above. getLifePath(date) already returns the correct
// answer as a display string ("22/4" = impure, "22"/"11"/plain root = pure)
// - this just parses that string instead of re-deriving the rule.
function compoundResolveFromLifePathDisplay(display, compound) {
  if (display.indexOf('/') !== -1) {
    const parts = display.split('/');
    return { compound, root: Number(parts[0]), impure: true, companion: Number(parts[1]) };
  }
  return { compound, root: Number(display), impure: false, companion: null };
}

// The shared content lookup, given an already-resolved { compound, root,
// impure, companion } - used by both compoundEntry() (generic raw totals)
// and the Life Path path (display-string-based resolver above).
// light/shadow are null when compound < 10 (plain single digit - no
// compound flavor exists; caller falls back to whatever generic root-level
// copy the app already shows elsewhere).
function compoundEntryFromResolved(r) {
  if (r.root === 28) {
    const e = COMPOUND_FIXED_STOP[28];
    return Object.assign({}, r, { light: e.light, shadow: e.shadow, flowTag: '28 - the fixed number of wealth', generated: false });
  }

  if (r.root === 11 || r.root === 22 || r.root === 33) {
    const bank = r.impure ? COMPOUND_MASTER_IMPURE : COMPOUND_MASTER_PURE;
    const e = bank[r.root];
    const flowTag = r.impure ? `${r.compound} → ${r.root}/${r.companion}` : `${r.root} (pure)`;
    return Object.assign({}, r, { light: e.light, shadow: e.shadow, flowTag, generated: false });
  }

  if (r.compound < 10) {
    return Object.assign({}, r, { light: null, shadow: null, flowTag: null, generated: false });
  }

  const driver = Math.floor(r.compound / 10);
  const bridge = r.compound % 10;
  const driverFlavor = COMPOUND_DIGIT_FLAVOR[driver];
  const bridgeFlavor = COMPOUND_DIGIT_FLAVOR[bridge];
  const flowTag = (driverFlavor && bridgeFlavor)
    ? (driver === bridge
      ? `${r.compound} - ${driverFlavor.label}, doubled`
      : `${r.compound} - ${driverFlavor.label} → ${bridgeFlavor.label}`)
    : String(r.compound);

  const curated = COMPOUND_CURATED[r.compound];
  if (curated) {
    return Object.assign({}, r, { light: curated.light, shadow: curated.shadow, flowTag, generated: false });
  }

  const derived = deriveCompoundEntry(driver, bridge, r.root);
  if (!derived) {
    return Object.assign({}, r, { light: null, shadow: null, flowTag, generated: false });
  }
  return Object.assign({}, r, { light: derived.light, shadow: derived.shadow, flowTag, generated: true });
}

// The entry point for one number: given a raw total, returns
// { compound, root, impure, companion, light, shadow, flowTag, generated }.
function compoundEntry(rawTotal) {
  return compoundEntryFromResolved(compoundResolve(rawTotal));
}

// The entry point for Life Path specifically - takes getLifePath()'s own
// display string ("22/4", "11", "6"...) rather than a raw total, so pure/
// impure always matches exactly what Core Numbers already shows.
function compoundEntryForLifePath(display, compound) {
  return compoundEntryFromResolved(compoundResolveFromLifePathDisplay(display, compound));
}

/* --------------------------------------------------- raw-value getters -- */
// The 5 numbers that combine into one day's "whole story" (Boost13 round
// 2). Each returns the RAW total before final reduction - the thing
// compoundEntry() actually wants. All consume already-public numerology.js/
// compat-engine.js functions; none of them are edited.

// Universal Day - the exact same raw total universalDayNumber() itself
// reduces (db-core.js), so this stays in lockstep with whatever the rest
// of the app already shows for "today."
function compoundRawUniversalDay(dayDate) {
  return compatLifePathCompound(dayDate).compound;
}

// Energy - the day-of-month IS the compound (no separate raw total exists
// below it); reduceNumber(date.getDate()) is what the app already labels
// "Energy" everywhere.
function compoundRawEnergy(dayDate) {
  return dayDate.getDate();
}

// Personal Day - mirrors exactly how render.js/today.html already compute
// it, just stopping one step earlier (before the final reduceNumber call).
function compoundRawPersonalDay(birthDate, today) {
  const personalMonthReduced = reduceNumber(getPersonalMonthRaw(birthDate, today));
  return getPersonalDayRaw(personalMonthReduced, today);
}

// Combo - getCombo() (numerology.js) never exposes its own pre-reduction
// total, so this recomputes it from the exact same public building blocks
// getCombo itself uses, rather than editing that function to expose it.
function compoundRawCombo(date) {
  const sunSign = getSunSign(date);
  const zodiacYear = getChineseZodiacYear(date);
  return WESTERN_SIGN_NUMERIC[sunSign] + CHINESE_ANIMAL_NUMERIC[zodiacYear];
}

// Day# (day of year) - can run to 366 (three digits); compoundNormalize()
// folds that into lookup range with one digit-sum pass.
function compoundRawDayNum(date) {
  return getDayOfYear(date);
}

/* -------------------------------------------------------------- weaving -- */
// Weaves 1+ ALREADY-RESOLVED numbers into one paragraph. parts: [{ label,
// entry }], in priority order (most narratively important first - caller
// decides the order). Numbers with no compound flavor (plain single digit)
// are dropped. Every number is named, including the lead (round 2 fix -
// an unlabeled lead sentence left the reader unable to tell which of
// their numbers was even talking); every number after the lead gets its
// own full light+shadow treatment too, not just a clipped light line.
// opts.intro (optional): a bridging sentence prepended before the lead,
// so the story reads as going deeper on whatever's already on screen
// rather than a disconnected dump - the caller supplies it because only
// the caller knows what's already showing on its own card.
function weaveResolvedStory(parts, opts) {
  opts = opts || {};
  const withFlavor = parts.filter((p) => p.entry.light);

  if (withFlavor.length === 0) return null;

  // Cap at the 1-2 most relevant, not every number with flavor - a master/
  // impure/28 hit is inherently more notable than an ordinary compound, so
  // those get pulled forward even if they weren't first in the caller's
  // own priority order; otherwise the original order (caller's call) wins.
  const notable = (p) => p.entry.impure || p.entry.root === 28 || [11, 22, 33].includes(p.entry.root);
  const picked = withFlavor.filter(notable).slice(0, 2);
  for (const p of withFlavor) {
    if (picked.length >= 2) break;
    if (!picked.includes(p)) picked.push(p);
  }
  const resolved = picked;

  const lead = resolved[0];
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  let text = opts.intro ? `${opts.intro} ` : '';
  text += `${lead.label}: ${lead.entry.light} ${lead.entry.shadow}`;

  for (let i = 1; i < resolved.length; i++) {
    const other = resolved[i];
    // Same root as something already named = reinforcement, not tension -
    // forcing "wants something else" onto two numbers that actually agree
    // reads as manufactured conflict where there isn't any.
    const agrees = resolved.slice(0, i).some((p) => p.entry.root === other.entry.root);
    // Only the first word (right after the colon) gets lowercased - light
    // and shadow are each already a complete, separately-capitalized
    // sentence, so lowercasing shadow's lead word too broke the sentence
    // boundary ("...beautiful. that same magnetism..." instead of "That").
    text += agrees
      ? ` And ${other.label} doubles down on the same thing: ${lower(other.entry.light)} ${other.entry.shadow}`
      : ` But ${other.label} wants something else: ${lower(other.entry.light)} ${other.entry.shadow}`;
  }

  return { text, parts: resolved };
}

// Convenience wrapper for callers that only have raw totals (Today page's
// Universal Day/Energy/Personal Day/Combo/Day# - none of which need the
// Life-Path-style display-string resolver). parts: [{ label, raw }].
function weaveCompoundStory(parts, opts) {
  return weaveResolvedStory(parts.map((p) => ({ label: p.label, entry: compoundEntry(p.raw) })), opts);
}

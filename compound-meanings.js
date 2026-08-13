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
    shadow: 'That instability tips into raw emotional volatility - reactive decisions, mood driving the moment instead of clear judgment.',
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
// digits: the compound's FULL digit sequence (e.g. 219 -> [2,1,9], not
// collapsed down to 2 digits first) - the first digit is the Driver, every
// digit after it is a Bridge, chained in order. A triple-digit compound
// (Day-of-year runs up to 366) gets the same real treatment as a 2-digit
// one, not silently reduced away before it ever gets a definition.
function deriveCompoundEntry(digits, root) {
  const mech = COMPOUND_ROOT_MECHANISM[root];
  if (!mech) return null;
  const flavors = digits.map((d) => COMPOUND_DIGIT_FLAVOR[d]);
  if (flavors.some((f) => !f)) return null;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // A bridge digit identical to the one right before it (366 -> 3,6,6)
  // would otherwise repeat the exact same clause twice back to back -
  // reads like a copy-paste error, not emphasis. Dropped from the prose;
  // the flow tag still shows the honest repeated digit.
  const bridgeDigits = digits.slice(1).filter((d, i) => d !== digits[i]);
  const lightChain = [cap(flavors[0].driverGood)].concat(bridgeDigits.map((d) => COMPOUND_DIGIT_FLAVOR[d].bridgeGood));
  const shadowChain = [cap(flavors[0].driverBad)].concat(bridgeDigits.map((d) => COMPOUND_DIGIT_FLAVOR[d].bridgeBad));
  return {
    root,
    light: `${lightChain.join(', ')} - good day for ${mech.domain}.`,
    shadow: `${shadowChain.join(', ')}.`,
    generated: true,
  };
}

// Resolves a raw total to { compound, root, impure, companion }. The raw
// total IS the compound, whatever its digit count - a triple-digit total
// (Day-of-year runs up to 366) never gets pre-collapsed before it's given
// its own definition; the reduction loop below already handles any size.
// impure/companion only apply when root is a master (11/22/33) - mirrors
// the same rule already implemented in compatLifePathInfo()/
// compatReduceLifepath() (compat-engine.js), generalized to any raw total
// rather than just a Life Path pool sum. See feedback-no-standalone-two:
// a bare 2 is always an 11.
function compoundResolve(rawTotal) {
  const compound = rawTotal;
  // The raw total IS the master directly - always pure, no reduction happened.
  if (compound === 11 || compound === 22 || compound === 33) {
    return { compound, root: compound, impure: false, companion: digitSum(compound) };
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

  // A single-digit total (day-of-month 1-9, or day-of-year 1-9) has no
  // bigger number hiding underneath it at all - that's real information
  // ("today is exactly what it looks like"), not nothing, so it still
  // gets a note rather than silently vanishing from the story.
  if (r.compound < 10) {
    return Object.assign({}, r, {
      light: null, shadow: null, flowTag: null, generated: false, flat: true,
      note: `Just a plain ${r.compound} today - no bigger number hiding underneath it, nothing else to reveal.`,
    });
  }

  // Full digit sequence, not just the first two - a triple-digit compound
  // (Day-of-year runs up to 366) gets its own real chain, not silently
  // collapsed to 2 digits before it ever gets a definition.
  const digits = String(r.compound).split('').map(Number);
  const flavors = digits.map((d) => COMPOUND_DIGIT_FLAVOR[d]);
  const allSameDigit = digits.every((d) => d === digits[0]);
  const flowTag = flavors.every((f) => f)
    ? (allSameDigit
      ? `${r.compound} - ${flavors[0].label}, doubled`
      : `${r.compound} - ${flavors.map((f) => f.label).join(' → ')}`)
    : String(r.compound);

  // Curated entries are all 2-digit (matching the source PDF), so a
  // triple-digit compound never matches here - it always goes through the
  // generator below instead, same method, just chained across more digits.
  const curated = COMPOUND_CURATED[r.compound];
  if (curated) {
    return Object.assign({}, r, { light: curated.light, shadow: curated.shadow, flowTag, generated: false });
  }

  const derived = deriveCompoundEntry(digits, r.root);
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
// Weaves ALREADY-RESOLVED numbers into one paragraph. parts: [{ label,
// entry }], in the exact order the caller wants them to appear - every
// number with real compound flavor gets included, none get cherry-picked
// out (round 3 fix: the old "pick the 1-2 most notable" cap actively
// dropped Universal Day - the headline number on the card - in favor of
// a more "interesting" master/impure number buried further down the
// list, which defeated the entire point: the reader couldn't find out
// what THEIR OWN number's compound meant). Numbers with no compound
// flavor at all (a plain single digit) are still dropped - there's
// nothing this file can add there that the page's own root-level content
// doesn't already say. Every number is named, including the lead, and
// every number gets its own full light+shadow treatment, not a clipped
// line. opts.intro (optional): a bridging sentence prepended before the
// lead, so the story reads as going deeper on whatever's already on
// screen rather than a disconnected dump - the caller supplies it because
// only the caller knows what's already showing on its own card.
function weaveResolvedStory(parts, opts) {
  opts = opts || {};
  const resolved = parts.filter((p) => p.entry.light);

  if (resolved.length === 0) return null;

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

// The Profile/Calculator counterpart to weaveResolvedStory above (2026-08-
// 07 fix) - weaves composeIdentitySentence's "you" voice (already used by
// the individual number tap popups, IDENTITY_SLOTS) instead of the day-
// voice compound entry copy ("Good day for X"), which read wrong for a
// person's own static numbers (user: "it's not a day it's a person").
// items: [{ label, entry, slot }].
//
// 2026-08-08 fix: entry.flat ("no bigger compound hiding underneath a
// plain single digit") used to skip the number entirely here, same as it
// correctly does for the day-voice weave above - but that's the WRONG
// rule for identity voice. composeIdentitySentence only ever needs the
// ROOT (COMPOUND_ROOT_IMAGES/identityClauses, both root-keyed), which a
// flat entry still has - flat only means "no 2-digit compound flavor to
// layer on top," never "no identity." User's real example (01/03/2003:
// Life Path 9, Day Born 3, Day# 3 all flat, Combo 8 the only non-flat one)
// used to read as one lone Combo sentence plus a parenthetical listing the
// other 3 as "nothing to add" - now every number gets woven in like the
// user's own reference case (04/15/1994, where none happened to be flat),
// matching the ask: "the mini reading is how all the energies play
// together." skippedLabels is now just a defensive fallback for the
// (should never happen in practice) case a root has no identity coverage
// at all, not a routine path.
function weaveIdentityStory(items, opts) {
  opts = opts || {};
  const resolved = [];
  const skippedLabels = [];
  items.forEach(({ label, entry, slot }) => {
    if (!entry) return;
    const sentence = composeIdentitySentence(entry, slot);
    if (sentence) resolved.push({ label, entry, sentence });
    else skippedLabels.push(label);
  });

  if (resolved.length === 0 && skippedLabels.length === 0) return null;

  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  let text = opts.intro ? `${opts.intro} ` : '';

  if (resolved.length === 0) {
    const verb = skippedLabels.length === 1 ? 'is' : 'are';
    text += `${skippedLabels.join(', ')} ${verb} not resolving right now - nothing to unpack there.`;
    return { text, parts: [] };
  }

  const lead = resolved[0];
  text += `${lead.label}: ${lead.sentence.light} ${lead.sentence.shadow}`;
  const seenRoots = { [lead.entry.root]: lead.label };

  for (let i = 1; i < resolved.length; i++) {
    const other = resolved[i];
    const prior = seenRoots[other.entry.root];
    // Same-root repeat (2026-08-07 fix): identityClauses() is keyed by
    // ROOT, not by the specific compound - two different numbers sharing a
    // root get near-identical good/bad clause text (only the rotating
    // image differs), so weaveResolvedStory's "doubles down on the same
    // thing: [restate the clause]" pattern read as the same sentence said
    // twice. A short stack note (same wording buildIdentityRows already
    // uses for this exact case) says it once instead of repeating it.
    if (prior) {
      const themeLower = rootThemeName(other.entry.root).toLowerCase();
      text += ` ${other.label} stacks the same ${themeLower} current as ${prior} - not incidental, just louder for it.`;
    } else {
      text += ` But ${other.label} wants something else: ${lower(other.sentence.light)} ${other.sentence.shadow}`;
      seenRoots[other.entry.root] = other.label;
    }
  }

  if (skippedLabels.length) {
    const verb = skippedLabels.length === 1 ? 'is' : 'are';
    text += ` (${skippedLabels.join(', ')} ${verb} not resolving right now - nothing else to add there.)`;
  }

  return { text, parts: resolved };
}

/* -------------------------------------------------- light/shadow split -- */
// Today's redesign (round 4, 2026-08-06): instead of one woven paragraph,
// Light and Shadow become their own separate listings (one row per
// number, all numbers always included - same no-cherry-picking rule as
// weaveResolvedStory), plus a single closing sentence summarizing how the
// numbers relate. parts: [{ label, entry }]. opts.intro: same bridging
// sentence as weaveResolvedStory.
function buildLightShadowStory(parts, opts) {
  opts = opts || {};
  const resolved = parts.filter((p) => p.entry.light);
  const flat = parts.filter((p) => p.entry.flat);
  if (resolved.length === 0 && flat.length === 0) return null;

  // Flat notes ("nothing to reveal") aren't Light- or Shadow-specific, so
  // they're folded into BOTH lists, in their original position - visible
  // whichever toggle you open (Energy still lands in its proper 2nd slot
  // whether it's flat or has a real compound), invisible when neither
  // toggle is open. Round 7 fix: they used to float between the collapsed
  // toggles and the summary, showing even with nothing expanded.
  const lightRows = [];
  const shadowRows = [];
  parts.forEach((p) => {
    if (p.entry.light) {
      lightRows.push({ label: p.label, text: p.entry.light });
      shadowRows.push({ label: p.label, text: p.entry.shadow });
    } else if (p.entry.flat) {
      lightRows.push({ label: p.label, text: p.entry.note, flat: true });
      shadowRows.push({ label: p.label, text: p.entry.note, flat: true });
    }
  });

  return {
    intro: opts.intro || '',
    lightRows,
    shadowRows,
    summary: resolved.length ? summarizeInteraction(resolved) : null,
    parts: resolved,
  };
}

// Shared root -> plain theme name, used for both the interaction summary
// below and the pair generator further down.
function rootThemeName(root) {
  if (root === 28) return 'Wealth';
  if (COMPOUND_MASTER_PURE[root]) return COMPOUND_MASTER_PURE[root].theme;
  if (COMPOUND_ROOT_MECHANISM[root]) return COMPOUND_ROOT_MECHANISM[root].name;
  return String(root);
}

// One tight sentence on how the day's numbers relate - groups labels by
// shared root (reinforcement) vs different roots (real mix), naming each
// group's theme rather than repeating the full light/shadow text already
// shown above it.
function summarizeInteraction(resolved) {
  if (resolved.length === 1) {
    return `${resolved[0].label} is the whole story today - nothing else in the mix.`;
  }
  const groups = [];
  resolved.forEach((p) => {
    const g = groups.find((g) => g.root === p.entry.root);
    if (g) g.labels.push(p.label);
    else groups.push({ root: p.entry.root, labels: [p.label] });
  });
  const groupText = groups.map((g) => `${g.labels.join(' & ')} (${rootThemeName(g.root).toLowerCase()})`);
  return groups.length === 1
    ? `${groupText[0]} - everything's pulling the same direction today.`
    : `${groupText.join(' vs. ')} - today's a genuine mix, not one clean signal.`;
}

// Root image bank - each root gets a small rotating set of concrete
// images. Shared by the still-live Core Numbers identity engine
// (composeIdentitySentence, below) via nextRootImage()/resetRootImages() -
// the old Today-page pairing system that used to be this comment's home
// (composePairSentence/buildPairRows/rootDomain/COMPOUND_PAIR_LEADIN) was
// removed once the Today page moved to composeDayReading(), which
// consumes the app's real computeCompatibility() instead.
const COMPOUND_ROOT_IMAGES = {
  1: [
    'the first domino, already leaning',
    "the cold open - no warm-up, straight in",
    "the hand that hits the buzzer before the question's finished",
  ],
  3: [
    "a live mic that's already on",
    'the group chat lighting up the second you post',
    'a song stuck in everyone\'s head by noon',
  ],
  4: [
    'a load-bearing wall',
    'brick laid on brick, checked with a level',
    'the gym session nobody claps for that still changes everything',
  ],
  5: [
    "a river that won't sit still",
    'a packed bag by the door',
    'the tab you open "just to look" that turns into a booked flight',
  ],
  6: [
    "the one who shows up with soup when you're sick",
    'the friend who texts "did you land safe?"',
    'dinner on the table before anyone asked',
  ],
  7: [
    'a locked door that checks twice before it opens',
    'the fine print actually getting read',
    'the friend who googles the restaurant before agreeing to go',
  ],
  8: [
    'the closer who signs the deal at the buzzer',
    'an invoice that actually gets sent',
    'the firm handshake that ends the meeting early',
  ],
  9: [
    "water taking the shape of whatever it's poured into",
    'the last box taped shut before a move',
    'the deep exhale after you finally hit send',
  ],
  11: [
    'lightning - brilliant, but not something you stand under unprotected',
    'a radio picking up stations nobody else hears',
    'the gut feeling that texts you before the news does',
  ],
  22: [
    'a cathedral going up one stone at a time',
    'a 30-year mortgage on a house worth owning',
    'scaffolding around something that will outlive the builder',
  ],
  28: [
    'money compounding quietly while you sleep',
    'rent arriving from a property you bought years ago',
    'interest hitting the account on schedule',
  ],
  33: [
    "a lighthouse, visible from further than you'd expect",
    'the teacher whose one line you still quote years later',
    'a porch light the whole street navigates by',
  ],
};

let COMPOUND_IMAGE_USE = {};
let COMPOUND_CLOSER_USE = {};
function resetRootImages() { COMPOUND_IMAGE_USE = {}; COMPOUND_CLOSER_USE = {}; }
function nextRootImage(root) {
  const bank = COMPOUND_ROOT_IMAGES[root];
  if (!bank) return null;
  const i = COMPOUND_IMAGE_USE[root] || 0;
  COMPOUND_IMAGE_USE[root] = i + 1;
  return bank[i % bank.length];
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ------------------------------------------------- "My Numbers" identity -- */
// Round 12 (2026-08-06): the pair rows above compare TODAY against "you",
// but never actually say what "you" are on your own - user: "I think we
// need a separate button underneath light and shadow... my own light and
// my own shadow." Gets its own toggle pair, covering the SAME 4 "mine"
// values already computed for the pairs above (Lifepath, Day Born, your
// own Day#, Personal Day) as standalone identity content - who you are,
// independent of what today happens to be. Reuses COMPOUND_ROOT_IMAGE (one
// consistent set of images across the page) and COMPOUND_DIGIT_FLAVOR's
// existing driver clauses for roots 1-9 (already written in "you" voice),
// composed into fresh sentences - not a copy of the today-facing entry
// text. No raw compound numbers surface here, prose only, same house rule
// as the pair rows.
//
// Master numbers name their pure/impure oscillation same as everywhere
// else in this file, EXCEPT 11 - which never gets framed as oscillating
// into "2" (2 doesn't exist standalone, see feedback-no-standalone-two
// memory, and the user's own hard line: "impure 11 doesn't exist" as a
// swing into some other number - it's a less-stable, borrowed version of
// the SAME 11, never a swing into "2"). 22/4 and 33/6 have a real
// companion root, named directly.
//
// Round 12b fix (IMG_2510): identity content comes from the ROOT, which
// every entry always has - a "flat" entry (single-digit compound, e.g. a
// plain 9 Lifepath) still gets the full root identity, never a "nothing
// to unpack" shrug. The flat note is about missing COMPOUND flavor; who
// you ARE is never missing. Also: the four slots are not interchangeable
// - Lifepath is the permanent core, Day Born a permanent rhythm, Day# a
// permanent year-position, but Personal Day CHANGES DAILY and must never
// be framed as "how you're built".
const IDENTITY_SLOTS = {
  core: {
    opener: 'At your core, you are',
    lightTail: "That's not a mood - it's your default setting.",
    shadowLead: 'The lifelong trap:',
  },
  rhythm: {
    opener: 'Day to day, you run like',
    lightTail: "It's the rhythm you fall back into without thinking.",
    shadowLead: 'On an off day,',
  },
  year: {
    opener: 'Your spot in the year makes you',
    lightTail: 'A quieter current than the others, but always on.',
    shadowLead: 'Its slip side:',
  },
  // No "moves with the calendar" tail - user: "that's obvious".
  today: {
    opener: 'Today lands on you as',
    lightTail: '',
    shadowLead: 'Leaned on too hard,',
  },
  // Combo - no derivation talk (user: "don't explain how we got the
  // combo"), just the identity itself.
  combo: {
    opener: 'Your combo runs as',
    lightTail: '',
    shadowLead: 'Its slip side:',
  },
  // 2026-08-07: Personal Cycles' full-story fix needed these 2 - Personal
  // Day already had 'today' (it genuinely changes daily, so "today" framing
  // there was always correct), but Year/Month had no "you" slot at all and
  // fell through to the day-voice compound copy instead. Framed by the
  // cycle's own real timescale rather than "today", since neither actually
  // resets daily.
  personalYear: {
    opener: "This year, you're running on",
    lightTail: "That's the current carrying you until your personal year turns over.",
    shadowLead: 'Ridden too hard,',
  },
  personalMonth: {
    opener: 'This month layers in',
    lightTail: 'A shorter wave riding inside your bigger year.',
    shadowLead: 'Off balance,',
  },
};

// The root's identity clauses (good/bad), shared by all slots - each
// slot's opener/tail wraps these differently. `long: true` marks clauses
// that are already full multi-part sentences (oscillating masters), so
// the slot tail is skipped rather than stapled onto an already-complete
// thought.
function identityClauses(entry) {
  const root = entry.root;
  if (root === 28) {
    return {
      good: 'wealth built through steady discipline, not chased',
      bad: 'the chase itself becomes the point - cutting corners or overextending just to feel the payoff sooner',
    };
  }
  if (root === 11 || root === 22 || root === 33) {
    if (!entry.impure) {
      const burden = root === 11 ? 'anxiety or reactivity' : root === 22 ? 'genuine overwhelm' : "a burden you didn't sign up for";
      return {
        good: `${rootThemeName(root).toLowerCase()} running at full, natural strength`,
        bad: `left ungrounded, that same charge tips into ${burden}`,
      };
    }
    // No legitimate companion for 11 (2 doesn't exist standalone) - a less
    // stable version of the SAME 11, never a swing into some other number.
    if (root === 11) {
      return {
        good: "though it doesn't always arrive at full voltage; some days it runs closer to raw instinct than the settled, refined version",
        bad: 'that instability tips into real emotional volatility - reactive decisions, mood driving the moment instead of clear judgment',
        long: true,
      };
    }
    const companionImage = nextRootImage(entry.companion);
    const companionTheme = rootThemeName(entry.companion).toLowerCase();
    return {
      good: `most of the time, anyway; some days you're just ${companionImage} instead, ${companionTheme} on the task in front of you rather than the whole vision. Both are really you`,
      bad: `the switch itself is the trap - reaching for ${rootThemeName(root).toLowerCase()}-scale ambition with only ${companionTheme} bandwidth, or playing small on a day that called for the big vision`,
      long: true,
    };
  }
  const flavor = COMPOUND_DIGIT_FLAVOR[root];
  if (!flavor) return null;
  return { good: flavor.driverGood, bad: flavor.driverBad };
}

function composeIdentitySentence(entry, slot) {
  if (!entry) return null;
  if (!COMPOUND_ROOT_IMAGES[entry.root]) return null;
  const clauses = identityClauses(entry);
  if (!clauses) return null;
  const image = nextRootImage(entry.root);
  const s = IDENTITY_SLOTS[slot] || IDENTITY_SLOTS.core;
  const tail = clauses.long || !s.lightTail ? '' : ` ${s.lightTail}`;
  return {
    light: `${s.opener} ${image} - ${clauses.good}.${tail}`,
    shadow: `${s.shadowLead} ${clauses.bad}.`,
  };
}

// Builds the "My Numbers" rows from the same 4 "mine" entries the pairs
// above already compute. items: [{ label, entry, slot }] - missing
// entries (no birthdate on file) are silently skipped, same graceful-
// degradation rule as everywhere else in this file. A root that repeats
// across slots (e.g. Day Born 3 AND Day# 3) gets a stack note on its
// second appearance instead of the byte-identical sentence twice.
function buildIdentityRows(items) {
  const lightRows = [];
  const shadowRows = [];
  const seen = {};
  items.forEach(({ label, entry, slot }) => {
    if (!entry) return;
    const prior = seen[entry.root];
    let sentence;
    if (prior) {
      const themeLower = rootThemeName(entry.root).toLowerCase();
      sentence = slot === 'today'
        ? {
          light: `Today runs on the same ${themeLower} current as your ${prior} - the day is speaking your native language, doubled.`,
          shadow: `Doubled also means overdone - your own worst ${themeLower} habit has nothing checking it today.`,
        }
        : {
          light: `Same ${themeLower} current as your ${prior}, running through this number too - stacked, not incidental. That's why it's so loud in you.`,
          shadow: `Stacked also means doubled exposure - when ${themeLower} slips into its bad side, there's a second copy pushing the same way.`,
        };
    } else {
      sentence = composeIdentitySentence(entry, slot);
      if (sentence) seen[entry.root] = label;
    }
    if (!sentence) return;
    lightRows.push({ label, text: sentence.light });
    shadowRows.push({ label, text: sentence.shadow });
  });
  return { lightRows, shadowRows };
}

/* ================= General Reading (Boost13, 2026-08-07) =================
 * Separate content bank + weave from everything above. Source is the
 * user's own "Master Blueprint of Identity" PDF (Numbers 1-9/11/22/33,
 * all 12 Vietnamese animals, all 12 Western signs) - adapted into short,
 * plain sentences, matching the user's own words: "the simplicity I added
 * to the documents was on purpose" and "I don't like the em dash, it feels
 * like an AI wrote it, space it out." No em-dashes anywhere in this
 * section. Numbers and signs are never named as labels ("Life Path:",
 * "Combo:") or as raw digits ("a nine") in the output - description only,
 * per user correction after seeing an earlier draft.
 *
 * "General reading" = timeless identity only: Life Path, Day Born, Combo,
 * Western Sign, Vietnamese Year/Month/Day (all birth-fixed). Explicitly
 * NOT Personal Year/Month/Day - user: "stop saying what today is, this is
 * simply a general reading, the today stuff is for the day and personal
 * day." Vietnamese month/day animal are the person's own BIRTH month/day
 * (their natal signature), not a transiting/current-date animal - user-
 * confirmed.
 *
 * Master numbers (11/22/33) mix in their companion root's own content
 * when impure, same "both are really you" doctrine as the original
 * identityClauses() above, but written fresh here in the plain voice -
 * user: "make sure you understand there's still 33/6, 22/4 meaning for
 * those, add mix of both." 11 has no legitimate companion (see feedback-
 * no-standalone-two memory) - its "impure" version is just a less-stable
 * version of the same 11, never a swing into another number.
 */
// characteristics/moreCharacteristics (2026-08-08): the tap popups only
// used light/shadow - user: "add some bullet points with characteristics
// in those." Source is the PDF's own "Emotional Reality Checks" per
// number (specific, second-person, already in this exact plain voice) -
// 3 shown as the popup's bullets, 2 held in reserve as moreCharacteristics
// for when a root repeats across slots (Day Born and Day# sharing a root,
// etc.) so the repeat gets one genuinely new line instead of the same
// bullets twice, same doctrine as the Vietnamese deep/cherry split.
// Master numbers only carry characteristics on their PURE entry - the
// impure/oscillating entries fall back to the pure root's list in
// numberIdentityV2() below, since the reality checks describe the root
// itself, not the pure/impure distinction.
// Day-energy framing for the Today page's opener, kept separate from
// NUMBER_IDENTITY_V2 below. User, 2026-08-08: "it shouldn't say 'you're a
// natural protector' ... if you're a 6 then yeah but if not then it
// shouldn't say that, it should be about the energy of the day draws you
// to be a protector nurturing or whatever I have on the pdf." The problem:
// openText used NUMBER_IDENTITY_V2, which was written in first-person-claim
// voice ("You're a natural protector") for describing a PERSON's own fixed
// number - correct when describeComparisonFinding uses it for pair.imageRoot
// (the person's real number), wrong when reused for the Universal Day root,
// which isn't the person's number at all on most days.
// Source: aa95df9a-The13G.pdf ("The Ultimate Cosmic Blueprint"), each
// number's own "What it Signifies" field - already written in third-person
// day/energy voice, not personal-identity voice - combined with the short
// "In Their Light"/"In Their Shadow" adjective lists from the same page.
// Reframed as "today runs on ___ energy, it can pull you toward ___" /
// "that same energy can also tip into ___" - the day drawing something out
// of whoever it lands on, not a claim about who the person fixedly is.
// General Reading rotation pool (Boost13 OVERDRIVE, 2026-08-08) - user
// caught 3 back-to-back readings all containing an 11, and every one read
// byte-for-byte identical: "I gave you a lot to work with... it shouldn't
// give the same all the time." NUMBER_IDENTITY_V2's light/shadow stays the
// fixed core (that's the actual identity claim), but each paragraph now
// also appends one real, rotating extra line so two different people
// sharing a root don't read as clones of each other. Source: the same
// aa95df9a-The13G.pdf ("Ultimate Cosmic Blueprint") that PDF_ACTION_PLAN
// and DAY_ENERGY came from - its "5 Sharp One-Liners" per number, never
// used anywhere else in the app (verbatim, no reframing needed).
const NUMBER_SHARP_LINES = {
  1: [
    "You act like you don't need anyone, but you secretly wish someone would notice how heavy it is to always be first.",
    'You hide your self-doubt behind a shield of perfect confidence.',
    'Being surrounded by slow thinkers makes you feel utterly marooned.',
    'You would rather fail spectacularly on your own terms than win by following someone else\'s rules.',
    "Your fiercest battle isn't with rivals; it's with your own intense fear of being average.",
  ],
  2: [
    'You absorb other people\'s sadness like a sponge, then wonder why you feel so heavy.',
    'Your "yes" often means "I am terrified you will leave me if I say no".',
    "You see right through people's fake smiles, and it hurts you that they think you're blind.",
    "You play the quiet helper, but you silently keep score of every favor that isn't returned.",
    "You fear being alone so much that you stay in rooms where you aren't even respected.",
  ],
  3: [
    "You make everyone laugh so they don't see your eyes searching for approval.",
    'You speak a thousand words a minute to keep people from asking how you actually feel.',
    'Boredom feels like actual, physical torture to your hyperactive brain.',
    'You change your stories slightly every time just to ensure they sound spectacular.',
    'Your biggest fear is waking up one day and realizing you are completely ordinary.',
  ],
  4: [
    'You hold onto old rules so tightly that you miss out on new magic.',
    'Your need to control every single plan shows how much you fear the unknown.',
    'You show love by fixing things, but sometimes people just want you to listen.',
    "When life changes unexpectedly, you freeze up and pretend you don't care.",
    'You work yourself to the bone because you think your worth equals your productivity.',
  ],
  5: [
    'You chase new thrills because you are terrified of standing still with your own thoughts.',
    'You leave people behind before they have the chance to leave you.',
    "Commitment feels like a cage to you, even when it's a cage made of love.",
    'You have a million friends but secretly wonder if anyone truly knows the real you.',
    'You mistake constant movement for actual personal growth.',
  ],
  6: [
    "You fix everyone else's lives so you don't have to look at your own broken pieces.",
    'Your advice can feel like a heavy cage of expectations to the people you love.',
    'You secretly want a medal for all the sacrifices you force yourself to make.',
    "When people don't take your help, you take it as a deep, personal insult.",
    'You love the idea of perfection so much that reality constantly disappoints you.',
  ],
  7: [
    'You use your huge brain as a shield to keep people away from your fragile heart.',
    "You analyze every text message like a puzzle because you don't trust anyone's real intentions.",
    'You would rather stay isolated and lonely than risk being misunderstood by common people.',
    "Your mind is a brilliant place, but it's also a trap that keeps you from actually living.",
    'You look down on shallow things, yet you secretly wish you could fit in easily like they do.',
  ],
  8: [
    'You try to buy love and security because you are terrified that you aren\'t enough without your money.',
    'You treat your personal relationships like business deals where you must always win.',
    'Behind your tough, powerful armor sits a kid who felt helpless long ago.',
    'You think showing any vulnerability makes you weak, so you suffer completely alone.',
    'You are so busy building your empire that you forget to actually live inside it.',
  ],
  9: [
    "You change your personality for everyone you meet, leaving you wondering who you are when you're alone.",
    'You act like a mirror, so when people hate you, they are really just hating their own reflection in you.',
    'You hold onto old memories and dead relationships like they are still breathing.',
    "You are so good at adapting that you've become a stranger to your own true desires.",
    'You want to finish everything perfectly, yet you are terrified of final endings.',
  ],
  11: [
    "Your body is constantly buzzing with nervous energy because you're carrying cosmic voltage.",
    'You look for deep spiritual magic in a world that is often happy being shallow.',
    'You are so sensitive that a single harsh glance can ruin your entire afternoon.',
    'You talk about high ideals but often struggle with the messy reality of being human.',
    'You are terrified of going crazy because your mind hears things others miss completely.',
  ],
  22: [
    'You carry such a giant vision that you feel constantly crushed by your own high expectations.',
    'You are so focused on building the future that you forget to enjoy the present moment.',
    'You treat your body like a machine until it breaks down completely to stop you.',
    "You secretly fear that if you don't build something massive, your whole life is a failure.",
    'You hide your deep, fragile sensitivity behind a wall of absolute practical work.',
  ],
  33: [
    "You try to carry the entire weight of the world's suffering on your single pair of shoulders.",
    'You preach love to everyone else, but you treat yourself with absolute, harsh cruelty.',
    "You get deeply disappointed because people can't match your endless capacity to care.",
    'You treat your life like a non-stop emergency room where you are the only doctor.',
    'Your high ideals can secretly turn into judgment against those who are still struggling.',
  ],
};

const DAY_ENERGY = {
  1: {
    light: "Today runs on pioneer energy - the spark that stands alone and clears a path where no one else has walked. It can pull you toward being brave, confident, and full of brilliant ideas, standing tall like a captain leading a ship.",
    shadow: 'That same energy can also tip into bossy, easily frustrated when others are slow, and hating being told what to do.',
  },
  2: {
    light: "Today runs on diplomat energy - the bridge between worlds, the ultimate supporter that brings harmony out of chaos. It can pull you toward being kind, deeply empathetic, an amazing listener, and a master at making people feel loved.",
    shadow: 'That same energy can also tip into oversensitive, passive-aggressive, and letting people walk all over you just to avoid a fight.',
  },
  3: {
    light: "Today runs on performer energy - pure joy, creative expression, words, and sparkling imagination, the kind that turns thoughts into beautiful art and stories. It can pull you toward being hilarious, highly creative, full of infectious enthusiasm, and brightening up any room instantly.",
    shadow: 'That same energy can also tip into scattered, gossipy, exaggerating the truth wildly, and using humor to run away from real pain.',
  },
  4: {
    light: "Today runs on architect energy - structure, logic, hard work, roots, and safety, the kind that turns wild dreams into physical reality through discipline. It can pull you toward being reliable, fiercely loyal, super organized, and the person everyone trusts when things break down.",
    shadow: "That same energy can also tip into stubborn, rigid like a stone wall, hating any kind of change, and worrying endlessly about the future.",
  },
  5: {
    light: "Today runs on maverick energy - dynamic freedom, adventure, sensory experience, and constant change, the wind that cannot be trapped in a box. It can pull you toward being adaptable, brave, multitalented, charismatic, and loving the world with all 5 senses.",
    shadow: 'That same energy can also tip into restless, easily addicted to distractions, running away when things get tough, and hating commitment.',
  },
  6: {
    light: "Today runs on nurturer energy - the cosmic parent, unconditional love, home, responsibility, and healing, creating beautiful, safe spaces for everyone. It can pull you toward being deeply caring, protective, artistic, excellent at advice, and giving the best hugs in the world.",
    shadow: "That same energy can also tip into meddlesome, trying to fix people who didn't ask to be fixed, and making yourself a martyr.",
  },
  7: {
    light: "Today runs on sage energy - mystery, truth, deep wisdom, and analysis, the scientist and spiritual seeker that looks beneath the surface of everything. It can pull you toward being brilliant, intuitive, deeply spiritual, and a true original thinker who sees the matrix of life.",
    shadow: 'That same energy can also tip into paranoid, cold, isolated, overthinking until you spiral, and looking down on others.',
  },
  8: {
    light: "Today runs on powerhouse energy - material mastery, power, money, balance, and cosmic karma, hard work meeting massive rewards. It can pull you toward being strong, fair-minded, highly successful, generous, and able to manifest big things out of thin air.",
    shadow: 'That same energy can also tip into power-hungry, obsessed with expensive status symbols, controlling, and cruel when crossed.',
  },
  9: {
    light: "Today runs on mirror energy - the final single digit, the ultimate adapter, reflecting whatever or whoever is in front of it perfectly. It can pull you toward being highly empathetic, able to blend into any culture or group instantly, wise, and holding master completion energy.",
    shadow: "That same energy can also tip into losing your own identity completely, acting fake to please others, and holding onto old past pain like a hoarder.",
  },
  11: {
    light: "Today runs on cosmic antenna energy - a powerful channel for intuition, spiritual light, and sudden electric inspiration, connecting earth straight to heaven. It can pull you toward being visionary, deeply intuitive, inspiring, and lighting up the dark like a sudden bolt of lightning.",
    shadow: 'That same energy can also tip into extremely anxious, nervous energy, intensely sensitive, and getting overwhelmed by reality easily.',
  },
  22: {
    light: "Today runs on master builder energy - taking brilliant, psychic vision and crushing it down into solid, physical reality, the kind of day that builds things benefiting everyone. It can pull you toward being masterful, practical, unbelievably capable, and able to turn impossible dreams into solid gold structures.",
    shadow: 'That same energy can also tip into crushed by extreme pressure, controlling, greedy, or totally paralyzed by a fear of failing.',
  },
  33: {
    light: "Today runs on cosmic teacher energy - combining absolute creative expression with ultimate loving service, pure, radiant heart energy. It can pull you toward being unbelievably kind, wise, protective, inspiring, and teaching people how to love through your actions.",
    shadow: "That same energy can also tip into suffocated by the world's pain, judgey of others' morals, and emotionally exhausted from codependency.",
  },
};

const NUMBER_IDENTITY_V2 = {
  1: {
    light: "You don't wait for someone else to fix things. You jump in and go first, and that courage inspires the people around you.",
    shadow: 'You can get bossy and stubborn without meaning to. Because you want to do everything yourself, you end up pushing people away.',
    characteristics: [
      'You act like you don\'t need anyone\'s praise, but your whole day breaks when your hard work goes unnoticed.',
      'You run so fast into the future because you\'re scared of what will catch up to you if you stand still.',
      'Your biggest secret is that you\'re exhausted from always having to be the strong one.',
    ],
    moreCharacteristics: [
      'You build walls out of your independence, but you secretly wish someone cared enough to climb over them.',
      'Deep down, you are terrified that if you aren\'t winning or leading, you don\'t matter at all.',
    ],
  },
  2: {
    light: "You're gentle, and you're genuinely good at helping people get along. You listen well, and you make sure nobody feels left out.",
    shadow: 'You hide your real feelings just to keep the peace. You keep score of small favors, and you let people walk over you more than you should.',
    characteristics: [
      'You collect other people\'s problems so you don\'t have to look at the mess inside your own heart.',
      'Your kindness is real, but you also use it as a shield to keep people from seeing how angry you really are.',
      'You feel empty when you aren\'t fixing someone, because you haven\'t learned how to love yourself yet.',
    ],
    moreCharacteristics: [
      'You say "I don\'t care, you choose" because you\'re terrified your actual preference will push people away.',
      'You are so afraid of arguments that you let people hurt your feelings and then apologize to them for it.',
    ],
  },
  3: {
    light: "You're full of joy and imagination. You color the room with your words, your art, or your jokes, and people light up around you.",
    shadow: 'You can get scattered and dramatic. When you feel insecure, you reach for charm or sharp words instead of saying what\'s actually wrong.',
    characteristics: [
      'You tell a joke every time the conversation gets deep because you\'re scared of crying in front of people.',
      'You talk constantly so that nobody has the chance to ask you how you\'re actually doing.',
      'Behind your bright, sunny smile is a little kid who is terrified of being left alone in the dark.',
    ],
    moreCharacteristics: [
      'You crave a massive audience because you\'re worried a single person knowing the real you wouldn\'t be enough.',
      'You spread your energy into ten different things so you never have to commit and risk failing at one.',
    ],
  },
  4: {
    light: "You're the most reliable person in most rooms. You work hard, you follow through, and you build things that actually last.",
    shadow: "You can get rigid and afraid of change. You hold onto rules and routines even when they've stopped helping you.",
    characteristics: [
      'You control every little detail around you because you\'re terrified of what you cannot control.',
      'You call yourself practical, but it\'s often just a safe excuse to never dream big and risk disappointment.',
      'You judge others for being lazy because you\'re jealous that they know how to rest and you don\'t.',
    ],
    moreCharacteristics: [
      'You think your hard work makes you valuable, but you\'re actually just too scared to let people love you for free.',
      'You hold onto old habits like a shield, even when those habits are keeping you completely miserable.',
    ],
  },
  5: {
    light: "You're adventurous and adaptable. You love learning new things, meeting new people, and showing others how to break out of a boring routine.",
    shadow: "You can get restless and reckless. The second something gets serious, you're already looking for the exit.",
    characteristics: [
      'You call it an adventure, but everyone else knows you\'re just running away from your problems again.',
      'You keep people at a distance so you can leave them before they have a chance to leave you.',
      'You think freedom means having no rules, but you\'ve become a prisoner to your own restlessness.',
    ],
    moreCharacteristics: [
      'You crave constant change because you\'re terrified of sitting quietly with your own thoughts.',
      'You chase every new thrill to numb the deep ache of feeling like you don\'t belong anywhere.',
    ],
  },
  6: {
    light: "You're a natural protector. You create warm spaces, you take care of people who are sick or sad, and you make people feel like family.",
    shadow: "You can get controlling and overly critical. You meddle in other people's lives trying to fix them, then get resentful when they don't thank you for it.",
    characteristics: [
      'You fix everyone else\'s life so you can avoid facing the absolute breakdown in your own.',
      'Your high standards aren\'t out of love - they\'re a weapon you use to make people feel like they\'re never enough.',
      'You are so busy being the savior that you don\'t know how to let anyone save you when you drown.',
    ],
    moreCharacteristics: [
      'You give love like a contract, expecting people to pay you back with absolute loyalty and compliance.',
      'You complain about doing everything, but you secretly love it because it makes you feel irreplaceable.',
    ],
  },
  7: {
    light: "You're sharp and deeply thoughtful. You look past the surface, and you actually understand how things work instead of just accepting what you're told.",
    shadow: 'You can get paranoid and cold. You overthink everything, you trust almost nobody, and you push real love away without meaning to.',
    characteristics: [
      'You use your big intellect as a castle wall so people can\'t get close enough to see your fragile heart.',
      'You think everyone has a hidden motive, but it\'s just your own fear projected onto them.',
      'You are so busy looking for the deep meaning of life that you miss the joy of actually living it.',
    ],
    moreCharacteristics: [
      'You analyze love like a math problem because you\'re too terrified to actually let yourself feel it.',
      'You isolate yourself and then complain that nobody ever reaches out to see if you\'re okay.',
    ],
  },
  8: {
    light: "You're strong and focused. You turn big plans into real results, and you use your power to protect the people around you.",
    shadow: 'You can get obsessed with money, status, and control. You start treating people like pieces on a board instead of people.',
    characteristics: [
      'You are terrified of weakness, so you treat the people who love you like employees to maintain control.',
      'You accumulate success like armor, hoping it will hide the little kid inside who felt powerless.',
      'If you lost your status tomorrow, you wouldn\'t know who you are when you look in the mirror.',
    ],
    moreCharacteristics: [
      'You think buying people expensive gifts can replace the emotional presence you refuse to give them.',
      'You value efficiency so much that you treat human feelings like annoying errors in your system.',
    ],
  },
  9: {
    light: "You're the ultimate shape-shifter. You walk into any room and instantly understand the people in it, reflecting their energy back so they feel completely seen.",
    shadow: 'You can lose your own center doing that. You blend in so much you start to lose track of who you actually are underneath it.',
    characteristics: [
      'You change your personality for every room you enter, leaving everyone wondering who the real you actually is.',
      'You are so busy being a mirror for everyone else that you feel completely blank when you\'re left alone in a room.',
      'You accumulate everyone else\'s feelings like lint, carrying a heavy sack of ghosts that aren\'t even yours.',
    ],
    moreCharacteristics: [
      'You play the wise, detached observer because you\'re too scared to stand up and be judged for your own raw self.',
      'You claim you understand everyone, but it\'s really just a trick to avoid letting anyone truly understand you.',
    ],
  },
  11: {
    light: "You're wired like an antenna. Insight hits you suddenly and clearly, and you help people see things they couldn't see on their own.",
    shadow: "That same wiring runs hot. You can spiral into anxiety fast, because you're built to feel more than most people are built to handle.",
    characteristics: [
      'Your nervous anxiety isn\'t a medical mystery - it\'s the price you pay for refusing to ground your big ideas into real life.',
      'You hover above real-world relationships because you\'re terrified real human intimacy is too messy for you.',
      'You are a brilliant light bulb that spends all its time floating around looking for a socket to plug into.',
    ],
    moreCharacteristics: [
      'You act like a special chosen messenger to hide how deeply uncomfortable you feel inside your own skin.',
      'You judge others for being basic, but you secretly envy how simple and calm their minds are.',
    ],
  },
  '11i': {
    light: "That same antenna is in you too, though it doesn't always run at full strength. Some days it's raw instinct more than clear insight.",
    shadow: 'On those days it tips faster into reactivity, mood doing the deciding instead of a clear read.',
  },
  22: {
    light: 'You take a big vision and actually build it. You can organize something massive and make it real, brick by brick.',
    shadow: 'You can get crushed by your own scale. The pressure gets so heavy you give up entirely and settle for something small out of fear.',
    characteristics: [
      'You talk about your massive, world-changing plans to mask the fact that you haven\'t cleaned your room in weeks.',
      'You settle for being a small-time boss because you\'re too cowardly to risk failing at your actual grand scale.',
      'Deep down, you are terrified that you are just an ordinary person playing dress-up as a grand master.',
    ],
    moreCharacteristics: [
      'You think you\'re under a special curse of heavy pressure, but you\'re the one putting the anvil on your own chest.',
      'You treat your life like a strict construction site, forgetting that people are meant to be loved, not just managed.',
    ],
  },
  '22i': {
    light: "Some days that shows up as the big vision. Other days you're just heads-down on the one task in front of you, practical and grounded. Both are really you.",
    shadow: 'The switch is the trap. Reaching for the big vision with only enough in the tank for the small task, or playing small on a day that actually called for the big one.',
  },
  33: {
    light: "You're a powerhouse of protective love. You heal people, you protect the weak, and you lead with real warmth.",
    shadow: "You can slide into martyrdom. You carry the whole world's weight until you break down, and you resent that nobody's carrying yours.",
    characteristics: [
      'Your global worry for humanity is a clever distraction to avoid addressing your own private heartbreak.',
      'You are so addicted to being needed that you stunt other people\'s growth just to keep them relying on you.',
      'Behind your massive teacher persona is a crying child begging for permission to lay down and just rest.',
    ],
    moreCharacteristics: [
      'You deliberately stay in toxic, broken relationships just so you can feel important playing the saintly savior.',
      'You make sure everyone sees how much you sacrifice, ensuring they stay trapped in permanent debt to you.',
    ],
  },
  '33i': {
    light: "Most of the time, anyway. Some days you're just the one who shows up with soup when someone's sick, caring for the one person in front of you instead of the whole horizon. Both are really you.",
    shadow: 'The trap is reaching for the big rescue with only enough left for the small one, or pouring everything into one person while everything else goes untended.',
  },
};

function numberIdentityV2(root, impure) {
  if ((root === 11 || root === 22 || root === 33) && impure) {
    const impureEntry = NUMBER_IDENTITY_V2[`${root}i`];
    const pureEntry = NUMBER_IDENTITY_V2[root];
    return Object.assign({}, impureEntry, { characteristics: pureEntry.characteristics, moreCharacteristics: pureEntry.moreCharacteristics });
  }
  return NUMBER_IDENTITY_V2[root] || null;
}

// deep/cherry (2026-08-07): the user gave far more source material per
// animal than light/shadow alone (an emotional-core line, real-life
// examples, five reality-check lines per entry) specifically so the app
// never runs out of fresh things to say - "the whole reason I'm giving
// you all of these is so we can have more than just one line so it feels
// like a unique experience always." Used here for the repeat-animal case
// (year/month/day sharing a sign): the first occurrence gets light+shadow
// +deep (the fuller read, using the emotional-core material); a repeat
// occurrence gets just `cherry`, one short new line, not the same two
// sentences again. User: "the month go more in depth the day is cherry
// on top."
const VIETNAMESE_IDENTITY = {
  Rat: {
    light: "You're smart and resourceful. You find opportunities other people miss, and you make sure the people close to you are safe and taken care of.",
    shadow: "You can get sneaky and anxious about resources. You calculate your exit before you've even committed, and you hoard things you don't actually need.",
    deep: 'What actually moves you is safety. A full kitchen, a safe circle, money put away. Losing that is your real fear, more than most people realize.',
    characteristics: [
      "You hoard things and secrets because you're terrified that tomorrow you'll wake up with absolutely nothing.",
      "You charm people with quick wit so they don't look closely enough to see how much you calculate your every move.",
      'Your anxiety is a self-made wheel. You look for problems where everything is completely peaceful.',
    ],
    moreCharacteristics: [
      'You pretend to care about the group, but your mind is always secretly calculating your personal exit strategy.',
      'You judge others for being sloppy just to cover up how messy and panicked your internal thoughts are.',
    ],
  },
  Ox: {
    light: 'You have quiet, steady power. You work through anything without complaining, and you build real, deep roots.',
    shadow: "You can get stubborn and slow to forgive. You hold onto a grudge for years, and you'd rather run yourself into the ground than admit the plan needs to change.",
    deep: "What actually moves you is loyalty that matches your own, quiet and unspoken. What sets you off is watching someone lazy get away with taking you for granted.",
    characteristics: [
      "You use your silent work routine as a safe hiding spot so you don't have to talk about your painful feelings.",
      'You hold onto old grudges like medals, letting your anger poison your own heart out of sheer stubborn pride.',
      "Your refusal to pivot and change isn't strength. It's a deep, terrifying fear of the unknown.",
    ],
    moreCharacteristics: [
      'You stay in broken arrangements because you confuse dangerous stubbornness with noble loyalty.',
      "You act like a stoic wall, but inside you're weeping because nobody offers to help carry your heavy bags.",
    ],
  },
  Tiger: {
    light: "You're brave and passionate. You fight hard for people who can't fight for themselves, and you lead with real charisma.",
    shadow: 'You can get hot-headed and dramatic. You start big fights over small things, and your pride would rather lose a friend than admit a mistake.',
    deep: "What actually moves you is a real cause worth fighting for, something big enough for your whole passion. What guts you is feeling disrespected or boxed in.",
    characteristics: [
      'You pick fights and create drama just to feel alive, because peace bores your restless mind.',
      'You roar loudly to make sure nobody notices how fragile and easily hurt your heart actually is.',
      "Your intense pride is a trap. You'd rather lose a best friend than admit you made a tiny mistake.",
    ],
    moreCharacteristics: [
      "You blame others for your chaotic life, completely ignoring that you're the one who lit the match.",
      "You chase big storms because you're terrified of the quiet truth waiting in the calm.",
    ],
  },
  Cat: {
    light: "You're elegant and deeply perceptive. You notice details other people miss, and you build a calm, beautiful life around you.",
    shadow: "You can get cold and distant. You keep people at arm's length, and you judge people quietly instead of saying what's actually bothering you.",
    deep: 'What actually moves you is harmony. A beautiful, quiet room, real respect, things done with care. What grates on you is anything loud, messy, or crude.',
    characteristics: [
      "You act detached and independent, but you're actually hyper-dependent on everyone liking you.",
      'You use your elegant silence to make others feel small and judged, avoiding real connection.',
      "You think your high taste makes you elite, but it's really just a screen to hide your deep insecurity.",
    ],
    moreCharacteristics: [
      'You slip out the back door when conflicts arise, leaving your loved ones to clean up your mess.',
      'You treat people like furniture, keeping them around only as long as they fit your visual aesthetic.',
    ],
  },
  Dragon: {
    light: "You carry big, dynamic energy. You're destined for big things, and you inspire people just by walking into the room.",
    shadow: 'You can get arrogant and hard to satisfy. You expect people to bow a little, and a small criticism can wound you more than it should.',
    deep: 'What actually moves you is a big vision, greatness, real loyalty around you. What burns is being criticized in public. That one goes deep.',
    characteristics: [
      "You demand the spotlight because some part of you is terrified you're completely empty without an audience.",
      "You burn bridges with blinding arrogance, then wonder why you're left flying alone in the cold sky.",
      "Your biggest fear is that if people saw your flaws, the whole illusion would vanish into ash.",
    ],
    moreCharacteristics: [
      "You throw tantrums over tiny things because you can't handle not being the center of the world.",
      "You think you're destined for greatness, using that fantasy to avoid the actual hard, everyday work.",
    ],
  },
  Snake: {
    light: "You're wise and deeply intuitive. You understand people's psychology fast, and your advice tends to actually be right.",
    shadow: "You can get paranoid and secretive. You keep score of every slight for years, and you'd rather manipulate a situation quietly than ask directly for what you need.",
    deep: "What actually moves you is a rare, real connection, someone who actually gets it. What freezes you out is realizing someone lied to your face.",
    characteristics: [
      'You test people\'s loyalty with invisible traps, then act shocked when they eventually trip and fail.',
      'You keep your own deck completely hidden, terrified someone will use your vulnerabilities against you.',
      'You remember every slight from years ago, carrying a toxic bucket of old venom that ruins your own happiness.',
    ],
    moreCharacteristics: [
      'Your quiet wisdom is real, but you also use it as an excuse to look down on people as basic creatures.',
      "You manipulate things from the dark because you're too cowardly to stand up and ask for love directly.",
    ],
  },
  Horse: {
    light: "You're cheerful and independently powerful. You love running toward new things, and you can lift a sad friend just by showing up.",
    shadow: "You can get impatient and selfish. You abandon things halfway through, and you trample people's feelings without noticing you did it.",
    deep: 'What actually moves you is a new project, a new direction, real momentum. What panics you is feeling tied down to a strict routine.',
    characteristics: [
      'You run away from difficult talks because you lack the emotional strength to stand and hear the truth.',
      'You ditch projects and friends the second the shiny novelty wears off and the actual hard work begins.',
      'Your constant search for excitement is just a desperate attempt to outrun your own loneliness.',
    ],
    moreCharacteristics: [
      'You trample over everyone\'s boundaries and call it "following your wild, independent path."',
      'You claim nobody understands your free spirit, but you use that to excuse your own thoughtless selfishness.',
    ],
  },
  Goat: {
    light: "You're deeply artistic and kind. You bring real beauty into the world, and you have a heart that genuinely loves helping people.",
    shadow: 'You can get stuck playing the victim. You avoid blame, and small stress can paralyze you completely.',
    deep: 'What actually moves you is real beauty and gentle kindness. What breaks you down is aggressive demands and a harsh tone.',
    characteristics: [
      'You play the helpless, crying victim so people will feel guilty and do your hard work for you.',
      'You use your delicate sensitivity as a weapon to avoid taking any real responsibility for your mistakes.',
      "You depend so heavily on others for safety that you've become an emotional parasite.",
    ],
    moreCharacteristics: [
      'You complain the world is too harsh, but you do absolutely nothing to make yourself stronger.',
      "Your artistic moodiness isn't deep wisdom. It's a childish tantrum because things didn't go your way.",
    ],
  },
  Monkey: {
    light: "You're a fast, clever problem-solver. You can fix almost anything, and you pick up hard skills faster than most people.",
    shadow: "You can get tricky and dishonest for fun. You bend rules just to see if you can get away with it, and you look down on people you've decided are slower than you.",
    deep: "What actually moves you is a real puzzle, something that tests you. What insults you is being treated like you're not smart, even a little.",
    characteristics: [
      'You treat relationships like chess games, then sit around wondering why nobody truly loves you.',
      "You prank and trick people because you're terrified of having an honest, vulnerable conversation.",
      "Deep down, you're scared that if you stop acting clever, people will realize there's no substance underneath.",
    ],
    moreCharacteristics: [
      "You think you're the smartest person in the room, but your arrogance blindingly hides your own massive mistakes.",
      'You use your fast mouth to scramble the facts whenever someone catches you red-handed in a lie.',
    ],
  },
  Rooster: {
    light: "You're organized, precise, and brave. You keep your promises, you speak the truth, and you look sharp doing it.",
    shadow: "You can get overly critical and boastful. You pick at other people's small flaws, and you can't stand being told you're wrong.",
    deep: 'What actually moves you is order done right and real respect for your work. What irritates you fastest is a messy, lazy environment.',
    characteristics: [
      "You peck away at everyone else's tiny flaws so nobody has time to look at your own massive cracks.",
      "You boast loudly about your achievements because you're terrified that you're actually invisible.",
      "You get furious when criticized because your fragile ego can't survive not being right.",
    ],
    moreCharacteristics: [
      'You mistake being brutally rude for "just telling the honest truth."',
      "Your strict perfectionism is a heavy cage that's keeping you from ever enjoying your real life.",
    ],
  },
  Dog: {
    light: "You're loyal, honest, and protective. You have a sharp sense for injustice, and you keep the secrets people trust you with.",
    shadow: 'You can get cynical and sharp-tongued. You assume people are going to betray you, and you lock your heart away before anyone gets the chance.',
    deep: "What actually moves you is loyalty that's been tested, people who stand with you when it counts. What devastates you is a friend's betrayal.",
    characteristics: [
      'You assume everyone is going to betray you, so you treat people coldly before they even have a chance.',
      "Your sharp, cynical tongue isn't wisdom. It's a shield protecting your easily bruised heart.",
      'You lock your heart in a safe box, then complain that the world feels cold and lonely.',
    ],
    moreCharacteristics: [
      'You stay in unhappy, dying situations because you confuse self-destruction with noble loyalty.',
      'You bark loudly at injustice outside to distract from the chaotic war waging inside your own soul.',
    ],
  },
  Pig: {
    light: "You're generous and full of real goodwill. You love feeding people, hosting people, and making sure everyone around you feels relaxed.",
    shadow: "You can get naive and over-indulgent. You let people take advantage of you more than once, and you'd rather eat or sleep through a problem than face it.",
    deep: "What actually moves you is warmth, real comfort, people you love around a table. What genuinely shocks you is cruelty and lies, since you don't expect them.",
    characteristics: [
      "You play the naive sweet soul because you're too scared to stand up and fight life's real battles.",
      'You let untrustworthy people trick you repeatedly because you\'re too cowardly to say an honest "no."',
      "You give things away to buy friendship because you're worried people won't like you just for who you are.",
    ],
    moreCharacteristics: [
      'You escape into comfort food and sleep to numb the painful problems you refuse to fix.',
      'Your peaceful attitude is often just a lazy excuse to avoid any difficult, messy work.',
    ],
  },
};

const WESTERN_IDENTITY = {
  Aries: {
    light: "You're full of pure energy and courage. You tackle hard things head-on, and you lead the charge for the people you care about.",
    shadow: 'You can get impatient and hot-headed. You throw a real tantrum when you lose, and you push past people without meaning to.',
    characteristics: [
      "You start explosive arguments just to burn off anxious energy you don't know how to manage.",
      "You act bulletproof because you're terrified that if you show a scratch, people will realize you're scared.",
      "You claim you love leading, but you're actually just terrified of anyone else having control over you.",
    ],
    moreCharacteristics: [
      'You run from your mistakes by racing into new projects, leaving a trail of broken things behind.',
      "Your intense impatience is really just a fear that if you don't get it now, it'll disappear forever.",
    ],
  },
  Taurus: {
    light: "You're steady, calm, and deeply patient. You build a beautiful, comfortable life, and you stand by your people like a solid wall.",
    shadow: "You can get stubborn and possessive. You refuse to budge even when you're wrong, and you block change just because it's change.",
    characteristics: [
      "You call it being steady, but everyone else knows you're just too scared to try something new.",
      'You treat your loved ones like personal property, clamping down so hard you slowly suffocate them.',
      "Your fierce, silent stubbornness isn't power. It's a deep fear that you can't survive in a changing world.",
    ],
    moreCharacteristics: [
      "You hold onto toxic people and bad habits just because you're too lazy to handle the change.",
      'You bury heavy sadness under shopping trips and rich food, pretending everything is fine.',
    ],
  },
  Gemini: {
    light: "You're quick, funny, and endlessly curious. You talk to anyone, and you keep the people around you entertained and connected.",
    shadow: "You can get two-faced and scattered. You tell different versions of the truth to different people, and you can't sit with one hard thing long enough to finish it.",
    characteristics: [
      'You talk a mile a minute so the conversation never stays still long enough to touch your real pain.',
      'You tell different versions of the truth to different people, leaving you confused about who you actually are.',
      'Behind your bright, witty jokes is a kid who worries their quiet self is completely empty.',
    ],
    moreCharacteristics: [
      'You change your opinions like coats just to fit in, making your real loyalty worthless.',
      "You call yourself curious, but you're just too scared to dive deep and stick to one difficult thing.",
    ],
  },
  Cancer: {
    light: "You're loving, protective, and intuitive. You build a warm home, and you notice the second someone you love is hurting.",
    shadow: 'You can get moody and manipulative. You go quiet to make someone feel guilty, and you hold onto an old hurt long after it should\'ve healed.',
    characteristics: [
      'You use tears and pouting moods to control the room and make everyone feel guilty.',
      "You smother the people you love because you're terrified they'll grow up and leave you behind.",
      'Your kindness is often a trap. You help people so they become permanently indebted to your care.',
    ],
    moreCharacteristics: [
      'You hold onto old slights like treasures, refusing to let your heart heal just to keep an excuse to be mad.',
      'You snap at people from inside your shell, then act shocked when they walk away from your claws.',
    ],
  },
  Leo: {
    light: "You're radiant and generous. You fill a room with warmth, and you make the people around you feel like stars.",
    shadow: 'You can get vain and attention-hungry. A single cold look from a stranger can wreck your whole day, and you turn conversations back to yourself without noticing.',
    characteristics: [
      'You act like a proud king, but a single cold look from a stranger can ruin your entire day.',
      'You fish for compliments constantly because your internal self-esteem is running completely empty.',
      "Deep down, you're terrified that if you aren't performing, you're completely unlovable.",
    ],
    moreCharacteristics: [
      "You turn every conversation into a story about yourself because you can't stand not being the main character.",
      "Your generosity is real, but you make sure there's an audience around to watch you give it.",
    ],
  },
  Virgo: {
    light: "You're helpful, efficient, and observant. You fix what's broken, and you bring order to real chaos.",
    shadow: 'You can get hyper-critical and anxious. You pick at small mistakes, other people\'s and your own, and you forget to actually enjoy anything.',
    characteristics: [
      'You focus on everyone else\'s tiny errors so nobody can see the chaotic panic inside your own mind.',
      "You're so terrified of making a mistake that you paralyze yourself from ever trying anything great.",
      "You complain that nobody helps you, but you push everyone away because they don't do it your exact way.",
    ],
    moreCharacteristics: [
      'Your helpful advice is often just a polite weapon you use to judge and look down on people.',
      'You treat your body and life like a machine, forgetting how to just breathe and feel joy.',
    ],
  },
  Libra: {
    light: "You're fair, artistic, and balanced. You make sure everyone's treated equally, and you build genuinely beautiful spaces.",
    shadow: 'You can get wishy-washy and conflict-avoidant. You change your mind to keep the peace, and you lose track of what you actually think.',
    characteristics: [
      "You're so busy trying to please everyone that you've become a hollow echo with no real opinions.",
      "You paralyze yourself over simple choices because you're too scared of anyone being upset with you.",
      "You look for a perfect relationship to fix you because you can't stand the asymmetry inside your own heart.",
    ],
    moreCharacteristics: [
      'You smile and act sweet to people\'s faces, then shred them to pieces with gossip the second they leave.',
      'Your love for peace is really just a cover for your fear of honest, messy confrontation.',
    ],
  },
  Scorpio: {
    light: "You're loyal, brave, and deeply transformative. You see straight through a lie, and you help people rebuild after something breaks them.",
    shadow: "You can get jealous and vengeful. You keep an old betrayal like a weapon, and you'd rather sting back than say you're hurt.",
    characteristics: [
      'You test people\'s boundaries with traps, then act vindicated when they finally stumble and fail.',
      'You demand absolute vulnerability from others while keeping your own heart locked in a steel safe.',
      "You hide in the shadows, terrified that if people saw your soft heart, they'd crush it instantly.",
    ],
    moreCharacteristics: [
      "Your intense suspicion isn't a superpower. It's just your own fear projected onto innocent people.",
      'You hold onto old betrayals like gold coins, letting the old poison ruin every fresh relationship you start.',
    ],
  },
  Sagittarius: {
    light: "You're joyful, adventurous, and big-picture. You love exploring new places and ideas, and you help people think bigger than they were.",
    shadow: 'You can get tactless and reckless. You call brutal honesty a virtue, and you bolt the second something gets emotionally heavy.',
    characteristics: [
      'You bolt out the door the second a relationship requires actual emotional work.',
      "You use brutal honesty like a club, hurting people's feelings just to feel powerful and smart.",
      'You act like a happy-go-lucky clown so nobody sees how low you actually feel when the sun goes down.',
    ],
    moreCharacteristics: [
      'Your constant hunting for adventure is really just an escape from the void inside your heart.',
      "You lecture everyone on how to live their life because you can't figure out how to manage your own.",
    ],
  },
  Capricorn: {
    light: "You're disciplined, ambitious, and patient. You climb toward something real step by step, and you protect your people with rock-solid duty.",
    shadow: 'You can get cold and status-obsessed. You judge people by what they\'ve achieved, and you trap yourself in endless work.',
    characteristics: [
      "You accumulate rules and work hours like armor, hoping it'll hide the vulnerable kid who felt small.",
      'You treat your family like a business project, tracking metrics instead of giving them real love.',
      "If you lost your status tomorrow, you'd look in the mirror and see a stranger.",
    ],
    moreCharacteristics: [
      "You judge people who show their feelings because you're too scared to let yourself feel your own.",
      "You call yourself realistic, but you're really just using pessimism to avoid dreaming big and failing.",
    ],
  },
  Aquarius: {
    light: "You're original, independent, and focused on the bigger picture. You invent things nobody else thought of, and you fight for fairness.",
    shadow: 'You can get detached and stubborn. You love humanity in the abstract more easily than the one person in front of you, and you rebel just to feel different.',
    characteristics: [
      'You love "humanity" in big groups because you\'re too terrified to love a single real person up close.',
      "You act like an eccentric outsider because you're scared that if you were normal, nobody would care about you.",
      'You live completely inside your head, leaving the people around you feeling cold and abandoned.',
    ],
    moreCharacteristics: [
      'You look down on human feelings as silly drama because you lack the courage to deal with your own.',
      'You disagree with every rule just to feel special, trapping yourself in your own stubborn rebellion.',
    ],
  },
  Pisces: {
    light: "You're creative, spiritual, and deeply kind. You feel the world's hidden beauty, and you comfort people without being asked.",
    shadow: 'You can get lost in avoidance. You escape into a daydream instead of a hard conversation, and you let people take advantage of your softness.',
    characteristics: [
      'You escape into daydream worlds because you lack the basic strength to handle real, everyday life.',
      'You absorb everyone else\'s problems like a sponge just to avoid looking at the breakdown inside yourself.',
      'Your beautiful sensitivity is often just a shield to escape any real, difficult accountability.',
    ],
    moreCharacteristics: [
      'You play the innocent, wounded party so people stop tracking the small lies you tell.',
      'You confuse toxic, painful relationships with "destiny," letting people hurt you over and over.',
    ],
  },
};

// Real-Life Example bank (2026-08-08, Today-page rework): 2-3 concrete,
// logically-coherent scenario images per number/animal/sign, curated
// straight from the user's own source PDFs (deduped across 3 independent
// copies of the same guide, keeping only genuinely distinct scenarios).
// Used to rotate imagery so a daily visitor doesn't see the same sentence
// every time their number is the featured one - see
// [[project_todo_reading_rework]] / feedback_deep_probing_questions for why
// this had to be sourced, not invented.
const REAL_LIFE_EXAMPLES = {
  1: [
    'the kid on the playground who invents a brand new game and gets everyone to play it by their rules',
    'the lone inventor working in a garage, building something nobody believed could ever work',
    'the lonely coder who builds an app from a messy bedroom and changes how the world talks despite everyone saying it was impossible',
  ],
  2: [
    'the friend who notices you\'re sad just from the way you typed a text and checks on you immediately',
    'the one who sits between two people mid-argument and quietly helps them find their way back to each other',
    'the assistant working behind the scenes, coordinating every piece so the person on stage looks perfect',
  ],
  3: [
    'the kid who tells an animated, hilarious story at dinner, acting out every voice until the whole table is laughing',
    'the artist painting a massive, colorful mural that turns a gray wall into something the whole block feels',
    'the creator whose fast, colorful work catches thousands of people off guard and makes them smile',
  ],
  4: [
    'the builder who measures three times and cuts once, so the thing they make outlasts them',
    'the student who color-codes the whole plan and finishes a week early while everyone else is still starting',
    'the one who quietly organizes the entire group project, sets the deadlines, and makes sure nobody\'s work gets lost',
  ],
  5: [
    'the backpacker who buys a one-way ticket to somewhere they don\'t even speak the language',
    'the kid who climbs the highest tree in the woods just to see what the view looks like from up there',
    'the creator who\'s already moved on to the next trend before anyone else even noticed the last one',
  ],
  6: [
    'the older sibling who automatically makes soup and finds a blanket the second someone in the house gets sick',
    'the parent who stays up all night sewing a costume so their kid\'s school play goes right',
    'the kid who finds an injured bird, builds it a warm box, and feeds it by hand every hour until it can fly again',
  ],
  7: [
    'the scientist who spends years staring through a microscope to solve a mystery that changes everything after',
    'the quiet mind who reads deep books alone, hunting for a pattern nobody else in the room even noticed was there',
    'the researcher running late-night experiments by themselves, piecing together something real one small step at a time',
  ],
  8: [
    'the CEO who builds something massive but makes sure it still leaves the world a little cleaner behind it',
    'the kid who turns a lawn-mowing gig into an actual operation, organizing friends and managing the schedule to make real money',
    'the one who coordinates the funding and the workers and the timeline for something enormous, and it actually gets built on time',
  ],
  9: [
    'the kid who fits in perfectly with the athletes, the artists, and the quiet ones, shifting completely depending on who they\'re sitting with',
    'the actor who doesn\'t just play the character, but actually becomes them, down to the voice and the posture',
  ],
  11: [
    'the teacher whose one sentence makes someone stop a bad habit on the spot, no lecture required',
    'the kid who gets a sudden gut feeling and somehow knows exactly how to help a friend, without being told a single thing',
    'the writer who wakes up at 3am to put something down on paper that moves an entire room to tears, and can\'t fully explain where it came from',
  ],
  22: [
    'the engineer who designs a system built to keep people safe for generations after they\'re gone',
    'the student who organizes an entire school district\'s recycling system from scratch, one plan at a time',
    'the one who coordinates funding and teams across countries so something that helps millions of people actually gets built',
  ],
  33: [
    'the kid who befriends the loneliest, most bullied classmate and quietly walks them back to believing in themselves',
    'the teacher who turns a struggling school around, one kid at a time, until every one of them finds their worth',
    'the healer who goes straight into a war zone to help, because that\'s where the help is actually needed',
  ],
  Rat: [
    'the kid who finds five hidden scholarships nobody else thought to dig for',
    'the manager who catches the one mistake in the budget that saves the whole company\'s funds overnight',
    'the one who always somehow knows the best deal in the room before anyone else has even looked',
  ],
  Ox: [
    'the one who quietly finishes the group project alone, late at night, after everyone else already gave up on it',
    'the farmer who\'s up before sunrise every single day for decades, without ever once complaining about it',
    'the one who stays on-site twelve hours straight to get the roof finished before the storm hits',
  ],
  Tiger: [
    'the kid who steps directly between the bully and the smaller student and just stares them down until they walk away',
    'the speaker whose passion in a single speech rallies a crowd that was silent five minutes earlier',
    'the leader who starts something new in the middle of a crash everyone else is running from',
  ],
  Cat: [
    'the quiet kid who notices exactly who\'s secretly upset in the room without anyone saying a word',
    'the diplomat who ends a dangerous standoff using nothing but soft, careful words',
    'the one who walks into a chaotic, loud space and turns it into somewhere calm just by rearranging it',
  ],
  Dragon: [
    'the student who steps on stage, commands the whole room instantly, and wins by a landslide',
    'the founder who launches the bold, risky thing in weeks flat while everyone else is still hedging',
    'the director who leads a massive crew and comes out the other side with something people remember for years',
  ],
  Snake: [
    'the quiet friend who looks at you for one second and says "you\'re pretending to be happy, what\'s actually wrong"',
    'the investigator who cracks the case everyone else gave up on by reading the one detail nobody else caught',
    'the quiet one who solves the riddle that stumped the entire school for weeks',
  ],
  Horse: [
    'the athlete whose sheer joy running the race pulls the entire team along with them to the win',
    'the one who jumps from idea to idea, powered by nothing but pure excitement, and somehow it keeps working',
    'the kid who signs up for the marathon out of nowhere and finishes it on stubborn energy alone',
  ],
  Goat: [
    'the kid who writes something beautiful, just to make a grieving grandmother feel a little less alone that day',
    'the designer whose soft, artistic work makes total strangers feel taken care of',
    'the one who builds a literal safe space out of art, where people finally feel okay enough to cry',
  ],
  Monkey: [
    'the kid who fixes the broken game everyone gave up on using a trick they figured out on their own',
    'the inventor who turns an annoying daily chore into something people actually want to do',
    'the one who makes something that costs nothing and somehow ends up reaching millions of people anyway',
  ],
  Rooster: [
    'the student who shows up first, sharp, with a notebook so neat it wins first place on its own',
    'the chef who won\'t let a single plate leave the kitchen unless it looks like it belongs in a gallery',
    'the planner who runs a massive event down to the second and nothing goes visibly wrong',
  ],
  Dog: [
    'the friend who stays out in the freezing rain just so nobody has to wait alone',
    'the lawyer who fights for someone who can\'t pay them, for free, against people with way more power',
  ],
  Pig: [
    'the kid who shares their whole lunch with someone who forgot theirs, no hesitation at all',
    'the host who throws the party everyone\'s invited to, and somehow makes every single guest feel like family',
  ],
  Aries: [
    'the kid who jumps in first, laughing, before anyone else works up the nerve to try it',
    'the emergency worker who runs straight toward the danger everyone else is running away from',
    'the founder who launches the bold new thing in weeks, ignoring everyone telling them to slow down',
  ],
  Taurus: [
    'the one who saves the good part for later just to actually enjoy it slowly, instead of rushing it',
    'the gardener who turns a rocky, useless plot into something thriving, one patient year at a time',
    'the chef who spends ten hours getting one sauce exactly right because exactly right is the whole point',
  ],
  Gemini: [
    'the student who\'s reading, listening to music, and holding a conversation all at the same time, and somehow keeping up with all three',
    'the host who can make an entire room laugh and switch topics three times without ever losing anyone',
    'the writer who turns out three completely different stories on three completely different topics in one single afternoon',
  ],
  Cancer: [
    'the kid who notices the one lonely classmate and quietly shares their cookies with them, no announcement needed',
    'the parent who turns a boring rainy weekend into a whole magical indoor camping trip',
    'the one who cooks the comfort food and just sits there listening for as long as it takes',
  ],
  Leo: [
    'the kid who takes the lead role on stage and still makes sure the whole cast gets a treat afterward',
    'the manager who takes the full blame for the team\'s mistake in public, then turns around and treats everyone to dinner',
    'the boss who throws money at making the team feel appreciated because the pride behind it is real',
  ],
  Virgo: [
    'the kid who reorganizes the entire messy garage and labels every single box without being asked',
    'the engineer who catches the one tiny structural flaw that would have collapsed the whole bridge',
    'the editor who finds the one typo on page four hundred that three other teams completely missed',
  ],
  Libra: [
    'the kid who spends twenty minutes splitting the cake exactly evenly so nobody feels shorted',
    'the designer whose color choices alone make a loud, messy room go instantly calm',
    'the diplomat who talks two furious sides into an actual peace agreement',
  ],
  Scorpio: [
    'the best friend who stands next to you when the whole room turns on you, and keeps your secret for good',
    'the therapist who walks someone all the way out of a tragedy and back into a real life',
  ],
  Sagittarius: [
    'the kid who packs a small bag on a whim to hike a trail they\'ve never seen, laughing off the rain that hits halfway through',
    'the student who spends an entire summer backpacking alone through a country just to learn the language',
    'the professor whose lectures on the road open up an entire auditorium\'s idea of what\'s possible',
  ],
  Capricorn: [
    'the student who studies two quiet hours a night for months and walks away with the highest grade in the state',
    'the teenager who works a part-time job for years just to buy their own car outright',
    'the executive who steers the whole company through a brutal recession and keeps it standing',
  ],
  Aquarius: [
    'the kid who builds something real out of literal junk parts to try to actually fix a piece of the world',
    'the student who starts an online movement that ends up pulling in twenty different schools',
    'the inventor who turns down the corporate money because keeping the thing pure mattered more',
  ],
  Pisces: [
    'the kid who gets completely lost in one song, crying real tears of pure joy over it',
    'the kid whose painting of the ocean somehow says exactly what they were feeling and couldn\'t say out loud',
    'the one whose voice alone is enough to make a scared, hurting person feel safe again',
  ],
};

// ============================================================
// Today-page reading, v2 (2026-08-08 Boost13 rebuild)
// ============================================================
// Doctrine locked in this session (see feedback_always_check_numerology_compat,
// project_number_meanings.md): every relationship claim runs the app's real
// numerologyCompat() score - never invented. Universal Day/Energy (today's
// date-only numbers, same for every visitor) always open the reading before
// any personal-comparison layer. Numerology always leads over zodiac in the
// personal-finding section. Year/Month zodiac and numerology context always
// stay one brief sentence regardless of how notable it is - only Day-level
// findings (the 4 numerology pairs, the zodiac Day comparison) carry real
// narrative weight. No raw numbers ever appear in the prose itself.

const ZODIAC_TRINE_GROUPS = [
  ['Rat', 'Dragon', 'Monkey'],
  ['Ox', 'Snake', 'Rooster'],
  ['Tiger', 'Horse', 'Dog'],
  ['Cat', 'Goat', 'Pig'],
];
const ZODIAC_HARMONY_PAIRS = [
  ['Rat', 'Ox'], ['Tiger', 'Pig'], ['Cat', 'Dog'],
  ['Dragon', 'Rooster'], ['Snake', 'Monkey'], ['Horse', 'Goat'],
];
const ZODIAC_ORDER = ['Rat', 'Ox', 'Tiger', 'Cat', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];

// Qualitative zodiac relation - no numeric compat table exists for the
// Vietnamese zodiac, so this codifies the real Six Harmonies/Trine/Clash
// structure (traditional, not invented) rather than guessing a relationship.
function zodiacRelation(a, b) {
  if (a === b) return { tier: 'same' };
  if (ZODIAC_HARMONY_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
    return { tier: 'harmony' };
  }
  const idxA = ZODIAC_ORDER.indexOf(a);
  const idxB = ZODIAC_ORDER.indexOf(b);
  if (idxA >= 0 && idxB >= 0 && Math.abs(idxA - idxB) === 6) {
    return { tier: 'clash' };
  }
  if (ZODIAC_TRINE_GROUPS.some((group) => group.includes(a) && group.includes(b))) {
    return { tier: 'trine' };
  }
  return { tier: 'neutral' };
}

// Standing "watch/do" bank, dictated by the user 2026-08-06/08 (see
// project_number_meanings.md) - checked ONLY against today's Universal Day
// root and Energy root, never the person's own numbers, since these
// represent the day's own universal energy: "regardless of the life path,
// it's just energy."
const STANDING_DAY_WATCH = {
  1: { kind: 'watch', icon: '⚠️', line: 'watch for picking random arguments today' },
  3: { kind: 'watch', icon: '⚠️', line: 'watch for getting scattered or talking too much' },
  4: { kind: 'do', icon: '✅', line: 'actually do the work today, not just plan it' },
  5: { kind: 'do', icon: '✅', line: 'get out, travel, be social today' },
  6: { kind: 'do', icon: '✅', line: 'spend real time with family specifically' },
  7: { kind: 'watch', icon: '⚠️', line: 'watch your body today, real risk of getting sick or hurt' },
  8: { kind: 'do', icon: '✅', line: 'make money moves today, just do not cut ethical corners doing it' },
  9: { kind: 'do', icon: '✅', line: 'release and adapt today, do not force what is not working' },
  11: { kind: 'watch', icon: '⚠️', line: 'watch for emotionally crashing out, ground the big feeling before acting on it' },
};

// Roots featured in a day's Watch/Actionables list, with the 7-vs-8 "enemy
// numbers" financial-timing exception applied: normally root 8 = make the
// money move, but if Universal Day x Life Path OR Energy x Day Born lands
// on a 7-and-8 combination specifically, that flips to a caution instead -
// don't start something NEW financially today, 11 is the better day for
// that. Confirmed scope (user, 2026-08-08): only those two pairs trigger
// this, not Day# x Day# or Life Path x Personal Day.
function getDayWatchItems(findings) {
  const roots = [];
  if (STANDING_DAY_WATCH[findings.uDayRoot]) roots.push(findings.uDayRoot);
  if (findings.energyRoot !== findings.uDayRoot && STANDING_DAY_WATCH[findings.energyRoot]) {
    roots.push(findings.energyRoot);
  }
  const items = roots.map((root) => Object.assign({ root: root }, STANDING_DAY_WATCH[root]));

  const financialPairs = findings.pairs.filter((p) => p.id === 'lifePath' || p.id === 'day');
  const hits78 = financialPairs.some((p) => (p.todayRoot === 7 && p.imageRoot === 8) || (p.todayRoot === 8 && p.imageRoot === 7));
  if (!hits78) return items;

  return items.map((item) => {
    if (item.root !== 8) return item;
    return {
      root: 8,
      kind: 'watch',
      icon: '⚠️',
      line: 'do not start new financial things today, 11 is a better day to start',
    };
  });
}

// Rebuild #3 (2026-08-08): consumes the app's REAL, already-weighted
// compatibility engine (computeCompatibility, compat-engine.js) instead of
// hand-rolling 4 equally-weighted pairs. That function already blends Life
// Path x Universal Day (60%), Day Born x Energy (35%), and Day-of-year x
// Day-of-year (5%) - real weights, already live on today.html today
// (`compatFull = computeCompatibility(me, day0)`). User, 2026-08-08: "you
// literally have my weighing scales" / "this has been the whole point, we
// literally have a compatibility scale as well" - the 4-pair equal-footing
// system this replaces let a 5%-weight number (Day#) compete evenly with a
// 60%-weight number (Life Path) for which finding got featured, which is
// exactly backwards. Nothing here recomputes a score - every score comes
// straight from computeCompatibility's own real math.
function computeDayFindings(birth, target) {
  const uDayEntry = compoundEntry(compoundRawUniversalDay(target));
  const energyEntry = compoundEntry(compoundRawEnergy(target));
  const dayNumEntry = compoundEntry(compoundRawDayNum(target));

  const lpEntry = compoundEntryForLifePath(getLifePath(birth), getLifePathCompound(birth));
  const dayBornEntry = compoundEntry(compoundRawEnergy(birth));
  const dayNumOwnEntry = compoundEntry(compoundRawDayNum(birth));

  const compat = computeCompatibility(birth, target);

  // Real weights straight from COMPAT_DEFAULT_WEIGHTS (compat-engine.js):
  // lifePath 0.60, dayNum 0.35, doy 0.05. `lead: true` marks the two pairs
  // whose "today" side IS Universal Day/Energy - the actual calendar day.
  // Day-of-year carries 5% weight in the real engine - "not the main
  // character" - so it is tagged `feature: false` and never becomes a
  // headline finding, only ever background-eligible.
  const pairDefs = [
    { id: 'lifePath', score: compat.numerology.lifePathScore, weight: 0.60, imageRoot: lpEntry.root, todayRoot: uDayEntry.root, lead: true, feature: true },
    { id: 'day', score: compat.numerology.dayScore, weight: 0.35, imageRoot: dayBornEntry.root, todayRoot: energyEntry.root, lead: true, feature: true },
    { id: 'doy', score: compat.numerology.doyScore, weight: 0.05, imageRoot: dayNumOwnEntry.root, todayRoot: dayNumEntry.root, lead: false, feature: false },
  ];
  const pairs = pairDefs.map((p) => Object.assign({}, p, { tier: scoreClass(p.score) }));

  const zYear = { target: getChineseZodiacYear(target), birth: getChineseZodiacYear(birth) };
  const zMonth = { target: getChineseMonth(target), birth: getChineseMonth(birth) };
  const zDay = { target: getChineseDaySign(target), birth: getChineseDaySign(birth) };

  return {
    uDayRoot: uDayEntry.root,
    energyRoot: energyEntry.root,
    dayNumRoot: dayNumEntry.root,
    lpRoot: lpEntry.root,
    dayBornRoot: dayBornEntry.root,
    dayNumOwnRoot: dayNumOwnEntry.root,
    pairs: pairs,
    compat: compat,
    zodiac: {
      // Real weights from the same engine: Year 60% / Month 30% / Day 10% -
      // Year dominates, opposite of the earlier "Day carries the weight"
      // doctrine from before this rebuild. Flagged to the user; using the
      // real engine weights here for consistency until told otherwise.
      year: Object.assign({}, zYear, { score: compat.vietnamese.yearScore, weight: 0.60, relation: zodiacRelation(zYear.target, zYear.birth) }),
      month: Object.assign({}, zMonth, { score: compat.vietnamese.monthScore, weight: 0.30, relation: zodiacRelation(zMonth.target, zMonth.birth) }),
      day: Object.assign({}, zDay, { score: compat.vietnamese.daySignScore, weight: 0.10, relation: zodiacRelation(zDay.target, zDay.birth) }),
    },
  };
}

// Which pair(s) actually get featured in the personal-finding section.
// Rebuild #3 (2026-08-08): only `feature: true` pairs (Life Path 60%, Day
// 35%) are eligible - Day-of-year (5%) never becomes a headline finding no
// matter how extreme its score, since it is not "the main character."
// Ranked by weight first, score second - the 60%-weight pair wins a tie
// over the 35%-weight one even at an identical score. A mixed day (one
// good + one bad among the featurable pairs) gets both, balanced. Only-
// good or only-bad features the higher-weight one. A quiet day (both
// featurable pairs mid) still leads with Life Path (highest weight),
// framed as steady.
function selectFeaturedFinding(findings) {
  const featurable = findings.pairs.filter((p) => p.feature);
  const byWeight = (a, b) => b.weight - a.weight;
  const goods = featurable.filter((p) => p.tier === 'good').sort((a, b) => byWeight(a, b) || b.score - a.score);
  const bads = featurable.filter((p) => p.tier === 'bad').sort((a, b) => byWeight(a, b) || a.score - b.score);

  if (goods.length && bads.length) {
    return { dayType: 'mixed', good: goods[0], bad: bads[0] };
  }
  if (goods.length) {
    return { dayType: 'good', lead: goods[0] };
  }
  if (bads.length) {
    return { dayType: 'bad', lead: bads[0] };
  }
  const steady = featurable.slice().sort(byWeight)[0];
  return { dayType: 'quiet', lead: steady };
}

function pickExample(key) {
  const list = REAL_LIFE_EXAMPLES[key];
  if (!list || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

// Same as pickExample, but avoids repeating an image already used elsewhere
// in this same reading - matters when the good and bad findings resolve to
// the SAME root (a real, not-rare case: e.g. someone's own Day# and Day
// Born can both land on the same digit), which would otherwise risk both
// halves of a mixed day quoting the identical scenario.
function pickExampleExcluding(key, usedImage) {
  const list = REAL_LIFE_EXAMPLES[key];
  if (!list || !list.length) return null;
  const pool = usedImage ? list.filter((x) => x !== usedImage) : list;
  const finalPool = pool.length ? pool : list;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

// No announcing lead-in phrases ("Something on your side today:", "Worth
// watching today:") - user, 2026-08-08: "too template-y, cut them." The
// good/bad framing now comes purely from which trait (light vs shadow) gets
// used, not from a meta-label declaring what slot the sentence fills. Good
// and bad findings render as two separate paragraphs (goodText/badText),
// not blended into one with a connector - so no connector bank is needed.
const QUIET_CLOSERS = [
  ' Otherwise, today reads pretty steady.',
  ' Beyond that, nothing dramatic today.',
  ' Outside of that, today is pretty even.',
];

function pickRotating(bank) {
  return bank[Math.floor(Math.random() * bank.length)];
}

// A compoundEntry()-resolved root is always one of 1-9, 11, 22, 33, or the
// special fixed compound 28 - NUMBER_IDENTITY_V2 only covers the first 12,
// so 28 (a real, valid Day Born/Day# value whenever a day-of-month or
// day-of-year is literally 28) falls back to the app's own already-curated
// COMPOUND_FIXED_STOP[28] content instead of silently going blank.
function identityFor(root) {
  if (root === 28) return COMPOUND_FIXED_STOP[28];
  return numberIdentityV2(root, false);
}

// One-word archetype per root, taken directly from the source PDF's own
// entity titles (Pioneer, Storyteller, Builder, Seeker, Executive...) -
// used to name BOTH sides of a comparison concretely instead of an
// abstract "good"/"bad" label.
const ROOT_NOUN = {
  1: 'pioneer', 2: 'peacemaker', 3: 'storyteller', 4: 'builder', 5: 'explorer',
  6: 'caretaker', 7: 'seeker', 8: 'executive', 9: 'mirror', 11: 'antenna',
  22: 'master builder', 33: 'guardian', 28: 'wealth-builder',
};

// Describes a PAIR (today's root vs the person's root) the way a featured
// finding needs it - the whole point of this system is the comparison
// itself, not one side described in isolation. User, 2026-08-08, after a
// version that only named one root: "it's doing a comparison, compatibility
// wise, it's not just grabbing shit just to grab it." Explicitly states
// whether today's energy clashes with or supports the person's side (real
// numerologyCompat() tier, not felt-sense), names both archetypes, then
// backs it with the person's light/shadow sentence and a real image.
// Returns { text, image, todayNoun, personNoun } so a caller building a
// two-part reading can exclude an already-used image on a root repeat.
// Rebuild #3 (2026-08-08): the only two pairs that ever reach this function
// now are `lifePath` and `day` (both `lead: true`, `feature: true`) - doy
// (5% weight) is excluded from featuring entirely in selectFeaturedFinding,
// so there is no longer a "secondary/non-leading" case to frame differently.
// Both featured pairs are always genuinely about Universal Day or Energy,
// so the direct "Today's ___ energy..." framing is always correct here.
function describeComparisonFinding(pair, lean, excludeImage) {
  const personIdentity = identityFor(pair.imageRoot);
  if (!personIdentity) return { text: '', image: null };
  const todayNoun = ROOT_NOUN[pair.todayRoot] || 'today\'s energy';
  const personNoun = ROOT_NOUN[pair.imageRoot] || 'your side';
  const sameNoun = pair.todayRoot === pair.imageRoot;
  const relSentence = sameNoun
    ? (lean === 'good'
      ? `You and today are both running ${personNoun} energy, and for you that's a real boost.`
      : `You and today are both running ${personNoun} energy - but two of the same thing does not automatically mean smooth, this one is a real clash.`)
    : (lean === 'good'
      ? `Today's ${todayNoun} energy actually pairs well with your ${personNoun} side.`
      : `Today's ${todayNoun} energy clashes with your ${personNoun} side.`);
  const trait = lean === 'good' ? personIdentity.light : personIdentity.shadow;
  const image = pickExampleExcluding(pair.imageRoot, excludeImage);
  const text = image ? `${relSentence} ${trait} Think ${image}.` : `${relSentence} ${trait}`;
  return { text: text, image: image, todayNoun: todayNoun, personNoun: personNoun };
}

// Actionables source (2026-08-08 rebuild #2): the actual "Universal /
// Calendar Day Action Plan" per number, straight from the user's newest PDF
// (aa95df9a-The13G.pdf, "The Ultimate Cosmic Blueprint") - 5 real Do's and
// 5 real Don'ts per number, written specifically for this exact use case
// (literally titled "Universal / Calendar Day Action Plan"). No
// interpretation or reframing needed - verbatim from the source.
const PDF_ACTION_PLAN = {
  1: {
    do: ["start that new project or hobby you've postponed", 'wear a bold outfit that makes you stand out', 'make a big decision entirely by yourself', 'speak up first in a meeting or class', 'do 20 jumping jacks to wake up your inner warrior'],
    dont: ["wait around for someone else's permission", 'copy what your friends are doing today', 'shrink your voice to make others comfortable', 'spend the day lazily scrolling through social media', 'let past mistakes dictate your next move'],
  },
  2: {
    do: ['write a heartfelt thank-you note to a close friend', 'work in a team or pair up for chores today', 'spend time listening deeply without interrupting', 'buy a small treat or flower for someone you love', 'take long, deep breaths when you feel tense'],
    dont: ['get dragged into screaming matches or messy arguments', 'agree to something that makes your stomach twist up', 'make big decisions completely on your own without checking in', 'hide your true feelings under a fake, polite smile', 'forget to drink water and care for your physical body'],
  },
  3: {
    do: ['draw, paint, sing, or write something purely for fun', 'tell a funny joke or story to make someone laugh out loud', 'wear something bright, happy, and expressive', 'call a friend just to chat and share positive vibes', 'let your inner child out to play and run around'],
    dont: ['spend the day gossiping or spreading rumors about anyone', 'suppress your creative impulses or ideas', 'overcomplicate things or worry about boring details', 'hide your talents because you are scared of being judged', 'take life too seriously today, let it go'],
  },
  4: {
    do: ['clean your room, desk, or backpack thoroughly', 'write down a clear budget or a to-do list for the week', 'do some grounding exercise, like walking barefoot on grass', "complete a difficult task you've been putting off", 'double-check your schedule so you are exactly on time'],
    dont: ['slouch or leave your living spaces messy and unorganized', 'try to take quick, lazy shortcuts on important work', "refuse to listen to someone else's new suggestion", 'spend money on reckless, unnecessary items', 'overwork yourself to the point of utter exhaustion'],
  },
  5: {
    do: ['take a completely new path or street home today', "try an unusual food or flavor you've never had before", "do something spontaneous that isn't on your schedule", 'meet or chat with a new person from a different background', 'shake up your body by dancing to high-energy music'],
    dont: ['stick to the exact same boring routine all day', 'make permanent, heavy life promises today if you can avoid it', 'overindulge in junk food, video games, or quick distractions', 'run away from a difficult conversation that needs fixing', 'force yourself to sit completely still for long hours'],
  },
  6: {
    do: ['check in on a family member or cook a delicious meal', 'add something beautiful, like a plant, to your room', 'pamper yourself with a long, warm bath or self-care routine', 'help someone solve a problem, but only if they ask', 'forgive someone and let go of an old grudge'],
    dont: ['poke your nose into drama that has nothing to do with you', 'over-commit to helping others until you are completely exhausted', 'criticize small, imperfect details around you today', 'play the victim or complain about how much you do', 'ignore your own health and emotional needs'],
  },
  7: {
    do: ['read an interesting book, watch a documentary, or learn something brand new', 'spend at least one hour in total, healing silence', 'meditate, journal your wildest dreams, or ponder deep life questions', 'go for a solo walk in a quiet forest or park', 'trust your immediate gut instincts completely today'],
    dont: ['engage in shallow small talk or meaningless neighborhood gossip', 'crowd your mind with loud noises and chaotic crowds', 'overthink a simple problem until it turns into a massive disaster', 'be distrustful or suspicious of people who love you', 'ignore your inner voice just to follow the group'],
  },
  8: {
    do: ['organize your money, savings, or review your big life goals', 'act with absolute power and step up as a bold leader', 'give generously to someone in need or buy someone lunch', 'stand up straight with your shoulders back and walk proudly', 'face a difficult financial or business choice head-on'],
    dont: ['think with a scarcity mindset or complain about being broke', 'bully, boss around, or dominate people who are weaker', 'spend money recklessly on expensive items just to show off', 'let fear or self-doubt make you shrink into the background', 'be unfair or cut dishonest corners to win quickly'],
  },
  9: {
    do: ['throw away or donate old clothes, broken items, or clear clutter', 'finish an ongoing project completely instead of starting something new', 'forgive someone from your past and officially let the matter drop', 'look in the mirror and say, "I am proudly myself, completely independent"', 'spend time around highly positive, clean-energy people'],
    dont: ['hold onto old arguments, hurts, or past regrets today', 'try to morph or change your true opinions just to please a crowd', 'start massive new long-term commitments today', 'absorb the negative, grumpy moods of people around you', 'run away from an ending or a goodbye that needs to happen'],
  },
  11: {
    do: ['pay close attention to your weird dreams or random gut feelings today', 'write down any sudden, wild ideas that pop into your head', 'stand up as a bold beacon of inspiration for someone else', 'keep your body calm with gentle stretches or deep meditation', 'look out for subtle signs, coincidences, or magic patterns'],
    dont: ['ignore your absolute gut feelings or write them off as silly', 'drink tons of caffeine or sugar that sparks nervous anxiety', 'stay stuck in toxic, negative environments that drain you', 'dismiss your own grand, visionary dreams as totally impossible', 'spend the whole day overthinking minor details'],
  },
  22: {
    do: ['take a major, concrete step toward a massive lifetime dream', 'sketch out a highly detailed, long-term master plan or map', 'focus entirely on tasks that help a huge group of people', 'think incredibly big, do not limit your imagination today', 'organize a major, chaotic mess into a perfect system'],
    dont: ['think small, play safe, or let petty doubts hold you back', 'focus exclusively on selfish or tiny personal gains', 'give up when a massive project gets incredibly difficult', 'let lazy, unstructured disorganization ruin your schedule', 'ignore your physical health or forget to eat regular meals'],
  },
  33: {
    do: ['teach or guide someone with absolute, endless patience', 'perform a completely random, beautiful act of secret kindness', 'radiate pure joy, positive compliments, and warm smiles', 'take extra care of your own emotional heart space today', 'speak up boldly for someone who has no voice to defend themselves'],
    dont: ["absorb the world's heavy trauma or scroll through dark news", 'hold high, critical expectations over imperfect people', 'neglect your own health to play the ultimate martyr', 'let negative, bitter energy change your kind nature today', 'complain about how much emotional weight you carry'],
  },
};

function pickRandomFrom(list) {
  return list && list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

// Builds 1-2 real lines: always one from Universal Day's own list (the
// lead - "universal day and calendar day... main ingredients of the soup"),
// plus one from the specific featured pair's own root when it differs -
// user, 2026-08-08: "try to match them to whatever energies are on there...
// try and make them the most relevant to the energy mix." Two real
// numbers' real content, not one number stretched to cover a mix it was
// never written for.
function buildActionItems(uDayRoot, secondaryRoot, kind) {
  const items = [];
  const leadEntry = PDF_ACTION_PLAN[uDayRoot];
  const leadLine = leadEntry ? pickRandomFrom(leadEntry[kind]) : null;
  if (leadLine) items.push(leadLine);
  if (secondaryRoot && secondaryRoot !== uDayRoot) {
    const secEntry = PDF_ACTION_PLAN[secondaryRoot];
    const secLine = secEntry ? pickRandomFrom(secEntry[kind]) : null;
    if (secLine && secLine !== leadLine) items.push(secLine);
  }
  return items;
}

// The full narrative: Universal Day opens (same for everyone), then the
// featured personal finding, then zodiac - Day-level only if genuinely
// notable, Year/Month always exactly one brief context sentence regardless
// of magnitude. No numbers ever appear in the prose (Boost13, round 4).
// Returns { findings, featured, watchItems, openText, goodText, badText,
// backgroundText } - separate pieces, not one blended string. User,
// 2026-08-08: "make one paragraph for what's good and one paragraph for
// what could improve, you don't have to blend it all like that, that is
// super confusing." A mixed day gets BOTH goodText and badText as two
// distinct paragraphs (no connecting conjunction); good/bad-only days get
// just the one that applies; a quiet day's single steady finding goes in
// goodText. Zodiac/numerology system labels (animal names, "day-animal",
// "Universal Day", etc.) never appear in openText/goodText/badText - only
// backgroundText is allowed to name the underlying system, per the user's
// explicit scope: "background only, the one that matters."
function composeDayReading(birth, target) {
  const findings = computeDayFindings(birth, target);
  const featured = selectFeaturedFinding(findings);

  // DAY_ENERGY, not NUMBER_IDENTITY_V2 - the opener describes what today's
  // energy draws out of whoever it lands on, not a personal identity claim
  // ("you're a natural protector" is only true if the person IS actually a
  // 6; most days the Universal Day root isn't the reader's own number at
  // all). Root 28 isn't in DAY_ENERGY's source PDF, but COMPOUND_FIXED_STOP
  // was already written in this same day-energy voice, so it needs no
  // separate handling here.
  // Split light/shadow (2026-08-12): the shadow used to ride at the end of
  // openText, which left the "See more" popup all-positive on good days -
  // user: "it's only saying what's good but not what to watch out for."
  // openText now carries just the light; the shadow becomes its own
  // always-present watchText section so every day type names its risk.
  const uDayEnergy = DAY_ENERGY[findings.uDayRoot] || COMPOUND_FIXED_STOP[findings.uDayRoot];
  let openText = '';
  let watchText = '';
  if (uDayEnergy) {
    openText = uDayEnergy.light;
    watchText = uDayEnergy.shadow;
  }

  let goodText = '';
  let badText = '';
  if (featured.dayType === 'mixed') {
    const goodPart = describeComparisonFinding(featured.good, 'good');
    const badPart = describeComparisonFinding(featured.bad, 'bad', goodPart.image);
    goodText = goodPart.text;
    badText = badPart.text;
  } else if (featured.dayType === 'good') {
    goodText = describeComparisonFinding(featured.lead, 'good').text;
  } else if (featured.dayType === 'bad') {
    badText = describeComparisonFinding(featured.lead, 'bad').text;
  } else {
    goodText = describeComparisonFinding(featured.lead, 'good').text + pickRotating(QUIET_CLOSERS);
  }

  // Plain juxtaposition, never "against" - the target/birth values can be
  // literally identical (e.g. same Year animal), and "against" implies a
  // comparison or opposition that misleads when there is nothing to
  // contrast. Year/Month always stay this one flat background sentence
  // regardless of how notable they are (numerology doctrine applies here
  // too - Day carries the real weight, Year/Month are just context). The
  // Day-level zodiac comparison also lives here now, not in the main
  // narrative, since it is the one place zodiac terms are allowed.
  // Says outright whether the two animals actually get along (real Six
  // Harmonies/Trine/Clash relation, not just naming them) - user, 2026-08-08:
  // "literally say if they do good with each other, like Rat month and
  // Monkey month do."
  function relationNote(tier) {
    if (tier === 'harmony') return ', a natural match';
    if (tier === 'trine') return ', they get along great';
    if (tier === 'clash') return ', a bit of a clash';
    return '';
  }
  const sameYear = findings.zodiac.year.target === findings.zodiac.year.birth;
  const sameMonth = findings.zodiac.month.target === findings.zodiac.month.birth;
  const yearPart = sameYear
    ? `it's a ${findings.zodiac.year.target} year, same as your own birth year`
    : `it's a ${findings.zodiac.year.target} year (you were born in a ${findings.zodiac.year.birth} year${relationNote(findings.zodiac.year.relation.tier)})`;
  const monthPart = sameMonth
    ? `a ${findings.zodiac.month.target} month, same as your own birth month`
    : `a ${findings.zodiac.month.target} month (you were born in a ${findings.zodiac.month.birth} month${relationNote(findings.zodiac.month.relation.tier)})`;

  let dayZodiacPart = '';
  const dayRel = findings.zodiac.day.relation.tier;
  if (dayRel === 'same' || dayRel === 'harmony') {
    dayZodiacPart = ` Your own ${findings.zodiac.day.birth} day-animal also lines up well with today's ${findings.zodiac.day.target} day.`;
  } else if (dayRel === 'clash') {
    dayZodiacPart = ` Your own ${findings.zodiac.day.birth} day-animal and today's ${findings.zodiac.day.target} day are a clash, for what it's worth.`;
  }

  const backgroundText = `${yearPart[0].toUpperCase()}${yearPart.slice(1)}, and ${monthPart}.${dayZodiacPart}`;

  // Actionables: Universal Day always contributes the lead Do and lead
  // Don't (the main ingredient); the specific pair already featured in the
  // paragraphs contributes a second, supporting Do/Don't from its OWN real
  // PDF list when its root differs from Universal Day - "the energy mix,"
  // not one number's list stretched to cover a combination it was never
  // written for. Mixed day: good pair feeds the Do, bad pair feeds the
  // Don't (matching which finding they already reinforce in the paragraph
  // above). Good/quiet day: lead pair feeds the Do only. Bad day: lead
  // pair feeds the Don't only. The fixed standing Watch item(s) - separate,
  // user-dictated, root 1-11 only - always come last.
  const actionables = [];
  // Uses todayRoot here, NOT imageRoot - imageRoot is the person's fixed
  // trait (Life Path, Day Born...), which is never actually "a day" and
  // has no business pulling from a bank literally titled "Universal /
  // Calendar Day Action Plan." todayRoot is always the pair's real
  // day-varying side (Universal Day, Energy, today's Day#, or Personal
  // Day), which is the only category this content bank was written for.
  let doSecondary = null;
  let dontSecondary = null;
  if (featured.dayType === 'mixed') {
    doSecondary = featured.good.todayRoot;
    dontSecondary = featured.bad.todayRoot;
  } else if (featured.dayType === 'good' || featured.dayType === 'quiet') {
    doSecondary = featured.lead.todayRoot;
  } else if (featured.dayType === 'bad') {
    dontSecondary = featured.lead.todayRoot;
  }
  // If the featured pair's todayRoot collapsed onto Universal Day itself
  // (e.g. a quiet day defaults to the Life Path pair, whose todayRoot IS
  // Universal Day - the same root buildActionItems already uses as the
  // lead), fall back to the Energy pair's todayRoot instead of silently
  // losing the second item. Universal Day and Energy are BOTH "leading"
  // per doctrine, not just Universal Day alone - only when they are
  // literally the same number on a given date does this genuinely
  // collapse to one item, which is honest, not a bug.
  const dayPair = findings.pairs.find((p) => p.id === 'day');
  if (doSecondary === findings.uDayRoot && dayPair) doSecondary = dayPair.todayRoot;
  if (dontSecondary === findings.uDayRoot && dayPair) dontSecondary = dayPair.todayRoot;
  buildActionItems(findings.uDayRoot, doSecondary, 'do').forEach((line) => {
    actionables.push({ kind: 'do', icon: '✅', line: `Do: ${cap(line)}.` });
  });
  buildActionItems(findings.uDayRoot, dontSecondary, 'dont').forEach((line) => {
    actionables.push({ kind: 'dont', icon: '🚫', line: `Don't: ${cap(line)}.` });
  });
  const watchItems = getDayWatchItems(findings);
  watchItems.forEach((w) => actionables.push(w));

  return {
    findings: findings,
    featured: featured,
    watchItems: watchItems,
    actionables: actionables,
    openText: openText,
    watchText: watchText,
    goodText: goodText,
    badText: badText,
    backgroundText: backgroundText,
  };
}

// Round 2 (2026-08-07): the connector-rotation composer above read as a
// template loop, exactly what the user's original Boost13 answer ruled
// out ("written fresh each time, no fixed template phrase"). Real fix:
// tag every entity with a REGISTER (what kind of energy it runs on), so
// the composer knows which pairs genuinely reinforce each other (same or
// allied register - "amplify"), which pull in real opposite directions
// ("tension" - the user's own doctrine: internal pull, never framed as an
// external enemy), and which just sit side by side (no defined relation -
// "neutral"). This is what made the hand-written sample readings work:
// noticing Capricorn's discipline running right alongside Horse-year
// restlessness, or the 33/6 caretaker sitting next to Aries/Dragon's
// hunger for the spotlight.
//
// Hard constraint (user, round 2): "I don't want you to invent too much,
// keep what I gave you, only make it flow right." So every connector
// below is purely STRUCTURAL - it never asserts a new psychological
// claim, only that a pattern already stated is showing up again (amplify)
// or that something already stated runs the opposite way (tension). The
// actual descriptive content inserted is always the entity's own
// light/shadow text, verbatim, never reworded or expanded on.
const REGISTER = {
  DISCIPLINE: 'DISCIPLINE', FREEDOM: 'FREEDOM', CARETAKING: 'CARETAKING',
  PRIVATE: 'PRIVATE', SPOTLIGHT: 'SPOTLIGHT', SOCIAL: 'SOCIAL',
  ADAPTIVE: 'ADAPTIVE', INTUITIVE: 'INTUITIVE',
};

// Every entity's primary register, tagged from its own light/shadow text
// above (never a new judgment beyond what that text already says).
const NUMBER_REGISTER = {
  1: REGISTER.SPOTLIGHT, 2: REGISTER.CARETAKING, 3: REGISTER.SOCIAL,
  4: REGISTER.DISCIPLINE, 5: REGISTER.FREEDOM, 6: REGISTER.CARETAKING,
  7: REGISTER.PRIVATE, 8: REGISTER.DISCIPLINE, 9: REGISTER.ADAPTIVE,
  11: REGISTER.INTUITIVE, '11i': REGISTER.INTUITIVE,
  22: REGISTER.DISCIPLINE, '22i': REGISTER.DISCIPLINE,
  33: REGISTER.CARETAKING, '33i': REGISTER.CARETAKING,
};
const VIETNAMESE_REGISTER = {
  Rat: REGISTER.PRIVATE, Ox: REGISTER.DISCIPLINE, Tiger: REGISTER.SPOTLIGHT,
  Cat: REGISTER.PRIVATE, Dragon: REGISTER.SPOTLIGHT, Snake: REGISTER.PRIVATE,
  Horse: REGISTER.FREEDOM, Goat: REGISTER.CARETAKING, Monkey: REGISTER.SOCIAL,
  Rooster: REGISTER.DISCIPLINE, Dog: REGISTER.CARETAKING, Pig: REGISTER.CARETAKING,
};
const WESTERN_REGISTER = {
  Aries: REGISTER.SPOTLIGHT, Taurus: REGISTER.DISCIPLINE, Gemini: REGISTER.SOCIAL,
  Cancer: REGISTER.CARETAKING, Leo: REGISTER.SPOTLIGHT, Virgo: REGISTER.DISCIPLINE,
  Libra: REGISTER.ADAPTIVE, Scorpio: REGISTER.PRIVATE, Sagittarius: REGISTER.FREEDOM,
  Capricorn: REGISTER.DISCIPLINE, Aquarius: REGISTER.FREEDOM, Pisces: REGISTER.CARETAKING,
};

function entityRegister(p) {
  if (p.kind === 'number') return NUMBER_REGISTER[p.impure ? `${p.root}i` : p.root] || NUMBER_REGISTER[p.root];
  if (p.kind === 'animal') return VIETNAMESE_REGISTER[p.key];
  if (p.kind === 'sign' || p.kind === 'planet') return WESTERN_REGISTER[p.key];
  return null;
}

// Natural opposite-register pairs - the only relationships treated as
// "tension". Everything not listed here (including any register paired
// with itself, handled separately as "amplify") is "neutral".
const REGISTER_TENSION = [
  [REGISTER.DISCIPLINE, REGISTER.FREEDOM],
  [REGISTER.PRIVATE, REGISTER.SOCIAL],
  [REGISTER.CARETAKING, REGISTER.SPOTLIGHT],
  [REGISTER.ADAPTIVE, REGISTER.PRIVATE],
  [REGISTER.INTUITIVE, REGISTER.DISCIPLINE],
];

function registerRelation(a, b) {
  if (!a || !b) return 'neutral';
  if (a === b) return 'amplify';
  const isTension = REGISTER_TENSION.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return isTension ? 'tension' : 'neutral';
}

// Purely connective phrase banks - no trait claims live here, only the
// structural relationship between what was just said and what comes next.
// 3-4 variants each so a long reading never repeats a connector.
const CONNECT_AMPLIFY = [
  'That same pull shows up again here.',
  "It's not the only place that current runs.",
  'The same energy carries into this too.',
  "That doesn't stand alone either.",
];
const CONNECT_TENSION = [
  'Right alongside that is a part of you that wants the opposite.',
  "That's not the whole picture though. Something else in you pulls the other way.",
  'At the same time, a different current runs right against that.',
  "None of that matches the part of you that's about to show up.",
];
const CONNECT_NEUTRAL = [
  "There's also this, a separate part of you.",
  'On top of that is something else entirely.',
  'Alongside all of it is one more piece.',
];

let connectUseIdx = { amplify: 0, tension: 0, neutral: 0 };
function nextConnector(relation) {
  const bank = relation === 'amplify' ? CONNECT_AMPLIFY : relation === 'tension' ? CONNECT_TENSION : CONNECT_NEUTRAL;
  const i = connectUseIdx[relation] % bank.length;
  connectUseIdx[relation]++;
  return bank[i];
}

function resolveEntry(p) {
  if (p.kind === 'number') return numberIdentityV2(p.root, p.impure);
  if (p.kind === 'animal') return VIETNAMESE_IDENTITY[p.key];
  // A planet part reads as its SIGN's identity (the blend pairs the
  // planet's role line with the sign content the person actually has
  // there - user's call, 2026-08-13).
  if (p.kind === 'sign' || p.kind === 'planet') return WESTERN_IDENTITY[p.key];
  return null;
}

// Famous Lookup needs the same general reading, just not addressed to
// "you" - a real person's own numbers, but not the profile owner's. Pure
// mechanical pronoun swap over the finished text (never touches the
// source content bank) - preposition-object "you" (to/with/for you...)
// becomes "them", everything else (subject "you", "you're", "your")
// becomes "they"/"they're"/"their". User: "add it but don't give it you
// voice, just use general reading language."
// Verb/phrase patterns whose object is "you" in this content bank,
// applied AFTER the generic subject pass turns them into "...they..." -
// a plain subject/object heuristic can't tell these apart from text
// alone, so this is a curated list built by auditing every light/shadow/
// deep/cherry entry's actual transformed output (204 lines) rather than
// guessed. "moves they is" alone covers all 12 animals' `deep` field,
// which all open with the same "What actually moves you is" line.
const THIRD_PERSON_OBJECT_FIXUPS = [
  [/\bmoves they is\b/g, 'moves them is'], [/\bhits they\b/g, 'hits them'],
  [/\bhelping they\b/g, 'helping them'], [/\bthank they\b/g, 'thank them'],
  [/\bsets they off\b/g, 'sets them off'], [/\btaking they for granted\b/g, 'taking them for granted'],
  [/\bguts they is\b/g, 'guts them is'], [/\bcosts they more\b/g, 'costs them more'],
  [/\bbothering they\b/g, 'bothering them'], [/\bliking they than\b/g, 'liking them than'],
  [/\bwound they more\b/g, 'wound them more'], [/\bfreezes they out\b/g, 'freezes them out'],
  [/\bjust they outrunning\b/g, 'just them outrunning'], [/\bpanics they is\b/g, 'panics them is'],
  [/\bparalyze they completely\b/g, 'paralyze them completely'], [/\bbreaks they down\b/g, 'breaks them down'],
  [/\btests they\./g, 'tests them.'], [/\binsults they is\b/g, 'insults them is'],
  [/\birritates they fastest\b/g, 'irritates them fastest'], [/\bcriticizes they\b/g, 'criticizes them'],
  [/\btrust they with\b/g, 'trust them with'], [/\bbetray they,/g, 'betray them,'],
  [/\bdevastates they is\b/g, 'devastates them is'], [/\bwalk over they\b/g, 'walk over them'],
  [/\bbeing they\b/g, 'being them'], [/\breally they\./g, 'really them.'],
  [/\bshocks they is\b/g, 'shocks them is'], [/\blike they for\b/g, 'like them for'],
];

// Famous Lookup needs the same general reading, just not addressed to
// "you" - a real person's own numbers, but not the profile owner's. Pure
// mechanical pronoun swap over the finished text (never touches the
// source content bank). Order matters: contractions first (so "before
// you've" doesn't get half-matched by the preposition pass below), then
// preposition-object "you" (in/to/with/for you...) becomes "them",
// everything else (subject "you", "you're", "your") becomes "they"/
// "they're"/"their", then the curated object-verb fixups correct the
// specific direct-object cases a preposition list can't catch (thank
// you, trust you, wound you...). "than"/"like" are deliberately NOT
// treated as object-triggering prepositions - "more than you should",
// "than you were" are elliptical comparisons wanting subject case
// ("they"), which the plain fallback already gets right. User: "add it
// but don't give it you voice, just use general reading language."
function toThirdPerson(text) {
  let out = text
    .replace(/\b(You've|you've)\b/g, (m) => (m[0] === 'Y' ? "They've" : "they've"))
    .replace(/\b(You'd|you'd)\b/g, (m) => (m[0] === 'Y' ? "They'd" : "they'd"))
    .replace(/\b(You're|you're)\b/g, (m) => (m[0] === 'Y' ? "They're" : "they're"))
    .replace(/\b(Yourself|yourself)\b/g, (m) => (m[0] === 'Y' ? 'Themself' : 'themself'))
    .replace(/\b(Yours|yours)\b/g, (m) => (m[0] === 'Y' ? 'Theirs' : 'theirs'))
    .replace(/\b(Your|your)\b/g, (m) => (m[0] === 'Y' ? 'Their' : 'their'))
    .replace(/\b(to|with|for|from|on|near|around|before|without|toward|of|behind|in|over)\s+(You|you)\b/g, (m, prep) => `${prep} them`)
    .replace(/\b(You|you)\b/g, (m) => (m === 'You' ? 'They' : 'they'));
  THIRD_PERSON_OBJECT_FIXUPS.forEach(([pattern, replacement]) => { out = out.replace(pattern, replacement); });
  return out;
}

// parts: [{ label, kind: 'number'|'animal'|'sign', root, impure, key,
// isLifePath }]. Groups parts by register (entities sharing a register
// are chained together with amplify connectors, in the order they first
// appear), then orders groups largest-first so the most-loaded theme
// leads, using tension/neutral connectors between groups - EXCEPT Life
// Path's own group, which always leads regardless of size (it's the
// headline number in every numerology convention - user-confirmed), with
// Life Path itself placed first within that group. Repeats of the exact
// same entity (e.g. Day Born and Day# sharing a root) get the existing
// "doubled" acknowledgment instead of restating the same text.
// opts.thirdPerson: true for Famous Lookup - see toThirdPerson above.
function composeGeneralReading(parts, opts) {
  connectUseIdx = { amplify: 0, tension: 0, neutral: 0 };
  const items = [];
  (parts || []).forEach((p) => {
    const dedupeKey = p.kind === 'number' ? `number:${p.root}`
      : p.kind === 'planet' ? `planet:${p.planet}`
      : `${p.kind}:${p.key}`;
    const entry = resolveEntry(p);
    if (!entry) return;
    items.push({ p, entry, dedupeKey, register: entityRegister(p) });
  });
  if (!items.length) return null;

  // Weight-order rewrite (2026-08-13, user's doctrine): the reading walks
  // the caller's EXACT order - Lifepath heaviest, then Day Born, Combo,
  // Day#, then Vietnamese Year > Month > Day, astrology last - instead of
  // the old register-cluster sort. Registers still drive the connector
  // voice between paragraphs, they just no longer reorder anything.
  //
  // Weight also shows as INK (user: "more ink for heavier items"), via
  // p.depth: 'full' (light+shadow+two rotating details - Lifepath),
  // 'std' (light+shadow+one detail), 'lean' (light+shadow), 'micro'
  // (light only), 'planet-full' (role line + sign light + shadow - Sun),
  // 'planet-lean' (role line + sign light - Saturn/Jupiter/Venus).
  //
  // Planet paragraphs blend the PDF role (PLANET_GUIDE) with the sign
  // content the person actually has there (user's call over my
  // recommendation - the sign identity text was written for Sun-sign
  // personality, reused knowingly). A later planet sharing an
  // already-read sign names the shared current instead of repeating the
  // identity text verbatim.
  const f_detailPool = (p, entry) => []
    .concat(p.kind === 'number' ? (NUMBER_SHARP_LINES[p.root] || []) : [])
    .concat(p.kind === 'animal' && entry.deep ? [entry.deep] : [])
    .concat(entry.characteristics || [])
    .concat(entry.moreCharacteristics || []);
  const f_extraDetail = (p, entry) => {
    const pool = f_detailPool(p, entry);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  };
  const f_twoDetails = (p, entry) => {
    const pool = f_detailPool(p, entry);
    if (!pool.length) return [null, null];
    const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const second = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    return [first, second];
  };

  const f_planetRoleLine = (p) => {
    const guide = (typeof PLANET_GUIDE !== 'undefined') ? PLANET_GUIDE[p.planet] : null;
    if (!guide) return `${p.planet} sits in ${p.key} for you.`;
    return `${p.planet} is “${guide.nickname}” of your chart: ${guide.domain.toLowerCase()}. Yours runs through ${p.key}.`;
  };

  const paragraphs = [];
  const seenDedupe = {};
  const seenPlanetSigns = {};
  let prevRegister = null;
  items.forEach((it) => {
    // A repeat folds its "doubled" line onto the ORIGINAL entity's own
    // paragraph (strict weight order can separate the two - Day Born and
    // Day# sharing a root now have Combo between them, and the line would
    // land on the wrong number if it just went to whatever was last).
    if (seenDedupe[it.dedupeKey] !== undefined) {
      const orig = paragraphs[seenDedupe[it.dedupeKey]];
      if (orig) {
        orig.extra = orig.extra ? `${orig.extra} That same current runs doubled in you.` : 'That same current runs doubled in you.';
      }
      return;
    }
    seenDedupe[it.dedupeKey] = paragraphs.length;

    const connector = paragraphs.length > 0
      ? nextConnector(registerRelation(prevRegister, it.register))
      : null;

    const depth = it.p.depth || (it.p.kind === 'planet' ? 'planet-lean' : 'std');
    let para = null;
    if (it.p.kind === 'planet') {
      const roleLine = f_planetRoleLine(it.p);
      const priorPlanet = seenPlanetSigns[it.p.key];
      if (priorPlanet) {
        para = { connector, light: `${roleLine} The same ${it.p.key} current your ${priorPlanet} already carries.`, shadow: null, extra: null, detail: null };
      } else if (depth === 'planet-full') {
        para = { connector, light: `${roleLine} ${it.entry.light}`, shadow: it.entry.shadow, extra: null, detail: null };
      } else {
        para = { connector, light: `${roleLine} ${it.entry.light}`, shadow: null, extra: null, detail: null };
      }
      if (!priorPlanet) seenPlanetSigns[it.p.key] = it.p.planet;
    } else if (depth === 'full') {
      const [d1, d2] = f_twoDetails(it.p, it.entry);
      para = { connector, light: it.entry.light, shadow: it.entry.shadow, extra: null, detail: [d1, d2].filter(Boolean).join(' ') || null };
    } else if (depth === 'lean') {
      para = { connector, light: it.entry.light, shadow: it.entry.shadow, extra: null, detail: null };
    } else if (depth === 'micro') {
      para = { connector, light: it.entry.light, shadow: null, extra: null, detail: null };
    } else {
      para = { connector, light: it.entry.light, shadow: it.entry.shadow, extra: null, detail: f_extraDetail(it.p, it.entry) };
    }
    paragraphs.push(para);
    prevRegister = it.register;
  });

  if (!paragraphs.length) return null;
  const thirdPerson = !!(opts && opts.thirdPerson);
  const tp = (s) => (s && thirdPerson ? toThirdPerson(s) : s);
  const finalParagraphs = paragraphs.map((pp) => ({
    connector: tp(pp.connector), light: tp(pp.light), shadow: tp(pp.shadow), extra: tp(pp.extra), detail: tp(pp.detail),
  }));
  const text = finalParagraphs
    .map((pp) => [pp.connector, pp.light, pp.shadow, pp.extra, pp.detail].filter(Boolean).join(' '))
    .join(' ');
  return { text, paragraphs: finalParagraphs };
}

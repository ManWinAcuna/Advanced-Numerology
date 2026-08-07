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

// Raw-totals convenience wrapper, mirroring weaveCompoundStory's role for
// weaveResolvedStory above.
function buildLightShadowCompoundStory(parts, opts) {
  return buildLightShadowStory(parts.map((p) => ({ label: p.label, entry: compoundEntry(p.raw) })), opts);
}

/* ------------------------------------------------- today-vs-me pairing -- */
// Round 9-10 (2026-08-06): the per-number rows above describe each number
// in isolation - none of them actually say how today's energy interacts
// with the PERSON specifically. Four pairs fix that, each contrasting a
// TODAY number against the structurally-identical number computed from
// the person's own birth date instead (same calculation, different date):
//   - Universal Day (today's full-date compound) <-> Lifepath (their own)
//   - Energy (today's day-of-month digit) <-> Day Born (their own)
//   - Day# (today's day-of-year) <-> their own birth Day#
//   - Lifepath (who they are) <-> Personal Day (how today lands on them)
//
// How well two numbers actually go together is NOT invented here - it's
// numerologyCompat() (compat-data.js), the app's own established
// compatibility engine, backed by NUMEROLOGY_RESEARCH.md: a third-party
// source (CUE) independently cross-checked as matching our own table
// exactly across every pairing, with real documented reasoning behind
// WHY certain numbers clash (Structure vs Freedom, Power vs Avoidance,
// etc.) or reinforce (a stable "container" number paired with an
// intense one). scoreClass(numerologyCompat(rootA, rootB)) drives which
// of 3 tiers (good/mid/bad) applies, same thresholds as every other
// compat score in this app.
//
// Round 11 (2026-08-06): a tier alone ("good"/"mid"/"bad") isn't an
// explanation - the first version of this section had exactly 12 static
// sentences (4 pairs x 3 tiers), so EVERY "good" pairing read identically
// regardless of which two roots actually produced it. User: "it should
// genuinely feel like practical and educational... add some imagery make
// it land." Fixed with a real generator instead of a lookup table: every
// root gets one concrete image (COMPOUND_ROOT_IMAGE) standing in for what
// it actually does, and composePairSentence() builds the sentence from
// the SPECIFIC two roots in play - a 6-vs-9 pairing and a 1-vs-11 pairing
// now read nothing alike, because they're about genuinely different
// things, not two "good" labels wearing the same paragraph.
// Round 13 (2026-08-06): one image per root meant every repeat of a root
// repeated the exact same phrase verbatim ("soup when you're sick" 3-4
// times in one card). Each root now has a small bank, and nextRootImage()
// rotates through it - within one card build the same image never shows
// twice (resetRootImages() at the start of each build restarts the cycle).
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

// Plain what-to-actually-do phrasing per root, shared by the pair prose
// and the actionables below - masters/28 don't live in
// COMPOUND_ROOT_MECHANISM, so they get their own concrete domains here.
function rootDomain(root) {
  if (root === 11) return 'reading the room and trusting the gut call';
  if (root === 22) return 'the long-game project';
  if (root === 28) return 'the money play';
  if (root === 33) return 'saying the thing people actually need to hear';
  const mech = COMPOUND_ROOT_MECHANISM[root];
  return mech ? mech.domain : 'the day';
}

// Per pair-type, what each side of the comparison actually represents in
// plain words - fills the {a}/{b} slots composePairSentence() builds
// sentences around.
const COMPOUND_PAIR_LEADIN = {
  ud_lifepath: { label: 'Universal Day & your Lifepath', a: "today's whole shape", b: 'who you are at your core' },
  energy_dayborn: { label: 'Energy & your Day Born', a: "the day's own daily rhythm", b: 'the rhythm you were born into' },
  dayofyear_dayofyear: { label: "Today's Day# & your own Day#", a: "today's spot in the year", b: 'your own birth-year position' },
  lifepath_personalday: { label: 'Your Lifepath & your Personal Day', a: 'who you are at your core', b: 'how today lands on you personally' },
};

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Builds one pair's { light, shadow }, using the two SPECIFIC roots
// involved and the real tier their numerologyCompat() score lands in -
// the image + theme for whichever roots actually showed up today, not a
// generic template that reads the same for every combination. Round 13:
// every tier now closes on a concrete what-to-do-with-it line (the user:
// "too abstract, not enough real-life" - imagery alone is decoration),
// and images come from nextRootImage() so a root that appears in several
// rows never repeats the same phrase.
function composePairSentence(pairId, rootA, rootB, tier) {
  const lead = COMPOUND_PAIR_LEADIN[pairId];
  if (!lead || !COMPOUND_ROOT_IMAGES[rootA] || !COMPOUND_ROOT_IMAGES[rootB]) return null;
  const themeA = rootThemeName(rootA).toLowerCase();
  const themeB = rootThemeName(rootB).toLowerCase();
  const domainA = rootDomain(rootA);

  // Same root on both sides - one image, named once, doubled. This is
  // also CUE's own named pattern (NUMEROLOGY_RESEARCH.md): "same-theme
  // overlap... comfortable, but can tip into too much of the same thing,
  // nothing balances it out" - worth naming directly.
  if (rootA === rootB) {
    const image = nextRootImage(rootA);
    return tier === 'good'
      ? {
        light: `${cap(lead.a)} and ${lead.b} run on the same current today - ${image}, doubled. That much ${themeA} in one day isn't coincidence, it's an assignment: spend it on ${domainA}.`,
        shadow: `Doubled ${themeA} has no counterweight - even the good thing needs a stop time today, or it runs to excess.`,
      }
      : {
        light: `${cap(lead.a)} and ${lead.b} run on the same current today - ${image}, doubled. Familiar and comfortable, but nothing's balancing it.`,
        shadow: `Unchecked ${themeA} overcorrects into its own worst habit - bring in one outside opinion before you commit to anything big today.`,
      };
  }

  const imageA = nextRootImage(rootA);
  const imageB = nextRootImage(rootB);
  if (tier === 'good') {
    // Two good pairs sharing a today-side root would otherwise close on
    // the identical "put real weight on X" line twice - the second one
    // acknowledges the stack instead of restating it.
    const repeated = COMPOUND_CLOSER_USE[rootA];
    COMPOUND_CLOSER_USE[rootA] = true;
    return repeated
      ? {
        light: `${cap(lead.a)} is ${imageA}, and ${lead.b} is ${imageB} - same direction again. The day keeps stacking ${themeA} green lights; take the hint.`,
        shadow: `Stacked green lights still need a driver - pick the one ${themeA} thing that matters most and actually do it.`,
      }
      : {
        light: `${cap(lead.a)} is ${imageA}, and ${lead.b} is ${imageB} - same direction, doubled. Put real weight on ${domainA}; it moves easier today than it usually does.`,
        shadow: `Easy ${themeA} alignment breeds coasting - if you don't aim it at something specific, the day spends the energy on nothing.`,
      };
  }
  if (tier === 'bad') {
    return {
      light: `${cap(lead.a)} is ${imageA}; ${lead.b} is ${imageB}. ${cap(themeA)} and ${themeB} won't share a lane today - so don't make them. Give each its own hour and both actually work.`,
      shadow: `Forced together they jam: ${themeA} decisions made in a ${themeB} mood (or the reverse) are the ones you end up walking back tomorrow.`,
    };
  }
  return {
    light: `${cap(lead.a)} is ${imageA}; ${lead.b} is ${imageB}. No friction between them, no boost either - the day hands you a flat surface, and what happens on it is on you.`,
    shadow: `Flat is where drift lives - without one deliberate ${themeA} or ${themeB} move, this part of the day just passes.`,
  };
}

// Builds the pair rows given each pair's two already-resolved entries.
// pairs: [{ id, entryA, entryB }] - entries missing (e.g. no birth date on
// file) are silently skipped, same graceful-degradation rule as
// everywhere else in this file. numerologyCompat/scoreClass are globals
// from compat-data.js/compat-render.js - both already loaded on every
// page this runs on, consumed here, never edited.
function buildPairRows(pairs) {
  const lightRows = [];
  const shadowRows = [];
  pairs.forEach(({ id, entryA, entryB }) => {
    const lead = COMPOUND_PAIR_LEADIN[id];
    if (!lead || !entryA || !entryB) return;
    const score = numerologyCompat(entryA.root, entryB.root);
    const sentence = composePairSentence(id, entryA.root, entryB.root, scoreClass(score));
    if (!sentence) return;
    lightRows.push({ label: lead.label, text: sentence.light });
    shadowRows.push({ label: lead.label, text: sentence.shadow });
  });
  return { lightRows, shadowRows };
}

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

/* ----------------------------------------------------------- actionables -- */
// Round 13 (2026-08-06): "add a button that says actionables where it
// gives you 4 actionables to align with the energies all together" -
// explicitly NOT one per number ("not one actionable per energy I'm
// talking about all of the energies combined"): 2 do's + 2 don'ts
// synthesized from the whole mix - the dominant today-energy, the
// best-aligned today-vs-me pair, and the worst one. Concrete real-life
// moves, not restatements of the light/shadow prose.
// Round 13b correction: actionables are built from TODAY's energies ONLY
// and every line weaves TWO of them together. The first version pulled
// single-root canned texts, and its pair-scoring logic could leak the
// PERSON's roots in (user, seeing a root-9 "end something cleanly" on a
// 6/6/11/28 day: "I don't get where the let something go cleanly do
// comes from... none of them are talking through all the energies
// combined"). Fragments compose as lead + qualifier so the whole set
// reads the actual blend, not four disconnected one-number tips.
const COMPOUND_MOVE_LEAD = {
  1: "make the first move on the thing you've been circling - the call, the ask, the first rep",
  3: 'say the thing out loud - post it, pitch it, tell the person',
  4: 'put one focused hour into the unglamorous foundational work',
  5: "make the pivot you've been putting off",
  6: 'show up for one specific person - the call, the favor, the dinner',
  7: 'take the closer look everyone else is skipping',
  8: 'close the thing with money or authority attached - the invoice, the ask, the signature',
  9: "end something cleanly - the last message, the archived project, the goodbye that's overdue",
  11: 'trust the first gut read',
  22: 'put an hour into the years-long thing',
  28: "make the money move you've been sitting on",
  33: 'say the useful true thing to someone who needs it',
};
const COMPOUND_MOVE_TAIL = {
  1: "don't wait for anyone's permission to do it",
  3: "say it while you're at it; the version in your head does nothing",
  4: 'give it enough structure to survive the week',
  5: 'stay loose enough to change the route midway',
  6: 'keep a real person in the loop while you do it',
  7: 'read the fine print before you commit',
  8: 'put a number and a deadline on it',
  9: "drop whatever's already finished to make room first",
  11: 'run it through the gut check first; your signal is loud today',
  22: 'aim it at the long game, not the quick win',
  28: 'let it feed the thing that compounds',
  33: "tell someone what you learned while it's fresh",
};
// Continuations of the rendered "Don't:" label - no leading "Don't" in
// the text itself, or the row reads "Don't: Don't...".
const COMPOUND_TRAP_LEAD = {
  1: 'bulldoze ahead just because waiting is uncomfortable',
  3: 'scatter it across ten half-versions',
  4: "defend the plan just because it's yours",
  5: 'burn a commitment just to feel motion',
  6: 'say yes to a favor you already resent',
  7: 'disappear into analysis',
  8: 'squeeze the extra 10% just because you can',
  9: "reopen what's already closed",
  11: 'make the big call from a mood spike',
  22: 'measure the cathedral against the day',
  28: 'chase the payoff so hard you cut a corner',
  33: 'pour everything into the audience while the person next to you gets leftovers',
};
const COMPOUND_TRAP_TAIL = {
  1: 'especially when someone just needed two more minutes',
  3: "especially in writing you can't take back",
  4: "especially when the plan's already cracking",
  5: "especially the ones you'd want back tomorrow",
  6: 'especially for people who never asked',
  7: 'especially on a ten-minute decision',
  8: 'especially when trust is on the table',
  9: 'especially the ones that ended for a reason',
  11: 'especially when the mood is doing the talking',
  22: 'especially on a slow-brick day',
  28: 'especially with money on the table',
  33: 'especially at home',
};

// todayParts: [{ label, entry }] - today's resolved numbers only, in
// display order (Universal Day first, which also breaks frequency ties
// in its favor). The person's own numbers never enter this - actionables
// align with the DAY. Each line leads with one of today's roots and
// closes on another, rotating so every distinct root in the mix gets
// woven in across the four lines.
function buildActionables(todayParts) {
  const roots = [];
  (todayParts || []).forEach((p) => {
    if (p.entry && COMPOUND_MOVE_LEAD[p.entry.root]) roots.push(p.entry.root);
  });
  if (!roots.length) return null;
  const freq = {};
  roots.forEach((r) => { freq[r] = (freq[r] || 0) + 1; });
  const D = roots.filter((r, i) => roots.indexOf(r) === i).sort((a, b) => freq[b] - freq[a]);
  const n = D.length;

  const doLine = (lead, tail) => (tail != null && tail !== lead
    ? `${cap(COMPOUND_MOVE_LEAD[lead])} - and ${COMPOUND_MOVE_TAIL[tail]}.`
    : `${cap(COMPOUND_MOVE_LEAD[lead])}.`);
  const dontLine = (lead, tail) => (tail != null && tail !== lead
    ? `${cap(COMPOUND_TRAP_LEAD[lead])} - ${COMPOUND_TRAP_TAIL[tail]}.`
    : `${cap(COMPOUND_TRAP_LEAD[lead])}.`);

  const out = [];
  out.push({ kind: 'do', text: doLine(D[0], n > 1 ? D[1] : null) });
  if (n > 1) out.push({ kind: 'do', text: doLine(D[n > 2 ? 2 : 1], D[0]) });
  const dontTail = n > 3 ? D[3] : D[2 % n];
  out.push({ kind: 'dont', text: dontLine(D[1 % n], n > 1 ? dontTail : null) });
  if (n > 1) out.push({ kind: 'dont', text: dontLine(D[0], D[1]) });
  return out;
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
  if (p.kind === 'sign') return WESTERN_REGISTER[p.key];
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
  if (p.kind === 'sign') return WESTERN_IDENTITY[p.key];
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
    const dedupeKey = p.kind === 'number' ? `number:${p.root}` : `${p.kind}:${p.key}`;
    const entry = resolveEntry(p);
    if (!entry) return;
    items.push({ p, entry, dedupeKey, register: entityRegister(p) });
  });
  if (!items.length) return null;

  // Group by register, preserving first-seen order both across and within groups.
  const groupOrder = [];
  const groups = {};
  items.forEach((it) => {
    const key = it.register || `_solo_${it.dedupeKey}`;
    if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
    groups[key].push(it);
  });
  groupOrder.sort((a, b) => groups[b].length - groups[a].length);

  const lifePathKey = groupOrder.find((key) => groups[key].some((it) => it.p.isLifePath));
  if (lifePathKey) {
    groupOrder.splice(groupOrder.indexOf(lifePathKey), 1);
    groupOrder.unshift(lifePathKey);
    const g = groups[lifePathKey];
    const lpIndex = g.findIndex((it) => it.p.isLifePath);
    if (lpIndex > 0) g.unshift(g.splice(lpIndex, 1)[0]);
  }

  const sentences = [];
  const seenDedupe = {};
  let prevRegister = null;
  groupOrder.forEach((key) => {
    groups[key].forEach((it, i) => {
      if (seenDedupe[it.dedupeKey]) {
        sentences.push('That same current runs doubled in you.');
        return;
      }
      seenDedupe[it.dedupeKey] = true;

      if (sentences.length === 0) {
        sentences.push(it.entry.light);
      } else if (i > 0) {
        sentences.push(`${nextConnector('amplify')} ${it.entry.light}`);
      } else {
        const relation = registerRelation(prevRegister, it.register);
        sentences.push(`${nextConnector(relation)} ${it.entry.light}`);
      }
      sentences.push(it.entry.shadow);
      prevRegister = it.register;
    });
  });

  if (!sentences.length) return null;
  const text = sentences.join(' ');
  return { text: (opts && opts.thirdPerson) ? toThirdPerson(text) : text };
}

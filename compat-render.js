/*
 * Shared rendering for a computeCompatibility() result. Used by both the
 * Compatibility Calculator page and the Sports Betting tools. Requires
 * compat-engine.js (for the result shape) and db-core.js (escapeHtml,
 * ZODIAC_SYMBOLS, VIETNAMESE_ZODIAC_EMOJI) to be loaded first.
 */

// Original 77/49 bands. The stricter 82/58 coloring applies ONLY to the
// Deep Compatibility headline number (deepCompatTier, deep-compat.js) -
// owner's scoping 2026-08-29: "all the other colors should have stayed
// the same" after a briefly-shipped app-wide 82/58 sweep.
function scoreClass(score) {
  if (score >= 77) return 'good';
  if (score < 49) return 'bad';
  return 'mid';
}

// Personal Cycles readability redesign (Boost13, locked 2026-08-31): per-
// number energy colors + one-line meanings, shared by the Personal Cycles
// cards (render.js) and the Roadmap/Outlook popup rows below - defined here
// (compat-render.js loads before render.js on every page that uses either)
// so both can reference the same globals regardless of file load order.
// Same 14 hex triples as godlike.css's html[data-energy] rules, mirrored
// because that CSS is scoped to the <html> root only. Meaning words are
// kw[0] from today.html's own MEAN table - owner's call 2026-08-31: keep
// as-is rather than re-picking or inventing new words.
const PCYCLE_ENERGY = {
  1:  { acc: '#e9edf4', dim: 'rgba(233,237,244,.55)', ghost: 'rgba(233,237,244,.09)' },
  2:  { acc: '#a9bedd', dim: 'rgba(169,190,221,.55)', ghost: 'rgba(169,190,221,.09)' },
  3:  { acc: '#ffb36b', dim: 'rgba(255,179,107,.55)', ghost: 'rgba(255,179,107,.09)' },
  4:  { acc: '#79b0a6', dim: 'rgba(121,176,166,.55)', ghost: 'rgba(121,176,166,.09)' },
  5:  { acc: '#ff8a3d', dim: 'rgba(255,138,61,.55)',  ghost: 'rgba(255,138,61,.09)' },
  6:  { acc: '#e0a184', dim: 'rgba(224,161,132,.55)', ghost: 'rgba(224,161,132,.09)' },
  7:  { acc: '#d24a5c', dim: 'rgba(210,74,92,.55)',   ghost: 'rgba(210,74,92,.09)' },
  8:  { acc: '#f5c542', dim: 'rgba(245,197,66,.55)',  ghost: 'rgba(245,197,66,.10)' },
  9:  { acc: '#9d84ff', dim: 'rgba(157,132,255,.55)', ghost: 'rgba(157,132,255,.09)' },
  11: { acc: '#86e8ff', dim: 'rgba(134,232,255,.55)', ghost: 'rgba(134,232,255,.09)' },
  13: { acc: '#ff6242', dim: 'rgba(255,98,66,.55)',   ghost: 'rgba(255,98,66,.09)' },
  22: { acc: '#3fce9f', dim: 'rgba(63,206,159,.55)',  ghost: 'rgba(63,206,159,.09)' },
  28: { acc: '#ffd75e', dim: 'rgba(255,215,94,.6)',   ghost: 'rgba(255,215,94,.11)' },
  33: { acc: '#f0a8c8', dim: 'rgba(240,168,200,.55)', ghost: 'rgba(240,168,200,.09)' },
};

const PCYCLE_MEANING = {
  1: 'Initiate', 2: 'Feeling', 3: 'Voice', 4: 'Structure', 5: 'Restless',
  6: 'Duty', 7: 'Depth', 8: 'Power', 9: 'Closure', 11: 'Intuition',
  13: 'Work', 22: 'Monument', 28: 'Radiant', 33: 'Teacher',
};

function pcycleEnergy(n) { return PCYCLE_ENERGY[n] || PCYCLE_ENERGY[1]; }

// Continuous red->gold->green fill color for a 0-100 compat score, in
// place of the old 3-bucket COMPAT_TIER_COLOR - calibrated to the owner's
// live feedback 2026-08-31 (widget-mockup round), NOT a naive 0/50/100
// split: red should still read clearly through the mid-40s, and green
// should already read clearly by ~70.
const PCYCLE_SCORE_RED = [229, 57, 63];
const PCYCLE_SCORE_GOLD = [245, 197, 66];
const PCYCLE_SCORE_GREEN = [139, 195, 74];
function pcycleScoreColor(score) {
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  let rgb;
  if (score <= 45) rgb = PCYCLE_SCORE_RED;
  else if (score <= 65) rgb = lerp(PCYCLE_SCORE_RED, PCYCLE_SCORE_GOLD, (score - 45) / 20);
  else if (score <= 73) rgb = lerp(PCYCLE_SCORE_GOLD, PCYCLE_SCORE_GREEN, (score - 65) / 8);
  else rgb = PCYCLE_SCORE_GREEN;
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

// One row per CALENDAR period (a year, or a month - see pcycleSingleRowHtml
// for the single-period sibling used by both Month Outlook and non-split
// Roadmap rows), even when the birthday splits it into two different
// Personal cycles (owner's call 2026-08-31: "show 1 [period] not 2, but
// still visually see when it starts and ends"). Went through several
// widget-mockup rounds with the owner before landing here - see
// project_personal_cycles_redesign.md for the full history. Final shape:
// the period label is the prominent heading (animal tucked right next to
// it, not pushed to the row's far edge), each sub-period's number is small
// and de-emphasized (the owner's root complaint was "the numbers were too
// big"), and each sub-period gets its own thin score-proportional bar
// colored via pcycleScoreColor - the continuous gradient (not the old
// fixed 3 buckets) reads clearly across the whole 0-100 range. Generalized
// 2026-08-31 (was year-only, read `.personalYear` directly) to also cover
// Month Outlook rows, which split on the same birth-day boundary within a
// calendar month instead of within a calendar year - callers now pass a
// pre-formatted boundary label and {number, finalScore} sub-period objects
// instead of a bare birthDate.
function pcycleSplitRowHtml(periodLabel, animal, earlyP, lateP, boundaryLabel) {
  const periodHtml = (p, when) => `
    <div class="pcycle-split-period">
      <div class="pcycle-split-period-top">
        <span class="pcycle-split-num">${p.number}</span>
        <span class="pcycle-split-when">${when} &middot; ${p.finalScore}%</span>
      </div>
      <div class="pcycle-split-bar"><div class="pcycle-split-bar-fill" style="width:${p.finalScore}%;background:${pcycleScoreColor(p.finalScore)}"></div></div>
    </div>`;
  return `
    <div class="pcycle-split-row">
      <div class="pcycle-split-top">
        <span class="pcycle-row-period">${periodLabel}</span>
        <span class="pcycle-row-sub">${VIETNAMESE_ZODIAC_EMOJI[animal] || ''} ${animal}</span>
      </div>
      ${periodHtml(earlyP, `until ${boundaryLabel}`)}
      ${periodHtml(lateP, `from ${boundaryLabel}`)}
    </div>`;
}

// Single-period sibling of pcycleSplitRowHtml - same visual language (plain
// number, score-gradient bar), just one sub-period block instead of two.
// Replaces the old pcycleRowHtml (per-number rainbow energy coloring) for
// every Personal Cycles row - Month Outlook rows and non-split Roadmap
// years alike - per the owner's call 2026-08-31: "we need to rework
// [Month Outlook] aswell, and it needs to be in the same way that the
// personal year is structured."
function pcycleSingleRowHtml(periodLabel, animal, p) {
  return `
    <div class="pcycle-split-row">
      <div class="pcycle-split-top">
        <span class="pcycle-row-period">${periodLabel}</span>
        <span class="pcycle-row-sub">${VIETNAMESE_ZODIAC_EMOJI[animal] || ''} ${animal}</span>
      </div>
      <div class="pcycle-split-period">
        <div class="pcycle-split-period-top">
          <span class="pcycle-split-num">${p.number}</span>
          <span class="pcycle-split-when">${p.finalScore}%</span>
        </div>
        <div class="pcycle-split-bar"><div class="pcycle-split-bar-fill" style="width:${p.finalScore}%;background:${pcycleScoreColor(p.finalScore)}"></div></div>
      </div>
    </div>`;
}

// The shared .modal-box defaults to a width sized for the full compatibility
// breakdown (meters + rows). Narrower popups (like Month Outlook) opt into a
// tighter box instead of sitting mostly-empty inside the wide default.
function setModalWidth(containerEl, narrow) {
  const box = containerEl.closest('.modal-box');
  if (box) box.classList.toggle('modal-box-narrow', narrow);
}

function breakdownSection(title, score, rows) {
  return `
    <div class="breakdown-section">
      <div class="breakdown-header"><span>${title}</span></div>
      <div class="meter"><div class="meter-fill" style="width:${score}%"></div></div>
      <div class="breakdown-rows">
        ${rows.map((row) => `<div class="breakdown-row"><span>${row.label}</span><span class="breakdown-score">${row.score}</span></div>`).join('')}
      </div>
    </div>
  `;
}

// Shared "Lucky Number Bonuses" section - every compatibility-style score in
// the app (Compatibility, Energy Flow, Month Outlook) factors lucky number
// in, so they all render it the same way.
//
// computeLuckyBonus checks both directions (each side's lucky digits against
// the other's date), so the same rule name - e.g. "Lucky Number Month" - can
// legitimately fire twice for two different dates. Both hits still count
// toward the score, but showing the same label twice reads as a glitch, so
// notes sharing a rule name are grouped into a single row here with their
// details joined.
//
// A note is either a plain string (renderMonthDetail builds its own
// {total, notes} object by hand from a single pre-formatted luckyNote
// string) or a {text, from} object (everything coming straight from
// computeLuckyBonus) - `from` isn't used here (this component has no
// concept of "who's viewing"), it's read directly by consumers that DO know
// (see emax-category.js rewriting "your" to a real name before calling in).
// Shared by bonusSectionHtml (the plain list) and bonusChipsHtml (the newer
// chip treatment) - computeLuckyBonus checks both directions, so the same
// rule name can legitimately fire twice for two different dates; grouping
// by rule keeps that from reading as a duplicate glitch.
function groupBonusNotes(bonuses) {
  if (!bonuses || !bonuses.notes.length) return [];
  const order = [];
  const detailsByRule = new Map();
  bonuses.notes.forEach((note) => {
    const n = typeof note === 'string' ? note : note.text;
    const sepIdx = n.indexOf(' - ');
    const rule = sepIdx === -1 ? n : n.slice(0, sepIdx);
    const detail = sepIdx === -1 ? '' : n.slice(sepIdx + 3);
    if (!detailsByRule.has(rule)) {
      detailsByRule.set(rule, []);
      order.push(rule);
    }
    if (detail) detailsByRule.get(rule).push(detail);
  });
  return order.map((rule) => {
    const details = detailsByRule.get(rule);
    return details.length ? `${rule} - ${details.join(' · ')}` : rule;
  });
}

function bonusSectionHtml(bonuses) {
  const rows = groupBonusNotes(bonuses);
  if (!rows.length) return '';
  return `
    <div class="breakdown-section bonus-section">
      <div class="breakdown-header"><span>🍀 Lucky Number Bonuses</span></div>
      <div class="breakdown-rows">
        ${rows.map((n) => `<div class="breakdown-row bonus-row">${escapeHtml(n)}</div>`).join('')}
      </div>
    </div>
  `;
}

// Chip treatment of the same grouped notes, for renderCompatHero below.
function bonusChipsHtml(bonuses) {
  const rows = groupBonusNotes(bonuses);
  if (!rows.length) return '';
  return `
    <div class="compat-bonus-row">
      ${rows.map((n) => `<div class="compat-bonus-chip"><span class="ic">🍀</span>${escapeHtml(n)}</div>`).join('')}
    </div>
  `;
}

function renderCompatResults(containerEl, r, nameA, nameB) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);

  const flagHtml = r.flags.map((f) => {
    if (f === 'perfect') return '<div class="score-flag perfect">&#9733; PERFECT MATCH</div>';
    if (f === 'ideal') return '<div class="score-flag ideal">&#9733; IDEAL MATCH</div>';
    if (f === 'clash') return '<div class="score-flag clash">&#9888; CLASH</div>';
    return '';
  }).join('');

  const numerologyRows = [
    { label: `✨ Lifepath (${lifePathDisplayText(r.numerology.entityLifePath)} &rarr; ${lifePathDisplayText(r.numerology.dayLifePath)})`, score: r.numerology.lifePathScore },
    { label: `📅 Day (${r.numerology.entityDay} &rarr; ${r.numerology.dayDay})`, score: r.numerology.dayScore },
    { label: `🔢 Day of Year (${r.numerology.entityDoy} &rarr; ${r.numerology.dayDoy})`, score: r.numerology.doyScore },
  ];

  const vietnameseRows = [
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.entityYearSign] || ''} Year (${r.vietnamese.entityYearSign} &rarr; ${r.vietnamese.dayYearSign})`, score: r.vietnamese.yearScore },
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.entityMonthSign] || ''} Month (${r.vietnamese.entityMonthSign} &rarr; ${r.vietnamese.dayMonthSign})`, score: r.vietnamese.monthScore },
    { label: `${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.entityDaySign] || ''} Day (${r.vietnamese.entityDaySign} &rarr; ${r.vietnamese.dayDaySign})`, score: r.vietnamese.daySignScore },
  ];

  const westernRows = [
    { label: `${ZODIAC_SYMBOLS[r.western.entitySunSign] || ''} Sign (${r.western.entitySunSign} &rarr; ${r.western.daySunSign})`, score: r.western.score },
  ];

  containerEl.innerHTML = `
    <div class="score-hero">
      <div class="score-names">${escapeHtml(nameA)} <span class="score-vs">&times;</span> ${escapeHtml(nameB)}</div>
      <div class="score-big ${scoreClass(r.finalScore)}">${r.finalScore}<span class="score-out-of">/100</span></div>
      ${flagHtml}
    </div>
    <div class="score-breakdown">
      ${breakdownSection('Numerology', r.numerology.score, numerologyRows)}
      ${breakdownSection('Vietnamese Zodiac', r.vietnamese.score, vietnameseRows)}
      ${breakdownSection('Western Zodiac', r.western.score, westernRows)}
      ${bonusSectionHtml(r.bonuses)}
    </div>
  `;
}

/* =========================== The hero redesign ==========================
   renderCompatHero() - the newer, shield-badge treatment (Boost13,
   2026-08-05). Not a replacement for renderCompatResults(): the sports
   betting matchup breakdowns (tennis.js/ufc.js) keep using the plain
   version - this is scoped to the numerology-app's own compatibility
   surfaces (Compatibility Calculator, EMAX item popup, Database's
   compare-with-me, Profile/Calculator/Famous's compat modals, Calendar's
   day-compare). The "see full breakdown" reveal deliberately stops at the
   3 category scores (a meter each) - the cards above already name the
   category, so the reveal's only job is showing the number, not
   re-explaining it via every sub-component row (that's what made the old
   full breakdown feel like it snowballed). */

const COMPAT_TIER_COLOR = { good: 'var(--good)', mid: 'var(--gold)', bad: 'var(--bad)' };
const COMPAT_TIER_GLOW = {
  good: 'rgba(139, 195, 74, .4)',
  mid: 'rgba(245, 197, 66, .4)',
  bad: 'rgba(229, 57, 63, .4)',
};

// Same 3-tier thresholds as scoreClass() everywhere else in the app - only
// the WORDING varies per category now, not the underlying good/mid/bad
// math, so nothing about what counts as "good" ever drifts between the
// hero and the full breakdown beneath it.
const COMPAT_NUMEROLOGY_WORDS = { good: 'In Sync', mid: 'Workable', bad: 'Clashing' };
const COMPAT_VIETNAMESE_WORDS = { good: 'Kindred', mid: 'Neutral', bad: 'Friction' };
const COMPAT_WESTERN_WORDS = { good: 'Aligned', mid: 'Mixed Signals', bad: 'At Odds' };
function compatTierWord(score, bank) { return bank[scoreClass(score)]; }

// Reuses the engine's own flags (computeCompatibility already computes
// 'perfect'/85+, 'ideal'/77+, 'clash'/<49) instead of inventing new
// thresholds for the verdict copy - the mid band (49-76, no flag) is the
// only case handled directly here.
function compatVerdictCopy(r) {
  if (r.flags.includes('perfect')) {
    return { head: 'Exceptional Compatibility', body: 'A rare, deep alignment — this connection amplifies both sides.' };
  }
  if (r.flags.includes('ideal')) {
    return { head: 'Strong Compatibility', body: 'Real alignment here — worth building on, not just a nice number.' };
  }
  if (r.flags.includes('clash')) {
    return { head: 'Challenging Compatibility', body: 'The numbers are working against this one — go in with eyes open.' };
  }
  return { head: 'Workable Compatibility', body: 'Enough common ground to work with. Nothing forcing this, nothing fighting it either.' };
}

// Same flag thresholds computeCompatibility uses internally (compat-engine.
// js, sacrosanct - not exported), duplicated here so a Deep Compatibility
// score (deep-compat.js, blended from two different scores) can get the
// same verdict copy treatment via a synthetic {finalScore, flags} shape.
function flagsForScore(score) {
  const flags = [];
  if (score < 49) flags.push('clash');
  else if (score >= 85) flags.push('perfect');
  else if (score >= 77) flags.push('ideal');
  return flags;
}

// Deep Compatibility (2026-08-07) - one line of transparent math above the
// existing Today/Imprint call-outs: exactly what fed the blended headline
// number, so nothing about "Deep Compatibility" is a black box. Skipped
// entirely (not shown as "0%") when there's no imprint data to blend - the
// headline is just today's compatibility in that case, no blend happened.
function deepBlendStripHtml(deep) {
  if (deep.noImprintData) {
    return `<div class="deep-blend-strip deep-blend-note">No imprint data for this pairing — showing today's compatibility only.</div>`;
  }
  const imprintPct = Math.round(deep.blendWeight * 100);
  const currentPct = 100 - imprintPct;
  return `
    <div class="deep-blend-strip">
      Today <b>${deep.currentScore}</b> &times; ${currentPct}% + Imprint <b>${deep.imprintScore}</b> &times; ${imprintPct}% = <b>${deep.deepScore}</b> Deep Compatibility
    </div>`;
}

function compatHeroDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// A handful of randomly-placed/timed embers, same drifting-particle
// language as Today's altar - purely decorative, re-generated fresh each
// render (no need to persist between calls).
function compatEmbersHtml() {
  let html = '';
  for (let i = 0; i < 7; i++) {
    const left = 22 + Math.random() * 56;
    const delay = (Math.random() * 4).toFixed(1);
    const dur = (5 + Math.random() * 2.5).toFixed(1);
    html += `<i style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
  }
  return html;
}

// The reveal's one row per category - name + score + meter, nothing about
// how that score was built (see the header comment above).
// Flat orange/yellow is .meter-fill's shared default everywhere else in the
// app (Month Outlook, Energy Flow) - here each row is its own category
// score, so the fill takes on that score's own tier color (red/gold/green)
// instead, the same semantic coloring already driving the cards and shield.
function compatMeterRow(label, score) {
  return `
    <div class="breakdown-header"><span>${label}</span><span>${score}</span></div>
    <div class="meter"><div class="meter-fill" style="width:${score}%; background:${COMPAT_TIER_COLOR[scoreClass(score)]}"></div></div>
  `;
}

// opts: { dateA, dateB } (Date objects - render the two-person zodiac-
// animal header; omitted entirely if either is missing) and
// { compact: true } (smaller badge/type, used inside modals/popups where
// the person is already established by the surrounding UI - EMAX's item
// popup, Database's compare-with-me, Profile's compat modal, Calendar's
// day-compare). opts.pillDateA/pillDateB (2026-08-06, Imprint Alignment):
// SEPARATE from dateA/dateB on purpose - dateA/dateB only ever controls
// the two-person zodiac header above, and threading them through to every
// existing compact-mode call site would have started showing that header
// everywhere unintentionally. Passing pillDateA/pillDateB shows the "Check
// My Imprints" pill regardless of whether the header is showing.
// opts.pillPersonMode (2026-08-07): both pillDateA/pillDateB are real
// people's birthdates (not one side being a plain event/calendar date) -
// switches the pill to computeImprintPersonAlignment's cross-comparison
// instead of the one-sided date-based read. Only true at the 2 call sites
// where both sides are genuinely people (Database's compare-with-me,
// Famous/Calculator's compare-with-me) - everywhere else (EMAX events,
// calendar days, Today) one side is a plain date, not a person, so the
// original date-based pill stays correct there.
// opts.pillPersonSide (2026-08-07): when NOT pillPersonMode, only ONE
// direction of the date-based pill renders now (a plain date has no
// imprint history of its own to show) - this says which of A/B is the
// real person. Defaults to 'A'; EMAX's item popup passes 'B' since there
// A is the event/entry, not a person.
function renderCompatHero(containerEl, r, nameA, nameB, opts) {
  opts = opts || {};
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);

  // opts.deep (2026-08-07, deep-compat.js): a precomputed
  // computeDeepCompatibility() result. When present, the headline shield
  // shows the blended Deep Compatibility score instead of r.finalScore -
  // r itself (and everything derived from it: cards, meters, bonuses) is
  // untouched, it's still exactly today's/this-pairing's raw compat read,
  // just no longer the number in the badge.
  const deep = opts.deep;
  const headlineScore = deep ? deep.deepScore : r.finalScore;
  const tier = deep ? deep.tier : scoreClass(r.finalScore);
  const verdict = deep ? compatVerdictCopy({ flags: flagsForScore(headlineScore) }) : compatVerdictCopy(r);

  let headerHtml = '';
  if (opts.dateA && opts.dateB) {
    const animalA = getChineseZodiacYear(opts.dateA);
    const animalB = getChineseZodiacYear(opts.dateB);
    headerHtml = `
      <div class="compat-people">
        <div class="compat-person">
          <div class="compat-person-animal">${VIETNAMESE_ZODIAC_EMOJI[animalA] || '🐾'}</div>
          <div class="compat-person-name">${escapeHtml(nameA)}</div>
          <div class="compat-person-date">${compatHeroDate(opts.dateA)}</div>
        </div>
        <div class="compat-link-glyph">∞</div>
        <div class="compat-person">
          <div class="compat-person-animal">${VIETNAMESE_ZODIAC_EMOJI[animalB] || '🐾'}</div>
          <div class="compat-person-name">${escapeHtml(nameB)}</div>
          <div class="compat-person-date">${compatHeroDate(opts.dateB)}</div>
        </div>
      </div>`;
  }

  const cardsHtml = `
    <div class="compat-cards">
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(r.numerology.score)]}">
        <div class="compat-card-name">Numerology</div>
        <div class="compat-card-vs"><span>${lifePathDisplayText(r.numerology.entityLifePath)}</span><i>vs</i><span>${lifePathDisplayText(r.numerology.dayLifePath)}</span></div>
        <div class="compat-card-tier">${compatTierWord(r.numerology.score, COMPAT_NUMEROLOGY_WORDS)}</div>
      </div>
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(r.vietnamese.score)]}">
        <div class="compat-card-name">Vietnamese Zodiac</div>
        <div class="compat-card-vs compat-card-vs-glyph"><span>${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.entityYearSign] || ''}</span><i>vs</i><span>${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.dayYearSign] || ''}</span></div>
        <div class="compat-card-tier">${compatTierWord(r.vietnamese.score, COMPAT_VIETNAMESE_WORDS)}</div>
      </div>
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(r.western.score)]}">
        <div class="compat-card-name">Western Zodiac</div>
        <div class="compat-card-vs compat-card-vs-glyph"><span>${ZODIAC_SYMBOLS[r.western.entitySunSign] || ''}</span><i>vs</i><span>${ZODIAC_SYMBOLS[r.western.daySunSign] || ''}</span></div>
        <div class="compat-card-tier">${compatTierWord(r.western.score, COMPAT_WESTERN_WORDS)}</div>
      </div>
    </div>`;

  // Deep mode's imprint pill already has its score in hand (opts.deep.
  // imprint was computed up front to build the blend) - the button label
  // shows it immediately instead of staying a mystery until tapped, and
  // the "full breakdown" reveal gets relabeled "Today's Compatibility"
  // since it's now one ingredient of the headline, not the headline itself.
  const pillLabel = deep
    ? (deep.noImprintData ? '✨ No Imprint Data' : `✨ Imprint ${deep.imprintScore} — see what matched`)
    : '✨ Check My Imprints';
  const revealLabelClosed = deep ? `▾ Today's Compatibility: ${r.finalScore}` : '▾ See full breakdown';
  const revealLabelOpen = deep ? `▴ Hide Today's Compatibility` : '▴ Hide full breakdown';

  containerEl.innerHTML = `
    <div class="compat-hero${opts.compact ? ' compact' : ''}" style="--tier-c:${COMPAT_TIER_COLOR[tier]}; --tier-glow:${COMPAT_TIER_GLOW[tier]}">
      ${headerHtml}
      <div class="compat-badge-wrap">
        <div class="compat-embers">${compatEmbersHtml()}</div>
        <div class="shield">
          <div class="shield-inner">
            <div class="shield-score">${headlineScore}<span>%</span></div>
            <div class="shield-tag">${deep ? 'Deep Compat' : 'Compatibility'}</div>
          </div>
        </div>
      </div>
      <div class="compat-verdict-head">${verdict.head}</div>
      <div class="compat-verdict-body">${verdict.body}</div>
      ${cardsHtml}
      ${deep ? deepBlendStripHtml(deep) : ''}
      ${opts.pillDateA && opts.pillDateB ? `<button type="button" class="imprint-pill" data-imprint-pill>${pillLabel}</button><div class="imprint-pill-body" data-imprint-pill-body hidden></div>` : ''}
      ${bonusChipsHtml(r.bonuses)}
      <button type="button" class="compat-reveal-btn" data-compat-reveal>${revealLabelClosed}</button>
      <div class="compat-reveal-body" data-compat-reveal-body>
        ${compatMeterRow('Numerology', r.numerology.score)}
        ${compatMeterRow('Vietnamese Zodiac', r.vietnamese.score)}
        ${compatMeterRow('Western Zodiac', r.western.score)}
      </div>
    </div>
  `;

  const revealBtn = containerEl.querySelector('[data-compat-reveal]');
  const revealBody = containerEl.querySelector('[data-compat-reveal-body]');
  revealBtn.addEventListener('click', () => {
    const open = revealBody.classList.toggle('open');
    revealBtn.textContent = open ? revealLabelOpen : revealLabelClosed;
  });

  const pillBtn = containerEl.querySelector('[data-imprint-pill]');
  if (pillBtn) {
    pillBtn.addEventListener('click', () => {
      const body = containerEl.querySelector('[data-imprint-pill-body]');
      const open = body.hidden;
      if (open && !body.dataset.built) {
        // Deep mode already computed this exact imprint result up front to
        // build the blend - reuse it instead of running the whole
        // computation a second time on tap.
        body.innerHTML = deep
          ? (deep.personMode
              ? imprintPersonAlignmentResultHtml(deep.imprint, nameA, nameB)
              : imprintAlignmentResultHtml(deep.imprint, nameA, nameB))
          : imprintPillContentHtml(opts.pillDateA, nameA, opts.pillDateB, nameB, opts.pillPersonMode, opts.pillPersonSide);
        body.dataset.built = '1';
        wireImprintRevealButtons(body);
      }
      body.hidden = !open;
      pillBtn.classList.toggle('open', open);
    });
  }
}

/* =========================== Imprint Alignment (2026-08-06) ==========
   The pill above computes BOTH directions whenever two real dates are on
   hand (user's own call: "both sides" rather than guessing which side is
   "the person") - side A's imprints checked against side B as the
   candidate date, AND side B's imprints against side A. Deliberately NOT
   the shield style: this isn't two equal sides compared against each
   other, it's one person's history read against one date, so it gets its
   own plainer treatment. */
// "You's imprints" reads as broken grammar - the handful of fixed pronoun-
// like labels this app already passes as nameA/nameB (You/Me/Today) get a
// real possessive instead of a blind apostrophe-s.
const IMPRINT_POSSESSIVE = { You: 'Your', Me: 'My', Today: "Today's" };
function imprintPossessive(name) {
  return IMPRINT_POSSESSIVE[name] || `${name}'s`;
}

// m.domains (2026-08-07) is an array of "emoji Label" strings tagging which
// life area(s) that theme number belongs to - empty for the domain-agnostic
// bonuses (Lucky Number, Rare Coincidence), which don't get a tag.
function imprintDomainTagsHtml(domains) {
  if (!domains || !domains.length) return '';
  return ` <span class="imprint-domain-tags">${domains.map((d) => `<span class="imprint-domain-tag">${escapeHtml(d)}</span>`).join('')}</span>`;
}

function imprintAlignmentResultHtml(result, personName, candidateName) {
  const rows = result.matches.length
    ? result.matches.map((m) => `<div class="imprint-match-row"><b>${escapeHtml(m.label)}:</b> ${escapeHtml(m.text)}${imprintDomainTagsHtml(m.domains)} <span class="imprint-match-pts">+${m.points}</span></div>`).join('')
    : '<div class="imprint-match-empty">No imprint themes matched this date.</div>';
  return `
    <div class="imprint-result">
      <div class="imprint-result-head">
        <div class="imprint-result-score ${result.tier}">${result.score}</div>
        <div class="imprint-result-label">${escapeHtml(imprintPossessive(personName))} imprints <i>&times;</i> ${escapeHtml(candidateName)}</div>
      </div>
      <button type="button" class="imprint-reveal-btn" data-imprint-reveal>▾ See what matched</button>
      <div class="imprint-reveal-body" data-imprint-reveal-body hidden>${rows}</div>
    </div>`;
}

// Person-vs-person read (2026-08-07 fix): computeImprintAlignment above
// treats one side as a fixed candidate DATE, which is right for an event
// (a release date) but silently drops almost everything when the other
// side is actually a real PERSON - their own Life Path and their own
// day-theme imprints never get looked at unless their birthday literally
// falls on the 28th/8th/11th. computeImprintPersonAlignment cross-compares
// both people's full imprint sets directly instead. One result block, not
// two - the cross-comparison is already symmetric, there's no "direction".
function imprintPersonMatchRow(m, nameA, nameB) {
  const aSide = `${imprintPossessive(nameA)} ${m.aLabel} (${m.aLp}LP)`;
  const bSide = `${imprintPossessive(nameB)} ${m.bLabel} (${m.bLp}LP)`;
  const verb = m.kind === 'exact' ? 'exactly matches' : `is compatible (${m.compatScore}) with`;
  return { label: aSide, text: `${verb} ${bSide}`, points: m.points };
}

// 2026-08-07 domain reweigh: a flat match list stopped being useful once
// the score is genuinely 6 separate domain reads (Financial/Career/
// Relationship/Family/Health/Spiritual) - showing one overall badge plus a
// row of tappable domain chips, each opening its own match detail, instead
// of a single "see what matched" dump.
function imprintPersonMatchTagHtml(m) {
  if (m.secondary) return ' <span class="imprint-match-tag">secondary</span>';
  if (m.lucky) return ' <span class="imprint-match-tag">lucky boost</span>';
  return '';
}

function imprintPersonAlignmentResultHtml(result, nameA, nameB) {
  const domainKeys = Object.keys(result.domains);
  const chips = domainKeys.map((key) => {
    const dm = result.domains[key];
    return `<button type="button" class="imprint-domain-chip ${dm.tier}" data-imprint-domain="${key}">${dm.emoji} ${escapeHtml(dm.label)} <b>${dm.score}</b></button>`;
  }).join('');
  const panels = domainKeys.map((key) => {
    const dm = result.domains[key];
    const rows = dm.matches.length
      ? dm.matches.map((m) => {
          const row = imprintPersonMatchRow(m, nameA, nameB);
          return `<div class="imprint-match-row"><b>${escapeHtml(row.label)}:</b> ${escapeHtml(row.text)}${imprintPersonMatchTagHtml(m)} <span class="imprint-match-pts">+${row.points}</span></div>`;
        }).join('')
      : '<div class="imprint-match-empty">No resonance in this domain.</div>';
    return `<div class="imprint-domain-panel" data-imprint-domain-panel="${key}" hidden>${rows}</div>`;
  }).join('');

  return `
    <div class="imprint-result imprint-result-domains">
      <div class="imprint-result-head">
        <div class="imprint-result-score ${result.tier}">${result.score}</div>
        <div class="imprint-result-label">${escapeHtml(nameA)} <i>&times;</i> ${escapeHtml(nameB)} Imprints</div>
      </div>
      <div class="imprint-domain-grid">${chips}</div>
      <div class="imprint-domain-panels">${panels}</div>
    </div>`;
}

// 2026-08-07 fix: showing BOTH directions only makes sense when both sides
// are real people - once one side is a plain event/calendar date (an EMAX
// entry, a movie, "Today"), that side has no birth-imprint-history of its
// own, so treating it as personBirthDate produces nonsense ("American
// Hustle's imprints" - a movie doesn't have imprints). personSide tells
// this which of A/B is the actual person; only that one direction renders.
// Defaults to 'A' since that's the person at every existing call site
// except EMAX's item popup, which passes 'B' explicitly.
function imprintPillContentHtml(dateA, nameA, dateB, nameB, personMode, personSide) {
  if (personMode) {
    const r = computeImprintPersonAlignment(dateA, dateB);
    return imprintPersonAlignmentResultHtml(r, nameA, nameB);
  }
  if (personSide === 'B') {
    const rB = computeImprintAlignment(dateB, dateA);
    return imprintAlignmentResultHtml(rB, nameB, nameA);
  }
  const rA = computeImprintAlignment(dateA, dateB);
  return imprintAlignmentResultHtml(rA, nameA, nameB);
}

// One domain open at a time, closing on re-tap - same interaction as an
// accordion. Wired alongside the flat-list reveal buttons below so every
// existing call site gets both behaviors with no per-site changes.
function wireImprintDomainChips(scopeEl) {
  const chips = scopeEl.querySelectorAll('[data-imprint-domain]');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.imprintDomain;
      const panel = scopeEl.querySelector(`[data-imprint-domain-panel="${key}"]`);
      const wasOpen = chip.classList.contains('open');
      scopeEl.querySelectorAll('[data-imprint-domain-panel]').forEach((p) => { p.hidden = true; });
      chips.forEach((c) => c.classList.remove('open'));
      if (!wasOpen && panel) {
        panel.hidden = false;
        chip.classList.add('open');
      }
    });
  });
}

// Each imprint-pill-body can hold up to 2 result blocks (both directions),
// each with its own independent reveal toggle - queried fresh rather than
// relying on unique ids, since a page could have multiple compat heroes.
// Also wires the domain-chip accordion (person-mode results) so every call
// site gets both interactions with no per-site changes.
function wireImprintRevealButtons(scopeEl) {
  scopeEl.querySelectorAll('[data-imprint-reveal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const body = btn.nextElementSibling;
      const open = body.hidden;
      body.hidden = !open;
      btn.textContent = open ? '▴ Hide what matched' : '▾ See what matched';
    });
  });
  wireImprintDomainChips(scopeEl);
}

/* Shared shield-badge shell for cycle-based breakdowns (Energy Flow, Month
   Outlook detail, Year Roadmap detail) - user: "make sure the new
   compatibility screen is whole app wide" - these three still wore the old
   score-hero/score-big treatment after every person-vs-person surface
   moved to renderCompatHero's shield. Same visual language, caller-
   specific cards/extras/meters. */
function compatHeroShellHtml(finalScore, shieldTag, verdictHead, verdictBody, cardsHtml, extraHtml, meterRowsHtml) {
  const tier = scoreClass(finalScore);
  return `
    <div class="compat-hero compact" style="--tier-c:${COMPAT_TIER_COLOR[tier]}; --tier-glow:${COMPAT_TIER_GLOW[tier]}">
      <div class="compat-badge-wrap">
        <div class="compat-embers">${compatEmbersHtml()}</div>
        <div class="shield">
          <div class="shield-inner">
            <div class="shield-score">${finalScore}<span>%</span></div>
            <div class="shield-tag">${shieldTag}</div>
          </div>
        </div>
      </div>
      <div class="compat-verdict-head">${verdictHead}</div>
      <div class="compat-verdict-body">${verdictBody}</div>
      ${cardsHtml}
      ${extraHtml || ''}
      <button type="button" class="compat-reveal-btn" data-compat-reveal>▾ See full breakdown</button>
      <div class="compat-reveal-body" data-compat-reveal-body>${meterRowsHtml}</div>
    </div>
  `;
}
// querySelectorAll'd (not just the first match) so a container holding
// TWO hero blocks - the split-year Roadmap detail, which stacks an
// "Until"/"From" pair - wires each one's own reveal button to its own
// body, not just the first.
function wireCompatReveal(containerEl) {
  containerEl.querySelectorAll('.compat-hero').forEach((heroEl) => {
    const revealBtn = heroEl.querySelector('[data-compat-reveal]');
    const revealBody = heroEl.querySelector('[data-compat-reveal-body]');
    if (!revealBtn) return;
    revealBtn.addEventListener('click', () => {
      const open = revealBody.classList.toggle('open');
      revealBtn.textContent = open ? '▴ Hide full breakdown' : '▾ See full breakdown';
    });
  });
}

// Renders a computeEnergyFlow() result - Personal Year/Month/Day vs
// Universal Year/Month/Day, numerology + Vietnamese zodiac only.
const ENERGY_FLOW_VERDICT = {
  good: { head: 'Flowing With You', body: "Your cycles and the world's are in step — push." },
  mid: { head: 'Mixed Flow', body: 'Some cycles align, others drag — pick your spots.' },
  bad: { head: 'Against the Current', body: "The day's cycles cut across yours — go light." },
};
function renderEnergyFlowResults(containerEl, r) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);

  const verdict = ENERGY_FLOW_VERDICT[scoreClass(r.finalScore)];
  const cardsHtml = `
    <div class="compat-cards">
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(r.numerology.score)]}">
        <div class="compat-card-name">Numerology</div>
        <div class="compat-card-vs"><span>${r.numerology.personalDay}</span><i>vs</i><span>${lifePathDisplayText(r.numerology.universalDay)}</span></div>
        <div class="compat-card-tier">${compatTierWord(r.numerology.score, COMPAT_NUMEROLOGY_WORDS)}</div>
      </div>
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(r.vietnamese.score)]}">
        <div class="compat-card-name">Vietnamese Zodiac</div>
        <div class="compat-card-vs compat-card-vs-glyph"><span>${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.personalDaySign] || ''}</span><i>vs</i><span>${VIETNAMESE_ZODIAC_EMOJI[r.vietnamese.universalDaySign] || ''}</span></div>
        <div class="compat-card-tier">${compatTierWord(r.vietnamese.score, COMPAT_VIETNAMESE_WORDS)}</div>
      </div>
    </div>`;

  const meters =
    compatMeterRow(`Year (${r.numerology.personalYear} ↔ ${r.numerology.universalYear})`, r.numerology.yearScore) +
    compatMeterRow(`Month (${r.numerology.personalMonth} ↔ ${r.numerology.universalMonth})`, r.numerology.monthScore) +
    compatMeterRow(`Day (${r.numerology.personalDay} ↔ ${lifePathDisplayText(r.numerology.universalDay)})`, r.numerology.dayScore) +
    compatMeterRow(`Zodiac Year (${r.vietnamese.personalYearSign} ↔ ${r.vietnamese.universalYearSign})`, r.vietnamese.yearScore) +
    compatMeterRow(`Zodiac Month (${r.vietnamese.personalMonthSign} ↔ ${r.vietnamese.universalMonthSign})`, r.vietnamese.monthScore) +
    compatMeterRow(`Zodiac Day (${r.vietnamese.personalDaySign} ↔ ${r.vietnamese.universalDaySign})`, r.vietnamese.daySignScore);

  containerEl.innerHTML = compatHeroShellHtml(r.finalScore, 'Energy Flow', verdict.head, verdict.body, cardsHtml, bonusChipsHtml(r.bonuses), meters);
  wireCompatReveal(containerEl);
}

// Renders a computeMonthOutlook() result - all 12 calendar months, in
// calendar order (redesign 2026-08-31: was best-to-worst score rank: the
// owner's call was "what matters most is the actual data, like what
// personal year/month it is", not the compat score, so rank badges are
// gone and the row leads with the Personal Month number itself).
//
// computeMonthOutlook (compat-engine.js, sacrosanct) runs one row per entry
// in the monthsTable it's given - getMonthsTableByBirthDay (db-core.js) now
// feeds it 2 rows for any calendar month the birth-day splits in two, with
// the split encoded into `.name` as "Jan|early"/"Jan|late" (the only field
// computeMonthOutlook passes through untouched). This groups the flat
// ranked list back into one entry per calendar month before rendering, so
// a split month renders as a single pcycleSplitRowHtml row - exactly like
// renderYearRoadmap groups Personal-Year periods back into one row per
// calendar year.
function groupMonthOutlook(rankedMonths) {
  const byKey = new Map();
  rankedMonths.forEach((m) => {
    const [base, part] = m.name.split('|');
    m.name = base;
    m.part = part || 'whole';
    const key = `${m.cycleYear}-${m.index}`;
    if (!byKey.has(key)) byKey.set(key, { index: m.index, cycleYear: m.cycleYear, name: base, animal: m.animal, periods: [] });
    byKey.get(key).periods.push(m);
  });
  const months = Array.from(byKey.values()).sort((a, b) => a.index - b.index);
  months.forEach((mo) => mo.periods.sort((a, b) => (a.part === 'early' ? -1 : 1)));
  return months;
}

function renderMonthOutlook(containerEl, rankedMonths, birthDate) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, true);
  const months = groupMonthOutlook(rankedMonths.slice());
  containerEl.innerHTML = `
    <div class="score-hero month-outlook-hero">
      <div class="month-outlook-icon">📅</div>
      <div class="score-names">Yearly Outlook</div>
    </div>
    <div class="calendar-rank-list month-outlook-list">
      ${months.map((mo) => {
        const lucky = mo.periods.some((p) => p.isLuckyMonth);
        const label = `${mo.name}${lucky ? ' 🍀' : ''}`;
        return `
        <div class="pcycle-row-wrap" data-index="${mo.index}" title="click for the breakdown">
          ${mo.periods.length === 1
            ? pcycleSingleRowHtml(label, mo.animal, { number: mo.periods[0].personalMonth, finalScore: mo.periods[0].finalScore })
            : pcycleSplitRowHtml(
                label, mo.animal,
                { number: mo.periods[0].personalMonth, finalScore: mo.periods[0].finalScore },
                { number: mo.periods[1].personalMonth, finalScore: mo.periods[1].finalScore },
                `${String(mo.index).padStart(2, '0')}/${String(birthDate.getDate()).padStart(2, '0')}`
              )}
        </div>`;
      }).join('')}
    </div>
  `;

  // Tapping a row opens the breakdown as its own popup (storyModalOverlay,
  // already wired for identity/compound popups elsewhere in this file) -
  // NOT an in-place swap at the bottom of this same list, which used to
  // force a scroll all the way down to see anything (owner's call
  // 2026-08-31: "it shows a popup not scrolls all the way down").
  containerEl.querySelectorAll('.pcycle-row-wrap').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      const monthIndex = Number(rowEl.dataset.index);
      const mo = months.find((row) => row.index === monthIndex);
      if (!mo) return;
      const target = document.getElementById('storyModalBody');
      if (mo.periods.length === 1) {
        renderMonthDetail(target, mo.periods[0]);
      } else {
        renderSplitMonthDetail(target, mo.periods[0], mo.periods[1], birthDate, mo.index);
      }
      document.getElementById('storyModalOverlay').classList.add('active');
    });
  });
}

// Drills into a single month from computeMonthOutlook()'s result - reuses
// the exact same numbers already shown in the ranked list (personalMonthScore,
// universalMonthScore, vietnameseScore, westernScore, luckyNote) rather than
// running a different comparison, so this breakdown always adds up to the
// same score the list already showed for that month.
const MONTH_DETAIL_VERDICT = {
  good: { head: 'Strong Month', body: 'The cycle backs you here — worth aiming real plans at.' },
  mid: { head: 'Workable Month', body: 'Neutral tape — what you bring matters more than what it gives.' },
  bad: { head: 'Challenging Month', body: 'The cycle leans against you — lighter commitments, more review.' },
};
// Pure hero-block builder, shared by the single-period detail (one hero)
// and the split-month detail (two heroes stacked, "Until"/"From" labeled -
// same pattern as buildYearRoadmapHeroHtml/renderSplitYearRoadmapDetail)
// so the actual card/meter markup only exists in one place.
function buildMonthDetailHeroHtml(m) {
  const verdict = MONTH_DETAIL_VERDICT[scoreClass(m.finalScore)];
  const cardsHtml = `
    <div class="compat-cards">
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(m.numerologyScore)]}">
        <div class="compat-card-name">Numerology</div>
        <div class="compat-card-vs"><span>PM ${m.personalMonth}</span><i>·</i><span>UM ${m.universalMonth}</span></div>
        <div class="compat-card-tier">${compatTierWord(m.numerologyScore, COMPAT_NUMEROLOGY_WORDS)}</div>
      </div>
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(m.vietnameseScore)]}">
        <div class="compat-card-name">Vietnamese Zodiac</div>
        <div class="compat-card-vs compat-card-vs-glyph"><span>${VIETNAMESE_ZODIAC_EMOJI[m.personMonthSign] || ''}</span><i>vs</i><span>${VIETNAMESE_ZODIAC_EMOJI[m.animal] || ''}</span></div>
        <div class="compat-card-tier">${compatTierWord(m.vietnameseScore, COMPAT_VIETNAMESE_WORDS)}</div>
      </div>
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(m.westernScore)]}">
        <div class="compat-card-name">Western Zodiac</div>
        <div class="compat-card-vs compat-card-vs-glyph"><span>${ZODIAC_SYMBOLS[m.personSunSign] || ''}</span><i>vs</i><span>${ZODIAC_SYMBOLS[m.westernRepSign] || ''}</span></div>
        <div class="compat-card-tier">${compatTierWord(m.westernScore, COMPAT_WESTERN_WORDS)}</div>
      </div>
    </div>`;

  const bonuses = { total: m.luckyBonus, notes: m.luckyNote ? [m.luckyNote] : [] };
  const meters =
    compatMeterRow(`Personal Month (Lifepath ↔ ${m.personalMonth})`, m.personalMonthScore) +
    compatMeterRow(`Universal Month (Lifepath ↔ ${m.universalMonth})`, m.universalMonthScore) +
    compatMeterRow(`Month Sign (${m.personMonthSign} ↔ ${m.animal})`, m.vietnameseScore) +
    compatMeterRow(`Sign (${m.personSunSign} ↔ ${m.westernRepSign})`, m.westernScore);

  return compatHeroShellHtml(m.finalScore, `${m.name} ${m.cycleYear}`, verdict.head, verdict.body, cardsHtml, bonusChipsHtml(bonuses), meters);
}

function renderMonthDetail(containerEl, m) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);
  containerEl.innerHTML = buildMonthDetailHeroHtml(m);
  wireCompatReveal(containerEl);
}

// Split-month companion to renderMonthDetail - stacks both periods' hero
// blocks in the same popup, same pattern as renderSplitYearRoadmapDetail.
function renderSplitMonthDetail(containerEl, earlyM, lateM, birthDate, monthIndex) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);
  const md = `${String(monthIndex).padStart(2, '0')}/${String(birthDate.getDate()).padStart(2, '0')}`;
  containerEl.innerHTML = `
    <div class="year-roadmap-split-label">Until ${md}</div>
    ${buildMonthDetailHeroHtml(earlyM)}
    <div class="year-roadmap-split-label">From ${md}</div>
    ${buildMonthDetailHeroHtml(lateM)}
  `;
  wireCompatReveal(containerEl);
}

// Renders a computeYearRoadmap() result (db-core.js) - every calendar year
// across the user's current Pinnacle period, in chronological order (a
// roadmap, not a ranking - unlike Month Outlook's best-to-worst list).
function renderYearRoadmap(containerEl, roadmap) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, true);
  const pinnacleOrdinal = ['1st', '2nd', '3rd', '4th'][roadmap.pinnacleIndex - 1];
  containerEl.innerHTML = `
    <div class="score-hero month-outlook-hero">
      <div class="month-outlook-icon">🗺️</div>
      <div class="score-names">Personal Year Roadmap</div>
      <div class="year-roadmap-subhead">Your ${pinnacleOrdinal} Pinnacle &middot; ${roadmap.startYear}&ndash;${roadmap.endYear}</div>
    </div>
    <div class="calendar-rank-list year-roadmap-list">
      ${roadmap.years.map((y) => `
        <div class="pcycle-row-wrap" data-year-key="${y.year}" title="click for the breakdown">
          ${y.periods.length === 1
            ? pcycleSingleRowHtml(
                String(y.year),
                y.periods[0].animal,
                { number: y.periods[0].personalYear, finalScore: y.periods[0].finalScore }
              )
            : pcycleSplitRowHtml(
                String(y.year),
                y.periods[0].animal,
                { number: y.periods[0].personalYear, finalScore: y.periods[0].finalScore },
                { number: y.periods[1].personalYear, finalScore: y.periods[1].finalScore },
                `${String(roadmap.birthDate.getMonth() + 1).padStart(2, '0')}/${String(roadmap.birthDate.getDate()).padStart(2, '0')}`
              )}
        </div>
      `).join('')}
    </div>
  `;

  // Tapping a row opens the breakdown as its own popup (storyModalOverlay),
  // not an in-place swap at the bottom of this same list - see the same fix
  // on Month Outlook above (owner's call 2026-08-31: "it shows a popup not
  // scrolls all the way down").
  containerEl.querySelectorAll('.pcycle-row-wrap').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      const y = roadmap.years.find((row) => String(row.year) === rowEl.dataset.yearKey);
      if (!y) return;
      const target = document.getElementById('storyModalBody');
      if (y.periods.length === 1) {
        renderYearRoadmapDetail(target, roadmap, y.periods[0]);
      } else {
        renderSplitYearRoadmapDetail(target, roadmap, y.periods[0], y.periods[1]);
      }
      document.getElementById('storyModalOverlay').classList.add('active');
    });
  });
}

// Drills into a single year from computeYearRoadmap()'s result - reuses the
// exact same numbers already shown in the list (finalScore, vietnameseScore,
// personalYearScore, universalYearScore, verdict, magnitude) rather than
// running a different comparison, so this breakdown always adds up to the
// same score/verdict the list already showed for that year.
const YEAR_ROADMAP_VERDICT_NOTE = {
  good: 'Own, Trine, or Friendly zodiac year, with no Personal Year 7/11 override.',
  bad: 'Either an Enemy zodiac year, or Personal Year 7/11 (which overrides even an otherwise-good zodiac year).',
  mid: 'Neither a matched zodiac year nor Personal Year 7/11 - a neutral year.',
};

// Builds ONE period's hero block HTML without touching the DOM - shared by
// the single-period detail (one hero) and the split-year detail (two heroes
// stacked, "Until"/"From" labeled) so the actual card/meter/callout markup
// only exists in one place.
function buildYearRoadmapHeroHtml(roadmap, y, extraHtml, labelOverride) {
  const calloutHtml = `
    <div class="year-roadmap-emax-callout ${y.verdict}${Math.abs(y.magnitude) >= 2 ? ' severe' : ''}">
      <div class="year-roadmap-emax-verdict">${y.verdict.toUpperCase()} <span class="year-roadmap-emax-magnitude">(${y.magnitude > 0 ? '+' : ''}${y.magnitude})</span></div>
      <div class="year-roadmap-emax-note">${YEAR_ROADMAP_VERDICT_NOTE[y.verdict]}</div>
    </div>`;

  const cardsHtml = `
    <div class="compat-cards">
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(y.numerologyScore)]}">
        <div class="compat-card-name">Numerology</div>
        <div class="compat-card-vs"><span>PY ${y.personalYear}</span><i>·</i><span>UY ${y.universalYear}</span></div>
        <div class="compat-card-tier">${compatTierWord(y.numerologyScore, COMPAT_NUMEROLOGY_WORDS)}</div>
      </div>
      <div class="compat-card" style="--cc-t:${COMPAT_TIER_COLOR[scoreClass(y.vietnameseScore)]}">
        <div class="compat-card-name">Vietnamese Zodiac</div>
        <div class="compat-card-vs compat-card-vs-glyph"><span>${VIETNAMESE_ZODIAC_EMOJI[roadmap.ownAnimal] || ''}</span><i>vs</i><span>${VIETNAMESE_ZODIAC_EMOJI[y.animal] || ''}</span></div>
        <div class="compat-card-tier">${compatTierWord(y.vietnameseScore, COMPAT_VIETNAMESE_WORDS)}</div>
      </div>
    </div>`;

  const meters =
    compatMeterRow(`Personal Year (Lifepath ↔ ${y.personalYear})`, y.personalYearScore) +
    compatMeterRow(`Universal Year (Lifepath ↔ ${y.universalYear})`, y.universalYearScore) +
    compatMeterRow(`Birth Animal (${roadmap.ownAnimal} ↔ ${y.animal})`, y.vietnameseScore);

  const verdict = MONTH_DETAIL_VERDICT[scoreClass(y.finalScore)];
  return compatHeroShellHtml(
    y.finalScore,
    labelOverride || emaxYearPeriodLabel(y.year, y.part, roadmap.birthDate),
    verdict.head.replace('Month', 'Year'),
    verdict.body,
    cardsHtml,
    calloutHtml + (extraHtml || ''),
    meters
  );
}

// "add an option to go through the personal months of that year they
// selected" (owner, Code212 round 2026-08-31) - getMonthsTable only ever
// reads today.getFullYear() from its second arg, so a synthetic Jan 1 of
// the selected roadmap year produces that year's own 12-month table with
// no changes to numerology.js itself. Wires whichever #roadmapMonthsBtn is
// in containerEl - only one exists even on the split-year detail (both
// periods share the same calendar year's months, so it only needs to live
// once, on the later/"From" block).
function wireRoadmapMonthsBtn(containerEl, roadmap, year) {
  const monthsBtn = containerEl.querySelector('#roadmapMonthsBtn');
  if (!monthsBtn) return;
  monthsBtn.addEventListener('click', () => {
    const table = getMonthsTableByBirthDay(roadmap.birthDate, new Date(year, 0, 1));
    const ranked = computeMonthOutlook(roadmap.birthDate, table);
    document.getElementById('storyModalOverlay').classList.remove('active');
    renderMonthOutlook(document.getElementById('compatModalBody'), ranked, roadmap.birthDate);
  });
}

function renderYearRoadmapDetail(containerEl, roadmap, y) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);
  const monthsBtnHtml = `<button type="button" class="story-link" id="roadmapMonthsBtn">📅 See personal months for ${y.year}</button>`;
  containerEl.innerHTML = buildYearRoadmapHeroHtml(roadmap, y, monthsBtnHtml);
  wireCompatReveal(containerEl);
  wireRoadmapMonthsBtn(containerEl, roadmap, y.year);
}

// Split-year companion to renderYearRoadmapDetail - stacks both periods'
// hero blocks in the same popup, each labeled with the real boundary date,
// instead of forcing a pick between the two (a birthday-split year is
// genuinely two different Personal Years; showing only one would drop
// real data the list row itself already shows via the two-tone bar).
function renderSplitYearRoadmapDetail(containerEl, roadmap, earlyY, lateY) {
  containerEl.classList.add('active');
  setModalWidth(containerEl, false);
  const md = `${String(roadmap.birthDate.getMonth() + 1).padStart(2, '0')}/${String(roadmap.birthDate.getDate()).padStart(2, '0')}`;
  const monthsBtnHtml = `<button type="button" class="story-link" id="roadmapMonthsBtn">📅 See personal months for ${earlyY.year}</button>`;
  containerEl.innerHTML = `
    <div class="year-roadmap-split-label">Until ${md}</div>
    ${buildYearRoadmapHeroHtml(roadmap, earlyY, null, String(earlyY.year))}
    <div class="year-roadmap-split-label">From ${md}</div>
    ${buildYearRoadmapHeroHtml(roadmap, lateY, monthsBtnHtml, String(lateY.year))}
  `;
  wireCompatReveal(containerEl);
  wireRoadmapMonthsBtn(containerEl, roadmap, earlyY.year);
}

/* =========================== General Reading + identity popups ==========
   Moved here from render.js (2026-08-08) so any page that already loads
   compat-render.js - not just Profile/Calculator/Famous, which load all of
   render.js's page-specific #bday wiring too - can show the same "the
   general reading" link and tappable Lifepath/Day Born/Day#/PD/sign/animal
   popups. First consumer: category.js (the Database entry popup) - user:
   "the database isn't showing the general reading and I also can't click
   the lifepath and stuff like I can in the profile." Every page that calls
   renderCompoundStories() needs a #storyModalOverlay/#storyModalBody pair
   in its HTML (same markup as profile.html) and compound-meanings.js
   loaded before this file runs. ========================================== */

// Boost13, 2026-08-06: Core Numbers and Personal Cycles each get their own
// tap-to-reveal "whole story" (the specific compound behind each number,
// not just its reduced root), plus one page-wide "big picture" combining
// both. Purely the person's own numbers - today's date never enters this
// (that's Today page's job alone). Idempotent: inserts each tap target
// once, then just re-wires its click handler on every render() call so a
// changed birthdate always reopens with fresh content.
// Restyles a plain-text .story-link button ("🧭 the general reading") into
// the icon-badge + label + chevron row (Boost13 UI round, 2026-09-01 -
// owner: "the readings buttons... looks ugly disgusting and everything
// has to fit together nice"). Splits on the first space so any emoji-led
// label works without each call site building the markup itself.
function styleStoryLink(el) {
  if (!el || el.dataset.storyLinkStyled) return el;
  el.dataset.storyLinkStyled = '1';
  const text = el.textContent.trim();
  const spaceIdx = text.indexOf(' ');
  const icon = spaceIdx === -1 ? '' : text.slice(0, spaceIdx);
  const label = spaceIdx === -1 ? text : text.slice(spaceIdx + 1);
  el.innerHTML = `<span class="story-link-icon">${icon}</span><span class="story-link-text">${label}</span><span class="story-link-chevron">›</span>`;
  return el;
}

function insertStoryLink(id, afterSelector, label) {
  let el = document.getElementById(id);
  if (el) return styleStoryLink(el);
  const anchor = document.querySelector(afterSelector);
  if (!anchor) return null;
  el = document.createElement('button');
  el.type = 'button';
  el.id = id;
  el.className = 'story-link';
  el.textContent = label;
  anchor.insertAdjacentElement('afterend', el);
  return styleStoryLink(el);
}

// Boost13 OVERDRIVE (2026-08-08): one visual paragraph per trait cluster
// instead of one giant joined string - user: "supper crammed... no one is
// going to read that." Each cluster renders as a light half (gold left
// border) flush against a shadow half (red left border) - together they
// read as one paragraph block, but the border still shows where the light
// sentence ends and the shadow sentence begins.
// 2026-08-26: the gray connector line ("There's also this...") no longer
// renders - user: "get rid of those gray introductions lines." pp.connector
// still exists on the data (composer/text output untouched), just unused
// here.
function openStoryModal(title, story) {
  if (!story) return;
  const body = (story.paragraphs && story.paragraphs.length)
    ? story.paragraphs.map((pp) => {
      // Every piece renders only if it exists - depth tiers mean plenty of
      // paragraphs carry no shadow/extra/detail now, and interpolating a
      // missing one printed a literal "null" in the shadow box (user:
      // "none of that null stuff"). The extra/detail lines are the cherry
      // on top of whichever half the paragraph actually has.
      const extras = [pp.extra, pp.detail].filter(Boolean).map((s) => ` ${s}`).join('');
      const lightHtml = `<div class="reading-half reading-half-light">${pp.light || ''}${pp.shadow ? '' : extras}</div>`;
      const shadowHtml = pp.shadow ? `<div class="reading-half reading-half-shadow">${pp.shadow}${extras}</div>` : '';
      return `<div class="reading-para">${lightHtml}${shadowHtml}</div>`;
    }).join('')
    : `<div class="story-modal-text">${story.text}</div>`;
  document.getElementById('storyModalBody').innerHTML =
    `<div class="story-modal-title">${title}</div>${body}`;
  document.getElementById('storyModalOverlay').classList.add('active');
}

// Round 14 (2026-08-06): per-number identity popups - tap Lifepath/Day
// Born/Day#/PD to get just that number's own "who you are" section
// (moved here from Today's modal, where it described the profile owner
// but lived on the wrong page).
//
// 2026-08-08 round 2: light/shadow got pulled from these popups entirely
// - the general reading already shows that exact text verbatim, so
// leaving it in the popup meant tapping Lifepath and then reading the
// general reading repeated the same sentence twice. User: "don't make it
// be the same thing that's going to be shown on the general reading,
// this is why I gave you a lot of copy so there's no repeats." Popups
// now show ONLY the characteristics bullets (the PDF's Emotional Reality
// Checks) - content composeGeneralReading never touches. First occurrence
// of a root shows characteristics (3); a repeat shows moreCharacteristics
// (2, the reserve) instead of the same bullets again.
function openIdentityModal(label, entry, opts) {
  if (!entry) return;
  const o = opts || {};
  const list = o.cherry ? (entry.moreCharacteristics || []) : (entry.characteristics || []);
  if (!list.length) return;
  const bullets = list.map((c) => `<li>${c}</li>`).join('');
  const note = o.cherry ? `<div class="story-row">Same energy as your ${o.repeatOf}. A few more angles:</div>` : '';
  document.getElementById('storyModalBody').innerHTML =
    `<div class="story-modal-title">${label}</div>${note}<ul class="story-bullets">${bullets}</ul>`;
  document.getElementById('storyModalOverlay').classList.add('active');
}

// Boost13 (2026-08-07): tap Western sign / Vietnamese year/month/day for
// their own "who you are" popup, same visual pattern as openIdentityModal
// above but pulling straight from the plain-voice content bank.
//
// 2026-08-08 round 2: same fix as openIdentityModal - light/shadow
// dropped (duplicates the general reading verbatim). `deep` (the
// emotional-core line, general reading never touches it) stays as a
// short intro, then characteristics/moreCharacteristics bullets exactly
// like the number popups - first occurrence gets characteristics (3), a
// repeat animal gets moreCharacteristics (2) instead of the same content.
function openZodiacIdentityModal(label, entry, opts) {
  if (!entry) return;
  const o = opts || {};
  const list = o.cherry ? (entry.moreCharacteristics || []) : (entry.characteristics || []);
  if (!list.length) return;
  const bullets = list.map((c) => `<li>${c}</li>`).join('');
  const note = o.cherry
    ? `<div class="story-row">Same animal as your ${o.repeatOf}. A few more angles:</div>`
    : (entry.deep ? `<div class="story-row">${entry.deep}</div>` : '');
  document.getElementById('storyModalBody').innerHTML =
    `<div class="story-modal-title">${label}</div>${note}<ul class="story-bullets">${bullets}</ul>`;
  document.getElementById('storyModalOverlay').classList.add('active');
}

// isFamous is path-based ("/famous/i.test(location.pathname)") - any page
// other than famous.html naturally gets Profile's second-person "you"
// voice + tappable identity popups, with zero extra wiring needed. That's
// exactly why calling this from category.js "just works" the same way
// Profile does - category.html's pathname doesn't match /famous/.
function renderCompoundStories(r, birthDate) {
  const isFamous = /famous/i.test(location.pathname);

  const coreParts = [
    { label: 'Life Path', slot: 'core', raw: null, entry: compoundEntryForLifePath(r.lifePath, r.lifePathCompound) },
    { label: 'Day Born', slot: 'rhythm', raw: r.dayBornRaw },
    { label: 'Day#', slot: 'year', raw: r.dayNumRaw },
    { label: 'Combo', slot: 'combo', raw: compoundRawCombo(birthDate) },
  ].map((p) => ({ label: p.label, slot: p.slot, entry: p.entry || compoundEntry(p.raw) }));

  const cycleParts = [
    { label: 'Personal Year', slot: 'personalYear', raw: r.py.raw },
    { label: 'Personal Month', slot: 'personalMonth', raw: r.pm.raw },
    { label: 'Personal Day', slot: 'today', raw: r.pd.raw },
  ].map((p) => ({ label: p.label, slot: p.slot, entry: compoundEntry(p.raw) }));

  const coreLinkOld = document.getElementById('coreNumbersStoryLink');
  if (coreLinkOld) coreLinkOld.style.display = 'none';
  const cyclesLinkOld = document.getElementById('personalCyclesStoryLink');
  if (cyclesLinkOld) cyclesLinkOld.style.display = 'none';
  const bigLinkOld = document.getElementById('bigPictureStoryLink');
  if (bigLinkOld) bigLinkOld.style.display = 'none';

  // Weight-ordered (2026-08-13, user's doctrine): Lifepath heaviest, then
  // Day Born, Combo, Day#, then Vietnamese Year > Month > Day, astrology
  // last - and depth scales with weight ("more ink for heavier items").
  // All four natal placements ride in as planet parts (role + their sign,
  // blended by the composer); Day# joins the reading for the first time.
  const generalParts = [
    { kind: 'number', root: coreParts[0].entry.root, impure: coreParts[0].entry.impure, isLifePath: true, depth: 'full' },
    { kind: 'number', root: coreParts[1].entry.root, impure: coreParts[1].entry.impure, depth: 'std' },
    { kind: 'number', root: coreParts[3].entry.root, impure: coreParts[3].entry.impure, depth: 'lean' },
    { kind: 'number', root: coreParts[2].entry.root, impure: coreParts[2].entry.impure, depth: 'lean' },
    { kind: 'animal', key: r.chineseYear, depth: 'std' },
    { kind: 'animal', key: r.chineseMonth, depth: 'lean' },
    { kind: 'animal', key: r.chineseDay, depth: 'micro' },
    { kind: 'planet', planet: 'Sun', key: r.sunSign, depth: 'planet-full' },
    { kind: 'planet', planet: 'Saturn', key: r.saturnSign, depth: 'planet-lean' },
    { kind: 'planet', planet: 'Jupiter', key: r.jupiterSign, depth: 'planet-lean' },
    { kind: 'planet', planet: 'Venus', key: r.venusSign, depth: 'planet-lean' },
  ];
  const generalReading = composeGeneralReading(generalParts, { thirdPerson: isFamous });
  const generalLink = insertStoryLink('generalReadingStoryLink', '.grid4.subrow', '🧭 the general reading');
  if (generalLink) {
    generalLink.style.display = generalReading ? '' : 'none';
    generalLink.onclick = () => openStoryModal('The General Reading', generalReading);
  }

  if (!isFamous) {
    const identityTargets = [
      { id: 'lifePath', label: 'Lifepath', root: coreParts[0].entry.root, impure: coreParts[0].entry.impure },
      { id: 'dayBornReduced', label: 'Day Born', root: coreParts[1].entry.root, impure: coreParts[1].entry.impure },
      { id: 'dayNumReduced', label: 'Day#', root: coreParts[2].entry.root, impure: coreParts[2].entry.impure },
      { id: 'combo', label: 'Combo', root: coreParts[3].entry.root, impure: coreParts[3].entry.impure },
      { id: 'pdReduced', label: 'Personal Day', root: cycleParts[2].entry.root, impure: cycleParts[2].entry.impure },
    ];
    const seenNumberSlots = {};
    identityTargets.forEach((t) => {
      t.entry = numberIdentityV2(t.root, t.impure);
      if (!t.entry) return;
      const prior = seenNumberSlots[t.root];
      if (prior === undefined) {
        seenNumberSlots[t.root] = t.label;
      } else if (prior !== null) {
        t.opts = { cherry: true, repeatOf: prior };
        seenNumberSlots[t.root] = null;
      } else {
        t.entry = null;
        t.plainDoubled = true;
      }
    });
    identityTargets.forEach((t) => {
      const el = document.getElementById(t.id);
      if (!el) return;
      if (t.plainDoubled) {
        el.classList.add('idnum-tap');
        el.onclick = () => { document.getElementById('storyModalBody').innerHTML = `<div class="story-modal-title">${t.label}</div><div class="story-row">Same current as earlier in your chart, running doubled.</div>`; document.getElementById('storyModalOverlay').classList.add('active'); };
        return;
      }
      if (!t.entry) return;
      el.classList.add('idnum-tap');
      el.onclick = () => openIdentityModal(t.label, t.entry, t.opts);
    });

    const zodiacTargets = [
      { id: 'sunSign', label: 'Western Sign', entry: WESTERN_IDENTITY[r.sunSign] },
      { id: 'chineseYear', label: 'Vietnamese Year', entry: VIETNAMESE_IDENTITY[r.chineseYear], animalKey: r.chineseYear },
      { id: 'chineseMonth', label: 'Vietnamese Month', entry: VIETNAMESE_IDENTITY[r.chineseMonth], animalKey: r.chineseMonth },
      { id: 'chineseDay', label: 'Vietnamese Day', entry: VIETNAMESE_IDENTITY[r.chineseDay], animalKey: r.chineseDay },
    ];
    const seenAnimalSlots = {};
    zodiacTargets.forEach((t) => {
      if (!t.animalKey) return;
      const prior = seenAnimalSlots[t.animalKey];
      if (prior === undefined) {
        seenAnimalSlots[t.animalKey] = t.label.replace('Vietnamese ', '');
      } else if (prior !== null) {
        t.opts = { cherry: true, repeatOf: prior };
        seenAnimalSlots[t.animalKey] = null;
      } else {
        t.entry = null;
        t.plainDoubled = true;
      }
    });
    zodiacTargets.forEach((t) => {
      const el = document.getElementById(t.id);
      if (!el) return;
      if (t.plainDoubled) {
        el.classList.add('idnum-tap');
        el.onclick = () => { document.getElementById('storyModalBody').innerHTML = `<div class="story-modal-title">${t.label}</div><div class="story-row">Same animal as earlier in your chart, running doubled.</div>`; document.getElementById('storyModalOverlay').classList.add('active'); };
        return;
      }
      if (!t.entry) return;
      el.classList.add('idnum-tap');
      el.onclick = () => openZodiacIdentityModal(t.label, t.entry, t.opts);
    });
  }
}

// The close-button/backdrop-click wiring for #storyModalOverlay - every
// page that includes the modal markup gets this for free just by loading
// compat-render.js (already loaded everywhere renderCompoundStories is
// needed).
const storyModalOverlayEl = document.getElementById('storyModalOverlay');
if (storyModalOverlayEl) {
  const storyModalCloseEl = document.getElementById('storyModalClose');
  if (storyModalCloseEl) storyModalCloseEl.addEventListener('click', () => storyModalOverlayEl.classList.remove('active'));
  storyModalOverlayEl.addEventListener('click', (e) => { if (e.target === storyModalOverlayEl) storyModalOverlayEl.classList.remove('active'); });
}

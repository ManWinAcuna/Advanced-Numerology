/* Deep Compatibility (2026-08-07) - fuses first-imprint alignment with
 * current compatibility into one blended score: "does this connection
 * matter to who you fundamentally are" (imprint) combined with "is this
 * pairing/day good on the numbers" (current compat). Neither source score
 * is touched - this only reads computeCompatibility (compat-engine.js) and
 * computeImprintAlignment/computeImprintPersonAlignment (imprint-alignment.
 * js) and blends their outputs. Requires compat-engine.js, imprint-
 * alignment.js and overrides-engine.js loaded first; deliberately has NO
 * dependency on compat-render.js (defines its own tier helper below) so it
 * can load right after imprint-alignment.js on every page regardless of
 * where compat-render.js/db-core.js happen to sit in that page's own order.
 */

// Imprint's share of the final blend; (1 - this) goes to current compat.
// Settings-tunable overlay, same pattern as every other weight in the app -
// getOverrideSection('deepCompat').imprintWeight, set from the Settings page.
const DEEP_COMPAT_WEIGHT_DEFAULT = 0.5;

function getEffectiveDeepCompatWeight() {
  const o = getOverrideSection('deepCompat');
  return (o && o.imprintWeight != null) ? o.imprintWeight : DEEP_COMPAT_WEIGHT_DEFAULT;
}

// Same 3-tier thresholds as scoreClass() (compat-render.js) - duplicated
// rather than imported so this file has no load-order dependency on
// compat-render.js (db-core.js/compat-render.js sit in a different relative
// order on the personal-use pages vs. the sports pages).
// Same 77/49 bands as scoreClass (compat-render.js) - owner tried a
// stricter 82/58 on just this headline number 2026-08-29, then confirmed
// live that 77% should read green, so it's back to matching every other
// score color in the app. No 82/58 anywhere anymore.
function deepCompatTier(score) {
  if (score >= 77) return 'good';
  if (score < 49) return 'bad';
  return 'mid';
}

// True only when the imprint side has literally nothing to show - the flat
// 50 baseline with zero real matches - not merely a low score (a genuinely
// bad-but-real imprint match is still real signal and should still pull the
// blend down). Settings-confirmed: this is the one case that falls back to
// current-compat-only rather than diluting the blend with a meaningless
// neutral 50.
function imprintHasNoData(imprintResult, personMode) {
  if (personMode) return Object.values(imprintResult.domains).every((d) => d.matches.length === 0);
  return imprintResult.matches.length === 0;
}

// personMode picks which imprint read applies - person-vs-person
// (computeImprintPersonAlignment) when both dates are real people, person-
// vs-date (computeImprintAlignment) when dateB is a plain event/day.
// numCompatFn/weights are optional pass-throughs to computeCompatibility:
// personal use (Compatibility Calculator) leaves them at computeCompatibility's
// own defaults (numerologyCompatEffective/COMPAT_DEFAULT_WEIGHTS); Sports
// Betting's display-only hook passes each sport's own sportsNumerologyCompat
// + measured weight blend instead, so "current" here always means the same
// thing the rest of that popup already shows elsewhere.
function computeDeepCompatibility(dateA, dateB, personMode, numCompatFn, weights) {
  const current = computeCompatibility(dateA, dateB, numCompatFn, weights);
  const imprint = personMode ? computeImprintPersonAlignment(dateA, dateB) : computeImprintAlignment(dateA, dateB);
  const noImprintData = imprintHasNoData(imprint, personMode);
  const blendWeight = noImprintData ? 0 : getEffectiveDeepCompatWeight();
  const deepScore = noImprintData
    ? current.finalScore
    : Math.round(current.finalScore * (1 - blendWeight) + imprint.score * blendWeight);
  return {
    deepScore,
    tier: deepCompatTier(deepScore),
    currentScore: current.finalScore,
    imprintScore: imprint.score,
    blendWeight,
    noImprintData,
    personMode,
    current,
    imprint,
  };
}

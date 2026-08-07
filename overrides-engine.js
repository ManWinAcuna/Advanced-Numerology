/* Overrides Engine (2026-08-08) - lets the user manually tune compatibility
 * values from a Settings screen instead of asking for a code change every
 * time. Everything here is an OVERLAY on top of the app's real defaults:
 * nothing in compat-data.js/compat-engine.js/imprint-alignment.js/db-core.js
 * ever gets edited by this file, and every value can be reset back to
 * exactly what shipped. Small settings-sized data (a few KB at most) - uses
 * plain localStorage + cloudPushKey, the same pattern Profile/Database use,
 * NOT big-store.js (that's for datasets that outgrew localStorage, this
 * isn't one of them).
 *
 * Load order: must come AFTER compat-data.js (needs the raw table functions
 * as a fallback) and BEFORE compat-engine.js (which calls the Effective
 * wrappers below internally - see the scoped compat-engine.js edit).
 */

const OVERRIDES_KEY = 'numerology_overrides';

function loadOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveOverrides(overrides) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  if (typeof cloudPushKey === 'function') cloudPushKey(OVERRIDES_KEY);
}

// Generic section reader - "compat", "imprintDomains", "imprintWeights",
// "betting" - each consumer (this file, imprint-alignment.js, db-core.js)
// owns the shape of its own section.
function getOverrideSection(section) {
  const all = loadOverrides();
  return all[section] || {};
}

function setOverrideSection(section, value) {
  const all = loadOverrides();
  all[section] = value;
  saveOverrides(all);
}

// Clears one key within a section (e.g. one compat cell, one domain, one
// weight) back to default - NOT the whole section.
function clearOverrideEntry(section, key) {
  const all = loadOverrides();
  if (all[section]) {
    delete all[section][key];
    if (Object.keys(all[section]).length === 0) delete all[section];
  }
  saveOverrides(all);
}

function setOverrideEntry(section, key, value) {
  const all = loadOverrides();
  if (!all[section]) all[section] = {};
  all[section][key] = value;
  saveOverrides(all);
}

/* ------------------------------------------- compat table overrides ---- */
// Keyed "entityNum-dayNum" / "entityAnimal-dayAnimal" / "entitySign-daySign" -
// direction-aware, matching how the real tables already work (row=entity,
// col=day). Falls back to the real numerologyCompat/vietnameseCompat/
// westernCompat (compat-data.js, untouched) when no override exists for
// that exact pair.
function compatOverrideKey(a, b) {
  return `${a}-${b}`;
}

function numerologyCompatEffective(entityNum, dayNum) {
  const overrides = getOverrideSection('compat').numerology || {};
  const key = compatOverrideKey(entityNum, dayNum);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return numerologyCompat(entityNum, dayNum);
}

function vietnameseCompatEffective(entityAnimal, dayAnimal) {
  const overrides = getOverrideSection('compat').vietnamese || {};
  const key = compatOverrideKey(entityAnimal, dayAnimal);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return vietnameseCompat(entityAnimal, dayAnimal);
}

function westernCompatEffective(entitySign, daySign) {
  const overrides = getOverrideSection('compat').western || {};
  const key = compatOverrideKey(entitySign, daySign);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return westernCompat(entitySign, daySign);
}

/* --------------------------------------------- compat blend overrides -- */
// Settings-tunable overlay (2026-08-07) for computeCompatibility's WEIGHTS
// parameter (compat-engine.js, COMPAT_DEFAULT_WEIGHTS) - how much
// Numerology/Vietnamese/Western each count toward the overall score, plus
// each system's own inner split (Numerology's Life Path/Day#/Day-of-Year,
// Vietnamese's Year/Month/Day animal). A partial merge, not a full-object
// replacement like the betting weight groups (db-core.js) - each of the up
// to 9 keys is independently overridable via setOverrideEntry, so editing
// one field never requires seeding the other 8 first. COMPAT_DEFAULT_
// WEIGHTS itself is defined later, in compat-engine.js - safe to reference
// here because this function's body only runs when actually CALLED (well
// after every script on the page has finished loading), never at this
// file's own load time.
function getEffectiveCompatWeights() {
  const overrides = getOverrideSection('compatWeights');
  return Object.assign({}, COMPAT_DEFAULT_WEIGHTS, overrides);
}

function setCompatOverride(table, a, b, value) {
  const compat = getOverrideSection('compat');
  if (!compat[table]) compat[table] = {};
  compat[table][compatOverrideKey(a, b)] = value;
  setOverrideSection('compat', compat);
}

function clearCompatOverride(table, a, b) {
  const compat = getOverrideSection('compat');
  if (compat[table]) {
    delete compat[table][compatOverrideKey(a, b)];
    if (Object.keys(compat[table]).length === 0) delete compat[table];
  }
  setOverrideSection('compat', compat);
}

function getCompatOverrideValue(table, a, b) {
  const overrides = getOverrideSection('compat')[table] || {};
  const key = compatOverrideKey(a, b);
  return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : null;
}

// Storage for the stores that outgrew localStorage. Must load BEFORE
// db-core.js, which routes its big load/save functions through here.
//
// Why: localStorage caps at ~5MB per origin, and the four MLB stores alone
// project to ~6.6MB across a 52-week window (measured, not estimated), which
// surfaced as an opaque QuotaExceededError partway through a backfill. Adding
// NBA on top was simply impossible. IndexedDB's quota is a share of free disk
// - hundreds of MB to ~1GB depending on the browser - so the ceiling stops
// being something to budget around.
//
// How it keeps 67 existing call sites unchanged: every one of those callers
// already reads a whole array into memory and writes a whole array back, so
// nothing is gained by making them async. Instead the whole store is read
// into an in-memory cache once at startup (the one genuinely async step, via
// initBigStore), reads are served synchronously from that cache, and writes
// update the cache synchronously then persist in the background. So
// loadMlbPredictions() and friends keep their exact signatures and behavior.

const BIG_STORE_DB = 'numerology_big_store';
const BIG_STORE_TABLE = 'kv';
const BIG_STORE_DB_VERSION = 1;

// Keys held here rather than in localStorage. Everything else (settings,
// profile, custom rosters, venues) is small and stays where it is.
const BIG_STORE_KEYS = [
  'numerology_mlb_predictions',
  'numerology_mlb_pitcher_k_signals',
  'numerology_mlb_nrfi_predictions',
  'numerology_mlb_totals_predictions',
  'numerology_ufc_predictions',
  'numerology_tennis_predictions',
  'numerology_betting_locked_slates',
  // NBA. Measured against the real record shapes over two priced seasons
  // (~2,630 games): picks 1.72MB + totals 1.30MB + player form 0.41MB +
  // birthdates 0.04MB = ~3.5MB, which on top of MLB's ~6.6MB puts the app at
  // ~10MB. That is a third of the way through a 5MB localStorage budget on its
  // own, so these belong here from the start rather than after a failed
  // backfill teaches us again.
  'numerology_nba_predictions',
  'numerology_nba_totals_predictions',
  'numerology_nba_player_form',
  'numerology_nba_birthdates',
  // Player prop signals. Measured at 109 bytes per record and ~16 records per
  // game over two seasons, this is ~42,000 records / 4.4MB on its own - by far
  // the largest single store, and the reason the IndexedDB migration had to
  // happen before props were possible at all.
  'numerology_nba_prop_signals',
];

const BIG_STORE_MIGRATED_FLAG = 'numerology_big_store_migrated';

// Raw JSON strings by key. Populated by initBigStore; the app never reads
// past it, so a failed open degrades to localStorage rather than to nothing.
const _bigStoreCache = new Map();
let _bigStoreDb = null;
let _bigStoreReady = false;
const _bigStorePending = new Map(); // key -> latest value awaiting a write
// Keys written before the DB finished opening. init must not overwrite these
// from disk (the in-memory value is newer), and must push them through once
// the DB is up - otherwise a pick recorded during that first moment would be
// silently dropped on the next load.
const _bigStoreDirty = new Set();

function bigStoreAvailable() {
  return _bigStoreReady && !!_bigStoreDb;
}

function openBigStoreDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(BIG_STORE_DB, BIG_STORE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BIG_STORE_TABLE)) db.createObjectStore(BIG_STORE_TABLE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
  });
}

function bigStoreTx(mode) {
  return _bigStoreDb.transaction(BIG_STORE_TABLE, mode).objectStore(BIG_STORE_TABLE);
}

function bigStoreGet(key) {
  return new Promise((resolve) => {
    try {
      const req = bigStoreTx('readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch (e) {
      resolve(undefined);
    }
  });
}

function bigStorePut(key, rawString) {
  return new Promise((resolve, reject) => {
    try {
      const req = bigStoreTx('readwrite').put(rawString, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('indexedDB write failed'));
    } catch (e) {
      reject(e);
    }
  });
}

// Opens the DB, copies anything still only in localStorage (one time, and a
// COPY - the localStorage originals are deliberately left in place so a
// rollback needs nothing but reverting the code), then fills the cache.
async function initBigStore() {
  try {
    _bigStoreDb = await openBigStoreDb();
  } catch (e) {
    // No IndexedDB (private mode, ancient browser): stay on localStorage.
    _bigStoreReady = false;
    return { ok: false, reason: e && e.message };
  }

  const alreadyMigrated = localStorage.getItem(BIG_STORE_MIGRATED_FLAG) === '1';
  let migrated = 0;

  for (const key of BIG_STORE_KEYS) {
    // Written while the DB was opening - that value is authoritative.
    if (_bigStoreDirty.has(key)) {
      await bigStorePut(key, _bigStoreCache.get(key)).catch(() => {});
      continue;
    }
    let raw = await bigStoreGet(key);
    if (raw === undefined && !alreadyMigrated) {
      const local = localStorage.getItem(key);
      if (local != null) {
        try {
          await bigStorePut(key, local);
          raw = local;
          migrated += 1;
        } catch (e) { /* leave it in localStorage; cache falls back below */ }
      }
    }
    if (raw === undefined) {
      const local = localStorage.getItem(key); // never migrated, or copy failed
      if (local != null) raw = local;
    }
    if (raw !== undefined) _bigStoreCache.set(key, raw);
  }

  _bigStoreReady = true;
  _bigStoreDirty.clear();
  if (!alreadyMigrated) localStorage.setItem(BIG_STORE_MIGRATED_FLAG, '1');

  // Release the localStorage copies now that IndexedDB is confirmed to hold
  // the same data. They were kept as a rollback net through the migration,
  // but leaving them pins localStorage at its ~5MB cap - which then makes
  // ordinary setting writes (bankroll, filters, the weights marker) fail.
  // Each key is only dropped after reading it back out of IndexedDB and
  // confirming it matches, so this can never delete the sole copy.
  const freed = await releaseMigratedLocalCopies();

  return { ok: true, migrated, keys: _bigStoreCache.size, freedKeys: freed };
}

async function releaseMigratedLocalCopies() {
  let freed = 0;
  for (const key of BIG_STORE_KEYS) {
    const local = localStorage.getItem(key);
    if (local == null) continue;
    const stored = await bigStoreGet(key);
    if (stored !== undefined && stored === _bigStoreCache.get(key)) {
      localStorage.removeItem(key);
      freed += 1;
    }
  }
  return freed;
}

// Synchronous read - the whole point of the cache. Returns the raw JSON
// string, or null, matching localStorage.getItem's contract so the callers in
// db-core.js keep their existing shape.
function bigStoreGetItem(key) {
  if (_bigStoreCache.has(key)) return _bigStoreCache.get(key);
  // Only fall back to localStorage before the one-time copy has happened.
  // Afterwards that copy is a frozen snapshot from migration day, and serving
  // it to a caller that then saves would overwrite everything added since -
  // so once migrated, an unready cache reports empty rather than stale. Every
  // page gates its first read on bigStoreReadyPromise, so this is a guard
  // against a mistake, not a path that should normally be taken.
  if (localStorage.getItem(BIG_STORE_MIGRATED_FLAG) === '1') return null;
  return localStorage.getItem(key);
}

// Synchronous write to the cache plus a background persist. Throws only for
// genuinely unrecoverable problems; a failed IndexedDB write falls back to
// localStorage so data is never silently dropped.
function bigStoreSetItem(key, rawString) {
  _bigStoreCache.set(key, rawString);

  if (!bigStoreAvailable()) {
    // DB not open yet (or unavailable). Mark it authoritative, mirror to
    // localStorage so an immediate tab close still keeps it, and push it into
    // IndexedDB the moment the DB is ready.
    _bigStoreDirty.add(key);
    try { localStorage.setItem(key, rawString); } catch (e) { /* quota: cache still holds it */ }
    if (typeof bigStoreReadyPromise !== 'undefined') {
      bigStoreReadyPromise.then(() => {
        if (bigStoreAvailable() && _bigStoreCache.get(key) === rawString) bigStorePut(key, rawString).catch(() => {});
      });
    }
    return;
  }

  _bigStorePending.set(key, rawString);
  bigStorePut(key, rawString)
    .then(() => {
      if (_bigStorePending.get(key) === rawString) _bigStorePending.delete(key);
    })
    .catch(() => {
      // Keep it pending so flushBigStore retries, and mirror to localStorage
      // as a last resort (which may itself fail on quota - that's fine, the
      // cache still holds the value for this session).
      try { localStorage.setItem(key, rawString); } catch (e) { /* out of room */ }
    });
}

// Writes anything still in flight. Called on page-hide so closing the tab
// immediately after a save can't lose it.
async function flushBigStore() {
  if (!bigStoreAvailable() || !_bigStorePending.size) return;
  const entries = [..._bigStorePending.entries()];
  await Promise.all(entries.map(([key, value]) => bigStorePut(key, value).catch(() => {})));
  entries.forEach(([key, value]) => {
    if (_bigStorePending.get(key) === value) _bigStorePending.delete(key);
  });
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pagehide', () => { flushBigStore(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushBigStore();
  });
}

// Bytes held in IndexedDB, for the storage readout on the Stats page.
function bigStoreBytes() {
  let bytes = 0;
  _bigStoreCache.forEach((v, k) => { bytes += k.length + (v || '').length; });
  return bytes;
}

function bigStoreKeyBytes(key) {
  const v = _bigStoreCache.has(key) ? _bigStoreCache.get(key) : localStorage.getItem(key);
  return (v || '').length;
}

// Kicked off the moment this file loads, so the DB is usually open before any
// page script runs. Pages gate their first render on it.
const bigStoreReadyPromise = initBigStore();

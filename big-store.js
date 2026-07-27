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
//
// Eager keys are read at startup, before any page paints, because essentially
// every page reads at least one of them immediately.
const BIG_STORE_EAGER_KEYS = [
  'numerology_mlb_predictions',
  'numerology_mlb_pitcher_k_signals',
  // numerology_mlb_nrfi_predictions and numerology_mlb_totals_predictions were
  // dropped with the MLB pitcher-duel markets. Deliberately NOT deleted from
  // IndexedDB - unregistering just stops the app reading or writing them, so
  // reverting that removal brings the records back with it.
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
];

// Lazy keys are read only when something actually asks for them, via
// ensureBigStoreKey(). Player prop signals measure 109 bytes per record and
// ~16 records per game over two seasons - ~42,000 records / 4.4MB, by far the
// largest store in the app. Exactly two screens read it (the Stats prop tables
// and its own backfill), but hydrating it at startup put that 4.4MB read on
// the critical path of every page, including the betting page that never
// touches it.
const BIG_STORE_LAZY_KEYS = [
  'numerology_nba_prop_signals',
];

// The full set, for the callers that only ask "does this key live here?" -
// saveJsonGuarded's routing and the backup file's read/write paths.
const BIG_STORE_KEYS = [...BIG_STORE_EAGER_KEYS, ...BIG_STORE_LAZY_KEYS];

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

// Keys whose value has actually been read out of storage. This is what makes
// "no data" distinguishable from "not loaded yet": a key absent from here has
// an unknown value, not an empty one.
const _bigStoreHydrated = new Set();
// Lazy keys currently being read, so ten callers asking at once share one read.
const _bigStoreHydrating = new Map();
// Keys whose read genuinely FAILED. Reading or writing these is refused rather
// than answered with an empty array - see bigStoreGetItem/bigStoreSetItem.
const _bigStoreFailedKeys = new Set();

// What the pages show the user. 'loading' until init settles, then 'ready',
// 'degraded' (DB opened but one or more keys would not read), or 'unavailable'
// (no IndexedDB at all - the app falls back to localStorage).
let _bigStoreState = 'loading';
let _bigStoreStateReason = null;

function bigStoreAvailable() {
  return _bigStoreReady && !!_bigStoreDb;
}

function bigStoreStatus() {
  return {
    state: _bigStoreState,
    reason: _bigStoreStateReason,
    failedKeys: [..._bigStoreFailedKeys],
  };
}

function bigStoreKeyHydrated(key) {
  return _bigStoreHydrated.has(key);
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

// Rejects on a failed read rather than resolving undefined. The old version
// collapsed "this key is not stored" and "this read did not work" into the same
// answer, and since the caller treats undefined as "no data", a transient
// failure rendered a confident empty page with nothing in the console. Every
// caller must now decide which case it is looking at.
function bigStoreGet(key) {
  return new Promise((resolve, reject) => {
    try {
      const req = bigStoreTx('readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error(`indexedDB read failed for ${key}`));
    } catch (e) {
      reject(e);
    }
  });
}

// A read can fail transiently - most plausibly while another tab commits a
// multi-megabyte backfill checkpoint - so a single failure is retried before
// the key is declared unreadable.
async function bigStoreGetRetrying(key, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return { ok: true, value: await bigStoreGet(key) };
    } catch (e) {
      lastError = e;
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
    }
  }
  console.error(`[big-store] could not read ${key}`, lastError);
  return { ok: false, error: lastError };
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
    _bigStoreState = 'unavailable';
    _bigStoreStateReason = e && e.message;
    return { ok: false, reason: e && e.message };
  }

  const alreadyMigrated = localStorage.getItem(BIG_STORE_MIGRATED_FLAG) === '1';

  // In parallel, not one at a time. Sequentially, every page waited on the SUM
  // of all these reads before its first paint, so the slowest store set the
  // floor for screens that never read it.
  const results = await Promise.all(
    BIG_STORE_EAGER_KEYS.map((key) => hydrateBigStoreKey(key, alreadyMigrated)),
  );
  const migrated = results.reduce((n, r) => n + (r.migrated || 0), 0);

  _bigStoreReady = true;
  _bigStoreDirty.clear();

  const failed = [..._bigStoreFailedKeys];
  if (failed.length) {
    // Deliberately do NOT set the migrated flag or release anything: a key that
    // would not read still needs its localStorage copy, and setting the flag is
    // what makes bigStoreGetItem answer null instead of falling back.
    _bigStoreState = 'degraded';
    _bigStoreStateReason = `${failed.length} store${failed.length === 1 ? '' : 's'} could not be read`;
    return { ok: false, degraded: true, failedKeys: failed, keys: _bigStoreCache.size };
  }

  if (!alreadyMigrated) localStorage.setItem(BIG_STORE_MIGRATED_FLAG, '1');

  // Release the localStorage copies now that IndexedDB is confirmed to hold
  // the same data. They were kept as a rollback net through the migration,
  // but leaving them pins localStorage at its ~5MB cap - which then makes
  // ordinary setting writes (bankroll, filters, the weights marker) fail.
  // Each key is only dropped after reading it back out of IndexedDB and
  // confirming it matches, so this can never delete the sole copy.
  const freed = await releaseMigratedLocalCopies();

  _bigStoreState = 'ready';
  return { ok: true, migrated, keys: _bigStoreCache.size, freedKeys: freed };
}

// Reads one key into the cache. Shared by startup and the lazy path so both
// handle the migration copy, the localStorage fallback and read failure the
// same way.
async function hydrateBigStoreKey(key, alreadyMigrated) {
  // Written while the DB was opening - that value is authoritative, and must
  // not be overwritten from disk.
  if (_bigStoreDirty.has(key)) {
    await bigStorePut(key, _bigStoreCache.get(key)).catch(() => {});
    _bigStoreDirty.delete(key);
    _bigStoreHydrated.add(key);
    return { migrated: 0 };
  }

  const read = await bigStoreGetRetrying(key);
  if (!read.ok) {
    // The key is left OUT of the cache and marked failed. It is not hydrated,
    // so reads refuse and writes refuse - which is the whole point, because
    // answering "empty" here is what silently wiped a store's worth of work.
    _bigStoreFailedKeys.add(key);
    return { migrated: 0, failed: true };
  }

  let raw = read.value;
  let migrated = 0;
  if (raw === undefined && !alreadyMigrated) {
    const local = localStorage.getItem(key);
    if (local != null) {
      try {
        await bigStorePut(key, local);
        raw = local;
        migrated = 1;
      } catch (e) { /* leave it in localStorage; cache falls back below */ }
    }
  }
  if (raw === undefined) {
    const local = localStorage.getItem(key); // never migrated, or copy failed
    if (local != null) raw = local;
  }
  if (raw !== undefined) _bigStoreCache.set(key, raw);
  _bigStoreHydrated.add(key);
  return { migrated };
}

// Reads a lazy key on first use. Safe to call repeatedly and concurrently -
// callers share the one in-flight read. Resolves true when the key is usable.
function ensureBigStoreKey(key) {
  if (_bigStoreHydrated.has(key)) return Promise.resolve(true);
  if (_bigStoreHydrating.has(key)) return _bigStoreHydrating.get(key);

  const run = bigStoreReadyPromise
    .then(async () => {
      if (_bigStoreHydrated.has(key)) return true;
      if (!bigStoreAvailable()) {
        // No IndexedDB at all. Serve whatever localStorage has, matching how
        // the eager keys degrade, so the caller still gets a real answer.
        const local = localStorage.getItem(key);
        if (local != null) _bigStoreCache.set(key, local);
        _bigStoreHydrated.add(key);
        return true;
      }
      const res = await hydrateBigStoreKey(key, localStorage.getItem(BIG_STORE_MIGRATED_FLAG) === '1');
      return !res.failed;
    })
    .catch(() => false)
    .then((ok) => {
      _bigStoreHydrating.delete(key);
      return ok;
    });

  _bigStoreHydrating.set(key, run);
  return run;
}

async function releaseMigratedLocalCopies() {
  let freed = 0;
  for (const key of BIG_STORE_KEYS) {
    const local = localStorage.getItem(key);
    if (local == null) continue;
    // An unhydrated lazy key has no cached value to compare, so it is checked
    // straight against localStorage - freeing the copy must never require
    // pulling 4.4MB into memory just to prove it is redundant.
    const reference = _bigStoreHydrated.has(key) ? _bigStoreCache.get(key) : local;
    if (reference === undefined) continue;
    const read = await bigStoreGetRetrying(key);
    if (!read.ok) continue; // could not verify: keep the copy
    if (read.value !== undefined && read.value === reference) {
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
  // A key whose read failed has an UNKNOWN value. Returning null would let the
  // caller parse it as an empty array and paint a page that says "no data" -
  // the exact failure this guard exists to stop.
  if (_bigStoreFailedKeys.has(key)) {
    throw new Error(`${key} could not be read from storage. Reload the page - do not save over it.`);
  }
  // Same for a lazy key nobody has loaded yet: the answer is not "empty", it is
  // "not asked for yet". Callers must await ensureBigStoreKey(key) first.
  if (BIG_STORE_LAZY_KEYS.includes(key) && !_bigStoreHydrated.has(key)) {
    throw new Error(`${key} has not been loaded yet - await ensureBigStoreKey('${key}') before reading it.`);
  }
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
  // Refuse to write over a store we could not read. Callers build their new
  // value by loading the old one and appending, so if the load came back empty
  // because of a failed read, this write is a truncation - the single most
  // destructive thing this file can do. Fail loudly instead.
  if (_bigStoreFailedKeys.has(key)) {
    throw new Error(`${key} could not be read from storage, so saving now would replace it with a partial copy. Reload the page and try again.`);
  }
  if (BIG_STORE_LAZY_KEYS.includes(key) && !_bigStoreHydrated.has(key)) {
    throw new Error(`${key} has not been loaded yet - await ensureBigStoreKey('${key}') before saving, or this write would replace the stored data with a partial copy.`);
  }

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

/* ---------- Status banner ---------- */
// Wired here rather than per page so every screen that loads this file reports
// the same thing. Before this, a store that failed to load looked exactly like
// a store with nothing in it: no console error, no banner, just an empty page
// that invited a fresh backfill over data that was fine.

function bigStoreBanner(text, tone) {
  const existing = document.getElementById('bigStoreBanner');
  const el = existing || document.createElement('div');
  el.id = 'bigStoreBanner';
  el.textContent = text;
  el.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'padding:10px 14px', 'font:14px/1.4 system-ui,sans-serif',
    'text-align:center', 'color:#fff',
    `background:${tone === 'error' ? '#b3261e' : '#444'}`,
  ].join(';');
  if (!existing && document.body) document.body.appendChild(el);
  return el;
}

function bigStoreClearBanner() {
  const el = document.getElementById('bigStoreBanner');
  if (el) el.remove();
}

(function wireBigStoreBanner() {
  if (typeof document === 'undefined') return;

  const onBody = (fn) => {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

  // Only announce a slow load if it is actually slow - a normal open resolves
  // in well under this and the user never sees a flash.
  let settled = false;
  setTimeout(() => {
    if (settled) return;
    onBody(() => { if (!settled) bigStoreBanner('Loading saved data…', 'info'); });
  }, 600);

  bigStoreReadyPromise.then((res) => {
    settled = true;
    onBody(() => {
      if (res && res.ok) { bigStoreClearBanner(); return; }
      if (res && res.degraded) {
        bigStoreBanner(
          `Saved data could not be loaded (${res.failedKeys.join(', ')}). Your data is still on disk - reload the page. Do not run a backfill until this clears.`,
          'error',
        );
        return;
      }
      // No IndexedDB at all: the app still works off localStorage, so this is a
      // warning about capacity rather than a data-loss risk.
      bigStoreBanner('Large-storage is unavailable in this browser, so saved history may be incomplete.', 'error');
    });
  });
}());

// Backup for the betting/prediction data. Everything the tracker builds -
// a year of backfill, every locked receipt - lives only in this browser's
// localStorage (deliberately: see the CLOUD_SYNC_FIELDS comment in
// db-core.js about the Firestore size limit that once wiped it). That makes
// clearing site data or losing the phone a total loss, so this file provides
// the two ways back: a downloadable file you control, and an opt-in cloud
// copy that is never restored automatically.

const BETTING_BACKUP_KEYS = [
  MLB_PREDICTIONS_KEY,
  MLB_PITCHER_K_SIGNALS_KEY,
  MLB_BACKFILL_STATE_KEY,
  NBA_PREDICTIONS_KEY,
  NBA_TOTALS_PREDICTIONS_KEY,
  // The form store is not just a cache: a rebuild means re-walking two seasons
  // of boxscores, and without it a live slate cannot be scored at all (the
  // expected-minutes weighting has nothing to weight by). It belongs in the
  // backup for the same reason the picks do.
  NBA_PLAYER_FORM_KEY,
  NBA_BIRTHDATES_KEY,
  NBA_BACKFILL_STATE_KEY,
  NBA_PROP_SIGNALS_KEY,
  NBA_PROP_BACKFILL_STATE_KEY,
  UFC_PREDICTIONS_KEY,
  TENNIS_PREDICTIONS_KEY,
  BETTING_LOCKED_SLATES_KEY,
  BETTING_BANKROLL_KEY,
  BETTING_SIM_START_KEY,
  BETTING_MODE_KEY,
  BETTING_MIXED_TYPES_KEY,
  BETTING_MARKETS_KEY,
  BETTING_DAY_FILTER_KEY,
  BETTING_KELLY_KEY,
];

const BETTING_BACKUP_VERSION = 1;

// The lazy stores are not read at startup, so a backup has to pull them in
// first. Without this a backup would silently omit the largest store in the
// app - and silently omitting data from a backup is the worst possible way to
// find out about it.
function ensureBackupStoresLoaded() {
  return Promise.all(
    BETTING_BACKUP_KEYS
      .filter((key) => BIG_STORE_LAZY_KEYS.includes(key))
      .map((key) => ensureBigStoreKey(key)),
  );
}

async function buildBettingBackup() {
  await ensureBackupStoresLoaded();
  const data = {};
  BETTING_BACKUP_KEYS.forEach((key) => {
    // bigStoreGetItem transparently covers both homes, so a backup captures
    // the IndexedDB stores and the localStorage settings alike.
    const raw = BIG_STORE_KEYS.includes(key) ? bigStoreGetItem(key) : localStorage.getItem(key);
    if (raw != null) data[key] = raw; // stored as raw strings - no reparse, no reshape
  });
  return { version: BETTING_BACKUP_VERSION, createdAt: new Date().toISOString(), data };
}

// Human-readable summary so a restore can be sanity-checked before it lands.
function summarizeBettingBackup(backup) {
  // Most stores are arrays of records, but the NBA form and birthdate caches
  // are keyed objects - counting only arrays would report those as 0 and make
  // a perfectly good backup look half empty.
  const count = (key) => {
    try {
      const v = JSON.parse(backup.data[key] || '[]');
      if (Array.isArray(v)) return v.length;
      if (v && typeof v === 'object') return Object.keys(v).length;
      return 0;
    } catch (e) {
      return 0;
    }
  };
  return {
    createdAt: backup.createdAt,
    mlbGames: count(MLB_PREDICTIONS_KEY),
    kSignals: count(MLB_PITCHER_K_SIGNALS_KEY),
    nbaGames: count(NBA_PREDICTIONS_KEY),
    nbaTotals: count(NBA_TOTALS_PREDICTIONS_KEY),
    nbaPlayers: count(NBA_PLAYER_FORM_KEY),
    ufc: count(UFC_PREDICTIONS_KEY),
    tennis: count(TENNIS_PREDICTIONS_KEY),
    lockedSlates: count(BETTING_LOCKED_SLATES_KEY),
  };
}

async function downloadBettingBackup() {
  const backup = await buildBettingBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `numerology-betting-backup-${bettingLocalDateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return summarizeBettingBackup(backup);
}

// Restores every key present in the file. Keys absent from the backup are
// left alone rather than cleared, so an older backup can't silently wipe a
// store it predates.
async function restoreBettingBackup(backup) {
  if (!backup || typeof backup !== 'object' || !backup.data) throw new Error('not a backup file');
  // A lazy store has to be loaded before it can be written, even though a
  // restore replaces it wholesale - the write guard cannot tell the two apart.
  await ensureBackupStoresLoaded();
  let restored = 0;
  const failed = [];
  Object.keys(backup.data).forEach((key) => {
    if (!BETTING_BACKUP_KEYS.includes(key)) return; // ignore unknown keys
    try {
      // Routed through the big store so the large prediction stores land in
      // IndexedDB, not into a localStorage key the app no longer reads.
      if (BIG_STORE_KEYS.includes(key)) bigStoreSetItem(key, backup.data[key]);
      else localStorage.setItem(key, backup.data[key]);
      restored += 1;
    } catch (e) {
      // A store that refuses the write (unreadable, so writing would truncate
      // it) must not abort the whole restore and leave it half applied. Collect
      // the failures and report them instead of throwing from the middle.
      failed.push(key);
    }
  });

  // The restored picks carry whatever composite scores they had when the backup
  // was taken, but the weights-version marker lives in localStorage and is NOT
  // part of the backup - so it still reads "current" and the rescore would skip
  // them, leaving old-weighted scores in place for good. Clearing it forces the
  // rescore to re-run against the data that just landed.
  localStorage.removeItem(MLB_WEIGHTS_VERSION_KEY);

  return { restored, failed };
}

/* ===================== Cloud backup (opt-in, manual both ways) ===================== */
// Split across several documents so no single one approaches Firestore's ~1MB
// cap - the exact failure that made the old auto-sync freeze at a stale
// snapshot and then overwrite good local data. Nothing here runs
// automatically: you press Back Up, and you press Restore.

const BETTING_CLOUD_CHUNK_BYTES = 400000;

function bettingCloudDoc() {
  if (typeof firebase === 'undefined') throw new Error('Sign in first (cloud SDK not loaded yet)');
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Sign in first');
  return firebase.firestore().collection('users').doc(user.uid).collection('bettingBackup');
}

async function cloudBackupBetting() {
  const json = JSON.stringify(await buildBettingBackup());
  const chunks = [];
  for (let i = 0; i < json.length; i += BETTING_CLOUD_CHUNK_BYTES) {
    chunks.push(json.slice(i, i + BETTING_CLOUD_CHUNK_BYTES));
  }
  const col = bettingCloudDoc();
  // Write the parts first, then the manifest - a half-written backup is
  // never pointed at, so an interrupted run can't corrupt the last good one.
  await Promise.all(chunks.map((chunk, i) => col.doc(`part${i}`).set({ chunk })));
  await col.doc('manifest').set({
    version: BETTING_BACKUP_VERSION,
    parts: chunks.length,
    createdAt: new Date().toISOString(),
    bytes: json.length,
  });
  return { parts: chunks.length, bytes: json.length };
}

async function cloudRestoreBetting() {
  const col = bettingCloudDoc();
  const manifest = await col.doc('manifest').get();
  if (!manifest.exists) throw new Error('no cloud backup found');
  const { parts } = manifest.data();
  const docs = await Promise.all(
    Array.from({ length: parts }, (_, i) => col.doc(`part${i}`).get()),
  );
  const json = docs.map((d) => (d.exists ? d.data().chunk : '')).join('');
  const backup = JSON.parse(json);
  const res = await restoreBettingBackup(backup);
  return { restored: res.restored, failed: res.failed, summary: summarizeBettingBackup(backup) };
}

// Bet Log page controller. Rendering lives in betting-render.js (shared with
// betting.html); the result check reuses the same sport checkers the Betting
// page runs, so a locked slate settles here without visiting any other page.

async function refreshBetLogAndRender() {
  renderBettingLog(); // instant paint from stored data while results check
  await Promise.allSettled([
    checkResults(),
    checkTennisResults(),
    checkMlbResults(),
    checkNbaResults(),
    checkNbaTotalsResults(),
  ]);
  document.getElementById('betLogLastUpdated').textContent = `Results checked ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  renderBettingLog();
}

// Expanding a locked slate's tickets - delegated so pagination re-renders
// don't need rewiring.
document.getElementById('bettingLog').addEventListener('click', (e) => {
  const head = e.target.closest('.bet-log-head');
  if (!head) return;
  const body = head.nextElementSibling;
  if (body && body.classList.contains('bet-log-body')) {
    body.style.display = body.style.display === 'none' ? '' : 'none';
  }
});

/* ===================== Backup & restore ===================== */

const betLogBackupStatus = document.getElementById('bettingBackupStatus');

function betLogSummaryText(s) {
  return `${s.mlbGames} MLB games, ${s.kSignals} K-signals, ${s.ufc} UFC, ${s.tennis} tennis, ${s.lockedSlates} locked slates`;
}

document.getElementById('bettingBackupDownloadBtn').addEventListener('click', async () => {
  try {
    const summary = await downloadBettingBackup();
    betLogBackupStatus.textContent = `Downloaded - ${betLogSummaryText(summary)}.`;
  } catch (e) {
    // Says which store refused rather than a flat "could not build" - a backup
    // that fails because a store would not load is worth reading in full.
    betLogBackupStatus.textContent = `Could not build the backup file: ${e.message}`;
  }
});

document.getElementById('bettingBackupRestoreBtn').addEventListener('click', () => {
  document.getElementById('bettingBackupFile').click();
});

document.getElementById('bettingBackupFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const summary = summarizeBettingBackup(backup);
    // Restoring replaces stores wholesale, so it asks first and says exactly
    // what is about to land.
    if (!confirm(`Restore this backup?\n\nFrom ${summary.createdAt}\n${betLogSummaryText(summary)}\n\nThis replaces the matching data in this browser.`)) {
      betLogBackupStatus.textContent = 'Restore cancelled.';
      return;
    }
    const res = await restoreBettingBackup(backup);
    if (res.failed.length) {
      // A partly-applied restore must never read as a clean one.
      betLogBackupStatus.textContent = `Restored ${res.restored} stores, but ${res.failed.length} could not be written (${res.failed.join(', ')}). Reload and try again before relying on this data.`;
      return;
    }
    betLogBackupStatus.textContent = `Restored ${res.restored} stores - ${betLogSummaryText(summary)}. Reloading…`;
    setTimeout(() => window.location.reload(), 900);
  } catch (err) {
    betLogBackupStatus.textContent = `Restore failed: ${err.message}`;
  } finally {
    e.target.value = ''; // let the same file be picked again
  }
});

document.getElementById('bettingCloudBackupBtn').addEventListener('click', async () => {
  const btn = document.getElementById('bettingCloudBackupBtn');
  btn.disabled = true;
  betLogBackupStatus.textContent = 'Backing up to cloud…';
  try {
    const res = await cloudBackupBetting();
    betLogBackupStatus.textContent = `Cloud backup saved - ${Math.round(res.bytes / 1024)} KB across ${res.parts} part${res.parts === 1 ? '' : 's'}.`;
  } catch (err) {
    betLogBackupStatus.textContent = `Cloud backup failed: ${err.message}`;
  }
  btn.disabled = false;
});

document.getElementById('bettingCloudRestoreBtn').addEventListener('click', async () => {
  const btn = document.getElementById('bettingCloudRestoreBtn');
  btn.disabled = true;
  betLogBackupStatus.textContent = 'Fetching cloud backup…';
  try {
    const col = bettingCloudDoc();
    const manifest = await col.doc('manifest').get();
    if (!manifest.exists) throw new Error('no cloud backup found');
    if (!confirm(`Restore the cloud backup from ${manifest.data().createdAt}?\n\nThis replaces the matching data in this browser.`)) {
      betLogBackupStatus.textContent = 'Restore cancelled.';
      btn.disabled = false;
      return;
    }
    const res = await cloudRestoreBetting();
    if (res.failed.length) {
      betLogBackupStatus.textContent = `Restored ${res.restored} stores, but ${res.failed.length} could not be written (${res.failed.join(', ')}). Reload and try again before relying on this data.`;
      btn.disabled = false;
      return;
    }
    betLogBackupStatus.textContent = `Restored ${res.restored} stores - ${betLogSummaryText(res.summary)}. Reloading…`;
    setTimeout(() => window.location.reload(), 900);
  } catch (err) {
    betLogBackupStatus.textContent = `Cloud restore failed: ${err.message}`;
  }
  btn.disabled = false;
});

document.getElementById('betLogRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('betLogRefreshBtn');
  btn.disabled = true;
  try {
    await refreshBetLogAndRender();
  } finally {
    btn.disabled = false;
  }
});

bigStoreReadyPromise.then(refreshBetLogAndRender);

// Bet Log page controller. Rendering lives in betting-render.js (shared with
// betting.html); the result check reuses the same sport checkers the Betting
// page runs, so a locked slate settles here without visiting any other page.

async function refreshBetLogAndRender() {
  renderBettingLog(); // instant paint from stored data while results check
  await Promise.allSettled([
    checkResults(),
    checkTennisResults(),
    checkMlbResults(),
    checkMlbDuelResults(),
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

document.getElementById('betLogRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('betLogRefreshBtn');
  btn.disabled = true;
  try {
    await refreshBetLogAndRender();
  } finally {
    btn.disabled = false;
  }
});

refreshBetLogAndRender();

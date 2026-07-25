// Betting page controller - wires betting.html to the engine in
// betting-core.js and renders today's slate plus the simulated ledger.
// Result-checking reuses checkResults()/checkTennisResults()/checkMlbResults()
// from the stats-* files (loaded on this page with their Stats-DOM wiring
// guarded off), so a game settles here exactly when it settles on Stats.

let currentBettingScope = null;
let currentBettingSim = null;

const BETTING_SCOPE_META = {
  all: { label: 'All Sports', icon: '🌐' },
  mlb: { label: 'MLB', icon: '⚾' },
  tennis: { label: 'Tennis', icon: '🎾' },
  ufc: { label: 'UFC', icon: '🥊' },
};

/* ===================== Formatting ===================== */

function bettingFmtMoney(v) {
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
}

function bettingFmtSignedMoney(v) {
  return v > 0 ? `+$${v.toFixed(2)}` : bettingFmtMoney(v);
}

function bettingFmtCents(price) {
  return `${Math.round(price * 100)}¢`;
}

function bettingFmtDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const BETTING_STATUS_META = {
  won: { label: 'Won', icon: '✅', cls: 'won' },
  lost: { label: 'Lost', icon: '❌', cls: 'lost' },
  pending: { label: 'Pending', icon: '🕒', cls: 'pending' },
  void: { label: 'Void', icon: '↩️', cls: 'void' },
};

/* ===================== Ticket cards ===================== */

function bettingLegHtml(leg) {
  const legStatus = !leg.resolved ? '🕒' : leg.draw ? '↩️' : leg.won ? '✅' : '❌';
  const pct = Math.round(leg.estProb * 100);
  return `
    <div class="bet-leg">
      <span class="bet-leg-status">${legStatus}</span>
      <span class="bet-leg-main">${BETTING_SPORTS[leg.sport].icon} ${escapeHtml(leg.matchup)} &rarr; <strong>${escapeHtml(leg.pickName)}</strong></span>
      <span class="bet-leg-nums">@ ${bettingFmtCents(leg.price)} &middot; est <span class="score-inline ${winRateClass(pct)}">${pct}%</span></span>
    </div>`;
}

function bettingTicketHtml(ticket, comboIndex) {
  const meta = BETTING_STATUS_META[ticket.status];
  const payout = ticket.stake / ticket.prodPrice;
  const title = ticket.legs.length === 1
    ? `${BETTING_SPORTS[ticket.legs[0].sport].icon} Single`
    : ticket.headline ? `⭐ Top ${ticket.legs.length}-Leg Parlay` : `🔀 Combo ${comboIndex}`;
  const resultLine = ticket.status === 'won'
    ? `Returned ${bettingFmtMoney(payout)} (<span class="score-inline good">${bettingFmtSignedMoney(ticket.profit)}</span>)`
    : ticket.status === 'lost'
      ? `<span class="score-inline bad">${bettingFmtSignedMoney(ticket.profit)}</span>`
      : ticket.status === 'void'
        ? 'Stake returned'
        : `Pays ${bettingFmtMoney(payout)} (${(1 / ticket.prodPrice).toFixed(2)}x)`;
  return `
    <div class="bet-ticket${ticket.headline ? ' headline' : ''}">
      <div class="bet-ticket-head">
        <span class="bet-ticket-title">${title}</span>
        <span class="bet-ticket-status ${meta.cls}">${meta.icon} ${meta.label}</span>
      </div>
      ${ticket.legs.map(bettingLegHtml).join('')}
      <div class="bet-ticket-foot">
        <span>Stake: <strong>${bettingFmtMoney(ticket.stake)}</strong></span>
        <span>${resultLine}</span>
      </div>
    </div>`;
}

function bettingTicketsHtml(tickets) {
  let comboN = 0;
  return tickets.map((t) => bettingTicketHtml(t, (!t.headline && t.legs.length > 1) ? ++comboN : 0)).join('');
}

/* ===================== Today's Bets ===================== */

function renderBettingToday(slate) {
  const el = document.getElementById('bettingTodayContent');

  if (!slate.totalTodayPicks) {
    el.innerHTML = '<div class="empty-state">No games tracked for today yet &mdash; open the Polymarket trackers to pull today\'s slate first.</div>';
    return;
  }
  if (!slate.tickets.length) {
    const msg = slate.notEnoughLegs
      ? `Only ${slate.qualifiedCount} pick${slate.qualifiedCount === 1 ? '' : 's'} met the betting bar today &mdash; a ${slate.legCount}-leg parlay needs at least ${slate.legCount}.`
      : slate.qualifiedCount === 0
        ? `${slate.totalTodayPicks} pick${slate.totalTodayPicks === 1 ? '' : 's'} tracked today &mdash; none met the betting bar (a pick needs a proven bucket history plus a real edge over its price).`
        : 'Stakes rounded to zero &mdash; bankroll too small for today\'s edges.';
    el.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  const totalStake = slate.tickets.reduce((s, t) => s + t.stake, 0);
  const totalPayout = slate.tickets.reduce((s, t) => s + t.stake / t.prodPrice, 0);
  el.innerHTML = `
    <div class="bet-day-summary">Total staked: <strong>${bettingFmtMoney(totalStake)}</strong> &middot; If everything hits: <strong>${bettingFmtMoney(totalPayout)}</strong> &middot; ${slate.qualifiedCount} qualifying pick${slate.qualifiedCount === 1 ? '' : 's'}</div>
    ${bettingTicketsHtml(slate.tickets)}`;
}

/* ===================== Simulation summary + ledger ===================== */

function renderBettingSummary(sim) {
  const hero = document.getElementById('bettingSummaryHero');

  if (!sim.dayCount) {
    hero.innerHTML = `
      <div class="score-names">Simulated Bankroll</div>
      <div class="empty-state">No simulated bets yet &mdash; an edge tier needs ${BETTING_MIN_TIER_SAMPLE}+ resolved picks before the engine places its first bet. Backfill more history on the Stats page.</div>`;
    return;
  }

  const delta = Math.round((sim.finalBankroll - sim.startBankroll) * 100) / 100;
  const cls = delta > 0 ? 'good' : delta < 0 ? 'bad' : 'mid';
  const roi = sim.totals.staked > 0 ? Math.round((sim.totals.profit / sim.totals.staked) * 100) : 0;
  const bits = [`${sim.totals.won}W-${sim.totals.lost}L`];
  if (sim.totals.pending) bits.push(`${sim.totals.pending} pending`);
  if (sim.totals.voided) bits.push(`${sim.totals.voided} void`);
  bits.push(sim.maxDrawdown > 0
    ? `Max drawdown <span class="score-inline bad">-${bettingFmtMoney(sim.maxDrawdown)} (${sim.maxDrawdownPct}%)</span>`
    : 'Max drawdown none');

  hero.innerHTML = `
    <div class="score-names">Simulated Bankroll</div>
    <div class="score-big ${cls}">${bettingFmtMoney(sim.finalBankroll)}</div>
    <div class="pm-breakdown-hint" style="text-align:center;">Started ${bettingFmtMoney(sim.startBankroll)} &middot; P/L <span class="score-inline ${cls}">${bettingFmtSignedMoney(delta)}</span> &middot; ROI ${roi}% of ${bettingFmtMoney(sim.totals.staked)} staked</div>
    <div class="pm-breakdown-hint" style="text-align:center;">Tickets: ${bits.join(' &middot; ')} &middot; ${sim.dayCount} betting day${sim.dayCount === 1 ? '' : 's'}</div>`;
}

function renderBettingLedger(sim) {
  const container = document.getElementById('bettingLedger');

  if (!sim.ledger.length) {
    container.innerHTML = '<div class="empty-state">No days qualified for a bet yet under this setting.</div>';
    renderPaginationControls('bettingLedgerPagination', 'bettingLedger', 1, 1, () => {});
    return;
  }

  const { rows, page, totalPages } = paginationSlice('bettingLedger', sim.ledger);

  const bodyRows = rows.map((day) => {
    const plCls = day.profit > 0 ? 'good' : day.profit < 0 ? 'bad' : '';
    const wins = day.tickets.filter((t) => t.status === 'won').length;
    const losses = day.tickets.filter((t) => t.status === 'lost').length;
    return `
      <tr class="bet-ledger-row">
        <td>${bettingFmtDate(day.dateKey)}${day.inProgress ? ' <span class="bet-inprogress">(in progress)</span>' : ''}</td>
        <td>${day.tickets.length} (${wins}W-${losses}L)</td>
        <td>${bettingFmtMoney(day.staked)}</td>
        <td><span class="score-inline ${plCls}">${bettingFmtSignedMoney(day.profit)}</span></td>
        <td>${bettingFmtMoney(day.bankrollAfter)}</td>
      </tr>
      <tr class="bet-ledger-detail" style="display:none;"><td colspan="5">${bettingTicketsHtml(day.tickets)}</td></tr>`;
  }).join('');

  container.innerHTML = `
    <table class="astro-table">
      <thead><tr><th>Date</th><th>Tickets</th><th>Staked</th><th>P/L</th><th>Bankroll</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  renderPaginationControls('bettingLedgerPagination', 'bettingLedger', page, totalPages, () => renderBettingLedger(currentBettingSim));
}

/* ===================== Main render + result refresh ===================== */

function renderBetting() {
  if (!currentBettingScope) return;
  const meta = BETTING_SCOPE_META[currentBettingScope];
  document.getElementById('bettingScopeTitle').textContent = `${meta.icon} ${meta.label}`;

  const bankroll = loadBettingBankroll();
  const mode = loadBettingMode();
  renderBettingToday(buildTodayBettingSlate(currentBettingScope, mode, bankroll));
  currentBettingSim = runBettingSimulation(currentBettingScope, mode, bankroll);
  renderBettingSummary(currentBettingSim);
  renderBettingLedger(currentBettingSim);
}

async function checkBettingResults(scope) {
  const jobs = [];
  if (scope === 'all' || scope === 'ufc') jobs.push(checkResults());
  if (scope === 'all' || scope === 'tennis') jobs.push(checkTennisResults());
  if (scope === 'all' || scope === 'mlb') jobs.push(checkMlbResults());
  await Promise.allSettled(jobs);
}

async function refreshBettingAndRender() {
  renderBetting(); // instant paint from stored data while results check in the background
  await checkBettingResults(currentBettingScope);
  document.getElementById('bettingLastUpdated').textContent = `Results checked ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  renderBetting();
}

/* ===================== Wiring ===================== */

document.getElementById('bettingSportPicker').addEventListener('click', (e) => {
  const card = e.target.closest('.mode-card[data-sport]');
  if (!card) return;
  e.preventDefault();
  currentBettingScope = card.dataset.sport;
  document.getElementById('bettingSportPicker').style.display = 'none';
  document.getElementById('bettingSportContent').style.display = '';
  resetPagination('bettingLedger');
  refreshBettingAndRender();
});

document.getElementById('bettingChooseSportLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('bettingSportContent').style.display = 'none';
  document.getElementById('bettingSportPicker').style.display = '';
});

// Expanding a ledger day - delegated so pagination re-renders don't need rewiring
document.getElementById('bettingLedger').addEventListener('click', (e) => {
  const row = e.target.closest('.bet-ledger-row');
  if (!row) return;
  const detail = row.nextElementSibling;
  if (detail && detail.classList.contains('bet-ledger-detail')) {
    detail.style.display = detail.style.display === 'none' ? '' : 'none';
  }
});

const bettingBankrollInputEl = document.getElementById('bettingBankrollInput');
bettingBankrollInputEl.value = loadBettingBankroll();
bettingBankrollInputEl.addEventListener('change', () => {
  const v = Number(bettingBankrollInputEl.value);
  if (Number.isFinite(v) && v > 0) saveBettingBankroll(v);
  bettingBankrollInputEl.value = loadBettingBankroll();
  renderBetting();
});

const bettingModeSelectEl = document.getElementById('bettingModeSelect');
bettingModeSelectEl.value = loadBettingMode();
bettingModeSelectEl.addEventListener('change', () => {
  saveBettingMode(bettingModeSelectEl.value);
  resetPagination('bettingLedger');
  renderBetting();
});

document.getElementById('bettingRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('bettingRefreshBtn');
  btn.disabled = true;
  try {
    await refreshBettingAndRender();
  } finally {
    btn.disabled = false;
  }
});

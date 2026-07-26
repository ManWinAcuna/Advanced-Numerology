// Betting page controller - wires betting.html to the engine in
// betting-core.js and renders today's slate plus the simulated ledger.
// Result-checking reuses checkResults()/checkTennisResults()/checkMlbResults()
// from the stats-* files (loaded on this page with their Stats-DOM wiring
// guarded off), so a game settles here exactly when it settles on Stats.

let currentBettingScope = null;
let currentBettingSim = null;
let currentTodaySlate = null;

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

// American-odds equivalent of a share price - for taking these picks to a
// sportsbook (DraftKings); Kalshi quotes in cents like Polymarket already.
function bettingAmericanOdds(price) {
  if (price <= 0 || price >= 1) return '';
  const odds = price <= 0.5
    ? Math.round((100 * (1 - price)) / price)
    : -Math.round((100 * price) / (1 - price));
  return odds > 0 ? `+${odds}` : `${odds}`;
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
  // The worst price at which this pick still clears the qualification edge -
  // the shopping limit when taking it to another book (DK/Kalshi).
  const maxPrice = leg.estProb - BETTING_MIN_EV_EDGE;
  return `
    <div class="bet-leg">
      <span class="bet-leg-status">${legStatus}</span>
      <span class="bet-leg-main">${BETTING_SPORTS[leg.sport].icon} ${escapeHtml(leg.matchup)} &rarr; <strong>${escapeHtml(leg.pickName)}</strong></span>
      <span class="bet-leg-nums">@ ${bettingFmtCents(leg.price)} (${bettingAmericanOdds(leg.price)}) &middot; est <span class="score-inline ${winRateClass(pct)}">${pct}%</span> &middot; max ${bettingFmtCents(maxPrice)} (${bettingAmericanOdds(maxPrice)})</span>
    </div>`;
}

function bettingTicketHtml(ticket, comboIndex) {
  const meta = BETTING_STATUS_META[ticket.status];
  const payout = ticket.stake / ticket.prodPrice;
  const title = ticket.legs.length === 1
    ? `${BETTING_SPORTS[ticket.legs[0].sport].icon} Single`
    : ticket.headline ? `⭐ Top ${ticket.legs.length}-Leg Parlay` : `🔀 ${ticket.legs.length}-Leg Combo ${comboIndex}`;
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
  const comboCounts = {}; // combos numbered per leg count so Mixed reads cleanly
  return tickets.map((t) => {
    if (t.headline || t.legs.length === 1) return bettingTicketHtml(t, 0);
    comboCounts[t.legs.length] = (comboCounts[t.legs.length] || 0) + 1;
    return bettingTicketHtml(t, comboCounts[t.legs.length]);
  }).join('');
}

/* ===================== Today's Bets ===================== */

function renderBettingToday(slate) {
  const el = document.getElementById('bettingTodayContent');

  if (slate.dayFiltered) {
    const personalBit = slate.todayNums.personal != null ? ` / your Personal Day ${slate.todayNums.personal}` : '';
    const compatBit = slate.todayNums.compatScore != null ? ` / your day compatibility ${slate.todayNums.compatScore}` : '';
    el.innerHTML = `<div class="empty-state">Today is Universal Day ${slate.todayNums.universal} / Day Energy ${slate.todayNums.energy}${personalBit}${compatBit} &mdash; outside your day filter, so no bets today.</div>`;
    return;
  }
  if (!slate.totalTodayPicks) {
    el.innerHTML = '<div class="empty-state">No games tracked for today yet &mdash; open the Polymarket trackers to pull today\'s slate first.</div>';
    return;
  }
  if (!slate.upcomingCount) {
    el.innerHTML = '<div class="empty-state">All of today\'s tracked games have already started &mdash; nothing left to bet. Today\'s outcome is settling in the ledger below.</div>';
    return;
  }
  if (!slate.tickets.length) {
    const msg = slate.notEnoughLegs
      ? `Only ${slate.qualifiedCount} upcoming pick${slate.qualifiedCount === 1 ? '' : 's'} met the betting bar &mdash; a ${slate.legCount}-leg parlay needs at least ${slate.legCount} games that haven't started yet.`
      : slate.qualifiedCount === 0
        ? `${slate.upcomingCount} upcoming game${slate.upcomingCount === 1 ? '' : 's'} left today &mdash; none met the betting bar (a pick needs a proven bucket history plus a real edge over its price).`
        : 'Stakes rounded to zero &mdash; bankroll too small for today\'s edges.';
    el.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  const totalStake = slate.tickets.reduce((s, t) => s + t.stake, 0);
  const totalPayout = slate.tickets.reduce((s, t) => s + t.stake / t.prodPrice, 0);
  const alreadyLocked = loadBettingLockedSlates().some((s) => s.signature === bettingSlateSignature(currentBettingScope, loadBettingMode(), bettingLocalDateKey(new Date()), slate.tickets));
  el.innerHTML = `
    <div class="bet-day-summary">Total staked: <strong>${bettingFmtMoney(totalStake)}</strong> &middot; If everything hits: <strong>${bettingFmtMoney(totalPayout)}</strong> &middot; ${slate.qualifiedCount} qualifying pick${slate.qualifiedCount === 1 ? '' : 's'}</div>
    ${bettingTicketsHtml(slate.tickets)}
    <div class="bet-lock-row">
      <button class="btn" id="bettingLockBtn" type="button"${alreadyLocked ? ' disabled' : ''}>${alreadyLocked ? '✓ Locked' : '🔒 Lock these bets'}</button>
      <span class="box-hint" style="margin-top:0;">Locking freezes this exact slate into the Bet Log permanently &mdash; do it when you're taking the bets.</span>
    </div>`;
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
  bits.push(`Peak ${bettingFmtMoney(sim.peakBankroll)}`);
  bits.push(sim.maxDrawdown > 0
    ? `Max drawdown <span class="score-inline bad">-${bettingFmtMoney(sim.maxDrawdown)} (${sim.maxDrawdownPct}%)</span>`
    : 'Max drawdown none');

  hero.innerHTML = `
    <div class="score-names">Simulated Bankroll</div>
    <div class="score-big ${cls}">${bettingFmtMoney(sim.finalBankroll)}</div>
    <div class="pm-breakdown-hint" style="text-align:center;">Started ${bettingFmtMoney(sim.startBankroll)} &middot; P/L <span class="score-inline ${cls}">${bettingFmtSignedMoney(delta)}</span> &middot; ROI ${roi}% of ${bettingFmtMoney(sim.totals.staked)} staked</div>
    <div class="pm-breakdown-hint" style="text-align:center;">Tickets: ${bits.join(' &middot; ')} &middot; ${sim.dayCount} betting day${sim.dayCount === 1 ? '' : 's'}</div>`;
}

// Bankroll curve - inline SVG line of the simulated balance across every
// betting day, peak dotted in gold, baseline dashed at the starting bankroll.
function renderBettingCurve(sim) {
  const box = document.getElementById('bettingCurveBox');
  const days = [...sim.ledger].reverse(); // ledger is newest-first; plot chronologically
  if (days.length < 2) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';

  const values = [sim.startBankroll, ...days.map((d) => d.bankrollAfter)];
  const W = 600, H = 170, padL = 8, padR = 8, padT = 16, padB = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => padL + (i / (values.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const peakIdx = values.indexOf(max);
  const endUp = values[values.length - 1] >= values[0];
  const lineColor = endUp ? 'var(--good)' : 'var(--bad)';

  document.getElementById('bettingCurve').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="${padL}" y1="${y(values[0]).toFixed(1)}" x2="${W - padR}" y2="${y(values[0]).toFixed(1)}" stroke="var(--border)" stroke-dasharray="4 4" />
      <polygon points="${x(0).toFixed(1)},${(H - padB)} ${pts} ${x(values.length - 1).toFixed(1)},${(H - padB)}" fill="${endUp ? 'rgba(139, 195, 74, 0.08)' : 'rgba(229, 57, 63, 0.08)'}" />
      <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" />
      <circle cx="${x(peakIdx).toFixed(1)}" cy="${y(values[peakIdx]).toFixed(1)}" r="3.5" fill="var(--yellow)" />
      <text x="${padL}" y="11" fill="var(--muted)" font-size="10">start ${bettingFmtMoney(sim.startBankroll)}</text>
      <text x="${W - padR}" y="11" fill="var(--yellow)" font-size="10" text-anchor="end">peak ${bettingFmtMoney(sim.peakBankroll)}</text>
      <text x="${padL}" y="${H - 5}" fill="var(--muted)" font-size="10">${days.length} betting days</text>
      <text x="${W - padR}" y="${H - 5}" fill="${lineColor}" font-size="10" text-anchor="end">now ${bettingFmtMoney(sim.finalBankroll)}</text>
    </svg>`;
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

/* ===================== Locked Bet Log ===================== */

function bettingModeLabel(mode, mixedTypes) {
  if (mode === 'singles') return 'Singles';
  if (mode === 'mixed') return `Mixed (${(mixedTypes || ['singles']).map((t) => BETTING_MIXED_TYPE_LABELS[t]).join(' + ')})`;
  return `${mode}-Leg Parlay`;
}

function renderBettingLog() {
  const summaryEl = document.getElementById('bettingLogSummary');
  const listEl = document.getElementById('bettingLog');
  const locked = loadBettingLockedSlates();

  if (!locked.length) {
    summaryEl.innerHTML = '';
    listEl.innerHTML = '<div class="empty-state">Nothing locked yet &mdash; lock a slate from Today\'s Bets when you actually take it.</div>';
    renderPaginationControls('bettingLogPagination', 'bettingLog', 1, 1, () => {});
    return;
  }

  const settled = settleLockedSlates(locked).sort((a, b) => new Date(b.lockedAt) - new Date(a.lockedAt));

  let won = 0, lost = 0, pending = 0, voided = 0, staked = 0, profit = 0;
  settled.forEach((s) => s.tickets.forEach((t) => {
    staked += t.stake;
    profit += t.profit;
    if (t.status === 'won') won += 1;
    else if (t.status === 'lost') lost += 1;
    else if (t.status === 'pending') pending += 1;
    else voided += 1;
  }));
  profit = Math.round(profit * 100) / 100;
  const plCls = profit > 0 ? 'good' : profit < 0 ? 'bad' : '';
  summaryEl.innerHTML = `<div class="bet-day-summary">Locked record: <strong>${won}W-${lost}L</strong>${pending ? ` (${pending} pending)` : ''}${voided ? ` (${voided} void)` : ''} &middot; Staked <strong>${bettingFmtMoney(staked)}</strong> &middot; P/L <span class="score-inline ${plCls}">${bettingFmtSignedMoney(profit)}</span></div>`;

  const { rows, page, totalPages } = paginationSlice('bettingLog', settled);
  listEl.innerHTML = rows.map((s) => {
    const meta = BETTING_SCOPE_META[s.scope] || { icon: '', label: s.scope };
    const timeStr = new Date(s.lockedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const right = s.inProgress
      ? `${bettingFmtMoney(s.staked)} staked &middot; pending`
      : `${bettingFmtMoney(s.staked)} staked &middot; <span class="score-inline ${s.profit > 0 ? 'good' : s.profit < 0 ? 'bad' : ''}">${bettingFmtSignedMoney(s.profit)}</span>`;
    return `
      <div class="bet-log-entry">
        <div class="bet-log-head">
          <span>${bettingFmtDate(s.dateKey)} &middot; ${meta.icon} ${meta.label} &middot; ${bettingModeLabel(s.mode, s.mixedTypes)} &middot; 🔒 ${timeStr}</span>
          <span>${right}</span>
        </div>
        <div class="bet-log-body" style="display:none;">${bettingTicketsHtml(s.tickets)}</div>
      </div>`;
  }).join('');

  renderPaginationControls('bettingLogPagination', 'bettingLog', page, totalPages, renderBettingLog);
}

/* ===================== Strategy Lab ===================== */
// Ranks strategies by replaying the full walk-forward sim for each one:
// every bet type under the current day filter, then every single day number
// under the current bet type. One picks collection feeds all runs.

function bettingLabRowHtml(row) {
  const sim = row.sim;
  if (!sim.dayCount) {
    return `
      <tr>
        <td>${row.active ? '⭐ ' : ''}${escapeHtml(row.label)}</td>
        <td colspan="5" class="bet-lab-empty">no qualifying betting days</td>
        <td>${row.applyAttr ? `<button type="button" class="btn-link" ${row.applyAttr}>use</button>` : ''}</td>
      </tr>`;
  }
  const delta = Math.round((sim.finalBankroll - sim.startBankroll) * 100) / 100;
  const plCls = delta > 0 ? 'good' : delta < 0 ? 'bad' : '';
  const roi = sim.totals.staked > 0 ? Math.round((sim.totals.profit / sim.totals.staked) * 100) : 0;
  return `
    <tr>
      <td>${row.active ? '⭐ ' : ''}${escapeHtml(row.label)}</td>
      <td>${bettingFmtMoney(sim.finalBankroll)}</td>
      <td><span class="score-inline ${plCls}">${bettingFmtSignedMoney(delta)}</span></td>
      <td>${roi}%</td>
      <td>${sim.maxDrawdown > 0 ? `-${bettingFmtMoney(sim.maxDrawdown)} (${sim.maxDrawdownPct}%)` : '&mdash;'}</td>
      <td>${sim.totals.won}W-${sim.totals.lost}L &middot; ${sim.dayCount}d</td>
      <td>${row.applyAttr ? `<button type="button" class="btn-link" ${row.applyAttr}>use</button>` : ''}</td>
    </tr>`;
}

function bettingLabTableHtml(title, rows) {
  const sorted = [...rows].sort((a, b) => {
    if (!a.sim.dayCount && !b.sim.dayCount) return 0;
    if (!a.sim.dayCount) return 1;
    if (!b.sim.dayCount) return -1;
    return b.sim.finalBankroll - a.sim.finalBankroll;
  });
  return `
    <div class="bet-lab-title">${title}</div>
    <div class="pm-table-scroll">
      <table class="astro-table">
        <thead><tr><th>Strategy</th><th>Final</th><th>P/L</th><th>ROI</th><th>Max DD</th><th>Record</th><th></th></tr></thead>
        <tbody>${sorted.map(bettingLabRowHtml).join('')}</tbody>
      </table>
    </div>`;
}

function runStrategyLab() {
  const scope = currentBettingScope;
  const start = loadBettingSimStart();
  const picks = collectBettingPicks(scope);
  const curMode = loadBettingMode();
  const curFilter = loadBettingDayFilter();
  const mixedTypes = loadBettingMixedTypes();
  const noFilter = { universal: [], energy: [], personal: [], compat: [] };
  const only = (part) => ({ ...noFilter, ...part });
  const soloActive = (list, n, others) => list.length === 1 && list[0] === n && others.every((o) => !o.length);

  const betTypeRows = ['singles', '2', '3', '4', 'mixed'].map((m) => ({
    label: bettingModeLabel(m, mixedTypes),
    applyAttr: `data-apply-mode="${m}"`,
    active: m === curMode,
    sim: runBettingSimulation(scope, m, start, curFilter, mixedTypes, picks),
  }));

  const dayRows = [];
  DAY_FILTER_UNIVERSAL_OPTIONS.forEach((n) => {
    dayRows.push({
      label: `Universal Day ${n}`,
      applyAttr: `data-apply-universal="${n}"`,
      active: soloActive(curFilter.universal, n, [curFilter.energy, curFilter.personal, curFilter.compat]),
      sim: runBettingSimulation(scope, curMode, start, only({ universal: [n] }), mixedTypes, picks),
    });
  });
  DAY_FILTER_ENERGY_OPTIONS.forEach((n) => {
    dayRows.push({
      label: `Day Energy ${n}`,
      applyAttr: `data-apply-energy="${n}"`,
      active: soloActive(curFilter.energy, n, [curFilter.universal, curFilter.personal, curFilter.compat]),
      sim: runBettingSimulation(scope, curMode, start, only({ energy: [n] }), mixedTypes, picks),
    });
  });
  if (bettingPersonalDayFor(bettingLocalDateKey(new Date())) != null) {
    BETTING_PERSONAL_DAY_OPTIONS.forEach((n) => {
      dayRows.push({
        label: `My Personal Day ${n}`,
        applyAttr: `data-apply-personal="${n}"`,
        active: soloActive(curFilter.personal, n, [curFilter.universal, curFilter.energy, curFilter.compat]),
        sim: runBettingSimulation(scope, curMode, start, only({ personal: [n] }), mixedTypes, picks),
      });
    });
    BETTING_DAY_COMPAT_BANDS.forEach((b) => {
      dayRows.push({
        label: `My Day Compat ${b.label}`,
        applyAttr: `data-apply-compat="${b.key}"`,
        active: soloActive(curFilter.compat, b.key, [curFilter.universal, curFilter.energy, curFilter.personal]),
        sim: runBettingSimulation(scope, curMode, start, only({ compat: [b.key] }), mixedTypes, picks),
      });
    });
  }
  dayRows.unshift({
    label: 'Every day (no filter)',
    applyAttr: 'data-apply-universal="0"',
    active: !curFilter.universal.length && !curFilter.energy.length && !curFilter.personal.length && !curFilter.compat.length,
    sim: runBettingSimulation(scope, curMode, start, noFilter, mixedTypes, picks),
  });

  document.getElementById('bettingLabResults').innerHTML =
    bettingLabTableHtml(`Bet types &middot; ${BETTING_SCOPE_META[scope].label}, current day filter`, betTypeRows)
    + bettingLabTableHtml(`Day numbers &middot; ${BETTING_SCOPE_META[scope].label}, ${bettingModeLabel(curMode, mixedTypes)}`, dayRows);

  const details = document.getElementById('bettingLabDetails');
  details.style.display = '';
  details.open = true;
}

document.getElementById('bettingLabBtn').addEventListener('click', () => {
  const btn = document.getElementById('bettingLabBtn');
  btn.disabled = true;
  btn.textContent = 'Running…';
  // let the button repaint before the synchronous sim burst
  setTimeout(() => {
    try {
      runStrategyLab();
    } finally {
      btn.disabled = false;
      btn.textContent = '🧪 Run Strategy Lab';
    }
  }, 20);
});

document.getElementById('bettingLabResults').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-apply-mode], button[data-apply-universal], button[data-apply-energy], button[data-apply-personal], button[data-apply-compat]');
  if (!btn) return;
  const emptyFilter = { universal: [], energy: [], personal: [], compat: [] };
  if (btn.dataset.applyMode) {
    saveBettingMode(btn.dataset.applyMode);
    bettingModeSelectEl.value = btn.dataset.applyMode;
    renderBettingMixedChips();
  } else if (btn.dataset.applyUniversal !== undefined) {
    const n = Number(btn.dataset.applyUniversal);
    saveBettingDayFilter(n ? { ...emptyFilter, universal: [n] } : emptyFilter);
    renderBettingDayChips();
  } else if (btn.dataset.applyEnergy !== undefined) {
    saveBettingDayFilter({ ...emptyFilter, energy: [Number(btn.dataset.applyEnergy)] });
    renderBettingDayChips();
  } else if (btn.dataset.applyPersonal !== undefined) {
    saveBettingDayFilter({ ...emptyFilter, personal: [Number(btn.dataset.applyPersonal)] });
    renderBettingDayChips();
  } else if (btn.dataset.applyCompat !== undefined) {
    saveBettingDayFilter({ ...emptyFilter, compat: [btn.dataset.applyCompat] });
    renderBettingDayChips();
  }
  resetPagination('bettingLedger');
  renderBetting();
  runStrategyLab(); // refresh the lab's active markers under the new setting
});

/* ===================== Main render + result refresh ===================== */

function renderBetting() {
  if (!currentBettingScope) return;
  const meta = BETTING_SCOPE_META[currentBettingScope];
  document.getElementById('bettingScopeTitle').textContent = `${meta.icon} ${meta.label}`;

  const mode = loadBettingMode();
  const dayFilter = loadBettingDayFilter();
  const mixedTypes = loadBettingMixedTypes();
  currentTodaySlate = buildTodayBettingSlate(currentBettingScope, mode, loadBettingBankroll(), dayFilter, mixedTypes);
  renderBettingToday(currentTodaySlate);
  currentBettingSim = runBettingSimulation(currentBettingScope, mode, loadBettingSimStart(), dayFilter, mixedTypes);
  renderBettingSummary(currentBettingSim);
  renderBettingCurve(currentBettingSim);
  renderBettingLedger(currentBettingSim);
  renderBettingLog();
}

async function checkBettingResults(scope) {
  const jobs = [];
  if (scope === 'all' || scope === 'ufc') jobs.push(checkResults());
  if (scope === 'all' || scope === 'tennis') jobs.push(checkTennisResults());
  if (scope === 'all' || scope === 'mlb') {
    jobs.push(checkMlbResults());
    jobs.push(checkMlbDuelResults());
    // Also record today's not-yet-stored games (moneyline + NRFI + totals) so
    // the Betting page fills its own slate without a Stats-page visit first.
    jobs.push(recordTodaysMlbGames());
  }
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

// Lock button - delegated since Today's Bets re-renders its own markup
document.getElementById('bettingTodayContent').addEventListener('click', (e) => {
  if (!e.target.closest('#bettingLockBtn')) return;
  if (!currentTodaySlate || !currentTodaySlate.tickets || !currentTodaySlate.tickets.length) return;
  lockBettingSlate(currentBettingScope, loadBettingMode(), loadBettingMixedTypes(), loadBettingBankroll(), currentTodaySlate.tickets);
  renderBettingToday(currentTodaySlate); // flips the button to "Locked"
  renderBettingLog();
});

// Expanding a locked slate's tickets
document.getElementById('bettingLog').addEventListener('click', (e) => {
  const head = e.target.closest('.bet-log-head');
  if (!head) return;
  const body = head.nextElementSibling;
  if (body && body.classList.contains('bet-log-body')) {
    body.style.display = body.style.display === 'none' ? '' : 'none';
  }
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

// Day-filter chips - multi-select toggles for Universal Day / Day Energy,
// collapsed behind a summary line that always shows the active filter.
// No 2: a summed personal day that lands on 2 is an 11 (see universalDayNumber).
const BETTING_PERSONAL_DAY_OPTIONS = [1, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

function renderBettingDayChips() {
  const filter = loadBettingDayFilter();
  const chip = (n, group, selected) => `<button type="button" class="betting-day-chip${selected ? ' active' : ''}" data-group="${group}" data-num="${n}">${n}</button>`;
  document.getElementById('bettingUniversalChips').innerHTML = DAY_FILTER_UNIVERSAL_OPTIONS.map((n) => chip(n, 'universal', filter.universal.includes(n))).join('');
  document.getElementById('bettingEnergyChips').innerHTML = DAY_FILTER_ENERGY_OPTIONS.map((n) => chip(n, 'energy', filter.energy.includes(n))).join('');

  const profileHint = '<span class="box-hint" style="margin-top:0;">Set your birthday in My Profile to unlock</span>';
  const hasProfile = bettingPersonalDayFor(bettingLocalDateKey(new Date())) != null;
  document.getElementById('bettingPersonalChips').innerHTML = hasProfile
    ? BETTING_PERSONAL_DAY_OPTIONS.map((n) => chip(n, 'personal', filter.personal.includes(n))).join('')
    : profileHint;
  document.getElementById('bettingCompatChips').innerHTML = hasProfile
    ? BETTING_DAY_COMPAT_BANDS.map((b) => `<button type="button" class="betting-day-chip${filter.compat.includes(b.key) ? ' active' : ''}" data-group="compat" data-num="${b.key}">${b.label}</button>`).join('')
    : profileHint;

  const compatLabels = filter.compat.map((k) => (BETTING_DAY_COMPAT_BANDS.find((b) => b.key === k) || { label: k }).label);
  const summary = document.getElementById('bettingDayFilterSummary');
  const parts = [];
  if (filter.universal.length) parts.push(`Universal Day ${filter.universal.join(', ')}`);
  if (filter.energy.length) parts.push(`Day Energy ${filter.energy.join(', ')}`);
  if (filter.personal.length) parts.push(`My Personal Day ${filter.personal.join(', ')}`);
  if (filter.compat.length) parts.push(`My Day Compat ${compatLabels.join(', ')}`);
  summary.textContent = parts.length ? `only ${parts.join(' + ')}` : 'off (betting every day)';
  summary.classList.toggle('active', parts.length > 0);
}

// Bet-kind chips for Mixed mode - hidden unless the dropdown is on Mixed.
const BETTING_MIXED_TYPE_LABELS = { singles: 'Singles', 2: '2-Leg', 3: '3-Leg', 4: '4-Leg' };

function renderBettingMixedChips() {
  const types = loadBettingMixedTypes();
  document.getElementById('bettingMixedChips').innerHTML = BETTING_MIXED_TYPE_OPTIONS.map((t) =>
    `<button type="button" class="betting-day-chip${types.includes(t) ? ' active' : ''}" data-type="${t}">${BETTING_MIXED_TYPE_LABELS[t]}</button>`).join('');
  document.getElementById('bettingMixedRow').style.display = loadBettingMode() === 'mixed' ? '' : 'none';
}

// Market toggles - which MLB market kinds feed the MLB / All Sports slates.
const BETTING_MARKET_LABELS = { moneyline: '⚾ Moneyline', nrfi: '1️⃣ NRFI', totals: '↕️ Totals' };

function renderBettingMarketChips() {
  const markets = loadBettingMarkets();
  document.getElementById('bettingMarketsChips').innerHTML = BETTING_MARKET_OPTIONS.map((m) =>
    `<button type="button" class="betting-day-chip${markets.includes(m) ? ' active' : ''}" data-market="${m}">${BETTING_MARKET_LABELS[m]}</button>`).join('');
}

document.getElementById('bettingMarketsRow').addEventListener('click', (e) => {
  const chipEl = e.target.closest('.betting-day-chip');
  if (!chipEl) return;
  const markets = loadBettingMarkets();
  const m = chipEl.dataset.market;
  const idx = markets.indexOf(m);
  if (idx >= 0) markets.splice(idx, 1); else markets.push(m);
  saveBettingMarkets(markets);
  renderBettingMarketChips();
  resetPagination('bettingLedger');
  renderBetting();
});

document.getElementById('bettingMixedRow').addEventListener('click', (e) => {
  const chipEl = e.target.closest('.betting-day-chip');
  if (!chipEl) return;
  const types = loadBettingMixedTypes();
  const t = chipEl.dataset.type;
  const idx = types.indexOf(t);
  if (idx >= 0) types.splice(idx, 1); else types.push(t);
  saveBettingMixedTypes(types);
  renderBettingMixedChips();
  resetPagination('bettingLedger');
  renderBetting();
});

document.getElementById('bettingDayFilter').addEventListener('click', (e) => {
  const chipEl = e.target.closest('.betting-day-chip');
  if (!chipEl) return;
  const filter = loadBettingDayFilter();
  const group = chipEl.dataset.group;
  const list = filter[group];
  const value = group === 'compat' ? chipEl.dataset.num : Number(chipEl.dataset.num);
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1); else list.push(value);
  if (group !== 'compat') list.sort((a, b) => a - b);
  saveBettingDayFilter(filter);
  renderBettingDayChips();
  resetPagination('bettingLedger');
  renderBetting();
});

renderBettingDayChips();
renderBettingMixedChips();
renderBettingMarketChips();

const bettingBankrollInputEl = document.getElementById('bettingBankrollInput');
bettingBankrollInputEl.value = loadBettingBankroll();
bettingBankrollInputEl.addEventListener('change', () => {
  const v = Number(bettingBankrollInputEl.value);
  if (Number.isFinite(v) && v > 0) saveBettingBankroll(v);
  bettingBankrollInputEl.value = loadBettingBankroll();
  renderBetting();
});

const bettingSimStartInputEl = document.getElementById('bettingSimStartInput');
bettingSimStartInputEl.value = loadBettingSimStart();
bettingSimStartInputEl.addEventListener('change', () => {
  const v = Number(bettingSimStartInputEl.value);
  if (Number.isFinite(v) && v > 0) saveBettingSimStart(v);
  bettingSimStartInputEl.value = loadBettingSimStart();
  renderBetting();
});

const bettingModeSelectEl = document.getElementById('bettingModeSelect');
bettingModeSelectEl.value = loadBettingMode();
bettingModeSelectEl.addEventListener('change', () => {
  saveBettingMode(bettingModeSelectEl.value);
  renderBettingMixedChips();
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

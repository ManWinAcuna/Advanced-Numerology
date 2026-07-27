// Betting page controller - wires betting.html to the engine in
// betting-core.js and renders today's slate plus the simulated ledger.
// Result-checking reuses checkResults()/checkTennisResults()/checkMlbResults()
// from the stats-* files (loaded on this page with their Stats-DOM wiring
// guarded off), so a game settles here exactly when it settles on Stats.

// Scope meta, money/odds formatting, ticket cards, and renderBettingLog all
// live in betting-render.js (shared with bet-log.html).

let currentBettingScope = null;
let currentBettingSim = null;
let currentTodaySlate = null;

/* ===================== Today's Bets ===================== */

// Today's games that were fetched but can't be scored yet, and what each is
// waiting on. The trackers keep these lists so the Stats table can show the
// full slate; the betting page reads them so an unscoreable slate reads as
// "not ready yet" rather than "no games".
const BETTING_PENDING_REASONS = {
  lineup: 'the starting lineups are not posted yet (MLB puts them up a few hours before first pitch)',
  rotation: 'there are not enough recent games yet to build each rotation',
  venue: 'the venue and timezone details have not resolved yet',
  pending: 'the schedule and box-score feed has not filled in yet',
};

function bettingPendingToday(scope) {
  const counts = {};
  let count = 0;
  const add = (list) => {
    (list || []).forEach((g) => {
      count += 1;
      const key = g.status || 'pending';
      counts[key] = (counts[key] || 0) + 1;
    });
  };
  if ((scope === 'all' || scope === 'mlb') && typeof todaysMlbSlatePending !== 'undefined') add(todaysMlbSlatePending);
  if ((scope === 'all' || scope === 'nba') && typeof todaysNbaSlatePending !== 'undefined') add(todaysNbaSlatePending);

  const reasonText = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .map((k) => BETTING_PENDING_REASONS[k] || `they are waiting on ${k} data`)
    .join('; ');
  return { count, counts, reasonText };
}

function renderBettingToday(slate) {
  const el = document.getElementById('bettingTodayContent');

  if (slate.dayFiltered) {
    const personalBit = slate.todayNums.personal != null ? ` / your Personal Day ${slate.todayNums.personal}` : '';
    const compatBit = slate.todayNums.compatScore != null ? ` / your day compatibility ${slate.todayNums.compatScore}` : '';
    el.innerHTML = `<div class="empty-state">Today is Universal Day ${slate.todayNums.universal} / Day Energy ${slate.todayNums.energy}${personalBit}${compatBit} &mdash; outside your day filter, so no bets today.</div>`;
    return;
  }
  if (!slate.totalTodayPicks) {
    // A game is fetched long before it can be scored: the composite needs both
    // starting lineups, which MLB posts only a few hours before first pitch.
    // Reporting that as "no games tracked" made an ordinary morning look like
    // the slate had vanished, so say how many are waiting and on what.
    const pending = bettingPendingToday(currentBettingScope);
    if (pending.count) {
      el.innerHTML = `<div class="empty-state">${pending.count} game${pending.count === 1 ? '' : 's'} found for today, but none can be scored yet &mdash; ${pending.reasonText}. This fills in on its own once the data is up; nothing is lost.</div>`;
      return;
    }
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
      <button class="btn-link" id="bettingCheckPricesBtn" type="button">💱 Check Live Prices</button>
      <a class="btn-link" href="bet-log.html">📒 View Bet Log &rarr;</a>
      <span class="box-hint" style="margin-top:0;">Locking freezes this exact slate into the Bet Log permanently &mdash; do it when you're taking the bets.</span>
    </div>
    <div class="box-hint" id="bettingPriceNote"></div>`;
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

// Edge Stability - profit per dollar staked, month by month, as bars around
// a zero line. One tall bar carrying the whole total is the luck signature;
// steady green is the edge signature.
function renderBettingStability(sim) {
  const box = document.getElementById('bettingStabilityBox');
  const days = [...sim.ledger].reverse(); // chronological
  const byMonth = new Map();
  days.forEach((d) => {
    const key = d.dateKey.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { staked: 0, profit: 0, tickets: 0 });
    const m = byMonth.get(key);
    m.staked += d.staked;
    m.profit += d.profit;
    m.tickets += d.tickets.length;
  });
  const months = [...byMonth.entries()];
  if (months.length < 2) {
    box.style.display = 'none'; // one month has no stability story to tell
    return;
  }
  box.style.display = '';

  // padB fits two label lines under the axis: the month, then its ticket
  // count - a month's ROI is unreadable without knowing if it's 4 bets or 90.
  const W = 600, H = 190, padT = 18, padB = 38;
  const slot = (W - 20) / months.length;
  const barW = Math.min(56, slot - 10);
  const rois = months.map(([, m]) => (m.staked > 0 ? m.profit / m.staked : 0));
  const maxAbs = Math.max(0.05, ...rois.map(Math.abs));
  const zeroY = padT + (H - padT - padB) / 2;
  const scale = (H - padT - padB) / 2 / maxAbs;
  const currentKey = bettingLocalDateKey(new Date()).slice(0, 7);
  const multiYear = new Set(months.map(([k]) => k.slice(0, 4))).size > 1;

  const bars = months.map(([key, m], i) => {
    const roi = rois[i];
    const x = 10 + i * slot + (slot - barW) / 2;
    const h = Math.max(1, Math.abs(roi) * scale);
    const y = roi >= 0 ? zeroY - h : zeroY;
    const color = roi > 0 ? 'var(--good)' : roi < 0 ? 'var(--bad)' : 'var(--border)';
    // Year included once the record spans more than one - Sep and Mar sitting
    // side by side are two different seasons, which the month alone hides.
    const monthDate = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
    const monthLabel = monthDate.toLocaleDateString(undefined, multiYear ? { month: 'short', year: '2-digit' } : { month: 'short' })
      + (key === currentKey ? '*' : '');
    const roiLabel = `${roi > 0 ? '+' : ''}${Math.round(roi * 100)}%`;
    const labelY = roi >= 0 ? y - 4 : y + h + 11;
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" opacity="0.85" rx="2" />
      <text x="${(x + barW / 2).toFixed(1)}" y="${labelY.toFixed(1)}" fill="${color}" font-size="10" text-anchor="middle">${roiLabel}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${H - 20}" fill="var(--muted)" font-size="10" text-anchor="middle">${monthLabel}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${H - 7}" fill="var(--muted)" font-size="9" text-anchor="middle" opacity="0.75">${m.tickets} bet${m.tickets === 1 ? '' : 's'}</text>`;
  }).join('');

  document.getElementById('bettingStability').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="10" y1="${zeroY}" x2="${W - 10}" y2="${zeroY}" stroke="var(--border)" />
      ${bars}
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

// Per-market readiness - makes "no bets" self-explaining: no data, still
// warming up, or enough history but no edge worth betting.
function renderBettingReadiness() {
  const el = document.getElementById('bettingReadiness');
  const rows = bettingMarketReadiness(currentBettingScope).map((r) => {
    let state;
    if (!r.tracked) {
      state = '<span class="score-inline bad">no data yet</span> &mdash; run Backfill on the Stats page';
    } else if (!r.ready) {
      state = `<span class="score-inline mid">warming up ${r.bestTierCount}/${BETTING_MIN_TIER_SAMPLE}</span> in its best edge tier`;
    } else {
      state = `<span class="score-inline good">ready</span> &mdash; bets when a bucket beats its price`;
    }
    const record = r.realEdge
      ? ` &middot; ${r.realEdge} real-edge picks at <span class="score-inline ${winRateClass(r.winPct)}">${r.winPct}%</span>`
      : '';
    return `<div class="bet-readiness-row">${r.icon} <strong>${escapeHtml(r.label)}</strong>: ${r.tracked} tracked, ${r.resolved} resolved${record} &middot; ${state}</div>`;
  }).join('');
  el.innerHTML = rows;
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

  const kellyRows = BETTING_KELLY_OPTIONS.map((f) => ({
    label: f === 0.25 ? 'Quarter Kelly' : f === 0.5 ? 'Half Kelly' : 'Full Kelly',
    applyAttr: `data-apply-kelly="${f}"`,
    active: f === loadBettingKellyFraction(),
    sim: runBettingSimulation(scope, curMode, start, curFilter, mixedTypes, picks, f),
  }));

  document.getElementById('bettingLabResults').innerHTML =
    bettingLabTableHtml(`Bet types &middot; ${BETTING_SCOPE_META[scope].label}, current day filter`, betTypeRows)
    + bettingLabTableHtml(`Kelly dial &middot; ${BETTING_SCOPE_META[scope].label}, current settings`, kellyRows)
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
  const btn = e.target.closest('button[data-apply-mode], button[data-apply-universal], button[data-apply-energy], button[data-apply-personal], button[data-apply-compat], button[data-apply-kelly]');
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
  } else if (btn.dataset.applyKelly !== undefined) {
    saveBettingKellyFraction(Number(btn.dataset.applyKelly));
    document.getElementById('bettingKellySelect').value = btn.dataset.applyKelly;
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
  renderBettingMarketChips(); // scope-dependent: hidden for UFC/Tennis
  currentTodaySlate = buildTodayBettingSlate(currentBettingScope, mode, loadBettingBankroll(), dayFilter, mixedTypes);
  renderBettingToday(currentTodaySlate);
  renderBettingReadiness();
  currentBettingSim = runBettingSimulation(currentBettingScope, mode, loadBettingSimStart(), dayFilter, mixedTypes);
  renderBettingSummary(currentBettingSim);
  renderBettingCurve(currentBettingSim);
  renderBettingStability(currentBettingSim);
  renderBettingLedger(currentBettingSim);
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
  if (scope === 'all' || scope === 'nba') {
    jobs.push(checkNbaResults());
    jobs.push(checkNbaTotalsResults());
    jobs.push(recordTodaysNbaGames());
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

document.getElementById('bettingSportPicker').addEventListener('click', async (e) => {
  const card = e.target.closest('.mode-card[data-sport]');
  if (!card) return;
  e.preventDefault();
  currentBettingScope = card.dataset.sport;
  document.getElementById('bettingSportPicker').style.display = 'none';
  document.getElementById('bettingSportContent').style.display = '';
  resetPagination('bettingLedger');
  // The prediction stores are IndexedDB-backed now - wait for them before the
  // first read so a fast tap can't render off an empty cache.
  await bigStoreReadyPromise;
  refreshBettingAndRender();
});

document.getElementById('bettingChooseSportLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('bettingSportContent').style.display = 'none';
  document.getElementById('bettingSportPicker').style.display = '';
});

// Lock and live-price buttons - delegated since Today's Bets re-renders its
// own markup on every pass.
document.getElementById('bettingTodayContent').addEventListener('click', async (e) => {
  const hasSlate = currentTodaySlate && currentTodaySlate.tickets && currentTodaySlate.tickets.length;

  if (e.target.closest('#bettingLockBtn')) {
    if (!hasSlate) return;
    lockBettingSlate(currentBettingScope, loadBettingMode(), loadBettingMixedTypes(), loadBettingBankroll(), currentTodaySlate.tickets);
    renderBettingToday(currentTodaySlate); // flips the button to "Locked"
    return;
  }

  if (e.target.closest('#bettingCheckPricesBtn')) {
    if (!hasSlate) return;
    const btn = e.target.closest('#bettingCheckPricesBtn');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const res = await markStaleBettingPrices(currentTodaySlate.tickets);
      renderBettingToday(currentTodaySlate); // repaint with live prices on the legs
      const note = document.getElementById('bettingPriceNote');
      if (note) {
        note.textContent = res.checked
          ? (res.stale
            ? `${res.stale} of ${res.checked} legs have moved past their max price — skip those.`
            : `All ${res.checked} legs still price in — good to bet.`)
          : 'No live prices available for these legs right now.';
        note.className = res.stale ? 'box-hint bet-price-warn' : 'box-hint';
      }
    } catch (err) {
      const note = document.getElementById('bettingPriceNote');
      if (note) note.textContent = 'Could not reach the market for a live quote.';
    }
    btn.disabled = false;
    btn.textContent = '💱 Check Live Prices';
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
// (BETTING_MIXED_TYPE_LABELS lives in betting-render.js.)
function renderBettingMixedChips() {
  const types = loadBettingMixedTypes();
  document.getElementById('bettingMixedChips').innerHTML = BETTING_MIXED_TYPE_OPTIONS.map((t) =>
    `<button type="button" class="betting-day-chip${types.includes(t) ? ' active' : ''}" data-type="${t}">${BETTING_MIXED_TYPE_LABELS[t]}</button>`).join('');
  document.getElementById('bettingMixedRow').style.display = loadBettingMode() === 'mixed' ? '' : 'none';
}

// Market toggles. Every market kind belongs to exactly one sport - NRFI and
// run totals don't exist for a fight or a tennis match, and NBA's own
// moneyline/totals are separate keys so an MLB toggle can't gate them. UFC and
// Tennis have no market switch at all.
//
// Each chip therefore declares its owning scope, and the row only shows the
// chips that can actually affect the scope being viewed - hiding entirely on
// scopes it can't touch. Previously the MLB chips rendered on the UFC and
// Tennis scopes where they did nothing, which read as NRFI existing for boxing.
const BETTING_MARKET_LABELS = {
  moneyline: '⚾ MLB Moneyline',
  nrfi: '1️⃣ MLB NRFI',
  totals: '↕️ MLB Totals',
  nbaMoneyline: '🏀 NBA Moneyline',
  nbaTotals: '↕️ NBA Totals',
};

const BETTING_MARKET_SCOPE = {
  moneyline: 'mlb', nrfi: 'mlb', totals: 'mlb',
  nbaMoneyline: 'nba', nbaTotals: 'nba',
};

function renderBettingMarketChips() {
  const row = document.getElementById('bettingMarketsRow');
  const visible = BETTING_MARKET_OPTIONS.filter((m) =>
    currentBettingScope === 'all' || BETTING_MARKET_SCOPE[m] === currentBettingScope);
  row.style.display = visible.length ? '' : 'none';
  if (!visible.length) return;

  const markets = loadBettingMarkets();
  document.getElementById('bettingMarketsChips').innerHTML = visible.map((m) =>
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

const bettingKellySelectEl = document.getElementById('bettingKellySelect');
bettingKellySelectEl.value = String(loadBettingKellyFraction());
bettingKellySelectEl.addEventListener('change', () => {
  saveBettingKellyFraction(Number(bettingKellySelectEl.value));
  bettingKellySelectEl.value = String(loadBettingKellyFraction());
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

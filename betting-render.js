// Shared betting display helpers - loaded by both betting.html and
// bet-log.html (before their page controllers), so a ticket renders
// identically wherever it appears. No page wiring here; renderBettingLog
// no-ops on a page without the log elements.

const BETTING_SCOPE_META = {
  all: { label: 'All Sports', icon: '🌐' },
  mlb: { label: 'MLB', icon: '⚾' },
  nba: { label: 'NBA', icon: '🏀' },
  tennis: { label: 'Tennis', icon: '🎾' },
  ufc: { label: 'UFC', icon: '🥊' },
};

const BETTING_MIXED_TYPE_LABELS = { singles: 'Singles', 2: '2-Leg', 3: '3-Leg', 4: '4-Leg' };

/* ===================== Formatting ===================== */

function bettingFmtMoney(v) {
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
}

function bettingFmtSignedMoney(v) {
  return v > 0 ? `+$${v.toFixed(2)}` : bettingFmtMoney(v);
}

// Chart-label money: full precision doesn't fit under a 56px bar, and on a
// phone the bars are narrower still. Drops to $1.2k past a thousand.
function bettingFmtCompactMoney(v) {
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${(k >= 10 ? Math.round(k) : Math.round(k * 10) / 10)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
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

function bettingModeLabel(mode, mixedTypes) {
  if (mode === 'singles') return 'Singles';
  if (mode === 'mixed') return `Mixed (${(mixedTypes || ['singles']).map((t) => BETTING_MIXED_TYPE_LABELS[t]).join(' + ')})`;
  return `${mode}-Leg Parlay`;
}

/* ===================== Ticket cards ===================== */

function bettingLegHtml(leg) {
  const legStatus = !leg.resolved ? '🕒' : leg.draw ? '↩️' : leg.won ? '✅' : '❌';
  const pct = Math.round(leg.estProb * 100);
  // The worst price at which this pick still clears the qualification edge -
  // the shopping limit when taking it to another book (DK/Kalshi).
  const maxPrice = leg.estProb - BETTING_MIN_EV_EDGE;
  // Live re-quote, when the stale-price guard has run for this slate.
  const liveBit = Number.isFinite(leg.livePrice)
    ? (leg.stale
      ? ` &middot; <span class="score-inline bad">now ${bettingFmtCents(leg.livePrice)} &mdash; edge gone</span>`
      : ` &middot; <span class="score-inline good">now ${bettingFmtCents(leg.livePrice)}</span>`)
    : '';
  return `
    <div class="bet-leg${leg.stale ? ' stale' : ''}">
      <span class="bet-leg-status">${legStatus}</span>
      <span class="bet-leg-main">${BETTING_SPORTS[leg.sport].icon} ${escapeHtml(leg.matchup)} &rarr; <strong>${escapeHtml(leg.pickName)}</strong></span>
      <span class="bet-leg-nums">@ ${bettingFmtCents(leg.price)} (${bettingAmericanOdds(leg.price)}) &middot; est <span class="score-inline ${winRateClass(pct)}">${pct}%</span> &middot; max ${bettingFmtCents(maxPrice)} (${bettingAmericanOdds(maxPrice)})${liveBit}</span>
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
      ${ticket.sameGameLegs ? `<div class="bet-same-game">🔗 ${ticket.sameGameLegs + 1} legs from one game &mdash; stake reduced for concentration</div>` : ''}
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

/* ===================== Locked Bet Log ===================== */

function renderBettingLog() {
  const summaryEl = document.getElementById('bettingLogSummary');
  const listEl = document.getElementById('bettingLog');
  if (!summaryEl || !listEl) return; // page without the log
  const locked = loadBettingLockedSlates();

  if (!locked.length) {
    summaryEl.innerHTML = '';
    listEl.innerHTML = '<div class="empty-state">Nothing locked yet &mdash; lock a slate from the Betting page\'s Today\'s Bets when you actually take it.</div>';
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
    // settleLockedSlates spreads the stored record, so id survives hydration.
    // Older records predate ids; the content signature identifies those.
    //
    // encodeURIComponent, not escapeHtml: escapeHtml round-trips through
    // textContent/innerHTML, which escapes & < > but NOT the double quote - and
    // a signature is built from matchup and pick names, so a fighter nickname
    // like Jon "Bones" Jones would close the attribute early. Percent-encoding
    // leaves nothing that can terminate it, and the handler decodes on read.
    const key = encodeURIComponent(String(s.id || s.signature || ''));
    return `
      <div class="bet-log-entry">
        <div class="bet-log-head">
          <span>${bettingFmtDate(s.dateKey)} &middot; ${meta.icon} ${meta.label} &middot; ${bettingModeLabel(s.mode, s.mixedTypes)} &middot; 🔒 ${timeStr}</span>
          <span class="bet-log-head-right">${right}<button type="button" class="bet-log-delete" data-slate="${key}" title="Delete this locked bet" aria-label="Delete this locked bet">🗑</button></span>
        </div>
        <div class="bet-log-body" style="display:none;">${bettingTicketsHtml(s.tickets)}</div>
      </div>`;
  }).join('');

  renderPaginationControls('bettingLogPagination', 'bettingLog', page, totalPages, renderBettingLog);
}

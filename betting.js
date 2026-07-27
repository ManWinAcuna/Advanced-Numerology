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

  // Locked bets leave the slip entirely. Keeping them on screen meant a newly
  // qualified game arrived partway down a list already acted on, with nothing
  // marking which was which. What's displayed is now exactly what pressing Lock
  // would write - so a bet appearing here always means it needs taking.
  const fresh = bettingUnlockedTickets(slate.tickets);
  const lockedCount = slate.tickets.length - fresh.length;

  if (!fresh.length) {
    el.innerHTML = `
      <div class="empty-state">All ${lockedCount} of today's bet${lockedCount === 1 ? ' is' : 's are'} locked &mdash; nothing left to take. If another game qualifies later, it appears here on its own.</div>
      <div class="bet-lock-row">
        <a class="btn-link" href="bet-log.html">📒 View Bet Log &rarr;</a>
      </div>`;
    return;
  }

  // Totals cover what's on the slip, not the whole day - this is the number
  // you'd be staking right now if you took everything shown.
  const totalStake = fresh.reduce((s, t) => s + t.stake, 0);
  const totalPayout = fresh.reduce((s, t) => s + t.stake / t.prodPrice, 0);
  el.innerHTML = `
    <div class="bet-day-summary">Total staked: <strong>${bettingFmtMoney(totalStake)}</strong> &middot; If everything hits: <strong>${bettingFmtMoney(totalPayout)}</strong> &middot; ${slate.qualifiedCount} qualifying pick${slate.qualifiedCount === 1 ? '' : 's'}${lockedCount ? ` &middot; ${lockedCount} already locked` : ''}</div>
    ${bettingMissingTypesHtml(slate)}
    ${bettingTicketsHtml(fresh)}
    <div class="bet-lock-row">
      <button class="btn" id="bettingLockBtn" type="button">🔒 ${lockedCount ? `Lock ${fresh.length} new bet${fresh.length === 1 ? '' : 's'}` : 'Lock these bets'}</button>
      <button class="btn-link" id="bettingCheckPricesBtn" type="button">💱 Check Live Prices</button>
      <a class="btn-link" href="bet-log.html">📒 View Bet Log &rarr;</a>
      <span class="box-hint" style="margin-top:0;">Locking writes these bets to the Bet Log permanently &mdash; do it when you're taking them. They then drop off this slip, so anything still showing is a bet you haven't taken yet.</span>
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
  // Only worth a line when it's a different event than the dollar record -
  // otherwise it's the same number twice. On a compounding curve it usually IS
  // different, and usually much worse: the dollar record can only be set once
  // the bankroll is big, so early slides never win it however deep they cut.
  if (sim.worstSlidePct > sim.maxDrawdownPct) {
    bits.push(`Worst slide <span class="score-inline bad">${sim.worstSlidePct}%</span> (-${bettingFmtMoney(sim.worstSlideAmount)}${sim.worstSlideDateKey ? ` on ${bettingFmtDate(sim.worstSlideDateKey)}` : ''})`);
  }

  hero.innerHTML = `
    <div class="score-names">Simulated Bankroll</div>
    <div class="score-big ${cls}">${bettingFmtMoney(sim.finalBankroll)}</div>
    <div class="pm-breakdown-hint" style="text-align:center;">Started ${bettingFmtMoney(sim.startBankroll)} &middot; P/L <span class="score-inline ${cls}">${bettingFmtSignedMoney(delta)}</span> &middot; ROI ${roi}% of ${bettingFmtMoney(sim.totals.staked)} staked</div>
    <div class="pm-breakdown-hint" style="text-align:center;">Tickets: ${bits.join(' &middot; ')} &middot; ${sim.dayCount} betting day${sim.dayCount === 1 ? '' : 's'}</div>`;
}

// A bet type selected in Mixed that produced no tickets used to just be absent,
// which is indistinguishable from "the setting isn't working". The two causes
// need opposite responses from the user, so they're named separately: not enough
// qualifying picks is a wait-for-more-games problem, stakes under the minimum is
// a bankroll-or-fewer-types problem.
function bettingMissingTypesHtml(slate) {
  const dropped = slate.droppedTypes || [];
  if (!dropped.length) return '';
  const lines = dropped.map((d) => {
    if (!d.built) {
      return `<strong>${d.legCount}-leg parlays:</strong> needs ${d.needed} qualifying picks today, there ${d.qualified === 1 ? 'is' : 'are'} ${d.qualified}.`;
    }
    return `<strong>${d.legCount}-leg parlays:</strong> ${d.built} built, but each stake came out under the ${bettingFmtMoney(BETTING_MIN_STAKE)} minimum once the parlay budget was split ${dropped.length > 1 ? 'across the selected sizes' : ''}&mdash; a bigger bankroll, or fewer bet types selected, would let them through.`;
  });
  return `<div class="box-hint bet-missing-types">${lines.join('<br>')}</div>`;
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
  paintBettingCurve(sim, days, 'bettingCurve', 'bettingCurve', 600, 170);
}

// The curve at any size, into any container. The inline chart and the expanded
// modal are the same drawing with a different viewBox, so they share this
// rather than diverging - a fix to the scrub or the labels lands in both.
// idPrefix namespaces the SVG's internal ids so both copies can be in the DOM
// at once without the modal's crosshair being driven by the inline chart's.
function paintBettingCurve(sim, days, containerId, idPrefix, W, H) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const values = [sim.startBankroll, ...days.map((d) => d.bankrollAfter)];
  const padL = 8, padR = 8, padT = 16, padB = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => padL + (i / (values.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const peakIdx = values.indexOf(max);
  const endUp = values[values.length - 1] >= values[0];
  const lineColor = endUp ? 'var(--good)' : 'var(--bad)';

  // touch-action:pan-y is what makes this usable on a phone: a vertical swipe
  // still scrolls the page, while a horizontal drag scrubs the curve. Without
  // it the chart either eats every scroll or never sees a touch at all.
  container.innerHTML = `
    <svg id="${idPrefix}Svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;touch-action:pan-y;cursor:crosshair;">
      <line x1="${padL}" y1="${y(values[0]).toFixed(1)}" x2="${W - padR}" y2="${y(values[0]).toFixed(1)}" stroke="var(--border)" stroke-dasharray="4 4" />
      <polygon points="${x(0).toFixed(1)},${(H - padB)} ${pts} ${x(values.length - 1).toFixed(1)},${(H - padB)}" fill="${endUp ? 'rgba(139, 195, 74, 0.08)' : 'rgba(229, 57, 63, 0.08)'}" />
      <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" />
      <circle cx="${x(peakIdx).toFixed(1)}" cy="${y(values[peakIdx]).toFixed(1)}" r="3.5" fill="var(--yellow)" />
      <text x="${padL}" y="11" fill="var(--muted)" font-size="10">start ${bettingFmtMoney(sim.startBankroll)}</text>
      <text x="${W - padR}" y="11" fill="var(--yellow)" font-size="10" text-anchor="end">peak ${bettingFmtMoney(sim.peakBankroll)}</text>
      <text x="${padL}" y="${H - 5}" fill="var(--muted)" font-size="10">${days.length} betting days</text>
      <text x="${W - padR}" y="${H - 5}" fill="${lineColor}" font-size="10" text-anchor="end">now ${bettingFmtMoney(sim.finalBankroll)}</text>
      <g id="${idPrefix}Crosshair" style="display:none;pointer-events:none;">
        <line id="${idPrefix}CrossLine" y1="${padT}" y2="${H - padB}" stroke="var(--yellow)" stroke-width="1" stroke-dasharray="3 3" opacity="0.7" />
        <circle id="${idPrefix}CrossDot" r="4" fill="var(--yellow)" stroke="var(--bg)" stroke-width="1.5" />
      </g>
    </svg>
    <div id="${idPrefix}Readout" class="pm-breakdown-hint" style="text-align:center;min-height:1.2em;">Drag across the curve to read any day.</div>`;

  attachBettingCurveScrub(days, values, x, y, W, idPrefix);
}

// Scrubbing is wired after the innerHTML above rather than baked into it,
// because the readout needs the per-day ledger rows and those don't survive a
// round trip through markup. Index 0 of `values` is the starting bankroll
// (before any bet), so day i lives at values[i+1] - hence the -1 below.
function attachBettingCurveScrub(days, values, x, y, W, idPrefix) {
  const svg = document.getElementById(`${idPrefix}Svg`);
  const readout = document.getElementById(`${idPrefix}Readout`);
  const cross = document.getElementById(`${idPrefix}Crosshair`);
  const line = document.getElementById(`${idPrefix}CrossLine`);
  const dot = document.getElementById(`${idPrefix}CrossDot`);
  if (!svg || !readout) return;

  const show = (clientX) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    // Client pixels -> viewBox units, then to the nearest plotted point.
    const vbX = ((clientX - box.left) / box.width) * W;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < values.length; i++) {
      const d = Math.abs(x(i) - vbX);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    cross.style.display = '';
    line.setAttribute('x1', x(best).toFixed(1));
    line.setAttribute('x2', x(best).toFixed(1));
    dot.setAttribute('cx', x(best).toFixed(1));
    dot.setAttribute('cy', y(values[best]).toFixed(1));

    if (best === 0) {
      readout.innerHTML = `<strong>Start</strong> &middot; ${bettingFmtMoney(values[0])} &middot; before the first bet`;
      return;
    }
    const day = days[best - 1];
    const plCls = day.profit > 0 ? 'good' : day.profit < 0 ? 'bad' : '';
    const wins = day.tickets.filter((t) => t.status === 'won').length;
    const losses = day.tickets.filter((t) => t.status === 'lost').length;
    readout.innerHTML = `<strong>${bettingFmtDate(day.dateKey)}</strong>`
      + `${day.inProgress ? ' <span class="bet-inprogress">(in progress)</span>' : ''}`
      + ` &middot; ${bettingFmtMoney(day.bankrollAfter)}`
      + ` &middot; <span class="score-inline ${plCls}">${bettingFmtSignedMoney(day.profit)}</span>`
      + ` &middot; ${day.tickets.length} ticket${day.tickets.length === 1 ? '' : 's'} (${wins}W-${losses}L)`
      + ` &middot; ${bettingFmtMoney(day.staked)} staked`;
  };

  const hide = () => {
    cross.style.display = 'none';
    readout.textContent = 'Drag across the curve to read any day.';
  };

  let pressed = false;
  svg.addEventListener('pointerdown', (e) => { pressed = true; show(e.clientX); });
  svg.addEventListener('pointermove', (e) => {
    // A mouse scrubs on hover; a finger only while it's actually down, so the
    // crosshair doesn't get stranded mid-chart after a scroll.
    if (e.pointerType === 'mouse' || pressed) show(e.clientX);
  });
  svg.addEventListener('pointerup', () => { pressed = false; });
  svg.addEventListener('pointercancel', () => { pressed = false; hide(); });
  svg.addEventListener('pointerleave', () => { pressed = false; hide(); });
}

// Edge Stability - profit per dollar staked, month by month, as bars around
// a zero line. One tall bar carrying the whole total is the luck signature;
// steady green is the edge signature.
// Month buckets in chronological order, keyed YYYY-MM. Shared by the bar chart
// and the calendar so the two views can never disagree about a month.
function bettingMonthlyBuckets(sim) {
  const days = [...sim.ledger].reverse(); // ledger is newest-first
  const byMonth = new Map();
  days.forEach((d) => {
    const key = d.dateKey.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { staked: 0, profit: 0, tickets: 0 });
    const m = byMonth.get(key);
    m.staked += d.staked;
    m.profit += d.profit;
    m.tickets += d.tickets.length;
  });
  return byMonth;
}

function renderBettingStability(sim) {
  const box = document.getElementById('bettingStabilityBox');
  const months = [...bettingMonthlyBuckets(sim).entries()];
  if (months.length < 2) {
    box.style.display = 'none'; // one month has no stability story to tell
    return;
  }
  box.style.display = '';

  // padB fits two label lines under the axis: the month, then its ticket
  // count - a month's ROI is unreadable without knowing if it's 4 bets or 90.
  // padT/H carry two lines at the bar tip instead of one: ROI% on top, dollars
  // under it. Percent alone hides the thing that matters most in a compounding
  // sim - an early +36% and a late +126% are the same height and nowhere near
  // the same money.
  const W = 600, H = 214, padT = 32, padB = 40;
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
    const plLabel = bettingFmtCompactMoney(Math.round(m.profit));
    // Positive bars label outward from the tip. Negative bars label just ABOVE
    // the zero line instead of under the bar: a full-depth bar (a -100% month)
    // bottoms out only ~18px clear of the axis labels, so two stacked lines
    // under it ran straight into the month name. The space above zero in a
    // negative column is always empty, so it can never collide.
    const roiY = roi >= 0 ? y - 15 : zeroY - 15;
    const plY = roi >= 0 ? y - 4 : zeroY - 4;
    const cx = (x + barW / 2).toFixed(1);
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" opacity="0.85" rx="2" />
      <text x="${cx}" y="${roiY.toFixed(1)}" fill="${color}" font-size="10" text-anchor="middle">${roiLabel}</text>
      <text x="${cx}" y="${plY.toFixed(1)}" fill="${color}" font-size="10" text-anchor="middle" opacity="0.8" font-weight="600">${plLabel}</text>
      <text x="${cx}" y="${H - 22}" fill="var(--muted)" font-size="10" text-anchor="middle">${monthLabel}</text>
      <text x="${cx}" y="${H - 9}" fill="var(--muted)" font-size="9" text-anchor="middle" opacity="0.75">${m.tickets} bet${m.tickets === 1 ? '' : 's'}</text>
      <rect class="betting-stability-hit" data-i="${i}" x="${(10 + i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent" style="cursor:pointer;" />`;
  }).join('');

  document.getElementById('bettingStability').innerHTML = `
    <svg id="bettingStabilitySvg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="10" y1="${zeroY}" x2="${W - 10}" y2="${zeroY}" stroke="var(--border)" />
      <rect id="bettingStabilitySel" x="0" y="0" width="0" height="${H}" fill="var(--yellow)" opacity="0.08" rx="3" style="display:none;pointer-events:none;" />
      ${bars}
    </svg>
    <div id="bettingStabilityReadout" class="pm-breakdown-hint" style="text-align:center;min-height:1.2em;">Tap a month for its full numbers.</div>`;

  attachBettingStabilityTaps(months, slot);
}

// Per-month detail on tap. The bars themselves are often only a few pixels
// tall, so the hit target is the whole column, not the drawn rect.
function attachBettingStabilityTaps(months, slot) {
  const svg = document.getElementById('bettingStabilitySvg');
  const readout = document.getElementById('bettingStabilityReadout');
  const sel = document.getElementById('bettingStabilitySel');
  if (!svg || !readout) return;

  const totalProfit = months.reduce((s, [, m]) => s + m.profit, 0);

  svg.querySelectorAll('.betting-stability-hit').forEach((hit) => {
    hit.addEventListener('click', () => {
      const i = Number(hit.getAttribute('data-i'));
      const [key, m] = months[i];
      const roi = m.staked > 0 ? m.profit / m.staked : 0;
      const cls = m.profit > 0 ? 'good' : m.profit < 0 ? 'bad' : '';
      const monthDate = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
      const name = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      // Share of the total is the point of the whole chart: it's what tells you
      // whether one month is carrying the record.
      const share = totalProfit > 0 ? Math.round((m.profit / totalProfit) * 100) : null;

      sel.style.display = '';
      sel.setAttribute('x', (10 + i * slot).toFixed(1));
      sel.setAttribute('width', slot.toFixed(1));

      readout.innerHTML = `<strong>${name}</strong>`
        + ` &middot; <span class="score-inline ${cls}">${bettingFmtSignedMoney(Math.round(m.profit * 100) / 100)}</span>`
        + ` on ${bettingFmtMoney(Math.round(m.staked * 100) / 100)} staked`
        + ` &middot; ROI <span class="score-inline ${cls}">${roi > 0 ? '+' : ''}${Math.round(roi * 100)}%</span>`
        + ` &middot; ${m.tickets} ticket${m.tickets === 1 ? '' : 's'}`
        + (share != null && m.profit > 0 ? ` &middot; ${share}% of all profit` : '');
    });
  });
}

// Edge Stability as a calendar: one row per year, Jan-Dec across. The bar chart
// packs months shoulder to shoulder, which hides the shape of a season - Oct
// through Feb sit right next to each other as though they followed on, when
// really nothing happened for five months. A grid puts every month in its own
// place, so the gaps are as visible as the bars, and stacking the years lines
// each month up against the same month a year earlier.
function paintBettingCalendar(sim, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const byMonth = bettingMonthlyBuckets(sim);
  const keys = [...byMonth.keys()].sort();
  if (!keys.length) {
    container.innerHTML = '<div class="empty-state">No betting months yet.</div>';
    return;
  }

  const years = [...new Set(keys.map((k) => k.slice(0, 4)))].sort();
  // Shade by share of the biggest month, so intensity reads as "how much of the
  // record is this" rather than tracking ROI, which is scale-free and would
  // paint a +2% month on $50 the same as a +102% month on $260.
  const maxAbs = Math.max(...[...byMonth.values()].map((m) => Math.abs(m.profit)), 1);
  const currentKey = bettingLocalDateKey(new Date()).slice(0, 7);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const header = `<div class="bet-cal-row"><div class="bet-cal-year"></div>${monthNames
    .map((n) => `<div class="bet-cal-head">${n}</div>`).join('')}</div>`;

  const rows = years.map((yr) => {
    const cells = monthNames.map((_, i) => {
      const key = `${yr}-${String(i + 1).padStart(2, '0')}`;
      const m = byMonth.get(key);
      if (!m) return '<div class="bet-cal-cell bet-cal-empty">&middot;</div>';
      const roi = m.staked > 0 ? m.profit / m.staked : 0;
      const strength = 0.15 + 0.55 * (Math.abs(m.profit) / maxAbs);
      const rgb = m.profit >= 0 ? '139, 195, 74' : '229, 57, 63';
      const cls = m.profit > 0 ? 'good' : m.profit < 0 ? 'bad' : '';
      return `<div class="bet-cal-cell ${cls}" data-month="${key}" style="background:rgba(${rgb}, ${strength.toFixed(2)});" role="button" tabindex="0">
        <span class="bet-cal-roi">${roi > 0 ? '+' : ''}${Math.round(roi * 100)}%</span>
        <span class="bet-cal-pl">${bettingFmtCompactMoney(Math.round(m.profit))}</span>
        ${key === currentKey ? '<span class="bet-cal-now">*</span>' : ''}
      </div>`;
    }).join('');
    return `<div class="bet-cal-row"><div class="bet-cal-year">${yr}</div>${cells}</div>`;
  }).join('');

  container.innerHTML = `
    <div class="bet-cal-scroll"><div class="bet-cal">${header}${rows}</div></div>
    <div id="bettingCalendarReadout" class="pm-breakdown-hint" style="text-align:center;min-height:1.2em;">Tap a month for its full numbers. Empty cells are months with no bets.</div>`;

  const readout = document.getElementById('bettingCalendarReadout');
  const totalProfit = [...byMonth.values()].reduce((s, m) => s + m.profit, 0);
  const openCell = (cell) => {
    const key = cell.getAttribute('data-month');
    const m = byMonth.get(key);
    if (!m) return;
    container.querySelectorAll('.bet-cal-cell.selected').forEach((c) => c.classList.remove('selected'));
    cell.classList.add('selected');
    const roi = m.staked > 0 ? m.profit / m.staked : 0;
    const cls = m.profit > 0 ? 'good' : m.profit < 0 ? 'bad' : '';
    const name = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)
      .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const share = totalProfit > 0 ? Math.round((m.profit / totalProfit) * 100) : null;
    readout.innerHTML = `<strong>${name}</strong>`
      + ` &middot; <span class="score-inline ${cls}">${bettingFmtSignedMoney(Math.round(m.profit * 100) / 100)}</span>`
      + ` on ${bettingFmtMoney(Math.round(m.staked * 100) / 100)} staked`
      + ` &middot; ROI <span class="score-inline ${cls}">${roi > 0 ? '+' : ''}${Math.round(roi * 100)}%</span>`
      + ` &middot; ${m.tickets} ticket${m.tickets === 1 ? '' : 's'}`
      + (share != null && m.profit > 0 ? ` &middot; ${share}% of all profit` : '');
  };

  container.querySelectorAll('.bet-cal-cell[data-month]').forEach((cell) => {
    cell.addEventListener('click', () => openCell(cell));
    // Cells are focusable, so keyboard users get the same readout.
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCell(cell); }
    });
  });
}

/* ===================== Expanded chart modal ===================== */

function openBettingChartModal(kind) {
  const sim = currentBettingSim;
  if (!sim || !sim.ledger || sim.ledger.length < 2) return;
  const overlay = document.getElementById('bettingChartModal');
  const title = document.getElementById('bettingChartModalTitle');
  const hint = document.getElementById('bettingChartModalHint');
  if (!overlay) return;

  overlay.classList.add('active');

  if (kind === 'curve') {
    title.textContent = '📈 Bankroll Curve';
    hint.textContent = 'Drag across the curve to read any day — date, closing bankroll, that day\'s P/L and its tickets.';
    // Wider and much taller than the inline copy: the whole point of expanding
    // is that a flat-then-vertical curve is unreadable at 170px.
    paintBettingCurve(sim, [...sim.ledger].reverse(), 'bettingChartModalBody', 'bettingCurveBig', 900, 420);
  } else {
    title.textContent = '📆 Edge Stability — Monthly Calendar';
    hint.textContent = 'Each month in its own slot, years stacked. Shading is that month\'s share of the biggest month, so the gaps and the outliers both show.';
    paintBettingCalendar(sim, 'bettingChartModalBody');
  }
}

function closeBettingChartModal() {
  const overlay = document.getElementById('bettingChartModal');
  if (!overlay) return;
  overlay.classList.remove('active');
  // Drop the enlarged chart so its scrub handlers and DOM don't linger behind
  // the overlay - the next open rebuilds it from the current sim anyway.
  document.getElementById('bettingChartModalBody').innerHTML = '';
}

function initBettingChartModal() {
  const overlay = document.getElementById('bettingChartModal');
  if (!overlay) return;

  const curveBox = document.getElementById('bettingCurveBox');
  const stabilityBox = document.getElementById('bettingStabilityBox');
  if (curveBox) {
    curveBox.addEventListener('click', (e) => {
      // The inline curve is draggable, so a scrub must not also open the modal.
      // Only the box's own chrome - its label - opens it.
      if (e.target.closest('#bettingCurve')) return;
      openBettingChartModal('curve');
    });
  }
  if (stabilityBox) {
    stabilityBox.addEventListener('click', (e) => {
      // Same reasoning: tapping a bar reads that month out in place.
      if (e.target.closest('#bettingStability')) return;
      openBettingChartModal('stability');
    });
  }

  document.getElementById('bettingChartModalClose').addEventListener('click', closeBettingChartModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeBettingChartModal(); // backdrop only, not the box
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeBettingChartModal();
  });
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
    // Also record today's not-yet-stored games so the Betting page fills its
    // own slate without a Stats-page visit first.
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
      // Only the tickets actually on the slip. Pricing the locked ones too
      // would report "3 of 12 legs have moved" against a slip showing four.
      const res = await markStaleBettingPrices(bettingUnlockedTickets(currentTodaySlate.tickets));
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

// Market toggles. Every market kind belongs to exactly one sport - NBA's
// moneyline and totals are separate keys so an MLB toggle can't gate them, and
// UFC and Tennis have no market switch at all.
//
// Each chip therefore declares its owning scope, and the row only shows the
// chips that can actually affect the scope being viewed - hiding entirely on
// scopes it can't touch. Previously the MLB chips rendered on the UFC and
// Tennis scopes where they did nothing, which read as MLB markets existing for
// boxing.
const BETTING_MARKET_LABELS = {
  moneyline: '⚾ MLB Moneyline',
  nbaMoneyline: '🏀 NBA Moneyline',
  nbaTotals: '↕️ NBA Totals',
};

const BETTING_MARKET_SCOPE = {
  moneyline: 'mlb',
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

initBettingChartModal();

document.getElementById('bettingRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('bettingRefreshBtn');
  btn.disabled = true;
  try {
    await refreshBettingAndRender();
  } finally {
    btn.disabled = false;
  }
});

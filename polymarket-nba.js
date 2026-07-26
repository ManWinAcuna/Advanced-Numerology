/* ===================== NBA live Polymarket tracker ===================== */
// The NBA counterpart of polymarket-mlb.js: today's and tomorrow's open NBA
// markets with live prices, each scored by the same numerology composite the
// Stats page grades, plus the risk manager reading off NBA's own price-bucket
// track record.
//
// Recording is NOT duplicated here. recordTodaysNbaGames() in stats-nba.js is
// the single place a live NBA pick gets written, and this page calls it - so
// the tracker and the Stats page can never disagree about what was recorded or
// at what price. (stats-nba.js gates its own DOM wiring on the presence of
// statsNbaSection, so loading it here costs nothing.)

// Same helper the other trackers each define locally - a plain YYYY-MM-DD to a
// local midnight Date, which is what the compat engine expects.
function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, (m || 1) - 1, d || 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

let pmNbaCards = [];
let pmNbaStake = 10;

/* ---------- Risk manager ---------- */
// Reads NBA's own resolved history in the price bucket this pick sits in -
// never a pooled cross-sport number, since NBA composite gaps and UFC's
// one-on-one gaps live on different scales entirely.
function pmNbaRiskManagerHtml(pickName, pickPrice) {
  if (!Number.isFinite(pickPrice) || pickPrice <= 0 || pickPrice >= 1) return '';
  const payout = pmNbaStake / pickPrice;
  const profit = payout - pmNbaStake;
  const bucket = bucketForPrice(pickPrice);
  const stats = computeBucketStats(loadNbaPredictions(), NBA_REAL_EDGE_MIN_GAP);
  const stat = stats.find((b) => b.label === bucket.label) || { count: 0 };

  let flagHtml;
  if (!stat.count || stat.count < MIN_BUCKET_SAMPLE) {
    flagHtml = `<div class="pm-risk-flag unknown">📊 Not enough NBA track record yet in the ${bucket.label} range (${stat.count || 0} pick${stat.count === 1 ? '' : 's'}) to judge this one.</div>`;
  } else {
    const expectedProfit = (stat.winPct / 100) * profit - (1 - stat.winPct / 100) * pmNbaStake;
    const tier = expectedProfit > 0 ? 'good' : 'bad';
    const icon = expectedProfit > 0 ? '✅' : '⚠️';
    const verdict = expectedProfit > 0 ? 'backs this' : 'is against this';
    const sign = expectedProfit >= 0 ? '+' : '-';
    flagHtml = `<div class="pm-risk-flag ${tier}">${icon} Track record ${verdict} &mdash; NBA picks in the ${bucket.label} range have hit ${stat.winPct}% (${stat.wins}/${stat.count}), for an expected ${sign}$${Math.abs(expectedProfit).toFixed(2)} per $${pmNbaStake} bet.</div>`;
  }

  return `
    <div class="pm-risk-manager">
      <div class="pm-risk-row"><span>$${pmNbaStake} on ${escapeHtml(pickName)} at ${Math.round(pickPrice * 100)}%</span><span>pays $${payout.toFixed(2)} (${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toFixed(2)})</span></div>
      ${flagHtml}
    </div>
  `;
}

/* ---------- Card pieces ---------- */
function pmNbaBadge(card) {
  if (card.espn && card.espn.final) return '<span class="pm-countdown-badge">Final</span>';
  if (card.espn && card.espn.statusName === 'STATUS_IN_PROGRESS') return '<span class="pm-live-badge">🔴 Live / In Progress</span>';
  const t = card.game.gameStartTime.getTime();
  const now = Date.now();
  if (t <= now) return '<span class="pm-countdown-badge">Awaiting tip-off&hellip;</span>';
  const mins = Math.round((t - now) / 60000);
  const label = mins < 60 ? `${mins}m` : (mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d`);
  return `<span class="pm-countdown-badge">Starts in ${label}</span>`;
}

function pmNbaVenueLineHtml(card) {
  if (!card.espn) return '';
  const bits = [card.espn.venueName, card.espn.venueCity, card.espn.venueState].filter(Boolean);
  if (!bits.length) return '';
  const neutral = card.espn.neutralSite ? ' &middot; neutral site' : '';
  // An international game genuinely has no US state, so the state axis drops
  // out of the score rather than being guessed at - say so instead of leaving
  // the difference invisible.
  const noState = !card.espn.venueState ? ' &middot; no US state, scored on the day alone' : '';
  return `<div class="mode-desc">📍 ${escapeHtml(bits.join(', '))}${neutral}${noState}</div>`;
}

function pmNbaRotationLineHtml(card) {
  if (!card.scores) return '';
  const n = (side) => (card.scores[side] ? card.scores[side].parts.length : 0);
  return `<div class="mode-desc">👥 Scored on ${n('scoreA')} vs ${n('scoreB')} rotation players, weighted by trailing minutes</div>`;
}

function pmNbaNumerologyBlockHtml(card) {
  if (!card.espn) {
    return '<div class="pm-unmatched">Couldn\'t match this game to ESPN\'s own schedule yet &mdash; try refreshing in a bit.</div>';
  }
  if (!card.scores) {
    return '<div class="pm-unmatched">⏳ Not enough rotation form on record for one of these teams yet &mdash; run the Backfill on the Stats page, or check back once more of their games have been tracked.</div>';
  }
  const { scoreA, scoreB } = card.scores;
  const g = card.game;
  const gap = Math.abs(scoreA.combined - scoreB.combined);
  const numFav = scoreA.combined >= scoreB.combined ? g.teamAName : g.teamBName;
  const marketFav = (g.priceA != null && g.priceB != null)
    ? (g.priceA >= g.priceB ? g.teamAName : g.teamBName)
    : null;
  const agree = marketFav && normalizeName(marketFav) === normalizeName(numFav);

  const signal = gap < NBA_REAL_EDGE_MIN_GAP
    ? `<div class="pm-signal neutral">⚖️ Too close to call (${scoreA.combined} vs ${scoreB.combined}) &mdash; no real numerology edge on this one</div>`
    : `<div class="pm-signal ${agree ? 'agree' : 'disagree'}">${agree
      ? `✅ Numerology agrees with the market favorite &mdash; ${escapeHtml(numFav)}`
      : `⚡ Numerology takes the underdog &mdash; ${escapeHtml(numFav)}`}</div>`;

  const pickPrice = marketFav
    ? (normalizeName(numFav) === normalizeName(g.teamAName) ? g.priceA : g.priceB)
    : null;

  return `
    <div class="pm-numerology-clickable" data-condition-id="${g.conditionId}">
      <div class="pm-edge-line">🔢 Numerology Edge: <span class="score-inline ${scoreClass(scoreA.combined)}">${escapeHtml(g.teamAName)} ${scoreA.combined}</span> vs <span class="score-inline ${scoreClass(scoreB.combined)}">${escapeHtml(g.teamBName)} ${scoreB.combined}</span></div>
      ${signal}
      <div class="pm-breakdown-hint">Tap for the full rotation breakdown &rarr;</div>
    </div>
    ${gap >= NBA_REAL_EDGE_MIN_GAP && pickPrice != null ? pmNbaRiskManagerHtml(numFav, pickPrice) : ''}
  `;
}

function pmNbaBreakdownColumnHtml(teamName, score) {
  return `
    <div class="pm-breakdown-col">
      <div class="pm-breakdown-name">${escapeHtml(teamName)}</div>
      ${score.parts.map((p) => `<div class="pm-breakdown-row"><span>${escapeHtml(p.role)}</span><span class="score-inline ${scoreClass(p.score.combined)}">${p.score.combined}</span></div>`).join('')}
      <div class="pm-breakdown-row pm-breakdown-total"><span>Minutes-weighted</span><span class="score-inline ${scoreClass(score.combined)}">${score.combined}</span></div>
    </div>
  `;
}

function pmNbaCardHtml(card) {
  const g = card.game;
  const pctA = g.priceA != null ? Math.round(g.priceA * 100) : null;
  const pctB = g.priceB != null ? Math.round(g.priceB * 100) : null;
  const favA = pctA != null && pctB != null && pctA >= pctB;

  return `
    <div class="box pm-fight-card" id="pm-nba-card-${g.conditionId}">
      <div class="pm-fight-head">
        <div class="pm-fight-names">${escapeHtml(g.teamAName)} vs ${escapeHtml(g.teamBName)}</div>
        ${pmNbaBadge(card)}
      </div>
      <div class="pm-odds-row">
        <div class="pm-odds-pill ${favA ? 'favorite' : ''}">
          <div class="pm-odds-name">${escapeHtml(g.teamAName)}</div>
          <div class="pm-odds-pct">${pctA != null ? `${pctA}%` : '—'}</div>
        </div>
        <div class="pm-odds-pill ${!favA && pctB != null ? 'favorite' : ''}">
          <div class="pm-odds-name">${escapeHtml(g.teamBName)}</div>
          <div class="pm-odds-pct">${pctB != null ? `${pctB}%` : '—'}</div>
        </div>
      </div>
      ${pmNbaVenueLineHtml(card)}
      ${pmNbaRotationLineHtml(card)}
      <div class="pm-numerology">${pmNbaNumerologyBlockHtml(card)}</div>
    </div>
  `;
}

function renderPmNbaCards() {
  const container = document.getElementById('pmNbaGamesContainer');
  if (!pmNbaCards.length) {
    container.innerHTML = '<div class="empty-state">No upcoming NBA games found on Polymarket right now. The NBA regular season runs from October to April &mdash; outside it there are no per-game markets to track.</div>';
    return;
  }
  container.innerHTML = pmNbaCards
    .slice()
    .sort((a, b) => a.game.gameStartTime - b.game.gameStartTime)
    .map(pmNbaCardHtml)
    .join('');
}

/* ---------- Load ---------- */
async function loadPmNba() {
  const games = await fetchNbaMoneylineEvents();
  const form = loadNbaPlayerForm();
  const birthdates = loadNbaBirthdates();

  // Open markets span today and the next couple of days, so the slate is
  // fetched for each distinct ET date rather than today's only.
  const dates = [...new Set(games.map((g) => nbaEasternDateISO(g.gameStartTime)).filter(Boolean))];
  const slates = {};
  for (const date of dates) slates[date] = await fetchNbaScoreboard(date);

  const withDobs = (list) => list.map((p) => ({
    ...p,
    birthDate: p.birthDate || (birthdates[p.id] ? birthdates[p.id].birthDate : null),
  }));

  pmNbaCards = games.map((game) => {
    const date = nbaEasternDateISO(game.gameStartTime);
    const slate = slates[date] || [];
    const espn = slate.find((s) => {
      const a = normalizeName(game.teamAName);
      const b = normalizeName(game.teamBName);
      const home = normalizeName(s.home.nickname);
      const away = normalizeName(s.away.nickname);
      return (home === a && away === b) || (home === b && away === a);
    }) || null;

    let scores = null;
    if (espn) {
      const matchDate = parseDateInput(date);
      const stateInfo = nbaVenueStateInfo(espn.venueState);
      const stateDate = stateInfo && stateInfo.founded ? parseDateInput(stateInfo.founded) : null;
      const compHome = computeNbaSideComposite(withDobs(nbaExpectedRotation(form, espn.home.abbr, date)), matchDate, null, stateDate, espn.home.abbr);
      const compAway = computeNbaSideComposite(withDobs(nbaExpectedRotation(form, espn.away.abbr, date)), matchDate, null, stateDate, espn.away.abbr);
      if (compHome && compAway) {
        const aIsHome = normalizeName(game.teamAName) === normalizeName(espn.home.nickname);
        scores = {
          scoreA: aIsHome ? compHome : compAway,
          scoreB: aIsHome ? compAway : compHome,
        };
      }
    }
    return { game, espn, scores };
  });

  renderPmNbaCards();
  document.getElementById('pmNbaLastUpdated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/* ---------- Wiring ---------- */
document.getElementById('pmNbaGamesContainer').addEventListener('click', (e) => {
  const el = e.target.closest('.pm-numerology-clickable');
  if (!el) return;
  const card = pmNbaCards.find((c) => String(c.game.conditionId) === el.dataset.conditionId);
  if (!card || !card.scores) return;
  document.getElementById('pmNbaBreakdownBody').innerHTML = `
    <div class="score-names">${escapeHtml(card.game.teamAName)} vs ${escapeHtml(card.game.teamBName)}</div>
    <div class="pm-breakdown-hint">Each player's score is their numerology against the game date and the venue's state, and their weight is their trailing average minutes &mdash; so the combined number leans on whoever actually plays.</div>
    <div class="pm-breakdown-grid">
      ${pmNbaBreakdownColumnHtml(card.game.teamAName, card.scores.scoreA)}
      ${pmNbaBreakdownColumnHtml(card.game.teamBName, card.scores.scoreB)}
    </div>
  `;
  document.getElementById('pmNbaBreakdownOverlay').classList.add('active');
});

document.getElementById('pmNbaBreakdownClose').addEventListener('click', () => {
  document.getElementById('pmNbaBreakdownOverlay').classList.remove('active');
});

document.getElementById('pmNbaBreakdownOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});

document.getElementById('pmNbaStakeInput').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  pmNbaStake = Number.isFinite(v) && v > 0 ? v : 10;
  renderPmNbaCards();
});

document.getElementById('pmNbaRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('pmNbaRefreshBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Refreshing…';
  try {
    await loadPmNba();
  } catch (e) {
    console.error('NBA tracker refresh failed', e);
  }
  btn.textContent = original;
  btn.disabled = false;
});

// Gate the first load on the IndexedDB cache being warm, or the form store
// reads empty and every game would render as "awaiting rotation form".
bigStoreReadyPromise.then(async () => {
  try {
    await loadPmNba();
    // Persist today's picks through the one recorder that owns that job.
    await recordTodaysNbaGames();
  } catch (e) {
    console.error('NBA tracker load failed', e);
    document.getElementById('pmNbaGamesContainer').innerHTML =
      `<div class="empty-state">Couldn't load the NBA slate: ${escapeHtml(e && e.message ? e.message : String(e))}</div>`;
  }
});

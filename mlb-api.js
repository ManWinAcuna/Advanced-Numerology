/* ===================== MLB data sources ===================== */
// Two independent live sources, same role Polymarket's Gamma API plays alone
// for UFC/Tennis: Polymarket for the moneyline odds (checked live during
// planning - tag_slug=mlb events/keyset does carry real per-game moneyline
// markets, not just season-long futures), and MLB's own public Stats API
// for everything about the game itself (probable pitcher, lineups, player
// birthdates, franchise founding year, current manager, venue address, and
// final score) - confirmed CORS-open by fetching it directly from the
// deployed site's own origin. Nothing here is a hand-maintained dataset;
// every call asks live what's true for THIS specific game, so a trade,
// call-up, injury, or mid-season manager change is reflected automatically
// on the next fetch rather than needing this app to keep a roster in sync.

const MLB_STATS_BASE = 'https://statsapi.mlb.com/api/v1';
const MLB_STATS_BASE_V11 = 'https://statsapi.mlb.com/api/v1.1';
const MLB_MONEYLINE_EVENTS_URL = 'https://gamma-api.polymarket.com/events/keyset?tag_slug=mlb&closed=false&limit=100';

function parseMlbGameStart(raw) {
  if (!raw) return null;
  const iso = raw.replace(' ', 'T').replace(/\+00$/, 'Z').replace(/\+00:00$/, 'Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// Same shape as fetchUfcEvents()/parseMarket() in polymarket-ufc.js, just
// pointed at MLB's tag and named teamA/teamB instead of fighterA/fighterB.
async function fetchMlbMoneylineEvents() {
  try {
    const res = await fetch(MLB_MONEYLINE_EVENTS_URL);
    if (!res.ok) return [];
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const games = [];
    events.forEach((ev) => {
      (ev.markets || []).forEach((m) => {
        if (m.sportsMarketType !== 'moneyline') return;
        if (m.closed || m.active === false) return;
        let outcomes = [];
        let prices = [];
        try { outcomes = JSON.parse(m.outcomes); } catch (e) { /* leave empty */ }
        try { prices = JSON.parse(m.outcomePrices).map(Number); } catch (e) { /* leave empty */ }
        const gameStartTime = parseMlbGameStart(m.gameStartTime);
        if (!outcomes[0] || !outcomes[1] || !gameStartTime) return;
        games.push({
          conditionId: m.conditionId,
          teamAName: outcomes[0],
          teamBName: outcomes[1],
          priceA: Number.isFinite(prices[0]) ? prices[0] : null,
          priceB: Number.isFinite(prices[1]) ? prices[1] : null,
          gameStartTime,
          eventTitle: ev.title,
        });
      });
    });
    return games;
  } catch (e) {
    return [];
  }
}

// MLB's schedule endpoint for a date range, hydrated with each game's
// probable pitchers, venue, and full team info (abbreviation - needed to
// construct a Polymarket event slug for the historical backfill; without
// this hydration a team is just {id, name, link}). Doubleheaders mean team
// names alone don't uniquely identify a game - findScheduleGameForMarket
// below breaks the tie by whichever candidate's start time is closest to
// Polymarket's.
async function fetchMlbSchedule(startDateISO, endDateISO) {
  const url = `${MLB_STATS_BASE}/schedule?sportId=1&startDate=${startDateISO}&endDate=${endDateISO}&hydrate=probablePitcher,venue,team`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const games = [];
    (data.dates || []).forEach((d) => (d.games || []).forEach((g) => games.push(g)));
    return games;
  } catch (e) {
    return [];
  }
}

// normalizeName() lives in db-core.js (shared with fighter/player matching).
function findScheduleGameForMarket(scheduleGames, teamAName, teamBName, gameStartTime) {
  const a = normalizeName(teamAName);
  const b = normalizeName(teamBName);
  const candidates = scheduleGames.filter((g) => {
    const home = normalizeName(g.teams.home.team.name);
    const away = normalizeName(g.teams.away.team.name);
    return (home === a && away === b) || (home === b && away === a);
  });
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  candidates.sort((x, y) => Math.abs(new Date(x.gameDate) - gameStartTime) - Math.abs(new Date(y.gameDate) - gameStartTime));
  return candidates[0];
}

// The live/boxscore feed - the one call that covers the full lineup (with
// position, so the catcher is self-identifying), the actual starting
// pitcher, the venue, and (once the game's done) the final score. battingOrder
// is empty until MLB posts the official lineup, which is the caller's signal
// to show a "not posted yet" pending state rather than a partial score.
async function fetchGameLiveFeed(gamePk) {
  try {
    const res = await fetch(`${MLB_STATS_BASE_V11}/game/${gamePk}/feed/live`);
    if (!res.ok) return null;
    const data = await res.json();
    const box = data.liveData.boxscore.teams;
    const linescore = data.liveData.linescore;
    const teams = data.gameData.teams;
    const status = data.gameData.status || {};

    function sideInfo(sideKey) {
      const side = box[sideKey];
      const players = side.players || {};
      const batters = (side.battingOrder || []).map((pid) => {
        const p = players[`ID${pid}`];
        return p ? { id: pid, name: p.person.fullName, pos: p.position.abbreviation } : null;
      }).filter(Boolean);
      const startingPitcherId = (side.pitchers || [])[0] || null;
      const pitcherPlayer = startingPitcherId ? players[`ID${startingPitcherId}`] : null;
      const pitcherStats = pitcherPlayer && pitcherPlayer.stats && pitcherPlayer.stats.pitching;
      const runs = linescore && linescore.teams && linescore.teams[sideKey] ? linescore.teams[sideKey].runs : null;
      return {
        teamId: teams[sideKey].id,
        teamName: teams[sideKey].name,
        startingPitcherId,
        startingPitcherName: pitcherPlayer ? pitcherPlayer.person.fullName : null,
        startingPitcherStrikeouts: pitcherStats && Number.isFinite(pitcherStats.strikeOuts) ? pitcherStats.strikeOuts : null,
        batters,
        runs: Number.isFinite(runs) ? runs : null,
      };
    }

    return {
      gamePk,
      venue: data.gameData.venue || null,
      officialDate: data.gameData.datetime ? data.gameData.datetime.officialDate : null,
      abstractGameState: status.abstractGameState || null, // 'Preview' | 'Live' | 'Final'
      detailedState: status.detailedState || null,
      away: sideInfo('away'),
      home: sideInfo('home'),
    };
  } catch (e) {
    return null;
  }
}

// One batched call for a whole lineup's birthdates - the same trick already
// used for Polymarket's condition_ids, confirmed against real MLB ids during
// planning. Safe to call with a mixed bag of player AND manager ids.
async function fetchPeopleBirthdates(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  try {
    const res = await fetch(`${MLB_STATS_BASE}/people?personIds=${unique.join(',')}`);
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map();
    (data.people || []).forEach((p) => map.set(p.id, { name: p.fullName, birthDate: p.birthDate || null }));
    return map;
  } catch (e) {
    return new Map();
  }
}

// Franchise founding year (the entity score's "birthdate") and current home
// venue - both straight from MLB's own team record, no dataset to maintain.
async function fetchTeamInfo(teamId) {
  try {
    const res = await fetch(`${MLB_STATS_BASE}/teams/${teamId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const t = data.teams && data.teams[0];
    if (!t) return null;
    return { id: t.id, name: t.name, firstYearOfPlay: t.firstYearOfPlay || null, venue: t.venue || null };
  } catch (e) {
    return null;
  }
}

// Current field manager - fetched fresh per team rather than stored, so a
// mid-season firing/hire shows up on the very next load with no update
// needed on this app's side.
async function fetchTeamManager(teamId, season) {
  try {
    const res = await fetch(`${MLB_STATS_BASE}/teams/${teamId}/coaches?season=${season}`);
    if (!res.ok) return null;
    const data = await res.json();
    const mgr = (data.roster || []).find((c) => c.job === 'Manager');
    return mgr ? { id: mgr.person.id, name: mgr.person.fullName } : null;
  } catch (e) {
    return null;
  }
}

// The venue's real street address, including US state - lets the state
// (region) factor resolve automatically from the game itself, the same way
// the stadium already does, instead of asking the user to pick one like
// UFC/Tennis have to (Polymarket gives those sports no venue data at all;
// MLB's own schedule already knows exactly where every game is).
async function fetchVenueLocation(venueId) {
  try {
    const res = await fetch(`${MLB_STATS_BASE}/venues/${venueId}?hydrate=location`);
    if (!res.ok) return null;
    const data = await res.json();
    const v = data.venues && data.venues[0];
    const loc = v && v.location;
    if (!loc) return null;
    return { city: loc.city || null, state: loc.state || null, country: loc.country || null };
  } catch (e) {
    return null;
  }
}

// Season-average strikeout rate at the moment a pick is recorded - the
// baseline the pitcher-strikeout research signal compares tonight's actual
// count against. Returns null before a pitcher's first start of the season
// (no rate to compare against yet).
async function fetchPitcherSeasonStats(personId, season) {
  try {
    const res = await fetch(`${MLB_STATS_BASE}/people/${personId}/stats?stats=season&group=pitching&season=${season}`);
    if (!res.ok) return null;
    const data = await res.json();
    const split = data.stats && data.stats[0] && data.stats[0].splits && data.stats[0].splits[0];
    const stat = split && split.stat;
    if (!stat || !stat.gamesStarted) return null;
    return {
      strikeOuts: stat.strikeOuts,
      gamesStarted: stat.gamesStarted,
      strikeoutsPerStart: stat.strikeOuts / stat.gamesStarted,
    };
  } catch (e) {
    return null;
  }
}

/* ===================== Historical backfill (Stats page, MLB only) ===================== */
// Three helpers that let the Stats page reconstruct already-played games
// instead of only ever recording new ones live. Confirmed live during
// planning: MLB's own gameLog endpoint keeps every start with its own date,
// so a pitcher's "season average as of that start" can be rebuilt for any
// past date; and Polymarket's CLOB price-history endpoint still returns a
// market's full pre-resolution price series after it's closed, even though
// Gamma's own closed-event outcomePrices collapse to the final 0/1 result.

// Same shape fetchPitcherSeasonStats returns, but reconstructed as of a
// specific historical date instead of "right now" - sums strikeouts and
// start-counts only from starts strictly before beforeDateISO, so a
// backfilled pick is graded against the baseline the pitcher actually had
// at the time, not one inflated by starts that hadn't happened yet.
async function fetchMlbGameLogBeforeDate(personId, season, beforeDateISO) {
  try {
    const res = await fetch(`${MLB_STATS_BASE}/people/${personId}/stats?stats=gameLog&group=pitching&season=${season}`);
    if (!res.ok) return null;
    const data = await res.json();
    const splits = (data.stats && data.stats[0] && data.stats[0].splits) || [];
    const prior = splits.filter((s) => s.date < beforeDateISO);
    const gamesStarted = prior.reduce((sum, s) => sum + (s.stat.gamesStarted || 0), 0);
    if (!gamesStarted) return null;
    const strikeOuts = prior.reduce((sum, s) => sum + (s.stat.strikeOuts || 0), 0);
    return { strikeOuts, gamesStarted, strikeoutsPerStart: strikeOuts / gamesStarted };
  } catch (e) {
    return null;
  }
}

// A closed game's moneyline market, looked up directly by its predictable
// slug ("mlb-{awayAbbr}-{homeAbbr}-{officialDate}", all lowercase) instead of
// paging through Gamma's closed-events feed - confirmed live that paging is
// unreliable for this: closed events are ordered by an internal startDate
// that turned out to be each market's own creation time (evidently
// bulk-created well ahead of the actual games, since it stayed frozen at one
// timestamp across 40+ pages), not the game's real date, so there's no
// trustworthy cutoff to page toward. The slug, by contrast, is exactly what
// the live tracker already has on hand once it's found a game on MLB's own
// schedule (team abbreviation + officialDate), so this is one direct lookup
// per game instead of scanning thousands of unrelated markets. Returns null
// for a doubleheader's second game too - the slug has no game-number suffix,
// so a day with two games for the same matchup can't be disambiguated and is
// skipped rather than risking a wrong match.
async function fetchMlbMoneylineEventForGame(awayAbbr, homeAbbr, officialDate) {
  const slug = `mlb-${awayAbbr.toLowerCase()}-${homeAbbr.toLowerCase()}-${officialDate}`;
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
    if (!res.ok) return null;
    const data = await res.json();
    const ev = Array.isArray(data) ? data[0] : null;
    if (!ev) return null;
    const m = (ev.markets || []).find((mk) => mk.sportsMarketType === 'moneyline');
    if (!m) return null;
    let outcomes = [];
    let clobTokenIds = [];
    try { outcomes = JSON.parse(m.outcomes); } catch (e) { /* leave empty */ }
    try { clobTokenIds = JSON.parse(m.clobTokenIds); } catch (e) { /* leave empty */ }
    const gameStartTime = parseMlbGameStart(m.gameStartTime);
    if (!outcomes[0] || !outcomes[1] || !gameStartTime || clobTokenIds.length < 2) return null;
    return {
      conditionId: m.conditionId,
      teamAName: outcomes[0],
      teamBName: outcomes[1],
      gameStartTime,
      clobTokenIdA: clobTokenIds[0],
      clobTokenIdB: clobTokenIds[1],
      eventTitle: ev.title,
    };
  } catch (e) {
    return null;
  }
}

// The market's price at (or just before) a target time, straight from the
// CLOB's own price-history - the only place a resolved market's pre-game
// price still lives, used as the "price at pick time" stand-in since a
// backfilled game was never actually seen live. history is ordered oldest to
// newest (confirmed live); returns null if the market has no history at all
// (shouldn't happen for anything that actually traded) or if every point
// comes after the target (the whole series started after the target time).
//
// interval=max does NOT mean "since market creation" the way it sounds -
// confirmed live it silently returns an empty history for anything roughly
// a month or older, even though the same market's data is still there and
// fully queryable with explicit startTs/endTs. An MLB moneyline market is
// only ever created a day or two before its game (never weeks out), so a
// 7-day lookback is a generous, safe window that reliably covers the whole
// pregame trading period regardless of how old the game itself is - this is
// what makes backfilling further back than ~a month actually work at all.
async function fetchClobPriceNear(clobTokenId, targetTimestampSec) {
  try {
    const startTs = targetTimestampSec - 7 * 24 * 3600;
    const res = await fetch(`https://clob.polymarket.com/prices-history?market=${clobTokenId}&startTs=${startTs}&endTs=${targetTimestampSec}`);
    if (!res.ok) return null;
    const data = await res.json();
    const history = Array.isArray(data.history) ? data.history : [];
    if (!history.length) return null;
    let best = null;
    for (const point of history) {
      if (point.t > targetTimestampSec) break;
      best = point;
    }
    return best ? best.p : null;
  } catch (e) {
    return null;
  }
}

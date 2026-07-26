/* ===================== NBA data sources ===================== */
// Same two-source split MLB uses: Polymarket's Gamma API for the odds, and a
// league-adjacent API for everything about the game itself. The difference is
// which API - the NBA's own endpoints are not usable from a browser (checked
// live: cdn.nba.com returns 403, stats.nba.com hangs with no CORS header at
// all), so ESPN's public site API stands in. Confirmed live from this origin:
// site.api.espn.com, site.web.api.espn.com and gamma-api.polymarket.com all
// return access-control-allow-origin: *.
//
// What ESPN gives us, all verified live rather than assumed:
//   - scoreboard?dates=YYYYMMDD  -> the slate, final scores, venue + state,
//     neutralSite flag, and the event id. Enough that a completed game needs
//     no second call for anything at the game level.
//   - summary?event=ID           -> the per-player boxscore, with a starter
//     flag and actual minutes played.
//   - teams/{id}/roster          -> current roster with dateOfBirth on every
//     athlete, in ISO form.
//   - common/v3/.../athletes/{id} -> displayDOB for any athlete by id, which
//     is how a player who has since left the league still resolves during a
//     historical backfill (they appear on no current roster).
//
// What ESPN does NOT give, and why the model is players-only: the roster's
// coach block carries a name and id but no birth date, and that id only
// resolves to a DOB when the coach happens to be a former NBA player - 10 of
// 30 when checked live. Worse, the offseason coach block is not even
// self-consistent (two teams reported the same coach id). MLB's manager
// component carries 45% of that model, but it was fit to baseball, and there
// is no honest way to port it here without the data. So NBA scores players
// only, and if a coach component is ever added it gets measured forward from
// the day it ships rather than backfitted. See NBA_ROLE_WEIGHTS in db-core.js.

const NBA_ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const NBA_ESPN_ATHLETE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
const NBA_MONEYLINE_EVENTS_URL = 'https://gamma-api.polymarket.com/events/keyset?tag_slug=nba&closed=false&limit=100';

// Polymarket has no NBA markets before this date - confirmed by paging its
// closed NBA events oldest-first, which bottoms out on the 2024-25 opening
// night slate. Games earlier than this can still be scored and graded from
// ESPN, they just have no price to bet against, so the backfill starts here.
const NBA_POLYMARKET_FIRST_DATE = '2024-10-21';

/* ---------- Polymarket slug construction ---------- */
// A closed game's markets are fetched by predictable slug
// ("nba-{away}-{home}-{date}") rather than by paging closed events, for the
// same reason the MLB backfill does it: Gamma orders closed events by an
// internal creation timestamp, not the game date, so there is no cutoff to
// page toward.
//
// Two wrinkles, both found by scanning 900 real NBA events rather than
// guessing, because a wrong code silently drops a whole team's season:
//
// 1. Polymarket's code differs from ESPN's abbreviation for six teams. Every
//    other team matches exactly.
// 2. Two teams have a rare SECOND code - the Suns appeared as 'pho' once
//    against 60 'phx', the Wizards as 'wsh' once against 56 'was'. One-off
//    inconsistencies on Polymarket's side, so the lookup tries the primary
//    code first and falls back to the alternate rather than losing the game.
const NBA_ABBR_TO_POLYMARKET_SLUG = {
  GS: 'gsw', NO: 'nop', NY: 'nyk', SA: 'sas', UTAH: 'uta', WSH: 'was',
};

const NBA_POLYMARKET_SLUG_ALTERNATES = {
  PHX: ['pho'],
  WSH: ['wsh'],
};

function nbaPolymarketSlugCodes(espnAbbr) {
  const primary = NBA_ABBR_TO_POLYMARKET_SLUG[espnAbbr] || String(espnAbbr || '').toLowerCase();
  return [primary, ...(NBA_POLYMARKET_SLUG_ALTERNATES[espnAbbr] || [])];
}

// All-Star weekend exhibitions share the nba tag and the same slug shape
// (nba-crs-cgs-...), with rosters that are drafted for the night and mean
// nothing for prediction. Excluded by team code, since these four "teams"
// exist only for that event.
const NBA_EXHIBITION_SLUG_CODES = new Set(['crs', 'cgs', 'kys', 'sog']);

function isNbaExhibitionSlug(slug) {
  const m = /^nba-([a-z]{2,4})-([a-z]{2,4})-/.exec(String(slug || ''));
  if (!m) return false;
  return NBA_EXHIBITION_SLUG_CODES.has(m[1]) || NBA_EXHIBITION_SLUG_CODES.has(m[2]);
}

/* ---------- Date helpers ---------- */
// Polymarket's slug date and ESPN's scoreboard date are both the game's US
// Eastern calendar date, not its UTC date - verified on games whose UTC start
// rolls past midnight (a 22:00 ET tip is 02:00 UTC the next day, and both
// sources still file it under the ET date). Using the UTC date would misfile
// every late game by one day, so ET is derived explicitly here.
function nbaEasternDateISO(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  // en-CA formats as YYYY-MM-DD, which is exactly the shape both APIs want.
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function nbaScoreboardDateParam(dateISO) {
  return String(dateISO || '').replace(/-/g, '');
}

function nbaShiftDateISO(dateISO, days) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Polymarket's gameStartTime arrives as "2024-10-22 23:30:00+00" - a space
// instead of T and a bare +00 offset, neither of which Date parses reliably.
function parseNbaGameStart(raw) {
  if (!raw) return null;
  const iso = String(raw).replace(' ', 'T').replace(/\+00$/, 'Z').replace(/\+00:00$/, 'Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// ESPN's athlete endpoint reports birth dates as displayDOB in D/M/YYYY -
// day first, confirmed unambiguously by a player whose day-of-month exceeds
// 12 (LeBron James reads 30/12/1984). Returns the ISO date the numerology
// engine expects, or null if the string is not that shape - never a guess.
function parseEspnDisplayDob(displayDOB) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(displayDOB || '').trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!day || !month || month > 12 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The roster endpoint's own dateOfBirth is already ISO with a time suffix
// ("2004-11-21T08:00Z"); only the date half is meaningful for numerology.
function parseEspnRosterDob(dateOfBirth) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(dateOfBirth || ''));
  return m ? m[1] : null;
}

/* ---------- Polymarket market parsing ---------- */
// Flattens one two-outcome market (a moneyline's team pair, a totals line's
// Over/Under, a prop's Yes/No) into the fields the tracking needs. Mirrors
// parseMlbSideMarket rather than importing it, because the NBA pages do not
// load mlb-api.js - the same per-sport duplication polymarket-ufc.js and
// polymarket-tennis.js already use for their own parseMarket.
function parseNbaSideMarket(m) {
  if (!m) return null;
  let outcomes = [];
  let prices = [];
  let clobTokenIds = [];
  try { outcomes = JSON.parse(m.outcomes); } catch (e) { /* leave empty */ }
  try { prices = JSON.parse(m.outcomePrices).map(Number); } catch (e) { /* leave empty */ }
  try { clobTokenIds = JSON.parse(m.clobTokenIds); } catch (e) { /* leave empty */ }
  if (!outcomes[0] || !outcomes[1]) return null;
  return {
    conditionId: m.conditionId,
    outcomeA: outcomes[0],
    outcomeB: outcomes[1],
    priceA: Number.isFinite(prices[0]) ? prices[0] : null,
    priceB: Number.isFinite(prices[1]) ? prices[1] : null,
    clobTokenIdA: clobTokenIds[0] || null,
    clobTokenIdB: clobTokenIds[1] || null,
    line: m.line != null && Number.isFinite(Number(m.line)) ? Number(m.line) : null,
    closed: !!m.closed,
  };
}

// Season-long futures ("Which conference wins NBA Finals?", "#1 seed") carry
// the same nba tag as games but leave sportsMarketType null, so anything
// untyped is skipped rather than mistaken for a game market.
function nbaTypedMarkets(ev, type) {
  return (ev.markets || []).filter((m) => m && m.sportsMarketType === type);
}

function extractNbaTotalsMarkets(ev) {
  return nbaTypedMarkets(ev, 'totals')
    .map(parseNbaSideMarket)
    .filter((t) => t && t.line != null);
}

// Player props. The market question carries the player and the stat
// ("Victor Wembanyama: Points O/U 27.5") and the numeric threshold is also on
// the market's own `line` field, so the name is taken from the text before
// the colon and the line is never parsed out of prose.
const NBA_PROP_MARKET_TYPES = { points: 'points', rebounds: 'rebounds', assists: 'assists' };

function extractNbaPropMarkets(ev) {
  const props = [];
  Object.keys(NBA_PROP_MARKET_TYPES).forEach((type) => {
    nbaTypedMarkets(ev, type).forEach((raw) => {
      const parsed = parseNbaSideMarket(raw);
      if (!parsed || parsed.line == null) return;
      const question = String(raw.question || '');
      const colon = question.indexOf(':');
      if (colon <= 0) return;
      const playerName = question.slice(0, colon).trim();
      if (!playerName) return;
      props.push({ ...parsed, stat: type, playerName });
    });
  });
  return props;
}

/* ---------- Live (upcoming) games from Polymarket ---------- */
async function fetchNbaMoneylineEvents() {
  try {
    const res = await fetch(NBA_MONEYLINE_EVENTS_URL);
    if (!res.ok) return [];
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const games = [];
    events.forEach((ev) => {
      if (isNbaExhibitionSlug(ev.slug)) return;
      const totalsMarkets = extractNbaTotalsMarkets(ev);
      const propMarkets = extractNbaPropMarkets(ev);
      nbaTypedMarkets(ev, 'moneyline').forEach((m) => {
        if (m.closed || m.active === false) return;
        let outcomes = [];
        let prices = [];
        let clobTokenIds = [];
        try { outcomes = JSON.parse(m.outcomes); } catch (e) { /* leave empty */ }
        try { prices = JSON.parse(m.outcomePrices).map(Number); } catch (e) { /* leave empty */ }
        try { clobTokenIds = JSON.parse(m.clobTokenIds); } catch (e) { /* leave empty */ }
        const gameStartTime = parseNbaGameStart(m.gameStartTime);
        if (!outcomes[0] || !outcomes[1] || !gameStartTime) return;
        games.push({
          conditionId: m.conditionId,
          teamAName: outcomes[0],
          teamBName: outcomes[1],
          priceA: Number.isFinite(prices[0]) ? prices[0] : null,
          priceB: Number.isFinite(prices[1]) ? prices[1] : null,
          clobTokenIdA: clobTokenIds[0] || null,
          clobTokenIdB: clobTokenIds[1] || null,
          gameStartTime,
          eventTitle: ev.title,
          eventSlug: ev.slug,
          totalsMarkets,
          propMarkets,
        });
      });
    });
    return games;
  } catch (e) {
    return [];
  }
}

// One closed game's event, by slug. Tries each team-code combination (for the
// two teams with a rare alternate) and, if all of those miss, the neighbouring
// dates - a guard against an ET-date edge case rather than an expected path,
// which is why it only runs after the direct lookup has already failed.
async function fetchNbaEventForGame(awayAbbr, homeAbbr, etDateISO) {
  const awayCodes = nbaPolymarketSlugCodes(awayAbbr);
  const homeCodes = nbaPolymarketSlugCodes(homeAbbr);
  const dates = [etDateISO, nbaShiftDateISO(etDateISO, 1), nbaShiftDateISO(etDateISO, -1)].filter(Boolean);

  for (const date of dates) {
    for (const away of awayCodes) {
      for (const home of homeCodes) {
        const slug = `nba-${away}-${home}-${date}`;
        try {
          const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
          if (!res.ok) continue;
          const data = await res.json();
          const ev = Array.isArray(data) ? data[0] : null;
          if (!ev) continue;
          const m = nbaTypedMarkets(ev, 'moneyline')[0];
          if (!m) continue;
          let outcomes = [];
          let clobTokenIds = [];
          try { outcomes = JSON.parse(m.outcomes); } catch (e) { /* leave empty */ }
          try { clobTokenIds = JSON.parse(m.clobTokenIds); } catch (e) { /* leave empty */ }
          const gameStartTime = parseNbaGameStart(m.gameStartTime);
          if (!outcomes[0] || !outcomes[1] || !gameStartTime || clobTokenIds.length < 2) continue;
          return {
            conditionId: m.conditionId,
            teamAName: outcomes[0],
            teamBName: outcomes[1],
            gameStartTime,
            clobTokenIdA: clobTokenIds[0],
            clobTokenIdB: clobTokenIds[1],
            eventTitle: ev.title,
            eventSlug: ev.slug,
            totalsMarkets: extractNbaTotalsMarkets(ev),
            propMarkets: extractNbaPropMarkets(ev),
          };
        } catch (e) {
          /* try the next candidate */
        }
      }
    }
  }
  return null;
}

// A resolved market's pre-game price, from the CLOB's own price history -
// Gamma collapses a closed market's outcomePrices to the 0/1 result, so this
// is the only place the price a bet would actually have been taken at still
// lives. Same 7-day lookback the MLB backfill uses: interval=max silently
// returns nothing for anything older than roughly a month, while explicit
// startTs/endTs keeps working, and an NBA game market is only created days
// before tip-off so a week covers the whole pregame window.
async function fetchNbaClobPriceNear(clobTokenId, targetTimestampSec) {
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

/* ---------- ESPN: the slate ---------- */
// Everything about a game except the player boxscore, in one call per date.
// A finished game needs no follow-up for its result: the scoreboard already
// carries both final scores, so totals and moneyline both resolve from here.
async function fetchNbaScoreboard(dateISO) {
  try {
    const res = await fetch(`${NBA_ESPN_SITE}/scoreboard?dates=${nbaScoreboardDateParam(dateISO)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const games = [];
    (data.events || []).forEach((ev) => {
      const comp = (ev.competitions || [])[0];
      if (!comp) return;
      const competitors = comp.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      if (!home || !away) return;
      const startTime = new Date(ev.date);
      const venue = comp.venue || {};
      const address = venue.address || {};
      const statusName = ((ev.status || {}).type || {}).name || null;
      const homeScore = Number(home.score);
      const awayScore = Number(away.score);
      games.push({
        eventId: ev.id,
        startTime: isNaN(startTime.getTime()) ? null : startTime,
        etDate: nbaEasternDateISO(startTime),
        shortName: ev.shortName || null,
        statusName,
        final: statusName === 'STATUS_FINAL',
        neutralSite: !!comp.neutralSite,
        venueName: venue.fullName || null,
        // Only present for US arenas; an international game (Berlin, Mexico
        // City, Paris) genuinely has no state, and the composite drops the
        // state axis rather than substituting one.
        venueCity: address.city || null,
        venueState: address.state || null,
        home: {
          teamId: home.team ? home.team.id : null,
          abbr: home.team ? home.team.abbreviation : null,
          name: home.team ? home.team.displayName : null,
          nickname: home.team ? home.team.name : null,
          score: Number.isFinite(homeScore) ? homeScore : null,
          winner: home.winner === true,
        },
        away: {
          teamId: away.team ? away.team.id : null,
          abbr: away.team ? away.team.abbreviation : null,
          name: away.team ? away.team.displayName : null,
          nickname: away.team ? away.team.name : null,
          score: Number.isFinite(awayScore) ? awayScore : null,
          winner: away.winner === true,
        },
      });
    });
    return games;
  } catch (e) {
    return [];
  }
}

/* ---------- ESPN: the player boxscore ---------- */
// Per-player minutes and production for one finished game. Stat positions are
// resolved through the response's own `names` array rather than hardcoded
// indices, because that ordering is ESPN's to change.
//
// Two traps here, both confirmed against real data:
//   - `reason` reads "COACH'S DECISION" even for players who started and
//     played 33 minutes, so it says nothing about availability. Only the
//     didNotPlay boolean does.
//   - a player who did not play has an empty stats array, not zeroes.
function nbaStatIndexes(names) {
  const idx = {};
  (names || []).forEach((n, i) => { idx[String(n).toUpperCase()] = i; });
  return idx;
}

function nbaStatNumber(stats, idx, key) {
  if (idx[key] == null) return null;
  const raw = stats[idx[key]];
  if (raw == null || raw === '' || raw === '--') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchNbaGameBoxscore(eventId) {
  try {
    const res = await fetch(`${NBA_ESPN_SITE}/summary?event=${eventId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const blocks = ((data.boxscore || {}).players) || [];
    if (!blocks.length) return null;
    const teams = {};
    blocks.forEach((block) => {
      const abbr = block.team ? block.team.abbreviation : null;
      if (!abbr) return;
      const stat = (block.statistics || [])[0] || {};
      const idx = nbaStatIndexes(stat.names);
      const players = (stat.athletes || []).map((row) => {
        const ath = row.athlete || {};
        const stats = row.stats || [];
        const played = !row.didNotPlay && stats.length > 0;
        return {
          id: ath.id != null ? String(ath.id) : null,
          name: ath.displayName || null,
          position: (ath.position || {}).abbreviation || null,
          starter: row.starter === true,
          played,
          minutes: played ? (nbaStatNumber(stats, idx, 'MIN') || 0) : 0,
          points: played ? nbaStatNumber(stats, idx, 'PTS') : null,
          rebounds: played ? nbaStatNumber(stats, idx, 'REB') : null,
          assists: played ? nbaStatNumber(stats, idx, 'AST') : null,
        };
      }).filter((p) => p.id);
      teams[abbr] = players;
    });
    return Object.keys(teams).length ? teams : null;
  } catch (e) {
    return null;
  }
}

/* ---------- ESPN: birth dates ---------- */
// Current roster, used for an upcoming game where no boxscore exists yet.
async function fetchNbaTeamRoster(teamId) {
  try {
    const res = await fetch(`${NBA_ESPN_SITE}/teams/${teamId}/roster`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.athletes || []).map((a) => ({
      id: a.id != null ? String(a.id) : null,
      name: a.displayName || a.fullName || null,
      position: (a.position || {}).abbreviation || null,
      birthDate: parseEspnRosterDob(a.dateOfBirth),
    })).filter((a) => a.id);
  } catch (e) {
    return [];
  }
}

// Any athlete's birth date by id. Needed for the historical backfill, where
// a player from two seasons ago may be on no current roster at all. Each
// lookup is one small request (~0.2s measured), and the caller is expected to
// cache - see the birthdate cache in db-core.js, which persists across a
// backfill so a player is fetched once per run, not once per game.
async function fetchNbaAthleteDob(athleteId) {
  try {
    const res = await fetch(`${NBA_ESPN_ATHLETE}/${athleteId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const ath = data.athlete || {};
    const birthDate = parseEspnDisplayDob(ath.displayDOB);
    if (!birthDate) return null;
    return { id: String(athleteId), name: ath.displayName || null, birthDate };
  } catch (e) {
    return null;
  }
}

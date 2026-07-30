# App overview

One-line-per-file map of this repo, so a new session (or a new feature idea) doesn't
have to re-derive what already exists. Static HTML/CSS/JS, no build step, GitHub Pages,
global script scope (no modules) — every .js file below is just a `<script>` tag.

Keep this updated when a file's *purpose* changes. Don't bother updating it for internal
refactors that don't change what a file is for.

## Core engines (shared by multiple pages)

- **numerology.js** — the base math: digit reduction (`reduceNumber`), Life Path,
  Personal Year/Month/Day, Universal Year/Month/Day, lucky numbers/missing numbers,
  pinnacles, Chinese zodiac (year/month/day sign), and the natal **western astrology**
  snapshot (`getSunSign`, `getSaturnSign`, `getJupiterSign`, `getVenusSign` + retrograde
  flags for Saturn/Jupiter/Venus) — all sourced from real ephemeris via astro-engine.js,
  not lookup-table date ranges. `computeAll()` is the orchestrator that returns
  everything about one birth date.
- **astro-engine.js** — thin wrapper around `astronomy.browser.min.js` (the
  astronomy-engine library, unit-tested against NOVAS/JPL Horizons). Computes real
  geocentric apparent ecliptic longitude for Sun/Moon/Mercury/Venus/Mars/Jupiter/
  Saturn/Uranus/Neptune/Pluto on any date, converts to zodiac sign + degree, detects
  retrograde, and can scan forward/backward for the next/previous sign change.
  **This is genuine transit math — no natal-vs-transit aspect scoring is built on top
  of it yet anywhere in the app** (see astrology.js below, which only does
  transit-vs-transit).
- **compat-data.js** — the three raw compatibility lookup tables (transcribed from the
  owner's own reference spec): `NUMEROLOGY_TABLE`/`numerologyCompat` (life-path-style
  number vs number), `VIETNAMESE_TABLE`/`vietnameseCompat` (Chinese zodiac animal vs
  animal), `WESTERN_TABLE`/`westernCompat` (western sun sign vs sun sign — element/
  modality based, symmetric, same 10=clash/100=ally banding as the others). **Western
  compat is a complete, tested system already** — it just isn't wired into
  `computeEnergyFlow` (see below), so stocks.js doesn't currently see it.
- **compat-engine.js** — the compatibility scoring engine built on top of compat-data.js.
  Key exports: `computeCompatibility()` (full two-entity breakdown used by
  Compatibility Calculator + Sports Betting), `computeEnergyFlow(birthDate, today)`
  (today's Personal Y/M/D vs Universal, and Chinese zodiac Y/M/D vs today's signs,
  each weighted 0.65/0.25/0.10 — **this is the exact function stocks.js runs per
  anchor**, and it currently returns `{finalScore, numerology, vietnamese, bonuses}`
  only, no `western` block), and `computeMonthOutlook()` (best/worst calendar months
  for a person, which DOES blend in western sun sign at 20% weight — proof the
  westernCompat plug-in pattern already works elsewhere, just not in computeEnergyFlow).
- **db-core.js** — shared birthday-database primitives: localStorage load/save,
  `escapeHtml`, zodiac emoji tables, shared UI helpers (modal width, score-class
  bands). Used by nearly every page.
- **big-store.js** — IndexedDB-backed key/value store for the handful of datasets that
  outgrew localStorage's ~5MB cap (MLB/NBA prediction history). Callers keep their
  existing synchronous-looking API; the async part is hidden behind an in-memory
  cache populated once at startup.
- **firebase-loader.js / firebase-init.js / auth-widget.js** — optional cloud sync.
  Firebase SDKs load lazily (only for browsers that have ever signed in, or on demand
  when the sign-in pill is clicked) so most visitors never pay the ~150KB cost.
- **sports-gate.js** — client-side owner-only gate for the Sports Betting section
  (sports-betting.html, polymarket*.html, stats.html, betting.html, bet-log.html).
  Explicitly NOT a hardened lock (GitHub Pages is public) — the real privacy boundary
  is Firestore security rules restricting each synced doc to the owner's own uid.

## Numerology pages

- **index.html** — no content, just redirects to profile.html.
- **profile.html** (profile.js) — save your own birth date/time once; loads
  `computeAll()` + personal-hours breakdown on every future visit.
- **calculator.html** (render.js, compat-render.js) — the main "enter any date, see
  the full numerology breakdown" calculator.
- **famous.html** (famous.js) — search/lookup a famous person's birth date (backed by
  a bundled or fetched dataset) and run the same numerology breakdown on them.
- **calendar.html** (calendar.js) — month grid showing each day's reduced Universal
  Day number and western sun sign, with a "Daily Energy" freeze rule (28/13/11/22/33
  don't reduce further; bare 2 only shows on the 2nd of the month).
- **astrology.html** (astrology.js) — live transit wheel: current sign/degree/
  retrograde for all 10 bodies on any date, aspect lines between currently-transiting
  planets (conjunction/sextile/square/trine/opposition, configurable orbs/filters),
  click a planet for entered/leaves dates + progress bar. Transit-to-**transit** only —
  no natal chart is stored or compared here.
- **database.html** (database.js) + **category.html** (category.js) — birthday address
  book: categories (folders) of saved name+date entries, bulk CSV/Excel import
  (bulk-upload.js).
- **compatibility.html** (compatibility.js, compat-render.js) — two-entity
  compatibility calculator using `computeCompatibility()` (numerology + Vietnamese +
  western, all three tables).

## Sports Betting suite (owner-gated)

- **sports-betting.html** — hub/landing page for the section.
- **betting.html** (betting.js, betting-core.js, betting-render.js) — turns stored
  UFC/Tennis/MLB/NBA predictions into today's bet slate + a simulated bankroll ledger.
  Half-Kelly staking off historical edge-tier × price-bucket win rates, no lookahead
  in the simulation walk.
- **bet-log.html** (bet-log.js, shares betting-render.js) — historical ticket log,
  same result-checking as betting.html.
- **betting-backup.js** — export/import (download file + opt-in cloud copy) for the
  betting localStorage keys, since it's local-only data and losing the device means
  losing a year of backfill.
- **polymarket.html** — hub linking to the four live-odds trackers below.
- **polymarket-mlb.js / polymarket-nba.js / polymarket-tennis.js / polymarket-ufc.js**
  — live Polymarket markets for each sport, scored by the numerology composite, plus
  whale-trade detection and a leaderboard feed.
- **tennis.html / tennis.js**, **ufc.html / ufc.js** — player/fighter roster
  management (seed data + custom overrides), venue/region picker for the
  location-compat factor.
- **stats.html** (stats-mlb.js, stats-nba.js, stats-tennis.js, stats-ufc.js) — the
  historical prediction tracker/backfill/result-checker per sport; the single place
  a pick actually gets recorded (betting.js and the polymarket trackers call into it,
  never duplicate the write).
- **nba-api.js / mlb-api.js** — live data sources (ESPN's public API for NBA — the
  NBA's own endpoints reject browser CORS; MLB's own public Stats API for MLB).
- **tennis-data.js / ufc-data.js / us-states-data.js** — seed rosters + US state
  founding dates (used as the "state" compat factor for fight location).

## Stocks (current focus)

- **stocks.html / stocks.js** — numerology-for-markets. Each instrument has one or
  more "anchors" (company founding/IPO date, CEO birth date) read via
  `computeEnergyFlow`. Signals: the 7/8/28/11 meaning-numbers on the anchor's own
  Personal Y/M/D, plus Vietnamese zodiac ally/enemy at the matching level — bears
  always beat bulls in the tally, conviction tiers (Unanimous/Majority/Solo) show how
  many signals actually agreed. Replay/backtest engine grades historical trade windows
  two ways (exit on reversal vs ride to the window's natural end), persisted
  incrementally in a local Combined Track Record ledger. Radar dashboard surfaces the
  next opportunity across all instruments. **Does not yet use westernCompat or any
  transit-to-natal aspect** — both are live discussion topics for adding a third
  signal system alongside numerology and Vietnamese zodiac.

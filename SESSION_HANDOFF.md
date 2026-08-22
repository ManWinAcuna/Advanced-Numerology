# Session Handoff — NBA Tracker Build

Written 2026-07-26. Read this first in a new chat, then delete it when it's stale.

---

## 1. Project basics

- **Path:** `C:\Users\Manuel\Desktop\Inception\numerology-app\`
- **Repo:** `github.com/ManWinAcuna/Advanced-Numerology`, deployed via GitHub Pages
- **Last known git state:** commit `ac0ed98`, working tree clean, local and remote in sync
- **Stack:** static HTML/CSS/JS, no build step, no framework
- **Critical constraint:** every `<script>` shares one global scope. Load order matters and all top-level names must be globally unique.
- Second app in the workspace: `emaxing/` (untouched this session)

---

## 2. What was built this session

A complete **NBA tracker at full UI parity with MLB** — betting page, Stats (Today + Old Data scopes), and a live Polymarket tracker.

### New files
| File | Size | Purpose |
|---|---|---|
| `nba-api.js` | ~430 lines | ESPN + Polymarket NBA data layer |
| `stats-nba.js` | ~1100 lines | Rendering + three walk-forward backfills |
| `polymarket-nba.html` / `.js` | — | Live NBA tracker page |

### Modified files
- `db-core.js` — large NBA section (scoring, stores) appended before the autofill IIFE
- `stats.html` — NBA picker card, `statsNbaSection`, Today/Old scopes, three views (game/totals/props), consolidated `nbaToolsBox`. Div balance 605/605, 8 `pm-modal-page`s.
- `betting-core.js` — `nba` + `nbaTotals` in `BETTING_SPORTS`; `BETTING_MARKET_OPTIONS` extended; `BETTING_MARKETS_VERSION = 2` migration
- `betting.js` — `BETTING_MARKET_SCOPE` so chips only render on their owning scope
- `betting-render.js` — `nba: { label:'NBA', icon:'🏀' }` in `BETTING_SCOPE_META`
- `big-store.js` / `betting-backup.js` — five NBA keys registered

### Key constants (db-core.js)
```js
NBA_PREDICTIONS_KEY, NBA_TOTALS_PREDICTIONS_KEY, NBA_PLAYER_FORM_KEY,
NBA_BIRTHDATES_KEY, NBA_PROP_SIGNALS_KEY

NBA_FORM_WINDOW = 10, NBA_ROTATION_SIZE = 10, NBA_MIN_ROTATION = 5, NBA_FORM_STALE_DAYS = 30
NBA_REAL_EDGE_MIN_GAP = 3          // tiers 8 / 5 / 3
NBA_PACE_NEUTRAL = 63, NBA_TOTALS_MIN_GAP = 5
NBA_FRANCHISE_WEIGHT = 0.10
NBA_POSITION_KEYS = ['G','F','C']
NBA_COMPONENT_KEYS = ['star','G','F','C','franchise']
NBA_PROP_STATS = ['pts','reb','ast']
NBA_PROP_PLAYERS_PER_TEAM = 8, NBA_PROP_MIN_BASELINE_GAMES = 5
NBA_POLYMARKET_FIRST_DATE = '2024-10-21'
```

`NBA_TEAM_FOUNDING_DATES` — all 30, keyed by ESPN abbreviation. Supplied by the user via screenshots. Notable: `DEN:'1967-04-01'` (researched, user picked from options), `WSH:'1997-12-02'`, `DET:'1941-06-22'`, `CHA:'2014-05-20'`. Real span is 1941–2014, **not** clustered in 1946–49.

### Design decisions the user made
- Players only, **no coaches**
- 2 seasons, aligned to when Polymarket prices start
- Moneyline + totals + player props
- Game markets first, props second
- Franchise weight starts at 10% like MLB
- Day filters left as-is (no overfit guard) — user's explicit call

---

## 3. THE FINDINGS — all negative

Three independent, well-powered NBA tests. **All flat.**

| Test | Sample | Result |
|---|---|---|
| Team moneyline, minutes-grouped composite | 1,245 picks | 0 edge, all components < 0.75σ |
| Team moneyline by role | 1,317 picks | Star **exactly 0**; Forwards +1 (0.72σ), Center +1 (0.68σ), Guards −1, Franchise −1 |
| Assists props | 16,465 player-games | all bands within 0.15σ of each other |

**Detection thresholds:** SE = √(0.25/n). At n=1,245, one SE is 1.42 points → nothing under **+4.25** is visible at 3σ. Props at n≈42,000 give 0.24 SE → **+0.73** detectable.

### Not yet viewed — data already collected, zero work
1. **Points** prop table
2. **Rebounds** prop table
3. **NBA dimension edge table** (`stats-nba.js:649`) — which of the 8 numerological dimensions carries signal, as opposed to which person
4. **NBA totals** market results

**Do these before building anything new.**

---

## 4. MLB context (the only measured edge in the app)

```js
MLB_ROLE_WEIGHTS = {
  manager: 0.45,          // <- the only thing measuring at 3.3σ
  pitcher: 0.28,
  pitcherMatchup: 0.10,
  franchise: 0.10,
  catcher: 0.03,
  batters: 0.04,
}
MLB_WEIGHTS_SINCE = '2026-07-26'   // = today, so out-of-sample count ≈ 0
MLB_WEIGHTS_VERSION = 3, MLB_V2_SINCE = '2026-07-19'
```

- Out-of-sample panel: `stats-mlb.js:744` filters `resolved.filter(p => p.gameTime >= MLB_WEIGHTS_SINCE + 'T12:00:00.000Z')`, needs `MIN_BUCKET_SAMPLE` (5) before it shows a rate.
- Confirming a +4 edge needs **~625 resolved picks (2σ, ~63–105 days)** or **~1,407 (3σ, ~141–235 days)**.
- ⚠️ The "+153k from 5k" simulation figure is **in-sample**. It is not a forecast and must not drive stake sizing.
- The +4 edge estimate is itself in-sample, so it's probably optimistic. If the true edge is +2, you need 4× the games.

---

## 5. Structural gap identified but NOT tested

The NBA composite scores each team **only against day / venue / state**. The two teams' numerology never meets.

MLB has `pitcherMatchup` at 0.10, and the code comment at `db-core.js:1485` calls it:

> "the one place the two teams' numerology actually meets head-to-head, instead of each side only ever being scored against the day/venue."

**NBA has no equivalent component.** An entire axis is untested. The NBA analogue would be star-vs-opposing-rotation, mirroring pitcher-vs-lineup. Needs an ESPN-only re-walk (minutes, not the multi-hour price backfill).

---

## 6. Coach investigation — done, conclusion is "expensive"

Verified empirically this session:

- ESPN endpoint `/v2/sports/basketball/leagues/nba/seasons/{season}/teams/{id}/coaches` returns **exactly 1 coach per team-season for all 30 teams** — no start date, no end date, no game count.
- The coach record has **no `dateOfBirth`**. The `person` ref is a dead end. `coachSeasons` is just a list of season refs.
- Boxscore `coach` matches are all `reason: "COACH'S DECISION"` (DNP labels), not coach identity.
- 60 team-season records pulled, **35 distinct coaches** across seasons 2024 + 2025.
- Only **5 of 30** teams differ between the two seasons (DET, MIL, BKN, PHX, SAC). That's low for the NBA and several entries look like interims — the list needs verification before it could be trusted.

**Mid-season changes cannot be reconstructed from ESPN.** Options:
1. Ignore it — misattribution is non-differential, so it *attenuates toward zero*; it can hide a real effect but cannot manufacture a fake one. **Poisoned here** because the names themselves are unreliable.
2. Drop ambiguous team-seasons — costs ~15–25% of sample, every remaining label certain, forgiving of uncertainty.
3. Hand-research a full tenure table `{team, coach, birthDate, fromDate, toDate}`. Exact, much more work than the 30 founding dates.

**Prior was lowered during the session:** the closest available analogue to "one high-leverage individual" — the Star component — already came back at **exactly 0 on 1,317 picks**. Cost went up, prior went down.

---

## 7. FIXED — empty betting page (was the open bug)

**Symptom:** the MLB betting page showed no backfilled data *and* no today's bets, with no console error. Came back after a reload.

**Corrected diagnosis.** The original theory (sequential hydration is slow, the render raced it) was **wrong**: `betting.js:469` already awaited `bigStoreReadyPromise` before its first read, so slow hydration produces a *late* page, not an empty one. The user confirmed the page came back after a **reload**, which also rules out wrong-origin — a reload cannot change origin.

The actual chain was **error swallowing**:
1. `bigStoreGet()` resolved `undefined` on a failed read, making "this key is not stored" and "this read did not work" the same answer.
2. A failed key was therefore left out of the cache, exactly like an empty one.
3. `releaseMigratedLocalCopies()` had already deleted the localStorage copies, so there was no fallback.
4. `bigStoreGetItem()` returned `null` → `loadMlbPredictions()` returned `[]` → a confident empty page, no error anywhere.

A concurrent multi-megabyte backfill checkpoint in another tab is the most plausible trigger for the failed read.

### What landed
1. **Parallel hydration** — `Promise.all` over the eager keys instead of 11 sequential round-trips.
2. **`nba_prop_signals` is now lazy** — `BIG_STORE_LAZY_KEYS`, read only via `ensureBigStoreKey()` / `ensureNbaPropSignals()`. Off every page's critical path; only the Stats prop tables, its own backfill, and backup/restore pull it in.
3. **Failure is loud, and destructive writes are refused** — `bigStoreGet` rejects and is retried 3×; a key that still won't read is marked failed, and both `bigStoreGetItem` and `bigStoreSetItem` **throw** for it. The write guard is the important half: callers build their next value by appending to what they loaded, so a write after a failed read is a truncation. Same guard covers a lazy key nobody loaded.
4. **Status banner**, auto-wired in `big-store.js` so every page gets it with no per-page edits: "Loading saved data…" after 600ms, and a red banner naming the failed stores on degrade.
5. On partial failure init deliberately **does not** set the migrated flag or release localStorage copies.
6. Bonus fix: `rescoreMlbPredictionsForWeights()` stamped `MLB_WEIGHTS_VERSION_KEY` unconditionally, so a degraded load would mark the rescore done and it would never run again. It now bails out when the store isn't hydrated.

**Verified** with a fake-IndexedDB harness (25/25) covering healthy load, failed read, transient-failure retry, fresh migration, partial-failure migration, and no-IndexedDB. Not yet exercised in a real browser.

**Still worth watching:** `bigStoreSetItem`'s dirty path — writes landing while the DB is still opening are marked authoritative and pushed to IndexedDB *skipping the read from disk*.

### Ruled out during diagnosis
- Script tags on `betting.html` are complete (`nba-api.js`, `stats-nba.js` both load before `betting-core.js`)
- `loadBettingMarkets()` is correct — returns all options when the saved list is empty (line 250) and unions new NBA keys on the version bump (253–258). Cannot produce an empty market list.
- Wrong-origin (local file vs GitHub Pages) — ruled out by the reload.

---

## 8. Other outstanding items (flagged, not requested)

- Apply the **Firestore rules** from `FIREBASE_RULES.md` — unconfirmed since 2026-07-20, needs to be done manually in the Firebase console
- **Lock one real MLB bet day** — the lock→settle→log path has never carried a live day
- Consider turning **NBA market chips off** so zero-edge NBA legs don't dilute the All Sports slate

---

## 9. Statistical lessons baked into this work

- **The null for "player beats his own trailing mean" is NOT 50%.** Right-skewed counting stats put the mean above the median: simulated with zero effect, assists 47.1%, rebounds 47.4%, points 48.3%. Assuming 50% produced a dramatic false −6.5σ finding. **Simulate the measurement with no effect present before setting any null.**
- **In-sample vs out-of-sample:** weights chosen by analysing games are inflated when measured on those same games. That's what `MLB_WEIGHTS_SINCE` gates.
- **SE = √(0.25/n)** for a win-rate test.
- **Multiple comparisons:** 15 prop bands (5 × 3 stats) means ~1 clears 2σ by chance. Bar is set at 3σ.
- **Welch's t-test** is used for the band-vs-rest-of-sample magnitude comparison.
- Misclassification that's non-differential w.r.t. the outcome **attenuates toward zero** — it hides real effects, it doesn't manufacture fake ones.

---

## 10. Working agreements with the user

- User does their own testing — skip exhaustive browser re-verification after edits
- No background agents; handle everything in-chat
- Push verified numerology-app work immediately, don't ask for approval
- **Ask questions regularly** to stay on the same page — standing instruction
- Never show compatibility/scoring weight percentages in the numerology UI
- Never fabricate a date for partial data; derive only what the precision supports
- Summed day numbers never show a standalone 2 (it's an 11); only the literal 2nd gives Day Energy 2
- No regex HTML surgery — verify structure and the ids the JS actually builds
- **Verify before claiming** — confirm against independent ground truth before asserting a root cause
- Ship complete features — new data needs UI matching the existing layout, and its storage growth checked
- **No blanket eager-load** — gate loading behind real per-page need. This session violated it a third time (see §7).

---

## 11. Recommended next steps

1. ~~Fix the `big-store.js` hydration bug~~ — **done** (§7). Still needs one real-browser pass: load the betting page and confirm data renders with no banner.
2. **Open the four free unviewed tables** (§3). Zero work, data already collected. If all four are flat alongside the three already run, that's seven independent well-powered nulls and the honest read is that NBA has no signal at detectable size.
3. **Only then** decide between the head-to-head matchup component (§5, untested axis, ESPN-only re-walk) and coaches (§6, expensive, lowered prior).

Current user activity: mid-run on a 2-season NBA backfill, started this session, takes hours. The storage fix was written while that run was live — the running tab keeps executing the code it already loaded, and no storage format changed, so old and new code share IndexedDB safely. **Do not reload the backfill tab until it finishes.**

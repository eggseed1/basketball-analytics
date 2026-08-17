# Conflict resolution log — analytics × web integration

Branch: `integration/analytics-web`  
Merge: `web/drbl-ia-and-ask` into analytics HEAD (merge in progress; **not committed**)  
Date: 2026-08-17

## Policy applied earlier

| Area | Resolution |
| --- | --- |
| UI / redesign | Prefer **theirs** (`web/drbl-ia-and-ask`) |
| Data / DRBL model semantics | Prefer **ours** (analytics HEAD) |
| Model freeze | Do **not** touch `drbl/models`, `reports/m17*`, `reports/m18*`, `src/data/drbl/precomputed` |

Blind `--ours` on `src/data/queries/players.ts` dropped web’s `getFilteredPlayerSeasonsDetailed` and broke Explore. This pass restores a **manual hybrid**.

---

## Manual hybrid resolutions

### 1. `src/data/queries/players.ts`

**Base:** web (`web/drbl-ia-and-ask`) — roster resilience, ESPN athlete board path, `getFilteredPlayerSeasonsDetailed`, team roster budget/status helpers.

**Kept from analytics (HEAD):**

- `listDrblSeasons` / `getDrblAvailableSeasons`
- `fetchDrblSeason` overlay into:
  - Explore board rows inside `getFilteredPlayerSeasonsDetailed` (registry seasons only via `isDrblSeason`)
  - `getPlayerCareerTimelineSeasons` (DARKO + BRef + DRBL overlays)
- R1 fields: missing metrics stay `null`, never coerced to `0`

**Helper:** `overlayDrblRows` maps `drbl100`, ranks, components, `r1Points`, `r1WinEquivalents`, etc.

### 2. `src/data/queries/index.ts`

**Base:** web barrel (Ask DRBL, explore health, historical, request-cache, team boards, …).

**Added from analytics:**

- `getDrblAvailableSeasons`
- `getPlayerCareerTimelineSeasons`
- percentile exports (`hasValidDrblEstimate`, `PLAYER_PERCENTILE_METRICS`, …)

**Related:** restored web `src/data/queries/home.ts` so `getHomeAnalytics` / `getHomeAnalyticsCached` match the redesign (was analytics-only `getHomeFeed` after `--ours`).

### 3. Explore DRBL without losing redesign

| File | Change |
| --- | --- |
| `src/lib/player-season-sort.ts` | Sort keys `drbl100`, `r1Points`, `r1WinEquivalents` (default **desc**) |
| `src/data/queries/explore-players-board.ts` | Fields on `ExplorePlayerBoardRow`; map only when `hasValidDrblEstimate`; null DRBL sorts to end (not as 0); default sort prefers `drbl100` when board has DRBL; `hasDrbl` flag |
| `src/components/explore/player-season-table.tsx` | Columns **DRBL/100**, **R1 Points**, **R1 Win Equivalents** when `hasDrbl`; never labeled WAR; no UIR |
| `src/app/explore/players/page.tsx` | Kept web shell (`ExplorePlayersClientShell`, health banners) + `DrblSeasonSupportNotice` + copy that DRBL fields are registry-only via `listDrblSeasons` |
| `src/components/explore/drbl-season-support-notice.tsx` | Restored from analytics HEAD |

### 4. Remaining text conflicts (markers removed)

#### `package.json`

- **Union** of all scripts from both sides (web `test:*` / `smoke:*` / `prefetch:*` + analytics full `drbl:*` pipeline).
- Dependencies: web set retained (`idb-keyval`, `server-only`, `zustand`) merged onto shared deps.

#### `next.config.ts`

- Image hosts: `a.espncdn.com` **and** `cdn.nba.com` (`/headshots/**`, `/logos/**`, `/**`).
- Kept web `outputFileTracingIncludes` for `./data/cache/games/**/*`.

#### `.env.example`

- Combined analytics DRBL ability-source comments + web BALLDONTLIE / PBP comments.
- No secrets; `BALLDONTLIE_API_KEY=` left empty.

#### `docs/data-architecture.md`

- Single Notes block merging ESPN derivation rules, DRBL registry overlay semantics, NBA Stats/BRef identity notes, and freshness guidance.
- Conflict markers removed.

#### `scripts/smoke-nba.ts`

- Web ESPN cache clear + null-safe USG/TS formatting.
- Prints both LeBron and SGA samples; optional LeBron shots/game-log probe from analytics.

---

## Staging / conflict status

After resolution:

- `git diff --name-only --diff-filter=U` → **empty** (0 remaining conflicts)
- Merge **not** committed (MERGE_HEAD retained)
- M17c **not** started
- Model freeze paths unchanged

---

## Files touched in this hybrid pass

- `src/data/queries/players.ts`
- `src/data/queries/index.ts`
- `src/data/queries/home.ts` (restored web)
- `src/data/queries/explore-players-board.ts`
- `src/lib/player-season-sort.ts`
- `src/components/explore/player-season-table.tsx`
- `src/components/explore/drbl-season-support-notice.tsx`
- `src/app/explore/players/page.tsx`
- `package.json`
- `next.config.ts`
- `.env.example`
- `docs/data-architecture.md`
- `scripts/smoke-nba.ts`
- `reports/integration/04_conflict_resolution_log.md` (this file)

---

## Blockers / follow-ups (non-blocking for conflict clear)

1. **ID join risk:** ESPN athlete ids vs DRBL artifact NBA Stats ids — overlay is by `playerId`; if ids diverge, board DRBL columns may stay empty until identity mapping is wired.
2. **Typecheck / explore tests:** not run in this pass; `hasDrbl` prop and sort keys may require test fixture updates (`test:explore-players-board`, etc.).
3. **Do not commit** until parent integration checklist accepts this hybrid.

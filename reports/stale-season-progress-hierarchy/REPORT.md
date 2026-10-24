# Season-progress staleness across the site hierarchy

**Date:** 2026-10-24  
**Symptom:** Prod `/standings` (and related W-L surfaces) showed opening-night records (~1 GP) while the league was already at ~2 GP and Explore player boards showed GP=2.

## Root cause

On Cloudflare, product data prefers **bundled Worker JSON** over live ESPN (`preferBundledProductDataOnEdge()`). Once a snapshot has rows, live refresh is skipped.

| Artifact | Role | Was frozen at | Fresh as of rebuild |
|---|---|---|---|
| `season-tables-snapshot.json` | Player GP / counting / advanced | 2026-10-24 (GP max 2) via home runner | Already current |
| `explore-players-first-page.json` | Cold Explore board | Rebaked on deploy sync | Already current |
| `standings-snapshot.json` | Conference W-L | **2026-10-22 (max GP 1)** | **2026-10-24 (max GP 2)** |
| `team-board-snapshot.json` | Team efficiency / by-team stats | **2026-10-22** | **2026-10-24** |
| `game-snapshot.json` | Schedule archive / tracker / scores month | **2026-10-22** (finals through 10/21) | **2026-10-24** (finals through 10/23) |

`deploy-site.yml` previously synced **only** season-tables (+ Explore first-page rebake) from `main`. Code-only branch deploys therefore kept shipping Oct 22 standings while player GP advanced. `main` itself was also still on the Oct 22 standings/team/game bakes — the home stats runner updates season-tables only; ESPN standings/schedule land via nightly `daily-runtime-refresh` (`commit_season`), which had not landed a newer commit for those files.

---

## Hierarchy inventory

Legend: **STALE-CLASS** = same bug class as GP=1 standings (bundled, CF-preferred, not kept current on code-only deploy). **Mitigated** = season-tables / first-page sync already covers it. **Live** = ESPN/API on the request path.

### `/` Home

| Surface | Source | Status |
|---|---|---|
| Standings / playoff-race cards (`/api/home/standings`) | `standings-snapshot` → archive → ESPN | **STALE-CLASS → fixed** |
| Season pulse (games played of 1230) | `game-snapshot` | **STALE-CLASS → fixed** |
| Week strip / day scores | Live ESPN scoreboard | Live |
| Top performers / Explore chips | season-tables | Mitigated |
| Insights desk | `recent-insights-snapshot` | Separate bake (was Oct 22; refresh in this pass if rebuilt) |

### `/standings`

| Surface | Source | Status |
|---|---|---|
| Conference tables | `standings-snapshot` | **STALE-CLASS → fixed** (user-reported) |
| Team efficiency tab | `team-board-snapshot` | **STALE-CLASS → fixed** |
| Playoff bracket seeds | standings + game-snapshot | **STALE-CLASS → fixed** |
| `/standings/visualizations` tracker | game-snapshot + standings only (never live) | **STALE-CLASS → fixed** |
| Contract surplus board | contract-value model (not W-L) | Not this bug |

### `/scores` · `/games/[gameId]` · `/explore/games`

| Surface | Source | Status |
|---|---|---|
| Scores day view | Live ESPN | Live |
| Scores week/month/list | `game-snapshot` | **STALE-CLASS → fixed** |
| Game detail box | Live ESPN / NBA CDN | Live |
| Explore games archive | `game-snapshot` on CF | **STALE-CLASS → fixed** |

### `/teams/*`

| Surface | Source | Status |
|---|---|---|
| Record / seed / division | standings + team-board | **STALE-CLASS → fixed** |
| Efficiency / ranks | team-board | **STALE-CLASS → fixed** |
| Schedule / form / splits | game-snapshot | **STALE-CLASS → fixed** |
| Roster counting stats | season-tables peer board | Mitigated |
| History / vs pages (current season bits) | team-board + schedule | **STALE-CLASS → fixed** |

### `/players/*`

| Surface | Source | Status |
|---|---|---|
| Season stats / percentiles | season-tables | Mitigated |
| Upcoming games | game-snapshot | **STALE-CLASS → fixed** (schedule) |
| Game log / race curves | `public/runtime/player-game-logs` (+ R2) | Separate nightly ASSETS bake; not in Worker sync |

### `/explore/*`

| Surface | Source | Status |
|---|---|---|
| Players board | season-tables + first-page | Mitigated (prior fix) |
| Styles / trade rates | season-tables | Mitigated |
| Race / visualizations | season-tables + game logs | Partially mitigated; logs are ASSETS |
| Hot & Cold | `stat-detective-windows.json` | Nightly bake (was Oct 22) |
| Explore games | game-snapshot | **STALE-CLASS → fixed** |

### `/history` · `/franchises`

| Surface | Source | Status |
|---|---|---|
| Time Machine current-season proxy | team-board + game-snapshot | **STALE-CLASS → fixed** |
| Past seasons / records | disk history / record book | Stable |
| Franchises all-time | curated franchise history | Not this bug |

### Other

| Surface | Status |
|---|---|
| `/compare` (team side) | team-board → **STALE-CLASS → fixed** |
| `/dashboard` player boards | season-tables → Mitigated |
| `/awards`, `/arcade`, `/gm/*` | Historical / sim — not this bug |
| Injuries / movement / sentiment | Dedicated feeds — not W-L class |

---

## Fixes shipped

1. **Rebaked** (2026-10-24):
   - `standings-snapshot.json` — max GP 1 → 2
   - `team-board-snapshot.json`
   - `game-snapshot.json` — finals through 2026-10-23
   - `current-roster-snapshot.json`
   - `recent-insights-snapshot.json` — slate 2026-10-23
   - `stat-detective-windows.json` (Hot & Cold windows)
   - Local `public/runtime/player-game-logs/2026-27` (gitignored; upload to R2 separately)
2. **Expanded** `deploy-site.yml` sync-from-main to cover standings, team-board, game-snapshot, current-roster, recent-insights, and Hot & Cold windows (plus existing season-tables + first-page rebake).
3. **Landed** the rebuilt snapshots on `main` so future code-only branch deploys inherit them (the home stats runner alone does not write ESPN standings/schedule).

## Residual / follow-ups

Heavier overlays still on the Oct 22 nightly (DRBL / impact / percentile pools). They do not drive conference W-L, but current-season DRBL overlays stay a day behind until the next `daily-runtime-refresh` with `commit_season=true` (or the next scheduled post-finals nightly). Player game logs ship via R2, not the Worker bundle.

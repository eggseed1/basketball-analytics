# Season-progress staleness across the site hierarchy

**Date:** 2026-10-24  
**Symptom:** Prod `/standings` showed opening-night records (~1 GP) while the league and Explore boards were already at ~2 GP.

## Root cause

Cloudflare prefers **bundled Worker JSON** over live ESPN (`preferBundledProductDataOnEdge()`). Once a snapshot has rows, live refresh is skipped.

`deploy-site.yml` previously synced **only** season-tables (+ Explore first-page). Code-only branch deploys kept shipping Oct 22 standings while player GP advanced. `main` itself was also on the Oct 22 standings/schedule bakes — the home stats runner updates season-tables only; ESPN W-L/schedule land via nightly `commit_season`.

| Artifact | Was frozen at | After fix |
|---|---|---|
| `season-tables-snapshot.json` | 2026-10-24 GP max 2 | Already current |
| `standings-snapshot.json` | **2026-10-22 max GP 1** | **2026-10-24 max GP 2** |
| `team-board-snapshot.json` | 2026-10-22 | 2026-10-24 |
| `game-snapshot.json` | finals through 10/21 | finals through 10/23 |
| roster / insights / hot-cold | 2026-10-22 | 2026-10-24 |
| DRBL / impact / percentile overlays | 2026-10-22 | Nightly `commit_season` rebuild |

**Prod check (post deploy `40099895371`):** `/api/home/standings` and `/standings` HTML show ATL/DET/PHI/TOR at 2-0 (max GP 2).

---

## Hierarchy inventory

Legend: **STALE-CLASS** = bundled, CF-preferred, not kept current on code-only deploy. **Mitigated** = season-tables / first-page sync. **Live** = ESPN/API on the request path.

### `/` Home
| Surface | Status |
|---|---|
| Standings / race cards | **fixed** |
| Season pulse | **fixed** |
| Week strip / day scores | Live |
| Insights desk | rebaked; nightly keeps current |

### `/standings`
| Surface | Status |
|---|---|
| Conference tables | **fixed** (user-reported) |
| Team efficiency / bracket / tracker | **fixed** |

### `/scores` · `/games` · `/explore/games`
| Surface | Status |
|---|---|
| Scores day / game boxes | Live |
| Week/month/archive | **fixed** via game-snapshot |

### `/teams/*` · `/players/*` · `/explore/*` · `/history`
| Surface | Status |
|---|---|
| Team W-L / seed / efficiency / schedule | **fixed** |
| Player season stats | Mitigated (season-tables) |
| Explore players board | Mitigated (prior fix) |
| Hot & Cold | rebaked + deploy sync |
| History current-season proxy | **fixed** |

### Overlays / ASSETS
| Surface | Status |
|---|---|
| DRBL / impact / percentile | Nightly full rebuild + deploy sync list expanded |
| Player game logs (R2) | Local bake + R2 upload; nightly also mirrors |

---

## Fixes shipped

1. Rebaked standings, team-board, game-snapshot, roster, insights, hot-cold (2026-10-24).
2. Expanded `deploy-site.yml` sync-from-main for season-progress **and** DRBL/impact/percentile overlays; warm `/standings`.
3. Landed snapshots + workflow on `main` (`25835539`, `d807bace`).
4. Deployed standings fix: https://github.com/eggseed1/basketball-analytics/actions/runs/40099895371
5. Full nightly with `commit_season=true`: https://github.com/eggseed1/basketball-analytics/actions/runs/40100345409

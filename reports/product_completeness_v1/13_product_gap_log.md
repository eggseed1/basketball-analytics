# 13 — Product gap log

Status vocabulary: **FIXED** | **OPEN** | **INTENTIONALLY_NOT_SUPPORTED** | **BLOCKED**

| id | gap | discovery | status | notes |
|---|---|---|---|---|
| G01 | ASK has no DRBL / R1 metrics | `query-engine` has no `drbl100`/`r1Points` fields; surface matrix | OPEN | ASK brand name ≠ DRBL metric answers |
| G02 | `/compare` ignores DRBL | compare components use DARKO/box; no DRBL | OPEN | Applicable but unwired |
| G03 | Home impact rail DARKO-first | `src/data/queries/home.ts`, `ImpactLeaders` | OPEN | Explicit DARKO-first paint path |
| G04 | Player destination missing DRBL | ESPN id ≠ NBA DRBL key; no snapshot | FIXED | Alias file 0→676 + DRBL Snapshot + merge fix |
| G05 | Team roster value = DARKO only | `buildRosterBuckets` | FIXED | Prefers valid DRBL; DARKO fallback |
| G06 | Explore teams desktop full names incomplete | `team-season-table` sorted/displayed abbr | FIXED | Shows `fullName` / canonical `displayName` |
| G07 | Learn/DRBL thin on O/D/P/LN/B + warnings | pre-fix learn page | FIXED | Expanded `/learn/drbl` + `test:learn-drbl-page` |
| G08 | Glossary stale “replacement” / gravity / WAR framing | `stat-glossary.ts` | FIXED | R1 reference wording; gravity removed from DRBL-B; WAR retired copy |
| G09 | Board health banner silent in prod healthy path | `player-board-health-banner.tsx` | FIXED | Clarifies live board ≠ precomputed DRBL overlay |
| G10 | Historical team logos empty | `HISTORICAL_TEAM_LOGO_ASSETS = {}` | INTENTIONALLY_NOT_SUPPORTED | No scrape; text marks until assets committed |
| G11 | Orphaned player savant UI | `PlayerSavantSummary` / `buildSavantCareerFrames` unused by pages | OPEN | Code remains; not mounted on destination |
| G12 | Career cumulative R1 / WAR as canonical | types + learn copy forbid | INTENTIONALLY_NOT_SUPPORTED | Career cumulative forbidden as public canonical |
| G13 | Calibrated DRBL ± / uncertainty public | glossary + learn retired section | INTENTIONALLY_NOT_SUPPORTED | Legacy diagnostic only |
| G14 | Season-rank / season-compare lack DRBL | player subroutes | OPEN | Destination snapshot fixed; subroutes not |
| G15 | Dashboard omits DRBL | `/dashboard` | OPEN | Slim seasons view |
| G16 | Historical DRBL leaders on Time Machine | `/history` | OPEN | Identity eras present; no DRBL leaderboard |
| G17 | Explore players O/D diagnostics not public columns | metric inventory | INTENTIONALLY_NOT_SUPPORTED | Diagnostics disclosure-only for now |
| G18 | Name-only alias confidence | crosswalk / aliases | FIXED (documented) | Must stay labeled `HIGH_CONFIDENCE_UNIQUE_NAME` — not silent exact-id |
| G19 | Live join rate unmeasured | product seal honesty | OPEN | Do not claim 100% board overlay |
| G20 | One DRBL row without alias (`1642935` Hepburn, 2025-26) | join coverage script | OPEN | Static precomputed∩alias gap |
| G21 | Screenshots deferred for P17 UI smoke | report 21 | OPEN / BLOCKED_ON_MANUAL | Capture not run this pass |
| G22 | Production `next build` for P17 | report 20 | OPEN | Recorded TBD for this product seal |
| G23 | M17c external benchmark | firewall / integration health | INTENTIONALLY_NOT_SUPPORTED | **M17c not started** (`M17C_EXECUTED: NO`) |
| G24 | Offseason provider id collision risk | historical note | OPEN_IDENTITY_RISK | Namespace discipline required |
| G25 | Learn registry missing dedicated DRBL/100 concept ids | `content/learn/registry.ts` | OPEN | `/learn/drbl` page exists; registry concepts thin |
| G26 | ESPN↔BDL bare numeric collisions | team-map | FIXED (policy) | Documented + resolvers; still footgun if bare BDL leaked |

## Unexpected findings

- **Orphaned savant:** savant summary/timeline helpers exist but are not imported by current player destination pages after DRBL Snapshot work.
- **Home vs roster hierarchy split:** roster/player destination moved DRBL-first; home intentionally remains DARKO-first — product inconsistency until home is updated.
- **Alias confidence honesty:** all 676 aliases are unique-name confidence; treating them as exact multi-field IDs would be incorrect.
- **Historical logos:** empty map is explicit product policy, not an accidental miss.

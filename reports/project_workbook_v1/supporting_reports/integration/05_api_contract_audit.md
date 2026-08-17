# API / data contract audit

## Canonical production fields (preserved)

| Field | Status |
|---|---|
| `drbl100` (validatedDRBL100) | Present on `PlayerSeason`; overlay via `fetchDrblSeason` |
| `r1Points` | `number \| null` — missing stays null |
| `r1WinEquivalents` | `number \| null` — P1 conversion when overlay present |
| Historical season metadata | `listDrblSeasons` / season-registry single source |
| Support / product status | Registry `historicalSourceQualityTier` vs `modelProductStatus` |

## Deprecated / non-canonical

| Field | Status |
|---|---|
| `drblWar` | Retained for storage/API compatibility only; not public canonical |
| Public plain WAR | Retired |
| UIR / UIR-C | Research-only; not public canonical |

## Web additions retained

- Explore board resilience (`getFilteredPlayerSeasonsDetailed`, health banners)
- ASK DRBL query engine types
- Team catalog / destination APIs
- Optional DARKO/LEBRON overlay fields (not substitutes for DRBL)

## Stale schemas

- No overwrite of `src/data/drbl/precomputed/*.json` by web branch
- Byte-identical vs analytics premerge for 2020-21…2025-26

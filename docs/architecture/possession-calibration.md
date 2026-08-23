# Official aggregates vs reconstructed possessions

## Boundary

| Layer | Type | Allowed product uses |
| --- | --- | --- |
| Provider-reported team possessions | `OfficialPossessionResult` from `boxscoreadvancedv3` | Future game-level pace / PPP **only when available** |
| Reconstructed possession sequences | `ReconstructedPossessionResult` from PBP | Explorer, sequence filters, future clutch/play-type after calibration |

Never label reconstructed row counts as official. Never invent zeros for missing official totals.

## Live historical totals (`0021500001`)

Prior bug: `getGamePossessions` never requested advanced boxes, so
`officialComparison` was always `"unavailable"` even when stats.nba.com had
`statistics.possessions`.

Repair: default path calls `fetchRawAdvancedBoxScoreDetailed` (stats → disk)
and resolves `OfficialPossessionResult` through the same extractor used by fixtures.

## Diagnostics

`GamePossessionResult.diagnostics` records advanced-box attempts and the
structured official result for server/CLI use. Public Possession Explorer does
not render diagnostics.

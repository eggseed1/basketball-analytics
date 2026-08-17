# UI metric integrity fix summary

## Classification
**H (other)** for the claimed identical DRBL 88/13 pattern: **not reproducible**.
Live `/players/202710?season=2025-26` league mode shows distinct percentiles
(WAR 94, /100 100, P 99, LN 96, B 100, O 98, D 73). Page also shows O-DPM=88
and 3PAr=13 — matching the numeric pattern on *other* metrics.

**G (metadata-zero contamination)** was a real residual risk: explore left-join
defaults (`drbl*?=0`, `uncertainty=0`) could enter the minutes cohort. Fixed by
`eligible: hasValidDrblEstimate` on all DRBL percentile defs.

## Fixes
- `src/data/queries/percentiles.ts` — per-metric eligible universe + percentileField
- `src/data/queries/players.ts` — career timeline merges DRBL artifact fields
- `src/components/player/player-savant-summary.tsx` — playback end resets to league view
- `src/lib/player-savant.ts` — career ranks skip DRBL default zeros
- tests: `drbl/models/__tests__/ui-metric-integrity.test.ts`

## Result
`PLAYER_PAGE_METRIC_INTEGRITY = PASS`

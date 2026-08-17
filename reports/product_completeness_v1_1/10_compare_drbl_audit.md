# 10 — Compare DRBL audit — P17.1 Phase B

**Status:** FIXED  
**Worktree:** `C:\Users\parkh\Projects\basketball-analytics-integration`  
**Related gaps (v1):** G02 (`/compare` ignores DRBL), G14 (season-compare / season-rank)

---

## Resolution summary

| Surface | Change | Status |
| --- | --- | --- |
| `/compare` | `METRIC_PICKERS` + `buildPlayerComparison` DRBL-first overall; R1 + O/D rows; DARKO under EXTERNAL group; `loadSeasonRow` merges peer DRBL fields | FIXED |
| season-compare | `attachDrblToPlayerSeasons` + impactSnapshot prefers valid `drbl100`; primary ability/realized rows; diagnostic P/LN/B with non-additive warning | FIXED |
| season-rank | Same overlay/impact path; league DRBL rank + selected percentile; R1 Points rank labeled distinctly (not “DRBL rank”) | FIXED |

## Hierarchy shipped

1. **Overall** when both sides valid: DRBL/100.  
2. Asymmetric DRBL → **Unavailable** (never cross-metric with DARKO).  
3. Both missing DRBL but both have DARKO → overall falls back to DARKO (labeled).  
4. Groups: `rate_ability` · `realized_value` · `external` · `box`.

## Firewall

No Approach-B / k / P1 / R1 formula / EPV / UIR / precomputed JSON / support-tier changes. Consume overlays only via `resolveNbaIdForDrbl` / `hasValidDrblEstimate` / `fetchDrblSeason` / `isDrblSeason`.

## Tests

- `npm run test:compare-drbl`
- Existing `test:player-season-compare` / `test:player-season-rank` remain green

## Visual QA remaining

- `/compare` with two DRBL-joined players in 2024-25 / 2025-26  
- One side without alias → Unavailable overall copy  
- season-compare diagnostic disclosure copy  
- season-rank DRBL vs R1 labeling

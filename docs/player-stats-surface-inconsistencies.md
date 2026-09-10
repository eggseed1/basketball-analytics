# Player stats surface inconsistencies

**Date:** 2026-09-05 (verified aligned)  
**Canonical source:** `src/lib/player-stat-sheet-registry.ts`  
(`SHEET_STAT_CATEGORY_CHIPS` · `SHEET_STAT_CATEGORY_ORDER` · `SHEET_STAT_DEFS` · `sheetStatOrderIndex`)

| Surface | Route | Alignment |
|---------|-------|-----------|
| **Statistics sheet** | `/players/[id]` · `#statistics` | Source of truth |
| **Percentile ranking** | `/players/[id]` · overview | Same categories / order (resolved via sheet ids) |
| **Explore players board** | `/explore/players` | Same chips (minus Hustle — no board data) |
| **Compare** | `/compare` | Same category order |
| **Career board** | player career table | Same chips / membership |

## Shared taxonomy

**Categories (order):** All → Impact → Profile → Shooting · Defense · Hustle · Advanced

Percentile / Compare omit **All**; Explore omits **Hustle** until board rows carry hustle fields.

**Membership sketch**
- **Profile** — MP, PTS, TRB, ORB, DRB, AST, TOV, PF, +/-
- **Shooting** — FG…TS%
- **Defense** — STL, BLK, STL%, BLK%, DRB%, DRtg, DBPM, DWS
- **Hustle** — Defl, Contest, ScrAst, Chrg, Loose, BoxOut
- **Advanced** — 3PAr, FTr, USG%, TOV%, AST%, ORB%, TRB%, AST/TO, ORtg, NET, PIE, PER, OWS, WS, WS/48, OBPM, BPM, VORP
- **Impact** — DARKO*, RAPTOR*, WAR, WAR1, DRBL*

**Rates (Explore + Statistics):** Per game · Totals · Per 100

**Legacy URL chips:** `counting` / `overview` → Profile; `rates` → Advanced; `ts` → Shooting

## Source files

- `src/lib/player-stat-sheet-registry.ts`
- `src/lib/explore-players-display.ts`
- `src/components/explore/player-season-table.tsx`
- `src/lib/player-percentile-metrics.ts`
- `src/components/players/player-percentile-panel.tsx`
- `src/components/players/player-stats-board.tsx`
- `src/components/players/player-career-board.tsx`
- `src/analytics/compare-players.ts`

## Remaining follow-ups

- Wire **Hustle** onto the Explore board when hustle overlay fields are present on season rows.
- Keep percentile panel legend/layout regressions covered by visual smoke after chart height changes.

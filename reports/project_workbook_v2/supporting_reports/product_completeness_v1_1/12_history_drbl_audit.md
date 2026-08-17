# 12 — History DRBL audit — P17.1 Phase B

**Status:** FIXED (History + Dashboard classification)  
**Worktree:** `C:\Users\parkh\Projects\basketball-analytics-integration`  
**Related gaps (v1):** G16 (historical DRBL leaders), G15 (dashboard), G11 (orphaned savant)

---

## Part A — `/history` — FIXED

| ID | Change | Status |
| --- | --- | --- |
| TM1 | `getHistoricalLeadersBundle` adds `drbl` leaders via `fetchDrblSeason` + approved identity | FIXED |
| TM2 | History page passes `leadersDrbl` / note | FIXED |
| TM3 | Snapshot renders DRBL/100 column when rows exist; note when unsupported season | FIXED |

**INTENTIONALLY_NOT_SUPPORTED:** all-time / GOAT / career cumulative DRBL leaders.

Registry seasons only: **2020-21 … 2025-26**.

## Part B — Dashboard — INTENTIONALLY_DEFERRED

| Label | Apply |
| --- | --- |
| SECONDARY_LAB | Yes |
| DEFER_DRBL | Yes |

Comment added on `src/app/dashboard/page.tsx`. No Contour DRBL investment in P17.1.

## Part C — Orphaned savant — unchanged policy

Do **not** remount Savant as parallel hierarchy. Snapshot remains canonical.

## Visual QA remaining

- Time Machine 2023-24 / 2025-26 shows DRBL/100 column  
- Pre-2020-21 season shows absence note, counting leaders only  
- Player links resolve with DRBL Snapshot when identity joins

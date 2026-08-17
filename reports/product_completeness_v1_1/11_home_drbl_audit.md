# 11 — Home DRBL audit — P17.1 Phase B

**Status:** FIXED  
**Worktree:** `C:\Users\parkh\Projects\basketball-analytics-integration`  
**Related gaps (v1):** G03 (home impact rail DARKO-first)

---

## Resolution summary

| ID | Change | Status |
| --- | --- | --- |
| H1 | `home.ts` parallel `fetchDrblSeason` (budgeted); `drblLeaders`; cache v8 | FIXED |
| H2 | Insights prefer `drbl-leader` / DRBL gap when overlay ok; DARKO secondary | FIXED |
| H3 | `TopPerformersPanel` default sort `drbl` when overlay ok; DRBL column; DARKO retained | FIXED |
| H4 | `page.tsx` passes DRBL props only — no layout redesign | FIXED |
| H5 | Findings subtitle mentions DRBL ability | FIXED |

## Soft-fail / honesty

- `drblFallbackNote` when overlay empty — explicitly says DARKO is **not** first-party DRBL.  
- Profile links prefer production-approved ESPN alias, else NBA id.  
- `ImpactLeaders` remains orphaned (not revived).

## Firewall

Read-only overlay consume; no model parameter changes.

## Visual QA remaining

- Home first paint with DRBL leaders populated  
- Soft-fail path (throttle DRBL) shows fallback note  
- Sort chips DRBL / DARKO / TS% / USG  
- “See all” → `sort=drbl100`

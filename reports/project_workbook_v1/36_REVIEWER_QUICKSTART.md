# 36 — Reviewer Quickstart

You are reviewing a **forensic workbook**, not a live training run.

## 1. Orient (10 minutes)

1. Open `00_PROJECT_FREEZE.json` — commits, seals, runtime  
2. Skim `37_CRITICAL_FACTS_CHEATSHEET.md`  
3. Read `01_MASTER_PROJECT_WORKBOOK.md` sections 1–8 and 19–23  

## 2. Trust boundaries

| Trust | Do not trust as model truth |
|---|---|
| Sealed hashes in freeze / `supporting_reports/research/` | Live ESPN board completeness |
| Precomputed DRBL overlays (regression 0 mismatches) | Unsealed notebooks or chat history |
| Season registry + Learn DRBL copy | UIR as public off-ball |
| Integration seal health | Invented next-milestone “results” |

## 3. Metric contract

Read `02_CANONICAL_METRIC_CONTRACT.md`:

```text
drbl100 = N/(N+1600)*rawAbilityRate
R1Points = ApproachBAttributedValue
R1WinEq = R1Points / 37.490662671779255
```

## 4. Evidence packs

| Topic | File |
|---|---|
| Attribution | `03_APPROACH_B_AND_ATTRIBUTION.md` |
| UIR / off-ball | `04_UIR_AND_OFFBALL_RESEARCH.md` |
| Validation numbers | `06_VALIDATION_EVIDENCE.md` |
| Historical tiers | `07_HISTORICAL_DATA_COVERAGE.md` + `08_SEASON_REGISTRY.csv` |
| Website | `11_…`, `12_ROUTE_MANIFEST.csv`, `14_DESIGN_SYSTEM.md` |
| API | `16_API_AND_DATA_CONTRACT.md` |
| Code excerpts | `critical_source_snapshot/` (44 files) |
| Raw seals | `supporting_reports/` |

## 5. Known debt (not model failure)

- ESPN ↔ NBA identity join  
- Live team-evidence fixture miss  

## 6. What is NOT done

```text
M17c = NOT_STARTED
M18b = NOT_STARTED (M18b.0 readiness only)
OFFBALL_VALUE_ESTABLISHED = NO
SCREENSHOTS_NOT_AVAILABLE
```

## 7. Safe continuation rules

- Do not modify model/product semantics from review alone  
- Do not invent seals  
- Do not publish UIR as canonical or as off-ball  
- New research → separate authorized branch/milestone  

Workbench path: `C:\Users\parkh\Projects\basketball-analytics-integration` on branch `integration/analytics-web`.

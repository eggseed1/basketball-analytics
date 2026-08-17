# 16 — API and Data Contract

**Audit basis:** `supporting_reports/integration/05_api_contract_audit.md` + `src/data/types/player-season.ts`.

## Canonical production fields (preserved)

| Field | Contract |
|---|---|
| `drbl100` | Validated DRBL/100; present when overlay joined |
| `r1Points` | `number \| null` — missing stays **null** |
| `r1WinEquivalents` | `number \| null` — P1 conversion when overlay present |
| Historical season metadata | `listDrblSeasons` / season-registry single source |
| Support / product status | `historicalSourceQualityTier` vs `modelProductStatus` |

## Ranking / eligibility

- Canonical rank: descending **unrounded** `drbl100`  
- Public board eligibility: existing minimum actual possessions (**50**)  
- R1 fields display when DRBL overlay present on eligible public row  

## Deprecated / non-canonical

| Field | Status |
|---|---|
| `drblWar` | Storage/API compatibility only; not public canonical |
| Public plain WAR | Retired |
| UIR / UIR-C | Research-only; not public canonical |
| `drblUncertainty` / interval fields | Legacy diagnostic only |

## Web additions retained (not DRBL substitutes)

- Explore board resilience / health banners  
- ASK DRBL query engine types  
- Team catalog / destination APIs  
- Optional DARKO/LEBRON overlay fields (`darkoDpm`, `lebron`, …)

## Provider / overlay

- Default Vercel path: ESPN-backed career/boards (`src/data/providers/index.ts`)  
- DRBL: `fetchDrblSeason` / precomputed artifacts — **do not overwrite** with web-branch schemas  
- Integration regression: precomputed `2020-21`…`2025-26` byte-identical vs analytics premerge  

## Live identity debt (product)

ESPN ↔ NBA Stats player-id join may leave live DRBL columns empty until mapping succeeds. This is **PRODUCT_DATA_INTEGRATION_DEBT**, not a sealed-metric mismatch.

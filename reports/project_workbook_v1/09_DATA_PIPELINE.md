# 09 — Data Pipeline

## Production path (website)

```text
External feeds (ESPN primary on Vercel; other providers as configured)
  → transformers (espn.ts, espn-career.ts, player-season-defaults.ts, …)
  → PlayerSeason / game / team domain types
  → queries (players.ts, …) + identity maps
  → DRBL overlay join via fetchDrblSeason / precomputed JSON
  → UI boards & destinations
```

DRBL numbers on boards are **not recomputed in the request path** from raw PBP; they load sealed/precomputed season artifacts (`src/data/providers/nba/drbl-loader.ts`, `src/data/drbl/precomputed/`).

## Offline / research path (model)

```text
Raw PBP archive / CDN historical import (M17a.*)
  → normalization (historical-pbp-normalized-v1)
  → processGame / quarantine
  → computeSeasonDrbl (R1 pool → Approach B → companions)
  → validated ability cutover / R1 value fields
  → season artifact JSON
  → optional milestone scripts (drbl-m17b, drbl-m18a, …) for seals
```

## Season registry

Single source: `drbl/historical/season-registry.ts` → re-exported by `src/data/drbl/season-registry.ts`. UI must not hardcode authoritative DRBL season lists.

## Identity & live debt

| Issue | Class | Effect |
|---|---|---|
| ESPN athlete IDs ≠ NBA Stats / DRBL player IDs | PRODUCT_DATA_INTEGRATION_DEBT | Live DRBL columns may appear empty until join succeeds |
| Team-evidence fixture live schedule sample | PRODUCT_DATA_INTEGRATION_DEBT | Fixture PARTIAL; environmental |

Precomputed artifact equality remains the regression authority for metric semantics.

## What this workbook excludes

Raw play-by-play archives are **not** packaged (size / sensitivity). Reviewers should use seals + critical source snapshot + precomputed contracts.

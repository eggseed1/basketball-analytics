# Sensitive file diff (analytics premerge → integration tree)

Analytics premerge: `72272b23fe6e037b6d463de2c840f1ad2980b562`

| Path | Result |
|---|---|
| `drbl/constants.ts` | unchanged |
| `drbl/models/compute-season.ts` | unchanged |
| `drbl/historical/season-registry.ts` | unchanged |
| `src/data/drbl/season-registry.ts` | unchanged |
| `src/data/drbl/precomputed/2020-21.json` | blob-equal |
| `src/data/drbl/precomputed/2021-22.json` | blob-equal |
| `src/data/drbl/precomputed/2022-23.json` | blob-equal |
| `src/data/drbl/precomputed/2023-24.json` | blob-equal |
| `src/data/drbl/precomputed/2024-25.json` | blob-equal |
| `src/data/drbl/precomputed/2025-26.json` | blob-equal |
| M17a.2 / M17b / M18a / M18b.0 seal artifacts | unchanged (hash match) |

Integration-only changes to data layer are adapters/UI contracts (`players.ts` Detailed API + DRBL overlay, optional advanced rates, Vercel provider fallback) — not model recomputation.

`MODEL_SEMANTICS_CHANGED_DURING_UI_MERGE` = **NO**

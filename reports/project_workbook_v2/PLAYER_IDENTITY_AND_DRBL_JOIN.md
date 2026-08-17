# Player identity and DRBL join

## Problem

Routes/boards often use **ESPN athlete ids**; sealed DRBL precomputed rows key on **NBA Stats player ids**.

## Solution (P17.1)

1. Build evidence-classed crosswalk (`scripts/build-player-id-crosswalk.ts`) → **v1.1**
2. Persist aliases to `data/impact/player-id-aliases.json`
3. Resolve via `src/data/identity/player-identity.ts` + loader `src/data/providers/impact/player-id-aliases.ts`
4. Overlay in `overlayDrblRows` / career enrichment (`src/data/queries/players.ts`); destination merge via `mergePlayerSeasonStats`

## Crosswalk v1.1 counts

Recorded from `supporting_reports/product_completeness_v1_1/02_player_crosswalk_freeze.json`:

| Item | Value |
|---|---|
| version | `player-crosswalk-v1.1` |
| aliasCount | **676** |
| VERIFIED_MULTI_FIELD | 270 |
| HIGH_CONFIDENCE_MULTI_FIELD | 349 |
| UNIQUE_NAME_ONLY | 57 |
| productionApproved | **619** (rate ≈ 0.9157) |
| Runtime policy | productionApproved only: `EXACT_PROVIDER_MAPPING` \| `VERIFIED_MULTI_FIELD` \| `HIGH_CONFIDENCE_MULTI_FIELD` |
| UNIQUE_NAME_ONLY at runtime | **NOT used** for silent production joins |
| 1642935 Chucky Hepburn | **UNRESOLVED** — no invented alias |

## Live join coverage (2025-26)

From `04_live_join_coverage.json`:

| Path | Board rows | Joined / estimate | Rate |
|---|---|---|---|
| NBA Stats PLAYER_ID board | 582 | 575 `hasValidDrblEstimate` | **0.987973** |
| ESPN byathlete (estimated) | 578 | 543 via productionApproved ∩ DRBL | **0.939446** |

Static verified (productionApproved) join: **0.920721** (2024-25), **0.944348** (2025-26). Any-alias file presence is higher (1.0 / 0.998261) and must not be confused with runtime approved joins.

## Honesty

- Do **not** claim 100% live ESPN board join
- Do **not** treat UNIQUE_NAME_ONLY as production join proof
- Do **not** invent IDs for unresolved DRBL rows

## Snapshot sources

`critical_source_snapshot/src/data/identity/player-identity.ts`, `.../impact/player-id-aliases.ts`, `.../queries/players.ts`.

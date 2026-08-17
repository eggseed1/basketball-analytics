# Legacy rank provenance reconciliation

## Statements

- **M16K0_OLD_RANK_DESCRIPTION**: `artifact.rank = descending legacy drbl100` (from `reports/m16k0/25_rank_surface_audit.csv`)
- **M16K1_OLD_RANK_DESCRIPTION**: `descending seasonWar / finalRankingScore` via `stableSortPlayers`

## ACTUAL_PRE_CUTOVER_CANONICAL_RANK_SOURCE

```text
stableSortPlayers(eligible) ordered by finalRankingScore
where rankingMode=season_value ⇒ finalRankingScore = seasonWar
then rank = index + 1
```

Evidence: pre-cutover `drbl/models/player-value.ts` + `leaderboard.ts` (`stableSortPlayers` / `finalRankingScoreFor`).

## DISCREPANCY_REASON

M16k0's rank-surface audit described the **ability-board scientific rank intent** (legacy `drbl100` ordering as the ability metric surface) for shadow comparison planning.

M16k1 correctly described the **actual production artifact `rank` assignment path**, which sorted by **season WAR** (`finalRankingScore`), not by `drbl100`.

These were **different ranking surfaces** being summarized under the ambiguous label "rank":

1. Ability metric ordering (legacy drbl100) — M16k0 audit lens
2. Serialized artifact `rank` field (WAR sort) — M16k1 cutover old-source lens

## Current validated rank

Unaffected. Current canonical DRBL rank remains:

```text
descending unrounded validatedDRBL100
```

with mismatch count 0.

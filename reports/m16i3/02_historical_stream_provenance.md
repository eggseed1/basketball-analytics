# Historical Approach-B stream provenance (M16i3)

## Source

- Attribution: `attributeGamePlayerValue` + `attributePossessionSequential` (`drbl-seq-attr-v1`)
- Replacement: history-only R1 pool via `buildReplacementPool` at fold `historyDateMax`
- Roles: history-only `finalizeRoleAccum`

## Appearance definition

One combined possession appearance = one on-court offense OR defense player-id on one possession.

For each appearance:

```
v_j = stable sequential credit share vs R1 replacement EP
```

Emitted chronologically via research-only `onAppearance` hook.

## Accounting identities

```
count(appearances for player) = N = accumulator.possessions
sum(v_j) = accumulator.totalValue
rawAbilityRate = 100 * sum(v_j) / N
```

## Chronology

Games sorted by `gameDate`, then `gameId`.
Possessions processed in stored order within each game.

## Future leakage

Only history games with `gameDate < futStart` enter the stream for each fold.
Future-block games are never attributed for feature construction.

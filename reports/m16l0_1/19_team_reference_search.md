# Independent team Approach-B reference search

## Candidates inspected

1. **`teamValueForGame` / `buildTeamWarRows` (`drbl/models/war.ts`)**  
   Per-game fresh player accumulator → sum `totalValue` by `accumulator.teamId`. Used historically for points→wins calibration. **Independent aggregation path** from player-team stint CSV construction when summed across games in the same attribution settings.

2. **Published precomputed artifacts**  
   Player-season only; no team Approach-B totals.

3. **Lineup / behavior / fusion team aggregates**  
   Not Approach-B sequential residual totals.

## Selected reference for additivity test

Per-game fresh `attributeGamePlayerValue` map team sums accumulated during M16l0.1 season build (`independentTeamValue`), compared to `sum observedRawStintAttributedValue` by team.

This is independent of reading the stint table back — it is a parallel aggregation from game-level accumulators.

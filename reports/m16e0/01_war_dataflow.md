# 2024-25 WAR dataflow (v4)

## Graph

```text
Approach B attribution
  totalValue (residual shares vs R1)
  possessions = off appearances + def appearances
        ↓
rawAbilityRate = 100 * totalValue / possessions
        ↓
fusedRateRaw (OOF P/LN/B)
        ↓
posteriorAbilityRate = EB(fused)     ← displayed DRBL/100
        ↓
warCalibrationAbilityInput = posterior
        ↓
LOO team calibration (through-origin):
  teamFeature = 5 * sum(posterior*n) / sum(n)
  teamTarget  = team netRating (pts/100)
  finalAbility = 0 + slope * posterior
  (2024-25 slope ≈ 5.835416607524311)
        ↓
replacementLevelDRBL100 = fringe median(finalAbility | 200–800 poss)
        ↓
aboveReplacement = finalAbility - replacement
        ↓
exposure = actualOnCourtPossessions (= off+def appearances)
        ↓
seasonImpactAboveReplacement = aboveReplacement * exposure / 100
        ↓
pointsPerWin = median(pointDiff / (wins - 0.5*games)) ≈ 38.714285714285715
        ↓
drblWar = seasonImpact / pointsPerWin
```

## Field lineage (pipeline-value.ts)

- **rawDRBL**: 100 * totalValue / actualOnCourtPossessions (residual points / 100 possessions)
- **posteriorDRBL**: w*fused + (1-w)*prior; w = n/(n+k) (residual points / 100 possessions (EB shrunk))
- **finalAbilityDRBL100**: intercept + slope * posteriorDRBL (calibrated points / 100 possessions)
- **replacementLevelDRBL100**: median(finalAbility | fringe sample) (points / 100 possessions)
- **DRBL_WAA**: finalAbility * n / 100 / pointsPerWin (wins)
- **DRBL_WAR**: (finalAbility - replacement) * n / 100 / pointsPerWin (wins)
- **position**: never invent proxy labels (categorical)
- **archetype**: argmax behavioral membership; no DRBL/WAR inputs (categorical + confidence)

## Key functions

| Step | File | Function |
|---|---|---|
| Attribution | `drbl/models/player-value.ts` | `attributeGamePlayerValue` |
| Rates | `drbl/models/player-value.ts` | `finalizePlayerSeasonRows` |
| LOO calib | `drbl/models/pipeline-value.ts` | `fitCalibrationLeaveOneOut` |
| Apply calib | `drbl/models/pipeline-value.ts` | `calibratePosterior` |
| WAR | `drbl/models/pipeline-value.ts` | `computeWAR` |
| Orchestration | `scripts/drbl-pipeline-remaster.ts` | main remaster |

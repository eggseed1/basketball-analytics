# M16g1 Full Audit

## Reproduction
PASS — k0/k200/k800 match M16g exactly.

## Lineage
- rawAbilityRate: UNSHRUNK Approach B PASS
- drblP: EB(k=200) PASS (match share=1.0000)
- fusedRateRaw: from SHRUNK components
- posteriorAbilityRate: EB(fused) PASS
- accidental double shrinkage: NO
- multi-stage production shrinkage: YES

## Zero semantics
REPLACEMENT_LEVEL; priorMean=0 VALID

## Extended curve
- k=0: RMSE=3.071604
- k=25: RMSE=2.969285
- k=50: RMSE=2.912720
- k=100: RMSE=2.849508
- k=200: RMSE=2.790001
- k=400: RMSE=2.741890
- k=800: RMSE=2.709840
- k=1200: RMSE=2.699580
- k=1600: RMSE=2.696096
- k=2400: RMSE=2.696035
- k=3200: RMSE=2.698869
- k=4800: RMSE=2.705734
- k=6400: RMSE=2.711812
- k=9600: RMSE=2.720863
- k=12800: RMSE=2.727019

## Decision
- NUMERIC_BEST_K=2400
- PRACTICAL_OPTIMUM_MIN_K=1600
- SELECTED_RESEARCH_K=1600
- FINAL_K_STATUS=PLATEAU_SELECTED
- curveTurned=true plateau=true

## Production
unchanged

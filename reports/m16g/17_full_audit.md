# M16g Full Audit

## Selection
- **STRONG_SHRINKAGE_SELECTED**
- SELECTED_RESEARCH_K = **800**
- priorMean = 0
- best positive k = 800 (relImp=11.778%, P(beat k0)=1.000, clears=true)

## Pooled RMSE
- k=0: RMSE=3.071604
- k=25: RMSE=2.969285
- k=50: RMSE=2.912720
- k=100: RMSE=2.849508
- k=200: RMSE=2.790001
- k=400: RMSE=2.741890
- k=800: RMSE=2.709840

## Legacy k=200
- status: **SUPPORTED**
- Δ vs k0 = -0.281603 (rel 9.168%)
- Q1 RMSE k200=4.1040 vs k0=4.7793
- Q4 RMSE k200=1.7205 vs k0=1.7353

## Q1 small-sample (best positive vs k0)
- RMSE Q1 k0=4.7793 best=3.9640 Δ=-0.8153

## Fold consistency (best positive k=800)
- beats k0: 5
- loses to k0: 0

## Production
- unchanged
- RESERVED_TEST not accessed
- VALIDATION not used for k selection

## Historical M16c context (non-binding)
M16c reported EB(k=200) on fusion predictions worsened VAL RMSE (~+0.024). TRAIN-only M16g selection is locked independently; consistency discussed in audit only.

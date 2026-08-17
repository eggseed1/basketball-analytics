# PPW identifiability proof

## Algebra

```text
WAR_P1 = PointValue / P1
WAR_P0 = PointValue / P0
⇒ WAR_P1 = (P0/P1) * WAR_P0
```

Free-slope regression `Wins = a + b*WAR + e` absorbs the scale:

```text
b_P1 = (P1/P0) * b_P0
```

Therefore free-slope RMSE/R²/Pearson/Spearman cannot identify PPW.

## Numerical check (development)

Using PointValue = selected candidate team points and demo P1=35 vs P0=30:

- max |pred_free_P0 - pred_free_P1| = 1.4210854715202004e-14
- free-slope b rescaling check: PASS

```text
FREE_SLOPE_PPW_IDENTIFIABILITY = NOT_IDENTIFIABLE
FREE_SLOPE_REGRESSION_USED_TO_SELECT_PPW = NO
```

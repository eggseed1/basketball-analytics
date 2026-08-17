# Uncertainty compatibility (M16g2)

## Current formula (production)
Source: `drbl/models/uncertainty.ts` + disagreement from `leaderboard.ts` / `player-value.ts`.

```text
rawScale = 1/sqrt(max(1, N)/100) + disagreementCoef * disagreement
halfWidth = scaleMultiplier * rawScale   (OOF-calibrated coverage)
```

Disagreement is a scale-standardized SD across **P / LN / B** component z-scores
(`estimatorDisagreement(drblP, drblLn, drblB)`).

## Classification

| Term | Status |
|------|--------|
| sample-size term `1/sqrt(N/100)` | still semantically valid for any rate |
| disagreement (P/LN/B) | legacy-fusion-specific |
| OOF calibration vs fused target | legacy-fusion-specific / needs redesign |
| published interval around `drbl100` | needs redesign for P-only research ability |

## Verdict
`UNCERTAINTY_COMPATIBILITY = REDESIGN_REQUIRED`

`UNCERTAINTY_REDESIGN_REQUIRED = YES`

No new uncertainty model is invented in M16g2.
Research shadow display contract excludes uncertainty for now.

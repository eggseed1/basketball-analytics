# Uncertainty semantics (M16i)

## Estimand
For each chronological player-fold observation:

```text
prediction = FINAL_RESEARCH_DRBL100 = N/(N+1600)*rawAbilityRate
target     = future_block_residual_per_100
error      = target - prediction
```

M16i intervals estimate the **empirical range of future player-impact outcomes**
around the locked current DRBL/100 estimate under the historical development distribution.

The interval combines:
- point-estimate error
- future-performance variation
- residual outcome noise present in the future-block target

## Interval type
`EMPIRICALLY CALIBRATED PREDICTIVE INTERVALS`
(rolling standardized-residual quantiles × exposure-only scale)

## Does NOT claim
- Bayesian credible intervals for true talent
- frequentist confidence intervals for latent ability
- causal-effect intervals

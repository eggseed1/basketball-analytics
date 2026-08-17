# Future uncertainty feature hypotheses (M16i2)

Hypothesis generation ONLY. Not implemented or evaluated in M16i2.

## Status

Exposure-only research under the current protocol:
`STOPPED_FOR_CURRENT_PROTOCOL`

## Why more N-curves are not next

M16i / M16i1 / M16i2 already tested constant, inverse-sqrt, floor+sampling,
direct quantiles, three-regime, and monotone logN PWL families on the same
TRAIN-development chronological folds. Further knot/bin flexibility on the
same outcomes would be gate-chasing.

## Candidate prediction-time reliability information (future protocols)

1. Historical temporal volatility of the player's own raw P estimates
2. Split-half or rolling-window instability of historical ability
3. Within-season possession-value variance
4. Historical role/context instability
5. Lineup/context support measures known at prediction time
6. Team-change / role-change indicators known at prediction time

## Explicitly excluded from automatic resurrection

- P/LN/B disagreement (requires separate preregistered justification)
- Future exposure / future minutes
- Player/team identity embeddings
- Asymmetric intervals (unless a dedicated asymmetry milestone)

## Constraint

Any next milestone must be a **new preregistered uncertainty generation**,
not iterative retuning of exposure-only curves on F1–F5.

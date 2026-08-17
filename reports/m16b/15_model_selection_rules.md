# Model selection rules (frozen before M16c)

- 1. Reject candidates materially worse on primary VALIDATION RMSE (paired CI excludes 0 improvement).
- 2. Among statistically indistinguishable models, prefer better calibration (slope nearer 1, intercept nearer 0).
- 3. If still tied, prefer simpler model (fewer components / fewer free parameters).
- 4. Rank correlation and top-k overlap are secondary and never override (1)–(3).

Primary metric: **validation_rmse** — RMSE of model predictions vs frozen future-impact / residual target on VALIDATION entities

Practical significance: paired block-bootstrap CI required; categories statistically_supported_improvement, practically_meaningful_improvement_TBD_with_CI, indistinguishable, worse.

Eligibility: {
  "version": "drbl-eligibility-v1",
  "minPossessions": 50,
  "minFutureObservations": 20,
  "competition": "regular_season_only",
  "tradedPlayerAggregation": "player_season_pooled",
  "missingComponent": "null_or_redistribute_per_fusion_rules",
  "entity": "player_season"
}

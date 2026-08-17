# M16g2 full audit

## Freeze
- git: `629bb1b790bef21020940122194772b6921569ff`
- dirty: true
- protocol: `drbl-eval-v1`
- hashes: TRAIN/VALIDATION/RESERVED_TEST match expected

## Research contract
`rawAbilityRate → EB(k=1600, prior=0) → researchDRBL100` with exactly one posterior layer.

## Proofs
- M16g1 reproduction: **PASS** (k1600 RMSE=2.6960956582451727)
- Single-posterior identity: **PASS**
- Fusion independence: **PASS**
- Pseudo-exposure: **NO**
- O/D: RAW_OD_DECOMPOSITION=FAIL, RESEARCH_OD_STATUS=NOT_CANONICAL_YET
- Uncertainty: REDESIGN_REQUIRED
- Production changed: NO
- RESERVED_TEST predictive metrics: NO

## Shadow (2024-25 development artifact)
- n=555
- legacy mean/SD: -0.1133 / 0.6157
- research mean/SD: 0.0182 / 0.6390
- Pearson=0.7975, Spearman=0.8050

## Ranking sensitivity (descriptive only)
{
  "Spearman": 0.8052051402102047,
  "top10_overlap": 0.4,
  "top25_overlap": 0.44,
  "top50_overlap": 0.56,
  "top100_overlap": 0.64,
  "mean_abs_rank_change": 71.96396396396396,
  "used_for_model_selection": "NO",
  "researchRank_definition": "descending researchDRBL100 (research artifact only)",
  "productionDefaultRankingMode": "season_value"
}

## Charts
- charts/diff_vs_exposure.svg
- charts/legacy_distribution.svg
- charts/legacy_vs_research_scatter.svg
- charts/rank_displacement_hist.svg
- charts/rank_scatter.svg
- charts/raw_vs_posterior.svg
- charts/reliability_curve.svg
- charts/reliability_vs_exposure.svg
- charts/research_distribution.svg
- charts/shrinkage_vs_N.svg

## Recommendation
Next scientific milestone: post-posterior **calibration** selection (without reopening RESERVED_TEST prematurely).
Next engineering milestone: uncertainty redesign compatible with P-only ability.
Production deployment: **NO**.

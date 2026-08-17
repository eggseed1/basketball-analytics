# BASELINE_M16A lineage (M16j0.1)

## Registry

- experimentId: `BASELINE_M16A`
- modelVersion: `m16a-full-season-repaired`
- fusionVersion: `drbl-fusion-oof-v1`
- posteriorVersion: `eb-fused-v1` (code: `eb-fused-v1`)
- attribution: `drbl-seq-attr-v1`
- components: P, LN, B, fusion_oof, posterior_eb

## Canonical prediction for one historical player row (published definition)

```
season chronological games
  │
  ├─ R1 replacement pool (built from FULL season game set in compute-season / m16c-dataset)
  │
  ├─ earlyFrac=0.7 chronological cut
  │     early games → P (Approach B) + LN (ridge λ=800) + B (ridge λ=40)
  │     late games  → Y = future_block_residual_per_100
  │
  ├─ fitFusionOof(stackRows)  ← REQUIRES late-block Y (targetPer100)
  │     → fusedRateRaw (OOF yhat per player)
  │
  └─ empiricalBayesRate(fusedRateRaw, n_FULL_SEASON, priorMean=0, k=200)
        → posteriorAbilityRate / drbl100
```

Exact scalar:

```
drbl100 = N_full/(N_full+200) * fusedRateRaw_OOF
```

where `fusedRateRaw_OOF` is the within-season out-of-fold fusion prediction of
`future_block_residual_per_100` trained using late-block residuals.

## Fixed-fit status (M16b)

Fusion fixed-fit scoring (`scoreFull_fixedFit`) was documented as **PARTIAL / NOT_IDENTIFIABLE**
until a harness applies frozen fold betas. That harness was **not** completed as part of
BASELINE_M16A. Therefore cross-season application of `reports/m15/freeze/fusion-2024-25.json`
weights is **not** the frozen BASELINE evaluation procedure.

## BASELINE_M16A_MODIFIED

`NO` — audit only; no source edits.

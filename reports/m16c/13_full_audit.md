# M16c full audit

## Freeze

- protocol: drbl-eval-v1
- TRAIN hash: 7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550
- VALIDATION hash: 4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0
- RESERVED_TEST hash: e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce (hash-verified only; not used for metrics)
- reservedTestAccessed: false
- VALIDATION_ROWS_USED_IN_FIT: 0

## Dataset

- TRAIN games loaded: 737
- VAL games loaded: 488
- earlyFrac: 0.7
- TRAIN stack N: 434
- VAL stack N: 419

## Winner

**M16C_P** RMSE=2.409176880654843

## Component classes

- LN: B_standalone_little_incremental
- B: D_no_meaningful_validation_signal

## Why P-dominant fusion historically

- 1. P dominates because it predicts Y much better standalone.
- 5. Component scaling causes effective suppression (B SD << P SD).

## Posterior

- flag: POSTERIOR_INCREMENTAL_VALUE_UNPROVEN
- raw RMSE: 2.409176880654843
- posterior RMSE: 2.4334342620486393

## Statuses

- M16C_SPLITS_MATCH_M16B: "PASS"
- RESERVED_TEST_ACCESSED: "NO"
- TARGET_UNCHANGED: "PASS"
- ELIGIBILITY_UNCHANGED: "PASS"
- CANDIDATE_SAMPLE_EQUALITY: "PASS"
- P_STANDALONE_COMPLETE: "PASS"
- LN_STANDALONE_COMPLETE: "PASS"
- B_STANDALONE_COMPLETE: "PASS"
- PAIRWISE_ABLATIONS_COMPLETE: "PASS"
- FULL_FUSION_COMPLETE: "PASS"
- INCREMENTAL_RESIDUAL_TEST_COMPLETE: "PASS"
- FUSION_WEIGHT_DIAGNOSTICS_COMPLETE: "PASS"
- POSTERIOR_ABLATION_COMPLETE: "PASS"
- M6_CHANGED: "NO"
- APPROACH_A_RUN: "NO"
- WAR_CHANGED: "NO"
- MODEL_FORMULAS_CHANGED: "NO"
- VALIDATION_ROWS_USED_IN_FIT: 0
- reservedTestAccessed: false
- FUSION_CONSTRAINT_SUPPRESSION: false
- LN_EXTREME_CALIBRATION_RISK: false
- POSTERIOR_FLAG: "POSTERIOR_INCREMENTAL_VALUE_UNPROVEN"
- LN_CLASS: "B_standalone_little_incremental"
- B_CLASS: "D_no_meaningful_validation_signal"
- B_SCALE: {"rawB_SD":0.21256280506830694,"rawP_SD":1.227686212729074,"rawLN_SD":1.6907503776776154,"final_wB":0.06879998292602353,"effectiveContributionSD_B":0.01462431735940718,"normalization":"none_in_fusion_ridge_feature_space"}

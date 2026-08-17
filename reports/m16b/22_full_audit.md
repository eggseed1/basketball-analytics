# M16b Full Audit

evaluationProtocolVersion: drbl-eval-v1

## Health

```json
{
  "SPLITS_FROZEN": "PASS",
  "SPLIT_OVERLAP": "PASS",
  "CHRONOLOGY": "PASS",
  "RESERVED_TEST_GUARD": "PASS",
  "TARGET_DEFINITIONS_FROZEN": "PASS",
  "TARGET_LEAKAGE": "WARNING",
  "OOF_FOLD_ASSIGNMENTS_SERIALIZED": "PASS",
  "OOF_FOLD_MODELS_SERIALIZED": "PASS",
  "OOF_PREDICTIONS_SERIALIZED": "PASS",
  "OOF_RECONSTRUCTION": "PASS",
  "FIXED_FIT_VS_REFIT_AVAILABLE": "PARTIAL",
  "METRIC_CONTRACT_FROZEN": "PASS",
  "MODEL_SELECTION_RULES_FROZEN": "PASS",
  "EXPERIMENT_REGISTRY": "PASS",
  "BASELINE_REPRODUCIBLE": "PASS",
  "MODEL_MATH_CHANGED": "NO",
  "details": {
    "trainSplitHash": "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550",
    "validationSplitHash": "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0",
    "reservedTestSplitHash": "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce",
    "protocolHash": "3b94a502d95279dc0c28e9795d9ea2a218d039c17e59ec337e8774e35fb38867",
    "oofReconstructionMaxResidual": 0,
    "oofReconstructionFailures": 0,
    "reservedTestAccessedDuringM16b": false,
    "comparisonGuardDemo": "COMPARISON_INVALID",
    "nodeVersion": "v24.19.0",
    "packageLockSha256": "fcd3686f67e36719cf30f4ba022d5544f31e21a5f0faef71050ec883096f9783",
    "fusionSeed": "none_chrono_mod_folds"
  }
}
```

## STOP

Await approval before M16c. Do not execute component ablations.

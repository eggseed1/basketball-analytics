# M16l1.1 full audit

## Scale anomaly

Reproduced. Free slope NetPoints~W0 ≈ **2.181**.

## Primary explanation

Approach-B accumulates **Y − V0** residuals. Team algebra:

```text
ActualNetPoints = Attributed + (Σ_off V0 − Σ_def V0) + Unobserved
```

Validating `ActualNetPoints ~ constant + Attributed` omits a **variable baseline**.

Baseline-aware / residual-minus-U diagnostics move attributed free slope toward 1 (`b≈1.000` on accounting attributed).

## Hold

```text
M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED = NO
NEXT = M16l1.2_BASELINE_AWARE_WAR_DEVELOPMENT_REFREEZE
```

P1 preserved. No empirical ×2.18 rescue. DRBL untouched.

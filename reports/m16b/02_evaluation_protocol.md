# Evaluation protocol drbl-eval-v1

## Design

Only 2024-25 and 2025-26 full caches available. TRAIN=early 60% of 2024-25, VALIDATION=late 40% of 2024-25, RESERVED_TEST=entire 2025-26. Boundaries fixed for chronology, not performance.

## Splits

| Split | Games | Hash |
|-------|------:|------|
| TRAIN | 737 | `7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550` |
| VALIDATION | 488 | `4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0` |
| RESERVED_TEST | 1225 | `e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce` |

protocolHash: `3b94a502d95279dc0c28e9795d9ea2a218d039c17e59ec337e8774e35fb38867`

## Layers

- TRAIN: fit parameters
- VALIDATION: model selection / ablations (M16c+)
- RESERVED_TEST: final evaluation only (guarded)

## Primary metric

validation_rmse

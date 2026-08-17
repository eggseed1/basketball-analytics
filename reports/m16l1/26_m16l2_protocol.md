# M16l2 one-shot WAR reserved test protocol

## Precondition

Reproduce `WAR_PRE_RESERVED_FREEZE_HASH = 21abd1c7e503dde633fa7ff7a53fab59aeba29caf7b95684830d7400028d850c` before opening 2025-26 outcomes.

## Primary tests

### Q1 — Point scale
`actualNetPoints = a + selectedTeamPoints + e` (slope 1 fixed)

### Q2 — Win scale
`actualWins = a + selectedTeamWAR + e` (slope 1 fixed)

### Q3 — Free-slope diagnostic
`actualWins = a + b*selectedTeamWAR + e` — report b; do not rescale.

## Success rule

- no accounting failures
- fixed-slope team WAR calibration finite
- free-slope b > 0
- no catastrophic team-level anomaly
- selected PPW reserved-supported if fixed-slope win RMSE <= PPW30 benchmark RMSE (bootstrap reported; no post-hoc change)

## Forbidden

- reopen W0/W1
- refit PPW
- rescale by free slope
- change live WAR

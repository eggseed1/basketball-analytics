# Lineup target contract (m18-lineup-impact-v1)

## Target

```text
y_p = possession.points   # scoreboard points on possession p
```

## Orientation

Offense scores; defense prevents.

## Design

- NET mode: offense +1, defense −1, home, intercept
- OD mode: separate L_O and L_D indicators (+ home + intercept)

## Policies

- Require 5v5 lineups (incomplete possessions excluded)
- No garbage-time filter (frozen: none)
- Technical FT / end-of-period: inherit possession builder scoring
- Unit of coefficient: points per possession
- Published L scale for residualization: **per 100** (= coef × 100)

## Garbage-time

NONE (no filter) — frozen before results.

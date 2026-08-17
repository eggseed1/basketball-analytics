# Team replacement baseline contract

## Player level

If player rates are already R1-zero:

```text
ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION = NO
```

## Team validation

```text
actualWins_t ≈ a_season + b * teamWAR_t + error
```

Interpretation:

- `a_season` ≈ expected wins of a replacement-level team (league/season intercept)
- `b` ≈ 1 if WAR is in win units

`a_season` is **not** encoded by subtracting replacement again from every player.

`TEAM_REPLACEMENT_BASELINE_SEPARATE_FROM_PLAYER_SUBTRACTION = YES`

# R1 definition forensics

## Candidate universe

Season players with `offPoss+defPoss ≥ 40`, frozen at season cutoff.

## Residual for ranking

Equal-share of `(Y − EPV(S))` on offense and `−(Y − EPV(S))` on defense vs **raw EPV**, not vs V_R.

## Pool selection (`buildReplacementPool`)

1. Sort by meanResidual ascending
2. Take bottom 40%
3. Prefer minutes/game in [8, 32]; fallback if <5
4. Cap ~80 candidates

## Role matching

k=8 nearest by weighted Euclidean on (usage, threeRate, starterRate, mpg).
Target role = usage-weighted mean of **current offense lineup** roles.

## Context dependence

- Team roster filter: **NO**
- Possession state S enters EPV(S): **YES**
- Lineup role mix enters V_R adj: **YES** (player-specific via lineup)
- Teammate/opponent identity in pool: **NO**

## Quality restriction

Lower residual quintile (bottom 40%) — **not** a pure fringe minutes definition alone; minutes band is secondary.

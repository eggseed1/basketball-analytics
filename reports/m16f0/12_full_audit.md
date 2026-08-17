# M16f0 full audit

## Verdict

`APPROACH_A_V1_FEASIBILITY = READY_AFTER_ENGINEERING`
`COUNTERFACTUAL_EPV_FEASIBLE = PARTIAL`

Product decisions 1–12 are **locked**.

Pure M5 cannot implement Approach A (`PLAYER_SWAP_CHANGES_EPV_INPUT = NO`).

Only existing path: composite `V = EPV + LN_residual` with TRAIN-only LN fit, R1 role-matched replacements restricted to supported coefficient IDs, deterministic, no Monte Carlo.

## Do not yet

- Full M16f A vs B validation bakeoff
- Production P change
- WAR / posterior changes
- Inventing a new player-feature EPV without an engineering milestone

## Next

1. Product approve LN-composite as Approach A v1 value engine (with confound disclosure), **or**
2. Engineering milestone: build a possession EPV that conditions on player/lineup features without collapsing to LN.
3. Then restart M16f bakeoff.

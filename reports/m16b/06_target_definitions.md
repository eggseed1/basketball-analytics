# Target definitions (frozen documentation — no redesign)

evaluationProtocolVersion: drbl-eval-v1
targetVersion: drbl-targets-v1

## Primary production fusion target (current)

**name:** future_block_residual_per_100  
**formula:** Early chronological game block → player residual rate features; Y = late-block residual points per 100 possessions within the same season (`earlyFrac` in compute-season).  
**unit:** residual points / 100 possessions  
**time horizon:** within-season future block (see EVALUATION_HORIZONS.short/medium)  
**source fields:** early Accumulator totals / possessions; late Accumulator totals / possessions  
**normalization:** per-100 possessions  
**min sample:** early players with late possessions ≥ 20  
**input overlap:** Features from early block only; target from later games (same season)

## Other documented targets (not redesigned)

| name | formula / notes | horizon |
|------|-----------------|---------|
| continuation_outcome | M6/M7-CV continuation points | same possession post-decision |
| lineup_residual | LN ridge target possession residual | possession |
| war_team_net | team net rating vs sum of player WAR inputs | season |
| next_season_player_impact | player residual/impact next season | long |

Horizons: short, medium, long

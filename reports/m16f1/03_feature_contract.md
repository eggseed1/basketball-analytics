# Feature contract — drbl-counterfactual-epv-v1

## Possession-start state (M5)
period, clockSeconds, scoreDiff, offenseIsHome (via epvFeatureVector / stateBasis)

## Player representation
Player ID main effects (offense + defense)

## Interactions
- player × stateBasis(clockNorm, scoreDiff/20, periodGe4, home)
- player × teammateRoleAggregate (exclude focal)
- player × opponentRoleAggregate

## Role/tendency
RoleVector {usage, threeRate, starterRate, minutesPerGame} rebuilt from ENGINE_FIT only.

## Replacement
R1 pool from ENGINE_FIT; k=8 equal weight.

## Leakage
No post-outcome features.

# Identity leakage protocol (future M18b)

## Risk

A tracking model that includes raw player identity can learn “Player X is good” and attribute it to movement features.

## Required audits (when modeling starts)

1. **Player-neutral spatial state:** features computed from coordinates/roles without player ID in the value function.
2. **Cross-fitted identity:** if player effects exist, estimate OOF (never score a player with identity fit on their own evaluation frames).
3. **Role controls:** usage / three-rate / starter / mpg / creation axes — not listed position alone.
4. **Ablation:** drop identity; require spatial features retain predictive content.

## Forbidden

- Training on reserved season
- Tuning features by inspecting named leaderboards before freeze

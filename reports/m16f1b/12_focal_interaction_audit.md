# Focal interaction audit

## Architecture reminder
Per-player blocks: main + state interactions.
Shared blocks: offense-role⊗state and defense-role⊗state.

## Under offensive focal swap i→r
| Component | Changes? | Mechanism |
|---|---|---|
| stateInteraction | 8334/8334 non-zero | (γ_i − E[γ_r]) · state |
| teammateComposition | 8334/8334 non-zero | shared Θ · (roleMean_actual − roleMean_rep) ⊗ state |
| opponentComposition | 0/8334 non-zero (expect ~0 on offense swaps) | defense mean role unchanged |

## Interpretation
- State interactions are **focal-specific** (per-player γ).
- Teammate/shared offense-role⊗state terms **do** change under substitution because the offense role mean includes the focal slot.
- Opponent shared terms do **not** change for offense-focal swaps (defense lineup fixed).

Prior M16f1 claim that contextual variation exists under focal swaps is **supported**.

FOCAL_CONTEXT_INTERACTIONS_VALID = PASS

Note: initial panel audit reported 0/0 due to empty known-replacement filtering on the stratified panel; this repair re-audits on holdout possessions with ≥1 known R1 neighbor in the coefficient set.

# Counterfactual identification risks

## Invalid baselines (do not use)

- remove the player
- freeze player in place
- teleport player
- replace with league-average coordinate without behavioral model

## Multi-agent interference

Changing one player’s path changes defenders, teammates, and ball-handler decisions. Holding nine players fixed is usually **not** a valid causal counterfactual.

## M18b Stage 1 stance

Prefer **association** tests:

```text
Does UIR correlate with spatial behavior features
after role/context controls?
```

Causal OBV / counterfactual tracking-EPV is **NOT** justified in M18b.0.

COUNTERFACTUAL_OBV_FEASIBLE = NOT_YET (requires licensed continuous tracking + behavioral model + identification strategy)

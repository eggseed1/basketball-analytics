# Spatial feature contract (measurements only)

These are **observables**, not value. No points assigned in M18b.0.

## Offense primitives (feasibility if T0/T1)

| Feature | Needs | Feasible with SportVU frames | Feasible with T2 aggregates |
|---|---|---|---|
| nearest-defender distance | player+ball frames | YES | PARTIAL (shot buckets only) |
| defender displacement | trajectories | YES | NO |
| team spacing area | 5 offensive coords | YES | NO |
| pairwise teammate distance | coords | YES | NO |
| paint / corner occupancy | coords | YES | NO |
| cut velocity / direction | trajectories | YES | NO |
| relocation distance | trajectories | YES | NO |
| screen geometry | trajectories + events | PARTIAL | PARTIAL (screen assists count) |
| roll/pop trajectory | trajectories | YES | NO |
| gravity prerequisites | counterfactual-ready geometry | PARTIAL (measure only) | NO |

## Defense primitives

| Feature | Needs | T0/T1 | T2 |
|---|---|---|---|
| help distance | coords | YES | NO |
| rotation distance/time | trajectories | YES | NO |
| rim / drive deterrence proxies | ball path + defenders | PARTIAL | NO |
| denial / passing-lane geometry | coords | YES | NO |
| closeout distance/time | trajectories | YES | NO |
| screen navigation / recovery | trajectories | YES | NO |

## Firewalls

- gravity ≠ mean defender distance alone
- spacing value ≠ mean teammate distance alone
- No UIR relabel as off-ball

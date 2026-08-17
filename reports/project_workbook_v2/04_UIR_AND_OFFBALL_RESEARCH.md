# 04 — UIR and Off-Ball Research

**Do not relabel UIR as off-ball.**  
**UIR_PUBLIC_CANONICAL = NO.**

---

## M18a — Unexplained Impact Residual (UIR)

| Item | Value | Class |
|---|---|---|
| Seal | `ba98a6529b18d63ab825eab92f1b606a974b4950b3d1c879eb5378054427391f` | ESTABLISHED |
| Reserved verdict | STRONG_PASS | ESTABLISHED |
| Selected candidate | UIR-C | ESTABLISHED selection |
| UIR_STATUS | PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED | ESTABLISHED |
| OFFBALL_VALUE_ESTABLISHED | **NO** | ESTABLISHED negative |
| Lineup model | `m18-lineup-impact-v1` | EXPERIMENTAL sidecar |
| Target unit | scoreboard_points_per_possession | |
| Ridge grid | 50, 200, 800, 3200, 12800 | |
| Selected λ | 3200 | |
| Train seasons | 2020-21, 2021-22 | |
| Validation pair | 2022-23→2023-24 | |
| Reserved pair | 2023-24→2024-25 | |
| 2025-26 used | NO | |
| DRBL v1 reopened | NO | |
| External metrics as target | NO | |
| Player reputation tuning | NO | |

### Interpretation

M18a establishes that a **persistent player residual** beyond DRBL-P / P_RAW can improve certain next-season residual prediction targets under the sealed protocol.

It does **not** establish:

- that the residual is optical off-ball value  
- that tracking features explain the residual  
- that UIR should appear on public boards as canonical  

---

## M18b.0 — Tracking readiness (not M18b execution)

| Item | Value |
|---|---|
| Seal | `ade47897cd8ca7c0786bee5d0925e86778c2f27c122e5cd332076e7d259e1763` |
| Local tier | **T3** (shot x/y aggregates only in workspace posture) |
| Acquisition status | **POSSIBLE_REQUIRES_USER_ACCESS** |
| Readiness verdict | TRACKING_ACCESS_REQUIRED |
| Full-frame source found locally | NO |
| Tracking games available | 0 |
| Player/ball coordinates | NO |
| Public historical tracking | SportVU 2015-16 (method prototype only; **no UIR-era overlap**) |
| M18B method prototype authorized | YES |
| M18B player-value validation authorized | **NO** |
| M18b full milestone | **NOT_STARTED** |

### Why access matters

Mediating UIR with spatial offense/defense features needs licensed modern optical (Second Spectrum / Hawk-Eye class) overlapping validation/reserved eras. T2 aggregates are insufficient for tracking-EPV / counterfactual OBV. Ordinary PBP cannot identify gravity/spacing/deterrence.

---

## Firewall statements (must hold)

```text
UIR_RELABELED_AS_OFFBALL = NO
UIR_REFIT_FOR_TRACKING = NO
M18A_UIR_CHANGED = NO
DRBL_V1_REOPENED = NO
```

---

## Parallel path

`M17C_STATUS = AUTHORIZED_INDEPENDENT_PARALLEL_BRANCH` — **NOT_STARTED** in this package.

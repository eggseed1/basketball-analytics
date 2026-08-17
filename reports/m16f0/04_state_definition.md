# Possession-start state definition (Approach A v1)

## Timing

```text
POSSESSION_START_STATE
```

Evaluated at the start of the possession (same moment as M5 EPV / LN row construction).

## Fields (M5)

| Field | Source | Class |
|---|---|---|
| period | possession / clock | PRE_POSSESSION_AVAILABLE |
| clockSeconds | period clock at start | PRE_POSSESSION_AVAILABLE |
| offenseIsHome | box + offense team | PRE_POSSESSION_AVAILABLE |
| scoreDiff | offense − defense | PRE_POSSESSION_AVAILABLE |

## Fields (lineup-conditioned V, if approved)

| Field | Source | Class |
|---|---|---|
| offensePlayerIds[5] | possession lineup | PRE_POSSESSION_AVAILABLE |
| defensePlayerIds[5] | possession lineup | PRE_POSSESSION_AVAILABLE |

## Explicitly excluded from V features

- actual possession points
- shot/turnover/rebound outcomes
- mid-possession events
- validation target Y
- future lineup changes

## Future information included

**NO** (for Approach A counterfactual scoring)

## Preferred composite value (engineering candidate)

```text
V(s0, L) = EPV_M5(s0) + LN_residual(L; β_TRAIN)
```

Pure `EPV_M5(s0)` alone is **not** Approach-A-capable (`PLAYER_SWAP_CHANGES_EPV_INPUT = NO`).

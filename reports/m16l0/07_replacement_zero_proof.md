# Replacement-zero proof

## Approach B / R1

Credits are `actual − replacementExpectedPoints(R1)` (role-matched). Therefore:

```text
rawAbilityRate = 0  ⇒  replacement-level Approach-B impact
```

Evidence: `drbl/models/replacement.ts`, sequential attribution, `reports/m16g1/06_zero_semantics.md`.

## Validated DRBL

```text
validatedDRBL100 = N/(N+1600)*rawAbilityRate
priorMean = 0
```

Shrinks toward the same R1-centered zero. Therefore:

```text
validatedDRBL100 = 0  (with N>0)  ⇒  replacement-level estimated impact
```

## PLAYER_LEVEL_ZERO_IS_REPLACEMENT

```text
YES
```

## Contrast: WAR 4.0.1 fringe replacement

2024-25 calibrated WAR subtracts `replacementLevelDRBL100 = −1.4886` on the **calibrated** scale. That is a **different** zero (fringe median of calibrated ability), not the Approach-B R1 zero. Future canonical WAR must not inherit that double-counting pattern if it starts from R1-zero rates.

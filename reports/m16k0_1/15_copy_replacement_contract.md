# Copy replacement contract (M16k0.1 → M16k1)

## Status

`COPY_CUTOVER_DEFERRED_TO_M16K1 = YES`

Live glossary still describes the **legacy fused** production `drbl100`.
Updating live copy now would half-migrate the product while live values remain fused.
Frozen replacement text below activates with M16k1 cutover.

## Canonical short description

```text
Estimated impact per 100 combined possession appearances, adjusted toward a role-matched replacement baseline for sample size.
```

## Canonical full description

```text
DRBL/100 estimates a player's impact per 100 combined possession appearances relative to a role-matched replacement baseline. The displayed estimate uses the player's Approach-B attribution rate and shrinks it toward replacement based on sample size.
```

## Replacement wording

```text
role-matched replacement baseline
```

Acceptable alternate: "replacement-level player in a similar role"

## Prohibited validated-copy claims

- fused rate
- P+LN+B blend
- league-average zero
- true talent
- 80% predictive interval
- WAR identity with DRBL/100

## Uncertainty

`VALIDATED_PREDICTIVE_INTERVAL_AVAILABLE = NO`

Canonical validated displays omit ± / interval copy (or mark LEGACY_DIAGNOSTIC only).
Do not invent substitute uncertainty copy.

## Zero semantics

Zero means R1 role-matched replacement baseline impact, **not** league average.

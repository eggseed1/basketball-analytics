# Current percentile rule (M16k0.1)

## Exact live rule (DRBL metrics)

```text
hasValidDrblEstimate(row) =
  row.drblUncertainty > 0

computePlayerPercentiles cohort =
  league.filter(row => row.minutes >= minimumMinutes)
  with minimumMinutes default = 500

DRBL metric pool =
  minute cohort ∩ hasValidDrblEstimate
```

Semantically:

```text
minutes >= 500
AND
drblUncertainty > 0
```

Sources:
- `src/data/queries/percentiles.ts` — `hasValidDrblEstimate`, `computePlayerPercentiles`
- `src/app/players/[playerId]/page.tsx` — `PERCENTILE_MIN_MINUTES = 500`

## Decomposition

### PRODUCT_QUALIFICATION_TERMS

```text
minutes >= 500
```

Independent preexisting product display qualification (same default on
`computePlayerPercentiles` and player-profile league fetch). Not an N-based
scientific exposure threshold.

### LEGACY_VALIDITY_PROXY_TERMS

```text
drblUncertainty > 0
```

Invalid once predictive uncertainty is UNRESOLVED / quarantined. Must be
replaced by `hasValidatedDrblEstimate` on the validated path.

## Confirmed

`EXISTING_PERCENTILE_QUALIFICATION_RULE_CONFIRMED = YES`

Preserve `minutes >= 500` exactly (including equality edge).

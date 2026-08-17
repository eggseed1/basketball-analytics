# Existing posterior audit (M16g)

## Production / published ability lineage

```
rawAbilityRate       = 100 * totalValue / possessions   (seq-attr residual rate vs R1)
drblP                = EB(rawAbilityRate; priorMean=0, k=200)
fusedRateRaw         = fusion(P,LN,B) or lite blend
posteriorAbilityRate = EB(fusedRateRaw; priorMean=0, k=200)
drbl100              = posteriorAbilityRate
```

## Canonical EB form

```
reliability = N / (N + k)
posterior   = reliability * observedRate + (1 - reliability) * priorMean
```

Implemented in:
- `drbl/models/leaderboard.ts` → `empiricalBayesRate`
- `drbl/models/pipeline-value.ts` → `empiricalBayesPosterior`
- `drbl/models/player-value.ts` → `empiricalBayesShrink` (component `drblP`, k=PRIOR_EQUIVALENT_POSSESSIONS)

## Where applied

1. **Component layer:** `finalizePlayerSeasonRows` shrinks raw seq-attr rate → `drblP` with k=200.
2. **Published ability layer:** EB on `fusedRateRaw` → `posteriorAbilityRate` / `drbl100` with same k.
3. M16c diagnostic: additional EB on fusion *predictions* (not used for selection here).

## Input already regularized?

YES for published `drblP` (embeds k=200).

## Double posterior?

YES in production ability path if one treats `drblP` (already EB) as an input to fusion then EB again on fused rate.
`resolvePosteriorAbility` (ability-lineage) prevents *re*-EB of an already-stored `posteriorAbilityRate`.

## Pseudo-exposure

`seasonalImpact = rawAbilityRate * actualPossessions / 100`
Prior strength affects **weight only**, not exposure. See `seasonalImpactFromRawRate`.

`POSTERIOR_PSEUDO_EXPOSURE_LEAK = NO`

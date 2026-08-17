# Research posterior contract (M16g1)

## Target object

```
P_B_raw = rawAbilityRate
        = 100 * Σ sequential Approach-B credits / N
        = unshrunk drbl-seq-attr-v1 rate
```

Proven: `finalizePlayerSeasonRows` sets `rawAbilityRate = raw100` **before** `empiricalBayesShrink`.

## Posterior

```
P_B_posterior(k) = N/(N+k) * P_B_raw + k/(N+k) * priorMean
priorMean = 0
N = actual combined possession appearances
```

## Intended number of research posterior operations

**Exactly one** EB on `P_B_raw`.

## Not decided in M16g1

- whether `P_B_posterior` replaces published `drblP`
- whether fusion remains in final DRBL/100
- whether fused ability receives another posterior
- calibration / WAR consumption

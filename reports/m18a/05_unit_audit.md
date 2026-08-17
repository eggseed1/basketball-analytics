# Unit audit (M18a)

| Quantity | Numerator | Denominator | Scale |
|---|---|---|---|
| P_RAW | Approach-B attributed value ×100 | combined possession appearances N | per 100 |
| L_coef (NET) | scoreboard points association | possession | per possession |
| L (research) | L_coef × 100 | — | per 100 |
| Legacy DRBL-LN | (points−EPV) ridge ×100 then EB | N | per 100 (different target) |

## Direct subtraction L − P_RAW?

**NO** as UIR definition — even after ×100, estimands differ (lineup-adjusted scoreboard association vs Approach-B event attribution). Use statistical residualization:

```text
UIR = L − E[L | P_RAW, log(N), …]
```

## Factor-two

Combined possession appearances (offense+defense) are the DRBL N denominator.  
Lineup model uses one row per team-possession (not double-counted team pair).  
FACTOR_TWO_AUDITED = YES — L×100 aligns per-100 scale for residualization inputs; no silent /2 or ×2.

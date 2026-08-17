# Realized vs rate-allocated stint semantics

## REALIZED_STINT_VALUE (canonical for historical accounting)

```text
RealizedR1Points_i,t = observedRawStintAttributedValue_i,t
```

## RATE_BASED_STINT_ALLOCATION (diagnostic only)

```text
rateAllocated_i,t = seasonRawAbilityRate_i * teamN_i,t / 100
```

These are not equivalent for multi-team players. Realized historical attribution
uses the primitive observed stint value.

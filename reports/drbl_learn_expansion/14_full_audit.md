# Full audit — DRBL simple surface + deep Learn

## Verdict

```text
SIMPLE_SURFACE = YES
DEEP_RABBIT_HOLE = YES
CASUAL fan can use player page without R1/EB/EPV/P/LN/B = YES
Advanced user can reach all concepts inside DRBL Learn = YES
MODEL_CHANGED = NO
M17C_STARTED = NO
```

## Problem

Previous first view overloaded casual fans with DRBL/100, rank, percentile, R1 Points, P/LN/B, methodology, box, career, and ASK simultaneously.

## Player hierarchy

- Identity: season · team strip
- Headline interpretation: frozen grade bands from percentile
- Primary rate: DRBL/100
- Primary value: Wins Above R1
- Optional split: Offense / Defense (casual labels)
- Removed from first view: rank, R1 Points, P1, P/LN/B, duplicate StatDisclosure

## Learn routes

| Topic | Route |
|-------|-------|
| Overview portal | `/learn/drbl` |
| DRBL/100 | `/learn/drbl-100` |
| Wins Above R1 | `/learn/wins-above-r1` |
| Offense | `/learn/drbl-o` |
| Defense | `/learn/drbl-d` |
| DRBL-P | `/learn/drbl-p` |
| DRBL-LN | `/learn/drbl-ln` |
| DRBL-B | `/learn/drbl-b` |
| R1 | `/learn/r1` |
| R1 Points | `/learn/r1-points` |
| How it works | `/learn/how-drbl-works` |
| Validation | `/learn/drbl-validation` |
| Historical | `/learn/drbl-historical-data` |
| Limitations | `/learn/drbl-limitations` |

Pattern: StatGuide (metrics) matching DARKO/TS; LearnTopic (systems).

## Coverage

Public keep-YES DRBL metrics: **9/9** with tooltip + Learn destination. Orphans: **0**.

## Design

Reference: `origin/drbl-ia-and-ask` @ `7e764ceb…` — hierarchy simplification only.

## Analytics

No model parameter or precomputed value changes. Regression counters: 0.

## Human QA

Could a casual fan use the player page without knowing R1, EB, EPV, P, LN, or B? **YES**

Could an advanced user still reach detailed explanations without leaving DRBL? **YES**

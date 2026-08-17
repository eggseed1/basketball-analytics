# EPV target definition (M16f1)

## Target
Eventual points scored on the possession, from POSSESSION_START_STATE.

```
V(s0, L) = E[possessionPoints | pre-outcome information]
```

Unit: expected points per possession.

## Endpoint handling
Uses reconstructed `DrblPossession.points` and `endReason` from the existing possession builder:
- made FG / FT sequences → points credited to possession
- missed FG + defensive rebound → possession ends
- offensive rebound → continuation within possession (points on eventual end)
- turnover → 0 points, possession ends
- shooting foul / and-one → included in possession points when part of the possession reconstruction
- technical FT / end of period / transition → as encoded by reconstructPossessions

## Forbidden inputs
No future shot result, future shooter, future pass/TO/rebound/foul, later possession state, or future lineup.

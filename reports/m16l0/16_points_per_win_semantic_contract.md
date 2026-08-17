# Points-per-win semantic contract

```text
pointsPerWin
=
league-level conversion between marginal replacement-relative point value
and wins
```

## Is

- a **unit conversion** (points → wins)

## Is not

- a DRBL rate calibration coefficient
- a player ranking optimizer
- permission to set `newDRBL100 = slope * validatedDRBL100`

## Future family (not fit in M16l0)

- **P0:** FIXED 30 (legacy diagnostic)
- **P1:** TEAM_NET_POINTS_MARGINAL_CONVERSION from team actual net points ↔ team wins on development data only

`POINTS_PER_WIN_SEMANTICS_FROZEN = YES`

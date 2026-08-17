# M16l3 API contract

## Player-season fields
- `r1Points`: number | null — SCOREBOARD_POINT_EQUIVALENT_RESIDUAL
- `r1WinEquivalents`: number | null — r1Points / 37.490662671779255
- `r1PointValueVersion`: `drbl-r1-points-v1`
- `r1WinEquivalentVersion`: `drbl-r1-wineq-v1`
- `abilityModelVersion`: `drbl-ability-eb1600-r1-v1`

## Stint fields
Observed primitive stint attribution only (not season-rate allocation).

## Legacy
`drblWar` retained for compatibility; DEPRECATED_NONCANONICAL. Not aliased to r1WinEquivalents.

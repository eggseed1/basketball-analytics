# Seasonal value semantics

Optional shadow descriptive field:

```
validatedSeasonValuePointsAboveR1
= validatedDRBL100 * actualPossessions / 100
```

This is **estimated above-R1 points accumulated over actual appearances**.

It is **NOT**:

- WAR
- wins
- `drblWar`

`computeValidatedAbilityV1` exposes this descriptive field for engineering only.
WAR remains firewalled on `rawAbilityRate` / `seasonalImpact`.

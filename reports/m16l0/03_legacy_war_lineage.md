# Legacy WAR lineage

## WAR 4.0.0 (2024-25 pre-unit-repair)

```text
posteriorAbilityRate
→ × LOO slope 5.835416607524311  (+ intercept 0)
→ finalAbilityDRBL100
→ subtract fringe replacement −1.4886147765794517
→ × combinedPossessionAppearances / 100
→ / pointsPerWin 38.714285714285715
→ drblWar
```

Exposure unit mismatch: calibrated rate defined like team netRating per **paired** team possessions, but multiplied by **combined** appearances (≈2×).

## WAR 4.0.1 (2024-25 current artifact)

```text
posteriorAbilityRate
→ × 5.835416607524311
→ finalAbilityDRBL100
→ − (−1.4886147765794517)
→ × pairedOnCourtPossessions(=combined/2) / 100
→ / 38.714285714285715
→ drblWar
```

Unit repair only. LOO slope / replacement / PPW frozen. Remaining empirical scale ≈2.918 open.

## 2025-26 provisional

```text
rawAbilityRate
→ × combined N / 100   (= seasonalImpact; replacementLevelRate=0)
→ / 30
→ drblWar
```

No LOO slope. No fringe replacement. Different PPW. **Not cross-season comparable to 4.0.1.**

## Code path vs artifact

`finalizePlayerSeasonRows` implements provisional raw/30. Calibrated 4.0.1 is baked into 2024-25 JSON via remaster/unit-repair (`pipeline-value.ts`), not rewritten by M16k1 ability cutover (WAR firewall preserved).

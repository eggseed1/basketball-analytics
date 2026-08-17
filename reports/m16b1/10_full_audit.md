# M16b.1 Full audit — production board provenance

## Freeze

- git: `629bb1b790bef21020940122194772b6921569ff`
- dirty: true
- season: 2025-26
- site artifact: `src/data/drbl/precomputed/2025-26.json`
- artifact hash: `a18c996838a999e265f2cee356e3c15f17b5a8534be9832bf65786c7ea55d8df`
- M16a hash: `a18c996838a999e265f2cee356e3c15f17b5a8534be9832bf65786c7ea55d8df` (identical: true)
- generation: `2025-26-g1225-2026-08-12T15-24-09-645Z`
- artifact players: 575
- explore board players: 582

## 575 vs 582

```text
M16a canonical player count: 575
production board player count: 582
difference: 7
```

Exact extra players (league-dash only; DRBL metrics default to 0):

- Colby Jones (1641732) DET GP=1 — site_only_metadata_row
- Darius Brown II (1642468) CLE GP=1 — site_only_metadata_row
- Jayson Kent (1643257) POR GP=5 — site_only_metadata_row
- Noa Essengue (1642855) CHI GP=2 — site_only_metadata_row
- Stanley Umude (1630649) SAS GP=2 — site_only_metadata_row
- Tosan Evbuomwan (1641787) CHA GP=5 — site_only_metadata_row
- Trentyn Flowers (1642280) CHI GP=2 — site_only_metadata_row

Reason: explore table base universe is NBA `leaguedashplayerstats` (GP>0), left-joined to DRBL. These seven players have NBA box minutes but no row in the 1225-game DRBL artifact.

## DRBL lineage

- displayed field: `PlayerSeason.drbl100` ← artifact `drbl100` (= `posteriorAbilityRate` rounded)
- canonical field: `posteriorAbilityRate`
- max residual: 0.0050000000000000044
- mismatch count (>0.011): 0

## WAR lineage

- source: provisional `seasonalImpact / 30` embedded in same artifact
- formula version: provisional (not 4.0.0)
- warCalibrationAbilityInput: rawAbilityRate_via_seasonalImpact
- max reconstruction residual: 0.005277333333333356
- mean abs residual: 0.0025503606956521698
- P95: 0.0047239999999999505
- mismatch count (>0.02): 0

## Statuses

- BOARD_SOURCE_IDENTIFIED: PASS
- BOARD_ARTIFACT_HASHED: PASS
- PLAYER_COUNT_RECONCILED: PASS
- PLAYER_IDS_UNIQUE: PASS
- PLAYER_SEASON_SEMANTICS: PASS
- DISPLAYED_DRBL_RECONSTRUCTS: PASS
- DISPLAYED_WAR_RECONSTRUCTS: PASS
- WAR_SOURCE_IDENTIFIED: PASS
- 2025_26_WAR_EXPLAINED: PASS
- ARTIFACT_GENERATIONS_COMPATIBLE: PASS
- STALE_WAR_GUARD: PASS
- STALE_PLAYER_ROW_GUARD: PASS
- RESERVED_TEST_MODEL_EVALUATION: NO
- BOARD_NONCANONICAL_ABILITY_COUNT: 0
- BUILD_ASSERTIONS: PASS

## M16C_READY

**YES** (validation-only ablations may begin after approval)

## Guards

- duplicate player-season (artifact): PASS
- stale WAR join: PASS
- stale player-row (documented site-only zeros allowed): PASS
- build assertions: PASS

## Reserved-test policy

- reserved artifact accessed for provenance: YES (site/M16a precomputed only)
- model evaluation performed: NO
- player-level predictive diagnostics: NO

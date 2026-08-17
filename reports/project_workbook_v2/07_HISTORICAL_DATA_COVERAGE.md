# 07 — Historical Data Coverage

**Sources:** M17a.2 seal `60ef9954…`, season registry `drbl/historical/season-registry.ts`, integration health.

---

## Support tiers (ESTABLISHED classification)

| Tier | Meaning | Seasons in M17a.2 seal |
|---|---|---|
| A_FULL_SOURCE_SUPPORT | Strict source gate (e.g. raw lineup completeness ≥99.9% class) | **NONE** (`EARLIEST_TIER_A_SEASON = NONE`) |
| B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION | Publishable retrospective / production with documented limitations | **2020-21, 2021-22, 2022-23, 2023-24** (+ production 2024-25/2025-26 also labeled B for source quality while product status differs) |
| C_PARTIAL_NONCANONICAL | Archive present; not product-supported | 1996-97…2018-19 (see seal list) |
| D_UNSUPPORTED | Explicit unsupported | 2019-20 |

Product publication (`modelProductStatus`) is **independent** of raw lineup % gate:

| Season | historicalSourceQualityTier | modelProductStatus |
|---|---|---|
| 2020-21…2023-24 | B_… | RETROSPECTIVE_FROZEN_V1 |
| 2024-25, 2025-26 | B_… | CANONICAL_PRODUCTION |

Export: `08_SEASON_REGISTRY.csv`.

---

## Corpus metrics (M17a.2)

| Metric | Value |
|---|---|
| RAW_GAME_COUNT | 33087 |
| SCOREBOARD_GAMES_AUDITED | 33086 |
| SCOREBOARD_EXACT | 33000 |
| SCOREBOARD_MISMATCHES | 87 |
| SCOREBOARD_PASS_RATE | ~0.9974 |
| UNKNOWN_TEAM_IDS | 0 |
| UNRESOLVED_PLAYER_IDS | 0 |
| HISTORICAL_TIER_B_PLAYER_SEASONS | 2183 |
| HISTORICAL_TIER_B_GAMES_COMPUTED | 4770 |
| RAW_LINEUP_COMPLETENESS_RANGE | 0.4670–0.9913 |
| NORMALIZATION_VERSION | historical-pbp-normalized-v1 |
| SUPPORT_CONTRACT | historical-support-contract-v2 |
| HISTORICAL_MODEL_APPLICATION | RETROSPECTIVE_FROZEN_V1 |
| HISTORICAL_P1_POLICY | FROZEN_V1_P1 |
| P1_ERA_ROBUSTNESS | **NOT_ESTABLISHED** |

---

## Product fences

```text
CAREER_R1_VALUE_PUBLIC = NO
ALL_TIME_DRBL_RANKING = NO
SEASON_REGISTRY_SINGLE_SOURCE = YES
```

Within-season ranks only — not an all-time GOAT scale. Cross-era comparability **not fully established**.

---

## Integration check

Historical precomputed overlays for Tier-B seasons are byte-equal to analytics premerge (`72272b2`) with **0** DRBL/R1/rank mismatches.

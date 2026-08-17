# M17a.2 full audit — STOP FOR AUDIT

`M17A_2_RESULT = PARTIAL_HISTORICAL_BACKFILL_COMPLETE`

## Verdict

- M17a.1 raw seal **reproduces**: 33,087 / 33,087 COMPLETE; manifest equality PASS.
- Schema / vocabulary / scoreboard / lineup / possession audits complete for all 28 historical seasons.
- **Tier A:** none (no season meets raw lineup ≥ 99.9%).
- **Tier B (RETROSPECTIVE_FROZEN_V1):** 2020-21 … 2023-24 (CDN-era; lineup ~98.6–99.1%; scoreboard exact). Frozen-v1 DRBL/R1 computed and registered.
- **Tier C:** 1996-97 … 2018-19 (excellent scoreboards, but raw 5v5 lineup typically 47–63% — frozen estimand not publishable without inventing lineup coverage).
- **Tier D:** 2019-20 (scoreboard pass ~92.4%, 81 mismatches).
- Current 2024-25 / 2025-26 remain **CANONICAL_PRODUCTION** (unchanged formulas).
- No k/P1/R1/EPV retune. No all-time ranking. No career cumulative R1.
- `M17B_AUTHORIZED = YES` (4 pre-2024 supported seasons). **Do not run M17b in this milestone.**
- `M18_AUTHORIZED = NO` (pre-2020 lineup depth insufficient).

## Next

`M17b_MULTI_SEASON_TEMPORAL_VALIDATION` on Tier B seasons, and/or `M17a.3` targeted lineup/sub repair for pre-2020 without model retune.

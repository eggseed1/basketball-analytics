# 28 — Security and access

Env var **names only** (from `.env.example`). No values.

## Documented variable names

- `DATA_PROVIDER`
- `DRBL_CANONICAL_ABILITY_SOURCE`
- `DRBL_VALIDATED_ABILITY_SHADOW`
- `BALLDONTLIE_API_KEY`
- `PBP_DATA_PATH`

## Access notes (non-secret)

- Production should set `DATA_PROVIDER=nba` (Vercel may fall back to nba).
- `BALLDONTLIE_API_KEY` required for deep historical games/stats.
- Optional `PBP_DATA_PATH` attaches an external PBP corpus; does not by itself enable ASK/Game Lab PBP queries.
- Optional DRBL ability source flags (`DRBL_CANONICAL_ABILITY_SOURCE`, `DRBL_VALIDATED_ABILITY_SHADOW`) are rollback/drill references post-cutover.
- Do not commit `.env.local` or API keys. Workbook intentionally omits secret values.

# 05 — Game route forensics

## Reproduction
1. Home week strip / Scores list emit `href=/games/{espnEventId}` (e.g. `401584893`) from ESPN scoreboard transforms.
2. `/games/[gameId]` called `getGameShell` → `looksLikeEspnEventId` true → `getDataProvider().getGameBoxScore(espnId)`.
3. With `DATA_PROVIDER=nba`, box path used **stats.nba.com boxscoretraditionalv2?GameID={espnId}** — wrong id space → null → `notFound()` **404**.

## Root cause
`GAME_ROUTE_LOOKUP_CONTRACT_BROKEN`: link namespace = ESPN event id; destination lookup = NBA Stats GameID.

## Fix
- ESPN `40…` → ESPN site summary + `transformEspnBoxScore`
- NBA `00########` → stats.nba.com (never BDL)
- BDL shorter numerics → historical/BDL path
- Live verification: `getGameShell("401584893")` → POR@CLE full shell (PASS)

## Failure classes
| Class | Meaning |
|---|---|
| VALID_GAME_PROVIDER_MISMATCH | id valid in another provider; wrong lookup path (pre-fix) |
| INVALID_GAME_ID | ESPN 404 / unknown opaque id |
| VALID_GAME_DATA_UNAVAILABLE | shell exists, box empty |
| NETWORK_FAILURE | fetch 5xx / throw — must not be silently equated with invalid |

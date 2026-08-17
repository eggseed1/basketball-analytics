# GAME_IDENTITY_AND_ROUTING

See also: `03_GAME_ROUTING.md` and `reports/product_completeness_v1_2/05_game_route_forensics.md`.

## Root cause (P17.2)

```text
ESPN_EVENT_ID_LOOKED_UP_AS_NBA_STATS_GAMEID
```

Home/Scores emit ESPN event ids (`40…`). Destination previously looked them up as NBA Stats GameIDs → null → `notFound()`.

## Contract

| Id shape | Provider | Lookup |
|----------|----------|--------|
| `40…` | espn | ESPN site summary |
| `00########` | nba | stats.nba.com |
| shorter BDL numerics | bdl | BDL / historical |

No cross-namespace guessing of ambiguous bare numerics.

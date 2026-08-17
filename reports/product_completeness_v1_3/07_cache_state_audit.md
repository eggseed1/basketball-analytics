# Cache / state audit

| Cache | Key | Team brand? | Season in key? |
| --- | --- | --- | --- |
| `getPlayerCached` | playerId | currentTeamId only | N/A (current) |
| `getPlayerSeasonCached` | playerId+season | season row team | YES |
| `careerCache` (provider) | playerId | career teams | rows include season |
| React memo headshot | playerId (+ teamKey prop) | ring uses `teamKey` prop | parent must pass season team |

Season chips use `?season=` URL — brand recomputed on navigation (no client memo of team-only-by-playerId on destination).

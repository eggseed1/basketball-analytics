# 03 — Explore Players team lineage

## Path
`stats.nba.com leaguedashplayerstats`
→ `transformStatsNbaPlayerSeason` / `normalizeNbaPlayerSeasonTeam`
→ `PlayerSeason.teamId` (canonical ESPN)
→ DRBL overlay join (player id only; team unchanged)
→ `getFilteredPlayerSeasonsDetailed` / `toExplorePlayerBoardRow`
→ Explore TM cell (`resolveTeamBrand(canonicalId)`)

## Examples (deterministic repo IDs)

| Player fixture | BEFORE (provider TEAM_ID) | AFTER teamId | AFTER TM label |
|---|---|---|---|
| OKC row | `1610612760` (human leak) | `25` | OKC via brand |
| LAC row | `1610612746` | `12` | LAC |
| DET row | `1610612765` | `8` | DET |

BEFORE fix, TM fell through to `brand?.abbr ?? player.teamId` and TeamLogo badge sliced `"161"`.
AFTER fix, `teamId` is ESPN canonical; logo+abbr render; `providerTeamId` retained as `1610612760` with `teamIdProvider=nba`.

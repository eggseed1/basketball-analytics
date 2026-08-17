# 04 — Player destination team lineage

## Path
`/players/[playerId]`
→ career / season queries (`NBADataProvider` transforms)
→ `PlayerSeason.teamId` (canonical after P17.2)
→ `primaryTeamForSeason` / `mergePlayerSeasonStats`
→ `PlayerCoreIsland` `teamKey = seasonStats?.teamId`
→ `resolveTeamBrand` / `resolveHistoricalTeamBrand` / `TeamLogo`

## Contract
- Current season: modern brand from canonical ESPN id
- Historical Tier-B: era resolver on same canonical id
- Unresolved: must not render raw `16106127xx` (brand helper rejects long numerics; show team name / unavailable)

## Examples
Same three NBA TEAM_IDs as `03_` normalize to ESPN `25` / `12` / `8` before destination branding.

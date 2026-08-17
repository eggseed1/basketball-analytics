# DRBL Project Workbook v2.1 ? Provider Identity + Game Routing

**Milestone:** P17.2  
**Branch:** product/drbl-site-completeness-v1_2  
**Source HEAD:** 64cc231  
**Integration commit:** 28827fb  

## Identity contract
- Canonical team id = ESPN numeric string
- `providerIds.nba` for all 30 teams from `NBA_TEAM_META`
- Bare `16106127xx` format-inferred as nba only

## PlayerSeason
- `teamId` = canonical ESPN after NBA transform
- `providerTeamId` / `teamIdProvider='nba'` / `nbaTeamId` retained

## Game routing
- ESPN `40¡¦` ¡æ ESPN summary
- NBA `00########` ¡æ stats.nba.com
- BDL shorter numerics ¡æ historical

## Supporting reports
See `reports/product_completeness_v1_2/`.

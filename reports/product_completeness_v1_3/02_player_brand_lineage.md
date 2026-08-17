# Player brand lineage (P17.3)

## Pipeline
`route playerId`
→ `getPlayerCached` / `getPlayerCareerSeasons`
→ `resolvePlayerSeason(career, ?season)`
→ `resolveSelectedSeasonTeamContext` / `primaryTeamForSeason`
→ `brandTeamKey` (canonical ESPN; undefined for TOT)
→ `PlayerDestinationIdentity` (logo, link, wash, headshot ring)
→ `PlayerCoreIsland` / `PlayerGamesIsland` (must reuse identityTeamKey)

## What previously determined brand
| Surface | Before | After |
| --- | --- | --- |
| Hero wash / logo | `primaryTeamForSeason` max GP (career) OK; Core/Games preferred `getPlayerSeason` **first** stint | Layer-1 context wins; board pick = max GP / TOT |
| Season explorer wash | dual `careerStartTeamKey` + viewing team | viewing season only (or NEUTRAL) |
| Career enrichment | replaced career row with first dash stint | `enrichCareerRowKeepTeam` keeps stint team |
| Multi-team | TOT filtered out; arbitrary franchise branded | TOT kept; aggregate NEUTRAL |

## Objects
- team logo / link / colors / wash → `brandTeamKey` from **selected-season context**
- current team (search / profile) → `resolveCurrentTeamId` precedence (separate)

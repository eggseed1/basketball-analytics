# M16b.1 Board data flow

## Path

```text
reports/m16a/artifacts/full-2025-26.json
  (byte-identical SHA-256 to site artifact)
        ↓
src/data/drbl/precomputed/2025-26.json
  (bundled import in src/data/providers/nba/drbl-loader.ts)
        ↓
fetchDrblSeason(season) → DrblPlayerSeasonRow[]
        ↓
NbaDataProvider.fetchPlayerSeasons
  base universe = stats.nba.com leaguedashplayerstats (GP > 0)
  left-join DRBL by playerId
  missing DRBL → drbl100=0, drblWar=0  (src/data/transformers/stats-nba.ts)
        ↓
getFilteredPlayerSeasons → ExplorePlayersBody
        ↓
PlayerSeasonTable  ("Showing N of M players")
```

## Stage table

| Stage | File | Function | Input | Output | Season | Generation | Player count |
|---|---|---|---|---|---|---|---|
| Model / ranking artifact | `scripts/drbl-compute-season.ts` → ranking remaster → sequential | compute + remaster + seq | normalized games | precomputed JSON | 2025-26 | `2025-26-g1225-2026-08-12T15-24-09-645Z` | 575 |
| Site bundle | `src/data/drbl/precomputed/2025-26.json` | static import | same bytes as M16a full | `DrblSeasonArtifact` | 2025-26 | same | 575 |
| Loader | `src/data/providers/nba/drbl-loader.ts` | `fetchDrblSeason` | bundled JSON | player rows | 2025-26 | same | 575 |
| Board universe | `src/data/providers/nba-data-provider.ts` | `fetchPlayerSeasons` | league dash + DRBL join | `PlayerSeason[]` | 2025-26 | n/a (NBA live) | **582** |
| Table | `src/components/explore/player-season-table.tsx` | render | filtered rows | UI | 2025-26 | — | Showing 50 of 582 |

## Official DRBL ranking universe

Official DRBL metrics live only on the **575** artifact players (`player_season` / pooled).
The explore table’s **582** count is the NBA league-dash roster with GP>0; seven players are site-only zero joins.

## WAR architecture (2025-26)

Classification: **C_raw_ability_impact**

```text
seasonalImpact = (rawAbilityRate - replacementLevelRate) * possessions / 100
drblWar = seasonalImpact / pointsPerWin   (pointsPerWin=30 provisional)
```

Not pipeline v4. No team-season CSV → no LOO WAR calibration on this season.

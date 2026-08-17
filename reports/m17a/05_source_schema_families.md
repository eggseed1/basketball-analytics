# Source schema families (M17a)

## Family count: 1

### Family A — `nba-cdn-playbyplayv3`

- **Provider:** NBA CDN / Stats playbyplayv3 + boxscore
- **Seasons observed in archive:** 2024-25, 2025-26
- **Raw files per game:** `playbyplay.json`, `boxscore.json`, plus `.meta.json`
- **Game ID field:** directory name / gameId (e.g. `0022400001`)
- **Period:** `period`
- **Clock:** ISO duration string (e.g. `PT11M43.00S`) → `clockSeconds`
- **Event number:** `actionNumber` / `orderNumber`
- **Event type:** mapped actionType (`2pt`, `3pt`, `freethrow`, `rebound`, `turnover`, `substitution`, …)
- **Team / player IDs:** numeric string IDs from CDN
- **Assists / steals / blocks:** optional related actor fields when present
- **Substitutions:** `substitutionSide` in|out with playerId
- **Shots:** shotResult, x/y location when present
- **Score state:** scoreHome / scoreAway cumulative
- **Lineups:** reconstructed downstream (not native on every event)
- **Adapter:** `drbl/historical/adapters/nba-cdn-playbyplayv3.ts`

No additional historical schema families were discovered because no pre-2024 archive files are present.

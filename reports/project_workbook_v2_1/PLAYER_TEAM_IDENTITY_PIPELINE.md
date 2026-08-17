# PLAYER_TEAM_IDENTITY_PIPELINE

See also: `02_PLAYER_TEAM_PIPELINE.md` and `reports/product_completeness_v1_2/03_explore_player_team_lineage.md`.

```text
NBA Stats TEAM_ID
  → normalizeNbaPlayerSeasonTeam / getCanonicalTeamFromProvider("nba", id)
  → PlayerSeason.teamId = canonical ESPN id
  → providerTeamId + teamIdProvider="nba" retained
  → Explore TM / player destination consume canonical only
```

Multi-team / TOT → `teamId="TOT"` (no invented franchise brand).
Unresolved → empty `teamId` + `"Team unavailable"` (never raw `16106127xx`).

# Impact overlays

## What ships in production

`scripts/build-runtime-impact-snapshot.mjs` bakes:

| Metric | Source | Access |
| --- | --- | --- |
| **DARKO** | Live scrape of [darko.app](https://www.darko.app) public leaderboard | Public leaderboard |
| **RAPTOR** | [FiveThirtyEight RAPTOR](https://github.com/fivethirtyeight/data/tree/master/nba-raptor) (CC BY 4.0) | Open GitHub CSVs |

RAPTOR covers seasons 538 published (historical through ~2021-22). Later seasons leave RAPTOR blank — use **BPM / VORP** (BRef advanced) and **DARKO** instead. This site does **not** ship Basketball Index LEBRON.

See `/learn/raptor`.

## Optional overrides

Place `raptor.csv` here to override specific player-season rows:

```
player_name,season,raptor,o_raptor,d_raptor,war,team,team_abbr,player_id
```

Required: `player_name`, `season`, `raptor`  
Optional: `o_raptor`, `d_raptor`, `war` (or `wins_added`), `team`, `team_abbr`, `player_id`

## Season-true index

See `docs/historical-impact.md`. Optional ESPN↔NBA aliases: `player-id-aliases.json`.

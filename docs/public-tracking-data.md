# Public sources for screens / drives / cuts / defender distance / shot clock

## Short answer

| Need | Possession-level (join to each PBP action)? | Public season/game aggregates? |
| --- | --- | --- |
| Assists | **Yes** — CDN `assistPersonId` (+ description fallback) | Box AST |
| Shot x/y | **Yes** — CDN | — |
| Shot clock | **No** on CDN/live PBP | **Yes** — bucketed via `leaguedashplayerptshot?ShotClockRange=` |
| Closest defender distance | **No** on current CDN PBP | **Yes** — bucketed via `CloseDefDistRange` on ptshot |
| Drives | **No** event stream | **Yes** — `leaguedashptstats?PtMeasureType=Drives` |
| Screens (screen assists) | **No** event stream | **Yes** — `leaguehustlestatsplayer` (SCREEN_ASSISTS, …) |
| Cuts / off-ball | **No** | **No** public event feed |
| Full tracking coordinates | **No** free raw SportVU | Commercial (Second Spectrum, etc.) |

We still **must not invent** possession-level screens/drives/cuts from box totals. Aggregates can feed **DRBL-B / diagnostics** only until an event-level join exists.

## What is public on stats.nba.com

Wrappers: [`nba_api`](https://github.com/swar/nba_api), hoopR, or this repo’s `statsNbaFetch`.

1. **Player tracking dashboards** — `leaguedashptstats`  
   `PtMeasureType`: `Drives`, `Passing`, `CatchShoot`, `PullUpShot`, `PaintTouch`, `PostTouch`, `ElbowTouch`, `Possessions`, `Defense`, …

2. **Hustle** — `leaguehustlestatsplayer`  
   Screen assists, deflections, loose balls, contested shots, …

3. **Shot tracking filters** — `leaguedashplayerptshot`  
   `CloseDefDistRange`, `ShotClockRange`, `DribbleRange`, `TouchTimeRange`  
   → season FG% / frequency **by bucket**, not per-action IDs.

4. **Older shot logs** (historically `playerdashptshotlog` / SportVU-era)  
   Sometimes included `CLOSE_DEF_DIST`, `TOUCH_TIME`, `DRIBBLES` per shot for limited seasons; coverage for 2024–26 is incomplete / unstable — treat as research, not production core.

## What CDN live PBP does *not* give

`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gameId}.json` has game clock, x/y, assists, steals, blocks — **not** shot clock, closest defender, screens, or drives as actions.

## What we do in DRBL today

- Possession-level: sequential attribution from observed CDN fields + **possession-age proxy** (game-clock delta) as a weak late-clock feature for assisted connection credit (`assistAgeConnectionBoost`).
- Season aggregates: client helpers in `drbl/models/public-tracking.ts` for Drives / Hustle pulls (for future B features / audits).
- Cuts / true screen events / per-shot defender distance: remain unavailable at event resolution without commercial tracking.

## Code

```bash
# Helpers (network):
# fetchPlayerTrackingMeasure("2024-25", "Drives")
# fetchPlayerHustleStats("2024-25")
```

See `PUBLIC_TRACKING_AVAILABILITY` in `drbl/models/public-tracking.ts`.

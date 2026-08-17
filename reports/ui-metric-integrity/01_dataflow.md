# Player detail percentile dataflow (2025-26)

## Route
`/players/[playerId]?season=2025-26` → `src/app/players/[playerId]/page.tsx`

## Lineage
```
artifact field (drblWar / drbl100 / drblP / …)
  → PlayerSeason via stats-nba left join (?? 0 only when missing)
  → getPlayersBySeason(season, { minimumMinutes: 500 })
  → computePlayerPercentiles(player, league, 500)
       per metric: own value extractor + optional eligible() filter
  → buildSavantSections(seasonStats, percentiles)
       metric(key) → pctLookup(percentiles, key)  // key-exact, never by label
  → PlayerSavantSummary MetricRow / ScaleTrack
       displayedPercentile = metric.percentile
       barPosition = clamp(percentile, 2, 98) visually; semantic = percentile
```

## Metric key mapping
| label | valueField | percentileField |
|---|---|---|
| DRBL-WAR | drblWar | drblWarPercentile |
| DRBL/100 | drbl100 | drbl100Percentile |
| DRBL-P | drblP | drblPPercentile |
| DRBL-LN | drblLn | drblLnPercentile |
| DRBL-B | drblB | drblBPercentile |
| DRBL-O | drblO | drblOPercentile |
| DRBL-D | drblD | drblDPercentile |

## Bar position
`barPositionPercent = clamp(percentile, 0, 100)` (marker CSS clamps 2–98 for visibility).

## Career playback note
Scrub/play switches to career-relative ranks from `buildSavantCareerFrames`. Playback end now resets to league percentiles for the selected season.

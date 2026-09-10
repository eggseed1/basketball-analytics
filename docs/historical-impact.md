# Season-true historical impact (methodology v1.0)

Canonical module: `src/data/queries/historical-impact.ts`  
Index builder: `src/data/providers/impact/historical-impact-index.ts`  
Types: `src/data/types/historical-impact.ts`

## Definition

A **season-true** historical impact observation is:

- tied to a specific player
- tied to a specific canonical season (`YYYY-YY`)
- derived from a season-specific dataset or a live snapshot that is **explicitly stamped** to that season
- reproducible from the stored/fetched source
- admitted into the impact index without interpolation

This is **not**:

- Career Resume CPI (box-score **production**)
- a current DARKO value stamped onto every career year
- an estimate inferred from adjacent seasons

## Available metrics (when source data exists)

| Metric id | Source | Meaning |
| --- | --- | --- |
| `darko_dpm` | darko | Overall DARKO DPM |
| `darko_off` | darko | Offensive DPM |
| `darko_def` | darko | Defensive DPM |
| `raptor` | raptor | Overall RAPTOR |
| `oraptor` | raptor | Offensive RAPTOR |
| `draptor` | raptor | Defensive RAPTOR |
| `wins_added` | raptor | RAPTOR WAR |

Metrics are stored **separately**. The index never averages DARKO + RAPTOR.

## Sources in this repository

### RAPTOR — FiveThirtyEight open data

- Bake: `npm run impact:sync` → `src/data/runtime/impact-overlay-snapshot.json`
- Source: [fivethirtyeight/data/nba-raptor](https://github.com/fivethirtyeight/data/tree/master/nba-raptor) (CC BY 4.0)
- Season-true: **yes** for each published RAPTOR season (~1976–2021-22 modern/historical files)
- Optional override CSV: `data/impact/raptor.csv`
- Recent seasons after 538 stopped: RAPTOR blank — use BRef BPM / VORP / DARKO

### DARKO — live snapshot

- Path: live scrape of darko.app (memory + ISR cache)
- Season-true archive: **no**
- Admission rule: observations are kept **only** for the season stamped on the snapshot
- This is a **current-season live board**, not a multi-year historical series

### Not present

- Basketball Index LEBRON (proprietary; not published here)
- Multi-season historical DARKO archive beyond what darko.app exposes
- DRBL / RAPM / EPM / PIPM datasets
- Automatic ESPN ↔ NBA id graph (optional alias file only)

## Season convention

Canonical: `YYYY-YY` (same as career / leaderboard / compare).

Malformed seasons are rejected at admission. Missing seasons stay missing.

## Player identity

Observation fields:

- `playerId` — ESPN / site id when confidently mapped (else `null`)
- `nbaPlayerId` — NBA.com person id when known
- `identityMatch` — `alias` | `nba_id` | `espn_id` | `normalized_name` | `unmatched`

Optional aliases: `data/impact/player-id-aliases.json`

```json
{
  "aliases": [
    {
      "espnPlayerId": "3112335",
      "nbaPlayerId": "203999",
      "playerName": "Nikola Jokic"
    }
  ]
}
```

Loose name matching is **not** performed during index build. Query helpers may accept `playerName` for medium-confidence lookup when the caller already knows the name.

If a mapping cannot be established confidently, the observation remains in the index (for coverage / NBA-id lookup) but will not resolve from an ESPN id alone.

## Missing data

If a player lacks an observation for a season:

- queries return no row for that season
- callers should surface: “Historical impact data unavailable for this season.”
- do not interpolate from neighbors or from CPI

## Provenance

Each observation includes:

- `source`
- `sourceVersion` (e.g. `csv:data/impact/raptor.csv`, `live-snapshot:2025-26`)
- `methodologyVersion` (`1.0`)
- `provenance.dataset` / `importedAt` / optional `notes`

## Query API

```ts
getPlayerHistoricalImpact(playerId, season, options?)
getPlayerCareerImpact(playerId, options?)
lookupHistoricalImpact(key, options?)
getHistoricalImpactCoverage(options?)
hasPlayerSeasonImpact(playerId, season, options?)
```

Coverage diagnostic:

```bash
npm run report:historical-impact
```

## Career Resume relationship

- Career Resume **v1** remains CPI-based (`docs/career-resume.md`).
- This impact layer is a **separate lens**.
- Do **not** replace Peak / Prime / Longevity with impact until coverage is audited and a new Career Resume methodology version is published.

## What can be exposed to product today

| Surface | Safe? |
| --- | --- |
| “Impact available for season X?” diagnostic | Yes |
| RAPTOR value for CSV players in 2024-25 (when identity resolves) | Cautiously |
| Multi-year Peak Impact / Prime Impact | **No** — coverage insufficient |
| Replacing CPI Career Resume | **No** |

## Versioning

Bump `HISTORICAL_IMPACT_METHODOLOGY_VERSION` when admission rules change.  
Bump Career Resume methodology separately when/if impact enters that UI.

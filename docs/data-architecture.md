# Data Architecture

This project keeps basketball visualization code independent of any specific
stats API, CSV schema, or database. UI components consume **canonical TypeScript
types** only. External formats are translated by **provider adapters** and
**transformers**. Filtering happens once in the **query layer**.

## 1. Canonical data model

Canonical types live under `src/data/types/`:

| Type | Purpose |
| --- | --- |
| `Player` | Stable player identity (id, name, position, physicals) |
| `PlayerSeason` | Season counting + advanced rates for a player-team-season |
| `Team` | Franchise metadata |
| `Game` | Schedule / scoreboard row |
| `PlayerGame` | Box-score line |
| `Shot` | Event-level shot attempt with half-court coordinates |
| `BasketballFilters` / `ShotFilters` | Shared filter bag for queries |

### Conventions

- **Ids** are opaque strings in our namespace (local sample uses slugs like
  `jokic`; NBA adapter should map numeric `PLAYER_ID` → `String(id)`).
- **Season** strings use `YYYY-YY` (e.g. `2024-25`).
- **Percentages** are fractions in `[0, 1]` (e.g. `0.582`), not `58.2`.
  Formatting for display happens in `src/lib/format.ts`.
- **Ratings** use the standard ~100 scale (`offensiveRating`, etc.).
- **Shot coordinates** use basket at `(0, 0)`, `locX` / `locY` in feet.

`PlayerSeason` is the primary grain for the current `/explore/players` view
(usage % × true shooting %).

## 2. Provider architecture

Providers implement `BasketballDataProvider` (`src/data/providers/types.ts`):

- `LocalDataProvider` — sample / JSON / CSV-backed adapter (default)
- `NBADataProvider` — stub for a live NBA Stats / CDN / warehouse source

Resolve the active provider through `getDataProvider()`:

```ts
// DATA_PROVIDER=local (default) | nba
import { getDataProvider } from "@/data/providers";
```

Providers **must** return canonical types. They may load raw rows internally,
but those raw shapes never leak into pages or chart components.

All sample rows are isolated under:

`src/data/providers/sample/local-sample-data.ts`

Do not hard-code mock players inside React components.

## 3. Transformation pipeline

```
external / local raw rows
        │
        ▼
  transformers/   (field rename, unit normalize, id mapping)
        │
        ▼
  canonical types (Player, PlayerSeason, Shot, …)
        │
        ▼
  provider methods return canonical arrays/objects
```

Examples:

- `transformLocalPlayerSeason` — maps snake_case local dump columns
  (`usg_pct`, `ts_pct`, …) → `PlayerSeason`
- `transformNbaPlayerSeason` — maps NBA league-dash style columns
  (`PLAYER_ID`, `USG_PCT`, …) → `PlayerSeason`

Add new transformers when a new source appears; do not teach the UI about
source-specific field names.

## 4. Query layer

Query functions in `src/data/queries/` are the only API pages should call:

- `getPlayers()`
- `getPlayer(playerId)`
- `getPlayerSeason(playerId, season)`
- `getPlayerGameLog(playerId, season)`
- `getPlayersBySeason(season, filters?)`
- `getTeamPlayers(teamId, season, filters?)`
- `getFilteredPlayerSeasons(filters)`
- `getShots(filters)`
- `getTeams()` / `getTeam(teamId)`
- `getAvailableSeasons()`

### Filtering rule

`applyPlayerSeasonFilters` in `filter-utils.ts` is the **single** filter
implementation for player-season explore views. The explore page:

1. Parses URL `searchParams` → `BasketballFilters`
2. Calls `getFilteredPlayerSeasons(filters)` **once**
3. Passes the same array to the scatter chart and the table

Chart and table must not re-implement season / team / position / minutes
filters. (The table may still offer a lightweight “find in current rows”
search for display convenience; that does not replace query-layer filters.)

## 5. Connecting a real NBA source (`NBADataProvider`)

`NBADataProvider` is implemented and activated with:

```bash
# .env.local
DATA_PROVIDER=nba
```

### Current live source: ESPN public JSON

`stats.nba.com` is frequently blocked by Akamai TLS fingerprinting from
Node/server environments. The live adapter therefore reads ESPN endpoints:

| Need | Endpoint |
| --- | --- |
| Player season counting stats | `site.web.api.espn.com/.../statistics/byathlete` |
| Team season totals (for USG%) | `site.web.api.espn.com/.../statistics/byteam` |
| Teams | `site.api.espn.com/.../nba/teams` |
| Game logs | `site.web.api.espn.com/.../athletes/{id}/gamelog` |
| Today’s games | `site.api.espn.com/.../nba/scoreboard` |

Flow:

```
ESPN JSON
  → transformers/espn.ts (+ compute-advanced.ts for TS%/eFG%/USG%)
  → canonical PlayerSeason / Player / Team / PlayerGame
  → query layer → UI
```

Notes:

- Season strings stay canonical (`2024-25`). ESPN’s year param is the ending
  year (`2025`).
- `trueShootingPct` / `effectiveFieldGoalPct` / `usagePct` are **derived** from
  counting stats + team totals (standard formulas in
  `providers/nba/compute-advanced.ts`).
- `offensiveRating` / `defensiveRating` / `netRating` are lightweight proxies
  until a dedicated advanced feed is wired.
- `getShots()` returns `[]` for now — shot charts need a separate ingest
  (NBA CDN / warehouse), documented in §6.

### Switching back to sample data

```bash
DATA_PROVIDER=local
```

### Later upgrades

1. Persist ESPN (or NBA Stats) snapshots into Supabase/Postgres.
2. Add `SupabaseDataProvider` that reads canonical tables.
3. Optionally add a true `stats.nba.com` client with TLS impersonation if you
   need official advanced dashboard fields and shot charts.

## 6. How shot-level data should eventually be stored

Shots are high cardinality (hundreds of thousands per season; millions over
years). Treat them as an **event table**, not as nested player documents.

Suggested Postgres / Supabase shape:

```sql
shots (
  id text primary key,
  game_id text not null,
  player_id text not null,
  team_id text not null,
  season text not null,
  game_date date not null,
  period smallint not null,
  seconds_remaining int not null,
  shot_distance real not null,
  loc_x real not null,
  loc_y real not null,
  made boolean not null,
  shot_type text not null,          -- '2PT' | '3PT'
  shot_zone_basic text,
  shot_zone_area text,
  assisted boolean not null,
  assist_player_id text
);

-- Hot filters
create index shots_season_player_idx on shots (season, player_id);
create index shots_season_team_idx on shots (season, team_id);
create index shots_game_idx on shots (game_id);
create index shots_date_idx on shots (game_date);
```

Optional later:

- Partition by `season`
- Materialize hex-bin / zone aggregates for heatmaps
- Store raw vendor payloads in object storage; keep only canonical columns
  in SQL

Canonical `Shot` in TypeScript mirrors this table so the provider can map
1:1 after ETL.

## 7. Performance considerations for millions of shots

- **Never** ship full shot arrays to the browser for league-wide views.
  Aggregate server-side (zone %, hex bins, density grids) and send compact
  summaries.
- **Page** or **window** shot queries (`player + season`, `game_id`, date
  range). The `ShotFilters` type already models these knobs.
- **Index** `(season, player_id)`, `(season, team_id)`, `game_id`,
  `game_date`.
- **Cache** immutable season aggregates (ISR / CDN / Redis). Shot charts for
  completed games are append-only.
- **Columnar files** (Parquet) work well for offline ETL and warehouse
  scans; expose precomputed tiles to Next.js via the provider.
- **D3** only for custom court interactions; keep Recharts for standard
  scatters / line charts so bundle size stays predictable.
- **Virtualize** any raw shot tables in the UI; prefer charts of aggregates.

## Game data

`NBADataProvider` loads a season slate by fetching each team schedule
(`.../teams/{id}/schedule?season={year}&seasontype=2`), deduping by game id,
and filtering to the canonical season date window.

Box scores come from `.../summary?event={gameId}` via `getGameBoxScore()`.

Explore UI:

- `/explore/games` — total points vs home margin (shared filtered query)
- `/games/[gameId]` — box score detail

Query helpers: `getGames`, `getGame`, `getGameBoxScore`, `getFilteredGames`
(filters applied once in `applyGameFilters`).


```
src/
  data/
    types/           canonical model
    providers/       LocalDataProvider, NBADataProvider, sample data
    transformers/    raw → canonical
    queries/         app-facing API + shared filters
  components/
    charts/          reusable visualizations
    explore/         explore-page widgets
    ui/              shadcn primitives
  lib/               formatters, searchParam helpers, cn()
  app/
    explore/players  first working visualization
    players/[id]     player detail stub
```

## Data flow (current explore page)

```
URL searchParams
    → filtersFromSearchParams()
    → getFilteredPlayerSeasons(filters)
         → getDataProvider().getPlayerSeasons()
         → applyPlayerSeasonFilters()
    → PlayerUsageTsScatter(players)
    → PlayerSeasonTable(players)
```

Interactive controls update the URL; the server component re-runs the query.
No duplicated filter logic between chart and table.

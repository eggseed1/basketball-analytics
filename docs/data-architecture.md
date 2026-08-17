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

- `LocalDataProvider` — sample / JSON / CSV-backed adapter (offline demos)
- `NBADataProvider` — live ESPN-backed NBA data (production)

Resolve the active provider through `getDataProvider()`:

```ts
// DATA_PROVIDER=local | nba
import { getDataProvider } from "@/data/providers";
```

### Required production configuration

| Environment | Required `DATA_PROVIDER` | Notes |
| --- | --- | --- |
| **Vercel Production** | `nba` | Must be set in the Vercel project env. Sample data is not a substitute. |
| **Vercel Preview** | `nba` | Same as production so preview player pages match live careers. |
| **Vercel Development** | `nba` (recommended) | Matches preview/production. |
| **Local with `.env.local`** | usually `nba` | Matches production validation. |
| **Local offline / sample** | `local` | Explicit only — slug ids (`jokic`), not ESPN athlete ids. |

**Defaults (when unset):**

- On Vercel (`VERCEL` set): falls back to `nba` (see `bcb6834`).
- Elsewhere: falls back to `local` for offline demos.

### Environment loading (Next.js vs CLI)

tsx does not load `.env.local`. Next.js does. Do not assume a developer
shell has `DATA_PROVIDER=nba` just because `.env.local` does.

| Runtime | How env is loaded |
| --- | --- |
| **Next.js** (`next dev` / `next build`) | Loads `.env`, `.env.local`, `.env.production` automatically |
| **tsx scripts** (`npm run test:*`, most `smoke:*`) | Process env only. `.env.local` is **not** auto-loaded |
| **Opt-in CLI** (`diagnose:player-data`, `report:advanced-stats-coverage`, `prefetch:*`) | `tsx --env-file=.env.local …` |
| **Vitest / Jest** | Not used in this repo. Tests are `tsx scripts/test-*.ts` |

Provider-specific tests must declare the intended provider (construct
`NBADataProvider`, or call `requireNbaProviderForTest`). They must not
pass against `LocalDataProvider` sample rows when they claim to validate
ESPN. Deterministic tests stay fixture/offline and must **not** globally
set `DATA_PROVIDER=nba`.

**Invariant:** production/preview must never silently serve the local sample dataset for canonical ESPN player pages. Sample ids (`jokic`) do not match ESPN athlete ids (`3112335`); careers appear empty while bios still resolve from ESPN.

Diagnose:

```bash
npm run diagnose:player-data
npm run test:production-provider-guard
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
- `getTeams()` / `getTeam(teamId)` / **`getTeamsCatalog()`** (soft-fail)
- `getAvailableSeasons()`

### Team metadata resilience (Explore)

Explore filters (`/explore/players`, `/explore/games`) need a `Team[]` catalog for
dropdowns. That used to depend solely on live ESPN `…/nba/teams`, which can
return **403** from some datacenter IPs and crash the page with HTTP 500.

**Policy:** live freshness first; never 500 for optional team metadata.

```
fresh ESPN /nba/teams  (provider + espnFetchJson memory cache)
        │
        ▼ (on 403 / 429 / 5xx / timeout / empty)
process-local last-good ESPN catalog   → source = cached-espn
        │
        ▼ (if none)
canonical team identity map            → source = canonical-fallback
  (listCanonicalTeams / ESPN_TEAM_META)
```

- Canonical team identity remains authoritative for ids, abbrs, and branding.
- Catalog results expose `source` + `warnings` so diagnostics can distinguish
  live metadata from verified fallback (UI shows a subtle notice only).
- Provider outage ≠ “team not found” — invalid `?team=` tokens still resolve
  through `resolveCanonicalTeam` as unresolved.

### Historical team-era identity (Explore Games / Game Lab)

Provider normalization answers: *same franchise across ESPN vs BDL?*

Team-era identity answers: *what was this franchise called in this season?*

```
canonical franchise id (ESPN) + season
        →
team-era map (SEA SuperSonics, NJN, Bullets, …)
        →
Game.homeTeamAbbr / homeTeamName (display)
```

A 1969–70 SuperSonics game must never render as Oklahoma City Thunder merely
because the modern franchise id is OKC. Filters may still use the franchise id
(`?team=OKC` / `?team=SEA` both resolve to canonical `25`).

Game Lab / Explore brand keys prefer **era abbreviation** over franchise id so
logos do not resolve SEA→OKC CDN marks. Logo selection goes through
`resolveHistoricalTeamBrand(teamId, season)` (`src/lib/historical-team-brand.ts`):
verified assets in `HISTORICAL_TEAM_LOGO_ASSETS` / `public/logos/historical/`,
else **historical_text** monogram with era palette from `historical-team-palette.ts`,
else safe **current** CDN only when the era identity matches today's franchise,
else a neutral **text_fallback** mark. Never silently substitute Thunder art for Seattle.

Team links on Game Lab use `/teams/{canonicalId}?season={season}` — franchise
route with season context, while the visible label stays team-era.

Known gaps (documented, not invented):
- Original 1988–02 Charlotte Hornets continuity is tabulated under ESPN `3`
  (NOP lineage); some BDL rows may land on ESPN `30` with Hornets naming.
- No verified historical logo image files are committed yet; relocated/renamed
  eras use text marks until licensed assets are registered.

See `src/data/identity/team-era.ts`, `npm run test:historical-team-era`,
`npm run test:historical-team-brand`,
`npm run report:historical-team-identity`.

See `src/data/queries/teams-catalog.ts` and
`npm run test:teams-catalog-resilience`.

### Player board resilience (Explore players)

```
fresh ESPN byathlete board
        │
        ▼ (on 403 / 429 / 5xx / timeout)
process-local last-good REAL board   → source = cached-espn
        │
        ▼ (if none)
honest degraded empty state          → source = unavailable
```

Production **never** substitutes `LocalDataProvider` / sample rows for a live
board outage. `getPlayerSeasonBoardSnapshot()` exposes `source` + `warnings`.

### Scoreboard / Gamefeed resilience

```
fresh ESPN scoreboard
        │
        ▼
process-local last-good scoreboard   → source = cached-espn (labeled stale)
        │
        ▼
unavailable notice                   → source = unavailable
```

Cached scores are never presented as live. Home week strip degrades in-place.

### Production baseline (provider guard + known risks)

When `DATA_PROVIDER=nba` (production):

```
live ESPN → cached real data → honest unavailable
```

Never silently substitute local sample rows for a live ESPN outage
(`test:production-provider-guard`).

Surfaces hardened in this baseline: Explore team catalog, Explore player board,
scoreboard/Gamefeed, ASK recent-store stability, historical team-era display.

Still ESPN-dependent without the same soft-fail depth (separate audits):
player careers, player search, standings, transactions, box scores.

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

### Current live sources

Primary: **stats.nba.com** (most extensive free NBA Stats API).  
Supplement: **Basketball-Reference** league advanced tables (PER, OWS/DWS/WS,
BPM, VORP, STL%/BLK%).

| Need | Source |
| --- | --- |
| Player season counting (totals) | `stats.nba.com/stats/leaguedashplayerstats` MeasureType=Base |
| On-court advanced (ORtg/DRtg/USG%/AST%/…/PIE) | same endpoint, MeasureType=Advanced |
| PER / WS / BPM / VORP / STL% / BLK% | BRef `NBA_{year}_advanced.html` scrape |
| Career seasons | `playercareerstats` |
| Game logs | `playergamelog` |
| Games | `leaguegamelog` (Team) |
| Box scores | `boxscoretraditionalv2` |
| Shot charts | `shotchartdetail` |

Flow:

```
stats.nba.com JSON  ─┐
                     ├→ transformers/stats-nba.ts (+ BRef merge)
BRef advanced HTML  ─┘
  → canonical PlayerSeason / Player / Team / PlayerGame / Shot
  → query layer → UI
```

Notes:

- Season strings stay canonical (`2024-25`). ESPN’s year param is the ending
  year (`2025`). Historical NBA Stats / BRef paths also use `YYYY-YY`.
- Player / team / game ids on the live ESPN path are ESPN athlete / team ids.
  Analytics DRBL artifacts and NBA Stats adapters may still use NBA Stats ids
  (e.g. LeBron `2544`); joins go through identity maps / name keys as needed.
- BRef rows (when used) merge by normalized player name + team abbreviation.
- `trueShootingPct` / `effectiveFieldGoalPct` / `usagePct` are **derived** from
  counting stats (+ team totals for USG%). Standard formulas live in
  `providers/nba/compute-advanced.ts`. When required inputs or denominators are
  missing, the derived field is **omitted** (not coerced to `0`).
- `offensiveRating` on ESPN season boards is an **approximate** pts-per-100
  estimate from individual counting possessions when those inputs exist.
  ESPN does **not** publish individual `defensiveRating` / `netRating` on the
  athlete season board — those fields stay unavailable (`—` in UI). Never invent
  `DRtg = 0` or `NET = ORtg − 110`.
- Canonical DRBL/100, R1 Points, and R1 Win Equivalents overlay only for seasons
  in `drbl/historical/season-registry` (via `listDrblSeasons` /
  `fetchDrblSeason`). Missing R1 fields stay `null`, never `0`.
- `getShots()` may return `[]` on the ESPN path — shot charts need a separate
  ingest (NBA CDN / warehouse), documented in §6.
- **Freshness:** current-season league/game/log caches expire in 2–5 minutes;
  pages set `revalidate` and may include client refresh so new games appear
  without a hard reload.

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

`NBADataProvider` loads a season slate by fetching each team schedule for
**regular season and playoffs** (`seasontype=2` and `3`), deduping by game id,
and filtering to the canonical season date window.

Box scores come from `.../summary?event={gameId}` via `getGameBoxScore()`.

Shot attempts come from the same summary endpoint’s `plays` feed
(`shootingPlay` + coordinates) via `getShots({ gameId })` or scoped
`getShots({ season, player })` / `getShots({ season, team })` (capped for
live responsiveness).

Explore UI:

- `/explore/games` — total points vs home margin (shared filtered query)
- `/games/[gameId]` — box score detail + tracked shot count

Query helpers: `getGames`, `getGame`, `getGameBoxScore`, `getFilteredGames`,
`getShots` (filters applied in the query/provider layer).


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

## Data flow (current explore players page)

```
URL searchParams (?season&team&sort&dir&page&player…)
    → filtersFromSearchParams()
    → getExplorePlayersBoardView()
         → getPlayerSeasonBoardSnapshot()  (full filtered board, cached)
         → server sort + page window (100 rows)
         → slim ExplorePlayerBoardRow[] + Level-2 contextPools
    → PlayerSeasonTable (current page only)
```

Full board remains available via filters/sort/pagination — not serialized into
one HTML response. Interactive controls update the URL; the server re-queries.

## 8. Historical API (1960–present) + DARKO / LEBRON

HTTP route handlers under `src/app/api/` expose historical games, box scores,
advanced stats, and impact metrics:

| Route | Source |
| --- | --- |
| `GET /api/seasons` | Canonical `1960-61` … current |
| `GET /api/games` | BallDontLie games (free tier with `BALLDONTLIE_API_KEY`) |
| `GET /api/games/[id]/box-score` | BallDontLie box scores (GOAT) or ESPN summary fallback |
| `GET /api/stats/players` | ESPN season counting + derived TS%/eFG%/USG% + impact join |
| `GET /api/stats/games` | BallDontLie `/nba/v1/stats` (ALL-STAR+) |
| `GET /api/stats/advanced` | BallDontLie `/nba/v2/stats/advanced` (GOAT) or derived rates |
| `GET /api/impact/darko` | Live scrape of public [darko.app](https://www.darko.app/) DPM board |
| `GET /api/impact/lebron` | `data/impact/lebron.csv` override, else seed snapshot |

Service facade: `HistoricalNbaService`
(`src/data/providers/historical/historical-nba-service.ts`).

```bash
# .env.local
BALLDONTLIE_API_KEY=...   # https://app.balldontlie.io
```

Tier notes (BallDontLie):

- **Free** — teams, players, games back to 1946 (we expose from 1960).
- **ALL-STAR** — per-game player stats (`/api/stats/games`).
- **GOAT** — box scores + advanced (`/api/games/.../box-score`, `/api/stats/advanced`).

DARKO / LEBRON are third-party impact metrics (pts/100). DARKO is mirrored from
the public leaderboard; LEBRON has no public API — drop BBall Index exports into
`data/impact/lebron.csv` (see that folder’s README).

## Data Truth Rules

1. **Missing data is not zero.** Unavailable metrics render as `—`, never `0` /
   `0.0` / `0%` invented for schema convenience.
2. **Never fabricate a statistic** to satisfy a UI or TypeScript required field.
   Prefer optional canonical fields and omit when the source has no value.
3. **Derived statistics require valid inputs.** TS%, eFG%, USG%, and approximate
   ORtg come from documented formulas in `compute-advanced.ts`. Missing
   denominators or team totals → omit the derived field.
4. **Derived / approximate statistics must be identified as such** (docs + ASK
   coverage gaps). Do not present ESPN approx ORtg as provider-published ORtg.
5. **Historical statistics must remain season-true.** No modern overlay onto
   other seasons; no adjacent-season substitution for impact metrics.
6. **Impact metrics require verified season provenance.** Live DARKO only for
   its stamped season; LEBRON only season-keyed rows that exist.
7. **Provider IDs stay at provider boundaries.** Canonical team/player identity
   is resolved explicitly — never silently remapped to a modern brand/id.
8. **Production never silently uses sample data.** `DATA_PROVIDER=nba` on
   production; local sample is explicit and labeled.
9. **Free-text transaction events are not structured ownership records.**
   Reciprocal trade clustering stays high-confidence only; genealogy remains
   blocked until structured edges exist.
10. **Unsupported ASK queries remain unsupported.** Do not answer with a related
    metric or estimate when the requested metric is unavailable.

# DRBL Branch Deliverables (`drbl-ia-and-ask`)

Human-readable inventory of this branch relative to `main`. Not a complete file dump.

## Major features

- ASK DRBL + ASK Builder (structured query engine, examples, recent store)
- Player / Team / Games explore boards with soft-fail ESPN resilience
- Player and Team destination pages (progressive islands)
- Game Lab scoreboard shell + identity continuity
- Offseason / transactions tracker (structured ledger / genealogy still blocked)
- Compare, Season Compare, Rank My Seasons (player + team)
- Time Machine (`/history`) with era theme
- Historical team-era identity (franchise names/abbr by season)
- Historical branding (text marks; logo slot reserved)

## Major architecture changes

- Canonical team map: DRBL id = ESPN team id; BDL ids namespaced
- Game team identity normalization (`homeTeamId` canonical; provider ids retained)
- Production provider guard + provider parity (CLI env vs Next)
- ESPN roster/board for supported seasons; pre-modern fail-fast / archive-only games
- Request-scoped caches and destination budgets
- Continuity shells (loading frames, query-nav, route transition)
- PBP corpus attach API (non-executable capability)
- Advanced-stats **diagnostic** layer (not user-facing ratings)

## New routes

| Route | Role |
| --- | --- |
| `/ask` | ASK DRBL |
| `/history` | Time Machine |
| `/compare` | Compare |
| `/offseason` | Transactions / offseason |
| `/explore/players` · `/explore/teams` · `/explore/games` | Explore boards |
| `/players/[playerId]` (+ season-compare / season-rank) | Player Intelligence |
| `/teams/[teamId]` | Team Intelligence |
| `/games/[gameId]` | Game Lab |
| `/learn` · `/learn/[slug]` | Metric explainers |
| `/franchises` · `/franchises/[id]` | Franchise Lab entry |
| `/gm/*` | MyLeague GM sim (pre-existing surface on branch) |

## Important new modules

| Area | Paths |
| --- | --- |
| Query engine | `src/query-engine/*` |
| Continuity | `src/components/continuity/*` |
| Time Machine | `src/components/time-machine/*`, `src/themes/*` |
| Historical brand | `src/lib/historical-team-brand.ts`, `src/lib/historical-team-palette.ts` |
| Destinations | `src/lib/player-destination.ts`, `src/lib/team-destination.ts` |
| Identity | `src/data/identity/*`, `src/lib/team-identity.ts`, `src/lib/game-team-identity.ts` |
| PBP attach | `src/pbp/corpus.ts`, `src/pbp/corpus.server.ts` |
| Advanced-stats audit | `src/data/providers/advanced-stats/*` |
| Diagnostics | `src/data/diagnostics/*` |

## Important scripts / tests

| Command | Kind |
| --- | --- |
| `npm run test:drbl-release` | Release gate (fixture + live-ESPN sections) |
| `npm run test:drbl-release:fixture` | Deterministic / offline |
| `npm run test:drbl-release:live-espn` | Provider-specific (ESPN public JSON) |
| `npm run test:data-truth` | Fixture |
| `npm run test:historical-team-fail-fast` | Live ESPN + local archive |
| `npm run test:progressive-destinations` | Fixture / source |
| `npm run test:pbp-capability` · `report:pbp-coverage` | Fixture (corpus absent OK) |
| `npm run diagnose:player-data` | Diagnostic (`--env-file=.env.local`) |
| `npm run report:advanced-stats-coverage` | Diagnostic (BDL key; may 401) |

## Environment variables (names only)

| Name | Role |
| --- | --- |
| `DATA_PROVIDER` | `local` \| `nba` (Vercel unset → `nba`; local unset → `local`) |
| `BALLDONTLIE_API_KEY` | Historical games / BDL APIs |
| `PBP_DATA_PATH` | Optional external PBP corpus root |
| `VERCEL` | Platform signal; influences provider default |
| `DRBL_REQUIRE_LIVE_NBA` | Opt-in loud fail for diagnose when sample is active |
| `NODE_ENV` | Next / React mode |

Never commit secret values. Use `.env.local` locally (gitignored). Configure production via Vercel project env.

## Non-Git dependencies

See **Environment contract** in `docs/RELEASE_BASELINE.md` companion section below and the dedicated section in this file.

### Vercel / hosting

- Project env must set `DATA_PROVIDER=nba` (or rely on `VERCEL` → nba fallback)
- Preview should match production provider policy
- No PBP corpus is assumed on Vercel unless `PBP_DATA_PATH` / volume is configured

### External providers

| Provider | Used for | Credential |
| --- | --- | --- |
| ESPN public JSON | Live boards, careers, scoreboard, team metadata | None (public endpoints; soft-fail on HTTP errors) |
| BallDontLie | Historical games cache, some box/advanced (tiered) | `BALLDONTLIE_API_KEY` |
| Impact overlays (DARKO / LEBRON family) | When stamped season data is present | Repo/fixture/cache dependent — not a secret env in baseline |

### Ignored / generated data (not in Git)

| Path / pattern | Notes |
| --- | --- |
| `data/cache/` | Historical games cache (prefetch) |
| `data/pbp/**` except `README.md` | External PBP event dumps |
| `.next/` | Next build output |
| `.env.local` | Local secrets |
| `.vercel/` | CLI link metadata |

### Historical assets

- `public/logos/historical/` — README only; **no** verified logo files committed
- Time Machine uses text marks until assets are owned/licensed and registered

## Intentional unsupported features

- PBP ASK / Game Lab executors (capability false)
- User-facing ORtg / DRtg / NET from BDL advanced season averages (access blocked)
- Trade genealogy UI (`genealogyUiReady: false`)
- Structured draft capital / TPE ledgers (blocked pending structured source)
- Pre-2000 ESPN athlete roster boards (unsupported, no network)
- Pre-2001 team season boards (unsupported, no network)
- Fabricating historical official logos from CDN/modern marks

## Related docs

- `docs/RELEASE_BASELINE.md` — snapshot + blockers
- `docs/data-architecture.md` — providers, data truth, CLI vs Next env
- `docs/advanced-stats-source-audit.md` — diagnostic-only advanced ratings
- `docs/historical-pbp-audit.md` — PBP attach status

# Basketball Analytics

Modern basketball analytics site (Next.js App Router) with a canonical data
layer over live NBA stats.

**For AI / onboarding context:** see [`WORKBOOK.md`](./WORKBOOK.md) — full map of
routes, features, data sources, and how the current site was built.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data provider

Default in `.env.local`: **live NBA data** via `NBADataProvider`
(`stats.nba.com` + Basketball-Reference advanced metrics → canonical types).

```bash
# .env.local
DATA_PROVIDER=nba    # live
# DATA_PROVIDER=local  # built-in sample dataset

# Historical games 1960–present (BallDontLie)
BALLDONTLIE_API_KEY=your_key_here
```

### Player season + game APIs

| Endpoint | Returns |
| --- | --- |
| `GET /api/players/[id]/seasons` | Career season stats (PTS/AST/REB, TS%, eFG%, …) |
| `GET /api/players/[id]/games?season=2023-24` | Per-game box lines for that season |
| `/players/[id]?season=2023-24` | UI: career table + full game log |

Uses ESPN athlete career + gamelog feeds (no BallDontLie paid tier required).

```bash
npm run smoke:historical
```

See [docs/data-architecture.md](docs/data-architecture.md) for the provider /
query / transformer design, derived advanced metrics, and shot-ingest plans.

# Basketball Analytics

Modern basketball analytics site (Next.js App Router) with a canonical data
layer inspired by Baseball Savant / Databallr workflows.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000/explore/players](http://localhost:3000/explore/players).

## Data provider

Default in `.env.local`: **live NBA data** via `NBADataProvider` (ESPN JSON →
canonical types).

```bash
# .env.local
DATA_PROVIDER=nba    # live
# DATA_PROVIDER=local  # built-in sample dataset
```

See [docs/data-architecture.md](docs/data-architecture.md) for the provider /
query / transformer design, derived advanced metrics, and shot-ingest plans.

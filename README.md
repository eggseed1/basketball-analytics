# Basketball Analytics

Modern basketball analytics site (Next.js App Router) with a canonical data
layer over live NBA stats.

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
```

See [docs/data-architecture.md](docs/data-architecture.md) for the provider /
query / transformer design, derived advanced metrics, and shot-ingest plans.

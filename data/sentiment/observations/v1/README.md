# Sentiment observations (S1 ingest scaffold)

Raw observation batches land here before rollup into `data/sentiment/v1/snapshot.json`.

## Format

Each `*.json` file is a `SentimentObservationBatch`:

- `batchId` — unique batch identifier
- `collectedAt` — ISO timestamp
- `modelVersion` — scorer / classifier version
- `observations` — array of `SentimentObservation` rows (`src/sentiment/types.ts`)
- `entityType` may be `"player"` or `"team"` (ESPN franchise id for teams)

Start from `_template.example.json` (not loaded by the build — rename/copy to `obs-*.json`).

## Build

```bash
npm run sentiment:build
```

The build merges pilot profiles from `data/sentiment/seeds/v1/`, rolls up any observation batches in this folder, syncs `teamKey` + ESPN-first `playerIds` from the live roster when available, dual-writes `data/sentiment/v1/snapshot.json` and `src/data/runtime/sentiment-snapshot.json`, and precomputes movers.

Coverage floors live in `seeds/v1/manifest.json`. Status UI: `/internal/sentiment`.

## Policy

See `docs/architecture/sentiment.md` — no platform scraping without permitted access and S0 policy sign-off.

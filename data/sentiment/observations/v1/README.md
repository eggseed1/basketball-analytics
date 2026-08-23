# Sentiment observations (S1 ingest scaffold)

Raw observation batches land here before rollup into `data/sentiment/v1/snapshot.json`.

## Format

Each `*.json` file is a `SentimentObservationBatch`:

- `batchId` — unique batch identifier
- `collectedAt` — ISO timestamp
- `modelVersion` — scorer / classifier version
- `observations` — array of `SentimentObservation` rows (`src/sentiment/types.ts`)

## Build

```bash
npm run sentiment:build
```

The build merges pilot profiles from `data/sentiment/seeds/v1/`, rolls up any observation batches in this folder, syncs `teamKey` from the ESPN preseason roster, and writes precomputed movers into snapshot meta.

## Policy

See `docs/architecture/sentiment.md` — no platform scraping without permitted access and S0 policy sign-off.

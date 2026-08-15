# Transaction + asset genealogy foundation (methodology v1.0)

**Status: real free-text archive ingested — structured genealogy UI remains BLOCKED.**

Canonical modules:

- Types: `src/data/types/transaction-lineage.ts`
- ESPN client: `src/data/providers/transactions/espn-transactions-client.ts`
- Transformer: `src/data/transformers/espn-transactions.ts`
- Archive store: `src/data/providers/transactions/transaction-archive-store.ts`
- Validation: `src/data/providers/transactions/transaction-validation.ts`
- Index: `src/data/providers/transactions/transaction-lineage-index.ts`
- Queries: `src/data/queries/transaction-lineage.ts`
- Offseason event stub: `src/offseason/index.ts` (`TransactionEvent`)

## Audit conclusion (updated 2026-08)

| Source | Finding |
| --- | --- |
| ESPN `site.api` `/nba/transactions` | **Used.** Calendar-year free-text blurbs from **2000–present** (`date` + `team` + `description`). No athlete ids, picks, or multi-team asset graph. |
| BallDontLie | Games/players/stats/contracts (paid). **No** transactions/trades endpoint. Player `draft_year/round/number` exists but ESPN↔BDL aliases are empty — not admitted as lineage. |
| Local `data/` CSVs | Salaries / impact / games only — **no** trade ledger |
| `src/offseason` | Types only |
| Franchise Lab `tradeLog` | Simulation-only — **not admitted** |

> Do we have enough data for a trustworthy historical asset lineage UI?
> **No.** We have a provenance-backed **transaction blurb archive**, not a structured asset graph.

## Ingestion sources

### `espn-site-v2-transactions` (dataset v1.0)

- Endpoint: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions?season={YYYY}`
- Note: ESPN’s `season` query param for this feed is a **calendar year** (Jan–Dec), not an NBA `YYYY-YY` label.
- Canonical NBA season is derived from the transaction date (July–June flip).
- On-disk: `data/transactions/espn-site-v2/v1/`
- Rebuild: `npm run ingest:espn-transactions`

Normalization rules:

1. Stable id = `espn-tx-` + sha1(`date|teamId|description`)[:16]
2. Type = documented keyword classification of `description` (trade / draft / waive / signing / …)
3. **Zero** player or draft-pick assets emitted (no ids in source)
4. **Zero** ownership edges
5. Multi-team deals are **not** merged — each team blurb stays its own row
6. Provenance required on every accepted row

## Genealogy readiness (conservative)

`genealogyUiReady` requires **all** of (fixtures never count):

| Criterion | Threshold |
| --- | --- |
| Non-synthetic real archive | required |
| Transactions | ≥ 1,000 |
| Ownership edges | ≥ 500 |
| Draft-pick assets | ≥ 100 |
| Player assets with ids | ≥ 500 |
| Broken edge rate | ≤ 2% |

ESPN v1 fails ownership / pick / player-asset criteria by design.

## What this foundation provides

1. Canonical asset / transaction / ownership / lineage types  
2. Repeatable ESPN ingest → disk → index → queries  
3. Coverage + validation diagnostics  
4. Graph walkers (tested with **synthetic fixtures only**)  
5. Honest empty/blocked lineage for production assets  

## Explicit non-goals (still)

- No family-tree UI  
- No name-parsing players out of ESPN blurbs  
- No Franchise Lab sim trades in the real-world graph  
- No trade evaluation mixed into factual lineage  
- No promoting ESPN free-text (or related-event clusters) into structured transactions  

## Related-event clusters (Offseason Tracker)

The Offseason Tracker may **group** reciprocal ESPN blurbs (same date + mutual team brand mentions) as a **related event cluster**. That projection:

- preserves each raw description verbatim
- does **not** create player/pick assets or ownership edges
- does **not** set `genealogyUiReady`
- is documented in `docs/offseason-tracker.md` (Transaction Event Semantics)

Multi-team deals remain separate rows in the canonical archive; clustering is a read-time / index projection only.

## Query API

```ts
getTransactionLineageCoverage()
listCanonicalTransactions()
getCanonicalAsset(assetId)
getAssetOwnershipHistory(assetId)
traceAssetLineageBackward(assetId)
traceAssetLineageForward(assetId)
getPlayerAcquisitionLineage(playerId)
isTransactionGenealogyUiReady()
```

```bash
npm run ingest:espn-transactions
npm run report:transaction-lineage
npm run test:transaction-lineage
```

## Relationship to Offseason Tracker

Future real-world offseason ingest must append **`CanonicalTransaction` / ownership edges** into this same archive system. Do not create a second transaction database.

## When can genealogy UI ship?

Only after a **structured** trade + draft + pick-ownership ledger is ingested and readiness criteria pass on real data.

Until then:

> Historical transaction lineage (asset family trees) is not available yet.
>
> A free-text transaction archive from 2000 onward is available for diagnostics / future offseason timelines — not for genealogy.

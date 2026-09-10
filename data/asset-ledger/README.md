# Asset ledger (structured trades, contracts, picks)

Versioned structured data for accurate trades and team front-office assets.

## Layout

```
data/asset-ledger/v1/
  manifest.json
  structured-transactions.jsonl
  ownership-edges.jsonl
  contracts.jsonl
  contract-years.jsonl
  draft-picks.jsonl
  trade-exceptions.jsonl
```

## Rebuild

```bash
npm run asset-ledger:sync      # disk provenance
npm run asset-ledger:bundle    # → src/data/runtime/asset-ledger-snapshot.json
```

## Trust model

| Layer | Source | Use |
| ----- | ------ | --- |
| Structured transactions | `seeds/structured-trades.json` + licensed feeds | Asset graph, pick ownership |
| Contracts | Salary CSV + roster identity | Multi-year payroll |
| ESPN blurbs | `data/transactions/espn-site-v2/` | Narrative context only — never parsed into assets |

Genealogy UI unlocks only when readiness thresholds in `transaction-lineage-index.ts` are met.

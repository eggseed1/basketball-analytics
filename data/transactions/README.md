# Historical transactions

## Archive (ESPN free-text blurbs)

Path: `data/transactions/espn-site-v2/v1/`

| File | Purpose |
| --- | --- |
| `manifest.json` | Coverage + limitations + content hash |
| `transactions.jsonl` | Canonical transactions (one JSON object per line) |
| `ownership-edges.jsonl` | Ownership edges (**empty** for ESPN v1) |
| `validation-summary.json` | Normalize/validate issue counts |
| `raw/{YYYY}.json` | Raw ESPN calendar-year dumps (repeatable rebuild) |

### Rebuild

```bash
npm run ingest:espn-transactions
# or limited window:
npx tsx scripts/ingest-espn-transactions.ts --from 2024 --to 2026
# rebuild canonical from existing raw dumps (no network):
npx tsx scripts/ingest-espn-transactions.ts --from-raw
```

### What this source provides

- Dated team-attributed transaction **descriptions** (calendar years **2000–present**)
- ESPN team id + abbreviation
- Provenance (`espn-site-v2-transactions`)

### What this source does **not** provide

- Athlete / player ids
- Structured multi-team asset graphs
- Draft pick identity, protections, swaps, ownership chains
- Anything that can unlock `genealogyUiReady`

Do **not** invent player/pick assets by parsing names from descriptions.

See `docs/transaction-lineage.md`.

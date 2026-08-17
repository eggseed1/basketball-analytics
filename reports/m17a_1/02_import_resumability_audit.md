# Import resumability audit (M17a.1)

## Required behavior
- Existing **valid** game JSON → **skip** (no overwrite)
- Truncated / invalid JSON → treated as missing → re-fetch
- Atomic write: temp → JSON.parse validate → rename
- Durable ledger: `reports/m17a_1/import/import_ledger.jsonl`
- Bounded retries (max 3) with backoff for RATE_LIMIT / TRANSIENT_NETWORK
- Terminal states: COMPLETE | SOURCE_CONFIRMED_UNAVAILABLE | FAILED_AFTER_BOUNDED_RETRIES

## Status
Importer script hardened in `scripts/drbl-import-historical.ts` + `drbl/download/atomic-json.ts`.
The **currently running** process may still be the pre-hardening binary in memory; it already skips existing files via `fileExists`. Hardened skip uses `isValidJsonFile`. Next resume picks up hardened behavior.

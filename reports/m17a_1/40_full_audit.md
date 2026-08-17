# M17a.1 full audit (partial — NOT FINAL)

`M17A_1_STATUS = RAW_IMPORT_IN_PROGRESS`  
`M17A_1_RESULT = RAW_IMPORT_INCOMPLETE`  
`M17B_AUTHORIZED = NO`

## Verdict
`RAW_IMPORT_INCOMPLETE` / `CONTINUE_RAW_IMPORT`

Existing importer is **RUNNING** (no duplicate launched). Expected regular-season games 1996-97…2023-24: **33087**. Both-valid complete at early audit snapshot: **83**.

## Completed in M17a.1 so far
- Process detection + lock observation
- Resumable/idempotent importer hardening (atomic JSON, ledger, lock, bounded retries)
- Rate policy preserved (`--delay 120`)
- Schedule-based coverage enumeration for all 28 seasons
- Current-season lineup forensics
- Season registry taxonomy: `modelProductStatus=CANONICAL_PRODUCTION` vs source-quality tier
- Normalization version decision: keep `historical-pbp-normalized-v1`

## Blocked until RAW_IMPORT_FINISHED=YES
- Full raw manifest fingerprint
- Full scoreboard / sub / lineup / possession / identity / R1 / EPV matrices for pre-2024
- Support-tier freeze for historical seasons
- Frozen-v1 shadow backfill + website historical publication
- M17b authorization

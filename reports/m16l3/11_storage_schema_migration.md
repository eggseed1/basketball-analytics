# Storage schema migration

DATABASE_MIGRATION_REQUIRED = NO

Reason: product values are generated/static JSON under `src/data/drbl/precomputed/`.
No relational DB columns were overwritten. Legacy `drblWar` retained; R1 fields added.

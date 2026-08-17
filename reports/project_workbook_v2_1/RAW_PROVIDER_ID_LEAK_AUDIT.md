# RAW_PROVIDER_ID_LEAK_AUDIT

See also: `reports/product_completeness_v1_2/07_raw_provider_id_leak_audit.csv`.

## P17.2 finding

Explore Players TM previously rendered NBA Stats `TEAM_ID` (`16106127xx`) and TeamLogo digit badge (`161`).

## Post-repair

- Transform boundary normalizes to ESPN canonical ids
- UI rejects long digit strings as labels
- `TeamLogo` / `resolveTeamBrand` refuse inventing brands from digit prefixes
- Known public leaks in audit: **0**

# M16l3 rollback plan

Engineering-only rollback:

1. Restore prior `src/data/drbl/precomputed/2024-25.json` and `2025-26.json` from git
2. Remove `*-r1-stints.json` if needed
3. Preserve all `reports/m16l1_2` and `reports/m16l2` research outputs and seals
4. Do not alter model formulas or refit P1

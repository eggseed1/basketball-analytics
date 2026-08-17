# M16l3 product data lineage

## Path
1. Primitive Approach-B attribution (research: m16l1.2 / m16l2)
2. Player-season R1 Points = observed attributed residual (full precision)
3. R1 Win Equivalents = R1 Points / P1 (37.490662671779255)
4. Production boards: `src/data/drbl/precomputed/{season}.json` player rows
5. Stints: `src/data/drbl/precomputed/{season}-r1-stints.json`
6. Loader: `src/data/providers/nba/drbl-loader.ts` → NBA data provider overlay
7. Transformer: `src/data/transformers/stats-nba.ts` maps `r1Points` / `r1WinEquivalents`
8. UI: explore sort / savant / player-stat-views consume product fields (no frontend formula)

## Single source
Research-frozen values are written onto boards; UI/API must not recompute R1.

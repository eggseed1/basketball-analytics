# Ranking contract (M16g2)

## Production today
- Default ranking mode: `season_value` (season value / WAR), **not** raw `drbl100` sort.
- Ability boards may still sort by `drbl100` when mode=`ability`.
- Production rank fields remain unchanged in M16g2.

## Research shadow ranking
```text
researchRank = descending researchDRBL100
```
Research artifact only. No cumulative-value ranking. No WAR ranking substitution.
Do not modify production rank.

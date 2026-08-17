# Public metric coverage

Map: **metric → learn → tooltip/glossary → surfaces**  
Source of truth table: `supporting_reports/product_completeness_v1_1/16_metric_coverage_final.csv`.

| Metric | Public? | Learn | Glossary | Home | ASK | Compare | Season cmp/rank | History | Player | Explore |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DRBL/100 | YES | `/learn/drbl` | YES | default sort | YES | overall | YES | season leaders | Snapshot | sort |
| R1 Points | YES | YES | YES | NO | YES | realized | YES (distinct labels) | NO | Snapshot | column |
| R1 Win Equivalents | YES | YES | YES | NO | YES | realized | partial | NO | Snapshot | column |
| DRBL-O / DRBL-D | Disclosure | YES | YES | NO | partial | O/D row | O/D | NO | disclosure | NO |
| DRBL-P / LN / B | Disclosure | YES | YES | NO | NO | NO | diagnostic + non-additive warn | NO | disclosure | NO |
| DARKO DPM | External | partial | YES | secondary | YES | external group | NO | NO | comparison | YES |
| DRBL WAR | NO (retired) | retired | NO | NO | NO | NO | NO | NO | NO | redirect → R1 Win Eq. |
| DRBL ± | NO | retired | legacy | NO | NO | NO | NO | NO | NO | NO |
| UIR-C | Research only | mention | NO | NO | NO | NO | NO | NO | NO | NO |

## Coverage seal fields

```text
PUBLIC_DRBL_STAT_LEARN_COVERAGE = 3/3
PUBLIC_DRBL_STAT_TOOLTIP_COVERAGE = 3/3
```

## Notes

- Frozen **P1** for R1 Win Equivalents; not traditional WAR
- Dashboard Contour box metrics are a secondary lab — DRBL deferred there
- M17c / UIR remain research-only; **M17c = NOT_STARTED**

# Player DRBL product surface

## First-class after P17.1

| Surface | Behavior |
|---|---|
| `/` home | **DRBL-first** TopPerformers; transparent fallback when overlay missing |
| `/ask` | DRBL vocabulary + grounded metric answers (identity-gated) |
| `/compare` | DRBL/100 overall; R1 realized; asymmetric Unavailable |
| `/players/[id]/season-compare` | DRBL attach; non-additive warning on P/LN/B |
| `/players/[id]/season-rank` | Copeland + DRBL rank/percentile; R1 Points rank labeled distinctly |
| `/history` | Season DRBL/100 leaders for registry seasons only |
| `/explore/players` | Columns DRBL/100, R1 Points, R1 Win Eq.; alias overlay |
| `/players/[id]` | DRBL Snapshot; headline prefers valid DRBL over DARKO |
| `/teams/[id]` roster | Highest-value prefers valid DRBL; else DARKO |
| `/learn/drbl` | Expanded methodology for headline + diagnostic metrics |

Hierarchy evidence: `supporting_reports/product_completeness_v1_1/09_sitewide_drbl_hierarchy.csv`.

## Intentionally not DRBL-complete

| Surface | Status |
|---|---|
| `/dashboard` | **INTENTIONALLY_DEFERRED** (Contour lab) |
| All-time / GOAT / career cumulative DRBL | **INTENTIONALLY_NOT_SUPPORTED** |
| Orphaned savant UI | Not remounted; Snapshot remains canonical |

## Merge / null rules

- Ability fields prefer a source with `hasValidDrblEstimate`
- R1 Points / R1 Win Equivalents **never invent zeros**
- Unsupported seasons surface explicit empty reasons
- Runtime join uses **productionApproved** aliases only

## Screenshots

See `screenshots/` (home, ask, compare, history, player, explore, learn, team).

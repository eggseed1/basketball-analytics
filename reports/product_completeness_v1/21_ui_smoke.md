# 21 — UI smoke

**Status:** Screenshots **deferred** for this P17 product-completeness seal.

## What to verify (manual / later capture)

| # | Surface | Verify |
|---|---|---|
| 1 | `/players/{espnId}` (star + mid rotation) | DRBL Snapshot visible when season supported + alias resolves; empty-state reasons when not |
| 2 | `/players/{espnId}` unsupported season | UNSUPPORTED messaging; no invented R1 zeros |
| 3 | `/explore/players` | DRBL/100 + R1 columns; board health banner clarifies live vs precomputed overlay |
| 4 | `/explore/teams` | Full team names (not abbr-only) on desktop |
| 5 | `/teams/{espnId}` roster | Highest-value prefers DRBL when present; DARKO fallback label honest |
| 6 | `/learn/drbl` | O/D/P/LN/B + non-additive + retired WAR/uncertainty copy |
| 7 | `/` home | Still DARKO-first (known gap) — confirm no false DRBL claim |
| 8 | `/ask` | Still no DRBL metric answers (known gap) |
| 9 | `/compare` | Still no DRBL (known gap) |
| 10 | `/history` historical relocated franchise | Text mark / era name; **no** fake historical logo |
| 11 | Mobile | Player DRBL Snapshot grid + explore players columns |

## Existing captures (workbook v1 only)

`reports/project_workbook_v1/screenshots/` contains prior integration-era PNGs (home, explore players, learn/drbl, etc.). They are **not** re-validated as P17 post-fix evidence.

## Not done

- Fresh P17 screenshot index
- Visual regression diff vs workbook v1
- Mobile device lab pass

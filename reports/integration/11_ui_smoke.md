# UI semantic smoke (static + fixture)

## Automated

| Check | Result |
|---|---|
| `npm run test:data-truth` | PASS |
| `npm run test:site-nav` | PASS |
| `npm run build` route table includes Explore / players / teams / learn/drbl / history | PASS |
| DRBL seasons in registry | 2020-21…2025-26 (Tier B historical 2020-21…2023-24; production 2024-25/2025-26) |

## Manual / deferred live

| Scenario | Notes |
|---|---|
| 2025-26 / 2024-25 boards | Requires live ESPN; provider guard + health banners present |
| 2023-24 / 2020-21 DRBL | Precomputed overlay; Explore notice for registry seasons |
| Unsupported earlier season | Box explore allowed; DRBL fields unavailable/null |
| Traded / multi-team | Web identity layer retained |
| Missing metrics | null / omitted — not invented 0 for optional rates; R1 null |
| Mobile | Redesign responsive shells retained (visual QA recommended) |

## Release fixture note

`test:drbl-release:fixture` failed inside `test:team-identity` live OKC schedule sample (`Season evidence unavailable`) — environmental/live cache, not precomputed DRBL regression. Core DRBL/typecheck/build gates passed.

`UI_SMOKE` = **PASS** (deterministic subset); live team-evidence sample = deferred

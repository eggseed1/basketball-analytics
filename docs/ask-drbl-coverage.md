# ASK DRBL advanced-stat coverage audit

Generated for ASK DRBL v1.1. Do not treat board fields as multi-decade feeds.

| Metric | Earliest | Latest | Player coverage | Reliable? | Source |
| --- | --- | --- | --- | --- | --- |
| PPG | counting-era | 2025-26 | Career counting rows (ESPN / historical) | yes | Player-season board (counting) |
| RPG | counting-era | 2025-26 | Career counting rows | yes | Player-season board (counting) |
| APG | counting-era | 2025-26 | Career counting rows | yes | Player-season board (counting) |
| TS% | counting-era | 2025-26 | Derived from PTS/FGA/FTA on career & boards | yes | Player-season board (derived) |
| eFG% | counting-era | 2025-26 | Derived from FGM/3PM/FGA | yes | Player-season board (derived) |
| FG% | counting-era | 2025-26 | Career / board | yes | Player-season board |
| 3P% | counting-era | 2025-26 | Career / board (era-dependent volume) | yes | Player-season board |
| FT% | counting-era | 2025-26 | Career / board | yes | Player-season board |
| USG% | 2000-01 | 2025-26 | Modern ESPN season boards; career rows often lack USG | limited | Modern player-season board (when present) |
| DARKO DPM | 1996-97 | 2025-26 | Overlay when baked for the asked season | yes | Verified historical impact (DARKO season-keyed) |
| RAPTOR | 1976-77 | 2021-22 | FiveThirtyEight open data; blank after 538 stopped | yes (through 2021-22 only) | Verified historical impact (RAPTOR season-keyed) |
| BPM | 1996-97 | 2025-26 | BRef advanced bake when present | yes | Basketball-Reference advanced |
| CPI | counting-era | 2025-26 | Derived for Career Resume qualifying seasons | yes | Career Resume (CPI) |
| Team point differential | 2001-02 | 2025-26 | Team-season ESPN boards | yes | Team-season board |
| Team TS% | 2001-02 | 2025-26 | Team-season boards | yes | Team-season board |
| Team eFG% | 2001-02 | 2025-26 | Team-season boards | yes | Team-season board |

## Notes
- **PPG:** Totals ÷ GP. Available wherever season counting stats exist.
- **RPG:** Totals ÷ GP.
- **APG:** Totals ÷ GP.
- **TS%:** Computed from counting stats — not a separate historical feed.
- **eFG%:** Computed from counting stats.
- **FG%:** Direct shooting percentage fields.
- **3P%:** Reliable when attempts exist; low-volume seasons still report the rate.
- **FT%:** Direct free-throw percentage.
- **USG%:** ESPN career transform currently stamps usagePct=0. Prefer season board rows; refuse when missing rather than inventing.
- **DARKO DPM:** Season-keyed overlay. Wrong-season asks must return unavailable — never stamp current DARKO onto other years.
- **RAPTOR:** Season-keyed through 2021-22 only. Missing seasons stay missing — no BPM/LEBRON substitute.
- **CPI:** Documented composite from counting rates — not an impact metric.
- **Team point differential:** Team averages from ESPN by-team totals.
- **Team TS%:** Derived team efficiency.
- **Team eFG%:** Derived team shooting.

## Historical coverage gaps (not ASK-executable yet)

| Metric | Earliest | Latest | Coverage | Reliable? |
| --- | --- | --- | --- | --- |
| ORtg (player) | n/a | 2025-26 | ESPN approx from counting; definitions vary | no |
| DRtg (player) | n/a | 2025-26 | Often 0 on ESPN career/board transforms | no |
| Net rating (player) | n/a | 2025-26 | Depends on ORtg/DRtg quality | no |
- **ORtg (player):** Not exposed in ASK DRBL yet — ESPN-derived individual ORtg is approximate and not methodology-frozen.
- **DRtg (player):** Not exposed — defensive rating is frequently missing; refusing is safer than answering.
- **Net rating (player):** Blocked until ORtg/DRtg are season-true and documented.

## PBP (play-by-play)

**Status (2026-08-16):** attach boundary ready; **no event corpus attached**; capability **false**.

| Dimension | Supported in ASK? | Notes |
| --- | --- | --- |
| Period / clock / zone / possession | **No** | Validator / unsupported unchanged |
| Corpus attach (`PBP_DATA_PATH`) | Config only | `getPbpCorpusStatus()` — does not unlock executors |
| `college_three` | **No** | AST enum only |

See `docs/historical-pbp-audit.md`, `npm run report:pbp-coverage`, `npm run test:pbp-capability`.

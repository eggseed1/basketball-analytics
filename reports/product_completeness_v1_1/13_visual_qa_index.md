# 13 — Visual QA index (P17.1)

Captured via Playwright against localhost:3000 after Next restart.

| File | Viewport | Demonstrates | Inspection |
|---|---|---|---|
| home-desktop.png | 1440x1000 | DRBL-first board takeaways | PASS — DRBL card leads; DARKO labeled external |
| home-mobile.png | 390x844 | Home mobile | PASS |
| explore-players-2025-26-desktop.png | desktop | Explore DRBL | PASS |
| explore-players-mobile.png | mobile | Explore mobile | PASS |
| explore-players-2019-20-unsupported.png | desktop | Unsupported season | PASS — DRBL unavailable notice |
| player-jabari-desktop.png | desktop | NBA-id DRBL Snapshot | PASS — DRBL/100 primary |
| player-jabari-mobile.png | mobile | Player mobile | PASS |
| player-espn-jokic.png | desktop | ESPN-id join via approved alias | PASS — DRBL Snapshot populated |
| player-season-compare.png | desktop | Season compare DRBL | PASS (text DRBL present) |
| player-season-rank.png | desktop | Season rank DRBL | PASS |
| compare-populated-desktop.png | desktop | Compare RATE/ABILITY + REALIZED | PASS — DRBL/100, O/D, R1 |
| compare-desktop.png | desktop | Empty compare shell | OK empty state |
| ask-drbl100-desktop.png | desktop | ASK methodology DRBL/100 | PASS — grounded vocabulary |
| ask-desktop.png | desktop | ASK landing | PARTIAL — examples still box-led |
| explore-teams-desktop.png | desktop | Team boards / identity | PASS |
| team-identity-grid-explore.png | desktop | 30-team explore surface | PASS |
| team-okc-desktop.png / mobile | both | Team destination | PASS |
| history-2023-24.png | desktop | Time Machine | PARTIAL — games first; DRBL leaders may be below fold |
| history-2023-24-drbl-leaders.png | desktop | History DRBL leaders (full page) | PASS — DRBL/100 + era DRBL copy present |
| learn-drbl-* | desktop/mobile | Learn | PASS |

## Verdict
- DESKTOP_VISUAL_QA: PASS
- MOBILE_VISUAL_QA: PASS
- TEAM_IDENTITY_GRID_QA: PASS (via explore teams full-page)
- HISTORICAL_IDENTITY_GRID_QA: PASS_WITH_DEBT (text/palette; logos empty)
- Noted debt: ASK example chips still box-score heavy; Compare empty vs populated; ordinal grammar '62th' on player page; headshot placeholders on compare

Screenshot count: 27

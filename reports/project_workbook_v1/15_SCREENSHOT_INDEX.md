# 15 — Screenshot index

Captured from integrated site at `http://localhost:3000` on 2026-08-17 without CSS changes.

| File | Route | Viewport | Demonstrates | Semantic UI visible |
|---|---|---|---|---|
| home-desktop.png | `/` | ~desktop | Home composition, nav, live ESPN data banner | Upcoming games, board takeaways, standings |
| explore-players-desktop-2025-26.png | `/explore/players` | desktop | Current-season Explore / leaderboard | DRBL registry seasons notice; DRBL/100 sort |
| explore-players-desktop-2024-25.png | `/explore/players?season=2024-25` | desktop | Prior production season board | Live ESPN + DRBL season |
| explore-players-desktop-2023-24-historical.png | `/explore/players?season=2023-24` | desktop | Tier-B historical board | Historical data-quality notice (M17a.2) |
| explore-players-desktop-2020-21.png | `/explore/players?season=2020-21` | desktop | Earliest Tier-B historical board | Tier-B notice; k=1600/P1 same as prod |
| explore-players-desktop-2019-20-unsupported.png | `/explore/players?season=2019-20` | desktop | Unsupported historical state | DRBL unavailable notice; box scores only |
| explore-players-mobile-2025-26.png | `/explore/players` | 390x844 | Mobile Explore / nav collapse | More menu; DRBL/100 sort |
| explore-teams-desktop.png | `/explore/teams` | desktop | Team boards | Team efficiency board |
| player-jabari-smith-jr-desktop.png | `/players/1631095` | desktop | Player destination islands | DARKO primary on live page; ASK DRBL links |
| player-jabari-smith-jr-mobile.png | `/players/1631095` | 390x844 | Mobile player page | Progressive player IA |
| learn-drbl-desktop.png | `/learn/drbl` | desktop (fullPage) | Methodology / Learn DRBL | Ability vs R1 Points vs R1 WinEq; limitations |
| ask-drbl-desktop.png | `/ask` | desktop | ASK DRBL surface | Natural language / builder; not a chatbot |

Notes:
- Live player destination may emphasize DARKO while DRBL overlay depends on ESPN↔NBA identity join (documented product debt).
- Screenshots are representative evidence, not proof of model correctness.

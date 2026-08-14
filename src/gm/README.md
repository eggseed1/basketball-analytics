# Franchise Lab (GM)

In-depth basketball front-office simulation living at `/gm`.

**Original sim** - inspired by the Basketball GM *genre*, not a fork of
[ZenGM](https://github.com/zengm-games/zengm) (their source is not open for
redistribution / public hosting).

## Deep MyLeague (Layer B)

Architecture + season flow:

- [`docs/myleague-architecture.md`](../../docs/myleague-architecture.md)
- [`docs/myleague-season-flow.md`](../../docs/myleague-season-flow.md)

**Milestone 2 (scaffolding):** Reality / Simulation universes, phase bridge,
controller gates, and IndexedDB save `franchise-lab-myleague`, wired beside
Franchise Lab (`franchise-lab-gm`). Status card on `/gm`.

**Not started yet:** Parallel possession simulator (intentionally out of scope  - 
Layer A only). Draft/awards/transaction feeds still stubbed on the provider.

## Features (current vertical slice)

- **Real NBA seed** - ESPN season stats + DARKO/LEBRON impact → `/gm` rosters
- **Real salaries + year caps** - historical salary CSV + official cap/tax/apron table by season
- **Real schedules** - official NBA tips (BallDontLie) with MyLeague-style calendar UI
- 30-team league, standings, playoffs, lottery, draft
- Cap sheet (cap / tax / aprons), roster limits, Bird rights fields
- Depth chart + possession sim → traditional/advanced box scores
- Trade machine with salary matching + AI valuation
- Free agency signing, waives
- Scouting fog, staff upgrades, injuries + medical report
- Aging / development between seasons
- Saves in IndexedDB (`franchise-lab-gm` + `franchise-lab-myleague`)

## Play

1. Open [http://localhost:3000/gm](http://localhost:3000/gm)
2. Pick a season + franchise (loads real players)
3. Set lineup → **Simulate my next game** → open box score

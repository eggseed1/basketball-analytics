# Team Intelligence V2

Canonical surface: `/teams/[teamId]?season=YYYY-YY`

## Product story

Who are they → How good → How they win → What’s changing → Who drives it → Which games → Roster movement → Ask DRBL.

Not a clone of Player Intelligence. Teams are roster + board + movement; players are career + evolution.

## Sections

| Anchor | Purpose |
| --- | --- |
| `#overview` | Identity, season chips, record/snapshot, coverage |
| `#performance` | Level-2 trait context from `analyzeTeamProfile` |
| `#identity` | How they win + statistical identity + vs-prior deltas |
| `#arc` | Multi-year board history (Team Arc) |
| `#roster` | Compact rotation / scorers / value (when DARKO present) |
| `#assets` | Cap / inventory (structured ledger still blocked) |
| `#games` | Recent / upcoming / notable → Game Lab |
| `#evidence` | Season Evidence glimpse → Game Lab |
| `#transactions` | Current offseason ESPN archive (not historical season) |
| `#ask` | Prefills only supported ASK DRBL team queries |

Sticky in-page nav: `TeamPageNav` (same pattern as `PlayerPageNav`).

## Primitives

- Analytics: `analyzeTeamProfile` (unchanged methodology)
- Assembly: `src/lib/team-explorer.ts`
- Arc: `buildTeamArcModel` / `getTeamSeasonArc`
- Evidence: `getTeamSeasonEvidence` (abbr-first identity)
- Transactions: `listTransactionEvents` bounded page
- Identity: canonical ESPN team id at URL/filter boundaries

## Coverage levels

`assessTeamCoverage` → `full` | `partial` | `minimal`. Missing metrics are never treated as zeroes. PBP / lineups / DRBL remain future layers.

## Season vs offseason

Selected `season` drives team board, roster, games, and evidence. Transaction strip always uses the **current** offseason window — it does not pretend a historical profile year is the live offseason.

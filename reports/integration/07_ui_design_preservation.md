# UI design preservation

## Web redesign intent (origin/drbl-ia-and-ask)

Preserved:

- ASK DRBL surfaces and site nav IA
- Progressive destination shells (player/team)
- Explore players client shell + board health banners
- Time Machine / era theme routes
- Sports-card visual language on explore boards
- Soft-fail scoreboard / catalog resilience patterns

## Analytics semantic wiring into redesign

- `DrblSeasonSupportNotice` + registry copy on Explore Players
- DRBL/100, R1 Points, R1 Win Equivalents columns + sort keys
- Season registry remains single source (no hardcoded DRBL season arrays as authority)

## Intentional tradeoffs

- Analytics-era Savant-heavy player page composition partially superseded by web progressive destination islands; DRBL values remain available via overlay + glossary/learn routes
- `player-usage-ts-scatter` retained from analytics alongside web chart stack

## Verdict

`WEB_DESIGN_INTENT_PRESERVED` = **YES** (primary IA/redesign surfaces present; metric copy updated to sealed analytics semantics)

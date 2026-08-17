# 01 — Team namespace contract (P17.2)

## Canonical product key
ESPN team id string (`CanonicalTeamId`), same as `TeamBrand.espnTeamId`.

## Namespaces

| Namespace | Example | Source | Stored | Normalized | Allowed in UI | Forbidden in UI |
|---|---|---|---|---|---|---|
| ESPN / canonical | `25` (OKC) | ESPN site API / brand map | `PlayerSeason.teamId`, routes | n/a (already canonical) | logo, abbr, links | — |
| NBA Stats | `1610612760` | `NBA_TEAM_META` / stats.nba.com | `providerTeamId` / `nbaTeamId` | `getCanonicalTeamFromProvider("nba", id)` at transform | debug/provenance only | TM cell label, badge text |
| BDL | `21` (OKC) | BallDontLie | schedule `homeProviderTeamId` | `getCanonicalTeamFromProvider("bdl", id)` | never as bare route id | bare numeric in `?team=` without `bdl:` |
| Abbr | `OKC` | brand / meta | filters | `resolveCanonicalTeam` | yes | — |
| Brand slug | `okc` | `TEAM_BRANDS` | lore | `resolveCanonicalTeam` | yes | — |
| Multi-team | `TOT` | NBA Stats aggregate | `teamId=TOT` | explicit TOT/Multiple policy | text mark only | invented franchise logo |

## Format inference
Bare `16106127xx` (10 digits) is format-inferred as **nba** only — never espn/bdl.
Bare short numerics remain ESPN/canonical (existing product convention). Namespaced keys `nba:`, `espn:`, `bdl:` always win.

## providerIds
All 30 franchises now expose `providerIds.espn`, `providerIds.bdl`, and `providerIds.nba`.

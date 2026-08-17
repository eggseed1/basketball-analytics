# Team identity and branding

## Canonical rule

**Canonical team id = ESPN numeric team id** (`CanonicalTeamId`).  
Provider bare numerics are namespaced: ESPN `25` (OKC) ≠ BDL `25` (POR).

## Dual product systems

| Route family | Key | Data |
|---|---|---|
| `/teams/[teamId]` | ESPN id | Season boards, roster, brands |
| `/franchises/[slug]` | Franchise lore id | Static narrative — not season metrics |

## Completeness split (P17.1 seal)

| Layer | Status |
|---|---|
| Modern team identity (30/30) | **YES** — logos, colors, names, routes |
| Historical text identity | **YES** — era names / marks |
| Historical palette identity | **YES** |
| Historical logo identity | **NO** — verified logo assets **intentionally empty** |

Source: `supporting_reports/product_completeness_v1_1/14_team_identity_final.csv`, `15_historical_identity_final.csv`, `24_product_health.json`.

## Modern brand

- `TEAM_BRANDS` / `resolveTeamBrand` in `src/lib/nba-brand.ts` (+ helpers in `team-identity.ts`, `game-team-identity.ts`)
- Completeness: **30/30** modern teams on explore/team routes

## Historical brand

- Resolver: `resolveHistoricalTeamBrand` (`src/lib/historical-team-brand.ts`)
- Path: verified logo → text mark → safe current logo → neutral mark
- Relocated/renamed eras that would misuse modern logos are blocked (Sonics, Bobcats, Bullets, …)
- **Do not scrape** logos to clear `HISTORICAL_LOGO_IDENTITY_COMPLETE`

## Snapshot sources

See `critical_source_snapshot/src/lib/{team-identity,game-team-identity,nba-brand,historical-team-brand}.ts`.

## Visual QA

`screenshots/team-identity-grid-explore.png`, `team-okc-desktop.png`, `team-okc-mobile.png`.

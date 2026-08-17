# 03 — Team identity forensics

**Source:** `src/data/identity/team-map.ts`, `src/data/identity/team-era.ts`, `src/lib/historical-team-brand.ts`, `04_team_id_namespace_matrix.csv`, `05_team_identity_completeness.csv`

## Canonical key

- **Canonical DRBL / product team id = ESPN numeric team id** (`CanonicalTeamId`), same space as `TeamBrand.espnTeamId` and ASK team entities.
- Documented rule in `team-map.ts`: provider numerics are namespaced — **ESPN `25` ≠ BDL `25`**. Bare BDL ids must not leak into `/teams/[teamId]` routes.

## Namespaces in play

| Namespace | Example | Role |
|---|---|---|
| ESPN / canonical | `25` (OKC) | Routes, brand, ASK, modern logos |
| BDL | `21` (OKC) | Schedule/provider only; collide with ESPN bare ids |
| NBA Stats | `1610612760` | Logo CDN / meta — **not** in `CanonicalTeam.providerIds` |
| Brand id | `okc` | `TEAM_BRANDS` |
| Franchise slug | `/franchises/okc` | Static lore (`FRANCHISE_HISTORIES`) — separate from `/teams` |
| Historical abbr | `SEA` | Era path via `resolveHistoricalTeamBrand` / `HISTORICAL_ABBR_ALIASES` |

## Modern vs historical brand

- **Modern surfaces** resolve through `resolveCanonicalTeam` / `TEAM_BRANDS` (current display name, abbr, CDN logo).
- **Historical surfaces** (Time Machine, era-aware games, historical theme) use `TEAM_ERAS_BY_CANONICAL_ID` + `resolveHistoricalTeamBrand`: season → era identity → verified historical logo → historical text mark → current logo only when historically safe → neutral text mark.
- Eras that **block** current CDN logos include SuperSonics, Bobcats, Bullets, NJ Nets, San Diego Clippers/Rockets, KC Kings, Cincinnati Royals, Buffalo Braves, NO Jazz, Vancouver Grizzlies, CHH, etc. (`blocksCurrentLogo` in `historical-team-brand.ts`).

## Dual systems (intentional)

1. **`/teams/[espnId]`** — live/season team destination keyed by canonical ESPN id (30 modern franchises).
2. **`/franchises/[slug]`** — static franchise lore; not the season board and not conflated with team-season metrics.

Both can show the “same” franchise story, but ids and data providers differ.

## 30 / 30 modern completeness

`05_team_identity_completeness.csv` lists all **30** current NBA teams with abbr, full name, logo, colors, conference/division, ESPN id, NBA id, `/teams/{espnId}` route, and Y flags for team page / explore / standings / game cards / player association / search.

## Historical logos empty

```ts
export const HISTORICAL_TEAM_LOGO_ASSETS: Readonly<Record<string, { path: string; label: string }>> = {
  // Intentionally empty until real assets are committed — do not scrape.
};
```

Consequence: historical eras without a safe current-logo reuse fall back to **text marks / monograms**, not era logo images. This is **INTENTIONALLY_NOT_SUPPORTED** until licensed assets land under `/logos/historical/`.

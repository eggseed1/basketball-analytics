# Advanced stats source audit (diagnostic)

Canonical modules:

- Types: `src/data/types/advanced-season-stats.ts`
- Providers: `src/data/providers/advanced-stats/`
- Query: `src/data/queries/advanced-stats-audit.ts`
- Report: `npm run report:advanced-stats-coverage`
- Tests: `npm run test:advanced-stats-audit`
- Identity fixture: `data/impact/bdl-player-identity-fixture.json`

## Scope

Investigate season-true **ORtg / DRtg / NET** (and related advanced rates) that ESPN does not publish reliably.

This layer is **diagnostic only**. It does **not**:

- hydrate `PlayerSeason`
- change Career Resume / Season Compare / Copeland
- add Explore / ASK columns
- merge into `HistoricalPlayerImpact` (DARKO/RAPTOR family)

## Data-truth rules

- `MISSING ≠ ZERO`
- `SOURCE EXISTS ≠ SOURCE IS TRUSTWORTHY`
- `FIELD NAME ≠ VERIFIED SEMANTICS`
- `GAME RATING ≠ PLAYER SEASON RATING`
- `NAME MATCH ≠ IDENTITY MATCH`
- User-facing exposure requires: source → identity → season → provenance → coverage → validation

## Season averages advanced probe

Read-only client: `BallDontLieClient.getSeasonAverages` → `/nba/v1/season_averages/general?type=advanced`

Probe: `probeSeasonAveragesAdvanced` (recent + historical seasons, bounded page size).

Access statuses are explicit:

- `unauthorized` (HTTP 401) — **not** an empty dataset
- `endpoint_unavailable`
- `malformed_response`
- `valid_response`
- `valid_response_zero_rows`

## Semantics

See `semantics.ts` table. Season-averages advanced **stats keys are not glossary-documented**. Game-advanced on-court rating definitions must **not** be transplanted. Rating admission requires `ratingSemantics === "compatible"`.

## Identity

BDL `NBAPlayer` OpenAPI fields include only BDL numeric `id` (+ bio). No ESPN / NBA person id on the payload. Diagnostic fixture maps a few BDL→ESPN ids; full-league join remains blocked.

## Production gates

| Gate | Meaning |
| --- | --- |
| `accessBlocked` | GOAT/advanced endpoint unauthorized or missing key |
| `schemaUnknown` | Response schema not yet observed |
| `semanticsUnverified` | Fields exist / claimed but meaning not confirmed |
| `semanticsIncompatible` | Documented meaning does not match product metric |
| `identityBlocked` | Stable player mapping unavailable for production joins |
| `insufficientCoverage` | Too little season/player coverage or quality |
| `productionReady` | All required gates passed |

`productionReady: YES` only when gate is `productionReady`. Returning data alone is not enough.

## Current verdict

See `npm run report:advanced-stats-coverage`.

Expected while the configured key lacks GOAT: **`productionReady: NO`**, gate **`accessBlocked`**.

# 07 — Player identity forensics

**Source:** `src/data/identity/player-identity.ts`, `data/impact/player-id-aliases.json`, `scripts/build-player-id-crosswalk.ts`, `src/data/queries/players.ts`, `src/lib/player-destination.ts`, `src/components/players/player-core-island.tsx`, `08_player_identity_crosswalk.csv`

## Dual id problem

- Explore / ESPN boards and `/players/[playerId]` routes commonly use **ESPN athlete ids**.
- Precomputed DRBL rows key on **NBA Stats `PLAYER_ID`**.
- Without a join, DRBL overlays miss on ESPN-routed pages even when the season file has the player.

## ESPN ↔ NBA join

Runtime resolver (`resolvePlayerIdentity` / `resolveNbaIdForDrbl`):

1. Load optional aliases from `data/impact/player-id-aliases.json` (memoized).
2. ESPN id → NBA id via `byEspn`.
3. NBA id → ESPN id via `byNba`.
4. Else: ESPN-looking ids stay unresolved on the NBA side; other ids passthrough as NBA candidates without inventing ESPN.

**Policy:** never invent mappings at runtime; never accept ambiguous name matches at request time.

## Empty → 676 aliases

| Checkpoint | Alias count |
|---|---|
| `HEAD` (`64cc231`) `player-id-aliases.json` | **0** (`{ "aliases": [] }`) |
| Working tree after `build:player-id-crosswalk` | **676** |

Every alias row carries:

- `matchMethod`: `unique_name_espn_board_drbl`
- `confidence`: **`HIGH_CONFIDENCE_UNIQUE_NAME`**

This confidence is **name-uniqueness only** (normalized name unique in ESPN board ∩ DRBL corpus). It is **not** multi-field exact id evidence. Ambiguous names are excluded from the alias file.

## Crosswalk artifact (`08_…`)

Built for seasons `2024-25` and `2025-26`:

| Metric | Value |
|---|---|
| Rows | 1144 |
| `ALIAS` | 1124 |
| `UNMATCHED_ESPN` | 14 |
| `UNMATCHED_NBA` | 6 |
| Confidence on aliases | `HIGH_CONFIDENCE_UNIQUE_NAME` (all) |

## Overlay path

`overlayDrblRows` in `players.ts` joins DRBL precomputed rows by:

1. Direct `row.playerId` match, else
2. Alias ESPN→NBA lookup into the DRBL map.

Career enrichment uses the same dual-id awareness when resolving player seasons.

## DARKO-first → DRBL-first (product hierarchy)

Fixed where DRBL is applicable:

- **Player destination headline / snapshot:** `player-core-island` prefers `drbl100` over DARKO for the analytical headline and adds a **DRBL Snapshot** card.
- **Team roster “highest value”:** `buildRosterBuckets` prefers valid DRBL estimates; falls back to DARKO only when no valid DRBL rows exist.

Still DARKO-led (gaps):

- **Home** impact rail (`home.ts` / `ImpactLeaders`) — DARKO-first by design today.
- **Compare** surfaces — no DRBL fields wired.
- **ASK** query engine — no `drbl100` / R1 fields in engine results.

## Merge gap fix

`mergePlayerSeasonStats` previously merged USG / DARKO / LEBRON but did not promote peer/career DRBL onto season rows missing a valid estimate.

**After fix:**

- Ability fields (`drbl100`, components, etc.) prefer a source with `hasValidDrblEstimate`.
- R1 Points / R1 Win Equivalents use `pickR1Number` — **never invent zeros**.
- Player core island resolves peer rows by ESPN id **or** aliased NBA id.

## Honesty

- Do **not** claim 100% live ESPN-board → DRBL join; live board coverage was not re-measured end-to-end in this seal.
- Static alias coverage vs precomputed: see `09_player_drbl_join_coverage.csv`.
- One precomputed `2025-26` NBA id lacks an alias file entry: `1642935` (Chucky Hepburn).

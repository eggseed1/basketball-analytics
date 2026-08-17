# Approach-B stream inventory

## Attribution

- Function: `attributeGamePlayerValue`
- File: `drbl/models/player-value.ts`
- Per-possession sequential credits: `attributePossessionSequential` (`drbl/models/sequential-attribution.ts`)
- Season loop: `computeSeasonDrbl` in `drbl/models/compute-season.ts`

## Atomic unit

One combined possession appearance = one on-court player on offense OR defense for one possession.

## Fields (after M16l0.1 observability)

| Field | Available |
|-------|-----------|
| playerId | YES |
| gameId | YES |
| gameDate | YES |
| teamId | YES (`possession.offenseTeamId` / `defenseTeamId`) |
| opponentTeamId | YES |
| appearanceExposure | YES (=1) |
| attributed value | YES (stable sequential share vs R1) |

## Season accumulation (historical)

Keyed by `playerId` only via `ensurePlayer`; `teamId` metadata was first-seen only — insufficient for stints. M16l0.1 builds stints from the appearance stream instead.

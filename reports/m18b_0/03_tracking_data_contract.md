# Tracking data contract — target schema

Version: `drbl-tracking-normalized-v1` (design only; implement when T0/T1 acquired)

## Required fields

```text
season
gameId
period
gameClock
frameTimestamp

playerId
teamId
x
y

ballX
ballY

homeAway
```

After alignment (derived, not raw):

```text
possessionId
offensePlayerIds[5]
defensePlayerIds[5]
```

## Preferred

```text
ballZ
shotClock
velocityX velocityY
acceleration
orientation
defensiveMatchupId
sourceEventId
```

## Coordinate convention (freeze before features)

- Units: **feet**
- Court: 94 × 50
- Baskets at (±41.75, 0) in half-court transforms as documented per adapter
- Canonical orientation: **offense always attacks +X** after period/side flip normalization
- Origin: mid-court (0,0) or basket-relative — adapter must declare one and convert
- Period flips / side changes must be applied before feature generation

## PBP ↔ tracking alignment architecture (design)

```text
tracking frame
        ↓
game / period / clock
        ↓
normalized PBP (canonical; never mutated)
        ↓
possession
        ↓
lineup state (DRBL reconstruction)
        ↓
Approach-B attribution (read-only)
        ↓
sealed UIR-C join (player-season)
```

### Clock synchronization

- Estimate per-game constant offset from shared events (makes/misses/TOs/rebounds/fouls)
- Report median / P95 / max offset; reject games with unstable offsets
- No manual per-player alignment
- Period boundaries audited separately (clock resets)

### Possession coverage classes

```text
FULL_TRACKING | PARTIAL_TRACKING | NO_TRACKING | CLOCK_AMBIGUOUS
```

### Lineup agreement

Compare tracking-observed 10 players vs DRBL lineup; report 10/10, 9/10, … — do **not** silently replace canonical DRBL lineups.

### Candidate quality gates (freeze before player results)

```text
>=99% game linkage
>=99% player ID resolution
>=98% possession alignment
>=95% full-frame coverage (among linked possessions)
```

Final thresholds may be tightened from source characteristics; never lowered because star results look good.

### Missing-frame policy

- Small interpolatable gaps: duration cap frozen before features (candidate ≤ 0.2 s)
- Larger gaps → PARTIAL or unusable possession
- Do not interpolate large gaps into fake continuous trajectories

### Physics sanity (versioned cleaner)

Flag teleports, impossible speeds, out-of-court coords, frozen zero-length paths, impossible ball locations — without over-filtering genuine sprint speeds.

## Non-goals

- Do not treat shot x/y as satisfying this contract
- Do not implement adapters for hypothetical unknown schemas

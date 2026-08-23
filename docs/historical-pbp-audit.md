# Historical PBP — attach boundary + product pipeline

**As of:** 2026-08-22  
**Per-game raw PBP:** **available on-demand** (CDN / stats.nba.com)  
**Per-game possessions:** **`getGamePossessions(gameId)`** with validation  
**Bulk corpus (`PBP_DATA_PATH`):** optional for batch — not required for Game Lab

---

## Planes

| Plane | Access | Product entry |
| --- | --- | --- |
| **On-demand raw PBP** | `fetchRawPlayByPlay` → `getGamePlayByPlay` | Game Lab flow, PBP panel |
| **Normalized events + possessions** | `getGamePossessions` | Server queries, future explorer |
| **Bulk historical corpus** | `PBP_DATA_PATH` / `data/pbp/` | Batch ASK, season indexes (optional) |

---

## Capability model (truthful)

`GamePbpCapability` separates:

- `rawPbpAvailable` — events fetched successfully
- `scoreTimelineAvailable` — validated score timeline (Game Lab)
- `possessionsDerived` — possession pipeline succeeded with no fatal validation errors
- `lineupsDerived` — lineup snapshots reconstructed (not yet product-wired)

`getPbpCapability()` remains the **bulk corpus / batch** gate (`gamesIndexed`, etc.) and does **not** reflect per-game CDN fetch.

Game Lab coverage uses `coverage.pbp` (not `possessionsDerived` alone). Deprecated: `coverage.pbpAvailable` → `coverage.pbp.rawPbpAvailable`.

---

## Product possession query

```ts
import { getGamePossessions } from "@/data/queries/game-possessions";

const result = await getGamePossessions(gameId);
// result.status === "available" | "unavailable"
```

Unavailable results are discriminated — never empty success arrays.

---

## Validation

`PossessionValidationReport` includes score conservation, ordering, FT sequences, OT periods, and fatal vs warning separation. Fatal errors → `status: "unavailable"`.

---

## Tests

```bash
npm run test:pbp-product      # recorded fixtures, no live network
npm run test:pbp-capability   # bulk attach boundary
```

Fixtures: `scripts/fixtures/pbp/games/{gameId}/playbyplay.json` (+ `boxscore.json`).

---

## Bulk corpus (unchanged attach boundary)

See prior sections for `PBP_DATA_PATH`, manifest format, and `getPbpCorpusStatus()`. Attaching a bulk corpus does **not** replace on-demand per-game fetch.

---

## Stop condition (this milestone)

Per-game possession pipeline shipped and tested. **Do not** build possession explorer UI until validation coverage is reviewed on additional game samples.

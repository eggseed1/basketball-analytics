import assert from "node:assert/strict";
import { gmPlayerPortraitIds } from "../src/gm/lib/player-portrait-ids";
import type { GmPlayer } from "../src/gm/types";

const player = (fields: Partial<GmPlayer>) =>
  ({ id: "rookie-2028-1", name: "Future Prospect", teamId: "bos", ...fields } as GmPlayer);

assert.deepEqual(
  gmPlayerPortraitIds(player({ id: "2544" })),
  { playerId: undefined, nbaId: undefined },
  "A generated id that collides with a real NBA player must never fetch that face"
);
assert.deepEqual(
  gmPlayerPortraitIds(player({ id: "rookie-7", nbaPlayerId: " 203999 " })),
  { playerId: "203999", nbaId: "203999" },
  "Real NBA players use the verified NBA crosswalk"
);
assert.deepEqual(
  gmPlayerPortraitIds(player({ id: "4065648", nbaSeason: { season: "2026-27" } as GmPlayer["nbaSeason"] })),
  { playerId: "4065648", nbaId: undefined },
  "Legacy real-player saves use only their verified ESPN entry id"
);
assert.deepEqual(
  gmPlayerPortraitIds(player({ id: "4065648" })),
  { playerId: undefined, nbaId: undefined },
  "Numeric ids alone are never sufficient evidence"
);
assert.deepEqual(
  gmPlayerPortraitIds(player({ id: "rookie-7", nbaPlayerId: "" })),
  { playerId: undefined, nbaId: undefined },
  "Empty ids fall back to branded initials"
);
console.log("GM portrait identity: real vs generated players, legacy saves, missing IDs passed.");

/**
 * Board-readiness helpers for tip-off / early-season Explore defaults.
 */
import assert from "node:assert/strict";

import {
  BUNDLED_PEER_BOARD_FULL_MIN,
  defaultExploreConcretePlayersSeason,
  defaultExplorePlayersSeason,
  isBundledPeerBoardReady,
  priorSeasonBoardCatchUpNotice,
} from "../src/lib/player-board-season";

const tipOpened = new Date("2026-10-21T16:00:00.000Z");
const preTip = new Date("2026-10-10T16:00:00.000Z");

assert.equal(isBundledPeerBoardReady("2025-26", BUNDLED_PEER_BOARD_FULL_MIN, tipOpened), true);
assert.equal(isBundledPeerBoardReady("2025-26", 50, tipOpened), false);
assert.equal(isBundledPeerBoardReady("2026-27", 50, tipOpened), true);
assert.equal(isBundledPeerBoardReady("2026-27", 0, tipOpened), false);
assert.equal(isBundledPeerBoardReady("2026-27", 50, preTip), false);

assert.equal(defaultExplorePlayersSeason(), "ALL");

const seasons = ["2026-27", "2025-26", "2024-25"];
assert.equal(
  defaultExploreConcretePlayersSeason(seasons, tipOpened, {
    boardReadySeasons: ["2025-26"],
  }),
  "2025-26"
);
assert.equal(
  defaultExploreConcretePlayersSeason(seasons, tipOpened, {
    boardReadySeasons: ["2026-27", "2025-26"],
  }),
  "2026-27"
);
assert.equal(defaultExploreConcretePlayersSeason(seasons, preTip), "2025-26");
assert.match(
  priorSeasonBoardCatchUpNotice("2027-28", "2026-27"),
  /2027-28 board is still catching up/
);

console.log("test-player-board-season: ok");

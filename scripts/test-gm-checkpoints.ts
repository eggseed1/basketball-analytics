/**
 * Team-building calendar pauses: deadline, continue closes market, snooze re-prompts.
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import {
  considerTeamBuildingCheckpoint,
  continuePastCheckpoint,
  isTeamBuildingPaused,
  pauseForTeamBuilding,
  restoreSnoozedCheckpoint,
} from "../src/gm/engine/checkpoints";
import { noteTradeDeadline } from "../src/gm/engine/offseason";
import { tradeDeadlineDay } from "../src/gm/engine/schedule";

function main() {
  let league = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 42 });
  const deadline = tradeDeadlineDay(league.schedule);
  assert.ok(deadline > 2, "deadline day exists");

  // Before the eve: no pause.
  league = { ...league, day: deadline - 2 };
  league = considerTeamBuildingCheckpoint(league);
  assert.equal(league.teamBuildingCheckpoint, undefined);

  // Eve: pause.
  league = { ...league, day: deadline - 1 };
  league = considerTeamBuildingCheckpoint(league);
  assert.ok(league.teamBuildingCheckpoint);
  assert.equal(league.teamBuildingCheckpoint?.kind, "trade_deadline");
  assert.ok(isTeamBuildingPaused(league));

  // noteTradeDeadline must not close while the banner is up.
  const stillOpen = noteTradeDeadline({ ...league, day: deadline });
  assert.equal(stillOpen.tradeDeadlinePassed, undefined);

  // Stay and manage: banner clears, market still open.
  league = pauseForTeamBuilding(league);
  assert.equal(league.teamBuildingCheckpoint, undefined);
  assert.equal(league.checkpointSnooze, "trade_deadline");
  assert.equal(noteTradeDeadline({ ...league, day: deadline }).tradeDeadlinePassed, undefined);

  // Simming again re-opens the pause.
  league = restoreSnoozedCheckpoint({ ...league, day: deadline - 1 });
  assert.ok(league.teamBuildingCheckpoint);
  assert.equal(league.checkpointSnooze, undefined);

  // Continue on deadline day closes the market.
  league = continuePastCheckpoint({ ...league, day: deadline });
  assert.equal(league.teamBuildingCheckpoint, undefined);
  assert.ok(league.seenCheckpoints?.includes("trade_deadline"));
  assert.equal(league.tradeDeadlinePassed, true);

  // Free agency open.
  let fa = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 7 });
  fa = {
    ...fa,
    phase: "free_agency",
    faMarket: {
      stage: "moratorium",
      day: 0,
      agreements: [],
      pending: [],
      recap: [],
    },
  };
  fa = considerTeamBuildingCheckpoint(fa);
  assert.equal(fa.teamBuildingCheckpoint?.kind, "free_agency");

  console.log("test-gm-checkpoints: ok");
}

main();

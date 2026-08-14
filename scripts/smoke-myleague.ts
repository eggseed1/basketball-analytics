/**
 * Smoke-test MyLeague Milestone 2 scaffolding (no network).
 *
 *   npx tsx scripts/smoke-myleague.ts
 */
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import {
  createMyLeagueBundle,
  gateSimulate,
  mapGmPhaseToMyLeague,
  nextPlayablePhase,
  attachHistoricalSnapshot,
  createPlaceholderSnapshot,
  getHistoricalSnapshot,
} from "../src/gm/myleague";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const league = createGeneratedLeague({ userTeamId: "bos", season: 1969 });
const bundle = createMyLeagueBundle(league, {
  mode: "historical_replay",
  startEra: "1960s",
  startSeason: 1969,
});

assert(bundle.myLeague.version === 1, "MyLeague version");
assert(bundle.historical.label === "reality", "historical label");
assert(bundle.simulation.label === "simulation", "simulation label");
assert(
  bundle.simulation.parentHistoricalUniverseId === bundle.historical.id,
  "parent link"
);
assert(
  mapGmPhaseToMyLeague("regular") === "REGULAR_SEASON",
  "phase bridge"
);
assert(gateSimulate(bundle.simulation).ok, "sim gate open in regular");
assert(
  nextPlayablePhase("FINALS") === "SEASON_END" ||
    nextPlayablePhase("FINALS") === "DRAFT_LOTTERY",
  "playable next from finals"
);

const snap = getHistoricalSnapshot(bundle.historical, 1969);
assert(snap?.immutable === true, "snapshot immutable");
assert(snap?.players.length === 0, "placeholder empty until M3");

let hu = bundle.historical;
try {
  hu = attachHistoricalSnapshot(hu, createPlaceholderSnapshot(1969));
  throw new Error("should reject duplicate season");
} catch (e) {
  assert(
    e instanceof Error && e.message.includes("already has season"),
    "duplicate season guard"
  );
}

console.log("smoke-myleague: ok", {
  myLeagueId: bundle.myLeague.id,
  phase: bundle.simulation.phase,
  season: bundle.simulation.currentSeason,
  timelineEvents: Object.keys(bundle.timeline).length,
});

/** CPU training must be rational, save-stable and fair to user GMs. */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise } from "../src/gm/engine/franchise";
import { cpuDevelopmentFocus, developmentFocusSkill } from "../src/gm/engine/development-profile";
import { advanceDynamicProgression } from "../src/gm/engine/dynamic-progression";
import type { GmPlayer } from "../src/gm/types";

const league = prepareFranchise(createGeneratedLeague({
  userTeamId: "bos", season: 2027, seed: 3199,
}));
const anyPlayer = league.players.find(p => p.sheet && p.teamId && p.teamId !== "bos")!;
assert.ok(anyPlayer);
const cpu: GmPlayer = { ...anyPlayer, draftModel: 2, developmentFocus: "balanced", age: 20 };
const peers = league.players.filter(p => p.teamId === cpu.teamId && p.id !== cpu.id && p.sheet);
const rosterLeague = { ...league, players: league.players.map(p => p.id === cpu.id ? cpu : p) };

assert.equal(cpuDevelopmentFocus(cpu, rosterLeague), cpuDevelopmentFocus(cpu, rosterLeague),
  "CPU priorities must be deterministic");
assert.equal(developmentFocusSkill(cpu, rosterLeague), cpuDevelopmentFocus(cpu, rosterLeague));
const allowed = {
  PG: ["creation", "shooting", "finishing", "defense"],
  SG: ["shooting", "creation", "finishing", "defense"],
  SF: ["shooting", "defense", "creation", "finishing"],
  PF: ["defense", "rebounding", "finishing", "shooting"],
  C: ["defense", "rebounding", "finishing", "shooting"],
};
assert.ok(allowed[cpu.position].includes(cpuDevelopmentFocus(cpu, rosterLeague)));
const human = { ...cpu, teamId: "bos" };
assert.equal(developmentFocusSkill(human, rosterLeague),
  human.position === "C" || human.position === "PF" ? "defense"
    : human.position === "PG" ? "creation" : "shooting",
  "unselected human training retains its historical default");
assert.equal(developmentFocusSkill({ ...cpu, developmentFocus: "finishing" }, rosterLeague),
  "finishing", "explicit development choices must never be overwritten");
assert.equal(developmentFocusSkill({ ...cpu, draftModel: undefined }, rosterLeague),
  cpu.position === "C" || cpu.position === "PF" ? "defense"
    : cpu.position === "PG" ? "creation" : "shooting",
  "legacy development remains unchanged");

const attrs = cpu.sheet!.attributes;
const center: GmPlayer = {
  ...cpu, position: "C", developmentFocus: "balanced",
  sheet: { ...cpu.sheet!, attributes: { ...attrs,
    interiorDefense: 72, block: 72, defReb: 72, offReb: 70, strength: 70,
    closeShot: 65, standingDunk: 65, postControl: 65, threePoint: 52, midrange: 54, freeThrow: 55,
  } },
};
const weakDefensePeers = peers.map((p, i) => ({
  ...p, sheet: { ...p.sheet!, overall: 75 + (i % 3),
    attributes: { ...p.sheet!.attributes, interiorDefense: 45, block: 45, defReb: 45,
      offReb: 90, strength: 90, closeShot: 87, standingDunk: 87, postControl: 87, threePoint: 90, midrange: 90, freeThrow: 90 },
  },
}));
const defensiveLeague = { ...league, players: [
  ...league.players.filter(p => p.teamId !== center.teamId),
  center, ...weakDefensePeers,
] };
assert.equal(cpuDevelopmentFocus(center, defensiveLeague), "defense",
  "a club with weak interior defense should develop its natural rim protector");
const focusedLeague = { ...defensiveLeague, players: defensiveLeague.players.map(p =>
  p.id === center.id ? { ...center, developmentFocus: "defense" as const } : p) };
const selected = advanceDynamicProgression(center, {
  league: defensiveLeague, checkpoint: "summer", coach: 0.6, staff: 1.12,
});
const manual = advanceDynamicProgression({ ...center, developmentFocus: "defense" }, {
  league: focusedLeague, checkpoint: "summer", coach: 0.6, staff: 1.12,
});
assert.equal(selected.sheet?.overall, manual.sheet?.overall,
  "CPU training must use identical growth rules to the corresponding human focus");
assert.deepEqual(selected.sheet?.attributes, manual.sheet?.attributes,
  "CPU skill gains must match a manually selected equivalent");
assert.deepEqual(selected.ratings, manual.ratings,
  "CPU defensive impact cannot silently use the offensive default");
assert.equal(selected.developmentFocus, "balanced",
  "automatic CPU decisions should not overwrite persisted manual choices");

console.log("CPU development priorities: deterministic, positional, roster-aware, human parity and legacy preservation passed");

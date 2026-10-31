import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { simulateGame } from "../src/gm/engine/simulate";

async function main() {
const rows = (await getBundledBrefPeerBoard("2025-26")).filter(p => p.gamesPlayed >= 5 && p.minutes >= 40 && p.fieldGoalsAttempted > 0);
assert.ok(rows.length > 350, "the calibration requires the bundled real season, not generated players");
const league = buildLeagueFromPlayerSeasons(rows, { userTeamId: "bos", seasonCanonical: "2025-26", seed: 71 });
const real = { points: 0, min: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0, ast: 0, reb: 0, stl: 0, blk: 0, tov: 0 };
const sim = { ...real };
for (const p of rows) {
  real.points += p.points; real.min += p.minutes; real.fga += p.fieldGoalsAttempted; real.fgm += p.fieldGoalsMade;
  real.tpa += p.threePointersAttempted; real.tpm += p.threePointersMade; real.fta += p.freeThrowsAttempted; real.ftm += p.freeThrowsMade;
  real.ast += p.assists; real.reb += p.rebounds; real.stl += p.steals; real.blk += p.blocks; real.tov += p.turnovers;
}
const games = league.schedule.slice(0, 180);
for (const [i, game] of games.entries()) {
  const result = simulateGame(game, league.teams, league.players, 71_000 + i);
  for (const p of result.box.players) {
    sim.points += p.points; sim.min += p.minutes; sim.fga += p.fga; sim.fgm += p.fgm; sim.tpa += p.tpa; sim.tpm += p.tpm;
    sim.fta += p.fta; sim.ftm += p.ftm; sim.ast += p.assists; sim.reb += p.rebounds; sim.stl += p.steals; sim.blk += p.blocks; sim.tov += p.turnovers;
  }
}
mkdirSync("/tmp/franchise-calibration", { recursive: true });
writeFileSync("/tmp/franchise-calibration/report.json", JSON.stringify({ rows, real, sim, games: games.length }));
const failures: string[] = [];
const perGame = (n: number, minutes: number) => n / minutes * 240;
for (const key of ["points", "ast", "reb", "stl", "blk", "tov"] as const) {
  const expected = perGame(real[key], real.min), actual = perGame(sim[key], sim.min);
  console.log(`${key}: real ${expected.toFixed(2)}, sim ${actual.toFixed(2)}`);
  const tolerance = key === "points" ? 0.08 : key === "reb" ? 0.12 : 0.15;
  if (!(Math.abs(actual / expected - 1) < tolerance)) failures.push(`${key} outside the real-season calibration band`);
}
for (const [made, attempts, label, tolerance] of [["fgm", "fga", "FG%", 0.03], ["tpm", "tpa", "3P%", 0.025], ["ftm", "fta", "FT%", 0.025], ["tpa", "fga", "three-point attempt share", 0.05]] as const) {
  const expected = real[made] / real[attempts], actual = sim[made] / sim[attempts];
  console.log(`${label}: real ${expected.toFixed(3)}, sim ${actual.toFixed(3)}`);
  if (!(Math.abs(actual - expected) < tolerance)) failures.push(`${label} outside the real-season calibration band`);
}
assert.deepEqual(failures, [], "Real-season calibration must match every checked distribution");
console.log(`Real-season calibration passed across ${games.length} games.`);

}
main().catch(error => { console.error(error); process.exitCode = 1; });

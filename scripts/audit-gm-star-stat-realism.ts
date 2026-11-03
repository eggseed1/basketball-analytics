/**
 * MyNBA community regression diagnostic: the league can average 115+ points
 * while every superstar averages too few. Measure individual production.
 *
 * Static 2025-26 season-ending rosters; not an exact historical replay.
 * Do NOT use this as a hard win/points target until benchmark distributions
 * have been reviewed. The report includes per-player misses for calibration.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { simulateGame } from "../src/gm/engine/simulate";

const round = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);
async function main() {
  const data = (await getBundledBrefPeerBoard("2025-26"))
    .filter(p => p.gamesPlayed >= 5 && p.minutes >= 40 && p.fieldGoalsAttempted > 0);
  assert.ok(data.length > 350, "bundled 2025-26 NBA player baseline required");
  const league = buildLeagueFromPlayerSeasons(data, {
    userTeamId: "bos", seasonCanonical: "2025-26", seed: 87731,
  });
  const stars = league.players.filter(p => p.teamId && p.nbaSeason &&
    p.nbaSeason.gp >= 35 && p.nbaSeason.pts / p.nbaSeason.gp >= 24);
  assert.ok(stars.length >= 5, "need a meaningful real NBA star-scoring sample");

  const byId = new Map<string, { gp: number; pts: number; ast: number; fga: number; min: number }>();
  const games = league.schedule.filter((_, index) => index % 3 === 0);
  for (const [index, game] of games.entries()) {
    const { box } = simulateGame(game, league.teams, league.players, 8773100 + index, undefined, league.settings);
    for (const line of box.players) {
      if (line.minutes <= 0) continue;
      const count = byId.get(line.playerId) ?? { gp: 0, pts: 0, ast: 0, fga: 0, min: 0 };
      count.gp++;
      count.pts += line.points;
      count.ast += line.assists;
      count.fga += line.fga;
      count.min += line.minutes;
      byId.set(line.playerId, count);
    }
  }
  const rows = stars.map(player => {
    const real = player.nbaSeason!;
    const sim = byId.get(player.id);
    return {
      id: player.id, name: player.name, team: player.teamId,
      realGames: real.gp, simulatedGames: sim?.gp ?? 0,
      realPpg: round(real.pts / real.gp),
      simPpg: round((sim?.pts ?? 0) / Math.max(1, sim?.gp ?? 0)),
      realApg: round(real.ast / real.gp),
      simApg: round((sim?.ast ?? 0) / Math.max(1, sim?.gp ?? 0)),
      realFga: round(real.fga / real.gp),
      simFga: round((sim?.fga ?? 0) / Math.max(1, sim?.gp ?? 0)),
      realMpg: round(real.min / real.gp),
      simMpg: round((sim?.min ?? 0) / Math.max(1, sim?.gp ?? 0)),
    };
  }).sort((a, b) => b.realPpg - a.realPpg);
  assert.ok(rows.every(row => row.simulatedGames >= 5),
    "each sampled real scoring star needs at least five simulated games");
  const summary = {
    gamesSimulated: games.length, starSample: rows.length,
    meanRealStarPpg: round(mean(rows.map(r => r.realPpg))),
    meanSimStarPpg: round(mean(rows.map(r => r.simPpg))),
    starPpgMae: round(mean(rows.map(r => Math.abs(r.simPpg - r.realPpg)))),
    starApgMae: round(mean(rows.map(r => Math.abs(r.simApg - r.realApg)))),
    meanRealStarFga: round(mean(rows.map(r => r.realFga))),
    meanSimStarFga: round(mean(rows.map(r => r.simFga))),
    starFgaMae: round(mean(rows.map(r => Math.abs(r.simFga - r.realFga)))),
    meanRealStarMpg: round(mean(rows.map(r => r.realMpg))),
    meanSimStarMpg: round(mean(rows.map(r => r.simMpg))),
    meanStarMpgBias: round(mean(rows.map(r => r.simMpg - r.realMpg))),
    starsOver38SimMpg: rows.filter(r => r.simMpg > 38).length,
    starsBelow80PctRealPpg: rows.filter(r => r.simPpg < 0.8 * r.realPpg).length,
    starsAt25SimPpg: rows.filter(r => r.simPpg >= 25).length,
  };
  // Historical distribution guardrails, not per-player win/stat scripting.
  assert.ok(Math.abs(summary.meanSimStarPpg - summary.meanRealStarPpg) <= 1.25,
    "scoring leaders collectively under/overproduce against NBA evidence");
  assert.ok(summary.starPpgMae <= 3.1 && summary.starFgaMae <= 1.8,
    "star scoring and shot-attempt distributions drifted");
  assert.ok(Math.abs(summary.meanStarMpgBias) <= 2 && summary.starsOver38SimMpg <= 3,
    "star workloads must remain realistic during scoring calibration");
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/franchise-star-stat-realism.json",
    JSON.stringify({ methodology: "Static 2025-26 real rosters, every third published matchup, seeded independent games, no repeated injuries or midseason roster movement", summary, rows }, null, 2) + "\n");
  console.log("STAR_STAT_DIAGNOSTIC " + JSON.stringify(summary));
  console.log("STAR_STAT_PLAYERS " + JSON.stringify(rows));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

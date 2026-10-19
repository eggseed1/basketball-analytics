/**
 * One 2025-26 season: do the best rosters win?
 * Run: npx tsx scripts/test-gm-standings.ts
 */
import assert from "node:assert/strict";

import { bundledRosterSeasonRows } from "../src/data/providers/nba/espn-roster-client";
import { normalizePlayerName } from "../src/data/providers/salaries/salary-store";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { rotationTarget } from "../src/gm/engine/lineup";
import { simulateGame } from "../src/gm/engine/simulate";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import type { PlayerSeason } from "../src/data/types";

function indexByName(rows: PlayerSeason[]): Map<string, PlayerSeason> {
  const map = new Map<string, PlayerSeason>();
  for (const row of rows) {
    const key = normalizePlayerName(row.playerName);
    const prev = map.get(key);
    if (!prev || row.minutes > prev.minutes) map.set(key, row);
  }
  return map;
}

function placeOnCurrentRoster(roster: PlayerSeason[], prior: PlayerSeason[]): PlayerSeason[] {
  const priorByName = indexByName(prior.filter((row) => row.gamesPlayed > 0));
  return roster.map((slot) => {
    const stats = priorByName.get(normalizePlayerName(slot.playerName));
    if (!stats) return slot;
    return {
      ...stats,
      playerName: slot.playerName || stats.playerName,
      teamId: slot.teamId,
      teamName: slot.teamName,
      position: slot.position || stats.position,
      age: slot.age ?? stats.age,
    };
  });
}

const roster = bundledRosterSeasonRows("2026-27");
const prior = getBundledBrefPeerBoard("2025-26");
const rows = placeOnCurrentRoster(roster, prior);
const league = buildLeagueFromPlayerSeasons(rows, {
  userTeamId: "bos",
  seasonCanonical: "2026-27",
  seed: 11,
});

function quality(teamId: string) {
  const roster = league.players
    .filter((player) => player.teamId === teamId)
    .sort((a, b) => rotationTarget(b) - rotationTarget(a));
  const core = roster.slice(0, 8);
  const minutes = core.reduce((sum, player) => sum + rotationTarget(player), 0) || 1;
  const overall =
    core.reduce((sum, player) => sum + (player.sheet?.overall ?? 60) * rotationTarget(player), 0) /
    minutes;
  const impact = core.reduce((sum, player) => sum + player.ratings.impact, 0);
  const offense = core.reduce((sum, player) => sum + player.ratings.offense, 0) / core.length;
  const defense = core.reduce((sum, player) => sum + player.ratings.defense, 0) / core.length;
  return { overall, impact, offense, defense, names: core.map((player) => `${player.name} ${player.sheet?.overall ?? "—"}`) };
}

function playSeason() {
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const pointsFor = new Map<string, number>();
  const pointsAgainst = new Map<string, number>();
  for (const team of league.teams) {
    wins.set(team.id, 0);
    losses.set(team.id, 0);
    pointsFor.set(team.id, 0);
    pointsAgainst.set(team.id, 0);
  }
  let played = 0;
  for (const game of league.schedule) {
    const result = simulateGame(game, league.teams, league.players, 11000 + played);
    played += 1;
    const homeWon = result.game.homeScore! > result.game.awayScore!;
    const winner = homeWon ? game.homeTeamId : game.awayTeamId;
    const loser = homeWon ? game.awayTeamId : game.homeTeamId;
    wins.set(winner, (wins.get(winner) ?? 0) + 1);
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
    pointsFor.set(game.homeTeamId, (pointsFor.get(game.homeTeamId) ?? 0) + result.game.homeScore!);
    pointsFor.set(game.awayTeamId, (pointsFor.get(game.awayTeamId) ?? 0) + result.game.awayScore!);
    pointsAgainst.set(game.homeTeamId, (pointsAgainst.get(game.homeTeamId) ?? 0) + result.game.awayScore!);
    pointsAgainst.set(game.awayTeamId, (pointsAgainst.get(game.awayTeamId) ?? 0) + result.game.homeScore!);
  }
  return { played, wins, losses, pointsFor, pointsAgainst };
}

const first = playSeason();
const wins = first.wins;
const losses = first.losses;
const pointsFor = first.pointsFor;
const pointsAgainst = first.pointsAgainst;
const played = first.played;

const table = league.teams
  .map((team) => {
    const q = quality(team.id);
    const w = wins.get(team.id) ?? 0;
    const l = losses.get(team.id) ?? 0;
    const gp = w + l;
    return {
      id: team.id,
      w,
      l,
      net: gp ? ((pointsFor.get(team.id) ?? 0) - (pointsAgainst.get(team.id) ?? 0)) / gp : 0,
      ...q,
    };
  })
  .sort((a, b) => b.w - a.w || b.net - a.net);

function corr(key: "overall" | "impact" | "offense" | "defense") {
  const xs = table.map((row) => row[key]);
  const ys = table.map((row) => row.w);
  const mx = xs.reduce((s, n) => s + n, 0) / xs.length;
  const my = ys.reduce((s, n) => s + n, 0) / ys.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

console.log(`games ${played}`);
console.log(
  `corr wins/overall ${corr("overall").toFixed(2)} impact ${corr("impact").toFixed(2)} off ${corr("offense").toFixed(2)} def ${corr("defense").toFixed(2)}`
);
console.log("rank team w-l net ovr impact off def");
for (const row of table) {
  console.log(
    `${row.id.toUpperCase()} ${row.w}-${row.l} net ${row.net.toFixed(1)} ovr ${row.overall.toFixed(1)} imp ${row.impact.toFixed(1)} off ${row.offense.toFixed(2)} def ${row.defense.toFixed(2)}`
  );
}
const okc = table.find((row) => row.id === "okc");
const was = table.find((row) => row.id === "was");
const best = table[0]!;
const worst = table[table.length - 1]!;
console.log("okc core", okc?.names.join(", "));
const ppg =
  league.teams.reduce((sum, team) => sum + (pointsFor.get(team.id) ?? 0), 0) /
  league.teams.reduce((sum, team) => sum + (wins.get(team.id) ?? 0) + (losses.get(team.id) ?? 0), 0);
console.log("ppg", ppg.toFixed(1));
assert.ok(corr("overall") >= 0.7, `overall corr ${corr("overall")}`);
assert.ok(corr("impact") >= 0.7, `impact corr ${corr("impact")}`);
assert.ok((okc?.w ?? 0) >= 54, `okc wins ${okc?.w}`);
assert.ok(best.w <= 70, `${best.id} won ${best.w}`);
assert.ok(worst.w >= 12 && worst.w <= 30, `${worst.id} won ${worst.w}`);
assert.ok((was?.w ?? 99) <= 42, `was wins ${was?.w}`);
assert.ok(ppg > 110 && ppg < 120, `ppg ${ppg}`);

// A clear talent gap still shows up when the rest of the league is average.
for (const player of league.players) {
  if (!player.teamId) continue;
  player.ratings = { ...player.ratings, offense: 0, defense: 0 };
}
function stamp(teamId: string, offense: number, defense: number) {
  const core = league.players
    .filter((player) => player.teamId === teamId)
    .sort((a, b) => rotationTarget(b) - rotationTarget(a))
    .slice(0, 8);
  for (const player of core) {
    player.ratings = { ...player.ratings, offense, defense };
  }
}
stamp("okc", 2.4, 2.1);
stamp("was", -1.6, -1.4);
const projected = playSeason();
const okcWins = projected.wins.get("okc") ?? 0;
const wasWins = projected.wins.get("was") ?? 0;
assert.ok(okcWins >= 58, `stamped okc ${okcWins}`);
assert.ok(wasWins <= 32, `stamped was ${wasWins}`);
assert.ok(okcWins > wasWins + 20);
console.log("standings ok", okc?.w, "stamped", okcWins, "was", wasWins);

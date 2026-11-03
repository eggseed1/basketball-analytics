import assert from "node:assert/strict";
import { teamRowsFromEspnBox } from "../src/lib/team-game-box-espn";
import type { Game, GameBoxScore, PlayerGame } from "../src/data/types";

const game: Game = {
  id: "401900001", season: "2026-27", gameDate: "2026-11-02",
  homeTeamId: "10", awayTeamId: "2", homeProviderTeamId: "10", awayProviderTeamId: "2",
  homeScore: 109, awayScore: 93, gameType: "regular", status: "final",
};
function player(teamId: string, playerId: number, points: number): PlayerGame {
  return {
    id: String(playerId), gameId: game.id, playerId: String(playerId),
    teamId, season: game.season, gameDate: game.gameDate,
    opponentTeamId: teamId === "2" ? "10" : "2", isHome: teamId === "10",
    minutes: 24, points, assists: 3, rebounds: 5, steals: 1, blocks: 1,
    turnovers: 2, fieldGoalsMade: 8, fieldGoalsAttempted: 13,
    threePointersMade: 2, threePointersAttempted: 5,
    freeThrowsMade: 2, freeThrowsAttempted: 3, plusMinus: 0,
    offensiveRebounds: 1, defensiveRebounds: 4, personalFouls: 2,
  };
}
const bos = [20, 19, 18, 18, 18].map((pts, i) => player("2", i + 1, pts));
const hou = [26, 23, 20, 20, 20].map((pts, i) => player("10", i + 6, pts));
const box: GameBoxScore = { game, players: [...bos, ...hou] };
const rows = teamRowsFromEspnBox(game, box);
assert.ok(rows && rows.length === 2);
assert.deepEqual(rows.map(row => [row.espnId, row.row[0], row.row[1]]), [
  ["10", "2026-11-02", 109], ["2", "2026-11-02", 93],
]);
assert.equal(rows[1]!.row[3], 65, "FGA must sum actual box scores");
assert.equal(rows[1]!.row[10], 15, "assists must sum actual box scores");
assert.equal(teamRowsFromEspnBox(game, { game, players: bos }), null,
  "missing opponent lines cannot produce an apparently completed box");
assert.equal(teamRowsFromEspnBox(game, { game, players: [...bos.slice(1), ...hou] }), null,
  "partial five-man team boxes cannot be persisted");
assert.equal(teamRowsFromEspnBox({ ...game, status: "in_progress" }, box), null,
  "live games cannot be prematurely counted");
assert.equal(teamRowsFromEspnBox(game, { game, players: [
  ...bos.map(p => ({ ...p, points: p.points - 1 })), ...hou,
] }), null, "points must reconcile exactly to the final scoreboard");
console.log("ESPN team-game box fallback validates final status, team scores, full player samples and key totals");

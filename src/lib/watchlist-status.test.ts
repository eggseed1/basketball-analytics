/**
 * Run: npx tsx --test src/lib/watchlist-status.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Game, PlayerGame } from "@/data/types";
import {
  drblText,
  parseWatchIds,
  playerLineFor,
  playerLineText,
  resultText,
  scoringTrend,
  standingText,
  teamGameWindow,
  watchlistHeadline,
  watchlistInsights,
  type WatchPlayerStatus,
  type WatchTeamStatus,
} from "@/lib/watchlist-status";

function game(over: Partial<Game> & Pick<Game, "id" | "gameDate">): Game {
  return {
    season: "2026-27",
    homeTeamId: "7",
    awayTeamId: "26",
    homeTeamAbbr: "DEN",
    awayTeamAbbr: "UTA",
    homeScore: 0,
    awayScore: 0,
    gameType: "regular",
    status: "scheduled",
    tipOffAt: `${over.gameDate}T01:00Z`,
    ...over,
  };
}

function log(n: number, points: (i: number) => number): PlayerGame[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    gameId: `g${i}`,
    playerId: "p",
    teamId: "7",
    season: "2026-27",
    gameDate: `2026-11-${String(i + 1).padStart(2, "0")}`,
    opponentTeamId: "26",
    isHome: true,
    minutes: 30,
    points: points(i),
    assists: 5,
    rebounds: 8,
    steals: 1,
    blocks: 1,
    turnovers: 2,
    fieldGoalsMade: 8,
    fieldGoalsAttempted: 16,
    threePointersMade: 1,
    threePointersAttempted: 4,
    freeThrowsMade: 4,
    freeThrowsAttempted: 5,
  })) as PlayerGame[];
}

test("team window picks the latest final, the live game and the next tip", () => {
  const games = [
    game({ id: "a", gameDate: "2026-10-22", status: "final", homeScore: 110, awayScore: 99 }),
    game({ id: "b", gameDate: "2026-10-24", status: "final", homeTeamId: "3", awayTeamId: "7", homeTeamAbbr: "DAL", awayTeamAbbr: "DEN", homeScore: 120, awayScore: 101 }),
    game({ id: "c", gameDate: "2026-10-26", status: "in_progress" }),
    game({ id: "d", gameDate: "2026-10-30" }),
    game({ id: "e", gameDate: "2026-10-28" }),
    game({ id: "x", gameDate: "2026-10-27", homeTeamId: "1", awayTeamId: "2" }),
  ];
  const w = teamGameWindow(games, "7");
  assert.equal(w.last?.gameId, "b");
  assert.equal(w.last?.home, false);
  assert.equal(resultText(w.last!), "L 101-120 at DAL");
  assert.equal(w.live?.gameId, "c");
  assert.equal(w.live?.teamScore, null);
  assert.equal(w.next?.gameId, "e");
});

test("scores stay null until a game is final", () => {
  const w = teamGameWindow([game({ id: "a", gameDate: "2026-10-22" })], "7");
  assert.equal(w.next?.teamScore, null);
  assert.equal(resultText(w.next!), null);
});

test("preseason games carry no record", () => {
  const w = teamGameWindow(
    [game({ id: "a", gameDate: "2026-10-06", status: "final", gameType: "preseason", homeRecord: "0-0", homeScore: 1, awayScore: 0 })],
    "7"
  );
  assert.equal(w.last?.record, null);
});

test("scoring trend needs ten games and compares the last five", () => {
  assert.equal(scoringTrend(log(9, () => 20), "2026-27"), null);
  const t = scoringTrend(log(10, (i) => (i >= 5 ? 30 : 20)), "2026-27");
  assert.ok(t);
  assert.equal(t.recentGames, 5);
  assert.equal(t.recentPpg, 30);
  assert.equal(t.seasonPpg, 25);
  assert.equal(scoringTrend(log(12, () => 20), "2025-26"), null);
});

test("player line only for the matching game; zero minutes reads did not play", () => {
  const rows = log(3, () => 21);
  assert.equal(playerLineFor(rows, "nope"), null);
  assert.equal(playerLineText(playerLineFor(rows, "g1")!), "21 pts, 8 reb, 5 ast");
  rows[1]!.minutes = 0;
  assert.equal(playerLineText(playerLineFor(rows, "g1")!), "Did not play");
});

test("drbl text names each season", () => {
  assert.equal(drblText({ season: "2025-26", value: 4.22, prior: null }), "DRBL/100 +4.2 in 2025-26");
  assert.equal(
    drblText({ season: "2026-27", value: -0.31, prior: { season: "2025-26", value: 1.1 } }),
    "DRBL/100 -0.3 in 2026-27, +1.1 in 2025-26"
  );
});

test("ids are validated, deduped and capped", () => {
  assert.deepEqual(parseWatchIds("7, 7,abc,../x,13"), ["7", "abc", "13"]);
  assert.equal(parseWatchIds(Array.from({ length: 20 }, (_, i) => i).join(",")).length, 12);
  assert.deepEqual(parseWatchIds(null), []);
});

test("standing and insight headlines surface the urgent signal", () => {
  assert.equal(
    standingText({
      conference: "West",
      rank: 3,
      wins: 4,
      losses: 2,
      streak: "W2",
      lastTen: "4-2",
      differential: 5.1,
    }),
    "3rd in West · 4-2 · W2"
  );

  const player: WatchPlayerStatus = {
    kind: "player",
    id: "1",
    teamId: "7",
    last: null,
    live: null,
    next: null,
    line: null,
    trend: null,
    drbl: null,
    injury: {
      status: "out",
      statusLabel: "Out",
      injury: "knee",
      returnDate: null,
    },
  };
  assert.equal(watchlistHeadline(player), "Out · knee");
  assert.ok(watchlistInsights(player).some((i) => i.id === "injury" && i.tone === "alert"));

  const team: WatchTeamStatus = {
    kind: "team",
    id: "7",
    last: null,
    live: null,
    next: null,
    standing: {
      conference: "West",
      rank: 2,
      wins: 5,
      losses: 1,
      streak: "W3",
      lastTen: "5-1",
      differential: 8,
    },
  };
  assert.match(watchlistHeadline(team), /2nd in West/);
  assert.ok(watchlistInsights(team).some((i) => i.id === "standing" && i.href === "/standings"));
});

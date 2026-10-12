/**
 * Run: npx tsx --test src/lib/standings-preseason-guard.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { LeagueStandings, StandingRow } from "@/data/types/standings";
import {
  regularGamesThrough,
  standingsCountUnscheduledGames,
  withoutRecords,
} from "@/lib/standings-preseason-guard";

function row(teamId: string, displayName: string, wins: number, losses: number): StandingRow {
  return {
    teamId,
    abbreviation: displayName.slice(0, 3).toUpperCase(),
    displayName,
    conference: "East",
    rank: 0,
    wins,
    losses,
    winPct: wins + losses ? wins / (wins + losses) : 0,
    gamesBehind: 0,
    differential: 3.5,
    ppg: 110,
    oppPpg: 106.5,
    streak: "W2",
    homeRecord: "1-0",
    roadRecord: "1-0",
    lastTen: "2-0",
    playoffSeed: 1,
  };
}

const schedule = [
  { season: "2026-27", gameType: "preseason", gameDate: "2026-10-08", homeTeamId: "2", awayTeamId: "8" },
  { season: "2026-27", gameType: "regular", gameDate: "2026-10-20", homeTeamId: "8", awayTeamId: "2" },
  { season: "2026-27", gameType: "regular", gameDate: "2026-10-22", homeTeamId: "2", awayTeamId: "8" },
];

const through = (today: string) => regularGamesThrough(schedule, "2026-27", today)!;

test("a board counting preseason games is caught before and on opening night", () => {
  const board: LeagueStandings = {
    season: "2026-27",
    conferences: [{ conference: "East", rows: [row("2", "Boston Celtics", 2, 0), row("8", "Detroit Pistons", 1, 1)] }],
  };
  assert.equal(standingsCountUnscheduledGames(board, through("2026-10-15")), true);
  assert.equal(standingsCountUnscheduledGames(board, through("2026-10-20")), true);
  assert.equal(standingsCountUnscheduledGames(board, through("2026-10-22")), false);
});

test("an unknown schedule is null, not zero games", () => {
  assert.equal(regularGamesThrough(schedule, "2027-28", "2026-10-15"), null);
  assert.equal(regularGamesThrough(schedule, "2026-27", "2026-10-15")?.size, 0);
});

test("a real opening-night board passes", () => {
  const board: LeagueStandings = {
    season: "2026-27",
    conferences: [{ conference: "East", rows: [row("2", "Boston Celtics", 1, 0), row("8", "Detroit Pistons", 0, 1)] }],
  };
  assert.equal(standingsCountUnscheduledGames(board, through("2026-10-20")), false);
});

test("clearing records leaves every team at 0-0 in name order", () => {
  const board: LeagueStandings = {
    season: "2026-27",
    conferences: [{ conference: "East", rows: [row("8", "Detroit Pistons", 2, 0), row("2", "Boston Celtics", 0, 2)] }],
  };
  const rows = withoutRecords(board).conferences[0]!.rows;
  assert.deepEqual(rows.map((r) => [r.abbreviation, r.rank, r.wins, r.losses, r.playoffSeed]), [
    ["BOS", 1, 0, 0, null],
    ["DET", 2, 0, 0, null],
  ]);
});

/**
 * Season pulse: finished-game filter, weekly trends, movers, season picking.
 */
import assert from "node:assert/strict";

import type { Game } from "../src/data/types";
import {
  PULSE_MIN_GAMES,
  buildSeasonPulse,
  finishedRegularGames,
  pickPulseSeason,
  pulseTotals,
  teamMovers,
  weekOf,
  weeklyPulse,
  type PulseRecord,
} from "../src/lib/season-pulse";

let seq = 0;
function game(date: string, home: number, away: number, extra: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: String(seq),
    season: "2026-27",
    gameDate: date,
    homeTeamId: "1",
    awayTeamId: "2",
    homeScore: home,
    awayScore: away,
    gameType: "regular",
    status: "final",
    ...extra,
  } as Game;
}

// Only finished regular-season games with real scores count.
const mixed = [
  game("2026-10-20", 110, 100),
  game("2026-10-20", 0, 0, { status: "scheduled" }),
  game("2026-10-10", 120, 118, { gameType: "preseason" }),
  game("2026-10-21", 0, 0),
];
assert.equal(finishedRegularGames(mixed).length, 1);

// Points per team, close share (5 or fewer), home win share.
const totals = pulseTotals([game("2026-10-20", 110, 100), game("2026-10-20", 101, 104), game("2026-10-21", 99, 95)])!;
assert.equal(totals.games, 3);
assert.equal(totals.ppg, (210 + 205 + 194) / 6);
assert.equal(totals.closeShare, 2 / 3);
assert.equal(totals.homeWinShare, 2 / 3);
assert.equal(pulseTotals([]), null);

// Weeks start on the first game's date; thin weeks are dropped.
assert.equal(weekOf("2026-10-20", "2026-10-20"), 1);
assert.equal(weekOf("2026-10-20", "2026-10-26"), 1);
assert.equal(weekOf("2026-10-20", "2026-10-27"), 2);
const weeks = weeklyPulse([
  ...Array.from({ length: 12 }, () => game("2026-10-21", 112, 108)),
  ...Array.from({ length: 4 }, () => game("2026-10-28", 100, 90)),
  ...Array.from({ length: 10 }, () => game("2026-11-04", 120, 100)),
]);
assert.deepEqual(weeks.map((w) => w.week), [1, 3]);
assert.equal(weeks[0]!.ppg, 110);
assert.equal(weeks[1]!.closeShare, 0);

// Movers compare win percentage with last season and skip tiny samples.
const rec = (teamId: string, wins: number, losses: number): PulseRecord => ({
  teamId,
  abbr: `T${teamId}`,
  name: `Team ${teamId}`,
  wins,
  losses,
});
const { risers, fallers } = teamMovers(
  [rec("1", 8, 2), rec("2", 2, 8), rec("3", 5, 5), rec("4", 3, 0)],
  [rec("1", 20, 62), rec("2", 60, 22), rec("3", 41, 41), rec("4", 10, 72)]
);
assert.deepEqual(risers.map((m) => m.teamId), ["1"]);
assert.deepEqual(fallers.map((m) => m.teamId), ["2"]);
assert.equal(risers[0]!.priorWins, 20);

// The new season takes over once about a week of games is in.
const counts: Record<string, number> = { "2026-27": PULSE_MIN_GAMES - 1, "2025-26": 1230 };
assert.equal(pickPulseSeason("2026-27", "2025-26", (s) => counts[s] ?? 0), "2025-26");
counts["2026-27"] = PULSE_MIN_GAMES;
assert.equal(pickPulseSeason("2026-27", "2025-26", (s) => counts[s] ?? 0), "2026-27");
assert.equal(pickPulseSeason("2026-27", null, () => 0), null);

const pulse = buildSeasonPulse({
  season: "2026-27",
  games: Array.from({ length: 14 }, (_, i) => game(i < 10 ? "2026-10-21" : "2026-10-29", 115, 110)),
  priorSeason: "2025-26",
  priorGames: [game("2025-10-22", 100, 96, { season: "2025-26" })],
  records: [],
  priorRecords: [],
})!;
assert.equal(pulse.week, 2);
assert.equal(pulse.gamesPlayed, 14);
assert.equal(pulse.complete, false);
assert.equal(pulse.prior?.ppg, 98);
assert.equal(pulse.priorSeason, "2025-26");

console.log("test-season-pulse: PASS");

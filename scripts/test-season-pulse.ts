/**
 * Season pulse: counting games, team paths, streaks, phases, highlights,
 * stories and season picking.
 */
import assert from "node:assert/strict";

import type { Game } from "../src/data/types";
import {
  PULSE_MIN_GAMES,
  activeStreak,
  buildSeasonPulse,
  buildTeamSeasons,
  finishedRegularGames,
  lastGames,
  longestStreaks,
  pickHighlights,
  pickPulseSeason,
  pickStories,
  pulsePhase,
  pulseTotals,
} from "../src/lib/season-pulse";

let seq = 0;
/** Home team id first; ESPN ids 1-30 are real franchises. */
function game(
  date: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  extra: Partial<Game> = {}
): Game {
  seq += 1;
  return {
    id: String(seq),
    season: "2026-27",
    gameDate: date,
    homeTeamId: home,
    awayTeamId: away,
    homeTeamAbbr: `T${home}`,
    awayTeamAbbr: `T${away}`,
    homeScore,
    awayScore,
    gameType: "regular",
    status: "final",
    ...extra,
  } as Game;
}

// Only standings games between real franchises with real scores count.
const mixed = [
  game("2026-10-20", "1", "2", 110, 100),
  game("2026-10-20", "1", "2", 0, 0, { status: "scheduled" }),
  game("2026-10-10", "1", "2", 120, 118, { gameType: "preseason" }),
  game("2026-10-21", "1", "2", 0, 0),
  game("2026-12-16", "1", "2", 120, 110, { cupChampionship: true }),
  game("2027-02-15", "STARS", "STRIPES", 41, 40),
];
assert.equal(finishedRegularGames(mixed).length, 1);

const totals = pulseTotals([
  game("2026-10-20", "1", "2", 110, 100),
  game("2026-10-20", "1", "2", 101, 104),
  game("2026-10-21", "1", "2", 99, 95),
])!;
assert.equal(totals.ppg, (210 + 205 + 194) / 6);
assert.equal(totals.closeShare, 2 / 3);
assert.equal(totals.homeWinShare, 2 / 3);
assert.equal(pulseTotals([]), null);

// Paths track games above .500 in tip order; scheduled games are remaining.
const seasonGames = [
  game("2026-10-22", "1", "2", 100, 90),
  game("2026-10-21", "2", "1", 100, 98),
  game("2026-10-24", "1", "2", 110, 100),
  game("2026-10-26", "1", "2", 110, 101),
  game("2026-10-28", "2", "1", 0, 0, { status: "scheduled" }),
];
const teams = buildTeamSeasons(seasonGames);
const t1 = teams.find((t) => t.teamId === "1")!;
const t2 = teams.find((t) => t.teamId === "2")!;
assert.deepEqual(t1.path, [0, -1, 0, 1, 2]);
assert.deepEqual(t2.path, [0, 1, 0, -1, -2]);
assert.equal(t1.pointDiff, -2 + 10 + 10 + 9);
assert.deepEqual(t1.remaining, ["2"]);
assert.deepEqual(activeStreak(t1), { won: true, length: 3 });
assert.deepEqual(longestStreaks(t2), { wins: 1, losses: 3 });
assert.deepEqual(lastGames(t1, 2), { wins: 2, losses: 0, margin: 19 });

// Phases follow the share of the 1,230-game schedule.
assert.equal(pulsePhase(40, 1190), "early");
assert.equal(pulsePhase(400, 830), "middle");
assert.equal(pulsePhase(900, 330), "stretch");
assert.equal(pulsePhase(1230, 0), "complete");
assert.equal(pulsePhase(1200, 0), "complete");

// A league of four teams: team 3 sweeps, team 4 loses everything.
const league: Game[] = [];
for (let i = 0; i < 12; i += 1) {
  const d = `2026-11-${String(i + 1).padStart(2, "0")}`;
  league.push(game(d, "3", "4", 120, 100));
  league.push(game(d, i % 2 ? "5" : "6", i % 2 ? "6" : "5", 104, 101));
}
const priorLeague = [
  ...Array.from({ length: 10 }, () => game("2025-11-01", "3", "4", 90, 100, { season: "2025-26" })),
  ...Array.from({ length: 10 }, () => game("2025-11-02", "5", "6", 100, 99, { season: "2025-26" })),
];
const now = buildTeamSeasons(league);
const before = buildTeamSeasons(priorLeague);

const early = pickHighlights(now, before, "early");
assert.deepEqual(
  early.map((h) => [h.role, h.team.teamId]),
  [["best", "3"], ["worst", "4"], ["riser", "6"], ["faller", "5"]]
);
assert.deepEqual(early[3]!.prior, { wins: 10, losses: 0 });
const middle = pickHighlights(now, before, "middle");
assert.deepEqual(middle.slice(0, 3).map((h) => h.role), ["best", "hot", "cold"]);
assert.equal(middle[2]!.team.teamId, "4");
assert.equal(new Set(middle.map((h) => h.team.teamId)).size, middle.length);

const earlyStories = pickStories(now, before, "early");
assert.deepEqual(earlyStories.map((s) => s.kind), ["unbeaten", "vs-last", "streaks"]);
const unbeaten = earlyStories[0]!;
assert.ok(unbeaten.kind === "unbeaten");
assert.deepEqual(unbeaten.perfect.map((t) => t.teamId), ["3"]);
assert.deepEqual(unbeaten.winless.map((t) => t.teamId), ["4"]);

const complete = pickStories(now, before, "complete");
const streaks = complete.find((s) => s.kind === "streaks");
assert.ok(streaks?.kind === "streaks" && streaks.mode === "longest");
assert.equal(streaks.wins[0]!.length, 12);
// Only two teams have four or more close games, too few to compare.
assert.ok(!complete.some((s) => s.kind === "close"));

// The new season takes over after its first few nights.
const counts: Record<string, number> = { "2026-27": PULSE_MIN_GAMES - 1, "2025-26": 1230 };
assert.equal(pickPulseSeason("2026-27", "2025-26", (s) => counts[s] ?? 0), "2025-26");
counts["2026-27"] = PULSE_MIN_GAMES;
assert.equal(pickPulseSeason("2026-27", "2025-26", (s) => counts[s] ?? 0), "2026-27");
assert.equal(pickPulseSeason("2026-27", null, () => 0), null);

const pulse = buildSeasonPulse({
  season: "2026-27",
  games: league,
  priorSeason: "2025-26",
  priorGames: priorLeague,
})!;
assert.equal(pulse.phase, "early");
assert.equal(pulse.gamesPlayed, 24);
assert.equal(pulse.maxTeamGames, 12);
assert.equal(pulse.priorSeason, "2025-26");
assert.equal(buildSeasonPulse({ season: "2026-27", games: [], priorSeason: null, priorGames: [] }), null);

console.log("test-season-pulse: PASS");

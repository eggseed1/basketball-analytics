/**
 * Homepage season phase from schedule dates.
 *   npx tsx scripts/test-home-season-moment.ts
 */
import assert from "node:assert/strict";

import { getRuntimeSnapshotGames } from "../src/data/runtime/game-snapshot";
import type { Game } from "../src/data/types";
import {
  guessHomeSeasonPhase,
  homeLayoutForPhase,
  resolveHomeSeasonMoment,
  scheduleMarks,
  seasonChampion,
} from "../src/lib/home-season-moment";

let n = 0;
function game(partial: Partial<Game> & Pick<Game, "season" | "gameDate" | "gameType">): Game {
  n += 1;
  return {
    id: `g${n}`,
    homeTeamId: "H",
    awayTeamId: "A",
    homeTeamAbbr: "HOM",
    awayTeamAbbr: "AWY",
    homeTeamName: "Home Team",
    awayTeamName: "Away Team",
    homeScore: 0,
    awayScore: 0,
    status: "scheduled",
    ...partial,
  } as Game;
}

/** One best-of-seven won 4-`losses` by `winner`. */
function series(season: string, winner: string, loser: string, start: string, losses = 0): Game[] {
  const out: Game[] = [];
  const day = Date.parse(`${start}T12:00:00Z`);
  for (let i = 0; i < 4 + losses; i++) {
    const winnerWins = i >= losses;
    out.push(
      game({
        season,
        gameType: "playoff",
        status: "final",
        gameDate: new Date(day + i * 2 * 86_400_000).toISOString().slice(0, 10),
        homeTeamId: winner,
        awayTeamId: loser,
        homeTeamAbbr: winner,
        awayTeamAbbr: loser,
        homeTeamName: `${winner} name`,
        awayTeamName: `${loser} name`,
        homeScore: winnerWins ? 110 : 100,
        awayScore: winnerWins ? 100 : 110,
      })
    );
  }
  return out;
}

/** 14 decided series through the conference finals, plus optionally the Finals. */
function playoffs(season: string, withFinals: boolean): Game[] {
  const games: Game[] = [];
  for (let i = 0; i < 8; i++) games.push(...series(season, `R1W${i}`, `R1L${i}`, "2027-04-18"));
  for (let i = 0; i < 4; i++) games.push(...series(season, `R2W${i}`, `R2L${i}`, "2027-05-05"));
  games.push(...series(season, "EAST", "CFL1", "2027-05-20"));
  games.push(...series(season, "WEST", "CFL2", "2027-05-21"));
  if (withFinals) games.push(...series(season, "WEST", "EAST", "2027-06-04", 2));
  return games;
}

const next = "2026-27";
const nextGames = [
  game({ season: next, gameType: "preseason", gameDate: "2026-10-03" }),
  game({ season: next, gameType: "preseason", gameDate: "2026-10-16" }),
  game({ season: next, gameType: "regular", gameDate: "2026-10-20", homeTeamAbbr: "DET", awayTeamAbbr: "BOS" }),
  game({ season: next, gameType: "regular", gameDate: "2026-10-20", homeTeamAbbr: "LAL", awayTeamAbbr: "GS" }),
  game({ season: next, gameType: "regular", gameDate: "2027-04-11" }),
];
const prev = scheduleMarks("2025-26", [
  ...playoffs("2025-26", true).map((g) => ({ ...g, season: "2025-26" })),
]);
assert.equal(prev.champion?.teamId, "WEST", "champion from 15 decided series");
assert.equal(prev.champion?.result, "4-2");

const marks = scheduleMarks(next, nextGames);
assert.equal(marks.preseasonStart, "2026-10-03");
assert.equal(marks.opener, "2026-10-20");
assert.equal(marks.regularEnd, "2027-04-11");
assert.deepEqual(
  marks.openerGames.map((g) => `${g.awayAbbr}@${g.homeAbbr}`),
  ["BOS@DET", "GS@LAL"]
);

const at = (today: string, current = marks) => resolveHomeSeasonMoment({ today, current, previous: prev });

// Offseason before the schedule exists, then with it.
assert.equal(at("2026-07-10", scheduleMarks(next, [])).phase, "draft-free-agency");
assert.equal(at("2026-07-10", scheduleMarks(next, [])).champion?.teamId, "WEST");
assert.equal(at("2026-08-20", scheduleMarks(next, [])).phase, "offseason");
assert.equal(at("2026-09-15").phase, "offseason");
assert.equal(at("2026-09-15").daysToOpener, 35);

// Preseason (today's real date) and the opening weeks.
const pre = at("2026-10-04");
assert.equal(pre.phase, "preseason");
assert.equal(pre.daysToOpener, 16);
assert.equal(at("2026-10-19").phase, "preseason");
const opening = at("2026-10-20");
assert.equal(opening.phase, "opening-weeks");
assert.equal(opening.regularWeek, 1);
assert.equal(at("2026-11-09").phase, "opening-weeks");
assert.equal(at("2026-11-10").phase, "regular-season");
assert.equal(at("2026-11-10").regularWeek, 4);

// Stretch run: the last 28 days, the final day counting as 1.
assert.equal(at("2027-03-14").phase, "regular-season");
const stretch = at("2027-03-15");
assert.equal(stretch.phase, "stretch-run");
assert.equal(stretch.regularDaysLeft, 28);
assert.equal(at("2027-04-11").regularDaysLeft, 1);

// Play-in until the first playoff game, then playoffs until a champion exists.
assert.equal(at("2027-04-13").phase, "play-in");
const withPlayIn = scheduleMarks(next, [
  ...nextGames,
  game({ season: next, gameType: "play-in", gameDate: "2027-04-14" }),
  game({ season: next, gameType: "playoff", gameDate: "2027-04-18" }),
]);
assert.equal(at("2027-04-15", withPlayIn).phase, "play-in");
assert.equal(at("2027-04-18", withPlayIn).phase, "playoffs");

// A finished conference final is not a title.
const confDone = scheduleMarks(next, [...nextGames, ...playoffs(next, false)]);
assert.equal(seasonChampion(next, playoffs(next, false)), null);
assert.equal(at("2027-05-30", confDone).phase, "playoffs");

// Results after today don't count yet.
const beforeFinals = scheduleMarks(next, [...nextGames, ...playoffs(next, true)], "2027-06-01");
assert.equal(beforeFinals.champion, null);
assert.equal(at("2027-06-01", beforeFinals).phase, "playoffs");

const titleWon = scheduleMarks(next, [...nextGames, ...playoffs(next, true)]);
const june = at("2027-06-20", titleWon);
assert.equal(june.phase, "draft-free-agency");
assert.equal(june.champion?.teamId, "WEST");
assert.equal(june.champion?.season, next);

// Every phase has a layout and leads with its own module.
assert.equal(homeLayoutForPhase("preseason").top[0], "moment");
assert.equal(homeLayoutForPhase("stretch-run").main[0], "standings-race");
assert.ok(homeLayoutForPhase("playoffs").top.includes("bracket"));
assert.ok(!homeLayoutForPhase("playoffs").side.includes("standings"));

// The loading skeleton's calendar guess lands on the phase the real dates give.
assert.equal(guessHomeSeasonPhase("2026-10-07"), "preseason");
assert.equal(guessHomeSeasonPhase("2026-10-28"), "opening-weeks");
assert.equal(guessHomeSeasonPhase("2027-01-15"), "regular-season");
assert.equal(guessHomeSeasonPhase("2027-03-30"), "stretch-run");
assert.equal(guessHomeSeasonPhase("2027-04-15"), "play-in");
assert.equal(guessHomeSeasonPhase("2027-05-10"), "playoffs");
assert.equal(guessHomeSeasonPhase("2027-07-04"), "draft-free-agency");
assert.equal(guessHomeSeasonPhase("2027-08-20"), "offseason");

// Bundled data: 2025-26 has a decided Finals and 2026-27 has its real dates.
const real = scheduleMarks("2025-26", getRuntimeSnapshotGames("2025-26"));
assert.ok(real.champion, "2025-26 champion from the bundled snapshot");
const upcoming = scheduleMarks(next, getRuntimeSnapshotGames(next));
assert.ok(upcoming.opener && upcoming.preseasonStart && upcoming.opener > upcoming.preseasonStart);

console.log(
  `home season moment: ok (2025-26 champion ${real.champion?.abbr} ${real.champion?.result}, ${next} opener ${upcoming.opener})`
);

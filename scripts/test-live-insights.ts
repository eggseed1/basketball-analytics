import assert from "node:assert/strict";

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { buildLiveInsights, buildRightNow, foulTroubleThreshold } from "@/lib/games/live-insights";
import {
  WIN_PROB_PARAMS,
  buildWinProbabilitySeries,
  homeWinProbabilityAt,
  homeWinProbabilityFromState,
  nextBall,
  pregameHomeMargin,
} from "@/lib/game-win-probability";
import { parseOfficialTeamStats } from "@/lib/games/official-team-stats";

let n = 0;
let home = 0;
let away = 0;
function ev(
  period: number,
  clockSeconds: number,
  teamId: string | null,
  description: string,
  extra: Partial<PlayByPlayEvent> = {}
): PlayByPlayEvent {
  n++;
  const points = extra.points ?? 0;
  if (teamId === "H") home += points;
  if (teamId === "A") away += points;
  return {
    id: String(n),
    gameId: "g",
    actionNumber: n,
    orderNumber: n,
    period,
    clockSeconds,
    clock: `${Math.floor(clockSeconds / 60)}:${String(clockSeconds % 60).padStart(2, "0")}`,
    actionType: extra.actionType ?? "unknown",
    subType: "",
    description,
    teamId,
    teamTricode: null,
    playerId: extra.playerId ?? null,
    playerName: null,
    secondPlayerId: extra.secondPlayerId ?? null,
    scoreHome: home,
    scoreAway: away,
    shotResult: extra.shotResult ?? null,
    isFieldGoal: extra.isFieldGoal ?? false,
    points,
    ...extra,
  };
}
const fg = (p: number, c: number, team: string, player: string, made: boolean, pts = 2, desc = "") =>
  ev(p, c, team, desc || `${player} ${made ? "makes" : "misses"} shot`, {
    actionType: pts === 3 ? "3pt" : "2pt",
    isFieldGoal: true,
    shotResult: made ? "Made" : "Missed",
    points: made ? pts : 0,
    playerId: player,
  });

const events: PlayByPlayEvent[] = [
  // Scores establish sides: H scores first, then A.
  fg(1, 700, "H", "h1", true),
  fg(1, 680, "A", "a1", true),
  // A misses, A offensive rebound, A scores: 2 second-chance points for A.
  fg(1, 660, "A", "a1", false),
  ev(1, 655, "A", "a2 offensive rebound", { actionType: "rebound", playerId: "a2" }),
  fg(1, 650, "A", "a2", true),
  // H turns it over (stolen by a1), A scores a three: 3 points off turnovers.
  ev(1, 640, "H", "h1 bad pass turnover (a1 steals)", { actionType: "turnover", playerId: "h1", secondPlayerId: "a1" }),
  fg(1, 630, "A", "a1", true, 3),
  // H misses, H team rebound: possession stays, but no rebound is counted.
  fg(1, 600, "H", "h1", false),
  ev(1, 598, "H", "Home offensive team rebound", { actionType: "rebound" }),
  fg(1, 590, "H", "h1", true),
  ev(1, 0, null, "End of the 1st Quarter", { actionType: "period" }),
  // Q2 in progress, no end marker.
  fg(2, 700, "H", "h2", true, 3),
  ev(2, 690, "A", "a1 lost ball turnover", { actionType: "turnover", playerId: "a1" }),
];

const r = buildLiveInsights(events, { homeLabel: "HOM", awayLabel: "AWY", final: false });
assert.ok(r.battle);
assert.equal(r.battle.away.oreb, 1, "player offensive rebound counted");
assert.equal(r.battle.home.oreb, 0, "team rebound not counted as a rebound");
assert.equal(r.battle.away.secondChancePoints, 2);
assert.equal(r.battle.home.secondChancePoints, 2, "team offensive rebound still starts a second chance");
assert.equal(r.battle.away.pointsOffTurnovers, 3);
assert.equal(r.battle.home.tov, 1);
assert.equal(r.battle.away.tov, 1);
assert.equal(r.battle.away.stl, 1);
assert.equal(r.battle.away.extraChances, 2, "1 OREB + 1 opponent turnover");
assert.equal(r.battle.home.extraChances, 1);
assert.equal(r.battle.net, -1);

assert.equal(r.quarters.length, 2);
assert.equal(r.quarters[0]!.finished, true, "Q1 has an end marker");
assert.equal(r.quarters[1]!.finished, false, "Q2 is still being played");
assert.equal(r.quarters[0]!.awayPoints, 7);
assert.equal(r.quarters[0]!.homePoints, 4);
assert.equal(r.quarters[0]!.away?.playerId, "a1", "a1: 5 pts + 1 stl - 1 miss beats a2: 2 pts + 1 reb");
assert.equal(r.quarters[1]!.home?.playerId, "h2");

const final = buildLiveInsights(events, { homeLabel: "HOM", awayLabel: "AWY", final: true });
assert.equal(final.quarters[1]!.finished, true, "final games close every quarter");

const timeline = [
  { elapsedGameTime: 600, period: 1, clock: "2:00", homeScore: 20, awayScore: 10, margin: 10, eventIndex: 0, points: 2, scoringTeamId: "H" },
];
const liveSeries = buildWinProbabilitySeries(timeline as never, { finalHomeScore: 20, finalAwayScore: 10, final: false });
assert.ok(liveSeries.every((p) => p.homeWp < 1), "live games never resolve to 100%");
const finalSeries = buildWinProbabilitySeries(timeline as never, { finalHomeScore: 20, finalAwayScore: 10, final: true });
assert.equal(finalSeries.at(-1)!.homeWp, 1, "final games resolve to the winner");

// Right now: A has 7 unanswered points (2 + 3 + 2 below); H's last field goal was Q2 7:00.
const tail: PlayByPlayEvent[] = [
  ...events,
  fg(2, 420, "H", "h2", true),
  fg(2, 300, "A", "a1", true),
  ev(2, 250, "A", "a1 makes free throw 1 of 2", { actionType: "freethrow", shotResult: "Made", points: 1, playerId: "a1" }),
  ev(2, 250, "A", "a1 makes free throw 2 of 2", { actionType: "freethrow", shotResult: "Made", points: 1, playerId: "a1" }),
  fg(2, 200, "A", "a2", true, 3),
  fg(2, 150, "H", "h1", false),
];
const now = buildRightNow(tail, { homeLabel: "HOM", awayLabel: "AWY" });
assert.ok(now);
assert.equal(now.period, 2);
assert.deepEqual(now.run && { side: now.run.side, points: now.run.points, at: now.run.since.clock }, {
  side: "away",
  points: 7,
  at: "5:00",
});
assert.deepEqual(now.droughts.map((d) => [d.side, d.since?.clock]), [["home", "7:00"]], "H cold since 7:00, A just scored");
const short = buildRightNow(tail.slice(0, -3), { homeLabel: "HOM", awayLabel: "AWY" });
assert.equal(short?.run, null, "3 unanswered points is not a run yet");
assert.equal(foulTroubleThreshold(1), 2);
assert.equal(foulTroubleThreshold(2), 3);
assert.equal(foulTroubleThreshold(3), 4);
assert.equal(foulTroubleThreshold(5), 5);

const boxTeams = [
  {
    team: { id: "7" },
    statistics: [
      { name: "pointsInPaint", displayValue: "28" },
      { name: "fastBreakPoints", displayValue: "6" },
      { name: "turnoverPoints", displayValue: "11" },
    ],
  },
  {
    team: { id: "26" },
    statistics: [
      { name: "pointsInPaint", displayValue: "18" },
      { name: "fastBreakPoints", displayValue: "10" },
      { name: "turnoverPoints", displayValue: "10" },
    ],
  },
];
const official = parseOfficialTeamStats(boxTeams, { homeProviderTeamId: "7", awayProviderTeamId: "26" });
assert.deepEqual(official, {
  home: { pointsInPaint: 28, fastBreakPoints: 6, pointsOffTurnovers: 10 },
  away: { pointsInPaint: 18, fastBreakPoints: 10, pointsOffTurnovers: 11 },
}, "turnoverPoints is conceded, so it belongs to the other side");
const swapped = parseOfficialTeamStats(boxTeams, { homeProviderTeamId: "26", awayProviderTeamId: "7" });
assert.equal(swapped?.home.pointsInPaint, 18, "sides follow team ids, not array order");
assert.equal(parseOfficialTeamStats(boxTeams, { homeProviderTeamId: "7" }), null, "missing id means no stats");

const near = (v: number, want: number, tol: number, msg: string) =>
  assert.ok(Math.abs(v - want) <= tol, `${msg}: got ${v.toFixed(3)}`);
near(homeWinProbabilityAt(0, 0, 1, "12:00"), 0.5, 1e-6, "even matchup tied at tip is a coin flip");
near(homeWinProbabilityAt(59, 50, 3, "12:00"), 0.75, 0.02, "9-point halftime lead");
near(homeWinProbabilityAt(100, 95, 4, "2:00"), 0.89, 0.02, "5-point lead, 2:00 left");
near(
  homeWinProbabilityAt(95, 100, 4, "2:00"),
  1 - homeWinProbabilityAt(100, 95, 4, "2:00"),
  1e-9,
  "symmetric for the trailing side"
);
near(homeWinProbabilityAt(100, 100, 4, "0:00"), 0.5, 1e-6, "tied at the horn");
assert.equal(homeWinProbabilityAt(101, 100, 4, "0:00"), 1, "a lead at the horn is a win");
assert.equal(homeWinProbabilityAt(101, 100, 5, "0:00"), 1, "same at the end of overtime");
near(homeWinProbabilityFromState(0, 2880, 6), 0.63, 0.02, "6-point pregame favorite at tip");
assert.ok(homeWinProbabilityFromState(0, 60, 6) < 0.54, "the pregame edge fades with the clock");
assert.ok(
  homeWinProbabilityFromState(1, 10, 0, WIN_PROB_PARAMS, 1) - homeWinProbabilityFromState(1, 10, 0, WIN_PROB_PARAMS, -1) > 0.2,
  "late, having the ball matters"
);

const play = (homeScored: boolean, clock = "1:00", period = 4) => ({ homeScored, clock, period });
assert.equal(nextBall(play(true)), -1, "after a home basket the away team inbounds");
assert.equal(nextBall(play(false)), 1, "and the reverse");
assert.equal(nextBall(play(true), play(true)), 1, "home still shooting free throws at the same clock");
assert.equal(nextBall(play(true), play(true, "0:58")), -1, "a later home score is a new trip");
assert.equal(nextBall(play(true), play(false)), -1, "other team scoring next means it had the ball");

const hc = WIN_PROB_PARAMS.homeCourt;
const blowouts = [
  { date: "2025-11-01", homeTeamId: "A", awayTeamId: "B", homeScore: 110, awayScore: 100 },
  { date: "2025-11-03", homeTeamId: "A", awayTeamId: "B", homeScore: 110, awayScore: 100 },
  { date: "2025-11-05", homeTeamId: "A", awayTeamId: "B", homeScore: 90, awayScore: 130 },
];
near(
  pregameHomeMargin({ homeTeamId: "A", awayTeamId: "B", date: "2025-11-05", seasonGames: blowouts }),
  hc + 2 * (10 - hc),
  1e-9,
  "home court plus the rating gap, from games before the date only"
);
const evenLastYear = [{ date: "2025-03-01", homeTeamId: "A", awayTeamId: "B", homeScore: 100 + hc, awayScore: 100 }];
near(
  pregameHomeMargin({
    homeTeamId: "A",
    awayTeamId: "B",
    date: "2025-11-05",
    seasonGames: blowouts,
    priorSeasonGames: evenLastYear,
  }),
  hc + (2 * 2 * (10 - hc)) / (2 + WIN_PROB_PARAMS.priorGames),
  1e-9,
  "last season pulls early ratings toward it"
);
near(
  pregameHomeMargin({ homeTeamId: "A", awayTeamId: "B", date: "2025-10-20", seasonGames: blowouts }),
  hc,
  1e-9,
  "no games yet means home court alone"
);

const lateTimeline = [
  { elapsedGameTime: 2820, period: 4, clock: "1:00", homeScore: 100, awayScore: 98, margin: 2, eventIndex: 0, points: 2, scoringTeamId: "H" },
];
const hornSeries = buildWinProbabilitySeries(lateTimeline as never, { finalHomeScore: 100, finalAwayScore: 98, final: true });
assert.equal(hornSeries.at(-1)!.elapsedGameTime, 2880, "the final 100% sits at the horn, not a second after the last basket");
near(hornSeries[0]!.homeWp, 0.5, 1e-6, "tip-off seeded at the pregame estimate");
const favored = buildWinProbabilitySeries(lateTimeline as never, { final: false, pregameMargin: 6 });
near(favored[0]!.homeWp, homeWinProbabilityFromState(0, 2880, 6), 1e-9, "pregame margin moves tip-off");

console.log("live insights: ok");

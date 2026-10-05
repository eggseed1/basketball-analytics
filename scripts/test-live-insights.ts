import assert from "node:assert/strict";

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { buildLiveInsights } from "@/lib/games/live-insights";
import { buildWinProbabilitySeries } from "@/lib/game-win-probability";

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

console.log("live insights: ok");

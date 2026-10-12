import assert from "node:assert/strict";
import { test } from "node:test";

import type { GameSummary } from "@/data/types";
import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { gameAtPoint, mergePoints, pointAt, recentPoints, scoreTimeline } from "./score-timeline";

const T0 = Date.parse("2026-10-20T23:40:00Z");

let seq = 0;
function play(p: {
  period: number;
  clock: string;
  away: number;
  home: number;
  wall: number | null;
  type?: string;
  text?: string;
}): PlayByPlayEvent {
  seq += 1;
  return {
    id: String(seq),
    gameId: "g1",
    actionNumber: seq,
    orderNumber: seq,
    period: p.period,
    clockSeconds: 0,
    clock: p.clock,
    actionType: p.type ?? "2pt",
    subType: "",
    description: p.text ?? "",
    teamId: null,
    teamTricode: null,
    playerId: null,
    playerName: null,
    scoreHome: p.home,
    scoreAway: p.away,
    shotResult: null,
    isFieldGoal: false,
    points: 0,
    wallMs: p.wall,
  };
}

const s = (n: number) => T0 + n * 1000;

const events = [
  play({ period: 1, clock: "12:00", away: 0, home: 0, wall: s(-30), type: "jumpball", text: "Jump ball" }),
  play({ period: 1, clock: "11:40", away: 2, home: 0, wall: s(20) }),
  play({ period: 1, clock: "11:10", away: 2, home: 3, wall: s(50) }),
  play({ period: 1, clock: "0:00", away: 2, home: 3, wall: s(900), type: "period", text: "End of the 1st Quarter" }),
  play({ period: 2, clock: "11:30", away: 4, home: 3, wall: s(1100) }),
  play({ period: 2, clock: "0:00", away: 4, home: 3, wall: s(2000), type: "period", text: "End of the 2nd Quarter" }),
  play({ period: 3, clock: "11:00", away: 4, home: 5, wall: s(3000) }),
  play({ period: 4, clock: "0:00", away: 9, home: 7, wall: s(6000) }),
  play({ period: 4, clock: "0:00", away: 9, home: 7, wall: s(6010), type: "period", text: "End of Game" }),
];

test("scoreTimeline starts with a pregame point and ends with the final", () => {
  const points = scoreTimeline(events);
  assert.equal(points[0]!.status, "pregame");
  assert.equal(points[0]!.detail, "Pregame");
  const last = points.at(-1)!;
  assert.equal(last.status, "final");
  assert.equal(last.detail, "Final");
  assert.deepEqual([last.away, last.home], [9, 7]);
  assert.deepEqual(last.awayPeriods, [2, 2, 0, 5]);
  assert.deepEqual(last.homePeriods, [3, 0, 2, 2]);
});

test("scoreTimeline labels quarter breaks and halftime", () => {
  const points = scoreTimeline(events);
  const q1 = points.find((p) => p.status === "period_break")!;
  assert.equal(q1.detail, "End of 1st Quarter");
  assert.equal(q1.at, s(900));
  const half = points.find((p) => p.status === "halftime")!;
  assert.equal(half.detail, "Halftime");
  assert.deepEqual([half.away, half.home], [4, 3]);
});

test("scoreTimeline keeps play times moving forward", () => {
  const points = scoreTimeline([
    play({ period: 1, clock: "11:40", away: 2, home: 0, wall: s(100) }),
    play({ period: 1, clock: "11:20", away: 2, home: 2, wall: s(40) }),
    play({ period: 1, clock: "11:00", away: 2, home: 4, wall: null }),
  ]);
  const times = points.map((p) => p.at);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(points.at(-1)!.at, s(100));
  assert.deepEqual([points.at(-1)!.away, points.at(-1)!.home], [2, 4]);
});

test("scoreTimeline skips plays before any wall time is known", () => {
  const points = scoreTimeline([
    play({ period: 1, clock: "11:40", away: 2, home: 0, wall: null }),
    play({ period: 1, clock: "11:20", away: 2, home: 2, wall: s(10) }),
  ]);
  assert.equal(points[0]!.status, "pregame");
  assert.deepEqual([points.at(-1)!.away, points.at(-1)!.home], [2, 2]);
});

test("scoreTimeline names overtime finals", () => {
  const points = scoreTimeline([
    play({ period: 5, clock: "1:00", away: 110, home: 108, wall: s(10) }),
    play({ period: 5, clock: "0:00", away: 110, home: 108, wall: s(20), type: "period", text: "End of Game" }),
  ]);
  assert.equal(points.at(-1)!.detail, "Final/OT");
});

test("pointAt returns the newest point at the cutoff and when the next is due", () => {
  const points = scoreTimeline(events);
  const before = pointAt(points, s(-100));
  assert.equal(before.point, null);
  assert.equal(before.nextAt, points[0]!.at);

  const mid = pointAt(points, s(60));
  assert.deepEqual([mid.point!.away, mid.point!.home], [2, 3]);
  assert.equal(mid.nextAt, s(900));

  const end = pointAt(points, s(99999));
  assert.equal(end.point!.status, "final");
  assert.equal(end.nextAt, null);
});

test("recentPoints keeps the point before the window", () => {
  const points = scoreTimeline(events);
  const recent = recentPoints(points, s(1000));
  assert.equal(recent[0]!.at, s(900));
  assert.equal(pointAt(recent, s(1050)).point!.status, "period_break");
  assert.deepEqual(recentPoints(points, s(99999)), [points.at(-1)]);
});

test("mergePoints replaces held points from the first fresh time on", () => {
  const points = scoreTimeline(events);
  const held = points.slice(0, 4);
  const fresh = points.slice(2);
  assert.deepEqual(mergePoints(held, fresh), points);
  assert.deepEqual(mergePoints([], fresh), fresh);
  assert.deepEqual(mergePoints(held, []), held);
});

const finalGame = {
  id: "g1",
  status: "final",
  statusDetail: "Final",
  awayScore: 9,
  homeScore: 7,
  awayRecord: "1-0",
  homeRecord: "0-1",
} as unknown as GameSummary;

test("gameAtPoint hides records that already count the result", () => {
  const points = scoreTimeline(events);
  const live = gameAtPoint(finalGame, pointAt(points, s(60)).point);
  assert.equal(live.status, "in_progress");
  assert.equal(live.statusDetail, "11:10 - 1st Quarter");
  assert.deepEqual([live.awayScore, live.homeScore], [2, 3]);
  assert.equal(live.awayRecord, undefined);
  assert.equal(live.homeRecord, undefined);

  const done = gameAtPoint(finalGame, points.at(-1)!);
  assert.equal(done.awayRecord, "1-0");

  const liveGame = { ...finalGame, status: "in_progress" } as GameSummary;
  assert.equal(gameAtPoint(liveGame, pointAt(points, s(60)).point).awayRecord, "1-0");
});

test("gameAtPoint before the first play reads as pregame", () => {
  const shown = gameAtPoint(finalGame, null);
  assert.equal(shown.status, "pregame");
  assert.equal(shown.period, undefined);
  assert.equal(shown.awayPeriodScores, undefined);
});
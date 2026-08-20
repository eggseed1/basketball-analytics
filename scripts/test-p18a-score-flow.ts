/**
 * P18A unit fixtures: score-flow / runs / lead changes / comebacks.
 *   npx tsx scripts/test-p18a-score-flow.ts
 */
import assert from "node:assert/strict";
import {
  buildScoreTimeline,
  computeGameFlowStats,
  countLeadChangesAndTies,
  findStrictRuns,
  largestDeficitOvercomeByWinner,
  normalizeHistoryEvents,
  validateTimelineFinalScore,
  type HistoryEvent,
  type RawHistoryAction,
  type ScoreTimelinePoint,
} from "../src/lib/history/score-flow";

const HOME = "H";
const AWAY = "A";

function tl(
  rows: Array<{ h: number; a: number; pts: number; team: string; i?: number }>
): ScoreTimelinePoint[] {
  return rows.map((r, idx) => ({
    period: 1,
    clock: "11:00",
    elapsedGameTime: idx,
    homeScore: r.h,
    awayScore: r.a,
    margin: r.h - r.a,
    scoringTeamId: r.team,
    scorerId: "1",
    points: r.pts,
    eventIndex: r.i ?? idx,
  }));
}

// --- Lead changes ---
{
  const { leadChanges, ties } = countLeadChangesAndTies(
    tl([
      { h: 2, a: 0, pts: 2, team: HOME },
      { h: 2, a: 2, pts: 2, team: AWAY }, // tie
      { h: 2, a: 4, pts: 2, team: AWAY }, // away lead
    ])
  );
  assert.equal(leadChanges, 1, "home→tie→away = 1 lead change");
  assert.equal(ties, 1, "one tie after 0-0");
}

{
  const { leadChanges, ties } = countLeadChangesAndTies(
    tl([
      { h: 0, a: 2, pts: 2, team: AWAY },
      { h: 2, a: 2, pts: 2, team: HOME },
      { h: 4, a: 2, pts: 2, team: HOME },
    ])
  );
  assert.equal(leadChanges, 1, "away→tie→home = 1");
  assert.equal(ties, 1);
}

{
  const { leadChanges } = countLeadChangesAndTies(
    tl([
      { h: 2, a: 2, pts: 2, team: HOME }, // wait that's wrong - can't go to 2-2 from 0
    ])
  );
  // first scoring to tie impossible from 0; use tie→home:
  const r = countLeadChangesAndTies(
    tl([
      { h: 2, a: 0, pts: 2, team: HOME }, // actually start home
    ])
  );
  assert.equal(r.leadChanges, 0);
  void leadChanges;
}

{
  const { leadChanges, ties } = countLeadChangesAndTies(
    tl([
      { h: 2, a: 0, pts: 2, team: HOME },
      { h: 2, a: 2, pts: 2, team: AWAY },
      { h: 4, a: 2, pts: 2, team: HOME }, // home again — not a lead change vs last non-tie? last was H, then tie, then H → 0 changes after first
    ])
  );
  assert.equal(leadChanges, 0, "home→tie→home = 0 lead changes");
  assert.equal(ties, 1);
}

{
  const { ties } = countLeadChangesAndTies([]);
  assert.equal(ties, 0);
}

// --- Strict runs ---
{
  const runs = findStrictRuns(
    tl([
      { h: 2, a: 0, pts: 2, team: HOME },
      { h: 5, a: 0, pts: 3, team: HOME },
      { h: 7, a: 0, pts: 2, team: HOME },
      { h: 10, a: 0, pts: 3, team: HOME }, // 10-0
      { h: 10, a: 1, pts: 1, team: AWAY }, // FT ends
      { h: 12, a: 1, pts: 2, team: HOME },
    ]),
    { homeTeamId: HOME, awayTeamId: AWAY }
  );
  assert.equal(runs[0]!.points, 10, "10-0 strict run");
  assert.equal(runs[1]!.points, 1);
  assert.equal(runs[2]!.points, 2);
}

{
  const runs = findStrictRuns(
    tl([
      { h: 2, a: 0, pts: 2, team: HOME },
      { h: 2, a: 2, pts: 2, team: AWAY },
      { h: 4, a: 2, pts: 2, team: HOME },
    ]),
    { homeTeamId: HOME, awayTeamId: AWAY }
  );
  assert.ok(runs.every((r) => r.points === 2), "alternating = no multi-score run");
}

// --- Comebacks ---
{
  const timeline = tl([
    { h: 0, a: 20, pts: 20, team: AWAY },
    { h: 22, a: 20, pts: 22, team: HOME },
  ]);
  assert.equal(largestDeficitOvercomeByWinner(timeline, true), 20);
  // If we incorrectly treat away as winner, they trailed by 2 at the end state
  assert.equal(largestDeficitOvercomeByWinner(timeline, false), 2);
}

{
  const timeline = tl([
    { h: 0, a: 20, pts: 20, team: AWAY },
    { h: 10, a: 25, pts: 10, team: HOME },
  ]);
  // away wins, never trailed
  assert.equal(largestDeficitOvercomeByWinner(timeline, false), 0);
}

{
  assert.equal(largestDeficitOvercomeByWinner(tl([{ h: 2, a: 0, pts: 2, team: HOME }]), true), 0, "never trailed = 0");
}

// --- Normalize + validate from synthetic actions ---
{
  const actions: RawHistoryAction[] = [
    {
      actionNumber: 0,
      clock: "PT12M00.00S",
      period: 1,
      actionType: "period",
      subType: "start",
      description: "Start",
      scoreHome: "0",
      scoreAway: "0",
    },
    {
      actionNumber: 1,
      clock: "PT11M00.00S",
      period: 1,
      teamId: 1,
      personId: 10,
      actionType: "Made Shot",
      shotResult: "Made",
      shotValue: 2,
      scoreHome: "2",
      scoreAway: "0",
      description: "A 2 PTS",
    },
    {
      actionNumber: 2,
      clock: "PT10M00.00S",
      period: 1,
      teamId: 2,
      personId: 20,
      actionType: "Free Throw",
      scoreHome: "2",
      scoreAway: "1",
      description: "B Free Throw 1 of 1 (1 PTS)",
    },
  ];
  const events = normalizeHistoryEvents(actions, {
    homeTeamId: "1",
    awayTeamId: "2",
    gameId: "g",
  });
  const timeline = buildScoreTimeline(events, {
    homeTeamId: "1",
    awayTeamId: "2",
  });
  assert.equal(validateTimelineFinalScore(timeline, 2, 1), true);
  const flow = computeGameFlowStats(timeline, {
    homeTeamId: "1",
    awayTeamId: "2",
    winnerTeamId: "1",
  });
  assert.equal(flow.largestHomeLead, 2);
  assert.equal(flow.largestAwayLead, 0);
}

// Invalid timeline
{
  const fake: HistoryEvent[] = [
    {
      eventIndex: 0,
      period: 1,
      clock: "1:00",
      clockSeconds: 60,
      teamId: "1",
      playerId: "1",
      playerName: "x",
      eventType: "MADE_SHOT",
      description: "x",
      points: 2,
      homeScore: 99,
      awayScore: 99,
      assistPlayerId: null,
      secondaryPlayerId: null,
      sourceEventId: "1",
    },
  ];
  const timeline = buildScoreTimeline(fake, {
    homeTeamId: "1",
    awayTeamId: "2",
  });
  assert.equal(validateTimelineFinalScore(timeline, 100, 100), false);
}

console.log("test-p18a-score-flow: PASS");

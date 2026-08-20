/**
 * Unit fixtures for PBP-derived Game Flow fallback.
 *   npx tsx scripts/test-p18a2-game-flow-fallback.ts
 */
import assert from "node:assert/strict";
import { buildGameFlow } from "../src/analytics/game-lab";
import type { Game } from "../src/data/types";
import type { GamePlayByPlay, PlayByPlayEvent } from "../src/data/types/play-by-play";
import {
  alignGameWithPbpHomeAway,
  deriveQuarterScoresFromTimeline,
  resolveGameFlowTimeline,
  timelineFromPlayByPlayEvents,
} from "../src/lib/game-flow/resolve-score-timeline";
import { validateGamePresentation } from "../src/lib/game-presentation";

function ev(
  partial: Partial<PlayByPlayEvent> & {
    actionNumber: number;
    period: number;
    scoreHome: number;
    scoreAway: number;
  }
): PlayByPlayEvent {
  return {
    id: `g-${partial.actionNumber}`,
    gameId: "g",
    orderNumber: partial.actionNumber,
    clockSeconds: 600,
    clock: "10:00",
    actionType: partial.points && partial.points > 0 ? "2pt" : "rebound",
    subType: "",
    description: "play",
    teamId: "H",
    teamTricode: "HOM",
    playerId: "1",
    playerName: "A",
    shotResult: partial.points && partial.points > 0 ? "Made" : null,
    isFieldGoal: Boolean(partial.points && partial.points > 0),
    points: 0,
    ...partial,
  };
}

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: "g",
    season: "2025-26",
    gameDate: "2026-04-30",
    homeTeamId: "HOME",
    awayTeamId: "AWAY",
    homeScore: 110,
    awayScore: 98,
    gameType: "playoff",
    status: "final",
    ...overrides,
  };
}

function pbp(events: PlayByPlayEvent[]): GamePlayByPlay {
  return { gameId: "g", source: "sample", events };
}

// 1. valid linescore + valid PBP
{
  const g = game({
    homePeriodScores: [30, 28, 27, 25],
    awayPeriodScores: [22, 24, 26, 26],
  });
  const flow = buildGameFlow(
    g,
    pbp([
      ev({ actionNumber: 1, period: 1, scoreHome: 2, scoreAway: 0, points: 2 }),
      ev({
        actionNumber: 99,
        period: 4,
        scoreHome: 110,
        scoreAway: 98,
        points: 2,
      }),
    ])
  );
  assert.equal(flow.available, true);
  assert.equal(flow.scoreTimelineSource, "PROVIDER_LINESCORE");
  assert.equal(flow.periods.length, 4);
}

// 2. missing linescore + conserving PBP
{
  const events: PlayByPlayEvent[] = [];
  let h = 0;
  let a = 0;
  let n = 1;
  const score = (dh: number, da: number, period: number) => {
    h += dh;
    a += da;
    events.push(
      ev({
        actionNumber: n++,
        period,
        scoreHome: h,
        scoreAway: a,
        points: dh + da,
        teamId: dh > 0 ? "HOME" : "AWAY",
      })
    );
  };
  // Build exact 110-98 across 4 periods
  score(30, 20, 1);
  score(0, 5, 1);
  score(28, 24, 2);
  score(27, 26, 3);
  score(25, 23, 4);
  assert.equal(h, 110);
  assert.equal(a, 98);
  const resolved = resolveGameFlowTimeline({
    game: game(),
    playByPlay: pbp(events),
  });
  assert.equal(resolved.available, true);
  assert.equal(resolved.scoreTimelineSource, "PBP_DERIVED");
  assert.equal(resolved.quarterScoreSource, "PBP_DERIVED");
  assert.ok(resolved.flowStats);
  assert.equal(resolved.timeline.at(-1)?.homeScore, 110);
  assert.equal(resolved.timeline.at(-1)?.awayScore, 98);
}

// 3. missing linescore + nonconserving PBP
{
  const resolved = resolveGameFlowTimeline({
    game: game(),
    playByPlay: pbp([
      ev({ actionNumber: 1, period: 1, scoreHome: 2, scoreAway: 0, points: 2 }),
      ev({ actionNumber: 2, period: 4, scoreHome: 100, scoreAway: 90, points: 2 }),
    ]),
  });
  assert.equal(resolved.available, false);
  assert.equal(resolved.scoreTimelineSource, "UNAVAILABLE");
  assert.equal(resolved.internalReason, "PBP_SCORE_CONSERVATION_FAIL");
}

// 4. multiple OT
{
  const events: PlayByPlayEvent[] = [];
  let h = 100;
  let a = 100;
  let n = 1;
  events.push(
    ev({ actionNumber: n++, period: 4, scoreHome: 100, scoreAway: 100, points: 2 })
  );
  h = 105;
  a = 103;
  events.push(
    ev({ actionNumber: n++, period: 5, scoreHome: h, scoreAway: a, points: 5 })
  );
  h = 112;
  a = 110;
  events.push(
    ev({ actionNumber: n++, period: 6, scoreHome: h, scoreAway: a, points: 7 })
  );
  const resolved = resolveGameFlowTimeline({
    game: game({ homeScore: 112, awayScore: 110 }),
    playByPlay: pbp(events),
  });
  assert.equal(resolved.available, true);
  assert.ok(resolved.periods.length >= 5);
  assert.ok(resolved.periods.some((p) => p.label.startsWith("OT")));
}

// 5. free throws
{
  const resolved = resolveGameFlowTimeline({
    game: game({ homeScore: 3, awayScore: 0 }),
    playByPlay: pbp([
      ev({
        actionNumber: 1,
        period: 1,
        scoreHome: 1,
        scoreAway: 0,
        points: 1,
        actionType: "freethrow",
      }),
      ev({
        actionNumber: 2,
        period: 1,
        scoreHome: 2,
        scoreAway: 0,
        points: 1,
        actionType: "freethrow",
      }),
      ev({
        actionNumber: 3,
        period: 1,
        scoreHome: 3,
        scoreAway: 0,
        points: 1,
        actionType: "freethrow",
      }),
    ]),
  });
  assert.equal(resolved.available, true);
  assert.equal(resolved.timeline.length, 3);
}

// 6. score corrections (rewind then make)
{
  const tl = timelineFromPlayByPlayEvents(
    [
      ev({ actionNumber: 1, period: 1, scoreHome: 2, scoreAway: 0, points: 2 }),
      ev({ actionNumber: 2, period: 1, scoreHome: 0, scoreAway: 0, points: 0 }),
      ev({ actionNumber: 3, period: 1, scoreHome: 2, scoreAway: 0, points: 2 }),
    ],
    { homeTeamId: "HOME", awayTeamId: "AWAY" }
  );
  assert.equal(tl.at(-1)?.homeScore, 2);
}

// 7. same-clock scoring events
{
  const tl = timelineFromPlayByPlayEvents(
    [
      ev({
        actionNumber: 1,
        period: 1,
        clock: "8:00",
        clockSeconds: 480,
        scoreHome: 2,
        scoreAway: 0,
        points: 2,
      }),
      ev({
        actionNumber: 2,
        period: 1,
        clock: "8:00",
        clockSeconds: 480,
        scoreHome: 2,
        scoreAway: 3,
        points: 3,
      }),
    ],
    { homeTeamId: "HOME", awayTeamId: "AWAY" }
  );
  assert.equal(tl.length, 2);
  assert.equal(tl[1]!.awayScore, 3);
}

// 8–10. partial streams
{
  const buildThrough = (maxPeriod: number, finalH: number, finalA: number) => {
    const events: PlayByPlayEvent[] = [];
    let h = 0;
    let a = 0;
    let n = 1;
    for (let p = 1; p <= maxPeriod; p++) {
      h += 10;
      a += 8;
      events.push(
        ev({
          actionNumber: n++,
          period: p,
          scoreHome: h,
          scoreAway: a,
          points: 18,
        })
      );
    }
    return resolveGameFlowTimeline({
      game: game({
        homeScore: finalH,
        awayScore: finalA,
        status: maxPeriod < 4 ? "live" : "final",
      }),
      playByPlay: pbp(events),
      requireFinalConservation: maxPeriod >= 4,
    });
  };
  const q1 = buildThrough(1, 110, 98);
  assert.equal(q1.available, true);
  assert.ok(q1.timeline.length >= 1);
  const q3 = buildThrough(3, 110, 98);
  assert.equal(q3.available, true);
  const fin = buildThrough(4, 40, 32);
  assert.equal(fin.available, true);
  assert.equal(fin.scoreTimelineSource, "PBP_DERIVED");
}

// inverted box vs PBP
{
  const events = [
    ev({ actionNumber: 1, period: 1, scoreHome: 110, scoreAway: 98, points: 2 }),
  ];
  const inverted = game({ homeScore: 98, awayScore: 110 });
  const aligned = alignGameWithPbpHomeAway(inverted, pbp(events));
  assert.equal(aligned.homeScore, 110);
  assert.equal(aligned.awayScore, 98);
  const resolved = resolveGameFlowTimeline({
    game: inverted,
    playByPlay: pbp(events),
  });
  assert.equal(resolved.available, true);
  assert.equal(resolved.timeline.at(-1)?.homeScore, 98);
  assert.equal(resolved.timeline.at(-1)?.awayScore, 110);
}

// quarters from timeline
{
  const tl = timelineFromPlayByPlayEvents(
    [
      ev({ actionNumber: 1, period: 1, scoreHome: 25, scoreAway: 20, points: 5 }),
      ev({ actionNumber: 2, period: 2, scoreHome: 50, scoreAway: 44, points: 5 }),
      ev({ actionNumber: 3, period: 3, scoreHome: 80, scoreAway: 70, points: 5 }),
      ev({ actionNumber: 4, period: 4, scoreHome: 110, scoreAway: 98, points: 5 }),
    ],
    { homeTeamId: "HOME", awayTeamId: "AWAY" }
  );
  const q = deriveQuarterScoresFromTimeline(tl);
  assert.deepEqual(q?.home, [25, 25, 30, 30]);
  assert.deepEqual(q?.away, [20, 24, 26, 28]);
}

// integrity: malformed still impossible
{
  const v = validateGamePresentation({
    id: "x",
    season: "2025-26",
    gameDate: "2026-01-01",
    homeTeamId: "",
    awayTeamId: "",
    homeScore: 0,
    awayScore: 0,
    gameType: "regular",
    status: "final",
  });
  assert.equal(v.canRenderScoreHeader, false);
}

console.log("test-p18a2-game-flow-fallback: PASS");

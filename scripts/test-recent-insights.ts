/**
 * Recent Insights engine: game stories come from play logs that add up to the
 * final, and "above his norm" nights judge a player against his own season.
 *   npx tsx scripts/test-recent-insights.ts
 */
import assert from "node:assert/strict";
import type { ScoreTimelinePoint } from "../src/lib/history/score-flow";
import {
  buildAboveNormNights,
  buildRecentInsights,
  type PlayerBaseline,
  type SlateFlowPlay,
  type SlateGameFlow,
  type SlateGameInput,
  type SlatePlayerLine,
} from "../src/lib/recent-insights";
import { slateFlowFromTimeline } from "../src/lib/recent-insights-flow";

const game: SlateGameInput = {
  id: "g1",
  season: "2026-27",
  gameDate: "2026-10-05",
  homeTeamId: "H",
  awayTeamId: "A",
  homeTeamAbbr: "HOM",
  awayTeamAbbr: "AWY",
  homeScore: 110,
  awayScore: 104,
};

function line(
  profileId: string,
  stats: Partial<SlatePlayerLine>,
  baseline: PlayerBaseline | null
): SlatePlayerLine {
  return {
    gameId: "g1",
    gameDate: "2026-10-05",
    profileId,
    playerName: `Player ${profileId}`,
    teamId: "H",
    teamAbbr: "HOM",
    opponentAbbr: "AWY",
    homeAway: "home",
    result: "W",
    minutesNum: 30,
    points: 10,
    rebounds: 3,
    assists: 2,
    steals: 0,
    blocks: 0,
    turnovers: 1,
    fgm: 4,
    fga: 9,
    threePm: 1,
    threePa: 3,
    ftm: 1,
    fta: 2,
    ...stats,
    baseline,
  };
}

const base = (over: Partial<PlayerBaseline>): PlayerBaseline => ({
  season: "2025-26",
  games: 60,
  minutes: 14,
  points: 6,
  rebounds: 2,
  assists: 1,
  threePm: 0.5,
  ...over,
});

// Bench scorer far above his norm goes to the sidebar list, with the jump in the copy.
{
  const lines = [line("1", { points: 26, minutesNum: 31 }, base({ points: 8.2 }))];
  const nights = buildAboveNormNights({ games: [game], lines });
  const card = nights[0];
  assert.ok(card, "expected an above-norm night");
  assert.equal(card.category, "PLAYER · ABOVE HIS NORM");
  assert.equal(card.line?.surpriseStat, "points");
  assert.match(card.description, /18 more than his 8\.2 a game in 2025-26/);
  assert.match(card.description, /Played 31 minutes after averaging 14/);
  assert.equal(
    buildRecentInsights({ games: [game], lines }).filter((c) => c.focus === "surprise").length,
    0,
    "above-norm nights stay out of Recent Insights"
  );
}

// No baseline (rookie) or a thin one: no surprise, no guessed norm.
{
  const nights = buildAboveNormNights({
    games: [game],
    lines: [line("2", { points: 30 }, null), line("3", { points: 30 }, base({ games: 8 }))],
  });
  assert.equal(nights.length, 0);
}

// A star at his usual level is not a surprise, and the generic top-scorer card is gone.
{
  const lines = [line("4", { points: 31 }, base({ points: 27.5, minutes: 35 }))];
  assert.equal(buildAboveNormNights({ games: [game], lines }).length, 0);
  const out = buildRecentInsights({ games: [game], lines });
  assert.equal(out.filter((c) => c.category === "PLAYER · SCORING").length, 0);
}

// Defense and combined-points cards no longer exist.
{
  const out = buildRecentInsights({
    games: [{ ...game, homeScore: 140, awayScore: 132 }],
    lines: [line("5", { steals: 5, blocks: 3 }, base({}))],
  });
  assert.equal(out.filter((c) => c.focus === "stocks" || c.focus === "combined").length, 0);
}

type Step = [period: number, secondsLeft: number, side: "home" | "away", points: number, scorer?: string];

function flowOf(steps: Step[]): SlateGameFlow {
  let home = 0;
  let away = 0;
  const plays: SlateFlowPlay[] = steps.map(([period, left, side, points, scorer]) => {
    if (side === "home") home += points;
    else away += points;
    const t = (period - 1) * 720 + (720 - left);
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    return { t, period, clock, home, away, side, points, scorerId: scorer ?? null };
  });
  return { plays, periods: 4 };
}

function gameWith(flow: SlateGameFlow, id: string): SlateGameInput {
  const last = flow.plays.at(-1)!;
  return { ...game, id, homeScore: last.home, awayScore: last.away, flow };
}

/** Alternating baskets spread through the game so no run or lead swing stands out. */
function trade(n: number, from: number, to: number, a: Step[2], b: Step[2], pa: number, pb: number): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < n; i++) {
    const t = from + ((to - from) * i) / n;
    const period = Math.min(4, Math.floor(t / 720) + 1);
    const left = Math.max(1, Math.round(period * 720 - t));
    out.push([period, left, a, pa], [period, Math.max(1, left - 5), b, pb]);
  }
  return out;
}

// Winner climbed out of a 22-point hole: the card says when it was deepest.
{
  const flow = flowOf([...trade(20, 0, 1500, "away", "home", 3, 2), ...trade(15, 1500, 2870, "home", "away", 3, 1)]);
  const out = buildRecentInsights({ games: [gameWith(flow, "cb")], lines: [] });
  const card = out.find((c) => c.focus === "deficit");
  assert.ok(card, "expected a comeback card");
  assert.equal(card.hero?.value, "−22");
  assert.match(card.description, /HOM trailed by 22 with \d+:\d\d left in the (second|third) quarter and won by 10\./);
  assert.ok(card.game?.flow?.path.length, "comeback card carries the margin path");
  assert.equal(card.game?.flow?.mark?.kind, "point");
}

// Tie broken by the last basket with a reliable clock.
{
  const steps: Step[] = [...trade(40, 0, 2800, "home", "away", 2, 2), [4, 24, "home", 2, "9"]];
  const out = buildRecentInsights({
    games: [gameWith(flowOf(steps), "late")],
    lines: [{ ...line("9", { points: 2 }, null), gameId: "late" }],
  });
  const card = out.find((c) => c.focus === "late_winner");
  assert.ok(card, "expected a late winner");
  assert.equal(card.hero?.value, "0:24");
  assert.match(card.description, /^Player 9's basket broke a 80-80 tie with 0:24 left, and nobody scored again\. HOM won by 2\.$/);
}

// A stalled feed stamps late plays with one clock: the story drops the time.
{
  const timeline: ScoreTimelinePoint[] = [];
  let h = 0;
  let a = 0;
  const add = (t: number, side: "home" | "away", pts: number) => {
    if (side === "home") h += pts;
    else a += pts;
    timeline.push({
      period: Math.min(4, Math.floor(t / 720) + 1),
      clock: "",
      elapsedGameTime: t,
      homeScore: h,
      awayScore: a,
      margin: h - a,
      scoringTeamId: side === "home" ? "H" : "A",
      scorerId: null,
      points: pts,
      eventIndex: timeline.length,
    });
  };
  for (let i = 0; i < 40; i++) {
    add(i * 68, "home", 2);
    add(i * 68 + 30, "away", 2);
  }
  add(2880, "away", 3);
  add(2880, "home", 3);
  add(2880, "home", 2);
  const flow = slateFlowFromTimeline(timeline, { homeTeamId: "H", flipped: false, periods: 4, finalHome: h, finalAway: a });
  assert.ok(flow);
  assert.deepEqual(flow.plays.slice(-3).map((p) => p.clockKnown), [false, false, false]);
  assert.equal(flow.plays[0]!.clockKnown, undefined);
  const out = buildRecentInsights({ games: [gameWith(flow, "stall")], lines: [] });
  const card = out.find((c) => c.focus === "late_winner");
  assert.ok(card, "expected a late winner without a clock");
  assert.doesNotMatch(card.description, /left/);
  assert.equal(card.hero?.label, "Tied before the winner");
  assert.equal(card.hero?.value, "83-83");
  assert.equal(card.game?.flow?.mark?.label, "Winner");
}

// A 15-point quarter only counts when the log credits every one of his points.
{
  const steps: Step[] = [
    [1, 600, "home", 3, "7"],
    ...Array.from({ length: 5 }, (_, i): Step => [2, 600 - i * 60, "home", 3, "7"]),
    ...trade(10, 1500, 2870, "away", "home", 2, 2),
  ];
  const g = gameWith(flowOf(steps), "to");
  const p7 = (points: number) => ({ ...line("7", { points }, null), gameId: "to" });
  const hit = buildRecentInsights({ games: [g], lines: [p7(18)] }).find((c) => c.focus === "takeover");
  assert.ok(hit, "expected a takeover card");
  assert.equal(hit.hero?.value, "15");
  assert.equal(hit.hero?.label, "PTS in Q2");
  assert.deepEqual(hit.periodPoints, [3, 15, 0, 0]);
  const miss = buildRecentInsights({ games: [g], lines: [p7(20)] }).find((c) => c.focus === "takeover");
  assert.equal(miss, undefined, "log short of the box score: no takeover");
}

// Big quarter and hot shooting come from the line score and box score.
{
  const g: SlateGameInput = {
    ...game,
    id: "bq",
    homeScore: 130,
    awayScore: 110,
    homePeriodScores: [28, 47, 30, 25],
    awayPeriodScores: [30, 24, 28, 28],
  };
  const shooters = [7, 6, 5, 3].map((made, i) => ({
    ...line(`s${i}`, { threePm: made, threePa: made * 2 }, null),
    gameId: "bq",
  }));
  const quarter = buildRecentInsights({ games: [g], lines: [] }).find((c) => c.focus === "quarter");
  assert.equal(quarter?.hero?.value, "47");
  assert.match(quarter!.description, /HOM scored 47 in the second quarter and won it by 23\./);
  const threes = buildRecentInsights({
    games: [{ ...g, homePeriodScores: undefined, awayPeriodScores: undefined }],
    lines: shooters,
  }).find((c) => c.focus === "threes");
  assert.equal(threes?.hero?.value, "21");
  assert.deepEqual(threes?.contributors?.map((c) => c.value), [7, 6, 5, 3]);
}

// A quiet slate still fills six cards from real results, with stories ahead of fill.
{
  const quiet: SlateGameInput[] = Array.from({ length: 6 }, (_, i) => ({
    ...game,
    id: `q${i}`,
    homeScore: 110 + i,
    awayScore: 100,
    homePeriodScores: [28, 27, 28, 27 + i],
    awayPeriodScores: [25, 25, 25, 25],
  }));
  const out = buildRecentInsights({ games: quiet, lines: [] });
  assert.equal(out.length, 6);
  assert.match(out[0]!.description, /^Largest margin of victory/);
  assert.ok(out.slice(1).every((c) => /^HOM won by \d+\.$/.test(c.description)));
  const flowGame = gameWith(flowOf([...trade(14, 0, 2000, "home", "away", 3, 2), ...trade(6, 2000, 2870, "away", "home", 3, 2)]), "fl");
  const lead = buildRecentInsights({ games: [flowGame], lines: [] }).find((c) => c.focus === "lead");
  assert.ok(lead, "expected a biggest-lead card from the play log");
  assert.equal(lead.hero?.label, "Biggest lead");
  assert.match(lead.description, /^HOM led by as many as \d+ with \d+:\d\d left in the (third|fourth) quarter and won by \d+\.$/);
}

console.log("test-recent-insights: PASS");

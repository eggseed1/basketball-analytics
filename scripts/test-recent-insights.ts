/**
 * Recent Insights engine: surprise cards judge a night against the player's
 * own full-season norm and never fire without a real baseline.
 *   npx tsx scripts/test-recent-insights.ts
 */
import assert from "node:assert/strict";
import {
  buildRecentInsights,
  type PlayerBaseline,
  type SlateGameInput,
  type SlatePlayerLine,
} from "../src/lib/recent-insights";

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

// Bench scorer far above his norm becomes a surprise card with the jump in the copy.
{
  const out = buildRecentInsights({
    games: [game],
    lines: [line("1", { points: 26, minutesNum: 31 }, base({ points: 8.2 }))],
  });
  const card = out.find((c) => c.focus === "surprise");
  assert.ok(card, "expected a surprise card");
  assert.equal(card.category, "PLAYER · ABOVE HIS NORM");
  assert.equal(card.line?.surpriseStat, "points");
  assert.match(card.description, /18 more than his 8\.2 a game in 2025-26/);
  assert.match(card.description, /Played 31 minutes after averaging 14/);
}

// No baseline (rookie) or a thin one: no surprise, no guessed norm.
{
  const out = buildRecentInsights({
    games: [game],
    lines: [
      line("2", { points: 30 }, null),
      line("3", { points: 30 }, base({ games: 8 })),
    ],
  });
  assert.equal(out.filter((c) => c.focus === "surprise").length, 0);
}

// A star at his usual level is not a surprise, and the generic top-scorer card is gone.
{
  const out = buildRecentInsights({
    games: [game],
    lines: [line("4", { points: 31 }, base({ points: 27.5, minutes: 35 }))],
  });
  assert.equal(out.filter((c) => c.focus === "surprise").length, 0);
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

console.log("test-recent-insights: PASS");

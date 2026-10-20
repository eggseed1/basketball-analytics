/**
 * Finals MVP from the series box scores. The winner's best postseason line
 * in the Finals gets the trophy — same idea as the real vote.
 */

import type {
  GmBoxScore,
  GmLeagueState,
  GmPlayoffSeries,
  GmPlayer,
} from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";

function finalsBoxes(
  league: GmLeagueState,
  series: GmPlayoffSeries
): GmBoxScore[] {
  const ids = new Set([series.teamAId, series.teamBId]);
  return league.boxScores.filter(
    (box) =>
      box.postseason === "playoffs" &&
      ids.has(box.homeTeamId) &&
      ids.has(box.awayTeamId)
  );
}

function lineScore(line: GmBoxScore["players"][number]): number {
  return (
    line.points +
    line.rebounds * 0.75 +
    line.assists * 1.1 +
    line.steals * 1.4 +
    line.blocks * 1.3 -
    line.turnovers * 0.6
  );
}

export function pickFinalsMvp(
  league: GmLeagueState,
  series: GmPlayoffSeries
): GmPlayer | null {
  const championId = series.winnerId;
  if (!championId) return null;
  const boxes = finalsBoxes(league, series);
  const totals = new Map<
    string,
    { score: number; games: number; points: number; minutes: number }
  >();

  for (const box of boxes) {
    for (const line of box.players) {
      if (line.teamId !== championId) continue;
      if ((line.minutes ?? 0) < 1 && line.points < 1) continue;
      const prev = totals.get(line.playerId) ?? {
        score: 0,
        games: 0,
        points: 0,
        minutes: 0,
      };
      totals.set(line.playerId, {
        score: prev.score + lineScore(line),
        games: prev.games + 1,
        points: prev.points + line.points,
        minutes: prev.minutes + (line.minutes ?? 0),
      });
    }
  }

  let bestId: string | null = null;
  let best = -Infinity;
  for (const [playerId, row] of totals) {
    const per = row.games > 0 ? row.score / row.games : 0;
    const value = per * 10 + row.points * 0.15 + row.games;
    if (value > best) {
      best = value;
      bestId = playerId;
    }
  }

  if (bestId) {
    const player = league.players.find((row) => row.id === bestId);
    if (player) return player;
  }

  // No Finals boxes yet (edge case) — fall back to the champion's best overall.
  return (
    [...league.players]
      .filter((player) => player.teamId === championId)
      .sort((a, b) => overallOf(b) - overallOf(a))[0] ?? null
  );
}

export function buildChampionResult(
  league: GmLeagueState,
  series: GmPlayoffSeries
): NonNullable<GmLeagueState["champion"]> | null {
  if (!series.done || !series.winnerId) return null;
  const mvp = pickFinalsMvp(league, series);
  if (!mvp) return null;
  const wins =
    series.winnerId === series.teamAId ? series.winsA : series.winsB;
  const losses =
    series.winnerId === series.teamAId ? series.winsB : series.winsA;
  return {
    season: league.season,
    teamId: series.winnerId,
    finalsMvpId: mvp.id,
    wins,
    losses,
  };
}

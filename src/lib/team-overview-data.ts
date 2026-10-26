/**
 * Game-by-game team overview series from the bundled schedule snapshot.
 * Board-only helpers (DNA / strips / ladder) live in team-overview-board.ts
 * so the overview shell can avoid the 1.4MB game-snapshot parse.
 */

import type { GameSummary } from "@/data/types";
import {
  computeTeamMarginSplits,
  computeTeamMonthSplits,
  computeTeamSplits,
  teamSnapshotGames,
  type TeamSplitBucket,
} from "@/lib/team-snapshot-games";
import {
  ROLLING_WINDOW,
  type SeasonHighlight,
  type TrajectoryGame,
  type TrajectoryPhase,
} from "@/lib/team-overview-types";

export type { TraitBar } from "@/lib/team-overview-board";
export {
  buildLeagueStrips,
  buildNetLadder,
  buildTeamDna,
  traitBars,
} from "@/lib/team-overview-board";

function teamSide(game: GameSummary, teamId: string) {
  const home = game.homeTeamId === teamId;
  return {
    home,
    pf: home ? game.homeScore : game.awayScore,
    pa: home ? game.awayScore : game.homeScore,
    opponentId: home ? game.awayTeamId : game.homeTeamId,
    opponentAbbr: (home ? game.awayTeamAbbr : game.homeTeamAbbr) ?? "",
    pfPeriods: home ? game.homePeriodScores : game.awayPeriodScores,
    paPeriods: home ? game.awayPeriodScores : game.homePeriodScores,
  };
}

function phaseOf(game: GameSummary): TrajectoryPhase | null {
  if (game.gameType === "preseason") return null;
  if (game.gameType === "playoff") return "playoff";
  if (game.gameType === "play-in") return "play-in";
  if (game.cupChampionship) return null;
  return "regular";
}

/** Finals in date order (regular season, play-in, playoffs). Preseason and the Cup final are left out, matching the standings. */
export async function seasonFinals(
  teamId: string,
  season: string
): Promise<GameSummary[]> {
  return (await teamSnapshotGames(teamId, season))
    .filter(
      (g) =>
        g.status === "final" &&
        phaseOf(g) != null &&
        g.homeScore !== g.awayScore
    )
    .sort((a, b) =>
      (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate)
    );
}

export async function buildSeasonTrajectory(
  teamId: string,
  season: string
): Promise<TrajectoryGame[]> {
  const finals = await seasonFinals(teamId, season);
  const out: TrajectoryGame[] = [];
  let wins = 0;
  let losses = 0;
  finals.forEach((game, i) => {
    const side = teamSide(game, teamId);
    const phase = phaseOf(game)!;
    const margin = side.pf - side.pa;
    const win = margin > 0;
    if (phase === "regular") {
      if (win) wins += 1;
      else losses += 1;
    }
    const windowStart = Math.max(0, i - ROLLING_WINDOW + 1);
    const recent = [...out.slice(windowStart, i).map((g) => g.margin), margin];
    out.push({
      id: game.id,
      n: i + 1,
      date: game.gameDate,
      opponentId: side.opponentId,
      opponentAbbr: side.opponentAbbr,
      home: side.home,
      pf: side.pf,
      pa: side.pa,
      margin,
      win,
      overtime:
        (game.homePeriodScores?.length ?? 0) > 4 || (game.awayPeriodScores?.length ?? 0) > 4,
      phase,
      rolling: recent.reduce((a, b) => a + b, 0) / recent.length,
      overUnder: wins - losses,
      record: `${wins}-${losses}`,
    });
  });
  return out;
}

function longestRun(games: TrajectoryGame[], win: boolean): number {
  let best = 0;
  let run = 0;
  for (const g of games) {
    run = g.win === win ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export async function buildSeasonHighlights(teamId: string, season: string, games: TrajectoryGame[]): Promise<SeasonHighlight[]> {
  const regular = games.filter((g) => g.phase === "regular");
  if (!regular.length) return [];
  const out: SeasonHighlight[] = [];

  const winRun = longestRun(regular, true);
  const lossRun = longestRun(regular, false);
  if (winRun > 0) out.push({ id: "win-run", label: "Longest win streak", value: `${winRun} games` });
  if (lossRun > 0) out.push({ id: "loss-run", label: "Longest skid", value: `${lossRun} games` });

  const best = regular.reduce<TrajectoryGame | null>((m, g) => (g.win && (!m || g.margin > m.margin) ? g : m), null);
  if (best) {
    out.push({
      id: "best-win",
      label: "Biggest win",
      value: `+${best.margin}`,
      detail: `${best.home ? "vs" : "at"} ${best.opponentAbbr}, ${best.pf}-${best.pa}`,
      gameId: best.id,
    });
  }
  const worst = regular.reduce<TrajectoryGame | null>((m, g) => (!g.win && (!m || g.margin < m.margin) ? g : m), null);
  if (worst) {
    out.push({
      id: "worst-loss",
      label: "Worst loss",
      value: `${worst.margin}`,
      detail: `${worst.home ? "vs" : "at"} ${worst.opponentAbbr}, ${worst.pf}-${worst.pa}`,
      gameId: worst.id,
    });
  }

  const close = (await computeTeamMarginSplits(teamId, season)).find((b) => b.id === "close");
  if (close && close.games > 0) {
    out.push({ id: "close", label: "Within 5 points", value: `${close.wins}-${close.losses}`, detail: `${close.games} games` });
  }
  const ot = regular.filter((g) => g.overtime);
  if (ot.length) {
    const w = ot.filter((g) => g.win).length;
    out.push({ id: "ot", label: "Overtime", value: `${w}-${ot.length - w}` });
  }
  return out;
}

export type QuarterRow = {
  quarter: string;
  pf: number;
  pa: number;
  net: number;
};

/** Average points for and against by quarter over regular-season finals that have linescores. */
export async function buildQuarterProfile(
  teamId: string,
  season: string
): Promise<{ rows: QuarterRow[]; games: number }> {
  const finals = (await seasonFinals(teamId, season)).filter(
    (g) => phaseOf(g) === "regular"
  );
  const sums = [0, 1, 2, 3].map(() => ({ pf: 0, pa: 0 }));
  let games = 0;
  for (const game of finals) {
    const side = teamSide(game, teamId);
    const pfP = side.pfPeriods;
    const paP = side.paPeriods;
    if (!pfP || !paP || pfP.length < 4 || paP.length < 4) continue;
    games += 1;
    for (let q = 0; q < 4; q += 1) {
      sums[q]!.pf += pfP[q]!;
      sums[q]!.pa += paP[q]!;
    }
  }
  if (!games) return { rows: [], games: 0 };
  return {
    games,
    rows: sums.map((s, q) => ({
      quarter: `Q${q + 1}`,
      pf: s.pf / games,
      pa: s.pa / games,
      net: (s.pf - s.pa) / games,
    })),
  };
}

export type SplitsBundle = {
  home: TeamSplitBucket | null;
  away: TeamSplitBucket | null;
  close: TeamSplitBucket | null;
  blowout: TeamSplitBucket | null;
  months: TeamSplitBucket[];
};

export async function buildSplitsBundle(teamId: string, season: string): Promise<SplitsBundle> {
  const splits = await computeTeamSplits(teamId, season);
  const margins = await computeTeamMarginSplits(teamId, season);
  const pick = (rows: TeamSplitBucket[], id: string) => {
    const row = rows.find((r) => r.id === id);
    return row && row.games > 0 ? row : null;
  };
  return {
    home: pick(splits, "home"),
    away: pick(splits, "away"),
    close: pick(margins, "close"),
    blowout: pick(margins, "blowout"),
    months: (await computeTeamMonthSplits(teamId, season))
      .filter((m) => m.games > 0)
      .reverse(),
  };
}

export type UpcomingGame = {
  id: string;
  date: string;
  tipOffAt: string | null;
  opponentId: string;
  opponentAbbr: string;
  opponentName: string;
  home: boolean;
};

export type ScheduleFacts = {
  opener: UpcomingGame | null;
  daysUntilOpener: number | null;
  next: UpcomingGame[];
  regularGames: number;
  homeGames: number;
  backToBacks: number;
  longestRoadTrip: number;
};

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

export async function buildScheduleFacts(
  teamId: string,
  season: string,
  todayIso: string,
  count = 5
): Promise<ScheduleFacts> {
  const regular = (
    await teamSnapshotGames(teamId, season, { gameType: "regular" })
  )
    .filter((g) => !g.cupChampionship)
    .sort((a, b) =>
      (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate)
    );
  const toUpcoming = (g: GameSummary): UpcomingGame => {
    const side = teamSide(g, teamId);
    return {
      id: g.id,
      date: g.gameDate,
      tipOffAt: g.tipOffAt ?? null,
      opponentId: side.opponentId,
      opponentAbbr: side.opponentAbbr,
      opponentName: (side.home ? g.awayTeamName : g.homeTeamName) ?? side.opponentAbbr,
      home: side.home,
    };
  };
  const ahead = regular.filter((g) => g.gameDate >= todayIso && g.status !== "final").map(toUpcoming);
  const opener = regular[0] ? toUpcoming(regular[0]) : null;

  let backToBacks = 0;
  for (let i = 1; i < regular.length; i += 1) {
    if (dayNumber(regular[i]!.gameDate) - dayNumber(regular[i - 1]!.gameDate) === 1) backToBacks += 1;
  }
  let longestRoadTrip = 0;
  let trip = 0;
  for (const g of regular) {
    trip = g.awayTeamId === teamId ? trip + 1 : 0;
    longestRoadTrip = Math.max(longestRoadTrip, trip);
  }
  const daysUntilOpener = opener && opener.date >= todayIso ? dayNumber(opener.date) - dayNumber(todayIso) : null;

  return {
    opener,
    daysUntilOpener,
    next: ahead.slice(0, count),
    regularGames: regular.length,
    homeGames: regular.filter((g) => g.homeTeamId === teamId).length,
    backToBacks,
    longestRoadTrip,
  };
}

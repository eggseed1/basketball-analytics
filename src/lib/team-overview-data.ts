/**
 * Team overview visuals: game-by-game series from the bundled schedule
 * snapshot plus league-context shapes from the season board.
 * Missing inputs return empty series, never zero-filled ones.
 */

import type { TeamTrait } from "@/analytics";
import type { GameSummary, TeamSeasonStats } from "@/data/types";
import type { RankedMetric } from "@/lib/team-page-metrics";
import { ftRate } from "@/lib/team-page-metrics";
import {
  computeTeamMarginSplits,
  computeTeamMonthSplits,
  computeTeamSplits,
  teamSnapshotGames,
  type TeamSplitBucket,
} from "@/lib/team-snapshot-games";
import {
  ROLLING_WINDOW,
  type DnaAxis,
  type LadderRow,
  type LeagueStripData,
  type SeasonHighlight,
  type StripFormat,
  type TrajectoryGame,
  type TrajectoryPhase,
} from "@/lib/team-overview-types";

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
export function seasonFinals(teamId: string, season: string): GameSummary[] {
  return teamSnapshotGames(teamId, season)
    .filter((g) => g.status === "final" && phaseOf(g) != null && g.homeScore !== g.awayScore)
    .sort((a, b) => (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate));
}

export function buildSeasonTrajectory(teamId: string, season: string): TrajectoryGame[] {
  const finals = seasonFinals(teamId, season);
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

export function buildSeasonHighlights(teamId: string, season: string, games: TrajectoryGame[]): SeasonHighlight[] {
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

  const close = computeTeamMarginSplits(teamId, season).find((b) => b.id === "close");
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
export function buildQuarterProfile(teamId: string, season: string): { rows: QuarterRow[]; games: number } {
  const finals = seasonFinals(teamId, season).filter((g) => phaseOf(g) === "regular");
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

export function buildSplitsBundle(teamId: string, season: string): SplitsBundle {
  const splits = computeTeamSplits(teamId, season);
  const margins = computeTeamMarginSplits(teamId, season);
  const pick = (rows: TeamSplitBucket[], id: string) => {
    const row = rows.find((r) => r.id === id);
    return row && row.games > 0 ? row : null;
  };
  return {
    home: pick(splits, "home"),
    away: pick(splits, "away"),
    close: pick(margins, "close"),
    blowout: pick(margins, "blowout"),
    months: computeTeamMonthSplits(teamId, season)
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

export function buildScheduleFacts(teamId: string, season: string, todayIso: string, count = 5): ScheduleFacts {
  const regular = teamSnapshotGames(teamId, season, { gameType: "regular" })
    .filter((g) => !g.cupChampionship)
    .sort((a, b) => (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate));
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

const DNA_ORDER: Array<{ key: string; label: string; style?: boolean }> = [
  { key: "efg", label: "eFG%" },
  { key: "fg3", label: "3P%" },
  { key: "3par", label: "3PA rate", style: true },
  { key: "orb", label: "Off. reb%" },
  { key: "ftr", label: "FT rate", style: true },
  { key: "asttov", label: "AST/TO" },
  { key: "tov", label: "Ball security" },
  { key: "opp", label: "Opp PPG" },
  { key: "stl", label: "Steals" },
  { key: "blk", label: "Blocks" },
];

export function buildTeamDna(ranked: RankedMetric[]): DnaAxis[] {
  const byKey = new Map<string, RankedMetric>();
  for (const m of ranked) {
    if (!byKey.has(m.key) && m.missingReason == null && m.percentile != null) byKey.set(m.key, m);
  }
  return DNA_ORDER.flatMap(({ key, label, style }) => {
    const m = byKey.get(key);
    if (!m || m.percentile == null) return [];
    return [
      {
        key,
        label,
        percentile: Math.max(0, Math.min(100, m.percentile)),
        display: m.formattedValue,
        rankLine: m.rank != null && m.rankDenominator != null ? `${m.rank} of ${m.rankDenominator}` : "",
        style: Boolean(style),
      },
    ];
  });
}

type StripDef = {
  key: string;
  label: string;
  lowerIsBetter?: boolean;
  pick: (row: TeamSeasonStats) => number | null | undefined;
  format: StripFormat;
};

const STRIP_DEFS: StripDef[] = [
  { key: "diff", label: "Net points / game", pick: (r) => r.avgDiff, format: "signed" },
  { key: "ppg", label: "Points / game", pick: (r) => r.ppg, format: "num1" },
  { key: "opp", label: "Opp points / game", lowerIsBetter: true, pick: (r) => r.oppPpg, format: "num1" },
  { key: "efg", label: "Effective FG%", pick: (r) => r.effectiveFieldGoalPct, format: "pct" },
  { key: "tov", label: "Turnovers / game", lowerIsBetter: true, pick: (r) => r.topg, format: "num1" },
  { key: "orb", label: "Offensive reb%", pick: (r) => r.offensiveReboundPct, format: "pct" },
  { key: "ftr", label: "Free-throw rate", pick: (r) => ftRate(r), format: "pct" },
];

export function buildLeagueStrips(team: TeamSeasonStats, league: TeamSeasonStats[]): LeagueStripData[] {
  return STRIP_DEFS.flatMap((def) => {
    const points = league.flatMap((row) => {
      const v = def.pick(row);
      return v != null && Number.isFinite(v) ? [{ teamId: row.teamId, abbr: row.abbreviation, value: v }] : [];
    });
    const own = points.find((p) => p.teamId === team.teamId);
    if (!own || points.length < 2) return [];
    const better = points.filter((p) => (def.lowerIsBetter ? p.value < own.value : p.value > own.value)).length;
    return [
      {
        key: def.key,
        label: def.label,
        lowerIsBetter: Boolean(def.lowerIsBetter),
        points,
        team: own,
        average: points.reduce((a, p) => a + p.value, 0) / points.length,
        rank: better + 1,
        format: def.format,
      },
    ];
  });
}

export function buildNetLadder(league: TeamSeasonStats[]): LadderRow[] {
  return league
    .filter((r) => Number.isFinite(r.avgDiff))
    .map((r) => ({ teamId: r.teamId, abbr: r.abbreviation, conference: r.conference ?? "", net: r.avgDiff }))
    .sort((a, b) => b.net - a.net);
}

export type TraitBar = { id: string; label: string; display: string; percentile: number };

export function traitBars(traits: TeamTrait[]): TraitBar[] {
  return traits.map((t) => ({ id: t.id, label: t.label, display: t.display, percentile: t.percentile }));
}

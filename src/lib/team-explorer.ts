/**
 * Team Intelligence V2 helpers — assembly / presentation only.
 * Does not change analyzeTeamProfile methodology.
 */

import type { TeamTrait } from "@/analytics";
import { buildStatContext } from "@/analytics";
import type { GameSummary, PlayerSeason, TeamSeasonStats } from "@/data/types";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import type { StandingRow } from "@/data/types/standings";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { formatNumber, formatPct } from "@/lib/format";
import { isPreTipStatus } from "@/lib/game-status";
import type { TeamBrand } from "@/lib/nba-brand";
import { teamMatchIds, teamProfileHref } from "@/lib/team-identity";

export type TeamCoverageLevel = "full" | "partial" | "minimal";

export type TeamIdentityStatement = {
  id: string;
  band: "top5" | "top10" | "bottom10" | "bottom5";
  label: string;
  display: string;
  percentile: number;
  text: string;
};

export type TeamAskLink = {
  label: string;
  href: string;
  hint: string;
};

export type TeamRosterBuckets = {
  /** Highest minutes among rotation. */
  rotation: PlayerSeason[];
  /** Leading scorers (PPG). */
  leadingScorers: PlayerSeason[];
  /** Highest DARKO when present — otherwise empty (no invented value score). */
  highestValue: PlayerSeason[];
};

const TRAIT_PICKERS: Record<
  string,
  (t: TeamSeasonStats) => number
> = {
  diff: (t) => t.avgDiff,
  ts: (t) => t.trueShootingPct,
  efg: (t) => t.effectiveFieldGoalPct,
  fg3: (t) => t.threePointPct,
  "3par": (t) =>
    t.fieldGoalsAttempted > 0
      ? t.threePointersAttempted / t.fieldGoalsAttempted
      : 0,
  orb: (t) => t.offensiveReboundPct,
  asttov: (t) => t.assistToTurnover,
  tov: (t) => t.topg,
  opp: (t) => t.oppPpg,
  stl: (t) => t.spg,
  blk: (t) => t.bpg,
};

const PCT_TRAITS = new Set(["ts", "efg", "fg3", "3par", "orb"]);

/** Attach prior-season delta onto existing trait contexts (display only). */
export function enrichTraitsWithPrior(
  traits: TeamTrait[],
  team: TeamSeasonStats,
  prior: TeamSeasonStats | null
): TeamTrait[] {
  if (!prior) return traits;
  return traits.map((trait) => {
    const pick = TRAIT_PICKERS[trait.id];
    if (!pick) return trait;
    const from = pick(prior);
    const to = pick(team);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return trait;
    const delta = to - from;
    return {
      ...trait,
      context: buildStatContext({
        ...trait.context,
        vsPrior: delta,
      }),
    };
  });
}

/** Measurable identity lines — Top/Bottom bands from league percentiles. */
export function buildTeamIdentityStatements(
  traits: TeamTrait[],
  limit = 6
): TeamIdentityStatement[] {
  const out: TeamIdentityStatement[] = [];
  for (const t of traits) {
    const p = t.percentile;
    let band: TeamIdentityStatement["band"] | null = null;
    if (p >= 83.3) band = "top5";
    else if (p >= 66.7) band = "top10";
    else if (p <= 16.7) band = "bottom5";
    else if (p <= 33.3) band = "bottom10";
    if (!band) continue;
    const bandLabel =
      band === "top5"
        ? "Top 5"
        : band === "top10"
          ? "Top 10"
          : band === "bottom5"
            ? "Bottom 5"
            : "Bottom 10";
    out.push({
      id: t.id,
      band,
      label: t.label,
      display: t.display,
      percentile: p,
      text: `${bandLabel} in ${t.label} (${t.display}).`,
    });
  }
  // Prefer extremes first
  const rank = (b: TeamIdentityStatement["band"]) =>
    b === "top5" || b === "bottom5" ? 0 : 1;
  return out
    .sort(
      (a, b) =>
        rank(a.band) - rank(b.band) ||
        Math.abs(b.percentile - 50) - Math.abs(a.percentile - 50)
    )
    .slice(0, limit);
}

export function assessTeamCoverage(options: {
  hasTeamBoard: boolean;
  traitCount: number;
  rosterCount: number;
  gameCount: number;
  transactionCount: number;
}): {
  level: TeamCoverageLevel;
  lines: Array<{ label: string; status: "ok" | "partial" | "unavailable" }>;
} {
  const { hasTeamBoard, traitCount, rosterCount, gameCount, transactionCount } =
    options;
  const lines: Array<{
    label: string;
    status: "ok" | "partial" | "unavailable";
  }> = [
    {
      label: "Current season board",
      status: hasTeamBoard ? "ok" : "unavailable",
    },
    {
      label: "League-context traits",
      status: traitCount >= 6 ? "ok" : traitCount > 0 ? "partial" : "unavailable",
    },
    {
      label: "Roster rows",
      status: rosterCount >= 5 ? "ok" : rosterCount > 0 ? "partial" : "unavailable",
    },
    {
      label: "Recent games",
      status: gameCount > 0 ? "ok" : "unavailable",
    },
    {
      label: "Transaction events",
      status: transactionCount > 0 ? "ok" : "unavailable",
    },
    { label: "PBP / lineups", status: "unavailable" },
  ];

  let level: TeamCoverageLevel = "minimal";
  if (hasTeamBoard && traitCount >= 4 && rosterCount >= 5) level = "full";
  else if (hasTeamBoard && traitCount > 0) level = "partial";

  return { level, lines };
}

export function formatTraitPriorDelta(
  traitId: string,
  vsPrior: number
): string {
  if (PCT_TRAITS.has(traitId)) {
    return `${vsPrior >= 0 ? "+" : ""}${(vsPrior * 100).toFixed(1)} pts vs prior`;
  }
  if (traitId === "asttov") {
    return `${vsPrior >= 0 ? "+" : ""}${formatNumber(vsPrior, 2)} vs prior`;
  }
  return `${vsPrior >= 0 ? "+" : ""}${formatNumber(vsPrior, 1)} vs prior`;
}

export function teamIdsForMatch(
  team: TeamSeasonStats,
  brand?: TeamBrand | null
): Set<string> {
  const ids = new Set<string>();
  ids.add(team.teamId);
  if (brand?.espnTeamId) ids.add(brand.espnTeamId);
  if (brand?.id) ids.add(brand.id);
  // Include BDL schedule ids so historical game rows match the same franchise.
  const resolved = resolveCanonicalTeam(team.teamId);
  if (resolved.status === "resolved") {
    for (const id of teamMatchIds(resolved.team)) ids.add(id);
  } else if (brand?.espnTeamId) {
    const byBrand = resolveCanonicalTeam(brand.espnTeamId);
    if (byBrand.status === "resolved") {
      for (const id of teamMatchIds(byBrand.team)) ids.add(id);
    }
  }
  return ids;
}

export function teamAbbrsForMatch(
  team: TeamSeasonStats,
  brand?: TeamBrand | null
): Set<string> {
  const abbrs = new Set<string>();
  abbrs.add(team.abbreviation.toLowerCase());
  if (brand?.abbr) abbrs.add(brand.abbr.toLowerCase());
  return abbrs;
}

export function gameInvolvesTeam(
  game: GameSummary,
  team: TeamSeasonStats,
  brand?: TeamBrand | null
): boolean {
  const ids = teamIdsForMatch(team, brand);
  if (ids.has(game.homeTeamId) || ids.has(game.awayTeamId)) return true;
  // Optional provider ids when historical rows are normalized (forward-compatible).
  const homeProvider = (game as { homeProviderTeamId?: string })
    .homeProviderTeamId;
  const awayProvider = (game as { awayProviderTeamId?: string })
    .awayProviderTeamId;
  if (
    (homeProvider && ids.has(homeProvider)) ||
    (awayProvider && ids.has(awayProvider))
  ) {
    return true;
  }
  const abbrs = teamAbbrsForMatch(team, brand);
  if (game.homeTeamAbbr && abbrs.has(game.homeTeamAbbr.toLowerCase())) {
    return true;
  }
  if (game.awayTeamAbbr && abbrs.has(game.awayTeamAbbr.toLowerCase())) {
    return true;
  }
  return false;
}

export function filterTeamGames(
  games: GameSummary[],
  team: TeamSeasonStats,
  brand: TeamBrand | null | undefined,
  limit: number
): GameSummary[] {
  return games
    .filter((g) => gameInvolvesTeam(g, team, brand))
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? b.id.localeCompare(a.id)
        : b.gameDate.localeCompare(a.gameDate)
    )
    .slice(0, limit);
}

export function findStandingRow(
  rows: StandingRow[],
  team: TeamSeasonStats,
  brand?: TeamBrand | null
): StandingRow | null {
  const ids = teamIdsForMatch(team, brand);
  const abbrs = teamAbbrsForMatch(team, brand);
  return (
    rows.find(
      (r) =>
        ids.has(r.teamId) || abbrs.has(r.abbreviation.toLowerCase())
    ) ?? null
  );
}

export function buildRosterBuckets(
  roster: PlayerSeason[],
  options?: { rotationLimit?: number; listLimit?: number }
): TeamRosterBuckets {
  const rotationLimit = options?.rotationLimit ?? 8;
  const listLimit = options?.listLimit ?? 5;
  const byMinutes = [...roster].sort((a, b) => b.minutes - a.minutes);
  const byPpg = [...roster].sort(
    (a, b) =>
      b.points / Math.max(1, b.gamesPlayed) -
      a.points / Math.max(1, a.gamesPlayed)
  );
  const withDarko = roster.filter(
    (p) => p.darkoDpm != null && Number.isFinite(p.darkoDpm)
  );
  const byDarko = [...withDarko].sort(
    (a, b) => (b.darkoDpm ?? 0) - (a.darkoDpm ?? 0)
  );

  return {
    rotation: byMinutes.slice(0, rotationLimit),
    leadingScorers: byPpg.slice(0, listLimit),
    highestValue: byDarko.slice(0, listLimit),
  };
}

export function askDrblTeamHref(query: string, teamId?: string): string {
  const params = new URLSearchParams();
  params.set("q", query);
  if (teamId) params.set("teamId", teamId);
  return `/ask?${params.toString()}`;
}

/** Supported ASK examples only — team season board + offseason + compare. */
export function buildTeamAskLinks(
  teamName: string,
  season: string,
  teamId?: string,
  priorSeason?: string
): TeamAskLink[] {
  const links: TeamAskLink[] = [
    {
      label: `${teamName} point differential`,
      href: askDrblTeamHref(
        `${teamName} point differential ${season}`,
        teamId
      ),
      hint: "Team season board · scoring margin",
    },
    {
      label: `${teamName} true shooting`,
      href: askDrblTeamHref(`${teamName} true shooting ${season}`, teamId),
      hint: "Team efficiency",
    },
    {
      label: `${teamName} eFG%`,
      href: askDrblTeamHref(`${teamName} eFG ${season}`, teamId),
      hint: "Team shot-making",
    },
    {
      label: `${teamName} offseason`,
      href: askDrblTeamHref(`${teamName} offseason`, teamId),
      hint: "ESPN transaction events",
    },
  ];
  if (priorSeason && priorSeason !== season) {
    links.splice(3, 0, {
      label: `Compare ${priorSeason} and ${season}`,
      href: askDrblTeamHref(
        `Compare ${teamName}'s ${priorSeason} and ${season} seasons`,
        teamId
      ),
      hint: "Team season compare methodology",
    });
  }
  links.push({
    label: `Rank ${teamName} seasons`,
    href: askDrblTeamHref(
      `Which was ${teamName}'s best season?`,
      teamId
    ),
    hint: "Team Season Ranking methodology",
  });
  links.push({
    label: `${teamName} biggest wins ${season}`,
    href: askDrblTeamHref(
      `What were ${teamName}'s biggest wins in ${season}?`,
      teamId
    ),
    hint: "Season evidence · schedule scores → Game Lab",
  });
  return links;
}

export function formatTeamGameScoreLine(
  game: GameSummary,
  team: TeamSeasonStats,
  brand?: TeamBrand | null
): { result: "W" | "L" | "—"; teamScore: number; oppScore: number; oppLabel: string } {
  const ids = teamIdsForMatch(team, brand);
  const abbrs = teamAbbrsForMatch(team, brand);
  const isHome =
    ids.has(game.homeTeamId) ||
    (!!game.homeTeamAbbr && abbrs.has(game.homeTeamAbbr.toLowerCase()));
  const teamScore = isHome ? game.homeScore : game.awayScore;
  const oppScore = isHome ? game.awayScore : game.homeScore;
  const oppLabel = isHome
    ? game.awayTeamAbbr ?? game.awayTeamName ?? "OPP"
    : game.homeTeamAbbr ?? game.homeTeamName ?? "OPP";
  if (game.status === "scheduled" || isPreTipStatus(game.status) || (teamScore === 0 && oppScore === 0 && game.status !== "final")) {
    return { result: "—", teamScore, oppScore, oppLabel };
  }
  if (teamScore === oppScore) {
    return { result: "—", teamScore, oppScore, oppLabel };
  }
  return {
    result: teamScore > oppScore ? "W" : "L",
    teamScore,
    oppScore,
    oppLabel,
  };
}

export function notableTeamGames(
  games: GameSummary[],
  team: TeamSeasonStats,
  brand?: TeamBrand | null,
  seasonAvgPpg?: number | null
): Array<{ kind: string; label: string; detail: string; game: GameSummary }> {
  const finals = games.filter(
    (g) =>
      gameInvolvesTeam(g, team, brand) &&
      (g.status === "final" || g.homeScore + g.awayScore > 0)
  );
  if (finals.length < 2) return [];

  const withMargin = finals.map((g) => {
    const line = formatTeamGameScoreLine(g, team, brand);
    return { game: g, line, margin: line.teamScore - line.oppScore };
  });

  const biggestWin = [...withMargin]
    .filter((x) => x.margin > 0)
    .sort((a, b) => b.margin - a.margin)[0];
  const biggestLoss = [...withMargin]
    .filter((x) => x.margin < 0)
    .sort((a, b) => a.margin - b.margin)[0];
  const highestScoring = [...withMargin].sort(
    (a, b) => b.line.teamScore - a.line.teamScore
  )[0];

  const out: Array<{
    kind: string;
    label: string;
    detail: string;
    game: GameSummary;
  }> = [];

  if (biggestWin) {
    out.push({
      kind: "biggest_win",
      label: "Largest win",
      detail: `+${biggestWin.margin} vs ${biggestWin.line.oppLabel}`,
      game: biggestWin.game,
    });
  }
  if (biggestLoss) {
    out.push({
      kind: "biggest_loss",
      label: "Largest loss",
      detail: `${biggestLoss.margin} vs ${biggestLoss.line.oppLabel}`,
      game: biggestLoss.game,
    });
  }
  if (highestScoring) {
    out.push({
      kind: "highest_scoring",
      label: "Highest team score",
      detail: `${highestScoring.line.teamScore} pts`,
      game: highestScoring.game,
    });
  }
  if (seasonAvgPpg != null && Number.isFinite(seasonAvgPpg) && highestScoring) {
    const delta = highestScoring.line.teamScore - seasonAvgPpg;
    if (Math.abs(delta) >= 8) {
      out.push({
        kind: "vs_avg",
        label: "Furthest from season PPG",
        detail: `${highestScoring.line.teamScore} (${delta >= 0 ? "+" : ""}${formatNumber(delta, 1)} vs avg)`,
        game: highestScoring.game,
      });
    }
  }

  const seen = new Set<string>();
  return out.filter((n) => {
    if (seen.has(n.game.id)) return false;
    seen.add(n.game.id);
    return true;
  });
}

/** Group traits for Performance section — no invented overall composite. */
export function groupTraitsForPerformance(traits: TeamTrait[]): {
  overall: TeamTrait[];
  offense: TeamTrait[];
  defense: TeamTrait[];
  efficiency: TeamTrait[];
} {
  const byId = new Map(traits.map((t) => [t.id, t]));
  const pick = (...ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is TeamTrait => t != null);

  return {
    overall: pick("diff"),
    offense: pick("3par", "orb", "asttov", "tov"),
    defense: pick("opp", "stl", "blk"),
    efficiency: pick("ts", "efg", "fg3"),
  };
}

export function resolveTeamFromBoard(
  rows: TeamSeasonStats[],
  key: string
): TeamSeasonStats | undefined {
  const needle = key.trim().toLowerCase();
  const direct = rows.find(
    (t) =>
      t.teamId === key ||
      t.abbreviation.toLowerCase() === needle ||
      t.fullName.toLowerCase() === needle
  );
  if (direct) return direct;

  const resolved = resolveCanonicalTeam(key);
  if (resolved.status !== "resolved") return undefined;
  const canonical = resolved.team;
  // Board rows use canonical ESPN team ids (and abbrs) — never match bare
  // teamId against a BDL provider id (ESPN 25 = OKC ≠ BDL 25 = POR).
  return rows.find(
    (t) =>
      t.teamId === canonical.canonicalTeamId ||
      t.abbreviation.toUpperCase() === canonical.abbr
  );
}

/** Transaction ESPN team id for offseason filters. */
export function transactionTeamFilterId(
  team: TeamSeasonStats,
  brand?: TeamBrand | null
): string {
  const resolved = resolveCanonicalTeam(brand?.espnTeamId ?? team.teamId);
  if (resolved.status === "resolved") return resolved.team.canonicalTeamId;
  return brand?.espnTeamId ?? team.teamId;
}

export function seasonChipHref(teamKey: string, season: string): string {
  return teamProfileHref(teamKey, season);
}

/** Display-only: keep unused import honest for formatPct in tests/docs. */
export function formatTeamBoardPpg(ppg: number): string {
  return formatNumber(ppg, 1);
}

export function formatTeamBoardTs(ts: number): string {
  return formatPct(ts);
}

export type { NbaTransactionEvent };

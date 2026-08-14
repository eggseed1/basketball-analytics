/**
 * Trusted ASK DRBL executor — only calls existing query / analytics modules.
 */

import {
  CAREER_RESUME_MIN_GAMES,
  computeCareerResume,
  formatCpi,
  isCareerQualifyingSeason,
  seasonComparePath,
  seasonRankPath,
} from "@/analytics";
import { careerProductionIndex } from "@/analytics/career-resume";
import { getGameAnalysis } from "@/data/queries/game-lab";
import { getFilteredGames, getRecentGameSummaries } from "@/data/queries/games";
import {
  getFilteredPlayerSeasons,
  getPlayer,
  getPlayerCareerSeasons,
} from "@/data/queries/players";
import { getPlayerSeasonComparison } from "@/data/queries/player-season-compare";
import { getPlayerSeasonRanking } from "@/data/queries/player-season-rank";
import {
  getOffseasonPulse,
  getTeamOffseasonActivity,
  listTransactionEvents,
  currentOffseasonLabelYear,
} from "@/data/queries/offseason-tracker";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { PlayerSeason } from "@/data/types";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { metricById } from "./metrics";
import { metricSeasonAvailability, coverageForMetric } from "./coverage";
import { buildQueryPlan } from "./followups";
import type {
  AskDrblResult,
  AskMetricId,
  BasketballQueryAst,
} from "./types";
import { ASK_DRBL_VERSION } from "./types";

function perGame(total: number, gp: number): number {
  return total / Math.max(1, gp);
}

function readPlayerMetric(
  row: PlayerSeason,
  metricId: AskMetricId
): number | null {
  switch (metricId) {
    case "ppg":
    case "points":
      return perGame(row.points, row.gamesPlayed);
    case "rpg":
    case "rebounds":
      return perGame(row.rebounds, row.gamesPlayed);
    case "apg":
    case "assists":
      return perGame(row.assists, row.gamesPlayed);
    case "spg":
      return perGame(row.steals, row.gamesPlayed);
    case "bpg":
      return perGame(row.blocks, row.gamesPlayed);
    case "tov":
      return perGame(row.turnovers, row.gamesPlayed);
    case "mpg":
      return perGame(row.minutes, row.gamesPlayed);
    case "fg_pct":
      return row.fieldGoalPct > 0 ? row.fieldGoalPct : null;
    case "fg3_pct":
      return row.threePointPct > 0 ? row.threePointPct : null;
    case "ft_pct":
      return row.freeThrowPct > 0 ? row.freeThrowPct : null;
    case "ts_pct":
      return row.trueShootingPct > 0 ? row.trueShootingPct : null;
    case "efg_pct":
      return row.effectiveFieldGoalPct > 0 ? row.effectiveFieldGoalPct : null;
    case "usg_pct":
      return row.usagePct > 0 ? row.usagePct : null;
    case "darko":
      return row.darkoDpm ?? null;
    case "lebron":
      return row.lebron ?? null;
    case "cpi":
      return careerProductionIndex(row);
    default:
      return null;
  }
}

function formatMetric(metricId: AskMetricId, value: number): string {
  const def = metricById(metricId);
  if (!def) return formatNumber(value, 2);
  if (def.format === "pct") return formatPct(value);
  if (def.format === "impact") return formatNumber(value, 2);
  if (def.format === "per_game") return formatNumber(value, 1);
  return formatNumber(value, 1);
}

function emptyResult(
  ast: BasketballQueryAst,
  status: AskDrblResult["status"],
  errors: string[]
): AskDrblResult {
  return {
    status,
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [
      ...ast.interpretation,
      ...(ast.seasonNotes ?? []),
    ],
    errors,
    limitations: ast.unsupportedReason ? [ast.unsupportedReason] : undefined,
    queryPlan: buildQueryPlan(ast),
  };
}

function sourceForPlayerMetric(metricId: AskMetricId, season: string): string {
  const cov = coverageForMetric(metricId);
  if (metricId === "darko" || metricId === "lebron") {
    return cov?.sourceLabel ?? "Verified historical impact data";
  }
  if (metricId === "cpi") return "Career Resume (CPI)";
  return `${season} Player Season Board`;
}

export async function executeBasketballQuery(
  ast: BasketballQueryAst
): Promise<AskDrblResult> {
  switch (ast.operation) {
    case "season_stat":
      return execSeasonStat(ast);
    case "team_season_stat":
      return execTeamSeasonStat(ast);
    case "leaderboard":
      return execLeaderboard(ast);
    case "season_compare":
      return execSeasonCompare(ast);
    case "season_rank":
      return execSeasonRank(ast);
    case "career_resume":
      return execCareerResume(ast);
    case "game_lab":
      return execGameLab(ast);
    case "box_score_context":
      return execGameLab(ast); // best-effort via game lab + scoring note
    case "offseason_summary":
      return execOffseason(ast);
    default:
      return emptyResult(ast, "invalid", ["Unknown operation."]);
  }
}

async function execSeasonStat(ast: BasketballQueryAst): Promise<AskDrblResult> {
  const player = ast.entities.find((e) => e.kind === "player");
  const season = ast.when?.seasons?.[0];
  const metricId = ast.metricId;
  if (!player?.id || !season || !metricId) {
    return emptyResult(ast, "invalid", ["Missing player, season, or metric."]);
  }

  const availability = metricSeasonAvailability(metricId, season);
  if (!availability.ok) {
    return {
      ...emptyResult(ast, "no_result", [availability.message]),
      headline: "Not available for that season",
      interpretation: [
        player.name ?? player.id,
        season,
        metricById(metricId)?.label ?? metricId,
      ],
      limitations: [availability.message],
      links: [{ label: "Explore player →", href: `/players/${player.id}` }],
    };
  }

  const career = await getPlayerCareerSeasons(player.id);
  const row =
    career.find((r) => r.season === season) ??
    (await getFilteredPlayerSeasons({ season, player: player.id }))[0];

  if (!row) {
    return {
      ...emptyResult(ast, "no_result", [
        `No qualifying season row for ${player.name ?? player.id} in ${season}.`,
      ]),
      interpretation: [
        player.name ?? player.id,
        season,
        metricById(metricId)?.label ?? metricId,
      ],
      links: [{ label: "View player →", href: `/players/${player.id}` }],
    };
  }

  const value = readPlayerMetric(row, metricId);
  if (value == null || !Number.isFinite(value)) {
    const cov = coverageForMetric(metricId);
    return {
      ...emptyResult(ast, "insufficient_data", [
        `${metricById(metricId)?.label ?? metricId} is not available for this season row.`,
      ]),
      interpretation: [row.playerName, season, metricById(metricId)?.label ?? metricId],
      limitations: [
        cov?.notes ??
          "The board row exists but this metric does not meet ASK DRBL’s reliability threshold for this season.",
      ],
      links: [
        {
          label: "View player →",
          href: `/players/${player.id}?season=${encodeURIComponent(season)}`,
        },
      ],
    };
  }

  const def = metricById(metricId)!;
  const contextLines = [
    `${row.gamesPlayed} GP · ${formatNumber(perGame(row.minutes, row.gamesPlayed), 1)} MPG`,
    `Team: ${row.teamName}`,
  ];
  if (metricId === "ts_pct") {
    contextLines.push(
      `FG% ${formatPct(row.fieldGoalPct)} · 3P% ${formatPct(row.threePointPct)} · FT% ${formatPct(row.freeThrowPct)}`
    );
    if (row.usagePct > 0) contextLines.push(`USG% ${formatPct(row.usagePct)}`);
  }

  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [
      row.playerName,
      season,
      def.label,
      ...(ast.seasonNotes ?? []),
    ],
    queryPlan: buildQueryPlan(ast),
    headline: `${row.playerName} · ${def.label} · ${season}`,
    valueDisplay: formatMetric(metricId, value),
    detailLines: contextLines,
    contextLines,
    methodology: [
      `Metric: ${def.label} from the player-season board.`,
      "Counting rates use season totals ÷ games played.",
      ...(def.learnHref ? [`How is this calculated? See methodology.`] : []),
    ],
    source: sourceForPlayerMetric(metricId, season),
    limitations: [
      "ASK DRBL answers from existing season boards — not possession-level DRBL.",
    ],
    links: [
      {
        label: "Explore player →",
        href: `/players/${player.id}?season=${encodeURIComponent(season)}`,
      },
      ...(def.learnHref
        ? [{ label: `What is ${def.label}?`, href: def.learnHref }]
        : []),
    ],
  };
}

async function execTeamSeasonStat(
  ast: BasketballQueryAst
): Promise<AskDrblResult> {
  const team = ast.entities.find((e) => e.kind === "team");
  const season = ast.when?.seasons?.[0];
  const metricId = ast.metricId ?? "team_diff";
  if (!team?.id || !season) {
    return emptyResult(ast, "invalid", ["Missing team or season."]);
  }

  const board = await getTeamSeasonStats(season);
  const brand = resolveTeamBrand(team.id) ?? resolveTeamBrand(team.name);
  const row =
    board.find(
      (r) =>
        r.teamId === team.id ||
        (brand &&
          (r.abbreviation.toLowerCase() === brand.abbr.toLowerCase() ||
            r.teamId === brand.espnTeamId ||
            r.teamId === brand.id))
    ) ?? null;

  if (!row) {
    return emptyResult(ast, "no_result", [
      `No team-season board row for ${team.name ?? team.id} in ${season}.`,
    ]);
  }

  const value = (() => {
    switch (metricId) {
      case "team_ppg":
      case "ppg":
        return row.ppg;
      case "team_opp_ppg":
        return row.oppPpg;
      case "team_diff":
        return row.avgDiff;
      case "team_efg":
      case "efg_pct":
        return row.effectiveFieldGoalPct;
      case "team_ts":
      case "ts_pct":
        return row.trueShootingPct;
      case "team_fg3":
      case "fg3_pct":
        return row.threePointPct;
      case "team_tov":
      case "tov":
        return row.topg;
      case "team_rpg":
      case "rpg":
        return row.rpg;
      case "fg_pct":
        return row.fieldGoalPct;
      case "ft_pct":
        return row.freeThrowPct;
      default:
        return null;
    }
  })();

  if (value == null || !Number.isFinite(value)) {
    return emptyResult(ast, "insufficient_data", [
      "That team metric is not available on the season board.",
    ]);
  }

  const def = metricById(metricId) ?? metricById("team_diff")!;
  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [
      row.fullName,
      `${season} regular season`,
      def.label,
      ...(ast.seasonNotes ?? []),
    ],
    headline: `${row.fullName} · ${def.label} · ${season}`,
    valueDisplay: formatMetric(metricId, value),
    detailLines: [
      `${row.gamesPlayed} GP`,
      `PPG ${formatNumber(row.ppg, 1)} · Opp ${formatNumber(row.oppPpg, 1)} · Diff ${row.avgDiff >= 0 ? "+" : ""}${formatNumber(row.avgDiff, 1)}`,
    ],
    methodology: [`Team-season board · ${def.label}.`],
    source: `${season} Team Season Board`,
    queryPlan: buildQueryPlan(ast),
    links: [
      {
        label: "View team →",
        href: `/teams/${brand?.id ?? row.teamId}?season=${encodeURIComponent(season)}`,
      },
      {
        label: "Team leaderboard →",
        href: `/explore/teams?season=${encodeURIComponent(season)}`,
      },
    ],
  };
}

async function execLeaderboard(ast: BasketballQueryAst): Promise<AskDrblResult> {
  const season = ast.when?.seasons?.[0];
  const metricId = ast.metricId;
  if (!season || !metricId) {
    return emptyResult(ast, "invalid", ["Missing season or metric."]);
  }

  const rows = await getFilteredPlayerSeasons({
    season,
    minimumGames: 20,
    minimumMinutes: 500,
  });
  if (!rows.length) {
    return emptyResult(ast, "no_result", [
      `No qualifying players found for ${season}.`,
    ]);
  }

  const scored = rows
    .map((r) => ({ r, v: readPlayerMetric(r, metricId) }))
    .filter((x) => x.v != null && Number.isFinite(x.v!))
    .sort((a, b) => (b.v as number) - (a.v as number));

  if (!scored.length) {
    return emptyResult(ast, "insufficient_data", [
      `${metricById(metricId)?.label ?? metricId} is missing for the ${season} board.`,
    ]);
  }

  const top = scored.slice(0, 5);
  const def = metricById(metricId)!;
  const leader = top[0]!;

  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [
      "NBA leaderboard",
      season,
      def.label,
      "Qualified: ≥20 GP and ≥500 minutes",
      ...(ast.seasonNotes ?? []),
    ],
    headline: `${def.label} leaders · ${season}`,
    valueDisplay: `${leader.r.playerName} · ${formatMetric(metricId, leader.v as number)}`,
    detailLines: top.map(
      (t, i) =>
        `${i + 1}. ${t.r.playerName} — ${formatMetric(metricId, t.v as number)}`
    ),
    methodology: [
      "Existing player-season board with minimumGames=20 and minimumMinutes=500.",
    ],
    source: `${season} Player Season Board`,
    queryPlan: buildQueryPlan(ast),
    links: [
      {
        label: "Open leaderboard →",
        href: `/explore/players?season=${encodeURIComponent(season)}`,
      },
      {
        label: "View leader →",
        href: `/players/${leader.r.playerId}?season=${encodeURIComponent(season)}`,
      },
      ...(def.learnHref
        ? [{ label: `What is ${def.label}?`, href: def.learnHref }]
        : []),
    ],
  };
}

async function execSeasonCompare(
  ast: BasketballQueryAst
): Promise<AskDrblResult> {
  const player = ast.entities.find((e) => e.kind === "player");
  const [a, b] = ast.when?.seasons ?? [];
  if (!player?.id || !a || !b) {
    return emptyResult(ast, "invalid", ["Missing player or seasons."]);
  }

  const wrapped = await getPlayerSeasonComparison({
    playerId: player.id,
    seasonA: a,
    seasonB: b,
  });
  const result = wrapped.comparison;
  if (!result) {
    return emptyResult(ast, "no_result", [
      wrapped.error ?? "Could not compare those seasons.",
    ]);
  }

  const edge =
    result.overall.edge === "a"
      ? a
      : result.overall.edge === "b"
        ? b
        : result.overall.edge === "even"
          ? "Essentially even"
          : "Unavailable";

  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [
      result.playerName,
      `${a} vs ${b}`,
      "Existing season-comparison methodology",
    ],
    headline: `${result.playerName}: ${a} vs ${b}`,
    valueDisplay:
      typeof edge === "string" && /\d{4}-\d{2}/.test(edge)
        ? `${edge} leads overall`
        : String(edge),
    detailLines: [result.overall.reason],
    methodology: [
      `Methodology v${result.methodology.version}`,
      result.methodology.overallRule,
    ],
    source: "Player season compare",
    queryPlan: buildQueryPlan(ast),
    links: [
      {
        label: "Open full comparison →",
        href: seasonComparePath(player.id, a, b),
      },
      { label: "View player →", href: `/players/${player.id}` },
    ],
    payload: { overall: result.overall },
  };
}

async function execSeasonRank(ast: BasketballQueryAst): Promise<AskDrblResult> {
  const player = ast.entities.find((e) => e.kind === "player");
  if (!player?.id) {
    return emptyResult(ast, "invalid", ["Missing player."]);
  }

  const wrapped = await getPlayerSeasonRanking({
    playerId: player.id,
    seasons: ast.when?.seasons,
  });
  const ranking = wrapped.ranking;
  if (!ranking) {
    return emptyResult(ast, "insufficient_data", [
      wrapped.error ?? "Not enough eligible seasons to rank.",
    ]);
  }

  const top = ranking.ranking.filter((e) => e.eligible).slice(0, 5);
  if (!top.length) {
    return emptyResult(ast, "insufficient_data", [
      "Not enough eligible seasons to rank.",
    ]);
  }

  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [
      ranking.playerName,
      "Under DRBL's Rank My Seasons (Copeland) methodology",
      ...(ast.seasonNotes ?? []),
    ],
    headline: `${ranking.playerName} · season ranking`,
    valueDisplay: `#1 ${top[0]!.season}`,
    detailLines: [
      `Under DRBL’s current season-ranking methodology, ${top[0]!.season} ranks first.`,
      ...top.map(
        (e) =>
          `#${e.rank} ${e.season} · ${e.copelandPoints} Copeland pts (${e.pairwiseWins}W-${e.pairwiseLosses}L)`
      ),
      ...ranking.topSeasonWhy.slice(0, 2),
    ],
    methodology: [
      ranking.methodology.rankingRule,
      "“Best season” here means Rank My Seasons — not a universal best-season score.",
    ],
    source: "Rank My Seasons",
    queryPlan: buildQueryPlan(ast),
    links: [
      {
        label: "Open Season Rank →",
        href: seasonRankPath(
          player.id,
          top.map((t) => t.season)
        ),
      },
      { label: "View player →", href: `/players/${player.id}` },
    ],
  };
}

async function execCareerResume(
  ast: BasketballQueryAst
): Promise<AskDrblResult> {
  const playerEnt = ast.entities.find((e) => e.kind === "player");
  if (!playerEnt?.id) {
    return emptyResult(ast, "invalid", ["Missing player."]);
  }

  const [player, career] = await Promise.all([
    getPlayer(playerEnt.id),
    getPlayerCareerSeasons(playerEnt.id),
  ]);
  const name = player?.fullName || career[0]?.playerName || playerEnt.name || playerEnt.id;
  const resume = computeCareerResume({
    playerId: playerEnt.id,
    playerName: name,
    career,
  });

  const qualifying = career.filter(isCareerQualifyingSeason);
  const wantsCount = /\bhow\s+many\b/i.test(ast.rawQuery ?? "");

  if (wantsCount) {
    return {
      status: "ok",
      version: ASK_DRBL_VERSION,
      rawQuery: ast.rawQuery ?? "",
      ast,
      interpretation: [name, "Qualifying seasons", "Career Resume rules"],
      headline: `${name} · qualifying seasons`,
      valueDisplay: String(qualifying.length),
      detailLines: [
        `Minimum ${CAREER_RESUME_MIN_GAMES} GP (and MPG gate) per Career Resume.`,
        qualifying.length
          ? `Examples: ${qualifying
              .slice(-5)
              .map((s) => s.season)
              .join(", ")}`
          : "No qualifying seasons.",
      ],
      methodology: [resume.methodology.qualifyingRule],
      source: "Career Resume",
      links: [
        { label: "View Career Resume →", href: `/players/${playerEnt.id}` },
      ],
    };
  }

  if (!resume.peak) {
    return emptyResult(ast, "insufficient_data", [
      "No peak production season under Career Resume rules.",
    ]);
  }

  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [name, "Peak production season under Career Resume CPI", "Career Resume"],
    headline: `${name} · peak production season`,
    valueDisplay: `${resume.peak.season} · CPI ${formatCpi(resume.peak.cpi)}`,
    detailLines: [
      "Under Career Resume’s CPI methodology (not Rank My Seasons).",
      resume.peak.teamName,
      `${resume.peak.gamesPlayed} GP`,
      resume.trajectory.summary,
    ].filter(Boolean) as string[],
    methodology: [resume.methodology.cpiFormula, resume.methodology.peakDefinition],
    source: "Career Resume",
    queryPlan: buildQueryPlan(ast),
    links: [
      { label: "View Career Resume →", href: `/players/${playerEnt.id}` },
      {
        label: "Compare seasons →",
        href: `/players/${playerEnt.id}/season-compare`,
      },
    ],
  };
}

async function execGameLab(ast: BasketballQueryAst): Promise<AskDrblResult> {
  const teams = ast.entities.filter((e) => e.kind === "team");
  if (!teams.length) {
    return emptyResult(ast, "invalid", ["Need a team for game queries."]);
  }

  const season =
    ast.when?.seasons?.[0] ??
    canonicalSeasonFromStartYear(currentNbaStartYear());
  let games = await getFilteredGames({
    season,
    team: teams[0]!.id,
  });
  if (!games.length) {
    games = await getRecentGameSummaries({ season, limit: 40 });
  }

  const match =
    teams.length >= 2
      ? games.find(
          (g) =>
            (g.homeTeamId === teams[0]!.id && g.awayTeamId === teams[1]!.id) ||
            (g.awayTeamId === teams[0]!.id && g.homeTeamId === teams[1]!.id) ||
            (g.homeTeamId === teams[1]!.id && g.awayTeamId === teams[0]!.id) ||
            (g.awayTeamId === teams[1]!.id && g.homeTeamId === teams[0]!.id)
        )
      : games[0];

  // Also match by abbr on game headers
  const match2 =
    match ??
    games.find((g) => {
      if (teams.length < 2) return false;
      const ids = new Set(teams.map((t) => t.id));
      const abbrs = new Set(
        teams.map((t) => resolveTeamBrand(t.id)?.abbr?.toLowerCase())
      );
      const ga = (g.awayTeamAbbr ?? "").toLowerCase();
      const gh = (g.homeTeamAbbr ?? "").toLowerCase();
      return (
        (ids.has(g.homeTeamId) && ids.has(g.awayTeamId)) ||
        (abbrs.has(ga) && abbrs.has(gh))
      );
    });

  const game = match2 ?? match;
  if (!game) {
    return emptyResult(ast, "no_result", [
      "No matching game found for those teams in the available schedule slice.",
    ]);
  }

  const payload = await getGameAnalysis(game.id);
  if (!payload) {
    return emptyResult(ast, "no_result", ["Game Lab could not load that game."]);
  }

  const { analysis, players } = payload;
  const scoring = [...players].sort((a, b) => b.points - a.points);
  const topScorer = scoring[0];

  const detailLines = [
    analysis.outcome.summaryLine,
    analysis.overallReason,
    ...analysis.winningFactors
      .slice(0, 3)
      .map((f) => `${f.label}: ${f.deltaDisplay}`),
  ];
  if (topScorer) {
    detailLines.unshift(
      `Top scorer: ${topScorer.playerName ?? topScorer.playerId} (${topScorer.points} PTS)`
    );
  }

  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [
      analysis.outcome.summaryLine,
      "Existing Game Lab analysis",
      `Coverage · ${analysis.coverage.depth}`,
    ],
    headline: analysis.outcome.summaryLine,
    valueDisplay: `Overall edge: ${analysis.overallEdgeDisplay}`,
    detailLines,
    methodology: [
      analysis.methodology.winningFactorsRule,
      "No possession-level claims.",
    ],
    source: "Game Lab",
    queryPlan: buildQueryPlan(ast),
    limitations: analysis.coverage.notes.slice(0, 2),
    links: [{ label: "Open Game Lab →", href: `/games/${game.id}` }],
  };
}

async function execOffseason(ast: BasketballQueryAst): Promise<AskDrblResult> {
  const team = ast.entities.find((e) => e.kind === "team");
  const year = currentOffseasonLabelYear();

  if (team && team.name !== "league" && team.id) {
    const page = await listTransactionEvents(
      { teamId: team.id, offseasonYear: year },
      { page: 1, pageSize: 8 }
    );
    const activities = await getTeamOffseasonActivity({
      teamId: team.id,
      offseasonYear: year,
    });
    const activity = activities[0];
    const brand = resolveTeamBrand(team.id);
    return {
      status: "ok",
      version: ASK_DRBL_VERSION,
      rawQuery: ast.rawQuery ?? "",
      ast,
      interpretation: [
        `${brand?.abbr ?? team.name} ${year} offseason`,
        "ESPN transaction events (factual)",
      ],
      headline: `${brand?.abbr ?? team.name} · ${year} offseason`,
      valueDisplay: `${activity?.eventCount ?? page.total} events`,
      detailLines: page.events.slice(0, 5).map((e) => e.description),
      methodology: [
        "Counts ESPN free-text transaction events only — not structured trades or contracts.",
      ],
      source: "Offseason transaction event archive",
      queryPlan: buildQueryPlan(ast),
      limitations: [
        "Do not infer asset lineage or contract value from these blurbs.",
      ],
      links: [
        {
          label: "Open Offseason Tracker →",
          href: `/offseason?team=${encodeURIComponent(team.id)}&year=${year}`,
        },
      ],
    };
  }

  const pulse = await getOffseasonPulse({ offseasonYear: year });
  return {
    status: "ok",
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [`${year} offseason`, "League pulse"],
    headline: `${year} offseason pulse`,
    valueDisplay: `${pulse.eventCount} events`,
    detailLines: [
      pulse.mostActiveTeam
        ? `Most active: ${pulse.mostActiveTeam.teamAbbr ?? pulse.mostActiveTeam.teamId} (${pulse.mostActiveTeam.eventCount})`
        : "No team activity summary.",
      pulse.latestEvent?.description ?? "",
    ].filter(Boolean),
    source: "Offseason transaction event archive",
    queryPlan: buildQueryPlan(ast),
    limitations: ["Factual event archive only — genealogy UI blocked."],
    links: [{ label: "Open Offseason Tracker →", href: "/offseason" }],
  };
}

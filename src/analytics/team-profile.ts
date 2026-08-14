import type { AnalyticalFinding, StatContext } from "@/analytics/types";
import { buildStatContext } from "@/analytics/context";
import type { TeamSeasonStats } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";

export type TeamTrait = {
  id: string;
  label: string;
  display: string;
  percentile: number;
  context: StatContext;
  /** Higher = stronger identity signal. */
  strength: number;
};

export type TeamProfileAnalysis = {
  season: string;
  traits: TeamTrait[];
  howTheyWin: AnalyticalFinding[];
  vsPrior: {
    priorSeason: string;
    changes: Array<{
      id: string;
      label: string;
      deltaDisplay: string;
      direction: "up" | "down" | "flat";
    }>;
    finding: AnalyticalFinding | null;
  } | null;
};

function percentileOf(value: number, pool: number[], invert = false): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  const raw = (below / pool.length) * 100;
  return invert ? 100 - raw : raw;
}

type TraitDef = {
  id: string;
  label: string;
  pick: (t: TeamSeasonStats) => number;
  format: (v: number) => string;
  invert?: boolean;
  /** Plain identity phrase when this is a strength. */
  strengthPhrase: string;
};

const TRAITS: TraitDef[] = [
  {
    id: "diff",
    label: "Point differential",
    pick: (t) => t.avgDiff,
    format: (v) => `${v >= 0 ? "+" : ""}${formatNumber(v, 1)}`,
    strengthPhrase: "outscoring opponents by a wide margin",
  },
  {
    id: "ts",
    label: "True shooting",
    pick: (t) => t.trueShootingPct,
    format: (v) => formatPct(v),
    strengthPhrase: "efficient scoring (true shooting)",
  },
  {
    id: "efg",
    label: "Effective FG%",
    pick: (t) => t.effectiveFieldGoalPct,
    format: (v) => formatPct(v),
    strengthPhrase: "strong shot-making (eFG%)",
  },
  {
    id: "fg3",
    label: "3P%",
    pick: (t) => t.threePointPct,
    format: (v) => formatPct(v),
    strengthPhrase: "making threes at a high clip",
  },
  {
    id: "3par",
    label: "3-point volume",
    pick: (t) =>
      t.fieldGoalsAttempted > 0
        ? t.threePointersAttempted / t.fieldGoalsAttempted
        : 0,
    format: (v) => formatPct(v),
    strengthPhrase: "high three-point attempt share",
  },
  {
    id: "orb",
    label: "Offensive rebound %",
    pick: (t) => t.offensiveReboundPct,
    format: (v) => formatPct(v),
    strengthPhrase: "offensive rebounding",
  },
  {
    id: "asttov",
    label: "Assist / turnover",
    pick: (t) => t.assistToTurnover,
    format: (v) => formatNumber(v, 2),
    strengthPhrase: "clean ball movement (AST/TO)",
  },
  {
    id: "tov",
    label: "Turnovers / game",
    pick: (t) => t.topg,
    format: (v) => formatNumber(v, 1),
    invert: true,
    strengthPhrase: "avoiding turnovers",
  },
  {
    id: "opp",
    label: "Opponent PPG",
    pick: (t) => t.oppPpg,
    format: (v) => formatNumber(v, 1),
    invert: true,
    strengthPhrase: "limiting opponent scoring",
  },
  {
    id: "stl",
    label: "Steals / game",
    pick: (t) => t.spg,
    format: (v) => formatNumber(v, 1),
    strengthPhrase: "creating steals",
  },
  {
    id: "blk",
    label: "Blocks / game",
    pick: (t) => t.bpg,
    format: (v) => formatNumber(v, 1),
    strengthPhrase: "rim protection (blocks)",
  },
];

export function analyzeTeamProfile(options: {
  team: TeamSeasonStats;
  league: TeamSeasonStats[];
  prior?: TeamSeasonStats | null;
}): TeamProfileAnalysis {
  const { team, league, prior } = options;
  const traits: TeamTrait[] = [];

  for (const def of TRAITS) {
    const value = def.pick(team);
    if (!Number.isFinite(value)) continue;
    if (def.id === "3par" && value <= 0) continue;
    const pool = league.map((t) => def.pick(t)).filter((n) => Number.isFinite(n));
    const percentile = percentileOf(value, pool, def.invert);
    traits.push({
      id: def.id,
      label: def.label,
      display: def.format(value),
      percentile,
      strength: Math.max(0, percentile - 50),
      context: buildStatContext({
        display: def.format(value),
        value,
        percentile,
        population: "league",
        populationLabel: "NBA teams this season",
        sampleSize: league.length,
        timeframe: team.season,
        sourceLabel: def.label,
      }),
    });
  }

  traits.sort((a, b) => b.percentile - a.percentile);

  const strengths = traits.filter((t) => t.percentile >= 70).slice(0, 3);
  const howTheyWin: AnalyticalFinding[] = strengths.map((t) => {
    const phrase =
      TRAITS.find((d) => d.id === t.id)?.strengthPhrase ?? t.label.toLowerCase();
    return {
      id: `win-${t.id}`,
      eyebrow: "How they win",
      title: t.label,
      body: `${team.fullName} ranks in the ${Math.round(t.percentile)}th percentile for ${phrase} (${t.display}).`,
      level: 2,
      teamIds: [team.teamId],
    };
  });

  if (!howTheyWin.length && traits[0]) {
    const t = traits[0];
    howTheyWin.push({
      id: "win-relative",
      eyebrow: "How they win",
      title: t.label,
      body: `No elite (70th+ percentile) identity traits yet. Relative strength so far: ${t.label} at the ${Math.round(t.percentile)}th percentile (${t.display}).`,
      level: 2,
      teamIds: [team.teamId],
    });
  }

  let vsPrior: TeamProfileAnalysis["vsPrior"] = null;
  if (prior) {
    const changes: NonNullable<TeamProfileAnalysis["vsPrior"]>["changes"] = [];
    for (const def of TRAITS) {
      const from = def.pick(prior);
      const to = def.pick(team);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const delta = to - from;
      const signed = def.invert ? -delta : delta;
      const abs = Math.abs(delta);
      if (abs < 1e-6) continue;
      // Noise floors by metric type
      if (def.id === "diff" && abs < 0.8) continue;
      if ((def.id === "ts" || def.id === "efg" || def.id === "fg3" || def.id === "3par" || def.id === "orb") && abs < 0.008) continue;
      if ((def.id === "opp" || def.id === "tov" || def.id === "stl" || def.id === "blk") && abs < 0.4) continue;
      if (def.id === "asttov" && abs < 0.15) continue;

      const deltaDisplay =
        def.id === "ts" ||
        def.id === "efg" ||
        def.id === "fg3" ||
        def.id === "3par" ||
        def.id === "orb"
          ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pts`
          : `${delta >= 0 ? "+" : ""}${formatNumber(delta, def.id === "asttov" ? 2 : 1)}`;

      changes.push({
        id: def.id,
        label: def.label,
        deltaDisplay,
        direction: signed > 0 ? "up" : "down",
      });
    }
    const top = [...changes]
      .map((c) => {
        const def = TRAITS.find((t) => t.id === c.id)!;
        return {
          change: c,
          abs: Math.abs(def.pick(team) - def.pick(prior)),
        };
      })
      .sort((a, b) => b.abs - a.abs)
      .slice(0, 4)
      .map((row) => row.change);
    vsPrior = {
      priorSeason: prior.season,
      changes: top,
      finding: top[0]
        ? {
            id: "team-yoy",
            eyebrow: "What's changing",
            title: top[0].label,
            body: `Largest measured team change vs ${prior.season}: ${top[0].label} (${top[0].deltaDisplay}). Sample: full team season totals, not game-level causality.`,
            level: 3,
            teamIds: [team.teamId],
          }
        : null,
    };
  }

  return {
    season: team.season,
    traits,
    howTheyWin,
    vsPrior,
  };
}

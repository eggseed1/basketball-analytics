/**
 * Board-only team overview shapes (season totals / ranks).
 * Keep game-snapshot out of this module so overview shell can render
 * without parsing the 1.4MB schedule.
 */

import type { TeamTrait } from "@/analytics";
import type { TeamSeasonStats } from "@/data/types";
import type { RankedMetric } from "@/lib/team-page-metrics";
import { ftRate } from "@/lib/team-page-metrics";
import type {
  DnaAxis,
  LadderRow,
  LeagueStripData,
  StripFormat,
} from "@/lib/team-overview-types";

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
    if (!byKey.has(m.key) && m.missingReason == null && m.percentile != null)
      byKey.set(m.key, m);
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
        rankLine:
          m.rank != null && m.rankDenominator != null
            ? `${m.rank} of ${m.rankDenominator}`
            : "",
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
  {
    key: "opp",
    label: "Opp points / game",
    lowerIsBetter: true,
    pick: (r) => r.oppPpg,
    format: "num1",
  },
  { key: "efg", label: "Effective FG%", pick: (r) => r.effectiveFieldGoalPct, format: "pct" },
  {
    key: "tov",
    label: "Turnovers / game",
    lowerIsBetter: true,
    pick: (r) => r.topg,
    format: "num1",
  },
  { key: "orb", label: "Offensive reb%", pick: (r) => r.offensiveReboundPct, format: "pct" },
  { key: "ftr", label: "Free-throw rate", pick: (r) => ftRate(r), format: "pct" },
];

export function buildLeagueStrips(
  team: TeamSeasonStats,
  league: TeamSeasonStats[]
): LeagueStripData[] {
  return STRIP_DEFS.flatMap((def) => {
    const points = league.flatMap((row) => {
      const v = def.pick(row);
      return v != null && Number.isFinite(v)
        ? [{ teamId: row.teamId, abbr: row.abbreviation, value: v }]
        : [];
    });
    const own = points.find((p) => p.teamId === team.teamId);
    if (!own || points.length < 2) return [];
    const better = points.filter((p) =>
      def.lowerIsBetter ? p.value < own.value : p.value > own.value
    ).length;
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
    .map((r) => ({
      teamId: r.teamId,
      abbr: r.abbreviation,
      conference: r.conference ?? "",
      net: r.avgDiff,
    }))
    .sort((a, b) => b.net - a.net);
}

export type TraitBar = {
  id: string;
  label: string;
  display: string;
  percentile: number;
};

export function traitBars(traits: TeamTrait[]): TraitBar[] {
  return traits.map((t) => ({
    id: t.id,
    label: t.label,
    display: t.display,
    percentile: t.percentile,
  }));
}

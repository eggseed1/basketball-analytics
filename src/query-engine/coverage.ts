/**
 * ASK DRBL metric coverage — what is actually trustworthy historically.
 * Do not treat board field presence as multi-decade availability.
 */

import type { AskMetricId } from "./types";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export type MetricCoverage = {
  metricId: AskMetricId;
  label: string;
  /** Earliest season where the field is generally reliable, or null if counting-derived across careers. */
  earliestSeason: string | null;
  latestSeason: string;
  playerCoverage: string;
  reliable: boolean;
  sourceLabel: string;
  notes: string;
};

function currentSeason(): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear());
}

/** Static audit used by ASK DRBL + docs. */
export function getAskMetricCoverageAudit(
  now = new Date()
): MetricCoverage[] {
  const current = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  return [
    {
      metricId: "ppg",
      label: "PPG",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career counting rows (ESPN / historical)",
      reliable: true,
      sourceLabel: "Player-season board (counting)",
      notes: "Totals ÷ GP. Available wherever season counting stats exist.",
    },
    {
      metricId: "rpg",
      label: "RPG",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career counting rows",
      reliable: true,
      sourceLabel: "Player-season board (counting)",
      notes: "Totals ÷ GP.",
    },
    {
      metricId: "apg",
      label: "APG",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career counting rows",
      reliable: true,
      sourceLabel: "Player-season board (counting)",
      notes: "Totals ÷ GP.",
    },
    {
      metricId: "ts_pct",
      label: "TS%",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Derived from PTS/FGA/FTA on career & boards",
      reliable: true,
      sourceLabel: "Player-season board (derived)",
      notes: "Computed from counting stats — not a separate historical feed.",
    },
    {
      metricId: "efg_pct",
      label: "eFG%",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Derived from FGM/3PM/FGA",
      reliable: true,
      sourceLabel: "Player-season board (derived)",
      notes: "Computed from counting stats.",
    },
    {
      metricId: "fg_pct",
      label: "FG%",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career / board",
      reliable: true,
      sourceLabel: "Player-season board",
      notes: "Direct shooting percentage fields.",
    },
    {
      metricId: "fg3_pct",
      label: "3P%",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career / board (era-dependent volume)",
      reliable: true,
      sourceLabel: "Player-season board",
      notes: "Reliable when attempts exist; low-volume seasons still report the rate.",
    },
    {
      metricId: "ft_pct",
      label: "FT%",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career / board",
      reliable: true,
      sourceLabel: "Player-season board",
      notes: "Direct free-throw percentage.",
    },
    {
      metricId: "usg_pct",
      label: "USG%",
      earliestSeason: "2000-01",
      latestSeason: current,
      playerCoverage: "Modern ESPN season boards; career rows often lack USG",
      reliable: false,
      sourceLabel: "Modern player-season board (when present)",
      notes:
        "ESPN career transform currently stamps usagePct=0. Prefer season board rows; refuse when missing rather than inventing.",
    },
    {
      metricId: "darko",
      label: "DARKO DPM",
      earliestSeason: current,
      latestSeason: current,
      playerCoverage: "Live snapshot names only for stamped season",
      reliable: true,
      sourceLabel: `Verified historical impact (DARKO live · ${current})`,
      notes:
        "Not a multi-year archive. Wrong-season asks must return unavailable — never stamp current DARKO onto other years.",
    },
    {
      metricId: "lebron",
      label: "LEBRON",
      earliestSeason: "2024-25",
      latestSeason: "2024-25",
      playerCoverage: "CSV when present; otherwise sparse seed",
      reliable: false,
      sourceLabel: "Verified historical impact (LEBRON season-keyed)",
      notes:
        "Season-keyed only. Missing seasons stay missing — no substitute metric.",
    },
    {
      metricId: "cpi",
      label: "CPI",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Derived for Career Resume qualifying seasons",
      reliable: true,
      sourceLabel: "Career Resume (CPI)",
      notes: "Documented composite from counting rates — not an impact metric.",
    },
    {
      metricId: "team_diff",
      label: "Team point differential",
      earliestSeason: "2001-02",
      latestSeason: current,
      playerCoverage: "Team-season ESPN boards",
      reliable: true,
      sourceLabel: "Team-season board",
      notes: "Team averages from ESPN by-team totals.",
    },
    {
      metricId: "team_ts",
      label: "Team TS%",
      earliestSeason: "2001-02",
      latestSeason: current,
      playerCoverage: "Team-season boards",
      reliable: true,
      sourceLabel: "Team-season board",
      notes: "Derived team efficiency.",
    },
    {
      metricId: "team_efg",
      label: "Team eFG%",
      earliestSeason: "2001-02",
      latestSeason: current,
      playerCoverage: "Team-season boards",
      reliable: true,
      sourceLabel: "Team-season board",
      notes: "Derived team shooting.",
    },
  ];
}

/** Documented gaps — present on some boards but not ASK-executable yet. */
export function getAskCoverageGaps(now = new Date()): Array<{
  label: string;
  earliestSeason: string | null;
  latestSeason: string;
  playerCoverage: string;
  reliable: boolean;
  notes: string;
}> {
  const current = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  return [
    {
      label: "ORtg (player)",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "ESPN approx from counting; definitions vary",
      reliable: false,
      notes:
        "Not exposed in ASK DRBL yet — ESPN-derived individual ORtg is approximate and not methodology-frozen.",
    },
    {
      label: "DRtg (player)",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Unavailable on ESPN athlete season boards",
      reliable: false,
      notes:
        "Not exposed — ESPN does not publish individual DRtg; DRBL keeps the field missing (never fabricates 0).",
    },
    {
      label: "Net rating (player)",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Unavailable without provider DRtg/NET",
      reliable: false,
      notes:
        "Blocked until a provider supplies season-true NET (never invent NET = ORtg − league average).",
    },
  ];
}

export function coverageForMetric(metricId: AskMetricId): MetricCoverage | null {
  return getAskMetricCoverageAudit().find((c) => c.metricId === metricId) ?? null;
}

/**
 * Returns a user-facing refusal when a metric is not season-true for `season`.
 */
export function metricSeasonAvailability(
  metricId: AskMetricId,
  season: string
): { ok: true } | { ok: false; message: string } {
  const current = currentSeason();
  if (metricId === "darko") {
    if (season !== current) {
      return {
        ok: false,
        message: `Verified season-true DARKO data is not available for ${season}. ASK DRBL only admits the live DARKO snapshot for ${current}.`,
      };
    }
    return { ok: true };
  }
  if (metricId === "lebron") {
    // Sparse — executor still checks the actual row; this blocks clearly ancient asks.
    const y = Number(season.slice(0, 4));
    if (!Number.isFinite(y) || y < 2024) {
      return {
        ok: false,
        message: `Verified season-true LEBRON data is not available for ${season} in this repository.`,
      };
    }
    return { ok: true };
  }
  return { ok: true };
}

export function formatCoverageReportMarkdown(now = new Date()): string {
  const rows = getAskMetricCoverageAudit(now);
  const gaps = getAskCoverageGaps(now);
  const lines = [
    "# ASK DRBL advanced-stat coverage audit",
    "",
    "Generated for ASK DRBL v1.1. Do not treat board fields as multi-decade feeds.",
    "",
    "| Metric | Earliest | Latest | Player coverage | Reliable? | Source |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.earliestSeason ?? "counting-era"} | ${r.latestSeason} | ${r.playerCoverage} | ${r.reliable ? "yes" : "limited"} | ${r.sourceLabel} |`
    );
  }
  lines.push("", "## Notes");
  for (const r of rows) {
    lines.push(`- **${r.label}:** ${r.notes}`);
  }
  lines.push("", "## Historical coverage gaps (not ASK-executable yet)");
  lines.push("");
  lines.push("| Metric | Earliest | Latest | Coverage | Reliable? |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const g of gaps) {
    lines.push(
      `| ${g.label} | ${g.earliestSeason ?? "n/a"} | ${g.latestSeason} | ${g.playerCoverage} | no |`
    );
  }
  for (const g of gaps) {
    lines.push(`- **${g.label}:** ${g.notes}`);
  }
  lines.push("");
  return lines.join("\n");
}

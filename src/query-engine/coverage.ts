/**
 * ASK DRBL metric coverage — what is actually trustworthy historically.
 * Do not treat board field presence as multi-decade availability.
 */

import type { AskMetricId } from "./types";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  isDrblSeason,
  listCanonicalR1Seasons,
  listDrblSeasons,
} from "@/data/drbl/season-registry";

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
      metricId: "drbl100",
      label: "DRBL/100",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage:
        "Precomputed DRBL overlay via production-approved ESPN↔NBA identity",
      reliable: true,
      sourceLabel: "DRBL season overlay (validated ability)",
      notes:
        "Only registry DRBL seasons. Requires valid estimate + identity join — never invent 0 or substitute DARKO.",
    },
    {
      metricId: "r1_points",
      label: "R1 Points",
      earliestSeason: listCanonicalR1Seasons()[0] ?? "2020-21",
      latestSeason: listCanonicalR1Seasons().at(-1) ?? current,
      playerCoverage: "Canonical R1 seasons in DRBL registry",
      reliable: true,
      sourceLabel: "DRBL R1 Points (accounting / advanced)",
      notes:
        "Underlying point-equivalent attribution — prefer WAR1 on the public surface. Null when unpublished.",
    },
    {
      metricId: "r1_win_eq",
      label: "WAR1",
      earliestSeason: listCanonicalR1Seasons()[0] ?? "2020-21",
      latestSeason: listCanonicalR1Seasons().at(-1) ?? current,
      playerCoverage: "Canonical R1 seasons in DRBL registry",
      reliable: true,
      sourceLabel: "DRBL WAR1",
      notes:
        "R1 Points ÷ frozen P1. Not traditional WAR. Identical ordering to R1 Points.",
    },
    {
      metricId: "drbl_o",
      label: "DRBL-O",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "DRBL overlay O split",
      reliable: true,
      sourceLabel: "DRBL offensive split",
      notes: "Canonical O split when estimate valid.",
    },
    {
      metricId: "drbl_d",
      label: "DRBL-D",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "DRBL overlay D split",
      reliable: true,
      sourceLabel: "DRBL defensive split",
      notes: "Canonical D split when estimate valid.",
    },
    {
      metricId: "drbl_p",
      label: "DRBL-P",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Diagnostic DRBL component",
      reliable: true,
      sourceLabel: "DRBL-P (diagnostic)",
      notes: "Diagnostic only — does not sum with LN+B into DRBL/100.",
    },
    {
      metricId: "drbl_ln",
      label: "DRBL-LN",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Diagnostic DRBL component",
      reliable: true,
      sourceLabel: "DRBL-LN (diagnostic)",
      notes: "Diagnostic only — does not sum with P+B into DRBL/100.",
    },
    {
      metricId: "drbl_b",
      label: "DRBL-B",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Diagnostic DRBL component",
      reliable: true,
      sourceLabel: "DRBL-B (diagnostic)",
      notes: "Diagnostic only — does not sum with P+LN into DRBL/100.",
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
  const drblIds: AskMetricId[] = [
    "drbl100",
    "drbl_o",
    "drbl_d",
    "drbl_p",
    "drbl_ln",
    "drbl_b",
  ];
  if (drblIds.includes(metricId)) {
    if (!isDrblSeason(season)) {
      return {
        ok: false,
        message: `DRBL metrics are not published for ${season}. Supported DRBL seasons: ${listDrblSeasons().join(", ")}.`,
      };
    }
    return { ok: true };
  }
  if (metricId === "r1_points" || metricId === "r1_win_eq") {
    if (!listCanonicalR1Seasons().includes(season)) {
      return {
        ok: false,
        message: `R1 value metrics are not published for ${season}. Canonical R1 seasons: ${listCanonicalR1Seasons().join(", ")}.`,
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

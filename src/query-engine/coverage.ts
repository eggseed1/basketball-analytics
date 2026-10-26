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
  listCanonicalR1Seasons,
  listDrblSeasons,
} from "@/data/drbl/season-registry";
import {
  isBundledDarkoSeason,
  isBundledRaptorSeason,
  listBundledDarkoSeasons,
  listBundledRaptorSeasons,
} from "@/data/runtime/impact-overlay-snapshot";
import { metricSeasonAvailabilitySync } from "./coverage-sync";

export { metricSeasonAvailabilitySync } from "./coverage-sync";

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

/** Static audit used by ASK DRBL + docs. */
export async function getAskMetricCoverageAudit(
  now = new Date()
): Promise<MetricCoverage[]> {
  const current = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const darkoSeasons = await listBundledDarkoSeasons();
  const raptorSeasons = await listBundledRaptorSeasons();
  return [
    {
      metricId: "ppg",
      label: "PPG",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career counting rows",
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
      notes: "Computed from counting stats. It does not come from a separate historical feed.",
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
      playerCoverage: "Modern season boards; career rows often lack USG",
      reliable: false,
      sourceLabel: "Modern player-season board (when present)",
      notes:
        "Career rows carry no usage rate. Prefer season board rows; refuse when missing rather than inventing.",
    },
    {
      metricId: "darko",
      label: "DARKO DPM",
      earliestSeason: darkoSeasons[0] ?? "1996-97",
      latestSeason: darkoSeasons.at(-1) ?? current,
      playerCoverage: "Season-keyed DARKO overlay when baked for the asked season",
      reliable: true,
      sourceLabel: "Verified historical impact (DARKO season-keyed)",
      notes:
        "Season-keyed overlay only. Wrong-season asks must return unavailable. Never stamp another year's DARKO onto the asked season.",
    },
    {
      metricId: "raptor",
      label: "RAPTOR",
      earliestSeason: raptorSeasons[0] ?? "1976-77",
      latestSeason: raptorSeasons.at(-1) ?? "2021-22",
      playerCoverage: "Open RAPTOR through 2021-22; blank afterward",
      reliable: true,
      sourceLabel: "Verified historical impact (RAPTOR season-keyed)",
      notes:
        "Season-keyed through 2021-22 only. Missing seasons stay missing; BPM and LEBRON are never substituted.",
    },
    {
      metricId: "bpm",
      label: "BPM",
      earliestSeason: "1996-97",
      latestSeason: current,
      playerCoverage: "Advanced overlay when baked for the asked season",
      reliable: true,
      sourceLabel: "Advanced season board (BPM)",
      notes:
        "Season-true when the advanced bake includes the season. Missing BPM stays unavailable. DRBL never fills it with 0.",
    },
    {
      metricId: "drbl100",
      label: "DRBL/100",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Published DRBL seasons only",
      reliable: true,
      sourceLabel: "DRBL overlay",
      notes: "Only published DRBL seasons. No backfill into earlier years.",
    },
    {
      metricId: "drbl_o",
      label: "DRBL O",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Published DRBL seasons only",
      reliable: true,
      sourceLabel: "DRBL overlay",
      notes: "Published DRBL seasons only.",
    },
    {
      metricId: "drbl_d",
      label: "DRBL D",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Published DRBL seasons only",
      reliable: true,
      sourceLabel: "DRBL overlay",
      notes: "Published DRBL seasons only.",
    },
    {
      metricId: "drbl_p",
      label: "DRBL P",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Published DRBL seasons only",
      reliable: true,
      sourceLabel: "DRBL overlay",
      notes: "Published DRBL seasons only.",
    },
    {
      metricId: "drbl_ln",
      label: "DRBL Ln",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Published DRBL seasons only",
      reliable: true,
      sourceLabel: "DRBL overlay",
      notes: "Published DRBL seasons only.",
    },
    {
      metricId: "drbl_b",
      label: "DRBL B",
      earliestSeason: listDrblSeasons()[0] ?? "2020-21",
      latestSeason: listDrblSeasons().at(-1) ?? current,
      playerCoverage: "Published DRBL seasons only",
      reliable: true,
      sourceLabel: "DRBL overlay",
      notes: "Published DRBL seasons only.",
    },
    {
      metricId: "r1_points",
      label: "R1 points",
      earliestSeason: listCanonicalR1Seasons()[0] ?? null,
      latestSeason: listCanonicalR1Seasons().at(-1) ?? current,
      playerCoverage: "Canonical R1 seasons",
      reliable: true,
      sourceLabel: "DRBL R1",
      notes: "Canonical R1 seasons only.",
    },
    {
      metricId: "r1_win_eq",
      label: "R1 win eq.",
      earliestSeason: listCanonicalR1Seasons()[0] ?? null,
      latestSeason: listCanonicalR1Seasons().at(-1) ?? current,
      playerCoverage: "Canonical R1 seasons",
      reliable: true,
      sourceLabel: "DRBL R1",
      notes: "Canonical R1 seasons only.",
    },
    {
      metricId: "cpi",
      label: "CPI",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Career resume",
      reliable: true,
      sourceLabel: "Career Resume (CPI)",
      notes: "Career index; not a single-season board field.",
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
      playerCoverage: "Approximate from counting stats; definitions vary",
      reliable: false,
      notes:
        "Not exposed in ASK DRBL yet. Individual ORtg here is approximate and not methodology-frozen.",
    },
    {
      label: "DRtg (player)",
      earliestSeason: null,
      latestSeason: current,
      playerCoverage: "Unavailable on athlete season boards",
      reliable: false,
      notes:
        "Not exposed. Season boards carry no individual DRtg, so DRBL keeps the field missing (never fabricates 0).",
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

export async function coverageForMetric(
  metricId: AskMetricId
): Promise<MetricCoverage | null> {
  return (await getAskMetricCoverageAudit()).find((c) => c.metricId === metricId) ?? null;
}

/**
 * Returns a user-facing refusal when a metric is not season-true for `season`.
 */
export async function metricSeasonAvailability(
  metricId: AskMetricId,
  season: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (metricId === "darko") {
    if (!(await isBundledDarkoSeason(season))) {
      const span = await listBundledDarkoSeasons();
      const range =
        span.length > 0
          ? `${span[0]}–${span.at(-1)}`
          : "no baked DARKO seasons";
      return {
        ok: false,
        message: `Verified season-true DARKO data is not available for ${season}. ASK DRBL admits DARKO for baked overlay seasons (${range}).`,
      };
    }
    return { ok: true };
  }
  if (metricId === "raptor") {
    if (!(await isBundledRaptorSeason(season))) {
      const span = await listBundledRaptorSeasons();
      const range =
        span.length > 0
          ? `${span[0]}–${span.at(-1)}`
          : "no baked RAPTOR seasons";
      return {
        ok: false,
        message: `Verified season-true RAPTOR data is not available for ${season}. RAPTOR coverage ends after 2021-22 (baked range ${range}).`,
      };
    }
    return { ok: true };
  }
  return metricSeasonAvailabilitySync(metricId, season);
}

export async function formatCoverageReportMarkdown(
  now = new Date()
): Promise<string> {
  const rows = await getAskMetricCoverageAudit(now);
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

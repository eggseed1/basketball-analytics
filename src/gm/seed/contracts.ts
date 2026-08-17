/**
 * Build GmContract from real salary CSV when available, else era-scaled estimate.
 */

import type { GmContract } from "@/gm/types";
import type { CBARules } from "@/gm/myleague/types";
import {
  lookupPlayerSalary,
  normalizePlayerName,
} from "@/data/providers/salaries/salary-store";
import { clamp } from "@/gm/engine/rng";

export function estimateYearsRemaining(
  salaryM: number,
  cap: CBARules
): number {
  const pct = cap.salaryCapM > 0 ? salaryM / cap.salaryCapM : 0;
  if (pct >= 0.25) return Math.min(cap.maxContractYears, 4);
  if (pct >= 0.12) return 3;
  if (pct >= 0.05) return 2;
  return 1;
}

export function birdFromSalary(
  salaryM: number,
  cap: CBARules
): GmContract["birdRights"] {
  const pct = cap.salaryCapM > 0 ? salaryM / cap.salaryCapM : 0;
  if (pct >= 0.08) return "bird";
  if (pct >= 0.03) return "early";
  return "none";
}

/** Cap-relative fallback when no CSV row exists. */
export function estimateSalaryFromImpact(
  impact: number,
  cap: CBARules
): number {
  const max = cap.maxSalaryM || Math.max(5, cap.salaryCapM * 0.35);
  const min = cap.minSalaryM || Math.max(0.5, cap.salaryCapM * 0.008);
  const t = clamp((impact + 1.5) / 8, 0, 1);
  const curved = t * t;
  return Math.round((min + (max - min) * curved) * 100) / 100;
}

export function resolvePlayerContract(opts: {
  playerName: string;
  seasonStartYear: number;
  seasonEndYear: number;
  impact: number;
  cap: CBARules;
  salaryByName?: Map<string, number>;
}): { contract: GmContract; source: "csv" | "estimated" } {
  const key = normalizePlayerName(opts.playerName);
  const mapped = opts.salaryByName?.get(key);
  const looked =
    mapped == null
      ? lookupPlayerSalary(opts.seasonStartYear, opts.playerName)
      : null;
  const salaryM =
    mapped ?? looked?.salaryM ?? estimateSalaryFromImpact(opts.impact, opts.cap);
  const source: "csv" | "estimated" =
    mapped != null || looked != null ? "csv" : "estimated";
  const years = estimateYearsRemaining(salaryM, opts.cap);

  return {
    source,
    contract: {
      yearsRemaining: years,
      annualSalaryM: salaryM,
      birdRights: birdFromSalary(salaryM, opts.cap),
      signedSeason: opts.seasonEndYear - years + 1,
    },
  };
}

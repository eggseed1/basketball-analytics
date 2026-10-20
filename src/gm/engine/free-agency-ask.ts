/**
 * Asking price helpers shared by the FA desk and the utility model.
 */

import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { clamp } from "@/gm/engine/rng";
import type { CBARules } from "@/gm/myleague/types";

export function askingSalary(
  player: GmPlayer,
  rulesOrLeague: CBARules | GmLeagueState
): number {
  const rules =
    "salaryCapM" in rulesOrLeague && "minSalaryM" in rulesOrLeague
      ? (rulesOrLeague as CBARules)
      : getCbaRules((rulesOrLeague as GmLeagueState).season);
  const max = rules.maxSalaryM || Math.max(5, rules.salaryCapM * 0.35);
  const min = rules.minSalaryM || Math.max(0.5, rules.salaryCapM * 0.008);
  const like = (overallOf(player) - 76) / 2.35;
  const t = clamp((like + 1.5) / 8, 0, 1);
  return Math.round((min + (max - min) * t * t) * 100) / 100;
}

export function askingYears(
  player: GmPlayer,
  rulesOrLeague: CBARules | GmLeagueState
): number {
  const rules =
    "maxContractYears" in rulesOrLeague
      ? (rulesOrLeague as CBARules)
      : getCbaRules((rulesOrLeague as GmLeagueState).season);
  const overall = overallOf(player);
  const years = overall >= 85 ? 4 : overall >= 81 ? 3 : overall >= 76 ? 2 : 1;
  return clamp(years, 1, rules.maxContractYears || 5);
}

/** Rough QO amount: near the prior salary, floored at the league minimum. */
export function qualifyingOfferAmount(
  player: GmPlayer,
  rules: CBARules
): number {
  const min = rules.minSalaryM || 1;
  const last = player.lastSalaryM ?? player.contract?.annualSalaryM ?? min * 2;
  return Math.round(Math.max(min, last * 1.0) * 100) / 100;
}

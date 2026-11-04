/**
 * Asking price helpers shared by the FA desk and the utility model.
 */

import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { exceptionAmounts } from "@/gm/engine/cap";
import { cbaSeason } from "@/gm/engine/season-flow-state";
import { clamp } from "@/gm/engine/rng";
import type { CBARules } from "@/gm/myleague/types";

export function askingSalary(
  player: GmPlayer,
  rulesOrLeague: CBARules | GmLeagueState
): number {
  const rules =
    "salaryCapM" in rulesOrLeague && "minSalaryM" in rulesOrLeague
      ? (rulesOrLeague as CBARules)
      : getCbaRules(cbaSeason(rulesOrLeague as GmLeagueState));
  const ageLimit = rules.salaryCapM > 0
    ? rules.salaryCapM * (player.age >= 30 ? 0.35 : player.age >= 25 ? 0.3 : 0.25)
    : Infinity;
  const max = Math.min(rules.maxSalaryM || Math.max(5, rules.salaryCapM * 0.35), ageLimit);
  const min = Math.min(max, Math.max(rules.minSalaryM || 0.5, exceptionAmounts({ salaryCapM: rules.salaryCapM }).minimumM));
  const like = (overallOf(player) - 76) / 2.35;
  const t = clamp((like + 1.5) / 8, 0, 1);
  const baseline = Math.round((min + (max - min) * t * t) * 100) / 100;
  if ("players" in rulesOrLeague) {
    const league = rulesOrLeague as GmLeagueState;
    const market = league.faMarket;
    // Market leverage decreases after a real stretch without a signature.
    // A superstar remains expensive even on the final signing day.
    if (player.teamId == null && market && !market.done &&
        (market.stage === "open" || market.stage === "fill")) {
      const daysUnclaimed = Math.max(0, market.day - 6);
      const ovr = overallOf(player);
      const maxDiscount = ovr >= 90 ? .16 : ovr >= 86 ? .20 : ovr >= 82 ? .24 :
        ovr >= 78 ? .30 : .36;
      const discount = Math.min(1, daysUnclaimed / 12) * maxDiscount;
      return Math.round(Math.max(min, baseline * (1 - discount)) * 100) / 100;
    }
  }
  return baseline;
}

export function askingYears(
  player: GmPlayer,
  rulesOrLeague: CBARules | GmLeagueState
): number {
  const rules =
    "maxContractYears" in rulesOrLeague
      ? (rulesOrLeague as CBARules)
      : getCbaRules(cbaSeason(rulesOrLeague as GmLeagueState));
  const overall = overallOf(player);
  const years = overall >= 85 ? 4 : overall >= 81 ? 3 : overall >= 76 ? 2 : 1;
  return clamp(years, 1, rules.maxContractYears || 5);
}

/**
 * The lowest plausible salary accepted by a market player of this quality.
 * Used by actual signings, RFA sheets and the negotiation forecast so a
 * near-minimum bid cannot secretly sign a star through a different path.
 */
export function minimumCredibleSalaryRatio(player: GmPlayer): number {
  const ovr = overallOf(player);
  return ovr >= 86 ? 0.80 : ovr >= 83 ? 0.67 :
    ovr >= 80 ? 0.54 : ovr >= 78 ? 0.42 : 0;
}

/** Hard bottom for bona-fide veterans, even after weeks unsigned.
 * The asking number can slide, but 90+ OVR players do not take minimum deals.
 */
export function credibleFreeAgentSalaryFloor(player: GmPlayer, league: GmLeagueState): number {
  const rules = getCbaRules(cbaSeason(league));
  const initial = askingSalary(player, rules);
  const current = askingSalary(player, league);
  const ovr = overallOf(player);
  const absolute = ovr >= 90 ? .73 : ovr >= 86 ? .68 : ovr >= 83 ? .57 :
    ovr >= 80 ? .46 : ovr >= 78 ? .34 : 0;
  return Math.round(Math.max(current * minimumCredibleSalaryRatio(player),
    initial * absolute, rules.minSalaryM || 1) * 100) / 100;
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

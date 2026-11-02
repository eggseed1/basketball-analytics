/**
 * Franchise-market salary model. Cap-indexed value bands keep contracts
 * comparable as future league caps grow. The NBA max/min and signing paths
 * remain authoritative in cap.ts; these are *player preferences*, not legality.
 */
import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { exceptionAmounts } from "@/gm/engine/cap";
import { cbaSeason } from "@/gm/engine/season-flow-state";
import { clamp } from "@/gm/engine/rng";
import type { CBARules } from "@/gm/myleague/types";

const BANDS = [
  [60, 0.012], [68, 0.019], [72, 0.032], [76, 0.055],
  [79, 0.085], [82, 0.135], [85, 0.195], [88, 0.265],
  [91, 0.325], [96, 0.35],
] as const;
const money = (value: number) => Math.round(value * 100) / 100;

function interpolate(overall: number): number {
  if (overall <= BANDS[0][0]) return BANDS[0][1];
  for (let i = 1; i < BANDS.length; i++) {
    const [top, pct] = BANDS[i]!;
    const [low, prev] = BANDS[i - 1]!;
    if (overall <= top) return prev + (pct - prev) * ((overall - low) / (top - low));
  }
  return BANDS[BANDS.length - 1]![1];
}

function cba(input: CBARules | GmLeagueState) {
  if ("maxContractYears" in input) {
    const rules = input as CBARules;
    return { rules, salaryCapM: rules.salaryCapM };
  }
  const league = input as GmLeagueState;
  return { rules: getCbaRules(cbaSeason(league)), salaryCapM: league.settings.salaryCapM };
}

function performanceMultiplier(player: GmPlayer): number {
  const line = player.seasonLine?.gp ? player.seasonLine : player.nbaSeason;
  if (!line || line.gp < 12) return 1;
  const games = line.gp;
  const mpg = line.min / games;
  const ppg = line.pts / games;
  const apg = line.ast / games;
  const rpg = line.reb / games;
  const overall = overallOf(player);
  // A 90 OVR is already expected to produce more than a 76 OVR;
  // reward output above that baseline without double-counting raw PPG.
  const expected = 12 + (overall - 76) * 0.78;
  const production = ppg + apg * 0.62 + rpg * 0.42;
  const delta = (production - expected) / Math.max(12, expected);
  const usage = clamp((mpg - 22) / 35, -0.15, 0.23);
  const reliability = clamp(games / 45, 0, 1);
  const availability = games >= 60 ? 0.03 : games < 30 ? -0.055 : 0;
  return clamp(1 + reliability * (delta * 0.2 + usage * 0.2 + availability), 0.82, 1.2);
}

export function askingSalary(player: GmPlayer, input: CBARules | GmLeagueState): number {
  const { rules, salaryCapM } = cba(input);
  const cap = salaryCapM > 0 ? salaryCapM : 140.588;
  const minimum = Math.max(rules.minSalaryM ?? 0, exceptionAmounts({ salaryCapM: cap }).minimumM);
  const ageMax = cap * (player.age >= 30 ? 0.35 : player.age >= 25 ? 0.30 : 0.25);
  const maximum = Math.max(minimum, Math.min(ageMax, rules.maxSalaryM || cap * 0.35));
  const overall = overallOf(player);
  const upside = player.age <= 25 && overall >= 77 && overall < 88 ? 1.045 : 1;
  const aging = player.age >= 35 ? 0.83 : player.age >= 32 ? 0.94 : 1;
  const injuryRisk = player.injury?.gamesRemaining && player.injury.gamesRemaining > 20 ? 0.94 : 1;
  const estimate = cap * interpolate(overall) * performanceMultiplier(player) * upside * aging * injuryRisk;
  return money(clamp(estimate, minimum, maximum));
}

export function askingYears(player: GmPlayer, input: CBARules | GmLeagueState): number {
  const { rules } = cba(input);
  const overall = overallOf(player);
  let years = overall >= 84 ? 4 : overall >= 79 ? 3 : overall >= 75 ? 2 : 1;
  if (player.age >= 34) years = Math.min(years, 2);
  else if (player.age >= 31) years = Math.min(years, 3);
  if (player.age <= 24 && overall >= 81) years = 4;
  return clamp(years, 1, rules.maxContractYears || 5);
}

/** Reservation price, not a legal minimum. Stars do not accept minimum offers. */
export function minimumAcceptableSalary(
  player: GmPlayer,
  input: CBARules | GmLeagueState,
  lateMarket = false
): number {
  const ask = askingSalary(player, input);
  const { salaryCapM } = cba(input);
  const min = exceptionAmounts({ salaryCapM }).minimumM;
  const overall = overallOf(player);
  const share = overall >= 87 ? 0.93 : overall >= 81 ? 0.87 : overall >= 76 ? 0.81 : 0.74;
  return money(Math.max(min, ask * (share - (lateMarket && overall < 80 ? 0.06 : 0))));
}

export function qualifyingOfferAmount(player: GmPlayer, rules: CBARules): number {
  const min = rules.minSalaryM || 1;
  const last = player.lastSalaryM ?? player.contract?.annualSalaryM ?? min * 2;
  return money(Math.max(min, last));
}

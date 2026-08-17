import type { GmPlayer, GmTeam } from "@/gm/types";
import { clamp } from "@/gm/engine/rng";

export function teamPayrollM(teamId: string, players: GmPlayer[]): number {
  return players
    .filter((p) => p.teamId === teamId && p.contract)
    .reduce((sum, p) => sum + (p.contract?.annualSalaryM ?? 0), 0);
}

export function rosterCount(teamId: string, players: GmPlayer[]): number {
  return players.filter((p) => p.teamId === teamId && !isTwoWay(p)).length;
}

function isTwoWay(p: GmPlayer) {
  return (p.contract?.annualSalaryM ?? 99) < 1.2;
}

export interface CapStatus {
  payrollM: number;
  capRoomM: number;
  overCap: boolean;
  overTax: boolean;
  overFirstApron: boolean;
  overSecondApron: boolean;
  rosterSize: number;
  rosterLegal: boolean;
}

export function capStatus(
  team: GmTeam,
  players: GmPlayer[],
  settings: {
    salaryCapM: number;
    luxuryTaxM: number;
    firstApronM: number;
    secondApronM: number;
    maxRoster: number;
    minRoster: number;
  }
): CapStatus {
  const payrollM = teamPayrollM(team.id, players);
  const rosterSize = rosterCount(team.id, players);
  return {
    payrollM,
    capRoomM: settings.salaryCapM - payrollM,
    overCap: payrollM > settings.salaryCapM,
    overTax: payrollM > settings.luxuryTaxM,
    overFirstApron: payrollM > settings.firstApronM,
    overSecondApron: payrollM > settings.secondApronM,
    rosterSize,
    rosterLegal:
      rosterSize >= settings.minRoster && rosterSize <= settings.maxRoster,
  };
}

/** Soft salary match for trades - simplified NBA-like bands. */
export function salariesMatch(
  outM: number,
  inM: number,
  overCap: boolean
): boolean {
  if (!overCap) return true;
  if (outM === 0) return inM === 0;
  const allowed = outM * 1.25 + 0.1;
  return inM <= allowed + 1e-6;
}

export function playerValue(p: GmPlayer): number {
  const years = p.contract?.yearsRemaining ?? 1;
  const sal = p.contract?.annualSalaryM ?? 8;
  const impact = p.ratings.impact;
  const agePenalty = Math.max(0, p.age - 31) * 0.35;
  const surplus = impact * 4.2 - sal / Math.max(1, years) - agePenalty;
  return clamp(surplus, -40, 80);
}

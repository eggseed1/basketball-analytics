import type {
  GmDeadMoney,
  GmLeagueSettings,
  GmLeagueState,
  GmPlayer,
  GmSignVia,
  GmTeam,
} from "@/gm/types";
import { clamp } from "@/gm/engine/rng";

/** 2024-25 cap, used to scale exception amounts with the year's cap. */
const CAP_ANCHOR = 140.588;

export function exceptionAmounts(settings: GmLeagueSettings) {
  const cap = settings.salaryCapM;
  return {
    nonTaxpayerMleM: roundM(cap * (12.822 / CAP_ANCHOR)),
    taxpayerMleM: roundM(cap * (5.183 / CAP_ANCHOR)),
    biAnnualM: roundM(cap * (4.681 / CAP_ANCHOR)),
    minimumM: roundM(Math.max(1, cap * (2.087 / CAP_ANCHOR))),
    maxSalaryM: roundM(cap * 0.35),
  };
}

function roundM(n: number) {
  return Math.round(n * 100) / 100;
}

export function maxSalaryForAge(age: number, settings: GmLeagueSettings): number {
  const cap = settings.salaryCapM;
  const pct = age >= 30 ? 0.35 : age >= 25 ? 0.3 : 0.25;
  return roundM(cap * pct);
}

export function capHoldM(player: GmPlayer, dead: GmDeadMoney[]): number {
  if (player.teamId != null || !player.rightsTeamId) return 0;
  if (dead.some((row) => row.playerId === player.id)) return 0;
  return player.lastSalaryM ?? 0;
}

export function teamPayrollM(
  teamId: string,
  players: GmPlayer[],
  deadMoney: GmDeadMoney[] = []
): number {
  const salaries = players
    .filter((p) => p.teamId === teamId && p.contract)
    .reduce((sum, p) => sum + (p.contract?.annualSalaryM ?? 0), 0);
  const holds = players
    .filter((p) => p.rightsTeamId === teamId)
    .reduce((sum, p) => sum + capHoldM(p, deadMoney), 0);
  const dead = deadMoney.reduce((sum, row) => sum + row.annualM, 0);
  return salaries + holds + dead;
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
  holdsM: number;
  deadMoneyM: number;
  mleRemainingM: number;
  taxpayerMleRemainingM: number;
  baeAvailable: boolean;
  minimumM: number;
  nonTaxpayerMleM: number;
  taxpayerMleM: number;
  biAnnualM: number;
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
  },
  season?: number
): CapStatus {
  const dead = team.deadMoney ?? [];
  const payrollM = teamPayrollM(team.id, players, dead);
  const rosterSize = rosterCount(team.id, players);
  const amounts = exceptionAmounts(settings);
  const used = exceptionUse(team.id, players, season);
  const holdsM = players
    .filter((p) => p.rightsTeamId === team.id)
    .reduce((sum, p) => sum + capHoldM(p, dead), 0);
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
    holdsM,
    deadMoneyM: dead.reduce((sum, row) => sum + row.annualM, 0),
    mleRemainingM: Math.max(0, amounts.nonTaxpayerMleM - used.mleM),
    taxpayerMleRemainingM: Math.max(0, amounts.taxpayerMleM - used.taxpayerMleM),
    baeAvailable: !used.baeUsed,
    minimumM: amounts.minimumM,
    nonTaxpayerMleM: amounts.nonTaxpayerMleM,
    taxpayerMleM: amounts.taxpayerMleM,
    biAnnualM: amounts.biAnnualM,
  };
}

function exceptionUse(teamId: string, players: GmPlayer[], season?: number) {
  let mleM = 0;
  let taxpayerMleM = 0;
  let baeUsed = false;
  if (season == null) return { mleM, taxpayerMleM, baeUsed };
  for (const player of players) {
    const contract = player.contract;
    if (player.teamId !== teamId || !contract || contract.signedSeason !== season)
      continue;
    if (contract.signedVia === "mle") mleM += contract.annualSalaryM;
    if (contract.signedVia === "taxpayer_mle")
      taxpayerMleM += contract.annualSalaryM;
    if (contract.signedVia === "bae") baeUsed = true;
  }
  return { mleM, taxpayerMleM, baeUsed };
}

/** Soft salary match for trades. Prefer tradeSalaryLegal, which knows aprons. */
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

export function tradeSalaryLegal(input: {
  payrollM: number;
  outM: number;
  inM: number;
  outCount: number;
  inCount: number;
  settings: GmLeagueSettings;
}): { ok: true } | { ok: false; reason: string } {
  const { payrollM, outM, inM, outCount, settings } = input;
  if (input.outCount === 0 && input.inCount === 0) return { ok: true };
  const after = payrollM - outM + inM;
  if (after <= settings.salaryCapM + 0.05) return { ok: true };

  const scale = settings.salaryCapM / CAP_ANCHOR;
  if (payrollM >= settings.secondApronM) {
    if (outCount > 1) {
      return {
        ok: false,
        reason: "Second apron: salaries cannot be combined in one deal.",
      };
    }
    if (inM > outM + 0.1) {
      return {
        ok: false,
        reason:
          "Second apron: incoming salary has to be at or under the outgoing salary.",
      };
    }
    return { ok: true };
  }
  if (payrollM >= settings.firstApronM) {
    if (inM > outM + 0.1) {
      return {
        ok: false,
        reason:
          "First apron: incoming salary has to be at or under the outgoing salary.",
      };
    }
    return { ok: true };
  }
  if (outM <= 0 && inM > 0) {
    return {
      ok: false,
      reason: "Over the cap, a deal has to send salary out to bring salary in.",
    };
  }
  const low = 6.5 * scale;
  const mid = 19.6 * scale;
  const allowed =
    outM <= low
      ? outM * 1.75 + 0.1 * scale
      : outM <= mid
        ? outM + 5 * scale
        : outM * 1.25 + 0.1 * scale;
  if (inM > allowed + 1e-6) {
    return {
      ok: false,
      reason: `Salaries do not match. This deal can bring back about $${allowed.toFixed(1)}M.`,
    };
  }
  return { ok: true };
}

export function evaluateSigning(
  league: GmLeagueState,
  teamId: string,
  player: GmPlayer,
  salaryM: number,
  years: number
): { ok: true; via: GmSignVia } | { ok: false; reason: string } {
  if (!(years >= 1)) {
    return { ok: false, reason: "Deals run at least 1 year." };
  }
  if (years > 5) {
    return { ok: false, reason: "Deals run at most 5 years." };
  }
  if (!(salaryM > 0)) {
    return { ok: false, reason: "Salary has to be above zero." };
  }
  const team = league.teams.find((row) => row.id === teamId);
  if (!team) return { ok: false, reason: "Team not found." };
  const size = rosterCount(teamId, league.players);
  if (size >= league.settings.maxRoster) {
    return {
      ok: false,
      reason: `Roster is full (${league.settings.maxRoster}).`,
    };
  }

  const amounts = exceptionAmounts(league.settings);
  const max = maxSalaryForAge(player.age, league.settings);
  if (salaryM > max + 0.05) {
    return {
      ok: false,
      reason: `That salary is above the max ($${max.toFixed(1)}M).`,
    };
  }
  if (salaryM + 0.05 < amounts.minimumM) {
    return {
      ok: false,
      reason: `Minimum salary is $${amounts.minimumM.toFixed(1)}M.`,
    };
  }

  const dead = team.deadMoney ?? [];
  const hold = player.rightsTeamId === teamId ? capHoldM(player, dead) : 0;
  const base = teamPayrollM(teamId, league.players, dead) - hold;
  const sheet = capStatus(team, league.players, league.settings, league.season);
  const cap = league.settings.salaryCapM;
  const tax = league.settings.luxuryTaxM;
  const first = league.settings.firstApronM;
  const second = league.settings.secondApronM;

  if (base + salaryM <= cap + 0.05) return { ok: true, via: "room" };

  const own = player.rightsTeamId === teamId;
  const last = player.lastSalaryM ?? 0;
  if (own && player.rightsKind === "bird" && salaryM <= max + 0.05) {
    return { ok: true, via: "bird" };
  }
  if (own && player.rightsKind === "early") {
    const ceiling = Math.min(max, Math.max(last * 1.75, amounts.nonTaxpayerMleM));
    if (salaryM <= ceiling + 0.05) return { ok: true, via: "early_bird" };
  }

  const atMinimum = salaryM <= amounts.minimumM + 0.05;
  if (base >= second) {
    if (atMinimum) return { ok: true, via: "minimum" };
    return {
      ok: false,
      reason:
        "Over the second apron. Only a minimum deal, or a Bird re-sign, fits.",
    };
  }
  if (base < tax) {
    if (
      salaryM <= sheet.mleRemainingM + 0.05 &&
      base + salaryM <= first + 0.05
    ) {
      return { ok: true, via: "mle" };
    }
    if (
      sheet.baeAvailable &&
      salaryM <= amounts.biAnnualM + 0.05 &&
      base + salaryM <= tax + 0.05
    ) {
      return { ok: true, via: "bae" };
    }
  } else if (
    salaryM <= sheet.taxpayerMleRemainingM + 0.05 &&
    base + salaryM <= second + 0.05
  ) {
    return { ok: true, via: "taxpayer_mle" };
  }
  if (atMinimum) return { ok: true, via: "minimum" };
  return {
    ok: false,
    reason: `No exception covers $${salaryM.toFixed(1)}M. Mid-level left is $${sheet.mleRemainingM.toFixed(1)}M.`,
  };
}

/** Bird clock: two seasons on the deal becomes early Bird, three becomes full Bird. */
export function advanceBirdRights(
  players: GmPlayer[],
  season: number
): GmPlayer[] {
  return players.map((player) => {
    const contract = player.contract;
    if (!contract || player.teamId == null) return player;
    const seasons = season - contract.signedSeason;
    let bird = contract.birdRights;
    if (seasons >= 3) bird = "bird";
    else if (seasons >= 2 && bird === "none") bird = "early";
    if (bird === contract.birdRights) return player;
    return { ...player, contract: { ...contract, birdRights: bird } };
  });
}

export function tickDeadMoney(team: GmTeam): GmTeam {
  const deadMoney = (team.deadMoney ?? [])
    .map((row) => ({ ...row, yearsLeft: row.yearsLeft - 1 }))
    .filter((row) => row.yearsLeft > 0);
  return { ...team, deadMoney };
}

export function playerValue(p: GmPlayer): number {
  const years = p.contract?.yearsRemaining ?? 1;
  const sal = p.contract?.annualSalaryM ?? 8;
  const impact = p.ratings.impact;
  const agePenalty = Math.max(0, p.age - 31) * 0.35;
  const surplus = impact * 4.2 - sal / Math.max(1, years) - agePenalty;
  return clamp(surplus, -40, 80);
}

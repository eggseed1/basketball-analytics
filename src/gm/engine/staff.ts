import type { GmHeadCoach, GmStaffDead, GmTeam } from "@/gm/types";
import { staffBudgetM } from "@/gm/seed/coaches";

/** What the owner is paying this year for people who are not on the cap. */
export function staffBillM(team: GmTeam): number {
  const coach = team.staff.headCoach.salaryM ?? 0;
  const associate = team.staff.associate?.salaryM ?? 0;
  const trainer = team.staff.trainer?.salaryM ?? 0;
  const scout = team.staff.scout?.salaryM ?? 0;
  const developer = team.staff.developer?.salaryM ?? 0;
  const dead = (team.staff.dead ?? []).reduce((sum, row) => sum + row.annualM, 0);
  return Math.round((coach + associate + trainer + scout + developer + dead) * 10) / 10;
}

export function staffRoom(team: GmTeam, overTax: boolean): { billM: number; budgetM: number; roomM: number } {
  const budgetM = staffBudgetM(team, overTax);
  const billM = staffBillM(team);
  return { billM, budgetM, roomM: Math.round((budgetM - billM) * 10) / 10 };
}

/** Letting a coach go costs 80% of what is left on the deal, each remaining year. A walk year is free. */
export function buyoutOf(coach: GmHeadCoach | null | undefined): GmStaffDead | null {
  if (!coach?.salaryM || !coach.yearsLeft) return null;
  if (coach.walkYear) return null;
  const annualM = Math.round(coach.salaryM * 0.8 * 10) / 10;
  if (annualM <= 0) return null;
  return { name: coach.name, annualM, yearsLeft: coach.yearsLeft };
}

export function hireQuote(
  team: GmTeam,
  overTax: boolean,
  next: { salaryM: number },
  replace: "head" | "associate" | "trainer" | "scout" | "developer"
): { ok: boolean; billM: number; budgetM: number; reason: string } {
  const budgetM = staffBudgetM(team, overTax);
  let bill = staffBillM(team);
  if (replace === "head") {
    bill -= team.staff.headCoach.salaryM ?? 0;
    const buyout = buyoutOf(team.staff.headCoach);
    if (buyout) bill += buyout.annualM;
  } else if (replace === "associate") {
    bill -= team.staff.associate?.salaryM ?? 0;
    const buyout = buyoutOf(team.staff.associate);
    if (buyout) bill += buyout.annualM;
  } else if (replace === "trainer") {
    bill -= team.staff.trainer?.salaryM ?? 0;
  } else if (replace === "developer") {
    bill -= team.staff.developer?.salaryM ?? 0;
  } else {
    bill -= team.staff.scout?.salaryM ?? 0;
  }
  bill = Math.round((bill + next.salaryM) * 10) / 10;
  if (bill > budgetM + 0.05) {
    return {
      ok: false,
      billM: bill,
      budgetM,
      reason: `That deal is $${bill.toFixed(1)}M. The owner will pay $${budgetM.toFixed(1)}M.`,
    };
  }
  return { ok: true, billM: bill, budgetM, reason: "" };
}

export function withHeadCoach(team: GmTeam, hired: GmHeadCoach): GmTeam {
  const buyout = buyoutOf(team.staff.headCoach);
  const dead = [...(team.staff.dead ?? [])];
  if (buyout) dead.push(buyout);
  return {
    ...team,
    staff: {
      ...team.staff,
      headCoach: hired,
      dead,
    },
  };
}

export function asAssociate(coach: GmHeadCoach): GmHeadCoach {
  return {
    ...coach,
    id: `${coach.id ?? coach.name}-assoc`,
    salaryM: Math.round(Math.max(1.6, (coach.salaryM ?? 4) * 0.28) * 10) / 10,
    yearsLeft: 2,
    yearsReported: false,
    salaryReported: false,
    walkYear: false,
    trait: `Associate. ${coach.trait ?? ""}`.trim(),
  };
}

export function withAssociate(team: GmTeam, hired: GmHeadCoach | null): GmTeam {
  const buyout = buyoutOf(team.staff.associate);
  const dead = [...(team.staff.dead ?? [])];
  if (team.staff.associate && buyout) dead.push(buyout);
  return {
    ...team,
    staff: {
      ...team.staff,
      associate: hired,
      dead,
    },
  };
}

/** A season ends. Deals tick down. A last year becomes a walk year. */
export function ageStaff(team: GmTeam): GmTeam {
  const tick = (coach: GmHeadCoach): GmHeadCoach => {
    const years = coach.yearsLeft ?? 1;
    if (years <= 1) return { ...coach, yearsLeft: 1, walkYear: true };
    return { ...coach, yearsLeft: years - 1, walkYear: false };
  };
  const dead = (team.staff.dead ?? [])
    .map((row) => ({ ...row, yearsLeft: row.yearsLeft - 1 }))
    .filter((row) => row.yearsLeft > 0);
  return {
    ...team,
    staff: {
      ...team.staff,
      headCoach: tick(team.staff.headCoach),
      associate: team.staff.associate ? tick(team.staff.associate) : team.staff.associate,
      dead,
    },
  };
}

export function coachEffect(team: GmTeam): { offense: number; defense: number; development: number } {
  const head = team.staff.headCoach;
  const associate = team.staff.associate;
  return {
    offense: head.offenseBonus + (associate ? associate.offenseBonus * 0.4 : 0),
    defense: head.defenseBonus + (associate ? associate.defenseBonus * 0.4 : 0),
    development: head.developmentBonus + (associate ? associate.developmentBonus * 0.4 : 0),
  };
}


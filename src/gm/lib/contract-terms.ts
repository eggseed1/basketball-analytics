import type { GmContract } from "@/gm/types";

/** Remaining money on the game's salary sheet, including future extension rows. */
export function remainingSalaryM(contract: GmContract | null | undefined): number {
  if (!contract || contract.yearsRemaining <= 0) return 0;
  return contract.years?.length ? contract.years.reduce((sum, year) => sum + year.salaryM, 0) : contract.annualSalaryM * contract.yearsRemaining;
}

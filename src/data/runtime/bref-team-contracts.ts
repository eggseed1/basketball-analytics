/**
 * Deploy-baked Basketball-Reference team payroll pages: salary by season with
 * options, guarantees, payroll notes and draft rights.
 * Written by scripts/build-runtime-bref-team-contracts.mjs.
 */
import snapshot from "./bref-team-contracts-snapshot.json";

export type BrefSalaryCell = {
  amount: number;
  option?: "player" | "team";
  notGuaranteed?: true;
} | null;

export type BrefContractRow = {
  name: string;
  brefId: string;
  age?: number;
  years: BrefSalaryCell[];
  guaranteed: number | null;
};

export type BrefDraftRight = {
  name: string;
  brefId: string;
  age: number | null;
  draftYear: number | null;
  draftTeam: string | null;
  round: number | null;
  pick: number | null;
  club: string | null;
  league: string | null;
  country: string | null;
};

export type BrefTeamContracts = {
  code: string;
  retrievedAt: string;
  capSeason?: string;
  salaryCap?: number;
  largestGuarantee?: { name: string; brefId: string | null; amount: number };
  seasons: string[];
  rows: BrefContractRow[];
  totals: { years: Array<number | null>; guaranteed: number | null } | null;
  notes: Record<string, string>;
  draftRights: BrefDraftRight[];
};

type SnapshotFile = { generatedAt?: string; teams?: Record<string, BrefTeamContracts> };

const data = snapshot as unknown as SnapshotFile;

export function bundledContractTeamIds(): string[] {
  return Object.keys(data.teams ?? {});
}

export function bundledTeamContracts(teamId: string): BrefTeamContracts | null {
  const team = data.teams?.[teamId];
  if (!team?.seasons?.length) return null;
  return {
    ...team,
    rows: team.rows.filter((r) => r.brefId),
    draftRights: (team.draftRights ?? []).filter((r) => r.brefId),
  };
}

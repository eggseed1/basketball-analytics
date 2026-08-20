/**
 * Server-side loaders for validated front-office snapshots.
 * Never fetches remote salary/draft sources at request time.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  FrontOfficeLeagueSnapshot,
  TeamDraftAssetsPresentation,
  TeamFrontOfficeArtifact,
  TeamFrontOfficeSummary,
  TeamPayrollPresentation,
} from "@/data/types/front-office";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { resolveTeamBrand } from "@/lib/nba-brand";

const ROOT = () =>
  path.join(process.cwd(), "data", "front-office", "v1");

type TeamSlice = {
  meta: FrontOfficeLeagueSnapshot["meta"];
  cap: FrontOfficeLeagueSnapshot["cap"];
  capabilities: FrontOfficeLeagueSnapshot["capabilities"];
  team: TeamFrontOfficeArtifact;
};

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function resolveFrontOfficeFranchiseId(
  teamKey: string
): string | null {
  const raw = String(teamKey ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw) && raw.length <= 3) return raw; // espn canonical
  const fromNba = getCanonicalTeamFromProvider("nba", raw);
  if (fromNba) return fromNba.canonicalTeamId;
  const fromEspn = getCanonicalTeamFromProvider("espn", raw);
  if (fromEspn) return fromEspn.canonicalTeamId;
  const brand = resolveTeamBrand(raw);
  if (brand?.espnTeamId) return brand.espnTeamId;
  return raw;
}

export function loadFrontOfficeManifest() {
  return readJson<{
    snapshotDate: string;
    retrievedAt: string;
    sourceHash: string;
    status: string;
    season: string;
    teamsWithPayroll: number;
    playersWithSalary: number;
    capabilities: FrontOfficeLeagueSnapshot["capabilities"];
  }>(path.join(ROOT(), "manifest.json"));
}

export function loadTeamFrontOfficeSlice(
  franchiseId: string
): TeamSlice | null {
  const id = resolveFrontOfficeFranchiseId(franchiseId);
  if (!id) return null;
  return readJson<TeamSlice>(path.join(ROOT(), "teams", `${id}.json`));
}

export function buildTeamPayrollPresentation(
  slice: TeamSlice
): TeamPayrollPresentation {
  const disclosures = [
    "Section label: Payroll & Contracts (not a complete cap sheet).",
    "Shown figures are Player Salary Commitments for the listed season only.",
    "Multi-year option/guarantee schedules are UNAVAILABLE from current sources.",
    "Cap holds, dead money, and exceptions are UNAVAILABLE.",
    "Do not treat commitments − cap as Cap Space.",
  ];
  if (slice.cap.status === "PROJECTED") {
    disclosures.unshift("Cap thresholds marked Projected are not official.");
  }
  return {
    team: {
      franchiseId: slice.team.franchiseId,
      abbr: slice.team.abbr,
      displayName: slice.team.displayName,
    },
    season: slice.meta.season,
    updatedAt: slice.meta.retrievedAt,
    snapshotStatus: slice.meta.status,
    capContext: slice.cap,
    summary: {
      playerSalaryCommitments:
        slice.team.payroll.playersWithSalary > 0
          ? slice.team.payroll.playerSalaryCommitments
          : null,
      playersWithSalary: slice.team.payroll.playersWithSalary,
      playersWithoutSalary: slice.team.payroll.playersWithoutSalary,
      label: "Player Salary Commitments",
    },
    contractRows: slice.team.payroll.contractRows,
    futureCommitments: slice.team.payroll.futureCommitments,
    capabilities: slice.capabilities,
    disclosures,
  };
}

export function buildTeamDraftAssetsPresentation(
  slice: TeamSlice
): TeamDraftAssetsPresentation {
  const reason =
    slice.team.draftAssets.unavailableReason ??
    "Draft asset data unavailable";
  return {
    franchise: {
      franchiseId: slice.team.franchiseId,
      abbr: slice.team.abbr,
      displayName: slice.team.displayName,
    },
    updatedAt: slice.meta.retrievedAt,
    snapshotStatus: slice.meta.status,
    summary: {
      futureFirstsControlled: null,
      futureSecondsControlled: null,
      unavailableReason: reason,
    },
    assetsByYear: {},
    swaps: [],
    outgoing: [],
    capabilities: slice.capabilities,
    disclosures: [
      "Draft asset ledger requires an authoritative current snapshot or validated starting ownership plus complete transaction chain.",
      "Repository structured draft-asset count: 0.",
      "Showing unavailable state — never a false zero.",
    ],
  };
}

export function buildTeamFrontOfficeSummary(
  slice: TeamSlice
): TeamFrontOfficeSummary {
  const id = slice.team.franchiseId;
  const salaryOk = slice.team.payroll.playersWithSalary > 0;
  return {
    franchiseId: id,
    season: slice.meta.season,
    updatedAt: slice.meta.retrievedAt,
    playerSalaryCommitments: salaryOk
      ? slice.team.payroll.playerSalaryCommitments
      : null,
    futureFirstsControlled: null,
    futureSecondsControlled: null,
    payrollHref: `/teams/${id}/payroll`,
    draftAssetsHref: `/teams/${id}/draft-assets`,
    capabilities: slice.capabilities,
    disclosures: [
      "Draft asset counts omitted — source unavailable.",
      salaryOk
        ? "Salary figure is Player Salary Commitments (not Cap Space)."
        : "Salary data unavailable for this franchise snapshot.",
    ],
  };
}

export function isCurrentFrontOfficeSeason(season: string | null | undefined) {
  const manifest = loadFrontOfficeManifest();
  if (!manifest) return false;
  if (!season) return true;
  return season === manifest.season;
}

/**
 * Server-side loaders for validated front-office snapshots.
 * Never fetches remote salary/draft sources at request time unless explicitly
 * resolving the current live roster outside the Vercel critical path.
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
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { isVercelRuntime } from "@/data/providers/nba/runtime-policy";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { DraftAsset } from "@/data/types/front-office";

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
    "Cap space shown is salary cap minus player commitments only (approximate).",
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
  const assets = slice.team.draftAssets.assets ?? [];
  const hasAssets = assets.length > 0;
  const assetsByYear: Record<string, DraftAsset[]> = {};
  for (const asset of assets) {
    const key = String(asset.draftYear);
    assetsByYear[key] = [...(assetsByYear[key] ?? []), asset];
  }
  const firsts = assets.filter(
    (a) => a.round === 1 && a.ownershipStatus === "CURRENTLY_OWNED"
  ).length;
  const seconds = assets.filter(
    (a) => a.round === 2 && a.ownershipStatus === "CURRENTLY_OWNED"
  ).length;

  return {
    franchise: {
      franchiseId: slice.team.franchiseId,
      abbr: slice.team.abbr,
      displayName: slice.team.displayName,
    },
    updatedAt: slice.meta.retrievedAt,
    snapshotStatus: slice.meta.status,
    summary: {
      futureFirstsControlled: hasAssets ? firsts : null,
      futureSecondsControlled: hasAssets ? seconds : null,
      unavailableReason: hasAssets
        ? null
        : (slice.team.draftAssets.unavailableReason ??
          "Draft asset data unavailable"),
    },
    assetsByYear,
    swaps: slice.team.draftAssets.swaps ?? [],
    outgoing: assets.filter((a) => a.ownershipStatus === "OWED_OUT"),
    capabilities: slice.capabilities,
    disclosures: hasAssets
      ? [
          "Own first and second round picks shown for 2027–2030.",
          "Traded, conveyed, protected, and swap-affected picks are not modeled yet.",
        ]
      : [
          "Draft asset ledger requires an authoritative current snapshot or validated starting ownership plus complete transaction chain.",
          "Showing unavailable state — never a false zero.",
        ],
  };
}

export function buildTeamFrontOfficeSummary(
  slice: TeamSlice
): TeamFrontOfficeSummary {
  const id = slice.team.franchiseId;
  const salaryOk = slice.team.payroll.playersWithSalary > 0;
  const assets = slice.team.draftAssets.assets ?? [];
  const hasAssets = assets.length > 0;
  const firsts = hasAssets
    ? assets.filter(
        (a) => a.round === 1 && a.ownershipStatus === "CURRENTLY_OWNED"
      ).length
    : null;
  const seconds = hasAssets
    ? assets.filter(
        (a) => a.round === 2 && a.ownershipStatus === "CURRENTLY_OWNED"
      ).length
    : null;
  return {
    franchiseId: id,
    season: slice.meta.season,
    updatedAt: slice.meta.retrievedAt,
    playerSalaryCommitments: salaryOk
      ? slice.team.payroll.playerSalaryCommitments
      : null,
    futureFirstsControlled: firsts,
    futureSecondsControlled: seconds,
    payrollHref: `/teams/${id}/payroll`,
    draftAssetsHref: `/teams/${id}/draft-assets`,
    capabilities: slice.capabilities,
    disclosures: hasAssets
      ? [
          "Draft picks are baseline own picks; trades and protections not modeled.",
          salaryOk
            ? "Salary figure is Player Salary Commitments (approximate cap space on Cap & assets)."
            : "Salary data unavailable for this franchise snapshot.",
        ]
      : [
          "Draft asset counts omitted — source unavailable.",
          salaryOk
            ? "Salary figure is Player Salary Commitments (approximate cap space on Cap & assets)."
            : "Salary data unavailable for this franchise snapshot.",
        ],
  };
}

export function getCurrentFrontOfficeSeason(now = new Date()): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear(now));
}

export function isCurrentFrontOfficeSeason(season: string | null | undefined) {
  const nowSeason = getCurrentFrontOfficeSeason();
  if (!season) return true;
  return season === nowSeason;
}

function liveFrontOfficeEnabled(): boolean {
  return (
    !isVercelRuntime() ||
    process.env.ALLOW_LIVE_FRONT_OFFICE_ON_VERCEL === "1"
  );
}

/**
 * Prefer a validated disk snapshot on Vercel. Live ESPN roster synthesis is an
 * optional refresh, never a hard dependency for player/team route rendering.
 */
export async function resolveTeamFrontOfficeSlice(
  franchiseId: string,
  season?: string | null
): Promise<TeamSlice | null> {
  const id = resolveFrontOfficeFranchiseId(franchiseId);
  if (!id) return null;

  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const targetSeason = season ?? nowSeason;
  const cached = loadTeamFrontOfficeSlice(id);

  if (targetSeason === nowSeason) {
    // In serverless production, the committed snapshot is the deterministic
    // first choice. A blocked roster endpoint must not reject the whole route.
    if (!liveFrontOfficeEnabled()) return cached;

    try {
      const { buildLiveTeamFrontOfficeSlice } = await import(
        "@/data/front-office/build-live-front-office"
      );
      const live = await buildLiveTeamFrontOfficeSlice(id);
      if (live) return live;
    } catch (error) {
      console.error("[front-office] live roster refresh failed", {
        franchiseId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // A last validated snapshot is preferable to a route exception. Its own
    // metadata carries the actual snapshot season/date, so the UI stays honest.
    return cached;
  }

  return cached?.meta.season === targetSeason ? cached : null;
}
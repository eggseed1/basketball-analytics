import "server-only";

import { cache } from "react";

import { getCanonicalTeamFromProvider, listCanonicalTeams } from "@/data/identity/team-map";
import { fetchEspnTeamRosterPlayers } from "@/data/providers/nba/espn-roster-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import type {
  DraftAsset,
  FrontOfficeCapabilities,
  LeagueCapSeason,
  PlayerContractYear,
  TeamContractRow,
  TeamFrontOfficeArtifact,
} from "@/data/types/front-office";
import { FRONT_OFFICE_METHODOLOGY_VERSION } from "@/data/types/front-office";
import { playerPageHref } from "@/lib/player-season-resolve";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

type BoardRow = {
  playerId: string;
  playerName: string;
  primaryTeamId: string | null;
};

function loadSalaryMap(seasonStart: number): Map<string, number> {
  const csvPath = path.join(
    process.cwd(),
    "data",
    "salaries",
    "player-salaries-2000-2025.csv"
  );
  if (!existsSync(csvPath)) return new Map();
  const raw = readFileSync(csvPath, "utf8");
  const map = new Map<string, number>();
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const last = line.lastIndexOf(",");
    const second = line.lastIndexOf(",", last - 1);
    if (last < 0 || second < 0) continue;
    const player = line.slice(0, second).trim();
    const dollars = Number(line.slice(second + 1, last).trim());
    const season = Number(line.slice(last + 1).trim());
    if (season !== seasonStart || !Number.isFinite(dollars)) continue;
    const key = normalizePlayerName(player);
    const prev = map.get(key);
    if (prev == null || dollars > prev) map.set(key, Math.trunc(dollars));
  }
  return map;
}

function loadCap(season: string): LeagueCapSeason {
  const p = path.join(process.cwd(), "data", "cba", "league-cap-seasons.json");
  const j = JSON.parse(readFileSync(p, "utf8")) as {
    seasons: LeagueCapSeason[];
  };
  const hit = j.seasons.find((s) => s.season === season);
  if (!hit) throw new Error(`Missing LeagueCapSeason for ${season}`);
  return hit;
}

function defaultCapabilities(): FrontOfficeCapabilities {
  return {
    PAYROLL: "PARTIAL",
    CONTRACTS: "PARTIAL",
    CAP_THRESHOLDS: "SUPPORTED",
    FULL_CAP_ACCOUNTING: "UNAVAILABLE",
    FIRST_ROUND_ASSETS: "PARTIAL",
    SECOND_ROUND_ASSETS: "PARTIAL",
    SWAPS: "UNAVAILABLE",
    PROTECTIONS: "UNAVAILABLE",
    TRANSACTION_PROVENANCE: "UNAVAILABLE",
    CAP_HOLDS: "UNAVAILABLE",
    DEAD_MONEY: "UNAVAILABLE",
  };
}

function nbaToFranchise(nbaTeamId: string | null | undefined) {
  if (!nbaTeamId || nbaTeamId === "0") return null;
  return getCanonicalTeamFromProvider("nba", nbaTeamId);
}

function baselineOwnPicks(
  franchiseId: string,
  retrievedAt: string
): DraftAsset[] {
  const assets: DraftAsset[] = [];
  for (const draftYear of [2027, 2028, 2029, 2030]) {
    for (const round of [1, 2] as const) {
      assets.push({
        assetId: `own-${franchiseId}-${draftYear}-r${round}`,
        draftYear,
        round,
        originalFranchiseId: franchiseId,
        currentHolderFranchiseId: franchiseId,
        assetType: "OWN_PICK",
        ownershipStatus: "CURRENTLY_OWNED",
        protection: "UNPROTECTED",
        protectionText: null,
        swap: false,
        conveyance: null,
        sourceTransactionId: null,
        source: "baseline-own-pick",
        lastVerified: retrievedAt,
      });
    }
  }
  return assets;
}

async function loadTeamRosterRows(
  franchiseId: string,
  season: string
): Promise<BoardRow[]> {
  const players = await fetchEspnTeamRosterPlayers(franchiseId, season);
  return players.map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    primaryTeamId: row.teamId,
  }));
}

export type LiveFrontOfficeSlice = {
  meta: {
    methodologyVersion: string;
    snapshotDate: string;
    retrievedAt: string;
    sourceSet: string[];
    sourceHash: string;
    status: "VALIDATED";
    season: string;
    seasonStartYear: number;
  };
  cap: LeagueCapSeason;
  capabilities: FrontOfficeCapabilities;
  team: TeamFrontOfficeArtifact;
};

/** Build current-season payroll from live ESPN roster + salary carry-forward. */
export const buildLiveTeamFrontOfficeSlice = cache(
  async (franchiseId: string): Promise<LiveFrontOfficeSlice | null> => {
    const season = canonicalSeasonFromStartYear(currentNbaStartYear());
    const seasonStart = currentNbaStartYear();
    const teams = listCanonicalTeams();
    const team = teams.find((t) => t.canonicalTeamId === franchiseId);
    if (!team) return null;

    const retrievedAt = new Date().toISOString();
    const salariesCurrent = loadSalaryMap(seasonStart);
    const salariesPrior = loadSalaryMap(seasonStart - 1);
    const board = await loadTeamRosterRows(franchiseId, season);
    const cap = loadCap(season);

    const contractRows: TeamContractRow[] = [];
    let commitments = 0;
    let withSalary = 0;
    let withoutSalary = 0;

    for (const row of board) {
      const franchise = nbaToFranchise(row.primaryTeamId);
      if (!franchise || franchise.canonicalTeamId !== franchiseId) continue;

      const key = normalizePlayerName(row.playerName);
      const salary =
        salariesCurrent.get(key) ??
        salariesPrior.get(key) ??
        null;
      const source =
        salariesCurrent.get(key) != null
          ? "salary-csv-2000-2025"
          : salariesPrior.get(key) != null
            ? "salary-csv-carry-forward"
            : "roster-board-no-salary";

      const contractId = `cy-${row.playerId}-${seasonStart}`;
      const year: PlayerContractYear = {
        contractId,
        playerId: row.playerId,
        franchiseId,
        season,
        salary,
        capHit: salary,
        guaranteedAmount: null,
        guaranteeStatus: "UNKNOWN",
        optionType: "UNKNOWN",
        source,
      };

      contractRows.push({
        playerId: row.playerId,
        playerName: row.playerName,
        age: null,
        contractId,
        contractType: "UNKNOWN",
        years: [year],
        guaranteedTotal: salary,
        href: playerPageHref(row.playerId),
      });

      if (salary != null) {
        commitments += salary;
        withSalary += 1;
      } else {
        withoutSalary += 1;
      }
    }

    contractRows.sort((a, b) => {
      const sa = a.years[0]?.salary ?? -1;
      const sb = b.years[0]?.salary ?? -1;
      return sb - sa;
    });

    const ownPicks = baselineOwnPicks(franchiseId, retrievedAt);
    const firsts = ownPicks.filter((a) => a.round === 1).length;
    const seconds = ownPicks.filter((a) => a.round === 2).length;

    const artifact: TeamFrontOfficeArtifact = {
      franchiseId,
      abbr: team.abbr,
      displayName: team.displayName,
      payroll: {
        franchiseId,
        abbr: team.abbr,
        displayName: team.displayName,
        season,
        contractRows,
        futureCommitments:
          withSalary > 0
            ? [
                {
                  season,
                  totalSalaryDollars: commitments,
                  playersUnderContract: withSalary,
                },
              ]
            : [],
        playerSalaryCommitments: commitments,
        playersWithSalary: withSalary,
        playersWithoutSalary: withoutSalary,
      },
      draftAssets: {
        franchiseId,
        abbr: team.abbr,
        displayName: team.displayName,
        assets: ownPicks,
        swaps: [],
        unavailableReason: null,
      },
      capabilities: defaultCapabilities(),
    };

    return {
      meta: {
        methodologyVersion: FRONT_OFFICE_METHODOLOGY_VERSION,
        snapshotDate: retrievedAt.slice(0, 10),
        retrievedAt,
        sourceSet: [
          "live-espn-roster",
          "data/salaries/player-salaries-2000-2025.csv",
          "data/cba/league-cap-seasons.json",
        ],
        sourceHash: "live",
        status: "VALIDATED",
        season,
        seasonStartYear: seasonStart,
      },
      cap,
      capabilities: defaultCapabilities(),
      team: artifact,
    };
  }
);

export function countTeamDraftAssets(assets: DraftAsset[]) {
  const firsts = assets.filter(
    (a) => a.round === 1 && a.ownershipStatus === "CURRENTLY_OWNED"
  ).length;
  const seconds = assets.filter(
    (a) => a.round === 2 && a.ownershipStatus === "CURRENTLY_OWNED"
  ).length;
  return { firsts, seconds };
}

import "server-only";

import { cache } from "react";

import { getTeamContracts } from "@/data/queries/team-contracts";
import {
  contractValueGaps,
  contractValueModel,
  getTeamContractValue,
  listContractValues,
} from "@/data/runtime/contract-value";
import type {
  ContractSurplusMeta,
  PlayerSurplusRow,
  TeamSurplusContract,
  TeamSurplusRow,
} from "@/lib/contract-surplus";
import { listCanonicalTeams } from "@/data/identity/team-map";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { conferenceForEspnTeamId } from "@/lib/team-viz";

function teamKeyFor(teamId: string): string {
  return resolveTeamBrand(teamId)?.abbr.toUpperCase() ?? teamId;
}

function playerIdFromHref(href: string | undefined): string | null {
  return href?.match(/^\/players\/([^/?#]+)/)?.[1] ?? null;
}

export const getPlayerSurplusRows = cache((): PlayerSurplusRow[] => {
  const contractsByTeam = new Map<string, ReturnType<typeof getTeamContracts>>();
  const contractsFor = (teamId: string) => {
    if (!contractsByTeam.has(teamId)) contractsByTeam.set(teamId, getTeamContracts(teamId));
    return contractsByTeam.get(teamId) ?? null;
  };
  return listContractValues()
    .map((entry) => {
      const contracts = contractsFor(entry.teamId);
      const name = contracts?.rows.find((r) => r.brefId === entry.brefId)?.name ?? entry.brefId;
      return {
        brefId: entry.brefId,
        playerId: playerIdFromHref(contracts?.hrefs[entry.brefId]),
        name,
        teamId: entry.teamId,
        teamKey: teamKeyFor(entry.teamId),
        salary: entry.salary,
        worth: entry.worth,
        surplus: entry.surplus,
        surplusLow: entry.surplusLow,
        surplusHigh: entry.surplusHigh,
        firstSeason: entry.seasons[0] ?? "",
        lastSeason: entry.seasons.at(-1) ?? "",
        rank: 0,
      };
    })
    .sort((a, b) => b.surplus - a.surplus || a.name.localeCompare(b.name))
    .map((row, i) => ({ ...row, rank: i + 1 }));
});

export const getTeamSurplusRows = cache((): TeamSurplusRow[] => {
  const rows: TeamSurplusRow[] = [];
  for (const team of listCanonicalTeams()) {
    const teamId = team.providerIds.espn;
    if (!teamId) continue;
    const value = getTeamContractValue(teamId);
    if (!value) continue;
    const contracts = getTeamContracts(teamId);
    const pick = (i: number): TeamSurplusContract | null => {
      const p = value.players.at(i);
      if (!p) return null;
      return {
        name: contracts?.rows.find((r) => r.brefId === p.brefId)?.name ?? p.brefId,
        href: contracts?.hrefs[p.brefId] ?? null,
        surplus: p.surplus,
      };
    };
    rows.push({
      teamId,
      teamKey: teamKeyFor(teamId),
      name: team.displayName,
      conference: conferenceForEspnTeamId(teamId),
      surplus: value.surplus,
      salary: value.totalSalary,
      worth: value.totalWorth,
      valued: value.players.length,
      missing: value.missing.length,
      rank: value.rank,
      best: pick(0),
      worst: value.players.length > 1 ? pick(-1) : null,
    });
  }
  return rows.sort((a, b) => a.rank - b.rank);
});

export function getContractSurplusMeta(): ContractSurplusMeta {
  const gaps = contractValueGaps();
  const model = contractValueModel();
  return {
    capSeason: model.capSeason,
    contracts: model.contracts,
    leftOut: gaps["no-drbl"] + gaps.thin,
  };
}

import "server-only";

import { cache } from "react";

import { getTeamContracts } from "@/data/queries/team-contracts";
import {
  contractValueGaps,
  contractValueModel,
  getContractValue,
  getTeamContractValue,
  listContractValues,
} from "@/data/runtime/contract-value";
import {
  TEAM_SURPLUS_SPANS,
  type ContractSurplusMeta,
  type PlayerSurplusRow,
  type TeamSurplusContract,
  type TeamSurplusRow,
  type TeamSurplusSpan,
  type TeamSurplusTotals,
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

type SpanContract = { brefId: string; surplus: number; salary: number; worth: number };

function spanContracts(teamId: string, brefIds: string[], capSeason: string): Record<TeamSurplusSpan, SpanContract[]> {
  const out: Record<TeamSurplusSpan, SpanContract[]> = { total: [], perSeason: [], capSeason: [] };
  for (const brefId of brefIds) {
    const value = getContractValue(teamId, brefId);
    if (value?.kind !== "estimate" || !value.years.length) continue;
    const seasons = value.years.length;
    out.total.push({ brefId, surplus: value.surplus, salary: value.totalSalary, worth: value.totalWorth });
    out.perSeason.push({
      brefId,
      surplus: value.surplus / seasons,
      salary: value.totalSalary / seasons,
      worth: value.totalWorth / seasons,
    });
    const year = value.years.find((y) => y.season === capSeason);
    if (year) out.capSeason.push({ brefId, surplus: year.surplus, salary: year.salary, worth: year.worth });
  }
  return out;
}

export const getTeamSurplusRows = cache((): TeamSurplusRow[] => {
  const { capSeason } = contractValueModel();
  const rows: TeamSurplusRow[] = [];
  for (const team of listCanonicalTeams()) {
    const teamId = team.providerIds.espn;
    if (!teamId) continue;
    const value = getTeamContractValue(teamId);
    if (!value) continue;
    const contracts = getTeamContracts(teamId);
    const named = (p: SpanContract | undefined): TeamSurplusContract | null =>
      p
        ? {
            name: contracts?.rows.find((r) => r.brefId === p.brefId)?.name ?? p.brefId,
            href: contracts?.hrefs[p.brefId] ?? null,
            surplus: p.surplus,
          }
        : null;
    const bySpan = spanContracts(teamId, value.players.map((p) => p.brefId), capSeason);
    const spans = Object.fromEntries(
      TEAM_SURPLUS_SPANS.map((span) => {
        const list = [...bySpan[span]].sort((a, b) => b.surplus - a.surplus);
        const sum = (pick: (c: SpanContract) => number) => list.reduce((s, c) => s + pick(c), 0);
        const totals: TeamSurplusTotals = {
          surplus: sum((c) => c.surplus),
          salary: sum((c) => c.salary),
          worth: sum((c) => c.worth),
          contracts: list.length,
          rank: 0,
          best: named(list[0]),
          worst: list.length > 1 ? named(list.at(-1)) : null,
        };
        return [span, totals];
      })
    ) as Record<TeamSurplusSpan, TeamSurplusTotals>;
    rows.push({
      teamId,
      teamKey: teamKeyFor(teamId),
      name: team.displayName,
      conference: conferenceForEspnTeamId(teamId),
      valued: value.players.length,
      missing: value.missing.length,
      spans,
    });
  }
  for (const span of TEAM_SURPLUS_SPANS) {
    [...rows]
      .sort((a, b) => b.spans[span].surplus - a.spans[span].surplus)
      .forEach((row, i) => {
        row.spans[span].rank = i + 1;
      });
  }
  return rows.sort((a, b) => a.spans.total.rank - b.spans.total.rank);
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

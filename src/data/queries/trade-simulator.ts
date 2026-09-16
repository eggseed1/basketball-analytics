import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import { listRuntimeFrontOfficeFranchiseIds } from "@/data/runtime/front-office-snapshot";
import { loadTeamFrontOfficeSlice } from "@/data/front-office/load-team-front-office";
import type { LeagueCapSeason } from "@/data/types/front-office";
import type { TradeSimPlayer, TradeSimTeam } from "@/lib/trade-simulator";

export type TradeSimulatorBoard = {
  season: string;
  cap: Pick<
    LeagueCapSeason,
    | "salaryCap"
    | "luxuryTax"
    | "firstApron"
    | "secondApron"
    | "status"
    | "source"
  >;
  teams: TradeSimTeam[];
};

function salaryForSeason(
  years: Array<{ season: string; salary: number | null }>,
  season: string
): number | null {
  const year = years.find((row) => row.season === season);
  return year?.salary ?? null;
}

export function loadTradeSimulatorBoard(): TradeSimulatorBoard | null {
  const slices = listRuntimeFrontOfficeFranchiseIds()
    .map((id) => loadTeamFrontOfficeSlice(id))
    .filter((slice) => slice != null);
  if (!slices.length) return null;

  const season = slices[0].team.payroll.season || slices[0].meta.season;
  const drblByNba = new Map(
    getBundledDrblSeason(season).map((row) => [row.playerId, row.drbl100])
  );
  const aliases = getBundledPlayerIdAliasIndex();

  const teams: TradeSimTeam[] = slices.map((slice) => {
    const payroll = slice.team.payroll;
    const players: TradeSimPlayer[] = payroll.contractRows
      .map((row) => {
        const salary = salaryForSeason(row.years, payroll.season);
        const drbl = drblByNba.get(row.playerId);
        const espn = aliases.byNba.get(row.playerId)?.espnPlayerId?.trim();
        return {
          id: row.playerId,
          name: row.playerName,
          href: espn
            ? `/players/${espn}`
            : row.href?.trim() || `/players/${row.playerId}`,
          salary,
          drbl100: drbl != null && Number.isFinite(drbl) ? drbl : null,
        };
      })
      .sort((a, b) => (b.salary ?? -1) - (a.salary ?? -1) || a.name.localeCompare(b.name));
    return {
      id: slice.team.franchiseId,
      abbr: slice.team.abbr,
      name: slice.team.displayName,
      knownCommitments: payroll.playerSalaryCommitments,
      playersWithoutSalary: payroll.playersWithoutSalary,
      players,
    };
  });

  teams.sort((a, b) => a.abbr.localeCompare(b.abbr));
  const cap = slices[0].cap;
  return {
    season,
    cap: {
      salaryCap: cap.salaryCap,
      luxuryTax: cap.luxuryTax,
      firstApron: cap.firstApron,
      secondApron: cap.secondApron,
      status: cap.status,
      source: cap.source,
    },
    teams,
  };
}

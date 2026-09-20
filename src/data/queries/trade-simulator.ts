import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import { getBundledBrefPeerBoard } from "@/data/runtime/bref-advanced-snapshot";
import { listRuntimeFrontOfficeFranchiseIds } from "@/data/runtime/front-office-snapshot";
import { loadTeamFrontOfficeSlice } from "@/data/front-office/load-team-front-office";
import type { LeagueCapSeason } from "@/data/types/front-office";
import type { PlayerSeason } from "@/data/types";
import { normalizePlayerName } from "@/lib/player-name";
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

const BREF_TEAM: Record<string, string> = {
  BKN: "BRK",
  CHA: "CHO",
  PHX: "PHO",
};

function brefTeam(abbr: string): string {
  const key = abbr.toUpperCase();
  return BREF_TEAM[key] ?? key;
}

function profileFromBoard(
  board: PlayerSeason[],
  byEspn: Map<string, PlayerSeason>,
  espnId: string | null,
  name: string,
  teamAbbr: string
): PlayerSeason | null {
  if (espnId) {
    const hit = byEspn.get(espnId);
    if (hit) return hit;
  }
  const want = normalizePlayerName(name);
  const team = brefTeam(teamAbbr);
  return (
    board.find(
      (row) =>
        normalizePlayerName(row.playerName) === want &&
        (row.teamAbbreviation === team || row.teamAbbreviation === teamAbbr)
    ) ?? null
  );
}

function rate(total: number | undefined, games: number | undefined): number | null {
  if (total == null || games == null || games <= 0) return null;
  return total / games;
}

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
    getBundledDrblSeason(season).map((row) => [row.playerId, row] as const)
  );
  const board = getBundledBrefPeerBoard(season);
  const boardByEspn = new Map(
    board
      .filter((row) => /^\d+$/.test(row.playerId))
      .map((row) => [row.playerId, row] as const)
  );
  const aliases = getBundledPlayerIdAliasIndex();

  const teams: TradeSimTeam[] = slices.map((slice) => {
    const payroll = slice.team.payroll;
    const players: TradeSimPlayer[] = payroll.contractRows
      .map((row) => {
        const salary = salaryForSeason(row.years, payroll.season);
        const drbl = drblByNba.get(row.playerId);
        const espn =
          aliases.byNba.get(row.playerId)?.espnPlayerId?.trim() || null;
        const profile = profileFromBoard(
          board,
          boardByEspn,
          espn,
          row.playerName,
          payroll.abbr
        );
        const games = profile?.gamesPlayed ?? null;
        return {
          id: row.playerId,
          name: row.playerName,
          href: espn
            ? `/players/${espn}`
            : row.href?.trim() || `/players/${row.playerId}`,
          salary,
          drbl100:
            drbl?.drbl100 != null && Number.isFinite(drbl.drbl100)
              ? drbl.drbl100
              : null,
          drblO:
            drbl && Number.isFinite(drbl.drblO) ? drbl.drblO : null,
          drblD:
            drbl && Number.isFinite(drbl.drblD) ? drbl.drblD : null,
          war1:
            drbl?.r1WinEquivalents != null &&
            Number.isFinite(drbl.r1WinEquivalents)
              ? drbl.r1WinEquivalents
              : null,
          position: profile?.position ? String(profile.position) : null,
          age: profile?.age ?? null,
          games,
          mpg: rate(profile?.minutes, games ?? undefined),
          points: rate(profile?.points, games ?? undefined),
          assists: rate(profile?.assists, games ?? undefined),
          rebounds: rate(profile?.rebounds, games ?? undefined),
          steals: rate(profile?.steals, games ?? undefined),
          blocks: rate(profile?.blocks, games ?? undefined),
          ts: profile?.trueShootingPct ?? null,
          usg: profile?.usagePct ?? null,
          bpm: profile?.bpm ?? null,
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

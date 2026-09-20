import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import { getBundledBrefPeerBoard } from "@/data/runtime/bref-advanced-snapshot";
import {
  getBundledCurrentRosterEntry,
  bundledCurrentRosterMeta,
} from "@/data/runtime/current-roster-snapshot";
import { listRuntimeFrontOfficeFranchiseIds } from "@/data/runtime/front-office-snapshot";
import { loadTeamFrontOfficeSlice } from "@/data/front-office/load-team-front-office";
import {
  getCanonicalTeamById,
  resolveCanonicalTeam,
} from "@/data/identity/team-map";
import type { LeagueCapSeason } from "@/data/types/front-office";
import type { PlayerSeason } from "@/data/types";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { normalizePlayerName } from "@/lib/player-name";
import type { TradeSimPlayer, TradeSimTeam } from "@/lib/trade-simulator";

export type TradeSimulatorBoard = {
  /** Roster / payroll / cap season (may be preseason with no box score yet). */
  season: string;
  /** Last season with DRBL / peer board rows used for impact + rates. */
  statsSeason: string;
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

/**
 * Prefer the roster season when it has impact data; otherwise walk back.
 * Keeps current-team membership while scoring deals on completed seasons.
 */
export function resolveTradeStatsSeason(rosterSeason: string): string {
  const candidates = [
    rosterSeason,
    shiftCanonicalSeason(rosterSeason, -1),
    shiftCanonicalSeason(rosterSeason, -2),
  ];
  for (const season of candidates) {
    const drbl = getBundledDrblSeason(season);
    if (drbl.some((row) => row.drbl100 != null && Number.isFinite(row.drbl100))) {
      return season;
    }
    if (getBundledBrefPeerBoard(season).length >= 100) {
      return season;
    }
  }
  return shiftCanonicalSeason(rosterSeason, -1);
}

function profileFromBoard(
  board: PlayerSeason[],
  byEspn: Map<string, PlayerSeason>,
  byName: Map<string, PlayerSeason>,
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
  const sameTeam = board.find(
    (row) =>
      normalizePlayerName(row.playerName) === want &&
      (row.teamAbbreviation === team || row.teamAbbreviation === teamAbbr)
  );
  if (sameTeam) return sameTeam;
  // Offseason movers: prior-season board still has the old team abbr.
  return byName.get(want) ?? null;
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
  if (year?.salary != null) return year.salary;
  for (let i = years.length - 1; i >= 0; i--) {
    if (years[i]?.salary != null) return years[i]!.salary;
  }
  return null;
}

/** Resolve current franchise id from ESPN current-roster snapshot. */
function currentFranchiseIdForPlayer(
  playerId: string,
  espnId: string | null
): string | null {
  const entry =
    getBundledCurrentRosterEntry(espnId) ??
    getBundledCurrentRosterEntry(playerId);
  if (!entry) return null;
  const abbr = entry.teamAbbr?.trim() ?? "";
  if (abbr && !/^\d+$/.test(abbr)) {
    const byAbbr = resolveCanonicalTeam(abbr);
    if (byAbbr.status === "resolved") return byAbbr.team.canonicalTeamId;
  }
  const byId = resolveCanonicalTeam(entry.teamId);
  if (byId.status === "resolved") return byId.team.canonicalTeamId;
  const direct = getCanonicalTeamById(entry.teamId);
  return direct?.canonicalTeamId ?? null;
}

export function loadTradeSimulatorBoard(): TradeSimulatorBoard | null {
  const slices = listRuntimeFrontOfficeFranchiseIds()
    .map((id) => loadTeamFrontOfficeSlice(id))
    .filter((slice) => slice != null);
  if (!slices.length) return null;

  const foSeason = slices[0].team.payroll.season || slices[0].meta.season;
  const rosterMeta = bundledCurrentRosterMeta();
  const season = rosterMeta.season || foSeason;
  const statsSeason = resolveTradeStatsSeason(season);

  const drblByNba = new Map(
    getBundledDrblSeason(statsSeason).map((row) => [row.playerId, row] as const)
  );
  const board = getBundledBrefPeerBoard(statsSeason);
  const boardByEspn = new Map(
    board
      .filter((row) => /^\d+$/.test(row.playerId))
      .map((row) => [row.playerId, row] as const)
  );
  const boardByName = new Map<string, PlayerSeason>();
  for (const row of board) {
    const key = normalizePlayerName(row.playerName);
    const prev = boardByName.get(key);
    if (!prev || (row.gamesPlayed ?? 0) > (prev.gamesPlayed ?? 0)) {
      boardByName.set(key, row);
    }
  }
  const aliases = getBundledPlayerIdAliasIndex();
  const hasCurrentRoster = (rosterMeta.playerCount ?? 0) > 0;

  type RawPlayer = {
    franchiseId: string;
    foAbbr: string;
    row: (typeof slices)[number]["team"]["payroll"]["contractRows"][number];
    salary: number | null;
  };

  const rawPlayers: RawPlayer[] = [];
  for (const slice of slices) {
    const payroll = slice.team.payroll;
    for (const row of payroll.contractRows) {
      rawPlayers.push({
        franchiseId: slice.team.franchiseId,
        foAbbr: slice.team.abbr,
        row,
        salary: salaryForSeason(row.years, payroll.season),
      });
    }
  }

  const byFranchise = new Map<
    string,
    { abbr: string; name: string; players: RawPlayer[] }
  >();
  for (const slice of slices) {
    byFranchise.set(slice.team.franchiseId, {
      abbr: slice.team.abbr,
      name: slice.team.displayName,
      players: [],
    });
  }

  for (const raw of rawPlayers) {
    const espn =
      aliases.byNba.get(raw.row.playerId)?.espnPlayerId?.trim() ||
      (/^\d{1,6}$/.test(raw.row.playerId) ? raw.row.playerId : null);
    const currentFranchise = hasCurrentRoster
      ? currentFranchiseIdForPlayer(raw.row.playerId, espn)
      : null;
    const franchiseId = currentFranchise ?? raw.franchiseId;
    const bucket = byFranchise.get(franchiseId);
    if (!bucket) {
      const team = getCanonicalTeamById(franchiseId);
      if (!team) continue;
      byFranchise.set(franchiseId, {
        abbr: team.abbr,
        name: team.displayName,
        players: [raw],
      });
      continue;
    }
    bucket.players.push(raw);
  }

  const teams: TradeSimTeam[] = [...byFranchise.entries()].map(
    ([franchiseId, bucket]) => {
      const players: TradeSimPlayer[] = bucket.players
        .map((raw) => {
          const row = raw.row;
          const salary = raw.salary;
          const drbl = drblByNba.get(row.playerId);
          const espn =
            aliases.byNba.get(row.playerId)?.espnPlayerId?.trim() ||
            (/^\d{1,6}$/.test(row.playerId) ? row.playerId : null);
          const profile = profileFromBoard(
            board,
            boardByEspn,
            boardByName,
            espn,
            row.playerName,
            bucket.abbr
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
        .sort(
          (a, b) =>
            (b.salary ?? -1) - (a.salary ?? -1) || a.name.localeCompare(b.name)
        );
      const knownCommitments = players.reduce(
        (sum, player) => sum + (player.salary ?? 0),
        0
      );
      return {
        id: franchiseId,
        abbr: bucket.abbr,
        name: bucket.name,
        knownCommitments,
        playersWithoutSalary: players.filter((player) => player.salary == null)
          .length,
        players,
      };
    }
  );

  teams.sort((a, b) => a.abbr.localeCompare(b.abbr));
  const cap = slices[0].cap;
  return {
    season,
    statsSeason,
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

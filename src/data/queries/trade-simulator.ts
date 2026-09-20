import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import { getBundledBrefPeerBoard } from "@/data/runtime/bref-advanced-snapshot";
import {
  getBundledCurrentRosterEntry,
  bundledCurrentRosterMeta,
} from "@/data/runtime/current-roster-snapshot";
import { listRuntimeFrontOfficeFranchiseIds } from "@/data/runtime/front-office-snapshot";
import { loadTeamFrontOfficeSlice } from "@/data/front-office/load-team-front-office";
import { getCanonicalTeamById, resolveCanonicalTeam } from "@/data/identity/team-map";
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
  if (year?.salary != null) return year.salary;
  // Prefer any available year (carry-forward rows may still be prior-season labeled).
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
  // Prefer abbr when present and non-numeric; fall back to teamId (ESPN/canonical).
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
  const drblByNba = new Map(
    getBundledDrblSeason(foSeason).map((row) => [row.playerId, row] as const)
  );
  // Also try current season DRBL if distinct (often empty preseason).
  if (season !== foSeason) {
    for (const row of getBundledDrblSeason(season)) {
      if (!drblByNba.has(row.playerId)) drblByNba.set(row.playerId, row);
    }
  }
  const board = getBundledBrefPeerBoard(foSeason);
  const boardByEspn = new Map(
    board
      .filter((row) => /^\d+$/.test(row.playerId))
      .map((row) => [row.playerId, row] as const)
  );
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

  // Bucket by current roster team when available; else keep FO assignment.
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
      // New franchise id from roster — attach under known team meta if possible.
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

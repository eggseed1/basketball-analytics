/**
 * League directory: group peer-board players by assigned style phrase.
 */
import "server-only";

import { cache } from "react";

import { getBundledBrefPeerBoard } from "@/data/runtime/bref-advanced-snapshot";
import type { PlayerSeason } from "@/data/types";
import {
  assignPlayerRole,
  PLAYER_ROLE_CATALOG,
  PLAYER_ROLE_ORDER,
  type PlayerRoleAssignment,
  type PlayerRoleId,
} from "@/lib/player-role";

export type StyleDirectoryPlayer = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbr: string;
  position: string | null;
  gamesPlayed: number;
  minutes: number;
  usagePct: number | null;
  assistPct: number | null;
  threePointAttemptRate: number | null;
  role: PlayerRoleAssignment;
};

export type StyleDirectoryGroup = {
  id: Exclude<PlayerRoleId, "unclear">;
  phrase: string;
  blurb: string;
  players: StyleDirectoryPlayer[];
};

const MIN_GAMES = 20;
const MIN_MPG = 16;

function qualifies(row: PlayerSeason): boolean {
  if (row.gamesPlayed < MIN_GAMES) return false;
  const mpg = row.minutes / Math.max(1, row.gamesPlayed);
  return mpg >= MIN_MPG;
}

function collapsePrimaryRows(rows: PlayerSeason[]): PlayerSeason[] {
  const byPlayer = new Map<string, PlayerSeason>();
  for (const row of rows) {
    if (!qualifies(row)) continue;
    const key = row.playerId || row.playerName.toLowerCase();
    const prev = byPlayer.get(key);
    if (!prev || row.minutes > prev.minutes) byPlayer.set(key, row);
  }
  return [...byPlayer.values()];
}

export const getPlayerStylesDirectory = cache(
  async (season: string): Promise<StyleDirectoryGroup[]> => {
    const board = getBundledBrefPeerBoard(season);
    const primaries = collapsePrimaryRows(board);
    const buckets = new Map<
      Exclude<PlayerRoleId, "unclear">,
      StyleDirectoryPlayer[]
    >();
    for (const id of PLAYER_ROLE_ORDER) buckets.set(id, []);

    for (const row of primaries) {
      const role = assignPlayerRole({
        row,
        zones: null,
        position: row.position,
      });
      if (!role || role.id === "unclear") continue;
      const list = buckets.get(role.id);
      if (!list) continue;
      list.push({
        playerId: row.playerId,
        playerName: row.playerName,
        teamId: row.teamId,
        teamAbbr: row.teamAbbreviation ?? row.teamId,
        position: row.position ?? null,
        gamesPlayed: row.gamesPlayed,
        minutes: row.minutes,
        usagePct: row.usagePct ?? null,
        assistPct: row.assistPct ?? null,
        threePointAttemptRate: row.threePointAttemptRate,
        role,
      });
    }

    for (const list of buckets.values()) {
      list.sort(
        (a, b) =>
          b.role.confidence - a.role.confidence ||
          b.minutes - a.minutes ||
          a.playerName.localeCompare(b.playerName)
      );
    }

    return PLAYER_ROLE_CATALOG.map((entry) => ({
      id: entry.id,
      phrase: entry.phrase,
      blurb: entry.blurb,
      players: buckets.get(entry.id) ?? [],
    })).filter((g) => g.players.length > 0);
  }
);

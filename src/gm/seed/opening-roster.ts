/**
 * The opening camp list is the roster. A player on that list is not a free agent
 * just because he has no counting line from last year.
 */

import type { GmContract, GmLeagueState, GmPlayer } from "@/gm/types";
import {
  bundledCurrentRosterMeta,
  listBundledEspnRosterEntries,
} from "@/data/runtime/current-roster-snapshot";
import {
  bundledContractTeamIds,
  bundledTeamContracts,
} from "@/data/runtime/bref-team-contracts";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { getCbaRules } from "@/gm/myleague/cba-registry";

function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function reportedDeal(name: string, season: number): GmContract | null {
  const key = nameKey(name);
  for (const teamId of bundledContractTeamIds()) {
    const team = bundledTeamContracts(teamId);
    const row = team?.rows.find((entry) => nameKey(entry.name) === key);
    if (!row) continue;
    const years = row.years.filter((cell) => cell && cell.amount > 0);
    const first = years[0];
    if (!first) continue;
    const option = years.find((cell) => cell?.option)?.option ?? null;
    return {
      yearsRemaining: years.length,
      annualSalaryM: Math.round((first.amount / 1_000_000) * 100) / 100,
      birdRights: "none",
      option,
      signedSeason: season - years.length + 1,
    };
  }
  return null;
}

function unsigned(league: GmLeagueState, players: GmPlayer[]): string[] {
  const drafted = new Set(league.draftPool);
  return players
    .filter((player) => player.teamId == null && !drafted.has(player.id))
    .map((player) => player.id);
}

/**
 * Put current-roster free agents back on their clubs.
 * Someone already on a team stays there, so a trade is not undone.
 */
export function claimOpeningRosters(league: GmLeagueState): GmLeagueState {
  const meta = bundledCurrentRosterMeta();
  const players = league.players.map((player) => ({ ...player }));
  if (league.rosterBook === 1) {
    return { ...league, players, freeAgents: unsigned(league, players), rosterBook: 1 };
  }
  if (meta.season !== "2026-27" || league.season !== 2027) {
    return { ...league, players, freeAgents: unsigned(league, players), rosterBook: 1 };
  }

  const slots = listBundledEspnRosterEntries()
    .map(([id, row]) => {
      const brand =
        resolveTeamBrand(row.teamAbbr) ??
        resolveTeamBrand(row.teamId) ??
        resolveTeamBrand(row.teamName);
      return { id, name: row.name ?? "", franchiseId: brand?.id ?? null };
    })
    .filter((slot): slot is { id: string; name: string; franchiseId: string } =>
      Boolean(slot.franchiseId)
    );

  const rules = getCbaRules(league.season);
  const minimum = Math.round((rules.minSalaryM || 1.2) * 100) / 100;
  const drafted = new Set(league.draftPool);

  for (const slot of slots) {
    let player =
      players.find((entry) => entry.id === slot.id || entry.nbaPlayerId === slot.id) ??
      null;
    if (!player) {
      const key = nameKey(slot.name);
      const matches = players.filter((entry) => nameKey(entry.name) === key);
      if (matches.some((entry) => entry.teamId === slot.franchiseId)) continue;
      player = matches.find((entry) => entry.teamId == null) ?? null;
    }
    if (
      player &&
      player.teamId === slot.franchiseId &&
      player.contract &&
      (player.contract.signedVia === "room" || player.contract.signedVia === "minimum") &&
      player.contract.yearsRemaining === 1 &&
      player.contract.signedSeason === league.season &&
      Math.abs(player.contract.annualSalaryM - minimum) < 0.05
    ) {
      const reported = reportedDeal(player.name, league.season);
      if (reported) {
        const index = players.findIndex((entry) => entry.id === player.id);
        if (index >= 0) players[index] = { ...player, contract: reported };
      }
      continue;
    }
    if (!player || player.teamId != null || drafted.has(player.id)) continue;
    const next: GmPlayer = {
      ...player,
      teamId: slot.franchiseId,
      contract:
        player.contract ??
        reportedDeal(player.name, league.season) ?? {
          yearsRemaining: 1,
          annualSalaryM: minimum,
          birdRights: "none",
          signedSeason: league.season,
          signedVia: "minimum",
        },
    };
    const index = players.findIndex((entry) => entry.id === player.id);
    if (index >= 0) players[index] = next;
  }

  return {
    ...league,
    players,
    freeAgents: unsigned(league, players),
    rosterBook: 1,
  };
}

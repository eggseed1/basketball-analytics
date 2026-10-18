/**
 * Roster WAR1 for a team page.
 * Sums published player WAR1 by the DRBL team assignment (one season row, one team).
 * The win line is the Learn page team check, not a refit and not a forecast:
 * wins per 82 ≈ 40.2 + 1.31 × roster Σ WAR1, 180 team-seasons, 2020-21 through 2025-26.
 */

export const ROSTER_WINS_PER_82_INTERCEPT = 40.2;
export const ROSTER_WINS_PER_82_SLOPE = 1.31;
export const ROSTER_WINS_LINE_SEASONS = "2020-21 through 2025-26";
export const ROSTER_WINS_LINE_TEAMS = 180;

export type RosterWarSourceRow = {
  playerId: string;
  playerName: string;
  teamId: string;
  drbl100?: number | null;
  r1Points?: number | null;
  r1WinEquivalents?: number | null;
};

export type RosterWarPlayer = {
  nbaId: string;
  espnId: string | null;
  name: string;
  drbl100: number | null;
  r1Points: number | null;
  war1: number;
};

export type RosterWarSquad = {
  nbaTeamId: string;
  abbreviation: string;
  fullName: string;
  espnTeamId: string | null;
  players: RosterWarPlayer[];
  war1: number;
  above: number;
  below: number;
  r1Points: number | null;
  /** Roster players with no published WAR1 row. They are left out of the sum. */
  withoutWar1: number;
  /** 40.2 + 1.31 × the WAR1 shown to two decimals, so the arithmetic matches the card. */
  lineWins: number;
  rank: number;
};

export type RosterWarTeamMeta = {
  abbreviation: string;
  fullName: string;
  espnTeamId: string | null;
};

function finite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

/** Two-decimal WAR1, matching the number on the card. */
export function displayedRosterWar1(war1: number): number {
  return Math.round(war1 * 100) / 100;
}

/** Wins per 82 on the published roster line, from the displayed WAR1. */
export function rosterLineWins(war1: number): number {
  return (
    ROSTER_WINS_PER_82_INTERCEPT +
    ROSTER_WINS_PER_82_SLOPE * displayedRosterWar1(war1)
  );
}

export function buildRosterWarLeague(
  rows: readonly RosterWarSourceRow[],
  resolve: {
    teamMeta: (nbaTeamId: string) => RosterWarTeamMeta | null;
    espnPlayerId: (nbaPlayerId: string) => string | null;
  }
): RosterWarSquad[] {
  const byTeam = new Map<string, Map<string, RosterWarPlayer>>();

  for (const row of rows) {
    const war1 = finite(row.r1WinEquivalents);
    const teamId = row.teamId.trim();
    const playerId = row.playerId.trim();
    if (war1 == null || !teamId || !playerId) continue;
    const meta = resolve.teamMeta(teamId);
    if (!meta) continue;

    let players = byTeam.get(teamId);
    if (!players) {
      players = new Map();
      byTeam.set(teamId, players);
    }
    const existing = players.get(playerId);
    if (existing && Math.abs(existing.war1) >= Math.abs(war1)) continue;

    const name = row.playerName.trim();
    players.set(playerId, {
      nbaId: playerId,
      espnId: resolve.espnPlayerId(playerId),
      name: name || playerId,
      drbl100: finite(row.drbl100),
      r1Points: finite(row.r1Points),
      war1,
    });
  }

  const squads: RosterWarSquad[] = [];
  for (const [nbaTeamId, players] of byTeam) {
    const meta = resolve.teamMeta(nbaTeamId);
    if (!meta || players.size === 0) continue;
    const list = [...players.values()].sort(
      (a, b) => b.war1 - a.war1 || a.name.localeCompare(b.name)
    );
    let war1 = 0;
    let above = 0;
    let below = 0;
    let r1 = 0;
    let r1Count = 0;
    for (const player of list) {
      war1 += player.war1;
      if (player.war1 > 0) above += player.war1;
      else if (player.war1 < 0) below += player.war1;
      if (player.r1Points != null) {
        r1 += player.r1Points;
        r1Count += 1;
      }
    }
    squads.push({
      nbaTeamId,
      abbreviation: meta.abbreviation,
      fullName: meta.fullName,
      espnTeamId: meta.espnTeamId,
      players: list,
      war1,
      above,
      below,
      r1Points: r1Count === list.length ? r1 : null,
      withoutWar1: 0,
      lineWins: rosterLineWins(war1),
      rank: 0,
    });
  }

  squads.sort(
    (a, b) => b.war1 - a.war1 || a.abbreviation.localeCompare(b.abbreviation)
  );
  squads.forEach((squad, index) => {
    squad.rank = index + 1;
  });
  return squads;
}

export type CurrentRosterSlot = {
  espnId: string;
  name: string;
  /** Canonical abbreviation, the same key `teamMeta` accepts. */
  abbreviation: string;
};

/**
 * Place each published WAR1 on the player's current team.
 * A player who has left does not stay on the team in his WAR1 row.
 */
export function buildCurrentRosterWarLeague(
  warRows: readonly RosterWarSourceRow[],
  roster: readonly CurrentRosterSlot[],
  resolve: {
    espnForNba: (nbaPlayerId: string) => string | null;
    teamMeta: (abbreviation: string) => RosterWarTeamMeta | null;
  }
): RosterWarSquad[] {
  const warByEspn = new Map<string, RosterWarSourceRow>();
  for (const row of warRows) {
    const war1 = finite(row.r1WinEquivalents);
    const playerId = row.playerId.trim();
    if (war1 == null || !playerId) continue;
    const espnId = resolve.espnForNba(playerId);
    if (!espnId || warByEspn.has(espnId)) continue;
    warByEspn.set(espnId, row);
  }

  const byTeam = new Map<
    string,
    { meta: RosterWarTeamMeta; players: Map<string, RosterWarPlayer>; withoutWar1: number }
  >();

  for (const slot of roster) {
    const abbreviation = slot.abbreviation.trim();
    const espnId = slot.espnId.trim();
    const meta = abbreviation ? resolve.teamMeta(abbreviation) : null;
    if (!meta || !espnId) continue;
    let team = byTeam.get(abbreviation);
    if (!team) {
      team = { meta, players: new Map(), withoutWar1: 0 };
      byTeam.set(abbreviation, team);
    }
    if (team.players.has(espnId)) continue;
    const war = warByEspn.get(espnId);
    const war1 = finite(war?.r1WinEquivalents);
    if (!war || war1 == null) {
      team.withoutWar1 += 1;
      continue;
    }
    const name = slot.name.trim() || war.playerName.trim() || espnId;
    team.players.set(espnId, {
      nbaId: war.playerId.trim(),
      espnId,
      name,
      drbl100: finite(war.drbl100),
      r1Points: finite(war.r1Points),
      war1,
    });
  }

  const squads: RosterWarSquad[] = [];
  for (const [abbreviation, team] of byTeam) {
    if (team.players.size === 0) continue;
    const list = [...team.players.values()].sort(
      (a, b) => b.war1 - a.war1 || a.name.localeCompare(b.name)
    );
    let war1 = 0;
    let above = 0;
    let below = 0;
    let r1 = 0;
    let r1Count = 0;
    for (const player of list) {
      war1 += player.war1;
      if (player.war1 > 0) above += player.war1;
      else if (player.war1 < 0) below += player.war1;
      if (player.r1Points != null) {
        r1 += player.r1Points;
        r1Count += 1;
      }
    }
    squads.push({
      nbaTeamId: abbreviation,
      abbreviation,
      fullName: team.meta.fullName,
      espnTeamId: team.meta.espnTeamId,
      players: list,
      war1,
      above,
      below,
      r1Points: r1Count === list.length ? r1 : null,
      withoutWar1: team.withoutWar1,
      lineWins: rosterLineWins(war1),
      rank: 0,
    });
  }

  squads.sort(
    (a, b) => b.war1 - a.war1 || a.abbreviation.localeCompare(b.abbreviation)
  );
  squads.forEach((squad, index) => {
    squad.rank = index + 1;
  });
  return squads;
}

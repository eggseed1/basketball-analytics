/**
 * WAR team-stint allocation v1 (M16l0.1).
 *
 * WAR estimation unit = PLAYER_SEASON rate.
 * Team validation allocation unit = PLAYER_TEAM_SEASON exposure share.
 *
 * Hard prohibitions:
 * - no stint-level EB1600 / posterior refit
 * - no extra player replacement subtraction
 * - no PPW / WAR scores
 * - no paired N/2 exposure
 */

export const WAR_TEAM_STINT_ALLOCATION_VERSION = "drbl-war-team-stint-alloc-v1";

export type TeamAppearanceRow = {
  teamId: string;
  teamCombinedAppearances: number;
};

export type AllocatedTeamSeasonPointsRow = {
  teamId: string;
  teamN: number;
  teamExposureShare: number;
  allocatedSeasonPoints: number;
};

/**
 * Allocate a player-season rate across actual team-stint combined appearances.
 *
 * seasonPointValue = seasonRate * seasonN / 100
 * allocated_t = seasonRate * teamN_t / 100
 */
export function allocatePlayerSeasonValueToTeams(input: {
  seasonRate: number;
  seasonCombinedAppearances: number;
  teamAppearanceRows: TeamAppearanceRow[];
}): AllocatedTeamSeasonPointsRow[] {
  const seasonN = input.seasonCombinedAppearances;
  if (!(seasonN > 0) || !Number.isFinite(seasonN)) {
    throw new Error(
      `allocatePlayerSeasonValueToTeams: invalid seasonN=${seasonN}`
    );
  }
  if (!Number.isFinite(input.seasonRate)) {
    throw new Error(
      `allocatePlayerSeasonValueToTeams: invalid seasonRate=${input.seasonRate}`
    );
  }

  let sumTeamN = 0;
  for (const row of input.teamAppearanceRows) {
    if (!(row.teamCombinedAppearances >= 0) || !Number.isFinite(row.teamCombinedAppearances)) {
      throw new Error(
        `allocatePlayerSeasonValueToTeams: invalid teamN for ${row.teamId}`
      );
    }
    if (!row.teamId || row.teamId === "TOT") {
      throw new Error(
        `allocatePlayerSeasonValueToTeams: invalid teamId=${row.teamId}`
      );
    }
    sumTeamN += row.teamCombinedAppearances;
  }
  if (Math.abs(sumTeamN - seasonN) > 1e-9) {
    throw new Error(
      `allocatePlayerSeasonValueToTeams: teamN sum ${sumTeamN} != seasonN ${seasonN}`
    );
  }

  return input.teamAppearanceRows.map((row) => {
    const teamN = row.teamCombinedAppearances;
    return {
      teamId: row.teamId,
      teamN,
      teamExposureShare: teamN / seasonN,
      allocatedSeasonPoints: (input.seasonRate * teamN) / 100,
    };
  });
}

export type PlayerTeamSeasonStint = {
  season: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamStintCombinedAppearances: number;
  observedRawStintAttributedValue: number;
  gamesWithTeam: number;
  firstGameDate: string;
  lastGameDate: string;
};

export type PlayerSeasonTotals = {
  season: string;
  playerId: string;
  playerName: string;
  seasonCombinedAppearances: number;
  approachBAttributedValue: number;
  rawAbilityRateExact: number;
};

type StintAccum = {
  season: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamStintCombinedAppearances: number;
  observedRawStintAttributedValue: number;
  gameIds: Set<string>;
  firstGameDate: string;
  lastGameDate: string;
};

type SeasonAccum = {
  season: string;
  playerId: string;
  playerName: string;
  seasonCombinedAppearances: number;
  approachBAttributedValue: number;
};

/**
 * Mutable builder: accumulate atomic appearances into player-season and
 * player-team-season stints from the Approach-B stream.
 */
export class PlayerTeamStintBuilder {
  private readonly stints = new Map<string, StintAccum>();
  private readonly seasons = new Map<string, SeasonAccum>();
  private readonly names = new Map<string, string>();

  private stintKey(season: string, playerId: string, teamId: string): string {
    return `${season}::${playerId}::${teamId}`;
  }

  private seasonKey(season: string, playerId: string): string {
    return `${season}::${playerId}`;
  }

  setPlayerName(playerId: string, playerName: string): void {
    if (playerName) this.names.set(playerId, playerName);
  }

  ingestAppearance(input: {
    season: string;
    playerId: string;
    playerName?: string;
    teamId: string;
    opponentTeamId?: string;
    gameId: string;
    gameDate: string;
    value: number;
    appearanceExposure?: number;
  }): void {
    const teamId = String(input.teamId ?? "").trim();
    if (!teamId) {
      throw new Error(
        `PlayerTeamStintBuilder: missing teamId for player=${input.playerId} game=${input.gameId}`
      );
    }
    if (teamId === "TOT") {
      throw new Error("PlayerTeamStintBuilder: synthetic TOT team forbidden");
    }
    const opp = String(input.opponentTeamId ?? "").trim();
    if (opp && opp === teamId) {
      throw new Error(
        `PlayerTeamStintBuilder: team/opponent collision teamId=${teamId}`
      );
    }

    const exposure = input.appearanceExposure ?? 1;
    if (exposure !== 1) {
      throw new Error(
        `PlayerTeamStintBuilder: appearanceExposure must be 1, got ${exposure}`
      );
    }

    if (input.playerName) this.setPlayerName(input.playerId, input.playerName);
    const playerName =
      this.names.get(input.playerId) ?? input.playerName ?? input.playerId;

    const sk = this.seasonKey(input.season, input.playerId);
    let seasonRow = this.seasons.get(sk);
    if (!seasonRow) {
      seasonRow = {
        season: input.season,
        playerId: input.playerId,
        playerName,
        seasonCombinedAppearances: 0,
        approachBAttributedValue: 0,
      };
      this.seasons.set(sk, seasonRow);
    }
    seasonRow.playerName = playerName;
    seasonRow.seasonCombinedAppearances += exposure;
    seasonRow.approachBAttributedValue += input.value;

    const tk = this.stintKey(input.season, input.playerId, teamId);
    let stint = this.stints.get(tk);
    if (!stint) {
      stint = {
        season: input.season,
        playerId: input.playerId,
        playerName,
        teamId,
        teamStintCombinedAppearances: 0,
        observedRawStintAttributedValue: 0,
        gameIds: new Set(),
        firstGameDate: input.gameDate || "",
        lastGameDate: input.gameDate || "",
      };
      this.stints.set(tk, stint);
    }
    stint.playerName = playerName;
    stint.teamStintCombinedAppearances += exposure;
    stint.observedRawStintAttributedValue += input.value;
    if (input.gameId) stint.gameIds.add(input.gameId);
    if (input.gameDate) {
      if (!stint.firstGameDate || input.gameDate < stint.firstGameDate) {
        stint.firstGameDate = input.gameDate;
      }
      if (!stint.lastGameDate || input.gameDate > stint.lastGameDate) {
        stint.lastGameDate = input.gameDate;
      }
    }
  }

  playerSeasonTotals(): PlayerSeasonTotals[] {
    return [...this.seasons.values()]
      .map((r) => ({
        season: r.season,
        playerId: r.playerId,
        playerName: r.playerName,
        seasonCombinedAppearances: r.seasonCombinedAppearances,
        approachBAttributedValue: r.approachBAttributedValue,
        rawAbilityRateExact:
          r.seasonCombinedAppearances > 0
            ? (100 * r.approachBAttributedValue) / r.seasonCombinedAppearances
            : 0,
      }))
      .sort(
        (a, b) =>
          a.season.localeCompare(b.season) ||
          a.playerId.localeCompare(b.playerId)
      );
  }

  stintRows(): PlayerTeamSeasonStint[] {
    return [...this.stints.values()]
      .map((r) => ({
        season: r.season,
        playerId: r.playerId,
        playerName: r.playerName,
        teamId: r.teamId,
        teamStintCombinedAppearances: r.teamStintCombinedAppearances,
        observedRawStintAttributedValue: r.observedRawStintAttributedValue,
        gamesWithTeam: r.gameIds.size,
        firstGameDate: r.firstGameDate,
        lastGameDate: r.lastGameDate,
      }))
      .sort(
        (a, b) =>
          a.season.localeCompare(b.season) ||
          a.playerId.localeCompare(b.playerId) ||
          a.teamId.localeCompare(b.teamId)
      );
  }

  /** Deterministic fingerprint for equality checks. */
  fingerprint(): string {
    const stints = this.stintRows()
      .map(
        (r) =>
          `${r.season}|${r.playerId}|${r.teamId}|${r.teamStintCombinedAppearances}|${r.observedRawStintAttributedValue}`
      )
      .join("\n");
    return stints;
  }
}

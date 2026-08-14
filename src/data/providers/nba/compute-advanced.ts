/**
 * Derived advanced metrics when a source does not publish them directly.
 * Formulas follow standard Basketball-Reference / NBA definitions.
 */

export function trueShootingPct(
  points: number,
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number
): number {
  const denom = 2 * (fieldGoalsAttempted + 0.44 * freeThrowsAttempted);
  if (denom <= 0) return 0;
  return points / denom;
}

export function effectiveFieldGoalPct(
  fieldGoalsMade: number,
  threePointersMade: number,
  fieldGoalsAttempted: number
): number {
  if (fieldGoalsAttempted <= 0) return 0;
  return (fieldGoalsMade + 0.5 * threePointersMade) / fieldGoalsAttempted;
}

/**
 * Usage rate. Team minutes estimated as GP * 240 when exact team minutes
 * are unavailable (5 players × 48 regulation minutes).
 */
export function usagePct(params: {
  minutes: number;
  fieldGoalsAttempted: number;
  freeThrowsAttempted: number;
  turnovers: number;
  teamGamesPlayed: number;
  teamFieldGoalsAttempted: number;
  teamFreeThrowsAttempted: number;
  teamTurnovers: number;
}): number {
  const {
    minutes,
    fieldGoalsAttempted,
    freeThrowsAttempted,
    turnovers,
    teamGamesPlayed,
    teamFieldGoalsAttempted,
    teamFreeThrowsAttempted,
    teamTurnovers,
  } = params;

  const teamMinutes = teamGamesPlayed * 240;
  const playerPoss =
    fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
  const teamPoss =
    teamFieldGoalsAttempted + 0.44 * teamFreeThrowsAttempted + teamTurnovers;

  if (minutes <= 0 || teamPoss <= 0 || teamMinutes <= 0) return 0;

  return (playerPoss * (teamMinutes / 5)) / (minutes * teamPoss);
}

/** Single-game usage % using summed team box-score totals. */
export function gameUsagePct(params: {
  minutes: number;
  fieldGoalsAttempted: number;
  freeThrowsAttempted: number;
  turnovers: number;
  teamMinutes: number;
  teamFieldGoalsAttempted: number;
  teamFreeThrowsAttempted: number;
  teamTurnovers: number;
}): number {
  const playerPoss =
    params.fieldGoalsAttempted +
    0.44 * params.freeThrowsAttempted +
    params.turnovers;
  const teamPoss =
    params.teamFieldGoalsAttempted +
    0.44 * params.teamFreeThrowsAttempted +
    params.teamTurnovers;
  if (params.minutes <= 0 || teamPoss <= 0 || params.teamMinutes <= 0) return 0;
  return (
    (playerPoss * (params.teamMinutes / 5)) / (params.minutes * teamPoss)
  );
}

/** Approximate offensive rating (pts per 100 possessions). */
export function approxOffensiveRating(
  points: number,
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number,
  turnovers: number
): number {
  const possessions =
    fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
  if (possessions <= 0) return 0;
  return (points / possessions) * 100;
}

/** Turnover percentage. */
export function turnoverPct(
  turnovers: number,
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number
): number {
  const denom = fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
  if (denom <= 0) return 0;
  return turnovers / denom;
}

/**
 * John Hollinger Game Score.
 * PTS + 0.4*FGM - 0.7*FGA - 0.4*(FTA-FTM) + 0.7*OREB + 0.3*DREB
 * + STL + 0.7*AST + 0.7*BLK - 0.4*PF - TOV
 */
export function gameScore(params: {
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  steals: number;
  assists: number;
  blocks: number;
  personalFouls: number;
  turnovers: number;
}): number {
  return (
    params.points +
    0.4 * params.fieldGoalsMade -
    0.7 * params.fieldGoalsAttempted -
    0.4 * (params.freeThrowsAttempted - params.freeThrowsMade) +
    0.7 * params.offensiveRebounds +
    0.3 * params.defensiveRebounds +
    params.steals +
    0.7 * params.assists +
    0.7 * params.blocks -
    0.4 * params.personalFouls -
    params.turnovers
  );
}

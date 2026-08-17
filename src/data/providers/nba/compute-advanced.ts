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

export function estimatePossessions(
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number,
  turnovers: number
): number {
  return fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
}

/** Points per 100 possessions. */
export function ratingPerHundred(points: number, possessions: number): number {
  if (possessions <= 0) return 0;
  return (points / possessions) * 100;
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
  const playerPoss = estimatePossessions(
    fieldGoalsAttempted,
    freeThrowsAttempted,
    turnovers
  );
  const teamPoss = estimatePossessions(
    teamFieldGoalsAttempted,
    teamFreeThrowsAttempted,
    teamTurnovers
  );

  if (minutes <= 0 || teamPoss <= 0 || teamMinutes <= 0) return 0;

  return (playerPoss * (teamMinutes / 5)) / (minutes * teamPoss);
}

/** 3PAr — share of FG attempts from three. */
export function threePointAttemptRate(
  threePointersAttempted: number,
  fieldGoalsAttempted: number
): number {
  if (fieldGoalsAttempted <= 0) return 0;
  return threePointersAttempted / fieldGoalsAttempted;
}

/** FTr — free throw attempts per field goal attempt. */
export function freeThrowRate(
  freeThrowsAttempted: number,
  fieldGoalsAttempted: number
): number {
  if (fieldGoalsAttempted <= 0) return 0;
  return freeThrowsAttempted / fieldGoalsAttempted;
}

/**
 * Turnover percentage — turnovers per play
 * TOV / (FGA + 0.44*FTA + TOV).
 */
export function turnoverPct(
  turnovers: number,
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number
): number {
  const plays =
    fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
  if (plays <= 0) return 0;
  return turnovers / plays;
}

export function twoPointPct(
  fieldGoalsMade: number,
  threePointersMade: number,
  fieldGoalsAttempted: number,
  threePointersAttempted: number
): number {
  const twom = fieldGoalsMade - threePointersMade;
  const twoa = fieldGoalsAttempted - threePointersAttempted;
  if (twoa <= 0) return 0;
  return twom / twoa;
}

export function safePct(made: number, attempted: number): number {
  if (attempted <= 0) return 0;
  return made / attempted;
}

/** Scale a season total to per-game. */
export function perGame(total: number, games: number): number {
  if (games <= 0) return 0;
  return total / games;
}

/** Scale a season total to per-36-minutes. */
export function per36(total: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return (total / minutes) * 36;
}

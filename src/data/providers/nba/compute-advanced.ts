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

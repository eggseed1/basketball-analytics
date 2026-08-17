/**
 * Derived advanced metrics when a source does not publish them directly.
 * Formulas follow standard Basketball-Reference / NBA definitions.
 *
 * Data-truth: when required inputs / denominators are missing, return
 * `undefined` ??never invent 0 as a real rate.
 */

export function trueShootingPct(
  points: number,
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number
): number | undefined {
  const denom = 2 * (fieldGoalsAttempted + 0.44 * freeThrowsAttempted);
  if (denom <= 0) return undefined;
  return points / denom;
}

export function effectiveFieldGoalPct(
  fieldGoalsMade: number,
  threePointersMade: number,
  fieldGoalsAttempted: number
): number | undefined {
  if (fieldGoalsAttempted <= 0) return undefined;
  return (fieldGoalsMade + 0.5 * threePointersMade) / fieldGoalsAttempted;
}

/**
 * Usage rate. Team minutes estimated as GP * 240 when exact team minutes
 * are unavailable (5 players 횞 48 regulation minutes).
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
}): number | undefined {
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

  if (minutes <= 0 || teamPoss <= 0 || teamMinutes <= 0) return undefined;

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
}): number | undefined {
  const playerPoss =
    params.fieldGoalsAttempted +
    0.44 * params.freeThrowsAttempted +
    params.turnovers;
  const teamPoss =
    params.teamFieldGoalsAttempted +
    0.44 * params.teamFreeThrowsAttempted +
    params.teamTurnovers;
  if (params.minutes <= 0 || teamPoss <= 0 || params.teamMinutes <= 0) {
    return undefined;
  }
  return (
    (playerPoss * (params.teamMinutes / 5)) / (params.minutes * teamPoss)
  );
}

/**
 * Approximate offensive rating (pts per 100 individual possessions).
 * Derived estimate ??not provider-published ORtg. Returns undefined when
 * possession inputs are missing.
 */
export function approxOffensiveRating(
  points: number,
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number,
  turnovers: number
): number | undefined {
  const possessions =
    fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
  if (possessions <= 0) return undefined;
  return (points / possessions) * 100;
}

/** Turnover percentage. */
export function turnoverPct(
  turnovers: number,
  fieldGoalsAttempted: number,
  freeThrowsAttempted: number
): number | undefined {
  const denom = fieldGoalsAttempted + 0.44 * freeThrowsAttempted + turnovers;
  if (denom <= 0) return undefined;
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

export function threePointAttemptRate(
  threePointersAttempted: number,
  fieldGoalsAttempted: number
): number {
  if (fieldGoalsAttempted <= 0) return 0;
  return threePointersAttempted / fieldGoalsAttempted;
}

export function freeThrowRate(
  freeThrowsAttempted: number,
  fieldGoalsAttempted: number
): number {
  if (fieldGoalsAttempted <= 0) return 0;
  return freeThrowsAttempted / fieldGoalsAttempted;
}

export function twoPointPct(
  fieldGoalsMade: number,
  threePointersMade: number,
  fieldGoalsAttempted: number,
  threePointersAttempted: number
): number {
  const twoMade = fieldGoalsMade - threePointersMade;
  const twoAtt = fieldGoalsAttempted - threePointersAttempted;
  if (twoAtt <= 0) return 0;
  return twoMade / twoAtt;
}

export function safePct(made: number, attempted: number): number {
  if (attempted <= 0) return 0;
  return made / attempted;
}

export function perGame(total: number, games: number): number {
  if (games <= 0) return 0;
  return total / games;
}

export function per36(total: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return (total / minutes) * 36;
}

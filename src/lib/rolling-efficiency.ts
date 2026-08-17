/**
 * Game-level true shooting from box-score counting stats.
 */
export function gameTrueShootingPct(game: {
  points: number;
  fieldGoalsAttempted: number;
  freeThrowsAttempted: number;
}): number {
  const denom =
    2 * (game.fieldGoalsAttempted + 0.44 * game.freeThrowsAttempted);
  if (denom <= 0) return 0;
  return game.points / denom;
}

export interface RollingEfficiencyPoint {
  gameId: string;
  gameDate: string;
  opponentTeamId: string;
  points: number;
  trueShootingPct: number;
  /** Rolling mean TS% over the last `window` games including this one. */
  rollingTrueShootingPct: number;
  rollingPoints: number;
}

export function buildRollingEfficiency(
  games: Array<{
    gameId: string;
    gameDate: string;
    opponentTeamId: string;
    points: number;
    fieldGoalsAttempted: number;
    freeThrowsAttempted: number;
  }>,
  window = 10
): RollingEfficiencyPoint[] {
  const ordered = [...games].sort((a, b) =>
    a.gameDate.localeCompare(b.gameDate)
  );

  return ordered.map((game, index) => {
    const slice = ordered.slice(Math.max(0, index + 1 - window), index + 1);
    const tsValues = slice.map(gameTrueShootingPct);
    const ptsValues = slice.map((g) => g.points);
    const rollingTrueShootingPct =
      tsValues.reduce((a, b) => a + b, 0) / tsValues.length;
    const rollingPoints =
      ptsValues.reduce((a, b) => a + b, 0) / ptsValues.length;

    return {
      gameId: game.gameId,
      gameDate: game.gameDate,
      opponentTeamId: game.opponentTeamId,
      points: game.points,
      trueShootingPct: gameTrueShootingPct(game),
      rollingTrueShootingPct,
      rollingPoints,
    };
  });
}

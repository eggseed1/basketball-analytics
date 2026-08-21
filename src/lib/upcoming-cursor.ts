/** Cursor for paginating upcoming scoreboard games. */
export function upcomingCursorFromGames(
  games: Array<{ id: string; tipOffAt?: string | null; gameDate: string }>
): { after: string; afterId: string } | null {
  const last = games[games.length - 1];
  if (!last) return null;
  return {
    after: last.tipOffAt || `${last.gameDate}T00:00:00Z`,
    afterId: last.id,
  };
}

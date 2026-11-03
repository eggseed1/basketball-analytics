/**
 * ESPN alternate team-box source. Numbers are derived from actual player
 * box-score rows and are accepted only when both clubs have complete lines.
 * Never invent a missing game or silently count a partial/live box as final.
 */
import type { GameBoxScore } from "@/data/types";
import type { Game } from "@/data/types";
import type { TeamGameBoxRow } from "@/lib/team-game-box";

export type TeamBoxPair = { espnId: string; row: TeamGameBoxRow };

export function teamRowsFromEspnBox(game: Game, box: GameBoxScore): TeamBoxPair[] | null {
  if (game.status !== "final" || !game.gameDate || !box?.players?.length) return null;
  const out: TeamBoxPair[] = [];
  for (const [teamId, points] of [
    [game.homeProviderTeamId ?? game.homeTeamId, game.homeScore],
    [game.awayProviderTeamId ?? game.awayTeamId, game.awayScore],
  ] as [string, number][]) {
    const players = box.players.filter(p => p.teamId === teamId && !p.didNotPlay);
    if (players.length < 5) return null;
    const sum = (key: keyof typeof players[number]) =>
      players.reduce((acc, player) => acc + (typeof player[key] === "number" ? player[key] as number : 0), 0);
    const fga = sum("fieldGoalsAttempted");
    const scored = sum("points");
    // Invalid/missing ESPN stat categories should not replace real box totals.
    if (fga < 35 || scored !== points) return null;
    const row: TeamGameBoxRow = [
      game.gameDate, points,
      sum("fieldGoalsMade"), fga,
      sum("threePointersMade"), sum("threePointersAttempted"),
      sum("freeThrowsMade"), sum("freeThrowsAttempted"),
      sum("offensiveRebounds"), sum("defensiveRebounds"),
      sum("assists"), sum("steals"), sum("blocks"),
      sum("turnovers"), sum("personalFouls"),
    ];
    if (!row.slice(1).every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
    out.push({ espnId: teamId, row });
  }
  return out.length === 2 ? out : null;
}

import type { HistoricalPlayerGame } from "@/data/history/types";

/** Deterministic top performer per team: points → minutes → playerId. */
export function pickTopPerformers(
  players: HistoricalPlayerGame[]
): { home: HistoricalPlayerGame | null; away: HistoricalPlayerGame | null } {
  const minutesValue = (p: HistoricalPlayerGame): number => {
    const m = p.minutes;
    if (typeof m === "number") return m;
    if (typeof m === "string") {
      const match = /^(\d+):(\d+)/.exec(m);
      if (match) return Number(match[1]) + Number(match[2]) / 60;
      const n = Number(m);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };
  const rank = (a: HistoricalPlayerGame, b: HistoricalPlayerGame) => {
    if (b.points !== a.points) return b.points - a.points;
    const dm = minutesValue(b) - minutesValue(a);
    if (dm !== 0) return dm;
    return a.playerId.localeCompare(b.playerId);
  };
  const home =
    players.filter((p) => p.homeAway === "home").sort(rank)[0] ?? null;
  const away =
    players.filter((p) => p.homeAway === "away").sort(rank)[0] ?? null;
  return { home, away };
}

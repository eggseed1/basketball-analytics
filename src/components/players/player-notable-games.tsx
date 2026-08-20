import { TransitionLink } from "@/components/continuity/query-nav";

import type { PlayerGame } from "@/data/types";
import { formatNumber } from "@/lib/format";

type NotableKind =
  | "highest_scoring"
  | "all_around"
  | "plus_minus"
  | "vs_avg_scoring";

type NotableGame = {
  kind: NotableKind;
  label: string;
  detail: string;
  game: PlayerGame;
};

/**
 * Small evidence strip from the already-fetched season game log.
 * Transparent dimensions only - no universal Game Score.
 */
export function pickNotableGames(
  games: PlayerGame[],
  seasonAvgPoints?: number | null
): NotableGame[] {
  if (games.length < 2) return [];

  const withMinutes = games.filter((g) => g.minutes > 0);
  if (!withMinutes.length) return [];

  const byPoints = [...withMinutes].sort((a, b) => b.points - a.points)[0]!;
  const byAllAround = [...withMinutes].sort(
    (a, b) =>
      b.points + b.rebounds + b.assists - (a.points + a.rebounds + a.assists)
  )[0]!;
  const byPlusMinus = [...withMinutes].sort(
    (a, b) => b.plusMinus - a.plusMinus
  )[0]!;

  const out: NotableGame[] = [
    {
      kind: "highest_scoring",
      label: "Highest scoring",
      detail: `${byPoints.points} PTS`,
      game: byPoints,
    },
    {
      kind: "all_around",
      label: "Best PTS+REB+AST",
      detail: `${byAllAround.points}+${byAllAround.rebounds}+${byAllAround.assists}`,
      game: byAllAround,
    },
    {
      kind: "plus_minus",
      label: "Largest +/-",
      detail:
        byPlusMinus.plusMinus > 0
          ? `+${byPlusMinus.plusMinus}`
          : `${byPlusMinus.plusMinus}`,
      game: byPlusMinus,
    },
  ];

  if (seasonAvgPoints != null && Number.isFinite(seasonAvgPoints)) {
    const unusual = [...withMinutes]
      .map((g) => ({
        game: g,
        delta: g.points - seasonAvgPoints,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (unusual && Math.abs(unusual.delta) >= 8) {
      out.push({
        kind: "vs_avg_scoring",
        label: "Furthest from season PPG",
        detail: `${unusual.game.points} PTS (${unusual.delta > 0 ? "+" : ""}${formatNumber(unusual.delta, 1)} vs avg)`,
        game: unusual.game,
      });
    }
  }

  // Dedupe games that win multiple dimensions - keep first label.
  const seen = new Set<string>();
  return out.filter((n) => {
    if (seen.has(n.game.id)) return false;
    seen.add(n.game.id);
    return true;
  });
}

export function PlayerNotableGames({
  games,
  seasonAvgPoints,
}: {
  games: PlayerGame[];
  seasonAvgPoints?: number | null;
}) {
  const notables = pickNotableGames(games, seasonAvgPoints);
  if (!notables.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-muted-foreground">
        Notable performances this season - transparent box-score dimensions, not
        a composite Game Score.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {notables.map((n) => (
          <li key={`${n.kind}-${n.game.id}`}>
            <TransitionLink
              href={`/games/${n.game.gameId}`}
              className="flex flex-col rounded-xl border border-border bg-white/45 px-3 py-2.5 hover:bg-white/70"
            >
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {n.label}
              </span>
              <span className="text-[14px] font-bold">{n.detail}</span>
              <span className="text-[12px] text-muted-foreground">
                {n.game.gameDate} → Game Lab
              </span>
            </TransitionLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

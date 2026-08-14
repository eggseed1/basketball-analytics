import Link from "next/link";
import { notFound } from "next/navigation";

import { GameBoxScoreTables } from "@/components/games/game-box-score-tables";
import { GameLabView } from "@/components/games/game-lab-view";
import { getGameAnalysis, getGameBoxScore } from "@/data/queries";
import type { PlayerGame } from "@/data/types";

interface GamePageProps {
  params: Promise<{ gameId: string }>;
}

export async function generateMetadata({ params }: GamePageProps) {
  const { gameId } = await params;
  const box = await getGameBoxScore(gameId);
  if (!box) return { title: "Game | Basketball Analytics" };
  const away = box.game.awayTeamAbbr ?? box.game.awayTeamId;
  const home = box.game.homeTeamAbbr ?? box.game.homeTeamId;
  return {
    title: `${away} @ ${home} | Basketball Analytics`,
  };
}

export default async function GamePage({ params }: GamePageProps) {
  const { gameId } = await params;
  const payload = await getGameAnalysis(gameId);
  if (!payload) notFound();

  const { analysis, game, players } = payload;
  const { outcome } = analysis;

  const sortPlayers = (rows: PlayerGame[]) =>
    [...rows].sort((a, b) => {
      const scoreDiff = (b.gameScore ?? b.points) - (a.gameScore ?? a.points);
      if (scoreDiff !== 0) return scoreDiff;
      return b.minutes - a.minutes;
    });

  const homePlayers = sortPlayers(
    players.filter((p) => p.teamId === game.homeTeamId)
  );
  const awayPlayers = sortPlayers(
    players.filter((p) => p.teamId === game.awayTeamId)
  );

  return (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <p>
        <Link
          href="/explore/games"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to explore games
        </Link>
      </p>

      <GameLabView analysis={analysis}>
        {players.length === 0 ? (
          <p className="rounded-xl border border-border p-4 text-muted-foreground">
            No box score available for this game yet. Try another final, or
            upgrade BallDontLie for historical box scores.
          </p>
        ) : (
          <GameBoxScoreTables
            awayLabel={outcome.awayLabel}
            homeLabel={outcome.homeLabel}
            awayTeamId={game.awayTeamId}
            homeTeamId={game.homeTeamId}
            awayPlayers={awayPlayers}
            homePlayers={homePlayers}
            contextIndex={analysis.boxScoreContext}
          />
        )}
      </GameLabView>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { GameBoxScoreTables } from "@/components/games/game-box-score-tables";
import { GameLabView } from "@/components/games/game-lab-view";
import { parseSeasonEvidenceArrival } from "@/analytics/game-season-context";
import { getGameAnalysis, getGameShell } from "@/data/queries";
import { gameSideBrandKey } from "@/lib/game-team-identity";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { PlayerGame } from "@/data/types";

interface GamePageProps {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: GamePageProps) {
  const { gameId } = await params;
  const shell = await getGameShell(gameId);
  if (!shell) return { title: "Game | Basketball Analytics" };
  const away =
    shell.game.awayTeamAbbr ??
    resolveTeamBrand(gameSideBrandKey(shell.game, "away"))?.abbr ??
    shell.game.awayTeamId;
  const home =
    shell.game.homeTeamAbbr ??
    resolveTeamBrand(gameSideBrandKey(shell.game, "home"))?.abbr ??
    shell.game.homeTeamId;
  return {
    title: `${away} @ ${home} | Basketball Analytics`,
  };
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const { gameId } = await params;
  const sp = await searchParams;
  const arrival = parseSeasonEvidenceArrival(sp);
  const payload = await getGameAnalysis(gameId);
  if (!payload) notFound();

  const { analysis, game, players, availability } = payload;
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

      <GameLabView
        analysis={analysis}
        arrival={arrival ? { label: arrival.label } : null}
      >
        {availability === "scoreboard" || players.length === 0 ? (
          <div className="rounded-xl border border-border p-4">
            <p className="text-[14px] font-semibold tracking-tight">
              Box score unavailable
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Detailed player and team box-score data is not currently available
              for this game. Scoreboard and season context above still reflect
              the known result — player lines are not fabricated.
            </p>
          </div>
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

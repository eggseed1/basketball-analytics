import { Suspense } from "react";
import { notFound } from "next/navigation";

import { GameBoxScoreTables } from "@/components/games/game-box-score-tables";
import { GameLabView } from "@/components/games/game-lab-view";
import { GameIdentityShell } from "@/components/games/game-identity-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { TransitionLink } from "@/components/continuity/query-nav";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import { parseSeasonEvidenceArrival } from "@/analytics/game-season-context";
import { getGameAnalysis } from "@/data/queries";
import { getGameShellCached } from "@/data/queries/request-cache";
import type { PlayerGame } from "@/data/types";
import {
  parseThemeMode,
  resolveActiveEraTheme,
} from "@/themes/era-theme";

interface GamePageProps {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: GamePageProps) {
  const { gameId } = await params;
  const shell = await getGameShellCached(gameId);
  if (!shell) return { title: "Game | Basketball Analytics" };
  const away = shell.game.awayTeamAbbr ?? shell.game.awayTeamId;
  const home = shell.game.homeTeamAbbr ?? shell.game.homeTeamId;
  return {
    title: `${away} @ ${home} | Basketball Analytics`,
  };
}

function first(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function GameLabDeepBody({
  gameId,
  arrival,
}: {
  gameId: string;
  arrival: ReturnType<typeof parseSeasonEvidenceArrival>;
}) {
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
    <GameLabView
      analysis={analysis}
      arrival={arrival ? { label: arrival.label } : null}
      omitHero
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
  );
}

/**
 * Stable identity/score header stays mounted; deep Game Lab streams below.
 * No identity → hero remount when analysis arrives.
 */
export default async function GamePage({ params, searchParams }: GamePageProps) {
  const { gameId } = await params;
  const sp = await searchParams;
  const arrival = parseSeasonEvidenceArrival(sp);

  const shell = await getGameShellCached(gameId);
  if (!shell) notFound();

  const fromHistory = first(sp.from) === "history";
  const themeParam = first(sp.theme);
  const themeMode = parseThemeMode(themeParam);
  const applyEraTheme =
    fromHistory || themeParam === "historical" || themeParam === "modern";
  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(shell.game.season, themeMode)
    : null;

  const brandPresentation =
    applyEraTheme && themeMode !== "modern" ? "era" : "modern_surface";

  const backHref = fromHistory
    ? `/history?season=${encodeURIComponent(shell.game.season)}${
        themeMode === "modern" ? "&theme=modern" : ""
      }`
    : "/explore/games";

  const body = (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <p>
        <TransitionLink
          href={backHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {fromHistory ? "Back to Time Machine" : "Back to explore games"}
        </TransitionLink>
      </p>

      <GameIdentityShell
        game={shell.game}
        brandPresentation={brandPresentation}
        arrivalLabel={arrival?.label}
      />

      <Suspense
        fallback={
          <DestinationSectionSkeleton label="Loading Game Lab analysis…" />
        }
      >
        <GameLabDeepBody gameId={gameId} arrival={arrival} />
      </Suspense>
    </main>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}

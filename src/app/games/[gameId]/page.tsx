import { Suspense } from "react";

import { GameLabView } from "@/components/games/game-lab-view";
import { GameIdentityShell } from "@/components/games/game-identity-shell";
import { PossessionExplorerIsland } from "@/components/games/possession-explorer-island";
import { HistoricalGameExperience } from "@/components/history/historical-game-experience";
import { GameUnavailablePanel } from "@/components/games/game-unavailable";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import { parseSeasonEvidenceArrival } from "@/analytics/game-season-context";
import { getGameAnalysis } from "@/data/queries";
import { getHistoricalProductGame } from "@/data/history/product";
import { loadRawArchiveShotEvents } from "@/data/history/raw-archive-shots";
import { getGameShellCached } from "@/data/queries/request-cache";
import { withBudget } from "@/data/queries/budget";
import { runtimeTimeoutMs } from "@/data/providers/nba/runtime-policy";
import { validateGamePresentation } from "@/lib/game-presentation";
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
}: {
  gameId: string;
  arrival: ReturnType<typeof parseSeasonEvidenceArrival>;
}) {
  const result = await withBudget(
    getGameAnalysis(gameId).catch(() => null),
    runtimeTimeoutMs(10_000, 4_000),
    null
  );
  const payload = result.value;

  // Game Lab is enrichment, not route identity. A missing/slow PBP provider
  // must never turn a valid scoreboard/box-score game into a route-level 404.
  if (!payload) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Deep Game Lab analysis is temporarily unavailable for this game.
      </p>
    );
  }

  return (
    <GameLabView
      analysis={payload.analysis}
      players={payload.players}
      events={payload.events}
      pbpSource={payload.pbpSource}
      omitHero
    />
  );
}

async function HistoricalDeepBody({
  gameId,
  seasonHint,
  homeLabel,
  awayLabel,
}: {
  gameId: string;
  seasonHint?: string;
  homeLabel: string;
  awayLabel: string;
}) {
  // Artifact + shots load inside this Suspense boundary (not in the page
  // parent) so GameIdentityShell can flush first.
  const historyArtifact = getHistoricalProductGame(gameId, seasonHint);
  const shots = loadRawArchiveShotEvents(gameId);

  if (historyArtifact) {
    const slim = {
      ...historyArtifact,
      // Unused on the historical surface - drop before Flight serialization.
      teamGames: [] as Record<string, unknown>[],
    };
    return (
      <HistoricalGameExperience
        artifact={slim}
        shots={shots}
        homeLabel={homeLabel}
        awayLabel={awayLabel}
      />
    );
  }

  if (shots.length > 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Historical summary not precomputed for this game; box / Game Lab below
        still load when available.
      </p>
    );
  }

  return null;
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
  const fromHistory = first(sp.from) === "history";
  const themeParam = first(sp.theme);
  const seasonParam = first(sp.season);
  const themeMode = parseThemeMode(themeParam);

  if (!shell) {
    return (
      <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
        <GameUnavailablePanel
          gameId={gameId}
          backHref={fromHistory ? "/history" : "/explore/games"}
        />
      </main>
    );
  }

  const presentation = validateGamePresentation(shell.game);
  const applyEraTheme =
    fromHistory || themeParam === "historical" || themeParam === "modern";
  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(shell.game.season, themeMode)
    : null;

  const brandPresentation =
    applyEraTheme && themeMode !== "modern" ? "era" : "modern_surface";

  const seasonHint = seasonParam ?? shell.game.season;
  // Lightweight season decode for back-link only (no artifact parse).
  const historySeasonForNav = seasonHint;

  const backHref = fromHistory
    ? `/history/${encodeURIComponent(historySeasonForNav)}`
    : "/explore/games";

  const body = (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <GameIdentityShell
        game={shell.game}
        brandPresentation={brandPresentation}
        arrivalLabel={arrival?.label}
      />

      {presentation.canRenderDeepFeatures ? (
        <Suspense
          fallback={
            <DestinationSectionSkeleton label="Loading Game Flow & shots…" />
          }
        >
          <HistoricalDeepBody
            gameId={gameId}
            seasonHint={seasonHint}
            homeLabel={shell.game.homeTeamAbbr ?? "Home"}
            awayLabel={shell.game.awayTeamAbbr ?? "Away"}
          />
        </Suspense>
      ) : null}

      {presentation.canRenderDeepFeatures ? (
        <Suspense
          fallback={
            <DestinationSectionSkeleton label="Loading Game Lab analysis…" />
          }
        >
          <GameLabDeepBody gameId={gameId} arrival={arrival} />
        </Suspense>
      ) : (
        <GameUnavailablePanel gameId={gameId} backHref={backHref} />
      )}

      {presentation.canRenderDeepFeatures ? (
        <Suspense
          fallback={
            <DestinationSectionSkeleton label="Loading Possession Explorer…" />
          }
        >
          <PossessionExplorerIsland
            gameId={gameId}
            awayTeamKey={shell.game.awayTeamId}
            homeTeamKey={shell.game.homeTeamId}
          />
        </Suspense>
      ) : null}
    </main>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}

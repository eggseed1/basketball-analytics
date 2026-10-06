import { Suspense } from "react";
import { GameLabView } from "@/components/games/game-lab-view";
import { GameIdentityShell } from "@/components/games/game-identity-shell";
import { GamePreTipBoard } from "@/components/games/game-pre-tip-board";
import { GamePreviewSection, GameTabs, type GameTab } from "@/components/games/game-preview-section";
import { PossessionExplorerIsland } from "@/components/games/possession-explorer-island";
import { RuntimeGameFallback } from "@/components/games/runtime-game-fallback";
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
import { validateGamePresentation } from "@/lib/game-presentation";
import { longUpstreamBudgetsEnabled } from "@/data/providers/nba/runtime-policy";
import { parseThemeMode, resolveActiveEraTheme } from "@/themes/era-theme";

interface GamePageProps { params: Promise<{ gameId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>; }
export async function generateMetadata({ params }: GamePageProps) { const { gameId } = await params; const shell = await getGameShellCached(gameId); if (!shell) return { title: "Game" }; const away = shell.game.awayTeamAbbr ?? shell.game.awayTeamId; const home = shell.game.homeTeamAbbr ?? shell.game.homeTeamId; return { title: `${away} @ ${home}` }; }
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

async function GameLabDeepBody({ gameId, hidePeriodTable }: { gameId: string; arrival: ReturnType<typeof parseSeasonEvidenceArrival>; hidePeriodTable: boolean }) {
  const labBudgetMs = longUpstreamBudgetsEnabled() ? 25_000 : 10_000;
  const result = await withBudget(
    getGameAnalysis(gameId).catch(() => null),
    labBudgetMs,
    null
  );
  const payload = result.value;
  if (!payload) return <p className="text-[13px] text-muted-foreground">Deep Game Lab analysis is temporarily unavailable for this game.</p>;
  return <GameLabView analysis={payload.analysis} players={payload.players} events={payload.events} pbpSource={payload.pbpSource} officialTeamStats={payload.officialTeamStats} omitHero hidePeriodTable={hidePeriodTable} />;
}

async function HistoricalDeepBody({ gameId, seasonHint, homeLabel, awayLabel }: { gameId: string; seasonHint?: string; homeLabel: string; awayLabel: string }) {
  const historyArtifact = getHistoricalProductGame(gameId, seasonHint);
  const shots = loadRawArchiveShotEvents(gameId);
  if (historyArtifact) return <HistoricalGameExperience artifact={{ ...historyArtifact, teamGames: [] as Record<string, unknown>[] }} shots={shots} homeLabel={homeLabel} awayLabel={awayLabel} />;
  if (shots.length > 0) return <p className="text-[13px] text-muted-foreground">Historical summary not precomputed for this game; box / Game Lab below still load when available.</p>;
  return null;
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const { gameId } = await params;
  const sp = await searchParams;
  const arrival = parseSeasonEvidenceArrival(sp);
  const shell = await getGameShellCached(gameId);
  const fromHistory = first(sp.from) === "history";
  const themeParam = first(sp.theme);
  const seasonParam = first(sp.season);
  const themeMode = parseThemeMode(themeParam);

  if (!shell) return <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8"><RuntimeGameFallback gameId={gameId} /></main>;

  const presentation = validateGamePresentation(shell.game);
  const applyEraTheme = fromHistory || themeParam === "historical" || themeParam === "modern";
  const eraTheme = applyEraTheme ? resolveActiveEraTheme(shell.game.season, themeMode) : null;
  const brandPresentation = applyEraTheme && themeMode !== "modern" ? "era" : "modern_surface";
  const seasonHint = seasonParam ?? shell.game.season;
  const backHref = fromHistory ? `/history/${encodeURIComponent(seasonHint)}` : "/explore/games";
  const status = shell.game.status;
  const preTip = status === "scheduled" || status === "pregame" || status === "delayed";
  const heroHasLineScore = Math.min(shell.game.homePeriodScores?.length ?? 0, shell.game.awayPeriodScores?.length ?? 0) > 0;
  const defaultTab: GameTab = preTip ? "preview" : "game";
  const tabParam = first(sp.tab);
  const tab: GameTab = tabParam === "preview" || tabParam === "game" ? tabParam : defaultTab;
  const tabOptions: Array<{ id: GameTab; label: string }> = preTip
    ? [{ id: "preview", label: "Preview" }, { id: "game", label: "Box score & plays" }]
    : [{ id: "game", label: "Game" }, { id: "preview", label: "Preview" }];
  const showGame = presentation.canRenderDeepFeatures && tab === "game";
  const body = <main className="site-shell flex flex-1 flex-col gap-5 py-5 sm:gap-6 sm:py-7">
    <GameIdentityShell game={shell.game} brandPresentation={brandPresentation} arrivalLabel={arrival?.label} />
    {presentation.canRenderDeepFeatures ? <GameTabs gameId={gameId} active={tab} options={tabOptions} defaultTab={defaultTab} query={sp} /> : null}
    {presentation.canRenderDeepFeatures && tab === "preview" ? <Suspense fallback={<DestinationSectionSkeleton label="Loading game preview…" />}><GamePreviewSection game={shell.game} /></Suspense> : null}
    {showGame && preTip ? <GamePreTipBoard game={shell.game} /> : showGame ? <Suspense fallback={<DestinationSectionSkeleton label="Loading Game Flow & shots…" />}><HistoricalDeepBody gameId={gameId} seasonHint={seasonHint} homeLabel={shell.game.homeTeamAbbr ?? "Home"} awayLabel={shell.game.awayTeamAbbr ?? "Away"} /></Suspense> : null}
    {!presentation.canRenderDeepFeatures ? <GameUnavailablePanel gameId={gameId} backHref={backHref} /> : !showGame || preTip ? null : <Suspense fallback={<DestinationSectionSkeleton label="Loading Game Lab analysis…" />}><GameLabDeepBody gameId={gameId} arrival={arrival} hidePeriodTable={heroHasLineScore} /></Suspense>}
    {showGame && !preTip ? (
      <details className="group sports-card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="text-[17px] font-bold tracking-tight">Possession Explorer</span>
            <span className="text-[13px] text-muted-foreground">Every possession rebuilt from play-by-play, with filters by quarter, team and result.</span>
          </span>
          <span aria-hidden className="text-[18px] text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t border-border/60 p-3 sm:p-4">
          <Suspense fallback={<DestinationSectionSkeleton label="Loading Possession Explorer…" />}><PossessionExplorerIsland gameId={gameId} awayTeamKey={shell.game.awayTeamId} homeTeamKey={shell.game.homeTeamId} /></Suspense>
        </div>
      </details>
    ) : null}
  </main>;
  return eraTheme ? <EraThemeScope theme={eraTheme}>{body}</EraThemeScope> : body;
}

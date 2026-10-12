import { Suspense, type ReactNode } from "react";
import { GameLabView } from "@/components/games/game-lab-view";
import { GameIdentityShell } from "@/components/games/game-identity-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { GamePreTipBoard } from "@/components/games/game-pre-tip-board";
import { GamePreviewSection, GameTabs, type GameTab } from "@/components/games/game-preview-section";
import { PossessionExplorerIsland } from "@/components/games/possession-explorer-island";
import { DelayedGameSection } from "@/components/games/delayed-game-section";
import { cookies } from "next/headers";
import { needsScoreMask, parseScoreDelay, SCORE_DELAY_COOKIE } from "@/lib/score-delay";
import { RuntimeGameFallback } from "@/components/games/runtime-game-fallback";
import { HistoricalGameExperience } from "@/components/history/historical-game-experience";
import { GameUnavailablePanel } from "@/components/games/game-unavailable";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import { GlassTintScaleProvider } from "@/components/brand/glass-surface";
import { DESTINATION_CARD_TINT_SCALE } from "@/components/brand/team-atmosphere";
import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import { gameSideBrandKey } from "@/lib/game-team-identity";
import { parseSeasonEvidenceArrival } from "@/analytics/game-season-context";
import { getGameAnalysis } from "@/data/queries";
import { getHistoricalProductGame } from "@/data/history/product";
import { loadRawArchiveShotEventsAsync } from "@/data/history/raw-archive-shots";
import { getGameShellCached } from "@/data/queries/request-cache";
import { runtimePregameMargin } from "@/data/runtime/pregame-margin";
import { withBudget } from "@/data/queries/budget";
import { validateGamePresentation } from "@/lib/game-presentation";
import { longUpstreamBudgetsEnabled } from "@/data/providers/nba/runtime-policy";
import { parseThemeMode, resolveActiveEraTheme } from "@/themes/era-theme";
import { yieldForStreaming } from "@/lib/stream-yield";
import { shareImageMetadata } from "@/lib/share-images";

interface GamePageProps { params: Promise<{ gameId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>; }
function gameDateLabel(isoDate: string | undefined): string | null { if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null; return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
// No final score in the title or description: score-delay visitors would see it in the tab and in link previews.
export async function generateMetadata({ params }: GamePageProps) { await yieldForStreaming(); const { gameId } = await params; const shell = await getGameShellCached(gameId); if (!shell) return { title: "Game" }; const away = shell.game.awayTeamAbbr ?? shell.game.awayTeamId; const home = shell.game.homeTeamAbbr ?? shell.game.homeTeamId; const awayName = shell.game.awayTeamName ?? away; const homeName = shell.game.homeTeamName ?? home; const date = gameDateLabel(shell.game.gameDate); return { title: `${awayName} vs. ${homeName} Box Score${date ? ` (${date})` : ""}`, description: `${awayName} at ${homeName}${date ? ` on ${date}` : ""}: box score, player stats and impact.`, alternates: { canonical: `/games/${encodeURIComponent(gameId)}` }, ...shareImageMetadata("games", gameId, `${away} @ ${home}`) }; }
/** Team color stays a hint on cards, close to the neutral home page cards. */
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

async function GameLabDeepBody({ gameId, hidePeriodTable, asOfMs }: { gameId: string; arrival: ReturnType<typeof parseSeasonEvidenceArrival>; hidePeriodTable: boolean; asOfMs?: number }) {
  const labBudgetMs = longUpstreamBudgetsEnabled() ? 25_000 : 10_000;
  const result = await withBudget(
    getGameAnalysis(gameId, asOfMs != null ? { asOfMs } : undefined).catch(() => null),
    labBudgetMs,
    null
  );
  const payload = result.value;
  if (!payload) return <p className="text-[13px] text-muted-foreground">Deep Game Lab analysis is temporarily unavailable for this game.</p>;
  const shell = await getGameShellCached(gameId);
  const pregameMargin = shell ? runtimePregameMargin(shell.game) : undefined;
  const view = <GameLabView analysis={payload.analysis} players={payload.players} events={payload.events} pbpSource={payload.pbpSource} officialTeamStats={payload.officialTeamStats} pregameMargin={pregameMargin} omitHero hidePeriodTable={hidePeriodTable} rebuiltFromPlays={payload.asOf === "cut"} />;
  return payload.asOf === "unavailable" ? <DelayedGameSection risky>{view}</DelayedGameSection> : view;
}

async function HistoricalDeepBody({ gameId, seasonHint, homeLabel, awayLabel }: { gameId: string; seasonHint?: string; homeLabel: string; awayLabel: string }) {
  const historyArtifact = getHistoricalProductGame(gameId, seasonHint);
  const shots = await loadRawArchiveShotEventsAsync(gameId);
  if (historyArtifact) return <HistoricalGameExperience artifact={{ ...historyArtifact, teamGames: [] as Record<string, unknown>[] }} shots={shots} homeLabel={homeLabel} awayLabel={awayLabel} />;
  if (shots.length > 0) return <p className="text-[13px] text-muted-foreground">Historical summary not precomputed for this game; box / Game Lab below still load when available.</p>;
  return null;
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  await yieldForStreaming();
  const { gameId } = await params;
  const sp = await searchParams;
  const arrival = parseSeasonEvidenceArrival(sp);
  const shell = await getGameShellCached(gameId);
  const fromHistory = first(sp.from) === "history";
  const themeParam = first(sp.theme);
  const seasonParam = first(sp.season);
  const themeMode = parseThemeMode(themeParam);

  if (!shell) return <main data-motion-page className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8"><MotionReveal /><RuntimeGameFallback gameId={gameId} /></main>;

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
  const renderedAt = new Date().getTime();
  const risky = needsScoreMask(shell.game, renderedAt);
  const delaySeconds = showGame && risky ? parseScoreDelay((await cookies()).get(SCORE_DELAY_COOKIE)?.value) : 0;
  const asOfMs = delaySeconds ? renderedAt - delaySeconds * 1000 : undefined;
  const holdIfCut = (node: ReactNode) => (asOfMs != null ? <DelayedGameSection risky>{node}</DelayedGameSection> : node);
  const gameDate = gameDateLabel(shell.game.gameDate);
  const awayName = shell.game.awayTeamName ?? shell.game.awayTeamAbbr ?? shell.game.awayTeamId;
  const homeName = shell.game.homeTeamName ?? shell.game.homeTeamAbbr ?? shell.game.homeTeamId;
  const body = <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-5 sm:gap-6 sm:py-7">
    <h1 className="sr-only">{`${awayName} vs. ${homeName}${gameDate ? `, ${gameDate}` : ""}`}</h1>
    <JsonLd data={{
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${awayName} at ${homeName}`,
      sport: "Basketball",
      url: absoluteUrl(`/games/${encodeURIComponent(gameId)}`),
      ...(shell.game.gameDate ? { startDate: shell.game.gameDate } : {}),
      awayTeam: { "@type": "SportsTeam", name: awayName },
      homeTeam: { "@type": "SportsTeam", name: homeName },
    }} />
    <MotionReveal />
    <GameIdentityShell game={shell.game} brandPresentation={brandPresentation} arrivalLabel={arrival?.label} />
    {presentation.canRenderDeepFeatures ? <GameTabs gameId={gameId} active={tab} options={tabOptions} defaultTab={defaultTab} query={sp} /> : null}
    {presentation.canRenderDeepFeatures && tab === "preview" ? <Suspense fallback={<DestinationSectionSkeleton label="Loading game preview…" />}><GamePreviewSection game={shell.game} /></Suspense> : null}
    {!presentation.canRenderDeepFeatures ? <GameUnavailablePanel gameId={gameId} backHref={backHref} /> : null}
    {showGame ? (
      <DelayedGameSection risky={risky && asOfMs == null} cutDelay={delaySeconds}>
      {preTip ? <GamePreTipBoard game={shell.game} /> : <>
      {asOfMs == null ? <Suspense fallback={<DestinationSectionSkeleton label="Loading Game Flow & shots…" />}><HistoricalDeepBody gameId={gameId} seasonHint={seasonHint} homeLabel={shell.game.homeTeamAbbr ?? "Home"} awayLabel={shell.game.awayTeamAbbr ?? "Away"} /></Suspense> : null}
      <Suspense fallback={<DestinationSectionSkeleton label="Loading Game Lab analysis…" />}><GameLabDeepBody gameId={gameId} arrival={arrival} hidePeriodTable={heroHasLineScore} asOfMs={asOfMs} /></Suspense>
      <details className="group sports-card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="text-[17px] font-bold tracking-tight">Possession Explorer</span>
            <span className="text-[13px] text-muted-foreground">Every possession rebuilt from play-by-play, with filters by quarter, team and result.</span>
          </span>
          <span aria-hidden className="text-[18px] text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t border-border/60 p-3 sm:p-4">
          {holdIfCut(<Suspense fallback={<DestinationSectionSkeleton label="Loading Possession Explorer…" />}><PossessionExplorerIsland gameId={gameId} awayTeamKey={shell.game.awayTeamId} homeTeamKey={shell.game.homeTeamId} /></Suspense>)}
        </div>
      </details>
      </>}
      </DelayedGameSection>
    ) : null}
  </main>;
  if (eraTheme) return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
  const matchup = buildGameMatchupTheme(gameSideBrandKey(shell.game, "away"), gameSideBrandKey(shell.game, "home"));
  return (
    <>
      <PageAtmosphere colorA={matchup.awayWash} colorB={matchup.homeWash} />
      <GlassTintScaleProvider scale={DESTINATION_CARD_TINT_SCALE}>{body}</GlassTintScaleProvider>
    </>
  );
}

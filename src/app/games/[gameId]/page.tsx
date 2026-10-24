import { Suspense, type ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { GameLabView } from "@/components/games/game-lab-view";
import { GameIdentityShell } from "@/components/games/game-identity-shell";
import { GamePreTipBoard } from "@/components/games/game-pre-tip-board";
import { GamePreviewSection, GameTabs, type GameTab } from "@/components/games/game-preview-section";
import { PossessionExplorerSection } from "@/components/games/possession-explorer-section";
import { DelayedGameSection } from "@/components/games/delayed-game-section";
import { cookies } from "next/headers";
import { isFinalStatus, type GameStatusKind } from "@/lib/game-status";
import { slimGameAnalysisForFlight } from "@/lib/slim-game-analysis-for-flight";
import { isCurrentNbaSeason } from "@/lib/nba-season-status";
import { needsScoreMask, parseScoreDelay, SCORE_DELAY_COOKIE } from "@/lib/score-delay";
import { RuntimeGameFallback } from "@/components/games/runtime-game-fallback";
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
import { looksLikeEspnEventId } from "@/data/identity/game-id";
import { getGameShellCached } from "@/data/queries/request-cache";
import { runtimePregameMargin } from "@/data/runtime/pregame-margin";
import { withBudget } from "@/data/queries/budget";
import { validateGamePresentation } from "@/lib/game-presentation";
import { longUpstreamBudgetsEnabled } from "@/data/providers/nba/runtime-policy";
import { parseThemeMode, resolveActiveEraTheme } from "@/themes/era-theme";
import { yieldForStreaming } from "@/lib/stream-yield";
import { shareImageMetadata } from "@/lib/share-images";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { formatGameCalendarDate } from "@/i18n/format-date";

interface GamePageProps { params: Promise<{ gameId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>; }
export async function generateMetadata({ params }: GamePageProps) {
  await yieldForStreaming();
  const { gameId } = await params;
  const [t, locale, shell] = await Promise.all([getTranslations("Games"), getLocale(), getGameShellCached(gameId)]);
  if (!shell) return { title: t("metaFallbackTitle") };
  const away = shell.game.awayTeamAbbr ?? shell.game.awayTeamId;
  const home = shell.game.homeTeamAbbr ?? shell.game.homeTeamId;
  const awayName = shell.game.awayTeamName ?? away;
  const homeName = shell.game.homeTeamName ?? home;
  const date = formatGameCalendarDate(shell.game.gameDate, locale);
  return {
    title: date ? t("metaTitleDated", { away: awayName, home: homeName, date }) : t("metaTitle", { away: awayName, home: homeName }),
    description: date ? t("metaDescriptionDated", { away: awayName, home: homeName, date }) : t("metaDescription", { away: awayName, home: homeName }),
    alternates: { canonical: `/games/${encodeURIComponent(gameId)}` },
    ...shareImageMetadata("games", gameId, `${away} @ ${home}`),
  };
}
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
  if (!payload) {
    const t = await getTranslations("Games");
    return <p className="text-[13px] text-muted-foreground">{t("labUnavailable")}</p>;
  }
  const shell = await getGameShellCached(gameId);
  const pregameMargin = shell ? runtimePregameMargin(shell.game) : undefined;
  // Finals: omit PBP from Flight and hydrate client-side. Live keeps SSR events.
  const status = payload.analysis.status as GameStatusKind | undefined;
  const isFinal = isFinalStatus(status);
  const embedEvents = !isFinal || payload.asOf === "cut";
  const analysis = slimGameAnalysisForFlight(payload.analysis, {
    downsampleTimeline: isFinal && payload.asOf !== "cut",
  });
  const missingBox =
    isFinal &&
    payload.asOf !== "cut" &&
    !(payload.players?.length > 0);
  const view = (
    <>
      {missingBox ? <span hidden data-page-cache="skip" /> : null}
      <GameLabView
        analysis={analysis}
        players={payload.players}
        events={embedEvents ? payload.events : []}
        pbpSource={payload.pbpSource}
        officialTeamStats={payload.officialTeamStats}
        pregameMargin={pregameMargin}
        omitHero
        hidePeriodTable={hidePeriodTable}
        rebuiltFromPlays={payload.asOf === "cut"}
        enableLiveBoxPoll={payload.asOf == null || payload.asOf === "unchanged"}
      />
    </>
  );
  return payload.asOf === "unavailable" ? <DelayedGameSection risky>{view}</DelayedGameSection> : view;
}

async function HistoricalDeepBody({ gameId, seasonHint, homeLabel, awayLabel }: { gameId: string; seasonHint?: string; homeLabel: string; awayLabel: string }) {
  const historyArtifact = getHistoricalProductGame(gameId, seasonHint);
  // Live ESPN ids use the lab shot chart; skip archive on the critical stream.
  if (!historyArtifact && looksLikeEspnEventId(gameId)) return null;
  if (!historyArtifact) return null;
  // Shots load client-side — keeps archive PBP shot arrays out of first HTML.
  const { HistoricalGameExperienceLoader } = await import(
    "@/components/history/historical-game-experience-loader"
  );
  const t = await getTranslations("Games");
  return (
    <HistoricalGameExperienceLoader
      gameId={gameId}
      artifact={{ ...historyArtifact, teamGames: [] as Record<string, unknown>[] }}
      homeLabel={homeLabel}
      awayLabel={awayLabel}
      missingSummary={t("historicalSummaryMissing")}
    />
  );
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  await yieldForStreaming();
  const { gameId } = await params;
  const sp = await searchParams;
  const [t, locale] = await Promise.all([
    getTranslations("Games"),
    getLocale(),
  ]);
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
    ? [{ id: "preview", label: t("tabPreview") }, { id: "game", label: t("tabBoxScorePlays") }]
    : [{ id: "game", label: t("tabGame") }, { id: "preview", label: t("tabPreview") }];
  const showGame = presentation.canRenderDeepFeatures && tab === "game";
  const renderedAt = new Date().getTime();
  const risky = needsScoreMask(shell.game, renderedAt);
  const delaySeconds = showGame && risky ? parseScoreDelay((await cookies()).get(SCORE_DELAY_COOKIE)?.value) : 0;
  const asOfMs = delaySeconds ? renderedAt - delaySeconds * 1000 : undefined;
  const holdIfCut = (node: ReactNode) => (asOfMs != null ? <DelayedGameSection risky>{node}</DelayedGameSection> : node);
  const gameDate = formatGameCalendarDate(shell.game.gameDate, locale);
  const awayName = shell.game.awayTeamName ?? shell.game.awayTeamAbbr ?? shell.game.awayTeamId;
  const homeName = shell.game.homeTeamName ?? shell.game.homeTeamAbbr ?? shell.game.homeTeamId;
  const body = <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-5 sm:gap-6 sm:py-7">
    {/* Delay-cut HTML stays private — never promote personalized cuts to EDGE. */}
    {isFinalStatus(status) && asOfMs == null ? (
      <span hidden data-html-cache="game-final" />
    ) : null}
    <h1 className="sr-only">{gameDate ? t("srTitleDated", { away: awayName, home: homeName, date: gameDate }) : t("srTitle", { away: awayName, home: homeName })}</h1>
    <JsonLd data={{
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: t("matchupAt", { away: awayName, home: homeName }),
      sport: "Basketball",
      url: absoluteUrl(`/games/${encodeURIComponent(gameId)}`),
      ...(shell.game.gameDate ? { startDate: shell.game.gameDate } : {}),
      awayTeam: { "@type": "SportsTeam", name: awayName },
      homeTeam: { "@type": "SportsTeam", name: homeName },
    }} />
    <MotionReveal />
    <GameIdentityShell game={shell.game} brandPresentation={brandPresentation} arrivalLabel={arrival?.label} />
    {presentation.canRenderDeepFeatures ? <GameTabs gameId={gameId} active={tab} options={tabOptions} defaultTab={defaultTab} query={sp} /> : null}
    {presentation.canRenderDeepFeatures && tab === "preview" ? <Suspense fallback={<DestinationSectionSkeleton label={t("loadingPreview")} />}><GamePreviewSection game={shell.game} /></Suspense> : null}
    {!presentation.canRenderDeepFeatures ? <GameUnavailablePanel gameId={gameId} backHref={backHref} /> : null}
    {showGame ? (
      <DelayedGameSection risky={risky && asOfMs == null} cutDelay={delaySeconds}>
      {preTip ? <GamePreTipBoard game={shell.game} /> : <>
      {asOfMs == null &&
      (fromHistory || !isCurrentNbaSeason(shell.game.season)) ? (
        <Suspense fallback={<DestinationSectionSkeleton label={t("loadingFlow")} />}>
          <HistoricalDeepBody
            gameId={gameId}
            seasonHint={seasonHint}
            homeLabel={shell.game.homeTeamAbbr ?? t("homeFallback")}
            awayLabel={shell.game.awayTeamAbbr ?? t("awayFallback")}
          />
        </Suspense>
      ) : null}
      <Suspense fallback={<DestinationSectionSkeleton label={t("loadingLab")} />}><GameLabDeepBody gameId={gameId} arrival={arrival} hidePeriodTable={heroHasLineScore} asOfMs={asOfMs} /></Suspense>
      <details className="group sports-card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="text-[17px] font-bold tracking-tight">{t("possessionTitle")}</span>
            <span className="text-[13px] text-muted-foreground">{t("possessionBlurb")}</span>
          </span>
          <span aria-hidden className="text-[18px] text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t border-border/60 p-3 sm:p-4">
          {holdIfCut(
        <PossessionExplorerSection
          gameId={gameId}
          awayTeamKey={shell.game.awayTeamId}
          homeTeamKey={shell.game.homeTeamId}
          title={t("possessionTitle")}
          blurb={t("possessionBlurb")}
        />
      )}
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

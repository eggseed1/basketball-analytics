import { Suspense, type ComponentProps } from "react";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { GlassTintScaleProvider } from "@/components/brand/glass-surface";
import { TeamDestinationIdentity } from "@/components/teams/team-destination-identity";
import { TeamPrimaryNav } from "@/components/teams/team-primary-nav";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getFranchiseHistory } from "@/data/queries/franchises";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import {
  parseTeamPageTab,
  parseTeamRateMode,
  parseTeamSeasonKind,
  resolveTeamIdentityFallback,
  teamFranchiseHistoryHref,
  type TeamPageHrefOpts,
} from "@/lib/team-destination";
import {
  resolveTeamDivisionMeta,
} from "@/lib/team-standings-context";
import { resolveTeamFromBoard } from "@/lib/team-explorer";
import {
  resolveActiveEraTheme,
} from "@/themes/era-theme";
import {
  parseDestinationHistoryArrival,
} from "@/themes/history-url";
import { yieldForStreaming } from "@/lib/stream-yield";
import { shareImageMetadata } from "@/lib/share-images";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";

/** Team color stays a hint on cards, close to the neutral home page cards. */
const TEAM_CARD_TINT_SCALE = 0.3;

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: TeamPageProps) {
  await yieldForStreaming();
  const tMeta = await getTranslations("TeamDetail");
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season =
    seasonParam ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const { getTeamSeasonBoardCached } = await import(
    "@/data/queries/request-cache"
  );
  const board = await getTeamSeasonBoardCached(season);
  const boardTeam = resolveTeamFromBoard(board.rows, teamId);
  const fallback = boardTeam ? null : resolveTeamIdentityFallback(teamId, season, "era");
  const fullName = boardTeam?.fullName ?? fallback?.fullName;
  // Abbreviations and slugs (TOR, raptors) render the same page as the canonical id.
  const canonicalTeamId = boardTeam?.teamId ?? fallback?.teamId ?? teamId;
  const pastSeason =
    seasonParam && seasonParam !== canonicalSeasonFromStartYear(currentNbaStartYear())
      ? `?season=${encodeURIComponent(seasonParam)}`
      : "";
  return {
    title: fullName
      ? pastSeason
        ? tMeta("metaRosterStats", { name: fullName, season })
        : tMeta("metaRosterStatsPayroll", { name: fullName, season })
      : tMeta("metaTeamFallback"),
    alternates: {
      canonical: `/teams/${encodeURIComponent(canonicalTeamId)}${pastSeason}`,
    },
    description: fullName
      ? `${fullName} ${season} roster, schedule and results, team stats${pastSeason ? "" : ", payroll"} and transactions.`
      : undefined,
    ...(pastSeason ? {} : shareImageMetadata("teams", canonicalTeamId, fullName ?? tMeta("metaTeamFallback"))),
  };
}

/**
 * Progressive team destination: identity + core board paint first;
 * arc / evidence / roster / games / transactions / assets stream as islands.
 */

async function TeamPageWithBoardLazy(
  props: ComponentProps<typeof import("./team-page-with-board").TeamPageWithBoard>
) {
  const { TeamPageWithBoard } = await import("./team-page-with-board");
  return <TeamPageWithBoard {...props} />;
}

export default async function TeamProfilePage({
  params,
  searchParams,
}: TeamPageProps) {
  await yieldForStreaming();
  const t = await getTranslations("TeamDetail");
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  if (rawTab === "history") redirect(teamFranchiseHistoryHref(teamId, seasonParam));
  const tab = parseTeamPageTab(rawTab);
  const seasonType = parseTeamSeasonKind(
    Array.isArray(sp.seasonType) ? sp.seasonType[0] : sp.seasonType
  );
  const rate = parseTeamRateMode(Array.isArray(sp.rate) ? sp.rate[0] : sp.rate);
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const season = seasonParam ?? currentSeason;
  const priorSeason = shiftCanonicalSeason(season, -1);
  const { fromHistory, themeMode, applyEraTheme } =
    parseDestinationHistoryArrival(sp);

  const brandPresentation =
    applyEraTheme && themeMode !== "modern" ? "era" : "modern_surface";

  // Sync brand only — never touch team-board-snapshot before first byte.
  const identityFallback = resolveTeamIdentityFallback(
    teamId,
    season,
    brandPresentation
  );
  if (!identityFallback) notFound();

  const modernBrand = resolveTeamBrand(identityFallback.abbreviation);
  const historicalBrand =
    identityFallback.historicalBrand ??
    resolveHistoricalTeamBrand(
      identityFallback.teamId,
      season,
      brandPresentation
    );
  const useHistoricalMark =
    applyEraTheme && themeMode !== "modern"
      ? true
      : Boolean(historicalBrand?.isHistorical);
  const hrefOpts: TeamPageHrefOpts = {
    season,
    tab,
    seasonType,
    rate,
    fromHistory,
    themeMode: themeMode === "modern" ? "modern" : "historical",
  };
  const seasonOptions = [...new Set([season, priorSeason, currentSeason])]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const franchise = modernBrand ? getFranchiseHistory(modernBrand.id) : null;
  const identityTeam = {
    abbreviation: identityFallback.abbreviation,
    fullName: identityFallback.fullName,
    conference: identityFallback.conference,
    ppg: Number.NaN,
    avgDiff: Number.NaN,
    trueShootingPct: undefined,
    teamId: identityFallback.teamId,
    season,
    gamesPlayed: 0,
    oppPpg: Number.NaN,
    rpg: Number.NaN,
    apg: Number.NaN,
    spg: Number.NaN,
    bpg: Number.NaN,
    topg: Number.NaN,
    fieldGoalPct: Number.NaN,
    threePointPct: Number.NaN,
    freeThrowPct: Number.NaN,
    assistToTurnover: Number.NaN,
    offensiveReboundPct: Number.NaN,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    assists: 0,
    turnovers: 0,
  };
  const seasonAwaitingGamesGuess = season === currentSeason;
  const standingsContext = {
    standing: null,
    divisionStanding: null,
    divisionMeta: resolveTeamDivisionMeta(
      modernBrand,
      identityFallback.teamId
    ),
    priorSeasonStanding: null,
    priorSeasonLabel: null,
    seasonAwaitingGames: seasonAwaitingGamesGuess,
    standingsEmpty: false,
  };
  const atmosphere = brandAtmosphereColors(
    useHistoricalMark && historicalBrand?.palette
      ? historicalBrand.palette.primary
      : modernBrand?.primary,
    useHistoricalMark && historicalBrand?.palette
      ? historicalBrand.palette.secondary
      : modernBrand?.secondary
  );
  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(season, themeMode)
    : null;

  const brandFallback = (
    <>
      <TeamDestinationIdentity
        teamId={teamId}
        team={identityTeam}
        season={season}
        seasonOptions={seasonOptions}
        standing={null}
        divisionStanding={null}
        standingsContext={standingsContext}
        snapshotStats={[]}
        modernBrand={modernBrand}
        historicalBrand={historicalBrand}
        useHistoricalMark={useHistoricalMark}
        boardAvailable={false}
        hrefOpts={hrefOpts}
        franchise={franchise}
        historyHref={teamFranchiseHistoryHref(teamId, seasonParam)}
      />
      <TeamPrimaryNav teamId={teamId} tab={tab} hrefOpts={hrefOpts} />
      <DestinationSectionSkeleton label={t("loadingTeamArc")} />
    </>
  );

  const body = (
    <DestinationClientShell>
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <GlassTintScaleProvider scale={TEAM_CARD_TINT_SCALE}>
        <main
          data-motion-page
          className="site-shell relative z-[1] flex flex-col gap-4 py-5 sm:gap-5 sm:py-7"
        >
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "SportsTeam",
              name: identityTeam.fullName,
              sport: "Basketball",
              url: absoluteUrl(
                `/teams/${encodeURIComponent(identityTeam.teamId)}`
              ),
              memberOf: {
                "@type": "SportsOrganization",
                name: "National Basketball Association",
              },
            }}
          />
          <MotionReveal />
          <Suspense fallback={brandFallback}>
            <TeamPageWithBoardLazy
              teamId={teamId}
              sp={sp}
              seasonParam={seasonParam}
              season={season}
              priorSeason={priorSeason}
              currentSeason={currentSeason}
              tab={tab}
              seasonType={seasonType}
              rate={rate}
              fromHistory={fromHistory}
              themeMode={themeMode}
              applyEraTheme={applyEraTheme}
              brandPresentation={brandPresentation}
              identityFallback={identityFallback}
            />
          </Suspense>
        </main>
      </GlassTintScaleProvider>
    </DestinationClientShell>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}

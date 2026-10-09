import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { analyzeTeamProfile } from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { GlassTintScaleProvider } from "@/components/brand/glass-surface";
import { TeamDestinationIdentity } from "@/components/teams/team-destination-identity";
import { TeamEvidenceIsland } from "@/components/teams/team-evidence-island";
import { TeamGamesIsland } from "@/components/teams/team-games-island";
import { TeamHustleIsland } from "@/components/teams/team-hustle-island";
import { TeamLeadershipSection } from "@/components/teams/team-leadership-section";
import { TeamLineupsIsland } from "@/components/teams/team-lineups-island";
import { TeamOnOffIsland } from "@/components/teams/team-on-off-island";
import { TeamOffenseIsland } from "@/components/teams/team-offense-island";
import { TeamPlayoffsIsland } from "@/components/teams/team-playoffs-island";
import { TeamSplitsIsland } from "@/components/teams/team-splits-island";
import { TeamOpeningNight } from "@/components/teams/overview/team-opening-night";
import { TeamOverviewVisuals } from "@/components/teams/overview/team-overview-visuals";
import { TeamSeasonRecapIsland } from "@/components/teams/overview/team-season-recap-island";
import { StatsRankGrid } from "@/components/teams/viz/stats-rank-grid";
import { TeamPrimaryNav } from "@/components/teams/team-primary-nav";
import { TeamRosterIsland } from "@/components/teams/team-roster-island";
import { TeamRosterBuiltIsland } from "@/components/teams/team-roster-built-island";
import { TeamSalaryAssetsTab } from "@/components/teams/team-salary-assets-tab";
import { TeamSentimentTab } from "@/components/teams/team-sentiment-tab";
import { TeamRosterSourcesSection } from "@/components/teams/team-roster-sources-section";
import { TeamScheduleIsland } from "@/components/teams/team-schedule-island";
import { TeamTransactionsIsland } from "@/components/teams/team-transactions-island";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getTeamExploreSeasons } from "@/data/queries";
import { getFranchiseHistory } from "@/data/queries/franchises";
import { getTeamSeasonBoardCached } from "@/data/queries/request-cache";
import { formatOrdinal } from "@/lib/format";
import { isSeasonAwaitingFirstGame } from "@/lib/nba-season-status";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import {
  parseTeamPageTab,
  parseTeamRateMode,
  parseTeamSalaryView,
  parseTeamSeasonKind,
  resolveTeamIdentityFallback,
  teamFranchiseHistoryHref,
  type TeamPageHrefOpts,
} from "@/lib/team-destination";
import { buildTeamRankedMetrics, formatMetricDelta, leagueRankOf } from "@/lib/team-page-metrics";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { buildScheduleFacts } from "@/lib/team-overview-data";
import {
  enrichTraitsWithPrior,
  formatTraitPriorDelta,
  groupTraitsForPerformance,
  resolveTeamFromBoard,
  transactionTeamFilterId,
} from "@/lib/team-explorer";
import {
  resolveTeamDivisionMeta,
  resolveTeamStandingsDisplay,
} from "@/lib/team-standings-context";
import {
  resolveActiveEraTheme,
} from "@/themes/era-theme";
import {
  parseDestinationHistoryArrival,
} from "@/themes/history-url";
import { yieldForStreaming } from "@/lib/stream-yield";

/** Team color stays a hint on cards, close to the neutral home page cards. */
const TEAM_CARD_TINT_SCALE = 0.3;

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: TeamPageProps) {
  await yieldForStreaming();
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season =
    seasonParam ?? canonicalSeasonFromStartYear(currentNbaStartYear());
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
    title: fullName ?? "Team",
    alternates: {
      canonical: `/teams/${encodeURIComponent(canonicalTeamId)}${pastSeason}`,
    },
    description: fullName
      ? `${fullName} roster, games, transactions, and team stats.`
      : undefined,
  };
}

/**
 * Progressive team destination: identity + core board paint first;
 * arc / evidence / roster / games / transactions / assets stream as islands.
 */
export default async function TeamProfilePage({
  params,
  searchParams,
}: TeamPageProps) {
  await yieldForStreaming();
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

  // Season board first — skip prior-season ESPN pull during preseason/offseason
  // so identity can paint without a second 2.5s budget race.
  const seasonBoard = await getTeamSeasonBoardCached(season);
  const league = seasonBoard.rows;
  const seasonAwaitingGames = isSeasonAwaitingFirstGame(season, league);

  const [priorBoard, exploreSeasons] = await Promise.all([
    seasonAwaitingGames
      ? Promise.resolve({
          rows: [] as typeof seasonBoard.rows,
          status: "preseason" as const,
        })
      : getTeamSeasonBoardCached(priorSeason),
    getTeamExploreSeasons().catch(() => [currentSeason, priorSeason]),
  ]);

  const priorLeague = priorBoard.rows;

  const boardTeam = resolveTeamFromBoard(league, teamId);

  const identityFallback = !boardTeam
    ? resolveTeamIdentityFallback(teamId, season, brandPresentation)
    : null;
  if (!boardTeam && !identityFallback) notFound();

  const boardAvailable = Boolean(boardTeam);
  const identityTeam = boardTeam ?? {
    abbreviation: identityFallback!.abbreviation,
    fullName: identityFallback!.fullName,
    conference: identityFallback!.conference,
    ppg: Number.NaN,
    avgDiff: Number.NaN,
    trueShootingPct: undefined,
    teamId: identityFallback!.teamId,
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

  const prior = boardTeam
    ? priorLeague.find((t) => t.teamId === boardTeam.teamId) ??
      priorLeague.find(
        (t) =>
          t.abbreviation.toLowerCase() ===
          boardTeam.abbreviation.toLowerCase()
      ) ??
      null
    : null;

  const modernBrand = resolveTeamBrand(identityTeam.abbreviation);
  const standingsContext = boardTeam
    ? await resolveTeamStandingsDisplay({
        season,
        currentSeason,
        team: boardTeam,
        brand: modernBrand,
        boardRows: league,
      })
    : {
        standing: null,
        divisionStanding: null,
        divisionMeta: resolveTeamDivisionMeta(
          modernBrand,
          identityFallback?.teamId ?? teamId
        ),
        priorSeasonStanding: null,
        priorSeasonLabel: null,
        seasonAwaitingGames,
        standingsEmpty: false,
      };

  const analysis =
    boardTeam && !seasonAwaitingGames
      ? analyzeTeamProfile({ team: boardTeam, league, prior })
      : null;
  const traits = analysis
    ? enrichTraitsWithPrior(analysis.traits, boardTeam!, prior)
    : [];
  const historicalBrand =
    identityFallback?.historicalBrand ??
    resolveHistoricalTeamBrand(
      identityTeam.teamId ?? boardTeam?.teamId ?? teamId,
      season,
      brandPresentation
    );
  const useHistoricalMark =
    applyEraTheme && themeMode !== "modern"
      ? true
      : Boolean(historicalBrand?.isHistorical);
  const resolvedTeamId =
    boardTeam?.teamId ?? identityFallback!.teamId;
  const txTeamId = boardTeam
    ? transactionTeamFilterId(boardTeam, modernBrand)
    : identityFallback!.teamId;
  const askTeamId = modernBrand?.espnTeamId ?? resolvedTeamId;

  const standing = standingsContext.standing;
  const divisionStanding = standingsContext.divisionStanding;

  const grouped = groupTraitsForPerformance(traits);
  const ranked =
    boardTeam && !seasonAwaitingGames
      ? buildTeamRankedMetrics({
          team: boardTeam,
          league,
          prior,
          standing,
          traits,
        })
      : [];
  const scorecard = ranked.filter((m) => m.group === "scorecard");
  const offenseMetrics = ranked.filter((m) => m.group === "offense");
  const defenseMetrics = ranked.filter((m) => m.group === "defense");
  const factorMetrics = ranked.filter((m) => m.group === "factors");
  const boardMetrics = [...scorecard, ...offenseMetrics, ...defenseMetrics, ...factorMetrics];
  const hrefOpts: TeamPageHrefOpts = {
    season,
    tab,
    seasonType,
    rate,
    fromHistory,
    themeMode: themeMode === "modern" ? "modern" : "historical",
  };

  const franchise = modernBrand ? getFranchiseHistory(modernBrand.id) : null;
  const franchiseFirstSeason = franchise?.firstSeason;
  const seasonOptions = [
    ...new Set([
      season,
      ...exploreSeasons,
      priorSeason,
      currentSeason,
    ]),
  ]
    .filter(Boolean)
    .filter(
      (s) =>
        s === season ||
        !franchiseFirstSeason ||
        s.localeCompare(franchiseFirstSeason) >= 0
    )
    .sort((a, b) => b.localeCompare(a));

  const snapshotStats = seasonAwaitingGames
    ? []
    : scorecard
        .filter(
          (m) =>
            m.key !== "record" &&
            !m.missingReason &&
            m.rank != null &&
            m.rankDenominator != null
        )
        .slice(0, 4)
        .map((m) => ({
          label: m.label,
          value: formatOrdinal(m.rank!),
          hint: m.formattedValue,
          tip: `${formatOrdinal(m.rank!)} of ${m.rankDenominator} in ${m.label.toLowerCase()}`,
          tipSub: [
            m.differenceFromAverage != null && Number.isFinite(m.differenceFromAverage)
              ? `${formatMetricDelta(m.key, m.differenceFromAverage)} vs league average`
              : null,
            m.previousFormatted,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        }));

  const displayName =
    useHistoricalMark && historicalBrand?.displayName
      ? historicalBrand.displayName
      : identityTeam.fullName;

  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(season, themeMode)
    : null;

  const atmosphere = brandAtmosphereColors(
    useHistoricalMark && historicalBrand?.palette
      ? historicalBrand.palette.primary
      : modernBrand?.primary,
    useHistoricalMark && historicalBrand?.palette
      ? historicalBrand.palette.secondary
      : modernBrand?.secondary
  );

  const body = (
    <DestinationClientShell>
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <GlassTintScaleProvider scale={TEAM_CARD_TINT_SCALE}>
      <main data-motion-page className="site-shell relative z-[1] flex flex-col gap-4 py-5 sm:gap-5 sm:py-7">
        <MotionReveal />
        <TeamDestinationIdentity
          teamId={teamId}
          team={identityTeam}
          season={season}
          seasonOptions={seasonOptions}
          standing={standing}
          divisionStanding={divisionStanding}
          standingsContext={standingsContext}
          snapshotStats={snapshotStats}
          modernBrand={modernBrand}
          historicalBrand={historicalBrand}
          useHistoricalMark={useHistoricalMark}
          boardAvailable={boardAvailable}
          hrefOpts={hrefOpts}
          franchise={franchise}
          historyHref={teamFranchiseHistoryHref(teamId, seasonParam)}
        />

        <TeamPrimaryNav
          teamId={teamId}
          tab={tab}
          hrefOpts={hrefOpts}
        />

        {tab === "overview" ? (
          seasonAwaitingGames ? (
            <div data-motion-stack className="flex flex-col gap-4">
              <TeamOpeningNight
                facts={buildScheduleFacts(resolvedTeamId, season, nbaTodayIso())}
                season={season}
                teamId={teamId}
                teamName={displayName}
              />
              <Suspense
                fallback={<DestinationSectionSkeleton label={`Loading ${priorSeason} review…`} />}
              >
                <TeamSeasonRecapIsland routeTeamId={teamId} season={priorSeason} />
              </Suspense>
            </div>
          ) : boardAvailable && analysis ? (
            <TeamOverviewVisuals
              team={boardTeam!}
              league={league}
              ranked={ranked}
              traits={traits}
              howTheyWin={analysis.howTheyWin}
              season={season}
            />
          ) : (
            <section
              id="performance"
              className="scroll-mt-16 flex flex-col gap-3"
              aria-label="Overview"
            >
              <h2 className="text-[20px] font-bold tracking-tight">
                How good are they?
              </h2>
              <p className="text-[14px] text-muted-foreground">
                Season board unavailable for {season}. The team identity above
                is matched to its era, and rates are left blank, not shown as
                zeroes.
              </p>
            </section>
          )
        ) : null}

        {tab === "players" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading roster…" />}
          >
            <TeamRosterIsland
              teamId={resolvedTeamId}
              season={season}
              sortParam={Array.isArray(sp.sort) ? sp.sort[0] : sp.sort}
              sortDirParam={Array.isArray(sp.dir) ? sp.dir[0] : sp.dir}
            />
          </Suspense>
        ) : null}

        {tab === "players" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading rotation…" />}
          >
            <TeamLineupsIsland
              teamId={resolvedTeamId}
              season={season}
              teamKey={identityTeam.abbreviation}
            />
          </Suspense>
        ) : null}

        {tab === "players" && season === currentSeason && askTeamId ? (
          <Suspense fallback={null}>
            <TeamRosterBuiltIsland espnTeamId={askTeamId} />
          </Suspense>
        ) : null}

        {tab === "offense" ? (
          boardAvailable && !seasonAwaitingGames ? (
            <Suspense
              fallback={<DestinationSectionSkeleton label="Loading offense…" />}
            >
              <TeamOffenseIsland
                teamId={resolvedTeamId}
                season={season}
                teamKey={identityTeam.abbreviation}
                team={boardTeam!}
                offenseMetrics={offenseMetrics}
                leagueTs={scorecard.find((m) => m.key === "ts")?.leagueAverage ?? null}
              />
            </Suspense>
          ) : (
            <section id="offense" className="scroll-mt-16" aria-label="Offense">
              <p className="text-[14px] text-muted-foreground">
                Offense board metrics appear after the season starts or when the
                team board is available for {season}.
              </p>
            </section>
          )
        ) : null}

        {tab === "offense" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading hustle…" />}
          >
            <TeamHustleIsland
              teamId={resolvedTeamId}
              season={season}
              teamKey={identityTeam.abbreviation}
              team={boardTeam ?? null}
              defenseMetrics={defenseMetrics}
            />
          </Suspense>
        ) : null}

        {tab === "onoff" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading on/off…" />}
          >
            <TeamOnOffIsland
              teamId={resolvedTeamId}
              season={season}
              teamKey={identityTeam.abbreviation}
            />
          </Suspense>
        ) : null}

        {tab === "games" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading games…" />}
          >
            <TeamGamesIsland
              team={identityTeam}
              brand={modernBrand}
              season={season}
              schedule={
                <TeamScheduleIsland teamId={resolvedTeamId} season={season} teamKey={identityTeam.abbreviation} />
              }
            />
          </Suspense>
        ) : null}

        {tab === "splits" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading splits…" />}
          >
            <TeamSplitsIsland teamId={resolvedTeamId} season={season} teamKey={identityTeam.abbreviation} />
          </Suspense>
        ) : null}

        {tab === "playoffs" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading playoffs…" />}
          >
            <TeamPlayoffsIsland teamId={resolvedTeamId} season={season} teamKey={identityTeam.abbreviation} />
          </Suspense>
        ) : null}

        {tab === "organization" ? (
          <div data-motion-stack className="flex flex-col gap-8">
            <TeamLeadershipSection
              teamId={askTeamId}
              teamKey={identityTeam.abbreviation}
              teamName={displayName}
              season={season}
              currentSeason={currentSeason}
            />
            {season === currentSeason ? (
              <Suspense fallback={<DestinationSectionSkeleton label="Loading roster moves…" />}>
                <TeamRosterSourcesSection teamId={askTeamId} teamKey={identityTeam.abbreviation} />
              </Suspense>
            ) : null}
            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading transactions…" />
              }
            >
              <TeamTransactionsIsland teamFilterId={txTeamId} />
            </Suspense>
          </div>
        ) : null}

        {tab === "sentiment" ? (
          <Suspense fallback={<DestinationSectionSkeleton label="Loading sentiment…" />}>
            <TeamSentimentTab teamId={resolvedTeamId} />
          </Suspense>
        ) : null}

        {tab === "payroll" ? (
          <TeamSalaryAssetsTab
            routeTeamId={teamId}
            teamId={resolvedTeamId}
            espnTeamId={askTeamId}
            abbreviation={identityTeam.abbreviation}
            season={season}
            view={parseTeamSalaryView(Array.isArray(sp.view) ? sp.view[0] : sp.view)}
          />
        ) : null}

        {tab === "stats" ? (
          <div className="flex flex-col gap-4">
            {boardAvailable && analysis && !seasonAwaitingGames ? (
              <section
                id="all-stats"
                className="scroll-mt-16 flex flex-col gap-4"
                aria-label="All Stats"
              >
                <div>
                  <h2 className="text-[20px] font-bold tracking-tight">
                    All Stats
                  </h2>
                  <p className="text-[14px] text-muted-foreground">
                    Every metric on the season board. Rate mode is stored as{" "}
                    {rate}; counting stats stay per game until a totals
                    endpoint is selected.
                  </p>
                </div>
                <StatsRankGrid
                  season={season}
                  teamKey={identityTeam.abbreviation}
                  rows={boardMetrics
                    .filter(
                      (m, i) =>
                        !m.missingReason &&
                        boardMetrics.findIndex((x) => x.key === m.key) === i
                    )
                    .map((metric) => ({
                      metric,
                      prior:
                        metric.key === "record"
                          ? null
                          : leagueRankOf(metric.key, prior, priorLeague),
                    }))}
                  missingLabels={[
                    ...new Set(
                      boardMetrics
                        .filter((m) => m.missingReason && m.key !== "record")
                        .map((m) => m.label)
                    ),
                  ]}
                />
                <TraitGroup title="Overall" traits={grouped.overall} />
                <TraitGroup
                  title="Efficiency & shooting"
                  traits={grouped.efficiency}
                />
                <TraitGroup title="Offense" traits={grouped.offense} />
                <TraitGroup title="Defense" traits={grouped.defense} />
              </section>
            ) : null}
            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading Season Evidence…" />
              }
            >
              <TeamEvidenceIsland
                teamId={askTeamId}
                season={season}
                abbreviation={identityTeam.abbreviation}
                fullName={displayName}
              />
            </Suspense>
          </div>
        ) : null}
      </main>
      </GlassTintScaleProvider>
    </DestinationClientShell>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}

function TraitGroup({
  title,
  traits,
}: {
  title: string;
  traits: ReturnType<typeof enrichTraitsWithPrior>;
}) {
  if (!traits.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[14px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div data-hover-group className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {traits.map((trait) => (
          <div key={trait.id} data-stat-tile data-hover-item className="sports-card px-4 py-4">
            <StatDisclosure
              label={trait.label}
              context={trait.context}
              conceptId={
                trait.id === "3par"
                  ? "three_par"
                  : trait.id === "asttov"
                    ? "ast_to"
                    : trait.id === "opp"
                      ? "opp_ppg"
                      : trait.id
              }
            />
            {trait.context.vsPrior != null ? (
              <p className="mt-2 text-[12px] text-muted-foreground">
                {formatTraitPriorDelta(trait.id, trait.context.vsPrior)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

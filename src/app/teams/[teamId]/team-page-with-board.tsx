import { Suspense, type ComponentProps } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { analyzeTeamProfile } from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { TeamDestinationIdentity } from "@/components/teams/team-destination-identity";
import { TeamLeadershipSection } from "@/components/teams/team-leadership-section";
import { TeamOpeningNightIsland } from "@/components/teams/overview/team-opening-night-island";
import { TeamRosterWar1Island } from "@/components/teams/overview/team-roster-war1-island";
import { TeamOverviewVisuals } from "@/components/teams/overview/team-overview-visuals";
import { TeamSeasonRecapIsland } from "@/components/teams/overview/team-season-recap-island";
import { StatsRankGrid } from "@/components/teams/viz/stats-rank-grid";
import { TeamPrimaryNav } from "@/components/teams/team-primary-nav";
import { TeamSalaryAssetsTab } from "@/components/teams/team-salary-assets-tab";
import { TeamRosterSourcesSection } from "@/components/teams/team-roster-sources-section";
import { getFranchiseHistory } from "@/data/queries/franchises";
import { formatOrdinal } from "@/lib/format";
import { isSeasonAwaitingFirstGame } from "@/lib/nba-season-status";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
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

async function TeamGamesTab(props: {
  team: import("@/data/types").TeamSeasonStats;
  brand: import("@/lib/nba-brand").TeamBrand | null | undefined;
  season: string;
  scheduleTeamId: string;
  teamKey: string;
}) {
  const [{ TeamGamesIsland }, { TeamScheduleIsland }] = await Promise.all([
    import("@/components/teams/team-games-island"),
    import("@/components/teams/team-schedule-island"),
  ]);
  return (
    <TeamGamesIsland
      team={props.team}
      brand={props.brand}
      season={props.season}
      schedule={
        <TeamScheduleIsland
          teamId={props.scheduleTeamId}
          season={props.season}
          teamKey={props.teamKey}
        />
      }
    />
  );
}

async function TeamSentimentTabLazy({ teamId }: { teamId: string }) {
  const { TeamSentimentTab } = await import(
    "@/components/teams/team-sentiment-tab"
  );
  return <TeamSentimentTab teamId={teamId} />;
}

async function TeamTransactionsIslandLazy({
  teamFilterId,
}: {
  teamFilterId: string;
}) {
  const { TeamTransactionsIsland } = await import(
    "@/components/teams/team-transactions-island"
  );
  return <TeamTransactionsIsland teamFilterId={teamFilterId} />;
}

async function TeamSplitsIslandLazy(props: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const { TeamSplitsIsland } = await import(
    "@/components/teams/team-splits-island"
  );
  return <TeamSplitsIsland {...props} />;
}

async function TeamPlayoffsIslandLazy(props: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const { TeamPlayoffsIsland } = await import(
    "@/components/teams/team-playoffs-island"
  );
  return <TeamPlayoffsIsland {...props} />;
}

async function TeamRosterIslandLazy(props: {
  teamId: string;
  season: string;
  sortParam?: string;
  sortDirParam?: string;
}) {
  const { TeamRosterIsland } = await import(
    "@/components/teams/team-roster-island"
  );
  return <TeamRosterIsland {...props} />;
}

async function TeamLineupsIslandLazy(props: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const { TeamLineupsIsland } = await import(
    "@/components/teams/team-lineups-island"
  );
  return <TeamLineupsIsland {...props} />;
}

async function TeamRosterBuiltIslandLazy(props: { espnTeamId: string }) {
  const { TeamRosterBuiltIsland } = await import(
    "@/components/teams/team-roster-built-island"
  );
  return <TeamRosterBuiltIsland {...props} />;
}

async function TeamOffenseIslandLazy(
  props: ComponentProps<
    typeof import("@/components/teams/team-offense-island").TeamOffenseIsland
  >
) {
  const { TeamOffenseIsland } = await import(
    "@/components/teams/team-offense-island"
  );
  return <TeamOffenseIsland {...props} />;
}

async function TeamHustleIslandLazy(
  props: ComponentProps<
    typeof import("@/components/teams/team-hustle-island").TeamHustleIsland
  >
) {
  const { TeamHustleIsland } = await import(
    "@/components/teams/team-hustle-island"
  );
  return <TeamHustleIsland {...props} />;
}

async function TeamOnOffIslandLazy(props: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const { TeamOnOffIsland } = await import(
    "@/components/teams/team-on-off-island"
  );
  return <TeamOnOffIsland {...props} />;
}

async function TeamEvidenceIslandLazy(
  props: ComponentProps<
    typeof import("@/components/teams/team-evidence-island").TeamEvidenceIsland
  >
) {
  const { TeamEvidenceIsland } = await import(
    "@/components/teams/team-evidence-island"
  );
  return <TeamEvidenceIsland {...props} />;
}

export async function TeamPageWithBoard({
  teamId,
  sp,
  seasonParam,
  season,
  priorSeason,
  currentSeason,
  tab,
  seasonType,
  rate,
  fromHistory,
  themeMode,
  applyEraTheme,
  brandPresentation,
  identityFallback,
}: {
  teamId: string;
  sp: Record<string, string | string[] | undefined>;
  seasonParam: string | undefined;
  season: string;
  priorSeason: string;
  currentSeason: string;
  tab: ReturnType<typeof parseTeamPageTab>;
  seasonType: ReturnType<typeof parseTeamSeasonKind>;
  rate: ReturnType<typeof parseTeamRateMode>;
  fromHistory: boolean;
  themeMode: "modern" | "historical" | string;
  applyEraTheme: boolean;
  brandPresentation: "era" | "modern_surface";
  identityFallback: NonNullable<ReturnType<typeof resolveTeamIdentityFallback>>;
}) {
  const t = await getTranslations("TeamDetail");

  // Dynamic import keeps request-cache / team-board-snapshot off the page
  // module graph until this point.
  const { getTeamSeasonBoardCached } = await import(
    "@/data/queries/request-cache"
  );

  // Season board only on the critical path — skip prior-season board and
  // explore-season fan-out before first paint (prior loads below when needed).
  const seasonBoard = await getTeamSeasonBoardCached(season);
  const league = seasonBoard.rows;
  const seasonAwaitingGames = isSeasonAwaitingFirstGame(season, league);

  const boardTeam = resolveTeamFromBoard(league, teamId);

  // Parent already resolved canonical identity; board may still upgrade the row.
  if (!boardTeam && !identityFallback) notFound();

  // Season picker options without awaiting explore season lists.
  const exploreSeasons = [currentSeason, priorSeason, season];

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

  const modernBrand = resolveTeamBrand(identityTeam.abbreviation);

  // Prior board + standings in parallel after season board — not serial.
  // Skip prior entirely while the season is still awaiting tip-off.
  const [priorLeague, standingsContext] = await Promise.all([
    seasonAwaitingGames || !boardTeam
      ? Promise.resolve([] as typeof seasonBoard.rows)
      : getTeamSeasonBoardCached(priorSeason)
          .then((b) => b.rows)
          .catch(() => [] as typeof seasonBoard.rows),
    boardTeam
      ? resolveTeamStandingsDisplay({
          season,
          currentSeason,
          team: boardTeam,
          brand: modernBrand,
          boardRows: league,
        })
      : Promise.resolve({
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
        }),
  ]);

  const prior = boardTeam
    ? priorLeague.find((t) => t.teamId === boardTeam.teamId) ??
      priorLeague.find(
        (t) =>
          t.abbreviation.toLowerCase() ===
          boardTeam.abbreviation.toLowerCase()
      ) ??
      null
    : null;

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


  return (
    <>
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
              <Suspense
                fallback={<DestinationSectionSkeleton label={t("loadingGames")} />}
              >
                <TeamOpeningNightIsland
                  teamId={resolvedTeamId}
                  season={season}
                  teamName={displayName}
                />
              </Suspense>
              <Suspense
                fallback={<DestinationSectionSkeleton label={t("loadingPriorReview", { season: priorSeason })} />}
              >
                <TeamSeasonRecapIsland routeTeamId={teamId} season={priorSeason} />
              </Suspense>
              <Suspense
                fallback={<DestinationSectionSkeleton label={t("loadingRosterWar1")} />}
              >
                <TeamRosterWar1Island
                  season={season}
                  teamKey={identityTeam.abbreviation}
                  gamesPlayed={null}
                  record={null}
                />
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
              record={
                standing && standing.wins + standing.losses > 0
                  ? { wins: standing.wins, losses: standing.losses }
                  : null
              }
            />
          ) : (
            <section
              id="performance"
              className="scroll-mt-16 flex flex-col gap-3"
              aria-label={t("ariaOverview")}
            >
              <h2 className="text-[20px] font-bold tracking-tight">
                {t("howGoodTitle")}
              </h2>
              <p className="text-[14px] text-muted-foreground">
                {t("boardUnavailable", { season })}
              </p>
            </section>
          )
        ) : null}

        {tab === "players" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label={t("loadingRoster")} />}
          >
            <TeamRosterIslandLazy
              teamId={resolvedTeamId}
              season={season}
              sortParam={Array.isArray(sp.sort) ? sp.sort[0] : sp.sort}
              sortDirParam={Array.isArray(sp.dir) ? sp.dir[0] : sp.dir}
            />
          </Suspense>
        ) : null}

        {tab === "players" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label={t("loadingRotation")} />}
          >
            <TeamLineupsIslandLazy
              teamId={resolvedTeamId}
              season={season}
              teamKey={identityTeam.abbreviation}
            />
          </Suspense>
        ) : null}

        {tab === "players" && season === currentSeason && askTeamId ? (
          <Suspense fallback={null}>
            <TeamRosterBuiltIslandLazy espnTeamId={askTeamId} />
          </Suspense>
        ) : null}

        {tab === "offense" ? (
          boardAvailable && !seasonAwaitingGames ? (
            <Suspense
              fallback={<DestinationSectionSkeleton label={t("loadingOffense")} />}
            >
              <TeamOffenseIslandLazy
                teamId={resolvedTeamId}
                season={season}
                teamKey={identityTeam.abbreviation}
                team={boardTeam!}
                offenseMetrics={offenseMetrics}
                leagueTs={scorecard.find((m) => m.key === "ts")?.leagueAverage ?? null}
              />
            </Suspense>
          ) : (
            <section id="offense" className="scroll-mt-16" aria-label={t("ariaOffense")}>
              <p className="text-[14px] text-muted-foreground">
                {t("offenseUnavailable", { season })}
              </p>
            </section>
          )
        ) : null}

        {tab === "offense" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label={t("loadingHustle")} />}
          >
            <TeamHustleIslandLazy
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
            fallback={<DestinationSectionSkeleton label={t("loadingOnOff")} />}
          >
            <TeamOnOffIslandLazy
              teamId={resolvedTeamId}
              season={season}
              teamKey={identityTeam.abbreviation}
            />
          </Suspense>
        ) : null}

        {tab === "games" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label={t("loadingGames")} />}
          >
            <TeamGamesTab
              team={identityTeam}
              brand={modernBrand}
              season={season}
              scheduleTeamId={resolvedTeamId}
              teamKey={identityTeam.abbreviation}
            />
          </Suspense>
        ) : null}

        {tab === "splits" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label={t("loadingSplits")} />}
          >
            <TeamSplitsIslandLazy teamId={resolvedTeamId} season={season} teamKey={identityTeam.abbreviation} />
          </Suspense>
        ) : null}

        {tab === "playoffs" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label={t("loadingPlayoffs")} />}
          >
            <TeamPlayoffsIslandLazy teamId={resolvedTeamId} season={season} teamKey={identityTeam.abbreviation} />
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
              <Suspense fallback={<DestinationSectionSkeleton label={t("loadingRosterMoves")} />}>
                <TeamRosterSourcesSection teamId={askTeamId} teamKey={identityTeam.abbreviation} />
              </Suspense>
            ) : null}
            <Suspense
              fallback={
                <DestinationSectionSkeleton label={t("loadingTransactions")} />
              }
            >
              <TeamTransactionsIslandLazy teamFilterId={txTeamId} />
            </Suspense>
          </div>
        ) : null}

        {tab === "sentiment" ? (
          <Suspense fallback={<DestinationSectionSkeleton label={t("loadingSentiment")} />}>
            <TeamSentimentTabLazy teamId={resolvedTeamId} />
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
                aria-label={t("ariaAllStats")}
              >
                <div>
                  <h2 className="text-[20px] font-bold tracking-tight">
                    {t("allStatsTitle")}
                  </h2>
                  <p className="text-[14px] text-muted-foreground">
                    {t("allStatsHint", { rate })}
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
                <TraitGroup title={t("traitOverall")} traits={grouped.overall} />
                <TraitGroup
                  title={t("traitEfficiency")}
                  traits={grouped.efficiency}
                />
                <TraitGroup title={t("traitOffense")} traits={grouped.offense} />
                <TraitGroup title={t("traitDefense")} traits={grouped.defense} />
              </section>
            ) : null}
            <Suspense
              fallback={
                <DestinationSectionSkeleton label={t("loadingSeasonEvidence")} />
              }
            >
              <TeamEvidenceIslandLazy
                teamId={askTeamId}
                season={season}
                abbreviation={identityTeam.abbreviation}
                fullName={displayName}
              />
            </Suspense>
          </div>
        ) : null}

    </>
  );
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

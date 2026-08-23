import { Suspense } from "react";
import { notFound } from "next/navigation";

import { analyzeTeamProfile } from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { TeamArcIsland } from "@/components/teams/team-arc-island";
import { TeamAskLinks } from "@/components/teams/team-ask-links";
import { TeamAssetsIsland } from "@/components/teams/team-assets-island";
import { TeamContextBar } from "@/components/teams/team-context-bar";
import { TeamDestinationIdentity } from "@/components/teams/team-destination-identity";
import { TeamEvidenceIsland } from "@/components/teams/team-evidence-island";
import { TeamFrontOfficeIsland } from "@/components/teams/team-front-office-island";
import { TeamGamesIsland } from "@/components/teams/team-games-island";
import { FranchiseTimeline } from "@/components/teams/franchise-timeline";
import { TeamMatchupPreview } from "@/components/teams/team-matchup-preview";
import { TeamMovementIsland } from "@/components/teams/team-movement-island";
import { TeamPreseasonOverview } from "@/components/teams/team-preseason-overview";
import { TeamOverviewBoard } from "@/components/teams/team-overview-board";
import { TeamPrimaryNav } from "@/components/teams/team-primary-nav";
import { TeamRosterIsland } from "@/components/teams/team-roster-island";
import { TeamTabScaffold } from "@/components/teams/team-tab-scaffold";
import { TeamTransactionsIsland } from "@/components/teams/team-transactions-island";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getTeamExploreSeasons } from "@/data/queries";
import { getTeamSeasonBoardCached } from "@/data/queries/request-cache";
import type { TeamSeasonStats } from "@/data/types";
import { formatOrdinal } from "@/lib/format";
import { isSeasonAwaitingFirstGame } from "@/lib/nba-season-status";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import {
  parseTeamPageTab,
  parseTeamRateMode,
  parseTeamSeasonKind,
  resolveTeamIdentityFallback,
  type TeamPageHrefOpts,
} from "@/lib/team-destination";
import { buildTeamRankedMetrics } from "@/lib/team-page-metrics";
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

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: TeamPageProps) {
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season =
    seasonParam ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const board = await getTeamSeasonBoardCached(season);
  const boardTeam = resolveTeamFromBoard(board.rows, teamId);
  if (boardTeam) {
    return {
      title: `${boardTeam.fullName} | Basketball Analytics`,
    };
  }
  const fallback = resolveTeamIdentityFallback(teamId, season, "era");
  return {
    title: fallback
      ? `${fallback.fullName} | Basketball Analytics`
      : "Team | Basketball Analytics",
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
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const tab = parseTeamPageTab(Array.isArray(sp.tab) ? sp.tab[0] : sp.tab);
  const seasonType = parseTeamSeasonKind(
    Array.isArray(sp.seasonType) ? sp.seasonType[0] : sp.seasonType
  );
  const rate = parseTeamRateMode(Array.isArray(sp.rate) ? sp.rate[0] : sp.rate);
  const arcParam = Array.isArray(sp.arc) ? sp.arc[0] : sp.arc;
  const showingFullArc = arcParam === "full";
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const season = seasonParam ?? currentSeason;
  const priorSeason = shiftCanonicalSeason(season, -1);
  const { fromHistory, themeMode, applyEraTheme } =
    parseDestinationHistoryArrival(sp);

  const [seasonBoard, priorBoard, exploreSeasons] = await Promise.all([
    getTeamSeasonBoardCached(season),
    getTeamSeasonBoardCached(priorSeason),
    getTeamExploreSeasons().catch(() => [currentSeason, priorSeason]),
  ]);

  const league = seasonBoard.rows;
  const priorLeague = priorBoard.rows;
  const seasonAwaitingGames = isSeasonAwaitingFirstGame(season, league);

  const boardTeam = resolveTeamFromBoard(league, teamId);
  const brandPresentation =
    applyEraTheme && themeMode !== "modern" ? "era" : "modern_surface";

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
  const strengths = [...traits]
    .filter((t) => t.percentile >= 67)
    .slice(0, 3);
  const weaknesses = [...traits]
    .filter((t) => t.percentile <= 33)
    .sort((a, b) => a.percentile - b.percentile)
    .slice(0, 3);
  const hrefOpts: TeamPageHrefOpts = {
    season,
    tab,
    seasonType,
    rate,
    fromHistory,
    themeMode: themeMode === "modern" ? "modern" : "historical",
  };

  const seasonOptions = [
    ...new Set([
      season,
      ...exploreSeasons,
      priorSeason,
      currentSeason,
    ]),
  ]
    .filter(Boolean)
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
      <main className="site-shell relative z-[1] flex flex-col gap-4 py-5 sm:gap-5 sm:py-7">
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
        />

        <TeamPrimaryNav
          teamId={teamId}
          tab={tab}
          hrefOpts={hrefOpts}
        />
        <TeamContextBar teamId={teamId} tab={tab} hrefOpts={hrefOpts} />

        {tab === "overview" ? (
          seasonAwaitingGames && boardAvailable ? (
            <TeamPreseasonOverview
              season={season}
              teamName={displayName}
              teamId={teamId}
              standings={standingsContext}
            />
          ) : boardAvailable && analysis ? (
            <TeamOverviewBoard
              offense={offenseMetrics}
              defense={defenseMetrics}
              factors={factorMetrics}
              strengths={strengths}
              weaknesses={weaknesses}
              howTheyWin={analysis.howTheyWin}
              traits={traits}
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
                Season board unavailable for {season}. Identity above uses
                team-era resolution - rates are not fabricated as zeroes.
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
              teamKey={identityTeam.abbreviation}
            />
          </Suspense>
        ) : null}

        {tab === "offense" ? (
          <TeamTabScaffold
            id="offense"
            title="Offense"
            reason="Shot maps, play types, transition splits, and tracking land in P1. Overview already shows offense board percentiles."
            planned={[
              "Shot location map",
              "Play-type profile",
              "Transition vs half court",
              "Ball movement / drives",
              "Clutch offense",
            ]}
          />
        ) : null}

        {tab === "defense" ? (
          <TeamTabScaffold
            id="defense"
            title="Defense"
            reason="Opponent shot maps, rim deterrence, and hustle need tracking feeds. Overview shows opponent PPG and steal/block board ranks."
            planned={[
              "Opponent shot map",
              "Rim protection",
              "Three-point prevention",
              "Defensive play types",
              "Hustle and contests",
            ]}
          />
        ) : null}

        {tab === "lineups" ? (
          <TeamTabScaffold
            id="lineups"
            title="Lineups"
            reason="Five-man lineups, on/off, and WOWY require possession-level PBP. Every lineup result will show possessions when that feed ships."
            planned={[
              "Five-player lineup table",
              "On/off explorer",
              "Pair matrix",
              "WOWY",
              "Clutch lineups",
            ]}
          />
        ) : null}

        {tab === "games" ? (
          <Suspense
            fallback={<DestinationSectionSkeleton label="Loading games…" />}
          >
            <TeamGamesIsland
              team={identityTeam}
              brand={modernBrand}
              season={season}
            />
          </Suspense>
        ) : null}

        {tab === "splits" ? (
          <TeamTabScaffold
            id="splits"
            title="Splits"
            reason="Home/road, rest, clutch, and opponent splits need game-level aggregation endpoints."
            planned={[
              "Home / away",
              "Rest and back-to-backs",
              "Clutch",
              "Monthly splits",
              "Side-by-side split compare",
            ]}
          />
        ) : null}

        {tab === "playoffs" ? (
          <TeamTabScaffold
            id="playoffs"
            title="Playoffs"
            reason="Series navigation and playoff-only tables stay separate from the regular-season board. Empty until a playoff ledger is wired."
            planned={[
              "Seed and series record",
              "Regular season vs playoffs",
              "Series game log",
              "Playoff rotation",
            ]}
          />
        ) : null}

        {tab === "history" ? (
          <div className="flex flex-col gap-4">
            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading Team Arc…" />
              }
            >
              <TeamArcIsland
                teamRouteKey={teamId}
                teamId={resolvedTeamId}
                teamName={displayName}
                abbreviation={identityTeam.abbreviation}
                season={season}
                priorSeason={priorSeason}
                showingFullArc={showingFullArc}
                teamEspnId={askTeamId}
                currentBoard={league}
                priorBoard={priorLeague}
              />
            </Suspense>
            <FranchiseTimeline canonicalTeamId={resolvedTeamId} />
            <TeamMatchupPreview canonicalTeamId={resolvedTeamId} />
          </div>
        ) : null}

        {tab === "organization" ? (
          <div className="flex flex-col gap-4">
            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading front office…" />
              }
            >
              <TeamFrontOfficeIsland
                teamId={resolvedTeamId}
                season={season}
              />
            </Suspense>
            <Suspense fallback={null}>
              <TeamMovementIsland teamId={resolvedTeamId} />
            </Suspense>
            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading Cap & assets…" />
              }
            >
              <TeamAssetsIsland
                teamId={askTeamId}
                abbreviation={identityTeam.abbreviation}
                season={season}
                teamKey={identityTeam.abbreviation}
              />
            </Suspense>
            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading transactions…" />
              }
            >
              <TeamTransactionsIsland teamFilterId={txTeamId} />
            </Suspense>
            <section
              id="ask"
              className="scroll-mt-16 flex flex-col gap-3"
              aria-label="Ask DRBL"
            >
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">
                  Ask DRBL about this team
                </h2>
                <p className="text-[14px] text-muted-foreground">
                  Prefills supported team-board and offseason queries only.
                </p>
              </div>
              <div className="sports-card p-4 sm:p-5">
                <TeamAskLinks
                  teamName={displayName}
                  season={season}
                  teamId={askTeamId}
                  priorSeason={priorSeason}
                />
              </div>
            </section>
          </div>
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
                    Full board ledger. Overview explains; this tab proves.
                    Rate mode is stored as {rate} - counting stats stay
                    per-game until a totals endpoint is selected.
                  </p>
                </div>
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {traits.map((trait) => (
          <div key={trait.id} className="sports-card px-4 py-4">
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

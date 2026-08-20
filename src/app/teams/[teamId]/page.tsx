import { Suspense } from "react";
import { notFound } from "next/navigation";

import { analyzeTeamProfile } from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { TransitionLink } from "@/components/continuity/query-nav";
import { TeamArcIsland } from "@/components/teams/team-arc-island";
import { TeamAskLinks } from "@/components/teams/team-ask-links";
import { TeamAssetsIsland } from "@/components/teams/team-assets-island";
import { TeamDestinationIdentity } from "@/components/teams/team-destination-identity";
import { TeamEvidenceIsland } from "@/components/teams/team-evidence-island";
import { TeamFrontOfficeIsland } from "@/components/teams/team-front-office-island";
import { TeamGamesIsland } from "@/components/teams/team-games-island";
import { TeamPageNav } from "@/components/teams/team-page-nav";
import { TeamRosterIsland } from "@/components/teams/team-roster-island";
import { TeamTransactionsIsland } from "@/components/teams/team-transactions-island";
import { FranchiseTimeline } from "@/components/teams/franchise-timeline";
import { TeamMatchupPreview } from "@/components/teams/team-matchup-preview";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getLeagueStandings, getTeamExploreSeasons } from "@/data/queries";
import { getTeamSeasonBoardCached } from "@/data/queries/request-cache";
import type { TeamSeasonStats } from "@/data/types";
import type { StandingRow } from "@/data/types/standings";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { resolveTeamIdentityFallback } from "@/lib/team-destination";
import {
  assessTeamCoverage,
  buildTeamIdentityStatements,
  enrichTraitsWithPrior,
  findStandingRow,
  formatTraitPriorDelta,
  groupTraitsForPerformance,
  resolveTeamFromBoard,
  transactionTeamFilterId,
} from "@/lib/team-explorer";
import {
  resolveActiveEraTheme,
} from "@/themes/era-theme";
import {
  historyHref,
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
  const arcParam = Array.isArray(sp.arc) ? sp.arc[0] : sp.arc;
  const gamesPageRaw = Array.isArray(sp.gamesPage) ? sp.gamesPage[0] : sp.gamesPage;
  const gamesPage = Math.max(1, Number.parseInt(gamesPageRaw ?? "1", 10) || 1);
  const showingFullArc = arcParam === "full";
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const season = seasonParam ?? currentSeason;
  const priorSeason = shiftCanonicalSeason(season, -1);
  const { fromHistory, themeMode, applyEraTheme } =
    parseDestinationHistoryArrival(sp);

  const [seasonBoard, priorBoard, seasonOptions, standings] = await Promise.all([
    getTeamSeasonBoardCached(season),
    getTeamSeasonBoardCached(priorSeason),
    getTeamExploreSeasons().catch(() => [currentSeason, priorSeason]),
    season === currentSeason
      ? getLeagueStandings(season).catch(() => null)
      : Promise.resolve(null),
  ]);

  const league = seasonBoard.rows;
  const priorLeague = priorBoard.rows;
  const boardWarning =
    seasonBoard.status === "ok"
      ? null
      : seasonBoard.warning ??
        `Team metrics unavailable for ${season}.`;

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

  const analysis = boardTeam
    ? analyzeTeamProfile({ team: boardTeam, league, prior })
    : null;
  const traits = analysis
    ? enrichTraitsWithPrior(analysis.traits, boardTeam!, prior)
    : [];
  const modernBrand = resolveTeamBrand(identityTeam.abbreviation);
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

  const standingRows: StandingRow[] =
    standings?.conferences.flatMap((c) => c.rows) ?? [];
  const standing = boardTeam
    ? findStandingRow(standingRows, boardTeam, modernBrand)
    : null;

  const identity = buildTeamIdentityStatements(traits);
  const grouped = groupTraitsForPerformance(traits);
  const coverage = assessTeamCoverage({
    hasTeamBoard: boardAvailable,
    traitCount: traits.length,
    rosterCount: 0,
    gameCount: 0,
    transactionCount: 0,
  });
  const coverageLines = coverage.lines.filter(
    (l) =>
      l.label === "Current season board" ||
      l.label === "League-context traits" ||
      l.label === "PBP / lineups"
  );

  const seasonChips = [
    ...new Set([
      season,
      ...seasonOptions.slice(0, 6),
      priorSeason,
      currentSeason,
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 8);

  const displayName =
    useHistoricalMark && historicalBrand?.displayName
      ? historicalBrand.displayName
      : identityTeam.fullName;

  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(season, themeMode)
    : null;

  const backHref = fromHistory
    ? historyHref({
        season,
        theme: themeMode === "modern" ? "modern" : undefined,
      })
    : `/explore/teams?season=${encodeURIComponent(season)}`;

  const body = (
    <DestinationClientShell className="relative">
      <PageAtmosphere
        colorA={
          historicalBrand?.palette?.primary ?? modernBrand?.primary ?? null
        }
        colorB={
          historicalBrand?.palette?.secondary ??
          modernBrand?.secondary ??
          modernBrand?.primary ??
          null
        }
      />
      <main className="relative z-[1] site-shell flex flex-col gap-4 py-5 sm:gap-5 sm:py-7">
        <p>
          <TransitionLink
            href={backHref}
            className="text-[13px] font-semibold text-muted-foreground"
          >
            ← {fromHistory ? "Time Machine" : "Teams board"}
          </TransitionLink>
        </p>

        <TeamPageNav />

        <TeamDestinationIdentity
          teamId={teamId}
          team={identityTeam}
          season={season}
          seasonChips={seasonChips}
          standing={standing}
          modernBrand={modernBrand}
          historicalBrand={historicalBrand}
          useHistoricalMark={useHistoricalMark}
          askTeamId={askTeamId}
          txTeamId={txTeamId}
          priorSeason={priorSeason}
          boardAvailable={boardAvailable}
          fromHistory={fromHistory}
          themeMode={themeMode === "modern" ? "modern" : "historical"}
          snapshotExtra={
            traits[0]
              ? `${Math.round(traits[0].percentile)}th pct · ${traits[0].label}`
              : boardWarning
          }
          coverageSummary={
            <>
              Coverage: {coverage.level}
              {boardWarning ? (
                <>
                  {" · "}
                  <span className="text-foreground">{boardWarning}</span>
                </>
              ) : null}
              {" · "}
              {coverageLines
                .map(
                  (l) =>
                    `${l.label} ${l.status === "ok" ? "✓" : l.status === "partial" ? "partial" : "—"}`
                )
                .join(" · ")}
              . Deep sections stream below. Missing metrics are not zeroes. PBP
              unavailable.
            </>
          }
        />

        {boardAvailable && analysis ? (
          <>
        {/* HOW GOOD — core from board */}
        <section
          id="performance"
          className="scroll-mt-16 flex flex-col gap-4"
          aria-label="Performance"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[17px] font-bold tracking-tight">
                How good are they?
              </h2>
              <p className="text-[13px] text-muted-foreground">
                Analytical profile from the team season board — Level-2 context
                on each number. No invented overall composite.
              </p>
            </div>
            <a
              href="#identity"
              className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              What&apos;s changing →
            </a>
          </div>

          <TraitGroup title="Overall" traits={grouped.overall} />
          <TraitGroup
            title="Efficiency & shooting"
            traits={grouped.efficiency}
          />
          <TraitGroup title="Offense" traits={grouped.offense} />
          <TraitGroup title="Defense" traits={grouped.defense} />
        </section>

        {/* HOW THEY WIN + IDENTITY + TRENDS — same board wave */}
        <section
          id="identity"
          className="scroll-mt-16 flex flex-col gap-4"
          aria-label="Identity"
        >
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">
              How do they win?
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Strongest measurable traits vs the league this season.
            </p>
          </div>

          <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
            <ul className="flex flex-col gap-3">
              {analysis.howTheyWin.map((finding) => (
                <li
                  key={finding.id}
                  className="rounded-md bg-secondary/50 px-3 py-3"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {finding.eyebrow}
                  </p>
                  <p className="text-[15px] font-semibold">{finding.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {finding.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
            <div>
              <h3 className="text-[15px] font-bold tracking-tight">
                Statistical identity
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Measurable Top / Bottom bands — not stylistic labels. Deeper
                identity arrives with PBP later.
              </p>
            </div>
            {identity.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No Top-10 / Bottom-10 identity traits for this sample yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {identity.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-md border border-border/70 bg-white/40 px-3 py-2 text-[13px]"
                  >
                    <span className="font-semibold">{s.text}</span>
                    <span className="ml-2 text-muted-foreground">
                      {Math.round(s.percentile)}th pct
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
            <div>
              <h3 className="text-[15px] font-bold tracking-tight">
                What&apos;s changing?
              </h3>
              <p className="text-[13px] text-muted-foreground">
                {analysis.vsPrior
                  ? `${analysis.vsPrior.priorSeason} → ${season} · existing team-profile noise floors`
                  : "Prior-season team board unavailable for comparison."}
              </p>
            </div>
            {analysis.vsPrior?.finding ? (
              <div className="rounded-md bg-secondary/50 px-3 py-3">
                <p className="text-[15px] font-semibold">
                  {analysis.vsPrior.finding.title}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {analysis.vsPrior.finding.body}
                </p>
              </div>
            ) : null}
            {analysis.vsPrior?.changes.length ? (
              <ul className="flex flex-col">
                {analysis.vsPrior.changes.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0"
                  >
                    <span className="text-[13px] font-semibold">{c.label}</span>
                    <span className="text-[14px] font-bold tabular-nums">
                      {c.deltaDisplay}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No clear season-to-season team deltas cleared the noise filter.
              </p>
            )}
            <p className="text-[12px] text-muted-foreground">
              Season evolution charts are deferred — Team Arc below lists the
              multi-year board history; selector above switches the profile year.
            </p>
          </div>
        </section>
          </>
        ) : (
          <section
            id="performance"
            className="scroll-mt-16 flex flex-col gap-3"
            aria-label="Performance"
          >
            <h2 className="text-[17px] font-bold tracking-tight">
              How good are they?
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Season board unavailable for {season}. Identity above uses
              team-era resolution — rates are not fabricated as zeroes.
            </p>
          </section>
        )}

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

        <Suspense
          fallback={<DestinationSectionSkeleton label="Loading roster…" />}
        >
          <TeamRosterIsland
            teamId={resolvedTeamId}
            season={season}
            teamKey={identityTeam.abbreviation}
          />
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
            <DestinationSectionSkeleton label="Loading front office…" />
          }
        >
          <TeamFrontOfficeIsland teamId={resolvedTeamId} season={season} />
        </Suspense>

        <Suspense
          fallback={<DestinationSectionSkeleton label="Loading games…" />}
        >
          <TeamGamesIsland
            team={identityTeam}
            brand={modernBrand}
            season={season}
            gamesPage={gamesPage}
            fromHistory={fromHistory}
            theme={themeMode === "modern" ? "modern" : undefined}
          />
        </Suspense>

        <FranchiseTimeline canonicalTeamId={resolvedTeamId} />

        <TeamMatchupPreview canonicalTeamId={resolvedTeamId} />

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
            <h2 className="text-[17px] font-bold tracking-tight">
              Ask DRBL about this team
            </h2>
            <p className="text-[13px] text-muted-foreground">
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
      <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
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

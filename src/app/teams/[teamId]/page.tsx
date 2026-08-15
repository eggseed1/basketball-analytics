import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { analyzeTeamProfile } from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamAssetsSection } from "@/components/teams/team-assets-section";
import { TeamArcSection } from "@/components/teams/team-arc-section";
import { TeamAskLinks, askDrblTeamHref } from "@/components/teams/team-ask-links";
import { TeamGamesSection } from "@/components/teams/team-games-section";
import { TeamPageNav } from "@/components/teams/team-page-nav";
import { TeamRosterSection } from "@/components/teams/team-roster-section";
import { TeamSeasonEvidenceProfileSection } from "@/components/teams/team-season-evidence-profile";
import { TeamTransactionsSection } from "@/components/teams/team-transactions-section";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { currentOffseasonLabelYear } from "@/data/providers/transactions/offseason-window";
import {
  getLeagueStandings,
  getRecentGameSummaries,
  getTeamExploreSeasons,
  getTeamPlayers,
  getTeamSeasonArc,
  getTeamSeasonEvidence,
  getTeamSeasonStats,
  getUpcomingGameSummaries,
  listTeamArcCandidateSeasons,
  listTransactionEvents,
  teamArcDefaultWindow,
} from "@/data/queries";
import { getTeamAssets } from "@/data/queries/team-assets";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";
import type { TeamAssetLedger } from "@/data/types/team-assets";
import type { PlayerSeason, TeamSeasonStats } from "@/data/types";
import type { StandingRow } from "@/data/types/standings";
import type { TeamSeasonEvidence } from "@/analytics/season-evidence";
import { SEASON_EVIDENCE_METHODOLOGY } from "@/analytics/season-evidence";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { buildTeamArcModel } from "@/lib/team-arc";
import { teamComparePath } from "@/analytics/compare-team-seasons";
import {
  assessTeamCoverage,
  buildRosterBuckets,
  buildTeamIdentityStatements,
  enrichTraitsWithPrior,
  findStandingRow,
  formatTraitPriorDelta,
  groupTraitsForPerformance,
  resolveTeamFromBoard,
  seasonChipHref,
  transactionTeamFilterId,
} from "@/lib/team-explorer";

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
  const league = await getTeamSeasonStats(season).catch(() => []);
  const team = resolveTeamFromBoard(league, teamId);
  return {
    title: team
      ? `${team.fullName} | Basketball Analytics`
      : "Team | Basketball Analytics",
  };
}

export default async function TeamProfilePage({
  params,
  searchParams,
}: TeamPageProps) {
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const arcParam = Array.isArray(sp.arc) ? sp.arc[0] : sp.arc;
  const showingFullArc = arcParam === "full";
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const season = seasonParam ?? currentSeason;
  const priorSeason = shiftCanonicalSeason(season, -1);
  const offseasonYear = currentOffseasonLabelYear();

  const [league, priorLeague, seasonOptions] = await Promise.all([
    getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
    getTeamSeasonStats(priorSeason).catch(() => [] as TeamSeasonStats[]),
    getTeamExploreSeasons().catch(() => [currentSeason, priorSeason]),
  ]);

  const team = resolveTeamFromBoard(league, teamId);
  if (!team) notFound();

  const prior =
    priorLeague.find((t) => t.teamId === team.teamId) ??
    priorLeague.find(
      (t) => t.abbreviation.toLowerCase() === team.abbreviation.toLowerCase()
    ) ??
    null;

  const analysis = analyzeTeamProfile({ team, league, prior });
  const traits = enrichTraitsWithPrior(analysis.traits, team, prior);
  const brand = resolveTeamBrand(team.abbreviation);
  const txTeamId = transactionTeamFilterId(team, brand);
  const askTeamId = brand?.espnTeamId ?? team.teamId;

  const arcCandidates = listTeamArcCandidateSeasons({ latest: season });
  const arcSeasons = showingFullArc
    ? arcCandidates
    : teamArcDefaultWindow(season);

  // Parallel bounded fetches — reuse current/prior boards for the arc.
  const [
    roster,
    recentPool,
    upcomingBundle,
    txPage,
    standings,
    arcLoad,
    seasonEvidence,
    assetLedger,
  ] = await Promise.all([
      getTeamPlayers(team.teamId, season, { minimumGames: 10 }).catch(
        () => [] as PlayerSeason[]
      ),
      getRecentGameSummaries({ season, limit: 48 }).catch(() => []),
      season === currentSeason
        ? getUpcomingGameSummaries({ season, limit: 40 }).catch(() => ({
            games: [],
          }))
        : Promise.resolve({ games: [] }),
      listTransactionEvents(
        { teamId: txTeamId, offseasonYear },
        { page: 1, pageSize: 6 }
      ).catch(() => ({
        events: [],
        total: 0,
        page: 1,
        pageSize: 6,
        pageCount: 0,
      })),
      season === currentSeason
        ? getLeagueStandings(season).catch(() => null)
        : Promise.resolve(null),
      getTeamSeasonArc({
        teamId: team.teamId,
        abbreviation: team.abbreviation,
        seasons: arcSeasons,
        preloadedBoards: {
          [season]: league,
          ...(priorLeague.length ? { [priorSeason]: priorLeague } : {}),
        },
      }),
      getTeamSeasonEvidence({
        teamId: askTeamId,
        season,
        abbreviation: team.abbreviation,
        fullName: team.fullName,
      }).catch(
        (): TeamSeasonEvidence => ({
          subject: {
            kind: "team",
            teamId: askTeamId,
            abbreviation: team.abbreviation,
            fullName: team.fullName,
            matchTeamIds: [],
            matchAbbrs: [team.abbreviation],
          },
          season,
          findings: [],
          games: [],
          methodology: SEASON_EVIDENCE_METHODOLOGY,
          coverage: {
            gameCount: 0,
            categories: [],
            unsupported: [],
          },
          error: "Season evidence temporarily unavailable.",
        })
      ),
      getTeamAssets({
        teamId: askTeamId,
        abbreviation: team.abbreviation,
        season,
        minimumGames: 10,
      }).catch(
        (): TeamAssetLedger => ({
          teamId: askTeamId,
          asOfSeason: season,
          asOfDate: null,
          methodologyVersion: "1.0",
          lineageMethodologyVersion: "1.0",
          structuredLedgerAvailable: false,
          genealogyUiReady: false,
          categories: [],
          players: [],
          draftCapital: [],
          tradeExceptions: [],
          draftRights: [],
          notes: ["Team assets temporarily unavailable."],
        })
      ),
    ]);

  const txResolutionsByEventId = Object.fromEntries(
    await resolvePlayersForTransactionEvents(txPage.events).catch(
      () => new Map()
    )
  );

  const standingRows: StandingRow[] =
    standings?.conferences.flatMap((c) => c.rows) ?? [];
  const standing = findStandingRow(standingRows, team, brand);

  const identity = buildTeamIdentityStatements(traits);
  const grouped = groupTraitsForPerformance(traits);
  const buckets = buildRosterBuckets(roster);
  const coverage = assessTeamCoverage({
    hasTeamBoard: true,
    traitCount: traits.length,
    rosterCount: roster.length,
    gameCount: recentPool.length,
    transactionCount: txPage.events.length,
  });

  const arc = buildTeamArcModel({
    rows: arcLoad.rows,
    viewingSeason: season,
    showingFull: showingFullArc,
    fullCandidateCount: arcCandidates.length,
    missingSeasons: arcLoad.missingSeasons,
    failedSeasons: arcLoad.failedSeasons,
  });

  const seasonChips = [
    ...new Set([
      season,
      ...arc.rows.map((r) => r.season).slice(0, 6),
      ...seasonOptions.slice(0, 4),
      priorSeason,
      currentSeason,
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 8);

  const snapshotBits = [
    standing
      ? `${standing.wins}–${standing.losses}`
      : `${formatNumber(team.ppg, 1)} PPG`,
    `${team.avgDiff >= 0 ? "+" : ""}${formatNumber(team.avgDiff, 1)} diff`,
    `${formatPct(team.trueShootingPct)} TS`,
    traits[0]
      ? `${Math.round(traits[0].percentile)}th pct · ${traits[0].label}`
      : null,
  ].filter(Boolean);

  return (
    <main className="site-shell flex flex-col gap-4 py-5 sm:gap-5 sm:py-7">
      <p>
        <Link
          href={`/explore/teams?season=${encodeURIComponent(season)}`}
          className="text-[13px] font-semibold text-muted-foreground"
        >
          ← Teams board
        </Link>
      </p>

      <TeamPageNav />

      {/* WHO */}
      <section
        id="overview"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Overview"
      >
        <header
          className="sports-card score-card-wash overflow-hidden px-4 py-5 sm:px-5"
          style={
            brand
              ? ({
                  "--away-color": brand.primary,
                  "--home-color": brand.secondary,
                } as CSSProperties)
              : undefined
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <TeamLogo teamKey={team.abbreviation} size="xl" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {team.abbreviation} · {team.conference}
                {standing ? ` · #${standing.rank}` : null} · {season}
              </p>
              <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
                {team.fullName}
              </h1>
              <p className="mt-1 text-[14px] font-medium text-foreground">
                {snapshotBits.join(" · ")}
              </p>
              {standing ? (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {standing.streak ? `Streak ${standing.streak}` : null}
                  {standing.lastTen ? ` · L10 ${standing.lastTen}` : null}
                  {" · "}
                  <Link
                    href="/standings"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    Standings →
                  </Link>
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Live standings shown for the current season only when
                  available.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {seasonChips.map((option) => (
              <Link
                key={option}
                href={seasonChipHref(teamId, option)}
                scroll={false}
                className={
                  option === season
                    ? "rounded-md bg-foreground px-3 py-1 text-[12px] font-semibold text-background"
                    : "rounded-md bg-white/55 px-3 py-1 text-[12px] font-semibold text-foreground"
                }
              >
                {option}
              </Link>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-[13px] font-semibold">
            <Link
              href={askDrblTeamHref(
                `${team.fullName} point differential ${season}`,
                askTeamId
              )}
              className="underline-offset-2 hover:underline"
            >
              Ask DRBL →
            </Link>
            <a
              href="#arc"
              className="underline-offset-2 hover:underline"
            >
              Team Arc →
            </a>
            <Link
              href={teamComparePath({
                teamA: askTeamId,
                teamB: askTeamId,
                seasonA: season,
                seasonB: priorSeason,
              })}
              className="underline-offset-2 hover:underline"
            >
              Compare team →
            </Link>
            <a
              href="#evidence"
              className="underline-offset-2 hover:underline"
            >
              See season evidence →
            </a>
            <Link
              href={`/compare?mode=teams&view=rank&teamId=${encodeURIComponent(askTeamId)}`}
              className="underline-offset-2 hover:underline"
            >
              Rank seasons →
            </Link>
            <Link
              href={`/offseason?team=${encodeURIComponent(txTeamId)}`}
              className="underline-offset-2 hover:underline"
            >
              Offseason activity →
            </Link>
          </div>

          <p className="mt-4 text-[12px] text-muted-foreground">
            Coverage: {coverage.level}
            {" · "}
            {coverage.lines
              .map(
                (l) =>
                  `${l.label} ${l.status === "ok" ? "✓" : l.status === "partial" ? "partial" : "—"}`
              )
              .join(" · ")}
            . Missing metrics are not zeroes. PBP unavailable.
          </p>
        </header>
      </section>

      {/* HOW GOOD */}
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
              Analytical profile from the team season board — Level-2 context on
              each number. No invented overall composite.
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
        <TraitGroup title="Efficiency & shooting" traits={grouped.efficiency} />
        <TraitGroup title="Offense" traits={grouped.offense} />
        <TraitGroup title="Defense" traits={grouped.defense} />
      </section>

      {/* HOW THEY WIN + IDENTITY + TRENDS */}
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

      {/* TEAM ARC */}
      <section
        id="arc"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Team Arc"
      >
        <div className="sports-card p-4 sm:p-5">
          <TeamArcSection
            arc={arc}
            teamRouteKey={teamId}
            teamId={team.teamId}
            teamName={team.fullName}
            viewingSeason={season}
            teamEspnId={askTeamId}
          />
        </div>
      </section>

      {/* SEASON EVIDENCE → GAME LAB */}
      <TeamSeasonEvidenceProfileSection evidence={seasonEvidence} />

      {/* WHO DRIVES IT */}
      <section
        id="roster"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Roster"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Who drives it?
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Compact roster explorer — transparent categories only.
          </p>
        </div>
        <div className="sports-card p-4 sm:p-5">
          <TeamRosterSection
            buckets={buckets}
            season={season}
            teamKey={team.abbreviation}
            teamId={team.teamId}
          />
        </div>
      </section>

      {/* CAP / ASSETS */}
      <section
        id="assets"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Cap and assets"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Cap &amp; assets
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Verified inventory for this season — structured picks and exceptions
            stay unavailable until a licensed ledger exists.
          </p>
        </div>
        <div className="sports-card p-4 sm:p-5">
          <TeamAssetsSection
            ledger={assetLedger}
            teamKey={team.abbreviation}
          />
        </div>
      </section>

      {/* GAMES */}
      <section
        id="games"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Games"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
          <p className="text-[13px] text-muted-foreground">
            Recent / upcoming / notable from scoreboard samples · opens Game Lab
          </p>
        </div>
        <div className="sports-card p-4 sm:p-5">
          <TeamGamesSection
            recentPool={recentPool}
            upcomingPool={upcomingBundle.games}
            team={team}
            brand={brand}
            seasonAvgPpg={team.ppg}
          />
        </div>
      </section>

      {/* TRANSACTIONS */}
      <section
        id="transactions"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Transactions"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            {offseasonYear} Offseason
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Latest ESPN archive events involving this team.
          </p>
        </div>
        <div className="sports-card p-4 sm:p-5">
          <TeamTransactionsSection
            events={txPage.events}
            teamFilterId={txTeamId}
            offseasonYear={offseasonYear}
            resolutionsByEventId={txResolutionsByEventId}
          />
        </div>
      </section>

      {/* ASK */}
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
            teamName={team.fullName}
            season={season}
            teamId={askTeamId}
            priorSeason={priorSeason}
          />
        </div>
      </section>
    </main>
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

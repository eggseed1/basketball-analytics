import type { CSSProperties } from "react";

import {
  buildStatContext,
  computeCareerResume,
  computePlayerEvolution,
  dedupeCareerSeasons,
  explainMetric,
} from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { TeamLogo } from "@/components/brand/team-logo";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TransitionLink } from "@/components/continuity/query-nav";
import { askDrblHref } from "@/components/players/player-ask-links";
import { PlayerCareerResume } from "@/components/players/player-career-resume";
import { PlayerContextStrip } from "@/components/players/player-context-strip";
import {
  MiniStat,
  VsStat,
} from "@/components/players/player-destination-stats";
import { PlayerEvolutionPanel } from "@/components/players/player-evolution-panel";
import { PlayerSeasonExplorer } from "@/components/players/player-season-explorer";
import { PlayerSeasonAnalysisControl } from "@/components/players/player-season-rank-view";
import { PlayerPercentilePanel } from "@/components/players/player-percentile-panel";
import { defaultRankSeasons } from "@/analytics/rank-player-seasons";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  getFilteredPlayerSeasons,
} from "@/data/queries";
import { getPlayerSeasonCached } from "@/data/queries/request-cache";
import type { PlayerSeason } from "@/data/types";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { buildPlayerPercentileMetrics } from "@/lib/player-percentile-metrics";
import {
  careerSeasonAverages,
  mergePlayerSeasonStats,
  playerSeasonChipHref,
} from "@/lib/player-destination";
import {
  brandableTeamKey,
  brandableTeamKeyFromRow,
  isMultiTeamSeasonRow,
  multiTeamDisplayLabel,
} from "@/lib/player-team-context";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/themes/era-theme";
import { isDrblSeason } from "@/data/drbl/season-registry";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import Link from "next/link";

export type PlayerCoreIslandProps = {
  playerId: string;
  displayName: string;
  season: string;
  career: PlayerSeason[];
  seasonOptions: string[];
  seasonTeams: Record<string, string>;
  careerDataGuardSilentEmpty: boolean;
  /** Team key from career (identity); may be refined by seasonStats. */
  identityTeamKey?: string | null;
  useHistoricalBranding?: boolean;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
};

/**
 * Layer 2 — season stats + peers, analytical profile, career deep sections.
 * Games stay in a separate Suspense island.
 */
export async function PlayerCoreIsland({
  playerId,
  displayName,
  season,
  career,
  seasonOptions,
  seasonTeams,
  careerDataGuardSilentEmpty,
  identityTeamKey,
  useHistoricalBranding = false,
  fromHistory = false,
  themeMode = "historical",
}: PlayerCoreIslandProps) {
  const priorSeason = shiftCanonicalSeason(season, -1);
  const [seasonRaw, peers, priorBoard] = await Promise.all([
    getPlayerSeasonCached(playerId, season),
    getFilteredPlayerSeasons({
      season,
      minimumGames: 15,
    }).catch(() => [] as PlayerSeason[]),
    getFilteredPlayerSeasons({
      season: priorSeason,
      minimumGames: 15,
    }).catch(() => [] as PlayerSeason[]),
  ]);

  const careerSeason =
    career.find(
      (row) =>
        row.season === season &&
        (identityTeamKey
          ? brandableTeamKey(row.teamId) === identityTeamKey ||
            isMultiTeamSeasonRow(row)
          : true)
    ) ?? career.find((row) => row.season === season);
  const identity = await resolvePlayerIdentity(playerId);
  const nbaId = identity.nbaId;
  const peerRow =
    peers.find((row) => row.playerId === playerId) ??
    (nbaId
      ? peers.find((row) => row.playerId === nbaId)
      : undefined) ??
    null;
  const seasonStats = mergePlayerSeasonStats(
    seasonRaw,
    careerSeason,
    peerRow
  );

  const historicalPeers = priorBoard;
  // P17.3: selected-season identity brands Layer 2 — never let first-stint
  // seasonStats.teamId overwrite the page context team.
  const teamKey =
    brandableTeamKey(identityTeamKey) ??
    brandableTeamKeyFromRow(seasonStats) ??
    undefined;
  const recentSeasons = career.slice(0, 5);

  const careerChrono = Object.keys(seasonTeams).sort((a, b) =>
    a.localeCompare(b)
  );
  // Career-arc wash only for explicit career resume — not season explorer.
  const careerStartTeamKey = careerChrono.length
    ? brandableTeamKey(seasonTeams[careerChrono[0]!])
    : teamKey;

  const metrics = buildPlayerPercentileMetrics(
    seasonStats,
    career,
    peers,
    historicalPeers,
    playerId
  );

  const headlineMetric =
    metrics.find((m) => m.id === "drbl100") ??
    metrics.find((m) => m.id === "darko") ??
    metrics.find((m) => m.id === "ts") ??
    metrics.find((m) => m.id === "usg") ??
    metrics[0];

  const drblSeasonApplicable = isDrblSeason(season);
  const hasDrbl = seasonStats != null && hasValidDrblEstimate(seasonStats);
  const drblEmptyReason: "UNSUPPORTED" | "IDENTITY_UNRESOLVED" | "MISSING" | null =
    !drblSeasonApplicable
      ? "UNSUPPORTED"
      : hasDrbl
        ? null
        : !identity.resolved && identity.nbaId == null
          ? "IDENTITY_UNRESOLVED"
          : "MISSING";
  const drbl100Metric = metrics.find((m) => m.id === "drbl100");
  const headlineExplain = headlineMetric
    ? explainMetric(headlineMetric.id)
    : null;
  const headlineContext = headlineMetric
    ? buildStatContext({
        display: headlineMetric.display,
        value: headlineMetric.value,
        percentile: headlineMetric.percentile,
        population: "qualified_season",
        populationLabel: "qualified players this season",
        sampleSize: peers.filter(
          (p) =>
            p.gamesPlayed >= 15 &&
            p.minutes / Math.max(1, p.gamesPlayed) >= 12
        ).length,
        timeframe: season,
        learnHref: headlineExplain?.learnHref ?? undefined,
        sourceLabel: headlineExplain?.label,
      })
    : null;
  const plainSummary = headlineMetric
    ? [
        headlineExplain?.plain,
        headlineMetric.showPercentile
          ? `${headlineMetric.label} sits at the ${Math.round(headlineMetric.percentile)}th percentile among qualified peers in ${season}.`
          : `${headlineMetric.label} is ${headlineMetric.display} in ${season} (descriptive — not a skill grade).`,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  const evolution = seasonStats
    ? computePlayerEvolution({
        playerId,
        current: seasonStats,
        career,
      })
    : null;

  const careerResume = computeCareerResume({
    playerId,
    playerName: displayName,
    career,
    viewingSeason: season,
  });

  const careerDeduped = dedupeCareerSeasons(career);
  const rankDefaultSeasons = defaultRankSeasons(career, {
    nowSeason: canonicalSeasonFromStartYear(currentNbaStartYear()),
    prefer: careerResume.peak ? [careerResume.peak.season] : [],
  });

  const careerAvg = careerSeasonAverages(careerDeduped);

  const resumeBits = [
    headlineMetric
      ? `${Math.round(headlineMetric.percentile)}th pct · ${headlineMetric.label}`
      : null,
    careerResume.peak ? `Peak ${careerResume.peak.season}` : null,
    careerResume.prime
      ? careerResume.prime.contiguousFrom && careerResume.prime.contiguousTo
        ? `Prime ${careerResume.prime.contiguousFrom}→${careerResume.prime.contiguousTo}`
        : `Prime ${careerResume.prime.seasonCount} seasons`
      : null,
    careerResume.longevity
      ? `${careerResume.longevity.seasonCount} longevity seasons`
      : careerChrono.length
        ? `${careerChrono.length} seasons`
        : null,
  ].filter(Boolean);

  const rowTeamMark = (teamId: string, rowSeason: string) => {
    const key = brandableTeamKey(teamId);
    if (!key) return null;
    if (useHistoricalBranding) {
      const era = resolveHistoricalTeamBrand(key, rowSeason, "era");
      if (era) return <HistoricalTeamMark brand={era} size="2xs" />;
    }
    return <TeamLogo teamKey={key} size="2xs" />;
  };

  const rowTeamLabel = (row: PlayerSeason) => {
    if (isMultiTeamSeasonRow(row)) return multiTeamDisplayLabel(row);
    if (useHistoricalBranding) {
      const era = resolveHistoricalTeamBrand(row.teamId, row.season, "era");
      if (era) return era.abbreviation;
    }
    return (
      resolveTeamBrand(brandableTeamKey(row.teamId))?.abbr ?? row.teamName
    );
  };

  const rowStripeColor = (teamId: string, rowSeason: string) => {
    const key = brandableTeamKey(teamId);
    if (!key) return "var(--border)";
    if (useHistoricalBranding) {
      const era = resolveHistoricalTeamBrand(key, rowSeason, "era");
      if (era?.palette?.primary) return era.palette.primary;
    }
    return resolveTeamBrand(key)?.primary ?? "var(--primary)";
  };

  return (
    <>
      <div className="grid items-start gap-4 lg:grid-cols-12">
        <aside className="flex flex-col gap-4 lg:col-span-4">
          <div className="sports-card overflow-hidden px-4 py-5">
            {resumeBits.length ? (
              <p className="text-[13px] font-medium leading-snug text-foreground">
                {resumeBits.join(" · ")}
              </p>
            ) : null}

            {/* DRBL Snapshot — primary analytical card */}
            <div
              className={
                resumeBits.length
                  ? "mt-5 border-t border-border pt-4"
                  : undefined
              }
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-bold tracking-tight">
                  DRBL Snapshot
                </h2>
                <Link
                  href="/learn/drbl"
                  className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                >
                  Learn DRBL →
                </Link>
              </div>
              {hasDrbl && seasonStats ? (
                <>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Ability rate vs realized value — DRBL/100 ranks ability;
                    R1 metrics are season accounting.
                  </p>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <MiniStat
                      label="DRBL/100"
                      value={formatNumber(seasonStats.drbl100, 1)}
                    />
                    <MiniStat
                      label="Rank"
                      value={
                        seasonStats.drblRank != null
                          ? `#${seasonStats.drblRank}`
                          : "—"
                      }
                    />
                    <MiniStat
                      label="Percentile"
                      value={
                        drbl100Metric?.showPercentile
                          ? `${Math.round(drbl100Metric.percentile)}th`
                          : "—"
                      }
                    />
                    <MiniStat
                      label="R1 Points"
                      value={
                        seasonStats.r1Points != null
                          ? formatNumber(seasonStats.r1Points, 1)
                          : "—"
                      }
                    />
                    <MiniStat
                      label="R1 Win Eq."
                      value={
                        seasonStats.r1WinEquivalents != null
                          ? formatNumber(seasonStats.r1WinEquivalents, 2)
                          : "—"
                      }
                    />
                  </dl>
                  <details className="mt-3 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground/80">
                      Diagnostics P / LN / B
                    </summary>
                    <p className="mt-1.5 leading-relaxed">
                      Scale warning: P, LN, and B are non-additive diagnostics —
                      they do not sum to DRBL/100. DRBL-O and DRBL-D are halves of
                      P, not of DRBL/100.
                    </p>
                    <dl className="mt-2 grid grid-cols-3 gap-2">
                      <MiniStat
                        label="DRBL-P"
                        value={formatNumber(seasonStats.drblP, 1)}
                      />
                      <MiniStat
                        label="DRBL-LN"
                        value={formatNumber(seasonStats.drblLn, 1)}
                      />
                      <MiniStat
                        label="DRBL-B"
                        value={formatNumber(seasonStats.drblB, 1)}
                      />
                    </dl>
                  </details>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {drblEmptyReason === "UNSUPPORTED"
                    ? `DRBL is not published for ${season} (registry unsupported). Box-score stats may still load.`
                    : drblEmptyReason === "IDENTITY_UNRESOLVED"
                      ? "DRBL is available for this season, but this player id is not resolved to an NBA Stats id for the precomputed overlay (identity unresolved)."
                      : `DRBL estimate missing for this player-season in the precomputed overlay.`}
                </p>
              )}
            </div>

            {headlineContext ? (
              <div className="mt-5 border-t border-border pt-4">
                <StatDisclosure
                  label={headlineMetric?.label ?? "Season value"}
                  context={headlineContext}
                  conceptId={headlineMetric?.id}
                />
                {plainSummary ? (
                  <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                    {plainSummary}
                  </p>
                ) : null}
              </div>
            ) : null}

            {seasonStats && careerAvg ? (
              <div className="mt-5 border-t border-border pt-4">
                <h2 className="mb-2 text-[13px] font-bold tracking-tight">
                  Current season vs career
                </h2>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Career = mean of resume-qualifying seasons only · counting /
                  efficiency rates already on the board.
                </p>
                <dl className="grid grid-cols-3 gap-2 text-[12px]">
                  <VsStat
                    label="PPG"
                    current={formatNumber(
                      seasonStats.points /
                        Math.max(1, seasonStats.gamesPlayed),
                      1
                    )}
                    career={formatNumber(careerAvg.ppg, 1)}
                  />
                  <VsStat
                    label="TS%"
                    current={
                      seasonStats.trueShootingPct != null &&
                      seasonStats.trueShootingPct > 0
                        ? formatPct(seasonStats.trueShootingPct)
                        : "—"
                    }
                    career={
                      careerAvg.ts != null ? formatPct(careerAvg.ts) : "—"
                    }
                  />
                  <VsStat
                    label="USG%"
                    current={
                      seasonStats.usagePct != null &&
                      seasonStats.usagePct > 0
                        ? formatPct(seasonStats.usagePct)
                        : "—"
                    }
                    career={
                      careerAvg.usg != null ? formatPct(careerAvg.usg) : "—"
                    }
                  />
                </dl>
              </div>
            ) : null}

            {seasonStats ? (
              <div className="mt-5 border-t border-border pt-4">
                <h2 className="mb-2 text-[13px] font-bold tracking-tight">
                  Season rates
                </h2>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MiniStat
                    label="PPG"
                    value={formatNumber(
                      seasonStats.points /
                        Math.max(1, seasonStats.gamesPlayed),
                      1
                    )}
                  />
                  <MiniStat
                    label="RPG"
                    value={formatNumber(
                      seasonStats.rebounds /
                        Math.max(1, seasonStats.gamesPlayed),
                      1
                    )}
                  />
                  <MiniStat
                    label="APG"
                    value={formatNumber(
                      seasonStats.assists /
                        Math.max(1, seasonStats.gamesPlayed),
                      1
                    )}
                  />
                  <MiniStat
                    label="TS%"
                    value={
                      seasonStats.trueShootingPct != null &&
                      seasonStats.trueShootingPct > 0
                        ? formatPct(seasonStats.trueShootingPct)
                        : "—"
                    }
                  />
                  <MiniStat
                    label="USG"
                    value={
                      seasonStats.usagePct != null &&
                      seasonStats.usagePct > 0
                        ? formatPct(seasonStats.usagePct)
                        : "—"
                    }
                  />
                </dl>
              </div>
            ) : null}

            <div className="mt-5 border-t border-border pt-4">
              <TransitionLink
                href={askDrblHref(
                  `What was ${displayName}'s peak production?`,
                  playerId
                )}
                className="text-[13px] font-semibold underline-offset-2 hover:underline"
              >
                Ask DRBL about {displayName} →
              </TransitionLink>
              <p className="mt-3 text-[12px] text-muted-foreground">
                Historical advanced-stat coverage varies by season. Missing
                years are not zeroes.
              </p>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-bold tracking-tight">
                  Recent seasons
                </h2>
                <a
                  href="#seasons"
                  className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                >
                  Full explorer →
                </a>
              </div>
              {recentSeasons.length === 0 ? (
                <p className="py-4 text-[13px] text-muted-foreground">
                  {careerDataGuardSilentEmpty
                    ? "Career seasons unavailable — data provider misconfiguration (see notice above)."
                    : "No season rows yet."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[280px] text-left text-[12px]">
                    <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="pb-1.5 pr-2 font-semibold">Season</th>
                        <th className="px-1.5 pb-1.5 text-right font-semibold">
                          PTS
                        </th>
                        <th className="px-1.5 pb-1.5 text-right font-semibold">
                          AST
                        </th>
                        <th className="px-1.5 pb-1.5 text-right font-semibold">
                          REB
                        </th>
                        <th className="pb-1.5 pl-1.5 text-right font-semibold">
                          TS%
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentSeasons.map((row) => (
                        <tr key={`${row.season}-${row.teamId}`}>
                          <td className="py-1.5 pr-2">
                            <TransitionLink
                              href={playerSeasonChipHref(
                                playerId,
                                row.season,
                                { fromHistory, themeMode }
                              )}
                              scroll={false}
                              className="font-semibold underline-offset-2 hover:underline"
                            >
                              {row.season}
                            </TransitionLink>
                          </td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums">
                            {formatNumber(row.points)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums">
                            {formatNumber(row.assists)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums">
                            {formatNumber(row.rebounds)}
                          </td>
                          <td className="py-1.5 pl-1.5 text-right tabular-nums">
                            {row.trueShootingPct != null &&
                            row.trueShootingPct > 0
                              ? formatPct(row.trueShootingPct)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="flex flex-col gap-4 lg:col-span-8">
          <div>
            <h2 className="mb-1 text-[17px] font-bold tracking-tight">
              Analytical profile
            </h2>
            <p className="mb-3 text-[13px] text-muted-foreground">
              How good is this player in the selected season — percentiles
              among qualified peers.
            </p>
            <PlayerPercentilePanel
              key={`${playerId}-${season}`}
              season={season}
              seasons={seasonOptions}
              playerId={playerId}
              playerName={displayName}
              teamKey={teamKey}
              seasonTeams={seasonTeams}
              metrics={metrics}
            />
          </div>
        </div>
      </div>

      <section
        id="career"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Career"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Career</h2>
          <p className="text-[13px] text-muted-foreground">
            Resume first — then what changed over time.
          </p>
        </div>
        <PlayerCareerResume
          resume={careerResume}
          teamKey={teamKey}
          careerStartTeamKey={careerStartTeamKey}
          seasonsAnchorId="seasons"
          evolutionAnchorId="player-evolution"
        />
        {evolution ? (
          <div id="player-evolution" className="scroll-mt-16">
            <PlayerEvolutionPanel
              evolution={evolution}
              playerId={playerId}
              teamKey={teamKey}
              compareHref={`/compare?a=${playerId}&season=${season}`}
            />
            <p className="mt-2 text-[12px] text-muted-foreground">
              <a
                href="#seasons"
                className="font-semibold underline-offset-2 hover:underline"
              >
                View season details →
              </a>
              {" · "}
              <TransitionLink
                href={`/players/${playerId}/season-compare?a=${encodeURIComponent(season)}${
                  seasonOptions.find((s) => s !== season)
                    ? `&b=${encodeURIComponent(
                        seasonOptions.find((s) => s !== season)!
                      )}`
                    : ""
                }`}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Compare seasons →
              </TransitionLink>
            </p>
          </div>
        ) : (
          <div id="player-evolution" className="sr-only" aria-hidden />
        )}
      </section>

      <section
        id="seasons"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Seasons"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Season explorer
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Move through the career · compare · rank · ask — without a giant
            new table.
          </p>
        </div>
        <TeamWashCard
          teamKey={teamKey}
          className="flex flex-col gap-3 p-4 sm:p-5"
        >
          <PlayerSeasonExplorer
            playerId={playerId}
            playerName={displayName}
            seasons={careerDeduped}
            viewingSeason={season}
            peakSeason={careerResume.peak?.season}
            rankDefaults={rankDefaultSeasons}
          />
        </TeamWashCard>
        <PlayerSeasonAnalysisControl
          playerId={playerId}
          seasons={seasonOptions}
          defaultA={season}
          defaultB={
            seasonOptions.find((s) => s !== season) ??
            seasonOptions[1] ??
            seasonOptions[0]
          }
          defaultRankSeasons={rankDefaultSeasons}
        />

        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show full season table →</span>
            <span className="hidden group-open:inline">
              Hide full season table
            </span>
          </summary>
          <TeamWashCard
            teamKey={teamKey}
            className="mt-3 flex flex-col gap-3 p-4 sm:p-5"
          >
            <div>
              <h3 className="text-[15px] font-bold tracking-tight">
                Season depth
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Full counting / efficiency rows · accent = team that season.
              </p>
            </div>
            {career.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {careerDataGuardSilentEmpty
                  ? "Career seasons unavailable — data provider misconfiguration (see notice above)."
                  : "No career season rows available."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-white/40">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b border-border bg-white/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Season</th>
                      <th className="px-2 py-2">Team</th>
                      <th className="px-2 py-2 text-right">GP</th>
                      <th className="px-2 py-2 text-right">MIN</th>
                      <th className="px-2 py-2 text-right">PTS</th>
                      <th className="px-2 py-2 text-right">AST</th>
                      <th className="px-2 py-2 text-right">REB</th>
                      <th className="px-2 py-2 text-right">TS%</th>
                      <th className="px-2 py-2 text-right">eFG%</th>
                      <th className="px-3 py-2 text-right">USG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {career.map((row) => (
                      <tr
                        key={`${row.season}-${row.teamId}`}
                        className={cn("team-stripe hover:bg-white/50")}
                        style={
                          {
                            "--team-primary": rowStripeColor(
                              row.teamId,
                              row.season
                            ),
                          } as CSSProperties
                        }
                      >
                        <td className="px-3 py-2 font-semibold">
                          <TransitionLink
                            href={playerSeasonChipHref(
                              playerId,
                              row.season,
                              { fromHistory, themeMode }
                            )}
                            scroll={false}
                            className="hover:underline"
                          >
                            {row.season}
                          </TransitionLink>
                        </td>
                        <td className="px-2 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            {rowTeamMark(row.teamId, row.season)}
                            <span>{rowTeamLabel(row)}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.gamesPlayed}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMinutes(row.minutes)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatNumber(row.points)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatNumber(row.assists)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatNumber(row.rebounds)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.trueShootingPct != null &&
                          row.trueShootingPct > 0
                            ? formatPct(row.trueShootingPct)
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.effectiveFieldGoalPct != null &&
                          row.effectiveFieldGoalPct > 0
                            ? formatPct(row.effectiveFieldGoalPct)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.usagePct != null && row.usagePct > 0
                            ? formatPct(row.usagePct)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TeamWashCard>
        </details>
      </section>

      <section
        id="context"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Context"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Context</h2>
          <p className="text-[13px] text-muted-foreground">
            Similar players from the existing comps · then full compare.
          </p>
        </div>
        <TeamWashCard teamKey={teamKey} className="flex flex-col gap-3 p-4 sm:p-5">
          {headlineMetric ? (
            <PlayerContextStrip
              metricLabel={headlineMetric.label}
              leagueComps={headlineMetric.leagueComps}
              historicalComps={headlineMetric.historicalComps}
              compareHref={`/compare?a=${playerId}&season=${season}`}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              <TransitionLink
                href={`/compare?a=${playerId}&season=${season}`}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Compare this player →
              </TransitionLink>
            </p>
          )}
        </TeamWashCard>
      </section>

    </>
  );
}

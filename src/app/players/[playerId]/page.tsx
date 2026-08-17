import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PlayerCareerTimeline } from "@/components/charts/player-career-timeline";
import { PlayerEfficiencyProfile } from "@/components/charts/player-efficiency-profile";
import { PlayerShotChart } from "@/components/charts/player-shot-chart";
import { PlayerShotDiet } from "@/components/charts/player-shot-diet";
import { RollingEfficiencyChart } from "@/components/charts/rolling-efficiency-chart";
import { PercentileRankings } from "@/components/player/percentile-rankings";
import { PlayerBrefTables } from "@/components/player/player-bref-tables";
import { PlayerHeadshot } from "@/components/player/player-headshot";
import { PlayerSeasonSelect } from "@/components/player/player-season-select";
import { PlayerSavantSummary } from "@/components/player/player-savant-summary";
import { AutoRefresh } from "@/components/system/auto-refresh";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import {
  computePlayerPercentiles,
  getAvailableSeasons,
  getPlayer,
  getPlayerCareerSeasons,
  getPlayerCareerTimelineSeasons,
  getPlayerGameLog,
  getPlayerSeason,
  getPlayersBySeason,
  getShots,
} from "@/data/queries";
import { formatNumber, formatPct } from "@/lib/format";
import {
  buildEfficiencyProfile,
  buildShotDiet,
} from "@/lib/player-stat-views";
import { buildSavantSections, buildSavantCareerFrames } from "@/lib/player-savant";
import { buildRollingEfficiency } from "@/lib/rolling-efficiency";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

export const revalidate = 60;

const PERCENTILE_MIN_MINUTES = 500;

interface PlayerPageProps {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const player = await getPlayer(playerId, seasonParam);
  return {
    title: player
      ? `${player.fullName} · Player profile`
      : "Player | Basketball Analytics",
  };
}

export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;

  // Parallelize season list + career so the page is not a serial waterfall.
  const [availableSeasons, career] = await Promise.all([
    getAvailableSeasons(),
    getPlayerCareerSeasons(playerId),
  ]);
  const seasonOptions =
    career.length > 0
      ? [...new Set(career.map((c) => c.season))].sort((a, b) =>
          b.localeCompare(a)
        )
      : availableSeasons;
  const season = seasonParam ?? seasonOptions[0] ?? "2024-25";

  const player = await getPlayer(playerId, season);
  if (!player) notFound();

  const [seasonStats, league, gameLog, shots, timelineSeasons] =
    await Promise.all([
      getPlayerSeason(playerId, season),
      getPlayersBySeason(season, { minimumMinutes: PERCENTILE_MIN_MINUTES }),
      getPlayerGameLog(playerId, season),
      getShots({ player: playerId, season }),
      getPlayerCareerTimelineSeasons(playerId),
    ]);

  const percentiles =
    seasonStats != null
      ? computePlayerPercentiles(seasonStats, league, PERCENTILE_MIN_MINUTES)
      : [];

  const rolling = buildRollingEfficiency(gameLog, 10);
  const leagueTs =
    league.length > 0
      ? league.reduce((a, r) => a + r.trueShootingPct, 0) / league.length
      : 0.56;

  const savantSections = seasonStats
    ? buildSavantSections(seasonStats, percentiles)
    : [];
  const savantFrames = buildSavantCareerFrames(timelineSeasons);
  const efficiency = seasonStats ? buildEfficiencyProfile(seasonStats) : [];
  const diet = seasonStats ? buildShotDiet(seasonStats) : [];
  const displayName =
    seasonStats?.playerName && !seasonStats.playerName.startsWith("Player ")
      ? seasonStats.playerName
      : player.fullName;
  const displayPosition = seasonStats?.position ?? player.position;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <p>
        <Link
          href={`/explore/players?season=${season}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to explore
        </Link>
      </p>

      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <PlayerHeadshot
            playerId={playerId}
            name={displayName}
            size="lg"
          />
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Extensive season stats with percentile-colored presentation
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              {displayName}
            </h1>
            <p className="text-muted-foreground">
              {displayPosition ?? "—"}
              {seasonStats ? ` · ${seasonStats.teamName}` : null}
              {player.heightInches
                ? ` · ${Math.floor(player.heightInches / 12)}'${player.heightInches % 12}"`
                : null}
            </p>
            <AutoRefresh />
          </div>
        </div>
        <Suspense fallback={null}>
          <PlayerSeasonSelect seasons={seasonOptions} current={season} />
        </Suspense>
      </header>

      {seasonStats ? (
        <PlayerSavantSummary
          season={season}
          sections={savantSections}
          careerFrames={savantFrames}
        />
      ) : (
        <p className="text-muted-foreground">
          No season stats available for {season}.
        </p>
      )}

      {timelineSeasons.length > 0 ? (
        <PlayerCareerTimeline
          seasons={timelineSeasons}
          playerName={displayName}
        />
      ) : null}

      {seasonStats ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <PercentileRankings
            season={season}
            percentiles={percentiles}
            minimumMinutes={PERCENTILE_MIN_MINUTES}
          />
          <PlayerShotChart shots={shots} playerName={player.fullName} />
        </div>
      ) : null}

      {seasonStats ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <PlayerEfficiencyProfile
            metrics={efficiency}
            percentiles={percentiles}
          />
          <PlayerShotDiet slices={diet} />
        </div>
      ) : null}

      <RollingEfficiencyChart
        points={rolling}
        referenceTrueShootingPct={leagueTs}
      />

      {career.length > 0 ? (
        <PlayerBrefTables
          playerId={playerId}
          seasons={career}
          activeSeason={season}
        />
      ) : null}

      <section aria-labelledby="game-log-heading" className="flex flex-col gap-3">
        <h2 id="game-log-heading" className="text-lg font-semibold">
          Game log ({season})
        </h2>
        {gameLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No game log rows for this player/season.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Opp</TableHead>
                  <TableHead className="text-right">MIN</TableHead>
                  <TableHead className="text-right">PTS</TableHead>
                  <TableHead className="text-right">REB</TableHead>
                  <TableHead className="text-right">AST</TableHead>
                  <TableHead className="text-right">FG</TableHead>
                  <TableHead className="text-right">3P</TableHead>
                  <TableHead className="text-right">FT</TableHead>
                  <TableHead className="text-right">
                    <StatTooltip nestable stat="TS%">
                      TS%
                    </StatTooltip>
                  </TableHead>
                  <TableHead className="text-right">
                    <StatTooltip nestable stat="+/-">
                      +/-
                    </StatTooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...gameLog]
                  .sort((a, b) => b.gameDate.localeCompare(a.gameDate))
                  .map((g) => {
                    const ts =
                      g.fieldGoalsAttempted + g.freeThrowsAttempted > 0
                        ? g.points /
                          (2 *
                            (g.fieldGoalsAttempted +
                              0.44 * g.freeThrowsAttempted))
                        : 0;
                    return (
                      <TableRow key={g.id}>
                        <TableCell className="tabular-nums">
                          <Link
                            href={`/games/${g.gameId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {g.gameDate}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs uppercase">
                          {g.isHome ? "vs" : "@"}{" "}
                          {nbaTeamAbbr(g.opponentTeamId)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(g.minutes)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(g.points)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(g.rebounds)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(g.assists)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.fieldGoalsMade}-{g.fieldGoalsAttempted}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.threePointersMade}-{g.threePointersAttempted}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.freeThrowsMade}-{g.freeThrowsAttempted}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPct(ts)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.plusMinus > 0 ? "+" : ""}
                          {formatNumber(g.plusMinus)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}

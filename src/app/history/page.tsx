import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { HistoryClientShell } from "@/components/time-machine/history-client-shell";
import {
  SeasonExplorer,
  WeekExplorer,
} from "@/components/time-machine/time-machine-controls";
import { TimeMachineLanding } from "@/components/time-machine/time-machine-landing";
import { TimeMachineSnapshot } from "@/components/time-machine/time-machine-snapshot";
import { getAvailableSeasons } from "@/data/queries";
import {
  getHistoricalGamesForWeek,
  getHistoricalLeadersBundle,
  getHistoricalTeamSnapshot,
  getHistoricalTransactionsForWeek,
  resolveTimeMachineDate,
} from "@/data/queries/time-machine";
import { getDraftClassPlayers } from "@/data/providers/nba/draft-history";
import {
  awardsForSeason,
  draftYearForSeason,
} from "@/lib/history/season-highlights";
import {
  adjacentSeason,
  clampDateToSeason,
  clampWeekToSeason,
  seasonDateBounds,
  shiftIsoDate,
  weekBoundsContaining,
  type ThemeMode,
} from "@/themes/era-theme";
import { resolveLandmarkGames } from "@/content/history/landmark-games";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { parseHistorySearchParams } from "@/themes/history-url";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("History");
  return {
    alternates: { canonical: "/history" },
    title: t("enterTitle"),
    description: t("enterSubtitle"),
  };
}

interface HistoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function SnapshotSkeleton() {
  return (
    <div
      className="query-updating-content flex min-h-[24rem] flex-col gap-6"
      aria-hidden
    >
      <div className="h-40 animate-pulse rounded-md bg-secondary/70" />
      <div className="h-56 animate-pulse rounded-md bg-secondary/50" />
      <div className="h-40 animate-pulse rounded-md bg-secondary/50" />
    </div>
  );
}

async function HistorySnapshotLoader({
  season,
  date,
  themeMode,
  landmarkGames,
  weekControls,
}: {
  season: string;
  date: string;
  themeMode: ThemeMode;
  landmarkGames: ReturnType<typeof resolveLandmarkGames>;
  weekControls: ReactNode;
}) {
  const draftYear = draftYearForSeason(season);
  const [gamesResult, teamSnap, leaders, draftRaw] = await Promise.all([
    getHistoricalGamesForWeek(season, date),
    getHistoricalTeamSnapshot(season),
    getHistoricalLeadersBundle(season),
    draftYear != null
      ? getDraftClassPlayers([draftYear]).catch(() => [])
      : Promise.resolve([]),
  ]);

  const tx = await getHistoricalTransactionsForWeek(
    gamesResult.weekStart,
    gamesResult.weekEnd
  );

  const draftPicks = [...draftRaw]
    .sort(
      (a, b) =>
        (a.overallPick || a.pick || 999) - (b.overallPick || b.pick || 999)
    )
    .slice(0, 10);

  return (
    <div className="query-updating-content">
      <TimeMachineSnapshot
        season={season}
        date={date}
        theme={themeMode}
        games={gamesResult.games}
        gamesWarning={gamesResult.warning}
        weekStart={gamesResult.weekStart}
        weekEnd={gamesResult.weekEnd}
        standings={{
          east: teamSnap.standings.east,
          west: teamSnap.standings.west,
        }}
        standingsAvailable={teamSnap.standings.available}
        standingsWarning={teamSnap.standings.warning}
        leadersPpg={leaders.ppg}
        leadersRpg={leaders.rpg}
        leadersApg={leaders.apg}
        leadersDrbl={leaders.drbl}
        leadersWarning={leaders.warning}
        teams={teamSnap.directory}
        teamsWarning={teamSnap.directoryWarning}
        events={tx.events}
        eventsWarning={tx.warning}
        landmarkGames={landmarkGames}
        awards={awardsForSeason(season)}
        draftYear={draftYear}
        draftPicks={draftPicks}
        weekControls={weekControls}
      />
    </div>
  );
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const parsed = parseHistorySearchParams(params);
  const seasons = await getAvailableSeasons();

  const landmarkGames = resolveLandmarkGames(getRuntimeSnapshotGames());

  if (!parsed.season) {
    return (
      <TimeMachineLanding seasons={seasons} landmarkGames={landmarkGames} />
    );
  }

  const season = seasons.includes(parsed.season)
    ? parsed.season
    : seasons[0] ?? parsed.season;
  // Match the rest of the site — no separate era chrome / historical wash.
  const themeMode: ThemeMode = "modern";

  const date = await resolveTimeMachineDate(season, parsed.date);
  const { start: seasonStart, end: seasonEnd } = seasonDateBounds(season);
  const week = weekBoundsContaining(date);
  const clampedWeek =
    clampWeekToSeason(week.start, week.end, season) ?? {
      start: date,
      end: date,
    };

  const prevWeekCandidate = shiftIsoDate(week.start, -7);
  const nextWeekCandidate = shiftIsoDate(week.start, 7);
  const prevWeekClamped = clampWeekToSeason(
    weekBoundsContaining(prevWeekCandidate).start,
    weekBoundsContaining(prevWeekCandidate).end,
    season
  );
  const nextWeekClamped = clampWeekToSeason(
    weekBoundsContaining(nextWeekCandidate).start,
    weekBoundsContaining(nextWeekCandidate).end,
    season
  );
  const prevWeekAnchor =
    prevWeekCandidate >= seasonStart && prevWeekClamped
      ? clampDateToSeason(prevWeekCandidate, season)
      : null;
  const nextWeekAnchor =
    nextWeekCandidate <= seasonEnd && nextWeekClamped
      ? clampDateToSeason(nextWeekCandidate, season)
      : null;

  const prevSeason = adjacentSeason(season, -1, seasons);
  const nextSeason = adjacentSeason(season, 1, seasons);

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <HistoryClientShell>
        <header className="flex flex-col gap-4">
          <Suspense fallback={null}>
            <SeasonExplorer
              season={season}
              seasons={seasons}
              prevSeason={prevSeason}
              nextSeason={nextSeason}
              theme={themeMode}
              date={date}
            />
          </Suspense>
        </header>

        <Suspense fallback={<SnapshotSkeleton />}>
          <HistorySnapshotLoader
            season={season}
            date={date}
            themeMode={themeMode}
            landmarkGames={landmarkGames.filter((game) => game.season === season)}
            weekControls={
              <WeekExplorer
                season={season}
                weekStart={clampedWeek.start}
                weekEnd={clampedWeek.end}
                prevWeekAnchor={prevWeekAnchor}
                nextWeekAnchor={nextWeekAnchor}
                theme={themeMode}
              />
            }
          />
        </Suspense>
      </HistoryClientShell>
    </main>
  );
}

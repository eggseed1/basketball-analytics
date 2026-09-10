import { Suspense } from "react";

import { HistoryClientShell } from "@/components/time-machine/history-client-shell";
import {
  DateExplorer,
  SeasonExplorer,
} from "@/components/time-machine/time-machine-controls";
import { TimeMachineLanding } from "@/components/time-machine/time-machine-landing";
import { TimeMachineSnapshot } from "@/components/time-machine/time-machine-snapshot";
import { getAvailableSeasons } from "@/data/queries";
import {
  getHistoricalGamesForDate,
  getHistoricalLeadersBundle,
  getHistoricalTeamSnapshot,
  getHistoricalTransactionsForDate,
  resolveTimeMachineDate,
} from "@/data/queries/time-machine";
import {
  adjacentSeason,
  clampDateToSeason,
  seasonDateBounds,
  shiftIsoDate,
  type ThemeMode,
} from "@/themes/era-theme";
import { parseHistorySearchParams } from "@/themes/history-url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "NBA Time Machine",
  description:
    "Travel through NBA history - season data, team-era identity, and era atmosphere.",
};

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
}: {
  season: string;
  date: string;
  themeMode: ThemeMode;
}) {
  const [gamesResult, teamSnap, leaders, tx] = await Promise.all([
    getHistoricalGamesForDate(season, date),
    getHistoricalTeamSnapshot(season),
    getHistoricalLeadersBundle(season),
    getHistoricalTransactionsForDate(date),
  ]);

  return (
    <div className="query-updating-content">
      <TimeMachineSnapshot
        season={season}
        date={date}
        theme={themeMode}
        games={gamesResult.games}
        gamesWarning={gamesResult.warning}
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
        leadersDrblNote={leaders.drblNote}
        leadersWarning={leaders.warning}
        teams={teamSnap.directory}
        teamsWarning={teamSnap.directoryWarning}
        events={tx.events}
        eventsWarning={tx.warning}
      />
    </div>
  );
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const parsed = parseHistorySearchParams(params);
  const seasons = await getAvailableSeasons();

  if (!parsed.season) {
    return <TimeMachineLanding seasons={seasons} />;
  }

  const season = seasons.includes(parsed.season)
    ? parsed.season
    : seasons[0] ?? parsed.season;
  // Match the rest of the site — no separate era chrome / historical wash.
  const themeMode: ThemeMode = "modern";

  const date = await resolveTimeMachineDate(season, parsed.date);
  const { start: seasonStart, end: seasonEnd } = seasonDateBounds(season);
  const prevDateCandidate = shiftIsoDate(date, -1);
  const nextDateCandidate = shiftIsoDate(date, 1);
  const prevDate =
    prevDateCandidate >= seasonStart
      ? clampDateToSeason(prevDateCandidate, season)
      : null;
  const nextDate =
    nextDateCandidate <= seasonEnd
      ? clampDateToSeason(nextDateCandidate, season)
      : null;

  const prevSeason = adjacentSeason(season, -1, seasons);
  const nextSeason = adjacentSeason(season, 1, seasons);

  return (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <HistoryClientShell>
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
              {season}
            </h1>
            <p className="mt-1 text-[14px] text-muted-foreground">{date}</p>
          </div>

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

          <Suspense fallback={null}>
            <DateExplorer
              season={season}
              date={date}
              prevDate={prevDate}
              nextDate={nextDate}
              theme={themeMode}
            />
          </Suspense>
        </header>

        <Suspense fallback={<SnapshotSkeleton />}>
          <HistorySnapshotLoader
            season={season}
            date={date}
            themeMode={themeMode}
          />
        </Suspense>
      </HistoryClientShell>
    </main>
  );
}

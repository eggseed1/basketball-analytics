import Link from "next/link";
import { Suspense } from "react";

import {
  EraThemeScope,
  HistoricalModeBanner,
} from "@/components/time-machine/era-theme-scope";
import { HistoryClientShell } from "@/components/time-machine/history-client-shell";
import {
  DateExplorer,
  SeasonExplorer,
  ThemeModeControl,
} from "@/components/time-machine/time-machine-controls";
import { TimeMachineLanding } from "@/components/time-machine/time-machine-landing";
import { TimeMachineSnapshot } from "@/components/time-machine/time-machine-snapshot";
import { askDrblHref } from "@/components/players/player-ask-links";
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
  resolveActiveEraTheme,
  seasonDateBounds,
  shiftIsoDate,
  type ThemeMode,
} from "@/themes/era-theme";
import { parseHistorySearchParams } from "@/themes/history-url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "NBA Time Machine",
  description:
    "Travel through NBA history — season data, team-era identity, and era atmosphere.",
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
  const themeMode: ThemeMode = parsed.theme ?? "historical";
  // Theme from URL immediately — avoid flashing default chrome before era CSS.
  const eraTheme = resolveActiveEraTheme(season, themeMode);

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
    <EraThemeScope theme={eraTheme}>
      <HistoricalModeBanner
        season={season}
        themeName={eraTheme.name}
        themeMode={themeMode}
      />
      <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
        <HistoryClientShell>
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {season} NBA · Historical Mode
                </p>
                <h1 className="tm-heading mt-1 text-[28px] font-bold tracking-tight sm:text-[34px]">
                  NBA — {season}
                </h1>
                <p className="mt-1 text-[14px] text-muted-foreground">
                  {date}
                  {themeMode === "historical"
                    ? ` · ${eraTheme.name} atmosphere`
                    : " · Modern DRBL theme"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={askDrblHref("Who led the NBA in scoring?", {
                    season,
                    date,
                    fromHistory: true,
                  })}
                  className="sports-pill shrink-0 text-[13px]"
                >
                  ASK DRBL
                </Link>
                <Link
                  href="/"
                  className="sports-pill shrink-0 text-[13px]"
                >
                  Exit Time Machine
                </Link>
              </div>
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

            <ThemeModeControl season={season} date={date} theme={themeMode} />
          </header>

          {/* No remount key — keep prior snapshot visible during transition. */}
          <Suspense fallback={<SnapshotSkeleton />}>
            <HistorySnapshotLoader
              season={season}
              date={date}
              themeMode={themeMode}
            />
          </Suspense>
        </HistoryClientShell>
      </main>
    </EraThemeScope>
  );
}

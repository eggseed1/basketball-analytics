import type { ReactNode } from "react";

import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TransitionLink } from "@/components/continuity/query-nav";
import { GameScoreCard } from "@/components/sports/game-score-card";
import { askDrblHref } from "@/components/players/player-ask-links";
import { formatNumber } from "@/lib/format";
import type { GameSummary } from "@/data/types";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import type {
  HistoricalLeaderRow,
  HistoricalTeamDirectoryRow,
} from "@/data/queries/time-machine";
import {
  gameLabFromHistoryHref,
  playerFromHistoryHref,
  teamFromHistoryHref,
} from "@/themes/history-url";
import type { ThemeMode } from "@/themes/era-theme";

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="tm-heading text-[18px] font-bold tracking-tight sm:text-[20px]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TimeMachineSnapshot({
  season,
  date,
  theme,
  games,
  gamesWarning,
  standings,
  standingsWarning,
  standingsAvailable,
  leadersPpg,
  leadersRpg,
  leadersApg,
  leadersDrbl = [],
  leadersDrblNote,
  leadersWarning,
  teams,
  teamsWarning,
  events,
  eventsWarning,
}: {
  season: string;
  date: string;
  theme: ThemeMode;
  games: GameSummary[];
  gamesWarning?: string;
  standings: { east: HistoricalTeamDirectoryRow[]; west: HistoricalTeamDirectoryRow[] };
  standingsWarning?: string;
  standingsAvailable: boolean;
  leadersPpg: HistoricalLeaderRow[];
  leadersRpg: HistoricalLeaderRow[];
  leadersApg: HistoricalLeaderRow[];
  leadersDrbl?: HistoricalLeaderRow[];
  leadersDrblNote?: string;
  leadersWarning?: string;
  teams: HistoricalTeamDirectoryRow[];
  teamsWarning?: string;
  events: NbaTransactionEvent[];
  eventsWarning?: string;
}) {
  const tmState = { season, theme, date };

  return (
    <div className="flex flex-col gap-10 pb-12">
      <Section
        title="Games"
        action={
          <TransitionLink
            href={`/explore/games?season=${encodeURIComponent(season)}`}
            className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
          >
            Explore season
          </TransitionLink>
        }
      >
        {gamesWarning ? (
          <p className="text-sm text-muted-foreground">{gamesWarning}</p>
        ) : null}
        {games.length === 0 ? (
          <div className="sports-card px-4 py-6 text-center text-sm text-muted-foreground">
            No games on {date} for {season}.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {games.map((game) => (
              <GameScoreCard
                key={game.id}
                game={game}
                href={gameLabFromHistoryHref(game.id, tmState)}
                brandPresentation={
                  theme === "modern" ? "modern_surface" : "era"
                }
              />
            ))}
          </div>
        )}
        <p className="text-[12px] text-muted-foreground">
          Game Lab keeps existing analytics; historical team-era names stay on
          the box.
        </p>
      </Section>

      <Section title="Standings">
        {!standingsAvailable ? (
          <p className="text-sm text-muted-foreground">
            {standingsWarning ??
              "Standings are shown only when season team-board coverage supports them."}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <StandingsColumn
              title="East"
              rows={standings.east}
              season={season}
              theme={theme}
            />
            <StandingsColumn
              title="West"
              rows={standings.west}
              season={season}
              theme={theme}
            />
          </div>
        )}
      </Section>

      <Section
        title="League leaders"
        action={
          leadersDrbl.length ? (
            <TransitionLink
              href={`/explore/players?season=${encodeURIComponent(season)}&sort=drbl100&dir=desc`}
              className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
            >
              Full DRBL board
            </TransitionLink>
          ) : undefined
        }
      >
        {leadersWarning ? (
          <p className="text-sm text-muted-foreground">{leadersWarning}</p>
        ) : null}
        {leadersDrblNote ? (
          <p className="text-sm text-muted-foreground">{leadersDrblNote}</p>
        ) : null}
        <div
          className={
            leadersDrbl.length
              ? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              : "grid gap-4 md:grid-cols-3"
          }
        >
          <LeaderColumn
            title="Scoring"
            rows={leadersPpg}
            season={season}
            unit="PPG"
            theme={theme}
          />
          <LeaderColumn
            title="Rebounds"
            rows={leadersRpg}
            season={season}
            unit="RPG"
            theme={theme}
          />
          <LeaderColumn
            title="Assists"
            rows={leadersApg}
            season={season}
            unit="APG"
            theme={theme}
          />
          {leadersDrbl.length ? (
            <LeaderColumn
              title="DRBL/100"
              rows={leadersDrbl}
              season={season}
              unit=""
              theme={theme}
            />
          ) : null}
        </div>
      </Section>

      <Section title="Teams">
        {teamsWarning ? (
          <p className="text-sm text-muted-foreground">{teamsWarning}</p>
        ) : null}
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teams available for this season.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <li key={t.canonicalTeamId}>
                <TransitionLink
                  href={teamFromHistoryHref(t.canonicalTeamId, season, theme)}
                  className="sports-card flex items-center gap-3 px-3 py-3 transition hover:bg-secondary/40"
                >
                  <HistoricalTeamMark
                    brand={{
                      abbreviation: t.abbr,
                      displayName: t.displayName,
                      logoUrl: t.logoUrl,
                      source: t.logoSource,
                      palette: t.palette,
                    }}
                    size="md"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      {t.displayName}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {t.abbr}
                      {t.conference ? ` · ${t.conference}` : ""}
                    </span>
                  </span>
                </TransitionLink>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Transactions"
        action={
          <TransitionLink
            href="/offseason"
            className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
          >
            Event archive
          </TransitionLink>
        }
      >
        {eventsWarning ? (
          <p className="text-sm text-muted-foreground">{eventsWarning}</p>
        ) : null}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No transaction events on {date}.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="sports-card px-3 py-3">
                <p className="text-[12px] font-medium text-muted-foreground">
                  {e.date}
                  {e.teamAbbr ? ` · ${e.teamAbbr}` : ""}
                  {e.sourceTextCategory ? ` · ${e.sourceTextCategory}` : ""}
                </p>
                <p className="mt-1 text-[14px] leading-snug">{e.description}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-muted-foreground">
          Factual ESPN transaction events only. No trade genealogy.
        </p>
      </Section>

      <Section title="ASK DRBL about this era">
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {[
            {
              label: "Who led the NBA in scoring?",
              // Season via structured context; text stays season-free for inheritance demo.
              q: "Who led the NBA in scoring?",
            },
            {
              label: `Who led scoring in ${season}?`,
              // Keep explicit-in-text links working.
              q: `Who led the NBA in scoring in ${season}?`,
            },
            {
              label: "Boston point differential",
              q: "What was Boston's point differential?",
            },
            {
              label: `Boston point differential ${season}`,
              q: `What was Boston's point differential in ${season}?`,
            },
          ].map((item) => (
            <li key={item.q}>
              <TransitionLink
                href={askDrblHref(item.q, {
                  season,
                  date,
                  fromHistory: true,
                })}
                className="sports-pill text-[14px]"
              >
                {item.label}
              </TransitionLink>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            ASK DRBL about this day
          </p>
          <TransitionLink
            href={askDrblHref(`What happened in the NBA on ${date}?`, {
              season,
              date,
              fromHistory: true,
            })}
            className="sports-pill text-[14px]"
          >
            What happened on {date}?
          </TransitionLink>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Season context travels with the ASK URL. Date is shown but not
            applied to season-level executors yet.
          </p>
        </div>
      </Section>

      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        <TransitionLink href="/" className="sports-pill text-[14px]">
          Exit Time Machine
        </TransitionLink>
        <TransitionLink
          href="/history"
          className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
        >
          Choose another season
        </TransitionLink>
      </div>
    </div>
  );
}

function StandingsColumn({
  title,
  rows,
  season,
  theme,
}: {
  title: string;
  rows: HistoricalTeamDirectoryRow[];
  season: string;
  theme: ThemeMode;
}) {
  return (
    <div className="sports-card overflow-hidden">
      <p className="border-b border-border px-3 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <ol className="divide-y divide-border">
        {rows.slice(0, 15).map((r, i) => (
          <li key={r.canonicalTeamId}>
            <TransitionLink
              href={teamFromHistoryHref(r.canonicalTeamId, season, theme)}
              className="flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-secondary/40"
            >
              <span className="w-5 tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <HistoricalTeamMark
                brand={{
                  abbreviation: r.abbr,
                  displayName: r.displayName,
                  logoUrl: r.logoUrl,
                  source: r.logoSource,
                  palette: r.palette,
                }}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {r.displayName}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {r.avgDiff != null
                  ? `${r.avgDiff >= 0 ? "+" : ""}${formatNumber(r.avgDiff, 1)}`
                  : "-"}
              </span>
            </TransitionLink>
          </li>
        ))}
      </ol>
      <p className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
        Ordered by season point differential (board proxy).
      </p>
    </div>
  );
}

function LeaderColumn({
  title,
  rows,
  season,
  unit,
  theme,
}: {
  title: string;
  rows: HistoricalLeaderRow[];
  season: string;
  unit: string;
  theme: ThemeMode;
}) {
  return (
    <div className="sports-card overflow-hidden">
      <p className="border-b border-border px-3 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <ol className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={`${r.playerId}-${r.metric}`}>
            <TransitionLink
              href={playerFromHistoryHref(r.playerId, season, theme)}
              className="flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-secondary/40"
            >
              <span className="w-5 tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.playerName}</span>
                <span className="text-muted-foreground"> · {r.teamAbbr}</span>
              </span>
              <span className="tabular-nums font-semibold">
                {formatNumber(r.value, r.metric === "drbl100" ? 2 : 1)}
                {unit ? (
                  <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                    {unit}
                  </span>
                ) : null}
              </span>
            </TransitionLink>
          </li>
        ))}
      </ol>
    </div>
  );
}

import type { ReactNode } from "react";

import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TransitionLink } from "@/components/continuity/query-nav";
import { GameScoreCard } from "@/components/sports/game-score-card";
import { askDrblHref } from "@/components/players/player-ask-links";
import { LinkCue } from "@/components/ui/link-cue";
import type { LandmarkGameCard } from "@/content/history/landmark-games";
import type { DraftClassPlayer } from "@/data/providers/nba/draft-history";
import { formatNumber, formatPct } from "@/lib/format";
import { textLinkClassName, type } from "@/lib/design-system";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import type { SeasonAwardRow } from "@/lib/history/season-highlights";
import { standingsHref } from "@/lib/standings-routes";
import { teamFranchiseHistoryHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";
import type { GameSummary } from "@/data/types";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import type {
  HistoricalLeaderRow,
  HistoricalTeamDirectoryRow,
} from "@/data/queries/time-machine";
import {
  gameLabFromHistoryHref,
  playerFromHistoryHref,
} from "@/themes/history-url";
import { seasonWeekNumber, type ThemeMode } from "@/themes/era-theme";

function Section({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="tm-heading text-[18px] font-bold tracking-tight sm:text-[20px]">
            {title}
          </h2>
          {subtitle ? (
            <p
              className={cn(
                type.caption,
                "tabular-nums text-muted-foreground"
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
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
  weekStart,
  weekEnd,
  standings,
  standingsWarning,
  standingsAvailable,
  leadersPpg,
  leadersRpg,
  leadersApg,
  leadersDrbl = [],
  leadersWarning,
  teams,
  teamsWarning,
  events,
  eventsWarning,
  landmarkGames = [],
  awards = [],
  draftYear,
  draftPicks = [],
  weekControls,
}: {
  season: string;
  date: string;
  theme: ThemeMode;
  games: GameSummary[];
  gamesWarning?: string;
  weekStart: string;
  weekEnd: string;
  standings: { east: HistoricalTeamDirectoryRow[]; west: HistoricalTeamDirectoryRow[] };
  standingsWarning?: string;
  standingsAvailable: boolean;
  leadersPpg: HistoricalLeaderRow[];
  leadersRpg: HistoricalLeaderRow[];
  leadersApg: HistoricalLeaderRow[];
  leadersDrbl?: HistoricalLeaderRow[];
  leadersWarning?: string;
  teams: HistoricalTeamDirectoryRow[];
  teamsWarning?: string;
  events: NbaTransactionEvent[];
  eventsWarning?: string;
  landmarkGames?: LandmarkGameCard[];
  awards?: SeasonAwardRow[];
  draftYear?: number | null;
  draftPicks?: DraftClassPlayer[];
  /** Prev/next week controls for the slate block. */
  weekControls?: ReactNode;
}) {
  const tmState = { season, theme, date };
  const gamesByDate = groupGamesByDate(games);
  const weekNumber = seasonWeekNumber(season, weekStart);
  const weekDateLabel =
    weekStart === weekEnd ? weekStart : `${weekStart} – ${weekEnd}`;

  return (
    <div className="flex flex-col gap-10 pb-12">
      {landmarkGames.length ? (
        <Section title="Landmark games">
          <ul className="flex flex-col gap-2">
            {landmarkGames.map((game) => (
              <li
                key={game.id}
                className="sports-card flex flex-col gap-1 px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {game.date}
                </p>
                <TransitionLink
                  href={game.gameHref}
                  className="text-[15px] font-bold tracking-tight underline-offset-2 hover:underline"
                >
                  {game.title}
                </TransitionLink>
                <p className="text-[13px] font-semibold tabular-nums">
                  {game.scoreLine}
                </p>
                <p className="text-[13px] text-muted-foreground">{game.blurb}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

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

      {awards.length ? (
        <Section
          title="Awards"
          action={
            <TransitionLink
              href="/awards"
              className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
            >
              All awards
            </TransitionLink>
          }
        >
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {awards.map((row) => (
              <li key={row.slug}>
                <SeasonAwardCard row={row} season={season} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

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
          ) : (
            <TransitionLink
              href={`/explore/players?season=${encodeURIComponent(season)}&sort=ppg&dir=desc`}
              className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
            >
              Player board
            </TransitionLink>
          )
        }
      >
        {!leadersPpg.length &&
        !leadersRpg.length &&
        !leadersApg.length &&
        !leadersDrbl.length ? (
          <p className="text-sm text-muted-foreground">
            Season counting boards are not loaded for {season} yet. Awards and
            the draft class still come from the archive.
          </p>
        ) : (
          <>
            {leadersWarning ? (
              <p className="text-sm text-muted-foreground">{leadersWarning}</p>
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
          </>
        )}
      </Section>

      {draftYear != null ? (
        <Section
          title={`${draftYear} draft`}
          action={
            <TransitionLink
              href={`/explore/players?draftClass=${draftYear}`}
              className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
            >
              Full draft class
            </TransitionLink>
          }
        >
          {draftPicks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Draft class for {draftYear} is still loading from the league archive.
            </p>
          ) : (
            <ol className="sports-card divide-y divide-border overflow-hidden">
              {draftPicks.map((pick) => (
                <li key={`${pick.playerId}-${pick.overallPick}`}>
                  <TransitionLink
                    href={playerFromHistoryHref(pick.playerId, season, theme)}
                    className="flex items-center gap-3 px-3 py-2.5 text-[14px] hover:bg-secondary/40"
                  >
                    <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                      #{pick.overallPick || pick.pick || "—"}
                    </span>
                    <PlayerHeadshot
                      playerId={pick.playerId}
                      nbaId={pick.playerId}
                      name={pick.playerName}
                      teamKey={pick.teamAbbr}
                      size="xs"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {pick.playerName}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {pick.teamAbbr ?? "—"}
                    </span>
                  </TransitionLink>
                </li>
              ))}
            </ol>
          )}
        </Section>
      ) : null}

      <Section
        title="Teams"
        action={
          <TransitionLink
            href={standingsHref(season, "team-stats")}
            className="text-[14px] text-muted-foreground underline-offset-4 hover:underline"
          >
            Full team board
          </TransitionLink>
        }
      >
        <p className="text-[13px] text-muted-foreground">
          Open a team for its franchise history in {season}.
        </p>
        {teamsWarning ? (
          <p className="text-sm text-muted-foreground">{teamsWarning}</p>
        ) : null}
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teams available for this season.
          </p>
        ) : (
          <HistoricalTeamsBoardTable teams={teams} season={season} theme={theme} />
        )}
      </Section>

      <Section title="Explore this season">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: `/history/${encodeURIComponent(season)}`,
              title: "Season archive",
              blurb: "Box scores and games for the full year.",
            },
            {
              href: "/franchises",
              title: "Franchise History",
              blurb: "Lineages, titles, and era marks across clubs.",
            },
            {
              href: `/explore/games?season=${encodeURIComponent(season)}`,
              title: "Games board",
              blurb: "Filter and sort every game from the season.",
            },
            {
              href: `/explore/players?season=${encodeURIComponent(season)}`,
              title: "Player board",
              blurb: "Counting stats and filters for this season.",
            },
            {
              href: standingsHref(season, "conferences"),
              title: "Standings",
              blurb: "Conference tables and team season rows.",
            },
            {
              href: "/awards",
              title: "Awards history",
              blurb: "MVP, Finals MVP, DPOY, ROY, and titles.",
            },
          ].map((item) => (
            <li key={item.href}>
              <TransitionLink
                href={item.href}
                className="sports-card flex h-full flex-col gap-1 px-4 py-3 hover:bg-secondary/40"
              >
                <span className="text-[15px] font-bold tracking-tight">
                  {item.title} <LinkCue />
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {item.blurb}
                </span>
              </TransitionLink>
            </li>
          ))}
        </ul>
      </Section>

      <section className="flex flex-col gap-5 border-t border-border/60 pt-8">
        <div className="flex flex-col gap-1">
          <h2 className="tm-heading text-[18px] font-bold tracking-tight sm:text-[20px]">
            Week by week
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Browse {season} one week at a time for games and transactions.
          </p>
        </div>

        {weekControls ? (
          <div className="flex flex-col gap-3">{weekControls}</div>
        ) : null}

        <Section
          title={`Games · Week ${weekNumber}`}
          subtitle={weekDateLabel}
        >
          {gamesByDate.length === 0 ? (
            <div className="sports-card px-4 py-6 text-center text-sm text-muted-foreground">
              {gamesWarning ??
                `Box scores for this week are not in the historical cache for ${season} yet. Open the games board for seasons with fuller coverage.`}
            </div>
          ) : (
            <>
              {gamesWarning ? (
                <p className="text-sm text-muted-foreground">{gamesWarning}</p>
              ) : null}
              <div className="flex flex-col gap-5">
                {gamesByDate.map(({ day, dayGames }) => (
                  <div key={day} className="flex flex-col gap-2">
                    <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {day}
                    </p>
                    <div className="flex flex-col gap-1">
                      {dayGames.map((game) => (
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
                  </div>
                ))}
              </div>
            </>
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
              No transaction events in this week.
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
            Factual transaction events only. No trade genealogy.
          </p>
        </Section>
      </section>

      <Section title="ASK DRBL about this era">
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {[
            {
              label: "Who led the NBA in scoring?",
              q: "Who led the NBA in scoring?",
            },
            {
              label: `Who led scoring in ${season}?`,
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
            ASK DRBL about this week
          </p>
          <TransitionLink
            href={askDrblHref(
              `What happened in the NBA the week of ${weekStart}?`,
              {
                season,
                date,
                fromHistory: true,
              }
            )}
            className="sports-pill text-[14px]"
          >
            What happened the week of {weekStart}?
          </TransitionLink>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Season context travels with the ASK URL. Week dates are shown but
            not applied to season-level executors yet.
          </p>
        </div>
      </Section>
    </div>
  );
}

function groupGamesByDate(
  games: GameSummary[]
): Array<{ day: string; dayGames: GameSummary[] }> {
  const map = new Map<string, GameSummary[]>();
  for (const game of games) {
    const day = game.gameDate?.slice(0, 10) || "—";
    const list = map.get(day) ?? [];
    list.push(game);
    map.set(day, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayGames]) => ({ day, dayGames }));
}

function standingsRowStat(r: HistoricalTeamDirectoryRow): string {
  if (r.wins != null && r.losses != null) {
    return `${r.wins}-${r.losses}`;
  }
  if (r.avgDiff != null && Number.isFinite(r.avgDiff)) {
    return `${r.avgDiff >= 0 ? "+" : ""}${formatNumber(r.avgDiff, 1)}`;
  }
  return "—";
}

function StandingsColumn({
  title,
  rows,
  season,
}: {
  title: string;
  rows: HistoricalTeamDirectoryRow[];
  season: string;
  theme: ThemeMode;
}) {
  const byRecord = rows.some((r) => r.wins != null && r.losses != null);
  return (
    <div className="sports-card overflow-hidden">
      <p className="border-b border-border px-3 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <ol className="divide-y divide-border">
        {rows.slice(0, 15).map((r, i) => (
          <li key={r.canonicalTeamId}>
            <TransitionLink
              href={teamFranchiseHistoryHref(r.canonicalTeamId, season)}
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
                {standingsRowStat(r)}
              </span>
            </TransitionLink>
          </li>
        ))}
      </ol>
      <p className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
        {byRecord
          ? "Ordered by win percentage."
          : "Ordered by season point differential (board proxy)."}
      </p>
    </div>
  );
}

function dashNum(value: number | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatNumber(value, digits);
}

function dashPct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatPct(value);
}

function dashDiff(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 1)}`;
}

const TEAM_BOARD_COLUMNS = [
  { key: "team", label: "Team", align: "left" as const },
  { key: "conference", label: "Conf", align: "left" as const },
  { key: "gamesPlayed", label: "GP", align: "right" as const },
  { key: "wins", label: "W", align: "right" as const },
  { key: "losses", label: "L", align: "right" as const },
  { key: "avgDiff", label: "DIFF", align: "right" as const },
  { key: "ppg", label: "PPG", align: "right" as const },
  { key: "oppPpg", label: "OPP", align: "right" as const },
  { key: "trueShootingPct", label: "TS%", align: "right" as const },
  { key: "effectiveFieldGoalPct", label: "eFG%", align: "right" as const },
  { key: "fieldGoalPct", label: "FG%", align: "right" as const },
  { key: "threePointPct", label: "3P%", align: "right" as const },
  { key: "freeThrowPct", label: "FT%", align: "right" as const },
  { key: "rpg", label: "RPG", align: "right" as const },
  { key: "apg", label: "APG", align: "right" as const },
  { key: "spg", label: "SPG", align: "right" as const },
  { key: "bpg", label: "BPG", align: "right" as const },
  { key: "topg", label: "TOV", align: "right" as const },
] as const;

function HistoricalTeamsBoardTable({
  teams,
  season,
}: {
  teams: HistoricalTeamDirectoryRow[];
  season: string;
  theme: ThemeMode;
}) {
  const hasBoardStats = teams.some(
    (t) =>
      t.gamesPlayed != null ||
      t.ppg != null ||
      t.avgDiff != null ||
      t.wins != null
  );
  const byRecord = teams.some((t) => t.wins != null && t.winPct != null);
  const rows = [...teams].sort((a, b) => {
    if (byRecord) {
      const aw = a.winPct;
      const bw = b.winPct;
      if (aw != null && bw != null && Number.isFinite(aw) && Number.isFinite(bw)) {
        if (bw !== aw) return bw - aw;
      } else if (aw != null && Number.isFinite(aw)) {
        return -1;
      } else if (bw != null && Number.isFinite(bw)) {
        return 1;
      }
    }
    const ad = a.avgDiff;
    const bd = b.avgDiff;
    if (ad != null && bd != null && Number.isFinite(ad) && Number.isFinite(bd)) {
      if (bd !== ad) return bd - ad;
    } else if (ad != null && Number.isFinite(ad)) {
      return -1;
    } else if (bd != null && Number.isFinite(bd)) {
      return 1;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="sports-card board-scroll-host overflow-hidden">
      <div className="touch-scroll-x overflow-x-auto">
        <table className="w-full min-w-[980px] caption-bottom text-[12px]">
          <thead className="border-b border-border bg-card/80">
            <tr>
              {TEAM_BOARD_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={
                    col.align === "left"
                      ? "sticky left-0 z-10 bg-card px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                      : "px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                  }
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((t) => (
              <tr key={t.canonicalTeamId} className="hover:bg-secondary/40">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium"
                >
                  <TransitionLink
                    href={teamFranchiseHistoryHref(t.canonicalTeamId, season)}
                    className="inline-flex min-w-0 max-w-[14rem] items-center gap-2 hover:underline"
                  >
                    <HistoricalTeamMark
                      brand={{
                        abbreviation: t.abbr,
                        displayName: t.displayName,
                        logoUrl: t.logoUrl,
                        source: t.logoSource,
                        palette: t.palette,
                      }}
                      size="xs"
                    />
                    <span className="min-w-0 truncate">
                      <span className="block truncate text-[13px] font-semibold">
                        {t.displayName}
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {t.abbr}
                      </span>
                    </span>
                  </TransitionLink>
                </th>
                <td className="px-2 py-2 text-left tabular-nums text-muted-foreground">
                  {t.conference ?? "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.gamesPlayed, 0)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">
                  {dashNum(t.wins, 0)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.losses, 0)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">
                  {dashDiff(t.avgDiff)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.ppg)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.oppPpg)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashPct(t.trueShootingPct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashPct(t.effectiveFieldGoalPct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashPct(t.fieldGoalPct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashPct(t.threePointPct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashPct(t.freeThrowPct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.rpg)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.apg)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.spg)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.bpg)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {dashNum(t.topg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
        {hasBoardStats
          ? byRecord
            ? "Season team board · sorted by win percentage."
            : "Season team board · sorted by point differential."
          : "Directory only. Season board stats are unavailable for this era."}
      </p>
    </div>
  );
}

function SeasonAwardCard({
  row,
  season,
}: {
  row: SeasonAwardRow;
  season: string;
}) {
  const brand =
    row.kind === "team" && row.entityId
      ? resolveHistoricalTeamBrand(row.entityId, season)
      : null;

  const portrait =
    row.kind === "player" && row.entityId ? (
      <PlayerHeadshot
        playerId={row.entityId}
        nbaId={row.entityId}
        name={row.winner}
        size="md"
        className="ring-2 ring-background"
      />
    ) : brand ? (
      <HistoricalTeamMark
        brand={{
          abbreviation: brand.abbreviation,
          displayName: brand.displayName,
          logoUrl: brand.logoUrl,
          source: brand.source,
          palette: brand.palette,
        }}
        size="md"
      />
    ) : (
      <span
        className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-bold tracking-wide text-muted-foreground"
        aria-hidden
      >
        {row.shortLabel.slice(0, 3)}
      </span>
    );

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {row.shortLabel}
        </p>
        {row.note ? (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {row.note}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        {portrait}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold tracking-tight">
            {row.winner}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {row.title}
          </p>
        </div>
      </div>
    </>
  );

  if (row.href) {
    return (
      <TransitionLink
        href={row.href}
        className="sports-card block h-full px-4 py-4 transition-colors hover:bg-secondary/40"
      >
        {body}
      </TransitionLink>
    );
  }

  return <div className="sports-card h-full px-4 py-4">{body}</div>;
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
              <PlayerHeadshot
                playerId={r.playerId}
                name={r.playerName}
                teamKey={r.teamAbbr}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate">
                <span className={cn(textLinkClassName, "font-medium")}>
                  {r.playerName}
                </span>
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

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { sectionLinkClassName, type } from "@/lib/design-system";
import { priorSeason } from "@/lib/season-glance";
import {
  CLOSE_MARGIN,
  REGULAR_SEASON_GAMES,
  buildSeasonPulse,
  finishedRegularGames,
  pickPulseSeason,
  WEEK_MOVE_MIN,
  winPct,
  type LadderRow,
  type LadderTeam,
  type PulsePhase,
  type SeasonPulse,
  type Story,
  type TeamResult,
  type TeamSeason,
  type WinLoss,
} from "@/lib/season-pulse";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const UP_BG = "bg-[#15803d] dark:bg-[#4ade80]";
const DOWN_BG = "bg-[#7e22ce] dark:bg-[#c084fc]";

const LADDER_TITLE: Record<PulsePhase, string> = {
  early: "Where every team stands",
  middle: "Where every team stands",
  stretch: "Where every team stands",
  complete: "Where every team finished",
};

const STORY_COLUMNS: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

const rec = (r: WinLoss) => `${r.wins}-${r.losses}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const shortSeason = (s: string) => s.slice(2);

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : "Even");

function rowLabel(row: LadderRow): string {
  if (row.lo === row.hi) return signed(row.lo);
  const [a, b] = row.lo > 0 ? [row.lo, row.hi] : [row.hi, row.lo];
  return `${signed(a)} to ${signed(b)}`;
}

function LadderChip({ entry, season, showWeek }: { entry: LadderTeam; season: string; showWeek: boolean }) {
  const { team, week } = entry;
  const played = team.wins + team.losses > 0;
  const weekNet = week.wins - week.losses;
  const move = showWeek && Math.abs(weekNet) >= WEEK_MOVE_MIN ? (weekNet > 0 ? "up" : "down") : null;
  const label = [
    team.name,
    played ? rec(team) : "no games yet",
    showWeek && week.wins + week.losses > 0 ? `${rec(week)} in the last 7 days` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <li>
      <Link
        href={teamPageHref(team.teamId, { season })}
        data-motion="chip"
        title={label}
        aria-label={label}
        className={cn(
          "relative flex w-11 flex-col items-center gap-0.5 rounded-[10px] py-1 hover:bg-foreground/[0.05]",
          !played && "opacity-50"
        )}
      >
        <TeamLogo teamKey={team.abbr} size="sm" />
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{rec(team)}</span>
        {move ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-0 right-0.5 flex size-3.5 items-center justify-center rounded-full text-[8px] leading-none text-white ring-2 ring-card",
              move === "up" ? UP_BG : DOWN_BG
            )}
          >
            {move === "up" ? "\u25B2" : "\u25BC"}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

const CONFERENCES = ["East", "West"] as const;

function LadderView({ pulse }: { pulse: SeasonPulse }) {
  const { ladder } = pulse;
  const showWeek = pulse.phase !== "complete";
  const grid = "grid grid-cols-[3.75rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)]";
  return (
    <div className="flex flex-col gap-1">
      <div className={cn(grid, "px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground")} aria-hidden>
        <span />
        {CONFERENCES.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <ol className="flex flex-col gap-1">
        {ladder.rows.map((row) => {
          const even = row.lo === 0 && row.hi === 0;
          return (
            <li
              key={row.lo}
              className={cn(
                grid,
                "items-center rounded-[10px] px-2",
                row.teams.length ? "py-1" : "py-0.5",
                even
                  ? "bg-foreground/[0.04]"
                  : row.lo > 0
                    ? "bg-[#2f64d6]/[0.04] dark:bg-[#8fb0ff]/[0.05]"
                    : "bg-[#b45309]/[0.035] dark:bg-[#fbbf24]/[0.04]"
              )}
            >
              <span className={cn("text-[11px] font-semibold tabular-nums", even ? "text-foreground" : "text-muted-foreground")}>
                {rowLabel(row)}
              </span>
              {row.teams.length ? (
                CONFERENCES.map((c) => (
                  <ul key={c} aria-label={c} className="flex min-w-0 flex-wrap gap-0.5">
                    {row.teams
                      .filter((e) => e.team.conference === c)
                      .map((entry) => (
                        <LadderChip key={entry.team.teamId} entry={entry} season={pulse.season} showWeek={showWeek} />
                      ))}
                  </ul>
                ))
              ) : (
                <span aria-hidden className="col-span-2 h-px bg-foreground/10" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Pips({ results }: { results: TeamResult[] }) {
  const recent = results.slice(-10);
  return (
    <span className="flex shrink-0 items-center gap-[3px]" aria-hidden>
      {recent.map((r, i) => (
        <span
          key={i}
          data-motion-pip
          style={{ "--i": i } as CSSProperties}
          className={cn(
            "size-[7px] rounded-[2px]",
            r.won ? "bg-foreground/80" : "bg-transparent ring-1 ring-inset ring-foreground/30"
          )}
        />
      ))}
    </span>
  );
}

function ShareBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
      <span
        data-motion-bar="x"
        className={cn("block h-full rounded-full bg-foreground/70", className)}
        style={{ width: `${Math.max(2, value * 100)}%` }}
      />
    </span>
  );
}

function Dumbbell({ from, to }: { from: number; to: number }) {
  const up = to >= from;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return (
    <span className="relative block h-2.5 w-full" aria-hidden>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/[0.12]" />
      <span
        data-motion-bar="x"
        className={cn("absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full", up ? UP_BG : DOWN_BG)}
        style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, transformOrigin: up ? "left" : "right" }}
      />
      <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-[1.5px] ring-foreground/40" style={{ left: `${from * 100}%` }} />
      <span className={cn("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full", up ? UP_BG : DOWN_BG)} style={{ left: `${to * 100}%` }} />
    </span>
  );
}

function TeamRow({
  team,
  season,
  value,
  visual,
  aside,
}: {
  team: TeamSeason;
  season: string;
  value: ReactNode;
  visual?: ReactNode;
  /** Secondary detail beside the visual, so the name keeps its room. */
  aside?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={teamPageHref(team.teamId, { season })}
        data-motion="row"
        className="flex flex-col gap-1 rounded-[10px] px-2 py-1.5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <TeamLogo teamKey={team.abbr} size="xs" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{team.name}</span>
          <span className="shrink-0 text-[12px] font-semibold tabular-nums">{value}</span>
        </span>
        {visual || aside ? (
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1">{visual}</span>
            {aside ? (
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{aside}</span>
            ) : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function StoryCard({
  title,
  note,
  groups,
}: {
  title: string;
  note: string;
  groups: { label?: string; rows: ReactNode }[];
}) {
  return (
    <div
      data-motion="replay"
      className="flex min-w-0 flex-col gap-2 rounded-[12px] bg-foreground/[0.03] p-2.5 ring-1 ring-inset ring-foreground/[0.06]"
    >
      <h3 className={cn(type.caption, "px-1 font-semibold")}>{title}</h3>
      {groups.map((g, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {g.label ? (
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
          ) : null}
          <ul className="flex flex-col">{g.rows}</ul>
        </div>
      ))}
      <p className="mt-auto px-1 text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

function StoryView({ story, pulse }: { story: Story; pulse: SeasonPulse }) {
  const season = pulse.season;
  const priorLabel = pulse.priorSeason;
  switch (story.kind) {
    case "unbeaten":
      return (
        <StoryCard
          title="Unbeaten and winless"
          note="Teams with at least two games. Filled squares are wins."
          groups={[
            { label: story.perfect.length ? "Still perfect" : undefined, rows: story.perfect.map((t) => <TeamRow key={t.teamId} team={t} season={season} value={rec(t)} visual={<Pips results={t.results} />} />) },
            { label: story.winless.length ? "Still looking for a win" : undefined, rows: story.winless.map((t) => <TeamRow key={t.teamId} team={t} season={season} value={rec(t)} visual={<Pips results={t.results} />} />) },
          ]}
        />
      );
    case "streaks": {
      const active = story.mode === "active";
      return (
        <StoryCard
          title={active ? "Streaks right now" : "Longest streaks"}
          note={active ? "Runs of three or more. Squares show the last 10 games, filled for wins." : "The longest runs of wins and losses all season."}
          groups={[
            { label: story.wins.length ? "Winning" : undefined, rows: story.wins.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={active ? `W${r.length}` : `${r.length} straight`} visual={active ? <Pips results={r.team.results} /> : undefined} />) },
            { label: story.losses.length ? "Losing" : undefined, rows: story.losses.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={active ? `L${r.length}` : `${r.length} straight`} visual={active ? <Pips results={r.team.results} /> : undefined} />) },
          ]}
        />
      );
    }
    case "vs-last":
      return (
        <StoryCard
          title={priorLabel ? `Compared with ${priorLabel}` : "Compared with last season"}
          note="Win percentage last season (hollow dot) and now."
          groups={[
            { label: "Better", rows: story.risers.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={rec(r.team)} aside={`was ${rec(r.prior)}`} visual={<Dumbbell from={winPct(r.prior)!} to={winPct(r.team)!} />} />) },
            { label: "Worse", rows: story.fallers.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={rec(r.team)} aside={`was ${rec(r.prior)}`} visual={<Dumbbell from={winPct(r.prior)!} to={winPct(r.team)!} />} />) },
          ]}
        />
      );
    case "close":
      return (
        <StoryCard
          title="Close games"
          note={`Record in games decided by ${CLOSE_MARGIN} points or fewer.`}
          groups={[
            { label: "Best", rows: story.best.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={rec(r.record)} visual={<ShareBar value={winPct(r.record)!} />} />) },
            { label: "Worst", rows: story.worst.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={rec(r.record)} visual={<ShareBar value={winPct(r.record)!} />} />) },
          ]}
        />
      );
    case "home-road":
      return (
        <StoryCard
          title="Home and road"
          note="Biggest gaps between home and road win percentage."
          groups={[
            {
              rows: story.rows.map((r) => (
                <TeamRow
                  key={r.team.teamId}
                  team={r.team}
                  season={season}
                  value={rec(r.team)}
                  visual={
                    <span className="grid grid-cols-[4.75rem_1fr] items-center gap-x-2 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
                      <span>Home {rec(r.home)}</span>
                      <ShareBar value={winPct(r.home)!} />
                      <span>Road {rec(r.road)}</span>
                      <ShareBar value={winPct(r.road)!} className="bg-foreground/40" />
                    </span>
                  }
                />
              )),
            },
          ]}
        />
      );
    case "schedule":
      return (
        <StoryCard
          title="Schedule left"
          note="Average win percentage of each team's remaining opponents, as of today."
          groups={[
            { label: "Toughest", rows: story.toughest.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={pct(r.opponentPct)} aside={`${r.left} left`} visual={<ShareBar value={r.opponentPct} />} />) },
            { label: "Easiest", rows: story.easiest.map((r) => <TeamRow key={r.team.teamId} team={r.team} season={season} value={pct(r.opponentPct)} aside={`${r.left} left`} visual={<ShareBar value={r.opponentPct} />} />) },
          ]}
        />
      );
  }
}

/** The season's storylines, chosen by how far along it is. */
export function SeasonPulsePanel() {
  const current = canonicalSeasonFromStartYear(currentNbaStartYear());
  const previous = priorSeason(current);
  const season = pickPulseSeason(
    current,
    previous,
    (s) => finishedRegularGames(getRuntimeSnapshotGames(s)).length
  );
  if (!season) return null;
  const before = priorSeason(season);
  const pulse = buildSeasonPulse({
    season,
    games: getRuntimeSnapshotGames(season),
    priorSeason: before,
    priorGames: before ? getRuntimeSnapshotGames(before) : [],
  });
  if (!pulse) return null;

  const reviewing = season !== current;
  const complete = pulse.phase === "complete";
  const share = pulse.gamesPlayed / REGULAR_SEASON_GAMES;

  return (
    <section className="sports-card flex flex-col gap-5 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={type.heading}>{complete ? `${season} in review` : `${season} so far`}</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {reviewing
              ? `How ${season} played out. This switches to ${current} once most teams have played.`
              : "The storylines change as the season goes. Updated daily from every finished game."}
          </p>
        </div>
        <Link href="/standings" className={cn(type.bodySm, sectionLinkClassName)}>
          Standings <span data-motion-arrow aria-hidden>→</span>
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="font-semibold">{complete ? "Regular season complete" : "Regular season"}</span>
          <span className="tabular-nums text-muted-foreground">
            {pulse.gamesPlayed.toLocaleString()} of {REGULAR_SEASON_GAMES.toLocaleString()} games played
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Regular-season games played"
          aria-valuemin={0}
          aria-valuemax={REGULAR_SEASON_GAMES}
          aria-valuenow={pulse.gamesPlayed}
          className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]"
        >
          <div className="h-full rounded-full bg-[#2f64d6] dark:bg-[#8fb0ff]" style={{ width: `${share * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[15px] font-bold tracking-tight">{LADDER_TITLE[pulse.phase]}</h3>
          <p className={cn(type.caption, "text-muted-foreground")}>
            Each row is games above .500 (wins minus losses), best at the top.
            {pulse.phase === "complete"
              ? null
              : ` Arrows mark teams at least ${WEEK_MOVE_MIN} games over or under .500 in the last 7 days.`}
          </p>
        </div>
        <LadderView pulse={pulse} />
      </div>

      {pulse.stories.length ? (
        <div className={cn("grid gap-3", STORY_COLUMNS[pulse.stories.length])}>
          {pulse.stories.map((story) => (
            <StoryView key={story.kind} story={story} pulse={pulse} />
          ))}
        </div>
      ) : null}

      <p className={cn(type.caption, "text-muted-foreground")}>
        League average: {pulse.totals.ppg.toFixed(1)} points per team, {pct(pulse.totals.closeShare)} of games decided by{" "}
        {CLOSE_MARGIN} or fewer, home teams win {pct(pulse.totals.homeWinShare)}. Final scores from ESPN.
      </p>
    </section>
  );
}

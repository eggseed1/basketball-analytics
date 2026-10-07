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
  CHART_MIN_GAMES,
  CLOSE_MARGIN,
  REGULAR_SEASON_GAMES,
  buildSeasonPulse,
  finishedRegularGames,
  pickPulseSeason,
  winPct,
  type Highlight,
  type HighlightRole,
  type PulsePhase,
  type SeasonPulse,
  type Story,
  type TeamResult,
  type TeamSeason,
  type WinLoss,
} from "@/lib/season-pulse";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const ROLE: Record<HighlightRole, { label: string; text: string; bg: string }> = {
  best: { label: "Best record", text: "text-[#2f64d6] dark:text-[#8fb0ff]", bg: "bg-[#2f64d6] dark:bg-[#8fb0ff]" },
  worst: { label: "Worst record", text: "text-[#b45309] dark:text-[#fbbf24]", bg: "bg-[#b45309] dark:bg-[#fbbf24]" },
  hot: { label: "Hottest lately", text: "text-[#dc2626] dark:text-[#f87171]", bg: "bg-[#dc2626] dark:bg-[#f87171]" },
  cold: { label: "Coldest lately", text: "text-[#0e7490] dark:text-[#67e8f9]", bg: "bg-[#0e7490] dark:bg-[#67e8f9]" },
  riser: { label: "Most improved", text: "text-[#15803d] dark:text-[#4ade80]", bg: "bg-[#15803d] dark:bg-[#4ade80]" },
  faller: { label: "Biggest drop", text: "text-[#7e22ce] dark:text-[#c084fc]", bg: "bg-[#7e22ce] dark:bg-[#c084fc]" },
};

const CHART_TITLE: Record<PulsePhase, string> = {
  early: "Fast starts and slow starts",
  middle: "Who's moving",
  stretch: "Who's moving down the stretch",
  complete: "How the season unfolded",
};

const STORY_COLUMNS: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

const rec = (r: WinLoss) => `${r.wins}-${r.losses}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const shortSeason = (s: string) => s.slice(2);

function highlightDetail(h: Highlight, priorLabel: string | null): string {
  switch (h.role) {
    case "best":
    case "worst":
      return rec(h.team);
    case "hot":
    case "cold":
      return `${rec(h.form)} in last 10`;
    case "riser":
    case "faller":
      return h.prior && priorLabel ? `${rec(h.team)}, was ${rec(h.prior)} in ${shortSeason(priorLabel)}` : rec(h.team);
  }
}

function RaceChart({ pulse }: { pulse: SeasonPulse }) {
  const n = pulse.maxTeamGames;
  const values = pulse.teams.flatMap((t) => t.path);
  const hi = Math.max(2, ...values) + 1;
  const lo = Math.min(-2, ...values) - 1;
  const x = (i: number) => (i / n) * 100;
  const y = (v: number) => ((hi - v) / (hi - lo)) * 100;
  const d = (path: number[]) =>
    path.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const focus = new Set(pulse.highlights.map((h) => h.team.teamId));
  const top = Math.max(...values);
  const bottom = Math.min(...values);

  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-1.5 gap-y-1">
      <div className="relative text-[10px] tabular-nums text-muted-foreground" aria-hidden>
        <span className="absolute right-0 -translate-y-1/2" style={{ top: `${y(top)}%` }}>+{top}</span>
        <span className="absolute right-0 -translate-y-1/2 font-semibold" style={{ top: `${y(0)}%` }}>.500</span>
        <span className="absolute right-0 -translate-y-1/2" style={{ top: `${y(bottom)}%` }}>{bottom}</span>
      </div>
      <div className="relative h-48 sm:h-56">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
          <line x1={0} x2={100} y1={y(0)} y2={y(0)} className="text-muted-foreground/60" stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          {pulse.teams
            .filter((t) => !focus.has(t.teamId) && t.path.length > 1)
            .map((t) => (
              <path key={t.teamId} d={d(t.path)} fill="none" className="text-foreground/[0.13]" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
        </svg>
        <div data-motion-reveal className="absolute inset-0">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
            {pulse.highlights.map((h, i) => {
              // Form roles are about the last 10 games, so the rest of the season steps back.
              const recent = h.role === "hot" || h.role === "cold";
              const start = Math.max(0, h.team.path.length - 11);
              return (
                <g key={h.team.teamId} data-line={i} className={ROLE[h.role].text}>
                  <path d={d(h.team.path)} fill="none" stroke="currentColor" strokeOpacity={recent ? 0.4 : 1} strokeWidth={recent ? 1.75 : 2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {recent ? (
                    <path
                      d={h.team.path.slice(start).map((v, j) => `${j ? "L" : "M"}${x(start + j).toFixed(2)},${y(v).toFixed(2)}`).join("")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
          {pulse.highlights.map((h, i) => (
            <span
              key={h.team.teamId}
              data-line={i}
              aria-hidden
              className={cn("absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", ROLE[h.role].bg)}
              style={{ left: `${x(h.team.path.length - 1)}%`, top: `${y(h.team.path.at(-1)!)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="col-start-2 flex justify-between text-[10px] tabular-nums text-muted-foreground" aria-hidden>
        <span>Game 1</span>
        <span>Game {n}</span>
      </div>
    </div>
  );
}

function ChartLegend({ pulse }: { pulse: SeasonPulse }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {pulse.highlights.map((h, i) => (
        <li key={h.team.teamId} className="min-w-0">
          <Link
            href={teamPageHref(h.team.teamId, { season: pulse.season })}
            data-focus={i}
            data-motion="chip"
            className="flex min-w-0 flex-col gap-1 rounded-[10px] px-2 py-1.5 hover:bg-foreground/[0.04]"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <span aria-hidden className={cn("h-[3px] w-3 rounded-full", ROLE[h.role].bg)} />
              {ROLE[h.role].label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <TeamLogo teamKey={h.team.abbr} size="xs" />
              <span className="truncate text-[13px] font-semibold">{h.team.name}</span>
            </span>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {highlightDetail(h, pulse.priorSeason)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
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
        className={cn("absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full", up ? ROLE.riser.bg : ROLE.faller.bg)}
        style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, transformOrigin: up ? "left" : "right" }}
      />
      <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-[1.5px] ring-foreground/40" style={{ left: `${from * 100}%` }} />
      <span className={cn("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full", up ? ROLE.riser.bg : ROLE.faller.bg)} style={{ left: `${to * 100}%` }} />
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
  const showChart = pulse.maxTeamGames >= CHART_MIN_GAMES && pulse.highlights.length > 0;

  return (
    <section className="sports-card flex flex-col gap-5 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={type.heading}>{complete ? `${season} in review` : `${season} so far`}</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {reviewing
              ? `How ${season} played out. This switches to ${current} after its first few nights of games.`
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

      {showChart ? (
        <div data-motion="replay" data-pulse-chart className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[15px] font-bold tracking-tight">{CHART_TITLE[pulse.phase]}</h3>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Wins minus losses after every game. Gray lines are the rest of the league.
              {pulse.highlights.some((h) => h.role === "hot" || h.role === "cold")
                ? " Bold ends on the hot and cold lines are their last 10 games."
                : null}
            </p>
          </div>
          <RaceChart pulse={pulse} />
          <ChartLegend pulse={pulse} />
        </div>
      ) : null}

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

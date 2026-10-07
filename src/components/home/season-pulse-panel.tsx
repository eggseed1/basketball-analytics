import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { getRuntimeStandings } from "@/data/runtime/standings-snapshot";
import { sectionLinkClassName, type } from "@/lib/design-system";
import { priorSeason } from "@/lib/season-glance";
import {
  CLOSE_MARGIN,
  REGULAR_SEASON_GAMES,
  buildSeasonPulse,
  finishedRegularGames,
  pickPulseSeason,
  type PulseMover,
  type PulseRecord,
  type PulseTotals,
  type SeasonPulse,
} from "@/lib/season-pulse";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

function records(season: string | null): PulseRecord[] {
  const standings = season ? getRuntimeStandings(season) : null;
  return (standings?.conferences ?? []).flatMap((c) =>
    c.rows.map((r) => ({
      teamId: r.teamId,
      abbr: r.abbreviation,
      name: r.displayName,
      wins: r.wins,
      losses: r.losses,
    }))
  );
}

function TrendLine({ values, reference }: { values: number[]; reference: number | null }) {
  if (values.length < 2) {
    return <p className="flex h-10 items-center text-[11px] text-muted-foreground">The weekly line starts after week two.</p>;
  }
  const all = reference != null ? [...values, reference] : values;
  const span = Math.max(...all) - Math.min(...all);
  const pad = span * 0.18 || Math.abs(all[0]!) * 0.02 || 0.01;
  const lo = Math.min(...all) - pad;
  const hi = Math.max(...all) + pad;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 40 - ((v - lo) / (hi - lo)) * 40;
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const last = values[values.length - 1]!;
  return (
    <div className="relative h-10 w-full">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {reference != null ? (
          <line
            x1={0}
            x2={100}
            y1={y(reference)}
            y2={y(reference)}
            className="text-muted-foreground/70"
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <path
          d={d}
          fill="none"
          className="text-[#2f64d6] dark:text-[#8fb0ff]"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          data-motion-line
        />
      </svg>
      <span
        aria-hidden
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2f64d6] ring-2 ring-background dark:bg-[#8fb0ff]"
        style={{ left: "100%", top: `${(y(last) / 40) * 100}%` }}
      />
    </div>
  );
}

function TrendTile({
  label,
  value,
  format,
  weekly,
  prior,
  priorLabel,
  note,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  weekly: number[];
  prior: number | null;
  priorLabel: string | null;
  note: string;
}) {
  const same = prior != null && format(prior) === format(value);
  const up = prior != null && value > prior;
  return (
    <div
      data-motion="replay"
      className="flex min-w-0 flex-col gap-2 rounded-[12px] bg-foreground/[0.03] p-3 ring-1 ring-inset ring-foreground/[0.06]"
    >
      <p className={cn(type.caption, "font-semibold text-muted-foreground")}>{label}</p>
      <p className="text-[28px] font-bold leading-none tracking-tight tabular-nums">{format(value)}</p>
      {prior != null && priorLabel ? (
        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {same ? (
            `Same as ${priorLabel}`
          ) : (
            <>
              <span aria-hidden className="text-foreground">{up ? "▲" : "▼"}</span>{" "}
              {up ? "Up" : "Down"} from {format(prior)} in {priorLabel}
            </>
          )}
        </p>
      ) : null}
      <TrendLine values={weekly} reference={prior} />
      <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

function MoverList({
  title,
  movers,
  season,
  priorLabel,
}: {
  title: string;
  movers: PulseMover[];
  season: string;
  priorLabel: string;
}) {
  if (!movers.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>{title}</h3>
      <ul className="-mx-2 flex flex-col">
        {movers.map((m) => (
          <li key={m.teamId}>
            <Link
              href={teamPageHref(m.teamId, { season })}
              data-motion="row"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/70"
            >
              <TeamLogo teamKey={m.abbr} size="xs" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{m.name}</span>
              <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums">
                {m.wins}-{m.losses}
              </span>
              <span className="w-[5.5rem] shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                {m.priorWins}-{m.priorLosses} in {priorLabel.slice(2)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const fmtPoints = (v: number) => v.toFixed(1);
const fmtShare = (v: number) => `${Math.round(v * 100)}%`;

function Trends({ pulse }: { pulse: SeasonPulse }) {
  const prior: PulseTotals | null = pulse.prior;
  const weekly = (pick: (w: PulseTotals) => number) => pulse.weeks.map(pick);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TrendTile
        label="Points per team"
        value={pulse.totals.ppg}
        format={fmtPoints}
        weekly={weekly((w) => w.ppg)}
        prior={prior?.ppg ?? null}
        priorLabel={pulse.priorSeason}
        note="What an average team scores in a game."
      />
      <TrendTile
        label="Close games"
        value={pulse.totals.closeShare}
        format={fmtShare}
        weekly={weekly((w) => w.closeShare)}
        prior={prior?.closeShare ?? null}
        priorLabel={pulse.priorSeason}
        note={`Games decided by ${CLOSE_MARGIN} points or fewer.`}
      />
      <TrendTile
        label="Home teams win"
        value={pulse.totals.homeWinShare}
        format={fmtShare}
        weekly={weekly((w) => w.homeWinShare)}
        prior={prior?.homeWinShare ?? null}
        priorLabel={pulse.priorSeason}
        note="Share of games the home team won."
      />
    </div>
  );
}

/** League pulse that follows the season week by week. */
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
    records: records(season),
    priorRecords: records(before),
  });
  if (!pulse) return null;

  const reviewing = season !== current;
  const share = pulse.gamesPlayed / REGULAR_SEASON_GAMES;
  const priorLabel = pulse.priorSeason;

  return (
    <section className="sports-card flex flex-col gap-5 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={type.heading}>{pulse.complete ? `${season} in review` : `${season} so far`}</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {reviewing
              ? `Every regular-season game of ${season}. This switches to ${current} after its first week of games.`
              : "Built from every finished regular-season game and updated daily."}
          </p>
        </div>
        <Link href="/standings" className={cn(type.bodySm, sectionLinkClassName)}>
          Standings <span data-motion-arrow aria-hidden>→</span>
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="font-semibold">
            {pulse.complete ? "Regular season complete" : `Week ${pulse.week}`}
          </span>
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

      <div className="flex flex-col gap-2">
        <Trends pulse={pulse} />
        <p className="text-[11px] text-muted-foreground">
          Lines show each week on its own{priorLabel ? `. The dashed line is the ${priorLabel} average.` : "."}
        </p>
      </div>

      {priorLabel && (pulse.risers.length || pulse.fallers.length) ? (
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <MoverList
            title={pulse.complete ? `Biggest jumps from ${priorLabel}` : "Better than last season"}
            movers={pulse.risers}
            season={season}
            priorLabel={priorLabel}
          />
          <MoverList
            title={pulse.complete ? `Biggest drops from ${priorLabel}` : "Worse than last season"}
            movers={pulse.fallers}
            season={season}
            priorLabel={priorLabel}
          />
        </div>
      ) : null}

      <p className={cn(type.caption, "text-muted-foreground")}>
        Final scores and records from ESPN.
      </p>
    </section>
  );
}

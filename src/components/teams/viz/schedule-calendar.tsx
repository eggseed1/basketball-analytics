"use client";

import type { CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import type { TeamScheduleRow } from "@/lib/team-schedule";
import { scheduleTimeLabel } from "@/lib/tip-time";
import { useViewerTimeZone } from "@/components/sports/local-tip-time";
import { cn } from "@/lib/utils";

import { LegendSwatch, LOSS, signed, VizCard, WIN } from "./viz-kit";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y: y!, m: m! - 1, d: d! };
}

function cellStyle(row: TeamScheduleRow): CSSProperties {
  if (row.phase === "preseason") return { background: "color-mix(in oklab, var(--foreground) 8%, transparent)" };
  if (row.result === "W") return { background: `color-mix(in oklab, ${WIN} 80%, transparent)`, color: "white" };
  if (row.result === "L") return { background: `color-mix(in oklab, ${LOSS} 78%, transparent)`, color: "white" };
  return { boxShadow: "inset 0 0 0 1.5px var(--viz-accent)", background: "color-mix(in oklab, var(--viz-accent) 8%, transparent)" };
}

function tipFor(row: TeamScheduleRow, timeZone: string): { tip: string; sub: string } {
  const side = row.home ? "vs" : "at";
  const tip =
    row.result && row.teamScore != null && row.oppScore != null
      ? `${row.dateLabel} · ${row.result} ${row.teamScore}-${row.oppScore} ${side} ${row.oppAbbr}${row.overtime ? " (OT)" : ""}`
      : `${row.dateLabel} · ${side} ${row.oppAbbr}`;
  const extra = [
    row.result && row.teamScore != null && row.oppScore != null
      ? `margin ${signed(row.teamScore - row.oppScore, 0)}`
      : scheduleTimeLabel(row, timeZone),
    row.backToBack ? "second night of a back-to-back" : null,
    row.note ?? (row.phase !== "regular" ? row.phase : null),
  ].filter(Boolean);
  return { tip, sub: extra.join(" · ") || (row.home ? "Home" : "Away") };
}

/**
 * Schedule tab hero: the season laid out as monthly calendars. Each game day
 * is filled by result (or outlined when still to play) and carries the
 * opponent's logo, so streaks, road trips and dense stretches show up as
 * shapes on the page.
 */
export function ScheduleCalendar({
  rows,
  season,
  teamKey,
}: {
  rows: TeamScheduleRow[];
  season: string;
  teamKey: string;
}) {
  const timeZone = useViewerTimeZone();
  if (!rows.length) return null;
  const byDay = new Map<string, TeamScheduleRow[]>();
  for (const row of rows) {
    const key = row.date.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const first = parts(rows[0]!.date);
  const last = parts(rows[rows.length - 1]!.date);
  const months: Array<{ y: number; m: number }> = [];
  for (let y = first.y, m = first.m; y < last.y || (y === last.y && m <= last.m); ) {
    months.push({ y, m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  const hasUpcoming = rows.some((r) => !r.result && r.phase !== "preseason");
  const hasPreseason = rows.some((r) => r.phase === "preseason");

  return (
    <VizCard
      title="The season on a calendar"
      accentKey={teamKey}
      subtitle={`Every ${season} game day with the opponent's logo. The small @ marks a road game, and a dot in the corner marks the second night of a back-to-back.`}
      aside={
        <div className="flex flex-wrap gap-3">
          <LegendSwatch color={WIN} label="Win" />
          <LegendSwatch color={LOSS} label="Loss" />
          {hasUpcoming ? <LegendSwatch color="var(--viz-accent)" outline label="To play" /> : null}
          {hasPreseason ? <LegendSwatch color="color-mix(in oklab, var(--foreground) 14%, transparent)" label="Preseason" /> : null}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 min-[440px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map(({ y, m }) => {
          const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
          const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const monthRows = rows.filter((r) => {
            const p = parts(r.date);
            return p.y === y && p.m === m;
          });
          const w = monthRows.filter((r) => r.result === "W" && r.countsInRecord).length;
          const l = monthRows.filter((r) => r.result === "L" && r.countsInRecord).length;
          return (
            <div key={`${y}-${m}`} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <h4 className={cn(type.bodySm, "font-bold")}>
                  {MONTHS[m]} <span className="font-normal text-muted-foreground">{y}</span>
                </h4>
                <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                  {w + l > 0
                    ? `${w}-${l}`
                    : `${monthRows.length} ${monthRows.length === 1 ? "game" : "games"}`}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-[3px]">
                {WEEKDAYS.map((d, i) => (
                  <span key={i} aria-hidden className={cn(type.micro, "text-center text-muted-foreground")}>
                    {d}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`lead${i}`} aria-hidden />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const day = i + 1;
                  const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const games = byDay.get(key);
                  const row = games?.[0];
                  if (!row) {
                    return (
                      <span
                        key={key}
                        aria-hidden
                        className={cn(type.micro, "flex aspect-square items-start justify-start rounded-[4px] bg-foreground/[0.03] p-0.5 text-muted-foreground/60")}
                      >
                        {day}
                      </span>
                    );
                  }
                  const { tip, sub } = tipFor(row, timeZone);
                  return (
                    <TransitionLink
                      key={key}
                      href={`/games/${encodeURIComponent(row.id)}?season=${encodeURIComponent(row.season)}`}
                      data-viz-mark
                      data-motion-dot
                      data-tip={tip}
                      data-tip-sub={sub}
                      aria-label={tip}
                      className="relative flex aspect-square items-center justify-center rounded-[4px]"
                      style={{ ...cellStyle(row), "--viz-lift": 1.35, "--i": day } as CSSProperties}
                    >
                      <TeamLogo teamKey={row.oppAbbr} size="2xs" />
                      {!row.home ? (
                        <span className="absolute left-0.5 top-0 text-[8px] font-bold leading-none opacity-90">@</span>
                      ) : null}
                      {row.backToBack ? (
                        <span aria-hidden className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-current opacity-90" />
                      ) : null}
                    </TransitionLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </VizCard>
  );
}

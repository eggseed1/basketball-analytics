import { GlassSurface } from "@/components/brand/glass-surface";
import {
  PLAY_TYPE_MIN_POSS,
  type PlayerPlayTypes,
} from "@/data/runtime/play-type-snapshot";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamChartColor } from "@/lib/nba-brand";
import { percentileSavantColor, percentileSavantForeground } from "@/lib/player-grade";
import { cn } from "@/lib/utils";

/** Team color that follows the theme (light pick, lifted pick on dark). */
export function teamColorAuto(teamKey?: string | null): string {
  const light = teamChartColor(teamKey, { surface: "light" }).color;
  const dark = teamChartColor(teamKey, { surface: "dark" }).color;
  return `color-mix(in oklab, ${dark} var(--surface-dark-mix, 0%), ${light})`;
}

function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export function PlayerPlayTypesCard({
  data,
  playerName,
  teamKey,
}: {
  data: PlayerPlayTypes;
  playerName: string;
  teamKey?: string | null;
}) {
  const bar = teamColorAuto(teamKey);
  const maxFreq = Math.max(...data.rows.map((r) => r.frequency), 0.01);
  return (
    <GlassSurface effect="css" className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className={type.heading}>Play types</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            How {playerName} finished possessions in {data.season}, and how well.
          </p>
        </div>
        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {formatNumber(data.totalPoss, 0)} tracked possessions
        </p>
      </div>

      <div
        className={cn(
          type.micro,
          "hidden grid-cols-[9.5rem_minmax(0,1fr)_3.5rem_4.5rem] items-center gap-3 font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:grid"
        )}
      >
        <span>Play type</span>
        <span>Share of possessions</span>
        <span className="text-right">PPP</span>
        <span className="text-right">Percentile</span>
      </div>

      <ul className="flex flex-col gap-3 sm:gap-2.5">
        {data.rows.map((row) => {
          const pill = row.percentile == null ? null : percentileSavantColor(row.percentile, "auto");
          return (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_3.5rem_4.5rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)_3.5rem_4.5rem]"
            >
              <span className={cn(type.bodySm, "col-span-3 font-semibold sm:col-span-1")}>
                {row.label}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, (row.frequency / maxFreq) * 100)}%`,
                      background: bar,
                    }}
                  />
                </div>
                <span className={cn(type.caption, "w-10 text-right tabular-nums text-muted-foreground")}>
                  {formatPct(row.frequency, 0)}
                </span>
              </div>
              <span
                className={cn(type.bodySm, "text-right font-semibold tabular-nums")}
                title={
                  row.leaguePpp != null
                    ? `${row.pts} points on ${row.poss} possessions. League ${row.leaguePpp.toFixed(2)}`
                    : `${row.pts} points on ${row.poss} possessions`
                }
              >
                {row.ppp == null ? "—" : row.ppp.toFixed(2)}
              </span>
              <span className="flex justify-end">
                {row.percentile == null ? (
                  <span
                    className={cn(type.caption, "text-muted-foreground")}
                    title={`Fewer than ${PLAY_TYPE_MIN_POSS} possessions`}
                  >
                    Small sample
                  </span>
                ) : (
                  <span
                    className={cn(type.caption, "min-w-[3.25rem] rounded-md px-1.5 py-0.5 text-center font-bold tabular-nums")}
                    style={{
                      background: pill ?? undefined,
                      color: percentileSavantForeground(row.percentile),
                    }}
                  >
                    {ordinal(row.percentile)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p className={cn(type.caption, "text-muted-foreground")}>
        PPP is points per possession. Percentile ranks PPP among players with {PLAY_TYPE_MIN_POSS} or
        more possessions of that type, so smaller samples show no rank. Source: NBA Stats play type
        tracking, regular season.
      </p>
    </GlassSurface>
  );
}

import Link from "next/link";

import type { StatDetectiveRow } from "@/data/runtime/stat-detective-windows";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function signed(value: number, digits: number): string {
  const text = formatNumber(value, digits);
  return value > 0 ? `+${text}` : text;
}

function MoverList({
  title,
  rows,
  limit,
}: {
  title: string;
  rows: StatDetectiveRow[];
  limit?: number;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      {shown.length ? (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li key={`${title}-${row.playerId}`} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/players/${encodeURIComponent(row.playerId)}`}
                  className="text-[14px] font-semibold underline-offset-2 hover:underline"
                >
                  {row.playerName}
                </Link>
                <p className="text-[12px] text-muted-foreground">
                  {row.teamAbbr ? `${row.teamAbbr} · ` : ""}
                  {formatNumber(row.windowPpg, 1)} PPG vs {formatNumber(row.baselinePpg, 1)}
                  {" · "}
                  {formatNumber(row.windowMpg, 0)} mpg vs {formatNumber(row.baselineMpg, 0)}
                  {row.deltaTs == null
                    ? ""
                    : ` · TS ${signed(row.deltaTs * 100, 1)} pts`}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-[14px] font-semibold tabular-nums",
                  row.deltaPpg > 0 ? "text-delta-up" : "text-delta-down"
                )}
              >
                {signed(row.deltaPpg, 1)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No qualified movers in this window.
        </p>
      )}
    </div>
  );
}

export function StatDetectiveLists({
  risers,
  fallers,
  limit,
}: {
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
  limit?: number;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <MoverList title="Up" rows={risers} limit={limit} />
      <MoverList title="Down" rows={fallers} limit={limit} />
    </div>
  );
}

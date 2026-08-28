import Link from "next/link";

import {
  computeTeamSplits,
  hasTeamSnapshotGames,
} from "@/lib/team-snapshot-games";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function fmtRecord(wins: number, losses: number, games: number): string {
  if (!games) return "—";
  return `${wins}-${losses}`;
}

/**
 * Splits tab — home/road and recent form from bundled schedule snapshot.
 */
export async function TeamSplitsIsland({
  teamId,
  season,
}: {
  teamId: string;
  season: string;
}) {
  if (!hasTeamSnapshotGames(teamId, season)) {
    return (
      <section
        id="splits"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Splits"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Splits</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Game-level splits are not in the schedule snapshot for {season} yet.
            Check back after the next deploy bake or select a recent season.
          </p>
        </div>
      </section>
    );
  }

  const splits = computeTeamSplits(teamId, season);

  return (
    <section
      id="splits"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Splits"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Splits</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Regular-season home/road and last-10 form from the bundled schedule
            ({season}).
          </p>
        </div>
        <Link
          href={`/teams/${teamId}?tab=games&season=${encodeURIComponent(season)}`}
          className={cn(type.caption, "font-semibold underline")}
        >
          Game log →
        </Link>
      </div>

      <div className="sports-card overflow-x-auto p-4 sm:p-5">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Split</th>
              <th className="pb-2 px-2 text-right font-medium">Record</th>
              <th className="pb-2 px-2 text-right font-medium">GP</th>
              <th className="pb-2 px-2 text-right font-medium">PPG</th>
              <th className="pb-2 px-2 text-right font-medium">Opp</th>
              <th className="pb-2 pl-2 text-right font-medium">Diff</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/40 last:border-0"
              >
                <td className="py-2.5 pr-3 font-semibold">{row.label}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {fmtRecord(row.wins, row.losses, row.games)}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                  {row.games || "—"}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {row.ppg != null ? formatNumber(row.ppg, 1) : "—"}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                  {row.oppPpg != null ? formatNumber(row.oppPpg, 1) : "—"}
                </td>
                <td className="py-2.5 pl-2 text-right tabular-nums">
                  {row.diff != null
                    ? `${row.diff >= 0 ? "+" : ""}${formatNumber(row.diff, 1)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

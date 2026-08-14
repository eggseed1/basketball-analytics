import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import type { StandingRow } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

export function StandingsConferenceTable({
  title,
  rows,
  compact = false,
  linkTeamsToPlayers = true,
}: {
  title: string;
  rows: StandingRow[];
  /** Fewer columns for homepage. */
  compact?: boolean;
  linkTeamsToPlayers?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-3 py-2.5 text-[13px] font-bold tracking-tight">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-[13px]">
          <thead className="border-b border-border bg-secondary/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Team</th>
              <th className="px-2 py-2 text-right font-semibold">W</th>
              <th className="px-2 py-2 text-right font-semibold">L</th>
              <th className="px-2 py-2 text-right font-semibold">PCT</th>
              {!compact ? (
                <>
                  <th className="px-2 py-2 text-right font-semibold">GB</th>
                  <th className="px-2 py-2 text-right font-semibold">DIFF</th>
                  <th className="px-2 py-2 text-right font-semibold">PPG</th>
                  <th className="px-2 py-2 text-right font-semibold">OPP</th>
                  <th className="px-3 py-2 text-right font-semibold">STRK</th>
                </>
              ) : (
                <th className="px-3 py-2 text-right font-semibold">DIFF</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const brand = resolveTeamBrand(row.abbreviation);
              const teamCell = (
                <span className="flex min-w-0 items-center gap-2">
                  <TeamLogo teamKey={row.abbreviation} size="xs" />
                  <span className="truncate font-semibold">
                    {compact ? row.abbreviation : row.displayName}
                  </span>
                </span>
              );
              return (
                <tr
                  key={row.teamId}
                  className="hover:bg-secondary/40"
                  style={
                    brand
                      ? { boxShadow: `inset 3px 0 0 ${brand.primary}` }
                      : undefined
                  }
                >
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {row.rank}
                  </td>
                  <td className="px-2 py-2">
                    {linkTeamsToPlayers ? (
                      <Link
                        href={`/explore/players?team=${row.abbreviation}`}
                        className="hover:underline"
                      >
                        {teamCell}
                      </Link>
                    ) : (
                      teamCell
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.wins}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {row.losses}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatNumber(row.winPct, 3)}
                  </td>
                  {!compact ? (
                    <>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {row.gamesBehind <= 0
                          ? "-"
                          : formatNumber(row.gamesBehind, 1)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular-nums font-medium",
                          row.differential > 0
                            ? "text-emerald-700"
                            : row.differential < 0
                              ? "text-rose-700"
                              : ""
                        )}
                      >
                        {row.differential > 0 ? "+" : ""}
                        {formatNumber(row.differential, 1)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatNumber(row.ppg, 1)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.oppPpg, 1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.streak}
                      </td>
                    </>
                  ) : (
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums font-medium",
                        row.differential > 0
                          ? "text-emerald-700"
                          : row.differential < 0
                            ? "text-rose-700"
                            : ""
                      )}
                    >
                      {row.differential > 0 ? "+" : ""}
                      {formatNumber(row.differential, 1)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

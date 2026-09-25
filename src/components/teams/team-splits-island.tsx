import { TransitionLink } from "@/components/continuity/query-nav";
import {
  computeTeamFormSummary,
  computeTeamMarginSplits,
  computeTeamMonthSplits,
  computeTeamSplits,
  hasTeamSnapshotGames,
  type TeamSplitBucket,
} from "@/lib/team-snapshot-games";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

function fmtRecord(wins: number, losses: number, games: number): string {
  if (!games) return "—";
  return `${wins}-${losses}`;
}

function winPct(wins: number, losses: number): number | null {
  const gp = wins + losses;
  if (!gp) return null;
  return wins / gp;
}

function SplitsTable({
  rows,
  caption,
}: {
  rows: TeamSplitBucket[];
  caption?: string;
}) {
  if (!rows.length) return null;
  return (
    <div className="sports-card overflow-x-auto p-4 sm:p-5">
      {caption ? (
        <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
          {caption}
        </p>
      ) : null}
      <table className="w-full min-w-[680px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Split</th>
            <th className="pb-2 px-2 text-right font-medium">Record</th>
            <th className="pb-2 px-2 text-right font-medium">Win%</th>
            <th className="pb-2 px-2 text-right font-medium">GP</th>
            <th className="pb-2 px-2 text-right font-medium">PPG</th>
            <th className="pb-2 px-2 text-right font-medium">Opp</th>
            <th className="pb-2 pl-2 text-right font-medium">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = winPct(row.wins, row.losses);
            return (
              <tr
                key={row.id}
                className="border-b border-border/40 last:border-0"
              >
                <td className="py-2.5 pr-3 font-semibold">{row.label}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {fmtRecord(row.wins, row.losses, row.games)}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                  {pct != null ? formatPct(pct, 0) : "—"}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Splits tab — home/road, form, margin bands, and month buckets from schedule snapshot.
 */
export async function TeamSplitsIsland({
  teamId,
  season,
}: {
  teamId: string;
  season: string;
}) {
  const gamesHref = teamPageHref(teamId, { season, tab: "games" });

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
  const margins = computeTeamMarginSplits(teamId, season);
  const months = computeTeamMonthSplits(teamId, season);
  const form = computeTeamFormSummary(teamId, season);

  return (
    <section
      id="splits"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Splits"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Splits</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Regular-season home/road, form, and margin bands from the bundled
            schedule ({season}). Box-score only — not opponent-adjusted.
          </p>
        </div>
        <TransitionLink
          href={gamesHref}
          className={cn(type.caption, "font-semibold underline")}
        >
          Game log →
        </TransitionLink>
      </div>

      <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className={cn(type.bodySm, "font-semibold")}>Current form</h3>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Newest finals first · {form.finalsPlayed} completed regular-season
              games
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {form.streakLabel}
          </p>
        </div>
        {form.recentResults.length ? (
          <ol
            className="flex flex-wrap gap-1.5"
            aria-label="Recent results newest first"
          >
            {form.recentResults.map((r, i) => (
              <li
                key={`${r}-${i}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-sm text-[12px] font-bold tabular-nums",
                  r === "W"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                )}
                title={i === 0 ? `Most recent: ${r}` : r}
              >
                {r}
              </li>
            ))}
          </ol>
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No final regular-season games in the snapshot yet.
          </p>
        )}
      </div>

      <SplitsTable
        rows={splits}
        caption="Context splits — overall, home/road, and rolling windows."
      />

      <div>
        <h3 className={cn(type.bodySm, "mb-2 font-semibold")}>
          By final margin
        </h3>
        <SplitsTable
          rows={margins}
          caption="Close ≤5 · medium 6–14 · blowout ≥15. From final scores only."
        />
      </div>

      {months.length ? (
        <div>
          <h3 className={cn(type.bodySm, "mb-2 font-semibold")}>By month</h3>
          <SplitsTable
            rows={months}
            caption="Calendar months with at least one final in the snapshot."
          />
        </div>
      ) : null}
    </section>
  );
}

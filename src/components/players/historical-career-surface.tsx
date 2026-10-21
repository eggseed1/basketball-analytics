"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { SectionFrame } from "@/components/layout/section-frame";

import type {
  HistoryCareerSummary,
  HistoryPlayerSeason,
} from "@/data/history/player-career-types";
import { historySeasonSupportsDrbl } from "@/data/history/player-career-types";
import { sectionAtomicTileClassName } from "@/lib/design-system-sections";
import { type } from "@/lib/design-system";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

function perGame(
  value: number | null | undefined,
  gamesPlayed: number
): string {
  if (
    value == null ||
    !Number.isFinite(value) ||
    !Number.isFinite(gamesPlayed) ||
    gamesPlayed <= 0
  ) {
    return "—";
  }
  return (value / gamesPlayed).toFixed(1);
}

function CareerTotals({ career }: { career: HistoryCareerSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Points" value={String(career.points)} />
      <Stat label="Rebounds" value={String(career.rebounds)} />
      <Stat label="Assists" value={String(career.assists)} />
      <Stat label="Teams" value={String(career.teams.length)} />
    </dl>
  );
}

/**
 * Compact historical career surface from precomputed product artifacts.
 * DRBL/WAR1 only where scientifically supported (2020-21+); else —.
 * `totals` is for Overview summary; `full` keeps the season click-through list.
 */
export function HistoricalCareerSurface({
  career,
  seasons,
  playerId,
  viewingSeason,
  mode = "full",
}: {
  career: HistoryCareerSummary;
  seasons: HistoryPlayerSeason[];
  playerId: string;
  viewingSeason?: string;
  mode?: "totals" | "full";
}) {
  if (mode === "totals") {
    return (
      <div className="flex flex-col gap-2">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Career totals · {career.firstSeason} → {career.lastSeason} ·{" "}
          {career.seasons} seasons · {career.games} games
        </p>
        <CareerTotals career={career} />
      </div>
    );
  }

  return (
    <SectionFrame
      id="historical-career"
      density="supporting"
      title="Career totals"
      description={`${career.firstSeason} → ${career.lastSeason} · ${career.seasons} seasons · ${career.games} games`}
    >
      <CareerTotals career={career} />

      <div className="sports-card sports-card-subtle overflow-hidden">
        <p
          className={cn(
            type.micro,
            "border-b border-border/40 px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Seasons
        </p>
        <ul className="divide-y divide-border/40 sm:hidden">
          {seasons.map((s) => (
            <li key={s.season}>
              <TransitionLink
                href={playerHref({ playerId, season: s.season })}
                scroll={false}
                prefetch={false}
                className="block px-3 py-3 hover:bg-secondary/40"
              >
                <p className={cn(type.bodySm, "font-semibold")}>
                  {s.season}
                  {s.teamIds.length > 1 ? " · multi-team" : ""}
                  {viewingSeason === s.season ? " · Viewing" : ""}
                </p>
                <p
                  className={cn(
                    type.caption,
                    "mt-1 tabular-nums text-muted-foreground"
                  )}
                >
                  {s.gp} GP · {perGame(s.points, s.gp)} PTS ·{" "}
                  {perGame(s.rebounds, s.gp)} REB · {perGame(s.assists, s.gp)}{" "}
                  AST
                </p>
              </TransitionLink>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[36rem] text-left text-[13px]">
            <thead>
              <tr
                className={cn(
                  type.micro,
                  "uppercase tracking-wide text-muted-foreground"
                )}
              >
                <th className="px-3 py-2 font-semibold">Season</th>
                <th className="px-3 py-2 font-semibold">GP</th>
                <th className="px-3 py-2 font-semibold">PTS</th>
                <th className="px-3 py-2 font-semibold">REB</th>
                <th className="px-3 py-2 font-semibold">AST</th>
                <th className="px-3 py-2 font-semibold">DRBL/100</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => {
                const active = viewingSeason === s.season;
                const drblOk = historySeasonSupportsDrbl(s.season);
                return (
                  <tr
                    key={s.season}
                    className={
                      active ? "bg-secondary/50" : "hover:bg-secondary/30"
                    }
                  >
                    <td className="px-3 py-2 font-semibold">
                      <TransitionLink
                        href={playerHref({ playerId, season: s.season })}
                        scroll={false}
                        prefetch={false}
                        className="hover:underline"
                      >
                        {s.season}
                      </TransitionLink>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{s.gp}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {perGame(s.points, s.gp)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {perGame(s.rebounds, s.gp)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {perGame(s.assists, s.gp)}
                    </td>
                    <td
                      className="px-3 py-2 tabular-nums text-muted-foreground"
                      title={
                        drblOk
                          ? undefined
                          : "DRBL is currently available for supported seasons beginning in 2018-19."
                      }
                    >
                      —
                    </td>
                    <td className="px-3 py-2 text-right">
                      <TransitionLink
                        href={playerHref({ playerId, season: s.season })}
                        scroll={false}
                        prefetch={false}
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        View season
                      </TransitionLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Season DRBL and WAR1 stay blank before the supported era, not 0.
      </p>
    </SectionFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={sectionAtomicTileClassName}>
      <dt
        className={cn(
          type.micro,
          "font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {label}
      </dt>
      <dd className={cn(type.title, "font-bold tabular-nums")}>{value}</dd>
    </div>
  );
}

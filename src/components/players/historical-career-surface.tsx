"use client";

import { TransitionLink } from "@/components/continuity/query-nav";

import type {
  HistoryCareerSummary,
  HistoryPlayerSeason,
} from "@/data/history/player-career-types";
import { historySeasonSupportsDrbl } from "@/data/history/player-career-types";
import { playerHref } from "@/lib/player-page-contract";

/**
 * Compact historical career surface from precomputed product artifacts.
 * DRBL/WAR1 only where scientifically supported (2020-21+); else —.
 */
export function HistoricalCareerSurface({
  career,
  seasons,
  playerId,
  viewingSeason,
}: {
  career: HistoryCareerSummary;
  seasons: HistoryPlayerSeason[];
  playerId: string;
  viewingSeason?: string;
}) {
  return (
    <section className="flex flex-col gap-4" aria-label="Historical career">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Career</h2>
        <p className="text-[13px] text-muted-foreground">
          {career.firstSeason} → {career.lastSeason} · {career.seasons} seasons ·{" "}
          {career.games} games
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Points" value={String(career.points)} />
        <Stat label="Rebounds" value={String(career.rebounds)} />
        <Stat label="Assists" value={String(career.assists)} />
        <Stat label="Teams" value={String(career.teams.length)} />
      </dl>

      <div className="sports-card overflow-hidden">
        <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Seasons
        </p>
        <ul className="divide-y divide-border sm:hidden">
          {seasons.map((s) => (
            <li key={s.season}>
              <TransitionLink
                href={playerHref({ playerId, season: s.season })}
                scroll={false}
                prefetch={false}
                className="block px-3 py-3 hover:bg-secondary/40"
              >
                <p className="text-[14px] font-semibold">
                  {s.season}
                  {s.teamIds.length > 1 ? " · multi-team" : ""}
                  {viewingSeason === s.season ? " · Viewing" : ""}
                </p>
                <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
                  {s.gp} GP · {((s.points ?? 0) / Math.max(1, s.gp)).toFixed(1)}{" "}
                  PTS · {((s.rebounds ?? 0) / Math.max(1, s.gp)).toFixed(1)} REB
                  · {((s.assists ?? 0) / Math.max(1, s.gp)).toFixed(1)} AST
                </p>
              </TransitionLink>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[36rem] text-left text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
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
                      {((s.points ?? 0) / Math.max(1, s.gp)).toFixed(1)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {((s.rebounds ?? 0) / Math.max(1, s.gp)).toFixed(1)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {((s.assists ?? 0) / Math.max(1, s.gp)).toFixed(1)}
                    </td>
                    <td
                      className="px-3 py-2 tabular-nums text-muted-foreground"
                      title={
                        drblOk
                          ? undefined
                          : "DRBL is currently available for supported seasons beginning in 2020-21."
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
      <p className="text-[12px] text-muted-foreground">
        Open the Career tab for the full statistical table. No career DRBL or
        career WAR1 before the supported era.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sports-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[18px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

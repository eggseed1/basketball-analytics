import { TransitionLink } from "@/components/continuity/query-nav";

import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";
import {
  efgPct,
  fgPct,
  playerHref,
  tsPct,
  type PlayerPageView,
} from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

function pct(made: number, att: number): string {
  const p = fgPct(made, att);
  return p == null ? "—" : `${(p * 100).toFixed(1)}%`;
}

function dash(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
}

export function PlayerGameLogTable({
  playerId,
  season,
  rows,
  total,
  page,
  pageCount,
  filter = "ALL",
  mode = "basic",
  fromHistory,
  themeMode,
}: {
  playerId: string;
  season: string;
  rows: CompactPlayerGameLogRow[];
  total: number;
  page: number;
  pageCount: number;
  filter?: string;
  mode?: "basic" | "advanced";
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const filters = [
    ["ALL", "All"],
    ["home", "Home"],
    ["away", "Away"],
    ["W", "Wins"],
    ["L", "Losses"],
    ["starter", "Starter"],
    ["bench", "Bench"],
  ] as const;
  const advanced = mode === "advanced";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {total.toLocaleString()} games · page {page}/{pageCount} · showing{" "}
          {rows.length}
        </p>
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          {(["basic", "advanced"] as const).map((m) => (
            <TransitionLink
              key={m}
              href={playerHref({
                playerId,
                season,
                view: "games",
                page,
                filter: filter === "ALL" ? null : filter,
                mode: m,
                fromHistory,
                themeMode,
              })}
              scroll={false}
              prefetch={false}
              className={cn(
                "rounded-md px-2 py-1 font-semibold",
                (advanced ? "advanced" : "basic") === m
                  ? "bg-foreground text-background"
                  : "border border-border"
              )}
            >
              {m === "basic" ? "Basic" : "Advanced"}
            </TransitionLink>
          ))}
          {filters.map(([id, label]) => (
            <TransitionLink
              key={id}
              href={playerHref({
                playerId,
                season,
                view: "games",
                page: 1,
                filter: id === "ALL" ? null : id,
                mode: advanced ? "advanced" : "basic",
                fromHistory,
                themeMode,
              })}
              scroll={false}
              prefetch={false}
              className={cn(
                "rounded-md px-2 py-1 font-semibold",
                filter === id
                  ? "bg-foreground text-background"
                  : "border border-border"
              )}
            >
              {label}
            </TransitionLink>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[64rem] text-left text-[12px]">
          <thead className="border-b border-border bg-secondary/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-secondary/95 px-3 py-2">
                Date
              </th>
              <th className="px-2 py-2">Opp</th>
              <th className="px-2 py-2">Res</th>
              <th className="px-2 py-2 text-right">GS</th>
              <th className="px-2 py-2 text-right">MIN</th>
              {advanced ? (
                <>
                  <th className="px-2 py-2 text-right">TS%</th>
                  <th className="px-2 py-2 text-right">eFG%</th>
                  <th className="px-2 py-2 text-right">3PAr</th>
                  <th className="px-2 py-2 text-right">FTr</th>
                  <th className="px-2 py-2 text-right">TOV%</th>
                  <th className="px-2 py-2 text-right">PTS</th>
                  <th className="px-2 py-2 text-right">+/-</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-2 text-right">FG</th>
                  <th className="px-2 py-2 text-right">3P</th>
                  <th className="px-2 py-2 text-right">FT</th>
                  <th className="px-2 py-2 text-right">ORB</th>
                  <th className="px-2 py-2 text-right">DRB</th>
                  <th className="px-2 py-2 text-right">REB</th>
                  <th className="px-2 py-2 text-right">AST</th>
                  <th className="px-2 py-2 text-right">STL</th>
                  <th className="px-2 py-2 text-right">BLK</th>
                  <th className="px-2 py-2 text-right">TOV</th>
                  <th className="px-2 py-2 text-right">PF</th>
                  <th className="px-2 py-2 text-right">PTS</th>
                  <th className="px-2 py-2 text-right">+/-</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((g) => {
              const ts = tsPct(g.points, g.fga, g.fta);
              const efg = efgPct(g.fgm, g.fga, g.threePm);
              const threePAr = fgPct(g.threePa, g.fga);
              const ftr = g.fga > 0 ? g.fta / g.fga : null;
              const tovDenom = g.fga + 0.44 * g.fta + g.turnovers;
              const tovPct = tovDenom > 0 ? g.turnovers / tovDenom : null;
              return (
              <tr key={g.gameId} className="hover:bg-secondary/30">
                <td className="sticky left-0 z-10 bg-background/95 px-3 py-2 font-semibold">
                  <TransitionLink
                    href={`/games/${encodeURIComponent(g.gameId)}?season=${encodeURIComponent(season)}`}
                    prefetch={false}
                    className="underline-offset-2 hover:underline"
                  >
                    {g.date}
                  </TransitionLink>
                </td>
                <td className="px-2 py-2">
                  {g.homeAway === "home" ? "vs" : "@"} {g.opponentAbbr}
                </td>
                <td className="px-2 py-2 font-semibold">{g.result}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {g.starter == null ? "—" : g.starter ? "1" : "0"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {g.minutes ?? dash(g.minutesNum, 1)}
                </td>
                {advanced ? (
                  <>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {ts == null ? "—" : `${(ts * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {efg == null ? "—" : `${(efg * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {threePAr == null
                        ? "—"
                        : `${(threePAr * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {ftr == null ? "—" : ftr.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {tovPct == null
                        ? "—"
                        : `${(tovPct * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">
                      {g.points}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {dash(g.plusMinus)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.fgm}-{g.fga}
                      <span className="ml-1 text-muted-foreground">
                        {pct(g.fgm, g.fga)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.threePm}-{g.threePa}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.ftm}-{g.fta}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {dash(g.orb)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {dash(g.drb)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.rebounds}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.assists}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.steals}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.blocks}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.turnovers}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {dash(g.pf)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">
                      {g.points}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {dash(g.plusMinus)}
                    </td>
                  </>
                )}
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <nav className="flex gap-3 text-[13px]" aria-label="Game log pages">
          {page > 1 ? (
            <TransitionLink
              href={playerHref({
                playerId,
                season,
                view: "games" as PlayerPageView,
                page: page - 1,
                filter: filter === "ALL" ? null : filter,
                fromHistory,
                themeMode,
                mode: advanced ? "advanced" : "basic",
              })}
              scroll={false}
              prefetch={false}
              className="font-semibold underline-offset-2 hover:underline"
            >
              ← Prev
            </TransitionLink>
          ) : null}
          {page < pageCount ? (
            <TransitionLink
              href={playerHref({
                playerId,
                season,
                view: "games",
                page: page + 1,
                filter: filter === "ALL" ? null : filter,
                fromHistory,
                themeMode,
                mode: advanced ? "advanced" : "basic",
              })}
              scroll={false}
              prefetch={false}
              className="font-semibold underline-offset-2 hover:underline"
            >
              Next →
            </TransitionLink>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

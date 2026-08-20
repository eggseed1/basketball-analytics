import Link from "next/link";

import type { CompactTeamGameRow } from "@/data/history/team-matchup-index";
import { TEAM_GAMES_PAGE_SIZE } from "@/data/history/team-matchup-index";

function gameHref(gameId: string, season: string): string {
  return `/games/${encodeURIComponent(gameId)}?season=${encodeURIComponent(season)}`;
}

function gamesPageHref(
  teamId: string,
  season: string,
  page: number,
  extra?: Record<string, string | undefined>
): string {
  const q = new URLSearchParams();
  q.set("season", season);
  if (page > 1) q.set("gamesPage", String(page));
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v) q.set(k, v);
  }
  return `/teams/${encodeURIComponent(teamId)}?${q.toString()}`;
}

/** Bounded, URL-addressable team game log (≤ TEAM_GAMES_PAGE_SIZE rows). */
export function TeamGamesLog({
  teamId,
  season,
  rows,
  total,
  page,
  pageCount,
  fromHistory,
  theme,
}: {
  teamId: string;
  season: string;
  rows: CompactTeamGameRow[];
  total: number;
  page: number;
  pageCount: number;
  fromHistory?: boolean;
  theme?: string;
}) {
  const extra = {
    from: fromHistory ? "history" : undefined,
    theme,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-bold tracking-tight">Season game log</h3>
        <p className="text-[12px] text-muted-foreground">
          {total.toLocaleString()} games · page {page}/{pageCount} · showing{" "}
          {rows.length} (≤{TEAM_GAMES_PAGE_SIZE})
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No indexed games for this team-season.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((g) => {
            const opp =
              g.homeAway === "home" ? g.awayTricode : g.homeTricode;
            const score =
              g.homeAway === "home"
                ? `${g.homeScore}–${g.awayScore}`
                : `${g.awayScore}–${g.homeScore}`;
            return (
              <li key={g.gameId}>
                <Link
                  href={gameHref(g.gameId, g.season)}
                  prefetch={false}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[13px] hover:bg-secondary/40"
                >
                  <span className="font-semibold">
                    {g.date}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {g.homeAway === "home" ? "vs" : "@"} {opp}
                      {g.result ? ` · ${g.result}` : ""}
                      {g.ot ? " · OT" : ""}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {score} · Game →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pageCount > 1 ? (
        <nav
          className="flex flex-wrap items-center gap-3 text-[13px]"
          aria-label="Game log pages"
        >
          {page > 1 ? (
            <Link
              href={gamesPageHref(teamId, season, page - 1, extra)}
              prefetch={false}
              className="font-semibold underline-offset-2 hover:underline"
            >
              ← Prev
            </Link>
          ) : (
            <span className="text-muted-foreground">← Prev</span>
          )}
          {page < pageCount ? (
            <Link
              href={gamesPageHref(teamId, season, page + 1, extra)}
              prefetch={false}
              className="font-semibold underline-offset-2 hover:underline"
            >
              Next →
            </Link>
          ) : (
            <span className="text-muted-foreground">Next →</span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

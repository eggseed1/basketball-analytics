import Link from "next/link";

import {
  getHistoricalGameSummaries,
  getHistorySeasonManifest,
  listHistoryProductSeasons,
  searchHistoricalProductGames,
  type HistoricalGameSummary,
} from "@/data/history/product";
import {
  getSeasonPlayerUniverse,
  hasPlayerUniverseSeason,
} from "@/data/history/player-universe";
import { getSeasonCapabilities } from "@/lib/history/capabilities";
import { HISTORY_GAMES_PAGE_SIZE } from "@/lib/history/history-season-page";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { HISTORY_VERSION } from "@/lib/history/capabilities";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ season: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Number.parseInt(raw ?? "1", 10) || 1);
}

/** Compact fields only — never serialize run windows / deep metadata into rows. */
type CompactGameRow = {
  gameId: string;
  date: string;
  awayTricode: string;
  homeTricode: string;
  awayScore: number;
  homeScore: number;
  ot: boolean;
};

function toCompactRow(g: HistoricalGameSummary): CompactGameRow {
  return {
    gameId: g.gameId,
    date: g.date,
    awayTricode: g.awayTricode ?? "AWAY",
    homeTricode: g.homeTricode ?? "HOME",
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    ot: g.periodCount > 4,
  };
}

function gamesHref(
  season: string,
  page: number,
  filters: { team?: string; player?: string; date?: string }
) {
  const q = new URLSearchParams();
  if (filters.team) q.set("team", filters.team);
  if (filters.player) q.set("player", filters.player);
  if (filters.date) q.set("date", filters.date);
  if (page > 1) q.set("gamesPage", String(page));
  const qs = q.toString();
  return `/history/${encodeURIComponent(season)}${qs ? `?${qs}` : ""}`;
}

export async function generateMetadata({ params }: PageProps) {
  const { season } = await params;
  return {
    title: `${season} NBA Season | History`,
    description: `Games and play-by-play from the ${season} NBA season.`,
  };
}

export default async function HistorySeasonPage({
  params,
  searchParams,
}: PageProps) {
  const { season } = await params;
  const sp = await searchParams;
  const teamId = first(sp.team);
  const playerId = first(sp.player);
  const date = first(sp.date);
  const gamesPage = parsePage(first(sp.gamesPage));

  const seasons = listHistoryProductSeasons();
  const available = seasons.includes(season);
  const caps = getSeasonCapabilities(season);
  const manifest = getHistorySeasonManifest(season);

  const filtered = available
    ? teamId || playerId || date
      ? searchHistoricalProductGames({ season, teamId, playerId, date })
      : getHistoricalGameSummaries(season)
    : [];

  const sorted = [...filtered].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const totalGames = sorted.length;
  const gamesPageCount = Math.max(
    1,
    Math.ceil(totalGames / HISTORY_GAMES_PAGE_SIZE) || 1
  );
  const gamesPageSafe = Math.min(gamesPage, gamesPageCount);
  const gameSlice = sorted
    .slice(
      (gamesPageSafe - 1) * HISTORY_GAMES_PAGE_SIZE,
      gamesPageSafe * HISTORY_GAMES_PAGE_SIZE
    )
    .map(toCompactRow);

  const rangeStart =
    totalGames === 0 ? 0 : (gamesPageSafe - 1) * HISTORY_GAMES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    gamesPageSafe * HISTORY_GAMES_PAGE_SIZE,
    totalGames
  );

  const allPlayers = hasPlayerUniverseSeason(season)
    ? [...getSeasonPlayerUniverse(season)].sort((a, b) =>
        a.playerName.localeCompare(b.playerName)
      )
    : [];
  // Discovery sample only — full directory lives at /explore/players.
  const FEATURED_PLAYERS = 12;
  const featuredPlayers = allPlayers.slice(0, FEATURED_PLAYERS);

  const teamIndexPath = path.join(
    process.cwd(),
    "data",
    "drbl",
    "history",
    HISTORY_VERSION,
    season,
    "index-by-team.json"
  );
  const seasonTeams: Array<{
    canonicalId: string;
    abbr: string;
    name: string;
  }> = [];
  if (existsSync(teamIndexPath)) {
    try {
      const idx = JSON.parse(readFileSync(teamIndexPath, "utf8")) as Record<
        string,
        string[]
      >;
      for (const nbaId of Object.keys(idx)) {
        const team = getCanonicalTeamFromProvider("nba", nbaId);
        if (!team) continue;
        const brand = resolveHistoricalTeamBrand(
          team.canonicalTeamId,
          season,
          "era"
        );
        seasonTeams.push({
          canonicalId: team.canonicalTeamId,
          abbr: brand?.abbreviation ?? team.abbr,
          name: brand?.displayName ?? team.displayName,
        });
      }
      seasonTeams.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      // ignore
    }
  } else if (filtered.length > 0) {
    const seen = new Set<string>();
    for (const g of filtered) {
      for (const tid of [g.homeTeamId, g.awayTeamId]) {
        if (!tid || seen.has(tid)) continue;
        const team =
          getCanonicalTeamFromProvider("espn", tid) ??
          getCanonicalTeamFromProvider("nba", tid);
        if (!team) continue;
        seen.add(tid);
        seen.add(team.canonicalTeamId);
        const brand = resolveHistoricalTeamBrand(
          team.canonicalTeamId,
          season,
          "era"
        );
        seasonTeams.push({
          canonicalId: team.canonicalTeamId,
          abbr: brand?.abbreviation ?? team.abbr,
          name: brand?.displayName ?? team.displayName,
        });
      }
    }
    seasonTeams.sort((a, b) => a.name.localeCompare(b.name));
  }

  const filters = {
    team: teamId,
    player: playerId,
    date,
  };

  return (
    <main className="site-shell flex flex-1 flex-col gap-8 py-6 sm:py-8">
      <div>
        <p className="text-[12px] text-muted-foreground">
          <Link href="/history" className="hover:underline">
            History
          </Link>
          <span className="mx-1.5">/</span>
          {season}
        </p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
          {season} NBA Season
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
          Season discovery hub — teams, entry points, and a bounded game page.
          Full player boards live in Players.{" "}
          {caps?.fields.drbl === "SUPPORTED"
            ? "DRBL is available for this season."
            : "DRBL is currently available for supported seasons beginning in 2020-21."}
        </p>
      </div>

      {!available ? (
        <div className="sports-card p-5">
          <p className="text-[14px] font-semibold">Season not precomputed yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The historical product dataset for {season} is not on disk.
          </p>
          {seasons.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {seasons.map((s) => (
                <li key={s}>
                  <Link
                    href={`/history/${s}`}
                    className="text-[13px] underline-offset-4 hover:underline"
                  >
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-label="Explore">
            <h2 className="text-[17px] font-bold tracking-tight">Explore</h2>
            <ul className="flex flex-wrap gap-3 text-[13px]">
              <li>
                <Link
                  href={`/explore/players?season=${encodeURIComponent(season)}`}
                  className="underline-offset-4 hover:underline"
                >
                  Players directory ({allPlayers.length || "—"})
                </Link>
              </li>
              <li>
                <Link
                  href={`/explore/teams?season=${encodeURIComponent(season)}`}
                  className="underline-offset-4 hover:underline"
                >
                  Teams board
                </Link>
              </li>
              <li>
                <Link
                  href="/franchises"
                  className="underline-offset-4 hover:underline"
                >
                  Franchises
                </Link>
              </li>
              <li>
                <Link
                  href={`/explore/games?season=${encodeURIComponent(season)}`}
                  className="underline-offset-4 hover:underline"
                >
                  Games board
                </Link>
              </li>
            </ul>
          </section>

          {seasonTeams.length > 0 ? (
            <section className="flex flex-col gap-3" aria-label="Season teams">
              <div>
                <h2 className="text-[17px] font-bold tracking-tight">
                  Teams ({season})
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  Opens each club in this season&apos;s historical identity —
                  not today&apos;s successor brand alone.
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {seasonTeams.map((t) => (
                  <li key={t.canonicalId}>
                    <Link
                      href={`/teams/${encodeURIComponent(t.canonicalId)}?season=${encodeURIComponent(season)}&from=history`}
                      prefetch={false}
                      className="inline-block rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold hover:bg-secondary/50"
                    >
                      {t.abbr}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {t.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <form
            className="sports-card flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
            action={`/history/${encodeURIComponent(season)}`}
            method="get"
          >
            <label className="flex flex-1 flex-col gap-1 text-[12px]">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                Team ID
              </span>
              <input
                name="team"
                defaultValue={teamId ?? ""}
                className="rounded-md border border-border bg-background px-3 py-2 text-[13px]"
                placeholder="e.g. 1610612755"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[12px]">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                Player ID
              </span>
              <input
                name="player"
                defaultValue={playerId ?? ""}
                className="rounded-md border border-border bg-background px-3 py-2 text-[13px]"
                placeholder="e.g. 947"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[12px]">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                Date
              </span>
              <input
                name="date"
                defaultValue={date ?? ""}
                className="rounded-md border border-border bg-background px-3 py-2 text-[13px]"
                placeholder="YYYY-MM-DD"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-foreground px-4 py-2 text-[13px] font-semibold text-background"
            >
              Search
            </button>
          </form>

          {featuredPlayers.length > 0 ? (
            <section
              className="flex flex-col gap-3"
              aria-label="Featured players"
            >
              <div>
                <h2 className="text-[17px] font-bold tracking-tight">
                  Players
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  {allPlayers.length.toLocaleString()} appeared in games — showing{" "}
                  {featuredPlayers.length} as entry points. Open the full
                  directory for the complete list.
                </p>
              </div>
              <div className="sports-card overflow-hidden">
                <ul className="divide-y divide-border">
                  {featuredPlayers.map((p) => (
                    <li key={p.playerId}>
                      <Link
                        href={`/players/${p.playerId}?season=${encodeURIComponent(season)}&from=history`}
                        prefetch={false}
                        className="flex flex-col gap-0.5 px-4 py-3 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-[14px] font-semibold">
                          {p.playerName}
                        </span>
                        <span className="text-[12px] tabular-nums text-muted-foreground">
                          {p.teamIds.length > 1
                            ? "multi-team"
                            : nbaTeamAbbr(p.primaryTeamId)}{" "}
                          · {p.gp} GP
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[12px] text-muted-foreground">
                <Link
                  href={`/explore/players?season=${encodeURIComponent(season)}`}
                  className="underline-offset-4 hover:underline"
                >
                  Open full Players directory →
                </Link>
              </p>
            </section>
          ) : null}

          <section className="flex flex-col gap-3" aria-label="Games">
            <div>
              <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
              <p className="text-[13px] text-muted-foreground">
                {totalGames.toLocaleString()} games
                {manifest?.scoreTimelineSupported != null
                  ? ` · ${String(manifest.scoreTimelineSupported)} with score flow`
                  : ""}
                {" · "}
                {rangeStart}–{rangeEnd} of {totalGames.toLocaleString()}
              </p>
            </div>

            <div className="sports-card overflow-hidden">
              <ul className="divide-y divide-border">
                {gameSlice.map((g) => (
                  <li key={g.gameId}>
                    <Link
                      href={`/games/${g.gameId}?from=history&season=${encodeURIComponent(season)}`}
                      prefetch={false}
                      className="flex flex-col gap-1 px-4 py-3 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="text-[13px]">
                        <span className="text-muted-foreground">{g.date}</span>
                        <span className="mx-2 font-semibold">
                          {g.awayTricode} @ {g.homeTricode}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[13px] tabular-nums">
                        <span className="font-semibold">
                          {g.awayScore}–{g.homeScore}
                        </span>
                        {g.ot ? (
                          <span className="text-muted-foreground">OT</span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {gamesPageCount > 1 ? (
              <nav
                className="flex flex-wrap items-center gap-3 text-[13px]"
                aria-label="Games pagination"
              >
                {gamesPageSafe > 1 ? (
                  <Link
                    href={gamesHref(season, gamesPageSafe - 1, filters)}
                    className="underline-offset-4 hover:underline"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Previous</span>
                )}
                <span className="tabular-nums text-muted-foreground">
                  Page {gamesPageSafe} / {gamesPageCount}
                </span>
                {gamesPageSafe < gamesPageCount ? (
                  <Link
                    href={gamesHref(season, gamesPageSafe + 1, filters)}
                    className="underline-offset-4 hover:underline"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Next</span>
                )}
              </nav>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

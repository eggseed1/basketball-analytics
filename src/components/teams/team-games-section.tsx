import Link from "next/link";

import type { GameSummary, TeamSeasonStats } from "@/data/types";
import type { TeamBrand } from "@/lib/nba-brand";
import {
  filterTeamGames,
  formatTeamGameScoreLine,
  notableTeamGames,
} from "@/lib/team-explorer";

export function TeamGamesSection({
  recentPool,
  upcomingPool,
  team,
  brand,
  seasonAvgPpg,
}: {
  recentPool: GameSummary[];
  upcomingPool: GameSummary[];
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  seasonAvgPpg?: number | null;
}) {
  const recent = filterTeamGames(recentPool, team, brand, 8);
  const upcoming = filterTeamGames(upcomingPool, team, brand, 5);
  const notables = notableTeamGames(recent, team, brand, seasonAvgPpg);

  return (
    <div className="flex flex-col gap-5">
      {notables.length ? (
        <div>
          <h3 className="text-[14px] font-bold tracking-tight">
            Notable games
          </h3>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Transparent scoreboard dimensions from the recent slate — not Game
            Lab.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {notables.map((n) => (
              <li key={`${n.kind}-${n.game.id}`}>
                <Link
                  href={`/games/${n.game.id}`}
                  className="flex flex-col rounded-xl border border-border bg-white/45 px-3 py-2.5 hover:bg-white/70"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {n.label}
                  </span>
                  <span className="text-[14px] font-bold">{n.detail}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {n.game.gameDate} → Game Lab
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <GameList
        title="Recent games"
        empty="No recent games for this team in the scoreboard sample."
        games={recent}
        team={team}
        brand={brand}
      />

      <GameList
        title="Upcoming"
        empty="No upcoming tip-offs in the near scoreboard window."
        games={upcoming}
        team={team}
        brand={brand}
        upcoming
      />

      <p className="text-[13px] text-muted-foreground">
        <Link
          href="/scores"
          className="font-semibold underline-offset-2 hover:underline"
        >
          Open scores →
        </Link>
        <span className="mx-2">·</span>
        Team page is a gateway into Game Lab, not a duplicate.
      </p>
    </div>
  );
}

function GameList({
  title,
  empty,
  games,
  team,
  brand,
  upcoming,
}: {
  title: string;
  empty: string;
  games: GameSummary[];
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  upcoming?: boolean;
}) {
  return (
    <div>
      <h3 className="text-[14px] font-bold tracking-tight">{title}</h3>
      {games.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {games.map((g) => {
            const line = formatTeamGameScoreLine(g, team, brand);
            return (
              <li key={g.id}>
                <Link
                  href={`/games/${g.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[13px] hover:bg-secondary/40"
                >
                  <span className="font-semibold">
                    {g.gameDate}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {upcoming ? "vs" : line.result} {line.oppLabel}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {upcoming
                      ? g.statusDetail ?? "Scheduled"
                      : `${line.teamScore}–${line.oppScore} · Game Lab →`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

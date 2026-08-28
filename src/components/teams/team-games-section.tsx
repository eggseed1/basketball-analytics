import { TransitionLink } from "@/components/continuity/query-nav";

import type { GameSummary, TeamSeasonStats } from "@/data/types";
import type { TeamBrand } from "@/lib/nba-brand";
import {
  filterTeamGames,
  formatTeamGameScoreLine,
  notableTeamGames,
} from "@/lib/team-explorer";

function gameLabHref(gameId: string, season?: string): string {
  if (!season) return `/games/${gameId}`;
  return `/games/${encodeURIComponent(gameId)}?season=${encodeURIComponent(season)}`;
}

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
  const upcoming = filterTeamGames(upcomingPool, team, brand, 5, {
    order: "asc",
  });
  const notables = notableTeamGames(recent, team, brand, seasonAvgPpg);
  const season = team.season;

  return (
    <div className="flex flex-col gap-5">
      {notables.length ? (
        <div>
          <h3 className="text-[14px] font-bold tracking-tight">
            Notable games
          </h3>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Transparent scoreboard dimensions from the recent slate - not Game
            Lab.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {notables.map((n) => (
              <li key={`${n.kind}-${n.game.id}`}>
                <TransitionLink
                  href={gameLabHref(n.game.id, season)}
                  className="flex flex-col rounded-xl border border-border frost-surface px-3 py-2.5 frost-surface-hover"
                >
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {n.label}
                  </span>
                  <span className="text-[14px] font-bold">{n.detail}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {n.game.gameDate} → Game Lab
                  </span>
                </TransitionLink>
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
        season={season}
      />

      <GameList
        title="Upcoming"
        empty="No upcoming tip-offs in the near scoreboard window."
        games={upcoming}
        team={team}
        brand={brand}
        season={season}
        upcoming
      />

      <p className="text-[14px] text-muted-foreground">
        <TransitionLink
          href="/scores"
          className="font-semibold underline-offset-2 hover:underline"
        >
          Open scores →
        </TransitionLink>
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
  season,
  upcoming,
}: {
  title: string;
  empty: string;
  games: GameSummary[];
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  season?: string;
  upcoming?: boolean;
}) {
  return (
    <div>
      <h3 className="text-[14px] font-bold tracking-tight">{title}</h3>
      {games.length === 0 ? (
        <p className="mt-1 text-[14px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {games.map((g) => {
            const line = formatTeamGameScoreLine(g, team, brand);
            return (
              <li key={g.id}>
                <TransitionLink
                  href={gameLabHref(g.id, season)}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[14px] hover:bg-secondary/40"
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
                      : `${line.teamScore}-${line.oppScore} · Game Lab →`}
                  </span>
                </TransitionLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { TransitionLink } from "@/components/continuity/query-nav";
import { TextLink } from "@/components/ui/text-link";
import type { GameSummary, TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import type { TeamBrand } from "@/lib/nba-brand";
import {
  formatTeamGameScoreLine,
  gameInvolvesTeam,
} from "@/lib/team-explorer";
import { cn } from "@/lib/utils";

function gameLabHref(gameId: string, season: string): string {
  return `/games/${encodeURIComponent(gameId)}?season=${encodeURIComponent(season)}`;
}

export function PlayerUpcomingGames({
  season,
  team,
  brand,
  games,
  className,
}: {
  season: string;
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  games: GameSummary[];
  className?: string;
}) {
  // This is a forward-looking surface. The generic team helper sorts newest
  // first for recent-results views, which selected the end of the season here.
  // Keep only this team and sort earliest tip first.
  const upcoming = games
    .filter((game) => gameInvolvesTeam(game, team, brand))
    .slice()
    .sort((a, b) => {
      const ta = a.tipOffAt ?? a.gameDate;
      const tb = b.tipOffAt ?? b.gameDate;
      if (ta !== tb) return ta.localeCompare(tb);
      return a.id.localeCompare(b.id);
    })
    .slice(0, 5);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Upcoming games
        </p>
        <TextLink href="/scores" className={type.caption}>
          Scores →
        </TextLink>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {season} · {team.abbreviation}
      </p>
      {upcoming.length === 0 ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          No upcoming tip-offs scheduled in the near window.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {upcoming.map((game) => {
            const line = formatTeamGameScoreLine(game, team, brand);
            return (
              <li key={game.id}>
                <TransitionLink
                  href={gameLabHref(game.id, season)}
                  className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-md border border-border/60 frost-surface px-2 py-1.5 frost-surface-hover"
                >
                  <span className={cn(type.caption, "font-semibold")}>
                    <time className="tabular-nums">{game.gameDate}</time>
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      vs {line.oppLabel}
                    </span>
                  </span>
                  <span
                    className={cn(
                      type.caption,
                      "tabular-nums text-muted-foreground"
                    )}
                  >
                    {game.statusDetail ?? "Scheduled"}
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

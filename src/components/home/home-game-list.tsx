import Link from "next/link";

import { PlayerHeadshot } from "@/components/player/player-headshot";
import type { ScheduleGame } from "@/data/queries/home";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

export function HomeGameList({
  title,
  subtitle,
  games,
  emptyLabel,
  mode,
}: {
  title: string;
  subtitle: string;
  games: ScheduleGame[];
  emptyLabel: string;
  mode: "recent" | "upcoming";
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${mode}-heading`}>
      <div>
        <h2 id={`${mode}-heading`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {games.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {games.map((card) => (
            <li key={card.game.id}>
              <HomeGameRow card={card} mode={mode} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeGameRow({
  card,
  mode,
}: {
  card: ScheduleGame;
  mode: "recent" | "upcoming";
}) {
  const { game, leaders, statusText, gameLabel } = card;
  const away = nbaTeamAbbr(game.awayTeamId, game.awayTeamAbbr);
  const home = nbaTeamAbbr(game.homeTeamId, game.homeTeamAbbr);
  const href =
    mode === "recent" && !game.id.startsWith("upcoming-demo")
      ? `/games/${game.id}`
      : `/explore/games?season=${game.season}`;

  const named = leaders.slice(0, 2);
  const awayStarters = leaders.filter((p) => p.teamId === game.awayTeamId);
  const homeStarters = leaders.filter((p) => p.teamId === game.homeTeamId);

  return (
    <Link
      href={href}
      className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {game.gameDate}
            {gameLabel ? ` · ${gameLabel}` : null}
            {statusText ? ` · ${statusText}` : null}
          </p>
          <p className="mt-0.5 text-base font-medium tracking-tight">
            {mode === "recent" ? (
              <>
                <span className="tabular-nums">
                  {away} {game.awayScore}
                </span>
                <span className="mx-1.5 text-muted-foreground">@</span>
                <span className="tabular-nums">
                  {home} {game.homeScore}
                </span>
              </>
            ) : (
              <>
                <span>{away}</span>
                <span className="mx-1.5 text-muted-foreground">@</span>
                <span>{home}</span>
              </>
            )}
          </p>
        </div>
        {named.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {named.map((leader) => (
              <li key={`${leader.playerId}-name`} className="truncate">
                {leader.playerName}
                {leader.points != null ? (
                  <span className="tabular-nums">
                    {" "}
                    · {leader.points}
                    {mode === "upcoming" ? " PPG" : " PTS"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {leaders.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <StarterRow
            label={away}
            players={awayStarters}
            ariaLabel={`${away} starting five`}
          />
          <StarterRow
            label={home}
            players={homeStarters}
            ariaLabel={`${home} starting five`}
          />
        </div>
      ) : null}
    </Link>
  );
}

function StarterRow({
  label,
  players,
  ariaLabel,
}: {
  label: string;
  players: ScheduleGame["leaders"];
  ariaLabel: string;
}) {
  if (players.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-8 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <ul className="flex -space-x-1.5" aria-label={ariaLabel}>
        {players.map((player) => (
          <li key={player.playerId} title={player.playerName}>
            <PlayerHeadshot
              playerId={player.playerId}
              name={player.playerName}
              size="xs"
              className="ring-2 ring-background"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

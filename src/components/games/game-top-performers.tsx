import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { PlayerGame } from "@/data/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const PER_TEAM = 3;

function topScorers(players: PlayerGame[]): PlayerGame[] {
  return players
    .filter((p) => !p.didNotPlay && (p.minutes > 0 || p.points > 0))
    .sort(
      (a, b) =>
        b.points - a.points ||
        (b.gameScore ?? 0) - (a.gameScore ?? 0) ||
        b.minutes - a.minutes
    )
    .slice(0, PER_TEAM);
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="text-[17px] font-bold leading-tight tabular-nums">{value}</span>
      <span className={cn(type.micro, "font-semibold uppercase tracking-[0.08em] text-muted-foreground")}>
        {label}
      </span>
    </span>
  );
}

function PerformerRow({ p, teamKey }: { p: PlayerGame; teamKey: string }) {
  const name = p.playerName ?? p.playerId;
  const minutes = Math.round(p.minutes);
  return (
    <li className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <PlayerIdentity
          playerId={p.playerId}
          name={name}
          season={p.season}
          teamKey={teamKey}
          className={cn(type.bodySm, "min-w-0 font-semibold")}
        />
        <span className={cn(type.micro, "pl-11 tabular-nums text-muted-foreground")}>
          {p.fieldGoalsMade}-{p.fieldGoalsAttempted} FG
          {p.threePointersAttempted > 0
            ? ` · ${p.threePointersMade}-${p.threePointersAttempted} 3P`
            : ""}
          {minutes > 0 ? ` · ${minutes} min` : ""}
        </span>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2.5">
        <Stat value={p.points} label="Pts" />
        <Stat value={p.rebounds} label="Reb" />
        <Stat value={p.assists} label="Ast" />
      </div>
    </li>
  );
}

function TeamColumn({
  label,
  teamKey,
  color,
  players,
}: {
  label: string;
  teamKey: string;
  color: string;
  players: PlayerGame[];
}) {
  const top = topScorers(players);
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p
        className={cn(
          type.micro,
          "flex items-center gap-1.5 font-bold uppercase tracking-[0.12em] text-muted-foreground"
        )}
      >
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </p>
      {top.length ? (
        <ul className="flex flex-col gap-3">
          {top.map((p) => (
            <PerformerRow key={p.playerId} p={p} teamKey={teamKey} />
          ))}
        </ul>
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>No player lines yet.</p>
      )}
    </div>
  );
}

/** Leading scorers per team from the box score. */
export function GameTopPerformers({
  awayLabel,
  homeLabel,
  awayTeamKey,
  homeTeamKey,
  awayPlayers,
  homePlayers,
  colors,
}: {
  awayLabel: string;
  homeLabel: string;
  awayTeamKey: string;
  homeTeamKey: string;
  awayPlayers: PlayerGame[];
  homePlayers: PlayerGame[];
  colors: { away: string; home: string };
}) {
  return (
    <MatchupWashCard
      awayTeamKey={awayTeamKey}
      homeTeamKey={homeTeamKey}
      intensity="subtle"
      className="flex h-full flex-col gap-4 p-4 sm:p-5"
    >
      <h2 className={type.heading}>Top performers</h2>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 lg:grid-cols-1">
        <TeamColumn label={awayLabel} teamKey={awayTeamKey} color={colors.away} players={awayPlayers} />
        <TeamColumn label={homeLabel} teamKey={homeTeamKey} color={colors.home} players={homePlayers} />
      </div>
    </MatchupWashCard>
  );
}

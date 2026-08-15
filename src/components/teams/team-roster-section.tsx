import type { ReactNode } from "react";
import Link from "next/link";

import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { PlayerSeason } from "@/data/types";
import { formatNumber } from "@/lib/format";
import type { TeamRosterBuckets } from "@/lib/team-explorer";

function PlayerRow({
  player,
  season,
  teamKey,
  detail,
}: {
  player: PlayerSeason;
  season: string;
  teamKey: string;
  detail: string;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <PlayerIdentity
        playerId={player.playerId}
        name={player.playerName}
        teamKey={teamKey}
        teamLabel={teamKey}
        position={player.position}
        season={season}
        variant="compact"
        className="min-w-0 flex-1"
        nameClassName="w-full gap-3 no-underline hover:underline"
      />
      <span className="text-right text-[12px] tabular-nums text-muted-foreground">
        {detail}
      </span>
    </li>
  );
}

export function TeamRosterSection({
  buckets,
  season,
  teamKey,
  teamId,
}: {
  buckets: TeamRosterBuckets;
  season: string;
  teamKey: string;
  teamId: string;
}) {
  const empty =
    buckets.rotation.length === 0 &&
    buckets.leadingScorers.length === 0 &&
    buckets.highestValue.length === 0;

  if (empty) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No qualified roster rows for this team-season yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {buckets.highestValue.length ? (
        <Bucket
          title="Highest-value players"
          hint={
            <>
              <MetricHelp conceptId="darko">DARKO</MetricHelp> DPM when
              season-true on the board — not a team MVP score.
            </>
          }
        >
          {buckets.highestValue.map((p) => (
            <PlayerRow
              key={`val-${p.playerId}`}
              player={p}
              season={season}
              teamKey={teamKey}
              detail={`${formatNumber(p.darkoDpm!, 2)} DPM`}
            />
          ))}
        </Bucket>
      ) : null}

      <Bucket
        title="Leading scorers"
        hint="Points per game among qualified rotation pieces."
      >
        {buckets.leadingScorers.map((p) => (
          <PlayerRow
            key={`ppg-${p.playerId}`}
            player={p}
            season={season}
            teamKey={teamKey}
            detail={`${formatNumber(p.points / Math.max(1, p.gamesPlayed), 1)} PPG`}
          />
        ))}
      </Bucket>

      <Bucket
        title="Primary rotation"
        hint="Highest minutes — gateway into player pages."
      >
        {buckets.rotation.map((p) => (
          <PlayerRow
            key={`min-${p.playerId}`}
            player={p}
            season={season}
            teamKey={teamKey}
            detail={`${formatNumber(p.minutes / Math.max(1, p.gamesPlayed), 1)} MPG`}
          />
        ))}
      </Bucket>

      <p className="text-[13px] text-muted-foreground">
        <Link
          href={`/explore/players?team=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season)}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Full roster board →
        </Link>
        <span className="mx-2">·</span>
        Lineup nets and possession evidence are not available yet.
      </p>
    </div>
  );
}

function Bucket({
  title,
  hint,
  children,
}: {
  title: string;
  hint: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[14px] font-bold tracking-tight">{title}</h3>
      <p className="mb-1 text-[12px] text-muted-foreground">{hint}</p>
      <ul className="divide-y divide-border">{children}</ul>
    </div>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";

import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { PlayerSeason } from "@/data/types";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import { formatNumber } from "@/lib/format";
import type { TeamRosterBuckets } from "@/lib/team-explorer";

function valueDetail(player: PlayerSeason): string {
  if (hasValidDrblEstimate(player)) {
    const drbl = formatNumber(player.drbl100, 1);
    const war1 =
      player.r1WinEquivalents != null &&
      Number.isFinite(player.r1WinEquivalents)
        ? formatNumber(player.r1WinEquivalents, 1)
        : null;
    const darko =
      player.darkoDpm != null && Number.isFinite(player.darkoDpm)
        ? formatNumber(player.darkoDpm, 2)
        : null;
    const parts = [`${drbl} DRBL/100`];
    if (war1 != null) parts.push(`${war1} WAR1`);
    if (darko != null) parts.push(`${darko} DPM`);
    return parts.join(" · ");
  }
  if (player.darkoDpm != null && Number.isFinite(player.darkoDpm)) {
    return `${formatNumber(player.darkoDpm, 2)} DPM`;
  }
  return "-";
}

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
  status = "ok",
  unavailableMessage,
}: {
  buckets: TeamRosterBuckets;
  season: string;
  teamKey: string;
  teamId: string;
  /** Diagnosed board capability - never treat unsupported as “0 players”. */
  status?: "ok" | "unsupported" | "timeout" | "error";
  unavailableMessage?: string;
}) {
  if (status === "unsupported") {
    return (
      <p className="text-[14px] text-muted-foreground">
        {unavailableMessage ??
          `Historical roster data unavailable for ${season}.`}
      </p>
    );
  }

  if (status === "timeout" || status === "error") {
    return (
      <p className="text-[14px] text-muted-foreground">
        {unavailableMessage ??
          `Roster data unavailable for ${season}.`}
      </p>
    );
  }

  const empty =
    buckets.rotation.length === 0 &&
    buckets.leadingScorers.length === 0 &&
    buckets.highestValue.length === 0;

  if (empty) {
    return (
      <p className="text-[14px] text-muted-foreground">
        No qualified roster rows for this team-season yet.
      </p>
    );
  }

  const valueUsesDrbl = buckets.highestValue.some(hasValidDrblEstimate);

  return (
    <div className="flex flex-col gap-5">
      {buckets.highestValue.length ? (
        <Bucket
          title="Highest-value players"
          hint={
            valueUsesDrbl ? (
              <>
                <MetricHelp conceptId="drbl100">DRBL/100</MetricHelp> when
                available (ability rate);{" "}
                <MetricHelp conceptId="r1_win_eq">WAR1</MetricHelp>{" "}
                is realized season value.{" "}
                <MetricHelp conceptId="darko">DARKO</MetricHelp> shown as
                secondary context when present - rows do not sum to team value.
              </>
            ) : (
              <>
                <MetricHelp conceptId="darko">DARKO</MetricHelp> DPM when
                season-true on the board - not a team MVP score.
              </>
            )
          }
        >
          {buckets.highestValue.map((p) => (
            <PlayerRow
              key={`val-${p.playerId}`}
              player={p}
              season={season}
              teamKey={teamKey}
              detail={valueDetail(p)}
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
        hint="Highest minutes - gateway into player pages."
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

      <p className="text-[14px] text-muted-foreground">
        <Link
          href={`/explore/players?team=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season)}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Full roster board →
        </Link>
        <span className="mx-2">·</span>
        Lineup plus-minus and possession evidence are not available yet — use
        the Rotation tab for minutes-ranked playing time.
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

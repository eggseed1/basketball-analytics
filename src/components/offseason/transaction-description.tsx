"use client";

import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamIdentity } from "@/components/teams/team-identity";
import type {
  DescriptionPart,
  TransactionPlayerResolution,
} from "@/lib/transaction-player-resolution";
import { partitionTransactionDescription } from "@/lib/transaction-player-resolution";
import { canLinkTransactionPlayer } from "@/lib/transaction-player-link";

/**
 * ESPN free-text description with player/team mentions.
 * Played players and teams are hoverable + clickable.
 * Players who have never appeared in an NBA game are hoverable only.
 *
 * Mentions inherit the parent text size so call sites can use body-sm / caption
 * without PlayerIdentity / TeamIdentity forcing 16px body.
 */
export function TransactionDescription({
  description,
  resolutions,
  className,
}: {
  description: string;
  resolutions?: TransactionPlayerResolution[];
  className?: string;
}) {
  const parts: DescriptionPart[] = partitionTransactionDescription(
    description,
    resolutions ?? []
  );

  const mentionNameClass = "inline font-semibold";

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.kind === "text") {
          return <span key={`t-${i}`}>{part.text}</span>;
        }
        if (part.kind === "team") {
          return (
            <TeamIdentity
              key={`tm-${part.teamKey}-${i}`}
              teamKey={part.teamKey}
              label={part.label}
              className="inline-flex align-baseline"
              nameClassName={mentionNameClass}
            />
          );
        }
        const r = part.resolution;
        const played =
          r.status === "resolved" &&
          canLinkTransactionPlayer(r.playerId) &&
          Boolean(r.playerId);
        const name = r.playerName ?? r.mention.rawName;
        return (
          <PlayerIdentity
            key={`p-${r.playerId ?? r.mention.rawName}-${i}`}
            playerId={r.playerId ?? undefined}
            name={name}
            teamKey={r.teamKey}
            teamLabel={r.teamKey}
            href={r.href ?? undefined}
            hasPlayedNba={played}
            variant="compact"
            className="inline-flex max-w-none align-baseline"
            nameClassName={mentionNameClass}
          >
            {name}
          </PlayerIdentity>
        );
      })}
    </p>
  );
}

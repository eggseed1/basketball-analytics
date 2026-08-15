"use client";

import { PlayerIdentity } from "@/components/players/player-identity";
import type {
  DescriptionPart,
  TransactionPlayerResolution,
} from "@/lib/transaction-player-resolution";
import { partitionTransactionDescription } from "@/lib/transaction-player-resolution";
import { canLinkTransactionPlayer } from "@/lib/transaction-player-link";

/**
 * ESPN free-text description with PlayerIdentity only for resolved mentions.
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
  const parts: DescriptionPart[] = resolutions?.length
    ? partitionTransactionDescription(description, resolutions)
    : [{ kind: "text", text: description }];

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.kind === "text") {
          return <span key={`t-${i}`}>{part.text}</span>;
        }
        const r = part.resolution;
        if (
          r.status !== "resolved" ||
          !canLinkTransactionPlayer(r.playerId) ||
          !r.playerId ||
          !r.playerName
        ) {
          return <span key={`u-${i}`}>{r.mention.rawName}</span>;
        }
        return (
          <PlayerIdentity
            key={`p-${r.playerId}-${i}`}
            playerId={r.playerId}
            name={r.playerName}
            teamKey={r.teamKey}
            teamLabel={r.teamKey}
            href={r.href ?? undefined}
            variant="compact"
            className="inline-flex align-baseline"
            nameClassName="inline font-semibold underline-offset-2 hover:underline"
          >
            <span className="font-semibold underline-offset-2 hover:underline">
              {r.playerName}
            </span>
          </PlayerIdentity>
        );
      })}
    </p>
  );
}

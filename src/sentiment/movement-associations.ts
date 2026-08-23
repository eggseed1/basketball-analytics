import { isResolvedMovementState } from "@/movement-center/cluster-state";
import { readMovementSnapshotSync } from "@/movement-center/read-snapshot";
import type { PlayerSentimentProfile } from "@/sentiment/curated-types";

import { expandPlayerIdAliases } from "./narrative-hygiene";

function associationExplanation(headline: string, resolved: boolean): string {
  if (resolved) {
    return `Sentiment shifts are associated with the completed movement story: “${headline}”.`;
  }
  return `Fan and media volume is associated with ongoing movement reporting: “${headline}”.`;
}

/**
 * Attach movement cluster associations to profiles that lack one (S3 scaffold).
 * Uses associative language only — never implies causation.
 */
export async function enrichProfilesWithMovementAssociations(
  profiles: PlayerSentimentProfile[]
): Promise<PlayerSentimentProfile[]> {
  const movement = readMovementSnapshotSync();
  if (!movement) return profiles;

  const aliasCache = new Map<string, Set<string>>();
  const aliasesFor = async (playerIds: string[]) => {
    const key = playerIds.slice().sort().join("|");
    if (!aliasCache.has(key)) {
      aliasCache.set(key, await expandPlayerIdAliases(new Set(playerIds)));
    }
    return aliasCache.get(key)!;
  };

  return Promise.all(
    profiles.map(async (profile) => {
      if (profile.association) return profile;
      const aliases = await aliasesFor(profile.playerIds);
      const matches = movement.clusters
        .filter((cluster) =>
          cluster.linkedPlayerIds.some((id) => aliases.has(id))
        )
        .sort((a, b) => {
          const aResolved = isResolvedMovementState(a.state);
          const bResolved = isResolvedMovementState(b.state);
          if (aResolved !== bResolved) return aResolved ? 1 : -1;
          return b.lastMeaningfulAt.localeCompare(a.lastMeaningfulAt);
        });
      const top = matches[0];
      if (!top) return profile;
      return {
        ...profile,
        association: {
          explanation: associationExplanation(
            top.headline,
            isResolvedMovementState(top.state)
          ),
          eventKind: "movement_story",
          eventRef: top.id,
        },
      };
    })
  );
}

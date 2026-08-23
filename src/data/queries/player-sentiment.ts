import "server-only";

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { getPlayerSentimentProfile } from "@/sentiment/load-curated";

export const getPlayerSentimentBundle = cache(async (playerId: string) => {
  const identity = await resolvePlayerIdentityCached(playerId);
  const ids = new Set<string>([playerId]);
  if (identity.nbaId) ids.add(identity.nbaId);
  if (identity.espnId) ids.add(identity.espnId);
  return getPlayerSentimentProfile(ids);
});

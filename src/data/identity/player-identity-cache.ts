import { cache } from "react";

import { resolvePlayerIdentity } from "@/data/identity/player-identity";

/** Request-scoped memo for alias resolution (page + islands + enrich). */
export const resolvePlayerIdentityCached = cache((playerId: string) =>
  resolvePlayerIdentity(playerId)
);

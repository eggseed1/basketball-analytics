/**
 * Resolve a baked snapshot's open stories against newer ledger rows.
 *
 * The snapshot is built at deploy or by the daily sync, but ESPN posts
 * signings and trades in between. This applies the build's own matching
 * rule (`linkLedger`) to the stories that were still open, so a story
 * moves to completed as soon as its transaction shows up on /offseason.
 *
 * Pure: callers pass ledger rows and a player name lookup.
 */

import type { MovementFamily } from "@/movement-center/classify-headline";
import { linkLedger, type LedgerRow } from "@/movement-center/transaction-clusters";
import type { MovementCuratedSnapshot } from "@/movement-center/types";
import { createHeadlineEntityResolver, ESPN_TEAM_NICKNAMES } from "@/sentiment/headline-entities";

const NO_STANDALONE_TRADES = "9999-12-31";

function familyOf(clusterId: string): MovementFamily | null {
  const family = clusterId.split("-")[1];
  return family === "trade" || family === "contract" ? family : null;
}

export function resolveOpenStoriesWithLedger(
  snapshot: MovementCuratedSnapshot,
  ledger: LedgerRow[],
  playerName: (playerId: string) => string | undefined,
  now: Date = new Date()
): MovementCuratedSnapshot {
  const families = new Map<string, MovementFamily>();
  const open = snapshot.clusters
    .filter((c) => c.state === "unresolved")
    .flatMap((c) => {
      const family = familyOf(c.id);
      if (!family) return [];
      families.set(c.id, family);
      return [structuredClone(c)];
    });
  if (!open.length) return snapshot;

  const usedClaimIds = new Set(snapshot.claims.map((c) => c.id));
  const fresh = ledger.filter((row) => !usedClaimIds.has(`mv-${row.id}`));
  if (!fresh.length) return snapshot;

  const roster = [...new Set(open.flatMap((c) => c.linkedPlayerIds))].flatMap((playerId) => {
    const name = playerName(playerId);
    return name ? [{ playerId, name }] : [];
  });
  const linked = linkLedger(
    {
      newsClusters: open,
      newsClaims: [],
      families,
      ledger: fresh,
      tradeWindowStart: NO_STANDALONE_TRADES,
      now,
    },
    {
      resolveText: createHeadlineEntityResolver(roster, { fullNamesOnly: true }),
      playerName,
      teamName: (id) => ESPN_TEAM_NICKNAMES[id]?.[0],
    }
  );
  if (!linked.materialized && !linked.expired) return snapshot;

  const updated = new Map(linked.clusters.map((c) => [c.id, c]));
  const latestRow = fresh.map((row) => row.date).sort().at(-1) ?? null;
  const latest = [snapshot.meta.latestTransactionDate, latestRow].filter(Boolean).sort().at(-1) ?? null;
  return {
    ...snapshot,
    meta: { ...snapshot.meta, latestTransactionDate: latest },
    sources: { ...snapshot.sources, ...linked.sources },
    clusters: snapshot.clusters.map((c) => updated.get(c.id) ?? c),
    claims: [...snapshot.claims, ...linked.claims],
    resolutions: [...(snapshot.resolutions ?? []), ...linked.resolutions],
  };
}

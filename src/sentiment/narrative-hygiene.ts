import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import { completedTradePlayerIds } from "@/movement-center/resolutions";
import { readMovementSnapshotSync } from "@/movement-center/read-snapshot";
import type { LeagueSentimentSnapshot } from "@/sentiment/curated-types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function expandPlayerIdAliases(ids: Set<string>): Promise<Set<string>> {
  const out = new Set(ids);
  for (const id of ids) {
    const identity = await resolvePlayerIdentity(id).catch(() => null);
    if (!identity) continue;
    if (identity.nbaId) out.add(identity.nbaId);
    if (identity.espnId) out.add(identity.espnId);
    if (identity.routeId) out.add(identity.routeId);
  }
  return out;
}

export function applyTradeSpeculationHygiene(
  league: LeagueSentimentSnapshot,
  excludePlayerIds: Set<string>
): LeagueSentimentSnapshot {
  const narratives = league.narratives.map((narrative) => {
    if (narrative.slug !== "trade_speculation") return narrative;

    const players = narrative.players.filter(
      (player) => !excludePlayerIds.has(player.playerId)
    );
    if (players.length === narrative.players.length) return narrative;

    const totalShare = players.reduce(
      (sum, player) => sum + player.narrativeShare,
      0
    );
    const normalized = players.map((player) => ({
      ...player,
      narrativeShare:
        totalShare > 0
          ? round2(player.narrativeShare / totalShare)
          : player.narrativeShare,
    }));

    return { ...narrative, players: normalized };
  });

  return { ...league, narratives };
}

export async function hydrateLeagueNarrativeHygiene(
  league: LeagueSentimentSnapshot
): Promise<LeagueSentimentSnapshot> {
  const movement = readMovementSnapshotSync();
  const resolvedIds = await expandPlayerIdAliases(
    completedTradePlayerIds(movement)
  );
  return applyTradeSpeculationHygiene(league, resolvedIds);
}

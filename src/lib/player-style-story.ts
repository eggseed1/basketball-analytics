/**
 * Pure helpers for the full-width player Style story section.
 */
import type { PlayerSeason } from "@/data/types";
import type { PlayerRoleAssignment, ShotDietKind } from "@/lib/player-role";

export type StylePeerDot = {
  playerId: string;
  usagePct: number;
  assistPct: number;
};

export type StyleEvidenceTile = {
  id: string;
  label: string;
  display: string;
  /** 0–100 league percentile among qualified peers, when known. */
  percentile: number | null;
};

export type StyleStoryModel = {
  role: PlayerRoleAssignment;
  /** Peers for the creation scatter (capped). */
  peers: StylePeerDot[];
  evidence: StyleEvidenceTile[];
  /** 0 = lives inside, 1 = perimeter. */
  dietPosition: number;
  dietLabel: string;
  usagePct: number | null;
  assistPct: number | null;
};

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

function percentileOf(value: number, pool: number[]): number | null {
  if (!pool.length || !Number.isFinite(value)) return null;
  const below = pool.filter((v) => v < value).length;
  return (below / pool.length) * 100;
}

/** Map diet + 3PAr onto an inside→perimeter continuum. */
export function dietContinuumPosition(
  diet: ShotDietKind,
  threePar: number | null | undefined
): number {
  const byDiet: Partial<Record<ShotDietKind, number>> = {
    rim: 0.08,
    paint: 0.18,
    inside: 0.16,
    mid: 0.42,
    hybrid: 0.5,
    corner: 0.78,
    above_break: 0.82,
    perimeter: 0.88,
  };
  const base = byDiet[diet] ?? 0.5;
  const three = finite(threePar);
  if (three == null) return base;
  // Blend diet label with measured 3PAr so the marker tracks the season.
  return Math.max(0, Math.min(1, base * 0.55 + three * 0.45));
}

export function buildStyleStoryModel(options: {
  role: PlayerRoleAssignment;
  row: PlayerSeason;
  peerBoard: PlayerSeason[];
  playerId: string;
}): StyleStoryModel {
  const { role, row, peerBoard, playerId } = options;
  const qualified = peerBoard.filter((peer) => {
    if (peer.gamesPlayed < 20) return false;
    const mpg = peer.minutes / Math.max(1, peer.gamesPlayed);
    if (mpg < 16) return false;
    return (
      finite(peer.usagePct) != null && finite(peer.assistPct) != null
    );
  });

  const usgPool = qualified
    .map((p) => p.usagePct!)
    .filter((n) => Number.isFinite(n));
  const astPool = qualified
    .map((p) => p.assistPct!)
    .filter((n) => Number.isFinite(n));
  const threePool = qualified
    .map((p) => p.threePointAttemptRate)
    .filter((n): n is number => n != null && Number.isFinite(n));

  const evidence: StyleEvidenceTile[] = role.evidence.map((bit) => {
    let percentile: number | null = null;
    if (bit.id === "usg" && finite(row.usagePct) != null) {
      percentile = percentileOf(row.usagePct!, usgPool);
    } else if (bit.id === "ast" && finite(row.assistPct) != null) {
      percentile = percentileOf(row.assistPct!, astPool);
    } else if (bit.id === "three" && finite(row.threePointAttemptRate) != null) {
      percentile = percentileOf(row.threePointAttemptRate!, threePool);
    }
    return { ...bit, percentile };
  });

  // Cap scatter density; keep the focus player out of the cloud.
  const peers: StylePeerDot[] = [];
  for (const peer of qualified) {
    if (peer.playerId === playerId) continue;
    peers.push({
      playerId: peer.playerId,
      usagePct: peer.usagePct!,
      assistPct: peer.assistPct!,
    });
    if (peers.length >= 140) break;
  }

  return {
    role,
    peers,
    evidence,
    dietPosition: dietContinuumPosition(
      role.diet,
      row.threePointAttemptRate
    ),
    dietLabel: role.dietLine,
    usagePct: finite(row.usagePct),
    assistPct: finite(row.assistPct),
  };
}

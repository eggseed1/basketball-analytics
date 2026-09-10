/**
 * Usage × true shooting scatter for a player season among qualified peers.
 */
import type { PlayerSeason } from "@/data/types";

export type UsageEfficiencyPoint = {
  playerId: string;
  playerName: string;
  teamId?: string;
  teamAbbr?: string;
  /** 0–1 fraction */
  usagePct: number;
  /** 0–1 fraction */
  trueShootingPct: number;
  minutes: number;
  isSelf: boolean;
};

function isQualified(row: PlayerSeason, minMinutes: number): boolean {
  if (minMinutes <= 0) return true;
  return Number.isFinite(row.minutes) && row.minutes >= minMinutes;
}

export function buildUsageEfficiencyPoints(
  peers: PlayerSeason[],
  focalIds: ReadonlySet<string>,
  options: { minMinutes?: number; forceIncludeIds?: ReadonlySet<string> } = {}
): UsageEfficiencyPoint[] {
  const minMinutes = options.minMinutes ?? 500;
  const forceInclude = options.forceIncludeIds ?? focalIds;
  const out: UsageEfficiencyPoint[] = [];
  for (const row of peers) {
    const forced = forceInclude.has(row.playerId);
    if (!forced && !isQualified(row, minMinutes)) continue;
    const usg = row.usagePct;
    const ts = row.trueShootingPct;
    if (usg == null || !Number.isFinite(usg) || usg <= 0) continue;
    if (ts == null || !Number.isFinite(ts) || ts <= 0) continue;
    // Normalize accidental 0–100 storage to 0–1.
    const usagePct = usg > 1 ? usg / 100 : usg;
    const trueShootingPct = ts > 1 ? ts / 100 : ts;
    if (!forced && (usagePct > 0.6 || trueShootingPct > 0.9)) continue;
    out.push({
      playerId: row.playerId,
      playerName: row.playerName,
      teamId: row.teamId,
      teamAbbr: row.teamAbbreviation,
      usagePct,
      trueShootingPct,
      minutes: row.minutes,
      isSelf: focalIds.has(row.playerId),
    });
  }
  return out;
}

export function usageEfficiencyMedians(points: UsageEfficiencyPoint[]): {
  usage: number | null;
  ts: number | null;
} {
  if (!points.length) return { usage: null, ts: null };
  const usg = [...points.map((p) => p.usagePct)].sort((a, b) => a - b);
  const ts = [...points.map((p) => p.trueShootingPct)].sort((a, b) => a - b);
  const mid = Math.floor(usg.length / 2);
  return {
    usage:
      usg.length % 2
        ? usg[mid]!
        : (usg[mid - 1]! + usg[mid]!) / 2,
    ts:
      ts.length % 2 ? ts[mid]! : (ts[mid - 1]! + ts[mid]!) / 2,
  };
}

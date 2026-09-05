/**
 * Bundled Movement Center curated snapshot for Cloudflare Workers (no node:fs).
 */
import snapshot from "./movement-snapshot.json";
import type { MovementCuratedSnapshot } from "@/movement-center/types";

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  snapshot?: MovementCuratedSnapshot;
};

const data = snapshot as SnapshotFile;

export function runtimeMovementMeta() {
  return {
    generatedAt: data.generatedAt ?? null,
    source: data.source ?? null,
    clusterCount: data.snapshot?.clusters?.length ?? 0,
  };
}

export function getRuntimeMovementSnapshot(): MovementCuratedSnapshot | null {
  const snap = data.snapshot;
  if (!snap || !Array.isArray(snap.clusters)) return null;
  return snap;
}

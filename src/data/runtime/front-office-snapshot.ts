/**
 * Bundled front-office team slices for Cloudflare Workers (no node:fs).
 */
import snapshot from "./front-office-snapshot.json";

type TeamSlice = {
  meta: Record<string, unknown>;
  cap: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  team: Record<string, unknown>;
};

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  manifest?: Record<string, unknown>;
  teams?: Record<string, TeamSlice>;
};

const data = snapshot as SnapshotFile;
const teams = data.teams ?? {};

export function runtimeFrontOfficeMeta() {
  return {
    generatedAt: data.generatedAt ?? null,
    source: data.source ?? null,
    teamCount: Object.keys(teams).length,
    manifest: data.manifest ?? null,
  };
}

export function getRuntimeFrontOfficeSlice(
  franchiseId: string
): TeamSlice | null {
  const id = String(franchiseId ?? "").trim();
  if (!id) return null;
  return teams[id] ?? null;
}

export function getRuntimeFrontOfficeManifest() {
  return data.manifest ?? null;
}

export function hasRuntimeFrontOffice(): boolean {
  return Object.keys(teams).length > 0;
}

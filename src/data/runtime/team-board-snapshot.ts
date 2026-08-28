/**
 * Bundled ESPN by-team payloads for Cloudflare Workers (no node:fs).
 */
import snapshot from "./team-board-snapshot.json";

type ByTeamPayload = {
  teams?: unknown[];
  categories?: unknown[];
};

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  seasons?: Record<string, ByTeamPayload>;
};

const data = snapshot as SnapshotFile;
const seasons = data.seasons ?? {};

export function runtimeTeamBoardMeta() {
  return {
    generatedAt: data.generatedAt ?? null,
    source: data.source ?? null,
    seasons: Object.keys(seasons),
  };
}

export function getRuntimeTeamBoardPayload(
  season: string
): ByTeamPayload | null {
  const hit = seasons[season];
  if (!hit || !Array.isArray(hit.teams) || hit.teams.length === 0) return null;
  return hit;
}

export function hasRuntimeTeamBoard(season: string): boolean {
  return getRuntimeTeamBoardPayload(season) != null;
}

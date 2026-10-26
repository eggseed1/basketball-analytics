/**
 * Bundled ESPN by-team payloads.
 *
 * JSON is copied to public/runtime for Workers Static Assets — do not
 * static-import (inlines into the origin script).
 */
import { loadRuntimeJson } from "./load-runtime-json";

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

type Loaded = {
  data: SnapshotFile;
  seasons: Record<string, ByTeamPayload>;
};

let loaded: Loaded | null = null;
let loadPromise: Promise<Loaded> | null = null;

const EMPTY: SnapshotFile = {};

async function ensureLoaded(): Promise<Loaded> {
  if (loaded) return loaded;
  if (!loadPromise) {
    loadPromise = (async () => {
      const data =
        (await loadRuntimeJson<SnapshotFile>("team-board-snapshot.json")) ??
        EMPTY;
      loaded = { data, seasons: data.seasons ?? {} };
      return loaded;
    })();
  }
  return loadPromise;
}

export async function runtimeTeamBoardMeta() {
  const { data, seasons } = await ensureLoaded();
  return {
    generatedAt: data.generatedAt ?? null,
    source: data.source ?? null,
    seasons: Object.keys(seasons),
  };
}

export async function getRuntimeTeamBoardPayload(
  season: string
): Promise<ByTeamPayload | null> {
  const { seasons } = await ensureLoaded();
  const hit = seasons[season];
  if (!hit || !Array.isArray(hit.teams) || hit.teams.length === 0) return null;
  return hit;
}

export async function hasRuntimeTeamBoard(season: string): Promise<boolean> {
  return (await getRuntimeTeamBoardPayload(season)) != null;
}

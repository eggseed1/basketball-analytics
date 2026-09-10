/**
 * Bundled ESPN conference standings for Cloudflare Workers (no node:fs).
 */
import snapshot from "./standings-snapshot.json";
import type { LeagueStandings } from "@/data/types/standings";

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  seasons?: Record<string, LeagueStandings>;
};

const data = snapshot as SnapshotFile;
const seasons = data.seasons ?? {};

export function runtimeStandingsMeta() {
  return {
    generatedAt: data.generatedAt ?? null,
    source: data.source ?? null,
    seasons: Object.keys(seasons),
  };
}

export function getRuntimeStandings(season: string): LeagueStandings | null {
  const hit = seasons[season];
  if (!hit?.conferences?.length) return null;
  const rowCount = hit.conferences.reduce(
    (count, conference) => count + conference.rows.length,
    0
  );
  return rowCount > 0 ? hit : null;
}

export function hasRuntimeStandings(season: string): boolean {
  return getRuntimeStandings(season) != null;
}

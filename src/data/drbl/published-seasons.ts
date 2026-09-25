/**
 * Pure helpers for runtime-published DRBL seasons (nightly bake sidecar).
 * Kept freestanding so unit tests do not depend on bundled JSON imports.
 */

export type DrblPublishedSeasonsFile = {
  minGames?: number;
  seasons?: Record<string, { gamesProcessed?: number; players?: number }>;
};

export function publishedMinGames(file: DrblPublishedSeasonsFile): number {
  const n = Number(file.minGames);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export function seasonsFromPublishedFile(
  file: DrblPublishedSeasonsFile
): string[] {
  const min = publishedMinGames(file);
  const out: string[] = [];
  for (const [season, meta] of Object.entries(file.seasons ?? {})) {
    const games = Number(meta?.gamesProcessed) || 0;
    if (games >= min) out.push(season);
  }
  return out.sort();
}

export function isSeasonInPublishedFile(
  file: DrblPublishedSeasonsFile,
  season: string
): boolean {
  return seasonsFromPublishedFile(file).includes(season);
}

export function mergeDrblSeasonLists(
  registrySeasons: string[],
  publishedSeasons: string[]
): string[] {
  return [...new Set([...registrySeasons, ...publishedSeasons])].sort();
}

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Game } from "@/data/types";

export type RuntimeGameSnapshot = {
  generatedAt: string | null;
  source: string;
  seasons?: string[];
  games: Game[];
};

function loadSnapshot(): RuntimeGameSnapshot {
  // Keep this off the JS module graph so Cloudflare Workers script size stays
  // under the free-plan limit. File is still shipped via output file tracing.
  const filePath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "src/data/runtime/game-snapshot.json"
  );
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as RuntimeGameSnapshot;
    if (Array.isArray(parsed?.games)) return parsed;
  } catch {
    // Fall through to empty snapshot when the file is unavailable.
  }
  return {
    generatedAt: null,
    source: "missing-runtime-snapshot",
    games: [],
  };
}

const data = loadSnapshot();
const games = Array.isArray(data.games) ? data.games : [];
const byId = new Map(games.map((game) => [String(game.id), game] as const));

export function runtimeGameSnapshotMeta() {
  return {
    generatedAt: data.generatedAt,
    source: data.source,
    gameCount: games.length,
  };
}

export function getRuntimeSnapshotGame(gameId: string): Game | null {
  return byId.get(String(gameId ?? "").trim()) ?? null;
}

export function getRuntimeSnapshotGames(season?: string): Game[] {
  if (!season) return games;
  return games.filter((game) => game.season === season);
}

export function getRuntimeSnapshotWindow(options: {
  season?: string;
  fromDate?: string;
  toDate?: string;
  status?: Game["status"] | Game["status"][];
} = {}): Game[] {
  const statuses = options.status
    ? new Set(Array.isArray(options.status) ? options.status : [options.status])
    : null;
  return games.filter((game) => {
    if (options.season && game.season !== options.season) return false;
    if (options.fromDate && game.gameDate < options.fromDate) return false;
    if (options.toDate && game.gameDate > options.toDate) return false;
    if (statuses && !statuses.has(game.status)) return false;
    return true;
  });
}

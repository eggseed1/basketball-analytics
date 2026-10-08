/**
 * Archived per-game files: raw NBA box scores and play-by-play
 * (games/{nbaGameId}/{boxscore,playbyplay}.json) and the ESPN play-by-play bake
 * (play-by-play/{espnGameId}.json). Both trees are gitignored, so a local
 * checkout reads them from disk and Workers read the GAME_ARCHIVE R2 bucket
 * (scripts/upload-game-archive-r2.mjs) with the same keys.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

type ArchiveBucket = {
  get: (key: string) => Promise<{ json<T>(): Promise<T> } | null>;
};

export type RawGameFile = "boxscore.json" | "playbyplay.json";

function archiveBucket(): ArchiveBucket | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { GAME_ARCHIVE?: ArchiveBucket } };
    };
    return getCloudflareContext()?.env?.GAME_ARCHIVE ?? null;
  } catch {
    return null;
  }
}

export function rawGamesRoot(): string {
  return process.env.DRBL_DATA_ROOT?.trim() || path.join(process.cwd(), "data", "drbl", "raw");
}

async function readDiskJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readBucketJson<T>(key: string): Promise<T | null> {
  try {
    const object = await archiveBucket()?.get(key);
    return object ? await object.json<T>() : null;
  } catch {
    return null;
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** A raw NBA game file from local disk, else the R2 archive. */
export async function readRawGameFile<T = unknown>(
  gameId: string,
  file: RawGameFile
): Promise<T | null> {
  const id = String(gameId ?? "").trim();
  if (!SAFE_ID.test(id)) return null;
  return (
    (await readDiskJson<T>(path.join(rawGamesRoot(), "games", id, file))) ??
    (await readBucketJson<T>(`games/${id}/${file}`))
  );
}

/** A baked ESPN play-by-play file from the R2 archive. */
export async function readArchivedPlayByPlay<T = unknown>(gameId: string): Promise<T | null> {
  const id = String(gameId ?? "").trim();
  if (!SAFE_ID.test(id)) return null;
  return readBucketJson<T>(`play-by-play/${id}.json`);
}

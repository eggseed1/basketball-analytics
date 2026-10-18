/**
 * Record book snapshot.
 *
 * The JSON lives in public/runtime so it is a static asset, not part of the
 * Worker script. Importing it pushed the upload past the 60 MiB warning.
 * Node reads the file. Workers read the same path through the assets binding.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RecordBook } from "@/lib/record-book";

const RELATIVE = ["public", "runtime", "record-book.json"] as const;

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const EMPTY: RecordBook = {
  builtAt: null,
  source: "missing",
  fromSeason: "1946-47",
  throughSeason: null,
  throughDate: null,
  regularSeasonGames: 0,
  playoffGames: 0,
  playerGameRows: 0,
  seasons: [],
  note: "The book is still being counted.",
  records: [],
  shapes: [],
};

let cached: RecordBook | null = null;

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function readLocal(): RecordBook | null {
  try {
    const file = path.join(process.cwd(), ...RELATIVE);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as RecordBook;
  } catch {
    return null;
  }
}

async function readAssets(): Promise<RecordBook | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch("https://assets.local/runtime/record-book.json");
    if (!response.ok) return null;
    return (await response.json()) as RecordBook;
  } catch {
    return null;
  }
}

export async function getRecordBook(): Promise<RecordBook> {
  if (cached) return cached;
  const book = readLocal() ?? (await readAssets()) ?? EMPTY;
  cached = book;
  return book;
}

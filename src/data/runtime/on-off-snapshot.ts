/**
 * NBA team on/off splits per player.
 * Lives under public/runtime (ASSETS) so the ~160KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 *
 * Built by scripts/build-runtime-playtype-onoff-snapshot.py.
 * Row: [nbaId, teamId, gp, onMin, onOrtg, onDrtg, offMin, offOrtg, offDrtg]
 */
import { NBA_TEAM_META } from "@/data/providers/nba/nba-team-meta";

type OnOffFile = {
  version?: number;
  generatedAt?: string;
  seasons?: Record<
    string,
    Array<[string, string, number, number, number, number, number, number, number]>
  >;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/on-off-snapshot.json";

let data: OnOffFile | null | undefined;

export type OnOffSide = {
  minutes: number;
  ortg: number;
  drtg: number;
  net: number;
};

export type PlayerOnOffStint = {
  season: string;
  nbaTeamId: string;
  teamAbbr: string | null;
  gamesPlayed: number;
  on: OnOffSide;
  off: OnOffSide;
};

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

function loadFromPublicDir(): OnOffFile | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "on-off-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as OnOffFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<OnOffFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as OnOffFile;
  } catch {
    return null;
  }
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) data = file;
}

export async function ensureOnOffSnapshot(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    data = fromDisk;
    return true;
  }
  data = await loadFromAssets();
  return data != null;
}

const side = (minutes: number, ortg: number, drtg: number): OnOffSide => ({
  minutes,
  ortg,
  drtg,
  net: Math.round((ortg - drtg) * 10) / 10,
});

/** One row per team the player suited up for, most on-court minutes first. */
export function getPlayerOnOff(
  season: string,
  playerIds: Array<string | null | undefined>
): PlayerOnOffStint[] {
  tryPrimeFromDisk();
  const ids = new Set(playerIds.filter((id): id is string => Boolean(id)));
  if (!ids.size) return [];
  return (data?.seasons?.[season] ?? [])
    .filter((row) => ids.has(String(row[0])))
    .map(([, teamId, gp, onMin, onO, onD, offMin, offO, offD]) => ({
      season,
      nbaTeamId: String(teamId),
      teamAbbr: NBA_TEAM_META[String(teamId)]?.abbreviation ?? null,
      gamesPlayed: gp,
      on: side(onMin, onO, onD),
      off: side(offMin, offO, offD),
    }))
    .sort((a, b) => b.on.minutes - a.on.minutes);
}

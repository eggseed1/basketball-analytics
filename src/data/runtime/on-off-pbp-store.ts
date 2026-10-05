/**
 * Possession-level on/off files baked by scripts/build-runtime-onoff.ts into
 * public/runtime/on-off/{season}/. Served as static assets on Cloudflare so
 * they stay out of the Worker bundle.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { LeagueOnOffFile, OnOffManifest, OnOffPhase, TeamOnOffFile } from "@/lib/on-off/types";
import { ON_OFF_FILE_VERSION, onOffDir } from "@/lib/on-off/types";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => {
        env?: { ASSETS?: AssetsFetcher };
      };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

const cache = new Map<string, Promise<unknown>>();

async function loadJson<T>(relative: string): Promise<T | null> {
  const local = path.join(process.cwd(), "public", "runtime", "on-off", relative);
  try {
    if (existsSync(local)) return JSON.parse(readFileSync(local, "utf8")) as T;
  } catch {
    // fall through to assets
  }
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const res = await assets.fetch(`https://assets.local/runtime/on-off/${relative}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function cached<T>(relative: string): Promise<T | null> {
  let hit = cache.get(relative) as Promise<T | null> | undefined;
  if (!hit) {
    hit = loadJson<T>(relative).then((json) => {
      if (json == null) cache.delete(relative);
      return json;
    });
    cache.set(relative, hit);
  }
  return hit;
}

const validSeason = (season: string) => /^\d{4}-\d{2}$/.test(season);

export async function getOnOffManifest(): Promise<OnOffManifest | null> {
  return cached<OnOffManifest>("manifest.json");
}

export async function getTeamOnOff(
  season: string,
  nbaTeamId: string,
  phase: OnOffPhase = "regular"
): Promise<TeamOnOffFile | null> {
  if (!validSeason(season) || !/^\d+$/.test(nbaTeamId)) return null;
  const file = await cached<TeamOnOffFile>(`${onOffDir(season, phase)}/${nbaTeamId}.json`);
  return file?.version === ON_OFF_FILE_VERSION ? file : null;
}

export async function getLeagueOnOff(
  season: string,
  phase: OnOffPhase = "regular"
): Promise<LeagueOnOffFile | null> {
  if (!validSeason(season)) return null;
  const file = await cached<LeagueOnOffFile>(`${onOffDir(season, phase)}/league.json`);
  return file?.version === ON_OFF_FILE_VERSION ? file : null;
}

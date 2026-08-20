/**
 * Offline media sync for newly canonicalized players (P18B.5.3).
 * Validates typed NBA/ESPN CDN assets and promotes into portrait-lookup.
 * No runtime network probing in the app — call from precompute/sync only.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const PLACEHOLDER_SHA = new Set([
  "b3ebe78bfd1cecb8880e51e6a48c9093c5cfb7065f981826d12fb4c01a1b0965",
]);
const SIZE_FLOOR = 8000;
const UA = "basketball-analytics/player-media-sync";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function nbaUrl(id: string) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
}
function espnUrl(id: string) {
  return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
}

async function validate(url: string) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) return null;
    if (PLACEHOLDER_SHA.has(sha(buf)) || buf.length < SIZE_FLOOR) return null;
    if (!String(r.headers.get("content-type") ?? "").includes("image")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export type MediaSyncPlayer = {
  nbaId: string;
  espnId?: string | null;
};

/**
 * Promote verified typed CDN portraits for the given players into portrait-lookup.
 */
export async function syncPlayerMediaForNewCanonicalPlayers(
  players: MediaSyncPlayer[],
  opts?: { masterNbaIds?: Set<string> }
): Promise<{ promoted: number; evaluated: number }> {
  const root = process.cwd();
  const paths = [
    path.join(root, "src", "data", "media", "portrait-lookup.json"),
    path.join(
      root,
      "data",
      "drbl",
      "player-media",
      "drbl-player-media-v2",
      "portrait-lookup.json"
    ),
    path.join(
      root,
      "data",
      "drbl",
      "player-media",
      "drbl-player-media-v1",
      "portrait-lookup.json"
    ),
  ];
  const primary = paths[0]!;
  const lookup = existsSync(primary)
    ? (JSON.parse(readFileSync(primary, "utf8")) as {
        portraits: Record<string, string>;
      })
    : { portraits: {} as Record<string, string> };

  const master = opts?.masterNbaIds ?? new Set(players.map((p) => p.nbaId));
  let promoted = 0;

  for (const p of players) {
    if (lookup.portraits[p.nbaId]) continue;
    const nba = await validate(nbaUrl(p.nbaId));
    const espn =
      !nba && p.espnId ? await validate(espnUrl(p.espnId)) : null;
    const url = nba ?? espn;
    if (!url) continue;
    lookup.portraits[p.nbaId] = url;
    if (p.espnId) {
      if (master.has(p.espnId) && p.espnId !== p.nbaId) {
        lookup.portraits[`espn:${p.espnId}`] = url;
      } else if (!lookup.portraits[p.espnId]) {
        lookup.portraits[p.espnId] = url;
      }
    }
    promoted++;
  }

  const payload = {
    version: "drbl-player-media-v2",
    updatedAt: new Date().toISOString(),
    note: "syncPlayerMediaForNewCanonicalPlayers",
    portraits: lookup.portraits,
    count: Object.keys(lookup.portraits).length,
  };
  mkdirSync(path.dirname(primary), { recursive: true });
  for (const p of paths) {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(payload, null, 2) + "\n");
  }
  return { promoted, evaluated: players.length };
}

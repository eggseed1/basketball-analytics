/**
 * Baked careers for pre-1996-97 players, keyed by Basketball-Reference slug.
 * NBA seasons and bios come from NBA Stats; ABA seasons and the advanced rows
 * are older BRef values. Written by scripts/build-legend-careers.py into
 * public/runtime/legend-careers/{letter}.json and served as static assets.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  BrefCountingRow,
  BrefPlayerAdvancedRow,
  BrefPlayerBio,
} from "@/data/providers/nba/bref-player-page";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type N = number | null;
/** Columns 16+ (shots, ORB/DRB, PF, age) are absent in older shards; column 26 is "ABA" on ABA seasons. */
type TotalsTuple = [string, string, 0 | 1, ...(N | string)[]];
/** Columns 14+ (rebound/steal/block rates, OWS/DWS, OBPM/DBPM) may be absent. */
type AdvancedTuple = [string, string, 0 | 1, ...N[]];
type CompactBio = {
  n?: string;
  pos?: string;
  sh?: string;
  h?: number;
  w?: number;
  bd?: string;
  bp?: string;
  dr?: string;
  j?: string;
};
type CompactCareer = { b?: CompactBio; t?: TotalsTuple[]; a?: AdvancedTuple[] };
type Shard = Record<string, CompactCareer>;

export type BundledBrefCareer = {
  bio: BrefPlayerBio;
  totals: BrefCountingRow[];
  advanced: BrefPlayerAdvancedRow[];
};

const shardCache = new Map<string, Promise<Shard | null>>();

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

async function loadShard(letter: string): Promise<Shard | null> {
  const pathname = `/runtime/legend-careers/${letter}.json`;
  const assets = cloudflareAssets();
  if (assets) {
    try {
      const response = await assets.fetch(`https://assets.local${pathname}`);
      if (response.ok) return (await response.json()) as Shard;
    } catch {
      // fall through to disk (local dev)
    }
  }
  try {
    const file = path.join(process.cwd(), "public", pathname);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as Shard;
  } catch {
    return null;
  }
}

function shardFor(letter: string): Promise<Shard | null> {
  let pending = shardCache.get(letter);
  if (!pending) {
    pending = loadShard(letter);
    shardCache.set(letter, pending);
  }
  return pending;
}

function expandBio(b: CompactBio | undefined, slug: string): BrefPlayerBio {
  const heightInches = b?.h ?? null;
  return {
    displayName: b?.n ?? slug,
    pronunciation: null,
    positionLine: b?.pos ?? null,
    shoots: b?.sh ?? null,
    heightLabel:
      heightInches != null
        ? `${Math.floor(heightInches / 12)}'${heightInches % 12}"`
        : null,
    heightInches,
    weightLbs: b?.w ?? null,
    currentTeamName: null,
    currentTeamAbbr: null,
    birthDate: b?.bd ?? null,
    birthPlace: b?.bp ?? null,
    country: b?.bp?.split(",").pop()?.trim() ?? null,
    draftLine: b?.dr ?? null,
    debutLine: null,
    experienceLine: null,
    jersey: b?.j ?? null,
  };
}

/** Baked career for a BRef slug, or null when the slug was not baked. */
export async function loadBundledBrefCareer(
  slug: string
): Promise<BundledBrefCareer | null> {
  const key = String(slug ?? "").trim().toLowerCase();
  if (!/^[a-z]{3,12}\d{2}$/.test(key)) return null;
  const career = (await shardFor(key[0]!))?.[key];
  if (!career?.t?.length) return null;
  return {
    bio: expandBio(career.b, key),
    totals: career.t.map((r) => {
      const n = (i: number): N => (r[i] as N | undefined) ?? null;
      return {
        season: r[0],
        teamAbbr: r[1],
        combined: r[2] === 1,
        position: null,
        age: n(25),
        gamesPlayed: n(3),
        gamesStarted: n(4),
        minutes: n(5),
        points: n(6),
        rebounds: n(7),
        assists: n(8),
        steals: n(9),
        blocks: n(10),
        turnovers: n(11),
        fieldGoalPct: n(12),
        threePointPct: n(13),
        freeThrowPct: n(14),
        effectiveFieldGoalPct: n(15),
        fieldGoalsMade: n(16),
        fieldGoalsAttempted: n(17),
        threePointersMade: n(18),
        threePointersAttempted: n(19),
        freeThrowsMade: n(20),
        freeThrowsAttempted: n(21),
        offensiveRebounds: n(22),
        defensiveRebounds: n(23),
        personalFouls: n(24),
        league: typeof r[26] === "string" ? r[26] : null,
      };
    }),
    advanced: (career.a ?? []).map((r) => {
      const n = (i: number): N => (r[i] as N | undefined) ?? null;
      return {
        season: r[0],
        teamAbbr: r[1],
        combined: r[2] === 1,
        minutes: null,
        gamesPlayed: null,
        per: n(3),
        trueShootingPct: n(4),
        usagePct: n(5),
        turnoverPct: n(6),
        assistPct: n(7),
        reboundPct: n(8),
        bpm: n(9),
        vorp: n(10),
        winShares: n(11),
        offensiveRating: n(12),
        defensiveRating: n(13),
        offensiveReboundPct: n(14),
        defensiveReboundPct: n(15),
        stealPct: n(16),
        blockPct: n(17),
        threePointAttemptRate: n(18),
        freeThrowRate: n(19),
        offensiveWinShares: n(20),
        defensiveWinShares: n(21),
        winSharesPer48: n(22),
        offensiveBpm: n(23),
        defensiveBpm: n(24),
      };
    }),
  };
}

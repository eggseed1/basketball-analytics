/**
 * Homepage analytics payload - leaders + plain-language findings.
 * Optimized for first paint: DARKO is required; ESPN seasons are soft-timed
 * so a slow byathlete crawl cannot block the whole homepage.
 */

import { getDarkoRatings } from "@/data/queries/historical";
import type { DarkoRating, PlayerSeason } from "@/data/types";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { NBADataProvider } from "@/data/providers/nba-data-provider";
import {
  explainDarko,
  formatImpact,
  formatPct,
} from "@/lib/stat-explainers";
import { normalizePlayerName } from "@/lib/player-name";

/** DARKO row with ESPN athlete id when name-matched for profile links. */
export type HomeDarkoLeader = DarkoRating & {
  /** Prefer for `/players/[id]` and headshots. */
  profileId: string;
};

export type InsightPlayer = {
  id: string;
  name: string;
};

export type ComputedInsight = {
  id: string;
  eyebrow: string;
  /** Metric / headline without relying on embedded names. */
  title: string;
  body: string;
  players?: InsightPlayer[];
  /** Full board with sort already lined up. */
  boardHref?: string;
  learnHref?: string;
};

export type HomeAnalytics = {
  season: string;
  darkoLeaders: HomeDarkoLeader[];
  tsLeaders: PlayerSeason[];
  usageStars: PlayerSeason[];
  insights: ComputedInsight[];
};

const HOME_CACHE_TTL_MS = 1000 * 60 * 5;
const HOME_CACHE_VERSION = 7;
const ESPN_SEASONS_BUDGET_MS = 3500;
let homeCache: {
  version: number;
  expiresAt: number;
  value: HomeAnalytics;
} | null = null;
/** In-flight dedupe so concurrent Suspense islands share one load. */
let homeInflight: Promise<HomeAnalytics> | null = null;

function qualify(rows: PlayerSeason[], minMpg = 18): PlayerSeason[] {
  return rows.filter(
    (p) => p.gamesPlayed >= 15 && p.minutes / p.gamesPlayed >= minMpg
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function espnIdByName(seasons: PlayerSeason[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of seasons) {
    const key = normalizePlayerName(row.playerName);
    if (!map.has(key)) map.set(key, row.playerId);
  }
  return map;
}

function withProfileId(
  row: DarkoRating,
  byName: Map<string, string>
): HomeDarkoLeader {
  const espnId = byName.get(normalizePlayerName(row.playerName));
  return {
    ...row,
    // Links prefer ESPN athlete ids; headshots use nbaPlayerId via NBA CDN.
    profileId: espnId ?? row.nbaPlayerId ?? row.playerId,
  };
}

async function loadHomeAnalytics(): Promise<HomeAnalytics> {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const espn = new NBADataProvider();

  // DARKO first-class; ESPN seasons must not stall the page.
  const [darko, seasons] = await Promise.all([
    getDarkoRatings().catch(() => [] as DarkoRating[]),
    withTimeout(
      espn.getPlayerSeasons(season).catch(() => [] as PlayerSeason[]),
      ESPN_SEASONS_BUDGET_MS,
      [] as PlayerSeason[]
    ),
  ]);

  const byName = espnIdByName(seasons);
  const qualified = qualify(seasons, 18);
  const efficiencyPool = qualify(seasons, 24);

  const darkoLeaders = [...darko]
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 20)
    .map((row) => withProfileId(row, byName));
  const tsLeaders = [...efficiencyPool]
    .sort(
      (a, b) =>
        (b.trueShootingPct ?? -Infinity) - (a.trueShootingPct ?? -Infinity)
    )
    .slice(0, 15);
  const usageStars = [...qualified]
    .filter((p) => p.usagePct != null && p.usagePct >= 0.24)
    .sort(
      (a, b) =>
        (b.trueShootingPct ?? -Infinity) - (a.trueShootingPct ?? -Infinity)
    )
    .slice(0, 15);

  const insights: ComputedInsight[] = [];

  const top = darkoLeaders[0];
  if (top) {
    insights.push({
      id: "darko-leader",
      eyebrow: "DARKO",
      title: `${formatImpact(top.impact)} DPM`,
      body: explainDarko(top.impact),
      players: [{ id: top.profileId, name: top.playerName }],
      boardHref: "/explore/players?sort=darkoDpm",
      learnHref: "/learn/darko",
    });
  }

  const bestTs = tsLeaders[0];
  if (bestTs) {
    insights.push({
      id: "ts-leader",
      eyebrow: "TS%",
      title:
        bestTs.trueShootingPct != null && bestTs.trueShootingPct > 0
          ? formatPct(bestTs.trueShootingPct)
          : "—",
      body: "Best true shooting among qualified minutes.",
      players: [{ id: bestTs.playerId, name: bestTs.playerName }],
      boardHref: "/explore/players?sort=trueShootingPct",
      learnHref: "/learn/true-shooting",
    });
  }

  const efficientVolume = usageStars[0];
  if (efficientVolume) {
    insights.push({
      id: "usage-ts",
      eyebrow: "USG × TS%",
      title: `${
        efficientVolume.usagePct != null && efficientVolume.usagePct > 0
          ? formatPct(efficientVolume.usagePct)
          : "—"
      } usg · ${
        efficientVolume.trueShootingPct != null &&
        efficientVolume.trueShootingPct > 0
          ? formatPct(efficientVolume.trueShootingPct)
          : "—"
      } TS`,
      body: "High usage without giving back efficiency.",
      players: [
        { id: efficientVolume.playerId, name: efficientVolume.playerName },
      ],
      boardHref: "/explore/players?sort=usagePct",
      learnHref: "/learn/usage",
    });
  }

  if (darkoLeaders[1] && darkoLeaders[0]) {
    const gap = darkoLeaders[0].impact - darkoLeaders[1].impact;
    if (gap >= 0.4) {
      insights.push({
        id: "gap",
        eyebrow: "DARKO",
        title: `${formatImpact(gap)} between #1 and #2`,
        body: "Largest gap at the top of the impact board.",
        players: [
          { id: darkoLeaders[0].profileId, name: darkoLeaders[0].playerName },
          { id: darkoLeaders[1].profileId, name: darkoLeaders[1].playerName },
        ],
        boardHref: "/explore/players?sort=darkoDpm",
        learnHref: "/learn/darko",
      });
    }
  }

  return {
    season,
    darkoLeaders,
    tsLeaders,
    usageStars,
    insights: insights.slice(0, 4),
  };
}

export async function getHomeAnalytics(): Promise<HomeAnalytics> {
  if (
    homeCache &&
    homeCache.version === HOME_CACHE_VERSION &&
    homeCache.expiresAt > Date.now()
  ) {
    return homeCache.value;
  }
  if (homeInflight) return homeInflight;
  homeInflight = loadHomeAnalytics()
    .then((value) => {
      homeCache = {
        version: HOME_CACHE_VERSION,
        value,
        expiresAt: Date.now() + HOME_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      homeInflight = null;
    });
  return homeInflight;
}

/**
 * Homepage analytics payload - leaders + plain-language findings.
 * Optimized for first paint: DRBL preferred when overlay succeeds; DARKO
 * remains secondary. ESPN seasons are soft-timed so a slow crawl cannot
 * block the whole homepage.
 */

import { getDarkoRatings } from "@/data/queries/historical";
import type { DarkoRating, PlayerSeason } from "@/data/types";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { NBADataProvider } from "@/data/providers/nba-data-provider";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";
import { isDrblSeason } from "@/data/drbl/season-registry";
import {
  getPlayerIdAliasIndex,
} from "@/data/identity/player-identity";
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";
import { hasValidatedDrblEstimate } from "@/data/queries/percentiles";
import {
  explainDarko,
  formatImpact,
  formatPct,
} from "@/lib/stat-explainers";
import { formatNumber } from "@/lib/format";
import { normalizePlayerName } from "@/lib/player-name";

/** Re-export schedule types for analytics home game list compatibility. */
export type {
  ScheduleGame,
  ScheduleLeader,
} from "@/data/providers/nba/schedule-client";

/** DARKO row with ESPN athlete id when name-matched for profile links. */
export type HomeDarkoLeader = DarkoRating & {
  /** Prefer for `/players/[id]` and headshots. */
  profileId: string;
};

/** DRBL/100 leader for the current registry season. */
export type HomeDrblLeader = {
  playerId: string;
  playerName: string;
  /** Prefer ESPN id when production-approved alias exists; else NBA id. */
  profileId: string;
  nbaPlayerId: string;
  teamAbbr?: string;
  drbl100: number;
  r1Points: number | null;
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
  /** True when DRBL overlay produced leaders for the home season. */
  drblOverlayOk: boolean;
  /** Transparent note when DRBL could not lead (do not pretend DARKO is DRBL). */
  drblFallbackNote: string | null;
  drblLeaders: HomeDrblLeader[];
  darkoLeaders: HomeDarkoLeader[];
  tsLeaders: PlayerSeason[];
  usageStars: PlayerSeason[];
  insights: ComputedInsight[];
};

const HOME_CACHE_TTL_MS = 1000 * 60 * 5;
const HOME_CACHE_VERSION = 8;
const ESPN_SEASONS_BUDGET_MS = 3500;
const DRBL_BUDGET_MS = 2500;
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
  const drblSeasonOk = isDrblSeason(season);

  const [darko, seasons, drblRows, aliasIndex] = await Promise.all([
    getDarkoRatings().catch(() => [] as DarkoRating[]),
    withTimeout(
      espn.getPlayerSeasons(season).catch(() => [] as PlayerSeason[]),
      ESPN_SEASONS_BUDGET_MS,
      [] as PlayerSeason[]
    ),
    drblSeasonOk
      ? withTimeout(
          fetchDrblSeason(season).catch(() => []),
          DRBL_BUDGET_MS,
          []
        )
      : Promise.resolve([]),
    getPlayerIdAliasIndex().catch(() => ({
      byEspn: new Map(),
      byNba: new Map(),
    })),
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

  const drblLeaders: HomeDrblLeader[] = [];
  if (drblSeasonOk && drblRows.length) {
    const valid = drblRows.filter((row) =>
      hasValidatedDrblEstimate({
        validatedDRBL100: row.drbl100,
        validatedRawP100: row.rawAbilityRate,
        validatedActualPossessions: row.actualPossessions ?? row.possessions ?? 0,
      })
    );
    valid.sort((a, b) => b.drbl100 - a.drbl100);
    for (const row of valid.slice(0, 20)) {
      const nbaId = String(row.playerId);
      const alias = aliasIndex.byNba.get(nbaId);
      const espnFromAlias =
        alias && isProductionApprovedPlayerAlias(alias)
          ? alias.espnPlayerId
          : null;
      const espnFromName = byName.get(
        normalizePlayerName(row.playerName ?? "")
      );
      // Prefer approved alias ESPN id; name match is secondary for headshots only.
      const profileId = espnFromAlias ?? espnFromName ?? nbaId;
      drblLeaders.push({
        playerId: nbaId,
        playerName: row.playerName ?? nbaId,
        profileId,
        nbaPlayerId: nbaId,
        teamAbbr: row.teamId || undefined,
        drbl100: row.drbl100,
        r1Points:
          row.r1Points != null && Number.isFinite(row.r1Points)
            ? row.r1Points
            : null,
      });
    }
  }

  const drblOverlayOk = drblLeaders.length > 0;
  const drblFallbackNote = drblOverlayOk
    ? null
    : drblSeasonOk
      ? "DRBL/100 leaders unavailable for this load — showing DARKO as secondary impact context, not as first-party DRBL."
      : `DRBL is not published for ${season}; DARKO shown as external impact context.`;

  const insights: ComputedInsight[] = [];

  const topDrbl = drblLeaders[0];
  if (topDrbl) {
    insights.push({
      id: "drbl-leader",
      eyebrow: "DRBL",
      title: `${formatNumber(topDrbl.drbl100, 2)} DRBL/100`,
      body: "Leading validated ability rate among published DRBL estimates this season.",
      players: [{ id: topDrbl.profileId, name: topDrbl.playerName }],
      boardHref: "/explore/players?sort=drbl100&dir=desc",
      learnHref: "/learn/drbl",
    });
  }

  const top = darkoLeaders[0];
  if (top) {
    insights.push({
      id: "darko-leader",
      eyebrow: "DARKO",
      title: `${formatImpact(top.impact)} DPM`,
      body: drblOverlayOk
        ? `External comparison context: ${explainDarko(top.impact)}`
        : explainDarko(top.impact),
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

  if (drblLeaders[1] && drblLeaders[0]) {
    const gap = drblLeaders[0].drbl100 - drblLeaders[1].drbl100;
    if (gap >= 0.35) {
      insights.push({
        id: "drbl-gap",
        eyebrow: "DRBL",
        title: `${formatNumber(gap, 2)} between #1 and #2`,
        body: "Largest gap at the top of the DRBL/100 board.",
        players: [
          { id: drblLeaders[0].profileId, name: drblLeaders[0].playerName },
          { id: drblLeaders[1].profileId, name: drblLeaders[1].playerName },
        ],
        boardHref: "/explore/players?sort=drbl100&dir=desc",
        learnHref: "/learn/drbl",
      });
    }
  } else if (darkoLeaders[1] && darkoLeaders[0] && !drblOverlayOk) {
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
    drblOverlayOk,
    drblFallbackNote,
    drblLeaders,
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

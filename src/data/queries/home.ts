/**
 * Homepage analytics payload - leaders + plain-language findings.
 * Optimized for first paint: DRBL preferred when overlay succeeds; DARKO
 * remains secondary. ESPN seasons are soft-timed so a slow crawl cannot
 * block the whole homepage.
 */

import { getDarkoRatings, getRaptorRatings } from "@/data/queries/historical";
import type { DarkoRating, RaptorRating, PlayerSeason } from "@/data/types";
import { sharedGetOrSet } from "@/data/cache/shared-ttl-cache";
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
import { normalizePlayerName } from "@/lib/player-name";
import {
  priorSeasonForStats,
  shouldUsePriorSeasonBoardStats,
} from "@/lib/player-board-season";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import {
  getCanonicalTeamFromProvider,
  resolveCanonicalTeam,
} from "@/data/identity/team-map";

/** Resolve a product team key (ESPN id / abbr) for logos — never raw NBA Stats ids. */
function productTeamKeyFromProviderTeamId(
  raw?: string | null
): { teamKey?: string; teamAbbr?: string } {
  const id = String(raw ?? "").trim();
  if (!id || id === "0" || id.toUpperCase() === "TOT") return {};
  const fromNba = getCanonicalTeamFromProvider("nba", id);
  if (fromNba) {
    return { teamKey: fromNba.canonicalTeamId, teamAbbr: fromNba.abbr };
  }
  const resolved = resolveCanonicalTeam(id);
  if (resolved.status === "resolved") {
    return {
      teamKey: resolved.team.canonicalTeamId,
      teamAbbr: resolved.team.abbr,
    };
  }
  return {};
}

function productTeamKeyFromSeason(
  season?: PlayerSeason | null
): { teamKey?: string; teamAbbr?: string } {
  if (!season) return {};
  if (season.teamId) {
    const fromId = productTeamKeyFromProviderTeamId(season.teamId);
    if (fromId.teamKey) {
      return {
        teamKey: fromId.teamKey,
        teamAbbr: season.teamAbbreviation ?? fromId.teamAbbr,
      };
    }
  }
  if (season.teamAbbreviation) {
    const resolved = resolveCanonicalTeam(season.teamAbbreviation);
    if (resolved.status === "resolved") {
      return {
        teamKey: resolved.team.canonicalTeamId,
        teamAbbr: resolved.team.abbr,
      };
    }
    return { teamAbbr: season.teamAbbreviation };
  }
  return {};
}

/** Re-export schedule types for analytics home game list compatibility. */
export type {
  ScheduleGame,
  ScheduleLeader,
} from "@/data/providers/nba/schedule-client";

/** DARKO / RAPTOR row with ESPN athlete id when name-matched for profile links. */
export type HomeDarkoLeader = DarkoRating & {
  /** Prefer for `/players/[id]` and headshots. */
  profileId: string;
  /** Companion season rates for Top Performers overview. */
  trueShootingPct?: number | null;
  usagePct?: number | null;
};

export type HomeRaptorLeader = RaptorRating & {
  profileId: string;
  trueShootingPct?: number | null;
  usagePct?: number | null;
};

/** DRBL/100 leader for the current registry season. */
export type HomeDrblLeader = {
  playerId: string;
  playerName: string;
  /** Prefer ESPN id when production-approved alias exists; else NBA id. */
  profileId: string;
  nbaPlayerId: string;
  /** Canonical ESPN product team id for logos / routes. */
  teamKey?: string;
  /** Display abbreviation when known. */
  teamAbbr?: string;
  drbl100: number;
  r1Points: number | null;
  /** WAR1 (r1WinEquivalents) — preferred home Top Performers default. */
  war1: number | null;
  /** Companion board stats (joined from season / DARKO for the overview table). */
  darko?: number | null;
  trueShootingPct?: number | null;
  usagePct?: number | null;
};

/** Compact season row for Top Performers cross-metric join (not only TS/USG leaders). */
export type HomePerformerSeason = {
  playerId: string;
  playerName: string;
  teamKey?: string;
  teamAbbr?: string;
  trueShootingPct: number | null;
  usagePct: number | null;
};

export type InsightPlayer = {
  id: string;
  name: string;
};

/** @deprecated Season-board insights removed — use RecentInsight. */
export type ComputedInsight = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  players?: InsightPlayer[];
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
  raptorLeaders: HomeRaptorLeader[];
  tsLeaders: PlayerSeason[];
  usageStars: PlayerSeason[];
  /**
   * Season rows for every player appearing in any home leader list —
   * used so Top Performers can show TS%/USG for DRBL/DARKO rows outside
   * the narrow TS/USG top-15 slices.
   */
  performerSeasons: HomePerformerSeason[];
};

const HOME_CACHE_TTL_MS = 1000 * 60 * 5;
/** Bump when leader team identity / companion-stat contract changes. */
const HOME_CACHE_VERSION = 16;
const ESPN_SEASONS_BUDGET_MS = 2500;
const DRBL_BUDGET_MS = 2000;
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

function withProfileId<T extends { playerName: string; playerId: string; nbaPlayerId?: string }>(
  row: T,
  byName: Map<string, string>
): T & { profileId: string } {
  const espnId = byName.get(normalizePlayerName(row.playerName));
  return {
    ...row,
    // Links prefer ESPN athlete ids; headshots use nbaPlayerId via NBA CDN.
    profileId: espnId ?? row.nbaPlayerId ?? row.playerId,
  };
}

async function loadHomeAnalytics(): Promise<HomeAnalytics> {
  const calendarSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const espn = new NBADataProvider();
  const preTip = isPreseasonRosterSeason(calendarSeason);
  const initialSeason = preTip
    ? priorSeasonForStats(calendarSeason)
    : calendarSeason;

  const { slimEdgeProductEnabled } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  let seasons: PlayerSeason[] = [];
  let season = initialSeason;

  if (slimEdgeProductEnabled()) {
    // Slim edge only: never start ESPN season-board fetches (uncancellable → 1102).
    // Paid FULL_EDGE_PRODUCT skips this branch and uses the live path below.
    const { getBundledBrefPeerBoard } = await import(
      "@/data/runtime/bref-advanced-snapshot"
    );
    seasons = getBundledBrefPeerBoard(initialSeason);
    if (
      seasons.length === 0 ||
      shouldUsePriorSeasonBoardStats(calendarSeason, seasons)
    ) {
      const prior = priorSeasonForStats(calendarSeason);
      const priorRows = getBundledBrefPeerBoard(prior);
      if (priorRows.length > 0) {
        season = prior;
        seasons = priorRows;
      }
    }
    if (seasons.length > 0 && isDrblSeason(season)) {
      const drblRows = await fetchDrblSeason(season).catch(() => []);
      if (drblRows.length) {
        const { getPlayerIdAliasIndex } = await import(
          "@/data/identity/player-identity"
        );
        const { isProductionApprovedPlayerAlias } = await import(
          "@/data/providers/impact/player-id-aliases"
        );
        const aliases = await getPlayerIdAliasIndex();
        const byId = new Map(drblRows.map((r) => [r.playerId, r]));
        seasons = seasons.map((row) => {
          const alias = aliases.byEspn.get(row.playerId);
          const nba =
            alias && isProductionApprovedPlayerAlias(alias)
              ? alias.nbaPlayerId
              : null;
          const drbl =
            byId.get(row.playerId) ??
            (nba ? byId.get(nba) : undefined);
          if (!drbl) return row;
          return {
            ...row,
            drbl100: drbl.drbl100 ?? row.drbl100,
            rawAbilityRate: drbl.rawAbilityRate ?? row.rawAbilityRate,
            drblPossessions:
              drbl.actualPossessions ?? drbl.possessions ?? row.drblPossessions,
            drblO: drbl.drblO ?? row.drblO,
            drblD: drbl.drblD ?? row.drblD,
            drblP: drbl.drblP ?? row.drblP,
            drblLn: drbl.drblLn ?? row.drblLn,
            drblB: drbl.drblB ?? row.drblB,
            r1Points:
              drbl.r1Points != null && Number.isFinite(drbl.r1Points)
                ? drbl.r1Points
                : (row.r1Points ?? null),
            r1WinEquivalents:
              drbl.r1WinEquivalents != null &&
              Number.isFinite(drbl.r1WinEquivalents)
                ? drbl.r1WinEquivalents
                : (row.r1WinEquivalents ?? null),
          };
        });
      }
    }
  } else {
    seasons = await withTimeout(
      espn.getPlayerSeasons(initialSeason).catch(() => [] as PlayerSeason[]),
      ESPN_SEASONS_BUDGET_MS,
      [] as PlayerSeason[]
    );

    // Outside the known pre-tip window, only fall back when the live current
    // board proves empty. During pre-tip we go straight to the completed season
    // and avoid a 30-team roster crawl on every cold serverless instance.
    if (
      !preTip &&
      shouldUsePriorSeasonBoardStats(calendarSeason, seasons)
    ) {
      const prior = priorSeasonForStats(calendarSeason);
      const priorRows = await withTimeout(
        espn.getPlayerSeasons(prior).catch(() => [] as PlayerSeason[]),
        ESPN_SEASONS_BUDGET_MS,
        [] as PlayerSeason[]
      );
      if (priorRows.length > 0) {
        season = prior;
        seasons = priorRows;
      }
    }
  }

  const drblSeasonOk = isDrblSeason(season);

  const [darko, raptor, drblRows, aliasIndex] = await Promise.all([
    getDarkoRatings().catch(() => [] as DarkoRating[]),
    getRaptorRatings(season).catch(() => [] as RaptorRating[]),
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
  const seasonByName = new Map<string, PlayerSeason>();
  for (const row of seasons) {
    const key = normalizePlayerName(row.playerName);
    const prev = seasonByName.get(key);
    if (!prev || row.minutes > prev.minutes) seasonByName.set(key, row);
  }
  const darkoByName = new Map<string, number>();
  for (const row of darko) {
    const key = normalizePlayerName(row.playerName);
    const prev = darkoByName.get(key);
    if (prev == null || row.impact > prev) darkoByName.set(key, row.impact);
  }
  const qualified = qualify(seasons, 18);
  const efficiencyPool = qualify(seasons, 24);

  const darkoLeaders = [...darko]
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 20)
    .map((row) => {
      const base = withProfileId(row, byName);
      const season = seasonByName.get(normalizePlayerName(row.playerName));
      const team = productTeamKeyFromSeason(season);
      return {
        ...base,
        teamAbbr: base.teamAbbr ?? team.teamAbbr ?? season?.teamAbbreviation,
        teamName: base.teamName ?? season?.teamName,
        trueShootingPct:
          season?.trueShootingPct != null && season.trueShootingPct > 0
            ? season.trueShootingPct
            : null,
        usagePct:
          season?.usagePct != null && season.usagePct > 0
            ? season.usagePct
            : null,
      };
    });

  const raptorLeaders = [...raptor]
    .filter((row) => Number.isFinite(row.impact))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 20)
    .map((row) => {
      const base = withProfileId(row, byName);
      const seasonRow = seasonByName.get(normalizePlayerName(row.playerName));
      const team = productTeamKeyFromSeason(seasonRow);
      return {
        ...base,
        teamAbbr: base.teamAbbr ?? team.teamAbbr ?? seasonRow?.teamAbbreviation,
        teamName: base.teamName ?? seasonRow?.teamName,
        trueShootingPct:
          seasonRow?.trueShootingPct != null && seasonRow.trueShootingPct > 0
            ? seasonRow.trueShootingPct
            : null,
        usagePct:
          seasonRow?.usagePct != null && seasonRow.usagePct > 0
            ? seasonRow.usagePct
            : null,
      };
    });

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
    valid.sort((a, b) => {
      const aw = a.r1WinEquivalents;
      const bw = b.r1WinEquivalents;
      if (
        aw != null &&
        bw != null &&
        Number.isFinite(aw) &&
        Number.isFinite(bw) &&
        aw !== bw
      ) {
        return bw - aw;
      }
      return b.drbl100 - a.drbl100;
    });
    for (const row of valid.slice(0, 20)) {
      const nbaId = String(row.playerId);
      const alias = aliasIndex.byNba.get(nbaId);
      const espnFromAlias =
        alias && isProductionApprovedPlayerAlias(alias)
          ? alias.espnPlayerId
          : null;
      const displayName =
        (row.playerName && row.playerName.trim()) ||
        alias?.playerName?.trim() ||
        nbaId;
      const nameKey = normalizePlayerName(displayName);
      const espnFromName = byName.get(nameKey);
      // Prefer approved alias ESPN id; name match is secondary for headshots only.
      const profileId = espnFromAlias ?? espnFromName ?? nbaId;
      const season = seasonByName.get(nameKey);
      const fromSeason = productTeamKeyFromSeason(season);
      const fromDrbl = productTeamKeyFromProviderTeamId(row.teamId);
      const ts =
        season?.trueShootingPct != null && season.trueShootingPct > 0
          ? season.trueShootingPct
          : null;
      const usg =
        season?.usagePct != null && season.usagePct > 0
          ? season.usagePct
          : null;
      drblLeaders.push({
        playerId: nbaId,
        playerName: displayName,
        profileId,
        nbaPlayerId: nbaId,
        teamKey: fromSeason.teamKey ?? fromDrbl.teamKey,
        teamAbbr: fromSeason.teamAbbr ?? fromDrbl.teamAbbr,
        drbl100: row.drbl100,
        r1Points:
          row.r1Points != null && Number.isFinite(row.r1Points)
            ? row.r1Points
            : null,
        war1:
          row.r1WinEquivalents != null && Number.isFinite(row.r1WinEquivalents)
            ? row.r1WinEquivalents
            : null,
        darko: darkoByName.get(nameKey) ?? null,
        trueShootingPct: ts,
        usagePct: usg,
      });
    }
  }

  const nameKeys = new Set<string>();
  for (const p of drblLeaders) nameKeys.add(normalizePlayerName(p.playerName));
  for (const p of darkoLeaders) nameKeys.add(normalizePlayerName(p.playerName));
  for (const p of raptorLeaders) nameKeys.add(normalizePlayerName(p.playerName));
  for (const p of tsLeaders) nameKeys.add(normalizePlayerName(p.playerName));
  for (const p of usageStars) nameKeys.add(normalizePlayerName(p.playerName));

  const performerSeasons: HomePerformerSeason[] = [];
  for (const key of nameKeys) {
    const season = seasonByName.get(key);
    if (!season) continue;
    const team = productTeamKeyFromSeason(season);
    performerSeasons.push({
      playerId: season.playerId,
      playerName: season.playerName,
      teamKey: team.teamKey,
      teamAbbr: team.teamAbbr ?? season.teamAbbreviation,
      trueShootingPct:
        season.trueShootingPct != null && season.trueShootingPct > 0
          ? season.trueShootingPct
          : null,
      usagePct:
        season.usagePct != null && season.usagePct > 0
          ? season.usagePct
          : null,
    });
  }

  const drblOverlayOk = drblLeaders.length > 0;
  const drblFallbackNote = drblOverlayOk
    ? null
    : drblSeasonOk
      ? "DRBL/100 leaders unavailable for this load — showing DARKO as secondary impact context, not as first-party DRBL."
      : `DRBL is not published for ${season}; DARKO shown as external impact context.`;

  return {
    season,
    drblOverlayOk,
    drblFallbackNote,
    drblLeaders,
    darkoLeaders,
    raptorLeaders,
    tsLeaders,
    usageStars,
    performerSeasons,
  };
}

export async function getHomeAnalytics(): Promise<HomeAnalytics> {
  if (homeInflight) return homeInflight;
  homeInflight = sharedGetOrSet(
    `home:analytics:v${HOME_CACHE_VERSION}`,
    {
      ttlMs: HOME_CACHE_TTL_MS,
      staleMs: HOME_CACHE_TTL_MS * 2,
      tags: ["home-analytics"],
    },
    () => loadHomeAnalytics()
  ).finally(() => {
    homeInflight = null;
  });
  return homeInflight;
}

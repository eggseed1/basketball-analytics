import "server-only";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { getUniverseSeasonsForPlayer } from "@/data/history/player-universe";
import { getDataProvider } from "@/data/providers";
import {
  effectiveFieldGoalPct,
  freeThrowRate,
  threePointAttemptRate,
  trueShootingPct,
  turnoverPct,
  twoPointPct,
} from "@/data/providers/nba/compute-advanced";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import {
  isConstrainedServerRuntime,
  isVercelRuntime,
  preferBundledProductDataOnEdge,
  runtimeTimeoutMs,
  slimEdgeProductEnabled,
} from "@/data/providers/nba/runtime-policy";
import { getBundledBrefCareerForPlayer } from "@/data/runtime/bref-advanced-snapshot";
import { resolveBundledCurrentTeamId } from "@/data/runtime/current-roster-snapshot";
import {
  displayNameFromBrefRouteId,
  parseBrefPlayerSlug,
} from "@/data/providers/nba/bref-career-from-page";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import type { Player, PlayerSeason } from "@/data/types";
import {
  firstUsablePlayerDisplayName,
  isSyntheticPlayerDisplayName,
} from "@/lib/player-display-name";

function historyNumber(value: number | null | undefined): number {
  return value == null ? Number.NaN : value;
}

function uniquePlayerIds(
  ...ids: Array<string | null | undefined>
): string[] {
  return [
    ...new Set(
      ids
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Disk history is keyed by NBA PERSON_ID while public player links commonly use
 * ESPN athlete ids. Resolve the first factual history row across both namespaces
 * and normalize it back to the requested route id for stable links/components.
 */
function historyCareerFallback(
  routePlayerId: string,
  lookupIds: string[]
): PlayerSeason[] {
  let historyRows: ReturnType<typeof getUniverseSeasonsForPlayer> = [];
  for (const lookupId of lookupIds) {
    historyRows = getUniverseSeasonsForPlayer(lookupId);
    if (historyRows.length > 0) break;
  }

  return historyRows.map((row) => {
    const fgm = historyNumber(row.fgm);
    const fga = historyNumber(row.fga);
    const threePm = historyNumber(row.threePm);
    const threePa = historyNumber(row.threePa);
    const ftm = historyNumber(row.ftm);
    const fta = historyNumber(row.fta);
    const points = historyNumber(row.points);
    const turnovers = historyNumber(row.turnovers);
    const multi = (row.teamIds ?? []).length > 1;
    const efg = effectiveFieldGoalPct(fgm, threePm, fga);
    const ts = trueShootingPct(points, fga, fta);

    return withPlayerSeasonDefaults({
      playerId: routePlayerId,
      playerName: row.playerName,
      teamId: multi ? "TOT" : row.primaryTeamId,
      teamName: multi ? "Multiple Teams" : row.primaryTeamId,
      providerTeamId: row.primaryTeamId,
      teamIdProvider: "nba",
      nbaTeamId: row.primaryTeamId,
      season: row.season,
      gamesPlayed: row.gp,
      gamesStarted: historyNumber(row.gs),
      minutes: historyNumber(row.minutes),
      fieldGoalsMade: fgm,
      fieldGoalsAttempted: fga,
      threePointersMade: threePm,
      threePointersAttempted: threePa,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      rebounds: historyNumber(row.rebounds),
      assists: historyNumber(row.assists),
      steals: historyNumber(row.steals),
      blocks: historyNumber(row.blocks),
      turnovers,
      points,
      fieldGoalPct:
        Number.isFinite(fgm) && Number.isFinite(fga) && fga > 0
          ? fgm / fga
          : Number.NaN,
      twoPointPct: twoPointPct(fgm, threePm, fga, threePa),
      threePointPct:
        Number.isFinite(threePm) && Number.isFinite(threePa) && threePa > 0
          ? threePm / threePa
          : Number.NaN,
      freeThrowPct:
        Number.isFinite(ftm) && Number.isFinite(fta) && fta > 0
          ? ftm / fta
          : Number.NaN,
      threePointAttemptRate: threePointAttemptRate(threePa, fga),
      freeThrowRate: freeThrowRate(fta, fga),
      turnoverPct: turnoverPct(turnovers, fga, fta) ?? Number.NaN,
      ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
      ...(ts != null ? { trueShootingPct: ts } : {}),
      r1Points: null,
      r1WinEquivalents: null,
    });
  });
}

/**
 * Keep preferred season rows; for overlapping seasons, fill missing / zeroed
 * advanced fields from fallback (BRef bundle). Append seasons only in fallback.
 */
function unionCareerBySeason(
  preferred: PlayerSeason[],
  fallback: PlayerSeason[]
): PlayerSeason[] {
  if (!fallback.length) return preferred;
  if (!preferred.length) return fallback;

  const fallbackBySeason = new Map<string, PlayerSeason[]>();
  for (const row of fallback) {
    const list = fallbackBySeason.get(row.season) ?? [];
    list.push(row);
    fallbackBySeason.set(row.season, list);
  }

  const covered = new Set<string>();
  const out: PlayerSeason[] = preferred.map((row) => {
    covered.add(row.season);
    const donors = fallbackBySeason.get(row.season) ?? [];
    if (!donors.length) return row;
    // Prefer same-team donor when possible, else highest-GP donor.
    const donor =
      donors.find(
        (d) =>
          d.teamAbbreviation &&
          row.teamAbbreviation &&
          d.teamAbbreviation === row.teamAbbreviation
      ) ??
      donors.slice().sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0];
    return mergeCareerSeasonFields(row, donor);
  });

  for (const row of fallback) {
    if (!covered.has(row.season)) out.push(row);
  }
  return out;
}

/** Prefer primary finite values; treat 0 as missing for unpublished advanced/rates. */
function mergeCareerSeasonFields(
  primary: PlayerSeason,
  secondary: PlayerSeason
): PlayerSeason {
  const ZERO_MISSING = new Set([
    "per",
    "vorp",
    "winShares",
    "winSharesPer48",
    "ows",
    "dws",
    "bpm",
    "obpm",
    "dbpm",
    "offensiveRating",
    "defensiveRating",
    "netRating",
    "usagePct",
    "trueShootingPct",
    "effectiveFieldGoalPct",
    "assistPct",
    "turnoverPct",
    "offensiveReboundPct",
    "defensiveReboundPct",
    "reboundPct",
    "stealPct",
    "blockPct",
    "threePointAttemptRate",
    "freeThrowRate",
    "pie",
    "darkoDpm",
    "darkoOff",
    "darkoDef",
    "dpm",
    "oDpm",
    "dDpm",
    "raptor",
    "oRaptor",
    "dRaptor",
    "winsAdded",
    "drbl100",
    "war1",
  ]);

  const merged: Record<string, unknown> = { ...secondary, ...primary };
  const keys = new Set([...Object.keys(secondary), ...Object.keys(primary)]);
  for (const key of keys) {
    const a = (primary as unknown as Record<string, unknown>)[key];
    const b = (secondary as unknown as Record<string, unknown>)[key];
    if (typeof a === "number" || typeof b === "number") {
      const aOk = typeof a === "number" && Number.isFinite(a);
      const bOk = typeof b === "number" && Number.isFinite(b);
      if (aOk && ZERO_MISSING.has(key) && a === 0 && bOk && b !== 0) {
        merged[key] = b;
      } else if (aOk) {
        merged[key] = a;
      } else if (bOk) {
        merged[key] = b;
      } else {
        merged[key] = a ?? b;
      }
    }
  }
  merged.playerId = primary.playerId;
  merged.playerName = primary.playerName || secondary.playerName;
  merged.season = primary.season;
  merged.teamId = primary.teamId || secondary.teamId;
  merged.teamAbbreviation =
    primary.teamAbbreviation ?? secondary.teamAbbreviation;
  merged.position = primary.position ?? secondary.position;
  return merged as unknown as PlayerSeason;
}

function bundledCareerRows(
  routePlayerId: string,
  identity: { espnId?: string | null; displayName?: string | null } | null
): PlayerSeason[] {
  // Name-shaped search ids (`bref:michael jordan`) must look up by name —
  // the BRef bundle is keyed by ESPN id or normalized player name, not bref:…
  const brefNameHint = displayNameFromBrefRouteId(routePlayerId);
  return getBundledBrefCareerForPlayer({
    playerId: identity?.espnId ?? routePlayerId,
    playerName: identity?.displayName ?? brefNameHint,
  }).map((row) => ({ ...row, playerId: routePlayerId }));
}

/**
 * Preserve current franchise identity during the offseason without a 30-team
 * roster crawl. ESPN's athlete profile already carries the current team id;
 * synthesize only the explicit zero-GP preseason shell from that profile.
 */
function overlayProfileTeamForPreseason(
  routePlayerId: string,
  rows: PlayerSeason[],
  player: Player | null
): PlayerSeason[] {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (!isPreseasonRosterSeason(season) || !player?.currentTeamId) return rows;

  const teamId = String(player.currentTeamId).trim();
  if (!teamId) return rows;
  const canonical = resolveCanonicalTeam(teamId);
  const teamName =
    canonical.status === "resolved"
      ? canonical.team.displayName
      : teamId;
  const teamAbbreviation =
    canonical.status === "resolved" ? canonical.team.abbr : undefined;
  const existingIndex = rows.findIndex((row) => row.season === season);
  const existing = existingIndex >= 0 ? rows[existingIndex]! : null;

  // Never overwrite a season that has actual games.
  if (existing && Number.isFinite(existing.gamesPlayed) && existing.gamesPlayed > 0) {
    return rows;
  }

  const playerName =
    firstUsablePlayerDisplayName(
      player.fullName,
      existing?.playerName,
      rows[0]?.playerName
    ) ?? routePlayerId;
  const row = existing
    ? {
        ...existing,
        playerName,
        teamId,
        teamName,
        teamAbbreviation,
        teamIdProvider: "espn" as const,
        providerTeamId: teamId,
        position: player.position ?? existing.position,
        age: player.age ?? existing.age,
        gamesPlayed: 0,
        gamesStarted: 0,
        minutes: 0,
      }
    : withPlayerSeasonDefaults({
        playerId: routePlayerId,
        playerName,
        teamId,
        teamName,
        teamAbbreviation,
        teamIdProvider: "espn",
        providerTeamId: teamId,
        season,
        position: player.position,
        age: player.age,
        gamesPlayed: 0,
        gamesStarted: 0,
        minutes: 0,
      });

  if (existingIndex >= 0) {
    const next = [...rows];
    next[existingIndex] = row;
    return next;
  }
  return [row, ...rows];
}

/**
 * First-paint career loader for `/players/[playerId]`.
 *
 * On Vercel: prefer in-repo history immediately when present, and only wait a
 * short budget for live ESPN so cold TTFB stays bounded.
 */
export async function getPlayerCriticalCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const identity = await resolvePlayerIdentityCached(playerId).catch(() => null);
  const provider = getDataProvider();
  const statsId = identity?.nbaId ?? playerId;
  const lookupIds = uniquePlayerIds(
    identity?.nbaId,
    playerId,
    identity?.espnId
  );
  const history = historyCareerFallback(playerId, lookupIds);

  const loadCareer = async (id: string): Promise<PlayerSeason[]> =>
    typeof provider.getPlayerCareerSeasons === "function"
      ? provider.getPlayerCareerSeasons(id).catch(() => [])
      : [];

  const loadLive = async (): Promise<{
    rows: PlayerSeason[];
    player: Player | null;
  }> => {
    let [rows, player] = await Promise.all([
      loadCareer(statsId),
      provider.getPlayer(statsId).catch(() => null),
    ]);

    if (rows.length === 0 && statsId !== playerId) {
      const [fallbackRows, fallbackPlayer] = await Promise.all([
        loadCareer(playerId),
        player
          ? Promise.resolve(null)
          : provider.getPlayer(playerId).catch(() => null),
      ]);
      rows = fallbackRows;
      player = player ?? fallbackPlayer;
    }
    return { rows, player };
  };

  const finalize = (
    rowsIn: PlayerSeason[],
    player: Player | null
  ): PlayerSeason[] => {
    // Bundled careers skip live ESPN profile — still apply current franchise
    // from the roster snapshot so offseason trades (e.g. Giannis → MIA) brand.
    const bundledTeamId = resolveBundledCurrentTeamId(
      identity?.espnId,
      playerId,
      identity?.nbaId
    );
    const profile: Player | null =
      player?.currentTeamId
        ? player
        : bundledTeamId
          ? ({
              id: playerId,
              fullName:
                firstUsablePlayerDisplayName(
                  identity?.displayName,
                  player?.fullName,
                  rowsIn[0]?.playerName
                ) ?? playerId,
              currentTeamId: bundledTeamId,
            } as Player)
          : player;
    let rows = overlayProfileTeamForPreseason(playerId, rowsIn, profile);
    const resolvedName = firstUsablePlayerDisplayName(
      identity?.displayName,
      player?.fullName
    );
    if (resolvedName) {
      rows = rows.map((row) =>
        isSyntheticPlayerDisplayName(row.playerName)
          ? { ...row, playerName: resolvedName }
          : row
      );
    }
    return rows.sort((a, b) =>
      a.season === b.season
        ? (a.teamAbbreviation ?? a.teamId).localeCompare(
            b.teamAbbreviation ?? b.teamId
          )
        : b.season.localeCompare(a.season)
    );
  };

  const preferBundled = preferBundledProductDataOnEdge();
  const raceLiveCareer =
    isConstrainedServerRuntime() ||
    preferBundled ||
    (isVercelRuntime() && history.length > 0);

  const loadBrefSlugCareer = async (): Promise<PlayerSeason[]> => {
    let slug = parseBrefPlayerSlug(playerId);
    // Name-shaped search ids: upgrade to a BRef slug via the search snapshot when present.
    if (!slug) {
      const nameHint =
        displayNameFromBrefRouteId(playerId) ||
        identity?.displayName ||
        null;
      if (nameHint) {
        try {
          const { getPlayerSearchIndex } = await import(
            "@/data/runtime/player-search-snapshot"
          );
          const want = nameHint
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          for (const row of getPlayerSearchIndex()) {
            if (row.nameLower !== want) continue;
            slug = parseBrefPlayerSlug(row.id);
            if (slug) break;
          }
        } catch {
          // keep name-only path
        }
      }
    }
    if (!slug) return [];
    try {
      const { loadCareerFromBrefSlug } = await import(
        "@/data/providers/nba/bref-career-from-page"
      );
      return await loadCareerFromBrefSlug(slug, playerId);
    } catch {
      return [];
    }
  };

  if (raceLiveCareer) {
    // Slim edge: prefer bundled BRef career immediately — don't burn CPU on ESPN.
    if (slimEdgeProductEnabled()) {
      if (history.length > 0) {
        return finalize(history, null);
      }
      const fromBundle = bundledCareerRows(playerId, identity);
      if (fromBundle.length > 0) {
        let rows = fromBundle;
        try {
          const { attachDrblToPlayerSeasons } = await import(
            "@/data/queries/players"
          );
          rows = await attachDrblToPlayerSeasons(playerId, rows);
        } catch {
          // keep BRef-only career
        }
        return finalize(rows, null);
      }
      const fromBrefPage = await loadBrefSlugCareer();
      if (fromBrefPage.length > 0) return finalize(fromBrefPage, null);
      // No bundle hit: soft-empty on slim edge (avoid uncancellable ESPN).
      return finalize([], null);
    }

    // Paid Cloudflare / constrained: race live ESPN, then union with history +
    // BRef so career sparklines are never truncated to the live window alone.
    //
    // On Workers, disk history is usually empty but the BRef bundle already has
    // full careers. Racing ESPN anyway (even with a short budget) leaves the
    // uncancellable fetch burning isolate CPU and made season switches feel
    // multi-second — skip live when the bundle already covers the career.
    const fromBundle = bundledCareerRows(playerId, identity);
    const base = unionCareerBySeason(history, fromBundle);
    if (preferBundled && base.length > 0) {
      // Bundle window truncates pre-1997 legends — try full BRef page when
      // the route is a bref: id (name- or slug-shaped search hit).
      if (String(playerId).toLowerCase().startsWith("bref:")) {
        const fromBrefPage = await loadBrefSlugCareer();
        if (fromBrefPage.length > 0) {
          return finalize(unionCareerBySeason(base, fromBrefPage), null);
        }
      }
      return finalize(base, null);
    }

    if (preferBundled && base.length === 0) {
      const fromBrefPage = await loadBrefSlugCareer();
      if (fromBrefPage.length > 0) return finalize(fromBrefPage, null);
    }

    const budgetMs = preferBundled
      ? 2_500
      : runtimeTimeoutMs(6_000, 2_000);
    let live: { rows: PlayerSeason[]; player: Player | null } | null = null;
    try {
      live = await Promise.race([
        loadLive(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), budgetMs)
        ),
      ]);
    } catch {
      live = null;
    }

    const merged = unionCareerBySeason(live?.rows ?? [], base);
    if (merged.length > 0) {
      return finalize(merged, live?.player ?? null);
    }

    const fromBrefPage = await loadBrefSlugCareer();
    if (fromBrefPage.length > 0) return finalize(fromBrefPage, null);
  }

  const live = await loadLive();
  const fromBundle = bundledCareerRows(playerId, identity);
  const merged = unionCareerBySeason(
    live.rows,
    unionCareerBySeason(history, fromBundle)
  );
  if (merged.length > 0) {
    return finalize(merged, live.player);
  }
  const fromBrefPage = await loadBrefSlugCareer();
  return finalize(fromBrefPage, live.player);
}

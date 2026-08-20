/**
 * Safe transaction player resolution - exact canonical identity only.
 * Never fuzzy-matches. Never invents picks/assets from free text.
 *
 * Server-only: builds a board name index via data queries (may touch fs).
 * Client UI must import types/partition from `@/lib/transaction-player-resolution`.
 */

import "server-only";

import { getFilteredPlayerSeasons } from "@/data/queries/players";
import {
  descriptionLooksLikeDraftCompensation,
  extractTransactionPlayerMentions,
  type ExtractedTransactionPlayerMention,
} from "@/lib/transaction-player-extract";
import type {
  TransactionPlayerCandidate,
  TransactionPlayerResolution,
} from "@/lib/transaction-player-resolution";
import { normalizePlayerName } from "@/lib/player-name";
import { playerPageHref } from "@/lib/player-season-resolve";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";

export type {
  DescriptionPart,
  TransactionPlayerCandidate,
  TransactionPlayerResolution,
  TransactionPlayerResolutionStatus,
} from "@/lib/transaction-player-resolution";
export { partitionTransactionDescription } from "@/lib/transaction-player-resolution";

export type TransactionPlayerIndexEntry = {
  playerId: string;
  playerName: string;
  normalizedName: string;
  teamIds: Set<string>;
  seasons: Set<string>;
};

type NameIndex = Map<string, TransactionPlayerIndexEntry[]>;

let indexPromise: Promise<NameIndex> | null = null;
const resolutionCache = new Map<string, TransactionPlayerResolution>();

export function clearTransactionPlayerResolutionCache() {
  indexPromise = null;
  resolutionCache.clear();
}

function cacheKey(
  normalizedName: string,
  teamId?: string | null,
  season?: string | null
): string {
  return `${normalizedName}|${teamId ?? ""}|${season ?? ""}`;
}

async function buildNameIndex(): Promise<NameIndex> {
  const start = currentNbaStartYear();
  const seasons = [0, 1, 2, 3].map((d) =>
    canonicalSeasonFromStartYear(start - d)
  );
  const boards = await Promise.all(
    seasons.map((season) =>
      getFilteredPlayerSeasons({ season, minimumGames: 1 }).catch(() => [])
    )
  );

  const byId = new Map<string, TransactionPlayerIndexEntry>();
  for (const rows of boards) {
    for (const row of rows) {
      if (!row.playerId?.trim() || !row.playerName?.trim()) continue;
      const existing = byId.get(row.playerId);
      if (existing) {
        existing.teamIds.add(row.teamId);
        existing.seasons.add(row.season);
        continue;
      }
      byId.set(row.playerId, {
        playerId: row.playerId,
        playerName: row.playerName,
        normalizedName: normalizePlayerName(row.playerName),
        teamIds: new Set([row.teamId]),
        seasons: new Set([row.season]),
      });
    }
  }

  const byName: NameIndex = new Map();
  for (const entry of byId.values()) {
    const list = byName.get(entry.normalizedName) ?? [];
    list.push(entry);
    byName.set(entry.normalizedName, list);
  }
  return byName;
}

export async function getTransactionPlayerNameIndex(): Promise<NameIndex> {
  if (!indexPromise) {
    indexPromise = buildNameIndex().catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

function toCandidate(entry: TransactionPlayerIndexEntry): TransactionPlayerCandidate {
  return {
    playerId: entry.playerId,
    playerName: entry.playerName,
    teamIds: [...entry.teamIds],
    seasons: [...entry.seasons].sort(),
  };
}

function pickSeason(entry: TransactionPlayerIndexEntry): string {
  const seasons = [...entry.seasons].sort((a, b) => b.localeCompare(a));
  return seasons[0] ?? canonicalSeasonFromStartYear(currentNbaStartYear());
}

function resolveAgainstIndex(
  mention: ExtractedTransactionPlayerMention,
  index: NameIndex,
  context: { teamId?: string | null; season?: string | null }
): TransactionPlayerResolution {
  if (!mention.normalizedName) {
    return {
      status: "invalid",
      mention,
      playerId: null,
      playerName: null,
      href: null,
      teamKey: null,
      candidates: [],
      reason: "Empty player mention",
    };
  }

  const matches = index.get(mention.normalizedName) ?? [];
  if (!matches.length) {
    return {
      status: "unresolved",
      mention,
      playerId: null,
      playerName: null,
      href: null,
      teamKey: null,
      candidates: [],
      reason: "No exact canonical name match in player board index",
    };
  }

  const teamBrand = resolveTeamBrand(context.teamId);
  const teamKeys = new Set(
    [context.teamId, teamBrand?.espnTeamId, teamBrand?.id, teamBrand?.abbr]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase())
  );

  let narrowed = matches;
  if (matches.length > 1 && teamKeys.size) {
    const byTeam = matches.filter((m) =>
      [...m.teamIds].some((tid) => teamKeys.has(String(tid).toLowerCase()))
    );
    if (byTeam.length === 1) {
      narrowed = byTeam;
    } else if (byTeam.length > 1) {
      narrowed = byTeam;
    }
  }

  if (narrowed.length > 1 && context.season) {
    const bySeason = narrowed.filter((m) => m.seasons.has(context.season!));
    if (bySeason.length === 1) narrowed = bySeason;
    else if (bySeason.length > 1) narrowed = bySeason;
  }

  if (narrowed.length > 1) {
    return {
      status: "ambiguous",
      mention,
      playerId: null,
      playerName: null,
      href: null,
      teamKey: null,
      candidates: narrowed.map(toCandidate),
      reason: "Multiple canonical players share this exact name",
    };
  }

  const hit = narrowed[0]!;
  const season = pickSeason(hit);
  const teamKey =
    [...hit.teamIds].find((tid) => teamKeys.has(String(tid).toLowerCase())) ??
    [...hit.teamIds][0] ??
    null;

  return {
    status: "resolved",
    mention,
    playerId: hit.playerId,
    playerName: hit.playerName,
    href: playerPageHref(hit.playerId, season),
    teamKey,
    candidates: [toCandidate(hit)],
    reason: null,
  };
}

/**
 * Resolve every player mention in a source-event description.
 * Draft-compensation blurbs may still resolve named players; they never mint pick assets.
 */
export async function resolveTransactionPlayersInText(
  description: string,
  context: { teamId?: string | null; season?: string | null } = {}
): Promise<TransactionPlayerResolution[]> {
  const mentions = extractTransactionPlayerMentions(description);
  if (!mentions.length) {
    if (descriptionLooksLikeDraftCompensation(description)) {
      return [];
    }
    return [];
  }

  const index = await getTransactionPlayerNameIndex();
  return mentions.map((mention) => {
    const key = cacheKey(
      mention.normalizedName,
      context.teamId,
      context.season
    );
    const cached = resolutionCache.get(key);
    if (cached) {
      return { ...cached, mention };
    }
    const resolved = resolveAgainstIndex(mention, index, context);
    resolutionCache.set(key, resolved);
    return resolved;
  });
}

export async function resolvePlayersForTransactionEvents(
  events: NbaTransactionEvent[]
): Promise<Map<string, TransactionPlayerResolution[]>> {
  const index = await getTransactionPlayerNameIndex();
  const out = new Map<string, TransactionPlayerResolution[]>();
  for (const event of events) {
    const mentions = extractTransactionPlayerMentions(event.description);
    const resolutions = mentions.map((mention) => {
      const key = cacheKey(mention.normalizedName, event.teamId, event.season);
      const cached = resolutionCache.get(key);
      if (cached) return { ...cached, mention };
      const resolved = resolveAgainstIndex(mention, index, {
        teamId: event.teamId,
        season: event.season,
      });
      resolutionCache.set(key, resolved);
      return resolved;
    });
    out.set(event.id, resolutions);
  }
  return out;
}

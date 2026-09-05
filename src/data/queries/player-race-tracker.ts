import "server-only";

import { cache } from "react";

import {
  brefAdvancedSnapshotMeta,
  getBundledBrefPeerBoard,
} from "@/data/runtime/bref-advanced-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import { getBundledDarkoSeason } from "@/data/runtime/impact-overlay-snapshot";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import {
  PLAYER_GAME_LOG_RACE_MIN_FILES,
  resolvePlayerGameLogSeasons,
  resolvePlayerSeasonGameLog,
} from "@/data/runtime/player-game-logs-store";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  approxPlayerRaceSeasonWindow,
  buildPlayerRaceOverlayPlayer,
  buildPlayerRacePlayer,
  getPlayerRaceMetricDef,
  isCombinedRaceTeam,
  parsePlayerRaceFieldSize,
  parsePlayerRaceMetric,
  parsePlayerRaceMinMinutes,
  parsePlayerRaceRankEnd,
  playerRaceMetricLabel,
  playerRaceUsesSeasonOverlay,
  sortPlayerRacePlayers,
  takePlayerRaceFieldSlice,
  type PlayerRaceFieldSize,
  type PlayerRaceMetric,
  type PlayerRacePlayer,
  type PlayerRaceRankEnd,
} from "@/lib/player-race-tracker";
import { normalizePlayerName } from "@/lib/player-name";
import {
  parseVizTeamKeys,
  playerMatchesAnyVizTeam,
} from "@/lib/viz-team-highlight";

/** Default ranked pool when requesting a top-N field (not full league). */
const CANDIDATE_POOL = 120;
/** Uncapped board scan — Explore "All players" must include every ranked row. */
const FULL_LEAGUE_POOL = Number.POSITIVE_INFINITY;
/** Soft cap only for oversized finite fields (normally unreachable via UI max). */
const MAX_LOG_LOADS = 120;
const LOAD_BATCH_SIZE = 24;

export type PlayerRaceTrackerPayload = {
  season: string;
  requestedSeason: string;
  metric: PlayerRaceMetric;
  metricLabel: string;
  players: PlayerRacePlayer[];
  /** Requested field size (`all` = every ranked player with baked logs). */
  fieldSize: PlayerRaceFieldSize;
  /** @deprecated Prefer `fieldSize`; kept for older clients / checks. */
  topN: number;
  rankEnd: PlayerRaceRankEnd;
  /** Minimum regular-season minutes to appear in the field (pins exempt). */
  minMinutes: number;
  /** Optional team abbr highlights (`?team=BOS` or `?team=BOS,NYK`). */
  teamKeys: string[];
  warning?: string;
};

export type RaceCandidate = {
  espnId: string | null;
  nbaId: string | null;
  displayName: string;
  teamAbbr: string;
  teamId: string;
  total: number;
  /** Season minutes when known from the board (used to filter before log IO). */
  minutes?: number;
};

function teamFromLooseId(raw: string): { teamId: string; teamAbbr: string } {
  const token = String(raw ?? "").trim();
  if (!token) return { teamId: "", teamAbbr: "" };
  const resolved = resolveCanonicalTeam(token);
  if (resolved.status === "resolved") {
    return {
      teamId: resolved.team.canonicalTeamId,
      teamAbbr: resolved.team.abbr,
    };
  }
  const brand = resolveTeamBrand(token);
  if (brand) {
    return { teamId: brand.espnTeamId, teamAbbr: brand.abbr };
  }
  return { teamId: token, teamAbbr: token.toUpperCase().slice(0, 3) };
}

function boardCountingTotal(
  row: {
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    minutes: number;
    fieldGoalsMade?: number;
    fieldGoalsAttempted?: number;
    threePointersMade?: number;
    threePointersAttempted?: number;
    freeThrowsMade?: number;
    freeThrowsAttempted?: number;
    offensiveRebounds?: number;
    defensiveRebounds?: number;
  },
  metric: PlayerRaceMetric
): number {
  switch (metric) {
    case "points":
      return row.points;
    case "rebounds":
      return row.rebounds;
    case "offensiveRebounds":
      return Number(row.offensiveRebounds ?? 0);
    case "defensiveRebounds":
      return Number(row.defensiveRebounds ?? 0);
    case "assists":
      return row.assists;
    case "steals":
      return row.steals;
    case "blocks":
      return row.blocks;
    case "turnovers":
      return row.turnovers;
    case "minutes":
      return row.minutes;
    case "fgm":
      return Number(row.fieldGoalsMade ?? 0);
    case "fga":
      return Number(row.fieldGoalsAttempted ?? 0);
    case "threePm":
      return Number(row.threePointersMade ?? 0);
    case "threePa":
      return Number(row.threePointersAttempted ?? 0);
    case "ftm":
      return Number(row.freeThrowsMade ?? 0);
    case "fta":
      return Number(row.freeThrowsAttempted ?? 0);
    default:
      return 0;
  }
}

function boardAdvancedTotal(
  row: {
    bpm?: number;
    vorp?: number;
    per?: number;
    winShares?: number;
    winSharesPer48?: number;
    usagePct?: number;
    trueShootingPct?: number;
  },
  metric: PlayerRaceMetric
): number {
  switch (metric) {
    case "bpm":
      return Number(row.bpm ?? 0);
    case "vorp":
      return Number(row.vorp ?? 0);
    case "per":
      return Number(row.per ?? 0);
    case "winShares":
      return Number(row.winShares ?? 0);
    case "ws48":
      return Number(row.winSharesPer48 ?? 0);
    case "usagePct":
      return Number(row.usagePct ?? 0);
    case "trueShootingPct":
      return Number(row.trueShootingPct ?? 0);
    default:
      return 0;
  }
}

function upsertCandidate(
  byKey: Map<string, RaceCandidate & { gamesPlayed: number }>,
  key: string,
  next: RaceCandidate & { gamesPlayed: number },
  accumulate: boolean
) {
  const prev = byKey.get(key);
  if (!prev) {
    byKey.set(key, next);
    return;
  }
  if (accumulate) prev.total += next.total;
  else if (next.gamesPlayed >= prev.gamesPlayed) prev.total = next.total;
  if (next.gamesPlayed >= prev.gamesPlayed) {
    prev.teamAbbr = next.teamAbbr || prev.teamAbbr;
    prev.teamId = next.teamId || prev.teamId;
    prev.gamesPlayed = next.gamesPlayed;
    prev.displayName = next.displayName;
    if (next.minutes != null) prev.minutes = next.minutes;
  } else if (prev.minutes == null && next.minutes != null) {
    prev.minutes = next.minutes;
  }
  if (!prev.nbaId && next.nbaId) prev.nbaId = next.nbaId;
  if (!prev.espnId && next.espnId) prev.espnId = next.espnId;
}

function finalizeCandidates(
  byKey: Map<string, RaceCandidate & { gamesPlayed: number }>,
  metric: PlayerRaceMetric,
  limit: number
): RaceCandidate[] {
  const higher = getPlayerRaceMetricDef(metric).higherIsBetter !== false;
  const sorted = [...byKey.values()]
    .filter((row) => Number.isFinite(row.total))
    .sort(
      (a, b) =>
        (higher ? b.total - a.total : a.total - b.total) ||
        a.displayName.localeCompare(b.displayName)
    );
  const capped =
    Number.isFinite(limit) && limit < sorted.length
      ? sorted.slice(0, Math.max(1, limit))
      : sorted;
  return capped.map(({ gamesPlayed: _gamesPlayed, ...rest }) => rest);
}

/** BRef season minutes keyed by nba id, espn id, and normalized name. */
function boardMinutesIndex(season: string): {
  byNba: Map<string, number>;
  byEspn: Map<string, number>;
  byName: Map<string, number>;
} {
  const byNba = new Map<string, number>();
  const byEspn = new Map<string, number>();
  const byName = new Map<string, number>();
  const board = getBundledBrefPeerBoard(season);
  for (const row of board) {
    const teamAbbr = String(
      row.teamAbbreviation ?? row.teamId ?? ""
    ).toUpperCase();
    if (isCombinedRaceTeam(teamAbbr)) continue;
    const minutes = Number(row.minutes ?? 0);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const espnId =
      row.playerId && !row.playerId.startsWith("bref:")
        ? String(row.playerId)
        : null;
    const nameKey = normalizePlayerName(row.playerName);
    if (espnId) {
      const prev = byEspn.get(espnId) ?? 0;
      if (minutes >= prev) byEspn.set(espnId, minutes);
    }
    if (nameKey) {
      const prev = byName.get(nameKey) ?? 0;
      if (minutes >= prev) byName.set(nameKey, minutes);
    }
  }
  const aliases = getBundledPlayerIdAliasIndex();
  for (const [espnId, minutes] of byEspn) {
    const nbaId = aliases.byEspn.get(espnId)?.nbaPlayerId;
    if (!nbaId) continue;
    const prev = byNba.get(nbaId) ?? 0;
    if (minutes >= prev) byNba.set(nbaId, minutes);
  }
  return { byNba, byEspn, byName };
}

function attachBoardMinutes(
  season: string,
  candidates: RaceCandidate[]
): RaceCandidate[] {
  const needsLookup = candidates.some(
    (row) => row.minutes == null || !Number.isFinite(row.minutes)
  );
  if (!needsLookup) return candidates;
  const index = boardMinutesIndex(season);
  return candidates.map((row) => {
    if (row.minutes != null && Number.isFinite(row.minutes) && row.minutes > 0) {
      return row;
    }
    const fromNba = row.nbaId ? index.byNba.get(row.nbaId) : undefined;
    const fromEspn = row.espnId ? index.byEspn.get(row.espnId) : undefined;
    const fromName = index.byName.get(normalizePlayerName(row.displayName));
    const minutes = fromNba ?? fromEspn ?? fromName;
    return minutes != null ? { ...row, minutes } : row;
  });
}

function candidateMeetsMinMinutes(
  candidate: RaceCandidate,
  minMinutes: number,
  pinned: boolean
): boolean {
  if (pinned || minMinutes <= 0) return true;
  return (
    candidate.minutes != null &&
    Number.isFinite(candidate.minutes) &&
    candidate.minutes >= minMinutes
  );
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    out.push(...(await Promise.all(batch.map(mapper))));
  }
  return out;
}

/**
 * Rank season leaders for the selected metric (bundled sources only).
 */
export function rankPlayerRaceCandidates(
  season: string,
  metric: PlayerRaceMetric,
  limit = CANDIDATE_POOL
): RaceCandidate[] {
  const def = getPlayerRaceMetricDef(metric);
  const aliases = getBundledPlayerIdAliasIndex();
  const byKey = new Map<string, RaceCandidate & { gamesPlayed: number }>();

  if (metric === "war1" || metric === "r1Points" || metric === "drbl100") {
    const rows = getBundledDrblSeason(season);
    for (const row of rows) {
      const nbaId = String(row.playerId ?? "").trim();
      if (!nbaId) continue;
      const alias = aliases.byNba.get(nbaId);
      const total =
        metric === "war1"
          ? Number(row.r1WinEquivalents ?? Number.NaN)
          : metric === "r1Points"
            ? Number(row.r1Points ?? Number.NaN)
            : Number(row.drbl100 ?? Number.NaN);
      if (!Number.isFinite(total)) continue;
      const espnId = alias?.espnPlayerId ? String(alias.espnPlayerId) : null;
      const team = teamFromLooseId(String(row.teamId ?? ""));
      upsertCandidate(
        byKey,
        nbaId,
        {
          espnId,
          nbaId,
          displayName: row.playerName || nbaId,
          teamAbbr: team.teamAbbr,
          teamId: team.teamId,
          total,
          gamesPlayed: 82,
        },
        false
      );
    }
    return attachBoardMinutes(
      season,
      finalizeCandidates(byKey, metric, limit)
    );
  }

  if (metric === "darkoDpm") {
    const rows = getBundledDarkoSeason(season);
    for (const row of rows) {
      const nbaId = row.nbaPlayerId ? String(row.nbaPlayerId) : null;
      const name = String(row.playerName ?? "").trim();
      if (!name && !nbaId) continue;
      const total = Number(row.impact ?? Number.NaN);
      if (!Number.isFinite(total)) continue;
      const alias = nbaId ? aliases.byNba.get(nbaId) : null;
      const espnId = alias?.espnPlayerId ? String(alias.espnPlayerId) : null;
      const key = nbaId ?? `name:${normalizePlayerName(name)}`;
      const team = teamFromLooseId(String(row.teamAbbr ?? row.teamId ?? ""));
      upsertCandidate(
        byKey,
        key,
        {
          espnId,
          nbaId,
          displayName: name || nbaId || key,
          teamAbbr: team.teamAbbr,
          teamId: team.teamId,
          total,
          gamesPlayed: 82,
        },
        false
      );
    }
    return attachBoardMinutes(
      season,
      finalizeCandidates(byKey, metric, limit)
    );
  }

  const board = getBundledBrefPeerBoard(season);
  if (!board.length) return [];

  for (const row of board) {
    const teamAbbr = String(
      row.teamAbbreviation ?? row.teamId ?? ""
    ).toUpperCase();
    if (isCombinedRaceTeam(teamAbbr)) continue;
    const espnId =
      row.playerId && !row.playerId.startsWith("bref:")
        ? String(row.playerId)
        : null;
    const alias = espnId ? aliases.byEspn.get(espnId) : null;
    const key = espnId ?? `name:${row.playerName.toLowerCase()}`;
    const total =
      def.kind === "counting"
        ? boardCountingTotal(row, metric)
        : boardAdvancedTotal(row, metric);
    if (!Number.isFinite(total)) continue;
    const team = teamFromLooseId(teamAbbr);
    upsertCandidate(
      byKey,
      key,
      {
        espnId,
        nbaId: alias?.nbaPlayerId ?? null,
        displayName: row.playerName,
        teamAbbr: team.teamAbbr || teamAbbr,
        teamId: team.teamId,
        total,
        minutes: Number(row.minutes ?? 0) || undefined,
        gamesPlayed: row.gamesPlayed,
      },
      def.kind === "counting"
    );
  }

  return finalizeCandidates(byKey, metric, limit);
}

/**
 * Cloudflare-safe season list — only seasons with enough baked game logs
 * for a meaningful race chart (falls back to recent board seasons).
 */
export const getPlayerRaceTrackerSeasonOptions = cache(
  async (): Promise<string[]> => {
    const fromLogs = await resolvePlayerGameLogSeasons({
      minFiles: PLAYER_GAME_LOG_RACE_MIN_FILES,
    });
    if (fromLogs.length) return fromLogs;
    const seasons = brefAdvancedSnapshotMeta().seasons;
    if (Array.isArray(seasons) && seasons.length) {
      return [...seasons]
        .filter((season) => /^\d{4}-\d{2}$/.test(season))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 8);
    }
    return ["2024-25", "2025-26"];
  }
);

function lookupPinnedCandidate(
  season: string,
  metric: PlayerRaceMetric,
  pinId: string
): RaceCandidate | null {
  const aliases = getBundledPlayerIdAliasIndex();
  const byNba = aliases.byNba.get(pinId);
  const byEspn = aliases.byEspn.get(pinId);
  const nbaId =
    byNba?.nbaPlayerId ??
    byEspn?.nbaPlayerId ??
    (/^\d+$/.test(pinId) ? pinId : null);
  const espnId = byNba?.espnPlayerId ?? byEspn?.espnPlayerId ?? null;
  const displayName =
    byNba?.playerName ?? byEspn?.playerName ?? `Player ${pinId}`;

  // Scan a wide ranked pool so pins outside the default top-N still get totals.
  const ranked = rankPlayerRaceCandidates(season, metric, FULL_LEAGUE_POOL);
  const hit = ranked.find(
    (row) =>
      (nbaId && row.nbaId === nbaId) ||
      (espnId && row.espnId === espnId) ||
      row.nbaId === pinId ||
      row.espnId === pinId
  );
  if (hit) return hit;

  // Counting races can still curve from game logs without a board total.
  if (playerRaceUsesSeasonOverlay(metric)) return null;
  if (!nbaId && !espnId) return null;
  return {
    espnId,
    nbaId,
    displayName,
    teamAbbr: "",
    teamId: "",
    total: 0,
  };
}

/**
 * Build race curves from bundled rankings + baked game logs only.
 * Never calls live ESPN — required for Cloudflare Workers.
 *
 * Performance: rank + minutes-filter on the board first, then fetch game logs
 * only for finite top-N fields. "All players" synthesizes a shared calendar from
 * season totals (counting + overlay metrics) so the full continuous field renders.
 */
export const getPlayerRaceTrackerPayload = cache(
  async (
    season: string,
    metricRaw?: string | null,
    topNRaw?: number | string | null,
    pinIdsRaw?: string | null,
    rankEndRaw?: string | null,
    minMinutesRaw?: number | string | null,
    teamRaw?: string | null
  ): Promise<PlayerRaceTrackerPayload> => {
    const metric = parsePlayerRaceMetric(metricRaw);
    const def = getPlayerRaceMetricDef(metric);
    const fieldSize = parsePlayerRaceFieldSize(topNRaw);
    const rankEnd = parsePlayerRaceRankEnd(rankEndRaw, metric);
    const minMinutes = parsePlayerRaceMinMinutes(minMinutesRaw);
    const teamKeys = parseVizTeamKeys(teamRaw);
    const pinIds = [
      ...new Set(
        String(pinIdsRaw ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ].slice(0, 20);
    const options = await getPlayerRaceTrackerSeasonOptions();
    const requestedSeason = season;
    const resolvedSeason = options.includes(season)
      ? season
      : (options[0] ?? season);

    // Always scan a wide board pool in memory — log IO is the expensive part.
    const candidates = rankPlayerRaceCandidates(
      resolvedSeason,
      metric,
      FULL_LEAGUE_POOL
    );

    if (!candidates.length && !pinIds.length) {
      return {
        season: resolvedSeason,
        requestedSeason,
        metric,
        metricLabel: playerRaceMetricLabel(metric),
        players: [],
        fieldSize,
        topN: fieldSize === "all" ? 0 : fieldSize,
        rankEnd,
        minMinutes,
        teamKeys,
        warning: `No bundled leaders for ${playerRaceMetricLabel(metric)} in ${resolvedSeason}.`,
      };
    }

    const pinKey = (candidate: RaceCandidate) =>
      candidate.nbaId ?? candidate.espnId ?? candidate.displayName;

    const pinKeySet = new Set(pinIds);
    const candidateIsPinned = (candidate: RaceCandidate) =>
      (candidate.nbaId != null && pinKeySet.has(candidate.nbaId)) ||
      (candidate.espnId != null && pinKeySet.has(candidate.espnId)) ||
      pinKeySet.has(candidate.displayName);
    const candidateOnTeam = (candidate: RaceCandidate) =>
      playerMatchesAnyVizTeam(candidate, teamKeys);

    const qualified = candidates.filter((candidate) =>
      candidateMeetsMinMinutes(
        candidate,
        minMinutes,
        candidateIsPinned(candidate) || candidateOnTeam(candidate)
      )
    );
    const unpinned = qualified.filter(
      (row) => !candidateIsPinned(row) && !candidateOnTeam(row)
    );
    let fieldCandidates =
      fieldSize === "all"
        ? qualified.filter((row) => !candidateIsPinned(row))
        : takePlayerRaceFieldSlice(unpinned, fieldSize, rankEnd, pinKey);

    // Soft-cap only for finite top-N fields. "All players" must include the
    // full continuous board (no top/bottom hole around replacement level).
    let fieldCapped = false;
    if (fieldSize !== "all" && fieldCandidates.length > MAX_LOG_LOADS) {
      fieldCandidates = takePlayerRaceFieldSlice(
        unpinned,
        MAX_LOG_LOADS,
        rankEnd,
        pinKey
      );
      fieldCapped = true;
    }

    const loadList: RaceCandidate[] = [...fieldCandidates];
    const seenKeys = new Set(loadList.map(pinKey));
    for (const pinId of pinIds) {
      const pinned = lookupPinnedCandidate(resolvedSeason, metric, pinId);
      if (!pinned) continue;
      const key = pinKey(pinned);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      loadList.push(pinned);
    }
    if (teamKeys.length) {
      for (const candidate of qualified) {
        if (!candidateOnTeam(candidate)) continue;
        const key = pinKey(candidate);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        loadList.push(candidate);
      }
    }

    const overlayWindow = approxPlayerRaceSeasonWindow(resolvedSeason);

    // Full-league fields: synthesize calendars from season totals so every
    // ranked player appears without hundreds of game-log asset fetches.
    const overlayOnlyAllField = fieldSize === "all";

    const loaded = await mapInBatches(
      loadList,
      overlayOnlyAllField ? 48 : LOAD_BATCH_SIZE,
      async (candidate) => {
        const playerId =
          candidate.nbaId ?? candidate.espnId ?? candidate.displayName;

        if (!Number.isFinite(candidate.total) && overlayOnlyAllField) {
          return null;
        }

        if (overlayOnlyAllField) {
          // Pins still prefer baked logs when available for a truer path.
          const pinnedHere = candidateIsPinned(candidate);
          if (pinnedHere) {
            const games = await resolvePlayerSeasonGameLog({
              season: resolvedSeason,
              playerId,
              nbaId: candidate.nbaId,
              espnId: candidate.espnId,
            });
            if (games.length) {
              const player = buildPlayerRacePlayer({
                playerId,
                espnId: candidate.espnId,
                nbaId: candidate.nbaId,
                displayName: candidate.displayName,
                teamId: candidate.teamId,
                teamAbbr: candidate.teamAbbr,
                games,
                metric,
                seasonTotal: playerRaceUsesSeasonOverlay(metric)
                  ? candidate.total
                  : null,
              });
              if (player.points.length) {
                if (
                  (player.minutesPlayed <= 0 ||
                    !Number.isFinite(player.minutesPlayed)) &&
                  candidate.minutes != null
                ) {
                  player.minutesPlayed = candidate.minutes;
                }
                return player;
              }
            }
          }

          return buildPlayerRaceOverlayPlayer({
            playerId,
            espnId: candidate.espnId,
            nbaId: candidate.nbaId,
            displayName: candidate.displayName,
            teamId: candidate.teamId,
            teamAbbr: candidate.teamAbbr,
            metric,
            seasonTotal: candidate.total,
            startDate: overlayWindow.startDate,
            endDate: overlayWindow.endDate,
            gamesPlayed: 82,
            minutesPlayed: candidate.minutes,
          });
        }

        const games = await resolvePlayerSeasonGameLog({
          season: resolvedSeason,
          playerId,
          nbaId: candidate.nbaId,
          espnId: candidate.espnId,
        });

        if (games.length) {
          const player = buildPlayerRacePlayer({
            playerId,
            espnId: candidate.espnId,
            nbaId: candidate.nbaId,
            displayName: candidate.displayName,
            teamId: candidate.teamId,
            teamAbbr: candidate.teamAbbr,
            games,
            metric,
            seasonTotal: playerRaceUsesSeasonOverlay(metric)
              ? candidate.total
              : null,
          });
          if (!player.points.length) return null;
          if (
            (player.minutesPlayed <= 0 ||
              !Number.isFinite(player.minutesPlayed)) &&
            candidate.minutes != null
          ) {
            player.minutesPlayed = candidate.minutes;
          }
          return player;
        }

        // Finite fields: fall back to overlay when logs are missing.
        if (
          playerRaceUsesSeasonOverlay(metric) &&
          Number.isFinite(candidate.total)
        ) {
          return buildPlayerRaceOverlayPlayer({
            playerId,
            espnId: candidate.espnId,
            nbaId: candidate.nbaId,
            displayName: candidate.displayName,
            teamId: candidate.teamId,
            teamAbbr: candidate.teamAbbr,
            metric,
            seasonTotal: candidate.total,
            startDate: overlayWindow.startDate,
            endDate: overlayWindow.endDate,
            gamesPlayed: 82,
            minutesPlayed: candidate.minutes,
          });
        }

        return null;
      }
    );

    const usable = loaded.filter((row): row is PlayerRacePlayer => Boolean(row));
    const isPinned = (player: PlayerRacePlayer) =>
      pinKeySet.has(player.playerId) ||
      (player.nbaId != null && pinKeySet.has(player.nbaId)) ||
      (player.espnId != null && pinKeySet.has(player.espnId));

    // Log-backed minutes filter for candidates that lacked board minutes.
    const minutesOk = usable.filter(
      (player) =>
        isPinned(player) ||
        minMinutes <= 0 ||
        player.minutesPlayed >= minMinutes
    );

    const merged = sortPlayerRacePlayers(minutesOk, metric, rankEnd);

    const fallbackNote =
      resolvedSeason !== requestedSeason
        ? `No usable baked game logs for ${requestedSeason}; showing ${resolvedSeason}.`
        : undefined;

    const shareNote =
      def.kind === "season_total" && merged.length
        ? overlayOnlyAllField
          ? `${def.label} curves pace each player's season total across a shared calendar (full league field).`
          : `${def.label} curves pace the season total across games by minutes.`
        : def.kind === "season_rate" && merged.length
          ? overlayOnlyAllField
            ? `${def.label} paths are reconstructed from season rates onto a shared calendar for the full league field.`
            : `${def.label} paths are reconstructed from game logs (or a synthetic schedule when logs are missing) and settle on the published season rate — not live PBP recompute.`
          : def.kind === "counting" && overlayOnlyAllField && merged.length
            ? `${def.label} curves pace each player's season total across a shared calendar (full league field).`
            : undefined;

    const minutesNote =
      minMinutes > 0
        ? `Min ${minMinutes.toLocaleString()} MP — players under that (or without known minutes) are hidden; pins exempt.`
        : undefined;

    const endNote =
      rankEnd === "both" && fieldSize !== "all"
        ? `Showing both ends of the board (${Math.ceil(fieldSize / 2)} highest + ${Math.floor(fieldSize / 2)} lowest by ${def.shortLabel}).`
        : rankEnd === "both" && fieldSize === "all"
          ? `Full field (${merged.length} players) — positive and negative ${def.shortLabel} on one chart.`
          : rankEnd === "low" && fieldSize !== "all"
            ? `Showing the lowest ${fieldSize} by ${def.shortLabel}.`
            : rankEnd === "low" && fieldSize === "all"
              ? `Sorted lowest ${def.shortLabel} first.`
              : fieldSize === "all"
                ? `Full league field (${merged.length} players).`
                : undefined;

    const capNote = fieldCapped
      ? rankEnd === "both"
        ? `Capped at ${MAX_LOG_LOADS} players (both ends) for speed — tighten Min MP or choose All players for the full field.`
        : `Showing ${MAX_LOG_LOADS} players for speed — tighten Min MP or choose All players for the full field.`
      : undefined;

    const shortField =
      fieldSize !== "all" &&
      fieldCandidates.length > 0 &&
      merged.filter((p) => !isPinned(p)).length <
        Math.min(fieldSize, fieldCandidates.length)
        ? `Showing ${merged.length} players — some ${
            rankEnd === "low"
              ? "trailers"
              : rankEnd === "both"
                ? "players"
                : "leaders"
          } lack baked game logs${minMinutes > 0 ? " or minutes" : ""}.`
        : undefined;

    return {
      season: resolvedSeason,
      requestedSeason,
      metric,
      metricLabel: playerRaceMetricLabel(metric),
      players: merged,
      fieldSize,
      topN: fieldSize === "all" ? merged.length : fieldSize,
      rankEnd,
      minMinutes,
      teamKeys,
      warning:
        fallbackNote ??
        (merged.length === 0
          ? minMinutes > 0
            ? `No players with ≥${minMinutes} MP and baked logs for ${metric} in ${resolvedSeason}.`
            : `No baked game logs for ${metric} in ${resolvedSeason}.`
          : [shortField, endNote, capNote, minutesNote, shareNote]
              .filter(Boolean)
              .join(" ") || undefined),
    };
  }
);

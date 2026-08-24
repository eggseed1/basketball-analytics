import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import { getRuntimeSnapshotGame, resolveRuntimeSnapshotGameId } from "@/data/runtime/game-snapshot";
import type { PlayerGame } from "@/data/types";
import { espnFetchJson } from "./espn-client";
import { espnYearFromCanonicalSeason } from "./season";

const SITE_WEB = "https://site.web.api.espn.com";
const GAME_LOG_TTL_MS = 10 * 60 * 1000;

type EspnGameLogEvent = {
  id?: string;
  gameDate?: string;
  atVs?: string;
  homeAway?: string;
  opponent?: {
    id?: string;
    abbreviation?: string;
    displayName?: string;
  };
  stats?: Array<string | number | null>;
};

type EspnGameLogResponse = {
  names?: string[];
  events?: Record<string, EspnGameLogEvent>;
  seasonTypes?: Array<{
    displayName?: string;
    categories?: Array<{
      type?: string;
      displayName?: string;
      events?: Array<{
        eventId?: string;
        stats?: Array<string | number | null>;
      }>;
    }>;
  }>;
};

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed || trimmed === "-" || trimmed === "--") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePair(value: unknown): [number | null, number | null] {
  if (typeof value !== "string") return [null, null];
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s*[-/]\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return [null, null];
  return [numeric(match[1]), numeric(match[2])];
}

function statReader(names: string[], values: Array<string | number | null> | undefined) {
  const byKey = new Map<string, unknown>();
  names.forEach((name, index) => {
    byKey.set(normalizedKey(name), values?.[index]);
  });

  const raw = (...keys: string[]): unknown => {
    for (const key of keys) {
      const hit = byKey.get(normalizedKey(key));
      if (hit != null && hit !== "") return hit;
    }
    return null;
  };

  const number = (...keys: string[]): number | null => numeric(raw(...keys));
  const pair = (...keys: string[]): [number | null, number | null] =>
    parsePair(raw(...keys));

  return { raw, number, pair };
}

function parseDate(raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
}

function homeFlag(event: EspnGameLogEvent): boolean | null {
  const homeAway = String(event.homeAway ?? "").trim().toLowerCase();
  if (homeAway === "home") return true;
  if (homeAway === "away") return false;

  const atVs = String(event.atVs ?? "").trim().toLowerCase();
  if (atVs === "vs" || atVs === "vs." || atVs === "v") return true;
  if (atVs === "@" || atVs === "at") return false;
  return null;
}

function collectEntries(
  payload: EspnGameLogResponse,
  seasonType: 2 | 3
): EspnGameLogEvent[] {
  const metadata = payload.events ?? {};
  const wanted = seasonType === 2 ? /regular season/i : /postseason|playoffs?/i;
  const preferred = (payload.seasonTypes ?? []).filter((block) =>
    wanted.test(block.displayName ?? "")
  );
  const blocks = preferred.length ? preferred : payload.seasonTypes ?? [];
  const byId = new Map<string, EspnGameLogEvent>();

  for (const block of blocks) {
    for (const category of block.categories ?? []) {
      if (String(category.type ?? "").toLowerCase() === "total") continue;
      for (const row of category.events ?? []) {
        const eventId = String(row.eventId ?? "").trim();
        if (!eventId) continue;
        const meta = metadata[eventId] ?? {};
        byId.set(eventId, {
          ...meta,
          id: eventId,
          stats: row.stats ?? meta.stats,
        });
      }
    }
  }

  if (byId.size === 0) {
    for (const [eventId, meta] of Object.entries(metadata)) {
      byId.set(eventId, { ...meta, id: meta.id ?? eventId });
    }
  }

  return [...byId.values()];
}

function transformEvent(options: {
  event: EspnGameLogEvent;
  names: string[];
  playerId: string;
  playerName?: string;
  fallbackTeamId?: string;
  season: string;
  seasonType: 2 | 3;
}): PlayerGame | null {
  const eventId = String(options.event.id ?? "").trim();
  if (!eventId) return null;

  const canonicalGameId = resolveRuntimeSnapshotGameId(eventId);
  const snapshotGame = getRuntimeSnapshotGame(canonicalGameId);
  const reader = statReader(options.names, options.event.stats);

  let [fieldGoalsMade, fieldGoalsAttempted] = reader.pair(
    "fieldGoalsMade-fieldGoalsAttempted",
    "fieldGoals"
  );
  fieldGoalsMade ??= reader.number("fieldGoalsMade", "fgm");
  fieldGoalsAttempted ??= reader.number("fieldGoalsAttempted", "fga");

  let [threePointersMade, threePointersAttempted] = reader.pair(
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
    "threePointFieldGoals",
    "threePointers"
  );
  threePointersMade ??= reader.number(
    "threePointFieldGoalsMade",
    "threePointersMade",
    "3pm"
  );
  threePointersAttempted ??= reader.number(
    "threePointFieldGoalsAttempted",
    "threePointersAttempted",
    "3pa"
  );

  let [freeThrowsMade, freeThrowsAttempted] = reader.pair(
    "freeThrowsMade-freeThrowsAttempted",
    "freeThrows"
  );
  freeThrowsMade ??= reader.number("freeThrowsMade", "ftm");
  freeThrowsAttempted ??= reader.number("freeThrowsAttempted", "fta");

  const explicitHome = homeFlag(options.event);
  const eventOpponent = String(options.event.opponent?.id ?? "").trim();

  let isHome = explicitHome ?? false;
  let teamId = String(options.fallbackTeamId ?? "").trim();
  let opponentTeamId = eventOpponent;

  if (snapshotGame) {
    if (explicitHome === true) {
      teamId = snapshotGame.homeTeamId;
      opponentTeamId = snapshotGame.awayTeamId;
      isHome = true;
    } else if (explicitHome === false) {
      teamId = snapshotGame.awayTeamId;
      opponentTeamId = snapshotGame.homeTeamId;
      isHome = false;
    } else if (
      eventOpponent &&
      (eventOpponent === snapshotGame.homeTeamId ||
        eventOpponent === snapshotGame.homeProviderTeamId)
    ) {
      teamId = snapshotGame.awayTeamId;
      opponentTeamId = snapshotGame.homeTeamId;
      isHome = false;
    } else if (
      eventOpponent &&
      (eventOpponent === snapshotGame.awayTeamId ||
        eventOpponent === snapshotGame.awayProviderTeamId)
    ) {
      teamId = snapshotGame.homeTeamId;
      opponentTeamId = snapshotGame.awayTeamId;
      isHome = true;
    }
  }

  const points = reader.number("points", "pts") ?? 0;
  const assists = reader.number("assists", "ast") ?? 0;
  const rebounds =
    reader.number("totalRebounds", "rebounds", "reb", "trb") ?? 0;
  const steals = reader.number("steals", "stl") ?? 0;
  const blocks = reader.number("blocks", "blk") ?? 0;
  const turnovers = reader.number("turnovers", "to", "tov") ?? 0;
  const minutes = reader.number("minutes", "min") ?? 0;
  const plusMinus = reader.number("plusMinus", "+/-") ?? Number.NaN;
  const offensiveRebounds = reader.number(
    "offensiveRebounds",
    "reboundsOffensive",
    "oreb",
    "orb"
  );
  const defensiveRebounds = reader.number(
    "defensiveRebounds",
    "reboundsDefensive",
    "dreb",
    "drb"
  );
  const personalFouls = reader.number("personalFouls", "fouls", "pf");

  const fgm = fieldGoalsMade ?? 0;
  const fga = fieldGoalsAttempted ?? 0;
  const tpm = threePointersMade ?? 0;
  const tpa = threePointersAttempted ?? 0;
  const ftm = freeThrowsMade ?? 0;
  const fta = freeThrowsAttempted ?? 0;
  const tsDenominator = 2 * (fga + 0.44 * fta);
  const trueShootingPct = tsDenominator > 0 ? points / tsDenominator : undefined;
  const effectiveFieldGoalPct = fga > 0 ? (fgm + 0.5 * tpm) / fga : undefined;

  return {
    id: `${options.playerId}-${canonicalGameId}`,
    gameId: canonicalGameId,
    playerId: options.playerId,
    ...(options.playerName ? { playerName: options.playerName } : {}),
    teamId,
    season: options.season,
    seasonType: options.seasonType === 2 ? "regular" : "playoffs",
    gameDate: snapshotGame?.gameDate ?? parseDate(options.event.gameDate),
    opponentTeamId,
    isHome,
    minutes,
    points,
    assists,
    rebounds,
    ...(offensiveRebounds != null ? { offensiveRebounds } : {}),
    ...(defensiveRebounds != null ? { defensiveRebounds } : {}),
    steals,
    blocks,
    turnovers,
    ...(personalFouls != null ? { personalFouls } : {}),
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: tpm,
    threePointersAttempted: tpa,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    plusMinus,
    ...(trueShootingPct != null ? { trueShootingPct } : {}),
    ...(effectiveFieldGoalPct != null ? { effectiveFieldGoalPct } : {}),
  };
}

async function fetchSeasonType(options: {
  espnId: string;
  publicPlayerId: string;
  playerName?: string;
  fallbackTeamId?: string;
  season: string;
  seasonType: 2 | 3;
}): Promise<PlayerGame[]> {
  const year = espnYearFromCanonicalSeason(options.season);
  const url =
    `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(options.espnId)}/gamelog` +
    `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=${options.seasonType}`;
  const payload = await espnFetchJson<EspnGameLogResponse>(url, {
    ttlMs: GAME_LOG_TTL_MS,
    retries: 2,
  });

  return collectEntries(payload, options.seasonType)
    .map((event) =>
      transformEvent({
        event,
        names: payload.names ?? [],
        playerId: options.publicPlayerId,
        playerName: options.playerName,
        fallbackTeamId: options.fallbackTeamId,
        season: options.season,
        seasonType: options.seasonType,
      })
    )
    .filter((row): row is PlayerGame => row != null);
}

/**
 * Production-safe player game log. It does not depend on a career fetch after
 * the game-log request, and it canonicalizes ESPN event ids through the same
 * deploy-time NBA game snapshot used by Game Lab.
 */
export async function fetchCompleteEspnPlayerGameLog(
  playerId: string,
  season: string,
  options: { fallbackTeamId?: string; playerName?: string } = {}
): Promise<PlayerGame[]> {
  const identity = await resolvePlayerIdentity(playerId);
  const espnId = identity.espnId;
  if (!espnId) return [];

  const settled = await Promise.allSettled([
    fetchSeasonType({
      espnId,
      publicPlayerId: playerId,
      playerName: options.playerName ?? identity.displayName,
      fallbackTeamId: options.fallbackTeamId,
      season,
      seasonType: 2,
    }),
    fetchSeasonType({
      espnId,
      publicPlayerId: playerId,
      playerName: options.playerName ?? identity.displayName,
      fallbackTeamId: options.fallbackTeamId,
      season,
      seasonType: 3,
    }),
  ]);

  const rows = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  if (!rows.length && settled.every((result) => result.status === "rejected")) {
    const rejected = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    throw rejected?.reason ?? new Error("ESPN player game log unavailable");
  }

  const byGame = new Map<string, PlayerGame>();
  for (const row of rows) {
    const key = `${row.seasonType ?? "regular"}:${row.gameId}`;
    byGame.set(key, row);
  }
  return [...byGame.values()].sort((a, b) =>
    a.gameDate === b.gameDate
      ? b.gameId.localeCompare(a.gameId)
      : b.gameDate.localeCompare(a.gameDate)
  );
}

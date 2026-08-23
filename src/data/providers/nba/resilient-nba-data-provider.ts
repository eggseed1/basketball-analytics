import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import type { Player, PlayerGame, PlayerSeason } from "@/data/types";
import {
  transformEspnPlayerGame,
  type EspnAthleteStatsRow,
  type EspnGameLogEvent,
  type EspnStatCategorySchema,
  type EspnTeamStatsRow,
  type TeamSeasonTotals,
} from "@/data/transformers/espn";
import {
  transformEspnAthleteProfile,
  type EspnAthleteCareerStatsResponse,
  type EspnAthleteProfileResponse,
} from "@/data/transformers/espn-career";
import { NBADataProvider as StatsNbaDataProvider } from "../nba-data-provider";
import { espnFetchJson } from "./espn-client";
import {
  mergePlayerSeasonRows,
  transformCompleteEspnAthleteCareerStats,
  transformCompleteEspnPlayerSeason,
  transformCompleteEspnTeamTotals,
} from "./espn-stat-integrity";
import {
  defaultCanonicalSeasons,
  espnYearFromCanonicalSeason,
} from "./season";

const SITE_WEB = "https://site.web.api.espn.com";
const BOARD_TTL_MS = 1000 * 60 * 15;
const CAREER_TTL_MS = 1000 * 60 * 60 * 12;
const GAME_LOG_TTL_MS = 1000 * 60 * 10;
const MIN_COMPLETE_BOARD_ROWS = 150;

type ByAthleteResponse = {
  pagination?: { pages?: number; page?: number };
  athletes?: EspnAthleteStatsRow[];
  categories?: EspnStatCategorySchema[];
};

type ByTeamResponse = {
  teams?: EspnTeamStatsRow[];
  categories?: EspnStatCategorySchema[];
};

type GameLogResponse = {
  names?: string[];
  events?: Record<string, EspnGameLogEvent>;
  seasonTypes?: Array<{
    displayName?: string;
    categories?: Array<{
      displayName?: string;
      events?: Array<{ eventId?: string; stats?: string[] }>;
    }>;
  }>;
};

type ProviderIds = {
  espnId: string | null;
  nbaId: string | null;
};

function remember<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

function playerFromSeason(row: PlayerSeason): Player {
  const tokens = row.playerName.trim().split(/\s+/);
  return {
    id: row.playerId,
    fullName: row.playerName,
    firstName: tokens[0] ?? row.playerName,
    lastName: tokens.slice(1).join(" ") || row.playerName,
    position: row.position,
    currentTeamId: row.teamId || undefined,
  };
}

function teamGrainKey(row: PlayerSeason): string {
  return (
    row.teamAbbreviation?.trim().toUpperCase() ||
    row.teamId.trim().toUpperCase() ||
    "UNKNOWN"
  );
}

function selectCareerMatch(
  target: PlayerSeason,
  candidates: PlayerSeason[],
  used: Set<number>
): { row: PlayerSeason | null; index: number } {
  const available = candidates
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => row.season === target.season && !used.has(index));
  if (!available.length) return { row: null, index: -1 };

  const targetTeam = teamGrainKey(target);
  const exact = available.find(({ row }) => teamGrainKey(row) === targetTeam);
  if (exact) return exact;

  const targetCombined = targetTeam === "TOT" || /\dTM/.test(targetTeam);
  if (targetCombined) {
    const combined = available.find(({ row }) => {
      const key = teamGrainKey(row);
      return key === "TOT" || /\dTM/.test(key);
    });
    if (combined) return combined;
  }

  return available.length === 1 ? available[0]! : { row: null, index: -1 };
}

function mergeCareerSources(
  espnRows: PlayerSeason[],
  nbaRows: PlayerSeason[],
  espnId: string,
  displayName?: string
): PlayerSeason[] {
  if (!espnRows.length) {
    return nbaRows
      .map((row) => ({
        ...row,
        playerId: espnId || row.playerId,
        playerName: displayName || row.playerName,
      }))
      .sort((a, b) => b.season.localeCompare(a.season));
  }
  if (!nbaRows.length) return espnRows;

  const used = new Set<number>();
  const merged = espnRows.map((espn) => {
    const match = selectCareerMatch(espn, nbaRows, used);
    if (match.index >= 0) used.add(match.index);
    return mergePlayerSeasonRows(espn, match.row);
  });

  for (let index = 0; index < nbaRows.length; index++) {
    if (used.has(index)) continue;
    const nba = nbaRows[index]!;
    merged.push({
      ...nba,
      playerId: espnId,
      playerName: displayName || espnRows[0]?.playerName || nba.playerName,
    });
  }

  return merged.sort((a, b) =>
    a.season === b.season
      ? teamGrainKey(a).localeCompare(teamGrainKey(b))
      : b.season.localeCompare(a.season)
  );
}

/**
 * ESPN-first production provider with stats.nba.com retained as a fallback.
 *
 * Vercel serverless IPs cannot reliably reach stats.nba.com. ESPN's public
 * athlete boards, career tables, profiles, and game logs are therefore the
 * primary source for player-facing routes. The base provider still supplies
 * richer NBA Stats box scores, play-by-play, shots, team tables, and any player
 * data that ESPN cannot resolve.
 */
export class ResilientNBADataProvider extends StatsNbaDataProvider {
  private espnBoardCache = new Map<string, Promise<PlayerSeason[]>>();
  private espnTeamTotalsCache = new Map<
    string,
    Promise<Map<string, TeamSeasonTotals>>
  >();
  private espnCareerCache = new Map<string, Promise<PlayerSeason[]>>();
  private espnProfileCache = new Map<string, Promise<Player | null>>();
  private espnGameLogCache = new Map<string, Promise<PlayerGame[]>>();

  async getPlayers(season?: string): Promise<Player[]> {
    const target = season ?? defaultCanonicalSeasons(1)[0];
    const rows = await this.getPlayerSeasons(target);
    const byId = new Map<string, Player>();
    for (const row of rows) {
      if (!byId.has(row.playerId)) byId.set(row.playerId, playerFromSeason(row));
    }
    return [...byId.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }

  async getPlayer(playerId: string, season?: string): Promise<Player | null> {
    const ids = await this.providerIds(playerId);
    if (ids.espnId) {
      const profile = await this.loadEspnProfile(ids.espnId).catch(() => null);
      if (profile) return profile;

      const career = await this.loadEspnCareer(ids.espnId).catch(() => []);
      const row = season
        ? career.find((item) => item.season === season)
        : career[0];
      if (row) return playerFromSeason(row);
    }

    if (!ids.nbaId) return null;
    return super.getPlayer(ids.nbaId, season).catch(() => null);
  }

  async getPlayerSeasons(season?: string): Promise<PlayerSeason[]> {
    const seasons = season ? [season] : defaultCanonicalSeasons(2);
    const chunks = await Promise.all(
      seasons.map(async (target) => {
        try {
          return await this.loadEspnBoard(target);
        } catch (espnError) {
          try {
            return await super.getPlayerSeasons(target);
          } catch {
            throw espnError;
          }
        }
      })
    );
    return chunks.flat();
  }

  async getPlayerSeason(
    playerId: string,
    season: string
  ): Promise<PlayerSeason | null> {
    const ids = await this.providerIds(playerId);
    if (ids.espnId) {
      const [career, board, nbaRow] = await Promise.all([
        this.loadEspnCareer(ids.espnId).catch(() => []),
        this.loadEspnBoard(season).catch(() => []),
        ids.nbaId
          ? super.getPlayerSeason(ids.nbaId, season).catch(() => null)
          : Promise.resolve(null),
      ]);
      const fromCareer =
        career.find((row) => row.season === season) ?? null;
      const fromBoard =
        board.find((row) => row.playerId === ids.espnId) ?? null;
      let merged =
        fromCareer && fromBoard
          ? mergePlayerSeasonRows(fromCareer, fromBoard)
          : fromCareer ?? fromBoard;
      if (merged && nbaRow) merged = mergePlayerSeasonRows(merged, nbaRow);
      if (merged) return merged;
      if (nbaRow) {
        return {
          ...nbaRow,
          playerId: ids.espnId,
        };
      }
    }

    if (!ids.nbaId) return null;
    return super.getPlayerSeason(ids.nbaId, season).catch(() => null);
  }

  async getPlayerCareerSeasons(playerId: string): Promise<PlayerSeason[]> {
    const ids = await this.providerIds(playerId);
    const [espnCareer, nbaCareer, profile] = await Promise.all([
      ids.espnId
        ? this.loadEspnCareer(ids.espnId).catch(() => [])
        : Promise.resolve([] as PlayerSeason[]),
      ids.nbaId
        ? super.getPlayerCareerSeasons(ids.nbaId).catch(() => [])
        : Promise.resolve([] as PlayerSeason[]),
      ids.espnId
        ? this.loadEspnProfile(ids.espnId).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (ids.espnId && (espnCareer.length || nbaCareer.length)) {
      return mergeCareerSources(
        espnCareer,
        nbaCareer,
        ids.espnId,
        profile?.fullName
      );
    }
    return nbaCareer;
  }

  async getPlayerGameLog(
    playerId: string,
    season: string
  ): Promise<PlayerGame[]> {
    const ids = await this.providerIds(playerId);
    if (ids.espnId) {
      const key = `${ids.espnId}:${season}`;
      const games = await remember(this.espnGameLogCache, key, async () => {
        const settled = await Promise.allSettled([
          this.fetchEspnGameLog(ids.espnId!, season, 2),
          this.fetchEspnGameLog(ids.espnId!, season, 3),
        ]);
        const fulfilled = settled.flatMap((result) =>
          result.status === "fulfilled" ? result.value : []
        );
        if (
          fulfilled.length === 0 &&
          settled.every((result) => result.status === "rejected")
        ) {
          const first = settled.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected"
          );
          throw first?.reason ?? new Error("ESPN game log unavailable");
        }

        const byGame = new Map<string, PlayerGame>();
        for (const row of fulfilled) byGame.set(row.gameId, row);
        return [...byGame.values()].sort((a, b) =>
          b.gameDate.localeCompare(a.gameDate)
        );
      }).catch(() => []);
      if (games.length > 0) return games;
    }

    if (!ids.nbaId) return [];
    return super.getPlayerGameLog(ids.nbaId, season).catch(() => []);
  }

  private async providerIds(playerId: string): Promise<ProviderIds> {
    const raw = String(playerId ?? "").trim();
    const identity = await resolvePlayerIdentity(raw);
    return {
      espnId: identity.espnId,
      nbaId: identity.nbaId ?? (identity.espnId ? null : raw || null),
    };
  }

  private loadEspnProfile(playerId: string): Promise<Player | null> {
    return remember(this.espnProfileCache, playerId, async () => {
      const url = `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(playerId)}`;
      const payload = await espnFetchJson<EspnAthleteProfileResponse>(url, {
        ttlMs: CAREER_TTL_MS,
        retries: 1,
      });
      return transformEspnAthleteProfile(payload, playerId);
    });
  }

  private loadEspnCareer(playerId: string): Promise<PlayerSeason[]> {
    return remember(this.espnCareerCache, playerId, async () => {
      const base = `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(playerId)}`;
      const [profile, stats] = await Promise.all([
        espnFetchJson<EspnAthleteProfileResponse>(base, {
          ttlMs: CAREER_TTL_MS,
          retries: 1,
        }).catch((): EspnAthleteProfileResponse => ({})),
        espnFetchJson<EspnAthleteCareerStatsResponse>(`${base}/stats`, {
          ttlMs: CAREER_TTL_MS,
          retries: 1,
        }),
      ]);
      const playerName =
        profile.athlete?.displayName ?? `Player ${playerId}`;
      const rows = transformCompleteEspnAthleteCareerStats(
        playerId,
        playerName,
        stats
      );
      if (rows.length === 0) {
        throw new Error(`ESPN career returned no rows for ${playerId}`);
      }
      return rows;
    });
  }

  private loadEspnBoard(season: string): Promise<PlayerSeason[]> {
    return remember(this.espnBoardCache, season, async () => {
      const year = espnYearFromCanonicalSeason(season);
      const [teamTotals, first] = await Promise.all([
        this.loadEspnTeamTotals(season),
        espnFetchJson<ByAthleteResponse>(this.boardUrl(year, 1), {
          ttlMs: BOARD_TTL_MS,
          retries: 1,
        }),
      ]);

      const pages = Math.max(
        1,
        Math.min(12, first.pagination?.pages ?? 1)
      );
      const remaining =
        pages > 1
          ? await Promise.all(
              Array.from({ length: pages - 1 }, (_, index) => index + 2).map(
                (page) =>
                  espnFetchJson<ByAthleteResponse>(this.boardUrl(year, page), {
                    ttlMs: BOARD_TTL_MS,
                    retries: 1,
                  })
              )
            )
          : [];

      const payloads = [first, ...remaining];
      const schema =
        payloads.find((payload) => payload.categories?.length)?.categories ?? [];
      const athletes = payloads.flatMap(
        (payload) => payload.athletes ?? []
      );
      const rows = athletes
        .filter((row) => row.athlete?.id && row.athlete.teamId)
        .map((row) =>
          transformCompleteEspnPlayerSeason(row, season, teamTotals, schema)
        )
        .filter((row) => Number.isFinite(row.gamesPlayed) && row.gamesPlayed > 0);

      if (rows.length < MIN_COMPLETE_BOARD_ROWS) {
        throw new Error(
          `ESPN player board incomplete for ${season}: ${rows.length} rows`
        );
      }
      return rows;
    });
  }

  private loadEspnTeamTotals(
    season: string
  ): Promise<Map<string, TeamSeasonTotals>> {
    return remember(this.espnTeamTotalsCache, season, async () => {
      const year = espnYearFromCanonicalSeason(season);
      const url =
        `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byteam` +
        `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2`;
      const payload = await espnFetchJson<ByTeamResponse>(url, {
        ttlMs: BOARD_TTL_MS,
        retries: 1,
      });
      const schema = payload.categories ?? [];
      const result = new Map<string, TeamSeasonTotals>();
      for (const row of payload.teams ?? []) {
        const totals = transformCompleteEspnTeamTotals(row, schema);
        result.set(totals.teamId, totals);
      }
      if (result.size < 20) {
        throw new Error(
          `ESPN team board incomplete for ${season}: ${result.size} teams`
        );
      }
      return result;
    });
  }

  private boardUrl(year: number, page: number): string {
    return (
      `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byathlete` +
      `?region=us&lang=en&contentorigin=espn&isqualified=false` +
      `&page=${page}&limit=100&sort=general.minutes:desc` +
      `&season=${year}&seasontype=2`
    );
  }

  private async fetchEspnGameLog(
    playerId: string,
    season: string,
    seasonType: 2 | 3
  ): Promise<PlayerGame[]> {
    const year = espnYearFromCanonicalSeason(season);
    const url =
      `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(playerId)}/gamelog` +
      `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=${seasonType}`;
    const payload = await espnFetchJson<GameLogResponse>(url, {
      ttlMs: GAME_LOG_TTL_MS,
      retries: 1,
    });
    const names = payload.names ?? [];
    const metadata = payload.events ?? {};
    const wanted =
      seasonType === 2 ? /regular season/i : /postseason|playoffs?/i;
    const preferred = (payload.seasonTypes ?? []).filter((block) =>
      wanted.test(block.displayName ?? "")
    );
    const blocks =
      preferred.length > 0 ? preferred : payload.seasonTypes ?? [];
    const entries: EspnGameLogEvent[] = [];

    for (const block of blocks) {
      for (const category of block.categories ?? []) {
        for (const entry of category.events ?? []) {
          if (!entry.eventId) continue;
          const meta = metadata[entry.eventId] ?? { id: entry.eventId };
          entries.push({
            ...meta,
            id: entry.eventId,
            stats: entry.stats ?? meta.stats,
          });
        }
      }
    }

    if (entries.length === 0) entries.push(...Object.values(metadata));

    const career = await this.loadEspnCareer(playerId).catch(() => []);
    const seasonRow = career.find((row) => row.season === season);
    const teamId = seasonRow?.teamId ?? "";
    const playerName = seasonRow?.playerName;
    const plusMinusIndex = names.indexOf("plusMinus");
    const byGame = new Map<string, PlayerGame>();

    for (const event of entries) {
      if (!event.id) continue;
      const game = transformEspnPlayerGame(
        event,
        names,
        playerId,
        teamId,
        season
      );
      const denominator =
        2 * (game.fieldGoalsAttempted + 0.44 * game.freeThrowsAttempted);
      const effectiveFieldGoalPct =
        game.fieldGoalsAttempted > 0
          ? (game.fieldGoalsMade + 0.5 * game.threePointersMade) /
            game.fieldGoalsAttempted
          : undefined;
      const parsedPlusMinus =
        plusMinusIndex >= 0
          ? Number(event.stats?.[plusMinusIndex] ?? Number.NaN)
          : Number.NaN;

      byGame.set(game.gameId, {
        ...game,
        playerName,
        seasonType: seasonType === 2 ? "regular" : "playoffs",
        plusMinus: Number.isFinite(parsedPlusMinus)
          ? parsedPlusMinus
          : Number.NaN,
        ...(Number.isFinite(denominator) && denominator > 0
          ? { trueShootingPct: game.points / denominator }
          : {}),
        ...(effectiveFieldGoalPct != null
          ? { effectiveFieldGoalPct }
          : {}),
      });
    }

    return [...byGame.values()].sort((a, b) =>
      b.gameDate.localeCompare(a.gameDate)
    );
  }
}

export { ResilientNBADataProvider as NBADataProvider };

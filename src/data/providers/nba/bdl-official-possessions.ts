/**
 * BallDontLie GOAT advanced stats → provider-reported team possessions.
 *
 * Used on Vercel when stats.nba.com boxscoreadvancedv3 is fail-closed.
 * Team possessions come from full-game (period=0) pace rows — BDL exposes
 * pace as possessions per 48, which matches regulation team possession totals
 * closely enough to label as provider-reported (not a local estimate formula).
 */

import { sharedGetOrSet } from "@/data/cache/shared-ttl-cache";
import { looksLikeEspnEventId, looksLikeNbaStatsGameId } from "@/data/identity/game-id";
import { resolveNbaGameId } from "@/data/identity/resolve-nba-game-id";
import {
  createBallDontLieClient,
  type BdlAdvancedStat,
  type BdlGame,
} from "@/data/providers/balldontlie/client";
import { fetchRawBoxScore } from "@/data/providers/nba/raw-box-score-client";
import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";

const BDL_TTL_MS = CACHE_TTL_MS.boxScore;

export type BdlOfficialPossessionsResult = {
  raw: {
    boxScoreAdvanced: {
      homeTeam: { statistics: { possessions: number } };
      awayTeam: { statistics: { possessions: number } };
    };
  };
  home: number;
  away: number;
  bdlGameId: number;
};

function normalizeAbbr(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function teamPace(
  rows: BdlAdvancedStat[],
  teamAbbr: string
): number | null {
  const want = normalizeAbbr(teamAbbr);
  const paces: number[] = [];
  for (const row of rows) {
    const period = (row as { period?: number }).period;
    if (period != null && period !== 0) continue;
    if (normalizeAbbr(row.team?.abbreviation) !== want) continue;
    const pace = row.pace;
    if (typeof pace === "number" && Number.isFinite(pace) && pace > 40) {
      paces.push(pace);
    }
    const possessions = (row as { possessions?: number }).possessions;
    // Prefer explicit possessions when present and in team-total range.
    if (
      typeof possessions === "number" &&
      Number.isFinite(possessions) &&
      possessions > 60 &&
      possessions < 150
    ) {
      paces.push(possessions);
    }
  }
  if (!paces.length) return null;
  paces.sort((a, b) => a - b);
  return paces[Math.floor(paces.length / 2)]!;
}

async function resolveGameMeta(nbaGameId: string): Promise<{
  date: string;
  homeAbbr: string;
  awayAbbr: string;
} | null> {
  const box = await fetchRawBoxScore(nbaGameId);
  const game = (box?.raw as {
    game?: {
      gameTimeUTC?: string;
      gameDateEst?: string;
      homeTeam?: { teamTricode?: string };
      awayTeam?: { teamTricode?: string };
    };
  })?.game;
  if (!game) return null;
  const homeAbbr = normalizeAbbr(game.homeTeam?.teamTricode);
  const awayAbbr = normalizeAbbr(game.awayTeam?.teamTricode);
  const date =
    (game.gameDateEst ?? game.gameTimeUTC ?? "").slice(0, 10) ||
    "";
  if (!homeAbbr || !awayAbbr || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, homeAbbr, awayAbbr };
}

function matchBdlGame(
  games: BdlGame[],
  homeAbbr: string,
  awayAbbr: string
): BdlGame | null {
  const home = normalizeAbbr(homeAbbr);
  const away = normalizeAbbr(awayAbbr);
  return (
    games.find(
      (game) =>
        normalizeAbbr(game.home_team?.abbreviation) === home &&
        normalizeAbbr(game.visitor_team?.abbreviation) === away
    ) ?? null
  );
}

/**
 * Fetch BDL-backed official team possessions for an NBA or ESPN game id.
 * Returns null when the key is missing, game cannot be matched, or GOAT
 * advanced stats are unavailable (401 / empty).
 */
export async function fetchBdlOfficialPossessions(
  gameId: string
): Promise<BdlOfficialPossessionsResult | null> {
  const client = createBallDontLieClient();
  if (!client) return null;

  const routeId = String(gameId ?? "").trim();
  if (!routeId) return null;

  const nbaGameId =
    (await resolveNbaGameId(routeId).catch(() => null)) ??
    (looksLikeNbaStatsGameId(routeId)
      ? routeId
      : looksLikeEspnEventId(routeId)
        ? null
        : routeId);
  if (!nbaGameId) return null;

  return sharedGetOrSet(
    `bdl-official-possessions:${nbaGameId}`,
    {
      ttlMs: BDL_TTL_MS,
      staleMs: BDL_TTL_MS * 4,
      tags: ["bdl-possessions", `bdl-possessions:${nbaGameId}`],
    },
    async () => {
      const meta = await resolveGameMeta(nbaGameId);
      if (!meta) return null;

      const listed = await client.getGames({ dates: [meta.date] });
      const bdlGame = matchBdlGame(
        listed.data ?? [],
        meta.homeAbbr,
        meta.awayAbbr
      );
      if (!bdlGame?.id) return null;

      const advanced = await client.getAdvancedStats({
        gameIds: [bdlGame.id],
      });
      const rows = advanced.data ?? [];
      if (!rows.length) return null;

      const homePace = teamPace(rows, meta.homeAbbr);
      const awayPace = teamPace(rows, meta.awayAbbr);
      if (homePace == null || awayPace == null) return null;

      const home = Math.round(homePace);
      const away = Math.round(awayPace);
      return {
        raw: {
          boxScoreAdvanced: {
            homeTeam: { statistics: { possessions: home } },
            awayTeam: { statistics: { possessions: away } },
          },
        },
        home,
        away,
        bdlGameId: bdlGame.id,
      };
    }
  );
}

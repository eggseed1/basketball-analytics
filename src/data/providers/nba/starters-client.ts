import type { Game } from "@/data/types";
import { espnFetchJson } from "@/data/providers/nba/espn-client";

const SITE_API = "https://site.api.espn.com";

export type GameStarter = {
  id: string;
  name: string;
};

type DepthChartResponse = {
  depthchart?: Array<{
    positions?: Record<
      string,
      {
        athletes?: Array<{
          id?: string | number;
          displayName?: string;
        }>;
      }
    >;
  }>;
};

type SummaryBoxAthlete = {
  starter?: boolean;
  didNotPlay?: boolean;
  athlete?: {
    id?: string | number;
    displayName?: string;
  };
};

type SummaryResponse = {
  boxscore?: {
    players?: Array<{
      team?: { id?: string | number };
      statistics?: Array<{
        athletes?: SummaryBoxAthlete[];
      }>;
    }>;
  };
};

const POS_ORDER = ["pg", "sg", "sf", "pf", "c"] as const;

/** Depth-chart starters (projected) for a team - used for scheduled games. */
export async function fetchTeamDepthStarters(
  teamId: string
): Promise<GameStarter[]> {
  const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/teams/${teamId}/depthcharts`;
  const payload = await espnFetchJson<DepthChartResponse>(url, {
    ttlMs: 1000 * 60 * 60 * 6,
    retries: 1,
  }).catch(() => ({}) as DepthChartResponse);

  const positions = payload.depthchart?.[0]?.positions ?? {};
  const starters: GameStarter[] = [];
  for (const pos of POS_ORDER) {
    const athlete = positions[pos]?.athletes?.[0];
    if (!athlete?.id || !athlete.displayName) continue;
    starters.push({
      id: String(athlete.id),
      name: athlete.displayName,
    });
  }
  return starters.slice(0, 5);
}

/** Actual tip-off starters from a completed/live box score. */
export async function fetchBoxScoreStarters(options: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
}): Promise<{ home: GameStarter[]; away: GameStarter[] }> {
  const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/summary?event=${options.gameId}`;
  const summary = await espnFetchJson<SummaryResponse>(url, {
    ttlMs: 1000 * 60 * 15,
    retries: 1,
  }).catch(() => ({}) as SummaryResponse);

  const home: GameStarter[] = [];
  const away: GameStarter[] = [];

  for (const block of summary.boxscore?.players ?? []) {
    const teamId = String(block.team?.id ?? "");
    const athletes = block.statistics?.[0]?.athletes ?? [];
    const starters = athletes
      .filter((row) => row.starter && row.athlete?.id && !row.didNotPlay)
      .slice(0, 5)
      .map((row) => ({
        id: String(row.athlete!.id),
        name: row.athlete!.displayName ?? "Player",
      }));

    if (teamId === options.homeTeamId) home.push(...starters);
    else if (teamId === options.awayTeamId) away.push(...starters);
  }

  return { home, away };
}

export type GameWithStarters = Game & {
  awayStarters: GameStarter[];
  homeStarters: GameStarter[];
};

/**
 * Attach starter fives to games.
 * Finals/live use box score; scheduled use team depth charts.
 */
export async function attachStartersToGames(
  games: Game[]
): Promise<GameWithStarters[]> {
  const depthCache = new Map<string, Promise<GameStarter[]>>();
  const depth = (teamId: string) => {
    if (!depthCache.has(teamId)) {
      depthCache.set(
        teamId,
        fetchTeamDepthStarters(teamId).catch(() => [] as GameStarter[])
      );
    }
    return depthCache.get(teamId)!;
  };

  return Promise.all(
    games.map(async (game) => {
      if (game.status === "final" || game.status === "in_progress") {
        const { home, away } = await fetchBoxScoreStarters({
          gameId: game.id,
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
        }).catch(() => ({
          home: [] as GameStarter[],
          away: [] as GameStarter[],
        }));
        if (home.length || away.length) {
          return { ...game, homeStarters: home, awayStarters: away };
        }
      }

      const [awayStarters, homeStarters] = await Promise.all([
        depth(game.awayTeamId),
        depth(game.homeTeamId),
      ]);
      return { ...game, awayStarters, homeStarters };
    })
  );
}

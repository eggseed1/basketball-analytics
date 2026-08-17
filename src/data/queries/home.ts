import { getDataProvider } from "@/data/providers";
import { fetchLeagueSchedule } from "@/data/providers/nba/schedule-client";
import type { ScheduleGame, ScheduleLeader } from "@/data/providers/nba/schedule-client";
import { defaultCanonicalSeasons } from "@/data/providers/nba/season";
import type { Game, PlayerSeason } from "@/data/types";
import { perGame } from "@/data/providers/nba/compute-advanced";

export type { ScheduleGame, ScheduleLeader };

export interface HomeFeed {
  recent: ScheduleGame[];
  upcoming: ScheduleGame[];
}

const STARTING_FIVE = 5;

function nextCanonicalSeason(season: string): string {
  const start = Number(season.slice(0, 4));
  const end = (start + 2) % 100;
  return `${start + 1}-${String(end).padStart(2, "0")}`;
}

function scheduleSeasons(): string[] {
  const currentAndPrev = defaultCanonicalSeasons(2);
  const next = nextCanonicalSeason(currentAndPrev[0]!);
  return [...new Set([...currentAndPrev, next])];
}

/**
 * Recent finals + upcoming scheduled games for the homepage,
 * with headshots for each team's starting five.
 */
export async function getHomeFeed(options?: {
  recentLimit?: number;
  upcomingLimit?: number;
}): Promise<HomeFeed> {
  const recentLimit = options?.recentLimit ?? 8;
  const upcomingLimit = options?.upcomingLimit ?? 8;

  const provider = getDataProvider();
  if (provider.name === "nba") {
    return buildNbaHomeFeed(recentLimit, upcomingLimit);
  }
  return buildLocalHomeFeed(recentLimit, upcomingLimit);
}

async function buildNbaHomeFeed(
  recentLimit: number,
  upcomingLimit: number
): Promise<HomeFeed> {
  const seasons = scheduleSeasons();
  const chunks = await Promise.all(
    seasons.map((season) =>
      fetchLeagueSchedule(season).catch(() => [] as ScheduleGame[])
    )
  );
  const all = chunks.flat();

  const recent = all
    .filter((g) => g.game.status === "final")
    .sort((a, b) =>
      b.game.gameDate === a.game.gameDate
        ? b.game.id.localeCompare(a.game.id)
        : b.game.gameDate.localeCompare(a.game.gameDate)
    )
    .slice(0, recentLimit);

  const seasonPlayers = new Map<string, PlayerSeason[]>();
  async function playersFor(season: string) {
    if (!seasonPlayers.has(season)) {
      seasonPlayers.set(
        season,
        await getDataProvider().getPlayerSeasons(season)
      );
    }
    return seasonPlayers.get(season)!;
  }

  const recentEnriched = await Promise.all(
    recent.map(async (card) => {
      const starters = await startersFromBoxScore(
        card.game.id,
        card.game.homeTeamId,
        card.game.awayTeamId
      );
      if (starters.length > 0) {
        return { ...card, leaders: starters };
      }
      const roster = await playersFor(card.game.season);
      return {
        ...card,
        leaders: mergeLeaders(
          card.leaders,
          teamStartingFive(
            roster,
            card.game.homeTeamId,
            card.game.awayTeamId
          )
        ),
      };
    })
  );

  let upcoming = all
    .filter(
      (g) => g.game.status === "scheduled" || g.game.status === "in_progress"
    )
    .sort((a, b) =>
      a.game.gameDate === b.game.gameDate
        ? a.game.id.localeCompare(b.game.id)
        : a.game.gameDate.localeCompare(b.game.gameDate)
    )
    .slice(0, upcomingLimit);

  upcoming = await Promise.all(
    upcoming.map(async (card) => {
      const previewSeason =
        card.game.gameType === "preseason"
          ? defaultCanonicalSeasons(2)[1] ?? card.game.season
          : card.game.season;
      const roster = await playersFor(previewSeason);
      return {
        ...card,
        leaders: mergeLeaders(
          card.leaders,
          teamStartingFive(
            roster,
            card.game.homeTeamId,
            card.game.awayTeamId
          )
        ),
      };
    })
  );

  return { recent: recentEnriched, upcoming };
}

async function startersFromBoxScore(
  gameId: string,
  homeTeamId: string,
  awayTeamId: string
): Promise<ScheduleLeader[]> {
  try {
    const box = await getDataProvider().getGameBoxScore(gameId);
    if (!box?.players?.length) return [];

    const starters = box.players.filter(
      (p) => p.playerId && Boolean(p.startPosition)
    );
    const pool =
      starters.length >= 2
        ? starters
        : [...box.players]
            .filter((p) => p.minutes > 0 && p.playerId)
            .sort((a, b) => b.minutes - a.minutes);

    const toLeader = (p: (typeof pool)[number]): ScheduleLeader => ({
      playerId: p.playerId,
      playerName: p.playerName?.trim() || `Player ${p.playerId}`,
      teamId: p.teamId,
      points: p.points,
    });

    const pick = (teamId: string) =>
      pool
        .filter((p) => p.teamId === teamId)
        .slice(0, STARTING_FIVE)
        .map(toLeader);

    return interleave(pick(awayTeamId), pick(homeTeamId));
  } catch {
    return [];
  }
}

function mergeLeaders(
  primary: ScheduleLeader[],
  secondary: ScheduleLeader[],
  limit = STARTING_FIVE * 2
): ScheduleLeader[] {
  const seen = new Set<string>();
  const out: ScheduleLeader[] = [];
  for (const leader of [...primary, ...secondary]) {
    if (!leader.playerId || seen.has(leader.playerId)) continue;
    seen.add(leader.playerId);
    out.push(leader);
    if (out.length >= limit) break;
  }
  return out;
}

/** Likely starting five: most games started, then minutes, then scoring. */
function teamStartingFive(
  players: PlayerSeason[],
  homeTeamId: string,
  awayTeamId: string
): ScheduleLeader[] {
  const pick = (teamId: string) =>
    [...players]
      .filter((p) => p.teamId === teamId && p.gamesPlayed > 0)
      .sort((a, b) => {
        const gs =
          (b.gamesStarted ?? 0) - (a.gamesStarted ?? 0) ||
          b.minutes - a.minutes ||
          perGame(b.points, b.gamesPlayed) - perGame(a.points, a.gamesPlayed);
        return gs;
      })
      .slice(0, STARTING_FIVE)
      .map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        teamId: p.teamId,
        points: Math.round(perGame(p.points, p.gamesPlayed) * 10) / 10,
      }));

  return interleave(pick(awayTeamId), pick(homeTeamId));
}

function interleave(
  away: ScheduleLeader[],
  home: ScheduleLeader[]
): ScheduleLeader[] {
  const out: ScheduleLeader[] = [];
  const max = Math.max(away.length, home.length);
  for (let i = 0; i < max; i++) {
    if (away[i]) out.push(away[i]!);
    if (home[i]) out.push(home[i]!);
  }
  return out;
}

async function buildLocalHomeFeed(
  recentLimit: number,
  upcomingLimit: number
): Promise<HomeFeed> {
  const games = await getDataProvider().getGames();
  const players = await getDataProvider().getPlayerSeasons();
  const sorted = [...games].sort((a, b) =>
    b.gameDate.localeCompare(a.gameDate)
  );

  const finals = sorted.filter((g) => g.status !== "scheduled");
  const scheduled = sorted.filter((g) => g.status === "scheduled");

  const upcomingGames: Game[] =
    scheduled.length > 0
      ? scheduled.slice(0, upcomingLimit)
      : finals.slice(0, Math.min(3, upcomingLimit)).map((g, i) => ({
          ...g,
          id: `upcoming-demo-${i}`,
          status: "scheduled" as const,
          homeScore: 0,
          awayScore: 0,
          gameDate: shiftDate(g.gameDate, 7 + i),
        }));

  const recent: ScheduleGame[] = await Promise.all(
    finals.slice(0, recentLimit).map(async (game) => {
      const starters = await startersFromBoxScore(
        game.id,
        game.homeTeamId,
        game.awayTeamId
      );
      return {
        game,
        statusText: "Final",
        leaders:
          starters.length > 0
            ? starters
            : teamStartingFive(players, game.homeTeamId, game.awayTeamId),
      };
    })
  );

  const upcoming: ScheduleGame[] = upcomingGames.map((game) => ({
    game,
    statusText: "Preview",
    leaders: teamStartingFive(players, game.homeTeamId, game.awayTeamId),
  }));

  return { recent, upcoming };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

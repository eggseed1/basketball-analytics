/**
 * Box-level Time Machine landmarks.
 * Identity is a date + score in the schedule archive. No match, no card.
 */

import type { Game } from "@/data/types/game";
import {
  gameLabFromHistoryHref,
  historyHref,
} from "@/themes/history-url";

type LandmarkKind = "finals_close" | "game_7";

type LandmarkGameSpec = {
  id: string;
  title: string;
  season: string;
  date: string;
  awayAbbr: string;
  homeAbbr: string;
  awayScore: number;
  homeScore: number;
  /** Defaults to Finals close blurbs when omitted. */
  kind?: LandmarkKind;
};

/**
 * Landmark games whose scores were read from the runtime schedule snapshot.
 * If a future bake drops or restates a game, the card is omitted.
 */
export const LANDMARK_GAME_SPECS: LandmarkGameSpec[] = [
  {
    id: "finals-2022-close",
    title: "Warriors close out Celtics",
    season: "2021-22",
    date: "2022-06-17",
    awayAbbr: "GS",
    homeAbbr: "BOS",
    awayScore: 103,
    homeScore: 90,
  },
  {
    id: "ecf-2022-g7",
    title: "Celtics take ECF Game 7",
    season: "2021-22",
    date: "2022-05-30",
    awayAbbr: "BOS",
    homeAbbr: "MIA",
    awayScore: 100,
    homeScore: 96,
    kind: "game_7",
  },
  {
    id: "finals-2023-close",
    title: "Nuggets win the title",
    season: "2022-23",
    date: "2023-06-13",
    awayAbbr: "MIA",
    homeAbbr: "DEN",
    awayScore: 89,
    homeScore: 94,
  },
  {
    id: "ecf-2023-g7",
    title: "Heat eliminate Celtics in Game 7",
    season: "2022-23",
    date: "2023-05-30",
    awayAbbr: "MIA",
    homeAbbr: "BOS",
    awayScore: 103,
    homeScore: 84,
    kind: "game_7",
  },
  {
    id: "finals-2024-close",
    title: "Celtics finish Dallas",
    season: "2023-24",
    date: "2024-06-18",
    awayAbbr: "DAL",
    homeAbbr: "BOS",
    awayScore: 88,
    homeScore: 106,
  },
  {
    id: "wcf-2024-g7",
    title: "Wolves force Denver out in Game 7",
    season: "2023-24",
    date: "2024-05-20",
    awayAbbr: "MIN",
    homeAbbr: "DEN",
    awayScore: 98,
    homeScore: 90,
    kind: "game_7",
  },
  {
    id: "finals-2025-g7",
    title: "Thunder take Game 7",
    season: "2024-25",
    date: "2025-06-23",
    awayAbbr: "IND",
    homeAbbr: "OKC",
    awayScore: 91,
    homeScore: 103,
  },
  {
    id: "finals-2026-close",
    title: "Knicks close out Spurs",
    season: "2025-26",
    date: "2026-06-14",
    awayAbbr: "NY",
    homeAbbr: "SA",
    awayScore: 94,
    homeScore: 90,
  },
];

export type LandmarkGameCard = {
  id: string;
  gameId: string;
  season: string;
  date: string;
  title: string;
  scoreLine: string;
  blurb: string;
  gameHref: string;
  historyHref: string;
};

const SERIES_LENGTH_WORD: Record<number, string> = {
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
};

function pairKey(away?: string, home?: string): string {
  return [away, home].filter(Boolean).sort().join("|");
}

function winnerAbbr(game: Game): string | null {
  if (game.homeScore === game.awayScore) return null;
  return game.homeScore > game.awayScore
    ? game.homeTeamAbbr ?? null
    : game.awayTeamAbbr ?? null;
}

function teamName(game: Game, abbr: string): string {
  if (game.homeTeamAbbr === abbr && game.homeTeamName) return game.homeTeamName;
  if (game.awayTeamAbbr === abbr && game.awayTeamName) return game.awayTeamName;
  return abbr;
}

function seriesCloseBlurb(games: Game[], hit: Game): string | null {
  const key = pairKey(hit.awayTeamAbbr, hit.homeTeamAbbr);
  const series = games
    .filter(
      (game) =>
        game.season === hit.season &&
        game.gameType === "playoff" &&
        game.status === "final" &&
        pairKey(game.awayTeamAbbr, game.homeTeamAbbr) === key &&
        game.gameDate <= hit.gameDate
    )
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id.localeCompare(b.id));
  if (!series.some((game) => game.id === hit.id)) return null;

  const wins = new Map<string, number>();
  for (const game of series) {
    const winner = winnerAbbr(game);
    if (!winner) return null;
    wins.set(winner, (wins.get(winner) ?? 0) + 1);
  }
  const closed = [...wins.entries()].find(([, count]) => count === 4);
  if (!closed) return null;
  const [winner, winnerWins] = closed;
  const loserWins = [...wins.entries()]
    .filter(([abbr]) => abbr !== winner)
    .reduce((sum, [, count]) => sum + count, 0);
  if (winnerWins !== 4 || loserWins >= 4) return null;
  const lengthWord = SERIES_LENGTH_WORD[series.length];
  if (!lengthWord) return null;
  return `${teamName(hit, winner)} closed the Finals in ${lengthWord}.`;
}

function game7Blurb(hit: Game): string {
  const winner = winnerAbbr(hit);
  if (!winner) {
    return `${hit.awayTeamAbbr} ${hit.awayScore} at ${hit.homeTeamAbbr} ${hit.homeScore}.`;
  }
  const winnerScore =
    winner === hit.homeTeamAbbr ? hit.homeScore : hit.awayScore;
  const loserScore =
    winner === hit.homeTeamAbbr ? hit.awayScore : hit.homeScore;
  return `${teamName(hit, winner)} won Game 7, ${winnerScore}-${loserScore}.`;
}

export function resolveLandmarkGames(games: Game[]): LandmarkGameCard[] {
  const cards: LandmarkGameCard[] = [];
  for (const spec of LANDMARK_GAME_SPECS) {
    const hit = games.find(
      (game) =>
        game.season === spec.season &&
        game.gameDate === spec.date &&
        game.awayTeamAbbr === spec.awayAbbr &&
        game.homeTeamAbbr === spec.homeAbbr &&
        game.awayScore === spec.awayScore &&
        game.homeScore === spec.homeScore &&
        game.status === "final" &&
        game.gameType === "playoff"
    );
    if (!hit) continue;
    const kind = spec.kind ?? "finals_close";
    const blurb =
      kind === "game_7"
        ? game7Blurb(hit)
        : seriesCloseBlurb(games, hit) ??
          `${spec.awayAbbr} ${spec.awayScore} at ${spec.homeAbbr} ${spec.homeScore}.`;
    cards.push({
      id: spec.id,
      gameId: hit.id,
      season: hit.season,
      date: hit.gameDate,
      title: spec.title,
      scoreLine: `${hit.awayTeamAbbr} ${hit.awayScore} @ ${hit.homeTeamAbbr} ${hit.homeScore}`,
      blurb,
      gameHref: gameLabFromHistoryHref(hit.id, {
        season: hit.season,
        theme: "historical",
      }),
      historyHref: historyHref({
        season: hit.season,
        date: hit.gameDate,
      }),
    });
  }
  return cards;
}

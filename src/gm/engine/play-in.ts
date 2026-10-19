import type {
  GmLeagueState,
  GmPlayInBoard,
  GmPlayInConference,
  GmTeam,
} from "@/gm/types";
import { sortedStandings } from "@/gm/engine/standings";

export type PlayInGame = {
  conf: GmPlayInConference["conf"];
  homeId: string;
  awayId: string;
  /** first = 7/8 or 9/10. last = the 8 seed. */
  slot: "first" | "last";
};

export function createPlayInBoard(
  league: Pick<GmLeagueState, "standings" | "teams">
): GmPlayInBoard | null {
  const conferences: GmPlayInConference[] = [];
  for (const conf of ["East", "West"] as const) {
    const rows = sortedStandings(league.standings, conf, league.teams);
    if (rows.length < 10) return null;
    conferences.push({
      conf,
      sevenId: rows[6]!.teamId,
      eightId: rows[7]!.teamId,
      nineId: rows[8]!.teamId,
      tenId: rows[9]!.teamId,
    });
  }
  return { conferences };
}

export function playInOpenGames(board: GmPlayInBoard): PlayInGame[] {
  const games: PlayInGame[] = [];
  for (const conf of board.conferences) {
    if (!conf.sevenSeedId) {
      games.push({
        conf: conf.conf,
        homeId: conf.sevenId,
        awayId: conf.eightId,
        slot: "first",
      });
    }
    if (!conf.nineWinnerId) {
      games.push({
        conf: conf.conf,
        homeId: conf.nineId,
        awayId: conf.tenId,
        slot: "first",
      });
    }
    if (conf.sevenLoserId && conf.nineWinnerId && !conf.eightSeedId) {
      games.push({
        conf: conf.conf,
        homeId: conf.sevenLoserId,
        awayId: conf.nineWinnerId,
        slot: "last",
      });
    }
  }
  return games;
}

export function applyPlayInResult(
  board: GmPlayInBoard,
  game: PlayInGame,
  homeWon: boolean
): GmPlayInBoard {
  const winner = homeWon ? game.homeId : game.awayId;
  const loser = homeWon ? game.awayId : game.homeId;
  return {
    conferences: board.conferences.map((conf) => {
      if (conf.conf !== game.conf) return conf;
      if (game.slot === "last") return { ...conf, eightSeedId: winner };
      const isSevenEight =
        (game.homeId === conf.sevenId || game.homeId === conf.eightId) &&
        (game.awayId === conf.sevenId || game.awayId === conf.eightId);
      if (isSevenEight) {
        return { ...conf, sevenSeedId: winner, sevenLoserId: loser };
      }
      return { ...conf, nineWinnerId: winner };
    }),
  };
}

export function playInDone(board: GmPlayInBoard): boolean {
  return board.conferences.every((conf) => Boolean(conf.eightSeedId && conf.sevenSeedId));
}

/** Seeds 1–8 after the play-in. Index 0 is the 1 seed. */
export function playoffSeeds(
  league: Pick<GmLeagueState, "standings" | "teams">,
  board: GmPlayInBoard
): Record<"East" | "West", string[]> {
  const out = { East: [] as string[], West: [] as string[] };
  for (const conf of board.conferences) {
    const top = sortedStandings(league.standings, conf.conf, league.teams);
    out[conf.conf] = [
      ...top.slice(0, 6).map((row) => row.teamId),
      conf.sevenSeedId!,
      conf.eightSeedId!,
    ];
  }
  return out;
}

export function playoffTeamIdSet(seeds: Record<"East" | "West", string[]>): Set<string> {
  return new Set([...seeds.East, ...seeds.West]);
}

export function teamName(teams: GmTeam[], id: string): string {
  const team = teams.find((entry) => entry.id === id);
  return team ? team.abbr : id.toUpperCase();
}

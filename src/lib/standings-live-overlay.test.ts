import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Game } from "@/data/types/game";
import type { LeagueStandings } from "@/data/types/standings";
import {
  mergeStandingsGames,
  preferFresherStandings,
  standingsGamesPlayed,
} from "./standings-live-overlay";

function board(
  season: string,
  rows: Array<{ teamId: string; wins: number; losses: number }>
): LeagueStandings {
  return {
    season,
    conferences: [
      {
        conference: "East",
        rows: rows.map((row, index) => ({
          teamId: row.teamId,
          abbreviation: row.teamId,
          displayName: row.teamId,
          conference: "East" as const,
          rank: index + 1,
          wins: row.wins,
          losses: row.losses,
          winPct: row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) : 0,
          gamesBehind: 0,
          differential: 0,
          ppg: 0,
          oppPpg: 0,
          streak: "-",
          homeRecord: "-",
          roadRecord: "-",
          lastTen: "-",
          playoffSeed: null,
        })),
      },
    ],
  };
}

function game(partial: Partial<Game> & Pick<Game, "id" | "status">): Game {
  return {
    season: "2026-27",
    gameDate: "2026-10-26",
    homeTeamId: "1",
    awayTeamId: "2",
    homeScore: 100,
    awayScore: 98,
    gameType: "regular",
    ...partial,
  };
}

describe("standings-live-overlay", () => {
  it("counts league-wide games played", () => {
    assert.equal(
      standingsGamesPlayed(board("2026-27", [{ teamId: "1", wins: 3, losses: 1 }])),
      4
    );
  });

  it("lets live finals replace scheduled snapshot rows", () => {
    const snapshot = [
      game({ id: "g1", status: "scheduled", homeScore: 0, awayScore: 0 }),
      game({ id: "g2", status: "final", homeScore: 110, awayScore: 100 }),
    ];
    const live = [
      game({ id: "g1", status: "final", homeScore: 105, awayScore: 99 }),
    ];
    const merged = mergeStandingsGames(snapshot, live);
    assert.equal(merged.length, 2);
    const g1 = merged.find((g) => g.id === "g1");
    assert.equal(g1?.status, "final");
    assert.equal(g1?.homeScore, 105);
  });

  it("prefers the board with more completed games", () => {
    const baked = board("2026-27", [{ teamId: "1", wins: 2, losses: 0 }]);
    const live = board("2026-27", [{ teamId: "1", wins: 3, losses: 0 }]);
    assert.equal(preferFresherStandings(baked, live), live);
    assert.equal(preferFresherStandings(live, baked), live);
  });
});

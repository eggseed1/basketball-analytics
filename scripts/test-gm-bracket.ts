import assert from "node:assert/strict";
import test from "node:test";

import { buildPlayoffBracket, seriesHosts } from "../src/gm/engine/standings";
import type { GmLeagueState, GmTeam } from "../src/gm/types";

test("the first round is seeded 1-8, 4-5, 3-6, 2-7 in each conference", () => {
  const teams = ["East", "West"].flatMap((conference) =>
    Array.from({ length: 10 }, (_, index) => ({
      id: `${conference}-${index + 1}`,
      conference,
    }))
  ) as GmTeam[];
  const standings = Object.fromEntries(
    teams.map((team, index) => [
      team.id,
      {
        teamId: team.id,
        wins: 60 - (index % 10) * 4,
        losses: 22 + (index % 10) * 4,
        confWins: 0,
        confLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ])
  );
  const league = { teams, standings } as GmLeagueState;
  const series = buildPlayoffBracket(league);
  assert.equal(series.length, 8);
  for (const conf of ["East", "West"] as const) {
    const first = series.filter((entry) => entry.conf === conf);
    assert.deepEqual(
      first.map((entry) => [entry.seedA, entry.seedB]),
      [
        [1, 8],
        [4, 5],
        [3, 6],
        [2, 7],
      ]
    );
    assert.equal(first.every((entry) => entry.games?.length === 0 && !entry.done), true);
    const opener = first[0]!;
    assert.equal(seriesHosts(opener).homeTeamId, opener.teamAId);
    const road = { ...opener, games: [{}, {}, {}] as never };
    assert.equal(seriesHosts(road).homeTeamId, opener.teamBId);
    const late = { ...opener, games: [{}, {}, {}, {}] as never };
    assert.equal(seriesHosts(late).homeTeamId, opener.teamAId);
  }
});

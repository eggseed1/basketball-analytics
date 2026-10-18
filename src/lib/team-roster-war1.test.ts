import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCurrentRosterWarLeague,
  buildRosterWarLeague,
  displayedRosterWar1,
  rosterLineWins,
  type RosterWarTeamMeta,
} from "./team-roster-war1";

const TEAMS: Record<string, RosterWarTeamMeta> = {
  okc: { abbreviation: "OKC", fullName: "Oklahoma City Thunder", espnTeamId: "25" },
  bos: { abbreviation: "BOS", fullName: "Boston Celtics", espnTeamId: "2" },
  atl: { abbreviation: "ATL", fullName: "Atlanta Hawks", espnTeamId: "1" },
};

test("roster line uses the displayed WAR1 so the arithmetic checks", () => {
  assert.equal(displayedRosterWar1(15.664), 15.66);
  assert.equal(rosterLineWins(15.664), 40.2 + 1.31 * 15.66);
});

test("squad sum keeps the above and below parts and skips a missing WAR1", () => {
  const squads = buildRosterWarLeague(
    [
      { playerId: "a", playerName: "Star", teamId: "okc", drbl100: 4.2, r1Points: 150, r1WinEquivalents: 4 },
      { playerId: "b", playerName: "Below", teamId: "okc", drbl100: -1, r1Points: -20, r1WinEquivalents: -0.5 },
      { playerId: "c", playerName: "Missing", teamId: "okc", drbl100: 1, r1Points: null, r1WinEquivalents: null },
      { playerId: "d", playerName: "Other", teamId: "bos", drbl100: 1, r1Points: 40, r1WinEquivalents: 1 },
      { playerId: "e", playerName: "Unknown team", teamId: "nope", r1WinEquivalents: 9 },
    ],
    {
      teamMeta: (id) => TEAMS[id] ?? null,
      espnPlayerId: (id) => (id === "a" ? "111" : null),
    }
  );

  assert.equal(squads.length, 2);
  assert.equal(squads[0]?.abbreviation, "OKC");
  assert.equal(squads[0]?.rank, 1);
  assert.equal(squads[0]?.players.length, 2);
  assert.equal(squads[0]?.war1, 3.5);
  assert.equal(squads[0]?.above, 4);
  assert.equal(squads[0]?.below, -0.5);
  assert.equal(squads[0]?.r1Points, 130);
  assert.equal(squads[0]?.players[0]?.espnId, "111");
  assert.equal(squads[0]?.players[1]?.espnId, null);
  assert.equal(squads[0]?.lineWins, 40.2 + 1.31 * 3.5);
  assert.equal(squads[1]?.abbreviation, "BOS");
  assert.equal(squads[1]?.rank, 2);
});

test("current roster keeps arrivals and drops players who left", () => {
  const squads = buildCurrentRosterWarLeague(
    [
      { playerId: "nba-stay", playerName: "Stay", teamId: "okc", drbl100: 3, r1Points: 100, r1WinEquivalents: 4 },
      { playerId: "nba-left", playerName: "Left", teamId: "okc", drbl100: -1, r1Points: -40, r1WinEquivalents: -1 },
      { playerId: "nba-arrive", playerName: "Arrive", teamId: "phi", drbl100: 1, r1Points: 20, r1WinEquivalents: 0.5 },
    ],
    [
      { espnId: "stay", name: "Stay", abbreviation: "OKC" },
      { espnId: "arrive", name: "Arrive", abbreviation: "OKC" },
      { espnId: "rookie", name: "Rookie", abbreviation: "OKC" },
      { espnId: "left", name: "Left", abbreviation: "ATL" },
    ],
    {
      espnForNba: (id) => ({ "nba-stay": "stay", "nba-left": "left", "nba-arrive": "arrive" })[id] ?? null,
      teamMeta: (abbr) => TEAMS[abbr === "OKC" ? "okc" : abbr === "ATL" ? "atl" : ""] ?? null,
    }
  );

  const okc = squads.find((s) => s.abbreviation === "OKC");
  assert.equal(okc?.players.map((p) => p.name).join(","), "Stay,Arrive");
  assert.equal(okc?.war1, 4.5);
  assert.equal(okc?.withoutWar1, 1);
  const atl = squads.find((s) => s.abbreviation === "ATL");
  assert.equal(atl?.players.length, 1);
  assert.equal(atl?.war1, -1);
});

test("a second row for the same player does not get added twice", () => {
  const squads = buildRosterWarLeague(
    [
      { playerId: "a", playerName: "Star", teamId: "okc", r1WinEquivalents: 4, r1Points: 10 },
      { playerId: "a", playerName: "Star", teamId: "okc", r1WinEquivalents: 1, r1Points: 3 },
    ],
    { teamMeta: (id) => TEAMS[id] ?? null, espnPlayerId: () => null }
  );
  assert.equal(squads[0]?.war1, 4);
  assert.equal(squads[0]?.players.length, 1);
  assert.equal(squads[0]?.r1Points, 10);
});

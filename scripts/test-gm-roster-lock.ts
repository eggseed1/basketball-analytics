import assert from "node:assert/strict";
import test from "node:test";

import { claimOpeningRosters } from "../src/gm/seed/opening-roster";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { withPlayerSeasonDefaults } from "../src/data/transformers/player-season-defaults";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

function shell(overrides: Partial<GmPlayer> & Pick<GmPlayer, "id" | "name">): GmPlayer {
  return {
    teamId: null,
    position: "PF",
    age: 19,
    heightIn: 82,
    weightLbs: 240,
    ratings: {
      impact: -1,
      offense: -0.4,
      defense: 0.2,
      shooting: 40,
      finishing: 50,
      playmaking: 30,
      rebounding: 55,
      durability: 70,
      potential: 4,
    },
    scouted: { impact: -1, offense: -0.4, defense: 0.2, uncertainty: 0.1 },
    contract: null,
    injury: null,
    morale: 60,
    personality: 0,
    minutesPreference: 8,
    ...overrides,
  };
}

function league(players: GmPlayer[], rosterBook?: number): GmLeagueState {
  return {
    version: 1,
    season: 2027,
    day: 0,
    phase: "regular",
    userTeamId: "bos",
    settings: {} as GmLeagueState["settings"],
    teams: [],
    players,
    freeAgents: players.filter((player) => player.teamId == null).map((player) => player.id),
    draftPool: [],
    schedule: [],
    standings: {},
    boxScores: [],
    news: [],
    tradeLog: [],
    rosterBook,
    createdAt: "",
    updatedAt: "",
  };
}

test("a current Celtics roster player is not left in free agency", () => {
  const cenac = shell({ id: "5142621", name: "Chris Cenac Jr.", nbaPlayerId: "5142621" });
  const next = claimOpeningRosters(league([cenac]));
  const placed = next.players.find((player) => player.id === "5142621");
  assert.equal(placed?.teamId, "bos");
  assert.ok(placed?.contract && placed.contract.annualSalaryM > 2);
  assert.equal(next.freeAgents.includes("5142621"), false);
});

test("a player already traded off the opening roster stays put", () => {
  const cenac = shell({
    id: "5142621",
    name: "Chris Cenac Jr.",
    teamId: "nyk",
    contract: {
      yearsRemaining: 2,
      annualSalaryM: 4,
      birdRights: "none",
      signedSeason: 2027,
    },
  });
  const next = claimOpeningRosters(league([cenac]));
  assert.equal(next.players[0]?.teamId, "nyk");
});

test("a later waive is not undone once the roster book is written", () => {
  const cenac = shell({ id: "5142621", name: "Chris Cenac Jr." });
  const next = claimOpeningRosters(league([cenac], 1));
  assert.equal(next.players[0]?.teamId, null);
  assert.equal(next.freeAgents.includes("5142621"), true);
});

test("opening camp keeps every assigned player, including a zero-minute rookie", () => {
  const row = (id: string, name: string, minutes: number) =>
    withPlayerSeasonDefaults({
      playerId: id,
      playerName: name,
      teamId: "2",
      teamName: "Boston Celtics",
      teamAbbreviation: "BOS",
      season: "2026-27",
      position: "PF",
      age: 19,
      gamesPlayed: minutes > 0 ? 10 : 0,
      gamesStarted: 0,
      minutes,
    });
  const built = buildLeagueFromPlayerSeasons(
    [row("star", "Star Wing", 2000), row("5142621", "Chris Cenac Jr.", 0)],
    {
      userTeamId: "bos",
      seasonCanonical: "2026-27",
      seed: 1,
      maxRoster: 1,
      keepAssignedRoster: true,
    }
  );
  const cenac = built.players.find((player) => player.name === "Chris Cenac Jr.");
  assert.equal(cenac?.teamId, "bos");
  assert.equal(built.freeAgents.includes(cenac?.id ?? ""), false);
});

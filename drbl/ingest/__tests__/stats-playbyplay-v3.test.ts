import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reconstructLineups } from "../../possessions/reconstruct-lineups";
import type { DrblBoxPlayer, DrblBoxScore } from "../../types";
import { hasFeedOrderNumbers, normalizePlayByPlay } from "../normalize";

const HOME = 1610612749;
const AWAY = 1610612751;
const homeNames = ["Jrue Holiday", "Khris Middleton", "Giannis Antetokounmpo", "Brook Lopez", "Grayson Allen", "Tim Hardaway Jr.", "Jonas Valančiūnas"];
const awayNames = ["James Harden", "Kevin Durant", "Joe Harris", "Blake Griffin", "Nic Claxton", "Patty Mills"];

function player(i: number, playerName: string, teamId: number, starter: boolean): DrblBoxPlayer {
  return {
    playerId: String(1000 + i),
    playerName,
    teamId: String(teamId),
    starter,
    minutes: 0,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
  };
}

const box: DrblBoxScore = {
  gameId: "0022100001",
  season: "2021-22",
  gameDate: "2021-10-19",
  homeTeamId: String(HOME),
  awayTeamId: String(AWAY),
  homeTeamTricode: "MIL",
  awayTeamTricode: "BKN",
  homeScore: 0,
  awayScore: 0,
  players: [
    ...homeNames.map((n, i) => player(i, n, HOME, i < 5)),
    ...awayNames.map((n, i) => player(100 + i, n, AWAY, i < 5)),
  ],
};
const id = (name: string) => box.players.find((p) => p.playerName === name)!.playerId;

/** A playbyplayv3-shaped row: no orderNumber, untyped steal/block rows, team rows keyed by personId. */
function row(actionNumber: number, period: number, clock: string, fields: Record<string, unknown>) {
  return { actionNumber, period, clock: `PT${clock}.00S`, teamId: 0, personId: 0, description: "", actionType: "", subType: "", ...fields };
}

const feed = {
  game: {
    actions: [
      row(2, 1, "12M00", { actionType: "period", subType: "start" }),
      row(9, 1, "11M40", { actionType: "Missed Shot", teamId: HOME, personId: Number(id("Jrue Holiday")), description: "MISS Holiday 20' Jump Shot", shotValue: 2 }),
      row(8, 1, "11M40", { teamId: AWAY, personId: Number(id("James Harden")), description: "Harden BLOCK (1 BLK)" }),
      row(10, 1, "11M38", { actionType: "Rebound", subType: "Unknown", teamId: HOME, personId: Number(id("Brook Lopez")), description: "Lopez REBOUND (Off:1 Def:0)" }),
      row(12, 1, "11M30", { actionType: "Missed Shot", teamId: HOME, personId: Number(id("Brook Lopez")), description: "MISS Lopez 3' Layup", shotValue: 2 }),
      row(11, 1, "11M29", { actionType: "Rebound", subType: "Normal Rebound", personId: AWAY, description: "Nets Rebound" }),
      row(13, 1, "11M10", { actionType: "Turnover", teamId: AWAY, personId: Number(id("Kevin Durant")), description: "Durant Bad Pass Turnover (P1.T1)" }),
      row(14, 1, "11M10", { teamId: HOME, personId: Number(id("Khris Middleton")), description: "Middleton STEAL (1 STL)" }),
      row(20, 1, "06M00", { actionType: "Substitution", teamId: HOME, personId: Number(id("Grayson Allen")), description: "SUB: Hardaway Jr. FOR Allen" }),
      row(21, 1, "05M00", { actionType: "Substitution", teamId: HOME, personId: Number(id("Brook Lopez")), description: "SUB: Valanciunas FOR Lopez" }),
      row(30, 1, "00M00", { actionType: "period", subType: "end" }),
      // Between periods Allen came back for Hardaway; the feed never says so.
      row(31, 2, "12M00", { actionType: "period", subType: "start" }),
      row(32, 2, "11M45", { actionType: "Made Shot", teamId: HOME, personId: Number(id("Grayson Allen")), description: "Allen 25' 3PT Jump Shot (3 PTS)", shotValue: 3 }),
      row(33, 2, "11M30", { actionType: "Substitution", teamId: HOME, personId: Number(id("Jonas Valančiūnas")), description: "SUB: Lopez FOR Valanciunas" }),
      row(40, 2, "00M00", { actionType: "period", subType: "end" }),
    ],
  },
};

describe("stats.nba.com playbyplayv3 feed", () => {
  const events = normalizePlayByPlay(box.gameId, feed, { rosterPlayers: box.players });

  it("is told apart from CDN feeds by its missing orderNumber", () => {
    assert.equal(hasFeedOrderNumbers(feed), false);
    assert.equal(hasFeedOrderNumbers({ game: { actions: [{ actionNumber: 1, orderNumber: 10000 }] } }), true);
  });

  it("numbers events in feed order, keeping each substitution pair together", () => {
    const sub = events.filter((e) => e.actionType === "substitution" && e.period === 1);
    assert.deepEqual(
      sub.map((e) => [e.substitutionSide, e.playerId]),
      [
        ["out", id("Grayson Allen")],
        ["in", id("Tim Hardaway Jr.")],
        ["out", id("Brook Lopez")],
        ["in", id("Jonas Valančiūnas")],
      ]
    );
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i]!.orderNumber > events[i - 1]!.orderNumber, `event ${i} out of order`);
    }
    assert.ok(events.every((e, i) => i === 0 || e.actionNumber >= events[i - 1]!.actionNumber));
  });

  it("types steal and block rows and moves team ids out of personId", () => {
    assert.equal(events.find((e) => /BLOCK/.test(e.description))!.actionType, "block");
    const steal = events.find((e) => /STEAL/.test(e.description))!;
    assert.equal(steal.actionType, "steal");
    assert.equal(steal.playerId, id("Khris Middleton"));
    const team = events.find((e) => e.description === "Nets Rebound")!;
    assert.equal(team.teamId, String(AWAY));
    assert.equal(team.playerId, null);
  });

  it("labels rebounds offensive or defensive from the last miss", () => {
    const rebounds = events.filter((e) => e.actionType === "rebound").map((e) => e.subType);
    assert.deepEqual(rebounds, ["offensive", "defensive"]);
  });

  it("starts a period with the players seen on the floor when break substitutions are missing", () => {
    const inferred = reconstructLineups(events, box, { inferPeriodStarters: true });
    const start2 = inferred.find((s) => s.period === 2)!;
    assert.ok(start2.homePlayerIds.includes(id("Grayson Allen")));
    assert.ok(!start2.homePlayerIds.includes(id("Tim Hardaway Jr.")));
    assert.ok(start2.homePlayerIds.includes(id("Jonas Valančiūnas")));
    assert.equal(start2.homePlayerIds.length, 5);
    const carried = reconstructLineups(events, box).find((s) => s.period === 2)!;
    assert.ok(carried.homePlayerIds.includes(id("Tim Hardaway Jr.")));
  });
});

describe("playbyplayv3 substitutions that name only a shared surname", () => {
  const BOS = 1610612738;
  const celtics = ["Marcus Smart", "Jaylen Brown", "Jayson Tatum", "Jeff Green", "Al Horford", "JaMychal Green"];
  const blazers = ["Damian Lillard", "CJ McCollum", "Norman Powell", "Robert Covington", "Jusuf Nurkić", "Enes Freedom"];
  const sharedBox: DrblBoxScore = {
    ...box,
    homeTeamId: String(BOS),
    awayTeamId: String(AWAY),
    players: [
      ...celtics.map((n, i) => player(200 + i, n, BOS, i < 5)),
      ...blazers.map((n, i) => player(300 + i, n, AWAY, i < 5)),
    ],
  };
  const pid = (name: string) => sharedBox.players.find((p) => p.playerName === name)!.playerId;
  const sharedFeed = {
    game: {
      actions: [
        row(1, 1, "12M00", { actionType: "period", subType: "start" }),
        row(2, 1, "11M40", { actionType: "Made Shot", teamId: BOS, personId: Number(pid("Jeff Green")), description: "Green 2' Dunk (2 PTS)", shotValue: 2 }),
        row(3, 1, "08M00", { actionType: "Substitution", teamId: BOS, personId: Number(pid("Al Horford")), description: "SUB: Green FOR Horford" }),
        row(4, 1, "07M00", { actionType: "Substitution", teamId: AWAY, personId: Number(pid("Jusuf Nurkić")), description: "SUB: Kanter FOR Nurkic" }),
        row(5, 1, "00M00", { actionType: "period", subType: "end" }),
      ],
    },
  };
  const sharedEvents = normalizePlayByPlay(sharedBox.gameId, sharedFeed, { rosterPlayers: sharedBox.players });
  const lineups = reconstructLineups(sharedEvents, sharedBox, { inferPeriodStarters: true });
  const last = lineups[lineups.length - 1]!;

  it("brings in the namesake who isn't already on the floor", () => {
    const sub = sharedEvents.find((e) => e.substitutionSide === "in" && e.teamId === String(BOS))!;
    assert.equal(sub.playerId, null);
    assert.ok(last.homePlayerIds.includes(pid("JaMychal Green")));
    assert.ok(last.homePlayerIds.includes(pid("Jeff Green")));
    assert.ok(!last.homePlayerIds.includes(pid("Al Horford")));
    assert.equal(last.homePlayerIds.length, 5);
  });

  it("picks the namesake whose next mention has him on the floor", () => {
    const CHA = 1610612766;
    const hornets = ["LaMelo Ball", "Terry Rozier", "Gordon Hayward", "Miles Bridges", "PJ Washington", "Caleb Martin", "Cody Martin"];
    const twinsBox: DrblBoxScore = {
      ...box,
      homeTeamId: String(CHA),
      players: [...hornets.map((n, i) => player(400 + i, n, CHA, i < 5)), ...box.players.filter((p) => p.teamId === String(AWAY))],
    };
    const tid = (name: string) => twinsBox.players.find((p) => p.playerName === name)!.playerId;
    const twinsFeed = {
      game: {
        actions: [
          row(1, 1, "12M00", { actionType: "period", subType: "start" }),
          row(2, 1, "08M00", { actionType: "Substitution", teamId: CHA, personId: Number(tid("Gordon Hayward")), description: "SUB: Martin FOR Hayward" }),
          row(3, 1, "07M30", { actionType: "Missed Shot", teamId: CHA, personId: Number(tid("Cody Martin")), description: "MISS Martin 3' Layup", shotValue: 2 }),
          row(4, 1, "06M00", { actionType: "Substitution", teamId: CHA, personId: Number(tid("Miles Bridges")), description: "SUB: Martin FOR Bridges" }),
          row(5, 1, "00M00", { actionType: "period", subType: "end" }),
        ],
      },
    };
    const twinsEvents = normalizePlayByPlay(twinsBox.gameId, twinsFeed, { rosterPlayers: twinsBox.players });
    const twins = reconstructLineups(twinsEvents, twinsBox, { inferPeriodStarters: true });
    const end = twins[twins.length - 1]!.homePlayerIds;
    assert.ok(end.includes(tid("Cody Martin")) && end.includes(tid("Caleb Martin")));
    assert.ok(!end.includes(tid("Gordon Hayward")) && !end.includes(tid("Miles Bridges")));
    assert.equal(end.length, 5);
  });

  it("reads first-name prefixes and suffixes that tell namesakes apart", () => {
    const greens = ["Nikola Jokić", "Aaron Gordon", "Will Barton", "Monte Morris", "Austin Rivers", "Jeff Green", "JaMychal Green", "Grant Williams", "Robert Williams III"];
    const denBox: DrblBoxScore = {
      ...box,
      players: [...greens.map((n, i) => player(500 + i, n, HOME, i < 5)), ...box.players.filter((p) => p.teamId === String(AWAY))],
    };
    const did = (name: string) => denBox.players.find((p) => p.playerName === name)!.playerId;
    const denEvents = normalizePlayByPlay(
      denBox.gameId,
      {
        game: {
          actions: [
            row(1, 1, "12M00", { actionType: "period", subType: "start" }),
            row(2, 1, "08M00", { actionType: "Substitution", teamId: HOME, personId: Number(did("Aaron Gordon")), description: "SUB: Je. Green FOR Gordon" }),
            row(3, 1, "07M00", { actionType: "Substitution", teamId: HOME, personId: Number(did("Nikola Jokić")), description: "SUB: Ja. Green FOR Jokic" }),
            row(4, 1, "06M00", { actionType: "Substitution", teamId: HOME, personId: Number(did("Will Barton")), description: "SUB: Williams III FOR Barton" }),
            row(5, 1, "05M00", { actionType: "Substitution", teamId: HOME, personId: Number(did("Robert Williams III")), description: "SUB: Williams FOR Williams III" }),
          ],
        },
      },
      { rosterPlayers: denBox.players }
    );
    const entering = denEvents.filter((e) => e.substitutionSide === "in").map((e) => e.playerId);
    assert.deepEqual(entering, [did("Jeff Green"), did("JaMychal Green"), did("Robert Williams III"), did("Grant Williams")]);
  });

  it("matches a former surname to the player's current name", () => {
    const sub = sharedEvents.find((e) => e.substitutionSide === "in" && e.teamId === String(AWAY))!;
    assert.equal(sub.playerId, pid("Enes Freedom"));
    assert.ok(last.awayPlayerIds.includes(pid("Enes Freedom")));
  });
});

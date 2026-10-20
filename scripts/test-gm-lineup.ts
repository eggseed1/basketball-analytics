import assert from "node:assert/strict";
import test from "node:test";

import { paintShifts } from "../src/gm/engine/coaching";
import { autoSetLineup, positionalMinuteTargets } from "../src/gm/engine/lineup";
import type { GmPlayer, GmPosition, GmTeam } from "../src/gm/types";

function player(id: string, position: GmPosition, mpg: number): GmPlayer {
  return {
    id,
    name: id,
    teamId: "bos",
    position,
    age: 26,
    heightIn: position === "C" ? 83 : position === "PF" ? 81 : 77,
    weightLbs: 220,
    ratings: {
      impact: mpg / 10,
      offense: 1,
      defense: 0,
      shooting: 50,
      finishing: 50,
      playmaking: position === "PG" ? 80 : 40,
      rebounding: position === "C" ? 80 : 40,
      durability: 80,
      potential: 2,
    },
    scouted: {
      offense: null,
      defense: null,
      shooting: null,
      finishing: null,
      playmaking: null,
      rebounding: null,
      potential: null,
    },
    contract: null,
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: mpg,
    nbaSeason: {
      season: "2025-26",
      team: "BOS",
      gp: 70,
      min: 70 * mpg,
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
    },
  };
}

const roster = [
  player("pg", "PG", 30),
  player("sg1", "SG", 34),
  player("sg2", "SG", 31),
  player("sg3", "SG", 26),
  player("sf1", "SF", 33),
  player("sf2", "SF", 18),
  player("pf", "PF", 27),
  player("c", "C", 22),
  player("c2", "C", 14),
];

test("the center and the point guard start ahead of the extra wings", () => {
  const team = autoSetLineup({ id: "bos", starters: { PG: null, SG: null, SF: null, PF: null, C: null } } as GmTeam, roster);
  assert.equal(team.starters.C, "c");
  assert.equal(team.starters.PG, "pg");
  assert.equal(team.starters.SG, "sg1");
  assert.equal(team.starters.SF, "sf1");
  assert.equal(team.starters.PF, "pf");
  assert.ok(!Object.values(team.starters).includes("sg2"));
  const minutes = positionalMinuteTargets(roster, team.starters);
  assert.equal(Object.values(minutes).reduce((sum, value) => sum + value, 0), 240);
  assert.ok((minutes.sg2 ?? 0) < (minutes.c ?? 0));
  assert.ok((minutes.sg1 ?? 0) > (minutes.sg3 ?? 0));
});

test("star wings stay on their best spot instead of sliding to PF", () => {
  const thinFour = player("bench-pf", "PF", 14);
  const george = {
    ...player("pg13", "SG", 34),
    secondaryPosition: "SF" as const,
    heightIn: 80,
    ratings: {
      ...player("pg13", "SG", 34).ratings,
      impact: 4.2,
      shooting: 82,
      playmaking: 70,
      rebounding: 45,
    },
  };
  const thin = [
    player("pg", "PG", 28),
    george,
    player("sg2", "SG", 18),
    player("sf1", "SF", 24),
    thinFour,
    player("c", "C", 26),
  ];
  const team = autoSetLineup(
    { id: "bos", starters: { PG: null, SG: null, SF: null, PF: null, C: null } } as GmTeam,
    thin
  );
  assert.equal(team.starters.SG, "pg13", "star SG starts at SG");
  assert.equal(team.starters.PF, "bench-pf", "thin natural PF keeps the four");
  assert.notEqual(team.starters.PF, "pg13");
  assert.notEqual(team.starters.SF, "pg13");
});

test("a sub replaces the position that sat", () => {
  const rows = [
    { id: "pg", minutes: 32, starter: true, position: "PG" as const },
    { id: "sg", minutes: 32, starter: true, position: "SG" as const },
    { id: "sf", minutes: 32, starter: true, position: "SF" as const },
    { id: "pf", minutes: 30, starter: true, position: "PF" as const },
    { id: "c", minutes: 28, starter: true, position: "C" as const },
    { id: "sg2", minutes: 31, starter: false, position: "SG" as const },
    { id: "c2", minutes: 16, starter: false, position: "C" as const },
    { id: "pf2", minutes: 14, starter: false, position: "PF" as const },
  ];
  const chart = paintShifts({ players: rows });
  const byId = new Map(chart.map((row) => [row.id, row]));
  for (let slot = 0; slot < 24; slot++) {
    const on = chart.filter((row) => row.on[slot]);
    assert.equal(on.length, 5);
    const positions = on.map((row) => rows.find((player) => player.id === row.id)?.position);
    assert.ok(positions.some((position) => position === "PG" || position === "SG"));
    assert.ok(positions.some((position) => position === "C" || position === "PF"));
    const centerOut = !byId.get("c")?.on[slot];
    if (centerOut) assert.equal(byId.get("c2")?.on[slot], true);
  }
  assert.equal(chart.reduce((sum, row) => sum + row.minutes, 0), 240);
});

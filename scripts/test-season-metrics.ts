/**
 * Season metrics: BPM 2.0 against Daniel Myers' own calculator (2016-17 Cavaliers),
 * plus sanity checks on PER, Win Shares and the rate stats for a synthetic league.
 * Run: npx tsx scripts/test-season-metrics.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { seasonMetrics, teamBpm, teamPossessions, type Box, type Stint, type TeamSeason } from "./lib/season-metrics";

type FixturePlayer = Box & {
  name: string;
  gp: number;
  min: number;
  listed: number;
  expected: { position: number; role: number; bpm: number; obpm: number; vorp: number };
};
const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/fixtures/bpm2-cle-2017.json"), "utf8"),
) as { teamRating: number; offRatingRel: number; pace: number; teamGames: number; teamMp: number; players: FixturePlayer[] };

const stints: Stint[] = fixture.players.map((p, i) => ({ ...p, pid: i + 1, teamId: 1, team: "CLE", first: "" }));
const sum = (k: keyof Box) => fixture.players.reduce((s, p) => s + p[k], 0);
const result = teamBpm({
  stints,
  team: { pts: sum("pts"), fga: sum("fga"), fta: sum("fta"), reb: sum("reb"), stl: sum("stl"), pf: sum("pf"), ast: sum("ast"), blk: sum("blk"), gp: fixture.teamGames },
  teamMp: fixture.teamMp,
  pace: fixture.pace,
  netRating: fixture.teamRating,
  offRatingRel: fixture.offRatingRel,
  listedPosition: (pid) => fixture.players[pid - 1]!.listed,
});

for (const [i, p] of fixture.players.entries()) {
  const got = result.get(i + 1)!;
  for (const k of ["position", "role", "bpm", "obpm", "vorp"] as const) {
    assert.ok(Math.abs(got[k] - p.expected[k]) < 1e-3, `${p.name} ${k}: got ${got[k]}, calculator ${p.expected[k]}`);
  }
}

// Synthetic two-team league: identical teams make every league ratio equal the team's.
const box = (scale: number): Box => ({
  fgm: 40 * scale, fga: 88 * scale, fg3m: 12 * scale, fg3a: 34 * scale, ftm: 17 * scale, fta: 22 * scale,
  oreb: 10 * scale, dreb: 34 * scale, reb: 44 * scale, ast: 25 * scale, stl: 8 * scale, blk: 5 * scale,
  tov: 14 * scale, pf: 20 * scale, pts: 109 * scale,
});
const games = 82;
const team = (teamId: number): TeamSeason => ({ ...box(games), teamId, gp: games, w: 41, l: 41, min: 48 * games, opp: box(games) });
const teams = [team(1), team(2)];
const fiveEqual = (teamId: number): Stint[] =>
  Array.from({ length: 5 }, (_, i) => ({ ...box(games / 5), pid: teamId * 10 + i, name: `P${teamId}${i}`, teamId, team: `T${teamId}`, first: "", gp: games, min: 48 * games }));
const metrics = seasonMetrics([...fiveEqual(1), ...fiveEqual(2)], teams, () => 3);

const poss = teamPossessions(teams[0]!, teams[0]!.opp);
assert.ok(poss > 95 * games && poss < 105 * games, `possessions ${poss}`);
for (const m of metrics.values()) {
  assert.ok(Math.abs(m.per - 15) < 1e-9, `even league PER is 15, got ${m.per}`);
  assert.ok(Math.abs(m.usg - 20) < 1e-9, `even split usage is 20%, got ${m.usg}`);
  assert.ok(Math.abs(m.trbPct - 10) < 1e-9, `even split rebound share is 10%, got ${m.trbPct}`);
  assert.ok(Math.abs(m.bpm) < 1e-9, `average team, average player: BPM 0, got ${m.bpm}`);
  assert.ok(Math.abs(m.vorp - 2) < 1e-9, `BPM 0 playing every minute is (0 + 2) x 100% = 2 VORP, got ${m.vorp}`);
  // A .500 team's players split about 41 wins between them, give or take the 0.92 and 1.08 margins.
  assert.ok(m.ws > 5 && m.ws < 12, `Win Shares ${m.ws}`);
}

console.log(`season metrics: BPM matches Myers' calculator for ${fixture.players.length} players; synthetic league checks pass`);

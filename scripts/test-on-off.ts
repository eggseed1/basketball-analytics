/**
 * Possession-level on/off: metric math, with/without bookkeeping, and
 * invariants on the committed season files.
 * Run: npx tsx scripts/test-on-off.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { lineupRows, playerDetail, teamPlayerRows, wowy } from "../src/lib/on-off/derive";
import {
  K,
  compareOnOff,
  emptyVec,
  fourFactors,
  garbageMarginThreshold,
  luckAdjustedPts,
  offSplit,
  ratings,
  type OnOffSplit,
  type OnOffVec,
} from "../src/lib/on-off/metrics";
import type { LeagueOnOffFile, OnOffManifest, TeamOnOffFile } from "../src/lib/on-off/types";

const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.ok(a != null && Math.abs(a - b) < eps, `${a} != ${b}`);
};

function vec(values: Partial<Record<keyof typeof K, number>>): OnOffVec {
  const v = emptyVec();
  for (const [k, n] of Object.entries(values)) v[K[k as keyof typeof K]] = n!;
  return v;
}

const LEAGUE = { fg3Pct: 0.36, ftPct: 0.78, pppVar: 1.4 };

function testGarbageThresholds() {
  assert.equal(garbageMarginThreshold(720), 25);
  assert.equal(garbageMarginThreshold(541), 25);
  assert.equal(garbageMarginThreshold(540), 20);
  assert.equal(garbageMarginThreshold(361), 20);
  assert.equal(garbageMarginThreshold(360), 10);
  assert.equal(garbageMarginThreshold(0), 10);
}

function testFactorsAndRatings() {
  const o = vec({ poss: 100, pts: 115, pts2: 250, fga: 85, fgm: 40, fg3a: 35, fg3m: 13, fta: 22, ftm: 17, tov: 13, orb: 10, orbChances: 40 });
  const d = vec({ poss: 100, pts: 108, pts2: 230, fga: 88, fgm: 39, fg3a: 30, fg3m: 12, fta: 18, ftm: 14, tov: 14, orb: 11, orbChances: 45 });
  const ff = fourFactors(o);
  close(ff.efg, (40 + 0.5 * 13) / 85);
  close(ff.tovPct, 0.13);
  close(ff.orbPct, 0.25);
  close(ff.ftRate, 17 / 85);

  const r = ratings({ o, d }, LEAGUE);
  close(r.ortg, 115);
  close(r.drtg, 108);
  close(r.net, 7);
  assert.equal(r.poss, 200);
  // Opponent made 12 of 30 threes (40%) and 14 of 18 FTs; league average removes the luck.
  const adj = 108 - 3 * 12 + 3 * 30 * 0.36 - 14 + 18 * 0.78;
  close(luckAdjustedPts(d, LEAGUE), adj);
  close(r.drtgLuckAdj, adj);
  close(r.netLuckAdj, 115 - adj);
  assert.ok(r.netSe != null && r.netSe > 0);

  const empty = ratings({ o: emptyVec(), d: emptyVec() }, LEAGUE);
  assert.equal(empty.ortg, null);
  assert.equal(empty.net, null);
  assert.equal(empty.netSe, null);
}

function testOffIsTeamMinusOn() {
  const team: OnOffSplit = { o: vec({ poss: 300, pts: 345 }), d: vec({ poss: 300, pts: 330 }) };
  const on: OnOffSplit = { o: vec({ poss: 200, pts: 240 }), d: vec({ poss: 200, pts: 210 }) };
  const off = offSplit(team, on);
  assert.equal(off.o[K.poss], 100);
  assert.equal(off.d[K.pts], 120);
  const cmp = compareOnOff(team, on, LEAGUE);
  close(cmp.on.net, 15);
  close(cmp.off.net, -15);
  close(cmp.netDiff, 30);
  close(cmp.ortgDiff, 15);
  close(cmp.drtgDiff, -15);
}

function syntheticFile(): TeamOnOffFile {
  const s = (poss: number, pts: number, dpts: number): OnOffSplit => ({
    o: vec({ poss, pts, pts2: pts * 2, sec: poss * 14 }),
    d: vec({ poss, pts: dpts, pts2: dpts * 2, sec: poss * 14 }),
  });
  const views = (poss: number, pts: number, dpts: number) => ({ clean: s(poss, pts, dpts), all: s(poss, pts, dpts) });
  return {
    version: 1,
    season: "test",
    teamId: "1",
    teamAbbr: "TST",
    generatedAt: "",
    games: 1,
    keys: [],
    team: views(1000, 1150, 1100),
    players: [
      { id: "a", name: "Alpha One", gp: 1, starts: 1, ...views(700, 840, 735) },
      { id: "b", name: "Beta Two", gp: 1, starts: 1, ...views(600, 690, 660) },
    ],
    pairs: [{ a: "a", b: "b", ...views(450, 540, 470) }],
    lineups: [{ ids: ["a", "b", "c", "d", "e"], ...views(120, 140, 120) }],
  };
}

function testWowyPartitions() {
  const file = syntheticFile();
  const w = wowy(file, null, "a", "b", "all");
  assert.ok(w);
  assert.equal(w.both.poss / 2, 450);
  assert.equal(w.aOnly.poss / 2, 250);
  assert.equal(w.bOnly.poss / 2, 150);
  assert.equal(w.neither.poss / 2, 1000 - 450 - 250 - 150);
  const neitherPts = 1150 - 540 - (840 - 540) - (690 - 540);
  close(w.neither.ortg, (neitherPts / 150) * 100);

  const swapped = wowy(file, null, "b", "a", "all");
  assert.ok(swapped);
  assert.equal(swapped.aOnly.poss, w.bOnly.poss);

  const rows = teamPlayerRows(file, null, "all");
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.netDiffPercentile, null, "no league file means no rank");
  assert.ok(rows.every((r) => r.smallSample), "under 1,000 possessions is a small sample");

  const detail = playerDetail(file, null, "a", "all");
  assert.ok(detail);
  assert.equal(detail.teammates.length, 1);
  assert.equal(detail.lineups.length, 1);
  assert.deepEqual(lineupRows(file, null, "all")[0]!.names.slice(0, 2), ["Alpha One", "Beta Two"]);
  assert.equal(playerDetail(file, null, "zzz", "all"), null);
}

function testCommittedFiles() {
  const root = path.join(process.cwd(), "public/runtime/on-off");
  const manifestPath = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as OnOffManifest;
  assert.ok(manifest.seasons.length > 0);
  for (const { season, teams } of manifest.seasons) {
    const league = JSON.parse(fs.readFileSync(path.join(root, season, "league.json"), "utf8")) as LeagueOnOffFile;
    assert.equal(league.season, season);
    for (const teamId of teams) {
      const file = JSON.parse(fs.readFileSync(path.join(root, season, `${teamId}.json`), "utf8")) as TeamOnOffFile;
      assert.equal(file.teamId, teamId);
      assert.ok(file.games >= 1 && file.games <= 82, `${season} ${teamId} games ${file.games}`);
      for (const view of ["clean", "all"] as const) {
        for (const side of ["o", "d"] as const) {
          const teamPoss = file.team[view][side][K.poss]!;
          const credited = file.players.reduce((sum, p) => sum + p[view][side][K.poss]!, 0);
          assert.equal(credited, teamPoss * 5, `${season} ${file.teamAbbr} ${view}.${side}: five players per possession`);
        }
      }
      assert.ok(file.team.clean.o[K.poss]! <= file.team.all.o[K.poss]!, "filtered is a subset of all");
    }
  }
}

testGarbageThresholds();
testFactorsAndRatings();
testOffIsTeamMinusOn();
testWowyPartitions();
testCommittedFiles();
console.log("on-off: ok");

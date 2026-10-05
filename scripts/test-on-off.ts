/**
 * Possession-level on/off: metric math, with/without bookkeeping, and
 * invariants on the committed season files.
 * Run: npx tsx scripts/test-on-off.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  lineupRows,
  onOffTrend,
  playerDetail,
  replacements,
  teamPlayerRows,
  wowy,
} from "../src/lib/on-off/derive";
import {
  K,
  ON_OFF_VIEWS,
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
import {
  GAME_LOG_VIEWS,
  ON_OFF_FILE_VERSION,
  onOffDir,
  type LeagueOnOffFile,
  type OnOffManifest,
  type OnOffPhase,
  type TeamOnOffFile,
} from "../src/lib/on-off/types";

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
  const views = (poss: number, pts: number, dpts: number) => ({
    clean: s(poss, pts, dpts),
    all: s(poss, pts, dpts),
    clutch: s(poss / 10, pts / 10, dpts / 10),
  });
  const noLog = { clean: [], all: [] };
  return {
    version: 1,
    season: "test",
    phase: "regular",
    teamId: "1",
    teamAbbr: "TST",
    generatedAt: "",
    games: 1,
    keys: [],
    schedule: [],
    team: views(1000, 1150, 1100),
    teamLog: noLog,
    players: [
      { id: "a", name: "Alpha One", gp: 1, starts: 1, rating: null, log: noLog, ...views(700, 840, 735) },
      { id: "b", name: "Beta Two", gp: 1, starts: 1, rating: null, log: noLog, ...views(600, 690, 660) },
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

function testQualityContext() {
  // Team: 100 offensive possessions. Player "a" (rated +2) played 60 of them
  // alongside four teammates rated +1; the other 40 had five players rated 0.
  const side = (poss: number, ownQ: number, ownQN: number, oppQ: number, oppQN: number) =>
    vec({ poss, ownQ, ownQN, oppQ, oppQN });
  const on = { o: side(60, 60 * (2 + 4), 300, 60 * 1.5, 300), d: emptyVec() };
  const team = { o: side(100, 60 * 6, 500, 60 * 1.5 + 40 * 0.5, 500), d: emptyVec() };
  const file = syntheticFile();
  file.team.all = team;
  file.players[0] = { ...file.players[0]!, rating: 2, all: on };
  const row = teamPlayerRows(file, null, "all").find((r) => r.id === "a")!;
  close(row.quality.teammatesOn, 1);
  close(row.quality.teammatesOff, 0);
  close(row.quality.opponentsOn, 0.3);
  close(row.quality.opponentsOff, 0.1);

  // Unrated player: his own slot is already absent from the sums.
  file.players[0] = { ...file.players[0]!, rating: null, all: { o: side(60, 60 * 4, 240, 0, 0), d: emptyVec() } };
  const unrated = teamPlayerRows(file, null, "all").find((r) => r.id === "a")!;
  close(unrated.quality.teammatesOn, 1);
  assert.equal(unrated.quality.opponentsOn, null);
}

function testReplacementsAndTrend() {
  const file = syntheticFile();
  // a on 700 of 1000; b plays 450 with a (64% of a's 700) and 150 of the 300 without (50%).
  assert.equal(replacements(file, "a", "all").length, 0, "b plays less when a sits");
  // b on 600; a plays 450 with b (75%) and 250 of the 400 without (62.5%).
  assert.equal(replacements(file, "b", "all").length, 0);
  file.pairs[0] = { ...file.pairs[0]!, all: { o: vec({ poss: 300 }), d: vec({ poss: 300 }) } };
  const r = replacements(file, "b", "all");
  assert.equal(r.length, 1);
  close(r[0]!.shareWith, 0.5);
  close(r[0]!.shareWithout, 1);
  assert.equal(r[0]!.possWithout, 800);

  // Two games: a plays only game 0. Season-to-date swing must match the season comparison.
  const t = syntheticFile();
  t.schedule = [
    { id: "g0", date: "2025-10-22", opp: "AAA", home: true },
    { id: "g1", date: "2025-10-24", opp: "BBB", home: false },
  ];
  t.teamLog = { clean: [], all: [[0, 300, 330, 300, 300], [1, 300, 320, 300, 310]] };
  t.players[0]!.log = { clean: [], all: [[0, 260, 290, 260, 250]] };
  const trend = onOffTrend(t, "a", "all");
  assert.equal(trend.length, 2);
  assert.equal(trend[0]!.swing, null, "under 250 possessions off, the line waits");
  assert.equal(trend[1]!.played, false);
  const onNet = (100 * 290) / 260 - (100 * 250) / 260;
  const offNet = (100 * (650 - 290)) / (600 - 260) - (100 * (610 - 250)) / (600 - 260);
  close(trend[1]!.swing, onNet - offNet);
  assert.equal(onOffTrend(t, "a", "clutch").length, 0);
}

function testCommittedFiles() {
  const root = path.join(process.cwd(), "public/runtime/on-off");
  const manifestPath = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as OnOffManifest;
  assert.ok(manifest.seasons.length > 0);
  for (const entry of manifest.seasons) {
    checkSeason(root, entry.season, "regular", entry.teams);
    if (entry.playoffs) checkSeason(root, entry.season, "playoffs", entry.playoffs.teams);
  }
}

function checkSeason(root: string, season: string, phase: OnOffPhase, teams: string[]) {
  const dir = path.join(root, onOffDir(season, phase));
  const league = JSON.parse(fs.readFileSync(path.join(dir, "league.json"), "utf8")) as LeagueOnOffFile;
  assert.equal(league.season, season);
  assert.equal(league.phase, phase);
  assert.equal(league.version, ON_OFF_FILE_VERSION);
  for (const teamId of teams) {
    const file = JSON.parse(fs.readFileSync(path.join(dir, `${teamId}.json`), "utf8")) as TeamOnOffFile;
    const label = `${season} ${phase} ${file.teamAbbr}`;
    assert.equal(file.teamId, teamId);
    assert.equal(file.phase, phase);
    const maxGames = phase === "playoffs" ? 28 : 82;
    assert.ok(file.games >= 1 && file.games <= maxGames, `${label} games ${file.games}`);
    assert.equal(file.schedule.length, file.games, `${label}: one schedule row per game`);
    assert.equal(file.teamLog.all.length, file.games, `${label}: team log covers every game`);
    for (const view of GAME_LOG_VIEWS) {
      const logPoss = file.teamLog[view].reduce((sum, r) => sum + r[1], 0);
      assert.equal(logPoss, file.team[view].o[K.poss], `${label} ${view} log sums to the season`);
    }
    const star = file.players[0]!;
    const last = onOffTrend(file, star.id, "all").at(-1);
    const cmp = compareOnOff(file.team.all, star.all, LEAGUE);
    if (last?.swing != null && cmp.netDiff != null) close(last.swing, cmp.netDiff, 0.05);

    for (const view of ON_OFF_VIEWS) {
      for (const side of ["o", "d"] as const) {
        const teamPoss = file.team[view][side][K.poss]!;
        const credited = file.players.reduce((sum, p) => sum + p[view][side][K.poss]!, 0);
        assert.equal(credited, teamPoss * 5, `${label} ${view}.${side}: five players per possession`);
      }
    }
    assert.ok(file.team.clean.o[K.poss]! <= file.team.all.o[K.poss]!, "filtered is a subset of all");
    assert.ok(file.team.clutch.o[K.poss]! < file.team.all.o[K.poss]! * 0.15, "clutch is a small slice");
    const rated = file.team.all.o[K.ownQN]! / (file.team.all.o[K.poss]! * 5);
    assert.ok(rated > 0.95, `${label} rated coverage ${rated.toFixed(3)}`);
    if (phase === "playoffs") {
      const ranked = teamPlayerRows(file, league, "all").some((r) => r.netDiffPercentile != null);
      assert.equal(ranked, false, "playoff splits carry no league rank");
    } else {
      assert.ok(file.team.clutch.o[K.poss]! > 0, `${label} has clutch possessions`);
    }
  }
}

testGarbageThresholds();
testFactorsAndRatings();
testOffIsTeamMinusOn();
testWowyPartitions();
testQualityContext();
testReplacementsAndTrend();
testCommittedFiles();
console.log("on-off: ok");

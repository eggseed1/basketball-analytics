/**
 * Team visualization rows: records, box joins, and rating math.
 * Run: npx tsx scripts/test-team-viz.ts
 */
import assert from "node:assert/strict";

import { getRuntimeSnapshotGames } from "../src/data/runtime/game-snapshot";
import { teamGameBoxesByDate } from "../src/data/runtime/team-game-box-snapshot";
import {
  buildTeamVizRows,
  expectedWins,
  parseTeamVizView,
  TEAM_VIZ_SCATTERS,
  TEAM_VIZ_VIEWS,
} from "../src/lib/team-viz";

const season = "2024-25";
const rows = buildTeamVizRows(getRuntimeSnapshotGames(season), (id) => teamGameBoxesByDate(id, season));

assert.equal(rows.length, 30, "30 teams");
for (const r of rows) {
  assert.equal(r.games, 82, `${r.abbr} plays 82`);
  assert.equal(r.wins + r.losses, 82);
  assert.equal(r.homeWins + r.homeLosses + r.roadWins + r.roadLosses, 82);
  assert.ok(r.box, `${r.abbr} has box stats`);
  assert.ok(r.box!.games >= 80, `${r.abbr} box covers ${r.box!.games} games`);
  assert.ok(r.box!.pace > 94 && r.box!.pace < 106, `${r.abbr} pace ${r.box!.pace}`);
  assert.ok(r.box!.efg > 0.45 && r.box!.efg < 0.62);
  assert.ok(r.quarterNet, `${r.abbr} has quarter splits`);
}
assert.equal(
  rows.reduce((s, r) => s + r.wins, 0),
  rows.reduce((s, r) => s + r.losses, 0),
  "league wins equal losses"
);

const okc = rows.find((r) => r.abbr === "OKC");
assert.ok(okc);
assert.equal(`${okc.wins}-${okc.losses}`, "68-14");
assert.ok(okc.box!.net > 11 && okc.box!.net < 14.5, `OKC net ${okc.box!.net.toFixed(1)}`);
assert.ok(Math.abs(expectedWins(okc)! - 68) < 6, "OKC expected wins near actual");

const avgOrtg = rows.reduce((s, r) => s + r.box!.ortg, 0) / rows.length;
const avgDrtg = rows.reduce((s, r) => s + r.box!.drtg, 0) / rows.length;
assert.ok(Math.abs(avgOrtg - avgDrtg) < 0.5, "league offense and defense balance");
assert.ok(avgOrtg > 108 && avgOrtg < 120, `league ORtg ${avgOrtg.toFixed(1)}`);

const preBox = buildTeamVizRows(getRuntimeSnapshotGames("2021-22"), (id) => teamGameBoxesByDate(id, "2021-22"));
assert.ok(preBox.length === 30 && preBox.every((r) => r.box === null), "2021-22 has records but no box stats");

assert.equal(parseTeamVizView("nope"), "race");
assert.equal(parseTeamVizView("luck"), "luck");
for (const view of Object.keys(TEAM_VIZ_SCATTERS)) {
  assert.ok(TEAM_VIZ_VIEWS.some((v) => v.id === view), `${view} is a listed view`);
}

console.log(
  `test-team-viz: all assertions passed (OKC ${okc.wins}-${okc.losses}, ORtg ${okc.box!.ortg.toFixed(1)}, DRtg ${okc.box!.drtg.toFixed(1)}, pace ${okc.box!.pace.toFixed(1)})`
);

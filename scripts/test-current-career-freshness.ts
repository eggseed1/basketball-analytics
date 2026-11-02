import assert from "node:assert/strict";
import type { PlayerSeason } from "../src/data/types";
import { preferFreshCurrentCareerRows } from "../src/data/queries/fresh-current-career";

const season = "2026-27";
const row = (year: string, gp: number, points: number, id = "1966", team = "LAL") =>
  ({ playerId: id, playerName: "Player", teamId: team,
     season: year, gamesPlayed: gp, points, minutes: gp * 32,
     fieldGoalsAttempted: gp * 16, fieldGoalsMade: gp * 8,
     threePointersAttempted: gp * 6, threePointersMade: gp * 2,
     per: 19 }) as PlayerSeason;

const history = row("2025-26", 70, 1800);
const baked = [row(season, 2, 40), history];
const newer = [row(season, 5, 120, "espn:1966")];
const merged = preferFreshCurrentCareerRows(baked, newer, season);
assert.equal(merged.length, 2, "current year must not duplicate");
assert.equal(merged[0]?.gamesPlayed, 5);
assert.equal(merged[0]?.points, 120, "totals and GP change together");
assert.equal(merged[0]?.minutes, 160, "minutes change with denominator");
assert.equal(merged[0]?.playerId, "1966", "retain route identity");
assert.equal(merged[1]?.gamesPlayed, 70, "historical seasons remain untouched");
assert.equal(merged[1], history);
assert.equal(preferFreshCurrentCareerRows(baked, [row(season, 1, 20)], season), baked,
  "older ESPN cache must not roll current season backward");
assert.equal(preferFreshCurrentCareerRows(baked, [row("2025-26", 80, 1900)], season), baked,
  "wrong-season data must not replace current season");
assert.equal(preferFreshCurrentCareerRows(baked, [], season), baked,
  "failed ESPN fetch keeps prior data");
const multiple = preferFreshCurrentCareerRows(baked, [
  row(season, 2, 40, "espn", "LAL"),
  row(season, 3, 70, "espn", "NYK"),
  row(season, 5, 110, "espn", "TOT"),
], season);
assert.equal(multiple.filter(r => r.season === season).length, 3, "preserve real traded stints and total");
assert.ok(multiple.every(r => r.playerId === "1966"), "all rows keep route identity");
console.log("Current career freshness: live counters, historical rows, stale guard and multi-team rows passed.");

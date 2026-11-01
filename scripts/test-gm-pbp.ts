import assert from "node:assert/strict";
import test from "node:test";

import { boxToPlayByPlay, linesAtCutoff } from "../src/gm/engine/play-by-play";
import { buildCourtEvents } from "../src/lib/games/court-events";
import {
  countCourtFilterMatches,
  countTaggedPlays,
  tagPlayContexts,
} from "../src/lib/games/play-filters";
import type { GmBoxScore } from "../src/gm/types";

function line(
  partial: Partial<GmBoxScore["players"][number]> & Pick<GmBoxScore["players"][number], "playerId" | "playerName" | "teamId">
): GmBoxScore["players"][number] {
  return {
    minutes: 30,
    points: 0,
    assists: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    plusMinus: 0,
    trueShootingPct: 0,
    usagePct: 0,
    gameScore: 0,
    ...partial,
  };
}

test("a GM box becomes a shot-chart feed with the same counting", () => {
  const box: GmBoxScore = {
    id: "box_test",
    gameId: "g1",
    season: 2027,
    day: 1,
    homeTeamId: "bos",
    awayTeamId: "det",
    homeScore: 11,
    awayScore: 8,
    players: [
      line({
        playerId: "tatum",
        playerName: "Jayson Tatum",
        teamId: "bos",
        points: 8,
        fgm: 3,
        fga: 6,
        tpm: 1,
        tpa: 3,
        ftm: 1,
        fta: 2,
        assists: 1,
        rebounds: 3,
        steals: 1,
        blocks: 1,
        turnovers: 1,
      }),
      line({
        playerId: "white",
        playerName: "Derrick White",
        teamId: "bos",
        points: 3,
        fgm: 1,
        fga: 2,
        tpm: 1,
        tpa: 1,
        assists: 2,
        rebounds: 1,
        turnovers: 1,
      }),
      line({
        playerId: "cade",
        playerName: "Cade Cunningham",
        teamId: "det",
        points: 8,
        fgm: 3,
        fga: 5,
        tpm: 0,
        tpa: 1,
        ftm: 2,
        fta: 2,
        assists: 1,
        rebounds: 2,
        steals: 1,
        blocks: 0,
        turnovers: 2,
      }),
    ],
  };
  const events = boxToPlayByPlay(box);
  const built = buildCourtEvents(events, "BOS", "DET");
  const tally = (side: "home" | "away", stat: "fgm" | "fga" | "tpm" | "tpa" | "ftm" | "fta" | "ast" | "stl" | "blk" | "tov" | "oreb" | "dreb") =>
    built.ticks.filter((tick) => tick.side === side && tick.stat === stat).length;
  assert.equal(tally("home", "fga"), 8);
  assert.equal(tally("home", "fgm"), 4);
  assert.equal(tally("home", "tpa"), 4);
  assert.equal(tally("home", "tpm"), 2);
  assert.equal(tally("home", "fta"), 2);
  assert.equal(tally("home", "ftm"), 1);
  assert.equal(tally("away", "fga"), 5);
  assert.equal(tally("away", "fgm"), 3);
  assert.equal(tally("away", "ftm"), 2);
  assert.ok(built.court.filter((event) => event.kind === "make" || event.kind === "miss").length >= 13);
  const last = built.marks.at(-1);
  assert.equal(last?.home, 11);
  assert.equal(last?.away, 8);
  assert.ok(built.court.some((event) => event.three && event.kind === "make"));
});

test("shot spots follow the three-point arc instead of a flat depth band", () => {
  const box: GmBoxScore = {
    id: "box_spots",
    gameId: "g2",
    season: 2027,
    day: 2,
    homeTeamId: "bos",
    awayTeamId: "nyk",
    homeScore: 110,
    awayScore: 104,
    players: [
      line({
        playerId: "a",
        playerName: "Home Wing",
        teamId: "bos",
        points: 40,
        fgm: 15,
        fga: 40,
        tpm: 10,
        tpa: 28,
        ftm: 0,
        fta: 0,
      }),
      line({
        playerId: "b",
        playerName: "Away Wing",
        teamId: "nyk",
        points: 36,
        fgm: 12,
        fga: 35,
        tpm: 8,
        tpa: 24,
        ftm: 0,
        fta: 0,
      }),
    ],
  };
  const events = boxToPlayByPlay(box).filter((event) => event.isFieldGoal && event.locX != null && event.locY != null);
  const threes = events.filter((event) => event.actionType === "3pt");
  const twos = events.filter((event) => event.actionType === "2pt");
  assert.ok(threes.length >= 40);
  assert.ok(twos.length >= 20);

  const above = threes.filter((event) => (event.locY ?? 0) > 9);
  const depths = above.map((event) => event.locY ?? 0);
  const mean = depths.reduce((sum, n) => sum + n, 0) / depths.length;
  const variance =
    depths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / Math.max(1, depths.length - 1);
  // A flat y≈23.2 band had std under 1. The arc needs real depth spread.
  assert.ok(Math.sqrt(variance) > 2.5, `above-break depth std ${Math.sqrt(variance)}`);

  for (const event of threes) {
    const r = Math.hypot(event.locX ?? 0, event.locY ?? 0);
    assert.ok(r >= 21.5, `three too close to rim: ${r}`);
  }

  const rimX = twos
    .filter((event) => Math.hypot(event.locX ?? 0, event.locY ?? 0) <= 5)
    .map((event) => event.locX ?? 0);
  assert.ok(rimX.length >= 5);
  const rimMean = rimX.reduce((sum, n) => sum + n, 0) / rimX.length;
  const rimVar =
    rimX.reduce((sum, n) => sum + (n - rimMean) ** 2, 0) / Math.max(1, rimX.length - 1);
  assert.ok(Math.sqrt(rimVar) > 0.7, `rim x spread ${Math.sqrt(rimVar)}`);
});

test("GM tape tags fast breaks and ticks box lines with the cutoff", () => {
  const box: GmBoxScore = {
    id: "box_break",
    gameId: "g3",
    season: 2027,
    day: 3,
    homeTeamId: "bos",
    awayTeamId: "det",
    homeScore: 24,
    awayScore: 20,
    players: [
      line({
        playerId: "tatum",
        playerName: "Jayson Tatum",
        teamId: "bos",
        points: 14,
        fgm: 5,
        fga: 10,
        tpm: 2,
        tpa: 5,
        ftm: 2,
        fta: 2,
        assists: 2,
        rebounds: 4,
        steals: 3,
        blocks: 0,
        turnovers: 1,
      }),
      line({
        playerId: "white",
        playerName: "Derrick White",
        teamId: "bos",
        points: 10,
        fgm: 4,
        fga: 8,
        tpm: 1,
        tpa: 3,
        assists: 3,
        rebounds: 2,
        steals: 1,
        turnovers: 2,
      }),
      line({
        playerId: "cade",
        playerName: "Cade Cunningham",
        teamId: "det",
        points: 20,
        fgm: 7,
        fga: 14,
        tpm: 2,
        tpa: 6,
        ftm: 4,
        fta: 4,
        assists: 4,
        rebounds: 3,
        steals: 2,
        turnovers: 4,
      }),
    ],
  };
  const events = boxToPlayByPlay(box);
  const running = events.filter((e) =>
    /\brunning\s+(?:layup|dunk)\b/i.test(e.description ?? "")
  );
  assert.ok(running.length >= 1, `expected running finishes, got ${running.length}`);
  const tags = tagPlayContexts(events, "BOS", "DET");
  const fast = countTaggedPlays(tags, "fastBreak");
  const second = countTaggedPlays(tags, "secondChance");
  const late = countTaggedPlays(tags, "lastSecond");
  assert.ok(fast >= 1, `fastBreak tags ${fast}`);
  assert.ok(fast <= 12, `fastBreak too high for a short box: ${fast}`);
  assert.ok(second >= 1, `secondChance tags ${second}`);
  assert.ok(late >= 1, `lastSecond tags ${late}`);
  const { court } = buildCourtEvents(events, "BOS", "DET");
  const shots = court.filter((c) => c.kind === "make" || c.kind === "miss");
  assert.equal(countCourtFilterMatches(shots, "fastBreak", tags), fast);

  const mid = linesAtCutoff(box, events, 720);
  const end = linesAtCutoff(box, events, null);
  const midPts = mid.reduce((s, p) => s + p.points, 0);
  const endPts = end.reduce((s, p) => s + p.points, 0);
  assert.ok(midPts < endPts, `mid ${midPts} should trail final ${endPts}`);
  assert.equal(endPts, box.homeScore + box.awayScore);
});

test("full-length GM tape keeps shot-context chips in a realistic band", () => {
  const box: GmBoxScore = {
    id: "box_full_chip",
    gameId: "g4",
    season: 2027,
    day: 4,
    homeTeamId: "nyk",
    awayTeamId: "bos",
    homeScore: 98,
    awayScore: 99,
    players: [
      line({
        playerId: "brunson",
        playerName: "Jalen Brunson",
        teamId: "nyk",
        points: 28,
        fgm: 10,
        fga: 22,
        tpm: 3,
        tpa: 9,
        ftm: 5,
        fta: 6,
        assists: 6,
        rebounds: 4,
        steals: 2,
        turnovers: 3,
      }),
      line({
        playerId: "hart",
        playerName: "Josh Hart",
        teamId: "nyk",
        points: 14,
        fgm: 5,
        fga: 11,
        tpm: 2,
        tpa: 5,
        ftm: 2,
        fta: 2,
        assists: 4,
        rebounds: 10,
        steals: 1,
        turnovers: 2,
      }),
      line({
        playerId: "og",
        playerName: "OG Anunoby",
        teamId: "nyk",
        points: 16,
        fgm: 6,
        fga: 14,
        tpm: 2,
        tpa: 7,
        ftm: 2,
        fta: 2,
        assists: 2,
        rebounds: 5,
        steals: 2,
        blocks: 1,
        turnovers: 1,
      }),
      line({
        playerId: "towns",
        playerName: "Karl-Anthony Towns",
        teamId: "nyk",
        points: 22,
        fgm: 8,
        fga: 16,
        tpm: 2,
        tpa: 6,
        ftm: 4,
        fta: 5,
        assists: 2,
        rebounds: 11,
        blocks: 1,
        turnovers: 2,
      }),
      line({
        playerId: "mikal",
        playerName: "Mikal Bridges",
        teamId: "nyk",
        points: 18,
        fgm: 7,
        fga: 15,
        tpm: 3,
        tpa: 8,
        ftm: 1,
        fta: 1,
        assists: 3,
        rebounds: 4,
        steals: 1,
        turnovers: 1,
      }),
      line({
        playerId: "tatum",
        playerName: "Jayson Tatum",
        teamId: "bos",
        points: 27,
        fgm: 9,
        fga: 21,
        tpm: 3,
        tpa: 10,
        ftm: 6,
        fta: 7,
        assists: 5,
        rebounds: 8,
        steals: 1,
        blocks: 1,
        turnovers: 3,
      }),
      line({
        playerId: "brown",
        playerName: "Jaylen Brown",
        teamId: "bos",
        points: 24,
        fgm: 9,
        fga: 19,
        tpm: 2,
        tpa: 8,
        ftm: 4,
        fta: 5,
        assists: 4,
        rebounds: 6,
        steals: 2,
        turnovers: 2,
      }),
      line({
        playerId: "white",
        playerName: "Derrick White",
        teamId: "bos",
        points: 18,
        fgm: 6,
        fga: 14,
        tpm: 3,
        tpa: 8,
        ftm: 3,
        fta: 3,
        assists: 5,
        rebounds: 4,
        steals: 2,
        turnovers: 2,
      }),
      line({
        playerId: "holiday",
        playerName: "Jrue Holiday",
        teamId: "bos",
        points: 14,
        fgm: 5,
        fga: 12,
        tpm: 2,
        tpa: 6,
        ftm: 2,
        fta: 2,
        assists: 4,
        rebounds: 5,
        steals: 1,
        turnovers: 2,
      }),
      line({
        playerId: "horford",
        playerName: "Al Horford",
        teamId: "bos",
        points: 16,
        fgm: 6,
        fga: 12,
        tpm: 2,
        tpa: 6,
        ftm: 2,
        fta: 2,
        assists: 3,
        rebounds: 9,
        blocks: 1,
        turnovers: 1,
      }),
    ],
  };
  const events = boxToPlayByPlay(box);
  const tags = tagPlayContexts(events, "NYK", "BOS");
  const { court } = buildCourtEvents(events, "NYK", "BOS");
  const shots = court.filter((c) => c.kind === "make" || c.kind === "miss");
  const fast = countCourtFilterMatches(shots, "fastBreak", tags);
  const second = countCourtFilterMatches(shots, "secondChance", tags);
  const late = countCourtFilterMatches(shots, "lastSecond", tags);
  const offTo = countCourtFilterMatches(shots, "offTurnover", tags);
  assert.ok(fast >= 4 && fast <= 28, `fastBreak ${fast}`);
  assert.ok(second >= 4 && second <= 30, `secondChance ${second}`);
  assert.ok(late >= 3 && late <= 16, `lastSecond ${late}`);
  assert.ok(offTo >= 2 && offTo <= 24, `offTurnover ${offTo}`);
  assert.ok(fast < shots.length * 0.35, `fastBreak share ${fast}/${shots.length}`);
});

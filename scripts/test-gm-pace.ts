/**
 * Skip-ahead recap: a stretch should name the record and a big night.
 * Run: npx tsx scripts/test-gm-pace.ts
 */
import assert from "node:assert/strict";

import { buildSheet, SHEET_VERSION } from "../src/gm/engine/attributes";
import { autoSetLineup } from "../src/gm/engine/lineup";
import { paintShifts } from "../src/gm/engine/coaching";
import { buildDigest, stepDay } from "../src/gm/engine/pace";
import { simulateGame } from "../src/gm/engine/simulate";
import { noteTradeDeadline } from "../src/gm/engine/offseason";
import { tradeDeadlineDay } from "../src/gm/engine/schedule";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import type { GmBoxScore, GmCountingLine } from "../src/gm/types";

const league = createGeneratedLeague({
  userTeamId: "bos",
  season: 2026,
  seed: 3,
});
const stepped = stepDay(league);
assert.ok(stepped.league.day >= league.day);
assert.ok(
  stepped.league.boxScores.length > league.boxScores.length ||
    stepped.seasonOver
);

const box: GmBoxScore = {
  id: "box1",
  gameId: "g1",
  season: 2026,
  day: 1,
  homeTeamId: "bos",
  awayTeamId: "nyk",
  homeScore: 118,
  awayScore: 116,
  players: [
    {
      playerId: "p1",
      playerName: "Jalen Crowe",
      teamId: "bos",
      minutes: 36,
      points: 41,
      assists: 6,
      rebounds: 8,
      steals: 1,
      blocks: 0,
      turnovers: 2,
      fgm: 14,
      fga: 24,
      tpm: 5,
      tpa: 10,
      ftm: 8,
      fta: 8,
      plusMinus: 12,
      trueShootingPct: 0.62,
      usagePct: 0.3,
      gameScore: 32,
    },
  ],
};

const digest = buildDigest({
  boxes: [box],
  userTeamId: "bos",
  players: league.players,
  winsBefore: 10,
  lossesBefore: 8,
  winsAfter: 11,
  lossesAfter: 8,
  injuries: [],
});
assert.ok(digest.some((item) => item.headline.includes("1-0")));
assert.ok(digest.some((item) => item.headline.includes("41")));
assert.equal(digest[0]?.gameId, "box1");

const race = buildDigest({
  boxes: [],
  userTeamId: "bos",
  players: league.players,
  winsBefore: 0,
  lossesBefore: 0,
  winsAfter: 4,
  lossesAfter: 2,
  injuries: [],
  standings: {
    ...league.standings,
    bos: { ...league.standings.bos!, wins: 4, losses: 2 },
    nyk: { ...league.standings.nyk!, wins: 6, losses: 1 },
  },
  teams: league.teams,
});
assert.ok(race.some((item) => item.headline.includes("NYK leads the league at 6-1")));
assert.ok(race.some((item) => item.detail.includes("You are")));

const yours = new Set(
  league.players.filter((player) => player.teamId === "bos").map((player) => player.id)
);
const deadlineDay = tradeDeadlineDay(league.schedule) + 1;
const atDeadline = noteTradeDeadline({
  ...league,
  day: deadlineDay,
  seenCheckpoints: ["trade_deadline"],
});
assert.equal(atDeadline.tradeDeadlinePassed, true);
const stillYours = atDeadline.players.filter((player) => player.teamId === "bos");
assert.ok(stillYours.every((player) => yours.has(player.id)));
assert.equal(stillYours.length, yours.size);
const moved = atDeadline.tradeLog.length;

function counting(gp: number, mpg: number): GmCountingLine {
  const min = gp * mpg;
  return {
    season: "2025-26",
    team: "BOS",
    gp,
    min,
    pts: min * 0.5,
    reb: min * 0.15,
    ast: min * 0.1,
    stl: min * 0.02,
    blk: min * 0.01,
    tov: min * 0.05,
    fgm: min * 0.2,
    fga: min * 0.45,
    tpm: min * 0.08,
    tpa: min * 0.2,
    ftm: min * 0.08,
    fta: min * 0.1,
  };
}

const rotationLeague = createGeneratedLeague({
  userTeamId: "bos",
  season: 2026,
  seed: 11,
});
const bosRoster = rotationLeague.players.filter((player) => player.teamId === "bos");
const star = bosRoster.find((player) => player.position === "SF") ?? bosRoster[0]!;
star.position = "SF";
star.injury = null;
star.minutesPreference = 33;
star.nbaSeason = counting(16, 33);
star.sheet = { ...buildSheet(star), version: SHEET_VERSION, overall: 92 };
for (const player of bosRoster) {
  if (player.id === star.id) continue;
  player.injury = null;
  player.nbaSeason = counting(78, 22);
  player.sheet = { ...buildSheet(player), version: SHEET_VERSION, overall: 67 };
}
const rotationTeams = rotationLeague.teams.map((team) =>
  team.id === "bos" ? autoSetLineup({ ...team, coaching: undefined }, rotationLeague.players) : team
);
const bosTeam = rotationTeams.find((team) => team.id === "bos")!;
assert.equal(bosTeam.starters.SF, star.id);
const foe = rotationTeams.find((team) => team.id !== "bos")!;
const totals = new Map<string, number>();
for (let game = 0; game < 20; game += 1) {
  const result = simulateGame(
    {
      id: `rot-${game}`,
      season: 2026,
      day: game,
      homeTeamId: "bos",
      awayTeamId: foe.id,
      played: false,
    },
    rotationTeams,
    rotationLeague.players,
    80 + game
  );
  const line = result.box.players.find((player) => player.playerId === star.id);
  assert.ok(line && line.minutes >= 24, `star sat or played ${line?.minutes ?? 0}`);
  for (const player of result.box.players) {
    if (player.teamId !== "bos") continue;
    totals.set(player.playerId, (totals.get(player.playerId) ?? 0) + player.minutes);
  }
}
const starTotal = totals.get(star.id) ?? 0;
for (const [id, minutes] of totals) {
  if (id === star.id) continue;
  // Float noise over 20 games can be a fraction of a minute; star still leads.
  assert.ok(
    starTotal + 0.05 >= minutes,
    `star ${starTotal.toFixed(1)} should lead ${id} at ${minutes.toFixed(1)}`
  );
}

const shiftPlayers = [36, 32, 30, 28, 26, 18, 14, 10].map((minutes, index) => ({
  id: `s${index}`,
  minutes,
  starter: index < 5,
  position: (["PG", "SG", "SF", "PF", "C", "SG", "SF", "PF"] as const)[index],
}));
const balanced = paintShifts({ players: shiftPlayers });
for (let slot = 0; slot < 24; slot++) {
  assert.equal(balanced.filter((row) => row.on[slot]).length, 5);
}
assert.ok(balanced[0]!.on.slice(0, 6).every(Boolean));
assert.equal(balanced[0]!.on[9], false);
assert.equal(balanced.reduce((sum, row) => sum + row.minutes, 0), 240);
const slow = paintShifts({
  players: shiftPlayers,
  coaching: { offense: "post", defense: "drop", tempo: "slow", playThrough: [null, null] },
});
assert.ok(slow.slice(1, 5).every((row) => row.on[2]));
assert.equal(slow[0]!.on[11], true);
assert.equal(slow[0]!.on[12], false);

console.log("gm pace: ok", "deadline deals", moved);

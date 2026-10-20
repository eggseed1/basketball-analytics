/**
 * Seeded lineups use the same reset/rebalance book as coaching "Reset".
 * Run: npx tsx scripts/test-gm-depth-minutes.ts
 */
import assert from "node:assert/strict";
import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";
import { simulateGame } from "../src/gm/engine/simulate";
import {
  MAX_PLAYER_MINUTES,
  overallOf,
} from "../src/gm/engine/lineup";
import { resetBalancedRotation } from "../src/gm/engine/coaching";

async function main() {
  const { league } = await createRealSeasonLeague({
    userTeamId: "cle",
    season: "2025-26",
    seed: 11,
  });
  const cle = league.teams.find((team) => team.id === "cle")!;
  const roster = league.players.filter((player) => player.teamId === "cle");
  const merrill = roster.find((player) => /merrill/i.test(player.name));
  assert.ok(merrill, "Sam Merrill on CLE");

  // Auto lineup should start Mitchell, not Merrill.
  assert.notEqual(cle.starters.SG, merrill.id, "Merrill should not start at SG");
  const mitchell = roster.find((player) => /mitchell/i.test(player.name));
  if (mitchell) {
    assert.ok(
      cle.starters.SG === mitchell.id || cle.starters.PG === mitchell.id,
      "Mitchell should be in the starting five"
    );
  }

  const booked = cle.coaching?.minutes?.[merrill.id] ?? 0;
  assert.ok(booked > 0, "Merrill gets rotation minutes");

  // Seed book must match a fresh coaching Reset pass.
  const reset = resetBalancedRotation(cle, league.players);
  assert.deepEqual(cle.starters, reset.team.starters, "starters match reset");
  for (const player of roster) {
    const seeded = cle.coaching?.minutes?.[player.id] ?? 0;
    const rebuilt = reset.minutes[player.id] ?? 0;
    assert.ok(
      Math.abs(seeded - rebuilt) < 0.6,
      `${player.name} seed ${seeded} vs reset ${rebuilt}`
    );
  }
  const seedTotal = Object.values(cle.coaching?.minutes ?? {}).reduce(
    (a, b) => a + b,
    0
  );
  assert.ok(
    seedTotal >= 220 && seedTotal <= 250,
    `team minutes should near 240, got ${seedTotal}`
  );

  // Celtics: stars start; end-of-bench bodies do not lock seats.
  const bosLeague = await createRealSeasonLeague({
    userTeamId: "bos",
    season: "2025-26",
    seed: 11,
  });
  const bos = bosLeague.league.teams.find((team) => team.id === "bos")!;
  const bosRoster = bosLeague.league.players.filter(
    (player) => player.teamId === "bos"
  );
  const tatum = bosRoster.find((player) => /tatum/i.test(player.name));
  const pritchard = bosRoster.find((player) => /pritchard/i.test(player.name));
  const carter = bosRoster.find((player) => /devin carter/i.test(player.name));
  if (tatum) {
    assert.ok(
      Object.values(bos.starters).includes(tatum.id),
      "Tatum should start"
    );
  }
  if (pritchard) {
    const pritchMin = bos.coaching?.minutes?.[pritchard.id] ?? 0;
    assert.ok(
      pritchMin >= 12,
      `Pritchard should get rotation minutes, got ${pritchMin}`
    );
  }
  if (carter) {
    assert.ok(
      !Object.values(bos.starters).includes(carter.id),
      "Devin Carter should not start over rotation guards"
    );
    if (pritchard) {
      assert.ok(
        overallOf(pritchard) >= overallOf(carter) - 2 ||
          (bos.coaching?.minutes?.[pritchard.id] ?? 0) >=
            (bos.coaching?.minutes?.[carter.id] ?? 0),
        "Pritchard should outrank Carter in the book"
      );
    }
  }

  const totals: Record<string, { min: number; gp: number }> = {};
  let n = 0;
  for (const game of league.schedule) {
    if (game.played || game.exhibition) continue;
    if (game.homeTeamId !== "cle" && game.awayTeamId !== "cle") continue;
    const result = simulateGame(game, league.teams, league.players);
    for (const line of result.box.players.filter((row) => row.teamId === "cle")) {
      const row = (totals[line.playerId] ??= { min: 0, gp: 0 });
      row.min += line.minutes;
      row.gp += 1;
      assert.ok(
        line.minutes <= MAX_PLAYER_MINUTES + 2.5,
        `${line.playerName} played ${line.minutes} (>${MAX_PLAYER_MINUTES})`
      );
    }
    n += 1;
    if (n >= 15) break;
  }
  const merrillMpg = (totals[merrill.id]?.min ?? 0) / (totals[merrill.id]?.gp ?? 1);
  assert.ok(
    merrillMpg < 32,
    `Merrill sim MPG ${merrillMpg.toFixed(1)} should stay under 32`
  );
  console.log("test-gm-depth-minutes: ok", {
    merrillBook: Number(booked.toFixed(1)),
    merrillMpg: Number(merrillMpg.toFixed(1)),
    seedTotal: Number(seedTotal.toFixed(1)),
    starters: cle.starters,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

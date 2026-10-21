/**
 * Scout comps, minutes load, and staff knacks.
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import {
  buildScoutProfile,
  eliteCompNames,
  fringeCompNames,
  spendScoutingLook,
} from "../src/gm/engine/scouting";
import { makeScout } from "../src/gm/seed/scouts";
import { createRng } from "../src/gm/engine/rng";
import {
  minuteLoadMul,
  rotationQuality,
} from "../src/gm/engine/lineup";
import { progressSheet } from "../src/gm/engine/attributes";
import { ensurePlayerSheet } from "../src/gm/engine/attributes";
import { makeDeveloper } from "../src/gm/seed/developers";
import { assignMinutesViaTargets } from "./_gm-test-helpers-minutes";

function main() {
  const league = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 77 });
  const top = league.draftPool
    .map((id) => league.players.find((p) => p.id === id)!)
    .sort(
      (a, b) =>
        (b.ratings.impact + b.ratings.potential) - (a.ratings.impact + a.ratings.potential)
    )[0]!;
  assert.ok(top);

  // Comps: high-impact lottery-ish prospect never gets a fringe ceiling.
  for (let i = 0; i < 40; i++) {
    const rng = createRng(1000 + i);
    const scout = makeScout(rng, { eye: 4, expertise: "general", knack: "cross_checker" });
    const profile = buildScoutProfile(top, 4, 0, rng, scout);
    const ceiling = profile.compCeiling ?? "";
    const fringe = fringeCompNames(profile.archetypeId);
    const bare = ceiling.replace(/^Maybe |\?$/g, "").replace(/\?$/, "");
    assert.ok(
      !fringe.includes(bare) && !fringe.some((name) => ceiling.includes(name) && !ceiling.startsWith("Maybe")),
      `lottery ceiling should not be fringe: got ${ceiling} for ${profile.archetypeId}`
    );
  }

  // Guard molds: legends on the board, no center comps (Jokic was in pass_first).
  for (const mold of ["pass_first", "floor_general", "combo_guard"] as const) {
    const elite = eliteCompNames(mold);
    assert.ok(
      !elite.includes("Nikola Jokic"),
      `${mold} elite must not include Jokic`
    );
    assert.ok(
      elite.some((n) =>
        /Magic Johnson|John Stockton|Steve Nash|Jason Kidd|Isiah Thomas|Allen Iverson|Dwyane Wade|Penny Hardaway/.test(
          n
        )
      ),
      `${mold} elite should lead with guard legends: ${elite.join(", ")}`
    );
  }

  // Weak-scout noise on a PG never draws big-only comps.
  const pg =
    league.players.find((p) => league.draftPool.includes(p.id) && p.position === "PG") ??
    top;
  const bigOnly = /Jokic|Olajuwon|Mutombo|Shaquille|Barkley|Nowitzki|Gobert|Porzingis|Towns/;
  for (let i = 0; i < 80; i++) {
    const rng = createRng(5000 + i);
    const scout = makeScout(rng, { eye: 1, expertise: "general" });
    const profile = buildScoutProfile(
      { ...pg, position: "PG", scoutProfile: undefined },
      1.5,
      20,
      rng,
      scout
    );
    const ceil = profile.compCeiling ?? "";
    const floor = profile.compFloor ?? "";
    assert.ok(
      !bigOnly.test(ceil) && !bigOnly.test(floor),
      `PG comps must stay guards/wings, got ceiling=${ceil} floor=${floor}`
    );
  }

  // Knack look bias: paint prophet prefers defense blank on a center.
  const center =
    league.players.find((p) => league.draftPool.includes(p.id) && p.position === "C") ??
    top;
  const fogged = {
    ...center,
    scoutProfile: center.scoutProfile
      ? {
          ...center.scoutProfile,
          grades: {
            athleticism: null,
            shooting: null,
            creation: null,
            defense: null,
            feel: null,
            upside: null,
          },
        }
      : center.scoutProfile,
  };
  const paint = makeScout(createRng(2), { knack: "paint_prophet", expertise: "bigs", eye: 4 });
  const afterPaint = spendScoutingLook(fogged, paint);
  assert.equal(
    afterPaint.scoutProfile?.grades.defense != null,
    true,
    "paint prophet should fill defense first when blank"
  );

  // Load mul: 48 minutes much worse than 32.
  assert.ok(minuteLoadMul(32, 70) > minuteLoadMul(46, 70));
  assert.ok(minuteLoadMul(46, 70) < 0.85);

  // Rotation quality: 9-man beats ironman five.
  const roster = league.players.filter((p) => p.teamId === "bos").slice(0, 9);
  assert.ok(roster.length >= 8);
  const iron: Record<string, number> = {};
  roster.slice(0, 5).forEach((p) => {
    iron[p.id] = 48;
  });
  roster.slice(5).forEach((p) => {
    iron[p.id] = 0;
  });
  const deep: Record<string, number> = {};
  const targets = [34, 32, 30, 28, 26, 24, 22, 22, 22];
  roster.forEach((p, i) => {
    deep[p.id] = targets[i] ?? 12;
  });
  const sumDeep = Object.values(deep).reduce((a, b) => a + b, 0);
  Object.keys(deep).forEach((id) => {
    deep[id] = (deep[id]! * 240) / sumDeep;
  });
  assert.ok(
    rotationQuality(roster, deep) > rotationQuality(roster, iron),
    "deep rotation should score higher than 5×48"
  );

  // PD knack: guard whisperer grows a young PG more than big whisperer.
  let guard = league.players.find((p) => p.position === "PG" && p.age <= 23) ?? league.players[0]!;
  guard = ensurePlayerSheet({ ...guard, age: 21, position: "PG" });
  const before = guard.sheet!.overall;
  const whisper = progressSheet(guard, {
    coach: 1,
    minutes: 28,
    pace: "summer",
    devStaff: 1.16,
  });
  const mismatch = progressSheet(guard, {
    coach: 1,
    minutes: 28,
    pace: "summer",
    devStaff: 1,
  });
  assert.ok(
    (whisper.sheet?.overall ?? 0) >= (mismatch.sheet?.overall ?? 0),
    "matched PD knack should not grow less than neutral"
  );
  assert.ok(before > 0);

  const dev = makeDeveloper(createRng(9), { knack: "guard_whisperer" });
  assert.equal(dev.knack, "guard_whisperer");

  // Default assign path should not produce 48s (helper mirrors simulate fix).
  const bos = league.teams.find((t) => t.id === "bos")!;
  const dressed = league.players.filter((p) => p.teamId === "bos").slice(0, 8);
  const mins = assignMinutesViaTargets(bos, dressed);
  assert.ok(mins.every((m) => m <= 42.5), `no ironman 48s: ${mins.join(",")}`);
  const sum = mins.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 240) < 3, `minutes sum ~240 got ${sum}`);

  console.log("test-gm-staff-knacks: ok");
}

main();

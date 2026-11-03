/**
 * Controlled skill-expression audit. Same prospects / RNG, different choices.
 * Gives a measurable management advantage without guaranteeing an all-star.
 */
import assert from "node:assert/strict";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { createRng } from "../src/gm/engine/rng";
import { ensurePlayerSheet, progressSheet } from "../src/gm/engine/attributes";
import { draftClassQuality, pickTradePoints, projectedSlot } from "../src/gm/engine/value";
import type { GmPlayer } from "../src/gm/types";

const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const rate = (values: boolean[]) => values.filter(Boolean).length / Math.max(1, values.length);
const differences: number[] = [];
const all: Array<{ pick: number; good: number; poor: number }> = [];
const qualities: number[] = [];
for (let seed = 1; seed <= 28; seed++) {
  const prospects = createDraftClass({
    count: 60, seasonEndYear: 2027, scoutLevel: 3,
    rng: createRng(seed * 3929 + 17), seal: p => p,
  });
  qualities.push(avg(prospects.slice(0, 12).map(p => p.consensus ?? 0)));
  for (const [index, player] of prospects.entries()) {
    const base = ensurePlayerSheet(player);
    const roleFocus = base.position === "PG" ? "creation"
      : base.position === "C" ? "defense" : base.position === "PF" ? "finishing"
      : base.position === "SF" ? "defense" : "shooting";
    let good: GmPlayer = { ...base, developmentPlan: "rotation", developmentFocus: roleFocus };
    let poor: GmPlayer = { ...base, developmentPlan: "practice", developmentFocus: "balanced" };
    while (good.age < 28) {
      for (let point = 0; point < 2; point++) {
        good = progressSheet(good, { pace: "season", minutes: 26, coach: 0.85, devStaff: 1.13, mentorBonus: 0.12 });
        poor = progressSheet(poor, { pace: "season", minutes: 7, coach: 0, devStaff: 0.91 });
      }
      good = progressSheet({ ...good, age: good.age + 1 }, { pace: "summer", minutes: 26, coach: 0.85, devStaff: 1.13, mentorBonus: 0.12 });
      poor = progressSheet({ ...poor, age: poor.age + 1 }, { pace: "summer", minutes: 7, coach: 0, devStaff: 0.91 });
    }
    const delta = good.sheet!.overall - poor.sheet!.overall;
    differences.push(delta);
    all.push({ pick: index + 1, good: good.sheet!.overall, poor: poor.sheet!.overall });
  }
}
const late = all.filter(p => p.pick > 30);
const overview = {
  players: all.length,
  wellManagedAvg: avg(all.map(p => p.good)),
  neglectedAvg: avg(all.map(p => p.poor)),
  averageAdvantage: avg(differences),
  betterThanNeglect: rate(differences.map(x => x > 0)),
  lateRotationGood: rate(late.map(p => p.good >= 74)),
  lateRotationPoor: rate(late.map(p => p.poor >= 74)),
  lateStarGood: rate(late.map(p => p.good >= 85)),
  lateStarPoor: rate(late.map(p => p.poor >= 85)),
  classStrengthRange: [Math.min(...qualities), Math.max(...qualities)],
};
console.log("Development management A/B:", JSON.stringify(overview));
assert.ok(overview.averageAdvantage >= 2.0, "a good development plan must offer a tangible OVR benefit");
assert.ok(overview.betterThanNeglect >= 0.70, "smart development should beat neglect on most players, not only a few hidden gems");
assert.ok(overview.lateRotationGood > overview.lateRotationPoor + 0.04, "late-pick rotation success must respond to management");
assert.ok(overview.classStrengthRange[1] - overview.classStrengthRange[0] >= 0.25, "classes need materially different top-end talent distributions");

const league = createGeneratedLeague({ seed: 1777, userTeamId: "bos", season: 2027 });
const classPool = createDraftClass({ count: 60, seasonEndYear: 2027, scoutLevel: 3, rng: createRng(668811), seal: p => p });
const withPublicBoard = (grade: number) => ({
  ...league,
  players: [...league.players, ...classPool.map((p, index) => ({
    ...p, consensus: index < 12 ? grade : p.consensus
  }))],
  draftPool: classPool.map(p => p.id),
});
const strong = withPublicBoard(1.1);
const thin = withPublicBoard(-0.2);
const strongQuality = draftClassQuality(strong, 2027);
const thinQuality = draftClassQuality(thin, 2027);
assert.ok(strongQuality.multiplier > thinQuality.multiplier + 0.14, "publicly observable strong classes must trade for more");
const first = league.teams.flatMap(team => team.draftPicks)
  .filter(p => p.round === 1 && p.season === 2027)
  .sort((a, b) => projectedSlot(league, a) - projectedSlot(league, b))[0];
assert.ok(first, "league must own a current-year first-round pick");
assert.ok(pickTradePoints(strong, first) > pickTradePoints(thin, first),
  "lottery pick prices must reflect the actual publicly scouted class");
const outside = league.teams.flatMap(team => team.draftPicks)
  .find(p => p.round === 1 && p.season > 2027);
if (outside) {
  assert.equal(draftClassQuality(strong, outside.season).multiplier, 1,
    "unknown future classes must not be priced using hidden future talent");
}
console.log("Draft class depth and public-consensus trade pricing passed.");

import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { applySeasonProgression } from "../src/gm/engine/season-development";
import { advanceDynamicProgression, annualTraitDecision, performanceSignal } from "../src/gm/engine/dynamic-progression";
import { maybeGrowInSeason } from "../src/gm/engine/progression";
import { playerDevTrait } from "../src/gm/engine/dev-traits";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

const full = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 133 }));
const originals = full.players.filter(p => p.teamId === "bos" && p.contract).slice(0, 12);
assert.ok(originals.length >= 9, "fixture needs a normal rotation");
const ages = [19, 20, 21, 22, 23, 24, 26, 29, 33, 35, 37, 39];
const tuned = originals.map((p,i) => ({
  ...p, age: ages[i]!,
  sheet: { ...p.sheet!, overall: 71, progressionCarry: 0, potential: { ...p.sheet!.potential, floor: 66, ceiling: 93, peakStart: 27, peakEnd: 31, trait: i < 2 ? "star" as const : "normal" as const, path: "average" as const } },
  developmentBaseline: { season: 2027, overall: 71 },
  traitHistory: [],
}));
const league: GmLeagueState = {
  ...full, players: tuned, draftPool: [], phase: "offseason",
  seasonFlow: { version: 1, season: 2027, stage: "progression", completed: [] }
};
const result = applySeasonProgression(league);
const rows = result.seasonFlow!.progression!;
assert.equal(rows.length, tuned.length);
assert.ok(rows.filter(x => x.after !== x.before).length >= Math.ceil(rows.length * 0.6), "most players should visibly progress or regress annually");
assert.ok(rows.some(x => x.after > x.before), "young rotation players should progress");
assert.ok(rows.some(x => x.after < x.before), "aging veterans should regress");
assert.ok(rows.every(x => Math.abs(x.after - x.before) <= 5), "season jumps are bounded");
assert.equal(applySeasonProgression(result), result, "re-entering the offseason step must not apply growth twice");
assert.deepEqual(parseFranchise(exportFranchise(result)).players.find(p => p.id === tuned[0]!.id)?.traitHistory,
  result.players.find(p => p.id === tuned[0]!.id)?.traitHistory, "trait reviews persist after export and import");

const young = tuned[0]!;
const rising = { ...young, seasonLine: { season: "2027", team: "BOS", gp: 72, min: 2450, pts: 1900, reb: 400, ast: 430, stl: 100, blk: 40, tov: 155, fgm: 720, fga: 1350, tpm: 190, tpa: 490, ftm: 270, fta: 330 } };
assert.ok(performanceSignal(rising, 2027) > 0, "breakout production should be positive");
assert.equal(performanceSignal({ ...rising, seasonLine: { ...rising.seasonLine, gp: 2 } }, 2027), 0, "tiny samples cannot trigger promotions");
const badgeLeague = { ...league, players: [rising], awards: { season: 2027,
  races: [{ id: "mip", title: "Most Improved", candidates: [{ id: rising.id, name: rising.name, teamId: "bos", detail: "breakout", score: 99 }] }]
} } as GmLeagueState;
const assessment = annualTraitDecision(badgeLeague, rising);
assert.ok(["star", "superstar", "normal"].includes(assessment.after));
assert.deepEqual(annualTraitDecision(badgeLeague, rising), assessment, "trait review must be deterministic");
const evolved = applySeasonProgression({ ...badgeLeague, seasonFlow: { version: 1, season: 2027, stage: "progression", completed: [] } });
const traitRow = evolved.players[0]!;
assert.equal(traitRow.traitHistory?.length, 1);
assert.equal(playerDevTrait(traitRow), traitRow.traitHistory?.[0]?.after, "earned reviewed trait is authoritative");
assert.equal(applySeasonProgression(evolved), evolved, "trait changes cannot reroll");

let progressing: GmLeagueState = { ...full, players: tuned, draftPool: [], phase: "regular",
  devMarks: { season: 2027, january: false, finale: false }, schedule: full.schedule.map(game => ({ ...game, played: false })) };
const relevant = progressing.schedule.flatMap((g,i) => g.homeTeamId === "bos" || g.awayTeamId === "bos" ? [i] : []);
assert.ok(relevant.length >= 60);
for(const num of [21, 43, 64, relevant.length]) {
  const indices = new Set(relevant.slice(0,num));
  progressing = { ...progressing, schedule: progressing.schedule.map((g,i) => indices.has(i) ? { ...g, played: true } : g) };
  progressing = maybeGrowInSeason(progressing);
  assert.equal(maybeGrowInSeason(progressing), progressing, "repeated UI or calendar ticks must never reroll the same checkpoint");
}
assert.equal(progressing.devMarks?.quarter1, true);
assert.equal(progressing.devMarks?.january, true);
assert.equal(progressing.devMarks?.quarter3, true);
const noSeason = advanceDynamicProgression({ ...young, teamId: null }, { league, checkpoint: "summer" });
assert.equal(noSeason.teamId, null, "unsigned players cannot acquire a club through progression");
assert.equal(noSeason.sheet?.overall, young.sheet?.overall, "unsigned players are excluded from team training");
console.log("GM dynamic progression: quarterly ticks, annual cohort changes, traits, awards, save and idempotence passed");

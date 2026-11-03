/** Paired management decisions and rare upside must have measurable outcomes.
 * Same rookies and IDs, different choices; no rerolls or hidden potential caps. */
import assert from "node:assert/strict";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { createRng } from "../src/gm/engine/rng";
import { developmentProfileOf } from "../src/gm/engine/development-profile";
import { progressSheet } from "../src/gm/engine/attributes";
import type { GmPlayer } from "../src/gm/types";

const mean = (v: number[]) => v.reduce((a,b) => a+b,0)/v.length;
const sample: GmPlayer[] = [];
const classStars: number[] = [];
for (let seed = 1; seed <= 150; seed++) {
  const players = createDraftClass({
    count:60, seasonEndYear:2027+seed, scoutLevel:3,
    rng:createRng(seed * 7919), seal:p=>p
  });
  classStars.push(players.filter(p => (p.sheet?.overall ?? 0) >= 75).length);
  sample.push(...players.slice(30,60).slice(0,3));
}
const outcomes: { good:number; poor:number; special:boolean }[]=[];
for (const original of sample) {
  const profile = developmentProfileOf(original);
  let good: GmPlayer = { ...original, developmentProfile: profile, developmentPlan:"rotation" as const, developmentFocus:"shooting" as const };
  let poor: GmPlayer = { ...original, developmentProfile: profile, developmentPlan:"practice" as const, developmentFocus:"balanced" as const };
  while(good.age<28){
    for (const mode of ["season","season","summer"] as const){
      const age = mode==="summer" ? good.age+1 : good.age;
      good=progressSheet({...good,age},{pace:mode,minutes:26,coach:0.65,devStaff:1.18,mentorBonus:0.12});
      poor=progressSheet({...poor,age},{pace:mode,minutes:8,coach:0,devStaff:0.92,mentorBonus:0});
    }
  }
  outcomes.push({good:good.sheet!.overall,poor:poor.sheet!.overall,special:(profile.learningSurge ?? 1)>1});
}
const managed=mean(outcomes.map(x=>x.good));
const neglected=mean(outcomes.map(x=>x.poor));
const advantage=managed-neglected;
assert.ok(advantage>=1.0,
  `Development skill must matter: ${advantage.toFixed(2)} OVR advantage over passive management`);
assert.ok(outcomes.filter(x=>x.good>x.poor).length>outcomes.length*0.5,
  "Good development should outperform passive management for most players, not just one jackpot");
const sorted=[...classStars].sort((a,b)=>a-b);
assert.ok(sorted[14]! < sorted[134]!,
  "Draft classes need genuinely different high-readiness talent densities");
const special=outcomes.filter(x=>x.special);
assert.ok(special.length>=1 && special.length<outcomes.length*0.04,
  "Exceptional learning DNA should be rare but occur in large draft populations");
console.log("Development skill test passed",JSON.stringify({
  prospects:outcomes.length,managed:+managed.toFixed(2),neglected:+neglected.toFixed(2),
  meanAdvantage:+advantage.toFixed(2),exceptionalLearners:special.length,
  draftReadyP10:sorted[14],draftReadyP90:sorted[134],
}));

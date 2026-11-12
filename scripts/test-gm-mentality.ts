import assert from "node:assert/strict";
import { playerMentality } from "../src/gm/engine/mentality";
import type { GmPlayer, GmDevelopmentProfile } from "../src/gm/types";

const player = (learning:number, adaptability:number, aptitude:number, surge=1) => ({
  id:"rookie-2031-18",name:"Test Prospect",draftModel:2,teamId:null,age:19,
  developmentProfile: {
    version:1,learning,adaptability,learningSurge:surge,discovery:0,
    aptitudes:{shooting:aptitude,creation:aptitude,defense:aptitude,rebounding:aptitude,finishing:aptitude},
  } as GmDevelopmentProfile,
} as GmPlayer);
const high=player(1.32,1.28,1.25,2.45);
const tiers=[
  playerMentality(player(.76,.74,.77)),
  playerMentality(player(.9,.86,.86)),
  playerMentality(player(1.01,.99,.99)),
  playerMentality(player(1.15,1.12,1.13)),
  playerMentality(high),
];
assert.deepEqual(tiers.map(x=>x.label),["Casual","Steady","Driven","Relentless","Mamba"]);
assert.deepEqual(tiers.map(x=>x.rank),[1,2,3,4,5]);
assert.match(tiers[4]!.tone,/emerald/);
assert.deepEqual(playerMentality(high),playerMentality(high),"deterministic mentality");
assert.deepEqual(playerMentality({...high,teamId:"bos",age:31}),playerMentality(high),"mentality persists across trade and age");
assert.equal(Object.keys(high.developmentProfile!.aptitudes).length,5);
console.log("GM mentality: learning profile tiers, ordering, team/age invariance passed");

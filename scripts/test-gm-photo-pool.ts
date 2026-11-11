import assert from "node:assert/strict";
import {
  assignGeneratedPhotoPool,
  GENERATED_PHOTO_POOL_IDS,
  generatedPhotoUrl,
  generatedPhotoJerseyMaskUrl,
} from "../src/gm/lib/generated-photo-pool";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

const fakePlayer=(i:number,real=false): GmPlayer => ({
  id:real?String(9000+i):"prospect-photo-"+String(i).padStart(4,"0"),
  name:"Player "+i,teamId:i%2?"bos":"lal",
  age:21+i%13, pipeline:"ncaa", personality:4,
  draftModel:real?undefined:2,
  ...(real?{nbaPlayerId:String(9000+i)}:{}),
  identity:real?undefined:{
    version:1,countryCode:"US",hometown:"Boston, MA",
    portraitSeed:123000+i,temperament:"Team-first",interest:"Film room regular",
  },
  ratings:{impact:0,offense:0,defense:0,shooting:50,finishing:50,playmaking:50,rebounding:50,durability:60,potential:0},
} as GmPlayer);
const partial=(players:GmPlayer[],reserved?:Record<string,string>)=>({
  players,draftPool:[],portraitPoolReservations:reserved,
} as unknown as GmLeagueState);
const base=partial(Array.from({length:65},(_,i)=>fakePlayer(i)).concat(fakePlayer(999,true)));
const allocated=assignGeneratedPhotoPool(base);
const ids=allocated.players.filter(p=>p.identity?.portraitPoolId).map(p=>p.identity!.portraitPoolId!);
assert.equal(GENERATED_PHOTO_POOL_IDS.length,50);
assert.equal(ids.length,50,"never assign more photographic identities than the pilot asset pool");
assert.equal(new Set(ids).size,ids.length,"no two active players may share an image");
assert.equal(allocated.portraitPoolReservations && Object.keys(allocated.portraitPoolReservations).length,50);
assert.equal(allocated.players.at(-1)?.identity,undefined,"real NBA player must never receive a generated face");
assert.equal(assignGeneratedPhotoPool(allocated),allocated,"migrated league should be idempotent");
for(const id of GENERATED_PHOTO_POOL_IDS){
 assert.equal(generatedPhotoUrl(id),"/gm/portraits/"+id+".webp");
 assert.equal(generatedPhotoJerseyMaskUrl(id),"/gm/portraits/"+id+"-jersey-mask.webp");
}
assert.equal(generatedPhotoUrl("../secret"),null,"photo paths must come only from immutable allowlist");
assert.equal(generatedPhotoUrl("v3-99"),null);

const originalMappings=Object.fromEntries(allocated.players.filter(p=>p.identity?.portraitPoolId).map(p=>[p.id,p.identity!.portraitPoolId!]));
const moved=assignGeneratedPhotoPool({
 ...allocated,
 players:allocated.players.map(p=>p.id==="prospect-photo-0015"?{...p,teamId:"nyk",age:36}:p),
});
assert.equal(moved.players.find(p=>p.id==="prospect-photo-0015")?.identity?.portraitPoolId,
 originalMappings["prospect-photo-0015"],"trades and age must never change photo identity");

const retired=allocated.players.filter(p=>!["prospect-photo-0001","prospect-photo-0002"].includes(p.id));
const late=assignGeneratedPhotoPool({
 ...allocated,players:retired.concat([fakePlayer(1000),fakePlayer(1001)]),
});
assert.equal(Object.keys(late.portraitPoolReservations??{}).length,50,"retirement keeps portrait slots permanently reserved within save");
assert.equal(late.players.find(p=>p.id==="prospect-photo-1000")?.identity?.portraitPoolId,undefined,"new fictional players fall back to illustration when photo slots are exhausted");
for(const [playerId,id] of Object.entries(originalMappings)){
 assert.equal(late.portraitPoolReservations?.[playerId],id,"retired players must keep historical mapping");
}
const loaded=assignGeneratedPhotoPool({...allocated,portraitPoolReservations:undefined});
const preserved=allocated.players.find(p=>p.identity?.portraitPoolId)!;
assert.equal(loaded.players.find(p=>p.id===preserved.id)?.identity?.portraitPoolId,preserved.identity?.portraitPoolId,
 "load migration must retain player-level photo ID when reservation ledger missing");

const dupes=assignGeneratedPhotoPool(partial([
 {...fakePlayer(1),identity:{...fakePlayer(1).identity!,portraitPoolId:"v3-01"}},
 {...fakePlayer(2),identity:{...fakePlayer(2).identity!,portraitPoolId:"v3-01"}},
]));
const active=dupes.players.map(p=>p.identity?.portraitPoolId).filter(Boolean);
assert.equal(new Set(active).size,active.length,"legacy slot collision must be repaired deterministically");
console.log("GM photo pool: unique assignments, migration, retirement, trades, pool exhaustion, asset allowlisting passed.");

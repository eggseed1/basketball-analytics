import assert from "node:assert/strict";
import {
  assignGeneratedPhotoPool,
  GENERATED_PHOTO_POOL_IDS,
  generatedPhotoUrl,
  generatedPhotoJerseyMaskUrl,
} from "../src/gm/lib/generated-photo-pool";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GmPhotoPoolPortrait } from "../src/gm/ui/gm-photo-pool-portrait";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise } from "../src/gm/engine/franchise";
import { GENERATED_PHOTO_CASTING, generatedPhotoCastingScore, type PhotoCastingStyle } from "../src/gm/lib/generated-photo-appearance";

const codeForCasting: Record<PhotoCastingStyle,string|null> = {
  black:"NG",east_asian:"JP",latino:"MX",european:"DE",
  south_asian:"IN",mena:"TR",mixed:null,
};
const fakePlayer=(i:number,real=false): GmPlayer => ({
  id:real?String(9000+i):"prospect-photo-"+String(i).padStart(4,"0"),
  name:"Player "+i,teamId:i>=GENERATED_PHOTO_POOL_IDS.length?null:i%2?"bos":"lal",
  age:21+i%13, pipeline:"ncaa", personality:4,
  draftModel:real?undefined:2,
  ...(real?{nbaPlayerId:String(9000+i)}:{}),
  identity:real?undefined:{
    version:1,countryCode:"US",hometown:"Boston, MA",
    ...(codeForCasting[GENERATED_PHOTO_CASTING[GENERATED_PHOTO_POOL_IDS[i%GENERATED_PHOTO_POOL_IDS.length]!]!] ? {
      familyOriginCode:codeForCasting[GENERATED_PHOTO_CASTING[GENERATED_PHOTO_POOL_IDS[i%GENERATED_PHOTO_POOL_IDS.length]!]!]!,
    }:{}),
    portraitSeed:123000+i,temperament:"Team-first",interest:"Film room regular",
  },
  ratings:{impact:0,offense:0,defense:0,shooting:50,finishing:50,playmaking:50,rebounding:50,durability:60,potential:0},
} as GmPlayer);
const partial=(players:GmPlayer[],reserved?:Record<string,string>)=>({
  players,draftPool:[],portraitPoolReservations:reserved,
} as unknown as GmLeagueState);
const poolCount=GENERATED_PHOTO_POOL_IDS.length;
assert.ok(poolCount>=50 && poolCount<=600,"pool size must remain within audited capacity");
const base=partial(Array.from({length:poolCount+15},(_,i)=>fakePlayer(i)).concat(fakePlayer(999,true)));
const allocated=assignGeneratedPhotoPool(base);
const ids=allocated.players.filter(p=>p.identity?.portraitPoolId).map(p=>p.identity!.portraitPoolId!);
assert.equal(poolCount,new Set(GENERATED_PHOTO_POOL_IDS).size,"catalog cannot contain duplicate IDs");
assert.equal(ids.length,poolCount,"never assign more photographic identities than the local asset catalog");
assert.equal(new Set(ids).size,ids.length,"no two active players may share an image");
assert.ok(allocated.players.filter(p => p.identity?.portraitPoolId).every(p =>
  generatedPhotoCastingScore(p,p.identity!.portraitPoolId!)>0),
  "every assigned photo must match the fictional player's saved name and background");
assert.equal(Object.keys(GENERATED_PHOTO_CASTING).length,poolCount,
  "all 500 original art-directed photos need explicit casting metadata");
assert.equal(allocated.portraitPoolReservations && Object.keys(allocated.portraitPoolReservations).length,poolCount);
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
assert.equal(Object.keys(late.portraitPoolReservations??{}).length,poolCount,"retirement keeps portrait slots permanently reserved within save");
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
// Old save migration changes only a mismatched photo. It never renames a
// fictional veteran, changes citizenship, or modifies gameplay attributes.
const oldName={...fakePlayer(200),id:"old-save-kim",name:"Kai Nguyen",
  identity:{...fakePlayer(200).identity!,familyOriginCode:undefined,countryCode:"US",portraitPoolId:"v3-01"}};
assert.equal(generatedPhotoCastingScore(oldName,"v3-01"),0,
  "a Vietnamese family-name cue must not pick an unrelated Black American casting prompt");
assert.ok(generatedPhotoCastingScore(oldName,"v3-02")>0,
  "the curated East Asian source prompt is compatible with this fictional biography");
const rematched=assignGeneratedPhotoPool(partial([oldName],{"old-save-kim":"v3-01"}));
const repaired=rematched.players[0]!;
assert.equal(repaired.name,oldName.name);
assert.equal(repaired.identity?.countryCode,"US");
assert.notEqual(repaired.identity?.portraitPoolId,"v3-01");
assert.ok(generatedPhotoCastingScore(repaired,repaired.identity!.portraitPoolId!)>0);
assert.equal(assignGeneratedPhotoPool(rematched),rematched,
  "one-time photographic recasting must be stable on the next save load");
const asianProspect={...fakePlayer(10),name:"Kim Seo-jun",identity:{...fakePlayer(10).identity!,familyOriginCode:"KR"}};
assert.equal(generatedPhotoCastingScore(asianProspect,"v3-01"),0);
assert.ok(generatedPhotoCastingScore(asianProspect,"v3-02")>0);
assert.ok(generatedPhotoCastingScore({...fakePlayer(30),name:"Liam Singh"},"v3-12")>0,
  "South Asian family names should prefer their intended casting group");
const prepared = prepareFranchise(createGeneratedLeague({userTeamId:"bos",season:2029,seed:20261111}));
const humanRoster=prepared.players.filter(p=>p.teamId==="bos" && p.identity);
assert.ok(prepared.players.every(p => !p.identity?.portraitPoolId || generatedPhotoCastingScore(p,p.identity.portraitPoolId)>0),
  "generated leagues must never assign an unrelated photo, including international prospects");
assert.ok(prepared.players.filter(p=>p.identity?.portraitPoolId).length>200,
  "coherent casting must still provide meaningful photographic coverage");
assert.ok(humanRoster.length>10);
assert.ok(humanRoster.every(p=>p.identity?.portraitPoolId),
  "all generated starters on the human user's team must get photos first");
const photograph=humanRoster[0]!;
const html=(p:GmPlayer)=>renderToStaticMarkup(createElement(GmPhotoPoolPortrait,{
  player:p,name:p.name,size:"xl",
}));
const uniformPlayer = { ...photograph, jersey: "23" };
const originalMarkup=html(uniformPlayer);
assert.match(originalMarkup,/data-generated-photo="true"/);
assert.match(originalMarkup,/data-generated-portrait="true"/);
assert.match(originalMarkup,/data-portrait-version="photo-v1"/);
assert.match(originalMarkup,/data-jersey-team="bos"/);
assert.match(originalMarkup,/data-photo-jersey-tint="true"/);
assert.match(originalMarkup,/data-photo-jersey-number="true"/);
assert.ok(!originalMarkup.includes(">BOS</span>"),"team abbreviations do not appear on photographic uniforms");
assert.ok(originalMarkup.includes(">23</span>"),"valid jersey numbers must appear on large portraits");
assert.match(originalMarkup,/mask-mode:alpha/,"transparent jersey WebP masks must use alpha");
assert.ok(originalMarkup.includes("opacity:0.88"),"the recolor must visibly cover the original navy shirt");
assert.ok(!originalMarkup.includes("mix-blend-mode:color"),"dark original shirts must not weaken the team color");
assert.ok(originalMarkup.includes(".webp"),"photo must use a static local WebP asset");
const tradedMarkup=html({...uniformPlayer,teamId:"lal",age:38});
assert.match(tradedMarkup,/data-jersey-team="lal"/);
assert.ok(!tradedMarkup.includes(">LAL</span>"),"team abbreviations stay hidden after trades");
assert.match(tradedMarkup,/background-color:#552583/i,"a traded Lakers player must wear purple rather than the saved Celtics green");
assert.match(html({...uniformPlayer,teamId:null}),/data-jersey-team="free-agent"/,"free agents must have a neutral jersey");
const xsMarkup=renderToStaticMarkup(createElement(GmPhotoPoolPortrait,{player:uniformPlayer,name:uniformPlayer.name,size:"xs"}));
assert.ok(!xsMarkup.includes('data-photo-jersey-number="true"'),"tiny mobile avatars should avoid illegible jersey text");
assert.ok(!html({...uniformPlayer,jersey:"<script>"}).includes('&lt;script&gt;'),"jersey lettering must reject invalid numbers");
assert.notEqual(tradedMarkup,originalMarkup,"current team should change uniform accent");
assert.ok(tradedMarkup.includes(generatedPhotoUrl(photograph.identity!.portraitPoolId)!),
  "photo URL must remain unchanged through trade");
const notAllocated=allocated.players.find(p=>p.identity && !p.identity.portraitPoolId)!;
assert.ok(notAllocated,"the limited local pool must leave some characters on the SVG fallback");
const fallback=renderToStaticMarkup(createElement(GmPhotoPoolPortrait,{player:notAllocated,name:notAllocated.name,size:"sm"}));
assert.match(fallback,/data-portrait-version="2"/,"unassigned players retain procedural fallback");
console.log("GM photo pool: unique assignments, team priority, migration, retirement, trades, jersey recolor and fallback passed.");


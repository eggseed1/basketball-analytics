import assert from "node:assert/strict";
import { createRng } from "../src/gm/engine/rng";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { generatedPlayerIdentity, withGeneratedPlayerIdentity, originLabel, portraitSeedForId } from "../src/gm/lib/generated-player-identity";
import { generatedPortraitRecipe } from "../src/gm/ui/gm-generated-portrait";
import { isFictionalGmPlayer } from "../src/gm/lib/player-portrait-ids";
import type { GmPlayer } from "../src/gm/types";

const fake=(id:string,pipeline:GmPlayer["pipeline"]="ncaa")=>({
  id, name:"Existing Name",teamId:"bos",personality:5,pipeline,
  age:21,ratings:{impact:0,offense:0,defense:0,shooting:55,finishing:55,playmaking:55,rebounding:55,durability:70,potential:5},
} as GmPlayer);
const a=generatedPlayerIdentity(fake("prospect-2032-8-fixed","international"));
const b=generatedPlayerIdentity(fake("prospect-2032-8-fixed","international"));
assert.deepEqual(a,b,"identity must be reproducible from saved ID and pipeline");
assert.ok(a.name.length>=5 && a.name.length<=80);
assert.notEqual(a.identity.countryCode,"US","international pathway must have non-US origin");
assert.ok(a.identity.hometown.length>0);
assert.ok(originLabel(a.identity.countryCode)!=="Unknown");
assert.deepEqual(generatedPortraitRecipe(a.identity.portraitSeed),generatedPortraitRecipe(portraitSeedForId("prospect-2032-8-fixed")));
const established={...fake("prospect-2032-8-fixed"),identity:a.identity,name:a.name};
assert.deepEqual(withGeneratedPlayerIdentity({...established,teamId:"lal",age:35}),{...established,teamId:"lal",age:35},
  "team changes and aging cannot regenerate face or biography");
assert.equal(isFictionalGmPlayer(fake("p_old-save")) ,true);
assert.equal(isFictionalGmPlayer({...fake("2544"),nbaPlayerId:"2544"}),false,
  "never show generated faces for verified NBA identities");
assert.equal(isFictionalGmPlayer({...fake("4065648"),nbaSeason:{season:"2026-27"} as GmPlayer["nbaSeason"]}),false);
const old={...fake("p_old-save"),contract:null};
const migrated=withGeneratedPlayerIdentity(old,{preserveName:true});
assert.equal(migrated.name,old.name,"existing save names must never be rewritten");
assert.equal(migrated.ratings,old.ratings,"identity migration must not affect skill ratings");
assert.deepEqual(withGeneratedPlayerIdentity(migrated,{preserveName:true}),migrated);
assert.deepEqual(generatedPortraitRecipe(migrated.identity!.portraitSeed),generatedPortraitRecipe(portraitSeedForId(old.id)));

const countries=new Map<string,number>();
const names=new Set<string>();
let college=0, international=0;
for(let seed=1;seed<=25;seed++){
  const cls=createDraftClass({count:60,seasonEndYear:2030+seed,scoutLevel:3,rng:createRng(seed*829),seal:p=>p});
  const classNames=new Set(cls.map(p=>p.name));
  assert.equal(classNames.size,60,"every prospect in a draft class needs a distinctive name");
  for(const p of cls){
    assert.ok(p.identity && p.identity.version===1);
    assert.equal(p.identity.portraitSeed,portraitSeedForId(p.id));
    assert.ok(p.identity.hometown.length>0);
    assert.notEqual(originLabel(p.identity.countryCode),"Unknown");
    assert.ok(typeof p.identity.temperament==="string" && p.identity.temperament.length>0);
    assert.equal(isFictionalGmPlayer(p),true);
    countries.set(p.identity.countryCode,(countries.get(p.identity.countryCode)??0)+1);
    names.add(p.name);
    if(p.pipeline==="international"){
      international++;
      assert.notEqual(p.identity.countryCode,"US");
      assert.ok(p.college && p.college.length>4 && p.college!=="EuroLeague",
        "international basketball background should reflect a coherent regional route");
    } else college++;
  }
}
assert.ok(international>125&&international<320,"international intake should remain a minority");
assert.ok((countries.get("US")??0)>950 && (countries.get("US")??0)<1350,
  "US remains the majority without excluding foreign-born college players");
assert.ok(countries.size>=15,"draft classes require meaningful geographic diversity");
assert.ok(names.size>450,"the existing 24-by-22 mixed-name limitation must be gone");
const sampleLeague=createGeneratedLeague({userTeamId:"bos",season:2029,seed:29});
const generated=sampleLeague.players.filter(p=>p.id.startsWith("p_"));
assert.equal(generated.length,490);
assert.ok(generated.every(p=>p.identity && p.identity.hometown.length>0));
assert.equal(new Set(sampleLeague.players.map(p=>p.name)).size,sampleLeague.players.length,
  "generated starters, free agents and draft prospects must not collide by name");
console.log("Generated player identity: 25 classes, portrait invariance, global names, old saves, and NBA image safety passed",{
  countries:countries.size,distinctNames:names.size,us:countries.get("US"),international,college,
});

import assert from "node:assert/strict";
import { createRng } from "../src/gm/engine/rng";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { sealProspect, applyCombine } from "../src/gm/engine/scouting";
import { athleticTools } from "../src/gm/engine/combine-evaluation";
import { badgeCap, badgeLevel } from "../src/gm/engine/badges";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { createGeneratedLeague } from "../src/gm/seed/create-league";

const classes = 26;
let count=0, jumping=0, fastest=0, extreme=0, perks=0, lateAthletes=0, both=0;
let maxVert=0, minSprint=9, steadyClasses=0;
for(let seed=1;seed<=classes;seed++){
  const cohort=createDraftClass({
    count:60,seasonEndYear:2027+seed,scoutLevel:3,
    rng:createRng(seed*7919),seal:sealProspect,
  });
  assert.equal(cohort.length,60);
  const check=createDraftClass({
    count:60,seasonEndYear:2027+seed,scoutLevel:3,
    rng:createRng(seed*7919),seal:sealProspect,
  });
  assert.deepEqual(cohort.map(p=>p.sheet?.attributes),
    check.map(p=>p.sheet?.attributes),"athletic profiles are reproducible");
  let hasOutlier=false;
  for (let i=0;i<cohort.length;i++) {
    const prospect=cohort[i]!;
    assert.equal(prospect.athleticProfileVersion,1);
    const before=JSON.stringify(prospect.sheet);
    const result=applyCombine(prospect);
    const combine=result.scoutProfile!.combine!;
    assert.equal(before,JSON.stringify(result.sheet),"combine measures without magically changing athleticism or OVR");
    assert.deepEqual(applyCombine(result).scoutProfile!.combine,combine,"locked measurements do not reroll");
    assert.ok(combine.verticalIn>=23&&combine.verticalIn<=48);
    assert.ok(combine.sprint>=2.86&&combine.sprint<=3.75);
    assert.ok(Math.round(combine.verticalIn*2)===combine.verticalIn*2,"NBA verticals use half-inch increments");
    assert.ok(result.sheet?.overall===prospect.sheet?.overall,"elite athletes do not gain free OVR");
    const tools=athleticTools(result);
    const badgeCount=Number(tools.leaping)+Number(tools.chaser)+Number(tools.burst);
    for (const [id,eligible] of [
      ["aerial_assault",tools.leaping],
      ["chase_down",tools.chaser],
      ["explosive_first_step",tools.burst],
    ] as const) {
      if(eligible) {
        assert.ok(badgeCap(result,id)>0,`a qualifying athlete must have a real ${id} badge lane`);
        assert.equal(badgeLevel(result,id),0,"athletic measurements unlock opportunity, not an earned game badge");
      }
    }
    count++;
    if(combine.verticalIn>=40){jumping++;hasOutlier=true;}
    if(combine.verticalIn>=44)extreme++;
    if(combine.sprint<=3.05){fastest++;hasOutlier=true;}
    if(combine.verticalIn>=40&&combine.sprint<=3.05)both++;
    if(badgeCount>0)perks++;
    if(i>=30&&badgeCount>0)lateAthletes++;
    maxVert=Math.max(maxVert,combine.verticalIn);
    minSprint=Math.min(minSprint,combine.sprint);
  }
  if(hasOutlier)steadyClasses++;
}
const rate=(n:number)=>Math.round(1000*n/count)/10;
const report={classes,count,jumping,fastest,extreme,both,perks,lateAthletes,maxVert,minSprint,steadyClasses,
  jumpPct:rate(jumping),fastPct:rate(fastest),badgePct:rate(perks)};
console.log("NBA combine distribution: "+JSON.stringify(report));
assert.ok(rate(jumping)>=5&&rate(jumping)<=12,
  "roughly 7% of players must have 40-inch+ running verticals");
assert.ok(rate(fastest)>=4&&rate(fastest)<=13,
  "genuinely fast sub-3.05 sprint prospects must exist, but remain unusual");
assert.ok(extreme>=5&&maxVert>=46,"once-in-a-generation vertical athletes must appear across cohorts");
assert.ok(minSprint<=2.92,"world-class sprint prospects cannot be blocked by the old 3.10-second floor");
assert.ok(perks>=Math.round(count*0.035),
  "athletic standout badges must be reachable by more than an accidental single prospect");
assert.ok(lateAthletes>=12,"late-round prospects can be extraordinary athletes without NBA-ready talent");
assert.ok(steadyClasses>=classes-2,"most real-size classes contain at least one athletic testing standout");

// Existing uncombined saves get a ONE-TIME physical-profile migration.
// Already completed combines are left unchanged, and league OVR remains fixed.
const league=prepareFranchise(createGeneratedLeague({userTeamId:"bos",season:2029,seed:877}));
const draft=new Set(league.draftPool);
const chosen=league.players.find(p=>draft.has(p.id)&&p.draftModel===2&&p.sheet)!;
assert.ok(chosen);
const old={...chosen,athleticProfileVersion:undefined,
  sheet:{...chosen.sheet!,attributes:{...chosen.sheet!.attributes,speed:72,vertical:69,agility:72}}};
const oldOvr=old.sheet.overall;
const legacy={...league,combineDone:false,
  players:league.players.map(p=>p.id===old.id?old:p)};
const restored=prepareFranchise(legacy);
const updated=restored.players.find(p=>p.id===old.id)!;
assert.equal(updated.athleticProfileVersion,1);
assert.equal(updated.sheet?.overall,oldOvr);
assert.notEqual(updated.sheet?.attributes.vertical,69,
  "imported uncombined prospects adopt corrected athletic profiles");
assert.equal(prepareFranchise(restored).players.find(p=>p.id===old.id)?.sheet?.attributes.vertical,
  updated.sheet?.attributes.vertical,"the migration cannot re-roll");
const saved=parseFranchise(exportFranchise(restored));
assert.deepEqual(saved.players.find(p=>p.id===old.id)?.sheet?.attributes,
  updated.sheet?.attributes,"save/load preserves athletic identity");
const measured=applyCombine(old);
const locked=prepareFranchise({...legacy,combineDone:true,
  players:legacy.players.map(p=>p.id===old.id?measured:p)});
assert.deepEqual(locked.players.find(p=>p.id===old.id)?.sheet?.attributes,
  old.sheet.attributes,"already measured draft pools retain their original physical identity");
console.log("GM combine: realistic 40+ verticals, elite sprints, badge candidates, late outliers and save migration passed");

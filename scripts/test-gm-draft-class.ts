/** Calibrated rookie cohorts and development through two check-ins plus summer. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { progressSheet, ensurePlayerSheet } from "../src/gm/engine/attributes";
import { createRng } from "../src/gm/engine/rng";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import type { GmPlayer } from "../src/gm/types";

const rows:Array<{rank:number;age:number;entry:number;peak:number}>=[];
const classes=100;
for(let seed=1;seed<=classes;seed++){
  const klass=createDraftClass({count:60,seasonEndYear:2027,scoutLevel:3,rng:createRng(seed*7919),seal:player=>player});
  for(const [index,player] of klass.entries()){
    let grown=ensurePlayerSheet(player);
    const entry=grown.sheet!.overall;
    while(grown.age<28){
      grown=progressSheet(grown,{pace:"season",minutes:22,coach:0.4});
      grown=progressSheet(grown,{pace:"season",minutes:22,coach:0.4});
      grown=progressSheet({...grown,age:grown.age+1},{minutes:22,coach:0.4});
    }
    rows.push({rank:index+1,age:player.age,entry,peak:grown.sheet!.overall});
    assert.ok(grown.sheet!.overall<=grown.sheet!.potential.ceiling,"development must retain finite headroom");
    assert.ok(Object.values(grown.sheet!.attributes).every(value=>value>=25&&value<=99));
    const heights={PG:[72,76],SG:[74,79],SF:[77,81],PF:[79,84],C:[81,87]}[player.position];
    assert.ok(player.heightIn>=heights[0]!&&player.heightIn<=heights[1]!,"a style nickname cannot change a prospect's position away from his generated body");
  }
}
const band=(from:number,to:number)=>rows.filter(row=>row.rank>=from&&row.rank<=to);
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const rate=(values:boolean[])=>values.filter(Boolean).length/values.length;
const groups=[[1,1],[1,5],[6,14],[15,30],[31,60]].map(([from,to])=>{const group=band(from!,to!);return {from,to,entry:mean(group.map(row=>row.entry)),peak:mean(group.map(row=>row.peak)),rotation:rate(group.map(row=>row.peak>=74)),star:rate(group.map(row=>row.peak>=85)),elite:rate(group.map(row=>row.peak>=90))};});
const top=band(1,1),first=band(1,5),second=band(31,60);
assert.ok(mean(top.map(row=>row.entry))>=73&&mean(top.map(row=>row.entry))<=79,"first picks should usually need development on this league's scale");
assert.ok(mean(rows.map(row=>row.entry))>=64&&mean(rows.map(row=>row.entry))<=70);
assert.ok(rate(rows.map(row=>row.entry>=80))*60<1.5,"exceptional NBA-ready entrants must stay rare");
assert.ok(Math.max(...rows.map(row=>row.entry))<=84);
assert.ok(mean(first.map(row=>row.peak-row.entry))>=6,"good prospects must have room for a meaningful career arc");
assert.ok(rate(top.map(row=>row.peak>=85))>=0.35&&rate(top.map(row=>row.peak>=85))<0.85,"top picks have an advantage, not a guaranteed star outcome");
assert.ok(rate(second.map(row=>row.peak>=74))>0.07&&rate(second.map(row=>row.peak>=74))<0.3,"second rounds need useful hits as well as misses");
assert.ok(rate(second.map(row=>row.peak>=85))>0&&rate(second.map(row=>row.peak>=85))<0.04);
assert.ok(rate(second.map(row=>row.peak>=90))<0.01,"MVP-level late hits cannot appear in every class");
assert.ok(mean(first.map(row=>row.age))<mean(second.map(row=>row.age)));
assert.ok(mean(first.map(row=>row.peak))>mean(second.map(row=>row.peak))+8);
// A rolling talent stock also exercises replacement, limited rotation jobs and
// decline. This isolates ratings balance; it is not a contract/season simulation.
let stock:GmPlayer[]=[];
const population:Array<{year:number;mean:number;rotation:number;stars:number;elite:number}>=[];
for(let year=2007;year<2047;year++){
  const entrants=createDraftClass({count:60,seasonEndYear:year,scoutLevel:3,rng:createRng(year*7919),seal:player=>player});
  stock=[...stock.filter(player=>player.age<37),...entrants].sort((a,b)=>b.sheet!.overall-a.sheet!.overall).slice(0,450);
  stock=stock.map((player,index)=>{
    const minutes=index<240?28:index<360?14:0;
    let grown={...player,developmentPlan:index>=360?"practice" as const:"balanced" as const};
    grown=progressSheet(grown,{pace:"season",minutes,coach:0.4}) as typeof grown;
    grown=progressSheet(grown,{pace:"season",minutes,coach:0.4}) as typeof grown;
    return progressSheet({...grown,age:grown.age+1},{minutes,coach:0.4});
  });
  if(year>=2037)population.push({year,mean:mean(stock.map(player=>player.sheet!.overall)),rotation:stock.filter(player=>player.sheet!.overall>=74).length,stars:stock.filter(player=>player.sheet!.overall>=85).length,elite:stock.filter(player=>player.sheet!.overall>=90).length});
}
assert.ok(population.every(year=>year.mean>=69&&year.mean<=80),"replacement and decline must prevent a steady rise in league ratings");
assert.ok(population.every(year=>year.stars>=5&&year.stars<=90),"the rolling talent stock needs stars without making them ordinary");
assert.ok(population.every(year=>year.elite<=25));
assert.ok(Math.abs(population.at(-1)!.mean-population[0]!.mean)<3,"the mature talent stock should remain stable across a decade");
const report={classes,prospects:rows.length,method:"22 MPG, ordinary coach, two in-season checks plus summer to age 28",groups,entryMean:mean(rows.map(row=>row.entry)),maxEntry:Math.max(...rows.map(row=>row.entry)),populationMethod:"40 annual classes, 450 retained players, 240 major rotation jobs, age-37 exits; no contracts or games",population};
mkdirSync("/tmp/franchise-draft-calibration",{recursive:true});
writeFileSync("/tmp/franchise-draft-calibration/cohorts.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
console.log("Draft calibration passed across 100 classes and 6,000 careers.");

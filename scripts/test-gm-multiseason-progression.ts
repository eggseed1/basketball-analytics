/**
 * Long-horizon balance test. Models ten repeated seasons of NBA-like usage and
 * availability for 450 rostered players, with annual incoming rookie classes.
 *
 * This tests actual Franchise Lab checkpoint / offseason development and trait
 * evolution, but uses seeded stat-line scenarios instead of simulating 12,300
 * individual games or free-agent decisions. Never present this as a full GM sim.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { ensurePlayerSheet } from "../src/gm/engine/attributes";
import { advanceDynamicProgression } from "../src/gm/engine/dynamic-progression";
import { applySeasonProgression } from "../src/gm/engine/season-development";
import { createRng, clamp } from "../src/gm/engine/rng";
import type { GmLeagueState, GmPlayer, GmAwardRace } from "../src/gm/types";

const START=2027, YEARS=10, SEEDS=[37, 133, 907], ROSTER=450, NEWCOMERS=45;
type Report = { season: number; seed: number; count: number; mean: number; high80: number; elite90: number; elite95: number; youngMean: number; seniorMean: number; movingPct: number; ups: number; downs: number; flat: number; maxUp: number; maxDown: number; traits: Record<string,number>; promotions: number; demotions: number; departed: number };
const rows:Report[]=[];
const hash=(id:string)=>Array.from(id).reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261)>>>0;
const mean=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const pct=(n:number, total:number)=>Math.round(n/Math.max(1,total)*1000)/10;
function stable(players:GmPlayer[],prefix:string):GmPlayer[] {
  return players.map((p,i)=>({ ...p, id:prefix+"-"+i, mentorship:undefined, traitHistory:[], developmentBaseline:undefined }));
}
function lineFor(p:GmPlayer,season:number) {
  const rng=createRng(hash(p.id+":"+season+":performance"));
  const ovr=p.developmentBaseline?.overall??p.sheet?.overall??72;
  const gp=Math.round(clamp(67+(rng()-0.5)*42+(p.age>32?-6:0),14,82));
  const mpg=clamp(13+(ovr-65)*0.74+(rng()-0.5)*12,6,37);
  const ppg=clamp(5+(ovr-65)*0.79+(rng()-0.5)*8,2,34);
  const apg=clamp(1+(ovr-65)*0.13+(rng()-0.5)*2.2,0.3,9);
  const rpg=clamp(2.2+(ovr-65)*0.16+(rng()-0.5)*3,0.8,13);
  const ts=clamp(.53+(ovr-73)*.003+(rng()-0.5)*.11,.43,.69);
  const pts=Math.round(ppg*gp), fta=Math.round(ppg*.27*gp),ftm=Math.round(fta*.79);
  const fga=Math.round((pts/(2*ts)-.44*fta)*1.01);
  const tpa=Math.round(fga*.38),tpm=Math.round(tpa*.355);
  return {season:String(season),team:(p.teamId??"FA").toUpperCase(),gp,
    min:Math.round(mpg*gp),pts,ast:Math.round(apg*gp),reb:Math.round(rpg*gp),
    stl:Math.round(gp*1.1),blk:Math.round(gp*.6),tov:Math.round(gp*2.1),
    fga,fgm:Math.round((pts-ftm-tpm*3)/2)+tpm,tpa,tpm,fta,ftm};
}
function annualAwards(players:GmPlayer[], season:number):GmLeagueState["awards"] {
  const qualify=players.filter(p=>p.teamId&&p.seasonLine&&p.seasonLine.gp>=45);
  const score=(p:GmPlayer)=> (p.seasonLine!.pts + p.seasonLine!.ast*.7 + p.seasonLine!.reb*.3)/p.seasonLine!.gp;
  const sorted=[...qualify].sort((a,b)=>score(b)-score(a));
  const improved=[...qualify].filter(p=>p.age<=28).sort((a,b)=>(score(b)-(b.developmentBaseline?.overall??70)*.22)-(score(a)-(a.developmentBaseline?.overall??70)*.22));
  const pick=(id:GmAwardRace["id"], list:GmPlayer[]):GmAwardRace=>({
    id,title:id,candidates:list.map(p=>({id:p.id,name:p.name,teamId:p.teamId!,detail:"Season production",score:score(p)}))
  });
  return {season,races:[
    pick("mvp",sorted.slice(0,5)),pick("mip",improved.slice(0,5)),
    pick("all-nba-1",sorted.slice(0,5)),pick("all-nba-2",sorted.slice(5,10)),pick("all-nba-3",sorted.slice(10,15))
  ]};
}

for(const seed of SEEDS) {
  const fresh=createGeneratedLeague({season:START,userTeamId:"bos",seed});
  let league=prepareFranchise({...fresh,players:stable(fresh.players,"initial-"+seed)});
  league={...league, players:league.players.filter(p=>p.teamId),draftPool:[],seasonFlow:undefined,phase:"regular"};
  assert.equal(league.players.length,ROSTER);
  for(let offset=0;offset<YEARS;offset++){
    const season=START+offset;
    league={...league,season,phase:"regular",
      players:league.players.map(p=>{
        const loaded=ensurePlayerSheet(p);
        return {...loaded,developmentBaseline:{season,overall:loaded.sheet!.overall},seasonLine:lineFor({...loaded,developmentBaseline:{season,overall:loaded.sheet!.overall}},season)};
      })};
    const before=new Map(league.players.map(p=>[p.id,p.sheet!.overall]));
    const beforeTraits=new Map(league.players.map(p=>[p.id,p.sheet!.potential.trait??"normal"]));
    for(const checkpoint of ["quarter1","january","quarter3","finale"] as const){
      league={...league,players:league.players.map(p=>advanceDynamicProgression(p,{league,checkpoint,coach:0.6,staff:1.02}))};
    }
    league={...league,awards:annualAwards(league.players,season),phase:"offseason",
      seasonFlow:{version:1,season,stage:"progression",completed:[]}};
    const advanced=applySeasonProgression(league);
    assert.equal(applySeasonProgression(advanced),advanced,"summer must be idempotent");
    league=advanced;
    if(offset===2) {
      const loaded=parseFranchise(exportFranchise(league));
      assert.deepEqual(loaded.players[0]?.traitHistory,league.players[0]?.traitHistory,"trait history survives import");
      assert.equal(loaded.players[0]?.sheet?.overall,league.players[0]?.sheet?.overall);
    }
    const deltas=league.players.map(p=>p.sheet!.overall-before.get(p.id)!);
    const youngDeltas=league.players.filter(p=>p.age<=24).map(p=>p.sheet!.overall-before.get(p.id)!);
    const seniorDeltas=league.players.filter(p=>p.age>=34).map(p=>p.sheet!.overall-before.get(p.id)!);
    const traits:Record<string,number>={};
    let promotions=0,demotions=0;
    const ordered=["bust","normal","star","superstar","xfactor"];
    for(const p of league.players){
      assert.ok(p.sheet!.overall>=25&&p.sheet!.overall<=99);
      const trait=p.sheet!.potential.trait??"normal";
      traits[trait]=(traits[trait]??0)+1;
      const from=ordered.indexOf(beforeTraits.get(p.id)!);
      const to=ordered.indexOf(trait);
      if(to>from) promotions++;
      if(to<from) demotions++;
      assert.ok(Math.abs(to-from)<=1, "single-year trait change at most one tier: " +
        JSON.stringify({ season, seed, id:p.id, beforeTrait:beforeTraits.get(p.id),
          afterTrait:trait, beforeOverall:before.get(p.id), afterOverall:p.sheet!.overall,
          model:p.draftModel, age:p.age, lastReview:p.traitHistory?.at(-1) }));
    }
    const ratings=league.players.map(p=>p.sheet!.overall);
    const report:Report={seed,season,count:ratings.length,mean:mean(ratings),
      high80:ratings.filter(x=>x>=85).length,elite90:ratings.filter(x=>x>=90).length,elite95:ratings.filter(x=>x>=95).length,
      youngMean:mean(youngDeltas),seniorMean:mean(seniorDeltas),movingPct:pct(deltas.filter(x=>x!==0).length,deltas.length),
      ups:deltas.filter(x=>x>0).length,downs:deltas.filter(x=>x<0).length,flat:deltas.filter(x=>x===0).length,
      maxUp:Math.max(...deltas),maxDown:Math.min(...deltas),traits,promotions,demotions,departed:0};
    rows.push(report);
    // Retire aging players first, but allow contract/role churn and randomness.
    // Cutting only the worst 45 OVR each summer gives the simulation a false
    // positive rating drift, even with perfectly balanced development.
    const churn=[...league.players].sort((a,b)=>{
      const risk=(p:GmPlayer)=>{
        const age=p.age>=40?100:p.age>=36?(p.age-35)*5:p.age>=33?(p.age-32)*1.8:0;
        const fringe=Math.max(0,68-p.sheet!.overall)*0.3;
        const turnover=(createRng(hash(p.id+":departure:"+season))()-.5)*14;
        return age+fringe+turnover;
      };
      return risk(a)-risk(b);
    });
    const survivors=churn.slice(0,ROSTER-NEWCOMERS);
    report.departed=churn.length-survivors.length;
    if(offset===YEARS-1)break;
    const rookies=createGeneratedLeague({season:season+1,userTeamId:"bos",seed:seed*13007+season});
    const pool=new Set(rookies.draftPool);
    const newcomers=stable(rookies.players.filter(p=>pool.has(p.id)).slice(0,NEWCOMERS), "rookie-"+seed+"-"+season);
    const clubs=league.teams.map(t=>t.id);
    league={...league,players:[
      ...survivors.map(p=>({...p,age:p.age+1,seasonLine:undefined,priorLine:p.seasonLine,developmentBaseline:undefined})),
      ...newcomers.map((p,i)=>ensurePlayerSheet({...p,teamId:clubs[(i+season)%clubs.length]!,identityRevealed:true,age:p.age,contract:null}))
    ],awards:undefined,seasonFlow:undefined,phase:"regular"};
  }
}
mkdirSync("/tmp/franchise-calibration",{recursive:true});
writeFileSync("/tmp/franchise-calibration/multiseason.json",JSON.stringify({method:"10-year league cohort, seeded ratings-conditioned box-score scenarios, 45 rookies per season; stochastic age-weighted departures; no full GM economy",rows},null,2));
const avg=(a:Report[],k:keyof Report)=>mean(a.map(x=>x[k] as number));
for(let yr=0;yr<YEARS;yr++){
  const batch=rows.filter(x=>x.season===START+yr);
  console.log(["YEAR",START+yr,"mean",avg(batch,"mean").toFixed(1),"85+",avg(batch,"high80").toFixed(1),
    "90+",avg(batch,"elite90").toFixed(1),"95+",avg(batch,"elite95").toFixed(1),
    "move%",avg(batch,"movingPct").toFixed(1),"U24",avg(batch,"youngMean").toFixed(2),
    "34+",avg(batch,"seniorMean").toFixed(2),"up",avg(batch,"ups").toFixed(1),
    "down",avg(batch,"downs").toFixed(1),"promotions",avg(batch,"promotions").toFixed(1),
    "demotions",avg(batch,"demotions").toFixed(1),"XFactor",mean(batch.map(x=>x.traits.xfactor??0)).toFixed(1)].join(" "));
}
assert.equal(rows.length,YEARS*SEEDS.length);
const first=rows.filter(x=>x.season===START);
const last=rows.filter(x=>x.season===START+YEARS-1);
const total=(key:"promotions"|"demotions")=>rows.reduce((n,x)=>n+x[key],0);
// Loose guardrails, not a forced target: the source season is a generated
// fictional DRBL cohort, not the exact 2K launch roster. Reject substantial
// long-run talent inflation, implausible aging and inert development traits.
assert.ok(Math.abs(avg(last,"mean")-avg(first,"mean"))<1.5,"league average OVR must not inflate over a decade");
assert.ok(avg(last,"high80")-avg(first,"high80")<20,"85+ talent tier should not swell significantly");
assert.ok(Math.abs(avg(last,"elite90")-avg(first,"elite90"))<12,"the 90+ elite tier should stay scarce and stable");
assert.ok(total("promotions")>=25&&total("demotions")>=20,"awards, performance and aging should evolve trait tiers");
for(const row of rows){
  assert.equal(row.count,ROSTER);
  assert.ok(row.elite90<=40&&row.elite95<=9,"elite OVR inflation");
  assert.ok(row.movingPct>=52,"most players should change OVR each season");
  assert.ok(row.youngMean>=0.5&&row.youngMean<=4,"young players should improve but not leap unrealistically");
  assert.ok(row.seniorMean<=-0.8&&row.seniorMean>=-4,"older veterans should regress at a measured pace");
  assert.ok((row.traits.xfactor??0)<=23,"top development trait cannot exceed ~5% even in a high-elite random cohort");
}
// Guard against sustained or increasing X-Factor inflation across independent
// generated leagues without failing because one seed has 21 rather than 20.
const xFactorMean = (batch: Report[]) => mean(batch.map(row=>row.traits.xfactor??0));
for(let season=START;season<START+YEARS;season++) {
  assert.ok(xFactorMean(rows.filter(row=>row.season===season))<=18,
    "top development trait should remain below 4% of the league on average");
}
assert.ok(xFactorMean(last)<=xFactorMean(first)+4,
  "top development trait cannot inflate materially over ten seasons");
console.log("10-year progression calibration complete: "+rows.length+" league-seasons, "+(rows.length*ROSTER)+" player-season observations. All long-horizon guardrails passed.");

/**
 * Fifty draft classes sharing one persistent 30-team, 450-player talent stock.
 *
 * This uses Franchise Lab's actual five development checkpoints, aging and
 * draft class generation, with seeded NBA-like playing time / stat scenarios.
 * It does NOT simulate possessions, free agency, playoff results, or contracts.
 * No player receives an assigned future overall or a guaranteed 98 peak.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { createRng, clamp } from "../src/gm/engine/rng";
import { ensurePlayerSheet } from "../src/gm/engine/attributes";
import { advanceDynamicProgression, reviewDevelopmentTrait } from "../src/gm/engine/dynamic-progression";
import { developmentProfileOf } from "../src/gm/engine/development-profile";
import type { GmLeagueState, GmPlayer, GmAwardRace } from "../src/gm/types";

const START=2027, YEARS=50, RETAINED=450, CLASS=60;
const seed=Number(process.env.GENERATIONAL_SEED ?? 3167);
const hash=(value:string)=>Array.from(value).reduce((n,c)=>Math.imul(n ^ c.charCodeAt(0),16777619)>>>0,2166136261)>>>0;
const mean=(values:number[])=>values.reduce((n,v)=>n+v,0)/Math.max(1,values.length);
function seededSeasonLine(p:GmPlayer,year:number) {
  const rng=createRng(hash(p.id+":"+year+":generational-stats"));
  const overall=p.developmentBaseline?.overall??p.sheet?.overall??70;
  const gp=Math.round(clamp(70+(rng()-0.5)*30-(p.age>=33?Math.min(14,(p.age-32)*2):0),25,82));
  const mpg=clamp(10+(overall-62)*0.83+(rng()-0.5)*9,6,37);
  const ppg=clamp(5+(overall-64)*0.80+(rng()-0.5)*6,2,35);
  const apg=clamp(1+(overall-64)*0.14+(rng()-0.5)*2,0.2,11);
  const rpg=clamp(2.2+(overall-64)*0.16+(rng()-0.5)*3,0.5,15);
  const ts=clamp(0.53+(overall-73)*0.003+(rng()-0.5)*0.08,0.45,0.68);
  const pts=Math.round(ppg*gp),fta=Math.round(pts*0.27),ftm=Math.round(fta*0.79);
  const fga=Math.max(1,Math.round(pts/(2*ts)-0.44*fta));
  const tpa=Math.round(fga*0.38),tpm=Math.round(tpa*0.365);
  return {season:String(year),team:(p.teamId??"FA").toUpperCase(),gp,
    min:Math.round(mpg*gp),pts,ast:Math.round(apg*gp),reb:Math.round(rpg*gp),
    stl:Math.round(gp*1.1),blk:Math.round(gp*0.65),tov:Math.round(gp*2.1),
    fga,fgm:Math.round((pts-ftm-tpm*3)/2)+tpm,tpa,tpm,fta,ftm};
}
const base=createGeneratedLeague({userTeamId:"bos",season:START,seed});
const teams=base.teams.map(t=>t.id);
let league:GmLeagueState={...base,players:base.players.filter(p=>p.teamId).map(ensurePlayerSheet),
  draftPool:[],phase:"regular",seasonFlow:undefined};
assert.equal(league.players.length,RETAINED);
const peak=new Map<string,{id:string;name:string;draft:number;pick:number;age:number;peak:number;surge:boolean}>();
const seasonal:Array<{season:number;mean:number;star85:number;elite90:number;generational95:number;historic98:number;top:number;surgeActive:number}>=[];
const race=(id:GmAwardRace["id"],list:GmPlayer[]):GmAwardRace=>({
  id,title:id,candidates:list.map(p=>({id:p.id,name:p.name,teamId:p.teamId!,detail:"Season impact",score:p.sheet?.overall??0}))
});
for(let offset=0;offset<YEARS;offset++){
  const season=START+offset;
  league={...league,season,phase:"regular",awards:undefined,players:league.players.map(p=>({
    ...p,developmentBaseline:{season,overall:p.sheet!.overall},
    seasonLine:seededSeasonLine(p,season),
  }))};
  for(const checkpoint of ["quarter1","january","quarter3","finale"] as const) {
    league={...league,players:league.players.map(p=>advanceDynamicProgression(p,{league,checkpoint,coach:0.55,staff:1.05}))};
  }
  const qualified=league.players.filter(p=>(p.seasonLine?.gp??0)>=40);
  const impact=(p:GmPlayer)=> {
    const line=p.seasonLine!, gp=Math.max(1,line.gp);
    return (line.pts+line.ast*0.65+line.reb*0.30)/gp+
      (p.sheet!.overall-80)*0.17;
  };
  const ordered=[...qualified].sort((a,b)=>impact(b)-impact(a));
  // No invented guaranteed MVP: the competition draws only on observed
  // performance across all 450 players, and only one player wins each season.
  const awards={season,races:[
    race("mvp",ordered.slice(0,5)),
    race("all-nba-1",ordered.slice(0,5)),
    race("all-nba-2",ordered.slice(5,10)),
    race("all-nba-3",ordered.slice(10,15)),
  ]};
  league={...league,awards,phase:"offseason"};
  league={...league,players:league.players.map(p=>{
    const grown=advanceDynamicProgression({...p,age:p.age+1},{league,checkpoint:"summer",coach:0.55,staff:1.05});
    return reviewDevelopmentTrait(league,grown);
  })};
  const ratings=league.players.map(p=>p.sheet!.overall);
  seasonal.push({season,mean:+mean(ratings).toFixed(2),
    star85:ratings.filter(x=>x>=85).length,elite90:ratings.filter(x=>x>=90).length,
    generational95:ratings.filter(x=>x>=95).length,historic98:ratings.filter(x=>x>=98).length,
    top:Math.max(...ratings),surgeActive:league.players.filter(p=>p.draftModel===2&&(developmentProfileOf(p).learningSurge??1)>1).length,
  });
  for(const p of league.players.filter(p=>p.draftModel===2)){
    const rating=p.sheet!.overall;
    const existing=peak.get(p.id);
    if(!existing||rating>existing.peak)peak.set(p.id,{
      id:p.id,name:p.name,draft:p.draftYear??season,pick:p.consensusRank??p.draftPick??0,
      age:p.age,peak:rating,surge:(developmentProfileOf(p).learningSurge??1)>1
    });
  }
  if(offset===YEARS-1)break;
  const risk=(p:GmPlayer)=> {
    const old=p.age>=39?150:p.age>=35?26+(p.age-35)*10:p.age>=32?(p.age-31)*4:0;
    const unreliability=(hash(p.id+":retire:"+season)%100)/12;
    const eliteRetention=Math.max(0,(p.sheet!.overall-85)*1.6);
    return old+unreliability-eliteRetention;
  };
  const retained=[...league.players].sort((a,b)=>risk(a)-risk(b)).slice(0,RETAINED-CLASS);
  const entrants=createDraftClass({count:CLASS,seasonEndYear:season+1,
    scoutLevel:3,rng:createRng(seed*7919+(season+1)*17),seal:p=>p})
    .map((p,index)=>ensurePlayerSheet({...p,teamId:teams[(index+season)%teams.length]!,
      contract:null,injury:null,identityRevealed:true,developmentFocus:"balanced"}));
  league={...league,players:[...retained,...entrants],phase:"regular",awards:undefined};
  assert.equal(league.players.length,RETAINED);
}
const careers=[...peak.values()];
const count=(threshold:number)=>careers.filter(p=>p.peak>=threshold).length;
const top=[...careers].sort((a,b)=>b.peak-a.peak||a.draft-b.draft).slice(0,15);
const mature=seasonal.slice(15);
const report={method:"50 years/one 30-team talent stock with four regular checkpoints and summer, seeded synthetic stats/awards; no real games or contracts",
  seed,years:YEARS,newProspects:careers.length,peak95:count(95),peak98:count(98),peak99:count(99),
  rareLearners:careers.filter(p=>p.surge).length,top,mature,first:seasonal.slice(0,15)};
mkdirSync("/tmp/franchise-generational",{recursive:true});
writeFileSync("/tmp/franchise-generational/careers.json",JSON.stringify(report,null,2));
console.log("GENERATIONAL_CAREER_CALIBRATION "+JSON.stringify({
  seed,years:YEARS,newProspects:careers.length,peak95:count(95),
  peak98:count(98),peak99:count(99),rareLearners:report.rareLearners,
  top:top.slice(0,8),matureYears:mature.length,
  matureMean:[Math.min(...mature.map(r=>r.mean)),Math.max(...mature.map(r=>r.mean))],
  matureStar85:[Math.min(...mature.map(r=>r.star85)),Math.max(...mature.map(r=>r.star85))],
  matureElite90:[Math.min(...mature.map(r=>r.elite90)),Math.max(...mature.map(r=>r.elite90))],
  mature95:[Math.min(...mature.map(r=>r.generational95)),Math.max(...mature.map(r=>r.generational95))],
  mature98:[Math.min(...mature.map(r=>r.historic98)),Math.max(...mature.map(r=>r.historic98))]
}));
// Historical outliers must be possible under default, unmodified player
// development, yet cannot become an annual occurrence.
assert.ok(count(95)>=7&&count(95)<=45,"50-year career stock must produce scarce 95+ peaks");
assert.ok(count(98)>=1&&count(98)<=15,"98+ peaks must exist without becoming routine");
assert.ok(count(99)>=1&&count(99)<=10,"99 OVR should be a possible historic outlier");
assert.ok(careers.some(p=>p.peak>=98&&!p.surge),
  "extraordinary peak growth cannot depend exclusively on hidden surge DNA");
assert.ok(mature.every(row=>row.mean>=67&&row.mean<=81),"long-run average OVR must not inflate");
assert.ok(mature.every(row=>row.elite90<=45),"90+ players must remain exceptional");
assert.ok(mature.every(row=>row.generational95<=12),"95+ talent must stay scarce");
assert.ok(mature.every(row=>row.historic98<=3),"98+ players cannot become routine");
assert.ok(careers.every(row=>row.peak<=99),"generated rookies remain capped at 99");
console.log("Fifty-year generated talent-stock guardrails passed");

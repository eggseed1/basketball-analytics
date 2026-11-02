/**
 * Repeated game simulation accuracy and event/box consistency.
 * Uses the bundled 2025-26 NBA player season as a fixed, offline benchmark.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { simulateGame } from "../src/gm/engine/simulate";
import { shotZone, buildCourtEvents } from "../src/lib/games/court-events";
import type { GmBoxScore } from "../src/gm/types";

const KEYS = ["points","fga","fgm","tpa","tpm","fta","ftm","ast","reb","stl","blk","tov","oreb","pf"] as const;
type Key = typeof KEYS[number];
type Totals=Record<Key,number>;
const zero=():Totals=>Object.fromEntries(KEYS.map(k=>[k,0])) as Totals;
const add=(to:Totals,from:Totals)=>{for(const k of KEYS)to[k]+=from[k];};
const pct=(a:number,b:number)=>a/Math.max(1,b);

async function main(){
  const data=(await getBundledBrefPeerBoard("2025-26")).filter(p=>p.gamesPlayed>=5&&p.minutes>=40&&p.fieldGoalsAttempted>0);
  assert.ok(data.length>350);
  const league=buildLeagueFromPlayerSeasons(data,{userTeamId:"bos",seasonCanonical:"2025-26",seed:71});
  const games=league.schedule.slice(0,240);
  assert.equal(games.length,240);
  const sample=zero();
  const shots:Record<string,number>={};
  let within=0, three=0, threesCorner=0, two=0, rim=0, paint=0, mid=0, fouls=0;
  let hasOvertime=0;
  const shooting=new Map<string,{minutes:number,fga:number,pts:number,ast:number}>();
  for(let i=0;i<games.length;i++){
    const {box}=simulateGame(games[i]!,league.teams,league.players,71000+i,undefined,league.settings);
    assert.ok(box.events?.length,"complete games must have live play-by-play");
    if(i<3)assert.deepEqual(simulateGame(games[i]!,league.teams,league.players,71000+i,undefined,league.settings).box,box,"deterministic game result");
    hasOvertime+=Number(Boolean(box.overtime));
    const tally=zero();
    for(const p of box.players){
      tally.points+=p.points;tally.fga+=p.fga;tally.fgm+=p.fgm;tally.tpa+=p.tpa;tally.tpm+=p.tpm;
      tally.fta+=p.fta;tally.ftm+=p.ftm;tally.ast+=p.assists;tally.reb+=p.rebounds;
      tally.stl+=p.steals;tally.blk+=p.blocks;tally.tov+=p.turnovers;
      const before=shooting.get(p.playerId)??{minutes:0,fga:0,pts:0,ast:0};
      before.minutes+=p.minutes;before.fga+=p.fga;before.pts+=p.points;before.ast+=p.assists;shooting.set(p.playerId,before);
    }
    const events=box.events!;
    const counted=(side:string)=>box.players.filter(p=>p.teamId===side).reduce((s,p)=>s+p.points,0);
    assert.equal(counted(box.homeTeamId),box.homeScore);
    assert.equal(counted(box.awayTeamId),box.awayScore);
    assert.equal(events.reduce((n,e)=>n+e.points,0),box.homeScore+box.awayScore,"PBP points must equal official box");
    assert.equal(events.filter(e=>e.isFieldGoal).length,tally.fga);
    assert.equal(events.filter(e=>e.actionType==="3pt").length,tally.tpa);
    assert.equal(events.filter(e=>e.actionType==="freethrow").length,tally.fta);
    assert.equal(events.filter(e=>e.shotResult==="Made"&&e.isFieldGoal).length,tally.fgm);
    assert.equal(events.filter(e=>e.actionType==="turnover").length,tally.tov);
    assert.equal(events.filter(e=>e.actionType==="rebound"&&e.playerId).length,tally.reb);
    assert.equal(events.filter(e=>e.description.includes(" assists)")).length,tally.ast);
    assert.equal(events.filter(e=>e.description.includes(" blocks)")).length,tally.blk);
    const court=buildCourtEvents(events,box.homeTeamId.toUpperCase(),box.awayTeamId.toUpperCase());
    assert.equal(court.fga,tally.fga);
    for(const e of events) {
      if(e.actionType==="foul"){fouls++;tally.pf++;}
      if(e.actionType==="rebound"&&e.subType==="offensive"){tally.oreb++;}
      if(!e.isFieldGoal)continue;
      assert.ok(e.locX!==null&&e.locY!==null,"every simulated shot must be located");
      const x=e.locX!,y=e.locY!;
      assert.ok(x>=-24.8&&x<=24.8&&y>=0&&y<=31, "NBA court dimensions");
      shots[e.subType]=(shots[e.subType]??0)+1;
      const z=shotZone({kind:e.shotResult==="Made"?"make":"miss",three:e.actionType==="3pt",x,y} as Parameters<typeof shotZone>[0]);
      if(e.actionType==="3pt"){three++;if(z==="corner3")threesCorner++;assert.ok(Math.hypot(x,y)>=21.5);}
      else{two++;if(z==="rim")rim++;else if(z==="paint")paint++;else if(z==="mid")mid++;}
      within++;
    }
    add(sample,tally);
  }
  assert.ok(Object.keys(shots).length>=8,"NBA plays must feature multiple finishing and jumper types");
  assert.equal(three+two,within);
  const real=zero();
  for(const p of data){
    real.points+=p.points;real.fga+=p.fieldGoalsAttempted;real.fgm+=p.fieldGoalsMade;
    real.tpa+=p.threePointersAttempted;real.tpm+=p.threePointersMade;
    real.fta+=p.freeThrowsAttempted;real.ftm+=p.freeThrowsMade;
    real.ast+=p.assists;real.reb+=p.rebounds;real.stl+=p.steals;real.blk+=p.blocks;real.tov+=p.turnovers;
  }
  const simPerTeam=Object.fromEntries(KEYS.map(k=>[k,sample[k]/(games.length*2)])) as Record<Key,number>;
  const target={
    // 2025-26 regular season full-league per-team-game box, NBA/Basketball-Reference.
    points:115.6,fga:89.1,fgm:42.0,tpa:37.0,tpm:13.3,fta:23.5,ftm:18.4,
    ast:26.7,reb:43.8,stl:8.4,blk:4.8,tov:14.5,oreb:11.4,pf:19.9,
    fgPct:.471,threePct:.360,ftPct:.783,threeShare:37/89.1,
  };
  const observed={...simPerTeam,fgPct:pct(sample.fgm,sample.fga),
    threePct:pct(sample.tpm,sample.tpa),ftPct:pct(sample.ftm,sample.fta),
    threeShare:pct(sample.tpa,sample.fga)};
  const spread={two,three,rim,paint,mid,threesCorner,cornerShare:pct(threesCorner,three),
    rimShare:pct(rim,two),paintShare:pct(paint,two),midShare:pct(mid,two),
    shotTypes:shots,fouls:fouls/(games.length*2),overtimes:hasOvertime};
  const errors=Object.fromEntries(Object.keys(target).map(k=>[k,observed[k as keyof typeof observed]-(target[k as keyof typeof target])]));
  mkdirSync("/tmp/franchise-calibration",{recursive:true});
  writeFileSync("/tmp/franchise-calibration/possession-fidelity.json",
    JSON.stringify({games:games.length,source:"2025-26 BRef full season; bundled 2025-26 roster",observed,target,errors,spread},null,2));
  console.log("GM game balance "+JSON.stringify({games:games.length,observed,target,spread}));
  assert.ok(spread.cornerShare>=.10&&spread.cornerShare<=.34,"three-point corners should be a minority of threes");
  assert.ok(spread.rimShare>=.3&&spread.rimShare<=.76,"rim frequency should match NBA-style shot mix");
  assert.ok(spread.midShare>=.08&&spread.midShare<=.35,"mid-range shots should exist but not dominate");
  for(const [metric,limit] of Object.entries({points:11,fga:9,tpa:5,fta:5,ast:4,reb:5,stl:2,blk:1.5,tov:3,fgPct:.023,threePct:.021,ftPct:.026,threeShare:.045})) {
    const diff=Math.abs(errors[metric] ?? 0);
    assert.ok(diff<=limit,metric+" deviated "+diff.toFixed(3)+" beyond "+limit);
  }
  const active=data.filter(p=>p.minutes>1200).map(p=>{
    const q=shooting.get(String(p.playerId));
    if(!q||q.minutes<90)return null;
    return {id:String(p.playerId),name:p.playerName,realFga36:p.fieldGoalsAttempted/p.minutes*36,simFga36:q.fga/q.minutes*36};
  }).filter((x):x is NonNullable<typeof x>=>Boolean(x));
  console.log("GM player rate diagnostic "+JSON.stringify({count:active.length, meanAbsFga36:active.length?active.reduce((n,x)=>n+Math.abs(x.realFga36-x.simFga36),0)/active.length:null}));
  console.log("GM possession/PBP and broad box benchmark passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});

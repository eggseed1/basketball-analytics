/**
 * Out-of-sample NBA season + generated-league fidelity and slider sensitivity.
 * This suite deliberately uses 2024-25, not the 2025-26 calibration target.
 */
import assert from "node:assert/strict";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise } from "../src/gm/engine/franchise";
import { simulateGame } from "../src/gm/engine/simulate";
import { ensureSimProfile, simulationRates } from "../src/gm/engine/player-profile";
import type { GmLeagueSettings, GmLeagueState, GmScheduleGame } from "../src/gm/types";

type Metric = "points" | "fga" | "fgm" | "tpa" | "tpm" | "fta" | "ftm" | "reb" | "orb" | "ast" | "stl" | "blk" | "tov" | "pf" | "possessions";
const columns: Metric[] = ["points","fga","fgm","tpa","tpm","fta","ftm","reb","orb","ast","stl","blk","tov","pf","possessions"];
type Summary=Record<Metric,number>&{fgPct:number;threePct:number;ftPct:number;threeShare:number;homeWinRate:number};
function sample(league:GmLeagueState, games:readonly GmScheduleGame[], seed:number, settings=league.settings):Summary {
  const stats=Object.fromEntries(columns.map(c=>[c,0])) as Record<Metric,number>;
  let home=0;
  games.forEach((game,i)=>{
    const result=simulateGame(game,league.teams,league.players,seed+i,undefined,settings).box;
    if(result.homeScore>result.awayScore)home++;
    stats.possessions+= (result.possessions??0)*2;
    for(const p of result.players){
      stats.points+=p.points;stats.fga+=p.fga;stats.fgm+=p.fgm;stats.tpa+=p.tpa;stats.tpm+=p.tpm;
      stats.fta+=p.fta;stats.ftm+=p.ftm;stats.reb+=p.rebounds;stats.orb+=p.offensiveRebounds??0;
      stats.ast+=p.assists;stats.stl+=p.steals;stats.blk+=p.blocks;stats.tov+=p.turnovers;stats.pf+=p.personalFouls??0;
    }
  });
  const count=games.length*2;
  const avg=Object.fromEntries(columns.map(c=>[c,stats[c]/count])) as Record<Metric,number>;
  return {...avg,fgPct:stats.fgm/Math.max(1,stats.fga),
    threePct:stats.tpm/Math.max(1,stats.tpa),ftPct:stats.ftm/Math.max(1,stats.fta),
    threeShare:stats.tpa/Math.max(1,stats.fga),homeWinRate:home/games.length};
}
function within(name:string,n:number,target:number,tolerance:number){
  assert.ok(Math.abs(n-target)<tolerance, name+" "+n.toFixed(3)+" outside "+target+" +/- "+tolerance);
}
async function main(){
  const rows=(await getBundledBrefPeerBoard("2024-25")).filter(p=>p.gamesPlayed>=5&&p.minutes>=40&&p.fieldGoalsAttempted>0);
  assert.ok(rows.length>350,"holdout must load actual bundled 2024-25 NBA players");
  const league=buildLeagueFromPlayerSeasons(rows,{userTeamId:"bos",seasonCanonical:"2024-25",seed:49});
  const games=league.schedule.slice(0,110);
  assert.equal(games.length,110);
  const holdout=sample(league,games,82000);
  const expected={points:113.8,fga:89.2,tpa:37.6,fta:21.7,reb:44.1,orb:11.1,ast:26.5,
    stl:8.2,blk:4.9,tov:14.3,pf:18.6,fgPct:.467,threePct:.36,ftPct:.78,threeShare:37.6/89.2};
  for(const [metric,limit] of Object.entries({points:10,fga:9,tpa:7,fta:6,reb:7,orb:3.5,ast:4,
    stl:2.8,blk:2,tov:4,pf:5,fgPct:.035,threePct:.035,ftPct:.04,threeShare:.06})){
    within("2024-25 "+metric,holdout[metric as keyof typeof holdout] as number,expected[metric as keyof typeof expected],limit);
  }
  console.log("2024-25 independent NBA holdout "+JSON.stringify({observed:holdout,expected}));

  const generated=prepareFranchise(createGeneratedLeague({userTeamId:"bos",season:2032,seed:830}));
  const specimen=generated.players.find(p=>p.teamId && p.simProfile?.source==="estimated")!;
  const current=ensureSimProfile(specimen);
  const oldProfile={...current.simProfile!,version:1 as const,
    rates:{...current.simProfile!.rates,
      twoPct:current.simProfile!.rates.twoPct-.075,
      threePct:current.simProfile!.rates.threePct-.06,
      ftPct:current.simProfile!.rates.ftPct-.05}};
  const oldSave={...current,simProfile:oldProfile};
  const migrated=ensureSimProfile(oldSave);
  assert.equal(migrated.simProfile?.version,2);
  assert.deepEqual(migrated.simProfile?.baseline,oldProfile.baseline);
  assert.deepEqual(simulationRates(migrated),simulationRates(current),"legacy profile retains progression after migration");
  assert.equal(ensureSimProfile(migrated),migrated,"upgrade is idempotent");
  const nbaSpecimen=league.players.find(p=>p.simProfile?.source==="nba")!;
  const nbaOld={...nbaSpecimen,simProfile:{...nbaSpecimen.simProfile!,version:1 as const}};
  assert.deepEqual(ensureSimProfile(nbaOld).simProfile?.rates,nbaOld.simProfile?.rates,"real NBA evidence survives migration");
  const future=sample(generated,generated.schedule.slice(0,55),94000);
  assert.ok(future.points>75&&future.points<155,"generated future league scoring must stay credible");
  assert.ok(future.fga>70&&future.fga<110,"generated future league shooting volume must stay credible");
  assert.ok(future.threeShare>.20&&future.threeShare<.62);
  assert.ok(future.reb>33&&future.reb<61);
  for(const [metric,target,limit] of [
    ["points",115.6,10],["fga",89.1,8],["tpa",37,6],["fta",23.5,5],
    ["ast",26.7,3],["stl",8.4,2],["blk",4.8,1.5],["tov",14.5,3],
    ["threePct",.36,.03],["ftPct",.783,.04],["threeShare",.415,.06],
  ] as const){within("Generated league "+metric,future[metric],target,limit);}
  console.log("Generated future-league audit "+JSON.stringify(future));

  // Force the endpoints over identical game seeds. Each slider must have a
  // measurable gameplay effect; regressions should not silently turn controls
  // into decorative settings in saved franchises.
  const keys=[
    ["simPace","possessions",2.0,.8,1.2],
    ["simShotAccuracy","fgPct",.01,.75,1.25],
    ["simThreeRate","threeShare",.045,.75,1.25],
    ["simFoulRate","fta",1.5,.75,1.25],
    ["simTurnoverRate","tov",1.2,.75,1.25],
    ["simReboundRate","orb",.7,.75,1.25],
    ["simAssistRate","ast",1.2,.75,1.25],
  ] as const;
  const fixture=games.slice(0,24);
  for(const [setting,metric,minEffect,low,high] of keys){
    const under=sample(league,fixture,105000,{...league.settings,[setting]:low} as GmLeagueSettings);
    const over=sample(league,fixture,105000,{...league.settings,[setting]:high} as GmLeagueSettings);
    const change=over[metric]-under[metric];
    console.log(setting+" sensitivity: "+metric+" low="+under[metric].toFixed(3)+" high="+over[metric].toFixed(3));
    assert.ok(change>minEffect,setting+" slider failed to affect "+metric+" sufficiently ("+change.toFixed(3)+")");
  }
  console.log("NBA holdout, generated future league and seven game slider tests passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import vm from "node:vm";
import {createGeneratedLeague} from "../src/gm/seed/create-league";
import {prepareFranchise,exportFranchise,parseFranchise} from "../src/gm/engine/franchise";
import {rotationForTeam,shiftSnapshot,validShiftPlan,autoBalanceRotation,rebalanceForInjuryChanges} from "../src/gm/engine/coaching";
import {simulateGame} from "../src/gm/engine/simulate";
import {POSITIONS} from "../src/gm/engine/lineup";
import {listedPositionCorrections,splitPositionListing} from "../src/gm/engine/position-listings";
import type {GmLeagueState,GmPlayer,GmTeam} from "../src/gm/types";

const league=prepareFranchise(createGeneratedLeague({userTeamId:"bos",season:2028,seed:23}));
const team=league.teams.find(t=>t.id==="bos")!;
const roster=league.players.filter(p=>p.teamId===team.id);
for(const position of POSITIONS)assert.ok(roster.filter(p=>p.position===position).length>=2,"generated rosters have genuine positional depth");
const game={...league.schedule.find(g=>[g.homeTeamId,g.awayTeamId].includes(team.id))!,span:1};
const original=rotationForTeam(team,league.players);
assert.equal(Object.values(original.minutes).reduce((a,b)=>a+b,0),240);
assert.deepEqual(new Set(Object.values(original.frames[0])),new Set(Object.values(team.starters)));
assert.deepEqual(new Set(Object.values(original.frames[23])),new Set(Object.values(team.starters)));
for(const frame of original.frames)assert.equal(new Set(Object.values(frame)).size,5);
for(const pos of POSITIONS)assert.equal(Object.values(original.positionMinutes).reduce((n,row)=>n+(row[pos]??0),0),48);
assert.deepEqual(shiftSnapshot(team,league.players).map(row=>row.on),original.rows.filter(row=>row.minutes>0).map(row=>row.on));

let isolated=0,stints=0;
for(const row of original.rows)for(let s=0;s<24;s++)if(row.on[s]&&(s===0||!row.on[s-1])){
  stints++;let end=s+1;while(end<24&&row.on[end])end++;
  if(end-s===1&&s%6!==0&&end%6!==0)isolated++;
}
assert.ok(isolated<stints/3,`continuous stints replace checkerboard substitutions (${isolated}/${stints})`);
const result=simulateGame(game,league.teams,league.players,712);
const side=game.homeTeamId===team.id?"home":"away";
for(let slot=0;slot<24;slot++)assert.deepEqual(new Set(result.box.stints![slot]![side]),new Set(Object.values(original.frames[slot]!)),"actual possessions use the previewed five");
for(const row of result.box.players.filter(p=>p.teamId===team.id)){
  const regulation=original.minutes[row.playerId]??0;
  assert.ok(row.minutes>=regulation);
  assert.equal(Object.values(row.positionMinutes??{}).reduce((a,b)=>a+b,0),row.minutes);
  if(!result.box.overtime)assert.equal(row.minutes,regulation);
  assert.equal(row.started,original.openingIds.has(row.playerId));
}

for(const depth of [6,7,8,9,10,11,12,13] as const){
  const book=autoBalanceRotation({...team,coaching:{...team.coaching!,rotationDepth:depth}},league.players);
  const compiled=rotationForTeam({...team,coaching:{...team.coaching!,rotationDepth:depth,minutes:book.minutes}},league.players);
  assert.equal(Object.values(compiled.minutes).reduce((a,b)=>a+b,0),240);
  assert.ok(compiled.rows.filter(row=>row.minutes>0).length<=depth);
  assert.ok(compiled.frames.every(frame=>new Set(Object.values(frame)).size===5));
}
const playoff=rotationForTeam(team,league.players,true);
assert.equal(playoff.tightened,true);
assert.ok(playoff.rows.filter(row=>row.minutes>0).length<=8);
const manualTeam:GmTeam={...team,coaching:{...team.coaching!,rotationMode:"manual"}};
assert.deepEqual(rotationForTeam(manualTeam,league.players,true).rows,rotationForTeam(manualTeam,league.players).rows,"explicit plans keep their playoff depth");
const backup=roster.find(p=>(original.minutes[p.id]??0)===0)!;
const recovered=league.players.map(p=>p.id===roster.find(p=>(original.minutes[p.id]??0)>0)!.id?{...p,injury:{type:"Recovered",gamesRemaining:0,reinjuryRisk:0}} as GmPlayer:p);
const recoveredPlan=rotationForTeam(team,recovered);
assert.deepEqual(recoveredPlan.rows,original.rows,"cleared injury objects do not silently replace players");
const hurtId=Object.values(team.starters)[0]!;
const hurt=league.players.map(p=>p.id===hurtId?{...p,injury:{type:"Out",gamesRemaining:3,reinjuryRisk:0}} as GmPlayer:p);
const repaired=rotationForTeam(team,hurt);
assert.equal(repaired.rows.find(row=>row.id===hurtId),undefined);
assert.ok(repaired.frames.every(frame=>new Set(Object.values(frame)).size===5));
assert.ok(repaired.warnings.length>0);
const hurtManual=rebalanceForInjuryChanges({...league,teams:league.teams.map(t=>t.id===team.id?manualTeam:t),players:hurt},league.players);
assert.deepEqual(hurtManual.teams.find(t=>t.id===team.id)!.coaching,manualTeam.coaching,"injuries repair tonight without overwriting manual minute targets");
const healedManual=rebalanceForInjuryChanges({...hurtManual,players:league.players},hurt);
assert.deepEqual(healedManual.teams.find(t=>t.id===team.id)!.coaching,manualTeam.coaching,"recovery does not restore a stale rotation over manual edits");
assert.ok(!result.box.players.some(p=>p.playerId===backup.id),"zero-minute reserves do not enter arbitrary fallback units");

const manualRows=original.rows.map(row=>({...row,on:[...row.on]}));
const shifts=Object.fromEntries(manualRows.map(row=>[row.id,row.on]));
const custom={...manualTeam,coaching:{...manualTeam.coaching!,shifts}};
assert.ok(validShiftPlan(shifts,roster.map(p=>p.id)));
assert.deepEqual(rotationForTeam(custom,league.players).rows,manualRows,"valid saved shift blocks are preserved");
const saved=parseFranchise(exportFranchise({...league,teams:league.teams.map(t=>t.id===team.id?custom:t)}));
assert.deepEqual(rotationForTeam(saved.teams.find(t=>t.id===team.id)!,saved.players).rows,manualRows);
const closing=original.rows.filter(row=>row.minutes>0).slice(-5).map(row=>row.id);
const closer={...manualTeam,coaching:{...manualTeam.coaching!,closingLineup:closing}};
const closingPlan=rotationForTeam(closer,league.players);
assert.deepEqual(new Set(Object.values(closingPlan.frames[23])),new Set(closing));
for(let i=0;i<5;i++)assert.equal(closingPlan.frames[23]![POSITIONS[i]!],closing[i],"closing positions honor the selected slots");
let overtime=false;
for(let seed=1;seed<=120&&!overtime;seed++){
  const simulated=simulateGame({...game,span:0.05},league.teams.map(t=>t.id===team.id?closer:t),league.players,seed);
  if(!simulated.box.overtime)continue;overtime=true;
  for(const stint of simulated.box.stints!.filter(s=>s.start>=144))assert.deepEqual(new Set(stint[side]),new Set(Object.values(closingPlan.closingFrame)),"overtime uses the same healthy closing unit and position book");
  for(const row of simulated.box.players)assert.equal(Object.values(row.positionMinutes??{}).reduce((a,b)=>a+b,0),row.minutes);
}
assert.ok(overtime,"overtime integration exercised");
assert.deepEqual(splitPositionListing("SG-SF"),["SG","SF"]);
assert.deepEqual(splitPositionListing("Point Guard / Shooting Guard"),["PG","SG"]);
assert.deepEqual(splitPositionListing("G-F"),[]);
const legacy={...roster[0]!,id:"3975",nbaPlayerId:"201939",position:"SF" as const,listedPosition:undefined,heightIn:75,weightLbs:185,ratings:{...roster[0]!.ratings,playmaking:85,shooting:96}};
assert.equal(listedPositionCorrections([legacy])[0]?.to,"PG","legacy inferred listing can use Curry's bundled NBA bio");
assert.equal(listedPositionCorrections([{...legacy,listedPosition:"SF"}]).length,0,"manual listings are preserved");

// Actual store action: moving a starter swaps seats, clears stale shifts,
// and promotes a zero-minute reserve into the vacated minute budget.
const source=readFileSync("src/gm/state/gm-store.ts","utf8");
const start=source.indexOf("      setStarter: (position, playerId) => {");
const action=source.slice(start,source.indexOf("\n      setPlayerPosition:",start));
const js=stripTypeScriptTypes(`const actions={${action}};actions;`,{mode:"transform"});
const state:{league:GmLeagueState}={league:{...league,teams:league.teams.map(t=>t.id===team.id?custom:t)}};
const actions=vm.runInNewContext(js,{POSITIONS,get:()=>state,set:(partial:{league:GmLeagueState})=>{state.league=partial.league;},withUpdate:(l:GmLeagueState)=>l,buildBalancedMinutes:autoBalanceRotation,coachingOf:(t:GmTeam)=>t.coaching});
actions.setStarter("PG",team.starters.SG);
let updated=state.league.teams.find(t=>t.id===team.id)!;
assert.equal(new Set(Object.values(updated.starters)).size,5);
assert.ok(updated.benchOrder.every(id=>!Object.values(updated.starters).includes(id)),"starter swaps keep the bench order distinct");
assert.equal(updated.coaching!.shifts,undefined);
actions.setStarter("SF",backup.id);
updated=state.league.teams.find(t=>t.id===team.id)!;
assert.ok(updated.coaching!.minutes![backup.id]!>0);
assert.ok(rotationForTeam(updated,state.league.players).openingIds.has(backup.id));
assert.deepEqual(league.players.map(p=>p.sheet),prepareFranchise(JSON.parse(JSON.stringify(league))).players.map((p:GmPlayer)=>p.sheet),"saved ratings and potential do not change during rotation migration");
console.log("Realistic rotations passed: 240 minutes, five unique players, coherent stints, preview/game parity, positional accounting, playoff depth, closing/OT, injuries, saved plans, NBA listings and starter edits.");

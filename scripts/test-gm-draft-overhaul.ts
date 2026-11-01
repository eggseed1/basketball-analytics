import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, parseFranchise, exportFranchise } from "../src/gm/engine/franchise";
import { aiSelectProspect, draftNightOffers, ensureDraftOrder, expandDraftOrder } from "../src/gm/engine/draft-room";
import { amateurSeason, draftRead, draftScoutingOf, scoutingBudget, studyProspect, marketBoard, toggleDraftWatch } from "../src/gm/engine/draft-intel";
import { draftAssetCatalog, executeDraftTrade, quoteDraftTrade, suggestDraftTrade } from "../src/gm/engine/draft-trades";
import { resolveDraftOrder, rookieContractForPick } from "../src/gm/engine/draft-order";
import { advanceDraftPastAi, finishDraftWithAi, runDraftPick } from "../src/gm/engine/progression";
import { progressSheet } from "../src/gm/engine/attributes";
import type { GmLeagueState } from "../src/gm/types";

const fresh=()=>prepareFranchise(createGeneratedLeague({userTeamId:"bos",season:2027,seed:71}));
function prepared():GmLeagueState{const league=fresh();return {...league,phase:"offseason",seasonFlow:{version:1,season:2027,stage:"scouting",completed:[]}};}
function night():GmLeagueState{const league=fresh();const others=league.teams.filter(team=>team.id!=="bos").map(team=>team.id);const lotteryOrder=[...others.slice(0,19),"bos",...others.slice(19)];return {...league,phase:"draft",lotteryOrder,draftOrder:expandDraftOrder(lotteryOrder),draftPickIndex:12};}

// Scouting creates information, not talent; assignments and budgets cannot be rerolled.
{
  let league=prepared();const id=league.draftPool[3]!,before=league.players.find(player=>player.id===id)!;
  const market=marketBoard(league).map(player=>player.id);
  league=studyProspect(league,id,"film","shooting").state;
  const spent=draftScoutingOf(league).spent;
  const duplicate=studyProspect(league,id,"film","defense");
  assert.equal(duplicate.ok,false);assert.equal(duplicate.state,league);
  assert.equal(draftScoutingOf(league).spent,spent);
  assert.deepEqual(league.players.find(player=>player.id===id)!.sheet,before.sheet);
  assert.deepEqual(marketBoard(league).map(player=>player.id),market);
  const restored=parseFranchise(exportFranchise(league));
  assert.equal(JSON.stringify(draftScoutingOf(restored)),JSON.stringify(draftScoutingOf(league)));
  assert.equal(studyProspect({...restored,phase:"draft"},id,"analytics").ok,false);
  for(const candidate of league.draftPool) league=studyProspect(league,candidate,"analytics").state;
  assert.equal(draftScoutingOf(league).spent,scoutingBudget(league));
  const locked=studyProspect(league,league.draftPool[0]!,"medical");assert.equal(locked.ok,false);
  let visits=prepared();for(const candidate of visits.draftPool.slice(0,4))visits=studyProspect(visits,candidate,"workout","creation").state;
  assert.equal(studyProspect(visits,visits.draftPool[4]!,"workout").ok,false);
}

// The CPU and recommendation layer cannot read the hidden career roll.
{
  const league=night(),target=league.players.find(player=>player.id===league.draftPool[0])!;
  const hidden={...league,players:league.players.map(player=>({...player,ratings:{...player.ratings,potential:10-player.ratings.potential},sheet:player.sheet?{...player.sheet,potential:{...player.sheet.potential,ceiling:99,trait:"xfactor" as const,path:"boom" as const}}:player.sheet}))};
  assert.deepEqual(draftRead(league,target),draftRead(hidden,hidden.players.find(player=>player.id===target.id)!));
  assert.equal(aiSelectProspect(league,"det"),aiSelectProspect(hidden,"det"));
  const pinned=league.draftPool.at(-1)!;
  assert.equal(aiSelectProspect({...league,userDraftBoard:[pinned]},league.userTeamId),pinned,"delegation follows the user's saved board");
  const stats=amateurSeason(target);assert.deepEqual(amateurSeason(target),stats);
  const shooter=[...league.draftPool].sort((a,b)=>draftRead(league,league.players.find(player=>player.id===b)!,"shooting").score-draftRead(league,league.players.find(player=>player.id===a)!,"shooting").score);
  const creator=[...league.draftPool].sort((a,b)=>draftRead(league,league.players.find(player=>player.id===b)!,"creation").score-draftRead(league,league.players.find(player=>player.id===a)!,"creation").score);
  assert.notDeepEqual(shooter.slice(0,5),creator.slice(0,5),"different roster jobs need meaningfully different boards");
  const watched=toggleDraftWatch(league,league.draftPool[0]!);
  assert.equal(advanceDraftPastAi(watched).draftPickIndex,watched.draftPickIndex,"bulk advance pauses before a watchlist decision");
}

// Any remaining selection can be targeted. Replays, duplicates, frozen assets and illegal future firsts fail atomically.
{
  const league=night(),targetSlot=15,partner=league.draftOrder![targetSlot]!;
  const start=performance.now(),proposal=suggestDraftTrade(league,"bos",partner,targetSlot,league.draftPool[0]);
  assert.ok(proposal,"a realistic modest move up should have a path");
  assert.ok(performance.now()-start<3000,"package search should be bounded");
  const quote=quoteDraftTrade(league,proposal);assert.equal(quote.accepted,true);
  const moved=executeDraftTrade(league,proposal);assert.equal(moved.ok,true);
  assert.equal(moved.state.draftOrder![targetSlot],"bos");assert.equal(moved.state.draftPickIndex,league.draftPickIndex);
  assert.equal(executeDraftTrade(moved.state,proposal).ok,false,"an accepted offer cannot be replayed");
  assert.equal(executeDraftTrade({...league,draftPickIndex:13},proposal).ok,false);
  assert.equal(quoteDraftTrade(league,{...proposal,send:[proposal.send[0]!,proposal.send[0]!]}).legal,false);
  assert.equal(quoteDraftTrade(league,{...proposal,receive:[{kind:"slot",slot:3}]}).legal,false);
  const own=league.teams.find(team=>team.id==="bos")!;
  const future=own.draftPicks.find(pick=>pick.season>league.season&&pick.round===1)!;
  const frozen={...league,teams:league.teams.map(team=>team.id==="bos"?{...team,draftPicks:team.draftPicks.map(pick=>pick.id===future.id?{...pick,frozen:true}:pick)}:team)};
  assert.equal(quoteDraftTrade(frozen,{...proposal,send:[{kind:"future",id:future.id}]}).legal,false);
  const consecutive=own.draftPicks.filter(pick=>pick.round===1&&[2028,2029].includes(pick.season));
  assert.equal(consecutive.length,2);
  assert.equal(quoteDraftTrade(league,{...proposal,send:consecutive.map(pick=>({kind:"future" as const,id:pick.id}))}).legal,false);
  const far={...future,id:"too-far",season:2035};
  const farState={...league,teams:league.teams.map(team=>team.id==="bos"?{...team,draftPicks:[...team.draftPicks,far]}:team)};
  assert.equal(quoteDraftTrade(farState,{...proposal,send:[{kind:"future",id:far.id}]}).legal,false);
  const expensive=league.players.find(player=>player.teamId==="bos"&&player.contract)!;
  const illegalSalary={...league,settings:{...league.settings,salaryCapM:1,firstApronM:2,secondApronM:3},players:league.players.map(player=>player.id===expensive.id?{...player,contract:{...player.contract!,annualSalaryM:50}}:player)};
  assert.equal(quoteDraftTrade(illegalSalary,{...proposal,send:[{kind:"player",id:expensive.id}]}).legal,false);
}

// Book ownership drives the actual clock, and a selection consumes exactly one asset.
{
  let league=night();const origin=league.lotteryOrder![0]!;
  const pick=league.teams.flatMap(team=>team.draftPicks).find(pick=>pick.season===2027&&pick.round===1&&pick.originalTeamId===origin)!;
  league={...league,teams:league.teams.map(team=>({...team,draftPicks:[...team.draftPicks.filter(row=>row.id!==pick.id),...(team.id==="bos"?[{...pick,ownerTeamId:"bos"}]:[])]}))};
  const order=resolveDraftOrder(league);assert.equal(order.draftOrder![0],"bos");
  league={...league,...order,draftPickIndex:0};
  const before=league.teams.find(team=>team.id==="bos")!.draftPicks.length;
  const selected=runDraftPick(league,"bos",league.draftPool[0]!);
  assert.equal(selected.teams.find(team=>team.id==="bos")!.draftPicks.length,before-1);
  assert.equal(runDraftPick(selected,"bos",league.draftPool[0]!),selected);
  assert.equal(runDraftPick(league,"det",league.draftPool[0]!),league);
  const beyond={...league,draftPickIndex:60};
  assert.equal(runDraftPick(beyond,"bos",beyond.draftPool[0]!),beyond,"the board cannot accept a selection after its last slot");
  const protectedPick={...pick,protectionTopN:4};
  const protectedState={...league,teams:league.teams.map(team=>({...team,draftPicks:team.draftPicks.map(row=>row.id===pick.id?protectedPick:row)}))};
  const retained={...protectedState,...resolveDraftOrder(protectedState),draftPickIndex:0};
  assert.equal(retained.draftOrder![0],origin);
  const usedProtected=runDraftPick(retained,origin,retained.draftPool[0]!);
  assert.ok(!usedProtected.teams.flatMap(team=>team.draftPicks).some(row=>row.id===pick.id),"a retained protection consumes the former holder's record too");
  assert.equal(rookieContractForPick(league,1).yearsRemaining,4);
  assert.equal(rookieContractForPick(league,31).yearsRemaining,2);
  assert.ok(rookieContractForPick(league,1).annualSalaryM>rookieContractForPick(league,30).annualSalaryM*3);
}

// Practice provides a path; playing forty minutes does not create extra XP.
{
  const league=fresh(),raw=league.players.find(player=>player.id===league.draftPool[0])!;
  const child={...raw,age:19,personality:20,sheet:{...raw.sheet!,potential:{...raw.sheet!.potential,ceiling:94,path:"average" as const,trait:"normal" as const}}};
  const grow=(plan:"practice"|"rotation",minutes:number)=>{let player={...child,developmentPlan:plan};for(let year=0;year<5;year++)player=progressSheet({...player,age:player.age+1},{minutes,coach:0.5}) as typeof player;return player.sheet!.overall;};
  assert.ok(grow("practice",0)>child.sheet.overall);
  assert.ok(grow("rotation",24)>=grow("rotation",0));
  assert.ok(grow("rotation",40)<=grow("rotation",26));
}
const state=night(),start=performance.now(),completed=finishDraftWithAi({...state,draftPickIndex:0});
assert.equal(completed.draftPickIndex,60);assert.equal(new Set(completed.players.filter(player=>player.draftYear===2027&&player.draftPick).map(player=>player.draftPick)).size,60);
assert.ok(performance.now()-start<15000,"a complete draft must remain responsive");
assert.ok(draftNightOffers(state).every(offer=>offer.proposal.clockIndex===state.draftPickIndex));
assert.ok(ensureDraftOrder({...state,draftOrder:undefined}).draftOrder?.length===60);
assert.ok(draftAssetCatalog(state,"bos").some(row=>row.asset.kind==="slot"));
console.log("Draft overhaul passed: finite scouting, independent boards, trade legality and replay guards, pick books, rookie contracts, development plans and a full live draft.");

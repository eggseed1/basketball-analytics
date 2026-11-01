import type { GmDraftPick, GmLeagueState, GmPlayer, GmTeam } from "@/gm/types";
import { autoSetLineup } from "@/gm/engine/lineup";
import { playerSheet } from "@/gm/engine/attributes";
import { teamPayrollM, tradeSalaryLegal } from "@/gm/engine/cap";
import { offseasonRosterLimit } from "@/gm/engine/season-flow-state";
import { draftSlotTradePoints, pickTradePoints, playerTradePoints } from "@/gm/engine/value";
import { draftHash, marketBoard } from "@/gm/engine/draft-intel";
import { clamp, createRng } from "@/gm/engine/rng";

export type DraftAsset = { kind: "slot"; slot: number } | { kind: "future"; id: string } | { kind: "player"; id: string };
export type DraftTradeProposal = { fromTeamId: string; toTeamId: string; clockIndex: number; send: DraftAsset[]; receive: DraftAsset[]; targetPlayerId?: string };
export type DraftAssetRow = { asset: DraftAsset; key: string; label: string; points: number; available: boolean; reason?: string };
export type DraftTradeVerdict = { legal: boolean; accepted: boolean; reason: string; give: number; get: number; asking: number; rationale: string[] };
export function draftAssetKey(asset: DraftAsset): string { return asset.kind === "slot" ? "slot:" + asset.slot : asset.kind + ":" + asset.id; }
const pickOwner = (state: GmLeagueState, slot: number) => state.draftOrder?.[slot] ?? state.lotteryOrder?.[slot % Math.max(1,state.lotteryOrder.length)];
const abbr = (state: GmLeagueState, teamId: string) => state.teams.find(team=>team.id===teamId)?.abbr ?? teamId;

export function draftAssetCatalog(state: GmLeagueState, teamId: string): DraftAssetRow[] {
  const club = state.teams.find(team=>team.id===teamId);
  if (!club) return [];
  const count = state.draftOrder?.length ?? (state.lotteryOrder?.length ?? 0) * 2;
  const rows: DraftAssetRow[] = [];
  for (let slot=state.draftPickIndex??0; slot<count; slot++) if (pickOwner(state,slot)===teamId) {
    const asset: DraftAsset = { kind: "slot", slot };
    rows.push({ asset, key: draftAssetKey(asset), label: "#"+(slot+1)+" tonight", points: draftSlotTradePoints(slot+1), available:true });
  }
  for (const pick of club.draftPicks.filter(pick=>pick.season>state.season && pick.ownerTeamId===teamId).sort((a,b)=>a.season-b.season||a.round-b.round)) {
    const asset: DraftAsset = {kind:"future",id:pick.id};
    const reason = pick.frozen ? "This pick is frozen." : pick.season>state.season+6 ? "Outside the seven-draft trade horizon." : pick.swapWithTeamId ? "Conditional swap rights must be resolved before this pick can move." : undefined;
    rows.push({asset,key:draftAssetKey(asset),label:pick.season+" "+abbr(state,pick.originalTeamId)+" "+(pick.round===1?"1st":"2nd")+(pick.protectionTopN?" (top-"+pick.protectionTopN+" protected)":""),points:Math.round(pickTradePoints(state,pick)*Math.pow(0.96,pick.season-state.season)*10)/10,available:!reason,reason});
  }
  for(const player of state.players.filter(player=>player.teamId===teamId)) {
    const rights = Boolean(player.pendingRookieContract && !player.contract && player.draftYear===state.season);
    if (!rights && (!player.contract || player.contract.yearsRemaining<=0)) continue;
    const asset: DraftAsset = {kind:"player",id:player.id};
    const reason = club.untouchables?.includes(player.id) ? "The club marked this player untouchable." : !rights && player.draftYear===state.season && player.contract?.signedSeason===state.season ? "A newly signed rookie cannot be traded on draft night. Unsigned draft rights can move." : undefined;
    // The pick curve and regular trade values have different units. A cheap
    // reserve cannot buy a lottery pick just by having a positive contract.
    const readyValue=playerTradePoints(player,state.settings?state:undefined)*clamp((playerSheet(player).overall-60)/70,0.12,0.5);
    // Until there is NBA evidence, unsigned rights retain the pick's pedigree.
    const points=rights?draftSlotTradePoints(player.draftPick??60)*0.85+readyValue*0.15:readyValue;
    rows.push({asset,key:draftAssetKey(asset),label:player.name+(rights?" · unsigned draft rights":" · $"+player.contract!.annualSalaryM.toFixed(1)+"M"),points:Math.max(0.5,Math.round(points*10)/10),available:!reason,reason});
  }
  return rows;
}

function futureFirstsLegal(state:GmLeagueState, team:GmTeam, sent:DraftAsset[], received:DraftAsset[], partner:GmTeam):boolean {
  const sentIds = new Set(sent.filter(asset=>asset.kind==="future").map(asset=>asset.id));
  const incoming = received.filter(asset=>asset.kind==="future").map(asset=>partner.draftPicks.find(pick=>pick.id===asset.id)).filter((pick):pick is GmDraftPick=>Boolean(pick));
  const guaranteed = (p:GmDraftPick) => p.round===1 && !(p.protectionTopN && p.originalTeamId!==team.id);
  const before = new Set(team.draftPicks.filter(guaranteed).map(pick=>pick.season));
  const after = new Set([...team.draftPicks.filter(pick=>!sentIds.has(pick.id)),...incoming].filter(guaranteed).map(pick=>pick.season));
  const max = Math.min(state.season+6,Math.max(state.season+1,...team.draftPicks.map(pick=>pick.season),...incoming.map(pick=>pick.season)));
  for(let year=state.season+1;year<max;year++) if (!after.has(year)&&!after.has(year+1)&&(before.has(year)||before.has(year+1))) return false;
  return true;
}

export function quoteDraftTrade(state:GmLeagueState, proposal:DraftTradeProposal):DraftTradeVerdict {
  const fail=(reason:string):DraftTradeVerdict=>({legal:false,accepted:false,reason,give:0,get:0,asking:0,rationale:[]});
  if(state.phase!=="draft" || proposal.clockIndex!==(state.draftPickIndex??0)) return fail("The draft has moved on. Request a fresh offer for the current board.");
  const from=state.teams.find(team=>team.id===proposal.fromTeamId), to=state.teams.find(team=>team.id===proposal.toTeamId);
  if(!from||!to||from.id===to.id) return fail("Choose another club.");
  if(!proposal.send.length||!proposal.receive.length) return fail("Both clubs need assets in the package.");
  if(proposal.send.length>9||proposal.receive.length>9) return fail("Each club can include at most nine assets.");
  if(proposal.targetPlayerId&&!state.draftPool.includes(proposal.targetPlayerId)) return fail("Your target has already been selected. Review the board before trading.");
  const seen=new Set<string>();
  const catalogs=[draftAssetCatalog(state,from.id),draftAssetCatalog(state,to.id)];
  const selected:DraftAssetRow[][]=[];
  for(const [index,assets] of [proposal.send,proposal.receive].entries()) {
    const pile:DraftAssetRow[]=[];
    for(const asset of assets) {
      const key=draftAssetKey(asset);
      if(seen.has(key)) return fail("An asset can only appear once in a trade.");
      seen.add(key);
      const row=catalogs[index]!.find(row=>row.key===key);
      if(!row) return fail("A pick was used or an asset changed owners. Rebuild this package.");
      if(!row.available) return fail(row.reason??"An asset is unavailable.");
      pile.push(row);
    }
    selected.push(pile);
  }
  if(!futureFirstsLegal(state,from,proposal.send,proposal.receive,to)||!futureFirstsLegal(state,to,proposal.receive,proposal.send,from)) return fail("Stepien rule: this package can leave a club without first-round picks in consecutive future drafts.");
  const movedPlayers=(assets:DraftAsset[])=>assets.filter(asset=>asset.kind==="player").map(asset=>state.players.find(player=>player.id===asset.id)!).filter(Boolean);
  const out=movedPlayers(proposal.send), incoming=movedPlayers(proposal.receive);
  for(const [club,give,get] of [[from,out,incoming],[to,incoming,out]] as const) {
    const salary=(players:GmPlayer[])=>players.reduce((sum,player)=>sum+(player.contract?.annualSalaryM??0),0);
    const legal=tradeSalaryLegal({payrollM:teamPayrollM(club.id,state.players,club.deadMoney??[]),outM:salary(give),inM:salary(get),outCount:give.filter(p=>p.contract).length,inCount:get.filter(p=>p.contract).length,settings:state.settings});
    if(!legal.ok) return fail(club.abbr+": "+legal.reason);
    // Unsigned rights are assets, not roster spots. They count when signed.
    const rosterPlayers=state.players.filter(player=>player.teamId===club.id&&player.contract).length;
    if(rosterPlayers-give.filter(player=>player.contract).length+get.filter(player=>player.contract).length>offseasonRosterLimit(state)) return fail(club.abbr+" would exceed the summer roster limit.");
  }
  // Extra small assets have diminishing value to the receiving club.
  const packageValue=(rows:DraftAssetRow[])=>[...rows].sort((a,b)=>b.points-a.points).reduce((sum,row,index)=>sum+row.points*([1,0.9,0.72,0.5][index]??0.3),0);
  const give=packageValue(selected[0]!),get=packageValue(selected[1]!);
  const earliest=Math.min(...proposal.receive.filter(asset=>asset.kind==="slot").map(asset=>asset.slot));
  const smallLeague=state.teams.length<10;
  const premium = smallLeague ? 0.97 : earliest<3 ? (to.ownerGoal==="tank"?1.32:1.18) : earliest<14 ? 1.06 : 0.98;
  const asking=get*premium*clamp(state.settings?.tradeDifficulty??1,0.65,1.6);
  const rationale = [earliest<3?"Top-of-draft selection rights command a substantial premium.":to.ownerGoal==="tank"?"A rebuilding club values additional future control.":"The partner weighs the players it can still select after moving."];
  const top=marketBoard(state).find(player=>state.draftPool.includes(player.id));
  if(top&&earliest<3) rationale.push("The leading consensus prospect is still on the board.");
  const headliner=Math.max(...selected[0]!.map(row=>row.points));
  const credibleHeadliner=smallLeague||earliest>=14||headliner>=asking*(earliest<3?0.5:0.45);
  const accepted=give+0.05>=asking&&credibleHeadliner;
  if(!credibleHeadliner)rationale.push("This lottery pick needs a stronger main asset; a stack of small assets does not replace it.");
  return {legal:true,accepted,reason:accepted?to.abbr+" is willing to make this deal.":to.abbr+" wants a stronger package. Add another useful asset or target a later pick.",give:Math.round(give*10)/10,get:Math.round(get*10)/10,asking:Math.round(asking*10)/10,rationale};
}

/** Search modest pick/rights packages. Never volunteer a veteran or an untouchable. */
export function suggestDraftTrade(state:GmLeagueState, fromTeamId:string, toTeamId:string, targetSlot:number, targetPlayerId?:string):DraftTradeProposal|null {
  if(pickOwner(state,targetSlot)!==toTeamId||targetSlot<(state.draftPickIndex??0)) return null;
  const all=draftAssetCatalog(state,fromTeamId).filter(row=>{const asset=row.asset;return row.available && (asset.kind!=="slot"||asset.slot>targetSlot) && (asset.kind!=="player"||state.players.find(p=>p.id===asset.id)?.pendingRookieContract);});
  const pool=[...all.filter(row=>row.asset.kind==="slot").slice(0,3),...all.filter(row=>row.asset.kind==="future"&&state.teams.flatMap(team=>team.draftPicks).find(pick=>pick.id===(row.asset as {id:string}).id)?.round===1).slice(0,5),...all.filter(row=>row.asset.kind==="future"&&state.teams.flatMap(team=>team.draftPicks).find(pick=>pick.id===(row.asset as {id:string}).id)?.round===2).slice(0,5),...all.filter(row=>row.asset.kind==="player").slice(0,2)];
  let best:DraftTradeProposal|null=null, bestCost=Infinity;
  const walk=(start:number,chosen:DraftAssetRow[],cost:number)=>{
    if(cost>=bestCost) return;
    if(chosen.length) {
      const proposal:DraftTradeProposal={fromTeamId,toTeamId,clockIndex:state.draftPickIndex??0,send:chosen.map(row=>row.asset),receive:[{kind:"slot",slot:targetSlot}],targetPlayerId};
      const quote=quoteDraftTrade(state,proposal);
      if(quote.accepted){best=proposal;bestCost=cost;return;}
    }
    if(chosen.length>=3) return;
    for(let index=start;index<pool.length;index++) walk(index+1,[...chosen,pool[index]!],cost+pool[index]!.points);
  };
  walk(0,[],0);
  return best;
}

export function executeDraftTrade(state:GmLeagueState, proposal:DraftTradeProposal):{state:GmLeagueState;ok:boolean;reason:string} {
  const quote=quoteDraftTrade(state,proposal);
  if(!quote.accepted) return {state,ok:false,reason:quote.reason};
  const from=proposal.fromTeamId,to=proposal.toTeamId;
  const sentLabels=draftAssetCatalog(state,from).filter(row=>proposal.send.some(asset=>draftAssetKey(asset)===row.key)).map(row=>row.label);
  const receivedLabels=draftAssetCatalog(state,to).filter(row=>proposal.receive.some(asset=>draftAssetKey(asset)===row.key)).map(row=>row.label);
  const order=[...(state.draftOrder??[...(state.lotteryOrder??[]),...(state.lotteryOrder??[])])];
  const destinations=new Map<string,string>(), pickDestinations=new Map<string,string>();
  for(const [assets,owner] of [[proposal.send,to],[proposal.receive,from]] as const) for(const asset of assets) {
    if(asset.kind==="slot") {
      order[asset.slot]=owner;
      const origin=state.draftSlotOrigins?.[asset.slot]??state.lotteryOrder?.[asset.slot%Math.max(1,state.teams.length)];
      const pick=state.teams.flatMap(team=>team.draftPicks).find(pick=>pick.season===state.season&&pick.round===(asset.slot<state.teams.length?1:2)&&pick.originalTeamId===origin);
      if(pick) pickDestinations.set(pick.id,owner);
    }
    else if(asset.kind==="future") pickDestinations.set(asset.id,owner);
    else destinations.set(asset.id,owner);
  }
  const players=state.players.map(player=>destinations.has(player.id)?{...player,teamId:destinations.get(player.id)!}:player);
  const allPicks=state.teams.flatMap(team=>team.draftPicks).map(pick=>pickDestinations.has(pick.id)?{...pick,ownerTeamId:pickDestinations.get(pick.id)!}:pick);
  const teams=state.teams.map(team=>{
    // A protected pick can have reverted to its original club at the lottery.
    // Reconcile every asset book, including the former holder's record.
    if(team.id!==from&&team.id!==to) return {...team,draftPicks:allPicks.filter(pick=>pick.ownerTeamId===team.id)};
    const moved={...team,draftPicks:allPicks.filter(pick=>pick.ownerTeamId===team.id),benchOrder:team.benchOrder.filter(id=>!destinations.has(id))};
    for(const [id,owner] of destinations) if(owner===team.id&&!moved.benchOrder.includes(id)) moved.benchOrder.push(id);
    return destinations.size?autoSetLineup(moved,players):moved;
  });
  const id="draft-deal-"+state.season+"-"+proposal.clockIndex+"-"+draftHash(JSON.stringify(proposal));
  return {ok:true,reason:quote.reason,state:{...state,players,teams,draftOrder:order,draftDeals:[...(state.draftDeals??[]),{id,pickIndex:proposal.clockIndex,fromTeamId:from,toTeamId:to,sent:sentLabels,received:receivedLabels}],news:[{id,day:state.day,season:state.season,headline:abbr(state,from)+" and "+abbr(state,to)+" make a draft-night trade",body:abbr(state,from)+" sends "+sentLabels.join(", ")+" for "+receivedLabels.join(", ")+".",tone:"trade" as const},...state.news].slice(0,50),updatedAt:new Date().toISOString()}};
}

/** A few CPU-to-CPU moves give the room life, using the same legality and pricing as user deals. */
export function maybeCpuDraftTrade(state:GmLeagueState):GmLeagueState {
  const index=state.draftPickIndex??0,seller=pickOwner(state,index);
  if(!seller||seller===state.userTeamId||index<3||index>=50||state.draftDeals?.some(deal=>deal.pickIndex===index)) return state;
  const rng=createRng(draftHash(state.season+":cpu-draft-trade:"+index));
  if(rng()>0.075) return state;
  const count=state.draftOrder?.length??0;
  for(let offset=2;offset<=Math.min(7,count-index-1);offset++) {
    const buyer=pickOwner(state,index+offset);
    if(!buyer||buyer===seller||buyer===state.userTeamId) continue;
    const proposal=suggestDraftTrade(state,buyer,seller,index);
    if(proposal) return executeDraftTrade(state,proposal).state;
  }
  return state;
}

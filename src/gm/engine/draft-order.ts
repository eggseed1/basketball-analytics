import type { GmDraftPick, GmLeagueState } from "@/gm/types";

export function initialDraftPicks(teamId:string,season:number):GmDraftPick[]{
  return Array.from({length:7},(_,offset)=>([1,2] as const).map(round=>({id:`draft-${teamId}-${season+offset}-${round}`,season:season+offset,round,originalTeamId:teamId,ownerTeamId:teamId}))).flat();
}

/** Fill future years without duplicating a published debt or an asset held by another club. */
export function ensureDraftPickHorizon(league:GmLeagueState):GmLeagueState{
  const all=league.teams.flatMap(team=>[...team.draftPicks,...(team.owedPicks??[])]);
  const represented=new Set(all.map(pick=>`${pick.originalTeamId}:${pick.season}:${pick.round}`));
  let changed=false;
  const teams=league.teams.map(team=>{
    const additions=initialDraftPicks(team.id,league.season).filter(pick=>pick.season>league.season&&!represented.has(`${pick.originalTeamId}:${pick.season}:${pick.round}`));
    if(!additions.length)return team;
    changed=true;return {...team,draftPicks:[...team.draftPicks,...additions]};
  });
  return changed?{...league,teams}:league;
}

/** Lottery orders teams of origin. The asset book determines who selects. */
export function resolveDraftOrder(league:GmLeagueState, lottery=league.lotteryOrder??[]):Pick<GmLeagueState,"draftOrder"|"draftSlotOrigins"> {
  if(!lottery.length) return {draftOrder:[],draftSlotOrigins:[]};
  const second=[...lottery].sort((a,b)=>{
    const left=league.standings[a],right=league.standings[b];
    const pct=(row:typeof left)=>row&&row.wins+row.losses?row.wins/(row.wins+row.losses):0.5;
    return pct(left)-pct(right)||lottery.indexOf(a)-lottery.indexOf(b);
  });
  const origins=[...lottery,...second],picks=league.teams.flatMap(team=>team.draftPicks);
  const owners=origins.map((origin,index)=>{
    const round=index<lottery.length?1:2;
    const asset=picks.find(pick=>pick.season===league.season&&pick.round===round&&pick.originalTeamId===origin);
    if(!asset||asset.swapWithTeamId) return origin;
    const slot=index%lottery.length+1;
    if(asset.protectionTopN&&slot<=asset.protectionTopN) return origin;
    return league.teams.some(team=>team.id===asset.ownerTeamId)?asset.ownerTeamId:origin;
  });
  return {draftOrder:owners,draftSlotOrigins:origins};
}

export function rookieContractForPick(league:GmLeagueState, pickNumber:number) {
  const first=pickNumber<=league.teams.length;
  const year=league.seasonFlow?league.season+1:league.season;
  const cap=league.settings?.salaryCapM??140.588;
  const anchors=[[1,0.084],[2,0.075],[3,0.0675],[5,0.055],[10,0.035],[14,0.0275],[20,0.023],[30,0.019]];
  let share=0.019;
  for(let index=1;index<anchors.length;index++) {
    const lo=anchors[index-1]!,hi=anchors[index]!;
    if(pickNumber<=hi[0]!) {share=lo[1]!+(hi[1]!-lo[1]!)*(pickNumber-lo[0]!)/(hi[0]!-lo[0]!);break;}
  }
  const salary=Math.round((first?cap*share:Math.max(1.3,cap*0.0095))*100)/100;
  const yearsRemaining=first?4:2;
  return {yearsRemaining,annualSalaryM:salary,birdRights:"none" as const,signedSeason:year,originalYears:yearsRemaining,
    years:Array.from({length:yearsRemaining},(_,index)=>({season:year+index,salaryM:Math.round(salary*(1+index*0.05)*100)/100,...(first&&index>=2?{option:"team" as const}:{})}))};
}

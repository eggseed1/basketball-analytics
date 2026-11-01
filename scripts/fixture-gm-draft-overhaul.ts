import { mkdirSync,writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { prepareFranchise,exportFranchise } from "../src/gm/engine/franchise";
import { expandDraftOrder } from "../src/gm/engine/draft-room";
import { progressSheet } from "../src/gm/engine/attributes";
import { finishDraftWithAi } from "../src/gm/engine/progression";
import type { GmLeagueState } from "../src/gm/types";

async function main(){
  const dir=process.argv[2]??"/tmp/franchise-draft-qa";mkdirSync(dir,{recursive:true});
  const rows=(await getBundledBrefPeerBoard("2025-26")).filter(player=>player.gamesPlayed>=5&&player.minutes>=40&&player.fieldGoalsAttempted>0);
  const league=prepareFranchise(buildLeagueFromPlayerSeasons(rows,{userTeamId:"bos",seasonCanonical:"2025-26",seed:71}));
  const prep:GmLeagueState={...league,phase:"offseason",seasonFlow:{version:1,season:league.season,stage:"scouting",completed:[]}};
  const others=league.teams.filter(team=>team.id!=="bos").map(team=>team.id);
  const lotteryOrder=[...others.slice(0,19),"bos",...others.slice(19)],draftOrder=expandDraftOrder(lotteryOrder);
  const night:GmLeagueState={...prep,phase:"draft",lotteryOrder,draftOrder,draftSlotOrigins:draftOrder,draftPickIndex:12,seasonFlow:{...prep.seasonFlow!,stage:"draft"}};
  writeFileSync(dir+"/prep.json",exportFranchise(prep));writeFileSync(dir+"/night.json",exportFranchise(night));
  const completed=finishDraftWithAi({...night,draftPickIndex:0});
  writeFileSync(dir+"/results.json",exportFranchise(completed));
  const rookie=completed.players.find(player=>player.teamId==="bos"&&player.draftYear===league.season&&player.draftPick)!;
  const development:GmLeagueState={...completed,phase:"offseason",seasonFlow:{...completed.seasonFlow!,stage:"progression",progressionApplied:true},players:completed.players.map(player=>player.id===rookie.id?progressSheet({...player,age:player.age+1,developmentPlan:"practice"},{minutes:6,coach:0.4}):player)};
  writeFileSync(dir+"/development.json",exportFranchise(development));
  const target=league.players.find(player=>player.id===league.draftPool[45])!;
  writeFileSync(dir+"/manifest.json",JSON.stringify({targetId:target.id,targetName:target.name,tradeSlot:15,season:league.season,developmentId:rookie.id}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

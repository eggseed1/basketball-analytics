import { mkdirSync,writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { prepareFranchise,exportFranchise } from "../src/gm/engine/franchise";
import { expandDraftOrder } from "../src/gm/engine/draft-room";
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
  writeFileSync(dir+"/results.json",exportFranchise(finishDraftWithAi({...night,draftPickIndex:0})));
  const target=league.players.find(player=>player.id===league.draftPool[45])!;
  writeFileSync(dir+"/manifest.json",JSON.stringify({targetId:target.id,targetName:target.name,tradeSlot:15,season:league.season}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { buildScoutDesk } from "../src/gm/engine/scout-desk";
import { draftScoutingOf } from "../src/gm/engine/draft-intel";
import type { GmLeagueState } from "../src/gm/types";

const categories=["sleepers","ready","fit","upside"];
let changedSpecialists=0;
let total=0;
for (let seed=1;seed<=12;seed++) {
  const league=createGeneratedLeague({userTeamId:"bos",season:2029,seed:seed*197});
  const desk=buildScoutDesk(league,5);
  const replay=buildScoutDesk(league,5);
  assert.deepEqual(desk,replay,"same scout and evidence must create the same board");
  assert.deepEqual(desk.boards.map(b=>b.id),categories);
  assert.ok(desk.scoutName.length>0 && desk.briefing.includes(desk.scoutName.split(" ")[0]!));
  for (const board of desk.boards) {
    assert.ok(board.picks.length>=3);
    assert.ok(board.picks.every(row=>league.draftPool.includes(row.player.id)));
    assert.equal(new Set(board.picks.map(row=>row.player.id)).size,board.picks.length);
    assert.ok(board.picks.every(row=>row.note.length>10 && row.caution.length>10));
    if (board.id==="sleepers") assert.ok(board.picks.every(row=>(row.player.consensusRank??0)>=22));
  }
  const hidden: GmLeagueState = {...league,players:league.players.map(p=>!league.draftPool.includes(p.id)?p:{
    ...p, ratings:{...p.ratings,potential:10-p.ratings.potential},
    sheet:p.sheet?{...p.sheet,potential:{...p.sheet.potential,ceiling:99,trait:"xfactor",path:"boom"}}:p.sheet,
  })};
  const projected=(state:GmLeagueState)=>{const d=buildScoutDesk(state,5);return {
    headline:d.headline,briefing:d.briefing,recommended:d.recommended,
    boards:d.boards.map(b=>({id:b.id,title:b.title,picks:b.picks.map(x=>({id:x.player.id,score:x.score,note:x.note,caution:x.caution,readyRange:x.readyRange}))})),
  };};
  assert.deepEqual(projected(league),projected(hidden),"recommendations and scout language must never leak hidden career outcomes");
  const team=league.teams.find(t=>t.id===league.userTeamId)!;
  const withTeam=(goal:"contend"|"tank", expertise:"international"|"guards"|"bigs"):GmLeagueState=>
    ({...league,teams:league.teams.map(t=>t.id===team.id?{...t,ownerGoal:goal,staff:{...t.staff,scout:{...team.staff.scout!,name:"Quinn Scout",expertise,knack:expertise==="international"?"euro_radar":expertise==="guards"?"guard_tape":"paint_prophet"}}}:t),
      draftScouting:{...draftScoutingOf(league),strategy:"value"}});
  const contender=buildScoutDesk(withTeam("contend","guards"));
  const rebuild=buildScoutDesk(withTeam("tank","guards"));
  assert.equal(contender.recommended,"ready","contending clubs should prefer immediate contributors");
  assert.equal(rebuild.recommended,"upside","rebuilding clubs should prefer high-upside candidates");
  const euro=buildScoutDesk(withTeam("tank","international"));
  const bigs=buildScoutDesk(withTeam("tank","bigs"));
  assert.notEqual(euro.boards[0]?.title,bigs.boards[0]?.title,"scout specialties should change the pitch");
  const ids=(d:ReturnType<typeof buildScoutDesk>,id:string)=>d.boards.find(x=>x.id===id)!.picks.map(x=>x.player.id).join(",");
  if(ids(euro,"sleepers")!==ids(bigs,"sleepers")||ids(euro,"fit")!==ids(bigs,"fit"))changedSpecialists++;
  total++;
  const remaining=league.draftPool.slice(25);
  const late=buildScoutDesk({...league,draftPool:remaining,players:league.players.filter(p=>!league.draftPool.includes(p.id)||remaining.includes(p.id))},4);
  assert.ok(late.boards.flatMap(b=>b.picks).every(row=>remaining.includes(row.player.id)),"on draft night show only available players");
}
assert.ok(changedSpecialists>=4,"different head scouts should meaningfully change candidate selection");
console.log("Contextual scouting desk passed "+total+" seeded leagues; "+changedSpecialists+" produced distinct specialist boards.");

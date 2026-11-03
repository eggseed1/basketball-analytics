import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { retieCupGroupGames, ensureNbaCup, gameCounts } from "../src/gm/engine/cup";
import { createRng } from "../src/gm/engine/rng";

Math.random=createRng(62832);
const lastDates=new Map<string,string>();
for(const season of [2028,2029,2030,2031,2032]){
  const league=createGeneratedLeague({season,seed:season*101+29,userTeamId:"bos"});
  const games=league.schedule;
  assert.equal(games.length,1200,season+" generated 80-game published slate");
  assert.equal(games.filter(gameCounts).length,1200);
  assert.equal(new Set(games.map(g=>g.id)).size,1200,"unique game identities");
  assert.ok(games.every(g=>g.gameDate&&g.day>=0&&g.season===season));
  const groups=league.cupGroups!;
  assert.equal(games.filter(g=>g.cup==="group").length,60,"Cup group games fixed in new schedule");
  const byDate=new Map<string,Set<string>>();
  const backToBacks:number[]=[];
  const perTeam=new Map(league.teams.map(t=>[t.id,[] as typeof games]));
  for(const game of games){
    const date=game.gameDate!;
    const booked=byDate.get(date)??new Set<string>();
    assert.ok(!booked.has(game.homeTeamId)&&!booked.has(game.awayTeamId),
      "Double booking "+date+": "+game.homeTeamId+"-"+game.awayTeamId);
    booked.add(game.homeTeamId);booked.add(game.awayTeamId);byDate.set(date,booked);
    perTeam.get(game.homeTeamId)!.push(game);
    perTeam.get(game.awayTeamId)!.push(game);
  }
  for(const team of league.teams){
    const mine=perTeam.get(team.id)!.sort((a,b)=>a.gameDate!.localeCompare(b.gameDate!));
    const home=mine.filter(g=>g.homeTeamId===team.id).length;
    assert.equal(mine.length,80,season+" "+team.id+" plays 80 initial games");
    assert.equal(home,40,season+" "+team.id+" plays 40 home games");
    const cup=mine.filter(g=>g.cup==="group");
    assert.equal(cup.length,4,team.id+" has four group games");
    assert.equal(cup.filter(g=>g.homeTeamId===team.id).length,2,"Cup groups 2H/2A");
    const otherIds=league.teams.filter(t=>t.id!==team.id);
    const sameConference=league.teams.filter(t=>t.conference===team.conference&&t.id!==team.id);
    const otherDivision=sameConference.filter(t=>t.division!==team.division);
    let fourOut=0,threeOut=0;
    for(const rival of otherIds){
      const count=mine.filter(g=>g.homeTeamId===rival.id||g.awayTeamId===rival.id).length;
      const expected=rival.conference!==team.conference?2:
        rival.division===team.division?4:count;
      assert.equal(count,expected,team.id+"-"+rival.id+" games");
      if(rival.conference===team.conference&&rival.division!==team.division){
        assert.ok(count===3||count===4,"out-of-division conference opponents play 3 or 4");
        if(count===4)fourOut++;
        else threeOut++;
      }
    }
    assert.equal(fourOut,4,"four nondivision 4-game opponents");
    assert.equal(threeOut,6,"six nondivision 3-game opponents");
    assert.equal(otherDivision.length,10);
    const days=mine.map(g=>Math.round(Date.parse(g.gameDate!)/86400000));
    let b2b=0;
    for(let i=1;i<days.length;i++){
      const gap=days[i]!-days[i-1]!;
      assert.ok(gap>=1,"no double-booked dates");
      if(gap===1)b2b++;
    }
    backToBacks.push(b2b);
    assert.ok(b2b<=18,team.id+" too many back-to-backs: "+b2b);
    for(let i=3;i<days.length;i++)
      assert.ok(days[i]!-days[i-3]!>=5,team.id+" has four games in five nights");
    for(let i=2;i<days.length;i++)
      assert.ok(days[i]!-days[i-2]!>=3,team.id+" has three straight nights");
  }
  const unchanged=retieCupGroupGames(games,groups,season);
  assert.deepEqual(unchanged,games,"generated Cup fixtures must keep matchup quotas");
  assert.equal(ensureNbaCup(league).schedule.length,1200);
  if(lastDates.size){
    let identical=0;
    for(const team of league.teams){
      const mine=perTeam.get(team.id)!.sort((a,b)=>a.gameDate!.localeCompare(b.gameDate!));
      const serial=mine.slice(0,15).map(g=>g.homeTeamId===team.id?g.awayTeamId:g.homeTeamId).join(",");
      if(serial===lastDates.get(team.id))identical++;
      lastDates.set(team.id,serial);
    }
    assert.ok(identical<=1,season+" repeats last year's opponent sequence");
  }else{
    for(const team of league.teams){
      const mine=perTeam.get(team.id)!.sort((a,b)=>a.gameDate!.localeCompare(b.gameDate!));
      lastDates.set(team.id,mine.slice(0,15).map(g=>g.homeTeamId===team.id?g.awayTeamId:g.homeTeamId).join(","));
    }
  }
  console.log("FUTURE_SCHEDULE "+JSON.stringify({season,games:games.length,days:byDate.size,cup:60,
    busiest:Math.max(...[...byDate.values()].map(x=>x.size/2)),
    backToBacks:{min:Math.min(...backToBacks),max:Math.max(...backToBacks),
      average:+(backToBacks.reduce((n,v)=>n+v,0)/backToBacks.length).toFixed(2)}}));
}
console.log("Five independently generated NBA-like schedules: ok");

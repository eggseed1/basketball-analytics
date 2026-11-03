/**
 * Production-path standings reality check: runs real Franchise Lab stepDay(),
 * including Cup/calendar, injury generation, recovery, player development and
 * accumulated standings. Retrospective 2025-26 player pool; not a faithful
 * historical season replay because transactions are frozen at seed.
 */
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {getBundledBrefPeerBoard} from "../src/data/runtime/bref-advanced-snapshot";
import {buildLeagueFromPlayerSeasons} from "../src/gm/seed/create-real-league";
import {stepDay} from "../src/gm/engine/pace";
import {gameCounts} from "../src/gm/engine/cup";
import {createRng} from "../src/gm/engine/rng";
const actual:Record<string,number>={
  det:60,bos:56,nyk:53,cle:52,tor:46,atl:46,phi:45,orl:45,cha:44,mia:43,mil:32,chi:31,bkn:20,ind:19,was:17,
  okc:64,sas:62,den:54,lal:53,hou:52,min:49,phx:45,por:42,lac:42,gsw:37,nop:26,dal:26,mem:25,sac:22,uta:22,
};
const mean=(a:number[])=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
const sd=(a:number[])=>Math.sqrt(mean(a.map(x=>(x-mean(a))**2)));
const rank=(a:number[])=>a.map(x=>a.filter(y=>y>x).length+0.5*a.filter(y=>y===x).length);
const corr=(a:number[],b:number[])=>{const x=rank(a),y=rank(b),ax=mean(x),by=mean(y);return mean(x.map((v,i)=>(v-ax)*(y[i]!-by)))/Math.max(.0001,sd(x)*sd(y));};
const rows:any[]=[];
async function main(){
  const data=(await getBundledBrefPeerBoard("2025-26"))
    .filter(p=>p.gamesPlayed>=5&&p.minutes>=40&&p.fieldGoalsAttempted>0);
  assert.ok(data.length>350);
  Math.random=createRng(915719);
  for(const seed of [71,137]){
    let league=buildLeagueFromPlayerSeasons(data,{seasonCanonical:"2025-26",userTeamId:"bos",seed});
    let ended=false,days=0,injuredGameAbsences=0,injuryEvents=0;
    let previousInjury=new Set<string>();
    while(!ended&&days<420){
      const due=league.schedule.filter(g=>!g.played&&g.day===league.day&&gameCounts(g));
      const teams=new Set(due.flatMap(g=>[g.homeTeamId,g.awayTeamId]));
      for(const p of league.players)if(p.teamId&&teams.has(p.teamId)&&p.injury)injuredGameAbsences++;
      const response=stepDay(league);
      const now=new Set(response.league.players.filter(p=>p.injury).map(p=>p.id));
      for(const id of now)if(!previousInjury.has(id))injuryEvents++;
      previousInjury=now;
      league=response.league;
      ended=response.seasonOver;
      days++;
    }
    assert.ok(ended,"regular season did not finish in 420 calendar steps");
    const games=league.schedule.filter(game=>gameCounts(game)&&game.played);
    assert.equal(games.length,1230,"must play 1,230 standings games");
    const teamRows=Object.entries(actual).map(([id,real])=>{
      const s=league.standings[id]!;
      assert.equal(s.wins+s.losses,82,id+" must finish 82 games");
      return {team:id,real,sim:s.wins};
    });
    const sim=teamRows.map(x=>x.sim),real=teamRows.map(x=>x.real);
    const meanGp=mean(league.players.filter(p=>p.teamId&&p.seasonLine?.gp).map(p=>p.seasonLine!.gp));
    const entryRoster=league.players.filter(p=>p.teamId&&p.nbaSeason?.gp&&p.nbaSeason.gp>=10);
    const histGp=mean(entryRoster.map(p=>p.nbaSeason!.gp));
    const simulatedGp=mean(entryRoster.map(p=>p.seasonLine?.gp??0));
    const report={seed,days,games:games.length,
      rankCorrelation:Math.round(corr(real,sim)*1000)/1000,
      mae:Math.round(mean(teamRows.map(x=>Math.abs(x.sim-x.real)))*1000)/1000,
      sd:Math.round(sd(sim)*1000)/1000,realSd:Math.round(sd(real)*1000)/1000,
      minWins:Math.min(...sim),maxWins:Math.max(...sim),
      injuredGameAbsences,injuryEvents,meanGp,histGp,simulatedGp,
      teams:teamRows.sort((a,b)=>b.sim-a.sim)};
    rows.push(report);
    console.log("PRODUCTION_SEASON "+JSON.stringify({...report,teams:report.teams.slice(0,9)}));
  }
  mkdirSync("artifacts",{recursive:true});
  writeFileSync("artifacts/franchise-production-standings.json",JSON.stringify({method:"Real stepDay progression with internally generated injuries, static 2025-26 real-season ending rosters",runs:rows},null,2));
  const summary=rows.map(x=>"| "+x.seed+" | "+x.rankCorrelation+" | "+x.mae+" | "+x.realSd+" | "+x.sd+" | "+x.minWins+" | "+x.maxWins+" | "+x.injuryEvents+" | "+x.histGp.toFixed(1)+" | "+x.simulatedGp.toFixed(1)+" |").join("\n");
  writeFileSync("artifacts/franchise-production-standings.md","# Full Franchise Lab season simulation\n\n| Seed | Rank correlation | Win MAE | Real wins SD | Sim wins SD | Fewest wins | Most wins | Injury events | Historical GP | Simulated GP |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n"+summary+"\n");
}
main().catch(e=>{console.error(e);process.exitCode=1});

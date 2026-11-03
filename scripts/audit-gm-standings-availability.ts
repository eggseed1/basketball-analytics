/**
 * Franchise Lab historical-availability standings benchmark, based on real NBA rosters
 * and completed NBA 2024-25 / 2025-26 season tables.
 *
 * Replays 3 injury-availability-conditioned 82-game seasons per historical year,
 * reconstructing the 30 NBA Cup/makeup standings games once groups finish.
 * This is retrospective team-strength validation, NOT a historical replay:
 * real season-ending rosters are fixed and injuries/trades do not recur.
 *
 * Sources for real wins:
 * https://www.basketball-reference.com/leagues/NBA_2025_standings.html
 * https://www.basketball-reference.com/leagues/NBA_2026_standings.html
 *
 * Run: npm run audit:franchise-standings
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { ensureNbaCup, gameCounts } from "../src/gm/engine/cup";
import { simulateGame } from "../src/gm/engine/simulate";
import { applyGameToStandings, emptyStandings } from "../src/gm/engine/standings";
import { createRng } from "../src/gm/engine/rng";
import type { GmLeagueState } from "../src/gm/types";

const HISTORICAL: Record<string, Record<string, number>> = {
  "2024-25": {
    cle:64,bos:61,nyk:51,ind:50,mil:48,det:44,orl:41,atl:40,chi:39,mia:37,tor:30,bkn:26,phi:24,cha:19,was:18,
    okc:68,hou:52,lal:50,den:50,lac:50,min:49,gsw:48,mem:48,sac:40,dal:39,phx:36,por:36,sas:34,nop:21,uta:17,
  },
  "2025-26": {
    det:60,bos:56,nyk:53,cle:52,tor:46,atl:46,phi:45,orl:45,cha:44,mia:43,mil:32,chi:31,bkn:20,ind:19,was:17,
    okc:64,sas:62,den:54,lal:53,hou:52,min:49,phx:45,por:42,lac:42,gsw:37,nop:26,dal:26,mem:25,sac:22,uta:22,
  },
};
const SEEDS = [101, 709, 2029];
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
const stdev=(xs:number[])=>Math.sqrt(mean(xs.map(v=>(v-mean(xs))**2)));
const rank=(xs:number[])=>xs.map(v=>1+xs.filter(w=>w>v).length+0.5*(xs.filter(w=>w===v).length-1));
const pearson=(a:number[],b:number[])=>{
  const av=mean(a),bv=mean(b);
  const covariance=mean(a.map((x,i)=>(x-av)*(b[i]!-bv)));
  return covariance/Math.max(1e-9,stdev(a)*stdev(b));
};
const spearman=(a:number[],b:number[])=>pearson(rank(a),rank(b));
const round=(v:number)=>Math.round(v*1000)/1000;
type GameRow = {year:string;seed:number;team:string;realWins:number;simWins:number;simLosses:number;pointsFor:number;pointsAgainst:number};
type CohortRow = {year:string;seed:number;games:number;homeWinRate:number;maeWins:number;rmseWins:number;rankCorrelation:number;winSd:number;minWins:number;maxWins:number;topSixOverlap:number;bottomSixOverlap:number;largestMisses:{team:string;real:number;sim:number;error:number}[]};
async function main(){
const rows:GameRow[]=[];
const cohorts:CohortRow[]=[];
Math.random=createRng(66554);
for(const [year,realRecords] of Object.entries(HISTORICAL)){
  assert.equal(Object.keys(realRecords).length,30);
  assert.equal(Object.values(realRecords).reduce((a,b)=>a+b,0),1230,"real NBA regular-season wins must total 1230");
  const source=(await getBundledBrefPeerBoard(year))
    .filter(p=>p.gamesPlayed>=5&&p.minutes>=40&&p.fieldGoalsAttempted>0);
  assert.ok(source.length>350,year+" bundled NBA data missing");
  for(const seed of SEEDS){
    let league=ensureNbaCup(buildLeagueFromPlayerSeasons(source,{
      userTeamId:"bos",seasonCanonical:year,seed,keepAssignedRoster:false,
    }));
    assert.equal(league.teams.length,30);
    assert.equal(league.schedule.filter(gameCounts).length,1200,
      "published schedule starts with 80 games per club");
    let standings=emptyStandings(league.teams);
    const rosterByTeam=new Map(league.teams.map(t=>[t.id,league.players.filter(p=>p.teamId===t.id)]));
    const tracked=new Map<string,number>();
    let games=0,homeWins=0,gameIndex=0;
    // All games on a calendar day are simulated before group standings are
    // inspected to generate next-round NBA Cup + 82nd-game fixtures.
    while(true){
      const pending=league.schedule.filter(g=>!g.played)
        .sort((a,b)=>a.day-b.day||a.id.localeCompare(b.id));
      if(!pending.length)break;
      const slate=pending.filter(g=>g.day===pending[0]!.day);
      for(const game of slate){
        const availabilityRng=createRng(790000+seed*20000+gameIndex+Number(year.slice(0,4))*313);
        const availableIds=new Set<string>();
        for(const id of [game.homeTeamId,game.awayTeamId]){
          const roster=rosterByTeam.get(id)!;
          const selected=roster.filter(p=>availabilityRng()<Math.min(1,Math.max(0.08,(p.nbaSeason?.gp??82)/82)));
          if(selected.length<5){
            for(const p of [...roster].sort((a,b)=>(b.nbaSeason?.gp??82)-(a.nbaSeason?.gp??82))){
              if(selected.length>=5)break;
              if(!selected.includes(p))selected.push(p);
            }
          }
          for(const p of selected)availableIds.add(p.id);
        }
        const gamePlayers=league.players.map(p=>p.teamId&&[game.homeTeamId,game.awayTeamId].includes(p.teamId)&&!availableIds.has(p.id)
          ? {...p,injury:{type:"Historical availability simulation",gamesRemaining:1,reinjuryRisk:0}}
          : p);
        const result=simulateGame(game,league.teams,gamePlayers,
          7000000+seed*10000+gameIndex+Number(year.slice(0,4))*100000,
          league.schedule,league.settings);
        if(gameCounts(game)){
          games++;
          homeWins+=Number(result.box.homeScore>result.box.awayScore);
          standings=applyGameToStandings(standings,league.teams,
            game.homeTeamId,game.awayTeamId,result.box.homeScore,result.box.awayScore);
          for(const id of [game.homeTeamId,game.awayTeamId])
            tracked.set(id,(tracked.get(id)??0)+1);
        }
        // Mirror the in-game progression, not a 1,230-game prebuilt list.
        league={...league,schedule:league.schedule.map(g=>g.id===game.id?result.game:g)};
        gameIndex++;
      }
      league=ensureNbaCup(league);
    }
    assert.equal(games,1230,year+" should complete 1,230 standings games");
    for(const t of league.teams)assert.equal(tracked.get(t.id),82,t.id+" must have 82 games");
    const entries=Object.entries(realRecords).map(([id,realWins])=>{
      const line=standings[id]!;
      assert.equal(line.wins+line.losses,82,id+" record");
      const row:GameRow={year,seed,team:id,realWins,simWins:line.wins,simLosses:line.losses,
        pointsFor:line.pointsFor,pointsAgainst:line.pointsAgainst};
      rows.push(row);
      return row;
    });
    const actual=entries.map(x=>x.realWins),sim=entries.map(x=>x.simWins);
    const best=(k:"realWins"|"simWins")=>[...entries].sort((a,b)=>b[k]-a[k]).slice(0,6).map(x=>x.team);
    const worst=(k:"realWins"|"simWins")=>[...entries].sort((a,b)=>a[k]-b[k]).slice(0,6).map(x=>x.team);
    const cohort:CohortRow={
      year,seed,games,homeWinRate:round(homeWins/games),
      maeWins:round(mean(entries.map(x=>Math.abs(x.simWins-x.realWins)))),
      rmseWins:round(Math.sqrt(mean(entries.map(x=>(x.simWins-x.realWins)**2)))),
      rankCorrelation:round(spearman(actual,sim)),
      winSd:round(stdev(sim)),minWins:Math.min(...sim),maxWins:Math.max(...sim),
      topSixOverlap:best("simWins").filter(id=>best("realWins").includes(id)).length,
      bottomSixOverlap:worst("simWins").filter(id=>worst("realWins").includes(id)).length,
      largestMisses:[...entries].sort((a,b)=>Math.abs(b.simWins-b.realWins)-Math.abs(a.simWins-a.realWins))
        .slice(0,8).map(x=>({team:x.team,real:x.realWins,sim:x.simWins,error:x.simWins-x.realWins})),
    };
    cohorts.push(cohort);
    console.log(year+" seed "+seed+": "+JSON.stringify({...cohort,largestMisses:cohort.largestMisses.slice(0,4)}));
  }
}
const teamAverages=Object.entries(HISTORICAL).flatMap(([year,records])=>
  Object.entries(records).map(([team,realWins])=>{
    const observed=rows.filter(r=>r.year===year&&r.team===team);
    const simWins=mean(observed.map(r=>r.simWins));
    const simDiff=mean(observed.map(r=>(r.pointsFor-r.pointsAgainst)/82));
    return {year,team,realWins,simWins:round(simWins),winError:round(simWins-realWins),simPointDiff:round(simDiff)};
  }));
const yearly=Object.keys(HISTORICAL).map(year=>{
  const team=teamAverages.filter(x=>x.year===year);
  const episodes=cohorts.filter(x=>x.year===year);
  return {
    year,avgRankCorrelation:round(mean(episodes.map(x=>x.rankCorrelation))),
    meanWinsMAE:round(mean(episodes.map(x=>x.maeWins))),
    teamAvgMAE:round(mean(team.map(x=>Math.abs(x.winError)))),
    avgWinSd:round(mean(episodes.map(x=>x.winSd))),
    actualWinSd:round(stdev(team.map(x=>x.realWins))),
    avgHomeWins:round(mean(episodes.map(x=>x.homeWinRate))),
    topTeams:[...team].sort((a,b)=>b.simWins-a.simWins).slice(0,8),
    bottomTeams:[...team].sort((a,b)=>a.simWins-b.simWins).slice(0,8),
    largestMisses:[...team].sort((a,b)=>Math.abs(b.winError)-Math.abs(a.winError)).slice(0,12),
  };
});
const report={
  methodology:"6 seeded independent 82-game seasons using retrospective 2024-25 and 2025-26 player rows, each player sampled available at probability historic GP/82 for every game (not true injury timeline), roster fixed after transactions, NBA Cup + makeup generated; diagnostic of realistic player availability, not historical replay.",
  historicalSources:["https://www.basketball-reference.com/leagues/NBA_2025_standings.html",
    "https://www.basketball-reference.com/leagues/NBA_2026_standings.html"],
  seeds:SEEDS,totalGames:cohorts.reduce((n,c)=>n+c.games,0),
  overall:{
    avgRankCorrelation:round(mean(cohorts.map(c=>c.rankCorrelation))),
    avgRecordMae:round(mean(cohorts.map(c=>c.maeWins))),
    avgWinSd:round(mean(cohorts.map(c=>c.winSd))),
    avgHomeWins:round(mean(cohorts.map(c=>c.homeWinRate))),
    avgTopSixOverlap:round(mean(cohorts.map(c=>c.topSixOverlap))),
    avgBottomSixOverlap:round(mean(cohorts.map(c=>c.bottomSixOverlap))),
  },
  yearly,cohorts,teamAverages,
};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/franchise-standings-availability.json",JSON.stringify(report,null,2)+"\n");
const table=teamAverages.map(r=>"| "+r.year+" | "+r.team+" | "+r.realWins+" | "+r.simWins+" | "+r.winError+" | "+r.simPointDiff+" |").join("\n");
const yearTable=yearly.map(y=>"| "+y.year+" | "+y.avgRankCorrelation+" | "+y.meanWinsMAE+" | "+y.teamAvgMAE+" | "+y.actualWinSd+" | "+y.avgWinSd+" | "+y.avgHomeWins+" |").join("\n");
writeFileSync("artifacts/franchise-standings-availability.md",
  "# Franchise Lab — Historical player availability standings audit\n\n"+report.methodology+
  "\n\n## Season summaries\n| Season | Rank correlation | Per-seed win MAE | 3-run mean win MAE | Real win SD | Sim win SD | Home win % |\n|---|---:|---:|---:|---:|---:|---:|\n"+
  yearTable+"\n\n## Team-by-team mean\n| Season | Team | Real wins | Sim wins | Error | Sim margin/game |\n|---|---|---:|---:|---:|---:|\n"+
  table+"\n");
console.log("STANDINGS_AUDIT "+JSON.stringify(report.overall)+" YEARLY "+JSON.stringify(yearly));
assert.equal(report.totalGames,7380);
assert.ok(report.overall.avgRankCorrelation>-1 && report.overall.avgRankCorrelation<=1);

}
main().catch(error=>{console.error(error);process.exitCode=1;});

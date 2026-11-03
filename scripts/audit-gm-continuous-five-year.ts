/**
 * One persistent, five-year 30-team Franchise Lab save (2027-2031).
 * The same 450+ player identities, teams, contracts and draft rights pass
 * through five 82-game calendars and four guided summer cycles.
 *
 * Postseason outcomes are represented by the top regular-season club solely
 * to release the season-flow gate; playoff results are NOT assessed here.
 * This is a continuity / roster-evolution / calendar test, not a playoff test.
 */
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {createGeneratedLeague} from "../src/gm/seed/create-league";
import {stepDay} from "../src/gm/engine/pace";
import {gameCounts} from "../src/gm/engine/cup";
import {overallOf} from "../src/gm/engine/lineup";
import {createRng} from "../src/gm/engine/rng";
import {beginOffseason,advanceSeasonJourney,decideRookieContract,openingRosterChecks} from "../src/gm/engine/season-flow";
import {applySign} from "../src/gm/engine/free-agency";
import {askingSalary} from "../src/gm/engine/free-agency-ask";
import {evaluateSigning,exceptionAmounts} from "../src/gm/engine/cap";
import {releasePlayer} from "../src/gm/engine/roster-decisions";
import {runSummerLeague} from "../src/gm/engine/season-development";
import {franchisePlan} from "../src/gm/engine/franchise";
import type {GmLeagueState,GmPlayer} from "../src/gm/types";

const auditSeed=Number(process.env.FIVE_YEAR_SEED??42841);
Math.random=createRng(auditSeed*67+141);
let league=createGeneratedLeague({userTeamId:"bos",season:2027,seed:auditSeed});
const unsignedAtSeed=new Set(league.freeAgents);
assert.equal(league.players.filter(p=>unsignedAtSeed.has(p.id)&&overallOf(p)>=85).length,0,
  "an opening league with every club at 15 players must not start with unsigned superstars");
const mean=(a:number[])=>a.reduce((n,v)=>n+v,0)/Math.max(1,a.length);
const std=(a:number[])=>Math.sqrt(mean(a.map(v=>(v-mean(a))**2)));
const correlation=(a:number[],b:number[])=>{
  const aa=mean(a),bb=mean(b);
  return mean(a.map((v,i)=>(v-aa)*(b[i]!-bb)))/Math.max(1e-9,std(a)*std(b));
};
const quality=(state:GmLeagueState,id:string)=>{
  const top=state.players.filter(p=>p.teamId===id).sort((a,b)=>overallOf(b)-overallOf(a)).slice(0,8);
  return mean(top.map(overallOf));
};
const rosterIds=(state:GmLeagueState,id:string)=>
  new Set(state.players.filter(p=>p.teamId===id).map(p=>p.id));
type SeasonResult={season:number;games:number;calendarDays:number;winSd:number;minWins:number;maxWins:number;
  meanStrengthWinCorrelation:number;teams:Array<{id:string;wins:number;losses:number;quality:number;roster:string[]}>;newIdCount:number;
  cpuTrades:number;injuryEvents:number;topTeam:string;lastTeam:string;firstGames:string[];
  unsigned80Plus:number;unsigned85Plus:number;underMinimumClubs:number;
  unsignedElite:Array<{name:string;overall:number;age:number;askM:number;seedPool:boolean}>;};
const seasons:SeasonResult[]=[];
type SummerResult = {
  from:number;to:number;archived:boolean;ageContinuity:number;
  drafted:number;rookiesSigned:number;freeAgentsSigned:number;
  movedPlayers:number;averageRetention:number;
  qualityChanges:Array<{team:string;added:number;departed:number;retention:number;qualityDelta:number}>;
  stages:string[];scheduleChanged:boolean;
};
const summers:SummerResult[]=[];
let previousSeasonPlayerIds: Set<string> | null = null;
async function main(){
  for(let cycle=0;cycle<5;cycle++){
    const season=league.season;
    const opening=new Map(league.teams.map(t=>[t.id,rosterIds(league,t.id)]));
    const openingQuality=new Map(league.teams.map(t=>[t.id,quality(league,t.id)]));
    // Compare opening rosters/player pool across consecutive seasons, not
    // against the same season's opening pool (which always returns zero).
    const openingPlayerIds=new Set(league.players.map(p=>p.id));
    const priorIds=previousSeasonPlayerIds;
    const newSeasonPlayers=priorIds
      ? [...openingPlayerIds].filter(id=>!priorIds.has(id)).length : 0;
    const openingTradeCount=league.tradeLog.length;
    league={...league,automation:{...league.automation,autoDraft:true,autoFreeAgency:true},
      seenCheckpoints:[...(league.seenCheckpoints??[]),"trade_deadline"]};
    let days=0,ended=false,injuryEvents=0;
    let priorInjured=new Set(league.players.filter(p=>p.injury).map(p=>p.id));
    while(!ended&&days<350){
      const stepped=stepDay(league);
      league=stepped.league;
      ended=stepped.seasonOver;
      days++;
      const injured=new Set(league.players.filter(p=>p.injury).map(p=>p.id));
      for(const id of injured)if(!priorInjured.has(id))injuryEvents++;
      priorInjured=injured;
    }
    assert.ok(ended,season+" season did not complete within 350 calendar steps");
    const counted=league.schedule.filter(g=>g.played&&gameCounts(g));
    assert.equal(counted.length,1230,season+" must complete exactly 1230 regular-season games");
    const table=league.teams.map(t=>{
      const line=league.standings[t.id]!;
      assert.equal(line.wins+line.losses,82,season+" "+t.id+" must play 82 games");
      return {id:t.id,wins:line.wins,losses:line.losses,
        quality:openingQuality.get(t.id)!,roster:[...opening.get(t.id)!]};
    });
    assert.equal(table.reduce((n,row)=>n+row.wins,0),1230);
    const ordered=[...table].sort((a,b)=>b.wins-a.wins);
    const winSd=std(table.map(t=>t.wins));
    const seasonResult:SeasonResult={season,games:counted.length,calendarDays:days,
      winSd:+winSd.toFixed(2),minWins:ordered[29]!.wins,maxWins:ordered[0]!.wins,
      meanStrengthWinCorrelation:+correlation(table.map(t=>t.quality),table.map(t=>t.wins)).toFixed(3),
      teams:table,newIdCount:newSeasonPlayers,
      cpuTrades:league.tradeLog.length-openingTradeCount,injuryEvents,topTeam:ordered[0]!.id,lastTeam:ordered[29]!.id,
      unsigned80Plus:league.players.filter(p=>p.teamId==null&&!league.draftPool.includes(p.id)&&overallOf(p)>=80).length,
      unsigned85Plus:league.players.filter(p=>p.teamId==null&&!league.draftPool.includes(p.id)&&overallOf(p)>=85).length,
      unsignedElite:league.players.filter(p=>p.teamId==null&&!league.draftPool.includes(p.id)&&overallOf(p)>=85)
        .map(p=>({name:p.name,overall:overallOf(p),age:p.age,askM:askingSalary(p,league),seedPool:unsignedAtSeed.has(p.id)})),
      underMinimumClubs:league.teams.filter(t=>league.players.filter(p=>p.teamId===t.id&&p.contract).length<league.settings.minRoster).length,
      firstGames:league.schedule.filter(gameCounts).slice(0,24).map(g=>g.homeTeamId+":"+g.awayTeamId),
    };
    seasons.push(seasonResult);
    previousSeasonPlayerIds=openingPlayerIds;
    console.log("FRANCHISE_YEAR "+JSON.stringify({season,games:1230,days,winSd:seasonResult.winSd,
      winRange:[seasonResult.minWins,seasonResult.maxWins],
      strengthWinCorrelation:seasonResult.meanStrengthWinCorrelation,
      cpuTrades:seasonResult.cpuTrades,injuryEvents,newPlayers:seasonResult.newIdCount,
      unsigned80Plus:seasonResult.unsigned80Plus,unsigned85Plus:seasonResult.unsigned85Plus,underMinimumClubs:seasonResult.underMinimumClubs,
      topTeam:seasonResult.topTeam,bottomTeam:seasonResult.lastTeam}));
    if(cycle===4)break;
    const top=ordered[0]!.id;
    const finalsMvpId=league.players.find(p=>p.teamId===top)?.id??"audit_proxy";
    // The actual postseason UI has a separate series simulator. Standings
    // continuation needs a champion marker to enter the guided summer.
    league={...league,phase:"offseason",champion:{season,teamId:top,finalsMvpId,wins:4,losses:2},
      automation:{...league.automation,autoDraft:true,autoFreeAgency:true}};
    league=beginOffseason(league);
    const priorRoster=new Map(league.teams.map(t=>[t.id,rosterIds(league,t.id)]));
    const priorAges=new Map(league.players.filter(p=>p.draftYear!==season).map(p=>[p.id,p.age]));
    let drafted=0,rookiesSigned=0,freeAgentsSigned=0;
    const stages:string[]=[];
    for(let guard=0;guard<340&&league.season===season;guard++){
      const stage=league.seasonFlow?.stage??"none";
      stages.push(stage);
      if(stage==="rookie_signing"){
        const pending=league.players.filter(p=>p.teamId===league.userTeamId&&p.pendingRookieContract);
        for(const player of pending){
          const size=league.players.filter(p=>p.teamId===league.userTeamId).length;
          const result=decideRookieContract(league,player.id,size<league.settings.maxRoster);
          assert.ok(result.ok,"unable to resolve rookie contract "+result.reason);
          if(result.state.players.find(p=>p.id===player.id)?.contract)rookiesSigned++;
          league=result.state;
        }
      }
      if(stage==="summer_league"&&!league.seasonFlow?.summerLeague){
        league=runSummerLeague(league,true);
      }
      if(stage==="roster_check"){
        const id=league.userTeamId;
        for(let trim=0;trim<20;trim++){
          const signed=league.players.filter(p=>p.teamId===id&&p.contract);
          if(signed.length<=league.settings.maxRoster)break;
          const victim=[...signed].sort((a,b)=>overallOf(a)-overallOf(b))[0]!;
          league=releasePlayer(league,victim.id,id);
        }
        for(let fill=0;fill<20;fill++){
          const signed=league.players.filter(p=>p.teamId===id&&p.contract);
          if(signed.length>=league.settings.minRoster)break;
          // The audit must not hide FA-market failures by force-signing
          // an exclusive-rights rookie or expensive star on an illegal minimum.
          const minimum=exceptionAmounts(league.settings).minimumM;
          const eligible=[...league.players]
            .filter(p=>p.teamId==null&&!p.pendingRookieContract&&
              p.rightsKind!=="exclusive_draft"&&p.rightsKind!=="restricted"&&overallOf(p)<78)
            .sort((a,b)=>overallOf(b)-overallOf(a));
          const free=eligible.find(p=>evaluateSigning(league,id,p,minimum,1).ok);
          if(!free)break;
          const verdict=evaluateSigning(league,id,free,minimum,1);
          if(!verdict.ok)break;
          league=applySign(league,free.id,id,minimum,1,verdict.via);
          freeAgentsSigned++;
        }
      }
      const advanced=advanceSeasonJourney(league);
      if(!advanced.ok)throw new Error(season+" summer stage "+stage+" blocked: "+advanced.reason+
        " roster: "+JSON.stringify(openingRosterChecks(league)));
      league=advanced.state;
    }
    assert.equal(league.season,season+1,season+" guided offseason did not reach new season; "+stages.slice(-12).join(" -> "));
    drafted=league.players.filter(p=>p.draftYear===season&&p.teamId).length;
    const carried=[...priorAges.keys()].filter(id=>league.players.some(p=>p.id===id));
    const ageChanged=carried.filter(id=>league.players.find(p=>p.id===id)!.age===priorAges.get(id)!+1).length;
    const rosterChanges=league.teams.map(t=>{
      const now=rosterIds(league,t.id),before=priorRoster.get(t.id)!;
      return {team:t.id,added:[...now].filter(id=>!before.has(id)).length,
        departed:[...before].filter(id=>!now.has(id)).length,
        retention:[...before].filter(id=>now.has(id)).length/Math.max(1,before.size),
        qualityDelta:+(quality(league,t.id)-openingQuality.get(t.id)!).toFixed(2)};
    });
    const summary={from:season,to:league.season,
      archived:league.history?.some(row=>row.season===season)??false,
      ageContinuity:carried.length?+(ageChanged/carried.length).toFixed(3):0,
      drafted,rookiesSigned,freeAgentsSigned,
      movedPlayers:rosterChanges.reduce((n,t)=>n+t.added,0),
      averageRetention:+mean(rosterChanges.map(t=>t.retention)).toFixed(3),
      qualityChanges:rosterChanges,
      stages:[...new Set(stages)],
      scheduleChanged:!league.schedule.slice(0,24).every((g,i)=>
        g.homeTeamId+":"+g.awayTeamId===seasonResult.firstGames[i]),
    };
    summers.push(summary);
    console.log("FRANCHISE_SUMMER "+JSON.stringify({...summary,qualityChanges:undefined}));
    assert.ok(summary.archived,season+" historical standings not archived");
    assert.ok(summary.ageContinuity>=0.94,"age must advance once for surviving players");
    assert.ok(summary.scheduleChanged,"next season copied the same initial opponent order");
    assert.ok(league.schedule.length===1200,"next season must start with 1200 published games");
    assert.ok(league.schedule.every(g=>g.season===season+1&&!g.played));
    assert.ok(rosterChanges.some(r=>r.added>0),"new season has no roster additions");
  }
  type TeamTransition = {team:string;priorWins:number;wins:number;delta:number;retention:number;qualityDelta:number};
  type TransitionResult = {from:number;to:number;winCorrelation:number;averageAbsWinChange:number;
    "25plusSwings":number;unpromptedLargeSwings:TeamTransition[];clubs:TeamTransition[]};
  const transitions:TransitionResult[]=[];
  for(let index=1;index<seasons.length;index++){
    const before=seasons[index-1]!,after=seasons[index]!;
    const changes=after.teams.map(now=>{
      const old=before.teams.find(row=>row.id===now.id)!;
      const beforeIds=new Set(old.roster),afterIds=new Set(now.roster);
      const retention=[...beforeIds].filter(id=>afterIds.has(id)).length/Math.max(1,beforeIds.size);
      return {team:now.id,priorWins:old.wins,wins:now.wins,delta:now.wins-old.wins,
        retention:+retention.toFixed(2),qualityDelta:+(now.quality-old.quality).toFixed(2)};
    });
    const winCorrelation=correlation(before.teams.map(t=>t.wins),
      before.teams.map(t=>after.teams.find(row=>row.id===t.id)!.wins));
    transitions.push({from:before.season,to:after.season,
      winCorrelation:+winCorrelation.toFixed(3),
      averageAbsWinChange:+mean(changes.map(c=>Math.abs(c.delta))).toFixed(2),
      "25plusSwings":changes.filter(c=>Math.abs(c.delta)>=25).length,
      unpromptedLargeSwings:changes.filter(c=>Math.abs(c.delta)>=25&&c.retention>=.8&&Math.abs(c.qualityDelta)<2.5),
      clubs:changes});
  }
  const report={seed:auditSeed,method:"One persistent generated 30-team save; five 82-game seasons, four CPU-auto guided offseasons; champion supplied by season leader solely to release UI progression gates (playoff simulation excluded)",seasons,summers,transitions};
  mkdirSync("artifacts",{recursive:true});
  writeFileSync("artifacts/franchise-continuous-five-year.json",JSON.stringify(report,null,2)+"\n");
  const seasonal=seasons.map(s=>"| "+s.season+" | "+s.minWins+"-"+s.maxWins+" | "+s.winSd+" | "+s.meanStrengthWinCorrelation+" | "+s.cpuTrades+" | "+s.injuryEvents+" | "+s.unsigned80Plus+" | "+s.unsigned85Plus+" | "+s.underMinimumClubs+" |").join("\n");
  const delta=transitions.map(s=>"| "+s.from+"-"+s.to+" | "+s.winCorrelation+" | "+s.averageAbsWinChange+" | "+s["25plusSwings"]+" | "+s.unpromptedLargeSwings.map(x=>x.team).join(", ")+" |").join("\n");
  writeFileSync("artifacts/franchise-continuous-five-year.md",
    "# Five-year continuous Franchise Lab audit\n\n"+report.method+"\n\n## Seasons\n| Year | Win range | Win SD | Team quality vs wins | CPU trades | Injury events | Unsigned 80+ | Unsigned 85+ | Clubs below min |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n"+seasonal+
    "\n\n## Year-over-year movement\n| Transition | Record correlation | Average win change | 25+ win swings | Unexplained swings |\n|---|---:|---:|---:|---|\n"+delta+"\n");
  assert.equal(seasons.length,5);
  assert.equal(summers.length,4);
  assert.ok(summers.every(s=>s.drafted>0),"draft picks must join teams every offseason");
  assert.ok(seasons.slice(1).every(s=>s.newIdCount>=30),
    "each future season must introduce a meaningful new draft/player cohort");
  assert.ok(seasons.every(s=>s.winSd>=7.5&&s.winSd<=17),"team records must preserve NBA-like parity");
  assert.ok(seasons.every(s=>s.minWins<=32&&s.maxWins>=53),
    "NBA-like seasons should feature genuine contenders and rebuilding clubs");
  assert.ok(seasons.every(s=>s.unsigned85Plus<=1),
    "elite free agents should not routinely remain unsigned after offseasons");
  assert.ok(seasons.every(s=>s.meanStrengthWinCorrelation>=0.45),
    "team talent must matter to season results");
  assert.ok(transitions.every(t=>t.winCorrelation>=0.3&&t.winCorrelation<=0.96),
    "year-to-year records must be related without being scripted");
  assert.ok(transitions.every(t=>t.averageAbsWinChange>=2.5&&t.averageAbsWinChange<=12.5),
    "year-to-year records are too static or too volatile");
  assert.ok(transitions.reduce((n,t)=>n+t.unpromptedLargeSwings.length,0)<=3,
    "too many 25-win swings without large roster/talent changes");
  assert.ok(summers.every(s=>s.movedPlayers>=20&&s.averageRetention>=0.5&&s.averageRetention<=0.98),
    "offseason needs meaningful roster churn without a complete league reset");
  assert.ok(summers.every(s=>s.ageContinuity>=0.98),
    "veteran age must carry correctly through every offseason");
  console.log("CONTINUOUS_FIVE_YEAR "+JSON.stringify({
    seasons:seasons.map(s=>({year:s.season,range:[s.minWins,s.maxWins],sd:s.winSd,qualityCorrelation:s.meanStrengthWinCorrelation})),
    transitions:transitions.map(t=>({years:t.from+"-"+t.to,winCorrelation:t.winCorrelation,averageAbsWinChange:t.averageAbsWinChange,
      unexplainedSwings:t.unpromptedLargeSwings.length})),
    summers:summers.map(s=>({from:s.from,added:s.movedPlayers,drafted:s.drafted,retention:s.averageRetention,ageContinuity:s.ageContinuity}))}));
}
main().catch(error=>{console.error(error);process.exitCode=1});

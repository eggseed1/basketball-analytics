/**
 * Game-level outcome distribution and clock/player consistency test.
 * 2025-26 source data is a useful shooting prior, not an oracle for individual
 * game winners; verify distributional behavior, not predetermined scores.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { simulateGame } from "../src/gm/engine/simulate";

const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
const sd=(xs:number[])=>Math.sqrt(mean(xs.map(x=>(x-mean(xs))**2)));
const between=(v:number,lo:number,hi:number,key:string)=>assert.ok(v>=lo&&v<=hi, key+" "+v.toFixed(3)+" outside "+lo+".."+hi);

async function main(){
  const data=(await getBundledBrefPeerBoard("2025-26")).filter(p=>p.gamesPlayed>=5&&p.minutes>=40&&p.fieldGoalsAttempted>0);
  const league=buildLeagueFromPlayerSeasons(data,{userTeamId:"bos",seasonCanonical:"2025-26",seed:71});
  const games=league.schedule.slice(0,320);
  const margins:number[]=[], teamPoints:number[]=[], totals:number[]=[], gaps:number[]=[];
  let homeWins=0, close=0, blowouts=0, overtimes=0, periodShots=0, allFieldGoals=0;
  for(let index=0;index<games.length;index++){
    const game=games[index]!;
    const {box}=simulateGame(game,league.teams,league.players,91000+index,undefined,league.settings);
    assert.ok(box.events?.length);
    const events=box.events!;
    if(box.homeScore>box.awayScore)homeWins++;
    const difference=Math.abs(box.homeScore-box.awayScore);
    margins.push(difference); teamPoints.push(box.homeScore,box.awayScore);
    totals.push(box.homeScore+box.awayScore);
    close+=Number(difference<=5);blowouts+=Number(difference>=20);overtimes+=Number(Boolean(box.overtime));
    assert.notEqual(box.homeScore,box.awayScore,"games cannot finish tied");
    assert.ok((box.overtime??0)<=6,"unbounded overtime loop");
    for(const side of [box.homeTeamId,box.awayTeamId]){
      const teamLines=box.players.filter(p=>p.teamId===side);
      const expectedMinutes=240+(box.overtime??0)*25;
      assert.ok(Math.abs(teamLines.reduce((a,p)=>a+p.minutes,0)-expectedMinutes)<0.05,"each team must have five on court for all game minutes");
      assert.equal(teamLines.reduce((a,p)=>a+p.points,0),side===box.homeTeamId?box.homeScore:box.awayScore);
      for(const p of teamLines) {
        assert.ok(p.minutes>=0&&p.minutes<=48+(box.overtime??0)*5+.001);
        assert.ok(p.personalFouls==null||p.personalFouls<=6,"no seventh foul after disqualification");
        assert.equal((p.offensiveRebounds??0)+(p.defensiveRebounds??0),p.rebounds);
        assert.ok(p.fgm<=p.fga && p.tpm<=p.tpa && p.ftm<=p.fta);
        const gs=p.points + 0.4*p.fgm - 0.7*p.fga - 0.4*(p.fta-p.ftm) + 0.7*(p.offensiveRebounds??0) + 0.3*(p.defensiveRebounds??0) + p.steals + 0.7*p.assists + 0.7*p.blocks - 0.4*(p.personalFouls??0) - p.turnovers;
        assert.ok(Math.abs(p.gameScore - Math.round(gs*10)/10)<0.001,"Game Score must follow its standard box-score definition");
      }
    }
    let prevPeriod=1,prevClock=721;
    const seenFieldTimes=new Set<string>();
    for(const e of events){
      assert.ok(e.period>=prevPeriod,"PBP period must ascend");
      if(e.period!==prevPeriod) prevClock=e.period<=4?721:301;
      assert.ok(e.clockSeconds<=prevClock+.001,"clock must never run backwards within a period");
      assert.ok(e.clockSeconds>=0&&e.clockSeconds<=(e.period<=4?720:300),"invalid game clock");
      if(e.isFieldGoal){ allFieldGoals++;periodShots++;seenFieldTimes.add(e.period+":"+e.clockSeconds);}
      prevPeriod=e.period;prevClock=e.clockSeconds;
    }
    if(index<10){
      const uniqueShots=events.filter(e=>e.isFieldGoal).length;
      assert.ok(seenFieldTimes.size>=uniqueShots*.68,"shots cannot follow a fixed coarse timestamp grid");
      assert.deepEqual(simulateGame(game,league.teams,league.players,91000+index,undefined,league.settings).box,box,"seed replay must be identical");
    }
    const shots=events.filter(e=>e.isFieldGoal);
    for(let i=1;i<shots.length;i++){
      if(shots[i]!.period===shots[i-1]!.period) {
        gaps.push(shots[i-1]!.clockSeconds-shots[i]!.clockSeconds);
      }
    }
  }
  const distribution={games:games.length,meanMargin:mean(margins),scoreSd:sd(teamPoints),
    pointsPerTeam:mean(teamPoints),meanTotal:mean(totals),
    homeWinRate:homeWins/games.length,closeRate:close/games.length,blowoutRate:blowouts/games.length,
    overtimeRate:overtimes/games.length,averageShotGap:mean(gaps),shotGapSd:sd(gaps)};
  // Conservative windows around recent NBA seasons, not a forced exact match.
  // 2024-25 NBA had ~54% home wins, 25% games <=5 points, 21% decided by >=20.
  between(distribution.meanMargin,10,17,"mean absolute winning margin");
  between(distribution.scoreSd,9,22,"game-to-game team points variation");
  between(distribution.homeWinRate,.35,.73,"home win share");
  between(distribution.closeRate,.16,.35,"close-game frequency");
  between(distribution.blowoutRate,.11,.37,"20+ point blowout share");
  between(distribution.overtimeRate,0,.12,"overtime share");
  between(distribution.shotGapSd,3,19,"irregular shot time gaps");
  between(distribution.averageShotGap,8,24,"shot-to-shot clock gaps");

  const fixture=games[0]!;
  const fixtureTeam=fixture.homeTeamId;
  const volume=new Map<string,{points:number[],attempts:number[],minutes:number[]}>();
  for(let i=0;i<64;i++){
    const {box}=simulateGame(fixture,league.teams,league.players,310000+i,undefined,league.settings);
    for(const p of box.players.filter(p=>p.teamId===fixtureTeam)){
      const d=volume.get(p.playerId)??{points:[],attempts:[],minutes:[]};
      d.points.push(p.points);d.attempts.push(p.fga);d.minutes.push(p.minutes);volume.set(p.playerId,d);
    }
  }
  const starters=[...volume.entries()].filter(([,v])=>mean(v.minutes)>20);
  assert.ok(starters.length>=4);
  const playerSd=mean(starters.map(([,v])=>sd(v.points)));
  const volumeSd=mean(starters.map(([,v])=>sd(v.attempts)));
  between(playerSd,3,12,"individual game scoring volatility");
  between(volumeSd,1,8,"individual shot volume volatility");
  assert.ok(starters.some(([,v])=>new Set(v.minutes).size>=3),"rotation minutes must respond to game context");
  mkdirSync("/tmp/franchise-calibration",{recursive:true});
  writeFileSync("/tmp/franchise-calibration/game-outcomes.json",JSON.stringify({distribution,playerSd,volumeSd,method:"320 historical-player games plus 64 repeated-seed fixture games; calibrated ranges not exact game prediction"},null,2));
  console.log("Game outcome and player-night realism "+JSON.stringify({distribution,playerSd,volumeSd}));
  console.log("Variable game clocks, outcome spread, minutes, and player-night variance passed.");
}
main().catch(err=>{console.error(err);process.exitCode=1;});

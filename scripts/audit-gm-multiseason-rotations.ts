/**
 * Three complete 30-team regular-season simulation cohorts (3 x 1,230 games).
 * Fresh seeded leagues are used so cohort effects are separated from offseason
 * trades/progression; this is NOT a continuous three-year franchise save.
 *
 * Run: npx tsx scripts/audit-gm-multiseason-rotations.ts
 * Writes artifacts/franchise-rotation-audit.json and .md.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { ensureNbaCup, gameCounts } from "../src/gm/engine/cup";
import { simulateGame, actualShiftSnapshot } from "../src/gm/engine/simulate";
import { rotationForTeam } from "../src/gm/engine/coaching";
import { overallOf } from "../src/gm/engine/lineup";
import { assignFive, roleFit } from "../src/gm/engine/rotation-roles";
import type { GmPlayer } from "../src/gm/types";

type Totals = {
  team: string; season: number; games: number; playerGames: number;
  planned: number; actual: number; absoluteError: number; errorSquared: number;
  overSix: number; rankPairs: number; rankInversions: number;
  substitutions: number; subTransitions: number; emergencySeatMinutes: number;
  coverageSeatMinutes: number; activeSeatMinutes: number;
  injuredAppearances: number; minuteFailures: number; stintFailures: number;
  positionFailures: number; shiftFailures: number; injuredStarterGames: number;
  injuredReplacementGames: number; injuredReplacementFailures: number;
  plannedEmergencySeatMinutes: number; avoidableAssignmentMinutes: number;
  unavoidableOnFloorMinutes: number;
  emergencyBySeat: Record<string,number>; emergencyByPair: Record<string,number>;
};
const blank = (team:string,season:number): Totals => ({
  team,season,games:0,playerGames:0,planned:0,actual:0,absoluteError:0,
  errorSquared:0,overSix:0,rankPairs:0,rankInversions:0,substitutions:0,
  subTransitions:0,emergencySeatMinutes:0,coverageSeatMinutes:0,
  activeSeatMinutes:0,injuredAppearances:0,minuteFailures:0,stintFailures:0,
  positionFailures:0,shiftFailures:0,injuredStarterGames:0,
  injuredReplacementGames:0,injuredReplacementFailures:0,
  plannedEmergencySeatMinutes:0,avoidableAssignmentMinutes:0,unavoidableOnFloorMinutes:0,
  emergencyBySeat:{},emergencyByPair:{},
});
const add = (a:Totals,b:Totals) => {
  for(const key of Object.keys(a) as (keyof Totals)[]){
    if(key==="team"||key==="season")continue;
    if(key==="emergencyBySeat"||key==="emergencyByPair") {
      for(const [label,minutes] of Object.entries(b[key])) a[key][label]=(a[key][label]??0)+minutes;
      continue;
    }
    (a[key] as number)+=b[key] as number;
  }
};
const summary = (t:Totals) => ({
  team:t.team,season:t.season,games:t.games,
  meanAbsMinuteError: +(t.absoluteError/Math.max(1,t.playerGames)).toFixed(3),
  minuteRmse:+Math.sqrt(t.errorSquared/Math.max(1,t.playerGames)).toFixed(3),
  pctPlayerGamesOverSix:+(100*t.overSix/Math.max(1,t.playerGames)).toFixed(2),
  qualityRankInversionPct:+(100*t.rankInversions/Math.max(1,t.rankPairs)).toFixed(2),
  substitutionsPerGame:+(t.substitutions/Math.max(1,t.games)).toFixed(2),
  emergencySeatMinutePct:+(100*t.emergencySeatMinutes/Math.max(1,t.activeSeatMinutes)).toFixed(2),
  usableSeatMinutePct:+(100*t.coverageSeatMinutes/Math.max(1,t.activeSeatMinutes)).toFixed(2),
  plannedEmergencySeatPct:+(100*t.plannedEmergencySeatMinutes/Math.max(1,t.games*240)).toFixed(2),
  avoidableAssignmentPct:+(100*t.avoidableAssignmentMinutes/Math.max(1,t.games*240)).toFixed(2),
  unavoidableOnFloorPct:+(100*t.unavoidableOnFloorMinutes/Math.max(1,t.games*240)).toFixed(2),
  emergencyBySeat:Object.fromEntries(Object.entries(t.emergencyBySeat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,+v.toFixed(1)])),
  emergencyByPair:Object.fromEntries(Object.entries(t.emergencyByPair).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>[k,+v.toFixed(1)])),
  injuredStarterGames:t.injuredStarterGames,
  injuredReplacementFailures:t.injuredReplacementFailures,
  minuteFailures:t.minuteFailures,stintFailures:t.stintFailures,
  positionFailures:t.positionFailures,shiftFailures:t.shiftFailures,
  injuredAppearances:t.injuredAppearances,
});
const seasons=[2027,2028,2029];
const results:Totals[]=[];
let totalGames=0,failedGames=0;
const errors:string[]=[];
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
for(const season of seasons){
  let league=ensureNbaCup(createGeneratedLeague({userTeamId:"bos",season,seed:season*17+23}));
  assert.equal(league.teams.length,30,"requires thirty teams");
  assert.equal(league.schedule.filter(gameCounts).length,1200,"initial published schedule has 80 games per team");
  const teams=new Map(league.teams.map(t=>[t.id,t]));
  const byTeam=new Map(league.teams.map(t=>[t.id,blank(t.id,season)]));
  const counts=new Map<string,number>();
  let gameIndex=0;
  // Cup knockout and makeup games are generated only after group results exist.
  while(true){
    const pending=league.schedule.filter(g=>!g.played).sort((a,b)=>a.day-b.day||a.id.localeCompare(b.id));
    if(!pending.length)break;
    const slate=pending.filter(g=>g.day===pending[0]!.day);
    for(const game of slate){
      const countsForStandings=gameCounts(game);
      if(countsForStandings)for(const id of [game.homeTeamId,game.awayTeamId]) counts.set(id,(counts.get(id)??0)+1);
    // Independently inject an injury into a healthy starting player in
    // approximately one of every 19 games. No save mutation across games.
    const inject=countsForStandings&&gameIndex%19===0;
    const injuredTeam=teams.get(game.homeTeamId)!;
    const injuredId=inject?Object.values(injuredTeam.starters).find((id):id is string=>Boolean(id)):null;
    const players=injuredId?league.players.map(p=>p.id===injuredId
      ? {...p,injury:{type:"Audit scratch",gamesRemaining:2,reinjuryRisk:0} as NonNullable<GmPlayer["injury"]>}
      :p):league.players;
    const activeByTeam=new Map<string,GmPlayer[]>([
      [game.homeTeamId,players.filter(p=>p.teamId===game.homeTeamId)],
      [game.awayTeamId,players.filter(p=>p.teamId===game.awayTeamId)],
    ]);
    try{
      const simulated=simulateGame(game,league.teams,players,500000+season*1300+gameIndex);
      const box=simulated.box;
      if(countsForStandings)totalGames++;
      for(const teamId of [game.homeTeamId,game.awayTeamId]){
        const team=teams.get(teamId)!;
        const total=byTeam.get(teamId)!;
        if(countsForStandings)total.games++;
        const members=activeByTeam.get(teamId)!;
        const plan=rotationForTeam(team,players);
        const lines=box.players.filter(p=>p.teamId===teamId);
        const rosterById=new Map(members.map(p=>[p.id,p]));
        for(const frame of plan.frames){
          const floor=Object.values(frame).map(id=>rosterById.get(id??"")).filter((p):p is GmPlayer=>!!p);
          if(floor.length!==5)continue;
          const best=assignFive(floor).starters;
          const emergency=(seats:typeof frame)=>Object.entries(seats).filter(([spot,id])=>{
            const player=rosterById.get(id??"");
            return !!player && roleFit(player,spot as GmPlayer["position"])<0.8;
          }).length*2;
          const actual=emergency(frame),optimal=emergency(best);
          total.plannedEmergencySeatMinutes+=actual;
          total.avoidableAssignmentMinutes+=Math.max(0,actual-optimal);
          total.unavoidableOnFloorMinutes+=optimal;
        }
        const lineById=new Map(lines.map(p=>[p.playerId,p]));
        const minutes=sum(lines.map(p=>p.minutes));
        const expected=240+25*(box.overtime??0);
        if(Math.abs(minutes-expected)>0.01)total.minuteFailures++;
        const injured=members.filter(p=>p.injury&&p.injury.gamesRemaining>0);
        total.injuredAppearances+=lines.filter(l=>injured.some(p=>p.id===l.playerId)).length;
        if(injuredId&&teamId===injuredTeam.id){
          total.injuredStarterGames++;
          if(!plan.openingIds.has(injuredId)&&!lineById.has(injuredId))total.injuredReplacementGames++;
          else total.injuredReplacementFailures++;
        }
        for(const member of members){
          const planned=plan.minutes[member.id]??0;
          const actual=lineById.get(member.id)?.minutes??0;
          // Compare regulation-only minutes: box includes extra 5-minute periods.
          // In OT games the per-player minutes error is not directly comparable.
          if(box.overtime)continue;
          const diff=actual-planned;
          total.playerGames++;
          total.planned+=planned;total.actual+=actual;
          total.absoluteError+=Math.abs(diff);
          total.errorSquared+=diff*diff;
          if(Math.abs(diff)>6)total.overSix++;
        }
        const available=members.filter(p=>!p.injury||p.injury.gamesRemaining<=0);
        const qualified=available.filter(p=>(plan.minutes[p.id]??0)>0);
        for(let i=0;i<qualified.length;i++)for(let j=i+1;j<qualified.length;j++){
          const a=qualified[i]!,b=qualified[j]!;
          const d=overallOf(a)-overallOf(b);
          if(Math.abs(d)<8)continue;
          total.rankPairs++;
          const gap=(lineById.get(a.id)?.minutes??0)-(lineById.get(b.id)?.minutes??0);
          if(d*gap<0)total.rankInversions++;
        }
        const side=box.homeTeamId===teamId?"home":"away";
        const shifts=actualShiftSnapshot(box,teamId);
        for(let slot=0;slot<24;slot++){
          const stint=box.stints?.[slot];
          if(!stint){total.stintFailures++;continue;}
          const ids=stint[side];
          if(ids.length!==5||new Set(ids).size!==5)total.stintFailures++;
          const chartIds=shifts.filter(r=>r.on[slot]).map(r=>r.playerId);
          if(chartIds.length!==5||chartIds.some(id=>!ids.includes(id)))total.shiftFailures++;
          if(slot>0){
            total.subTransitions++;
            const last=new Set(box.stints![slot-1]![side]);
            total.substitutions+=ids.filter(id=>!last.has(id)).length;
          }
        }
        for(const line of lines){
          const seated=sum(Object.values(line.positionMinutes??{}).map(v=>v??0));
          if(Math.abs(seated-line.minutes)>0.01)total.positionFailures++;
          const player=members.find(p=>p.id===line.playerId);
          if(!player)continue;
          for(const [seat,m] of Object.entries(line.positionMinutes??{})){
            const minutes=Number(m??0);
            const fit=roleFit(player,seat as GmPlayer["position"]);
            total.activeSeatMinutes+=minutes;
            if(fit>=0.84)total.coverageSeatMinutes+=minutes;
            if(fit<0.80){
              total.emergencySeatMinutes+=minutes;
              total.emergencyBySeat[seat]=(total.emergencyBySeat[seat]??0)+minutes;
              const pair=`${player.position}->${seat}`;
              total.emergencyByPair[pair]=(total.emergencyByPair[pair]??0)+minutes;
            }
          }
        }
      }
      league={...league,schedule:league.schedule.map(g=>g.id===game.id?simulated.game:g)};
    }catch(e){
      failedGames++;
      league={...league,schedule:league.schedule.map(g=>g.id===game.id?{...g,played:true,homeScore:0,awayScore:1}:g)};
      errors.push(`${season} ${game.id}: ${e instanceof Error?e.message:String(e)}`);
      if(errors.length>30)break;
    }
    gameIndex++;
    }
    if(errors.length>30)break;
    league=ensureNbaCup(league);
  }
  for(const team of league.teams){
    const n=counts.get(team.id)??0;
    if(n!==82)errors.push(`${season} ${team.id}: ${n} standings games, expected 82`);
  }
  for(const x of byTeam.values())results.push(x);
  console.log(`Simulated ${season}: ${[...counts.values()].reduce((n,v)=>n+v,0)/2} standings games across ${byTeam.size} teams`);
}
const aggregate=blank("ALL",0);for(const row of results)add(aggregate,row);
const report={
  methodology:"Three independent seeded full 82-game regular seasons, with NBA Cup and makeup games added after group play (not consecutive franchise rollovers); injected starter injuries. Rank inversion compares actual box-score minutes among rotation players with >=8 OVR separation. Overtime excluded from minute-error denominator. Substitution count is changed players at two-minute transitions.",
  seasons,scheduledGames:3690,simulatedGames:totalGames,failedGames,
  aggregate:summary(aggregate),
  perSeason:seasons.map(season=>{const v=blank("ALL",season);for(const r of results.filter(x=>x.season===season))add(v,r);return summary(v);}),
  perTeamSeason:results.map(summary),
  errors,
};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/franchise-rotation-audit.json",JSON.stringify(report,null,2)+"\n");
const metrics=report.perTeamSeason.map(r=>`| ${r.season} | ${r.team} | ${r.meanAbsMinuteError} | ${r.qualityRankInversionPct}% | ${r.substitutionsPerGame} | ${r.emergencySeatMinutePct}% | ${r.injuredReplacementFailures} |`).join("\n");
writeFileSync("artifacts/franchise-rotation-audit.md",`# Franchise Lab rotation audit

${report.methodology}

Games simulated: ${totalGames} / 3690; failures: ${failedGames}.

## Aggregate
\`\`\`json
${JSON.stringify(report.aggregate,null,2)}
\`\`\`

## Per team and season
| Season | Team | Minute MAE | Rank inversions | Substitutions/game | Emergency position minutes | Injury replacement failures |
|---|---|---:|---:|---:|---:|---:|
${metrics}
`);
console.log(JSON.stringify({aggregate:report.aggregate,failedGames,firstErrors:errors.slice(0,5)},null,2));
assert.equal(failedGames,0,"Every full-schedule game must simulate");
assert.equal(totalGames,3690,"Expected 3 x 1,230 standings games, including Cup and makeup games");
assert.ok(errors.length===0,errors.slice(0,5).join("\n"));
assert.equal(aggregate.minuteFailures,0,"Every team's box must reconcile to regulation plus OT");
assert.equal(aggregate.stintFailures,0,"Every regulation block has five distinct players");
assert.equal(aggregate.positionFailures,0,"All player minutes must be assigned a position");
assert.equal(aggregate.shiftFailures,0,"Postgame chart must match recorded stints");
assert.equal(aggregate.injuredAppearances,0,"Injured players cannot appear");
assert.equal(aggregate.injuredReplacementFailures,0,"Injured starters must be replaced");

const emergencyShare=aggregate.emergencySeatMinutes/Math.max(1,aggregate.activeSeatMinutes);
const avoidableShare=aggregate.avoidableAssignmentMinutes/Math.max(1,aggregate.games*240);
const qualityInversions=aggregate.rankInversions/Math.max(1,aggregate.rankPairs);
const minuteMae=aggregate.absoluteError/Math.max(1,aggregate.playerGames);
// Broad guardrails prevent a future positional-coverage regression without
// demanding rigid five-position quota rotations or exact clock-level parity.
assert.ok(emergencyShare<0.018,`Emergency seat share regressed: ${(emergencyShare*100).toFixed(2)}%`);
assert.ok(avoidableShare<0.002,`Avoidable automatic seat assignments regressed: ${(avoidableShare*100).toFixed(2)}%`);
assert.ok(qualityInversions<0.025,`Merit-first minute rankings regressed: ${(qualityInversions*100).toFixed(2)}%`);
assert.ok(minuteMae<1.4,`Planned-versus-actual minutes regressed: ${minuteMae.toFixed(2)} MAE`);


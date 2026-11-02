import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { draftRead, draftSleeperSignals, draftScoutingOf, marketBoard, sleeperRadar, studyProspect } from "../src/gm/engine/draft-intel";
import { autoPickScoutingFocus } from "../src/gm/engine/scouting-focus";

let hiddenHigh=0, radarHigh=0, lateRadar=0, classesWithLate=0;
for(let seed=1;seed<=36;seed++){
  const league=createGeneratedLeague({userTeamId:"bos",season:2028,seed:seed*521});
  const board=marketBoard(league);
  const late=board.filter(p=>(p.consensusRank??0)>=30 && league.draftPool.includes(p.id));
  const radar=sleeperRadar(league,7);
  assert.equal(new Set(radar.map(p=>p.id)).size,radar.length);
  assert.ok(radar.every(p=>(p.consensusRank??0)>=22));
  assert.ok(radar.filter(p=>(p.consensusRank??0)>=31).length>=2,"radar reserves space for actual second-round picks");
  const hidden=late.filter(p=>(p.sheet?.potential.ceiling??0)>=85 && p.ratings.potential>=7.5);
  hiddenHigh+=hidden.length;
  classesWithLate+=Number(hidden.length>0);
  radarHigh+=radar.filter(p=>hidden.some(h=>h.id===p.id)).length;
  lateRadar+=radar.filter(p=>(p.consensusRank??0)>=30).length;
  assert.ok(radar.every(p=>draftSleeperSignals(p).reasons.length>0),"show real public evidence in late-value shortlist");
  if(seed===1){
    const candidate=radar[0]!;
    const before=draftRead(league,candidate);
    const signal=draftSleeperSignals(candidate);
    const changed={...candidate,ratings:{...candidate.ratings,potential:0},sheet:{...candidate.sheet!,potential:{...candidate.sheet!.potential,ceiling:99,trait:"xfactor" as const,path:"boom" as const}}};
    const alternate={...league,players:league.players.map(p=>p.id===candidate.id?changed:p)};
    assert.deepEqual(draftSleeperSignals(candidate),draftSleeperSignals(changed),"radar cannot inspect hidden growth or dev trait");
    assert.deepEqual(sleeperRadar(alternate).map(p=>p.id),radar.map(p=>p.id),"hidden growth cannot reorder recommendations");
    assert.deepEqual(draftRead(alternate,changed),before,"unscouted recommendations cannot read hidden potential");
    const scouted=studyProspect(league,candidate.id,"film",signal.focus);
    assert.equal(scouted.ok,true);
    assert.equal(draftScoutingOf(scouted.state).spent,1);
    const seen=scouted.state.players.find(p=>p.id===candidate.id)!;
    assert.ok((seen.scoutProfile?.confidence??0)>(candidate.scoutProfile?.confidence??0),"one click must meaningfully improve the report");
    assert.ok(Object.keys(draftScoutingOf(scouted.state).reports[candidate.id]!.studies).length===1);
    assert.equal(studyProspect(scouted.state,candidate.id,"film",signal.focus).ok,false,"cannot re-roll scout intel");
    assert.deepEqual(scouted.state.players.find(p=>p.id===candidate.id)?.sheet,candidate.sheet,"scouting cannot create player talent");
    const autos=autoPickScoutingFocus(league);
    assert.ok(autos.playerIds.some(id=>(league.players.find(p=>p.id===id)?.consensusRank??0)>=31),"automated scouts must evaluate second-round candidates");
    assert.equal(league.automation?.autoScout,true);
  }
}
const report={classes:36,highPotentialSecondRounders:hiddenHigh,classesWithLateCandidates:classesWithLate,radarHigh,lateRadar};
console.log("Simplified draft sleeper calibration: "+JSON.stringify(report));
assert.ok(hiddenHigh>=35,"late-round hidden growth candidates must exist often enough to find");
assert.ok(classesWithLate>=25,"late-round upside should exist across most draft classes");
assert.ok(radarHigh>0,"radar should occasionally surface a real late-round growth prospect");
console.log("Draft accessibility, public-evidence scouting and sleeper opportunity tests passed.");

import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { drawDraftLottery, computeLotteryOrder } from "../src/gm/engine/standings";
import { createPlayInBoard } from "../src/gm/engine/play-in";
import { applyCombine } from "../src/gm/engine/scouting";
import { athleticTools } from "../src/gm/engine/combine-evaluation";
import { badgeCap, badgeLevel } from "../src/gm/engine/badges";
import { askingSalary, credibleFreeAgentSalaryFloor } from "../src/gm/engine/free-agency-ask";
import { advanceFaDayDetailed, emptyFaMarket, runFaPeriod } from "../src/gm/engine/free-agency";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

const fresh = (season: number, seed: number) =>
  prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season, seed }));
const modern = fresh(2028, 417);
const lotteryBase = { ...modern, playIn: createPlayInBoard(modern) ?? undefined };
const result = drawDraftLottery(lotteryBase);
assert.equal(result.format, "321");
assert.equal(result.lotteryCount, 16);
assert.equal(new Set(result.order).size, modern.teams.length);
assert.equal(result.order.length, modern.teams.length);
assert.equal(result.draws.length, 16);
assert.deepEqual(drawDraftLottery(lotteryBase), result, "same save and standings cannot re-roll lottery");
assert.deepEqual(computeLotteryOrder(lotteryBase), result.order);
assert.ok(result.draws.every(d=>d.startingRank>=1 && d.startingRank<=16));
const bottomThree = [...result.draws].filter(d=>d.startingRank<=3);
assert.ok(bottomThree.every(d=>result.order.indexOf(d.teamId)<12),
  "3-2-1 lottery protects the three relegated teams from picks 13–16");
const hist = drawDraftLottery(fresh(2026, 413));
assert.equal(hist.format,"classic");
assert.equal(hist.draws.length,4);
assert.equal(hist.lotteryCount,14);
assert.equal(new Set(hist.order).size,30);
assert.deepEqual(drawDraftLottery(fresh(2026,413)),hist);
let champions=0, jumps=0;
for(let seed=1;seed<=50;seed++){
  const sample = fresh(2028, seed*17);
  const roll = drawDraftLottery({...sample,playIn:createPlayInBoard(sample)??undefined});
  assert.equal(roll.order.length,30);
  assert.equal(new Set(roll.order).size,30);
  champions += Number(roll.draws[0]!.startingRank>1);
  jumps += roll.draws.filter((d,i)=>d.startingRank>i+3).length;
}
assert.ok(champions>=3, "lottery can reward teams outside the worst-ranked team");
assert.ok(jumps>=8, "meaningful draft jumps must occur, not fixed reverse standings");

// Combine reveals measures and allows specific athletic badge lanes without
// creating a hidden predetermined superstar development path.
const rookie = modern.players.find(p=>modern.draftPool.includes(p.id) && p.scoutProfile && p.sheet)!;
assert.ok(rookie);
const before = JSON.stringify(rookie.sheet);
const tested = applyCombine(rookie);
assert.ok(tested.scoutProfile?.combine);
assert.equal(JSON.stringify(tested.sheet),before,"combine cannot silently change OVR or attributes");
assert.equal(applyCombine(tested).scoutProfile?.combine?.sprint,tested.scoutProfile?.combine?.sprint);
assert.ok(tested.scoutProfile!.combine!.verticalIn>=24);
assert.ok(tested.scoutProfile!.combine!.laneAgility!>0);
const athletic = {
  ...rookie, sheet:{...rookie.sheet!,attributes:{...rookie.sheet!.attributes,
    speed:94,vertical:96,agility:94,speedWithBall:91,
    drivingDunk:96,block:92}},
  badges:{version:2 as const,xp:{}},
};
assert.equal(athleticTools(athletic).leaping,true);
assert.ok(badgeCap(athletic,"aerial_assault")>0);
assert.ok(badgeCap(athletic,"explosive_first_step")>0);
assert.ok(badgeCap(athletic,"chase_down")>0);
assert.equal(badgeLevel(athletic,"aerial_assault"),0,"must earn badge through games");
const slow = {...athletic,sheet:{...athletic.sheet!,attributes:{
  ...athletic.sheet!.attributes,speed:62,vertical:57,agility:60}}};
assert.equal(badgeCap(slow,"aerial_assault"),0);
assert.equal(badgeCap(slow,"explosive_first_step"),0);

// User-visible asking price must decay smoothly after the first market week,
// yet premium players cannot slide to minimum contracts.
const team = modern.teams.find(t=>t.id!=="bos")!;
const oldStar = modern.players.find(p=>p.teamId===team.id && p.contract && p.sheet)!;
const star: GmPlayer = {...oldStar,id:"test-unsigned-superstar",age:28,
  sheet:{...oldStar.sheet!,overall:92},
  teamId:null,contract:null,rightsTeamId:team.id,rightsKind:"bird",lastSalaryM:35};
let market: GmLeagueState = {...modern,phase:"free_agency",financialSeason:2029,
  players:[...modern.players,star],freeAgents:[...modern.freeAgents,star.id],
  faMarket:{...emptyFaMarket(8121),stage:"open",day:2}};
const baseAsk=askingSalary(star,market);
const prices=[2,6,7,10,13,16,19].map(day=>askingSalary(star,{
  ...market,faMarket:{...market.faMarket!,day}}));
assert.ok(prices[0]===prices[1]);
assert.ok(prices[2]<=prices[1] && prices.at(-1)!<prices[0]);
for(let i=1;i<prices.length;i++)assert.ok(prices[i]<=prices[i-1],
  "unsigned demand cannot bounce upwards as free agency drags on");
const late={...market,faMarket:{...market.faMarket!,day:19}};
assert.ok(credibleFreeAgentSalaryFloor(star,late)>=baseAsk*.72,
  "elite players keep a meaningful market salary floor");
assert.ok(credibleFreeAgentSalaryFloor(star,late)>modern.settings.salaryCapM*.15);
const rfa = {...star,rightsKind:"restricted" as const};
assert.ok(credibleFreeAgentSalaryFloor(rfa,late)>0);

// A full 15-man in-season roster must NOT block a Bird-rights signing in July.
// Re-signing day: the original team should compete for its own elite star.
market={...market,faMarket:{...emptyFaMarket(52),stage:"re_signing",day:0},
  players:modern.players.map(p=>p.id===oldStar.id ? star : p),
  freeAgents:[...modern.freeAgents,star.id]};
const incumbent=modern.teams.find(t=>t.id===team.id)!;
const rosterBefore=market.players.filter(p=>p.teamId===team.id).length;
assert.ok(rosterBefore>=10);
const birdOffer=advanceFaDayDetailed(market).state.faMarket?.agreements.find(a=>a.playerId===star.id);
assert.ok(birdOffer,"CPU must actively pursue and agree with its own 92 OVR Bird-rights star");
assert.equal(birdOffer!.teamId,team.id);
assert.ok(birdOffer!.salaryM>=askingSalary(star,market)*.9,
  "no elite talent signs at a wildly discounted early Bird rate");
const signed=runFaPeriod({...market,faMarket:{...emptyFaMarket(52),stage:"moratorium",day:0}},19);
const hired=signed.players.find(p=>p.id===star.id);
assert.ok(hired?.teamId != null || signed.faMarket?.pending.some(o=>o.playerId===star.id),
  "a legal elite Bird player should not vanish without a realistic bid");
const reloaded=parseFranchise(exportFranchise({...late,lotteryOrder:result.order,
  lotteryDraws:result.draws,lotteryCount:result.lotteryCount,lotteryFormat:result.format,
  combineDone:true,players:late.players.map(p=>p.id===rookie.id?tested:p)}));
assert.deepEqual(reloaded.lotteryDraws,result.draws,"lottery results persist across reload");
assert.ok(reloaded.players.find(p=>p.id===rookie.id)?.scoutProfile?.combine?.sprint,
  "combine test times survive save/reload");

console.log("2027 weighted lottery, staged-reveal inputs, deterministic saves, combine athletic badges, Bird retention, and salary-market decline passed.");

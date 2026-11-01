import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { BADGES, BADGE_XP, BADGE_REQUIREMENTS, badgeCap, badgeEarned, badgeLevel, badgeEffects, ensureBadges, recordBadgeGame, recordBadgeBox } from "../src/gm/engine/badges";
import { simulateGame } from "../src/gm/engine/simulate";
import { stepDay } from "../src/gm/engine/pace";
import type { PlayByPlayEvent } from "../src/data/types/play-by-play";
import type { GmBoxScore, GmPlayer } from "../src/gm/types";

const seed = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 12 });
const league = prepareFranchise(seed);
const sample = league.players.find(p => p.teamId === "bos")!;
const attributes = Object.fromEntries(Object.keys(sample.sheet!.attributes).map(k => [k,99])) as NonNullable<GmPlayer["sheet"]>["attributes"];
const player: GmPlayer = { ...sample, age: 21, badges: { version: 1, xp: {} }, sheet: { ...sample.sheet!, attributes } };
const line = { playerId: player.id, playerName: player.name, teamId: "bos", minutes: 32, points: 32, fgm: 12, fga: 20, tpm: 5, tpa: 9, ftm: 3, fta: 4, assists: 8, rebounds: 10, steals: 3, blocks: 2, turnovers: 2, plusMinus: 5, trueShootingPct: 0.6, usagePct: 0.25, gameScore: 22 };
const box: GmBoxScore = { id: "badge-box", gameId: "badge-game", season: 2027, day: 1, homeTeamId: "bos", awayTeamId: "nyk", homeScore: 108, awayScore: 101, possessions: 100, players: [line, { ...line, playerId: "opponent", teamId: "nyk", fgm: 8 }] };
assert.deepEqual(prepareFranchise(league).players.map(p => p.badges), league.players.map(p => p.badges), "migration runs once");
for (const p of seed.players.filter(p => p.sheet)) assert.deepEqual(league.players.find(q=>q.id===p.id)!.sheet!.attributes,p.sheet!.attributes);
const rookie = ensureBadges({ ...player, badges: undefined });
assert.ok(Object.values(rookie.badges!.xp).length <= 1);
assert.ok(Object.values(rookie.badges!.xp).every(xp => xp <= 120));
const veteran = ensureBadges({ ...player, age: 30, badges: undefined });
assert.equal(Object.keys(veteran.badges!.xp).length, 3);
assert.ok(Object.values(veteran.badges!.xp).every(xp => xp <= 900));
const changedPotential = ensureBadges({ ...player, badges: undefined, sheet: { ...player.sheet!, potential: { ...player.sheet!.potential, ceiling: 50 } } });
assert.deepEqual(changedPotential.badges,rookie.badges, "badges do not reveal or depend on hidden potential");
for (const b of BADGES) for (let rank = 1; rank <= 5; rank++) {
  const attrs = Object.fromEntries(Object.keys(attributes).map(k => [k,BADGE_REQUIREMENTS[rank]!])) as typeof attributes;
  const at = { ...player, sheet: { ...player.sheet!, attributes:attrs }, badges: { version: 1 as const, xp: { [b.id]: BADGE_XP[rank]! } } };
  assert.equal(badgeCap(at,b.id),rank);
  assert.equal(badgeLevel(at,b.id),rank);
  assert.equal(badgeLevel({ ...at,badges:{version:1,xp:{[b.id]:BADGE_XP[rank]!-1}} },b.id),rank-1);
}
const first = recordBadgeGame(player,box,[player]);
assert.equal(first.badges!.xp.deep_range,20);
assert.equal(recordBadgeGame(first,box,[first]),first, "same game cannot award XP twice");
const secondBox = { ...box,gameId:"second" };
const second = recordBadgeGame(first,secondBox,[first]);
assert.equal(recordBadgeGame(second,box,[second]),second, "nonconsecutive duplicate is blocked");
assert.equal(recordBadgeGame(first,{...box,players:[]},[first]),first, "DNP earns nothing");
const focused = recordBadgeGame({...player,badgeFocus:"deep_range"},box,[player]);
assert.equal(focused.badges!.xp.deep_range,25);
const clutchEvent = (scoreHome: number) => ({ playerId: player.id, isFieldGoal:true, shotResult:"Made", period:4, clockSeconds:120, scoreHome, scoreAway:100, points:3 }) as PlayByPlayEvent;
const clutchPlayer = {...player,badgeFocus:"deep_range" as const};
const clutchBox = {...box,events:[clutchEvent(112),clutchEvent(91),{...clutchEvent(105),clockSeconds:300}]};
assert.equal(recordBadgeGame(clutchPlayer,clutchBox,[clutchPlayer]).badges!.xp.clutch_scorer,6,"clutch evidence uses the pre-shot score and the late-game window");
let bronzeOnly: GmPlayer = {...player,sheet:{...player.sheet!,attributes:{...attributes,threePoint:70}}};
for(let i=0;i<60;i++) bronzeOnly=recordBadgeGame(bronzeOnly,{...box,gameId:`bronze-${i}`},[bronzeOnly]);
assert.equal(bronzeOnly.badges!.xp.deep_range,120,"current eligibility limits stored XP");

const vet = { ...veteran,id:"badge-mentor",position:player.position,age:32,badges:{version:1 as const,xp:{deep_range:900}} };
const student = {...player,badgeFocus:"deep_range" as const,mentorship:{mentorId:vet.id,teamId:player.teamId!,season:2027,sharedGames:0}};
assert.equal(recordBadgeGame(student,box,[student,vet]).badges!.xp.deep_range,27);
assert.equal(recordBadgeGame(student,box,[student,{...vet,teamId:"nyk"}]).badges!.xp.deep_range,25);
const aged = { ...player,sheet:{...player.sheet!,attributes:{...attributes,threePoint:70}},badges:{version:1 as const,xp:{deep_range:3200}} };
assert.equal(badgeEarned(aged,"deep_range"),5);
assert.equal(badgeLevel(aged,"deep_range"),1, "current attributes bound active effects while XP is kept");
assert.equal(recordBadgeGame(aged,box,[aged]).badges!.xp.deep_range,3200);
const weak = {...player,sheet:{...player.sheet!,attributes:{...attributes,threePoint:64}}};
assert.equal(recordBadgeGame(weak,box,[weak]).badges!.xp.deep_range,undefined, "cannot bank XP for ineligible skills");
assert.deepEqual(recordBadgeGame(player,{...box,postseason:"playoffs"},[player]).badges,first.badges, "postseason follows the same XP rules");

// Earn across three seasons, reload midseason, change teams, and replay prior-year boxes.
let journey = player;
for (const season of [2027,2028,2029]) for (let day=0;day<82;day++) {
  journey = recordBadgeGame(journey,{...box,season,day,gameId:`${season}-${day}`},[journey]);
  if (day===40) journey = JSON.parse(JSON.stringify({...journey,teamId:"nyk"}));
}
assert.equal(badgeLevel(journey,"deep_range"),5);
assert.ok(Object.values(journey.badges!.xp).every(xp => xp <= 3200));
assert.equal(recordBadgeGame(journey,box,[journey]),journey, "old-season replays cannot bypass the ledger");
assert.equal(journey.badges!.gameIds!.length,82, "ledger only retains the current season");
const reloaded = parseFranchise(exportFranchise({...league,players:league.players.map(p=>p.id===player.id?journey:p)}));
assert.deepEqual(reloaded.players.find(p=>p.id===player.id)!.badges,journey.badges);
assert.deepEqual(journey.sheet,player.sheet, "no overall or potential inflation from badge progress");

// An actual daily game awards both teams, with identical output after a save/reload.
const match = {...seed.schedule[0]!,id:"badge-integration",day:0,span:0.25};
const ready = {...league,day:0,schedule:[match],settings:{...league.settings,injuryFrequency:0}};
const a=stepDay(ready).league, b=stepDay(JSON.parse(JSON.stringify(ready))).league;
assert.deepEqual(a.players.map(p=>p.badges),b.players.map(p=>p.badges));
const played = a.players.filter(p=>p.badges?.gameIds?.includes(match.id));
assert.ok(played.some(p=>p.teamId===match.homeTeamId));
assert.ok(played.some(p=>p.teamId===match.awayTeamId));
const pool = seed.players.filter(p=>p.teamId).slice(0,10);
const exhibition = {...match,id:"badge-allstar",homeTeamId:"as-home",awayTeamId:"as-away",exhibition:"allstar" as const,squad:[pool.slice(0,5).map(p=>p.id),pool.slice(5).map(p=>p.id)] as [string[],string[]]};
const allstar = stepDay({...ready,schedule:[exhibition]}).league;
assert.equal(allstar.players.some(p=>p.badges?.gameIds?.includes(exhibition.id)),false);

// Prove badges reach the possession engine, not only the UI or postgame ledger.
const teams=seed.teams.filter(t=>[match.homeTeamId,match.awayTeamId].includes(t.id));
const active = league.players.filter(p=>teams.some(t=>t.id===p.teamId));
const empty = active.map(p=>({...p,badges:{version:1 as const,xp:{}}}));
const boosted = empty.map(p=>p.teamId===match.homeTeamId ? {...p,sheet:{...p.sheet!,attributes:{...p.sheet!.attributes,threePoint:99}},badges:{version:1 as const,xp:{deep_range:3200}}}:p);
const control = boosted.map(p=>({...p,badges:{version:1 as const,xp:{}}}));
let changed=0;
for(let i=0;i<30;i++) {
  const game={...match,id:`badge-effect-${i}`,span:1};
  const withBadge=simulateGame(game,teams,boosted,800+i).box;
  const without=simulateGame(game,teams,control,800+i).box;
  if(JSON.stringify(withBadge.players)!==JSON.stringify(without.players))changed++;
  assert.equal(withBadge.homeScore,withBadge.players.filter(p=>p.teamId===match.homeTeamId).reduce((n,p)=>n+p.points,0));
}
assert.ok(changed>10, "badge accuracy bonus changes actual simulated possessions");
const maxed={...player,badges:{version:1 as const,xp:Object.fromEntries(BADGES.map(b=>[b.id,3200]))}};
const effects=badgeEffects(maxed);
assert.equal(effects.three,0.015);assert.equal(effects.two,0.015);assert.equal(effects.defense,0.005);
assert.equal(effects.tov,0.94);assert.equal(effects.reb,1.125);
assert.deepEqual(recordBadgeBox([player],box)[0]!.badges,first.badges);
console.log("Badges passed: five levels, skill gates, signature migration, focus/mentor XP, replay guards, three seasons, save/reload, CPU parity, exhibitions, and possession effects.");

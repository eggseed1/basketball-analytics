import type { GmScheduleGame, GmTeam } from "@/gm/types";
import { createRng } from "@/gm/engine/rng";

/**
 * A new 80-game NBA schedule every season; the other two games are filled
 * dynamically by the NBA Cup after the group stage. No prior-season games
 * or tip dates are copied.
 *
 * Matchup matrix per team:
 *  4 x 4 division opponents, 4 x 4 other conference-division opponents,
 *  3 x 6 other conference-division opponents, 2 x 15 opposite-conference.
 * That is 16 + 16 + 18 + 30 = 80 games, 40 home and 40 road.
 *
 * Dates avoid four-in-five, three consecutive nights and Cup knockouts,
 * and preserve a February All-Star pause. Seeded scoring staggers teams,
 * back-to-backs, and geographically nearby road games.
 */
type Groups = { East: string[][]; West: string[][] };
type Fixture = { id: string; home: string; away: string; cup?: "group" };
const MILLIS_DAY = 86400000;
const cupNights = [[10,30],[11,6],[11,13],[11,20],[11,24],[11,25],[11,27]] as const;
const cupRoundDates = [
  [0,1,2,3,6], [0,1,2,4,6], [0,1,3,4,6],
  [0,2,3,4,6], [1,2,3,4,6], [0,1,2,3,5],
] as const;
const geo: Record<string,[number,number]> = {
  atl:[33.75,-84.39],bos:[42.36,-71.06],bkn:[40.68,-73.97],cha:[35.23,-80.84],
  chi:[41.88,-87.63],cle:[41.50,-81.69],dal:[32.78,-96.80],den:[39.74,-104.99],
  det:[42.33,-83.05],gsw:[37.77,-122.42],hou:[29.76,-95.37],ind:[39.77,-86.16],
  lac:[34.05,-118.24],lal:[34.05,-118.24],mem:[35.15,-90.05],mia:[25.76,-80.19],
  mil:[43.04,-87.91],min:[44.98,-93.27],nop:[29.95,-90.07],nyk:[40.71,-74.01],
  okc:[35.47,-97.52],orl:[28.54,-81.38],phi:[39.95,-75.16],phx:[33.45,-112.07],
  por:[45.52,-122.68],sac:[38.58,-121.49],sas:[29.42,-98.49],tor:[43.65,-79.38],
  uta:[40.76,-111.89],was:[38.91,-77.04],
};
const dayOf=(ms:number)=>new Date(ms).toISOString().slice(0,10);
const isoDate=(year:number,month:number,day:number)=>dayOf(Date.UTC(year,month-1,day));
const pairKey=(a:string,b:string)=>a<b?a+"|"+b:b+"|"+a;
const other=(pair:[string,string],id:string)=>pair[0]===id?pair[1]:pair[0];
const distance=(a:string,b:string)=>{
  const aa=geo[a],bb=geo[b];
  if(!aa||!bb)return 0;
  const dy=(aa[0]-bb[0])*69,dx=(aa[1]-bb[1])*55;
  return Math.hypot(dx,dy);
};

function cupFixtures(groups:Groups,season:number):Array<Fixture&{date:string}> {
  const all:Array<Fixture&{date:string}>=[];
  const rooms=[...groups.East,...groups.West];
  rooms.forEach((room,roomIndex)=>{
    if(room.length!==5||new Set(room).size!==5)throw new Error("NBA Cup requires six rooms of five");
    for(let round=0;round<5;round++){
      const night=cupRoundDates[roomIndex]![round]!;
      const [month,day]=cupNights[night]!;
      for(let step=1;step<=2;step++){
        const ai=(round+step)%5,bi=(round-step+5)%5;
        const forward=(bi-ai+5)%5<=2;
        const home=room[forward?ai:bi]!,away=room[forward?bi:ai]!;
        all.push({id:"future_cup_"+season+"_"+roomIndex+"_"+round+"_"+step,
          home,away,cup:"group",date:isoDate(season-1,month,day)});
      }
    }
  });
  return all;
}

function pairCounts(teams:GmTeam[],season:number,seed:number):Map<string,number>{
  const rng=createRng(seed*31+season*104729);
  const four=new Set<string>();
  // Every out-of-division team has exactly four four-game opponents:
  // two from each of the other two divisions.
  for(const conference of ["East","West"] as const){
    const divisions=[...new Set(teams.filter(t=>t.conference===conference).map(t=>t.division))].sort();
    if(divisions.length!==3)throw new Error("NBA schedule needs three divisions per conference");
    const members=divisions.map(div=>teams.filter(t=>t.conference===conference&&t.division===div)
      .map(t=>t.id).sort());
    if(members.some(m=>m.length!==5))throw new Error("NBA divisions require five teams");
    for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){
      const offset=Math.floor(rng()*5);
      for(let i=0;i<5;i++)for(const step of [0,1]){
        four.add(pairKey(members[a]![i]!,members[b]![(i+offset+step)%5]!));
      }
    }
  }
  const counts=new Map<string,number>();
  for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){
    const a=teams[i]!,b=teams[j]!;
    const key=pairKey(a.id,b.id);
    const n=a.conference!==b.conference?2
      :a.division===b.division||four.has(key)?4:3;
    counts.set(key,n);
  }
  return counts;
}

/** Orient every 3-game pairing so each team hosts three of its six odd sets. */
function oddHosts(pairs:Array<[string,string]>,seed:number):Set<string>{
  const rand=createRng(seed*127+199);
  const edges=pairs.map(([a,b])=>({a,b,order:rand()}));
  const adjacency=new Map<string,number[]>();
  edges.forEach(({a,b},index)=>{
    for(const id of [a,b])adjacency.set(id,[...(adjacency.get(id)??[]),index]);
  });
  for(const entries of adjacency.values())entries.sort((a,b)=>edges[a]!.order-edges[b]!.order);
  const seen=new Set<number>(),hosts=new Set<string>();
  for(const start of adjacency.keys()){
    if((adjacency.get(start)??[]).every(i=>seen.has(i)))continue;
    const stack=[start],walk:string[]=[];
    while(stack.length){
      const at=stack[stack.length-1]!;
      const entry=(adjacency.get(at)??[]).find(i=>!seen.has(i));
      if(entry===undefined){walk.push(stack.pop()!);continue;}
      seen.add(entry);
      const edge=edges[entry]!;
      stack.push(edge.a===at?edge.b:edge.a);
    }
    walk.reverse();
    for(let i=0;i+1<walk.length;i++)hosts.add(walk[i]+"|"+walk[i+1]);
  }
  return hosts;
}

function allFixtures(teams:GmTeam[],season:number,seed:number,groups:Groups){
  const count=pairCounts(teams,season,seed);
  const byKey=new Map<string,[string,string]>();
  for(const key of count.keys()){
    const [a,b]=key.split("|");
    byKey.set(key,[a!,b!]);
  }
  const odd=oddHosts([...count].filter(([,n])=>n===3).map(([key])=>byKey.get(key)!),seed);
  const targets=new Map<string,Record<string,number>>();
  for(const [key,n] of count){
    const [a,b]=byKey.get(key)!;
    const aHomes=n===3?(odd.has(a+"|"+b)?2:1):n/2;
    targets.set(key,{[a]:aHomes,[b]:n-aHomes});
  }
  const cups=cupFixtures(groups,season);
  for(const cup of cups){
    const target=targets.get(pairKey(cup.home,cup.away));
    if(!target||!Number.isFinite(target[cup.home])||target[cup.home]!<=0)
      throw new Error("Cup fixture conflicts with home/away opponent matrix");
    target[cup.home] = target[cup.home]! - 1;
  }
  const regular:Fixture[]=[];
  for(const [key,goal] of targets){
    const [a,b]=byKey.get(key)!;
    for(const home of [a,b]){
      const away=home===a?b:a;
      for(let i=0;i<goal[home]!;i++){
        regular.push({id:"future_"+season+"_"+a+"_"+b+"_"+home+"_"+i,home,away});
      }
    }
  }
  if(cups.length!==60||regular.length!==1140)throw new Error("NBA schedule fixture count corrupted");
  return {cups,regular};
}

function scheduleDates(season:number) {
  const start=Date.UTC(season-1,9,19),end=Date.UTC(season,3,13);
  const cupSet=new Set(cupNights.map(([m,d])=>isoDate(season-1,m,d)));
  const days:number[]=[];
  for(let date=start;date<=end;date+=MILLIS_DAY){
    const iso=dayOf(date),month=Number(iso.slice(5,7)),day=Number(iso.slice(8,10));
    if(cupSet.has(iso))continue;
    if(month===12&&day>=4&&day<=11)continue; // Cup knockouts and makeup games.
    if(month===2&&day>=13&&day<=21)continue; // All-Star pause.
    if(month===12&&day===24)continue;
    days.push(Math.round(date/MILLIS_DAY));
  }
  return days;
}

function placeFixtures(teams:GmTeam[],season:number,seed:number,groups:Groups,attempt:number){
  const {cups,regular}=allFixtures(teams,season,seed,groups);
  const days=scheduleDates(season);
  const rng=createRng(seed+season*1009+attempt*7919);
  const originalCupDays=cups.map(c=>Math.round(Date.parse(c.date)/MILLIS_DAY));
  const gamesByTeam=new Map<string,Array<{day:number;home:boolean;opponent:string}>>();
  for(const team of teams)gamesByTeam.set(team.id,[]);
  for(let i=0;i<cups.length;i++){
    const g=cups[i]!,date=originalCupDays[i]!;
    gamesByTeam.get(g.home)!.push({day:date,home:true,opponent:g.away});
    gamesByTeam.get(g.away)!.push({day:date,home:false,opponent:g.home});
  }
  const remaining=regular.map(g=>({...g,random:rng()}));
  const assigned:Array<Fixture&{date:string}>=[...cups];
  const hardOk=(id:string,date:number)=>{
    const entries=gamesByTeam.get(id)!;
    if(entries.some(e=>e.day===date))return false;
    for(let start=date-4;start<=date;start++){
      if(entries.filter(e=>e.day>=start&&e.day<=start+4).length>=3)return false;
    }
    for(let start=date-2;start<=date;start++){
      if(entries.filter(e=>e.day>=start&&e.day<=start+2).length>=2)return false;
    }
    // Up to 18 back-to-backs, including Cup games and both sides of insertions.
    const ordered=entries.map(e=>e.day).concat(date).sort((a,b)=>a-b);
    let b2b=0;
    for(let i=1;i<ordered.length;i++)if(ordered[i]!-ordered[i-1]===1)b2b++;
    return b2b<=18;
  };
  const dayScore=(fixture:Fixture&{random:number},date:number,progress:number)=>{
    let score=fixture.random*2;
    for(const id of [fixture.home,fixture.away]){
      const entries=gamesByTeam.get(id)!;
      const earlier=entries.filter(e=>e.day<date).sort((a,b)=>b.day-a.day);
      const last=earlier[0];
      const played=earlier.length;
      const expected=80*progress;
      score+=(expected-played)*4;
      if(last){
        const gap=date-last.day;
        score+=gap>=4?4:gap===3?3:gap===2?2:gap===1?0:-12;
        if(gap===1){
          const b2b=earlier.filter((e,i)=>i+1<earlier.length&&e.day-earlier[i+1]!.day===1).length;
          score+=b2b<12?2:b2b<16?0:-6;
        }
        if(!last.home&&id===fixture.away){
          score+=2.2-Math.min(4,distance(last.opponent,fixture.home)/750);
        }
        if(last.opponent===(id===fixture.home?fixture.away:fixture.home)&&gap<7)score-=6;
        const lastHome=earlier.slice(0,5).filter(e=>e.home).length;
        const lastRoad=earlier.slice(0,5).filter(e=>!e.home).length;
        if(id===fixture.home&&lastHome>=4)score-=5;
        if(id===fixture.away&&lastRoad>=4)score-=5;
      }
    }
    return score;
  };
  for(let index=0;index<days.length;index++){
    const date=days[index]!;
    const daysLeft=days.length-index;
    const aim=Math.min(12,Math.ceil(remaining.length/daysLeft));
    const today=new Set<string>();
    for(let slot=0;slot<aim&&remaining.length;slot++){
      let best=-1,bestScore=-Infinity;
      for(let i=0;i<remaining.length;i++){
        const g=remaining[i]!;
        if(today.has(g.home)||today.has(g.away))continue;
        if(!hardOk(g.home,date)||!hardOk(g.away,date))continue;
        const value=dayScore(g,date,(index+1)/days.length);
        if(value>bestScore){bestScore=value;best=i;}
      }
      if(best<0)break;
      const g=remaining.splice(best,1)[0]!;
      today.add(g.home);today.add(g.away);
      gamesByTeam.get(g.home)!.push({day:date,home:true,opponent:g.away});
      gamesByTeam.get(g.away)!.push({day:date,home:false,opponent:g.home});
      assigned.push({id:g.id,home:g.home,away:g.away,date:dayOf(date*MILLIS_DAY)});
    }
  }
  // Greedy daily filling can leave a few pairings blocked on the final day
  // even though both teams have a legal open date earlier in the season.
  // Reinsert those fixtures without overriding rest, calendar, or caps.
  for(const fixture of remaining){
    const legal=days.filter(date=>hardOk(fixture.home,date)&&hardOk(fixture.away,date));
    if(!legal.length)throw new Error("No NBA-rest-compliant date for "+fixture.id);
    legal.sort((a,b)=>{
      const count=(date:number)=>assigned.filter(g=>Math.round(Date.parse(g.date)/MILLIS_DAY)===date).length;
      return count(a)-count(b)||Math.abs(a-days[Math.round(days.length/2)]!)-Math.abs(b-days[Math.round(days.length/2)]!);
    });
    const date=legal[0]!;
    gamesByTeam.get(fixture.home)!.push({day:date,home:true,opponent:fixture.away});
    gamesByTeam.get(fixture.away)!.push({day:date,home:false,opponent:fixture.home});
    assigned.push({id:fixture.id,home:fixture.home,away:fixture.away,date:dayOf(date*MILLIS_DAY)});
  }

  return assigned;
}

export function generateFutureSchedule(
  teams:GmTeam[],season:number,seed:number,groups:Groups
):GmScheduleGame[]{
  if(teams.length!==30||new Set(teams.map(t=>t.id)).size!==30)
    throw new Error("A future NBA schedule requires 30 distinct teams");
  // A constrained matchup matrix can admit many legal calendars. If a
  // greedy ordering leaves an unscheduled final pairing, retry with another
  // deterministic priority ordering rather than breaking the NBA rest rules.
  let placed:ReturnType<typeof placeFixtures>|null=null;
  let lastError:unknown;
  for(let attempt=0;attempt<12;attempt++){
    try {placed=placeFixtures(teams,season,seed,groups,attempt);break;}
    catch(error){lastError=error;}
  }
  if(!placed)throw lastError instanceof Error?lastError:new Error("Unable to generate NBA-style schedule");
  const fixtures=placed.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const dates=[...new Set(fixtures.map(g=>g.date))];
  const dayByDate=new Map(dates.map((date,day)=>[date,day]));
  return fixtures.map(g=>({
    id:g.id,season,day:dayByDate.get(g.date)!,
    gameDate:g.date,homeTeamId:g.home,awayTeamId:g.away,
    played:false,...(g.cup?{cup:g.cup}:{}),
  }));
}

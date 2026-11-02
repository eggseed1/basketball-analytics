import type { GmCoaching, GmPosition } from "@/gm/types";
import { createRng } from "@/gm/engine/rng";

const SPOTS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];
const NEAR: Record<GmPosition,GmPosition[]> = {PG:["SG"],SG:["PG","SF"],SF:["SG","PF"],PF:["SF","C"],C:["PF"]};
export type ShiftPlayer = {id:string;minutes:number;starter:boolean;position?:GmPosition;secondaryPosition?:GmPosition|null;fit?:number[]};
export type ChartRow = {id:string;on:boolean[];minutes:number};
const cache = new Map<string,ChartRow[]>();
const copy = (rows:ChartRow[]) => rows.map(row=>({...row,on:[...row.on]}));

/** Two-minute planning windows. Minutes, five-player units and opening/closing
 * constraints are hard; contiguous stints and staggered creators are optimized. */
export function paintShifts(input:{players:ShiftPlayer[];coaching?:GmCoaching}):ChartRow[]{
  const active=input.players.filter(p=>Number.isFinite(p.minutes)&&p.minutes>0);
  const empty=()=>input.players.map(p=>({id:p.id,on:Array<boolean>(24).fill(false),minutes:0}));
  if(active.length<5)return empty();
  const key=JSON.stringify([input.players,input.coaching?.playThrough,input.coaching?.closingLineup]);
  const cached=cache.get(key);if(cached)return copy(cached);
  const sum=active.reduce((n,p)=>n+p.minutes,0);
  const wishes=active.map(p=>Math.min(24,p.minutes/sum*120));
  const targets=wishes.map(Math.floor);
  let left=120-targets.reduce((a,b)=>a+b,0);
  while(left>0){let best=-1;for(let i=0;i<active.length;i++)if(targets[i]!<24&&(best<0||wishes[i]!-targets[i]!>wishes[best]!-targets[best]!))best=i;if(best<0)break;targets[best]!++;left--;}
  const fits=active.map(p=>p.fit??SPOTS.map(spot=>!p.position?0.85:p.position===spot?1:p.secondaryPosition===spot?0.96:NEAR[p.position].includes(spot)?0.87:0.5));
  const starters=active.map((p,i)=>({p,i})).filter(x=>x.p.starter).sort((a,b)=>b.p.minutes-a.p.minutes).slice(0,5).map(x=>x.i);
  const explicitClose=input.coaching?.closingLineup??[];
  const close=explicitClose.length===5&&new Set(explicitClose).size===5&&explicitClose.every(id=>active.some(p=>p.id===id))?explicitClose.map(id=>active.findIndex(p=>p.id===id)):starters;
  const locks=new Map<number,number[]>(),lockedCounts=targets.map(()=>0);
  function lock(slot:number,unit:number[]){
    if(unit.length!==5)return;
    const free=24-locks.size-1;
    if(active.some((_,i)=>{const used=lockedCounts[i]!+Number(unit.includes(i));return used>targets[i]!||targets[i]!-used>free;}))return;
    locks.set(slot,unit);for(const i of unit)lockedCounts[i]!++;
  }
  lock(0,starters);lock(1,starters);lock(23,close);lock(22,close);lock(12,starters);lock(13,starters);
  const rows=active.map(p=>({id:p.id,on:Array<boolean>(24).fill(false),minutes:0}));
  const remaining=targets.map((n,i)=>n-lockedCounts[i]!);
  const creatorIds=(input.coaching?.playThrough??[]).filter(Boolean);
  const creators=active.map((p,i)=>({p,i})).filter(x=>creatorIds.length?creatorIds.includes(x.p.id):fits[x.i]![0]!>=0.9).sort((a,b)=>b.p.minutes-a.p.minutes).slice(0,2).map(x=>x.i);
  const unitCosts=new Map<number,number>();
  const anchors=active.map((_,i)=>i).filter(i=>fits[i]![4]!>=0.94);
  const handlers=active.map((_,i)=>i).filter(i=>fits[i]![0]!>=0.84);
  function unitCost(unit:number[]):number{
    const mask=unit.reduce((n,i)=>n+2**i,0),memo=unitCosts.get(mask);if(memo!=null)return memo;
    let best=-Infinity;
    function visit(k:number,used:number,value:number){if(k===5){best=Math.max(best,value);return;}for(let pos=0;pos<5;pos++)if(!(used&(1<<pos)))visit(k+1,used|(1<<pos),value+fits[unit[k]!]![pos]!);}
    visit(0,0,0);
    const coverage=[anchors,handlers].reduce((n,pool)=>n+(pool.reduce((total,i)=>total+targets[i]!,0)>=24&&!unit.some(i=>pool.includes(i))?1000:0),0);
    const cost=(5-best)*45+coverage+(creators.length&&!unit.some(i=>creators.includes(i))?10:0);
    unitCosts.set(mask,cost);return cost;
  }
  let freeLeft=24-locks.size;
  for(let slot=0;slot<24;slot++){
    let unit=locks.get(slot);
    if(!unit){
      unit=active.map((_,i)=>i).filter(i=>remaining[i]!>=freeLeft);
      for(const pool of [anchors,handlers])if(unit.length<5&&!unit.some(i=>pool.includes(i))&&pool.reduce((n,i)=>n+remaining[i]!,0)>=freeLeft){
        const next=pool.filter(i=>remaining[i]!>0).sort((a,b)=>remaining[b]!-remaining[a]!)[0];if(next!=null)unit.push(next);
      }
      while(unit.length<5){
        let best=-1,bestScore=-Infinity;
        for(let i=0;i<active.length;i++)if(remaining[i]!>0&&!unit.includes(i)){
          if([anchors,handlers].some(pool=>pool.includes(i)&&unit!.some(j=>pool.includes(j))&&pool.reduce((n,j)=>n+remaining[j]!,0)<=freeLeft))continue;
          let run=0;for(let s=slot-1;s>=Math.floor(slot/6)*6&&rows[i]!.on[s];s--)run++;
          const score=remaining[i]!/freeLeft*30+(run>0&&run<4?9:run>=6?-20:run>0?1:0)
            -(unit.some(j=>active[j]!.position===active[i]!.position)?4:0)
            +(creators.includes(i)&&!unit.some(j=>creators.includes(j))?8:0);
          if(score>bestScore){best=i;bestScore=score;}
        }
        if(best<0)throw new Error("Rotation targets cannot cover five players.");unit.push(best);
      }
      for(const i of unit)remaining[i]!--;
      freeLeft--;
    }
    for(const i of unit)rows[i]!.on[slot]=true;
  }
  const units=Array.from({length:24},(_,slot)=>rows.map((_,i)=>i).filter(i=>rows[i]!.on[slot]));
  function rowCost(i:number):number{
    const on=rows[i]!.on;let cost=0;
    for(let s=1;s<24;s++)if(on[s]!==on[s-1])cost+=s%6===0?0.5:3;
    for(let s=1;s<23;s++)if(on[s]!==on[s-1]&&on[s]!==on[s+1])cost+=on[s]?12:9;
    for(let q=0;q<4;q++){
      const start=q*6;let run=0;
      for(let s=start;s<start+6;s++){if(on[s])run++;else{if(run===1&&s>start+1)cost+=4;run=0;}}
    }
    return cost;
  }
  // Pair exchanges preserve every player's exact budget and all locked units.
  const rng=createRng(831);const random=(n:number)=>Math.floor(rng()*n);
  for(let pass=0;pass<9000;pass++){
    const a=random(rows.length),b=random(rows.length),x=random(24),y=random(24);
    if(a===b||x===y||locks.has(x)||locks.has(y)||!rows[a]!.on[x]||rows[b]!.on[x]||rows[a]!.on[y]||!rows[b]!.on[y])continue;
    const before=rowCost(a)+rowCost(b)+unitCost(units[x]!)+unitCost(units[y]!);
    rows[a]!.on[x]=false;rows[a]!.on[y]=true;rows[b]!.on[x]=true;rows[b]!.on[y]=false;
    const ux=units[x]!.map(i=>i===a?b:i),uy=units[y]!.map(i=>i===b?a:i);
    const after=rowCost(a)+rowCost(b)+unitCost(ux)+unitCost(uy);
    if(after<before-0.001){units[x]=ux;units[y]=uy;}
    else{rows[a]!.on[x]=true;rows[a]!.on[y]=false;rows[b]!.on[x]=false;rows[b]!.on[y]=true;}
  }
  const byId=new Map(rows.map(row=>[row.id,{...row,minutes:row.on.filter(Boolean).length*2}]));
  const result=input.players.map(p=>byId.get(p.id)??{id:p.id,on:Array<boolean>(24).fill(false),minutes:0});
  if(cache.size>=96)cache.delete(cache.keys().next().value!);cache.set(key,copy(result));
  return result;
}

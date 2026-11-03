import assert from "node:assert/strict";
import { careerLegacyLeaders } from "../src/gm/engine/career-legacy";
import type { GmSeasonArchive } from "../src/gm/types";

const line=(season:number,pts:number,gp=72)=>({
  season:String(season),team:"BOS",gp,min:gp*34,pts:pts*gp,
  reb:gp*7,ast:gp*8,stl:gp,blk:gp,tov:gp*3,fgm:gp*10,
  fga:gp*20,tpm:gp*3,tpa:gp*9,ftm:gp*5,fta:gp*6,
});
const years:GmSeasonArchive[]=Array.from({length:9},(_,i)=>{
  const season=2028+i;
  return {
    season,standings:{},trades:[],userTeamId:"bos",
    champion:{season,teamId:i===2?"nyk":"bos",finalsMvpId:"dynasty",wins:4,losses:2},
    awards:{season,races:[
      {id:"mvp",title:"MVP",candidates:[
        {id:"dynasty",name:"Dynasty Star",teamId:"bos",detail:"winner",score:42},
        {id:"season99",name:"One-year Peak",teamId:"bos",detail:"runner up",score:35},
      ]},
      {id:"all-nba-1",title:"First Team",candidates:[
        {id:"dynasty",name:"Dynasty Star",teamId:"bos",detail:"first team",score:42},
      ]},
    ]},
    players:[
      {id:"dynasty",name:"Dynasty Star",teamId:"bos",age:21+i,overall:91+Math.min(i,6),line:line(season,27+i%3)},
      ...(i===0?[{id:"season99",name:"One-year Peak",teamId:"bos",age:26,overall:99,line:line(season,35)}]:[]),
      {id:"role",name:"Long-term Role Player",teamId:"nyk",age:23+i,overall:81,line:line(season,9)},
    ]
  };
});
const leaders=careerLegacyLeaders(years,10);
assert.deepEqual(leaders.map(r=>r.id),["dynasty","role"],
  "one-season 99 cannot displace a sustained historical résumé");
const star=leaders[0]!;
assert.equal(star.peakOverall,97);
assert.equal(star.peakSeason,2034);
assert.equal(star.mvps,9);
assert.equal(star.allNba,9);
assert.equal(star.allNbaFirst,9);
assert.equal(star.championships,8);
assert.equal(star.finalsMvps,9);
assert.equal(star.seasons,9);
assert.equal(star.games,648);
assert.equal(star.points,years.reduce((n,y)=>n+y.players[0]!.line!.pts,0));
assert.deepEqual(careerLegacyLeaders([...years,years[0]!]),leaders,
  "duplicate archived seasons cannot duplicate titles, MVPs or points");
assert.deepEqual(careerLegacyLeaders(JSON.parse(JSON.stringify(years)) as GmSeasonArchive[]),leaders,
  "legacy calculations must remain save/export compatible");
assert.deepEqual(careerLegacyLeaders([],8),[]);
assert.deepEqual(careerLegacyLeaders([years[0]!],8),[]);
assert.equal(careerLegacyLeaders(years,1).length,1);
// An elite season with no winning career is not equivalent to accumulated
// championships, All-NBA honors, Finals MVPs and points.
const oneYear99=careerLegacyLeaders([...years,{
  ...years[8]!,season:2040,champion:undefined,awards:undefined,players:[
    {id:"season99",name:"One-year Peak",teamId:"bos",age:27,overall:98,line:line(2040,35)}
  ],
}],10).find(x=>x.id==="season99")!;
assert.ok(oneYear99.peakOverall>star.peakOverall);
assert.ok(oneYear99.legacyPoints<star.legacyPoints);
console.log("Career legacy leaderboard: peak rating, awards, titles, longevity, archived stats and save compatibility passed");

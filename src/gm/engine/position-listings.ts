import type { GmPlayer, GmPosition } from "@/gm/types";
import { getBundledPlayerBio } from "@/data/runtime/player-bio-snapshot";
import { classifyListedPosition } from "@/gm/engine/lineup";

export function splitPositionListing(raw?:string):GmPosition[]{
  const text=raw?.toUpperCase().replace(/POINT GUARD/g,"PG").replace(/SHOOTING GUARD/g,"SG").replace(/SMALL FORWARD/g,"SF").replace(/POWER FORWARD/g,"PF").replace(/CENTER/g,"C");
  return (text?.match(/\b(?:PG|SG|SF|PF|C)\b/g)??[]).filter((value,index,list)=>list.indexOf(value)===index) as GmPosition[];
}

/** Opt-in repairs for legacy inferred listings. Explicit season/manual choices stay put. */
export function listedPositionCorrections(players:GmPlayer[]){
  return players.flatMap(player=>{
    if(player.listedPosition||!player.nbaPlayerId)return [];
    const bio=getBundledPlayerBio(player.id,[player.nbaPlayerId]);
    let listing=splitPositionListing(bio?.position);
    if(!listing.length&&bio?.position){
      const family=bio.position.toUpperCase();
      const hint=family.startsWith("G")?"PG":family.startsWith("F")?"PF":undefined;
      if(hint){const inferred=classifyListedPosition({...player,position:hint});listing=[inferred.position,inferred.secondaryPosition];}
    }
    if(!listing[0]||listing[0]===player.position)return [];
    return [{playerId:player.id,name:player.name,from:player.position,to:listing[0],secondary:listing[1]}];
  });
}

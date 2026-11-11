"use client";

import Image from "next/image";
import { generatedJerseyStyle } from "@/gm/lib/generated-player-jersey";
import { gmPhotoPortraitPath } from "@/gm/lib/generated-photo-pool";
import type { GmPlayer } from "@/gm/types";
import { cn } from "@/lib/utils";

const DIMENSIONS = {xs:"h-7 w-7",sm:"h-9 w-9",md:"h-14 w-14",lg:"h-24 w-24",xl:"h-[8.75rem] w-[8.75rem]"} as const;

/** An approved pre-generated photograph, permanently attached to the player ID.
 * Neutral source jersey + current-team color ring; no network inference on renders.
 */
export function GmPhotoPortrait({player,name,size="xs",className,priority=false}:{
 player:GmPlayer;name:string;size?:"xs"|"sm"|"md"|"lg"|"xl";className?:string;priority?:boolean;
}) {
 const slot=player.identity?.portraitPoolId;
 const src=gmPhotoPortraitPath(slot);
 if(!src) return null;
 const uniform=generatedJerseyStyle(player.teamId);
 return <span
   data-generated-portrait="true"
   data-portrait-version="photo-v1"
   data-portrait-pool-id={slot}
   data-avatar={size}
   data-jersey-team={uniform.teamId??"free-agent"}
   title={name}
   className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-border",DIMENSIONS[size],className)}
   style={{borderBottom:"2px solid "+uniform.base}}>
   <Image src={src} alt={name+" fictional basketball player portrait"} fill
     sizes={size==="xl"?"140px":size==="lg"?"96px":size==="md"?"56px":"36px"}
     priority={priority} unoptimized className="object-cover object-center"/>
 </span>;
}

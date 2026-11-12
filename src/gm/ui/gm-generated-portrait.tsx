"use client";

import type { GmPlayer } from "@/gm/types";
import { generatedJerseyStyle } from "@/gm/lib/generated-player-jersey";
import { cn } from "@/lib/utils";

type PortraitSize = "xs" | "sm" | "md" | "lg" | "xl";
const SIZE: Record<PortraitSize, string> = {
  xs: "h-7 w-7", sm: "h-9 w-9", md: "h-14 w-14",
  lg: "h-24 w-24", xl: "h-[8.75rem] w-[8.75rem]",
};
const SKIN = [
  ["#f3d2b7","#c58d72"], ["#ebbea2","#b57958"],
  ["#e7b48f","#a86c50"], ["#dba378","#8e573e"],
  ["#c68a64","#804d38"], ["#b57b5c","#754330"],
  ["#a76b4d","#633b2e"], ["#916046","#553126"],
  ["#765039","#43291f"], ["#5c392b","#321f1c"],
  ["#e0ad8b","#ac7052"], ["#ce9b79","#86593e"],
] as const;
const HAIR = ["#13161b","#211c1b","#34251f","#493127","#543b30","#221c19","#6d4f3c","#865f44"] as const;
const BACKDROP = ["#dce5ea","#e3e6eb","#d9e2df","#e8e2dc","#dce0e7"] as const;

function hashText(text: string): number {
  let value = 2166136261 >>> 0;
  for (let i=0;i<text.length;i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value,16777619);
  }
  let mixed = Math.imul(value ^ (value>>>16),0x7feb352d)>>>0;
  mixed = Math.imul(mixed^(mixed>>>15),0x846ca68b)>>>0;
  return (mixed^(mixed>>>16))>>>0;
}
function next(seed: number): () => number {
  let state=seed>>>0;
  return () => {
    state=(state+0x6d2b79f5)>>>0;
    let t=Math.imul(state^(state>>>15),1|state);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
export type GeneratedPortraitRecipe = {
  skin:number; hair:number; style:number; beard:number;
  headWidth:number; eyeSpacing:number; brow:number; mouth:number;
  freckles:boolean; hairline:number; background:number;
  jawWidth:number; chinDepth:number; cheekWidth:number;
  noseWidth:number; noseLength:number; eyeHeight:number; eyeTilt:number;
  browThickness:number; browAngle:number; lipWidth:number; earSize:number;
  hairVolume:number; glasses:boolean; eyebrowSlit:boolean;
};

// The first eleven attributes retain the old seed and draw sequence. All
// additional face variation lives in a separate RNG domain. Country and name
// are deliberately never inputs to complexion, hair or face construction.
export function generatedPortraitRecipe(seed: number): GeneratedPortraitRecipe {
  const rng=next(seed);
  const original = {
    skin:Math.floor(rng()*SKIN.length),
    hair:Math.floor(rng()*HAIR.length),
    style:Math.floor(rng()*8),
    beard:Math.floor(rng()*4),
    headWidth:24+Math.floor(rng()*8),
    eyeSpacing:12+Math.floor(rng()*5),
    brow:Math.floor(rng()*3),
    mouth:Math.floor(rng()*3),
    freckles:rng()<.15,
    hairline:29+Math.floor(rng()*8),
    background:Math.floor(rng()*BACKDROP.length),
  };
  const extra=next((seed^0xa38c19f5)>>>0);
  const extendedStyle=extra();
  return {
    ...original,
    style:extendedStyle>.74?8+Math.floor(extra()*4):original.style,
    jawWidth:13+Math.floor(extra()*9),
    chinDepth:112+Math.floor(extra()*10),
    cheekWidth:1+Math.floor(extra()*7),
    noseWidth:3.2+extra()*3.7,
    noseLength:10+extra()*6,
    eyeHeight:72+Math.floor(extra()*4),
    eyeTilt:Math.floor(extra()*5)-2,
    browThickness:2.2+extra()*2,
    browAngle:extra()*4-2,
    lipWidth:6+extra()*4,
    earSize:8+Math.floor(extra()*5),
    hairVolume:extra(),
    glasses:extra()<.08,
    eyebrowSlit:extra()<.075,
  };
}

function Hair({face,color,left,right}:{face:GeneratedPortraitRecipe;color:string;left:number;right:number}) {
  const top=face.hairline, vol=Math.round(face.hairVolume*9);
  const crop=`M${left-3} 59Q${left-8} ${top-5} 80 ${top-8}Q${right+8} ${top-5} ${right+3} 59L${right-2} 50Q80 ${top+8} ${left+2} 50Z`;
  switch(face.style) {
    case 0: return <><path d={crop} fill={color}/><path d={`M${left+1} 59L${left+1} 47M${right-1} 59L${right-1} 47`} stroke={color} strokeWidth="3"/></>;
    case 1: return <><path d={`M${left-4} 57Q${left-4} ${top-8} 70 ${top-11}Q110 ${top-18} ${right+3} 49L${right+2} 62Q103 37 86 43Q65 45 ${left-4} 57Z`} fill={color}/><path d={`M${left+9} 38Q74 ${top-2} 91 ${top-8}`} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="1.4"/></>;
    case 2: return <><path d={crop} fill={color}/>{Array.from({length:10},(_,i)=><path key={i} d={`M${left+7+i*5} ${top-8+(i%3)*2}l3 4`} stroke="#fff" strokeOpacity=".12" strokeWidth="1.4"/>)}</>;
    case 3: return <><path d={`M${left-3} 61V${20-vol}Q80 ${12-vol} ${right+3} ${20-vol}V61Q98 42 80 43Q62 42 ${left-3} 61Z`} fill={color}/><path d={`M${left+2} ${22-vol}Q80 ${18-vol} ${right-2} ${22-vol}`} stroke="#fff" strokeOpacity=".13" fill="none"/></>;
    case 4: return <path d={`M${left+1} 53Q${left+3} ${top-4} 80 ${top-3}Q${right-3} ${top-4} ${right-1} 53`} stroke={color} strokeWidth="3.8" opacity=".9" fill="none"/>;
    case 5: return <><path d={crop} fill={color}/>{Array.from({length:13},(_,i)=><circle key={i} cx={left+5+(i%7)*8+(Math.floor(i/7)%2)*2} cy={top-5+Math.floor(i/7)*7} r={4.5+(i%3)} fill={color}/>)}</>;
    case 6: return <path d={`M${left-4} 59Q${left-6} ${top-8} 72 ${top-8}Q87 ${top-21} ${right+5} ${top-2}Q99 ${top+8} 90 42Q62 43 ${left-4} 59Z`} fill={color}/>;
    case 7: return <><path d={crop} fill={color}/>{Array.from({length:14},(_,i)=><circle key={i} cx={left+4+(i%7)*9} cy={top-6+Math.floor(i/7)*8-(i%3)} r={5+(i%3)} fill={color}/>)}</>;
    case 8: return <><path d={crop} fill={color}/>{Array.from({length:9},(_,i)=>{const x=left+4+i*7;return <path key={i} d={`M${x} ${top-5}Q${x-3} ${top+12} ${x+((i%3)-1)*3} ${top+20+(i%3)*3}`} stroke={color} strokeWidth="5.2" strokeLinecap="round" fill="none"/>;})}</>;
    case 9: return <><path d={crop} fill={color}/>{Array.from({length:12},(_,i)=>{const a=-Math.PI*.95+(i/11)*Math.PI*.9;return <circle key={i} cx={80+Math.cos(a)*(31+vol*.45)} cy={42+Math.sin(a)*(26+vol*.5)} r={12+(i%3)*2} fill={color}/>;})}</>;
    case 10: return <><path d={crop} fill={color}/>{Array.from({length:7},(_,i)=><path key={i} d={`M${left+9+i*7} ${top-6}Q${left+6+i*7} ${top+7} ${left+8+i*7} ${top+16}`} stroke="#fff" strokeOpacity=".20" strokeWidth="1.6" fill="none"/>)}</>;
    default: return <><path d={crop} fill={color}/>{Array.from({length:5},(_,i)=><path key={i} d={`M${left+9} ${top-6+i*3}Q80 ${top-12+i*3} ${right-9} ${top-6+i*3}`} stroke="#fff" strokeOpacity=".17" strokeWidth="1.5" fill="none"/>)}</>;
  }
}

export function GmGeneratedPortrait({player,name,size="xs",className}:{
  player:GmPlayer;name:string;size?:PortraitSize;className?:string;
}) {
  const seed=player.identity?.portraitSeed??hashText("gm-player-face:"+player.id);
  const face=generatedPortraitRecipe(seed);
  const [skin,shade]=SKIN[face.skin]!;
  const hair=HAIR[face.hair]!;
  const uniform=generatedJerseyStyle(player.teamId);
  const left=80-face.headWidth,right=80+face.headWidth;
  const jawL=80-face.jawWidth,jawR=80+face.jawWidth;
  const eyeL=80-face.eyeSpacing,eyeR=80+face.eyeSpacing;
  const facePath=`M${left+4} ${face.hairline+10}Q${left-2} 50 ${left} 82Q${left+face.cheekWidth} 103 ${jawL} 112Q80 ${face.chinDepth+7} ${jawR} 112Q${right-face.cheekWidth} 103 ${right} 82Q${right+2} 50 ${right-4} ${face.hairline+10}Q80 ${face.hairline-4} ${left+4} ${face.hairline+10}Z`;
  const irisY=face.eyeHeight,noseY=irisY+face.noseLength+5;
  const showLettering=size==="lg"||size==="xl";
  const number=player.jersey&&/^\d{1,2}$/.test(player.jersey)?player.jersey:null;
  const faceGrad="gm-face-"+(seed>>>0).toString(36);
  const jerseyGrad="gm-jersey-"+(seed>>>0).toString(36)+"-"+(uniform.teamId??"fa");
  const studioGrad="gm-backdrop-"+(seed>>>0).toString(36);
  return <span data-avatar={size} data-generated-portrait="true" data-portrait-version="2"
    data-jersey-team={uniform.teamId??"free-agent"} data-jersey-color={uniform.base}
    title={name} className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-border",SIZE[size],className)}>
    <svg viewBox="0 0 160 160" width="100%" height="100%" role="img"
      aria-label={name+" illustrated portrait in "+(uniform.teamId?uniform.abbreviation+" jersey":"neutral free-agent clothing")}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={studioGrad} cx="36%" cy="16%" r="92%"><stop offset="0%" stopColor="#fff" stopOpacity=".78"/><stop offset="100%" stopColor={BACKDROP[face.background]}/></radialGradient>
        <linearGradient id={faceGrad} x1="8%" y1="15%" x2="94%" y2="90%"><stop offset="0%" stopColor="#fff" stopOpacity=".21"/><stop offset="18%" stopColor={skin}/><stop offset="58%" stopColor={skin}/><stop offset="100%" stopColor={shade}/></linearGradient>
        <linearGradient id={jerseyGrad} x1="0%" y1="0%" x2="95%" y2="100%"><stop offset="0%" stopColor={uniform.highlight} stopOpacity=".30"/><stop offset="37%" stopColor={uniform.base}/><stop offset="80%" stopColor={uniform.base}/><stop offset="100%" stopColor="#000" stopOpacity=".24"/></linearGradient>
      </defs>
      <rect width="160" height="160" fill={`url(#${studioGrad})`}/>
      <ellipse cx="80" cy="160" rx="72" ry="17" fill="#333" opacity=".065"/>
      <g data-jersey-layer="true">
        <path d="M31 119Q14 126 8 160H41L48 124Z" fill={skin}/>
        <path d="M129 119Q146 126 152 160H119L112 124Z" fill={skin}/>
        <path d="M10 160Q19 136 30 131L32 160ZM150 160Q141 136 130 131L128 160Z" fill={shade} opacity=".16"/>
        <path d="M30 164L35 143Q36 125 47 120L61 113Q69 125 80 135Q91 125 99 113L113 120Q124 125 125 143L130 164Z" fill={uniform.base}/>
        <path d="M30 164L35 143Q36 125 47 120L61 113Q69 125 80 135Q91 125 99 113L113 120Q124 125 125 143L130 164Z" fill={`url(#${jerseyGrad})`} opacity=".55"/>
        <path d="M35 142Q41 145 47 148L50 164H34Z M125 142Q119 145 113 148L110 164H126Z" fill={uniform.highlight} opacity=".52"/>
        <path d="M37 135L34 164M123 135L126 164" stroke={uniform.piping} strokeOpacity=".84" strokeWidth="2.5" fill="none"/>
        <path d="M47 120Q37 124 36 140M113 120Q123 124 124 140" fill="none" stroke={uniform.piping} strokeWidth="5.5"/>
        <path d="M47 120Q37 124 36 140M113 120Q123 124 124 140" fill="none" stroke={uniform.base} strokeWidth="2" opacity=".8"/>
        <path d="M61 113Q68 129 80 136Q92 129 99 113" fill="none" stroke={uniform.piping} strokeWidth="6.5" strokeLinejoin="round"/>
        <path d="M61 113Q68 129 80 136Q92 129 99 113" fill="none" stroke={uniform.highlight} strokeOpacity=".76" strokeWidth="1.7"/>
        <path d="M53 128L56 156M107 128L104 156" stroke="#fff" opacity=".09" strokeWidth="1.4"/>
        <path d="M41 138L46 160M119 138L114 160" stroke="#fff" opacity=".10" strokeWidth=".85"/>
        <path d="M52 139Q80 144 108 139" stroke="#fff" opacity=".065" strokeWidth="1.1" fill="none"/>
      </g>
      <g data-face-layer="true">
        <path d="M65 102L65 119Q80 137 95 119L95 102Z" fill={shade}/>
        <path d="M68 109Q80 127 92 109L92 120Q80 132 68 120Z" fill={skin}/>
        <ellipse cx={left+1} cy="79" rx={face.earSize*.46} ry={face.earSize} fill={shade}/>
        <ellipse cx={right-1} cy="79" rx={face.earSize*.46} ry={face.earSize} fill={shade}/>
        <path d={facePath} fill={`url(#${faceGrad})`}/>
        <path d={`M${left+8} 64Q${left+5} 88 ${jawL+5} 104`} fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="5" strokeLinecap="round"/>
        <path d={`M${right-8} 65Q${right-3} 86 ${jawR-4} 105`} fill="none" stroke={shade} strokeOpacity=".18" strokeWidth="6" strokeLinecap="round"/>
        <ellipse cx="80" cy={noseY-5} rx={face.noseWidth*.65} ry={face.noseLength*.65} fill="#fff" opacity=".07"/>
        <path d={`M${left+12} 88Q${left+18} 96 ${left+23} 92 M${right-12} 88Q${right-18} 96 ${right-23} 92`} fill="none" stroke={shade} strokeOpacity=".14" strokeWidth="2"/>
        <path d={`M${right-7} 58Q${right+2} 88 ${jawR} 111Q88 ${face.chinDepth+7} 80 ${face.chinDepth+7}`} fill="none" stroke={shade} strokeOpacity=".16" strokeWidth="5.5" strokeLinecap="round"/>
        <path d={`M${left+6} 88Q${left+9} 97 ${left+face.cheekWidth+5} 100 M${right-6} 88Q${right-9} 97 ${right-face.cheekWidth-5} 100`} fill="none" stroke={shade} strokeOpacity=".16" strokeWidth="2.5" strokeLinecap="round"/>
        <Hair face={face} color={hair} left={left} right={right}/>
        {[eyeL,eyeR].map((x,i)=><g key={i}>
          <path d={`M${x-8} ${irisY-8}Q${x} ${irisY-12+face.browAngle} ${x+8} ${irisY-8}`} stroke={hair} strokeWidth={face.browThickness} fill="none" strokeLinecap="round"/>
          {face.eyebrowSlit&&i===0?<path d={`M${x+3} ${irisY-12}l3 6`} stroke={skin} strokeWidth="2.4"/>:null}
          <path d={`M${x-6} ${irisY}Q${x} ${irisY-4+face.eyeTilt} ${x+6} ${irisY}Q${x} ${irisY+3.2} ${x-6} ${irisY}Z`} fill="#f0e9df" opacity=".92"/>
          <ellipse cx={x} cy={irisY} rx="2.6" ry="2.9" fill="#272c31"/>
          <circle cx={x-.65} cy={irisY-.75} r=".7" fill="#fff" opacity=".85"/>
          <path d={`M${x-6} ${irisY}Q${x} ${irisY-4+face.eyeTilt} ${x+6} ${irisY}`} stroke={shade} strokeOpacity=".58" strokeWidth="1.35" fill="none"/>
        </g>)}
        <path d={`M79 ${irisY+2}Q${78-face.noseWidth*.35} ${noseY-7} ${80-face.noseWidth*.5} ${noseY}Q80 ${noseY+3} ${80+face.noseWidth*.5} ${noseY}`} fill="none" stroke={shade} strokeWidth="1.7" strokeOpacity=".75" strokeLinecap="round"/>
        <path d={`M${80-face.noseWidth} ${noseY+1.5}l1 0M${79+face.noseWidth} ${noseY+1.5}l1 0`} stroke={shade} strokeWidth="1.4" strokeLinecap="round"/>
        {face.beard===1||face.beard===3?<path d="M71 99Q80 104 89 99" stroke={hair} strokeWidth={face.beard===3?3.1:2.4} fill="none" strokeLinecap="round"/>:null}
        {face.beard>=2?<path d={`M${left+7} 95Q${left+12} 113 80 ${face.chinDepth+5}Q${right-12} 113 ${right-7} 95Q99 110 80 109Q61 110 ${left+7} 95Z`} fill={hair} opacity={face.beard===3?.76:.21}/>:null}
        <path d={`M${80-face.lipWidth-2} 106Q80 110 ${80+face.lipWidth+2} 106`} stroke={shade} strokeOpacity=".13" strokeWidth="1.6" fill="none"/>
        <path d={face.mouth===0?`M${80-face.lipWidth} 102Q80 104 ${80+face.lipWidth} 102`:face.mouth===1?`M${80-face.lipWidth} 102Q80 100 ${80+face.lipWidth} 102`:`M${80-face.lipWidth} 101Q80 107 ${80+face.lipWidth} 101`} stroke={shade} strokeOpacity=".92" strokeWidth="1.75" fill="none" strokeLinecap="round"/>
        {face.freckles?[0,1,2].map(i=><g key={i} fill={shade} opacity=".38"><circle cx={61+i*4} cy={86+i%2} r=".9"/><circle cx={91+i*4} cy={86+i%2} r=".9"/></g>):null}
        {face.glasses?<g stroke="#292d34" strokeWidth="1.45" fill="none" opacity=".9">
          <rect x={eyeL-10} y={irisY-5} width="19" height="11" rx="4.5"/><rect x={eyeR-9} y={irisY-5} width="19" height="11" rx="4.5"/>
          <path d={`M${eyeL+9} ${irisY-2}Q80 ${irisY-5} ${eyeR-9} ${irisY-2}M${eyeL-10} ${irisY-3}l-8 -2M${eyeR+10} ${irisY-3}l8 -2`}/>
        </g>:null}
      </g>
      {showLettering && number ? <text x="80" y="149" textAnchor="middle"
        fontFamily="system-ui,Arial,sans-serif" fontWeight="900" fontSize="12.5"
        fill={uniform.lettering} stroke={uniform.base} strokeWidth=".8" paintOrder="stroke">{number}</text> : null}
    </svg>
  </span>;
}

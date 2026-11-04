"use client";

import type { GmPlayer } from "@/gm/types";
import { generatedJerseyStyle } from "@/gm/lib/generated-player-jersey";
import { cn } from "@/lib/utils";

/**
 * Pure SVG illustration, no API calls, third-party photo assets, canvas or
 * paid generation. Face is always a function of the saved portraitSeed/id.
 * Complexion and hairstyle are independent of country/nationality.
 */
type PortraitSize = "xs" | "sm" | "md" | "lg" | "xl";
const SIZE: Record<PortraitSize, string> = {
  xs: "h-7 w-7", sm: "h-9 w-9", md: "h-14 w-14",
  lg: "h-24 w-24", xl: "h-[8.75rem] w-[8.75rem]",
};
const SKIN = [
  ["#f5d5b9", "#d49b74"], ["#eec4a0", "#bb7d55"], ["#e7b98b", "#ac704c"],
  ["#dca777", "#925a39"], ["#ca936b", "#865034"], ["#b97a58", "#6a3d2b"],
  ["#ad6d49", "#5c3528"], ["#925d40", "#482a24"], ["#70452f", "#38241f"],
  ["#5e3a2b", "#2c1f1d"], ["#e2ac8a", "#ad7259"], ["#cd9b78", "#865741"],
] as const;
const HAIR = ["#12151e", "#221a1a", "#37251e", "#493329", "#553b2b", "#211b19", "#654a35", "#8a6443"] as const;

function hashText(text: string): number {
  let value = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  // Match one-shot/rng.hashString used when the identity is first created.
  // This keeps the portrait identical before and after old-save migration.
  let mixed = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}
function next(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type GeneratedPortraitRecipe = {
  skin: number; hair: number; style: number; beard: number;
  headWidth: number; eyeSpacing: number; brow: number; mouth: number;
  freckles: boolean; hairline: number; background: number;
};
export function generatedPortraitRecipe(seed: number): GeneratedPortraitRecipe {
  const rng = next(seed);
  return {
    skin: Math.floor(rng() * SKIN.length),
    hair: Math.floor(rng() * HAIR.length),
    style: Math.floor(rng() * 8),
    beard: Math.floor(rng() * 4),
    headWidth: 24 + Math.floor(rng() * 8),
    eyeSpacing: 12 + Math.floor(rng() * 5),
    brow: Math.floor(rng() * 3),
    mouth: Math.floor(rng() * 3),
    freckles: rng() < 0.15,
    hairline: 29 + Math.floor(rng() * 8),
    background: Math.floor(rng() * 5),
  };
}
const BACKDROPS = ["#222b3b", "#1e333d", "#2f2b38", "#29333b", "#302d32"] as const;

export function GmGeneratedPortrait({
  player, name, size = "xs", className,
}: {
  player: GmPlayer;
  name: string;
  size?: PortraitSize;
  className?: string;
}) {
  const seed = player.identity?.portraitSeed ?? hashText("gm-player-face:" + player.id);
  const face = generatedPortraitRecipe(seed);
  const [skin, shadow] = SKIN[face.skin]!;
  const hair = HAIR[face.hair]!;
  // Uniform always follows the player's current team. The face seed and
  // facial features do not read teamId and therefore survive trades.
  const uniform = generatedJerseyStyle(player.teamId);
  const jersey = uniform.base;
  const trim = uniform.piping;
  const width = face.headWidth;
  const hairTop = face.hairline;
  const left = 80 - width, right = 80 + width;
  const eyeL = 80 - face.eyeSpacing, eyeR = 80 + face.eyeSpacing;
  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-border",SIZE[size],className)}
      data-avatar={size}
      data-generated-portrait="true"
      data-jersey-team={uniform.teamId ?? "free-agent"}
      data-jersey-color={uniform.base}
      title={name}
    >
      <svg viewBox="0 0 160 160" width="100%" height="100%" role="img" aria-label={name + " illustrated portrait in " + (uniform.teamId ? uniform.abbreviation + " jersey" : "neutral free-agent clothing")} xmlns="http://www.w3.org/2000/svg">
        <rect width="160" height="160" fill={BACKDROPS[face.background]}/>
        <path d="M0 0H160V58L0 144Z" fill="#fff" opacity="0.045"/>
        <circle cx="80" cy="65" r="65" fill="none" stroke="#fff" strokeOpacity="0.10" strokeWidth="1.5"/>
        <circle cx="80" cy="80" r="78" fill="none" stroke={trim} strokeOpacity="0.48" strokeWidth="2.5"/>
        {/* Broad shoulders create a consistent NBA-media-day crop. */}
        <path d="M13 160Q15 124 39 115L68 107H92L121 115Q145 124 147 160Z" fill={jersey}/>
        <path d="M13 160Q15 124 39 115L68 107H92L121 115Q145 124 147 160Z" fill="none" stroke={trim} strokeWidth="2.5"/>
        <path d="M23 160Q26 130 46 122L68 115M137 160Q134 130 114 122L92 115" stroke={trim} strokeWidth="4" opacity="0.9" fill="none"/>
        <path d="M16 160Q22 138 34 130L38 160ZM144 160Q138 138 126 130L122 160Z" fill="#000" opacity="0.11"/>
        <path d="M64 105V119Q80 135 96 119V105Z" fill={shadow}/>
        <path d="M67 109L80 125L93 109Z" fill={skin}/>
        <path d="M56 116Q68 130 80 134Q92 130 104 116L99 112Q80 128 61 112Z" fill={trim}/>
        <path d="M61 116Q70 125 80 128Q90 125 99 116" fill="none" stroke={uniform.highlight} strokeOpacity="0.85" strokeWidth="1.6"/>
        {/* Ears and facial shape are separate from hair and beard style. */}
        <ellipse cx={left - 1} cy="78" rx="7" ry="12" fill={shadow}/>
        <ellipse cx={right + 1} cy="78" rx="7" ry="12" fill={shadow}/>
        <path d={`M${left} 58Q${left - 4} 38 65 33Q80 25 95 33Q${right + 4} 38 ${right} 58L${right - 1} 92Q${right - 5} 111 80 115Q${left + 5} 111 ${left + 1} 92Z`} fill={skin}/>
        <path d={`M${left+2} 59Q${left+5} 37 80 34Q${right-4} 37 ${right-2} 59L${right-5} 96Q91 112 80 114Q${left+12} 110 ${left+4} 96Z`} fill={shadow} opacity="0.09"/>
        {/* Hair styles are individually sampled; no nationality-based mapping. */}
        {face.style === 0 && <path d={`M${left-2} 57Q${left-3} 28 70 27Q99 17 ${right+3} 40L${right} 61Q103 45 92 43Q73 49 ${left-2} 57Z`} fill={hair}/>}
        {face.style === 1 && <path d={`M${left-3} 63Q${left-5} 25 75 26Q106 18 ${right+4} 43L${right+2} 66Q100 40 90 46Q70 46 ${left-3} 63Z`} fill={hair}/>}
        {face.style === 2 && <path d={`M${left-3} 60L${left-3} ${hairTop}Q80 ${hairTop-26} ${right+4} ${hairTop}V61Q93 42 68 46Z`} fill={hair}/>}
        {face.style === 3 && <path d={`M${left-4} 64L${left-3} 25Q${left+4} 7 80 10Q${right-5} 8 ${right+3} 26L${right+3} 64Q105 44 80 45Q55 44 ${left-4} 64Z`} fill={hair}/>}
        {face.style === 4 && <path d={`M${left} 57Q${left} 32 80 31Q${right} 32 ${right} 57`} stroke={hair} strokeWidth="5" fill="none"/>}
        {face.style === 5 && <><path d={`M${left-4} 62Q${left-7} 28 80 24Q${right+5} 28 ${right+4} 62L${right-4} 51Q80 42 ${left+4} 51Z`} fill={hair}/>{[-2,-1,0,1,2].map(i=><path key={i} d={`M${80+i*10-4} 28Q${80+i*10+7} 35 ${80+i*10-2} 45`} stroke={skin} strokeOpacity="0.20" strokeWidth="2" fill="none" strokeLinecap="round"/>)}</>}
        {face.style === 6 && <path d={`M${left-4} 58Q${left-2} 24 70 26Q85 10 ${right+4} 33Q102 34 94 38Q68 35 ${left-4} 58Z`} fill={hair}/>}
        {face.style === 7 && <><path d={`M${left-5} 62Q${left-5} 25 80 27Q${right+5} 25 ${right+5} 62Z`} fill={hair}/>{Array.from({length:9},(_,i)=><circle key={i} cx={left + 6+i*(width*2-12)/8} cy={31+(i%3)*4} r={8+(i%2)*2} fill={hair}/>)}</>}
        {/* Brow and eye shapes remain readable even at small avatar sizes. */}
        <path d={`M${eyeL-7} 66Q${eyeL} ${face.brow===0?61:64} ${eyeL+7} 66`} stroke={hair} strokeWidth={face.brow===2?4:3} fill="none" strokeLinecap="round"/>
        <path d={`M${eyeR-7} 66Q${eyeR} ${face.brow===0?61:64} ${eyeR+7} 66`} stroke={hair} strokeWidth={face.brow===2?4:3} fill="none" strokeLinecap="round"/>
        <ellipse cx={eyeL} cy="73" rx="5.8" ry="2.7" fill="#f2e4d6"/>
        <ellipse cx={eyeR} cy="73" rx="5.8" ry="2.7" fill="#f2e4d6"/>
        <circle cx={eyeL} cy="73" r="2.5" fill="#272729"/>
        <circle cx={eyeR} cy="73" r="2.5" fill="#272729"/>
        <path d="M80 74Q76 83 77 91Q80 94 84 91" fill="none" stroke={shadow} strokeWidth="2" strokeLinecap="round"/>
        {face.beard >= 2 && <path d={`M${left+4} 94Q${left+8} 113 80 117Q${right-8} 113 ${right-4} 94Q96 108 80 109Q64 108 ${left+4} 94Z`} fill={hair} opacity={face.beard===3?0.92:0.5}/>}
        {face.beard===1 && <path d="M72 99Q80 105 88 99" stroke={hair} strokeWidth="3" fill="none" strokeLinecap="round"/>}
        <path d={face.mouth===0?"M73 101Q80 104 87 101":face.mouth===1?"M73 102Q80 99 87 102":"M73 102Q80 106 87 102"} stroke={face.beard>=2?"#9a7567":shadow} strokeWidth="2" fill="none" strokeLinecap="round"/>
        {face.freckles && [0,1,2].map(i=><g key={i} fill={shadow} opacity="0.55"><circle cx={59+i*5} cy={85+i%2*2} r="1.1"/><circle cx={91+i*5} cy={85+i%2*2} r="1.1"/></g>)}
        {/* Small avatars still show club piping; full-size headshots add the team mark. */}
        {(size === "md" || size === "lg" || size === "xl") &&
          <text x="80" y="148" textAnchor="middle" fontFamily="Arial, sans-serif"
            fontWeight="900" fontSize="11.5" letterSpacing="1.2"
            fill={uniform.lettering} stroke={jersey} strokeWidth="0.8" paintOrder="stroke">
            {uniform.abbreviation}
          </text>}
        {(size === "lg" || size === "xl") && player.jersey && /^\\d{1,2}$/.test(player.jersey) &&
          <text x="80" y="159" textAnchor="middle" fontFamily="Arial, sans-serif"
            fontSize="9.5" fontWeight="800" fill={uniform.lettering}>
            {player.jersey}
          </text>}
      </svg>
    </span>
  );
}

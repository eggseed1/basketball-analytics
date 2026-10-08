import { JERSEY_PATH } from "@/components/arcade/jersey-path";
import { cn } from "@/lib/utils";

/** Decorative headers for the Arcade game cards. */

export function HigherLowerArt() {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden>
      <MiniCard value="27.4" className="-rotate-6" />
      <div className="flex flex-col items-center gap-1 text-[#ff9f0a]">
        <span className="text-[18px] font-black leading-none">▲</span>
        <span className="text-[18px] font-black leading-none opacity-60">▼</span>
      </div>
      <MiniCard value="?" className="rotate-6" dashed />
    </div>
  );
}

function MiniCard({ value, className, dashed }: { value: string; className?: string; dashed?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[84px] w-16 flex-col items-center gap-1.5 rounded-xl bg-card px-2 pt-2.5 shadow-[0_8px_18px_-10px_rgb(0_0_0/0.45)] ring-1 ring-border/70",
        className
      )}
    >
      <span className="size-7 rounded-full bg-foreground/10" />
      <span className="h-1 w-9 rounded-full bg-foreground/15" />
      <span
        className={cn(
          "score-num mt-auto mb-2 text-[17px] leading-none",
          dashed && "rounded-md border border-dashed border-foreground/30 px-2 py-0.5 text-muted-foreground"
        )}
      >
        {value}
      </span>
    </span>
  );
}

const JERSEYS = [
  { x: 28, y: 6, fill: "#552583" },
  { x: 62, y: 6, fill: "#ce1141" },
  { x: 8, y: 36, fill: "#1d428a" },
  { x: 82, y: 36, fill: "#007a33" },
  { x: 45, y: 52, fill: "#f58426" },
];

export function Zero82Art() {
  return (
    <div className="arcade-court relative h-[96px] w-[150px] overflow-hidden rounded-xl shadow-[0_8px_18px_-10px_rgb(0_0_0/0.45)]" aria-hidden>
      <svg viewBox="0 0 150 96" className="absolute inset-0 size-full" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="52" y="0" width="46" height="44" />
        <circle cx="75" cy="44" r="14" />
        <path d="M10 0v30a66 66 0 0 0 130 0V0" />
      </svg>
      {JERSEYS.map((j, i) => (
        <svg key={i} viewBox="0 0 100 112" className="absolute w-[22px]" style={{ left: `${j.x}%`, top: `${j.y}%` }}>
          <path d={JERSEY_PATH} fill={j.fill} stroke="#fff" strokeWidth="6" />
        </svg>
      ))}
    </div>
  );
}

export function TeammateChainArt() {
  const nodes = ["#0a84ff", "#bf5af2", "#ff375f", "#ff9f0a"];
  return (
    <div className="flex items-center" aria-hidden>
      {nodes.map((color, i) => (
        <span key={color} className="flex items-center">
          {i > 0 ? <span className="h-0.5 w-6 bg-foreground/50" /> : null}
          <span
            className={cn(
              "flex items-center justify-center rounded-full ring-[3px] ring-card shadow-md",
              i === 0 || i === nodes.length - 1 ? "size-12" : "size-8"
            )}
            style={{ background: `color-mix(in oklab, ${color} 70%, white)` }}
          />
        </span>
      ))}
    </div>
  );
}

/** Pixel kid and hoop on the dark ONE SHOT palette. */
export function OneShotArt() {
  const px = [
    // hoop
    [14, 6, 14, 2, "#e8e8e8"], [26, 12, 10, 1, "#e0632e"], [27, 13, 1, 4, "#f2f2f2"], [30, 13, 1, 4, "#f2f2f2"], [33, 13, 1, 4, "#f2f2f2"], [12, 6, 2, 40, "#5a6266"],
    // floor
    [0, 46, 90, 10, "#b9874f"], [0, 48, 90, 1, "#f2e6c9"],
    // player
    [58, 22, 6, 6, "#a86e46"], [58, 22, 6, 1, "#1b1412"], [56, 28, 10, 10, "#48b9ab"], [55, 29, 1, 7, "#a86e46"], [66, 29, 1, 7, "#a86e46"],
    [57, 38, 3, 8, "#1b262b"], [62, 38, 3, 8, "#1b262b"], [56, 45, 10, 1, "#f2f2f2"],
    // ball
    [68, 36, 4, 4, "#e07a3e"], [68, 38, 4, 1, "#3a2018"],
  ] as const;
  return (
    <div className="overflow-hidden rounded-xl bg-[#0E1519] shadow-[0_8px_18px_-10px_rgb(0_0_0/0.45)] ring-1 ring-[#2A3B41]" aria-hidden>
      <svg viewBox="0 0 90 56" className="block h-[84px] w-[135px]" shapeRendering="crispEdges">
        <rect width="90" height="46" fill="#1a2226" />
        {px.map(([x, y, w, h, c], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
        ))}
      </svg>
    </div>
  );
}

export function GmLabArt() {
  const bars = [46, 70, 38, 84, 58];
  return (
    <div className="flex h-[84px] items-end gap-2 rounded-xl bg-card px-3 pb-3 pt-4 shadow-[0_8px_18px_-10px_rgb(0_0_0/0.45)] ring-1 ring-border/70" aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-3.5 rounded-t-[4px]"
          style={{ height: `${h}%`, background: i === 3 ? "#30d158" : "color-mix(in oklab, currentColor 18%, transparent)" }}
        />
      ))}
    </div>
  );
}

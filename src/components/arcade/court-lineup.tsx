"use client";

import type { CSSProperties } from "react";

import { playerLabel, type ArcadeLeague, type ArcadeRow } from "@/arcade/league";
import { ZERO_82_SLOTS, type Zero82Slot } from "@/arcade/zero-82";
import { PlayerAvatar } from "@/components/arcade/arcade-parts";
import { JERSEY_PATH } from "@/components/arcade/jersey-path";
import { arcadeTeamLook } from "@/components/arcade/team-look";
import { cn } from "@/lib/utils";

export type LineupPick = { row: ArcadeRow; team: string };

/** Spots on a 500x380 half court, hoop at the top. */
const SPOTS: Record<Zero82Slot, { x: number; y: number }> = {
  PG: { x: 50, y: 56 },
  SG: { x: 86, y: 37 },
  SF: { x: 14, y: 37 },
  PF: { x: 67, y: 9 },
  C: { x: 33, y: 9 },
};

function lastName(name: string): string {
  const parts = name.replace(/\s+(Jr\.|Sr\.|II|III|IV)$/i, "").split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function formatBpm(bpm: number): string {
  return `${bpm > 0 ? "+" : ""}${bpm.toFixed(1)}`;
}

export function CourtLineup({
  league,
  picks,
  highlight,
  showBpm,
  className,
}: {
  league: ArcadeLeague;
  picks: Partial<Record<Zero82Slot, LineupPick>>;
  highlight?: Zero82Slot | null;
  showBpm?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("arcade-court relative isolate aspect-[500/400] w-full overflow-hidden rounded-[22px]", className)}>
      <CourtLines />
      <ol className="absolute inset-0">
        {ZERO_82_SLOTS.map((slot) => (
          <li
            key={slot}
            className="absolute flex w-[18%] max-w-[112px] -translate-x-1/2 flex-col items-center"
            style={{ left: `${SPOTS[slot].x}%`, top: `${SPOTS[slot].y}%` }}
          >
            <Jersey league={league} slot={slot} pick={picks[slot]} lit={highlight === slot} showBpm={showBpm} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Jersey({
  league,
  slot,
  pick,
  lit,
  showBpm,
}: {
  league: ArcadeLeague;
  slot: Zero82Slot;
  pick?: LineupPick;
  lit: boolean;
  showBpm?: boolean;
}) {
  const player = pick ? league.players[pick.row.pid] : null;
  const look = pick ? arcadeTeamLook(pick.team, pick.row.season) : null;
  return (
    <div
      key={pick?.row.pid ?? "open"}
      className={cn(
        "flex w-full flex-col items-center transition-transform duration-200",
        pick && "arcade-pop",
        lit && "-translate-y-1 scale-[1.06]"
      )}
      style={look ? ({ "--jersey": look.primary, "--trim": look.secondary } as CSSProperties) : undefined}
    >
      <div className="relative w-full">
        {player ? (
          <PlayerAvatar
            player={player}
            className="absolute left-1/2 top-0 z-10 size-[42%] -translate-x-1/2 -translate-y-[38%] text-[11px] ring-2 ring-white shadow-md"
          />
        ) : null}
        <svg
          viewBox="0 0 100 112"
          className={cn("w-full overflow-visible drop-shadow-[0_6px_8px_rgb(0_0_0/0.22)]", lit && "drop-shadow-[0_0_10px_#ffc53d]")}
          aria-hidden
        >
          <path
            d={JERSEY_PATH}
            fill={look ? look.primary : "rgb(255 255 255 / 0.28)"}
            stroke={look ? look.secondary : lit ? "#ffc53d" : "rgb(255 255 255 / 0.85)"}
            strokeWidth={look ? 4 : 2.5}
            strokeDasharray={look ? undefined : "6 5"}
            strokeLinejoin="round"
          />
          {look && player ? (
            <text
              x="50"
              y="50"
              textAnchor="middle"
              fill={look.ink}
              fontSize={lastName(player.name).length > 9 ? 9 : 11}
              fontWeight="700"
              letterSpacing="0.06em"
            >
              {lastName(player.name).toUpperCase()}
            </text>
          ) : null}
          <text
            x="50"
            y={look ? 88 : 72}
            textAnchor="middle"
            fill={look ? look.ink : "rgb(255 255 255 / 0.95)"}
            fontSize={look ? 30 : 28}
            fontWeight="800"
            className="score-num"
          >
            {slot}
          </text>
        </svg>
      </div>
      <span
        className={cn(
          "mt-1.5 max-w-[170%] truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight shadow-sm sm:text-[11px]",
          pick ? "bg-white text-neutral-900" : "bg-black/25 text-white"
        )}
      >
        {pick ? playerLabel(league, pick.row.pid) : "Open"}
      </span>
      {pick ? (
        <span className="mt-0.5 whitespace-nowrap rounded-full bg-black/30 px-1.5 text-[9.5px] font-semibold text-white sm:text-[10.5px]">
          {pick.row.season}
          {showBpm && pick.row.bpm != null ? ` · ${formatBpm(pick.row.bpm)}` : ""}
        </span>
      ) : null}
    </div>
  );
}

function CourtLines() {
  return (
    <svg
      viewBox="0 0 500 400"
      className="absolute inset-0 -z-10 size-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden
    >
      <rect x="6" y="6" width="488" height="420" rx="2" />
      <rect x="170" y="6" width="160" height="190" fill="rgb(255 255 255 / 0.1)" />
      <circle cx="250" cy="196" r="60" />
      <path d="M210 60a40 40 0 0 0 80 0" />
      <path d="M30 6v142a237.5 237.5 0 0 0 440 0V6" />
      <line x1="220" y1="46" x2="280" y2="46" strokeWidth="4" />
      <circle cx="250" cy="60" r="8" stroke="#ff7a45" />
      <path d="M6 396h488" />
      <circle cx="250" cy="396" r="60" />
    </svg>
  );
}

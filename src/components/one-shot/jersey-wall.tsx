"use client";

import { JERSEY_PATH } from "@/components/arcade/jersey-path";
import { calendar, nodeLabel } from "@/one-shot/career";
import type { LifeState } from "@/one-shot/types";

import { type Kit, kitFor } from "./kit";
import { Panel } from "./ui";

export function Jersey({ kit, size = 44, label }: { kit: Kit; size?: number; label?: string }) {
  return (
    <svg viewBox="0 0 100 112" width={size} height={size * 1.12} role="img" aria-label={label} className="block">
      <path d={JERSEY_PATH} fill={kit.primary} stroke={kit.secondary} strokeWidth="6" strokeLinejoin="round" />
      <path d="M31 4C35 17 65 17 69 4" fill="none" stroke={kit.secondary} strokeWidth="9" />
      {kit.number !== null ? (
        <text x="50" y="80" textAnchor="middle" fontSize="44" fontWeight="800" fill={kit.ink} stroke={kit.secondary} strokeWidth="1.5" paintOrder="stroke" className="font-sans tabular-nums">
          {kit.number}
        </text>
      ) : null}
    </svg>
  );
}

interface Hung {
  teamName: string;
  levelLabel: string;
  from: number;
  to: number;
  gp: number;
  kit: Kit;
}

export function jerseysOf(life: LifeState): Hung[] {
  const out: Hung[] = [];
  for (const s of [...life.seasons, ...(life.season ? [life.season] : [])]) {
    if (!s.teamName || ["home", "playground", "unattached"].includes(s.node)) continue;
    const prev = out.find((h) => h.teamName === s.teamName);
    if (prev) {
      prev.to = Math.max(prev.to, s.calendarYear);
      prev.gp += s.gp;
      continue;
    }
    out.push({ teamName: s.teamName, levelLabel: s.levelLabel, from: s.calendarYear, to: s.calendarYear, gp: s.gp, kit: kitFor(life.seed, s.node, s.teamName) });
  }
  const p = life.placement;
  if (!life.after && p.teamName && !out.some((h) => h.teamName === p.teamName) && !["home", "playground", "unattached"].includes(p.node)) {
    const year = calendar(life).year;
    out.push({ teamName: p.teamName, levelLabel: nodeLabel(p.node, p.countryId, p.leagueId), from: year, to: year, gp: 0, kit: kitFor(life.seed, p.node, p.teamName) });
  }
  return out;
}

export function JerseyWall({ life }: { life: LifeState }) {
  const hung = jerseysOf(life);
  const current = life.placement.teamName;
  return (
    <Panel id="os-jerseys" title="Jerseys">
      {hung.length === 0 ? (
        <p className="text-[12px] text-[var(--os-dim)]">No team jersey yet. The first one comes with a school team or a club.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
          {hung.map((h) => {
            const now = h.teamName === current;
            const years = h.from === h.to ? `${h.from}` : `${h.from}–${String(h.to).slice(2)}`;
            return (
              <li
                key={h.teamName}
                title={`${h.teamName}, ${h.levelLabel}. ${years}. ${h.gp} games.`}
                className={`flex flex-col items-center rounded-lg px-1.5 pb-1.5 pt-2 text-center ${now ? "bg-[var(--os-panel2)] ring-1 ring-[var(--os-teal)]" : "bg-[var(--os-page)]"}`}
              >
                <Jersey kit={h.kit} size={40} label={`${h.teamName} jersey${h.kit.number !== null ? `, number ${h.kit.number}` : ""}`} />
                <p className="mt-1 line-clamp-2 w-full text-[11px] font-medium leading-tight">{h.teamName}</p>
                <p className="font-mono text-[10px] tabular-nums text-[var(--os-dim)]">{now ? "Now" : years}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

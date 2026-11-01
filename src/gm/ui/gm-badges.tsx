"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { SectionFrame } from "@/components/layout/section-frame";
import { ATTRIBUTE_LABEL } from "@/gm/engine/attributes";
import { BADGES, BADGE_LEVELS, BADGE_REQUIREMENTS, BADGE_XP, badgeCap, badgeEarned, badgeLevel, badgeSkill, defaultBadgeFocus, ensureBadges } from "@/gm/engine/badges";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmBadgeId, GmPlayer } from "@/gm/types";

const tones = ["border-border text-muted-foreground", "border-amber-700/60 text-amber-700 dark:text-amber-400", "border-slate-400/70 text-slate-600 dark:text-slate-200", "border-yellow-500/70 text-yellow-700 dark:text-yellow-300", "border-purple-500/70 text-purple-700 dark:text-purple-300", "border-cyan-500/70 text-cyan-700 dark:text-cyan-300"];
function BadgeChip({ name, level }: { name: string; level: number }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${tones[level]}`}><Shield size={13} aria-hidden="true" />{name} · {BADGE_LEVELS[level]}</span>;
}
export function GmBadgeSummary({ player }: { player: GmPlayer }) {
  const ready = ensureBadges(player);
  const earned = BADGES.filter(b => badgeLevel(ready,b.id) > 0).sort((a,b) => badgeLevel(ready,b.id)-badgeLevel(ready,a.id));
  return <div className="flex flex-wrap gap-2" aria-label={`Skill badges for ${player.name}`}>{earned.length ? earned.map(b => <span key={b.id} title={b.effect}><BadgeChip name={b.name} level={badgeLevel(ready,b.id)} /></span>) : <p className="text-sm text-muted-foreground">No active badges yet. Relevant game actions earn progress toward eligible skills.</p>}</div>;
}
export function GmBadges({ roster }: { roster: GmPlayer[] }) {
  const [selected,setSelected] = useState("");
  const setFocus = useGmStore(s => s.setBadgeFocus);
  const raw = roster.find(p => p.id === selected) ?? roster[0];
  if (!raw) return null;
  const player = ensureBadges(raw);
  const focus = defaultBadgeFocus(player);
  return <SectionFrame id="development-badges" title="Skill badges" description="Bronze, Silver, Gold, Hall of Fame, Legend. Earn progress through official games, then meet the skill requirement for each level. CPU players follow the same rules. Badges add small situational bonuses without changing overall or potential." bodySurface>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm">Player<select aria-label="Badge player" className="w-full rounded-lg border border-border bg-background px-3 py-2" value={player.id} onChange={e => setSelected(e.target.value)}>{roster.map(p => <option key={p.id} value={p.id}>{p.name} · {p.position}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm">Badge emphasis<select aria-label={`Badge emphasis for ${player.name}`} className="w-full rounded-lg border border-border bg-background px-3 py-2" value={player.badgeFocus ?? ""} onChange={e => setFocus(player.id,(e.target.value || null) as GmBadgeId | null)}><option value="">Auto: follows skills and development focus</option>{BADGES.map(b => <option key={b.id} value={b.id} disabled={badgeCap(player,b.id) <= badgeEarned(player,b.id) && player.badgeFocus !== b.id}>{b.name}</option>)}</select></label>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{focus ? `${BADGES.find(b => b.id === focus)!.name} earns 25% more action XP.` : "All currently eligible levels are earned."} An active mentor with a higher badge adds 10% to that skill's action XP. Each badge earns at most 24 base XP per game. Idle time and changing emphasis grant no XP.</p>
    <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2" data-testid="badge-board">{BADGES.map(b => {
      const earned = badgeEarned(player,b.id), level = badgeLevel(player,b.id), cap = badgeCap(player,b.id);
      const xp = player.badges!.xp[b.id] ?? 0;
      const next = Math.min(5,earned+1), target = BADGE_XP[next]!;
      return <article key={b.id} className="min-w-0 rounded-xl border border-border p-4" data-testid={`badge-${b.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><BadgeChip name={b.name} level={level} />{focus === b.id ? <span className="text-xs font-semibold">Emphasis +25%</span> : null}</div>
        <p className="mt-3 text-sm">{b.effect}.</p><p className="mt-2 text-xs text-muted-foreground">{b.action}. {b.attributes.map(key => ATTRIBUTE_LABEL[key]).join(" / ")}: {Math.round(badgeSkill(player,b.id))}. Current skill cap: {BADGE_LEVELS[cap]}.</p>
        {earned < 5 ? <><label className="mt-3 block text-xs" htmlFor={`badge-progress-${b.id}`}>{Math.floor(xp)}/{target} XP toward {BADGE_LEVELS[next]} · requires skill {BADGE_REQUIREMENTS[next]}{cap < next ? " · Skill requirement unmet" : ""}</label><progress id={`badge-progress-${b.id}`} aria-label={`${b.name} progress`} className="mt-1 h-2 w-full accent-primary" max={target} value={xp} /></> : <p className="mt-3 text-xs font-semibold">Legend earned · {Math.floor(xp)} XP</p>}
        {earned > level ? <p className="mt-2 text-xs text-muted-foreground">{BADGE_LEVELS[earned]} progress retained. Active level follows current attributes.</p> : null}
      </article>;
    })}</div>
    <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold">Level requirements and save rules</summary><p className="mt-2">Bronze: skill 65 and 120 XP. Silver: 75 and 360. Gold: 84 and 900. Hall of Fame: 92 and 1,800. Legend: 97 and 3,200. Two-skill badges use their average; Glass cleaner, Defensive anchor and Clutch scorer use the stronger skill. Progress stops at the current skill cap, survives trades and seasons, and never falls through lack of use. Aging can lower the active level. All-Star and summer exhibitions grant no XP.</p><p className="mt-2">Existing players receive up to three signature badges from current skills, at Gold or below. Rookies and unsigned players start with at most one Bronze badge. No hidden potential is used.</p></details>
    <Link href={`/gm/player/${player.id}`} className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Open {player.name}&apos;s player card</Link>
  </SectionFrame>;
}

"use client";

import Link from "next/link";
import { athleticTools } from "@/gm/engine/combine-evaluation";
import { displayPlayerName } from "@/gm/lib/selectors";
import type { GmLeagueState, GmPlayer } from "@/gm/types";

const BADGE = {
  leaping: "Aerial assault",
  chaser: "Chase-down artist",
  burst: "Explosive first step",
} as const;

export function GmCombineHighlights({league, compact=false}:{league:GmLeagueState;compact?:boolean}) {
  if (!league.combineDone) return null;
  const seen = new Set(league.draftPool);
  const measured = league.players.filter(p=>seen.has(p.id) && !!p.scoutProfile?.combine);
  const score = (p:GmPlayer) => {
    const t=p.scoutProfile!.combine!;
    return (t.verticalIn-25)*2.15 + (3.55-t.sprint)*82 +
      (t.laneAgility ? (12-t.laneAgility)*8 : 0);
  };
  const rows = [...measured].sort((a,b)=>score(b)-score(a) || a.id.localeCompare(b.id));
  const standouts=rows.filter(p=> {
    const tools=athleticTools(p);
    return tools.leaping||tools.chaser||tools.burst;
  });
  const top = (compact ? standouts.slice(0,6) : rows.slice(0,18));
  const eligible = (p:GmPlayer) => {
    const t=athleticTools(p);
    return (Object.keys(BADGE) as Array<keyof typeof BADGE>).filter(k=>t[k]).map(k=>BADGE[k]);
  };
  return <section aria-label="Draft combine measurements" data-testid="gm-combine-results" className="rounded-xl border border-border bg-background p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><h3 className="text-lg font-bold">Combine results</h3><p className="mt-1 text-xs text-muted-foreground">Max running vertical and ¾-court sprint. A rare athletic outlier is a physical advantage, not a guaranteed star.</p></div>
      <span className="rounded-lg bg-secondary px-3 py-1 text-sm font-bold">{measured.length} prospects tested</span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg bg-secondary/40 p-3"><span className="text-xs text-muted-foreground">Highest vertical</span><p className="mt-1 font-bold">{rows.slice().sort((a,b)=>(b.scoutProfile?.combine?.verticalIn??0)-(a.scoutProfile?.combine?.verticalIn??0))[0]?.scoutProfile?.combine?.verticalIn ?? "—"}″</p></div>
      <div className="rounded-lg bg-secondary/40 p-3"><span className="text-xs text-muted-foreground">Fastest sprint</span><p className="mt-1 font-bold">{rows.slice().sort((a,b)=>(a.scoutProfile?.combine?.sprint??9)-(b.scoutProfile?.combine?.sprint??9))[0]?.scoutProfile?.combine?.sprint.toFixed(2) ?? "—"}s</p></div>
      <div className="rounded-lg bg-secondary/40 p-3"><span className="text-xs text-muted-foreground">Athletic outliers</span><p className="mt-1 font-bold">{standouts.length} badge candidates</p></div>
    </div>
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
        <thead><tr className="border-b border-border bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
          <th className="p-3">Prospect</th><th className="p-2">Wingspan</th><th className="p-2">Standing reach</th>
          <th className="p-2">Max vertical</th><th className="p-2">¾ court</th><th className="p-2">Lane agility</th><th className="p-2">Scout notes</th>
        </tr></thead>
        <tbody>{top.map(p=>{
          const m=p.scoutProfile!.combine!, perks=eligible(p);
          return <tr key={p.id} className="border-b border-border last:border-0">
            <td className="p-3"><Link className="font-semibold underline-offset-2 hover:underline" href={"/gm/draft?prospect="+encodeURIComponent(p.id)}>{displayPlayerName(p)}</Link><span className="block text-xs text-muted-foreground">{p.position} · board #{p.consensusRank??"?"}</span></td>
            <td className="p-2 tabular-nums">{m.wingspanIn}″</td><td className="p-2 tabular-nums">{m.standingReachIn??"—"}{m.standingReachIn?"″":""}</td>
            <td className="p-2 font-semibold tabular-nums">{m.verticalIn}″</td><td className="p-2 tabular-nums">{m.sprint.toFixed(2)}s</td>
            <td className="p-2 tabular-nums">{m.laneAgility?.toFixed(2)??"—"}{m.laneAgility?"s":""}</td>
            <td className="p-2"><span className="block font-semibold">{athleticTools(p).label}</span>
              {perks.length ? <span className="font-medium text-emerald-700 dark:text-emerald-300">{perks.join(", ")} eligible</span> : <span className="text-muted-foreground">No rare athletic badge lane</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Physical outliers get a focus-specific development advantage while young. An eligible badge is not an earned badge: matching basketball skills and game reps are still required. {compact ? "Open the draft board for full measurements." : "Combine results do not reveal hidden learning profiles or career ceilings."}</p>
  </section>;
}

"use client";
import Link from "next/link";
import { GmBadges } from "@/gm/ui/gm-badges";
import { GmMentorshipCards, GmIndividualTraining } from "@/gm/ui/gm-mentorship-cards";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { TeamLogo } from "@/components/brand/team-logo";
import { SectionFrame } from "@/components/layout/section-frame";
import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { useGmStore } from "@/gm/state/gm-store";
import { CAMP_FOCUSES, campSkillChanges, campSlots } from "@/gm/engine/season-development";
import { ATTRIBUTE_LABEL } from "@/gm/engine/attributes";
import { flowOf } from "@/gm/engine/season-flow-state";
import { developmentOutlook } from "@/gm/engine/development-profile";
import type { GmCampFocus } from "@/gm/types";

const control = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
export function GmDevelopment() {
  const league = useGmStore(s => s.league);
  const assignCamp = useGmStore(s => s.setCampAssignment);
  const runCamp = useGmStore(s => s.runTrainingCamp);
  const note = useGmStore(s => s.lastDevelopmentNote);
  if (!league) return null;
  const roster = league.players.filter(p => p.teamId === league.userTeamId && p.contract).sort((a,b) => a.age - b.age || a.name.localeCompare(b.name));
  const flow = flowOf(league);
  const currentChecks = league.devMarks?.season === league.season ? league.devMarks : undefined;
  const checkpoints = [
    { id: "quarter1" as const, label: "Opening stretch" },
    { id: "january" as const, label: "Midseason" },
    { id: "quarter3" as const, label: "Closing stretch" },
    { id: "finale" as const, label: "Season finale" },
  ];
  const changedPlayers = roster.map(player => ({ player, before: player.developmentBaseline?.season === league.season ? player.developmentBaseline.overall : player.sheet?.priorOverall ?? player.sheet?.overall ?? 0, after: player.sheet?.overall ?? 0 })).sort((a,b) => b.after-b.before-(a.after-a.before));
  const campOpen = flow.stage === "training_camp" && !flow.campResults;
  const assignments = roster.filter(p => !p.injury && flow.campAssignments?.[p.id]);
  // Historical save key 'ceilingGrowth' also stores learning discoveries for
  // new generated players. Never present those events as +OVR potential.
  const milestones = roster.flatMap(player => (player.ceilingGrowth?.awards ?? []).map(award => ({ ...award, player }))).sort((a,b) => b.season - a.season);
  return <div className="flex min-w-0 flex-col gap-4" data-testid="development-desk">
    <header><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><TeamLogo teamKey={league.userTeamId} size="sm" />Development</h1></header>
    
    {note ? <p role="status" className="text-sm">{note}</p> : null}
    <div id="development-focuses" className="scroll-mt-32">
      <GmIndividualTraining roster={roster} season={league.season} />
    </div>
    <GmMentorshipCards key={league.userTeamId + ":" + league.season} league={league} roster={roster} />
    <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Season progress</summary><div id="development-progress" className="mt-3 scroll-mt-32">
      <SectionFrame title="Season growth" description="Skills change in-season; the biggest reviews happen after the season.">
        <ol className="grid gap-2 sm:grid-cols-4" aria-label="Season development checkpoints">{checkpoints.map((row,index) => {
          const complete = Boolean(currentChecks?.[row.id]);
          return <li key={row.id} className={"rounded-lg border p-3 " + (complete ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/20")}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Check {index + 1}</p>
            <p className="mt-1 text-sm font-semibold">{row.label}</p>
            <p className="mt-2 text-xs">{complete ? "Progress recorded" : "Upcoming"}</p>
          </li>;
        })}</ol>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground"><tr><th className="p-3">Player</th><th className="p-3">Current OVR</th><th className="p-3">Season change</th><th className="p-3">Focus</th><th className="p-3">Outlook</th></tr></thead>
            <tbody className="divide-y divide-border">{changedPlayers.map(({player,before,after}) => {
              const delta = Math.round(after-before);
              return <tr key={player.id}>
                <td className="p-3"><div className="flex items-center gap-2"><GmPlayerPortrait player={player} /><Link href={"/gm/player/"+player.id} className="font-semibold hover:underline">{player.name}</Link></div></td>
                <td className="p-3 font-bold tabular-nums">{Math.round(after)}</td>
                <td className={"p-3 font-bold tabular-nums " + (delta>0?"text-emerald-700 dark:text-emerald-300":delta<0?"text-rose-700 dark:text-rose-300":"text-muted-foreground")}>{delta>0?"+":""}{delta}</td>
                <td className="p-3 capitalize">{player.developmentFocus ?? "balanced"}</td>
                <td className="p-3">{developmentOutlook(player, league.season).label}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">An early breakout can change a young player&apos;s trajectory. Playing time alone never guarantees growth.</p>
      </SectionFrame>
    </div></details>
    <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Skill badges</summary><div className="mt-3"><GmBadges roster={roster} /></div></details>
    <details open={flow.stage === "training_camp" || undefined} className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Training camp{campOpen ? " · Available" : ""}</summary><div id="development-camp" className="mt-3 scroll-mt-32"><SectionFrame title="Training camp" bodySurface>
      {flow.campResults ? <ul className="divide-y divide-border text-sm">{flow.campResults.filter(row => roster.some(p => p.id === row.playerId)).map(row => <li key={row.playerId} className="py-3"><span className="inline-flex items-center gap-2"><GmPlayerPortrait player={roster.find(p => p.id === row.playerId)!} /><strong>{row.name}</strong></span> · {row.focus}<p className="mt-1 text-muted-foreground">{row.gains.join(", ") || "Skills already at their limit."} {row.tradeoff}</p></li>)}</ul> : campOpen ? <>
        <p className="text-sm">{assignments.length}/{campSlots(league)} camp slots assigned</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{roster.map(player => <label key={player.id} className="grid gap-2 text-sm"><span className="flex items-center gap-2"><GmPlayerPortrait player={player} />{player.name}{player.injury ? " · Injured" : ""}</span><select className={control} aria-label={`Camp focus for ${player.name}`} disabled={Boolean(player.injury)} value={flow.campAssignments?.[player.id] ?? ""} onChange={e => assignCamp(player.id, (e.target.value || null) as GmCampFocus | null)}><option value="">No camp</option>{CAMP_FOCUSES.map(focus => <option key={focus.id} value={focus.id} disabled={!flow.campAssignments?.[player.id] && assignments.length >= campSlots(league)}>{focus.label}</option>)}</select>{flow.campAssignments?.[player.id] ? <span className="text-xs text-muted-foreground">{campSkillChanges(league, player, flow.campAssignments[player.id]!).map(change => `${ATTRIBUTE_LABEL[change.key]} ${change.before} to ${change.after}`).join(" · ")}</span> : null}</label>)}</div>
        <div className="mt-4"><GmConfirmAction label="Run individual camp" title="Confirm training camp" confirmLabel="Run camp" disabled={!assignments.length} onConfirm={runCamp}><p>{assignments.map(p => `${p.name}: ${flow.campAssignments?.[p.id]}`).join(". ")}. Gains apply once, with two games of fatigue or a small soreness risk.</p></GmConfirmAction></div>
      </> : <p className="text-sm text-muted-foreground">Individual camp opens after summer league and before opening-night roster checks.</p>}
      <Link href="/gm/offseason" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Open season hub</Link>
    </SectionFrame></div></details>
    <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Breakout history</summary><div id="development-history" className="scroll-mt-32"><SectionFrame title="Development milestones" description="Breakouts and veteran guidance can improve future learning. No guaranteed OVR jumps.">
      {milestones.length ? <ul className="divide-y divide-border">{milestones.map((award,index) => <li key={award.player.id + award.season + award.source + index} className="py-3 text-sm"><span className="inline-flex items-center gap-2"><GmPlayerPortrait player={award.player} /><strong>{award.player.name}</strong></span> · {award.season - 1}-{String(award.season).slice(-2)} · {award.source === "mentorship" ? "Mentoring" : "Breakout"}{award.player.draftModel === 2 ? " · Learning breakthrough" : ` · Legacy ceiling +${award.gain}`}<p className="mt-1 text-muted-foreground">{award.reason}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">Season-end development discoveries will appear here. Extra minutes alone don&apos;t guarantee progress.</p>}
    </SectionFrame></div></details>
  </div>;
}

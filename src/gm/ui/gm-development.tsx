"use client";
import Link from "next/link";
import { GmBadges } from "@/gm/ui/gm-badges";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { TeamLogo } from "@/components/brand/team-logo";
import { SectionFrame } from "@/components/layout/section-frame";
import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { useGmStore } from "@/gm/state/gm-store";
import { activeMentor, activeMentorships, MAX_TEAM_MENTORSHIPS, mentorEligible, mentorshipBonus, workEthicOf } from "@/gm/engine/development";
import { BADGES, BADGE_LEVELS, badgeLevel, ensureBadges, mentorBadgeTargets } from "@/gm/engine/badges";
import { CAMP_FOCUSES, campSkillChanges, campSlots } from "@/gm/engine/season-development";
import { ATTRIBUTE_LABEL } from "@/gm/engine/attributes";
import { flowOf } from "@/gm/engine/season-flow-state";
import { traitLabel } from "@/gm/engine/dev-traits";
import type { GmCampFocus, GmPlayer } from "@/gm/types";

const control = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const focusChoices = ["balanced", "shooting", "creation", "defense", "rebounding"] as const;
export function GmDevelopment() {
  const league = useGmStore(s => s.league);
  const setFocus = useGmStore(s => s.setDevelopmentFocus);
  const setPlan = useGmStore(s => s.setDevelopmentPlan);
  const pair = useGmStore(s => s.assignPlayerMentor);
  const assignCamp = useGmStore(s => s.setCampAssignment);
  const runCamp = useGmStore(s => s.runTrainingCamp);
  const note = useGmStore(s => s.lastDevelopmentNote);
  if (!league) return null;
  const roster = league.players.filter(p => p.teamId === league.userTeamId && p.contract).sort((a,b) => a.age - b.age || a.name.localeCompare(b.name));
  const flow = flowOf(league);
  const activePairs = activeMentorships(league.players, league.userTeamId);
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
  const awards = roster.flatMap(player => (player.ceilingGrowth?.awards ?? []).map(award => ({ ...award, player }))).sort((a,b) => b.season - a.season);
  return <div className="flex min-w-0 flex-col gap-4" data-testid="development-desk">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><TeamLogo teamKey={league.userTeamId} size="sm" />Development</h1><span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-semibold">{activePairs.length}/{MAX_TEAM_MENTORSHIPS} mentors assigned</span></header>
    
    {note ? <p role="status" className="text-sm">{note}</p> : null}
    <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Season progress</summary><div id="development-progress" className="mt-3 scroll-mt-32">
      <SectionFrame title="Season development tracker" description="Small progress accumulates through four calendar checkpoints. Most meaningful jumps and trait reviews take place at the offseason progression window.">
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
            <thead className="bg-secondary/40 text-xs text-muted-foreground"><tr><th className="p-3">Player</th><th className="p-3">Current OVR</th><th className="p-3">Season change</th><th className="p-3">Development</th><th className="p-3">Potential ceiling</th></tr></thead>
            <tbody className="divide-y divide-border">{changedPlayers.map(({player,before,after}) => {
              const delta = Math.round(after-before);
              return <tr key={player.id}>
                <td className="p-3"><div className="flex items-center gap-2"><GmPlayerPortrait player={player} /><Link href={"/gm/player/"+player.id} className="font-semibold hover:underline">{player.name}</Link></div></td>
                <td className="p-3 font-bold tabular-nums">{Math.round(after)}</td>
                <td className={"p-3 font-bold tabular-nums " + (delta>0?"text-emerald-700 dark:text-emerald-300":delta<0?"text-rose-700 dark:text-rose-300":"text-muted-foreground")}>{delta>0?"+":""}{delta}</td>
                <td className="p-3">{traitLabel(player.sheet?.potential.trait)}</td>
                <td className="p-3 tabular-nums">{Math.round(player.sheet?.potential.ceiling ?? 0)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Development traits may change in the offseason following breakout seasons and major accolades. The +4 cap on mentorship and breakout potential increases remains separate from trait evolution.</p>
      </SectionFrame>
    </div></details>
    <section aria-label="Mentorship program" className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Mentorship</h2><span className="text-xs font-semibold tabular-nums">{activePairs.length} of {MAX_TEAM_MENTORSHIPS} slots</span></div>
      <p className="mt-1 text-xs text-muted-foreground">Pair a young player with a veteran at the same position. Playing together improves growth and can teach up to two badges from the veteran&apos;s skillset.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{Array.from({length: MAX_TEAM_MENTORSHIPS},(_,index) => {
        const pairing = activePairs[index];
        if (!pairing) return <div key={index} className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-secondary/15 p-4 text-center text-sm text-muted-foreground">Open mentor slot · Choose a veteran below</div>;
        const {learner,mentor} = pairing;
        const transfer = mentorBadgeTargets(learner,mentor);
        return <article key={learner.id} className="rounded-lg border border-border bg-secondary/20 p-3" data-testid={"mentorship-slot-"+index}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2"><GmPlayerPortrait player={mentor} size="sm"/><div className="min-w-0"><p className="truncate text-sm font-semibold">{mentor.name}</p><p className="text-xs text-muted-foreground">Mentor · {Math.round(mentor.sheet?.overall ?? 0)} OVR</p></div></div>
            <button type="button" className="text-xs font-medium underline underline-offset-4" onClick={() => pair(learner.id,null)}>End pairing</button>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3"><GmPlayerPortrait player={learner} size="sm"/><div className="min-w-0"><p className="truncate text-sm font-semibold">{learner.name}</p><p className="text-xs text-muted-foreground">Learning · {learner.mentorship?.season === league.season ? learner.mentorship.sharedGames : 0} games together · +{Math.round(mentorshipBonus(learner,league.players)*100)}% growth</p></div></div>
          <div className="mt-3 flex flex-wrap gap-1.5">{transfer.length ? transfer.map(id => {
            const badge = BADGES.find(b => b.id === id)!;
            return <span key={id} className="rounded-md border border-border bg-background px-2 py-1 text-xs">{badge.name} · {BADGE_LEVELS[badgeLevel(ensureBadges(mentor),id)]}</span>;
          }) : <span className="text-xs text-muted-foreground">No transferable badges at current skill levels</span>}</div>
          {transfer.length ? <p className="mt-2 text-xs text-muted-foreground">Badges taught through shared games. Skill requirements still apply.</p> : null}
        </article>;
      })}</div>
    </section>
    <div id="development-focuses" className="scroll-mt-32"><SectionFrame title="Player plans" description="Set each player's focus and role. Mentorship is limited to two young players per team.">
      <div className="divide-y divide-border rounded-lg border border-border">{roster.map(player => {
        const mentor = activeMentor(player,league.players);
        const mentors = roster.filter(vet => mentorEligible(player,vet));
        const badges = BADGES.filter(b => badgeLevel(ensureBadges(player),b.id) > 0);
        const highBadge = badges.reduce((highest,b) => Math.max(highest,badgeLevel(ensureBadges(player),b.id)),0);
        const full = activePairs.length >= MAX_TEAM_MENTORSHIPS && !mentor;
        return <article key={player.id} className="grid min-w-0 items-center gap-3 p-3 lg:grid-cols-[minmax(150px,1.3fr)_minmax(115px,1fr)_minmax(115px,1fr)_minmax(180px,1.5fr)]" data-testid={"development-player-"+player.id}>
          <div className="flex min-w-0 items-center gap-3"><GmPlayerPortrait player={player} size="sm"/><div className="min-w-0"><Link href={"/gm/player/"+player.id} className="block truncate text-sm font-semibold hover:underline">{player.name}</Link><p className="text-xs text-muted-foreground">{player.position} · {player.age} yrs · {Math.round(player.sheet?.overall ?? 0)} OVR</p><p className="text-xs text-muted-foreground">{badges.length} badges{highBadge ? " · best "+BADGE_LEVELS[highBadge] : ""}</p></div></div>
          <label className="grid gap-1 text-xs text-muted-foreground">Skill focus<select aria-label={"Development focus for "+player.name} className={control} value={player.developmentFocus ?? "balanced"} onChange={e => setFocus(player.id,e.target.value as NonNullable<GmPlayer["developmentFocus"]>)}>{focusChoices.map(focus => <option key={focus} value={focus}>{focus[0]!.toUpperCase()+focus.slice(1)}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Development plan<select aria-label={"Development plan for "+player.name} className={control} value={player.developmentPlan ?? "balanced"} onChange={e => setPlan(player.id,e.target.value as NonNullable<GmPlayer["developmentPlan"]>)}><option value="balanced">Balanced reps</option><option value="practice">Skills work</option><option value="rotation">Rotation reps</option></select></label>
          {player.age <= 25 ? <label className="grid gap-1 text-xs text-muted-foreground">Veteran mentor<select aria-label={"Mentor for "+player.name} className={control} value={mentor?.id ?? ""} onChange={e => pair(player.id,e.target.value || null)}><option value="">{full ? "Slots full" : "No mentor"}</option>{mentors.map(vet => {
            const used = activePairs.some(pairing => pairing.learner.id !== player.id && pairing.mentor.id === vet.id);
            return <option key={vet.id} value={vet.id} disabled={used || full}>{vet.name} · {Math.round(vet.sheet?.overall ?? 0)} OVR · {BADGES.filter(b => badgeLevel(ensureBadges(vet),b.id)>0).length} badges{used ? " · Already mentoring" : ""}</option>;
          })}</select></label> : <div className="text-xs text-muted-foreground">Veteran · Work ethic {workEthicOf(player)}/100</div>}
          {player.sheet?.developmentReport ? <details className="text-xs text-muted-foreground lg:col-span-4"><summary className="cursor-pointer">Latest progress</summary><p className="mt-1">{player.sheet.developmentReport.gains.join(", ")} · {player.sheet.developmentReport.reasons.join(". ")}</p></details> : null}
        </article>;
      })}</div>
    </SectionFrame></div>
    <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Skill badges</summary><div className="mt-3"><GmBadges roster={roster} /></div></details>
    <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Training camp{campOpen ? " · Available" : ""}</summary><div id="development-camp" className="mt-3 scroll-mt-32"><SectionFrame title="Training camp" bodySurface>
      {flow.campResults ? <ul className="divide-y divide-border text-sm">{flow.campResults.filter(row => roster.some(p => p.id === row.playerId)).map(row => <li key={row.playerId} className="py-3"><span className="inline-flex items-center gap-2"><GmPlayerPortrait player={roster.find(p => p.id === row.playerId)!} /><strong>{row.name}</strong></span> · {row.focus}<p className="mt-1 text-muted-foreground">{row.gains.join(", ") || "Skills already at their limit."} {row.tradeoff}</p></li>)}</ul> : campOpen ? <>
        <p className="text-sm">{assignments.length}/{campSlots(league)} camp slots assigned</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{roster.map(player => <label key={player.id} className="grid gap-2 text-sm"><span className="flex items-center gap-2"><GmPlayerPortrait player={player} />{player.name}{player.injury ? " · Injured" : ""}</span><select className={control} aria-label={`Camp focus for ${player.name}`} disabled={Boolean(player.injury)} value={flow.campAssignments?.[player.id] ?? ""} onChange={e => assignCamp(player.id, (e.target.value || null) as GmCampFocus | null)}><option value="">No camp</option>{CAMP_FOCUSES.map(focus => <option key={focus.id} value={focus.id} disabled={!flow.campAssignments?.[player.id] && assignments.length >= campSlots(league)}>{focus.label}</option>)}</select>{flow.campAssignments?.[player.id] ? <span className="text-xs text-muted-foreground">{campSkillChanges(league, player, flow.campAssignments[player.id]!).map(change => `${ATTRIBUTE_LABEL[change.key]} ${change.before} to ${change.after}`).join(" · ")}</span> : null}</label>)}</div>
        <div className="mt-4"><GmConfirmAction label="Run individual camp" title="Confirm training camp" confirmLabel="Run camp" disabled={!assignments.length} onConfirm={runCamp}><p>{assignments.map(p => `${p.name}: ${flow.campAssignments?.[p.id]}`).join(". ")}. Gains apply once, with two games of fatigue or a small soreness risk.</p></GmConfirmAction></div>
      </> : <p className="text-sm text-muted-foreground">Individual camp opens after summer league and before opening-night roster checks.</p>}
      <Link href="/gm/offseason" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Open season hub</Link>
    </SectionFrame></div></details>
    <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Breakout history</summary><div id="development-history" className="scroll-mt-32"><SectionFrame title="Breakouts and ceiling history" description="A young player needs at least 40 games and 1,000 minutes, efficient scoring, and production clearly above his opening rating. Breakouts can add 1 or 2 ceiling points; mentorship can add 1 to 3. All sources share a permanent +4 career limit.">
      {awards.length ? <ul className="divide-y divide-border">{awards.map((award,index) => <li key={award.player.id + award.season + award.source + index} className="py-3 text-sm"><span className="inline-flex items-center gap-2"><GmPlayerPortrait player={award.player} /><strong>{award.player.name}</strong></span> · {award.season - 1}-{String(award.season).slice(-2)} · {award.source} +{award.gain}<p className="mt-1 text-muted-foreground">{award.reason}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">Season-end ceiling changes will appear here. Extra minutes alone do not raise potential.</p>}
    </SectionFrame></div></details>
  </div>;
}

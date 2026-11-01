"use client";
import Link from "next/link";
import { GmBadges } from "@/gm/ui/gm-badges";
import { SectionFrame } from "@/components/layout/section-frame";
import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { useGmStore } from "@/gm/state/gm-store";
import { activeMentor, breakoutEvidence, CAREER_CEILING_LIMIT, mentorEligible, mentorshipBonus, mentorshipQuality, workEthicOf } from "@/gm/engine/development";
import { CAMP_FOCUSES, campSkillChanges, campSlots, campSorenessRisk } from "@/gm/engine/season-development";
import { ATTRIBUTE_LABEL } from "@/gm/engine/attributes";
import { flowOf } from "@/gm/engine/season-flow-state";
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
  const campOpen = flow.stage === "training_camp" && !flow.campResults;
  const assignments = roster.filter(p => !p.injury && flow.campAssignments?.[p.id]);
  const awards = roster.flatMap(player => (player.ceilingGrowth?.awards ?? []).map(award => ({ ...award, player }))).sort((a,b) => b.season - a.season);
  return <div className="flex min-w-0 flex-col gap-8" data-testid="development-desk">
    <header><h1 className="text-2xl font-bold tracking-tight">Development</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Set individual work, pair young players with veterans, and review the progress they earn on the court.</p></header>
    <nav aria-label="Development sections" className="flex flex-wrap gap-4 text-sm font-semibold"><a href="#development-focuses" className="underline underline-offset-4">Focuses and mentorship</a><a href="#development-badges" className="underline underline-offset-4">Skill badges</a><a href="#development-camp" className="underline underline-offset-4">Training camp</a><a href="#development-history" className="underline underline-offset-4">Ceiling history</a></nav>
    {note ? <p role="status" className="text-sm">{note}</p> : null}
    <div id="development-focuses" className="scroll-mt-32"><SectionFrame title="Focuses and mentorship" description="One veteran can mentor one teammate at the same position. Veterans must be at least 28 and five years older; learners must be 25 or younger. The growth bonus lasts while they remain teammates.">
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">{roster.map(player => {
        const mentor = activeMentor(player, league.players);
        const mentors = roster.filter(vet => mentorEligible(player, vet));
        const growth = player.ceilingGrowth?.total ?? 0;
        const evidence = breakoutEvidence(player, league.season);
        return <article key={player.id} className="min-w-0 rounded-xl border border-border bg-background/40 p-4" data-testid={"development-player-" + player.id}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={"/gm/player/" + player.id} className="font-semibold hover:underline">{player.name}</Link><p className="mt-1 text-xs text-muted-foreground">{player.position} · age {player.age} · OVR {Math.round(player.sheet?.overall ?? 0)} · Work habits {workEthicOf(player)}/100</p></div><span className="shrink-0 text-xs tabular-nums">Ceiling growth +{growth}/{CAREER_CEILING_LIMIT}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm">Skill focus<select aria-label={`Development focus for ${player.name}`} className={control} value={player.developmentFocus ?? "balanced"} onChange={e => setFocus(player.id, e.target.value as NonNullable<GmPlayer["developmentFocus"]>)}>{focusChoices.map(focus => <option key={focus} value={focus}>{focus[0]!.toUpperCase() + focus.slice(1)}</option>)}</select></label><label className="grid gap-1.5 text-sm">Development plan<select aria-label={`Development plan for ${player.name}`} className={control} value={player.developmentPlan ?? "balanced"} onChange={e => setPlan(player.id, e.target.value as NonNullable<GmPlayer["developmentPlan"]>)}><option value="balanced">Balanced reps</option><option value="practice">Skills work</option><option value="rotation">Rotation reps</option></select></label></div>
          {player.age <= 25 ? <div className="mt-4"><label className="grid gap-1.5 text-sm">Veteran mentor<select aria-label={`Mentor for ${player.name}`} className={control} value={mentor?.id ?? ""} onChange={e => pair(player.id, e.target.value || null)}><option value="">No active mentor</option>{mentors.map(vet => { const used = league.players.some(other => other.id !== player.id && activeMentor(other, league.players)?.id === vet.id); return <option key={vet.id} value={vet.id} disabled={used}>{vet.name} · OVR {Math.round(vet.sheet?.overall ?? 0)} · Work {workEthicOf(vet)}{used ? " · Already mentoring" : ""}</option>; })}</select></label><p className="mt-2 text-xs text-muted-foreground">{mentor ? `${mentor.name}: +${Math.round(mentorshipBonus(player, league.players) * 100)}% development. ${player.mentorship?.season === league.season ? player.mentorship.sharedGames : 0}/20 shared games toward a ${Math.round((0.03 + mentorshipQuality(mentor) * 0.09) * 100)}% season-end ceiling chance.` : player.mentorship ? "The previous pairing is inactive because the players are no longer eligible teammates." : mentors.length ? "A stronger veteran with better work habits gives a larger bonus." : "No eligible same-position veteran is on this roster."}</p><p className="mt-2 text-xs text-muted-foreground">Breakout review: {evidence.reason} {player.seasonLine?.gp ?? 0}/40 games · {Math.round(player.seasonLine?.min ?? 0)}/1,000 minutes.</p></div> : null}
          {player.sheet?.developmentReport ? <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Latest progress: {player.sheet.developmentReport.reasons.join(". ")}. {player.sheet.developmentReport.gains.join(", ")}</p> : null}
        </article>;
      })}</div>
    </SectionFrame></div>
    <GmBadges roster={roster} />
    <div id="development-camp" className="scroll-mt-32"><SectionFrame title="Preseason training camp" description={`Choose one or two players and a focus at the training-camp step. Gains apply once. Each participant gets two games of fatigue (2% shooting penalty), or up to a ${Math.round(campSorenessRisk(league) * 100)}% chance of one-game soreness. Skipping individual camp remains available in the season hub.`} bodySurface>
      {flow.campResults ? <ul className="divide-y divide-border text-sm">{flow.campResults.filter(row => roster.some(p => p.id === row.playerId)).map(row => <li key={row.playerId} className="py-3"><strong>{row.name}</strong> · {row.focus}<p className="mt-1 text-muted-foreground">{row.gains.join(", ") || "Skills already at their limit."} {row.tradeoff}</p></li>)}</ul> : campOpen ? <>
        <p className="text-sm">{assignments.length}/{campSlots(league)} camp slots assigned</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{roster.map(player => <label key={player.id} className="grid gap-2 text-sm">{player.name}{player.injury ? " · Injured" : ""}<select className={control} aria-label={`Camp focus for ${player.name}`} disabled={Boolean(player.injury)} value={flow.campAssignments?.[player.id] ?? ""} onChange={e => assignCamp(player.id, (e.target.value || null) as GmCampFocus | null)}><option value="">No camp</option>{CAMP_FOCUSES.map(focus => <option key={focus.id} value={focus.id} disabled={!flow.campAssignments?.[player.id] && assignments.length >= campSlots(league)}>{focus.label}</option>)}</select>{flow.campAssignments?.[player.id] ? <span className="text-xs text-muted-foreground">{campSkillChanges(league, player, flow.campAssignments[player.id]!).map(change => `${ATTRIBUTE_LABEL[change.key]} ${change.before} to ${change.after}`).join(" · ")}</span> : null}</label>)}</div>
        <div className="mt-4"><GmConfirmAction label="Run individual camp" title="Confirm training camp" confirmLabel="Run camp" disabled={!assignments.length} onConfirm={runCamp}><p>{assignments.map(p => `${p.name}: ${flow.campAssignments?.[p.id]}`).join(". ")}. Gains apply once, with two games of fatigue or a small soreness risk.</p></GmConfirmAction></div>
      </> : <p className="text-sm text-muted-foreground">Individual camp opens after summer league and before opening-night roster checks.</p>}
      <Link href="/gm/offseason" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Open season hub</Link>
    </SectionFrame></div>
    <div id="development-history" className="scroll-mt-32"><SectionFrame title="Breakouts and ceiling history" description="A young player needs at least 40 games and 1,000 minutes, efficient scoring, and production clearly above his opening rating. Breakouts can add 1 or 2 ceiling points; mentorship can add 1 to 3. All sources share a permanent +4 career limit.">
      {awards.length ? <ul className="divide-y divide-border">{awards.map((award,index) => <li key={award.player.id + award.season + award.source + index} className="py-3 text-sm"><strong>{award.player.name}</strong> · {award.season - 1}-{String(award.season).slice(-2)} · {award.source} +{award.gain}<p className="mt-1 text-muted-foreground">{award.reason}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">Season-end ceiling changes will appear here. Extra minutes alone do not raise potential.</p>}
    </SectionFrame></div>
    <Link className="text-sm font-semibold underline underline-offset-4" href="/gm/franchise">Team direction, roles and franchise history</Link>
  </div>;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { ClubMark } from "@/gm/ui/club-mark";
import { GmLotteryMachine } from "@/gm/ui/gm-lottery-machine";
import { GmCombineHighlights } from "@/gm/ui/gm-combine-highlights";
import { ATTRIBUTE_LABEL } from "@/gm/engine/attributes";
import { SectionFrame } from "@/components/layout/section-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import { seasonJourney } from "@/gm/lib/season-journey";
import { flowOf, OFFSEASON_STAGES, cbaSeason, offseasonRosterLimit } from "@/gm/engine/season-flow-state";
import { pendingRookies } from "@/gm/engine/season-flow";
import { CAMP_FOCUSES, campSlots, campSkillChanges, campBadgePractice, campSorenessRisk } from "@/gm/engine/season-development";
import { isDraftComplete, draftSlotCount } from "@/gm/engine/draft-room";
import { faStageLabel } from "@/gm/engine/free-agency";
import { faStageOrder } from "@/gm/engine/fa-status";
import { GmMentalityTag } from "@/gm/ui/gm-mentality-tag";
import { userCap, userPlayers, userTeam } from "@/gm/lib/selectors";
import { cn } from "@/lib/utils";
import type { GmCampFocus, GmLeagueState } from "@/gm/types";

const linkClass = "font-medium underline underline-offset-4";

function SummerResults({ league }: { league: GmLeagueState }) {
  const report = league.seasonFlow?.summerLeague;
  if (!report) return null;
  if (report.skipped) return <p className="text-sm text-muted-foreground">You skipped summer league. Annual progression is already complete.</p>;
  if (!report.games.length) return <p className="text-sm text-muted-foreground">There were not enough healthy prospects and unsigned invitees for a game. You can continue to camp.</p>;
  const rows = new Map<string, { gp: number; minutes: number; points: number; rebounds: number; assists: number }>();
  for (const game of report.games) for (const player of game.players) {
    const total = rows.get(player.playerId) ?? { gp: 0, minutes: 0, points: 0, rebounds: 0, assists: 0 };
    rows.set(player.playerId, { gp: total.gp + 1, minutes: total.minutes + player.minutes, points: total.points + player.points, rebounds: total.rebounds + player.rebounds, assists: total.assists + player.assists });
  }
  return <>
    <ul className="flex flex-wrap gap-3 text-sm">{report.games.map(game => <li key={game.opponentId}><ClubMark teamId={game.opponentId} label={league.teams.find(team => team.id === game.opponentId)?.abbr ?? game.opponentId} /> {game.scored}-{game.allowed}</li>)}</ul>
    <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-left text-sm">
      <caption className="sr-only">Summer league averages</caption>
      <thead><tr className="border-b border-border bg-secondary/40"><th className="p-3">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th className="pr-3">AST</th></tr></thead>
      <tbody>{[...rows].sort((a, b) => b[1].points - a[1].points).map(([id, total]) => <tr key={id} className="border-b border-border last:border-0"><td className="p-3"><span className="inline-flex items-center gap-2">{league.players.find(player => player.id === id) ? <GmPlayerPortrait player={league.players.find(player => player.id === id)!} /> : null}<Link className={linkClass} href={"/gm/player/" + id}>{league.players.find(player => player.id === id)?.name ?? "Departed player"}</Link></span>{report.inviteeIds.includes(id) ? <span className="ml-2 text-xs text-muted-foreground">Unsigned invitee</span> : null}</td>{[total.minutes, total.points, total.rebounds, total.assists].map((value, i) => <td key={i} className="pr-3 tabular-nums">{(value / total.gp).toFixed(1)}</td>)}</tr>)}</tbody>
    </table></div>
    <p className="text-xs text-muted-foreground">Three 40-minute prospect games. Invitees keep their free-agent status. These games do not add season stats, injuries or wins.</p>
  </>;
}

export function OffseasonHub({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const league = useGmStore(state => state.league);
  const advance = useGmStore(state => state.advanceSeasonJourney);
  const decideRookie = useGmStore(state => state.decideRookieContract);
  const runCombine = useGmStore(state => state.runCombine);
  const completeLotteryReveal = useGmStore(state => state.completeLotteryReveal);
  const delegateDraft = useGmStore(state => state.finishDraftBoard);
  const assign = useGmStore(state => state.setCampAssignment);
  const suggestCamps = useGmStore(state => state.suggestCampPlan);
  const playSummer = useGmStore(state => state.playSummerLeague);
  const openRosterFill = useGmStore(state => state.openRosterFill);
  const autoBalance = useGmStore(state => state.autoBalanceRotation);
  const setAutomation = useGmStore(state => state.setAutomation);
  const note = useGmStore(state => state.lastJourneyNote);
  if (!league) return null;
  const flow = flowOf(league), stage = flow.stage, journey = seasonJourney(league);
  const roster = userPlayers(league), cap = userCap(league), team = userTeam(league);
  const rookies = pendingRookies(league);
  const progression = flow.progression?.filter(row => row.teamId === league.userTeamId) ?? [];
  const assigned = Object.keys(flow.campAssignments ?? {}).filter(id => roster.some(player => player.id === id && player.contract && !player.injury)).length;
  const stageIndex = OFFSEASON_STAGES.findIndex(row => row.id === stage);
  const Heading = embedded ? "h2" : "h1";
  function findFreeAgents() {
    openRosterFill();
    if (useGmStore.getState().league?.phase === "free_agency") router.push("/gm/free-agency");
  }
  function continueJourney() {
    const season = league!.season;
    const before = league!.seasonFlow?.stage;
    advance();
    const next = useGmStore.getState().league;
    if (next && next.season !== season) { router.push("/gm"); return; }
    if (next?.seasonFlow?.stage !== before) requestAnimationFrame(() => {
      const panel = document.getElementById("season-step");
      panel?.focus({ preventScroll: true }); panel?.scrollIntoView({ block: "start" });
    });
  }

  return <div className="flex min-w-0 flex-col gap-4" data-testid="season-hub">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{team.abbr} · {league.season - 1}-{String(league.season).slice(-2)}{stage ? " summer" : ""}</p>
        <Heading className="mt-1 text-2xl font-bold">Season hub</Heading>

      </div>

    </header>

    <div id="season-step" tabIndex={-1} role="region" aria-label="Current season step" className="scroll-mt-24 outline-none">
    <SectionFrame title={journey.title} bodySurface>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs font-medium text-muted-foreground">{stageIndex >= 0 ? `Step ${stageIndex + 1} of ${OFFSEASON_STAGES.length} · ` : ""}{journey.period}</p>
        {journey.primaryAction === "open_roster_fill" ? <Button onClick={findFreeAgents}>{journey.primaryLabel}</Button> : journey.primaryHref ? <Link className={buttonVariants()} href={journey.primaryHref}>{journey.primaryLabel}</Link> : <Button onClick={continueJourney} disabled={journey.blocked || (stage === "lottery" && !flow.lotteryRevealed)}>{stage === "lottery" && !flow.lotteryRevealed ? "Reveal lottery first" : journey.primaryLabel}</Button>}
      </div>
      {journey.tasks.some(task=>task.required) ? <div className="mt-3 flex flex-wrap gap-3 text-sm">{journey.tasks.filter(task=>task.required).map(task => task.action === "open_roster_fill" ? <button key={task.label} type="button" className={linkClass} onClick={findFreeAgents}>{task.label}</button> : <Link key={task.label} className={linkClass} href={task.href}>{task.label}</Link>)}</div> : null}
      {journey.blocked && journey.hint ? <p className="mt-2 text-sm text-muted-foreground">{journey.hint}</p> : null}
      {journey.tasks.some(task=>!task.required) ? <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Optional tasks ({journey.tasks.filter(task=>!task.required).length})</summary><ul className="mt-2 flex flex-wrap gap-3">{journey.tasks.filter(task=>!task.required).map(task=><li key={task.label}><Link className={linkClass} href={task.href}>{task.label}</Link></li>)}</ul></details> : null}
      {note ? <p role="status" className="mt-3 text-sm">{note}</p> : null}
    </SectionFrame>
    </div>

    {stage === "review" ? <SectionFrame title="Your season" >
      <p className="text-sm">{league.standings[team.id]?.wins ?? 0} wins · {league.standings[team.id]?.losses ?? 0} losses. Champion: {league.teams.find(row => row.id === league.champion?.teamId)?.name ?? "See the Finals result"}.</p>
      <p className="text-sm"><Link className={linkClass} href="/gm/franchise">Review history and set your team plan</Link>{" · "}<Link className={linkClass} href="/gm/awards">Season awards</Link></p>
    </SectionFrame> : null}

    {stage === "staff" ? <SectionFrame title="Staff contracts" >
      <ul className="grid gap-2 text-sm sm:grid-cols-2"><li>Head coach: {team.staff.headCoach.name} · {team.staff.headCoach.walkYear ? "Expiring" : (team.staff.headCoach.yearsLeft ?? 1) + " years"}</li><li>Associate: {team.staff.associate?.name ?? "Vacant"}</li><li>Scouting: {team.staff.scout?.name ?? "Club staff"}</li><li>Development: {team.staff.developer?.name ?? "Club staff"}</li><li>Trainer level: {team.staff.trainerLevel}</li></ul>
      <Link className={linkClass} href="/gm/staff">Open staff desk</Link>
    </SectionFrame> : null}

    {stage === "lottery" ? <GmLotteryMachine key={league.season} league={league} onFinish={completeLotteryReveal} /> : null}

    {stage === "scouting" && league.combineDone ? <GmCombineHighlights league={league} /> : null}
    {stage === "scouting" ? <SectionFrame title="Prepare your board" >
      <div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={() => runCombine()} disabled={league.combineDone}>{league.combineDone ? "Combine complete" : "Run draft combine"}</Button><Link className={linkClass} href="/gm/draft">Scouting board and workouts</Link></div>

    </SectionFrame> : null}

    {stage === "draft" ? <SectionFrame title={isDraftComplete(league) ? "Draft complete" : "Draft night"} description={(league.draftPickIndex ?? 0) + " of " + draftSlotCount(league) + " selections made."}>
      <div className="flex flex-wrap items-center gap-3"><Link className={linkClass} href="/gm/draft">{isDraftComplete(league) ? "Review draft results" : "Make your picks"}</Link>{!isDraftComplete(league) ? <Button variant="outline" onClick={() => delegateDraft()}>Delegate remaining draft</Button> : null}</div>
    </SectionFrame> : null}

    {stage === "rookie_signing" ? <div id="rookie-contracts" tabIndex={-1} className="scroll-mt-24 outline-none"><SectionFrame title="Unsigned rookies" >
      {rookies.length ? <ul className="divide-y divide-border rounded-lg border border-border">{rookies.map(player => <li key={player.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><span className="inline-flex items-center gap-2"><GmPlayerPortrait player={player} />{player.name} · #{player.draftPick} · {player.pendingRookieContract?.yearsRemaining} years · ${player.pendingRookieContract?.annualSalaryM.toFixed(2)}M per year</span><span className="flex gap-2"><Button size="sm" onClick={() => decideRookie(player.id, true)}>Sign rookie</Button><GmConfirmAction label="Release rights" title={"Release " + player.name + "'s rights?"} confirmLabel="Release rookie rights" onConfirm={() => decideRookie(player.id, false)}><p>He will become a free agent and other clubs can sign him. Your draft pick stays in the recap.</p><p>No rookie salary is added to your books.</p></GmConfirmAction></span></li>)}</ul> : <p className="text-sm">All rookie decisions are complete. Continue to contract options.</p>}
    </SectionFrame></div> : null}

    {stage === "free_agency" ? <SectionFrame title="Contract windows" >
      <ol className="flex flex-wrap gap-2 text-sm">{faStageOrder().map(id => <li key={id} aria-current={league.faMarket?.stage === id ? "step" : undefined} className={cn("rounded-md border px-3 py-2", league.faMarket?.stage === id ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground")}>{faStageLabel({ ...league.faMarket!, stage: id, done: false })}</li>)}</ol>
      <p className="text-sm">Cap year {cbaSeason(league)} · cap room ${cap.capRoomM.toFixed(1)}M · roster {cap.rosterSize}/{offseasonRosterLimit(league)} for summer, {league.settings.maxRoster} for opening night.</p>
      <Link className={linkClass} href="/gm/free-agency">Open free-agency desk</Link>
    </SectionFrame> : null}

    {stage === "progression" ? <SectionFrame
      title="Player progression"
    >
      {progression.length ? <>
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          {([
            ["Improved", progression.filter(row => row.after > row.before).length],
            ["Declined", progression.filter(row => row.after < row.before).length],
            ["Stable", progression.filter(row => row.after === row.before).length],
            ["Development reviews", progression.length],
          ] as const).map(([label,value]) => <div key={label} className="rounded-lg border border-border bg-secondary/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><strong className="mt-1 block text-2xl tabular-nums">{value}</strong></div>)}
        </div>
        <details className="text-sm"><summary className="mb-3 cursor-pointer font-semibold">View all player changes ({progression.length})</summary><div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead><tr className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground"><th className="p-3">Player</th><th className="p-3">Age</th><th className="p-3">Previous</th><th className="p-3">New OVR</th><th className="p-3">Change</th><th className="p-3">Mentality</th></tr></thead>
            <tbody>{[...progression].sort((a,b) => (b.after-b.before)-(a.after-a.before)).map(row => {
              const diff = Math.round(row.after-row.before);
              const changed = row.traitBefore && row.traitAfter && row.traitBefore !== row.traitAfter;
              return <tr key={row.playerId} className="border-b border-border last:border-0">
                <td className="p-3"><div className="flex min-w-0 items-center gap-2">{roster.find(p => p.id === row.playerId) ? <GmPlayerPortrait player={roster.find(p => p.id === row.playerId)!} /> : null}<div className="font-semibold">{row.name}{changed ? <p className="text-xs font-normal text-muted-foreground">{row.reason}</p> : null}</div></div></td>
                <td className="p-3 tabular-nums">{row.age}</td>
                <td className="p-3 tabular-nums text-muted-foreground">{Math.round(row.before)}</td>
                <td className="p-3 font-bold tabular-nums">{Math.round(row.after)}</td>
                <td className="p-3"><span className={cn("rounded-md px-2 py-1 font-bold tabular-nums",diff>0?"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300":diff<0?"bg-rose-500/10 text-rose-700 dark:text-rose-300":"bg-secondary text-muted-foreground")}>{diff>0?"+":""}{diff}</span></td>
                <td className="p-3">{roster.find(p => p.id === row.playerId) ? <GmMentalityTag player={roster.find(p => p.id === row.playerId)!} compact /> : "—"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        </details>
      </> : <p className="text-sm text-muted-foreground">Annual progression has already been applied in this save. It will not run twice.</p>}
    </SectionFrame> : null}

    {stage === "summer_league" ? <div id="summer-games" tabIndex={-1} className="scroll-mt-24 outline-none"><SectionFrame title="Prospect evaluation" >
      {!flow.summerLeague ? <div className="flex flex-wrap gap-2"><Button onClick={() => playSummer()}>Simulate summer games</Button><Button variant="outline" onClick={() => playSummer(true)}>Skip summer league</Button></div> : <SummerResults league={league} />}
    </SectionFrame></div> : null}

    {stage === "training_camp" ? <SectionFrame title={flow.campResults ? "Camp results" : "Focused camps"} >
      {flow.campResults ? <ul className="divide-y divide-border text-sm">{flow.campResults.filter(row => roster.some(player => player.id === row.playerId)).map(row => <li className="py-3" key={row.playerId}><strong>{row.name}</strong> · {row.focus} · OVR {row.before} to {row.after}<p className="mt-1 text-xs text-muted-foreground">{row.gains.map(gain => { const key = gain.split(" +")[0] as keyof typeof ATTRIBUTE_LABEL; return gain.replace(key, ATTRIBUTE_LABEL[key] ?? key); }).join(", ") || "Skills were already at their maximum."}{row.badgeGains?.length ? " · " + row.badgeGains.join(" · ") : ""} · {row.tradeoff}</p></li>)}{!flow.campResults.some(row => roster.some(player => player.id === row.playerId)) ? <li>You ran camp without individual assignments.</li> : null}</ul> : <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{assigned}/{campSlots(league)} slots assigned. Train up to two players in a specialty: focused attribute gains, evolving tendencies and eligible badge practice. Conditioning avoids the usual fatigue.</p><Button variant="outline" onClick={() => suggestCamps()} disabled={assigned >= campSlots(league)}>Suggest remaining camps</Button></div>
        <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Choose players and skills</summary><ul className="mt-2 divide-y divide-border rounded-lg border border-border">{roster.filter(player => player.contract).map(player => <li key={player.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div className="min-w-0"><label htmlFor={"camp-" + player.id} className="inline-flex items-center gap-2"><GmPlayerPortrait player={player} />{player.name} · age {player.age}{player.injury ? " · Injured" : ""}</label>{flow.campAssignments?.[player.id] ? <p className="mt-1 text-xs text-muted-foreground">{campSkillChanges(league, player, flow.campAssignments[player.id]!).map(change => ATTRIBUTE_LABEL[change.key] + " " + change.before + " to " + change.after).join(" · ")}{campBadgePractice(league, player, flow.campAssignments[player.id]!).gains.length ? " · " + campBadgePractice(league, player, flow.campAssignments[player.id]!).gains.join(" · ") : ""}</p> : null}</div><select id={"camp-" + player.id} value={flow.campAssignments?.[player.id] ?? ""} disabled={Boolean(player.injury)} onChange={event => assign(player.id, (event.target.value || null) as GmCampFocus | null)} className="max-w-full rounded-md border border-border bg-background px-3 py-2"><option value="">No individual camp</option>{CAMP_FOCUSES.map(focus => <option key={focus.id} value={focus.id} disabled={!flow.campAssignments?.[player.id] && assigned >= campSlots(league)}>{focus.label}</option>)}</select></li>)}</ul></details>
      </>}
    </SectionFrame> : null}

    {stage === "roster_check" ? <SectionFrame title="Ready for opening night" >
      <p className="text-sm">{cap.rosterSize} standard contracts · allowed {league.settings.minRoster} to {league.settings.maxRoster}. Guaranteed salary stays on the books after a waiver.</p>
      <div className="flex flex-wrap items-center gap-3"><Link className={linkClass} href="/gm/roster">Review roster and cuts</Link><Link className={linkClass} href="/gm/lineup">Set rotation</Link><Button variant="outline" onClick={() => autoBalance()}>Auto-balance minutes</Button><Button variant="outline" onClick={findFreeAgents}>Open late roster fill</Button></div>
    </SectionFrame> : null}

    <details className="rounded-xl border border-border p-4 text-sm"><summary className="cursor-pointer font-semibold">More offseason options</summary><div className="mt-4 flex flex-col gap-4">
    {flow.retiredPlayers?.length ? <SectionFrame title="Retirements" description="These unsigned players left the league this summer. Their completed seasons remain in franchise history."><details className="text-sm"><summary className="cursor-pointer">{flow.retiredPlayers.length} careers ended</summary><ul className="mt-3 space-y-1">{flow.retiredPlayers.map(player => <li key={player.id}>{player.name} · age {player.age} · {player.overall} OVR</li>)}</ul></details></SectionFrame> : null}

    <SectionFrame title="The annual cycle" description={stage ? "Completed steps stay checked when you leave and return." : "The regular season leads into awards and the postseason. These summer steps follow the Finals."}>
      <details><summary className="cursor-pointer text-sm font-semibold">{stageIndex >= 0 ? "Step " + (stageIndex + 1) + " of " + OFFSEASON_STAGES.length + ". View full summer plan" : "View the summer plan"}</summary><ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{OFFSEASON_STAGES.map((row, index) => <li key={row.id} aria-current={stage === row.id ? "step" : undefined} className={cn("min-w-0 rounded-lg border p-3 text-sm", stage === row.id ? "border-primary bg-primary/5" : "border-border", stageIndex >= 0 && index > stageIndex && "text-muted-foreground")}><p className="text-xs text-muted-foreground">{row.id === stage ? "Current step" : flow.completed.includes(row.id) ? "Complete" : "Upcoming"}</p><p className="mt-1 font-semibold">{index + 1}. {row.label}</p></li>)}</ol></details>
    </SectionFrame>

    <SectionFrame title="Delegation" description="The summer still pauses at each review. Free-agency delegation allows the CPU to decide options and offers for your club when you advance.">
      <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={league.automation?.autoDraft ?? false} onChange={event => setAutomation({ autoDraft: event.target.checked })} />Delegate draft picks</label><label className="flex items-center gap-2"><input type="checkbox" checked={league.automation?.autoFreeAgency ?? false} onChange={event => setAutomation({ autoFreeAgency: event.target.checked })} />Delegate contract decisions and free agency</label></div>
    </SectionFrame>
    </div></details>
  </div>;
}

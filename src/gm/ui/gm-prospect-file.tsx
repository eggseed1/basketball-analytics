"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { useGmStore } from "@/gm/state/gm-store";
import { amateurSeason, draftRead, draftScoutingOf, draftSleeperSignals, scoutingBudget, SCOUT_STUDIES, DRAFT_TOOL_LABELS as tools } from "@/gm/engine/draft-intel";
import type { GmDraftTool, GmLeagueState, GmPlayer } from "@/gm/types";

export const draftControl="min-h-11 max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

/** A clear decision first. Full film/workout/medical tools remain optional. */
export function GmProspectFile({league,player}:{league:GmLeagueState;player:GmPlayer}){
  const study=useGmStore(state=>state.scoutProspect);
  const [focus,setFocus]=useState<GmDraftTool>("shooting");
  const scouting=draftScoutingOf(league),read=draftRead(league,player,scouting.strategy),stats=amateurSeason(player);
  const signal=draftSleeperSignals(player);
  const remaining=scoutingBudget(league)-scouting.spent;
  const visits=Object.values(scouting.reports).filter(report=>report.studies.workout).length;
  const steps=Object.keys(read.report.studies).length;
  const three=100*stats.threeMade/Math.max(1,stats.threeAttempts),ft=100*stats.ftMade/Math.max(1,stats.ftAttempts);
  const workoutOpen=league.seasonFlow?.stage==="scouting"||(!league.seasonFlow&&league.phase==="offseason");
  const canScout=league.phase!=="draft";
  const next=!read.report.studies.film?"film":!read.report.studies.analytics?"analytics":null;
  const summary=read.strengths[0]??signal.reasons[0]??"Needs more evaluation before committing a pick.";
  return <section aria-label={"Prospect file for "+player.name} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border p-4">
    <header className="flex items-start gap-3"><GmPlayerPortrait player={player} size="md"/><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Prospect report · market #{read.marketRank}</p><h3 className="mt-1 text-xl font-bold">{player.name}</h3><p className="mt-1 text-sm text-muted-foreground">{player.position} · {player.age} years · {player.college??stats.competition}</p></div></header>
    <div className="rounded-lg bg-secondary/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scout&apos;s take</p><p className="mt-1 text-sm font-medium">{summary}</p><p className="mt-1 text-xs text-muted-foreground">{steps?"Research completed: "+steps+" report"+(steps===1?"":"s")+". Still a projection, not a guaranteed ceiling.":"Early read only. One scout action can narrow the uncertainty."}</p></div>
    <dl className="grid grid-cols-2 gap-3"><Metric label="Ready now (OVR)" value={read.readyLow+"–"+read.readyHigh}/><Metric label="Possible upside" value={read.upsideLow+"–"+read.upsideHigh}/></dl>
    <p className="text-xs text-muted-foreground">{read.availability} · {Math.round(read.coverage*100)}% report coverage. Future development is uncertain.</p>
    {read.marketRank>=22?<div className="rounded-lg border border-border bg-background p-3"><p className="text-sm font-semibold">Late-value watch</p><p className="mt-1 text-xs text-muted-foreground">{signal.reasons.slice(0,2).join(" · ")||"Not enough convincing public indicators yet."} These are clues, not a hidden star label.</p></div>:null}
    {canScout?<div className="flex flex-col gap-2 rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Scout this player</h4><span className="text-xs text-muted-foreground">{remaining} scouting days left</span></div><p className="text-xs text-muted-foreground">No need to choose five reports or guess which skill to investigate. Your scout starts with the strongest public clue.</p>
      {next?<Button className="min-h-11 w-full" disabled={remaining<1} onClick={()=>study(player.id,next,signal.focus)}>{next==="film"?"Scout prospect · 1 day":"Get a second opinion · 1 day"}</Button>:<p className="text-sm font-medium">Basic scouting complete. You can compare this player or use an optional deep dive.</p>}
      {workoutOpen&&!read.report.studies.workout?<Button variant="outline" className="min-h-11 w-full" disabled={remaining<2||visits>=4} onClick={()=>study(player.id,"workout",signal.focus)}>Deep scout · 2 days</Button>:null}
    </div>:<p className="text-xs text-muted-foreground">Scouting is closed on draft night. Use your collected evidence to make the call.</p>}
    <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Skills, stats and scouting details</summary><div className="mt-3 space-y-4">
      <div><h4 className="text-sm font-semibold">Estimated strengths</h4><dl className="mt-2 grid grid-cols-2 gap-2">{Object.entries(tools).map(([id,label])=>{const tool=id as GmDraftTool;const focused=read.report.tools[tool]!=null,width=focused?4:8;return <div key={id} className="rounded-lg bg-secondary/40 p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{Math.max(25,Math.round(read.tools[tool]-width))}–{Math.min(99,Math.round(read.tools[tool]+width))}</dd></div>;})}</dl></div>
      <div><h4 className="font-semibold">College / amateur production</h4><p className="mt-1 text-xs text-muted-foreground">Simulated {stats.competition} · {stats.games} games · {stats.minutes} MIN/G</p><p className="mt-2">{stats.points} PTS · {stats.rebounds} REB · {stats.assists} AST · {stats.turnovers} TOV</p><p className="mt-1">3PT {three.toFixed(1)}% ({stats.threeMade}/{stats.threeAttempts}) · FT {ft.toFixed(1)}% ({stats.ftMade}/{stats.ftAttempts})</p></div>
      <div><h4 className="font-semibold">Reasons to consider</h4><ul className="mt-1 space-y-1">{read.strengths.map(line=><li key={line}>+ {line}</li>)}</ul><h4 className="mt-3 font-semibold">Risks</h4><ul className="mt-1 space-y-1 text-muted-foreground">{read.risks.map(line=><li key={line}>{line}</li>)}</ul></div>
      {Object.keys(read.report.studies).length?<div><h4 className="font-semibold">Scouting notes</h4>{Object.entries(read.report.studies).map(([method,row])=><p key={method} className="mt-2 text-xs"><strong>{SCOUT_STUDIES.find(item=>item.id===method)?.label}:</strong> {row.note}</p>)}</div>:null}
      {player.scoutProfile?.combine?<p className="text-xs text-muted-foreground">Combine: {player.scoutProfile.combine.wingspanIn}″ wingspan · {player.scoutProfile.combine.verticalIn}″ vertical · {player.scoutProfile.combine.sprint.toFixed(2)}s sprint</p>:null}
    </div></details>
    {canScout?<details className="rounded-lg border border-border px-3 py-3 text-sm"><summary className="cursor-pointer font-semibold">Advanced scouting tools (optional)</summary><p className="mt-2 text-xs text-muted-foreground">For experienced GMs who want to focus on a specific skill, interview, or medical concern.</p>
      <label className="mt-3 flex flex-col gap-2">Investigate a skill<select aria-label="Scouting skill focus" className={draftControl} value={focus} onChange={event=>setFocus(event.target.value as GmDraftTool)}>{Object.entries(tools).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <div className="mt-3 grid gap-2">{SCOUT_STUDIES.map(row=>{const done=Boolean(read.report.studies[row.id]),unavailable=row.id==="workout"&&(!workoutOpen||visits>=4);return <Button key={row.id} variant="outline" className="min-h-10 w-full" aria-label={row.label+" for "+player.name} disabled={done||remaining<row.cost||unavailable} onClick={()=>study(player.id,row.id,focus)}>{done?row.label+" complete":row.label+" · "+row.cost+" day"+(row.cost===1?"":"s")}</Button>;})}</div>
    </details>:null}
  </section>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-secondary/50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd></div>;}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import { amateurSeason, draftRead, draftScoutingOf, scoutingBudget, SCOUT_STUDIES, DRAFT_TOOL_LABELS as tools } from "@/gm/engine/draft-intel";
import type { GmDraftTool, GmLeagueState, GmPlayer } from "@/gm/types";

export const draftControl="min-h-11 max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function GmProspectFile({league,player}:{league:GmLeagueState;player:GmPlayer}){
  const study=useGmStore(state=>state.scoutProspect);
  const [focus,setFocus]=useState<GmDraftTool>("shooting");
  const scouting=draftScoutingOf(league),read=draftRead(league,player,scouting.strategy),stats=amateurSeason(player);
  const remaining=scoutingBudget(league)-scouting.spent,visits=Object.values(scouting.reports).filter(report=>report.studies.workout).length;
  const three=100*stats.threeMade/Math.max(1,stats.threeAttempts),ft=100*stats.ftMade/Math.max(1,stats.ftAttempts);
  const workoutOpen=league.seasonFlow?.stage==="scouting"||(!league.seasonFlow&&league.phase==="offseason");
  return <section aria-label={"Prospect file for "+player.name} className="flex min-w-0 flex-col gap-5 rounded-xl border border-border p-4">
    <header><p className="text-xs uppercase tracking-wider text-muted-foreground">Your scouting report · consensus #{read.marketRank}</p><h3 className="mt-2 text-xl font-bold">{player.name}</h3><p className="mt-1 text-sm text-muted-foreground">{player.position} · age {player.age} · {player.college??stats.competition} · {Math.floor(player.heightIn/12)}′{player.heightIn%12}″</p></header>
    <dl className="grid grid-cols-2 gap-3"><Metric label="NBA readiness" value={read.readyLow+"–"+read.readyHigh}/><Metric label="Projected growth range" value={read.upsideLow+"–"+read.upsideHigh}/></dl>
    <p className="text-xs text-muted-foreground">Scouting estimates on the league&apos;s OVR scale. Growth, health and role can change the outcome. Coverage {Math.round(read.coverage*100)}%.</p>
    <p className="text-sm font-medium">{read.availability}</p>
    <div><h4 className="text-sm font-semibold">Estimated skills</h4><p className="mt-1 text-xs text-muted-foreground">Specialist skills can be useful before overall readiness catches up.</p><dl className="mt-3 grid grid-cols-2 gap-3">{Object.entries(tools).map(([id,label])=>{const tool=id as GmDraftTool,focused=read.report.tools[tool]!=null,width=focused?4:8;return <div key={id}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold">{Math.max(25,Math.round(read.tools[tool]-width))}–{Math.min(99,Math.round(read.tools[tool]+width))}<span className="mt-1 block text-xs font-normal text-muted-foreground">{focused?"Focused research":"Public indicators"}</span></dd></div>;})}</dl></div>
    <div><h4 className="text-sm font-semibold">Amateur production</h4><p className="mt-1 text-xs text-muted-foreground">Simulated {stats.competition} season · {stats.games} games · {stats.minutes} MIN/G</p><p className="mt-2 text-sm">{stats.points} PTS · {stats.rebounds} REB · {stats.assists} AST · {stats.turnovers} TOV</p><p className="mt-1 text-sm">3PT {three.toFixed(1)}% ({stats.threeMade}/{stats.threeAttempts}) · FT {ft.toFixed(1)}% ({stats.ftMade}/{stats.ftAttempts})</p></div>
    {player.scoutProfile?.combine?<div><h4 className="text-sm font-semibold">Combine measurements</h4><p className="mt-2 text-sm">{player.scoutProfile.combine.wingspanIn}″ wingspan · {player.scoutProfile.combine.verticalIn}″ vertical · {player.scoutProfile.combine.sprint.toFixed(2)}s sprint</p><p className="mt-1 text-xs text-muted-foreground">Test results are one signal. Compare them with game film and the role.</p></div>:null}
    <div><h4 className="text-sm font-semibold">The case</h4><ul className="mt-2 space-y-2 text-sm">{read.strengths.map(line=><li key={line}>+ {line}</li>)}</ul><h4 className="mt-4 text-sm font-semibold">Questions to answer</h4><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{read.risks.map(line=><li key={line}>{line}</li>)}</ul></div>
    {Object.keys(read.report.studies).length?<div><h4 className="text-sm font-semibold">Your research</h4><ul className="mt-2 space-y-3 text-sm">{Object.entries(read.report.studies).map(([method,result])=><li key={method}><strong>{SCOUT_STUDIES.find(row=>row.id===method)?.label}</strong><p className="mt-1 text-muted-foreground">{result.note}</p></li>)}</ul></div>:null}
    {league.phase!=="draft"?<><label className="flex flex-col gap-2 text-sm">Investigate a skill<select aria-label="Scouting skill focus" className={draftControl} value={focus} onChange={event=>setFocus(event.target.value as GmDraftTool)}>{Object.entries(tools).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><div className="space-y-3">{SCOUT_STUDIES.map(row=>{const done=Boolean(read.report.studies[row.id]),unavailable=row.id==="workout"&&(!workoutOpen||visits>=4);return <div key={row.id}><Button className="min-h-11 w-full" variant="outline" aria-label={row.label+" for "+player.name} disabled={done||remaining<row.cost||unavailable} onClick={()=>study(player.id,row.id,focus)}>{done?row.label+" complete":row.label+" · "+row.cost+" day"+(row.cost===1?"":"s")}</Button><p className="mt-1 text-xs text-muted-foreground">{row.id==="workout"&&!workoutOpen?"Private workouts open after the lottery.":row.description}</p></div>;})}</div></>:<p className="text-xs text-muted-foreground">Research is closed for draft night. Your saved reports can still be compared with the market.</p>}
  </section>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-secondary/50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd></div>;}

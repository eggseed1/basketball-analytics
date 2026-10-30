"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionFrame } from "@/components/layout/section-frame";
import { useGmStore } from "@/gm/state/gm-store";
import { exportFranchise, franchiseNeeds, franchisePlan } from "@/gm/engine/franchise";
import { suggestedMinutePlan } from "@/gm/engine/coaching";
import { displayPlayerName } from "@/gm/lib/selectors";
import type { GmAttributes, GmLeagueState, GmPlayer } from "@/gm/types";

const control = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const button = "gm-nav__link";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GmSaveImport() {
  const importSave = useGmStore(s => s.importSave);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="flex flex-col gap-2">
    <label className={`${button} w-fit cursor-pointer`}>
      {busy ? "Opening save..." : "Import a franchise save"}
      <input type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={async e => {
        const input = e.currentTarget; const file = input.files?.[0]; if (!file) return;
        setBusy(true); setNote("");
        try { if (file.size > 40_000_000) throw new Error("Choose an export under 40 MB."); await importSave(await file.text()); setNote("Franchise opened in a new save slot."); }
        catch (error) { setNote(error instanceof Error ? error.message : "Could not open this file."); }
        finally { setBusy(false); input.value = ""; }
      }} />
    </label>
    {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
  </div>;
}

export function FranchiseSummary({ league }: { league: GmLeagueState }) {
  const plan = franchisePlan(league);
  const wins = league.standings[league.userTeamId]?.wins ?? 0;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
    <div><p className="text-sm font-semibold">{plan.intent === "develop" ? "Build the next core" : plan.intent === "contend" ? "Chase a championship" : "Improve with flexibility"}</p>
      <p className="text-sm text-muted-foreground">{wins} wins toward a {plan.targetWins}-win goal. {franchiseNeeds(league)[0]}.</p></div>
    <Link href="/gm/franchise" className={button}>Franchise desk</Link>
  </div>;
}

export function GmFranchiseDesk() {
  const league = useGmStore(s => s.league);
  const updatePlan = useGmStore(s => s.updateFranchise);
  const updateSettings = useGmStore(s => s.updateSimulationSettings);
  const focus = useGmStore(s => s.setDevelopmentFocus);
  const promise = useGmStore(s => s.promiseMinutes);
  const setCoaching = useGmStore(s => s.setCoaching);
  const editAttribute = useGmStore(s => s.editAttribute);
  const importClass = useGmStore(s => s.importDraftClass);
  const propose = useGmStore(s => s.proposeTrade);
  const [tab, setTab] = useState<"plan" | "history" | "settings">("plan");
  const [note, setNote] = useState("");
  const [careerId, setCareerId] = useState("");
  const [editId, setEditId] = useState("");
  const [attribute, setAttribute] = useState<keyof GmAttributes>("threePoint");
  const [rating, setRating] = useState(75);
  if (!league) return null;
  const plan = franchisePlan(league);
  const team = league.teams.find(t => t.id === league.userTeamId)!;
  const roster = league.players.filter(p => p.teamId === team.id).sort((a, b) => (b.sheet?.overall ?? 0) - (a.sheet?.overall ?? 0));
  const minutes = team.coaching?.minutes ?? suggestedMinutePlan(team, league.players).minutes;
  const closing = team.coaching?.closingLineup ?? Object.values(team.starters).filter((id): id is string => Boolean(id));
  const selected = league.players.find(p => p.id === editId) ?? roster[0];
  const years = [...(league.history ?? [])].sort((a, b) => b.season - a.season);
  const people = [...new Map(years.flatMap(y => y.players).map(p => [p.id, p])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const career = careerId || people[0]?.id;
  const assetText = (assets: NonNullable<GmLeagueState["tradeTalks"]>[number]["youSend"]) => assets.map(a => a.type === "player" ? league.players.find(p => p.id === a.id)?.name ?? "Former player" : a.type === "cash" ? `$${a.cashM}M cash` : (() => { const pick = league.teams.flatMap(t => t.draftPicks).find(p => p.id === a.id); return pick ? `${pick.season} round ${pick.round} pick` : "Draft pick"; })()).join(", ");
  return <div className="flex flex-col gap-8">
    <div><h2 className="text-2xl font-bold tracking-tight">Franchise desk</h2><p className="mt-1 text-sm text-muted-foreground">Set the direction, develop your roster, and keep the story of your franchise.</p></div>
    <nav aria-label="Franchise desk" className="flex flex-wrap gap-2">{(["plan", "history", "settings"] as const).map(t => <button type="button" key={t} aria-pressed={tab === t} className={`${button} ${tab === t ? "is-active" : ""}`} onClick={() => setTab(t)}>{t === "plan" ? "Team plan" : t === "history" ? "History" : "Settings and saves"}</button>)}</nav>
    {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
    {tab === "plan" && <>
      <SectionFrame title="Direction" bodySurface>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-2 text-sm">Team plan<select className={control} value={plan.intent} onChange={e => updatePlan({ intent: e.target.value as typeof plan.intent })}><option value="contend">Contend now</option><option value="retool">Retool with flexibility</option><option value="develop">Develop the next core</option></select></label>
          <label className="flex flex-col gap-2 text-sm">Season win target<input type="number" min={0} max={82} className={`${control} w-24`} value={plan.targetWins} onChange={e => updatePlan({ targetWins: Math.max(0, Math.min(82, Number(e.target.value))) })} /></label>
          <p className="pb-2 text-sm text-muted-foreground">{league.standings[team.id]?.wins ?? 0} wins so far{plan.ownerPressure ? ` · Owner patience ${team.ownerPatience}/100` : ""}</p>
        </div>
        <label className="mt-4 flex flex-col gap-2 text-sm">Roster priorities<textarea key={`${league.createdAt}-${league.season}`} className={control} rows={2} defaultValue={plan.priorities.join("\n")} placeholder={franchiseNeeds(league).join("\n")} onBlur={e => updatePlan({ priorities: e.target.value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 5) })} /></label>
        <p className="mt-3 text-sm text-muted-foreground">{franchiseNeeds(league).join(". ")}.</p>
      </SectionFrame>
      <SectionFrame title="Development and roles" description="Promises are assessed over healthy games. Keeping one helps when it is time to re-sign the player." bodySurface>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-border text-muted-foreground"><th className="py-2">Player</th><th>Focus</th><th>Promised minutes</th><th>Position split</th><th>Closes</th></tr></thead><tbody>{roster.map(p => {
          const total = minutes[p.id] ?? 0;
          const secondary = p.secondaryPosition;
          const split = secondary ? team.coaching?.positionMinutes?.[p.id]?.[secondary] ?? 0 : 0;
          return <tr key={p.id} className="border-b border-border/50"><td className="py-3 pr-4"><Link href={`/gm/player/${p.id}`} className="font-semibold hover:underline">{displayPlayerName(p)}</Link><p className="text-xs text-muted-foreground">{p.position} · {total} planned min{p.rolePromise ? ` · Promise ${p.rolePromise.status}` : ""}</p></td>
            <td className="pr-3"><select aria-label={`Development focus for ${p.name}`} className={control} value={p.developmentFocus ?? "balanced"} onChange={e => focus(p.id, e.target.value as NonNullable<GmPlayer["developmentFocus"]>)}>{["balanced", "shooting", "creation", "defense", "rebounding"].map(f => <option key={f} value={f}>{f[0]!.toUpperCase() + f.slice(1)}</option>)}</select></td>
            <td className="pr-3"><input type="number" aria-label={`Promised minutes for ${p.name}`} className={`${control} w-20`} min={0} max={40} defaultValue={p.rolePromise?.minutes ?? Math.round(total)} onBlur={e => { if (Number(e.target.value) !== p.rolePromise?.minutes) promise(p.id, Number(e.target.value)); }} /></td>
            <td className="pr-3">{secondary ? <label className="flex items-center gap-2 text-xs">{p.position} {Math.max(0, total - split)} / {secondary}<input type="number" aria-label={`${secondary} minutes for ${p.name}`} className={`${control} w-16`} min={0} max={total} step={2} value={split} onChange={e => { const n = Math.max(0, Math.min(total, Number(e.target.value))); setCoaching({ positionMinutes: { ...team.coaching?.positionMinutes, [p.id]: { [p.position]: total - n, [secondary]: n } } }); }} /></label> : p.position}</td>
            <td><input type="checkbox" aria-label={`${p.name} in closing lineup`} checked={closing.includes(p.id)} disabled={Boolean(p.injury) || total < 4 || (!closing.includes(p.id) && closing.length >= 5)} onChange={e => setCoaching({ closingLineup: e.target.checked ? [...closing, p.id] : closing.filter(id => id !== p.id) })} /></td>
          </tr>;
        })}</tbody></table></div>
        <p className="mt-3 text-sm text-muted-foreground">Closing unit: {closing.length}/5 selected. Position splits guide assignments within the shared rotation. <Link href="/gm/lineup" className="underline">Edit the full rotation</Link>.</p>
      </SectionFrame>
      <SectionFrame title="Trade conversations" description="Rejected proposals stay here with a legal counter when the other club can find one.">
        {!league.tradeTalks?.length ? <p className="text-sm text-muted-foreground">Propose a trade to start a conversation.</p> : league.tradeTalks.slice(0, 8).map(talk => <div key={talk.id} className="border-b border-border pb-4"><p className="font-semibold">{league.teams.find(t => t.id === talk.teamId)?.city} · Day {talk.day}</p><p className="mt-1 text-sm text-muted-foreground">{talk.reason}</p><p className="mt-1 text-sm">You offered {assetText(talk.youSend)} for {assetText(talk.youReceive)}.</p>{talk.counter && <div className="mt-2 flex flex-wrap items-center gap-3"><p className="text-sm">Counter: send {assetText(talk.counter)}.</p><button type="button" className={button} onClick={() => { const r = propose(talk.teamId, talk.counter!, talk.youReceive); setNote(r.ok ? "Trade completed." : r.reason ?? "This counter is no longer available."); }}>Accept counter</button></div>}</div>)}
        <Link href="/gm/trade" className={`${button} w-fit`}>Open trade machine</Link>
      </SectionFrame>
    </>}
    {tab === "history" && <>
      <SectionFrame title="Season archive" description="Completed seasons keep their results, player statistics, awards, and transactions.">
        {!years.length && <p className="text-sm text-muted-foreground">Your first completed season will appear here when free agency opens.</p>}
        {years.map(year => { const record = year.standings[year.userTeamId]; const mvp = year.players.find(p => p.id === year.champion?.finalsMvpId); return <details key={year.season} className="border-b border-border pb-4"><summary className="cursor-pointer font-semibold">{year.season - 1}-{String(year.season).slice(-2)} · {record?.wins ?? 0}-{record?.losses ?? 0}{year.champion ? ` · Champion: ${league.teams.find(t => t.id === year.champion?.teamId)?.city ?? year.champion.teamId}` : ""}</summary><p className="mt-3 text-sm text-muted-foreground">{mvp ? `Finals MVP: ${mvp.name}. ` : ""}{year.trades.length} completed trades. {year.awards?.races.length ?? 0} award races recorded.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="pb-2">Your roster</th><th>OVR</th><th>PPG</th><th>RPG</th><th>APG</th></tr></thead><tbody>{year.players.filter(p => p.teamId === year.userTeamId && p.line?.gp).sort((a, b) => b.overall - a.overall).map(p => <tr key={p.id} className="border-t border-border/50"><td className="py-2">{p.name}</td><td>{p.overall}</td><td>{(p.line!.pts / p.line!.gp).toFixed(1)}</td><td>{(p.line!.reb / p.line!.gp).toFixed(1)}</td><td>{(p.line!.ast / p.line!.gp).toFixed(1)}</td></tr>)}</tbody></table></div></details>; })}
      </SectionFrame>
      {people.length > 0 && <SectionFrame title="Player careers" bodySurface><select className={control} aria-label="Player career" value={career} onChange={e => setCareerId(e.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Season</th><th>Team</th><th>OVR</th><th>GP</th><th>MPG</th><th>PPG</th></tr></thead><tbody>{[...years].reverse().flatMap(y => { const p = y.players.find(p => p.id === career); if (!p) return []; return <tr key={y.season} className="border-t border-border"><td className="py-2">{y.season - 1}-{String(y.season).slice(-2)}</td><td>{p.teamId?.toUpperCase() ?? "FA"}</td><td>{p.overall}</td><td>{p.line?.gp ?? 0}</td><td>{p.line?.gp ? (p.line.min / p.line.gp).toFixed(1) : "—"}</td><td>{p.line?.gp ? (p.line.pts / p.line.gp).toFixed(1) : "—"}</td></tr>; })}</tbody></table></div></SectionFrame>}
    </>}
    {tab === "settings" && <>
      <SectionFrame title="Saves" bodySurface><div className="flex flex-wrap items-start gap-3"><button type="button" className={button} onClick={() => download(`franchise-${team.id}-${league.season}.json`, exportFranchise(league))}>Export this franchise</button><GmSaveImport /></div><p className="mt-3 text-sm text-muted-foreground">Imports open in a new slot. Keep an exported copy to move your franchise to another browser or device.</p></SectionFrame>
      <SectionFrame title="Simulation settings" bodySurface><div className="grid gap-5 sm:grid-cols-2">{([['injuryFrequency','Injury frequency',0,2],['developmentSpeed','Development speed',0.5,2],['tradeDifficulty','Trade difficulty',0.5,2],['simPace','Game pace',0.8,1.2]] as const).map(([key, label, min, max]) => <label key={key} className="flex flex-col gap-2 text-sm"><span>{label}: {(league.settings[key] ?? 1).toFixed(2)}x</span><input type="range" min={min} max={max} step={0.05} value={league.settings[key] ?? 1} onChange={e => updateSettings({ [key]: Number(e.target.value) })} /></label>)}</div><div className="mt-5 flex flex-col gap-3 text-sm"><label><input type="checkbox" checked={plan.ownerPressure} onChange={e => updatePlan({ ownerPressure: e.target.checked })} /> Owner patience follows your season goal</label>{([['offers','Pause for trade offers'],['scouting','Pause for scouting decisions'],['injuries','Stop fast simulation for a new injury on your team']] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={plan.pauses[key]} onChange={e => updatePlan({ pauses: { ...plan.pauses, [key]: e.target.checked } })} /> {label}</label>)}</div></SectionFrame>
      <SectionFrame title="Commissioner tools" bodySurface><label className="text-sm"><input type="checkbox" checked={plan.commissioner} onChange={e => updatePlan({ commissioner: e.target.checked })} /> Enable player editing and custom draft classes</label>{plan.commissioner && <div className="mt-5 flex flex-col gap-4"><div className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-2 text-sm">Player<select className={control} value={selected?.id ?? ""} onChange={e => setEditId(e.target.value)}>{league.players.filter(p => p.teamId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="flex flex-col gap-2 text-sm">Attribute<select className={control} value={attribute} onChange={e => setAttribute(e.target.value as keyof GmAttributes)}>{Object.keys(selected?.sheet?.attributes ?? {}).map(key => <option key={key} value={key}>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</option>)}</select></label><label className="flex flex-col gap-2 text-sm">Rating<input className={`${control} w-20`} type="number" min={25} max={99} value={rating} onChange={e => setRating(Number(e.target.value))} /></label><button type="button" className={button} onClick={() => { if (selected) { editAttribute(selected.id, attribute, rating); setNote("Player updated. His abilities will apply in the next game."); } }}>Apply rating</button></div><p className="text-sm text-muted-foreground">Current rating: {selected?.sheet?.attributes[attribute] ?? "—"}. Commissioner edits affect this save.</p><div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={() => download(`draft-class-${league.season}.json`, JSON.stringify({ format: "franchise-lab-draft", players: league.players.filter(p => league.draftPool.includes(p.id)) }))}>Export draft class</button><label className={`${button} cursor-pointer`}>Import draft class<input type="file" className="sr-only" accept=".json,application/json" onChange={async e => { const input = e.currentTarget; const file = input.files?.[0]; if (!file) return; try { if (file.size > 5_000_000) throw new Error("Choose a draft class under 5 MB."); importClass(await file.text()); setNote("Draft class imported. Your scout will evaluate the new board."); } catch(error) { setNote(error instanceof Error ? error.message : "Could not import this class."); } finally { input.value = ""; } }} /></label></div></div>}</SectionFrame>
    </>}
  </div>;
}

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionFrame } from "@/components/layout/section-frame";
import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { draftControl } from "@/gm/ui/gm-prospect-file";
import { useGmStore } from "@/gm/state/gm-store";
import { draftRead } from "@/gm/engine/draft-intel";
import { draftNightOffers } from "@/gm/engine/draft-room";
import { draftAssetCatalog, draftAssetKey, quoteDraftTrade, suggestDraftTrade, type DraftAsset, type DraftTradeProposal } from "@/gm/engine/draft-trades";
import type { GmLeagueState, GmPlayer } from "@/gm/types";

export function GmDraftTradeDesk({league,target,onComplete}:{league:GmLeagueState;target:GmPlayer|null;onComplete:()=>void}){
  const makeTrade=useGmStore(state=>state.makeDraftTrade);
  const slots=(league.draftOrder??[]).map((owner,slot)=>({owner,slot})).filter(row=>row.slot>=(league.draftPickIndex??0)&&row.owner!==league.userTeamId);
  const [slot,setSlot]=useState(slots[0]?.slot??-1),[send,setSend]=useState<DraftAsset[]>([]),[extras,setExtras]=useState<DraftAsset[]>([]),[note,setNote]=useState("");
  const owner=league.draftOrder?.[slot]??"",partner=league.teams.find(team=>team.id===owner);
  const own=draftAssetCatalog(league,league.userTeamId),their=draftAssetCatalog(league,owner).filter(row=>row.asset.kind!=="slot"||row.asset.slot!==slot);
  const proposal:DraftTradeProposal={fromTeamId:league.userTeamId,toTeamId:owner,clockIndex:league.draftPickIndex??0,send,receive:[{kind:"slot",slot},...extras],targetPlayerId:target?.id};
  const quote=quoteDraftTrade(league,proposal);
  const offers=useMemo(()=>draftNightOffers(league).filter(offer=>offer.direction==="down"),[league]);
  const labels=(assets:DraftAsset[],rows:ReturnType<typeof draftAssetCatalog>)=>assets.map(asset=>rows.find(row=>row.key===draftAssetKey(asset))?.label??"Unavailable asset");
  const toggle=(asset:DraftAsset,values:DraftAsset[],set:(values:DraftAsset[])=>void)=>set(values.some(row=>draftAssetKey(row)===draftAssetKey(asset))?values.filter(row=>draftAssetKey(row)!==draftAssetKey(asset)):[...values,asset]);
  const accept=(offer:DraftTradeProposal)=>{const result=makeTrade(offer);setNote(result.reason);if(result.ok)onComplete();};
  return <div className="flex min-w-0 flex-col gap-6" data-testid="draft-trade-desk">
    {offers.length?<SectionFrame title="Clubs calling for your pick"><div className="grid gap-3 lg:grid-cols-3">{offers.map(offer=><div key={offer.id} className="rounded-xl border border-border p-4"><h3 className="font-bold">{league.teams.find(team=>team.id===offer.partnerTeamId)?.abbr} wants to move up</h3><p className="mt-3 text-sm">You send {offer.youSend.join(", ")}.</p><p className="mt-2 text-sm">You receive {offer.youGet.join(", ")}.</p><div className="mt-4"><GmConfirmAction label="Review and accept" title="Accept this draft-night deal?" confirmLabel="Accept trade" onConfirm={()=>accept(offer.proposal)}><p>You send {offer.youSend.join(", ")}.</p><p>You receive {offer.youGet.join(", ")}. Your target can be selected before your new pick.</p></GmConfirmAction></div></div>)}</div></SectionFrame>:null}
    <SectionFrame title="Explore a pick" description="Choose any remaining selection. Use tonight's picks, futures, unsigned draft rights or players. Salary and future-pick rules apply to both clubs.">
      <div className="flex flex-wrap items-end gap-3"><label className="flex min-w-0 flex-col gap-2 text-sm">Target pick<select aria-label="Target draft pick" className={draftControl} value={slot} onChange={event=>{setSlot(Number(event.target.value));setSend([]);setExtras([]);setNote("");}}>{slots.map(row=><option key={row.slot} value={row.slot}>#{row.slot+1} · {league.teams.find(team=>team.id===row.owner)?.abbr}</option>)}</select></label><Button className="min-h-11" variant="outline" disabled={!partner} onClick={()=>{const suggested=suggestDraftTrade(league,league.userTeamId,owner,slot,target?.id);if(suggested){setSend(suggested.send);setExtras([]);setNote("A pick and rights package is available. Review every asset before confirming.");}else setNote("No simple pick package meets the price and rules. Customize the deal or target a later pick.");}}>Suggest a package</Button></div>
      {target?<p className="mt-3 text-sm">Watching <strong>{target.name}</strong>. Consensus #{draftRead(league,target).marketRank}; acquiring pick #{slot+1} does not reserve the player.</p>:null}
      {note?<p role="status" className="mt-3 text-sm">{note}</p>:null}
      <div className="mt-5 grid gap-4 md:grid-cols-2"><AssetChoices title="You send" rows={own} selected={send} onToggle={asset=>toggle(asset,send,setSend)}/><div><h3 className="text-sm font-semibold">You receive</h3><p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm font-semibold">Pick #{slot+1} from {partner?.abbr??"another club"}</p><details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Add other assets from this club</summary><AssetChoices title="Additional return" rows={their} selected={extras} onToggle={asset=>toggle(asset,extras,setExtras)}/></details></div></div>
      <div className="mt-5 rounded-xl border border-border p-4" aria-label="Draft trade assessment"><p className="font-semibold">{quote.reason}</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{quote.rationale.map(line=><li key={line}>{line}</li>)}</ul><div className="mt-4"><GmConfirmAction label="Review draft trade" title="Confirm this draft-night package?" confirmLabel="Confirm draft trade" disabled={!quote.accepted} onConfirm={()=>accept(proposal)}><p>You send {labels(send,own).join(", ")}.</p><p>You receive pick #{slot+1}{extras.length?", "+labels(extras,their).join(", "):""}.</p><p>Ownership and salary rules are checked again at confirmation. The draft clock does not advance.</p></GmConfirmAction></div></div>
    </SectionFrame>
  </div>;
}
function AssetChoices({title,rows,selected,onToggle}:{title:string;rows:ReturnType<typeof draftAssetCatalog>;selected:DraftAsset[];onToggle:(asset:DraftAsset)=>void}){
  return <fieldset className="min-w-0"><legend className="mb-3 text-sm font-semibold">{title}</legend><div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border p-3">{rows.map(row=><label key={row.key} className="flex min-h-11 items-start gap-3 py-1 text-sm"><input type="checkbox" className="mt-1 shrink-0" disabled={!row.available} checked={selected.some(asset=>draftAssetKey(asset)===row.key)} onChange={()=>onToggle(row.asset)}/><span className="min-w-0 break-words">{row.label}{row.reason?<span className="mt-1 block text-xs text-muted-foreground">{row.reason}</span>:null}</span></label>)}{!rows.length?<p className="text-sm text-muted-foreground">No available assets.</p>:null}</div></fieldset>;
}

"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmDraftWarRoom } from "@/gm/ui/gm-draft-war-room";
import { GmDraftResults } from "@/gm/ui/gm-draft-results";
import { useGmStore } from "@/gm/state/gm-store";
import { shouldShowDraftResults } from "@/gm/engine/draft-room";

export default function GmDraftPage(){return <GmShell><DraftBody/></GmShell>;}
function DraftBody(){
  const league=useGmStore(state=>state.league);
  if(!league)return null;
  return shouldShowDraftResults(league)?<GmDraftResults league={league}/>:<GmDraftWarRoom/>;
}

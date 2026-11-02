"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useGmStore } from "@/gm/state/gm-store";
import { seasonJourney } from "@/gm/lib/season-journey";

export function GmSeasonJourney() {
  const league = useGmStore(state => state.league);
  const pathname = usePathname();
  if (!league || pathname === "/gm/offseason" || league.teamBuildingCheckpoint || league.scoutingFocusPrompt) return null;
  const journey = seasonJourney(league);
  const attention = journey.tasks.find(task => task.required);
  if (!attention || (pathname === "/gm" && league.seasonFlow?.stage)) return null;
  return <aside aria-label="Current season stage" className="gm-stage-rail">
    <div className="min-w-0">
      <p className="gm-stage-rail__eyebrow">Action needed</p>
      <p className="gm-stage-rail__title">{attention.label}</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Link href={attention.href || "/gm/offseason"} className="gm-stage-rail__action">Review <ArrowUpRight aria-hidden="true" size={15}/></Link>
    </div>
  </aside>;
}

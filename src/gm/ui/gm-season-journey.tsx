"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGmStore } from "@/gm/state/gm-store";
import { seasonJourney } from "@/gm/lib/season-journey";

export function GmSeasonJourney() {
  const league = useGmStore(state => state.league);
  const pathname = usePathname();
  if (!league || pathname === "/gm/offseason" || (pathname === "/gm" && league.seasonFlow?.stage)) return null;
  const journey = seasonJourney(league);
  return <aside aria-label="Current season stage" className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3 text-sm">
    <div className="min-w-0"><p><strong>{journey.title}</strong><span className="text-muted-foreground"> · Next: {journey.next}</span></p><p className="mt-1 text-xs text-muted-foreground">{journey.tasks.find(task => task.required)?.label ?? journey.description}</p></div>
    <Link href="/gm/offseason" className="shrink-0 font-semibold underline underline-offset-4">Open season hub</Link>
  </aside>;
}

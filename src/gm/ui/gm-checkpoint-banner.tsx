"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";

/** Pause on trade deadline, All-Star, season end, or free-agency open. */
export function GmCheckpointBanner() {
  const league = useGmStore((s) => s.league);
  const pauseForTeamBuilding = useGmStore((s) => s.pauseForTeamBuilding);
  const continuePastCheckpoint = useGmStore((s) => s.continuePastCheckpoint);

  const checkpoint = league?.teamBuildingCheckpoint;
  if (!checkpoint) return null;

  return (
    <section className="rounded-xl border border-sky-500/50 bg-sky-500/10 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{checkpoint.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{checkpoint.body}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The sim stays paused until you stay and manage, or continue.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={() => pauseForTeamBuilding()}>
            Stay and manage
          </Button>
          <Link
            href={checkpoint.primaryHref}
            onClick={() => pauseForTeamBuilding()}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary"
          >
            {checkpoint.primaryLabel}
          </Link>
          {checkpoint.secondaryHref && checkpoint.secondaryLabel ? (
            <Link
              href={checkpoint.secondaryHref}
              onClick={() => pauseForTeamBuilding()}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary"
            >
              {checkpoint.secondaryLabel}
            </Link>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => continuePastCheckpoint()}>
            Continue
          </Button>
        </div>
      </div>
    </section>
  );
}

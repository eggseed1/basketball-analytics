import { Suspense } from "react";

import { TeamMovementIsland } from "@/components/teams/team-movement-island";
import { TeamSentimentIsland } from "@/components/teams/team-sentiment-island";
import { getTeamMovementFeed } from "@/data/queries/movement-center.server";
import { getTeamSentimentBoard } from "@/data/queries/team-sentiment";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/** Fan and media tone plus unresolved movement reporting for one franchise. */
export async function TeamSentimentTab({ teamId }: { teamId: string }) {
  const board = getTeamSentimentBoard(teamId);
  const movement = await getTeamMovementFeed(teamId, { activeOnly: true }).catch(() => null);
  if (!board && !movement?.length) {
    return (
      <section className="flex flex-col gap-1" aria-label="Sentiment">
        <h2 className="text-[20px] font-bold tracking-tight">Sentiment</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No fan or media tone and no open movement reports for this franchise right now.
        </p>
      </section>
    );
  }
  return (
    <div data-motion-stack className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <TeamSentimentIsland teamId={teamId} />
      </Suspense>
      <Suspense fallback={null}>
        <TeamMovementIsland teamId={teamId} />
      </Suspense>
    </div>
  );
}

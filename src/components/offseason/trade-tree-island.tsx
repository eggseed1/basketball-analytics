import { Suspense } from "react";

import { buildTeamTradeTree } from "@/data/queries/team-trade-tree";
import { TradeTreePrompt, TradeTreeView } from "@/components/offseason/trade-tree-view";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function TradeTreeFallback() {
  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-busy>
      <div>
        <h2 className={cn(type.title, "tracking-tight")}>Trade tree</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Looking up how this franchise acquired that player…
        </p>
      </div>
      <div className="h-56 animate-pulse rounded-md bg-foreground/[0.04]" />
    </section>
  );
}

async function TradeTreeLoaded({
  teamId,
  rootEventId,
  focusPlayer,
  offseasonYear,
  teams,
}: {
  teamId: string;
  rootEventId?: string;
  focusPlayer?: string;
  offseasonYear: number;
  teams: Array<{ id: string; label: string }>;
}) {
  const tree = await buildTeamTradeTree({
    teamId,
    rootEventId,
    focusPlayer,
  }).catch(() => null);
  if (!tree) {
    return (
      <section className="sports-card p-4 sm:p-5">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Could not build a trade tree for this team right now.
        </p>
      </section>
    );
  }
  return (
    <TradeTreeView
      tree={tree}
      offseasonYear={offseasonYear}
      teams={teams}
    />
  );
}

export function TradeTreeIsland({
  teamId,
  rootEventId,
  focusPlayer,
  offseasonYear,
  teams,
}: {
  teamId?: string;
  rootEventId?: string;
  focusPlayer?: string;
  offseasonYear: number;
  teams: Array<{ id: string; label: string }>;
}) {
  if (!teamId) {
    return <TradeTreePrompt teams={teams} offseasonYear={offseasonYear} />;
  }

  return (
    <Suspense fallback={<TradeTreeFallback />}>
      <TradeTreeLoaded
        teamId={teamId}
        rootEventId={rootEventId}
        focusPlayer={focusPlayer}
        offseasonYear={offseasonYear}
        teams={teams}
      />
    </Suspense>
  );
}

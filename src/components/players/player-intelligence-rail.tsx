"use client";

import { useState } from "react";

import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { MovementRumorPanel } from "@/components/players/movement-rumor-panel";
import { PlayerSentimentGraph } from "@/components/players/player-sentiment-graph";
import type { PlayerMovementBundle } from "@/movement-center/types";
import type { PlayerSentimentProfile } from "@/sentiment/curated-types";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type IntelligenceTab = "sentiment" | "rumor";

const TABS: { id: IntelligenceTab; label: string }[] = [
  { id: "sentiment", label: "Sentiment" },
  { id: "rumor", label: "Rumor Mill" },
];

export function PlayerIntelligenceRail({
  playerId,
  playerName,
  teamKey,
  movementBundle,
  sentimentProfile,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  movementBundle?: PlayerMovementBundle | null;
  sentimentProfile?: (PlayerSentimentProfile & { disclaimer: string }) | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const [tab, setTab] = useState<IntelligenceTab>("sentiment");
  const modernBrand = resolveTeamBrand(teamKey);
  const wash = brandAtmosphereColors(
    historicalBrand?.palette?.primary ?? modernBrand?.primary,
    historicalBrand?.palette?.secondary ?? modernBrand?.secondary
  );

  return (
    <GlassSurface
      accentColor={wash?.colorA}
      accentColorB={wash?.colorB}
      className="relative min-w-0 p-0"
      effect="css"
      honor={honor}
    >
      <div className="relative z-[1] flex w-full flex-col gap-2.5 px-3 py-2.5">
        <div
          role="tablist"
          aria-label="Live intelligence"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/70 pb-2"
        >
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={cn(
                  type.caption,
                  "px-1.5 py-0.5 font-bold tracking-tight",
                  selected
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" hidden={tab !== "sentiment"}>
          <PlayerSentimentGraph
            playerName={playerName}
            profile={sentimentProfile}
          />
        </div>

        <div role="tabpanel" hidden={tab !== "rumor"}>
          <MovementRumorPanel
            playerId={playerId}
            playerName={playerName}
            bundle={movementBundle}
          />
        </div>
      </div>
    </GlassSurface>
  );
}

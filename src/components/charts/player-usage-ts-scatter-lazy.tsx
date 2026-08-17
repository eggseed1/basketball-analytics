"use client";

import dynamic from "next/dynamic";

import type { PlayerSeason } from "@/data/types";

const PlayerUsageTsScatterInner = dynamic(
  () =>
    import("@/components/charts/player-usage-ts-scatter").then((m) => ({
      default: m.PlayerUsageTsScatter,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/40" />
    ),
  }
);

export function PlayerUsageTsScatterLazy({
  players,
}: {
  players: PlayerSeason[];
}) {
  return <PlayerUsageTsScatterInner players={players} />;
}

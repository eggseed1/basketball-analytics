"use client";

import Link from "next/link";

import { PlayerShotMapView } from "@/components/players/player-shot-map";
import { GlassSurface } from "@/components/brand/glass-surface";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { playerSeasonShotIndexToMap } from "@/lib/player-season-shot-map-adapter";
import type { PlayerSeasonShotIndex } from "@/data/history/player-season-shots";

export type PlayerSeasonCourtShot = {
  gameId: string;
  eventId: string;
  x: number;
  y: number;
  made: boolean;
  shotValue: 2 | 3;
  period: number;
  clock: string;
  zone: string;
  season: string;
};

/**
 * Season court — Hannah PlayerShotMapView visuals + P18 shot index data.
 */
export function PlayerSeasonCourtChart({
  shots,
  coverageLabel,
  shotIndex = null,
  teamLabel = "—",
  season,
  playerName,
}: {
  shots: PlayerSeasonCourtShot[];
  coverageLabel: string;
  shotIndex?: PlayerSeasonShotIndex | null;
  teamLabel?: string;
  season: string;
  playerName?: string;
}) {
  const index: PlayerSeasonShotIndex | null =
    shotIndex ??
    (shots.length
      ? {
          playerId: "",
          season,
          boxFga: shots.length,
          shotEvents: shots.length,
          coordinateShots: shots.length,
          coverage: 1,
          shots: shots.map((s) => ({
            gameId: s.gameId,
            eventId: s.eventId,
            x: s.x,
            y: s.y,
            made: s.made,
            shotValue: s.shotValue,
            period: s.period,
            clock: s.clock,
            zone: s.zone,
          })),
        }
      : null);

  const map = playerSeasonShotIndexToMap({
    index,
    season,
    teamLabel,
  });

  return (
    <div className="flex flex-col gap-3">
      <GlassSurface effect="css" className="glass-text-scrim px-3 py-2">
        <p className={cn(type.caption, "font-semibold text-foreground")}>
          {playerName ? `${playerName} · ` : ""}
          Season shot chart
        </p>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {coverageLabel}
        </p>
      </GlassSurface>
      <PlayerShotMapView map={map} />
      {shots.length > 0 ? (
        <details className="sports-card glass-text-scrim p-3">
          <summary className={cn(type.caption, "cursor-pointer font-semibold")}>
            Shot table alternative ({shots.length} coordinate shots)
          </summary>
          <div className="mt-2 max-h-48 overflow-auto">
            <table className={cn(type.caption, "w-full min-w-[28rem] text-left")}>
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="px-2 py-1">Game</th>
                  <th className="px-2 py-1">Zone</th>
                  <th className="px-2 py-1 text-right">Result</th>
                  <th className="px-2 py-1 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {shots.slice(0, 80).map((s) => (
                  <tr
                    key={`${s.gameId}-${s.eventId}`}
                    className="border-b border-border/40"
                  >
                    <td className="px-2 py-1">
                      <Link
                        href={`/games/${encodeURIComponent(s.gameId)}?season=${encodeURIComponent(s.season)}`}
                        prefetch={false}
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        {s.gameId}
                      </Link>
                    </td>
                    <td className="px-2 py-1">{s.zone}</td>
                    <td className="px-2 py-1 text-right">
                      {s.made ? "Make" : "Miss"}
                    </td>
                    <td className="px-2 py-1 text-right">{s.shotValue}PT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

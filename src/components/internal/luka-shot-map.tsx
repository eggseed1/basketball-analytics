"use client";

import {
  PlayerShotMapView,
} from "@/components/players/player-shot-map";
import type { LukaShotMap } from "@/data/queries/luka-shots";

export function LukaShotMapView({ map }: { map: LukaShotMap }) {
  return <PlayerShotMapView map={map} />;
}

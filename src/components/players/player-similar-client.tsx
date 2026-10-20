"use client";

import { useEffect, useState } from "react";

import {
  PlayerContextStrip,
  type SimilarPlayerMode,
} from "@/components/players/player-context-strip";
import type { PercentileMetric } from "@/lib/player-percentile-metrics";
import type { StatComp } from "@/lib/player-stat-comps";

const SIMILAR_MODE_ORDER = [
  "r1WinEquivalents",
  "drbl100",
  "darko",
  "raptor",
  "bpm",
  "ts",
  "usg",
] as const;

function modesFromPayload(body: {
  metrics?: PercentileMetric[];
  profileComps?: StatComp[];
  profileHistoricalComps?: StatComp[];
}): SimilarPlayerMode[] {
  const modes: SimilarPlayerMode[] = [];
  const profileComps = body.profileComps ?? [];
  const profileHistoricalComps = body.profileHistoricalComps ?? [];
  if (profileComps.length || profileHistoricalComps.length) {
    modes.push({
      id: "profile",
      label: "Profile",
      leagueComps: profileComps,
      historicalComps: profileHistoricalComps,
    });
  }
  for (const id of SIMILAR_MODE_ORDER) {
    const m = (body.metrics ?? []).find((row) => row.id === id);
    if (!m) continue;
    if (!m.leagueComps.length && !m.historicalComps.length) continue;
    modes.push({
      id: m.id,
      label: m.label,
      leagueComps: m.leagueComps,
      historicalComps: m.historicalComps,
    });
  }
  return modes;
}

export function PlayerSimilarClient({
  playerId,
  season,
  espnId,
  focalCompareId,
  compareHref,
}: {
  playerId: string;
  season: string;
  espnId?: string | null;
  focalCompareId: string;
  compareHref: string;
}) {
  const [modes, setModes] = useState<SimilarPlayerMode[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setModes(null);
    setFailed(false);
    const params = new URLSearchParams({
      season,
      mode: "fast",
      comps: "1",
    });
    if (espnId) params.set("espnId", espnId);
    fetch(
      `/api/players/${encodeURIComponent(playerId)}/percentiles?${params}`
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{
          metrics?: PercentileMetric[];
          profileComps?: StatComp[];
          profileHistoricalComps?: StatComp[];
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        const next = modesFromPayload(body);
        if (!next.length) setFailed(true);
        else setModes(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [espnId, playerId, season]);

  if (failed) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Similar players did not load for this season.
      </p>
    );
  }

  if (!modes) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Loading similar players…
      </p>
    );
  }

  return (
    <PlayerContextStrip
      modes={modes}
      defaultModeId="profile"
      focalPlayerId={focalCompareId}
      season={season}
      compareHref={compareHref}
    />
  );
}

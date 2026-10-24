"use client";

import { useEffect, useState } from "react";

import {
  PlayerContextStrip,
  type SimilarPlayerMode,
} from "@/components/players/player-context-strip";
import {
  fetchSimilarModes,
  peekSimilarModes,
  type SimilarModesPayload,
} from "@/lib/player-comparisons-fetch";
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

function modesFromPayload(body: SimilarModesPayload): SimilarPlayerMode[] {
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
    const m = (body.metrics ?? []).find((row: PercentileMetric) => row.id === id);
    if (!m) continue;
    if (!(m.leagueComps?.length || m.historicalComps?.length)) continue;
    modes.push({
      id: m.id,
      label: m.label,
      leagueComps: (m.leagueComps ?? []) as StatComp[],
      historicalComps: (m.historicalComps ?? []) as StatComp[],
    });
  }
  return modes;
}

type CacheHit = SimilarPlayerMode[] | null | "failed" | "empty";

function modesFromCache(options: {
  playerId: string;
  season: string;
  espnId?: string | null;
}): CacheHit {
  const peeked = peekSimilarModes(options);
  if (peeked === undefined) return null;
  if (!peeked) return "failed";
  const modes = modesFromPayload(peeked);
  return modes.length ? modes : "empty";
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
  const [modes, setModes] = useState<SimilarPlayerMode[] | null>(() => {
    const cached = modesFromCache({ playerId, season, espnId });
    return Array.isArray(cached) ? cached : null;
  });
  const [status, setStatus] = useState<"ok" | "loading" | "failed" | "empty">(
    () => {
      const cached = modesFromCache({ playerId, season, espnId });
      if (Array.isArray(cached)) return "ok";
      if (cached === "failed") return "failed";
      if (cached === "empty") return "empty";
      return "loading";
    }
  );

  useEffect(() => {
    let cancelled = false;
    const cached = modesFromCache({ playerId, season, espnId });
    if (cached === "failed") {
      setModes(null);
      setStatus("failed");
      return;
    }
    if (cached === "empty") {
      setModes(null);
      setStatus("empty");
      return;
    }
    if (cached) {
      setModes(cached);
      setStatus("ok");
      return;
    }
    setModes(null);
    setStatus("loading");
    void fetchSimilarModes({ playerId, season, espnId }).then((body) => {
      if (cancelled) return;
      if (!body) {
        setStatus("failed");
        return;
      }
      const next = modesFromPayload(body);
      if (!next.length) {
        setStatus("empty");
        return;
      }
      setModes(next);
      setStatus("ok");
    });
    return () => {
      cancelled = true;
    };
  }, [espnId, playerId, season]);

  if (status === "failed") {
    return (
      <p className="text-[13px] text-muted-foreground">
        Similar players did not load for this season.
      </p>
    );
  }

  if (status === "empty") {
    return (
      <p className="text-[13px] text-muted-foreground">
        No close impact neighbors in the peer pool for this season.
      </p>
    );
  }

  if (status === "loading" || !modes) {
    return (
      <div
        data-skeleton
        className="loading-shimmer h-28 w-full rounded-lg"
        aria-busy="true"
        aria-label="Loading similar players"
      />
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

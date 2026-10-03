"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  LeaguePlayerScatterLazy,
  PlayerUsageEfficiencyLazy,
} from "@/components/charts/recharts-lazy";
import {
  VizChartWithLeaders,
  type VizLeaderRow,
} from "@/components/explore/viz-chart-with-leaders";
import { formatPct } from "@/lib/format";
import {
  leagueScatterRankValue,
  type LeagueScatterKind,
  type LeagueScatterPoint,
} from "@/lib/league-player-scatter";
import type { UsageEfficiencyPoint } from "@/lib/player-usage-efficiency";
import type { PlayerRaceRankEnd } from "@/lib/player-race-tracker";

const PIN_MAX = 12;

function parsePinIds(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, PIN_MAX);
}

function useVizPinToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pinIds = useMemo(
    () => parsePinIds(searchParams.get("pin")),
    [searchParams]
  );

  const togglePin = useCallback(
    (playerId: string) => {
      const next = pinIds.includes(playerId)
        ? pinIds.filter((id) => id !== playerId)
        : [...pinIds, playerId].slice(0, PIN_MAX);
      const params = new URLSearchParams(searchParams.toString());
      if (next.length) params.set("pin", next.join(","));
      else params.delete("pin");
      const qs = params.toString();
      router.replace(
        qs
          ? `/explore/players/visualizations?${qs}`
          : "/explore/players/visualizations"
      );
    },
    [pinIds, router, searchParams]
  );

  return { pinIds, togglePin };
}

function formatScatterLeaderValue(
  kind: LeagueScatterKind,
  point: LeagueScatterPoint
): string {
  const value = leagueScatterRankValue(kind, point);
  switch (kind) {
    case "impact":
    case "bpm":
      return value.toFixed(2);
    case "volume":
      return value.toFixed(1);
    case "defense":
      return value.toFixed(1);
    case "diet":
    case "creation":
    case "ft":
    case "glass":
    default:
      return `${value.toFixed(1)}%`;
  }
}

function sortLeadersByRank<T>(
  rows: T[],
  rankValue: (row: T) => number,
  rankEnd: PlayerRaceRankEnd
): T[] {
  const sorted = [...rows].sort((a, b) => {
    const av = rankValue(a);
    const bv = rankValue(b);
    if (av === bv) return 0;
    // "low" lists climb from the bottom; "high"/"both" show highest first.
    return rankEnd === "low" ? av - bv : bv - av;
  });
  return sorted;
}

export function LeagueUsageEfficiencyBoard({
  points,
  season,
  playerName,
  rankEnd,
  teamPlayerIds,
  highlightLabel = "pin",
}: {
  points: UsageEfficiencyPoint[];
  season: string;
  playerName?: string;
  rankEnd: PlayerRaceRankEnd;
  teamPlayerIds: string[];
  highlightLabel?: "you" | "pin";
}) {
  const { pinIds, togglePin } = useVizPinToggle();
  const teamSet = useMemo(() => new Set(teamPlayerIds), [teamPlayerIds]);

  const leaders = useMemo<VizLeaderRow[]>(() => {
    const ranked = sortLeadersByRank(
      points,
      (point) => point.usagePct,
      rankEnd
    );
    return ranked.map((point) => ({
      playerId: point.playerId,
      displayName: point.playerName,
      teamId: point.teamId,
      teamAbbr: point.teamAbbr,
      valueLabel: formatPct(point.usagePct),
      pinned: pinIds.includes(point.playerId),
      onTeam: teamSet.has(point.playerId),
    }));
  }, [pinIds, points, rankEnd, teamSet]);

  return (
    <VizChartWithLeaders
      rankEnd={rankEnd}
      leaders={leaders}
      onTogglePin={togglePin}
    >
      <PlayerUsageEfficiencyLazy
        points={points}
        season={season}
        playerName={playerName}
        highlightLabel={highlightLabel}
      />
    </VizChartWithLeaders>
  );
}

export function LeaguePlayerScatterBoard({
  kind,
  points,
  season,
  playerName,
  rankEnd,
  teamPlayerIds,
  highlightLabel = "pin",
}: {
  kind: LeagueScatterKind;
  points: LeagueScatterPoint[];
  season: string;
  playerName?: string;
  rankEnd: PlayerRaceRankEnd;
  teamPlayerIds: string[];
  highlightLabel?: "you" | "pin";
}) {
  const { pinIds, togglePin } = useVizPinToggle();
  const teamSet = useMemo(() => new Set(teamPlayerIds), [teamPlayerIds]);

  const leaders = useMemo<VizLeaderRow[]>(() => {
    const ranked = sortLeadersByRank(
      points,
      (point) => leagueScatterRankValue(kind, point),
      rankEnd
    );
    return ranked.map((point) => ({
      playerId: point.playerId,
      displayName: point.playerName,
      teamId: point.teamId,
      teamAbbr: point.teamAbbr,
      valueLabel: formatScatterLeaderValue(kind, point),
      pinned: pinIds.includes(point.playerId),
      onTeam: teamSet.has(point.playerId),
    }));
  }, [kind, pinIds, points, rankEnd, teamSet]);

  return (
    <VizChartWithLeaders
      rankEnd={rankEnd}
      leaders={leaders}
      onTogglePin={togglePin}
    >
      <LeaguePlayerScatterLazy
        kind={kind}
        points={points}
        season={season}
        playerName={playerName}
        highlightLabel={highlightLabel}
      />
    </VizChartWithLeaders>
  );
}

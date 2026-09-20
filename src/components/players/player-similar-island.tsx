import { GlassSurface } from "@/components/brand/glass-surface";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import {
  PlayerContextStrip,
  type SimilarPlayerMode,
} from "@/components/players/player-context-strip";
import { PlayerPanelUnavailable } from "@/components/players/player-page-skeletons";
import type { PlayerSeason } from "@/data/types";
import { loadPlayerPercentileMetrics } from "@/lib/player-percentile-load";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const SIMILAR_MODE_ORDER = [
  "r1WinEquivalents",
  "drbl100",
  "darko",
  "raptor",
  "bpm",
  "ts",
  "usg",
] as const;

/**
 * First-class Similar players section for the player page.
 * Reuses percentile comps + profile match — no new similarity model.
 */
export async function PlayerSimilarIsland({
  playerId,
  season,
  career,
  identityTeamKey,
  nbaId,
  espnId,
  honor,
}: {
  playerId: string;
  season: string;
  career: PlayerSeason[];
  identityTeamKey?: string | null;
  nbaId?: string | null;
  espnId?: string | null;
  honor?: GlassSurfaceHonor;
}) {
  const modes: SimilarPlayerMode[] = [];
  let statsSeason = season;
  let loadError: string | null = null;

  try {
    const loaded = await loadPlayerPercentileMetrics(
      playerId,
      season,
      career,
      identityTeamKey,
      { nbaId, espnId, mode: "full" }
    );
    const statsCtx = resolvePlayerStatsSeason(career, season);
    statsSeason = loaded.statsSeason ?? statsCtx.statsSeason ?? season;
    const metrics = loaded.metrics;
    const profileComps = loaded.profileComps ?? [];

    if (profileComps.length) {
      modes.push({
        id: "profile",
        label: "Profile",
        leagueComps: profileComps,
        historicalComps: [],
      });
    }
    for (const id of SIMILAR_MODE_ORDER) {
      const m = metrics.find((row) => row.id === id);
      if (!m) continue;
      if (!m.leagueComps.length && !m.historicalComps.length) continue;
      modes.push({
        id: m.id,
        label: m.label,
        leagueComps: m.leagueComps,
        historicalComps: m.historicalComps,
      });
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    console.error("[player-similar] failed", {
      playerId,
      season,
      error: loadError,
    });
  }

  if (loadError) {
    return (
      <PlayerPanelUnavailable
        label="Similar players unavailable"
        detail="Peer comps did not load for this season. Percentiles and career stats remain available above."
      />
    );
  }

  if (!modes.length) return null;

  const focalCompareId = espnId || playerId;
  const compareHref = `/compare?a=${encodeURIComponent(focalCompareId)}&season=${encodeURIComponent(statsSeason)}`;

  return (
    <GlassSurface
      as="section"
      honor={honor}
      className="flex flex-col gap-3 p-4 sm:p-5"
    >
      <div>
        <h2 className={cn(type.heading, "tracking-tight")}>Similar players</h2>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          Closest {statsSeason} profiles and nearest comps by metric — not a new
          rating. Switch chips to change the lens.
        </p>
      </div>
      <PlayerContextStrip
        modes={modes}
        defaultModeId="profile"
        focalPlayerId={focalCompareId}
        season={statsSeason}
        compareHref={compareHref}
      />
    </GlassSurface>
  );
}
